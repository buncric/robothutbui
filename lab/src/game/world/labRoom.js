// =============================================================================
// labRoom.js — PHÒNG LAB ĐIỆN TỬ cho RoboVac Lab Simulator (GAME_API §1, §2, §4, §5, §10).
//
//   build(game) → { root, colliders:[Box3], surfaces:[Mesh], spawn:{pos,yaw}, lights:[Light], anchors:{tên: Object3D},
//                   items:[{ id, pos, rotY }]   // vật bày sẵn (main.js tự spawn)
//                   props:{ tên: { object, interact, sockets, update } }, update(dt), stats }
//
// Phòng 10 × 8 × 3.2 m (X ∈ [−5000, 5000], Z ∈ [−4000, 4000], đơn vị mm, Y lên, sàn y = 0, mặt bàn 750 mm):
//   Tường Bắc (−Z): bàn hàn (trạm hàn, hút khói, kẹp mạch, đèn kính lúp, bảng treo dụng cụ) · bàn đo & nạp
//                   (nguồn 2 kênh, máy hiện sóng, laptop, túi LiPo) · kệ B (hộp linh kiện) · poster sơ đồ chân PIC16F877A
//   Giữa phòng:     bàn lắp ráp (đảo) · ghế
//   Tường Tây (−X): quầy + 2 tủ ngăn kéo linh kiện (A 5×8, B 4×6) · kệ A · bảng mã màu điện trở
//   Tường Đông (+X): 2 cửa sổ có rèm lá (nắng chiếu vào) · khu thử robot (băng vàng đen) + đế sạc
//   Tường Nam (+Z): bảng trắng (sơ đồ khối robot) · cửa sang "Căn hộ thử robot" · nội quy · tủ thuốc · bình chữa cháy · đồng hồ
//   Trần: tấm trần thả 600×600, đèn LED panel (RectAreaLight theo chất lượng), máng cáp treo.
// Hiệu năng: hình tĩnh gộp theo vật liệu (StaticBatch), vật lặp dùng InstancedMesh, texture thủ tục ≤ 2048 (world/_tex.js).
// =============================================================================
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { StaticBatch, worldBox, worldPlane, mergeObject, sceneStats } from './_merge.js';
import {
  qualityLevel, hasDoc, woodSet, esdMatSet, tileSet, paintedWallSet, brushedSet, cardboardSet, pegboardSet, ceilingTileSet,
  floorMatSet, corkSet, texturedMaterial, canvasPlane, drawTexture, text, roundRect, wrapText, FONT, MONO,
} from './_tex.js';
import { labState, registerInteractions, registerSockets, emit, play, toast } from './_labState.js';
import { drawWhiteboard, drawPoster } from '../../components/mo-phong/_lab_room_helpers.js';
import * as SolderingStation from './props/soldering-station.js';
import * as BenchPsu from './props/bench-psu.js';
import * as Oscilloscope from './props/oscilloscope.js';
import * as FumeExtractor from './props/fume-extractor.js';
import * as Vise from './props/vise.js';
import * as PartsDrawer from './props/parts-drawer.js';
import * as TipRack from './props/tip-rack.js';
import * as StereoMicroscope from './props/stereo-microscope.js';
import * as UsbMicroscope from './props/usb-microscope.js';
import { getItemDef } from '../items/registry.js';
import { DecorSet, upgradeProp, cadAvailable, markRest, CAD_STATUS, cadFrame } from './_cad.js';
import { CAD_ANCHORS } from './_cadAnchors.js';
import { buildSetDressing } from './_dressing.js';

export const ROOM = { X0: -5000, X1: 5000, Z0: -4000, Z1: 4000, H: 3200, WT: 150 };
export const BENCH_H = 750;
const { X0, X1, Z0, Z1, H: RH, WT } = ROOM;

export const BENCHES = [
  { name: 'bench-solder', label: 'Bàn hàn', x: -2900, z: -3600, w: 1800, d: 800, stripX: -400 },
  { name: 'bench-test', label: 'Bàn đo & nạp', x: -600, z: -3600, w: 1800, d: 800 },
  { name: 'bench-assembly', label: 'Bàn lắp ráp', x: -2000, z: -1150, w: 2200, d: 900, island: true },
];
const DOOR = { x: 3400, w: 1000, h: 2120 };
const WINDOWS = [{ z: -2600, w: 1800 }, { z: -200, w: 1800 }];
const WIN_Y0 = 900, WIN_Y1 = 2400;
const TEST = { x0: 800, x1: 4200, z0: -600, z1: 2600 };
const RACK_A = { x: X0 + 225, z: 600, w: 2000, d: 450, h: 2000, levels: [480, 900, 1320, 1740] };   // tường Tây, mặt +X
const RACK_B = { x: 2300, z: Z0 + 225, w: 2000, d: 450, h: 2000, levels: [480, 900, 1320, 1740] };  // tường Bắc, mặt +Z
const COUNTER = { x: X0 + 300, z: -2200, w: 2400, d: 600, h: 900 };

const std = (color, metalness = 0, roughness = 0.5, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
const rbox = (w, h, d, r, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const box3 = (x0, y0, z0, x1, y1, z1) => new THREE.Box3(V(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)), V(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)));
const mk = (g, m, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, cast = true, recv = true } = {}) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = cast; o.receiveShadow = recv; return o; };

// ---------------------------------------------------------------------------- vật liệu
function materials(game) {
  const q = qualityLevel(game);
  const hi = q >= 2;
  const M = {
    wall: texturedMaterial(paintedWallSet(game, { base: '#ebe8e1' }), { color: 0xebe8e1, roughness: 0.92 }, { normalScale: 0.35 }),
    wallAccent: texturedMaterial(paintedWallSet(game, { base: '#cfd9e0', seed: 23 }), { color: 0xcfd9e0, roughness: 0.92 }, { normalScale: 0.35 }),
    floor: texturedMaterial(tileSet(game), { color: 0xcdd1d4, roughness: 0.42 }, { normalScale: 0.6 }),
    ceiling: texturedMaterial(ceilingTileSet(game), { color: 0xf1f1ee, roughness: 0.96 }, { normalScale: 0.5 }),
    wood: texturedMaterial(woodSet(game), { color: 0xc9a06a, roughness: 0.55 }, { normalScale: 0.5 }),
    door: texturedMaterial(woodSet(game, { light: '#9b6b43', dark: '#6b4428', strips: 3, seed: 9, key: 'door' }), { color: 0x8a5a36, roughness: 0.5 }, { normalScale: 0.4 }),
    esd: texturedMaterial(esdMatSet(game), { color: 0x3d8c69, roughness: 0.86 }, { normalScale: 0.4 }),
    brushed: texturedMaterial(brushedSet(game), { color: 0xb9bec4, metalness: 1, roughness: 0.32 }),
    card: texturedMaterial(cardboardSet(game), { color: 0xb98c57, roughness: 0.9 }, { normalScale: 0.5 }),
    peg: texturedMaterial(pegboardSet(game), { color: 0x8f969e, metalness: 0.4, roughness: 0.5 }, { normalScale: 0.8 }),
    frame: std(0x59616b, 0.55, 0.42),        // khung thép sơn tĩnh điện
    frameLight: std(0xc4c8cd, 0.5, 0.42),
    alu: std(0xd3d7dc, 0.85, 0.32),
    chrome: std(0xe0e4e8, 1, 0.14),
    steelDark: std(0x2d3238, 0.7, 0.45),
    black: std(0x17191c, 0, 0.5),
    rubber: std(0x1f2124, 0, 0.9),
    baseboard: std(0x4c5157, 0, 0.55),
    white: std(0xf2f3f4, 0, 0.45),
    red: std(0xc8302a, 0.1, 0.4),
    yellow: std(0xf2b705, 0, 0.5),
    green: std(0x2f8a4a, 0, 0.5),
    blue: std(0x2b5fae, 0, 0.45),
    fabric: std(0x24272c, 0, 0.92),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xdfeef6, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.16, depthWrite: false, ...(hi ? { clearcoat: 1 } : {}) }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0xeaf6ff, roughness: 0.02, transparent: true, opacity: 0.22, depthWrite: false }),
    panel: new THREE.MeshStandardMaterial({ color: 0xf6f8ff, emissive: 0xf2f5ff, emissiveIntensity: 1.25, roughness: 0.6 }),
    ledStrip: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e8, emissiveIntensity: 1.6 }),
    exit: new THREE.MeshStandardMaterial({ color: 0x1fa04a, emissive: 0x22c55a, emissiveIntensity: 1.3 }),
  };
  return M;
}

// ---------------------------------------------------------------------------- hình học nhỏ
class Helix extends THREE.Curve {
  constructor(a, b, r, turns) { super(); this.a = a; this.b = b; this.r = r; this.turns = turns; this.dir = b.clone().sub(a); this.len = this.dir.length(); this.dir.normalize(); this.n = new THREE.Vector3().crossVectors(this.dir, Math.abs(this.dir.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0)).normalize(); this.bn = new THREE.Vector3().crossVectors(this.dir, this.n); }
  getPoint(t, out = new THREE.Vector3()) { const a = t * this.turns * Math.PI * 2; return out.copy(this.a).addScaledVector(this.dir, t * this.len).addScaledVector(this.n, Math.cos(a) * this.r).addScaledVector(this.bn, Math.sin(a) * this.r); }
}
const coil = (a, b, r = 6, turns = 30, wire = 1.2) => new THREE.TubeGeometry(new Helix(a, b, r, turns), Math.round(turns * 12), wire, 5, false);
const tube = (pts, r, seg = 32, radial = 8) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => (p.isVector3 ? p : V(...p)))), seg, r, radial, false);

/** Chia tường dài len thành các khối quanh lỗ [{u0,u1,y0,y1}] (u theo trục tường, từ −len/2) */
function wallPieces(len, h, openings) {
  const ops = [...openings].sort((a, b) => a.u0 - b.u0);
  const out = [];
  let u = -len / 2;
  for (const o of ops) {
    if (o.u0 > u) out.push({ u0: u, u1: o.u0, y0: 0, y1: h });
    if (o.y0 > 0) out.push({ u0: o.u0, u1: o.u1, y0: 0, y1: o.y0 });
    if (o.y1 < h) out.push({ u0: o.u0, u1: o.u1, y0: o.y1, y1: h });
    u = o.u1;
  }
  if (u < len / 2) out.push({ u0: u, u1: len / 2, y0: 0, y1: h });
  return out;
}

// ---------------------------------------------------------------------------- vẽ poster / biển
const PIC_PINS = [
  ['MCLR/VPP', 'icsp'], ['RA0/AN0', 'adc'], ['RA1/AN1', 'adc'], ['RA2/AN2', 'adc'], ['RA3/AN3', 'adc'], ['RA4/T0CKI', 'io'], ['RA5/AN4', 'adc'],
  ['RE0/AN5', 'adc'], ['RE1/AN6', 'adc'], ['RE2/AN7', 'adc'], ['VDD', 'pwr'], ['VSS', 'gnd'], ['OSC1', 'osc'], ['OSC2', 'osc'],
  ['RC0/T1OSO', 'io'], ['RC1/CCP2', 'pwm'], ['RC2/CCP1', 'pwm'], ['RC3/SCK', 'io'], ['RD0', 'io'], ['RD1', 'io'],
  ['RD2', 'io'], ['RD3', 'io'], ['RC4/SDA', 'io'], ['RC5/SDO', 'io'], ['RC6/TX', 'uart'], ['RC7/RX', 'uart'], ['RD4', 'io'], ['RD5', 'io'],
  ['RD6', 'io'], ['RD7', 'io'], ['VSS', 'gnd'], ['VDD', 'pwr'], ['RB0/INT', 'io'], ['RB1', 'io'], ['RB2', 'io'], ['RB3/PGM', 'icsp'],
  ['RB4', 'io'], ['RB5', 'io'], ['RB6/PGC', 'icsp'], ['RB7/PGD', 'icsp'],
];
const PIN_COL = { pwr: '#e5484d', gnd: '#555b66', osc: '#d9a400', icsp: '#8a4fd8', adc: '#2a9d5c', pwm: '#e0761a', uart: '#2f7fe0', io: '#7d8590' };
function drawPinout(g, W, H) {
  g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#1b3a8a'; g.fillRect(0, 0, W, H * 0.1);
  text(g, 'PIC16F877A — SƠ ĐỒ CHÂN (DIP-40)', W / 2, H * 0.05, { size: H * 0.032, color: '#fff', align: 'center', bold: true });
  const bx = W * 0.36, bw = W * 0.28, by = H * 0.14, bh = H * 0.68;
  g.fillStyle = '#1a1a1a'; roundRect(g, bx, by, bw, bh, W * 0.01); g.fill();
  g.fillStyle = '#3a3a3a'; g.beginPath(); g.arc(bx + bw / 2, by, bw * 0.12, 0, Math.PI); g.fill();
  text(g, 'PIC16F877A', bx + bw / 2, by + bh / 2, { size: W * 0.03, color: '#ddd', align: 'center', bold: true });
  g.fillStyle = '#ddd'; g.beginPath(); g.arc(bx + bw * 0.16, by + bh * 0.04, W * 0.008, 0, Math.PI * 2); g.fill();
  const step = bh / 20;
  for (let i = 0; i < 40; i++) {
    const left = i < 20, k = left ? i : 39 - i;
    const y = by + step * (k + 0.5);
    const [name, f] = PIC_PINS[i];
    g.fillStyle = '#c9ced4';
    g.fillRect(left ? bx - W * 0.03 : bx + bw, y - step * 0.2, W * 0.03, step * 0.4);
    text(g, String(i + 1), left ? bx + W * 0.02 : bx + bw - W * 0.02, y, { size: step * 0.42, color: '#bbb', align: 'center', bold: true });
    g.fillStyle = PIN_COL[f];
    const tx = left ? bx - W * 0.035 : bx + bw + W * 0.035;
    roundRect(g, left ? tx - W * 0.27 : tx, y - step * 0.36, W * 0.27, step * 0.72, step * 0.18); g.fill();
    text(g, name, left ? tx - W * 0.135 : tx + W * 0.135, y, { size: step * 0.42, color: '#fff', align: 'center', bold: true });
  }
  const leg = [['pwr', 'Nguồn 5 V'], ['gnd', 'GND'], ['osc', 'Thạch anh 20 MHz'], ['icsp', 'Nạp ICSP'], ['adc', 'Analog (ADC)'], ['pwm', 'PWM'], ['uart', 'UART'], ['io', 'Vào/ra số']];
  leg.forEach(([k, t], i) => {
    const x = W * (0.05 + (i % 4) * 0.24), y = H * (0.86 + Math.floor(i / 4) * 0.05);
    g.fillStyle = PIN_COL[k]; g.fillRect(x, y - H * 0.012, W * 0.04, H * 0.024);
    text(g, t, x + W * 0.05, y, { size: H * 0.019, color: '#222' });
  });
}
const BANDS = [['Đen', '#111', 0, '×1'], ['Nâu', '#7a4a1e', 1, '×10'], ['Đỏ', '#d02c2c', 2, '×100'], ['Cam', '#f08a1c', 3, '×1k'], ['Vàng', '#f2d13a', 4, '×10k'], ['Lục', '#2fa84f', 5, '×100k'], ['Lam', '#2f5fd0', 6, '×1M'], ['Tím', '#8a4fd0', 7, ''], ['Xám', '#8a8a8a', 8, ''], ['Trắng', '#f2f2f2', 9, '']];
function drawResistorPoster(g, W, H) {
  g.fillStyle = '#fffdf6'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#7a4a1e'; g.fillRect(0, 0, W, H * 0.11);
  text(g, 'MÃ MÀU ĐIỆN TRỞ (4 vạch)', W / 2, H * 0.055, { size: H * 0.04, color: '#fff', align: 'center', bold: true });
  // điện trở mẫu 10 kΩ
  const rx = W * 0.15, ry = H * 0.17, rw = W * 0.7, rh = H * 0.07;
  g.fillStyle = '#c9ced4'; g.fillRect(W * 0.05, ry + rh / 2 - 3, W * 0.9, 6);
  g.fillStyle = '#d9c39a'; roundRect(g, rx, ry, rw, rh, rh / 2); g.fill();
  ['#7a4a1e', '#111', '#f08a1c', '#d4a640'].forEach((c, i) => { g.fillStyle = c; g.fillRect(rx + rw * (0.18 + i * (i === 3 ? 0.2 : 0.14)), ry, rw * 0.06, rh); });
  text(g, 'nâu – đen – cam – vàng kim = 10 × 10³ Ω = 10 kΩ ±5 %', W / 2, H * 0.28, { size: H * 0.024, color: '#222', align: 'center', bold: true });
  const top = H * 0.33, rowH = (H * 0.62) / 10;
  BANDS.forEach(([n, c, d, m], i) => {
    const y = top + i * rowH;
    g.fillStyle = c; g.fillRect(W * 0.06, y + rowH * 0.12, W * 0.16, rowH * 0.76);
    g.strokeStyle = '#999'; g.strokeRect(W * 0.06, y + rowH * 0.12, W * 0.16, rowH * 0.76);
    text(g, n, W * 0.27, y + rowH / 2, { size: rowH * 0.42, color: '#222', bold: true });
    text(g, String(d), W * 0.58, y + rowH / 2, { size: rowH * 0.5, color: '#222', align: 'center', bold: true });
    text(g, m, W * 0.82, y + rowH / 2, { size: rowH * 0.42, color: '#222', align: 'center' });
  });
  text(g, 'Vạch 4: vàng kim ±5 % · bạc ±10 %', W / 2, H * 0.975, { size: H * 0.022, color: '#555', align: 'center' });
}
function drawSign(title, sub, bg, fg = '#fff') {
  return (g, W, H) => {
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    text(g, title, W / 2, H * (sub ? 0.38 : 0.5), { size: H * (sub ? 0.36 : 0.5), color: fg, align: 'center', bold: true, maxW: W * 0.94 });
    if (sub) text(g, sub, W / 2, H * 0.78, { size: H * 0.2, color: fg, align: 'center', maxW: W * 0.94 });
  };
}
function drawSky(g, W, H) {
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#7fb8e8'); gr.addColorStop(0.62, '#cfe6f7'); gr.addColorStop(1, '#eef5f9');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  let s = 7; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(255,255,255,.55)'; const x = r() * W, y = r() * H * 0.35; for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(x + k * W * 0.025, y + (r() - 0.5) * H * 0.02, W * 0.04, H * 0.025, 0, 0, Math.PI * 2); g.fill(); } }
  for (let x = 0; x < W; x += W / 11) { const bh = H * (0.22 + r() * 0.3); g.fillStyle = `rgb(${150 + r() * 30},${160 + r() * 25},${170 + r() * 20})`; g.fillRect(x, H - bh, W / 12, bh); g.fillStyle = 'rgba(255,255,255,.35)'; for (let wy = H - bh + 10; wy < H - 10; wy += 18) for (let wx = x + 6; wx < x + W / 12 - 8; wx += 14) g.fillRect(wx, wy, 6, 8); }
  g.fillStyle = '#5f8f5a';
  for (let x = 0; x < W; x += W / 16) { g.beginPath(); g.arc(x, H * 0.98, W / 22, 0, Math.PI * 2); g.fill(); }
}
function drawHazard(g, W, H) {
  g.fillStyle = '#f2c200'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#1a1a1a';
  for (let x = -H; x < W + H; x += H * 1.4) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + H * 0.7, H); g.lineTo(x + H * 1.4, 0); g.lineTo(x + H * 0.7, 0); g.fill(); }
}
function drawLaptop(g, W, H) {
  g.fillStyle = '#1e1f24'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#2b2d33'; g.fillRect(0, 0, W, H * 0.07);
  text(g, 'CCS C / MPLAB IPE — robovac_pic.c', W * 0.02, H * 0.035, { size: H * 0.035, color: '#cfd6de', bold: true });
  g.fillStyle = '#3a8f3a'; roundRect(g, W * 0.78, H * 0.012, W * 0.2, H * 0.048, 6); g.fill();
  text(g, '▶ Program', W * 0.88, H * 0.036, { size: H * 0.03, color: '#fff', align: 'center', bold: true });
  const code = [
    ['#include <16F877A.h>', '#c586c0'], ['#fuses HS, NOWDT, NOLVP, PUT, BROWNOUT', '#c586c0'], ['#use delay(clock = 20MHz)', '#c586c0'],
    ['#use rs232(baud=19200, xmit=PIN_C6, rcv=PIN_C7)', '#c586c0'], ['', '#ccc'], ['void main(void) {', '#dcdcaa'],
    ['   setup_ccp1(CCP_PWM);  // bánh trái', '#9cdcfe'], ['   setup_timer_2(T2_DIV_BY_1, 249, 1); // 20 kHz', '#9cdcfe'],
    ['   while (TRUE) {', '#c586c0'], ['      output_toggle(PIN_D7);  // LED nhịp tim', '#9cdcfe'],
    ['      if (input(PIN_B4) == 0) stop_motors(); // bumper', '#9cdcfe'], ['      delay_ms(500);', '#9cdcfe'], ['   }', '#c586c0'], ['}', '#dcdcaa'],
  ];
  code.forEach(([l, c], i) => { text(g, String(i + 1).padStart(2, ' '), W * 0.03, H * (0.12 + i * 0.055), { size: H * 0.032, color: '#5a5f69', font: 'monospace' }); text(g, l, W * 0.08, H * (0.12 + i * 0.055), { size: H * 0.032, color: c, font: 'monospace' }); });
  g.fillStyle = '#111317'; g.fillRect(0, H * 0.9, W, H * 0.1);
  text(g, 'PK3: Target VDD 5.0 V · Device ID 0x0E20 · Sẵn sàng nạp', W * 0.02, H * 0.95, { size: H * 0.03, color: '#7fd87f', font: 'monospace' });
}
function drawClockFace(g, W, H) {
  g.fillStyle = '#fbfbf8'; g.beginPath(); g.arc(W / 2, H / 2, W * 0.48, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#222'; g.lineWidth = W * 0.02; g.stroke();
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2, r0 = W * (i % 5 ? 0.43 : 0.39), r1 = W * 0.45;
    g.lineWidth = i % 5 ? W * 0.006 : W * 0.016;
    g.beginPath(); g.moveTo(W / 2 + Math.sin(a) * r0, H / 2 - Math.cos(a) * r0); g.lineTo(W / 2 + Math.sin(a) * r1, H / 2 - Math.cos(a) * r1); g.stroke();
  }
  for (let h = 1; h <= 12; h++) { const a = (h / 12) * Math.PI * 2; text(g, String(h), W / 2 + Math.sin(a) * W * 0.32, H / 2 - Math.cos(a) * W * 0.32, { size: W * 0.085, color: '#222', align: 'center', bold: true }); }
  text(g, 'RVL LAB', W / 2, H * 0.68, { size: W * 0.045, color: '#888', align: 'center', bold: true });
}

// ============================================================================ build
export function build(game) {
  const q = qualityLevel(game);
  const M = materials(game);
  const lab = labState(game);
  const root = new THREE.Group();
  root.name = 'lab-room';
  const B = new StaticBatch('lab-static');            // hình tĩnh đổ bóng
  const BN = new StaticBatch('lab-static-noshadow');  // hình tĩnh không đổ bóng (trần, decal nhỏ)
  const colliders = [], surfaces = [], lights = [], anchors = {}, updates = [], props = {}, interact = [], sockets = [];
  const items = [];
  const add = (geo, mat, t, cast = true) => (cast ? B : BN).add(geo, mat, t, { castShadow: cast });
  const cadOK = cadAvailable(game);                    // trình duyệt thật → GLB thiết bị lab (cad/src/lab) thay hình thủ tục
  const decor = new DecorSet(game, root);              // đồ trang trí CAD không tương tác — gộp theo vùng + LOD
  const anchor = (name, x, y, z, ry = 0) => { const o = new THREE.Object3D(); o.name = name; o.position.set(x, y, z); o.rotation.y = ry; root.add(o); anchors[name] = o; return o; };
  const surface = (mesh, name) => { mesh.userData.surface = { name }; mesh.name = `surface:${name}`; surfaces.push(mesh); root.add(mesh); return mesh; };

  // ------------------------------------------------------------------ sàn, trần
  const floor = mk(worldPlane(X1 - X0, Z1 - Z0, 2400), M.floor, { rx: -Math.PI / 2, cast: false });
  floor.position.set((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  surface(floor, 'floor');
  add(worldPlane(X1 - X0, Z1 - Z0, 600), M.ceiling, { x: 0, y: RH, z: 0, rx: Math.PI / 2 }, true);
  // ------------------------------------------------------------------ tường (có lỗ cửa sổ / cửa đi)
  const wallMat = (side) => (side === 'N' ? M.wallAccent : M.wall);
  const walls = [
    { side: 'N', len: X1 - X0 + 2 * WT, place: (u, y, w, h) => ({ x: u, y, z: Z0 - WT / 2, w, h, d: WT }), openings: [] },
    { side: 'S', len: X1 - X0 + 2 * WT, place: (u, y, w, h) => ({ x: u, y, z: Z1 + WT / 2, w, h, d: WT }), openings: [{ u0: DOOR.x - DOOR.w / 2, u1: DOOR.x + DOOR.w / 2, y0: 0, y1: DOOR.h }] },
    { side: 'W', len: Z1 - Z0, place: (u, y, w, h) => ({ x: X0 - WT / 2, y, z: u, w: WT, h, d: w }), openings: [] },
    { side: 'E', len: Z1 - Z0, place: (u, y, w, h) => ({ x: X1 + WT / 2, y, z: u, w: WT, h, d: w }), openings: WINDOWS.map((wd) => ({ u0: wd.z - wd.w / 2, u1: wd.z + wd.w / 2, y0: WIN_Y0, y1: WIN_Y1 })) },
  ];
  for (const w of walls) {
    for (const p of wallPieces(w.len, RH, w.openings)) {
      const u = (p.u0 + p.u1) / 2, len = p.u1 - p.u0, h = p.y1 - p.y0;
      const b = w.place(u, (p.y0 + p.y1) / 2, len, h);
      add(worldBox(b.w, b.h, b.d, 1000), wallMat(w.side), { x: b.x, y: b.y, z: b.z });
    }
  }
  colliders.push(box3(X0 - 400, 0, Z0 - 400, X1 + 400, RH, Z0), box3(X0 - 400, 0, Z1, X1 + 400, RH, Z1 + 400), box3(X0 - 400, 0, Z0, X0, RH, Z1), box3(X1, 0, Z0, X1 + 400, RH, Z1));
  // phào chân tường (chừa cửa đi)
  const bb = (x0, z0, x1, z1) => add(new THREE.BoxGeometry(Math.max(15, x1 - x0), 100, Math.max(15, z1 - z0)), M.baseboard, { x: (x0 + x1) / 2, y: 50, z: (z0 + z1) / 2 }, false);
  bb(X0, Z0, X1, Z0 + 15); bb(X0, Z0, X0 + 15, Z1); bb(X1 - 15, Z0, X1, Z1);
  bb(X0, Z1 - 15, DOOR.x - DOOR.w / 2 - 60, Z1); bb(DOOR.x + DOOR.w / 2 + 60, Z1 - 15, X1, Z1);
  // ổ cắm âm tường
  for (const [x, z, ry] of [[-4200, Z0 + 2, 0], [-1700, Z0 + 2, 0], [1000, Z0 + 2, 0], [X0 + 2, 200, Math.PI / 2], [X0 + 2, 2600, Math.PI / 2], [1500, Z1 - 2, Math.PI], [-3600, Z1 - 2, Math.PI], [X1 - 2, 2200, -Math.PI / 2]]) {
    add(rbox(86, 86, 8, 3), M.white, { x, y: 320, z, ry });
  }

  // ------------------------------------------------------------------ cửa sổ (Đông) + rèm lá + bầu trời
  const sky = canvasPlane(9000, 4000, drawSky, { pxPerMm: 0.12, maxPx: 1024, fallback: '#bcdcf2', emissive: true });
  sky.position.set(X1 + 2600, 1500, -1200);
  sky.rotation.y = -Math.PI / 2;
  sky.castShadow = false; sky.receiveShadow = false;
  root.add(sky);
  const slats = [];
  for (const wd of WINDOWS) {
    const z0 = wd.z - wd.w / 2, z1 = wd.z + wd.w / 2, xw = X1;
    // khung nhôm + đố giữa + bậu
    for (const [y, h] of [[WIN_Y0 + 25, 50], [WIN_Y1 - 25, 50], [(WIN_Y0 + WIN_Y1) / 2 + 150, 40]]) add(new THREE.BoxGeometry(70, h, wd.w), M.alu, { x: xw + 20, y, z: wd.z });
    for (const z of [z0 + 25, z1 - 25, wd.z]) add(new THREE.BoxGeometry(70, WIN_Y1 - WIN_Y0, z === wd.z ? 40 : 50), M.alu, { x: xw + 20, y: (WIN_Y0 + WIN_Y1) / 2, z });
    add(rbox(220, 30, wd.w + 120, 6), M.white, { x: xw - 60, y: WIN_Y0 - 15, z: wd.z });
    const glass = mk(new THREE.PlaneGeometry(wd.w, WIN_Y1 - WIN_Y0), M.glass, { x: xw + 30, y: (WIN_Y0 + WIN_Y1) / 2, z: wd.z, ry: -Math.PI / 2, cast: false });
    glass.raycast = () => {};
    root.add(glass);
    // rèm lá: hộp đỉnh + lá nhôm (instanced) phủ 45 % trên
    add(rbox(60, 50, wd.w + 60, 6), M.white, { x: xw - 70, y: WIN_Y1 - 5, z: wd.z });
    const nSl = Math.round(((WIN_Y1 - WIN_Y0) * 0.45) / 22);
    for (let i = 0; i < nSl; i++) slats.push({ x: xw - 70, y: WIN_Y1 - 45 - i * 22, z: wd.z, len: wd.w + 30 });
    for (const dz of [-wd.w * 0.3, wd.w * 0.3]) add(new THREE.CylinderGeometry(1, 1, nSl * 22 + 40, 4), M.white, { x: xw - 70, y: WIN_Y1 - 20 - (nSl * 22) / 2, z: wd.z + dz }, false);
    add(rbox(25, 22, wd.w + 30, 4), M.white, { x: xw - 70, y: WIN_Y1 - 45 - nSl * 22, z: wd.z });
    add(new THREE.CylinderGeometry(2, 2, 900, 6), M.white, { x: xw - 100, y: WIN_Y1 - 500, z: z1 - 60 }, false);
  }
  const slatMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(25, 0.8, 1), std(0xeceeef, 0.6, 0.38), slats.length);
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), e = new THREE.Euler();
  slats.forEach((s, i) => { m4.compose(V(s.x, s.y, s.z), qt.setFromEuler(e.set(0, 0, -0.75)), V(1, 1, s.len)); slatMesh.setMatrixAt(i, m4); });
  slatMesh.castShadow = true; slatMesh.receiveShadow = true;
  root.add(slatMesh);

  // ------------------------------------------------------------------ cửa đi (Nam) → Căn hộ thử robot
  {
    const x = DOOR.x, zf = Z1;
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(70, DOOR.h + 70, WT + 40), M.white, { x: x + s * (DOOR.w / 2 + 35), y: (DOOR.h + 70) / 2, z: zf + WT / 2 });
    add(new THREE.BoxGeometry(DOOR.w + 140, 70, WT + 40), M.white, { x, y: DOOR.h + 35, z: zf + WT / 2 });
    const leaf = new THREE.Group();
    leaf.position.set(x, 0, zf + 40);
    leaf.add(mk(worldBox(DOOR.w - 10, DOOR.h - 10, 44, 1200), M.door, { y: (DOOR.h - 10) / 2 }));
    leaf.add(mk(rbox(DOOR.w - 300, 500, 6, 3), M.door, { y: 1550, z: -24 }), mk(rbox(DOOR.w - 300, 700, 6, 3), M.door, { y: 600, z: -24 }));   // panô
    for (const s of [-1, 1]) {
      leaf.add(mk(new THREE.CylinderGeometry(28, 28, 12, 24), M.chrome, { x: DOOR.w / 2 - 90, y: 1020, z: s * 30, rx: Math.PI / 2 }));
      leaf.add(mk(rbox(130, 18, 22, 8), M.chrome, { x: DOOR.w / 2 - 140, y: 1020, z: s * 50 }));
    }
    leaf.add(mk(rbox(380, 40, 50, 8), M.alu, { x: -150, y: DOOR.h - 70, z: -50 }));   // tay co thuỷ lực
    leaf.add(mk(new THREE.BoxGeometry(260, 14, 14), M.alu, { x: 40, y: DOOR.h - 60, z: -90, ry: 0.3 }));
    mergeObject(leaf);
    root.add(leaf);
    const sign = canvasPlane(900, 170, drawSign('CĂN HỘ THỬ ROBOT →', 'Phòng khách · bếp · cầu thang (cảm biến chống rơi)', '#1b3a8a'), { pxPerMm: 0.8, fallback: '#1b3a8a' });
    sign.position.set(x, DOOR.h + 210, zf - 4); sign.rotation.y = Math.PI;
    root.add(sign);
    const exit = canvasPlane(360, 130, drawSign('LỐI RA  🏃', '', '#1fa04a'), { pxPerMm: 1, fallback: '#1fa04a', emissive: true });
    exit.position.set(x - 700, 2400, zf - 30); exit.rotation.y = Math.PI;
    root.add(exit);
    add(rbox(380, 150, 50, 6), M.white, { x: x - 700, y: 2400, z: zf - 2 });
    add(rbox(80, 120, 14, 4), M.white, { x: x - DOOR.w / 2 - 220, y: 1250, z: zf - 7 });          // công tắc đèn
    const da = anchor('door-house', x, 0, zf - 450, Math.PI);
    da.userData.target = 'house';
    interact.push({ object: leaf, spec: {
      name: 'Cửa sang "Căn hộ thử robot"', highlight: true,
      prompts: [{ key: 'E', label: 'Sang căn hộ thử robot', do: () => { play(game, 'click'); emit(game, 'world:door', { target: 'house', anchor: da }); emit(game, 'door:use', { door: 'door-house', target: 'house' }); } }],
    } });
  }

  // ------------------------------------------------------------------ trần: tấm LED, máng cáp, miệng gió
  // tấm LED lớn 1200×600 kèm RectAreaLight (số lượng theo chất lượng) — tấm 600×600 lưới đều tránh chồng lên
  const rectSpots = [[-2900, -3300], [-600, -3300], [-2000, -1150], [2500, 1000], [-3800, -2200], [0, 2600]];
  const nRect = [0, 2, 4, 6][q];
  const panelPos = [];
  for (const x of [-3600, -1200, 1200, 3600]) for (const z of [-3000, -600, 1800]) {
    if (rectSpots.slice(0, nRect).some(([rx, rz]) => Math.abs(rx - x) < 920 && Math.abs(rz - z) < 620)) continue;
    panelPos.push([x, z]);
  }
  for (const [x, z] of panelPos) {
    add(new THREE.BoxGeometry(620, 14, 620), M.alu, { x, y: RH - 7, z }, false);
    BN.add(new THREE.PlaneGeometry(590, 590), M.panel, { x, y: RH - 14.5, z, rx: Math.PI / 2 }, { castShadow: false });
  }
  for (const [x, z] of [[0, -1800], [-2400, 1200], [2400, -2400]]) {
    add(new THREE.BoxGeometry(600, 8, 600), M.white, { x, y: RH - 4, z }, false);
    for (let i = 0; i < 6; i++) add(new THREE.BoxGeometry(540 - i * 80, 4, 540 - i * 80), M.frameLight, { x, y: RH - 10 - i * 3, z }, false);
  }
  // máng cáp lưới treo dọc tường Bắc + nhánh dọc tường Tây
  {
    const runs = [{ a: V(X0 + 250, 2850, Z0 + 250), b: V(X1 - 300, 2850, Z0 + 250) }, { a: V(X0 + 250, 2850, Z0 + 400), b: V(X0 + 250, 2850, 2600) }];
    const rungs = [];
    for (const r of runs) {
      const dir = r.b.clone().sub(r.a), len = dir.length(); dir.normalize();
      const side = V(-dir.z, 0, dir.x);
      for (const s of [-1, 1]) for (const y of [0, 50]) add(tube([r.a.clone().addScaledVector(side, s * 150).setY(r.a.y + y), r.b.clone().addScaledVector(side, s * 150).setY(r.a.y + y)], 2.5, 2, 6), M.chrome, null);
      for (let k = 0; k < 4; k++) add(tube([r.a.clone().addScaledVector(side, -150 + k * 100), r.b.clone().addScaledVector(side, -150 + k * 100)], 2, 2, 5), M.chrome, null);
      for (let t = 0; t <= len; t += 100) rungs.push({ p: r.a.clone().addScaledVector(dir, t), ry: Math.atan2(side.x, side.z) });
      for (let t = 300; t < len; t += 1500) {
        const p = r.a.clone().addScaledVector(dir, t);
        for (const s of [-1, 1]) add(new THREE.CylinderGeometry(4, 4, RH - 2850, 8), M.chrome, { x: p.x + side.x * s * 180, y: (RH + 2850) / 2, z: p.z + side.z * s * 180 });
        add(new THREE.BoxGeometry(Math.abs(side.x) * 400 + 40, 8, Math.abs(side.z) * 400 + 40), M.frame, { x: p.x, y: 2845, z: p.z });
      }
      // bó cáp trong máng
      const cols = [0x1d1f23, 0x2b5fae, 0xc8302a, 0x777777, 0xe8e8e8];
      cols.forEach((c, i) => add(tube([r.a.clone().addScaledVector(side, -100 + i * 45).setY(2862), r.b.clone().addScaledVector(side, -100 + i * 45).setY(2862)], 7, 2, 7), std(c, 0, 0.55), null));
    }
    const rungMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(2, 2, 300, 5), M.chrome, rungs.length);
    rungs.forEach((r, i) => { m4.compose(r.p, qt.setFromEuler(e.set(Math.PI / 2, r.ry, 0, 'YXZ')), V(1, 1, 1)); rungMesh.setMatrixAt(i, m4); });
    rungMesh.castShadow = false;
    root.add(rungMesh);
    // dây thả xuống bàn đo (ống ruột gà)
    add(coil(V(-600, 2830, -3850), V(-600, 1300, -3930), 14, 60, 3), M.black, null);
    add(tube([[-600, 1300, -3930], [-600, 1000, -3950], [-600, 760, -3960]], 10, 8, 8), M.black, null);
  }

  // ------------------------------------------------------------------ bàn làm việc
  const groundCord = new THREE.MeshStandardMaterial({ color: 0x1b6e3a, roughness: 0.5 });
  const powerStrips = [];
  function workbench(b) {
    const { x, z, w, d } = b;
    const T = 32, top = BENCH_H - 3;
    // mặt gỗ (surface riêng)
    const wood = mk(worldBox(w, T, d, 1600, 1600), M.wood, { x, y: top - T / 2, z });
    surface(wood, `${b.name}:wood`);
    // thảm ESD
    const md = d - 120, mz = z + 20;
    const mat = mk(rbox(w - 80, 3, md, 1.2, 1), M.esd, { x, y: top + 1.5, z: mz, cast: false });
    surface(mat, b.name);
    // điểm nối đất ESD + vòng tay dây xoắn (CAD 'esd-strap'; thủ tục khi không có CAD)
    if (cadOK) decor.add('esd-strap', { x: x - w / 2 + 150, y: top, z: z + d / 2 - 30, ry: Math.PI / 2, zone: b.island ? 'island-small' : 'esd-wall', far: 7000 });
    else {
      const sx = x - w / 2 + 70, sz = mz + md / 2 - 40;
      add(new THREE.CylinderGeometry(6, 6, 5, 16), M.chrome, { x: sx, y: top + 5, z: sz });
      add(new THREE.CylinderGeometry(3.5, 3.5, 3, 12), M.chrome, { x: sx, y: top + 8.5, z: sz });
      add(tube([[sx, top + 8, sz], [sx - 30, top + 6, sz + 10], [x - w / 2 + 10, top - 40, z + d / 2 - 60], [x - w / 2 + 25, 450, z + d / 2 - 50]], 2.2, 24, 6), groundCord, null);
      add(new THREE.CylinderGeometry(9, 9, 22, 14), M.yellow, { x: x - w / 2 + 25, y: 440, z: z + d / 2 - 50, rz: Math.PI / 2 });
      add(coil(V(sx + 20, top + 10, sz - 10), V(sx + 240, top + 10, sz - 60), 7, 26, 1.4), M.blue, null);
      add(new THREE.TorusGeometry(32, 9, 10, 28), M.blue, { x: sx + 290, y: top + 9, z: sz - 70, rx: Math.PI / 2 });
    }
    // khung thép
    const fr = M.frame;
    for (const ix of [-1, 1]) for (const iz of [-1, 1]) {
      const lx = x + ix * (w / 2 - 50), lz = z + iz * (d / 2 - 50);
      add(new THREE.BoxGeometry(40, top - T, 40), fr, { x: lx, y: (top - T) / 2, z: lz });
      add(new THREE.CylinderGeometry(22, 26, 14, 16), M.rubber, { x: lx, y: 7, z: lz });
    }
    for (const iz of [-1, 1]) {
      add(new THREE.BoxGeometry(w - 60, 60, 30), fr, { x, y: top - T - 30, z: z + iz * (d / 2 - 50) });
      add(new THREE.BoxGeometry(w - 60, 30, 30), fr, { x, y: 160, z: z + iz * (d / 2 - 50) });
    }
    for (const ix of [-1, 1]) add(new THREE.BoxGeometry(30, 50, d - 60), fr, { x: x + ix * (w / 2 - 50), y: top - T - 30, z }), add(new THREE.BoxGeometry(30, 30, d - 60), fr, { x: x + ix * (w / 2 - 50), y: 160, z });
    add(worldBox(w - 120, 16, d - 120, 1000), M.brushed, { x, y: 183, z });           // kệ dưới
    // ngăn kéo treo dưới mặt bàn (phải)
    add(rbox(500, 130, d - 160, 4), M.frameLight, { x: x + w / 2 - 330, y: top - T - 70, z });
    add(rbox(380, 14, 30, 6), M.chrome, { x: x + w / 2 - 330, y: top - T - 70, z: z + d / 2 - 70 });
    colliders.push(box3(x - w / 2, 0, z - d / 2, x + w / 2, BENCH_H + 10, z + d / 2));
    anchor(b.name, x, BENCH_H, mz, 0).userData.label = b.label;
    // ổ điện 6 lỗ (công tắc có đèn — E bật/tắt): bàn sát tường → bắt vít lên tường phía trên mép sau (gọn dây);
    // bàn đảo → nằm ở mép sau mặt bàn
    const ps = b.island ? powerStrip(x, BENCH_H - 3, z - d / 2 + 45, b.name, false)
      : powerStrip(x + (b.stripX ?? (w / 2 - 520)), 935, Z0 + 2, b.name, true);
    powerStrips.push(ps);
  }
  function powerStrip(x, y, z, owner, wall) {
    const g = new THREE.Group();
    g.name = `power-strip-${owner}`;
    g.position.set(x, y, z);
    if (wall) g.rotation.x = Math.PI / 2;          // mặt ổ (+Y cục bộ) quay ra phòng (+Z)
    g.add(mk(rbox(470, 40, 62, 8), M.white, { y: 20 }));
    for (let i = 0; i < 6; i++) {
      g.add(mk(new THREE.CylinderGeometry(19, 19, 3, 24), std(0xe2e4e6, 0, 0.45), { x: -175 + i * 62, y: 40.5 }));
      for (const s2 of [-1, 1]) g.add(mk(new THREE.CylinderGeometry(2.4, 2.4, 1, 8), M.black, { x: -175 + i * 62 + s2 * 9.5, y: 42.2 }));
    }
    const swMat = std(0x8a1410, 0, 0.35, { emissive: 0xff2a14, emissiveIntensity: 1.4 });
    const sw = mk(rbox(22, 6, 18, 3), swMat, { x: 207, y: 43 });
    g.add(sw);
    if (!wall) g.add(mk(tube([[240, 15, 0], [280, 10, -10], [300, -30, -20], [310, -600, -25]], 4.5, 16, 8), M.black));
    sw.userData.dynamic = true;
    markRest(sw);
    mergeObject(g);
    root.add(g);
    const st = (lab.strips[owner] = { on: true });
    const toggle = () => {
      st.on = !st.on; sw.rotation.x = st.on ? -0.2 : 0.2; swMat.emissiveIntensity = st.on ? 1.4 : 0;
      play(game, 'click'); emit(game, st.on ? 'power:on' : 'power:off', { source: `strip:${owner}` });
    };
    sw.rotation.x = -0.2;
    const prop = { object: g };
    interact.push({ object: g, spec: { name: () => `Ổ điện 6 lỗ (${st.on ? 'đang có điện' : 'đã ngắt'})`, highlight: true, prompts: [{ key: 'E', label: 'Bật / tắt công tắc ổ điện', do: toggle }] } });
    anchors[`strip-${owner}`] = g;
    // CAD: ổ thật + phích sạc đã cắm (trong khung CAD: mặt ổ +Z → game +Y cục bộ nhóm g)
    upgradeProp(game, prop, 'power-strip', {
      seat: { switch: sw }, material: { switch: swMat },
      onLoad(cad) { if (wall) cad.getObjectByName('strip_cord')?.removeFromParent(); },   // ổ trên tường: dây nguồn đi trong máng
    });
    return { g, st };
  }
  BENCHES.forEach(workbench);

  // ------------------------------------------------------------------ ghế (3 cái, gộp tĩnh)
  const chairProto = (() => {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.add(mk(rbox(300, 26, 40, 8), M.black, { x: Math.cos(a) * 150, y: 70, z: Math.sin(a) * 150, ry: -a }));
      g.add(mk(new THREE.SphereGeometry(25, 12, 8), M.black, { x: Math.cos(a) * 290, y: 25, z: Math.sin(a) * 290 }));
    }
    g.add(mk(new THREE.CylinderGeometry(30, 34, 60, 18), M.black, { y: 95 }));
    g.add(mk(new THREE.CylinderGeometry(15, 15, 280, 16), M.chrome, { y: 250 }));
    g.add(mk(new THREE.CylinderGeometry(26, 26, 160, 16), M.black, { y: 230 }));
    g.add(mk(rbox(460, 70, 450, 28, 3), M.fabric, { y: 430 }));
    g.add(mk(rbox(380, 14, 350, 6), M.black, { y: 390 }));
    g.add(mk(rbox(40, 380, 30, 8), M.black, { y: 600, z: -215, rx: -0.1 }));
    g.add(mk(rbox(420, 300, 60, 25, 3), M.fabric, { y: 790, z: -235, rx: -0.12 }));
    for (const s of [-1, 1]) g.add(mk(rbox(40, 150, 220, 12), M.black, { x: s * 245, y: 540, z: -20 }));
    return g;
  })();
  // [UX ghế] mỗi ghế là một Group riêng (không gộp tĩnh) để engine/ux/seating.js cho NGỒI (E), kéo ghế vào/ra, xoay ghế xoay.
  //          userData.seat = { bench, seatH, collider } — collider là Box3 trong `colliders` (seating dời theo ghế).
  const seats = [];
  [[-2900, -2850, Math.PI + 0.15, 'bench-solder'], [-600, -2900, Math.PI - 0.2, 'bench-test'], [-2200, -350, 0.1, 'bench-assembly']].forEach(([x, z, ry, bench], i) => {
    const ch = chairProto.clone(true);
    ch.name = `chair-${bench}`;
    ch.position.set(x, 0, z); ch.rotation.y = ry;
    const col = box3(x - 260, 0, z - 260, x + 260, 900, z + 260);
    colliders.push(col);
    ch.userData.seat = { id: `chair-${i}`, bench, seatH: 465, kind: 'chair', rolling: true, collider: col };
    root.add(ch); anchors[ch.name] = ch; seats.push(ch);
  });
  // [CAD] ghế xoay thật (cad/src/lab/desk_chair.py: chân sao 5 cánh, ty hơi, tay vịn) thay hình thủ tục — giữ nguyên Group, tên
  //       'chair-<bàn>' và userData.seat của [UX ghế]. Mốc 'seat-<bàn>' = chính ghế (userData.seat.eye: mắt người ngồi gợi ý).
  for (const ch of seats) {
    if (!/^chair-/.test(ch.name)) continue;
    const e = CAD_ANCHORS?.['desk-chair']?.eye_point?.p || [0, 1150, 60];
    ch.userData.seat.eye = new THREE.Vector3(...e).applyEuler(ch.rotation).add(ch.position).toArray();   // toạ độ thế giới (mm)
    ch.userData.seat.eyeLocal = e;
    anchors[`seat-${ch.userData.seat.bench}`] = ch;
    upgradeProp(game, { object: ch }, 'desk-chair');
  }

  // ------------------------------------------------------------------ đèn kính lúp LED (bàn hàn) — CAD 'magnifier-lamp'
  // kẹp mép sau bàn giữa trạm hàn và kính hiển vi; đầu đèn ở trên kẹp mạch (tư thế đặt sẵn trong cad/src/lab/magnifier_lamp.py)
  {
    const LX = -3000, LZ = -3955;
    const g = new THREE.Group();
    g.name = 'magnifier-lamp';
    g.position.set(LX, BENCH_H, LZ);
    const hp = CAD_ANCHORS?.['magnifier-lamp']?.anchor_head?.p || [120, 340, 555];
    const head = V(...hp);
    const elbow = V(head.x * 0.25, 470, head.z * 0.25);
    g.add(mk(rbox(64, 120, 76, 6), M.white, { y: -40, z: 6 }));                       // kẹp bàn
    g.add(mk(new THREE.CylinderGeometry(14, 14, 50, 14), M.white, { y: 45 }));
    for (const s2 of [-1, 1]) {
      g.add(mk(tube([V(s2 * 9, 70, 0), elbow.clone().setX(elbow.x + s2 * 9)], 4.2, 4, 8), M.white));
      g.add(mk(tube([elbow.clone().setX(elbow.x + s2 * 9), head.clone().add(V(s2 * 9, 25, -70))], 3.8, 4, 8), M.white));
    }
    g.add(mk(coil(V(0, 110, 0), elbow.clone().multiplyScalar(0.7).setY(330), 6, 22, 1), M.chrome));
    g.add(mk(new THREE.SphereGeometry(16, 16, 10), M.white, { x: elbow.x, y: elbow.y, z: elbow.z }));
    const lampHead = new THREE.Group();
    lampHead.position.copy(head);
    lampHead.rotation.x = -0.12;
    lampHead.add(mk(new THREE.TorusGeometry(92, 16, 14, 48), M.white, { rx: Math.PI / 2 }));
    lampHead.add(mk(new THREE.CylinderGeometry(108, 108, 24, 48, 1, true), M.white, {}));
    const ledRing = mk(new THREE.TorusGeometry(86, 5, 8, 48), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f7ff, emissiveIntensity: 0 }), { y: -12, rx: Math.PI / 2, cast: false });
    lampHead.add(ledRing);
    const lens = mk(new THREE.CylinderGeometry(66, 66, 5, 48), M.lens, { cast: false });
    lampHead.add(lens);
    g.add(lampHead);
    ledRing.userData.keep = true; lens.userData.keep = true;
    mergeObject(g);
    root.add(g);
    const lampLight = new THREE.SpotLight(0xf3f6ff, 0, 1600, 0.85, 0.6, 2);
    lampLight.position.copy(head).add(V(LX, BENCH_H - 14, LZ));
    const tgt = new THREE.Object3D(); tgt.position.set(LX + head.x, BENCH_H, LZ + head.z + 30);
    root.add(tgt); lampLight.target = tgt;
    lampLight.castShadow = false;
    root.add(lampLight); lights.push(lampLight);
    const toggleLamp = () => {
      lab.lamp.on = !lab.lamp.on;
      ledRing.material.emissiveIntensity = lab.lamp.on ? 2.6 : 0;
      lampLight.intensity = lab.lamp.on ? 9e5 : 0;
      play(game, 'click');
      emit(game, lab.lamp.on ? 'power:on' : 'power:off', { source: 'magnifier-lamp' });
    };
    interact.push({ object: g, spec: { name: () => `Đèn kính lúp LED 5 diop (${lab.lamp.on ? 'bật' : 'tắt'})`, highlight: true, prompts: [{ key: 'E', label: 'Bật / tắt đèn', do: toggleLamp }] } });
    anchors['lamp-solder'] = lampHead;
    upgradeProp(game, { object: g }, 'magnifier-lamp', { material: { led_ring: ledRing.material } });
  }

  // ------------------------------------------------------------------ bảng treo dụng cụ (pegboard) trên bàn hàn
  {
    const cx = -2900, cy = 1560, w = 1800, h = 900, z = Z0 + 14;
    const board = mk(worldPlane(w, h, 101.6), M.peg, { x: cx, y: cy, z, cast: false });
    root.add(board);
    for (const [x, y, ww, hh] of [[cx, cy + h / 2, w + 40, 30], [cx, cy - h / 2, w + 40, 30], [cx - w / 2, cy, 30, h], [cx + w / 2, cy, 30, h]]) add(new THREE.BoxGeometry(ww, hh, 24), M.frame, { x, y, z: z + 2 });
    anchors.pegboard = board;
    // móc chữ J (instanced)
    const hooks = [];
    for (let i = 0; i < 18; i++) hooks.push(V(cx - 800 + (i % 9) * 200, cy + 230 - Math.floor(i / 9) * 420, z + 30));
    const hookMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(2.5, 2.5, 70, 6), M.chrome, hooks.length);
    hooks.forEach((p, i) => { m4.compose(p, qt.setFromEuler(e.set(Math.PI / 2 - 0.25, 0, 0)), V(1, 1, 1)); hookMesh.setMatrixAt(i, m4); });
    if (!cadOK) root.add(hookMesh);
    // giá cuộn dây điện màu (6 cuộn trên thanh)
    add(new THREE.CylinderGeometry(6, 6, 760, 12), M.chrome, { x: cx - 380, y: cy + 300, z: z + 70, rz: Math.PI / 2 });
    for (const s of [-1, 1]) add(rbox(20, 90, 70, 4), M.frame, { x: cx - 380 + s * 380, y: cy + 290, z: z + 40 });
    [0xd23b3b, 0x1d1f23, 0xe8c020, 0x2f8a4a, 0x2b5fae, 0xf2f2f2].forEach((c, i) => {
      const sx = cx - 680 + i * 120;
      add(new THREE.CylinderGeometry(48, 48, 6, 24), M.black, { x: sx - 34, y: cy + 300, z: z + 70, rz: Math.PI / 2 });
      add(new THREE.CylinderGeometry(48, 48, 6, 24), M.black, { x: sx + 34, y: cy + 300, z: z + 70, rz: Math.PI / 2 });
      add(new THREE.CylinderGeometry(40, 40, 62, 24), std(c, 0, 0.45), { x: sx, y: cy + 300, z: z + 70, rz: Math.PI / 2 });
    });
    // dụng cụ cầm tay treo bảng: CAD 'pegboard-tools' (kìm cắt/mũi nhọn/dẹt, kìm tuốt, bộ nhíp, bộ tua vít, kéo, lục giác,
    // kính bảo hộ, thước) — thủ tục khi không có CAD
    if (cadOK) {
      decor.add('pegboard-tools', { x: cx, y: cy - 80, z: z + 2, zone: 'pegboard-tools', far: 6500 });
      [[cx + 470, 0xd23b3b], [cx + 560, 0x1d1f23]].forEach(([x, c2]) => add(new THREE.TorusGeometry(42, 14, 10, 24), std(c2, 0, 0.4), { x, y: cy + 330, z: z + 40 }));
    } else {
      // cuộn băng keo, kéo, thước, kính bảo hộ
      [[cx + 250, 0xd23b3b], [cx + 380, 0x1d1f23], [cx + 510, 0xe8c020]].forEach(([x, c]) => add(new THREE.TorusGeometry(42, 14, 10, 24), std(c, 0, 0.4), { x, y: cy + 210, z: z + 40 }));
      add(rbox(30, 500, 4, 2), M.alu, { x: cx + 760, y: cy - 30, z: z + 14 });
      add(new THREE.TorusGeometry(26, 6, 8, 20), M.red, { x: cx + 250, y: cy - 160, z: z + 24 }), add(new THREE.TorusGeometry(26, 6, 8, 20), M.red, { x: cx + 320, y: cy - 160, z: z + 24 });
      add(rbox(16, 170, 4, 2), M.chrome, { x: cx + 285, y: cy - 280, z: z + 24, rz: 0.08 });
      add(rbox(170, 60, 20, 18), new THREE.MeshPhysicalMaterial({ color: 0xffd34d, roughness: 0.1, transparent: true, opacity: 0.55 }), { x: cx + 520, y: cy - 200, z: z + 40 });
      // bộ lục giác + kìm mỏ nhọn (bóng)
      for (let i = 0; i < 7; i++) add(new THREE.BoxGeometry(5 + i, 90 + i * 14, 5 + i), M.black, { x: cx - 650 + i * 22, y: cy - 200 - i * 7, z: z + 30 });
      add(rbox(24, 160, 12, 5), M.red, { x: cx - 330, y: cy - 220, z: z + 30, rz: 0.1 }), add(rbox(24, 160, 12, 5), M.red, { x: cx - 280, y: cy - 220, z: z + 30, rz: -0.1 });
    }
  }

  // ------------------------------------------------------------------ quầy + tủ ngăn kéo linh kiện (tường Tây)
  {
    const c = COUNTER;
    const top = mk(worldBox(c.d, 30, c.w, 1600, 1600), M.wood, { x: c.x, y: c.h - 15, z: c.z });
    surface(top, 'counter');
    add(new THREE.BoxGeometry(c.d - 20, c.h - 30, c.w - 20), M.frameLight, { x: c.x - 5, y: (c.h - 30) / 2, z: c.z });
    for (let i = 0; i < 4; i++) {
      const zz = c.z - c.w / 2 + (i + 0.5) * (c.w / 4);
      add(new THREE.BoxGeometry(6, c.h - 120, c.w / 4 - 20), M.white, { x: c.x + c.d / 2 - 12, y: (c.h - 30) / 2 + 20, z: zz });
      add(rbox(20, 20, 160, 6), M.chrome, { x: c.x + c.d / 2 - 2, y: c.h - 140, z: zz });
    }
    add(new THREE.BoxGeometry(c.d - 40, 80, c.w - 40), M.baseboard, { x: c.x - 10, y: 40, z: c.z });
    colliders.push(box3(c.x - c.d / 2, 0, c.z - c.w / 2, c.x + c.d / 2, c.h + 600, c.z + c.w / 2));
    anchor('counter', c.x, c.h, c.z, Math.PI / 2);
    const cabA = place('drawers-A', PartsDrawer.build(game, { id: 'A', cols: 5, rows: 8, pitch: [116, 62], depth: 300 }), c.x - 40, c.h, c.z - 560, Math.PI / 2);
    const cabB = place('drawers-B', PartsDrawer.build(game, { id: 'B', cols: 4, rows: 6, pitch: [150, 84], depth: 300, binColor: 0xf0c27a }), c.x - 40, c.h, c.z + 560, Math.PI / 2);
    void cabA; void cabB;
  }

  // ------------------------------------------------------------------ kệ thép + hộp (A: tường Tây, B: tường Bắc)
  const boxes = [], bins = [];
  function rack(R, id, ry) {
    const g = new THREE.Group();
    const { w, d, h } = R;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mk(new THREE.BoxGeometry(36, h, 36), M.frame, { x: sx * (w / 2 - 18), y: h / 2, z: sz * (d / 2 - 18) }));
    for (const sx of [-1, 1]) for (let y = 300; y < h; y += 420) g.add(mk(new THREE.BoxGeometry(14, 14, d - 30), M.frame, { x: sx * (w / 2 - 18), y, z: 0 }));
    g.add(mk(new THREE.BoxGeometry(w - 40, 5, 5), M.frame, { y: h * 0.5, z: -d / 2 + 10, rz: Math.atan2(h * 0.8, w) }));
    g.add(mk(new THREE.BoxGeometry(w - 40, 5, 5), M.frame, { y: h * 0.5, z: -d / 2 + 10, rz: -Math.atan2(h * 0.8, w) }));
    const shelfGeo = [];
    const levels = [80, ...R.levels];
    levels.forEach((y) => shelfGeo.push(y));
    g.position.set(R.x, 0, R.z);
    g.rotation.y = ry;
    B.addObject(g);
    // tầng kệ (gộp thành 1 surface)
    const sg = new StaticBatch(`rack-${id}-shelves`);
    for (const y of levels) sg.add(worldBox(w - 20, 18, d - 10, 1000), M.brushed, { x: 0, y: y - 9, z: 0 });
    const shelves = sg.build().children[0];       // 1 vật liệu → 1 Mesh
    shelves.matrixAutoUpdate = true;
    shelves.position.set(R.x, 0, R.z);
    shelves.rotation.y = ry;
    root.add(shelves);
    surfaces.push(shelves);
    shelves.userData.surface = { name: `rack-${id}` };
    // anchor từng tầng (bỏ tầng sát đất)
    const fwd = V(Math.sin(ry), 0, Math.cos(ry));
    R.levels.forEach((y, i) => {
      const a = anchor(`shelf-${id}${i + 1}`, R.x + fwd.x * 40, y, R.z + fwd.z * 40, ry);
      a.userData.label = `Kệ ${id}${i + 1}`;
      // hộp các-tông + thùng nhựa trên tầng (chừa chỗ trống ở giữa để đặt đồ)
      let u = -w / 2 + 40;
      let k = 0;
      while (u < w / 2 - 160) {
        const isBin = (i + k) % 3 === 1;
        const bw = isBin ? 150 : 180 + ((i * 7 + k * 13) % 5) * 40, bh = isBin ? 130 : Math.min(350, 120 + ((i * 3 + k * 11) % 4) * 60), bd = isBin ? 260 : d - 80 - ((k * 17) % 3) * 40;
        if (k === 2) { u += 340; k++; continue; }   // khoảng trống đặt đồ
        const lx = u + bw / 2, lz = -d / 2 + 20 + bd / 2;
        const wp = V(lx, y + bh / 2, lz).applyAxisAngle(V(0, 1, 0), ry).add(V(R.x, 0, R.z));
        if (isBin) bins.push({ p: wp, s: V(bw, bh, bd), ry, color: [0x2f5f9e, 0x3d6fb0, 0x7d868f, 0x2f6f8a][(i + k) % 4] });   // [2026-10] thùng xanh/xám như kho lab thật
        else boxes.push({ p: wp, s: V(bw, bh, bd), ry: ry + (((k * 7) % 3) - 1) * 0.03 });
        u += bw + 20; k++;
      }
    });
    const dir = V(Math.sin(ry), 0, Math.cos(ry));
    const half = V(w / 2, 0, d / 2).applyAxisAngle(V(0, 1, 0), ry);
    colliders.push(box3(R.x - Math.abs(half.x), 0, R.z - Math.abs(half.z), R.x + Math.abs(half.x), h, R.z + Math.abs(half.z)));
    void dir;
  }
  rack(RACK_A, 'A', Math.PI / 2);
  rack(RACK_B, 'B', 0);
  // kệ treo tường trên bàn đo
  {
    const sx = -1100, sy = 1650, sw = 800, sd = 260;
    const sh = mk(worldBox(sw, 22, sd, 1000), M.wood, { x: sx, y: sy - 11, z: Z0 + sd / 2 });
    surface(sh, 'shelf-wall');
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(20, 180, sd - 20), M.frame, { x: sx + s * (sw / 2 - 60), y: sy - 110, z: Z0 + sd / 2 - 10 });
    anchor('shelf-wall', sx, sy, Z0 + sd / 2, 0).userData.label = 'Kệ treo tường';
    for (let i = 0; i < 3; i++) boxes.push({ p: V(sx - 270 + i * 150, sy + 80, Z0 + 120), s: V(130, 160, 200), ry: 0.04 * (i - 1) });
    bins.push({ p: V(sx + 250, sy + 60, Z0 + 130), s: V(150, 120, 220), ry: 0, color: 0x2b5fae });
  }
  const boxMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.card, boxes.length);
  boxes.forEach((b, i) => {
    m4.compose(b.p, qt.setFromEuler(e.set(0, b.ry, 0)), b.s); boxMesh.setMatrixAt(i, m4);
    const t = 0.78 + ((i * 37) % 23) / 100;                                     // bìa cũ/mới lệch tông
    boxMesh.setColorAt(i, new THREE.Color(t, t * (0.95 + ((i * 13) % 7) / 100), t * 0.92));
  });
  boxMesh.castShadow = true; boxMesh.receiveShadow = true;
  root.add(boxMesh);
  const binGeo = (() => {   // thùng nhựa miệng vát phía trước
    const s = new THREE.Shape([V(0, 0), V(1, 0), V(1, 1), V(0.45, 1), V(0, 0.55)].map((p) => new THREE.Vector2(p.x, p.y)));
    const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
    g.translate(-0.5, -0.5, -0.5);
    g.rotateY(Math.PI / 2);
    return g;
  })();
  const binMesh = new THREE.InstancedMesh(binGeo, std(0xffffff, 0, 0.45), bins.length);
  binMesh.name = 'shelf-bins';                                     // [UX] engine/ux/contextActions.js: "E Lấy 1 linh kiện"
  binMesh.userData.bins = bins.map((b) => ({ pos: b.p.toArray(), size: b.s.toArray() }));
  const cc = new THREE.Color();
  bins.forEach((b, i) => { m4.compose(b.p, qt.setFromEuler(e.set(0, b.ry, 0)), b.s); binMesh.setMatrixAt(i, m4); binMesh.setColorAt(i, cc.set(b.color)); });
  binMesh.castShadow = true; binMesh.receiveShadow = true;
  root.add(binMesh);

  // ------------------------------------------------------------------ khu thử robot: băng vàng đen, chữ sàn, đế sạc, vật cản
  {
    const hazTex = drawTexture(512, 64, drawHazard, { repeat: true });
    const hazMat = (len) => { const m = new THREE.MeshStandardMaterial({ color: hazTex ? 0xffffff : 0xf2c200, map: hazTex ? hazTex.clone() : null, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2 }); if (m.map) { m.map.repeat.set(len / 400, 1); m.map.needsUpdate = true; } return m; };
    const { x0, x1, z0, z1 } = TEST;
    const tapeW = 50;
    for (const [x, z, len, ry] of [[(x0 + x1) / 2, z0, x1 - x0 + tapeW, 0], [(x0 + x1) / 2, z1, x1 - x0 + tapeW, 0], [x0, (z0 + z1) / 2, z1 - z0 - tapeW, Math.PI / 2], [x1, (z0 + z1) / 2, z1 - z0 - tapeW, Math.PI / 2]]) {
      const t = mk(new THREE.PlaneGeometry(len, tapeW), hazMat(len), { x, y: 0.6, z, rx: -Math.PI / 2, rz: ry, cast: false });
      t.raycast = () => {};
      root.add(t);
    }
    const lbl = canvasPlane(1400, 260, (g, W, H) => { g.clearRect(0, 0, W, H); text(g, 'KHU THỬ ROBOT', W / 2, H * 0.42, { size: H * 0.5, color: 'rgba(242,194,0,.85)', align: 'center', bold: true }); text(g, 'giữ sạch sàn · không để dây vướng', W / 2, H * 0.85, { size: H * 0.18, color: 'rgba(242,194,0,.75)', align: 'center' }); }, { pxPerMm: 0.6, transparent: true, fallback: '#f2c200' });
    lbl.position.set((x0 + x1) / 2, 0.8, z1 - 260); lbl.rotation.x = -Math.PI / 2;
    lbl.material.polygonOffset = true; lbl.material.polygonOffsetFactor = -3; lbl.castShadow = false; lbl.raycast = () => {};
    root.add(lbl);
    // điểm xuất phát
    const start = mk(new THREE.RingGeometry(150, 175, 48), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }), { x: x0 + 500, y: 0.7, z: z1 - 700, rx: -Math.PI / 2, cast: false });
    start.raycast = () => {};
    root.add(start);
    anchor('test-floor', (x0 + x1) / 2, 0, (z0 + z1) / 2, 0);
    anchor('robot-start', x0 + 500, 0, z1 - 700, Math.PI / 2);
    // đế sạc sát tường Đông
    const dx = X1 - 70, dz = 1700;
    if (cadOK) decor.add('charging-dock', { x: X1 - 45, y: 0, z: dz, ry: -Math.PI / 2, zone: 'room-misc' });   // CAD: đế sạc thật (tiếp điểm, cửa sổ IR, LED)
    else {
      add(rbox(110, 90, 240, 20), M.black, { x: dx, y: 45, z: dz });
      add(rbox(150, 6, 300, 3), M.black, { x: dx - 40, y: 3, z: dz });
      for (const s of [-1, 1]) add(rbox(14, 22, 30, 3), M.chrome, { x: dx - 58, y: 26, z: dz + s * 50 });
      add(new THREE.SphereGeometry(5, 10, 8), new THREE.MeshStandardMaterial({ color: 0x111, emissive: 0x33ff66, emissiveIntensity: 2 }), { x: dx - 56, y: 75, z: dz }, false);
    }
    add(tube([[dx + 20, 40, dz + 120], [X1 - 10, 60, dz + 200], [X1 - 10, 320, 2200]], 3, 12, 6), M.black, null);
    anchor('robot-dock', dx - 200, 0, dz, -Math.PI / 2);
    // vật cản: khối xốp, "chân ghế", thảm nhỏ
    add(rbox(400, 220, 300, 30), std(0x3b7dd8, 0, 0.8), { x: 3100, y: 110, z: 200, ry: 0.3 });
    colliders.push(box3(2860, 0, -20, 3340, 220, 420));
    for (const [x, z] of [[1700, 1000], [2060, 1000], [1700, 1360], [2060, 1360]]) add(new THREE.CylinderGeometry(20, 20, 450, 16), M.chrome, { x, y: 225, z });
    add(rbox(420, 30, 420, 6), M.wood, { x: 1880, y: 465, z: 1180 });
    const stoolCol = box3(1660, 0, 960, 2100, 480, 1400);
    colliders.push(stoolCol);
    // [UX ghế] ghế đẩu khu thử robot (ngồi xem robot chạy) — điểm neo cho engine/ux/seating.js (không có bàn trước mặt)
    const stool = anchor('stool-test', 1880, 0, 1180, Math.PI / 2);
    stool.userData.seat = { id: 'stool-test', bench: null, seatH: 480, kind: 'stool', rolling: false, collider: stoolCol, size: [440, 480, 440] };
    seats.push(stool);
    add(rbox(1200, 10, 800, 4), std(0x7a3b3b, 0, 1), { x: 3300, y: 5, z: 1700 }, false);
    anchor('test-rug', 3300, 10, 1700, 0);
  }

  // ------------------------------------------------------------------ tường Nam: bảng trắng, nội quy, tủ thuốc, bình chữa cháy, đồng hồ
  {
    const wb = canvasPlane(2400, 1200, drawWhiteboard, { pxPerMm: 2048 / 2400, maxPx: 2048, fallback: '#fbfcfd', rough: 0.35 });
    wb.position.set(-1800, 1500, Z1 - 22);
    wb.rotation.y = Math.PI;
    wb.castShadow = false;
    root.add(wb);
    add(new THREE.BoxGeometry(2440, 1240, 18), M.alu, { x: -1800, y: 1500, z: Z1 - 10 });
    add(rbox(1600, 20, 70, 6), M.alu, { x: -1800, y: 880, z: Z1 - 45 });
    [0x1b3a8a, 0xc0392b, 0x1b6e3a, 0x111111].forEach((c, i) => add(new THREE.CylinderGeometry(9, 9, 120, 12), std(c, 0, 0.4), { x: -2300 + i * 40, y: 900, z: Z1 - 50, rz: Math.PI / 2 }));
    add(rbox(140, 40, 55, 6), M.black, { x: -1300, y: 905, z: Z1 - 50 });
    anchors.whiteboard = wb;
    interact.push({ object: wb, spec: { name: 'Bảng trắng — sơ đồ khối robot hút bụi', highlight: false, lessonId: 'pic16f877a', prompts: [] } });
    const rules = canvasPlane(600, 850, drawPoster, { pxPerMm: 1.1, fallback: '#fffaf0', rough: 0.7 });
    rules.position.set(2350, 1500, Z1 - 4); rules.rotation.y = Math.PI; rules.castShadow = false;
    root.add(rules);
    // tủ thuốc cấp cứu
    add(rbox(400, 300, 130, 10), M.white, { x: 1650, y: 1500, z: Z1 - 65 });
    const fa = canvasPlane(380, 280, (g, W, H) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); g.fillStyle = '#1fa04a'; g.fillRect(W * 0.38, H * 0.12, W * 0.24, H * 0.56); g.fillRect(W * 0.26, H * 0.28, W * 0.48, H * 0.24); text(g, 'SƠ CỨU · BỎNG NHIỆT', W / 2, H * 0.86, { size: H * 0.1, color: '#1fa04a', align: 'center', bold: true }); }, { pxPerMm: 1, fallback: '#ffffff' });
    fa.position.set(1650, 1500, Z1 - 131); fa.rotation.y = Math.PI; fa.castShadow = false;
    root.add(fa);
    anchor('first-aid', 1650, 1350, Z1 - 200, Math.PI);
    // bình chữa cháy trên giá + biển
    const ex = new THREE.Group();
    ex.position.set(4350, 0, Z1 - 120);
    ex.add(mk(new THREE.LatheGeometry([[0, 0], [78, 0], [82, 8], [82, 430], [70, 480], [40, 510], [22, 520], [0, 520]].map(([r, y]) => new THREE.Vector2(r, y)), 40), new THREE.MeshPhysicalMaterial({ color: 0xc8231c, roughness: 0.3, clearcoat: 0.8 }), { y: 300 }));
    ex.add(mk(new THREE.CylinderGeometry(20, 22, 40, 16), M.chrome, { y: 840 }));
    ex.add(mk(rbox(120, 16, 30, 6), M.black, { x: 30, y: 880, rz: -0.15 }), mk(rbox(110, 14, 28, 6), M.black, { x: 30, y: 850 }));
    ex.add(mk(new THREE.CylinderGeometry(22, 22, 10, 20), M.white, { x: -32, y: 840, z: 0, rz: Math.PI / 2 }));
    ex.add(mk(tube([[20, 850, 20], [70, 820, 60], [95, 600, 70], [90, 420, 60]], 9, 24, 8), M.black));
    ex.add(mk(new THREE.CylinderGeometry(14, 20, 60, 12), M.black, { x: 90, y: 390, z: 60 }));
    ex.add(mk(rbox(130, 200, 4, 2), M.white, { y: 560, z: -84 }));
    ex.add(mk(rbox(200, 40, 140, 6), M.steelDark, { y: 300, z: 60 }), mk(new THREE.TorusGeometry(88, 6, 8, 32), M.steelDark, { y: 700, rx: Math.PI / 2 }));
    ex.rotation.y = Math.PI;
    B.addObject(ex);
    colliders.push(box3(4230, 0, Z1 - 240, 4470, 900, Z1));
    const exSign = canvasPlane(300, 300, drawSign('🧯', 'BÌNH CHỮA CHÁY', '#c8231c'), { pxPerMm: 1, fallback: '#c8231c' });
    exSign.position.set(4350, 1450, Z1 - 4); exSign.rotation.y = Math.PI;
    root.add(exSign);
    anchor('fire-extinguisher', 4350, 0, Z1 - 400, Math.PI);
    // đồng hồ treo tường (kim động)
    const clock = new THREE.Group();
    clock.position.set(200, 2450, Z1 - 30);
    clock.rotation.y = Math.PI;
    clock.add(mk(new THREE.CylinderGeometry(170, 170, 40, 48), M.black, { rx: Math.PI / 2 }));
    const face = canvasPlane(320, 320, drawClockFace, { pxPerMm: 1.2, fallback: '#fbfbf8' });
    face.position.z = 21; clock.add(face);
    const hand = (len, wd, col) => { const g = new THREE.Group(); g.add(mk(new THREE.BoxGeometry(wd, len, 3), col, { y: len / 2 - 15, cast: false })); g.position.z = 26; clock.add(g); return g; };
    const hH = hand(90, 9, M.black), hM = hand(135, 6, M.black), hS = hand(140, 2, M.red);
    root.add(clock);
    updates.push(() => {
      const d = new Date(), s = d.getSeconds() + d.getMilliseconds() / 1000, m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
      hS.rotation.z = -(s / 60) * Math.PI * 2; hM.rotation.z = -(m / 60) * Math.PI * 2; hH.rotation.z = -(h / 12) * Math.PI * 2;
    });
  }
  // poster sơ đồ chân PIC16F877A (tường Bắc) + mã màu điện trở (tường Tây)
  {
    const pin = canvasPlane(700, 1000, drawPinout, { pxPerMm: 1.2, fallback: '#fbfaf6', rough: 0.7 });
    pin.position.set(500, 1700, Z0 + 3); pin.castShadow = false;
    root.add(pin);
    anchors['poster-pinout'] = pin;
    interact.push({ object: pin, spec: { name: 'Poster sơ đồ chân PIC16F877A', highlight: false, lessonId: 'pic16f877a', prompts: [] } });
    const rc = canvasPlane(600, 850, drawResistorPoster, { pxPerMm: 1.1, fallback: '#fffdf6', rough: 0.7 });
    rc.position.set(-3750, 1550, Z1 - 3); rc.rotation.y = Math.PI; rc.castShadow = false;   // tường Nam (tường Tây có bồn rửa)
    root.add(rc);
    // (biển "KHU VỰC CHỐNG TĨNH ĐIỆN" + các biển an toàn khác: world/_dressing.js)
  }

  // ------------------------------------------------------------------ đồ trên bàn: thùng rác, túi LiPo + sạc, laptop
  {
    // thùng rác đạp chân
    const tb = new THREE.Group();
    tb.add(mk(new THREE.LatheGeometry([[0, 0], [125, 0], [128, 10], [140, 400], [142, 410], [0, 410]].map(([r, y]) => new THREE.Vector2(r, y)), 40), M.brushed));
    tb.add(mk(new THREE.LatheGeometry([[0, 30], [140, 0], [146, -6], [146, -14], [0, -14]].map(([r, y]) => new THREE.Vector2(r, y)), 40), M.brushed, { y: 428 }));
    tb.add(mk(rbox(90, 18, 70, 6), M.black, { y: 20, z: 150 }));
    tb.position.set(-1750, 0, -3720);
    if (cadOK) decor.add('bins', { node: 'trash_bin', x: -1750, y: 0, z: -3720, zone: 'room-misc' });   // CAD: thùng rác đạp chân inox
    else B.addObject(tb);
    colliders.push(box3(-1900, 0, -3870, -1600, 450, -3570));
    anchor('trash-bin', -1750, 460, -3720, 0);
    // túi chống cháy LiPo + bộ sạc cân bằng
    const bx = 120, bz = -3560;
    const bag = new THREE.Group();
    bag.add(mk(rbox(230, 64, 300, 18, 3), std(0x2b2d31, 0.2, 0.75), { y: 32 }));
    bag.add(mk(rbox(234, 10, 304, 4), std(0xd4602a, 0, 0.6), { y: 40 }));
    bag.add(mk(rbox(40, 4, 300, 2), M.black, { x: 70, y: 66 }));
    const bagLab = canvasPlane(200, 120, drawSign('LiPo GUARD', 'Sạc pin trong túi · luôn có người trông', '#d4602a'), { pxPerMm: 1.5, fallback: '#d4602a' });
    bagLab.rotation.x = -Math.PI / 2; bagLab.position.set(-10, 64.5, 20); bagLab.castShadow = false;
    bag.add(bagLab);
    bag.position.set(bx, BENCH_H, bz);
    bag.rotation.y = -0.15;
    bagLab.userData.keep = true;
    mergeObject(bag);
    root.add(bag);
    anchor('lipo-bag', bx, BENCH_H + 66, bz, -0.15);
    interact.push({ object: bag, spec: { name: 'Túi sạc pin LiPo chống cháy (sợi thủy tinh)', highlight: true, lessonId: 'pack-4s-bms', prompts: [] } });
    const ch = new THREE.Group();
    ch.add(mk(rbox(150, 60, 120, 8), std(0x30343a, 0.3, 0.5), { y: 30 }));
    const lcd = canvasPlane(70, 28, (g, W, H) => { g.fillStyle = '#123a5a'; g.fillRect(0, 0, W, H); text(g, 'LiPo 4S BAL', W * 0.05, H * 0.3, { size: H * 0.3, color: '#cfe8ff', bold: true }); text(g, '16.80V 2.0A', W * 0.05, H * 0.72, { size: H * 0.3, color: '#cfe8ff', bold: true }); }, { pxPerMm: 6, fallback: '#123a5a', emissive: true });
    lcd.position.set(-20, 40, 60.5); ch.add(lcd);
    for (let i = 0; i < 4; i++) ch.add(mk(new THREE.CylinderGeometry(6, 6, 8, 14), M.black, { x: 30 + (i % 2) * 22, y: 22 + Math.floor(i / 2) * 22, z: 60, rx: Math.PI / 2 }));
    ch.position.set(bx + 30, BENCH_H, bz - 240);
    lcd.userData.keep = true;
    mergeObject(ch);
    root.add(ch);
    // laptop chạy CCS C / MPLAB IPE
    const lp = new THREE.Group();
    lp.add(mk(rbox(330, 16, 230, 6), M.alu, { y: 8 }));
    lp.add(mk(new THREE.BoxGeometry(290, 2, 100), M.black, { y: 16.2, z: -30 }));
    lp.add(mk(rbox(100, 1.2, 60, 4), std(0x3a3f46, 0.5, 0.3), { y: 16.3, z: 70 }));
    const lid = new THREE.Group();
    lid.position.set(0, 16, -115);
    lid.rotation.x = -0.32;
    lid.add(mk(rbox(330, 220, 8, 6), M.alu, { y: 110, z: -4 }));
    const scr = canvasPlane(300, 190, drawLaptop, { pxPerMm: 2.6, maxPx: 900, fallback: '#1e1f24', emissive: true });
    scr.position.set(0, 112, 0.6);
    lid.add(scr);
    lp.add(lid);
    lp.position.set(-200, BENCH_H, -3480);
    lp.rotation.y = -0.25;
    scr.userData.keep = true;
    scr.userData.keepWithCad = true;
    mergeObject(lp);
    root.add(lp);
    anchors.laptop = lp;
    // CAD: laptop 14" nhôm (bàn phím rời phím, bản lề) — màn hình canvas dời lên node 'screen' của CAD
    upgradeProp(game, { object: lp }, 'laptop', {
      onLoad(cad) {
        const a = CAD_ANCHORS?.laptop?.anchor_screen;
        if (!a) return;
        const f = cadFrame(a);
        lp.add(scr);
        scr.position.copy(f.p); scr.quaternion.copy(f.q); scr.translateZ(0.35);
        cad.getObjectByName('screen')?.removeFromParent();          // mặt màn CAD → thay bằng màn canvas (gộp tĩnh bỏ qua 'visible')
      },
    });
    interact.push({ object: lp, spec: { name: 'Laptop — CCS C / MPLAB IPE (nạp PIC)', highlight: true, lessonId: 'pic16f877a', prompts: [] } });
  }

  // ------------------------------------------------------------------ thiết bị (props) trên bàn
  function place(name, p, x, y, z, ry = 0) {
    p.object.position.set(x, y, z);
    p.object.rotation.y = ry;
    root.add(p.object);
    props[name] = p;
    if (p.interact) interact.push(...p.interact);
    if (p.sockets) sockets.push(...p.sockets);
    if (p.update) updates.push(p.update);
    for (const [k, v] of Object.entries(p.anchors || {})) if (!anchors[k]) anchors[k] = v;
    return p;
  }
  // Bàn hàn (x −3800…−2000, z −4000…−3200) — bố trí như thợ thật: trạm hàn + giá mũi bên trái, hút khói nghiêng về kẹp mạch,
  // kẹp mạch trên thảm silicone trượt được vào dưới kính hiển vi soi nổi (chân cần sau bàn), kính USB + màn 7" bên phải,
  // đèn kính lúp kẹp mép sau, vật tư hàn (cuộn thiếc, flux, IPA, cọ, hộp phục hồi mũi) góc trái.
  const MT = BENCH_H + 3;                                  // mặt thảm ESD
  const VISE = { x: -2880, z: -3420, slide: 280 };
  place('soldering-station', SolderingStation.build(game), -3520, MT, -3770, 0);
  anchors['station-solder'] = props['soldering-station'].object;
  place('tip-rack', TipRack.build(game), -3500, MT, -3600, 0);
  place('fume-extractor', FumeExtractor.build(game), -3150, MT, -3720, Math.atan2(VISE.x - -3150, VISE.z - -3720));
  anchors['fume-extractor'] = props['fume-extractor'].object;
  {
    // thảm silicone cách nhiệt dưới kẹp mạch (mặt đặt đồ) — CAD có ô vít/khay; mặt chạm tàng hình khi có CAD
    const sm = mk(rbox(550, 5, 350, 2), cadOK ? new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }) : std(0x2f6fb3, 0, 0.8), { x: VISE.x + 140, y: MT + 2.5, z: VISE.z, cast: !cadOK });
    surface(sm, 'bench-solder');
    if (cadOK) decor.add('silicone-mat', { x: VISE.x + 140, y: MT, z: VISE.z, zone: 'solder-small', far: 6000 });
  }
  place('vise', Vise.build(game, { slide: [VISE.slide, 0] }), VISE.x, MT + 5, VISE.z, 0);
  anchors['vise-base'] = props.vise.object;
  place('stereo-microscope', StereoMicroscope.build(game), VISE.x + VISE.slide + 40, MT, VISE.z - 520, 0);
  place('usb-microscope', UsbMicroscope.build(game), -2190, MT, -3770, -0.2);
  if (cadOK) {
    decor.add('helping-hands', { x: -2220, y: MT, z: -3390, ry: -0.5, zone: 'solder-small', far: 6000 });
    for (const [node, x, z, ry] of [['solder_spool_stand', -3735, -3880, 0.2], ['flux_bottle', -3650, -3910, 0], ['ipa_bottle', -3735, -3730, 0],
      ['acid_brush', -3670, -3690, 0.7], ['tip_tinner', -3365, -3610, 0], ['sponge_spare', -3640, -3820, 0.3]]) {
      decor.add('solder-consumables', { node, x, y: MT, z, ry, zone: 'solder-small', far: 6000 });
    }
  }
  place('bench-psu', BenchPsu.build(game), -1180, MT, -3740, 0.08);
  anchors.psu = props['bench-psu'].object;
  place('oscilloscope', Oscilloscope.build(game), -770, MT, -3760, 0);
  anchors.scope = props.oscilloscope.object;
  if (cadOK) {
    decor.add('multimeter', { x: -1420, y: MT, z: -3790, ry: 0.25, zone: 'test-small', far: 6000 });
    decor.add('parts-box', { x: -1350, y: MT, z: -3520, ry: 0.05, zone: 'test-small', far: 6000 });
    decor.add('parts-box', { x: -1150, y: MT, z: -1480, ry: -0.08, zone: 'island-small', far: 6000 });
    decor.add('esd-bags', { x: -2850, y: MT, z: -1470, ry: 0.2, zone: 'island-small', far: 6000 });
  }
  for (const k of ['stereo-microscope', 'usb-microscope']) for (const l of props[k]?.lights || []) lights.push(l);
  anchor('multimeter-spot', -1250, BENCH_H, -3380, 0);
  anchor('pickit-spot', -420, BENCH_H, -3330, 0);
  anchor('assembly-tools', -2600, BENCH_H, -1050, 0);

  // ------------------------------------------------------------------ đèn
  const hemiI = [1.55, 1.1, 0.8, 0.75][q];
  const hemi = new THREE.HemisphereLight(0xf0f4ff, 0x8c8478, hemiI);
  hemi.position.set(0, RH, 0);
  root.add(hemi); lights.push(hemi);
  // [2026-10] "Mặt trời" = SpotLight đặt xa ngoài cửa sổ Đông (không suy giảm theo khoảng cách → tia gần song song như nắng),
  // nón chỉ phủ 2 ô cửa + vệt nắng trên sàn: phần phòng phía Tây không nhận nắng trực tiếp (đúng thực tế) và pass bóng chỉ vẽ
  // vật trong nón → rẻ hơn nhiều so với DirectionalLight phủ cả phòng (60 fps ở 'high' trên M1 Pro).
  const sunTarget = new THREE.Object3D(); sunTarget.position.set(3300, 800, -1350);
  root.add(sunTarget);
  const sunDir = V(11500, 8200, -1000).normalize();
  const sun = new THREE.SpotLight(0xfff0d8, q === 0 ? 1.6 : 2.4, 0, 0.2, 0.35, 0);
  sun.name = 'sun';
  sun.position.copy(sunTarget.position).addScaledVector(sunDir, 16000);
  sun.target = sunTarget;
  sun.castShadow = q >= 1;
  sun.shadow.camera.near = 9000; sun.shadow.camera.far = 24000;
  sun.shadow.mapSize.set([1024, 1024, 2048, 4096][q], [1024, 1024, 2048, 4096][q]);
  sun.shadow.bias = -0.00015; sun.shadow.normalBias = 2.5;
  sun.userData.shadowPriority = 10;
  root.add(sun); lights.push(sun);
  // tấm LED trần: RectAreaLight (không đổ bóng) theo chất lượng
  if (nRect > 0) {
    try { RectAreaLightUniformsLib.init(); } catch (err) { console.warn('[labRoom] RectAreaLightUniformsLib', err); }
    for (let i = 0; i < nRect; i++) {
      const [x, z] = rectSpots[i];
      const r = new THREE.RectAreaLight(0xf4f6ff, 16, 1200, 600);
      r.position.set(x, RH - 16, z);
      r.lookAt(x, 0, z);
      root.add(r); lights.push(r);
      add(new THREE.BoxGeometry(1240, 14, 640), M.alu, { x, y: RH - 7, z }, false);
      BN.add(new THREE.PlaneGeometry(1200, 600), M.panel, { x, y: RH - 15, z, rx: Math.PI / 2 }, { castShadow: false });
    }
  } else {
    // chất lượng thấp: 2 đèn điểm không bóng thay cho đèn trần
    for (const [x, z] of [[-1800, -2600], [1800, 800]]) { const p = new THREE.PointLight(0xf4f6ff, 1.1e7, 9000, 2); p.position.set(x, RH - 200, z); root.add(p); lights.push(p); }
  }
  if (q >= 2) {
    const sp = new THREE.SpotLight(0xfff4e6, 2.8e6, 6000, 0.8, 0.65, 2);
    sp.position.set(-2900, 2350, -3480);                 // trong đèn treo LED trên bàn hàn (_dressing.js)
    const t = new THREE.Object3D(); t.position.set(-2900, BENCH_H, -3560); root.add(t); sp.target = t;
    sp.castShadow = true; sp.shadow.mapSize.set(1024, 1024); sp.shadow.bias = -0.0004; sp.shadow.normalBias = 2;
    sp.shadow.camera.near = 300; sp.shadow.camera.far = 4000;
    sp.userData.shadowPriority = 5;
    root.add(sp); lights.push(sp);
  }
  if (q >= 3) {
    const sp = new THREE.SpotLight(0xfff4e6, 2.7e6, 6000, 0.8, 0.65, 2);
    sp.position.set(-600, 2350, -3480);
    const t = new THREE.Object3D(); t.position.set(-600, BENCH_H, -3560); root.add(t); sp.target = t;
    sp.castShadow = true; sp.shadow.mapSize.set(2048, 2048); sp.shadow.bias = -0.0004; sp.shadow.normalBias = 2;
    sp.userData.shadowPriority = 4;
    root.add(sp); lights.push(sp);
  }

  // ------------------------------------------------------------------ bày biện thật (world/_dressing.js): bồn rửa + góc an toàn,
  // biển báo tiếng Việt, bảng ghim tài liệu, cây xanh, thùng rác điện tử, tủ dụng cụ, thảm sàn ESD, máng cáp, đèn treo bàn,
  // ánh sáng cửa sổ, bóng che khuất (AO) dán sàn/chân tường, vách khu thử robot
  try {
    buildSetDressing({ game, root, add, B, BN, M, q, mk, rbox, tube, std, anchor, surface, colliders, surfaces, lights, anchors, interact, updates, decor, cadOK, box3, ROOM, BENCH_H, BENCHES, RACK_A, RACK_B, COUNTER, TEST, DOOR });
  } catch (err) { console.warn('[labRoom] bày biện lỗi', err); }

  // ------------------------------------------------------------------ gộp tĩnh
  root.add(B.build());
  const nos = BN.build();
  nos.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  root.add(nos);

  // ------------------------------------------------------------------ vật bày sẵn (chỉ id có trong registry)
  const has = (id) => { try { return !!(game?.items?.get?.(id) || getItemDef(id)); } catch { return false; } };
  const want = [
    ['flux-pen', -3480, -3420, 0.4], ['solder-wick', -3330, -3380, 0], ['desolder-pump', -3200, -3330, 0.25],
    ['screwdriver-ph0', -2600, -1050, 1.3], ['crimper', -1750, -1180, -0.4], ['hot-glue-gun', -1250, -1300, 0.6],
    ['pickit3', -420, -3330, -0.3],
    ['perfboard-9x15', null, null, 0, 'shelf-B2'], ['breadboard-830', -2950, -1250, 0.05], ['esp32-s3-devkitc-1', -2150, -1250, 0],
    ['dip40-socket', -2750, -950, 0], ['pic16f877a', -2650, -950, 0],
  ];
  for (const [id, x, z, rotY, at] of want) {
    if (!has(id)) continue;
    if (at && anchors[at]) { const p = anchors[at].getWorldPosition(new THREE.Vector3()); items.push({ id, pos: [p.x, p.y + 2, p.z], rotY: anchors[at].rotation.y, drop: true }); }
    else items.push({ id, pos: [x, BENCH_H + 1, z], rotY, drop: true });
  }

  // ------------------------------------------------------------------ đăng ký tương tác + khe
  registerInteractions(game, interact);
  registerSockets(game, sockets);

  // ------------------------------------------------------------------ điểm xuất phát: trong cửa, nhìn về các bàn
  const spawnPos = [2900, 0, 3000];
  const look = [-1600, -2600];
  const yaw = Math.atan2(-(look[0] - spawnPos[0]), -(look[1] - spawnPos[2]));   // forward = (−sin yaw, −cos yaw)
  root.updateMatrixWorld(true);

  // đồ trang trí CAD: khi mọi GLB nạp xong → gộp theo vùng (StaticBatch) — chỉ trình duyệt
  const decorReady = decor.finish().then((n) => { game?.events?.emit?.('world:decor-ready', { drawCalls: n }); return n; }).catch((err) => console.warn('[labRoom] decor', err));
  function update(dt = 1 / 60) {
    for (const u of updates) u(dt);
    decor.update(dt, game?.camera);                       // LOD: ẩn vùng đồ nhỏ khi ở xa
  }
  const stats = sceneStats(root);
  return {
    root, colliders, surfaces, lights, anchors, props, items, interact, sockets, update, stats,
    decorReady, cadStatus: () => ({ ...CAD_STATUS, failed: [...CAD_STATUS.failed], decorZones: decor.zones.size, stats: sceneStats(root) }),
    seats,                 // [UX ghế] Object3D có userData.seat (engine/ux/seating.js)
    spawn: { pos: spawnPos, yaw, pitch: -0.08 },
    bounds: box3(X0, 0, Z0, X1, RH, Z1),
    benches: BENCHES,
    registered: true,      // tương tác & khe đã đăng ký với game.interact / game.sockets
  };
}

export default { build };
