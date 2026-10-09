// Kính hiển vi soi nổi zoom 0.7×–4.5× (thị kính WF10× → 7×–45×) trên chân cần, đèn vòng LED, Barlow 0.5× — "làm như thợ thật".
// Hình CAD: lab/public/models/lab/stereo-microscope.glb (cad/src/lab/stereo_microscope.py). Gốc prop = tâm trụ đứng trên mặt bàn.
//
// Trạng thái: labState(game).microscope = { zoom 0.7..4.5, mag (= zoom × 10), focus mm (−20..+20), light bool, brightness 0..1 }
// Tương tác: knob_zoom (cuộn/LMB/R ±0.25×), knob_focus (cuộn ±1 mm), knob_light (E bật/tắt, cuộn độ sáng),
//            eyepiece_l / eyepiece_r (E = nhìn qua kính → sự kiện 'microscope:look' { eye, focus, view, zoom, mag, fovDeg }).
// Mốc world: 'microscope' (tiêu điểm trên trục quang ≈ 100 mm dưới vật kính — đặt bo mạch ở đây),
//            'microscope-eye' (mắt người xem ở thị kính: −Z cục bộ = hướng nhìn vào thị kính, +Y ≈ lên),
//            'microscope-view' (camera ảo nhìn thẳng xuống tiêu điểm, −Z cục bộ = xuống — dùng cho ảnh phóng đại).
// Sự kiện: 'microscope:zoom' {zoom, mag}, 'microscope:focus' {focus}, 'microscope:light' {on, brightness}, 'microscope:look'.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeObject } from '../_merge.js';
import { qualityLevel } from '../_tex.js';
import { labState, emit, play } from '../_labState.js';
import { upgradeProp, markRest } from '../_cad.js';
import { CAD_ANCHORS } from '../_cadAnchors.js';

const A = CAD_ANCHORS?.['stereo-microscope'] || {};
const P = (n, d) => new THREE.Vector3(...(A[n]?.p || d));
const Q = (n) => new THREE.Quaternion(...(A[n]?.q || [0, 0, 0, 1]));
const FOCUS = P('focus_point', [-40, 78, 520]);
const EYE = P('eye_point', [-40, 397, 611]);
const std = (color, metalness, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
const M = (g, m, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = {}) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; o.receiveShadow = true; return o; };
const rbox = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01));
const cylX = (r, h) => new THREE.CylinderGeometry(r, r, h, 24).rotateZ(Math.PI / 2);

export function build(game) {
  const lab = labState(game);
  const st = (lab.microscope = lab.microscope || { zoom: 1.0, focus: 0, light: false, brightness: 0.8 });
  st.mag = st.zoom * 10;
  const K = { black: std(0x232527, 0.3, 0.5), white: std(0xe8e9e6, 0, 0.45), chrome: std(0xe4e7ea, 1, 0.12), knob: std(0x1d1f22, 0, 0.55) };
  const root = new THREE.Group();
  root.name = 'stereo-microscope';
  // ---- hình thủ tục (dự phòng / Node)
  const shell = new THREE.Group();
  shell.add(M(rbox(260, 24, 210, 6), K.black, { x: -10, y: 12, z: 45 }));
  const armZ = 294;
  shell.add(M(new THREE.CylinderGeometry(16, 16, armZ + 120, 20), K.chrome, { y: 20 + (armZ + 120) / 2 }));
  shell.add(M(rbox(56, 54, 56, 5), K.black, { y: armZ }));
  const arm = new THREE.Vector3(FOCUS.x, armZ, FOCUS.z - 88);
  const armLen = Math.hypot(arm.x, arm.z);
  const armMesh = M(new THREE.CylinderGeometry(12.5, 12.5, armLen, 16), K.chrome, { x: arm.x / 2, y: armZ, z: arm.z / 2 });
  armMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(arm.x, 0, arm.z).normalize());
  shell.add(armMesh);
  const head = new THREE.Vector3(FOCUS.x, FOCUS.y, FOCUS.z);
  shell.add(M(rbox(96, 100, 72, 18), K.white, { x: head.x, y: head.y + 116 + 50, z: head.z }));
  shell.add(M(rbox(110, 34, 64, 10), K.white, { x: head.x, y: head.y + 216 + 17, z: head.z - 6 }));
  shell.add(M(new THREE.CylinderGeometry(30, 30, 20, 28), K.chrome, { x: head.x, y: head.y + 108, z: head.z }));
  shell.add(M(rbox(64, 92, 44, 5), K.black, { x: head.x, y: head.y + 166, z: head.z - 62 }));
  for (const sx of [-1, 1]) {
    const ep = M(new THREE.CylinderGeometry(15.5, 15.5, 88, 20), K.black, { x: head.x + sx * 31, y: (head.y + 238 + EYE.y - 57) / 2 + 10, z: (head.z + EYE.z) / 2 + 20, rx: Math.PI / 4 });
    shell.add(ep);
  }
  root.add(shell);
  mergeObject(shell);
  // ---- vật động (núm, thị kính, đèn vòng) — vị trí = node CAD
  const mkDyn = (name, pos, quat, geo, mat) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.copy(pos); g.quaternion.copy(quat);
    if (geo) g.add(M(geo, mat));
    g.userData.dynamic = true;
    markRest(g);
    root.add(g);
    return g;
  };
  const knobZoom = mkDyn('knob_zoom', P('knob_zoom', [head.x, head.y + 168, head.z]), Q('knob_zoom'), cylX(27, 110), K.knob);
  const knobFocus = mkDyn('knob_focus', P('knob_focus', [head.x, head.y + 150, head.z - 66]), Q('knob_focus'), cylX(19, 88), K.knob);
  const knobLight = mkDyn('knob_light', P('knob_light', [-95, 54, 75]), Q('knob_light'), new THREE.CylinderGeometry(10, 10, 11, 18).translate(0, 5.5, 0), K.knob);
  const eyeL = mkDyn('eyepiece_l', P('eyepiece_l', [-71, 357, 571]), Q('eyepiece_l'), null);
  const eyeR = mkDyn('eyepiece_r', P('eyepiece_r', [-9, 357, 571]), Q('eyepiece_r'), null);
  // khối chạm cho thị kính (vô hình nhưng raycast được khi chưa có CAD)
  for (const e of [eyeL, eyeR]) e.add(M(new THREE.CylinderGeometry(16, 16, 42, 12).translate(0, 21, 0), K.black));
  // đèn vòng: vòng phát sáng + đèn chiếu xuống tiêu điểm
  const ringMat = std(0xffffff, 0, 0.3, { emissive: 0xf4f7ff, emissiveIntensity: 0 });
  const ring = M(new THREE.TorusGeometry(33, 3.5, 8, 40), ringMat, { x: head.x, y: head.y + 92, z: head.z, rx: Math.PI / 2 });
  ring.userData.keepWithCad = true;
  root.add(ring);
  const spot = new THREE.SpotLight(0xf2f6ff, 0, 500, 0.75, 0.5, 2);
  spot.position.set(head.x, head.y + 90, head.z);
  const tgt = new THREE.Object3D(); tgt.position.copy(FOCUS); root.add(tgt); spot.target = tgt;
  spot.castShadow = false;
  if (qualityLevel(game) >= 3) root.add(spot);          // đèn chiếu thật chỉ ở 'ultra' (mỗi SpotLight tốn shader cho cả cảnh)
  // ---- mốc
  const focusA = new THREE.Object3D(); focusA.name = 'microscope'; focusA.position.copy(FOCUS); root.add(focusA);
  focusA.userData.label = 'Tiêu điểm kính hiển vi (đặt bo mạch ở đây)';
  const eyeA = new THREE.Object3D(); eyeA.name = 'microscope-eye'; eyeA.position.copy(EYE);
  {
    // trục thị kính (hướng từ đầu kính → mắt) = +Y cục bộ của node CAD eye_point; camera nhìn ngược lại
    const d = new THREE.Vector3(0, 1, 0).applyQuaternion(Q('eye_point')).normalize();
    const m = new THREE.Matrix4().lookAt(EYE, EYE.clone().sub(d), new THREE.Vector3(0, 0, -1).applyQuaternion(Q('eye_point')));
    eyeA.quaternion.setFromRotationMatrix(m);
  }
  root.add(eyeA);
  const VIEW_H = 88;                                     // ngay dưới đèn vòng (đáy đèn vòng cách tiêu điểm 92 mm)
  const viewA = new THREE.Object3D(); viewA.name = 'microscope-view'; viewA.position.copy(FOCUS).add(new THREE.Vector3(0, VIEW_H, 0));
  viewA.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(viewA.position, FOCUS, new THREE.Vector3(0, 0, -1)));
  root.add(viewA);
  const fovFor = (zoom) => THREE.MathUtils.radToDeg(2 * Math.atan((200 / (zoom * 10)) / 2 / VIEW_H));   // Ø trường nhìn = 200 / độ phóng (mm), nhìn từ mốc 'microscope-view'
  for (const a of [eyeA, viewA]) { a.userData.focus = focusA; a.userData.fovFor = fovFor; a.userData.state = st; }

  // ---- điều khiển
  const setZoom = (z) => {
    const v = THREE.MathUtils.clamp(Math.round(z * 4) / 4, 0.7, 4.5);
    if (v === st.zoom) return;
    st.zoom = v; st.mag = Math.round(v * 100) / 10;
    play(game, 'click', { vol: 0.12 });
    emit(game, 'microscope:zoom', { zoom: st.zoom, mag: st.mag });
  };
  const setFocus = (f) => { st.focus = THREE.MathUtils.clamp(f, -20, 20); emit(game, 'microscope:focus', { focus: st.focus }); };
  const setLight = (on, b = st.brightness) => {
    st.light = on; st.brightness = THREE.MathUtils.clamp(b, 0.05, 1);
    play(game, 'click', { vol: 0.2 });
    emit(game, 'microscope:light', { on: st.light, brightness: st.brightness });
  };
  const look = () => {
    play(game, 'whoosh', { vol: 0.15 });
    emit(game, 'microscope:look', { eye: eyeA, focus: focusA, view: viewA, zoom: st.zoom, mag: st.mag, fovDeg: fovFor(st.zoom) });
  };
  const eyeSpec = {
    name: () => `Thị kính WF10× · độ phóng ${st.mag}× (zoom ${st.zoom.toFixed(2)}×)`, highlight: true,
    prompts: [{ key: 'E', label: 'Nhìn qua kính hiển vi', do: look }],
    onScroll: (ctx, d) => setZoom(st.zoom + Math.sign(d) * 0.25),
  };
  const interact = [
    { object: knobZoom, spec: { name: () => `Núm zoom · ${st.zoom.toFixed(2)}× → ${st.mag}×`, highlight: true,
      prompts: [{ key: 'LMB', label: '+0.25× (cuộn chuột để xoay)', drag: true, do: () => setZoom(st.zoom + 0.25) }, { key: 'R', label: '−0.25×', do: () => setZoom(st.zoom - 0.25) }],
      onScroll: (ctx, d) => setZoom(st.zoom + Math.sign(d) * 0.25), onDrag: (ctx, dx) => setZoom(st.zoom + dx * 0.01) } },
    { object: knobFocus, spec: { name: () => `Núm lấy nét · ${st.focus >= 0 ? '+' : ''}${st.focus.toFixed(1)} mm`, highlight: true,
      prompts: [{ key: 'LMB', label: 'Nâng đầu kính 1 mm', drag: true, do: () => setFocus(st.focus + 1) }, { key: 'R', label: 'Hạ 1 mm', do: () => setFocus(st.focus - 1) }],
      onScroll: (ctx, d) => setFocus(st.focus + Math.sign(d) * 0.5), onDrag: (ctx, dx) => setFocus(st.focus + dx * 0.05) } },
    { object: knobLight, spec: { name: () => `Đèn vòng LED (${st.light ? `bật ${Math.round(st.brightness * 100)} %` : 'tắt'})`, highlight: true,
      prompts: [{ key: 'E', label: 'Bật / tắt đèn vòng', do: () => setLight(!st.light) }, { key: 'LMB', label: 'Sáng hơn', do: () => setLight(true, st.brightness + 0.1) }, { key: 'R', label: 'Tối hơn', do: () => setLight(true, st.brightness - 0.1) }],
      onScroll: (ctx, d) => setLight(true, st.brightness + Math.sign(d) * 0.05) } },
    { object: eyeL, spec: eyeSpec },
    { object: eyeR, spec: eyeSpec },
    { object: shell, spec: { name: () => `Kính hiển vi soi nổi 7×–45× · đang ${st.mag}×`, highlight: true, prompts: [{ key: 'E', label: 'Nhìn qua kính hiển vi', do: look }] } },
  ];
  // ---- cập nhật
  let lastZoom = -1;
  function update(dt = 1 / 60) {
    const zt = ((st.zoom - 0.7) / 3.8) * Math.PI * 1.5;
    knobZoom.rotation.x += (zt - knobZoom.rotation.x) * Math.min(1, dt * 12);
    knobFocus.rotation.x += (st.focus * 0.25 - knobFocus.rotation.x) * Math.min(1, dt * 12);
    knobLight.rotation.y = -st.brightness * 4.5;
    ringMat.emissiveIntensity = st.light ? 0.6 + 2.2 * st.brightness : 0;
    spot.intensity = st.light ? 6e4 * st.brightness : 0;
    if (lastZoom !== st.zoom) { lastZoom = st.zoom; st.mag = Math.round(st.zoom * 100) / 10; }
  }
  const prop = {
    object: root, interact, sockets: [], update, size: [260, 450, 650],
    anchors: { microscope: focusA, 'microscope-eye': eyeA, 'microscope-view': viewA, 'microscope-root': root },
    lights: spot.parent ? [spot] : [],
  };
  prop.cadReady = upgradeProp(game, prop, 'stereo-microscope', {
    seat: { knob_zoom: knobZoom, knob_focus: knobFocus, knob_light: knobLight, eyepiece_l: eyeL, eyepiece_r: eyeR, scope_head: shell },
    material: { led_ring_emit: ringMat },
    onLoad(cad) {
      ring.visible = false;
      // phần còn lại của CAD (đế, trụ, cần) cũng chạm được như thân kính
      cad.traverse((o) => { if (o.isMesh) o.userData.interactAs = shell; });
    },
  });
  // phần CAD không thuộc vật động nằm dưới root → raycast trúng root: gắn tương tác chung cho root
  interact.push({ object: root, spec: interact[5].spec });
  return prop;
}

export default { id: 'stereo-microscope', name: 'Kính hiển vi soi nổi 7×–45×', build };
