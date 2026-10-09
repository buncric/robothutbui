// Nạp mô hình CAD THẬT của thiết bị phòng lab (cad/src/lab/*.py → public/models/lab/<id>.glb) cho world/**.
//
// Khác core/cad.js (đổi vật liệu theo màu cho linh kiện STEP): GLB phòng lab đã có vật liệu PBR đặt tên (LAB_MATS) →
// giữ nguyên, DÙNG CHUNG theo tên giữa mọi GLB (để gộp draw call), node giữ đúng tên (knob_zoom, tip_B2, screen…).
//
//   cadAvailable(game)                     → chỉ trình duyệt thật (Node smoke test: false → giữ hình thủ tục)
//   loadLabModel(id, { node })             → Promise<Object3D> (đơn vị mm, Y lên; node: chỉ lấy một node con cấp 1)
//   upgradeProp(game, prop, id, opts)      → thay hình thủ tục của một prop bằng GLB, giữ mọi tương tác/khe/mốc:
//       opts = { seat: { tênNodeCAD: Object3DĐộng }, keep: ['knob_*'], material: { tênNode: Material }, onLoad(cad) }
//       - mesh thủ tục trong prop → layer 31 (không vẽ, không raycast) trừ mesh có userData.keepWithCad
//       - GLB gắn vào prop.object; node trong `seat` được attach() vào vật động tương ứng (đi theo núm xoay, nút bấm…)
//       - phần còn lại gộp tĩnh theo vật liệu (mergeObject)
//   DecorSet: đồ trang trí không tương tác — gom theo "vùng" thành StaticBatch (ít draw call) + ẩn vùng chi tiết ở xa (LOD).
import * as THREE from 'three';
import { StaticBatch, mergeObject } from './_merge.js';

const BASE = (() => { try { return import.meta.env?.BASE_URL || '/'; } catch { return '/'; } })();
let LoaderCls = null;
const PROTOS = new Map();          // id → Promise<Group>
const MATS = new Map();            // tên vật liệu → Material dùng chung
export const CAD_STATUS = { requested: 0, loaded: 0, failed: [], ms: 0 };

export function cadAvailable(game) {
  if (typeof window === 'undefined' || typeof fetch === 'undefined' || typeof document === 'undefined') return false;
  if (game?.app?.renderer?.isStub) return false;
  try { if (/[?&]labcad=0\b/.test(globalThis.location?.search || '')) return false; } catch { /* */ }   // ?labcad=0: so sánh A/B hiệu năng
  return game?.labCad !== false;
}

async function loader() {
  if (!LoaderCls) LoaderCls = (await import('three/examples/jsm/loaders/GLTFLoader.js')).GLTFLoader;
  return new LoaderCls();
}

// vật liệu gần giống nhau → gộp về một (ít draw call hơn sau khi gộp tĩnh); khác biệt không thấy được ở khoảng cách chơi
const ALIAS = { abs_matte: 'abs_black', leatherette: 'abs_black', powder_black: 'abs_black', fabric_black: 'rubber', foam_black: 'rubber', mesh_black: 'rubber', carbon: 'rubber', rubber_grey: 'abs_dgrey' };
function shareMaterial(m) {
  if (!m?.name) return m;
  if (ALIAS[m.name]) {
    const a = MATS.get(ALIAS[m.name]);
    if (a) { m.dispose?.(); return a; }
    m.name = ALIAS[m.name];
  }
  const have = MATS.get(m.name);
  if (have) { if (have !== m) m.dispose?.(); return have; }
  m.side = m.transparent ? THREE.DoubleSide : THREE.FrontSide;
  if (m.transparent) { m.depthWrite = m.opacity > 0.8; }
  if (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.01) m.emissiveIntensity = 1.2;
  m.envMapIntensity = m.metalness > 0.5 ? 1.0 : 0.7;
  MATS.set(m.name, m);
  return m;
}
/** Vật liệu dùng chung theo tên (null nếu chưa nạp GLB nào có nó) */
export const labMaterial = (name) => MATS.get(name) || null;

export function loadLabModel(id, { node = null } = {}) {
  if (!PROTOS.has(id)) {
    CAD_STATUS.requested++;
    const t0 = performance.now();
    PROTOS.set(id, (async () => {
      const gltf = await (await loader()).loadAsync(`${BASE}models/lab/${id}.glb`);
      const g = new THREE.Group();
      g.name = `cad:${id}`;
      g.add(gltf.scene);
      g.scale.setScalar(1000);                           // m → mm
      g.traverse((o) => {
        if (!o.isMesh) return;
        o.material = shareMaterial(o.material);
        o.castShadow = true; o.receiveShadow = true;
      });
      g.updateMatrixWorld(true);
      CAD_STATUS.loaded++;
      CAD_STATUS.ms = Math.max(CAD_STATUS.ms, Math.round(performance.now() - t0));
      return g;
    })().catch((e) => { CAD_STATUS.failed.push(id); throw e; }));
  }
  return PROTOS.get(id).then((proto) => {
    const c = proto.clone(true);
    if (node) {
      // node con cấp 1 của gốc model (gốc model = con duy nhất của node bọc Z-up→Y-up)
      const top = c.getObjectByName(node);
      if (!top) throw new Error(`[cad] ${id}: không có node ${node}`);
      const keepSet = new Set();
      for (let o = top; o; o = o.parent) keepSet.add(o);
      top.traverse((o) => keepSet.add(o));
      const prune = (o) => { for (const ch of [...o.children]) { if (!keepSet.has(ch)) o.remove(ch); else prune(ch); } };
      prune(c);
    }
    c.updateMatrixWorld(true);
    return c;
  });
}

const globRe = (s) => new RegExp(`^${String(s).toLowerCase().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);

/** attach() giữ nguyên vị trí thế giới, tính theo tư thế NGHỈ của vật động (userData.rest) để núm/nút không lệch góc */
function seatInto(cadNode, dyn) {
  const p = dyn.position.clone(), q = dyn.quaternion.clone();
  const rest = dyn.userData.rest;
  if (rest) { dyn.position.copy(rest.p); dyn.quaternion.copy(rest.q); }
  dyn.updateWorldMatrix(true, false);
  cadNode.updateWorldMatrix(true, false);
  dyn.attach(cadNode);
  dyn.position.copy(p); dyn.quaternion.copy(q);
  dyn.updateMatrixWorld(true);
}
/** Ghi tư thế nghỉ (gọi lúc dựng prop, trước khi update() xoay/đẩy) */
export function markRest(...objs) { for (const o of objs) if (o) o.userData.rest = { p: o.position.clone(), q: o.quaternion.clone() }; }

/** Ẩn mesh thủ tục (layer 31) trong cây `root`, trừ cây con CAD và mesh userData.keepWithCad */
export function hideProcedural(root, except = []) {
  const ex = new Set(except);
  const walk = (o) => {
    if (ex.has(o) || o.userData?.isCad) return;
    if ((o.isMesh || o.isInstancedMesh || o.isLine || o.isPoints) && !o.userData.keepWithCad && !o.userData.rope) o.layers.set(31);
    for (const c of o.children) walk(c);
  };
  walk(root);
}

/**
 * Thay hình prop bằng GLB. prop = { object, … } (world/props/*.js). Trả Promise<cad|null>.
 */
export function upgradeProp(game, prop, id, opts = {}) {
  if (!cadAvailable(game) || !prop?.object) return Promise.resolve(null);
  const root = prop.object;
  return loadLabModel(id).then((cad) => {
    cad.userData.isCad = true;
    root.add(cad);
    cad.updateMatrixWorld(true);
    const keepRes = (opts.keep || []).map(globRe);
    const seated = [];
    // tra mọi node TRƯỚC khi gắn (gắn node cha sẽ kéo node con ra khỏi cây cad)
    const pairs = Object.entries(opts.seat || {}).map(([name, dyn]) => [name, cad.getObjectByName(name), dyn]);
    for (const [name, mat] of Object.entries(opts.material || {})) {
      const n = cad.getObjectByName(name);
      n?.traverse((o) => { if (o.isMesh) o.material = mat; });
    }
    for (const [name, n, dyn] of pairs) {
      if (!n || !dyn) { if (!n) console.warn(`[cad] ${id}: thiếu node ${name}`); continue; }
      n.userData.isCad = true;
      seatInto(n, dyn);
      seated.push(n);
    }
    hideProcedural(root, [cad, ...seated]);
    // node giữ riêng (không gộp): mốc, mũi hàn, núm…
    const markKeep = (o) => { if (o.name && keepRes.some((r) => r.test(o.name.toLowerCase()))) o.traverse((c) => { c.userData.keep = true; }); };
    cad.traverse(markKeep);
    for (const s of seated) s.traverse(markKeep);
    try { opts.onLoad?.(cad, seated); } catch (e) { console.warn(`[cad] ${id} onLoad`, e); }
    if (opts.merge !== false) {
      for (const s of seated) if (!s.userData.keep) mergeObject(s);
      mergeObject(cad);
    }
    // bóng đổ chỉ cho khối đủ lớn (núm, nút, mũi hàn… không đổ bóng → bớt tam giác ở pass bóng mặt trời/đèn bàn)
    const minR = opts.shadowMinRadius ?? 45;
    for (const s of [cad, ...seated]) s.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      o.updateWorldMatrix(true, false);
      const r = o.geometry.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis();
      if (r < minR || o.material?.transparent) o.castShadow = false;
    });
    root.userData.cadLoaded = id;
    game?.events?.emit?.('world:cad-loaded', { id, object: root });
    return cad;
  }).catch((e) => { console.warn(`[cad] không nạp được ${id} — giữ hình thủ tục`, e?.message || e); return null; });
}

/**
 * Đồ trang trí CAD (không tương tác): add(id, pose) → gom theo vùng.
 *   pose = { x, y, z, ry, rx, rz, s, node, zone='room', far?: mm (ẩn khi camera xa hơn — LOD), shadow=true, fallback?: () => Object3D }
 * finish() → Promise: khi mọi GLB đã nạp, gộp mỗi vùng thành 1 StaticBatch (mỗi vật liệu 1 draw call).
 */
export class DecorSet {
  constructor(game, root) {
    this.game = game; this.root = root; this.items = []; this.zones = new Map(); this.enabled = cadAvailable(game);
    this.group = new THREE.Group(); this.group.name = 'lab-decor'; root.add(this.group);
    this._t = 0;
  }
  add(id, pose = {}) {
    const it = { id, pose, holder: new THREE.Group() };
    const h = it.holder;
    h.name = `decor:${id}${pose.node ? `:${pose.node}` : ''}`;
    h.position.set(pose.x || 0, pose.y || 0, pose.z || 0);
    h.rotation.set(pose.rx || 0, pose.ry || 0, pose.rz || 0, pose.order || 'YXZ');
    if (pose.s) h.scale.setScalar(pose.s);
    this.group.add(h);
    if (pose.fallback && !this.enabled) { try { const f = pose.fallback(); if (f) h.add(f); } catch (e) { console.warn('[decor] fallback', id, e); } }
    if (this.enabled) it.p = loadLabModel(id, { node: pose.node }).then((cad) => { it.cad = cad; h.add(cad); return cad; }).catch((e) => { console.warn(`[decor] ${id}`, e?.message || e); });
    this.items.push(it);
    return h;
  }
  finish() {
    if (!this.enabled) return Promise.resolve(0);
    return Promise.all(this.items.map((i) => i.p)).then(() => {
      this.root.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
      const byZone = new Map();
      for (const it of this.items) {
        if (!it.cad) continue;
        const z = it.pose.zone || 'room';
        if (!byZone.has(z)) byZone.set(z, { batch: new StaticBatch(`decor-${z}`), far: it.pose.far || 0, box: new THREE.Box3() });
        const Z = byZone.get(z);
        Z.far = Math.max(Z.far, it.pose.far || 0);
        it.cad.traverse((o) => {
          if (!o.isMesh) return;
          const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
          const cast = it.pose.shadow !== false && !it.pose.far && o.material.opacity > 0.6;   // vùng đồ nhỏ (có LOD 'far') không đổ bóng
          Z.batch.add(o.geometry, o.material, m, { castShadow: cast, receiveShadow: true });
        });
        Z.box.expandByObject(it.holder);
        this.group.remove(it.holder);
      }
      let n = 0;
      for (const [z, Z] of byZone) {
        const g = Z.batch.build();
        g.name = `decor-${z}`;
        g.userData.far = Z.far;
        g.userData.center = Z.box.getCenter(new THREE.Vector3());
        g.userData.radius = Z.box.getSize(new THREE.Vector3()).length() / 2;
        this.group.add(g);
        this.zones.set(z, g);
        n += g.children.length;
      }
      return n;
    });
  }
  /** LOD: ẩn vùng chi tiết nhỏ khi camera ở xa (gọi trong world.update) */
  update(dt, camera) {
    this._t -= dt;
    if (this._t > 0 || !camera) return;
    this._t = 0.25;
    const cp = camera.getWorldPosition(_v);
    for (const g of this.zones.values()) {
      if (!g.userData.far) continue;
      g.visible = cp.distanceTo(g.userData.center) - g.userData.radius < g.userData.far;
    }
  }
}
const _v = new THREE.Vector3();

/**
 * Mốc CAD (CAD_ANCHORS[model][node] = { p, q } ở khung game) → { p, q } sao cho trục +Z của vật = trục +Z CAD của node
 * (pháp tuyến màn hình, hướng mũi…). Lưu ý: q gốc của _cadAnchors.js là khung CAD đã đổi trục, trong đó +Y game ↔ +Z CAD.
 */
const _toZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
export function cadFrame(a, fallbackP = [0, 0, 0], fallbackQ = [0, 0, 0, 1]) {
  const p = new THREE.Vector3(...(a?.p || fallbackP));
  const q = a?.q ? new THREE.Quaternion(...a.q).multiply(_toZ) : new THREE.Quaternion(...fallbackQ);
  return { p, q };
}
