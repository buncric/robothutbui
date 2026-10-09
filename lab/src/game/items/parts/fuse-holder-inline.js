// Đế cầu chì lưỡi ATO nối dây (inline, chống nước): thân PVC đen 46 × 24 × 13 mm, nắp gài, 2 dây 14 AWG đỏ dài 100 mm
// hai đầu (đầu tuốt sẵn). Cung cấp khe 'fuse-ato' cho cầu chì lưỡi (blade-fuse-10a).
import { THREE, PM, gBox, gCyl, staticParts, finalizeDef, P, socketSpec, socketsOnce, anchor, fitsKind } from './_shared.js';
import { addCable, cableGeos, AWG } from './_lib/conn.js';

const L = 46, Wd = 24, H = 13;
const path = (s) => [[s * (L / 2 - 2), H / 2, 0], [s * (L / 2 + 8), H / 2, 0], [s * (L / 2 + 24), AWG[14].r, 4 * s], [s * (L / 2 + 100), AWG[14].r, 6 * s]];
const ends = [-1, 1].map((s) => cableGeos(`fh:${s}:14`, path(s), AWG[14].r, { core: AWG[14].core, bendR: 6 }));
const pins = ends.map((c, i) => P(String(i + 1), `dây ${i + 1}`, c.tip, c.dir, { wireEnd: true, gauge: 14 }));

export default finalizeDef({
  id: 'fuse-holder-inline', name: 'Đế cầu chì lưỡi nối dây (14 AWG)', kind: 'part', category: 'protection', lessonId: 'cau-chi', massG: 28,
  size: [L + 200, H, Wd], grip: { pose: 'grip', offset: [0, H, 0], rot: [0, 0, 0] },
  pins,
  insertInto: [],
  mount: { seatY: 0 },
  provides: ['fuse-ato'],
  electrical: { type: 'fuse-holder', internal: [['1', 'fuse.1'], ['2', 'fuse.2']], ratingA: 30 },
  build() {
    const root = new THREE.Group();
    root.add(staticParts('fuse-holder-inline', (B) => {
      B.add(gBox(L, H * 0.62, Wd, 2.5, 2), PM.pbtBlack, { y: H * 0.31 });
      // nắp gài (nửa trên) + khe trên nắp để thấy đầu cầu chì
      B.add(gBox(L - 4, H * 0.4, Wd - 2, 2.0, 2), PM.absDark, { y: H * 0.62 + H * 0.18 });
      B.add(gBox(20, 0.4, 6.2), PM.hole, { y: H - 0.15 }, { shadow: false });
      for (const s of [-1, 1]) {
        B.add(gBox(2.5, H * 0.5, 3), PM.pbtBlack, { x: s * (L / 2 - 4), y: H * 0.75, z: Wd / 2 - 0.5 });     // lẫy gài nắp
        B.add(gCyl(AWG[14].r + 0.8, AWG[14].r + 1.6, 8, 16), PM.pbtBlack, { x: s * (L / 2 + 3), y: H / 2, rz: Math.PI / 2 });   // ống chống gập dây
      }
      [-1, 1].forEach((s) => addCable(B, `fh:${s}:14`, path(s), 'red', 14, { bendR: 6 }));
    }));
    return root;
  },
  sockets(inst) {
    return socketsOnce(inst, () => {
      const a = anchor(inst.object, 'fuse', [0, H - 0.2, 0]);
      return [socketSpec(inst, {
        id: 'fuse', kind: 'fuse-ato', anchor: a,
        accepts: (item) => (fitsKind(item, 'fuse-ato') ? { ok: true, orientation: 'ok' } : { ok: false, reason: 'Chỉ nhận cầu chì lưỡi ATO/ATC' }),
        // lưỡi cầu chì cắm sâu 9 mm vào kẹp
        poseFor(item) { return new THREE.Matrix4().makeTranslation(0, -(item?.def?.mount?.seatY ?? 9), 0); },
      })];
    });
  },
});
