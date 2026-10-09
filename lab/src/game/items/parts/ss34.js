// Diode Schottky SS34 (3 A, 40 V) vỏ SMA / DO-214AC: thân 4.3 × 2.6 × 2.1 mm, chân gập dưới bụng 1.4 mm,
// vạch trắng = catốt (−X). Linh kiện dán: hàn lên 2 pad (hoặc vắt 2 lỗ perfboard cách 5.08 mm).
import { THREE, PM, gBox, staticParts, decal, text, finalizeDef, P } from './_shared.js';

// kích thước theo CAD thật vendor/d_sma (KiCad D_SMA): thân 4.56 × 2.7 × cao 2.22, chân gập rộng tổng 5.0
const L = 4.56, W = 2.7, H = 2.22, TL = 5.0;
const pins = [P('K', 'K', [-TL / 2 + 0.6, 0, 0], [0, -1, 0], { polarity: 'cathode' }), P('A', 'A', [TL / 2 - 0.6, 0, 0], [0, -1, 0], { polarity: 'anode' })];

export default finalizeDef({
  id: 'ss34', name: 'Diode Schottky SS34 (SMA)', kind: 'part', category: 'semi', lessonId: 'diode', massG: 0.07,
  size: [TL, H + 0.1, W],
  grip: { pose: 'pinch', offset: [0, H, 0], rot: [0, 0, 0] },
  pins,
  smd: true,
  insertInto: ['smd-sma', 'smd-pad-pair', 'pcb-pad-pair'],
  mount: { seatY: 0, padSpan: 5.08 },
  footprint: pins.map((p) => [p.pos[0], p.pos[2]]),
  orientationKey: { pin: 'K', axis: 'x', sign: -1, mark: 'band' },
  electrical: { type: 'diode', schottky: true, vf: 0.5, ifMax: 3, vr: 40 },
  // CAD: gốc tâm, đáy (mặt pad) y = 0, vạch catốt ở −X — trùng hệ item. Giữ chữ in 'decal:ss34mark' (đặt trên mặt CAD y = 2.22).
  cad: 'vendor/d_sma',
  cadOptions: { onBottom: false, keep: ['decal:ss34mark'] },
  build() {
    const root = new THREE.Group();
    root.add(staticParts('ss34', (B) => {
      B.add(gBox(L, H - 0.15, W, 0.18, 2), PM.epoxy, { y: 0.15 + (H - 0.15) / 2 });
      // chân chữ C: đoạn đứng ở đầu thân + đoạn gập dưới bụng
      for (const s of [-1, 1]) {
        B.add(gBox(0.15, H * 0.55, 1.4), PM.lead, { x: s * (L / 2 + 0.08), y: H * 0.3 });
        B.add(gBox(1.25, 0.15, 1.4), PM.lead, { x: s * (L / 2 - 0.45), y: 0.075 });
      }
      B.add(gBox(0.75, 0.02, W - 0.25), PM.silk, { x: -L / 2 + 0.75, y: H + 0.005 }, { shadow: false });
      B.obj(() => decal('ss34mark', L - 1.6, W - 0.6, (g, Wp, Hp) => {
        text(g, 'SS34', Wp / 2, Hp * 0.36, Hp * 0.42, { color: '#d8dadc' });
        text(g, 'E4 34', Wp / 2, Hp * 0.8, Hp * 0.28, { color: '#bfc1c4', weight: '500' });
      }, { x: 0.45, y: H + 0.01, pxPerMm: 60 }));
    }));
    return root;
  },
});
