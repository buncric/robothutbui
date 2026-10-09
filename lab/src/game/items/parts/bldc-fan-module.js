// Quạt hút BLDC của robot hút bụi (theo mô hình CAD robot/bldc-fan): bo driver Ø36 ở đáy (đầu cắm JST-PH 4 chúc xuống), động cơ BLDC
// rotor ngoài, vỏ xoắn ốc (volute) ABS xám 73.7 × 63.4 × 23.5 mm, cánh ly tâm Ø38 cong ngược bên trong, nắp trên bắt 3 vít có miệng hút
// Ø35 (+Y), ống thổi ra tiếp tuyến x 20…35 mm hướng −Z; dây 4 sợi 150 mm: V+ (đỏ) · GND (đen) · PWM (xanh) · FG (vàng, 2 xung/vòng).
// Gốc: mặt sàn dưới đầu cắm (dây chúc xuống rồi chạy trên sàn về −X), tâm trục quạt ở x = z = 0.
// state.duty (0…1) → cánh quay (tối đa ~30 000 rpm, vẽ chậm).
import { THREE, PM, gBox, gCyl, staticParts, finalizeDef, P, ud, cached, extrudeY, tf, circlePath } from './_shared.js';
import { addCable, cableGeos, AWG } from './_lib/conn.js';
import { useManifestInteract, spinSubpart, screwOutSpecs } from './_lib/cad.js';

const Y0 = 23;                                   // mặt dưới bo driver (CAD y = 0)
const VY = Y0 + 23.5, VH = 23.5, CY = Y0 + 48;   // vỏ xoắn: đáy / cao / đỉnh nắp
const WIRES = [['V+', 'red'], ['GND', 'black'], ['PWM', 'blue'], ['FG', 'yellow']];
const WX = (i) => -7 + i * 2, WZ = 9;            // vỏ JST-PH 4 (bước 2.0) dưới bo driver
// dây: ra khỏi vỏ cắm chúc xuống sàn, đi +Z một đoạn (so le để không chéo nhau) rồi về −X
const wpath = (i) => [[WX(i), Y0 - 6, WZ], [WX(i), AWG[24].r, WZ], [WX(i), AWG[24].r, 18 + i * 2.5], [-40, AWG[24].r, 18 + i * 2.5], [-150, AWG[24].r, 12 + i * 6]];
const ends = WIRES.map((w, i) => cableGeos(`fan2:${i}:24`, wpath(i), AWG[24].r, { core: AWG[24].core, bendR: 3 }));
const pins = WIRES.map(([n, c], i) => P(n, `${n} (${c})`, ends[i].tip, ends[i].dir, { wireEnd: true, wire: c }));

const R0 = 22.5, R1 = 33.5, OUT = 22.9;
const SCREWS = [[0, 34], [-32.5, -7.5], [34, 13]];   // 3 vít nắp (vấu Ø7.2 trên vỏ xoắn)
const voluteGeo = () => cached('fan:volute2', () => {
  // xoắn ốc r: R0 → R1 trong 1 vòng, rồi ống ra tiếp tuyến (shape +Y ↦ thế giới −Z), lưỡi gà ở (R0, 0)
  const s = new THREE.Shape();
  const N = 72;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2, r = R0 + (R1 - R0) * (i / N);
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.lineTo(R1, OUT); s.lineTo(R0, OUT); s.lineTo(R0, 0);
  s.holes.push(circlePath(0, 0, 19.8));          // buồng cánh quạt
  return extrudeY(s, VH, { bevel: 1.0, bevelSeg: 2, curveSeg: 8 });
});

const def = finalizeDef({
  id: 'bldc-fan-module', name: 'Quạt hút BLDC (volute)', kind: 'part', category: 'motor', lessonId: 'quat-bldc', massG: 180,
  size: [188, CY, 64],
  grip: { pose: 'grip', offset: [0, CY, 0], rot: [0, 0, 0] },
  pins,
  insertInto: ['robot-slot:fan'],
  mount: { seatY: 0, outlet: { pos: [27.5, VY + 9.5, -OUT], dir: [0, 0, -1] }, intake: { pos: [0, CY, 0], dir: [0, 1, 0] }, screws: SCREWS },
  electrical: { type: 'bldc-fan', vNom: 14.4, maxA: 2.5, pwm: { hz: 20000, logic: [3.3, 5], invert: false }, fg: { pulsesPerRev: 2, openCollector: true }, maxRpm: 30000 },
  // CAD (Y-up) đã đúng hướng item (miệng hút +Y, ống thổi −Z) → chỉ dời lên 23 mm (đáy đoạn dây CAD chạm sàn). Ẩn 4 đoạn dây 16 mm
  // của CAD, giữ dây thủ tục 150 mm (có chân ở đầu dây) nối từ vỏ cắm CAD.
  cad: 'robot/bldc-fan',
  cadOptions: {
    onBottom: false, offset: [0, Y0, 0],
    hide: ['wire_*'],
    keep: ['static:bldc-fan:cables'],
    // vít nắp: manifest ghi axis theo hướng vặn vào ([0,−1,0]) → đặt lại hướng RA (+Y) theo hình học mũ vít
    onLoad(glb, root) { useManifestInteract(glb, screwOutSpecs(glb, root)); },
  },
  build() {
    const root = new THREE.Group();
    root.add(staticParts('bldc-fan2', (B) => {
      // bo driver + đầu cắm chúc xuống
      B.add(gCyl(18, 18, 1.6, 40), PM.maskBlue, { y: Y0 + 0.8 });
      B.add(gBox(9.9, 6, 4.5, 0.3, 1), PM.nylonWhite, { x: -4, y: Y0 - 3, z: WZ });
      B.add(gBox(7.95, 6, 4.4, 0.3, 1), PM.nylonWhite, { x: -4, y: Y0 - 4, z: WZ + 0.3 });
      // động cơ rotor ngoài
      B.add(gCyl(20, 20, 20, 40), PM.steelBrushed, { y: Y0 + 14, z: 5 });
      // vỏ xoắn + nắp có miệng hút
      B.add(voluteGeo(), PM.pbtBlack, { y: VY });
      B.add(gCyl(20, 20, 1.0, 48), PM.absDark, { y: VY + 0.5 });         // đáy buồng
      B.add(voluteGeo(), PM.pbtBlack, { y: CY - 5.5, sy: 5.5 / VH });     // nắp (cùng đường bao vỏ xoắn)
      B.add(cached('fan:lip2', () => new THREE.CylinderGeometry(17.5, 17.5, 3, 40, 1, true)), PM.absDark, { y: CY - 1.5 });
      for (const [x, z] of SCREWS) {
        B.add(gCyl(3.6, 3.6, VH - 4.5, 20), PM.pbtBlack, { x, y: VY + 1.5 + (VH - 4.5) / 2, z });             // vấu vít
        B.add(gCyl(2.7, 2.7, 1.6, 14), PM.steel, { x, y: CY - 0.2, z });
      }
      // gờ miệng ống thổi
      B.add(gBox(R1 - R0 + 2, VH + 2, 2, 0.5, 1), PM.absDark, { x: (R0 + R1) / 2, y: VY + VH / 2, z: -OUT });
    }));
    // dây 4 sợi (giữ hiện cạnh mô hình CAD)
    root.add(staticParts('bldc-fan:cables', (B) => { WIRES.forEach(([, c], i) => addCable(B, `fan2:${i}:24`, wpath(i), c, 24, { bendR: 3 })); }));
    // cánh quạt ly tâm (động) — nhìn thấy qua miệng hút
    const imp = new THREE.Group();
    imp.position.y = Y0 + 25.7;
    imp.add(staticParts('fan:impeller2', (B) => {
      B.add(gCyl(19, 19, 1.2, 48), PM.aluminum, {});
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        B.add(gBox(9, 12, 0.8), PM.aluminum, tf({ x: Math.cos(a) * 13.5, y: 6, z: Math.sin(a) * 13.5, ry: -a - 0.6 }));
      }
      B.add(gCyl(5, 5, 12, 24), PM.aluminum, { y: 6 });
    }));
    root.add(imp);
    ud(root, 'impeller', imp);
    return root;
  },
  update(inst, dt) {
    const s = inst.state || {}, imp = inst.object.userData.impeller;
    const target = s.powered === false ? 0 : (s.duty ?? 0);
    s.speed = (s.speed ?? 0) + (target - (s.speed ?? 0)) * Math.min(1, (dt || 0) * 1.5);   // quán tính
    s.rpm = Math.round(s.speed * 30000);
    const a = s.speed * 40 * (dt || 0);                                                    // vẽ chậm
    if (!a) return;
    if (!spinSubpart(inst, 'impeller', a) && imp) imp.rotation.y += a;                     // CAD: quay node 'impeller'
  },
  spin(inst, duty = 0.5) { (inst.state ||= {}).duty = Math.max(0, Math.min(1, duty)); return { ok: true }; },
});
export default def;
