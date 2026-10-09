// Kính hiển vi số USB/HDMI có màn 7" (kiểu Andonstar AD407, không nhãn hãng). Gốc prop = tâm đáy đế.
// Hình CAD: lab/public/models/lab/usb-microscope.glb — node 'screen' (có UV) = mặt hiển thị.
// Ảnh trực tiếp: camera ảo tại kính camera (node cam_lens) nhìn thẳng xuống đế → WebGLRenderTarget 640×360 → vẽ lên 'screen'
// (15 lần/s, chỉ khi máy bật và người chơi ở gần; tắt bằng labState(game).usbScope.live = false nếu engine tự vẽ).
// Mốc world: 'usb-scope-focus' (tâm vùng soi trên đế), 'usb-scope-cam' (kính camera, −Z cục bộ = nhìn xuống),
//            'usb-scope-screen' (tâm màn, +Z ra ngoài). prop.screen = Mesh màn hình (CAD hoặc thủ tục), prop.renderTarget.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvasPlane, text, hasDoc } from '../_tex.js';
import { mergeObject } from '../_merge.js';
import { labState, emit, play } from '../_labState.js';
import { upgradeProp, markRest, cadAvailable, cadFrame } from '../_cad.js';
import { CAD_ANCHORS } from '../_cadAnchors.js';

const A = CAD_ANCHORS?.['usb-microscope'] || {};
const P = (n, d) => new THREE.Vector3(...(A[n]?.p || d));
const Q = (n, d = [0, 0, 0, 1]) => new THREE.Quaternion(...(A[n]?.q || d));
const std = (color, metalness, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
const M = (g, m, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = {}) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; o.receiveShadow = true; return o; };
const rbox = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01));

function drawStandby(g, W, H, on) {
  g.fillStyle = on ? '#10161d' : '#050608'; g.fillRect(0, 0, W, H);
  if (!on) return;
  text(g, 'USB/HDMI 1080p · 50×', W * 0.04, H * 0.08, { size: H * 0.06, color: '#9fb3c8', bold: true });
  text(g, 'Đặt bo mạch dưới camera', W / 2, H / 2, { size: H * 0.08, color: '#cfd6de', align: 'center', bold: true });
}

export function build(game) {
  const lab = labState(game);
  const st = (lab.usbScope = lab.usbScope || { on: true, live: false, light: true, zoom: 1 });   // live: engine/ux/microscope.js tự vẽ ảnh USB lên node 'screen'
  const K = { black: std(0x1d1f22, 0.3, 0.5), white: std(0xe8e9e6, 0, 0.45), alu: std(0xc8ccd0, 0.9, 0.32), knob: std(0x45494f, 0, 0.55) };
  const root = new THREE.Group();
  root.name = 'usb-microscope';
  const focus = P('focus_point', [0, 17.2, 12]);
  const camP = P('cam_lens', [0, 74, 12]);
  const scrF = cadFrame(A.anchor_screen, [0, 362, -78], [-0.156, 0, 0, 0.988]);    // +Z = pháp tuyến màn
  const scrP = scrF.p, scrQ = scrF.q;
  // ---- thủ tục
  const shell = new THREE.Group();
  shell.add(M(rbox(210, 18, 170, 5), K.black, { y: 9 }));
  shell.add(M(new THREE.BoxGeometry(150, 0.6, 110), K.white, { y: 18.3, z: 15 }));
  shell.add(M(new THREE.CylinderGeometry(10, 10, 280, 16), K.alu, { y: 158, z: -62 }));
  shell.add(M(rbox(40, 60, 36, 4), K.black, { y: 150, z: -62 }));
  shell.add(M(new THREE.CylinderGeometry(17, 17, 118, 20), K.white, { x: camP.x, y: camP.y + 66, z: camP.z }));
  const mon = M(rbox(182, 118, 16, 6), K.black, {});
  mon.position.copy(scrP); mon.quaternion.copy(scrQ); mon.translateZ(-8);
  shell.add(mon);
  root.add(shell);
  mergeObject(shell);
  // màn hình (thủ tục): mặt phẳng tại anchor_screen
  const RW = 640, RH = 360;
  const standby = canvasPlane(155, 87, (g, W, H) => drawStandby(g, W, H, st.on), { pxPerMm: 4, maxPx: 640, fallback: '#050608', emissive: true });
  standby.position.copy(scrP); standby.quaternion.copy(scrQ); standby.translateZ(0.4);
  standby.userData.keepWithCad = true;
  root.add(standby);
  let screen = standby;
  // núm
  const knobFocus = new THREE.Group(); knobFocus.name = 'knob_focus';
  knobFocus.position.copy(P('knob_focus', [0, 150, -62])); knobFocus.add(M(new THREE.CylinderGeometry(13, 13, 58, 18).rotateZ(Math.PI / 2), K.knob));
  knobFocus.userData.dynamic = true; markRest(knobFocus); root.add(knobFocus);
  const knobLight = new THREE.Group(); knobLight.name = 'knob_light';
  knobLight.position.copy(P('knob_light', [17, 134, 12])); knobLight.add(M(new THREE.CylinderGeometry(7, 7, 6, 14).rotateZ(Math.PI / 2), K.knob));
  knobLight.userData.dynamic = true; markRest(knobLight); root.add(knobLight);
  const ledMat = std(0xffffff, 0, 0.3, { emissive: 0xf4f7ff, emissiveIntensity: 0 });
  const ring = M(new THREE.TorusGeometry(17.5, 2, 6, 24), ledMat, { x: camP.x, y: camP.y - 1, z: camP.z, rx: Math.PI / 2 });
  ring.userData.keepWithCad = true;
  root.add(ring);
  const spot = new THREE.SpotLight(0xf2f6ff, 0, 260, 0.9, 0.6, 2);
  spot.position.copy(camP); const tgt = new THREE.Object3D(); tgt.position.copy(focus); root.add(tgt); spot.target = tgt;
  // (không thêm SpotLight vào cảnh — vòng LED phát sáng là đủ; engine/ux/microscope.js tự chiếu sáng ảnh USB)
  // ---- mốc
  const aFocus = new THREE.Object3D(); aFocus.name = 'usb-scope-focus'; aFocus.position.copy(focus); root.add(aFocus);
  const aCam = new THREE.Object3D(); aCam.name = 'usb_cam'; aCam.position.copy(camP);
  aCam.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(camP, focus, new THREE.Vector3(0, 0, -1))); root.add(aCam);
  const aScr = new THREE.Object3D(); aScr.name = 'usb-scope-screen'; aScr.position.copy(scrP); aScr.quaternion.copy(scrQ); root.add(aScr);
  // ---- ảnh trực tiếp
  let rt = null, cam = null, liveMat = null, frameT = 0;
  const canLive = () => cadAvailable(game) && game?.app?.renderer?.setRenderTarget && game?.scene;
  function ensureLive() {
    if (rt || !canLive()) return !!rt;
    rt = new THREE.WebGLRenderTarget(RW, RH, { samples: 0 });
    rt.texture.name = 'usb-scope-live';
    cam = new THREE.PerspectiveCamera(14, RW / RH, 4, 400);
    cam.name = 'usb-scope-camera';
    liveMat = new THREE.MeshBasicMaterial({ map: rt.texture, toneMapped: false });
    prop.renderTarget = rt; prop.camera = cam;
    return true;
  }
  const toggle = () => { st.on = !st.on; play(game, 'click'); emit(game, st.on ? 'power:on' : 'power:off', { source: 'usb-microscope' }); standby.userData.redraw?.((g, W, H) => drawStandby(g, W, H, st.on)); };
  const interact = [
    { object: root, spec: { name: () => `Kính hiển vi số USB/HDMI (${st.on ? 'bật' : 'tắt'}) · ${Math.round(50 * st.zoom)}×`, highlight: true,
      prompts: [{ key: 'E', label: 'Bật / tắt màn hình', do: toggle }], onScroll: (ctx, d) => { st.zoom = THREE.MathUtils.clamp(st.zoom + Math.sign(d) * 0.1, 0.5, 3); } } },
    { object: knobFocus, spec: { name: () => `Núm lấy nét camera · zoom số ${st.zoom.toFixed(1)}×`, highlight: true,
      prompts: [{ key: 'LMB', label: 'Phóng to', do: () => { st.zoom = Math.min(3, st.zoom + 0.1); } }, { key: 'R', label: 'Thu nhỏ', do: () => { st.zoom = Math.max(0.5, st.zoom - 0.1); } }],
      onScroll: (ctx, d) => { st.zoom = THREE.MathUtils.clamp(st.zoom + Math.sign(d) * 0.1, 0.5, 3); } } },
    { object: knobLight, spec: { name: () => `Đèn LED camera (${st.light ? 'bật' : 'tắt'})`, highlight: true, prompts: [{ key: 'E', label: 'Bật / tắt đèn', do: () => { st.light = !st.light; play(game, 'click', { vol: 0.2 }); } }] } },
  ];
  const _p = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion();
  function update(dt = 1 / 60) {
    ledMat.emissiveIntensity = st.on && st.light ? 2.2 : 0;
    spot.intensity = st.on && st.light ? 2.5e4 : 0;
    knobFocus.rotation.x = st.zoom * 2;
    if (!st.on || !st.live || !canLive()) { if (screen.material === liveMat && standby.material) screen.material = screen.userData.offMat || screen.material; return; }
    frameT -= dt;
    if (frameT > 0) return;
    frameT = 1 / 15;
    game.camera.getWorldPosition(_p);
    aCam.getWorldPosition(_c);
    if (_p.distanceTo(_c) > 3000) return;                    // người chơi ở xa → khỏi vẽ
    if (!ensureLive()) return;
    cam.position.copy(_c);
    aCam.getWorldQuaternion(_q); cam.quaternion.copy(_q);
    cam.fov = 14 / st.zoom; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const r = game.app.renderer;
    const prevT = r.getRenderTarget(), prevAuto = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(rt);
    r.render(game.scene, cam);
    r.setRenderTarget(prevT);
    r.shadowMap.autoUpdate = prevAuto;
    if (screen.material !== liveMat) {
      screen.userData.offMat = screen.material; screen.material = liveMat;
      if (screen.userData.gltfUV) { rt.texture.repeat.set(1, -1); rt.texture.offset.set(0, 1); }   // UV glTF: v hướng xuống
    }
  }
  const prop = {
    object: root, interact, sockets: [], update, size: [210, 420, 195],
    anchors: { 'usb-scope-focus': aFocus, 'usb-scope-cam': aCam, 'usb-scope-screen': aScr, 'usb-microscope': root },
    get screen() { return screen; },
  };
  prop.cadReady = upgradeProp(game, prop, 'usb-microscope', {
    seat: { knob_focus: knobFocus, knob_light: knobLight },
    material: { led_ring_emit: ledMat },
    keep: ['screen'],
    onLoad(cad) {
      ring.visible = false;
      const s = cad.getObjectByName('screen');
      if (s?.isMesh) {
        // màn CAD (có UV) thay mặt phẳng thủ tục; flipY của RT: v của glTF hướng xuống → lật texture
        standby.visible = false;
        s.material = new THREE.MeshBasicMaterial({ map: standby.material.map, toneMapped: false });
        screen = s;
        s.userData.gltfUV = true;
        if (s.material.map) { s.material.map.flipY = false; s.material.map.needsUpdate = true; }
      }
    },
  });
  if (hasDoc()) standby.userData.redraw?.((g, W, H) => drawStandby(g, W, H, st.on));
  return prop;
}

export default { id: 'usb-microscope', name: 'Kính hiển vi số USB/HDMI', build };
