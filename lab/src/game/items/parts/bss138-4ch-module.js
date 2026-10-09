// Module chuyển mức logic 4 kênh BSS138 (hai chiều, 3.3 V ⇄ 5 V): PCB 15.24 × 12.7 mm (theo CAD SparkFun), 4 MOSFET SOT-23 + 8 trở 10 kΩ 0603.
// 2 hàng 6 chân (cách 10.16 mm): HV1 HV2 HV GND HV3 HV4 (phía 5 V, −Z) / LV1 LV2 LV GND LV3 LV4 (phía 3.3 V, +Z).
// Theo docs/01: PIC RC6/TX → HV1 → LV1 → ESP32 GPIO18; ESP32 GPIO17 → LV2 → HV2 → PIC RC7/RX.
import { PM, text } from './_shared.js';
import { moduleDef, headerCad } from './_lib/module.js';
import { sot23, chip } from './_lib/pcb.js';

const W = 15.24, D = 12.7, ZR = 5.08;
const xs = [-6.35, -3.81, -1.27, 1.27, 3.81, 6.35];
const HV = ['HV1', 'HV2', 'HV', 'GND', 'HV3', 'HV4'], LV = ['LV1', 'LV2', 'LV', 'GND', 'LV3', 'LV4'];
const pins = [
  ...HV.map((n, i) => [n === 'GND' ? 'GND-HV' : n, n, xs[i], -ZR, { side: 'HV', cadNode: `pin_HV_${i + 1}` }]),
  ...LV.map((n, i) => [n === 'GND' ? 'GND-LV' : n, n, xs[i], ZR, { side: 'LV', cadNode: `pin_LV_${i + 1}` }]),
];

export default moduleDef({
  id: 'bss138-4ch-module', name: 'Module chuyển mức BSS138 4 kênh', lessonId: 'bss138-level-shifter', massG: 1.2,
  w: W, d: D, mask: PM.maskBlue, height: 2,
  headers: [{ pins }],
  fill(B) {
    const QX = [-5.66, -1.8, 1.98, 5.74];   // vị trí Q1..Q4 theo CAD
    QX.forEach((x) => sot23(B, x, -0.08, Math.PI / 2));
    QX.forEach((x) => { chip(B, '0603', x, -2.63, 0, 'R'); chip(B, '0603', x, 2.62, 0, 'R'); });
  },
  silk(g, Wp, Hp, s, X, Z) {
    const c = '#f0f0f0';
    HV.forEach((n, i) => text(g, n, X(xs[i]), Z(-ZR + 1.8), 0.62 * s, { color: c }));
    LV.forEach((n, i) => text(g, n, X(xs[i]), Z(ZR - 1.8), 0.62 * s, { color: c }));
  },
  extraDef: {
    cad: 'boards/bss138-4ch-level-shifter',
    cadOptions: headerCad(),
    cadPinNode: (p) => p.cadNode,
  },
  electrical: {
    type: 'level-shifter', channels: [['HV1', 'LV1'], ['HV2', 'LV2'], ['HV3', 'LV3'], ['HV4', 'LV4']], pullupOhm: 10000,
    supply: { HV: [3.3, 5.5], LV: [1.8, 3.6] }, gnd: ['GND-HV', 'GND-LV'], rule: 'LV < HV',
  },
});
