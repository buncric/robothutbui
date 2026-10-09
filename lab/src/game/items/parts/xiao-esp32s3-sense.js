// Seeed Studio XIAO ESP32S3 Sense (theo CAD boards/xiao-esp32s3-sense): board chính 21.14 × 17.78 × 1.2 mm (ESP32-S3R8 + flash 8 MB dưới vỏ chắn, USB-C ở đầu −X, nút B/R,
// đầu U.FL + ăng-ten FPC rời) + board mở rộng Sense xếp chồng (camera OV2640 ống kính Ø7, khe microSD, mic PDM).
// 14 chân bước 2.54, 2 hàng cách 15.24 mm (vắt rãnh breadboard 600 mil). Đánh số kiểu DIP: chân 1 = D0 (−X, +Z).
// CAD chỉ có pad răng cưa (pin_P_n, tâm pad z = ±7.79) → header đực hàn vào pad là mô hình thủ tục, vẫn hiện cạnh CAD
// (keepHeaders); chân game ở z = ±7.62 (lệch tâm pad 0.17 mm, nằm trong pad).
import { THREE, PM, text, gBox, gCyl, colorMat, tubeGeo, cached, staticParts } from './_shared.js';
import { moduleDef, dynLed, ud, headerCad, cadLed } from './_lib/module.js';
import { usbC, tactSmd, chip, qfn, ledSmd } from './_lib/pcb.js';

const L = 21.14, Wd = 17.78, ZR = 7.62, T = 1.2;
const UFL = [9.12, 4.85], LED_CHG = [-6.71, 5.84], BTN = { B: [-8.92, -5.84], R: [-8.92, 5.84] };   // theo CAD
const ROW1 = ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6'];
const ROW2 = ['D7', 'D8', 'D9', 'D10', '3V3', 'GND', '5V'];
const GPIO = { D0: 1, D1: 2, D2: 3, D3: 4, D4: 5, D5: 6, D6: 43, D7: 44, D8: 7, D9: 8, D10: 9 };
const pins = [
  ...ROW1.map((n, i) => [String(i + 1), n, -7.62 + i * 2.54, ZR, { gpio: GPIO[n] }]),
  ...ROW2.map((n, i) => [String(i + 8), n, 7.62 - i * 2.54, -ZR, { gpio: GPIO[n] ?? null }]),
];
const EXP_Y = 3.4;   // khoảng hở giữa 2 board (đầu nối B2B)

const def = moduleDef({
  id: 'xiao-esp32s3-sense', name: 'XIAO ESP32S3 Sense (camera)', lessonId: 'esp32-s3', massG: 5.5,
  w: L, d: Wd, t: T, mask: PM.maskBlack, height: 14, r: 2.0,
  headers: [{ pins }], keepHeaders: true,
  grip: { pose: 'pinch', offset: [0, 20, 0], rot: [0, 0, 0] },
  fill(B) {
    usbC(B, -8.18, 0, Math.PI);
    B.add(gBox(12.6, 2.0, 12.0, 0.2, 1), PM.steelBrushed, { x: 2.6, y: 1.0, z: 0 });        // vỏ chắn ESP32-S3R8
    B.add(gCyl(1.0, 1.0, 1.2, 16), PM.gold, { x: UFL[0], y: 0.6, z: UFL[1] });            // đầu U.FL
    for (const [x, z] of Object.values(BTN)) tactSmd(B, x, z, 0, { w: 2.6, d: 1.6, h: 0.8 });
    ledSmd(B, -6.71, -5.89, Math.PI / 2, 0xffc21a, '0402'); ledSmd(B, LED_CHG[0], LED_CHG[1], Math.PI / 2, 0xff3a1a, '0402');
    chip(B, '0402', -2.6, -3.5, 0, 'C'); chip(B, '0402', -2.6, -2.4, 0, 'R');
    // board mở rộng Sense (xếp chồng)
    const e = B.group({ y: EXP_Y });
    e.add(gBox(L - 0.4, 1.0, Wd - 0.4, 1.5, 2), PM.maskBlack, { y: 0.5 });
    e.add(gBox(5, EXP_Y, 3), PM.pbtBlack, { x: -1, y: -EXP_Y / 2, z: 0 });                 // đầu nối B2B
    e.add(gBox(11.6, 1.5, 11.2, 0.2, 1), PM.steelBrushed, { x: 3.2, y: 1.0 + 0.75, z: 0 }); // khe microSD
    e.add(gBox(10, 0.3, 4), colorMat(0xd18a1e, { rough: 0.35 }), { x: -4.5, y: 1.15, z: -4.5 });   // cáp FPC camera
    const cam = e.group({ x: -7.04, y: 1.0, z: 0.64 });
    cam.add(gBox(8.5, 2.0, 8.5, 0.3, 1), PM.pbtBlack, { y: 1.0 + 1.6 });
    cam.add(gCyl(3.5, 3.6, 4.2, 28), PM.pbtBlack, { y: 3.6 + 2.1 });
    cam.add(gCyl(2.0, 2.0, 0.15, 24), PM.lensGlass, { y: 7.8 });
    cam.add(gCyl(2.7, 2.7, 0.3, 24, true), PM.aluminum, { y: 7.7 });
    cam.add(gBox(8.6, 1.6, 8.6), colorMat(0x111a14, { rough: 0.6 }), { y: 0.8 });   // đế keo xốp
    qfn(e.group({ y: 1.0 }), 3, 8.8, -6.2, 0, { n: 4, mark: false });                      // mic PDM
  },
  silk(g, W, H, s, X, Z) {
    const c = '#eef0f2';
    pins.forEach(([, n, x, z]) => text(g, n, X(x), Z(z + (z > 0 ? -1.6 : 1.6)), 0.6 * s, { color: c }));
    text(g, 'XIAO', X(6), Z(4.8), 1.0 * s, { color: c });
  },
  extra(root, ctx) {
    // ăng-ten FPC rời + cáp đồng trục Ø1.13 (phụ kiện, không có trong CAD → nhóm riêng vẫn hiện cạnh CAD)
    const ant = staticParts('xiao:antenna', (B) => {
      B.add(cached('xiao:coax', () => tubeGeo([[UFL[0], 1.2, UFL[1]], [11, 2.5, 6], [16, -2, 7], [22, -9.6, 8]].map((p) => new THREE.Vector3(...p)), 0.56, { radial: 6 })), colorMat(0x333333, { rough: 0.6 }));
      B.add(gBox(18, 0.25, 5), colorMat(0xb98a2a, { rough: 0.35 }), { x: 31, y: -9.9, z: 8 });
    });
    ant.position.y = ctx.top; ant.userData.keepWithCad = true; root.add(ant);
    ud(root, 'chg', dynLed(root, LED_CHG[0], ctx.top + 0.45, LED_CHG[1], 0xff3a1a, { w: 0.6, d: 1.0, h: 0.05 }));
  },
  extraDef: {
    update(inst) { const l = inst.object.userData.chg; if (l) l.material.emissiveIntensity = inst.state?.charging ? 2 : 0; },
    cad: 'boards/xiao-esp32s3-sense',
    cadOptions: headerCad({ onLoad(glb, root) { const l = cadLed(glb, 'led_chg', 0xff3a1a); if (l) ud(root, 'chg', l); } }),
    cadPinNode: () => null,   // CAD chỉ có pad răng cưa (không có chân header) — xem chú thích đầu file
  },
  insertInto: ['bb-span-600', 'bb-hole', 'pcb-hole', 'header-female'],
  meta: {
    dip: { n: 14, row: 15.24, pitch: 2.54 },
    orientationKey: { pin: '1', axis: 'x', sign: -1, mark: 'usb-end', note: 'Đầu USB-C = phía chân 1 (D0) và chân 14 (5V)' },
    usbPorts: [{ id: 'USB', pos: [-12.07, 10.88, 0], dir: [-1, 0, 0] }],
  },
  electrical: { type: 'mcu-board', chip: 'ESP32-S3R8', logic: 3.3, vin5V: '14', v3v3: '12', gnd: ['13'], camera: 'OV2640', sd: true, mic: 'PDM' },
});
export default def;
