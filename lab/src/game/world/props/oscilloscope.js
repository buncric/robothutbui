// Máy hiện sóng số 4 kênh 100 MHz (không nhãn hãng): màn 7" (CanvasTexture), núm VOLTS/DIV + POSITION mỗi kênh,
// núm TIME/DIV, TRIGGER LEVEL, phím chức năng, 4 cổng BNC màu theo kênh, cọc bù que đo (1 kHz), tay xách, chân gập.
// Dữ liệu: game.events 'scope:data' { ch:1..4, samples:number[] (V), vdiv?, tdiv?, label? } hoặc { channels:[…] };
// 'scope:clear' xoá. Không có dữ liệu → đường nền phẳng của các kênh đang bật. E = bật/tắt máy.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvasPlane, text, roundRect, hasDoc } from '../_tex.js';
import { mergeObject } from '../_merge.js';
import { labState, emit, play } from '../_labState.js';
import { upgradeProp, markRest } from '../_cad.js';

const W = 330, H = 165, D = 125;
const COLORS = ['#ffd84a', '#3fd9ff', '#ff5ad1', '#4a7dff'];
const std = (color, metalness, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
const M = (g, m, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, cast = true } = {}) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = cast; o.receiveShadow = true; return o; };
const rbox = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01));

const fmtV = (v) => (v >= 1 ? `${v}V` : `${Math.round(v * 1000)}mV`);
const fmtT = (t) => (typeof t === 'string' ? t : t >= 1e-3 ? `${+(t * 1e3).toFixed(2)}ms` : `${+(t * 1e6).toFixed(2)}µs`);

function drawScreen(g, Wp, Hp, S) {
  g.fillStyle = '#03080d'; g.fillRect(0, 0, Wp, Hp);
  if (!S.on) return;
  const top = Hp * 0.08, bot = Hp * 0.9, left = Wp * 0.02, right = Wp * 0.98;
  const gw = right - left, gh = bot - top;
  // lưới 10 × 8 ô
  g.strokeStyle = 'rgba(140,170,200,.22)'; g.lineWidth = 1;
  for (let i = 0; i <= 10; i++) { const x = left + (gw * i) / 10; g.beginPath(); g.moveTo(x, top); g.lineTo(x, bot); g.stroke(); }
  for (let j = 0; j <= 8; j++) { const y = top + (gh * j) / 8; g.beginPath(); g.moveTo(left, y); g.lineTo(right, y); g.stroke(); }
  g.strokeStyle = 'rgba(140,170,200,.4)';
  for (let i = 0; i <= 50; i++) { const x = left + (gw * i) / 50; g.beginPath(); g.moveTo(x, top + gh / 2 - 3); g.lineTo(x, top + gh / 2 + 3); g.stroke(); }
  // vết
  S.ch.forEach((c, i) => {
    if (!c.enabled) return;
    const y0 = top + gh / 2 - (c.offset / 4) * (gh / 2);
    g.strokeStyle = COLORS[i]; g.lineWidth = 2; g.shadowColor = COLORS[i]; g.shadowBlur = 6;
    g.beginPath();
    const n = c.samples?.length || 0;
    if (n >= 2) {
      for (let k = 0; k < n; k++) {
        const x = left + (gw * k) / (n - 1);
        const y = Math.max(top, Math.min(bot, y0 - (c.samples[k] / c.vdiv) * (gh / 8)));
        k ? g.lineTo(x, y) : g.moveTo(x, y);
      }
    } else { g.moveTo(left, y0); g.lineTo(right, y0); }
    g.stroke(); g.shadowBlur = 0;
    g.fillStyle = COLORS[i];
    g.beginPath(); g.moveTo(left, y0); g.lineTo(left - 8, y0 - 6); g.lineTo(left - 8, y0 + 6); g.fill();
  });
  // chữ trạng thái
  text(g, 'RVL DS-1104 · 100 MHz · 1 GSa/s', Wp * 0.02, Hp * 0.04, { size: Hp * 0.045, color: '#cfd6de', bold: true });
  text(g, `${S.running ? 'RUN' : 'STOP'}`, Wp * 0.62, Hp * 0.04, { size: Hp * 0.045, color: S.running ? '#3dff6a' : '#ff4a3a', bold: true });
  text(g, `H ${fmtT(S.tdiv)}`, Wp * 0.98, Hp * 0.04, { size: Hp * 0.045, color: '#ffffff', align: 'right', bold: true });
  S.ch.forEach((c, i) => {
    const x = Wp * (0.02 + i * 0.2);
    g.fillStyle = c.enabled ? COLORS[i] : '#333a42'; roundRect(g, x, Hp * 0.925, Wp * 0.18, Hp * 0.06, 4); g.fill();
    text(g, `${i + 1}  ${fmtV(c.vdiv)}${c.label ? ` ${c.label}` : ''}`, x + Wp * 0.01, Hp * 0.955, { size: Hp * 0.042, color: '#05080b', bold: true, maxW: Wp * 0.16 });
  });
  text(g, `T ${S.trigLevel.toFixed(2)}V ↑`, Wp * 0.98, Hp * 0.955, { size: Hp * 0.042, color: '#ffd84a', align: 'right', bold: true });
  if (!S.ch.some((c) => c.samples?.length)) text(g, 'Chưa có tín hiệu — kẹp que đo vào điểm cần xem', Wp / 2, Hp * 0.3, { size: Hp * 0.045, color: 'rgba(200,210,220,.6)', align: 'center' });
}

export function build(game) {
  const lab = labState(game);
  const S = {
    on: false, running: true, tdiv: 1e-3, trigLevel: 1.0, t: 0, dirty: true,
    ch: [0, 1, 2, 3].map((i) => ({ enabled: i < 2, vdiv: i ? 1 : 2, offset: i ? -2 : 1.5, samples: null, label: '', age: 99 })),
  };
  lab.scope = S;
  const K = {
    shell: new THREE.MeshPhysicalMaterial({ color: 0xdfe2e6, roughness: 0.45, clearcoat: 0.25 }),
    dark: std(0x2b2f35, 0, 0.45), black: std(0x15171a, 0, 0.45), grey: std(0x8a9099, 0, 0.45), chrome: std(0xdfe3e8, 1, 0.16), rubber: std(0x1f2124, 0, 0.9),
    btn: std(0x3a3f46, 0, 0.4),
  };
  const root = new THREE.Group();
  root.name = 'oscilloscope';
  const body = new THREE.Group();
  root.add(body);
  body.add(M(rbox(W, H, D, 8), K.shell, { y: H / 2 + 8 }));
  body.add(M(rbox(W + 4, H + 4, 10, 5), K.dark, { y: H / 2 + 8, z: D / 2 - 2 }));
  body.add(M(rbox(W - 40, H - 30, 40, 10), K.shell, { y: H / 2 + 8, z: -D / 2 - 18 }));          // lưng nhô (nguồn)
  for (const sx of [-1, 1]) {
    body.add(M(rbox(24, 10, 20, 3), K.rubber, { x: sx * (W / 2 - 30), y: 5, z: D / 2 - 18 }));
    body.add(M(rbox(24, 10, 20, 3), K.rubber, { x: sx * (W / 2 - 30), y: 5, z: -D / 2 + 18 }));
    body.add(M(new THREE.BoxGeometry(8, 22, 8), K.dark, { x: sx * (W / 2 - 30), y: 4, z: D / 2 + 4, rx: -0.6 }));   // chân gập
  }
  const hc = new THREE.CatmullRomCurve3([new THREE.Vector3(-W / 2 + 4, H / 2 + 8, 10), new THREE.Vector3(-W / 2 - 14, H / 2 + 60, 0), new THREE.Vector3(-W / 2 - 4, H + 30, -10)]);
  body.add(M(new THREE.TubeGeometry(hc, 16, 5, 8), K.dark));
  // mặt trước
  const front = new THREE.Group();
  front.position.set(0, 8, D / 2 + 3.1);
  body.add(front);
  const face = canvasPlane(W, H, (g, Wp, Hp) => {
    const k = Wp / W;
    g.fillStyle = '#2b2f35'; g.fillRect(0, 0, Wp, Hp);
    g.fillStyle = '#353a41'; g.fillRect(205 * k, 0, 125 * k, Hp);
    text(g, 'VERTICAL', 268 * k, 100 * k, { size: 3.4 * k, color: '#cfd6de', align: 'center', bold: true });
    text(g, 'HORIZONTAL', 236 * k, 12 * k, { size: 3.4 * k, color: '#cfd6de', align: 'center', bold: true });
    text(g, 'TRIGGER', 304 * k, 12 * k, { size: 3.4 * k, color: '#cfd6de', align: 'center', bold: true });
    ['CH1', 'CH2', 'CH3', 'CH4'].forEach((c, i) => text(g, c, (220 + i * 28) * k, 133 * k, { size: 3.2 * k, color: COLORS[i], align: 'center', bold: true }));
    text(g, 'CAT I 300V ⚠', 270 * k, 160 * k, { size: 2.6 * k, color: '#ffcf5a', align: 'center' });
    text(g, '1kHz ⊓ 3V', 186 * k, 150 * k, { size: 2.6 * k, color: '#cfd6de', align: 'center' });
  }, { pxPerMm: 4, maxPx: 1320, fallback: '#2b2f35', rough: 0.5 });
  face.position.set(0, H / 2, 0);
  face.castShadow = false;
  front.add(face);
  const scr = canvasPlane(160, 96, (g, Wp, Hp) => drawScreen(g, Wp, Hp, S), { pxPerMm: 4, maxPx: 640, fallback: '#03080d', emissive: true });
  scr.position.set(-62, 92, 0.6);
  front.add(scr);
  front.add(M(rbox(170, 106, 3, 3), K.black, { x: -62, y: 92, z: -0.6, cast: false }));
  const glass = M(new THREE.PlaneGeometry(160, 96), new THREE.MeshPhysicalMaterial({ color: 0x223344, roughness: 0.04, transparent: true, opacity: 0.16, clearcoat: 1 }), { x: -62, y: 92, z: 1.6, cast: false });
  glass.userData.keepWithCad = true;
  front.add(glass);
  // phím mềm cạnh màn hình + phím chức năng
  for (let i = 0; i < 5; i++) front.add(M(rbox(10, 7, 4, 1.5), K.btn, { x: 26, y: 132 - i * 16, z: 2 }));
  for (let i = 0; i < 6; i++) front.add(M(rbox(16, 6, 4, 1.5), K.btn, { x: -130 + i * 24, y: 28, z: 2 }));
  // núm: 4 kênh (VOLTS/DIV lớn + POSITION nhỏ), TIME/DIV, TRIGGER LEVEL, đa năng
  const knobGeo = (r, h) => { const g = new THREE.LatheGeometry([[0, 0], [r, 0], [r * 1.04, h * 0.15], [r, h * 0.3], [r * 0.9, h], [0, h]].map(([a, b]) => new THREE.Vector2(a, b)), 32); g.rotateX(Math.PI / 2); return g; };
  const big = knobGeo(8, 12), small = knobGeo(5.5, 10);
  for (let i = 0; i < 4; i++) {
    front.add(M(big, K.black, { x: 220 - W / 2 + i * 28 + 165 - 165, y: 80, z: 0 }));
    front.add(M(small, K.black, { x: 220 - W / 2 + i * 28, y: 108, z: 0 }));
    front.add(M(rbox(12, 6, 4, 1.5), new THREE.MeshStandardMaterial({ color: COLORS[i], roughness: 0.4, emissive: COLORS[i], emissiveIntensity: 0.25 }), { x: 220 - W / 2 + i * 28, y: 60, z: 2 }));
  }
  front.add(M(knobGeo(11, 14), K.black, { x: 236 - W / 2, y: 132, z: 0 }));
  front.add(M(knobGeo(7, 11), K.black, { x: 236 - W / 2 + 22, y: 140, z: 0 }));
  front.add(M(knobGeo(9, 12), K.black, { x: 304 - W / 2, y: 132, z: 0 }));
  front.add(M(knobGeo(7, 11), K.black, { x: 26, y: 46, z: 0 }));
  // BNC ×4
  for (let i = 0; i < 4; i++) {
    const x = 220 - W / 2 + i * 28;
    front.add(M(new THREE.CylinderGeometry(7.5, 7.5, 2, 24), new THREE.MeshStandardMaterial({ color: COLORS[i], roughness: 0.4 }), { x, y: 22, z: 1, rx: Math.PI / 2 }));
    front.add(M(new THREE.CylinderGeometry(5.2, 5.2, 12, 20), K.chrome, { x, y: 22, z: 6, rx: Math.PI / 2 }));
    front.add(M(new THREE.CylinderGeometry(3.6, 3.6, 12.2, 16), K.black, { x, y: 22, z: 6, rx: Math.PI / 2 }));
    for (const s of [-1, 1]) front.add(M(new THREE.CylinderGeometry(0.9, 0.9, 3, 8), K.chrome, { x: x + s * 6, y: 22, z: 9 }));
  }
  // cọc bù que + nút nguồn
  front.add(M(new THREE.BoxGeometry(2, 9, 6), K.chrome, { x: 186 - W / 2, y: 22, z: 3 }), M(new THREE.BoxGeometry(2, 9, 6), K.chrome, { x: 196 - W / 2, y: 22, z: 3 }));
  const pwrMat = std(0x2a2d31, 0, 0.35, { emissive: 0x3dff6a, emissiveIntensity: 0 });
  const pwr = M(new THREE.CylinderGeometry(6, 6, 4, 20), pwrMat, { x: -W / 2 + 18, y: 14, z: 2, rx: Math.PI / 2 });
  pwr.userData.dynamic = true;
  markRest(pwr);
  front.add(pwr);
  for (const o of [face, scr]) { o.userData.keep = true; o.userData.keepWithCad = true; }
  mergeObject(body);

  const toggle = () => { S.on = !S.on; S.dirty = true; play(game, 'click'); emit(game, S.on ? 'power:on' : 'power:off', { source: 'scope' }); };
  const interact = [
    { object: body, spec: { name: () => `Máy hiện sóng 4 kênh (${S.on ? 'bật' : 'tắt'})`, highlight: true, prompts: [{ key: 'E', label: 'Bật / tắt máy hiện sóng', do: toggle }, { key: 'R', label: 'RUN / STOP', when: () => S.on, do: () => { S.running = !S.running; S.dirty = true; } }] } },
    { object: pwr, spec: { name: 'Nút nguồn máy hiện sóng', highlight: true, prompts: [{ key: 'E', label: 'Bật / tắt', do: toggle }] } },
  ];
  const onData = (e) => {
    if (!e || !S.running) return;
    const list = Array.isArray(e.channels) ? e.channels : [e];
    for (const d of list) {
      const c = S.ch[(d.ch || 1) - 1];
      if (!c) continue;
      if (d.samples) c.samples = Array.from(d.samples);
      if (d.vdiv) c.vdiv = d.vdiv;
      if (d.offset !== undefined) c.offset = d.offset;
      if (d.label !== undefined) c.label = d.label;
      c.enabled = true; c.age = 0;
    }
    if (e.tdiv) S.tdiv = e.tdiv;
    if (e.trigLevel !== undefined) S.trigLevel = e.trigLevel;
    S.dirty = true;
  };
  const onClear = () => { S.ch.forEach((c) => { c.samples = null; }); S.dirty = true; };
  game?.events?.on?.('scope:data', onData);
  game?.events?.on?.('scope:clear', onClear);

  let drawT = 0;
  function update(dt = 1 / 60) {
    pwrMat.emissiveIntensity = S.on ? 1.8 : 0;
    drawT -= dt;
    if (S.dirty && drawT <= 0 && hasDoc()) {
      drawT = 1 / 15;
      S.dirty = false;
      scr.userData.redraw((g, Wp, Hp) => drawScreen(g, Wp, Hp, S));
    }
  }
  const prop = { object: root, interact, sockets: [], update, anchors: { 'scope-screen': scr }, size: [W, H + 30, D + 40], dispose() { game?.events?.off?.('scope:data', onData); game?.events?.off?.('scope:clear', onClear); } };
  // hình CAD (cad/src/lab/oscilloscope.py — cùng khung): vỏ, viền, lưng, quai, núm, BNC, phím; mặt in + màn hình giữ của JS
  prop.cadReady = upgradeProp(game, prop, 'oscilloscope', { seat: { switch_power: pwr, scope_root: body }, material: { switch_power: pwrMat } });
  return prop;
}

export default { id: 'oscilloscope', name: 'Máy hiện sóng 4 kênh', build };
