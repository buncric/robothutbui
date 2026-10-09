// =============================================================================
// soldering.js — MINIGAME HÀN MẠCH (GAME_API §9). Khởi tạo: game.soldering = new Soldering(game) (main.js).
//
// Mô hình (chi tiết vật lý + chú thích tiếng Việt: ./_solder_physics.js):
//   Mỗi pad (lỗ board đục lỗ / pad dây của module / lỗ có chân linh kiện xuyên qua) mang:
//     { T (°C), solderVol (mm³, bí danh V), flux (hoạt tính nhựa thông), wetting (0..1), state: empty|cold|good|excess|bridge|lifted,
//       leadId ('uidLinhKiện/chân' | null), molten, peakT, oxide, overheat, bridges:[khoá pad] }
//   Nguồn pad: def.solderPads(inst) (perfboard-9x15, module buck…). Chân linh kiện cắm vào lỗ 'pcb-hole' của board được
//   ghép vào pad theo vị trí đầu chân (getPins) → pad.lead.
//
// Điều khiển (cầm 2 tay: phím 1 = mỏ hàn tay phải, phím 2 = thiếc hàn tay trái):
//   Giữ CHUỘT TRÁI  : áp mũi mỏ hàn vào pad đang nhắm (tự "bám" vào mối hàn khi tâm ngắm cách pad ≤ 3.5 mm)
//   Giữ CHUỘT PHẢI  : đưa dây thiếc (tay trái) vào CHỖ TIẾP XÚC pad/chân (phía đối diện mũi hàn)
//   Dây hút thiếc (tay trái) + mỏ hàn: giữ RMB đặt bấc lên mối hàn, giữ LMB ấn mỏ hàn lên bấc
//   Ống hút thiếc (tay trái): E (hoặc bấm RMB lần 1) lên cò · nung chảy mối hàn bằng LMB · bấm RMB → hút
//   Bút nhựa thông (tay phải): giữ LMB chấm lên pad · Kìm cắt (tay phải): giữ LMB lên chân đã hàn → cắt sát
//
// API: soldering.connections() → [{ a, b, kind:'joint'|'bridge', quality, flaky }]   (netlist cho mạch / đồng hồ đo)
//      soldering.nets() → [[nodeId…]] · netOf(node) · sameNet(a, b) · shorts()
//      soldering.padState(boardInst, padId) · partJoints(partInst) → [{ pad, padId, state, board }] · boardSummary(boardInst)
//      soldering.contactPoints(boardInst, padId) → { center, normal, iron, feed } (thế giới — dùng cho test / gợi ý)
//      soldering.debug = { iron:{tip,down}, wire:{tip,down}, wick:{tip,down}, leftHand:[Vector3], ironTouch:{object,point} }
//        → thay đầu vào tay/chuột (smoke test không có trình duyệt).
// Node id: '<uid board>/<id pad>' cho pad, '<uid linh kiện>/<id chân>' cho chân.
// [PRO] soldering.pro = SolderPro (./solder-pro.js): mũi hàn đổi được (diện tích tiếp xúc/khối nhiệt theo docs/07 §13.1), nhiệt
//   linh kiện + hư hỏng, lỗi phụ (gai, xáo động, lỗ khí, văng, quá nhiệt, flux cháy, measling), kiểm tra IPC theo độ phóng đại,
//   làm sạch IPA, sổ tay hàn (phím N). Lỗi khởi tạo pro → minigame vẫn chạy như cũ.
// Sự kiện phát: 'solder:joint' {pad, padId, board, quality, stats, issues} · 'solder:bridge' {a, b, board, padA, padB}
//   'solder:bridge-removed' · 'solder:removed' {pad, amount, by} · 'solder:melt' · 'solder:lifted' · 'solder:into-iron'
//   'solder:cold-feed' · 'solder:drip' · 'solder:flux' {pad} · 'lead:trimmed' {item, pin, pad, lengthMm}
//   'safety:burn' · 'safety:plastic-melt' · 'safety:fume' · 'safety:iron-left-on' · 'iron:returned' · 'solder:netlist'
// =============================================================================
import * as THREE from 'three';
import {
  ALLOYS, alloyOf, clamp, clamp01, initPad, volumeLimits, contactG, stepThermal, stepChemistry, evaluateJoint, leadThermal,
  jointToast, STATE_INFO, WIRE_FLUX_PER_MM3, PEN_FLUX_PER_ML, MELT_J_PER_MM3, CONTACT_IRON_MM, CONTACT_WIRE_MM, NEAR_IRON_MM,
  LIFT_SECONDS, FILM_MM3, AMBIENT_FALLBACK,
} from './_solder_physics.js';
import {
  solderMats, matForPad, filletGeometry, bridgeGeometry, leadStubGeo, liftedRingGeo, fluxDiscGeo, scorchGeo, ballGeo, meltGeo, Particles, Gauge,
} from './_solder_visual.js';
import { labState } from '../world/_labState.js';
import { PM } from '../items/parts/_shared.js';
import { SolderPro } from './solder-pro.js';

const STICKY_MM = 3.5;            // tâm ngắm cách pad ≤ 3.5 mm → tay "bám" vào mối hàn (trợ ngắm nhẹ)
const BURN_HAND_MM = 15;          // mũi hàn cách ngón tay trái ≤ 15 mm → bỏng
const AWAY_MM = 6000, AWAY_S = 60;
const BRIDGE_G = 0.04;           // W/K — cầu thiếc ~1 mm² dài 1.5 mm: k·A/L = 50·1e-6/1.5e-3 ≈ 0.03–0.05 W/K
const FUME_LIMIT_S = 2.5;        // s khói nhựa thông (máy hút khói tắt) trước khi cảnh báo
const SOLID_STATES = new Set(['good', 'excess', 'cold', 'bridge', 'lifted']);
const PLASTIC = new Set([PM.pbtBlack, PM.nylonCream, PM.nylonWhite, PM.nylonYellow, PM.absWhite, PM.absGrey, PM.absDark,
  PM.plasticBlue, PM.plasticGreen, PM.plasticRed, PM.rubber, PM.rubberGrey, PM.kapton,
  PM.wireRed, PM.wireBlack, PM.wireYellow, PM.wireBlue, PM.wireGreen, PM.wireWhite, PM.wireOrange, PM.wireBrown, PM.wireGrey, PM.wirePurple].filter(Boolean));

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _n = new THREE.Vector3();
const _loc = new THREE.Vector3(), _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
const FLIP_X = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);

export class Soldering {
  constructor(game) {
    this.game = game;
    this.active = true;                 // solder-wire.js: minigame tự tính lượng thiếc chảy (không trừ dây khi không chảy)
    this.boards = new Map();            // uid → BoardRec
    this._candidates = new Set();       // ItemInstance có def.solderPads (dựng BoardRec khi cần)
    this.debug = null;
    this.contact = null;                // { rec, pad, d, along, G, t0 }
    this._prevContact = null;           // { rec, pad, t } — phát hiện kéo mũi gây cầu thiếc
    this._t = 0;
    this._cool = new Map();             // khoá thông báo → thời điểm được phát lại
    this._sizzle = null;
    this._smokeAcc = 0;
    this._fumeExposure = 0;
    this._away = 0;
    this._awayWarned = false;
    this._plasticT = 0;
    this._coldFed = 0;
    this._pendingLoad = null;
    this._netVersion = 0;
    this._netCache = null;
    this.stats = { joints: 0, good: 0, cold: 0, excess: 0, bridge: 0, lifted: 0, intoIron: 0, burns: 0, melts: 0, fume: 0, trimmed: 0 };
    this.gauge = new Gauge();
    this.particles = new Particles(game.scene);
    // [PRO] mũi hàn / nhiệt linh kiện / IPC / sổ tay
    try { this.pro = new SolderPro(game, this); } catch (e) { console.error('[soldering] solder-pro lỗi khởi tạo', e); this.pro = null; }
    const ev = game.events;
    ev.on('item:spawned', (e) => this._onSpawn(e.item));
    ev.on('item:removed', (e) => this._onRemoved(e.item));
    ev.on('socket:inserted', (e) => this._onSocket(e, true));
    ev.on('socket:removed', (e) => this._onSocket(e, false));
    ev.on('game:loaded', () => { for (const r of this.boards.values()) r.leadsDirty = true; });
    ev.on('flux:applied', (e) => this._onFlux(e));
    ev.on('desolder:suck', (e) => this._onPump(e));
    ev.on('cut', (e) => this._onCut(e));
    ev.on('measure:request', (e) => this._onMeasure(e));
    ev.on('input:key', (e) => this._onKey(e));
    ev.on('tool:changed', (e) => this._onToolChanged(e));
    // đồng hồ vạn năng hỏi game.circuit?.measure(req) — chưa có bộ giải mạch thì minigame hàn trả lời (Ω / thông mạch trên board)
    if (!game.circuit) game.circuit = { fromSoldering: true, measure: (req) => this.measure(req), connections: () => this.connections() };
    game.save?.register?.('soldering', { serialize: () => this.serialize(), deserialize: (d) => { this._pendingLoad = d || null; } });
    // item sinh trước khi minigame khởi tạo
    for (const it of game.items?.all || []) this._onSpawn(it);
  }

  // =========================================================================== quản lý board / pad
  _onSpawn(inst) {
    if (!inst?.object) return;
    // SỬA TẠM (runtime): items/parts/_shared.js anchor() gom mốc khe vào nhóm '__anchors' có visible=false → engine/sockets.js
    // coi mọi khe con là "ẩn" (không cắm được khi chơi) và linh kiện đã cắm cũng bị ẩn theo. Nhóm chỉ chứa Object3D rỗng
    // nên bật visible không vẽ thêm gì — chỉ để linh kiện cắm trên board/đế IC hiện ra & tương tác được.
    const anchors = inst.object.userData?.__anchors;
    if (anchors && anchors.visible === false) anchors.visible = true;
    if (typeof inst.def?.solderPads === 'function') this._candidates.add(inst);
  }

  _onRemoved(inst) {
    this._candidates.delete(inst);
    const rec = this.boards.get(inst?.uid);
    if (rec) { rec.group.parent?.remove(rec.group); this.boards.delete(inst.uid); this._netChanged(); }
    // linh kiện bị xoá → gỡ khỏi pad
    for (const r of this.boards.values()) {
      const list = r.leadPads.get(inst?.uid);
      if (list) { for (const p of list) { p.lead = null; p.leadId = null; p.dirty = true; } r.leadPads.delete(inst.uid); this._netChanged(); }
    }
  }

  /** BoardRec của một item board (dựng khi cần) */
  board(inst) {
    if (!inst) return null;
    let rec = this.boards.get(inst.uid);
    if (rec && rec.inst === inst) return rec;
    if (typeof inst.def?.solderPads !== 'function') return null;
    let pads;
    try { pads = inst.def.solderPads(inst) || []; } catch (e) { console.warn('[soldering] solderPads lỗi', inst.def.id, e); return null; }
    const amb = this._ambient();
    for (const p of pads) initPad(p, amb);
    const byId = new Map(pads.map((p) => [String(p.id), p]));
    const group = new THREE.Group();
    group.name = 'solder-joints';
    inst.object.add(group);
    rec = {
      inst, def: inst.def, uid: inst.uid, pads, byId, group, active: new Set(), dirty: new Set(), leadPads: new Map(),
      bridgeMeshes: new Map(), leadsDirty: true, inv: new THREE.Matrix4(), invT: -1,
      thickness: Array.isArray(inst.def.size) ? inst.def.size[1] : 1.6,
      half: Array.isArray(inst.def.size) ? [inst.def.size[0] / 2 + 6, inst.def.size[2] / 2 + 6] : [200, 200],
      grid: typeof inst.def.nearestHoleLocal === 'function',
    };
    for (const p of pads) { p._key = `${inst.uid}/${p.id}`; p._rec = rec; }
    if (!rec.grid) {
      // board không lưới (module): pad "bên cạnh" = pad cách < 4 mm
      for (const p of pads) if (!p.neighbors?.length) p.neighbors = pads.filter((q) => q !== p && Math.hypot(q.local[0] - p.local[0], q.local[2] - p.local[2]) < 4).map((q) => String(q.id));
    }
    this.boards.set(inst.uid, rec);
    this._candidates.add(inst);
    return rec;
  }

  _allBoards() {
    for (const inst of this._candidates) if (!this.boards.has(inst.uid) || this.boards.get(inst.uid).inst !== inst) this.board(inst);
    return this.boards.values();
  }

  pad(boardInst, id) { return this.board(boardInst)?.byId.get(String(id)) || null; }
  padState(boardInst, id) { return this.pad(boardInst, id)?.state || null; }

  _invOf(rec) {
    rec.inst.object.updateWorldMatrix(true, false);
    return rec.inv.copy(rec.inst.object.matrixWorld).invert();
  }
  _nLocal(p) { return p.side === 'top' ? 1 : -1; }
  /** Tâm pad + pháp tuyến (thế giới) */
  padWorld(rec, p, outC = new THREE.Vector3(), outN = null) {
    rec.inst.object.updateWorldMatrix(true, false);
    outC.set(p.local[0], p.local[1], p.local[2]).applyMatrix4(rec.inst.object.matrixWorld);
    if (outN) outN.set(0, this._nLocal(p), 0).transformDirection(rec.inst.object.matrixWorld);
    return outC;
  }

  /** Ghép chân linh kiện đang cắm trên board vào pad (theo vị trí đầu chân) */
  _refreshLeads(rec) {
    rec.leadsDirty = false;
    const old = new Map();
    for (const [uid, list] of rec.leadPads) for (const p of list) old.set(p, p.lead);
    rec.leadPads.clear();
    const seen = new Set();
    const obj = rec.inst.object;
    obj.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
    for (const it of this.game.items?.all || []) {
      if (!it.socket || it === rec.inst) continue;
      const s = this.game.sockets?.get(it.socket);
      if (!s || s.owner !== rec.inst) continue;
      let pins;
      try { pins = it.def.getPins?.(it) ?? it.def.pins ?? []; } catch { pins = it.def.pins || []; }
      it.object.updateWorldMatrix(true, false);
      const th = leadThermal(it.def);
      for (const pin of pins) {
        _loc.set(pin.pos[0], pin.pos[1], pin.pos[2]).applyMatrix4(it.object.matrixWorld).applyMatrix4(inv);
        const p = this._nearestPadLocal(rec, _loc, 0.7);
        if (!p) continue;
        const L = (_loc.y - p.local[1]) * this._nLocal(p);     // độ nhô của chân ra phía mặt hàn
        if (L < -0.3) continue;                                 // chân không xuyên tới mặt hàn
        const prev = old.get(p);
        const same = prev && prev.item === it && prev.pinId === String(pin.id);
        const lead = { item: it, pinId: String(pin.id), r: th.r, C: th.C, h: th.h, L: Math.max(0.3, L), trimmed: same ? prev.trimmed : false, cutL: same ? prev.cutL : null };
        if (lead.trimmed && lead.cutL != null) lead.L = Math.min(lead.L, lead.cutL);
        if (!same) { p.leadWet = 0; p.dirty = true; rec.dirty.add(p); }
        else if (Math.abs((prev.L || 0) - lead.L) > 0.05) { p.dirty = true; rec.dirty.add(p); }
        p.lead = lead;
        p.leadId = `${it.uid}/${pin.id}`;
        seen.add(p);
        if (!rec.leadPads.has(it.uid)) rec.leadPads.set(it.uid, []);
        rec.leadPads.get(it.uid).push(p);
      }
    }
    for (const [p] of old) if (!seen.has(p)) { p.lead = null; p.leadId = null; p.dirty = true; rec.dirty.add(p); }
    this._netChanged();
  }

  /** Cắm "im lặng" (tải bản lưu, sockets.insert instant) không phát sự kiện → 2 lần/s so chữ ký linh kiện cắm trên mỗi board */
  _scanSockets(dt) {
    this._scanT = (this._scanT || 0) - dt;
    if (this._scanT > 0 || !this.boards.size) return;
    this._scanT = 0.5;
    const sig = this._sig || (this._sig = new Map());
    sig.clear();
    for (const it of this.game.items?.all || []) {
      if (!it.socket) continue;
      const owner = this.game.sockets?.get(it.socket)?.owner;
      if (owner && this.boards.has(owner.uid)) sig.set(owner.uid, (sig.get(owner.uid) || '') + it.uid + '@' + it.socket + ';');
    }
    for (const rec of this.boards.values()) {
      const s = sig.get(rec.uid) || '';
      if (s !== rec.sig) { rec.sig = s; rec.leadsDirty = true; }
    }
  }

  _onSocket(e, inserted) {
    const s = e.socket, it = e.item;
    if (!s || !it) return;
    const owner = s.owner;
    if (!owner || typeof owner.def?.solderPads !== 'function') return;
    const rec = this.board(owner);
    if (!rec) return;
    if (!inserted) {
      // rút linh kiện khi mối hàn còn CỨNG → giật tróc pad
      const list = rec.leadPads.get(it.uid) || [];
      let torn = 0;
      for (const p of list) {
        if (p.solderVol >= FILM_MM3 && !p.molten && p.state !== 'empty' && p.state !== 'lifted') {
          p.state = 'lifted'; p.dirty = true; rec.dirty.add(p); torn++;
        }
      }
      if (torn) {
        this._toast(`Giật ${it.def.name || 'linh kiện'} ra khi ${torn} mối hàn còn cứng → bong ${torn} pad! Phải hút thiếc trước.`, 'danger', 'torn');
        this._emit('fault', { kind: 'pad-torn', item: it, count: torn });
        this._emit('solder:lifted', { board: owner, count: torn, by: 'torn' });
      }
    }
    rec.leadsDirty = true;
    this._refreshLeads(rec);
  }

  /** Pad gần điểm cục bộ nhất (theo mặt phẳng board) trong bán kính maxR (mm) */
  _nearestPadLocal(rec, local, maxR = 2) {
    if (rec.grid) {
      const h = rec.def.nearestHoleLocal(local.x, local.z);
      if (!h || h.dist > maxR) return null;
      return rec.byId.get(String(h.id)) || null;
    }
    let best = null, bd = maxR;
    for (const p of rec.pads) {
      const d = Math.hypot(local.x - p.local[0], local.z - p.local[2]);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  /** Khoảng cách (mm) từ điểm cục bộ tới bề mặt "mối hàn" (vòng đồng + nón thiếc + chân nhô) — và vị trí dọc chân */
  _jointDist(rec, p, local) {
    const nl = this._nLocal(p);
    const dy = (local.y - p.local[1]) * nl;                  // độ cao phía mặt hàn (mm)
    const rr = Math.hypot(local.x - p.local[0], local.z - p.local[2]);
    const ring = (p.ring ?? 0.9) + (p.solderVol > 2 ? 0.15 : 0);
    const L = p.lead ? p.lead.L : 0;
    const fh = Math.max(0.25, p._fH || 0);                    // chiều cao nón thiếc hiện tại
    const rTop = p.lead ? p.lead.r : 0;
    let d;
    if (dy < 0) d = Math.hypot(Math.max(0, rr - ring), -dy);                                   // phía kia board
    else if (dy <= fh) d = Math.max(0, rr - Math.max(ring + (rTop - ring) * (dy / fh), rTop)); // nón thiếc / vòng đồng
    else if (dy <= L) d = Math.max(0, rr - rTop);                                              // thân chân nhô
    else d = Math.hypot(Math.max(0, rr - rTop), dy - Math.max(L, fh));                         // trên đầu chân
    return { d, along: clamp(dy, 0, L), dy, rr };
  }

  /** Tìm pad mà điểm thế giới `world` đang chạm (≤ maxD mm) — { rec, pad, d, along } */
  findJoint(world, maxD = CONTACT_IRON_MM) {
    let best = null;
    for (const rec of this._allBoards()) {
      if (!rec.inst.object.parent || rec.inst.heldBy || rec.inst.inBag) continue;
      if (rec.leadsDirty) this._refreshLeads(rec);
      _loc.copy(world).applyMatrix4(this._invOf(rec));
      if (Math.abs(_loc.x) > rec.half[0] || Math.abs(_loc.z) > rec.half[1] || _loc.y < -40 || _loc.y > rec.thickness + 40) continue;
      const cands = [];
      const c = this._nearestPadLocal(rec, _loc, 3.2);
      if (c) { cands.push(c); for (const id of c.neighbors || []) { const q = rec.byId.get(String(id)); if (q) cands.push(q); } }
      for (const p of cands) {
        const j = this._jointDist(rec, p, _loc);
        if (j.d <= maxD && (!best || j.d < best.d)) best = { rec, pad: p, d: j.d, along: j.along };
      }
    }
    return best;
  }

  /** Điểm chạm gợi ý (thế giới): mũi hàn (phía người chơi) + điểm đưa thiếc (phía đối diện) */
  contactPoints(boardInst, padId, viewFrom = null) {
    const rec = this.board(boardInst);
    const p = rec?.byId.get(String(padId));
    if (!p) return null;
    if (rec.leadsDirty) this._refreshLeads(rec);
    const center = this.padWorld(rec, p, new THREE.Vector3(), _n);
    const normal = _n.clone();
    const eye = viewFrom || this.game.camera?.getWorldPosition(new THREE.Vector3()) || center.clone().add(new THREE.Vector3(0, 400, 400));
    const lat = new THREE.Vector3().subVectors(eye, center);
    lat.addScaledVector(normal, -lat.dot(normal));
    if (lat.lengthSq() < 1e-6) lat.set(1, 0, 0).applyQuaternion(rec.inst.object.getWorldQuaternion(_q));
    lat.normalize();
    const ring = p.ring ?? 0.9;
    const L = p.lead ? p.lead.L : 0;
    const iron = center.clone().addScaledVector(normal, 0.35 + Math.min(L, 0.8) * 0.5).addScaledVector(lat, ring * 0.7);
    const feed = center.clone().addScaledVector(normal, 0.6).addScaledVector(lat, -(ring + 0.25));
    return { center, normal, lateral: lat, iron, feed, pad: p };
  }

  // =========================================================================== đầu vào
  _tool(id) {
    const inv = this.game.inventory;
    if (this.debug?.tools?.[id]) return this.debug.tools[id];
    for (const t of [inv?.rightTool, inv?.leftTool]) if (t?.def?.id === id) return t;
    return null;
  }
  _anyTool(id) {
    const t = this._tool(id);
    if (t) return t;
    const inv = this.game.inventory;
    for (const s of inv?.slots || []) if (s?.def?.id === id) return s;
    return this.game.items?.all.find((i) => i.def?.id === id) || null;
  }
  _using(inst) {
    if (!inst) return false;
    const it = this.game.interact;
    if (!it?.uses) return false;
    for (const u of it.uses.values()) if (u.tool === inst) return true;
    return false;
  }
  _tipOf(inst, out) {
    const h = this.game.hands;
    if (!inst || !h) return null;
    const side = inst.heldBy === 'left' ? 'left' : inst.heldBy === 'right' ? 'right' : null;
    if (!side) return null;
    return h[side].tipWorldPosition(out);
  }

  _inputs() {
    const d = this.debug;
    const I = this._in || (this._in = { iron: null, ironTip: new THREE.Vector3(), ironDown: false, wire: null, wireTip: new THREE.Vector3(), wireDown: false, wick: null, wickTip: new THREE.Vector3(), wickDown: false, hasIronTip: false, hasWireTip: false, hasWickTip: false });
    I.iron = d ? (d.tools?.['soldering-iron'] || this._anyTool('soldering-iron')) : this._tool('soldering-iron');
    I.wire = d ? (d.tools?.['solder-wire'] || this._anyTool('solder-wire')) : this._tool('solder-wire');
    I.wick = d ? (d.tools?.['solder-wick'] || this._anyTool('solder-wick')) : this._tool('solder-wick');
    if (d) {
      I.hasIronTip = !!d.iron?.tip; if (I.hasIronTip) I.ironTip.copy(d.iron.tip); I.ironDown = !!d.iron?.down && I.hasIronTip;
      I.hasWireTip = !!d.wire?.tip; if (I.hasWireTip) I.wireTip.copy(d.wire.tip); I.wireDown = !!d.wire?.down && I.hasWireTip;
      I.hasWickTip = !!d.wick?.tip; if (I.hasWickTip) I.wickTip.copy(d.wick.tip); I.wickDown = !!d.wick?.down && I.hasWickTip;
    } else {
      I.hasIronTip = !!(I.iron && this._tipOf(I.iron, I.ironTip)); I.ironDown = I.hasIronTip && this._using(I.iron);
      I.hasWireTip = !!(I.wire && this._tipOf(I.wire, I.wireTip)); I.wireDown = I.hasWireTip && this._using(I.wire);
      I.hasWickTip = !!(I.wick && this._tipOf(I.wick, I.wickTip)); I.wickDown = I.hasWickTip && this._using(I.wick);
    }
    return I;
  }

  /** Trợ ngắm: tâm ngắm gần pad → đặt điểm với tay vào đúng mối hàn (ghi đè interact.fixedUpdate trong cùng bước) */
  _snapHands(I) {
    if (this.debug || !this.game.hands || !this.game.interact) return;
    const it = this.game.interact;
    // [UX] chế độ tỉ mỉ / kính hiển vi: ưu tiên con trỏ 3D (interact.pointer) thay cho tia tâm màn hình
    const hit = it.pointer?.active ? it.pointer.hit : it.hit;
    if (!hit?.point || !it.target?.inReach) { this._aim = null; return; }
    const j = this.findJoint(hit.point, STICKY_MM);
    this._aim = j;
    if (!j) return;
    const cp = this.contactPoints(j.rec.inst, j.pad.id);
    if (!cp) return;
    const h = this.game.hands;
    if (I.iron && I.ironDown) h.setReach('right', cp.iron);
    const pump = this._tool('desolder-pump');
    if (I.wire && I.wireDown) h.setReach('left', cp.feed);
    else if (I.wick && I.wickDown) h.setReach('left', cp.center.clone().addScaledVector(cp.normal, 0.35 + (j.pad.lead ? Math.min(1, j.pad.lead.L) : 0)));
    else if (pump && pump.heldBy === 'left' && pump.state?.cocked) h.setReach('left', cp.center.clone().addScaledVector(cp.normal, 1.2 + (j.pad.lead ? j.pad.lead.L : 0)));
    const flux = this._tool('flux-pen');
    if (flux && this._using(flux)) h.setReach('right', cp.center.clone().addScaledVector(cp.normal, 0.25));
  }

  // =========================================================================== vòng lặp logic (60 Hz)
  fixedUpdate(dt) {
    if (!(dt > 0)) return;
    this._t += dt;
    this._frameId = (this._frameId || 0) + 1;
    const game = this.game;
    if (this._pendingLoad) this._applyLoad();
    this._scanSockets(dt);
    const amb = this._ambient();
    const I = this._inputs();
    this._snapHands(I);
    const iron = I.iron, is = iron?.state;
    const tipT = is?.tipTemp ?? amb;
    const tipWet = iron?.def?.wetting ? iron.def.wetting(iron) : 0.8;
    if (is && is.blob == null) is.blob = 0;
    // [PRO] mũi đang lắp: diện tích tiếp xúc THT (docs/07 §13.1); mỏ hàn chưa có mũi → không hàn được
    const tp = this.pro?.tipParams?.(iron) ?? null;
    const noTip = !!(iron && is && 'tip' in is && !is.tip);

    // ---- dây hút thiếc đặt trên pad nào?
    let wickJ = null;
    if (I.wick && I.wickDown) wickJ = this.findJoint(I.wickTip, 2.4);
    const ironOnWick = !!(wickJ && I.ironDown && I.ironTip.distanceTo(I.wickTip) < 3.2);

    // ---- mũi hàn chạm pad nào?
    let c = null;
    if (iron && I.ironDown && noTip) this._hint('Mỏ hàn CHƯA LẮP MŨI — nhìn một mũi trên giá rồi bấm T (hoặc dùng miếng chịu nhiệt)', 'no-tip');
    else if (iron && I.ironDown) {
      if (ironOnWick) c = { rec: wickJ.rec, pad: wickJ.pad, d: 0, along: 0, viaWick: true };
      else c = this.findJoint(I.ironTip, CONTACT_IRON_MM);
    }
    const prev = this.contact;
    if (c) {
      if (prev?.pad === c.pad) c.t0 = prev.t0; else {
        c.t0 = this._t;
        this._coldFed = 0;
        // kéo mũi từ pad A (đang chảy, nhiều thiếc) sang pad kề B → thiếc kéo theo thành cầu
        const pc = this._prevContact;
        if (pc && pc.pad !== c.pad && this._t - pc.t < 0.4 && pc.rec === c.rec && (pc.pad.neighbors || []).map(String).includes(String(c.pad.id))) {
          const A = pc.pad;
          if (A.molten && A.solderVol > 0.75 * volumeLimits(A).max && !A.bridges.includes(c.pad._key)) this._addBridge(c.rec, A, c.pad, 'drag');
        }
        this._emit('iron:contact', { pad: c.pad, padId: c.pad.id, board: c.rec.inst });
      }
      const alloy = this._alloyOf(c.pad, I.wire);
      c.G = contactG(c.pad, { tipWet, tinned: is?.tinned ?? 0.5, blob: is?.blob || 0, along: c.along, wick: !!c.viaWick, alloy, area: tp?.area ?? 2.15, width: tp?.width ?? 2.0 });
      c.rec.active.add(c.pad);
      // [PRO] ghi mũi/nhiệt; mũi rộng chạm sang pad kề
      if (this.pro) { try { c.nb = this.pro.onContact(c, iron, dt, tipT); } catch (e) { this._proErr(e); } }
      if (c.nb) for (const [q] of c.nb) c.rec.active.add(q);
    } else if (prev) {
      this._prevContact = { rec: prev.rec, pad: prev.pad, t: this._t };
    }
    if (prev && (!c || c.pad !== prev.pad) && this.pro) { try { this.pro.onLift(prev.pad, tipT, this._alloyOf(prev.pad, I.wire)); } catch (e) { this._proErr(e); } }
    this.contact = c;

    // ---- thiếc lỏng bám mũi chuyển sang mối hàn
    if (c && is?.blob > 0) {
      const t = Math.min(is.blob, 2.5 * dt);
      is.blob -= t;
      this._addSolder(c.pad, t, 0, null);
    }

    // ---- đưa dây thiếc
    const Pmelt = this._feed(dt, I, c, tipT);

    // ---- nhiệt từng pad đang hoạt động
    let load = 0;
    for (const rec of this.boards.values()) {
      if (!rec.active.size) continue;
      // duyệt BẢN CHỤP (pad thêm vào trong bước này — vd pad nối cầu thiếc — được mô phỏng từ bước sau; tránh vòng lặp vô hạn)
      const list = this._act || (this._act = []);
      list.length = 0;
      for (const p of rec.active) list.push(p);
      for (const p of list) {
        const alloy = this._alloyOf(p, I.wire);
        const coupling = p.bridges.length ? p.bridges.map((k) => [this._padByKey(k), BRIDGE_G]).filter((x) => x[0]) : null;
        const onWick = wickJ && wickJ.pad === p;
        let G = c && c.pad === p ? c.G : 0;
        if (!G && c?.nb) for (const [q, g] of c.nb) if (q === p) G = g;
        load += stepThermal(p, dt, { tipT, G, ambient: amb, Pmelt: Pmelt.get(p) || 0, coupling, extraC: onWick ? 0.03 : 0, extraH: onWick ? 0.015 : 0 });
        if (coupling && p.T > amb + 3) for (const [q] of coupling) rec.active.add(q);
        // flux tiếp xúc mũi cháy ở nhiệt độ hỗn hợp mũi/pad (docs/07 §3.2: > 350 °C flux hoá đen)
        const chem = stepChemistry(p, dt, alloy, G > 0 ? 0.6 * tipT + 0.4 * p.T : p.T);
        if (chem.fluxBurn > 0) this._fluxSmoke(rec, p, chem.fluxBurn, dt);
        this._phaseChange(rec, p, alloy, c);
        if (onWick && p.molten) this._wickAbsorb(rec, p, I.wick, dt);
        // thiếc lỏng đang thấm dần: cục tròn "sụp" thành nón — vẽ lại ~6 lần/s (geometry đã cache theo khoá)
        if (p.molten && (this._frameId % 10 === 0)) { p.dirty = true; rec.dirty.add(p); }
        // bong pad
        if (p.overheat > LIFT_SECONDS && p.state !== 'lifted') this._lift(rec, p);
        // nguội hẳn → ngừng mô phỏng
        if (!(c && c.pad === p) && !p.molten && p.T < amb + 1.5) { p.T = amb; rec.active.delete(p); }
      }
      this._checkBridges(rec, c);
    }
    // [PRO] mũi rộng chạm 2 pad đang chảy, thiếc đủ nhiều → cầu thiếc ("mũi rộng hơn ~1,2× pad", docs/07 §13.3)
    if (c?.nb && c.pad.molten) for (const [q] of c.nb) {
      if (!q.molten || c.pad.bridges.includes(q._key)) continue;
      const la = volumeLimits(c.pad), lb = volumeLimits(q);
      if (c.pad.solderVol + q.solderVol > 0.9 * (la.ideal + lb.ideal) && q.solderVol > 0.4) this._addBridge(c.rec, c.pad, q, 'tip');
    }
    if (iron?.def?.load && load > 0) iron.def.load(iron, load);
    this._lastLoad = load;
    if (this.pro) { try { this.pro.update(dt, c, I); } catch (e) { this._proErr(e); } }

    // ---- âm thanh xèo theo dòng nhiệt
    this._audio(c, load, I);
    // ---- an toàn
    this._safety(dt, I, tipT, c);
  }

  _ambient() { return labState(this.game).ambient ?? AMBIENT_FALLBACK; }
  _proErr(e) { if (!this._proErrShown) { this._proErrShown = true; console.error('[soldering] solder-pro lỗi', e); } }
  _alloyOf(p, wire) {
    if (p.alloy) return ALLOYS[p.alloy] || ALLOYS.Sn63Pb37;
    return wire ? alloyOf(wire.state?.alloy || wire.def) : ALLOYS.Sn63Pb37;
  }
  _padByKey(key) {
    const i = key.lastIndexOf('/');
    const rec = this.boards.get(key.slice(0, i));
    return rec?.byId.get(key.slice(i + 1)) || null;
  }

  /** Thêm thiếc vào pad (mm³), kèm nhựa thông */
  _addSolder(p, vol, flux, alloy) {
    if (!(vol > 0)) return;
    p.solderVol += vol; p.V = p.solderVol;
    if (flux > 0) p._ncFrac = ((p._ncFrac || 0) * p.flux) / Math.max(1e-6, p.flux + flux);     // lõi thiếc = RMA/ROM1 (docs/07 §7.2)
    p.flux = Math.min(2, p.flux + flux);
    if (alloy) p.alloy = !p.alloy || (ALLOYS[p.alloy]?.liquidus ?? 0) < alloy.liquidus ? alloy.id : p.alloy;
    p.dirty = true;
    p._rec?.dirty.add(p);
    p._rec?.active.add(p);
    if (p.state === 'empty') p.reworked = true;
  }

  /** Đưa thiếc: trả Map(pad → công suất nung chảy W) */
  _feed(dt, I, c, tipT) {
    const out = this._pm || (this._pm = new Map());
    out.clear();
    const wire = I.wire;
    if (!wire || !I.wireDown) {
      if (this._feedPad && this.pro) { try { this.pro.onFeedEnd(this._feedPad); } catch (e) { this._proErr(e); } }
      this._feedPad = null;
      this._feedState = null; return out;
    }
    const game = this.game, iron = I.iron, is = iron?.state;
    const dia = wire.def.diameter || 0.8;
    const area = Math.PI * (dia / 2) ** 2;
    const rate = wire.def.feedRate || 6;                         // mm/s
    const req = Math.min(rate * dt, wire.state?.lengthMm ?? Infinity);
    if (!(req > 0)) return out;
    const dv = req * area;
    const alloy = alloyOf(wire.state?.alloy || wire.def);
    const j = this.findJoint(I.wireTip, CONTACT_WIRE_MM);
    const nearIron = !!(iron && I.hasIronTip && I.wireTip.distanceTo(I.ironTip) <= NEAR_IRON_MM);
    const ironHot = tipT > alloy.liquidus + 10;
    let melted = 0;
    this._feedState = 'touch';
    if (j) {
      const p = j.pad;
      if (p.state === 'lifted' && p.solderVol > 6) { this._hint('Pad đã bong — không hàn lại được, phải nối dây sang pad khác', 'lifted-feed'); return out; }
      if (p.T >= alloy.liquidus) {
        melted = dv;
        this._addSolder(p, dv, dv * WIRE_FLUX_PER_MM3, alloy);
        this._feedPad = p;
        if (this.pro) { try { this.pro.onFeed(p, dv, iron, tipT); } catch (e) { this._proErr(e); } }
        out.set(p, (out.get(p) || 0) + (dv * MELT_J_PER_MM3) / dt);
        this._feedState = p.T >= alloy.flowT ? 'flow' : 'bead';
        if (p.T < alloy.flowT) this._hint(`Pad mới ${Math.round(p.T)} °C — thiếc vón cục, chưa chảy loang (cần ≥ ${alloy.flowT} °C)`, 'bead');
      } else if (c && c.pad === p && ironHot) {
        // pad còn nguội: thiếc chỉ chảy chỗ chạm mũi hàn → vo tròn trên mũi, lõi nhựa thông cháy mất trên mũi
        melted = dv;
        is.blob = (is.blob || 0) + dv * 0.6;
        this._addSolder(p, dv * 0.4, dv * 0.4 * WIRE_FLUX_PER_MM3 * 0.3, alloy);
        this._coldFed += dv;
        this._feedState = 'cold';
        this._puff(I.ironTip, 0.6);
        if (this._coldFed > 0.35) {
          this._warn(`Pad mới ${Math.round(p.T)} °C (< ${alloy.flowT} °C) — thiếc chảy trên MŨI HÀN chứ không thấm vào pad. Giữ mũi lâu hơn rồi mới đưa thiếc!`, 'cold-feed');
          this._emit('solder:cold-feed', { pad: p, padId: p.id, board: j.rec.inst, padT: p.T });
        }
      } else if (nearIron && ironHot) {
        melted = this._intoIron(dv, I, c, alloy);
      } else {
        this._feedState = 'cold-touch';
        this._hint('Pad nguội — thiếc không chảy. Áp mũi hàn vào pad + chân trước 1–2 s', 'no-melt');
      }
    } else if (nearIron && ironHot) {
      melted = this._intoIron(dv, I, c, alloy);
    } else this._feedState = 'air';
    if (melted > 0) {
      const mm = melted / area;
      if (wire.def.feed) wire.def.feed(wire, mm, game); else if (wire.state) wire.state.lengthMm = Math.max(0, (wire.state.lengthMm || 0) - mm);
      this._emit('solder:feed', { instance: wire, mm, volume: melted, pad: j?.pad || null, mode: this._feedState });
    }
    return out;
  }

  /** Thiếc chạm mũi hàn (không phải mối hàn): tráng mũi; nếu đang hàn → cảnh báo, bắn tóe, oxy hoá */
  _intoIron(dv, I, c, alloy) {
    const iron = I.iron, is = iron.state;
    iron.def.tin?.(iron, dv * 0.15, this.game, alloy?.id);
    is.blob = (is.blob || 0) + dv;
    this._feedState = 'iron';
    this._puff(I.ironTip, 0.8);
    if (c) {
      this.stats.intoIron++;
      is.oxidation = Math.min(1, (is.oxidation || 0) + 0.004);
      if (this._ready('splat', 0.7)) this.game.fx?.sparks?.(I.ironTip.clone(), { count: 6, speed: 25, size: 0.35, color: 0xfff0c8 });
      this._warn('Đưa thiếc vào MŨI HÀN, không phải chỗ tiếp xúc pad/chân! Nhựa thông cháy hết trên mũi → mối hàn xỉn, bắn tóe.', 'into-iron');
      this._emit('solder:into-iron', { pad: c.pad, padId: c.pad.id, board: c.rec.inst, volume: dv });
    } else if (is.blob > 1.3) {
      // dồn thiếc lên mũi quá nhiều → giọt rơi
      is.blob -= 0.9;
      const m = new THREE.Mesh(ballGeo(), solderMats().ball);
      m.position.copy(I.ironTip);
      this.particles.fly(m, new THREE.Vector3((Math.random() - 0.5) * 60, -50, (Math.random() - 0.5) * 60), new THREE.Vector3(0, 0, 0), 2.5);
      this._warn('Giọt thiếc rơi khỏi mũi — chỉ tráng một lớp mỏng thôi', 'drip');
      this._emit('solder:drip', { volume: 0.9 });
    }
    return dv;
  }

  _phaseChange(rec, p, alloy, c) {
    const was = p.molten;
    p.molten = p.solderVol > 0.05 && p.T > alloy.liquidus;
    if (!was && p.molten) {
      p.peakT = p.T;
      p.reworked = true;
      p.dirty = true; rec.dirty.add(p);
      if (this.pro) { try { this.pro.onMelt(p); } catch (e) { this._proErr(e); } }
      this._emit('solder:melt', { pad: p, padId: p.id, board: rec.inst });
    } else if (was && !p.molten) {
      p.dirty = true; rec.dirty.add(p);
      if (p.solderVol < 0.05 || p.T <= alloy.solidus) this._solidify(rec, p, alloy);
      else p.molten = true;        // giữa solidus và liquidus (hợp kim không cùng tinh): vẫn nhão
    }
    if (p.molten && p.T > alloy.liquidus) {
      // tràn sang pad bên cạnh khi quá nhiều thiếc
      const lim = volumeLimits(p);
      let nbMax = 0;
      for (const id of p.neighbors || []) { const q = rec.byId.get(String(id)); if (q) nbMax = Math.max(nbMax, q.solderVol); }
      const thr = Math.max(lim.max + 0.8, lim.bridge - 0.5 * nbMax);
      if (p.solderVol > thr) {
        const nb = this._bridgeTarget(rec, p, c);
        if (nb && !p.bridges.includes(nb._key)) this._addBridge(rec, p, nb, 'overfeed');
      }
    }
  }

  _solidify(rec, p, alloy) {
    if (!p.reworked) return;
    p.reworked = false;
    const prev = p.state;
    const r = evaluateJoint(p, alloy);
    p.state = r.state;
    p.issues = r.issues;
    p.dirty = true; rec.dirty.add(p);
    if (this.pro) { try { this.pro.onSolidify(rec, p, r, alloy); } catch (e) { this._proErr(e); } }
    if (r.state === 'empty' && prev === 'empty') return;
    this.stats.joints++;
    if (this.stats[r.state] != null) this.stats[r.state]++;
    const near = this.contact?.pad === p || (this._prevContact?.pad === p && this._t - this._prevContact.t < 4);
    const t = jointToast(r.state, r.issues);
    if (t && near && r.state !== 'empty') this._toast(t.msg, t.kind, `joint-${r.state}`, 0.6);
    if (r.state === 'good') this.game.audio?.play?.('toast', { vol: 0.25 });
    this._emit('solder:joint', { pad: p, padId: p.id, board: rec.inst, node: p._key, leadId: p.leadId, quality: r.state, stats: r.stats, issues: r.issues });
    this._netChanged();
  }

  _bridgeTarget(rec, p, c) {
    let best = null, bs = -Infinity;
    const tip = c && c.rec === rec ? this._in?.ironTip : null;
    for (const id of p.neighbors || []) {
      const q = rec.byId.get(String(id));
      if (!q || q.state === 'lifted') continue;
      let s = q.solderVol * 2;
      if (tip) { const w = this.padWorld(rec, q, _v3); s -= w.distanceTo(tip); }
      if (s > bs) { bs = s; best = q; }
    }
    return best;
  }

  _addBridge(rec, a, b, why) {
    if (a.bridges.includes(b._key)) return;
    a.bridges.push(b._key); b.bridges.push(a._key);
    const lim = volumeLimits(a);
    const move = Math.max(0.3, 0.35 * (a.solderVol - lim.max));
    const mv = Math.min(move, a.solderVol * 0.5);
    // [PRO] cầu MẢNH (ít thiếc) chỉ thấy dưới kính ≥ 7,5–10× (docs/07 §13.4)
    if (why === 'drag' && a.solderVol + b.solderVol < 0.8 * (lim.max + volumeLimits(b).max)) { (a._thinBridge ||= new Set()).add(b._key); (b._thinBridge ||= new Set()).add(a._key); }
    a.solderVol -= mv; a.V = a.solderVol;
    b.solderVol += mv; b.V = b.solderVol;
    b.T = Math.max(b.T, a.T - 25);
    b.alloy = b.alloy || a.alloy;
    b.reworked = a.reworked = true;
    b.state = 'bridge'; a.state = 'bridge';
    rec.active.add(b); rec.active.add(a);
    a.dirty = b.dirty = true; rec.dirty.add(a); rec.dirty.add(b);
    this.stats.bridge++;
    this._toast(`CẦU THIẾC giữa pad ${a.id} và ${b.id} — chập mạch! ${why === 'drag' ? '(kéo mũi hàn đầy thiếc sang pad bên)' : why === 'tip' ? '(mũi quá rộng chạm 2 pad)' : '(quá nhiều thiếc)'}`, 'danger', 'bridge', 1);
    this.game.hud?.flash?.('warn');
    this._emit('solder:bridge', { a: a._key, b: b._key, board: rec.inst, padA: a, padB: b, reason: why });
    this._netChanged();
  }

  _removeBridge(rec, a, b) {
    a.bridges = a.bridges.filter((k) => k !== b._key);
    b.bridges = b.bridges.filter((k) => k !== a._key);
    a._thinBridge?.delete(b._key); b._thinBridge?.delete(a._key);
    for (const p of [a, b]) { p.reworked = true; p.dirty = true; rec.dirty.add(p); if (!p.bridges.length && p.state === 'bridge') p.state = p.solderVol < FILM_MM3 ? 'empty' : 'cold'; }
    this._toast(`Đã tách cầu thiếc ${a.id} ↔ ${b.id} ✓`, 'success', 'bridge-off', 1);
    this._emit('solder:bridge-removed', { a: a._key, b: b._key, board: rec.inst });
    this._netChanged();
  }

  /** Cầu thiếc tự tách khi bớt thiếc (hút) hoặc có nhựa thông + mũi hàn kéo (sức căng bề mặt) */
  _checkBridges(rec, c) {
    for (const a of rec.active) {
      if (!a.bridges.length) continue;
      for (const k of [...a.bridges]) {
        const b = this._padByKey(k);
        if (!b) { a.bridges = a.bridges.filter((x) => x !== k); continue; }
        if (!(a.molten || b.molten)) continue;
        const la = volumeLimits(a), lb = volumeLimits(b);
        const total = a.solderVol + b.solderVol;
        const fluxy = Math.max(a.flux, b.flux) > 0.3 && c && (c.pad === a || c.pad === b);
        if (total < 0.55 * (la.max + lb.max) || (fluxy && a.molten && b.molten && total < 0.85 * (la.max + lb.max))) this._removeBridge(rec, a, b);
      }
    }
  }

  _lift(rec, p) {
    p.state = 'lifted';
    p.reworked = true;
    p.dirty = true; rec.dirty.add(p);
    this.stats.lifted++;
    const pos = this.padWorld(rec, p, new THREE.Vector3());
    this.game.fx?.smoke?.(pos, { size: 3, duration: 1.2, rate: 16, color: 0x3a3028 });
    this._toast(`BONG PAD ${p.id} — quá ${Math.round(p.T)} °C quá lâu! Keo epoxy dưới vòng đồng đã cháy.`, 'danger', 'lift', 1);
    this._emit('solder:lifted', { pad: p, padId: p.id, board: rec.inst, by: 'overheat' });
    this._emit('fault', { kind: 'pad-lifted', item: rec.inst, pad: p.id });
    this._netChanged();
  }

  _wickAbsorb(rec, p, wick, dt) {
    const s = wick?.state;
    if (!s || !(s.lengthMm > 0)) return;
    const cap = clamp01(1 - (s.saturation || 0));
    if (cap <= 0.02) { this._hint('Đầu bấc đã no thiếc (bạc) — nhấn R cắt bỏ đoạn đó', 'wick-full'); return; }
    // mao dẫn: bấc đồng có nhựa thông hút thiếc lỏng ~2.5 mm³/s khi còn trống
    p.flux = Math.min(2, p.flux + 0.25 * dt);
    const dv = Math.min(p.solderVol - 0.08, 2.5 * cap * dt);
    if (dv <= 0) return;
    p.solderVol -= dv; p.V = p.solderVol;
    p.dirty = true; rec.dirty.add(p);
    wick.def.absorb?.(wick, dv);
    this._removedAcc = (this._removedAcc || 0) + dv;
    if (p.solderVol < FILM_MM3 + 0.05 || this._removedAcc > 0.8) {
      this._emit('solder:removed', { pad: p, padId: p.id, board: rec.inst, amount: +this._removedAcc.toFixed(2), by: 'wick' });
      this._removedAcc = 0;
    }
  }

  // =========================================================================== sự kiện dụng cụ
  _onFlux(e) {
    const pos = e.pos?.isVector3 ? e.pos : null;
    let j = pos ? this.findJoint(pos, 2.5) : null;
    if (!j && this._aim) j = this._aim;
    if (!j) return;
    const p = j.pad;
    const add = (e.amount || 0.0005) * PEN_FLUX_PER_ML;
    p._ncFrac = ((p._ncFrac || 0) * p.flux + add) / Math.max(1e-6, p.flux + add);      // bút no-clean
    p.flux = Math.min(2, p.flux + add);
    if (p.char > 0) p.char = Math.max(0, p.char - add * 0.3);                            // flux mới hoà bớt cặn cháy
    p.dirty = true; j.rec.dirty.add(p); j.rec.active.add(p);
    if (p.T > 150) { this.game.audio?.play?.('hiss', { pos: this.padWorld(j.rec, p, _v2).clone(), vol: 0.35 }); }
    if (this._ready(`flux:${p._key}`, 0.5)) this._emit('solder:flux', { pad: p, padId: p.id, board: j.rec.inst, flux: p.flux });
  }

  _onPump(e) {
    const pos = e.pos?.isVector3 ? e.pos : null;
    const j = (pos && this.findJoint(pos, 3.2)) || (this._aim && this.findJoint(this.contactPoints(this._aim.rec.inst, this._aim.pad.id).center, 1)) || null;
    if (!j) return;
    const p = j.pad, rec = j.rec;
    const alloy = this._alloyOf(p);
    if (!p.molten || p.solderVol < 0.1) {
      this._warn(p.solderVol < 0.1 ? 'Pad này không có thiếc để hút' : `Thiếc chưa chảy (${Math.round(p.T)} °C) — nung chảy mối hàn bằng mỏ hàn rồi mới bấm nhả ống hút`, 'pump-cold');
      return;
    }
    // ống hút: luồng khí mạnh kéo ~88 % thiếc lỏng (chảy loang tốt thì hút sạch hơn)
    const frac = p.T >= alloy.flowT ? 0.88 : 0.6;
    const amount = p.solderVol * frac;
    p.solderVol -= amount; p.V = p.solderVol;
    p.T -= 25;                                   // khí lạnh + thiếc mất đi
    p.reworked = true;
    p.dirty = true; rec.dirty.add(p);
    for (const k of [...p.bridges]) { const q = this._padByKey(k); if (q) { q.solderVol *= 0.6; q.V = q.solderVol; this._removeBridge(rec, p, q); } }
    if (p.solderVol < FILM_MM3) { p.state = 'empty'; }
    this.game.audio?.play?.('click', { pos: pos || undefined, vol: 0.7 });
    this._toast(`Hút được ${amount.toFixed(1)} mm³ thiếc${p.solderVol < FILM_MM3 ? ' — pad sạch ✓' : ' — còn sót, hút lại lần nữa'}`, 'info', 'pump', 0.3);
    this._emit('solder:removed', { pad: p, padId: p.id, board: rec.inst, amount: +amount.toFixed(2), by: 'pump' });
    this._netChanged();
  }

  _onCut(e) {
    if (e.what && e.what !== 'lead') return;
    const pos = e.pos?.isVector3 ? e.pos : null;
    if (!pos) return;
    let best = null, bd = 3.5;
    for (const rec of this._allBoards()) {
      if (rec.leadsDirty) this._refreshLeads(rec);
      for (const [, list] of rec.leadPads) for (const p of list) {
        if (!p.lead || p.lead.L <= 1.6) continue;
        const c = this.padWorld(rec, p, _v, _n);
        _v2.copy(c).addScaledVector(_n, p.lead.L);
        const d = distToSegment(pos, c, _v2);
        if (d < bd) { bd = d; best = { rec, p }; }
      }
    }
    if (!best) return;
    const { rec, p } = best;
    const lead = p.lead;
    const keep = clamp(Number.isFinite(e.keepMm) ? e.keepMm : 1.0, 0.1, lead.L - 0.2);   // để lại 0,5–1,5 mm (docs/07 §11.8)
    const cut = lead.L - keep;
    const c = this.padWorld(rec, p, new THREE.Vector3(), _n);
    const n = _n.clone();
    // mẩu chân văng ra
    const geo = new THREE.CylinderGeometry(lead.r, lead.r, cut, 6);
    const m = new THREE.Mesh(geo, solderMats().lead);
    m.userData.disposeGeo = true;
    m.position.copy(c).addScaledVector(n, keep + cut / 2);
    m.quaternion.setFromUnitVectors(UP, n);
    const side = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    this.particles.fly(m, side.multiplyScalar(380).addScaledVector(n, 220).add(new THREE.Vector3(0, 300, 0)), new THREE.Vector3(14, 9, 11), 1.6);
    this.game.audio?.play?.('snap', { pos: c, vol: 0.9, rate: 1.6 });
    p._Lpre = lead.L;                       // [PRO] độ dài trước khi cắt → nón thiếc vẽ như đã bị cắt phẳng
    lead.trimmed = true; lead.cutL = keep; lead.L = keep;
    p.version = (p.version || 0) + 1;
    p.dirty = true; rec.dirty.add(p);
    this.stats.trimmed++;
    if (!SOLID_STATES.has(p.state)) this._hint('Nên hàn xong rồi mới cắt chân — cắt trước dễ làm linh kiện tụt khỏi lỗ', 'cut-early');
    this._emit('lead:trimmed', { item: lead.item, pin: lead.pinId, pad: p, padId: p.id, board: rec.inst, lengthMm: +cut.toFixed(1), soldered: SOLID_STATES.has(p.state) });
    // cắt hết các chân của linh kiện → cập nhật mô hình chân (def.trimLeads: tính từ mặt tựa = mặt trên board)
    const list = rec.leadPads.get(lead.item.uid) || [];
    if (list.length && list.every((q) => q.lead?.trimmed)) {
      try { lead.item.def.trimLeads?.(lead.item, rec.thickness + keep); } catch (err) { console.warn('[soldering] trimLeads', err); }
      rec.leadsDirty = true;
    }
  }

  _onKey(e) {
    if (!e.down || e.repeat || e.code !== 'KeyE') return;
    const pump = this._tool('desolder-pump');
    if (!pump || pump.state?.cocked || this.game.app?.paused) return;
    if (this.game.interact?._findPrompt?.('E')) return;      // E đang dùng cho việc khác (nhặt, lật bo…)
    pump.state.cocked = true;
    this.game.audio?.play?.('click', { vol: 0.5 });
    this._emit('desolder:cock', { instance: pump });
  }

  _onToolChanged(e) {
    const prev = e.previous;
    if (prev?.def?.id === 'soldering-iron' && this.game.inventory?.rightTool !== prev) {
      const st = this._stationPos(_v);
      const near = st ? this.game.player?.pos?.distanceTo?.(st) < 1800 : false;
      this.ironReturned = true;
      this._emit('iron:returned', { instance: prev, nearStation: near, temp: prev.state?.tipTemp });
    }
    if (e.right?.def?.id === 'soldering-iron' || e.tool?.def?.id === 'soldering-iron') this.ironReturned = false;
  }

  // =========================================================================== netlist
  _netChanged() { this._netVersion++; this._netCache = null; this._emitNet = true; }

  /** Kết nối điện do hàn tạo ra: chân ↔ pad (mối hàn) và pad ↔ pad (cầu thiếc) */
  connections() {
    const out = [];
    const seen = new Set();
    for (const rec of this.boards.values()) {
      if (rec.leadsDirty) this._refreshLeads(rec);
      for (const [, list] of rec.leadPads) for (const p of list) {
        if (!p.leadId || p.solderVol < FILM_MM3 || !SOLID_STATES.has(p.state) && !p.molten) continue;
        out.push({ a: p.leadId, b: p._key, kind: 'joint', quality: p.molten ? 'molten' : p.state, flaky: p.state === 'cold' || p.state === 'lifted', ohms: p.state === 'good' || p.state === 'excess' ? 0.002 : 0.5 });
      }
      for (const p of rec.pads) for (const k of p.bridges) {
        const key = p._key < k ? `${p._key}|${k}` : `${k}|${p._key}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ a: p._key, b: k, kind: 'bridge', quality: 'bridge', flaky: false, ohms: 0.001 });
      }
    }
    return out;
  }

  /** Nhóm nút cùng điện thế (union-find trên connections) */
  nets() {
    if (this._netCache) return this._netCache.list;
    const parent = new Map();
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    const add = (x) => { if (!parent.has(x)) parent.set(x, x); };
    for (const c of this.connections()) { add(c.a); add(c.b); const ra = find(c.a), rb = find(c.b); if (ra !== rb) parent.set(ra, rb); }
    const groups = new Map();
    for (const x of parent.keys()) { const r = find(x); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(x); }
    const list = [...groups.values()];
    const index = new Map();
    list.forEach((g, i) => g.forEach((x) => index.set(x, i)));
    this._netCache = { list, index };
    return list;
  }
  netOf(node) { this.nets(); const i = this._netCache.index.get(node); return i == null ? [node] : this._netCache.list[i]; }
  sameNet(a, b) { if (a === b) return true; this.nets(); const i = this._netCache.index.get(a); return i != null && i === this._netCache.index.get(b); }
  /** Các cầu thiếc (chập) hiện có */
  shorts() { return this.connections().filter((c) => c.kind === 'bridge'); }

  /** Pad mà chân của một linh kiện xuyên qua: [{ pad, padId, state, board, pin }] */
  partJoints(partInst) {
    const out = [];
    for (const rec of this.boards.values()) {
      if (rec.leadsDirty) this._refreshLeads(rec);
      for (const p of rec.leadPads.get(partInst?.uid) || []) out.push({ pad: p, padId: p.id, state: p.molten ? 'molten' : p.state, board: rec.inst, pin: p.lead?.pinId });
    }
    return out;
  }
  /** Board chứa linh kiện (qua khe pcb-hole) */
  boardOf(partInst) {
    const s = partInst?.socket ? this.game.sockets?.get(partInst.socket) : null;
    return s?.owner && typeof s.owner.def?.solderPads === 'function' ? s.owner : null;
  }
  /** Thống kê mối hàn trên một board */
  boardSummary(boardInst) {
    const rec = this.board(boardInst);
    const s = { good: 0, cold: 0, excess: 0, bridge: 0, lifted: 0, soldered: 0, withLead: 0, leadSoldered: 0 };
    if (!rec) return s;
    for (const p of rec.pads) {
      if (p.state !== 'empty') { s[p.state] = (s[p.state] || 0) + 1; s.soldered++; }
      if (p.lead) { s.withLead++; if (SOLID_STATES.has(p.state)) s.leadSoldered++; }
    }
    return s;
  }

  /** Bus sự kiện SAO CHÉP payload (events.emit) nên điền e.value ở đây không tới được đồng hồ — vẫn điền cho
   *  người nghe khác; đường chính là game.circuit.measure (cài ở constructor nếu chưa có bộ giải mạch). */
  _onMeasure(e) { const v = this.measure(e); if (v !== undefined && e.value === undefined) e.value = v; }

  /** Đồng hồ vạn năng: thang Ω / thông mạch chạm 2 que vào 2 điểm trên board đã hàn → Ω | Infinity | undefined (không phải board) */
  measure(req) {
    if (!req || (req.mode !== 'cont' && req.mode !== 'ohm')) return undefined;
    if (!req.a?.isVector3 || !req.b?.isVector3) return undefined;
    const ja = this.findJoint(req.a, 1.8), jb = this.findJoint(req.b, 1.8);
    if (!ja || !jb) return undefined;
    const node = (j) => j.pad._key;
    const a = node(ja), b = node(jb);
    const flaky = (j) => j.pad.state === 'cold' || j.pad.state === 'lifted';
    if (this.sameNet(a, b)) {
      return (flaky(ja) || flaky(jb)) && Math.random() < 0.4 ? Infinity : (flaky(ja) || flaky(jb) ? 1.5 + Math.random() * 6 : 0.05);
    }
    // điện trở hàn giữa 2 lưới
    const na = new Set(this.netOf(a)), nb = new Set(this.netOf(b));
    for (const rec of this.boards.values()) for (const [uid, list] of rec.leadPads) {
      const part = list[0]?.lead?.item;
      const el = part?.def?.electrical;
      const ohms = part?.state?.ohms ?? el?.ohms;
      if (!el || el.type !== 'resistor' || !(ohms > 0) || list.length < 2) continue;
      const pa = list.find((p) => p.leadId && na.has(p.leadId)), pb = list.find((p) => p.leadId && nb.has(p.leadId));
      if (pa && pb && pa !== pb) return ohms;
    }
    return Infinity;
  }

  // =========================================================================== an toàn
  _safety(dt, I, tipT, c) {
    const game = this.game, iron = I.iron;
    // bỏng tay trái
    if (iron && I.hasIronTip && tipT > 60) {
      const pts = this.debug?.leftHand || this._leftHandPoints();
      for (const pt of pts) {
        if (pt && pt.distanceTo(I.ironTip) < BURN_HAND_MM) {
          if (this._ready('burn', 3)) {
            this.stats.burns++;
            this.gauge.burn();
            game.hud?.flash?.('danger');
            this._toast(`Bỏng tay! Mũi hàn ${Math.round(tipT)} °C chạm ngón tay trái — giữ thiếc/bấc xa mũi hàn hơn`, 'danger', 'burn-t', 0);
            this.game.audio?.play?.('sizzle', { vol: 0.8, duration: 0.4 });
            this._emit('safety:burn', { temp: tipT, part: 'left-hand' });
            this._emit('fault', { kind: 'burn-hand', temp: tipT });
          }
          break;
        }
      }
    }
    // mũi nóng chạm nhựa (vỏ đầu nối, cách điện dây…)
    let touch = this.debug ? this.debug.ironTouch : null;
    if (!this.debug && iron && I.ironDown && !c) {
      const hit = game.interact?.hit;
      if (hit?.point && I.hasIronTip && hit.point.distanceTo(I.ironTip) < 2) touch = { object: hit.object, point: hit.point, face: hit.face };
    }
    if (touch && iron && (this.debug ? true : I.ironDown) && tipT > 200 && isPlastic(touch)) {
      this._plasticT += dt;
      if (this._plasticT > 0.25 && this._ready('melt', 1.2)) {
        this.stats.melts++;
        this._meltMark(touch);
        if (this.pro) { try { this.pro.onPlasticTouch(touch, tipT); } catch (e) { this._proErr(e); } }
        game.fx?.smoke?.(touch.point.clone(), { size: 4, duration: 1.0, rate: 20, color: 0x56524c });
        game.audio?.play?.('hiss', { pos: touch.point.clone(), vol: 0.5 });
        this._toast('Mũi hàn chạm NHỰA — chảy nhựa, khói khét độc! Chỉ chạm vào pad / chân kim loại', 'danger', 'melt-t', 0);
        this._emit('safety:plastic-melt', { target: touch.object, point: touch.point.clone(), temp: tipT });
      }
    } else this._plasticT = 0;
    // khói nhựa thông khi máy hút khói tắt
    this._fumeExposure = Math.max(0, this._fumeExposure - dt * 0.03);
    if (this._fumeExposure > FUME_LIMIT_S && this._ready('fume', 25)) {
      this.stats.fume++;
      game.hud?.flash?.('warn');
      this._toast('Khói nhựa thông gây kích ứng phổi, hen nghề nghiệp — BẬT MÁY HÚT KHÓI (E vào máy hút khói)!', 'danger', 'fume-t', 0);
      this._emit('safety:fume', { exposure: +this._fumeExposure.toFixed(1) });
      this._fumeExposure = 0;
    }
    // bỏ trạm hàn bật rồi đi xa
    this._awayCheck = (this._awayCheck || 0) - dt;
    if (this._awayCheck <= 0) {
      this._awayCheck = 0.5;
      const st = labState(game).station;
      const sp = this._stationPos(_v);
      const pp = game.player?.pos;
      if (st?.on && sp && pp && Math.hypot(pp.x - sp.x, pp.z - sp.z) > AWAY_MM) {
        this._away += 0.5;
        if (this._away >= AWAY_S && !this._awayWarned) {
          this._awayWarned = true;
          this._toast('Trạm hàn vẫn BẬT mà bạn đã rời bàn > 1 phút — nguy cơ cháy! Quay lại tắt trạm hàn.', 'danger', 'away', 0);
          this._emit('safety:iron-left-on', { seconds: Math.round(this._away), temp: st.ironTemp });
        }
      } else { this._away = 0; this._awayWarned = false; }
    }
  }

  _leftHandPoints() {
    const h = this.game.hands?.left;
    if (!h?.tips?.i) return [];
    const a = this._lh || (this._lh = [new THREE.Vector3(), new THREE.Vector3()]);
    h.tips.i.getWorldPosition(a[0]);
    (h.tips.t || h.tips.i).getWorldPosition(a[1]);
    return a;
  }
  _stationPos(out) {
    const w = this.game.world;
    const o = w?.anchors?.['station-solder'] || w?.props?.['soldering-station']?.object || null;
    return o ? o.getWorldPosition(out) : null;
  }
  _meltMark(touch) {
    const obj = touch.object;
    let root = obj;
    for (let o = obj; o; o = o.parent) if (o.userData?.item) { root = o; break; }
    const m = new THREE.Mesh(meltGeo(), solderMats().melt);
    m.userData.noInteract = true;
    const n = touch.face?.normal ? _n.copy(touch.face.normal).transformDirection(obj.matrixWorld) : _n.set(0, 1, 0);
    m.position.copy(touch.point).addScaledVector(n, 0.05);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    m.scale.setScalar(0.7 + Math.random() * 0.5);
    root.updateWorldMatrix(true, false);
    root.attach(m);
  }

  // =========================================================================== âm thanh + khói
  _puff(pos, k = 1) {
    if (!pos || !this._ready('puff', 0.18)) return;
    this.game.fx?.smoke?.(pos.clone(), { size: 2.6 * k, duration: 0.25, rate: 16, color: 0xe2e2e2 });
    if (!labState(this.game).fume?.on) this._fumeExposure += 0.18 * k;
  }

  _fluxSmoke(rec, p, burn, dt) {
    p._smokeAcc = (p._smokeAcc || 0) + burn;
    // phơi nhiễm = số giây có khói nhựa thông nhìn thấy được (tốc độ cháy > 0.01 đơn vị/s) khi máy hút khói TẮT
    if (!labState(this.game).fume?.on && burn / dt > 0.01 && this._fumeTick !== this._frameId) { this._fumeTick = this._frameId; this._fumeExposure += dt; }
    if (p._smokeAcc > 0.004 && this._ready(`smk:${p._key}`, 0.16)) {
      const pos = this.padWorld(rec, p, new THREE.Vector3(), _n);
      const n = _n.clone();
      this.game.fx?.smoke?.(pos.clone().addScaledVector(n, 1), { size: 2.4 + Math.min(3, p._smokeAcc * 120), duration: 0.22, rate: 14, color: 0xdedcd8 });
      const nb = Math.min(4, 1 + Math.round(p._smokeAcc * 300));
      for (let i = 0; i < nb; i++) this.particles.bubble(pos, n, 1);
      if (this._ready('hiss', 0.9)) this.game.audio?.play?.('hiss', { pos, vol: 0.18 + Math.min(0.3, p._smokeAcc * 30), duration: 0.5 });
      p._smokeAcc = 0;
    }
  }

  _audio(c, load, I) {
    const au = this.game.audio;
    if (!au?.play) return;
    const p = c?.pad;
    const level = p ? clamp01(load / 14) * (p.molten || p.flux > 0.02 ? 1 : 0.35) : 0;
    if (level > 0.05) {
      if (!this._sizzle || !this._sizzle.playing) this._sizzle = au.play('sizzle', { loop: true, pos: I.ironTip.clone(), vol: 0.05 });
      this._sizzle?.setVol?.(0.1 + level * 0.7);
      this._sizzle?.setPos?.(I.ironTip.clone());
    } else if (this._sizzle) { this._sizzle.stop?.(0.12); this._sizzle = null; }
  }

  // =========================================================================== hình ảnh (mỗi khung vẽ)
  frameUpdate(dt) {
    for (const rec of this.boards.values()) {
      if (rec.dirty.size) { for (const p of rec.dirty) this._renderPad(rec, p); rec.dirty.clear(); }
      for (const p of rec.active) if (p.molten && p._vis?.fillet) {
        // thiếc lỏng gợn nhẹ
        const w = 1 + Math.sin(this._t * 18 + p.local[0]) * 0.025;
        p._vis.fillet.scale.set(w, 2 - w, w);
      }
    }
    this.particles.update(dt, 0);
    if (this._emitNet) { this._emitNet = false; this._emit('solder:netlist', { version: this._netVersion }); }
    this._updateGauge();
  }

  _renderPad(rec, p) {
    let vis = p._vis;
    const needs = p.solderVol > 0.05 || p.flux > 0.02 || p.state === 'lifted' || (p.char || 0) > 0.03 || (p.boardDose || 0) > 2.5 || !!p.defects?.balls;
    if (!vis && !needs) return;
    if (!vis) {
      const g = new THREE.Group();
      g.position.set(p.local[0], p.local[1], p.local[2]);
      if (p.side !== 'top') g.quaternion.copy(FLIP_X);
      g.userData.solderPad = p._key;
      rec.group.add(g);
      vis = p._vis = { g, fillet: null, flux: null, ring: null, scorch: null };
    }
    const M = solderMats();
    // --- nón thiếc
    const lead = p.lead;
    const holeFill = (p.hole ?? 0.5) > 0 ? (lead ? 0.8 : 1.1) * (p._phys?.k ?? 1) : 0;
    let Vf = p.solderVol - holeFill;
    if (p.solderVol > 0.05) {
      let kind;
      const lim = volumeLimits(p);
      if (Vf <= 0.12) { kind = 'film'; Vf = 0.15; }
      else if (p.molten) kind = p.wetting > 0.5 ? (p.solderVol > lim.max ? 'excess' : 'good') : 'cold';
      else if (p.state === 'good') kind = p.defects?.overheated || p.defects?.disturbed ? 'grainy' : 'good';
      else if (p.state === 'excess' || p.state === 'bridge') kind = p.wetting > 0.5 ? 'excess' : 'cold';
      else if (p.state === 'cold') kind = 'cold';
      else kind = p.wetting > 0.5 ? 'good' : 'cold';
      // chân đã cắt SAU khi hàn: nón thiếc dựng theo chiều dài cũ rồi cắt phẳng ở đầu chân (mặt cắt kìm)
      const trimmedAfter = lead?.trimmed && SOLID_STATES.has(p.state) && !p.molten;
      const Hmax = lead ? (trimmedAfter ? Math.max(lead.L, p._Lpre ?? 3) : lead.L) + 0.25 : 1.2;
      const geo = filletGeometry(kind, Vf, (p.ring ?? 0.9) * (p.state === 'lifted' ? 0.95 : 1), lead ? lead.r : 0, Hmax, trimmedAfter ? lead.L + 0.03 : null);
      p._fH = geo.userData.height + (geo.userData.bulge > 0.3 ? 0.3 : 0);
      if (!vis.fillet) { vis.fillet = new THREE.Mesh(geo, matForPad(p)); vis.fillet.castShadow = true; vis.fillet.userData.solderPad = p._key; vis.g.add(vis.fillet); }
      vis.fillet.geometry = geo;
      vis.fillet.material = matForPad(p);
      vis.fillet.visible = true;
      if (!p.molten) vis.fillet.scale.set(1, 1, 1);
      vis.fillet.position.y = p.state === 'lifted' ? 0.18 : 0;
      vis.fillet.rotation.z = p.state === 'lifted' ? 0.18 : 0;
    } else if (vis.fillet) { vis.fillet.visible = false; p._fH = 0; }
    // --- [PRO] đoạn chân nhô (đầu chân phải NHÌN THẤY được trong mối — NASA [V][1]); bề mặt cắt phẳng sau khi cắt
    if (lead && p.solderVol > 0.05) {
      if (!vis.leadStub) { vis.leadStub = new THREE.Mesh(leadStubGeo(), M.lead); vis.leadStub.userData.noInteract = true; vis.leadStub.castShadow = true; vis.g.add(vis.leadStub); }
      vis.leadStub.visible = true;
      const rr = lead.r * 0.97, hh = Math.min(lead.L, 3.5);
      vis.leadStub.scale.set(rr, hh, rr);
      vis.leadStub.position.y = p.state === 'lifted' ? 0.18 : 0;
    } else if (vis.leadStub) vis.leadStub.visible = false;
    // --- vệt nhựa thông
    if (p.flux > 0.02) {
      if (!vis.flux) { vis.flux = new THREE.Mesh(fluxDiscGeo(), M.flux); vis.flux.renderOrder = 2; vis.flux.userData.noInteract = true; vis.g.add(vis.flux); }
      vis.flux.visible = true;
      vis.flux.position.y = 0.03;
      vis.flux.scale.setScalar(0.7 + Math.min(0.9, Math.sqrt(p.flux) * 0.8));
    } else if (vis.flux) vis.flux.visible = false;
    // --- pad bong
    if (p.state === 'lifted' && !vis.ring) {
      vis.ring = new THREE.Mesh(liftedRingGeo(), M.lifted);
      vis.ring.position.y = 0.16; vis.ring.rotation.z = 0.2;
      vis.scorch = new THREE.Mesh(scorchGeo(), M.scorch);
      vis.scorch.position.y = 0.02; vis.scorch.userData.noInteract = true;
      vis.g.add(vis.ring, vis.scorch);
    }
    // --- cầu thiếc
    for (const k of p.bridges) {
      const id = p._key < k ? `${p._key}|${k}` : `${k}|${p._key}`;
      const q = this._padByKey(k);
      if (!q || q._rec !== rec) continue;
      let m = rec.bridgeMeshes.get(id);
      const ax = q.local[0] - p.local[0], az = q.local[2] - p.local[2];
      const len = Math.hypot(ax, az);
      if (!m) {
        m = new THREE.Mesh(bridgeGeometry(len), M.good);
        m.castShadow = true;
        m.userData.solderPad = p._key;
        rec.group.add(m);
        rec.bridgeMeshes.set(id, m);
      }
      m.position.set((p.local[0] + q.local[0]) / 2, p.local[1] + (p.side === 'top' ? 0.32 : -0.32), (p.local[2] + q.local[2]) / 2);
      m.rotation.set(0, -Math.atan2(az, ax), 0);
      m.scale.set(1, 0.95, 1.15);
      m.position.y = p.local[1] + (p.side === 'top' ? 0.42 : -0.42);
      m.material = p.molten || q.molten ? M.molten : (p.wetting > 0.5 ? M.good : M.cold);
    }
    for (const [id, m] of rec.bridgeMeshes) {
      const [a, b] = id.split('|');
      const pa = this._padByKey(a);
      if (!pa || !pa.bridges.includes(b)) { rec.group.remove(m); rec.bridgeMeshes.delete(id); }
      else if (pa._thinBridge?.has(b)) { m.scale.set(1, 0.16, 0.18); m.position.y = pa.local[1] + (pa.side === 'top' ? 0.12 : -0.12); }
    }
    if (this.pro) { try { this.pro.renderPad(rec, p, vis); } catch (e) { this._proErr(e); } }
  }

  _updateGauge() {
    const g = this.gauge;
    if (!g.has) return;
    const game = this.game, cam = game.app?.viewCamera || game.camera;     // kính hiển vi: chiếu theo camera quang học
    const I = this._in;
    let j = null;
    if (this.contact) j = this.contact;
    else if (I?.hasIronTip && I.iron) j = this.findJoint(I.ironTip, 6);
    if (!j && this._aim && (I?.iron || I?.wire)) j = this._aim;
    if (!j || !cam || game.app?.paused) { g.hide(); return; }
    const p = j.pad, rec = j.rec;
    const pos = this.padWorld(rec, p, _v3);
    _v2.copy(pos).project(cam);
    if (_v2.z > 1) { g.hide(); return; }
    const W = window.innerWidth, H = window.innerHeight;
    const alloy = this._alloyOf(p, I?.wire);
    const state = p.molten ? 'molten' : (this.contact?.pad === p && p.T > alloy.liquidus - 80 && p.state === 'empty') ? 'heating' : p.state;
    const leadTxt = p.lead ? ` · ${p.lead.item.def.name?.split(' ')[0] || ''} chân ${p.lead.pinId}` : '';
    let warn = '';
    if (this._feedState === 'iron' && this.contact) warn = 'Thiếc đang vào MŨI HÀN, không vào mối hàn!';
    else if (this._feedState === 'cold') warn = 'Pad chưa đủ nóng — thiếc vón trên mũi';
    else if (p.overheat > LIFT_SECONDS * 0.5 && p.state !== 'lifted') warn = 'Quá nóng — sắp bong pad!';
    else if ((p.char || 0) > 0.12) warn = 'Flux CHÁY ĐEN — cản thấm ướt! Làm sạch + flux mới';
    else if (p.bridges.length) warn = 'Cầu thiếc — chập sang pad bên!';
    g.show({
      x: clamp((_v2.x + 1) / 2 * W + 46, 8, W - 230), y: clamp((1 - _v2.y) / 2 * H - 165, 8, H - 150),     // phía TRÊN pad: không đè tên vật / con trỏ tỉ mỉ (dưới điểm nhắm)
      title: `Pad ${p.id}${leadTxt}${I?.iron?.state?.tip ? ` · mũi ${I.iron.state.tip}` : ''}`, state, padT: p.T, tipT: I?.iron?.state?.tipTemp ?? null, vol: p.solderVol, lim: volumeLimits(p),
      wet: p.wetting, flux: p.flux, alloy, warn,
    });
  }

  // =========================================================================== lưu / tải
  serialize() {
    const boards = {};
    for (const rec of this.boards.values()) {
      const pads = {};
      for (const p of rec.pads) {
        if (p.solderVol < 0.05 && p.state === 'empty' && p.flux < 0.02 && !p.bridges.length && !(p.boardDose > 0.5)) continue;
        pads[p.id] = [+p.solderVol.toFixed(2), p.state, +p.wetting.toFixed(2), +p.flux.toFixed(2), +p.leadWet.toFixed(2), +p.oxide.toFixed(2), p.alloy || '', p.bridges.join(','),
          { c: +(p.char || 0).toFixed(3), b: +(p.boardDose || 0).toFixed(2), d: p.defects || {}, n: +(p._ncFrac || 0).toFixed(2), t: p.tipCode || null, h: p._thinBridge ? [...p._thinBridge] : null, r: p.reflows || 0 }];
      }
      const trimmed = [];
      for (const [, list] of rec.leadPads) for (const p of list) if (p.lead?.trimmed) trimmed.push(p.id);
      if (Object.keys(pads).length || trimmed.length) boards[rec.uid] = { pads, trimmed };
    }
    return { v: 1, boards, stats: { ...this.stats } };
  }

  _applyLoad() {
    const d = this._pendingLoad;
    this._pendingLoad = null;
    if (!d?.boards) return;
    if (d.stats) Object.assign(this.stats, d.stats);
    for (const [uid, b] of Object.entries(d.boards)) {
      const inst = this.game.items?.byUid?.(uid);
      const rec = inst && this.board(inst);
      if (!rec) continue;
      this._refreshLeads(rec);
      for (const [id, a] of Object.entries(b.pads || {})) {
        const p = rec.byId.get(String(id));
        if (!p || !Array.isArray(a)) continue;
        [p.solderVol, p.state, p.wetting, p.flux, p.leadWet, p.oxide] = [+a[0] || 0, a[1] || 'empty', +a[2] || 0, +a[3] || 0, +a[4] || 0, +a[5] || 0];
        p.V = p.solderVol; p.alloy = a[6] || null; p.bridges = a[7] ? String(a[7]).split(',').filter(Boolean) : [];
        const x = a[8];
        if (x && typeof x === 'object') { p.char = +x.c || 0; p.boardDose = +x.b || 0; p.defects = x.d || {}; p._ncFrac = +x.n || 0; p.tipCode = x.t || null; p._thinBridge = x.h ? new Set(x.h) : null; p.reflows = x.r || 0; }
        p.dirty = true; rec.dirty.add(p);
      }
      for (const id of b.trimmed || []) { const p = rec.byId.get(String(id)); if (p?.lead) { p.lead.trimmed = true; p.lead.cutL = 1; p.lead.L = Math.min(p.lead.L, 1); } }
    }
    this._netChanged();
  }

  // =========================================================================== tiện ích
  _emit(type, payload) { try { this.game.events?.emit(type, payload); } catch (e) { console.warn('[soldering] emit', type, e); } }
  _ready(key, sec) {
    const t = this._cool.get(key);
    if (t != null && this._t < t) return false;
    this._cool.set(key, this._t + sec);
    return true;
  }
  _toast(msg, kind = 'info', key = null, cool = 2.5) {
    if (key && !this._ready(key, cool)) return;
    try { this.game.hud?.toast?.(msg, { kind, short: kind !== 'danger' }); } catch { /* không có HUD */ }
  }
  _warn(msg, key) { this._toast(msg, 'warn', key, 4); }
  _hint(msg, key) { this._toast(msg, 'info', key, 6); }
}

// ----------------------------------------------------------------------------- hàm phụ
function distToSegment(p, a, b) {
  const ab = _v3.subVectors(b, a);
  const t = clamp(ab.lengthSq() > 1e-9 ? _loc.subVectors(p, a).dot(ab) / ab.lengthSq() : 0, 0, 1);
  return _loc.copy(a).addScaledVector(ab, t).distanceTo(p);
}

function isPlastic(touch) {
  const o = touch?.object;
  if (!o) return false;
  if (o.userData?.solderPad || o.userData?.plastic === false) return false;
  if (o.userData?.plastic || o.userData?.burnable) return true;
  let m = o.material;
  if (Array.isArray(m)) m = m[touch.face?.materialIndex ?? 0] || m[0];
  if (!m) return false;
  if (PLASTIC.has(m)) return true;
  if (m.userData?.plastic) return true;
  return false;
}

export default Soldering;
