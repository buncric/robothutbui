const n=`// 🕳️ Cảm biến chống rơi hồng ngoại (cliff sensor) — LED IR + phototransistor đặt chéo trong hộp đen
// Mô hình tín hiệu: I_sig = ρ_sàn · I_max · g(d),  g(d) = 2x²/(1+x⁴), x = d / d_f (d_f = 15 mm: điểm 2 chùm giao nhau)
// Mạch: phototransistor + trở kéo lên 10 kΩ → V = 5 − (I_môi_trường + I_sig)·10 kΩ (càng sáng càng THẤP, CLIFF_LIGHT_LOWERS_V = 1)
// Firmware (sensors.c → cliff_update): đo LED tắt (dark) → bật LED (RD4) 150 µs → đo (lit) → v = dark − lit;
//   v < CLIFF_THRESHOLD (60) 2 lần liên tiếp → "hố".  Chu kỳ 20 ms → ở đây vẽ chậm 50× (1 chu kỳ = 1 s).
// Mô hình CAD thật: robot/cliff-sensor.glb (khối quang 2 lỗ nghiêng ±14°, LED IR333 + PT333 Ø3 mm, bo 24×12, JST ZH-4).
// Mô hình tự dựng (hộp bỏ mặt trước để nhìn vào trong) giữ lại làm "chế độ học".
import { cadAttach } from '../../core/cadParts.js';

const SLOW = 50;            // 20 ms thật = 1 s trên màn hình
const D_F = 15;             // mm — khoảng cách (từ mặt cảm biến) nơi chùm LED và vùng nhìn của phototransistor giao nhau
const I_MAX = 0.25;         // mA — dòng quang điện khi sàn trắng lý tưởng ở đúng d_f, LED 20 mA
const I_AMB_MAX = 0.55;     // mA — nắng chiếu thẳng (đủ làm bão hòa)
const R_LOAD = 10;          // kΩ
const THRESH = 60;          // CLIFF_THRESHOLD trong firmware/pic16f877a_ccs/config.h
const DEPTH = 80;           // mm — độ sâu bậc trong mô hình (bậc cầu thang thật 150–180 mm)
const LED_X = -6, PT_X = 6, EYE_Y = 5;      // vị trí LED / phototransistor so với mặt dưới hộp
const TILT = Math.atan(6 / (D_F + EYE_Y));  // góc nghiêng mỗi bên ≈ 16.7°
const FLOORS = {
  white: { name: 'Gạch men trắng', rho: 0.85, color: 0xf0efe9 },
  wood: { name: 'Sàn gỗ', rho: 0.55, color: 0xa8743f },
  grey: { name: 'Thảm xám', rho: 0.25, color: 0x707070 },
  black: { name: 'Thảm đen / gạch đen bóng', rho: 0.05, color: 0x161616 },
};
const NR = 7;               // số tia vẽ trong chùm LED

export default {
  id: 'cliff-ir',
  name: 'Cảm biến chống rơi (cliff IR)',
  category: 'cam-bien',
  order: 2,
  icon: '🕳️',
  summary: 'Cặp LED hồng ngoại + phototransistor nhìn xuống sàn. Sàn còn → ánh sáng phản xạ về nhiều; gặp mép cầu thang → mất phản xạ → PIC cấm robot tiến. Học cách đo "bật LED − tắt LED" để loại ánh sáng môi trường.',
  tags: ['cliff', 'chống rơi', 'hồng ngoại', 'IR', 'phototransistor', 'ADC', 'cầu thang', 'TCRT5000'],

  params: [
    { id: 'cad', label: '🧊 Mô hình CAD thật (cảm biến cliff robot)', type: 'toggle', value: true, hint: 'Tắt = mô hình học tự dựng (hộp quang bỏ mặt trước để thấy LED và phototransistor bên trong)' },
    { id: 'h', label: 'Độ cao mặt cảm biến so với sàn', type: 'range', min: 4, max: 60, step: 1, value: 15, unit: 'mm' },
    { id: 'edge', label: 'Mép hố cách tâm chùm tia', type: 'range', min: -50, max: 50, step: 1, value: 30, unit: 'mm', hint: 'Dương: sàn còn dưới cảm biến. Âm: cảm biến đã ra quá mép, bên dưới là hố.' },
    { id: 'floor', label: 'Mặt sàn', type: 'select', value: 'wood', options: Object.entries(FLOORS).map(([k, f]) => [k, \`\${f.name} (phản xạ \${Math.round(f.rho * 100)} %)\`]) },
    { id: 'amb', label: 'Ánh sáng môi trường', type: 'range', min: 0, max: 100, step: 1, value: 20, unit: '%', hint: '0 = phòng tối · 20 = đèn trong nhà · 100 = nắng chiếu thẳng xuống sàn' },
    { id: 'pulsed', label: 'Đo 2 lần LED tắt/bật như firmware (CLIFF_LED_PULSED)', type: 'toggle', value: true },
    { id: 'rays', label: 'Hiện tia hồng ngoại (tô màu — thật ra vô hình)', type: 'toggle', value: true },
    { id: 'go', label: '▶ Robot tiến tới mép cầu thang (0.3 m/s)', type: 'button' },
  ],
  readouts: [
    { id: 'd', label: 'Khoảng cách tới mặt phản xạ (tia giữa)', unit: 'mm' },
    { id: 'dark', label: 'ADC khi LED tắt (dark)', unit: '/1023' },
    { id: 'lit', label: 'ADC khi LED bật (lit)', unit: '/1023' },
    { id: 'v', label: 'Hiệu v = dark − lit (cliff_raw)', unit: '' },
    { id: 'hits', label: 'cliff_hits (cần 2 để báo)', unit: '' },
    { id: 'iled', label: 'Dòng LED IR', unit: 'mA' },
    { id: 'state', label: 'Kết luận của PIC', unit: '' },
  ],
  scope: {
    window: 4,
    note: '(làm chậm 50×: 1 chu kỳ đo 20 ms = 1 s; thời gian LED sáng được kéo dài cho dễ nhìn — thật chỉ ~0.6 ms)',
    channels: [
      { name: 'LED IR (RD4)', unit: 'V', min: -0.5, max: 5.5, color: '#ff6b9a' },
      { name: 'V phototransistor (AN1)', unit: 'V', min: 0, max: 5.2, color: '#ffd34d' },
      { name: 'Hiệu v (ngưỡng 60)', unit: '', min: 0, max: 600, color: '#3fcf8e' },
    ],
  },

  faults: [
    { id: 'tham-den', label: 'Robot đi lên thảm đen', severity: 'loi',
      what: '<p>Sàn vẫn còn nhưng v tụt dưới 60 → PIC báo "hố" → robot <b>dừng, lùi, quay đi</b>, không chịu dọn tấm thảm (hoặc dừng hẳn ở mép thảm). Đây là lỗi kinh điển của mọi robot hút bụi dùng cliff IR.</p>',
      why: '<p>Thảm/gạch đen chỉ phản xạ ~5 % hồng ngoại (sàn gỗ ~55 %, gạch trắng ~85 %). Tín hiệu <code>v ∝ ρ</code> nên giảm 10 lần — trông y như "không có sàn". Cảm biến chỉ đo <i>lượng ánh sáng về</i>, không đo được khoảng cách.</p>',
      fix: '<p>Hiệu chỉnh ngưỡng bằng bản tin <code>CLIFF_RAW (0x82)</code> trên chính sàn nhà mình (ngưỡng thấp hơn nhưng vẫn &gt; giá trị khi treo trên hố); dùng cảm biến đo khoảng cách thật (ToF VL53L0X, hoặc tam giác PSD); hoặc cho phép người dùng tắt cliff ở vùng thảm (robot thương mại có "thảm đen = vùng cấm").</p>' },
    { id: 'nang', label: 'Nắng chiếu thẳng xuống sàn', severity: 'loi',
      what: '<p>Trong vệt nắng, cả dark và lit đều bị kéo xuống gần 0 V → hiệu v ≈ 0 → báo hố giả, robot né vệt nắng. Nếu firmware chỉ đo 1 lần (không xung LED) thì ngược lại: v = 1023 − lit rất lớn → <b>không bao giờ thấy hố</b> → rơi cầu thang!</p>',
      why: '<p>Ánh nắng chứa rất nhiều hồng ngoại 940 nm. Dòng quang điện môi trường ~0.5 mA × 10 kΩ = 5 V → phototransistor <b>bão hòa</b> (V<sub>CE(sat)</sub> ≈ 0.1 V): nó không thể kéo thấp hơn nữa, nên phần ánh sáng của LED không còn tạo ra khác biệt.</p>',
      fix: '<p>Luôn dùng cách đo <b>LED tắt/bật rồi lấy hiệu</b> (firmware đã làm). Giảm trở tải (bớt nhạy, khó bão hòa), cửa sổ lọc IR có che sáng, đặt cảm biến lõm sâu trong vỏ. Khi v quá nhỏ mà dark cũng rất thấp → báo "cảm biến bị chói" thay vì "hố".</p>' },
    { id: 'bui-ban', label: 'Cửa sổ cảm biến bám bụi / tóc', severity: 'hong',
      what: '<p>Robot vẫn chạy bình thường trên sàn, nhưng khi tới mép cầu thang <b>không dừng</b> → rơi. Bấm "▶ Robot tiến tới mép" để xem: v trên hố vẫn còn ~130, lớn hơn ngưỡng 60.</p>',
      why: '<p>Lớp bụi trên cửa sổ vừa <b>chắn bớt</b> ánh sáng tới sàn (tín hiệu sàn giảm ~½), vừa <b>tán xạ</b> một phần ánh sáng LED dội thẳng sang phototransistor (rò quang — crosstalk). Phần rò này không phụ thuộc sàn, nên kể cả khi bên dưới là hố, phototransistor vẫn "thấy sáng".</p>',
      fix: '<p>Lau cửa sổ cliff bằng khăn khô mỗi tuần (hướng dẫn sử dụng robot nào cũng ghi). Vách ngăn quang giữa LED và phototransistor phải kín tới sát cửa sổ. Firmware có thể kiểm tra: v trên sàn tụt dần qua nhiều ngày → nhắc vệ sinh.</p>' },
    { id: 'led-khong-tro', label: 'Nối LED IR không có điện trở hạn dòng', severity: 'chay',
      what: '<p>LED chớp sáng rất mạnh vài giây (camera điện thoại thấy tím chói), nóng lên rồi <b>chết hẳn</b>. Từ đó v luôn = 0 → cả 4 cảm biến báo hố → robot không chịu tiến (an toàn nhưng vô dụng).</p>',
      why: '<p>LED là diode: điện áp gần như cố định ~1.3 V, dòng tăng theo hàm mũ. Có điện trở 180 Ω: <code>I = (5 − 1.3 − 0.1)/180 ≈ 20 mA</code>. Không có điện trở, chỉ còn điện trở trong ~1–2 Ω và giới hạn của transistor → <b>hàng trăm mA</b>, gấp ~8 lần định mức 100 mA → mối nối bán dẫn quá nhiệt, dây bond đứt.</p>',
      fix: '<p>Luôn có điện trở nối tiếp LED: <code>R = (V<sub>cc</sub> − V<sub>F</sub> − V<sub>CE</sub>)/I</code>. Đo dòng LED bằng đồng hồ trước khi lắp. LED IR hỏng thì kiểm tra bằng camera điện thoại (không có chấm tím khi bật = hỏng).</p>' },
  ],

  info: {
    overview: \`
      <p>Robot hút bụi có 3–6 <b>cảm biến chống rơi</b> (cliff sensor) ở mặt dưới, phía trước bánh xe. Mỗi cái gồm một <b>LED hồng ngoại</b> (IR, 940 nm — mắt người không thấy) chiếu chéo xuống sàn và một <b>phototransistor</b> (transistor quang) nhìn chéo vào cùng điểm đó. Còn sàn → ánh sáng dội về nhiều. Ra khỏi mép cầu thang → sàn ở quá xa → gần như không có ánh sáng về → <b>"hố"</b>.</p>
      <p>Thử: bấm <b>▶ Robot tiến tới mép cầu thang</b> và xem cột "Hiệu v" tụt dưới 60, PIC dừng robot sau 2 chu kỳ đo. Sau đó chọn sàn <b>Thảm đen</b> (báo hố giả) và kéo <b>Ánh sáng môi trường</b> lên 100 % rồi tắt "Đo 2 lần" — nguy hiểm thế nào?</p>\`,
    specs: [
      ['LED IR', '940 nm, 20 mA (trở hạn dòng 180 Ω từ 5 V), góc phát ±10–20°'],
      ['Phototransistor', 'Vỏ epoxy đen lọc ánh sáng nhìn thấy, đỉnh nhạy 940 nm; dòng tối < 0.1 µA'],
      ['Mạch đo', 'Trở kéo lên 10 kΩ lên 5 V → càng sáng điện áp càng THẤP (<code>CLIFF_LIGHT_LOWERS_V 1</code>)'],
      ['Khoảng cách làm việc', 'Mặt cảm biến cách sàn 10–20 mm; báo hố khi sàn rơi xa thêm ~30–40 mm'],
      ['ADC PIC', '10-bit, 0–5 V → 0–1023; clock Fosc/32; thời gian lấy mẫu 20 µs'],
      ['Chu kỳ đo', '20 ms (50 Hz), mỗi lần ~0.5 ms; LED chỉ sáng ~0.6 ms → công suất trung bình rất nhỏ'],
      ['Ngưỡng', '<code>CLIFF_THRESHOLD = 60</code>, cần <b>2 lần liên tiếp</b> mới báo (lọc nhiễu) → độ trễ 20–40 ms'],
      ['Quãng đường phanh', '0.3 m/s × 40 ms ≈ <b>12 mm</b> — cảm biến phải đặt trước bánh xe/ bánh xoay ít nhất vài cm'],
    ],
    principle: \`
      <h4>1. Phototransistor = transistor có "cửa sổ"</h4>
      <p>Ánh sáng chiếu vào mối nối base–collector tạo ra dòng quang điện, đóng vai trò dòng base → transistor dẫn: <code>I<sub>C</sub> ≈ k·E</code> (E: cường độ chiếu sáng). Với trở kéo lên R = 10 kΩ: <code>V<sub>ra</sub> = 5 V − I<sub>C</sub>·R</code>, nhưng không xuống dưới V<sub>CE(sat)</sub> ≈ 0.1 V (bão hòa).</p>
      <h4>2. Bao nhiêu ánh sáng quay về?</h4>
      <p>LED và phototransistor nghiêng ~17° về nhau, hai "nón" giao nhau ở d<sub>f</sub> ≈ 15 mm. Mô hình: <code>I<sub>sig</sub> = ρ · I<sub>max</sub> · g(d)</code>, <code>g = 2x²/(1+x⁴)</code>, x = d/d<sub>f</sub>. Xa hơn d<sub>f</sub>: giảm như 1/d² (ánh sáng tỏa ra) và hai nón lệch nhau. ρ là hệ số phản xạ hồng ngoại của sàn.</p>
      <h4>3. Đo 2 lần để loại ánh sáng môi trường</h4>
      <p>Ánh đèn, nắng cũng có hồng ngoại. Firmware đo khi <b>LED tắt</b> (chỉ có môi trường) rồi khi <b>LED bật</b> (môi trường + phản xạ), lấy hiệu: <code>v = dark − lit</code> — phần môi trường triệt tiêu, chỉ còn phần do LED. Không có hố khi <code>v ≥ 60</code>.</p>
      <h4>4. Lọc nhiễu "2 lần liên tiếp"</h4>
      <p><code>if (v &lt; 60) hits++ else hits = 0; cliff = hits ≥ 2</code> — một mẫu nhiễu đơn lẻ (bụi bay qua, rung) không làm robot dừng oan.</p>
      <div class="tip">Cảm biến IR kiểu này đo <b>cường độ</b>, không đo <b>khoảng cách</b>. Nên sàn tối màu ở gần trông giống sàn sáng ở xa. Muốn đo khoảng cách thật: cảm biến ToF (thời gian bay) hoặc tam giác lượng (PSD, như lidar).</div>\`,
    inRobot: \`
      <ul>
        <li>4 cảm biến: <b>#1 trái → RA1/AN1 (chân 3)</b>, #2 trước-trái → RA2/AN2 (4), #3 trước-phải → RA3/AN3 (5), <b>#4 phải → RA5/AN4 (7)</b>.</li>
        <li>LED của cả 4 bật chung qua transistor do <b>RD4 (chân 27)</b> điều khiển.</li>
        <li><code>sensors.c → cliff_update()</code> gọi mỗi 20 ms: đo dark ×4 → <code>output_high(PIN_CLIFF_LED)</code> → <code>delay_us(150)</code> → đo lit ×4 → tắt LED → tính v, cập nhật <code>cliff_mask</code>.</li>
        <li><b>Phản xạ an toàn trên PIC</b>: bit cliff = 1 → ép mọi tốc độ dương về 0 (chỉ cho lùi/quay), báo bit trong khung STATUS → ESP32 (sự kiện <code>E,CLIFF</code> lên app) lùi 60 mm rồi quay 100–170°.</li>
        <li>Hiệu chỉnh ngưỡng: ESP32 nhận <code>CLIFF_RAW (0x82)</code> 5 Hz = 4 giá trị v. Đặt robot trên sàn nhà bạn và trên mép bàn, ghi lại 2 giá trị, chọn ngưỡng ở giữa.</li>
        <li>Thiếu cảm biến nào: tắt bit tương ứng trong <code>CLIFF_ENABLE_MASK</code> (đừng để chân ADC thả nổi).</li>
      </ul>\`,
    mistakes: \`
      <ul>
        <li>Không đo LED tắt/bật → nắng làm robot rơi cầu thang hoặc dừng loạn.</li>
        <li>Thảm đen → báo hố giả: hiểu đây là giới hạn vật lý, không phải lỗi code.</li>
        <li>Quên lau cửa sổ cliff → rò quang → không phát hiện hố.</li>
        <li>Nhầm kiểu mạch (trở kéo lên vs kéo xuống) mà không đổi <code>CLIFF_LIGHT_LOWERS_V</code> → v luôn 0 → luôn báo hố.</li>
        <li>Đặt cảm biến quá sát sau bánh xoay phía trước → khi phát hiện thì bánh xoay đã lọt mép.</li>
        <li>LED không có trở hạn dòng → cháy LED.</li>
      </ul>\`,
    quiz: [
      { q: 'Vì sao firmware đo ADC 2 lần (LED tắt rồi LED bật) mà không chỉ đo 1 lần?', a: 'Để trừ đi phần ánh sáng môi trường (đèn, nắng có hồng ngoại). Hiệu dark − lit chỉ còn phần ánh sáng do chính LED phản xạ về.' },
      { q: 'Với mạch trở kéo lên 10 kΩ, sàn càng sáng thì điện áp AN1 tăng hay giảm? Nếu dòng quang 0.25 mA thì V bằng bao nhiêu?', a: 'Giảm. V = 5 − 0.25 mA × 10 kΩ = 2.5 V.' },
      { q: 'Robot chạy 0.3 m/s, đo 20 ms/lần, cần 2 lần liên tiếp mới báo hố. Robot đi thêm tối đa bao xa sau khi cảm biến ra khỏi mép?', a: 'Tối đa 2–3 chu kỳ ≈ 40–60 ms → 12–18 mm (chưa tính quãng phanh). Vì vậy cảm biến phải đặt trước bánh xe vài cm.' },
    ],
  },

  build(ctx) {
    const { THREE, MAT, geom, label, readout, fx } = ctx;
    const { mesh, group, part, cyl, box, wire } = geom;
    const root = new THREE.Group();

    // ---------- sàn: sàn trên (co giãn tới mép) + sàn dưới (đáy bậc) ----------
    const floorMat = MAT.plasticWhite.clone();
    floorMat.roughness = 0.8;
    const upper = mesh(box(1, 10, 70), floorMat, { y: -5 });
    root.add(part(upper, 'Mặt sàn', 'Bề mặt phản xạ hồng ngoại. Hệ số phản xạ ρ quyết định cường độ tín hiệu: gạch trắng ~85 %, gỗ ~55 %, thảm xám ~25 %, thảm đen ~5 %.'));
    const lower = mesh(box(140, 10, 70), floorMat, { y: -DEPTH - 5 });
    root.add(part(lower, \`Đáy hố / bậc dưới (mô hình sâu \${DEPTH} mm)\`, 'Bậc cầu thang thật sâu 150–180 mm — tín hiệu còn nhỏ hơn nữa. Ở khoảng cách này ánh sáng phản xạ yếu đi theo 1/d² và lệch khỏi vùng nhìn của phototransistor.'));
    const edgeMark = new THREE.Group();
    root.add(edgeMark);
    label(edgeMark, 'Mép hố', [0, 2, 36]);

    // ---------- cụm cảm biến (gốc = mặt dưới hộp) ----------
    const sensor = new THREE.Group();
    root.add(sensor);
    // vỏ robot (mặt dưới) bao quanh cảm biến
    const shellParts = [
      mesh(box(70, 2.5, 12), MAT.plasticDark, { y: 1.25, z: 14 }),
      mesh(box(70, 2.5, 12), MAT.plasticDark, { y: 1.25, z: -14 }),
      mesh(box(19, 2.5, 16), MAT.plasticDark, { x: 25.5, y: 1.25 }),
      mesh(box(19, 2.5, 16), MAT.plasticDark, { x: -25.5, y: 1.25 }),
    ];
    sensor.add(part(group(...shellParts), 'Vỏ đáy robot', 'Cảm biến lắp lõm trong vỏ đáy, phía trước bánh xe và bánh xoay — để kịp dừng trước khi bánh chạm mép.'));
    const win = mesh(box(30, 0.8, 16), new THREE.MeshStandardMaterial({ color: 0x401018, transparent: true, opacity: 0.35, roughness: 0.1 }), { y: 0.4 });
    win.userData.noCut = true;
    sensor.add(part(win, 'Cửa sổ lọc IR', 'Nhựa sẫm màu: cho hồng ngoại đi qua, chặn bớt ánh sáng nhìn thấy, che bụi. Bụi bám ở đây gây rò quang — phải lau định kỳ.'));
    const housing = group(
      mesh(box(30, 2, 16), MAT.plasticBlack, { y: 12 }),
      mesh(box(30, 11, 2), MAT.plasticBlack, { y: 6, z: -7 }),
      mesh(box(2, 11, 16), MAT.plasticBlack, { x: -14, y: 6 }),
      mesh(box(2, 11, 16), MAT.plasticBlack, { x: 14, y: 6 }),
    );
    sensor.add(part(housing, 'Hộp quang đen (đã bỏ mặt trước để nhìn vào trong)', 'Nhựa đen mờ hấp thụ hồng ngoại, giữ LED và phototransistor đúng góc nghiêng ~17°.'));
    const divider = mesh(box(2, 10, 14), MAT.plasticBlack, { y: 6 });
    sensor.add(part(divider, 'Vách ngăn quang', 'Chặn ánh sáng đi THẲNG từ LED sang phototransistor. Thiếu vách → phototransistor luôn "thấy sáng" kể cả trên hố.'));

    // LED IR (nghiêng về phía +x)
    const ledLensMat = new THREE.MeshStandardMaterial({ color: 0x9fb8ff, roughness: 0.15, transparent: true, opacity: 0.85 });
    const ledBody = mesh(cyl(1.5, 1.5, 4.2, 20), ledLensMat, { y: 0.3 });
    const ledDome = mesh(new THREE.SphereGeometry(1.5, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), ledLensMat, { y: -1.8 });
    const ledRim = mesh(cyl(1.85, 1.85, 0.8, 20), ledLensMat, { y: 2.2 });
    const ledLegs = [-0.6, 0.6].map((x) => mesh(box(0.4, 6, 0.4), MAT.tin, { x, y: 5.5 }));
    const led = group(ledBody, ledDome, ledRim, ...ledLegs);
    led.position.set(LED_X, EYE_Y, 0);
    led.rotation.z = TILT;
    sensor.add(part(led, 'LED hồng ngoại 940 nm (Ø3 mm)', 'Phát ánh sáng hồng ngoại khi PIC bật RD4 (qua transistor). Dòng 20 mA nhờ điện trở 180 Ω. Mắt không thấy — camera điện thoại thấy chấm tím.'));
    // phototransistor (nghiêng về phía −x)
    const ptMat = new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.2 });
    const ptBody = mesh(cyl(1.5, 1.5, 4.2, 20), ptMat, { y: 0.3 });
    const ptDome = mesh(new THREE.SphereGeometry(1.5, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), ptMat, { y: -1.8 });
    const ptRim = mesh(cyl(1.85, 1.85, 0.8, 20), ptMat, { y: 2.2 });
    const ptLegs = [-0.6, 0.6].map((x) => mesh(box(0.4, 6, 0.4), MAT.tin, { x, y: 5.5 }));
    const pt = group(ptBody, ptDome, ptRim, ...ptLegs);
    pt.position.set(PT_X, EYE_Y, 0);
    pt.rotation.z = -TILT;
    sensor.add(part(pt, 'Phototransistor (vỏ epoxy đen lọc sáng)', 'Ánh sáng hồng ngoại chiếu vào → transistor dẫn → kéo điện áp ra xuống thấp. Vỏ đen lọc bớt ánh sáng nhìn thấy.'));
    // bo mạch nhỏ phía trên
    const pcbM = mesh(box(30, 1.6, 16, 0.4), MAT.pcbGreen, { y: 13.8 });
    sensor.add(part(pcbM, 'Bo cảm biến', 'Đường mạch nối LED, phototransistor, 2 điện trở và đầu nối 4 dây ra bo chính.'));
    const rLed = mesh(box(2, 0.5, 1.25), MAT.icBody, { x: -8, y: 14.85, z: 4 });
    sensor.add(part(rLed, 'Điện trở hạn dòng LED 180 Ω', 'I = (5 − 1.3 − 0.1)/180 ≈ 20 mA. Thiếu nó LED cháy. <a href="#/c/dien-tro">Xem chi tiết →</a>'));
    const rLoad = mesh(box(2, 0.5, 1.25), MAT.icBody, { x: 8, y: 14.85, z: 4 });
    sensor.add(part(rLoad, 'Trở kéo lên 10 kΩ (tải phototransistor)', 'Biến dòng quang điện thành điện áp: V = 5 − I·10 kΩ. Trở lớn → nhạy hơn nhưng dễ bão hòa khi nắng.'));
    const conn = mesh(box(10, 4, 5, 0.4), MAT.plasticWhite, { x: 0, y: 16.6, z: -4 });
    const cables = [[-3, 0xd23b3b], [-1, 0x222222], [1, 0xff8c1a], [3, 0x2fbf71]].map(([x, color]) =>
      wire([[x, 18.6, -4], [x, 24, -4], [x * 1.4, 30, -12], [x * 1.8, 34, -24]], { radius: 0.35, color }));
    const connG = part(group(conn, ...cables), 'Dây ra bo PIC: 5 V · GND · LED_EN (RD4) · OUT (AN1)', 'OUT vào chân analog RA1/AN1 (cảm biến #1). LED_EN qua transistor do RD4 điều khiển — 4 cảm biến bật LED chung.');
    sensor.add(connG);
    const procLabels = new THREE.Group();
    sensor.add(procLabels);
    label(procLabels, 'LED IR', [LED_X - 8, EYE_Y + 2, 9]);
    label(procLabels, 'Phototransistor', [PT_X + 10, EYE_Y + 2, 9]);
    label(procLabels, '→ AN1 · RD4', [0, 34, -24]);

    // ---------- mô hình CAD thật (khung GLB: mặt cửa sổ ở y = 0 nhìn xuống −Y, bo mạch ở trên) ----------
    // Trùng gốc với \`sensor\` (gốc = mặt dưới hộp) → không cần dời. Hai chùm nghiêng ±14° giao nhau ~18 mm dưới cửa sổ.
    const cadR = {};
    const cad = cadAttach(ctx, sensor, 'robot/cliff-sensor', {
      onBottom: false,
      hide: [housing, divider, led, pt, pcbM, rLed, rLoad, connG, procLabels, win],   // cửa sổ lọc tự dựng trùng mặt cửa sổ CAD → ẩn
      partDefault: ['Cảm biến chống rơi (CAD thật)', 'Mô hình CAD: khối quang đen 18 × 9 × 9 mm, LED IR + phototransistor Ø3 mm nghiêng ±14°, bo 24 × 12 mm, giắc JST ZH 4 chân.'],
      parts: {
        housing: ['Khối quang đen (PC/ABS) 18 × 9 × 9 mm', 'Hai lỗ Ø3.4 khoan nghiêng ±14° để chùm LED và vùng nhìn của phototransistor giao nhau ~18 mm dưới cửa sổ. Vách giữa 2 lỗ chặn ánh sáng đi thẳng; tai bắt vít Ø2.4.'],
        ir_led: ['LED hồng ngoại 940 nm (Ø3 mm, IR333)', 'Phát hồng ngoại khi PIC bật RD4 (qua transistor), 20 mA nhờ trở 180 Ω. Mắt người không thấy — ở đây tô tím mờ giống camera điện thoại nhìn thấy.'],
        phototransistor: ['Phototransistor PT333 (Ø3 mm, vỏ epoxy đen)', 'Hồng ngoại phản xạ chiếu vào → transistor dẫn → kéo điện áp AN1 xuống. Ở đây sáng xanh lá mờ = đang dẫn (càng sáng càng dẫn mạnh).'],
        leads: ['Chân LED + phototransistor', 'Hàn xuyên lỗ lên bo. Chân dài là anode (LED) / collector (phototransistor) — cắm ngược là không hoạt động.'],
        pcb: ['Bo cảm biến 24 × 12 mm', 'Nối LED, phototransistor, 2 điện trở và đầu nối 4 chân ra bo chính.'],
        smd: ['Điện trở 0603: 180 Ω (hạn dòng LED) + 10 kΩ (tải phototransistor)', 'I_LED = (5 − 1.3 − 0.1)/180 ≈ 20 mA. Trở tải biến dòng quang thành điện áp: V = 5 − I·10 kΩ.'],
        conn_header: ['Đầu cái JST-ZH 4 chân (bước 1.5 mm)', 'Chân: LED+, LED−, PT_C, GND. Rút giắc thẳng lên theo trục, không kéo dây.'],
        conn_pins: ['Chân đầu nối JST-ZH', '4 chân hàn xuyên lỗ.'],
        plug_housing: ['Giắc cắm JST-ZH 4 chân', 'Có khóa, cắm 1 chiều. Lỏng giắc → mất tín hiệu → PIC luôn thấy "hố" (an toàn khi hỏng).'],
        wire_1: ['Dây LED+ (anode)', 'Lên 5 V qua trở 180 Ω trên bo.'],
        wire_2: ['Dây LED− (cathode)', 'Về transistor đóng/ngắt do RD4 (chân 27) điều khiển — 4 cảm biến bật LED chung.'],
        wire_3: ['Dây PT_C → AN1', 'Collector phototransistor → RA1/AN1 (cảm biến #1), có trở kéo lên 10 kΩ: càng sáng điện áp càng THẤP.'],
        wire_4: ['Dây GND', 'Emitter phototransistor + GND chung với bo PIC.'],
      },
      labels: [['LED IR', 'ir_led', [-9, -3, 8]], ['Phototransistor', 'phototransistor', [11, -3, 8]], ['→ AN1 · RD4', 'conn_cliff', [0, 13, 0]]],
      onLoad(c) {
        cadR.led = c.node('ir_led');
        cadR.pt = c.node('phototransistor');
      },
    });
    let ptGlow = -1;

    // ---------- tia hồng ngoại (đường) + vệt sáng trên sàn ----------
    const rayPos = new Float32Array(NR * 4 * 3);
    const rayCol = new Float32Array(NR * 4 * 3);
    const rayGeo = new THREE.BufferGeometry();
    rayGeo.setAttribute('position', new THREE.BufferAttribute(rayPos, 3));
    rayGeo.setAttribute('color', new THREE.BufferAttribute(rayCol, 3));
    const rays = new THREE.LineSegments(rayGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    rays.frustumCulled = false;
    rays.raycast = () => {};
    root.add(rays);
    const spotMat = new THREE.MeshBasicMaterial({ color: 0xff3d8a, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
    const spot = new THREE.Mesh(new THREE.CircleGeometry(1, 32), spotMat);
    spot.rotation.x = -Math.PI / 2;
    spot.raycast = () => {};
    root.add(spot);

    // ---------- trạng thái ----------
    let edgeX = 30, lastEdgeP = 30, cyc = 0, lastCyc = -1, dark = 0, lit = 0, v = 0, hits = 0, cliff = false;
    let anim = null, fault = null, faultT = 0, ledDead = false;
    const W = [];
    for (let i = 0; i < NR; i++) { const a = (i / (NR - 1)) * 2 - 1; W.push(Math.exp(-2 * a * a)); }
    const sumW = W.reduce((a, b) => a + b, 0);
    const adc = (V) => Math.round((Math.max(0, Math.min(5, V)) / 5) * 1023);
    const vOf = (I) => Math.max(0.12, 5 - I * R_LOAD);

    // bắn tia thứ i từ LED; trả về [x, y] điểm chạm (y = 0 sàn trên hoặc −DEPTH)
    function castRay(i, h) {
      const off = ((i / (NR - 1)) * 2 - 1) * 0.17;                 // ±10° quanh trục LED
      const a = TILT + off;
      const ox = LED_X + Math.sin(TILT) * 2, oy = h + EYE_Y - Math.cos(TILT) * 2;
      const dx = Math.sin(a), dy = -Math.cos(a);
      let k = -oy / dy, x = ox + dx * k;
      if (x < edgeX) return [ox, oy, x, 0];
      k = (-DEPTH - oy) / dy;
      return [ox, oy, ox + dx * k, -DEPTH];
    }

    return {
      object: root,
      onAction(id) {
        if (id === 'go') { anim = { phase: 'fwd', t: 0, passed: null, stopAt: null }; edgeX = 25; }
      },
      triggerFault(id) { fault = id; faultT = 0; ledDead = false; },
      resetFault() { fault = null; ledDead = false; ptGlow = -1; },
      update(dt, t, p) {
        faultT += dt;
        const fl = FLOORS[fault === 'tham-den' ? 'black' : p.floor] || FLOORS.wood;
        floorMat.color.setHex(fl.color);
        const amb = fault === 'nang' ? 100 : p.amb;
        const h = p.h;
        // người học kéo thanh trượt → đặt mép hố theo thanh trượt (hủy hoạt cảnh nếu đang chạy)
        if (p.edge !== lastEdgeP) { edgeX = p.edge; lastEdgeP = p.edge; anim = null; }

        // ----- robot tiến tới mép (0.3 m/s thật → 6 mm/s trên màn hình) -----
        if (anim) {
          anim.t += dt;
          const vDisp = 300 / SLOW;
          if (anim.phase === 'fwd') edgeX -= vDisp * dt;
          else if (anim.phase === 'stop' && anim.t > 1.2) anim.phase = 'back';
          else if (anim.phase === 'back') { edgeX += vDisp * dt; if (anim.t > 5) anim = null; }
          if (anim && anim.passed === null && edgeX < 0) anim.passed = edgeX;
          if (anim && anim.phase === 'fwd' && edgeX < -55) { anim.phase = 'fell'; anim.t = 0; }
          if (anim && anim.phase === 'fell' && anim.t > 3) anim = null;
        }

        // ----- hình học -----
        sensor.position.y = h;
        upper.scale.x = Math.max(0.01, edgeX + 70);
        upper.position.x = (edgeX - 70) / 2;
        upper.visible = edgeX > -70;
        edgeMark.position.x = edgeX;

        // ----- chu kỳ đo 20 ms (vẽ thành 1 s): 0–0.4 LED tắt (đo dark ở 0.3) · 0.4–0.75 LED bật (đo lit ở 0.7) -----
        const pulsed = p.pulsed;
        cyc = (t % 1);
        const ledOnCmd = pulsed ? (cyc >= 0.4 && cyc < 0.75) : true;
        let iLed = 20;
        if (fault === 'led-khong-tro') {
          iLed = ledDead ? 0 : 780;
          if (!ledDead && faultT > 2) {
            ledDead = true;
            const ledT = cad.active && cadR.led ? cadR.led : led;
            fx.flash(ledT, { size: 10, color: 0xd080ff, intensity: 6 });
            fx.sparks(ledT, { count: 14, speed: 20, size: 0.4 });
            fx.smoke(ledT, { size: 3, duration: 3 });
            fx.scorch(ledT, 0.85);
          }
        }
        const ledOn = ledOnCmd && iLed > 0;
        const power = iLed / 20;                                   // so với định mức

        // tín hiệu phản xạ: trung bình có trọng số các tia
        let sig = 0, dMid = 0;
        for (let i = 0; i < NR; i++) {
          const [ox, oy, hx, hy] = castRay(i, h);
          const d = Math.max(0.5, h - hy);
          const x = d / D_F;
          const g = (2 * x * x) / (1 + x * x * x * x);
          sig += W[i] * g;
          if (i === (NR - 1) / 2) dMid = d;
          // vẽ tia: LED → điểm chạm → phototransistor
          const ptx = PT_X - Math.sin(TILT) * 2, pty = h + EYE_Y - Math.cos(TILT) * 2;
          rayPos.set([ox, oy, 0, hx, hy, 0, hx, hy, 0, ptx, pty, 0], i * 12);
          const bright = ledOn && p.rays ? 1 : 0.0;
          const back = bright * Math.min(1, g * fl.rho * 1.4 * Math.min(power, 3));
          rayCol.set([0.9 * bright, 0.15 * bright, 0.5 * bright, 0.9 * bright, 0.15 * bright, 0.5 * bright,
            0.9 * back, 0.2 * back, 0.6 * back, 0.9 * back, 0.2 * back, 0.6 * back], i * 12);
        }
        rayGeo.attributes.position.needsUpdate = true;
        rayGeo.attributes.color.needsUpdate = true;
        sig /= sumW;
        let iSig = fl.rho * I_MAX * sig * Math.min(power, 1.6);
        if (fault === 'bui-ban') iSig = iSig * 0.5 + 0.07 * Math.min(power, 1.6);   // chắn bớt + rò quang qua lớp bụi
        const iAmb = (amb / 100) * I_AMB_MAX;
        // vệt sáng trên sàn tại tia giữa
        const [, , sx, sy] = castRay((NR - 1) / 2, h);
        spot.position.set(sx, sy + 0.15, 0);
        spot.scale.setScalar(Math.max(1.2, dMid * Math.tan(0.17)));
        spot.visible = ledOn && p.rays;
        spotMat.opacity = Math.min(0.9, 0.25 + fl.rho * 0.6) * Math.min(1, power);
        // LED phát sáng (tô tím cho mắt thấy)
        const lm = ledBody.material;
        if (lm.emissive) { lm.emissive.setRGB(ledOn ? 0.55 : 0, 0.05, ledOn ? 0.9 : 0); lm.emissiveIntensity = ledOn ? Math.min(3, 0.6 * power) : 0; }
        // CAD thật: LED tím mờ khi bật (giả lập camera thấy IR), phototransistor xanh lá theo mức dẫn
        if (cad.sync(p)) {
          if (cadR.led) cad.glow(cadR.led, ledOn ? 0xa040ff : 0x000000, ledOn ? Math.min(2, 0.35 * power) : 0);
          const k = Math.round(Math.min(1, (iAmb + (ledOn ? iSig : 0)) / I_MAX) * 20) / 20;   // lượng tử hoá → ít cập nhật vật liệu
          if (cadR.pt && k !== ptGlow) { ptGlow = k; cad.glow(cadR.pt, 0x30ff80, 0.6 * k); }
        } else ptGlow = -1;

        // ----- điện áp tức thời trên AN1 (cho máy hiện sóng) -----
        const vNow = vOf(iAmb + (ledOn ? iSig : 0));
        // ----- firmware: lấy mẫu dark ở 0.3, lit ở 0.7, tính khi qua 0.75 -----
        if (pulsed) {
          if (cyc >= 0.3 && lastCyc < 0.3) dark = adc(vOf(iAmb));
          if (cyc >= 0.7 && lastCyc < 0.7) lit = adc(vOf(iAmb + (iLed > 0 ? iSig : 0)));
        } else if (cyc >= 0.7 && lastCyc < 0.7) { lit = adc(vOf(iAmb + (iLed > 0 ? iSig : 0))); dark = 1023; }
        const cycleEnd = cyc >= 0.75 && lastCyc < 0.75;
        lastCyc = cyc;
        if (cycleEnd) {
          v = pulsed ? (dark > lit ? dark - lit : 0) : 1023 - lit;
          if (v < THRESH) { if (hits < 2) hits++; } else hits = 0;
          cliff = hits >= 2;
          if (anim && anim.phase === 'fwd' && cliff) { anim.phase = 'stop'; anim.t = 0; anim.stopAt = edgeX; }
        }

        readout('d', dMid);
        readout('dark', pulsed ? dark : '— (không đo)');
        readout('lit', lit);
        readout('v', v);
        readout('hits', hits);
        readout('iled', ledOn ? iLed : 0);
        let st = cliff ? '🕳️ HỐ → PIC cấm tiến (cliff_mask = 1)' : '✓ Có sàn';
        if (anim?.phase === 'stop' || anim?.phase === 'back') {
          const over = anim.passed !== null ? Math.max(0, anim.passed - anim.stopAt) : 0;
          st = \`🛑 Dừng! Đi thêm \${over.toFixed(0)} mm sau mép (độ trễ 2 chu kỳ đo) → lùi lại\`;
        } else if (anim?.phase === 'fell') st = '❌ KHÔNG phát hiện hố — robot rơi xuống cầu thang!';
        else if (anim?.phase === 'fwd') st = (cliff ? '🕳️ ' : '→ Đang tiến… ') + \`v = \${v}\`;
        if (fault === 'led-khong-tro' && !ledDead) st = '🔥 LED quá dòng ~780 mA (định mức 100 mA)!';
        else if (ledDead) st = '💀 LED IR đã cháy → v = 0 → luôn báo hố';
        else if (amb >= 90 && pulsed && dark < 80) st = '☀️ Phototransistor bão hòa → hiệu v ≈ 0 → báo hố giả';
        readout('state', st);
        return [pulsed ? (ledOnCmd ? 5 : 0) : 5, vNow, v];
      },
    };
  },
};
`;export{n as default};
