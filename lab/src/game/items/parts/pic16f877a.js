// PIC16F877A-I/P — DIP-40 600 mil (Microchip PDIP "P"): D 52.26 × E1 13.84 × A2 3.7 mm, chân b 0.46 / b1 1.27, L 3.3.
// Bảng chân theo src/components/dieu-khien/pic16f877a.js (đúng sơ đồ dự án docs/01).
import { dipDef } from './_lib/thru.js';
import { text } from './_shared.js';

export const PIC_PINS = [
  [1, 'MCLR/VPP', 'icsp', 'Reset — 10 kΩ kéo lên 5V; VPP khi nạp'],
  [2, 'RA0/AN0', 'adc', 'Đo áp pin qua phân áp 33k/10k'],
  [3, 'RA1/AN1', 'adc', 'Cảm biến chống rơi #1'],
  [4, 'RA2/AN2', 'adc', 'Cảm biến chống rơi #2'],
  [5, 'RA3/AN3', 'adc', 'Cảm biến chống rơi #3'],
  [6, 'RA4/T0CKI', 'input', 'Encoder TRÁI → Timer0 (open-drain, cần kéo lên)'],
  [7, 'RA5/AN4', 'adc', 'Cảm biến chống rơi #4'],
  [8, 'RE0/AN5', 'spare', 'Dự phòng'],
  [9, 'RE1/AN6', 'spare', 'Dự phòng'],
  [10, 'RE2/AN7', 'spare', 'Dự phòng'],
  [11, 'VDD', 'power', '+5V — tụ 100 nF sát chân'],
  [12, 'VSS', 'ground', 'GND'],
  [13, 'OSC1/CLKI', 'osc', 'Thạch anh 20 MHz + 22 pF'],
  [14, 'OSC2/CLKO', 'osc', 'Thạch anh 20 MHz + 22 pF'],
  [15, 'RC0/T1CKI', 'input', 'Encoder PHẢI → Timer1'],
  [16, 'RC1/CCP2', 'pwm', 'PWM bánh PHẢI → 74HC32 chân 9, 12'],
  [17, 'RC2/CCP1', 'pwm', 'PWM bánh TRÁI → 74HC32 chân 1, 4'],
  [18, 'RC3/SCK/SCL', 'spare', 'Dự phòng (I2C SCL)'],
  [19, 'RD0', 'output', 'DIR TRÁI → 74HC32 chân 5'],
  [20, 'RD1', 'output', 'nDIR TRÁI → 74HC32 chân 2'],
  [21, 'RD2', 'output', 'DIR PHẢI → 74HC32 chân 13'],
  [22, 'RD3', 'output', 'nDIR PHẢI → 74HC32 chân 10'],
  [23, 'RC4/SDI/SDA', 'spare', 'Dự phòng (I2C SDA)'],
  [24, 'RC5/SDO', 'spare', 'Dự phòng'],
  [25, 'RC6/TX', 'uart', 'UART TX → BSS138 HV1 → ESP32 GPIO18'],
  [26, 'RC7/RX', 'uart', 'UART RX ← BSS138 HV2 ← ESP32 GPIO17'],
  [27, 'RD4', 'output', 'LED hồng ngoại cảm biến chống rơi'],
  [28, 'RD5', 'output', 'MOSFET chổi cuộn'],
  [29, 'RD6', 'output', 'MOSFET chổi cạnh'],
  [30, 'RD7', 'output', 'LED trạng thái'],
  [31, 'VSS', 'ground', 'GND'],
  [32, 'VDD', 'power', '+5V — tụ 100 nF sát chân'],
  [33, 'RB0/INT', 'input', 'Nút START'],
  [34, 'RB1', 'input', 'Công tắc nhấc bánh trái'],
  [35, 'RB2', 'input', 'Công tắc nhấc bánh phải'],
  [36, 'RB3/PGM', 'spare', 'Để trống (NOLVP)'],
  [37, 'RB4', 'input', 'Bumper trái'],
  [38, 'RB5', 'input', 'Bumper phải'],
  [39, 'RB6/PGC', 'icsp', 'Xung nhịp nạp ICSP'],
  [40, 'RB7/PGD', 'icsp', 'Dữ liệu nạp ICSP'],
];

/** Chữ khắc laser trên lưng chip (xám nhạt trên epoxy đen) */
function marking(g, W, H, s) {
  const c = '#c9cbce';
  // logo Microchip: vòng tròn + chữ "M" cách điệu
  const lx = 6 * s, ly = H * 0.5;
  g.strokeStyle = c; g.lineWidth = 0.35 * s;
  g.beginPath(); g.arc(lx, ly, 2.6 * s, 0, Math.PI * 2); g.stroke();
  text(g, 'M', lx, ly + 0.1 * s, 3.6 * s, { color: c, weight: '900', font: 'Georgia, serif' });
  text(g, 'MICROCHIP', 10 * s, H * 0.22, 1.6 * s, { color: c, align: 'left', weight: '700' });
  text(g, 'PIC16F877A-I/P', 10 * s, H * 0.5, 2.6 * s, { color: c, align: 'left', weight: '700' });
  text(g, '2441RV7  e3', 10 * s, H * 0.78, 1.7 * s, { color: c, align: 'left', weight: '600' });
}

export default dipDef({
  id: 'pic16f877a',
  name: 'PIC16F877A-I/P (DIP-40)',
  lessonId: 'pic16f877a',
  n: 40, row: 15.24, D: 52.26, E1: 13.84, A2: 3.7,
  massG: 6.0,
  marking,
  cad: 'boards/pic16f877a-dip40',
  pinNames: PIC_PINS,
  electrical: { type: 'mcu', vdd: [2.0, 5.5], absMaxVdd: 7.5, ioMaxmA: 25, iddmA: 8, supplyPins: { VDD: ['11', '32'], VSS: ['12', '31'] } },
});
