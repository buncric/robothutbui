// 🔀 Mạch chuyển mức BSS138 4 kênh — cầu nối 5 V (PIC) ⇄ 3.3 V (ESP32) cho UART.
// Mỗi kênh: 1 N-MOSFET BSS138 (cổng nối LV, nguồn ở phía LV, máng ở phía HV) + 2 điện trở kéo lên 10 kΩ.
// Mô phỏng: 2 chiều (PIC TX → ESP RX, ESP TX → PIC RX), sườn lên RC = R_kéo × C_đường, ngưỡng đọc
// của PIC (Schmitt 4.0 V/1.0 V) và ESP32 (2.48 V/0.83 V), lỗi bit khi tốc độ quá cao. Bit làm chậm cho dễ nhìn.

import { cadAttach, ownMaterial } from '../../core/cadParts.js';

const VH = 5.0, VL = 3.3;
const PIC_VIH = 4.0, PIC_VIL = 1.0;          // RC7/RX là ngõ vào Schmitt: 0.8·VDD / 0.2·VDD
const ESP_VIH = 0.75 * VL, ESP_VIL = 0.25 * VL;
const R_ON = 3.5;          // BSS138 dẫn với Vgs = 3.3 V (Ω, tương đối)
const R_DRV = 40;          // trở kháng ra của chân PIC/ESP32 (Ω)
const BIT_DISP = 0.25;     // 1 bit hiển thị 0.25 s
const BYTE = 0x55;         // gửi 'U' = 01010101 (khó nhất: sườn liên tục)

export default {
  id: 'bss138-level-shifter',
  name: 'Mạch chuyển mức BSS138 (3.3 V ⇄ 5 V)',
  category: 'dieu-khien',
  order: 4,
  icon: '🔀',
  summary: 'Module 4 kênh chỉ gồm 4 MOSFET và 8 điện trở, cho PIC (5 V) và ESP32 (3.3 V) nói chuyện an toàn theo cả 2 chiều. Xem MOSFET đóng/mở theo từng bit và vì sao nối thẳng thì "lúc được lúc không".',
  tags: ['BSS138', 'level shifter', 'chuyển mức', 'logic level', 'MOSFET', '3.3V', '5V', 'UART', 'I2C'],

  params: [
    { id: 'cad', label: '🧊 Mô hình CAD thật (bo SparkFun BSS138 4 kênh)', type: 'toggle', value: true, hint: 'Tắt = mô hình học tự dựng. MOSFET/điện trở vẫn sáng theo từng bit trên cả hai.' },
    { id: 'baud', label: 'Tốc độ tín hiệu', type: 'select', value: '19200', options: [['19200', 'UART 19 200 bit/s (dự án)'], ['115200', 'UART 115 200 bit/s'], ['400000', 'I2C 400 kHz'], ['1000000', '1 Mbit/s'], ['2000000', '2 Mbit/s']] },
    { id: 'rpu', label: 'Điện trở kéo lên', type: 'select', value: '10000', options: [['1000', '1 kΩ'], ['4700', '4.7 kΩ'], ['10000', '10 kΩ (gốc của module)'], ['47000', '47 kΩ']] },
    { id: 'cbus', label: 'Điện dung đường dây (dài dây)', type: 'range', min: 10, max: 300, step: 5, value: 40, unit: 'pF', hint: 'Mỗi 10 cm dây ≈ 5–10 pF; chân IC ~5–10 pF; BSS138 Coss ~13 pF.' },
    { id: 'bypass', label: 'Bỏ mạch chuyển mức — nối thẳng', type: 'toggle', value: false },
    { id: 'zoom', label: 'Phóng to 1 kênh (MOSFET + 2 điện trở)', type: 'toggle', value: true },
  ],
  readouts: [
    { id: 'q1', label: 'Kênh 1 (PIC TX → ESP RX): BSS138', unit: '' },
    { id: 'q2', label: 'Kênh 2 (ESP TX → PIC RX): BSS138', unit: '' },
    { id: 'tau', label: 'Hằng số thời gian sườn lên τ = R·C', unit: 'µs' },
    { id: 'tbit', label: 'Thời gian 1 bit', unit: 'µs' },
    { id: 'rx', label: 'ESP đọc / PIC đọc (bit vừa rồi)', unit: '' },
    { id: 'err', label: 'Bit lỗi', unit: '' },
    { id: 'state', label: 'Trạng thái', unit: '' },
  ],
  scope: {
    window: 3,
    note: '(đã làm chậm: 1 bit hiển thị 0.25 s ở mọi tốc độ; sườn RC vẽ theo tỉ lệ τ/T_bit thật; gửi byte 0x55)',
    channels: [
      { name: 'HV1 = PIC TX', unit: 'V', min: -0.3, max: 5.5, color: '#ffd34d' },
      { name: 'LV1 → ESP RX', unit: 'V', min: -0.3, max: 5.5, color: '#4cc2ff' },
      { name: 'LV2 = ESP TX', unit: 'V', min: -0.3, max: 5.5, color: '#3fcf8e' },
      { name: 'HV2 → PIC RX', unit: 'V', min: -0.3, max: 5.5, color: '#ff6b9a' },
    ],
  },

  info: {
    overview: `
      <p>PIC16F877A chạy 5 V, ESP32-S3 chạy 3.3 V. Hai vấn đề:</p>
      <ul>
        <li>PIC → ESP32: 5 V vượt mức tối đa 3.6 V của chân ESP32 → hỏng dần.</li>
        <li>ESP32 → PIC: 3.3 V <b>không đủ</b> để chân RX của PIC (ngõ vào Schmitt) hiểu là mức 1 — cần ≥ 4.0 V.</li>
      </ul>
      <p>Mạch <b>BSS138</b> giải quyết cả hai, theo <b>cả 2 chiều</b>, chỉ với 1 MOSFET + 2 điện trở mỗi kênh. Module phổ biến có 4 kênh (đủ cho UART + I2C).</p>
      <p>Thử: bật <b>Nối thẳng</b> và nhìn kênh HV2 (PIC RX) chỉ lên 3.3 V — dưới ngưỡng 4.0 V. Tắt lại, chọn <b>2 Mbit/s</b> + kéo lên <b>47 kΩ</b> để thấy sườn lên "bò" không kịp → lỗi bit.</p>`,
    specs: [
      ['Module', '≈ 15.5 × 13.5 mm, 2 hàng 6 chân: HV1 HV2 HV GND HV3 HV4 / LV1 LV2 LV GND LV3 LV4'],
      ['MOSFET', 'BSS138 (SOT-23): N-kênh 50 V, 200 mA, V_GS(th) 0.8–1.5 V, R_DS(on) ≈ 2–6 Ω ở V_GS 2.5–4.5 V, C_oss ≈ 13 pF'],
      ['Điện trở kéo lên', '10 kΩ phía LV (lên 3.3 V) và 10 kΩ phía HV (lên 5 V) mỗi kênh'],
      ['Dải áp', 'LV: 1.8–3.3 V (phải thấp hơn HV) · HV: 3.3–5 V'],
      ['Tốc độ', 'Tốt tới ~400 kHz (I2C nhanh); 1 Mbit/s trở lên phụ thuộc dây ngắn & kéo lên mạnh'],
      ['Dòng', 'Chỉ cho tín hiệu (vài mA khi kéo xuống), KHÔNG dùng để cấp nguồn/chạy tải'],
    ],
    principle: `
      <h4>Cách nối 1 kênh</h4>
      <p>Cổng (G) của BSS138 nối cố định vào <b>LV = 3.3 V</b>. Nguồn (S) là chân tín hiệu LVx, máng (D) là chân tín hiệu HVx. Mỗi phía có trở kéo lên về nguồn của phía đó.</p>
      <h4>4 trường hợp</h4>
      <ol>
        <li><b>Không ai kéo xuống</b>: S = 3.3 V → V_GS = 0 → MOSFET tắt. Hai phía được trở kéo lên tới 3.3 V và 5 V riêng.</li>
        <li><b>Phía LV kéo xuống 0</b> (ESP32 TX = 0): V_GS = 3.3 V &gt; V_th → MOSFET dẫn → kéo HV xuống ~0 V. PIC đọc 0.</li>
        <li><b>Phía HV kéo xuống 0</b> (PIC TX = 0): diode thân (từ S sang D) dẫn trước, kéo S xuống ~0.6 V → V_GS ≈ 2.7 V → MOSFET dẫn hẳn → LV ≈ 0 V. ESP32 đọc 0.</li>
        <li><b>Thả ra</b>: MOSFET tắt, các phía tự lên mức 1 qua trở kéo lên → sườn lên là đường cong RC.</li>
      </ol>
      <h4>Giới hạn tốc độ</h4>
      <p>Sườn xuống nhanh (MOSFET + chân IC kéo mạnh), sườn lên chậm: <code>v(t) = V·(1 − e^(−t/τ))</code>, <code>τ = R_kéo × C_đường</code>. 10 kΩ × 40 pF = 0.4 µs. Cần ~2.2τ để lên 90 %. Ở 19200 bit/s (52 µs/bit) quá dư; ở 2 Mbit/s (0.5 µs/bit) không kịp. Giảm R kéo lên → nhanh hơn nhưng tốn dòng (<code>5 V / 1 kΩ = 5 mA</code> mỗi lần kéo xuống).</p>
      <h4>Ngưỡng đọc</h4>
      <p>PIC RX (RC7, Schmitt Trigger): mức 1 khi ≥ <code>0.8·VDD = 4.0 V</code>, mức 0 khi ≤ 1.0 V. ESP32: mức 1 khi ≥ 2.48 V, 0 khi ≤ 0.83 V. Ở giữa = vùng "không xác định".</p>`,
    inRobot: `
      <ul>
        <li>Theo docs/01: PIC chân 25 (RC6/TX) → <b>HV1 → LV1</b> → ESP32 GPIO18 (RX). ESP32 GPIO17 (TX) → <b>LV2 → HV2</b> → PIC chân 26 (RC7/RX).</li>
        <li>HV ← 5 V của buck (cùng nguồn với PIC). LV ← chân 3V3 của ESP32. GND chung.</li>
        <li>Còn 2 kênh trống (HV3/4, LV3/4): dự phòng cho I2C (RC3/RC4 của PIC) hoặc tín hiệu 5 V khác (encoder Hall 5 V → ESP32 nếu cần).</li>
        <li>19 200 bit/s → τ/T_bit &lt; 1 % — hoàn toàn dư thừa; có thể dùng dây dài 30–50 cm.</li>
      </ul>`,
    mistakes: `
      <ul>
        <li>Cắm ngược: 5 V vào chân LV, 3.3 V vào chân HV → cổng MOSFET ở 5 V, phía "LV" bị kéo lên 5 V, phía PIC chỉ có 3.3 V → không nhận dữ liệu.</li>
        <li>Quên cấp LV hoặc HV (chỉ nối GND + tín hiệu) → một chiều không hoạt động.</li>
        <li>Dùng module này để bật LED/relay/động cơ 5 V → trở kéo lên 10 kΩ chỉ cấp được 0.5 mA.</li>
        <li>Dùng cho tín hiệu nhanh (WS2812 800 kHz, SPI vài MHz, encoder tốc độ cao) với dây dài → sườn tròn, lỗi.</li>
        <li>Nối TX với TX: chiều dữ liệu do chân của MCU quyết định, module không "biết" chiều — TX phải gặp RX.</li>
      </ul>`,
    quiz: [
      { q: 'ESP32 kéo LV2 xuống 0 V. V_GS của BSS138 bằng bao nhiêu và HV2 ra sao?', a: 'Cổng ở 3.3 V, nguồn ở 0 V → V_GS = 3.3 V > V_th ≈ 1.3 V → MOSFET dẫn → HV2 bị kéo xuống ~0 V (PIC đọc 0).' },
      { q: 'Kéo lên 10 kΩ, điện dung đường 50 pF. τ bằng bao nhiêu? Có dùng được cho UART 115200 không?', a: 'τ = 10k × 50p = 0.5 µs; T_bit = 8.7 µs → τ/T ≈ 6 % → sườn lên xong trong ~1.5 µs, dùng được.' },
      { q: 'Vì sao nối thẳng ESP32 TX (3.3 V) vào PIC RX lại "lúc được lúc không"?', a: '3.3 V nằm giữa V_IL 1.0 V và V_IH 4.0 V của ngõ vào Schmitt → vùng không xác định; PIC có thể giữ mức cũ hoặc đọc sai tùy nhiệt độ, nhiễu, từng con chip.' },
    ],
  },

  steps: [
    { title: 'Bước 1 — Nhận diện 2 phía', text: 'Mặt bo in <b>HV</b> (High Voltage, 5 V) và <b>LV</b> (Low Voltage, 3.3 V). Mỗi phía 6 chân: 4 kênh tín hiệu + chân nguồn của phía đó + GND. Kênh 1 phía HV (HV1) đi với LV1 ở phía đối diện.' },
    { title: 'Bước 2 — Cấp nguồn 2 phía', text: 'HV ← 5 V (cùng nguồn PIC), LV ← chân <b>3V3 của ESP32</b>, GND ← GND chung. Đo lại: HV = 5.0 V, LV = 3.3 V. Đảo hai chân này là lỗi kinh điển.' },
    { title: 'Bước 3 — Kênh 1: PIC TX → ESP32 RX', text: 'PIC chân 25 (RC6/TX) → HV1; LV1 → ESP32 GPIO18 (RX). Khi UART nghỉ (mức 1): đo HV1 ≈ 5 V, LV1 ≈ 3.3 V.' },
    { title: 'Bước 4 — Kênh 2: ESP32 TX → PIC RX', text: 'ESP32 GPIO17 (TX) → LV2; HV2 → PIC chân 26 (RC7/RX). Khi nghỉ: LV2 ≈ 3.3 V, HV2 ≈ 5 V (≥ 4.0 V → PIC đọc 1 chắc chắn).' },
    { title: 'Bước 5 — Kiểm tra bằng tín hiệu thật', text: 'Cho ESP32 gửi PING liên tục, đo HV2 bằng máy hiện sóng: sườn xuống dựng đứng, sườn lên cong nhẹ (τ ~0.4 µs), biên độ 0–5 V. Ở 19 200 bit/s mỗi bit 52 µs — đường cong gần như không thấy.' },
  ],

  faults: [
    { id: 'noi-thang', label: 'Bỏ module — nối thẳng PIC ⇄ ESP32', severity: 'hong',
      what: '<p>Chiều ESP32 → PIC: lúc nhận được lúc không, PIC báo mất liên lạc. Chiều PIC → ESP32: chạy, nhưng GPIO18 ấm lên và sau một thời gian hỏng.</p>',
      why: '<p>ESP32 TX chỉ lên 3.3 V &lt; V_IH 4.0 V của chân RC7 (Schmitt) → vùng không xác định. PIC TX 5 V vào ESP32: diode ESD dẫn, kẹp ở ~3.9 V, dòng <code>(5 − 3.9)/R_ra ≈ 20–30 mA</code> liên tục mỗi khi TX ở mức 1 (gần như suốt thời gian vì UART nghỉ ở mức 1).</p>',
      fix: '<p>Luôn dùng BSS138 (2 chiều) hoặc ít nhất: phân áp 1k/2k cho PIC→ESP32 và IC đệm 74HCT (ngưỡng TTL 2.0 V) cho ESP32→PIC.</p>' },
    { id: 'dao-lv-hv', label: 'Cắm ngược nguồn: 5 V vào LV, 3.3 V vào HV', severity: 'loi',
      what: '<p>PIC không bao giờ nhận được lệnh (robot không chạy theo app); chân RX của ESP32 bị kéo lên 5 V qua 10 kΩ.</p>',
      why: '<p>Cổng MOSFET giờ ở 5 V, phía "HV" (nối PIC RX) chỉ được kéo lên 3.3 V → lại dưới ngưỡng 4.0 V. Phía ESP32 bị kéo lên 5 V qua 10 kΩ → dòng nhỏ (~0.1 mA) qua diode ESD — không cháy ngay nhưng ngoài thông số.</p>',
      fix: '<p>Đánh dấu dây nguồn; đo HV = 5 V, LV = 3.3 V trước khi nối tín hiệu. Nguyên tắc: LV luôn &lt; HV.</p>' },
    { id: 'thieu-lv', label: 'Quên cấp nguồn LV (3.3 V)', severity: 'loi',
      what: '<p>ESP32 vẫn nhận STATUS từ PIC (lờ mờ), nhưng PIC không nhận được lệnh nào; ESP32 báo PIC_LOST vì PIC dừng sau 300 ms không có heartbeat.</p>',
      why: '<p>Cổng MOSFET ở 0 V → MOSFET luôn tắt. Chiều HV→LV vẫn "lọt" nhờ diode thân (LV xuống ~0.6 V khi PIC kéo 0, nhưng không có trở kéo lên 3.3 V nên mức 1 lơ lửng). Chiều LV→HV: diode thân phân cực ngược, MOSFET tắt → HV2 luôn ở 5 V → PIC luôn đọc 1.</p>',
      fix: '<p>Nối LV vào chân 3V3 của ESP32. Kiểm tra bằng đồng hồ trước khi nghi ngờ code.</p>' },
    { id: 'quen-gnd', label: 'Quên nối GND chung giữa 2 bo', severity: 'loi',
      what: '<p>Dữ liệu rác, checksum sai liên tục; chạm tay vào dây thì đỡ hơn; động cơ chạy thì lỗi nhiều hơn.</p>',
      why: '<p>Điện áp chỉ có nghĩa khi so với một điểm chung. Không có GND chung, "0 V" của PIC và của ESP32 lệch nhau tùy đường dòng điện vòng qua chỗ khác (qua USB máy tính, qua vỏ…), cộng nhiễu động cơ vài trăm mV → ngưỡng đọc bị dịch.</p>',
      fix: '<p>GND của module, PIC, ESP32 nối chung về một điểm (hình sao) gần cực âm pin. Dây tín hiệu UART nên đi cặp với dây GND.</p>' },
    { id: 'toc-do-cao', label: 'Dùng cho tín hiệu 2 Mbit/s, dây dài 50 cm', severity: 'loi',
      what: '<p>Mất bit, dữ liệu sai lung tung dù code đúng; hạ tốc độ xuống thì hết lỗi.</p>',
      why: '<p>Dây 50 cm + chân IC ≈ 100 pF → <code>τ = 10 kΩ × 100 pF = 1 µs</code> &gt; thời gian 1 bit 0.5 µs → sườn lên không kịp vượt ngưỡng trước khi bên nhận lấy mẫu giữa bit.</p>',
      fix: '<p>Giảm tốc độ (dự án dùng 19 200), dây ngắn, giảm R kéo lên xuống 2.2–4.7 kΩ, hoặc dùng IC chuyển mức chuyên dụng có đẩy kéo (TXS0108E, 74LVC1T45).</p>' },
  ],

  build(ctx) {
    const { THREE, MAT, PIN_COLORS, geom, label, readout, fx } = ctx;
    const { mesh, group, part, cyl, box, pcb, wire, arrow } = geom;
    const root = new THREE.Group();
    const BW = 15.5, BD = 13.5;
    root.add(pcb(BW, BD, { mat: MAT.pcbBlue }));

    // ---------- 2 hàng chân ----------
    const HV_NAMES = ['HV1', 'HV2', 'HV', 'GND', 'HV3', 'HV4'], LV_NAMES = ['LV1', 'LV2', 'LV', 'GND', 'LV3', 'LV4'];
    const pinPos = {}, pinMesh = {};
    const pinDesc = {
      HV1: 'Kênh 1 phía 5 V ← PIC chân 25 (RC6/TX)', HV2: 'Kênh 2 phía 5 V → PIC chân 26 (RC7/RX)', HV: 'Nguồn phía cao: 5 V (cùng nguồn PIC)',
      HV3: 'Kênh 3 phía 5 V — dự phòng', HV4: 'Kênh 4 phía 5 V — dự phòng',
      LV1: 'Kênh 1 phía 3.3 V → ESP32 GPIO18 (RX)', LV2: 'Kênh 2 phía 3.3 V ← ESP32 GPIO17 (TX)', LV: 'Nguồn phía thấp: 3.3 V từ chân 3V3 của ESP32',
      LV3: 'Kênh 3 phía 3.3 V — dự phòng', LV4: 'Kênh 4 phía 3.3 V — dự phòng', GND: 'GND chung (2 chân GND nối với nhau trên bo)',
    };
    const grpOf = (n) => (n === 'GND' ? 'ground' : n === 'HV' || n === 'LV' ? 'power' : /[12]$/.test(n) ? 'uart' : 'spare');
    for (const [names, z, side] of [[HV_NAMES, -5.48, 'HV'], [LV_NAMES, 5.48, 'LV']]) {
      root.add(mesh(box(6 * 2.54, 2.5, 2.5), MAT.plasticBlack, { y: -1.6 - 1.25, z }));
      names.forEach((n, i) => {
        const x = -6.35 + i * 2.54;
        const m = MAT.gold.clone();
        m.color.set(PIN_COLORS[grpOf(n)]);
        const pin = mesh(box(0.64, 11, 0.64), m, { x, y: -3.5, z });
        root.add(part(pin, `Chân ${n} (${side})`, pinDesc[n]));
        root.add(mesh(cyl(0.8, 0.8, 0.05, 12), MAT.gold, { x, y: 0.03, z }));
        pinPos[`${side}:${n}`] = [x, z];
        pinMesh[`${side}:${n}`] = pin;
      });
    }
    label(root, 'HV (5 V)', [0, 2.5, -8.5]);
    label(root, 'LV (3.3 V)', [0, 2.5, 8.5]);

    // ---------- 4 kênh: BSS138 + 2 trở ----------
    const fets = [], resLV = [], resHV = [];
    for (let k = 0; k < 4; k++) {
      const x = -5.7 + k * 3.8;
      const fm = MAT.icBody.clone();
      const f = group(mesh(box(2.9, 1.0, 1.3), fm, { y: 0.5 }),
        mesh(box(0.4, 0.3, 0.8), MAT.tin, { x: -0.95, y: 0.15, z: -0.9 }), mesh(box(0.4, 0.3, 0.8), MAT.tin, { x: 0.95, y: 0.15, z: -0.9 }), mesh(box(0.4, 0.3, 0.8), MAT.tin, { y: 0.15, z: 0.9 }));
      f.position.set(x, 0, 0);
      root.add(part(f, `BSS138 kênh ${k + 1} (SOT-23)`, 'N-MOSFET: cổng (G) nối LV 3.3 V, nguồn (S) = chân LV' + (k + 1) + ', máng (D) = chân HV' + (k + 1) + '. Sáng xanh = đang dẫn.'));
      fets.push(fm);
      for (const [z, arr, side] of [[2.7, resLV, 'LV'], [-2.7, resHV, 'HV']]) {
        const rm = MAT.icBody.clone();
        const r = group(mesh(box(1.6, 0.5, 0.8), rm, { y: 0.25 }), mesh(box(0.3, 0.52, 0.82), MAT.tin, { x: -0.65, y: 0.26 }), mesh(box(0.3, 0.52, 0.82), MAT.tin, { x: 0.65, y: 0.26 }));
        r.position.set(x, 0, z);
        root.add(part(r, `Trở kéo lên ${side}${k + 1} — 10 kΩ (mã "103")`, side === 'LV' ? 'Kéo chân LV lên 3.3 V khi không ai kéo xuống. Sáng = đang có dòng (đầu kia bị kéo xuống 0).' : 'Kéo chân HV lên 5 V. Sáng = đang có dòng 0.5 mA.'));
        arr.push(rm);
      }
    }
    label(root, '4 × BSS138', [0, 3.5, 0]);
    const boardParts = root.children.filter((o) => !o.userData.isLabel);   // bo tự dựng (ẩn khi xem CAD)

    // ---------- mô hình CAD thật: bo SparkFun BSS138 4 kênh (build123d theo file Eagle) ----------
    // Khung GLB: HV ở −Z, LV ở +Z, chân 1 ở x = −6,35 — trùng mô hình học; mặt dưới PCB y = 0 → hạ 1,6 mm.
    const cadParts = {
      pcb: ['Bo mạch in 15,2 × 12,7 mm', 'PCB 2 lớp. Mặt trên in HV/LV và tên chân — luôn đọc chữ in trước khi cấp nguồn.'],
      silkscreen: ['Chữ in HV / LV', 'Chữ trắng trên bo cho biết phía nào là 5 V (HV) và 3.3 V (LV).'],
      hdr_HV_body: ['Header phía HV (5 V)', '6 chân: HV1, HV2, HV, GND, HV3, HV4 — nối về phía PIC.'],
      hdr_LV_body: ['Header phía LV (3.3 V)', '6 chân: LV1, LV2, LV, GND, LV3, LV4 — nối về phía ESP32.'],
      pads_header: ['Pad hàn chân header', 'Vòng đồng mạ thiếc để hàn header 2,54 mm.'],
    };
    HV_NAMES.forEach((n, i) => { cadParts[`pin_HV_${i + 1}`] = [`Chân ${n} (HV)`, pinDesc[n]]; });
    LV_NAMES.forEach((n, i) => { cadParts[`pin_LV_${i + 1}`] = [`Chân ${n} (LV)`, pinDesc[n]]; });
    for (let k = 1; k <= 4; k++) {
      cadParts[`Q${k}_BSS138`] = [`BSS138 kênh ${k} (SOT-23)`, `N-MOSFET: cổng (G) nối LV 3.3 V, nguồn (S) = chân LV${k}, máng (D) = chân HV${k}. Sáng xanh = đang dẫn.`];
      cadParts[`R${k}_10k`] = [`Trở kéo lên LV${k} — 10 kΩ (mã "103")`, 'Kéo chân LV lên 3.3 V khi không ai kéo xuống. Sáng cam = đang có dòng (đầu kia bị kéo xuống 0).'];
      cadParts[`R${k + 4}_10k`] = [`Trở kéo lên HV${k} — 10 kΩ (mã "103")`, 'Kéo chân HV lên 5 V. Sáng cam = đang có dòng 0,5 mA.'];
    }
    const cadQ = [], cadRLV = [], cadRHV = [], cadPin = {};
    const cad = cadAttach(ctx, root, 'boards/bss138-4ch-level-shifter', {
      onBottom: false, offset: [0, -1.6, 0],
      hide: boardParts,
      partDefault: ['Module chuyển mức BSS138 4 kênh (CAD thật)', 'Bo SparkFun Logic Level Converter: 4 MOSFET BSS138 + 8 điện trở 10 kΩ, 2 header 6 chân.'],
      parts: cadParts,
      onLoad(c) {
        const ms = (n) => { const a = []; c.node(n)?.traverse((o) => { if (o.isMesh) { ownMaterial(o); a.push(o); } }); return a; };
        for (let k = 1; k <= 4; k++) { cadQ.push(ms(`Q${k}_BSS138`)); cadRLV.push(ms(`R${k}_10k`)); cadRHV.push(ms(`R${k + 4}_10k`)); }
        HV_NAMES.forEach((n, i) => { cadPin[`HV:${n}`] = c.node(`pin_HV_${i + 1}`); c.color(`pin_HV_${i + 1}`, PIN_COLORS[grpOf(n)]); });
        LV_NAMES.forEach((n, i) => { cadPin[`LV:${n}`] = c.node(`pin_LV_${i + 1}`); c.color(`pin_LV_${i + 1}`, PIN_COLORS[grpOf(n)]); });
      },
    });
    const emis = (list, r, g, b, k = 1) => { for (const o of list || []) { if (o.userData._preHeat) continue; o.material.emissive.setRGB(r, g, b); o.material.emissiveIntensity = k; } };

    // ---------- ô phóng to kênh 1 (sơ đồ nổi) ----------
    const zoom = new THREE.Group();
    zoom.position.set(0, 18, 0);
    root.add(zoom);
    const zf = MAT.icBody.clone();
    const zBody = mesh(box(8, 4, 3), zf, { y: 0 });
    const zG = mesh(box(1, 4, 1), MAT.tin, { y: 4 });
    const zS = mesh(box(1, 1, 4), MAT.tin, { x: -3, z: 3 });
    const zD = mesh(box(1, 1, 4), MAT.tin, { x: 3, z: -3 });
    zoom.add(part(group(zBody, zG, zS, zD), 'Phóng to: BSS138 kênh 2 (ESP TX → PIC RX)', 'G (trên) nối 3.3 V; S (trái, phía LV) nối ESP32 TX; D (phải, phía HV) nối PIC RX. Đổi màu theo trạng thái dẫn.'));
    const diodeArrow = arrow([-3, -2.6, 1], [3, -2.6, -1], 0xff6b9a, 1.2);
    zoom.add(diodeArrow);
    part(diodeArrow, 'Diode thân (body diode)', 'Có sẵn trong MOSFET, từ S sang D. Khi phía HV kéo xuống, diode này dẫn trước, kéo S xuống ~0.6 V để MOSFET tự mở.');
    const zLabel = label(zoom, 'Kênh 2: V_GS = 3.3 V → DẪN', [0, 7.5, 0]);
    zoom.add(wire([[-3, 0, 5], [-10, 0, 8], [-14, -2, 10]], { radius: 0.4, color: 0x3fcf8e }));
    zoom.add(wire([[3, 0, -5], [10, 0, -8], [14, -2, -10]], { radius: 0.4, color: 0xff6b9a }));
    label(zoom, 'ESP32 TX (3.3 V)', [-15, -2, 11]);
    label(zoom, 'PIC RX (5 V)', [15, -2, -11]);

    // ---------- dây tới PIC & ESP32 (theo bước) ----------
    const stub = (key, color, dz) => {
      const [x, z] = pinPos[key];
      return wire([[x, -8, z], [x, -10, z + dz * 0.5], [x, -11, z + dz]], { radius: 0.35, color });
    };
    const wPow = group(stub('HV:HV', 0xd23b3b, -8), stub('LV:LV', 0xff9a3b, 8), stub('HV:GND', 0x111111, -8), stub('LV:GND', 0x111111, 8));
    const wCh1 = group(stub('HV:HV1', 0xffd34d, -8), stub('LV:LV1', 0x4cc2ff, 8));
    const wCh2 = group(stub('HV:HV2', 0xff6b9a, -8), stub('LV:LV2', 0x3fcf8e, 8));
    root.add(part(wPow, 'Dây nguồn 5 V / 3.3 V / GND', 'HV ← 5 V buck; LV ← 3V3 của ESP32; GND chung.'), part(wCh1, 'Dây kênh 1', 'PIC TX → HV1, LV1 → ESP32 GPIO18.'), part(wCh2, 'Dây kênh 2', 'ESP32 GPIO17 → LV2, HV2 → PIC RX.'));

    // ---------- mô phỏng tín hiệu ----------
    const frameBits = [0];                       // start, 8 bit LSB trước, stop, nghỉ 2 bit
    for (let k = 0; k < 8; k++) frameBits.push((BYTE >> k) & 1);
    frameBits.push(1, 1, 1);
    const st = { lv1: VL, hv2: VH, pic: 1, esp: 1, errs: 0, bits: 0, lastBit: -1 };
    let fault = null, fT = 0, step = -1;

    // tiến 1 nút về mức đích: nhanh khi bị kéo xuống (τ nhỏ), chậm khi chỉ có trở kéo lên (τ = R·C)
    const relax = (v, target, tauDisp, dt) => target + (v - target) * Math.exp(-dt / Math.max(1e-6, tauDisp));

    return {
      object: root,
      setStep(i) { step = i; },
      triggerFault(id) { fault = id; fT = 0; st.errs = 0; st.bits = 0; },
      resetFault() { fault = null; fT = 0; st.errs = 0; st.bits = 0; },
      update(dt, t, p) {
        fT += dt;
        const cadOn = cad.sync(p);
        const s = step;
        wPow.visible = s < 0 || s >= 1;
        wCh1.visible = s < 0 || s >= 2;
        wCh2.visible = s < 0 || s >= 3;
        zoom.visible = p.zoom;

        let baud = Number(p.baud), R = Number(p.rpu), C = p.cbus * 1e-12, bypass = p.bypass;
        let vHV = VH, vLV = VL, gndOff = 0, gateV = VL;
        if (fault === 'noi-thang') bypass = true;
        if (fault === 'toc-do-cao') { baud = 2e6; C = 100e-12; }
        if (fault === 'dao-lv-hv') { vHV = VL; vLV = VH; gateV = VH; }
        if (fault === 'thieu-lv') { gateV = 0; vLV = 0; }
        if (fault === 'quen-gnd') gndOff = 0.9 * Math.sin(t * 7.3) + 0.5 * Math.sin(t * 23);
        const tbit = 1 / baud, tau = R * C;
        const tauDisp = (tau / tbit) * BIT_DISP;                      // sườn lên (trở kéo lên)
        const tauFast = ((R_DRV + R_ON) * C / tbit) * BIT_DISP;       // sườn xuống (chân IC + MOSFET kéo)

        // bit hiện tại (cả 2 kênh gửi cùng byte 0x55, kênh 2 lệch nửa khung cho dễ nhìn)
        const n = frameBits.length;
        const pos = t / BIT_DISP;
        const idx1 = Math.floor(pos) % n, idx2 = Math.floor(pos + n / 2) % n;
        const b1 = frameBits[idx1], b2 = frameBits[idx2];
        const hv1 = b1 ? VH : 0;              // PIC TX đẩy-kéo 0/5 V
        const lv2 = b2 ? VL : 0;              // ESP TX đẩy-kéo 0/3.3 V

        // ---- kênh 1: HV → LV ----
        let q1 = false, clampI = 0;
        if (bypass) {
          const tgt = b1 ? Math.min(VH, VL + 0.6) : 0;                // diode ESD kẹp ở ~3.9 V
          st.lv1 = relax(st.lv1, tgt, tauFast, dt);
          clampI = b1 ? (VH - (VL + 0.6)) / R_DRV * 1000 : 0;
        } else {
          q1 = !b1 && gateV - Math.max(0, st.lv1 > 0.6 ? 0.6 : st.lv1) > 1.3;   // diode thân kéo S xuống → V_GS lớn → dẫn
          if (!b1) st.lv1 = relax(st.lv1, gateV > 1.3 ? 0.02 : 0.6, tauFast, dt);
          else st.lv1 = relax(st.lv1, vLV, tauDisp, dt);
        }
        // ---- kênh 2: LV → HV ----
        let q2 = false;
        if (bypass) st.hv2 = relax(st.hv2, lv2, tauFast, dt);
        else {
          q2 = gateV - lv2 > 1.3;
          if (q2) st.hv2 = relax(st.hv2, 0.03, tauFast, dt);
          else st.hv2 = relax(st.hv2, vHV, tauDisp, dt);
        }
        const lv1Seen = st.lv1 + gndOff, hv2Seen = st.hv2 - gndOff;

        // ---- bên nhận lấy mẫu giữa bit (có trễ của Schmitt) ----
        const frac = pos - Math.floor(pos);
        const bitNo = Math.floor(pos);
        if (frac > 0.5 && bitNo !== st.lastBit) {
          st.lastBit = bitNo;
          const espRead = lv1Seen >= ESP_VIH ? 1 : lv1Seen <= ESP_VIL ? 0 : st.esp;
          const picRead = hv2Seen >= PIC_VIH ? 1 : hv2Seen <= PIC_VIL ? 0 : st.pic;
          st.esp = espRead; st.pic = picRead;
          st.bits += 2;
          if (espRead !== b1) st.errs++;
          if (picRead !== b2) st.errs++;
        }

        // ---- hình ảnh ----
        const green = (m, on) => { m.emissive.setRGB(0, on ? 0.9 : 0, on ? 0.4 : 0); m.emissiveIntensity = 1; };
        fets.forEach((m, k) => green(m, (k === 0 && q1) || (k === 1 && q2)));
        green(zf, q2);
        resLV.forEach((m, k) => { const on = (k === 0 && !b1 && !bypass) || (k === 1 && !b2 && !bypass); m.emissive.setRGB(on ? 1 : 0, on ? 0.5 : 0, 0); });
        resHV.forEach((m, k) => { const on = (k === 0 && !b1 && !bypass) || (k === 1 && q2); m.emissive.setRGB(on ? 1 : 0, on ? 0.5 : 0, 0); });
        if (zLabel.element) zLabel.element.textContent = bypass ? 'NỐI THẲNG — không qua MOSFET' : q2 ? `Kênh 2: V_GS = ${(gateV - lv2).toFixed(1)} V → DẪN` : `Kênh 2: V_GS = ${(gateV - lv2).toFixed(1)} V → TẮT`;
        if (cadOn) {
          // kênh nào đang dẫn → MOSFET CAD sáng xanh; trở kéo lên có dòng → sáng cam
          cadQ.forEach((l, k) => { const on = (k === 0 && q1) || (k === 1 && q2); emis(l, 0, on ? 0.9 : 0, on ? 0.4 : 0, 1.4); });
          cadRLV.forEach((l, k) => { const on = (k === 0 && !b1 && !bypass) || (k === 1 && !b2 && !bypass); emis(l, on ? 1 : 0, on ? 0.5 : 0, 0, 1.2); });
          cadRHV.forEach((l, k) => { const on = (k === 0 && !b1 && !bypass) || (k === 1 && q2); emis(l, on ? 1 : 0, on ? 0.5 : 0, 0, 1.2); });
        }
        if (fault === 'noi-thang') fx.heat(cadOn && cadPin['LV:LV1'] ? cadPin['LV:LV1'] : pinMesh['LV:LV1'], Math.min(0.6, fT / 8));

        // ---- số đo ----
        const ratio = tau / tbit;
        let stt;
        if (fault === 'noi-thang' || bypass) stt = `⚠️ Nối thẳng: PIC RX chỉ ${VL} V < 4.0 V (không chắc đọc 1); ESP RX bị kẹp, dòng ~${clampI.toFixed(0)} mA qua diode ESD`;
        else if (fault === 'dao-lv-hv') stt = '⛔ Ngược nguồn: phía PIC chỉ lên 3.3 V, phía ESP bị kéo lên 5 V';
        else if (fault === 'thieu-lv') stt = '⛔ Không có LV: cổng = 0 V, MOSFET luôn tắt → PIC không nhận lệnh';
        else if (fault === 'quen-gnd') stt = '⚠️ Không chung GND: mức tín hiệu trôi theo nhiễu';
        else if (ratio > 0.35) stt = '⚠️ Sườn lên quá chậm so với 1 bit → lỗi bit';
        else if (ratio > 0.1) stt = 'Sườn lên thấy rõ — sát giới hạn';
        else stt = '✓ Chuyển mức tốt cả 2 chiều';
        readout('q1', bypass ? '— (bỏ qua)' : q1 ? 'DẪN (HV1 kéo 0)' : 'tắt');
        readout('q2', bypass ? '— (bỏ qua)' : q2 ? 'DẪN (LV2 kéo 0)' : 'tắt');
        readout('tau', tau * 1e6);
        readout('tbit', tbit * 1e6);
        readout('rx', `${st.esp} / ${st.pic}`);
        readout('err', `${st.errs} / ${st.bits} bit`);
        readout('state', stt);
        return [hv1, Math.max(-0.3, lv1Seen), lv2, Math.max(-0.3, hv2Seen)];
      },
    };
  },
};
