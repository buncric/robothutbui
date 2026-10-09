// =============================================================================
// minigames/netlist.js — Mạng điện (netlist) SỐNG dựng từ thế giới game.
//
//   game.netlist = new GameNetlist(game)
//   game.netlist.get()                 → dữ liệu đã dựng (tự dựng lại khi có thay đổi — "dirty" theo sự kiện)
//   game.netlist.netOfPin(item, pin)   → id mạng (chuỗi) của chân, tính CẢ dây nối (dây còn tốt)
//   game.netlist.nets()                → [{ id, members:[{ item, pin } | { key }] }] (mạng có ≥ 1 thành viên là chân)
//   game.netlist.keyOf(att) / posOf(att) / dirOf(att) / labelOf(att)   — "điểm gắn" (attachment), xem dưới
//   game.netlist.resolvePoint(pointWorld, hitObject, { kinds }) → { att, dist, label } | null
//   game.netlist.link(id, a, b) / unlink(id)   nối ngoài (que nguồn bàn, que đo…) a/b = khoá chuỗi hoặc att
//   game.netlist.markDirty()
//
// Khoá điểm nối (chuỗi): 'p:<uid>:<chân>' chân linh kiện · 'bb:<uid>:<net breadboard>' dải/thanh nguồn ·
//   'pad:<uid>:<id>' pad hàn (perfboard 'r,c' hoặc pad module = id chân) · 'psu:<kênh>:+|-' cọc nguồn bàn.
// Điểm gắn (att): { kind:'bb', uid, hole } | { kind:'pin', uid, pin } | { kind:'pad', uid, pad }
//                 { kind:'screw', uid, index } (cầu đấu vít — chỉ dẫn điện khi đã SIẾT) | { kind:'shell', uid, cavity }
//
// Quy tắc nối (union-find):
//   • chân linh kiện cắm breadboard (bb-hole / bb-span*) → lỗ gần nhất theo HÌNH HỌC (toạ độ đầu chân) → dải 5 lỗ / thanh nguồn
//     (def.netOf của breadboard-830, tôn trọng state.railsSplit)
//   • chân xuyên perfboard → pad 'r,c'; pad chỉ dẫn khi ĐÃ HÀN: đọc trạng thái bản ghi pad (PAD_STORE, state good/cold/excess/bridge),
//     sự kiện 'solder:joint' / 'solder:bridge', và game.soldering?.connections() nếu có. Chưa có module hàn → coi như đã nối.
//   • IC trong đế DIP: chân IC ↔ tiếp điểm đế theo HÌNH HỌC → cắm NGƯỢC (xoay 180°) tự ra chân 1 ↔ tiếp điểm 21 (DIP-40)
//   • header cái / đầu cái Dupont / cầu đấu vít / pad dây module: ánh xạ hình học trong hệ toạ độ khe (vuông góc trục khe)
//   • đầu nối JST-XH / XT60 đã cắm: tiếp điểm theo thuộc tính `mates` (khoá 1 chiều do sockets.js kiểm tra)
//   • nối trong linh kiện: electrical.internal, pin.net (dây sẵn của vỏ JST), alias pad của chân module
//   • DÂY (jumper Dupont, đoạn dây cắt từ cuộn — electrical.type 'wire', chân A/B) KHÔNG gộp nút: là phần tử Wire (có điện trở,
//     nóng / cháy được) trong bộ giải; nets()/netOfPin() thì tính dây còn tốt là nối liền.
//   • đầu dây đã đi (minigames/wiring.js): inst.state.cable.ends = { A: att, B: att }
//   • nối ngoài: link(id, a, b) — power.js dùng cho kẹp cá sấu của dây nguồn bàn.
// =============================================================================
import * as THREE from 'three';
import { PAD_STORE } from '../items/parts/_shared.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m = new THREE.Matrix4();
const BB_TOP = 9.3;   // mặt breadboard theo CAD BB830 (def breadboard-830 có `top`)
const SOLDERED = new Set(['good', 'cold', 'excess', 'bridge', 'ok', 'wet', 'soldered']);

/** union-find trên khoá chuỗi */
export class UF {
  constructor() { this.p = new Map(); }
  find(a) {
    let p = this.p.get(a);
    if (p === undefined) { this.p.set(a, a); return a; }
    let r = a;
    while (p !== r) { r = p; p = this.p.get(r); }
    let c = a;
    while (c !== r) { const n = this.p.get(c); this.p.set(c, r); c = n; }
    return r;
  }
  union(a, b) { if (a == null || b == null) return; const ra = this.find(a), rb = this.find(b); if (ra !== rb) { if (ra < rb) this.p.set(rb, ra); else this.p.set(ra, rb); } }
  has(a) { return this.p.has(a); }
  clone() { const u = new UF(); u.p = new Map(this.p); return u; }
}

export const pk = (uid, pin) => `p:${uid}:${pin}`;
export const itemOf = (obj) => { for (let o = obj; o; o = o.parent) if (o.userData?.item) return o.userData.item; return null; };
export const isBreadboard = (it) => typeof it?.def?.netOf === 'function' && Array.isArray(it?.def?.holes);
export const isPerfboard = (it) => typeof it?.def?.nearestHoleLocal === 'function' && typeof it?.def?.holeLocal === 'function';
/** item là "dây" (2 đầu A/B, có điện trở) */
export function isCable(it) {
  const d = it?.def || it;
  if (!d || d.kind === 'tool') return false;
  if (d.cable) return true;
  const E = d.electrical;
  if (E?.type !== 'wire') return false;
  const pins = d.pins || [];
  return pins.some((p) => p.id === 'A') && pins.some((p) => p.id === 'B');
}
export function pinsOf(it) {
  const d = it?.def;
  if (!d) return [];
  try { return d.getPins?.(it) ?? d.pins ?? []; } catch { return d.pins || []; }
}
/** item còn "trong thế giới" (không ở trong túi, không phải dụng cụ trên thanh) */
export function isLive(it) {
  if (!it || it.inBag || it.isHotbarTool || it.def?.kind === 'tool') return false;
  return !!it.object?.parent || !!it.state?.cable?.laid;
}
function isAncestor(a, b) { for (let o = b; o; o = o.parent) if (o === a) return true; return false; }

// ---------------------------------------------------------------------------- breadboard: tra lỗ theo cột
const _bbCols = new WeakMap();
function bbColumns(def) {
  let m = _bbCols.get(def);
  if (!m) {
    m = new Map();
    for (const h of def.holes) {
      const c = Math.round(h.x / 2.54);
      if (!m.has(c)) m.set(c, []);
      m.get(c).push(h);
    }
    _bbCols.set(def, m);
  }
  return m;
}
/** lỗ breadboard gần (x, z) cục bộ nhất trong bán kính r */
export function nearestBBHole(def, x, z, r = 1.0) {
  const cols = bbColumns(def);
  const c0 = Math.round(x / 2.54);
  let best = null, bd = r;
  for (let c = c0 - 1; c <= c0 + 1; c++) {
    for (const h of cols.get(c) || []) {
      const d = Math.hypot(h.x - x, h.z - z);
      if (d <= bd) { bd = d; best = h; }
    }
  }
  return best ? { hole: best, dist: bd } : null;
}

// ---------------------------------------------------------------------------- lớp chính
export class GameNetlist {
  constructor(game) {
    this.game = game;
    this.dirty = true;
    this.version = 0;
    this.data = null;
    this.links = new Map();          // id → { a, b }
    this.solderPads = new Set();     // 'pad:<uid>:<id>' đã hàn (từ sự kiện)
    this.bridges = [];               // [[keyA, keyB]] từ 'solder:bridge'
    const ev = game.events;
    const dirty = () => { this.dirty = true; };
    for (const t of ['socket:inserted', 'socket:removed', 'item:removed', 'item:spawned', 'item:picked', 'item:placed', 'item:dropped', 'item:stashed',
      'item:unstashed', 'wire:connected', 'wire:removed', 'wire:disconnected', 'screw:driven', 'part:action', 'switch:changed', 'button:pressed',
      'button:released', 'solder:removed', 'solder:netlist', 'solder:bridge-removed', 'solder:lifted', 'lead:trimmed', 'desolder', 'game:loaded', 'cable:changed']) ev.on(t, dirty);
    ev.on('solder:joint', (e) => { this._onJoint(e); this.dirty = true; });
    ev.on('solder:bridge', (e) => { this._onBridge(e); this.dirty = true; });
  }

  markDirty() { this.dirty = true; }
  link(id, a, b) { this.links.set(id, { a, b }); this.dirty = true; }
  unlink(id) { if (this.links.delete(id)) this.dirty = true; }

  get() { if (this.dirty || !this.data) this._rebuild(); return this.data; }

  /** id mạng (tính cả dây còn tốt) của một chân */
  netOfPin(item, pinName) {
    const d = this.get();
    const k = pk(typeof item === 'string' ? item : item?.uid, pinName);
    return d.uf2.has(k) ? d.uf2.find(k) : null;
  }
  /** id mạng của khoá / att bất kỳ */
  netOf(keyOrAtt) {
    const k = this.keyOf(keyOrAtt);
    if (!k) return null;
    const d = this.get();
    return d.uf2.find(k);
  }
  /** 2 điểm có thông nhau (qua dây/linh kiện 0 Ω) */
  connected(a, b) { const x = this.netOf(a), y = this.netOf(b); return x != null && x === y; }

  nets() {
    const d = this.get();
    const m = new Map();
    for (const [k, own] of d.pinOwners) {
      const r = d.uf2.find(k);
      if (!m.has(r)) m.set(r, { id: r, members: [] });
      m.get(r).members.push({ item: own.item, pin: own.pin, key: k });
    }
    return [...m.values()];
  }

  // ------------------------------------------------------------------ hàn
  _hasSoldering() { return !!this.game.soldering; }
  _padKeyOfEvent(e) {
    const pad = e?.pad;
    let id = typeof pad === 'string' ? pad : pad?.id ?? e?.padId ?? null;
    let it = e?.item || e?.board || null;
    if (typeof it === 'string') it = this.game.items.byUid(it);
    if (!it && pad && typeof pad === 'object') it = this._boardOfPadRecord(pad);
    if (!it || id == null) return null;
    return `pad:${it.uid}:${id}`;
  }
  _boardOfPadRecord(rec) {
    for (const it of this.game.items.all) {
      const arr = PAD_STORE.get(it);
      if (arr && arr.includes(rec)) return it;
    }
    return null;
  }
  _onJoint(e) {
    const k = this._padKeyOfEvent(e);
    if (!k) return;
    const q = e.quality ?? e.state;
    if (q === 'empty' || q === 'lifted' || q === 'removed') this.solderPads.delete(k);
    else this.solderPads.add(k);
  }
  _onBridge(e) {
    const a = e.a ?? e.from ?? e.pads?.[0], b = e.b ?? e.to ?? e.pads?.[1];
    const ka = this._normEndpoint(a, e), kb = this._normEndpoint(b, e);
    if (ka && kb) this.bridges.push([ka, kb]);
  }
  _normEndpoint(x, ctx = {}) {
    if (x == null) return null;
    if (typeof x === 'string') {
      if (/^(p|pad|bb|psu):/.test(x)) return x;
      // nút của minigame hàn: '<uid>/<id chân hoặc pad>'
      const j = x.lastIndexOf('/');
      if (j > 0) {
        const it = this.game.items.byUid(x.slice(0, j));
        const id = x.slice(j + 1);
        if (it) return !isPerfboard(it) && pinsOf(it).some((q) => q.id === id) ? pk(it.uid, id) : `pad:${it.uid}:${id}`;
      }
      const it = ctx.item || ctx.board;
      const uid = typeof it === 'string' ? it : it?.uid;
      return uid ? `pad:${uid}:${x}` : null;
    }
    if (typeof x !== 'object') return null;
    let it = x.item || x.board || x.inst || (x.uid && this.game.items.byUid(x.uid)) || ctx.item || ctx.board || null;
    if (typeof it === 'string') it = this.game.items.byUid(it);
    if (!it && x.id != null && (x.local || x.neighbors)) it = this._boardOfPadRecord(x);
    if (!it) return null;
    const pin = x.pin?.id ?? x.pin;
    if (pin != null && typeof pin !== 'object') return pk(it.uid, pin);
    const pad = x.pad?.id ?? x.pad ?? x.padId ?? (x.local ? x.id : null);
    if (pad != null) return `pad:${it.uid}:${pad}`;
    return null;
  }
  /** pad (board, id) đã có mối hàn dẫn điện? */
  soldered(board, padId) {
    if (!this._hasSoldering()) return true;
    const k = `pad:${board.uid}:${padId}`;
    if (this.solderPads.has(k)) return true;
    const sol = this.game.soldering;
    try { if (typeof sol.isSoldered === 'function') { const r = sol.isSoldered(board, padId); if (r != null) return !!r; } } catch { /* */ }
    try { if (typeof sol.padState === 'function') { const st = sol.padState(board, padId); if (st) return SOLDERED.has(st) || st === 'lifted'; } } catch { /* */ }
    const arr = PAD_STORE.get(board);
    if (arr) {
      const rec = board.object.userData?.padIndex?.get?.(padId) || arr.find((p) => p.id === padId);
      if (rec && SOLDERED.has(rec.state)) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ điểm gắn (attachment)
  keyOf(att) {
    if (!att) return null;
    if (typeof att === 'string') return att;
    const items = this.game.items;
    const it = items.byUid(att.uid);
    switch (att.kind) {
      case 'bb': return it && isBreadboard(it) ? `bb:${it.uid}:${it.def.netOf(att.hole, it.state || {})}` : null;
      case 'pin': return it ? pk(it.uid, att.pin) : null;
      case 'pad': return it && this.soldered(it, att.pad) ? `pad:${it.uid}:${att.pad}` : null;
      case 'screw': {
        if (!it) return null;
        const t = it.state?.screws?.[att.index] ?? 0;
        if (t <= 0.25) return null;
        const p = pinsOf(it)[att.index];
        return p ? pk(it.uid, p.id) : null;
      }
      case 'shell': return it ? pk(it.uid, `C${att.cavity + 1}`) : null;
      case 'key': return att.key;
      default: return null;
    }
  }
  /** vị trí thế giới của điểm gắn (đầu dây cắm vào đâu) */
  posOf(att, out = new THREE.Vector3()) {
    if (!att) return null;
    const it = this.game.items.byUid(att.uid);
    if (!it) return null;
    it.object.updateWorldMatrix(true, false);
    if (att.kind === 'bb') {
      const h = it.def.holes.find((q) => q.id === att.hole);
      if (!h) return null;
      return it.object.localToWorld(out.set(h.x, BB_TOP, h.z));
    }
    if (att.kind === 'pad') {
      if (isPerfboard(it)) { const [r, c] = String(att.pad).split(',').map(Number); return it.object.localToWorld(out.set(...it.def.holeLocal(r, c, 'top'))); }
      const p = pinsOf(it).find((q) => q.id === att.pad);
      return p ? it.object.localToWorld(out.set(...p.pos)) : null;
    }
    if (att.kind === 'screw') {
      const s = (it.sockets || []).find((q) => q.kind === 'screw-terminal' && q.index === att.index);
      if (!s) return null;
      s.object3D.updateWorldMatrix(true, false);
      return out.setFromMatrixPosition(s.object3D.matrixWorld);
    }
    const pin = att.kind === 'shell' ? `C${att.cavity + 1}` : att.pin;
    const p = pinsOf(it).find((q) => q.id === pin);
    if (!p) {
      // đầu cái: khe header-female mang tên chân
      const s = (it.sockets || []).find((q) => (q.pin ?? q.end) === pin);
      if (s) { s.object3D.updateWorldMatrix(true, false); return out.setFromMatrixPosition(s.object3D.matrixWorld); }
      return it.object.getWorldPosition(out);
    }
    if (att.kind === 'shell') return it.object.localToWorld(out.set(p.pos[0], (it.def.size?.[1] ?? 9) * 0.9, p.pos[2]));
    return it.object.localToWorld(out.set(...p.pos));
  }
  /** hướng dây đi ra khỏi điểm gắn (thế giới, đơn vị) */
  dirOf(att, out = new THREE.Vector3()) {
    const it = att && this.game.items.byUid(att.uid);
    if (!it) return out.set(0, 1, 0);
    it.object.updateWorldMatrix(true, false);
    if (att.kind === 'screw') {
      const s = (it.sockets || []).find((q) => q.kind === 'screw-terminal' && q.index === att.index);
      if (s) return out.set(0, 1, 0).transformDirection(s.object3D.matrixWorld);
    }
    if (att.kind === 'pin') {
      const p = pinsOf(it).find((q) => q.id === att.pin);
      const hs = (it.sockets || []).find((q) => (q.pin ?? q.end) === att.pin && q.kind === 'header-female');
      if (hs) return out.set(0, 1, 0).transformDirection(hs.object3D.matrixWorld);
      if (p?.dir) return out.set(-p.dir[0], -p.dir[1], -p.dir[2]).transformDirection(it.object.matrixWorld);
    }
    return out.set(0, 1, 0).transformDirection(it.object.matrixWorld);
  }
  labelOf(att) {
    if (!att) return '';
    const it = this.game.items.byUid(att.uid);
    const nm = it?.def?.name || '';
    switch (att.kind) {
      case 'bb': return `lỗ ${att.hole}${/^[WXYZ]/.test(att.hole) ? ` (thanh nguồn ${'WZ'.includes(att.hole[0]) ? '+' : '−'})` : ''}`;
      case 'pin': { const p = pinsOf(it).find((q) => q.id === att.pin); return `chân ${p?.name || att.pin} · ${nm}`; }
      case 'pad': return `pad ${att.pad} · ${nm}`;
      case 'screw': return `cầu đấu vít ${att.index + 1}`;
      case 'shell': return `lỗ ${att.cavity + 1} vỏ JST`;
      default: return '';
    }
  }

  /** Các item "họ hàng" của item trúng tia (chính nó + linh kiện cắm trên nó + item cha) */
  _family(it) {
    const out = [it];
    for (let o = it.object.parent; o; o = o.parent) if (o.userData?.item && !out.includes(o.userData.item)) out.push(o.userData.item);
    for (const q of this.game.items.all) if (q !== it && !q.inBag && q.object.parent && isAncestor(it.object, q.object)) out.push(q);
    return out;
  }

  /**
   * Điểm dẫn điện gần điểm thế giới `point` trên vật `object` (tia nhìn trúng).
   * kinds: { bb, pin, pad, screw, shell, hf } (mặc định: bb, pin, pad, hf) → { att, dist, label } | null
   */
  resolvePoint(point, object, { kinds = null, maxPin = 6, exclude = null } = {}) {
    if (!point) return null;
    const K = kinds || { bb: true, pin: true, pad: true, hf: true };
    let it = itemOf(object);
    if (!it && object?.userData?.cableOf) it = object.userData.cableOf;
    if (!it) return null;
    const P = point.isVector3 ? point : _v2.set(...point);
    const cands = [];
    const fam = this._family(it);
    for (const q of fam) {
      if (q === exclude || q.def?.kind === 'tool') continue;
      q.object.updateWorldMatrix(true, false);
      if (K.bb && isBreadboard(q)) {
        _m.copy(q.object.matrixWorld).invert();
        const l = _v.copy(P).applyMatrix4(_m);
        const h = nearestBBHole(q.def, l.x, l.z, 2.6);
        if (h && Math.abs(l.y - BB_TOP) < 12) cands.push({ att: { kind: 'bb', uid: q.uid, hole: h.hole.id }, dist: h.dist + 0.3 });
      }
      if (K.pad && isPerfboard(q)) {
        _m.copy(q.object.matrixWorld).invert();
        const l = _v.copy(P).applyMatrix4(_m);
        const h = q.def.nearestHoleLocal(l.x, l.z);
        if (h && h.dist < 2.0) cands.push({ att: { kind: 'pad', uid: q.uid, pad: h.id }, dist: h.dist + 0.3 });
      }
      if (K.screw && q.def.driveScrew) {
        for (const s of q.sockets || []) {
          if (s.kind !== 'screw-terminal') continue;
          s.object3D.updateWorldMatrix(true, false);
          const d = _v.setFromMatrixPosition(s.object3D.matrixWorld).distanceTo(P);
          if (d < 9) cands.push({ att: { kind: 'screw', uid: q.uid, index: s.index }, dist: d - 1 });
        }
      }
      if (K.shell && q.def.jstShell) {
        const used = q.state?.cavities || [];
        const n = q.def.jstShell;
        let best = null;
        for (let i = 0; i < n; i++) {
          if (used[i]) continue;
          const p = pinsOf(q).find((x) => x.id === `C${i + 1}`);
          if (!p) continue;
          const d = q.object.localToWorld(_v.set(p.pos[0], (q.def.size?.[1] ?? 9) * 0.9, p.pos[2])).distanceTo(P);
          if (!best || d < best.dist) best = { att: { kind: 'shell', uid: q.uid, cavity: i }, dist: Math.min(d, 6) - 2 };
        }
        if (best) cands.push(best);
      }
      if (K.hf) {
        for (const s of q.sockets || []) {
          if (s.kind !== 'header-female' || s.occupiedBy) continue;
          s.object3D.updateWorldMatrix(true, false);
          const d = _v.setFromMatrixPosition(s.object3D.matrixWorld).distanceTo(P);
          if (d < 3.2) cands.push({ att: { kind: 'pin', uid: q.uid, pin: s.pin ?? s.end ?? s.localId }, dist: d });
        }
      }
      if (K.pin && !isBreadboard(q) && !isPerfboard(q)) {
        for (const p of pinsOf(q)) {
          const w = q.object.localToWorld(_v.set(...p.pos));
          const dxz = Math.hypot(w.x - P.x, w.z - P.z), dy = Math.abs(w.y - P.y);
          const d = dxz + Math.max(0, dy - 30);
          if (d < maxPin) cands.push({ att: { kind: 'pin', uid: q.uid, pin: p.id }, dist: d - 0.5 });
        }
      }
    }
    // đầu dây đã đi (cáp nằm trên bàn) → đầu A/B của dây
    if (K.pin && it.state?.cable?.laid && it !== exclude) {
      for (const end of ['A', 'B']) {
        const at = it.state.cable.ends?.[end];
        const w = at && this.posOf(at, _v);
        if (w) { const d = w.distanceTo(P); if (d < 25) cands.push({ att: { kind: 'pin', uid: it.uid, pin: end }, dist: d * 0.2 + 1 }); }
      }
    }
    if (!cands.length) return null;
    cands.sort((a, b) => a.dist - b.dist);
    const c = cands[0];
    return { att: c.att, dist: c.dist, label: this.labelOf(c.att) };
  }

  // ------------------------------------------------------------------ dựng
  _rebuild() {
    const game = this.game;
    const items = game.items.all;
    const uf = new UF();
    const pinOwners = new Map();
    const wires = [];
    const live = [];
    for (const it of items) if (isLive(it)) live.push(it);
    for (const it of live) it.object.updateWorldMatrix(true, false);

    // 1) chân + nối trong
    for (const it of live) {
      const pins = pinsOf(it);
      const ids = new Set(pins.map((p) => p.id));
      for (const p of pins) {
        const k = pk(it.uid, p.id);
        uf.find(k);
        pinOwners.set(k, { item: it, pin: p.id });
        uf.union(k, `pad:${it.uid}:${p.id}`);
        if (p.net && ids.has(p.net)) uf.union(k, pk(it.uid, p.net));
      }
      const E = it.def.electrical;
      const cable = isCable(it);
      if (Array.isArray(E?.internal) && !cable) for (const [a, b] of E.internal) if (ids.has(a) && ids.has(b)) uf.union(pk(it.uid, a), pk(it.uid, b));
      for (const [a, b] of INTERNAL[it.def.id] || []) if (ids.has(a) && ids.has(b)) uf.union(pk(it.uid, a), pk(it.uid, b));
      if (cable && !it.state?.dead) {
        const len = it.state?.lengthMm ?? it.object.userData?.jw?.len ?? it.def.props?.lengthMm ?? 200;
        wires.push({ id: it.uid, a: pk(it.uid, 'A'), b: pk(it.uid, 'B'), len, label: it.def.name, item: it, ohmPerM: E?.ohmPerM ?? 0.134 });
      }
    }

    // 2) linh kiện cắm trong khe
    for (const it of live) {
      if (!it.socket) continue;
      const s = game.sockets.get(it.socket);
      const Y = s?.owner;
      if (!Y || !isLive(Y)) continue;
      try { this._mapSocket(uf, it, s, Y); } catch (e) { if (!this._warned) { this._warned = true; console.warn('[netlist] lỗi ánh xạ khe', s.kind, e); } }
    }

    // 3) dây đã đi (wiring.js)
    for (const it of live) {
      const ends = it.state?.cable?.ends;
      if (!ends) continue;
      for (const end of ['A', 'B']) {
        const k = this.keyOf(ends[end]);
        if (k) uf.union(pk(it.uid, end), k);
      }
    }

    // 4) mối hàn
    this._solder(uf, live);

    // 5) nối ngoài
    for (const { a, b } of this.links.values()) {
      const ka = this.keyOf(a), kb = this.keyOf(b);
      if (ka) uf.find(ka);
      if (kb) uf.find(kb);
      if (ka && kb) uf.union(ka, kb);
    }

    const uf2 = uf.clone();
    for (const w of wires) uf2.union(w.a, w.b);
    this.version++;
    this.dirty = false;
    this.data = { uf, uf2, wires, pinOwners, live, version: this.version };
    game.events.emit('netlist:changed', { version: this.version });
    return this.data;
  }

  _pinWorld(it, p, out = _v) { return it.object.localToWorld(out.set(...p.pos)); }

  _mapSocket(uf, it, s, Y) {
    const K = s.kind;
    const pins = pinsOf(it);
    if (!pins.length) return;
    if (/^bb-/.test(K) && isBreadboard(Y)) {
      _m.copy(Y.object.matrixWorld).invert();
      for (const p of pins) {
        const l = this._pinWorld(it, p).applyMatrix4(_m);
        if (l.y > BB_TOP + 1.5) continue;
        const h = nearestBBHole(Y.def, l.x, l.z, 1.0);
        if (h) uf.union(pk(it.uid, p.id), `bb:${Y.uid}:${Y.def.netOf(h.hole.id, Y.state || {})}`);
      }
      return;
    }
    if (K === 'pcb-hole' && isPerfboard(Y)) {
      _m.copy(Y.object.matrixWorld).invert();
      for (const p of pins) {
        const l = this._pinWorld(it, p).applyMatrix4(_m);
        if (l.y > 4) continue;
        const h = Y.def.nearestHoleLocal(l.x, l.z);
        if (!h || h.dist > 1.0) continue;
        const k = `pad:${Y.uid}:${h.id}`;
        uf.find(k);
        if (this.soldered(Y, h.id)) uf.union(pk(it.uid, p.id), k);
      }
      return;
    }
    if (Array.isArray(s.contacts) && s.contacts.length) {
      // tiếp điểm theo `mates` (JST, XT60)
      let matched = 0;
      for (const c of s.contacts) {
        const xp = pins.find((p) => p.mates != null && String(p.mates) === String(c.pin)) || (c.mates != null ? pins.find((p) => p.id === c.mates) : null);
        if (xp) { uf.union(pk(it.uid, xp.id), pk(Y.uid, c.pin)); matched++; }
      }
      if (matched) return;
      // tiếp điểm hình học (đế DIP): chân item ↔ tiếp điểm gần nhất (mặt phẳng XZ của chủ khe)
      _m.copy(Y.object.matrixWorld).invert();
      for (const p of pins) {
        const l = this._pinWorld(it, p).applyMatrix4(_m);
        let best = null, bd = 1.3;
        for (const c of s.contacts) {
          if (!c.local) continue;
          const d = Math.hypot(c.local[0] - l.x, c.local[2] - l.z);
          if (d < bd) { bd = d; best = c; }
        }
        if (best) uf.union(pk(it.uid, p.id), pk(Y.uid, best.pin));
      }
      return;
    }
    if (K === 'screw-terminal') {
      const clamped = typeof s.clamped === 'function' ? s.clamped() : (Y.state?.screws?.[s.index] ?? 0) > 0.25;
      if (!clamped) return;
      const yp = pinsOf(Y)[s.index];
      const xp = this._nearestPinTo(it, pins, s.object3D);
      if (yp && xp) uf.union(pk(it.uid, xp.id), pk(Y.uid, yp.id));
      return;
    }
    if (K === 'wire-pad') {
      const xp = this._nearestPinTo(it, pins, s.object3D);
      if (xp && this.soldered(Y, s.pad)) uf.union(pk(it.uid, xp.id), `pad:${Y.uid}:${s.pad}`);
      return;
    }
    // chung: header cái, đầu cái Dupont… — chiếu chân vào hệ toạ độ từng khe cùng loại của chủ khe
    const peers = (Y.sockets || []).filter((q) => q.kind === K);
    for (const p of pins) {
      const w = this._pinWorld(it, p, _v2);
      for (const q of peers) {
        q.object3D.updateWorldMatrix(true, false);
        _m.copy(q.object3D.matrixWorld).invert();
        const l = _v.copy(w).applyMatrix4(_m);
        if (Math.hypot(l.x, l.z) <= 1.1 && Math.abs(l.y) < 20) {
          const yp = q.pin ?? q.end ?? q.localId;
          if (yp != null) uf.union(pk(it.uid, p.id), pk(Y.uid, yp));
          break;
        }
      }
    }
  }

  _nearestPinTo(it, pins, obj) {
    obj.updateWorldMatrix(true, false);
    const a = _v2.setFromMatrixPosition(obj.matrixWorld);
    let best = null, bd = Infinity;
    for (const p of pins) { const d = this._pinWorld(it, p).distanceTo(a); if (d < bd) { bd = d; best = p; } }
    return best;
  }

  _solder(uf, live) {
    // pad hàn có cầu thiếc → nối với pad kề có thiếc
    for (const it of live) {
      const arr = PAD_STORE.get(it);
      if (!arr) continue;
      const idx = it.object.userData?.padIndex;
      for (const rec of arr) {
        if (rec.state !== 'bridge') continue;
        for (const nb of rec.neighbors || []) {
          const r2 = idx?.get?.(nb) || arr.find((q) => q.id === nb);
          if (r2 && r2.state !== 'empty' && r2.state !== 'lifted') uf.union(`pad:${it.uid}:${rec.id}`, `pad:${it.uid}:${nb}`);
        }
        // pad module trùng tên chân
      }
    }
    for (const [a, b] of this.bridges) uf.union(a, b);
    // API của minigame hàn (nếu có): danh sách nối
    const sol = this.game.soldering;
    let conns = null;
    try { conns = typeof sol?.connections === 'function' ? sol.connections() : null; } catch { conns = null; }
    if (Array.isArray(conns)) {
      for (const c of conns) {
        let eps = null;
        if (Array.isArray(c)) eps = c;
        else if (c && (c.a !== undefined || c.b !== undefined)) eps = [c.a, c.b];
        else if (Array.isArray(c?.pads)) eps = c.pads;
        else if (Array.isArray(c?.pins)) eps = [c.pad ? { pad: c.pad } : null, ...c.pins].filter(Boolean);
        else if (c?.pad !== undefined) eps = [c];
        if (!eps) continue;
        const keys = eps.map((x) => this._normEndpoint(x, c)).filter(Boolean);
        for (const k of keys) if (k.startsWith('pad:')) this.solderPads.add(k);
        for (let i = 1; i < keys.length; i++) uf.union(keys[0], keys[i]);
      }
    }
  }
}

/** Nối trong bổ sung (chân trùng chức năng trên module) */
const INTERNAL = {
  'drv8871-module': [['VM', 'T-VM'], ['GND', 'T-GND']],
  'bss138-4ch-module': [['GND-HV', 'GND-LV']],
};
