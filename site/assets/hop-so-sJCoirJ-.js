const n=`// ⚙️ Hộp số bánh răng thẳng nhiều tầng — kiểu hộp số trong module bánh xe robot hút bụi.
// Mỗi tầng: bánh nhỏ (pinion) z1 ăn khớp bánh lớn z2 → tỉ số i = z2/z1, quay NGƯỢC chiều.
// Tỉ số tổng i = Π(z2/z1); tốc độ ra n_ra = n_động_cơ / i; mô-men ra T_ra = T_động_cơ · i · ηⁿ.
// Động cơ: đường đặc tính DC thẳng n = n0·(1 − T/Ts) (RS-360, 14.4 V: n0 = 12 000 vg/ph, Ts = 22 mN·m).

import { cadAttach, ownMaterial } from '../../core/cadParts.js';

const N0 = 12000;          // vòng/phút không tải @14.4 V
const TS = 22;             // mN·m mô-men kẹt
const KT = 0.011;          // N·m/A
const I0 = 0.14;           // dòng không tải (A)
const T_FRIC = 0.0012 * 1000;   // mN·m ma sát động cơ
const WHEEL_D = 70;        // bánh xe Ø70 mm

// [số răng bánh nhỏ, số răng bánh lớn, mô-đun m (mm), bề rộng răng b (mm), hướng đặt tâm (rad)]
const STAGES = [
  { zp: 10, zg: 44, m: 0.5, b: 3, dir: 0 },
  { zp: 11, zg: 40, m: 0.6, b: 4, dir: 2.0 },
  { zp: 12, zg: 45, m: 0.8, b: 5, dir: -0.3 },
  { zp: 14, zg: 35, m: 1.0, b: 6, dir: 2.3 },
];
const LEVEL = 8;           // khoảng cách các tầng theo trục Y (mm)
const SIGMA_POM = 25;
// ---- hộp số THẬT trong module bánh xe (robot/wheel-module.glb): 4 cặp m0.5, trục dọc X (khung GLB, mm) ----
const CAD_STAGES = [[10, 40], [12, 36], [12, 40], [14, 44]];
const CAD_I = CAD_STAGES.reduce((a, [p, g]) => a * g / p, 1);         // ≈ 125.7
/** Tâm trục pinion, gear_1, gear_2, gear_3, gear_out (khung GLB) — cùng công thức a = m(z1+z2)/2 của file CAD wheel.py */
function cadGearAxes() {
  const m = 0.5, P0 = [-50, 40], r = Math.PI / 180;
  const d = CAD_STAGES.map(([a, b]) => (m * (a + b)) / 2);
  const P1 = [P0[0] + d[0] * Math.cos(-12 * r), P0[1] + d[0] * Math.sin(-12 * r)];
  const P2 = [P1[0] + d[1] * Math.cos(14 * r), P1[1] + d[1] * Math.sin(14 * r)];
  const P4 = [0, 35];
  const dx = P4[0] - P2[0], dz = P4[1] - P2[1], D = Math.hypot(dx, dz);
  const a = (d[2] ** 2 - d[3] ** 2 + D ** 2) / (2 * D), h = Math.sqrt(Math.max(d[2] ** 2 - a * a, 0));
  const mx = P2[0] + (a * dx) / D, mz = P2[1] + (a * dz) / D;
  const c1 = [mx + (h * dz) / D, mz - (h * dx) / D], c2 = [mx - (h * dz) / D, mz + (h * dx) / D];
  const P3 = c1[1] < c2[1] ? c1 : c2;
  return [P0, P1, P2, P3, P4].map(([y, z]) => [0, z, -y]);
}      // ứng suất uốn cho phép của răng POM (MPa) — đã kể hệ số an toàn

export default {
  id: 'hop-so',
  name: 'Hộp số bánh răng',
  category: 'co-khi',
  order: 3,
  icon: '⚙️',
  summary: 'Động cơ quay 9 000 vòng/phút nhưng yếu; bánh xe cần ~150 vòng/phút và mạnh. Hộp số 3–4 tầng bánh răng nhựa đổi tốc độ lấy mô-men. Xem từng cặp răng ăn khớp, quay ngược chiều, đúng tỉ số.',
  tags: ['bánh răng', 'gear', 'hộp số', 'gearbox', 'tỉ số truyền', 'mô-đun', 'mô-men', 'POM'],

  params: [
    { id: 'cad', label: '🧊 Mô hình CAD thật (hộp số module bánh xe)', type: 'toggle', value: true, hint: 'Hộp số thật 4 cặp m0.5 trong module bánh Roborock S5 (i ≈ 125.7). Tắt = mô hình học tham số (chọn số tầng, cắt bổ vỏ)' },
    { id: 'rpm', label: 'Tốc độ động cơ đặt (PID giữ)', type: 'range', min: 0, max: 12000, step: 100, value: 9000, unit: 'vòng/phút' },
    { id: 'stages', label: 'Số tầng bánh răng', type: 'select', value: '3', options: [['1', '1 tầng (i = 4.4)'], ['2', '2 tầng (i = 16)'], ['3', '3 tầng (i = 60)'], ['4', '4 tầng (i = 150)']], hint: 'Áp dụng cho số liệu tính toán và mô hình học. Mô hình CAD luôn là hộp số thật 4 cặp (i ≈ 125.7) của module bánh xe.' },
    { id: 'load', label: 'Mô-men tải ở trục ra (bánh xe)', type: 'range', min: 0, max: 0.8, step: 0.01, value: 0.25, unit: 'N·m', hint: 'Robot 3.6 kg tăng tốc / leo thảm: 0.1–0.4 N·m mỗi bánh. Kẹt vào chân ghế: rất lớn.' },
    { id: 'eta', label: 'Hiệu suất mỗi tầng η', type: 'range', min: 0.8, max: 0.98, step: 0.01, value: 0.92, unit: '' },
    { id: 'slow', label: 'Làm chậm hình ảnh', type: 'select', value: '200', options: [['50', '50×'], ['200', '200×'], ['1000', '1000×']] },
    { id: 'cut', label: 'Cắt bổ vỏ hộp số', type: 'toggle', value: true, hint: 'Mô hình CAD: nắp hộp số vẽ trong suốt để thấy bánh răng' },
  ],
  readouts: [
    { id: 'i', label: 'Tỉ số truyền tổng i', unit: '' },
    { id: 'nm', label: 'Tốc độ động cơ thực', unit: 'vòng/phút' },
    { id: 'nout', label: 'Tốc độ trục ra', unit: 'vòng/phút' },
    { id: 'v', label: 'Tốc độ robot (bánh Ø70)', unit: 'm/s' },
    { id: 'tm', label: 'Mô-men động cơ cần', unit: 'mN·m' },
    { id: 'tout', label: 'Mô-men trục ra', unit: 'N·m' },
    { id: 'eff', label: 'Hiệu suất tổng ηⁿ', unit: '%' },
    { id: 'cur', label: 'Dòng động cơ', unit: 'A' },
    { id: 'sf', label: 'Hệ số an toàn răng tầng cuối', unit: '' },
    { id: 'icad', label: 'Hộp số CAD thật (đang quay trên hình)', unit: '' },
  ],
  scope: {
    window: 4,
    note: '(thời gian thực · hình 3D quay chậm theo lựa chọn)',
    channels: [
      { name: 'Tốc độ trục ra', unit: 'rpm', min: 0, max: 400, color: '#4cc2ff' },
      { name: 'Mô-men ra', unit: 'N·m', min: 0, max: 1, color: '#ffd34d' },
      { name: 'Dòng động cơ', unit: 'A', min: 0, max: 2.2, color: '#ff6b9a' },
    ],
  },

  steps: [
    { title: 'Bước 0 — Hộp số lắp hoàn chỉnh', text: 'Hộp số nằm trong module bánh xe. Trước khi mở: tháo module khỏi robot, <b>rút giắc động cơ</b>. Dụng cụ: tua vít PH0/PH1, que nhựa nạy, tăm bông, cồn isopropyl, mỡ bôi trơn cho nhựa (mỡ silicone hoặc mỡ PTFE), khay đựng.' },
    { title: 'Bước 1 — Tháo 4 vít nắp hộp số', text: 'Vít tự ren PT 2.6×8 vào nhựa. Có module dùng thêm <b>lẫy cài (snap-fit)</b> ở cạnh — nạy nhẹ bằng que nhựa, đừng dùng tua vít bẩy mạnh (gãy lẫy là nắp không còn kín bụi).' },
    { title: 'Bước 2 — Nhấc nắp thẳng lên', text: 'Nhấc <b>thật thẳng</b>: đầu trục các bánh răng cắm vào lỗ trên nắp, nhấc nghiêng sẽ kéo bánh răng theo, rơi lung tung. <b>Chụp ảnh ngay</b> thứ tự và mặt nào của bánh răng kép quay lên trên.' },
    { title: 'Bước 3 — Lấy bánh răng ra theo thứ tự', text: 'Lấy từ tầng trên cùng (trục ra) xuống tầng dưới, xếp lên khay theo đúng thứ tự. Kiểm tra từng răng bằng kính lúp: <b>mẻ, mòn vẹt, tóc/chỉ quấn trục</b>. Trục thép có thể rút ra hoặc ép chặt vào vỏ — đừng cố nhổ trục ép.' },
    { title: 'Bước 4 — Vệ sinh & tra mỡ', text: 'Lau sạch mỡ cũ lẫn bụi (bụi + mỡ = bột mài!) bằng cồn. Tra <b>một lớp mỏng</b> mỡ cho nhựa lên răng và trục. KHÔNG dùng WD-40 (là dung môi, rửa trôi mỡ) hay mỡ gốc dầu khoáng rẻ tiền (làm trương nở một số loại nhựa).' },
    { title: 'Bước 5 — Lắp lại', text: 'Lắp bánh răng từ tầng dưới lên, xoay nhẹ trục động cơ để răng tự vào khớp. Đậy nắp, xoay tay trục ra phải trơn đều, không kẹt điểm nào rồi mới vặn vít (≈ 0.2–0.3 N·m, không siết quá — toét cột nhựa). Thử chạy 3 V xem có tiếng lạch cạch không.' },
  ],
  faults: [
    { id: 'gay-rang', label: 'Mẻ 1 răng (kẹt chân ghế khi đang chạy)', severity: 'hong',
      what: '<p>Tiếng <b>"cạch"</b> đều đặn mỗi vòng của bánh răng bị mẻ; robot giật cục, tốc độ trục ra tụt từng nhịp (nhìn máy hiện sóng). Răng bên cạnh chịu quá tải sẽ mẻ tiếp → cuối cùng quay trơn, bánh không chạy.</p>',
      why: '<p>Khi bánh xe bị kẹt cứng, mô-men kẹt của động cơ nhân qua hộp số: <code>22 mN·m × 60 × 0.78 ≈ 1 N·m</code> → lực lên răng tầng cuối <code>F = T/r ≈ 1/0.018 ≈ 57 N</code>, vượt sức chịu uốn của răng nhựa POM m = 0.8 (≈ 30 N theo công thức Lewis).</p>',
      fix: '<p>Firmware phát hiện kẹt (encoder đứng yên khi đang ra lệnh chạy → dừng sau 0.5–1 s) và giới hạn dòng driver. Thay bánh răng đúng số răng & mô-đun (đếm răng, đo đường kính đỉnh: <code>d_a = m·(z + 2)</code>).</p>' },
    { id: 'kho-mo', label: 'Hộp số khô mỡ / xịt WD-40', severity: 'loi',
      what: '<p>Hộp số rít, ồn hơn hẳn; dòng động cơ tăng, robot chạy chậm hơn khi leo thảm; bánh răng nóng, mòn nhanh thành bột nhựa trắng.</p>',
      why: '<p>Ma sát trượt giữa các răng tăng → hiệu suất mỗi tầng tụt từ ~0.92 xuống ~0.78. Với 3 tầng: 0.92³ = 78 % → 0.78³ = 47 %. Động cơ phải sinh thêm ~65 % mô-men → dòng tăng, nóng.</p>',
      fix: '<p>Vệ sinh và tra mỡ đúng loại (silicone/PTFE cho nhựa). WD-40 chỉ là chất tẩy/chống ẩm, không phải mỡ bôi trơn lâu dài.</p>' },
    { id: 'lap-lech', label: 'Lắp sai: bánh răng kép lật ngược / nắp lệch trục', severity: 'hong',
      what: '<p>Bấm chạy: động cơ kêu "ừ ừ" nhưng trục ra <b>không quay</b>; dòng vọt lên dòng kẹt ~2 A, động cơ nóng dần (nếu để lâu: khét cuộn dây, cháy driver).</p>',
      why: '<p>Bánh răng kép lắp ngược mặt → bánh nhỏ của tầng sau không nằm cùng mặt phẳng với bánh lớn ăn khớp, hoặc trục bị nắp ép lệch → hai bánh răng <b>chèn răng</b> vào nhau, kẹt cứng. Động cơ đứng yên: không có sức phản điện động, I = V/R = 14.4/7 ≈ 2 A, P = I²R ≈ 29 W nhiệt.</p>',
      fix: '<p>Luôn chụp ảnh trước khi tháo; sau khi lắp, xoay tay trục ra một vòng đủ — phải trơn đều — rồi mới cấp điện. Cấp điện thử ở điện áp thấp.</p>' },
  ],

  info: {
    overview: \`
      <p>Động cơ DC nhỏ quay rất nhanh (≈ 9 000–12 000 vòng/phút) nhưng mô-men chỉ vài chục mN·m — không đủ đẩy robot 3.6 kg. <b>Hộp số giảm tốc</b> đổi tốc độ lấy lực: giảm tốc độ đi <code>i</code> lần thì mô-men tăng gần <code>i</code> lần.</p>
      <p>Module bánh xe robot hút bụi thường dùng <b>3–4 tầng bánh răng thẳng bằng nhựa POM</b>, tầng đầu (tốc độ cao) mô-đun nhỏ cho êm, tầng cuối (lực lớn) mô-đun to cho răng khỏe.</p>
      <p>Thử: đổi <b>Số tầng</b> và nhìn tốc độ robot. 1 tầng: robot chạy 11 m/s (vô lý!) nhưng không đủ lực; 4 tầng: rất khỏe nhưng chỉ 0.2 m/s. Tăng <b>Mô-men tải</b> đến khi hệ số an toàn răng &lt; 1 — đó là lúc răng nhựa bắt đầu gãy.</p>\`,
    specs: [
      ['Kiểu', 'Bánh răng thẳng (spur gear) bánh kép (compound), 3 tầng, vỏ nhựa 2 nửa'],
      ['Tầng 1', 'z 10 → 44, mô-đun m = 0.5 (bánh nhỏ đồng thau ép trên trục động cơ), i = 4.4'],
      ['Tầng 2', 'z 11 → 40, m = 0.6, i = 3.64'],
      ['Tầng 3', 'z 12 → 45, m = 0.8, i = 3.75 → tổng i = 60'],
      ['Tầng 4 (tùy chọn)', 'z 14 → 35, m = 1.0, i = 2.5 → tổng i = 150'],
      ['Hiệu suất', '≈ 0.90–0.95 mỗi tầng (nhựa có mỡ) → 3 tầng ≈ 78 %'],
      ['Vật liệu', 'POM (polyacetal) tự bôi trơn, chịu mài mòn; bánh nhỏ tầng 1 bằng đồng thau/thép vì quay nhanh nhất'],
      ['Đường kính vòng chia', '<code>d = m·z</code> · đường kính đỉnh <code>d_a = m·(z+2)</code> · khoảng cách trục <code>a = m·(z1+z2)/2</code>'],
    ],
    principle: \`
      <h4>1. Tỉ số truyền</h4>
      <p>Hai bánh răng ăn khớp có cùng tốc độ dài tại điểm tiếp xúc: <code>ω1·r1 = ω2·r2</code>. Vì <code>r = m·z/2</code> nên <code>i = n1/n2 = z2/z1</code>. Nhiều tầng nối tiếp: <code>i_tổng = i1 × i2 × i3 …</code></p>
      <p>Ví dụ: <code>44/10 × 40/11 × 45/12 = 4.4 × 3.64 × 3.75 = 60</code>.</p>
      <h4>2. Chiều quay</h4>
      <p>Mỗi cặp ăn khớp ngoài đảo chiều quay. Số tầng lẻ → trục ra quay ngược chiều động cơ. (Bánh răng kép = 2 bánh trên cùng trục → cùng chiều, cùng tốc độ.)</p>
      <h4>3. Mô-men & hiệu suất</h4>
      <p><code>T_ra = T_vào · i · ηⁿ</code>. Công suất chỉ giảm vì ma sát: <code>P = T·ω</code> (vào) × ηⁿ = (ra).</p>
      <h4>4. Sức bền răng (công thức Lewis)</h4>
      <p>Lực tiếp tuyến trên răng <code>F_t = T / r</code>. Răng chịu được <code>F_cho_phép = σ·b·m·Y</code> (σ ứng suất cho phép, b bề rộng, m mô-đun, Y ≈ 0.3 hệ số dạng răng). Răng tầng cuối chịu mô-men lớn nhất → phải dùng m và b lớn hơn.</p>
      <h4>5. Động cơ + hộp số</h4>
      <p>Mô-men động cơ cần: <code>T_m = T_tải/(i·ηⁿ) + T_ma_sát</code>. Nếu T_m vượt đường đặc tính <code>T_max(n) = Ts·(1 − n/n0)</code> thì tốc độ tụt (PID không giữ nổi). Dòng điện <code>I ≈ I0 + T_m/Kt</code>.</p>\`,
    inRobot: \`
      <ul>
        <li>Trục ra hộp số gắn thẳng vào la-zăng bánh Ø70. Tỉ số thật thường 1:50 – 1:100 → bánh 100–200 vòng/phút → robot 0.3–0.5 m/s.</li>
        <li>Encoder Hall đặt trên <b>trục động cơ</b> (trước hộp số) nên số xung/vòng bánh = xung/vòng động cơ × i. Ví dụ 16 xung × 62.5 = 1 000 xung/vòng bánh (giá trị mặc định trong <code>docs/01</code>, mục 5). Đo lại bằng cách quay tay bánh 10 vòng.</li>
        <li>PIC phát PWM qua CCP1 (bánh trái) / CCP2 (bánh phải) → DRV8871 → động cơ. Khi đổi hộp số khác tỉ số phải sửa hằng số mm/xung trong <code>config.h</code> của ESP32 (odometry).</li>
      </ul>\`,
    mistakes: \`
      <ul>
        <li>Nhấc nắp hộp số nghiêng → bánh răng rơi, lắp lại sai thứ tự hoặc lật ngược bánh kép → kẹt.</li>
        <li>Xịt WD-40 "cho trơn" → rửa trôi mỡ, vài tuần sau hộp số rít và mòn.</li>
        <li>Thay bánh răng "trông giống" nhưng khác mô-đun (0.5 vs 0.6) → không ăn khớp, gãy răng ngay.</li>
        <li>Kéo/đẩy robot bằng tay khi đang tắt máy → quay ngược hộp số tỉ số lớn, có thể làm mẻ răng tầng đầu và phát điện ngược vào driver.</li>
        <li>Quên rằng tóc quấn trục ra bánh xe cũng tạo tải lớn → dòng tăng, mòn bạc.</li>
      </ul>\`,
    quiz: [
      { q: 'Hộp số 3 tầng: 10→40, 12→36, 15→45. Tỉ số tổng bao nhiêu? Trục ra quay cùng hay ngược chiều động cơ?', a: 'i = 4 × 3 × 3 = 36. 3 cặp ăn khớp (lẻ) → ngược chiều động cơ.' },
      { q: 'Động cơ 9 000 vòng/phút qua hộp số i = 60, bánh Ø70 mm. Robot chạy bao nhiêu m/s?', a: 'n_bánh = 9000/60 = 150 vòng/phút = 2.5 vòng/s. v = 2.5 × π × 0.07 ≈ 0.55 m/s.' },
      { q: 'Vì sao tầng cuối của hộp số dùng mô-đun lớn hơn tầng đầu?', a: 'Tầng cuối chịu mô-men lớn nhất (đã nhân i), lực lên răng F = T/r lớn. Theo Lewis, sức chịu của răng ∝ b·m → cần mô-đun (răng to) và bề rộng lớn hơn.' },
    ],
  },

  build(ctx) {
    const { THREE, MAT, geom, label, readout, fx } = ctx;
    const { mesh, group, part, cyl, box, gearGeometry, makeCutaway } = geom;
    const root = new THREE.Group();
    const learn = new THREE.Group();               // mô hình học tham số (ẩn khi xem CAD thật)
    root.add(learn);

    // ---------- vị trí trục: S0 = trục động cơ, Sk = trục bánh lớn tầng k ----------
    const shafts = [[0, 0]];
    STAGES.forEach((st) => {
      const a = (st.m * (st.zp + st.zg)) / 2;
      const [x, z] = shafts[shafts.length - 1];
      shafts.push([x + a * Math.cos(st.dir), z - a * Math.sin(st.dir)]);
    });
    const yLevel = (k) => 6 + k * LEVEL;            // mặt phẳng giữa của tầng k (0-based)

    // nhóm quay cho từng trục
    const shaftGroups = shafts.map(([x, z], k) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      learn.add(g);
      return g;
    });
    const gearMeshes = [];                          // để đánh dấu noCut
    const gearMats = [MAT.plasticWhite, MAT.plasticWhite.clone(), MAT.plasticWhite.clone(), MAT.plasticWhite.clone()];
    gearMats[1].color.set(0xe8dcc0); gearMats[2].color.set(0xdfe8f0); gearMats[3].color.set(0x3a3d42);
    const pinions = [], bigGears = [], rods = [];
    STAGES.forEach((st, j) => {
      const s = (2 * Math.PI);
      const alpha = st.dir;                          // hướng từ trục j → trục j+1 (quy ước rotation.y)
      // bánh nhỏ trên trục j
      const pMat = j === 0 ? MAT.brass : gearMats[j - 1];
      const pin = mesh(gearGeometry({ teeth: st.zp, module: st.m, width: st.b, bore: j === 0 ? 0.5 : 1 }), pMat, { y: yLevel(j) });
      pin.rotation.y = alpha - 0.3 * (s / st.zp);
      shaftGroups[j].add(part(pin, j === 0 ? \`Bánh răng con trên trục động cơ (z = \${st.zp}, m = \${st.m})\` : \`Bánh nhỏ tầng \${j + 1} (z = \${st.zp}, m = \${st.m})\`,
        j === 0 ? 'Đồng thau ép chặt trên trục Ø2 mm. Quay nhanh nhất (= tốc độ động cơ) nên làm bằng kim loại để không mòn.'
          : \`Đúc liền với bánh lớn tầng \${j} thành <b>bánh răng kép</b> — cùng trục, cùng tốc độ.\`));
      pinions.push(pin);
      // bánh lớn trên trục j+1
      const big = mesh(gearGeometry({ teeth: st.zg, module: st.m, width: st.b, bore: 1 }), gearMats[j], { y: yLevel(j) });
      big.rotation.y = alpha + Math.PI - 0.8 * (s / st.zg);
      const hub = mesh(cyl(st.m * 4, st.m * 4, st.b + 1.5, 24), gearMats[j], { y: yLevel(j) + 0.5 });
      shaftGroups[j + 1].add(part(group(big, hub), \`Bánh lớn tầng \${j + 1} (z = \${st.zg}, m = \${st.m}, b = \${st.b} mm)\`,
        \`Tỉ số tầng \${j + 1}: \${st.zg}/\${st.zp} = \${(st.zg / st.zp).toFixed(2)}. Đường kính đỉnh \${(st.m * (st.zg + 2)).toFixed(1)} mm. Quay ngược chiều bánh nhỏ dẫn nó.\`));
      bigGears.push(big);
      gearMeshes.push(pin, big, hub);
    });
    // trục thép cho các trục trung gian
    shaftGroups.forEach((g, k) => {
      if (k === 0) return;
      const y0 = yLevel(k - 1) - 4, y1 = yLevel(Math.min(k, STAGES.length - 1)) + 4;
      const rod = mesh(cyl(1, 1, y1 - y0, 16), MAT.steel, { y: (y0 + y1) / 2 });
      g.add(part(rod, \`Trục thép Ø2 mm số \${k}\`, 'Trục ép vào lỗ vỏ dưới, đầu trên lọt vào lỗ nắp. Bánh răng kép quay trơn trên trục (có mỡ).'));
      rods.push(rod);
      gearMeshes.push(rod);
    });
    // trục ra (đặt lại vị trí theo số tầng)
    const outShaft = new THREE.Group();
    const outRod = mesh(cyl(2.5, 2.5, 30, 24), MAT.steel, { y: 15 });
    const dFlat = mesh(box(1.2, 12, 5.2), MAT.blackOxide, { x: 2.2, y: 24 });
    outShaft.add(part(group(outRod, dFlat), 'Trục ra Ø5 mm có vát D', 'Xuyên ra ngoài vỏ, gắn vào la-zăng bánh xe. Mặt vát D giúp truyền mô-men không bị trượt.'));
    gearMeshes.push(outRod, dFlat);
    // đánh dấu răng mẻ (sự cố) trên bánh lớn tầng 2
    const chip = mesh(box(2.5, 5, 2.5), MAT.plasticRed.clone(), { x: (STAGES[1].m * STAGES[1].zg) / 2, y: yLevel(1) });
    chip.visible = false;
    shaftGroups[2].add(part(chip, 'Răng bị mẻ', 'Mỗi lần chỗ mẻ đi qua điểm ăn khớp: mất truyền lực trong khoảnh khắc → tiếng "cạch", robot giật.'));
    gearMeshes.push(chip);

    // ---------- động cơ ----------
    const motor = group(
      mesh(cyl(12, 12, 30, 48), MAT.steel, { y: -17 }),
      mesh(cyl(12, 12, 4, 48), MAT.plasticWhite, { y: -34 }),
      mesh(cyl(1, 1, 8, 16), MAT.steel, { y: 1 }),
    );
    motor.children.forEach((c) => gearMeshes.push(c));
    learn.add(part(motor, 'Động cơ DC RS-360 (14.4 V)', 'Không tải ≈ 12 000 vòng/phút, mô-men kẹt ≈ 22 mN·m. Bắt vào vỏ hộp số bằng 2 vít M2.5.'));

    // ---------- vỏ hộp số (2 nửa) ----------
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    shafts.forEach(([x, z], k) => {
      const r = k === 0 ? 4 : (STAGES[k - 1].m * (STAGES[k - 1].zg + 2)) / 2;
      minX = Math.min(minX, x - r); maxX = Math.max(maxX, x + r); minZ = Math.min(minZ, z - r); maxZ = Math.max(maxZ, z + r);
    });
    const W = maxX - minX + 6, D = maxZ - minZ + 6, cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const H = yLevel(STAGES.length - 1) + 6;
    const housing = new THREE.Group();
    learn.add(housing);
    const shellMat = MAT.plasticDark.clone();
    const base = group(
      mesh(box(W, 2, D, 0.8), shellMat, { x: cx, y: 0 }),
      mesh(box(W, H * 0.55, 2), shellMat, { x: cx, y: H * 0.275, z: cz - D / 2 + 1 }),
      mesh(box(2, H * 0.55, D), shellMat, { x: cx - W / 2 + 1, y: H * 0.275, z: cz }),
      mesh(box(2, H * 0.55, D), shellMat, { x: cx + W / 2 - 1, y: H * 0.275, z: cz }),
      mesh(box(W, H * 0.55, 2), shellMat, { x: cx, y: H * 0.275, z: cz + D / 2 - 1 }),
    );
    housing.add(part(base, 'Vỏ dưới hộp số', 'Nhựa ABS/PC đúc, có các lỗ ép trục thép. Động cơ bắt phía dưới.'));
    const cover = new THREE.Group();
    const coverMat = MAT.plasticGrey.clone();
    cover.add(
      mesh(box(W, 2, D, 0.8), coverMat, { x: cx, y: H }),
      mesh(box(W, H * 0.45, 2), coverMat, { x: cx, y: H * 0.775, z: cz - D / 2 + 1 }),
      mesh(box(2, H * 0.45, D), coverMat, { x: cx - W / 2 + 1, y: H * 0.775, z: cz }),
      mesh(box(2, H * 0.45, D), coverMat, { x: cx + W / 2 - 1, y: H * 0.775, z: cz }),
      mesh(box(W, H * 0.45, 2), coverMat, { x: cx, y: H * 0.775, z: cz + D / 2 - 1 }),
    );
    housing.add(part(cover, 'Nắp hộp số', 'Giữ đầu trên các trục. Phải nhấc thẳng lên khi tháo.'));
    const screws = new THREE.Group();
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      screws.add(mesh(cyl(2.2, 2.2, 1.6, 20), MAT.zinc, { x: cx + sx * (W / 2 - 3), y: H + 1.8, z: cz + sz * (D / 2 - 3) }));
    }
    housing.add(part(screws, '4 vít PT 2.6×8', 'Vít tự ren vào cột nhựa của vỏ dưới. Siết ~0.25 N·m.'));
    gearMeshes.forEach((m) => (m.userData.noCut = true));
    screws.traverse((o) => (o.userData.noCut = true));
    const setCut = makeCutaway(root);
    setCut(true);
    label(learn, 'Động cơ (nhanh, yếu)', [0, -20, 14]);
    label(learn, 'Trục ra (chậm, khỏe)', [shafts[3][0], H + 32, shafts[3][1]]);

    // ---------- MÔ HÌNH CAD THẬT: hộp số trong module bánh xe ----------
    // rotateY(−90°): mặt nắp hộp số + động cơ (+X GLB) quay về phía người xem (+Z). Khung, lò xo, công tắc bị gỡ khỏi cảnh.
    const AX = cadGearAxes();
    const C = { gears: [], mGears: [], screws: [], mScrews: [] };
    const NAMES = ['gear_motor_pinion', 'gear_1', 'gear_2', 'gear_3', 'gear_out'];
    let lidMats = [], lastLidT = null;
    const cad = cadAttach(ctx, root, 'robot/wheel-module', {
      rotateY: -Math.PI / 2,
      hide: [learn],
      partDefault: ['Hộp số module bánh xe (CAD thật)', \`Hộp số thật trong module bánh Roborock S5 / Xiaomi gen1: 4 cặp bánh răng thẳng m0.5, i = 4 × 3 × 3.33 × 3.14 ≈ \${CAD_I.toFixed(1)}. Số liệu bảng Số đo tính theo mô hình học (số tầng đang chọn).\`],
      parts: {
        gear_motor_pinion: ['Bánh răng con trên trục động cơ (z = 10, m = 0.5)', 'Ép chặt trên trục Ø2.3 của động cơ — quay nhanh nhất (bằng tốc độ động cơ). Cặp 1: 40/10 = 4.'],
        gear_1: ['Bánh răng kép 1 (z = 40 / 12)', 'Bánh lớn 40 răng ăn khớp bánh con, bánh nhỏ 12 răng đúc liền dẫn cặp 2 (36/12 = 3). Quay NGƯỢC chiều động cơ.'],
        gear_2: ['Bánh răng kép 2 (z = 36 / 12)', 'Cặp 3: 40/12 = 3.33. Đầu trục mang đĩa nam châm encoder. Quay CÙNG chiều động cơ.'],
        gear_3: ['Bánh răng kép 3 (z = 40 / 14)', 'Bánh nhỏ 14 răng dẫn bánh răng ra (44/14 = 3.14). Răng tầng cuối chịu lực lớn nhất.'],
        gear_out: ['Bánh răng ra (z = 44) — trục bánh xe', 'Quay cùng bánh xe: chậm nhất, mô-men lớn nhất. n_ra = n_động_cơ / 125.7.'],
        gear_pins: ['Trục thép Ø1.6 các bánh răng kép', 'Ép vào nửa trong vỏ, đầu kia lọt vào lỗ trên nắp. Tra mỡ silicone/PTFE.'],
        arm_pivot: ['Vỏ hộp số — nửa trong (= tay đòn)', 'Nhựa đúc; giữ các trục bánh răng. Cả hộp số xoay quanh trục động cơ để bánh nhún.'],
        lid_gearbox: ['Nắp hộp số (vẽ trong suốt khi bật Cắt bổ)', '6 vít PT 2.6 giữ nắp. Nhấc thẳng ra kẻo kéo theo bánh răng.'],
        can: ['Động cơ DC RS-360 (14.4 V)', 'Không tải ≈ 12 000 vòng/phút, mô-men kẹt ≈ 22 mN·m. Bắt vào nắp hộp số bằng đai thép.'],
        endcap: ['Nắp sau động cơ', 'Giữ chổi than; 2 cực hàn dây M+ / M−.'],
        shaft: ['Trục động cơ Ø2.3', 'Xuyên qua nắp vào bánh răng con.'],
        motor_plate: ['Đai thép giữ động cơ', 'Kẹp động cơ đồng trục với chốt xoay tay đòn.'],
        tyre: ['Bánh xe Ø70 (tải của hộp số)', 'Mô-men ra của hộp số đẩy robot qua lực ma sát lốp — sàn.'],
        hub: ['La-zăng bánh xe', 'Gắn trên trục ra.'],
        axle: ['Trục ra Ø4', 'Mang bánh răng ra và bánh xe.'],
        encoder_magnet: ['Đĩa nam châm encoder', 'Quay cùng bánh răng kép 2; cảm biến Hall đếm cực từ.'],
        encoder: ['Bo encoder Hall + giắc', 'Đếm xung để PIC biết bánh quay bao nhiêu.'],
        'screw_*': ['Vít PT 2.6 × 10 giữ nắp', 'Vít tự ren vào nhựa, siết ≈ 0.25 N·m — quá tay là toét cột nhựa.'],
      },
      labels: [['Động cơ (nhanh, yếu)', 'can', [0, -18, 10]], ['Bánh răng con z = 10', 'gear_motor_pinion', [0, 18, 12]], ['Bánh răng ra z = 44 → bánh xe', 'gear_out', [16, -30, 10]]],
      onLoad(c) {
        // gỡ phần không thuộc hộp số (để camera căn sát)
        ['frame', 'spring', 'switch_drop', 'pivot_pin', 'screw_7', 'screw_8', 'screw_9', 'conn_wheel'].forEach((n) => c.node(n)?.removeFromParent());
        C.gears = NAMES.map((n, k) => c.pivot(n, { axis: [1, 0, 0], origin: AX[k] }));
        C.wheel = c.pivot('wheel', { axis: [1, 0, 0], origin: AX[4] });
        C.shaft = c.pivot('shaft', { axis: [1, 0, 0], origin: AX[0] });
        C.mag = c.pivot('encoder_magnet', { axis: [1, 0, 0], origin: AX[2] });
        C.screws = [1, 2, 3, 4, 5, 6].map((k) => c.pivot('screw_' + k, { axis: [1, 0, 0] }));
        C.mGears = NAMES.map((n) => c.move(n));
        C.mScrews = [1, 2, 3, 4, 5, 6].map((k) => c.move('screw_' + k));
        C.mLid = c.move('lid_gearbox'); C.mMotor = c.move('motor'); C.mPlate = c.move('motor_plate');
        C.mEnc = c.move('encoder'); C.mMag = c.move('encoder_magnet');
        C.can = c.node('can'); C.train = c.node('gear_train');
        lidMats = [];
        ['lid_gearbox', 'encoder'].forEach((n) => c.node(n)?.traverse((o) => { if (o.isMesh) { const m = ownMaterial(o); m.depthWrite = true; lidMats.push(m); } }));
        lastLidT = null;
      },
    });

    // ---------- mô phỏng ----------
    let theta = 0, thetaReal = 0, lastTurnR = 0, lastTurnV = 0, nMotor = 0, lastCut = true, lastStages = -1, fault = null, step = -1, stepPos = 0, temp = 25;
    const cumRatio = [1];
    STAGES.forEach((st) => cumRatio.push(cumRatio[cumRatio.length - 1] * (st.zg / st.zp)));

    function applyStages(n) {
      shaftGroups.forEach((g, k) => (g.visible = k <= n));
      pinions.forEach((pg, j) => (pg.visible = j < n));
      bigGears.forEach((bg, j) => (bg.parent.visible = j + 1 <= n));
      shaftGroups[n].add(outShaft);
      outShaft.position.set(0, yLevel(n - 1), 0);
    }

    return {
      object: root,
      setStep(i) { step = i; },
      triggerFault(id) { fault = id; },
      resetFault() { fault = null; temp = 25; chip.visible = false; if (cad.loaded) cad.glow('gear_2', 0x000000, 0); },
      update(dt, t, p) {
        const n = Number(p.stages);
        if (n !== lastStages) { applyStages(n); lastStages = n; }
        if (p.cut !== lastCut) { setCut(p.cut); lastCut = p.cut; }

        // ---------- tháo lắp ----------
        stepPos += ((step >= 5 ? 0 : Math.max(0, step)) - stepPos) * Math.min(1, dt * 3);
        const sp1 = Math.min(1, stepPos), sp2 = Math.max(0, Math.min(1, stepPos - 1)), sp3 = Math.max(0, Math.min(1, stepPos - 2));
        screws.position.y = sp1 * 12;
        screws.visible = stepPos < 1.5;
        cover.position.y = sp2 * 45;
        shaftGroups.forEach((g, k) => { g.position.y = k === 0 ? 0 : sp3 * (k * 14 + 20); });

        // ---------- vật lý ----------
        const eta = fault === 'kho-mo' ? 0.78 : p.eta;
        const i = cumRatio[n];
        const etaN = Math.pow(eta, n);
        // tải quy về động cơ (mN·m) + ma sát
        let tReq = (p.load * 1000) / (i * etaN) + T_FRIC;
        const jam = fault === 'lap-lech';
        let tAvail = TS * (1 - nMotor / N0);
        // răng mẻ: khi chỗ mẻ đi qua điểm ăn khớp → mất lực một khoảnh khắc
        let knock = false;
        if (fault === 'gay-rang' && n >= 2) {
          chip.visible = true;
          // góc THẬT của bánh lớn tầng 2 (không làm chậm): mỗi lần chỗ mẻ quét qua điểm ăn khớp → 1 cú "cạch"
          thetaReal += (nMotor / 60) * 2 * Math.PI * dt;
          const turnR = Math.floor((thetaReal / cumRatio[2]) / (2 * Math.PI));
          if (turnR !== lastTurnR) { knock = true; lastTurnR = turnR; }
        }
        // động cơ: PID cố giữ tốc độ đặt; bị giới hạn bởi đường đặc tính ở 14.4 V
        let target = Math.min(p.rpm, N0 * (1 - Math.min(1, tReq / TS)));
        if (jam) target = 0;
        nMotor += (target - nMotor) * Math.min(1, dt * 8);
        if (knock) nMotor *= 0.85;
        if (jam) tReq = TS;                                              // kẹt: động cơ sinh hết mô-men kẹt
        const tm = p.rpm > 0 || jam ? Math.min(TS, tReq) : 0;
        const cur = p.rpm > 0 || jam ? I0 + (tm - T_FRIC) / 1000 / KT : 0;
        const nOut = nMotor / i;
        const tOut = jam ? 0 : knock ? 0 : Math.max(0, (tm - T_FRIC) / 1000 * i * etaN);
        const v = (nOut * Math.PI * WHEEL_D) / 60000;
        // răng tầng cuối: Lewis
        const last = STAGES[n - 1];
        const ft = tOut / ((last.m * last.zg) / 2 / 1000);               // N
        const fAllow = SIGMA_POM * last.b * last.m * 0.3;               // N
        const sf = ft > 0.01 ? fAllow / ft : 99;
        // nhiệt động cơ (đơn giản): P = I²R, tản 8 K/W, τ ≈ 30 s
        temp += ((25 + cur * cur * 7 * 8) - temp) * Math.min(1, dt / 30) * (jam ? 3 : 1);
        if (jam || fault === 'kho-mo') fx.heat(motor, Math.max(0, (temp - 45) / 90));
        if (fault === 'kho-mo') bigGears.forEach((g) => fx.heat(g, 0.15));

        // ---------- quay (đã làm chậm) ----------
        const slow = Number(p.slow);
        theta += ((nMotor / 60) * 2 * Math.PI / slow) * dt;
        shaftGroups.forEach((g, k) => { g.rotation.y = (k % 2 === 0 ? 1 : -1) * theta / cumRatio[k]; });
        // hình 3D (đã làm chậm): chớp sáng đúng lúc chỗ mẻ đi qua điểm ăn khớp
        if (fault === 'gay-rang' && n >= 2) {
          const turnV = Math.floor((theta / cumRatio[2] - (STAGES[1].dir + Math.PI)) / (2 * Math.PI));
          if (turnV !== lastTurnV) { lastTurnV = turnV; fx.flash(shaftGroups[2], { size: 12, duration: 0.1, color: 0xffffff, intensity: 1 }); }
        }

        // ---------- CAD thật: cùng góc động cơ, bánh răng theo đúng tỉ số của hộp số thật ----------
        const cadOn = cad.sync(p);
        if (cadOn && C.gears.length) {
          const lidT = p.cut && sp2 < 0.02;
          if (lidT !== lastLidT) {
            lastLidT = lidT;
            lidMats.forEach((m) => { m.transparent = lidT; m.opacity = lidT ? 0.2 : 1; m.depthWrite = !lidT; m.needsUpdate = true; });
          }
          const ang = [theta, 0, 0, 0, 0];
          for (let k = 1; k < 5; k++) ang[k] = -ang[k - 1] * CAD_STAGES[k - 1][0] / CAD_STAGES[k - 1][1];   // mỗi cặp: đảo chiều, chậm đi z2/z1
          C.gears.forEach((g, k) => g?.set(ang[k]));
          C.shaft?.set(ang[0]); C.wheel?.set(ang[4]); C.mag?.set(ang[2]);
          // tháo lắp: vít ra (+X, xoay) → nắp + động cơ (bắt trên nắp) kéo thẳng ra → bánh răng nhấc ra từng chiếc
          C.mScrews.forEach((m) => { if (m) { m.set([12 * sp1, 0, 0]); m.node.visible = stepPos < 1.5; } });
          C.screws.forEach((sc) => sc?.set(sp1 * 8 * Math.PI));
          const lid = 30 * sp2;
          [C.mLid, C.mMotor, C.mPlate, C.mEnc, C.mMag].forEach((m) => m?.set([lid, 0, 0]));
          C.mGears.forEach((m, k) => m?.set([k === 0 ? lid : (10 + 9 * k) * sp3, 0, 0]));
          // sự cố
          if (fault === 'gay-rang') cad.glow('gear_2', 0xff2020, knock ? 1 : 0.35);
          if ((jam || fault === 'kho-mo') && C.can) fx.heat(C.can, Math.max(0, (temp - 45) / 90));
          if (fault === 'kho-mo' && C.train) fx.heat(C.train, 0.15);
          if (fault === 'gay-rang' && knock && C.gears[2]) fx.flash(C.gears[2].node, { size: 10, duration: 0.1, color: 0xffffff, intensity: 1 });
        }
        readout('icad', cadOn ? \`10→40 · 12→36 · 12→40 · 14→44 = \${CAD_I.toFixed(1)} : 1\` : '— (đang xem mô hình học)');
        readout('i', \`\${i.toFixed(1)} : 1\`);
        readout('nm', nMotor);
        readout('nout', nOut);
        readout('v', v);
        readout('tm', tm);
        readout('tout', tOut);
        readout('eff', etaN * 100);
        readout('cur', cur);
        readout('sf', sf > 50 ? '—' : sf < 1 ? \`\${sf.toFixed(2)} ⚠ răng sắp gãy\` : sf.toFixed(2));
        return [Math.min(nOut, 400), Math.min(tOut, 1), cur];
      },
    };
  },
};
`;export{n as default};
