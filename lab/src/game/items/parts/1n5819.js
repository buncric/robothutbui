// Diode Schottky 1N5819 (1 A, 40 V, Vf ≈ 0.45 V) vỏ DO-41: thân Ø2.7 × 5.2 mm epoxy đen, vạch bạc = catốt (−X),
// chân Ø0.86 × 28 mm (chưa bẻ). Dùng chống ngược cực / diode xả cho cuộn dây.
import { THREE, PM, gLathe, canvasTex, cached, colorMat, text } from './_shared.js';
import { leadedDef, bandGeo } from './_lib/thru.js';
import { cadNodes, hideMeshes, isMetal, cropMesh } from './_lib/cad.js';

const PROF = [[0.43, -2.62], [0.95, -2.6], [1.25, -2.45], [1.35, -2.1], [1.35, 2.1], [1.25, 2.45], [0.95, 2.6], [0.43, 2.62]];
const axisY = 1.35;

export default leadedDef({
  id: '1n5819', name: 'Diode Schottky 1N5819 (DO-41)', category: 'semi', lessonId: 'diode', massG: 0.35, size: [62, 2.7, 2.7],
  axial: { halfBody: 2.62, axisY, leadLen: 28, names: ['K', 'A'], radius: 0.43 },
  grip: { pose: 'pinch', offset: [0, axisY, 0], rot: [0, 0, 0] },
  // CAD thật vendor/d_do_41_p10_16mm_horizontal: thân Ø2.7 trục y = 1.85 (kê 0.5 mm trên PCB), vạch catốt ở −X (= K của item).
  // Chỉ lấy THÂN: phần chân bẻ sẵn bước 10.16 (vật liệu kim loại) ẩn, đĩa nhỏ ở chân cắt bỏ (|x| > 3); chân dây thủ tục giữ
  // nguyên (bẻ/cắt được). Dời trục CAD về axisY của item; giữ lớp chữ in 'do41-print'.
  cad: 'vendor/d_do_41_p10_16mm_horizontal',
  cadOptions: {
    offset: [0, axisY - 1.85, 0],
    keep: ['do41-print'],
    onLoad(glb, root) {
      for (const n of cadNodes(glb, 'diode_do41')) {
        hideMeshes(n, isMetal);
        n.traverse((m) => { if (m.isMesh && m.visible) cropMesh(m, root, (x) => Math.abs(x) < 3.0, 'do41'); });
      }
    },
  },
  body(B) {
    const g = B.group({ y: axisY, rz: -Math.PI / 2 });
    g.add(gLathe('do41', PROF, 24), PM.epoxy);
    // vạch catốt (bạc xám) ở đầu −X (sau khi quay rz −90°: t âm → x âm)
    g.add(bandGeo(PROF, -2.15, -1.45, 'do41'), colorMat(0xb9bdc2, { rough: 0.45 }));
    B.obj(() => {
      const t = canvasTex('do41print', 256, 64, (gx, W, H) => {
        gx.clearRect(0, 0, W, H);
        for (const u of [0.25, 0.75]) {
          gx.save(); gx.translate(W * u, H / 2); gx.rotate(-Math.PI / 2);
          text(gx, 'SR', 0, -W * 0.03, H * 0.0 + W * 0.05, { color: '#c9cbce' });
          gx.restore();
        }
        text(gx, '1N5819', W * 0.5, H * 0.5, H * 0.55, { color: '#c9cbce' });
      });
      if (!t) return null;
      const m = new THREE.Mesh(cached('do41printgeo', () => { const c = new THREE.CylinderGeometry(1.36, 1.36, 2.8, 24, 1, true); c.rotateZ(-Math.PI / 2); return c; }),
        cached('do41printmat', () => new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })));
      m.position.set(0.6, axisY, 0);
      m.name = 'do41-print';
      return m;
    });
  },
  pinInfo: { K: { polarity: 'cathode', band: true }, A: { polarity: 'anode' } },
  orientationKey: { pin: 'K', axis: 'x', sign: -1, mark: 'band', note: 'Vạch bạc = catốt (K)' },
  insertInto: ['pcb-hole', 'bb-hole', 'screw-terminal'],
  electrical: { type: 'diode', schottky: true, vf: 0.45, ifMax: 1, vr: 40 },
});
