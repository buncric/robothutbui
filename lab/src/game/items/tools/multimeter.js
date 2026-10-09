// Đồng hồ vạn năng số 6000 count (nằm ngửa trên bàn: màn hình phía −Z, lỗ cắm phía +Z), vỏ bọc cao su vàng,
// núm xoay chọn thang: OFF · V⎓ · V~ · Ω · thông mạch (tít) · A⎓ (que đỏ tự chuyển sang lỗ 10A).
// Hai que đo là nhóm con riêng (inst.state.probes.red / .black) — engine có thể gắn vào 2 tay (def.subGrips);
// dây que là ống mềm động nối từ phích cắm ở lỗ tới đuôi que, cập nhật mỗi khung theo vị trí thế giới.
// Đo: onUseStart → phát 'measure:request' (người nghe điền req.value) → game.circuit?.measure(req) → userData.measure
// của vật đang nhắm → mặc định hở mạch. Kết quả hiện LCD + phát 'measure' {mode, value, unit, a, b}.
import {
  THREE, mats, own, rbox, cyl, lathe, latheZ, flutedLathe, M, G, dyn, decal, finish, lcdPanel, drawSeg7, text, roundRect, FONT,
  emit, play, toast, targetOf, clamp, approach, hasDoc,
} from './_kit.js';
import { Rope } from '../../world/_rope.js';

const W = 92, L = 186, H = 42;
const FACE_Y = H - 1.2;
const JACK_Z = 66, DIAL_Z = 16, LCD_Z = -50;
const JACKS = { a: -30, ma: -10, com: 10, v: 30 };
const MODES = [
  { id: 'off', label: 'OFF', deg: -110, unit: '' },
  { id: 'vdc', label: 'V⎓', deg: -66, unit: 'V' },
  { id: 'vac', label: 'V~', deg: -22, unit: 'V' },
  { id: 'ohm', label: 'Ω', deg: 22, unit: 'Ω' },
  { id: 'cont', label: '·)))', deg: 66, unit: 'Ω' },
  { id: 'adc', label: 'A⎓', deg: 110, unit: 'A' },
];
const PROBE_AX = 7;

function drawFace(g, Wp, Hp) {
  const k = Wp / 80;                    // px / mm
  const y = (z) => (z + 86) * k;        // toạ độ z (mm, tâm mặt) → px
  g.fillStyle = '#2a2e34'; g.fillRect(0, 0, Wp, Hp);
  // khung LCD
  g.fillStyle = '#0d0f12'; roundRect(g, 5 * k, y(LCD_Z - 22), 70 * k, 44 * k, 3 * k); g.fill();
  text(g, 'RVL DM-6000', 6 * k, y(-80), { size: 4.2 * k, color: '#f2b705', bold: true });
  text(g, 'TRUE RMS · 6000 COUNT', 74 * k, y(-80), { size: 2.6 * k, color: '#c9ced4', align: 'right' });
  // nhãn nút
  ['SELECT', 'RANGE', 'HOLD', '☀'].forEach((t, i) => text(g, t, (13 + i * 18) * k, y(-30), { size: 2.6 * k, color: '#d8dde2', align: 'center', bold: true }));
  // vòng chia thang quanh núm
  const cx = 40 * k, cy = y(DIAL_Z);
  g.strokeStyle = '#596069'; g.lineWidth = 0.6 * k; g.beginPath(); g.arc(cx, cy, 27.5 * k, 0, Math.PI * 2); g.stroke();
  for (const m of MODES) {
    const a = (m.deg * Math.PI) / 180;
    const rx = Math.sin(a), ry = -Math.cos(a);
    g.strokeStyle = '#d8dde2'; g.lineWidth = 0.7 * k;
    g.beginPath(); g.moveTo(cx + rx * 26.5 * k, cy + ry * 26.5 * k); g.lineTo(cx + rx * 29.5 * k, cy + ry * 29.5 * k); g.stroke();
    text(g, m.label, cx + rx * 34 * k, cy + ry * 33.5 * k, { size: (m.id === 'cont' ? 3.4 : 4.4) * k, color: m.id === 'off' ? '#ff5a4f' : m.id === 'adc' ? '#ffcf5a' : '#f2f4f6', align: 'center', bold: true });
  }
  text(g, '→|', cx + 33 * k, cy + 7 * k, { size: 2.8 * k, color: '#9aa1ab', align: 'center', bold: true });
  // nhãn lỗ cắm
  const jl = [['10A', 'MAX FUSED', '#ff5a4f'], ['mA µA', '400mA', '#ff5a4f'], ['COM', '', '#f2f4f6'], ['VΩ→|', 'Hz ·)))', '#ff5a4f']];
  Object.values(JACKS).forEach((x, i) => {
    text(g, jl[i][0], (40 + x) * k, y(JACK_Z - 10), { size: 3 * k, color: jl[i][2], align: 'center', bold: true });
    if (jl[i][1]) text(g, jl[i][1], (40 + x) * k, y(JACK_Z + 10), { size: 2.1 * k, color: '#aab1ba', align: 'center' });
  });
  g.strokeStyle = '#ff5a4f'; g.lineWidth = 0.4 * k; g.strokeRect(3 * k, y(JACK_Z - 14), 74 * k, 28 * k);
  text(g, 'CAT III 600V  ⚠', 40 * k, y(JACK_Z + 16.5), { size: 2.4 * k, color: '#ffcf5a', align: 'center', bold: true });
}

function drawLcd(g, Wp, Hp, s) {
  g.fillStyle = '#b4c2a2'; g.fillRect(0, 0, Wp, Hp);
  const grd = g.createLinearGradient(0, 0, 0, Hp); grd.addColorStop(0, 'rgba(255,255,255,.12)'); grd.addColorStop(1, 'rgba(0,0,0,.08)');
  g.fillStyle = grd; g.fillRect(0, 0, Wp, Hp);
  const mode = MODES[s.mode];
  if (mode.id === 'off') return;
  const on = '#131a10', off = 'rgba(19,26,16,0.07)';
  const str = s.display ?? '0.000';
  const digits = str.replace('.', '').length;
  const h = Hp * 0.56;
  const pad = ' '.repeat(Math.max(0, 4 - digits));
  if (s.negative) text(g, '−', Wp * 0.07, Hp * 0.52, { size: h * 0.6, color: on, align: 'center', bold: true });
  drawSeg7(g, pad + str, Wp * 0.12, Hp * 0.24, h, on, off, { glow: false, slant: 0.1 });
  text(g, s.unitText ?? mode.unit, Wp * 0.95, Hp * 0.66, { size: Hp * 0.17, color: on, align: 'right', bold: true });
  const ann = [];
  ann.push('AUTO');
  if (mode.id === 'vdc' || mode.id === 'adc') ann.push('DC');
  if (mode.id === 'vac') ann.push('AC');
  if (s.hold) ann.push('HOLD');
  text(g, ann.join('  '), Wp * 0.05, Hp * 0.12, { size: Hp * 0.11, color: on, bold: true });
  if (mode.id === 'cont') text(g, '·)))', Wp * 0.95, Hp * 0.13, { size: Hp * 0.13, color: s.beeping ? on : 'rgba(19,26,16,.25)', align: 'right', bold: true });
  if (s.fuseBlown && mode.id === 'adc') text(g, 'FUSE', Wp * 0.95, Hp * 0.88, { size: Hp * 0.11, color: on, align: 'right', bold: true });
  // vạch analog (bargraph)
  const frac = clamp(s.bar ?? 0, 0, 1);
  for (let i = 0; i < 30; i++) { g.fillStyle = i / 30 < frac ? on : off; g.fillRect(Wp * 0.05 + i * Wp * 0.029, Hp * 0.88, Wp * 0.02, Hp * 0.06); }
}

function makeProbe(K, color) {
  const g = new THREE.Group();
  const col = color === 'red' ? K.absRed : K.absBlack;
  const L_ = (p, m, seg = 24) => M(latheZ(p, { seg, zBack: 70, axisY: PROBE_AX }), m);
  g.add(L_([[0, 0], [2.4, 0], [2.6, 8], [3.2, 12], [3.6, 14], [0, 14]], K.rubber, 16));                 // giảm căng dây
  const handle = [];
  for (let s = 14; s <= 92; s += 2) handle.push([4.6 + 0.35 * Math.sin(((s - 14) / 6) * Math.PI * 2) * (s > 40 && s < 86 ? 1 : 0), s]);
  g.add(L_([[0, 13.5], [4.4, 13.5], ...handle, [4.8, 93], [0, 93]], col, 28));
  g.add(L_([[0, 92], [5, 92], [7, 94], [7, 97], [3.4, 99], [2.4, 104], [0, 104]], col, 28));          // gờ chắn ngón
  g.add(L_([[0, 103.5], [1.25, 103.5], [1.2, 116], [0.9, 120], [0.32, 123.4], [0, 123.6]], K.chrome, 12)); // kim đo
  g.add(L_([[1.9, 104], [1.9, 109], [1.3, 110], [0, 110]], K.absBlack, 12));                           // ống bảo vệ CAT
  const tip = new THREE.Object3D();
  tip.position.set(0, PROBE_AX, 70 - 123.6);
  g.add(tip);
  const tail = new THREE.Object3D();
  tail.position.set(0, PROBE_AX, 70);
  g.add(tail);
  g.userData.tipObject = tip;
  g.userData.tailObject = tail;
  g.userData.probe = color;
  return g;
}

function build(game) {
  const K = mats(game);
  const root = new THREE.Group();
  const holster = own(K.rubberYellow);
  holster.color.set(0xf2b705);
  // vỏ bọc cao su + 4 góc chống sốc
  root.add(M(rbox(W, H - 2, L, 9, 4), holster, { y: (H - 2) / 2 }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) root.add(M(rbox(24, H, 26, 9, 3), holster, { x: sx * (W / 2 - 10), y: H / 2, z: sz * (L / 2 - 11) }));
  // vành (gờ) bao mặt + mặt máy
  root.add(M(rbox(82, 4, 176, 2.5, 2), K.absDark, { y: FACE_Y - 2 }));
  const face = decal(80, 172, drawFace, { y: FACE_Y + 0.02, rx: -Math.PI / 2, px: 7, maxPx: 1400, transparent: false });
  if (face) root.add(face);
  // cửa sổ LCD
  const lcd = lcdPanel(62, 34, { pxPerMm: 9 });
  lcd.mesh.rotation.x = -Math.PI / 2;
  lcd.mesh.position.set(0, FACE_Y + 0.08, LCD_Z);
  root.add(lcd.mesh);
  root.add(M(new THREE.PlaneGeometry(66, 38), K.glass, { y: FACE_Y + 0.5, z: LCD_Z, rx: -Math.PI / 2, cast: false }));
  // nút bấm
  for (let i = 0; i < 4; i++) root.add(M(rbox(13, 3, 7, 1.4), i === 3 ? K.absYellow : K.absGrey, { x: -27 + i * 18, y: FACE_Y + 1.2, z: -22 }));
  // núm xoay (động)
  const dial = new THREE.Group();
  dial.position.set(0, FACE_Y, DIAL_Z);
  const skirt = flutedLathe([[0, 0, 0], [24.5, 0, 0], [24.5, 2.5, 1], [23.5, 4, 1], [0, 4.2, 0]], { flutes: 30, depth: 0.03, seg: 90, sharp: 2 });
  dial.add(M(skirt, K.absBlack));
  dial.add(M(rbox(10, 8, 46, 3.5, 3), K.absBlack, { y: 7 }));
  dial.add(M(rbox(1.6, 0.6, 14, 0.25), K.absWhite, { y: 11.1, z: -14 }));
  root.add(dyn(dial));
  // lỗ cắm + phích que
  const jackPos = {};
  for (const [k, x] of Object.entries(JACKS)) {
    const ring = k === 'com' ? K.absBlack : K.absRed;
    root.add(M(lathe([[2.6, 0], [4.8, 0], [5.2, 0.8], [5.2, 2.4], [2.6, 2.4]], 24), ring, { x, y: FACE_Y - 0.4, z: JACK_Z }));
    root.add(M(cyl(2.6, 2.6, 0.2, 16), K.lcdBezel, { x, y: FACE_Y + 0.2, z: JACK_Z }));
    jackPos[k] = new THREE.Vector3(x, FACE_Y + 2, JACK_Z);
  }
  const plug = (color) => {
    const g = new THREE.Group();
    const m = color === 'red' ? K.absRed : K.absBlack;
    g.add(M(lathe([[0, 0], [4.2, 0], [4.4, 14], [3.6, 18], [3.2, 22], [2.6, 30], [0, 30]], 24), m));
    for (let i = 0; i < 4; i++) g.add(M(new THREE.TorusGeometry(4.3, 0.35, 6, 20), m, { y: 3 + i * 2.6, rx: Math.PI / 2 }));
    return g;
  };
  const plugRed = dyn(plug('red')), plugBlack = plug('black');
  plugRed.position.copy(jackPos.v).setY(FACE_Y + 2.4);
  plugBlack.position.copy(jackPos.com).setY(FACE_Y + 2.4);
  root.add(plugRed, plugBlack);
  // que đo nằm cạnh đồng hồ (bên phải)
  const red = makeProbe(K, 'red'), black = makeProbe(K, 'black');
  red.position.set(W / 2 + 22, 0, -10);
  black.position.set(W / 2 + 40, 0, 6);
  black.rotation.y = 0.08;
  finish(red, 'probe-red'); finish(black, 'probe-black');
  red.userData.dynamic = true; black.userData.dynamic = true;
  root.add(red, black);
  // dây que (động)
  const leadR = new Rope({ radius: 1.9, segments: 40, radial: 6, material: own(K.pvcRed), sag: 0.12, minY: 0 });
  const leadB = new Rope({ radius: 1.9, segments: 40, radial: 6, material: own(K.pvcBlack), sag: 0.12, minY: 0 });
  root.add(leadR.mesh, leadB.mesh);
  finish(root, 'multimeter');
  root.userData.parts = { lcd, dial, plugRed, red, black, leadR, leadB, jackPos };
  root.userData.tipObject = red.userData.tipObject;
  return root;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _da = new THREE.Vector3(), _db = new THREE.Vector3(), _up = new THREE.Vector3();
const _qo = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _qp = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

function format(mode, v) {
  if (mode.id === 'off') return { display: '', unitText: '', bar: 0 };
  if (v === null || v === undefined || Number.isNaN(v)) return { display: '----', unitText: mode.unit, bar: 0 };
  const neg = v < 0, a = Math.abs(v);
  if (mode.id === 'ohm' || mode.id === 'cont') {
    if (!Number.isFinite(a) || a >= 60e6 || (mode.id === 'cont' && a >= 600)) return { display: '0L', unitText: mode.id === 'cont' ? 'Ω' : 'MΩ', bar: 0 };
    if (a < 600) return { display: a.toFixed(1), unitText: 'Ω', bar: a / 600 };
    if (a < 6e3) return { display: (a / 1e3).toFixed(3), unitText: 'kΩ', bar: a / 6e3 };
    if (a < 60e3) return { display: (a / 1e3).toFixed(2), unitText: 'kΩ', bar: a / 60e3 };
    if (a < 600e3) return { display: (a / 1e3).toFixed(1), unitText: 'kΩ', bar: a / 600e3 };
    if (a < 6e6) return { display: (a / 1e6).toFixed(3), unitText: 'MΩ', bar: a / 6e6 };
    return { display: (a / 1e6).toFixed(2), unitText: 'MΩ', bar: a / 60e6 };
  }
  if (!Number.isFinite(a) || a >= 1000) return { display: '0L', unitText: mode.unit, bar: 1 };
  if (mode.id === 'adc' && a < 0.6) return { display: (a * 1000).toFixed(1), unitText: 'mA', bar: a / 0.6, negative: neg };
  if (a < 6) return { display: a.toFixed(3), unitText: mode.unit, bar: a / 6, negative: neg };
  if (a < 60) return { display: a.toFixed(2), unitText: mode.unit, bar: a / 60, negative: neg };
  return { display: a.toFixed(1), unitText: mode.unit, bar: a / 600, negative: neg };
}

/** Giá trị từ userData.measure của đích: số, hàm(modeId) hoặc { vdc, vac, ohm, adc } */
function fromTarget(T, modeId) {
  const d = T.data('measure');
  if (d === undefined || d === null) return undefined;
  if (typeof d === 'function') return d(modeId);
  if (typeof d === 'number') return d;
  if (modeId === 'cont') return d.ohm ?? d.cont;
  return d[modeId];
}

const def = {
  id: 'multimeter', name: 'Đồng hồ vạn năng', kind: 'tool', category: 'tool', icon: '📟',
  massG: 380, size: [W, H, L],
  desc: 'Đo V (song song), A (NỐI TIẾP — que đỏ sang lỗ 10A), Ω và thông mạch (mạch phải TẮT điện). Lỗi kinh điển: để thang A rồi đo áp nguồn → chập, đứt cầu chì đồng hồ.',
  build,
  grip: { pose: 'holdTool:meter', hand: 'left', offset: [0, -H / 2, 0], rot: [0, 0, 0] },
  subGrips: {
    red: { pose: 'holdTool:probe', hand: 'right', offset: [0, -PROBE_AX, -10], rot: [0, 0, 0], tip: [0, PROBE_AX, 70 - 123.6] },
    black: { pose: 'holdTool:probe', hand: 'left', offset: [0, -PROBE_AX, -10], rot: [0, 0, 0], tip: [0, PROBE_AX, 70 - 123.6] },
  },
  modes: MODES.map((m) => m.id),
  tool: {
    kind: 'meter',
    onScroll(ctx, d) { def.turnDial(ctx.instance, Math.sign(d) || 1, ctx.game); },
    tip: [W / 2 + 22, PROBE_AX, -10 + 70 - 123.6],
    onUseStart(ctx) { def.measure(ctx.instance, ctx.game, targetOf(ctx)); },
    onUseHold(ctx, dt) {
      const s = ctx.instance.state;
      s.reT = (s.reT || 0) + dt;
      if (s.reT > 0.35) { s.reT = 0; def.measure(ctx.instance, ctx.game, targetOf(ctx), true); }   // đo liên tục khi giữ
    },
    onUseEnd(ctx) { ctx.instance.state.beeping = false; },
    hud(inst) {
      const s = inst.state, m = MODES[s.mode];
      if (m.id === 'off') return 'Đồng hồ vạn năng · OFF';
      return `ĐHVN ${m.label} · ${s.negative ? '−' : ''}${s.display || '----'} ${s.unitText || m.unit}`;
    },
    keys: [{ key: 'R', label: 'Xoay núm thang đo', do(ctx) { def.turnDial(ctx.instance, 1, ctx.game); } }],
  },
  prompts: [
    { key: 'R', label: 'Xoay núm thang đo', do(ctx) { const i = ctx.instance || ctx.item; if (i) def.turnDial(i, 1, ctx.game); } },
  ],

  init(inst, game) {
    Object.assign(inst.state, { mode: 1, dialAngle: (MODES[1].deg * Math.PI) / 180, value: 0, display: '0.000', unitText: 'V', bar: 0, beeping: false, hold: false, fuseBlown: false, negative: false, redJack: 'v', beepT: 0 });
    const P = inst.object.userData.parts;
    if (P) inst.state.probes = { red: P.red, black: P.black };
    // minigame đo có thể đẩy kết quả trực tiếp
    const onResult = (e) => { if (!e || (e.instance && e.instance !== inst)) return; def.show(inst, e.value, game); };
    game?.events?.on?.('measure:result', onResult);
    inst.state._off = () => game?.events?.off?.('measure:result', onResult);
  },

  /** Xoay núm: dir ±1 */
  turnDial(inst, dir = 1, game = null) {
    const s = inst.state;
    s.mode = (s.mode + dir + MODES.length) % MODES.length;
    const m = MODES[s.mode];
    s.redJack = m.id === 'adc' ? 'a' : 'v';
    s.beeping = false;
    play(game, 'click', { vol: 0.4 });
    if (m.id === 'adc') toast(game, 'Thang A: que đỏ đã chuyển sang lỗ 10A — đo NỐI TIẾP, không chạm 2 đầu nguồn!');
    def.show(inst, m.id === 'ohm' || m.id === 'cont' ? Infinity : 0, game);
    emit(game, 'meter:mode', { instance: inst, mode: m.id });
  },

  /** Đo: hỏi engine/mạch → userData → mặc định hở mạch */
  measure(inst, game, T, silent = false) {
    const s = inst.state, m = MODES[s.mode];
    if (m.id === 'off') { toast(game, 'Đồng hồ đang OFF — nhấn R để xoay núm'); return null; }
    const P = inst.object.userData.parts;
    const a = P?.red.userData.tipObject.getWorldPosition(new THREE.Vector3()) ?? null;
    const b = P?.black.userData.tipObject.getWorldPosition(new THREE.Vector3()) ?? null;
    const req = { instance: inst, mode: m.id, unit: m.unit, a, b, target: T.object, item: T.item, value: undefined, redJack: s.redJack };
    emit(game, 'measure:request', req);
    if (req.value === undefined && typeof game?.circuit?.measure === 'function') { try { req.value = game.circuit.measure(req); } catch { req.value = undefined; } }
    if (req.value === undefined) req.value = fromTarget(T, m.id);
    if (req.value === undefined) req.value = m.id === 'ohm' || m.id === 'cont' ? Infinity : 0;
    let v = req.value;
    // sai lầm kinh điển: thang A đặt lên nguồn áp → đứt cầu chì
    if (m.id === 'adc') {
      const vsrc = fromTarget(T, 'vdc');
      if (!s.fuseBlown && typeof vsrc === 'number' && Math.abs(vsrc) > 0.5 && req.value === fromTarget(T, 'adc') && !T.data('seriesPath')) {
        s.fuseBlown = true;
        play(game, 'pop', { pos: a });
        game?.fx?.sparks?.(a || [0, 0, 0], { count: 25, speed: 40, size: 0.6 });
        emit(game, 'fault', { kind: 'meter-fuse', item: inst, target: T.object, voltage: vsrc });
        toast(game, 'Bụp! Để thang A chạm 2 đầu nguồn = chập qua sun 0.01 Ω → đứt cầu chì 10A của đồng hồ.');
      }
      if (s.fuseBlown) v = 0;
    }
    def.show(inst, v, game);
    if (m.id === 'cont' && Number.isFinite(v) && Math.abs(v) < 50) { s.beeping = true; play(game, 'beep', { pos: a, vol: 0.6 }); } else s.beeping = false;
    if (!silent || m.id === 'cont') emit(game, 'measure', { instance: inst, mode: m.id, value: v, unit: m.unit, a: T.object, b: null, item: T.item, posA: a, posB: b });
    return v;
  },

  show(inst, v, game) {
    const s = inst.state, m = MODES[s.mode];
    s.value = v;
    Object.assign(s, { negative: false }, format(m, v));
  },

  update(inst, dt) {
    const s = inst.state, P = inst.object.userData.parts;
    if (!P) return;
    // núm xoay
    const target = (MODES[s.mode].deg * Math.PI) / 180;
    s.dialAngle = approach(s.dialAngle, target, dt, 0.06);
    P.dial.rotation.y = -s.dialAngle;
    // phích đỏ: lỗ V hoặc lỗ 10A
    const jp = s.redJack === 'a' ? P.jackPos.a : P.jackPos.v;
    P.plugRed.position.x = approach(P.plugRed.position.x, jp.x, dt, 0.08);
    // LCD
    if (hasDoc()) {
      const key = `${s.mode}|${s.display}|${s.unitText}|${s.beeping}|${s.fuseBlown}|${s.negative}|${(s.bar || 0).toFixed(2)}`;
      P.lcd.draw(key, (g, Wp, Hp) => drawLcd(g, Wp, Hp, s));
    }
    // dây que: phích (đỉnh) → đuôi que
    const obj = inst.object;
    obj.updateWorldMatrix(true, false);
    obj.getWorldQuaternion(_qo);
    _qi.copy(_qo).invert();
    _up.set(0, 1, 0).applyQuaternion(_qo);
    const upright = _up.dot(UP) > 0.9;
    for (const [rope, plugObj, probe] of [[P.leadR, P.plugRed, P.red], [P.leadB, null, P.black]]) {
      rope.minY = upright ? 0 : -Infinity;
      if (plugObj) _a.copy(plugObj.position).setY(plugObj.position.y + 29);
      else _a.set(JACKS.com, FACE_Y + 2.4 + 29, JACK_Z);
      probe.userData.tailObject.getWorldPosition(_b);
      obj.worldToLocal(_b);
      _da.set(0, 1, 0);
      _db.set(0, 0, 1).applyQuaternion(probe.getWorldQuaternion(_qp)).applyQuaternion(_qi);
      rope.set(_a, _b, _da, _db);
    }
  },

  dispose(inst) { inst.state._off?.(); },
};
export default def;
