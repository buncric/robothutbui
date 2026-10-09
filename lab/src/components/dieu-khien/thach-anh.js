// ⏱️ Thạch anh 20 MHz + 2 tụ 22 pF — "nhịp tim" của PIC16F877A (chân 13 OSC1, 14 OSC2).
// Mô phỏng: mạch dao động Pierce (cổng đảo trong PIC + thạch anh + 2 tụ), tần số kéo theo tụ tải (ppm),
// điều kiện khởi động (điện trở âm so với ESR), thời gian khởi động, Fosc/4 = 5 MIPS. Sóng làm chậm 10 triệu lần.

import { cadAttach, ownMaterial } from '../../core/cadParts.js';

const F_NOM = 20e6;        // tần số danh định ở CL = 18 pF
const CL_SPEC = 18e-12;    // tụ tải mà nhà sản xuất hiệu chuẩn
const C1M = 15e-15;        // tụ động (motional capacitance) của tinh thể
const C0 = 5e-12;          // tụ song song (giữa 2 điện cực + vỏ)
const R1 = 25;             // điện trở nối tiếp tương đương ESR (Ω)
const C_PIN = 5e-12;       // điện dung chân OSC1/OSC2 + đường mạch mỗi bên
const C_STRAY = 1.5e-12;   // điện dung ký sinh giữa 2 chân
// fs: tần số cộng hưởng nối tiếp, suy từ F_NOM ở CL_SPEC
const FS = F_NOM / (1 + C1M / (2 * (C0 + CL_SPEC)));
const L1 = 1 / ((2 * Math.PI * FS) ** 2 * C1M);
// Cổng đảo trong PIC theo chế độ fuse: hỗ dẫn gm (S) và băng thông (Hz)
const FUSE = { LP: { gm: 0.15e-3, bw: 0.25e6 }, XT: { gm: 1.5e-3, bw: 12e6 }, HS: { gm: 7e-3, bw: 40e6 } };
const SLOW_HZ = 2;         // 20 MHz hiển thị thành 2 Hz

export default {
  id: 'thach-anh',
  name: 'Thạch anh 20 MHz + 2 tụ 22 pF',
  category: 'dieu-khien',
  order: 2,
  icon: '⏱️',
  summary: 'Miếng thạch anh mỏng 0.08 mm rung 20 triệu lần/giây giữ nhịp cho PIC (5 triệu lệnh/giây, UART 19200, PWM 20 kHz). Mở vỏ xem tinh thể, đổi tụ tải để thấy tần số lệch ppm — hoặc tắt hẳn.',
  tags: ['thạch anh', 'crystal', 'HC-49', '20MHz', 'dao động', 'Pierce', 'oscillator', '22pF', 'OSC1', 'OSC2', 'fuse HS'],

  params: [
    { id: 'cad', label: '🧊 Mô hình CAD thật (HC-49/S + tụ đĩa 22 pF)', type: 'toggle', value: true, hint: 'Tắt = mô hình học tự dựng. "Mở vỏ" vẫn cho thấy lát thạch anh rung bên trong vỏ CAD.' },
    { id: 'cap', label: 'Hai tụ tải C1 = C2', type: 'select', value: '22', options: [['0', 'Không hàn tụ'], ['10', '10 pF'], ['15', '15 pF'], ['22', '22 pF (chuẩn dự án)'], ['33', '33 pF'], ['47', '47 pF'], ['100', '100 pF'], ['220', '220 pF (mã "221")']] },
    { id: 'fuse', label: 'Fuse chế độ dao động (#fuses)', type: 'select', value: 'HS', options: [['HS', 'HS — High Speed (> 4 MHz)'], ['XT', 'XT — thạch anh 0.2–4 MHz'], ['LP', 'LP — Low Power 32 kHz']] },
    { id: 'open', label: 'Mở vỏ kim loại xem tinh thể', type: 'toggle', value: true },
    { id: 'power', label: '⏻ Cấp nguồn lại (xem dao động khởi động)', type: 'button' },
  ],
  readouts: [
    { id: 'f', label: 'Tần số thực', unit: 'MHz' },
    { id: 'ppm', label: 'Sai lệch so với 20 MHz', unit: 'ppm' },
    { id: 'cl', label: 'Tụ tải CL = Ca·Cb/(Ca+Cb) + C_ký sinh', unit: 'pF' },
    { id: 'gm', label: 'Hệ số an toàn khởi động |R_âm| / ESR', unit: '×' },
    { id: 'tst', label: 'Thời gian khởi động (ước tính)', unit: 'ms' },
    { id: 'mips', label: 'Chu kỳ lệnh Fosc/4', unit: '' },
    { id: 'clock', label: 'Đồng hồ phần mềm lệch', unit: 's/ngày' },
    { id: 'state', label: 'Trạng thái', unit: '' },
  ],
  scope: {
    window: 2,
    note: '(đã làm chậm 10 000 000×: 20 MHz → 2 Hz; Fosc/4 = 5 MHz → 0.5 Hz)',
    channels: [
      { name: 'OSC2 (ra cổng đảo)', unit: 'V', min: -0.5, max: 5.5, color: '#ffd34d' },
      { name: 'OSC1 (vào)', unit: 'V', min: -0.5, max: 5.5, color: '#4cc2ff' },
      { name: 'Xung lệnh Fosc/4', unit: 'V', min: -0.5, max: 5.5, color: '#3fcf8e' },
    ],
  },

  info: {
    overview: `
      <p><b>Thạch anh (quartz crystal)</b> là một lát tinh thể SiO₂ cắt theo góc đặc biệt (AT-cut), hai mặt phủ bạc làm điện cực. Thạch anh có tính <b>áp điện</b>: đặt điện áp thì nó biến dạng, biến dạng thì sinh điện áp. Lát càng mỏng, rung càng nhanh: 20 MHz ứng với dày chỉ ~0.083 mm.</p>
      <p>Kết hợp với cổng đảo bên trong PIC và <b>2 tụ 22 pF</b> xuống GND, nó tạo thành <b>mạch dao động Pierce</b> cực kỳ ổn định (sai số ±30 ppm = ±0.003 %). Mọi thứ trong PIC — tốc độ lệnh, baud UART 19200, PWM 20 kHz, đếm thời gian 300 ms mất liên lạc — đều dựa trên nhịp này.</p>
      <p>Thử: đổi tụ sang <b>220 pF</b> rồi bấm <b>Cấp nguồn lại</b> — không dao động, PIC "chết lâm sàng". Đổi fuse sang <b>XT</b>: cổng đảo yếu, khởi động chậm/chập chờn.</p>`,
    specs: [
      ['Vỏ', 'HC-49/S (HC-49/US): 11.05 × 4.65 × 3.5 mm, 2 chân cách 4.88 mm, không phân cực'],
      ['Tần số', '20.000 MHz cơ bản (fundamental), dao động song song ở CL = 18 pF'],
      ['Sai số', '±30 ppm ở 25 °C, ±50 ppm theo nhiệt độ (−20…70 °C)'],
      ['Thông số động', 'C1 ≈ 15 fF · L1 ≈ 4.2 mH · R1 (ESR) ≤ 40 Ω, điển hình 25 Ω · C0 ≈ 5 pF · Q ≈ 20 000'],
      ['Tụ tải', '2 × 22 pF gốm NP0/C0G (mã in "220"), mỗi tụ từ 1 chân xuống GND'],
      ['PIC16F877A', 'Fuse HS cho 4–20 MHz; 1 chu kỳ lệnh = 4 xung = 200 ns → 5 MIPS'],
    ],
    principle: `
      <h4>1. Mạch tương đương của thạch anh</h4>
      <p>Nhánh nối tiếp <code>L1–C1–R1</code> (tượng trưng cho khối lượng – độ đàn hồi – ma sát của dao động cơ học) song song với <code>C0</code>. Cộng hưởng nối tiếp <code>fs = 1/(2π√(L1·C1))</code>.</p>
      <h4>2. Tụ tải kéo tần số</h4>
      <p>Trong mạch Pierce, thạch anh "nhìn thấy" tụ tải <code>CL = Ca·Cb/(Ca + Cb) + C_ký sinh</code> (Ca, Cb = tụ 22 pF + ~5 pF điện dung chân). Tần số thực: <code>f = fs·(1 + C1 / (2·(C0 + CL)))</code>. CL nhỏ hơn thông số → tần số cao hơn (vài chục ppm). 22 pF → CL ≈ 15 pF → lệch ~+50 ppm: với UART (cho phép ±2 %) thì không đáng kể.</p>
      <h4>3. Điều kiện để dao động bắt đầu</h4>
      <p>Cổng đảo + 2 tụ tạo ra một <b>điện trở âm</b> <code>|R_âm| ≈ gm / (ω²·Ca·Cb)</code>. Cần <code>|R_âm| &gt; R1</code> (thực tế ≥ 5 lần) thì biên độ mới tự lớn lên từ nhiễu: biên độ tăng theo <code>e^(αt)</code>, <code>α = (|R_âm| − R1) / (2·L1)</code>.</p>
      <ul>
        <li>Tụ quá lớn (220 pF): ω²·Ca·Cb lớn → |R_âm| &lt; R1 → <b>không dao động</b>.</li>
        <li>Fuse XT/LP: gm nhỏ và độ lợi giảm mạnh ở tần số cao → yếu ở 20 MHz (XT chập chờn, LP tắt hẳn).</li>
        <li>Không tụ: dao động "quá mạnh", lệch hàng trăm ppm, có thể nhảy sang họa âm.</li>
      </ul>
      <h4>4. Từ 20 MHz tới 5 MIPS</h4>
      <p>PIC chia xung thành 4 pha Q1–Q4 cho mỗi chu kỳ lệnh: <code>Tcy = 4/Fosc = 200 ns</code>. Sau khi cấp nguồn, bộ đếm OST chờ thêm 1024 xung (~51 µs) cho dao động ổn định, PWRT chờ ~72 ms.</p>`,
    inRobot: `
      <ul>
        <li>Thạch anh 20 MHz nối <b>chân 13 (OSC1/CLKI)</b> và <b>chân 14 (OSC2/CLKO)</b>, mỗi chân một tụ 22 pF xuống GND (docs/01, bảng chân PIC). Fuse <code>HS</code>.</li>
        <li>Firmware CCS: <code>#fuses HS, NOWDT, NOLVP, PUT, BROWNOUT</code> và <code>#use delay(clock=20000000)</code>; <code>#use rs232(baud=19200, …)</code> → SPBRG = 64, BRGH = 1 → 19231 baud (+0.16 %).</li>
        <li>PWM bánh: Timer2 <code>PR2 = 249</code> → 20 MHz/4/250 = 20 kHz. Sai 50 ppm của thạch anh không ảnh hưởng gì.</li>
        <li>Đặt thạch anh <b>sát chân 13–14</b> (&lt; 10 mm), tụ nối GND ngắn, phủ đồng GND dưới thạch anh, tránh xa đường PWM động cơ.</li>
      </ul>`,
    mistakes: `
      <ul>
        <li>Đọc nhầm mã tụ: "220" = 22 pF, "221" = 220 pF, "22n" = 22 nF → mạch không dao động.</li>
        <li>Để fuse XT (mặc định của nhiều ví dụ 4 MHz) với thạch anh 20 MHz → chạy chập chờn, hay chỉ chạy khi chạm tay vào chân OSC.</li>
        <li>Đo OSC1 bằng que đo ×1 (điện dung 50–100 pF) → chính que đo làm tắt dao động. Dùng que ×10 và đo ở OSC2.</li>
        <li>Thạch anh đặt xa, dây nối dài → nhiễu từ PWM động cơ lọt vào, PIC reset ngẫu nhiên.</li>
        <li>Làm rơi bo/robot mạnh: lát thạch anh có thể nứt → mất dao động.</li>
        <li>Quên <code>#use delay(clock=20M)</code> khớp với thạch anh → delay_ms và baud sai hết.</li>
      </ul>`,
    quiz: [
      { q: 'Hai tụ 22 pF, điện dung chân ~5 pF mỗi bên, ký sinh 1.5 pF. CL bằng bao nhiêu?', a: 'Ca = Cb = 27 pF → CL = 27·27/54 + 1.5 = 13.5 + 1.5 = 15 pF.' },
      { q: 'Vì sao thay tụ 22 pF bằng 220 pF thì PIC không chạy?', a: '|R_âm| ≈ gm/(ω²·Ca·Cb) giảm ~70 lần (≈ 7 Ω) < ESR 25 Ω → năng lượng mất mỗi chu kỳ lớn hơn năng lượng bơm vào → không dao động được.' },
      { q: 'Thạch anh 20 MHz, một lệnh PIC mất bao lâu? Một vòng lặp 10 lệnh?', a: 'Tcy = 4/20 MHz = 0.2 µs; 10 lệnh = 2 µs (lệnh nhảy tốn 2 chu kỳ).' },
    ],
  },

  steps: [
    { title: 'Bước 1 — Vị trí: sát chân 13–14 của PIC', text: 'Trên bo PIC tối thiểu, chân 11 (VDD), 12 (VSS), 13 (OSC1), 14 (OSC2) nằm cạnh nhau. Chừa chỗ cho thạch anh cách chân 13–14 dưới 10 mm. Nếu PIC cắm đế (socket) thì hàn đế trước.' },
    { title: 'Bước 2 — Hàn thạch anh HC-49/S', text: 'Thạch anh <b>không có cực tính</b>. Hai chân cách 4.88 mm (lỗ 5.08 mm vẫn vừa). Hàn nhanh &lt; 3 s mỗi chân (mỏ hàn 330 °C), không bẻ chân sát thân vỏ — lớp thủy tinh cách điện ở đáy dễ nứt.' },
    { title: 'Bước 3 — Hai tụ 22 pF xuống GND', text: 'Tụ gốm đĩa/NP0 mã "220". Một chân nối chân thạch anh (cùng OSC1 hoặc OSC2), chân kia nối GND bằng đường <b>ngắn nhất</b>. Đo bằng đồng hồ: OSC1–GND và OSC2–GND không chập.' },
    { title: 'Bước 4 — Phủ đồng GND bảo vệ', text: 'Đổ đồng GND dưới & quanh thạch anh (guard ring), nối về chân VSS 12. Không cho đường tín hiệu khác (PWM, UART) chạy bên dưới. Nếu vỏ thạch anh có tai hàn, có thể hàn vỏ xuống GND.' },
    { title: 'Bước 5 — Fuse & đo kiểm', text: 'CCS: <code>#fuses HS,NOWDT,NOLVP,PUT,BROWNOUT</code> + <code>#use delay(clock=20000000)</code>. Nạp chương trình nháy LED 1 Hz, bấm giờ 60 nháy = 60 s. Có máy hiện sóng: que ×10 ở OSC2 thấy sóng ~4–5 Vpp, 50 ns/chu kỳ.' },
  ],

  faults: [
    { id: 'tu-220p', label: 'Hàn nhầm tụ 220 pF (mã "221") thay cho 22 pF', severity: 'loi',
      what: '<p>Nạp chương trình thành công (PICkit dùng xung clock riêng) nhưng PIC không làm gì: LED không nháy, UART im lặng. Đo OSC2 thấy mức DC ~2.5 V phẳng.</p>',
      why: '<p><code>|R_âm| = gm/(ω²·Ca·Cb) ≈ 5.6 mS / ((2π·20 MHz)² · (225 pF)²) ≈ 7 Ω</code> — nhỏ hơn ESR 25 Ω của thạch anh. Mạch tiêu hao nhiều năng lượng hơn mức cổng đảo bơm vào → dao động tắt ngay khi vừa nhen. Không có xung nhịp = CPU đứng im.</p>',
      fix: '<p>Đọc kỹ mã tụ: 2 số đầu là giá trị, số thứ 3 là số chữ số 0 (pF): 220 = 22 pF, 221 = 220 pF. Đo bằng đồng hồ có thang nF/pF trước khi hàn.</p>' },
    { id: 'fuse-xt', label: 'Để fuse XT với thạch anh 20 MHz', severity: 'loi',
      what: '<p>PIC lúc chạy lúc không; chạm tay vào chân thạch anh thì chạy; trời lạnh không khởi động. Baud UART đôi khi sai khiến ESP32 báo checksum lỗi.</p>',
      why: '<p>Chế độ XT dùng cổng đảo yếu (gm ~1.5 mS) dành cho thạch anh ≤ 4 MHz; ở 20 MHz độ lợi còn ~25 % → <code>|R_âm|</code> chỉ cỡ ESR → hệ số an toàn &lt; 2, khởi động phụ thuộc may rủi (nhiệt độ, độ ẩm, điện dung tay).</p>',
      fix: '<p>4–20 MHz: fuse <code>HS</code>. Kiểm tra lại dòng <code>#fuses</code> trong <code>main.c</code> mỗi khi copy code ví dụ từ Internet.</p>' },
    { id: 'thieu-tu', label: 'Quên hàn 2 tụ tải', severity: 'nhe',
      what: '<p>PIC vẫn chạy, nhưng đồng hồ phần mềm nhanh vài chục giây mỗi ngày; một số mẫu thạch anh dao động ở họa âm 3 (~60 MHz) hoặc biên độ méo.</p>',
      why: '<p>Không có tụ ngoài, chỉ còn ~5 pF điện dung chân → CL ≈ 4 pF ≪ 18 pF → tần số kéo lên <code>≈ +500 ppm</code>. Biên độ và công suất kích (drive level) cao làm thạch anh già nhanh.</p>',
      fix: '<p>Luôn hàn đủ 2 tụ theo datasheet thạch anh: <code>C = 2·(CL − C_ký sinh)</code> ≈ 2·(18 − 6) ≈ 22–27 pF.</p>' },
    { id: 'roi-nut', label: 'Rơi robot — lát thạch anh nứt', severity: 'hong',
      what: '<p>Sau cú rơi, robot "chết": PIC không chạy dù nguồn 5 V đủ, thay PIC khác cũng vậy. Gõ nhẹ vào thạch anh đôi khi chạy lại vài giây.</p>',
      why: '<p>Lát thạch anh dày 0.08 mm được giữ bằng 2 kẹp lò xo và keo dẫn điện; gia tốc va đập hàng nghìn g có thể làm nứt lát hoặc bong điện cực bạc → R1 tăng vọt hoặc hở mạch → không còn cộng hưởng.</p>',
      fix: '<p>Thay thạch anh (rẻ). Gắn bo bằng đệm cao su; với robot hay va đập có thể dùng bộ dao động MEMS hoặc thạch anh SMD nhỏ (chịu sốc tốt hơn).</p>' },
    { id: 'day-dai', label: 'Thạch anh đặt xa PIC, dây 5 cm cạnh đường PWM động cơ', severity: 'loi',
      what: '<p>Robot chạy được, nhưng mỗi khi bánh xe tăng tốc thì PIC reset hoặc treo; ESP32 báo PIC_LOST.</p>',
      why: '<p>Đường OSC1 là nút trở kháng cao (~MΩ) — như một ăng-ten. Gai nhiễu từ PWM 20 kHz (dV/dt ~ 1 V/ns trên dây động cơ) ghép điện dung vào làm lệch pha dao động, gây xung nhịp "méo" (glitch) → CPU nhảy sai lệnh.</p>',
      fix: '<p>Thạch anh sát chân 13–14, đường &lt; 10 mm, guard ring GND, dây động cơ xoắn đôi và đi xa phần logic, tụ 100 nF sát VDD.</p>' },
  ],

  build(ctx) {
    const { THREE, MAT, PIN_COLORS, geom, label, readout, fx } = ctx;
    const { mesh, group, part, cyl, box, pcb } = geom;
    const root = new THREE.Group();
    root.add(pcb(40, 28, { mat: MAT.pcbGreen }));

    // ---------- hình "viên thuốc" (stadium) cho vỏ HC-49 ----------
    function stadium(L, W, H) {
      const r = W / 2;
      const s = new THREE.Shape();
      s.moveTo(-L / 2 + r, -r);
      s.lineTo(L / 2 - r, -r);
      s.absarc(L / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2, false);
      s.lineTo(-L / 2 + r, r);
      s.absarc(-L / 2 + r, 0, r, Math.PI / 2, (3 * Math.PI) / 2, false);
      const g = new THREE.ExtrudeGeometry(s, { depth: H, bevelEnabled: false, curveSegments: 16 });
      g.rotateX(-Math.PI / 2);
      return g;
    }

    // ---------- PIC (một phần) với chân 11–15 ----------
    const pic = new THREE.Group();
    pic.position.set(-9, 0, -4);
    pic.add(mesh(box(16, 3.6, 13, 0.5), MAT.icBody, { y: 2.6 }));
    const pinInfo = [[11, 'VDD', 'power', '+5 V, tụ 100 nF sát chân'], [12, 'VSS', 'ground', 'GND — tụ thạch anh nối về đây'], [13, 'OSC1/CLKI', 'osc', 'Vào cổng đảo dao động — nút trở kháng cao, rất nhạy nhiễu'], [14, 'OSC2/CLKO', 'osc', 'Ra cổng đảo — sóng gần vuông ~4–5 Vpp; đo ở đây bằng que ×10'], [15, 'RC0/T1CKI', 'input', 'Encoder bánh phải (không liên quan dao động)']];
    const pinX = (k) => -5.08 + k * 2.54;
    pinInfo.forEach(([n, nm, grp, desc], k) => {
      const pg = group(mesh(box(1.5, 0.25, 1.4), MAT.tin.clone(), { y: 2, z: 6.8 }), mesh(box(0.5, 2.2, 0.25), MAT.tin.clone(), { y: 1, z: 7.5 }));
      pg.position.x = pinX(k);
      pg.traverse((o) => { if (o.isMesh) o.material.color.set(PIN_COLORS[grp]); });
      pic.add(part(pg, `Chân ${n} — ${nm}`, desc));
    });
    root.add(part(pic, 'PIC16F877A (một phần, cạnh chân 11–15)', 'Bên trong có sẵn cổng đảo khuếch đại cho dao động Pierce giữa OSC1 và OSC2.'));
    label(root, '13 OSC1', [-9 + pinX(2), 6, 8]);
    label(root, '14 OSC2', [-9 + pinX(3), 6, 10.5]);
    const xOsc1 = -9 + pinX(2), xOsc2 = -9 + pinX(3), zPin = -4 + 7.5;

    // ---------- đường mạch đồng ----------
    const traceMat = MAT.copper.clone();
    const tr = (x0, z0, x1, z1, w = 0.6) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const m = mesh(box(len, 0.05, w), traceMat, { x: (x0 + x1) / 2, y: 0.03, z: (z0 + z1) / 2, ry: -Math.atan2(z1 - z0, x1 - x0) });
      return m;
    };
    const XC = 8, ZC = 6, LS = 2.44;          // tâm thạch anh, nửa khoảng chân
    const traces = group(
      tr(xOsc1, zPin, xOsc1, 9), tr(xOsc1, 9, XC - LS, 9), tr(XC - LS, 9, XC - LS, ZC),
      tr(xOsc2, zPin, xOsc2, 11), tr(xOsc2, 11, XC + LS, 11), tr(XC + LS, 11, XC + LS, ZC),
      tr(XC - LS, 9, XC - LS, 14), tr(XC + LS, 11, XC + LS, 14),
      tr(-9 + pinX(1), zPin, -9 + pinX(1), 13, 1.2), tr(-9 + pinX(1), 13, -4, 13, 1.2), tr(-4, 13, -4, 19, 1.2), tr(-4, 19, 16, 19, 1.2));
    root.add(part(traces, 'Đường mạch OSC1/OSC2 & GND', 'Càng ngắn càng tốt (< 10 mm). Đường GND to nối 2 tụ về chân VSS 12.'));
    const guard = mesh(box(16, 0.04, 9), MAT.copper.clone(), { x: XC, y: 0.015, z: ZC - 1 });
    guard.material.color.set(0xb06a2c);
    root.add(part(guard, 'Mảng đồng GND bảo vệ (guard)', 'Đổ đồng nối GND dưới thạch anh: chắn nhiễu, không cho đường tín hiệu khác chạy bên dưới.'));

    // ---------- thạch anh HC-49/S ----------
    const xtal = new THREE.Group();
    xtal.position.set(XC, 0, ZC);
    root.add(xtal);
    const base = mesh(stadium(11.5, 5.0, 0.5), MAT.zinc, { y: 0.4 });
    const canMat = MAT.zinc.clone();
    canMat.transparent = true;
    const can = mesh(stadium(11.05, 4.65, 3.0), canMat, { y: 0.9 });
    xtal.add(part(group(base, can), 'Vỏ kim loại HC-49/S (11 × 4.65 × 3.5 mm)', 'Vỏ thép mạ niken hàn kín, bên trong là chân không/khí trơ để lát thạch anh không bị ẩm & bụi làm lệch tần số.'));
    const glassMat = MAT.glass.clone();
    const seal = mesh(stadium(10.5, 4.2, 0.35), MAT.plasticWhite, { y: 0.45 });
    xtal.add(part(seal, 'Đế thủy tinh cách điện', 'Hai chân xuyên qua đế thủy tinh hàn kín. Bẻ chân sát đế dễ làm nứt → hở khí.'));
    const leads = new THREE.Group();
    for (const s of [-1, 1]) leads.add(mesh(cyl(0.22, 0.22, 4.5, 8), MAT.tin, { x: s * LS, y: -1.6 }));
    xtal.add(part(leads, 'Hai chân thạch anh (cách 4.88 mm)', 'Không phân cực — lắp chiều nào cũng được.'));
    // lát thạch anh + điện cực + kẹp
    const inner = new THREE.Group();
    inner.position.y = 2.4;
    const blankMat = new THREE.MeshPhysicalMaterial({ color: 0xe8f4ff, roughness: 0.05, transmission: 0.6, transparent: true, opacity: 0.85, thickness: 0.1 });
    const blankL = mesh(box(4, 2.0, 0.12), blankMat, { x: -2 });
    const blankR = mesh(box(4, 2.0, 0.12), blankMat, { x: 2 });
    const blank = group(blankL, blankR);
    inner.add(part(blank, 'Lát thạch anh AT-cut (dày ~0.083 mm)', 'Tinh thể SiO₂ cắt nghiêng 35°15′. Dao động "trượt theo bề dày": f ≈ 1.661 MHz·mm / bề dày → 0.083 mm cho 20 MHz.'));
    const elMat = MAT.aluminum.clone();
    const electrodes = group(mesh(box(5, 1.4, 0.03), elMat, { z: 0.08 }), mesh(box(5, 1.4, 0.03), elMat, { z: -0.08 }));
    inner.add(part(electrodes, 'Điện cực bạc 2 mặt', 'Lớp bạc bay hơi phủ 2 mặt lát — điện áp đặt vào làm lát biến dạng (áp điện ngược), lát rung sinh điện áp (áp điện thuận).'));
    const clips = group(mesh(box(0.4, 2.8, 0.8), MAT.steel, { x: -4.2, y: -0.4 }), mesh(box(0.4, 2.8, 0.8), MAT.steel, { x: 4.2, y: -0.4 }));
    inner.add(part(clips, 'Kẹp lò xo + keo dẫn điện', 'Giữ lát ở 2 mép (nơi gần như không rung) và nối điện cực ra chân.'));
    xtal.add(inner);
    inner.traverse((o) => (o.userData.noCut = true));
    label(xtal, 'Thạch anh 20.000 MHz', [0, 6, 0]);

    // ---------- CAD thật: thạch anh HC-49/S (thư viện KiCad) ----------
    // Khung vendor: thân dài theo X, 2 chân x = ±2,44 thòi xuống dưới y = 0 (mặt PCB) — trùng khung `xtal`.
    let cadCanMeshes = [];
    const cadX = cadAttach(ctx, xtal, 'vendor/crystal_hc49_4h_vertical', {
      onBottom: false,
      hide: [base.parent, seal, leads],
      partDefault: ['Thạch anh 20 MHz HC-49/S (CAD thật)', 'Vỏ HC-49/S thấp 11 × 4,7 × ~4 mm, 2 chân cách 4,88 mm — loại bán sẵn ở các cửa hàng linh kiện.'],
      parts: {
        crystal_hc49s: ['Vỏ kim loại HC-49/S', 'Vỏ thép mạ niken hàn kín trên đế thủy tinh; bên trong là lát thạch anh AT-cut trong chân không/khí trơ. Bật "Mở vỏ" để nhìn xuyên vào trong.'],
        pin_1: ['Chân thạch anh 1 → OSC1 (chân 13)', 'Không phân cực — lắp chiều nào cũng được. Hàn nhanh < 3 s.'],
        pin_2: ['Chân thạch anh 2 → OSC2 (chân 14)', 'Không phân cực. Bẻ chân sát đế dễ làm nứt đế thủy tinh.'],
      },
      onLoad(c) { cadCanMeshes = []; c.node('crystal_hc49s')?.traverse((o) => { if (o.isMesh) { ownMaterial(o); cadCanMeshes.push(o); } }); },
    });
    let lastOpen = null;

    // ---------- 2 tụ gốm 22 pF ----------
    const caps = [];
    for (const [x, nm, pin] of [[XC - LS, 'C1', 'OSC1 (chân 13)'], [XC + LS, 'C2', 'OSC2 (chân 14)']]) {
      const c = new THREE.Group();
      c.add(mesh(cyl(2.1, 2.1, 1.6, 24), MAT.plasticYellow.clone(), { y: 4.8, rx: Math.PI / 2 }));
      c.add(mesh(cyl(0.2, 0.2, 4, 8), MAT.tin, { x: -1.27, y: 2 }), mesh(cyl(0.2, 0.2, 4, 8), MAT.tin, { x: 1.27, y: 2 }));
      c.position.set(x + (nm === 'C1' ? -1.27 : 1.27), 0, 16.5);
      c.children[0].material.color.set(0xd98a2b);
      root.add(part(c, `Tụ ${nm} 22 pF gốm NP0 (mã "220")`, `Từ ${pin} xuống GND. Cùng với C còn lại quyết định tụ tải CL và điện trở âm của mạch Pierce.`));
      caps.push(c);
      // CAD: tụ gốm đĩa Ø3 mm, chân 2,5 mm (KiCad) — đĩa nằm trong mặt XY như mô hình học
      c.userData.cad = cadAttach(ctx, c, 'vendor/c_disc_d3_0mm_w1_6mm_p2_50mm', {
        onBottom: false, frame: false,
        hide: [...c.children],
        partDefault: [`Tụ ${nm} 22 pF (CAD thật)`, `Tụ gốm đĩa Ø3 mm, chân cách 2,5 mm, từ ${pin} xuống GND.`],
        parts: {
          cap_ceramic_22p: [`Tụ ${nm} 22 pF gốm NP0 (mã "220")`, `Từ ${pin} xuống GND. Cùng với tụ còn lại quyết định tụ tải CL và điện trở âm của mạch Pierce.`],
          'pin_*': ['Chân tụ', 'Không phân cực. Một chân nối chân thạch anh, chân kia về GND ngắn nhất có thể.'],
        },
      });
    }
    label(root, '2 × 22 pF', [XC, 9, 17]);

    // ---------- trạng thái ----------
    let amp = 0, ph = 0, startT = 0, lastKey = '', cracked = false, step = -1;
    let fault = null, noise = 0;

    function physics(capPf, fuse, extraStray, r1) {
      const Ca = capPf * 1e-12 + C_PIN + extraStray, Cb = Ca;
      const CL = (Ca * Cb) / (Ca + Cb) + C_STRAY;
      const f = FS * (1 + C1M / (2 * (C0 + CL)));
      const w = 2 * Math.PI * f;
      const fz = FUSE[fuse];
      const gm = fz.gm / (1 + (f / fz.bw) ** 2);
      const rneg = gm / (w * w * Ca * Cb);
      const margin = rneg / r1;
      const alpha = (rneg - r1) / (2 * L1);                // 1/s
      const tStart = alpha > 0 ? Math.log(1e6) / alpha : Infinity;   // từ ~1 µV nhiễu lên ~1 V
      return { CL, f, ppm: (f / F_NOM - 1) * 1e6, margin, tStart };
    }

    return {
      object: root,
      onAction(id) { if (id === 'power') { amp = 0.002; startT = 0; } },
      setStep(i) { step = i; },
      triggerFault(id) {
        fault = id; amp = 0.002; startT = 0;
        if (id === 'roi-nut') { cracked = true; fx.sparks(xtal, { count: 12, speed: 15, size: 0.3 }); }
      },
      resetFault() { fault = null; cracked = false; amp = 0.002; startT = 0; blankL.rotation.set(0, 0, 0); blankR.rotation.set(0, 0, 0); blankL.position.y = blankR.position.y = 0; },
      update(dt, t, p) {
        // ---- tháo lắp ----
        const s = step;
        xtal.visible = s < 0 || s >= 1;
        caps.forEach((c) => (c.visible = s < 0 || s >= 2));
        guard.visible = s < 0 || s >= 3;
        canMat.opacity = p.open ? 0.22 : 1;
        canMat.depthWrite = !p.open;
        const cadOn = cadX.sync(p);
        caps.forEach((c) => c.userData.cad.sync(p));
        if (cadOn && lastOpen !== p.open) {
          lastOpen = p.open;
          for (const o of cadCanMeshes) { const m = o.material; m.transparent = true; m.opacity = p.open ? 0.22 : 1; m.depthWrite = !p.open; m.needsUpdate = true; }
        }
        if (!cadOn) lastOpen = null;

        let capPf = Number(p.cap), fuse = p.fuse, stray = 0, r1 = R1;
        if (fault === 'tu-220p') capPf = 220;
        if (fault === 'fuse-xt') fuse = 'XT';
        if (fault === 'thieu-tu') capPf = 0;
        if (fault === 'day-dai') stray = 6e-12;
        if (cracked) r1 = 5000;
        const key = `${capPf}|${fuse}|${stray}|${r1}`;
        if (key !== lastKey) { lastKey = key; amp = 0.002; startT = 0; }
        const ph_ = physics(capPf, fuse, stray, r1);
        const osc = ph_.margin > 1;
        // biên độ đích: bão hòa mềm theo hệ số an toàn
        const target = osc ? Math.min(1, 0.35 + 0.2 * Math.log10(ph_.margin)) : 0;
        // tốc độ lớn lên trên màn hình: 1 ms thật ≈ 2 s hiển thị (giới hạn 0.4…6 s)
        const dispT = osc ? Math.min(6, Math.max(0.4, ph_.tStart * 2000)) : 1;
        startT += dt;
        if (osc) amp = Math.min(target, amp * Math.exp((Math.log(1e3) / dispT) * dt));
        else amp *= Math.exp(-3 * dt);
        if (fault === 'fuse-xt') amp *= 0.97 + 0.03 * Math.sin(t * 1.3);    // chập chờn
        ph += 2 * Math.PI * SLOW_HZ * dt;
        noise = fault === 'day-dai' ? (Math.sin(t * 3.1) > 0.92 ? 1.6 * Math.sin(t * 40) : 0) : 0;
        const s1 = Math.sin(ph + noise);
        const vOsc1 = 2.5 + 1.4 * amp * s1;
        // OSC2: cổng đảo khuếch đại rồi bão hòa (gần vuông, ngược pha)
        const vOsc2 = 2.5 + 2.4 * Math.tanh(-4 * amp * s1);
        const running = amp > 0.2;
        const qClk = running ? (Math.floor(ph / (2 * Math.PI)) % 4 < 2 ? 5 : 0) : 0;

        // ---- hình ảnh: lát thạch anh rung (phóng đại) ----
        const shear = 0.12 * amp * s1;
        blankL.position.x = -2 + shear; blankR.position.x = 2 + shear;
        if (cracked) { blankL.rotation.z = 0.35; blankR.rotation.z = -0.2; blankL.position.y = -0.3; }
        electrodes.children.forEach((e) => { e.material.emissive.setRGB(0.3 * amp, 0.6 * amp, amp); e.material.emissiveIntensity = 0.5 + 0.5 * Math.abs(s1); });

        // ---- số đo ----
        let st;
        if (cracked) st = '💥 Lát thạch anh nứt — không cộng hưởng';
        else if (!osc) st = `⛔ KHÔNG dao động (|R_âm| < ESR) — PIC đứng im`;
        else if (!running) st = 'Đang khởi động… biên độ lớn dần';
        else if (ph_.margin < 5) st = '⚠️ Chạy nhưng hệ số an toàn < 5 — dễ không khởi động';
        else if (Math.abs(ph_.ppm) > 200) st = '⚠️ Lệch tần số lớn, biên độ quá mạnh';
        else if (fault === 'day-dai') st = '⚠️ Nhiễu PWM lọt vào OSC1 — xung nhịp méo';
        else st = '✓ Dao động ổn định';
        readout('f', running ? ph_.f / 1e6 : 0);
        readout('ppm', running ? ph_.ppm : 0);
        readout('cl', ph_.CL * 1e12);
        readout('gm', ph_.margin);
        readout('tst', Number.isFinite(ph_.tStart) ? ph_.tStart * 1000 : '∞ (không khởi động)');
        readout('mips', running ? `Tcy ${(4e3 / (ph_.f / 1e6)).toFixed(1)} ns · ${(ph_.f / 4e6).toFixed(3)} MIPS` : '0 — CPU dừng');
        readout('clock', running ? ph_.ppm * 1e-6 * 86400 : 0);
        readout('state', st);
        return [vOsc2, vOsc1, qClk];
      },
    };
  },
};
