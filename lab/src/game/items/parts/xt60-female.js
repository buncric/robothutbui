// Đầu XT60 CÁI (XT60-F, phía pin/nguồn): nylon PA vàng 15.5 × 8.0 × 16 mm, 2 ống tiếp điểm Ø3.5 mạ vàng, cốc hàn phía sau.
// Góc vát (D-shape) phía cực "−" → chỉ cắm được 1 chiều. Miệng hướng +Z. Định mức 30 A liên tục (60 A đỉnh).
// Cung cấp khe 'xt60' cho đầu đực.
import { THREE, PM, staticParts, finalizeDef, P, socketSpec, socketsOnce, anchor, fitsKind, orientationByAxis } from './_shared.js';
import { setMaterial, hslOf } from './_lib/cad.js';
import { xt60FemaleInto, xt60Marks, XT60 } from './_lib/conn.js';

const pins = [P('+', '+', [XT60.X, XT60.H / 2, -XT60.L / 2 - 4], [0, 0, -1], { cup: true }), P('−', '−', [-XT60.X, XT60.H / 2, -XT60.L / 2 - 4], [0, 0, -1], { cup: true })];
export default finalizeDef({
  id: 'xt60-female', name: 'Đầu XT60 cái', kind: 'part', category: 'connector', lessonId: 'pack-4s-bms', massG: 4.5,
  size: [XT60.W, XT60.H, XT60.L + 5], grip: { pose: 'pinch', offset: [0, XT60.H, -2], rot: [0, 0, 0] },
  pins,
  solderCups: true,
  insertInto: [],
  mount: { seatY: 0 },
  provides: ['xt60'],
  orientationKey: { pin: '−', axis: 'x', sign: -1, mark: 'chamfer', note: 'Góc vát = cực âm' },
  electrical: { type: 'connector', ratingA: 30, contactMohm: 0.6 },
  // CAD thật vendor/amass_xt60_f_1x02_p7_2mm_vertical (bản hàn PCB đứng: miệng +Y, vát '−' ở −X): quay +90° quanh X → miệng
  // +Z như item; miệng CAD (y 16.7) trùng miệng item z = +8 → dời z −8.7; tâm thân lên y = 4. Chỉ lấy VỎ: chân PCB (pin_*)
  // ẩn, giữ cốc hàn thủ tục ('xt60-cups') vì item là đầu XT60 hàn dây.
  cad: 'vendor/amass_xt60_f_1x02_p7_2mm_vertical',
  cadOptions: { rotateX: Math.PI / 2, onBottom: false, offset: [0, XT60.H / 2, XT60.L / 2 - 16.7], hide: ['pin_*'], keep: ['xt60-cups', 'decal:xt60mark:*'],
    // vỏ nylon CAD (màu hổ phách 0.81/0.42/0.02) bị core/cad.js coi là kim loại vàng → đổi về nhựa PA vàng; chữ in đặt sát mặt trên CAD
    onLoad(glb, root) {
      setMaterial(glb, (m) => { const h = hslOf(m); return h.l < 0.5 && h.h < 0.11; }, PM.nylonYellow);
      root.traverse((m) => { if (m.name.startsWith('decal:xt60mark')) m.position.y = XT60.H + 0.07; });
    },
  },
  cadInteractSkip: ['connector'],
  build() {
    const root = new THREE.Group();
    root.add(staticParts('xt60-female', (B) => { xt60FemaleInto(B); B.obj(xt60Marks('f', -1, XT60.H + 0.01)); }));
    return root;
  },
  sockets(inst) {
    return socketsOnce(inst, () => {
      const a = anchor(inst.object, 'xt60', [0, XT60.H / 2, XT60.L / 2]);
      return [socketSpec(inst, {
        id: 'xt60', kind: 'xt60', anchor: a,
        accepts(item, ctx) {
          if (!fitsKind(item, 'xt60')) return { ok: false, reason: 'Chỉ nhận đầu XT60 đực' };
          // đầu đực phải quay ngược 180° (mặt đối mặt): trục X ngược chiều là đúng
          const o = orientationByAxis(item, a, 'x', ctx, 'opposite');
          return o === 'ok' ? { ok: true, orientation: 'ok' } : { ok: false, orientation: o, reason: 'Lệch góc vát — XT60 chỉ cắm 1 chiều' };
        },
        // đầu đực quay 180° quanh Y, chồng 7 mm lên thân cái; tâm chân đực ở y = 4.45 (vỏ dày hơn)
        poseFor() { return new THREE.Matrix4().makeTranslation(0, -(XT60.H / 2 + 0.45), 1).multiply(new THREE.Matrix4().makeRotationY(Math.PI)); },
        contacts: [{ pin: '+', mates: '+' }, { pin: '−', mates: '−' }],
      })];
    });
  },
});
