const n=`// 🟫 Điện trở — vạch màu, định luật Ohm, công suất P = I²R, nhiệt độ thân, và mạch phân áp đo pin 33k/10k → ADC PIC.
// Mô hình nhiệt thân điện trở 1/4 W: C·dT/dt = P − (T − Ta)/Rth, Rth ≈ 340 °C/W (định mức: 0.25 W làm nóng thêm ~85 °C)
// Phân áp: V_AN0 = VBAT·R2/(R1+R2) ; ADC = round(V_AN0·1023/5) ; firmware: vbat_mv = adc·21017/1000 (config.h VBAT_MUL)
// Lấy mẫu ADC: tụ giữ 120 pF nạp qua (R_nguồn + ~8 kΩ) trong 20 µs → sai số e^(−20µs/τ) so với kênh đo trước

import { cadAttach, ownMaterial } from '../../core/cadParts.js';

const COLORS = [
  ['Đen', 0x111111], ['Nâu', 0x6b3a1e], ['Đỏ', 0xc4161c], ['Cam', 0xf07f13], ['Vàng', 0xf2d313],
  ['Lục', 0x2e9e3a], ['Lam', 0x2457c5], ['Tím', 0x7a3fb0], ['Xám', 0x8c8c8c], ['Trắng', 0xf2f2f2],
];
const GOLD = ['Nhũ vàng', 0xc9a33a], SILVER = ['Nhũ bạc', 0xc0c4c8];
const VALUES = [10, 100, 220, 330, 1000, 4700, 10000, 33000, 100000, 1000000];
const TA = 30, RTH = 340, CTH = 0.025;         // τ nhiệt ≈ 8.5 s
const T_SMOKE = 250, T_BURN = 360;
const R1 = 33000, R2 = 10000;

function fmtR(r) {
  if (r >= 1e6) return \`\${+(r / 1e6).toPrecision(3)} MΩ\`;
  if (r >= 1e3) return \`\${+(r / 1e3).toPrecision(3)} kΩ\`;
  return \`\${+r.toPrecision(3)} Ω\`;
}
/** Trả về danh sách [tên, màu] các vạch cho giá trị r, kiểu 4 vạch (±5 %) hoặc 5 vạch (±1 %) */
function bandsFor(r, five) {
  const nd = five ? 3 : 2;
  let exp = Math.floor(Math.log10(r)) - (nd - 1);
  let sig = Math.round(r / Math.pow(10, exp));
  if (sig >= Math.pow(10, nd)) { sig /= 10; exp += 1; }
  const digits = String(sig).padStart(nd, '0').split('').map(Number);
  const out = digits.map((d) => COLORS[d]);
  out.push(exp >= 0 ? COLORS[exp] : exp === -1 ? GOLD : SILVER);
  out.push(five ? COLORS[1] : GOLD);
  return out;
}

export default {
  id: 'dien-tro',
  name: 'Điện trở',
  category: 'dien-tu',
  order: 1,
  icon: '🟫',
  summary: 'Linh kiện cơ bản nhất: cản dòng điện theo định luật Ohm. Trong robot dùng để hạn dòng LED, kéo lên/kéo xuống chân tín hiệu, và chia áp pin 14.4 V xuống < 5 V cho ADC của PIC.',
  tags: ['resistor', 'Ohm', 'vạch màu', 'phân áp', 'voltage divider', 'ADC', 'công suất', '1/4 W'],

  params: [
    { id: 'cad', label: '🧊 Mô hình CAD thật (điện trở 1/4 W DIN0207)', type: 'toggle', value: true, hint: 'Thân và chân lấy từ mô hình CAD thật; các vạch màu được vẽ phủ lên thân CAD để vẫn đọc được giá trị. Tắt = mô hình học tự dựng.' },
    { id: 'r', label: 'Giá trị điện trở thử nghiệm', type: 'select', value: '1000', options: VALUES.map((v) => [String(v), fmtR(v)]) },
    { id: 'five', label: 'Kiểu 5 vạch (màng kim loại ±1 %)', type: 'toggle', value: false },
    { id: 'v', label: 'Điện áp đặt lên điện trở thử', type: 'range', min: 0, max: 16.8, step: 0.1, value: 5, unit: 'V' },
    { id: 'vbat', label: 'Điện áp pin VBAT (mạch phân áp)', type: 'range', min: 10, max: 16.8, step: 0.1, value: 14.4, unit: 'V' },
    { id: 'cut', label: 'Cắt bổ điện trở thử', type: 'toggle', value: false },
    { id: 'reset', label: '↺ Thay điện trở mới', type: 'button' },
  ],
  readouts: [
    { id: 'code', label: 'Vạch màu', unit: '' },
    { id: 'i', label: 'Dòng I = V/R', unit: 'mA' },
    { id: 'p', label: 'Công suất P = V²/R (định mức 0.25 W)', unit: 'W' },
    { id: 'temp', label: 'Nhiệt độ thân', unit: '°C' },
    { id: 'van0', label: 'V tại AN0 = VBAT·10/43', unit: 'V' },
    { id: 'adc', label: 'ADC 10-bit đọc được', unit: '/1023' },
    { id: 'vfw', label: 'Firmware tính vbat_mv', unit: 'mV' },
    { id: 'idiv', label: 'Dòng tiêu hao qua phân áp', unit: 'µA' },
    { id: 'state', label: 'Trạng thái', unit: '' },
  ],
  scope: {
    window: 10,
    note: '(thời gian thực · ADC đọc mỗi 50 ms)',
    channels: [
      { name: 'Công suất P', unit: 'W', min: 0, max: 2.5, color: '#ff6b9a' },
      { name: 'Nhiệt độ thân', unit: '°C', min: 0, max: 450, color: '#ffd34d' },
      { name: 'V tại AN0', unit: 'V', min: 0, max: 5.5, color: '#3fcf8e' },
      { name: 'ADC', unit: '', min: 0, max: 1023, color: '#4cc2ff' },
    ],
  },

  info: {
    overview: \`
      <p><b>Điện trở</b> (resistor) "cản" dòng điện: đặt điện áp V lên điện trở R thì dòng chạy qua là <code>I = V/R</code>. Năng lượng bị cản biến thành <b>nhiệt</b> — nên mỗi điện trở có <b>công suất định mức</b> (loại phổ biến 1/4 W = 0.25 W).</p>
      <p>Trong robot hút bụi, điện trở có mặt khắp nơi: trở kéo lên 10 kΩ ở chân MCLR, trở 100 Ω + 10 kΩ ở cổng MOSFET, trở hạn dòng LED, và <b>cặp phân áp 33 kΩ / 10 kΩ</b> để PIC đo được pin 16.8 V bằng ADC chỉ chịu 0–5 V.</p>
      <p>Thử: chọn <b>100 Ω</b> rồi kéo điện áp lên 12 V — công suất 1.44 W gấp 6 lần định mức, xem nhiệt độ leo lên và điện trở bốc khói. Sau đó kéo <b>VBAT</b> từ 16.8 V xuống 12 V và xem số ADC mà PIC đọc được.</p>\`,
    specs: [
      ['Kích thước 1/4 W', 'Thân Ø2.4 × 6.3 mm, chân Ø0.6 mm, bước cắm 10.16 mm (0.4")'],
      ['Công suất định mức', '0.25 W ở 70 °C môi trường; nóng thêm ~85 °C khi chạy đúng định mức'],
      ['Sai số', 'Màng carbon ±5 % (thân be, 4 vạch) · màng kim loại ±1 % (thân xanh, 5 vạch)'],
      ['Hệ số nhiệt', 'Carbon −250…−500 ppm/°C · kim loại ±50 ppm/°C (ổn định hơn — nên dùng cho phân áp đo pin)'],
      ['Điện áp tối đa', '250 V (1/4 W) — không thành vấn đề trong robot'],
      ['Dãy giá trị E12', '10 · 12 · 15 · 18 · 22 · 27 · 33 · 39 · 47 · 56 · 68 · 82 × 10ⁿ'],
      ['Phân áp pin dự án', '33 kΩ + 10 kΩ: 16.8 V → 3.91 V · 12.0 V → 2.79 V · dòng 0.39 mA'],
    ],
    principle: \`
      <h4>1. Định luật Ohm & công suất</h4>
      <p><code>V = I·R</code> · <code>P = V·I = I²·R = V²/R</code>. Ví dụ LED đỏ (Vf ≈ 2 V) từ chân PIC 5 V, muốn 10 mA: <code>R = (5 − 2)/0.01 = 300 Ω</code> → chọn 330 Ω, công suất 0.03 W.</p>
      <h4>2. Đọc vạch màu</h4>
      <p>Đen 0 · Nâu 1 · Đỏ 2 · Cam 3 · Vàng 4 · Lục 5 · Lam 6 · Tím 7 · Xám 8 · Trắng 9. <b>4 vạch</b>: 2 chữ số + số mũ 10 + sai số (nhũ vàng ±5 %). <b>5 vạch</b>: 3 chữ số + số mũ + sai số (nâu ±1 %). Ví dụ Cam-Cam-Cam-Nhũ vàng = 33 × 10³ = 33 kΩ ±5 %. Vạch sai số thường cách xa hơn — bắt đầu đọc từ đầu kia.</p>
      <h4>3. Bên trong</h4>
      <p>Lõi gốm phủ một lớp màng carbon/kim loại mỏng. Máy laser cắt một <b>rãnh xoắn ốc</b> trên lớp màng để kéo dài đường đi của dòng điện cho tới đúng giá trị (bật "Cắt bổ" để xem). Hai đầu là nắp kim loại hàn với chân.</p>
      <h4>4. Mạch phân áp (voltage divider)</h4>
      <p><code>V_ra = V_vào · R2/(R1 + R2)</code>. Với 33k/10k: hệ số 10/43 = 0.2326. ADC 10-bit của PIC: <code>ADC = V·1023/5</code>. Ngược lại firmware tính <code>vbat_mv = adc × 5000/1023 × 43/10 = adc × 21.017</code>.</p>
      <div class="tip">Vì sao không dùng 3.3k/1k? Dòng qua phân áp chạy suốt kể cả khi robot tắt. 33k/10k chỉ tốn 0.39 mA; còn đủ nhỏ (trở nguồn 7.7 kΩ) để tụ lấy mẫu của ADC nạp kịp.</div>\`,
    inRobot: \`
      <ul>
        <li><b>Phân áp pin</b>: VBAT —33k— <b>RA0/AN0 (chân 2)</b> —10k— GND. Nên thêm tụ 100 nF từ AN0 xuống GND để lọc nhiễu PWM. Firmware: <code>sensors.c</code> đọc kênh <code>ADC_CH_VBAT = 0</code>, <code>VBAT_MUL = 21017</code>, cắt khi &lt; 12 400 mV (3.1 V/cell).</li>
        <li><b>MCLR</b>: 10 kΩ kéo lên 5 V (chân 1).</li>
        <li><b>Cổng MOSFET chổi</b>: 100 Ω nối tiếp (hạn dòng nạp cổng) + 10 kΩ kéo xuống GND (giữ MOSFET tắt khi PIC đang reset).</li>
        <li><b>Encoder trái RA4</b>: chân open-drain → trở kéo lên 10 kΩ. <b>FG quạt</b>: trở kéo lên 10 kΩ về 3.3 V ở ESP32.</li>
        <li><b>LED trạng thái RD7</b>: 330 Ω nối tiếp.</li>
      </ul>\`,
    mistakes: \`
      <ul>
        <li>Đọc vạch màu từ nhầm đầu (33 kΩ ↔ 330 Ω…) → luôn đo lại bằng đồng hồ trước khi hàn.</li>
        <li>Đổi chỗ 2 điện trở phân áp → 12.9 V vào chân ADC của PIC (thử trong Sự cố).</li>
        <li>Dùng trở 1/4 W cho tải tốn công suất (hạn dòng LED công suất, xả tụ, tải giả) → cháy.</li>
        <li>Phân áp dùng điện trở quá lớn (330k/100k) → ADC đọc thấp và nhảy lung tung.</li>
        <li>Đo điện trở khi còn hàn trên mạch → đồng hồ đo cả các linh kiện song song, sai số lớn.</li>
      </ul>\`,
    quiz: [
      { q: 'Điện trở có vạch Nâu–Đen–Cam–Nhũ vàng là bao nhiêu?', a: '1-0 × 10³ = 10 kΩ, sai số ±5 %.' },
      { q: 'Pin 4S đang 14.0 V. AN0 nhận bao nhiêu volt và ADC đọc khoảng bao nhiêu?', a: 'V = 14.0 × 10/43 = 3.26 V → ADC ≈ 3.26 × 1023/5 ≈ 666. Firmware: 666 × 21.017 ≈ 13 997 mV.' },
      { q: 'Điện trở 1/4 W, 220 Ω nối thẳng vào pin 14.4 V có sao không?', a: 'P = 14.4²/220 = 0.94 W, gần gấp 4 lần định mức → rất nóng (> 300 °C), cháy sơn, có thể đứt. Cần trở ≥ 1 W hoặc tăng giá trị điện trở.' },
    ],
  },

  faults: [
    { id: 'qua-cong-suat', label: 'Trở 100 Ω 1/4 W nối thẳng vào pin 14.4 V', severity: 'chay',
      what: '<p>Sau 2–3 giây thân điện trở nóng không chạm được, sơn chuyển nâu rồi đen, bốc khói khét. Khoảng 5–7 giây sau màng carbon cháy đứt → hở mạch, dòng về 0. PCB bên dưới có thể bị xém vàng.</p>',
      why: '<p><code>P = V²/R = 14.4² / 100 ≈ 2.07 W</code> — gấp <b>8 lần</b> định mức 0.25 W. Nhiệt độ cân bằng sẽ là <code>T = Ta + P·Rth = 30 + 2.07 × 340 ≈ 735 °C</code>, nên sơn (~250 °C) và màng carbon (~350 °C) cháy trước khi đạt tới.</p>',
      fix: '<p>Luôn tính P và chọn điện trở có định mức ≥ 2× công suất thực (ở đây cần ≥ 5 W, hoặc dùng R lớn hơn). Không sờ vào điện trở nghi quá tải — đo bằng nhiệt kế hồng ngoại. Điện trở đã đổi màu phải thay, giá trị đã bị lệch.</p>' },
    { id: 'dao-phan-ap', label: 'Lắp đổi chỗ 33k ↔ 10k trong phân áp', severity: 'loi',
      what: '<p>ADC luôn đọc 1023 (kịch trần). Firmware tưởng pin ~21.5 V, không bao giờ báo pin yếu → robot chạy tới khi pin cạn sâu (BMS cắt đột ngột, hoặc pin NiMH bị hỏng vì xả quá).</p>',
      why: '<p>Lắp ngược: <code>V_AN0 = 16.8 × 33/43 ≈ 12.9 V</code> &gt; VDD + 0.3 V. Diode bảo vệ bên trong chân PIC dẫn, kẹp ở ~5.3 V, dòng bơm vào là <code>(16.8 − 5.3)/10 kΩ − 5.3/33 kΩ ≈ 1.0 mA</code> (dưới giới hạn tuyệt đối 20 mA nên chip chưa chết, nhưng đẩy dòng ngược vào đường 5 V và làm lệch các kênh ADC khác).</p>',
      fix: '<p>Vẽ sơ đồ rõ R1 (phía pin) / R2 (phía GND), đo điện áp AN0 bằng đồng hồ TRƯỚC khi cắm PIC: phải &lt; 4 V khi pin đầy. Thêm trở 1 kΩ nối tiếp vào chân ADC để hạn dòng diode kẹp.</p>' },
    { id: 'tro-lon', label: 'Phân áp dùng 330k / 100k (quá lớn)', severity: 'loi',
      what: '<p>Số ADC nhảy lung tung ±20–60 đơn vị, trung bình thấp hơn thực tế; thay đổi theo kênh vừa đọc trước đó (cảm biến chống rơi).</p>',
      why: '<p>Trở nguồn Thevenin = 330k ∥ 100k ≈ 77 kΩ. Tụ giữ mẫu 120 pF của ADC nạp với <code>τ ≈ (77k + 8k)·120 pF ≈ 10 µs</code>; firmware chỉ chờ 20 µs = 2τ → còn sai <code>e⁻² ≈ 13 %</code> so với điện áp của kênh trước. Dòng rò chân ±1 µA × 77 kΩ còn lệch thêm ~77 mV. Datasheet PIC khuyên trở nguồn ≤ 2.5 kΩ.</p>',
      fix: '<p>Dùng 33k/10k (τ ≈ 1.9 µs, 20 µs = 10τ) + tụ 100 nF tại AN0: tụ lớn cấp điện tích tức thời cho tụ 120 pF. Hoặc tăng thời gian chờ sau <code>set_adc_channel()</code>.</p>' },
    { id: 'tro-nho', label: 'Phân áp dùng 3.3k / 1k (quá nhỏ)', severity: 'nhe',
      what: '<p>Đo pin rất chính xác, nhưng cất robot 1 tháng thì pin cạn kiệt dù đã tắt công tắc phần mềm.</p>',
      why: '<p>Phân áp nối thẳng vào pin: <code>I = 16.8/4.3 kΩ ≈ 3.9 mA</code> chảy suốt 24/7 → 3.9 mA × 720 h ≈ <b>2.8 Ah/tháng</b> (gần hết pin 2.6 Ah). Còn tỏa 65 mW nhiệt. Với 33k/10k: 0.39 mA → 0.28 Ah/tháng.</p>',
      fix: '<p>Đặt phân áp SAU công tắc chính (như sơ đồ docs/01), hoặc đóng/ngắt phân áp bằng MOSFET chỉ khi đo. Chọn trở lớn nhất mà ADC vẫn đọc ổn định (≈ 10–47 kΩ + tụ 100 nF).</p>' },
  ],

  build(ctx) {
    const { THREE, MAT, geom, label, readout, fx } = ctx;
    const { mesh, group, part, cyl, box, lathe, helixThread, makeCutaway, pcb, wire } = geom;
    const root = new THREE.Group();

    // ---------- tạo 1 điện trở trục (thân dọc theo X) ----------
    function makeResistor({ bodyColor = 0xd8c39a, nBands = 5 } = {}) {
      const g = new THREE.Group();
      const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.55 });
      const body = mesh(lathe([[0, -3.15], [1.05, -3.15], [1.22, -2.9], [1.22, -1.9], [1.02, -1.5], [1.02, 1.5], [1.22, 1.9], [1.22, 2.9], [1.05, 3.15], [0, 3.15]], 40), bodyMat, { rz: Math.PI / 2 });
      g.add(body);
      const bands = [];
      for (let k = 0; k < nBands; k++) {
        const b = mesh(cyl(1.08, 1.08, 0.5, 32, true), new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.4 }), { rz: Math.PI / 2 });
        g.add(b);
        bands.push(b);
      }
      return { g, body, bands };
    }
    const placeBands = (bands, five, onCad = false) => {
      const xs = five ? [-2.25, -1.4, -0.55, 0.3, 2.3] : [-2.2, -1.25, -0.3, 2.3];
      bands.forEach((b, k) => { b.visible = k < xs.length; if (k < xs.length) { b.position.x = xs[k]; b.scale.y = 1; } });
      // vạch nằm trên phần thân cong lên ở 2 đầu → bán kính lớn hơn.
      // Trên thân CAD thật (DIN0207, có 2 đầu phình Ø2,5 mm) vạch được sơn phủ ngoài: bán kính đầu 1,3 mm, giữa 1,16 mm.
      bands.forEach((b) => { const ax = Math.abs(b.position.x); const k = onCad ? (ax > 1.6 ? 1.2 : 1.07) : (ax > 1.6 ? 1.15 : 1.0); b.scale.set(k, 1, k); });
    };

    // ---------- điện trở thử nghiệm (to, giữa cảnh) ----------
    const test = new THREE.Group();
    test.position.set(0, 4.5, 4);
    root.add(test);
    const T = makeResistor({ nBands: 5 });
    const shell = group(T.body, ...T.bands);
    test.add(part(shell, 'Thân điện trở thử (sơn + vạch màu)', 'Lớp sơn epoxy cách điện; các vạch màu cho biết giá trị. Vạch xa nhất là sai số.'));
    const core = mesh(cyl(0.78, 0.78, 5.0, 24), MAT.plasticWhite, { rz: Math.PI / 2 });
    const film = mesh(helixThread({ radius: 0.82, pitch: 0.45, turns: 9, tube: 0.07, y0: 2.0 }), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.7 }), { rz: Math.PI / 2 });
    const caps = group(mesh(cyl(1.0, 1.0, 1.1, 24), MAT.tin, { x: -2.6, rz: Math.PI / 2 }), mesh(cyl(1.0, 1.0, 1.1, 24), MAT.tin, { x: 2.6, rz: Math.PI / 2 }));
    const inner = group(core, film, caps);
    inner.traverse((o) => (o.userData.noCut = true));
    test.add(part(inner, 'Lõi gốm + màng điện trở cắt rãnh xoắn', 'Màng carbon/kim loại dày vài µm phủ trên ống gốm. Laser cắt rãnh xoắn ốc để kéo dài đường đi của dòng → chỉnh đúng giá trị. Màng này cháy đứt khi quá tải.'));
    const leadMat = MAT.tin;
    const leads = group(
      mesh(cyl(0.3, 0.3, 4.2, 12), leadMat, { x: -5.2, rz: Math.PI / 2 }), mesh(cyl(0.3, 0.3, 4.2, 12), leadMat, { x: 5.2, rz: Math.PI / 2 }),
      mesh(cyl(0.3, 0.3, 6.6, 12), leadMat, { x: -7.3, y: -3.3 }), mesh(cyl(0.3, 0.3, 6.6, 12), leadMat, { x: 7.3, y: -3.3 }),
    );
    test.add(part(leads, 'Chân điện trở Ø0.6 mm (thép mạ thiếc)', 'Bẻ chân cách thân ≥ 1.5 mm để không nứt lớp sơn; bước cắm chuẩn 10.16 mm.'));
    const clips = group(
      wire([[-7.3, -2.2, 0], [-12, -1, 3], [-18, -3.5, 9]], { radius: 0.5, color: 0xd23b3b }),
      wire([[7.3, -2.2, 0], [12, -1, 3], [18, -3.5, 9]], { radius: 0.5, color: 0x1d1f23 }),
    );
    test.add(part(clips, 'Dây kẹp từ nguồn thí nghiệm', 'Đặt điện áp V lên 2 đầu điện trở (thanh kéo "Điện áp").'));
    const testPcb = pcb(22, 8, { mat: MAT.pcbGreen });
    testPcb.position.set(0, 0, 4);
    root.add(testPcb);
    // cắt bổ: mặt phẳng (toạ độ thế giới) qua trục điện trở thử, bỏ nửa phía trước (z > z_tâm) → thấy lõi gốm + màng xoắn
    const cutPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), test.position.z);
    // dây kẹp cho bản CAD (chân CAD bẻ xuống ở x = ±5,08 mm)
    const clipsCad = group(
      wire([[-5.08, -2.6, 0], [-12, -1, 3], [-18, -3.5, 9]], { radius: 0.5, color: 0xd23b3b }),
      wire([[5.08, -2.6, 0], [12, -1, 3], [18, -3.5, 9]], { radius: 0.5, color: 0x1d1f23 }),
    );
    clipsCad.visible = false;
    clipsCad.traverse((o) => (o.userData.noCut = true));
    test.add(part(clipsCad, 'Dây kẹp từ nguồn thí nghiệm', 'Kẹp vào 2 chân điện trở, đặt điện áp V lên 2 đầu (thanh kéo "Điện áp").'));
    const setCut = makeCutaway(test, cutPlane);

    // ---------- mạch phân áp đo pin ----------
    const div = new THREE.Group();
    div.position.set(0, 0, -12);
    root.add(div);
    div.add(part(pcb(30, 12, { mat: MAT.pcbBlue }), 'Bo phân áp đo pin', 'VBAT → 33 kΩ → điểm giữa (AN0) → 10 kΩ → GND.'));
    function smallRes(x, list, name, desc) {
      const r = makeResistor({ nBands: 4 });
      placeBands(r.bands, false);
      r.bands.forEach((b, k) => b.material.color.setHex(list[k][1]));
      r.g.position.set(x, 2.2, 0);
      r.g.add(mesh(cyl(0.3, 0.3, 2.4, 10), leadMat, { x: -4.3, rz: Math.PI / 2 }), mesh(cyl(0.3, 0.3, 2.4, 10), leadMat, { x: 4.3, rz: Math.PI / 2 }));
      r.g.add(mesh(cyl(0.3, 0.3, 2.4, 10), leadMat, { x: -5.4, y: -1.1 }), mesh(cyl(0.3, 0.3, 2.4, 10), leadMat, { x: 5.4, y: -1.1 }));
      r.g.userData.bands = r.bands;
      return part(r.g, name, desc);
    }
    const r1 = smallRes(-6.5, bandsFor(R1, false), 'R1 = 33 kΩ (Cam–Cam–Cam–Nhũ vàng)', 'Phía pin. Chịu phần lớn điện áp: 16.8 − 3.9 = 12.9 V, công suất chỉ 5 mW.');
    const r2 = smallRes(6.5, bandsFor(R2, false), 'R2 = 10 kΩ (Nâu–Đen–Cam–Nhũ vàng)', 'Phía GND. Điện áp trên nó chính là điện áp đưa vào AN0.');
    div.add(r1, r2);
    const r1Bands = r1.userData.bands, r2Bands = r2.userData.bands;
    const tr = (x0, x1, z) => mesh(box(Math.abs(x1 - x0), 0.08, 0.8), MAT.copper, { x: (x0 + x1) / 2, y: 0.04, z });
    div.add(tr(-13, -11.9, 0), tr(-1.1, 1.1, 0), tr(11.9, 13, 0), mesh(box(0.8, 0.08, 4), MAT.copper, { x: 0, y: 0.04, z: 2 }));
    const pads = [];
    [['VBAT', -13.5, 0xd23b3b], ['AN0', 0, 0x2fbf71], ['GND', 13.5, 0x555b66]].forEach(([n, x, c]) => {
      const pin = mesh(cyl(0.9, 0.9, 6, 12), MAT.gold, { x, y: 3, z: n === 'AN0' ? 4.2 : 0 });
      const ring = mesh(cyl(1.4, 1.4, 0.3, 16), new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }), { x, y: 0.15, z: n === 'AN0' ? 4.2 : 0 });
      const g = group(pin, ring);
      pads.push(g);
      div.add(part(g, n === 'VBAT' ? 'Chân VBAT (sau công tắc chính)' : n === 'AN0' ? 'Ra AN0 → chân 2 (RA0) PIC' : 'GND chung', n === 'AN0' ? 'Điện áp 2.3–3.9 V tùy mức pin. Nên có tụ 100 nF xuống GND.' : 'Đầu nối của mạch phân áp.'));
    });

    // ---------- mô hình CAD thật: điện trở trục 1/4 W DIN0207 (thư viện KiCad, nằm, bước 10,16 mm) ----------
    // Khung GLB: thân Ø2,5 × 6,3 mm nằm sát y = 0 (tâm thân y = 1,25), chân bẻ xuống tới y = −3.
    // CAD không có vạch màu → giữ các vạch tự dựng làm lớp sơn phủ lên thân CAD; thân CAD được tô màu nền (be / xanh).
    const RES_PARTS = {
      resistor: ['Thân điện trở 1/4 W (DIN0207, Ø2,5 × 6,3 mm)', 'Lớp sơn epoxy cách điện phủ ngoài ống gốm có màng điện trở. Các vạch màu (vẽ phủ) cho biết giá trị — vạch xa nhất là sai số.'],
      'pin_*': ['Chân điện trở Ø0,6 mm (thép mạ thiếc)', 'Bẻ chân cách thân ≥ 1,5 mm để không nứt lớp sơn; bước cắm chuẩn 10,16 mm (4 lỗ breadboard).'],
    };
    const resCads = [];
    const resCad = (parent, offsetY, hide, extra = {}) => {
      const c = cadAttach(ctx, parent, 'vendor/r_axial_din0207_l6_3mm_d2_5mm_p10_16mm_horizontal', {
        onBottom: false, offset: [0, offsetY, 0], hide, parts: RES_PARTS, ...extra,
        onLoad(cc) {
          // mesh thân (không phải kim loại) trong node 'resistor' — chỉ tô màu nền phần này, chân giữ màu thiếc
          cc.bodyMesh = null;
          cc.node('resistor')?.traverse((o) => { if (o.isMesh && (o.material.metalness ?? 0) < 0.5) cc.bodyMesh = o; });
          cc.bodyColor = null;
        },
      });
      resCads.push(c);
      return c;
    };
    const cadTest = resCad(test, -1.25, [T.body, leads, clips], {
      partDefault: ['Điện trở thử nghiệm (CAD thật DIN0207)', 'Điện trở màng 1/4 W kích thước thật: thân Ø2,5 × 6,3 mm, chân Ø0,6 mm, bước 10,16 mm.'],
    });
    // điện trở trong mạch phân áp: tâm thân tự dựng ở y = 2,2 → CAD nâng 0,95 mm (đúng kiểu hàn hở chân khỏi bo)
    const cadR1 = resCad(r1, -1.25, r1.children.filter((o) => o.isMesh && !r1Bands.includes(o)), { frame: false, partDefault: ['R1 = 33 kΩ (Cam–Cam–Cam–Nhũ vàng)', 'Phía pin. Chịu phần lớn điện áp: 16.8 − 3.9 = 12.9 V, công suất chỉ 5 mW.'] });
    const cadR2 = resCad(r2, -1.25, r2.children.filter((o) => o.isMesh && !r2Bands.includes(o)), { frame: false, partDefault: ['R2 = 10 kΩ (Nâu–Đen–Cam–Nhũ vàng)', 'Phía GND. Điện áp trên nó chính là điện áp đưa vào AN0.'] });
    let lastCadBands = null, lastCadClip = null;
    const setCadBody = (c, hex) => {
      if (!c.loaded || !c.bodyMesh || c.bodyColor === hex) return;
      c.bodyColor = hex;
      c.color(c.bodyMesh, hex);
    };

    label(test, 'Điện trở thử nghiệm', [0, 3.5, 0]);
    label(div, '33 kΩ', [-6.5, 5, 0]);
    label(div, '10 kΩ', [6.5, 5, 0]);
    label(div, 'VBAT', [-13.5, 7, 0]);
    label(div, 'AN0 → PIC chân 2', [0, 7.5, 4.2]);
    label(div, 'GND', [13.5, 7, 0]);

    // ---------- trạng thái ----------
    let lastKey = null, temp = TA, burnt = false, smoked = false, fired = false, heated = false, lastCut = null;
    let fault = null, adcT = 0, adcVal = 0, prevCh = 2.5, seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const resetRes = () => { temp = TA; burnt = false; smoked = false; fired = false; };

    return {
      object: root,
      onAction(id) {
        if (id === 'reset') { fx.restore(test); resetRes(); heated = false; lastKey = null; }
      },
      triggerFault(id) { fault = id; resetRes(); },
      resetFault() { fault = null; resetRes(); heated = false; lastKey = null; },
      update(dt, t, p) {
        if (p.cut !== lastCut) { setCut(p.cut); lastCut = p.cut; }
        // ----- CAD thật: bật/tắt; vạch màu phủ lên thân CAD; cắt bổ = cắt nửa thân CAD -----
        const cadOn = cadTest.sync(p);
        const cadR = [cadR1.sync(p), cadR2.sync(p)];
        clipsCad.visible = cadOn;
        if (cadOn) setCadBody(cadTest, p.five ? 0x5d8fd6 : 0xd8c39a);
        if (cadR[0]) setCadBody(cadR1, 0xd8c39a);
        if (cadR[1]) setCadBody(cadR2, 0xd8c39a);
        const bandKey = \`\${cadOn}|\${cadR[0]}|\${cadR[1]}|\${p.five}\`;
        if (bandKey !== lastCadBands) {
          lastCadBands = bandKey;
          lastKey = null;                                   // vẽ lại vạch điện trở thử (bán kính theo thân CAD / tự dựng)
          placeBands(r1Bands, false, cadR[0]);
          placeBands(r2Bands, false, cadR[1]);
        }
        if (cadOn && cadTest.bodyMesh) {
          const clip = !!p.cut;
          if (clip !== lastCadClip) {
            lastCadClip = clip;
            cadTest.node('resistor')?.traverse((o) => { if (o.isMesh) { const m = ownMaterial(o); m.clippingPlanes = clip ? [cutPlane] : null; m.side = THREE.DoubleSide; m.needsUpdate = true; } });
          }
        }
        // ----- điện trở thử -----
        let R = Number(p.r), V = p.v;
        if (fault === 'qua-cong-suat') { R = 100; V = 14.4; }
        const list = bandsFor(R, p.five);
        // chỉ tô lại màu khi đổi giá trị/kiểu vạch (để không xóa vết cháy xém của fx.scorch)
        const key = \`\${R}|\${p.five}\`;
        if (key !== lastKey) {
          lastKey = key;
          placeBands(T.bands, p.five, cadOn);
          T.bands.forEach((b, k) => { if (k < list.length) b.material.color.setHex(list[k][1]); });
          T.body.material.color.setHex(p.five ? 0x5d8fd6 : 0xd8c39a);
        }
        const I = burnt ? 0 : V / R;
        const P = V * I;
        temp += ((P - (temp - TA) / RTH) / CTH) * dt;
        if (temp > T_SMOKE && !smoked) { smoked = true; fx.smoke(test, { size: 5, duration: 6 }); }
        if (temp > T_BURN && !burnt) {
          burnt = true;
          fx.scorch(shell, 0.85);
          if (cadOn && cadTest.bodyMesh) { fx.scorch(cadTest.bodyMesh, 0.85); }
          fx.smoke(test, { size: 7, duration: 5, color: 0x333333 });
          if (P > 2) fx.sparks(test, { count: 12, speed: 12, size: 0.4 });
        }
        if (P > 2.5 && temp > 300 && !fired) { fired = true; fx.fire(test, { size: 3, duration: 1.5 }); }
        const hot = burnt ? 0 : Math.max(0, (temp - 120) / 320);
        if (hot > 0.02) { fx.heat(shell, hot); if (cadOn && cadTest.bodyMesh) fx.heat(cadTest.bodyMesh, hot); heated = true; }
        else if (heated) { fx.heat(shell, 0); if (cadTest.bodyMesh) fx.heat(cadTest.bodyMesh, 0); heated = false; }

        // ----- phân áp + ADC -----
        let ra = R1, rb = R2;
        if (fault === 'dao-phan-ap') { ra = R2; rb = R1; }
        if (fault === 'tro-lon') { ra = 330000; rb = 100000; }
        if (fault === 'tro-nho') { ra = 3300; rb = 1000; }
        let vAn = (p.vbat * rb) / (ra + rb);
        let clampI = 0;
        if (vAn > 5.3) { clampI = (p.vbat - 5.3) / ra - 5.3 / rb; vAn = 5.3; }
        const rth = (ra * rb) / (ra + rb);
        adcT -= dt;
        if (adcT <= 0) {
          adcT = 0.05;
          // lỗi lấy mẫu: tụ 120 pF nạp chưa đủ trong 20 µs (phần dư từ kênh đo trước — cảm biến cliff 0.5–4.5 V)
          const tau = (rth + 8000) * 120e-12;
          const err = Math.exp(-20e-6 / tau);
          const leak = (rnd() - 0.5) * 2e-6 * rth;
          const vS = vAn + (prevCh - vAn) * err + leak;
          prevCh = 0.5 + 4 * rnd();
          adcVal = Math.max(0, Math.min(1023, Math.round((vS * 1023) / 5 + (rnd() - 0.5) * 1.2)));
        }
        const vfw = (adcVal * 21017) / 1000;
        const iDiv = (p.vbat / (ra + rb)) * 1e6;

        let state = 'Bình thường';
        if (P > 0.25) state = \`⚠️ Quá công suất \${(P / 0.25).toFixed(1)}× định mức\`;
        if (temp > T_SMOKE) state = '🔥 Sơn cháy, bốc khói';
        if (burnt) state = '🔥 Màng điện trở cháy đứt → hở mạch (bấm "Thay điện trở mới")';
        if (fault === 'dao-phan-ap') state = \`⚠️ AN0 bị kẹp ở 5.3 V, dòng \${(clampI * 1000).toFixed(2)} mA chảy vào diode bảo vệ — ADC = 1023\`;
        if (fault === 'tro-lon') state = \`⚠️ Trở nguồn \${(rth / 1000).toFixed(0)} kΩ ≫ 2.5 kΩ → ADC nhảy\`;
        if (fault === 'tro-nho') state = \`ℹ️ Phân áp tốn \${(iDiv / 1000).toFixed(1)} mA suốt ngày đêm ≈ \${(iDiv * 720 / 1e6).toFixed(2)} Ah/tháng\`;

        readout('code', \`\${list.map((c) => c[0]).join('–')} = \${fmtR(R)} ±\${p.five ? 1 : 5} %\`);
        readout('i', I * 1000);
        readout('p', P);
        readout('temp', temp);
        readout('van0', vAn);
        readout('adc', adcVal);
        readout('vfw', vfw);
        readout('idiv', iDiv);
        readout('state', state);
        return [P, temp, vAn, adcVal];
      },
    };
  },
};
`;export{n as default};
