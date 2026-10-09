// Trợ giúp ghép mô hình CAD thật (GLB, xem lab/src/core/cad.js + engine/items.js _attachCad) vào linh kiện game.
// KHÔNG export default. Dùng trong def.cadOptions.onLoad(glb, root, game) — chỉ chạy trên trình duyệt (Node: CAD không nạp).
//
// Quy ước khung (đã đo bằng cad/tmp/cadint/glbinfo.py):
//   vendor/*  : gốc = tâm hộp bao XY của STEP, y = 0 là MẶT TỰA (mặt PCB), chân THT thò xuống −Y.
//   boards/*  : gốc = tâm đáy vật (MẶT DƯỚI PCB), chân header chúc xuống tới y = −8.5.
//   robot/*   : gốc = tâm đáy hộp bao (CAD Z-up → GLB Y-up).
// Item game: gốc = đầu chân (y = 0) → offset y = seatY (vendor) / 8.5 (module có header) và onBottom: false.
import { THREE } from '../_shared.js';

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();

export function globRe(g) {
  return new RegExp('^' + String(g).toLowerCase().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
}

/** Các node GLB có tên khớp mẫu (glob) */
export function cadNodes(glb, pattern) {
  const re = globRe(pattern), out = [];
  glb.traverse((o) => { if (o !== glb && o.name && re.test(o.name.toLowerCase())) out.push(o); });
  return out;
}

/** Ẩn object (cả cây con): không vẽ, không raycast */
export function hideObj(o) {
  o.visible = false;
  o.userData.cadHidden = true;
  o.traverse((m) => m.layers.set(31));
}

/** Ẩn các mesh trong `node` thoả pred(mesh) — vd. phần chân kim loại gộp chung node thân */
export function hideMeshes(node, pred) {
  let n = 0;
  node.traverse((m) => { if (m.isMesh && pred(m)) { hideObj(m); n++; } });
  return n;
}

/** Vật liệu kim loại sáng (chân mạ thiếc/niken) — sau khi core/cad.js enhance() đổi màu xám sáng → metalness 0.95 */
export const isMetal = (m) => (m.material?.metalness ?? 0) > 0.9;

/** Ma trận node so với gốc item (mm) */
export function itemMatrix(node, root, out = new THREE.Matrix4()) {
  root.updateWorldMatrix(true, false);
  node.updateWorldMatrix(true, false);
  return out.copy(root.matrixWorld).invert().multiply(node.matrixWorld);
}

/** Ghi lại tư thế nghỉ (hệ item) của node — gọi một lần trong onLoad */
export function captureRest(node, root) {
  if (!node.userData.cadRest) node.userData.cadRest = itemMatrix(node, root);
  return node.userData.cadRest;
}

/** Đặt node theo ma trận M (hệ item) nhân với tư thế nghỉ: node_item = M · rest */
export function setItemTransform(node, root, M) {
  const rest = captureRest(node, root);
  root.updateWorldMatrix(true, false);
  node.parent.updateWorldMatrix(true, false);
  const parentRel = _m.copy(root.matrixWorld).invert().multiply(node.parent.matrixWorld);
  const local = _m2.copy(parentRel).invert().multiply(M).multiply(rest);
  local.decompose(node.position, node.quaternion, node.scale);
  node.updateMatrixWorld(true);
}

/**
 * Cắt bớt tam giác của mesh: chỉ giữ tam giác có trọng tâm (hệ ITEM, mm) thoả keep(x, y, z).
 * Geometry được nhân bản cho riêng mesh này (cache theo key nếu truyền).
 */
const _cropCache = new Map();
export function cropMesh(mesh, root, keep, key = null) {
  const M = itemMatrix(mesh, root);
  const ck = key ? `${key}:${mesh.geometry.uuid}` : null;
  if (ck && _cropCache.has(ck)) { mesh.geometry = _cropCache.get(ck); return mesh; }
  const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const pos = src.attributes.position;
  const keepIdx = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i).applyMatrix4(M);
    b.fromBufferAttribute(pos, i + 1).applyMatrix4(M);
    c.fromBufferAttribute(pos, i + 2).applyMatrix4(M);
    if (keep((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3)) keepIdx.push(i);
  }
  const g = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(src.attributes)) {
    const n = attr.itemSize, arr = new attr.array.constructor(keepIdx.length * 3 * n);
    keepIdx.forEach((i, k) => { for (let j = 0; j < 3 * n; j++) arr[k * 3 * n + j] = attr.array[i * n + j]; });
    g.setAttribute(name, new THREE.BufferAttribute(arr, n, attr.normalized));
  }
  g.computeBoundingBox(); g.computeBoundingSphere();
  if (ck) _cropCache.set(ck, g);
  mesh.geometry = g;
  return mesh;
}

/** Thay vật liệu các mesh trong node thoả pred */
export function setMaterial(node, pred, material) {
  node.traverse((m) => { if (m.isMesh && pred(m)) m.material = material; });
}

/** Màu (HSL) của vật liệu mesh — để chọn phần thân/thấu kính theo màu gốc STEP */
export function hslOf(m) {
  const h = {}; (m.material?.color || new THREE.Color(0)).getHSL(h); return h;
}

/**
 * Xoè chân DIP theo góc deg (giống dipDef thủ tục): mỗi node pin_k quay quanh trục X qua (y = hMid, z = z chân),
 * đầu chân đi ra ngoài (±Z). Gọi lại được (luôn tính từ tư thế nghỉ).
 */
export function splayCadPins(root, deg, hMid) {
  const glb = root.userData.cad;
  if (!glb) return;
  const a = (deg || 0) * Math.PI / 180;
  for (const n of cadNodes(glb, 'pin_*')) {
    const rest = captureRest(n, root);
    const z = rest.elements[14];
    // tâm hộp bao chân để biết hàng (+Z / −Z)
    const box = n.userData.cadRestBox || (n.userData.cadRestBox = new THREE.Box3().setFromObject(n).applyMatrix4(_m.copy(root.matrixWorld).invert()));
    const zc = (box.min.z + box.max.z) / 2 || z;
    const s = Math.sign(zc) || 1;
    const M = new THREE.Matrix4().makeTranslation(0, hMid, zc)
      .multiply(new THREE.Matrix4().makeRotationX(-s * a))
      .multiply(new THREE.Matrix4().makeTranslation(0, -hMid, -zc));
    setItemTransform(n, root, M);
  }
}

/**
 * Kéo dài mô hình theo trục Y (hệ item) tại mặt cắt yCut: mọi đỉnh có y > yCut dời lên dy — giữ nguyên chi tiết đầu/đáy
 * (vd. tụ hoá CAD Ø10 × 10 mm → thân thật cao 20 mm). Geometry nhân bản (cache theo key + uuid geometry gốc).
 */
const _stretchCache = new Map();
export function stretchY(node, root, yCut, dy, key = null) {
  node.traverse((m) => {
    if (!m.isMesh) return;
    const M = itemMatrix(m, root), Mi = M.clone().invert();
    const ck = key ? `${key}:${m.geometry.uuid}` : null;
    if (ck && _stretchCache.has(ck)) { m.geometry = _stretchCache.get(ck); return; }
    const g = m.geometry.clone();
    const p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(M);
      if (v.y > yCut) { v.y += dy; v.applyMatrix4(Mi); p.setXYZ(i, v.x, v.y, v.z); }
    }
    p.needsUpdate = true;
    g.computeBoundingBox(); g.computeBoundingSphere();
    if (ck) _stretchCache.set(ck, g);
    m.geometry = g;
  });
}

// ----------------------------------------------------------------------------- [thêm 2026-10 — nhóm robot/*]
/**
 * GLTFLoader chép node.extras → Object3D.userData, nên GLB robot/* mang sẵn userData.interact (khung GLB thô:
 * axis chưa quay theo cadOptions, origin_mm chưa thành pivot, 'after' chưa thành lockedBy). subparts.attach() đọc
 * userData.interact TRƯỚC bản ghi manifest (đã chuẩn hoá) → gỡ chúng đi để manifest được dùng.
 * override = { tênNode: spec (HỆ ITEM: axis, pivot…) } — đặt spec riêng cho node mà bản ghi manifest sai trục/khung.
 */
export function useManifestInteract(glb, override = {}) {
  glb.traverse((o) => { if (o.userData && o.userData.interact) delete o.userData.interact; });
  for (const [name, spec] of Object.entries(override)) {
    const n = glb.getObjectByName(name);
    if (n && spec) n.userData.interact = { ...spec };
  }
}

/** Bộ phận con (subparts.js) theo tên node — null khi chưa nạp CAD / không có */
export function subpartOf(inst, name) {
  return (inst?.subparts || []).find((s) => s.name === name) || null;
}

/** Quay thêm dAngle (rad, quanh sp.axis hệ item) một bộ phận con kiểu 'spin' — để update() điều khiển bánh/cánh/trục CAD */
export function spinSubpart(inst, name, dAngle) {
  const sp = subpartOf(inst, name);
  if (!sp || sp.type !== 'spin') return false;
  sp.state.angle = ((sp.state.angle || 0) + dAngle) % (Math.PI * 2);
  sp.apply();
  return true;
}

/**
 * Spec vít (subparts 'screw') cho các node khớp `pattern`, hướng RA (axis, HỆ ITEM) suy từ hình học: trục = cạnh dài nhất của hộp bao,
 * phía có bán kính lớn hơn (mũ vít) là phía vít đi ra. Dùng khi bản ghi manifest ghi axis theo hướng VẶN VÀO (robot/*: [0,−1,0] cho vít
 * mũ ở trên) trong khi subparts.js hiểu axis = hướng vít đi ra. Gọi trong onLoad (GLB đã gắn vào root); trả { tênNode: spec }.
 */
export function screwOutSpecs(glb, root, pattern = 'screw_*', extra = {}) {
  const out = {};
  const v = new THREE.Vector3();
  for (const n of cadNodes(glb, pattern)) {
    if (out[n.name]) continue;
    const pts = [];
    n.traverse((m) => {
      if (!m.isMesh || !m.geometry?.attributes?.position) return;
      const M = itemMatrix(m, root), a = m.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) pts.push(v.fromBufferAttribute(a, i).applyMatrix4(M).toArray());
    });
    if (!pts.length) continue;
    const lo = [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k]))), hi = [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k])));
    const size = hi.map((h, k) => h - lo[k]), c = hi.map((h, k) => (h + lo[k]) / 2);
    const ax = size.indexOf(Math.max(...size)), o = [0, 1, 2].filter((k) => k !== ax);
    let rLo = 0, rHi = 0;
    for (const p of pts) {
      const r = Math.hypot(p[o[0]] - c[o[0]], p[o[1]] - c[o[1]]);
      if (p[ax] < lo[ax] + 1) rLo = Math.max(rLo, r);
      if (p[ax] > hi[ax] - 1) rHi = Math.max(rHi, r);
    }
    const axis = [0, 0, 0]; axis[ax] = rHi >= rLo ? 1 : -1;
    out[n.name] = { type: 'screw', label: 'vít', axis, travel_mm: Math.min(10, Math.max(4, size[ax] - 1)), ...extra };
  }
  return out;
}
