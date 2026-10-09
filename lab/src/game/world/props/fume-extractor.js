// Máy hút khói hàn để bàn: vỏ nhựa bo tròn 200 × 250 × 110 mm trên chân nghiêng, lưới tản gió phía trước,
// cánh quạt 5 lá (quay khi bật, có quán tính), tấm lọc than hoạt tính phía sau, công tắc có đèn. E = bật/tắt.
// labState(game).fume.on — minigame hàn kiểm tra để chấm điểm an toàn (khói nhựa thông).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvasPlane, text } from '../_tex.js';
import { mergeObject } from '../_merge.js';
import { labState, emit, play } from '../_labState.js';
import { upgradeProp, markRest } from '../_cad.js';

const std = (color, metalness, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
const M = (g, m, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, cast = true } = {}) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = cast; o.receiveShadow = true; return o; };
const rbox = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01));

export function build(game) {
  const lab = labState(game);
  const K = {
    shell: new THREE.MeshPhysicalMaterial({ color: 0xe2e5e9, roughness: 0.42, clearcoat: 0.3 }),
    dark: std(0x2b2f35, 0, 0.5), black: std(0x16181b, 0, 0.5), chrome: std(0xdfe3e8, 1, 0.18), filter: std(0x101112, 0, 1),
    blade: std(0x23262b, 0, 0.45), rubber: std(0x1f2124, 0, 0.9),
  };
  const root = new THREE.Group();
  root.name = 'fume-extractor';
  // đế + chân chữ U (bản lề nghiêng)
  const base = new THREE.Group();
  root.add(base);
  base.add(M(rbox(170, 14, 150, 5), K.dark, { y: 7 }));
  for (const sx of [-1, 1]) {
    base.add(M(rbox(10, 120, 26, 4), K.dark, { x: sx * 108, y: 70, z: 0 }));
    base.add(M(new THREE.CylinderGeometry(9, 9, 6, 20), K.black, { x: sx * 116, y: 125, rz: Math.PI / 2 }));    // núm khoá góc
    base.add(M(new THREE.BoxGeometry(20, 10, 26), K.dark, { x: sx * 95, y: 12, z: 0 }));
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) base.add(M(new THREE.CylinderGeometry(7, 7, 3, 14), K.rubber, { x: sx * 70, y: 0.5, z: sz * 60 }));
  // thân quạt nghiêng 10° về phía trước
  const head = new THREE.Group();
  head.position.set(0, 125, 0);
  head.rotation.x = -0.17;
  root.add(head);
  head.add(M(rbox(200, 220, 110, 14), K.shell, {}));
  // lỗ gió trước: vòng + nan
  const grill = new THREE.Group();
  grill.position.set(0, 0, 55.5);
  for (let r = 20; r <= 85; r += 13) grill.add(M(new THREE.TorusGeometry(r, 1.6, 6, 48), K.dark));
  for (let i = 0; i < 4; i++) grill.add(M(new THREE.BoxGeometry(172, 3, 3), K.dark, { rz: (i * Math.PI) / 4 }));
  grill.add(M(new THREE.CylinderGeometry(16, 16, 4, 24), K.dark, { rx: Math.PI / 2 }));
  head.add(grill);
  head.add(M(new THREE.CylinderGeometry(88, 88, 3, 48, 1, true), K.black, { z: 53, rx: Math.PI / 2, cast: false }));
  head.add(M(new THREE.CircleGeometry(88, 48), K.black, { z: 18, cast: false }));
  // cánh quạt (động)
  const fan = new THREE.Group();
  fan.position.set(0, 0, 38);
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(14, -10); bladeShape.quadraticCurveTo(52, -24, 80, -6); bladeShape.quadraticCurveTo(70, 18, 14, 10); bladeShape.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 1.6, bevelEnabled: true, bevelSize: 0.6, bevelThickness: 0.6, bevelSegments: 1, curveSegments: 10 });
  for (let i = 0; i < 5; i++) { const b = M(bladeGeo, K.blade, { rx: 0.32, cast: false }); const piv = new THREE.Group(); piv.rotation.z = (i / 5) * Math.PI * 2; piv.add(b); fan.add(piv); }
  fan.add(M(new THREE.CylinderGeometry(16, 18, 16, 24), K.blade, { rx: Math.PI / 2 }));
  head.add(fan);
  // tấm lọc than hoạt tính phía sau
  head.add(M(rbox(180, 200, 12, 3), K.filter, { z: -58 }));
  head.add(M(rbox(190, 210, 4, 3), K.dark, { z: -64 }));
  // công tắc trên đỉnh + nhãn
  const swMat = std(0x8a1410, 0, 0.35, { emissive: 0xff2a14, emissiveIntensity: 0 });
  const sw = M(rbox(22, 8, 14, 2), swMat, { x: 60, y: 112, z: 20 });
  head.add(sw);
  const lab2 = canvasPlane(120, 22, (g, Wp, Hp) => {
    g.clearRect(0, 0, Wp, Hp);
    text(g, 'FUME EXTRACTOR · LỌC THAN HOẠT TÍNH', Wp / 2, Hp * 0.35, { size: Hp * 0.28, color: '#2b2f35', align: 'center', bold: true });
    text(g, 'Bật TRƯỚC khi hàn · cách mối hàn 15–25 cm', Wp / 2, Hp * 0.75, { size: Hp * 0.22, color: '#5a616b', align: 'center' });
  }, { pxPerMm: 5, transparent: true, fallback: '#e2e5e9' });
  lab2.position.set(0, -98, 55.4);
  lab2.castShadow = false;
  lab2.userData.keep = true;
  lab2.userData.keepWithCad = true;
  head.add(lab2);
  fan.userData.dynamic = true; sw.userData.dynamic = true;
  head.userData.dynamic = true;
  mergeObject(root);                // đế
  head.userData.dynamic = false;
  mergeObject(head);                // thân (giữ quạt + công tắc động)
  mergeObject(fan); fan.userData.dynamic = true;
  markRest(fan, sw);

  const st = lab.fume;
  let w = 0;
  const toggle = () => {
    st.on = !st.on;
    play(game, 'click');
    emit(game, st.on ? 'fume:on' : 'fume:off', {});
    emit(game, st.on ? 'power:on' : 'power:off', { source: 'fume-extractor' });
  };
  const interact = [{ object: root, spec: { name: () => `Máy hút khói hàn (${st.on ? 'đang chạy' : 'tắt'})`, highlight: true, prompts: [{ key: 'E', label: 'Bật / tắt quạt hút', do: toggle }] } }];
  function update(dt = 1 / 60) {
    const target = st.on ? 32 : 0;           // rad/s (hiển thị — tránh răng cưa thời gian)
    w += (target - w) * Math.min(1, dt * (st.on ? 1.2 : 0.5));
    fan.rotation.z -= w * dt;
    swMat.emissiveIntensity = st.on ? 1.6 : 0;
    sw.rotation.x = st.on ? -0.15 : 0.15;
  }
  const prop = { object: root, interact, sockets: [], update, anchors: { 'fume-intake': grill }, size: [240, 250, 160] };
  // hình CAD (cad/src/lab/fume_extractor.py — cùng khung): cánh quạt CAD gắn vào nhóm quạt quay
  prop.cadReady = upgradeProp(game, prop, 'fume-extractor', { seat: { fan: fan, switch_power: sw }, material: { switch_power: swMat } });
  return prop;
}

export default { id: 'fume-extractor', name: 'Máy hút khói hàn', build };
