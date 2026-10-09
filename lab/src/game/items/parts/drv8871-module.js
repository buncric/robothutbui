// Module DRV8871 (Adafruit #3190, theo CAD boards/drv8871-breakout = Eagle chính thức): PCB 20.32 × 24.13 mm phủ xanh,
// IC DRV8871DDA (HSOP-8 PowerPAD), R_ILIM 30 kΩ → giới hạn ~2.1 A (đỉnh 3.6 A), tụ 22 µF, 2 domino 3.5 mm đứng ở cạnh −Z
// (MOTOR: OUT2 · OUT1 bên trái, POWER: VM · GND bên phải; lối luồn dây quay ra −Z), header JP2 4 chân ở cạnh +Z (z = +9.525):
// GND · VM · IN1 · IN2 từ x = +3.81 → −3.81 (đã hàn, chân chúc xuống). Theo docs/01: IN1 = 74HC32 1Y/3Y, IN2 = 2Y/4Y.
import { PM, text } from './_shared.js';
import { moduleDef, terminalSocket, HDR, headerCad } from './_lib/module.js';
import { soic, chip, terminalBlock35, elecSmd } from './_lib/pcb.js';

const W = 20.32, D = 24.13, ZH = 9.525;
const TOP = HDR.boardBottom + 1.6;
// [id, x, CAD node]
const HP = [['IN1', -1.27, 'pin_JP2_3'], ['IN2', -3.81, 'pin_JP2_4'], ['VM', 1.27, 'pin_JP2_2'], ['GND', 3.81, 'pin_JP2_1']];
const hdr = HP.map(([n, x, node]) => [n, n, x, ZH, { role: n.startsWith('IN') ? 'logic' : n === 'VM' ? 'power' : 'ground', cadNode: node }]);
// domino: tâm khối (CAD terminal_MOTOR / terminal_POWER), lối luồn dây ở mặt −Z
const TB = { MOTOR: -4.37, POWER: 4.27 }, TBZ = -8.26, TBD = 7.0;
const ENTRY_Y = TOP + 2.2, ENTRY_Z = TBZ - TBD / 2;
const TERM = [
  { id: 'T-VM', name: 'VM (+)', x: 2.52, screw: 'screw_POWER_2' },
  { id: 'T-GND', name: 'GND (−)', x: 6.02, screw: 'screw_POWER_1' },
  { id: 'T-OUT1', name: 'OUT1', x: -2.62, screw: 'screw_MOTOR_1' },
  { id: 'T-OUT2', name: 'OUT2', x: -6.12, screw: 'screw_MOTOR_2' },
].map((t) => ({ ...t, pos: [t.x, ENTRY_Y, ENTRY_Z], dir: [0, 0, -1] }));

export default moduleDef({
  id: 'drv8871-module', name: 'Module driver động cơ DRV8871', lessonId: 'driver-drv8871', massG: 4.5,
  w: W, d: D, mask: PM.maskBlue, holes: [[-7.62, ZH, 1.25], [7.62, ZH, 1.25]], height: 9,
  headers: [{ pins: hdr }],
  extraPins: TERM.map((t) => ({ id: t.id, name: t.name, pos: t.pos, dir: t.dir, extra: { terminal: true } })),
  fill(B) {
    soic(B, 8, -5.46, 1.14, Math.PI / 2, { pitch: 1.27, W: 3.9, H: 1.5, span: 6.0, ep: true });
    chip(B, '0805', 2.92, 5.72, 0, 'R');          // R_ILIM 30 kΩ
    chip(B, '0805', -1.4, -0.38, Math.PI / 2, 'C'); // 0.1 µF VM
    elecSmd(B, 4.32, 0.89, 0, { d: 6.3, h: 7.0 });  // 22 µF
    terminalBlock35(B, TB.MOTOR, TBZ, Math.PI, 2);
    terminalBlock35(B, TB.POWER, TBZ, Math.PI, 2);
  },
  silk(g, Wp, Hp, s, X, Z) {
    const c = '#e9ecef';
    text(g, 'DRV8871', X(-5.4), Z(5.4), 1.3 * s, { color: c });
    text(g, 'MOTOR', X(TB.MOTOR), Z(-3.8), 0.9 * s, { color: c }); text(g, 'POWER', X(TB.POWER), Z(-3.8), 0.9 * s, { color: c });
    hdr.forEach(([, n, x]) => text(g, n, X(x), Z(ZH - 2.0), 0.75 * s, { color: c }));
    text(g, '3.6A max · 6.5–45V', X(0), Z(11.2), 0.7 * s, { color: c, weight: '500' });
  },
  insertInto: ['bb-hole', 'pcb-hole', 'header-female'],
  sockets(inst) {
    const n0 = hdr.length;
    return TERM.map((t, i) => terminalSocket(inst, t.id, t.pos, 0, {
      rotX: -Math.PI / 2, screwIndex: n0 + i,
      // vít kẹp (subpart CAD captive screw): dây thông khi vít đang siết (chưa nới quá nửa hành trình); không có CAD → coi như siết
      clamped: () => { const sp = (inst.subparts || []).find((q) => q.name === t.screw); return sp ? (sp.state.progress ?? 0) < 0.5 : true; },
    }));
  },
  electrical: {
    type: 'h-bridge', chip: 'DRV8871', vm: [6.5, 45], ilimA: 2.1, ipeakA: 3.6, rdsOn: 0.565,
    truth: { '00': 'coast (Hi-Z)', '01': 'reverse', '10': 'forward', '11': 'brake' }, pulldown: 100e3,
    nets: { VM: ['VM', 'T-VM'], GND: ['GND', 'T-GND'] },
  },
  extraDef: {
    cad: 'boards/drv8871-breakout',
    cadOptions: headerCad(),
    cadPinNode: (p) => p.cadNode || null,
  },
});
