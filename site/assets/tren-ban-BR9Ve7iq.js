const n=`// 🖥️ Môi trường mô phỏng "Trên mặt bàn" — bài học về CẢM BIẾN CHỐNG RƠI (cliff IR)
// Bàn làm việc 1.6 × 0.9 m cao 75 cm, trên có laptop, sách, cốc, dây sạc. Robot dùng đúng logic firmware
// (robot-brain.js): PIC đọc 4 cảm biến IR mỗi 20 ms như cliff_update(), hiệu ADC < CLIFF_THRESHOLD hai lần
// liên tiếp → chặn tiến; ESP32 nhận CLIFF → lùi + xoay. Tắt cảm biến → robot lao khỏi bàn, rơi, vỡ.
// Đồ trên bàn (laptop, cốc, sách, dây sạc…) là đồ vật kéo-thả (sandbox, core/editor.js) — đặt lên mặt bàn,
// dời/xoá cả khi robot đang chạy; vật cản mô phỏng dựng lại ngay (src/sim/sandbox-world.js).
// Tọa độ 2D (x, y) mm: góc trước-trái mặt bàn là (0, 0); three.js: (x, h, −y) trong \`root\` đã dời về giữa.
import { createSandbox } from '../../core/editor.js';
import { World2D, CoverageGrid } from '../../sim/world2d.js';
import { rebuildWorld, syncMovables, restoreMovables } from '../../sim/sandbox-world.js';
import { RobotSim, RG, fmtTime } from '../../sim/robot-sim.js';
import { PIC_CFG } from '../../sim/robot-brain.js';
import { buildRobot, poseRobot, buildCoverageOverlay, CameraRig, createKeyboard, releaseFocus, floorPicker, ledColor, bits } from '../../sim/scene-kit.js';

const DESK_W = 1600, DESK_D = 900, DESK_H = 750;
// Kịch bản = bố cục đồ mẫu (nạp vào sandbox) + tư thế xuất phát của robot
const SCEN = {
  mep: { pose: { x: 420, y: 280, th: 0 } },
  'day-coc': { pose: { x: 380, y: 300, th: 0 } },
  'don-ban': { pose: { x: 640, y: 330, th: 0.3 } },
  'ui-laptop': { pose: { x: 380, y: 560, th: 0 } },
};
const STATUS_VI = { ok: '', falling: 'ĐANG RƠI KHỎI BÀN!', fallen: 'Đã rơi xuống sàn', broken: '💥 ROBOT HỎNG (rơi 75 cm)' };

export default {
  id: 'tren-ban',
  name: 'Trên mặt bàn (thử cảm biến chống rơi)',
  category: 'mo-phong',
  order: 2,
  icon: '🖥️',
  summary: 'Robot trên bàn làm việc cao 75 cm. Xem 4 tia hồng ngoại và giá trị ADC giống hệt cliff_update() của PIC: bật cảm biến thì robot dừng sát mép; tắt đi thì lao khỏi bàn, rơi, vỡ tung. Thử đẩy cốc, ủi laptop, bàn đen, nắng chiếu.',
  tags: ['cliff', 'chống rơi', 'hồng ngoại', 'IR', 'ADC', 'ngưỡng', 'mép bàn', 'rơi', 'mô phỏng'],

  params: [
    { id: 'scen', label: 'Kịch bản (nạp bố cục mẫu)', type: 'select', value: 'day-coc', options: [['day-coc', 'Đẩy cốc cà phê ra mép'], ['mep', 'Chạy thẳng ra mép bàn'], ['don-ban', 'Dọn bàn đầy đồ (AUTO)'], ['ui-laptop', 'Ủi laptop (thử tắt bumper)'], ['giu', '— Bố cục tự bày (giữ nguyên) —']] },
    { id: 'algo', label: 'Thuật toán', type: 'select', value: 'AUTO', options: [['AUTO', 'AUTO (đi thẳng, gặp mép → lùi + xoay)'], ['ZIGZAG', 'ZIGZAG'], ['SPIRAL', 'SPIRAL'], ['MANUAL', 'MANUAL — phím mũi tên/WASD']] },
    { id: 'speed', label: 'Tốc độ mô phỏng', type: 'select', value: '1', options: [['0.25', '¼× (quay chậm)'], ['0.5', '½×'], ['1', '1×'], ['2', '2×'], ['4', '4×'], ['8', '8×']] },
    { id: 'start', label: '▶ Bắt đầu / chạy tiếp', type: 'button' },
    { id: 'pause', label: '⏸ Tạm dừng', type: 'button' },
    { id: 'reset', label: '↺ Đặt lại (robot + đồ về chỗ cũ)', type: 'button' },
    { id: 'place', label: '📍 Đặt robot (rồi bấm lên mặt bàn)', type: 'button' },
    { id: 'cam', label: 'Camera', type: 'select', value: 'free', options: [['free', 'Tự do'], ['top', 'Nhìn từ trên'], ['follow', 'Bám theo robot']] },
    { id: 'cliff', label: 'Cảm biến chống rơi (cliff)', type: 'toggle', value: true, hint: 'Tắt = CLIFF_ENABLE_MASK 0x00' },
    { id: 'bumper', label: 'Bumper', type: 'toggle', value: true },
    { id: 'rays', label: 'Hiện tia IR + giá trị ADC', type: 'toggle', value: true },
    { id: 'heat', label: 'Bản đồ độ phủ mặt bàn', type: 'toggle', value: false },
    { id: 'thr', label: 'CLIFF_THRESHOLD (ngưỡng ADC)', type: 'range', min: 10, max: 400, step: 5, value: PIC_CFG.CLIFF_THRESHOLD, unit: '' },
  ],
  readouts: [
    { id: 'time', label: 'Thời gian', unit: '' },
    { id: 'state', label: 'Chế độ · trạng thái', unit: '' },
    { id: 'a1', label: 'Cliff #1 trái (AN1)', unit: '' },
    { id: 'a2', label: 'Cliff #2 trước-trái (AN2)', unit: '' },
    { id: 'a3', label: 'Cliff #3 trước-phải (AN3)', unit: '' },
    { id: 'a4', label: 'Cliff #4 phải (AN4)', unit: '' },
    { id: 'mask', label: 'cliff_mask · block_fwd', unit: '' },
    { id: 'edge', label: 'Tâm robot cách mép bàn', unit: 'mm' },
    { id: 'cov', label: 'Độ phủ mặt bàn', unit: '%' },
    { id: 'ev', label: 'Sự kiện gần nhất', unit: '' },
  ],
  scope: {
    window: 6,
    note: '(hiệu ADC tắt/bật LED của 4 cảm biến; dưới ngưỡng 60 = "không thấy sàn")',
    channels: [
      { name: '#1 trái', unit: '', min: 0, max: 700, color: '#4cc2ff' },
      { name: '#2 trước-trái', unit: '', min: 0, max: 700, color: '#ffd34d' },
      { name: '#3 trước-phải', unit: '', min: 0, max: 700, color: '#ff6b9a' },
      { name: '#4 phải', unit: '', min: 0, max: 700, color: '#3fcf8e' },
    ],
  },

  info: {
    overview: \`
      <p>Thử robot <b>trên bàn</b> là việc ai làm đồ án cũng làm — và cũng là cách nhanh nhất để <b>làm rơi vỡ robot</b>. Môi trường này cho bạn "rơi thử" bao nhiêu lần cũng được.</p>
      <p>Dưới đáy robot có <b>4 cảm biến chống rơi</b> (cliff) nhìn xuống. Mỗi 20 ms PIC16F877A đo từng cảm biến 2 lần: <b>tắt</b> rồi <b>bật</b> LED hồng ngoại. Hiệu 2 lần đo (số ADC 0–1023) cho biết mặt phẳng bên dưới phản xạ mạnh cỡ nào. Tia <span style="color:#3fcf8e">xanh</span> = thấy mặt bàn; tia <span style="color:#ff5050">đỏ</span> = hiệu &lt; ngưỡng → "hố".</p>
      <p><b>Bày đồ</b>: bảng <b>📦 Đồ trên bàn</b> (góc trái khung 3D) — kéo laptop, cốc, sách, điện thoại, dây sạc, chậu cây… lên mặt bàn; bấm chọn rồi kéo để dời, Q/E xoay, Del xoá. Làm được cả khi robot đang chạy. Chọn một <b>kịch bản</b> sẽ nạp bố cục mẫu (Ctrl+Z để lấy lại bố cục của bạn). <b>📍 Đặt robot</b> rồi bấm lên mặt bàn để đổi chỗ xuất phát.</p>
      <div class="tip"><b>Thử:</b><br>
      ① Kịch bản "Chạy thẳng ra mép bàn", tốc độ ¼×: xem ADC tụt từ ~420 xuống ~0 khi cảm biến #2/#3 vượt mép, robot dừng NGAY rồi lùi.<br>
      ② Tắt "Cảm biến chống rơi" → Đặt lại → robot lao khỏi bàn.<br>
      ③ "Đẩy cốc": cốc 0.3 kg quá nhẹ để ấn bumper — robot đẩy cốc rơi xuống đất nhưng chính nó dừng lại được ở mép.<br>
      ④ Kéo CLIFF_THRESHOLD lên 450… à không, tối đa 400: thấy robot sợ cả mặt bàn ở mép tối? Hạ xuống 10: phản ứng chậm hơn bao nhiêu?<br>
      ⑤ Bấm các sự cố: bụi bẩn kính cảm biến, mặt bàn đen, nắng chiếu.</div>\`,
    specs: [
      ['Bàn', '1.6 × 0.9 m, mặt cao 750 mm, gỗ sáng (phản xạ IR ~0.55)'],
      ['Cảm biến cliff', '4 cặp LED IR 940 nm + phototransistor, cách sàn 12 mm, ở bán kính 155 mm, góc ±25° (trước) và ±70° (hông)'],
      ['Đọc ADC', 'Mỗi 20 ms: đo khi tắt LED, bật LED, chờ 150 µs, đo lại; v = tối − sáng (CLIFF_LIGHT_LOWERS_V = 1)'],
      ['Ngưỡng', 'CLIFF_THRESHOLD = 60; cần 2 lần liên tiếp (40 ms) dưới ngưỡng mới báo → lọc nhiễu'],
      ['Giá trị điển hình', 'Gỗ sáng ~420 · gạch trắng ~620 · thảm tối ~250 · mặt bàn đen ~45 · hố 75 cm ~0–5'],
      ['Quãng phanh', 'Tốc độ 270 mm/s × 40 ms ≈ 11 mm. Cảm biến trước nằm trước tâm 140 mm → tâm dừng cách mép ~130 mm'],
      ['Rơi 75 cm', 'v = √(2gh) ≈ 3.8 m/s khi chạm sàn — đủ vỡ vỏ ABS, bật nắp pin, gãy chổi cạnh'],
      ['Robot', 'Ø350 mm, 3.5 kg; bumper cần lực ~2.5 N mới ấn được công tắc'],
    ],
    principle: \`
      <h4>1. Cảm biến phản xạ hồng ngoại</h4>
      <p>LED phát IR xuống, mặt bàn dội lại, phototransistor nhận. Cường độ nhận được tỉ lệ <b>hệ số phản xạ ρ</b> của bề mặt và giảm theo <b>bình phương khoảng cách</b>:</p>
      <p><code>v ≈ 620 · (ρ/0.8) · (27 / (d + 15))²</code> — d = khoảng cách từ mắt cảm biến tới mặt phản xạ (mm).</p>
      <ul><li>Trên bàn: d = 12 mm → v ≈ 420.</li><li>Vượt mép: mặt phản xạ gần nhất là sàn nhà, d = 762 mm → v ≈ 0.5 → "hố".</li><li>Mặt bàn đen ρ ≈ 0.06 → v ≈ 45 &lt; 60 → <b>hố giả</b> dù robot đang đứng trên bàn!</li></ul>
      <h4>2. Vì sao đo 2 lần (tắt/bật LED)?</h4>
      <p>Ánh sáng phòng, nắng cũng chứa hồng ngoại. Lấy hiệu "LED tắt − LED bật" sẽ trừ được ánh sáng nền. Nhưng nắng quá mạnh làm phototransistor <b>bão hòa</b> (đã dẫn hết mức) → bật hay tắt LED cũng như nhau → hiệu ≈ 0 → hố giả.</p>
      <h4>3. Phản xạ an toàn 2 tầng</h4>
      <p>PIC thấy <code>cliff_mask ≠ 0</code> → <code>block_fwd = 1</code> → ngay trong ngắt 1 ms tiếp theo, mọi tốc độ tiến bị ép về 0 (không ramp). ESP32 nhận cờ CLIFF trong STATUS kế tiếp → <code>startBackup()</code>: lùi 60 mm rồi xoay ngẫu nhiên 100–170°.</p>
      <h4>4. Rơi tự do</h4>
      <p><code>t = √(2h/g)</code> = 0.39 s cho h = 0.75 m; vận tốc chạm đất <code>v = g·t</code> ≈ 3.8 m/s. Động năng <code>½mv²</code> ≈ 25 J dồn vào một điểm trên vỏ nhựa.</p>
      <h4>5. Đẩy vật nhẹ</h4>
      <p>Bumper chỉ "biết" khi lực đẩy vượt lực lò xo (~2.5 N). Cốc 0.3 kg trượt trên bàn chỉ cần <code>F = μ·m·g</code> ≈ 0.4 × 0.3 × 9.81 ≈ 1.2 N → robot ủi cốc đi mà không hề thấy va chạm.</p>\`,
    inRobot: \`
      <ul>
        <li><code>firmware/pic16f877a_ccs/sensors.c</code> — <code>cliff_update()</code>: chân AN1–AN4 (RA1, RA2, RA3, RA5), LED IR bật qua transistor ở RD4. Mô phỏng này dùng đúng công thức hiệu, ngưỡng và bộ đếm 2 lần.</li>
        <li><code>config.h</code> (PIC): <code>CLIFF_THRESHOLD 60</code>, <code>CLIFF_ENABLE_MASK 0x0F</code>, <code>CLIFF_LED_PULSED 1</code>, <code>CLIFF_LIGHT_LOWERS_V 1</code>.</li>
        <li><code>main.c</code>: <code>hazard_fwd = bump || cliff</code> → <code>block_fwd</code>; công tắc nhấc bánh → <code>stop_all</code>.</li>
        <li>Hiệu chỉnh ngưỡng: ESP32 gửi lệnh <code>RAW?</code>, PIC trả khung <b>CLIFF_RAW (0x82)</b> 5 Hz với 4 giá trị ADC — đặt robot trên sàn tối nhất và treo trên mép bàn, lấy ngưỡng ở giữa (ghi vào <code>docs/06_DO_DAC_XAC_ROBOT.md</code> mục 4).</li>
        <li>Lệnh <code>SAFETY:0</code> tắt mọi phản xạ — chỉ dùng khi đã kê robot lên hộp cho bánh quay tự do!</li>
      </ul>\`,
    mistakes: \`
      <ul>
        <li><b>Test trên bàn với SAFETY:0</b> hoặc chưa nối cảm biến cliff → robot rơi ngay lần chạy đầu.</li>
        <li><b>Ngưỡng chọn theo 1 loại sàn</b>: hiệu chỉnh trên gạch trắng (620) rồi đặt ngưỡng 300 → lên thảm tối (250) robot báo hố giả, không dám đi.</li>
        <li><b>Kính cảm biến bẩn</b>: bụi trên tấm che làm IR dội ngược ngay trong vỏ → cảm biến luôn "thấy sàn" → mất tác dụng. Lau định kỳ bằng khăn khô.</li>
        <li><b>Đặt cảm biến quá gần tâm</b> (sau trục bánh): khi cảm biến thấy hố thì bánh đã ở ngoài mép.</li>
        <li><b>Không lọc 2 lần</b>: một mẫu nhiễu là robot giật lùi vô cớ; ngược lại lọc quá nhiều lần (vd 10 × 20 ms = 200 ms) thì robot đã đi thêm 54 mm — rơi.</li>
        <li><b>Quên vật nhẹ</b>: robot không rơi nhưng đẩy cốc, điện thoại rơi xuống — hãy dọn bàn trước khi thử.</li>
      </ul>\`,
    quiz: [
      { q: 'Robot chạy 270 mm/s. PIC cần 2 lần đo liên tiếp, mỗi lần cách 20 ms. Từ lúc cảm biến vượt mép tới lúc chặn tiến, robot đi thêm bao xa?', a: 'Tối đa ~40 ms × 270 mm/s ≈ 11 mm. Cảm biến trước nằm trước tâm ~140 mm nên tâm robot (và bánh xe) vẫn còn cách mép ~130 mm — an toàn.' },
      { q: 'Vì sao robot trên mặt bàn màu đen "không chịu đi" dù cảm biến hoạt động bình thường?', a: 'Mặt đen hấp thụ hồng ngoại (ρ ≈ 0.06) → hiệu ADC ≈ 45, dưới ngưỡng 60 → PIC coi là hố ở mọi nơi, chặn tiến. Phải hạ ngưỡng (rủi ro) hoặc dùng cảm biến ToF đo khoảng cách thay vì độ sáng.' },
      { q: 'Robot đẩy cốc 0.3 kg nhưng không lùi lại. Bumper hỏng à?', a: 'Không. Lực cần để đẩy cốc trượt chỉ ~1.2 N, nhỏ hơn lực lò xo bumper ~2.5 N, nên công tắc không bị ấn. Robot không "biết" mình đang đẩy cốc.' },
    ],
  },

  faults: [
    { id: 'cliff-tat', label: 'Tắt cảm biến chống rơi (SAFETY / mask = 0)', severity: 'no',
      what: '<p>Robot chạy thẳng tới mép, không chậm lại. Nửa thân chìa ra ngoài, bánh hụt, robot chúc đầu rơi 75 cm. Chạm đất: tiếng "rầm", tia lửa từ pin/mạch, khói, nắp lidar và cản trước văng ra.</p>',
      why: '<p>cliff_mask = 0 → block_fwd không bao giờ bật, ESP32 không có sự kiện CLIFF. Công tắc nhấc bánh có báo LIFTED nhưng lúc đó trọng tâm đã ra khỏi mép. Rơi 0.75 m → 3.8 m/s, ~25 J: nứt vỏ, gãy chốt bumper, cell pin có thể bị móp — nguy cơ chập/cháy.</p>',
      fix: '<p>Chỉ tắt an toàn khi robot được kê bánh lên hộp. Nếu robot đã rơi: tắt nguồn, tháo pin kiểm tra vỏ cell (móp, phồng → bỏ), đo lại điện áp từng cell, kiểm tra trục bánh trước khi chạy lại.</p>' },
    { id: 'ban-cam-bien', label: 'Kính 2 cảm biến phía trước bám bụi', severity: 'loi',
      what: '<p>ADC #2, #3 luôn cao (~400) kể cả khi đã vượt mép. Robot chỉ dừng khi 2 cảm biến hông #1/#4 tới mép — lúc đó nửa trước robot đã chìa ra ngoài ~13 cm. Suýt rơi!</p>',
      why: '<p>Bụi trên tấm che làm tia IR dội ngược ngay trong vỏ (crosstalk) → phototransistor luôn nhận được ánh sáng → "luôn thấy sàn". Cảm biến hông nằm trước tâm chỉ 53 mm (cos 70° × 155) nên khoảng an toàn còn rất ít.</p>',
      fix: '<p>Lau kính cảm biến định kỳ. Firmware: khi robot bị nhấc lên (drop) mà cliff vẫn báo "thấy sàn" → cảm biến hỏng/bẩn → báo lỗi. Thiết kế: vách ngăn quang giữa LED và phototransistor.</p>' },
    { id: 'mat-ban-den', label: 'Mặt bàn màu đen (phủ tấm lót chuột đen)', severity: 'hong',
      what: '<p>Cả 4 tia IR đỏ, ADC chỉ ~40–50. Robot không tiến được chút nào: lùi – xoay – lùi – xoay… và mỗi lần như vậy lại <b>lùi mù</b> ra sau một đoạn. Sau vài chu kỳ robot tụt khỏi mép SAU của bàn (có khi còn ủi rơi đồ phía sau nó).</p>',
      why: '<p>Bề mặt đen hấp thụ hồng ngoại: ρ ≈ 0.06 → v ≈ 45 &lt; ngưỡng 60 → "hố" ở mọi nơi → block_fwd thường trực. ESP32 thấy CLIFF → BACKUP 60 mm → TURN; khi xoay, bánh cần quay tiến bị PIC chặn nên robot xoay quanh 1 bánh và tâm lùi thêm. Cả 4 cảm biến đều ở phía TRƯỚC → khi lùi robot không nhìn thấy mép phía sau.</p>',
      fix: '<p>Kéo CLIFF_THRESHOLD xuống ~30 — robot đi được, nhưng biên an toàn với hố mỏng đi. Tốt hơn: (1) luật firmware "cả 4 cliff cùng báo khi đang đứng yên → không phải hố mà là bề mặt tối → dừng và báo lỗi, KHÔNG lùi"; (2) thêm cảm biến cliff phía sau; (3) dùng cảm biến ToF (VL53L0X) đo <i>khoảng cách</i>, không phụ thuộc màu. Đây là lỗi nổi tiếng của robot hút bụi trên thảm đen.</p>' },
    { id: 'nang-chieu', label: 'Nắng chiếu qua cửa sổ lên nửa phải mặt bàn', severity: 'nhe',
      what: '<p>Vùng nắng (màu vàng) trở thành "vùng cấm": cảm biến nào vào vùng nắng là báo hố, robot quay đầu. Robot đặt giữa vùng nắng thì không đi được.</p>',
      why: '<p>Nắng chứa rất nhiều IR → phototransistor bão hòa. Đo lúc tắt LED và lúc bật LED đều ra ~0 V → hiệu ≈ 0 &lt; 60. Cách trừ nền tắt/bật LED chỉ hiệu quả khi chưa bão hòa.</p>',
      fix: '<p>Kéo rèm khi chạy robot; dùng LED IR điều chế tần số cao + lọc thông dải; giảm điện trở tải phototransistor để khó bão hòa hơn.</p>' },
    { id: 'ui-laptop', label: 'Tháo bumper rồi cho robot ủi laptop', severity: 'hong',
      what: '<p>Robot húc vào laptop nhưng không lùi lại — cứ thế đẩy laptop trượt về mép bàn. Robot dừng được ở mép nhờ cảm biến cliff, còn laptop thì rơi xuống sàn.</p>',
      why: '<p>Laptop 1.4 kg cần ~5.5 N để trượt — đủ ấn bumper nếu bumper còn. Khi bumper bị rút dây, robot chỉ còn cảm biến cliff (chỉ thấy hố, không thấy vật) và phát hiện kẹt STUCK (không xảy ra vì robot vẫn đi được).</p>',
      fix: '<p>Không bao giờ chạy robot thiếu bumper. Robot thương mại còn dùng lidar/camera để thấy vật trước khi chạm, và đo dòng động cơ bánh để phát hiện "đang đẩy vật nặng".</p>' },
  ],

  build(ctx) {
    const { THREE, MAT, geom, tint, label, readout, fx, viewer } = ctx;
    const { mesh, part, group, box, cyl } = geom;
    // 2D mô phỏng (x, y) gốc ở góc trước-trái mặt bàn; sandbox dùng tọa độ thế giới: X = x − OX, Z = OY − y
    const OX = DESK_W / 2, OY = DESK_D / 2;
    const root = new THREE.Group();
    root.position.set(-OX, 0, OY);
    const sbRoot = new THREE.Group();
    sbRoot.position.set(OX, 0, -OY);
    root.add(sbRoot);
    const W = (x, y) => ({ x: x - OX, z: OY - y });

    const world = new World2D({ base: { name: 'Sàn phòng', h: 0, rho: 0.7, kind: 'tile' } });
    const bx = (x0, y0, x1, y1, z0, z1, mat, r = 0) =>
      mesh(box(x1 - x0, z1 - z0, y1 - y0, r), mat, { x: (x0 + x1) / 2, y: (z0 + z1) / 2, z: -(y0 + y1) / 2 });
    const lb = (lx0, ly0, lx1, ly1, z0, z1, mat, r = 0) =>
      mesh(box(lx1 - lx0, z1 - z0, ly1 - ly0, r), mat, { x: (lx0 + lx1) / 2, y: (z0 + z1) / 2, z: -(ly0 + ly1) / 2 });
    const G = (...a) => group(...a);

    const M = {
      floor: tint(MAT.plasticWhite, 0xcfc8bc), desk: tint(MAT.plasticWhite, 0xd2a878), wall: tint(MAT.plasticWhite, 0xe9e5dc),
      leg: MAT.aluminum.clone(), laptop: tint(MAT.aluminum, 0xa9adb3), screen: tint(MAT.plasticBlack, 0x0e1622),
      book1: tint(MAT.plasticRed, 0xa83c3c), book2: tint(MAT.plasticBlue, 0x2f5f9e), book3: tint(MAT.plasticGreen, 0x3d7d4a),
      cup: tint(MAT.plasticWhite, 0xfafafa), coffee: tint(MAT.plasticBlack, 0x4a2a14), cable: tint(MAT.plasticBlack, 0x222222),
      pot: tint(MAT.plasticWhite, 0xc0673f), leaf: tint(MAT.plasticGreen, 0x3f8f4a), phone: tint(MAT.plasticBlack, 0x15171c), pens: tint(MAT.plasticDark, 0x3a4250),
      chair: tint(MAT.plasticDark, 0x2a2e36),
    };
    for (const k of ['floor', 'desk', 'wall']) M[k].roughness = 0.75;

    // ---------- phần cố định: phòng, cửa sổ, bàn, ghế ----------
    const fixedObs = [], fixedFloors = [];
    const floor = bx(-1100, -1000, 2700, 1800, -40, 0, M.floor);
    floor.userData.floor = true; floor.castShadow = false;
    root.add(part(floor, 'Sàn gạch (thấp hơn mặt bàn 75 cm)', 'Nếu robot rơi xuống đây với vận tốc 3.8 m/s…'));
    fixedObs.push(world.addBox(-1100, 1800, 2700, 1900, { zBot: 0, zTop: 2000, name: 'Tường' }));
    root.add(part(group(bx(-1100, 1800, 2700, 1900, 0, 900, M.wall), bx(-1100, 1800, 400, 1900, 900, 2000, M.wall), bx(1800, 1800, 2700, 1900, 900, 2000, M.wall), bx(400, 1800, 1800, 1900, 1800, 2000, M.wall), bx(400, 1790, 1800, 1800, 900, 1800, MAT.glass)),
      'Tường + cửa sổ', 'Buổi chiều nắng chiếu xiên qua cửa sổ lên mặt bàn.'));
    const deskTop = bx(0, 0, DESK_W, DESK_D, DESK_H - 25, DESK_H, M.desk, 4);
    deskTop.userData.floor = true;
    const legs = [];
    for (const [x, y] of [[40, 40], [DESK_W - 90, 40], [40, DESK_D - 90], [DESK_W - 90, DESK_D - 90]]) {
      legs.push(bx(x, y, x + 50, y + 50, 0, DESK_H - 25, M.leg));
      fixedObs.push(world.addBox(x, y, x + 50, y + 50, { zBot: 0, zTop: DESK_H - 25, name: 'Chân bàn' }));
    }
    root.add(part(group(deskTop, ...legs, bx(60, 60, DESK_W - 60, 80, DESK_H - 105, DESK_H - 25, M.leg)), 'Bàn làm việc 1.6 × 0.9 m, cao 75 cm',
      'Mặt gỗ sáng màu, hệ số phản xạ IR ~0.55 → ADC ~420. Mép bàn vuông: chỉ cần vượt qua vài mm là cảm biến thấy "hố" 75 cm.'));
    const deskZone = world.addFloor(0, 0, DESK_W, DESK_D, { h: DESK_H, rho: 0.55, name: 'Mặt bàn', surface: true, kind: 'wood' });
    const sunZone = world.addFloor(1000, 0, DESK_W, DESK_D, { h: DESK_H, rho: 0.55, name: 'Mặt bàn (vùng nắng)', surface: true, sunny: true, kind: 'wood' });
    fixedFloors.push(deskZone, sunZone);
    const sunPatch = bx(1000, 0, DESK_W, DESK_D, DESK_H + 0.8, DESK_H + 1.2, new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.35, depthWrite: false }));
    sunPatch.visible = false; sunPatch.castShadow = false; sunPatch.raycast = () => {};
    root.add(sunPatch);
    fixedObs.push(world.addCircle(800, -520, 320, { zBot: 0, zTop: 480, name: 'Ghế' }));
    root.add(part(group(mesh(cyl(320, 320, 30, 5), M.leg, { x: 800, y: 60, z: 520 }), mesh(cyl(25, 25, 380, 12), M.leg, { x: 800, y: 260, z: 520 }),
      bx(580, -740, 1020, -300, 450, 520, M.chair, 20), bx(580, -760, 1020, -720, 520, 1000, M.chair, 15)), 'Ghế văn phòng', ''));
    label(root, 'Bàn làm việc (cao 75 cm)', [DESK_W / 2, DESK_H + 380, -DESK_D - 50]);

    // ---------- thư viện đồ trên bàn (kéo-thả) ----------
    const cablePts = [[-350, 0], [-150, 60], [50, -20], [250, 40], [400, 0]];
    const catalog = [
      { id: 'laptop', name: 'Laptop', icon: '💻', group: 'Đồ trên bàn', desc: 'Đủ nặng để ấn bumper (~5.5 N mới trượt). Đế dày 18 mm > khe gầm 8 mm.',
        build: () => {
          const lid = G(lb(-170, -4, 170, 4, 0, 230, M.laptop, 3), lb(-160, -6, 160, -4, 15, 215, M.screen));
          lid.position.set(0, 16, -120); lid.rotation.x = -0.35;
          return G(lb(-170, -120, 170, 120, 0, 16, M.laptop, 4), lid);
        },
        meta: { movable: { box: [340, 240], h: 18, mass: 1.4, mu: 0.4, fragile: true } } },
      { id: 'coc', name: 'Cốc sứ + cà phê', icon: '☕', group: 'Đồ trên bàn', desc: '0.3 kg: quá nhẹ để ấn bumper — robot đẩy cốc đi mà "không biết".',
        build: () => G(mesh(cyl(42, 36, 95, 24, true), M.cup, { y: 47.5 }), mesh(cyl(36, 36, 3, 20), M.cup, { y: 1.5 }), mesh(cyl(39, 39, 2, 20), M.coffee, { y: 80 }),
          mesh(new THREE.TorusGeometry(22, 5, 8, 16, Math.PI), M.cup, { x: 50, y: 50, rz: -Math.PI / 2 })),
        meta: { movable: { circle: 42, h: 95, mass: 0.3, mu: 0.4, fragile: true, shatter: true } } },
      { id: 'sach', name: 'Chồng sách', icon: '📚', group: 'Đồ trên bàn', desc: 'Vật cản nặng, cao 120 mm: bumper chạm là biết.',
        build: () => G(mesh(box(230, 40, 270, 3), M.book1, { y: 20 }), mesh(box(215, 40, 255, 3), M.book2, { y: 60, ry: 0.06 }), mesh(box(225, 40, 260, 3), M.book3, { y: 100, ry: -0.05 })),
        meta: { movable: { box: [230, 270], h: 120, mass: 2.0, mu: 0.5 } } },
      { id: 'hop-but', name: 'Hộp bút', icon: '🖊', group: 'Đồ trên bàn', desc: '0.25 kg — bị đẩy đi dễ dàng.',
        build: () => G(mesh(cyl(38, 38, 100, 20), M.pens, { y: 50 }), mesh(cyl(3, 3, 140, 6), MAT.plasticBlue, { x: 10, y: 100, rz: 0.12 }), mesh(cyl(3, 3, 140, 6), MAT.plasticRed, { x: -12, y: 100, rz: -0.15 })),
        meta: { movable: { circle: 38, h: 100, mass: 0.25, mu: 0.4 } } },
      { id: 'dien-thoai', name: 'Điện thoại', icon: '📱', group: 'Đồ trên bàn', desc: 'Mỏng 9 mm, 0.2 kg — robot ủi đi, có khi đẩy rơi xuống đất.',
        build: () => G(lb(-37, -77, 37, 77, 0, 9, M.phone, 3)), meta: { movable: { box: [75, 155], h: 9, mass: 0.2, mu: 0.35, fragile: true } } },
      { id: 'day-sac', name: 'Dây sạc', icon: '🔌', group: 'Đồ trên bàn', desc: 'Chổi chính cán qua là cuốn.',
        build: () => G(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cablePts.map(([x, y]) => new THREE.Vector3(x, 4, -y))), 50, 4, 6, false), M.cable)),
        meta: { hazard: { kind: 'cable', pts: cablePts, r: 4 } } },
      { id: 'chau-cay', name: 'Chậu cây nhỏ (sứ)', icon: '🪴', group: 'Đồ trên bàn', desc: '0.8 kg: đủ ấn bumper (~3.1 N). Rơi xuống đất là vỡ.',
        build: () => G(mesh(cyl(60, 48, 110, 20), M.pot, { y: 55 }), mesh(new THREE.IcosahedronGeometry(80, 1), M.leaf, { y: 170 })),
        meta: { movable: { circle: 60, h: 160, mass: 0.8, mu: 0.5, fragile: true, shatter: true } } },
      { id: 'den-ban', name: 'Đèn bàn (đế gang)', icon: '💡', group: 'Đồ trên bàn', desc: 'Đế nặng, robot không đẩy nổi.',
        build: () => G(mesh(cyl(70, 75, 18, 24), M.leg, { y: 9 }), mesh(cyl(8, 8, 380, 10), M.leg, { y: 200 }), mesh(cyl(30, 90, 110, 20, true), tint(MAT.plasticWhite, 0xf2f2f2), { x: -60, y: 380, z: 20, rz: 0.6 })),
        meta: { solids: [{ circle: [0, 0, 70], z: [0, 450] }] } },
    ];
    const at = (type, x, y, rotY = 0) => ({ type, ...W(x, y), y: DESK_H, rotY });
    const PRESETS = {
      'day-coc': [at('laptop', 1220, 640), at('sach', 225, 725), at('den-ban', 1480, 830), at('coc', 1150, 300)],
      mep: [at('laptop', 1220, 640), at('sach', 225, 725), at('den-ban', 1480, 830)],
      'don-ban': [at('laptop', 1220, 640), at('sach', 225, 725), at('den-ban', 1480, 830), at('coc', 1500, 140), at('hop-but', 560, 780), at('day-sac', 760, 790, 0.15), at('chau-cay', 140, 140), at('dien-thoai', 950, 420, 0.3)],
      'ui-laptop': [at('laptop', 1180, 560), at('den-ban', 1480, 830)],
    };

    // ---------- độ phủ mặt bàn ----------
    const cov = new CoverageGrid({ x0: 0, y0: 0, x1: DESK_W, y1: DESK_D, cell: 20, rClean: RG.R_CLEAN });
    cov.z0 = DESK_H;
    const overlay = buildCoverageOverlay(THREE, cov, DESK_H + 1.5);
    overlay.mesh.visible = false;
    root.add(overlay.mesh);

    // ---------- robot + tia IR ----------
    const sim = new RobotSim(world, { coverage: cov });
    const R = buildRobot({ THREE, MAT, geom, tint });
    root.add(R.root);
    const robotLabel = label(R.root, '', [0, 170, 0]);
    const irPos = new Float32Array(4 * 6), irCol = new Float32Array(4 * 6);
    const irGeo = new THREE.BufferGeometry();
    irGeo.setAttribute('position', new THREE.BufferAttribute(irPos, 3));
    irGeo.setAttribute('color', new THREE.BufferAttribute(irCol, 3));
    const irLines = new THREE.LineSegments(irGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthTest: false }));
    irLines.frustumCulled = false; irLines.raycast = () => {}; irLines.renderOrder = 5;
    const spotMats = [], spots = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.MeshBasicMaterial({ color: 0x40ff80, transparent: true, opacity: 0.8, depthWrite: false });
      const s = new THREE.Mesh(new THREE.CircleGeometry(9, 16), m);
      s.rotation.x = -Math.PI / 2; s.raycast = () => {};
      spotMats.push(m); spots.push(s);
    }
    const irGroup = group(irLines, ...spots);
    root.add(irGroup);
    const adcLabels = [0, 1, 2, 3].map(() => label(root, '', [0, 0, 0]));

    // mảnh vỡ: robot (5 mảnh) và cốc/chậu sứ (6 mảnh)
    const debris = [];
    const mkDeb = (geo, mat) => { const m = mesh(geo, mat); m.visible = false; root.add(m); debris.push({ m, v: new THREE.Vector3(), w: new THREE.Vector3(), alive: false }); };
    mkDeb(geom.arcSector(174, 181, -1.2, 0.3, 50, 16), tint(MAT.plasticGrey, 0x9aa3ad));
    mkDeb(cyl(40, 40, 11, 24), MAT.plasticBlack);
    mkDeb(box(120, 8, 90, 3), tint(MAT.plasticWhite, 0xf2f4f6));
    mkDeb(box(92, 2, 3), tint(MAT.plasticYellow, 0xf0c040));
    mkDeb(box(60, 20, 25), tint(MAT.plasticBlue, 0x2a62c9));
    const shards = [];
    for (let i = 0; i < 12; i++) { const s = mesh(box(18 + (i % 6) * 3, 4, 12 + (i % 6) * 2), M.cup); s.visible = false; root.add(s); shards.push(s); }
    let shardNext = 0;

    // ---------- sandbox: dựng lại vật cản mỗi khi bố cục đổi ----------
    let movables = new Map();
    function rebuildAll(items, reach = true) {
      movables = rebuildWorld(world, { obstacles: fixedObs, floors: fixedFloors }, items, movables, { OX, OY }).movables;
      if (reach) cov.computeReach(world, { startX: sim.start.x, startY: sim.start.y, z0: DESK_H, blocks: (o) => !o.movable && o.zBot < DESK_H + RG.H && o.zTop > DESK_H + RG.BODY_BOT });
    }
    const makeSandbox = ctx.sandbox || ((o) => createSandbox(null, o));
    const sb = makeSandbox({
      title: 'Đồ trên bàn', root: sbRoot, catalog, surfaces: [deskTop], floorY: 0, grid: 20,
      bounds: { minX: -1900, maxX: 1900, minZ: -1350, maxZ: 1350 },
      storageKey: 'robovac.tren-ban.v1', initial: PRESETS['day-coc'],
      onChange: (items) => rebuildAll(items),
    });

    // ---------- điều khiển ----------
    let running = true, acc = 0, scen = 'day-coc', pose = SCEN['day-coc'].pose, algo = 'AUTO', camMode = 'free', readT = 1, smoked = false, faultId = null;
    let bumperForcedOff = false, cliffForcedOff = false, placeArmed = false;
    let selKey = '';
    const rig = new CameraRig(THREE, viewer, root);
    const kb = createKeyboard(() => algo === 'MANUAL');

    function startAlgo() {
      if (algo === 'AUTO' && scen !== 'don-ban') sim.brain.debugAutoForward(sim.odo, sim.nowMs);   // bỏ pha xoắn ốc để tới mép ngay
      else sim.setMode(algo);
    }
    function resetScene(ps = pose) {
      pose = ps;
      restoreMovables(sb.items);
      shards.forEach((x) => (x.visible = false));
      for (const d of debris) { d.m.visible = false; d.alive = false; }
      R.lidarHead.visible = true; R.bumper.visible = true; R.brushes.forEach((b) => (b.visible = true));
      sim.reset(ps);
      rebuildAll(sb.items);
      cov.clear();
      overlay.update(0, true);
      startAlgo();
      acc = 0; smoked = false;
    }
    /** Nạp bố cục mẫu (vào sandbox — Ctrl+Z để lấy lại bố cục cũ) rồi đặt robot */
    function loadScenario(s) {
      scen = s;
      if (PRESETS[s]) sb.load(PRESETS[s]);
      resetScene(SCEN[s]?.pose || pose);
    }
    resetScene(pose);

    const disposePick = floorPicker(THREE, viewer, root, (x, y) => {
      if (!placeArmed) return;
      placeArmed = false;
      if (world.floorAt(x, y).h < DESK_H - 1) { sim.addLog('Chỉ đặt robot lên mặt bàn'); return; }
      if (!sim.canPlace(x, y)) { sim.addLog('Không đặt được: chạm đồ vật hoặc quá sát mép'); return; }
      pose = { x, y, th: sim.th };
      sim.reset(pose);
      rebuildAll(sb.items);
      startAlgo(); running = true;
    });

    const v3 = new THREE.Vector3();
    const toWorld = (x, z, y) => { root.localToWorld(v3.set(x, z, -y)); return [v3.x, v3.y, v3.z]; };
    const GRAV = 9810;

    function scatterDebris() {
      R.lidarHead.visible = false; R.bumper.visible = false; R.brushes[0].visible = false;
      for (const d of debris) {
        d.alive = true; d.m.visible = true;
        d.m.position.set(sim.x, sim.fall ? sim.fall.zc : 60, -sim.y);
        const a = Math.random() * Math.PI * 2, sp = 600 + Math.random() * 900;
        d.v.set(Math.cos(a) * sp, 900 + Math.random() * 900, Math.sin(a) * sp);
        d.w.set(Math.random() * 12, Math.random() * 12, Math.random() * 12);
      }
    }
    function stepDebris(dt) {
      for (const d of debris) {
        if (!d.alive) continue;
        d.v.y -= GRAV * dt;
        d.m.position.addScaledVector(d.v, dt);
        d.m.rotation.x += d.w.x * dt; d.m.rotation.y += d.w.y * dt; d.m.rotation.z += d.w.z * dt;
        if (d.m.position.y < 5) {
          d.m.position.y = 5; d.v.y = -d.v.y * 0.3; d.v.x *= 0.6; d.v.z *= 0.6; d.w.multiplyScalar(0.5);
          if (Math.abs(d.v.y) < 80) { d.alive = false; d.m.rotation.x = 0; d.m.rotation.z = 0; }
        }
      }
    }

    function handleImpacts() {
      for (const im of sim.impacts) {
        const pos = toWorld(im.x, im.z + 40, im.y);
        if (im.kind === 'robot') {
          if (im.speed > 1500) {
            fx.sparks(pos, { count: 90, speed: 1400, size: 16 });
            fx.flash(pos, { size: 400, color: 0xffe2a0, intensity: 6 });
            fx.smoke(pos, { size: 180, duration: 6 });
            if (R.lidarHead.visible) scatterDebris();
          } else fx.sparks(pos, { count: 20, speed: 500, size: 8 });
        } else if (im.o) {
          if (im.o.broken && im.o.shatter) {
            for (let i = 0; i < 6; i++) {
              const s = shards[shardNext++ % shards.length];
              s.visible = true;
              s.position.set(im.x + Math.cos(i * 1.1) * (60 + i * 25), im.z + 3, -(im.y + Math.sin(i * 1.1) * (60 + i * 25)));
              s.rotation.y = i;
            }
            fx.sparks(pos, { count: 30, speed: 600, size: 7, color: 0xffffff });
          } else if (im.o.broken) {
            fx.sparks(pos, { count: 25, speed: 500, size: 8, color: 0xaad4ff });
            sim.addLog(\`"\${im.o.name}" rơi 75 cm: nứt vỡ, hỏng…\`);
          }
        }
      }
      sim.impacts.length = 0;
    }

    const irA = new THREE.Color(), irB = new THREE.Color();
    function syncScene(dtSim, p) {
      poseRobot(THREE, R.root, sim);
      R.animate(dtSim, { vL: sim.vL, vR: sim.vR, brush: sim.pic.brushSide && sim.status === 'ok', lidar: sim.status === 'ok' });
      R.setBump(sim.bumpRaw);
      R.setCliff(sim.pic.cliffMask);
      R.setLed(ledColor(sim));
      syncMovables(movables, world, OX, OY);
      // tia IR
      const showIr = !!p.rays && sim.status === 'ok';
      irGroup.visible = showIr;
      for (let i = 0; i < 4; i++) {
        const sp = sim.sensorPts[i], v = sim.cliffAdcVals[i];
        const lab = adcLabels[i];
        if (lab) lab.visible = showIr && viewer?.labelsVisible !== false;
        if (!showIr) continue;
        const seeFloor = v >= sim.opt.cliffThreshold;
        const top = sim.z0 + RG.SENSOR_H - 4, bot = sp.h + 1;
        irPos.set([sp.x, top, -sp.y, sp.x, bot, -sp.y], i * 6);
        irA.setHex(seeFloor ? 0x40ff80 : 0xff4040); irB.copy(irA).multiplyScalar(0.5);
        irCol.set([irA.r, irA.g, irA.b, irB.r, irB.g, irB.b], i * 6);
        spots[i].position.set(sp.x, bot + 0.5, -sp.y);
        spotMats[i].color.copy(irA);
        spots[i].scale.setScalar(seeFloor ? 1 : 3);
        if (lab) {
          lab.position.set(sp.x, sim.z0 + 60 + (i % 2) * 30, -sp.y);
          if (lab.element) lab.element.textContent = \`\${i + 1}: \${Math.round(v)}\`;
        }
      }
      irGeo.attributes.position.needsUpdate = true;
      irGeo.attributes.color.needsUpdate = true;
    }

    return {
      object: root,
      sim, sandbox: sb,          // để gỡ lỗi / kiểm thử

      onAction(id, p) {
        if (id === 'start') { running = true; if (sim.status === 'ok' && sim.brain.mode === 'IDLE') { algo = p.algo; startAlgo(); } }
        else if (id === 'pause') running = false;
        else if (id === 'reset') { algo = p.algo; resetScene(); running = true; }
        else if (id === 'place') { placeArmed = true; sim.addLog('📍 Bấm chuột lên mặt bàn để đặt robot'); }
      },

      update(dt, t, p) {
        // đồ đang được chọn/kéo → dựng lại vật cản ngay (không đợi thả chuột)
        const sel = sb.selected;
        if (sel) {
          const o = sel.object;
          const key = \`\${sel.uid}:\${o.position.x.toFixed(1)},\${o.position.y.toFixed(1)},\${o.position.z.toFixed(1)},\${o.rotation.y.toFixed(3)}\`;
          if (key !== selKey) { if (selKey.startsWith(sel.uid + ':')) rebuildAll(sb.items, false); selKey = key; }
        } else selKey = '';
        if (p.scen !== scen) { algo = p.algo; if (p.scen === 'giu') scen = 'giu'; else loadScenario(p.scen); running = true; }
        if (p.algo !== algo) { algo = p.algo; if (sim.status === 'ok') startAlgo(); running = true; if (algo === 'MANUAL') releaseFocus(); }
        if (p.cam !== camMode) { camMode = p.cam; rig.set(camMode, R.root, [DESK_W / 2, DESK_D / 2], [DESK_W + 1600, DESK_D + 1200], DESK_H); }
        sim.opt.cliffOn = !!p.cliff && !cliffForcedOff;
        sim.opt.bumperOn = !!p.bumper && !bumperForcedOff;
        sim.opt.cliffThreshold = p.thr;
        sim.opt.slip = true;

        const speed = Number(p.speed) || 1;
        let simDt = 0;
        if (running) {
          acc += dt * speed;
          let n = 0;
          while (acc >= sim.DT && n < 200) {
            if (algo === 'MANUAL') { const [l, r] = kb.drive(); sim.manual(l, r); }
            sim.step(); acc -= sim.DT; n++; simDt += sim.DT;
          }
          if (n >= 200) acc = 0;
        }
        handleImpacts();
        stepDebris(Math.min(simDt, 0.05));
        syncScene(Math.min(simDt, dt * 2), p);
        overlay.mesh.visible = !!p.heat;
        overlay.update(dt);
        rig.update(dt, R.root);
        if (sim.status === 'broken' && !smoked) { smoked = true; fx.smoke(R.root, { size: 100, duration: 10, color: 0x333333 }); }

        readT += dt;
        if (readT > 0.08) {
          readT = 0;
          readout('time', fmtTime(sim.t) + (running ? '' : ' ⏸') + (placeArmed ? ' 📍' : ''));
          readout('state', sim.status === 'ok' ? \`\${sim.brain.mode} · \${sim.brain.state}\` : STATUS_VI[sim.status]);
          for (let i = 0; i < 4; i++) {
            const v = Math.round(sim.cliffAdcVals[i]);
            readout('a' + (i + 1), \`\${v}\${v < sim.opt.cliffThreshold ? ' ⚠ hố' : ''}\`);
          }
          readout('mask', \`\${bits(sim.pic.cliffMask, 4)}\${sim.opt.cliffOn ? '' : ' (mask tắt)'} · \${sim.pic.blockFwd ? '⛔ chặn tiến' : 'cho tiến'}\`);
          readout('edge', sim.status === 'ok' ? Math.min(sim.x, DESK_W - sim.x, sim.y, DESK_D - sim.y) : 0);
          readout('cov', cov.percent());
          const last = sim.log.slice(-2).reverse().map((e) => \`\${fmtTime(e.t)} \${e.msg}\`).join(' · ');
          readout('ev', last || '—');
          if (robotLabel?.element) robotLabel.element.textContent = sim.status === 'ok' ? \`\${sim.brain.state}\${sim.pic.cliffMask ? ' ⚠CLIFF' : ''}\` : STATUS_VI[sim.status];
        }
        return sim.cliffAdcVals.map((v) => v);
      },

      triggerFault(id) {
        faultId = id;
        const edgePose = SCEN.mep.pose;
        if (id === 'cliff-tat') { cliffForcedOff = true; resetScene(edgePose); }
        else if (id === 'ban-cam-bien') { sim.fault.crosstalk = [0, 380, 380, 0]; resetScene(edgePose); }
        else if (id === 'mat-ban-den') {
          deskZone.rho = sunZone.rho = 0.06;
          M.desk.color.setHex(0x161616); deskTop.material.color.setHex(0x161616);   // cả vật liệu gốc (khi rê chuột viewer tạm thay bản sao)
          resetScene();
        } else if (id === 'nang-chieu') {
          sim.fault.sun = true; sunPatch.visible = true;
          resetScene(SCEN['don-ban'].pose);
        } else if (id === 'ui-laptop') { bumperForcedOff = true; sb.load(PRESETS['ui-laptop']); resetScene(SCEN['ui-laptop'].pose); }
        sim.addLog('Sự cố: ' + ({ 'cliff-tat': 'cảm biến chống rơi bị tắt', 'ban-cam-bien': 'kính cảm biến #2, #3 bám bụi', 'mat-ban-den': 'mặt bàn màu đen', 'nang-chieu': 'nắng chiếu nửa phải mặt bàn', 'ui-laptop': 'bumper bị rút dây (bố cục "ủi laptop" — Ctrl+Z để lấy lại bố cục cũ)' }[id] || id));
        running = true;
      },

      resetFault() {
        cliffForcedOff = false; bumperForcedOff = false;
        sim.fault.crosstalk = [0, 0, 0, 0]; sim.fault.sun = false; sunPatch.visible = false;
        deskZone.rho = sunZone.rho = 0.55;
        M.desk.color.setHex(0xd2a878); deskTop.material.color.setHex(0xd2a878);
        if (faultId) { faultId = null; resetScene(); }
      },

      dispose() { kb.dispose(); disposePick(); },
    };
  },
};
`;export{n as default};
