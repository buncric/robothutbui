// 🌀 Lò xo treo bánh xe — lò xo nén đẩy tay đòn bánh xe xuống sàn.
// Mô hình "1/4 xe" (quarter-car): phần thân robot dồn lên 1 bánh có khối lượng M,
//   M·ḧ = F_bánh(h) − M·g − c·ḣ        (bánh chạm sàn)
//   F_bánh = F_lò_xo · |dL/ds|          (đòn bẩy, tính bằng công ảo từ hình học thật)
//   F_lò_xo = k·(L0 − L)                (định luật Hooke)
// Nhấc robot lên → lò xo đẩy bánh thõng hết hành trình → đuôi tay đòn ấn công tắc nhấc bánh → RB1 = 0.

const R_WHEEL = 35;      // bánh Ø70
const LW = 50;           // chốt xoay → tâm trục bánh (mm)
const LS = 22;           // chốt xoay → điểm tựa lò xo trên tay đòn (mm)
const LT = 14;           // đuôi tay đòn phía sau chốt (ấn công tắc)
const S_MAX = 30;        // hành trình bánh: 0 = thụt hết vào thân, 30 = thõng hết
const Y_TOP = 10;        // tâm bánh cao hơn chốt 10 mm khi s = 0
const L0 = 36;           // chiều dài tự do lò xo (mm)
const L_DROP = 30;       // chiều dài lò xo khi bánh thõng hết (đã nén sẵn 6 mm)
const ZA = -17;          // mặt phẳng tay đòn / lò xo (bên trong bánh)
const LIFT_H = S_MAX + 18;
const G = 9.81;
const BASE = 135;        // khoảng cách trục bánh chủ động ↔ bánh xoay trước (mm)

const phiOf = (s) => Math.asin((Y_TOP - s) / LW);
const armPt = (s, d) => { const f = phiOf(s); return [d * Math.cos(f), d * Math.sin(f)]; };
const B_DROP = armPt(S_MAX, LS);
const A = [B_DROP[0], B_DROP[1] + L_DROP];          // điểm tựa lò xo trên khung (cố định)
const springLen = (s) => { const b = armPt(s, LS); return Math.hypot(A[0] - b[0], A[1] - b[1]); };
const tailY = (s) => -LT * Math.sin(phiOf(s));      // đuôi tay đòn đi LÊN khi bánh thõng xuống
const LEVER_REST_Y = 2.0;                            // đầu cần công tắc khi chưa bị ấn
const SW_OP = 1.2;                                   // hành trình tác động của công tắc (mm)

export default {
  id: 'lo-xo',
  name: 'Lò xo treo bánh xe',
  category: 'co-khi',
  order: 2,
  icon: '🌀',
  summary: 'Lò xo nén trong module bánh xe: ép bánh xuống sàn để bám đường, vượt ngưỡng cửa — và khi bị nhấc lên thì đẩy bánh thõng xuống, ấn công tắc báo PIC (RB1/RB2) dừng động cơ.',
  tags: ['lò xo', 'spring', 'Hooke', 'giảm xóc', 'suspension', 'nhấc bánh', 'wheel drop', 'RB1'],

  params: [
    { id: 'mass', label: 'Khối lượng robot', type: 'range', min: 2, max: 5.5, step: 0.1, value: 3.6, unit: 'kg', hint: 'Robot hút bụi thật: 3–4 kg (có pin, hộp bụi).' },
    { id: 'cg', label: 'Trọng tâm lệch về trước trục bánh', type: 'range', min: -10, max: 60, step: 1, value: 12, unit: 'mm', hint: 'Càng lệch về trước, bánh xoay trước gánh càng nhiều, 2 bánh chủ động gánh càng ít.' },
    { id: 'k', label: 'Độ cứng lò xo k', type: 'range', min: 0.6, max: 4, step: 0.05, value: 2.2, unit: 'N/mm' },
    { id: 'c', label: 'Giảm chấn c (ma sát chốt + cao su)', type: 'range', min: 0, max: 60, step: 1, value: 8, unit: 'N·s/m' },
    { id: 'lift', label: 'Nhấc robot lên khỏi sàn', type: 'toggle', value: false },
    { id: 'drop', label: '⬇ Thả rơi robot từ 2 cm', type: 'button' },
    { id: 'forces', label: 'Hiện mũi tên lực', type: 'toggle', value: true },
  ],
  steps: [
    { title: 'Bước 0 — Module bánh lắp hoàn chỉnh', text: 'Trước khi tháo: <b>tắt công tắc chính, rút giắc pin</b>. Lật ngửa robot trên khăn mềm (tránh xước nắp, gãy tháp lidar). Dụng cụ: tua vít PH1, kìm mỏ nhọn, khay nhiều ngăn, điện thoại để chụp ảnh.' },
    { title: 'Bước 1 — Nhấc robot, bánh thõng hết', text: 'Robot nằm ngửa = bánh không chịu tải → lò xo đẩy tay đòn thõng hết hành trình, công tắc nhấc bánh bị ấn. Chụp ảnh <b>móc/đế lò xo nằm ở lỗ nào</b> — nhiều module có 2–3 lỗ móc cho các độ cứng khác nhau.' },
    { title: 'Bước 2 — Giữ chặt tay đòn, tháo chốt', text: 'Lò xo vẫn đang nén sẵn ~6 mm (≈ 13 N). <b>Một tay ép tay đòn về phía thân</b>, tay kia tháo vít/chốt hãm. Không buông tay đột ngột — lò xo sẽ bắn văng đi rất xa.' },
    { title: 'Bước 3 — Nhả từ từ, lấy lò xo ra', text: 'Thả tay đòn từ từ đến khi lò xo hết nén, rút lò xo ra. Kiểm tra: vòng dây đều, không gỉ, không bị toè đầu; hai đầu mài phẳng (lò xo nén) để đứng thẳng.' },
    { title: 'Bước 4 — Đo kiểm lò xo', text: 'Đo chiều dài tự do L₀ bằng thước kẹp (36 mm). Thử độ cứng: đặt lò xo lên cân nhà bếp, ép xuống 5 mm, đọc số kg × 9.81 / 5 = k (N/mm). Lò xo mỏi: L₀ ngắn đi ≥ 10 % → thay mới cùng thông số.' },
    { title: 'Bước 5 — Lắp lại', text: 'Đặt lò xo vào đế trên khung, đầu dưới vào núm trên tay đòn, ép tay đòn lên, xỏ chốt, vặn vít (vít tự ren vào nhựa: ~0.3 N·m, đừng siết quá tay). Thử bằng tay: ấn bánh lên phải nhún êm và tự bật ra; nghe "tách" của công tắc khi thõng hết.' },
  ],
  faults: [
    { id: 'lo-xo-cung', label: 'Lắp nhầm lò xo quá cứng / móc sai lỗ', severity: 'loi',
      what: '<p>Đặt robot xuống sàn nhưng bánh vẫn <b>thõng hết</b>, thân robot bị nâng cao, bánh xoay trước gần như không chạm sàn. Công tắc nhấc bánh bị ấn <b>liên tục</b> → RB1 = 0 → PIC tưởng robot đang bị nhấc, <b>không cho chạy</b> (app báo lỗi bánh).</p>',
      why: '<p>Lực ép bánh ngay ở vị trí thõng hết đã là <code>F = k·x_preload·(Ls/Lw)</code>. Với k = 9 N/mm: 9 × 6 × 0.44 ≈ 24 N &gt; tải 16 N của một bánh → trọng lượng robot không nén nổi lò xo, tay đòn không bao giờ nhả công tắc.</p>',
      fix: '<p>Dùng đúng lò xo gốc (đo L₀, đường kính dây, số vòng); chụp ảnh lỗ móc trước khi tháo. Kiểm tra sau khi lắp: đặt robot xuống sàn, đo RB1 phải về 5 V.</p>' },
    { id: 'lo-xo-mat', label: 'Lò xo văng mất khi tháo — lắp thiếu', severity: 'loi',
      what: '<p>Trên sàn: robot "ngồi" lên cữ chặn, bánh trượt khi tăng tốc hoặc qua thảm. Nguy hiểm hơn: <b>nhấc robot lên, bánh chỉ thõng một nửa</b>, không ấn được công tắc → PIC không biết bị nhấc → bánh vẫn quay, chổi vẫn chạy, có thể kẹp tay.</p>',
      why: '<p>Không còn lực lò xo, tay đòn chỉ rơi nhờ trọng lượng bánh (~60 g) — không thắng được ma sát chốt và dây điện động cơ kéo ngược. Lực ép bánh xuống sàn = 0 → lực bám chỉ còn nhờ trọng lượng tì qua cữ chặn, không ổn định.</p>',
      fix: '<p>Tháo trong túi nilon hoặc giữ chặt tay đòn khi nhả chốt; đếm đủ chi tiết vào khay. Lắp xong luôn thử: nhấc robot → nghe "tách" và đo RB1 = 0 V.</p>' },
    { id: 'lo-xo-moi', label: 'Lò xo mỏi sau vài năm (k giảm 45 %)', severity: 'nhe',
      what: '<p>Robot thấp hẳn xuống, cạ bụng khi qua thảm dày/ngưỡng cửa, hay báo kẹt; bánh trượt khi leo dốc nhẹ.</p>',
      why: '<p>Thép lò xo bị chùng (relaxation) do làm việc lâu ở ứng suất cao và nhiệt. k giảm → điểm cân bằng <code>F_bánh(s) = W</code> dịch về s ≈ 0 → chạm cữ chặn.</p>',
      fix: '<p>Thay lò xo mới cùng thông số; không tự kéo giãn lò xo cũ "cho dài ra" (sẽ chùng lại rất nhanh).</p>' },
  ],
  readouts: [
    { id: 'load', label: 'Tải tĩnh trên 1 bánh', unit: 'N' },
    { id: 'fs', label: 'Lực lò xo F = k·x', unit: 'N' },
    { id: 'x', label: 'Độ nén lò xo x', unit: 'mm' },
    { id: 's', label: 'Hành trình bánh (0 = thụt hết)', unit: 'mm' },
    { id: 'fn', label: 'Tần số dao động riêng', unit: 'Hz' },
    { id: 'zeta', label: 'Tỉ số giảm chấn ζ', unit: '' },
    { id: 'rb1', label: 'Công tắc nhấc bánh → RB1', unit: '' },
  ],
  scope: {
    window: 4,
    note: '(thời gian thực)',
    channels: [
      { name: 'Độ nén x', unit: 'mm', min: 0, max: 22, color: '#4cc2ff' },
      { name: 'Lực sàn đỡ bánh', unit: 'N', min: 0, max: 45, color: '#ffd34d' },
      { name: 'RB1', unit: 'V', min: -0.5, max: 5.5, color: '#ff6b9a' },
    ],
  },

  info: {
    overview: `
      <p>Mỗi module bánh xe của robot hút bụi là một <b>tay đòn xoay</b> (trailing arm): một đầu bắt chốt vào khung, đầu kia mang bánh xe. Một <b>lò xo nén</b> (hoặc lò xo kéo/xoắn tùy hãng) luôn ép tay đòn xuống, nhờ vậy:</p>
      <ul>
        <li>Bánh luôn <b>bám sàn</b> kể cả khi một bên leo lên thảm/ngưỡng cửa (cao 1–2 cm).</li>
        <li>Lực ép bánh xuống sàn đủ lớn để không trượt khi tăng tốc.</li>
        <li>Khi robot bị <b>nhấc lên</b> hoặc bánh rơi xuống bậc thang, bánh thõng hết hành trình → đuôi tay đòn ấn <b>công tắc nhấc bánh</b> → PIC dừng ngay động cơ.</li>
      </ul>
      <p>Thử: bật <b>Nhấc robot lên</b> và nhìn RB1 chuyển 5 V → 0 V. Tắt đi để robot rơi xuống sàn — xem đồ thị dao động tắt dần. Kéo <b>Giảm chấn</b> về 0 rồi bấm <b>Thả rơi</b> để thấy robot "nảy" mãi. Thử giảm <b>k</b> xuống 0.8 N/mm: lò xo quá mềm → robot đè bẹp lò xo, bánh thụt hết vào thân (chạm đáy).</p>`,
    specs: [
      ['Loại', 'Lò xo nén thép lò xo (SWP-A / 65Mn), dây Ø1.0 mm, đường kính ngoài Ø10 mm, 8 vòng làm việc'],
      ['Chiều dài tự do L₀', '36 mm · lắp vào còn 30 mm (nén sẵn 6 mm = "preload")'],
      ['Độ cứng k', '≈ 2.2 N/mm (mỗi mm nén cần thêm 2.2 N)'],
      ['Hành trình bánh', '≈ 30 mm (từ thụt hết đến thõng hết)'],
      ['Tỉ số đòn bẩy', '≈ Ls/Lw = 22/50 = 0.44 → lò xo nén ít hơn bánh di chuyển, nhưng lực lớn gấp ~2.3 lần'],
      ['Tải trên 1 bánh', 'Robot 3.6 kg, trọng tâm lệch trước 12 mm → mỗi bánh chủ động ≈ 16 N, bánh xoay ≈ 3 N'],
      ['Công tắc nhấc bánh', 'Micro-switch mini (KW10 / SS-5GL), tác động sau khi bánh thõng ≈ 21 mm'],
    ],
    principle: `
      <h4>1. Định luật Hooke</h4>
      <p>Lò xo bị nén một đoạn <code>x</code> thì đẩy lại một lực <code>F = k·x</code>. Với k = 2.2 N/mm, nén 15 mm → F = 33 N.</p>
      <h4>2. Đòn bẩy: lực lò xo ↔ lực ép bánh</h4>
      <p>Lò xo tì vào tay đòn cách chốt <code>Ls</code>, bánh cách chốt <code>Lw</code>. Cân bằng mô-men quanh chốt: <code>F_bánh·Lw = F_lò_xo·Ls</code> → <code>F_bánh = F_lò_xo·Ls/Lw</code>. Mô phỏng tính chính xác hơn bằng <b>công ảo</b>: <code>F_bánh = F_lò_xo·|dL/ds|</code> (L = chiều dài lò xo, s = hành trình bánh).</p>
      <p>Độ cứng "quy về bánh": <code>k_bánh ≈ k·(Ls/Lw)²</code> ≈ 2.2·0.19 = 0.43 N/mm.</p>
      <h4>3. Phân bố trọng lượng (3 điểm tựa)</h4>
      <p>Robot đứng trên 2 bánh chủ động (cùng một trục) và 1 bánh xoay phía trước cách trục <code>L = ${BASE} mm</code>. Trọng tâm lệch trước trục đoạn <code>d</code>:</p>
      <p><code>N_bánh_xoay = W·d/L</code> · <code>N_mỗi_bánh = W·(1 − d/L)/2</code></p>
      <h4>4. Dao động & giảm chấn</h4>
      <p>Khối lượng M trên lò xo k dao động với tần số riêng <code>f = (1/2π)·√(k_bánh/M)</code> (≈ 2–3 Hz). Ma sát (hệ số <code>c</code>) làm dao động tắt dần, đánh giá bằng tỉ số giảm chấn <code>ζ = c / (2·√(k_bánh·M))</code>: ζ &lt; 1 còn nảy, ζ = 1 tắt nhanh nhất không nảy.</p>
      <div class="tip">Lò xo phải đủ cứng để <b>lực ép bánh ≥ tải</b> trước khi bánh thụt hết (nếu không robot "chạm đáy", tì bụng lên khung), nhưng đủ mềm để bánh còn thõng thêm 1–2 cm khi qua chỗ trũng.</div>`,
    inRobot: `
      <ul>
        <li>Mỗi module bánh trái/phải có 1 lò xo + 1 công tắc nhấc bánh. Theo <code>docs/01</code>: công tắc trái → <b>RB1 (chân 34)</b>, phải → <b>RB2 (chân 35)</b>, dùng <b>trở kéo lên nội</b> của PORTB → bình thường 5 V, bị ấn = 0 V (<code>DROP_ACTIVE_LEVEL 0</code> trong <code>config.h</code>).</li>
        <li>PIC đọc trong ngắt 1 ms, chống dội 5 ms (<code>sensors.c</code> → <code>drop_mask</code>). Bánh nào thõng → <b>dừng hết động cơ & tắt chổi</b> (<code>main.c</code>): tránh bánh quay tít khi người nhấc robot, kẹp tay trẻ con.</li>
        <li>Khi mổ xác robot: đo bằng đồng hồ xem công tắc <b>đóng khi bánh hạ</b> hay <b>khi bánh lên</b> — có hãng làm ngược lại → sửa <code>DROP_ACTIVE_LEVEL</code>.</li>
      </ul>`,
    mistakes: `
      <ul>
        <li>Tháo module bánh mà không giữ tay đòn → lò xo bật văng mất (nén sẵn 6 mm ≈ 13 N!). Hãy chụp ảnh vị trí móc lò xo trước khi tháo.</li>
        <li>Thay lò xo "cho cứng hơn" để bám tốt → bánh xoay trước bị nhấc, robot chạy lắc, cảm biến chống rơi phía trước đọc sai.</li>
        <li>Lò xo quá mềm / mỏi sau vài năm → robot chạm đáy, cạ bụng khi qua thảm, bánh trượt.</li>
        <li>Đổi pin nặng hơn hoặc lắp thêm lidar ở phía sau → trọng tâm dời ra sau trục bánh → bánh xoay mất tải, robot chổng mũi khi tăng tốc.</li>
        <li>Quên rằng công tắc nhấc bánh cũng tác động khi bánh rơi vào khe/hố → firmware dừng robot là đúng, đừng "tắt cho đỡ phiền".</li>
      </ul>`,
    quiz: [
      { q: 'Lò xo k = 2 N/mm đang nén 12 mm. Lực lò xo bao nhiêu? Nếu Ls/Lw = 0.44 thì lực ép bánh xuống sàn khoảng bao nhiêu?', a: 'F = 2 × 12 = 24 N. Lực ép bánh ≈ 24 × 0.44 ≈ 10.6 N.' },
      { q: 'Robot 4 kg, trọng tâm lệch trước trục bánh 27 mm, bánh xoay cách trục 135 mm. Bánh xoay gánh bao nhiêu N?', a: 'W = 4 × 9.81 = 39.2 N. N_xoay = 39.2 × 27/135 ≈ 7.8 N; mỗi bánh chủ động ≈ (39.2 − 7.8)/2 ≈ 15.7 N.' },
      { q: 'Vì sao công tắc nhấc bánh nối vào RB1/RB2 lại đọc 0 khi bị ấn?', a: 'Công tắc nối chân xuống GND, chân bật trở kéo lên nội (port_b_pullups). Hở → chân được kéo lên 5 V (mức 1); ấn → chân nối thẳng GND (mức 0) — "tích cực mức thấp".' },
    ],
  },

  build({ THREE, MAT, geom, label, readout }) {
    const { mesh, group, part, cyl, box, lathe, springGeometry, arrow } = geom;
    const root = new THREE.Group();

    // ---------- sàn nhà (cố định) ----------
    const floor = mesh(box(150, 4, 70), MAT.plasticGrey.clone(), { x: 15, y: -2 });
    floor.material.color.set(0x9c8466);
    root.add(part(floor, 'Sàn nhà (gỗ)', 'Bánh xe tì lên sàn; sàn đỡ ngược lại một lực bằng lực lò xo ép bánh xuống.'));

    // ---------- khung robot (di chuyển lên xuống theo h) ----------
    const chassis = new THREE.Group();
    root.add(chassis);
    const plate = mesh(box(120, 3, 70, 1), MAT.plasticDark, { x: 15, y: 30, z: -5 });
    chassis.add(part(plate, 'Vỏ đáy robot (một mảnh cắt ra)', 'Nhựa ABS dày 2.5–3 mm. Module bánh xe bắt vít vào các cột nhựa trên vỏ đáy.'));
    const brk = group(
      mesh(box(10, 30, 4), MAT.plasticDark, { x: 0, y: 14, z: ZA - 8 }),
      mesh(cyl(3.2, 3.2, 26, 24), MAT.steel, { z: ZA + 2, rx: Math.PI / 2 }),
    );
    chassis.add(part(brk, 'Giá đỡ + chốt xoay tay đòn', 'Trục thép Ø3 mm xuyên qua tay đòn. Thường trùng với trục động cơ/hộp số để xích truyền không bị căng chùng khi bánh lên xuống.'));
    const seat = group(
      mesh(cyl(6.5, 6.5, 2, 32), MAT.plasticDark, { x: A[0], y: A[1] + 1, z: ZA }),
      mesh(box(14, A[1] - 28 > 0 ? 6 : 7, 10), MAT.plasticDark, { x: A[0], y: (A[1] + 30) / 2 + 1, z: ZA }),
    );
    chassis.add(part(seat, 'Đế tựa lò xo trên khung', 'Lò xo tựa đầu trên vào đây, đầu dưới ép lên tay đòn.'));
    const stopTop = mesh(box(10, 4, 8), MAT.rubber, { x: 40, y: 21, z: ZA });
    chassis.add(part(stopTop, 'Cữ chặn trên (cao su)', 'Khi lò xo quá mềm hoặc robot quá nặng, tay đòn tì vào đây — gọi là "chạm đáy" (bottom out).'));

    // công tắc nhấc bánh (micro-switch KW10) — nằm trên đuôi tay đòn, cần gạt hướng xuống
    const sw = new THREE.Group();
    sw.position.set(-14, LEVER_REST_Y + 6.5, ZA);
    const swBody = mesh(box(12.8, 6.5, 5.8, 0.4), MAT.plasticBlack);
    const swBtn = mesh(box(1.6, 1.2, 2.2), MAT.plasticRed, { x: -2, y: -3.6 });
    const pins = group(...[-5, 0, 5].map((x) => mesh(box(0.5, 4, 3), MAT.brass, { x, y: 5 })));
    const lever = new THREE.Group();
    lever.position.set(5.5, -3.4, 0);
    const leverBar = mesh(box(13, 0.4, 4), MAT.steel, { x: -6.5 });
    lever.add(leverBar);
    sw.add(part(group(swBody, swBtn), 'Công tắc nhấc bánh (micro-switch)', 'Công tắc hành trình mini 12.8×5.8×6.5 mm, lực tác động ~0.5 N. Nối COM–NO giữa chân RB1 và GND.'));
    sw.add(part(lever, 'Cần gạt công tắc', 'Lá thép đàn hồi; đuôi tay đòn ấn lên cần → nút đỏ lún → tiếp điểm đóng.'));
    sw.add(part(pins, 'Chân công tắc COM / NO / NC', 'Dùng COM + NO: hở khi chưa ấn, đóng khi bánh thõng.'));
    chassis.add(sw);
    const ledMat = MAT.glow.clone();
    const led = mesh(cyl(1.6, 1.6, 2, 16), ledMat, { x: -14, y: 20, z: ZA });
    chassis.add(part(led, 'Đèn báo RB1 = 0 (minh họa)', 'Sáng khi công tắc đóng → chân RB1 bị kéo xuống 0 V → PIC hiểu là "bánh trái bị nhấc".'));
    label(chassis, 'Công tắc nhấc bánh → RB1', [-30, 26, ZA]);
    label(chassis, 'Lò xo nén', [A[0] + 12, A[1] - 8, ZA]);

    // ---------- tay đòn + bánh xe (xoay quanh chốt) ----------
    const arm = new THREE.Group();
    arm.position.z = ZA;
    chassis.add(arm);
    const armBar = group(
      mesh(box(LW + LT + 6, 7, 6, 1.5), MAT.plasticGrey, { x: (LW - LT) / 2 }),
      mesh(cyl(5.5, 5.5, 7, 24), MAT.plasticGrey, { rx: Math.PI / 2 }),
      mesh(cyl(5.5, 5.5, 7, 24), MAT.plasticGrey, { x: LW, rx: Math.PI / 2 }),
      mesh(cyl(4.5, 4.5, 2, 24), MAT.plasticGrey, { x: LS, y: 4 }),
    );
    arm.add(part(armBar, 'Tay đòn bánh xe (trailing arm)', `Nhựa POM/PA66 cứng. Chốt xoay ở gốc, bánh ở đầu cách chốt ${LW} mm, lò xo tì ở ${LS} mm. Đuôi sau chốt dài ${LT} mm để ấn công tắc.`));
    // bánh xe (trục Z)
    const wheel = new THREE.Group();
    wheel.position.set(LW, 0, -ZA);
    const tyreGeo = lathe([[29, -10], [33.5, -10], [35, -8], [35, 8], [33.5, 10], [29, 10]], 64);
    tyreGeo.rotateX(Math.PI / 2);
    const tyre = mesh(tyreGeo, MAT.rubber);
    const tread = new THREE.Group();
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2;
      for (const sgn of [1, -1]) {
        // gai chữ V: xoay quanh trục hướng kính (rx) TRƯỚC rồi mới đặt theo góc a (rz) → thứ tự 'ZYX'
        const b = mesh(box(3, 1.4, 8), MAT.rubber, { x: Math.cos(a) * 35.3, y: Math.sin(a) * 35.3, z: sgn * 4.5, rz: a, rx: sgn * 0.5 });
        b.rotation.order = 'ZYX';
        tread.add(b);
      }
    }
    wheel.add(part(group(tyre, tread), 'Lốp cao su có gai (Ø70 mm)', 'Gai chữ V giúp bám thảm và đẩy rác ra hai bên. Lực bám tối đa = μ × lực ép của lò xo.'));
    const hub = group(
      mesh(cyl(29, 29, 18, 48), MAT.plasticWhite, { rx: Math.PI / 2 }),
      mesh(cyl(6, 6, 22, 24), MAT.plasticGrey, { rx: Math.PI / 2 }),
    );
    wheel.add(part(hub, 'La-zăng nhựa + moay-ơ', 'Bắt vào trục ra của hộp số bằng chốt hoặc rãnh D.'));
    arm.add(wheel);

    // ---------- lò xo (giữa đế trên khung và tay đòn) ----------
    const springMat = MAT.steel.clone();
    const spring = mesh(springGeometry({ radius: 4.5, wire: 0.5, turns: 8, length: L0 }), springMat);
    chassis.add(part(spring, 'Lò xo nén (dây Ø1.0 mm, k ≈ 2.2 N/mm)', 'Thép lò xo. Càng nén càng đẩy mạnh: F = k·x. Phát sáng cam khi bị nén nhiều (ứng suất cao).'));

    // ---------- mũi tên lực ----------
    const arrows = new THREE.Group();
    root.add(arrows);
    const arSpring = arrow([0, 0, 0], [0, -10, 0], 0xffaa33, 4);
    const arFloor = arrow([0, 0, 0], [0, 10, 0], 0x3fcf8e, 4);
    const arWeight = arrow([0, 0, 0], [0, -10, 0], 0xff5a5a, 4);
    arrows.add(arSpring, arFloor, arWeight);
    const upV = new THREE.Vector3(0, 1, 0), downV = new THREE.Vector3(0, -1, 0);
    arSpring.setDirection(downV); arFloor.setDirection(upV); arWeight.setDirection(downV);

    // ---------- trạng thái mô phỏng ----------
    let h = 5, hv = 0, s = 5, prevLift = false;
    let fault = null, step = -1, stepPos = 0, flyT = 0;
    const tmpV = new THREE.Vector3();

    // F_bánh(s) theo công ảo — tính trên đúng hình học đang vẽ
    const fWheel = (ss, k) => {
      const L = springLen(ss);
      const x = Math.max(0, L0 - L);
      const dLds = (springLen(Math.min(S_MAX, ss + 0.05)) - springLen(Math.max(0, ss - 0.05))) / (Math.min(S_MAX, ss + 0.05) - Math.max(0, ss - 0.05));
      return k * x * Math.abs(dLds);
    };
    const solveEq = (W, k) => {      // tìm s sao cho F_bánh(s) = W (F_bánh giảm khi s tăng)
      if (fWheel(0, k) < W) return 0;          // chạm đáy
      if (fWheel(S_MAX, k) > W) return S_MAX;
      let lo = 0, hi = S_MAX;
      for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; fWheel(m, k) > W ? (lo = m) : (hi = m); }
      return (lo + hi) / 2;
    };

    return {
      object: root,
      onAction(id) {
        if (id === 'drop') { h = S_MAX + 20; hv = 0; }
      },
      setStep(i) { step = i; },
      triggerFault(id) { fault = id; flyT = id === 'lo-xo-mat' ? 1.2 : 0; },
      resetFault() { fault = null; flyT = 0; spring.position.z = ZA; spring.visible = true; },
      update(dt, t, p) {
        const share = Math.max(0.05, (1 - p.cg / BASE) / 2);
        const W = p.mass * G * share;           // tải tĩnh trên bánh (N)
        const M = W / G;                        // khối lượng quy về bánh (kg)
        // tháo lắp: bước ≥1 robot nằm ngửa (coi như nhấc), bước 3–4 lò xo đã lấy ra
        stepPos += (Math.max(0, step) - stepPos) * Math.min(1, dt * 4);
        const springOut = Math.max(0, Math.min(1, stepPos - 2)) * (step >= 5 ? 0 : 1);
        const lifted = p.lift || (step >= 1 && step <= 4);
        let k = p.k;                            // N/mm
        if (fault === 'lo-xo-cung') k = 9;
        if (fault === 'lo-xo-moi') k = p.k * 0.55;
        const noSpring = fault === 'lo-xo-mat' || springOut > 0.5;
        if (noSpring) k = 0;
        const sEq = solveEq(W, Math.max(k, 1e-3));
        if (prevLift && !lifted) hv = 0;
        prevLift = lifted;

        let contactF = 0;
        const n = 20, hh = dt / n;
        for (let i = 0; i < n; i++) {
          if (lifted) {
            h += (LIFT_H - h) * Math.min(1, 4 * hh); hv = 0;
            // không có lò xo: tay đòn chỉ rơi nhờ trọng lượng bánh, bị ma sát chốt + dây động cơ giữ lại ở ~14 mm
            s += (Math.min(noSpring ? 14 : S_MAX, h) - s) * Math.min(1, (noSpring ? 6 : 30) * hh);
            contactF = 0;
          } else if (h <= S_MAX && s >= h - 0.5) {
            // bánh chạm sàn: s = h
            s = Math.max(0, h);
            contactF = fWheel(s, k);
            const acc = (contactF - M * G - p.c * hv / 1000) / M * 1000;   // mm/s²
            hv += acc * hh; h += hv * hh;
            if (h < 0) { h = 0; hv = Math.max(0, hv); contactF = M * G; }   // chạm đáy: cữ chặn gánh tải
            // tay đòn chạm cữ dưới: lò xo không duỗi thêm được — nếu đang bật lên nhanh thì bay khỏi sàn, nếu không thì đứng yên trên cữ
            if (h > S_MAX && hv < 60) { h = S_MAX; hv = 0; contactF = M * G; }
          } else {
            // đang bay: rơi tự do, bánh thõng xuống nhanh (khối lượng tay đòn nhỏ)
            hv -= G * 1000 * hh; h += hv * hh;
            s += (Math.min(noSpring ? 14 : S_MAX, h) - s) * Math.min(1, 30 * hh);
            contactF = 0;
          }
        }

        // ---------- vẽ ----------
        const phi = phiOf(s);
        arm.rotation.z = phi;
        chassis.position.y = R_WHEEL + h - Y_TOP;
        const L = springLen(s);
        const b = armPt(s, LS);
        spring.scale.y = noSpring ? 1 : (L - 2) / L0;
        spring.position.set((A[0] + b[0]) / 2, (A[1] + b[1] + 4) / 2, ZA);
        if (springOut > 0) { spring.position.z = ZA - 45 * springOut; spring.position.y += 25 * springOut; }
        if (fault === 'lo-xo-mat') {        // lò xo bắn văng ra khỏi khung rồi biến mất
          flyT = Math.max(0, flyT - dt);
          const u = 1.2 - flyT;
          spring.position.x += 160 * u; spring.position.y += 120 * u - 200 * u * u; spring.rotation.z = u * 12;
          spring.visible = flyT > 0;
        }
        tmpV.set(A[0] - b[0], A[1] - b[1], 0).normalize();
        spring.quaternion.setFromUnitVectors(upV, tmpV);
        const x = noSpring ? 0 : Math.max(0, L0 - L);
        const fs = k * x;
        const stress = Math.min(1, x / 20);
        spring.material.emissive.setRGB(stress * 0.9, stress * 0.35, 0);
        spring.material.emissiveIntensity = 0.6;

        // công tắc: đuôi tay đòn đẩy cần lên
        const push = Math.max(0, tailY(s) - LEVER_REST_Y);
        lever.rotation.z = -Math.min(push, 2.2) / 11;
        const pressed = push >= SW_OP;
        led.material.emissiveIntensity = pressed ? 1.6 : 0;
        led.material.color.set(pressed ? 0xffd34d : 0x555555);

        // mũi tên lực (theo tỉ lệ 1 N = 1 mm)
        arrows.visible = p.forces;
        const cy = chassis.position.y;
        arSpring.position.set(A[0], cy + A[1] + 2, ZA - 14);
        arSpring.setLength(Math.max(1, fs * 0.8), 4, 3);
        const wx = LW * Math.cos(phi);
        arFloor.position.set(wx, -contactF * 0.8 - 1, 6);
        arFloor.setLength(Math.max(0.01, contactF * 0.8), Math.min(4, contactF * 0.4 + 0.01), 3);
        arFloor.visible = contactF > 0.2;
        arWeight.position.set(25, cy + 60, 15);
        arWeight.setLength(Math.max(1, W * 0.8), 4, 3);

        const kw = Math.abs(fWheel(Math.max(0.5, sEq - 0.5), k) - fWheel(Math.min(S_MAX - 0.5, sEq + 0.5), k)) * 1000;  // N/m
        const fn = kw > 0 ? Math.sqrt(kw / M) / (2 * Math.PI) : 0;
        const zeta = kw > 0 ? p.c / (2 * Math.sqrt(kw * M)) : 0;
        readout('load', W);
        readout('fs', fs);
        readout('x', x);
        readout('s', s);
        readout('fn', fn);
        readout('zeta', zeta);
        let st = pressed ? '0 V — BÁNH BỊ NHẤC → dừng động cơ' : (sEq <= 0.01 && !lifted ? '5 V (⚠ lò xo quá mềm: chạm đáy)' : '5 V — bình thường');
        if (pressed && !lifted) st = '0 V — ⚠ đang trên sàn mà vẫn báo nhấc!';
        if (!pressed && lifted && s > 5) st = '5 V — ⚠ bị nhấc mà KHÔNG báo!';
        readout('rb1', st);
        return [x, contactF, pressed ? 0 : 5];
      },
    };
  },
};
