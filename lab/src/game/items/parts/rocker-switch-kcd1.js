// Công tắc bập bênh KCD1-101 (SPST, 6 A/250 VAC, ~10 A/12 VDC): mặt viền 21 × 15 mm, thân lọt lỗ 19 × 13 mm sâu 13 mm,
// lẫy gài panel, 2 cọc hàn 4.8 × 0.5 mm có lỗ. Phím in "O" / "I". def.toggle(inst) → bật/tắt (phím nghiêng ±12°).
// Gốc: mũi cọc (y = 0); mặt tựa panel (đáy viền) y = 21.
import { THREE, PM, gBox, staticParts, decal, text, finalizeDef, P, ud } from './_shared.js';

const TER = 8, BODY = 13, BZ = 2.2;
const SEAT = TER + BODY;
const pins = [P('1', '1', [-2.5, 0, 0], [0, -1, 0], { spade: 4.8 }), P('2', '2', [2.5, 0, 0], [0, -1, 0], { spade: 4.8 })];

const def = finalizeDef({
  id: 'rocker-switch-kcd1', name: 'Công tắc bập bênh KCD1 (ON/OFF)', kind: 'part', category: 'switch', lessonId: 'cau-chi', massG: 4,
  size: [21, SEAT + BZ + 3, 15], grip: { pose: 'pinch', offset: [0, SEAT, 0], rot: [0, 0, 0] },
  pins,
  insertInto: ['panel-cutout-19x13'],
  mount: { seatY: SEAT, cutout: [19, 13] },
  electrical: { type: 'switch', poles: 1, contactMohm: 10, ratingA: 6, state: 'on → 1–2 nối' },
  build() {
    const root = new THREE.Group();
    root.add(staticParts('kcd1', (B) => {
      B.add(gBox(18.6, BODY, 12.6, 0.4, 1), PM.pbtBlack, { y: TER + BODY / 2 });
      for (const s of [-1, 1]) B.add(gBox(6, 4, 0.9), PM.pbtBlack, { y: SEAT - 4, z: s * 6.75, rx: s * 0.18 });   // lẫy gài
      B.add(gBox(21, BZ, 15, 0.8, 2), PM.pbtBlack, { y: SEAT + BZ / 2 });
      B.add(gBox(14.4, 0.4, 10.4, 0.2, 1), PM.hole, { y: SEAT + BZ - 0.1 }, { shadow: false });
      for (const p of pins) {
        B.add(gBox(4.8, TER + 1, 0.5), PM.lead, { x: p.pos[0], y: (TER + 1) / 2, ry: Math.PI / 2 });
        B.add(gBox(1.0, 1.4, 0.6), PM.hole, { x: p.pos[0], y: 3.2, ry: Math.PI / 2 }, { shadow: false });
      }
    }));
    // phím bập bênh (động)
    const rocker = new THREE.Group();
    rocker.position.set(0, SEAT + BZ - 1.2, 0);
    const cap = new THREE.Mesh(cachedRocker(), PM.pbtBlack);
    cap.castShadow = true;
    rocker.add(cap);
    const lab = decal('kcd1:OI', 12.8, 9.4, (g, W, H) => {
      text(g, 'O', W * 0.25, H / 2, H * 0.55, { color: '#f2f2f2' });
      text(g, 'I', W * 0.75, H / 2, H * 0.6, { color: '#f2f2f2' });
    }, { y: 3.42, pxPerMm: 30 });
    if (lab) rocker.add(lab);
    root.add(rocker);
    ud(root, 'rocker', rocker);
    setAngle(rocker, false);
    return root;
  },
  init(inst) { setAngle(inst.object.userData.rocker, !!inst.state?.on); },
  /** Bật/tắt; trả { ok, on } */
  toggle(inst) {
    const st = inst.state || (inst.state = {});
    st.on = !st.on;
    setAngle(inst.object.userData.rocker, st.on);
    return { ok: true, on: st.on, sound: 'click' };
  },
  isClosed(inst) { return !!inst?.state?.on; },
});
function cachedRocker() {
  return def_rockerGeo || (def_rockerGeo = (() => {
    const s = new THREE.Shape();
    s.moveTo(-6.6, 0); s.lineTo(6.6, 0); s.lineTo(6.6, 3.0); s.quadraticCurveTo(3.3, 2.0, 0, 2.6); s.quadraticCurveTo(-3.3, 3.4, -6.6, 4.2); s.lineTo(-6.6, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 9.8, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelOffset: -0.3, bevelSegments: 2 });
    g.translate(0, 0, -4.9); g.computeVertexNormals(); return g;
  })());
}
let def_rockerGeo = null;
function setAngle(rocker, on) { if (rocker) rocker.rotation.z = on ? -0.2 : 0.0; }
export default def;
