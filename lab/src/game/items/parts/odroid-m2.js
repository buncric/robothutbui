// Máy tính nhúng ODROID-M2 (Rockchip RK3588S2, 8/16 GB LPDDR5) — theo CAD boards/odroid-m2 (bản vẽ bố trí Hardkernel):
// PCB 90 × 90 mm phủ xanh lá, tản nhiệt 40 × 57 mm + quạt 40 mm, cổng ở cạnh sau (−Z): USB 2.0, HDMI, USB 3.0, giắc DC 12 V, RJ45 GbE;
// USB-C ở cạnh −X; header GPIO 2 × 20 (kiểu Raspberry Pi, chân 1 ở x = +11.7, số chân tăng về −X) cạnh +Z; mặt dưới: pin CR2032,
// M.2, UART (thò 6.8 mm) → 4 trụ đồng M2.5 cao 7 mm (gốc = đáy trụ; trụ vẫn hiện khi có CAD).
// Giai đoạn sau của dự án: chạy ROS 2 + slam_toolbox + Nav2, nhận lidar + odometry từ ESP32.
import { PM, text, gBox, gCyl, colorMat, tf, staticParts } from './_shared.js';
import { moduleDef, dynLed, ud, cadLed } from './_lib/module.js';
import { dcJack, hdmi, rj45, usbC, qfn, chip, headerPinGeo, solderConeGeo } from './_lib/pcb.js';

const W = 90, D = 90, BOT = 7;
const GPIO_NAMES = ['3V3', '5V', 'SDA', '5V', 'SCL', 'GND', 'GPIO4', 'TXD', 'GND', 'RXD', 'GPIO17', 'GPIO18', 'GPIO27', 'GND', 'GPIO22', 'GPIO23', '3V3', 'GPIO24', 'MOSI', 'GND', 'MISO', 'GPIO25', 'SCLK', 'CE0', 'GND', 'CE1', 'ID_SD', 'ID_SC', 'GPIO5', 'GND', 'GPIO6', 'GPIO12', 'GPIO13', 'GND', 'GPIO19', 'GPIO16', 'GPIO26', 'GPIO20', 'GND', 'GPIO21'];
// theo CAD header_J2: chân lẻ z = 40.6, chân chẵn z = 43.14; cột k (chân 2k+1, 2k+2) ở x = 11.7 − 2.54·k; đỉnh chân cao 8.1 trên mặt board
const GP = GPIO_NAMES.map((n, i) => { const col = Math.floor(i / 2), row = i % 2; return [String(i + 1), n, +(11.7 - col * 2.54).toFixed(3), row ? 43.14 : 40.6]; });
const HOLES = [[41.2, -30.4, 1.35], [-41.7, 41.4, 1.35], [41.2, 41.4, 1.35], [-28.4, -33.3, 1.35]];
const LEDS = { pwr: [24.8, -39.6], alive: [24.8, -37.4] };

const def = moduleDef({
  id: 'odroid-m2', name: 'Máy tính nhúng ODROID-M2', lessonId: 'lidar-lds', massG: 135,
  w: W, d: D, mask: PM.maskGreen, holes: HOLES, padsOnly: true, boardBottom: BOT, r: 3, height: 22,
  size: [93.2, BOT + 15.1, 93.9],
  grip: { pose: 'grip', offset: [0, BOT + 14, 0], rot: [0, 0, 0] },
  extraPins: [
    ...GP.map(([id, n, x, z]) => ({ id: `GPIO-${id}`, name: n, pos: [x, BOT + 1.6 + 8.1, z], dir: [0, 1, 0], extra: { header: true, logic: 3.3, cadNode: `pin_J2_${id}` } })),
    { id: 'DC-IN', name: 'DC 12 V (5.5/2.1, tâm +)', pos: [19.1, BOT + 3.7, -46.2], dir: [0, 0, -1], extra: { jack: 'dc5521', vin: [7.5, 15] } },
  ],
  fill(B) {
    // tản nhiệt (40 × 56.9, cao 5.5) + quạt 40 mm (CAD heatsink / fan)
    B.add(gBox(40, 5.5, 56.9, 0.6, 1), PM.aluAnodBlack, { x: -10.5, y: 1.2 + 2.75, z: -5.45 });
    B.add(gBox(40, 7, 40, 2, 1), PM.pbtBlack, { x: -10.5, y: 6.5 + 3.5, z: -5.8 });
    B.add(gCyl(18.5, 18.5, 0.2, 40), colorMat(0x2a2c30, { rough: 0.5 }), { x: -10.5, y: 13.55, z: -5.8 }, { shadow: false });
    B.add(gCyl(6, 6, 0.4, 28), colorMat(0x3a3d42, { rough: 0.4 }), { x: -10.5, y: 13.7, z: -5.8 });
    B.add(gBox(17, 1.1, 17), colorMat(0x5a5f66, { rough: 0.5 }), { x: -2.5, y: 0.55, z: 4.65 });          // SoC dưới tản (lộ cạnh)
    // cổng cạnh sau (−Z) + USB-C cạnh −X (CAD)
    dcJack(B, 18.25, -40.4, Math.PI / 2);
    hdmi(B, -18.85, -42.65, Math.PI / 2);
    for (const x of [-37.8, 2.45]) {                                                                  // USB-A đơn (2.0 · 3.0)
      B.add(gBox(13.14, 7.0, 14, 0.3, 1), PM.steelBrushed, { x, y: 3.5, z: -41.9 });
      B.add(gBox(11, 1.6, 0.6), x > 0 ? colorMat(0x1f5fd1, { rough: 0.4 }) : PM.pbtBlack, { x, y: 3.2, z: -48.6 }, { shadow: false });
    }
    rj45(B, 35.0, -36.88, Math.PI / 2);
    usbC(B, -42.5, 33.0, Math.PI);
    // header GPIO 2×20 (+ J3 14 chân bên cạnh)
    B.inst(headerPinGeo(11.1), PM.gold, GP.map(([, , x, z]) => tf({ x, y: 8.1 - 5.55, z })), { shadow: true });
    B.inst(gBox(2.44, 2.5, 2.44, 0.12, 1), PM.pbtBlack, GP.map(([, , x, z]) => tf({ x, y: 1.25, z })), { shadow: true });
    B.inst(solderConeGeo(), PM.solder, GP.map(([, , x, z]) => tf({ x, y: -1.6, z, rx: Math.PI })));
    // chip phụ, nút, eMMC
    B.add(gBox(12.4, 1.0, 15.1), PM.epoxy, { x: -26.9, y: 0.5, z: 3.75 }); B.add(gBox(15.1, 1.0, 12.6), PM.epoxy, { x: -1.95, y: 0.5, z: -19.6 });
    B.add(gBox(11.5, 1.0, 13, 0.1, 1), PM.epoxy, { x: 27.9, y: 0.5, z: 3.2 });
    qfn(B, 7.8, 21.5, 24.5, 0, { n: 10 });
    for (let k = 0; k < 14; k++) chip(B, k % 2 ? '0402' : '0603', 14 + (k % 7) * 2.6, 14 + Math.floor(k / 7) * 2.5, 0, k % 3 ? 'C' : 'R');
    for (const z of [12.0, 5.0]) { B.add(gBox(6, 3.5, 3.5, 0.3, 1), PM.steel, { x: 39.5, y: 1.75, z }); B.add(gCyl(1.0, 1.0, 1.2, 12), PM.pbtBlack, { x: 39.5, y: 4.1, z }); }
    B.add(gBox(5.6, 3.0, 9.2, 0.2, 1), PM.steel, { x: 44.0, y: 1.5, z: 32.1 });                          // công tắc gạt chọn boot
    // mặt dưới: khe M.2 + pin CR2032 + UART
    const u = B.group({ y: -1.6 });
    u.add(gBox(8, 4.5, 23, 0.3, 1), PM.pbtBlack, { x: 38, y: -2.25, z: 1.5 });
    u.add(gCyl(10, 10, 3.2, 32), PM.steel, { x: -6.4, y: -1.6, z: 28.8 });
    u.add(gBox(8.6, 6.8, 11.7, 0.3, 1), colorMat(0xeeeeee, { rough: 0.5 }), { x: 40.7, y: -3.4, z: 29.05 });
  },
  silk(g, Wp, Hp, s, X, Z) {
    const c = '#e8eaec';
    text(g, 'ODROID-M2', X(-24), Z(32), 3 * s, { color: c, align: 'left' });
    text(g, 'Hardkernel  RK3588S2', X(-24), Z(35.5), 1.2 * s, { color: c, align: 'left', weight: '500' });
    text(g, 'DC 12V', X(18.25), Z(-32.5), 1.2 * s, { color: c }); text(g, 'HDMI', X(-18.85), Z(-34), 1.2 * s, { color: c });
    text(g, '1', X(11.7), Z(38.3), 1.0 * s, { color: c }); text(g, '40', X(-36.56), Z(45.2), 1.0 * s, { color: c });
  },
  silkPx: 8,
  extra(root, ctx) {
    // trụ đồng M2.5 (không có trong CAD) — nhóm riêng, vẫn hiện cạnh CAD
    const so = staticParts('odroid-m2:standoffs', (B) => { for (const [x, z] of HOLES) B.add(gCyl(2.6, 2.6, BOT, 6), PM.brass, { x, y: BOT / 2, z }); });
    so.userData.keepWithCad = true; root.add(so);
    ud(root, 'leds', { pwr: dynLed(root, LEDS.pwr[0], ctx.top, LEDS.pwr[1], 0xff2020), alive: dynLed(root, LEDS.alive[0], ctx.top, LEDS.alive[1], 0x2a6bff) });
  },
  extraDef: {
    cad: 'boards/odroid-m2',
    cadOptions: {
      onBottom: false, offset: [0, BOT, 0],
      onLoad(glb, root) {
        const pwr = cadLed(glb, 'led_pwr', 0xff2020), alive = cadLed(glb, 'led_sys', 0x2a6bff);
        if (pwr && alive) ud(root, 'leds', { pwr, alive });
      },
    },
    cadPinNode: (p) => p.cadNode || null,
    update(inst, dt, game) {
      const L = inst.object.userData.leds, st = inst.state || {};
      if (!L) return;
      L.pwr.material.emissiveIntensity = st.powered ? 2.5 : 0;
      const t = game?.time?.now ?? (st._t = (st._t || 0) + (dt || 0));
      L.alive.material.emissiveIntensity = st.powered && (t % 1.0) < 0.12 ? 3 : 0;   // nhịp tim "heartbeat"
    },
  },
  electrical: { type: 'sbc', soc: 'RK3588S2', vin: [7.5, 15], powerW: [4, 18], logic: 3.3, gpioHeader: 'GPIO-1…40 (RPi)' },
  meta: { ports: ['DC-IN', 'HDMI', 'USB3×2', 'RJ45', 'USB-C', 'GPIO 2×20', 'M.2 NVMe'], approxLayout: true },
});
export default def;
