// Hàng rào đực 1×40, bước 2.54 mm: chân vuông 0.64 mạ vàng dài 11.5 mm (đuôi 3.0 | nhựa 2.5 | cắm 6.0), nhựa PBT đen 2.5 × 2.5.
// Bẻ được thành đoạn N chân: def.breakTo(inst, N) → { ok, remainder } (engine tạo đoạn còn lại với state.count = remainder).
// Gốc: đầu đuôi (y = 0, cắm xuyên board); mặt tựa (đáy nhựa) y = 3.0.
import { THREE, PM, gBox, instanced, finalizeDef, tf, PITCH, ud } from './_shared.js';
import { headerPinGeo } from './_lib/pcb.js';
import { cadNodes } from './_lib/cad.js';

const MAX = 40, TAIL = 3.0, PL = 2.5, LEN = 11.5;
const pinsFor = (n) => Array.from({ length: n }, (_, i) => ({ id: String(i + 1), name: String(i + 1), pos: [+((i - (n - 1) / 2) * PITCH).toFixed(3), 0, 0], dir: [0, -1, 0] }));
const matsFor = (n) => ({
  pins: pinsFor(n).map((p) => tf({ x: p.pos[0], y: LEN / 2 })),
  blocks: pinsFor(n).map((p) => tf({ x: p.pos[0], y: TAIL + PL / 2 })),
});

const def = finalizeDef({
  id: 'header-male-1x40', name: 'Hàng rào đực 1×40 (2.54 mm)', kind: 'part', category: 'connector', lessonId: 'esp32-s3', massG: 3.2,
  size: [MAX * PITCH, LEN, 2.5],
  grip: { pose: 'pinch', offset: [0, TAIL + PL, 0], rot: [0, 0, 0] },
  pins: pinsFor(MAX),
  insertInto: ['pcb-hole', 'bb-hole', 'header-female'],
  mount: { seatY: TAIL, pitch: PITCH },
  breakable: true,
  // CAD thật vendor/pinheader_1x40_p2_54mm_vertical: hàng chân dọc Z (chân 1 ở z −49.53), đuôi 3.0 dưới mặt tựa, nhựa 2.54,
  // chân trên 6.0 — trùng kích thước thủ tục. Quay +90° quanh Y → chân 1 ở −X; dời lên TAIL.
  // Bẻ đoạn: thân nhựa CAD là một khối liền (tam giác dài tới 30 mm) → không cắt hình được; dùng mặt phẳng cắt (clipping,
  // renderer.localClippingEnabled) trên vật liệu riêng của bản sao + ẩn node pin_k > n + dời GLB để chân 1..n nằm giữa.
  cad: 'vendor/pinheader_1x40_p2_54mm_vertical',
  cadOptions: { rotateY: Math.PI / 2, onBottom: false, offset: [0, TAIL, 0], onLoad: (glb, root) => applyCad(root, root.userData.count ?? MAX) },
  build() {
    const root = new THREE.Group();
    root.name = 'header-male';
    const m = matsFor(MAX);
    const pins = instanced(headerPinGeo(LEN), PM.gold, m.pins, { shadow: true, capacity: MAX });
    // khối nhựa từng chân, khe V giữa các khối (khối hẹp hơn bước 0.1 mm) → bẻ đúng rãnh
    const blocks = instanced(gBox(PITCH - 0.1, PL, 2.5, 0.15, 1), PM.pbtBlack, m.blocks, { shadow: true, capacity: MAX });
    root.add(pins, blocks);
    ud(root, 'inst', { pins, blocks });
    ud(root, 'count', MAX);
    ud(root, 'pins', () => pinsFor(root.userData.count));
    return root;
  },
  init(inst) { if (inst.state?.count && inst.state.count !== MAX) apply(inst, inst.state.count); },
  /** Bẻ còn n chân (giữ chân 1..n). Trả { ok, remainder } — phần còn lại (MAX−n hoặc count−n) là header mới */
  breakTo(inst, n) {
    const cur = inst.object.userData.count;
    n = Math.round(n);
    if (!(n >= 1 && n < cur)) return { ok: false, reason: `Chỉ bẻ được 1…${cur - 1} chân` };
    apply(inst, n);
    return { ok: true, remainder: cur - n, spawn: { id: 'header-male-1x40', state: { count: cur - n } } };
  },
  footprint(inst) { return def.getPins(inst).map((p) => [p.pos[0], p.pos[2]]); },
});
function apply(inst, n) {
  const u = inst.object.userData;
  const m = matsFor(n);
  m.pins.forEach((mm, i) => u.inst.pins.setMatrixAt(i, mm));
  m.blocks.forEach((mm, i) => u.inst.blocks.setMatrixAt(i, mm));
  u.inst.pins.count = n; u.inst.blocks.count = n;
  u.inst.pins.instanceMatrix.needsUpdate = u.inst.blocks.instanceMatrix.needsUpdate = true;
  u.inst.pins.computeBoundingSphere(); u.inst.blocks.computeBoundingSphere();
  u.count = n;
  (inst.state ||= {}).count = n;
  if (u.cad) applyCad(inst.object, n);
}
/** Áp số chân n lên mô hình CAD: ẩn chân thừa, dời GLB cho chân 1..n đối xứng quanh gốc, cắt thân nhựa ở x = n·1.27 */
function applyCad(root, n) {
  const u = root.userData, glb = u.cad;
  if (!glb) return;
  if (!u.cadBase) u.cadBase = glb.position.clone();
  const shift = ((MAX - n) / 2) * PITCH;
  glb.position.copy(u.cadBase); glb.position.x += shift;
  for (const node of cadNodes(glb, 'pin_*')) {
    const k = +node.name.slice(4);
    node.visible = !(k > n);
  }
  const body = cadNodes(glb, 'conn_header*')[0];
  if (!body) return;
  if (n >= MAX) { if (u.cadClip) body.traverse((m) => { if (m.isMesh && m.userData.mat0) { m.material = m.userData.mat0; m.onBeforeRender = () => {}; } }); u.cadClip = null; return; }
  if (!u.cadClip) {
    const local = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
    u.cadClip = { local, plane: local.clone() };
    body.traverse((m) => {
      if (!m.isMesh) return;
      m.userData.mat0 = m.userData.mat0 || m.material;
      m.material = m.userData.mat0.clone();
      m.material.clippingPlanes = [u.cadClip.plane];
      m.material.clipShadows = true;
      // mặt phẳng cắt ở hệ THẾ GIỚI → bám theo item mỗi lần vẽ (cầm tay, rơi, cắm…)
      m.onBeforeRender = () => { const c = root.userData.cadClip; if (c) c.plane.copy(c.local).applyMatrix4(root.matrixWorld); };
    });
  }
  u.cadClip.local.constant = n * PITCH / 2;          // giữ x < n·1.27 (mép phải khối nhựa chân n)
  root.updateWorldMatrix(true, false);
  u.cadClip.plane.copy(u.cadClip.local).applyMatrix4(root.matrixWorld);
}
export default def;
