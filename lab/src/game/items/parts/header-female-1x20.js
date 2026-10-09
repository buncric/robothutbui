// Hàng rào cái 1×20, bước 2.54 mm: thân PBT đen 2.54 × 8.5 × 2.5 mm, lỗ vuông 1.0 có lá tiếp điểm mạ vàng (2 lá kẹp),
// đuôi 0.64 dài 3.0 mm. Mỗi ô là 1 khe 'header-female' (nhận chân đực header / dây Dupont đực / chân module).
// Gốc: đầu đuôi (y = 0); mặt tựa (đáy nhựa) y = 3.0; miệng lỗ y = 11.5.
import { THREE, PM, gBox, staticParts, finalizeDef, tf, socketSpec, socketsOnce, anchor, fitsKind, PITCH } from './_shared.js';
import { femaleCellGeo } from './_lib/pcb.js';

const N = 20, TAIL = 3.1, HB = 8.5, TOP = TAIL + HB;   // TAIL 3.1 theo CAD thật (vendor/pinsocket_1x20_p2_54mm_vertical)
const pins = Array.from({ length: N }, (_, i) => ({ id: String(i + 1), name: String(i + 1), pos: [+((i - (N - 1) / 2) * PITCH).toFixed(3), 0, 0], dir: [0, -1, 0] }));

export default finalizeDef({
  id: 'header-female-1x20', name: 'Hàng rào cái 1×20 (2.54 mm)', kind: 'part', category: 'connector', lessonId: 'esp32-s3', massG: 2.4,
  size: [N * PITCH, TOP, 2.5],
  grip: { pose: 'pinch', offset: [0, TOP, 0], rot: [0, 0, 0] },
  pins,
  insertInto: ['pcb-hole', 'bb-hole'],
  mount: { seatY: TAIL, pitch: PITCH },
  provides: ['header-female'],
  footprint: pins.map((p) => [p.pos[0], p.pos[2]]),
  // CAD thật: hàng ô dọc Z (chân 1 ở z −24.13), đuôi 3.1, thân 8.5 → quay +90° quanh Y (chân 1 ở −X) và dời lên TAIL
  cad: 'vendor/pinsocket_1x20_p2_54mm_vertical',
  cadOptions: { rotateY: Math.PI / 2, onBottom: false, offset: [0, TAIL, 0] },
  build() {
    const root = new THREE.Group();
    root.add(staticParts('header-female-1x20', (B) => {
      B.inst(femaleCellGeo(HB), PM.pbtBlack, pins.map((p) => tf({ x: p.pos[0], y: TAIL + HB / 2 })), { shadow: true });
      B.inst(gBox(1.0, 0.05, 1.0), PM.hole, pins.map((p) => tf({ x: p.pos[0], y: TOP - 2.5 })));
      // 2 lá tiếp điểm vàng mỗi lỗ (nhìn thấy qua miệng lỗ)
      B.inst(gBox(0.8, 2.0, 0.12), PM.gold, pins.flatMap((p) => [tf({ x: p.pos[0], y: TOP - 1.6, z: 0.38, rx: -0.15 }), tf({ x: p.pos[0], y: TOP - 1.6, z: -0.38, rx: 0.15 })]));
      // đuôi dưới
      B.inst(gBox(0.64, TAIL + 0.6, 0.64), PM.gold, pins.map((p) => tf({ x: p.pos[0], y: (TAIL + 0.6) / 2 })), { shadow: true });
    }));
    return root;
  },
  sockets(inst) {
    return socketsOnce(inst, () => pins.map((p) => {
      const a = anchor(inst.object, `hf:${p.id}`, [p.pos[0], TOP, 0]);
      return socketSpec(inst, {
        id: p.id, kind: 'header-female', anchor: a, pin: p.id, tolerance: { pos: 1.0, angleDeg: 10 },
        accepts(item) {
          if (this.occupiedBy) return { ok: false, reason: `Ô ${p.id} đã có chân` };
          return fitsKind(item, 'header-female') || fitsKind(item, 'header') ? { ok: true, orientation: 'ok' } : { ok: false, reason: 'Chỉ nhận chân đực 0.64 mm' };
        },
        // chân đực cắm sâu 6 mm: mặt tựa item (đáy nhựa) chạm miệng lỗ
        poseFor(item, pinId) {
          const d = item?.def;
          const pp = d?.getPins?.(item) ?? d?.pins ?? [];
          const q = (pinId && pp.find((x) => x.id === pinId)) || pp[0];
          return new THREE.Matrix4().makeTranslation(-(q?.pos[0] ?? 0), -(d?.mount?.seatY ?? 0), -(q?.pos[2] ?? 0));
        },
      });
    }));
  },
});
