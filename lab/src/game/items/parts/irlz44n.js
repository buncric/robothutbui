// MOSFET kênh N logic-level IRLZ44N (55 V, 47 A, Rds 22 mΩ @ Vgs 5 V) vỏ TO-220AB:
// thân nhựa 10.16 × 9.15 × 4.45 mm, tab tản nhiệt đồng mạ niken dày 1.27 mm có lỗ Ø3.7 (bắt vít M3), 3 chân G-D-S bước 2.54.
// Gốc: đầu chân. Mặt chữ (+Z), tab ở sau (−Z). Tab nối D.
import { THREE, PM, gBox, staticParts, decal, text, extrudeY, circlePath, cached, finalizeDef, taperBox, P, mergeGeometries, socketSpec, socketsOnce, anchor, fitsKind } from './_shared.js';

// Kích thước theo CAD thật vendor/to_220_3_vertical (KiCad TO-220-3_Vertical): thân 10.25 × 9.2 × 4.45, đáy thân cao 3.68 trên
// mặt PCB, chân 9.75 dưới mặt PCB (tổng 13.43), tab tới 18.78 trên PCB, mặt phẳng chân z = +0.93 (lệch về mặt chữ).
const LEAD = 13.43;                 // chiều dài chân dưới thân (3.68 trên PCB + 9.75 xuyên/thò dưới)
const SEAT = 9.75;                  // mặt PCB (mặt tựa) so với đầu chân
const BW = 10.16, BH = 9.2, BT = 4.45, TAB_T = 1.27, TAB_H = 5.9;
const y0 = LEAD;                    // đáy thân
const zLead = 0.93;                 // mặt phẳng chân (CAD)
const pins = ['G', 'D', 'S'].map((n, i) => P(n, n, [(i - 1) * 2.54, 0, zLead], [0, -1, 0], { num: i + 1, role: { G: 'gate', D: 'drain', S: 'source' }[n] }));

function tabGeo() {
  return cached('to220tab', () => {
    const s = new THREE.Shape();
    const w = BW / 2, h0 = 0, h1 = BH + TAB_H;
    s.moveTo(-w, h0); s.lineTo(w, h0); s.lineTo(w, h1 - 2.6); s.lineTo(w - 0.6, h1 - 2.2); s.lineTo(w - 0.6, h1 - 1.6); s.lineTo(w, h1 - 1.2); s.lineTo(w, h1);
    s.lineTo(-w, h1); s.lineTo(-w, h1 - 1.2); s.lineTo(-w + 0.6, h1 - 1.6); s.lineTo(-w + 0.6, h1 - 2.2); s.lineTo(-w, h1 - 2.6); s.lineTo(-w, h0);
    s.holes.push(circlePath(0, h1 - 2.85, 1.85));
    const g = new THREE.ExtrudeGeometry(s, { depth: TAB_T, bevelEnabled: false, curveSegments: 20 });
    g.computeVertexNormals();
    return g;
  });
}
function leadGeo() {
  return cached('to220lead', () => {
    const parts = [];
    const add = (g, y) => { const n = g.toNonIndexed(); n.translate(0, y, 0); n.deleteAttribute('uv'); parts.push(n); };
    add(taperBox(0.81, 0.5, 0.5, 0.5), 0.25);
    add(new THREE.BoxGeometry(0.81, LEAD - 4.0, 0.5), 0.5 + (LEAD - 4.0) / 2);
    add(taperBox(1.4, 0.81, 0.5, 0.5), LEAD - 3.25);
    add(new THREE.BoxGeometry(1.4, 3.2, 0.5), LEAD - 1.4);
    const g = mergeGeometries(parts, false); g.computeVertexNormals(); return g;
  });
}

export default finalizeDef({
  id: 'irlz44n', name: 'MOSFET IRLZ44N (TO-220)', kind: 'part', category: 'semi', lessonId: 'mosfet', massG: 2.0,
  size: [BW, LEAD + BH + TAB_H, BT],
  grip: { pose: 'pinch', offset: [0, LEAD + BH * 0.6, 0], rot: [0, 0, 0] },
  pins,
  insertInto: ['pcb-hole', 'bb-hole', 'to220'],
  mount: { seatY: SEAT, pitch: 2.54 },
  footprint: pins.map((p) => [p.pos[0], p.pos[2]]),
  orientationKey: { pin: 'G', axis: 'z', sign: 1, mark: 'text-front', note: 'Nhìn mặt chữ, chân trái → phải: G, D, S' },
  electrical: { type: 'nmos', vth: [1, 2], rdsOn: 0.022, rdsOnVgs: 5, idMax: 47, vds: 55, rthJA: 62, rthJC: 1.4, tabNet: 'D' },
  // CAD: gốc = tâm, y = 0 mặt PCB, chân 1 = G ở −X, tab (D) ở −Z, mặt chữ +Z — trùng hệ item → chỉ dời lên SEAT.
  // Thân CAD trơn → giữ chữ in 'decal:irlz44n:mark' (dời sát mặt chữ CAD z = +2.23).
  cad: 'vendor/to_220_3_vertical',
  cadOptions: {
    onBottom: false, offset: [0, SEAT, 0], keep: ['decal:irlz44n:mark'],
    onLoad(glb, root) { root.traverse((m) => { if (m.name === 'decal:irlz44n:mark') m.position.z = BT / 2 + 0.02; }); },
  },
  build() {
    const root = new THREE.Group();
    root.add(staticParts('irlz44n', (B) => {
      const body = cached('to220body', () => {
        const s = new THREE.Shape();
        const w = BW / 2;
        s.moveTo(-w, 0); s.lineTo(w, 0); s.lineTo(w, BH - 0.6); s.lineTo(w - 0.6, BH); s.lineTo(-w + 0.6, BH); s.lineTo(-w, BH - 0.6); s.lineTo(-w, 0);
        const g = new THREE.ExtrudeGeometry(s, { depth: BT - TAB_T, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.15, bevelOffset: -0.15, bevelSegments: 1 });
        g.computeVertexNormals();
        return g;
      });
      B.add(body, PM.epoxy, { y: y0, z: -BT / 2 + TAB_T });
      B.add(tabGeo(), PM.nickel, { y: y0, z: -BT / 2 });
      B.inst(leadGeo(), PM.lead, pins.map((p) => new THREE.Matrix4().makeTranslation(p.pos[0], 0, zLead)), { shadow: true });
      // vết đẩy khuôn tròn trên mặt chữ
      B.add(new THREE.CircleGeometry(1.1, 20), PM.epoxyGloss, { x: 0, y: y0 + BH - 2.2, z: BT / 2 + 0.205 }, { shadow: false });
      B.obj(() => decal('irlz44n:mark', BW - 1.2, 5.2, (g, W, H) => {
        text(g, 'IR', W * 0.5, H * 0.16, H * 0.2, { color: '#cfd1d4', weight: '900', italic: true });
        text(g, 'IRLZ44N', W * 0.5, H * 0.48, H * 0.22, { color: '#cfd1d4' });
        text(g, 'P 433K', W * 0.5, H * 0.78, H * 0.16, { color: '#bfc1c4', weight: '600' });
      }, { y: y0 + 3.6, z: BT / 2 + 0.21, rx: 0, pxPerMm: 40 }));
    }));
    return root;
  },
  /** Lỗ tab Ø3.7: khe bắt vít M3 (gắn tản nhiệt) */
  sockets(inst) {
    return socketsOnce(inst, () => {
      const a = anchor(inst.object, 'tab-hole', [0, SEAT + 16.0, -BT / 2], 0, -Math.PI / 2);   // tâm lỗ tab Ø3.7 đo trên CAD (y = 16.0 trên PCB)
      return [socketSpec(inst, { id: 'tab-m3', kind: 'screw-m3', anchor: a, accepts: (item) => (fitsKind(item, 'screw-m3') ? { ok: true, orientation: 'ok' } : { ok: false, reason: 'Lỗ tab chỉ bắt vít M3 / tản nhiệt' }) })];
    });
  },
});
