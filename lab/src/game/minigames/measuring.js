// =============================================================================
// minigames/measuring.js — ĐO ĐẠC bằng đồng hồ vạn năng (items/tools/multimeter.js) trên mạch thật của game.
//
//   game.measuring = new Measuring(game)
//   Cầm đồng hồ (tay trái) → que ĐỎ tự sang tay phải. Chuột trái = chạm que đỏ vào điểm đang nhắm (chân, lỗ breadboard,
//   pad, đầu dây). Phím V = kẹp que ĐEN (COM, đầu kẹp cá sấu) vào điểm đang nhắm — thường là GND; V lần nữa = tháo.
//   R / cuộn chuột = xoay núm thang đo (của chính đồng hồ).
//   Trả lời 'measure:request' (multimeter.measure phát) bằng req.value:
//     V⎓  : hiệu điện thế giữa 2 mạng trong mạch đang chạy (game.power) — điểm không thuộc mạch có nguồn → 0 V (thả nổi)
//     V~  : ≈ 0 (mạch một chiều)
//     Ω / thông mạch: dựng mạch THỬ (nguồn tắt) + phần tử Meter 'ohm' (3 V qua 10 kΩ) giữa 2 que → R = V/I (< 50 Ω: tít)
//     A⎓  : dựng mạch THỬ có nguồn + Meter 'A' (sun 0.01 Ω + cầu chì 10 A) NỐI TIẾP giữa 2 que → dòng thật;
//           đặt song song 2 đầu nguồn = chập qua sun → pin: đứt cầu chì đồng hồ; nguồn bàn: CC cứu (cảnh báo).
//   API (cho test/nhiệm vụ): clipBlack(att | point, obj) · unclipBlack() · touchRed(att | null) · measure(req)
//   Máy hiện sóng (world/props/oscilloscope.js, khi bật): điện áp điểm que đỏ vừa chạm theo thời gian → 'scope:data' kênh 1.
// =============================================================================
import * as THREE from 'three';
import { labState } from '../world/_labState.js';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion();
const TIP = new THREE.Vector3(0, 7, 70 - 123.6);
const DOWN_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));

export class Measuring {
  constructor(game) {
    this.game = game;
    this.black = null;          // att que đen (kẹp)
    this.red = null;            // att que đỏ lần chạm gần nhất
    this.redOverride = null;    // att ép (API / test)
    this.scope = { buf: [], t: 0, att: null };
    this._probe = { red: null, black: null };
    this._hinted = false;
    const ev = game.events;
    ev.on('measure:request', (req) => { try { const v = this.measure(req); if (v !== undefined) req.value = v; } catch (e) { console.warn('[measuring] lỗi đo', e); } });
    ev.on('input:key', (e) => {
      if (!e.down || e.repeat || e.code !== 'KeyV') return;
      if (!this.meter() || game.app.paused || game.interact?.heldItem) return;
      const t = game.interact?.target;
      if (this.black && (!t?.hit || !t.inReach)) { this.unclipBlack(); return; }
      if (t?.hit && t.inReach) {
        const r = game.netlist.resolvePoint(t.hit.point, t.hit.object);
        if (r && this.black && sameAtt(r.att, this.black)) { this.unclipBlack(); return; }
        this.clipBlack(r?.att || null);
      }
    });
    ev.on('tool:changed', () => {
      const m = this.meter();
      if (m && !this._hinted) { this._hinted = true; game.hud?.toast?.('Đồng hồ vạn năng: chuột trái = chạm que ĐỎ · V = kẹp / tháo que ĐEN (COM) · R hoặc cuộn = đổi thang', { kind: 'info', ms: 6000 }); }
      if (!m && this.black) this.unclipBlack(true);
    });
  }

  /** đồng hồ vạn năng đang cầm (tay trái hoặc phải) */
  meter() {
    const inv = this.game.inventory;
    for (const t of [inv?.leftTool, inv?.rightTool]) if (t?.def?.id === 'multimeter') return t;
    return null;
  }

  clipBlack(attOrPoint, obj = null) {
    let att = attOrPoint && attOrPoint.kind ? attOrPoint : null;
    if (!att && attOrPoint && obj) att = this.game.netlist.resolvePoint(attOrPoint, obj)?.att || null;
    if (!att) { this.game.hud?.toast?.('Que đen chưa kẹp được vào chân / lỗ / đầu dây nào — nhắm sát hơn', { kind: 'warn', short: true }); return null; }
    this.black = att;
    this.game.audio?.play('snap', { vol: 0.4 });
    this.game.hud?.toast?.(`Kẹp que ĐEN (COM) → ${this.game.netlist.labelOf(att)}`, { kind: 'info', short: true });
    this.game.events.emit('probe:clipped', { which: 'black', att });
    return att;
  }
  unclipBlack(silent = false) {
    if (!this.black) return;
    this.black = null;
    if (!silent) this.game.hud?.toast?.('Đã tháo kẹp que đen', { kind: 'info', short: true });
    this.game.events.emit('probe:clipped', { which: 'black', att: null });
  }
  touchRed(att) { this.redOverride = att || null; }

  _redAtt(req) {
    if (this.redOverride) return this.redOverride;
    const t = this.game.interact?.target;
    // [UX] chế độ tỉ mỉ: target.hit = điểm dưới con trỏ 3D (interact.pointer) → chạm que đo đúng chân / pad nhỏ
    if (t?.hit && t.inReach !== false) {
      const r = this.game.netlist.resolvePoint(t.hit.point, t.hit.object);
      if (r) return r.att;
    }
    if (req?.target && req.a) {
      const r = this.game.netlist.resolvePoint(req.a, req.target);
      if (r) return r.att;
    }
    return null;
  }

  /** → số (V, Ω, A) | null ('----') | undefined (không phải điểm mạch — để đồng hồ tự xử lý) */
  measure(req) {
    const game = this.game;
    const mode = req.mode;
    if (mode === 'off') return undefined;
    const red = this._redAtt(req);
    if (!red) return undefined;
    this.red = red;
    this.scope.att = red;
    const NL = game.netlist, P = game.power;
    if (!this.black) {
      game.hud?.toast?.('Chưa kẹp que ĐEN (COM) — nhắm vào GND rồi nhấn V', { kind: 'warn', short: true });
      return null;
    }
    const kr = NL.keyOf(red), kb = NL.keyOf(this.black);
    const N = NL.get();
    const rr = kr ? N.uf.find(kr) : null, rb = kb ? N.uf.find(kb) : null;
    if (mode === 'vdc' || mode === 'vac') {
      if (mode === 'vac') return 0;
      P?._ensure?.();
      if (!rr || !rb) return 0;
      const vr = P?.nl ? P.nl.v(rr) : null, vb = P?.nl ? P.nl.v(rb) : null;
      if (vr == null || vb == null || !P.hasSource) return 0;
      return vr - vb;
    }
    if (mode === 'ohm' || mode === 'cont') {
      if (P?.powered) game.hud?.toast?.('⚠ Đo Ω khi mạch ĐANG CÓ ĐIỆN — số đo sai, có thể hỏng đồng hồ. Tắt nguồn trước!', { kind: 'warn', short: true });
      if (!rr || !rb) return Infinity;
      if (rr === rb) return 0.0;
      return this._ohms(rr, rb);
    }
    if (mode === 'adc') return this._amps(req, rr, rb);
    return undefined;
  }

  _ohms(rr, rb) {
    const P = this.game.power;
    const spec = P.spec({ withPsu: false, roots: [rr, rb] });
    spec.meter = { mode: 'ohm', com: rb, probe: rr };
    spec.ground = rb;
    spec.powered = false;
    const nl = P.build(spec, null);
    for (let i = 0; i < 6; i++) nl.circuit.step(2e-3);
    const r = nl.meter?.reading;
    return r == null || !Number.isFinite(r) ? Infinity : Math.max(0, r);
  }

  _amps(req, rr, rb) {
    const game = this.game, P = this.game.power;
    const inst = req.instance;
    if (inst?.state?.fuseBlown) return 0;
    if (!rr || !rb || rr === rb) return 0;
    // điện áp giữa 2 que TRƯỚC khi nối đồng hồ (để biết có đang đặt song song nguồn không)
    P._ensure();
    const vr = P.nl?.v(rr), vb = P.nl?.v(rb);
    const vAcross = vr != null && vb != null && P.hasSource ? Math.abs(vr - vb) : 0;
    const spec = P.spec({ extraRoots: [rr, rb] });
    spec.meter = { mode: 'A', com: rb, probe: rr };
    const nl = P.build(spec, null);
    for (let i = 0; i < 200; i++) nl.circuit.step(1e-3);
    const m = nl.meter;
    const I = m?.reading ?? 0;
    const psu = nl.byKey.get(`psu-ch${P.channel}/psu`);
    if (m?.fuse?.blown || Math.abs(I) > 10) {
      if (inst) inst.state.fuseBlown = true;
      const pos = req.a || null;
      try { if (pos) game.fx?.sparks?.(pos, { count: 25, speed: 40, size: 0.6 }); } catch { /* */ }
      game.audio?.play('pop', { pos, vol: 0.8 });
      game.events.emit('fault', { kind: 'meter-fuse', item: inst, cause: `dòng ${Math.abs(I).toFixed(0)} A qua sun 0.01 Ω` });
      game.hud?.toast?.('Bụp! Thang A đặt SONG SONG nguồn = chập qua sun 0.01 Ω → đứt cầu chì 10 A của đồng hồ. Đo dòng phải mắc NỐI TIẾP!', { kind: 'danger' });
      return 0;
    }
    if (vAcross > 0.5 && psu?.cc) {
      game.events.emit('fault', { kind: 'meter-short', item: inst, cause: `thang A đặt song song ${vAcross.toFixed(1)} V` });
      game.hud?.toast?.(`Thang A đang CHẬP 2 điểm chênh ${vAcross.toFixed(1)} V! Nguồn bàn chuyển CC (${psu.p.i.toFixed(2)} A) nên đồng hồ còn sống — với pin 4S cầu chì đã đứt. Đo dòng phải NỐI TIẾP.`, { kind: 'warn' });
    }
    return I;
  }

  // ------------------------------------------------------------------ mỗi bước
  tick(dt) {
    this._probeVisuals();
    // máy hiện sóng
    const sc = labState(this.game).scope;
    if (sc?.on && this.scope.att && this.game.power) {
      const v = this.game.power.v(this.scope.att);
      const vb = this.black ? this.game.power.v(this.black) : 0;
      this.scope.buf.push(v == null ? 0 : v - (vb ?? 0));
      if (this.scope.buf.length > 240) this.scope.buf.shift();
      this.scope.t += dt;
      if (this.scope.t > 0.25) {
        this.scope.t = 0;
        this.game.events.emit('scope:data', { ch: 1, samples: this.scope.buf.slice(), vdiv: 2, tdiv: 0.5, label: `CH1 · ${this.game.netlist.labelOf(this.scope.att)}` });
      }
    }
  }

  /** que đỏ trên tay phải khi cầm đồng hồ; que đen nằm ở chỗ kẹp */
  _probeVisuals() {
    const game = this.game;
    const m = this.meter();
    const P = m?.object?.userData?.parts;
    const st = this._probe;
    const restore = (k) => {
      const s = st[k];
      if (!s) return;
      s.obj.parent?.remove(s.obj);
      s.parent.add(s.obj);
      s.obj.position.copy(s.pos); s.obj.quaternion.copy(s.quat);
      st[k] = null;
    };
    if (!m || !P) { restore('red'); restore('black'); if (this._m && this._m.object?.userData?.parts) { /* đã trả */ } this._m = null; return; }
    if (this._m && this._m !== m) { restore('red'); restore('black'); }
    this._m = m;
    const save = (k, obj) => { if (!st[k]) st[k] = { obj, parent: obj.parent, pos: obj.position.clone(), quat: obj.quaternion.clone() }; };
    // đỏ → tay phải (nếu tay phải rảnh)
    const hands = game.hands;
    const rightFree = hands && !game.inventory?.rightTool && !game.interact?.heldItem && hands.right?.holder;
    if (rightFree && m.heldBy === 'left') {
      const g = m.def.subGrips?.red;
      if (P.red.parent !== hands.right.holder) {
        save('red', P.red);
        P.red.parent?.remove(P.red);
        hands.right.holder.add(P.red);
        if (g?.offset) P.red.position.set(...g.offset); else P.red.position.set(0, 0, 0);
        P.red.rotation.set(...(g?.rot || [0, 0, 0]));
        hands.setPose('right', 'holdTool:probe');
      }
    } else if (st.red && P.red.parent === hands?.right?.holder) { restore('red'); hands?.setPose('right', 'idle'); }
    // đen → điểm kẹp
    if (this.black) {
      const pos = game.netlist.posOf(this.black, _v);
      if (pos) {
        if (!st.black) { save('black', P.black); P.black.parent?.remove(P.black); game.scene.add(P.black); }
        _q.copy(DOWN_Q);
        P.black.quaternion.copy(_q);
        const off = TIP.clone().applyQuaternion(_q);
        P.black.position.copy(pos).sub(off).add(_v.set(0, 1.5, 0));
      }
    } else restore('black');
  }
}

function sameAtt(a, b) { return !!a && !!b && a.kind === b.kind && a.uid === b.uid && (a.hole ?? a.pin ?? a.pad ?? a.index ?? a.cavity) === (b.hole ?? b.pin ?? b.pad ?? b.index ?? b.cavity); }
