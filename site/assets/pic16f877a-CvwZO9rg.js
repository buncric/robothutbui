const n=`// 🧠 PIC16F877A — linh kiện mẫu: 40 chân đúng sơ đồ dự án (docs/01), mở nắp xem lõi, chạy thử chương trình.

import { cadAttach, ownMaterial } from '../../core/cadParts.js';

// [chân, tên đầy đủ, nhóm, vai trò trong robot]
const PINS = [
  [1, 'MCLR/VPP', 'icsp', 'Reset — điện trở 10 kΩ kéo lên 5V; cũng là chân VPP khi nạp'],
  [2, 'RA0/AN0', 'adc', 'Đo điện áp pin qua phân áp 33k/10k'],
  [3, 'RA1/AN1', 'adc', 'Cảm biến chống rơi #1 (trái)'],
  [4, 'RA2/AN2', 'adc', 'Cảm biến chống rơi #2'],
  [5, 'RA3/AN3', 'adc', 'Cảm biến chống rơi #3'],
  [6, 'RA4/T0CKI', 'input', 'Encoder bánh TRÁI → Timer0 đếm xung (chân open-drain, cần trở kéo lên)'],
  [7, 'RA5/AN4', 'adc', 'Cảm biến chống rơi #4 (phải)'],
  [8, 'RE0/AN5', 'spare', 'Dự phòng'],
  [9, 'RE1/AN6', 'spare', 'Dự phòng'],
  [10, 'RE2/AN7', 'spare', 'Dự phòng'],
  [11, 'VDD', 'power', '+5V — tụ 100 nF sát chân'],
  [12, 'VSS', 'ground', 'GND'],
  [13, 'OSC1/CLKI', 'osc', 'Thạch anh 20 MHz + tụ 22 pF xuống GND'],
  [14, 'OSC2/CLKO', 'osc', 'Thạch anh 20 MHz + tụ 22 pF xuống GND'],
  [15, 'RC0/T1CKI', 'input', 'Encoder bánh PHẢI → Timer1 đếm xung'],
  [16, 'RC1/CCP2', 'pwm', 'PWM 20 kHz bánh PHẢI → 74HC32 (chân 9, 12) → DRV8871 phải'],
  [17, 'RC2/CCP1', 'pwm', 'PWM 20 kHz bánh TRÁI → 74HC32 (chân 1, 4) → DRV8871 trái'],
  [18, 'RC3/SCK/SCL', 'spare', 'Dự phòng (I2C SCL)'],
  [19, 'RD0', 'output', 'DIR bánh TRÁI → 74HC32 chân 5 (IN2 = PWM OR DIR)'],
  [20, 'RD1', 'output', 'nDIR bánh TRÁI (= NOT RD0) → 74HC32 chân 2 (IN1 = PWM OR nDIR)'],
  [21, 'RD2', 'output', 'DIR bánh PHẢI → 74HC32 chân 13'],
  [22, 'RD3', 'output', 'nDIR bánh PHẢI → 74HC32 chân 10'],
  [23, 'RC4/SDI/SDA', 'spare', 'Dự phòng (I2C SDA)'],
  [24, 'RC5/SDO', 'spare', 'Dự phòng'],
  [25, 'RC6/TX', 'uart', 'UART TX 19200 → (BSS138) → ESP32 GPIO18'],
  [26, 'RC7/RX', 'uart', 'UART RX ← (BSS138) ← ESP32 GPIO17 — cần ≥ 4.0 V mới hiểu là mức 1'],
  [27, 'RD4', 'output', 'Bật LED hồng ngoại cảm biến chống rơi'],
  [28, 'RD5', 'output', 'MOSFET chổi cuộn'],
  [29, 'RD6', 'output', 'MOSFET chổi cạnh'],
  [30, 'RD7', 'output', 'LED trạng thái'],
  [31, 'VSS', 'ground', 'GND'],
  [32, 'VDD', 'power', '+5V — tụ 100 nF sát chân'],
  [33, 'RB0/INT', 'input', 'Nút START (chế độ PIC tự chạy)'],
  [34, 'RB1', 'input', 'Công tắc nhấc bánh trái'],
  [35, 'RB2', 'input', 'Công tắc nhấc bánh phải'],
  [36, 'RB3/PGM', 'spare', 'Để trống (fuse NOLVP)'],
  [37, 'RB4', 'input', 'Bumper trái'],
  [38, 'RB5', 'input', 'Bumper phải'],
  [39, 'RB6/PGC', 'icsp', 'Xung nhịp nạp ICSP — không nối tải'],
  [40, 'RB7/PGD', 'icsp', 'Dữ liệu nạp ICSP — không nối tải'],
];

const GROUP_NAMES = {
  all: 'Tất cả', power: 'Nguồn VDD', ground: 'GND', osc: 'Dao động', pwm: 'PWM', adc: 'Analog (ADC)',
  uart: 'UART', icsp: 'Nạp ICSP', input: 'Vào số (cảm biến)', output: 'Ra số (điều khiển)', spare: 'Dự phòng',
};

export default {
  id: 'pic16f877a',
  name: 'Vi điều khiển PIC16F877A',
  category: 'dieu-khien',
  order: 1,
  icon: '🧠',
  summary: '"Tủy sống" của robot: 8-bit, 20 MHz, 40 chân. Rê chuột lên từng chân để biết nó nối vào đâu trong robot. Mở nắp để xem lõi silicon và dây vàng bên trong.',
  tags: ['PIC', 'MCU', 'vi điều khiển', 'Microchip', 'DIP40', 'CCS'],

  params: [
    { id: 'cad', label: '🧊 Mô hình CAD thật (PIC16F877A-I/P + đế 40 chân)', type: 'toggle', value: true, hint: 'Tắt = mô hình học tự dựng. Tô màu chân, mở nắp, chạy thử vẫn dùng được trên cả hai.' },
    { id: 'group', label: 'Làm nổi nhóm chân', type: 'select', value: 'all', options: Object.entries(GROUP_NAMES) },
    { id: 'color', label: 'Tô màu chân theo chức năng', type: 'toggle', value: true },
    { id: 'open', label: 'Mở nắp xem lõi (die)', type: 'toggle', value: false },
    { id: 'demo', label: 'Chạy thử chương trình', type: 'select', value: 'blink', options: [
      ['none', '— Không chạy'], ['blink', 'Nháy LED trạng thái (RD7)'], ['pwm', 'PWM 2 bánh (CCP1/CCP2)'], ['uart', 'Gửi byte 0xAA qua UART (TX)'],
    ] },
    { id: 'duty', label: 'Duty PWM (tốc độ bánh)', type: 'range', min: 0, max: 100, step: 1, value: 40, unit: '%' },
  ],
  readouts: [
    { id: 'clk', label: 'Thạch anh / chu kỳ lệnh', unit: '' },
    { id: 'high', label: 'Số chân đang ở mức 1', unit: 'chân' },
    { id: 'reg', label: 'Thanh ghi đang thay đổi', unit: '' },
    { id: 'st', label: 'Tình trạng chip', unit: '' },
    { id: 'temp', label: 'Nhiệt độ vỏ', unit: '°C' },
  ],
  steps: [
    { title: 'Bước 1 — Kiểm tra trước khi cắm', text: 'Đã <b>tắt nguồn</b>? Đo 5V ở chân 11/32 và GND ở 12/31 của <b>đế trống</b> trước. Xác định <b>khấc</b> trên chip và trên đế (in trên PCB).' },
    { title: 'Bước 2 — Nắn chân', text: 'Chân DIP mới xòe ra ~10°. Đặt nghiêng chip, tì cả hàng chân lên mặt bàn, ép nhẹ cho vuông góc — làm cả 2 hàng. Không bẻ từng chân.' },
    { title: 'Bước 3 — Căn khấc & đặt lên đế', text: '<b>Khấc chip trùng khấc đế</b> (chân 1 ↔ lỗ 1). Đặt hờ, nhìn ngang xem mọi chân đã vào đúng lỗ, không chân nào gập ra ngoài/gập vào bụng.' },
    { title: 'Bước 4 — Ấn đều tay', text: 'Ấn bằng ngón cái vào giữa thân chip cho tới khi sát đế. Lật mạch kiểm tra không có chân nào bị gập dưới bụng chip.' },
    { title: 'Bước 5 — Tháo chip ra', text: 'Dùng tua vít dẹt / kìm nhổ IC nạy <b>luân phiên hai đầu</b>, mỗi lần một chút, để chip lên đều. Nạy một đầu → cong gãy chân đầu kia.' },
  ],
  faults: [
    { id: 'cam-nguoc', label: 'Cắm chip ngược chiều (xoay 180°)', severity: 'chay',
      what: '<p>Cấp nguồn → chip <b>nóng bỏng tay trong 2–5 giây</b>, có mùi khét, có thể nứt vỏ; nguồn bàn nhảy sang giới hạn dòng. Không chân nào hoạt động.</p>',
      why: '<p>Xoay 180° thì chân n nằm vào lỗ n+20: hai lỗ VDD (11, 32) gặp chân VSS (31, 12) và ngược lại → nguồn bị <b>đặt ngược</b> vào chip. Các diode bảo vệ/đế chip dẫn thẳng, dòng hàng trăm mA–vài A, <code>P = U·I</code> vài watt dồn vào mẩu silicon 4 mm.</p>',
      fix: '<p>Luôn căn khấc; vẽ/in hình khấc lên PCB; lần đầu cấp nguồn dùng <b>nguồn bàn giới hạn 100 mA</b> (PIC chạy chỉ ~5–15 mA). Rút nguồn ngay khi dòng bất thường. Chip đã nóng như vậy thường hỏng — thay chip.</p>' },
    { id: 'qua-ap', label: 'Cấp 12 V vào VDD (quên mạch hạ áp)', severity: 'no',
      what: '<p>Chip nóng cực nhanh, có thể nứt/bật mảnh vỏ, khói; các chân I/O nối ra ESP32/cảm biến cũng mang điện áp cao gây hỏng dây chuyền.</p>',
      why: '<p>Giới hạn tuyệt đối VDD của PIC16F877A là <b>−0.3…+7.5 V</b>. Vượt ngưỡng → lớp oxide cổng transistor bị đánh thủng, chập VDD–VSS bên trong.</p>',
      fix: '<p>Chỉnh buck XL4015 ra đúng 5.0 V <b>bằng đồng hồ trước khi nối tải</b>; thêm diode TVS 5.6 V/zener + cầu chì ở đầu vào 5V; đặt dây nguồn khác màu/khác đầu nối giữa 5V và VBAT.</p>' },
    { id: 'thieu-mclr', label: 'Quên điện trở 10 kΩ kéo MCLR lên 5V', severity: 'loi',
      what: '<p>Chương trình chạy chập chờn: lúc chạy lúc đứng, LED nháy lung tung, chạm tay vào mạch là reset. Robot thỉnh thoảng tự dừng giữa chừng.</p>',
      why: '<p>MCLR là chân <b>reset tích cực mức thấp</b>. Để hở (thả nổi) thì nó nhận nhiễu, khi điện áp rơi xuống dưới ngưỡng là chip reset.</p>',
      fix: '<p>Trở 10 kΩ từ MCLR lên VDD (+ tụ 100 nF xuống GND nếu môi trường nhiễu động cơ). Chân này cũng nối header ICSP để nạp.</p>' },
    { id: 'lvp', label: 'Để fuse LVP bật, RB3 thả nổi', severity: 'loi',
      what: '<p>Chip thỉnh thoảng "đơ" hẳn — không chạy, không reset được bằng nút, phải tắt nguồn bật lại.</p>',
      why: '<p>Khi LVP (Low Voltage Programming) bật, chân RB3/PGM lên mức 1 sẽ đưa chip vào chế độ nạp. Chân thả nổi nhận nhiễu → vào chế độ nạp ngẫu nhiên.</p>',
      fix: '<p><code>#fuses NOLVP</code> (đã có trong firmware dự án), và nối RB3 xuống GND qua 10 kΩ hoặc để làm output mức 0.</p>' },
    { id: 'qua-dong-chan', label: 'Nối động cơ/relay thẳng vào chân RD7', severity: 'hong',
      what: '<p>Động cơ không quay hoặc giật yếu, chân RD7 nóng, chip reset do sụt áp; lâu dần chân RD7 chết (luôn 0 hoặc luôn 1), có khi kéo chết cả PORTD.</p>',
      why: '<p>Mỗi chân PIC chỉ chịu <b>25 mA</b> (cả chip tối đa ~200 mA). Động cơ cần 300 mA–2 A, cuộn relay 70 mA, lại sinh xung ngược khi ngắt.</p>',
      fix: '<p>Chân PIC chỉ <b>điều khiển</b>: qua transistor/MOSFET logic-level (IRLZ44N) + diode chống ngược, hoặc qua driver DRV8871 như dự án.</p>' },
    { id: 'thach-anh', label: 'Thạch anh không dao động (thiếu tụ 22 pF / để xa chân)', severity: 'loi',
      what: '<p>Nạp chương trình thành công nhưng <b>không chạy gì cả</b>: LED tắt, UART câm. Đo chân 13/14 không thấy sóng.</p>',
      why: '<p>Mạch dao động Pierce cần 2 tụ tải ~15–33 pF và đường dây ngắn; sai tụ hoặc dây dài (điện dung ký sinh, nhiễu) → không đủ điều kiện dao động. Fuse <code>HS</code> sai thành <code>XT</code> cũng gây lỗi này ở 20 MHz.</p>',
      fix: '<p>Đặt thạch anh + 2 tụ 22 pF sát chân 13/14, tụ về GND gần chân 12; dùng fuse HS. Thử nạp chương trình nháy LED trước tiên.</p>' },
  ],
  scope: {
    window: 4,
    note: '(đã làm chậm: PWM thật 20 kHz, UART thật 19200 bit/s)',
    channels: [
      { name: 'Chân 30 RD7', unit: 'V', min: -0.5, max: 5.5, color: '#ffd34d' },
      { name: 'Chân 17 CCP1', unit: 'V', min: -0.5, max: 5.5, color: '#ff8c1a' },
      { name: 'Chân 25 TX', unit: 'V', min: -0.5, max: 5.5, color: '#4cc2ff' },
    ],
  },

  info: {
    overview: \`
      <p><b>PIC16F877A</b> của Microchip là vi điều khiển 8-bit "kinh điển" trong các trường kỹ thuật Việt Nam. Trong robot, nó làm phần việc <b>thời gian thực & an toàn</b>: phát PWM cho 2 bánh, đếm encoder, đọc bumper/cảm biến chống rơi/pin, và tự dừng động cơ khi có nguy hiểm — kể cả khi ESP32 bị treo.</p>
      <p>Thử: chọn <b>Làm nổi nhóm chân → PWM</b>, rồi <b>Chạy thử → PWM 2 bánh</b> và kéo Duty.</p>\`,
    specs: [
      ['Lõi', '8-bit RISC, 35 lệnh, kiến trúc Harvard'],
      ['Xung nhịp', 'Tối đa 20 MHz → 1 lệnh = 4 xung = 0.2 µs (5 triệu lệnh/giây)'],
      ['Bộ nhớ', 'Flash 8K word (14 KB) · RAM 368 byte · EEPROM 256 byte'],
      ['I/O', '33 chân (PORTA 6, PORTB 8, PORTC 8, PORTD 8, PORTE 3); 25 mA mỗi chân'],
      ['Ngoại vi', 'ADC 10-bit 8 kênh · 2 CCP (Capture/Compare/PWM) · Timer0 8-bit, Timer1 16-bit, Timer2 8-bit · USART · MSSP (SPI/I2C) · 2 bộ so sánh'],
      ['Điện áp', '2.0–5.5 V (dùng 5 V để chạy 20 MHz)'],
      ['Vỏ', 'DIP-40 (cắm đế), cũng có TQFP-44/PLCC-44'],
      ['Ngăn xếp (stack)', 'Chỉ 8 tầng — không gọi hàm lồng nhau quá sâu, không đệ quy'],
    ],
    principle: \`
      <h4>Mọi thứ là thanh ghi</h4>
      <p>Muốn chân là đầu ra: ghi <code>TRISx</code> bit = 0. Muốn xuất mức 1: ghi <code>PORTx</code> bit = 1. Trong CCS C, <code>output_high(PIN_D7)</code> làm cả hai việc.</p>
      <h4>Ngoại vi chạy song song với CPU</h4>
      <ul>
        <li><b>Timer2 + CCP1/CCP2</b> tự phát PWM: <code>PR2 = 249</code>, chia 1 → 20 MHz/4/250 = <b>20 kHz</b>, duty 0…1000 = 0…100 %.</li>
        <li><b>Timer0/Timer1</b> đếm xung encoder bằng phần cứng — CPU chỉ cần đọc số đếm mỗi 1 ms.</li>
        <li><b>USART</b> gửi/nhận từng byte; ngắt <code>#int_rda</code> báo khi có byte mới.</li>
        <li><b>ADC</b> 10-bit: 0…5 V → 0…1023; clock phải là Fosc/32 ở 20 MHz.</li>
      </ul>
      <h4>Mở nắp</h4>
      <p>Bên trong vỏ nhựa đen chỉ là một mẩu silicon vài mm² (die). Các dây vàng siêu mảnh (bond wire, ~25 µm) nối die ra khung chân kim loại.</p>\`,
    inRobot: \`
      <p>Sơ đồ chân trong mô hình này chính là sơ đồ của dự án (<code>docs/01_KIEN_TRUC_VA_SO_DO_CHAN.md</code>). Firmware: <code>firmware/pic16f877a_ccs/</code>.</p>
      <ul>
        <li>Mạch tối thiểu: VDD/VSS + tụ 100 nF, thạch anh 20 MHz + 2 tụ 22 pF, trở 10 kΩ MCLR, header ICSP 6 chân.</li>
        <li>Giao tiếp ESP32 qua UART + mạch chuyển mức BSS138 (ESP32 chạy 3.3 V).</li>
      </ul>\`,
    mistakes: \`
      <ul>
        <li>Quên trở 10 kΩ kéo MCLR lên 5 V → chip reset liên tục, không chạy.</li>
        <li>Để fuse LVP bật → chân RB3 thả nổi làm chip vào chế độ nạp ngẫu nhiên.</li>
        <li>Quên <code>setup_adc_ports()</code>/ADCON1 → PORTA/PORTE vẫn là analog, đọc chân số luôn ra 0.</li>
        <li>Cắm thẳng TX của ESP32 (3.3 V) vào RX của PIC → lúc được lúc không (cần ≥ 4.0 V).</li>
        <li>Lấy dòng > 25 mA từ một chân (bật thẳng động cơ/relay) → hỏng chân. Luôn qua transistor/MOSFET/driver.</li>
        <li>Nối tải vào RB6/RB7 → không nạp được chương trình.</li>
      </ul>\`,
    quiz: [
      { q: 'Thạch anh 20 MHz thì một lệnh PIC mất bao lâu?', a: '4 xung / 20 MHz = 0.2 µs.' },
      { q: 'PIC16F877A có mấy kênh PWM phần cứng? Dự án dùng chúng cho gì?', a: '2 kênh (CCP1, CCP2) — dùng cho 2 bánh xe. Quạt hút do ESP32 phát PWM.' },
      { q: 'Muốn đếm xung encoder mà không tốn CPU, dùng chân nào?', a: 'T0CKI (RA4) cho Timer0 và T1CKI (RC0) cho Timer1 — bộ đếm phần cứng.' },
    ],
  },

  build(ctx) {
    const { THREE, MAT, PIN_COLORS, geom, label, readout, fx } = ctx;
    const { mesh, part, box, dipPackage, wire } = geom;
    const root = new THREE.Group();
    const dip = dipPackage(40, {});
    const chip = new THREE.Group();          // chip có thể nhấc/xoay khi tháo lắp
    chip.add(dip.group);
    root.add(chip);
    // đế IC 40 chân (lỗ tròn) bên dưới
    const socket = mesh(box(dip.len + 1.5, 3.4, 17.5, 0.4), MAT.plasticBlack, { y: -1.0 });
    const sockNotch = mesh(box(1.6, 0.3, 4), MAT.plasticDark, { x: -dip.len / 2 - 0.2, y: 0.72 });
    const sockGroup = geom.group(socket, sockNotch);
    root.add(part(sockGroup, 'Đế IC 40 chân', 'Hàn đế lên mạch, chip cắm vào đế → thay chip dễ, không làm nóng chip khi hàn. Khấc trên đế phải trùng khấc chip.'));

    // vỏ: tách material riêng để làm trong suốt khi "mở nắp"
    const bodyMat = MAT.icBody.clone();
    bodyMat.transparent = true;
    dip.body.material = bodyMat;
    part(dip.body, 'Vỏ epoxy đen (DIP-40)', 'Nhựa epoxy đúc bọc lấy lõi silicon và khung chân. Khấc tròn ở đầu đánh dấu phía chân 1.');
    label(chip, 'PIC16F877A-I/P', [0, 5.2, 0]);
    label(root, 'Khấc → chân 1', [-dip.len / 2 - 4, 4.6, 6]);

    // chân: mỗi chân 1 material riêng để tô màu / phát sáng
    const pinMats = [];
    dip.pins.forEach((pg, i) => {
      const [n, name, grp, use] = PINS[i];
      const m = MAT.tin.clone();
      pg.traverse((o) => { if (o.isMesh) o.material = m; });
      pinMats.push(m);
      part(pg, \`Chân \${n} — \${name}\`, \`<i>\${GROUP_NAMES[grp]}</i><br>\${use}\`);
      const out = pg.position.z > 0 ? 1 : -1;
      label(pg, \`\${n} \${name.split('/')[0]}\`, [0, -1.5, out * 4.2]);
    });

    // lõi bên trong (ẩn cho tới khi mở nắp)
    const inside = new THREE.Group();
    inside.visible = false;
    const frame = mesh(box(9, 0.2, 9), MAT.tin, { y: 2.3 });
    const die = mesh(box(4.6, 0.35, 4.6), MAT.silicon, { y: 2.55 });
    inside.add(part(frame, 'Đế gắn die (lead frame paddle)', 'Tấm kim loại giữ die, cũng giúp tản nhiệt.'));
    inside.add(part(die, 'Lõi silicon (die) ~4.6 mm', 'Hàng trăm nghìn transistor: CPU, Flash, RAM, ADC, Timer… tất cả nằm trên mẩu silicon này.'));
    dip.pins.forEach((pg) => {
      const end = [pg.position.x * 0.92, 2.0, pg.position.z > 0 ? 5.2 : -5.2];
      const start = [pg.position.x * 0.07, 2.75, pg.position.z > 0 ? 2.2 : -2.2];
      const mid = [(start[0] + end[0]) / 2, 3.6, (start[2] + end[2]) / 2];
      inside.add(wire([start, mid, end], { radius: 0.05, color: 0xf2c14e }));
    });
    part(inside, 'Dây bond vàng', 'Dây vàng Ø ~25 µm hàn siêu âm từ pad trên die ra từng chân.');
    chip.add(inside);

    // ---------- mô hình CAD thật ----------
    // boards/pic16f877a-dip40: khung GLB trùng khung tự dựng (chân 1 ở x = −24,13, z = +7,6; khấc ở đầu −X)
    // → đặt thẳng trong \`chip\` (nhấc/xoay khi tháo lắp, cắm ngược đều theo). Chỉ ẩn lưới (mesh) của chân tự dựng,
    // giữ nhóm chân để nhãn số chân vẫn hiện trên mô hình CAD.
    const procPinMeshes = [];
    dip.pins.forEach((pg) => pg.children.forEach((o) => { if (o.isMesh) procPinMeshes.push(o); }));
    const dipNotches = dip.group.children.filter((o) => o.isMesh && o !== dip.body);
    const pinParts = {};
    PINS.forEach(([n, name, grp, use]) => { pinParts['pin_' + n] = [\`Chân \${n} — \${name}\`, \`<i>\${GROUP_NAMES[grp]}</i><br>\${use}\`]; });
    let cadPins = [], cadBody = null;
    const cad = cadAttach(ctx, chip, 'boards/pic16f877a-dip40', {
      onBottom: false,
      hide: [dip.body, ...dipNotches, ...procPinMeshes],
      partDefault: ['PIC16F877A-I/P (CAD thật)', 'Vỏ PDIP-40 600 mil đúng bản vẽ Microchip DS39582: dài 52,3 mm, hai hàng chân cách 15,24 mm, bước 2,54 mm.'],
      parts: {
        pic16f877a_body: ['Vỏ epoxy đen PDIP-40', 'Nhựa epoxy đúc bọc lõi silicon và khung chân. Khấc bán nguyệt ở đầu bên trái đánh dấu phía chân 1 (chân 1 ở góc dưới-trái khi khấc quay sang trái).'],
        'pic16f877a_mark*': ['Chữ in laser trên vỏ', 'Tên chip PIC16F877A-I/P: "I" = dải nhiệt công nghiệp −40…85 °C, "P" = vỏ PDIP nhựa. Dòng dưới là mã lô sản xuất.'],
        ...pinParts,
      },
      onLoad(c) {
        cadPins = PINS.map(([n]) => c.node('pin_' + n)).map((nd) => { const ms = []; nd?.traverse((o) => { if (o.isMesh) { ownMaterial(o); ms.push(o); } }); return ms; });
        cadBody = c.node('pic16f877a_body');
        cadBody?.traverse((o) => { if (o.isMesh) ownMaterial(o); });
      },
    });
    // đế 40 chân KiCad (khung vendor: dài theo Z, chân 1 ở x = −7,62, z = −24,13) → xoay 90° quanh Y cho chân 1 về
    // x = −24,13, z = +7,62 như chip. Mặt trên đế (y = 4,0) đặt ngay dưới mặt tựa của chip (y = 0,5).
    const cadSock = cadAttach(ctx, root, 'vendor/dip_40_w15_24mm_socket', {
      onBottom: false, rotateY: Math.PI / 2, offset: [0, -3.5, 0], frame: false,
      hide: [sockGroup],
      partDefault: ['Đế IC 40 chân 600 mil (CAD thật)', 'Hàn đế lên mạch, chip cắm vào đế → thay chip dễ, không làm nóng chip khi hàn. Khấc trên đế phải trùng khấc chip.'],
    });
    const bodyMeshes = () => { const a = []; cadBody?.traverse((o) => { if (o.isMesh) a.push(o); }); return a; };
    const tmpC = new THREE.Color();

    const state = new Array(40).fill(0);       // mức logic hiện tại (0/1)
    let uartPhase = 0;
    let fault = null, fT = 0, temp = 30, dead = false, smoked = false, step = -1;
    const chipTarget = new THREE.Vector3(), chipTilt = { x: 0, z: 0 };

    return {
      object: root,
      setStep(i) { step = i; },
      triggerFault(id) {
        fault = id; fT = 0; dead = false; smoked = false; temp = 30;
        chip.rotation.y = id === 'cam-nguoc' ? Math.PI : 0;
      },
      resetFault() { fault = null; dead = false; smoked = false; temp = 30; chip.rotation.y = 0; },
      update(dt, t, p) {
        const cadOn = cad.sync(p);
        cadSock.sync(p);
        const heatBody = cadOn && cadBody ? cadBody : dip.body;
        // ----- tháo lắp: vị trí chip so với đế -----
        const lift = step === 0 ? 30 : step === 1 ? 22 : step === 2 ? 6 : step === 4 ? 9 : 0;
        chip.position.y += (lift - chip.position.y) * Math.min(1, dt * 5);
        const tiltZ = step === 1 ? 0.35 : step === 4 ? 0.12 * Math.sin(t * 3) : 0;
        chip.rotation.z += (tiltZ - chip.rotation.z) * Math.min(1, dt * 5);
        // ----- sự cố: nhiệt & chết chip -----
        if (fault) fT += dt;
        let heatW = 0.05;                                       // công suất bình thường ~ 5 V × 10 mA
        if (fault === 'cam-nguoc') heatW = 3.5;
        if (fault === 'qua-ap') heatW = 6;
        temp += ((heatW - (temp - 30) / 45) / 0.12) * dt;       // Rth vỏ DIP ~45 K/W, C nhỏ → nóng nhanh
        if (fault === 'qua-dong-chan') fx.heat(cadOn && cad.node('pin_30') ? cad.node('pin_30') : dip.pins[29], Math.min(1, fT / 4));
        if ((fault === 'cam-nguoc' || fault === 'qua-ap')) {
          fx.heat(heatBody, Math.min(1, (temp - 60) / 100));
          if (temp > 110 && !smoked) { smoked = true; fx.smoke(chip, { size: 18, duration: 8 }); }
          if (temp > 150 && !dead) {
            dead = true;
            fx.scorch(heatBody, 0.5);
            if (fault === 'qua-ap') { fx.sparks(chip, { count: 50, speed: 60, size: 0.6 }); fx.flash(chip, { size: 30, color: 0xffe0a0 }); }
          }
        }
        const noClock = fault === 'thach-anh';
        const resetting = (fault === 'thieu-mclr' && Math.sin(t * 5.3) + Math.sin(t * 13.1) > 0.9) || (fault === 'lvp' && (t % 6) > 4);
        const running = !dead && !noClock && !resetting && fault !== 'cam-nguoc' && fault !== 'qua-ap';
        // ----- tô màu theo nhóm & làm nổi -----
        PINS.forEach(([, , grp], i) => {
          const m = pinMats[i];
          const show = p.group === 'all' || p.group === grp;
          const base = p.color ? new THREE.Color(PIN_COLORS[grp]) : new THREE.Color(0xdfe3e6);
          m.color.copy(show ? base : base.clone().multiplyScalar(0.18));
          m.metalness = p.color ? 0.4 : 0.9;
        });
        dip.body.material.transparent = true;
        dip.body.material.opacity = p.open ? 0.18 : 1;
        dip.body.material.depthWrite = !p.open;
        inside.visible = p.open;
        if (cadOn) {
          // vỏ CAD trong suốt khi "mở nắp" → thấy die + dây bond tự dựng bên trong
          for (const o of bodyMeshes()) {
            const m = o.material;
            if (m.transparent !== true || m.opacity !== (p.open ? 0.18 : 1)) { m.transparent = true; m.opacity = p.open ? 0.18 : 1; m.depthWrite = !p.open; m.needsUpdate = true; }
          }
          // tô màu chân CAD theo nhóm chức năng (cùng bảng màu PIN_COLORS với mô hình học)
          PINS.forEach(([, , grp], i) => {
            const show = p.group === 'all' || p.group === grp;
            for (const o of cadPins[i] || []) {
              const m = o.material;
              if (o.userData._cadBaseColor === undefined) o.userData._cadBaseColor = m.color.getHex();
              tmpC.setHex(p.color ? PIN_COLORS[grp] : o.userData._cadBaseColor);
              if (!show) tmpC.multiplyScalar(0.18);
              m.color.copy(tmpC);
              m.metalness = p.color ? 0.4 : 0.95;
            }
          });
        }

        // ----- chương trình chạy thử (thời gian làm chậm) -----
        state.fill(0);
        state[10] = state[31] = 1;              // VDD luôn = 1
        state[0] = 1;                           // MCLR kéo lên
        let rd7 = 0, ccp1 = 0, tx = 1, reg = '—';
        const demo = running ? p.demo : 'none';
        if (!running) state[0] = resetting ? 0 : 1;
        if (demo === 'blink') {
          rd7 = Math.floor(t * 2) % 2;          // 1 Hz
          reg = \`PORTD.7 = \${rd7}\`;
        }
        if (demo === 'pwm') {
          const ph = (t * 2.5) % 1;             // 2.5 Hz "thay cho" 20 kHz
          ccp1 = ph < p.duty / 100 ? 1 : 0;
          state[15] = (((t * 2.5) + 0.25) % 1) < p.duty / 100 ? 1 : 0;   // CCP2 lệch pha cho dễ nhìn
          reg = \`CCPR1L:CCP1CON<5:4> = \${Math.round(p.duty * 10)}\`;
        }
        if (demo === 'uart') {
          // khung 8N1: start(0) + 8 bit LSB trước + stop(1), 0xAA = 10101010, 5 bit/s, nghỉ 1 s
          uartPhase = (t * 5) % 15;
          const k = Math.floor(uartPhase);
          const bits = [0, 0, 1, 0, 1, 0, 1, 0, 1, 1];   // start, b0..b7 (0xAA LSB trước), stop
          tx = k < 10 ? bits[k] : 1;
          reg = k < 10 ? \`TXREG = 0xAA · bit \${k === 0 ? 'start' : k === 9 ? 'stop' : k - 1}\` : 'chờ byte kế';
        }
        state[29] = rd7;
        state[16] = ccp1;
        state[24] = tx;
        state.forEach((v, i) => {
          const m = pinMats[i];
          m.emissive.setRGB(v ? 1 : 0, v ? 0.75 : 0, v ? 0.1 : 0);
          m.emissiveIntensity = v && PINS[i][2] !== 'power' ? 0.9 : 0;
          // chân CAD mức 1 cũng phát sáng vàng (trừ khi đang bị nung nóng bởi sự cố quá dòng)
          if (cadOn && !(fault === 'qua-dong-chan' && i === 29)) for (const o of cadPins[i] || []) {
            o.material.emissive.setRGB(v ? 1 : 0, v ? 0.75 : 0, v ? 0.1 : 0);
            o.material.emissiveIntensity = v && PINS[i][2] !== 'power' ? 0.9 : 0;
          }
        });
        readout('clk', '20 MHz · 0.2 µs/lệnh');
        readout('high', state.filter(Boolean).length);
        readout('reg', reg);
        readout('temp', temp);
        readout('st', dead ? '💀 Chip đã hỏng' : fault === 'cam-nguoc' || fault === 'qua-ap' ? '🔥 Đang quá nhiệt!' : noClock ? 'Không có xung nhịp — đứng im' : resetting ? '⟲ Đang reset' : fault === 'qua-dong-chan' ? '⚠️ Chân RD7 quá dòng' : 'Đang chạy');
        return [rd7 * 5, ccp1 * 5, tx * 5];
      },
    };
  },
};
`;export{n as default};
