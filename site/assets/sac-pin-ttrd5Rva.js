const n=`// 🔌 Sạc pin CC/CV — bộ sạc 16.8 V / 2 A cho pack 4S qua đế sạc (dock) và 2 tiếp điểm dưới đáy robot.
// Mô phỏng: tiền sạc (pre-charge) → dòng không đổi (CC) → áp không đổi (CV) → ngắt khi dòng < C/10;
// ước tính thời gian sạc, ảnh hưởng của điện trở tiếp điểm bẩn, nhiệt ở tiếp điểm.

const V_CV = 16.8;         // điện áp CV của bộ sạc 4S (V)
const R_CELL = 0.020;      // nội trở 1 cell 2.5 Ah (Ω)
const R_FIXED = 0.01 + 0.05 + 0.02;   // BMS + dây dock 1 m + MOSFET chống ngược (Ω)
const V_PRE = 12.0;        // dưới mức này chỉ tiền sạc 0.1C (3.0 V/cell)
const T_AMB = 30;
const R_POL = 0.04, TAU_POL = 600;   // phân cực khuếch tán mỗi cell 2.5 Ah: 40 mΩ, hằng số thời gian ~10 phút

const OCV_T = [[-8, 2.0], [0, 3.0], [5, 3.30], [10, 3.45], [20, 3.56], [30, 3.63], [40, 3.69], [50, 3.75],
  [60, 3.83], [70, 3.92], [80, 4.00], [90, 4.09], [100, 4.20], [106, 4.60]];
function ocv(s) {
  if (s <= OCV_T[0][0]) return OCV_T[0][1];
  for (let i = 1; i < OCV_T.length; i++) {
    const [s1, v1] = OCV_T[i];
    if (s <= s1) { const [s0, v0] = OCV_T[i - 1]; return v0 + ((v1 - v0) * (s - s0)) / (s1 - s0); }
  }
  return OCV_T[OCV_T.length - 1][1];
}

// Một bước mô phỏng bộ sạc: trả về { I, Vchg, phase }. vp = điện áp phân cực (khuếch tán ion) của pack.
function chargerStep(soc, capAh, icc, rTot, cvTarget = V_CV, vp = 0) {
  const E = 4 * ocv(soc) + vp;
  if (4 * ocv(soc) < V_PRE) return { I: 0.1 * capAh, Vchg: E + 0.1 * capAh * rTot, phase: 'pre' };
  const iCv = (cvTarget - E) / rTot;
  if (iCv >= icc) return { I: icc, Vchg: E + icc * rTot, phase: 'cc' };
  const I = Math.max(0, iCv);
  return { I, Vchg: cvTarget, phase: 'cv' };
}
// Cập nhật điện áp phân cực: dvp/dt = I/Cp − vp/τ  (Rp_pack = 4·R_POL·2.5/C)
function polStep(vp, I, capAh, dtSim) {
  const rp = 4 * R_POL * (2.5 / capAh);
  const a = Math.exp(-dtSim / TAU_POL);
  return I * rp + (vp - I * rp) * a;
}

export default {
  id: 'sac-pin',
  name: 'Sạc pin CC/CV & đế sạc',
  category: 'nguon',
  order: 4,
  icon: '🔌',
  summary: 'Bộ sạc 16.8 V / 2 A nạp pack 4S theo 2 pha: dòng không đổi (CC) rồi áp không đổi (CV). Xem đồ thị điện áp/dòng như bộ sạc thật, ước tính thời gian sạc, và vì sao tiếp điểm dock bẩn làm sạc mãi không đầy.',
  tags: ['sạc', 'charger', 'CC/CV', 'dock', 'đế sạc', '16.8V', 'Li-ion', 'tiếp điểm'],

  params: [
    { id: 'dock', label: 'Robot đã vào dock (2 tiếp điểm chạm)', type: 'toggle', value: true },
    { id: 'soc0', label: 'SOC lúc bắt đầu sạc', type: 'range', min: 0, max: 100, step: 1, value: 10, unit: '%' },
    { id: 'icc', label: 'Dòng sạc CC của bộ sạc', type: 'range', min: 0.5, max: 3, step: 0.1, value: 2, unit: 'A', hint: '0.5C–1C là an toàn cho 18650: 1.25–2.5 A với pack 2.5 Ah.' },
    { id: 'cap', label: 'Pack', type: 'select', value: '2.5', options: [['2.5', '4S1P — 2.5 Ah (36 Wh)'], ['5', '4S2P — 5.0 Ah (72 Wh)']] },
    { id: 'rc', label: 'Điện trở tiếp điểm dock', type: 'range', min: 0.02, max: 2, step: 0.01, value: 0.05, unit: 'Ω', hint: 'Sạch: 0.02–0.05 Ω. Bụi/ôxi hóa: 0.5–2 Ω.' },
    { id: 'speed', label: 'Tua nhanh thời gian', type: 'range', min: 10, max: 1200, step: 10, value: 300, unit: '×' },
    { id: 'restart', label: '↺ Bắt đầu sạc lại từ SOC ban đầu', type: 'button' },
  ],
  readouts: [
    { id: 'phase', label: 'Pha sạc / đèn bộ sạc', unit: '' },
    { id: 'vchg', label: 'Áp đầu ra bộ sạc', unit: 'V' },
    { id: 'vpack', label: 'Áp thật trên pack', unit: 'V' },
    { id: 'i', label: 'Dòng sạc', unit: 'A' },
    { id: 'soc', label: 'SOC', unit: '%' },
    { id: 'time', label: 'Đã sạc / còn lại (ước tính)', unit: '' },
    { id: 'wh', label: 'Năng lượng đã nạp', unit: 'Wh' },
    { id: 'pc', label: 'Nhiệt ở tiếp điểm I²·R', unit: 'W' },
  ],
  scope: {
    window: 10,
    note: '(tua nhanh theo thanh "Tua nhanh": 300× → 1 giây màn hình = 5 phút)',
    channels: [
      { name: 'V bộ sạc', unit: 'V', min: 10, max: 22, color: '#ffd34d' },
      { name: 'V pack', unit: 'V', min: 10, max: 22, color: '#ff6b9a' },
      { name: 'Dòng', unit: 'A', min: 0, max: 3.2, color: '#4cc2ff' },
      { name: 'SOC', unit: '%', min: 0, max: 110, color: '#3fcf8e' },
    ],
  },

  info: {
    overview: \`
      <p>Pin Li-ion <b>không</b> sạc kiểu "cắm điện áp cố định là xong". Bộ sạc chuẩn làm 2 pha:</p>
      <ol>
        <li><b>CC — Constant Current (dòng không đổi)</b>: giữ dòng 2 A, điện áp pack tăng dần từ ~13 V lên 16.8 V. Pha này nạp ~70–80 % dung lượng.</li>
        <li><b>CV — Constant Voltage (áp không đổi)</b>: giữ đúng 16.8 V (4.20 V/cell), dòng tự giảm dần. Khi dòng &lt; 0.1C (0.2–0.25 A) → báo đầy, ngắt.</li>
      </ol>
      <p>Robot hút bụi tự lùi về <b>đế sạc (dock)</b>: 2 tấm tiếp điểm lò xo trên dock chạm 2 tấm kim loại dưới đáy robot.</p>
      <p>Thử: để mặc định và xem đồ thị — đường vàng phẳng ở 16.8 V là lúc chuyển sang CV, đường xanh dương bắt đầu giảm. Rồi tăng <b>điện trở tiếp điểm</b> lên 1 Ω: CV đến sớm hơn, sạc lâu hơn hẳn và ngắt khi pin chưa đầy.</p>\`,
    specs: [
      ['Bộ sạc', 'Adapter Li-ion 4S: Output 16.8 V ±1 %, 2 A, có CC/CV + đèn đỏ (đang sạc) / xanh (đầy)'],
      ['Ngưỡng ngắt', 'Dòng &lt; ~0.1C (0.2 A) → đèn xanh; nhiều adapter rẻ vẫn giữ 16.8 V (không ngắt hẳn)'],
      ['Tiền sạc', 'Pack &lt; 12.0 V (3.0 V/cell): bộ sạc tốt chỉ cho 0.1C để "đánh thức" cell'],
      ['Thời gian', '≈ C/I × 1.2–1.4: 2.5 Ah / 2 A → khoảng 1.5–1.8 giờ (CV chiếm ~30–40 phút)'],
      ['Tiếp điểm dock', 'Thép không gỉ/đồng thau mạ niken, lò xo ép 2–5 N; điện trở tốt &lt; 50 mΩ'],
      ['Nhiệt độ sạc', '0–45 °C. Dưới 0 °C cấm sạc (lithium plating)'],
    ],
    principle: \`
      <h4>1. Mô hình</h4>
      <p>Pack = nguồn <code>E = 4·OCV(SOC)</code> nối tiếp <code>R_tổng = 4·R_cell + R_BMS + R_dây + R_tiếp_điểm</code>, cộng thêm áp <b>phân cực</b> <code>V_p</code> (ion khuếch tán chậm, mô hình RC: R_p ≈ 40 mΩ/cell, τ ≈ 10 phút) — chính V_p làm pha CV kéo dài 30–45 phút. Bộ sạc chỉ đo được áp <b>ở đầu ra của chính nó</b>.</p>
      <ul>
        <li>CC: <code>I = I_cc</code>, áp bộ sạc <code>V = E + I·R_tổng</code> tăng dần.</li>
        <li>Khi <code>E + I_cc·R_tổng</code> chạm 16.8 V → CV: <code>I = (16.8 − E)/R_tổng</code>, giảm dần khi E tăng.</li>
        <li>Ngắt khi <code>I &lt; 0.1·C</code>.</li>
      </ul>
      <h4>2. Vì sao phải có CV?</h4>
      <p>Nếu cứ ép dòng 2 A tới khi áp 16.8 V rồi ngắt, phần <code>I·R ≈ 2 × 0.15 = 0.3 V</code> là "áp ảo" do điện trở: pin thật chỉ ~16.5 V (~85 %). Pha CV cho dòng giảm dần để áp thật trên cell bắt kịp 4.20 V mà không vượt.</p>
      <h4>3. Thời gian sạc</h4>
      <p><code>t_CC ≈ (SOC_cv − SOC_đầu) × C / I_cc</code>; <code>t_CV</code> ≈ 30–45 phút gần như không đổi (hằng số thời gian <code>τ ≈ R·C_tương_đương</code>). Tăng dòng chỉ rút ngắn pha CC.</p>
      <h4>4. Tiếp điểm bẩn</h4>
      <p>R_tiếp_điểm tăng → bộ sạc vào CV sớm (vì áp của nó chạm 16.8 V sớm) → dòng nhỏ → lâu; tiếp điểm nóng <code>P = I²·R</code>; và có thể ngắt khi pack mới ~90 %.</p>\`,
    inRobot: \`
      <ul>
        <li>Dock nối adapter 16.8 V. Dưới robot: 2 tiếp điểm → <b>cầu chì</b> → MOSFET chống ngược (ideal diode) → P+/P− của pack 4S + BMS (xem <i>Pack 4S + BMS</i>).</li>
        <li>Không dùng diode Schottky thường nối tiếp: mất 0.4 V → bộ sạc 16.8 V chỉ nạp pin tới ~16.4 V (~85 %).</li>
        <li>Tiếp điểm robot luôn "sống" (nối với pin) nếu không có chống ngược — robot đi qua thanh nẹp kim loại có thể chập!</li>
        <li>PIC đo pin (AN0, phân áp 33k/10k): khi đang sạc, áp đo được cao hơn áp thật do <code>I·R</code> — firmware nên đọc khi dòng nhỏ. ESP32 báo <code>S,…,bat%,vbat_mv</code> lên app theo công thức <code>(vbat − 12800)/(16600 − 12800)</code> (docs/02).</li>
      </ul>\`,
    mistakes: \`
      <ul>
        <li>Dùng adapter 19 V của laptop "cho nhanh" → không có CC/CV, không ngắt → quá sạc, chỉ còn BMS cứu.</li>
        <li>Dùng sạc 12.6 V (3S) → pin chỉ đầy ~30 %; dùng sạc 21 V (5S) → quá sạc.</li>
        <li>Lau tiếp điểm bằng giấy nhám thô → mất lớp mạ, gỉ nhanh hơn. Dùng cồn IPA + giẻ mềm.</li>
        <li>Đặt dock trên thảm dày, robot không áp sát → tiếp xúc chập chờn, bộ sạc liên tục khởi động lại.</li>
        <li>Đo "16.8 V" ở đầu adapter khi không tải rồi kết luận pin đầy — phải đo trên pack khi dòng ~0.</li>
      </ul>\`,
    quiz: [
      { q: 'Pack 2.5 Ah bắt đầu sạc ở 10 % với 2 A. Ước tính thời gian pha CC và tổng thời gian?', a: 'CC tới ~80 %: 0.7 × 2.5/2 ≈ 0.9 h; thêm CV ~0.5 h → tổng ≈ 1.4 h (công thức nhanh C/I × 1.2–1.4).' },
      { q: 'Vì sao khi tiếp điểm bẩn thì bộ sạc vào pha CV sớm hơn?', a: 'Vì áp bộ sạc = E + I·R_tổng; R_tổng lớn thì áp này chạm 16.8 V khi E (áp pin thật) còn thấp.' },
      { q: 'Đang CV ở 16.8 V, dòng 0.5 A, R_tổng = 0.2 Ω. Áp thật trên pack bao nhiêu?', a: 'E = 16.8 − 0.5 × 0.2 = 16.7 V.' },
    ],
  },

  steps: [
    { title: 'Bước 1 — Kiểm tra nhãn bộ sạc', text: 'Nhãn phải ghi <b>Output 16.8 V DC, 2 A, Li-ion</b> (4S). Đo không tải bằng đồng hồ: 16.7–16.9 V. Đèn đỏ khi có tải, xanh khi đầy. Không dùng adapter laptop/LED.' },
    { title: 'Bước 2 — Đấu dây vào dock', text: 'Jack DC 5.5/2.1 mm (tâm dương) → 2 tiếp điểm lò xo trên dock: đỏ = +, đen = −. Dùng dây 20 AWG, hàn + co nhiệt. <b>Đo lại cực tính tại 2 tấm tiếp điểm</b> trước khi cho robot vào.' },
    { title: 'Bước 3 — Tiếp điểm lò xo trên dock', text: 'Tấm đồng thau mạ niken uốn cong, nhô ~3 mm, lực ép 2–5 N. Hai tiếp điểm cách nhau đủ xa (~50 mm) và có vách nhựa ngăn để vật kim loại khó chạm cả hai.' },
    { title: 'Bước 4 — Phía robot: tiếp điểm → cầu chì → chống ngược → pack', text: 'Hai tấm thép không gỉ dưới đáy robot. Nối qua cầu chì 3 A và MOSFET chống ngược (ideal diode) tới P+/P− của BMS. Kiểm tra: khi robot rời dock, 2 tấm phải ~0 V (không "sống").' },
    { title: 'Bước 5 — Robot lùi vào dock', text: 'Robot dò tín hiệu IR của dock rồi lùi thẳng vào. Hai tấm phải chạm cả 2 tiếp điểm cùng lúc; ESP32 phát hiện có áp sạc → dừng động cơ, báo "đang sạc".' },
    { title: 'Bước 6 — Theo dõi lần sạc đầu tiên', text: 'Đo dòng (CC ~2 A), sờ tiếp điểm & pack sau 15 phút (&lt; 45 °C), xem chuyển sang CV ở 16.8 V và đèn xanh. Ghi lại thời gian sạc để so sánh khi pin già.' },
  ],

  faults: [
    { id: 'bms-hong-sac-21v', label: 'Sạc nhầm adapter 21 V (5S) khi MOSFET BMS đã chập', severity: 'chay',
      what: '<p>Đèn bộ sạc mãi đỏ, pack ấm dần, cell yếu nhất phồng và bốc khói sau khoảng 1–2 giờ, rồi phun lửa.</p>',
      why: '<p>Adapter 21 V giữ CC 2 A cho tới khi pack đạt 21 V = 5.25 V/cell. Bình thường BMS ngắt ở 4.25 V/cell, nhưng kiểu hỏng phổ biến của MOSFET là <b>chập (short)</b> → không còn ai ngắt. Trên 4.3 V: lithium plating, cực dương nhả oxy, điện phân phân hủy → thermal runaway.</p>',
      fix: '<p>Đầu nối sạc riêng cho từng loại pin (khác cỡ jack), dán nhãn điện áp. Firmware/ESP32 đo áp sạc: &gt; 17.2 V thì tắt MOSFET sạc riêng. Kiểm tra BMS định kỳ (đo ngưỡng ngắt bằng nguồn chỉnh được).</p>' },
    { id: 'nguoc-cuc-dock', label: 'Dock đấu ngược cực (+/−)', severity: 'no',
      what: '<p>Robot vừa chạm dock: tia lửa ở tiếp điểm, adapter kêu "tạch" và có mùi khét; tụ trong adapter có thể phồng. Robot không sạc.</p>',
      why: '<p>Adapter và pack mắc nối tiếp cùng chiều trong vòng kín: <code>16.8 + 16.8 = 33.6 V</code> đặt lên điện trở vòng rất nhỏ → dòng lớn qua diode ngược/MOSFET bảo vệ. Tụ hóa đầu ra adapter chịu áp ngược 16.8 V → sinh khí. Nhờ MOSFET chống ngược + cầu chì phía robot mà pack an toàn; nếu thiếu → BMS ngắt đoản mạch.</p>',
      fix: '<p>Đo cực tính tại tiếp điểm trước lần đầu; chống ngược (ideal diode) phía robot; cầu chì 3 A; jack DC tâm dương đúng chuẩn.</p>' },
    { id: 'tiep-diem-ban', label: 'Tiếp điểm dock bẩn/ôxi hóa (2 Ω)', severity: 'loi',
      what: '<p>Robot "đứng sạc cả đêm" mà app vẫn báo 85–90 %; nhựa quanh tiếp điểm có vết ố nâu, tiếp điểm ấm tay.</p>',
      why: '<p>R_tổng ≈ 2.2 Ω: bộ sạc thấy 16.8 V ở đầu ra khi pin mới ~14.5 V → vào CV rất sớm, dòng chỉ <code>(16.8 − 15)/2.2 ≈ 0.8 A</code> rồi giảm dần; tiếp điểm tỏa <code>I²R ≈ 1.3 W</code> trên mảnh kim loại nhỏ. Dòng tụt dưới 0.2 A khi pin chưa đầy → bộ sạc báo xanh.</p>',
      fix: '<p>Lau tiếp điểm bằng cồn IPA mỗi tháng, kiểm tra lực lò xo, đo sụt áp tiếp điểm khi đang sạc (&lt; 0.1 V ở 2 A).</p>' },
    { id: 'cham-tiep-diem', label: 'Robot đè lên nẹp kim loại chạm 2 tiếp điểm (không có chống ngược)', severity: 'hong',
      what: '<p>Tia lửa dưới gầm, robot tắt ngúm giữa nhà; tiếp điểm có vết rỗ cháy, nẹp kim loại nóng.</p>',
      why: '<p>Nếu tiếp điểm nối thẳng vào P+/P−, chúng luôn có 14–16.8 V. Vật kim loại chạm cả 2 → đoản mạch pack, dòng tiềm năng &gt; 100 A; BMS ngắt sau ~300 µs, nhưng tia hồ quang đủ làm rỗ bề mặt tiếp điểm (tăng điện trở → sạc kém về sau).</p>',
      fix: '<p>MOSFET chống ngược/ideal diode (chỉ cho dòng đi VÀO pack) hoặc MOSFET sạc chỉ bật khi phát hiện áp dock; tiếp điểm lõm vào vỏ.</p>' },
    { id: 'sac-lanh', label: 'Sạc khi pin lạnh dưới 0 °C (gara mùa đông)', severity: 'hong',
      what: '<p>Không thấy gì bất thường ngay. Sau vài chục lần như vậy, dung lượng tụt mạnh, nội trở tăng, có nguy cơ đoản mạch trong.</p>',
      why: '<p>Lạnh làm Li⁺ khó chui vào than chì; ở dòng 2 A (0.8C) chúng bám thành <b>lithium kim loại</b> trên bề mặt (plating) — mất lithium vĩnh viễn và có thể mọc nhánh xuyên màng ngăn.</p>',
      fix: '<p>Gắn NTC 10k vào pack; ESP32/BMS cấm sạc dưới 0–5 °C, giảm dòng còn 0.1–0.2C dưới 10 °C.</p>' },
  ],

  build({ THREE, MAT, geom, label, readout, fx }) {
    const { mesh, group, part, cyl, box, wire, pcb } = geom;
    const root = new THREE.Group();

    // ---------- adapter sạc ----------
    const adapter = new THREE.Group();
    adapter.position.set(-120, 0, -20);
    adapter.add(mesh(box(85, 32, 50, 3), MAT.plasticBlack, { y: 16 }));
    adapter.add(mesh(box(60, 0.3, 30), MAT.plasticDark, { y: 32.2 }));
    const ledMat = new THREE.MeshStandardMaterial({ color: 0x331111, emissive: 0xff2020, emissiveIntensity: 1 });
    const ledA = mesh(cyl(1.6, 1.6, 1.2, 16), ledMat, { x: 30, y: 32.6, z: 15 });
    adapter.add(ledA);
    root.add(part(adapter, 'Adapter sạc Li-ion 4S 16.8 V / 2 A', 'Bên trong: nguồn xung flyback + IC điều khiển CC/CV. LED đỏ = đang sạc (CC/CV), xanh = dòng < ~0.2 A (đầy).'));
    const acCord = wire([[-162, 16, -20], [-190, 10, -20], [-210, 4, -30]], { radius: 2.5, color: 0x1a1a1a });
    root.add(part(acCord, 'Dây AC 220 V', 'Điện lưới — chỉ đi vào adapter, robot không bao giờ chạm 220 V.'));
    label(root, 'Adapter 16.8 V 2 A', [-120, 42, -20]);

    // ---------- dock ----------
    const dock = new THREE.Group();
    root.add(dock);
    dock.add(mesh(box(150, 10, 90, 3), MAT.plasticWhite, { y: 5 }));
    dock.add(mesh(box(150, 70, 22, 4), MAT.plasticWhite, { y: 35, z: -34 }));
    dock.add(mesh(box(40, 14, 1), MAT.plasticBlack, { y: 52, z: -22.9 }));
    part(dock, 'Đế sạc (dock)', 'Phía trên có cửa sổ đen phát tín hiệu hồng ngoại để robot dò đường về. Hai tiếp điểm lò xo ở mặt trên đế.');
    const dcCable = wire([[-77, 16, -20], [-90, 4, -10], [-75, 4, -30], [-60, 8, -34]], { radius: 1.6, color: 0x111111 });
    root.add(part(dcCable, 'Dây DC 16.8 V tới dock', 'Jack 5.5/2.1 mm tâm dương. Bên trong dock nối tới 2 tiếp điểm lò xo.'));
    const contactsD = [];
    for (const [sx, nm] of [[-25, '+'], [25, '−']]) {
      const c = new THREE.Group();
      c.add(mesh(box(14, 1.2, 22), MAT.brass.clone(), { y: 10.8, z: 18 }));
      c.add(mesh(new THREE.TorusGeometry(4, 0.6, 8, 20, Math.PI), MAT.brass, { y: 11, z: 30, ry: Math.PI / 2 }));
      c.position.x = sx;
      dock.add(part(c, \`Tiếp điểm lò xo dock (\${nm})\`, 'Đồng thau mạ niken uốn cong làm lò xo, ép 2–5 N lên tấm dưới robot. Phải sạch, không ôxi hóa.'));
      contactsD.push(c);
    }
    dock.add(mesh(box(4, 6, 22), MAT.plasticWhite, { y: 13, z: 18 }));
    label(dock, 'Tiếp điểm +', [-25, 20, 26]);
    label(dock, 'Tiếp điểm −', [25, 20, 26]);

    // ---------- robot (một phần đáy) ----------
    const robot = new THREE.Group();
    root.add(robot);
    const floor = mesh(box(170, 6, 110, 3), MAT.plasticDark, { y: 3, z: 80 });
    robot.add(part(floor, 'Đáy robot (cắt bớt phần trên)', 'Chỉ vẽ một mảng đáy phía sau robot — nơi có 2 tấm tiếp điểm sạc và hộc pin.'));
    const plates = [];
    for (const sx of [-25, 25]) {
      const pl = mesh(box(16, 0.8, 14), MAT.steel.clone(), { x: sx, y: 6.4, z: 34 });
      robot.add(part(pl, \`Tấm tiếp điểm robot (\${sx < 0 ? '+' : '−'})\`, 'Thép không gỉ, gắn ở mép sau đáy robot. Nối qua cầu chì + chống ngược tới pack.'));
      plates.push(pl);
    }
    const pack = mesh(box(76, 22, 66, 2), MAT.plasticBlue.clone(), { y: 17, z: 85 });
    robot.add(part(pack, 'Pack 4S + BMS (bọc co nhiệt)', 'Xem linh kiện "Pack pin 4S + BMS". Sáng xanh nhạt theo mức sạc.'));
    const prot = new THREE.Group();
    prot.position.set(0, 6, 52);
    prot.add(pcb(30, 14, { mat: MAT.pcbGreen }));
    prot.add(mesh(box(6, 2.5, 3), MAT.plasticRed, { x: -8, y: 1.25 }));
    prot.add(mesh(box(5, 1.5, 6), MAT.icBody, { x: 6, y: 0.75 }));
    robot.add(part(prot, 'Cầu chì 3 A + MOSFET chống ngược (ideal diode)', 'Chỉ cho dòng đi VÀO pack từ dock; khi robot rời dock, 2 tấm tiếp điểm không còn điện.'));
    robot.add(wire([[-25, 7, 36], [-20, 9, 45], [-12, 8, 52]], { radius: 0.7, color: 0xd23b3b }));
    robot.add(wire([[25, 7, 36], [20, 9, 45], [12, 8, 52]], { radius: 0.7, color: 0x111111 }));
    robot.add(wire([[0, 8, 58], [0, 14, 64]], { radius: 0.9, color: 0xd23b3b }));
    label(robot, 'Pack 4S trong robot', [0, 34, 85]);

    // ---------- trạng thái ----------
    let soc = 10, vp = 0, lastSoc0 = null, done = false, tSim = 0, wh = 0, remainTxt = '—', estAcc = 1;
    let fault = null, fT = 0, tPack = T_AMB, fired = false, smokeAcc = 0, bmsCut = false, robotZ = 0, step = -1;

    function restart(p) { soc = p?.soc0 ?? 10; vp = 0; done = false; tSim = 0; wh = 0; bmsCut = false; tPack = T_AMB; fired = false; lastSoc0 = p?.soc0; estAcc = 1; }
    restart();

    function estimate(s0, capAh, icc, rTot) {
      // chạy thử nhanh từ trạng thái hiện tại với bước 20 s để ước tính thời gian còn lại
      let s = s0, t = 0, v = vp;
      for (let k = 0; k < 2000; k++) {
        const r = chargerStep(s, capAh, icc, rTot, V_CV, v);
        if (r.phase !== 'pre' && r.I < 0.1 * capAh) return t;
        s += (r.I / (capAh * 3600)) * 100 * 20; t += 20;
        v = polStep(v, r.I, capAh, 20);
      }
      return t;
    }
    const hm = (sec) => \`\${Math.floor(sec / 3600)}h\${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}\`;

    return {
      object: root,
      onAction(id, p) { if (id === 'restart') restart(p); },
      setStep(i) { step = i; },
      triggerFault(id, p) {
        restart(p); fault = id; fT = 0; smokeAcc = 0;
        if (id === 'bms-hong-sac-21v') soc = 85;
        if (id === 'nguoc-cuc-dock') { fx.sparks(contactsD[0], { count: 50, speed: 40, size: 1.2 }); fx.flash(contactsD[0], { size: 40 }); fx.smoke(adapter, { size: 18, duration: 5, color: 0xbbbbbb }); }
        if (id === 'cham-tiep-diem') { fx.sparks(plates[0], { count: 60, speed: 50, size: 1.2 }); fx.flash(plates[0], { size: 35, color: 0xbfe0ff }); fx.scorch(plates[0], 0.5); fx.scorch(plates[1], 0.5); }
        if (id === 'tiep-diem-ban') soc = 40;
      },
      resetFault(p) { fault = null; fT = 0; fired = false; restart(p); },
      update(dt, t, p) {
        fT += dt;
        if (p.soc0 !== lastSoc0 && !fault) restart(p);
        const capAh = Number(p.cap);
        let rc = p.rc, docked = p.dock, icc = p.icc, cv = V_CV, bmsOk = true;
        // ---- tháo lắp: chọn những gì hiện ----
        const s = step;
        adapter.visible = acCord.visible = true;
        dcCable.visible = s < 0 || s >= 1;
        robot.visible = s < 0 || s >= 3;
        if (s >= 0 && s < 4) docked = false;
        // ---- sự cố ----
        if (fault === 'bms-hong-sac-21v') { cv = 21; bmsOk = false; docked = true; }
        if (fault === 'tiep-diem-ban') { rc = 2; docked = true; }
        if (fault === 'nguoc-cuc-dock' || fault === 'cham-tiep-diem') { docked = fault === 'nguoc-cuc-dock'; bmsCut = true; }
        if (fault === 'sac-lanh') docked = true;

        // robot lùi vào / chạy ra
        const targetZ = docked ? 0 : 45;
        robotZ += (targetZ - robotZ) * (1 - Math.pow(0.01, dt));
        robot.position.z = robotZ;
        const touching = robotZ < 2;

        const capR = 4 * R_CELL * (2.5 / capAh) + R_FIXED;
        const rTot = capR + rc;
        let I = 0, Vchg = cv, phase = 'off';
        if (!touching) { phase = 'off'; Vchg = cv; }
        else if (done || bmsCut || fired) { phase = done ? 'done' : 'cut'; }
        else {
          const r = chargerStep(soc, capAh, icc, rTot, cv, vp);
          I = r.I; Vchg = r.Vchg; phase = r.phase;
          if (phase !== 'pre' && I < 0.1 * capAh && cv === V_CV) { done = true; I = 0; phase = 'done'; }
          // BMS ngắt quá sạc theo cell (4.25 V ≈ 17.0 V pack khi cân bằng)
          if (bmsOk && 4 * ocv(soc) + I * 4 * R_CELL * (2.5 / capAh) > 17.0) { bmsCut = true; I = 0; phase = 'cut'; }
        }
        const sim = dt * (fault === 'bms-hong-sac-21v' ? 600 : p.speed);
        if (fault !== 'nguoc-cuc-dock' && fault !== 'cham-tiep-diem') {
          soc = Math.min(106, soc + (I / (capAh * 3600)) * 100 * sim);
          vp = polStep(vp, I, capAh, sim);
          tSim += touching && !done ? sim : 0;
          wh += (Vchg * I * sim) / 3600;
        }
        const E = 4 * ocv(soc);
        const vPack = E + vp + I * capR;      // áp đo trên cực pack (gồm phân cực, nghỉ thì vp giảm dần)
        if (!touching) Vchg = cv;            // không tải: adapter ra đúng điện áp đặt

        // ---- nhiệt pack khi quá sạc (sự cố) ----
        if (fault === 'bms-hong-sac-21v') {
          const vCell = vPack / 4;
          const pSide = vCell > 4.3 ? (vCell - 4.3) * 80 : 0;
          tPack += ((I * I * capR + pSide - (tPack - T_AMB) / 8) / 180) * sim;
          if (tPack > 130) tPack += 30 * dt;
          tPack = Math.min(tPack, 600);
          fx.heat(pack, (tPack - 50) / 150);
          if (tPack > 80 && !fired) { smokeAcc += dt; if (smokeAcc > 1) { smokeAcc = 0; fx.smoke(pack, { size: 14, duration: 1.5, color: 0xdddddd }); } }
          if (tPack > 150 && !fired) { fired = true; fx.fire(pack, { size: 20, duration: 10 }); fx.smoke(pack, { size: 30, duration: 12, color: 0x555555 }); }
        }
        const pc = I * I * rc;
        contactsD.forEach((c) => fx.heat(c, fault === 'tiep-diem-ban' ? Math.min(0.6, pc / 3) : 0));

        // ---- hình ảnh ----
        const full = phase === 'done' || (phase === 'off' && soc >= 99);
        ledMat.emissive.setHex(full || (phase === 'cut' && !fired) ? 0x20ff40 : phase === 'off' ? 0x20ff40 : 0xff2020);
        ledMat.emissiveIntensity = fault === 'nguoc-cuc-dock' ? 0 : 1.2;
        pack.material.emissive.setRGB(0, Math.min(1, Math.max(0, soc) / 100) * 0.25, Math.min(1, Math.max(0, soc) / 100) * 0.35);
        plates.forEach((pl) => pl.material.emissive.setRGB(I > 0.05 ? 0.4 : 0, I > 0.05 ? 0.3 : 0, 0));

        // ---- ước tính còn lại (mỗi 0.5 s) ----
        estAcc += dt;
        if (estAcc > 0.5) {
          estAcc = 0;
          remainTxt = touching && !done && !bmsCut && phase !== 'off' && cv === V_CV ? hm(estimate(soc, capAh, icc, rTot)) : '—';
        }
        const names = { off: 'Chưa chạm dock (đèn xanh = không tải)', pre: '🔴 Tiền sạc 0.1C (pin quá cạn)', cc: '🔴 CC — dòng không đổi', cv: '🔴 CV — áp không đổi, dòng giảm', done: '🟢 Đầy — ngắt (I < 0.1C)', cut: '⛔ Ngắt (BMS / bảo vệ)' };
        let ph = names[phase];
        if (fault === 'bms-hong-sac-21v') ph = fired ? '🔥 Pack cháy — quá sạc 5.25 V/cell' : \`⚠️ CC 21 V, BMS chập: \${(vPack / 4).toFixed(2)} V/cell (tua 600×)\`;
        if (fault === 'nguoc-cuc-dock') ph = '💥 Ngược cực: chống ngược chặn, adapter hỏng tụ';
        if (fault === 'cham-tiep-diem') ph = '⚡ Chập tiếp điểm — BMS ngắt, robot tắt';
        if (fault === 'sac-lanh') ph = \`\${names[phase]} · ❄️ pin −5 °C: lithium plating!\`;

        readout('phase', ph);
        readout('vchg', fault === 'nguoc-cuc-dock' ? -16.8 : Vchg);
        readout('vpack', vPack);
        readout('i', I);
        readout('soc', soc);
        readout('time', \`\${hm(tSim)} / \${remainTxt}\`);
        readout('wh', wh);
        readout('pc', pc);
        return [Math.max(10, Math.min(22, Vchg)), Math.max(10, Math.min(22, vPack)), I, Math.max(0, Math.min(110, soc))];
      },
    };
  },
};
`;export{n as default};
