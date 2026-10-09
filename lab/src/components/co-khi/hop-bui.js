// 🗑️ Hộp bụi + lưới lọc thô + lọc HEPA xếp nếp — đường đi của bụi và gió:
//   miệng hút → ống gió → cửa lật (van 1 chiều) → khoang chứa (gió chậm lại, rác nặng rơi xuống)
//   → lưới lọc thô (chặn tóc, sợi) → HEPA (chặn bụi mịn) → quạt hút → cửa xả.  Bụi KHÔNG BAO GIỜ đi qua quạt.
// Điểm làm việc của quạt: P_quạt(Q) = P0·(1 − (Q/Qmax)²) = K_ống·Q² + (R_lưới + R_HEPA)·Q
//   (ống/miệng hút: tổn thất ∝ Q² (chảy rối); giấy lọc: ∝ Q (chảy tầng, định luật Darcy)).

import { cadAttach, ownMaterial } from '../../core/cadParts.js';

const K_DUCT = 8;            // Pa/(L/s)² — miệng hút + ống gió
const R_HEPA0 = 40;          // Pa/(L/s) — HEPA sạch
const R_MESH0 = 3;           // Pa/(L/s) — lưới thô sạch
const A_INLET = 70 * 12;     // mm² tiết diện cửa vào hộp
const A_BIN = 50 * 110;      // mm² tiết diện khoang chứa
const FAN = {
  quiet: { name: 'Yên lặng (1 200 Pa)', p0: 1200, qmax: 9, rpm: 11000 },
  std: { name: 'Cân bằng (1 800 Pa)', p0: 1800, qmax: 11, rpm: 14000 },
  turbo: { name: 'Turbo (2 500 Pa)', p0: 2500, qmax: 13, rpm: 18000 },
};
const ETA_FAN = 0.3;         // hiệu suất quạt nhỏ (khí / điện)
const SLOW = 100;            // hạt gió vẽ chậm 100×

export default {
  id: 'hop-bui',
  name: 'Hộp bụi + lưới lọc HEPA',
  category: 'co-khi',
  order: 9,
  icon: '🗑️',
  summary: 'Nơi rác dừng lại: luồng gió vào hộp chậm hẳn để rác nặng rơi xuống, lưới thô chặn tóc, giấy HEPA xếp nếp chặn bụi mịn, chỉ có KHÔNG KHÍ SẠCH đi qua quạt. Lọc bẩn → lưu lượng gió & lực hút tụt.',
  tags: ['hộp bụi', 'dust bin', 'HEPA', 'lọc', 'quạt hút', 'lưu lượng', 'Pa', 'áp suất', 'Darcy'],

  params: [
    { id: 'cad', label: '🧊 Mô hình CAD thật (hộp bụi 0,43 L)', type: 'toggle', value: true, hint: 'Tắt = mô hình học tự dựng (đường gió thẳng, hộp vuông đơn giản)' },
    { id: 'fan', label: 'Chế độ quạt hút (ESP32 GPIO4 PWM)', type: 'select', value: 'std', options: Object.entries(FAN).map(([k, f]) => [k, f.name]) },
    { id: 'clog', label: 'Độ bẩn (tắc) lọc HEPA', type: 'range', min: 0, max: 95, step: 1, value: 20, unit: '%' },
    { id: 'fill', label: 'Lượng rác trong hộp', type: 'range', min: 0, max: 100, step: 1, value: 30, unit: '%' },
    { id: 'shell', label: 'Vỏ hộp trong suốt', type: 'toggle', value: true },
  ],
  readouts: [
    { id: 'q', label: 'Lưu lượng gió Q', unit: 'L/s' },
    { id: 'vin', label: 'Tốc độ gió ở cửa vào hộp', unit: 'm/s' },
    { id: 'vbin', label: 'Tốc độ gió trong khoang chứa', unit: 'm/s' },
    { id: 'dpf', label: 'Sụt áp qua lưới + HEPA', unit: 'Pa' },
    { id: 'ps', label: 'Độ chân không ở cửa quạt', unit: 'Pa' },
    { id: 'pair', label: 'Công suất khí (P·Q) / điện quạt', unit: '' },
    { id: 'pick', label: 'Khả năng hút', unit: '' },
    { id: 'st', label: 'Trạng thái', unit: '' },
  ],
  scope: {
    window: 6,
    note: '(thời gian thực · hạt gió vẽ chậm 100×)',
    channels: [
      { name: 'Lưu lượng Q', unit: 'L/s', min: 0, max: 13, color: '#4cc2ff' },
      { name: 'Sụt áp lọc', unit: 'Pa', min: 0, max: 2500, color: '#ffd34d' },
      { name: 'Tốc độ gió cửa vào', unit: 'm/s', min: 0, max: 16, color: '#3fcf8e' },
    ],
  },

  steps: [
    { title: 'Bước 0 — Hộp bụi nằm trong khoang robot', text: '<b>Tắt robot</b> trước (quạt 14 000 vòng/phút hút cả ngón tay vào cửa). Dụng cụ: túi rác, bàn chải mềm, khăn khô. Không cần tua vít.' },
    { title: 'Bước 1 — Lật quai, nhấc hộp bụi ra', text: 'Mở nắp trên robot, lật quai xách trên nắp hộp lên và nhấc thẳng hộp ra. Cửa lật cao su ở miệng hộp tự đóng lại để rác không rơi ra.' },
    { title: 'Bước 2 — Bấm lẫy, mở nắp hộp, đổ rác', text: 'Bấm lẫy ở mép nắp (lùi vào ~2,5 mm) → nắp bật lên quay quanh bản lề phía sau. Đổ rác ngay trên túi rác (bụi mịn dễ bay). Gõ nhẹ hộp, không đập mạnh vào thùng rác — gãy lẫy nắp.' },
    { title: 'Bước 3 — Rút lưới lọc thô', text: 'Kéo thẳng khung lưới lên (~60 mm) theo rãnh trượt. Gỡ tóc, sợi quấn trên lưới bằng tay hoặc kéo nhỏ.' },
    { title: 'Bước 4 — Rút lõi HEPA', text: 'Kéo lõi HEPA thẳng lên (~55 mm). <b>Ghi nhớ chiều lắp</b>: mặt giấy xếp nếp hướng vào khoang chứa, gioăng viền ép vào vách phía quạt (thường có mũi tên "AIR FLOW").' },
    { title: 'Bước 5 — Vệ sinh lọc đúng cách', text: 'Gõ nhẹ HEPA vào thành túi rác hoặc dùng bàn chải mềm. <b>Không rửa nước</b> trừ khi lọc ghi "washable" — giấy ướt bết lại, tắc hẳn và mốc. Hộp & lưới thô rửa được, nhưng phải <b>phơi khô 24 h</b>. Thay HEPA mỗi 3–6 tháng.' },
    { title: 'Bước 6 — Lắp lại & kiểm tra kín', text: 'Lắp HEPA đúng chiều, ấn đều để gioăng cao su kín hết viền. Đóng nắp nghe "tách", đặt hộp vào robot đến khi khớp chốt. Chạy thử: nghe tiếng gió đều, không rít ở khe nắp.' },
  ],
  faults: [
    { id: 'thieu-loc', label: 'Quên lắp lưới + HEPA', severity: 'hong',
      what: '<p>Robot vẫn hút (thậm chí "khỏe" hơn) nhưng <b>bụi phun ra cửa xả</b> thành luồng, phòng có mùi bụi. Vài ngày sau: quạt kêu rít/rung, tốc độ tụt, có mùi khét — quạt hỏng.</p>',
      why: '<p>Không còn gì chặn, cát và bụi mịn đi thẳng vào cánh quạt quay 14 000–18 000 vòng/phút: hạt cát va cánh với vận tốc đầu cánh ~50 m/s → mài mòn, mẻ cánh, <b>mất cân bằng</b> → rung phá ổ bi; bụi mịn phủ lên động cơ BLDC làm nó không tản được nhiệt.</p>',
      fix: '<p>Không bao giờ chạy robot khi chưa lắp lọc. Nhiều robot có công tắc/nam châm báo "chưa lắp hộp bụi" — có thể thêm vào dự án qua chân dự phòng. Quạt đã hít cát: thay quạt, vệ sinh đường gió.</p>' },
    { id: 'loc-uot', label: 'Lắp HEPA vừa rửa còn ướt', severity: 'loi',
      what: '<p>Lực hút yếu hẳn, rác còn nằm lại trên sàn; quạt rú cao hơn bình thường; vài ngày sau hộp bụi <b>bốc mùi mốc</b>, giấy lọc thành mảng bết.</p>',
      why: '<p>Nước lấp các khe giữa sợi lọc (vài µm) → điện trở dòng khí <code>R_HEPA</code> tăng ~15 lần. Điểm làm việc dịch về Q nhỏ: quạt gần như bị bịt kín — áp suất cao nhưng lưu lượng thấp, gió ở miệng hút không đủ nhấc hạt.</p>',
      fix: '<p>Chỉ gõ/chải HEPA; nếu là loại rửa được thì phơi khô ít nhất 24 h. Có sẵn 1 lõi HEPA dự phòng để thay luân phiên.</p>' },
    { id: 'nap-ho', label: 'Nắp hộp đậy không kín / mất gioăng', severity: 'loi',
      what: '<p>Robot hút kém dù lọc sạch; bụi mịn <b>rò ra quanh khe nắp</b>, bám thành vệt quanh khoang hộp bụi trong robot.</p>',
      why: '<p>Khe hở tạo đường gió tắt có điện trở rất nhỏ: phần lớn lưu lượng quạt đi qua khe thay vì qua miệng hút. Lưu lượng ở miệng hút chỉ còn ~35 % → tốc độ gió cửa vào tụt mạnh (động năng gió ∝ v²).</p>',
      fix: '<p>Kiểm tra gioăng cao su, lau sạch rác kẹt ở mép nắp trước khi đóng; đóng đến khi nghe tiếng "tách".</p>' },
  ],

  info: {
    overview: `
      <p>Quạt hút tạo chân không phía sau hộp bụi. Không khí từ miệng hút mang rác đi qua <b>4 "trạm"</b>:</p>
      <ol>
        <li><b>Cửa lật cao su</b> (van một chiều): mở ra khi có gió, tự đóng khi tắt máy để rác không rơi ngược ra.</li>
        <li><b>Khoang chứa</b>: tiết diện lớn gấp ~6 lần cửa vào → gió chậm lại ~6 lần → <b>rác nặng rơi xuống</b> (lắng).</li>
        <li><b>Lưới lọc thô</b>: chặn tóc, sợi vải, lông thú.</li>
        <li><b>Lọc HEPA xếp nếp</b>: chặn bụi mịn tới ~0.3 µm (E11: ≥ 95 %).</li>
      </ol>
      <p>Chỉ <b>không khí sạch</b> đi tới quạt. Quạt không bao giờ phải "nuốt" bụi.</p>
      <p>Thử: kéo <b>Độ bẩn lọc</b> từ 0 → 95 % và xem lưu lượng Q, tốc độ gió cửa vào tụt. Đổi <b>chế độ quạt</b>: Turbo không cứu được lọc tắc. Bấm sự cố <b>Quên lắp lọc</b> để xem điều gì xảy ra với quạt.</p>`,
    specs: [
      ['Dung tích hộp', '≈ 400–500 ml (vỏ 150 × 50 × 110 mm)'],
      ['Quạt hút', 'BLDC ly tâm 14.4 V, 20–40 W điện, 11 000–18 000 vòng/phút; áp chân không tối đa 1 200–2 500 Pa'],
      ['Lưu lượng', '≈ 7–11 L/s (0.4–0.65 m³/phút) khi lọc sạch'],
      ['Lọc HEPA', 'Cấp E11 (≥ 95 % hạt 0.3 µm), giấy sợi thủy tinh/PP xếp ~17 nếp sâu 16 mm → diện tích giấy ≈ 230 cm² (gấp 5.5 lần mặt cắt)'],
      ['Lưới thô', 'Lưới nylon/inox mắt ~0.2–0.5 mm'],
      ['Cửa lật', 'Lá cao su/silicone dày ~0.5 mm, bản lề phía trên'],
      ['Thay thế', 'HEPA 3–6 tháng; đổ rác sau mỗi lần chạy'],
    ],
    principle: `
      <h4>1. Bảo toàn lưu lượng: gió nhanh ở chỗ hẹp, chậm ở chỗ rộng</h4>
      <p><code>Q = v·A</code> không đổi dọc đường gió. Cửa vào 840 mm², khoang 5 500 mm² → v giảm ~6.5 lần (≈ 12 → 1.8 m/s). Gió chậm không đỡ được hạt nặng → hạt rơi xuống đáy hộp.</p>
      <h4>2. Đường đặc tính quạt & điểm làm việc</h4>
      <p>Quạt: <code>P(Q) = P0·(1 − (Q/Qmax)²)</code> — bịt kín thì áp lớn nhất (P0), để hở thì lưu lượng lớn nhất (Qmax). Hệ thống: <code>ΔP = K·Q² + R·Q</code>. Giao điểm 2 đường = điểm làm việc. Giải phương trình bậc 2:</p>
      <p><code>Q = (−R + √(R² + 4·A·P0)) / (2A)</code>, với <code>A = P0/Qmax² + K</code>.</p>
      <h4>3. Lọc là "điện trở" của dòng khí</h4>
      <p>Qua giấy lọc dòng khí chảy tầng: <code>ΔP = R·Q</code> (giống định luật Ôm: áp ↔ điện áp, lưu lượng ↔ dòng). Bụi lấp lỗ → R tăng; xếp nếp tăng diện tích → R giảm (R ∝ 1/diện tích).</p>
      <h4>4. Công suất</h4>
      <p>Công suất khí <code>P_khí = ΔP·Q</code> (Pa × m³/s = W). 1 500 Pa × 0.009 m³/s ≈ 13.5 W khí, quạt nhỏ hiệu suất ~30 % → ~45 W điện.</p>
      <h4>5. Nhấc được hạt</h4>
      <p>Muốn hút một hạt cát 1 mm khỏi sàn cần gió ≳ 7 m/s tại miệng hút; bụi mịn chỉ cần ~1–2 m/s nhưng phải giữ lại được ở HEPA.</p>`,
    inRobot: `
      <ul>
        <li>Quạt hút do <b>ESP32</b> điều khiển: PWM 20 kHz ở <b>GPIO4</b> (LEDC), đọc tốc độ qua dây FG ở <b>GPIO5</b> (theo <code>docs/01</code>). Quạt BLDC có driver tích hợp: chỉ cần VBAT/GND/PWM/FG.</li>
        <li>Đo FG: lọc tắc → quạt "nhẹ tải" và quay nhanh hơn, dòng giảm; ESP32 có thể cảnh báo "vệ sinh lọc" khi tốc độ FG tăng bất thường ở cùng duty.</li>
        <li>Hộp bụi ngồi ở khoang phía sau, cửa vào khớp với ống gió sau chổi cuộn chính, cửa ra áp vào gioăng của quạt.</li>
      </ul>`,
    mistakes: `
      <ul>
        <li>Rửa HEPA giấy bằng nước → bết, tắc, mốc.</li>
        <li>Chạy khi quên lắp lọc → cát bắn vào quạt, hỏng quạt.</li>
        <li>Lắp HEPA ngược chiều hoặc lệch gioăng → bụi lách qua viền.</li>
        <li>Để hộp đầy tràn → rác chèn cửa lật không đóng, gió đi tắt, lưới thô bị nén bụi kín.</li>
        <li>Dùng máy nén khí thổi mạnh vào HEPA → rách giấy lọc (lỗ thủng không nhìn thấy).</li>
      </ul>`,
    quiz: [
      { q: 'Lưu lượng 9 L/s đi qua cửa vào 840 mm². Gió ở cửa vào nhanh bao nhiêu?', a: 'v = Q/A = 0.009 / 0.00084 ≈ 10.7 m/s.' },
      { q: 'Vì sao rác nặng rơi xuống đáy hộp mà không bay thẳng vào lọc?', a: 'Khoang chứa có tiết diện lớn gấp ~6.5 lần cửa vào nên gió chậm lại ~6.5 lần (Q = v·A). Gió chậm không còn đủ lực đỡ hạt nặng → hạt lắng xuống.' },
      { q: 'Lọc HEPA bẩn làm tăng R. Vì sao bật Turbo không bù lại được hoàn toàn?', a: 'Sụt áp qua lọc tăng tuyến tính theo Q (ΔP = R·Q) cộng thêm tổn thất ống ∝ Q²; quạt chỉ tăng P0 có hạn, nên điểm làm việc vẫn ở Q nhỏ. Cách đúng là vệ sinh/thay lọc.' },
    ],
  },

  build(ctx) {
    const { THREE, MAT, geom, label, readout, fx } = ctx;
    const { mesh, group, part, cyl, box } = geom;
    const root = new THREE.Group();
    const X0 = -75, X1 = 75, Y0 = 0, Y1 = 50, Z0 = -55, Z1 = 55;

    // ---------- hộp bụi (nhóm "bin" để nhấc ra khi tháo) ----------
    const bin = new THREE.Group();
    root.add(bin);
    const shellMat = MAT.plasticGrey.clone();
    shellMat.color.set(0x5a6470); shellMat.transparent = true; shellMat.opacity = 0.22; shellMat.depthWrite = false;
    const shellOpaque = MAT.plasticDark.clone();
    const walls = group(
      mesh(box(X1 - X0, 2, Z1 - Z0), shellMat, { y: Y0 + 1 }),
      mesh(box(X1 - X0, Y1, 2), shellMat, { y: Y1 / 2, z: Z0 + 1 }),
      mesh(box(X1 - X0, Y1, 2), shellMat, { y: Y1 / 2, z: Z1 - 1 }),
      mesh(box(2, Y1, Z1 - Z0), shellMat, { x: X0 + 1, y: Y1 / 2 }),
      mesh(box(2, Y1, Z1 - Z0), shellMat, { x: X1 - 1, y: Y1 / 2 }),
    );
    walls.children.forEach((m) => (m.renderOrder = 2));
    bin.add(part(walls, 'Vỏ hộp bụi (nhựa PC/ABS trong)', 'Dung tích ~450 ml. Nhìn xuyên để thấy đường đi của gió và bụi.'));
    const lid = new THREE.Group();
    lid.position.set(X0, Y1, 0);                          // bản lề ở mép trước
    const lidMesh = mesh(box(X1 - X0, 3, Z1 - Z0, 1), shellMat, { x: (X1 - X0) / 2, y: 1.5 });
    lidMesh.renderOrder = 2;
    const gasket = mesh(box(X1 - X0 - 6, 1, Z1 - Z0 - 6), MAT.rubber, { x: (X1 - X0) / 2, y: -0.3 });
    lid.add(part(group(lidMesh, gasket), 'Nắp hộp + gioăng cao su', 'Gioăng làm kín: hở khe là gió đi tắt, mất lực hút và rò bụi.'));
    bin.add(lid);
    // cửa vào + cửa lật
    const inletDuct = group(
      mesh(box(22, 2, 74), shellOpaque, { x: X0 - 11, y: 7 }),
      mesh(box(22, 2, 74), shellOpaque, { x: X0 - 11, y: 21 }),
    );
    root.add(part(inletDuct, 'Ống gió từ chổi cuộn chính (cửa vào 70 × 12 mm)', 'Tiết diện nhỏ → gió nhanh (~10–12 m/s) để mang được rác.'));
    const flapPivot = new THREE.Group();
    flapPivot.position.set(X0 + 3, 21, 0);
    const flap = mesh(box(0.8, 15, 72), MAT.rubber, { y: -7.5 });
    flapPivot.add(flap);
    bin.add(part(flapPivot, 'Cửa lật cao su (van 1 chiều)', 'Gió hút mở cửa ra; tắt máy thì tự rơi xuống đóng kín miệng hộp, rác không đổ ngược ra sàn.'));
    // đống rác
    const pileMat = MAT.plasticYellow.clone();
    pileMat.color.set(0x7a6248);
    const pile = mesh(box(100, 1, Z1 - Z0 - 6, 0.4), pileMat, { x: -5, y: 2.5 });
    bin.add(part(pile, 'Rác đã lắng', 'Rác nặng (cát, vụn) lắng xuống đáy khoang chứa vì gió ở đây chậm.'));
    // lưới thô
    const meshFilter = new THREE.Group();
    meshFilter.position.x = 42;
    const meshFrame = group(
      mesh(box(3, 46, 3), MAT.plasticWhite, { y: 25, z: Z0 + 4 }), mesh(box(3, 46, 3), MAT.plasticWhite, { y: 25, z: Z1 - 4 }),
      mesh(box(3, 3, Z1 - Z0 - 6), MAT.plasticWhite, { y: 3.5 }), mesh(box(3, 3, Z1 - Z0 - 6), MAT.plasticWhite, { y: 46.5 }),
    );
    const wiresG = new THREE.Group();
    for (let k = 0; k < 16; k++) wiresG.add(mesh(box(0.4, 42, 0.4), MAT.steel, { y: 25, z: Z0 + 9 + k * 6.1 }));
    for (let k = 0; k < 7; k++) wiresG.add(mesh(box(0.4, 0.4, Z1 - Z0 - 8), MAT.steel, { y: 7 + k * 6 }));
    meshFilter.add(part(group(meshFrame, wiresG), 'Lưới lọc thô', 'Mắt lưới ~0.3 mm: chặn tóc, sợi, lông thú trước khi tới HEPA.'));
    bin.add(meshFilter);
    // HEPA xếp nếp: các tấm giấy gấp zig-zag (nếp chạy dọc theo Y)
    const hepa = new THREE.Group();
    hepa.position.x = 46;
    const paperMat = MAT.plasticWhite.clone();
    const NPL = 17, DEPTH = 16, PITCH = (Z1 - Z0 - 10) / NPL;
    for (let k = 0; k < NPL; k++) {
      for (const half of [0, 1]) {
        const za = Z0 + 5 + k * PITCH + half * PITCH / 2;
        // nửa nếp đi từ mặt trước (x = 0) ra mặt sau (x = DEPTH) rồi quay lại: trục dài của tấm (Z cục bộ) xoay theo hướng (dx, dz)
        const sheet = mesh(box(0.5, 42, Math.hypot(DEPTH, PITCH / 2)), paperMat, { x: DEPTH / 2, y: 25, z: za + PITCH / 4, ry: Math.atan2(half ? -DEPTH : DEPTH, PITCH / 2) });
        hepa.add(sheet);
      }
    }
    const hepaFrame = group(
      mesh(box(DEPTH + 2, 3, Z1 - Z0 - 4), MAT.plasticBlue, { x: DEPTH / 2, y: 3 }),
      mesh(box(DEPTH + 2, 3, Z1 - Z0 - 4), MAT.plasticBlue, { x: DEPTH / 2, y: 47 }),
    );
    hepa.add(hepaFrame);
    bin.add(part(hepa, `Lọc HEPA E11 xếp ${NPL} nếp`, `Giấy lọc gấp nếp sâu ${DEPTH} mm → diện tích giấy ~230 cm² (gấp 5.5 lần mặt cắt) → sụt áp nhỏ. Đổi màu xám nâu khi bẩn.`));
    // cửa ra
    const outlet = mesh(box(4, 22, 44), MAT.rubber, { x: X1 + 2, y: 34 });
    bin.add(part(outlet, 'Cửa ra + gioăng (áp vào quạt)', 'Chỉ không khí đã lọc sạch đi qua đây.'));

    // ---------- quạt hút (cố định trong robot) ----------
    const fanG = new THREE.Group();
    fanG.position.set(X1 + 32, 34, 0);
    root.add(fanG);
    const scroll = mesh(cyl(30, 30, 26, 48, true), MAT.plasticDark.clone(), { rz: Math.PI / 2 });
    scroll.material.side = THREE.DoubleSide;
    scroll.material.transparent = true; scroll.material.opacity = 0.5;
    fanG.add(part(scroll, 'Vỏ xoắn quạt ly tâm', 'Gom gió từ cánh quạt văng ra, dẫn tới cửa xả.'));
    const impeller = new THREE.Group();
    impeller.add(mesh(cyl(24, 24, 1.5, 40), MAT.plasticGrey, { x: 10, rz: Math.PI / 2 }));
    for (let k = 0; k < 9; k++) {
      const b = mesh(box(18, 12, 1.2), MAT.plasticGrey, { x: 3, rx: (k * 2 * Math.PI) / 9 });
      b.position.set(3, Math.cos((k * 2 * Math.PI) / 9) * 15, Math.sin((k * 2 * Math.PI) / 9) * 15);
      b.rotation.set((k * 2 * Math.PI) / 9 + 0.5, 0, 0);
      impeller.add(b);
    }
    fanG.add(part(impeller, 'Cánh quạt ly tâm 9 cánh', 'Quay 11 000–18 000 vòng/phút (vẽ chậm). Hạt cát lọt vào đây sẽ mài mẻ cánh → mất cân bằng → rung, hỏng ổ bi.'));
    const fanMotor = mesh(cyl(16, 16, 30, 32), MAT.steel, { x: 30, rz: Math.PI / 2 });
    fanG.add(part(fanMotor, 'Động cơ BLDC quạt (driver tích hợp)', 'Dây: VBAT, GND, PWM (← ESP32 GPIO4), FG (→ GPIO5, xung tốc độ).'));
    const exhaust = mesh(box(14, 8, 40), MAT.plasticDark, { y: 32 });
    fanG.add(part(exhaust, 'Cửa xả', 'Khí sạch thổi ra (thường qua một lớp lọc khử mùi/giảm ồn).'));
    const lbIn = label(root, 'Cửa vào', [X0 - 12, 30, 0]);
    label(root, 'Khoang chứa', [-20, 58, 0]);
    label(root, 'Lưới + HEPA', [52, 58, 0]);
    label(root, 'Quạt hút', [X1 + 32, 74, 0]);

    // ---------- MÔ HÌNH CAD THẬT: hộp bụi 145 × 91,5 × 49 mm ----------
    // Khung GLB: cửa vào (cửa lật) ở mặt −Z, lọc ở phía −X, bản lề nắp ở +Z. Xoay 180° quanh Y → lọc ở +X
    // (sát quạt như mô hình học), cửa vào nằm ở mặt +Z. Đặt trong nhóm `bin` để cùng được nhấc ra khi tháo.
    const deg = Math.PI / 180;
    // ống gió vào ở mặt +Z (chỉ hiện ở chế độ CAD; mô hình học có ống ở phía −X)
    const inletDuctCad = group(
      mesh(box(100, 2, 30), shellOpaque, { y: 2, z: 62 }),
      mesh(box(100, 2, 30), shellOpaque, { y: 17, z: 62 }),
      mesh(box(2, 17, 30), shellOpaque, { x: -50, y: 9.5, z: 62 }),
      mesh(box(2, 17, 30), shellOpaque, { x: 50, y: 9.5, z: 62 }),
    );
    inletDuctCad.visible = false;
    root.add(part(inletDuctCad, 'Ống gió từ chổi cuộn chính', 'Nối khe hút sau chổi cuộn với miệng hộp bụi. Tiết diện nhỏ → gió nhanh (~10–12 m/s) để mang được rác.'));
    let cFlap = null, cLid = null, cHandle = null, cLatch = null, cHepa = null, cMesh = null, cadShellMode = null, lastDirtHex = -1;
    const cad = cadAttach(ctx, bin, 'robot/dust-bin', {
      onBottom: false, rotateY: Math.PI,
      hide: [walls, lid, flapPivot, meshFilter, hepa, outlet, inletDuct],
      partDefault: ['Hộp bụi 0,43 L (CAD thật)', 'Vỏ 145 × 91,5 × 49 mm.'],
      parts: {
        body: ['Vỏ hộp bụi (nhựa ABS/PC)', 'Dung tích ~0,43 L, vỏ 145 × 91,5 × 49 mm. Khoang chứa rộng làm gió chậm lại để rác nặng lắng xuống đáy. Cửa ra ở vách phía lọc áp vào gioăng quạt.'],
        flap_inlet: ['Cửa lật cao su (van 1 chiều)', 'Lá cao su treo trên bản lề phía trên miệng hộp: gió hút đẩy nó mở vào trong (tới ~50°); tắt máy thì tự rơi xuống đóng kín, rác không đổ ngược ra sàn.'],
        hinge_pin: ['Chốt bản lề nắp', 'Thanh thép Ø1,8 mm — nắp hộp quay quanh chốt này.'],
        lid_shell: ['Nắp hộp bụi', 'Đậy kín khoang chứa và 2 tấm lọc. Mở ~95° quanh bản lề phía sau sau khi bấm lẫy.'],
        seal_lid: ['Gioăng cao su nắp', 'Ép kín viền nắp: hở khe là gió đi tắt, mất lực hút và rò bụi.'],
        handle: ['Quai xách', 'Lật lên ~80° để cầm nhấc hộp ra khỏi robot.'],
        latch_bin: ['Lẫy mở nắp', 'Bấm vào ~2,5 mm để nhả móc giữ nắp. Đóng nắp phải nghe "tách".'],
        hepa_frame: ['Khung lõi HEPA', 'Khung nhựa giữ giấy lọc, trượt lên/xuống trong rãnh.'],
        hepa_paper: ['Giấy lọc HEPA E11 xếp nếp', 'Chặn ≥ 95 % hạt 0,3 µm. Xếp nếp để tăng diện tích → sụt áp nhỏ. Đổi màu xám nâu khi bẩn.'],
        hepa_gasket: ['Gioăng viền HEPA', 'Ép kín quanh lõi lọc — lắp lệch là bụi lách qua viền vào quạt.'],
        prefilter_frame: ['Khung lưới lọc thô', 'Đứng trước HEPA (phía khoang chứa).'],
        mesh_grid: ['Lưới lọc thô', 'Mắt lưới ~0,3 mm: chặn tóc, sợi, lông thú trước khi tới HEPA.'],
      },
      labels: [['Cửa lật', 'flap_inlet', [0, 4, 6]]],
      onLoad(c) {
        cFlap = c.pivot('flap_inlet', { axis: [1, 0, 0], origin: [0, 16, -39.5] });
        cLid = c.pivot('lid_bin', { axis: [1, 0, 0], origin: [0, 46, 41.5] });        // nắp trước, quai (con của nắp) sau
        cHandle = c.pivot('handle', { axis: [1, 0, 0], origin: [0, 48, 25] });
        cLatch = c.slide('latch_bin', [0, 0, 1]);
        cHepa = c.slide('filter_hepa', [0, 1, 0]);
        cMesh = c.slide('mesh_prefilter', [0, 1, 0]);
        cadShellMode = null; lastDirtHex = -1;
      },
    });
    // Đường gió trong hộp CAD: cửa vào ở +Z → gió đi −Z rồi bẻ cong 90° sang +X tới lưới + HEPA.
    // Ánh xạ toạ độ "dòng chảy" của mô hình học (x dọc đường gió, z ngang) sang hộp CAD (cung tròn R35 quanh tâm (35, 35)).
    function flowToCad(v) {
      const x = v.x, z = v.z;
      const l = z * 0.62;
      if (x < X0 + 4) { v.set(l, v.y - 4, 39.5 + (X0 + 4 - x)); return v; }
      if (x > X1) { const k = Math.min(1, (x - X1) / 22); v.set(x, v.y, z * (0.62 + 0.38 * k)); return v; }
      const u = x - (X0 + 4);
      let d = u <= 111 ? u * 0.653 : 72.5 + (u - 111) * (27 / 35);
      if (d < 4.5) { v.set(l, v.y, 39.5 - d); return v; }
      d -= 4.5;
      if (d < 55) { const th = Math.PI + d / 35, r = 35 - l; v.set(35 + r * Math.cos(th), v.y, 35 + r * Math.sin(th)); return v; }
      v.set(35 + (d - 55), v.y, l);
      return v;
    }

    // ---------- hạt: gió (xanh) & bụi (nâu) ----------
    const NA = 60, ND = 36;
    const airMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.9, 6, 4), MAT.airflow, NA);
    const dustMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1.3, 6, 4), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), ND);
    [airMesh, dustMesh].forEach((m) => { m.raycast = () => {}; root.add(m); });
    const dummy = new THREE.Object3D();
    const rnd = (a, b) => a + Math.random() * (b - a);
    // đường gió: các mốc (x, y), kèm độ rộng ngang z và tiết diện (mm²) để tính tốc độ cục bộ
    const PATH = [
      // [x, y, nửa bề rộng ngang (mm), tiết diện (mm²)]
      [X0 - 22, 14, 32, A_INLET], [X0 + 4, 14, 32, A_INLET], [X0 + 30, 22, 48, A_BIN], [40, 25, 48, A_BIN],
      [46, 25, 48, 4200], [62, 25, 48, 4200], [X1, 34, 20, 900], [X1 + 22, 34, 10, 700], [X1 + 32, 66, 16, 600],
    ];
    const seg = PATH.slice(1).map((b, i) => { const a = PATH[i]; return { a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) }; });
    const totalLen = seg.reduce((s, x) => s + x.len, 0);
    const airPos = (sAlong, lat, latY, out) => {
      let s = sAlong;
      for (const g of seg) {
        if (s <= g.len) {
          const u = s / g.len;
          const w = g.a[2] + (g.b[2] - g.a[2]) * u;
          out.set(g.a[0] + (g.b[0] - g.a[0]) * u, g.a[1] + (g.b[1] - g.a[1]) * u + latY * (w / 48) * 18, lat * w);
          return g.a[3] + (g.b[3] - g.a[3]) * u;
        }
        s -= g.len;
      }
      out.set(PATH[PATH.length - 1][0], PATH[PATH.length - 1][1], 0);
      return 600;
    };
    const AIR = Array.from({ length: NA }, () => ({ s: rnd(0, totalLen), lat: rnd(-0.9, 0.9), ly: rnd(-0.9, 0.9) }));
    const DUST = Array.from({ length: ND }, (_, i) => ({ ph: 0, x: X0 - 22 - rnd(0, 60), y: 14, z: rnd(-30, 30), vx: 0, vy: 0, kind: i % 3 === 0 ? 'min' : i % 3 === 1 ? 'nang' : 'soi', t: 0 }));
    const cDust = { nang: new THREE.Color(0x8a6a3a), min: new THREE.Color(0xb8b0a0), soi: new THREE.Color(0x3a2a1a) };
    const tmpV = new THREE.Vector3();

    // ---------- mô phỏng ----------
    let fault = null, step = -1, stepPos = 0, fanAng = 0, dustInFan = 0, damage = 0, puffT = 0, smokeT = 0, lastShell = null;
    const hepaClean = new THREE.Color(0xf2f2ee), hepaDirty = new THREE.Color(0x6b5a45);

    return {
      object: root,
      setStep(i) { step = i; },
      triggerFault(id) { fault = id; dustInFan = 0; damage = 0; },
      resetFault() { fault = null; dustInFan = 0; damage = 0; },
      update(dt, t, p) {
        if (p.shell !== lastShell) {
          shellMat.opacity = p.shell ? 0.22 : 0.95; shellMat.depthWrite = !p.shell; lastShell = p.shell;
          walls.traverse((o) => { if (o.material) { o.material.opacity = shellMat.opacity; o.material.depthWrite = !p.shell; } });
          lidMesh.material.opacity = shellMat.opacity;
        }
        // ---------- tháo lắp ----------
        stepPos += ((step >= 6 ? 0 : Math.max(0, step)) - stepPos) * Math.min(1, dt * 3);
        const cl = (v) => Math.max(0, Math.min(1, v));
        const s1 = cl(stepPos), s2 = cl(stepPos - 1), s3 = cl(stepPos - 2), s4 = cl(stepPos - 3);
        bin.position.y = 70 * s1;
        lid.rotation.z = 1.9 * s2;
        meshFilter.position.y = 70 * s3; hepa.position.y = 70 * s4;
        const noFilter = fault === 'thieu-loc';
        const cadOn = cad.sync(p);
        meshFilter.visible = !noFilter && !cadOn; hepa.visible = !noFilter && !cadOn;
        inletDuctCad.visible = cadOn;
        lbIn?.position.set(...(cadOn ? [0, 30, 66] : [X0 - 12, 30, 0]));
        if (cadOn) {
          // bấm lẫy (2,5 mm) → nắp mở 95° → (quai lật 80° từ bước 1) → rút lưới thô +60 → rút HEPA +55
          cHandle?.set(80 * deg * cl(s1 * 3));
          cLatch?.set(2.5 * cl(s2 * 5) * (1 - cl((s2 - 0.6) * 4)));
          const ajar = fault === 'nap-ho' ? 7 * deg : 0;
          cLid?.set(Math.max(ajar, 95 * deg * cl((s2 - 0.2) / 0.8)));
          cMesh?.set(60 * s3);
          cHepa?.set(55 * s4);
          if (cMesh) cMesh.node.visible = !noFilter;
          if (cHepa) cHepa.node.visible = !noFilter;
          const seal = cad.node('seal_lid');
          if (seal) seal.visible = fault !== 'nap-ho';
          if (cadShellMode !== p.shell) {
            cadShellMode = p.shell;
            ['body', 'lid_shell'].forEach((n) => cad.node(n)?.traverse((o) => {
              if (!o.isMesh) return;
              const m = ownMaterial(o);
              m.transparent = p.shell; m.opacity = p.shell ? 0.28 : 1; m.depthWrite = !p.shell; m.needsUpdate = true;
              o.renderOrder = p.shell ? 2 : 0;
            }));
          }
        }
        const running = stepPos < 0.2;

        // ---------- điểm làm việc quạt ----------
        const f = FAN[p.fan];
        let rH = R_HEPA0 / Math.pow(1 - 0.97 * (p.clog / 100), 1.5);
        if (fault === 'loc-uot') rH *= 15;
        const rM = R_MESH0 * (1 + 20 * Math.max(0, p.fill / 100 - 0.75) / 0.25);   // hộp đầy → rác ép lên lưới
        const R = noFilter ? 1 : rH + rM;
        const A = f.p0 / (f.qmax * f.qmax) + K_DUCT;
        let Q = running ? (-R + Math.sqrt(R * R + 4 * A * f.p0)) / (2 * A) : 0;      // L/s
        const leak = fault === 'nap-ho';
        let Qin = leak ? Q * 0.35 : Q;                                               // khe hở hút tắt 65 %
        const pFan = running ? f.p0 * (1 - (Q / f.qmax) ** 2) : 0;
        const dpF = R * Q;
        const vin = (Qin * 1e-3) / (A_INLET * 1e-6);
        const vbin = (Qin * 1e-3) / (A_BIN * 1e-6);
        const pAir = pFan * Q * 1e-3;
        const pEl = running ? pAir / ETA_FAN + 3 : 0;
        const fanRpm = running ? f.rpm * (1 + 0.25 * (1 - Q / (f.qmax * 0.8))) * (1 - 0.4 * damage) : 0;  // tải nhẹ (tắc) → quay nhanh hơn

        // ---------- hình: cửa lật, đống rác, màu HEPA, quạt ----------
        flapPivot.rotation.z = Math.min(1.25, vin / 9);       // gió thổi +X đẩy cửa lật vào trong hộp
        if (cadOn) cFlap?.set(-50 * deg * Math.min(1, vin / 11));   // cửa lật CAD mở vào trong tối đa 50°
        pile.scale.y = 1 + p.fill * 0.35;
        pile.position.y = 2 + (p.fill * 0.35) / 2;
        pile.position.x = cadOn ? -8 : -5;                    // khoang chứa CAD: x −66…50, z −42…45
        pile.scale.x = cadOn ? 1.14 : 1; pile.scale.z = cadOn ? 0.7 : 1; pile.position.z = cadOn ? -3 : 0;
        const dirt = Math.min(1, p.clog / 95 + (fault === 'loc-uot' ? 0.4 : 0));
        paperMat.color.copy(hepaClean).lerp(hepaDirty, dirt);
        if (cadOn) {
          const hx = paperMat.color.getHex() & 0xf8f8f8;          // lượng tử hoá → chỉ đổi màu khi thật sự khác
          if (hx !== lastDirtHex) { lastDirtHex = hx; cad.color('hepa_paper', hx); }
        }
        fanAng += ((fanRpm / 60) * 2 * Math.PI / 400) * dt;      // vẽ chậm 400×
        impeller.rotation.x = fanAng;
        if (noFilter && running) {
          damage = Math.min(1, damage + dt / 40);
          smokeT -= dt;
          if (smokeT <= 0) { smokeT = 0.6; fx.smoke([fanG.position.x, fanG.position.y + 40, 0], { size: 10, duration: 0.6, color: 0x8a7a60 }); }
          if (damage > 0.6 && Math.random() < dt * 2) fx.sparks(fanG, { count: 6, speed: 30, size: 0.8 });
          fanG.position.y = 34 + (damage > 0.3 ? Math.sin(t * 90) * 0.6 * damage : 0);   // rung do mất cân bằng
        } else fanG.position.y = 34;
        if (leak && running) {
          puffT -= dt;
          if (puffT <= 0) {
            puffT = 0.8;
            fx.smoke(cadOn ? [rnd(-60, 60), 50 + bin.position.y, 44] : [rnd(X0, X1), Y1 + 2 + bin.position.y, Z1], { size: 6, duration: 0.5, color: 0x9a8a70 });
          }
        }

        // ---------- hạt gió ----------
        AIR.forEach((a, i) => {
          if (running) {
            const area = airPos(a.s, a.lat, a.ly, tmpV);
            const vLocal = (Q * 1e-3) / (area * 1e-6) * 1000 / SLOW;   // mm/s đã làm chậm
            a.s += vLocal * dt;
            if (a.s > totalLen) { a.s = 0; a.lat = rnd(-0.9, 0.9); a.ly = rnd(-0.9, 0.9); }
          }
          airPos(a.s, a.lat, a.ly, tmpV);
          const inBin = tmpV.x < X1 + 2 && tmpV.x > X0;
          if (cadOn) flowToCad(tmpV);
          tmpV.y += bin.position.y * (inBin ? 1 : 0);
          dummy.position.copy(tmpV);
          dummy.updateMatrix();
          airMesh.setMatrixAt(i, dummy.matrix);
        });
        airMesh.instanceMatrix.needsUpdate = true;
        airMesh.visible = running;
        // ---------- hạt bụi ----------
        DUST.forEach((d, i) => {
          if (running) {
            const vAir = vin * 1000 / SLOW;
            if (d.ph === 0) {                              // đang bay trong ống vào
              d.x += vAir * dt * (Qin > 0.5 ? 1 : 0);
              if (d.x > X0 + 4) { d.ph = 1; d.vx = vAir * (d.kind === 'nang' ? 0.6 : 0.8); d.vy = 0; }
            } else if (d.ph === 1) {                       // trong khoang chứa
              const vBinS = vbin * 1000 / SLOW;
              d.vx += (vBinS - d.vx) * Math.min(1, dt * (d.kind === 'nang' ? 1.2 : 4));
              const vs = d.kind === 'nang' ? 9 : d.kind === 'soi' ? 2 : 0.6;   // vận tốc lắng (đã làm chậm)
              d.vy = -vs * (d.kind === 'nang' ? 1 + d.t : 1);
              d.t += dt;
              d.x += d.vx * dt; d.y += d.vy * dt;
              const floorY = 3 + p.fill * 0.35;
              if (d.y < floorY) { d.y = floorY; d.ph = 3; d.t = 0; }
              const stopX = noFilter ? 1e9 : d.kind === 'soi' ? 40 : d.kind === 'min' ? 45 : 40;
              if (d.x > stopX) { d.x = stopX; d.ph = 3; d.t = 0; }      // dính trên lưới / HEPA
              if (d.x > X1) { d.ph = 2; d.t = 0; dustInFan++; }        // KHÔNG có lọc: bụi vào quạt!
            } else if (d.ph === 2) {
              d.x += 25 * dt; d.y += 40 * dt;
              if (d.y > 90) d.ph = 3;
            } else {
              d.t += dt;
              if (d.t > 2.5) { d.ph = 0; d.x = X0 - 22 - rnd(0, 40); d.y = rnd(10, 18); d.z = rnd(-30, 30); d.t = 0; d.vx = 0; }
            }
          }
          dummy.position.set(d.x, d.y, d.z);
          if (cadOn) flowToCad(dummy.position);
          dummy.position.y += d.ph === 1 || d.ph === 3 ? bin.position.y : 0;
          dummy.scale.setScalar(d.kind === 'nang' ? 1.3 : d.kind === 'soi' ? 1 : 0.6);
          dummy.updateMatrix();
          dustMesh.setMatrixAt(i, dummy.matrix);
          dustMesh.setColorAt(i, cDust[d.kind]);
        });
        dummy.scale.setScalar(1);
        dustMesh.instanceMatrix.needsUpdate = true;
        if (dustMesh.instanceColor) dustMesh.instanceColor.needsUpdate = true;

        const st = !running ? 'Đã tắt / đang tháo' : noFilter ? `⚠ BỤI ĐI VÀO QUẠT! (${dustInFan} hạt) — quạt hư ${Math.round(damage * 100)} %` : fault === 'loc-uot' ? '⚠ Lọc ướt: gần như bịt kín' : leak ? '⚠ Hở nắp: gió đi tắt, rò bụi' : p.clog > 70 ? '⚠ Lọc bẩn — cần vệ sinh' : p.fill > 80 ? '⚠ Hộp gần đầy' : 'Bình thường';
        readout('q', Q);
        readout('vin', vin);
        readout('vbin', vbin);
        readout('dpf', dpF);
        readout('ps', pFan);
        readout('pair', `${pAir.toFixed(1)} W khí · ${pEl.toFixed(0)} W điện`);
        readout('pick', vin > 7 ? 'Cát 1 mm ✓ · bụi mịn ✓' : vin > 2 ? 'Cát ✗ · bụi mịn ✓' : 'Rất yếu ✗');
        readout('st', st);
        return [Q, Math.min(2500, dpF), Math.min(16, vin)];
      },
    };
  },
};
