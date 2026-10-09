// Cặp XT60 đực + cái đang cắm vào nhau (bộ đầu nối pin ↔ robot). Cốc hàn 2 đầu lộ ra để hàn dây 14 AWG.
// Gốc: đáy giữa; trục cắm theo Z (đầu cái phía −Z, đầu đực phía +Z).
import { THREE, PM, staticParts, finalizeDef, P } from './_shared.js';
import { xt60FemaleInto, xt60MaleInto, xt60Marks, XT60 } from './_lib/conn.js';
import { setMaterial, hslOf, hideObj, cadNodes } from './_lib/cad.js';
import { loadCad } from '../../../core/cad.js';

const nylon = (glb) => setMaterial(glb, (m) => { const h = hslOf(m); return h.l < 0.5 && h.h < 0.11; }, PM.nylonYellow);

const yc = XT60.H / 2 + 0.45;
const ZF = -5;                         // tâm thân cái
const ZM = ZF + XT60.L / 2 + 1;        // gốc thân đực (quay 180°)
const pins = [
  P('F+', 'cái +', [XT60.X, yc, ZF - XT60.L / 2 - 4], [0, 0, -1], { cup: true, net: 'P+' }),
  P('F−', 'cái −', [-XT60.X, yc, ZF - XT60.L / 2 - 4], [0, 0, -1], { cup: true, net: 'P−' }),
  P('M+', 'đực +', [XT60.X, yc, ZM + 12], [0, 0, 1], { cup: true, net: 'P+' }),
  P('M−', 'đực −', [-XT60.X, yc, ZM + 12], [0, 0, 1], { cup: true, net: 'P−' }),
];
export default finalizeDef({
  id: 'xt60-pair', name: 'Cặp đầu XT60 (đực + cái)', kind: 'part', category: 'connector', lessonId: 'pack-4s-bms', massG: 9.3,
  size: [XT60.W + 0.9, XT60.H + 0.9, 40], grip: { pose: 'pinch', offset: [0, XT60.H, 0], rot: [0, 0, 0] },
  pins,
  solderCups: true,
  insertInto: [],
  mount: { seatY: 0 },
  mated: true,
  electrical: { type: 'connector', ratingA: 30, internal: [['F+', 'M+'], ['F−', 'M−']] },
  // CAD thật: def.cad = vỏ CÁI (vendor/amass_xt60_f…, đặt như xt60-female + dời (0, 0.45, ZF)); vỏ ĐỰC (vendor/amass_xt60_m…)
  // nạp thêm trong onLoad, đặt như xt60-male trong nhóm (z = ZM, quay 180° Y). Chân PCB ẩn, giữ cốc hàn thủ tục 'xt60-cups'.
  cad: 'vendor/amass_xt60_f_1x02_p7_2mm_vertical',
  cadOptions: {
    rotateX: Math.PI / 2, onBottom: false, offset: [0, XT60.H / 2 + 0.45, ZF + XT60.L / 2 - 16.7], hide: ['pin_*'], keep: ['xt60-cups', 'decal:xt60mark:*'],
    onLoad(glb, root) {
      nylon(glb);
      root.traverse((m) => { if (m.name.startsWith('decal:xt60mark')) m.position.y = XT60.H + 0.45 + 0.07; });
      if (typeof window === 'undefined') return;
      loadCad('vendor/amass_xt60_m_1x02_p7_2mm_vertical').then((m) => {
        const w = new THREE.Group(); w.name = 'cad-male';
        w.position.z = ZM; w.rotation.y = Math.PI;
        m.rotation.set(Math.PI / 2, Math.PI, 0);
        m.position.set(0, XT60.H / 2 + 0.45, -8);
        for (const n of cadNodes(m, 'pin_*')) hideObj(n);
        nylon(m);
        m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        w.add(m); root.add(w);
      }).catch(() => {});
    },
  },
  cadInteractSkip: ['connector'],
  build() {
    const root = new THREE.Group();
    root.add(staticParts('xt60-pair', (B) => {
      xt60FemaleInto(B.group({ y: 0.45, z: ZF }));
      xt60MaleInto(B.group({ z: ZM, ry: Math.PI }));
      B.obj(xt60Marks('pair', -1, XT60.H + 0.46, ZF - 3));
    }));
    return root;
  },
});
