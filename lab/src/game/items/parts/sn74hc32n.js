// SN74HC32N — 4 cổng OR 2 đầu vào, DIP-14 300 mil (TI "N"): D 19.3 × E1 6.35 × A2 3.3 mm.
// Đấu nối theo docs/01 (IN1 = PWM OR nDIR, IN2 = PWM OR DIR cho DRV8871).
import { dipDef } from './_lib/thru.js';
import { text } from './_shared.js';

export const HC32_PINS = [
  [1, '1A', 'input', 'RC2/CCP1 — PWM trái'],
  [2, '1B', 'input', 'RD1 — nDIR trái'],
  [3, '1Y', 'output', 'DRV8871 trái IN1'],
  [4, '2A', 'input', 'RC2/CCP1 — PWM trái'],
  [5, '2B', 'input', 'RD0 — DIR trái'],
  [6, '2Y', 'output', 'DRV8871 trái IN2'],
  [7, 'GND', 'ground', 'GND'],
  [8, '3Y', 'output', 'DRV8871 phải IN1'],
  [9, '3A', 'input', 'RC1/CCP2 — PWM phải'],
  [10, '3B', 'input', 'RD3 — nDIR phải'],
  [11, '4Y', 'output', 'DRV8871 phải IN2'],
  [12, '4A', 'input', 'RC1/CCP2 — PWM phải'],
  [13, '4B', 'input', 'RD2 — DIR phải'],
  [14, 'VCC', 'power', '+5V — tụ 100 nF sát chân'],
];

function marking(g, W, H, s) {
  const c = '#c6c8cb';
  // logo TI (bản đồ bang Texas cách điệu → ô vuông nghiêng)
  g.fillStyle = c;
  g.save(); g.translate(2.6 * s, H * 0.42); g.rotate(-0.12);
  g.fillRect(-1.4 * s, -1.4 * s, 2.8 * s, 2.8 * s);
  g.restore();
  text(g, 'ti', 2.6 * s, H * 0.42, 1.8 * s, { color: '#1b1b1d', weight: '900', italic: true });
  text(g, 'SN74HC32N', 5 * s, H * 0.35, 1.9 * s, { color: c, align: 'left' });
  text(g, '48AF7EK  e4', 5 * s, H * 0.72, 1.35 * s, { color: c, align: 'left', weight: '600' });
}

export default dipDef({
  id: 'sn74hc32n',
  name: 'SN74HC32N — 4 cổng OR (DIP-14)',
  lessonId: 'driver-drv8871',
  n: 14, row: 7.62, D: 19.3, E1: 6.35, A2: 3.3,
  massG: 1.0,
  marking,
  cad: 'boards/sn74hc32-dip14',
  pinNames: HC32_PINS,
  electrical: { type: 'logic', family: 'HC', vcc: [2, 6], gates: [['1A', '1B', '1Y'], ['2A', '2B', '2Y'], ['3A', '3B', '3Y'], ['4A', '4B', '4Y']], fn: 'OR', supplyPins: { VCC: ['14'], GND: ['7'] } },
});
