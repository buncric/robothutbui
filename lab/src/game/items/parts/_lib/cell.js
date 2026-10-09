// Pin Li-ion 18650 (dùng cho cell-18650 và pack-4s-bms). KHÔNG export default.
import { THREE, PM, cached, colorMat, gLathe, gCyl, gRing, canvasTex, text, HAS_DOC } from '../_shared.js';

// Kích thước theo mô hình CAD robot/cell-18650 (Samsung INR18650-25R: Ø18.3 × 65.0 mm, vỏ thép đáy y = 0, nắp + đỉnh y = 65.0)
export const CELL = { R: 9.15, L: 65.0 };
const WRAP = 0x2b8a57;

/** Thêm 1 cell đứng (trục Y, đáy y = 0, cực + ở trên) vào B (có thể quay bằng B.group) */
export function cellInto(B, { wrap = WRAP, label = true } = {}) {
  const R = CELL.R, L = CELL.L;
  const wrapProf = [[R * 0.74, 0.06], [R - 0.45, 0.06], [R, 0.55], [R, L - 3.2], [R - 0.35, L - 2.9], [R - 0.35, L - 2.5], [R, L - 2.2], [R, L - 1.05], [R - 0.55, L - 0.55], [R * 0.76, L - 0.5]];
  const tex = label ? wrapTex() : null;
  const wrapMat = tex ? cached('cellwrapmat', () => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0 })) : colorMat(wrap, { rough: 0.35 });
  B.add(cached('cellwrap', () => { const g = geomLathe(wrapProf, 48); return g; }), wrapMat);
  B.add(gCyl(R * 0.74, R * 0.74, 0.1, 32), PM.nickel, { y: 0.08 });                  // đáy (−)
  B.add(gRing(3.8, R * 0.76, 32), PM.fishPaper, { y: L - 0.48 }, { shadow: false });   // vòng cách điện
  B.add(gLathe('cellcap', [[0, L], [3.0, L], [3.5, L - 0.15], [3.8, L - 0.45], [3.9, L - 0.6]], 32), PM.nickel);
  for (let k = 0; k < 4; k++) B.add(gCyl(0.45, 0.45, 0.3, 8), PM.hole, { x: Math.cos(k * Math.PI / 2 + 0.4) * 3.75, y: L - 0.5, z: Math.sin(k * Math.PI / 2 + 0.4) * 3.75, rz: 0 }, { shadow: false });
}
function geomLathe(prof, seg) { return new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg); }
function wrapTex() {
  if (!HAS_DOC) return null;
  return canvasTex('cell18650wrap', 512, 512, (g, W, H) => {
    g.fillStyle = '#2b8a57'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e8efe9'; g.fillRect(0, H * 0.06, W, H * 0.012); g.fillRect(0, H * 0.93, W, H * 0.012);
    // chữ chạy dọc thân (v = dọc trục)
    for (const u of [0.25, 0.75]) {
      g.save(); g.translate(W * u, H * 0.5); g.rotate(-Math.PI / 2);
      text(g, 'INR18650-25R', 0, -W * 0.03, H * 0.07, { color: '#f2f6f3' });
      text(g, '3.6V  2500mAh  20A', 0, W * 0.04, H * 0.04, { color: '#f2f6f3', weight: '600' });
      g.restore();
    }
    text(g, '⊕', W * 0.5, H * 0.03, H * 0.035, { color: '#f2f6f3' });
  });
}
