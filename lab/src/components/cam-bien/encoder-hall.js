// 🧲 Encoder Hall — vòng nam châm nhiều cực trên trục động cơ + IC Hall kiểu chốt (latch)
// Mô hình từ trường: biên độ tại cảm biến B0 = B_s · e^(−2π·g/λ), λ = 2 × bước cực = 4πR/số_cực
//   → càng nhiều cực thì từ trường tắt càng nhanh theo khe hở g.
// IC latch: B > +B_OP → transistor ra BẬT (OUT kéo xuống ~0 V); B < −B_OP → TẮT (OUT lên 5 V nhờ trở kéo lên).
// Xung / vòng bánh = (số cực / 2) × tỉ số hộp số.  Quãng đường = xung / (xung/vòng) × π × D.
// Mô hình CAD thật: robot/wheel-module.glb (module bánh Roborock S5/Xiaomi gen1). Ở module thật, encoder là đĩa nam châm
// Ø8 trên TRỤC THỨ 3 của hộp số, đọc theo hướng trục bởi IC Hall trên bo đứng — khác mô hình học (vòng nhiều cực trên
// trục động cơ, đọc theo bán kính). Mô phỏng (số cực, tỉ số n, khe hở) vẫn giữ nguyên; CAD tô N/S lên đĩa từ cho dễ thấy.
import { cadAttach, ownMaterial } from '../../core/cadParts.js';

const D_WHEEL = 70;      // đường kính bánh (mm) — docs/01 mục 5
const R_RING = 8;        // bán kính ngoài vòng nam châm (mm)
const B_SURF = 120;      // mT — từ trường sát mặt nam châm ferrite kết dính
const B_OP = 5;          // mT — ngưỡng chuyển mạch của IC latch (±B_OP)
const RING_Y = 23;       // vị trí vòng nam châm trên trục (khung cục bộ của động cơ)
const POLES = [['2', '2 cực (1 cặp)'], ['4', '4 cực'], ['8', '8 cực'], ['12', '12 cực'], ['20', '20 cực (mặc định)']];

export default {
  id: 'encoder-hall',
  name: 'Encoder Hall (đếm vòng bánh)',
  category: 'cam-bien',
  order: 1,
  icon: '🧲',
  summary: 'Vòng nam châm N/S trên trục động cơ + IC Hall → mỗi cặp cực sinh 1 xung. PIC đếm xung bằng Timer0/Timer1 để biết bánh đã lăn bao xa (odometry).',
  tags: ['encoder', 'Hall', 'odometry', 'T0CKI', 'T1CKI', 'Timer0', 'Timer1', 'xung', 'nam châm', 'US1881'],

  params: [
    { id: 'cad', label: '🧊 Mô hình CAD thật (module bánh xe Roborock)', type: 'toggle', value: true, hint: 'Tắt = mô hình học tự dựng: vòng nam châm Ø16 trên trục động cơ, phóng to dễ nhìn' },
    { id: 'speed', label: 'Tốc độ bánh (âm = quay lùi)', type: 'range', min: -120, max: 120, step: 1, value: 40, unit: 'vòng/phút' },
    { id: 'cmd', label: 'PIC cộng/trừ xung theo chiều…', type: 'select', value: 'auto', options: [
      ['auto', 'chiều lệnh = chiều quay (bình thường)'], ['fwd', 'lệnh TIẾN (dù bánh quay lùi)'], ['rev', 'lệnh LÙI (dù bánh quay tiến)'],
    ], hint: 'Encoder 1 kênh không biết chiều quay: PIC giả định bánh quay theo chiều nó đang ra lệnh cho driver.' },
    { id: 'poles', label: 'Số cực vòng nam châm', type: 'select', value: '20', options: POLES },
    { id: 'ratio', label: 'Tỉ số hộp số 1 : n', type: 'range', min: 20, max: 200, step: 1, value: 100, unit: '' },
    { id: 'gap', label: 'Khe hở nam châm ↔ IC Hall', type: 'range', min: 0.3, max: 4, step: 0.1, value: 1, unit: 'mm', hint: 'Khe hở lớn → từ trường yếu dưới ngưỡng ±5 mT → mất xung.' },
    { id: 'pullup', label: 'Có điện trở kéo lên 10 kΩ (OUT → 5 V)', type: 'toggle', value: true },
    { id: 'field', label: 'Hiện mũi tên từ trường tại IC Hall', type: 'toggle', value: true },
    { id: 'turn10', label: '⟳ Quay tay đúng 10 vòng bánh (hiệu chỉnh)', type: 'button' },
    { id: 'reset', label: '↺ Xóa bộ đếm (lệnh RESET_ENC 0x05)', type: 'button' },
  ],
  readouts: [
    { id: 'rpm', label: 'Tốc độ động cơ', unit: 'vòng/phút' },
    { id: 'freq', label: 'Tần số xung thật', unit: 'Hz' },
    { id: 'tpr', label: 'Xung / vòng bánh', unit: 'xung' },
    { id: 'tmr0', label: 'Thanh ghi TMR0 (8-bit, tự tràn)', unit: '' },
    { id: 'enc', label: 'enc_total gửi ESP32 (int16)', unit: 'xung' },
    { id: 'dist', label: 'Quãng đường theo encoder', unit: 'mm' },
    { id: 'real', label: 'Quãng đường thật', unit: 'mm' },
    { id: 'slow', label: 'Hình nam châm vẽ chậm', unit: '×' },
    { id: 'state', label: 'Tình trạng', unit: '' },
  ],
  scope: {
    window: 2,
    note: '(dạng sóng vẽ chậm tự động — xem ô "Hình nam châm vẽ chậm"; bộ đếm & quãng đường tính theo thời gian thật)',
    channels: [
      { name: 'OUT → RA4/T0CKI', unit: 'V', min: -0.5, max: 6, color: '#ffd34d' },
      { name: 'Từ trường B tại IC', unit: 'mT', min: -80, max: 80, color: '#4cc2ff' },
    ],
  },

  faults: [
    { id: 'khong-keo-len', label: 'Quên điện trở kéo lên 10 kΩ ở RA4', severity: 'loi',
      what: '<p>Máy hiện sóng: khi IC Hall "tắt", chân OUT không lên 5 V mà <b>lơ lửng</b> 0.5–3 V, nhảy lung tung. Bộ đếm lúc đứng yên vẫn tăng (nhiễu), lúc chạy lại thiếu xung → odometry sai hoàn toàn, robot quay sai góc.</p>',
      why: '<p>Ngõ ra IC Hall là <b>cực góp hở (open-collector)</b>: transistor chỉ biết <i>kéo xuống</i> GND, không tự đẩy lên được. Không có trở kéo lên thì lúc transistor tắt, dây tín hiệu là một "ăng-ten" nhặt nhiễu 50 Hz và nhiễu PWM 20 kHz của động cơ. Thêm nữa RA4 của PIC16F877A khi làm ngõ ra là open-drain, cũng không có trở kéo lên nội như PORTB.</p>',
      fix: '<p>Hàn 10 kΩ từ RA4 lên +5 V (và từ RC0 lên +5 V cho encoder phải), cộng tụ 1–10 nF xuống GND sát chân PIC để lọc gai. Kiểm tra bằng đồng hồ: quay tay bánh thật chậm, chân OUT phải nhảy rõ giữa ~0 V và ~5 V.</p>' },
    { id: 'cap-vbat', label: 'Cấp nhầm VBAT 16.8 V cho module encoder', severity: 'hong',
      what: '<p>Có mùi khét nhẹ, IC Hall nóng rồi chết: không còn xung. Nếu IC sống sót, chân OUT lại lên tới 16.8 V (qua trở kéo lên trên module) → <b>chân RA4 của PIC hỏng</b>, Timer0 không đếm nữa.</p>',
      why: '<p>IC Hall loại điện áp thấp (AH180: 2.5–5.5 V, SS39ET: 2.7–7 V… hay gặp trên module nhỏ) chết khi vượt giới hạn tuyệt đối vài volt. Loại 3.5–24 V (US1881, A3144) chịu được, nhưng trở kéo lên của module nối lên VCC nên OUT = 16.8 V. Giới hạn tuyệt đối của RA4 là <b>0…8.5 V</b> (RA4 không có diode kẹp lên VDD); các chân khác chỉ chịu VDD + 0.3 V — vượt là dòng chảy qua diode bảo vệ vào nguồn 5 V.</p>',
      fix: '<p>Encoder lấy nguồn <b>5 V logic</b> (sau buck XL4015), không lấy VBAT. Trở kéo lên phải nối lên 5 V của PIC. Dùng đầu nối có khóa, dây 3 màu chuẩn (đỏ 5 V, đen GND, vàng OUT) và đo bằng đồng hồ trước khi cắm.</p>' },
    { id: 'khe-ho-lon', label: 'Lắp lại lệch: khe hở nam châm 3.4 mm', severity: 'loi',
      what: '<p>Đường xanh (từ trường) chỉ còn vài mT, không vượt ngưỡng ±5 mT → OUT đứng im, bộ đếm không tăng dù bánh vẫn quay. Robot tưởng mình đang đứng yên → báo <code>STUCK</code> hoặc đi quá xa.</p>',
      why: '<p>Từ trường của vòng nhiều cực giảm theo hàm mũ <code>B = B_s·e^(−g·N/(2R))</code>. Với 20 cực, R = 8 mm: mỗi 1 mm khe hở làm từ trường giảm còn ~29 %. Khe hở 1 mm → ~34 mT; 3.4 mm → ~1.7 mT.</p>',
      fix: '<p>Khi tháo module bánh: đánh dấu vị trí bo Hall, lắp lại đúng vấu định vị, khe hở ≤ 1 mm. Nếu không thấy xung: dùng nam châm nhỏ đưa sát IC để thử, rồi chỉnh khoảng cách.</p>' },
    { id: 'sai-chieu', label: 'Bánh bị đẩy lùi khi PIC đang lệnh TIẾN', severity: 'nhe',
      what: '<p>Robot bị người đẩy lùi (hoặc trôi dốc), nhưng "Quãng đường theo encoder" vẫn <b>tăng</b> trong khi quãng đường thật giảm → odometry lệch, bản đồ/ góc quay sai.</p>',
      why: '<p>Encoder Hall <b>1 kênh</b> chỉ đếm số xung, không có thông tin chiều. Firmware PIC (<code>motor_tick_1ms</code>) cộng xung nếu lệnh gần nhất &gt; 0 và trừ nếu &lt; 0 (<code>last_sign_l</code>). Khi bánh quay ngược lệnh, phép giả định này sai.</p>',
      fix: '<p>Chấp nhận sai số nhỏ lúc đổi chiều; dùng IMU MPU6050 để lấy góc quay; hoặc dùng encoder <b>2 kênh A/B lệch pha 90°</b> (quadrature) — chiều quay suy ra từ kênh nào lên trước.</p>' },
    { id: 'nhieu-dong-co', label: 'Dây encoder chạy sát dây động cơ, không có tụ lọc', severity: 'loi',
      what: '<p>Bộ đếm tăng nhanh hơn thực tế khi động cơ chạy mạnh (thêm hàng chục–hàng trăm xung/giây "ma"), robot tưởng đi xa hơn thật → quay quá góc, lệch làn zig-zag.</p>',
      why: '<p>PWM 20 kHz và tia lửa chổi than tạo gai điện áp ghép điện dung/ cảm ứng sang dây tín hiệu. T0CKI là ngõ vào Schmitt trigger rất nhanh (bắt được xung ~20 ns) nên đếm luôn cả gai nhiễu.</p>',
      fix: '<p>Tụ 100 nF hai cực động cơ, tụ 1–10 nF ở chân T0CKI/T1CKI, dây encoder xoắn với GND và đi tách xa dây động cơ, nguồn logic riêng (buck).</p>' },
  ],

  info: {
    overview: `
      <p><b>Encoder</b> (bộ mã hóa vòng quay) cho robot biết mỗi bánh đã quay bao nhiêu. Trong module bánh xe robot hút bụi, một <b>vòng nam châm nhiều cực</b> (đỏ = N, xanh = S) gắn ở đuôi trục động cơ, ngay cạnh là một <b>IC Hall</b> trên bo nhỏ. Mỗi khi một cặp cực N–S đi qua, IC xuất <b>1 xung vuông</b>.</p>
      <p>Vì nam châm nằm trên trục <i>động cơ</i> (quay nhanh gấp n lần bánh), số xung trên mỗi vòng bánh rất lớn: <code>(số cực/2) × n</code> = 10 × 100 = <b>1000 xung/vòng</b> → mỗi xung ứng với ~0.22 mm đường đi.</p>
      <p>Thử: bấm <b>Quay tay đúng 10 vòng bánh</b> — đây chính là cách đo <code>TICKS_PER_REV</code> trong docs/01. Rồi kéo <b>Khe hở</b> lên 3 mm xem xung biến mất; tắt <b>điện trở kéo lên</b> xem tín hiệu lơ lửng; chọn <b>lệnh TIẾN</b> và kéo tốc độ âm để thấy encoder 1 kênh đếm sai chiều.</p>`,
    specs: [
      ['IC Hall tham khảo', 'US1881 / AH3762 (latch, chốt 2 cực) — VDD 3.5–24 V, ngõ ra open-collector, I<sub>sink</sub> ≤ 50 mA'],
      ['Ngưỡng từ', 'B<sub>OP</sub> ≈ +5…+10 mT (cực S bật), B<sub>RP</sub> ≈ −5…−10 mT (cực N tắt) — có trễ nên không rung'],
      ['Vòng nam châm', 'Ferrite kết dính, Ø16 mm, 2–20 cực từ hóa theo bán kính'],
      ['Khe hở khuyến nghị', '0.5–1.5 mm (càng nhiều cực càng phải sát)'],
      ['Xung / vòng động cơ', 'số cực / 2 (đếm cạnh lên)'],
      ['Xung / vòng bánh (dự án)', '1000 mặc định — đo lại rồi sửa <code>TICKS_PER_REV</code> trong <code>esp32s3/src/config.h</code>'],
      ['Độ phân giải quãng đường', 'π × 70 mm / 1000 ≈ <b>0.22 mm/xung</b>'],
      ['Tần số xung', 'Bánh 120 vòng/phút × 100 × 10 = 2 kHz — PIC đếm bằng phần cứng thoải mái (tối đa vài MHz)'],
      ['Điện trở kéo lên', '10 kΩ lên +5 V (bắt buộc với RA4 và ngõ ra open-collector)'],
    ],
    principle: `
      <h4>1. Hiệu ứng Hall</h4>
      <p>Cho dòng điện I chạy qua một tấm bán dẫn mỏng (dày t) nằm trong từ trường B: lực Lorentz đẩy hạt mang điện dạt về một mép → xuất hiện điện áp ngang <code>V<sub>H</sub> = I·B / (n·q·t)</code>. Điện áp này rất nhỏ (µV–mV), nên trong IC có sẵn mạch khuếch đại + so sánh có trễ (Schmitt trigger) + transistor ngõ ra.</p>
      <h4>2. IC kiểu chốt (latch) + vòng nhiều cực</h4>
      <p>Latch <b>bật</b> khi gặp cực S đủ mạnh (B &gt; +B<sub>OP</sub>) và <b>giữ nguyên</b> đến khi gặp cực N (B &lt; −B<sub>RP</sub>). Mỗi cặp cực N+S → 1 chu kỳ vuông. Đường xanh trên máy hiện sóng là B, đường vàng là OUT.</p>
      <p>Từ trường của vòng nhiều cực giảm rất nhanh theo khe hở g: <code>B ≈ B<sub>s</sub>·e<sup>−2πg/λ</sup></code>, với bước sóng từ <code>λ = 4πR/N</code>. 20 cực, R = 8 mm → λ ≈ 5 mm → mỗi mm khe hở mất ~70 % từ trường.</p>
      <h4>3. Ngõ ra cực góp hở (open-collector) + trở kéo lên</h4>
      <p>Transistor ngõ ra chỉ nối OUT xuống GND (mức 0) hoặc thả hở. Trở kéo lên 10 kΩ đưa OUT lên 5 V khi thả. Dòng khi kéo xuống: 5 V / 10 kΩ = 0.5 mA — rất nhỏ.</p>
      <h4>4. Từ xung ra quãng đường (odometry)</h4>
      <p><code>xung/vòng bánh = (N/2) × n</code> · <code>s = xung / (xung/vòng) × π·D</code></p>
      <p>Hai bánh đi s<sub>L</sub>, s<sub>R</sub>: tâm robot đi <code>(s<sub>L</sub>+s<sub>R</sub>)/2</code>, góc quay <code>(s<sub>R</sub>−s<sub>L</sub>)/L</code> với L = 235 mm (code <code>Odometry::update</code> trên ESP32).</p>
      <div class="tip">Encoder 1 kênh không biết chiều. Encoder 2 kênh A/B (quadrature) đặt 2 IC lệch nhau 1/4 chu kỳ: kênh nào lên trước cho biết chiều quay, và đếm cả 4 cạnh → gấp 4 độ phân giải.</div>`,
    inRobot: `
      <ul>
        <li><b>Bánh TRÁI</b>: OUT → chân 6 <b>RA4/T0CKI</b> → Timer0 (8-bit) đếm cạnh lên: <code>setup_timer_0(RTCC_EXT_L_TO_H | RTCC_DIV_1)</code>. Bắt buộc trở kéo lên 10 kΩ.</li>
        <li><b>Bánh PHẢI</b>: OUT → chân 15 <b>RC0/T1CKI</b> → Timer1 (16-bit): <code>setup_timer_1(T1_EXTERNAL_SYNC | T1_DIV_BY_1)</code>.</li>
        <li>Mỗi 1 ms (ngắt Timer2), <code>motor_tick_1ms()</code> đọc TMR0/TMR1, lấy hiệu so với lần trước (phép trừ không dấu tự xử lý tràn 255→0), rồi <b>cộng hoặc trừ</b> vào <code>enc_total_l/r</code> theo dấu lệnh đang xuất cho driver.</li>
        <li>PIC gửi <code>enc_left, enc_right</code> (int16, quấn vòng ±32767) trong khung STATUS 0x81 mỗi 20 ms; ESP32 lấy <b>hiệu</b> giữa 2 khung nên không sợ tràn.</li>
        <li>ESP32: <code>MM_PER_TICK = π × WHEEL_DIAMETER_MM / TICKS_PER_REV</code> → odometry x, y, θ; gửi app bản tin <code>O,x,y,θ</code>.</li>
        <li>Nguồn encoder: <b>5 V logic</b> từ buck, chung GND với PIC.</li>
      </ul>`,
    mistakes: `
      <ul>
        <li>Quên trở kéo lên ở RA4 → không có xung hoặc đếm nhiễu (RA4 không có pull-up nội như PORTB).</li>
        <li>Dùng sai <code>TICKS_PER_REV</code> (chưa đo) → robot đi 1 m mà app báo 0.8 m, quay 90° thành 110°.</li>
        <li>Lắp bo Hall lệch / xa nam châm sau khi tháo → mất xung ngẫu nhiên.</li>
        <li>Đọc TMR0 quá thưa: 8-bit tràn sau 256 xung → ở 2 kHz phải đọc ít nhất mỗi 128 ms (dự án đọc mỗi 1 ms — an toàn).</li>
        <li>Cấp VBAT cho module encoder, hoặc kéo lên 12 V → hỏng chân PIC.</li>
        <li>Tin rằng encoder đo được trượt bánh: bánh quay trơn trên thảm vẫn sinh xung → odometry vẫn "chạy". Cần IMU/lidar để phát hiện.</li>
      </ul>`,
    quiz: [
      { q: 'Vòng nam châm 20 cực, hộp số 1:100. Bao nhiêu xung mỗi vòng bánh? Mỗi xung bánh Ø70 mm đi bao xa?', a: '20/2 × 100 = 1000 xung/vòng; π × 70 / 1000 ≈ 0.22 mm/xung.' },
      { q: 'Vì sao chân RA4/T0CKI bắt buộc phải có điện trở kéo lên khi nối với IC Hall?', a: 'Ngõ ra IC Hall là open-collector (chỉ kéo xuống GND được), và RA4 không có pull-up nội. Không có trở kéo lên thì mức 1 bị lơ lửng → mất xung/đếm nhiễu.' },
      { q: 'Encoder 1 kênh không biết chiều quay. PIC trong dự án xử lý thế nào, và khi nào sai?', a: 'PIC cộng/trừ xung theo dấu của lệnh tốc độ đang xuất (last_sign). Sai khi bánh quay ngược lệnh: bị đẩy, trôi dốc, hoặc quán tính lúc vừa đảo chiều.' },
    ],
  },

  build(ctx) {
    const { THREE, MAT, geom, label, readout, fx } = ctx;
    const { mesh, group, part, cyl, box, arcSector, wire } = geom;
    const root = new THREE.Group();
    // Khung cục bộ: trục động cơ = trục Y; xoay cả cụm cho trục nằm ngang như trong module bánh xe
    const mod = new THREE.Group();
    mod.rotation.z = Math.PI / 2;
    root.add(mod);

    // ---------- động cơ ----------
    const can = mesh(cyl(12, 12, 30, 48), MAT.steel);
    const flange = mesh(cyl(12.4, 12.4, 1.2, 48), MAT.steel, { y: -15.6 });
    mod.add(part(group(can, flange), 'Động cơ DC Ø24 mm (bánh xe)',
      'Động cơ chổi than 14.4 V, ~10 000 vòng/phút. Trục sau thò ra để gắn vòng nam châm encoder. <a href="#/c/dong-co-dc">Xem chi tiết →</a>'));
    const cap = mesh(cyl(12, 12, 4, 48), MAT.plasticWhite, { y: 17 });
    const t1 = mesh(box(1.5, 4, 3), MAT.brass, { y: 20.5, z: 7 });
    const t2 = mesh(box(1.5, 4, 3), MAT.brass, { y: 20.5, z: -7 });
    mod.add(part(group(cap, t1, t2), 'Nắp sau + 2 cực động cơ', 'Nối ra driver DRV8871 (OUT1/OUT2). Nên hàn tụ 100 nF giữa 2 cực để giảm nhiễu sang dây encoder.'));
    const shaft = mesh(cyl(1, 1, 52, 16), MAT.steel, { y: 1 });
    mod.add(part(shaft, 'Trục động cơ Ø2 mm', 'Đầu trước vào hộp số, đuôi sau mang vòng nam châm — quay cùng tốc độ rô-to.'));

    // ---------- vòng nam châm nhiều cực (dựng lại khi đổi số cực) ----------
    const ringSpin = new THREE.Group();
    ringSpin.position.y = RING_Y;
    mod.add(ringSpin);
    const hub = mesh(cyl(3, 3, 3.6, 24), MAT.brass);
    ringSpin.add(part(hub, 'Bạc lót ép vào trục', 'Ống đồng thau ép chặt lên trục, vòng nam châm dán quanh nó. Nếu lỏng, vòng trượt trên trục → mất xung.'));
    const ringWrap = new THREE.Group();
    ringSpin.add(ringWrap);
    let segGeo = null;
    function buildRing(n) {
      ringWrap.clear();
      if (segGeo) segGeo.dispose();
      const w = (Math.PI * 2) / n;
      segGeo = arcSector(3, R_RING, 0.01, w - 0.01, 3, 8);
      for (let k = 0; k < n; k++) {
        const m = mesh(segGeo, k % 2 === 0 ? MAT.magnetN : MAT.magnetS);
        m.rotation.y = k * w;
        ringWrap.add(m);
      }
      part(ringWrap, `Vòng nam châm ${n} cực (đỏ N · xanh S)`,
        `Ferrite kết dính Ø16 mm từ hóa xen kẽ N/S. ${n / 2} cặp cực → ${n / 2} xung mỗi vòng động cơ.`);
    }

    // ---------- bo cảm biến Hall (dời theo khe hở) ----------
    const hallG = new THREE.Group();
    hallG.position.set(R_RING + 1, RING_Y, 0);
    mod.add(hallG);
    const ic = mesh(box(1.0, 2.9, 1.5, 0.15), MAT.icBody, { x: 0.5 });
    const legs = [-0.95, 0, 0.95].map((y) => mesh(box(0.4, 0.4, 0.15), MAT.tin, { x: 0.9, y, z: 0.8 }));
    const sens = mesh(box(0.06, 0.8, 0.8), MAT.silicon.clone(), { x: -0.03 });
    const hallIC = part(group(ic, sens, ...legs), 'IC Hall kiểu chốt (latch) SOT-23',
      'Bên trong: tấm Hall + khuếch đại + Schmitt trigger + transistor open-collector. Ô vuông nhỏ là vùng nhạy — phát sáng khi transistor ngõ ra đang BẬT (OUT = 0 V).');
    hallG.add(hallIC);
    const board = mesh(box(1.0, 16, 12, 0.3), MAT.pcbGreen, { x: 1.5, y: -3 });
    hallG.add(part(board, 'Bo mạch encoder (PCB 16×12 mm)', 'Đặt vuông góc, sát mép vòng nam châm. Có lỗ vít/ vấu định vị để giữ khe hở cố định.'));
    const res = mesh(box(0.45, 1.6, 0.8), MAT.icBody, { x: 2.2, y: -6, z: 2.2 });
    hallG.add(part(res, 'Điện trở kéo lên 10 kΩ (0603)', 'Kéo OUT lên +5 V khi transistor tắt. Một số module không có → phải hàn thêm ở phía PIC. <a href="#/c/dien-tro">Xem chi tiết →</a>'));
    const capC = mesh(box(0.8, 1.6, 0.8), new THREE.MeshStandardMaterial({ color: 0xb08850, roughness: 0.6 }), { x: 2.4, y: -6, z: -2.2 });
    hallG.add(part(capC, 'Tụ lọc nguồn 100 nF', 'Đặt sát chân VCC–GND của IC Hall, chặn gai nhiễu từ động cơ. <a href="#/c/tu-dien">Xem chi tiết →</a>'));
    const hdrBase = mesh(box(2.5, 2.5, 7.6), MAT.plasticBlack, { x: 3.3, y: -9.5 });
    const pins = [-2.54, 0, 2.54].map((z) => mesh(box(6, 0.64, 0.64), MAT.gold, { x: 5, y: -9.5, z }));
    hallG.add(part(group(hdrBase, ...pins), 'Chân ra 3 pin: VCC · GND · OUT', 'VCC = +5 V logic, GND chung, OUT = tín hiệu xung (open-collector).'));
    const wires = [[-2.54, 0xd23b3b], [0, 0x222222], [2.54, 0xf2c200]].map(([z, color]) =>
      wire([[8, -9.5, z], [15, -9.5, z], [24, -4, z * 1.6], [33, 2, z * 1.6]], { radius: 0.45, color }));
    const jst = mesh(box(4, 5, 10, 0.4), MAT.plasticWhite, { x: 35, y: 2 });
    hallG.add(part(group(...wires, jst), 'Dây ra PIC: đỏ +5 V · đen GND · vàng → RA4/T0CKI',
      'Bánh trái vào chân 6 (RA4/T0CKI, Timer0), bánh phải vào chân 15 (RC0/T1CKI, Timer1). Xoắn dây, đi xa dây động cơ.'));
    label(hallG, 'IC Hall', [0, 4, 6]);
    label(hallG, 'OUT → RA4/T0CKI', [36, 6, 0]);

    // mũi tên từ trường tại IC
    const fieldArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 4, 0x5fd3ff, 1.2, 0.8);
    fieldArrow.traverse((o) => { o.raycast = () => {}; });
    mod.add(fieldArrow);

    // ---------- hộp số + bánh xe ----------
    const gb = mesh(box(62, 14, 30, 2), MAT.plasticDark, { x: -21, y: -22 });
    mod.add(part(gb, 'Hộp số giảm tốc 1 : n', 'Nhiều cặp bánh răng nhựa/kim loại giảm tốc độ, tăng mô-men. Vì nam châm ở phía động cơ, mỗi vòng bánh = n vòng động cơ → độ phân giải cao. <a href="#/c/hop-so">Xem chi tiết →</a>'));
    const outShaft = mesh(cyl(3, 3, 8, 16), MAT.steel, { x: -32, y: -32 });
    mod.add(outShaft);
    const wheel = new THREE.Group();
    wheel.position.set(-32, -40, 0);
    mod.add(wheel);
    const tire = mesh(cyl(35, 35, 18, 48), MAT.rubber);
    const mark = mesh(box(3, 18.6, 3), MAT.plasticWhite, { x: 33.5 });
    const rim = mesh(cyl(25, 25, 18.6, 32), MAT.plasticGrey);
    const spokes = [0, 1, 2, 3, 4].map((k) => {
      const s = mesh(box(19, 19.2, 2.4), MAT.plasticDark, { x: 0 });
      s.rotation.y = (k * 2 * Math.PI) / 5;
      s.position.set(Math.cos(-s.rotation.y) * 11, 0, Math.sin(-s.rotation.y) * 11);
      return s;
    });
    wheel.add(part(group(tire, mark, rim, ...spokes), 'Bánh xe Ø70 mm', 'Lốp cao su có vạch trắng để đếm vòng bằng mắt. Quãng đường mỗi vòng = π × 70 ≈ 220 mm. <a href="#/c/banh-xe">Xem chi tiết →</a>'));
    label(mod, 'Vòng nam châm', [0, RING_Y + 4, -10]);
    label(mod, 'Hộp số', [-21, -22, 16]);
    label(mod, 'Bánh Ø70', [-32, -40, 20]);

    // ---------- mô hình CAD thật: module bánh xe (khung GLB: trục bánh & trục động cơ theo X, encoder ở mặt +X) ----------
    // Vỏ hộp số/ khung/ công tắc nhấc bánh làm mờ để thấy rõ đĩa từ + bo Hall + động cơ + bánh răng.
    const G0 = 0.2;                       // khe hở CAD gốc giữa mặt đĩa từ (x = 31.7) và IC Hall (x = 31.9)
    const cadR = { gears: [] };
    const cadArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 4, 0x5fd3ff, 1.2, 0.8);
    cadArrow.traverse((o) => { o.raycast = () => {}; });
    let ringN = 0, latchShown = null;
    const ROT = -0.9;                     // xoay để mặt encoder (+X của GLB) hướng về camera, động cơ lùi sang trái
    const arrowFrame = new THREE.Group();  // khung có cùng hướng với GLB (mũi tên dọc trục đĩa từ)
    arrowFrame.rotation.y = ROT;
    const cad = cadAttach(ctx, root, 'robot/wheel-module', {
      rotateY: ROT,
      hide: [mod],
      partDefault: ['Module bánh xe Roborock S5 (CAD thật)', 'Mô hình CAD: bánh Ø70, hộp số bánh răng m0.5, động cơ RS-360, encoder Hall trên trục thứ 3, giắc JST ZH 7 chân.'],
      parts: {
        encoder_magnet: ['Đĩa nam châm encoder Ø8 (trên trục thứ 3)', 'Module thật dùng nam châm từ hóa theo đường kính (2 cực) gắn ở đầu trục bánh răng thứ 3. Ở đây tô đỏ N / xanh S theo số cực đang chọn.'],
        hall_sensor: ['IC Hall kiểu chốt (latch)', 'Đặt đối diện mặt đĩa từ (đọc theo hướng trục). Phát sáng cam khi transistor ngõ ra đang BẬT (OUT = 0 V).'],
        hall_pcb: ['Bo mạch encoder (đứng)', 'Bắt cố định vào vỏ hộp số, giữ khe hở với đĩa từ. Tháo lắp lệch là khe hở đổi → mất xung.'],
        hall_passives: ['Trở kéo lên + tụ lọc 100 nF', 'Kéo OUT lên +5 V khi transistor tắt; tụ chặn gai nhiễu từ động cơ.'],
        conn_wheel_header: ['Đầu cái JST-ZH 7 chân', 'MOT+, MOT−, HALL_GND, HALL_OUT, HALL_VCC, SW_A, SW_B — động cơ, encoder và công tắc nhấc bánh chung 1 giắc.'],
        conn_wheel_pins: ['Chân đầu nối JST-ZH 7 chân', 'Bước 1.5 mm.'],
        'conn_wheel/plug_housing': ['Giắc JST-ZH 7 chân', 'Có khóa. Lỏng giắc → mất xung encoder hoặc mất động cơ.'],
        can: ['Động cơ RS-360 (vỏ thép)', 'Động cơ chổi than 14.4 V kéo hộp số. <a href="#/c/dong-co-dc">Xem chi tiết →</a>'],
        endcap: ['Nắp sau động cơ + chổi than', 'Nên hàn tụ 100 nF giữa 2 cực để giảm nhiễu sang dây encoder.'],
        term_pos: ['Cực (+) động cơ', 'Nối OUT1 của DRV8871 qua dây MOT+.'],
        term_neg: ['Cực (−) động cơ', 'Nối OUT2 của DRV8871 qua dây MOT−.'],
        shaft: ['Trục động cơ Ø2.3 mm', 'Bánh răng con (pinion) ép ở đầu trục, kéo cả hộp số.'],
        gear_motor_pinion: ['Bánh răng con trên trục động cơ', 'Tầng giảm tốc đầu tiên.'],
        gear_1: ['Bánh răng tầng 1', 'Giảm tốc, tăng mô-men.'],
        gear_2: ['Bánh răng tầng 2 (trục thứ 3 — mang đĩa từ encoder)', 'Đĩa nam châm gắn ở đầu trục này nên mỗi vòng bánh xe = nhiều vòng đĩa từ → độ phân giải cao.'],
        gear_3: ['Bánh răng tầng 3', 'Giảm tốc.'],
        gear_out: ['Bánh răng ra (trục bánh xe)', 'Quay cùng bánh xe.'],
        gear_pins: ['Trục thép các bánh răng', ''],
        tyre: ['Lốp bánh Ø70 mm', 'Quãng đường mỗi vòng = π × 70 ≈ 220 mm. <a href="#/c/banh-xe">Xem chi tiết →</a>'],
        hub: ['Mâm bánh', ''],
        axle: ['Trục bánh xe', ''],
        lid_gearbox: ['Nắp hộp số (làm mờ)', 'Vỏ nửa ngoài hộp số, 6 vít PT2.6×10. <a href="#/c/hop-so">Xem hộp số →</a>'],
        arm_pivot: ['Tay đòn hộp số (làm mờ)', 'Nửa trong vỏ hộp số, xoay quanh chốt khi bánh bị nhấc.'],
        frame: ['Khung module (làm mờ)', 'Bắt vào đáy robot.'],
        motor_plate: ['Tấm gá động cơ', ''],
        pivot_pin: ['Chốt xoay tay đòn', ''],
        spring: ['Lò xo ép bánh', ''],
        switch_drop: ['Công tắc nhấc bánh', '<a href="#/c/cong-tac-hanh-trinh">Xem công tắc hành trình →</a>'],
        'screw_*': ['Vít PT2.6×10 / PT3×8', ''],
      },
      labels: [['IC Hall', 'hall_sensor', [0, 10, 0]], ['Đĩa từ (encoder)', 'encoder_magnet', [0, -6, 0]], ['Hộp số', 'lid_gearbox', [0, 24, 0]],
        ['Bánh Ø70', 'wheel', [0, 38, 0]], ['OUT → RA4/T0CKI', 'conn_wheel', [10, 4, 0]]],
      onLoad(c) {
        ['conn_wheel/wire_1', 'conn_wheel/wire_2', 'conn_wheel/wire_3', 'conn_wheel/wire_4', 'conn_wheel/wire_5', 'conn_wheel/wire_6', 'conn_wheel/wire_7'].forEach((k, i) =>
          c.tag(k, ['Dây MOT+', 'Dây MOT−', 'Dây HALL_GND', 'Dây HALL_OUT → RA4/T0CKI (bánh trái)', 'Dây HALL_VCC (+5 V logic)', 'Dây SW_A (công tắc nhấc bánh)', 'Dây SW_B (công tắc nhấc bánh)'][i],
            ['Nối OUT1 DRV8871.', 'Nối OUT2 DRV8871.', 'GND chung với PIC.', 'Open-collector, cần trở kéo lên 10 kΩ lên 5 V. Bánh phải → RC0/T1CKI.', '5 V sau buck — không cấp VBAT!', '→ RB1 (bánh trái).', '→ GND.'][i]));
        cadR.wheel = c.pivot('wheel', { axis: [1, 0, 0], origin: [0, 35, 0] });
        cadR.mag = c.pivot('encoder_magnet', { axis: [1, 0, 0] });
        cadR.shaft = c.pivot('motor/shaft', { axis: [1, 0, 0] });
        cadR.gears = [['gear_motor_pinion', 10.8], ['gear_1', -3], ['gear_3', -0.3], ['gear_out', 0]].map(([n, r]) => ({ pv: c.pivot(n, { axis: [1, 0, 0] }), r }));
        cadR.g2 = c.pivot('gear_2', { axis: [1, 0, 0] });
        cadR.enc = c.slide('encoder', [1, 0, 0]);
        cadR.conn = c.slide('conn_wheel', [1, 0, 0]);
        cadR.sensor = c.node('hall_sensor');
        c.node('encoder_magnet').visible = false;          // thay bằng đĩa tô N/S (cùng kích thước)
        cadR.ring = new THREE.Group();
        cadR.ring.scale.setScalar(0.001);                   // khung node GLB tính bằng mét
        cadR.ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), cadR.mag.axis);
        cadR.mag.pivot.add(cadR.ring);
        // làm mờ vỏ để nhìn vào encoder
        for (const [k, op] of [['frame', 0.22], ['arm_pivot', 0.22], ['lid_gearbox', 0.22], ['switch_drop', 0.22], ['spring', 0.22], ['screw_*', 0.22], ['pivot_pin', 0.22], ['hall_pcb', 0.45]])
          for (const n of c.nodes(k)) n.traverse((o) => { if (o.isMesh) { const m = ownMaterial(o); m.transparent = true; m.opacity = op; m.depthWrite = false; } });
        // mũi tên từ trường (khung holder, mm): giữa mặt đĩa từ và IC Hall, đặt cao hơn trục 5 mm cho dễ thấy
        c.holder.add(arrowFrame);
        arrowFrame.add(cadArrow);
        cadR.magC = c.worldOf('encoder_magnet', arrowFrame);
        ringN = 0;
      },
    });
    const cadRingGeo = [];
    function buildCadRing(n) {
      cadR.ring.clear();
      cadRingGeo.forEach((g) => g.dispose()); cadRingGeo.length = 0;
      const w = (Math.PI * 2) / n;
      const g = arcSector(1.2, 4, 0.01, w - 0.01, 1.8, 6);
      cadRingGeo.push(g);
      for (let k = 0; k < n; k++) { const m = mesh(g, k % 2 === 0 ? MAT.magnetN : MAT.magnetS); m.rotation.y = k * w; cadR.ring.add(m); }
      ringN = n;
    }

    // ---------- trạng thái mô phỏng ----------
    let theta = 0, wheelAng = 0, pulsesF = 0, noiseF = 0, enc = 0, tmr0 = 0, total = 0, realDist = 0;
    let latch = false, lastSign = 1, lastPoles = 0, cal = null, calMsg = '', calHold = 0, fault = null, dead = false, faultT = 0;
    const reset = () => { enc = 0; tmr0 = 0; total = 0; realDist = 0; pulsesF = 0; calMsg = ''; };
    const dirV = new THREE.Vector3();

    return {
      object: root,
      onAction(id) {
        if (id === 'reset') reset();
        if (id === 'turn10') { reset(); cal = { rev: 0 }; calHold = 0; }
      },
      triggerFault(id) { fault = id; faultT = 0; },
      resetFault() { fault = null; dead = false; reset(); latchShown = null; },
      dispose() { if (segGeo) segGeo.dispose(); cadRingGeo.forEach((g) => g.dispose()); },
      update(dt, t, p) {
        const poles = parseInt(p.poles, 10) || 20;
        if (poles !== lastPoles) { buildRing(poles); lastPoles = poles; }
        const pp = poles / 2;
        faultT += dt;

        // ----- tốc độ bánh (vòng/phút), có thể bị nút hiệu chỉnh / sự cố ghi đè -----
        let wrpm = p.speed;
        calHold = Math.max(0, calHold - dt);
        if (calHold > 0) wrpm = 0;                             // dừng 3 s cho người học đọc kết quả
        if (cal) wrpm = 60;
        if (fault === 'sai-chieu') wrpm = -Math.max(20, Math.abs(p.speed));
        let dtE = dt;
        if (cal) {
          const inc = (Math.abs(wrpm) / 60) * dt;
          if (cal.rev + inc >= 10) { dtE = dt * (10 - cal.rev) / inc; cal.rev = 10; } else cal.rev += inc;
        }
        const gap = fault === 'khe-ho-lon' ? 3.4 : p.gap;
        hallG.position.x = R_RING + gap;

        const wm = (wrpm * p.ratio * 2 * Math.PI) / 60;       // rad/s trục động cơ
        const fReal = (Math.abs(wm) / (2 * Math.PI)) * pp;     // Hz
        const slow = Math.max(1, fReal / 4);                  // vẽ tối đa ~4 xung/giây
        theta += (wm * dtE) / slow;
        ringSpin.rotation.y = theta;
        wheelAng += (wrpm / 60) * 2 * Math.PI * dtE;
        wheel.rotation.y = wheelAng;

        // ----- từ trường tại IC (dạng gần vuông của từ hóa nhiều cực) -----
        const B0 = B_SURF * Math.exp((-gap * poles) / (2 * R_RING));
        const w = (2 * Math.PI) / poles;
        let phi = (-theta) % (2 * Math.PI);
        if (phi < 0) phi += 2 * Math.PI;
        const B = (-B0 * Math.tanh(2.5 * Math.sin((Math.PI * phi) / w))) / Math.tanh(2.5);

        // ----- sự cố cấp VBAT: IC chết sau ~0.4 s -----
        const cadOn = cad.sync(p);
        if (fault === 'cap-vbat' && faultT > 0.4 && !dead) {
          dead = true;
          const icT = cadOn && cadR.sensor ? cadR.sensor : hallIC;
          fx.smoke(icT, { size: 3, duration: 4 });
          fx.scorch(icT, 0.8);
          fx.flash(icT, { size: 6, color: 0xffe0a0 });
        }
        if (!dead) { if (B > B_OP) latch = true; else if (B < -B_OP) latch = false; }

        const pull = p.pullup && fault !== 'khong-keo-len';
        let vout;
        if (dead) vout = 16.8;                                  // trở kéo lên của module nối lên VBAT
        else if (latch) vout = 0.12;
        else if (pull) vout = 5;
        else vout = 1.4 + 0.9 * Math.sin(2 * Math.PI * 7 * t) + 0.8 * (Math.random() - 0.5);   // lơ lửng: nhặt nhiễu
        if (fault === 'nhieu-dong-co' && Math.abs(wm) > 1 && Math.random() < 0.25) vout += (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 2);

        // ----- đếm xung (thời gian thật) -----
        const ok = !dead && B0 > B_OP * 1.05;
        if (ok) pulsesF += fReal * dtE;
        let n = Math.floor(pulsesF);
        pulsesF -= n;
        if (!pull && !dead) {
          // ngõ vào thả nổi: mất bớt xung thật + thêm xung "ma"
          n = Math.floor(n * (0.6 + 0.3 * Math.random()));
          noiseF += dtE * 160 * Math.random();
        }
        if (fault === 'nhieu-dong-co') noiseF += dtE * (30 + 0.12 * fReal) * Math.random() * 2;
        const ghost = Math.floor(noiseF);
        noiseF -= ghost;
        n += ghost;
        let dir;
        if (fault === 'sai-chieu') dir = 1;
        else if (p.cmd === 'fwd') dir = 1;
        else if (p.cmd === 'rev') dir = -1;
        else dir = wrpm > 0 ? 1 : wrpm < 0 ? -1 : lastSign;
        lastSign = dir;
        enc += dir * n;
        total += n;
        tmr0 = (tmr0 + n) & 255;
        realDist += (wrpm / 60) * Math.PI * D_WHEEL * dtE;
        if (cal && cal.rev >= 10) { calMsg = `10 vòng → ${total} xung → ${(total / 10).toFixed(1)} xung/vòng`; cal = null; calHold = 3; }

        // ----- hiển thị -----
        const sm = sens.material;
        sm.emissive.setRGB(latch && !dead ? 1 : 0, latch && !dead ? 0.6 : 0, 0);
        sm.emissiveIntensity = 1.4;
        fieldArrow.visible = p.field;
        if (p.field) {
          const len = 1 + Math.min(Math.abs(B), 60) / 8;
          dirV.set(B > 0 ? -1 : 1, 0, 0);
          fieldArrow.setDirection(dirV);
          fieldArrow.setLength(len, Math.min(1.2, len * 0.4), 0.8);
          fieldArrow.position.set(R_RING + gap / 2 - (dirV.x * len) / 2, RING_Y, 3.2);
          fieldArrow.setColor(B > 0 ? 0x5f8bff : 0xff6b6b);
        }

        // ----- CAD thật: đĩa từ quay theo θ (đã làm chậm), bánh theo góc bánh thật, bo Hall dời theo khe hở -----
        if (cadOn) {
          if (ringN !== poles) buildCadRing(poles);
          cadR.mag?.set(-theta);
          cadR.g2?.set(-theta);
          cadR.shaft?.set(-theta * 10.8);
          cadR.gears.forEach((g) => g.pv?.set(g.r ? -theta * g.r : -wheelAng));
          cadR.wheel?.set(-wheelAng);
          cadR.enc?.set(gap - G0);
          cadR.conn?.set(gap - G0);
          const lit = latch && !dead;
          if (lit !== latchShown && cadR.sensor) { latchShown = lit; cad.glow(cadR.sensor, 0xff9020, lit ? 1.4 : 0); }
          cadArrow.visible = p.field && !!cadR.magC;
          if (cadArrow.visible) {
            const len = 1 + Math.min(Math.abs(B), 60) / 8;
            dirV.set(B > 0 ? -1 : 1, 0, 0);
            cadArrow.setDirection(dirV);
            cadArrow.setLength(len, Math.min(1.2, len * 0.4), 0.8);
            cadArrow.setColor(B > 0 ? 0x5f8bff : 0xff6b6b);
            const xm = cadR.magC.x + 0.9 + gap / 2;
            cadArrow.position.set(xm - (dirV.x * len) / 2, cadR.magC.y + 5, cadR.magC.z);
          }
        } else latchShown = null;

        const tpr = pp * p.ratio;
        const enc16 = ((((enc + 32768) % 65536) + 65536) % 65536) - 32768;
        readout('rpm', wrpm * p.ratio);
        readout('freq', fReal);
        readout('tpr', tpr);
        readout('tmr0', tmr0);
        readout('enc', enc16);
        readout('dist', (enc / tpr) * Math.PI * D_WHEEL);
        readout('real', realDist);
        readout('slow', slow);
        let st = '✓ Bình thường';
        if (dead) st = '💀 IC Hall chết · RA4 nhận 16.8 V (> 8.5 V tối đa)';
        else if (!ok && Math.abs(wm) > 0) st = `⚠ Mất xung: B = ${B0.toFixed(1)} mT < ngưỡng ${B_OP} mT`;
        else if (!pull) st = '⚠ OUT thả nổi — đếm nhiễu';
        else if (fault === 'nhieu-dong-co') st = '⚠ Gai nhiễu PWM bị đếm thành xung';
        else if (wrpm * dir < 0) st = '⚠ Đếm SAI CHIỀU (encoder 1 kênh)';
        else if (cal) st = `Đang quay tay… ${cal.rev.toFixed(2)} / 10 vòng`;
        else if (calMsg) st = calMsg;
        readout('state', st);
        return [vout, B];
      },
    };
  },
};
