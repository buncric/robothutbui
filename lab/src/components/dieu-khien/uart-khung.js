// 📨 Truyền UART PIC ⇄ ESP32 — khung nhị phân 0xAA | LEN | CMD | PAYLOAD | CHK đúng docs/02_GIAO_THUC.md.
// Người học dựng khung (DRIVE trái/phải ‰, AUX, PING, SAFETY, RESET_ENC, hoặc STATUS từ PIC), xem từng bit
// (start, 8 bit LSB trước, stop) chạy trên dây qua BSS138; bộ nhận chạy ĐÚNG máy trạng thái của firmware
// (pic_link.cpp / link.c). Bật nhiễu → lật 1 bit → checksum sai → bỏ khung. Tốc độ bit làm chậm ~1000 lần.

const BAUD = 19200;
const T_TR = 1.1;           // thời gian một bit "bay" hết dây trên màn hình (s)
const GAP = 1.2;            // nghỉ giữa 2 khung khi gửi liên tục (s)
const CMD_NAMES = { 0x01: 'DRIVE', 0x02: 'AUX', 0x03: 'PING', 0x04: 'SAFETY', 0x05: 'RESET_ENC', 0x81: 'STATUS', 0x82: 'CLIFF_RAW' };
const hex = (b) => b.toString(16).toUpperCase().padStart(2, '0');
const le16 = (v) => [v & 0xff, (v >> 8) & 0xff];                 // little-endian, int16 bù 2
const s16 = (lo, hi) => { const v = lo | (hi << 8); return v & 0x8000 ? v - 0x10000 : v; };

function buildFrame(cmd, payload) {
  let chk = payload.length ^ cmd;
  for (const b of payload) chk ^= b;
  return [0xaa, payload.length, cmd, ...payload, chk & 0xff];
}

// Máy trạng thái nhận khung — chép đúng logic PicLink::poll() (ESP32) / link.c (PIC)
class Parser {
  constructor() { this.ps = 0; this.ok = 0; this.bad = 0; this.buf = []; this.last = null; this.calc = 0; }
  feed(b) {
    switch (this.ps) {
      case 0: if (b === 0xaa) this.ps = 1; return 'sync';
      case 1:
        if (b > 16) { this.ps = b === 0xaa ? 1 : 0; this.bad++; this.last = { ok: false, why: `LEN = ${b} > 16 → bỏ, chờ 0xAA mới` }; return 'bad'; }
        this.len = b; this.chk = b; this.ps = 2; return 'len';
      case 2: this.cmd = b; this.chk ^= b; this.buf = []; this.ps = this.len ? 3 : 4; return 'cmd';
      case 3: this.buf.push(b); this.chk ^= b; if (this.buf.length >= this.len) this.ps = 4; return 'pay';
      case 4:
        if (b === this.chk) { this.ok++; this.ps = 0; this.last = { ok: true, cmd: this.cmd, p: this.buf.slice() }; return 'ok'; }
        this.bad++; this.last = { ok: false, why: `Sai checksum: tính 0x${hex(this.chk)} ≠ nhận 0x${hex(b)} → bỏ khung` };
        this.ps = b === 0xaa ? 1 : 0; return 'bad';
      default: this.ps = 0; return 'sync';
    }
  }
}

export default {
  id: 'uart-khung',
  name: 'Truyền UART giữa PIC ⇄ ESP32',
  category: 'dieu-khien',
  order: 5,
  icon: '📨',
  summary: 'Dựng một khung lệnh DRIVE (tốc độ bánh trái/phải) và xem từng bit chạy trên dây từ ESP32 qua BSS138 tới PIC: byte 0xAA, LEN, CMD, số little-endian, checksum XOR. Bật nhiễu để thấy bộ nhận bỏ khung lỗi.',
  tags: ['UART', 'serial', 'khung', 'frame', 'checksum', 'XOR', 'little-endian', '19200', '8N1', 'DRIVE', 'STATUS', 'giao thức'],

  params: [
    { id: 'cmd', label: 'Loại khung', type: 'select', value: 'drive', options: [['drive', 'ESP32 → PIC: DRIVE 0x01 (lái 2 bánh)'], ['aux', 'ESP32 → PIC: AUX 0x02 (chổi)'], ['ping', 'ESP32 → PIC: PING 0x03 (heartbeat)'], ['safety', 'ESP32 → PIC: SAFETY 0x04'], ['reset', 'ESP32 → PIC: RESET_ENC 0x05'], ['status', 'PIC → ESP32: STATUS 0x81 (12 byte)']] },
    { id: 'left', label: 'DRIVE: bánh trái', type: 'range', min: -1000, max: 1000, step: 10, value: 450, unit: '‰' },
    { id: 'right', label: 'DRIVE: bánh phải', type: 'range', min: -1000, max: 1000, step: 10, value: -300, unit: '‰' },
    { id: 'mainBrush', label: 'AUX: chổi cuộn (bit0)', type: 'toggle', value: true },
    { id: 'sideBrush', label: 'AUX: chổi cạnh (bit1)', type: 'toggle', value: false },
    { id: 'noise', label: 'Nhiễu trên dây (lật ngẫu nhiên 1 bit dữ liệu)', type: 'toggle', value: false },
    { id: 'rate', label: 'Tốc độ hiển thị', type: 'select', value: '20', options: [['10', '10 bit/s (rất chậm)'], ['20', '20 bit/s'], ['40', '40 bit/s']] },
    { id: 'auto', label: 'Gửi liên tục (như heartbeat 20 Hz)', type: 'toggle', value: true },
    { id: 'send', label: '▶ Gửi 1 khung ngay', type: 'button' },
  ],
  readouts: [
    { id: 'frame', label: 'Khung (hex)', unit: '' },
    { id: 'fields', label: 'Giải nghĩa', unit: '' },
    { id: 'bit', label: 'Đang phát', unit: '' },
    { id: 'rx', label: 'Bên nhận đã có', unit: '' },
    { id: 'result', label: 'Kết quả khung gần nhất', unit: '' },
    { id: 'count', label: 'Khung hợp lệ / bị bỏ', unit: '' },
    { id: 'real', label: 'Thời gian thật ở 19200 baud', unit: '' },
  ],
  scope: {
    window: 4,
    note: '(đã làm chậm ~1000×: 19 200 bit/s → 10–40 bit/s; mỗi byte = start + 8 bit LSB trước + stop)',
    channels: [
      { name: 'Đầu phát TX', unit: 'V', min: -0.3, max: 5.5, color: '#ffd34d' },
      { name: 'Đầu thu RX (sau BSS138)', unit: 'V', min: -0.3, max: 5.5, color: '#4cc2ff' },
    ],
  },

  info: {
    overview: `
      <p>PIC và ESP32 nói chuyện qua <b>UART</b> (Universal Asynchronous Receiver-Transmitter): 2 dây tín hiệu chéo nhau (TX của bên này vào RX của bên kia) + 1 dây GND chung, <b>19200 bit/s, 8N1</b> (8 bit dữ liệu, không parity, 1 bit stop).</p>
      <p>Vì UART chỉ truyền từng byte, dự án tự định nghĩa <b>khung</b> (frame) để biết đâu là đầu lệnh và lệnh có bị hỏng không: <code>0xAA | LEN | CMD | PAYLOAD | CHK</code>.</p>
      <p>Thử: đặt bánh trái 450 ‰, bánh phải −300 ‰ rồi đọc ô <b>Khung</b>: <code>AA 04 01 C2 01 D4 FE ..</code> — số âm −300 thành <code>D4 FE</code> (bù 2, byte thấp trước). Rồi bật <b>Nhiễu</b>: bit hồng là bit bị lật — xem bộ nhận tính checksum ra khác và bỏ khung.</p>`,
    specs: [
      ['Cấu hình', '19200 baud, 8N1, mức logic: ESP32 3.3 V ⇄ (BSS138) ⇄ PIC 5 V'],
      ['Baud của PIC', '20 MHz, BRGH = 1, SPBRG = 64 → 20e6/(16·65) = 19 231 baud (+0.16 %)'],
      ['1 byte', '10 bit (start 0 + 8 dữ liệu LSB trước + stop 1) = 521 µs'],
      ['Khung', '0xAA · LEN (0…16) · CMD · PAYLOAD · CHK = LEN ⊕ CMD ⊕ payload[0] ⊕ … '],
      ['Số nhiều byte', 'Little-endian (byte thấp trước); int16 có dấu dạng bù 2'],
      ['ESP32 → PIC', 'DRIVE 0x01 (int16 trái, int16 phải ‰; gửi 20 Hz = heartbeat) · AUX 0x02 · PING 0x03 · SAFETY 0x04 · RESET_ENC 0x05'],
      ['PIC → ESP32', 'STATUS 0x81 (12 byte, 50 Hz) · CLIFF_RAW 0x82 (8 byte, 5 Hz)'],
      ['An toàn', 'PIC không nhận được DRIVE/PING hợp lệ trong 300 ms → dừng 2 bánh + chổi'],
    ],
    principle: `
      <h4>1. Một byte trên dây</h4>
      <p>Dây nghỉ ở mức 1. Bên phát kéo xuống 0 một bit (<b>start</b>) để báo "chuẩn bị", rồi gửi 8 bit <b>LSB trước</b>, cuối cùng 1 bit <b>stop</b> = 1. Bên nhận phát hiện sườn xuống, chờ 1.5 bit rồi lấy mẫu giữa mỗi bit. Hai bên phải cùng baud (sai &lt; ~2 %).</p>
      <p>Ví dụ 0xAA = 1010 1010 → trên dây (LSB trước): <code>0 | 0 1 0 1 0 1 0 1 | 1</code>.</p>
      <h4>2. Khung</h4>
      <p><code>0xAA</code> = byte đồng bộ (dễ nhận vì xen kẽ 1-0). <code>LEN</code> = số byte payload. <code>CMD</code> = loại lệnh. <code>CHK</code> = XOR của LEN, CMD và mọi byte payload.</p>
      <h4>3. Little-endian & bù 2</h4>
      <p>450 = 0x01C2 → gửi <code>C2 01</code>. −300: 65536 − 300 = 65236 = 0xFED4 → gửi <code>D4 FE</code>. Bên nhận ghép <code>lo | hi&lt;&lt;8</code> rồi ép kiểu <code>int16</code>.</p>
      <h4>4. Checksum XOR bắt được gì?</h4>
      <p>XOR có tính chất: lật 1 bit ở bất kỳ byte nào → bit tương ứng của kết quả cũng lật → CHK không khớp → khung bị bỏ. Lật <b>2 bit cùng vị trí</b> ở 2 byte khác nhau thì XOR không phát hiện được (hiếm). Khung bị bỏ không sao: 50 ms sau ESP32 gửi khung mới.</p>
      <h4>5. Máy trạng thái bên nhận (giống hệt firmware)</h4>
      <p><code>0: chờ 0xAA → 1: đọc LEN (&gt;16 thì bỏ) → 2: đọc CMD → 3: đọc LEN byte payload → 4: so CHK</code>. Sai CHK: nếu byte vừa đọc là 0xAA thì coi như đầu khung mới, ngược lại về trạng thái 0.</p>`,
    inRobot: `
      <ul>
        <li>ESP32 GPIO17 (TX) → BSS138 LV2→HV2 → PIC chân 26 (RC7/RX). PIC chân 25 (RC6/TX) → HV1→LV1 → ESP32 GPIO18 (RX). GND chung.</li>
        <li>ESP32: <code>firmware/esp32s3/src/pic_link.cpp</code> — <code>sendDrive()</code> mỗi 50 ms (<code>DRIVE_PERIOD_MS</code>), <code>poll()</code> phân tích STATUS.</li>
        <li>PIC: <code>firmware/pic16f877a_ccs/link.c</code> — ngắt <code>#int_rda</code> nhận từng byte, <code>handle_frame()</code> áp lệnh; STATUS gửi mỗi 20 ms.</li>
        <li>Một khung DRIVE 8 byte mất 4.17 ms; STATUS 16 byte mất 8.3 ms mỗi 20 ms → đường PIC→ESP32 bận ~42 % — vẫn ổn ở 19200.</li>
      </ul>`,
    mistakes: `
      <ul>
        <li>Nối TX↔TX, RX↔RX → không ai nghe ai.</li>
        <li>Quên GND chung → byte rác, checksum sai liên tục.</li>
        <li>Hai bên khác baud (115200 vs 19200) → toàn byte rác, không bao giờ thấy 0xAA đúng chỗ.</li>
        <li>Gửi số int16 nhưng ghép sai thứ tự byte (big-endian) → 450 thành 0xC201 = −15871!</li>
        <li>Tính checksum quên LEN hoặc CMD → mọi khung đều bị bỏ.</li>
        <li>Dùng <code>printf</code>/<code>Serial.println</code> (chữ ASCII) trên cùng cổng với khung nhị phân → bộ nhận lẫn lộn.</li>
      </ul>`,
    quiz: [
      { q: 'Viết khung DRIVE với trái = 450 ‰, phải = 450 ‰.', a: 'AA 04 01 C2 01 C2 01 CHK, với CHK = 04⊕01⊕C2⊕01⊕C2⊕01 = 05 → AA 04 01 C2 01 C2 01 05.' },
      { q: 'Khung PING (không payload) có những byte nào?', a: 'AA 00 03 03 (LEN = 0, CMD = 03, CHK = 00 ⊕ 03 = 03).' },
      { q: 'Payload STATUS có vbat_mv = 15820 ở offset 7. Hai byte đó là gì?', a: '15820 = 0x3DCC → little-endian: CC 3D.' },
    ],
  },

  steps: [
    { title: 'Bước 1 — Xác định chân', text: 'ESP32: GPIO17 = TX (phát), GPIO18 = RX (nhận). PIC: chân 25 RC6/TX, chân 26 RC7/RX. Nguyên tắc: <b>TX của bên này → RX của bên kia</b>.' },
    { title: 'Bước 2 — GND chung TRƯỚC', text: 'Nối GND ESP32 ↔ GND module BSS138 ↔ VSS PIC (chân 12/31). Không có GND chung thì mọi mức điện áp vô nghĩa.' },
    { title: 'Bước 3 — Kênh PIC TX → ESP32 RX', text: 'Chân 25 → HV1, LV1 → GPIO18. Dây vàng. Khi nghỉ đo HV1 ≈ 5 V, LV1 ≈ 3.3 V.' },
    { title: 'Bước 4 — Kênh ESP32 TX → PIC RX', text: 'GPIO17 → LV2, HV2 → chân 26. Dây xanh. Khi nghỉ đo LV2 ≈ 3.3 V, HV2 ≈ 5 V.' },
    { title: 'Bước 5 — Thử: gửi khung & xem kết quả', text: 'Bật "Gửi liên tục": ESP32 gửi DRIVE, PIC trả STATUS. Trên robot thật: log của ESP32 in số khung OK/bad của <code>PicLink</code>; bánh xe quay theo ‰ đã gửi.' },
  ],

  faults: [
    { id: 'tx-tx', label: 'Nối nhầm TX ↔ TX (RX ↔ RX)', severity: 'loi',
      what: '<p>Không có khung nào tới nơi: PIC không nhận DRIVE nên dừng động cơ sau 300 ms (cờ mất liên lạc), ESP32 báo E,PIC_LOST. Không có gì cháy.</p>',
      why: '<p>Hai chân TX đều là <b>đầu ra</b>, hai chân RX đều là <b>đầu vào</b> — không đầu vào nào nối với đầu ra của bên kia. Khi cả hai cùng phát, 2 đầu ra "đánh nhau" qua MOSFET BSS138 (dòng đỉnh vài chục mA) — ngắn thì không sao, không nên để lâu.</p>',
      fix: '<p>Đảo 2 dây tín hiệu. Mẹo kiểm tra: rút dây ra, đo chân TX khi nghỉ = mức 1 (3.3/5 V), chân RX thả nổi.</p>' },
    { id: 'quen-gnd', label: 'Quên nối GND chung', severity: 'loi',
      what: '<p>Đèn trên PIC nháy loạn, bánh xe giật cục; log ESP32 đếm "bad" tăng vùn vụt; chạm tay vào mạch thì thay đổi.</p>',
      why: '<p>Tín hiệu là hiệu điện thế so với GND. Không có GND chung, dòng tín hiệu phải tìm đường về qua chỗ khác; nhiễu động cơ vài trăm mV cộng vào làm mức 0/1 bị đọc sai ngẫu nhiên → nhiều bit lật mỗi khung → XOR phát hiện → bỏ gần hết khung.</p>',
      fix: '<p>Luôn nối GND trước tiên, cùng bó với dây TX/RX. Đo điện trở GND–GND giữa 2 bo &lt; 1 Ω.</p>' },
    { id: 'sai-baud', label: 'ESP32 để 115200 baud, PIC 19200', severity: 'loi',
      what: '<p>PIC nhận được "byte" nhưng toàn giá trị lạ, không bao giờ ra khung hợp lệ; robot đứng im.</p>',
      why: '<p>Bit của ESP32 dài 8.7 µs, PIC lấy mẫu mỗi 52 µs → mỗi lần PIC chỉ "chấm" trúng 1 trong 6 bit của ESP32, ghép thành byte rác; stop bit thường sai (lỗi khung FERR). Byte 0xAA đồng bộ hầu như không bao giờ xuất hiện đúng.</p>',
      fix: '<p>Hai bên cùng <code>19200</code>: <code>PIC_BAUD</code> trong <code>config.h</code> của ESP32 và <code>#use rs232(baud=19200…)</code> của PIC. Kiểm tra thạch anh đúng 20 MHz.</p>' },
    { id: 'noi-thang-5v', label: 'Bỏ BSS138, nối thẳng 2 bo', severity: 'hong',
      what: '<p>Lúc chạy lúc không: nhiều khung bị bỏ ở phía PIC. ESP32 vẫn nhận STATUS bình thường… cho tới khi GPIO18 hỏng sau vài ngày.</p>',
      why: '<p>ESP32 TX 3.3 V &lt; 4.0 V (V_IH của RC7 Schmitt) → bit 1 rơi vào vùng không xác định, PIC hay giữ mức 0 cũ → bit lật → checksum sai. PIC TX 5 V vào GPIO18 → dòng ~20–30 mA qua diode ESD mỗi khi dây nghỉ ở mức 1 → hỏng dần.</p>',
      fix: '<p>Dùng module BSS138 như docs/01. Xem linh kiện "Mạch chuyển mức BSS138".</p>' },
    { id: 'esp-treo', label: 'ESP32 bị treo — ngừng gửi DRIVE', severity: 'nhe',
      what: '<p>Robot đang chạy thì ESP32 treo (lỗi code, sụt áp). Sau 0.3 s hai bánh và chổi dừng hẳn, LED PIC báo lỗi. Đây là <b>tính năng an toàn</b>, không phải hỏng.</p>',
      why: '<p>DRIVE vừa là lệnh vừa là heartbeat (20 Hz). PIC ghi lại thời điểm khung hợp lệ cuối cùng; quá <code>COMM_TIMEOUT_MS = 300</code> ms (6 khung liên tiếp) không có → đặt tốc độ 0, tắt chổi, bật cờ <code>flags.bit1</code> trong STATUS.</p>',
      fix: '<p>Không cần sửa PIC. Tìm nguyên nhân ESP32 treo: watchdog, brownout (nguồn 5 V), vòng lặp chặn. ESP32 khởi động lại → gửi DRIVE → PIC chạy tiếp.</p>' },
  ],

  build({ THREE, MAT, PIN_COLORS, geom, label, readout, fx }) {
    const { mesh, group, part, cyl, box, pcb, wire, dipPackage } = geom;
    const root = new THREE.Group();
    let clock = 0;           // đồng hồ mô phỏng riêng của linh kiện (giây hiển thị)

    // ---------- ESP32 (đơn giản) — trục dài theo Z ----------
    const EX = -85;
    const esp = new THREE.Group();
    esp.position.set(EX, 0, 0);
    root.add(esp);
    esp.add(pcb(25.4, 63, { mat: MAT.pcbBlack }));
    esp.add(mesh(box(18, 3.1, 25.5), MAT.pcbBlue, { y: 1.55, z: -18.75 }));
    esp.add(mesh(box(16.6, 2.4, 17.6), MAT.steel, { y: 3.2, z: -15.2 }));
    const espRgbMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, emissive: 0x000000, emissiveIntensity: 1.5 });
    esp.add(mesh(box(2.2, 0.9, 2.2), espRgbMat, { y: 0.45, z: 15 }));
    const espPads = {};
    for (const [sx, row] of [[11.43, 'J1'], [-11.43, 'J3']]) {
      for (let i = 0; i < 22; i++) {
        const z = -26.67 + i * 2.54;
        let c = 0x9aa1ab, nm = '';
        if (row === 'J1' && i === 9) { c = PIN_COLORS.uart; nm = 'GPIO17'; }
        if (row === 'J1' && i === 10) { c = PIN_COLORS.uart; nm = 'GPIO18'; }
        if (row === 'J1' && i === 21) { c = PIN_COLORS.ground; nm = 'GND'; }
        const pd = mesh(cyl(0.9, 0.9, 0.6, 12), tintMat(MAT.gold, c), { x: sx, y: 0.3, z });
        esp.add(pd);
        if (nm) { espPads[nm] = [EX + sx, z]; part(pd, `ESP32 ${nm}`, nm === 'GPIO17' ? 'UART1 TX (3.3 V) → BSS138 LV2' : nm === 'GPIO18' ? 'UART1 RX ← BSS138 LV1' : 'GND chung'); }
      }
    }
    part(esp, 'ESP32-S3-DevKitC-1 (thu gọn)', 'Gửi DRIVE 20 lần/s, nhận STATUS 50 lần/s qua UART1 (GPIO17/18). Xem chi tiết ở linh kiện ESP32-S3.');
    label(root, 'ESP32-S3 (3.3 V)', [EX, 10, -10]);

    // ---------- BSS138 (đơn giản) ----------
    const lsh = new THREE.Group();
    root.add(lsh);
    lsh.add(pcb(13.5, 15.5, { mat: MAT.pcbBlue }));
    const lshFets = [];
    for (let k = 0; k < 4; k++) { const m = mesh(box(1.3, 1, 2.9), MAT.icBody.clone(), { y: 0.5, z: -5.7 + k * 3.8 }); lsh.add(m); lshFets.push(m); }
    const lshPin = {};
    for (const [x, side] of [[-5.48, 'LV'], [5.48, 'HV']]) {
      ['1', '2', '', 'GND', '3', '4'].forEach((n, i) => {
        const z = -6.35 + i * 2.54;
        lsh.add(mesh(cyl(0.8, 0.8, 0.6, 12), MAT.gold, { x, y: 0.3, z }));
        lshPin[side + n] = [x, z];
      });
    }
    part(lsh, 'Module chuyển mức BSS138', 'Kênh 1: HV1 (PIC TX) → LV1 (ESP RX). Kênh 2: LV2 (ESP TX) → HV2 (PIC RX). MOSFET sáng khi đang kéo mức 0 qua.');
    label(root, 'BSS138', [0, 8, 0]);

    // ---------- PIC trên bo xanh ----------
    const PX = 80;
    const picB = new THREE.Group();
    picB.position.set(PX, 0, 0);
    root.add(picB);
    picB.add(pcb(45, 70, { mat: MAT.pcbGreen }));
    const dip = dipPackage(40);
    dip.group.rotation.y = Math.PI / 2;
    picB.add(dip.group);
    [24, 25].forEach((i) => dip.pins[i].traverse((o) => { if (o.isMesh) { o.material = MAT.tin.clone(); o.material.color.set(PIN_COLORS.uart); } }));
    part(dip.pins[24], 'PIC chân 25 — RC6/TX', 'Phát STATUS 50 Hz → HV1 → LV1 → ESP32 GPIO18.');
    part(dip.pins[25], 'PIC chân 26 — RC7/RX', 'Nhận DRIVE/AUX/PING… — ngõ vào Schmitt cần ≥ 4.0 V cho mức 1.');
    part(dip.body, 'PIC16F877A', 'Ngắt #int_rda nhận từng byte → máy trạng thái khung → handle_frame().');
    label(root, 'PIC16F877A (5 V)', [PX, 10, 22]);
    // LED + vạch tốc độ bánh + LED chổi trên bo PIC
    const mkLed = (x, z, color) => { const m = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: color, emissiveIntensity: 0 }); const l = mesh(cyl(1.5, 1.5, 2.5, 16), m, { x, y: 1.25, z }); picB.add(l); return m; };
    const ledOk = mkLed(14, 30, 0x30ff60), ledMain = mkLed(-14, 30, 0xffaa20), ledSide = mkLed(-8, 30, 0xffaa20), ledLost = mkLed(8, 30, 0xff2020);
    part(picB.children[picB.children.length - 4], 'LED RD7 (trạng thái)', 'Nháy xanh mỗi khi PIC nhận khung hợp lệ.');
    const barMatL = new THREE.MeshStandardMaterial({ color: 0x3fcf8e, emissive: 0x1f6b3a, emissiveIntensity: 0.6 });
    const barMatR = barMatL.clone();
    const barL = mesh(box(5, 1, 5), barMatL, { x: -12, y: 0.5, z: -28 });
    const barR = mesh(box(5, 1, 5), barMatR, { x: 12, y: 0.5, z: -28 });
    picB.add(part(barL, 'Tốc độ bánh TRÁI (‰ nhận được)', 'Cao = |‰|; xanh = tiến, đỏ = lùi. PIC biến ‰ thành duty PWM CCP1 (chân 17).'), part(barR, 'Tốc độ bánh PHẢI (‰ nhận được)', 'PWM CCP2 (chân 16).'));
    label(root, 'Bánh T / P', [PX, 26, -28]);
    root.updateMatrixWorld(true);
    const wp = (o) => o.getWorldPosition(new THREE.Vector3());
    const p25 = wp(dip.pins[24]), p26 = wp(dip.pins[25]), pVss = wp(dip.pins[30]);

    // ---------- dây & đường bay của bit ----------
    const [x17, z17] = espPads.GPIO17, [x18, z18] = espPads.GPIO18, [xg, zg] = espPads.GND;
    const LV = (n) => lshPin['LV' + n], HV = (n) => lshPin['HV' + n];
    const ptsA1 = [[x17, 0.6, z17], [x17 + 15, 12, z17], [-30, 14, LV('2')[1] - 2], [LV('2')[0], 0.6, LV('2')[1]]];
    const ptsA2 = [[HV('2')[0], 0.6, HV('2')[1]], [30, 14, -6], [p26.x - 15, 12, p26.z], [p26.x - 1, 2.5, p26.z]];
    const ptsB1 = [[p25.x - 1, 2.5, p25.z], [p25.x - 15, 16, p25.z], [30, 18, -10], [HV('1')[0], 0.6, HV('1')[1]]];
    const ptsB2 = [[LV('1')[0], 0.6, LV('1')[1]], [-30, 18, -10], [x18 + 15, 16, z18], [x18, 0.6, z18]];
    const wA = group(wire(ptsA1, { radius: 0.55, color: 0x3b8ef0 }), wire(ptsA2, { radius: 0.55, color: 0x3b8ef0 }));
    const wB = group(wire(ptsB1, { radius: 0.55, color: 0xf5c400 }), wire(ptsB2, { radius: 0.55, color: 0xf5c400 }));
    const wG = group(wire([[xg, 0.6, zg], [-40, 8, 20], [LV('GND')[0], 0.6, LV('GND')[1]]], { radius: 0.55, color: 0x222222 }),
      wire([[HV('GND')[0], 0.6, HV('GND')[1]], [40, 8, 10], [pVss.x - 1, 2.5, pVss.z]], { radius: 0.55, color: 0x222222 }));
    root.add(part(wA, 'Dây ESP32 TX → PIC RX (xanh)', 'GPIO17 → LV2 ⇒ HV2 → chân 26. Chiều của lệnh DRIVE/AUX/PING.'));
    root.add(part(wB, 'Dây PIC TX → ESP32 RX (vàng)', 'Chân 25 → HV1 ⇒ LV1 → GPIO18. Chiều của STATUS.'));
    root.add(part(wG, 'Dây GND chung (đen)', 'Bắt buộc! Mọi mức 0/1 đều đo so với GND.'));
    const v3 = (a) => new THREE.Vector3(...a);
    const over = (side) => [[LV(side)[0] + 1, 4, LV(side)[1]], [0, 5, LV(side)[1]], [HV(side)[0] - 1, 4, HV(side)[1]]];
    const curveA = new THREE.CatmullRomCurve3([...ptsA1, ...over('2'), ...ptsA2].map(v3));
    const curveB = new THREE.CatmullRomCurve3([...ptsB1, ...over('1').reverse(), ...ptsB2].map(v3));

    // ---------- bóng bit ----------
    const bitGeo = new THREE.SphereGeometry(1.1, 12, 8);
    const COLORS = { one: 0xffe066, zero: 0x2a4cff, start: 0xff4040, stop: 0x40ff80, flip: 0xff40ff };
    const pool = [];
    for (let k = 0; k < 90; k++) {
      const m = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.8 });
      const s = mesh(bitGeo, m, { castShadow: false });
      s.visible = false;
      s.raycast = () => {};
      root.add(s);
      pool.push(s);
    }

    // ---------- trạng thái ----------
    const parserPic = new Parser(), parserEsp = new Parser();
    let tx = null, nextAt = 0.3, rxShown = [], lastRes = '—', okN = 0, badN = 0, seq = 0;
    let wheelL = 0, wheelR = 0, mainB = false, sideB = false, safety = 0x07, encL = 1234, encR = -56, okFlash = 0, espFlash = 0;
    let fault = null, fT = 0, lastValid = 0, lost = false, step = -1, rxV = 5;

    function payloadFor(p) {
      switch (p.cmd) {
        case 'drive': return [0x01, [...le16(Math.round(p.left)), ...le16(Math.round(p.right))]];
        case 'aux': return [0x02, [(p.mainBrush ? 1 : 0) | (p.sideBrush ? 2 : 0)]];
        case 'ping': return [0x03, []];
        case 'safety': return [0x04, [0x07]];
        case 'reset': return [0x05, []];
        default: {
          // STATUS 12 byte: enc_left, enc_right, bump, drop, cliff, vbat_mv, flags, seq, reserved
          const flags = (lost ? 2 : 0) | (mainB ? 0x20 : 0) | (sideB ? 0x40 : 0);
          return [0x81, [...le16(encL), ...le16(encR), 0, 0, 0, ...le16(15820), flags, seq & 0xff, 0]];
        }
      }
    }

    function describe(cmd, pl) {
      const nm = CMD_NAMES[cmd] || '?';
      if (cmd === 0x01) return `DRIVE: trái = ${s16(pl[0], pl[1])} ‰ (${hex(pl[0])} ${hex(pl[1])}), phải = ${s16(pl[2], pl[3])} ‰ (${hex(pl[2])} ${hex(pl[3])})`;
      if (cmd === 0x02) return `AUX: flags = 0b${pl[0].toString(2).padStart(2, '0')} (chổi cuộn ${pl[0] & 1 ? 'BẬT' : 'tắt'}, chổi cạnh ${pl[0] & 2 ? 'BẬT' : 'tắt'})`;
      if (cmd === 0x04) return `SAFETY: mask = 0x${hex(pl[0])} (bumper, cliff, nhấc bánh)`;
      if (cmd === 0x81) return `STATUS: encL ${s16(pl[0], pl[1])}, encR ${s16(pl[2], pl[3])}, vbat ${pl[7] | (pl[8] << 8)} mV (${hex(pl[7])} ${hex(pl[8])}), flags 0x${hex(pl[9])}, seq ${pl[10]}`;
      return `${nm}: không có payload`;
    }

    // tạo một lần truyền: bit phát, bit nhận (có thể bị nhiễu/sai baud), byte nhận + thời điểm tới
    function makeTx(p, now) {
      const [cmd, pl] = payloadFor(p);
      const bytes = buildFrame(cmd, pl);
      const dir = cmd & 0x80 ? 'pic2esp' : 'esp2pic';
      const rate = Number(p.rate);
      const fast = fault === 'sai-baud' && dir === 'esp2pic' ? 6 : 1;    // ESP32 phát 115200 = 6 × 19200
      const bits = [];
      bytes.forEach((b, bi) => {
        bits.push({ v: 0, kind: 'start', bi });
        for (let k = 0; k < 8; k++) bits.push({ v: (b >> k) & 1, kind: 'data', bi, k });
        bits.push({ v: 1, kind: 'stop', bi });
      });
      // ---- bit bị hỏng trên đường ----
      const rx = bits.map((b) => b.v);
      const flipped = new Set();
      if (p.noise && fault !== 'quen-gnd') {
        const dataIdx = bits.map((b, i) => (b.kind === 'data' ? i : -1)).filter((i) => i >= 0);
        const j = dataIdx[Math.floor(Math.random() * dataIdx.length)];
        rx[j] ^= 1; flipped.add(j);
      }
      if (fault === 'quen-gnd') bits.forEach((b, i) => { if (Math.random() < 0.08) { rx[i] ^= 1; flipped.add(i); } });
      if (fault === 'noi-thang-5v' && dir === 'esp2pic') {
        for (let i = 1; i < rx.length; i++) if (rx[i] === 1 && rx[i - 1] === 0 && Math.random() < 0.12) { rx[i] = 0; flipped.add(i); }
      }
      // ---- bộ nhận UART: tìm sườn xuống, lấy mẫu giữa bit (theo baud của bên nhận) ----
      const rxBytes = [];
      if (fault !== 'tx-tx') {
        const at = (i) => (i < rx.length ? rx[i] : 1);
        let i = 0;
        while (i < rx.length) {
          if (at(i) === 1) { i++; continue; }
          let val = 0;
          for (let k = 0; k < 8; k++) val |= at(Math.floor(i + fast * (k + 1) + fast / 2)) << k;
          const stopI = Math.floor(i + fast * 9 + fast / 2);
          rxBytes.push({ val, ferr: at(stopI) !== 1, tArr: now + (stopI + 1) / (rate * fast) + T_TR });
          i = stopI + 1;
        }
      }
      return { bytes, bits, rx, flipped, dir, rate: rate * fast, t0: now, rxBytes, fed: 0, cmd, pl, tEnd: now + bits.length / (rate * fast) + T_TR };
    }

    function applyValid(par, dir, now) {
      const r = par.last;
      okN++;
      if (dir === 'esp2pic') {
        okFlash = 0.4; lastValid = now; lost = false;
        if (r.cmd === 0x01) { wheelL = s16(r.p[0], r.p[1]); wheelR = s16(r.p[2], r.p[3]); }
        if (r.cmd === 0x02) { mainB = !!(r.p[0] & 1); sideB = !!(r.p[0] & 2); }
        if (r.cmd === 0x04) safety = r.p[0];
        if (r.cmd === 0x05) { encL = 0; encR = 0; }
        lastRes = `✓ Hợp lệ → ${describe(r.cmd, r.p)}`;
      } else {
        espFlash = 0.4;
        lastRes = `✓ ESP32 nhận ${describe(r.cmd, r.p)}`;
      }
    }

    return {
      object: root,
      onAction(id, p) { if (id === 'send' && (!tx || t0Now() > tx.tEnd)) { tx = makeTx(p, t0Now()); rxShown = []; } },
      setStep(i) { step = i; },
      triggerFault(id) { fault = id; fT = 0; okN = 0; badN = 0; parserPic.ps = parserEsp.ps = 0; tx = null; nextAt = clock + 0.2; if (id === 'esp-treo') { wheelL = 450; wheelR = 450; lastValid = clock; } },
      resetFault() { fault = null; lost = false; okN = badN = 0; tx = null; nextAt = clock + 0.2; },
      update(dt, t, p) {
        clock += dt; fT += dt;
        const now = clock;
        // ---- tháo lắp ----
        const s = step;
        wG.visible = s < 0 || s >= 1;
        wB.visible = s < 0 || s >= 2;
        wA.visible = s < 0 || s >= 3;
        const canSend = s < 0 || s >= 4;

        // ---- lên lịch gửi ----
        const treo = fault === 'esp-treo';
        const dirWanted = p.cmd === 'status' ? 'pic2esp' : 'esp2pic';
        if (canSend && !treo && (!tx || now > tx.tEnd + GAP) && p.auto && now >= nextAt) {
          if (p.cmd === 'status') { seq++; encL += 37; encR -= 5; }
          tx = makeTx(p, now); rxShown = []; nextAt = now;
        }
        if (treo && tx && tx.dir === 'esp2pic' && now > tx.tEnd) tx = null;

        // ---- vẽ bit đang bay + điện áp 2 đầu ----
        let txV = dirWanted === 'esp2pic' ? 3.3 : 5, rxIdle = dirWanted === 'esp2pic' ? 5 : 3.3, curBit = 'dây nghỉ (mức 1)';
        rxV = rxIdle;
        let used = 0;
        if (tx) {
          const curve = tx.dir === 'esp2pic' ? curveA : curveB;
          const vTx = tx.dir === 'esp2pic' ? 3.3 : 5, vRx = tx.dir === 'esp2pic' ? 5 : 3.3;
          txV = vTx; rxV = vRx;
          for (let j = 0; j < tx.bits.length && used < pool.length; j++) {
            const te = tx.t0 + j / tx.rate;
            const u = (now - te) / T_TR;
            if (u < 0) break;
            if (u > 1) continue;
            const b = tx.bits[j];
            const sp = pool[used++];
            const fl = tx.flipped.has(j) && u > 0.5;
            sp.visible = s < 0 || s >= 4 ? (tx.dir === 'esp2pic' ? wA.visible : wB.visible) : false;
            curve.getPointAt(Math.min(1, u), sp.position);
            const v = fl ? tx.rx[j] : b.v;
            const c = fl ? COLORS.flip : b.kind === 'start' ? COLORS.start : b.kind === 'stop' ? COLORS.stop : v ? COLORS.one : COLORS.zero;
            sp.material.color.setHex(c); sp.material.emissive.setHex(c);
            sp.scale.setScalar(v ? 1.15 : 0.8);
          }
          // điện áp tại đầu phát và đầu thu (đầu thu trễ T_TR)
          const jT = Math.floor((now - tx.t0) * tx.rate);
          if (jT >= 0 && jT < tx.bits.length) {
            const b = tx.bits[jT];
            txV = b.v * vTx;
            curBit = `byte ${b.bi + 1}/${tx.bytes.length} = 0x${hex(tx.bytes[b.bi])} = ${tx.bytes[b.bi].toString(2).padStart(8, '0')} · ${b.kind === 'start' ? 'bit START (0)' : b.kind === 'stop' ? 'bit STOP (1)' : `bit b${b.k} = ${b.v}`}`;
          }
          const jR = Math.floor((now - tx.t0 - T_TR) * tx.rate);
          if (fault === 'tx-tx') rxV = vRx;
          else if (jR >= 0 && jR < tx.rx.length) rxV = tx.rx[jR] * vRx;
          if (fault === 'quen-gnd') rxV += 0.6 * Math.sin(now * 37) + 0.3 * Math.sin(now * 91);
          if (fault === 'noi-thang-5v' && tx.dir === 'esp2pic' && rxV > 0.5) rxV = 3.3;
          // ---- bên nhận: đưa từng byte vào máy trạng thái ----
          const par = tx.dir === 'esp2pic' ? parserPic : parserEsp;
          while (tx.fed < tx.rxBytes.length && now >= tx.rxBytes[tx.fed].tArr) {
            const rb = tx.rxBytes[tx.fed++];
            rxShown.push(hex(rb.val) + (rb.ferr ? '!' : ''));
            const res = par.feed(rb.val);
            if (res === 'ok') applyValid(par, tx.dir, now);
            if (res === 'bad') { badN++; lastRes = `✗ ${par.last.why}`; }
            if (res === 'sync' && rb.val !== 0xaa) lastRes = `… bỏ qua byte 0x${hex(rb.val)}${rb.ferr ? ' (lỗi khung: stop bit = 0)' : ''} — đang chờ 0xAA để đồng bộ`;
          }
          if (fault === 'tx-tx' && now > tx.tEnd - 0.05 && !tx.sparked) { tx.sparked = true; lastRes = '✗ Không có byte nào tới đầu RX — hai đầu TX đối đầu nhau'; }
          if (now > tx.tEnd && tx.fed === tx.rxBytes.length && par.ps !== 0 && fault !== 'tx-tx') {
            // khung cụt (vd. LEN sai) — bộ nhận vẫn đang chờ byte; khung sau sẽ đồng bộ lại
            if (!tx.noteStuck) { tx.noteStuck = true; if (!lastRes.startsWith('✗')) lastRes = '… bộ nhận còn chờ byte (khung cụt) — sẽ tự đồng bộ lại ở 0xAA sau'; }
          }
        }
        for (let k = used; k < pool.length; k++) pool[k].visible = false;

        // ---- an toàn heartbeat trên PIC (sự cố ESP treo: 300 ms thật ≈ 3 s màn hình) ----
        if (treo) {
          const ms = (now - lastValid) * 100;
          if (ms > 300 && !lost) { lost = true; wheelL = wheelR = 0; mainB = sideB = false; fx.flash(picB, { size: 20, color: 0xff4040 }); }
          lastRes = lost ? `⛔ ${ms.toFixed(0)} ms không có khung hợp lệ > 300 ms → PIC DỪNG 2 bánh + chổi, flags.bit1 = 1` : `⏳ ESP32 im lặng ${ms.toFixed(0)} ms… (hạn 300 ms)`;
        }

        // ---- hình ảnh trên bo ----
        okFlash = Math.max(0, okFlash - dt); espFlash = Math.max(0, espFlash - dt);
        ledOk.emissiveIntensity = okFlash > 0 ? 1.5 : 0;
        ledMain.emissiveIntensity = mainB ? 1.2 : 0;
        ledSide.emissiveIntensity = sideB ? 1.2 : 0;
        ledLost.emissiveIntensity = lost && Math.floor(now * 3) % 2 ? 1.5 : 0;
        espRgbMat.emissive.setRGB(0, espFlash > 0 ? 1 : 0, espFlash > 0 ? 0.3 : 0);
        for (const [bar, mat, v] of [[barL, barMatL, wheelL], [barR, barMatR, wheelR]]) {
          const h = Math.max(0.3, (Math.abs(v) / 1000) * 20);
          bar.scale.y = h; bar.position.y = h / 2;
          mat.color.setHex(v >= 0 ? 0x3fcf8e : 0xff5a5a); mat.emissive.setHex(v >= 0 ? 0x1f6b3a : 0x6b1f1f);
        }
        lshFets.forEach((m, k) => { const on = tx && ((k === 1 && tx.dir === 'esp2pic') || (k === 0 && tx.dir === 'pic2esp')) && txV < 0.5; m.material.emissive.setRGB(0, on ? 0.9 : 0, on ? 0.4 : 0); });

        // ---- số đo ----
        const [cmdPrev, plPrev] = payloadFor(p);
        const fr = buildFrame(cmdPrev, plPrev);
        readout('frame', fr.map(hex).join(' '));
        const chkExpr = fr.slice(1, -1).map(hex).join('⊕');
        readout('fields', `LEN=${fr[1]} · CMD=0x${hex(fr[2])} ${CMD_NAMES[fr[2]]} · ${describe(fr[2], fr.slice(3, -1))} · CHK = ${chkExpr} = ${hex(fr[fr.length - 1])}`);
        readout('bit', treo ? 'ESP32 treo — không phát' : fault === 'sai-baud' && tx?.dir === 'esp2pic' ? `${curBit} (ESP32 phát 115200 — nhanh gấp 6)` : curBit);
        readout('rx', rxShown.length ? rxShown.slice(-16).join(' ') : '—');
        readout('result', lastRes);
        readout('count', `${okN} hợp lệ · ${badN} bị bỏ`);
        const nb = fr.length;
        readout('real', `${nb} byte × 10 bit / ${BAUD} = ${((nb * 10 * 1000) / BAUD).toFixed(2)} ms · ESP32 gửi DRIVE mỗi 50 ms`);
        return [txV, Math.max(-0.3, Math.min(5.5, rxV))];
      },
    };

    function tintMat(m, c) { const x = m.clone(); x.color.set(c); return x; }
    function t0Now() { return clock; }
  },
};
