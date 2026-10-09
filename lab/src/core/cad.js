// =============================================================================
// cad.js — nạp mô hình CAD thật (GLB xuất từ STEP bằng cadgen / text-to-cad) vào lab & game.
// Nguồn mô hình: cad/ (xem cad/README.md). File GLB nằm ở lab/public/models/<đường dẫn>.glb,
// đơn vị trong GLB là MÉT (chuẩn glTF) → nhân 1000 để ra mm của lab.
//
//   const obj = ctx.cad('vendor/bearing_608zz', { fallback: () => myProceduralBearing(), rotateX: 0 })
//   → trả về NGAY một Group (chứa mô hình dự phòng), khi GLB tải xong thì thay bằng mô hình CAD thật.
// =============================================================================
import * as THREE from 'three';

let GLTFLoaderCls = null;
const cache = new Map();          // path → Promise<THREE.Object3D (gốc, không dùng trực tiếp)>
let manifest = null;

const BASE = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';

export function cadUrl(path) { return `${BASE}models/${path}.glb`; }

async function loader() {
  if (!GLTFLoaderCls) GLTFLoaderCls = (await import('three/examples/jsm/loaders/GLTFLoader.js')).GLTFLoader;
  return new GLTFLoaderCls();
}

/** Danh mục mô hình (lab/public/models/manifest.json) — null nếu chưa có */
export async function cadManifest() {
  if (manifest) return manifest;
  // manifest.json có thể liệt kê "fragments": mỗi nhóm (vendor, boards, robot…) tự ghi manifest.<nhóm>.json riêng
  const get = async (f) => { try { return await (await fetch(`${BASE}models/${f}`)).json(); } catch { return null; } };
  const root = (await get('manifest.json')) || { models: [] };
  const models = [...(root.models || [])];
  for (const frag of root.fragments || []) {
    const m = await get(`manifest.${frag}.json`);
    // _fragment: nhóm nguồn (vendor/boards/robot) — subparts.js cần để đổi hệ toạ độ 'interact' (boards ghi theo CAD Z-up)
    if (m?.models) models.push(...m.models.map((e) => ({ _fragment: frag, ...e })));
  }
  manifest = { ...root, models };
  return manifest;
}

/** Làm vật liệu STEP (màu phẳng) trông thật hơn: xám sáng → kim loại, vàng → mạ vàng, đen → nhựa/epoxy */
function enhance(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const src = o.material;
    if (!src || !src.color) return;
    const c = src.color.clone();
    const hsl = {}; c.getHSL(hsl);
    const m = new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide });
    // [2026-10] tên vật liệu nói rõ là nhựa/dây/sơn (abs_white, wire_white, silk…) → không phải kim loại dù màu xám sáng;
    // vàng/đồng thau cần l > 0.5 (nhựa hổ phách/cam như vỏ XT60, l ≈ 0.42, trước đây bị coi là vàng)
    const nonMetalName = /abs|wire|silk|plastic|nylon|pbt|rubber|paint|label|mask|insul|sleeve|wrap/i.test(src.name || '');
    if (nonMetalName) { m.metalness = 0.0; m.roughness = 0.5; }
    else if (hsl.s < 0.12 && hsl.l > 0.55) { m.metalness = 0.95; m.roughness = 0.28; }   // thép/thiếc/nhôm
    else if (hsl.h > 0.08 && hsl.h < 0.17 && hsl.s > 0.4 && hsl.l > 0.5) { m.metalness = 1; m.roughness = 0.22; } // vàng/đồng thau
    else if (hsl.l < 0.18) { m.metalness = 0.0; m.roughness = 0.6; }                     // epoxy đen, nhựa tối
    else { m.metalness = 0.05; m.roughness = 0.5; }                                      // nhựa màu, PCB
    // giữ độ trong suốt glTF (alphaMode BLEND, vd. màng co pin) — trước đây bị mất
    if (src.transparent || (src.opacity ?? 1) < 1) { m.transparent = true; m.opacity = src.opacity ?? 1; m.depthWrite = (src.opacity ?? 1) > 0.9; }
    o.material = m;
    src.dispose?.();
  });
  return root;
}

/** Tải (có cache) — trả về bản sao mới, đã đổi sang mm */
export async function loadCad(path) {
  if (!cache.has(path)) {
    cache.set(path, (async () => {
      const gltf = await (await loader()).loadAsync(cadUrl(path));
      const g = new THREE.Group();
      g.add(gltf.scene);
      g.scale.setScalar(1000);                  // m → mm
      enhance(g);
      return g;
    })());
  }
  const proto = await cache.get(path);
  const clone = proto.clone(true);
  return clone;
}

/**
 * Đối tượng hiển thị đồng bộ: Group chứa `fallback()` (mô hình tự dựng) cho tới khi GLB tải xong.
 * opts: { fallback, rotateX, rotateY, rotateZ, offset:[x,y,z], scale, onBottom:true (đặt đáy vật lên y=0),
 *         onLoad(obj), part:{name, desc} }
 * Khi không có trình duyệt (smoke test Node) → chỉ trả fallback.
 */
export function cadModel(path, opts = {}) {
  const holder = new THREE.Group();
  holder.userData.cadPath = path;
  if (opts.part) holder.userData.part = opts.part;
  const fb = opts.fallback ? opts.fallback() : null;
  if (fb) holder.add(fb);
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return holder;
  loadCad(path).then((obj) => {
    if (opts.rotateX) obj.rotation.x = opts.rotateX;
    if (opts.rotateY) obj.rotation.y = opts.rotateY;
    if (opts.rotateZ) obj.rotation.z = opts.rotateZ;
    if (opts.scale) obj.scale.multiplyScalar(opts.scale);
    obj.updateMatrixWorld(true);
    if (opts.onBottom !== false) {
      const bb = new THREE.Box3().setFromObject(obj);
      const c = bb.getCenter(new THREE.Vector3());
      obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= bb.min.y;
    }
    if (opts.offset) obj.position.add(new THREE.Vector3(...opts.offset));
    if (fb) { holder.remove(fb); fb.traverse((o) => o.geometry?.dispose()); }
    holder.add(obj);
    holder.userData.cadLoaded = true;
    opts.onLoad?.(obj);
  }).catch((e) => { holder.userData.cadError = String(e); console.warn('[cad] không tải được', path, e); });
  return holder;
}
