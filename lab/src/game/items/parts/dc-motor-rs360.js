// Động cơ DC chổi than RS-360SH (12 V, ~9000 rpm không tải, dòng kẹt ~2.5 A): vỏ thép Ø27.7 (2 mặt vát phẳng cách 22.5 mm) × 30.1 mm
// có khe thông gió, nắp nhựa đen sau chứa chổi than, 2 cọc hàn đồng thau có lỗ cách 16 mm (chấm đỏ = +), trục Ø2.3 thò 10.4 mm,
// 2 lỗ ren M2.5 ở mặt trước. Nằm ngang trên mặt vát, trục hướng +X, cọc + ở trên. Gốc: đáy giữa (tâm vỏ thép theo X).
// state.voltage → trục quay. Kích thước/cọc theo mô hình CAD robot/rs360-motor (Mabuchi catalogue).
import { THREE, PM, gBox, gCyl, staticParts, finalizeDef, P, colorMat, ud, mesh } from './_shared.js';
import { useManifestInteract, spinSubpart } from './_lib/cad.js';

const R = 13.85, FLAT = 22.5, LB = 30.1, CAP = 3.8, TL = 5.6;
const AY = FLAT / 2;                     // trục động cơ (nằm trên mặt vát)
const SQ = FLAT / (2 * R);               // ép tròn → gần đúng 2 mặt vát
const x0 = -LB / 2;                      // mặt sau vỏ thép
const TIP = x0 - CAP - TL + 1.4;         // mũi cọc = −23.05 (CAD: y = −5.4 → item x; cọc chìm 1.4 mm vào nắp sau)
const SHAFT_END = 25.45;                 // đầu trục (CAD y = 43.1)
const pins = [P('+', '+ (chấm đỏ)', [TIP, AY + 8, 0], [-1, 0, 0], { polarity: '+' }), P('−', '−', [TIP, AY - 8, 0], [-1, 0, 0], { polarity: '−' })];

const def = finalizeDef({
  id: 'dc-motor-rs360', name: 'Động cơ DC RS-360SH', kind: 'part', category: 'motor', lessonId: 'dong-co-dc', massG: 70,
  size: [SHAFT_END - TIP, FLAT, 2 * R],
  grip: { pose: 'grip', offset: [0, FLAT, 0], rot: [0, 0, 0] },
  pins,
  insertInto: ['robot-slot:motor-360'],
  mount: { seatY: 0, face: '+X', axis: [0, AY, 0], holes: [[0, 8], [0, -8]], screw: 'M2.5' },
  electrical: { type: 'dc-motor', vNom: 12, noLoadRpm: 9000, noLoadA: 0.25, stallA: 2.5, rOhm: 4.8, kv: 750, polarity: '+ đỏ → quay CW nhìn từ trục' },
  // CAD (Y-up): trục +Y, cọc chúc −Y, cọc + ở +X. Quay Rx(π)·Rz(−π/2): CAD (x, y, z) → item (y, x, −z) ⇒ trục +X, cọc + ở trên;
  // dời để tâm vỏ thép ở x = 0 và mặt vát dưới ở y = 0.
  cad: 'robot/rs360-motor',
  cadPinNode: (p) => (p.id === '+' ? 'term_pos' : 'term_neg'),
  cadOptions: {
    rotateX: Math.PI, rotateZ: -Math.PI / 2, onBottom: false, offset: [-17.65, AY, 0],
    onLoad(glb) {
      // manifest ghi trục 'shaft' là [0,0,1] (khung CAD Z-up) → đặt lại theo hệ item
      useManifestInteract(glb, { shaft: { type: 'spin', label: 'trục động cơ', axis: [1, 0, 0], pivot: [0, AY, 0] } });
    },
  },
  build() {
    const root = new THREE.Group();
    root.add(staticParts('rs360', (B) => {
      const g = B.group({ y: AY, rz: -Math.PI / 2 });     // trục Y cục bộ → +X; x cục bộ → −Y item
      g.add(gCyl(R, R, LB, 40), PM.steelBrushed, { sx: SQ });
      g.add(gCyl(R - 0.6, R, 0.8, 40), PM.steel, { y: LB / 2 - 0.4, sx: SQ });
      // khe thông gió trên vỏ (gần đầu sau)
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.5; g.add(gBox(2.2, 5, 0.6), PM.hole, { x: Math.cos(a) * (R - 0.25) * SQ, y: -LB / 2 + 5, z: Math.sin(a) * (R - 0.25), ry: -a + Math.PI / 2 }, { shadow: false }); }
      // nắp sau nhựa + cọc
      g.add(gCyl(R - 0.3, R - 0.8, CAP, 40), PM.pbtBlack, { y: -LB / 2 - CAP / 2, sx: SQ });
      for (const s of [1, -1]) {
        g.add(gBox(2.8, TL, 0.4), PM.brass, { x: s * 8, y: TIP + TL / 2 });
        g.add(gCyl(0.6, 0.6, 0.6, 10), PM.hole, { x: s * 8, y: TIP + 1.2, rx: Math.PI / 2 }, { shadow: false });
      }
      g.add(gCyl(0.8, 0.8, 0.15, 12), colorMat(0xd02020, { rough: 0.5 }), { x: -8, y: -LB / 2 - CAP - 0.05, z: -2.6 });
      // mặt trước: bạc đỡ + lỗ vít
      g.add(gCyl(5, 5, 1.2, 24), PM.brass, { y: LB / 2 + 0.6 });
      for (const s of [1, -1]) g.add(gCyl(1.25, 1.25, 0.2, 12), PM.hole, { z: s * 8, y: LB / 2 + 0.02 }, { shadow: false });
    }));
    const SL = SHAFT_END - LB / 2;
    const shaft = mesh(gCyl(1.15, 1.15, SL, 12), PM.steel, { x: LB / 2 + SL / 2, y: AY, rz: Math.PI / 2 });
    const flat = mesh(gBox(4, 0.4, 2.0), PM.steelBrushed, { x: SHAFT_END - 2.5, y: AY + 1.0 }, { shadow: false });
    const sg = new THREE.Group(); sg.add(shaft, flat);
    root.add(sg);
    ud(root, 'shaft', { shaft, flat });
    return root;
  },
  update(inst, dt) {
    const v = inst.state?.voltage ?? 0, s = inst.object.userData.shaft;
    if (!s || !v) return;
    const rps = (Math.min(Math.abs(v), 14) * 750) / 60 * Math.sign(v);
    const a = rps * Math.PI * 2 * (dt || 0) * 0.02;      // vẽ chậm 50× để mắt thấy
    if (spinSubpart(inst, 'shaft', a)) return;           // CAD đã nạp: quay trục CAD (bộ phận con 'shaft')
    s.shaft.rotation.x += a;
    s.flat.position.y = AY + Math.cos(s.shaft.rotation.x) * 1.0; s.flat.position.z = Math.sin(s.shaft.rotation.x) * 1.0;
    s.flat.rotation.x = s.shaft.rotation.x;
  },
  spin(inst, v = 12) { (inst.state ||= {}).voltage = v; return { ok: true }; },
});
export default def;
