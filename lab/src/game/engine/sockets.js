// =============================================================================
// sockets.js — Hệ khe cắm (GAME_API §5): đế IC, lỗ breadboard, header, đầu JST/XT60, lỗ vít, khe robot…
//
//   const s = sockets.add({
//     id?, owner: ItemInstance|null, object3D /* vị trí + hướng khe; +Y = hướng rút ra */, kind: 'dip40'|…,
//     accepts?(item, ctx) → { ok, reason?, orientation?: 'ok'|'reversed'|'offset' } | boolean,
//     pose?: Matrix4 (tư thế item khi cắm, TƯƠNG ĐỐI object3D; bỏ trống → dịch xuống def.mount.seatY),
//     tolerance?: { pos: 2, angleDeg: 8 }, snapRadius?: 30, polarized?: bool, name?: 'Đế IC 40 chân',
//     onInsert?(item, info), onRemove?(item),
//   });
//   sockets.remove(id) · get(id) · all() · findNear(item, ray, {maxT}) · insert(item, socket, opts) · release(item)
//
// Mặc định accepts(): item.def.insertInto (mảng kind, hỗ trợ 'dip*') hoặc def.mounts / def.socketKinds / def.mount (chuỗi).
// ctx truyền cho accepts: { rotSteps (số lần nhấn R, 0..3), game, socket } — khe tự quyết hướng nếu muốn.
// Khe "phân cực" (dip*, header*, jst*, xt*, usb*, ic*): xoay 90° → không cắm được; 180° → cắm được nhưng
//   orientation = 'reversed' (ghi lại; hậu quả xử lý khi cấp nguồn).
// Cắm khi tâm ngắm lệch quá dung sai (vòng vàng) → cong chân: item.state.bentPins++, sự kiện 'fault' {kind:'bent-pins'}.
// Sự kiện: 'socket:inserted' {item, socket, orientation, bent} + 'item:placed' {item, socket} · 'socket:removed' {item, socket}
// =============================================================================
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const _mr = new THREE.Matrix4();   // [đi dây] ma trận tạm RIÊNG cho localPose — trước đây dùng chung _m với _finish/targetMatrix → IC cắm ngược (xoay π) bị xoay 2 lần + mất pose
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const POLARIZED = /^(dip|header|jst|xt|usb|ic|plcc|zif|molex|dupont-f?\d)/i;

// ---------------------------------------------------------------------------- bóng xem trước
export const GHOST_COLORS = { ok: 0x3ddc84, warn: 0xffc53d, bad: 0xff4d4f };
// [bàn 3D] kiểu "đậm" (ghost.strong = true): sáng + đục hơn — bóng xanh trên bo mạch xanh vẫn nhìn rõ từ camera quỹ đạo
const GHOST_STRONG = { ok: 0x0fbf5f, warn: 0xe8a900, bad: 0xe8263b };
const _ghostMats = {};
function ghostMats(strong = false) {
  const key = strong ? 'strong' : 'soft';
  if (_ghostMats[key]) return _ghostMats[key];
  const out = (_ghostMats[key] = {});
  for (const [k, c] of Object.entries(strong ? GHOST_STRONG : GHOST_COLORS)) {
    out[k] = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: strong ? 0.72 : 0.38, depthWrite: false, toneMapped: false });
  }
  return out;
}

/** Bóng mờ của một item (dùng khi đặt lên mặt bàn và khi cắm vào khe) */
export class Ghost {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'ghost';
    this.root.visible = false;
    this.root.matrixAutoUpdate = false;
    scene.add(this.root);
    this.forUid = null;
    this.state = null;
    this.strong = false;           // [bàn 3D] vật liệu đậm (ux/bench.js)
    this._meshes = [];
  }

  _build(item) {
    for (const c of [...this.root.children]) this.root.remove(c);
    this._meshes = [];
    const src = item.object;
    // sao chép cấu trúc nhưng chỉ lấy Mesh (bỏ sprite, đèn…), dùng chung geometry
    const clone = cloneVisual(src);
    clone.position.set(0, 0, 0); clone.quaternion.identity(); clone.scale.copy(src.scale);
    const drop = [];
    clone.traverse((o) => {
      if (o.isLight || o.isSprite || o.isPoints || o.isLine || o.userData?.isHand) drop.push(o);
      if (o.isMesh || o.isInstancedMesh) { o.castShadow = false; o.receiveShadow = false; o.raycast = () => {}; this._meshes.push(o); }
    });
    drop.forEach((o) => o.parent?.remove(o));
    this.root.add(clone);
    this.root.traverse((o) => { o.raycast = () => {}; });
    this.forUid = item.uid;
    this.state = null;
    this._style = null;
  }

  /** Hiện bóng tại matrixWorld với trạng thái 'ok' | 'warn' | 'bad' */
  show(item, matrixWorld, state = 'ok') {
    if (this.forUid !== item.uid) this._build(item);
    const style = `${state}|${this.strong}`;
    if (this._style !== style) {
      const mats = ghostMats(this.strong);
      const m = mats[state] || mats.ok;
      for (const o of this._meshes) o.material = m;
      this.state = state;
      this._style = style;
    }
    this.root.matrix.copy(matrixWorld);
    this.root.matrixWorldNeedsUpdate = true;
    this.root.visible = true;
  }

  hide() { this.root.visible = false; }
  get visible() { return this.root.visible; }
}

// ---------------------------------------------------------------------------- hệ khe cắm
export class Sockets {
  constructor(game) {
    this.game = game;
    this.map = new Map();
    this._seq = 0;
    this.anims = [];
    this.ghost = new Ghost(game.scene);
  }

  add(spec = {}) {
    if (!spec.object3D) {
      // cho phép khai báo bằng toạ độ: { position:[x,y,z], parent }
      const o = new THREE.Object3D();
      if (spec.position) o.position.set(...spec.position);
      (spec.parent || spec.owner?.object || this.game.scene).add(o);
      spec.object3D = o;
    }
    let id = spec.id;
    if (!id || this.map.has(id)) { do id = `sock-${++this._seq}`; while (this.map.has(id)); }
    const s = Object.assign({
      owner: null, kind: 'generic', tolerance: { pos: 2, angleDeg: 8 }, snapRadius: 30, occupiedBy: null, name: null,
    }, spec, { id });
    s.tolerance = { pos: 2, angleDeg: 8, ...(spec.tolerance || {}) };
    if (s.polarized === undefined) s.polarized = POLARIZED.test(s.kind);
    s.object3D.userData.socketId = id;
    this.map.set(id, s);
    this.game.events?.emit('socket:added', { socket: s });
    return s;
  }

  remove(id) {
    const s = this.map.get(id);
    if (!s) return;
    if (s.occupiedBy) {
      const it = s.occupiedBy;
      this.release(it, { silent: true });
      if (it.object && this.game.items) { it.object.updateWorldMatrix(true, false); this.game.items.drop(it); }
    }
    this.map.delete(id);
  }

  get(id) { return this.map.get(id) || null; }
  all() { return [...this.map.values()]; }
  ofOwner(inst) { return this.all().filter((s) => s.owner === inst); }

  /** Kiểm tra item có cắm được vào khe không (+ hướng cắm) */
  check(socket, item, ctx = {}) {
    const steps = (((ctx.rotSteps ?? 0) % 4) + 4) % 4;
    const fullCtx = { rotSteps: steps, game: this.game, socket, ...ctx };
    // linh kiện chưa sẵn sàng (vd điện trở chưa bẻ chân) → chỉ báo lý do với khe mà nó vốn cắm vừa
    if (typeof item?.def?.insertReady === 'function' && socketKindsOf(item.def).some((k) => k === socket.kind || (k.endsWith('*') && socket.kind.startsWith(k.slice(0, -1))))) {
      let ready;
      try { ready = item.def.insertReady(item); } catch { ready = { ok: true }; }
      if (ready && ready.ok === false) return { ok: false, reason: `${ready.reason || 'Chưa sẵn sàng để cắm'} (nhấn B)`, rotSteps: steps };
    }
    let r;
    try {
      if (typeof socket.accepts === 'function') r = socket.accepts(item, fullCtx);
      else r = defaultAccepts(socket, item);
    } catch (e) { console.warn('[sockets] accepts lỗi', socket.id, e); r = { ok: false, reason: 'Lỗi kiểm tra khe' }; }
    if (r === true || r === undefined) r = { ok: true };
    if (r === false || r === null) r = { ok: false };
    r = { ...r };
    if (r.ok && !r.orientation) {
      if (socket.polarized) {
        if (steps === 1 || steps === 3) return { ok: false, reason: 'Lệch 90° — chân không khớp lỗ (nhấn R để xoay)' };
        r.orientation = steps === 2 ? 'reversed' : 'ok';
      } else r.orientation = 'ok';
    }
    r.rotSteps = steps;
    return r;
  }

  /** Khe có đang "dùng được" (không bị chiếm, chủ khe không đang bị cầm/cất) */
  _available(s, item) {
    if (s.occupiedBy || s.disabled) return false;
    const owner = s.owner;
    if (owner) {
      if (owner === item || owner.heldBy || owner.inBag || !owner.object.parent) return false;
      if (item && isAncestor(item.object, s.object3D)) return false;
    }
    let o = s.object3D;
    // nhóm '__anchors' chỉ chứa điểm neo rỗng (có thể bị ẩn) — không tính là "vật bị ẩn"
    for (; o; o = o.parent) if (!o.visible && o.name !== '__anchors') return false;
    return !!s.object3D.parent;
  }

  /**
   * Khe tương thích gần tia nhìn nhất (khoảng cách vuông góc từ tâm khe tới tia < snapRadius).
   * ray: { origin: Vector3, direction: Vector3 } · opts.maxT: chỉ xét khe trong tầm (mm dọc theo tia)
   * → { socket, dist, t, result, aligned } | null
   */
  findNear(item, ray, { maxT = 1400, rotSteps = 0 } = {}) {
    let best = null;
    for (const s of this.map.values()) {
      // lọc rẻ trước (vị trí từ matrixWorld đã cập nhật ở khung trước — breadboard có hàng nghìn lỗ)
      const p = _v.setFromMatrixPosition(s.object3D.matrixWorld);
      const t = _v2.subVectors(p, ray.origin).dot(ray.direction);
      if (t < 50 || t > maxT) continue;
      const dist = _v2.copy(ray.direction).multiplyScalar(t).add(ray.origin).distanceTo(p);
      const lim = s.snapRadius ?? 30;
      if (dist > lim || (best && dist >= best.dist)) continue;
      if (!this._available(s, item)) continue;
      const result = this.check(s, item, { rotSteps });
      if (!result.ok && !result.reason) continue;    // không liên quan → bỏ qua
      best = { socket: s, dist, t, result, aligned: dist <= Math.max(s.tolerance.pos * 3, 6) };
    }
    return best;
  }

  /** Ma trận thế giới của item khi cắm vào khe */
  targetMatrix(socket, item, result = {}, out = new THREE.Matrix4()) {
    socket.object3D.updateWorldMatrix(true, false);
    out.copy(socket.object3D.matrixWorld);
    out.multiply(this.localPose(socket, item, result, _m2));
    return out;
  }

  localPose(socket, item, result = {}, out = new THREE.Matrix4()) {
    if (socket.pose?.isMatrix4) out.copy(socket.pose);
    else out.makeTranslation(0, -(item?.def?.mount?.seatY || 0), 0);
    const steps = result.rotSteps ?? 0;
    let ang = 0;
    if (result.orientation === 'reversed') ang = Math.PI;
    else if (!socket.polarized && steps) ang = (steps * Math.PI) / 2;
    if (ang) out.multiply(_mr.makeRotationY(ang));
    // giữ tỉ lệ của chính item
    if (item?.object) { _s.copy(item.object.scale); if (_s.x !== 1 || _s.y !== 1 || _s.z !== 1) out.multiply(_mr.makeScale(_s.x, _s.y, _s.z)); }
    return out;
  }

  /**
   * Cắm item vào khe (có hoạt cảnh). opts: { result, aligned=true, instant=false, onDone }
   * Item có thể đang ở tay (sẽ được tách khỏi tay) hoặc nằm trong thế giới.
   */
  insert(item, socket, opts = {}) {
    const result = opts.result || this.check(socket, item, { rotSteps: opts.rotSteps || 0 });
    if (!result.ok) {
      this.game.hud?.toast?.(result.reason || 'Không cắm được vào khe này', { kind: 'warn' });
      this.game.audio?.play('error');
      return false;
    }
    const bent = opts.aligned === false;
    const hands = this.game.hands;
    if (item.heldBy && hands) { hands.detach(item.heldBy); item.heldBy = null; }
    socket.occupiedBy = item;       // giữ chỗ ngay (tránh 2 vật cùng cắm)
    item.socket = socket.id;
    item.phys && (item.phys.falling = false);
    const obj = item.object;
    if (obj.parent !== this.game.scene && obj.parent !== this.game.items?.root) { obj.updateWorldMatrix(true, false); this.game.scene.attach(obj); }
    const anim = { item, socket, result, bent, t: 0, from: obj.matrixWorld.clone(), onDone: opts.onDone };
    if (opts.instant) { this._finish(anim, true); return true; }
    if (hands) { hands.setPose('right', 'press'); hands.playGesture('push', 'right', 0.34); }
    this.anims.push(anim);
    return true;
  }

  _finish(a, silent = false) {
    const { item, socket, result, bent } = a;
    const obj = item.object;
    socket.object3D.updateWorldMatrix(true, false);
    socket.object3D.add(obj);
    this.localPose(socket, item, result, _m);
    _m.decompose(obj.position, obj.quaternion, obj.scale);
    obj.updateMatrixWorld(true);
    const info = { orientation: result.orientation || 'ok', bent, socket, result };
    item.socketInfo = { orientation: info.orientation, rotSteps: result.rotSteps || 0, bent };
    if (bent) {
      item.state.bentPins = (item.state.bentPins || 0) + 1;
      if (!silent) {
        this.game.hud?.toast?.(`Cong chân ${item.def.name || item.def.id}! Căn thẳng tâm ngắm (bóng xanh) rồi mới ấn.`, { kind: 'danger' });
        this.game.audio?.play('error');
        this.game.events?.emit('fault', { kind: 'bent-pins', item, socket });
      }
    }
    try { socket.onInsert?.(item, info); } catch (e) { console.warn('[sockets] onInsert lỗi', e); }
    if (!silent) {
      this.game.audio?.play('snap', { pos: socket.object3D });
      if (info.orientation === 'reversed') this.game.events?.emit('socket:reversed', { item, socket });
      this.game.events?.emit('socket:inserted', { item, socket, orientation: info.orientation, bent });
      this.game.events?.emit('item:placed', { item, socket, surface: null });
      this.game.hands?.setPose('right', 'idle');
    }
    a.onDone?.(info);
  }

  /** Rút item khỏi khe (gọi trước khi nhặt). Trả về khe cũ. */
  release(item, { silent = false } = {}) {
    const s = item?.socket ? this.map.get(item.socket) : null;
    if (item) { item.socket = null; item.socketInfo = null; }
    if (!s) return null;
    if (s.occupiedBy === item) s.occupiedBy = null;
    // hoạt cảnh đang chạy → huỷ
    this.anims = this.anims.filter((a) => a.item !== item);
    try { s.onRemove?.(item); } catch (e) { console.warn('[sockets] onRemove lỗi', e); }
    if (!silent) {
      this.game.audio?.play('click', { pos: s.object3D, vol: 0.7 });
      this.game.events?.emit('socket:removed', { item, socket: s });
    }
    return s;
  }

  /** Cắm ngay không hoạt cảnh (khi tải bản lưu) */
  insertInstant(item, socketId, orientation = 'ok', rotSteps = 0) {
    const s = this.map.get(socketId);
    if (!s || s.occupiedBy) return false;
    try { if (typeof s.accepts === 'function') s.accepts(item, { rotSteps, game: this.game, socket: s, loading: true }); } catch { /* chỉ để khe tính lại pose */ }
    s.occupiedBy = item; item.socket = s.id;
    this._finish({ item, socket: s, result: { ok: true, orientation, rotSteps }, bent: false }, true);
    return true;
  }

  update(dt) {
    if (!this.anims.length) return;
    const done = [];
    for (const a of this.anims) {
      a.t += dt;
      const obj = a.item.object;
      const target = this.targetMatrix(a.socket, a.item, a.result, _m);
      // 2 pha: bay tới phía trên khe (0.18 s) → ấn xuống (0.14 s)
      const T1 = 0.18, T2 = 0.14;
      const up = _v.set(0, 1, 0).transformDirection(a.socket.object3D.matrixWorld).multiplyScalar(14);
      const pre = _m2.copy(target);
      pre.elements[12] += up.x; pre.elements[13] += up.y; pre.elements[14] += up.z;
      let from, to, k;
      if (a.t < T1) { from = a.from; to = pre; k = a.t / T1; }
      else { from = pre; to = target; k = Math.min(1, (a.t - T1) / T2); }
      k = k * k * (3 - 2 * k);
      lerpMatrix(from, to, k, obj);
      if (a.t >= T1 + T2) done.push(a);
    }
    for (const a of done) { this.anims.splice(this.anims.indexOf(a), 1); this._finish(a); }
  }

  serialize() {
    const out = {};
    for (const s of this.map.values()) if (s.occupiedBy) out[s.id] = s.occupiedBy.uid;
    return out;
  }
}

// ---------------------------------------------------------------------------- tiện ích
/**
 * Object3D.clone() sao chép userData bằng JSON → lỗi vòng lặp nếu userData chứa ItemInstance/Object3D.
 * Hàm này tạm cất userData của cả cây, clone, rồi trả lại (bản sao có userData rỗng).
 */
export function cloneVisual(src) {
  const saved = [];
  src.traverse((o) => { saved.push([o, o.userData]); o.userData = {}; });
  try { return src.clone(true); } finally { for (const [o, u] of saved) o.userData = u; }
}

const _pa = new THREE.Vector3(), _pb = new THREE.Vector3(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _sa = new THREE.Vector3(), _sb = new THREE.Vector3();
/** Nội suy giữa 2 ma trận thế giới rồi đặt cho obj (obj là con trực tiếp của scene hoặc nhóm không biến đổi) */
function lerpMatrix(a, b, k, obj) {
  a.decompose(_pa, _qa, _sa);
  b.decompose(_pb, _qb, _sb);
  const parent = obj.parent;
  _pa.lerp(_pb, k); _qa.slerp(_qb, k); _sa.lerp(_sb, k);
  _m.compose(_pa, _qa, _sa);
  if (parent) { parent.updateWorldMatrix(true, false); _m.premultiply(_m2.copy(parent.matrixWorld).invert()); }
  _m.decompose(obj.position, obj.quaternion, obj.scale);
}

function isAncestor(a, b) { for (let o = b; o; o = o.parent) if (o === a) return true; return false; }

export function socketKindsOf(def) {
  if (!def) return [];
  const k = [];
  for (const key of ['insertInto', 'mounts', 'socketKinds', 'fits']) if (Array.isArray(def[key])) k.push(...def[key]);
  if (typeof def.mount === 'string') k.push(def.mount);
  if (Array.isArray(def.mount?.kinds)) k.push(...def.mount.kinds);
  if (typeof def.socketKind === 'string') k.push(def.socketKind);
  return k;
}

function defaultAccepts(socket, item) {
  const kinds = socketKindsOf(item?.def);
  const ok = kinds.some((k) => k === socket.kind || (k.endsWith('*') && socket.kind.startsWith(k.slice(0, -1))));
  if (ok) return { ok: true };
  if (!kinds.length) return { ok: false };     // item không cắm vào đâu cả → im lặng
  // cùng "họ" khe nhưng sai cỡ (vd IC 28 chân vào đế 40) → báo lý do
  const fam = (s) => String(s).replace(/[\d*:].*$/, '');
  if (kinds.some((k) => fam(k) && fam(k) === fam(socket.kind))) return { ok: false, reason: `Không vừa: khe ${socket.kind}, linh kiện cần ${kinds.join('/')}` };
  return { ok: false };
}
