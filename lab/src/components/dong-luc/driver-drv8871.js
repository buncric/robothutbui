// 🔀 Driver cầu H DRV8871 (module kiểu Adafruit) — điều khiển bánh xe bằng 1 PWM + 1 DIR (sign-magnitude).
// Mô phỏng điện tử từng 0.25 µs trong vài chu kỳ PWM 20 kHz mỗi khung hình:
//   L·di/dt = V_cầu − i·(R + 2·Rds) − E,  E = Ke·ω  (động cơ bánh RS-360 giống bài "Động cơ DC")
//   V_cầu: +VM (tiến) · −VM (lùi) · 0 (phanh, 2 FET thấp dẫn) · ∓(VM + 2Vf) (thả trôi, dòng về nguồn qua diode thân)
//   Giới hạn dòng: |i| > I_TRIP = 64/R_ILIM(kΩ) → phanh 25 µs ; |i| > I_OCP → ngắt hết 3 ms rồi thử lại
//   Nhiệt: C·dTj/dt = P − (Tj − Ta)/RθJA,  P = I²rms·2·Rds(Tj)  ;  Tj > 175 °C → tắt (TSD), < 135 °C chạy lại
// Cơ: J·dω/dt = Ke·Ī − b·ω − τ_tải  (tích phân theo thời gian thực)
// 3 cách nối (docs/01): nối thẳng IN1 = PWM, IN2 = DIR (cũ) · qua 74HC32: IN1 = PWM OR nDIR, IN2 = PWM OR DIR (dự án) · L298N.
// Vòng PI tốc độ (firmware motor.c → pi_step, mỗi 20 ms): mục tiêu = sp·27/1000 xung ; duty‰ = sp + 15·e + I (I += 3·e, chặn ±600)
//   An toàn: |duty| > 300 ‰ mà encoder = 0 trong 15 chu kỳ (300 ms) → cờ WHEEL_STALL, về chạy hở vòng.

import { cadAttach } from '../../core/cadParts.js';

const R_M = 7.0, KE = 0.011, J = 2.0e-6, B = 1.2e-6, T_FRIC = 0.0012, L_M = 1.5e-3;
const RDS25 = 0.2825;          // Ω mỗi FET (HS + LS = 0.565 Ω theo datasheet)
const VF = 0.8;                // diode thân MOSFET
const T_PWM = 50e-6;           // 20 kHz
const NS = 200;                // bước con mỗi chu kỳ → h = 0.25 µs
const NPER = 4;                // số chu kỳ mô phỏng mỗi khung
const T_BLANK = 2e-6, T_OFF = 25e-6, I_OCP = 4.5, T_RETRY = 3e-3;
const TA = 40;                 // °C bên trong thân robot
const RTH = 65;                // °C/W — module nhỏ, ít đồng tản nhiệt
const CTH = 0.35;              // J/K
const TH_FAST = 5;             // tua nhanh nhiệt 5×
const SLOW = 60;               // vẽ đĩa trục quay chậm 60×
const ILIM_OPTS = { 30: 64 / 30, 47: 64 / 47, 20: 64 / 20 };
// L298N (BJT Darlington): sụt ~1.8 V + 1 Ω·I trên 2 transistor, không có giới hạn dòng, diode ngoài Vf ≈ 1 V, có tản nhiệt to
const L298_DROP = 1.8, L298_R = 1.0, L298_VF = 1.0, L298_RTH = 20;
// encoder + PI (config.h)
const CTRL_PERIOD = 0.02, MAX_TICKS = 27, KP = 15, KI = 3, I_MAX = 600, STALL_PERIODS = 15, STALL_DUTY = 300;
const K_TICK = MAX_TICKS / ((10390 / 60) * CTRL_PERIOD);   // xung / vòng trục động cơ sao cho 100 % (≈10 390 vòng/phút) = 27 xung/20 ms
const RAMP = 10000;            // ‰/s (RAMP_STEP = 10 ‰ mỗi ms)

// sơ đồ cầu H phóng to: toạ độ (x, y) trong nhóm hb
const P = {
  fwd: [[-22, 15], [-16, 15], [-16, 7.5], [-16, 0], [-6, 0], [6, 0], [16, 0], [16, -7.5], [16, -15], [22, -15]],
  rev: [[22, 15], [16, 15], [16, 7.5], [16, 0], [6, 0], [-6, 0], [-16, 0], [-16, -7.5], [-16, -15], [-22, -15]],
  brake: [[-16, 0], [-6, 0], [6, 0], [16, 0], [16, -7.5], [16, -15], [-16, -15], [-16, -7.5], [-16, 0]],
  hizP: [[-22, -15], [-16, -15], [-16, -7.5], [-16, 0], [-6, 0], [6, 0], [16, 0], [16, 7.5], [16, 15], [22, 15]],
  hizN: [[22, -15], [16, -15], [16, -7.5], [16, 0], [6, 0], [-6, 0], [-16, 0], [-16, 7.5], [-16, 15], [-22, 15]],
};
function prep(pts) {
  const L = [0];
  for (let k = 1; k < pts.length; k++) L.push(L[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  return { pts, L, tot: L[L.length - 1] };
}
const PATHS = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, prep(v)]));
function along(path, u, out) {
  const d = u * path.tot;
  let k = 1;
  while (k < path.L.length - 1 && path.L[k] < d) k++;
  const a = path.pts[k - 1], b = path.pts[k];
  const f = (d - path.L[k - 1]) / (path.L[k] - path.L[k - 1] || 1);
  out[0] = a[0] + (b[0] - a[0]) * f;
  out[1] = a[1] + (b[1] - a[1]) * f;
}

export default {
  id: 'driver-drv8871',
  name: 'Driver cầu H DRV8871',
  category: 'dong-luc',
  order: 3,
  icon: '🔀',
  summary: 'IC cầu H 4 MOSFET điều khiển 1 động cơ DC: tiến, lùi, phanh, thả trôi, chỉnh tốc bằng PWM. Chịu 6.5–45 V, 3.6 A đỉnh, có giới hạn dòng bằng 1 điện trở. Dự án dùng 2 con cho 2 bánh, mỗi bánh 1 PWM qua IC 74HC32 để "chạy–phanh" đối xứng 2 chiều, cộng vòng PI tốc độ theo encoder.',
  tags: ['H-bridge', 'cầu H', 'DRV8871', 'driver động cơ', 'sign-magnitude', 'PWM', 'IN1', 'IN2', 'phanh', 'brake', 'coast', '74HC32', 'PI', 'encoder', 'L298N'],

  params: [
    { id: 'cad', label: '🧊 Mô hình CAD thật (module DRV8871 kiểu Adafruit)', type: 'toggle', value: true, hint: 'Tắt = mô hình học tự dựng (bố cục đơn giản: domino nguồn bên trái, động cơ bên phải).' },
    { id: 'mode', label: 'Cách điều khiển IN1 / IN2', type: 'select', value: 'sm', options: [
      ['sm', 'Firmware dự án: motor_output() theo cách nối bên dưới'], ['fwd', 'IN1=1, IN2=0 → Tiến hết cỡ'], ['rev', 'IN1=0, IN2=1 → Lùi hết cỡ'],
      ['brake', 'IN1=1, IN2=1 → Phanh'], ['coast', 'IN1=0, IN2=0 → Thả trôi (ngủ)'],
    ] },
    { id: 'wiring', label: 'Cách nối PIC → driver', type: 'select', value: 'or', options: [['thang', 'Nối thẳng IN1=PWM, IN2=DIR (cũ)'], ['or', 'Qua 74HC32 — phanh 2 chiều (dự án dùng)'], ['l298n', 'L298N']] },
    { id: 'speed', label: 'Tốc độ đặt v (âm = lùi) — lệnh DRIVE ‰/10', type: 'range', min: -100, max: 100, step: 1, value: 70, unit: '%', hint: 'Chỉ dùng ở chế độ firmware. Duty thanh ghi do firmware tự tính theo cách nối.' },
    { id: 'ctrl', label: 'PI tốc độ theo encoder (lệnh CTRL)', type: 'toggle', value: false },
    { id: 'vm', label: 'Điện áp pin VM', type: 'range', min: 6.5, max: 16.8, step: 0.1, value: 14.4, unit: 'V' },
    { id: 'ilim', label: 'Điện trở R_ILIM (giới hạn dòng)', type: 'select', value: '30', options: [['30', '30 kΩ → 2.1 A (module Adafruit)'], ['47', '47 kΩ → 1.4 A'], ['20', '20 kΩ → 3.2 A']] },
    { id: 'load', label: 'Tải trên trục bánh', type: 'range', min: 0, max: 20, step: 0.5, value: 1, unit: 'mN·m' },
    { id: 'hb', label: 'Hiện sơ đồ cầu H bên trong', type: 'toggle', value: true },
    { id: 'stall', label: '✋ Giữ chặt bánh 1 giây', type: 'button' },
  ],
  readouts: [
    { id: 'pins', label: 'Chân vào lúc này', unit: '' },
    { id: 'reg', label: 'Duty ghi vào CCP (set_pwm1_duty)', unit: '/1000' },
    { id: 'vavg', label: 'Điện áp TB trên động cơ', unit: 'V' },
    { id: 'iavg', label: 'Dòng TB động cơ', unit: 'A' },
    { id: 'ipk', label: 'Dòng đỉnh trong chu kỳ', unit: 'A' },
    { id: 'rpm', label: 'Tốc độ động cơ', unit: 'vòng/phút' },
    { id: 'ploss', label: 'Tổn hao trong chip', unit: 'W' },
    { id: 'tj', label: 'Nhiệt độ chip Tj (tua nhanh 5×)', unit: '°C' },
    { id: 'pi', label: 'Encoder: đặt / đo (xung/20 ms) · duty PI', unit: '' },
    { id: 'flag', label: 'Cờ WHEEL_STALL', unit: '' },
    { id: 'state', label: 'Trạng thái', unit: '' },
  ],
  scope: {
    window: 3,
    note: '(IN1/IN2/V/I: PWM 20 kHz vẽ chậm 20 000× — 1 chu kỳ 50 µs = 1 giây; tốc độ encoder & duty PI: thời gian thực, cập nhật mỗi 20 ms. L298N: IN1/IN2 = tín hiệu hiệu dụng EN·IN)',
    channels: [
      { name: 'IN1 của cầu', unit: 'V', min: -0.5, max: 5.5, color: '#ff8c1a' },
      { name: 'IN2 của cầu', unit: 'V', min: -0.5, max: 5.5, color: '#3fcf8e' },
      { name: 'V động cơ OUT1−OUT2', unit: 'V', min: -24, max: 24, color: '#4cc2ff' },
      { name: 'Dòng động cơ', unit: 'A', min: -5, max: 5, color: '#ffd34d' },
      { name: 'Tốc độ ĐẶT', unit: 'xung/20ms', min: -30, max: 30, color: '#c9a3ff' },
      { name: 'Tốc độ ĐO (encoder)', unit: 'xung/20ms', min: -30, max: 30, color: '#ff6b9a' },
      { name: 'Duty PI chọn', unit: '‰', min: -1000, max: 1000, color: '#9ad0ff' },
    ],
  },

  info: {
    overview: `
      <p>Chân PIC chỉ cho ra ~20 mA ở 5 V, còn động cơ bánh cần tới 2 A ở 14.4 V và phải <b>quay được cả 2 chiều</b>. <b>Cầu H</b> (H-bridge) là 4 công tắc MOSFET xếp thành chữ H với động cơ ở giữa: đóng chéo cặp này → dòng chạy một chiều, đóng cặp kia → chiều ngược lại.</p>
      <p><b>DRV8871</b> (Texas Instruments) gói gọn cả cầu H, mạch kích cổng, giới hạn dòng, bảo vệ nhiệt vào một chip 8 chân. Chỉ cần 2 tín hiệu IN1, IN2.</p>
      <p>Thử: chọn cách nối <b>Nối thẳng (cũ)</b>, kéo <b>Tốc độ</b> +60 % rồi −60 % — số vòng/phút chênh nhau rất nhiều (tiến yếu hơn lùi). Đổi sang <b>Qua 74HC32</b>: hai chiều bằng nhau. Bật <b>PI tốc độ</b>: dù nối kiểu nào, tốc độ ĐO bám theo tốc độ ĐẶT trên máy hiện sóng. Cuối cùng bấm <b>Giữ chặt bánh</b> và chọn R_ILIM 47 kΩ để thấy mạch giới hạn dòng "băm" dòng điện.</p>`,
    specs: [
      ['Điện áp động cơ VM', '6.5–45 V (tuyệt đối tối đa 50 V)'],
      ['Dòng đỉnh', '3.6 A (giới hạn bởi R_ILIM: I_TRIP = 64 / R_ILIM[kΩ])'],
      ['Rds(on) HS + LS', '565 mΩ điển hình ở 25 °C (tăng ~60 % khi nóng 150 °C)'],
      ['Logic IN1/IN2', 'Mức 1 ≥ 1.5 V, mức 0 ≤ 0.5 V → nhận được cả 3.3 V và 5 V; trở kéo xuống 100 kΩ bên trong'],
      ['Tần số PWM', 'tới 200 kHz (dự án dùng 20 kHz — trên ngưỡng nghe)'],
      ['Bảo vệ', 'Giới hạn dòng (phanh 25 µs) · quá dòng OCP (ngắt 3 ms, tự thử lại) · quá nhiệt TSD 175 °C · thấp áp UVLO'],
      ['Ngủ', 'IN1 = IN2 = 0 quá 1 ms → ngủ, dòng chờ < 1 µA'],
      ['Vỏ', 'HSOP-8 PowerPAD 4.9 × 3.9 mm, tấm tản nhiệt ở đáy phải hàn xuống đồng PCB'],
      ['Module', '25.4 × 20.3 mm, R_ILIM = 30 kΩ → 2.1 A, domino 3.5 mm cho nguồn & động cơ'],
    ],
    principle: `
      <h4>1. Bảng chân lý</h4>
      <table><tr><th>IN1</th><th>IN2</th><th>OUT1</th><th>OUT2</th><th>Động cơ</th></tr>
      <tr><td>0</td><td>0</td><td>Z</td><td>Z</td><td>Thả trôi (coast) — dòng tắt nhanh qua diode thân về nguồn; > 1 ms thì ngủ</td></tr>
      <tr><td>1</td><td>0</td><td>H</td><td>L</td><td>Tiến (Q1 + Q4 dẫn)</td></tr>
      <tr><td>0</td><td>1</td><td>L</td><td>H</td><td>Lùi (Q2 + Q3 dẫn)</td></tr>
      <tr><td>1</td><td>1</td><td>L</td><td>L</td><td>Phanh (2 FET thấp dẫn, động cơ bị ngắn mạch → sức phản điện tự hãm)</td></tr></table>
      <h4>2. Chỉ có 1 PWM mỗi bánh — 3 cách nối</h4>
      <p>PIC chỉ có 2 PWM phần cứng (CCP1, CCP2) cho 2 bánh. Cách cũ: <b>IN1 = PWM, IN2 = DIR</b>:</p>
      <ul><li><b>DIR = 0</b>: PWM cao → tiến, PWM thấp → <i>thả trôi</i> (0,0). <code>duty = v</code>.</li>
      <li><b>DIR = 1</b>: PWM cao → <i>phanh</i> (1,1), PWM thấp → lùi. <code>duty = 1000 − v</code>.</li></ul>
      <p><b>Cách dự án dùng — qua IC 74HC32</b> (4 cổng OR, docs/01 mục "Điều khiển DRV8871 … qua IC 74HC32"): <code>IN1 = PWM OR nDIR</code>, <code>IN2 = PWM OR DIR</code>, với <code>nDIR = NOT DIR</code> do PIC xuất ở RD1/RD3.</p>
      <ul><li><b>Tiến</b> (DIR = 0, nDIR = 1): IN1 = 1, IN2 = PWM → PWM thấp: (1,0) chạy tiến · PWM cao: (1,1) phanh.</li>
      <li><b>Lùi</b> (DIR = 1, nDIR = 0): IN1 = PWM, IN2 = 1 → PWM thấp: (0,1) chạy lùi · PWM cao: (1,1) phanh.</li></ul>
      <p>Cả 2 chiều đều "chạy khi PWM thấp, phanh khi PWM cao" ⇒ <b>duty thanh ghi = 1000 − |tốc độ|</b>, đối xứng và gần tuyến tính. Tốc độ 0 → PWM luôn cao → phanh giữ bánh. <b>L298N</b>: EN = PWM, IN1/IN2 = chiều → cả 2 chiều đều thả trôi khi EN thấp (đối xứng nhưng yếu), sụt ~2 V, không có giới hạn dòng.</p>
      <h4>3. Điện áp trung bình & dòng điện</h4>
      <p>Động cơ có điện cảm L ≈ 1.5 mH: <code>L·di/dt = V − i·R − E</code>. Ở 20 kHz dòng chỉ gợn nhẹ quanh giá trị trung bình, điện áp trung bình ≈ <code>duty·VM</code> (khi tiến). Lúc thả trôi, dòng tắt rất nhanh vì phải "leo" ngược lên nguồn qua diode (fast decay); lúc phanh dòng tắt chậm (slow decay).</p>
      <h4>4. Lưu ý quan trọng: tiến và lùi KHÔNG đối xứng</h4>
      <p>Theo datasheet: <code>IN1 = PWM, IN2 = 0</code> là "tiến, <b>suy giảm nhanh</b> (fast decay)" — lúc PWM thấp cầu hở, dòng phải đẩy ngược lên nguồn qua diode nên tắt rất nhanh (điện áp ngược −(VM + 1.6 V)). Với động cơ có L/R ≈ 0.2 ms mà chu kỳ PWM chỉ 50 µs, dòng bị <b>gián đoạn</b> → tốc độ tiến tăng <b>không tuyến tính</b> theo duty (60 % duty có thể chỉ được ~10 % tốc độ khi có tải). Còn <code>IN1 = PWM, IN2 = 1</code> là "lùi, <b>suy giảm chậm</b> (slow decay)" — lúc phanh dòng vẫn tuần hoàn qua 2 FET thấp → tốc độ gần tỉ lệ với (1 − duty). Thử ở cách nối cũ: +60 % rồi −60 % và so số vòng/phút! Dự án sửa bằng <b>cả hai</b>: (1) 74HC32 để chiều tiến cũng dùng phanh (slow decay) như chiều lùi; (2) <b>vòng PI tốc độ</b>.</p>
      <h4>5. Vòng PI tốc độ theo encoder</h4>
      <p>Mỗi 20 ms PIC đếm xung encoder (Timer0/Timer1) và so với mục tiêu <code>sp × 27 / 1000</code> xung (27 xung/20 ms ở 100 %, <code>MAX_TICKS_PER_PERIOD</code>). Sai lệch <code>e = mục_tiêu − đo</code>:</p>
      <p><code>I = I + 3·e</code> (chặn ±600 ‰ — chống bão hòa tích phân), <code>duty‰ = sp + 15·e + I</code> (sp là phần "đoán trước" — feedforward). PI tự tăng duty khi tải nặng/pin yếu, nên ngay cả cách nối cũ thì tiến và lùi cũng chạy bằng nhau (bật PI để thấy). An toàn: nếu |duty| &gt; 300 ‰ mà encoder đứng im 15 chu kỳ (300 ms) → kẹt bánh hoặc encoder hỏng → bật cờ <code>WHEEL_STALL</code> và quay về chạy hở vòng, không bơm duty lên 100 %.</p>
      <h4>6. Giới hạn dòng & nhiệt</h4>
      <p>Dòng vượt <code>I_TRIP = 64/R_ILIM</code> → chip tự phanh 25 µs rồi đóng lại → dòng bị "băm" quanh I_TRIP. Tổn hao <code>P = I²·0.565 Ω</code>; nhiệt độ chip <code>Tj = Ta + P·RθJA</code>. Ví dụ kẹt bánh 1.9 A: P ≈ 2 W → module nhỏ RθJA ≈ 65 °C/W → Tj ≈ 170–200 °C → bảo vệ nhiệt TSD.</p>`,
    inRobot: `
      <ul>
        <li><b>2 module</b> + <b>1 IC 74HC32</b> dùng chung (bảng chân ở docs/01): bánh TRÁI — 74HC32 chân 1 &amp; 4 ← RC2/CCP1 (PIC chân 17), chân 2 ← RD1 (nDIR, chân 20), chân 5 ← RD0 (DIR, chân 19), chân 3 → DRV8871 trái IN1, chân 6 → IN2. Bánh PHẢI — chân 9 &amp; 12 ← RC1/CCP2 (chân 16), chân 10 ← RD3 (nDIR), chân 13 ← RD2 (DIR), chân 8 → IN1, chân 11 → IN2. Chân 14 = 5 V, chân 7 = GND, tụ 100 nF sát chân 14.</li>
        <li>VM nối VBAT sau cầu chì 10 A; <b>tụ 1000 µF/25 V</b> ngay đầu VM mỗi module; tụ 100 nF hàn ở 2 cực động cơ.</li>
        <li>Firmware: <code>config.h: MOTOR_DRIVER = DRIVER_DRV8871_OR</code> (mặc định); <code>motor.c → motor_output()</code>: <code>duty = 1000 − v; output_bit(PIN_DIR_L, rev); output_bit(PIN_NDIR_L, !rev);</code>. Vẫn đổi được về <code>DRIVER_DRV8871</code> (nối thẳng) hoặc <code>DRIVER_L298N</code> bằng 1 dòng. Timer2 <code>PR2 = 249</code> → 20 kHz, duty 0…1000.</li>
        <li>Vòng PI: <code>pi_step()</code> mỗi <code>SPEED_CTRL_PERIOD_MS = 20</code>; <code>PID_KP = 15</code>, <code>PID_KI = 3</code>, <code>PID_I_MAX = 600</code>, <code>STALL_PERIODS = 15</code>, <code>STALL_DUTY = 300</code>. Bật/tắt bằng lệnh <code>CTRL</code> (0x06) từ ESP32 — ngày 1 để tắt, ngày 2 bật sau khi đo <code>MAX_TICKS_PER_PERIOD</code>.</li>
        <li><code>ramp_toward()</code> tăng/giảm tối đa 10 ‰ mỗi ms → 0→100 % mất 100 ms, giảm dòng khởi động và tránh đảo chiều đột ngột.</li>
        <li><code>MOTOR_R_INVERT = 1</code> trong <code>config.h</code>: 2 động cơ lắp đối xứng gương nên bánh phải phải đảo dấu.</li>
        <li>Phương án thay thế: L298N (ENA/ENB = PWM, IN1–IN4 = RD0–RD3; sụt ~2 V, nóng hơn, không giới hạn dòng).</li>
      </ul>`,
    mistakes: `
      <ul>
        <li>Nối thẳng IN1 = PWM, IN2 = DIR rồi tưởng duty tiến 50 % = nửa tốc độ: chiều tiến (fast decay) yếu hơn lùi rất nhiều → xoay tại chỗ bị lệch. Dự án dùng 74HC32 + PI.</li>
        <li>74HC32 quên cấp nguồn chân 14 hoặc quên tụ 100 nF → đầu ra cổng OR lơ lửng/nhiễu.</li>
        <li>Quên xuất nDIR (RD1/RD3) hoặc nối nhầm DIR vào cả 2 cổng → một chiều chỉ phanh, không chạy.</li>
        <li>Bật PI khi chưa đo đúng <code>MAX_TICKS_PER_PERIOD</code> hoặc encoder chưa nối → PI bơm duty, robot giật mạnh rồi bị cờ WHEEL_STALL.</li>
        <li>Quên đảo duty khi lùi → lệnh "lùi chậm" thành "lùi nhanh" và ngược lại.</li>
        <li>Không nối GND chung giữa PIC và module → IN1/IN2 lơ lửng, động cơ giật cục (thử trong mục Sự cố).</li>
        <li>Thiếu tụ bulk 1000 µF → gai điện áp trên VM mỗi lần chuyển mạch, nhiễu làm reset vi điều khiển.</li>
        <li>Hàn module không có đồng tản nhiệt/không hàn PowerPAD → nóng, vào bảo vệ nhiệt khi kẹt bánh.</li>
        <li>Đảo chiều đột ngột ở tốc độ cao → dòng ≈ (VM + E)/R gần gấp đôi dòng kẹt → chạm giới hạn dòng.</li>
        <li>Đấu ngược nguồn → chip nổ (không có bảo vệ ngược cực).</li>
      </ul>`,
    quiz: [
      { q: 'Qua 74HC32, muốn bánh trái lùi 30 % thì PIC đặt RD0, RD1 và duty CCP1 thế nào? Tiến 30 % thì sao?', a: 'Lùi: RD0 (DIR) = 1, RD1 (nDIR) = 0 → IN1 = PWM, IN2 = 1; duty = 1000 − 300 = 700 ‰ (70 % phanh, 30 % chạy lùi). Tiến: RD0 = 0, RD1 = 1 → IN1 = 1, IN2 = PWM; duty vẫn = 700 ‰ — hai chiều đối xứng.' },
      { q: 'R_ILIM = 30 kΩ thì dòng giới hạn bao nhiêu? Muốn ~3.2 A thì dùng bao nhiêu?', a: 'I = 64/30 ≈ 2.13 A. Muốn 3.2 A: R = 64/3.2 = 20 kΩ.' },
      { q: 'Khác nhau giữa "phanh" (IN1=IN2=1) và "thả trôi" (IN1=IN2=0)?', a: 'Phanh: 2 FET thấp nối tắt 2 đầu động cơ → sức phản điện sinh dòng hãm, bánh dừng nhanh. Thả trôi: cầu hở mạch, bánh quay tự do theo quán tính, chip vào chế độ ngủ sau 1 ms.' },
    ],
  },

  steps: [
    { title: 'Bước 1 — Kiểm tra module', text: 'Đọc trị số điện trở R_ILIM (30 kΩ = "303" hoặc "3002") để biết dòng giới hạn. Nhìn chip DRV8871 có tấm PowerPAD hàn xuống đồng. Chuẩn bị: mỏ hàn 330 °C, thiếc 0.8 mm, đồng hồ vạn năng.' },
    { title: 'Bước 2 — Hàn header 4 chân', text: 'Cắm header vào breadboard để giữ thẳng, đặt module lên, hàn 1 chân trước → kiểm tra vuông góc → hàn 3 chân còn lại. Mỗi mối hàn 2–3 giây, hình nón bóng.' },
    { title: 'Bước 3 — Nguồn VM + tụ 1000 µF', text: 'Vặn dây đỏ vào VM(+), đen vào GND(−) của domino 3.5 mm (tua vít dẹt 2.5 mm, siết vừa tay). Hàn tụ 1000 µF/25 V sát domino: chân dài/không vạch vào +, vạch trắng (−) vào GND. Đo VM–GND không chập trước khi cấp điện.' },
    { title: 'Bước 4 — Động cơ OUT1/OUT2', text: 'Nối 2 dây động cơ vào domino OUT. Hàn tụ gốm 100 nF ngay 2 cực động cơ. Nếu bánh quay ngược mong muốn → đảo 2 dây hoặc sửa MOTOR_x_INVERT trong config.h (khỏi hàn lại).' },
    { title: 'Bước 5 — 74HC32 và dây tín hiệu từ PIC', text: 'NỐI GND TRƯỚC. Cắm 74HC32 (khấc về phía chân 1), chân 14 → 5 V, chân 7 → GND, tụ 100 nF sát chân 14–7. Bánh trái: chân 1 & 4 ← CCP1 (PIC chân 17), chân 2 ← RD1 (nDIR), chân 5 ← RD0 (DIR); chân 3 → IN1, chân 6 → IN2 của DRV8871. Đo bằng đồng hồ: RD0 và RD1 phải luôn ngược nhau. Dây tín hiệu đi kèm dây GND.' },
    { title: 'Bước 6 — Chạy thử an toàn', text: 'Kê robot cho bánh không chạm đất. Cấp nguồn qua cầu chì, bật BOOT_MOTOR_SELFTEST = 1 → tiến 1 s, lùi 1 s. Sờ chip sau 1 phút: ấm là bình thường, nóng không chạm được tay (> 60 °C) khi không tải → kiểm tra lại.' },
  ],

  faults: [
    { id: 'nguoc-nguon', label: 'Đấu ngược nguồn VM / GND', severity: 'no',
      what: '<p>Ngay khi chạm dây: chớp sáng, tiếng "bụp", chip DRV8871 nứt vỡ mặt, khói trắng, mùi khét. Tụ bulk (nếu cắm theo dây) cũng ngược cực, nóng và có thể phồng. Cầu chì 10 A đứt sau vài chục ms.</p>',
      why: '<p>DRV8871 KHÔNG có bảo vệ ngược cực. Khi GND cao hơn VM, diode thân của cả 4 MOSFET phân cực thuận → 2 nhánh diode nối tắt pin: <code>I ≈ (14.4 − 2·0.8) / (r_pin + r_dây) ≈ 13 / 0.15 ≈ 85 A</code>. Công suất vài trăm W dồn vào die 2 mm² → silicon nóng chảy, khí epoxy giãn nở làm nứt vỏ.</p>',
      fix: '<p>Đầu nối có khóa 1 chiều (XT30/XT60), dây đỏ/đen đúng màu, cầu chì ngay sau pin, P-MOSFET chống ngược ở đầu nguồn chung. Luôn đo cực tính bằng đồng hồ trước lần cấp điện đầu. Đã nổ: rút pin, chờ nguội, thay module, kiểm tra cầu chì.</p>' },
    { id: 'ket-banh', label: 'Kẹt bánh lâu ở 14.4 V (100 %)', severity: 'chay',
      what: '<p>Bánh đứng yên nhưng driver vẫn cấp điện: chip nóng dần lên &gt; 170 °C (sờ bỏng tay), rồi động cơ ngắt-chạy-ngắt từng đợt vài giây: đó là bảo vệ quá nhiệt (TSD). Cuộn dây động cơ cũng nóng.</p>',
      why: '<p>Kẹt: E = 0 → <code>I = 14.4 / (7 + 0.565) ≈ 1.9 A</code> liên tục. Tổn hao chip <code>P = I²·Rds ≈ 2 W</code>, mà Rds tăng theo nhiệt (+0.4 %/°C) → càng nóng càng tốn → <code>Tj = 40 + 3 W × 65 °C/W ≈ 230 °C</code> → TSD cắt ở 175 °C, nguội xuống 135 °C lại chạy. Lặp lâu → mối hàn PowerPAD lão hóa, động cơ cháy cuộn dây.</p>',
      fix: '<p>Firmware phát hiện kẹt: có PWM mà encoder không tăng trong 300–500 ms → dừng, lùi lại, báo lỗi. Hàn PowerPAD + nhiều đồng tản nhiệt; chọn R_ILIM vừa đủ (không để 3.2 A cho động cơ chỉ cần 2 A).</p>' },
    { id: 'chap-out', label: 'Chập 2 dây động cơ (OUT1 chạm OUT2)', severity: 'loi',
      what: '<p>Tia lửa nhỏ tại chỗ chập, tiếng "tạch tạch" đều đặn, động cơ không quay. Chip ấm nhưng KHÔNG chết.</p>',
      why: '<p>Điện trở chập ~0.05 Ω, điện cảm dây ~2 µH → dòng tăng <code>di/dt = VM/L ≈ 7 A/µs</code>, vượt ngưỡng quá dòng ~4.5 A trong &lt; 1 µs. Bảo vệ OCP ngắt cả 4 FET trong 3 ms rồi thử lại → mỗi lần thử là một tia lửa. Driver rẻ không có OCP (L298N cũ) sẽ cháy ngay.</p>',
      fix: '<p>Bọc co nhiệt mối hàn động cơ, dây đi gọn, có giữ dây. Khi thấy "tạch tạch": rút nguồn, đo điện trở OUT1–OUT2 (động cơ tốt ≈ 7 Ω, chập ≈ 0 Ω).</p>' },
    { id: 'thieu-tu', label: 'Không có tụ bulk 1000 µF (dây pin dài)', severity: 'loi',
      what: '<p>Lúc cắm pin: tia lửa nhỏ ở đầu nối, VM vọt lên gần gấp đôi. Khi chạy: gai điện áp ±5–7 V mỗi lần chuyển mạch, động cơ kêu rè, PIC/ESP32 thỉnh thoảng reset hoặc UART lỗi.</p>',
      why: '<p>Dây pin dài 1 m có điện cảm ~1 µH. Chỉ có tụ gốm 0.1 µF trên module → mạch LC dao động ở <code>f = 1/(2π√LC) ≈ 500 kHz</code>, biên độ <code>ΔV = I·√(L/C) ≈ 2 A × 3.2 Ω ≈ 6 V</code>. Lúc cắm nóng, LC đẩy VM lên tới ~2×VBAT = 29–34 V. Với tụ 1000 µF: √(L/C) ≈ 0.03 Ω → gai chỉ còn ~0.06 V.</p>',
      fix: '<p>Tụ điện phân ≥ 470–1000 µF, điện áp ≥ 25 V, hàn SÁT chân VM–GND của từng driver + tụ gốm 100 nF song song. Dây nguồn ngắn, xoắn đôi +/−.</p>' },
    { id: 'in2-ho', label: 'Đứt / quên nối dây IN2 (DIR)', severity: 'loi',
      what: '<p>Robot tiến bình thường, nhưng khi được lệnh LÙI (ví dụ thấy hố cầu thang) nó lại <b>chạy TIẾN</b>, chậm. Nguy hiểm: robot lao xuống cầu thang!</p>',
      why: '<p>Chân IN2 có trở kéo xuống 100 kΩ bên trong → hở dây thì IN2 = 0. <b>Nối thẳng</b>: lệnh lùi chậm 20 % đặt IN2 = 1 (không tới nơi) và duty = 1000 − 200 = 800 ‰ → chip hiểu là "tiến 80 %". <b>Qua 74HC32</b> còn tệ hơn: lùi thì IN1 = PWM, IN2 = 0 → tiến/thả trôi; tiến thì IN1 = 1, IN2 = 0 liên tục → <b>luôn tiến hết cỡ</b> bất kể duty.</p>',
      fix: '<p>Kiểm tra từng dây bằng đồng hồ (thông mạch); chạy self-test lúc khởi động; firmware so chiều encoder với chiều lệnh — encoder đếm sai chiều → dừng khẩn. Dùng đầu nối có khóa thay dây Dupont lỏng.</p>' },
    { id: 'quen-gnd', label: 'Quên nối GND chung PIC ↔ module', severity: 'loi',
      what: '<p>Động cơ giật cục ngẫu nhiên, lúc chạy lúc không, đổi chiều lung tung; chạm tay vào dây thì thay đổi.</p>',
      why: '<p>Điện áp IN1 = 5 V chỉ có nghĩa so với GND của PIC. Không chung GND → chip DRV8871 "thấy" IN1/IN2 so với GND của nó = một điện áp trôi nổi, nhiễm nhiễu từ dòng động cơ → mức logic ngẫu nhiên.</p>',
      fix: '<p>Luôn nối GND trước tiên, nối hình sao về cực âm pin (docs/01 quy tắc 1). Dây tín hiệu đi kèm dây GND.</p>' },
    { id: '74hc32-thieu-nguon', label: '74HC32 quên cấp 5 V (chân 14 hở)', severity: 'loi',
      what: '<p>Bánh giật cục, lúc chạy lúc phanh, đôi khi chạy đúng một lúc rồi loạn; chạm tay vào IC thì thay đổi. IC hơi ấm.</p>',
      why: '<p>CMOS không có nguồn vẫn "sống dở" nhờ dòng chạy từ chân vào (PWM, DIR 5 V) qua diode bảo vệ lên đường VCC bên trong (phantom powering). VCC nội trôi theo các đầu vào nên mức ra không xác định → IN1/IN2 của DRV8871 nhận mức logic ngẫu nhiên; dòng qua diode bảo vệ còn làm chân PIC và IC nóng.</p>',
      fix: '<p>Đo chân 14–7 phải là 5 V; tụ 100 nF sát chân 14. Chân vào của cổng thứ 4 nếu không dùng phải nối GND, không để hở.</p>' },
    { id: 'ndir-sai', label: 'nDIR không được đảo (RD1 luôn 0)', severity: 'loi',
      what: '<p>Lệnh LÙI chạy bình thường, nhưng lệnh TIẾN thì bánh chỉ "khựng" — phanh/thả trôi xen kẽ, không bao giờ quay tiến. Robot không đi thẳng được.</p>',
      why: '<p>Tiến cần DIR = 0, nDIR = 1 → IN1 = 1. Nếu RD1 quên đặt là đầu ra hoặc firmware quên <code>output_bit(PIN_NDIR_L, !rev)</code> → nDIR = 0 → IN1 = PWM, IN2 = PWM: chỉ có (0,0) thả trôi và (1,1) phanh, không có trạng thái (1,0) chạy tiến.</p>',
      fix: '<p>Kiểm tra <code>motor_init()</code> có <code>output_low(PIN_L298_L_B)</code> (đặt RD1 làm đầu ra) và <code>motor_output()</code> xuất nDIR. Đo bằng đồng hồ: RD0 và RD1 luôn ngược nhau.</p>' },
    { id: 'encoder-hong-pid', label: 'Encoder hỏng/tuột dây khi đang bật PI', severity: 'loi',
      what: '<p>Vừa ra lệnh chạy, bánh vọt lên gần hết tốc trong ~0.3 s (PI tưởng bánh đứng yên nên bơm duty), rồi trở lại tốc độ theo lệnh hở vòng; ESP32 nhận cờ <b>WHEEL_STALL</b>.</p>',
      why: '<p>Encoder đếm 0 xung → sai lệch <code>e = mục_tiêu</code> mỗi chu kỳ → tích phân tăng 3·e mỗi 20 ms tới trần 600 ‰, duty = sp + 15·e + I → 1000 ‰. Firmware thấy |duty| &gt; 300 ‰ mà encoder = 0 suốt 15 chu kỳ (300 ms) → bật <code>stall_flag</code>, xả tích phân, trả về duty = sp (hở vòng). Không có bảo vệ này, robot sẽ chạy 100 % mãi.</p>',
      fix: '<p>Kiểm tra dây encoder (RA4 cần trở kéo lên 10 kΩ), xem số xung trong bản tin STATUS; app hiển thị WHEEL_STALL để người dùng biết. Gửi lệnh dừng (sp = 0) để xóa cờ.</p>' },
  ],

  build(ctx) {
    const { THREE, MAT, geom, label, readout, fx } = ctx;
    const { mesh, group, part, cyl, box, pcb, pinHeader, smdChip, wire, dipPackage } = geom;
    const root = new THREE.Group();

    // ---------- module 25.4 × 20.3 mm ----------
    const W = 25.4, D = 20.3;
    const board = pcb(W, D, { mat: MAT.pcbBlack.clone() });
    part(board, 'Bo mạch module 25.4 × 20.3 mm', 'PCB 2 lớp. Mặt dưới chip có nhiều lỗ via dẫn nhiệt từ PowerPAD xuống lớp đồng đáy.');
    root.add(board);
    const chipG = new THREE.Group();
    chipG.position.set(-1, 0, -1.5);
    const chip = smdChip(4.9, 3.9, 1.5, MAT.icBody.clone());
    chip.position.y = 0.05;
    chipG.add(chip);
    for (let k = 0; k < 8; k++) {
      const x = -1.905 + (k % 4) * 1.27, z = k < 4 ? 2.45 : -2.45;
      chipG.add(mesh(box(0.42, 0.25, 1.0), MAT.tin, { x, y: 0.25, z }));
    }
    chipG.add(mesh(cyl(0.3, 0.3, 0.05, 12), MAT.plasticDark, { x: -1.8, y: 1.62, z: 1.2 }));
    root.add(part(chipG, 'IC DRV8871 (HSOP-8 PowerPAD)', 'Chân: 1 GND · 2 IN2 · 3 IN1 · 4 ILIM · 5 VM · 6 OUT1 · 7 PGND · 8 OUT2. Bên trong: 4 MOSFET cầu H + bơm điện tích kích FET phía cao + mạch bảo vệ.'));
    const rilim = smdChip(2.0, 1.25, 0.5, MAT.icBody);
    rilim.position.set(5, 0, -5.5);
    root.add(part(rilim, 'R_ILIM 30 kΩ (0805)', 'Đặt dòng giới hạn I_TRIP = 64 / 30 ≈ 2.1 A. Thay 20 kΩ → 3.2 A (không vượt 3.6 A đỉnh của chip).'));
    const cer = smdChip(2.0, 1.25, 1.0, MAT.plasticYellow.clone());
    cer.position.set(-6, 0, -6);
    root.add(part(cer, 'Tụ gốm 0.1 µF trên module', 'Chỉ lọc nhiễu tần số cao sát chip. KHÔNG thay được tụ bulk 1000 µF.'));

    // domino 3.5 mm
    function terminal(x, title, desc, flip) {
      const g = new THREE.Group();
      g.position.set(x, 0, -2);
      g.add(mesh(box(7, 8.5, 7.4, 0.4), MAT.plasticBlue.clone(), { y: 4.25 }));
      for (const z of [-1.75, 1.75]) {
        g.add(mesh(cyl(1.4, 1.4, 0.8, 16), MAT.zinc, { y: 8.7, z }));
        g.add(mesh(box(0.4, 0.3, 2.4), MAT.blackOxide, { y: 9.15, z }));
        g.add(mesh(box(0.6, 2.6, 2.6), MAT.blackOxide, { x: flip * 3.55, y: 3.2, z }));
      }
      return part(g, title, desc);
    }
    const termPwr = terminal(-W / 2 + 3.2, 'Domino nguồn VM(+) / GND(−)', 'Nối VBAT (sau cầu chì) — dòng tới 3.6 A, dùng dây ≥ 0.5 mm² (AWG20).', -1);
    const termMot = terminal(W / 2 - 3.2, 'Domino động cơ OUT1 / OUT2', 'Nối 2 cực động cơ bánh. Đảo 2 dây = đảo chiều quay.', 1);
    root.add(termPwr, termMot);
    const header = pinHeader(4);
    header.position.set(-3.81, 0, D / 2 - 1.6);
    part(header, 'Header 4 chân: IN1 · IN2 · VM · GND', 'Cắm breadboard hoặc dây Dupont. IN1/IN2 có trở kéo xuống 100 kΩ bên trong chip.');
    root.add(header);

    // tụ bulk 1000 µF ngoài module
    const bulk = new THREE.Group();
    bulk.position.set(-22, 0, 8);
    bulk.add(mesh(cyl(5, 5, 20, 32), MAT.plasticBlack.clone(), { y: 10 }));
    bulk.add(mesh(box(1.5, 18, 3.5), MAT.plasticGrey, { x: -4.3, y: 10, ry: 0.0 }));
    bulk.add(mesh(cyl(4.6, 4.6, 0.3, 32), MAT.aluminum, { y: 20.1 }));
    root.add(part(bulk, 'Tụ bulk 1000 µF / 25 V (bạn tự hàn thêm)', 'Kho điện tích sát driver: cấp dòng xung PWM, hấp thụ năng lượng động cơ trả về khi phanh/thả trôi. Vạch xám = cực âm.'));

    // dây nguồn
    const pwrWires = group(
      wire([[-W / 2 - 0.5, 3.2, -3.75], [-20, 3, -4], [-34, 2, -6], [-46, 1.5, -8]], { radius: 0.8, color: 0xd23b3b }),
      wire([[-W / 2 - 0.5, 3.2, -0.25], [-20, 3, 1], [-34, 2, 3], [-46, 1.5, 4]], { radius: 0.8, color: 0x1d1f23 }),
      wire([[-22, 0.5, 6.5], [-20, 2.5, 0], [-16, 3, -3.75]], { radius: 0.35, color: 0xcfd5db }),
      wire([[-22, 0.5, 9.5], [-18, 2.5, 4], [-16, 3, -0.25]], { radius: 0.35, color: 0xcfd5db }),
    );
    root.add(part(pwrWires, 'Dây nguồn từ pin (đỏ +, đen −)', 'Từ VBAT sau cầu chì 10 A và công tắc chính. Dây càng dài càng cần tụ bulk.'));

    // động cơ + đĩa trục
    const motor = new THREE.Group();
    motor.position.set(46, 14, -2);
    const can = mesh(cyl(14, 14, 30, 48), MAT.steel, { rz: Math.PI / 2 });
    const cap = mesh(cyl(14, 14, 5, 48), MAT.plasticWhite, { x: -17.5, rz: Math.PI / 2 });
    motor.add(part(group(can, cap), 'Động cơ bánh RS-360 (R = 7 Ω)', 'Giống bài "Động cơ DC": dòng kẹt ≈ 2 A ở 14.4 V, L ≈ 1.5 mH.'));
    const snub = mesh(cyl(2.4, 2.4, 1.6, 20), MAT.plasticYellow, { x: -21, y: 6, rz: Math.PI / 2 });
    motor.add(part(snub, 'Tụ 100 nF ở cực động cơ', 'Dập tia lửa chổi than — nhiễu tần số cao không chạy ngược về driver/PIC.'));
    const disc = new THREE.Group();
    disc.position.x = 17;
    disc.add(mesh(cyl(1, 1, 4, 12), MAT.steel, { x: 1, rz: Math.PI / 2 }));
    const half1 = mesh(geom.arcSector(0, 10, 0, Math.PI, 2, 24), MAT.plasticYellow, { x: 4, rz: Math.PI / 2 });
    const half2 = mesh(geom.arcSector(0, 10, Math.PI, Math.PI * 2, 2, 24), MAT.plasticDark, { x: 4, rz: Math.PI / 2 });
    disc.add(half1, half2);
    motor.add(part(disc, 'Đĩa đánh dấu trên trục', 'Nhìn chiều quay: tiến = quay một chiều, lùi = chiều ngược lại (vẽ chậm 60×).'));
    root.add(motor);
    const motWires = group(
      wire([[W / 2 + 0.5, 3.2, -3.75], [20, 5, -4], [26, 12, -4.5], [28, 14, -4]], { radius: 0.6, color: 0xd23b3b }),
      wire([[W / 2 + 0.5, 3.2, -0.25], [20, 5, 0.5], [26, 12, 0.5], [28, 14, 0]], { radius: 0.6, color: 0x1d1f23 }),
    );
    root.add(part(motWires, 'Dây động cơ (OUT1, OUT2)', 'Dòng xung PWM chạy trên đôi dây này — xoắn đôi để giảm nhiễu bức xạ.'));

    // dây logic từ PIC
    const logic = group(
      wire([[-3.81, 8.6, D / 2 - 1.6], [-4, 10, 16], [-6, 4, 30], [-8, 1, 40]], { radius: 0.45, color: 0xf2c14e }),
      wire([[-1.27, 8.6, D / 2 - 1.6], [-1.5, 10, 16], [-2, 4, 30], [-2.5, 1, 40]], { radius: 0.45, color: 0x3fcf8e }),
      wire([[3.81, 8.6, D / 2 - 1.6], [4, 10, 16], [5, 4, 30], [6, 1, 40]], { radius: 0.45, color: 0x1d1f23 }),
    );
    root.add(part(logic, 'Dây tín hiệu IN1 (vàng) · IN2 (xanh) · GND (đen)', 'Qua 74HC32 (dự án): IN1 ← chân 3 (1Y), IN2 ← chân 6 (2Y). Nối thẳng (cũ): IN1 ← RC2/CCP1 (PIC chân 17), IN2 ← RD0 (chân 19).'));

    // ---------- IC 74HC32 (DIP-14) trên bo đục lỗ ----------
    const icBoard = new THREE.Group();
    icBoard.position.set(-1, 0, 42);
    root.add(icBoard);
    icBoard.add(part(pcb(26, 22, { mat: MAT.pcbGreen.clone() }), 'Bo đục lỗ chứa 74HC32', 'Đặt trên bo chính cạnh PIC; 1 IC dùng chung cho cả 2 bánh (4 cổng OR).'));
    const or14 = dipPackage(14);
    icBoard.add(or14.group);
    part(or14.body, 'IC 74HC32 — 4 cổng OR 2 đầu vào (CMOS, 5 V)', 'Y = A OR B: chỉ cần 1 đầu vào = 1 thì đầu ra = 1. Trễ ~10 ns ≪ chu kỳ PWM 50 µs. Khấc tròn = phía chân 1.');
    const PIN74 = ['1A ← PWM trái (CCP1, PIC chân 17)', '1B ← nDIR trái (RD1, PIC chân 20)', '1Y → IN1 DRV8871 trái', '2A ← PWM trái (CCP1)', '2B ← DIR trái (RD0, PIC chân 19)', '2Y → IN2 DRV8871 trái', 'GND',
      '3Y → IN1 DRV8871 phải', '3A ← PWM phải (CCP2, PIC chân 16)', '3B ← nDIR phải (RD3, PIC chân 22)', '4Y → IN2 DRV8871 phải', '4A ← PWM phải (CCP2)', '4B ← DIR phải (RD2, PIC chân 21)', 'VCC +5 V (tụ 100 nF sát chân)'];
    const pin74Mat = {};
    or14.pins.forEach((pg, k) => {
      part(pg, `74HC32 chân ${k + 1} — ${PIN74[k]}`, k === 13 ? 'Thiếu nguồn ở chân này → IC "sống dở" nhờ dòng rò từ chân vào → đầu ra ngẫu nhiên.' : 'Theo bảng nối trong docs/01.');
      if ([0, 1, 2, 4, 5].includes(k)) { const m = MAT.tin.clone(); pg.traverse((o) => { if (o.isMesh) o.material = m; }); pin74Mat[k] = m; }
    });
    const icCap = mesh(new THREE.SphereGeometry(1.6, 16, 10), new THREE.MeshStandardMaterial({ color: 0x3b6fd6, roughness: 0.4 }), { x: 11, y: 2.2, z: -6 });
    icCap.scale.set(1, 1.1, 0.55);
    icBoard.add(part(icCap, 'Tụ 100 nF cho 74HC32', 'Sát chân 14 (VCC) – 7 (GND).'));
    icBoard.add(part(group(
      wire([[-7.6, 1, 7.6], [-8, 3, 14], [-9, 1, 22]], { radius: 0.4, color: 0xff8c1a }),
      wire([[-5.1, 1, 7.6], [-5.3, 3, 14], [-5.5, 1, 22]], { radius: 0.4, color: 0x1fc7c7 }),
      wire([[0, 1, 7.6], [0, 3, 14], [0, 1, 22]], { radius: 0.4, color: 0x3fcf8e }),
    ), 'Dây từ PIC: PWM (cam, CCP1) · nDIR (xanh ngọc, RD1) · DIR (xanh lá, RD0)', 'nDIR luôn = NOT DIR — firmware xuất cả 2 chân.'));

    // ---------- sơ đồ cầu H phóng to ----------
    const hb = new THREE.Group();
    hb.position.set(0, 40, -14);
    root.add(hb);
    const panel = mesh(box(52, 40, 0.4), new THREE.MeshStandardMaterial({ color: 0x0d1720, transparent: true, opacity: 0.55, roughness: 1 }), { z: -1.5 });
    panel.castShadow = false;
    hb.add(part(panel, 'Sơ đồ cầu H bên trong DRV8871 (phóng to)', 'Q1, Q2 phía cao (nối VM); Q3, Q4 phía thấp (nối GND). Động cơ ở giữa nối OUT1–OUT2. Hạt vàng = dòng điện đang chạy; FET xanh = đang dẫn; FET cam = chỉ diode thân đang dẫn.'));
    hb.add(part(mesh(box(48, 1.2, 1.2), MAT.copper.clone(), { y: 15 }), 'Thanh VM (+14.4 V)', 'Nguồn động cơ.'));
    hb.add(part(mesh(box(48, 1.2, 1.2), MAT.plasticDark, { y: -15 }), 'Thanh GND', 'Mass chung.'));
    for (const x of [-16, 16]) hb.add(mesh(box(0.8, 30, 0.8), MAT.copper, { x }));
    hb.add(mesh(box(20, 0.8, 0.8), MAT.copper, { y: 0 }));
    const FETS = [
      ['Q1 — FET phía cao trái (HS1)', 'Dẫn khi tiến (IN1=1, IN2=0). Cần cổng cao hơn VM ~10 V → chip có bơm điện tích (charge pump).', -16, 7.5],
      ['Q2 — FET phía cao phải (HS2)', 'Dẫn khi lùi (IN1=0, IN2=1).', 16, 7.5],
      ['Q3 — FET phía thấp trái (LS1)', 'Dẫn khi lùi và khi phanh.', -16, -7.5],
      ['Q4 — FET phía thấp phải (LS2)', 'Dẫn khi tiến và khi phanh.', 16, -7.5],
    ];
    const fetMeshes = FETS.map(([n, d, x, y]) => {
      const m = mesh(box(7, 5, 2.4, 0.4), new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.5 }), { x, y });
      hb.add(part(m, n, d + ' Mỗi FET có 1 diode thân (body diode) song song ngược — đường thoát cho dòng điện cảm khi cầu hở.'));
      return m;
    });
    const hbMotor = mesh(cyl(4, 4, 10, 24), MAT.steel.clone(), { rz: Math.PI / 2 });
    hb.add(part(hbMotor, 'Động cơ (giữa OUT1 và OUT2)', 'Dòng chạy OUT1 → OUT2 = tiến (hạt đi sang phải), ngược lại = lùi.'));
    for (const x of [-16, 16]) hb.add(mesh(new THREE.SphereGeometry(1.3, 12, 8), MAT.tin, { x }));
    label(hb, 'Cầu H bên trong (phóng to)', [0, 21, 0]);
    const NPAR = 18;
    const parMat = new THREE.MeshBasicMaterial({ color: 0xffd34d });
    const parGeo = new THREE.SphereGeometry(0.9, 8, 6);
    const pars = [];
    for (let k = 0; k < NPAR; k++) { const m = new THREE.Mesh(parGeo, parMat); m.raycast = () => {}; m.position.z = 1.6; hb.add(m); pars.push(m); }
    // 2 cổng OR phóng to (chỉ hiện khi nối qua 74HC32)
    const orG = new THREE.Group();
    orG.position.set(-42, 0, 0);
    hb.add(orG);
    const panel2 = mesh(box(28, 40, 0.4), panel.material, { z: -1.5 });
    panel2.castShadow = false;
    orG.add(part(panel2, '74HC32 — 2 cổng OR của 1 bánh (phóng to)', 'Cổng sáng xanh = đầu ra 1. Dây vào sáng cam = mức 1. Tiến: nDIR = 1 giữ IN1 = 1, IN2 = PWM. Lùi: DIR = 1 giữ IN2 = 1, IN1 = PWM.'));
    const glowMat = () => new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.5 });
    const gate1 = mesh(box(7, 6, 2.4, 1.2), glowMat(), { x: 2, y: 7.5 });
    const gate2 = mesh(box(7, 6, 2.4, 1.2), glowMat(), { x: 2, y: -7.5 });
    orG.add(part(gate1, 'Cổng OR 1: IN1 = PWM OR nDIR (chân 1, 2 → 3)', 'Tiến: nDIR = 1 → IN1 luôn 1. Lùi: nDIR = 0 → IN1 = PWM.'));
    orG.add(part(gate2, 'Cổng OR 2: IN2 = PWM OR DIR (chân 4, 5 → 6)', 'Tiến: DIR = 0 → IN2 = PWM. Lùi: DIR = 1 → IN2 luôn 1.'));
    const stub = (y, x0, x1) => mesh(box(Math.abs(x1 - x0), 0.7, 0.7), glowMat(), { x: (x0 + x1) / 2, y });
    const sPwm1 = stub(9, -12, -1.5), sNdir = stub(6, -12, -1.5), sPwm2 = stub(-6, -12, -1.5), sDir = stub(-9, -12, -1.5);
    const sOut1 = stub(7.5, 5.5, 14), sOut2 = stub(-7.5, 5.5, 14);
    orG.add(part(group(sPwm1, sPwm2), 'Đầu vào PWM (CCP1) — vào cả 2 cổng', 'Cùng 1 tín hiệu PWM đi vào chân 1 và 4.'));
    orG.add(part(sNdir, 'Đầu vào nDIR (RD1)', 'Luôn ngược với DIR.'), part(sDir, 'Đầu vào DIR (RD0)', '0 = tiến, 1 = lùi.'));
    orG.add(part(group(sOut1, sOut2), 'Đầu ra → IN1 / IN2 của DRV8871', 'Hai đầu ra này chính là kênh IN1, IN2 trên máy hiện sóng.'));
    label(orG, '74HC32: 2 cổng OR', [0, 21, 0]);
    const setGlow = (m, on, g = false) => { const c = m.material; if (on) { c.color.setRGB(g ? 0.15 : 0.95, g ? 0.75 : 0.55, g ? 0.35 : 0.1); c.emissive.setRGB(g ? 0.05 : 0.6, g ? 0.6 : 0.3, g ? 0.2 : 0); } else { c.color.setRGB(0.23, 0.25, 0.28); c.emissive.setRGB(0, 0, 0); } c.emissiveIntensity = 1; };

    const lbChip = label(root, 'DRV8871', [-1, 4, -1.5]);
    const lbPwr = label(root, 'VM / GND (từ pin)', [-W / 2 - 4, 12, -2]);
    const lbMot = label(root, 'OUT1 / OUT2 → động cơ', [W / 2 + 6, 12, -2]);
    const LB_PROC = [[-1, 4, -1.5], [-W / 2 - 4, 12, -2], [W / 2 + 6, 12, -2]];
    let LB_CAD = null;

    // ---------- mô hình CAD thật: module DRV8871 kiểu Adafruit (20,3 × 24,1 mm) ----------
    // Khung GLB: 2 domino (MOTOR, POWER) cùng nằm ở mép −z, header JP2 ở mép +z hàn chĩa XUỐNG (cắm breadboard).
    // Xoay 180° quanh Y → domino ra phía trước (+z, quay về camera): POWER bên trái (gần dây pin), MOTOR bên phải
    // (gần động cơ); header ra phía sau. onBottom: chân header chạm "mặt bàn" như module cắm trên breadboard.
    // Dây nguồn / động cơ / tín hiệu được đi lại theo vị trí thật của domino & header (bộ dây riêng cho CAD).
    const pwrWiresCad = new THREE.Group(), motWiresCad = new THREE.Group(), logicCad = new THREE.Group();
    pwrWiresCad.visible = motWiresCad.visible = logicCad.visible = false;
    root.add(part(pwrWiresCad, 'Dây nguồn từ pin (đỏ +, đen −)', 'Vặn vào domino POWER của module. Từ VBAT sau cầu chì 10 A và công tắc chính. Dây càng dài càng cần tụ bulk.'));
    root.add(part(motWiresCad, 'Dây động cơ (OUT1, OUT2)', 'Vặn vào domino MOTOR. Dòng xung PWM chạy trên đôi dây này — xoắn đôi để giảm nhiễu bức xạ.'));
    root.add(part(logicCad, 'Dây tín hiệu IN1 (vàng) · IN2 (xanh) · GND (đen)', 'Cắm vào header JP2 dưới module. Qua 74HC32 (dự án): IN1 ← chân 3 (1Y), IN2 ← chân 6 (2Y). Nối thẳng (cũ): IN1 ← RC2/CCP1 (PIC chân 17), IN2 ← RD0 (chân 19).'));
    let cadU1 = null, cadU1Pop = null, cadPcb = null, cadHdr = null, cadScrewsP = [], cadScrewsM = [];
    const cad = cadAttach(ctx, root, 'boards/drv8871-breakout', {
      rotateY: Math.PI,
      hide: [board, chipG, rilim, cer],
      partDefault: ['Module DRV8871 (CAD thật, kiểu Adafruit)', 'Bo 20,3 × 24,1 mm: IC DRV8871 + tụ + R_ILIM + 2 domino 3,5 mm + header 4 chân.'],
      parts: {
        pcb: ['Bo mạch module (PCB 2 lớp, 1,6 mm)', 'Mặt dưới chip có nhiều lỗ via dẫn nhiệt từ PowerPAD xuống lớp đồng đáy — đồng chính là "tản nhiệt" của module.'],
        silkscreen: ['Chữ in lụa trên bo', 'Ghi tên chân: VM, GND, OUT1, OUT2, IN1, IN2 — luôn đọc chữ in lụa trước khi đấu dây.'],
        U1_DRV8871: ['IC DRV8871 (HSOP-8 PowerPAD)', 'Chân: 1 GND · 2 IN2 · 3 IN1 · 4 ILIM · 5 VM · 6 OUT1 · 7 PGND · 8 OUT2. Bên trong: 4 MOSFET cầu H + bơm điện tích kích FET phía cao + mạch bảo vệ (quá dòng, quá nhiệt, thấp áp).'],
        U1_marking: ['IC DRV8871 (HSOP-8 PowerPAD)', 'Chấm tròn = chân 1. Tấm PowerPAD dưới bụng hàn xuống đồng để tản nhiệt.'],
        C1_100nF: ['Tụ gốm 0,1 µF (C1) trên module', 'Chỉ lọc nhiễu tần số cao sát chip. KHÔNG thay được tụ bulk 1000 µF.'],
        C2_22uF: ['Tụ hóa 22 µF (C2) trên module', 'Kho điện tích nhỏ sát chân VM. Với dây pin dài và dòng xung 2 A vẫn chưa đủ → bạn phải hàn thêm tụ 1000 µF.'],
        R1_ILIM_30k: ['R_ILIM 30 kΩ (R1)', 'Đặt dòng giới hạn I_TRIP = 64 / 30 ≈ 2,1 A. Thay 20 kΩ → 3,2 A (không vượt 3,6 A đỉnh của chip).'],
        terminal_POWER: ['Domino nguồn VM(+) / GND(−)', 'Nối VBAT (sau cầu chì) — dòng tới 3,6 A, dùng dây ≥ 0,5 mm² (AWG20). Tua vít dẹt 2,5 mm, siết vừa tay.'],
        terminal_MOTOR: ['Domino động cơ OUT1 / OUT2', 'Nối 2 cực động cơ bánh. Đảo 2 dây = đảo chiều quay.'],
        'screw_POWER_*': ['Vít kẹp dây domino nguồn', 'Vặn ngược chiều kim đồng hồ để mở kẹp, luồn dây (tuốt 5 mm), vặn chặt rồi giật nhẹ thử.'],
        'screw_MOTOR_*': ['Vít kẹp dây domino động cơ', 'Vặn ngược chiều kim đồng hồ để mở kẹp, luồn dây, vặn chặt rồi giật nhẹ thử.'],
        header_JP2: ['Header 4 chân JP2: IN1 · IN2 · VM · GND', 'Hàn chĩa xuống để cắm breadboard hoặc bo chính. IN1/IN2 có trở kéo xuống 100 kΩ bên trong chip.'],
        pin_JP2_1: ['Chân IN1', 'Từ 74HC32 chân 3 (1Y) — hoặc nối thẳng CCP1 (PIC chân 17).'],
        pin_JP2_2: ['Chân IN2', 'Từ 74HC32 chân 6 (2Y) — hoặc nối thẳng RD0 (PIC chân 19).'],
        pin_JP2_3: ['Chân VM', 'Nối thông với domino VM — có thể lấy nguồn pin qua đây (dòng nhỏ).'],
        pin_JP2_4: ['Chân GND', 'PHẢI nối chung GND với PIC, không thì tín hiệu IN1/IN2 không có mốc.'],
        'pads_*': ['Pad hàn mạ thiếc', 'Lỗ xuyên mạ đồng để hàn chân header / domino / lỗ bắt vít.'],
      },
      onLoad(c) {
        const box3 = (n) => { const b = new THREE.Box3().setFromObject(n); return [c.holder.worldToLocal(b.min.clone()), c.holder.worldToLocal(b.max.clone())]; };
        const lo = (a, b) => [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)];
        const hi = (a, b) => [Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)];
        cadPcb = c.node('pcb');
        // U1 + chữ in trên chip → nhóm trung gian đơn vị mm (fx.pop bay đúng tỉ lệ, xoay quanh tâm chip)
        const u1 = c.node('U1_DRV8871'), mk = c.node('U1_marking');
        if (u1) {
          cadU1 = u1;
          const g = new THREE.Group();
          g.position.copy(c.worldOf(u1));
          c.holder.add(g);
          g.updateMatrixWorld(true);
          g.attach(u1);
          if (mk) g.attach(mk);
          cadU1Pop = g;
        }
        // header trượt lên từ dưới (bước hàn header); vít domino: xoay + nâng/hạ (bước vặn dây)
        cadHdr = c.slide('header_JP2', [0, 1, 0]);
        const screw = (n) => { const pv = c.pivot(n, { axis: [0, 1, 0] }); return pv && { spin: pv, lift: c.slide(pv.pivot, [0, 1, 0]) }; };
        cadScrewsP = ['screw_POWER_1', 'screw_POWER_2'].map(screw).filter(Boolean);
        cadScrewsM = ['screw_MOTOR_1', 'screw_MOTOR_2'].map(screw).filter(Boolean);
        // ---- đi dây theo vị trí thật (toạ độ holder = toạ độ root) ----
        const tp = c.node('terminal_POWER'), tm = c.node('terminal_MOTOR');
        const entry = (t, k) => {           // miệng luồn dây phía trước domino (+z), ngang tâm kẹp k
          const cl = c.node(`${t.name}_clamps`)?.children[k] || t;
          const [a, b] = box3(cl), [A, B] = box3(t);
          const p0 = lo(a, b), p1 = hi(a, b), P1 = hi(A, B);
          return [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, P1[2] + 0.2];
        };
        if (tp) {
          const [e0, e1] = [entry(tp, 0), entry(tp, 1)].sort((u, v) => u[0] - v[0]);   // trái = VM(+), phải = GND(−)
          pwrWiresCad.add(
            wire([e0, [e0[0], e0[1], e0[2] + 4], [-20, 4, 16], [-34, 2, 10], [-46, 1.5, 4]], { radius: 0.8, color: 0xd23b3b }),
            wire([e1, [e1[0], e1[1] - 0.5, e1[2] + 6], [-18, 3, 20], [-34, 2, 16], [-46, 1.5, 12]], { radius: 0.8, color: 0x1d1f23 }),
            // chân tụ bulk (+ ở z = 5,5; − ở z = 10,5 sau khi xoay tụ) → domino
            wire([[-22, 0.5, 5.5], [-16, 2, 6], [e0[0] - 2, e0[1] - 1, e0[2] + 2], [e0[0], e0[1] - 0.6, e0[2] + 0.4]], { radius: 0.35, color: 0xcfd5db }),
            wire([[-22, 0.5, 10.5], [-14, 2, 13], [e1[0] - 1, e1[1] - 1.5, e1[2] + 3], [e1[0], e1[1] - 0.6, e1[2] + 0.4]], { radius: 0.35, color: 0xcfd5db }),
          );
        }
        if (tm) {
          const [e0, e1] = [entry(tm, 0), entry(tm, 1)].sort((u, v) => u[0] - v[0]);
          motWiresCad.add(
            wire([e0, [e0[0], e0[1], e0[2] + 2.5], [e0[0] + 5, e0[1] + 0.3, e0[2] + 3.5], [18, 12, e0[2] + 1], [24, 13.5, 2], [28, 14, -4]], { radius: 0.6, color: 0xd23b3b }),
            wire([e1, [e1[0], e1[1], e1[2] + 1.5], [e1[0] + 4, e1[1] + 0.3, e1[2] + 2], [19, 12, e1[2] - 0.5], [25, 13.5, 3], [28, 14, 0]], { radius: 0.6, color: 0x1d1f23 }),
          );
        }
        // tín hiệu: cắm vào đầu dưới chân header (sau lưng module), luồn dưới gầm module ra bo 74HC32 phía trước
        const pinEnd = (n) => { const o = c.node(n); if (!o) return null; const [a, b] = box3(o); const p0 = lo(a, b), p1 = hi(a, b); return [(p0[0] + p1[0]) / 2, p0[1] + 0.6, (p0[2] + p1[2]) / 2]; };
        const sig = [['pin_JP2_1', 0xf2c14e, [-8, 1, 40]], ['pin_JP2_2', 0x3fcf8e, [-2.5, 1, 40]], ['pin_JP2_4', 0x1d1f23, [6, 1, 40]]];
        for (const [n, col, end] of sig) {
          const a = pinEnd(n);
          if (a) logicCad.add(wire([a, [a[0], 0.5, a[2] + 4], [a[0] * 1.2, 0.5, 4], [end[0], 0.7, 24], end], { radius: 0.45, color: col }));
        }
        // nhãn theo vị trí CAD
        // U1 đã chuyển sang nhóm mm (ngoài cây GLB) → dùng tham chiếu cadU1
        const top = (n) => { const o = n === 'U1_DRV8871' ? cadU1 : c.node(n); if (!o) return null; const [a, b] = box3(o); const p1 = hi(a, b), p0 = lo(a, b); return [(p0[0] + p1[0]) / 2, p1[1], (p0[2] + p1[2]) / 2]; };
        const u = top('U1_DRV8871'), P = top('terminal_POWER'), M = top('terminal_MOTOR');
        if (u && P && M) LB_CAD = [[u[0], u[1] + 3, u[2]], [P[0] - 3, P[1] + 4, P[2] + 3], [M[0] + 4, M[1] + 4, M[2] + 3]];
      },
    });
    // tụ bulk 1000 µF: CAD tụ hóa Ø10 (kéo dài thành 20 mm như tụ thật), chân (+) về −z, (−) về +z
    const cadBulk = cadAttach(ctx, bulk, 'vendor/cp_radial_d10_0mm_p5_00mm', {
      onBottom: false, rotateY: -Math.PI / 2, offset: [0, 0, -1.1], frame: false,
      hide: bulk.children.filter((o) => o.isMesh),
      partDefault: ['Tụ bulk 1000 µF / 25 V (CAD thật, Ø10 × 20 mm)', 'Kho điện tích sát driver: cấp dòng xung PWM, hấp thụ năng lượng động cơ trả về khi phanh/thả trôi. Dải sáng có dấu "−" = cực âm.'],
      parts: { pin_1: ['Chân (+) — chân dài', 'Nối VM (+) của domino nguồn.'], pin_2: ['Chân (−) — phía có vạch', 'Nối GND (−).'] },
      onLoad(c) {
        const b = c.node('cap_elec_d10');
        if (b) { const bb = new THREE.Box3().setFromObject(b); const h = bb.max.y - Math.max(0, bb.min.y); if (h > 1) b.scale.y *= 20 / h; }
      },
    });
    let stepPos = 6;                     // 6 = lắp hoàn chỉnh (nội suy mượt theo bước)
    label(root, 'IN1 · IN2 ← 74HC32 ← PIC', [0, 6, 30]);

    // ---------- trạng thái mô phỏng ----------
    let i = 0, w = 0, ang = 0, tj = TA, stallT = 0, flow = 0;
    let offT = 0, ocpT = 0, tsd = false, onT = 0, lastState = -1, ring = 0, ringT = 0;
    let applied = 0, ctrlT = 0, tickCarry = 0, meas = 0, tgt = 0, integ = 0, stallCnt = 0, stallFlag = false, uPI = 0;
    let gIn1 = 0, gIn2 = 0, gndT = 0, plugT = 0, fault = null, dead = false, spikeT = 0, sparkT = 0, heated = false, seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const REC = { in1: new Float32Array(NS), in2: new Float32Array(NS), v: new Float32Array(NS), i: new Float32Array(NS), st: new Uint8Array(NS), pwm: new Uint8Array(NS), dir: new Uint8Array(NS), ndir: new Uint8Array(NS) };
    const tmp = [0, 0];
    let stepIdx = -1;
    const stepGroups = [[header], [termPwr, pwrWires, bulk], [termMot, motWires, motor], [logic]];
    function applyStep() {
      // bước 0: chỉ module; bước 1: + header; 2: + nguồn & tụ; 3: + động cơ; 4–5: + dây logic; <0: đầy đủ
      stepGroups.forEach((gs, k) => gs.forEach((g) => (g.visible = stepIdx < 0 || stepIdx >= k + 1)));
    }

    function resetAll() {
      fault = null; dead = false; spikeT = 0; plugT = 0; tsd = false; ocpT = 0; offT = 0; tj = TA; ring = 0; stallT = 0; w = 0; i = 0;
      applied = 0; integ = 0; stallCnt = 0; stallFlag = false; uPI = 0; tickCarry = 0;
    }

    return {
      object: root,
      onAction(id) { if (id === 'stall') stallT = 1.0; },
      setStep(k) { stepIdx = k; applyStep(); },
      triggerFault(id) {
        resetAll();
        fault = id;
        if (id === 'nguoc-nguon') {
          dead = true; spikeT = 0.25;
          const onCad = cad.active && cadU1Pop;
          fx.flash(onCad ? cadU1Pop : chipG, { size: 25, color: 0xfff1c0, intensity: 6 });
          fx.pop(onCad ? cadU1Pop : chipG, { force: 30, size: 5 });
          fx.smoke(onCad ? cadU1Pop : board, { size: 7, duration: 5, color: 0xbdbdbd });
          fx.scorch(onCad && cadPcb ? cadPcb : board, 0.5);
          fx.heat(bulk, 0.35);
        }
        if (id === 'thieu-tu') { plugT = 0.4; fx.sparks(cad.active && LB_CAD ? LB_CAD[1] : termPwr, { count: 15, speed: 20, size: 0.5 }); }
      },
      resetFault() { resetAll(); },
      update(dt, t, p) {
        hb.visible = p.hb;
        // ----- CAD thật: bật/tắt, hiện đúng bộ dây theo bước tháo lắp, header/vít domino chuyển động theo bước -----
        const cadOn = cad.sync(p);
        cadBulk.sync(p);
        const vis = (k) => stepIdx < 0 || stepIdx >= k + 1;
        header.visible = vis(0) && !cadOn;
        termPwr.visible = pwrWires.visible = vis(1) && !cadOn;
        pwrWiresCad.visible = vis(1) && cadOn;
        termMot.visible = motWires.visible = vis(2) && !cadOn;
        motWiresCad.visible = vis(2) && cadOn;
        logic.visible = vis(3) && !cadOn;
        logicCad.visible = vis(3) && cadOn;
        stepPos += ((stepIdx < 0 ? 6 : stepIdx) - stepPos) * Math.min(1, dt * 2.5);
        if (cadOn) {
          const cl = (x) => Math.max(0, Math.min(1, x));
          const h = cl(stepPos);                                    // bước 2: header trượt lên vào lỗ
          if (cadHdr) { cadHdr.set(-(1 - h) * 14); cadHdr.node.visible = h > 0.02; }
          const kp = cl(stepPos - 1), km = cl(stepPos - 2);         // bước 3 / 4: vặn vít domino (2 vòng, hạ 0,8 mm)
          cadScrewsP.forEach((s) => { s.spin.set(kp * 4 * Math.PI); s.lift?.set((1 - kp) * 0.8); });
          cadScrewsM.forEach((s) => { s.spin.set(km * 4 * Math.PI); s.lift?.set((1 - km) * 0.8); });
        }
        const LB = cadOn && LB_CAD ? LB_CAD : LB_PROC;
        [lbChip, lbPwr, lbMot].forEach((l, k) => l?.position?.set(...LB[k]));
        const VM = p.vm;
        const ITRIP = ILIM_OPTS[p.ilim] ?? 64 / 30;
        const shortOut = fault === 'chap-out';
        const Rm = shortOut ? 0.05 : R_M, Lm = shortOut ? 2e-6 : L_M;
        const stalled = stallT > 0 || fault === 'ket-banh' || shortOut;
        let wiring = p.wiring || 'or';
        if (fault === '74hc32-thieu-nguon' || fault === 'ndir-sai') wiring = 'or';
        const l298 = wiring === 'l298n';
        const ctrlOn = !!p.ctrl || fault === 'encoder-hong-pid';
        let mode = p.mode, sp = Math.round(p.speed * 10);
        if (fault === 'ket-banh') { mode = 'sm'; sp = 1000; }
        if (fault === 'in2-ho') { mode = 'sm'; sp = -200; }
        if (fault === 'thieu-tu') { mode = 'sm'; sp = -800; }
        if (fault === 'ndir-sai' || fault === '74hc32-thieu-nguon') mode = 'sm';
        if (fault === 'encoder-hong-pid') { mode = 'sm'; if (Math.abs(sp) < 300) sp = 500; }
        // ramp_toward(): tối đa 10 ‰ mỗi ms
        const dmax = RAMP * dt;
        applied += Math.max(-dmax, Math.min(dmax, sp - applied));
        const spi = Math.round(applied);
        // ---------- vòng PI mỗi 20 ms (pi_step trong motor.c) ----------
        ctrlT += dt;
        while (ctrlT >= CTRL_PERIOD) {
          ctrlT -= CTRL_PERIOD;
          const ticksF = (w / (2 * Math.PI)) * K_TICK * CTRL_PERIOD + tickCarry;
          tickCarry = ticksF - Math.trunc(ticksF);
          meas = fault === 'encoder-hong-pid' ? 0 : Math.trunc(ticksF);
          tgt = Math.trunc((spi * MAX_TICKS) / 1000);
          if (!ctrlOn) { integ = 0; stallCnt = 0; uPI = spi; }
          else if (spi === 0) { integ = 0; stallCnt = 0; stallFlag = false; uPI = 0; }
          else {
            const e = tgt - meas;
            integ = Math.max(-I_MAX, Math.min(I_MAX, integ + e * KI));
            let uu = Math.max(-1000, Math.min(1000, spi + e * KP + integ));
            if (meas === 0 && Math.abs(uu) > STALL_DUTY) stallCnt = Math.min(255, stallCnt + 1); else stallCnt = 0;
            if (stallCnt >= STALL_PERIODS) stallFlag = true;
            if (stallFlag) { integ = 0; uu = spi; }
            uPI = uu;
          }
        }
        let u = ctrlOn ? uPI : spi;
        if (spi === 0) u = 0;
        const rev = u < 0;
        const mag = Math.min(1000, Math.abs(u)) / 1000;
        // duty thanh ghi CCP theo cách nối: OR → 1000 − |v| ; nối thẳng → tiến v, lùi 1000 − v ; L298N → |v|
        const duty = mode !== 'sm' ? 0 : wiring === 'or' ? 1 - mag : l298 ? mag : rev ? 1 - mag : mag;
        const vfE = l298 ? L298_VF : VF;
        const rds = RDS25 * (1 + 0.004 * (tj - 25));
        const E = KE * w;
        const h = T_PWM / NS;
        const cap = fault === 'thieu-tu' ? 0.1e-6 : 1000e-6;
        const z0 = Math.sqrt(1e-6 / cap);

        // ---------- mô phỏng điện tử NPER chu kỳ ----------
        let sumI = 0, sumP = 0, sumV = 0, ipk = 0, pDiode = 0, ocpHit = false, nTot = 0;
        if (fault === 'quen-gnd' || fault === '74hc32-thieu-nguon') { gndT -= dt; if (gndT <= 0) { gIn1 = rnd() < 0.55 ? 1 : 0; gIn2 = rnd() < 0.4 ? 1 : 0; gndT = 0.08 + 0.35 * rnd(); } }
        for (let per = 0; per < NPER; per++) {
          let evt = false;
          for (let s = 0; s < NS; s++) {
            const ph = s / NS;
            let in1, in2;
            const pwmB = ph < duty ? 1 : 0, dirB = rev ? 1 : 0;
            const ndirB = fault === 'ndir-sai' ? 0 : 1 - dirB;
            if (mode === 'sm') {
              if (wiring === 'or') { in1 = pwmB | ndirB; in2 = pwmB | dirB; }                  // 74HC32
              else if (l298) { in1 = pwmB && u > 0 ? 1 : 0; in2 = pwmB && u < 0 ? 1 : 0; }   // EN·IN hiệu dụng
              else { in1 = pwmB; in2 = dirB; }                                                // nối thẳng (cũ)
            } else { in1 = mode === 'fwd' || mode === 'brake' ? 1 : 0; in2 = mode === 'rev' || mode === 'brake' ? 1 : 0; }
            if (fault === 'in2-ho') in2 = 0;
            if (fault === 'quen-gnd' || fault === '74hc32-thieu-nguon') { in1 = gIn1; in2 = gIn2; }
            REC.pwm[s] = pwmB; REC.dir[s] = dirB; REC.ndir[s] = ndirB;
            // trạng thái cầu: 0 hở (Z), 1 tiến, 2 lùi, 3 phanh
            let st = in1 && !in2 ? 1 : !in1 && in2 ? 2 : in1 && in2 ? 3 : 0;
            if (st === 1 || st === 2) onT += h; else onT = 0;
            if (offT > 0 && !l298) { offT -= h; if (st === 1 || st === 2) st = 3; }
            if (dead || tsd || ocpT > 0) st = 0;
            if (st !== lastState) { ring = Math.max(ring * Math.exp(-ringT / 40e-6), Math.abs(i) * z0); ringT = 0; }
            lastState = st;
            ringT += h;
            const vRing = ring * Math.exp(-ringT / 40e-6) * Math.sin(2 * Math.PI * 503e3 * ringT);
            const vmNode = VM + vRing;
            let vb;
            const vDrv = l298 ? vmNode - L298_DROP : vmNode;
            if (st === 1) vb = vDrv; else if (st === 2) vb = -vDrv; else if (st === 3) vb = 0;
            else vb = i > 1e-4 ? -(vmNode + 2 * vfE) : i < -1e-4 ? vmNode + 2 * vfE : null;
            if (vb === null) { i = 0; }
            else {
              const rLoop = st === 0 ? Rm : Rm + (l298 && st !== 3 ? L298_R : 2 * rds);
              const ni = i + ((vb - i * rLoop - (shortOut ? 0 : E)) / Lm) * h;
              i = st === 0 && i * ni < 0 ? 0 : ni;
            }
            // giới hạn dòng & quá dòng
            if (!l298 && (st === 1 || st === 2) && Math.abs(i) > ITRIP && onT > T_BLANK) { offT = T_OFF; }
            if (!l298 && Math.abs(i) > I_OCP) { ocpT = T_RETRY; ocpHit = true; evt = true; }
            const vout = st === 1 ? vmNode - i * 2 * rds : st === 2 ? -vmNode - i * 2 * rds : st === 3 ? -i * 2 * rds : (vb === null ? (shortOut ? 0 : E) : vb);
            if (st === 0 && vb !== null) pDiode += Math.abs(i) * 2 * vfE;
            REC.in1[s] = in1 * 5; REC.in2[s] = in2 * 5; REC.v[s] = vout; REC.i[s] = i; REC.st[s] = st;
            nTot++;
            sumI += i; sumV += vout;
            sumP += st === 1 || st === 2 ? (l298 ? Math.abs(i) * (L298_DROP + L298_R * Math.abs(i)) : i * i * 2 * rds) : st === 3 ? i * i * 2 * rds : 0;
            ipk = Math.max(ipk, Math.abs(i));
          }
          if (evt) break;
        }
        const iAvg = sumI / nTot;
        // OCP: hở 3 ms rồi thử lại (đếm theo thời gian thực)
        if (ocpT > 0) ocpT -= dt;
        // ---------- cơ ----------
        const nSub = 10, hs = dt / nSub;
        for (let k = 0; k < nSub; k++) {
          if (stalled) { w = 0; break; }
          const tm = KE * iAvg, tl = (fault === 'thieu-tu' ? 12 : p.load) / 1000 + T_FRIC;
          if (Math.abs(w) < 0.5 && Math.abs(tm) <= tl) { w = 0; continue; }
          w += ((tm - B * w - Math.sign(w || tm) * tl) / J) * hs;
        }
        stallT = Math.max(0, stallT - dt);
        // ---------- nhiệt ----------
        let pLoss = sumP / nTot + pDiode / nTot + VM * 0.003;
        if (ocpHit) pLoss *= 0.01;
        if (dead) pLoss = 0;
        tj += ((pLoss - (tj - TA) / (l298 ? L298_RTH : RTH)) / CTH) * dt * TH_FAST;
        if (tj > 175) tsd = true;
        if (tsd && tj < 135) tsd = false;
        const hot = Math.max(0, (tj - 90) / 110);
        const chipHeat = cadOn && cadU1 ? cadU1 : chip;               // nóng đỏ: IC DRV8871 trên CAD, hoặc chip tự dựng
        if (!dead) { if (hot > 0.02) { fx.heat(chipHeat, hot); if (heated && heated !== chipHeat) fx.heat(heated, 0); heated = chipHeat; } else if (heated) { fx.heat(heated, 0); heated = false; } }
        if (shortOut) { sparkT -= dt; if (sparkT <= 0) { sparkT = 0.3; fx.sparks(cadOn && LB_CAD ? LB_CAD[2] : termMot, { count: 8, speed: 18, size: 0.5 }); } }

        // ---------- hình ảnh ----------
        ang += (w / SLOW) * dt;
        disc.rotation.x = ang;
        const F_SHOW = 1;
        const idx = Math.min(NS - 1, Math.floor(((t * F_SHOW) % 1) * NS));
        const st = REC.st[idx], ii = REC.i[idx];
        const on = [false, false, false, false], dio = [false, false, false, false];
        if (st === 1) { on[0] = on[3] = true; } else if (st === 2) { on[1] = on[2] = true; } else if (st === 3) { on[2] = on[3] = true; }
        else if (Math.abs(ii) > 1e-3) { if (ii > 0) { dio[2] = dio[1] = true; } else { dio[0] = dio[3] = true; } }
        fetMeshes.forEach((m, k) => {
          const c = m.material;
          if (on[k]) { c.color.setRGB(0.15, 0.75, 0.35); c.emissive.setRGB(0.05, 0.6, 0.2); }
          else if (dio[k]) { c.color.setRGB(0.9, 0.5, 0.1); c.emissive.setRGB(0.6, 0.25, 0); }
          else { c.color.setRGB(0.17, 0.18, 0.21); c.emissive.setRGB(0, 0, 0); }
          c.emissiveIntensity = 1;
        });
        const showOr = wiring === 'or' && mode === 'sm';
        orG.visible = showOr;
        icBoard.visible = wiring === 'or' && (stepIdx < 0 || stepIdx >= 4);
        if (showOr) {
          setGlow(gate1, REC.in1[idx] > 0, true); setGlow(gate2, REC.in2[idx] > 0, true);
          setGlow(sOut1, REC.in1[idx] > 0); setGlow(sOut2, REC.in2[idx] > 0);
          setGlow(sPwm1, REC.pwm[idx]); setGlow(sPwm2, REC.pwm[idx]); setGlow(sNdir, REC.ndir[idx]); setGlow(sDir, REC.dir[idx]);
        }
        if (icBoard.visible) {
          const lv = { 0: REC.pwm[idx], 1: REC.ndir[idx], 2: REC.in1[idx] > 0, 4: REC.dir[idx], 5: REC.in2[idx] > 0 };
          for (const k of Object.keys(pin74Mat)) { const on = lv[k] ? 1 : 0; pin74Mat[k].emissive.setRGB(on, on * 0.7, on * 0.1); pin74Mat[k].emissiveIntensity = 0.9; }
        }
        let path = null, dir = 1;
        if (Math.abs(ii) > 0.01) {
          if (st === 1) { path = PATHS.fwd; dir = ii > 0 ? 1 : -1; }
          else if (st === 2) { path = PATHS.rev; dir = ii < 0 ? 1 : -1; }
          else if (st === 3) { path = PATHS.brake; dir = ii > 0 ? 1 : -1; }
          else path = ii > 0 ? PATHS.hizP : PATHS.hizN;
        }
        flow += dir * Math.min(2.5, Math.abs(ii)) * dt * 0.35;
        pars.forEach((m, k) => {
          m.visible = !!path && p.hb;
          if (!m.visible) return;
          let u = (k / NPAR + flow) % 1; if (u < 0) u += 1;
          along(path, u, tmp);
          m.position.x = tmp[0]; m.position.y = tmp[1];
        });

        // ---------- số đo ----------
        const names = ['Hở (Z) — thả trôi', 'TIẾN (Q1+Q4)', 'LÙI (Q2+Q3)', 'PHANH (Q3+Q4)'];
        const regVal = mode === 'sm' ? Math.round(duty * 1000) : 0;
        const pc = (x) => Math.round(x * 100);
        let pins;
        if (mode === 'sm' && wiring === 'or') pins = u === 0 ? 'PWM luôn cao (duty 1000) → IN1 = IN2 = 1 → PHANH giữ bánh'
          : `PWM ${pc(duty)} %, DIR = ${rev ? 1 : 0}, nDIR = ${fault === 'ndir-sai' ? 0 : rev ? 0 : 1} → ${rev ? 'IN1 = PWM, IN2 = 1' : 'IN1 = 1, IN2 = PWM'}: ${rev ? 'lùi' : 'tiến'} ${pc(1 - duty)} % / phanh ${pc(duty)} %`;
        else if (mode === 'sm' && l298) pins = `EN = PWM ${pc(duty)} %, IN1 = ${u > 0 ? 1 : 0}, IN2 = ${u < 0 ? 1 : 0} → ${rev ? 'lùi' : 'tiến'} ${pc(duty)} % / thả trôi ${pc(1 - duty)} %`;
        else if (mode === 'sm') pins = `IN1 = PWM ${pc(duty)} %, IN2 = ${rev && fault !== 'in2-ho' ? 1 : 0} → ${rev ? (fault === 'in2-ho' ? 'muốn lùi nhưng IN2 hở → TIẾN!' : `phanh ${pc(duty)} % / lùi ${pc(1 - duty)} %`) : `tiến ${pc(duty)} % / thả trôi ${pc(1 - duty)} %`}`;
        else pins = `IN1 = ${mode === 'fwd' || mode === 'brake' ? 1 : 0}, IN2 = ${mode === 'rev' || mode === 'brake' ? 1 : 0} → ${names[{ fwd: 1, rev: 2, brake: 3, coast: 0 }[mode]]}`;
        let dcm = false;
        for (let s = 0; s < NS; s++) if (REC.st[s] === 0 && REC.i[s] === 0) { dcm = true; break; }
        let state = 'Bình thường';
        if (mode === 'sm' && wiring === 'thang') state = !rev && duty > 0 && duty < 1 && dcm ? 'Nối thẳng — tiến kiểu fast decay: dòng về 0 mỗi chu kỳ → tốc độ < tỉ lệ duty' : rev ? 'Nối thẳng — lùi kiểu slow decay: dòng liên tục, tốc độ ≈ tỉ lệ' : 'Nối thẳng (cũ)';
        if (mode === 'sm' && wiring === 'or') state = u === 0 ? 'Tốc độ 0 → phanh giữ bánh' : 'Qua 74HC32: chạy ↔ phanh (slow decay) cả 2 chiều — đối xứng';
        if (mode === 'sm' && l298) state = 'L298N: sụt ~2 V trên transistor, thả trôi cả 2 chiều (đối xứng nhưng yếu), không giới hạn dòng (mô hình 3D vẫn là module DRV8871)';
        if (ctrlOn && mode === 'sm' && !stallFlag && spi !== 0) state += ` · PI: e = ${tgt - meas} xung`;
        if (mode === 'coast') state = 'Ngủ (IN1 = IN2 = 0 > 1 ms), dòng chờ < 1 µA';
        if (offT > 0 || ipk >= ITRIP * 0.98) state = `Giới hạn dòng: băm quanh ${ITRIP.toFixed(2)} A`;
        if (tsd) state = '🔥 BẢO VỆ NHIỆT (TSD 175 °C) — tắt cầu, chờ nguội 135 °C';
        if (fault === 'ket-banh' && !tsd) state = `Kẹt bánh: chip đang nóng ${tj.toFixed(0)} °C`;
        if (ocpHit || (shortOut && ocpT > 0)) state = '⚠️ QUÁ DÒNG (OCP) — ngắt 3 ms rồi thử lại';
        if (fault === 'thieu-tu') state = `Gai VM ±${(ipk * z0).toFixed(1)} V mỗi lần chuyển mạch (không có tụ bulk)`;
        if (fault === 'in2-ho') state = wiring === 'or' ? '⚠️ IN2 hở (= 0): qua 74HC32 lệnh LÙI 20 % thành tiến/thả trôi — bánh chạy TIẾN!' : '⚠️ Lệnh LÙI chậm 20 % nhưng IN2 hở (kéo xuống 0) → duty 800 ‰ → bánh TIẾN nhanh!';
        if (fault === 'ndir-sai') state = rev ? 'nDIR = 0: chiều LÙI vẫn chạy bình thường — thử lệnh tiến' : '⚠️ nDIR = 0 → IN1 = IN2 = PWM: chỉ có thả trôi/phanh, bánh KHÔNG quay tiến';
        if (fault === '74hc32-thieu-nguon') state = '⚠️ 74HC32 không có nguồn 5 V — IN1/IN2 trôi nổi, bánh giật lung tung';
        if (fault === 'encoder-hong-pid') state = stallFlag ? '⚠️ Encoder = 0 suốt 300 ms → WHEEL_STALL, về hở vòng (duty = lệnh)' : `⚠️ Encoder không có xung → PI bơm duty lên ${uPI} ‰`;
        if (fault === 'quen-gnd') state = '⚠️ Không chung GND — IN1/IN2 nhiễu ngẫu nhiên';
        if (dead) state = '💥 Chip vỡ — ngược cực nguồn';
        readout('pins', dead ? '—' : pins);
        readout('reg', regVal);
        readout('vavg', sumV / nTot);
        readout('iavg', iAvg);
        readout('ipk', ipk);
        readout('rpm', (w * 60) / (2 * Math.PI));
        readout('ploss', pLoss);
        readout('tj', tj);
        readout('pi', `${tgt} / ${meas} · ${ctrlOn ? `duty PI ${uPI} ‰` : `PI tắt (duty = lệnh ${spi} ‰)`}`);
        readout('flag', stallFlag ? '⚠️ WHEEL_STALL = 1 (chạy hở vòng)' : '0');
        readout('state', state);
        let iScope = REC.i[idx], vScope = REC.v[idx];
        if (plugT > 0) { plugT -= dt; vScope = VM + VM * Math.cos(t * 45) * (plugT / 0.4); }
        if (spikeT > 0) { spikeT -= dt; iScope = 85; }
        return [REC.in1[idx], REC.in2[idx], vScope, iScope, tgt, meas, mode === 'sm' ? u : 0];
      },
    };
  },
};
