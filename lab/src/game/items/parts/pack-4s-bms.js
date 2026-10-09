// Pack pin 4S1P: 4 × 18650 (INR 2500 mAh) nằm ngang theo X, xếp cạnh nhau theo Z (bước 18.5), đảo cực xen kẽ, nối tiếp bằng kẽm niken
// 0.15 × 8 mm, giấy cách điện (barley paper) + kapton, mạch bảo vệ BMS 4S 20 A (45 × 16 mm) dán trên lưng, bọc màng co PVC xanh trong
// (71 × 22.8 × 75.2 mm). Dây ra 14 AWG đỏ/đen dài 80 mm về −X → đầu XT60 CÁI (miệng hướng −X; khe 'xt60' cho đầu đực của robot);
// dây cân bằng B0…B4 về +X → vỏ JST-XH 5P. 12.0–16.8 V, danh định 14.4 V, 36 Wh. Hình học theo mô hình CAD robot/battery-4s1p-pack.
// Gốc: đáy giữa khối cell (đáy màng co ở y = 0). state.cells = [V1…V4].
import { THREE, PM, gBox, gCyl, staticParts, finalizeDef, P, colorMat, socketSpec, socketsOnce, anchor, fitsKind, orientationByAxis, decal, text } from './_shared.js';
import { cellInto, CELL } from './_lib/cell.js';
import { soic, chip } from './_lib/pcb.js';
import { xt60FemaleInto, addCable, XT60 } from './_lib/conn.js';
import { useManifestInteract } from './_lib/cad.js';

const R = CELL.R, L = CELL.L, DZ = 18.5;
const CY = 9.75;                               // trục cell (đáy màng co y = 0, cell nằm trên lớp màng 0.6)
const zc = (k) => (1.5 - k) * DZ;              // cell 1 ở +Z … cell 4 ở −Z (như CAD)
const XS = 32.77;                              // mặt kẽm niken ở hai đầu cell
const WRAP = { W: 71, H: 22.8, D: 75.2 };
const BMS = { x: -4, y: 19.3, W: 45, T: 1.2, D: 16 };
const XT = { face: -128.5, cx: -120.5, y: 20.7, tip: -131.5, lead0: -112.5, lead1: -32.5 };   // XT60 + dây ra (CAD)
const BAL = { x0: 14.5, x1: 74.9, y0: 16.2, pitch: 2.5, hx: 79.7 };
// cực + ở −Z (dây đỏ lead_pos), cực − ở +Z (CAD) — XT60 cái lật ngửa quanh trục cắm (vát '−' vẫn đúng phía)
const pins = [P('P+', 'P+ (đỏ)', [XT.tip, XT.y, -XT60.X], [-1, 0, 0], { polarity: '+' }), P('P−', 'P− (đen)', [XT.tip, XT.y, XT60.X], [-1, 0, 0], { polarity: '−' })];

const def = finalizeDef({
  id: 'pack-4s-bms', name: 'Pack pin 4S 18650 + BMS', kind: 'part', category: 'power', lessonId: 'pack-4s-bms', massG: 205,
  size: [BAL.hx + 4.8 - XT.tip, 27.4, WRAP.D],
  grip: { pose: 'grip', offset: [0, WRAP.H, 0], rot: [0, 0, 0] },
  pins,
  insertInto: ['robot-slot:battery'],
  mount: { seatY: 0, outline: [WRAP.W, WRAP.H, WRAP.D] },
  provides: ['xt60'],
  electrical: {
    type: 'battery-pack', series: 4, parallel: 1, vNom: 14.4, vMax: 16.8, vMin: 12.0, capacityAh: 2.5, rIntOhm: 0.1,
    bms: { ovpV: 4.25, uvpV: 2.7, ocpA: 20, scpA: 100, scpDelayUs: 300, balanceMa: 40 }, taps: ['B0', 'B1', 'B2', 'B3', 'B4'],
  },
  // CAD (Y-up) trùng hướng item: chỉ nâng 0.3 mm (đáy màng co CAD ở y = −0.3). Tiếp điểm XT60 là 1 node gộp → check tool không so
  // từng chân; vị trí đo từ GLB: mũi x = −131.5, y = 20.7, z = ∓3.6.
  cad: 'robot/battery-4s1p-pack',
  cadPinNode: () => null,
  cadOptions: {
    onBottom: false, offset: [0, 0.3, 0],
    onLoad(glb) {
      useManifestInteract(glb);
      // màng co trong suốt (GLB: alpha 0.45, BLEND) — core/cad.js enhance() tạo vật liệu mới đục → đặt lại độ trong
      const w = glb.getObjectByName('shrink_wrap');
      if (w) w.traverse((m) => { if (m.isMesh && m.material) { m.material = m.material.clone(); m.material.transparent = true; m.material.opacity = 0.45; m.material.depthWrite = false; m.castShadow = false; } });
    },
  },
  build() {
    const root = new THREE.Group();
    root.add(staticParts('pack-4s-bms2', (B) => {
      for (let k = 0; k < 4; k++) {
        const plusX = k % 2 === 0;    // cell 1, 3: cực + ở +X
        cellInto(B.group({ x: plusX ? -L / 2 : L / 2, y: CY, z: zc(k), rz: plusX ? -Math.PI / 2 : Math.PI / 2 }));
      }
      // kẽm niken: nối tiếp 1-2 (+X), 2-3 (−X), 3-4 (+X); tab B− (cell 1, −X) và B+ (cell 4, −X) vòng lên BMS
      const spot = colorMat(0x8a8f94, { metal: 1, rough: 0.55 });
      const strip = (x, z0, z1) => {
        B.add(gBox(0.15, 8, Math.abs(z1 - z0) + 8), PM.nickel, { x, y: CY, z: (z0 + z1) / 2 }, { shadow: false });
        for (const z of [z0, z1]) for (const [dy, dz] of [[-2, -2], [-2, 2], [2, -2], [2, 2]]) B.add(gCyl(0.55, 0.55, 0.1, 8), spot, { x: x + Math.sign(x) * 0.08, y: CY + dy, z: z + dz, rz: Math.PI / 2 }, { shadow: false });
      };
      strip(XS, zc(0), zc(1)); strip(-XS, zc(1), zc(2)); strip(XS, zc(2), zc(3));
      for (const k of [0, 3]) {
        B.add(gBox(0.15, 8, 8), PM.nickel, { x: -XS, y: CY, z: zc(k) }, { shadow: false });
        B.add(gBox(8, 0.15, 8), PM.nickel, { x: -XS + 4, y: BMS.y + 0.2, z: zc(k) }, { shadow: false });
        B.add(gBox(0.15, BMS.y - CY, 8), PM.nickel, { x: -XS, y: (CY + BMS.y) / 2, z: zc(k) }, { shadow: false });
      }
      // giấy cách điện + kapton + BMS
      B.add(gBox(61, 0.3, 72), PM.fishPaper, { y: 19.05 }, { shadow: false });
      B.add(gBox(50, 0.1, 20), PM.kapton, { x: BMS.x, y: 19.25 }, { shadow: false });
      const bms = B.group({ x: BMS.x, y: BMS.y });
      bms.add(gBox(BMS.W, BMS.T, BMS.D, 0.4, 1), PM.maskBlue, { y: BMS.T / 2 });
      for (let i = 0; i < 4; i++) for (const zz of [-4, 4]) soic(bms.group({ y: BMS.T }), 8, -14 + i * 6.2, zz, Math.PI / 2, { W: 3.9, H: 1.5 });
      soic(bms.group({ y: BMS.T }), 16, 12, 0, Math.PI / 2, { pitch: 0.65, W: 3.9, H: 1.4, L: 5.0 });
      chip(bms.group({ y: BMS.T }), '2512', 4, 0, Math.PI / 2, 'R');
      ['B−', 'B1', 'B2', 'B3', 'B+'].forEach((n, i) => bms.add(gBox(4, 0.06, 2.4), PM.hasl, { x: 18.5, y: BMS.T + 0.03, z: -6 + i * 3 }, { shadow: false }));
      B.obj(() => decal('bms4s2', BMS.W, BMS.D, (g, W, H, s) => {
        const X = (x) => (x + BMS.W / 2) * s, Z = (z) => (z + BMS.D / 2) * s, c = '#f0f2f4';
        text(g, '4S 20A BMS', X(-12), Z(6.5), 1.6 * s, { color: c });
        text(g, 'B− B1 B2 B3 B+', X(13), Z(-7), 0.9 * s, { color: c });
      }, { x: BMS.x, y: BMS.y + BMS.T + 0.02, pxPerMm: 9 }));
      // dây cân bằng (5 sợi xếp chồng theo Y, z = 0) → vỏ JST-XH 5P
      const tapCols = ['black', 'red', 'red', 'red', 'red'];
      for (let i = 0; i < 5; i++) { const y = BAL.y0 + i * BAL.pitch; addCable(B, `bal2:${i}`, [[BAL.x0, y, 0], [BAL.x1, y, 0]], tapCols[i], 22, { strip: 0, bendR: 1 }); }
      B.add(gBox(9.6, 12.4, 5.4, 0.3, 1), PM.nylonCream, { x: BAL.hx, y: BAL.y0 + 2 * BAL.pitch, z: -0.3 });
      // dây ra 14 AWG (đỏ −Z, đen +Z) → XT60 cái, miệng hướng −X (lật ngửa: Rx(π)·Ry(−π/2))
      addCable(B, 'pack2:p+', [[XT.lead1, XT.y, -XT60.X], [XT.lead0, XT.y, -XT60.X]], 'red', 14, { strip: 0, bendR: 1 });
      addCable(B, 'pack2:p-', [[XT.lead1, XT.y, XT60.X], [XT.lead0, XT.y, XT60.X]], 'black', 14, { strip: 0, bendR: 1 });
      xt60FemaleInto(B.group({ x: XT.cx, y: XT.y + XT60.H / 2, rx: Math.PI, ry: -Math.PI / 2 }));
      for (const sz of [-1, 1]) B.add(gCyl(2.0, 2.0, XT.face - XT.tip, 18, true), PM.gold, { x: (XT.face + XT.tip) / 2, y: XT.y, z: sz * XT60.X, rz: Math.PI / 2 }, { shadow: false });   // ống tiếp điểm nhô 3 mm (CAD)
      // màng co PVC xanh trong
      B.add(gBox(WRAP.W, WRAP.H, WRAP.D, 3, 2), colorMat(0x1f4fa0, { rough: 0.3, opacity: 0.45 }), { y: WRAP.H / 2 }, { shadow: false });
    }));
    return root;
  },
  init(inst) { inst.state ||= {}; inst.state.cells ??= [3.7, 3.7, 3.7, 3.7]; inst.state.bmsTripped ??= false; },
  /** Điện áp pack (V) = tổng 4 cell (0 nếu BMS đã ngắt) */
  packVoltage(inst) { const s = inst.state || {}; return s.bmsTripped ? 0 : (s.cells || [3.7, 3.7, 3.7, 3.7]).reduce((a, b) => a + b, 0); },
  sockets(inst) {
    return socketsOnce(inst, () => {
      // miệng XT60 cái ở x = −128.5, hướng −X; khung khe lật ngửa (Rx(π)·Ry(−π/2)) như thân XT60 → +X cục bộ = −Z (cực +)
      const a = anchor(inst.object, 'xt60', [XT.face, XT.y, 0], -Math.PI / 2, Math.PI);
      return [socketSpec(inst, {
        id: 'xt60', kind: 'xt60', anchor: a,
        accepts(item, ctx) {
          if (!fitsKind(item, 'xt60')) return { ok: false, reason: 'Chỉ nhận đầu XT60 đực' };
          return orientationByAxis(item, a, 'x', ctx, 'opposite') === 'ok' ? { ok: true, orientation: 'ok' } : { ok: false, orientation: 'reversed', reason: 'Lệch góc vát — XT60 chỉ cắm 1 chiều' };
        },
        poseFor() { return new THREE.Matrix4().makeTranslation(0, -(XT60.H / 2 + 0.45), 1).multiply(new THREE.Matrix4().makeRotationY(Math.PI)); },
      })];
    });
  },
});
export default def;
