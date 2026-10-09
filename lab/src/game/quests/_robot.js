// =============================================================================
// quests/_robot.js — [nhiệm vụ] Xác robot hút bụi thương mại (Xiaomi gen1 / Roborock S5) cho nhiệm vụ M5 (mổ xác) & M6 (lắp mạch).
//
// Chưa có item def nào dùng CAD 'robot/robot-vacuum-assembly' trong items/parts → tạo def LÚC CHẠY ở đây:
//   id 'robot-vacuum-teardown' · def.cad = 'robot/robot-vacuum-assembly' (trình duyệt: GLB thật + metadata 'interact' của
//   public/models/manifest.robot.json qua engine/subparts.js) · build() = mô hình THỦ TỤC cùng TÊN NODE với GLB (cover_top,
//   cover_top/lid_top, bin, chassis/lid_battery, chassis/screw_1…, battery/conn_main, wheel_l/wheel, wheel_l/conn_wheel,
//   brush_main, brush_side_1, lidar/conn_lidar…) → chạy được cả khi không tải GLB (Node / lỗi mạng).
//   Thêm các node chỉ có trong game (giữ hiện cạnh GLB — cadOptions.keep): 4 miếng dán chân đế 'sticker_*' che 4 vít ẨN
//   'screw_hidden_*', nút nguồn 'btn_power', tay nhấc chổi cuộn 'brush_main_grip', 7 ô lắp mạch 'slot_*' (nhiệm vụ M6).
// Hệ toạ độ item = GLB: Y lên, mặt TRƯỚC = −Z (bánh xoay z = −142), bánh trái x = −117.5. Gốc: đáy (điểm bánh chạm sàn).
//
//   flipRobot(game, inst) · isUpsideDown(inst) · sp(game, inst, name) · photoTarget(game) / takePhoto(game, inst, node)
//   presetOpened(game, inst) — xác "đã mổ" (cho M6 ở Chế độ tự do) · ROBOT_SLOTS — ô lắp mạch (theo xuong-lap-rap)
// Mạch điện: chân 'WL-M+'/'WL-M−', 'WR-M+'/'WR-M−' ở 2 đầu nối bánh = cuộn dây động cơ (≈ 7 Ω) → đo Ω bằng đồng hồ thật.
// =============================================================================
import * as THREE from 'three';
import { addPartProvider } from './_circuit-ext.js';
import { pk } from '../minigames/netlist.js';

export const ROBOT_ID = 'robot-vacuum-teardown';
export const ROBOT_H = 100;
const DECK = 80;

/** Ô lắp mạch (hệ item) — chuyển từ SLOTS của src/components/lap-rap/_xuong_helpers.js: item.x = xưởng.z, item.z = −xưởng.x */
export const ROBOT_SLOTS = [
  { id: 'pic', name: 'Bo PIC16F877A', accepts: ['pic16f877a', 'perfboard-9x15'], xz: [25, -35] },
  { id: 'esp32', name: 'ESP32-S3', accepts: ['esp32-s3-devkitc-1', 'xiao-esp32s3-sense'], xz: [-45, 35] },
  { id: 'drv-trai', name: 'DRV8871 trái', accepts: ['drv8871-module'], xz: [-30, -82] },
  { id: 'drv-phai', name: 'DRV8871 phải', accepts: ['drv8871-module'], xz: [-30, 82] },
  { id: 'hc32', name: '74HC32 (trên bo PIC)', accepts: ['sn74hc32n'], xz: [55, -10] },
  { id: 'buck', name: 'Buck XL4015 5 V', accepts: ['xl4015-module', 'lm2596-module'], xz: [-48, -38] },
  { id: 'bss138', name: 'Chuyển mức BSS138', accepts: ['bss138-4ch-module'], xz: [25, 30] },
].map((s) => ({ ...s, pos: [s.xz[1], DECK, -s.xz[0]] }));

/** Đầu nối chụp ảnh được — khoá = tên bộ phận con (spec.id), giống nhau dù dùng mô hình thủ tục hay GLB */
export const CONNECTORS = {
  conn_main: 'đầu cắm PIN (XT60/JST)',
  conn_wheel_l: 'đầu nối bánh TRÁI (JST 6 chân)',
  conn_wheel_r: 'đầu nối bánh PHẢI (JST 6 chân)',
  conn_lidar: 'đầu nối lidar',
  conn_cliff: 'đầu nối cảm biến chống rơi #1',
};
const leaf = (n) => String(n).split('/').pop();

// ---------------------------------------------------------------------------- mô hình thủ tục
let MATS = null;
function mats() {
  if (MATS) return MATS;
  const std = (color, rough = 0.6, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  MATS = {
    shell: std(0xe9ecef, 0.45), dark: std(0x2a2e33, 0.7), black: std(0x15171a, 0.8), rubber: std(0x1d1f22, 0.95),
    screw: std(0xb8bec6, 0.35, 0.85), pcb: std(0x1f6b3a, 0.6), white: std(0xf4f4f4, 0.5), jst: std(0xf2efe6, 0.6),
    red: std(0xd23b3b, 0.5), blue: std(0x2d6fd6, 0.5), sticker: std(0x2b2b2b, 0.9), bin: std(0x6f7782, 0.4),
    brush: std(0x3b7a3b, 0.9), slot: new THREE.MeshStandardMaterial({ color: 0x3ddc84, transparent: true, opacity: 0.18, depthWrite: false }),
    tape: std(0xf2c200, 0.6),
  };
  return MATS;
}
function mesh(geo, mat, name, pos = [0, 0, 0], rot = null) {
  const m = new THREE.Mesh(geo, mat);
  if (name) m.name = name;
  m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function group(name, pos = [0, 0, 0], parent = null) {
  const g = new THREE.Group();
  g.name = name; g.position.set(...pos);
  if (parent) parent.add(g);
  return g;
}

function buildRobot() {
  const K = mats();
  const root = new THREE.Group();
  root.name = ROBOT_ID;
  // khung đáy
  const ch = group('chassis', [0, 0, 0], root);
  ch.add(mesh(new THREE.CylinderGeometry(175, 172, 50, 64), K.dark, 'chassis_shell', [0, 35, 0]));
  ch.add(mesh(new THREE.BoxGeometry(124, 3, 84), K.black, 'lid_battery', [0, 8.5, 34]));
  ch.add(mesh(new THREE.CylinderGeometry(3, 3, 4, 12), K.screw, 'screw_1', [-54, 7, 0]));
  ch.add(mesh(new THREE.CylinderGeometry(3, 3, 4, 12), K.screw, 'screw_2', [54, 7, 0]));
  ch.add(mesh(new THREE.BoxGeometry(200, 3, 62), K.black, 'lid_brush', [0, 8.5, -60]));
  // pin trong khoang (trên nắp pin)
  const bat = group('battery', [0, 12, 34], root);
  bat.add(mesh(new THREE.BoxGeometry(104, 26, 74), K.blue, 'battery_pack', [0, 13, 0]));
  bat.add(mesh(new THREE.BoxGeometry(14, 10, 8), K.jst, 'conn_main', [60, 10, 0]));
  // nắp trên + hộp bụi + lidar + nút nguồn
  const cv = group('cover_top', [0, 0, 0], root);
  cv.add(mesh(new THREE.CylinderGeometry(172, 174, 38, 64), K.shell, 'cover_shell', [0, 79, 0]));
  cv.add(mesh(new THREE.BoxGeometry(210, 3, 100), K.white, 'lid_top', [0, 99.5, -40]));
  const btn = mesh(new THREE.CylinderGeometry(9, 9, 3, 24), K.dark, 'btn_power', [0, 99.5, -125]);
  cv.add(btn);
  const lid = group('lidar', [0, 98, 85], root);
  lid.add(mesh(new THREE.CylinderGeometry(42, 44, 22, 40), K.dark, 'lidar_head', [0, 11, 0]));
  lid.add(mesh(new THREE.BoxGeometry(12, 6, 8), K.jst, 'conn_lidar', [0, -26, -40]));
  root.add(mesh(new THREE.BoxGeometry(180, 34, 90), K.bin, 'bin', [0, 80, -40]));
  // bánh xe + đầu nối bánh
  for (const [side, sx] of [['l', -1], ['r', 1]]) {
    const w = group(`wheel_${side}`, [sx * 117.5, 0, 0], root);
    const wheel = mesh(new THREE.CylinderGeometry(35, 35, 20, 40), K.rubber, 'wheel', [0, 35, 0], [0, 0, Math.PI / 2]);
    wheel.userData.caliper = 70;            // thước kẹp đo Ø bánh
    w.add(wheel);
    w.add(mesh(new THREE.BoxGeometry(14, 8, 10), K.jst, 'conn_wheel', [-sx * 58, 46, 22]));
  }
  // chổi cuộn, tay nhấc, chổi cạnh (vít giữa), bánh xoay, bumper, cảm biến chống rơi
  root.add(mesh(new THREE.CylinderGeometry(18, 18, 170, 24), K.brush, 'brush_main', [0, 21, -60], [0, 0, Math.PI / 2]));
  root.add(mesh(new THREE.BoxGeometry(14, 6, 18), K.red, 'brush_main_grip', [92, 9, -60]));
  const sb = group('brush_side_1', [105, 0, -105], root);
  sb.add(mesh(new THREE.CylinderGeometry(60, 60, 2, 3), K.brush, 'side_arms', [0, 3, 0]));
  sb.add(mesh(new THREE.CylinderGeometry(3, 3, 4, 12), K.screw, 'screw_1', [0, 1, 0]));
  root.add(mesh(new THREE.SphereGeometry(12, 16, 12), K.black, 'caster', [0, 12, -142]));
  root.add(mesh(new THREE.CylinderGeometry(178, 178, 40, 48, 1, true, Math.PI * 0.45, Math.PI * 1.1), K.dark, 'bumper', [0, 42, 0]));
  for (let i = 0; i < 4; i++) {
    const a = [80, 18, -18, -80][i] * Math.PI / 180;
    const c = group(`cliff_${i + 1}`, [-155 * Math.sin(a), 6, -155 * Math.cos(a)], root);
    c.add(mesh(new THREE.BoxGeometry(14, 4, 10), K.pcb, 'pcb', [0, 0, 0]));
    if (i === 0) c.add(mesh(new THREE.BoxGeometry(8, 5, 6), K.jst, 'conn_cliff', [0, 14, 10]));
  }
  // vít nắp trên (đáy, gần mép) + miếng dán chân đế che vít ẩn
  [[-130, 100], [130, 100], [-130, -100], [130, -100]].forEach(([x, z], i) => root.add(mesh(new THREE.CylinderGeometry(3.2, 3.2, 4, 12), K.screw, `screw_top_${i + 1}`, [x, 8, z])));
  [[-70, 125], [70, 125], [-150, -20], [150, -20]].forEach(([x, z], i) => {
    root.add(mesh(new THREE.CylinderGeometry(3, 3, 4, 12), K.screw, `screw_hidden_${i + 1}`, [x, 9, z]));
    root.add(mesh(new THREE.CylinderGeometry(11, 11, 1.5, 20), K.sticker, `sticker_${i + 1}`, [x, 6.2, z]));
  });
  // ô lắp mạch (M6) — mờ, chỉ hiện khi nắp trên đã nhấc
  const slots = group('slots', [0, 0, 0], root);
  for (const s of ROBOT_SLOTS) {
    const o = mesh(new THREE.BoxGeometry(36, 1, 30), K.slot, `slot_${s.id}`, s.pos);
    o.castShadow = false;
    o.raycast = () => {};
    slots.add(o);
  }
  slots.visible = false;
  root.userData.slotGroup = slots;
  return root;
}

// ---------------------------------------------------------------------------- tương tác bộ phận con (khi không có manifest)
const INTERACT = [
  { node: 'cover_top/lid_top', type: 'hinge', axis: [1, 0, 0], side: [0, 0, 1], angle_deg: 100, label: 'nắp hộp bụi' },
  { node: 'bin', type: 'slide', axis: [0, 1, 0], travel_mm: 90, lockedBy: ['lid_top'], label: 'hộp bụi' },
  { node: 'chassis/lid_battery', type: 'hinge', axis: [1, 0, 0], side: [0, 0, 1], angle_deg: -100, lockedBy: ['screw_bat_1', 'screw_bat_2'], label: 'nắp khoang pin' },
  { node: 'chassis/screw_1', id: 'screw_bat_1', type: 'screw', axis: [0, -1, 0], bit: 'PH1', label: 'vít nắp pin 1' },
  { node: 'chassis/screw_2', id: 'screw_bat_2', type: 'screw', axis: [0, -1, 0], bit: 'PH1', label: 'vít nắp pin 2' },
  { node: 'battery/conn_main', type: 'connector', axis: [1, 0, 0], travel_mm: 12, label: 'đầu cắm pin' },
  { node: 'battery', type: 'slide', axis: [0, -1, 0], travel_mm: 40, lockedBy: ['lid_battery', 'conn_main'], label: 'pin' },
  { node: 'chassis/lid_brush', type: 'hinge', axis: [1, 0, 0], side: [0, 0, 1], angle_deg: -100, label: 'nắp chổi cuộn' },
  { node: 'brush_main_grip', type: 'slide', axis: [0, -1, 0], travel_mm: 30, lockedBy: ['lid_brush'], label: 'chổi cuộn (nhấc ra)' },
  { node: 'brush_side_1/screw_1', id: 'screw_side', type: 'screw', axis: [0, -1, 0], bit: 'PH1', label: 'vít chổi cạnh' },
  // GLB thật: GLTFLoader đổi tên node trùng thành screw_1_3, conn_wheel_1… → khai báo thêm biến thể (cùng id; bản thủ tục ẩn bị bỏ)
  { node: 'brush_side_1/screw_1_3', id: 'screw_side', type: 'screw', axis: [0, -1, 0], bit: 'PH1', label: 'vít chổi cạnh' },
  { node: 'brush_main', type: 'spin', axis: [1, 0, 0], label: 'chổi cuộn' },
  { node: 'wheel_l/wheel', id: 'wheel_l_spin', type: 'spin', axis: [1, 0, 0], label: 'bánh trái' },
  { node: 'wheel_r/wheel', id: 'wheel_r_spin', type: 'spin', axis: [1, 0, 0], label: 'bánh phải' },
  { node: 'wheel_l/conn_wheel', id: 'conn_wheel_l', type: 'connector', axis: [0, 1, 0], travel_mm: 10, label: 'đầu nối bánh trái' },
  { node: 'wheel_r/conn_wheel', id: 'conn_wheel_r', type: 'connector', axis: [0, 1, 0], travel_mm: 10, label: 'đầu nối bánh phải' },
  { node: 'wheel_r/conn_wheel_1', id: 'conn_wheel_r', type: 'connector', axis: [0, 1, 0], travel_mm: 10, label: 'đầu nối bánh phải' },
  { node: 'lidar/conn_lidar', type: 'connector', axis: [0, 1, 0], travel_mm: 8, label: 'đầu nối lidar' },
  { node: 'cliff_1/conn_cliff', type: 'connector', axis: [0, 1, 0], travel_mm: 6, label: 'đầu nối cảm biến chống rơi' },
  ...[1, 2, 3, 4].map((i) => ({ node: `screw_top_${i}`, type: 'screw', axis: [0, -1, 0], bit: 'PH1', label: `vít nắp trên ${i}` })),
  ...[1, 2, 3, 4].map((i) => ({ node: `sticker_${i}`, type: 'slide', axis: [0, -1, 0], travel_mm: 25, label: `miếng dán chân đế ${i}` })),
  ...[1, 2, 3, 4].map((i) => ({ node: `screw_hidden_${i}`, type: 'screw', axis: [0, -1, 0], bit: 'PH1', label: `vít ẩn ${i}` })),
  { node: 'cover_top', type: 'slide', axis: [0, 1, 0], travel_mm: 120, lockedBy: ['screw_top_*', 'screw_hidden_*'], label: 'nắp trên' },
  { node: 'btn_power', type: 'button', axis: [0, -1, 0], label: 'nút nguồn' },
];

/** Tìm bộ phận con: theo id/tên subpart, theo đường dẫn node đầy đủ ('wheel_l/conn_wheel'), hoặc tên node lá */
export function subpart(game, inst, name) {
  const list = inst?.subparts || [];
  const byName = list.find((s) => s.name === name || s.spec?.node === name);
  if (byName) return byName;
  const segs = String(name).split('/');
  const want = segs.pop();
  return list.find((s) => s.node?.name === want && (!segs.length || hasAncestorNamed(s.node, segs[segs.length - 1], inst.object))) || null;
}
function hasAncestorNamed(o, nm, stop) { for (let p = o.parent; p && p !== stop; p = p.parent) if (p.name === nm) return true; return false; }
const spState = (game, inst, name) => subpart(game, inst, name)?.state || null;
export const isOpen = (game, inst, name) => !!spState(game, inst, name)?.open;
export const isRemoved = (game, inst, name) => !!spState(game, inst, name)?.removed;
export const isPlugged = (game, inst, name) => spState(game, inst, name)?.plugged !== false;
export const isUpsideDown = (inst) => !!inst?.state?.upsideDown;


/** Lật úp / lật ngửa robot trên mặt bàn (quay 180° quanh trục X, giữ đáy trên mặt bàn) */
export function flipRobot(game, inst) {
  const o = inst.object;
  const up = !inst.state.upsideDown;
  inst.state.upsideDown = up;
  o.rotation.x = up ? Math.PI : 0;
  o.position.y += up ? ROBOT_H : -ROBOT_H;
  o.updateMatrixWorld(true);
  game.audio?.play('whoosh', { vol: 0.5 });
  game.hands?.playGesture?.('push', 'right');
  game.events.emit('robot:flipped', { item: inst, upsideDown: up });
  game.hud?.toast?.(up ? 'Đã lật úp robot (đặt trên tấm lót mềm để không xước nắp)' : 'Đã lật ngửa robot', { kind: 'info', short: true });
  return up;
}

/** Khoá (lockedBy) chuẩn của các nắp / ngăn — áp cả cho bộ phận con lấy từ GLB extras (không qua manifest 'after') */
const LOCKS = {
  cover_top: ['screw_top_*', 'screw_hidden_*'], bin: ['lid_top'], battery: ['lid_battery', 'conn_main'],
  lid_battery: ['screw_bat_1', 'screw_bat_2'], brush_main_grip: ['lid_brush'],
};
/**
 * Sau mỗi lần subparts.attach (sinh ra / GLB tải xong): (1) bỏ bộ phận con trùng gắn trên mesh THỦ TỤC đã bị ẩn khi có GLB
 * (subparts.js tạo cả từ userData.interact của GLB lẫn manifest → bản thứ 2 rơi vào node thủ tục ẩn, không bao giờ thao tác được
 * mà vẫn "giữ khoá" nắp); (2) gộp khoá chuẩn LOCKS.
 */
export function normalizeSubparts(game, inst) {
  const S = game.subparts;
  syncPins(inst);
  let list = inst.subparts || [];
  const cad = inst.object?.userData?.cadLoaded ? inst.object.userData.cad : null;
  if (cad && S) {
    const under = (n) => { for (let x = n; x; x = x.parent) if (x === cad) return true; return false; };
    const shown = (n) => { let v = false; n.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o.layers.isEnabled(0)) v = true; }); return v; };
    const drop = list.filter((sp) => !under(sp.node) && !shown(sp.node));
    if (drop.length) {
      for (const sp of drop) { game.interact?.unregister?.(sp.node); const i = S.list.indexOf(sp); if (i >= 0) S.list.splice(i, 1); }
      list = list.filter((sp) => !drop.includes(sp));
      inst.subparts = list;
      S.byInst.set(inst.uid, list);
    }
  }
  for (const sp of list) {
    const want = LOCKS[sp.name];
    if (!want || (sp.type !== 'hinge' && sp.type !== 'slide')) continue;
    const cur = [].concat(sp.spec.lockedBy || []);
    const merged = [...new Set([...cur, ...want])];
    if (merged.length !== cur.length) { sp.spec.lockedBy = merged; try { S._register(sp); } catch (e) { console.warn('[robot] khoá', e); } }
  }
}

/** Đặt sẵn trạng thái "xác đã mổ" (dùng cho M6 khi bỏ qua M5): nắp trên nhấc, pin & bánh đã rút, vít đã tháo */
export function presetOpened(game, inst) {
  const sps = {};
  for (const s of INTERACT) {
    const n = s.id || leaf(s.node);
    if (s.type === 'screw') sps[n] = { removed: true, progress: 1 };
    if (s.type === 'connector') sps[n] = { plugged: false };
    if ((s.type === 'slide' || s.type === 'hinge') && !['bin', 'battery', 'brush_main_grip'].includes(n)) sps[n] = { open: true };
  }
  inst.state.subparts = { ...(inst.state.subparts || {}), ...sps };
  game.subparts?.attach(inst);
  normalizeSubparts(game, inst);
  updateSlotsVisible(inst);
}

export function updateSlotsVisible(inst) {
  const g = inst?.object?.userData?.slotGroup;
  if (!g) return;
  const cv = (inst.subparts || []).find((s) => s.name === 'cover_top');
  g.visible = !!cv?.state?.open;
}

// ---------------------------------------------------------------------------- ảnh chụp đầu nối (phím P)
/** Đầu nối robot gần tâm ngắm nhất (≤ 220 mm quanh điểm nhìn) */
export function photoTarget(game) {
  const t = game.interact?.target;
  const robot = t?.item?.def?.id === ROBOT_ID ? t.item : game.items.all.find((i) => i.def?.id === ROBOT_ID && i.object?.parent);
  if (!robot) return null;
  if (t?.subpart?.type === 'connector' && t.subpart.inst === robot) return { robot, sp: t.subpart };
  const p = t?.hit?.point;
  if (!p) return null;
  let best = null, bd = 220;
  for (const s of robot.subparts || []) {
    if (s.type !== 'connector') continue;
    const d = s.worldPosition().distanceTo(p);
    if (d < bd) { bd = d; best = s; }
  }
  return best ? { robot, sp: best } : null;
}
/** Ghi ảnh chụp 1 đầu nối (trạng thái lưu trong robot.state.photos) */
export function takePhoto(game, robot, sp) {
  const photos = (robot.state.photos ||= {});
  const key = sp.name;
  const first = !photos[key];
  photos[key] = { plugged: sp.state.plugged !== false, t: game.time?.now ?? 0 };
  game.audio?.play('click', { vol: 0.8 });
  game.hud?.flash?.('success');
  game.events.emit('photo:taken', { item: robot, node: key, label: CONNECTORS[key] || sp.label, plugged: sp.state.plugged !== false, first });
  game.hud?.toast?.(`📷 Đã chụp ${CONNECTORS[key] || sp.label}${sp.state.plugged !== false ? ' (còn cắm — thấy rõ màu dây)' : ' (đã rút — ảnh kém giá trị)'}`, { kind: 'success', short: true });
  return key;
}

// ---------------------------------------------------------------------------- def
let REGISTERED = false;
export function registerRobotDef(game) {
  if (game.items.get(ROBOT_ID)?.robotRuntime) { installHooks(game); return game.items.get(ROBOT_ID); }
  const pins = [];
  for (const [side, sx] of [['L', -1], ['R', 1]]) {
    const base = [sx * 117.5 - sx * 58, 46, 22];
    pins.push({ id: `W${side}-M+`, name: `Bánh ${side === 'L' ? 'trái' : 'phải'} M+`, pos: [base[0] - 3, base[1] + 4, base[2]], dir: [0, 1, 0] });
    pins.push({ id: `W${side}-M−`, name: `Bánh ${side === 'L' ? 'trái' : 'phải'} M−`, pos: [base[0] + 3, base[1] + 4, base[2]], dir: [0, 1, 0] });
  }
  const def = {
    id: ROBOT_ID, name: 'Xác robot hút bụi (Xiaomi gen1)', kind: 'part', category: 'robot', lessonId: 'vo-khung', massG: 2600,
    size: [350, ROBOT_H, 350], robotRuntime: true, icon: '🤖',
    desc: 'Robot hút bụi cũ mua trên Chợ Tốt để mổ lấy khung, bánh, chổi, cảm biến. Ø bánh 70 mm, khoảng cách tâm 2 bánh 235 mm (đo bằng thước), pin 4S 14.4 V, 2 công tắc bumper, 4 cảm biến chống rơi.',
    cad: 'robot/robot-vacuum-assembly',
    cadOptions: { keep: ['sticker_*', 'screw_hidden_*', 'brush_main_grip', 'slots', 'slot_*'], onLoad(glb) { glb.traverse((o) => { if (/^wheel(_\d+)?$/.test(o.name) && /^wheel_[lr]$/.test(o.parent?.name || '')) o.userData.caliper = 70; }); } },
    grip: { pose: 'grip', offset: [0, ROBOT_H / 2, 120], rot: [0, 0, 0] },
    build: buildRobot,
    interact: INTERACT,
    pins,
    /** chân đo M+/M− bám theo đầu nối bánh THẬT của GLB khi đã tải (vị trí tính trong hệ item) */
    getPins(inst) { return inst?._pinOverride || pins; },
    prompts: [
      { key: 'T', label: (ctx) => (ctx?.item?.state?.upsideDown ? 'Lật ngửa robot' : 'Lật úp robot'), when: (inst) => !inst.heldBy, do: (ctx) => { const it = ctx.item; if (it?.def?.id === ROBOT_ID) flipRobot(game, it); } },
    ],
    sockets(inst) {
      return ROBOT_SLOTS.map((s) => {
        const a = new THREE.Object3D();
        a.name = `slot-anchor-${s.id}`;
        a.position.set(...s.pos);
        inst.object.add(a);
        return {
          id: `slot-${s.id}`, kind: `robot-slot:${s.id}`, object3D: a, name: `Ô lắp: ${s.name}`, snapRadius: 45, polarized: false,
          tolerance: { pos: 30, angleDeg: 180 },
          accepts: (item) => {
            if (!s.accepts.includes(item?.def?.id)) return { ok: false, reason: `Ô này dành cho ${s.name}` };
            const cv = (inst.subparts || []).find((x) => x.name === 'cover_top');
            if (cv && !cv.state.open) return { ok: false, reason: 'Nhấc nắp trên ra trước' };
            if (isUpsideDown(inst)) return { ok: false, reason: 'Lật ngửa robot trước' };
            return { ok: true, orientation: 'ok' };
          },
          onInsert: (item) => game.events.emit('robot:slot', { item: inst, slot: s.id, part: item, inserted: true }),
          onRemove: (item) => game.events.emit('robot:slot', { item: inst, slot: s.id, part: item, inserted: false }),
        };
      });
    },
    init(inst) { inst.state.photos ||= {}; inst.state.upsideDown ||= false; Object.defineProperty(inst, '_game', { value: game, enumerable: false, configurable: true }); },
  };
  game.items.register(def);
  installHooks(game);
  REGISTERED = true;
  return def;
}

function installHooks(game) {
  if (game._robotHooks) return;
  game._robotHooks = true;
  const ev = game.events;
  const fix = (e) => { if (e.item?.def?.id === ROBOT_ID) { normalizeSubparts(game, e.item); updateSlotsVisible(e.item); } };
  ev.on('item:spawned', fix);
  ev.on('item:cad-loaded', fix);
  ev.on('subpart:changed', (e) => {
    if (e.item?.def?.id !== ROBOT_ID) return;
    const it = e.item;
    if (e.node === 'cover_top') updateSlotsVisible(it);
    // chổi cạnh: tháo vít → chổi rơi ra · chổi cuộn: nhấc tay cầm → chổi ra khỏi hốc
    if (e.node === 'screw_side' && e.state.removed) hideNode(it, 'brush_side_1', 'side_arms');
    if (e.node === 'brush_main_grip' && e.state.open) hideNode(it, 'brush_main');
    if (e.node === 'brush_main_grip' && !e.state.open) showNode(it, 'brush_main');
  });
  // cuộn dây 2 động cơ bánh = phần tử 'motor' (R ≈ 7 Ω, có sức phản điện động) giữa M+ / M− ở đầu nối bánh
  addPartProvider(game, (g, R) => {
    const out = [];
    for (const it of g.items.all) {
      if (it.def?.id !== ROBOT_ID || !it.object?.parent || it.inBag) continue;
      for (const s of ['L', 'R']) out.push({ uid: `${it.uid}/W${s}`, type: 'motor', props: { load: 2 }, label: `Động cơ bánh ${s === 'L' ? 'trái' : 'phải'}`, pins: { '+': R(pk(it.uid, `W${s}-M+`)), '-': R(pk(it.uid, `W${s}-M−`)) }, item: null });
    }
    return out;
  });
  // phím P: chụp ảnh đầu nối đang nhìn
  ev.on('input:key', (e) => {
    if (!e.down || e.repeat || e.code !== 'KeyP' || game.app?.paused) return;
    const t = photoTarget(game);
    if (t) takePhoto(game, t.robot, t.sp);
    else if (game.items.all.some((i) => i.def?.id === ROBOT_ID)) game.hud?.toast?.('Nhìn vào một ĐẦU NỐI trên robot (gần tâm ngắm) rồi nhấn P để chụp', { kind: 'info', short: true });
  });
}
/** Dời chân đo M+/M− tới đầu nối bánh của mô hình đang hiện (GLB hoặc thủ tục) */
function syncPins(inst) {
  const root = inst.object;
  if (!root) return;
  const out = [];
  for (const [s, id] of [['L', 'conn_wheel_l'], ['R', 'conn_wheel_r']]) {
    const sp = (inst.subparts || []).find((x) => x.name === id);
    if (!sp) return;
    const c = sp.box.getCenter(new THREE.Vector3());
    const p = [+c.x.toFixed(2), +(sp.box.max.y + 1).toFixed(2), +c.z.toFixed(2)];
    out.push({ id: `W${s}-M+`, name: `Bánh ${s === 'L' ? 'trái' : 'phải'} M+`, pos: [p[0] - 3, p[1], p[2]], dir: [0, 1, 0] });
    out.push({ id: `W${s}-M−`, name: `Bánh ${s === 'L' ? 'trái' : 'phải'} M−`, pos: [p[0] + 3, p[1], p[2]], dir: [0, 1, 0] });
  }
  inst._pinOverride = out;
  game_markDirty(inst);
}
function game_markDirty(inst) { try { inst._game?.netlist?.markDirty(); } catch { /* */ } }
function hideNode(inst, ...names) { inst.object.traverse((o) => { if (names.includes(o.name)) o.visible = false; }); }
function showNode(inst, ...names) { inst.object.traverse((o) => { if (names.includes(o.name) && !o.userData.cadHidden) o.visible = true; }); }
export { REGISTERED };
