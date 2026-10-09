// =============================================================================
// minigames/wiring.js — ĐI DÂY: cắt dây từ cuộn, tuốt, bấm cos, lắp cos vào vỏ JST, cắm/rút đầu nối, dây Dupont 2 đầu,
// cầu đấu vít. Dây là đường cong 3D (Catmull-Rom võng theo trọng lực) nối 2 điểm gắn thật trên mạch.
//
//   game.wiring = new Wiring(game)
//
// THAO TÁC (Vietnamese UI):
//   • Cuộn dây (wire-spool-*) cầm trên tay: [B] cắt N mm (cuộn chuột chỉnh — có sẵn ở part def) → đoạn dây vào TÚI (Tab).
//     Kìm cắt (flush-cutter) nhắm vào cuộn dây trên bàn + chuột trái → cắt đoạn dài `cutLen` (cuộn chuột khi cầm kìm cắt = chỉnh).
//     Kìm cắt nhắm vào đầu một đoạn dây → cắt bỏ đầu hỏng (cos bấm hỏng / tuốt đứt sợi).
//   • Kìm tuốt (wire-stripper): đặt đoạn dây lên bàn, nhắm vào ĐẦU dây, giữ chuột trái (R/cuộn = chọn khấc AWG, dây 22 AWG).
//   • Kìm bấm cos (crimper): nhắm vào đầu dây ĐÃ tuốt, giữ chuột trái hết hành trình → đầu cos JST-XH.
//   • Cầm dây (jumper Dupont hoặc đoạn dây): [Chuột trái] lên lỗ breadboard / chân header / chân linh kiện / pad / lỗ cầu đấu /
//     lỗ vỏ JST → cắm ĐẦU A; [Chuột trái] lần 2 → cắm ĐẦU B — dây rời tay, nằm võng giữa 2 điểm.
//     Đầu ĐỰC → lỗ breadboard, header cái, pad, cầu đấu · Đầu CÁI → chân đực (header, chân linh kiện)
//     Đầu dây TUỐT → lỗ breadboard, pad (cần hàn), cầu đấu vít (cần SIẾT vít bằng tua vít — cuộn chuột), quấn vào chân linh kiện
//     Đầu đã BẤM COS → lỗ vỏ JST (jst-xh-N-shell) — vỏ cắm vào đầu đực JST-XH 1 chiều (gờ khoá).
//     Đang cắm dở (mới đầu A) mà thả (G) / đặt (E) → dây nằm lại, đầu B thả tự do.
//   • Nhìn vào dây đã đi: [E] rút dây (cầm lên tay) · [R] đổi màu.
// Sự kiện phát: 'wire:connected' {a, b, item, atts} · 'wire:removed' {item, a, b} · 'wire:piece' {item} · 'wire:stripped'
//   'wire:crimped' · 'cable:changed' (netlist dựng lại). Nghe: 'wire:cut' (part action), 'cut' (kìm cắt), 'wire:strip',
//   'wire:crimp', 'item:picked/dropped/placed/stashed/removed', 'socket:inserted/removed', 'screw:driven'.
// Def tạo lúc chạy (game.items.register): 'wire-piece' (đoạn dây), 'jst-xh-2|3|4-shell' (vỏ JST rỗng).
// Bổ sung lúc chạy cho def có sẵn (không sửa file): jumper-wire-*.actions += [LMB cắm đầu dây]; flush-cutter.tool.onScroll/hud.
// API: placeEnd(item, 'A'|'B', att) · connect(item, attA, attB) · unlay(item) · spawnPiece({color, awg, lengthMm}) · cables()
// =============================================================================
import * as THREE from 'three';
import { PM, wireMat, gBox, ud } from '../items/parts/_shared.js';
import { isCable, pinsOf, itemOf } from './netlist.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const HL = 14;                              // thân đầu Dupont
const XH_PITCH = 2.5;
const COLOR_VI = { red: 'đỏ', black: 'đen', yellow: 'vàng', green: 'xanh lá', blue: 'xanh dương', white: 'trắng', orange: 'cam', brown: 'nâu', grey: 'xám', purple: 'tím' };
const COLORS = ['red', 'black', 'yellow', 'green', 'blue', 'white', 'orange', 'brown', 'grey', 'purple'];
const AWG_R = { 22: 0.8, 24: 0.65, 26: 0.65 };

// ============================================================================= def: đoạn dây
const PIECE_SPAN = 140;
function piecePins(st = {}) {
  const L = st.lengthMm ?? 150;
  const S = Math.min(L, PIECE_SPAN) / 2;
  const r = AWG_R[st.awg ?? 22] ?? 0.8;
  return [
    { id: 'A', name: 'đầu A', pos: [-S, r, 0], dir: [-1, 0, 0], wireEnd: true },
    { id: 'B', name: 'đầu B', pos: [S, r, 0], dir: [1, 0, 0], wireEnd: true },
  ];
}
function endTypeOf(inst, end) {
  const d = inst.def;
  if (d.ends) return d.ends[end];                        // jumper Dupont: 'male' | 'female'
  const st = inst.state || {};
  if (st.crimp?.[end === 'A' ? 0 : 1]) return 'crimp';
  if ((st.strip?.[end === 'A' ? 0 : 1] || 0) > 0) return 'bare';
  return 'insulated';
}
const TYPE_VI = { male: 'đầu ĐỰC', female: 'đầu CÁI', bare: 'đầu dây tuốt', crimp: 'đầu cos JST', insulated: 'đầu dây (chưa tuốt)' };
const KINDS = {
  male: { bb: true, hf: true, pad: true, screw: true },
  female: { pin: true },
  bare: { bb: true, pad: true, screw: true, pin: true, hf: true },
  crimp: { shell: true },
  insulated: null,
};

function buildPieceVisual(root, st) {
  for (const c of [...root.children]) { root.remove(c); c.geometry?.dispose?.(); }
  const L = st.lengthMm ?? 150, awg = st.awg ?? 22, r = AWG_R[awg] ?? 0.8;
  const S = Math.min(L, PIECE_SPAN) / 2;
  const mat = wireMat(st.color || 'red');
  const strip = st.strip || [0, 0], crimp = st.crimp || [null, null];
  const pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector3(-S + 2 * S * t, r, Math.sin(Math.PI * t) * Math.min(12, (L - 2 * S) * 0.02 + 4))); }
  const shift = (k) => (k === 0 ? strip[0] : -strip[1]);
  pts[0].x += shift(0); pts[12].x += shift(1);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, r, 8, false), mat);
  tube.castShadow = true;
  root.add(tube);
  if (L > PIECE_SPAN + 20) {        // phần dư cuộn tròn ở giữa
    const loops = Math.min(6, Math.ceil((L - PIECE_SPAN) / 120));
    for (let k = 0; k < loops; k++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(16, r, 6, 32), mat);
      t.rotation.x = Math.PI / 2; t.position.set(k * 1.2, r + k * r * 1.6, 8);
      root.add(t);
    }
  }
  [[-S, -1, 0], [S, 1, 1]].forEach(([x, s, i]) => {
    if (strip[i] > 0) {
      const cu = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, strip[i], 8), st.nicked?.[i] ? PM.solder : PM.copper);
      cu.rotation.z = Math.PI / 2; cu.position.set(x - s * strip[i] / 2 + s * strip[i], r, 0);
      cu.position.x = x + (s > 0 ? -strip[i] / 2 : strip[i] / 2);
      root.add(cu);
    }
    if (crimp[i]) {
      const c = new THREE.Mesh(gBox(1.2, 1.1, 6.5), PM.solder);
      c.position.set(x + s * 1.5, r, 0);
      root.add(c);
    }
  });
}

function pieceDef() {
  const def = {
    id: 'wire-piece', name: 'Đoạn dây 22 AWG', kind: 'part', category: 'wire', lessonId: 'ban-thi-nghiem-dien', hidden: true, generated: true, cable: true,
    massG: 2, size: [PIECE_SPAN, 3, 24],
    grip: { pose: 'pinch', offset: [-40, 1, 0], rot: [0, 0, 0] },
    pins: piecePins({}),
    insertInto: [],
    mount: { seatY: 0 },
    props: { awg: 22, ohmPerM: 0.053, maxA: 7 },
    electrical: { type: 'wire', ohmPerM: 0.053, maxA: 7, internal: [['A', 'B']] },
    desc: 'Đoạn dây UL1007 22 AWG cắt từ cuộn. Tuốt 2 đầu (kìm tuốt, khấc 22), bấm cos JST nếu cần, rồi cầm lên và chuột trái để cắm từng đầu.',
    build() {
      const root = new THREE.Group();
      root.name = 'wire-piece';
      const vis = new THREE.Group();
      vis.name = 'wire-piece-visual';
      root.add(vis);
      ud(root, 'vis', vis);
      root.userData.awg = 22;
      buildPieceVisual(vis, {});
      return root;
    },
    init(inst) {
      const st = inst.state;
      st.color ??= 'red'; st.awg ??= 22; st.lengthMm ??= 150;
      st.strip ??= [0, 0]; st.crimp ??= [null, null]; st.nicked ??= [false, false];
      def.refresh(inst);
    },
    refresh(inst) {
      const vis = inst.object.userData.vis;
      if (vis) buildPieceVisual(vis, inst.state);
      inst.object.userData.awg = inst.state.awg ?? 22;
    },
    getPins(inst) { return piecePins(inst?.state || {}); },
    setColor(inst, c) { inst.state.color = c; def.refresh(inst); return { ok: true }; },
  };
  def.name = 'Đoạn dây 22 AWG';
  return def;
}

// ============================================================================= def: vỏ JST-XH rỗng
function shellDef(n) {
  const A = (n - 1) * XH_PITCH + 4.9 - 1.45, Dd = 5.75 - 1.5, H = 9.8;
  // chân 1 ở phía +X (đúng đánh số JST thật, khớp đầu đực CAD)
  const xs = Array.from({ length: n }, (_, i) => ((n - 1) / 2 - i) * XH_PITCH);
  const pins = xs.map((x, i) => ({ id: `C${i + 1}`, name: `${i + 1}`, pos: [x, 0, 0], dir: [0, -1, 0], contact: true, mates: String(i + 1) }));
  const cream = new THREE.MeshStandardMaterial({ color: 0xeae2c8, roughness: 0.6 });
  const def = {
    id: `jst-xh-${n}-shell`, name: `Vỏ JST-XH ${n} chân (rỗng, lắp cos)`, kind: 'part', category: 'connector', lessonId: 'pack-4s-bms', generated: true,
    massG: 0.3 + n * 0.05, size: [A + 1, H, Dd + 1],
    grip: { pose: 'pinch', offset: [0, H * 0.6, 0], rot: [0, 0, 0] },
    pins, jst: n, jstShell: n,
    insertInto: [`jst-xh-${n}`],
    mount: { seatY: 0 },
    orientationKey: { pin: 'C1', axis: 'z', sign: 1, mark: 'lock-ramp', note: 'Gờ khoá ở mặt +Z' },
    electrical: { type: 'connector', ratingA: 3 },
    desc: `Vỏ cái XHP-${n}: luồn đầu cos đã bấm vào từng lỗ (nghe "tách"), rồi cắm vào đầu đực JST-XH ${n} chân — chỉ vào 1 chiều.`,
    build() {
      const root = new THREE.Group();
      root.name = def.id;
      const body = new THREE.Mesh(gBox(A, H, Dd, 0.25, 1), cream);
      body.position.y = H / 2; body.castShadow = true;
      root.add(body);
      const ramp = new THREE.Mesh(gBox(2.0, 2.4, 0.75), cream);
      ramp.position.set(0, 4.8, Dd / 2 + 0.37);
      root.add(ramp);
      for (const x of xs) {
        const hole = new THREE.Mesh(gBox(1.4, 0.05, 1.4), PM.hole);
        hole.position.set(x, H + 0.02, 0);
        root.add(hole);
      }
      const stubs = new THREE.Group(); root.add(stubs);
      ud(root, 'stubs', stubs);
      return root;
    },
    init(inst) { inst.state.cavities ??= Array(n).fill(null); def.refresh(inst); },
    refresh(inst) {
      const g = inst.object.userData.stubs;
      if (!g) return;
      for (const c of [...g.children]) g.remove(c);
      (inst.state.cavities || []).forEach((c, i) => {
        if (!c) return;
        const s = new THREE.Mesh(gBox(1.0, 2.5, 0.9), PM.solder);
        s.position.set(xs[i], H + 1.0, 0);
        g.add(s);
      });
    },
  };
  return def;
}

// ============================================================================= cáp: hình học
function cableCurve(A, dA, B, dB, L, floorY) {
  const k = Math.min(18, L * 0.12);
  const A1 = A.clone().addScaledVector(dA, k), B1 = B.clone().addScaledVector(dB, k);
  const c = A1.distanceTo(B1);
  const rem = Math.max(c, L - 2 * k);
  const sag = rem > c ? Math.min(rem / 2, Math.sqrt((3 * c * (rem - c)) / 8)) : 0;
  const pts = [A, A1];
  for (const t of [0.2, 0.4, 0.5, 0.6, 0.8]) {
    const p = A1.clone().lerp(B1, t);
    p.y -= 4 * sag * t * (1 - t);
    if (floorY != null && p.y < floorY) p.y = floorY;
    pts.push(p);
  }
  pts.push(B1, B);
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
}

// ============================================================================= lớp chính
export class Wiring {
  constructor(game) {
    this.game = game;
    this.cutLen = 150;
    this.groups = new Map();        // uid → { group, sig }
    this.preview = null;            // { uid, group, sig }
    this._t = 0;
    this._clamped = new Map();
    this._peekCache = { key: null, val: null };
    this.registerDefs();
    this.augmentDefs();
    const ev = game.events;
    ev.on('wire:cut', (e) => this._onSpoolCut(e));
    ev.on('cut', (e) => this._onCutter(e));
    ev.on('wire:strip', (e) => this._onStrip(e));
    ev.on('wire:crimp', (e) => this._onCrimp(e));
    ev.on('item:picked', (e) => this._onPicked(e.item));
    ev.on('item:dropped', (e) => this._onReleased(e.item, 'drop'));
    ev.on('item:placed', (e) => { if (!e.socket) this._onReleased(e.item, 'place'); });
    ev.on('item:stashed', (e) => this._onStashed(e.item));
    ev.on('item:removed', (e) => this._onRemoved(e.item));
    ev.on('socket:inserted', (e) => this._onMate(e, true));
    ev.on('socket:removed', (e) => this._onMate(e, false));
    ev.on('screw:driven', (e) => this._onScrew(e));
    ev.on('game:loaded', () => { for (const it of this.cables()) this._sync(it, true); });
  }

  // ------------------------------------------------------------------ def
  registerDefs() {
    const items = this.game.items;
    if (!items.get('wire-piece')) items.register(pieceDef());
    for (const n of [2, 3, 4]) if (!items.get(`jst-xh-${n}-shell`)) items.register(shellDef(n));
    const pd = items.get('wire-piece');
    if (pd) { pd.setColor = (inst, c) => { inst.state.color = c; pd.refresh(inst); this.refreshCable(inst); return { ok: true }; }; }
  }

  /** thêm thao tác "cắm đầu dây" (chuột trái khi cầm) cho mọi def dây; kìm cắt: cuộn chuột chọn độ dài */
  augmentDefs() {
    const game = this.game;
    const action = {
      id: 'wire-place', key: 'LMB', held: true, wiring: true,
      when: (inst) => isCable(inst) && !inst.state?.cable?.laid && !!this.peek(inst),
      label: (inst) => this.peek(inst)?.label || 'Cắm đầu dây',
      do: (inst) => {
        const r = this.placeFromTarget(inst);
        return r === true ? { ok: true, sound: 'snap' } : { ok: false, reason: r || 'Không cắm được' };
      },
    };
    for (const d of game.items.defs()) {
      if (!isCable(d) || d.kind === 'tool') continue;
      d.actions = (d.actions || []).filter((a) => !a.wiring);
      d.actions.push(action);
      if (d.setColor && !d._wiringColor) {
        const orig = d.setColor;
        d.setColor = (inst, c) => { const r = orig.call(d, inst, c); this.refreshCable(inst); return r; };
        d._wiringColor = true;
      }
    }
    const fc = game.items.get('flush-cutter');
    if (fc?.tool && !fc.tool._wiring) {
      fc.tool._wiring = true;
      fc.tool.onScroll ??= (ctx, d) => {
        this.cutLen = THREE.MathUtils.clamp(this.cutLen - Math.sign(d) * 10, 20, 2000);
        game.audio?.play('tick');
        game.hud?.toast?.(`Độ dài cắt dây: ${this.cutLen} mm`, { kind: 'info', short: true });
      };
      const h = fc.tool.hud;
      fc.tool.hud = (inst) => `${h ? h(inst) : 'Kìm cắt chân'} · cắt dây ${this.cutLen} mm (cuộn)`;
    }
  }

  cables() { return this.game.items.all.filter((it) => isCable(it)); }
  _st(inst) { const s = inst.state || (inst.state = {}); s.cable ||= { ends: { A: null, B: null }, laid: false }; s.cable.ends ||= { A: null, B: null }; return s.cable; }
  lengthOf(inst) { return inst.state?.lengthMm ?? inst.object?.userData?.jw?.len ?? inst.def.props?.lengthMm ?? 200; }
  colorOf(inst) { return inst.state?.color || inst.def.props?.color || 'red'; }
  nextEnd(inst) { const e = this._st(inst).ends; return !e.A ? 'A' : !e.B ? 'B' : null; }

  // ------------------------------------------------------------------ nhắm & cắm
  /** Đầu dây kế tiếp sẽ cắm vào đâu (theo tia nhìn) → { att, label, ok, reason, end } | null */
  peek(inst) {
    const t = this.game.interact?.target;
    // [UX] chế độ tỉ mỉ: interact.target.hit đã là điểm dưới CON TRỎ 3D (interact.pointer) — cắm đúng lỗ breadboard nhắm bằng con trỏ
    const hit = t?.hit;
    const key = `${inst.uid}|${hit?.point?.x?.toFixed(2)}|${hit?.point?.y?.toFixed(2)}|${hit?.point?.z?.toFixed(2)}|${this.nextEnd(inst)}|${this.game.netlist?.version}`;
    if (this._peekCache.key === key) return this._peekCache.val;
    let val = null;
    const end = this.nextEnd(inst);
    if (hit && end) {
      const type = endTypeOf(inst, end);
      const kinds = KINDS[type];
      if (!kinds) val = { ok: false, end, label: `Đầu ${end} chưa tuốt vỏ — dùng kìm tuốt trước`, reason: 'Tuốt vỏ đầu dây trước (kìm tuốt, khấc 22 AWG)' };
      else {
        const r = this.game.netlist.resolvePoint(hit.point, hit.object, { kinds, exclude: inst });
        if (r) {
          const why = this._invalid(inst, end, r.att);
          if (!t.inReach) val = { ok: false, end, att: r.att, label: `Cắm ${TYPE_VI[type]} ${end} → ${r.label} (quá xa)`, reason: 'Quá xa — bước lại gần' };
          else if (why) val = { ok: false, end, att: r.att, label: `${TYPE_VI[type]} ${end}: ${why}`, reason: why };
          else val = { ok: true, end, att: r.att, label: `Cắm ${TYPE_VI[type]} ${end} → ${r.label}` };
        }
      }
    }
    this._peekCache = { key, val };
    return val;
  }

  _invalid(inst, end, att) {
    const NL = this.game.netlist;
    const other = this._st(inst).ends[end === 'A' ? 'B' : 'A'];
    if (other && other.kind !== 'free') {
      const pa = NL.posOf(other, new THREE.Vector3()), pb = NL.posOf(att, _v2);
      const L = this.lengthOf(inst);
      if (pa && pb && pa.distanceTo(pb) > L - 12) return `dây dài ${L} mm không với tới (cách ${pa.distanceTo(pb).toFixed(0)} mm)`;
      if (sameAtt(other, att)) return 'trùng đầu kia';
    }
    if (att.kind === 'screw') {
      const T = this.game.items.byUid(att.uid);
      if ((T?.state?.screws?.[att.index] ?? 0) > 0.25) return 'vít đang siết — nới vít ra trước (tua vít, cuộn chuột)';
    }
    if (att.kind === 'shell') {
      const S = this.game.items.byUid(att.uid);
      if (S?.state?.cavities?.[att.cavity]) return 'lỗ vỏ đã có cos';
    }
    if (this._occupied(att, inst)) return 'đã có đầu dây khác cắm ở đây';
    return null;
  }

  _occupied(att, self) {
    if (att.kind !== 'bb' && att.kind !== 'screw' && att.kind !== 'shell') return false;
    for (const c of this.cables()) {
      if (c === self) continue;
      const e = c.state?.cable?.ends;
      if (!e) continue;
      if (sameAtt(e.A, att) || sameAtt(e.B, att)) return true;
    }
    if (att.kind === 'bb') {
      const B = this.game.items.byUid(att.uid);
      const s = (B?.sockets || []).find((q) => q.localId === att.hole);
      if (s?.occupiedBy) return true;
    }
    return false;
  }

  /** → true | lý do (chuỗi) */
  placeFromTarget(inst) {
    this._peekCache.key = null;
    const p = this.peek(inst);
    if (!p) return 'Nhắm vào lỗ breadboard / chân / pad / lỗ cầu đấu để cắm đầu dây';
    if (!p.ok) return p.reason || 'Không cắm được';
    return this.placeEnd(inst, p.end, p.att, { quietFail: true }) === true ? true : 'Không cắm được';
  }

  /** Cắm đầu `end` của dây vào điểm gắn att */
  placeEnd(inst, end, att, { silent = false, quietFail = false, noSync = false } = {}) {
    const game = this.game, NL = game.netlist;
    const st = this._st(inst);
    const why = att.kind !== 'free' ? this._invalid(inst, end, att) : null;
    if (why) { if (!silent && !quietFail) game.hud?.toast?.(why, { kind: 'warn', short: true }); return false; }
    st.ends[end] = att;
    if (att.kind === 'shell') this._shellSet(att, { uid: inst.uid, end });
    game.audio?.play('snap', { vol: 0.6 });
    game.hands?.playGesture?.('push', 'right', 0.3);
    this._peekCache.key = null;
    const other = st.ends[end === 'A' ? 'B' : 'A'];
    game.events.emit('cable:changed', { item: inst });
    if (other) {
      this.lay(inst);
      const la = NL.labelOf(st.ends.A), lb = NL.labelOf(st.ends.B);
      game.events.emit('wire:connected', { a: NL.keyOf(st.ends.A) || la, b: NL.keyOf(st.ends.B) || lb, item: inst, atts: { A: st.ends.A, B: st.ends.B }, labels: [la, lb] });
      if (!silent) {
        const warn = [st.ends.A, st.ends.B].find((a) => a.kind === 'screw' && !NL.keyOf(a)) ? ' — nhớ SIẾT vít cầu đấu (tua vít + cuộn chuột)'
          : [st.ends.A, st.ends.B].find((a) => a.kind === 'pad' && !NL.keyOf(a)) ? ' — đầu trên pad cần HÀN mới dẫn điện' : '';
        game.hud?.toast?.(`Đã nối ${la} ↔ ${lb}${warn}`, { kind: 'success', short: true });
      }
    } else if (!silent) {
      game.hud?.toast?.(`Đầu ${end} → ${NL.labelOf(att)}. Nhắm điểm thứ hai rồi chuột trái để cắm đầu ${end === 'A' ? 'B' : 'A'}`, { kind: 'info', short: true });
    }
    if (!noSync) this._sync(inst, true);
    return true;
  }

  /** Nối thẳng 2 đầu (API / test): dây đang ở đâu cũng được */
  connect(inst, attA, attB) {
    if (inst.heldBy) { this.game.hands?.detach(inst.heldBy); inst.heldBy = null; }
    if (inst.socket) this.game.sockets.release(inst, { silent: true });
    if (inst.state?.cable?.laid) this.unlay(inst, { keepFixed: false });
    const st = this._st(inst);
    st.ends = { A: null, B: null };
    return this.placeEnd(inst, 'A', attA, { silent: true, noSync: true }) && this.placeEnd(inst, 'B', attB, { silent: true });
  }

  _shellSet(att, val) {
    const S = this.game.items.byUid(att.uid);
    if (!S) return;
    S.state.cavities ||= Array(S.def.jstShell).fill(null);
    S.state.cavities[att.cavity] = val;
    S.def.refresh?.(S);
  }

  /** Dây rời tay, nằm giữa 2 điểm gắn */
  lay(inst) {
    const game = this.game;
    const st = this._st(inst);
    if (inst.heldBy) { game.hands?.detach(inst.heldBy); inst.heldBy = null; game.hands?.setPose?.('right', 'idle'); }
    if (inst.socket) game.sockets.release(inst, { silent: true });
    inst.phys && (inst.phys.falling = false);
    inst.object.parent?.remove(inst.object);
    st.laid = true;
    this._showInHand(inst, true);
    this._removePreview();
    this._sync(inst, true);
  }

  /** Rút dây: xoá điểm gắn (giữ đầu cố định nếu đầu kia đang thả tự do — để cắm tiếp) */
  unlay(inst, { keepFixed = true } = {}) {
    const game = this.game, NL = game.netlist;
    const st = this._st(inst);
    const { A, B } = st.ends;
    const atts = { A, B };
    let keep = null;
    if (keepFixed) {
      if (A && A.kind !== 'free' && (!B || B.kind === 'free')) keep = 'A';
      else if (B && B.kind !== 'free' && (!A || A.kind === 'free')) keep = 'B';
    }
    for (const e of ['A', 'B']) {
      const a = st.ends[e];
      if (!a || e === keep) continue;
      if (a.kind === 'shell') this._shellSet(a, null);
      st.ends[e] = null;
    }
    st.laid = false;
    this._disposeGroup(inst);
    this._showInHand(inst, !keep);
    if (A || B) {
      game.events.emit('cable:changed', { item: inst });
      if (A && B && A.kind !== 'free' && B.kind !== 'free') game.events.emit('wire:removed', { item: inst, a: NL.labelOf(A), b: NL.labelOf(B), atts });
    }
  }

  // ------------------------------------------------------------------ sự kiện
  _onPicked(it) {
    if (!it || !isCable(it)) return;
    const st = it.state?.cable;
    if (!st) return;
    if (st.laid) this.unlay(it);
    this._sync(it, true);
  }
  /** dây đang cắm dở (1 đầu) mà thả / đặt xuống → nằm lại, đầu kia tự do */
  _onReleased(it, how) {
    if (!it || !isCable(it)) return;
    const st = it.state?.cable;
    if (!st || st.laid) return;
    const fixed = st.ends.A || st.ends.B;
    if (!fixed) return;
    const free = st.ends.A ? 'B' : 'A';
    it.object.updateWorldMatrix(true, false);
    const p = it.object.getWorldPosition(new THREE.Vector3());
    const sup = this.game.items.supportHeight(p.x, p.z, p.y + 50, it);
    st.ends[free] = { kind: 'free', pos: [p.x, sup.y + 1, p.z] };
    this.lay(it);
    void how;
  }
  _onStashed(it) {
    if (!it) return;
    if (isCable(it) && it.state?.cable && (it.state.cable.ends.A || it.state.cable.ends.B)) { this.unlay(it, { keepFixed: false }); this._showInHand(it, true); }
    this._dropCablesOn(it);
  }
  _onRemoved(it) {
    if (!it) return;
    this._disposeGroup(it);
    if (this.preview?.uid === it.uid) this._removePreview();
    this._dropCablesOn(it);
  }
  /** vật mang đầu dây biến mất (cất túi / xoá) → đầu dây thành tự do */
  _dropCablesOn(target) {
    const NL = this.game.netlist;
    for (const c of this.cables()) {
      const st = c.state?.cable;
      if (!st || c === target) continue;
      for (const e of ['A', 'B']) {
        const a = st.ends[e];
        if (!a || a.uid !== target.uid) continue;
        const last = this.groups.get(c.uid)?.last?.[e] || NL.posOf(a, new THREE.Vector3()) || new THREE.Vector3();
        st.ends[e] = { kind: 'free', pos: [last.x, last.y, last.z] };
        this.game.events.emit('wire:removed', { item: c, a: NL.labelOf(a), b: null });
      }
      this.game.events.emit('cable:changed', { item: c });
      this._sync(c, true);
    }
  }

  _onSpoolCut(e) {
    const spec = e.spec || { kind: 'wire', color: e.item?.state?.color || e.item?.def?.props?.color || 'red', awg: 22, lengthMm: e.lengthMm || 150 };
    const p = this.spawnPiece(spec, { toBag: true });
    if (p) this.game.hud?.toast?.(`Đoạn dây ${spec.lengthMm} mm ${COLOR_VI[spec.color] || ''} đã vào túi (Tab) — tuốt 2 đầu trước khi cắm`, { kind: 'success', short: true });
  }
  /** kìm cắt: vào cuộn dây (trên bàn) → cắt đoạn; vào đầu đoạn dây → cắt bỏ đầu */
  _onCutter(e) {
    const it = e.item;
    if (!it) return;
    if (typeof it.def.cut === 'function' && /spool/.test(it.def.id)) {
      const r = it.def.cut(it, this.cutLen);
      if (r?.ok === false) { this.game.hud?.toast?.(r.reason || 'Không cắt được', { kind: 'warn', short: true }); return; }
      this.game.events.emit('wire:cut', { item: it, spec: r?.spawn || null, lengthMm: this.cutLen });
      return;
    }
    if (it.def.id === 'wire-piece' && !it.state?.cable?.laid) {
      const end = this._nearestEnd(it, e.pos);
      const i = end === 'A' ? 0 : 1;
      const st = it.state;
      if (!st.strip[i] && !st.crimp[i]) return;
      st.strip[i] = 0; st.crimp[i] = null; st.nicked[i] = false;
      st.lengthMm = Math.max(20, (st.lengthMm || 150) - 8);
      it.def.refresh(it);
      this.game.hud?.toast?.(`Đã cắt bỏ đầu ${end} (dây còn ${st.lengthMm} mm) — tuốt lại`, { kind: 'info', short: true });
      this.game.events.emit('cable:changed', { item: it });
    }
  }
  _nearestEnd(it, pos) {
    const hit = this.game.interact?.target?.hit;
    const P = hit && itemOf(hit.object) === it ? hit.point : (pos ? (pos.isVector3 ? pos : new THREE.Vector3(...pos)) : null);
    if (!P) return 'A';
    it.object.updateWorldMatrix(true, false);
    let best = 'A', bd = Infinity;
    for (const p of pinsOf(it)) { const d = it.object.localToWorld(_v.set(...p.pos)).distanceTo(P); if (d < bd) { bd = d; best = p.id; } }
    return best;
  }
  _onStrip(e) {
    const it = e.item;
    if (!it || it.def.id !== 'wire-piece') return;
    if (it.state?.cable?.laid) { this.game.hud?.toast?.('Rút dây ra rồi đặt lên bàn để tuốt', { kind: 'warn', short: true }); return; }
    const end = this._nearestEnd(it, e.pos), i = end === 'A' ? 0 : 1;
    const st = it.state;
    if (st.crimp[i]) { this.game.hud?.toast?.(`Đầu ${end} đã bấm cos`, { kind: 'info', short: true }); return; }
    if (e.result === 'not-cut') { this.game.hud?.toast?.(`Khấc AWG ${e.gauge} to hơn dây ${e.wireAwg} AWG — lưỡi chưa cắt đứt vỏ. Chọn khấc ${e.wireAwg}.`, { kind: 'warn' }); return; }
    st.strip[i] = 6;
    st.nicked[i] = e.result === 'nicked';
    it.def.refresh(it);
    this.game.events.emit('wire:stripped', { item: it, end, result: e.result });
    this.game.events.emit('cable:changed', { item: it });
    if (e.result === 'ok') this.game.hud?.toast?.(`Đã tuốt đầu ${end}: lõi đồng 6 mm sạch đẹp`, { kind: 'success', short: true });
  }
  _onCrimp(e) {
    const it = e.item;
    if (!it || it.def.id !== 'wire-piece' || e.quality === 'aborted') return;
    const end = this._nearestEnd(it, e.pos), i = end === 'A' ? 0 : 1;
    const st = it.state;
    if (!st.strip[i]) { this.game.hud?.toast?.(`Đầu ${end} chưa tuốt vỏ — cos sẽ kẹp vào vỏ nhựa, không dẫn điện!`, { kind: 'warn' }); this.game.events.emit('fault', { kind: 'bad-crimp', item: it }); return; }
    st.crimp[i] = 'jst-xh';
    st.crimpBad = st.crimpBad || [false, false];
    st.crimpBad[i] = e.quality !== 'good';
    it.def.refresh(it);
    this.game.events.emit('wire:crimped', { item: it, end, quality: e.quality });
    this.game.events.emit('cable:changed', { item: it });
    this.game.hud?.toast?.(e.quality === 'good' ? `Đầu ${end}: cos JST-XH bấm chắc — cầm dây lên, chuột trái vào lỗ vỏ JST để lắp` : `Đầu ${end}: sai khuôn bấm (${e.die}) — cos lỏng, dễ chập chờn`, { kind: e.quality === 'good' ? 'success' : 'warn' });
  }
  _onMate(e, plugged) {
    const k = e.socket?.kind || '';
    if (!/^(jst|xt60)/.test(k) || !e.item) return;
    const owner = e.socket.owner;
    this.game.events.emit(plugged ? 'wire:connected' : 'wire:removed', { a: e.item.uid, b: owner?.uid, item: e.item, connector: k });
    this.game.hud?.toast?.(plugged ? `Đã cắm khớp ${e.item.def.name} → ${owner?.def?.name || k}` : `Đã rút ${e.item.def.name}`, { kind: plugged ? 'success' : 'info', short: true });
  }
  _onScrew(e) {
    const T = e.item;
    if (!T?.def?.driveScrew) return;
    const n = (T.state?.screws || []).length;
    for (let i = 0; i < n; i++) {
      const was = !!this._clamped.get(`${T.uid}:${i}`), now = (T.state.screws[i] ?? 0) > 0.25;
      if (was === now) continue;
      this._clamped.set(`${T.uid}:${i}`, now);
      for (const c of this.cables()) {
        const st = c.state?.cable;
        if (!st) continue;
        for (const end of ['A', 'B']) {
          const a = st.ends[end];
          if (a?.kind === 'screw' && a.uid === T.uid && a.index === i) {
            this.game.events.emit(now ? 'wire:connected' : 'wire:removed', { a: `screw:${T.uid}:${i}`, b: c.uid, item: c, clamp: true });
            this.game.hud?.toast?.(now ? `Đã siết chặt dây vào cầu đấu (lỗ ${i + 1})` : `Đã nới vít lỗ ${i + 1} — dây lỏng, không dẫn`, { kind: now ? 'success' : 'info', short: true });
          }
        }
      }
    }
    this.game.netlist?.markDirty();
  }

  /** Sinh đoạn dây mới (vào túi hoặc tại pose) */
  spawnPiece(spec = {}, { toBag = false, pose = null } = {}) {
    const game = this.game;
    const inst = game.items.spawn('wire-piece', pose || {}, { stowed: !pose });
    if (!inst) return null;
    Object.assign(inst.state, { color: spec.color || 'red', awg: spec.awg || 22, lengthMm: spec.lengthMm || 150, strip: [0, 0], crimp: [null, null], nicked: [false, false] });
    inst.def.refresh(inst);
    inst.def.name = 'Đoạn dây 22 AWG';
    if (toBag && game.inventory?.stash) game.inventory.stash(inst, true);
    game.events.emit('wire:piece', { item: inst, spec });
    return inst;
  }

  // ------------------------------------------------------------------ hiển thị
  _showInHand(inst, visible) {
    const jw = inst.object?.userData?.jw;
    if (jw) { jw.a.visible = visible; jw.w.visible = visible; return; }
    const vis = inst.object?.userData?.vis;
    if (vis) vis.visible = visible;
  }

  refreshCable(inst) { const g = this.groups.get(inst.uid); if (g) g.sig = null; }

  _endInfo(inst, end, out) {
    const NL = this.game.netlist;
    const a = this._st(inst).ends[end];
    if (!a) return null;
    if (a.kind === 'free') return { pos: out.set(...a.pos), dir: new THREE.Vector3(end === 'A' ? -1 : 1, 0, 0), att: a, type: endTypeOf(inst, end) };
    const pos = NL.posOf(a, out);
    if (!pos) return null;
    return { pos, dir: NL.dirOf(a, new THREE.Vector3()), att: a, type: endTypeOf(inst, end) };
  }

  /** dựng (lại) hình cáp nằm hoặc bóng xem trước khi đang cắm dở */
  _sync(inst, force = false) {
    const st = inst.state?.cable;
    if (!st) return;
    if (st.laid) {
      if (inst.object.parent) inst.object.parent.remove(inst.object);
      this._buildLaid(inst, force);
    } else if ((st.ends.A || st.ends.B) && inst.heldBy) {
      this._showInHand(inst, false);
      this._buildPreview(inst, force);
    } else if ((st.ends.A || st.ends.B) && !inst.heldBy && inst.object.parent) {
      this._onReleased(inst, 'load');
    }
  }

  _buildLaid(inst, force) {
    const game = this.game;
    let rec = this.groups.get(inst.uid);
    const ia = this._endInfo(inst, 'A', new THREE.Vector3()), ib = this._endInfo(inst, 'B', new THREE.Vector3());
    if (!ia || !ib) return;
    const sig = `${sig3(ia.pos)}|${sig3(ib.pos)}|${sig3(ia.dir)}|${sig3(ib.dir)}|${this.colorOf(inst)}|${this.lengthOf(inst)}|${inst.state.dead ? 1 : 0}`;
    if (rec && rec.sig === sig && !force) return;
    if (!rec) {
      const group = new THREE.Group();
      group.name = `cable:${inst.uid}`;
      group.userData.item = inst;
      group.userData.cableOf = inst;
      group.userData.awg = inst.state?.awg ?? inst.def.props?.awg ?? 26;
      game.scene.add(group);
      rec = { group, sig: null, last: {} };
      this.groups.set(inst.uid, rec);
      inst._cableGroup = group;
      game.interact?.register(group, {
        name: () => `${inst.def.name} · ${game.netlist.labelOf(inst.state.cable.ends.A) || 'tự do'} ↔ ${game.netlist.labelOf(inst.state.cable.ends.B) || 'tự do'}`,
        prompts: [
          { key: 'E', label: 'Rút dây (cầm lên tay)', do: () => this.pickUp(inst) },
          { key: 'R', label: 'Đổi màu dây', do: () => this.cycleColor(inst) },
        ],
        lessonId: inst.def.lessonId,
      });
    }
    rec.sig = sig;
    rec.last = { A: ia.pos.clone(), B: ib.pos.clone() };
    this._fillCable(rec.group, inst, ia, ib);
  }

  _fillCable(group, inst, ia, ib) {
    for (const c of [...group.children]) { group.remove(c); if (c.userData.own) c.geometry?.dispose?.(); }
    const L = this.lengthOf(inst);
    const r = AWG_R[inst.state?.awg ?? inst.def.props?.awg ?? 26] ?? 0.65;
    const mat = inst.state.dead ? PM.leadDark : wireMat(this.colorOf(inst));
    const starts = [];
    for (const [info] of [[ia], [ib]]) {
      const d = info.dir.clone().normalize();
      let off = 0;
      if (info.type === 'male' || info.type === 'female') {
        const housing = new THREE.Mesh(gBox(2.54, HL, 2.54, 0.15, 1), PM.pbtBlack);
        const base = info.type === 'male' ? 0 : -6;
        housing.position.copy(info.pos).addScaledVector(d, base + HL / 2);
        housing.quaternion.copy(_q.setFromUnitVectors(UP, d));
        housing.castShadow = true;
        group.add(housing);
        if (info.type === 'male' && info.att.kind !== 'bb') {
          const pin = new THREE.Mesh(gBox(0.64, 6, 0.64), PM.gold);
          pin.position.copy(info.pos).addScaledVector(d, -1);
          pin.quaternion.copy(housing.quaternion);
          group.add(pin);
        }
        off = base + HL + 0.5;
      } else if (info.type === 'bare') {
        const cu = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 6, 8), PM.copper);
        cu.userData.own = true;
        cu.position.copy(info.pos).addScaledVector(d, -1);
        cu.quaternion.copy(_q.setFromUnitVectors(UP, d));
        group.add(cu);
        off = 2;
      } else off = 1;
      starts.push({ p: info.pos.clone().addScaledVector(d, off), d });
    }
    const [sa, sb] = starts;
    const mid = sa.p.clone().lerp(sb.p, 0.5);
    let floorY = null;
    try { floorY = this.game.items.supportHeight(mid.x, mid.z, Math.max(sa.p.y, sb.p.y) + 5, inst).y + r; } catch { floorY = null; }
    const curve = cableCurve(sa.p, sa.d, sb.p, sb.d, Math.max(L - 30, sa.p.distanceTo(sb.p)), floorY);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, r, 7, false), mat);
    tube.userData.own = true;
    tube.castShadow = true;
    group.add(tube);
    group.userData.mid = curve.getPoint(0.5);
  }

  _buildPreview(inst) {
    const game = this.game;
    const st = this._st(inst);
    const end = st.ends.A ? 'A' : 'B';
    const info = this._endInfo(inst, end, new THREE.Vector3());
    if (!info) return;
    let tip;
    const jw = inst.object.userData?.jw;
    inst.object.updateWorldMatrix(true, true);
    if (jw) tip = jw.b.localToWorld(new THREE.Vector3(-HL, 0, 0));
    else tip = game.hands?.right?.tipWorldPosition?.(new THREE.Vector3()) || inst.object.getWorldPosition(new THREE.Vector3());
    const sig = `${sig3(info.pos)}|${sig3(tip)}|${this.colorOf(inst)}`;
    if (this.preview && this.preview.uid === inst.uid && this.preview.sig === sig) return;
    if (!this.preview || this.preview.uid !== inst.uid) {
      this._removePreview();
      const group = new THREE.Group();
      group.name = 'cable-preview';
      group.traverse((o) => { o.raycast = () => {}; });
      game.scene.add(group);
      this.preview = { uid: inst.uid, group, sig: null };
    }
    this.preview.sig = sig;
    const ib = { pos: tip, dir: tip.clone().sub(info.pos).normalize().multiplyScalar(-1).add(new THREE.Vector3(0, 0.6, 0)).normalize(), att: { kind: 'free' }, type: 'hand' };
    this._fillCable(this.preview.group, inst, info, ib);
    this.preview.group.traverse((o) => { o.raycast = () => {}; o.castShadow = false; });
  }
  _removePreview() {
    if (!this.preview) return;
    const g = this.preview.group;
    g.parent?.remove(g);
    g.traverse((o) => { if (o.userData.own) o.geometry?.dispose?.(); });
    this.preview = null;
  }
  _disposeGroup(inst) {
    const rec = this.groups.get(inst.uid);
    if (!rec) return;
    this.game.interact?.unregister?.(rec.group);
    rec.group.parent?.remove(rec.group);
    rec.group.traverse((o) => { if (o.userData.own) o.geometry?.dispose?.(); });
    this.groups.delete(inst.uid);
    if (inst._cableGroup === rec.group) inst._cableGroup = null;
  }

  pickUp(inst) {
    const game = this.game;
    if (game.interact?.heldItem) { game.hud?.toast?.('Tay đang bận — đặt vật đang cầm xuống trước', { kind: 'warn', short: true }); return false; }
    const rec = this.groups.get(inst.uid);
    const mid = rec?.group?.userData?.mid;
    if (mid) { inst.object.position.copy(mid); inst.object.updateMatrixWorld(true); }
    return game.interact?.pick(inst);
  }

  cycleColor(inst) {
    const c = COLORS[(COLORS.indexOf(this.colorOf(inst)) + 1) % COLORS.length];
    if (inst.def.setColor) inst.def.setColor(inst, c); else inst.state.color = c;
    inst.state.color = c;
    this.refreshCable(inst);
    this._sync(inst, true);
    this.game.audio?.play('tick');
  }

  // ------------------------------------------------------------------ mỗi bước
  tick(dt) {
    this._t -= dt;
    const held = this.game.interact?.heldItem;
    if (held && isCable(held) && (held.state?.cable?.ends?.A || held.state?.cable?.ends?.B)) this._sync(held);
    else if (this.preview) {
      const p = this.game.items.byUid(this.preview.uid);
      this._removePreview();
      if (p && !p.state?.cable?.laid) this._showInHand(p, true);
    }
    if (this._t > 0) return;
    this._t = 0.1;
    for (const c of this.cables()) {
      const st = c.state?.cable;
      if (!st) continue;
      if (st.laid) this._buildLaid(c, false);
      else if (st.ends.A || st.ends.B) { if (!c.heldBy && c.object.parent) this._onReleased(c, 'idle'); }
      // dây cháy → đổi màu
    }
  }
}

function sig3(v) { return `${v.x.toFixed(1)},${v.y.toFixed(1)},${v.z.toFixed(1)}`; }
export function sameAtt(a, b) {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'free') return false;
  return a.uid === b.uid && (a.hole ?? a.pin ?? a.pad ?? a.index ?? a.cavity) === (b.hole ?? b.pin ?? b.pad ?? b.index ?? b.cavity);
}
