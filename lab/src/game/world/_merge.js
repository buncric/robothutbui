// Gộp hình tĩnh theo vật liệu → ít draw call (mục tiêu 60 fps ở 'high').
// StaticBatch: thêm geometry + vật liệu + biến đổi, cuối cùng build() → mỗi (vật liệu × đổ bóng) một Mesh.
// mergeObject(root): gộp mọi Mesh con "tĩnh" trong một Object3D (bỏ qua nhánh userData.dynamic).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const KEEP = new Set(['position', 'normal', 'uv']);
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

function normalize(g) {
  for (const k of Object.keys(g.attributes)) if (!KEEP.has(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

/** Ma trận từ {x,y,z,rx,ry,rz,sx,sy,sz} hoặc Matrix4 */
export function toMatrix(t, out = new THREE.Matrix4()) {
  if (!t) return out.identity();
  if (t.isMatrix4) return out.copy(t);
  _p.set(t.x || 0, t.y || 0, t.z || 0);
  _e.set(t.rx || 0, t.ry || 0, t.rz || 0, t.order || 'XYZ');
  _q.setFromEuler(_e);
  const s = t.s ?? 1;
  _s.set(t.sx ?? s, t.sy ?? s, t.sz ?? s);
  return out.compose(_p, _q, _s);
}

export class StaticBatch {
  constructor(name = 'static') { this.name = name; this.buckets = new Map(); this.tris = 0; }

  /** Thêm một geometry (được clone) với biến đổi t */
  add(geometry, material, t = null, { castShadow = true, receiveShadow = true } = {}) {
    const g = normalize(geometry.clone());
    g.applyMatrix4(toMatrix(t, _m));
    const key = `${material.uuid}|${g.index ? 'i' : 'n'}|${castShadow ? 1 : 0}|${receiveShadow ? 1 : 0}`;
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, (b = { material, castShadow, receiveShadow, geos: [] }));
    b.geos.push(g);
    return this;
  }

  /** Thêm mọi Mesh (không instanced) của obj — biến đổi = t × matrixWorld cục bộ của obj */
  addObject(obj, t = null, opts = {}) {
    const base = toMatrix(t, new THREE.Matrix4());
    obj.updateMatrixWorld(true);
    const inv = new THREE.Matrix4();
    if (obj.parent) inv.copy(obj.parent.matrixWorld).invert();
    obj.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material)) return;
      const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld).premultiply(base);
      this.add(o.geometry, o.material, m, { castShadow: opts.castShadow ?? o.castShadow, receiveShadow: opts.receiveShadow ?? o.receiveShadow });
    });
    return this;
  }

  build() {
    const root = new THREE.Group();
    root.name = this.name;
    for (const b of this.buckets.values()) {
      const geo = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
      if (!geo) continue;
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, b.material);
      mesh.castShadow = b.castShadow;
      mesh.receiveShadow = b.receiveShadow;
      mesh.matrixAutoUpdate = false;
      mesh.userData.merged = true;
      root.add(mesh);
      if (b.geos.length > 1) for (const g of b.geos) g.dispose();
    }
    this.buckets.clear();
    return root;
  }
}

/**
 * Gộp các Mesh tĩnh bên trong root (giữ nguyên Mesh/Group có userData.dynamic, InstancedMesh, Sprite…).
 * Trả về root (đã thay đổi tại chỗ).
 */
export function mergeObject(root, { castShadow = true } = {}) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const batch = new StaticBatch(`${root.name || 'obj'}-merged`);
  const victims = [];
  const visit = (o) => {
    for (const c of [...o.children]) {
      if (c.userData.dynamic || c.userData.keep) continue;
      if (c.isMesh && !c.isInstancedMesh && !Array.isArray(c.material) && !c.userData.redraw) {
        const m = new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld);
        batch.add(c.geometry, c.material, m, { castShadow: castShadow && c.castShadow, receiveShadow: c.receiveShadow });
        victims.push(c);
      }
      visit(c);
    }
  };
  visit(root);
  for (const v of victims) {
    // giữ lại con của mesh bị gộp (nếu có) bằng cách chuyển lên cha
    for (const ch of [...v.children]) v.parent.attach(ch);
    v.parent.remove(v);
  }
  const merged = batch.build();
  for (const c of [...merged.children]) root.add(c);
  return root;
}

/** BoxGeometry có UV theo kích thước thật: 1 lần lặp texture = S mm (dùng cho tường, mặt bàn) */
export function worldBox(w, h, d, S = 1000, S2 = S) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // thứ tự mặt: +x, -x, +y, -y, +z, -z (mỗi mặt 4 đỉnh)
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, (uv.getX(i) * dims[f][0]) / S, (uv.getY(i) * dims[f][1]) / S2);
  }
  return g;
}

/** Plane có UV theo mm */
export function worldPlane(w, h, S = 1000, S2 = S) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / S, (uv.getY(i) * h) / S2);
  return g;
}

/** Đếm tam giác (kể cả instanced) và draw call của một cây vật thể */
export function sceneStats(root) {
  let meshes = 0, tris = 0, instanced = 0, instances = 0;
  root.traverse((o) => {
    if (!o.isMesh || o.material?.visible === false) return;
    meshes++;
    const g = o.geometry;
    const t = (g.index ? g.index.count : g.attributes.position.count) / 3;
    if (o.isInstancedMesh) { instanced++; instances += o.count; tris += t * o.count; } else tris += t;
  });
  return { meshes, tris: Math.round(tris), instanced, instances };
}
