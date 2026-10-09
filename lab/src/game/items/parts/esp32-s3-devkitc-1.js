// ESP32-S3-DevKitC-1 (v1.1, N8R8) — theo CAD boards/esp32-s3-devkitc-1 (DXF Espressif): PCB 62.87 × 25.4 mm phủ đen,
// module ESP32-S3-WROOM-1 (vỏ chắn thép + ăng-ten mạch in ở đầu +X, nhô khỏi PCB 6.3 mm), 2 cổng USB-C ở đầu −X
// (USB-OTG gốc ở +Z, USB-UART CP2102N ở −Z), nút BOOT (GPIO0, −Z) & RST (EN, +Z), LDO 3.3 V, LED RGB WS2812, LED nguồn đỏ,
// 2 hàng header 22 chân J1 (−Z) / J3 (+Z) cách nhau 22.86 mm — chân 1 ở đầu ăng-ten (x = +29.87), chân chúc xuống.
// Bảng chân theo src/components/dieu-khien/esp32-s3.js.
import { PM, text, decal, gBox, gCyl, colorMat, mesh } from './_shared.js';
import { moduleDef, dynLed, ud, headerCad, cadLed, nudgeY, markCadNode } from './_lib/module.js';
import { usbC, tactSmd, sot223, qfn, chip, sot23 } from './_lib/pcb.js';

const J1 = ['3V3', '3V3', 'RST', 4, 5, 6, 7, 15, 16, 17, 18, 8, 3, 46, 9, 10, 11, 12, 13, 14, '5V', 'GND'];
const J3 = ['GND', 43, 44, 1, 2, 42, 41, 40, 39, 38, 37, 36, 35, 0, 45, 48, 47, 21, 20, 19, 'GND', 'GND'];
const ROLE = { 17: 'UART1 TX → BSS138 LV2', 18: 'UART1 RX ← BSS138 LV1', 4: 'PWM quạt hút', 5: 'FG quạt', 8: 'I2C SDA (MPU6050)', 9: 'I2C SCL (MPU6050)', 16: 'UART2 RX ← lidar', 15: 'PWM motor lidar', 6: 'Còi', 0: 'BOOT / START', 48: 'LED RGB (v1.0)', 38: 'LED RGB (v1.1)' };
const AVOID = new Set([0, 3, 45, 46, 19, 20, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 43, 44]);
const L = 62.87, Wd = 25.4, ZR = 11.43, X1 = 29.867;   // chân 1 của J1/J3 ở x = +29.867, chân 22 ở −23.473
const nm = (g) => (typeof g === 'number' ? `GPIO${g}` : g);
const pinX = (i) => +(X1 - i * 2.54).toFixed(3);
const pins = [];
J1.forEach((g, i) => pins.push([`J1-${i + 1}`, nm(g), pinX(i), -ZR, { gpio: typeof g === 'number' ? g : null, role: ROLE[g], avoid: AVOID.has(g) }]));
J3.forEach((g, i) => pins.push([`J3-${i + 1}`, nm(g), pinX(i), ZR, { gpio: typeof g === 'number' ? g : null, role: ROLE[g], avoid: AVOID.has(g) }]));
// vị trí theo CAD (x, z)
const WROOM_X = 24.97, BTN = { BOOT: [-17.47, -5.17], RST: [-17.47, 5.21] }, RGB = [-2.35, -5.21], PWR = [3.55, 6.4];
const USB = { USB: 6.7, UART: -6.7 }, USB_X = -27.84;

function shieldMark(g, W, H, s) {
  const c = '#3b3e43';
  text(g, 'ESP32-S3-WROOM-1', W * 0.5, H * 0.18, 1.35 * s, { color: c });
  text(g, 'ESP32-S3-WROOM-1-N8R8', W * 0.5, H * 0.32, 0.9 * s, { color: c, weight: '600' });
  text(g, 'FCC ID: 2AC7Z-ESPS3WROOM1', W * 0.5, H * 0.44, 0.75 * s, { color: c, weight: '500' });
  // mã QR giả lập
  const q = 4.6 * s, qx = W * 0.5 - q / 2, qy = H * 0.52;
  g.fillStyle = c;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const n = 21, cs = q / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const finder = (i < 7 && j < 7) || (i < 7 && j > 13) || (i > 13 && j < 7);
    const on = finder ? ((i % 6 === 0 || j % 6 === 0 || (i > 1 && i < 5 && j > 1 && j < 5)) || (i > 13 && (i - 14) % 6 === 0) || (j > 13 && (j - 14) % 6 === 0)) : rnd() > 0.5;
    if (on) g.fillRect(qx + i * cs, qy + j * cs, cs * 0.95, cs * 0.95);
  }
  text(g, 'CE  ⓡ', W * 0.5, H * 0.92, 0.9 * s, { color: c });
}

const def = moduleDef({
  id: 'esp32-s3-devkitc-1', name: 'ESP32-S3-DevKitC-1 (N8R8)', lessonId: 'esp32-s3', massG: 9,
  w: L, d: Wd, mask: PM.maskBlack, height: 4,
  headers: [{ pins }],
  grip: { pose: 'grip', offset: [0, 14, 0], rot: [0, 0, 0] },
  fill(B) {
    // module WROOM-1: PCB 25.5 × 18 × 0.8 (ăng-ten ở đầu +X, nhô ra ngoài PCB chính), vỏ chắn 17.6 × 16.6 × 2.3
    const m = B.group({ x: WROOM_X });
    m.add(gBox(25.5, 0.8, 18, 0.1, 1), PM.maskBlue, { y: 0.4 });
    m.add(gBox(17.8, 2.3, 16.8, 0.25, 1), PM.steelBrushed, { x: -3.4, y: 0.8 + 1.15 });
    // ăng-ten uốn khúc (đồng dưới lớp phủ)
    for (let k = 0; k < 7; k++) m.add(gBox(4.6, 0.04, 0.45), PM.enig, { x: 9.9, y: 0.82, z: -7.5 + k * 2.5 }, { shadow: false });
    for (let k = 0; k < 6; k++) m.add(gBox(0.45, 0.04, 2.5), PM.enig, { x: k % 2 ? 7.6 : 12.2, y: 0.82, z: -6.25 + k * 2.5 }, { shadow: false });
    // chân castellated của module (vàng) dọc 2 cạnh
    for (let i = 0; i < 14; i++) for (const s of [-1, 1]) m.add(gBox(0.9, 0.82, 0.5), PM.enig, { x: 2.5 - i * 1.27, y: 0.41, z: s * 8.95 }, { shadow: false });
    B.obj(() => decal('wroom1-shield', 17.6, 16.6, shieldMark, { x: WROOM_X - 3.4, y: 10.1 + 3.12, pxPerMm: 30, rough: 0.35, metal: 0.4 }));
    usbC(B, USB_X, USB.USB, Math.PI); usbC(B, USB_X, USB.UART, Math.PI);
    for (const [x, z] of Object.values(BTN)) tactSmd(B, x, z, Math.PI / 2, { w: 3.9, d: 2.9, h: 1.6 });
    sot223(B, 4.94, 0.82, 0);                                  // LDO 3.3 V
    qfn(B, 5, -11.29, 0.89, 0, { n: 6 });                       // CP2102N
    sot23(B, -2.35, 5.08, 0); sot23(B, -2.35, -0.13, 0);       // Q1/Q2 (auto-reset)
    for (const [x, z] of [[-14.43, -2.3], [-14.43, 4.1], [-8.13, -2.3], [-8.13, 4.1], [-6.83, 0.9], [-15.83, 0.9], [0.87, 3.7], [-5.03, 5.08], [-0.03, 5.08]]) chip(B, '0402', x, z, 0, 'R');
    for (const [x, z] of [[10.47, -6.8], [10.47, 6.9], [10.57, 0.1], [0.87, -3.1], [9.07, -3.3], [9.07, 4.9]]) chip(B, '0805', x, z, Math.PI / 2, 'C');
    chip(B, '0603', PWR[0], PWR[1], 0, 'R');                   // LED nguồn (thân tĩnh)
    B.add(gBox(3.5, 1.16, 3.5), colorMat(0xf4f4f4, { rough: 0.3 }), { x: RGB[0], y: 0.58, z: RGB[1] });   // WS2812 vỏ trắng
  },
  silk(g, W, H, s, X, Z) {
    const c = '#eef0f2';
    pins.forEach(([, n, x, z]) => text(g, n.replace('GPIO', ''), X(x), Z(z + (z > 0 ? -1.9 : 1.9)), 0.62 * s, { color: c }));
    text(g, 'ESP32-S3-DevKitC-1 v1.1', X(2), Z(-8.3), 0.9 * s, { color: c });
    text(g, 'BOOT', X(-17.5), Z(-8.0), 0.7 * s, { color: c }); text(g, 'RST', X(-17.5), Z(8.0), 0.7 * s, { color: c });
    text(g, 'USB', X(-22.5), Z(USB.USB), 0.7 * s, { color: c }); text(g, 'UART', X(-22.5), Z(USB.UART), 0.7 * s, { color: c });
  },
  extra(root, ctx) {
    ud(root, 'rgb', dynLed(root, RGB[0], ctx.top + 1.16, RGB[1], 0xffffff, { w: 2.5, d: 2.5, h: 0.05 }));
    ud(root, 'pwr', dynLed(root, PWR[0], ctx.top + 0.45, PWR[1], 0xff2020, { w: 1.2, d: 0.6, h: 0.05 }));
    // nút nhấn động (lún xuống khi bấm)
    const caps = {};
    for (const [k, [x, z]] of Object.entries(BTN)) { const c = mesh(gCyl(1.0, 1.05, 0.6, 14), PM.pbtBlack, { x, y: ctx.top + 1.8, z }); root.add(c); caps[k] = c; }
    ud(root, 'btn', caps);
  },
  extraDef: {
    update(inst) {
      const u = inst.object.userData, st = inst.state || {};
      if (u.pwr) u.pwr.material.emissiveIntensity = st.powered ? 2.5 : 0;
      if (u.rgb) { const c = st.rgb || [0, 0, 0]; u.rgb.material.emissive.setRGB(c[0], c[1], c[2]); u.rgb.material.emissiveIntensity = st.powered ? 2.5 : 0; }
    },
    /** Bấm nút 'BOOT' | 'RST' (nhả: release) */
    press(inst, which = 'BOOT') { const b = inst.object.userData.btn?.[which]; if (b && !inst.state?.pressed?.[which]) nudgeY(inst.object, b, -0.25); ((inst.state ||= {}).pressed ||= {})[which] = true; return { ok: true, button: which, gpio: which === 'BOOT' ? 0 : 'EN' }; },
    release(inst, which = 'BOOT') { const b = inst.object.userData.btn?.[which]; if (b && inst.state?.pressed?.[which]) nudgeY(inst.object, b, 0.25); if (inst.state?.pressed) inst.state.pressed[which] = false; return { ok: true }; },
    cad: 'boards/esp32-s3-devkitc-1',
    cadOptions: headerCad({
      merge: true,          // GLB 356 mesh → gộp theo vật liệu (một mình nó kéo cảnh toàn phòng từ ~85 xuống ~53 fps vì draw call)
      // rebind phần động sang node CAD: nắp nút BOOT/RST (press/release), LED RGB + LED nguồn (update)
      onLoad(glb, root) {
        const b = { BOOT: markCadNode(glb.getObjectByName('btn_boot')), RST: markCadNode(glb.getObjectByName('btn_rst')) };
        if (b.BOOT && b.RST) ud(root, 'btn', b);
        const rgb = cadLed(glb, 'led_rgb', 0xffffff); if (rgb) ud(root, 'rgb', rgb);
        const pwr = cadLed(glb, 'led_pwr', 0xff2020); if (pwr) ud(root, 'pwr', pwr);
      },
    }),
  },
  electrical: { type: 'mcu-board', chip: 'ESP32-S3', logic: 3.3, vin5V: 'J1-21', v3v3: ['J1-1', 'J1-2'], gnd: ['J1-22', 'J3-1', 'J3-21', 'J3-22'], gpioMaxmA: 40, ldoMaxmA: 500, usb: ['USB-OTG', 'USB-UART'] },
  meta: { usbPorts: [{ id: 'USB', pos: [-31.75, 11.28, USB.USB], dir: [-1, 0, 0] }, { id: 'UART', pos: [-31.75, 11.28, USB.UART], dir: [-1, 0, 0] }] },
});
export default def;
