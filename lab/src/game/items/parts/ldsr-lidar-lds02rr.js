// Cảm biến lidar tam giác lượng LDS02RR (lidar robot hút bụi): khung đế nhựa đen 92 × 76 × 9 mm, đầu quay Ø70 × 22 mm (cửa sổ lọc IR
// ở mặt trước +Z, laser 785 nm + thấu kính thu) trên puly Ø40, dây đai cao su từ động cơ DC Ø12 mm treo DƯỚI khung (góc +X/−Z);
// bo mạch đế dưới khung có 2 đầu cắm chúc xuống: JST-PH 4 (5V · GND · TX · NC, x = −23…−29) và JST-PH 2 động cơ (M+ · M−).
// ~5 vòng/s, 360 điểm/vòng, UART 115200 (3.3 V). Hình học theo mô hình CAD robot/lidar-turret (đã cắm sẵn 2 vỏ + dây 25 mm).
// def.update: đầu quay khi state.motorV > 0 (tốc độ ∝ áp động cơ).
// Gốc: điểm thấp nhất (đầu các đoạn dây) ở y = 0, tâm trục quay ở x = z = 0; mặt dưới khung đế ở y = 36.6.
import { THREE, PM, gBox, gCyl, staticParts, finalizeDef, P, tubeGeo, cached, colorMat, ud, decal, text } from './_shared.js';
import { useManifestInteract, spinSubpart } from './_lib/cad.js';

const Y0 = 36.6;              // mặt dưới khung đế (CAD y = 0)
const FW = 92, FD = 76, FH = 9;
const TY = Y0 + 3;            // đáy puly đầu quay
const TR = 35, TH = 22;       // nắp đầu quay
const MX = 30, MZ = -26;      // trục động cơ (dưới khung)
const PIN_Y = Y0 - 9.4;       // mũi chân header (chúc xuống)
const pins = [
  P('5V', '5V', [-23, PIN_Y, 0], [0, -1, 0]), P('GND', 'GND', [-25, PIN_Y, 0], [0, -1, 0]), P('TX', 'TX (3.3 V)', [-27, PIN_Y, 0], [0, -1, 0]),
  P('M+', 'Motor +', [-9, PIN_Y, 22], [0, -1, 0]), P('M−', 'Motor −', [-11, PIN_Y, 22], [0, -1, 0]),
];
const HOLES = [[-41, 33], [-41, -33], [41, 33], [41, -33]];

const def = finalizeDef({
  id: 'ldsr-lidar-lds02rr', name: 'Lidar LDS02RR', kind: 'part', category: 'sensor', lessonId: 'lidar-lds', massG: 165,
  size: [FW, 71.6, FD],
  grip: { pose: 'grip', offset: [0, TY + 10 + TH, 0], rot: [0, 0, 0] },
  pins,
  insertInto: ['robot-slot:lidar'],
  mount: { seatY: Y0, holes: HOLES, screw: 'M3', window: { dir: [0, 0, 1] } },
  electrical: { type: 'lidar', vcc: 5, peakA: 1.0, uart: { baud: 115200, logic: 3.3, pin: 'TX' }, motor: { nominalV: 3, rpm: 300 }, rangeMm: [150, 6000], points: 360 },
  // CAD (Y-up): đầu cắm ở +X, động cơ ở −X, cửa sổ ở −Z → quay π quanh Y (cửa sổ ra +Z, đầu cắm ra −X như item cũ);
  // dời lên 36.6 mm để đầu dây thấp nhất chạm y = 0. Chân header là node gộp → check tool không so; đo từ GLB (đầu chân y −9.4).
  cad: 'robot/lidar-turret',
  cadPinNode: () => null,
  cadOptions: {
    rotateY: Math.PI, onBottom: false, offset: [0, Y0, 0],
    onLoad(glb) { useManifestInteract(glb); },
  },
  build() {
    const root = new THREE.Group();
    root.add(staticParts('lds02rr', (B) => {
      // khung đế + gối đỡ ổ bi
      B.add(gBox(FW, FH, FD, 2, 2), PM.pbtBlack, { y: Y0 + FH / 2 });
      for (const [x, z] of HOLES) B.add(gCyl(1.6, 1.6, 0.2, 14), PM.hole, { x, y: Y0 + FH + 0.02, z }, { shadow: false });
      B.add(gCyl(8, 8, 1.6, 24), PM.steel, { y: Y0 + FH + 0.8 });
      // bo mạch đế (dưới khung) + đầu cắm chúc xuống
      B.add(gBox(56, 1.6, 34, 0.3, 1), PM.maskGreen, { x: -8, y: Y0 - 3.8, z: 10 });
      B.add(gBox(9.9, 6, 4.5, 0.2, 1), PM.nylonWhite, { x: -26, y: Y0 - 7.6 });
      B.add(gBox(5.9, 6, 4.5, 0.2, 1), PM.nylonWhite, { x: -10, y: Y0 - 7.6, z: 22 });
      for (const p of pins) B.add(gBox(0.5, 7.8, 0.5), PM.lead, { x: p.pos[0], y: Y0 - 5.5, z: p.pos[2] }, { shadow: false });
      // động cơ treo dưới khung, trục xuyên lên puly
      B.add(gCyl(6, 6, 19.5, 24), PM.steelBrushed, { x: MX, y: Y0 - 9.75, z: MZ });
      B.add(gCyl(0.75, 0.75, 11, 10), PM.steel, { x: MX, y: Y0 + 4.5, z: MZ });
      B.add(gCyl(3, 3, 4, 18), PM.brass, { x: MX, y: Y0 + 11, z: MZ });
      // dây đai cao su (puly đầu quay r 20 ↔ puly động cơ r 3)
      B.add(cached('lds:belt2', () => {
        const R1 = 20.4, R2 = 3.4, cx = MX, cz = MZ, L = Math.hypot(cx, cz), ang = Math.atan2(cz, cx), b = Math.acos((R1 - R2) / L);
        const loop = [];
        for (let k = 0; k <= 56; k++) { const t = ang + b + (k / 56) * (Math.PI * 2 - 2 * b); loop.push(new THREE.Vector3(Math.cos(t) * R1, 0, Math.sin(t) * R1)); }
        for (let k = 0; k <= 12; k++) { const t = ang - b + (k / 12) * 2 * b; loop.push(new THREE.Vector3(cx + Math.cos(t) * R2, 0, cz + Math.sin(t) * R2)); }
        loop.push(loop[0].clone());
        return tubeGeo(loop, 0.8, { radial: 6, caps: false });
      }), PM.rubber, { y: Y0 + 11 });
      // 2 vỏ cắm + đoạn dây 25 mm (như mô hình CAD)
      B.add(gBox(7.95, 6, 4.4, 0.2, 1), PM.nylonWhite, { x: -26, y: Y0 - 8.6, z: -0.3 });
      B.add(gBox(3.95, 6, 4.4, 0.2, 1), PM.nylonWhite, { x: -10, y: Y0 - 8.6, z: 21.7 });
      const WC = [['red', -23, 0], ['black', -25, 0], ['yellow', -27, 0], ['white', -29, 0], ['red', -9, 22], ['black', -11, 22]];
      for (const [c, x, z] of WC) B.add(gCyl(0.55, 0.55, 25, 8), colorMat({ red: 0xc82020, black: 0x1a1a1a, yellow: 0xe0c020, white: 0xeeeeee }[c], { rough: 0.5 }), { x, y: 12.5, z });
    }));
    // đầu quay (động)
    const turret = new THREE.Group();
    turret.position.y = TY;
    turret.add(staticParts('lds02rr:turret2', (B) => {
      B.add(gCyl(20, 20, 10, 40), PM.absDark, { y: 5 });                                  // puly
      B.add(gCyl(TR, TR, TH - 4, 48), colorMat(0x2a2c30, { rough: 0.45 }), { y: 10 + (TH - 4) / 2 });
      B.add(gCyl(TR - 0.5, TR, 2.6, 48), colorMat(0x232528, { rough: 0.4 }), { y: 10 + TH - 4 + 1.3 });
      B.add(gCyl(TR - 3, TR - 0.5, 1.4, 48), colorMat(0x2e3034, { rough: 0.5 }), { y: 10 + TH - 0.7 });
      // cửa sổ IR (dải kính tối bóng ở mặt trước +Z)
      B.add(cached('lds:win2', () => new THREE.CylinderGeometry(TR + 0.05, TR + 0.05, 9, 24, 1, true, -0.6, 1.2)), PM.glassDark, { y: 19.5 });
      B.add(gCyl(2.6, 2.6, 2, 18), PM.lensGlass, { x: -7, y: 19.5, z: TR - 0.6, rx: Math.PI / 2 });     // thấu kính thu
      B.add(gCyl(1.2, 1.2, 2, 14), colorMat(0x6a1a1a, { rough: 0.2 }), { x: 9, y: 19.5, z: TR - 0.6, rx: Math.PI / 2 }); // laser
    }));
    const logo = decal('lds:top', 30, 8, (g, W, H) => text(g, 'LDS02RR', W / 2, H / 2, H * 0.6, { color: '#8a8f96' }), { y: 10 + TH + 0.02, pxPerMm: 20 });
    if (logo) turret.add(logo);
    root.add(turret);
    ud(root, 'turret', turret);
    return root;
  },
  /** Quay đầu lidar: state.motorV (V) → ~100 vòng/phút mỗi volt (3 V ≈ 300 rpm = 5 vòng/s) */
  update(inst, dt) {
    const t = inst.object.userData.turret;
    const v = inst.state?.motorV ?? 0;
    if (t && v > 0.3) {
      const rps = Math.min(8, v * 100 / 60), a = -rps * Math.PI * 2 * (dt || 0);
      if (!spinSubpart(inst, 'head', a)) t.rotation.y += a;        // CAD: quay node 'head' (bộ phận con spin)
      inst.state.rpm = rps * 60;
    }
  },
  spin(inst, volts = 3) { (inst.state ||= {}).motorV = volts; return { ok: true, rpm: volts * 100 }; },
});
export default def;
