// 📶 ESP32-S3-DevKitC-1 — "bộ não" của robot: BLE với app, thuật toán đi, odometry, PWM quạt hút.
// 2 hàng chân × 22 tô màu theo vai trò trong dự án (docs/01 mục 4); chân cấm (strapping, flash/PSRAM, USB) tô đỏ sẫm.
// Demo: quảng bá BLE "RoboVac-PIC" (sóng lan từ ăng-ten), PWM quạt GPIO4, khung UART DRIVE trên GPIO17, LED RGB.

import { cadAttach, ownMaterial } from '../../core/cadParts.js';

// [GPIO hoặc tên, nhóm, mô tả trong dự án]
const J1 = [
  ['3V3', 'power', 'Ra 3.3 V từ LDO trên board (≤ ~500 mA). KHÔNG cấp 5 V vào đây!'],
  ['3V3', 'power', 'Ra 3.3 V — cấp kéo lên cho FG quạt, MPU6050'],
  ['RST', 'ctrl', 'EN/Reset — kéo xuống 0 để khởi động lại chip (nút RST)'],
  [4, 'pwm', 'PWM quạt hút (LEDC 20 kHz, 8 bit) — FAN_PWM'],
  [5, 'input', 'FG quạt (xung tốc độ, open-collector → kéo lên 3.3 V)'],
  [6, 'output', 'Còi (buzzer) — tùy chọn'],
  [7, 'free', 'Tự do'],
  [15, 'pwm', '(sau) PWM motor lidar qua N-MOSFET'],
  [16, 'uart', '(sau) UART2 RX ← Lidar LDS02RR TX (3.3 V)'],
  [17, 'uart', 'UART1 TX → BSS138 LV2→HV2 → PIC chân 26 (RC7/RX), 19200 8N1'],
  [18, 'uart', 'UART1 RX ← BSS138 LV1←HV1 ← PIC chân 25 (RC6/TX)'],
  [8, 'i2c', 'I2C SDA → MPU6050 (góc quay chính xác)'],
  [3, 'avoid', 'Strapping (chọn nguồn JTAG) — tránh kéo cố định lúc khởi động'],
  [46, 'avoid', 'Strapping (chế độ boot / in log ROM) — để trống'],
  [9, 'i2c', 'I2C SCL → MPU6050'],
  [10, 'free', 'Tự do'],
  [11, 'free', 'Tự do'],
  [12, 'free', 'Tự do'],
  [13, 'free', 'Tự do'],
  [14, 'free', 'Tự do'],
  ['5V', 'power', 'VÀO 5 V từ buck XL4015 (hoặc từ cổng USB). Đi qua LDO → 3.3 V'],
  ['GND', 'ground', 'GND — nối chung GND robot (hình sao về cực âm pin)'],
];
const J3 = [
  ['GND', 'ground', 'GND'],
  [43, 'avoid', 'U0TXD — cổng log/nạp qua chip USB-UART; tránh dùng'],
  [44, 'avoid', 'U0RXD — cổng log/nạp; tránh dùng'],
  [1, 'free', 'Tự do (có ADC1)'],
  [2, 'free', 'Tự do (có ADC1)'],
  [42, 'free', 'Tự do (JTAG MTMS nếu debug)'],
  [41, 'free', 'Tự do (JTAG MTDI)'],
  [40, 'free', 'Tự do (JTAG MTDO)'],
  [39, 'free', 'Tự do (JTAG MTCK)'],
  [38, 'rgb', 'LED RGB WS2812 trên board v1.1 (v1.0 dùng GPIO48)'],
  [37, 'avoid', 'Nối PSRAM Octal (module N8R8/N16R8) — CẤM dùng'],
  [36, 'avoid', 'Nối PSRAM Octal — CẤM dùng'],
  [35, 'avoid', 'Nối PSRAM Octal — CẤM dùng'],
  [0, 'boot', 'Nút BOOT = nút START/STOP của robot. Strapping: giữ 0 lúc reset → vào chế độ nạp'],
  [45, 'avoid', 'Strapping (chọn áp flash 3.3/1.8 V) — kéo lên 1 sai sẽ không boot'],
  [48, 'rgb', 'LED RGB WS2812 trên board v1.0'],
  [47, 'free', 'Tự do'],
  [21, 'free', 'Tự do'],
  [20, 'avoid', 'USB D+ (cổng USB-OTG gốc) — tránh'],
  [19, 'avoid', 'USB D− — tránh'],
  ['GND', 'ground', 'GND'],
  ['GND', 'ground', 'GND'],
];
const LOCAL_COLORS = { i2c: 0xd65bd6, avoid: 0x8b1e3f, free: 0x9aa1ab, rgb: 0xff66cc, ctrl: 0xa86bf0, boot: 0x1fc7c7 };
const GROUP_NAMES = {
  all: 'Tất cả', project: 'Chân dự án dùng', avoid: 'Chân cần TRÁNH', power: 'Nguồn & GND', free: 'Chân tự do',
};
const PROJECT_GROUPS = new Set(['pwm', 'uart', 'i2c', 'input', 'output', 'boot', 'rgb']);

export default {
  id: 'esp32-s3',
  name: 'ESP32-S3-DevKitC-1',
  category: 'dieu-khien',
  order: 3,
  icon: '📶',
  summary: 'Vi điều khiển 2 nhân 240 MHz có Wi-Fi + Bluetooth LE — "bộ não" nói chuyện với app qua BLE và ra lệnh cho PIC qua UART. Rê chuột lên từng chân để biết dự án dùng nó làm gì, chân nào cấm đụng.',
  tags: ['ESP32', 'ESP32-S3', 'DevKitC', 'BLE', 'Bluetooth', 'WiFi', 'GPIO', 'strapping', 'LEDC', 'WS2812'],

  params: [
    { id: 'cad', label: '🧊 Mô hình CAD thật (DevKitC-1 v1.1)', type: 'toggle', value: true, hint: 'Tắt = mô hình học tự dựng. Tô màu chân, LED, nút, sóng BLE vẫn chạy trên cả hai.' },
    { id: 'group', label: 'Làm nổi nhóm chân', type: 'select', value: 'project', options: Object.entries(GROUP_NAMES) },
    { id: 'demo', label: 'Chạy thử', type: 'select', value: 'ble', options: [['none', '— Không chạy'], ['ble', 'Quảng bá BLE "RoboVac-PIC"'], ['fan', 'PWM quạt hút trên GPIO4'], ['uart', 'Gửi khung DRIVE qua GPIO17'], ['rgb', 'LED RGB đổi màu']] },
    { id: 'duty', label: 'Công suất quạt (FAN:p)', type: 'range', min: 0, max: 100, step: 1, value: 70, unit: '%' },
    { id: 'rev', label: 'Phiên bản board', type: 'select', value: 'v11', options: [['v10', 'v1.0 (LED RGB = GPIO48)'], ['v11', 'v1.1 (LED RGB = GPIO38)']] },
  ],
  readouts: [
    { id: 'cpu', label: 'CPU', unit: '' },
    { id: 'ble', label: 'BLE', unit: '' },
    { id: 'pin', label: 'Chân đang hoạt động', unit: '' },
    { id: 'i', label: 'Dòng ước tính từ chân 5V', unit: 'mA' },
    { id: 'ldo', label: 'Nhiệt tỏa ở LDO (5 V → 3.3 V)', unit: 'mW' },
    { id: 'state', label: 'Trạng thái', unit: '' },
  ],
  scope: {
    window: 3,
    note: '(đã làm chậm: quảng bá BLE 100 ms → 1 s, mỗi gói ~0.4 ms vẽ rộng ra; PWM 20 kHz → 2 Hz; UART 19200 → 20 bit/s)',
    channels: [
      { name: 'GPIO17 TX', unit: 'V', min: -0.3, max: 3.6, color: '#4cc2ff' },
      { name: 'GPIO4 PWM quạt', unit: 'V', min: -0.3, max: 3.6, color: '#ff8c1a' },
      { name: 'Sóng RF 2.4 GHz', unit: '', min: 0, max: 1.1, color: '#ff6b9a' },
    ],
  },

  info: {
    overview: `
      <p><b>ESP32-S3</b> (Espressif) là vi điều khiển 32-bit 2 nhân Xtensa LX7 240 MHz, có sẵn Wi-Fi 2.4 GHz và <b>Bluetooth 5 LE</b>. Board <b>DevKitC-1</b> gồm module ESP32-S3-WROOM-1 (chip + flash + PSRAM + ăng-ten mạch in), LDO 3.3 V, chip USB-UART, 2 cổng USB-C, nút BOOT/RST, LED RGB.</p>
      <p>Trong dự án ESP32 là <b>"bộ não"</b>: nhận lệnh từ app qua BLE, chạy máy trạng thái (MANUAL/AUTO/SPIRAL/ZIGZAG), tính odometry, phát PWM quạt hút, và gửi khung DRIVE cho PIC 20 lần/giây.</p>
      <p>Thử: chọn <b>Làm nổi → Chân cần TRÁNH</b> để thấy vì sao không thể cắm cảm biến vào chân bất kỳ. Rồi <b>Chạy thử → Quảng bá BLE</b>: mỗi nhịp sóng là một lần ESP32 "hét" tên RoboVac-PIC trên 3 kênh 37/38/39.</p>`,
    specs: [
      ['Chip', 'ESP32-S3: 2 nhân Xtensa LX7 tới 240 MHz, 512 KB SRAM, lệnh vector cho AI'],
      ['Module', 'ESP32-S3-WROOM-1 (18 × 25.5 × 3.1 mm): flash 8–16 MB + PSRAM 0–8 MB, ăng-ten PCB'],
      ['Không dây', 'Wi-Fi 802.11 b/g/n 2.4 GHz · Bluetooth 5 LE (2 Mbps, tầm xa Coded PHY)'],
      ['Board', '≈ 63 × 25.4 mm, 2 hàng 22 chân bước 2.54 mm, 2 hàng cách nhau 22.86 mm (không vừa 1 breadboard)'],
      ['Nguồn', 'Chân 5V hoặc USB → LDO 3.3 V. GPIO chỉ chịu 3.3 V (tuyệt đối tối đa 3.6 V)'],
      ['GPIO', '45 GPIO (trên board ra ~36), ADC 12-bit, LEDC PWM 8 kênh, 3 UART, 2 I2C, RMT, touch'],
      ['Dòng tiêu thụ', '~40–60 mA CPU chạy + BLE; đỉnh TX BLE ~100–130 mA; Wi-Fi TX ~300 mA'],
    ],
    principle: `
      <h4>1. 3.3 V logic</h4>
      <p>Mọi chân GPIO hoạt động ở 0–3.3 V: <code>V_IH ≥ 0.75·VDD ≈ 2.5 V</code>, <code>V_IL ≤ 0.25·VDD ≈ 0.8 V</code>. Đặt 5 V vào sẽ làm dẫn diode bảo vệ bên trong → dòng chảy vào đường 3.3 V → hỏng dần. Vì vậy UART với PIC (5 V) phải qua <b>BSS138</b>.</p>
      <h4>2. Chân strapping</h4>
      <p>Lúc vừa reset, chip đọc mức của GPIO0, 3, 45, 46 để quyết định chế độ: GPIO0 = 1 → chạy chương trình trong flash; GPIO0 = 0 → chờ nạp qua USB/UART. GPIO45 chọn điện áp flash. Nối cảm biến kéo cố định các chân này → robot "không chịu chạy".</p>
      <h4>3. BLE quảng bá (advertising)</h4>
      <p>Khi chưa kết nối, ESP32 cứ ~100 ms lại gửi một gói ~0.4 ms lần lượt trên 3 kênh quảng bá 37 (2402 MHz), 38 (2426 MHz), 39 (2480 MHz), chứa tên <code>RoboVac-PIC</code> và UUID dịch vụ NUS <code>6E400001-…</code>. App quét thấy → kết nối → ghi lệnh vào đặc tính RX, nhận bản tin qua Notify TX.</p>
      <h4>4. LEDC PWM</h4>
      <p><code>f = 80 MHz / (2^bits × chia)</code>: 8 bit ở 20 kHz → duty 0…255. <code>FAN:70</code> → 179/255.</p>
      <h4>5. LDO 3.3 V</h4>
      <p>Ổn áp tuyến tính: <code>P = (5 − 3.3) × I</code>. 100 mA → 0.17 W (mát). Cấp 12 V vào chân 5V → (12 − 3.3) × 0.1 = 0.87 W → quá nhiệt.</p>`,
    inRobot: `
      <ul>
        <li>Bảng chân (docs/01 mục 4): <b>17</b> UART1 TX → PIC, <b>18</b> UART1 RX ← PIC (qua BSS138), <b>4</b> PWM quạt, <b>5</b> FG quạt, <b>8/9</b> I2C MPU6050, <b>16</b> lidar RX, <b>15</b> PWM motor lidar, <b>6</b> còi, <b>0</b> nút BOOT = START/STOP, <b>48 (v1.0)/38 (v1.1)</b> LED RGB.</li>
        <li>Tránh: GPIO 19/20 (USB), 26–37 (flash/PSRAM), 0/3/45/46 (strapping) cho tín hiệu ngoài.</li>
        <li>Firmware <code>firmware/esp32s3/src/config.h</code>: <code>PIN_PIC_TX 17</code>, <code>PIN_PIC_RX 18</code>, <code>PIC_BAUD 19200</code>, <code>FAN_PWM_FREQ 20000</code>, <code>BLE_NAME "RoboVac-PIC"</code>, <code>DRIVE_PERIOD_MS 50</code> (20 Hz, cũng là heartbeat cho PIC).</li>
        <li>Nguồn: chân 5V ← buck XL4015; GND chung với PIC. Khi cắm USB máy tính để nạp/debug, nên tắt nguồn robot hoặc dùng cổng có diode cách ly.</li>
      </ul>`,
    mistakes: `
      <ul>
        <li>Cắm thẳng TX của PIC (5 V) vào GPIO18 → chạy được vài ngày rồi chân chết, đôi khi cả chip.</li>
        <li>Cấp 5 V vào chân 3V3 → chết ngay chip + flash.</li>
        <li>Dùng GPIO35–37 trên module có PSRAM Octal → "Guru Meditation Error", reset liên tục.</li>
        <li>Nối nút/cảm biến kéo xuống vào GPIO0 → bật nguồn đúng lúc nút bị đè là vào chế độ nạp, robot "đơ".</li>
        <li>Nhầm phiên bản board → LED RGB không sáng (v1.0 GPIO48, v1.1 GPIO38).</li>
        <li>Đặt module sát khung kim loại/pin → ăng-ten PCB bị che, tầm BLE giảm còn vài mét. Ăng-ten nên chìa ra mép bo, xa kim loại.</li>
      </ul>`,
    quiz: [
      { q: 'Vì sao không cắm trực tiếp TX của PIC vào RX của ESP32?', a: 'PIC xuất 5 V, ESP32 chỉ chịu tối đa 3.6 V → diode bảo vệ dẫn, dòng chảy vào nguồn 3.3 V, lâu dài làm hỏng chân/chip. Dùng mạch chuyển mức BSS138 (hoặc tối thiểu phân áp).' },
      { q: 'GPIO nào là nút START/STOP của robot và tại sao nó "nhạy cảm"?', a: 'GPIO0 (nút BOOT). Nó là chân strapping: nếu đang bị kéo xuống 0 đúng lúc reset, chip vào chế độ nạp thay vì chạy firmware.' },
      { q: 'LEDC 8 bit, app gửi FAN:40. Giá trị duty ghi vào thanh ghi là bao nhiêu?', a: '40 % × 255 ≈ 102.' },
    ],
  },

  steps: [
    { title: 'Bước 1 — Nhận diện board', text: 'Đọc chữ trên module: ESP32-S3-WROOM-1 <b>N8R8</b> = flash 8 MB + PSRAM 8 MB (Octal → GPIO35–37 bị chiếm). Mặt sau ghi v1.0 hay v1.1 (LED RGB 48 hay 38). Hai cổng USB-C: "USB" (USB-OTG gốc, GPIO19/20) và "UART" (qua chip USB-UART, GPIO43/44).' },
    { title: 'Bước 2 — Nguồn: 5V và GND từ buck', text: 'Dây đỏ từ OUT+ của XL4015 vào chân <b>5V</b> (J1 chân 21), dây đen vào <b>GND</b>. Tuyệt đối không cấp vào 3V3. Đo trước: 4.9–5.2 V. Chân được tô sáng = chân của bước này.' },
    { title: 'Bước 3 — UART tới PIC qua BSS138', text: 'GPIO17 (TX) → LV2 của BSS138; GPIO18 (RX) ← LV1. Chân LV của BSS138 nối 3V3 của ESP32, chân HV nối 5 V của PIC. <b>GND chung</b> cả ba. Đổi chéo TX↔RX là lỗi phổ biến nhất.' },
    { title: 'Bước 4 — Quạt, IMU, nút', text: 'GPIO4 → dây PWM quạt (đo mức logic của quạt trước), GPIO5 ← FG (trở 10k kéo lên 3V3). GPIO8/9 → SDA/SCL MPU6050 (module có sẵn trở kéo lên). Nút START dùng chính nút BOOT (GPIO0) trên board — không nối thêm.' },
    { title: 'Bước 5 — Nạp firmware', text: 'PlatformIO: <code>pio run -t upload</code> qua cổng "UART" (hoặc "USB"). Nếu không vào chế độ nạp: giữ BOOT, nhấn-thả RST, thả BOOT. Mở Serial Monitor 115200 xem log; dùng nRF Connect tìm thiết bị "RoboVac-PIC".' },
  ],

  faults: [
    { id: '5v-vao-gpio', label: 'Cắm thẳng TX 5 V của PIC vào GPIO18', severity: 'hong',
      what: '<p>Ban đầu vẫn nhận UART bình thường! Sau vài giờ–vài ngày: GPIO18 không đọc được nữa, ESP32 nóng hơn, đôi khi reset ngẫu nhiên.</p>',
      why: '<p>Bên trong mỗi GPIO có diode bảo vệ từ chân lên VDD 3.3 V. 5 V làm diode dẫn: <code>I ≈ (5 − 3.3 − 0.6) / R_ra_PIC (~25–50 Ω) ≈ 20–40 mA</code> — vượt xa mức chịu đựng liên tục (~1–2 mA) của diode ESD. Dòng còn bơm ngược vào đường 3.3 V, đẩy VDD lên và có thể gây latch-up.</p>',
      fix: '<p>Dùng module BSS138 (hoặc tối thiểu phân áp 1 kΩ/2 kΩ cho chiều PIC→ESP32). Đo mức logic của mọi thiết bị 5 V trước khi nối vào ESP32.</p>' },
    { id: '5v-vao-3v3', label: 'Cấp 5 V vào chân 3V3', severity: 'chay',
      what: '<p>Vừa cấp điện: LED nguồn lóe sáng rồi tắt, module nóng bỏng sau 1–2 giây, có mùi khét; máy tính không nhận cổng USB nữa.</p>',
      why: '<p>Chân 3V3 nối thẳng vào VDD của chip, flash và PSRAM — tuyệt đối tối đa 3.6 V. 5 V vượt 40 % → lớp ôxit cổng transistor bị đánh thủng, chip ngắn mạch nội, dòng có thể &gt; 1 A từ buck → tỏa nhiệt vài W trong module nhỏ.</p>',
      fix: '<p>Đánh dấu rõ chân 5V/3V3 trên bo mẹ, dùng đầu nối có khóa. Khi đã cháy: thay board (không sửa được).</p>' },
    { id: 'strapping', label: 'Nút START nối thêm vào GPIO0 bị kẹt khi bật nguồn', severity: 'loi',
      what: '<p>Bật robot: LED RGB không sáng, app không thấy "RoboVac-PIC". Serial log báo <code>waiting for download</code>. Nhấn RST lại thì chạy (khi nút không còn bị đè).</p>',
      why: '<p>GPIO0 là chân strapping: chip lấy mẫu mức của nó trong vài ms sau khi EN lên 1. Mức 0 → ROM bootloader chờ nạp qua UART/USB, không chạy firmware. Tụ chống dội lớn trên GPIO0 cũng có thể giữ chân ở 0 đủ lâu để gây lỗi này.</p>',
      fix: '<p>Dùng nút BOOT có sẵn (đã có trở kéo lên); không gắn tụ &gt; 100 nF; cảm biến ngoài dùng chân tự do (GPIO1/2/7/10…).</p>' },
    { id: 'psram-pin', label: 'Dùng GPIO35 (PSRAM) cho cảm biến va chạm', severity: 'loi',
      what: '<p>Firmware chạy vài giây rồi in "Guru Meditation Error: Cache error / LoadProhibited" và reset liên tục.</p>',
      why: '<p>Trên module N8R8, GPIO33–37 là đường dữ liệu PSRAM Octal (tốc độ 80 MHz). Cấu hình lại làm GPIO hoặc nối tải ngoài vào làm hỏng truyền dữ liệu bộ nhớ → CPU đọc sai lệnh/dữ liệu từ PSRAM.</p>',
      fix: '<p>Tra bảng "chân cần tránh" của đúng module; dùng chân tự do. ESP-IDF thường cảnh báo khi cấu hình chân flash/PSRAM.</p>' },
    { id: 'hai-nguon', label: 'Cắm USB máy tính khi robot đang cấp 5V qua buck', severity: 'nhe',
      what: '<p>Đa số trường hợp vẫn chạy. Đôi khi máy tính báo "USB device drew too much power", cổng USB tắt; hiếm hơn: cổng USB của laptop hỏng.</p>',
      why: '<p>Hai nguồn 5 V (buck 5.05 V và USB 5.0 V) nối chung qua đường 5V của board. Nếu không có diode/công tắc cách ly, nguồn cao hơn đẩy dòng ngược vào nguồn thấp hơn — cổng USB máy tính không được thiết kế để nhận dòng vào.</p>',
      fix: '<p>Khi nạp/debug: tắt công tắc nguồn robot hoặc chỉ nối GND + UART (bỏ dây 5V), hoặc dùng cáp USB đã cắt dây VBUS / hub có cách ly.</p>' },
  ],

  build(ctx) {
    const { THREE, MAT, PIN_COLORS, geom, label, readout, fx } = ctx;
    const { mesh, group, part, cyl, box, pcb, wire } = geom;
    const root = new THREE.Group();
    const BY = 11;                          // mặt trên PCB cao 11 mm (đứng trên chân header)
    const L = 63, W = 25.4;
    const board = new THREE.Group();
    board.position.y = BY;
    root.add(board);
    board.add(pcb(L, W, { mat: MAT.pcbBlack }));

    // ---------- module ESP32-S3-WROOM-1 ----------
    const modG = new THREE.Group();
    modG.position.set(-18.75, 0, 0);
    modG.add(mesh(box(25.5, 0.8, 18), MAT.pcbBlue, { y: 0.4 }));
    const shield = mesh(box(17.6, 2.3, 16.6, 0.3), MAT.steel.clone(), { x: 3.5, y: 1.95 });
    modG.add(part(shield, 'Vỏ chắn nhiễu kim loại (shield)', 'Bên dưới: chip ESP32-S3, flash 8/16 MB, PSRAM, thạch anh 40 MHz, mạch RF. Vỏ chắn sóng nhiễu ra/vào.'));
    const antG = new THREE.Group();
    antG.add(mesh(box(5.8, 0.05, 17), MAT.pcbBlue, { x: -9.5, y: 0.82 }));
    for (let k = 0; k < 7; k++) antG.add(mesh(box(4.6, 0.06, 0.5), MAT.gold, { x: -9.8, y: 0.86, z: -7.5 + k * 2.5 }));
    for (let k = 0; k < 6; k++) antG.add(mesh(box(0.5, 0.06, 2.5), MAT.gold, { x: k % 2 ? -7.5 : -12.1, y: 0.86, z: -6.25 + k * 2.5 }));
    modG.add(part(antG, 'Ăng-ten mạch in (PCB antenna) 2.4 GHz', 'Đường đồng uốn khúc dài ~λ/4 (≈ 31 mm ở 2.4 GHz, gấp lại). Không đặt kim loại/pin/dây trong vùng 15 mm quanh đây — tầm BLE giảm mạnh.'));
    board.add(part(modG, 'Module ESP32-S3-WROOM-1 (N8R8)', '18 × 25.5 × 3.1 mm: chip ESP32-S3 + flash + PSRAM + ăng-ten. Có chứng nhận FCC/CE sẵn.'));
    label(board, 'ESP32-S3-WROOM-1', [-15, 6, 0]);
    const antAnchor = new THREE.Object3D();
    antAnchor.position.set(-28.5, 1, 0);
    board.add(antAnchor);

    // ---------- linh kiện khác trên board ----------
    const usbs = [];
    for (const [z, nm, d] of [[-4.7, 'USB-C "USB" (OTG gốc)', 'Nối thẳng GPIO19/20 của chip: nạp & debug qua USB-JTAG, hoặc làm thiết bị USB.'], [4.7, 'USB-C "UART"', 'Qua chip USB-UART (CP2102N) tới GPIO43/44 — cổng nạp & log quen thuộc (115200).']]) {
      const u = mesh(box(7.35, 3.26, 8.94, 1.2), MAT.steel, { x: 28.2, y: 1.63, z });
      board.add(part(u, nm, d));
      usbs.push(u);
    }
    label(board, 'USB  |  UART', [31, 6, 0]);
    const btnMk = (z, nm, d) => {
      const b = group(mesh(box(3.5, 1.5, 4.5), MAT.steel, { y: 0.75 }), mesh(box(1.6, 0.9, 2.2), MAT.plasticBlack, { y: 1.9 }));
      b.position.set(21, 0, z);
      board.add(part(b, nm, d));
      return b;
    };
    btnMk(8.6, 'Nút BOOT (GPIO0)', 'Giữ BOOT + nhấn RST → vào chế độ nạp. Trong dự án: bấm = AUTO/DỪNG (PIN_BUTTON 0).');
    btnMk(-8.6, 'Nút RST (EN)', 'Kéo EN xuống 0 → khởi động lại chip.');
    const ldo = group(mesh(box(6.5, 1.6, 3.5), MAT.icBody, { y: 0.8 }), mesh(box(3, 0.3, 1.5), MAT.tin, { y: 0.15, z: -2.5 }));
    ldo.position.set(10, 0, -5);
    board.add(part(ldo, 'LDO 3.3 V (SOT-223)', 'Ổn áp tuyến tính 5 V → 3.3 V cho module. Tỏa nhiệt (5 − 3.3) × I.'));
    const bridge = mesh(box(4, 0.9, 4), MAT.icBody, { x: 10, y: 0.45, z: 5 });
    board.add(part(bridge, 'Chip USB-UART (CP2102N)', 'Chuyển USB thành UART0 (GPIO43/44) + mạch tự động nhấn BOOT/RST khi nạp.'));
    const rgbMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, emissive: 0x000000, emissiveIntensity: 1.5 });
    const rgb = mesh(box(2.2, 0.9, 2.2), rgbMat, { x: 15.5, y: 0.45, z: 0 });
    board.add(part(rgb, 'LED RGB WS2812 (GPIO48 / GPIO38)', 'LED có IC điều khiển bên trong, nhận dữ liệu nối tiếp 800 kHz trên 1 dây (thư viện NeoPixel / RMT).'));
    const pwrMat = new THREE.MeshStandardMaterial({ color: 0x441111, emissive: 0xff2020, emissiveIntensity: 1 });
    const pwrLed = mesh(box(1.6, 0.6, 0.8), pwrMat, { x: 15, y: 0.3, z: -8 });
    board.add(part(pwrLed, 'LED nguồn 3.3 V (đỏ)', 'Sáng khi LDO ra 3.3 V.'));

    // ---------- 2 hàng chân 22 pin ----------
    const pinMeshes = [];   // { m, grp, name, row, i }
    const hdrMat = MAT.plasticBlack;
    // nhìn từ trên, ăng-ten hướng lên: J1 bên TRÁI, J3 bên PHẢI (đúng board thật / bản vẽ DXF Espressif)
    const rows = [[J1, 11.43, 'J1'], [J3, -11.43, 'J3']];
    const pinWorld = {};
    const hdrBodies = [], pads = [];
    const pinLabels = new THREE.Group();
    root.add(pinLabels);
    for (const [tab, z, rn] of rows) {
      const hb = mesh(box(22 * 2.54, 2.5, 2.5), hdrMat, { y: BY - 1.6 - 1.25, z });
      hdrBodies.push(hb);
      root.add(part(hb, `Thân header ${rn}`, 'Nhựa giữ 22 chân bước 2.54 mm.'));
      tab.forEach(([g, grp, desc], i) => {
        const x = -26.67 + i * 2.54;
        const m = mesh(box(0.64, 11.6, 0.64), MAT.gold.clone(), { x, y: BY - 6.2 + 0.3, z });
        const nm = typeof g === 'number' ? `GPIO${g}` : g;
        part(m, `${rn} chân ${i + 1} — ${nm}`, desc);
        root.add(m);
        const pad = mesh(cyl(0.85, 0.85, 0.05, 12), MAT.gold, { x, y: BY + 0.03, z });
        root.add(pad);
        pads.push(pad);
        pinMeshes.push({ m, grp, nm, g, cadNode: `pin_${rn}_${i + 1}` });
        pinWorld[nm + (nm === 'GND' ? `_${rn}${i}` : '')] = [x, z];
        if (PROJECT_GROUPS.has(grp) || (grp === 'power' && nm !== '3V3')) label(pinLabels, nm.replace('GPIO', ''), [x, BY + 2.2, z + (z > 0 ? 2.2 : -2.2)]);
      });
    }
    const pinByName = (n) => pinMeshes.find((p) => p.nm === n);

    // ---------- dây ra ngoài (hiện theo bước lắp) ----------
    const wireStub = (n, color, dz) => {
      const [x, z] = pinWorld[n];
      const d = Math.sign(z) * Math.abs(dz);           // dây đi ra phía ngoài board
      return wire([[x, 0.2, z], [x, -3, z + d * 0.4], [x + 2, -6, z + d]], { radius: 0.45, color });
    };
    const wPower = group(wireStub('5V', 0xd23b3b, -8), wireStub('GND_J121', 0x111111, -8));
    const wUart = group(wireStub('GPIO17', 0x3b8ef0, -8), wireStub('GPIO18', 0x7fbfff, -8));
    const wPeri = group(wireStub('GPIO4', 0xff8c1a, -8), wireStub('GPIO5', 0xffd34d, -8), wireStub('GPIO8', 0xd65bd6, -8), wireStub('GPIO9', 0xb04ab0, -8));
    root.add(part(wPower, 'Dây 5V + GND từ buck XL4015', 'Đỏ → chân 5V, đen → GND.'), part(wUart, 'Dây UART tới BSS138', 'GPIO17 (TX) → LV2; GPIO18 (RX) ← LV1.'), part(wPeri, 'Dây quạt & MPU6050', 'GPIO4 PWM, GPIO5 FG, GPIO8 SDA, GPIO9 SCL.'));

    // ---------- vòng sóng BLE ----------
    const rings = [];
    for (let k = 0; k < 3; k++) {
      const rm = new THREE.MeshBasicMaterial({ color: [0x4cc2ff, 0x7fd3ff, 0xbfe9ff][k], transparent: true, opacity: 0, depthWrite: false });
      const r = mesh(new THREE.TorusGeometry(4, 0.25, 6, 40), rm, { castShadow: false, rx: Math.PI / 2 });
      r.position.set(-28.5, BY + 1.5, 0);
      r.raycast = () => {};          // sóng không chặn chuột khi rê lên board
      root.add(r);
      rings.push(r);
    }

    // ---------- mô hình CAD thật ESP32-S3-DevKitC-1 (build123d theo DXF Espressif) ----------
    // Khung GLB: USB ở −X, ăng-ten ở +X, J1 ở −Z, mặt dưới PCB y = 0, header lệch +3,2 mm theo X.
    // Xoay 180° quanh Y → USB về +X, ăng-ten −X, J1 về +Z (trùng mô hình học); dời +3,2 mm cho chân 1 trùng
    // x = −26,67; nâng 9,4 mm cho mặt trên PCB ở y = 11 như mô hình học.
    const cadPinParts = {};
    for (const [tab, rn] of [[J1, 'J1'], [J3, 'J3']]) tab.forEach(([g, grp, desc], i) => {
      cadPinParts[`pin_${rn}_${i + 1}`] = [`${rn} chân ${i + 1} — ${typeof g === 'number' ? 'GPIO' + g : g}`, desc];
    });
    const cadM = {};                 // mesh CAD dùng trong mô phỏng
    let cadPinMesh = [];             // song song với pinMeshes
    let btnBoot = null, btnRst = null, cadAntX = -31.5;
    const cad = cadAttach(ctx, root, 'boards/esp32-s3-devkitc-1', {
      onBottom: false, rotateY: Math.PI, offset: [3.2, BY - 1.6, 0],
      hide: [board, ...hdrBodies, ...pads, ...pinMeshes.map((pm) => pm.m)],
      labels: [['ESP32-S3-WROOM-1', 'U4_wroom1', [0, 4, 0]], ['USB  |  UART', 'conn_usb_uart_usbc', [0, 5, 6.7]], ['BOOT', 'btn_boot_sw', [0, 3, 0]], ['RST', 'btn_rst_sw', [0, 3, 0]]],
      partDefault: ['ESP32-S3-DevKitC-1 v1.1 (CAD thật)', 'Board phát triển 69,4 × 25,4 mm của Espressif: module WROOM-1, 2 cổng USB-C, nút BOOT/RST, LED RGB, 2 hàng header 22 chân.'],
      parts: {
        pcb: ['Bo mạch in (PCB) đen 1,6 mm', 'FR-4 nhiều lớp. Chữ in trắng (silkscreen) ghi tên từng chân ở hai mép — luôn dò theo chữ in này khi nối dây.'],
        silkscreen: ['Chữ in (silkscreen)', 'Tên chân, tên linh kiện in trắng trên PCB.'],
        U4_wroom1: ['Module ESP32-S3-WROOM-1 (N8R8)', '18 × 25,5 × 3,1 mm: chip ESP32-S3 + flash 8 MB + PSRAM 8 MB + thạch anh 40 MHz dưới vỏ chắn kim loại, ăng-ten mạch in ở đầu module (nhô ra khỏi PCB). Không đặt kim loại/dây trong vùng 15 mm quanh ăng-ten.'],
        hdr_J1_body: ['Thân header J1 (22 chân)', 'J1: 3V3, RST, GPIO4–18, 5V, GND… Nhựa giữ chân bước 2,54 mm.'],
        hdr_J3_body: ['Thân header J3 (22 chân)', 'J3: GND, TX/RX (GPIO43/44), GPIO0, LED RGB GPIO38/48, USB D+/D− (GPIO19/20)…'],
        conn_usb_uart_usbc: ['USB-C "UART"', 'Qua chip USB-UART (CP2102N) tới GPIO43/44 — cổng nạp & log quen thuộc (115200). Cũng cấp 5 V cho board.'],
        conn_usb_otg_usbc: ['USB-C "USB" (OTG gốc)', 'Nối thẳng GPIO19/20 của chip: nạp & debug qua USB-JTAG, hoặc làm thiết bị USB.'],
        btn_boot_sw: ['Nút BOOT (GPIO0)', 'Giữ BOOT + nhấn RST → vào chế độ nạp. Trong dự án: bấm = AUTO/DỪNG (PIN_BUTTON 0).'],
        btn_rst_sw: ['Nút RST (EN)', 'Kéo EN xuống 0 → khởi động lại chip.'],
        led_rgb_pkg: ['LED RGB WS2812 / SK68XXMINI (GPIO38)', 'LED có IC điều khiển bên trong, nhận dữ liệu nối tiếp 800 kHz trên 1 dây (thư viện NeoPixel / RMT). Board v1.0 nối GPIO48.'],
        led_pwr_pkg: ['LED nguồn 3.3 V (đỏ)', 'Sáng khi LDO ra 3.3 V — tắt nghĩa là board không có điện hoặc LDO hỏng.'],
        U3_CP2102N: ['Chip USB-UART CP2102N', 'Chuyển USB thành UART0 (GPIO43/44); cùng 2 transistor Q1/Q2 tự động nhấn BOOT/RST khi nạp.'],
        U2_SGM2212: ['LDO 3.3 V (SOT-223)', 'Ổn áp tuyến tính 5 V → 3.3 V cho module. Tỏa nhiệt (5 − 3.3) × I.'],
        'D_ESD*': ['Diode chống tĩnh điện (ESD)', 'Bảo vệ đường USB D+/D− khi cắm rút cáp.'],
        ...cadPinParts,
      },
      onLoad(c) {
        c.tag(/^Q\d+_L8050$/, 'Transistor tự nạp (L8050)', 'Cặp transistor nối DTR/RTS của CP2102N với EN và GPIO0 → esptool tự đưa chip vào chế độ nạp, không cần bấm nút.');
        c.tag(/^D\d+_1N5819$/, 'Diode Schottky 1N5819', 'Chặn dòng ngược giữa nguồn USB và chân 5V. Vẫn không nên cấp 2 nguồn 5 V cùng lúc.');
        c.tag(/^C\d+$/, 'Tụ lọc SMD', 'Tụ gốm lọc nguồn 3.3 V / 5 V sát chân linh kiện.');
        c.tag(/^R\d+$/, 'Điện trở SMD', 'Điện trở kéo lên / hạn dòng LED.');
        const meshOf = (n) => { const a = []; c.node(n)?.traverse((o) => { if (o.isMesh) { ownMaterial(o); a.push(o); } }); return a; };
        cadM.rgb = meshOf('led_rgb'); cadM.pwr = meshOf('led_pwr');
        cadM.shield = c.node('U4_wroom1'); cadM.usbUart = c.node('conn_usb_uart_usbc'); cadM.diode = c.node('D1_1N5819');
        cadPinMesh = pinMeshes.map((pm) => meshOf(pm.cadNode));
        btnBoot = c.slide('btn_boot', [0, -1, 0]);
        btnRst = c.slide('btn_rst', [0, -1, 0]);
        const bb = new THREE.Box3().setFromObject(c.node('U4_wroom1'));
        const p0 = root.worldToLocal(bb.min.clone());
        cadAntX = p0.x + 3;
      },
    });
    const setEm = (list, r, g, b, k) => { for (const o of list || []) { if (o.userData._preHeat) continue; o.material.emissive.setRGB(r, g, b); o.material.emissiveIntensity = k; } };

    // ---------- khung UART DRIVE (theo docs/02) ----------
    const L_PM = 450, R_PM = 450;
    const frame = [0xaa, 4, 0x01, L_PM & 0xff, (L_PM >> 8) & 0xff, R_PM & 0xff, (R_PM >> 8) & 0xff];
    frame.push(frame.slice(1).reduce((a, b) => a ^ b, 0));
    const bits = [];
    frame.forEach((b) => { bits.push(0); for (let k = 0; k < 8; k++) bits.push((b >> k) & 1); bits.push(1); });

    let fault = null, fT = 0, dead = false, gpio18Dead = false, step = -1, advCount = 0, lastAdv = -1, smoked = false;
    const STEP_HL = [null, new Set(['5V', 'GND']), new Set(['GPIO17', 'GPIO18', 'GND']), new Set(['GPIO4', 'GPIO5', 'GPIO8', 'GPIO9', 'GPIO0']), null];
    const col = new THREE.Color();

    return {
      object: root,
      setStep(i) { step = i; },
      triggerFault(id) {
        fault = id; fT = 0; smoked = false;
        if (id === '5v-vao-3v3') { dead = true; fx.flash(modG, { size: 30, color: 0xffe0a0 }); fx.sparks(shield, { count: 30, speed: 30, size: 0.5 }); }
      },
      resetFault() { fault = null; dead = false; gpio18Dead = false; smoked = false; },
      update(dt, t, p) {
        fT += dt;
        const cadOn = cad.sync(p);
        // ---- tháo lắp: dây theo bước ----
        const s = step;
        wPower.visible = s < 0 || s >= 1;
        wUart.visible = s < 0 || s >= 2;
        wPeri.visible = s < 0 || s >= 3;
        const hl = s >= 0 ? STEP_HL[Math.min(s, STEP_HL.length - 1)] : null;

        // ---- sự cố ----
        const booted = !dead && fault !== 'strapping' && !(fault === 'psram-pin' && (fT % 4) > 2.5);
        if (fault === '5v-vao-gpio') {
          const pm = cadOn ? cad.node('pin_J1_11') : pinByName('GPIO18').m;
          fx.heat(pm, Math.min(0.8, fT / 6));
          if (fT > 4) gpio18Dead = true;
        }
        const shieldObj = cadOn && cadM.shield ? cadM.shield : shield;
        if (fault === '5v-vao-3v3') {
          fx.heat(shieldObj, Math.min(1, fT / 1.5));
          if (fT > 1 && !smoked) { smoked = true; fx.smoke(shieldObj, { size: 12, duration: 6, color: 0xbdbdbd }); fx.scorch(shieldObj, 0.5); }
        }
        if (fault === 'hai-nguon') {
          fx.heat(cadOn && cadM.usbUart ? cadM.usbUart : usbs[1], 0.25 + 0.1 * Math.sin(t * 3));
          if (cadOn && cadM.diode) fx.heat(cadM.diode, 0.5 + 0.2 * Math.sin(t * 3));   // diode Schottky chịu dòng ngược nóng lên
        }
        // ---- nút bấm CAD: BOOT kẹt khi sự cố strapping; bước nạp: giữ BOOT, nhấn-thả RST ----
        if (cadOn) {
          const nap = step === 4 && (t % 3) < 2;
          btnBoot?.set(fault === 'strapping' || nap ? -0.4 : 0);
          btnRst?.set(step === 4 && (t % 3) > 0.6 && (t % 3) < 1.1 ? -0.4 : 0);
        }

        // ---- tô màu chân ----
        for (const pm of pinMeshes) {
          const c = PIN_COLORS[pm.grp] ?? LOCAL_COLORS[pm.grp] ?? 0x9aa1ab;
          let show = true;
          if (hl) show = hl.has(pm.nm);
          else if (p.group === 'project') show = PROJECT_GROUPS.has(pm.grp) && !(pm.grp === 'rgb' && ((p.rev === 'v10') !== (pm.g === 48)));
          else if (p.group === 'avoid') show = pm.grp === 'avoid' || pm.grp === 'boot';
          else if (p.group === 'power') show = pm.grp === 'power' || pm.grp === 'ground';
          else if (p.group === 'free') show = pm.grp === 'free';
          col.setHex(c);
          if (!show) col.multiplyScalar(0.15);
          pm.m.material.color.copy(col);
          if (!pm.m.userData._preHeat) pm.m.material.emissive.setRGB(0, 0, 0);
          if (cadOn) for (const o of cadPinMesh[pinMeshes.indexOf(pm)] || []) {
            o.material.color.copy(col);
            o.material.metalness = 0.5;
            if (!o.userData._preHeat) o.material.emissive.setRGB(0, 0, 0);
          }
        }

        // ---- demo ----
        let tx = 3.3, pwm = 0, rf = 0, active = '—';
        const on = booted;
        // LED nguồn
        pwrMat.emissiveIntensity = dead ? 0 : 1.2;
        // BLE quảng bá (100 ms → 1 s), 3 gói trên kênh 37/38/39
        const advPh = t % 1;
        if (on && (p.demo === 'ble' || p.demo === 'none' || p.demo === 'rgb' || p.demo === 'fan' || p.demo === 'uart')) {
          if (advPh < 0.24) rf = Math.floor(advPh / 0.08) < 3 && (advPh % 0.08) < 0.06 ? 1 : 0;
          const n = Math.floor(t);
          if (n !== lastAdv) { lastAdv = n; advCount++; }
        }
        if (cadOn) {
          // chân đang có tín hiệu sáng lên (GPIO4 PWM, GPIO17 TX mức 1)
          const lit = (nm, v) => { const i = pinMeshes.findIndex((q) => q.nm === nm); setEm(cadPinMesh[i], 1, 0.8, 0.2, v ? 0.9 : 0); };
          if (p.demo === 'fan') lit('GPIO4', on && (t * 2) % 1 < p.duty / 100);
          if (p.demo === 'uart') lit('GPIO17', on && Math.floor((t * 20) % (bits.length + 20)) < bits.length && bits[Math.floor((t * 20) % (bits.length + 20))]);
          if (p.demo === 'rgb') lit(`GPIO${p.rev === 'v10' ? 48 : 38}`, on);
        }
        rings.forEach((r, k) => {
          r.position.x = cadOn ? cadAntX : -28.5;
          const age = advPh - k * 0.08;
          const vis = on && p.demo === 'ble' && age > 0 && age < 0.9;
          r.visible = vis;
          if (vis) { const sc = 1 + age * 9; r.scale.set(sc, sc, sc); r.material.opacity = 0.75 * (1 - age / 0.9); }
        });
        if (on && p.demo === 'fan') {
          pwm = (t * 2) % 1 < p.duty / 100 ? 3.3 : 0;
          active = `GPIO4 LEDC duty ${Math.round((p.duty / 100) * 255)}/255`;
        }
        if (on && p.demo === 'uart') {
          const k = Math.floor((t * 20) % (bits.length + 20));
          tx = k < bits.length ? bits[k] * 3.3 : 3.3;
          const bi = Math.floor(k / 10);
          active = k < bits.length ? `GPIO17 → byte ${bi + 1}/8 = 0x${frame[bi].toString(16).toUpperCase().padStart(2, '0')}` : 'GPIO17 nghỉ (mức 1) — khung DRIVE kế tiếp sau 50 ms';
        }
        if (p.demo === 'ble') active = on ? `Quảng bá "RoboVac-PIC" · NUS 6E400001-…` : '—';
        // LED RGB
        if (on && p.demo === 'rgb') { col.setHSL((t * 0.2) % 1, 1, 0.5); rgbMat.emissive.copy(col); active = `GPIO${p.rev === 'v10' ? 48 : 38} → WS2812 (RMT 800 kHz)`; }
        else if (on && p.demo === 'ble') rgbMat.emissive.setRGB(0, 0, advPh < 0.1 ? 1 : 0.08);
        else rgbMat.emissive.setRGB(0, 0, 0);
        if (cadOn) {
          // thấu kính LED: đổi cả màu nền (nền trắng + phát sáng màu sẽ bị "cháy" thành trắng)
          const e = rgbMat.emissive, lit = e.r + e.g + e.b > 0.05;
          for (const o of cadM.rgb || []) {
            if (o.userData._ledBase === undefined) o.userData._ledBase = o.material.color.getHex();
            if (lit) o.material.color.setRGB(e.r * 0.6, e.g * 0.6, e.b * 0.6); else o.material.color.setHex(o.userData._ledBase);
          }
          setEm(cadM.rgb, e.r, e.g, e.b, 1.4);
          setEm(cadM.pwr, 1, 0.1, 0.1, dead ? 0 : 2);
        }

        // ---- dòng & nhiệt LDO ----
        let iMa = dead ? 900 : !booted ? 25 : 45;
        if (on && rf) iMa += 85;
        if (on && p.demo === 'rgb') iMa += 30;
        if (fault === '5v-vao-gpio' && !gpio18Dead) iMa += 25;
        const pLdo = dead ? 0 : (5 - 3.3) * iMa;

        let st = '✓ Đang chạy firmware';
        if (dead) st = '🔥 Chip/flash cháy — 5 V vào đường 3.3 V';
        else if (fault === 'strapping') st = '⛔ GPIO0 = 0 lúc reset → "waiting for download"';
        else if (fault === 'psram-pin') st = (fT % 4) > 2.5 ? '💥 Guru Meditation Error (Cache error) → reset' : '⚠️ Chạy… sắp crash (GPIO35 là đường PSRAM)';
        else if (fault === '5v-vao-gpio') st = gpio18Dead ? '⚡ GPIO18 đã hỏng — không nhận được STATUS từ PIC' : '⚠️ Dòng chảy qua diode bảo vệ GPIO18 (~30 mA)';
        else if (fault === 'hai-nguon') st = '⚠️ Hai nguồn 5 V đánh nhau qua cổng USB';
        readout('cpu', booted ? '2 nhân Xtensa LX7 · 240 MHz' : dead ? '—' : 'ROM bootloader');
        readout('ble', booted ? `Quảng bá ${advCount} lần · kênh 37/38/39` : 'tắt');
        readout('pin', active);
        readout('i', iMa);
        readout('ldo', pLdo);
        readout('state', st);
        return [on ? tx : 0, on ? pwm : 0, on ? rf : 0];
      },
    };
  },
};
