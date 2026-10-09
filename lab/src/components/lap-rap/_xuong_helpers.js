// Hàm phụ cho "Xưởng lắp ráp tự do" (xuong-lap-rap.js) — KHÔNG có export default (app & smoke test bỏ qua file này).
// Hệ trục robot giống robot-assembly: +x = phía TRƯỚC, +z = bên PHẢI, y lên; sàn (đáy bánh) y = 0.
import * as THREE from 'three';

const D2R = Math.PI / 180;
export const STAND = 45;            // giá kê: robot y = 0 ↔ thế giới y = 45 trên mặt bàn (bánh không chạm bàn)
export const PLATE = 13;            // mặt trên khung đáy (robot y)
export const DECK = 80;             // mặt trên tầng mạch mica
export const TOPY = 118;            // mặt đế lidar
export const BENCH = { w: 2000, d: 1000, h: 760 };
export const ARENA = { cx: 0, cy: -760, cz: 1500, x0: -800, x1: 800, z0: -600, z1: 600, drop: 150 };
export const BENCH_VIEW = { target: [0, 70, 0], cam: [430, 560, 760] };
export const ARENA_VIEW = { target: [0, -760, 1500], cam: [1250, 650, 3150] };

export const CAT_ORDER = ['co-khi', 'dong-luc', 'dien-tu', 'nguon', 'dieu-khien', 'cam-bien'];
export const CAT_NAMES = {
  'co-khi': 'Cơ khí', 'dong-luc': 'Động cơ & truyền động', 'dien-tu': 'Linh kiện điện tử cơ bản',
  nguon: 'Nguồn & pin', 'dieu-khien': 'Vi điều khiển & mạch', 'cam-bien': 'Cảm biến',
};

// ---------------------------------------------------------------------------------------------
// Ô lắp (slot) trên khung robot. pos = robot frame; fit = hộp [rộng x, cao y, sâu z] mà linh kiện
// được thu nhỏ vừa vào; r = bán kính bắt dính (mm, đo trên mặt XZ); step = bước hướng dẫn.
// misfit: lắp VỪA nhưng SAI (ô đỏ + lý do + hậu quả khi chạy thử).
// ---------------------------------------------------------------------------------------------
const CLIFF_A = [80, 18, -18, -80];
const CLIFF_N = ['trái', 'trước-trái', 'trước-phải', 'phải'];
export const SLOTS = [
  { id: 'banh-trai', name: 'Bánh trái', kind: 'Bánh xe chủ động', accepts: ['banh-xe'], pos: [0, 0, -117.5], mirror: true, fit: [140, 80, 100], r: 55, ghost: { shape: 'wheel' }, step: 1, mass: 0.2,
    why: 'Hai bánh chủ động nằm trên đường kính ngang qua tâm (cách nhau 235 mm) → robot quay tại chỗ quanh tâm, thân tròn không quét vào tường khi xoay.' },
  { id: 'banh-phai', name: 'Bánh phải', kind: 'Bánh xe chủ động', accepts: ['banh-xe'], pos: [0, 0, 117.5], fit: [140, 80, 100], r: 55, ghost: { shape: 'wheel' }, step: 1, mass: 0.2,
    why: 'Đối xứng với bánh trái. Gearbox quay vào trong để bánh sát mép vỏ — vết bánh rộng thì robot khó lật ngang.' },
  { id: 'banh-xoay', name: 'Bánh xoay trước', kind: 'Bánh xoay', accepts: ['banh-xoay'], pos: [125, 0, 0], fit: [50, 45, 50], r: 40, ghost: { shape: 'cyl', size: [40, 30] }, step: 2, mass: 0.03,
    why: 'Điểm tựa thứ 3 phía trước trục bánh 125 mm: trọng tâm phải nằm GIỮA trục bánh và bánh xoay thì robot mới đứng vững.' },
  { id: 'choi-cuon', name: 'Chổi cuộn', kind: 'Chổi cuộn', accepts: ['choi-cuon'], pos: [75, 2, 0], fit: [60, 55, 195], r: 50, step: 3, mass: 0.12,
    why: 'Ngay trước trục bánh, nằm ngang hết bề rộng: bánh chưa kịp đè lên rác thì chổi đã hất rác vào miệng hút.' },
  { id: 'choi-canh-trai', name: 'Chổi cạnh trái', kind: 'Chổi cạnh', accepts: ['choi-canh'], pos: [110, 0, -118], mirror: true, fit: [140, 50, 140], r: 45, ghost: { shape: 'cyl', size: [120, 14] }, step: 3, mass: 0.04,
    why: 'Ở góc trước, lông thò ra ngoài vỏ để quét bụi chân tường/góc nhà vào đường chổi cuộn.' },
  { id: 'choi-canh-phai', name: 'Chổi cạnh phải', kind: 'Chổi cạnh', accepts: ['choi-canh'], pos: [110, 0, 118], fit: [140, 50, 140], r: 45, ghost: { shape: 'cyl', size: [120, 14] }, step: 3, mass: 0.04,
    why: 'Đối xứng chổi trái, quay ngược chiều để cả hai cùng gom rác vào giữa.' },
  { id: 'hop-bui', name: 'Hộp bụi + lọc HEPA', kind: 'Hộp bụi + lọc', accepts: ['hop-bui'], pos: [-125, PLATE, -25], fit: [60, 55, 140], r: 55, step: 4, mass: 0.1,
    why: 'Phía sau, rút ra từ đuôi để đổ rác (bảo trì dễ). Đường gió: chổi → miệng hút → hộp bụi → lưới lọc → HEPA → QUẠT → cửa xả.',
    misfit: {
      'quat-bldc': { reason: 'Quạt hút phải nằm SAU hộp bụi — bụi đi qua lọc trước khi tới quạt', run: 'quat-truoc' },
      'pack-4s-bms': { reason: 'Pin đặt thấp & ở giữa để trọng tâm thấp — đặt ở đuôi thì trọng tâm lùi ra sau trục bánh, robot ngóc đầu', run: 'pin-sau' },
    } },
  { id: 'quat', name: 'Quạt hút (phía sạch, sau lọc)', kind: 'Quạt hút', accepts: ['quat-bldc'], pos: [-118, PLATE, 66], fit: [60, 60, 60], r: 45, ghost: { shape: 'cyl' }, step: 5, mass: 0.18,
    why: 'Cuối đường gió, ở "phía sạch" sau lọc HEPA: chỉ không khí sạch đi qua cánh quạt 15–20 nghìn vòng/phút.',
    misfit: { 'hop-bui': { reason: 'Hộp bụi phải nằm TRƯỚC quạt — đặt vào chỗ quạt thì quạt thành ra hút bụi trước khi lọc', run: 'quat-truoc' } } },
  { id: 'pin', name: 'Pack pin 4S + BMS', kind: 'Pin 4S', accepts: ['pack-4s-bms'], pos: [-3, PLATE, 0], fit: [104, 36, 78], r: 50, step: 6, mass: 0.3,
    why: 'Khối nặng nhất (~300 g) đặt THẤP, ngay giữa 2 bánh → trọng tâm thấp và không bị kéo ra sau trục bánh. Nắp pin mở từ đáy để tháo pin đầu tiên.',
    misfit: {
      'pin-18650': { reason: '1 cell 18650 chỉ có 3.0–4.2 V — robot cần pack 4S nối tiếp (12–16.8 V)', run: 'thieu-ap' },
      'hop-bui': { reason: 'Hộp bụi phải ở đuôi (rút ra đổ rác, nằm trên đường gió chổi → quạt) — chỗ giữa, thấp này dành cho khối nặng nhất là pin', run: 'pin-sau' },
    } },
  { id: 'cau-chi', name: 'Cầu chì 10 A (+ công tắc gắn sẵn)', kind: 'Cầu chì + công tắc', accepts: ['cau-chi'], pos: [-88, DECK, -8], fit: [50, 25, 22], r: 35, step: 6, mass: 0.01,
    why: 'Sát cực + của pin (dây trước cầu chì càng ngắn càng tốt), ngay trước công tắc chính ở thành sau — dễ mở thay.' },
  { id: 'buck', name: 'Mạch hạ áp buck 5 V', kind: 'Buck 5 V', accepts: ['buck-xl4015'], pos: [-48, DECK, -38], fit: [56, 20, 28], r: 35, step: 7, mass: 0.03,
    why: 'Giữa pin và các bo logic: dây VBAT vào ngắn, dây 5 V ra ngắn. Cuộn cảm & diode nóng → đặt ở mép tầng mạch, thoáng.' },
  { id: 'pic', name: 'Bo PIC16F877A', kind: 'Mạch PIC', accepts: ['pic16f877a'], pos: [25, DECK + 2, -35], fit: [60, 15, 24], r: 38, step: 8, mass: 0.03,
    why: 'Giữa tầng mạch, gần 2 driver (dây PWM ngắn) và gần đầu nối cảm biến phía trước (cliff, bumper).' },
  { id: 'drv-trai', name: 'DRV8871 trái', kind: 'Driver DRV8871', accepts: ['driver-drv8871'], pos: [-30, DECK, -82], fit: [40, 25, 34], r: 35, step: 9, mass: 0.008,
    why: 'Ngay trên động cơ bánh trái: dây động cơ (dòng lớn, nhiễu) ngắn nhất; có đế nhôm tản nhiệt cho PowerPAD.',
    misfit: { 'esp32-s3': { reason: 'ESP32 cần xa động cơ chổi than để giảm nhiễu — ô này nằm ngay trên động cơ bánh', run: 'esp-nhieu' } } },
  { id: 'drv-phai', name: 'DRV8871 phải', kind: 'Driver DRV8871', accepts: ['driver-drv8871'], pos: [-30, DECK, 82], fit: [40, 25, 34], r: 35, step: 9, mass: 0.008,
    why: 'Ngay trên động cơ bánh phải, đối xứng driver trái.',
    misfit: { 'esp32-s3': { reason: 'ESP32 cần xa động cơ chổi than để giảm nhiễu — ô này nằm ngay trên động cơ bánh', run: 'esp-nhieu' } } },
  { id: 'mosfet', name: 'Bo MOSFET chổi (khuyên dùng)', kind: 'Bo MOSFET chổi', accepts: ['mosfet'], pos: [42, DECK, 72], fit: [44, 22, 34], r: 35, step: 9, req: false, mass: 0.015,
    why: 'Gần động cơ chổi cuộn (phía trước-phải). IRLZ44N + diode SS34 cho PIC (RD5/RD6) bật/tắt chổi.' },
  { id: 'esp32', name: 'ESP32-S3', kind: 'ESP32-S3', accepts: ['esp32-s3'], pos: [-45, DECK, 35], fit: [66, 22, 33], r: 38, step: 10, mass: 0.01,
    why: 'Giữa – sau tầng mạch, XA động cơ chổi than & dây động cơ (nhiễu), gần lidar & mép vỏ để anten BLE ít bị che.',
    misfit: { 'driver-drv8871': { reason: 'DRV8871 cần tản nhiệt & gần động cơ — ô ESP32 không có đế nhôm, dây động cơ phải kéo dài qua cả tầng mạch', run: 'drv-nong' } } },
  { id: 'bss138', name: 'Chuyển mức BSS138', kind: 'BSS138', accepts: ['bss138-level-shifter'], pos: [25, DECK, 30], fit: [28, 24, 28], r: 30, step: 10, mass: 0.003,
    why: 'Nằm giữa PIC (5 V) và ESP32 (3.3 V) để 2 đoạn dây UART đều ngắn.' },
  { id: 'mpu', name: 'MPU6050 (tâm robot)', kind: 'MPU6050', accepts: ['mpu6050'], pos: [-10, DECK, 0], fit: [28, 16, 28], r: 25, step: 11, mass: 0.003,
    why: 'Gần tâm quay (trung điểm trục bánh), nằm phẳng: con quay trục Z đo đúng góc quay, ít bị gia tốc ly tâm.' },
  ...CLIFF_A.map((a, i) => ({
    id: `cliff-${i + 1}`, name: `Chống rơi #${i + 1} (${CLIFF_N[i]})`, kind: 'Cảm biến chống rơi', accepts: ['cliff-ir'],
    pos: [155 * Math.cos(a * D2R), 4, -155 * Math.sin(a * D2R)], ry: a * D2R, fit: [34, 22, 34], r: 30, ghost: { shape: 'cyl', size: [26, 18] }, step: 11, mass: 0.008, angle: a * D2R,
    why: 'Ở mép TRƯỚC đáy robot, trước cả bánh xoay: phải thấy mép hố trước khi bánh xoay (cách tâm 125 mm) hụt chân. 4 cái trải từ trái sang phải để nhìn được mép xiên.',
  })),
  { id: 'bumper', name: 'Bumper (cản va trước)', kind: 'Bumper', accepts: ['bumper'], pos: [0, 12, 0], fit: [380, 75, 380], r: 60, ghost: { shape: 'ring' }, step: 12, mass: 0.1, cgx: 100,
    why: 'Ôm nửa trước (hướng đi tới), có lò xo hồi & 2 công tắc trái/phải → biết va bên nào để quay ngược lại.' },
  { id: 'lidar', name: 'Lidar (trên nóc, phía sau)', kind: 'Lidar', accepts: ['lidar-lds'], pos: [-70, TOPY, 0], fit: [100, 55, 90], r: 45, ghost: { shape: 'cyl', size: [90, 45] }, step: 13, mass: 0.19,
    why: 'Cao nhất để tia laser quét 360° không bị vỏ che; lệch về sau để cân với chổi/bánh xoay phía trước.',
    misfit: { 'pack-4s-bms': { reason: 'Pin đặt thấp & ở giữa để trọng tâm thấp — trên nóc làm trọng tâm cao, robot lắc mạnh khi va/leo ngưỡng cửa', run: 'pin-cao' } } },
];

// Chỗ bày sẵn trên bàn (x, z thế giới) cho module của từng ô — dùng cho "📦 bộ linh kiện" & hướng dẫn
export const KIT = {
  'banh-trai': [860, 90], 'banh-phai': [860, 320], 'banh-xoay': [470, 395], 'choi-cuon': [440, 160],
  'choi-canh-trai': [650, 130], 'choi-canh-phai': [650, 340], 'hop-bui': [870, -330], quat: [870, -110],
  bumper: [560, -250], pin: [-460, -330], 'cau-chi': [-460, -175], buck: [-460, -50], pic: [-460, 60],
  bss138: [-460, 165], mpu: [-460, 290], esp32: [-660, -330], 'drv-trai': [-660, -175], 'drv-phai': [-660, -30],
  mosfet: [-660, 120], lidar: [-660, 320], 'cliff-1': [-860, -330], 'cliff-2': [-860, -150], 'cliff-3': [-860, 30], 'cliff-4': [-860, 210],
};

// Điểm nối dây trên khung (robot frame): công tắc chính gắn sẵn ở thành sau
export const SWITCH_POS = [-166, 36, 45];

// Danh sách dây cần đi (docs/01). a/b = id ô; '@sw' = công tắc chính gắn sẵn trên vỏ.
export const WIRE_COLORS = { vbat: 0xe5484d, v5: 0xff9a3c, gnd: 0x2b2f36, pwm: 0xffd34d, motor: 0xf2f2f2, input: 0x1fc7c7, adc: 0x2fbf71, uart: 0x3b8ef0, i2c: 0xa86bf0, out: 0xf0e3a8 };
export const WIRE_KIND_NAMES = { vbat: 'VBAT 14.4 V', v5: '5 V logic', gnd: 'GND', pwm: 'PWM', motor: 'Động cơ', input: 'Tín hiệu vào', adc: 'Analog', uart: 'UART', i2c: 'I2C', out: 'Điều khiển' };
export const WIRES = [
  { id: 'pin-cc', a: 'pin', b: 'cau-chi', kind: 'vbat', label: 'Pin (+) → cầu chì 10 A (dây ngắn nhất có thể)' },
  { id: 'cc-sw', a: 'cau-chi', b: '@sw', kind: 'vbat', label: 'Cầu chì → công tắc chính → thanh VBAT' },
  { id: 'vb-drvL', a: '@sw', b: 'drv-trai', kind: 'vbat', label: 'VBAT → DRV8871 trái (VM, tụ 1000 µF)' },
  { id: 'vb-drvR', a: '@sw', b: 'drv-phai', kind: 'vbat', label: 'VBAT → DRV8871 phải (VM, tụ 1000 µF)' },
  { id: 'vb-fan', a: '@sw', b: 'quat', kind: 'vbat', label: 'VBAT → quạt hút (dây ≥ AWG20)' },
  { id: 'vb-mos', a: '@sw', b: 'mosfet', kind: 'vbat', label: 'VBAT → bo MOSFET chổi', optional: true },
  { id: 'vb-buck', a: '@sw', b: 'buck', kind: 'vbat', label: 'VBAT → buck XL4015 (IN+ / IN−)' },
  { id: '5v-pic', a: 'buck', b: 'pic', kind: 'v5', label: 'Buck 5 V → PIC VDD (chân 11, 32) + tụ 100 nF' },
  { id: '5v-esp', a: 'buck', b: 'esp32', kind: 'v5', label: 'Buck 5 V → ESP32 chân 5V (LDO onboard → 3.3 V)' },
  { id: '5v-sen', a: 'buck', b: 'cliff-2', kind: 'v5', label: '5 V → cảm biến (cliff, encoder, BSS138 phía HV)' },
  { id: 'gnd-pic', a: 'pin', b: 'pic', kind: 'gnd', label: 'GND chung hình sao: cực âm pin → PIC' },
  { id: 'gnd-esp', a: 'pin', b: 'esp32', kind: 'gnd', label: 'GND chung hình sao: cực âm pin → ESP32' },
  { id: 'pwm-L', a: 'pic', b: 'drv-trai', kind: 'pwm', label: 'CCP1 (RC2, chân 17) → IN1 · RD0 (chân 19) → IN2 — DRV trái' },
  { id: 'pwm-R', a: 'pic', b: 'drv-phai', kind: 'pwm', label: 'CCP2 (RC1, chân 16) → IN1 · RD2 (chân 21) → IN2 — DRV phải' },
  { id: 'mot-L', a: 'drv-trai', b: 'banh-trai', kind: 'motor', label: 'DRV trái OUT1/OUT2 → động cơ bánh trái (tụ 100 nF hai cực)' },
  { id: 'mot-R', a: 'drv-phai', b: 'banh-phai', kind: 'motor', label: 'DRV phải OUT1/OUT2 → động cơ bánh phải' },
  { id: 'enc-L', a: 'banh-trai', b: 'pic', kind: 'input', label: 'Encoder trái → RA4/T0CKI (chân 6, kéo lên 10 kΩ)' },
  { id: 'enc-R', a: 'banh-phai', b: 'pic', kind: 'input', label: 'Encoder phải → RC0/T1CKI (chân 15)' },
  { id: 'bump', a: 'bumper', b: 'pic', kind: 'input', label: 'Bumper trái/phải → RB4/RB5 (chân 37/38, chạm = 0)' },
  ...[1, 2, 3, 4].map((i) => ({ id: `cl-${i}`, a: `cliff-${i}`, b: 'pic', kind: 'adc', label: `Cliff #${i} → AN${i} (${['RA1, chân 3', 'RA2, chân 4', 'RA3, chân 5', 'RA5, chân 7'][i - 1]})` })),
  { id: 'uart-hv', a: 'pic', b: 'bss138', kind: 'uart', label: 'PIC RC6/TX, RC7/RX ↔ BSS138 phía HV (5 V)' },
  { id: 'uart-lv', a: 'bss138', b: 'esp32', kind: 'uart', label: 'BSS138 phía LV (3.3 V) ↔ ESP32 GPIO18 (RX) / GPIO17 (TX)' },
  { id: 'fan-pwm', a: 'esp32', b: 'quat', kind: 'pwm', label: 'ESP32 GPIO4 → PWM quạt (FG quạt → GPIO5)' },
  { id: 'i2c', a: 'esp32', b: 'mpu', kind: 'i2c', label: 'ESP32 GPIO8/9 (SDA/SCL) → MPU6050' },
  { id: 'lidar', a: 'lidar', b: 'esp32', kind: 'uart', label: 'Lidar TX → GPIO16 · PWM motor lidar ← GPIO15' },
  { id: 'rd5', a: 'pic', b: 'mosfet', kind: 'out', label: 'RD5/RD6 → cổng MOSFET chổi cuộn / chổi cạnh (100 Ω + 10 kΩ kéo xuống)', optional: true },
  { id: 'brush', a: 'mosfet', b: 'choi-cuon', kind: 'motor', label: 'MOSFET → động cơ chổi cuộn + chổi cạnh (diode SS34 ngược)', optional: true },
];

// Khối lượng ước tính (kg) cho tính trọng tâm — loại khác mặc định 0.03 kg
export const MASS = {
  'banh-xe': 0.2, 'banh-xoay': 0.03, 'choi-cuon': 0.12, 'choi-canh': 0.04, 'hop-bui': 0.1, 'quat-bldc': 0.15,
  'pack-4s-bms': 0.3, 'pin-18650': 0.046, 'cau-chi': 0.01, 'buck-xl4015': 0.03, 'pic16f877a': 0.03, 'esp32-s3': 0.01,
  'driver-drv8871': 0.008, 'bss138-level-shifter': 0.003, 'cliff-ir': 0.008, bumper: 0.1, 'lidar-lds': 0.19, mpu6050: 0.003, mosfet: 0.015,
};
export const CHASSIS_MASS = 0.85;      // khung đáy + vỏ + tầng mạch + vít
export const CHASSIS_CG = [35, 32, 0]; // trọng tâm riêng của khung: nửa trước nặng hơn (hốc bánh xoay, giá bumper, mô-tơ chổi cạnh, bo cliff)

// ---------------------------------------------------------------------------------------------
// Tinh chỉnh từng linh kiện khi đưa vào xưởng: xoay sẵn (ry), điểm neo (anchor, toạ độ gốc linh kiện),
// ẩn đạo cụ minh hoạ (sàn, tường, vật cản, sơ đồ phóng to…)
// ---------------------------------------------------------------------------------------------
export const FIT = {
  'banh-xe': { anchor: [0, -1] },                                   // tâm bánh
  'banh-xoay': { anchor: [0, 0], keep: { x: [-60, 60], z: [-60, 60] } },
  'choi-cuon': { ry: Math.PI / 2 },
  'choi-canh': { anchor: [0, 0] },                                  // trục động cơ chổi
  'hop-bui': { ry: -Math.PI / 2, hide: /quạt|cửa xả/i, hideUnnamedMeshes: true },
  bumper: { anchor: [0, 0], hide: /vỏ đáy robot|vách sau thân|nắp trên/i },
  'pack-4s-bms': { ry: Math.PI / 2 },
};
const PROP_RE = /sàn nhà|^mặt sàn|chân tường|vẽ mờ|vật cản|đáy hố|đế bàn xoay|sơ đồ cầu h|\(ảo\)|— tải|miệng hút|chổi cuộn \+ động cơ|nguồn nhiễu|động cơ bánh rs-|đĩa đánh dấu|phóng to/i;
// toggle "trang trí" tắt đi cho gọn (cắt bổ, tia, luồng khí, phóng to…)
const TOGGLE_OFF = new Set(['cut', 'rays', 'air', 'hb', 'field', 'flow', 'zoom', 'mems', 'forces', 'wave', 'ions', 'see', 'map', 'lift']);

export function defaultParams(def) {
  const p = {};
  for (const q of def.params || []) {
    if (q.type === 'button') continue;
    p[q.id] = q.value ?? (q.type === 'range' ? q.min : q.type === 'select' ? q.options?.[0]?.[0] : false);
    if (q.type === 'toggle' && (TOGGLE_OFF.has(q.id) || (q.id === 'open' && def.id !== 'quat-bldc'))) p[q.id] = false;
    if (q.type === 'select' && q.id === 'view' && q.options?.some((o) => o[0] === 'close')) p[q.id] = 'close';
  }
  return p;
}

const NOOP_FX = { smoke() {}, fire() {}, sparks() {}, flash() {}, pop() {}, scorch() {}, heat() {}, restore() {}, clear() {}, update() {} };
const STUB_SB = { items: [], add() { return null; }, remove() { return false; }, clear() {}, serialize() { return []; }, load() {}, select() {}, dispose() {}, enabled: false };

/** ctx con cho linh kiện được "mượn" vào xưởng: không camera, không nhãn DOM, số đo & hiệu ứng câm */
export function subCtx(ctx) {
  return {
    THREE: ctx.THREE || THREE, MAT: ctx.MAT, PIN_COLORS: ctx.PIN_COLORS, tint: ctx.tint, geom: ctx.geom, viewer: null,
    label: (parent) => { const o = new THREE.Object3D(); o.userData.isLabel = true; parent.add(o); return o; },
    readout: () => {}, fx: NOOP_FX, sandbox: () => STUB_SB, footprint: ctx.footprint, catalog: [],
  };
}

/** Hộp bao của các mesh ĐANG HIỆN trong `root`, tính trong hệ toạ độ của `rel` */
export function visibleBox(root, rel) {
  const box = new THREE.Box3(), tmp = new THREE.Box3(), m = new THREE.Matrix4();
  rel.updateWorldMatrix(true, false);
  root.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(rel.matrixWorld).invert();
  (function walk(o) {
    if (!o.visible) return;
    if (o.isMesh && o.geometry) {
      let bb;
      if (o.isInstancedMesh) { if (!o.boundingBox) o.computeBoundingBox(); bb = o.boundingBox; }
      else { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); bb = o.geometry.boundingBox; }
      if (bb && !bb.isEmpty() && Number.isFinite(bb.min.x)) { m.multiplyMatrices(inv, o.matrixWorld); tmp.copy(bb).applyMatrix4(m); box.union(tmp); }
    }
    for (const c of o.children) walk(c);
  })(root);
  return box;
}

const _v = new THREE.Vector3(), _c = new THREE.Vector3();
/**
 * Gỡ đạo cụ minh hoạ khỏi mô hình (sàn, tường, vật cản, tia, sơ đồ phóng to…). GỠ hẳn khỏi cây đối tượng
 * chứ không chỉ ẩn — Raycaster của three.js vẫn bắn trúng vật ẩn, sẽ làm kéo-thả chọn nhầm.
 */
function stripProps(obj, fit) {
  const out = new Set();
  obj.traverse((o) => { const n = o.userData?.part?.name; if (o !== obj && n && (PROP_RE.test(n) || fit.hide?.test(n))) out.add(o); });
  for (const c of obj.children) {
    if (out.has(c) || !c.visible) continue;
    if (c.isLine || c.isLineSegments || c.isPoints || c.isSprite || c.type === 'ArrowHelper' || c.isCSS2DObject) { out.add(c); continue; }
    if (c.userData?.part) continue;
    const b = visibleBox(c, obj);
    if (b.isEmpty()) continue;
    const sz = b.getSize(_v);
    if (sz.y < 1.5 || (sz.y < 4 && Math.max(sz.x, sz.z) > 60 && b.max.y <= 5)) { out.add(c); continue; }   // decal sàn, vạch kẻ
    if (fit.hideUnnamedMeshes && c.isMesh) { out.add(c); continue; }
    if (fit.keep) {
      const ctr = b.getCenter(_c), k = fit.keep;
      if ((k.x && (ctr.x < k.x[0] || ctr.x > k.x[1])) || (k.z && (ctr.z < k.z[0] || ctr.z > k.z[1]))) out.add(c);
    }
  }
  // vật đang ẩn sẵn (nắp, vỏ cắt bổ, tia…) cũng gỡ để không chặn chuột
  obj.traverse((o) => { if (o !== obj && !o.visible && !o.isCSS2DObject) out.add(o); });
  const removed = [];
  for (const o of out) {
    let anc = o.parent, inside = false;
    for (; anc && anc !== obj; anc = anc.parent) if (out.has(anc)) { inside = true; break; }
    if (inside || !o.parent) continue;
    o.visible = false;
    o.parent.remove(o);
    removed.push(o);
  }
  return removed;
}

/**
 * Dựng 1 món trong xưởng từ định nghĩa linh kiện của lab: wrap (sandbox giữ) → mir (thu nhỏ/soi gương) → rot (xoay sẵn) → linh kiện.
 * Gốc của wrap = điểm neo ở ĐÁY vật.
 */
export function makeItem(ctx, def) {
  const wrap = new THREE.Group();
  wrap.name = `xuong:${def.id}`;
  const mir = new THREE.Group(), rot = new THREE.Group();
  wrap.add(mir); mir.add(rot);
  const fit = FIT[def.id] || {};
  rot.rotation.y = fit.ry || 0;
  const params = defaultParams(def);
  let inst = null;
  try {
    inst = def.build(subCtx(ctx));
    if (!inst?.object?.isObject3D) inst = null;
  } catch (e) { inst = null; }
  let hidden = [];
  let note = '';
  if (inst) {
    rot.add(inst.object);
    try { inst.update?.(1 / 60, 0, params); } catch (e) { inst.update = null; }
    hidden = stripProps(inst.object, fit);
  }
  let box = visibleBox(rot, mir);
  const size = box.getSize(new THREE.Vector3());
  if (!inst || box.isEmpty() || Math.max(size.x, size.y, size.z) > 600) {
    // mô hình quá lớn (có cả phòng/bàn minh hoạ) hoặc lỗi → thay bằng khối đại diện
    note = inst ? 'Mô hình gốc có cả cảnh minh hoạ (> 600 mm) nên xưởng dùng khối đại diện.' : 'Không dựng được mô hình gốc — dùng khối đại diện.';
    if (inst) { rot.remove(inst.object); try { inst.dispose?.(); } catch { /* bỏ qua */ } }
    inst = null; hidden = [];
    const g = ctx.geom;
    const blk = g.mesh(g.box(110, 40, 80, 6), ctx.MAT.plasticGrey, { y: 20 });
    g.part(blk, `${def.icon || ''} ${def.name} (khối đại diện)`, note);
    rot.add(blk);
    box = visibleBox(rot, mir);
  }
  const ctr = box.getCenter(new THREE.Vector3());
  let anchor = [ctr.x, ctr.z];
  if (fit.anchor) {
    const a = new THREE.Vector3(fit.anchor[0], 0, fit.anchor[1]).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot.rotation.y);
    anchor = [a.x, a.z];
  }
  wrap.userData.xw = { def, inst, params, hidden, box, anchor, mir, rot, scale: 1, mirror: false, note, alive: true };
  layoutItem(wrap, 1, false);
  return wrap;
}

/** Đặt tỉ lệ/soi gương cho món đồ sao cho điểm neo nằm ở gốc wrap, đáy chạm y = 0 */
export function layoutItem(wrap, s, mirror) {
  const x = wrap.userData.xw;
  if (!x) return;
  x.scale = s; x.mirror = mirror;
  x.mir.scale.set(s, s, mirror ? -s : s);
  x.mir.position.set(-s * x.anchor[0], -s * x.box.min.y, (mirror ? s : -s) * x.anchor[1]);
}

/** Tỉ lệ thu nhỏ để vừa hộp `fit` của ô */
export function fitScale(wrap, fit) {
  const sz = wrap.userData.xw.box.getSize(new THREE.Vector3());
  return Math.min(1, fit[0] / Math.max(sz.x, 1), fit[1] / Math.max(sz.y, 1), fit[2] / Math.max(sz.z, 1));
}

/** Chạy update() của linh kiện con, cô lập lỗi; ẩn lại đạo cụ nếu update bật lên */
export function tickItem(wrap, dt, t) {
  const x = wrap.userData.xw;
  if (!x?.inst?.update) return;
  try { x.inst.update(dt, t, x.params); } catch (e) { x.inst.update = null; }
  for (const o of x.hidden) o.visible = false;
}

// ---------------------------------------------------------------------------------------------
// Ô lắp mờ (ghost)
// ---------------------------------------------------------------------------------------------
export function makeGhost(geom, slot) {
  const g = new THREE.Group();
  const [w, h, d] = slot.fit;
  let geo, y = h / 2;
  const sh = slot.ghost?.shape || 'box';
  if (sh === 'wheel') { geo = new THREE.CylinderGeometry(35, 35, 26, 32); geo.rotateX(Math.PI / 2); y = 35; }
  else if (sh === 'cyl') { const [r2, hh] = slot.ghost.size || [Math.min(w, d), h]; geo = new THREE.CylinderGeometry(r2 / 2, r2 / 2, hh, 32); y = hh / 2; }
  else if (sh === 'ring') { geo = new THREE.CylinderGeometry(180, 180, 58, 64, 1, true, -Math.PI * 0.3, Math.PI * 1.6); y = 40; }   // cung 290° ôm phía trước (+x)
  else geo = new THREE.BoxGeometry(w, h, d);
  const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x4cc2ff, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
  fill.position.y = y;
  fill.renderOrder = 2;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), new THREE.LineBasicMaterial({ color: 0x4cc2ff, transparent: true, opacity: 0.7, depthWrite: false }));
  edges.position.y = y;
  g.add(fill, edges);
  g.position.set(...slot.pos);
  g.rotation.y = slot.ry || 0;
  geom.part(g, `Ô lắp: ${slot.name}`, `Nhận: <b>${slot.acceptNames || slot.accepts.join(', ')}</b>. ${slot.why || ''} <i>(kéo linh kiện tới gần ~${slot.r} mm là tự bắt dính)</i>`);
  g.userData.fill = fill; g.userData.edges = edges;
  return g;
}

export function setGhost(ghost, color, fillOp, edgeOp) {
  const { fill, edges } = ghost.userData;
  for (const m of [fill.material, fill.userData._origMat].filter(Boolean)) { m.color.setHex(color); m.opacity = fillOp; }
  edges.material.color.setHex(color);
  edges.material.opacity = edgeOp;
}

// ---------------------------------------------------------------------------------------------
// Bàn làm việc, khung robot, khu chạy thử
// ---------------------------------------------------------------------------------------------
export function buildBench(ctx) {
  const { geom: g, MAT, label } = ctx;
  const grp = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x9a7350, roughness: 0.8, metalness: 0 });
  const top = g.mesh(g.box(BENCH.w, 40, BENCH.d, 4), wood, { y: -20 });
  g.part(top, 'Bàn làm việc 2.0 × 1.0 m', 'Kéo linh kiện từ <b>Thư viện</b> (góc trái) thả lên bàn, rồi kéo vào ô lắp trên khung robot. Bên trái: điện tử & nguồn · bên phải: cơ khí.');
  const matMat = new THREE.MeshStandardMaterial({ color: 0x2f6d55, roughness: 0.9 });
  const mat = g.mesh(g.box(760, 2, 560, 1), matMat, { y: 1 });
  g.part(mat, 'Thảm cắt / thảm chống tĩnh điện', 'Làm việc với bo mạch trên thảm ESD, đeo vòng tay nối đất — tĩnh điện vài kV đủ làm chết cổng MOSFET/ chân ESP32.');
  grp.add(top, mat);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) grp.add(g.mesh(g.box(60, BENCH.h - 40, 60), MAT.plasticDark, { x: sx * (BENCH.w / 2 - 60), y: -40 - (BENCH.h - 40) / 2, z: sz * (BENCH.d / 2 - 60) }));
  // giá kê dưới khung (chỉ đỡ vùng giữa, nơi không có bánh/chổi)
  const stand = g.mesh(g.box(100, STAND + 10 - 2, 70, 3), new THREE.MeshStandardMaterial({ color: 0xd8b26a, roughness: 0.85 }), { x: -20, y: 2 + (STAND + 8) / 2, z: 0 });
  g.part(stand, 'Giá kê robot', 'Kê đáy robot cao 45 mm: bánh, chổi không chạm bàn — lần đầu cấp điện mà firmware đảo chiều động cơ thì robot cũng không lao khỏi bàn.');
  grp.add(stand);
  // tua vít trang trí
  const sd = g.group(g.mesh(g.cyl(9, 9, 90, 16), MAT.plasticYellow, { rz: Math.PI / 2, y: 9 }), g.mesh(g.cyl(2.5, 2.5, 110, 12), MAT.steel, { rz: Math.PI / 2, x: 100, y: 9 }));
  sd.position.set(240, 0, -420);
  sd.rotation.y = 0.4;
  grp.add(g.part(sd, 'Tua vít PH1', 'Vít PT 3×12 vào cột nhựa: siết vừa tay (~0.4 N·m), quá lực là toét ren cột.'));
  label?.(grp, 'Bàn làm việc', [-760, 20, -480]);
  return { group: grp, surfaces: [top, mat] };
}

export function buildChassis(ctx) {
  const { geom: g, MAT, label } = ctx;
  const grp = new THREE.Group();
  const base = MAT.plasticDark.clone();
  const plate = g.mesh(g.cyl(175, 175, 3, 72), base, { y: PLATE - 1.5 });
  g.part(plate, 'Khung đáy robot Ø350 mm (cố định)', 'Khung ABS có sẵn cột vít, hốc bánh, khe chổi. Mọi module bắt vào đây — kéo linh kiện vào các <b>ô lắp mờ</b>.');
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x050607 });
  const holes = g.group(
    g.mesh(new THREE.BoxGeometry(62, 0.6, 196), holeMat, { x: 80, y: PLATE + 0.3 }),
    g.mesh(new THREE.BoxGeometry(84, 0.6, 32), holeMat, { x: 0, y: PLATE + 0.3, z: -117.5 }),
    g.mesh(new THREE.BoxGeometry(84, 0.6, 32), holeMat, { x: 0, y: PLATE + 0.3, z: 117.5 }),
  );
  g.part(holes, 'Hốc bánh & khe chổi', 'Lỗ xuyên đáy cho 2 bánh và chổi cuộn chạm sàn.');
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, roughness: 0.5 });
  const wall = g.mesh(new THREE.CylinderGeometry(175, 175, 44, 72, 1, true), wallMat, { y: PLATE + 22 });
  g.part(wall, 'Thành vỏ dưới (vẽ trong suốt)', 'Gờ bao quanh khung, có lỗ thông gió cho quạt và khe công tắc nguồn.');
  const deckMat = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, roughness: 0.1 });
  const deck = g.mesh(g.box(184, 3, 214, 3), deckMat, { x: -24, y: DECK - 1.5 });
  g.part(deck, 'Tầng mạch (tấm mica trong)', 'Tầng thứ 2 trên cột đồng M3: bo PIC, ESP32, driver, buck. Cách xa pin & động cơ, dễ đo đạc và thay thế.');
  const brass = MAT.brass;
  const posts = g.group(
    ...[[58, -100], [58, 100], [-108, -100], [-108, 100]].map(([x, z]) => g.mesh(g.cyl(3, 3, DECK - PLATE - 3, 10), brass, { x, y: (PLATE + DECK - 3) / 2, z })),
    ...[[-105, -32], [-105, 32], [-35, -32], [-35, 32]].map(([x, z]) => g.mesh(g.cyl(2.5, 2.5, TOPY - DECK, 10), brass, { x, y: (DECK + TOPY) / 2, z })),
  );
  g.part(posts, 'Cột đồng M3 (standoff)', 'Nâng bo mạch khỏi khung, cách điện với nhau; cột cao phía sau đỡ lidar cao hơn mọi thứ.');
  const pcbMat = MAT.pcbGreen;
  const picBoard = g.mesh(g.box(72, 1.6, 46, 0.5), pcbMat, { x: 25, y: DECK + 0.8, z: -35 });
  g.part(picBoard, 'Bo đục lỗ của PIC (đế cắm IC 40 chân)', 'Có sẵn thạch anh 20 MHz + 2 tụ 22 pF, trở 10 kΩ MCLR, tụ 100 nF sát VDD, header ICSP. Cắm PIC đúng chiều khuyết.');
  const hs = g.group(g.mesh(g.box(40, 2, 34, 1), MAT.aluminum, { x: -30, y: DECK + 1, z: -82 }), g.mesh(g.box(40, 2, 34, 1), MAT.aluminum, { x: -30, y: DECK + 1, z: 82 }));
  g.part(hs, 'Đế nhôm tản nhiệt cho driver', 'PowerPAD của DRV8871 dán keo tản nhiệt lên đế nhôm: 1.5 A × 1.5 A × 0.57 Ω ≈ 1.3 W mỗi driver.');
  const sw = g.group(g.mesh(g.box(10, 18, 20, 2), MAT.plasticBlack, {}), g.mesh(g.box(4, 8, 12, 1), MAT.plasticRed, { x: -5, y: 3, rz: 0.3 }));
  sw.position.set(...SWITCH_POS);
  sw.rotation.y = -Math.atan2(SWITCH_POS[2], -SWITCH_POS[0]);
  g.part(sw, 'Công tắc nguồn chính (gắn sẵn trên vỏ)', 'Đặt SAU cầu chì: pin → cầu chì 10 A → công tắc → thanh VBAT.');
  const front = g.mesh(new THREE.ConeGeometry(9, 22, 3), MAT.plasticYellow, { x: 160, y: PLATE + 2, rz: -Math.PI / 2 });
  g.part(front, 'Mũi tên: phía TRƯỚC robot (+x)', 'Robot đi về phía này: bánh xoay, chổi, cảm biến chống rơi, bumper đều ở nửa trước.');
  grp.add(plate, holes, wall, deck, posts, picBoard, hs, sw, front);
  label?.(grp, 'Phía trước ▶', [175, PLATE + 30, 0]);
  return { group: grp, surfaces: [plate, deck] };
}

export function airflowArrows(geom) {
  const g = new THREE.Group();
  const col = 0x7fd3ff;
  g.add(geom.arrow([75, 30, 0], [-92, 34, -20], col, 18), geom.arrow([-125, 40, 22], [-121, 40, 44], col, 9), geom.arrow([-118, 45, 92], [-138, 45, 150], col, 14));
  geom.part(g, 'Đường gió', 'Chổi cuộn → miệng hút → hộp bụi (rác lắng) → lưới lọc → HEPA → QUẠT → cửa xả. Quạt luôn ở "phía sạch".');
  return g;
}

export function buildArena(ctx) {
  const { geom: g, MAT, label } = ctx;
  const grp = new THREE.Group();
  grp.position.set(ARENA.cx, ARENA.cy, ARENA.cz);
  const { x0, x1, z0, z1, drop } = ARENA;
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xc8a679, roughness: 0.75 });
  const floor = g.mesh(g.box(x1 - x0, 6, z1 - z0), floorMat, { x: (x0 + x1) / 2, y: -3 });
  g.part(floor, 'Khu chạy thử 1.6 × 1.2 m', 'Robot va chạm-quay như firmware AUTO. Bên phải là mép bậc thang cao 150 mm để thử cảm biến chống rơi.');
  const low = g.mesh(g.box(300, 6, z1 - z0), new THREE.MeshStandardMaterial({ color: 0x8e7356, roughness: 0.8 }), { x: x1 + 150, y: -drop - 3 });
  const stepFace = g.mesh(g.box(4, drop, z1 - z0), MAT.plasticGrey, { x: x1 + 2, y: -drop / 2 });
  const edge = g.mesh(g.box(14, 1, z1 - z0), MAT.plasticYellow, { x: x1 - 7, y: 0.5 });
  g.part(g.group(low, stepFace, edge), 'Mép bậc thang (sâu 150 mm)', 'Cảm biến chống rơi phải thấy mép này TRƯỚC khi bánh xoay (cách tâm 125 mm) hụt chân.');
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.9 });
  const walls = g.group(
    g.mesh(g.box(20, 120, z1 - z0 + 40), wallMat, { x: x0 - 10, y: 60 }),
    g.mesh(g.box(x1 - x0, 120, 20), wallMat, { x: (x0 + x1) / 2, y: 60, z: z0 - 10 }),
    g.mesh(g.box(x1 - x0, 120, 20), wallMat, { x: (x0 + x1) / 2, y: 60, z: z1 + 10 }),
  );
  g.part(walls, 'Tường khu thử', 'Bumper chạm tường → lùi 60 mm → quay 100–170°.');
  const leg = g.mesh(g.cyl(20, 20, 420, 20), MAT.steel, { x: OBST.leg[0], y: 210, z: OBST.leg[1] });
  g.part(leg, 'Chân ghế Ø40', 'Vật cản mảnh: bumper chỉ bị đẩy một bên → công tắc trái HOẶC phải.');
  const boxM = g.mesh(g.box(OBST.box[2] * 2, 260, OBST.box[3] * 2, 4), new THREE.MeshStandardMaterial({ color: 0xb98a55, roughness: 0.9 }), { x: OBST.box[0], y: 130, z: OBST.box[1] });
  g.part(boxM, 'Thùng carton', 'Vật cản to, góc vuông.');
  grp.add(floor, walls, leg, boxM);
  // rác
  const n = 110;
  const pts = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  while (pts.length < n) {
    const x = x0 + 60 + rnd() * (x1 - x0 - 120), z = z0 + 60 + rnd() * (z1 - z0 - 120);
    if (Math.hypot(x - OBST.leg[0], z - OBST.leg[1]) < 40) continue;
    if (Math.abs(x - OBST.box[0]) < OBST.box[2] + 10 && Math.abs(z - OBST.box[1]) < OBST.box[3] + 10) continue;
    pts.push([x, z]);
  }
  const dust = new THREE.InstancedMesh(new THREE.BoxGeometry(7, 3, 7), new THREE.MeshStandardMaterial({ color: 0x5a5148, roughness: 1 }), n);
  const m4 = new THREE.Matrix4();
  pts.forEach(([x, z], i) => { m4.makeTranslation(x, 1.5, z); dust.setMatrixAt(i, m4); });
  dust.computeBoundingBox(); dust.computeBoundingSphere();
  g.part(dust, 'Rác giả (vụn giấy, cát)', 'Chỉ được gom khi có chổi cuộn + hộp bụi; quạt hút giúp gom rộng hơn.');
  grp.add(dust);
  label?.(grp, 'Khu chạy thử', [x0 + 80, 160, z0]);
  return { group: grp, dust, pts };
}

export const OBST = { leg: [150, -390], box: [-430, 340, 110, 110] };   // chân ghế (x, z), thùng (x, z, nửa rộng x, nửa rộng z)
