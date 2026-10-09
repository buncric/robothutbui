// Module GY-521 (MPU-6050: gia tốc 3 trục + con quay 3 trục, I2C 0x68/0x69): PCB 20.3 × 15.6 mm xanh (theo CAD), chip QFN-24 4 × 4 mm,
// LDO 3.3 V (SOT-23-5), trở kéo lên I2C 4.7 kΩ, LED nguồn, 2 lỗ Ø3. Header 8 chân: VCC GND SCL SDA XDA XCL AD0 INT.
// Mũi tên silkscreen: trục X, Y của cảm biến (Z vuông góc mặt board, hướng lên).
import { PM, text } from './_shared.js';
import { moduleDef, dynLed, ud, headerCad, cadLed } from './_lib/module.js';
import { qfn, sot23, chip } from './_lib/pcb.js';

// theo CAD boards/gy-521-mpu6050: header J1 ở z = +6.51, chân 1 (VCC) x = −8.92 … chân 8 (INT) x = +8.86
const W = 20.26, D = 15.56, ZP = 6.51, X0 = -8.92;
const NAMES = ['VCC', 'GND', 'SCL', 'SDA', 'XDA', 'XCL', 'AD0', 'INT'];
const px = (i) => +(X0 + i * 2.54).toFixed(3);
const pins = NAMES.map((n, i) => [n, n, px(i), ZP, { cadNode: `pin_J1_${i + 1}` }]);
const LED = [-8.13, -1.62];   // LED nguồn (CAD led_pwr)

const def = moduleDef({
  id: 'mpu6050-gy521', name: 'Cảm biến IMU MPU6050 (GY-521)', lessonId: 'mpu6050', massG: 2.1,
  w: W, d: D, mask: PM.maskBlue, holes: [[-7.59, -5.24, 1.5], [7.59, -5.24, 1.5]], height: 2,
  headers: [{ pins }],
  fill(B) {
    qfn(B, 4, 0.37, 0.78, 0, { n: 6 });
    sot23(B, -8.23, 2.18, 0, { five: true });
    chip(B, '0603', -4.53, 4.18, Math.PI / 2, 'R'); chip(B, '0603', -2.53, 4.18, Math.PI / 2, 'R'); chip(B, '0603', 4.47, 4.18, Math.PI / 2, 'R');
    chip(B, '0603', 3.47, 0.78, Math.PI / 2, 'C'); chip(B, '0603', -2.73, 0.78, Math.PI / 2, 'C'); chip(B, '0603', 0.37, -2.22, 0, 'C');
    chip(B, '0603', 2.47, -2.22, 0, 'C'); chip(B, '1206', -0.48, -4.92, 0, 'C'); chip(B, '0603', -5.73, -1.62, Math.PI / 2, 'R');
  },
  silk(g, Wp, Hp, s, X, Z) {
    const c = '#f2f2f2';
    NAMES.forEach((n, i) => text(g, n, X(px(i)), Z(ZP - 2.0), 0.62 * s, { color: c }));
    text(g, 'GY-521', X(0), Z(-6.2), 1.4 * s, { color: c });
    // mũi tên trục X (→ +X) và Y (↑ −Z)
    g.strokeStyle = c; g.fillStyle = c; g.lineWidth = 0.25 * s;
    const ax = X(5.6), az = Z(-1.5);
    g.beginPath(); g.moveTo(ax, az); g.lineTo(ax + 3 * s, az); g.moveTo(ax, az); g.lineTo(ax, az - 3 * s); g.stroke();
    g.beginPath(); g.moveTo(ax + 3.6 * s, az); g.lineTo(ax + 2.8 * s, az - 0.5 * s); g.lineTo(ax + 2.8 * s, az + 0.5 * s); g.fill();
    g.beginPath(); g.moveTo(ax, az - 3.6 * s); g.lineTo(ax - 0.5 * s, az - 2.8 * s); g.lineTo(ax + 0.5 * s, az - 2.8 * s); g.fill();
    text(g, 'X', ax + 3.2 * s, az + 1 * s, 0.9 * s, { color: c }); text(g, 'Y', ax - 1 * s, az - 3.2 * s, 0.9 * s, { color: c });
  },
  extra(root, ctx) { ud(root, 'pwr', dynLed(root, LED[0], ctx.top, LED[1], 0xff2a1a, { w: 0.8, d: 1.6 })); },
  extraDef: {
    cad: 'boards/gy-521-mpu6050',
    cadOptions: headerCad({ onLoad(glb, root) { const l = cadLed(glb, 'led_pwr', 0xff2a1a); if (l) ud(root, 'pwr', l); } }),
    cadPinNode: (p) => p.cadNode,
    update(inst) { const l = inst.object.userData.pwr; if (l) l.material.emissiveIntensity = inst.state?.powered ? 2.5 : 0; },
  },
  electrical: { type: 'imu', i2cAddr: [0x68, 0x69], vcc: [3.3, 5.0], ldo: 3.3, pullups: 4700, axes: { X: '+X', Y: '−Z', Z: '+Y' } },
});
export default def;
