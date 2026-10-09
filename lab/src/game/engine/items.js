// =============================================================================
// items.js — Quản lý vật thể cầm được (ItemInstance) + vật lý nhẹ (rơi, nảy, nằm yên trên mặt).
//
//   game.items.get(id) → def            game.items.spawn(id, pose, { uid }) → ItemInstance
//   game.items.all (mảng instance)      game.items.byUid(uid) · ofObject(obj3d) · remove(inst)
//   game.items.drop(inst, vel, spin)    thả rơi (G) · settle(inst) đặt xuống mặt đỡ ngay bên dưới
//   game.items.register(def)            thêm def lúc chạy (registry ngoài vẫn được ưu tiên tra cứu trước)
//
// pose: { pos:[x,y,z]|Vector3, rot:[rx,ry,rz], quat, rotY, scale, matrix: Matrix4 (thế giới), parent, drop:true (rơi xuống mặt) }
// ItemInstance (GAME_API §7): { uid, def, object, state:{}, heldBy:'right'|'left'|null, socket:null|socketId,
//                              inBag:false, sockets:[], phys:{…}, subparts:[] }
//
// Hỗ trợ CAD: def.cad = 'boards/esp32-s3-devkitc-1' → dùng core/cad.js: hiện mô hình def.build() ngay,
// khi GLB tải xong thì thêm mô hình thật (×1000 → mm) vào CÙNG gốc item, ẩn mesh thủ tục (layer 31, vẫn giữ các mốc
// tip/anchor/khe) và quét lại sub-part tương tác (subparts.js). def.cadOptions: xem _attachCad().
// def.prompts = [{ key, label, when?(inst, game), do(ctx) }] → thêm gợi ý tương tác riêng cho item.
// =============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { localBox } from './hands.js';

const GRAVITY = 9810;           // mm/s²
const _e = new THREE.Euler();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
const DOWN = new THREE.Vector3(0, -1, 0);

/** Áp tư thế cho object (cùng quy ước với items/registry.js applyPose) */
export function applyPose(object, pose = {}) {
  if (!pose) return object;
  if (pose.isMatrix4) { pose.decompose(object.position, object.quaternion, object.scale); return object; }
  if (pose.matrix?.isMatrix4) { pose.matrix.decompose(object.position, object.quaternion, object.scale); return object; }
  const p = pose.pos ?? pose.position;
  if (p) Array.isArray(p) ? object.position.set(+p[0] || 0, +p[1] || 0, +p[2] || 0) : object.position.copy(p);
  if (pose.quat) Array.isArray(pose.quat) ? object.quaternion.set(...pose.quat) : object.quaternion.copy(pose.quat);
  else if (pose.rot) Array.isArray(pose.rot) ? object.rotation.copy(_e.set(pose.rot[0] || 0, pose.rot[1] || 0, pose.rot[2] || 0)) : object.rotation.copy(pose.rot);
  else if (pose.rotY !== undefined) object.rotation.set(0, pose.rotY, 0);
  if (pose.scale) object.scale.setScalar(pose.scale);
  return object;
}

/** Kiểu dụng cụ: 'iron' | 'screwdriver' | 'meter' | … (tool.kind → grip.pose holdTool:<kind> → đoán theo id) */
export function toolKind(def) {
  if (!def) return null;
  if (def.tool?.kind) return def.tool.kind;
  const p = def.grip?.pose;
  if (typeof p === 'string' && p.startsWith('holdTool:')) return p.slice(9);
  const s = `${def.id} ${def.name || ''}`.toLowerCase();
  if (/tua[- ]?v[ií]t|screwdriver|driver/.test(s)) return 'screwdriver';
  if (/m[ỏo][- ]?h[àa]n|soldering|iron/.test(s)) return 'iron';
  if (/đồng hồ|dong-ho|multimeter|dmm|meter/.test(s)) return 'meter';
  if (/que đo|probe/.test(s)) return 'probe';
  if (/nh[íi]p|tweezer/.test(s)) return 'tweezers';
  if (/thi[ếe]c|solder/.test(s)) return 'solder';
  if (/k[ìi]m|plier|cutter|stripper|crimp/.test(s)) return 'pliers';
  return def.kind === 'tool' ? 'default' : null;
}

export class Items {
  constructor(game, { getDef = null, allDefs = null } = {}) {
    this.game = game;
    this._extGet = getDef;            // từ items/registry.js (nếu có)
    this._extAll = allDefs;
    this._local = new Map();          // def đăng ký lúc chạy / def thử nghiệm
    this.all = [];
    this._byUid = new Map();
    this._seq = 0;
    this.root = new THREE.Group();
    this.root.name = 'items';
    game.scene.add(this.root);
    this._ray = new THREE.Raycaster();
    this._ray.far = 6000;
    this._cad = null;                 // module core/cad.js (nạp khi cần)
  }

  setRegistry({ getDef, allDefs }) { this._extGet = getDef || this._extGet; this._extAll = allDefs || this._extAll; }

  register(def) { if (def?.id) this._local.set(def.id, def); return def; }

  get(id) {
    if (id && typeof id === 'object' && id.build) return id;
    let d = null;
    try { d = this._extGet?.(id) || null; } catch { d = null; }
    return d || this._local.get(id) || null;
  }

  /** Mọi def (registry + nội bộ), không trùng id */
  defs() {
    const m = new Map();
    try { for (const d of this._extAll?.() || []) if (d?.id) m.set(d.id, d); } catch { /* registry lỗi */ }
    for (const d of this._local.values()) if (!m.has(d.id)) m.set(d.id, d);
    return [...m.values()];
  }

  byUid(uid) { return this._byUid.get(uid) || null; }

  ofObject(obj) {
    for (let o = obj; o; o = o.parent) if (o.userData?.item) return o.userData.item;
    return null;
  }

  // ------------------------------------------------------------------ sinh vật thể
  _buildObject(def) {
    let obj = def.build(this.game);
    if (obj && !obj.isObject3D && obj.object?.isObject3D) obj = obj.object;      // chấp nhận dạng { object }
    if (!obj?.isObject3D) throw new Error(`item ${def.id}: build() phải trả về Object3D`);
    if (def.cad && typeof window !== 'undefined' && this._cad?.loadCad) this._attachCad(def, obj);
    return obj;
  }

  /**
   * Thay hình thủ tục bằng mô hình CAD (GLB) khi tải xong — GIỮ NGUYÊN gốc item (userData, mốc tip/khe/anchor do build() tạo):
   * mesh dự phòng chuyển sang layer 31 (không vẽ, không raycast) chứ không xoá; GLB (×1000 → mm) được căn đáy giữa y = 0.
   * def.cadOptions = { rotateX, rotateY, rotateZ, scale, offset:[x,y,z], onBottom:true, keepFallback:false,
   *   // [mở rộng 2026-10, tương thích ngược — tích hợp CAD thật cho linh kiện game]
   *   scale: số | [sx, sy, sz]          (không đều: kéo dài thân tụ hoá… theo kích thước thật)
   *   hide: ['pin_*', …]                node GLB (khớp tên, '*' đại diện, không phân biệt hoa thường) bị ẩn + bỏ raycast
   *                                      → vd. dùng chân dây thủ tục (bẻ/cắt được) thay cho chân CAD
   *   keep: ['leads', 'bands', …]       mesh thủ tục (khớp tên chính nó hoặc tổ tiên) VẪN hiện cạnh GLB
   *                                      (tương đương userData.keepWithCad = true trên mesh)
   *   onLoad(glb, root, game)           tinh chỉnh sau khi đặt GLB (đổi màu thấu kính LED, xoè chân DIP, cắt hình…)
   *   // [hiệu năng 2026-10]
   *   merge: true | { keep: ['nut_*'] } gộp mesh GLB tĩnh theo vật liệu SAU onLoad (giảm draw call: ESP32 356 → ~30 mesh).
   *                                      Không gộp node (hoặc con của node) khớp manifest 'interact' / def.interact / hide /
   *                                      keep, có userData.cadNode|interact|keepWithCad, hay được tham chiếu từ root.userData.
   * }
   * def.cadOptions có thể là hàm (root, game) → object (tuỳ biến theo bản sao).
   */
  _attachCad(def, root) {
    const o = (typeof def.cadOptions === 'function' ? def.cadOptions(root, this.game) : def.cadOptions) || {};
    this._cad.loadCad(def.cad).then((glb) => {
      if (o.rotateX) glb.rotation.x = o.rotateX;
      if (o.rotateY) glb.rotation.y = o.rotateY;
      if (o.rotateZ) glb.rotation.z = o.rotateZ;
      if (o.scale) Array.isArray(o.scale) ? glb.scale.multiply(new THREE.Vector3(...o.scale)) : glb.scale.multiplyScalar(o.scale);
      glb.updateMatrixWorld(true);
      if (o.onBottom !== false) {
        const bb = new THREE.Box3().setFromObject(glb);
        const c = bb.getCenter(new THREE.Vector3());
        glb.position.x -= c.x; glb.position.z -= c.z; glb.position.y -= bb.min.y;
      }
      if (o.offset) glb.position.add(new THREE.Vector3(...o.offset));
      if (o.hide?.length) hideCadNodes(glb, o.hide);
      const keepRes = (o.keep || []).map(globRe);
      const kept = (m) => {
        for (let p = m; p && p !== root; p = p.parent) {
          if (p.userData.keepWithCad) return true;
          if (keepRes.length && p.name && keepRes.some((r) => r.test(p.name.toLowerCase()))) return true;
        }
        return false;
      };
      if (!o.keepFallback) root.traverse((m) => { if ((m.isMesh || m.isInstancedMesh || m.isLine || m.isPoints) && !kept(m)) m.layers.set(31); });
      glb.traverse((m) => { if (m.isMesh) { m.castShadow = !tinyMesh(m, root); m.receiveShadow = true; } });
      glb.name = 'cad';
      root.add(glb);
      root.userData.cadLoaded = true;
      root.userData.cad = glb;
      if (o.onLoad) { try { glb.updateMatrixWorld(true); o.onLoad(glb, root, this.game); } catch (e) { console.warn('[items] cadOptions.onLoad lỗi', def.id, e); } }
      if (o.merge) { try { mergeCadStatic(glb, root, this._mergeKeep(def, o)); } catch (e) { console.warn('[items] gộp mesh CAD lỗi', def.id, e); } }
      const it = root.userData.item;
      if (it) {
        it.localBox = localBox(root);
        this.game.subparts?.attach(it);
        this.game.events?.emit('item:cad-loaded', { item: it });
      }
    }).catch((e) => { root.userData.cadError = String(e); console.warn('[items] không tải được CAD', def.cad, e?.message || e); });
  }

  /** Mẫu tên node GLB KHÔNG được gộp (sub-part / chân / node ẩn) — null khi manifest chưa nạp (an toàn: bỏ qua gộp) */
  _mergeKeep(def, o) {
    const sp = this.game.subparts;
    if (!sp?.manifest?.size) return null;
    const names = [...(o.hide || []), ...((o.merge && o.merge.keep) || [])];
    for (const s of [...(sp.manifest.get(def.cad)?.interact || []), ...(Array.isArray(def.interact) ? def.interact : [])]) {
      if (s?.node) names.push(...String(s.node).split('/').filter(Boolean).map((x) => x.replace(/[\s]/g, '_').replace(/[.:[\]]/g, '')));
    }
    return names.map(globRe);
  }

  /** Nạp core/cad.js (chỉ trình duyệt) — gọi một lần lúc khởi động */
  async loadCadSupport() {
    if (typeof window === 'undefined') return false;
    try { this._cad = await import('../../core/cad.js'); return true; } catch (e) { console.warn('[items] chưa có core/cad.js', e); return false; }
  }

  spawn(id, pose = {}, opts = {}) {
    const def = this.get(id);
    if (!def) { console.warn(`[items] không có item "${typeof id === 'string' ? id : id?.id}"`); return null; }
    const object = this._buildObject(def);
    let uid = opts.uid;
    if (!uid || this._byUid.has(uid)) { do uid = `${def.id}#${++this._seq}`; while (this._byUid.has(uid)); }
    else { const n = +String(uid).split('#')[1]; if (n > this._seq) this._seq = n; }
    const inst = {
      uid, def, object, state: {}, heldBy: null, socket: null, inBag: false, sockets: [], subparts: [],
      phys: { falling: false, v: new THREE.Vector3(), w: new THREE.Vector3(), rest: 0 },
    };
    object.name = object.name || def.id;
    object.userData.item = inst;
    object.userData.itemId = def.id;
    object.traverse((o) => { if (o.isMesh) { o.castShadow = !tinyMesh(o, object); o.receiveShadow = true; } });
    const parent = pose?.parent ?? (pose?.addToScene === false || opts.stowed ? null : this.root);
    applyPose(object, pose);
    if (parent) parent.add(object);
    this.all.push(inst);
    this._byUid.set(uid, inst);
    // kích thước (mm) để cầm/đặt/rơi
    const box = localBox(object);
    inst.localBox = box;
    inst.size = def.size ? new THREE.Vector3(...def.size) : box.getSize(new THREE.Vector3());
    try { def.init?.(inst, this.game); } catch (e) { console.warn(`[items] ${def.id}.init lỗi`, e); }
    if (typeof def.sockets === 'function') {
      try {
        const specs = def.sockets(inst, this.game) || [];
        specs.forEach((s, idx) => {
          const sid = s.id == null ? `${uid}:s${idx}` : String(s.id).startsWith(`${uid}:`) ? s.id : `${uid}:${s.id}`;
          const sock = this.game.sockets?.add({ owner: inst, ...s, id: sid });
          if (sock) inst.sockets.push(sock);
        });
      } catch (e) { console.warn(`[items] ${def.id}.sockets lỗi`, e); }
    }
    this.game.interact?.registerItem?.(inst);
    this.game.subparts?.attach(inst);
    if (pose?.drop && parent === this.root) this.settle(inst);
    this.game.events?.emit('item:spawned', { item: inst });
    return inst;
  }

  remove(inst) {
    if (!inst) return;
    const i = this.all.indexOf(inst);
    if (i >= 0) this.all.splice(i, 1);
    this._byUid.delete(inst.uid);
    if (inst.socket) this.game.sockets?.release(inst, { silent: true });
    for (const s of inst.sockets || []) this.game.sockets?.remove(s.id);
    if (inst.heldBy) this.game.hands?.detach(inst.heldBy);
    inst.object?.parent?.remove(inst.object);
    this.game.interact?.unregister?.(inst.object);
    try { inst.def.dispose?.(inst, this.game); } catch { /* */ }
    this.game.events?.emit('item:removed', { item: inst });
  }

  /** Item có cầm lên được không */
  pickable(inst) {
    if (!inst || inst.def.static || inst.state.fixed || inst.def.pickable === false) return false;
    return true;
  }

  // ------------------------------------------------------------------ vật lý nhẹ
  /** Thả vật (đã ở trong scene, toạ độ thế giới) với vận tốc ban đầu (mm/s) và quay (rad/s) */
  drop(inst, vel = null, spin = null) {
    const o = inst.object;
    if (o.parent !== this.root) { o.updateWorldMatrix(true, false); this.root.attach(o); }
    const p = inst.phys;
    p.falling = true; p.rest = 0; p.t = 0;
    p.v.copy(vel || _v.set(0, 0, 0));
    p.w.copy(spin || _v2.set(0, 0, 0));
    p.prevY = o.position.y;
  }

  /** Độ cao mặt đỡ (mm) ngay dưới điểm (x, z), xét từ fromY trở xuống */
  supportHeight(x, z, fromY, ignore = null) {
    let best = 0;    // sàn
    let bestObj = null, bestNormal = null;
    const cols = this.game.world?.colliders || [];
    for (const b of cols) {
      if (x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z && b.max.y <= fromY + 1 && b.max.y > best) { best = b.max.y; bestObj = null; }
    }
    const targets = this._supportTargets(ignore);
    if (targets.length) {
      this._ray.set(_v.set(x, fromY, z), DOWN);
      this._ray.far = fromY + 10;
      const hits = this._ray.intersectObjects(targets, true);
      for (const h of hits) {
        if (!h.face || h.point.y > fromY + 1) continue;
        if (h.point.y >= best - 0.5) { best = h.point.y; bestObj = h.object; bestNormal = h.face.normal; }
        break;
      }
    }
    return { y: best, object: bestObj, normal: bestNormal };
  }

  _supportTargets(ignore) {
    const list = [];
    for (const s of this.game.world?.surfaces || []) if (s && s.isObject3D) list.push(s);
    for (const it of this.all) {
      if (it === ignore || it.heldBy || it.inBag || !it.object.parent || it.phys.falling) continue;
      if (ignore && isAncestor(ignore.object, it.object)) continue;
      list.push(it.object);
    }
    return list;
  }

  /** Đặt ngay xuống mặt đỡ phía dưới (giữ x, z, yaw) */
  settle(inst) {
    const o = inst.object;
    const s = this.supportHeight(o.position.x, o.position.z, o.position.y + Math.max(50, inst.size.y), inst);
    o.position.y = s.y;
    inst.phys.falling = false;
    return s;
  }

  fixedUpdate(dt) {
    const game = this.game;
    for (const inst of this.all) {
      // logic riêng của item (mỏ hàn nóng lên, LED…)
      if (inst.def.update) {
        try { inst.def.update(inst, dt, game); } catch (e) {
          if (!inst._updErr) { inst._updErr = true; console.error(`[items] ${inst.def.id}.update lỗi`, e); }
        }
      }
      if (inst.phys.falling) this._fall(inst, dt);
    }
  }

  _fall(inst, dt) {
    const p = inst.phys, o = inst.object;
    p.t = (p.t || 0) + dt;
    const speed = p.v.length();
    const n = Math.max(1, Math.ceil((speed * dt) / 25));
    const h = dt / n;
    for (let i = 0; i < n && p.falling; i++) {
      const prevY = o.position.y;
      p.v.y -= GRAVITY * h;
      o.position.addScaledVector(p.v, h);
      if (p.w.lengthSq() > 1e-6) {
        _q.setFromEuler(_e.set(p.w.x * h, p.w.y * h, p.w.z * h));
        o.quaternion.premultiply(_q);
      }
      this._collideWalls(inst);
      const sup = this.supportHeight(o.position.x, o.position.z, prevY + 2, inst);
      if (o.position.y <= sup.y) {
        o.position.y = sup.y;
        const impact = -p.v.y;
        if (impact > 650 && p.bounces !== 3) {
          p.bounces = (p.bounces || 0) + 1;
          p.v.y = impact * 0.28;
          p.v.x *= 0.55; p.v.z *= 0.55;
          p.w.multiplyScalar(0.45);
          this.game.audio?.play('drop', { pos: o, vol: Math.min(1, impact / 3000), rate: Math.min(1.4, 0.6 + (inst.def.massG || 50) / 200) });
          if (impact > 3500) {
            inst.state.impacts = (inst.state.impacts || 0) + 1;
            this.game.events?.emit('item:impact', { item: inst, speed: impact });
          }
        } else {
          // nằm yên: dựng thẳng (giữ góc yaw)
          p.falling = false; p.bounces = 0;
          p.v.set(0, 0, 0); p.w.set(0, 0, 0);
          _e.setFromQuaternion(o.quaternion, 'YXZ');
          p.settleFrom = o.quaternion.clone();
          p.settleTo = new THREE.Quaternion().setFromEuler(_e.set(0, _e.y, 0, 'YXZ'));
          p.settleT = 0;
          if (impact > 150) this.game.audio?.play('place', { pos: o, vol: Math.min(0.8, impact / 1500) });
          this.game.events?.emit('item:landed', { item: inst, speed: impact, support: sup.object });
        }
      }
      if (o.position.y < -500) { o.position.y = 0; p.falling = false; }     // phòng hờ rơi xuyên sàn
    }
  }

  _collideWalls(inst) {
    const o = inst.object, p = inst.phys;
    const r = Math.max(8, Math.min(120, Math.max(inst.size.x, inst.size.z) * 0.5));
    for (const b of this.game.world?.colliders || []) {
      if (o.position.y + 1 >= b.max.y || o.position.y + inst.size.y < b.min.y) continue;
      if (o.position.x < b.min.x - r || o.position.x > b.max.x + r || o.position.z < b.min.z - r || o.position.z > b.max.z + r) continue;
      // đẩy ra theo cạnh lún ít nhất
      const ex = [o.position.x - (b.min.x - r), b.max.x + r - o.position.x, o.position.z - (b.min.z - r), b.max.z + r - o.position.z];
      const m = Math.min(...ex), i = ex.indexOf(m);
      if (i === 0) { o.position.x -= m; p.v.x = -Math.abs(p.v.x) * 0.3; }
      else if (i === 1) { o.position.x += m; p.v.x = Math.abs(p.v.x) * 0.3; }
      else if (i === 2) { o.position.z -= m; p.v.z = -Math.abs(p.v.z) * 0.3; }
      else { o.position.z += m; p.v.z = Math.abs(p.v.z) * 0.3; }
    }
  }

  /** Mỗi khung vẽ: nội suy dựng thẳng sau khi rơi */
  frameUpdate(dt) {
    for (const inst of this.all) {
      const p = inst.phys;
      if (p.settleTo && !p.falling) {
        p.settleT += dt / 0.18;
        const k = Math.min(1, p.settleT);
        inst.object.quaternion.slerpQuaternions(p.settleFrom, p.settleTo, k * k * (3 - 2 * k));
        if (k >= 1) p.settleTo = null;
      }
    }
  }

  // ------------------------------------------------------------------ lưu
  serializeInstance(inst) {
    const o = inst.object;
    o.updateWorldMatrix(true, false);
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), sc = new THREE.Vector3();
    o.matrixWorld.decompose(pos, quat, sc);
    return {
      uid: inst.uid, id: inst.def.id,
      pos: pos.toArray().map((v) => +v.toFixed(2)), quat: quat.toArray().map((v) => +v.toFixed(5)),
      state: safeClone(inst.state), socket: inst.socket || null, heldBy: inst.heldBy || null, inBag: !!inst.inBag,
      tool: !!inst.isHotbarTool,
    };
  }
}

function isAncestor(a, b) { for (let o = b; o; o = o.parent) if (o === a) return true; return false; }

/** glob ('pin_*') → RegExp không phân biệt hoa thường (khớp cả tên) */
function globRe(g) { return new RegExp('^' + String(g).toLowerCase().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'); }

/**
 * [hiệu năng 2026-10] Mesh nhỏ (bán kính bao < 3 mm: chân IC, vít, LED SMD…) không đổ bóng — bóng nhỏ hơn 1 texel bản đồ bóng
 * (đèn bàn ~2 mm/texel, đèn trời ~12 mm/texel) nhưng mỗi mesh tốn 1 draw call cho MỖI đèn đổ bóng.
 */
export function tinyMesh(o, root) {
  const g = o.geometry;
  if (!g || o.isInstancedMesh) return false;
  if (!g.boundingSphere) g.computeBoundingSphere();
  let s = 1;
  for (let p = o; p && p !== root; p = p.parent) s *= Math.max(Math.abs(p.scale.x), Math.abs(p.scale.y), Math.abs(p.scale.z));
  return g.boundingSphere.radius * s < 3;
}

/** Chữ ký vật liệu: core/cad.js enhance() tạo MỘT vật liệu riêng cho MỖI mesh (cùng thông số) → gộp theo thông số, không theo uuid */
function matSig(m) {
  if (m.type !== 'MeshStandardMaterial' && m.type !== 'MeshPhysicalMaterial') return m.uuid;
  const tex = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap'].map((k) => m[k]?.uuid || '').join('');
  return [m.type, m.color.getHexString(), m.metalness, m.roughness, m.emissive.getHexString(), m.emissiveIntensity, m.transparent, m.opacity,
    m.side, m.depthWrite, m.vertexColors, m.flatShading, m.clippingPlanes?.length || 0, m.polygonOffset, m.alphaTest, m.envMapIntensity, tex].join('/');
}

/**
 * Gộp mesh tĩnh của GLB theo (vật liệu, bóng, bộ thuộc tính) thành 1 mesh/nhóm — toạ độ hệ glb. Bỏ qua mesh được bảo vệ
 * (keepRes khớp tên nó/tổ tiên, userData đánh dấu, bị root.userData tham chiếu), mesh ẩn, mảng vật liệu, ma trận lật.
 * keepRes = null → không làm gì. Trả { before, after } (số mesh gộp được → số mesh mới).
 */
export function mergeCadStatic(glb, root, keepRes) {
  if (!keepRes) return null;
  const refs = new Set();
  const addRef = (v) => { if (v?.isObject3D) refs.add(v); };
  for (const v of Object.values(root.userData || {})) {
    addRef(v);
    if (v && typeof v === 'object' && !v.isObject3D) for (const w of (Array.isArray(v) ? v : Object.values(v))) addRef(w);
  }
  const guarded = (n) => {
    for (let p = n; p && p !== glb; p = p.parent) {
      const u = p.userData;
      if (!p.visible || u.cadNode || u.cadHidden || u.interact || u.keepWithCad || refs.has(p)) return true;
      if (p.name && keepRes.some((r) => r.test(p.name.toLowerCase()))) return true;
    }
    return false;
  };
  glb.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(glb.matrixWorld).invert();
  const groups = new Map();
  glb.traverse((m) => {
    if (!m.isMesh || m.isInstancedMesh || m.isSkinnedMesh || Array.isArray(m.material) || !m.layers.isEnabled(0)) return;
    const g = m.geometry;
    if (!g?.attributes?.position || Object.keys(g.morphAttributes || {}).length || m.matrixWorld.determinant() * glb.matrixWorld.determinant() < 0) return;
    if (m.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender || guarded(m)) return;
    const sig = Object.keys(g.attributes).sort().map((k) => `${k}${g.attributes[k].itemSize}`).join(',');
    const key = `${matSig(m.material)}|${m.castShadow}|${m.receiveShadow}|${m.renderOrder}|${!!g.index}|${sig}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  });
  let before = 0, after = 0;
  const mm = new THREE.Matrix4();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const geos = list.map((m) => m.geometry.clone().applyMatrix4(mm.multiplyMatrices(inv, m.matrixWorld)));
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const src = list[0];
    const out = new THREE.Mesh(merged, src.material);
    out.name = `merged:${src.material.name || src.name}`;
    out.castShadow = src.castShadow; out.receiveShadow = src.receiveShadow; out.renderOrder = src.renderOrder;
    out.userData.mergedFrom = list.length;
    glb.add(out);
    for (const m of list) m.parent?.remove(m);
    before += list.length; after++;
  }
  return { before, after };
}

/** Ẩn các node GLB khớp mẫu (cả cây con): không vẽ, không raycast (layer 31). Trả số node đã ẩn. */
export function hideCadNodes(glb, patterns) {
  const res = [].concat(patterns).map(globRe);
  let n = 0;
  glb.traverse((o) => {
    if (o === glb || !o.name || !res.some((r) => r.test(o.name.toLowerCase()))) return;
    o.visible = false;
    o.userData.cadHidden = true;
    o.traverse((m) => m.layers.set(31));
    n++;
  });
  return n;
}

/** Sao chép trạng thái có thể JSON hoá (bỏ Object3D, hàm, vòng lặp) */
export function safeClone(v, depth = 0, seen = new WeakSet()) {
  if (v === null || typeof v !== 'object') return typeof v === 'function' ? undefined : (typeof v === 'number' && !Number.isFinite(v) ? null : v);
  if (depth > 6 || seen.has(v)) return undefined;
  if (v.isObject3D || v.isMaterial || v.isTexture || v.isBufferGeometry) return undefined;
  if (v.isVector3 || v.isVector2 || v.isQuaternion || v.isColor) return v.toArray();
  seen.add(v);
  if (Array.isArray(v)) return v.slice(0, 2000).map((x) => safeClone(x, depth + 1, seen));
  if (v instanceof Map || v instanceof Set) return undefined;
  const out = {};
  for (const [k, x] of Object.entries(v)) {
    if (k.startsWith('_')) continue;
    const c = safeClone(x, depth + 1, seen);
    if (c !== undefined) out[k] = c;
  }
  return out;
}
