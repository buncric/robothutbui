// Tủ ngăn kéo linh kiện (kiểu hộp nhựa trong nhiều ngăn): khung thép sơn tĩnh điện, ngăn kéo nhựa trong
// (InstancedMesh: thân ngăn, mặt ngăn, tay kéo, linh kiện bên trong), nhãn giấy in tên linh kiện (1 atlas canvas,
// 1 mesh gộp — đỉnh dịch theo ngăn khi kéo). E = mở/đóng ngăn; khi mở: LMB/R = lấy 1 linh kiện
// (sinh item từ registry: id chính xác → từ khoá → bỏ qua nếu không có) rồi đưa vào tay (interact.pick) / túi.
// build(game, { id, cols, rows, pitch, depth, contents, title }) — anchors 'drawer-<id><hàng>-<cột>' = đáy trong ngăn.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { drawTexture, canvasPlane, text, wrapText, hasDoc, FONT } from '../_tex.js';
import { mergeObject } from '../_merge.js';
import { emit, play, toast } from '../_labState.js';
import { getItemDef, findItemDef, spawnItem } from '../../items/registry.js';

const std = (color, metalness, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
const M = (g, m, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, cast = true } = {}) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = cast; o.receiveShadow = true; return o; };
const rbox = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01));

// [nhãn, dòng phụ, [id / từ khoá…], màu linh kiện]
export const CONTENTS_A = [
  ['Điện trở 330 Ω', 'cam-cam-nâu', ['resistor-330'], 0xd9c39a], ['Điện trở 1 kΩ', 'nâu-đen-đỏ', ['resistor-1k'], 0xd9c39a],
  ['Điện trở 10 kΩ', 'nâu-đen-cam', ['resistor-10k'], 0xd9c39a], ['Điện trở 33 kΩ', 'cam-cam-cam', ['resistor-33k'], 0xd9c39a],
  ['Điện trở các loại', '1/4 W ±1 %', ['resistor-axial', 'resistor'], 0x5d86c9],
  ['Tụ gốm 22 pF', 'NP0 · 50 V', ['cap-ceramic-22pf'], 0xc8742a], ['Tụ gốm 100 nF', 'mã 104', ['cap-ceramic-100nf'], 0xe0b23a],
  ['Tụ hóa 100 µF', '25 V', ['cap-elec-100uf-25v'], 0x1d2a55], ['Tụ hóa 1000 µF', '25 V', ['cap-elec-1000uf-25v'], 0x1d2a55],
  ['Thạch anh 20 MHz', 'HC-49/S', ['crystal-20mhz-hc49s', 'crystal'], 0xc9ced4],
  ['LED 5 mm đỏ', '2.0 V · 20 mA', ['led-5mm-red'], 0xff3030], ['LED 5 mm xanh lá', '2.2 V', ['led-5mm-green'], 0x30d050],
  ['LED 5 mm xanh dương', '3.0 V', ['led-5mm-blue'], 0x3070ff], ['LED 5 mm trắng', '3.1 V', ['led-5mm-white'], 0xf0f0f0],
  ['LED 3 mm đỏ', '2.0 V', ['led-3mm-red'], 0xff3030],
  ['Diode 1N5819', 'Schottky 1 A', ['1n5819'], 0x222222], ['Diode SS34', 'Schottky 3 A SMD', ['ss34'], 0x222222],
  ['MOSFET IRLZ44N', 'logic-level TO-220', ['irlz44n', 'mosfet'], 0x222222], ['Cuộn cảm xuyến', 'toroid', ['inductor-toroid', 'inductor'], 0x8a5a2a],
  ['IC 74HC32', '4 cổng OR', ['sn74hc32n'], 0x161616],
  ['PIC16F877A', 'DIP-40 · 20 MHz', ['pic16f877a'], 0x161616], ['Đế IC DIP-40', 'chân tròn', ['dip40-socket'], 0x161616],
  ['Đế IC DIP-14', '', ['dip14-socket'], 0x161616], ['Header đực 1×40', '2.54 mm', ['header-male-1x40'], 0x161616],
  ['Header cái 1×20', '2.54 mm', ['header-female-1x20'], 0x161616],
  ['JST-XH 2 chân', 'đực hàn bo', ['jst-xh-2'], 0xf2f2ea], ['JST-XH 3 chân', '', ['jst-xh-3'], 0xf2f2ea], ['JST-XH 4 chân', '', ['jst-xh-4'], 0xf2f2ea],
  ['Vỏ JST-XH 2P', 'đầu cái', ['jst-xh-2-housing'], 0xf2f2ea], ['Vỏ JST-XH 3P', '', ['jst-xh-3-housing'], 0xf2f2ea], ['Vỏ JST-XH 4P', '', ['jst-xh-4-housing'], 0xf2f2ea],
  ['Domino 2P', '5.08 mm', ['screw-terminal-2p', 'terminal'], 0x2f9a4a],
  ['XT60 đực', 'pin', ['xt60-male'], 0xe8c020], ['XT60 cái', 'robot', ['xt60-female'], 0xe8c020],
  ['Cầu chì lưỡi 10 A', 'ATO đỏ', ['blade-fuse-10a', 'fuse'], 0xd02c2c], ['Đế cầu chì', 'nối dây 14 AWG', ['fuse-holder-inline'], 0x222222],
  ['Công tắc KCD1', 'ON/OFF', ['rocker-switch-kcd1', 'switch'], 0x222222], ['Polyfuse 0.5 A', 'PTC tự phục hồi', ['polyfuse', 'ptc'], 0xe0b23a],
  ['Nút nhấn 6×6', 'tact switch', ['tact', 'button'], 0x222222], ['Ống co nhiệt', 'Ø2–Ø6', ['heat-shrink', 'shrink'], 0x222222],
];
export const CONTENTS_B = [
  ['Hạ áp LM2596', '3 A', ['lm2596-module'], 0x1d4f91], ['Hạ áp XL4015', '5 A', ['xl4015-module'], 0x1d4f91],
  ['Driver DRV8871', 'cầu H 3.6 A', ['drv8871-module'], 0x7a1d8a], ['Chuyển mức BSS138', '4 kênh', ['bss138-4ch-module'], 0x1d4f91],
  ['IMU MPU6050', 'GY-521', ['mpu6050-gy521', 'mpu6050'], 0x1d4f91], ['ESP32-S3 DevKitC', 'N8R8', ['esp32-s3-devkitc-1', 'esp32'], 0x161616],
  ['XIAO ESP32S3', 'Sense', ['xiao-esp32s3-sense'], 0x161616], ['Board UNO R3', 'ATmega328P', ['arduino-uno-r3'], 0x1d6fa8],
  ['Bo đục lỗ 9×15', 'FR-4 2 mặt', ['perfboard-9x15', 'perfboard'], 0x2f7d4a], ['Breadboard 830', '', ['breadboard-830', 'breadboard'], 0xf2f2ea],
  ['Cặp XT60', 'đực + cái', ['xt60-pair'], 0xe8c020], ['Ốc M3 × 8', 'đầu PH1', ['screw-m3', 'm3'], 0xc9d3dd],
  ['Đai ốc M3', '', ['nut-m3'], 0xc9d3dd], ['Trụ đồng M3', '10 mm', ['standoff'], 0xd4a640],
  ['Ốc M2.5', 'đầu PH0', ['screw-m2', 'm2.5'], 0xc9d3dd], ['Dây DuPont', 'đực–cái', ['dupont', 'jumper'], 0xd23b3b],
  ['Dây 22 AWG', 'lõi nhiều sợi', ['wire-22', 'wire'], 0xd23b3b], ['Dây 18 AWG', 'silicon', ['wire-18'], 0x222222],
  ['Cos JST-XH', 'đầu bấm', ['jst-xh-terminal', 'crimp'], 0xd4a640], ['Lidar LDS02RR', '', ['ldsr-lidar-lds02rr', 'lidar'], 0x222222],
  ['ODROID-M2', '', ['odroid-m2'], 0x222222], ['Dây rút', '100 mm', ['zip-tie'], 0xf2f2ea],
  ['Băng keo điện', '', ['tape'], 0x222222], ['Linh tinh', '', [], 0x888888],
];

/** Hộp hở miệng (5 mặt) — dùng cho thân ngăn kéo */
function openBox(w, h, d) {
  const parts = [];
  const add = (pw, ph, m) => { const g = new THREE.PlaneGeometry(pw, ph); g.applyMatrix4(m); parts.push(g); };
  const T = new THREE.Matrix4();
  add(w, d, T.makeRotationX(-Math.PI / 2).setPosition(0, -h / 2, 0));
  add(w, h, new THREE.Matrix4().makeTranslation(0, 0, -d / 2));
  add(d, h, new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(-w / 2, 0, 0));
  add(d, h, new THREE.Matrix4().makeRotationY(-Math.PI / 2).setPosition(w / 2, 0, 0));
  const pos = [], nor = [], uv = [], idx = [];
  for (const g of parts) {
    const b = pos.length / 3;
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); uv.push(...g.attributes.uv.array);
    idx.push(...Array.from(g.index.array, (i) => i + b));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export function build(game, opts = {}) {
  const { id = 'A', cols = 5, rows = 8, pitch = [116, 62], depth = 170, contents = id === 'B' ? CONTENTS_B : CONTENTS_A, title = `TỦ LINH KIỆN ${id}`, frameColor = 0xc6cacf, binColor = 0x9fc6e8 } = opts;
  const [px, py] = pitch;
  const dw = px - 6, dh = py - 6, dd = depth - 12;
  const W = cols * px + 20, H = rows * py + 20 + 34, D = depth + 10;
  const N = cols * rows;
  const root = new THREE.Group();
  root.name = `parts-drawer-${id}`;
  // ---- khung
  const frame = new THREE.Group();
  root.add(frame);
  const steel = std(frameColor, 0.55, 0.45);
  frame.add(M(new THREE.BoxGeometry(W, H, 3), steel, { y: H / 2, z: -D / 2 + 1.5 }));
  for (const sx of [-1, 1]) frame.add(M(rbox(10, H, D, 2), steel, { x: sx * (W / 2 - 5), y: H / 2 }));
  frame.add(M(rbox(W, 10, D, 2), steel, { y: 5 }), M(rbox(W, 10, D, 2), steel, { y: H - 5 }));
  for (let r = 1; r < rows; r++) frame.add(M(new THREE.BoxGeometry(W - 20, 2, D - 4), steel, { y: 10 + r * py, z: 0, cast: false }));
  for (let c = 1; c < cols; c++) frame.add(M(new THREE.BoxGeometry(1.5, rows * py, 8), steel, { x: -W / 2 + 10 + c * px, y: 10 + (rows * py) / 2, z: D / 2 - 4, cast: false }));
  const head = canvasPlane(W - 24, 24, (g, Wp, Hp) => {
    g.fillStyle = '#1f2a36'; g.fillRect(0, 0, Wp, Hp);
    text(g, title, Wp * 0.03, Hp / 2, { size: Hp * 0.55, color: '#ffffff', bold: true });
    text(g, '⚡ ESD — đeo vòng tay trước khi lấy IC', Wp * 0.97, Hp / 2, { size: Hp * 0.36, color: '#ffd75a', align: 'right', bold: true });
  }, { pxPerMm: 3, maxPx: 1024, fallback: '#1f2a36', rough: 0.6 });
  head.position.set(0, H - 10 - 17 + 0, D / 2 + 0.6);
  head.userData.keep = true;
  frame.add(head);
  mergeObject(frame);

  // ---- ngăn kéo (instanced)
  const binMat = new THREE.MeshPhysicalMaterial({ color: binColor, roughness: 0.18, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false });
  const frontMat = new THREE.MeshPhysicalMaterial({ color: binColor, roughness: 0.15, transparent: true, opacity: 0.48, depthWrite: false, clearcoat: 0.6 });
  const handleMat = std(0x4f7fae, 0, 0.4);
  const bins = new THREE.InstancedMesh(openBox(dw - 2, dh - 4, dd), binMat, N);
  const fronts = new THREE.InstancedMesh(rbox(dw, dh, 3, 1.4), frontMat, N);
  const handles = new THREE.InstancedMesh(rbox(dw * 0.42, 6, 12, 2.4), handleMat, N);
  const PER = 7;
  const bits = new THREE.InstancedMesh(new THREE.CylinderGeometry(2.4, 2.4, 10, 8), std(0xffffff, 0.1, 0.5), N * PER);
  for (const m of [bins, fronts]) { m.castShadow = false; m.receiveShadow = false; m.renderOrder = 2; }
  handles.castShadow = true; handles.receiveShadow = true;
  bits.castShadow = false; bits.receiveShadow = true;
  // nhãn: atlas canvas + lưới quad gộp
  const CW = 256, CH = 72;
  const labelTex = drawTexture(cols * CW, rows * CH, (g) => {
    for (let i = 0; i < N; i++) {
      const c = contents[i] || ['—', '', [], 0x888888];
      const x = (i % cols) * CW, y = Math.floor(i / cols) * CH;
      g.fillStyle = '#fbfbf6'; g.fillRect(x, y, CW, CH);
      g.fillStyle = `#${new THREE.Color(c[3]).getHexString()}`; g.fillRect(x, y, 14, CH);
      g.fillStyle = '#111'; g.textBaseline = 'middle'; g.textAlign = 'left';
      g.font = `bold 28px ${FONT}`;
      const lines = wrapText(g, c[0], CW - 30).slice(0, 2);
      lines.forEach((l, j) => g.fillText(l, x + 22, y + (c[1] && lines.length === 1 ? 24 : 22 + j * 28) + (lines.length === 1 && !c[1] ? 12 : 0), CW - 30));
      if (c[1] && lines.length === 1) { g.font = `20px ${FONT}`; g.fillStyle = '#555'; g.fillText(c[1], x + 22, y + 54, CW - 30); }
      g.font = `bold 15px ${FONT}`; g.fillStyle = '#888'; g.textAlign = 'right';
      g.fillText(`${id}${Math.floor(i / cols) + 1}-${(i % cols) + 1}`, x + CW - 6, y + CH - 10);
      g.strokeStyle = '#b8b8b0'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, CW - 2, CH - 2);
    }
  });
  const lw = dw * 0.78, lh = dh * 0.36;
  const lpos = new Float32Array(N * 12), luv = new Float32Array(N * 8), lidx = [];
  const base = [];   // vị trí gốc mỗi ngăn
  for (let i = 0; i < N; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const x = -W / 2 + 10 + (c + 0.5) * px, y = 10 + (rows - r - 0.5) * py, zf = D / 2 - 2;
    base.push({ x, y, zf });
    const u0 = c / cols, u1 = (c + 1) / cols, v1 = 1 - r / rows, v0 = 1 - (r + 1) / rows;
    luv.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8);
    lidx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  }
  const lgeo = new THREE.BufferGeometry();
  lgeo.setAttribute('position', new THREE.BufferAttribute(lpos, 3).setUsage(THREE.DynamicDrawUsage));
  lgeo.setAttribute('uv', new THREE.BufferAttribute(luv, 2));
  lgeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(N * 12).map((_, k) => (k % 3 === 2 ? 1 : 0)), 3));
  lgeo.setIndex(lidx);
  const labels = new THREE.Mesh(lgeo, new THREE.MeshStandardMaterial({ color: labelTex ? 0xffffff : 0xf4f4ee, map: labelTex, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2 }));
  labels.frustumCulled = false;
  labels.castShadow = false;
  root.add(bins, fronts, handles, bits, labels);

  // linh kiện trong ngăn: vị trí cục bộ ngẫu nhiên tất định
  const rand = (() => { let s = id.charCodeAt(0) * 9301; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); })();
  const bitLocal = [];
  const col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const c = contents[i];
    col.set(c ? c[3] : 0x888888);
    for (let k = 0; k < PER; k++) {
      bitLocal.push({ x: (rand() - 0.5) * (dw - 20), z: -dd * (0.2 + rand() * 0.65), ry: rand() * Math.PI, rz: Math.PI / 2 + (rand() - 0.5) * 0.4, y: -dh / 2 + 4 + rand() * 3 });
      bits.setColorAt(i * PER + k, c && c[2].length ? col : col.set(0x555555));
    }
  }
  const drawers = base.map((b, i) => ({ i, ...b, open: false, t: 0, stock: 30, content: contents[i] || null, code: `${id}${Math.floor(i / cols) + 1}-${(i % cols) + 1}` }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const travel = dd * 0.72;
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
  const proxyGeo = new THREE.BoxGeometry(dw, dh, 10);
  function place(d) {
    const z = d.t * travel;
    m4.makeTranslation(d.x, d.y + 1, d.zf - dd / 2 - 1.5 + z); bins.setMatrixAt(d.i, m4);
    m4.makeTranslation(d.x, d.y, d.zf + z); fronts.setMatrixAt(d.i, m4);
    m4.makeTranslation(d.x, d.y - dh / 2 + 6, d.zf + 6 + z); handles.setMatrixAt(d.i, m4);
    for (let k = 0; k < PER; k++) {
      const L = bitLocal[d.i * PER + k];
      q.setFromEuler(e.set(0, L.ry, L.rz));
      p.set(d.x + L.x, d.y + L.y, d.zf + L.z + z);
      bits.setMatrixAt(d.i * PER + k, m4.compose(p, q, one));
    }
    const zl = d.zf + 1.6 + z, yl = d.y + dh * 0.16;
    lpos.set([d.x - lw / 2, yl - lh / 2, zl, d.x + lw / 2, yl - lh / 2, zl, d.x + lw / 2, yl + lh / 2, zl, d.x - lw / 2, yl + lh / 2, zl], d.i * 12);
    if (d.proxy) d.proxy.position.set(d.x, d.y, d.zf + 2 + z);
  }
  const anchors = {};
  const interact = [];
  const resolve = (d) => {
    if (!d.content) return null;
    for (const key of d.content[2]) {
      const def = game?.items?.get?.(key) || getItemDef(key);
      if (def) return def;
    }
    for (const key of d.content[2]) { const def = findItemDef(key, { kind: 'part' }); if (def) return def; }
    return null;
  };
  const toggle = (d) => {
    d.open = !d.open;
    play(game, d.open ? 'whoosh' : 'click', { vol: 0.3, pos: d.proxy });
    emit(game, d.open ? 'drawer:opened' : 'drawer:closed', { drawer: d.code, label: d.content?.[0] });
  };
  const take = (d, ctx) => {
    const def = resolve(d);
    if (!def) { toast(game, `Ngăn ${d.code} (${d.content?.[0] || 'trống'}) chưa có mô hình 3D để lấy`); return; }
    if (d.stock <= 0) { toast(game, `Ngăn ${d.code} đã hết ${d.content[0]}`); return; }
    const w = d.slot.getWorldPosition(new THREE.Vector3());
    const pose = { pos: [w.x, w.y + 12, w.z], rotY: 0 };
    let inst = null;
    try { inst = game?.items?.spawn ? game.items.spawn(def.id, pose) : spawnItem(game, def.id, pose); } catch (err) { console.warn('[drawer] spawn lỗi', err); }
    if (!inst) return;
    d.stock--;
    play(game, 'pickup', { vol: 0.5 });
    let ok = false;
    try { ok = !!game?.interact?.pick?.(inst); } catch { ok = false; }
    if (!ok) { try { ok = !!game?.inventory?.stash?.(inst); if (ok) toast(game, `Đã cho ${def.name || def.id} vào túi (Tab)`); } catch { /* */ } }
    emit(game, 'drawer:take', { drawer: d.code, item: inst, held: ok });
  };
  for (const d of drawers) {
    const proxy = new THREE.Mesh(proxyGeo, proxyMat);
    proxy.name = `drawer-${d.code}`;
    const slot = new THREE.Object3D();
    slot.name = `drawer-slot-${d.code}`;
    slot.position.set(0, -dh / 2 + 3, -dd / 2);
    proxy.add(slot);
    root.add(proxy);
    d.proxy = proxy; d.slot = slot;
    anchors[`drawer-${d.code}`] = slot;
    place(d);
    const label = d.content?.[0] || 'Trống';
    interact.push({
      object: proxy,
      spec: {
        name: () => `Ngăn ${d.code} · ${label}${d.open && resolve(d) ? ` (còn ${d.stock})` : ''}`, highlight: true,
        prompts: [
          { key: 'E', label: () => (d.open ? 'Đóng ngăn kéo' : 'Mở ngăn kéo'), do: () => toggle(d) },
          { key: 'LMB', label: `Lấy 1 ${label}`, when: () => d.open && !!resolve(d), do: (ctx) => take(d, ctx) },
          { key: 'R', label: `Lấy 1 ${label}`, when: () => d.open && !!resolve(d), do: (ctx) => take(d, ctx) },
        ],
      },
    });
  }
  for (const m of [bins, fronts, handles, bits]) { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); }
  if (bits.instanceColor) bits.instanceColor.needsUpdate = true;
  lgeo.attributes.position.needsUpdate = true;

  const moving = new Set();
  function update(dt = 1 / 60) {
    for (const d of drawers) if ((d.open ? 1 : 0) !== d.t) moving.add(d);
    if (!moving.size) return;
    for (const d of moving) {
      const target = d.open ? 1 : 0;
      d.t += Math.sign(target - d.t) * Math.min(Math.abs(target - d.t), dt / 0.28);
      place(d);
      if (d.t === target) moving.delete(d);
    }
    for (const m of [bins, fronts, handles, bits]) m.instanceMatrix.needsUpdate = true;
    lgeo.attributes.position.needsUpdate = true;
  }
  return { object: root, interact, sockets: [], update, anchors, drawers, size: [W, H, D] };
}

export default { id: 'parts-drawer', name: 'Tủ ngăn kéo linh kiện', build };
