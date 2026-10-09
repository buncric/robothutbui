// Đầu XT60 ĐỰC (XT60-M, phía tải/ESC/robot): vỏ nylon vàng bao ngoài, 2 chân Ø3.5 mạ vàng có rãnh lò xo, cốc hàn phía sau.
// Miệng hướng +Z; góc vát "−" ở +X cục bộ (khi cắm quay 180° sẽ trùng góc vát đầu cái).
import { THREE, PM, staticParts, finalizeDef, P } from './_shared.js';
import { setMaterial, hslOf } from './_lib/cad.js';
import { xt60MaleInto, xt60Marks, XT60 } from './_lib/conn.js';

const yc = XT60.H / 2 + 0.45;
const pins = [P('+', '+', [-XT60.X, yc, -8 - 4], [0, 0, -1], { cup: true }), P('−', '−', [XT60.X, yc, -8 - 4], [0, 0, -1], { cup: true })];
export default finalizeDef({
  id: 'xt60-male', name: 'Đầu XT60 đực', kind: 'part', category: 'connector', lessonId: 'pack-4s-bms', massG: 4.8,
  size: [XT60.W + 0.9, XT60.H + 0.9, 21], grip: { pose: 'pinch', offset: [0, XT60.H + 0.9, -3], rot: [0, 0, 0] },
  pins,
  solderCups: true,
  insertInto: ['xt60'],
  mount: { seatY: 0 },
  orientationKey: { pin: '−', axis: 'x', sign: 1, mark: 'chamfer' },
  electrical: { type: 'connector', ratingA: 30, contactMohm: 0.6 },
  // CAD thật vendor/amass_xt60_m_1x02_p7_2mm_vertical (bản hàn PCB đứng: miệng +Y, vát ở −X): quay +90° quanh X (miệng +Z) và
  // 180° quanh Y (vát sang +X như item — khi cắm quay 180° trùng vát đầu cái); đỉnh CAD (y 16) = mặt trước item z = +8.
  // Chỉ lấy VỎ: chân PCB ẩn, giữ cốc hàn thủ tục ('xt60-cups').
  cad: 'vendor/amass_xt60_m_1x02_p7_2mm_vertical',
  cadOptions: { rotateX: Math.PI / 2, rotateY: Math.PI, onBottom: false, offset: [0, XT60.H / 2 + 0.45, -8], hide: ['pin_*'], keep: ['xt60-cups', 'decal:xt60mark:*'],
    // vỏ nylon CAD (màu hổ phách 0.81/0.42/0.02) bị core/cad.js coi là kim loại vàng → đổi về nhựa PA vàng; chữ in đặt sát mặt trên CAD
    onLoad(glb, root) {
      setMaterial(glb, (m) => { const h = hslOf(m); return h.l < 0.5 && h.h < 0.11; }, PM.nylonYellow);
      root.traverse((m) => { if (m.name.startsWith('decal:xt60mark')) m.position.y = XT60.H / 2 + 0.45 + 4.07; });
    },
  },
  cadInteractSkip: ['connector'],
  build() {
    const root = new THREE.Group();
    root.add(staticParts('xt60-male', (B) => { xt60MaleInto(B); B.obj(xt60Marks('m', 1, XT60.H + 0.91, -3)); }));
    return root;
  },
});
