// Pin Li-ion 18650 (INR, NMC) 3.6 V 2500 mAh 20 A: Ø18.3 × 65.0 mm, vỏ thép mạ niken bọc màng PVC co nhiệt, nắp dương có van CID
// + 4 lỗ thoát khí, vòng giấy cách điện (fish paper). Đứng: cực − ở đáy (y = 0), cực + ở đỉnh.
// state.v (V), state.soc (0…1). Chú ý: màng PVC rách ở vai cực + → chạm vỏ (−) = đoản mạch!
import { THREE, staticParts, finalizeDef, P } from './_shared.js';
import { cellInto, CELL } from './_lib/cell.js';

export default finalizeDef({
  id: 'cell-18650', name: 'Pin Li-ion 18650 (2500 mAh)', kind: 'part', category: 'power', lessonId: 'pin-18650', massG: 45,
  size: [CELL.R * 2, CELL.L, CELL.R * 2],
  grip: { pose: 'grip', offset: [0, CELL.L / 2, 0], rot: [0, 0, 0] },
  pins: [P('+', '+', [0, CELL.L, 0], [0, 1, 0], { polarity: '+' }), P('−', '−', [0, 0, 0], [0, -1, 0], { polarity: '−' })],
  insertInto: ['cell-holder-18650'],
  mount: { seatY: 0 },
  orientationKey: { pin: '+', axis: 'y', sign: 1, mark: 'button-top' },
  electrical: { type: 'cell', chem: 'Li-ion NMC', vNom: 3.6, vMax: 4.2, vMin: 2.5, capacityAh: 2.5, rIntOhm: 0.02, maxA: 20, defaultV: 3.7 },
  build() {
    const root = new THREE.Group();
    root.add(staticParts('cell-18650', (B) => cellInto(B)));
    return root;
  },
  // Mô hình CAD thật (Z-up → Y-up: trục cell = +Y, đáy vỏ y = 0, nắp + ở đỉnh y = 65.0) — khung trùng khung item, không cần xoay.
  cad: 'robot/cell-18650',
  cadOptions: { onBottom: false, offset: [0, 0, 0] },
  cadPinNode: (p) => (p.id === '+' ? 'cap_pos' : 'can'),
  init(inst) { inst.state ||= {}; inst.state.v ??= 3.7; inst.state.soc ??= 0.5; },
});
