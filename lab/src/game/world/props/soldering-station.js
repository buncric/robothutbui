// Trạm hàn số 70 W kiểu FX-888D (không nhãn hãng) + giá mỏ hàn lò xo kiểu FH-800 + bọt biển ướt + bùi nhùi đồng.
// Mặt trước nghiêng 11.8°: LED 7 đoạn 3 số (CanvasTexture, phát sáng), 3 phím ▼ * ▲ (LMB/R ±10 °C, cuộn ±5 °C, kéo chuột),
// công tắc bập bênh (E), đèn sấy, ổ cắm tay hàn (dây mềm động bám theo mỏ hàn).
// Hình CAD thật: lab/public/models/lab/soldering-station.glb (cad/src/lab/soldering_station.py) — cùng khung toạ độ;
// trong trình duyệt GLB thay hình thủ tục (world/_cad.js upgradeProp), mọi tương tác/khe/mốc giữ nguyên.
// Công bố nhiệt độ đặt qua labState(game).station { on, setpoint } + sự kiện 'station:setpoint' / 'station:power'.
// Socket 'iron-holder' (giá lò xo) nhận mỏ hàn.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvasPlane, drawSeg7, text, roundRect, noiseField, hasDoc } from '../_tex.js';
import { mergeObject } from '../_merge.js';
import { Rope } from '../_rope.js';
import { labState, emit, play, toast } from '../_labState.js';
import { upgradeProp, markRest } from '../_cad.js';

const W = 120, D = 135, H = 98;                  // khớp cad/src/lab/soldering_station.py
const SLOPE = Math.atan2(17.5, 84);              // mặt trước ngả ra sau (11.8°)
const PANEL_POS = [0, 55.816, 57.869];           // gốc tấm mặt (node CAD 'front_panel')
const HOLDER_X = 160;
const TILT = (35 * Math.PI) / 180;               // góc nghiêng mỏ hàn trên giá

const std = (color, metalness, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
const M = (g, m, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, cast = true } = {}) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = cast; o.receiveShadow = true; return o; };
const rbox = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01));

function sideExtrude(pts, width, bevel = 3) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: width - 2 * bevel, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 6 });
  g.rotateY(-Math.PI / 2);                       // (x,y,z) → (−z, y, x): shape x → z ; đùn → −x
  g.translate((width - 2 * bevel) / 2, 0, 0);
  return g;
}

/** Chữ in trên tấm mặt (nền trong suốt; tấm mặt đen là hình 3D) — khung: 104 × 76 mm, gốc ở tâm tấm */
const PW = 104, PH = 76;
function drawPanel(g, Wp, Hp, solid = false) {
  const k = Wp / PW;
  const X = (u) => (u + PW / 2) * k, Y = (v) => (PH / 2 - v) * k;
  if (solid) { g.fillStyle = '#16181c'; g.fillRect(0, 0, Wp, Hp); } else g.clearRect(0, 0, Wp, Hp);
  text(g, 'RVL-888D', X(-47), Y(33.6), { size: 4.2 * k, color: '#e8eaee', bold: true });
  text(g, 'DIGITAL SOLDERING STATION · 70 W', X(47), Y(33.6), { size: 2.1 * k, color: '#9aa1ab', align: 'right', bold: true });
  text(g, 'POWER', X(-34), Y(-19), { size: 2.2 * k, color: '#cfd4da', align: 'center', bold: true });
  text(g, 'HEAT', X(-10), Y(-23.5), { size: 2.0 * k, color: '#cfd4da', align: 'center', bold: true });
  text(g, 'IRON', X(17), Y(-34.5), { size: 2.0 * k, color: '#cfd4da', align: 'center', bold: true });
  text(g, '⚠ 450 °C', X(-10), Y(-34.5), { size: 2.0 * k, color: '#ffcf5a', align: 'center', bold: true });
  text(g, 'ESD SAFE', X(47), Y(-35), { size: 1.9 * k, color: '#7fd0a0', align: 'right', bold: true });
}
function drawButtonCap(sym) {
  return (g, Wp, Hp) => { g.clearRect(0, 0, Wp, Hp); text(g, sym, Wp / 2, Hp * 0.55, { size: Hp * 0.7, color: '#e8eaee', align: 'center', bold: true }); };
}

function drawDisplay(g, Wp, Hp, txt, heater) {
  g.fillStyle = '#120404'; g.fillRect(0, 0, Wp, Hp);
  const h = Hp * 0.72;
  drawSeg7(g, txt, Wp * 0.06, Hp * 0.14, h, '#ff2a14', 'rgba(255,40,20,0.07)', { slant: 0.1 });
  text(g, '°C', Wp * 0.94, Hp * 0.3, { size: Hp * 0.22, color: '#ff4a30', align: 'right', bold: true });
  g.fillStyle = heater ? '#ff2a14' : 'rgba(255,40,20,0.1)';
  g.beginPath(); g.arc(Wp * 0.9, Hp * 0.74, Hp * 0.07, 0, Math.PI * 2); g.fill();
}

/** Giá mỏ hàn: đế gang, lò xo côn, bọt biển, cốc bùi nhùi đồng. Gốc ở đáy tâm đế, mặt trước +Z. */
function buildHolder(K) {
  const g = new THREE.Group();
  const iron = std(0x2b2e33, 0.7, 0.55);
  g.add(M(rbox(120, 18, 176, 7), iron, { y: 9 }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(M(new THREE.CylinderGeometry(6, 6, 2, 16), K.rubber, { x: sx * 48, y: -0.5, z: sz * 74 }));
  // khay bọt biển (trước-trái)
  g.add(M(rbox(56, 6, 66, 2), iron, { x: -26, y: 19, z: 44 }));
  const spongeMat = std(0xe8c547, 0, 0.95);
  const sponge = M(rbox(50, 8, 60, 2.5), spongeMat, { x: -26, y: 24, z: 44 });
  sponge.userData.ironCleaner = 'sponge';
  sponge.userData.wet = true;
  sponge.userData.dynamic = true;
  g.add(sponge);
  for (const dz of [-8, 8]) { const slit = M(new THREE.BoxGeometry(2.2, 2, 22), std(0x6b5a20, 0, 1), { x: -26, y: 27.6, z: 44 + dz * 1.5 }); slit.userData.dynamic = true; sponge.add(slit); slit.position.set(dz * 0.4, 3.6, dz); }
  // cốc bùi nhùi đồng (sau-trái)
  g.add(M(new THREE.CylinderGeometry(22, 20, 26, 32, 1, true), K.chrome, { x: -30, y: 31, z: -46 }));
  g.add(M(new THREE.CylinderGeometry(20, 20, 2, 32), K.chrome, { x: -30, y: 19, z: -46 }));
  const woolGeo = new THREE.IcosahedronGeometry(19, 3);
  const pos = woolGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = 0.82 + 0.18 * Math.sin(x * 0.9) * Math.cos(y * 1.1) * Math.sin(z * 0.8 + x * 0.3);
    pos.setXYZ(i, x * n, Math.min(y * n * 0.75, 10), z * n);
  }
  woolGeo.computeVertexNormals();
  const wool = M(woolGeo, std(0xc9a24a, 1, 0.55), { x: -30, y: 33, z: -46 });
  wool.userData.ironCleaner = 'brass';
  wool.userData.dynamic = true;
  g.add(wool);
  // lò xo côn nghiêng (phải)
  const coil = new THREE.Group();
  const C = new THREE.Vector3(25, 66, -35);                       // tâm miệng hẹp
  const dir = new THREE.Vector3(0, -Math.sin(TILT), -Math.cos(TILT));
  const top = C.clone().addScaledVector(dir, -85);
  coil.position.copy(top);
  coil.rotation.x = -TILT;
  class Cone extends THREE.Curve {
    getPoint(t, out = new THREE.Vector3()) { const a = t * 9 * Math.PI * 2; const r = 21 - t * 9.2; return out.set(Math.cos(a) * r, Math.sin(a) * r, -t * 85); }
  }
  coil.add(M(new THREE.TubeGeometry(new Cone(), 360, 1.5, 6, false), K.chrome));
  coil.add(M(new THREE.TorusGeometry(21, 2, 8, 40), K.chrome));                          // vành miệng trên
  coil.add(M(new THREE.CylinderGeometry(12.5, 11, 10, 24, 1, true), K.chrome, { z: -88, rx: Math.PI / 2 }));   // cốc đỡ chặn ngón
  const socketObj = new THREE.Object3D();
  socketObj.position.set(0, -11.5, -85 + 30);                     // gốc mỏ hàn (trục 11.5 mm, gờ chắn ngón tại z = −30)
  coil.add(socketObj);
  g.add(coil);
  // tay đỡ lò xo
  const arm = [new THREE.Vector3(25, 18, -70), new THREE.Vector3(25, 50, -62), C.clone().add(new THREE.Vector3(0, -10, -6))];
  g.add(M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arm), 16, 3, 8), K.chrome));
  const arm2 = [new THREE.Vector3(25, 18, 50), new THREE.Vector3(25, 70, 52), top.clone().add(new THREE.Vector3(0, -18, 2))];
  g.add(M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arm2), 16, 3, 8), K.chrome));
  return { group: g, sponge, wool, socketObj, spongeMat };
}

export function build(game) {
  const K = {
    rubber: std(0x1f2124, 0, 0.9), chrome: std(0xe0e4e8, 1, 0.14), black: std(0x16181c, 0, 0.45),
    body: new THREE.MeshPhysicalMaterial({ color: 0x3d5875, roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
  };
  const lab = labState(game);
  const st = lab.station;
  const root = new THREE.Group();
  root.name = 'soldering-station';
  const unit = new THREE.Group();
  root.add(unit);
  // vỏ (mặt bên đùn theo X): bệ đứng 14 mm, mặt trước nghiêng tới (z = −50, y = H)
  unit.add(M(sideExtrude([[D / 2, 0], [-D / 2, 0], [-D / 2, H - 6], [-D / 2 + 6, H], [50, H], [D / 2, 14]], W, 4), K.body, { y: 0 }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) unit.add(M(new THREE.CylinderGeometry(7, 7, 3, 16), K.rubber, { x: sx * 46, y: 0.5, z: sz * 52 }));
  for (let i = 0; i < 9; i++) unit.add(M(new THREE.BoxGeometry(64, 1.2, 2.4), K.black, { y: H + 0.3, z: 20 - i * 8, cast: false }));   // khe tản nhiệt
  // tấm mặt trước: khung "panel" = node CAD 'front_panel' (gốc giữa tấm, +Y dọc mặt nghiêng lên, +Z pháp tuyến)
  const panel = new THREE.Group();
  panel.position.set(...PANEL_POS);
  panel.rotation.x = -SLOPE;
  unit.add(panel);
  panel.add(M(rbox(106, 75.8, 1.4, 2.5), K.black, { z: 0.7, cast: false }));
  panel.add(M(rbox(70, 28, 1.2, 3), std(0x45494f, 0, 0.5), { y: 15.5, z: 1.9, cast: false }));
  const print = canvasPlane(PW, PH, (g, Wp, Hp) => drawPanel(g, Wp, Hp), { pxPerMm: 6, maxPx: 640, fallback: '#16181c', rough: 0.45, transparent: true });
  print.position.z = 1.46;
  print.castShadow = false;
  print.userData.keepWithCad = true;
  panel.add(print);
  // cửa sổ LED (sau ô kính của viền)
  const disp = canvasPlane(62, 20, (g, Wp, Hp) => drawDisplay(g, Wp, Hp, '   ', false), { pxPerMm: 6, maxPx: 384, fallback: '#300806', emissive: true });
  disp.position.set(0, 15.5, 1.0);
  disp.userData.keepWithCad = true;
  panel.add(disp);
  const glass = M(new THREE.PlaneGeometry(62, 20), new THREE.MeshPhysicalMaterial({ color: 0x5a0a0a, roughness: 0.06, transparent: true, opacity: 0.22, clearcoat: 1 }), { y: 15.5, z: 1.7, cast: false });
  glass.userData.keepWithCad = true;
  panel.add(glass);
  // 3 phím ▼ * ▲ (động: lún khi bấm)
  const btnMat = std(0x45494f, 0, 0.5);
  const mkBtn = (x, sym) => {
    const b = new THREE.Group();
    b.position.set(x, -9, 1.2);
    b.add(M(rbox(17, 10, 3.2, 2.2), btnMat, { z: 1.6 }));
    const cap = canvasPlane(12, 7, drawButtonCap(sym), { pxPerMm: 12, maxPx: 160, transparent: true, fallback: '#45494f' });
    cap.position.z = 3.26; cap.castShadow = false; cap.userData.keepWithCad = true;
    b.add(cap);
    b.userData.dynamic = true;
    markRest(b);
    panel.add(b);
    return b;
  };
  const btnDown = mkBtn(-26, '▼'), btnSet = mkBtn(0, '*'), btnUp = mkBtn(26, '▲');
  const knob = btnUp;      // (tương thích: "núm" cũ → phím ▲)
  // công tắc nguồn (bập bênh, có đèn)
  const swMat = std(0x8a1410, 0, 0.35, { emissive: 0xff2a14, emissiveIntensity: 0 });
  const sw = new THREE.Group();
  sw.position.set(-34, -28, 1.2);
  sw.add(M(rbox(22, 15, 2.2, 1.5), K.black, { z: 1.1 }));
  const rocker = M(rbox(17, 11, 3.5, 1.8), swMat, { z: 1.4 + 1.75 });
  markRest(rocker);
  sw.add(rocker);
  panel.add(sw);
  // đèn sấy
  const heatLed = M(new THREE.CylinderGeometry(1.9, 1.9, 1.2, 12), std(0x220000, 0, 0.3, { emissive: 0xff3a1a, emissiveIntensity: 0 }), { x: -10, y: -28, z: 1.8, rx: Math.PI / 2 });
  heatLed.userData.keepWithCad = true;
  panel.add(heatLed);
  // ổ cắm tay hàn + phích cắm sẵn
  const din = new THREE.Group();
  din.position.set(32, -27, 1.2);
  din.add(M(new THREE.CylinderGeometry(9.5, 9.5, 3, 28), K.chrome, { z: 1.5, rx: Math.PI / 2 }));
  din.add(M(new THREE.CylinderGeometry(7.6, 7.6, 20, 24), K.black, { z: 13.2, rx: Math.PI / 2 }));
  panel.add(din);
  const cableStart = new THREE.Object3D();
  cableStart.position.set(0, 0, 31.8);
  din.add(cableStart);
  // giá mỏ hàn bên phải
  const holder = buildHolder(K);
  holder.group.position.set(HOLDER_X, 0, 0);
  root.add(holder.group);
  // gộp tĩnh (giữ các phần động)
  for (const o of [rocker, heatLed, disp, print, glass, holder.sponge, holder.wool]) o.userData.keep = true;
  sw.userData.dynamic = true;
  mergeObject(unit);
  mergeObject(holder.group);
  // dây mỏ hàn (động)
  const cable = new Rope({ radius: 2.6, segments: 48, radial: 7, color: 0x1d1f23, sag: 0.22, minY: 0 });
  cable.mesh.visible = false;
  root.add(cable.mesh);

  // ------------------------------------------------------------ trạng thái + điều khiển
  const press = (b) => { b.userData.press = 0.12; };
  const setTemp = (t, ctx) => {
    const v = Math.max(st.min, Math.min(st.max, Math.round(t)));
    if (v === st.setpoint) return;
    st.setpoint = v;
    st.showSetFor = 1.6;
    play(game, 'click', { vol: 0.15 });
    emit(game, 'station:setpoint', { temp: v });
  };
  const setPower = (on) => {
    st.on = on;
    play(game, 'click');
    emit(game, 'station:power', { on });
    emit(game, on ? 'power:on' : 'power:off', { source: 'station' });
    if (on) st.showSetFor = 1.6;
  };
  const socketObj = holder.socketObj;
  const socket = {
    id: 'station-holder', name: 'Giá mỏ hàn', snapRadius: 90, owner: null, object3D: socketObj, kind: 'iron-holder',
    accepts: (item) => (item?.def?.id === 'soldering-iron' ? { ok: true, orientation: 'ok' } : { ok: false, reason: 'Giá này chỉ để mỏ hàn' }),
    pose: new THREE.Matrix4(),          // tương đối object3D (engine/sockets.js): object3D = gốc item khi cắm
    tolerance: { pos: 40, angleDeg: 45 },
    onInsert(item) { play(game, 'snap', { vol: 0.4 }); emit(game, 'iron:holstered', { item }); },
    onRemove(item) { emit(game, 'iron:unholstered', { item }); },
    occupiedBy: null,
  };
  const interact = [
    {
      object: unit,
      spec: {
        name: () => `Trạm hàn 70 W (${st.on ? `bật · đặt ${st.setpoint} °C` : 'tắt'})`, highlight: true,
        prompts: [
          { key: 'E', label: 'Bật / tắt trạm hàn', do: () => setPower(!st.on) },
          { key: 'LMB', label: 'Giữ & kéo chuột: chỉnh nhiệt (cuộn ±5 °C)', drag: true, do: (ctx) => setTemp(st.setpoint + 10, ctx) },
          { key: 'R', label: '−10 °C', do: (ctx) => setTemp(st.setpoint - 10, ctx) },
        ],
        onScroll: (ctx, d) => setTemp(st.setpoint + Math.sign(d) * 5, ctx),
        onDrag: (ctx, dx) => setTemp(st.setpoint + dx * 0.5, ctx),
      },
    },
    ...[[btnUp, '▲', +10, 'Tăng nhiệt'], [btnDown, '▼', -10, 'Giảm nhiệt'], [btnSet, '*', 0, 'Phím * (đặt nhiệt)']].map(([b, sym, d, lbl]) => ({
      object: b,
      spec: {
        name: () => `Phím ${sym} · ${lbl} · đặt ${st.setpoint} °C`, highlight: true,
        prompts: [
          { key: 'LMB', label: d ? `${d > 0 ? '+' : '−'}10 °C (giữ & kéo chuột / cuộn ±5 °C)` : 'Hiện nhiệt độ đặt', drag: true, do: (ctx) => { press(b); if (d) setTemp(st.setpoint + d, ctx); else st.showSetFor = 1.6; } },
          { key: 'R', label: d ? `${d > 0 ? '−' : '+'}10 °C` : '−10 °C', do: (ctx) => { press(b); setTemp(st.setpoint - (d || 10), ctx); } },
          { key: 'E', label: 'Bật / tắt trạm', do: () => setPower(!st.on) },
        ],
        onScroll: (ctx, dd) => setTemp(st.setpoint + Math.sign(dd) * 5, ctx),
        onDrag: (ctx, dx) => setTemp(st.setpoint + dx * 0.5, ctx),
      },
    })),
    {
      object: holder.sponge,
      spec: {
        name: () => holder.sponge.userData.wet ? 'Bọt biển (ướt) — lau mũi hàn' : 'Bọt biển KHÔ — nhỏ nước trước khi lau', highlight: true,
        prompts: [{ key: 'E', label: 'Làm ướt bọt biển', when: () => !holder.sponge.userData.wet, do: () => { holder.sponge.userData.wet = true; holder.sponge.userData.moist = 1; play(game, 'hiss', { vol: 0.2 }); } }],
      },
    },
    { object: holder.wool, spec: { name: 'Bùi nhùi đồng — lau mũi không làm tụt nhiệt', highlight: true, prompts: [] } },
  ];
  holder.sponge.userData.moist = 1;
  const onClean = (e) => { if (e?.kind === 'sponge' && e.wet) { holder.sponge.userData.moist -= 0.04; if (holder.sponge.userData.moist <= 0) { holder.sponge.userData.wet = false; toast(game, 'Bọt biển đã khô — nhỏ thêm nước (E)'); } } };
  game?.events?.on?.('iron:cleaned', onClean);

  let ironInst = null, findT = 0, dispT = 0, lastKey = '';
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _da = new THREE.Vector3(), _db = new THREE.Vector3(), _q = new THREE.Quaternion(), _qi = new THREE.Quaternion();
  const WET = new THREE.Color(0xc9a232), DRY = new THREE.Color(0xf0d77a);
  function update(dt = 1 / 60) {
    st.ironAge += dt;
    st.showSetFor = Math.max(0, st.showSetFor - dt);
    // phím lún khi bấm rồi nhả
    for (const b of [btnUp, btnDown, btnSet]) { b.userData.press = Math.max(0, (b.userData.press || 0) - dt); b.position.z = 1.2 - (b.userData.press > 0 ? 1.2 : 0); }
    rocker.rotation.x = st.on ? -0.18 : 0.18;
    swMat.emissiveIntensity = st.on ? 1.6 : 0;
    heatLed.material.emissiveIntensity = st.on && st.heaterDuty > 0.06 ? 2.2 : 0;
    holder.spongeMat.color.copy(DRY).lerp(WET, Math.max(0, holder.sponge.userData.moist));
    // màn hình (≤ 10 lần/s)
    dispT -= dt;
    if (dispT <= 0) {
      dispT = 0.1;
      let txt = '   ';
      if (st.on) {
        if (st.showSetFor > 0) txt = Math.floor(st.showSetFor * 4) % 2 ? String(st.setpoint) : '   ';
        else if (st.ironAge > 0.6) txt = 'S-E';
        else txt = String(Math.round(Math.abs(st.ironTemp - st.setpoint) < 3 ? st.setpoint : st.ironTemp)).padStart(3, ' ');
      }
      const heat = st.on && st.heaterDuty > 0.06;
      const key = `${txt}|${heat}`;
      if (key !== lastKey) { lastKey = key; disp.userData.redraw?.((g, Wp, Hp) => drawDisplay(g, Wp, Hp, txt, heat)); }
    }
    // dây mỏ hàn bám theo mỏ hàn (nếu có)
    findT -= dt;
    if (findT <= 0) {
      findT = 1;
      const all = game?.items?.all;
      ironInst = Array.isArray(all) ? all.find((i) => i?.def?.id === 'soldering-iron') || null : null;
    }
    const anchor = ironInst?.object?.userData?.cableAnchor;
    if (anchor && ironInst.object.parent) {
      root.updateWorldMatrix(true, false);
      cableStart.getWorldPosition(_a); root.worldToLocal(_a);
      anchor.getWorldPosition(_b); root.worldToLocal(_b);
      root.getWorldQuaternion(_qi).invert();
      _da.set(0, -0.3, 1).normalize().applyQuaternion(panel.getWorldQuaternion(_q)).applyQuaternion(_qi);
      _db.copy(anchor.userData.dir || _db.set(0, 0, 1)).applyQuaternion(anchor.getWorldQuaternion(_q)).applyQuaternion(_qi);
      cable.minY = 0;
      cable.set(_a, _b, _da, _db);
      cable.mesh.visible = true;
    } else cable.mesh.visible = false;
  }

  const anchors = { 'iron-holder': socketObj, sponge: holder.sponge, 'brass-wool': holder.wool, 'station-unit': unit, 'station-display': disp };
  const prop = { object: root, interact, sockets: [socket], update, anchors, size: [HOLDER_X + 60 + W / 2, H, 176], dispose() { game?.events?.off?.('iron:cleaned', onClean); } };
  // mô hình CAD thật (trình duyệt): thân/giá/lò xo từ GLB; phím, công tắc, bọt biển, bùi nhùi gắn vào vật động tương ứng
  prop.cadReady = upgradeProp(game, prop, 'soldering-station', {
    seat: { station_unit: unit, btn_up: btnUp, btn_down: btnDown, btn_set: btnSet, switch_power: rocker, sponge: holder.sponge, brass_wool: holder.wool },
    material: { sponge: holder.spongeMat },
    onLoad(cad) {
      // phím/công tắc CAD thay hình thủ tục; giữ chữ in, màn LED, đèn sấy (keepWithCad)
      cad.getObjectByName('display_window')?.removeFromParent();
      cad.getObjectByName('led_heater')?.removeFromParent();
      const sw = rocker.getObjectByName('switch_power');
      if (sw) sw.traverse((o) => { if (o.isMesh) o.material = swMat; });
    },
  });
  return prop;
}

export default { id: 'soldering-station', name: 'Trạm hàn 60 W', build };
