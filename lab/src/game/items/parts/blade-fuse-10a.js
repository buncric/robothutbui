// Cầu chì lưỡi ATO/ATC 10 A (đỏ): thân nhựa PC trong 19.1 × 5.1 mm, cao tổng 18.5 mm; 2 lưỡi kẽm mạ thiếc 5.6 × 0.64 mm,
// dây chảy chữ S nhìn xuyên vỏ, 2 lỗ thử trên đỉnh, số "10" nổi. Đứt: 135 % → ~30 s, 200 % → ~0.3 s, 350 % → ~70 ms.
// Gốc: mũi lưỡi (y = 0). def.setBlown(inst) → dây chảy đứt, vỏ ám khói.
import { THREE, PM, gBox, gCyl, staticParts, decal, text, finalizeDef, P, tubeGeo, cached, ownMat, ud } from './_shared.js';

const W = 19.1, T = 5.1, HB = 9.0, HT = 18.5, BL = 9.5, BX = 4.95;
const pins = [P('1', '1', [-BX, 0, 0]), P('2', '2', [BX, 0, 0])];
const bodyMat = new THREE.MeshPhysicalMaterial({ color: 0xd8262b, roughness: 0.18, metalness: 0, transmission: 0, transparent: true, opacity: 0.72, clearcoat: 1, clearcoatRoughness: 0.15 });
const elementGeo = (broken) => cached(`atoel:${broken}`, () => {
  const pts = [];
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    if (broken && t > 0.44 && t < 0.56) continue;
    pts.push(new THREE.Vector3(-3.2 + 6.4 * t, BL + 3.4 + Math.sin(t * Math.PI * 3) * 1.1, 0));
  }
  if (!broken) return tubeGeo(pts, 0.22, { radial: 6 });
  const a = pts.filter((p) => p.x < 0), b = pts.filter((p) => p.x > 0);
  const g1 = tubeGeo(a, 0.22, { radial: 6 }), g2 = tubeGeo(b, 0.22, { radial: 6 });
  return [g1, g2];
});

const def = finalizeDef({
  id: 'blade-fuse-10a', name: 'Cầu chì lưỡi ATO 10 A', kind: 'part', category: 'protection', lessonId: 'cau-chi', massG: 1.0,
  size: [W, HT, T], grip: { pose: 'pinch', offset: [0, HT, 0], rot: [0, 0, 0] },
  pins,
  insertInto: ['fuse-ato'],
  mount: { seatY: BL - 0.5 },
  electrical: { type: 'fuse', ratingA: 10, coldOhm: 0.0075, blowCurve: [[1.35, 30], [2, 0.3], [3.5, 0.07], [10, 0.007]], voltageMax: 32 },
  build() {
    const root = new THREE.Group();
    root.add(staticParts('ato10', (B) => {
      for (const s of [-1, 1]) {
        B.add(gBox(5.6, BL + 3.2, 0.64), PM.lead, { x: s * BX, y: (BL + 3.2) / 2 });
        B.add(gBox(5.6, 0.6, 0.64), PM.leadDark, { x: s * BX, y: 0.3 }, { shadow: false });   // mũi vát
        // 2 lỗ thử trên đỉnh (lộ kim loại)
        B.add(gCyl(0.9, 0.9, 0.6, 12), PM.lead, { x: s * BX, y: HT - 0.2 }, { shadow: false });
      }
      B.add(gBox(6.4, 1.0, 0.5), PM.lead, { y: BL + 2.4 }, { shadow: false });
      B.obj(() => decal('ato10', W - 6, T - 1.4, (g, Wp, Hp) => text(g, '10', Wp / 2, Hp / 2, Hp * 0.9, { color: '#ffd7d7', weight: '900' }), { y: HT + 0.02, pxPerMm: 40 }));
    }));
    const body = new THREE.Mesh(cached('atobody', () => {
      const s = new THREE.Shape();
      s.moveTo(-W / 2, 0); s.lineTo(W / 2, 0); s.lineTo(W / 2, HB - 1.5); s.lineTo(W / 2 - 1.2, HB); s.lineTo(-W / 2 + 1.2, HB); s.lineTo(-W / 2, HB - 1.5); s.lineTo(-W / 2, 0);
      const g = new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelOffset: -0.3, bevelSegments: 2 });
      g.translate(0, BL, -T / 2); g.computeVertexNormals(); return g;
    }), ownMat(bodyMat));
    body.renderOrder = 3; body.castShadow = true;
    const el = new THREE.Mesh(elementGeo(false), PM.lead);
    root.add(el, body);
    ud(root, 'fuse', { body, el });
    return root;
  },
  init(inst) { if (inst.state?.blown) def.setBlown(inst); },
  /** Dây chảy đứt: tách đôi, vỏ ám đen */
  setBlown(inst) {
    const f = inst.object.userData.fuse;
    const [a, b] = elementGeo(true);
    f.el.geometry = a;
    if (!f.el2) { f.el2 = new THREE.Mesh(b, PM.lead); inst.object.add(f.el2); }
    f.body.material.color.setHex(0x5a1515);
    f.body.material.opacity = 0.9;
    (inst.state ||= {}).blown = true;
    return { ok: true };
  },
});
export default def;
