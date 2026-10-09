// Nguồn DC phòng thí nghiệm 2 kênh 0–30 V / 0–5 A (không nhãn hãng): mỗi kênh có màn V (đỏ) + A (xanh) 7 đoạn,
// đèn CV/CC, núm V và núm giới hạn dòng I, nút OUTPUT có đèn, cọc chuối + (đỏ) / − (đen); cọc GND (xanh lá) chung;
// công tắc nguồn chính. Cọc chuối là socket kind 'banana'.
// Tải: labState(game).psu.setLoad(ch, ohms) hoặc sự kiện 'psu:load' { ch, ohms } (Infinity = hở mạch, 0 = chập).
// Mô hình CV/CC: I = V/R; nếu I > I_lim → CC (I = I_lim, V = I_lim·R) — chập mạch chỉ chảy đúng I_lim.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvasPlane, drawSeg7, text, roundRect, hasDoc } from '../_tex.js';
import { mergeObject } from '../_merge.js';
import { labState, emit, play, toast } from '../_labState.js';
import { upgradeProp, markRest } from '../_cad.js';

const W = 260, H = 150, D = 300;
const std = (color, metalness, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
const M = (g, m, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, cast = true } = {}) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = cast; o.receiveShadow = true; return o; };
const rbox = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

const LAYOUT = {
  disp: { x: -45, y: 109, w: 160, h: 54 },
  ch: [
    { knobV: [-108, 46], knobI: [-74, 46], ledCV: [-112, 69], ledCC: [-70, 69], out: [45, 74], pos: [-112, 16], neg: [-86, 16] },
    { knobV: [-18, 46], knobI: [16, 46], ledCV: [-22, 69], ledCC: [20, 69], out: [80, 74], pos: [-6, 16], neg: [20, 16] },
  ],
  gnd: [-48, 16],
  power: [104, 18],
};

function drawFace(g, Wp, Hp) {
  const k = Wp / W;
  const X = (x) => (x + W / 2) * k, Y = (y) => (H - y) * k;
  g.fillStyle = '#d9dde2'; g.fillRect(0, 0, Wp, Hp);
  g.fillStyle = '#c3c8ce'; g.fillRect(X(32), 0, (W / 2 - 32) * k, Hp);
  text(g, 'RVL DP-3005D', X(62), Y(138), { size: 7 * k, color: '#1b1d21', align: 'center', bold: true });
  text(g, 'DC POWER SUPPLY · 2 × 30 V / 5 A', X(62), Y(128), { size: 3.3 * k, color: '#444a52', align: 'center' });
  ['CH1', 'CH2'].forEach((c, i) => {
    const L = LAYOUT.ch[i];
    text(g, 'VOLTAGE', X(L.knobV[0]), Y(L.knobV[1] - 17), { size: 2.8 * k, color: '#1b1d21', align: 'center', bold: true });
    text(g, 'CURRENT', X(L.knobI[0]), Y(L.knobI[1] - 17), { size: 2.8 * k, color: '#1b1d21', align: 'center', bold: true });
    text(g, 'CV', X(L.ledCV[0] + 7), Y(L.ledCV[1]), { size: 3 * k, color: '#1b1d21', bold: true });
    text(g, 'CC', X(L.ledCC[0] - 7), Y(L.ledCC[1]), { size: 3 * k, color: '#1b1d21', align: 'right', bold: true });
    text(g, c, X((L.knobV[0] + L.knobI[0]) / 2), Y(L.ledCV[1]), { size: 4 * k, color: i ? '#1d5fbf' : '#c62f2a', align: 'center', bold: true });
    text(g, `OUT ${c}`, X(L.out[0]), Y(L.out[1] - 12), { size: 2.8 * k, color: '#1b1d21', align: 'center', bold: true });
    text(g, '+', X(L.pos[0]), Y(L.pos[1] + 11), { size: 4.5 * k, color: '#c62f2a', align: 'center', bold: true });
    text(g, '−', X(L.neg[0]), Y(L.neg[1] + 11), { size: 4.5 * k, color: '#1b1d21', align: 'center', bold: true });
    g.strokeStyle = i ? '#1d5fbf' : '#c62f2a'; g.lineWidth = 0.6 * k;
    roundRect(g, X(L.pos[0] - 10), Y(L.pos[1] + 16), 46 * k, 26 * k, 2 * k); g.stroke();
  });
  text(g, '⏚ GND', X(LAYOUT.gnd[0]), Y(LAYOUT.gnd[1] + 11), { size: 3 * k, color: '#1b7a3a', align: 'center', bold: true });
  text(g, 'POWER', X(LAYOUT.power[0]), Y(LAYOUT.power[1] + 14), { size: 3 * k, color: '#1b1d21', align: 'center', bold: true });
  text(g, '⚠ Đặt giới hạn dòng TRƯỚC khi bật OUTPUT', X(62), Y(100), { size: 2.6 * k, color: '#a8321e', align: 'center', bold: true });
}

function drawDisplay(g, Wp, Hp, chs, mainOn) {
  g.fillStyle = '#05070a'; g.fillRect(0, 0, Wp, Hp);
  if (!mainOn) return;
  const half = Wp / 2;
  chs.forEach((c, i) => {
    const x0 = i * half;
    g.strokeStyle = 'rgba(120,140,160,.25)'; g.lineWidth = 2;
    if (i) { g.beginPath(); g.moveTo(x0, Hp * 0.08); g.lineTo(x0, Hp * 0.92); g.stroke(); }
    const show = c.out ? [c.v, c.i] : [c.vset, c.iset];
    const vs = show[0] >= 10 ? show[0].toFixed(2) : show[0].toFixed(3);
    const is = show[1].toFixed(3);
    const dim = c.out ? 1 : 0.55;
    const red = `rgba(255,52,36,${dim})`, grn = `rgba(60,255,110,${dim})`;
    drawSeg7(g, vs, x0 + half * 0.08, Hp * 0.07, Hp * 0.36, red, 'rgba(255,52,36,.06)', { slant: 0.08 });
    text(g, 'V', x0 + half * 0.93, Hp * 0.3, { size: Hp * 0.13, color: red, align: 'right', bold: true });
    drawSeg7(g, is, x0 + half * 0.08, Hp * 0.53, Hp * 0.36, grn, 'rgba(60,255,110,.06)', { slant: 0.08 });
    text(g, 'A', x0 + half * 0.93, Hp * 0.76, { size: Hp * 0.13, color: grn, align: 'right', bold: true });
    if (!c.out) text(g, 'SET', x0 + half * 0.93, Hp * 0.1, { size: Hp * 0.08, color: '#9aa1ab', align: 'right', bold: true });
  });
}

export function build(game) {
  const lab = labState(game);
  const psu = lab.psu;
  psu.on = true;
  const chans = [
    { vset: 5.0, iset: 0.1, out: false, v: 0, i: 0, mode: 'CV', loadOhms: Infinity },
    { vset: 12.0, iset: 0.5, out: false, v: 0, i: 0, mode: 'CV', loadOhms: Infinity },
  ];
  psu.channels = chans;
  psu.setLoad = (ch, ohms) => { const c = chans[ch - 1] ?? chans[ch]; if (c) c.loadOhms = ohms; };

  const K = {
    shell: new THREE.MeshPhysicalMaterial({ color: 0x3a3f46, roughness: 0.5, metalness: 0.3, clearcoat: 0.15 }),
    black: std(0x17191c, 0, 0.45), rubber: std(0x1f2124, 0, 0.9), chrome: std(0xe0e4e8, 1, 0.15), brass: std(0xd6b05a, 1, 0.28),
    red: std(0xc62f2a, 0, 0.35), blk: std(0x15171a, 0, 0.35), green: std(0x1f8a43, 0, 0.35), grey: std(0x9aa1ab, 0, 0.4), white: std(0xf0f2f4, 0, 0.4),
  };
  const root = new THREE.Group();
  root.name = 'bench-psu';
  const body = new THREE.Group();
  root.add(body);
  body.add(M(rbox(W, H, D, 6), K.shell, { y: H / 2 }));
  body.add(M(rbox(W + 6, H + 6, 14, 4), K.black, { y: H / 2, z: D / 2 - 4 }));                 // khung nhựa trước
  body.add(M(rbox(W + 6, H + 6, 10, 4), K.black, { y: H / 2, z: -D / 2 + 3 }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) body.add(M(new THREE.CylinderGeometry(9, 10, 6, 20), K.rubber, { x: sx * (W / 2 - 25), y: -1, z: sz * (D / 2 - 30) }));
  for (let i = 0; i < 12; i++) for (const sx of [-1, 1]) body.add(M(new THREE.BoxGeometry(1.5, 60, 4), K.black, { x: sx * (W / 2 + 0.3), y: H / 2, z: -110 + i * 18, cast: false }));   // khe gió
  // tay xách
  const handleCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(-90, H, 40), new THREE.Vector3(-90, H + 22, 30), new THREE.Vector3(90, H + 22, 30), new THREE.Vector3(90, H, 40)]);
  body.add(M(new THREE.TubeGeometry(handleCurve, 24, 5, 10), K.black));
  // mặt trước (khung toạ độ: gốc góc dưới-giữa, +Z ra ngoài)
  const front = new THREE.Group();
  front.position.set(0, 0, D / 2 + 3.2);
  body.add(front);
  const face = canvasPlane(W, H, drawFace, { pxPerMm: 4, maxPx: 1100, fallback: '#d9dde2', rough: 0.55 });
  face.position.set(0, H / 2, 0);
  face.castShadow = false;
  front.add(face);
  const L = LAYOUT;
  const disp = canvasPlane(L.disp.w, L.disp.h, (g, Wp, Hp) => drawDisplay(g, Wp, Hp, chans, false), { pxPerMm: 4, maxPx: 720, fallback: '#05070a', emissive: true });
  disp.position.set(L.disp.x, L.disp.y, 0.4);
  front.add(disp);
  front.add(M(rbox(L.disp.w + 8, L.disp.h + 8, 2, 2), K.black, { x: L.disp.x, y: L.disp.y, z: -0.3, cast: false }));
  const glass = M(new THREE.PlaneGeometry(L.disp.w, L.disp.h), new THREE.MeshPhysicalMaterial({ color: 0x223344, roughness: 0.05, transparent: true, opacity: 0.18, clearcoat: 1 }), { x: L.disp.x, y: L.disp.y, z: 1.2, cast: false });
  glass.userData.keepWithCad = true;
  front.add(glass);
  // núm xoay
  const knobGeo = (() => {
    const g = new THREE.LatheGeometry([[0, 0], [13, 0], [13.5, 1.5], [13.5, 4], [12, 5], [11.2, 16], [10, 17.5], [0, 18]].map(([r, y]) => new THREE.Vector2(r, y)), 40);
    g.rotateX(Math.PI / 2);
    return g;
  })();
  const knobs = [], leds = [], outs = [];
  const mkKnob = (x, y) => {
    const k = new THREE.Group();
    k.position.set(x, y, 0);
    k.add(M(knobGeo, K.black));
    k.add(M(new THREE.BoxGeometry(1.4, 7, 0.6), K.white, { y: 6.5, z: 18.2 }));
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; k.add(M(new THREE.BoxGeometry(1.4, 1, 10), K.black, { x: Math.cos(a) * 11.4, y: Math.sin(a) * 11.4, z: 10, rz: a })); }
    mergeObject(k);
    k.userData.dynamic = true;
    markRest(k);
    front.add(k);
    return k;
  };
  const sockets = [];
  const jackPos = {};
  const mkJack = (id, x, y, mat) => {
    const j = new THREE.Group();
    j.position.set(x, y, 0);
    j.add(M(new THREE.CylinderGeometry(7, 7.5, 6, 24), mat, { z: 3, rx: Math.PI / 2 }));
    j.add(M(new THREE.CylinderGeometry(6, 6, 3, 6), mat, { z: 7, rx: Math.PI / 2 }));
    j.add(M(new THREE.CylinderGeometry(2.2, 2.2, 10, 12), K.brass, { z: 9, rx: Math.PI / 2 }));
    j.add(M(new THREE.CylinderGeometry(2.05, 2.05, 0.3, 12), std(0x050505, 0, 1), { z: 14.05, rx: Math.PI / 2 }));
    front.add(j);
    const sock = new THREE.Object3D();
    sock.position.set(0, 0, 14);
    sock.rotation.x = Math.PI / 2;     // +Y của khe = hướng rút phích ra (+Z mặt máy)
    j.add(sock);
    jackPos[id] = sock;
    sockets.push({
      id: `psu-${id}`, name: `cọc ${id === 'gnd' ? 'GND' : `${id.endsWith('pos') ? '+' : '−'} CH${id[2]}`} nguồn bàn`, snapRadius: 20, owner: null, object3D: sock, kind: 'banana',
      polarity: id.endsWith('pos') ? '+' : id === 'gnd' ? 'gnd' : '-', channel: id.startsWith('ch') ? +id[2] : 0,
      accepts: (item) => (item?.def?.plug === 'banana' || /banana|lead|chuoi/.test(String(item?.def?.id || '')) ? { ok: true, orientation: 'ok' } : { ok: false, reason: 'Cọc chuối 4 mm — chỉ cắm phích chuối' }),
      pose: new THREE.Matrix4(),          // tương đối object3D (engine/sockets.js): object3D = gốc item khi cắm
      tolerance: { pos: 6, angleDeg: 20 },
      onInsert(item) { play(game, 'snap', { vol: 0.5 }); emit(game, 'wire:connected', { a: `psu-${id}`, b: item }); },
      onRemove(item) { emit(game, 'wire:disconnected', { a: `psu-${id}`, b: item }); },
      occupiedBy: null,
    });
  };
  chans.forEach((c, i) => {
    const P = L.ch[i];
    knobs.push({ v: mkKnob(...P.knobV), i: mkKnob(...P.knobI) });
    const ledM = (col) => std(0x101010, 0, 0.3, { emissive: col, emissiveIntensity: 0 });
    const cv = M(new THREE.CylinderGeometry(2.4, 2.4, 2, 14), ledM(0x2aff5a), { x: P.ledCV[0], y: P.ledCV[1], z: 1, rx: Math.PI / 2 });
    const cc = M(new THREE.CylinderGeometry(2.4, 2.4, 2, 14), ledM(0xff3322), { x: P.ledCC[0], y: P.ledCC[1], z: 1, rx: Math.PI / 2 });
    cv.userData.keep = cc.userData.keep = true;
    cv.userData.keepWithCad = cc.userData.keepWithCad = true;
    front.add(cv, cc);
    leds.push({ cv, cc });
    const btnMat = std(0x2a2d31, 0, 0.35, { emissive: 0x3aa0ff, emissiveIntensity: 0 });
    const btn = M(rbox(22, 11, 6, 2), btnMat, { x: P.out[0], y: P.out[1], z: 3 });
    btn.userData.dynamic = true;
    markRest(btn);
    front.add(btn);
    outs.push(btn);
    mkJack(`ch${i + 1}-pos`, ...P.pos, K.red);
    mkJack(`ch${i + 1}-neg`, ...P.neg, K.blk);
  });
  mkJack('gnd', ...L.gnd, K.green);
  // công tắc nguồn
  const pwr = M(rbox(18, 12, 7, 2), std(0x2a2d31, 0, 0.35, { emissive: 0xff7a1a, emissiveIntensity: 0.9 }), { x: L.power[0], y: L.power[1], z: 3.5 });
  pwr.userData.dynamic = true;
  markRest(pwr);
  front.add(pwr);
  for (const o of [face, disp]) { o.userData.keep = true; o.userData.keepWithCad = true; }
  mergeObject(body);

  // ------------------------------------------------------------ điều khiển
  const changed = (ch) => emit(game, 'psu:changed', { ch: ch + 1, ...chans[ch] });
  const setV = (ch, v) => { chans[ch].vset = clamp(Math.round(v * 100) / 100, 0, 30); play(game, 'click', { vol: 0.12 }); changed(ch); };
  const setI = (ch, a) => { chans[ch].iset = clamp(Math.round(a * 1000) / 1000, 0, 5); play(game, 'click', { vol: 0.12 }); changed(ch); };
  const toggleOut = (ch) => {
    if (!psu.on) { toast(game, 'Nguồn chính đang tắt'); return; }
    const c = chans[ch];
    c.out = !c.out;
    play(game, 'click');
    emit(game, c.out ? 'power:on' : 'power:off', { source: 'psu', ch: ch + 1, v: c.vset, ilim: c.iset });
    if (c.out && c.iset > 1) toast(game, `CH${ch + 1}: giới hạn dòng ${c.iset.toFixed(2)} A khá cao — mạch mới nên để 0.05–0.3 A`);
    changed(ch);
  };
  const interact = [];
  chans.forEach((c, i) => {
    interact.push({ object: knobs[i].v, spec: {
      name: () => `CH${i + 1} · núm điện áp · đặt ${chans[i].vset.toFixed(2)} V`, highlight: true,
      prompts: [{ key: 'LMB', label: 'Giữ & kéo: chỉnh điện áp (cuộn ±0.1 V)', drag: true, do: () => setV(i, chans[i].vset + 1) }, { key: 'R', label: '−1 V', do: () => setV(i, chans[i].vset - 1) }],
      onScroll: (ctx, d) => setV(i, chans[i].vset + Math.sign(d) * 0.1),
      onDrag: (ctx, dx) => setV(i, chans[i].vset + dx * 0.02),
    } });
    interact.push({ object: knobs[i].i, spec: {
      name: () => `CH${i + 1} · núm giới hạn dòng · ${chans[i].iset.toFixed(3)} A`, highlight: true,
      prompts: [{ key: 'LMB', label: 'Giữ & kéo: chỉnh giới hạn dòng (cuộn ±0.01 A)', drag: true, do: () => setI(i, chans[i].iset + 0.1) }, { key: 'R', label: '−0.1 A', do: () => setI(i, chans[i].iset - 0.1) }],
      onScroll: (ctx, d) => setI(i, chans[i].iset + Math.sign(d) * 0.01),
      onDrag: (ctx, dx) => setI(i, chans[i].iset + dx * 0.002),
    } });
    interact.push({ object: outs[i], spec: {
      name: () => `CH${i + 1} · OUTPUT ${chans[i].out ? 'ĐANG BẬT' : 'tắt'}`, highlight: true,
      prompts: [{ key: 'E', label: 'Bật / tắt ngõ ra', do: () => toggleOut(i) }],
    } });
  });
  interact.push({ object: pwr, spec: {
    name: () => `Công tắc nguồn chính (${psu.on ? 'bật' : 'tắt'})`, highlight: true,
    prompts: [{ key: 'E', label: 'Bật / tắt máy', do: () => {
      psu.on = !psu.on; play(game, 'click');
      if (!psu.on) chans.forEach((c, i) => { if (c.out) { c.out = false; emit(game, 'power:off', { source: 'psu', ch: i + 1 }); } });
    } }],
  } });
  const onLoad = (e) => { if (e) psu.setLoad(e.ch, e.ohms); };
  game?.events?.on?.('psu:load', onLoad);

  let dispT = 0, lastKey = '';
  function update(dt = 1 / 60) {
    chans.forEach((c, i) => {
      const prev = c.mode;
      if (!psu.on || !c.out) { c.v = 0; c.i = 0; c.mode = 'CV'; }
      else {
        const R = c.loadOhms;
        const Iideal = R > 0 ? c.vset / R : Infinity;
        if (Iideal > c.iset) { c.mode = 'CC'; c.i = c.iset; c.v = Number.isFinite(R) ? c.iset * R : c.vset; }
        else { c.mode = 'CV'; c.v = c.vset; c.i = Number.isFinite(Iideal) ? Iideal : 0; }
      }
      if (prev !== c.mode && c.out) emit(game, 'psu:mode', { ch: i + 1, mode: c.mode, v: c.v, i: c.i });
      const on = psu.on && c.out;
      leds[i].cv.material.emissiveIntensity = on && c.mode === 'CV' ? 2 : 0;
      leds[i].cc.material.emissiveIntensity = on && c.mode === 'CC' ? 2.4 : 0;
      outs[i].material.emissiveIntensity = on ? 1.6 : 0;
      outs[i].position.z = on ? 2 : 3;
      knobs[i].v.rotation.z = -(c.vset / 30) * Math.PI * 1.6 + 0.8 * Math.PI;
      knobs[i].i.rotation.z = -(c.iset / 5) * Math.PI * 1.6 + 0.8 * Math.PI;
    });
    pwr.material.emissiveIntensity = psu.on ? 1.2 : 0;
    dispT -= dt;
    if (dispT <= 0 && hasDoc()) {
      dispT = 0.12;
      const key = JSON.stringify([psu.on, chans.map((c) => [c.out, c.vset, c.iset, c.v.toFixed(3), c.i.toFixed(3)])]);
      if (key !== lastKey) { lastKey = key; disp.userData.redraw((g, Wp, Hp) => drawDisplay(g, Wp, Hp, chans, psu.on)); }
    }
  }
  const prop = { object: root, interact, sockets, update, anchors: { 'psu-front': front, ...Object.fromEntries(Object.entries(jackPos).map(([k, v]) => [`psu-${k}`, v])) }, size: [W, H, D], dispose() { game?.events?.off?.('psu:load', onLoad); } };
  // hình CAD (cad/src/lab/bench_psu.py — cùng khung): vỏ, viền, quai, núm/cọc/nút thật; mặt in + màn LED + đèn CV/CC giữ của JS
  prop.cadReady = upgradeProp(game, prop, 'bench-psu', {
    seat: { knob_v1: knobs[0].v, knob_i1: knobs[0].i, knob_v2: knobs[1].v, knob_i2: knobs[1].i, btn_out1: outs[0], btn_out2: outs[1], switch_power: pwr, bench_psu: body },
    material: { btn_out1: outs[0].material, btn_out2: outs[1].material, switch_power: pwr.material },
  });
  return prop;
}

export default { id: 'bench-psu', name: 'Nguồn DC 2 kênh', build };
