// Cụm bánh xe robot hút bụi (mổ từ robot gốc — Roborock S5 / Xiaomi gen1, theo mô hình CAD robot/wheel-module): lốp cao su Ø70 × 22 mm,
// mâm nhựa 6 lỗ, vỏ chụp (fender) nhựa đen 116 × 52 × 61 mm với 3 tai bắt vít ở mặt trên, cần treo = nửa hộp số (quay quanh chốt
// Ø3 tại x = 50, y = 40) + nắp hộp số 6 vít, động cơ DC (vỏ 27.6 × 22.6 × 30 mm) trục song song trục bánh, nam châm + bo Hall encoder
// dựng đứng mặt trong (−Z) với đầu cắm 1 hàng dọc chiều cao (CAD: JST-ZH 7 chân bước 1.5, đã cắm sẵn vỏ + 7 dây; game dùng 6 chân
// đầu tiên làm khe 'jst-xh-6': M+ · M− · VCC · GND · A · B theo thứ tự từ trên xuống), lò xo treo, công tắc nhấc bánh SS-5.
// Gốc: điểm lốp chạm sàn; trục bánh // Z (tâm y = 35); thân bánh xe về phía −Z. state.rpm → bánh quay.
import { THREE, PM, gBox, gCyl, staticParts, finalizeDef, P, colorMat, ud, cached, tubeGeo, socketSpec, socketsOnce, anchor, fitsKind, orientationByAxis, decal, text, tf } from './_shared.js';
import { headerPinGeo } from './_lib/pcb.js';
import { useManifestInteract, subpartOf, spinSubpart, screwOutSpecs } from './_lib/cad.js';

const WR = 35, WY = 35, WW = 22;
// đầu cắm encoder (hệ item — CAD (x, y, z) → item (z, y, −x) do rotateY = π/2)
const HN = ['M+', 'M−', 'VCC', 'GND', 'A', 'B'];
const HX = 15.13, HZ_TIP = -37.8, HZ_PCB = -34.5, HPITCH = 1.5, HY1 = 32.8;
const hy = (i) => HY1 - i * HPITCH;                       // chân 1 ở trên cùng (y = 32.8) … chân 7 (y = 23.8)
const pins = HN.map((n, i) => P(n, n, [HX, hy(i), HZ_TIP], [0, 0, -1], { connector: 'jst-xh-6' }));
const MOT = { x: 50, y: 40 };                             // trục động cơ (// Z)
const PIVOT = [50, 40, -10.5];                            // chốt cần treo
const EAR = [[62, 20], [70, -36], [-12, -36]];            // 3 tai bắt vít mặt trên (x, z)
const LID_SCREWS = [[-10, 44], [-8, 24], [22, 49], [26, 29.5], [58, 54], [60, 29]];

/** Ẩn/hiện vỏ cắm + dây có sẵn trên mô hình CAD khi khe có vỏ cắm của người chơi */
const _occupied = new WeakSet();
function cadPlugVisible(inst, on) {
  if (on) _occupied.delete(inst); else _occupied.add(inst);
  const n = inst?.object?.userData?.cad?.getObjectByName('conn_wheel');
  if (n) n.visible = on;
}

const tyreGeo = () => cached('wheel:tyre22', () => {
  const prof = [[31.5, -WW / 2], [33.2, -WW / 2], [34.6, -WW / 2 + 1.4], [WR, -WW / 2 + 3.5], [WR, WW / 2 - 3.5], [34.6, WW / 2 - 1.4], [33.2, WW / 2], [31.5, WW / 2]];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 64);
  g.rotateX(Math.PI / 2);
  return g;
});

const def = finalizeDef({
  id: 'wheel-module', name: 'Cụm bánh xe + hộp số + encoder', kind: 'part', category: 'mech', lessonId: 'banh-xe', massG: 210,
  size: [116.3, 78, 88.5],
  grip: { pose: 'grip', offset: [17, 70, -10], rot: [0, 0, 0] },
  pins,
  insertInto: ['robot-slot:wheel-left', 'robot-slot:wheel-right'],
  mount: { seatY: 0, pivot: PIVOT, pivotAxis: [0, 0, 1], wheelAxis: [0, 0, 1], wheelCenter: [0, WY, 0], holes: EAR, screw: 'M3' },
  provides: ['jst-xh-6'],
  electrical: { type: 'wheel-gearmotor', motorV: 14.4, gearRatio: 50, wheelDiaMm: 70, noLoadRpmWheel: 180, stallA: 1.9, rOhm: 7, encoder: { ppr: 1000, logic: 5, outputs: ['A', 'B'], type: 'hall' } },
  // CAD (Y-up): trục bánh // X, thân về +X → quay π/2 quanh Y (trục bánh // Z, thân về −Z như item cũ). Gốc CAD = điểm lốp chạm sàn.
  // Chân header là 1 node gộp (conn_wheel_pins) → check tool không so từng chân; vị trí đo từ GLB (mũi chân CAD x = 37.8).
  cad: 'robot/wheel-module',
  cadPinNode: () => null,
  cadOptions: {
    rotateY: Math.PI / 2, onBottom: false, offset: [0, 0, 0],
    onLoad(glb, root) {
      // manifest (đã chuẩn hoá theo phép quay) cho bánh, cần treo, nắp hộp số, vít, đầu cắm; công tắc nhấc bánh: nhấn lên (+Y)
      // vít: manifest ghi axis theo hướng vặn vào → đặt lại hướng RA theo hình học (mũ vít); nắp hộp số vẫn khoá bởi screw_1..6 (manifest)
      useManifestInteract(glb, { ...screwOutSpecs(glb, root), switch_drop: { type: 'button', label: 'công tắc nhấc bánh', axis: [0, 1, 0], travel_mm: 0.5 } });
      const inst = root.userData.item;
      if (inst && _occupied.has(inst)) cadPlugVisible(inst, false);
    },
  },
  build() {
    const root = new THREE.Group();
    // ---- bánh (động) ----
    const wheel = new THREE.Group();
    wheel.position.set(0, WY, 0);
    wheel.add(staticParts('wheel:rot22', (B) => {
      B.add(tyreGeo(), PM.rubber);
      // gai chữ V
      const blk = gBox(2.6, 1.3, 8.6, 0.3, 1);
      for (let k = 0; k < 30; k++) {
        const a = (k / 30) * Math.PI * 2;
        for (const s of [-1, 1]) B.add(blk, PM.rubber, tf({ x: Math.cos(a) * (WR - 0.4), y: Math.sin(a) * (WR - 0.4), z: s * 5.0, rz: a - Math.PI / 2, ry: s * 0.5 }));
      }
      B.add(cached('wheel:rim22', () => { const g = new THREE.CylinderGeometry(31.6, 31.6, WW - 1, 48, 1, true); g.rotateX(Math.PI / 2); return g; }), PM.absDark);
      B.add(gCyl(31.4, 31.4, 1.6, 48), PM.absDark, { z: WW / 2 - 2.5, rx: Math.PI / 2 });
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; B.add(gCyl(4.5, 4.5, 0.2, 20), PM.hole, { x: Math.cos(a) * 19, y: Math.sin(a) * 19, z: WW / 2 - 1.6, rx: Math.PI / 2 }, { shadow: false }); }
      B.add(gCyl(7, 7, 5, 24), PM.absDark, { z: WW / 2 - 1, rx: Math.PI / 2 });
      B.add(gCyl(1.6, 1.6, 0.4, 6), PM.hole, { z: WW / 2 + 1.55, rx: Math.PI / 2 }, { shadow: false });
    }));
    root.add(wheel);
    ud(root, 'wheel', wheel);
    // ---- vỏ chụp, hộp số, động cơ, encoder (tĩnh) ----
    root.add(staticParts('wheel:body2', (B) => {
      const dark = colorMat(0x26282c, { rough: 0.55 });
      // vỏ chụp (fender): tấm trên + vách trong/ngoài phía sau bánh
      B.add(gBox(116.3, 6, 61, 2, 2), dark, { x: 16.85, y: 75, z: -10.5 });
      B.add(gBox(40, 46, 2.2, 1, 1), dark, { x: 55, y: 49, z: 18.9 });
      for (const [x, z] of EAR) { B.add(gCyl(3.1, 3.1, 1.6, 16), PM.steel, { x, y: 76.1, z }); B.add(gBox(4, 0.1, 0.6), PM.hole, { x, y: 76.92, z }, { shadow: false }); }
      // cần treo (nửa hộp số) + nắp hộp số 6 vít
      B.add(gBox(82.5, 37.5, 12, 6, 2), dark, { x: 25.75, y: 38.25, z: -16 });
      B.add(gBox(82.5, 37.5, 9.2, 6, 2), colorMat(0x34373c, { rough: 0.5 }), { x: 25.75, y: 38.25, z: -25.6 });
      for (const [x, y] of LID_SCREWS) B.add(gCyl(2.7, 2.7, 1.6, 14), PM.steel, { x, y, z: -31, rx: Math.PI / 2 });
      B.add(gCyl(2, 2, 34, 16), PM.steel, { y: WY, z: -8, rx: Math.PI / 2 });                         // trục ra
      B.add(gCyl(1.55, 1.55, 14, 12), PM.steel, { x: PIVOT[0], y: PIVOT[1], z: PIVOT[2], rx: Math.PI / 2 });   // chốt cần treo
      // động cơ (trục // Z) + tấm gá
      B.add(gBox(30, 30, 1.6, 0.5, 1), PM.steel, { x: MOT.x, y: MOT.y, z: -30.3 });
      B.add(gBox(27.6, 22.6, 30.1, 4, 2), PM.steelBrushed, { x: MOT.x, y: MOT.y, z: -42.35 });
      B.add(gBox(27, 22.2, 6.4, 3, 2), PM.pbtBlack, { x: MOT.x, y: MOT.y, z: -58 });
      for (const y of [32, 48]) B.add(gBox(0.4, 2.8, 5.6), PM.brass, { x: MOT.x, y, z: -62.6 });
      // nam châm + bo Hall dựng đứng (mặt trong) + đầu cắm 1 hàng dọc
      B.add(gCyl(4, 4, 1.8, 20), colorMat(0x30343a, { rough: 0.6 }), { x: 26.1, y: 40.3, z: -30.8, rx: Math.PI / 2 });
      B.add(gBox(26, 18, 1.6, 0.5, 1), PM.maskGreen, { x: 17.1, y: 40.3, z: -33.7 });
      B.add(gBox(3, 4, 1.0), PM.epoxy, { x: 26.1, y: 40.3, z: -32.4 });
      B.add(gBox(3.5, 12, 4.5, 0.3, 1), PM.nylonCream, { x: HX, y: 28.3, z: (HZ_PCB - 39) / 2 });
      for (let i = 0; i < 7; i++) B.add(headerPinGeo(6.3), PM.lead, { x: HX, y: hy(i), z: HZ_TIP + 6.3 / 2, rx: Math.PI / 2 });
      // lò xo treo + công tắc nhấc bánh
      B.add(cached('wheel:spring2', () => {
        const pts = [];
        for (let i = 0; i <= 120; i++) { const t = i / 120, a = t * Math.PI * 2 * 7; pts.push(new THREE.Vector3(7 + Math.cos(a) * 0.9, 50.6 + t * 21.8, -20.5 + Math.sin(a) * 0.6)); }
        return tubeGeo(pts, 0.35, { radial: 5 });
      }), PM.steel);
      B.add(gBox(19.8, 11.2, 6.5, 0.4, 1), PM.pbtBlack, { x: 26, y: 64.4, z: -17.9 });
      B.add(gBox(17, 0.4, 3.6), PM.steelBrushed, { x: 25.2, y: 57.6, z: -17.9 });
      B.obj(() => decal('wheel:enc2', 18, 5, (g, W, H) => { text(g, 'HALL ENC', W / 2, H / 2, H * 0.4, { color: '#f0f2f4' }); }, { x: 19, y: 46, z: -34.52, rx: 0, ry: Math.PI, pxPerMm: 24 }));
    }));
    // vỏ cắm + 7 dây ngắn có sẵn (như mô hình CAD) — ẩn khi khe có vỏ cắm của người chơi
    const plug = staticParts('wheel:plug', (B) => {
      B.add(gBox(3.6, 10.5, 4.6, 0.3, 1), PM.nylonWhite, { x: 14.8, y: 28.35, z: -38 });
      const cols = [0xc82020, 0x1a1a1a, 0x1a1a1a, 0xe0c020, 0xc82020, 0x2b5fd3, 0x24a24c];
      for (let i = 0; i < 7; i++) B.add(gCyl(0.45, 0.45, 14, 8), colorMat(cols[i], { rough: 0.5 }), { x: 15.13, y: hy(i), z: -47.3, rx: Math.PI / 2 });
    });
    plug.name = 'wheel-plug';
    root.add(plug);
    ud(root, 'plug', plug);
    return root;
  },
  update(inst, dt) {
    const rpm = inst.state?.rpm ?? 0;
    if (!rpm) return;
    const a = -(rpm / 60) * Math.PI * 2 * (dt || 0);                 // góc quanh +Z
    const sp = subpartOf(inst, 'wheel');
    if (sp) spinSubpart(inst, 'wheel', a * Math.sign(sp.axis.z || 1)); // CAD: bánh 'wheel' quay quanh trục manifest (−Z)
    else { const w = inst.object.userData.wheel; if (w) w.rotation.z += a; }
  },
  spin(inst, rpm = 60) { (inst.state ||= {}).rpm = rpm; return { ok: true }; },
  sockets(inst) {
    return socketsOnce(inst, () => {
      // miệng đầu cắm hướng −Z; hàng chân dọc theo Y, chân 1 (C1 của vỏ, +X cục bộ) ở trên
      const a = anchor(inst.object, 'xh6', [HX, hy(2.5), -35.7]);
      a.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0)));
      a.updateMatrix();
      return [socketSpec(inst, {
        id: 'jst-xh-6', kind: 'jst-xh-6', anchor: a,
        accepts(item, ctx) {
          if (!fitsKind(item, 'jst-xh-6')) return { ok: false, reason: 'Chỉ nhận vỏ JST-XH 6 chân' };
          return orientationByAxis(item, a, 'z', ctx) === 'ok' ? { ok: true, orientation: 'ok' } : { ok: false, orientation: 'reversed', reason: 'Ngược chiều khoá' };
        },
        poseFor() { return new THREE.Matrix4(); },
        onInsert() { cadPlugVisible(inst, false); const p = inst.object.userData.plug; if (p) p.visible = false; },
        onRemove() { cadPlugVisible(inst, true); const p = inst.object.userData.plug; if (p) p.visible = true; },
      })];
    });
  },
});
export default def;
