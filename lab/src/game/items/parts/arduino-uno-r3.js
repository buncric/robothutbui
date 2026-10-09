// Board vi điều khiển kiểu Arduino UNO R3: PCB 68.6 × 53.3 mm phủ xanh ngọc, ATmega328P-PU (DIP-28 trên đế), ATmega16U2 (QFN-32)
// làm cầu USB, cổng USB-B, giắc DC 5.5/2.1, ổn áp NCP1117 5 V (SOT-223), thạch anh 16 MHz, nút RESET, LED L/TX/RX/ON,
// 4 hàng header cái (digital 10 + 8, power 8, analog 6 — khe 'header-female'), 2 cụm ICSP 2×3, 4 lỗ bắt vít Ø3.2.
// Toạ độ theo bản vẽ cơ khí (gốc góc dưới-trái): x_game = x − 34.3, z_game = 26.67 − y. Gốc: đáy (chân xuyên lỗ), đáy PCB y = 1.9.
// Vị trí header / LED / nút / ICSP / chip theo CAD boards/arduino-uno-r3 (Eagle chính thức Rev3; GLB gốc = đáy PCB → offset y 1.9).
// Chân game của header cái = MIỆNG lỗ (đỉnh thân 8.5 mm, khe 'header-female'); node pin_* của CAD là lá tiếp điểm bên trong
// (đỉnh thấp hơn miệng 2 mm) → công cụ kiểm tra báo lệch ~2 mm theo Y là đúng thiết kế.
import { THREE, PM, text, gBox, gCyl, colorMat, tf, socketSpec, anchor, fitsKind } from './_shared.js';
import { moduleDef, dynLed, ud, cadLed } from './_lib/module.js';
import { usbB, dcJack, sot223, qfn, chip, elecSmd, ledSmd, femaleHeaderUp, headerPinGeo, solderConeGeo } from './_lib/pcb.js';
import { dipLeadGeo } from './_lib/thru.js';

const BX = (x) => +(x - 34.3).toFixed(3), BZ = (y) => +(26.67 - y).toFixed(3);
const BOT = 1.9, TOPY = BOT + 1.6, HH = 8.5;
const top10 = ['SCL', 'SDA', 'AREF', 'GND', 'D13', 'D12', 'D11', 'D10', 'D9', 'D8'];
const top8 = ['D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1', 'D0'];
const pwr8 = ['NC', 'IOREF', 'RESET', '3V3', '5V', 'GND2', 'GND3', 'VIN'];
const ana6 = ['A0', 'A1', 'A2', 'A3', 'A4', 'A5'];
const HP = [];
const cx = (x0, i) => +(x0 + i * 2.54).toFixed(3);
top10.forEach((n, i) => HP.push([n, cx(-15.494, i), -24.13, `pin_IOH_${i + 1}`]));
top8.forEach((n, i) => HP.push([n, cx(11.43, i), -24.13, `pin_IOL_${i + 1}`]));
pwr8.forEach((n, i) => HP.push([n, cx(-6.35, i), 24.13, `pin_POWER_${i + 1}`]));
ana6.forEach((n, i) => HP.push([n, cx(16.51, i), 24.13, `pin_AD_${i + 1}`]));
const PWM = new Set(['D3', 'D5', 'D6', 'D9', 'D10', 'D11']);
const ICSP1 = [], ICSP2 = [];
for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { ICSP1.push([29.337 + j * 2.54, -3.81 + i * 2.54]); ICSP2.push([-13.462 - i * 2.54, -20.828 + j * 2.54]); }
const LEDS = { L: [-6.35, -15.49], TX: [-6.35, -9.91], RX: [-6.35, -7.62], ON: [24.13, -9.91] };   // theo CAD
const HOLES = [[BX(14.0), BZ(2.5), 1.6], [BX(15.3), BZ(50.7), 1.6], [BX(66.1), BZ(7.6), 1.6], [BX(66.1), BZ(35.5), 1.6]];

const def = moduleDef({
  id: 'arduino-uno-r3', name: 'Board UNO R3 (ATmega328P)', lessonId: 'pic16f877a', massG: 25,
  w: 68.6, d: 53.3, mask: PM.maskTeal, holes: HOLES, padsOnly: true, boardBottom: BOT, r: 1.5, height: 11,
  size: [75, TOPY + 11, 53.3],
  grip: { pose: 'grip', offset: [10, TOPY + 4, 0], rot: [0, 0, 0] },
  extraPins: HP.map(([n, x, z, node]) => ({ id: n, name: n.replace(/GND\d/, 'GND'), pos: [x, TOPY + HH, z], dir: [0, 1, 0], extra: { female: true, pwm: PWM.has(n) || undefined, analog: n.startsWith('A') && n !== 'AREF' || undefined, cadNode: node } })),
  fill(B) {
    const by = -1.6;   // B ở mặt trên; đuôi chân dưới đáy
    femaleHeaderUp(B, HP.map(([, x, z]) => [x, z]), 0, { h: HH });
    B.inst(headerPinGeo(3.0), PM.lead, HP.map(([, x, z]) => tf({ x, y: by - 0.1, z })));
    B.inst(solderConeGeo(), PM.solder, HP.map(([, x, z]) => tf({ x, y: by, z, rx: Math.PI })));
    // ICSP 2×3 đực
    for (const set of [ICSP1, ICSP2]) {
      B.inst(headerPinGeo(11.5), PM.gold, set.map(([x, z]) => tf({ x, y: 11.5 / 2 - 3.0, z })), { shadow: true });
      B.inst(gBox(2.44, 2.5, 2.44, 0.12, 1), PM.pbtBlack, set.map(([x, z]) => tf({ x, y: 1.25, z })), { shadow: true });
    }
    usbB(B, -32.48, -11.43, Math.PI);
    dcJack(B, -28.9, 18.88, Math.PI);
    sot223(B, -26.54, 9.27, Math.PI / 2);
    elecSmd(B, -8.76, 17.53, 0, { d: 6.3, h: 5.4 }); elecSmd(B, -15.88, 17.53, 0, { d: 6.3, h: 5.4 });
    // ATmega328P-PU trên đế DIP-28 (khấc −X)
    const cx = 12.065, cz = 10.287;
    B.add(gBox(37.0, 3.0, 10.2, 0.3, 1), PM.pbtBlack, { x: cx, y: 1.5, z: cz });
    B.add(gBox(34.7, 3.3, 6.35, 0.3, 1), PM.epoxy, { x: cx, y: 3.0 + 0.5 + 1.65, z: cz });
    B.add(gCyl(1.0, 1.0, 0.1, 16), PM.epoxyMark, { x: cx - 16.3, y: 6.85, z: cz });
    const lm = [];
    for (let i = 0; i < 28; i++) {
      const half = 14, k = i < half ? i : i - half;
      const x = i < half ? -16.51 + k * 2.54 : 16.51 - k * 2.54, z = i < half ? 3.81 : -3.81;
      lm.push(new THREE.Matrix4().makeTranslation(cx + x, 0.2, cz + z).multiply(new THREE.Matrix4().makeRotationY(z > 0 ? 0 : Math.PI)));
    }
    B.many(dipLeadGeo(3.3, 4.8, 0.7), PM.lead, lm);
    // ATmega16U2 (QFN-32 5 × 5) + thạch anh 16 MHz HC-49/S + bộ cộng hưởng 16 MHz cho 328P
    qfn(B, 5, BX(25.4), BZ(33.0), Math.PI / 4, { n: 8 });
    B.add(gBox(11, 3.5, 4.6, 2.2, 3), PM.steelBrushed, { x: -15.37, y: 1.75, z: 0.51 });
    B.add(gBox(3.2, 1.2, 1.3, 0.2, 1), colorMat(0x3a6fb8, { rough: 0.4 }), { x: BX(44.0), y: 0.6, z: BZ(27.0) });
    // nút RESET 6 × 6
    B.add(gBox(6, 3.4, 6, 0.3, 1), PM.steel, { x: -27.94, y: 1.7, z: -22.73 });
    B.add(gCyl(1.75, 1.75, 1.2, 18), colorMat(0xb22a24, { rough: 0.5 }), { x: -27.94, y: 3.9, z: -22.73 });
    for (let k = 0; k < 10; k++) chip(B, k % 3 ? '0603' : '0805', BX(30 + (k % 5) * 3.0), BZ(28 + Math.floor(k / 5) * 3.5), 0, k % 2 ? 'R' : 'C');
    for (const [x, z] of Object.values(LEDS)) ledSmd(B, x, z, 0, 0xffaa22, '0805');
  },
  silk(g, W, H, s, X, Z) {
    const c = '#f4f6f6';
    HP.forEach(([n, x, z]) => {
      const lab = n.replace(/^D/, '').replace(/GND\d/, 'GND');
      text(g, (PWM.has(n) ? '~' : '') + lab, X(x), Z(z + (z < 0 ? 2.6 : -2.6)), 0.8 * s, { color: c });
    });
    text(g, 'DIGITAL (PWM ~)', X(BX(45)), Z(BZ(45.5)), 1.2 * s, { color: c });
    text(g, 'POWER', X(BX(36.8)), Z(BZ(7.6)), 1.2 * s, { color: c });
    text(g, 'ANALOG IN', X(BX(57.2)), Z(BZ(7.6)), 1.2 * s, { color: c });
    text(g, 'UNO', X(BX(40)), Z(BZ(37)), 5.5 * s, { color: c, weight: '900' });
    text(g, 'R3', X(BX(52)), Z(BZ(37.5)), 2.2 * s, { color: c });
    text(g, 'ICSP', X(BX(64.8)), Z(BZ(33.0)), 0.9 * s, { color: c });
    for (const [k, [x, z]] of Object.entries(LEDS)) text(g, k, X(x - 2.3), Z(z), 0.9 * s, { color: c });
  },
  silkPx: 10,
  extra(root, ctx) {
    ud(root, 'leds', {
      L: dynLed(root, LEDS.L[0], ctx.top, LEDS.L[1], 0xffaa22, { h: 0.5 }),
      TX: dynLed(root, LEDS.TX[0], ctx.top, LEDS.TX[1], 0xffaa22, { h: 0.5 }),
      RX: dynLed(root, LEDS.RX[0], ctx.top, LEDS.RX[1], 0xffaa22, { h: 0.5 }),
      ON: dynLed(root, LEDS.ON[0], ctx.top, LEDS.ON[1], 0x22ff55, { h: 0.5 }),
    });
  },
  extraDef: {
    cad: 'boards/arduino-uno-r3',
    cadOptions: {
      onBottom: false, offset: [0, BOT, 0],
      onLoad(glb, root) {
        const m = { L: cadLed(glb, 'led_l', 0xffaa22), TX: cadLed(glb, 'led_tx', 0xffaa22), RX: cadLed(glb, 'led_rx', 0xffaa22), ON: cadLed(glb, 'led_pwr', 0x22ff55) };
        if (m.L && m.TX && m.RX && m.ON) ud(root, 'leds', m);
      },
    },
    cadPinNode: (p) => p.cadNode || null,
    update(inst) {
      const L = inst.object.userData.leds, st = inst.state || {};
      if (!L) return;
      L.ON.material.emissiveIntensity = st.powered ? 2.5 : 0;
      L.L.material.emissiveIntensity = st.powered && st.led13 ? 2.5 : 0;
      L.TX.material.emissiveIntensity = st.powered && st.tx ? 2.5 : 0;
      L.RX.material.emissiveIntensity = st.powered && st.rx ? 2.5 : 0;
    },
  },
  sockets(inst) {
    return HP.map(([n, x, z]) => {
      const a = anchor(inst.object, `uno:${n}`, [x, TOPY + HH, z]);
      return socketSpec(inst, {
        id: n, kind: 'header-female', anchor: a, pin: n,
        accepts(item) { if (this.occupiedBy) return { ok: false, reason: `${n} đã có chân` }; return fitsKind(item, 'header-female') ? { ok: true, orientation: 'ok' } : { ok: false, reason: 'Chỉ nhận chân đực 0.64 mm (dây Dupont, header)' }; },
        poseFor(item, pinId) {
          const d = item?.def; const pp = d?.getPins?.(item) ?? d?.pins ?? [];
          const q = (pinId && pp.find((x2) => x2.id === pinId)) || pp[0];
          return new THREE.Matrix4().makeTranslation(-(q?.pos[0] ?? 0), -(d?.mount?.seatY ?? 0), -(q?.pos[2] ?? 0));
        },
      });
    });
  },
  insertInto: [],
  meta: { usbPorts: [{ id: 'USB-B', pos: [-40.6, BOT + 7.17, -11.43], dir: [-1, 0, 0] }], dcJack: { pos: [-36.1, BOT + 8.1, 18.88], dir: [-1, 0, 0], vin: [7, 12] } },
  electrical: { type: 'mcu-board', chip: 'ATmega328P', logic: 5, clockHz: 16e6, vin: [7, 12], ioMaxmA: 20, gnd: ['GND', 'GND2', 'GND3'] },
});
export default def;
