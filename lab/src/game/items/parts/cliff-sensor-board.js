// Bo cảm biến chống rơi (cliff) — LED hồng ngoại 940 nm (IR333) + phototransistor (PT333) nhìn xuống sàn trong khối vách ngăn đen
// (chống lọt sáng), PCB 24 × 12 × 1.0 mm, trở hạn dòng LED 150 Ω, trở kéo lên 10 kΩ, đầu cắm 4 chân đứng (bước 1.5 — JST ZH thật trên
// mô hình CAD; game dùng vỏ cái jst-xh-4-housing): VCC · GND · LED (RD4 bật) · OUT (vào AN1…AN4), chân 1 ở −X.
// Gốc: đáy vách ngăn (mặt sát sàn), giữa LED và phototransistor. Kích thước/vị trí theo mô hình CAD robot/cliff-sensor.
import { THREE, PM, gBox, gCyl, staticParts, finalizeDef, P, colorMat, ud, socketSpec, socketsOnce, anchor, fitsKind, orientationByAxis, decal, text } from './_shared.js';
import { chip, headerPinGeo } from './_lib/pcb.js';
import { useManifestInteract } from './_lib/cad.js';

const W = 24, D = 12, T = 1.0, PCX = -1;     // PCB (tâm x = −1)
const HOUS = 9.6;                            // đáy PCB = đỉnh khối vách ngăn
const BY = HOUS, TOP = BY + T;               // 10.6
const HX = 2, ZH = -1.5, PITCH = 1.5;        // đầu cắm: tâm x, z; bước chân
const names = ['VCC', 'GND', 'LED', 'OUT'];
const xs = names.map((_, i) => HX + (i - 1.5) * PITCH);
const PIN_TIP = 13.9;                        // mũi chân header (CAD conn_pins)
const pins = names.map((n, i) => P(n, n, [xs[i], PIN_TIP, ZH], [0, 1, 0], { connector: 'jst-xh-4' }));
const LEDX = 5.66;                           // LED IR ở −X, phototransistor ở +X
const EAR = 15.5;                            // lỗ bắt vít Ø3.4 trên tai khối vách ngăn (x = 15.5, z = 0)

/** Ẩn/hiện đầu cắm CAD (vỏ + dây) khi khe có vỏ cắm của người chơi */
const _occupied = new WeakSet();
function cadPlugVisible(inst, on) {
  if (on) _occupied.delete(inst); else _occupied.add(inst);
  const p = inst?.object?.userData?.plug;
  if (p) p.visible = on;
  const n = inst?.object?.userData?.cad?.getObjectByName('conn_cliff');
  if (n) n.visible = on;
}

export default finalizeDef({
  id: 'cliff-sensor-board', name: 'Bo cảm biến chống rơi (IR)', kind: 'part', category: 'sensor', lessonId: 'cliff-ir', massG: 3,
  size: [31, 36.2, D],
  grip: { pose: 'pinch', offset: [PCX, TOP, 0], rot: [0, 0, 0] },
  pins,
  insertInto: ['robot-slot:cliff'],
  mount: { seatY: 0, holes: [[EAR, 0]], screw: 'M3', emitter: { pos: [-LEDX, 0, 0], dir: [0, -1, 0] }, receiver: { pos: [LEDX, 0, 0], dir: [0, -1, 0] } },
  provides: ['jst-xh-4'],
  electrical: { type: 'ir-reflective', led: { vf: 1.25, rOhm: 150, ifmA: 25 }, pullupOhm: 10000, output: 'analog: sàn sáng → V thấp; hố/không sàn → ~VCC' },
  // CAD (Y-up) trùng khung item: đáy khối vách ngăn y = 0, gốc giữa LED/PT, đầu cắm ở mặt trên PCB (đã cắm sẵn vỏ + 4 dây 20 mm).
  // Chân header là 1 node gộp (conn_pins) → check tool không so từng chân; vị trí đo từ GLB: x = 2 ± 0.75/2.25, mũi y = 13.9, z = −1.5.
  cad: 'robot/cliff-sensor',
  cadPinNode: () => null,
  cadOptions: {
    onBottom: false, offset: [0, 0, 0],
    onLoad(glb, root) {
      useManifestInteract(glb);
      const inst = root.userData.item;
      if (inst && _occupied.has(inst)) cadPlugVisible(inst, false);
    },
  },
  build() {
    const root = new THREE.Group();
    root.add(staticParts('cliff-board', (B) => {
      B.add(gBox(W, T, D, 0.5, 1), PM.maskGreen, { x: PCX, y: BY + T / 2 });
      // khối vách ngăn đen dưới board + 2 ống quang
      B.add(gBox(18, HOUS, 9, 0.5, 1), PM.pbtBlack, { y: HOUS / 2 });
      B.add(gBox(9, 2, 9, 0.5, 1), PM.pbtBlack, { x: 13.5, y: 8 });                                                 // tai bắt vít M3
      B.add(gCyl(1.7, 1.7, 2.1, 16), PM.hole, { x: EAR, y: 8 }, { shadow: false });
      B.add(gCyl(1.9, 1.9, 1.0, 16), colorMat(0x6a8ad8, { rough: 0.15, opacity: 0.85 }), { x: -LEDX, y: 0.3 });   // LED IR (xanh nhạt trong)
      B.add(gCyl(1.9, 1.9, 1.0, 16), colorMat(0x111111, { rough: 0.1 }), { x: LEDX, y: 0.3 });                    // phototransistor (đen)
      for (const x of [-LEDX, LEDX]) B.add(gCyl(2.05, 2.05, 0.2, 16, true), PM.hole, { x, y: 0.05 }, { shadow: false });
      chip(B.group({ y: TOP }), '0805', -7, 4, 0, 'R'); chip(B.group({ y: TOP }), '0805', -4, 4, 0, 'R'); chip(B.group({ y: TOP }), '0603', -9.5, 1.5, Math.PI / 2, 'C');
      // đầu cắm 4 chân (đứng, bước 1.5)
      const A = 3 * PITCH + 3;
      B.add(gBox(A, 4.5, 3.5, 0.3, 1), PM.nylonCream, { x: HX, y: TOP + 2.25, z: ZH });
      B.add(gBox(A - 1.2, 3.6, 2.4), PM.hole, { x: HX, y: TOP + 2.75, z: ZH }, { shadow: false });
      for (const x of xs) B.add(headerPinGeo(6.3), PM.lead, { x, y: PIN_TIP - 6.3 / 2, z: ZH });
      B.obj(() => decal('cliffsilk', W, D, (g, Wp, Hp, s) => {
        const X = (x) => (x - PCX + W / 2) * s, Z = (z) => (z + D / 2) * s;
        names.forEach((n, i) => text(g, n[0], X(xs[i]), Z(1.8), 0.8 * s, { color: '#f0f2f4' }));
        text(g, 'CLIFF IR', X(-7), Z(-3.5), 1.2 * s, { color: '#f0f2f4' });
      }, { x: PCX, y: TOP + 0.012, pxPerMm: 16 }));
    }));
    // vỏ cắm + 4 dây ngắn có sẵn (như mô hình CAD) — ẩn khi khe có vỏ cắm của người chơi
    const plug = staticParts('cliff:plug', (B) => {
      B.add(gBox(6, 4.6, 3.6, 0.3, 1), PM.nylonWhite, { x: HX, y: 13.9, z: -1.8 });
      const cols = [0xc82020, 0x1a1a1a, 0xe0c020, 0x2b5fd3];
      xs.forEach((x, i) => B.add(gCyl(0.45, 0.45, 20, 8), colorMat(cols[i], { rough: 0.5 }), { x, y: 26.2, z: ZH }));
    });
    plug.name = 'cliff-plug';
    root.add(plug);
    ud(root, 'plug', plug);
    return root;
  },
  sockets(inst) {
    return socketsOnce(inst, () => {
      // mặt cắm = đáy vỏ cắm CAD (y = 11.6); quay π quanh Y để tiếp điểm C1 của vỏ (+X cục bộ) nằm trên chân 1 (VCC, −X)
      const a = anchor(inst.object, 'xh4', [HX, TOP + 1.0, ZH], Math.PI);
      return [socketSpec(inst, {
        id: 'jst-xh-4', kind: 'jst-xh-4', anchor: a,
        accepts(item, ctx) {
          if (!fitsKind(item, 'jst-xh-4')) return { ok: false, reason: 'Chỉ nhận vỏ JST-XH 4 chân' };
          return orientationByAxis(item, a, 'z', ctx) === 'ok' ? { ok: true, orientation: 'ok' } : { ok: false, orientation: 'reversed', reason: 'Ngược chiều khoá' };
        },
        poseFor() { return new THREE.Matrix4(); },
        // vỏ cắm của người chơi thay cho đầu cắm có sẵn trên mô hình CAD
        onInsert() { cadPlugVisible(inst, false); },
        onRemove() { cadPlugVisible(inst, true); },
      })];
    });
  },
});
