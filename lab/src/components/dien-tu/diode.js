// ➡️ Diode — Schottky 1N5822 / SS34 so với diode silic 1N4007; đặc tuyến I–V; diode dập (flyback) cho động cơ.
// Phương trình Shockley: I = Is·(e^(Vj/(n·Vt)) − 1),  V = Vj + I·Rs,  Vt = 25.85 mV
// Mạch flyback (công tắc phía thấp IRLZ44N, tải = động cơ chổi cuộn R = 2 Ω, L = 0.5 mH, E = 11 V):
//   Đóng:  L·di/dt = VBAT − E − i·(R + Rds)
//   Ngắt, KHÔNG diode: dòng điện cảm ép Vds lên tới điện áp đánh thủng thác lũ (avalanche) ≈ 68 V:  L·di/dt = VBAT − E − i·R − V_av
//   Ngắt, CÓ diode:    dòng chạy vòng qua diode, Vds = VBAT + Vf:  L·di/dt = −Vf − E − i·R
//   Năng lượng dồn vào MOSFET mỗi lần ngắt (không diode): E = ½·L·I²·V_av/(V_av − VBAT + E)

import { cadAttach } from '../../core/cadParts.js';

const VT = 0.02585;
const DIODES = {
  '1n5822': { name: '1N5822 (Schottky 40 V 3 A, DO-201AD)', is: 5.5e-6, n: 1.1, rs: 0.04, trr: 0, vrrm: 40 },
  ss34: { name: 'SS34 (Schottky 40 V 3 A, SMA dán)', is: 6e-6, n: 1.1, rs: 0.045, trr: 0, vrrm: 40 },
  '1n4007': { name: '1N4007 (silic 1000 V 1 A, DO-41)', is: 1.65e-8, n: 1.9, rs: 0.05, trr: 2e-6, vrrm: 1000 },
};
const VBAT = 14.4, RM = 2, LM = 0.5e-3, RDS = 0.025, VAV = 68;
// 2 kiểu đóng ngắt: bật/tắt chậm (như firmware hiện tại) và PWM 20 kHz (nếu sau này điều tốc chổi)
const MODES = {
  onoff: { per: 3e-3, duty: 0.5, emf: 11, slow: 1000, h: 0.25e-6 },      // chu kỳ 3 ms, vẽ chậm 1000× → 3 s
  pwm: { per: 50e-6, duty: 0.6, emf: 6, slow: 25000, h: 0.05e-6 },       // 20 kHz, vẽ chậm 25 000× → 1.25 s
};

/** Giải V = Vj + I·Rs cho dòng I (Newton trên Vj) */
function diodeI(d, v) {
  if (v <= 0) return -d.is + v * 5e-8;                  // rò ngược nhỏ (~µA)
  let vj = Math.min(v, 0.9);
  for (let k = 0; k < 30; k++) {
    const e = Math.exp(vj / (d.n * VT));
    const f = vj + d.rs * d.is * (e - 1) - v;
    const df = 1 + (d.rs * d.is * e) / (d.n * VT);
    vj -= f / df;
    if (vj > v) vj = v;
  }
  return d.is * (Math.exp(vj / (d.n * VT)) - 1);
}
/** Vf tại dòng I (giải ngược) */
function diodeVf(d, i) {
  if (i <= 0) return 0;
  return d.n * VT * Math.log(i / d.is + 1) + i * d.rs;
}

export default {
  id: 'diode',
  name: 'Diode & diode dập / chống ngược',
  category: 'dien-tu',
  order: 3,
  icon: '➡️',
  summary: 'Van một chiều cho dòng điện. Trong robot: diode Schottky SS34/1N5822 mắc ngược song song mỗi động cơ để dập điện áp cảm ứng khi MOSFET ngắt (không có nó MOSFET chết), và làm diode chống cắm ngược nguồn cho mạch nhỏ.',
  tags: ['diode', 'Schottky', '1N5822', 'SS34', '1N4007', 'flyback', 'diode dập', 'chống ngược', 'I-V', 'avalanche'],

  params: [
    { id: 'cad', label: '🧊 Mô hình CAD thật (1N4007 DO-41, SS34 SMA, IRLZ44N TO-220)', type: 'toggle', value: true, hint: 'Tắt = mô hình học tự dựng. 1N5822 (vỏ DO-201AD, có cắt bổ xem lõi) luôn là mô hình tự dựng.' },
    { id: 'type', label: 'Loại diode (đồ thị I–V và mạch dập)', type: 'select', value: '1n5822', options: Object.entries(DIODES).map(([k, d]) => [k, d.name]) },
    { id: 'v', label: 'Điện áp đặt lên diode (anode − cathode)', type: 'range', min: -1, max: 1.2, step: 0.01, value: 0.4, unit: 'V' },
    { id: 'mode', label: 'Cách đóng ngắt MOSFET chổi cuộn', type: 'select', value: 'onoff', options: [['onoff', 'Bật / tắt (như firmware: RD5)'], ['pwm', 'PWM 20 kHz, duty 60 % (điều tốc)']] },
    { id: 'flyback', label: 'Lắp diode dập song song động cơ (mô hình 3D)', type: 'toggle', value: true },
    { id: 'cut', label: 'Cắt bổ 1N5822 xem lõi', type: 'toggle', value: false },
  ],
  readouts: [
    { id: 'id', label: 'Dòng qua diode tại điện áp đặt', unit: 'A' },
    { id: 'pd', label: 'Công suất tỏa nhiệt P = V·I', unit: 'W' },
    { id: 'vf3', label: 'Vf khi dẫn 3 A (loại đang chọn)', unit: 'V' },
    { id: 'vpk', label: 'Đỉnh Vds khi ngắt — KHÔNG diode', unit: 'V' },
    { id: 'vpkd', label: 'Đỉnh Vds khi ngắt — CÓ diode', unit: 'V' },
    { id: 'eav', label: 'Năng lượng dồn vào MOSFET mỗi lần ngắt (không diode)', unit: 'mJ' },
    { id: 'p20k', label: 'Nếu lặp 20 000 lần/s (PWM) không diode → MOSFET tỏa', unit: 'W' },
    { id: 'state', label: 'Trạng thái', unit: '' },
  ],
  scope: {
    window: 6,
    note: '(bật/tắt: vẽ chậm 1000× (1 s = 1 ms thật) · PWM 20 kHz: chậm 25 000× (1 chu kỳ 50 µs = 1.25 s) · gai ngắn được giữ đỉnh như chế độ peak-detect)',
    channels: [
      { name: 'Vds KHÔNG diode', unit: 'V', min: -2, max: 80, color: '#ff6b9a' },
      { name: 'Vds CÓ diode', unit: 'V', min: -2, max: 80, color: '#3fcf8e' },
      { name: 'I động cơ (có diode)', unit: 'A', min: -2, max: 2.5, color: '#ffd34d' },
      { name: 'I qua diode dập', unit: 'A', min: -2, max: 2.5, color: '#4cc2ff' },
    ],
  },

  info: {
    overview: `
      <p><b>Diode</b> chỉ cho dòng chạy một chiều: từ <b>anode (A)</b> sang <b>cathode (K)</b> — phía có <b>vạch</b> trên thân. Phân cực thuận phải vượt qua một ngưỡng nhỏ (Vf): ~0.3–0.5 V với diode <b>Schottky</b>, ~0.7–1.0 V với diode <b>silic</b> thường. Phân cực ngược chỉ rò µA cho tới điện áp đánh thủng.</p>
      <p>Trong robot, việc quan trọng nhất của diode là <b>dập điện áp cảm ứng của động cơ</b>. Cuộn dây động cơ giống một "bánh đà điện": đang có dòng mà MOSFET ngắt đột ngột, cuộn dây sẽ đẩy điện áp lên bao nhiêu cũng được để giữ dòng — tới khi phá hỏng MOSFET.</p>
      <p>Thử: nhìn máy hiện sóng — kênh hồng (không diode) có gai ~68 V mỗi lần ngắt, kênh xanh (có diode) chỉ ~15 V. Sau đó kéo <b>Điện áp đặt</b> và đổi <b>Loại diode</b> để so sánh đường I–V: Schottky dẫn 1 A chỉ cần ~0.38 V, 1N4007 cần ~0.93 V.</p>`,
    specs: [
      ['1N5822', 'Schottky 40 V / 3 A, Vf ≤ 0.525 V @ 3 A, chịu xung 80 A (8.3 ms), vỏ DO-201AD Ø5.3 × 9.5 mm'],
      ['SS34', 'Schottky 40 V / 3 A dán SMA (4.3 × 2.6 × 2.1 mm), Vf ≤ 0.5 V @ 3 A — dự án dùng cho chổi'],
      ['1N4007', 'Silic 1000 V / 1 A, Vf ≈ 0.93 V @ 1 A, trr ≈ 2–30 µs (chậm) — chỉ hợp chỉnh lưu 50 Hz'],
      ['Thời gian hồi phục ngược trr', 'Schottky ≈ 0 (không có hạt tải thiểu số) · silic thường vài µs'],
      ['Dòng rò ngược', 'Schottky lớn hơn (µA–mA, tăng mạnh khi nóng) · silic rất nhỏ (nA–µA)'],
      ['Đánh dấu', 'Vạch xám/trắng = cathode (K)'],
    ],
    principle: `
      <h4>1. Đặc tuyến I–V (phương trình Shockley)</h4>
      <p><code>I = Is·(e^(V/(n·Vt)) − 1)</code>, Vt = 25.85 mV ở 25 °C. Is của Schottky lớn (~µA) nên dẫn mạnh ở điện áp thấp; silic có Is rất nhỏ (~10 nA) nên phải tới ~0.6 V mới dẫn đáng kể. Cứ thêm ~60 mV × n thì dòng tăng 10 lần.</p>
      <h4>2. Vì sao cuộn dây sinh điện áp cao?</h4>
      <p><code>V = L·di/dt</code>. Động cơ L = 0.5 mH đang chạy 1.7 A, MOSFET ngắt trong 100 ns → nếu không có đường thoát: <code>V = 0.5 mH × 1.7 A / 100 ns ≈ 8 500 V</code>! Thực tế MOSFET IRLZ44N (55 V) bị "đánh thủng thác lũ" (avalanche) ở ~68 V và phải nuốt toàn bộ năng lượng ½LI² ≈ 0.7 mJ mỗi lần ngắt.</p>
      <h4>3. Diode dập (flyback / freewheeling)</h4>
      <p>Diode mắc <b>ngược</b> song song động cơ (cathode về +VBAT, anode về drain MOSFET). Bình thường nó bị phân cực ngược, không làm gì. Khi MOSFET ngắt, dòng của cuộn dây chạy vòng qua diode → Vds chỉ còn <code>VBAT + Vf ≈ 14.9 V</code>, năng lượng tiêu tán từ từ trong điện trở cuộn dây.</p>
      <h4>4. Vì sao phải là Schottky?</h4>
      <p>Với PWM 20 kHz, diode silic thường cần vài µs để "tắt" (reverse recovery): khi MOSFET đóng lại, diode dẫn NGƯỢC một xung dòng lớn → MOSFET và diode nóng, nhiễu mạnh. Schottky là tiếp giáp kim loại–bán dẫn, không tích trữ hạt tải → tắt gần như tức thì, Vf lại thấp → ít nóng.</p>
      <h4>5. Diode chống ngược nguồn</h4>
      <p>Mắc <b>nối tiếp</b> trên dây nguồn: cắm ngược pin thì diode chặn, mạch an toàn. Đổi lại mất Vf và tỏa <code>P = Vf·I</code>: 0.5 V × 0.3 A = 0.15 W (tốt cho mạch logic) nhưng 0.5 V × 5 A = 2.5 W (quá nóng cho cả robot) → nguồn chính dùng P-MOSFET chống ngược thay vì diode.</p>`,
    inRobot: `
      <ul>
        <li><b>SS34</b> song song ngược với động cơ <b>chổi cuộn</b> và <b>chổi cạnh</b>, đặt sát MOSFET IRLZ44N (docs/01 quy tắc 4). Cathode (vạch) nối +VBAT, anode nối drain.</li>
        <li>DRV8871 đã có diode thân trong các FET nên động cơ bánh <b>không cần</b> thêm diode dập.</li>
        <li>Quạt BLDC: driver tích hợp tự lo phần này.</li>
        <li>Tùy chọn: Schottky nối tiếp làm chống ngược cho nhánh logic nhỏ; nhánh động lực dùng P-MOSFET.</li>
        <li>Firmware chổi: <code>PIN_MAIN_BRUSH = PIN_D5</code>, <code>PIN_SIDE_BRUSH = PIN_D6</code> — bật/tắt, có thể PWM sau này → càng bắt buộc có diode.</li>
      </ul>`,
    mistakes: `
      <ul>
        <li>Quên diode dập vì "chạy thử vẫn được" → MOSFET chết sau vài phút/vài ngày (avalanche lặp lại).</li>
        <li>Hàn ngược diode dập → nối tắt VBAT qua MOSFET ngay khi bật → nổ diode, đứt cầu chì.</li>
        <li>Dùng 1N4007 cho PWM tần số cao → nóng, nhiễu (dùng Schottky hoặc diode phục hồi nhanh UF4007).</li>
        <li>Đặt diode xa động cơ/MOSFET bằng dây dài → điện cảm dây vẫn tạo gai.</li>
        <li>Dùng Schottky 20 V (1N5817) cho pin 16.8 V → sát ngưỡng điện áp ngược, rò lớn khi nóng.</li>
      </ul>`,
    quiz: [
      { q: 'Vạch xám trên thân diode là cực nào? Khi làm diode dập cho động cơ, vạch nối vào đâu?', a: 'Vạch là cathode (K). Diode dập: cathode nối +VBAT, anode nối drain MOSFET (đầu âm động cơ).' },
      { q: 'Động cơ L = 0.5 mH đang chạy 1.7 A thì bị ngắt (không diode). Năng lượng dồn vào MOSFET bao nhiêu? Nếu chuyện đó lặp lại 20 000 lần/giây?', a: 'E = ½LI² = 0.5 × 0.5e-3 × 1.7² ≈ 0.72 mJ (≈0.76 mJ kể cả phần nguồn đẩy thêm trong lúc thác lũ). × 20 000 lần/s ≈ 15 W — IRLZ44N không tản nhiệt chết chắc chắn.' },
      { q: 'Vì sao diode chống ngược trên nguồn tổng 5 A lại không được khuyên dùng?', a: 'Mất 0.5 V và tỏa P = 0.5 × 5 = 2.5 W liên tục — nóng, phí pin. Dùng P-MOSFET (Rds ~10 mΩ → 0.25 W).' },
    ],
  },

  faults: [
    { id: 'thieu-flyback', label: 'PWM chổi cuộn 20 kHz mà KHÔNG có diode dập', severity: 'hong',
      what: '<p>Chổi vẫn quay, nhưng MOSFET nóng rất nhanh (bỏng tay sau vài chục giây), có mùi khét, rồi đột ngột chổi chạy hết tốc không tắt được nữa — MOSFET đã chết ở trạng thái <b>chập D–S</b>. Robot không còn điều khiển được chổi (nguy hiểm khi kẹt tóc).</p>',
      why: '<p>Không có đường thoát, toàn bộ năng lượng từ trường <code>½·L·I²</code> của mỗi chu kỳ phải đổ vào MOSFET dưới dạng thác lũ ở ~68 V. Tóc quấn chặt chổi (động cơ gần đứng, E ≈ 0): dòng lúc ngắt ≈ <code>14.4 V × 30 µs / 0.5 mH ≈ 0.86 A</code> → ≈ 0.24 mJ mỗi lần × 20 000 lần/giây ≈ <b>4.7 W</b>. IRLZ44N không tản nhiệt RθJA = 62 °C/W → <code>Tj ≈ 25 + 4.7 × 62 ≈ 315 °C</code> → vượt 175 °C sau chừng chục giây, silicon hỏng (thường hỏng CHẬP).</p>',
      fix: '<p>Luôn mắc diode Schottky SS34 ngược song song động cơ, sát động cơ/MOSFET. Đã chết: thay MOSFET + thêm diode; kiểm tra chân PIC RD5 (có thể bị gai lọt ngược qua cổng).</p>' },
    { id: 'nguoc-diode', label: 'Hàn NGƯỢC diode dập (vạch về phía drain)', severity: 'no',
      what: '<p>Vừa bật chổi: chớp sáng, tiếng "pụp", diode nứt vỏ bốc khói, cầu chì 10 A đứt. Đôi khi MOSFET chết luôn.</p>',
      why: '<p>Diode ngược thì khi MOSFET đóng nó được phân cực THUẬN ngay giữa +VBAT và GND (qua MOSFET): <code>I ≈ (14.4 − 0.5) / (r_pin + Rds + r_diode) ≈ 14 / 0.15 ≈ 90 A</code> — vượt khả năng chịu xung 80 A của 1N5822, nóng chảy trong vài ms.</p>',
      fix: '<p>Nhớ: <b>vạch (cathode) về phía +VBAT</b>. Kiểm tra bằng đồng hồ chế độ diode trước khi cấp điện: đo từ drain (+que đỏ) sang +VBAT phải thấy ~0.3 V; đảo que thấy "OL".</p>' },
    { id: 'dung-1n4007', label: 'Dùng 1N4007 (chậm) làm diode dập cho PWM', severity: 'loi',
      what: '<p>Mạch chạy được nhưng diode và MOSFET ấm hơn hẳn, có tiếng rít, nhiễu làm ESP32/BLE chập chờn. Trên máy hiện sóng thấy xung dòng NGƯỢC nhọn qua diode mỗi lần MOSFET đóng.</p>',
      why: '<p>Diode silic tích trữ điện tích (hạt tải thiểu số) khi dẫn. MOSFET đóng lại → diode cần trr ≈ 2–30 µs để xả hết → trong lúc đó nó dẫn ngược, gần như ngắn mạch VBAT qua MOSFET. Tổn hao ≈ <code>VBAT·Qrr·f ≈ 14.4 × 1.7 µC × 20 kHz ≈ 0.5 W</code> cộng thêm vì Vf cao (0.93 V).</p>',
      fix: '<p>Dùng Schottky (SS34, 1N5819/5822) hoặc diode phục hồi siêu nhanh (UF4007, trr 75 ns).</p>' },
    { id: 'diode-tong', label: 'Diode 1N5822 chống ngược trên nguồn tổng 5 A', severity: 'chay',
      what: '<p>Diode nóng rực (&gt; 150 °C), PCB quanh chân ngả vàng, robot yếu hơn (mất 0.5 V). Lâu dần diode hỏng.</p>',
      why: '<p>Cả robot (2 bánh + quạt + chổi) kéo ~5 A qua diode định mức 3 A: <code>P = Vf·I ≈ 0.6 V × 5 A = 3 W</code>. Vỏ DO-201AD tản ~25–40 °C/W qua chân → nóng thêm 75–120 °C so với môi trường trong thân robot.</p>',
      fix: '<p>Nguồn chính: dùng P-MOSFET chống ngược (ví dụ AO4407, Rds ≈ 12 mΩ → 0.3 W ở 5 A) hoặc đầu nối 1 chiều + cầu chì. Diode nối tiếp chỉ cho nhánh nhỏ &lt; 0.5 A.</p>' },
    { id: 'nguoc-pin-co-diode', label: 'Cắm ngược pin — nhánh logic CÓ diode chống ngược', severity: 'nhe',
      what: '<p>Không có gì xảy ra: đèn không sáng, không khói. Rút ra cắm lại đúng chiều là chạy bình thường.</p>',
      why: '<p>Diode chống ngược nối tiếp bị phân cực ngược → chỉ rò vài µA. Mạch phía sau an toàn. Đây là ví dụ diode làm đúng việc của nó.</p>',
      fix: '<p>Giữ diode (hoặc P-MOSFET) chống ngược ở mọi nhánh nguồn có thể bị cắm nhầm; ghi rõ +/− trên đầu nối.</p>' },
  ],

  build(ctx) {
    const { THREE, MAT, geom, label, readout, fx } = ctx;
    const { mesh, group, part, cyl, box, makeCutaway, pcb, wire } = geom;
    const root = new THREE.Group();
    root.add(part(pcb(64, 40, { mat: MAT.pcbGreen.clone() }), 'Bo mạch chổi cuộn', 'VBAT → động cơ → drain MOSFET; source → GND; diode dập song song động cơ.'));

    // ---------- 1N5822 dập (nằm, chân bẻ xuống) ----------
    const d5822 = new THREE.Group();
    d5822.position.set(-14, 4.2, 2);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.45 });
    const dBody = mesh(cyl(2.65, 2.65, 9.5, 32), bodyMat, { rz: Math.PI / 2 });
    const dBand = mesh(cyl(2.7, 2.7, 1.4, 32, true), new THREE.MeshStandardMaterial({ color: 0xbfc4ca, roughness: 0.5 }), { x: 3.7, rz: Math.PI / 2 });
    const shellD = group(dBody, dBand);
    d5822.add(part(shellD, '1N5822 — diode dập (Schottky 3 A)', 'Vạch xám = cathode (K), nối về +VBAT. Thân epoxy đen Ø5.3 × 9.5 mm.'));
    const die = mesh(box(1.4, 1.4, 0.3), MAT.silicon, { rz: Math.PI / 2 });
    const slugs = group(mesh(cyl(1.1, 1.1, 3.6, 16), MAT.copper, { x: -2.0, rz: Math.PI / 2 }), mesh(cyl(1.1, 1.1, 3.6, 16), MAT.copper, { x: 2.0, rz: Math.PI / 2 }));
    const inner = group(die, slugs);
    inner.traverse((o) => (o.userData.noCut = true));
    d5822.add(part(inner, 'Lõi: tiếp giáp kim loại–bán dẫn (Schottky)', 'Mẩu silicon loại N phủ một lớp kim loại (rào Schottky). Không có lớp P → không tích trữ hạt tải → tắt rất nhanh, Vf thấp.'));
    const lead = (x, h) => mesh(cyl(0.65, 0.65, h, 12), MAT.tin, { x });
    d5822.add(mesh(cyl(0.65, 0.65, 5, 12), MAT.tin, { x: -7.2, rz: Math.PI / 2 }), mesh(cyl(0.65, 0.65, 5, 12), MAT.tin, { x: 7.2, rz: Math.PI / 2 }));
    const l1 = lead(-9.5, 6), l2 = lead(9.5, 6);
    l1.position.y = l2.position.y = -2.6;
    d5822.add(l1, l2);
    root.add(d5822);
    const setCut = makeCutaway(d5822);

    // ---------- SS34 và 1N4007 (so sánh) ----------
    const ss34 = new THREE.Group();
    ss34.position.set(-20, 0, 14);
    ss34.add(mesh(box(4.3, 2.1, 2.6, 0.2), MAT.icBody, { y: 1.05 }), mesh(box(0.8, 0.05, 2.6), MAT.plasticGrey, { x: -1.4, y: 2.13 }));
    ss34.add(mesh(box(1.2, 0.3, 1.6), MAT.tin, { x: -2.5, y: 0.15 }), mesh(box(1.2, 0.3, 1.6), MAT.tin, { x: 2.5, y: 0.15 }));
    root.add(part(ss34, 'SS34 — Schottky dán (SMA)', '40 V 3 A, cùng đặc tính với 1N5822 nhưng nhỏ gọn để hàn mặt. Dự án dùng SS34 cho chổi cuộn/chổi cạnh.'));
    const d4007 = new THREE.Group();
    d4007.position.set(-8, 1.6, 14);
    d4007.add(mesh(cyl(1.35, 1.35, 5.2, 24), MAT.icBody, { rz: Math.PI / 2 }), mesh(cyl(1.4, 1.4, 0.8, 24, true), MAT.plasticGrey, { x: 2.0, rz: Math.PI / 2 }));
    d4007.add(mesh(cyl(0.4, 0.4, 10, 10), MAT.tin, { rz: Math.PI / 2 }));
    root.add(part(d4007, '1N4007 — diode silic thường', '1000 V 1 A, rẻ, phổ biến cho chỉnh lưu 50 Hz. Vf cao (~0.9 V) và chậm (trr vài µs) → không hợp làm diode dập cho PWM 20 kHz.'));

    // ---------- động cơ chổi cuộn ----------
    const motor = new THREE.Group();
    motor.position.set(-12, 12, -12);
    motor.add(mesh(cyl(10, 10, 26, 40), MAT.steel, { rz: Math.PI / 2 }), mesh(cyl(10, 10, 4, 40), MAT.plasticWhite, { x: -15, rz: Math.PI / 2 }));
    const shaft = mesh(cyl(1.2, 1.2, 10, 12), MAT.steel, { x: 18, rz: Math.PI / 2 });
    const mark = mesh(box(1, 8, 2), MAT.plasticYellow, { x: 22 });
    const rot = group(shaft, mark);
    motor.add(rot);
    root.add(part(motor, 'Động cơ chổi cuộn (R ≈ 2 Ω, L ≈ 0.5 mH)', 'Chạy ~1.7 A ở 14.4 V. Cuộn dây là một điện cảm: dòng điện trong nó không thể đổi đột ngột.'));
    root.add(wire([[-27, 12, -12], [-27, 6, -4], [-23.5, 2, 2]], { radius: 0.6, color: 0xd23b3b }));
    root.add(wire([[-27, 15, -12], [-12, 9, -2], [4.5, 2, 2]], { radius: 0.6, color: 0x1d1f23 }));

    // ---------- MOSFET TO-220 ----------
    const fet = new THREE.Group();
    fet.position.set(16, 0, 4);
    const fetBody = mesh(box(10, 9, 4.5, 0.3), MAT.icBody.clone(), { y: 8.5 });
    const tab = mesh(box(10, 6.5, 1.3), MAT.tin, { y: 16.2, z: -1.6 });
    const hole = mesh(cyl(1.85, 1.85, 1.4, 20), MAT.plasticDark, { y: 16.6, z: -1.6, rx: Math.PI / 2 });
    fet.add(fetBody, tab, hole, ...[-2.54, 0, 2.54].map((x) => mesh(box(0.8, 5, 0.5), MAT.tin, { x, y: 2 })));
    root.add(part(fet, 'MOSFET IRLZ44N (công tắc phía thấp)', 'G ← PIC RD5 qua 100 Ω; D ← đầu âm động cơ; S → GND. Chịu Vds tối đa 55 V — vượt là đánh thủng thác lũ.'));
    root.add(wire([[4.5, 2, 2], [10, 3, 3], [16, 2, 4]], { radius: 0.5, color: 0x4a4f57 }));

    const hdr = geom.pinHeader(2);
    hdr.position.set(-29, 0, 16);
    root.add(part(hdr, 'Nguồn VBAT 14.4 V vào', 'Chân 1 +VBAT, chân 2 GND.'));

    // ---------- mô hình CAD thật (thư viện 3D KiCad): 1N4007 DO-41, SS34 SMA, IRLZ44N TO-220 ----------
    // Khung GLB vendor: y = 0 là mặt bo, chân xuyên xuống dưới. Mỗi holder đặt đúng chỗ nhóm tự dựng tương ứng.
    const cad4007 = cadAttach(ctx, root, 'vendor/d_do_41_p10_16mm_horizontal', {
      onBottom: false, rotateY: Math.PI, at: { x: -8, z: 14 },        // xoay 180° → vạch cathode (chân 1) về phía +x như mô hình học
      hide: [d4007],
      labels: [['1N4007', [0, 3.5, 0]]],
      partDefault: ['1N4007 — diode silic thường (CAD thật, vỏ DO-41)', '1000 V 1 A, rẻ, phổ biến cho chỉnh lưu 50 Hz. Vf cao (~0.9 V) và chậm (trr vài µs) → không hợp làm diode dập cho PWM 20 kHz.'],
      parts: {
        diode_do41: ['1N4007 — thân epoxy DO-41 Ø2,7 × 5,2 mm', 'Vạch xám/bạc = CATHODE (K). Bên trong là tiếp giáp P–N silic: Vf ≈ 0,7–1 V, hồi phục ngược chậm vài µs.'],
        pin_1: ['Chân cathode (K) — phía có vạch', 'Trong mạch dập nối về +VBAT; trong mạch chống ngược nối về phía tải.'],
        pin_2: ['Chân anode (A)', 'Dòng thuận đi vào chân này, ra ở cathode.'],
      },
    });
    const cadSS34 = cadAttach(ctx, root, 'vendor/d_sma', {
      onBottom: false, at: { x: -20, z: 14 }, frame: false,
      hide: [ss34],
      labels: [['SS34', [0, 4, 0]]],
      partDefault: ['SS34 — Schottky dán (CAD thật, vỏ SMA / DO-214AC)', '40 V 3 A, cùng đặc tính với 1N5822 nhưng nhỏ gọn để hàn mặt. Dự án dùng SS34 cho chổi cuộn/chổi cạnh.'],
      parts: { diode_ss34: ['SS34 — thân SMA 5 × 2,7 mm', 'Vạch trắng in trên thân = CATHODE. 2 chân dẹt gập dưới bụng, hàn lên pad đồng. Schottky: Vf ≈ 0,4–0,5 V, gần như không có thời gian hồi phục ngược.'] },
    });
    let cadFetBody = null;
    const cadFet = cadAttach(ctx, root, 'vendor/to_220_3_vertical', {
      onBottom: false, at: { x: 16, z: 4 }, frame: false,
      hide: [fet],
      labels: [['MOSFET', [0, 21, 0]]],
      partDefault: ['MOSFET IRLZ44N (CAD thật, vỏ TO-220)', 'G ← PIC RD5 qua 100 Ω; D ← đầu âm động cơ; S → GND. Chịu Vds tối đa 55 V — vượt là đánh thủng thác lũ.'],
      parts: {
        mosfet_irlz44n: ['IRLZ44N — thân epoxy + tab (= Drain)', 'Không có diode dập: mỗi lần ngắt, dòng điện cảm ép Vds lên ~68 V (đánh thủng thác lũ) → năng lượng dồn vào lõi silicon, nóng dần tới chết.'],
        pin_1: ['Chân G (Gate)', 'Từ RD5 của PIC qua 100 Ω.'],
        pin_2: ['Chân D (Drain)', 'Nối đầu âm động cơ và anode diode dập.'],
        pin_3: ['Chân S (Source)', 'Nối GND động lực.'],
      },
      onLoad(c) {
        ['pin_1', 'pin_2', 'pin_3'].forEach((n) => { const o = c.node(n); if (o) o.scale.y *= 0.32; });   // chân đã cắt sau khi hàn
        cadFetBody = c.node('mosfet_irlz44n');
      },
    });
    const cadSel = { '1n4007': cad4007, ss34: cadSS34 };
    let lastGlowKey = null;

    // ---------- bảng đồ thị I–V ----------
    const iv = new THREE.Group();
    iv.position.set(12, 6, -18);
    const PW = 44, PH = 30;
    const panel = mesh(box(PW + 6, PH + 6, 0.5), new THREE.MeshStandardMaterial({ color: 0x0b1218, roughness: 0.9 }), { x: PW / 2, y: PH / 2, z: -0.4 });
    iv.add(part(panel, 'Đặc tuyến I–V', 'Trục ngang: điện áp −1 … +1.2 V. Trục đứng: dòng −0.5 … 3.5 A. Đường sáng = diode đang chọn, đường mờ = loại còn lại. Chấm vàng = điểm làm việc.'));
    const VX = (v) => ((v + 1) / 2.2) * PW, IY = (i) => ((Math.min(3.5, Math.max(-0.5, i)) + 0.5) / 4) * PH;
    const axMat = new THREE.LineBasicMaterial({ color: 0x8899aa });
    const axGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, IY(0), 0), new THREE.Vector3(PW, IY(0), 0), new THREE.Vector3(VX(0), 0, 0), new THREE.Vector3(VX(0), PH, 0)]);
    iv.add(new THREE.LineSegments(axGeo, axMat));
    const NC = 160;
    const mkCurve = (color) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NC * 3), 3));
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color }));
      iv.add(l);
      return l;
    };
    const curveSel = mkCurve(0x4cc2ff), curveOther = mkCurve(0x3a4a5a);
    const fillCurve = (line, d) => {
      const a = line.geometry.attributes.position;
      for (let k = 0; k < NC; k++) { const v = -1 + (2.2 * k) / (NC - 1); a.setXYZ(k, VX(v), IY(diodeI(d, v)), 0.05); }
      a.needsUpdate = true;
    };
    const dot = mesh(new THREE.SphereGeometry(0.9, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffd34d }), { z: 0.2 });
    iv.add(dot);
    root.add(iv);

    label(d5822, '1N5822 (diode dập)', [0, 5, 0]);
    label(ss34, 'SS34', [0, 4, 0]);
    label(d4007, '1N4007', [0, 3.5, 0]);
    label(fet, 'MOSFET', [0, 21, 0]);
    label(motor, 'Động cơ chổi cuộn', [0, 13, 0]);
    label(iv, 'Đặc tuyến I–V', [PW / 2, PH + 5, 0]);

    // ---------- trạng thái mạch dập ----------
    let ia = 0, ib = 0, phase = 0, lastType = null, lastCut = null, ang = 0, rrT = 0, wasOn = false, lastMode = null, iOffA = 0;
    // tích phân 2 mạch song song: A (không diode) và B (có diode loại D) trong khoảng thời gian thật Treal
    function sim(M, E, D, Treal, preroll) {
      const n = Math.max(1, Math.round(Treal / M.h));
      const h = Treal / n;
      const o = { vA: 0, vB: 0, vmaxA: 0, vmaxB: 0, id: 0, idMin: 0 };
      for (let k = 0; k < n; k++) {
        phase = (phase + h / M.per) % 1;
        let on = phase < M.duty;
        if (fault === 'thieu-flyback' && dead) on = true;      // MOSFET chập D–S
        if (fault === 'nguoc-diode') on = false;              // cầu chì đã đứt
        // A: không diode
        if (!on && wasOn) iOffA = ia;
        if (on) { ia += ((VBAT - E - ia * (RM + RDS)) / LM) * h; o.vA = ia * RDS; }
        else if (ia > 0) { ia += ((VBAT - E - ia * RM - VAV) / LM) * h; if (ia < 0) ia = 0; o.vA = VAV; }
        else { ia = 0; o.vA = VBAT - E; }
        // B: có diode
        if (on && !wasOn && ib > 0.01 && D.trr > 0) rrT = D.trr;
        let id = 0;
        if (on) {
          ib += ((VBAT - E - ib * (RM + RDS)) / LM) * h;
          o.vB = ib * RDS;
          if (rrT > 0) { id = -Math.min(1.6, ib) * (rrT / D.trr); rrT -= h; }
        } else if (ib > 0) {
          const vf = diodeVf(D, ib);
          ib += ((-vf - E - ib * RM) / LM) * h;
          if (ib < 0) ib = 0;
          o.vB = VBAT + vf; id = ib;
        } else { ib = 0; o.vB = VBAT - E; }
        wasOn = on;
        if (!preroll) {
          o.vmaxA = Math.max(o.vmaxA, o.vA); o.vmaxB = Math.max(o.vmaxB, o.vB);
          vpkA = Math.max(vpkA, o.vA); vpkB = Math.max(vpkB, o.vB);
          o.id = id; o.idMin = Math.min(o.idMin, id);
        }
      }
      return o;
    }
    let vpkA = 0, vpkB = 0, holdA = 0, holdB = 0, fault = null, fetT = 25, dead = false, heatedF = false, heatedD = false, dTemp = 25, flashT = 0;

    function resetAll() { fault = null; fetT = 25; dead = false; dTemp = 25; ia = ib = 0; d5822.visible = true; }

    return {
      object: root,
      triggerFault(id) {
        resetAll();
        fault = id;
        if (id === 'nguoc-diode') {
          fx.flash(d5822, { size: 26, color: 0xfff1c0, intensity: 6 });
          fx.pop(d5822, { force: 35, size: 6 });
          fx.scorch(root.children[0], 0.2);
          dead = true;
        }
      },
      resetFault() { resetAll(); },
      update(dt, t, p) {
        if (p.cut !== lastCut) { setCut(p.cut); lastCut = p.cut; }
        let typeKey = p.type;
        if (fault === 'dung-1n4007') typeKey = '1n4007';
        const D = DIODES[typeKey];
        if (typeKey !== lastType) {
          lastType = typeKey;
          fillCurve(curveSel, D);
          fillCurve(curveOther, typeKey === '1n4007' ? DIODES['1n5822'] : DIODES['1n4007']);
        }
        // ----- điểm làm việc I–V -----
        const I = diodeI(D, p.v);
        dot.position.set(VX(p.v), IY(I), 0.2);
        const hasDiode = (p.flyback && fault !== 'thieu-flyback') || fault === 'dung-1n4007';
        if (fault !== 'nguoc-diode') d5822.visible = hasDiode;

        // ----- mạch dập: tích phân thật, vẽ chậm -----
        let mode = p.mode;
        if (fault === 'thieu-flyback' || fault === 'dung-1n4007') mode = 'pwm';
        const M = MODES[mode];
        const E = fault === 'thieu-flyback' ? 0 : M.emf;          // tóc quấn chặt chổi → E ≈ 0
        if (mode !== lastMode) { lastMode = mode; phase = 0; sim(M, E, D, Math.min(M.per * 40, 2e-3), true); }
        const out = sim(M, E, D, dt / M.slow, false);
        const scopeA = Math.max(holdA, out.vmaxA), scopeB = Math.max(holdB, out.vmaxB);
        holdA = out.vA; holdB = out.vB;
        const iFree = out.idMin < -0.01 ? out.idMin : out.id;

        // ----- năng lượng thác lũ: lấy dòng lúc ngắt của mạch KHÔNG diode -----
        const eav = 0.5 * LM * iOffA * iOffA * (VAV / (VAV - VBAT + E)) * 1000;   // mJ
        const p20k = (eav / 1000) * 20000;
        if (fault === 'thieu-flyback' && !dead) {
          fetT += ((p20k - (fetT - 25) / 62) / 0.35) * dt;                     // C ≈ 0.35 J/K (die + phần tab nóng nhanh)
          if (fetT > 175) { dead = true; fx.smoke(fet, { size: 8, duration: 6 }); fx.scorch(fetBody, 0.6); fx.sparks(fet, { count: 15, speed: 15, size: 0.5 }); }
          flashT -= dt;
          if (flashT <= 0) { flashT = 1.25; fx.flash([16, 10, 6.5], { size: 6, color: 0xff6040, intensity: 1.5 }); }
        }
        if (fault === 'dung-1n4007') fetT += ((1.1 - (fetT - 25) / 62) / 0.35) * dt;
        if (fault === 'diode-tong') dTemp += ((3.0 - (dTemp - 40) / 35) / 1.5) * dt;
        const fh = Math.max(0, (fetT - 70) / 110);
        // ----- CAD thật: bật/tắt; nhiệt MOSFET lên thân CAD; diode đang chọn trên đồ thị I–V phát sáng xanh theo dòng -----
        const cadOn = [cad4007.sync(p), cadSS34.sync(p), cadFet.sync(p)].some(Boolean);
        const fetHeatObj = cadFet.active && cadFetBody ? cadFetBody : fetBody;
        if (fault === 'thieu-flyback' && dead && fetHeatObj !== fetBody && !cadFetBody.userData._preScorch) fx.scorch(cadFetBody, 0.6);
        if (!dead || fault !== 'thieu-flyback') { if (fh > 0.02) { fx.heat(fetHeatObj, fh); if (heatedF && heatedF !== fetHeatObj) fx.heat(heatedF, 0); heatedF = fetHeatObj; } else if (heatedF) { fx.heat(heatedF, 0); heatedF = false; } }
        if (cadOn) {
          const k = p.v > 0 ? Math.min(1, Math.max(0, I) / 2) : 0;
          const key = `${typeKey}|${k.toFixed(2)}`;
          if (key !== lastGlowKey) {
            lastGlowKey = key;
            for (const [tk, c] of Object.entries(cadSel)) if (c.loaded) c.glow(tk === '1n4007' ? 'diode_do41' : 'diode_ss34', 0x2a6cff, tk === typeKey ? k * 1.2 : 0);
          }
        }
        const dh = Math.max(0, (dTemp - 80) / 100);
        if (dh > 0.02) { fx.heat(shellD, dh); heatedD = true; } else if (heatedD) { fx.heat(shellD, 0); heatedD = false; }
        if (fault === 'diode-tong' && dTemp > 150 && Math.random() < dt * 0.8) fx.smoke(d5822, { size: 3, duration: 1 });

        // ----- hình ảnh: động cơ quay khi có dòng, diode sáng khi đang dập -----
        ang += (Math.max(ia, ib) > 0.05 || (dead && fault === 'thieu-flyback') ? 6 : 1) * dt;
        rot.rotation.x = ang;
        if (!heatedD) {
          dBody.material.emissive.setRGB(0.1 * Math.min(1, iFree), 0.4 * Math.min(1, Math.max(0, iFree)), 0.9 * Math.min(1, Math.max(0, iFree)));
          dBody.material.emissiveIntensity = 1;
        }

        let state = phase < MODES[lastMode].duty ? 'MOSFET đóng: dòng động cơ tăng dần (L/R = 0.25 ms)' : 'MOSFET ngắt: không diode → gai 68 V; có diode → dòng chạy vòng qua diode';
        if (p.v < 0) state = 'Diode phân cực ngược: chỉ rò µA';
        if (fault === 'thieu-flyback') state = dead ? '⚡ MOSFET chết chập D–S: chổi chạy liên tục, không tắt được!' : `🔥 Avalanche 20 000 lần/s: MOSFET ${fetT.toFixed(0)} °C`;
        if (fault === 'nguoc-diode') state = '💥 Diode ngược phân cực thuận ngang nguồn ~90 A → nổ, cầu chì đứt';
        if (fault === 'dung-1n4007') state = `⚠️ 1N4007 hồi phục ngược chậm: xung dòng ngược mỗi lần MOSFET đóng — MOSFET ${fetT.toFixed(0)} °C`;
        if (fault === 'diode-tong') state = `🔥 Diode nối tiếp nguồn tổng 5 A: tỏa ~3 W, ${dTemp.toFixed(0)} °C, mất ~0.6 V`;
        if (fault === 'nguoc-pin-co-diode') state = 'ℹ️ Pin ngược: diode chặn, dòng chỉ ~µA — mạch an toàn ✓';

        readout('id', I);
        readout('pd', Math.max(0, p.v * I));
        readout('vf3', diodeVf(D, 3));
        readout('vpk', vpkA);
        readout('vpkd', vpkB);
        readout('eav', eav);
        readout('p20k', p20k);
        readout('state', state);
        vpkA *= Math.exp(-dt / 3); vpkB *= Math.exp(-dt / 3);
        if (fault === 'nguoc-diode') return [0, 0, 0, 0];
        return [scopeA, scopeB, ib, iFree];
      },
    };
  },
};
