// 🏠 Môi trường mô phỏng "Căn hộ" — robot chạy bằng ĐÚNG logic firmware (src/sim/robot-brain.js)
// Căn hộ 8 × 6 m cố định (sàn, tường, ban công thấp 2 bậc). MỌI đồ đạc là đồ vật kéo-thả (sandbox, core/editor.js):
// sofa, giường, bàn ghế, thảm, dây điện, tất, đế sạc, hố cầu thang… Thêm/dời/xoá cả khi robot đang chạy —
// vật cản của mô phỏng được dựng lại ngay (src/sim/sandbox-world.js). Bản đồ nhiệt độ phủ vẽ trực tiếp lên sàn.
// Tọa độ 2D (x, y) mm, gốc ở góc tây-nam căn hộ; three.js: (x, h, −y) trong nhóm `root` đã dời về giữa.
import { createSandbox } from '../../core/editor.js';
import { World2D, CoverageGrid } from '../../sim/world2d.js';
import { rebuildWorld, syncMovables, restoreMovables } from '../../sim/sandbox-world.js';
import { RobotSim, RG, fmtTime } from '../../sim/robot-sim.js';
import { CFG } from '../../sim/robot-brain.js';
import {
  buildRobot, buildGhost, poseRobot, buildLidarRays, buildCoverageOverlay, buildFloorGrid,
  CameraRig, createKeyboard, releaseFocus, floorPicker, ledColor, bits,
} from '../../sim/scene-kit.js';

const HOUSE_W = 8000, HOUSE_D = 6000;
const WALL_H = 900;                     // tường "cắt thấp" kiểu nhà búp bê để nhìn vào trong
const DOCK = { x: 7565, y: 2540, th: Math.PI };   // khi không có đế sạc trong cảnh
const LIDAR_RAYS = 90;
const STATUS_VI = { ok: '', falling: 'ĐANG RƠI!', fallen: 'Rơi xuống bậc — cần nhấc lên', broken: '💥 ROBOT HỎNG' };

export default {
  id: 'can-nha',
  name: 'Căn hộ (mô phỏng dọn nhà)',
  category: 'mo-phong',
  order: 1,
  icon: '🏠',
  summary: 'Căn hộ 8 × 6 m có sofa, giường, bàn ghế, thảm, dây điện, tất, ban công 2 bậc. Robot chạy đúng thuật toán của firmware ESP32 + luật an toàn của PIC — xem độ phủ, pin, odometry trôi, rơi cầu thang khi tắt cảm biến.',
  tags: ['mô phỏng', 'căn nhà', 'AUTO', 'ZIGZAG', 'SPIRAL', 'xoắn ốc', 'độ phủ', 'coverage', 'odometry', 'cliff', 'bumper', 'lidar', 'pin'],

  params: [
    { id: 'algo', label: 'Thuật toán (lệnh MODE)', type: 'select', value: 'AUTO', options: [['AUTO', 'AUTO — xoắn ốc 20 s rồi va-chạm-quay'], ['ZIGZAG', 'ZIGZAG — luống song song'], ['SPIRAL', 'SPIRAL — chỉ xoắn ốc'], ['MANUAL', 'MANUAL — lái tay (phím mũi tên/WASD)']] },
    { id: 'speed', label: 'Tốc độ mô phỏng', type: 'select', value: '8', options: [['1', '1× (thời gian thực)'], ['2', '2×'], ['4', '4×'], ['8', '8×'], ['16', '16×'], ['32', '32×']] },
    { id: 'start', label: '▶ Bắt đầu / chạy tiếp', type: 'button' },
    { id: 'pause', label: '⏸ Tạm dừng', type: 'button' },
    { id: 'reset', label: '↺ Đặt lại (về đế sạc, xóa bản đồ)', type: 'button' },
    { id: 'place', label: '📍 Đặt robot (rồi bấm lên sàn)', type: 'button' },
    { id: 'rescue', label: '🖐 Gỡ dây / nhấc robot về đế', type: 'button' },
    { id: 'cam', label: 'Camera', type: 'select', value: 'free', options: [['free', 'Tự do (kéo để xoay)'], ['top', 'Nhìn từ trên xuống'], ['follow', 'Bám theo robot']] },
    { id: 'cliff', label: 'Cảm biến chống rơi (cliff)', type: 'toggle', value: true, hint: 'Tắt = CLIFF_ENABLE_MASK 0x00: cả PIC lẫn ESP32 đều không biết có hố' },
    { id: 'bumper', label: 'Bumper (công tắc va chạm)', type: 'toggle', value: true, hint: 'Tắt = rút dây 2 công tắc bumper' },
    { id: 'slip', label: 'Bánh trượt (odometry sai dần)', type: 'toggle', value: true },
    { id: 'imu', label: 'Có IMU MPU6050 (góc từ con quay)', type: 'toggle', value: false, hint: 'USE_IMU trong config.h: góc lấy từ con quay thay vì hiệu 2 encoder' },
    { id: 'ghost', label: 'Hiện bóng odometry (robot "tưởng" mình ở đâu)', type: 'toggle', value: true },
    { id: 'lidar', label: 'Hiện tia lidar 360°', type: 'toggle', value: false },
    { id: 'heat', label: 'Bản đồ nhiệt độ phủ', type: 'toggle', value: true },
    { id: 'bed', label: 'Chiều cao gầm giường', type: 'range', min: 60, max: 160, step: 5, value: 100, unit: 'mm', hint: 'Robot cao 97 mm (thân 80 mm + tháp lidar)' },
  ],
  readouts: [
    { id: 'time', label: 'Thời gian mô phỏng', unit: '' },
    { id: 'state', label: 'Chế độ · trạng thái', unit: '' },
    { id: 'cov', label: 'Độ phủ (vùng tới được)', unit: '%' },
    { id: 'passes', label: 'Số lượt quét trung bình', unit: 'lần' },
    { id: 'bat', label: 'Pin 4S 2600 mAh', unit: '%' },
    { id: 'vbat', label: 'Điện áp pin (PIC đo)', unit: 'V' },
    { id: 'amp', label: 'Dòng tiêu thụ', unit: 'A' },
    { id: 'dist', label: 'Quãng đường thật', unit: 'm' },
    { id: 'odo', label: 'Sai lệch odometry', unit: 'mm' },
    { id: 'sens', label: 'STATUS: bump · cliff · drop', unit: '' },
    { id: 'ev', label: 'Sự kiện gần nhất', unit: '' },
  ],
  scope: {
    window: 10,
    note: '(theo thời gian thực của màn hình — mô phỏng có thể đang tua nhanh)',
    channels: [
      { name: 'Bánh trái', unit: 'mm/s', min: -400, max: 400, color: '#4cc2ff' },
      { name: 'Bánh phải', unit: 'mm/s', min: -400, max: 400, color: '#ffd34d' },
      { name: 'Pin', unit: '%', min: 0, max: 100, color: '#3fd17a' },
      { name: 'Độ phủ', unit: '%', min: 0, max: 100, color: '#ff7ad9' },
    ],
  },

  info: {
    overview: `
      <p>Đây là <b>sân tập</b> cho robot: một căn hộ 8 × 6 m với đủ "bẫy" mà robot hút bụi thật hay gặp. Robot ở đây <b>không chạy kịch bản dựng sẵn</b> — nó chạy đúng mã của firmware:
      <code>Robot::step()</code> và <code>Odometry::update()</code> của ESP32-S3, cộng luật an toàn + tăng tốc dần (ramp) của PIC16F877A, được chép 1-1 sang JavaScript trong <code>lab/src/sim/robot-brain.js</code>.</p>
      <ul>
        <li><b>Chọn thuật toán</b> → robot rời đế sạc và bắt đầu dọn. Vệt màu trên sàn là <b>bản đồ nhiệt</b>: xanh nhạt = quét 1 lần, xanh đậm = 2, vàng = 3, cam = ≥ 4 lần.</li>
        <li><b>Bày đồ đạc</b>: bảng <b>📦 Đồ đạc căn hộ</b> (góc trái khung 3D) — kéo sofa, giường, ghế, thảm, dây điện, tất, hố cầu thang… vào nhà; bấm chọn rồi kéo để dời, <b>Q/E</b> xoay, <b>Del</b> xoá, Ctrl+Z hoàn tác. Làm được cả khi robot đang chạy — robot "thấy" vật mới ngay. Bố cục tự lưu trong trình duyệt.</li>
        <li><b>📍 Đặt robot</b> rồi bấm lên sàn trống để nhấc robot sang chỗ khác. Kéo <b>Đế sạc</b> đi chỗ khác để đổi điểm xuất phát (bấm ↺ Đặt lại). <b>MANUAL</b>: lái bằng phím mũi tên hoặc W/A/S/D (giữ Shift để nhanh).</li>
        <li><b>Camera</b>: "Bám theo robot" để nhìn sát; "Nhìn từ trên" để xem bản đồ phủ.</li>
        <li>Vòng tròn xanh nét mờ là <b>bóng odometry</b> — nơi robot <i>tưởng</i> mình đang đứng (chỉ dựa vào đếm xung bánh xe).</li>
      </ul>
      <div class="tip"><b>Thử nghiệm gợi ý</b><br>
      ① <b>AUTO vs ZIGZAG</b>: đặt tốc độ 32×, chạy mỗi thuật toán tới mốc 10:00, ghi % độ phủ và số lượt quét trung bình. Thuật toán nào phủ nhiều hơn? Thuật toán nào "chạy lại chỗ cũ" nhiều hơn?<br>
      ② Tắt IMU, bật bánh trượt, chạy ZIGZAG: các luống cong dần vì góc từ encoder sai. Bật IMU → luống thẳng lại.<br>
      ③ Hạ gầm giường xuống 90 mm: thân lọt nhưng tháp lidar 97 mm kẹt — bumper không hề biết!<br>
      ④ Kéo <b>Dây điện</b> hoặc <b>Tất</b> từ thư viện vào đường robot đi; kéo <b>Thảm đen</b> vào giữa phòng; đặt <b>Hố cầu thang</b> rồi tắt cảm biến cliff…<br>
      ⑤ Lái tay ra cửa ban công: cảm biến chống rơi chặn lại. Tắt cliff rồi thử lại… (hoặc bấm sự cố "Tắt cảm biến chống rơi").<br>
      ⑥ Tắt bumper: robot cứ ủi vào tường, bánh trượt nên encoder vẫn đếm → firmware không phát hiện STUCK.</div>`,
    specs: [
      ['Căn hộ', '8 × 6 m: phòng khách + bàn ăn ~30 m², phòng ngủ 9 m², bếp 7.6 m², ban công thấp 30 cm (2 bậc × 15 cm)'],
      ['Robot', 'Ø350 mm, cao 97 mm (thân 80 + tháp lidar 17), 3.5 kg, 2 bánh Ø70 cách 235 mm, bánh tự lựa phía trước'],
      ['Tốc độ', 'SPEED_CRUISE 450 ‰ ≈ 270 mm/s · lùi 300 ‰ · xoay 160–380 ‰ (giả định 1000 ‰ ≈ 600 mm/s ở 14.8 V)'],
      ['Nhịp điều khiển', 'PIC: ngắt 1 ms (ramp 10 ‰/ms, chặn tiến tức thì) · STATUS 50 Hz → ESP32 Robot::step() · DRIVE 20 Hz'],
      ['Cảm biến', 'Bumper 2 công tắc (cung ±80°) · 4 cliff IR ở bán kính 155 mm, góc ±25°, ±70° · 2 công tắc nhấc bánh · encoder 1000 xung/vòng'],
      ['Miệng hút', 'Bề rộng làm sạch ~250 mm (= LANE_WIDTH_MM, khoảng cách 2 luống zig-zag)'],
      ['Pin', '4S Li-ion 2600 mAh, 12.0–16.6 V. Dòng khi dọn ≈ 2.8–3.2 A → ~50 phút. Cờ LOW_BAT < 13.2 V, cắt < 12.4 V'],
      ['Lưới độ phủ', 'Ô 25 × 25 mm; mẫu số = các ô mà miệng hút có thể chạm tới (loang từ đế sạc)'],
      ['Bước mô phỏng', 'Cố định 10 ms; tua 32× = 53 bước mỗi khung hình'],
    ],
    principle: `
      <h4>1. Hai tầng điều khiển (giống robot thật)</h4>
      <p><b>Cảm biến → PIC</b> (phản xạ an toàn trong 1 ms) <b>→ STATUS 50 Hz → ESP32</b> (odometry + thuật toán) <b>→ DRIVE 20 Hz → PIC</b> (ramp) <b>→ động cơ</b>.
      Dù ESP32 có ra lệnh gì, PIC vẫn <b>cắt ngay chiều tiến</b> khi bumper/cliff báo, và <b>dừng hết</b> khi nhấc bánh, pin cạn hoặc 300 ms không nhận được DRIVE.</p>
      <h4>2. Xe 2 bánh vi sai</h4>
      <p><code>v = (v<sub>L</sub> + v<sub>R</sub>)/2</code>, <code>ω = (v<sub>R</sub> − v<sub>L</sub>)/b</code> với b = 235 mm. Hai bánh bằng nhau → đi thẳng; ngược dấu → xoay tại chỗ.</p>
      <h4>3. Odometry (định vị bằng đếm xung)</h4>
      <p>Mỗi 20 ms: <code>s = Δxung × π·70/1000</code> (0.22 mm/xung), <code>dc = (s<sub>L</sub>+s<sub>R</sub>)/2</code>, <code>dθ = (s<sub>R</sub>−s<sub>L</sub>)/235</code>, <code>x += dc·cos(θ+dθ/2)</code>…
      Bánh trượt 1% là sai số góc tích lũy mãi — đó là lý do bóng odometry trôi xa robot thật. Con quay IMU đo góc trực tiếp nên đỡ trôi hơn nhiều.</p>
      <h4>4. Ba thuật toán của firmware</h4>
      <ul>
        <li><b>SPIRAL</b>: xoắn ốc Archimedes <code>R = b/2 + 250·φ/2π</code> — mỗi vòng nở thêm đúng 1 bề rộng chổi. Bánh ngoài chạy 450 ‰, bánh trong <code>450·(R−b/2)/(R+b/2)</code>. Dừng khi R > 0.9 m hoặc chạm vật.</li>
        <li><b>AUTO</b> (kiểu Roomba): 20 s xoắn ốc rồi <b>đi thẳng → va chạm → lùi 60 mm → xoay ngẫu nhiên 100–170°</b> (va trái thì xoay phải). Ngẫu nhiên nhưng theo thời gian sẽ phủ gần hết, kể cả góc khuất.</li>
        <li><b>ZIGZAG</b> (luống cày, <i>boustrophedon</i>): đi hết luống → lùi → xoay 90° → dịch 250 mm → xoay 90° → luống mới ngược chiều. Không dịch được (góc phòng) → bắt đầu <i>vùng</i> mới theo hướng ngẫu nhiên; tối đa 12 vùng. Gọn, ít trùng lặp — nhưng <b>cần góc chính xác</b>.</li>
      </ul>
      <h4>5. Phát hiện kẹt</h4>
      <p>Đang tiến mà 3 s odometry chưa tăng 20 mm → sự kiện <code>STUCK</code>. Điểm yếu: nếu bánh <b>trượt</b> trên sàn trơn thì encoder vẫn đếm, odometry vẫn tăng → firmware không biết mình đang kẹt.</p>
      <h4>6. Pin</h4>
      <p><code>I = I<sub>bánh</sub> + I<sub>chổi chính</sub> + I<sub>chổi cạnh</sub> + I<sub>quạt</sub> + I<sub>mạch+lidar</sub></code>; dung lượng giảm <code>ΔQ = I·Δt</code>; điện áp đo được <code>V = 4·OCV(%) − I·R<sub>trong</sub></code>. Khi kẹt, dòng động cơ tăng vọt (dòng kẹt) → pin tụt nhanh.</p>`,
    inRobot: `
      <ul>
        <li><code>firmware/esp32s3/src/robot.cpp</code> → <code>lab/src/sim/robot-brain.js</code> lớp <code>Robot</code> và <code>Odometry</code>: cùng trạng thái IDLE/FWD/BACKUP/TURN/SPIRAL/LANE/SHIFT/MANUAL, cùng sự kiện <code>E,BUMP_L</code>, <code>E,CLIFF</code>, <code>E,STUCK</code>, <code>E,ZIG_NEW_REGION</code>, <code>E,LOWBAT</code>…</li>
        <li><code>firmware/esp32s3/src/config.h</code> → hằng <code>CFG</code>: SPEED_CRUISE 450, BACKUP_MM 60, AUTO_SPIRAL_MS 20000, LANE_WIDTH_MM 250, STUCK_MS 3000… Muốn thử hằng số mới? Sửa ở đây, xem mô phỏng, rồi mới nạp vào robot.</li>
        <li><code>firmware/pic16f877a_ccs/motor.c</code> <code>motor_tick_1ms()</code> → <code>PicMcu.tick()</code>: ramp <code>RAMP_STEP</code> 10 ‰/ms, <code>block_fwd</code> cắt tức thì, <code>stop_all</code> khi nhấc bánh/mất liên lạc/pin cạn.</li>
        <li><code>sensors.c</code> <code>cliff_update()</code>: bật/tắt LED IR, lấy hiệu ADC, &lt; <code>CLIFF_THRESHOLD</code> 60 hai lần liên tiếp (40 ms) mới báo hố. <code>vbat_update()</code>: lọc 1/8, trễ 0.3 V.</li>
        <li>ESP32 không nhận STATUS 300 ms → <code>robot.picLost()</code>; lái tay mất lệnh 500 ms → dừng (<code>MANUAL_TIMEOUT_MS</code>).</li>
        <li>Lidar LDS02RR mới để <b>hiển thị</b>: firmware hiện tại chưa dùng. Giai đoạn sau, ODROID-M2 chạy ROS 2 + slam_toolbox sẽ dùng lidar để vẽ bản đồ và đi theo luống chính xác thay cho odometry.</li>
        <li>Firmware hiện <b>không có</b> "về đế sạc": khi <code>LOWBAT</code> robot chỉ dừng lại. Robot thương mại dùng đèn IR trên đế + lidar để tìm đường về.</li>
      </ul>`,
    mistakes: `
      <ul>
        <li><b>Dây sạc, dây rèm, tất trên sàn</b> → cuốn vào chổi chính, robot bị neo tại chỗ. Firmware chưa đo dòng chổi chính nên không biết — nên thêm điện trở shunt + ADC để phát hiện quá dòng.</li>
        <li><b>Gầm tủ/giường 80–97 mm</b>: thân lọt, tháp lidar kẹt. Bumper không chạm → robot cứ ủi. Robot thương mại có thêm "bumper lidar" trên nóc.</li>
        <li><b>Thảm màu tối / thảm đen</b>: phản xạ IR rất yếu → cảm biến cliff báo "hố" giả, robot không dám lên thảm.</li>
        <li><b>Nẹp cửa cao &gt; 20 mm</b>: bánh Ø70 không leo được, robot coi như vật cản (hoặc bị treo bụng).</li>
        <li><b>Chỉ dùng encoder để đo góc</b>: sai 1% giữa 2 bánh → sau 50 m quãng đường lệch hàng chục độ; ZIGZAG thành luống cong. Nên dùng IMU (con quay) cho góc.</li>
        <li><b>Tắt/không lắp cảm biến chống rơi</b> "để test cho nhanh" rồi quên bật lại → robot lao xuống cầu thang. Lệnh <code>SAFETY:0</code> chỉ dùng khi kê bánh trên bàn!</li>
        <li><b>Đặt đế sạc sát góc / sau chân ghế</b> → robot khó ra/vào. Nên chừa ≥ 0.5 m hai bên và 1 m phía trước.</li>
      </ul>`,
    quiz: [
      { q: 'Vì sao bóng odometry trôi dần khỏi robot thật, kể cả khi robot không va vào đâu?', a: 'Odometry chỉ cộng dồn số xung encoder. Bánh trượt hoặc 2 bánh lệch đường kính chút ít (vd 1%) làm sai góc θ một lượng nhỏ mỗi bước, và sai số góc tích lũy mãi → vị trí lệch ngày càng xa. Con quay IMU giúp đo góc tốt hơn.' },
      { q: 'Bumper đang bị ấn nhưng ESP32 vẫn gửi lệnh DRIVE tiến 450 ‰. Bánh xe làm gì?', a: 'Không tiến. PIC tính block_fwd = 1 trong ngắt 1 ms và ép applied ≥ 0 về 0 ngay lập tức (không ramp) — vẫn cho phép lùi. Đây là lớp an toàn không phụ thuộc ESP32.' },
      { q: 'Với ZIGZAG, khoảng cách 2 luống là bao nhiêu và vì sao chọn số đó?', a: 'LANE_WIDTH_MM = 250 mm ≈ bề rộng miệng hút + chổi chính, để luống sau vừa chồng mép luống trước → không bỏ sót dải sàn nào.' },
    ],
  },

  faults: [
    { id: 'cliff-tat', label: 'Tắt cảm biến chống rơi rồi chạy về phía ban công', severity: 'hong',
      what: '<p>Robot lao thẳng tới cửa ban công, không hề giảm tốc. Bánh hụt mép bậc 15 cm → robot chúc đầu, lộn xuống bậc dưới, va đập, tia lửa, khói. Công tắc nhấc bánh báo LIFTED nhưng đã quá muộn.</p>',
      why: '<p>Với <code>CLIFF_ENABLE_MASK = 0</code> (hoặc rút giắc cảm biến), cliff_mask luôn 0 → PIC không chặn tiến, ESP32 không biết có hố. Rơi tự do 0.15–0.3 m chạm sàn ở <code>v = √(2gh)</code> ≈ 1.7–2.4 m/s: đủ vỡ chốt bumper, lệch trục bánh, bật nắp pin.</p>',
      fix: '<p>Không bao giờ tắt cliff khi robot đứng trên sàn thật. Khi cần test động cơ, kê robot lên hộp cho bánh quay tự do. Lắp ≥ 4 cảm biến, đặt ngoài vệt bánh xe (bán kính 155 mm &gt; 117.5 mm của bánh) để hố được thấy TRƯỚC khi bánh tới mép.</p>' },
    { id: 'bumper-ket', label: 'Công tắc bumper trái bị kẹt (luôn ấn)', severity: 'loi',
      what: '<p>Robot lùi – xoay – lùi – xoay liên tục, không bao giờ đi tới được. Sự kiện <code>BUMP_L</code> rồi trạng thái BACKUP/TURN lặp lại.</p>',
      why: '<p>bump_mask = 0x01 vĩnh viễn → PIC giữ block_fwd = 1: mọi lệnh tiến bị cắt về 0. Robot::step() thấy <code>hit</code> mỗi lần vào FWD → startBackup(). Khi xoay tại chỗ, bánh cần quay tiến cũng bị chặn nên robot chỉ "xoay quanh 1 bánh".</p>',
      fix: '<p>Vệ sinh bụi/tóc kẹt trong khe bumper, kiểm tra lò xo hồi. Trong firmware có thể thêm luật: bumper ấn liên tục &gt; 10 s → báo lỗi "bumper kẹt" và dừng, thay vì lùi mãi.</p>' },
    { id: 'encoder-hong', label: 'Encoder bánh trái hỏng (không có xung)', severity: 'loi',
      what: '<p>Bóng odometry quay tròn tại chỗ trong khi robot thật chạy vòng tròn hoặc vặn vẹo. ZIGZAG: luống cong, xoay sai góc. SPIRAL kết thúc sớm.</p>',
      why: '<p>dl = 0 nên odometry tính <code>dθ = s<sub>R</sub>/235</code> — tưởng robot luôn quay trái. Bộ giữ hướng <code>driveHeading()</code> bù bằng cách cho bánh trái nhanh hơn (tới 250 ‰) → robot thật rẽ phải liên tục.</p>',
      fix: '<p>Kiểm tra dây/nam châm encoder; firmware có thể so sánh 2 encoder: một bánh đang được cấp PWM &gt; 300 ‰ mà 0.5 s không có xung → báo lỗi encoder. Dùng IMU cho góc cũng giảm hậu quả.</p>' },
    { id: 'pin-yeu', label: 'Pin yếu giữa chừng (còn ~12%)', severity: 'nhe',
      what: '<p>Điện áp tụt nhanh khi đang dọn, robot chạy chậm dần (cùng duty PWM nhưng áp thấp), rồi dừng hẳn với sự kiện <code>E,LOWBAT</code>.</p>',
      why: '<p>Pin 4S ở 12% ≈ 4 × 3.45 V = 13.8 V hở mạch; khi kéo 3 A qua điện trở trong 0.15 Ω còn ~13.35 V. PIC lọc trung bình, xuống dưới VBAT_LOW_MV 13.2 V → cờ LOW_BAT → ESP32 <code>finish("LOWBAT")</code>.</p>',
      fix: '<p>Firmware nên dự trữ năng lượng để quay về đế (≥ 15%). Không xả 4S xuống dưới 12.4 V (3.1 V/cell) — PIC chốt <code>vbat_cut</code> để bảo vệ pin.</p>' },
    { id: 'day-quan', label: 'Dây điện vắt ngang đường đi → quấn chổi', severity: 'loi',
      what: '<p>Một sợi dây xuất hiện trước mặt robot. Robot cán qua, chổi chính cuốn dây, robot bị neo: bánh quay, đèn xanh vẫn sáng, nhưng không đi đâu được. Dòng tiêu thụ tăng vọt.</p>',
      why: '<p>Chổi chính kẹt → dòng động cơ chổi lên mức kẹt ~2.6 A. Firmware PIC chỉ bật/tắt chổi bằng MOSFET, không đo dòng → không phát hiện. Trên sàn trơn bánh trượt nên odometry vẫn tăng → không có cả STUCK.</p>',
      fix: '<p>Dọn dây trước khi chạy robot. Phần cứng: thêm shunt 0.05 Ω + ADC đo dòng chổi, quá 1.5 A trong 1 s → đảo chiều chổi nhả dây và báo lỗi. Bấm "🖐 Gỡ dây" để giải cứu.</p>' },
    { id: 'mat-ket-noi', label: 'Đứt dây UART giữa ESP32 và PIC', severity: 'loi',
      what: '<p>Robot dừng sau ~0.3 s, chổi tắt. Sự kiện <code>E,PIC_LOST</code>, chế độ về IDLE.</p>',
      why: '<p>PIC không nhận DRIVE (nhịp tim 20 Hz) quá COMM_TIMEOUT_MS 300 ms → comm_lost → stop_all. ESP32 không nhận STATUS quá PIC_LOST_MS 300 ms → <code>robot.picLost()</code>. Hai phía cùng tự dừng — thiết kế "an toàn khi hỏng" (fail-safe).</p>',
      fix: '<p>Dây UART dùng đầu nối có khóa, đi dây xa động cơ, có trở kéo lên. Khi mất ESP32 hẳn, có thể bấm nút trên PIC để chạy chế độ tự chạy đơn giản (standalone.c).</p>' },
  ],

  build(ctx) {
    const { THREE, MAT, geom, tint, label, readout, fx, viewer } = ctx;
    const { mesh, group, box, cyl } = geom;
    const part = geom.part;
    // Hai hệ tọa độ: 2D mô phỏng (x, y) gốc ở góc tây-nam; three.js của sandbox: X = x − OX, Z = OY − y
    const OX = HOUSE_W / 2, OY = HOUSE_D / 2;
    const root = new THREE.Group();
    root.position.set(-OX, 0, OY);                 // phần cố định vẽ theo tọa độ 2D, dời để căn hộ nằm giữa
    const sbRoot = new THREE.Group();
    sbRoot.position.set(OX, 0, -OY);               // → đồ vật sandbox nằm trong hệ thế giới (không dời)
    root.add(sbRoot);
    const W = (x, y) => ({ x: x - OX, z: OY - y });   // 2D → tọa độ sandbox

    const world = new World2D({
      bounds: { x0: 0, y0: 0, x1: HOUSE_W, y1: HOUSE_D },
      base: { name: 'Sàn gỗ phòng khách', h: 0, rho: 0.55, speed: 1, slip: 0.02, encSlip: 0.3, kind: 'wood' },
    });

    // ---------- vật liệu ----------
    const M = {
      woodLiving: tint(MAT.plasticWhite, 0xc79a6b), woodBed: tint(MAT.plasticWhite, 0xdcb98f), tile: tint(MAT.plasticWhite, 0xdfe3e6),
      balcony: tint(MAT.plasticWhite, 0xa9a196), step: tint(MAT.plasticWhite, 0xbcb3a6), rug: tint(MAT.plasticRed, 0x8a4f5d),
      rugBlack: tint(MAT.plasticBlack, 0x0c0c0e), wall: tint(MAT.plasticWhite, 0xece7de), sofa: tint(MAT.plasticGrey, 0x5d6f8c),
      sofaDark: tint(MAT.plasticGrey, 0x4a5873), wood: tint(MAT.plasticWhite, 0x8a5a3a), woodLight: tint(MAT.plasticWhite, 0xb88a5e),
      white: tint(MAT.plasticWhite, 0xf3f3f1), sheet: tint(MAT.plasticWhite, 0xe8eef7), blanket: tint(MAT.plasticBlue, 0x6d8fc4),
      metal: MAT.aluminum.clone(), black: tint(MAT.plasticBlack, 0x1d1f23), threshold: tint(MAT.plasticWhite, 0xa57c52),
      leaf: tint(MAT.plasticGreen, 0x3f8f4a), pot: tint(MAT.plasticWhite, 0xb5653d), cable: tint(MAT.plasticBlack, 0x202020),
      pit: tint(MAT.plasticDark, 0x3a3d42), warn: tint(MAT.plasticYellow, 0xf2c200), fridge: tint(MAT.aluminum, 0xd0d4d8),
      sock: tint(MAT.plasticWhite, 0xd8d0c0), slipper: tint(MAT.plasticBlue, 0x3a6fc0), ball: tint(MAT.plasticYellow, 0xffb020), bin: tint(MAT.plasticGrey, 0x8a9aa8),
    };
    for (const [k, m] of Object.entries(M)) if (k !== 'metal') m.roughness = 0.7;   // toàn bản sao → không ảnh hưởng MAT chung

    // hộp theo tọa độ 2D: [x0..x1] × [y0..y1] × độ cao [z0..z1] (cho phần cố định, trong `root`)
    const bx = (x0, y0, x1, y1, z0, z1, mat, r = 0) =>
      mesh(box(x1 - x0, z1 - z0, y1 - y0, r), mat, { x: (x0 + x1) / 2, y: (z0 + z1) / 2, z: -(y0 + y1) / 2 });
    // hộp theo tọa độ CỤC BỘ của đồ vật (lx, ly) — gốc ở tâm đáy
    const lb = (lx0, ly0, lx1, ly1, z0, z1, mat, r = 0) =>
      mesh(box(lx1 - lx0, z1 - z0, ly1 - ly0, r), mat, { x: (lx0 + lx1) / 2, y: (z0 + z1) / 2, z: -(ly0 + ly1) / 2 });
    const lc = (lx, ly, rT, rB, z0, z1, mat, seg = 24) => mesh(cyl(rT, rB, z1 - z0, seg), mat, { x: lx, y: (z0 + z1) / 2, z: -ly });
    const G = (...a) => group(...a);

    // =====================================================================================
    // PHẦN CỐ ĐỊNH: sàn (có khoét lỗ khi đặt "hố cầu thang"), tường, ban công 2 bậc, lan can
    // =====================================================================================
    const fixedFloors = [];
    const fixedObs = [];
    const addFixedFloor = (x0, y0, x1, y1, props) => fixedFloors.push(world.addFloor(x0, y0, x1, y1, props));
    const floors = new THREE.Group();
    const slabMeshes = {};
    const FLOOR_RECTS = {
      living: { r: [0, 1100, HOUSE_W, HOUSE_D], y: 0, mat: M.woodLiving, extrude: true },
      bed: { r: [0, 3300, 3400, HOUSE_D], y: 0.6, mat: M.woodBed },
      kitchen: { r: [3500, 4300, HOUSE_W, HOUSE_D], y: 0.6, mat: M.tile },
    };
    function floorGeo(key, holes) {
      const { r: [x0, y0, x1, y1], y, extrude } = FLOOR_RECTS[key];
      const sh = new THREE.Shape();
      sh.moveTo(x0, y0); sh.lineTo(x1, y0); sh.lineTo(x1, y1); sh.lineTo(x0, y1); sh.closePath();
      for (const [hx0, hy0, hx1, hy1] of holes) {
        const a = Math.max(hx0, x0 + 3), b = Math.max(hy0, y0 + 3), c = Math.min(hx1, x1 - 3), d = Math.min(hy1, y1 - 3);
        if (c - a < 20 || d - b < 20) continue;
        const p = new THREE.Path();
        p.moveTo(a, b); p.lineTo(a, d); p.lineTo(c, d); p.lineTo(c, b); p.closePath();
        sh.holes.push(p);
      }
      let g;
      if (extrude) { g = new THREE.ExtrudeGeometry(sh, { depth: 320, bevelEnabled: false, curveSegments: 1 }); g.rotateX(-Math.PI / 2); g.translate(0, -320 + y, 0); }
      else { g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); g.translate(0, y, 0); }
      return g;
    }
    for (const key of Object.keys(FLOOR_RECTS)) {
      const m = new THREE.Mesh(floorGeo(key, []), FLOOR_RECTS[key].mat);
      m.receiveShadow = true; m.userData.floor = true;
      slabMeshes[key] = m;
      floors.add(m);
    }
    part(slabMeshes.living, 'Sàn gỗ (phòng khách, bàn ăn)', 'Gỗ công nghiệp — hệ số phản xạ hồng ngoại ~0.55 → cảm biến cliff đọc ~420. Bánh cao su bám tốt, trượt ~2%.');
    part(slabMeshes.kitchen, 'Gạch men bếp', 'Phản xạ IR mạnh (~0.8), trơn hơn gỗ: khi robot bị chặn, bánh dễ trượt quay tại chỗ → encoder vẫn đếm.');
    part(slabMeshes.bed, 'Sàn gỗ phòng ngủ', '');
    addFixedFloor(0, 3300, 3400, HOUSE_D, { h: 0.6, name: 'Sàn gỗ phòng ngủ', rho: 0.62, kind: 'wood' });
    addFixedFloor(3500, 4300, HOUSE_W, HOUSE_D, { h: 0.6, name: 'Gạch bếp', rho: 0.8, slip: 0.03, encSlip: 0.4, kind: 'tile' });
    const balc = bx(0, 0, HOUSE_W, 1000, -320, -300, M.balcony);
    const stepM = bx(2600, 850, 4400, 1100, -320, -150, M.step);
    balc.userData.floor = stepM.userData.floor = true; balc.castShadow = stepM.castShadow = false;
    addFixedFloor(0, 0, HOUSE_W, 1000, { h: -300, name: 'Ban công', rho: 0.6, kind: 'balcony' });
    addFixedFloor(2600, 850, 4400, 1100, { h: -150, name: 'Bậc xuống ban công', rho: 0.6, kind: 'step' });
    floors.add(part(balc, 'Sàn ban công (thấp hơn 30 cm)', 'Thấp hơn sàn nhà 2 bậc × 15 cm. Với robot Ø350 mm cao 97 mm, đây là một "vách đá" (cliff) thật sự.'));
    floors.add(part(stepM, 'Bậc thềm 15 cm', 'Bậc thứ nhất xuống ban công, sâu chỉ 25 cm (hẹp hơn thân robot 35 cm) — robot rơi xuống đây sẽ chúc đầu, lộn tiếp xuống bậc 2.'));
    floors.add(buildFloorGrid(THREE, 0, 1100, HOUSE_W, HOUSE_D, 500, 1.2));
    root.add(floors);

    const walls = new THREE.Group();
    const wall = (x0, y0, x1, y1, zb = 0, zt = WALL_H) => {
      fixedObs.push(world.addBox(x0, y0, x1, y1, { zBot: zb, zTop: zt, name: 'Tường' }));
      walls.add(bx(x0, y0, x1, y1, zb, zt, M.wall));
    };
    wall(-100, -100, 0, HOUSE_D + 100, -320);
    wall(HOUSE_W, -100, HOUSE_W + 100, HOUSE_D + 100, -320);
    wall(0, HOUSE_D, HOUSE_W, HOUSE_D + 100);
    wall(0, 1000, 2600, 1100, -300); wall(4400, 1000, HOUSE_W, 1100, -300);          // tường ra ban công
    wall(0, 3200, 2300, 3300); wall(3200, 3200, 3500, 3300);                         // tường phòng ngủ (cửa 2300–3200)
    wall(3400, 3300, 3500, HOUSE_D);
    wall(3500, 4200, 5200, 4300); wall(6600, 4200, HOUSE_W, 4300);                   // tường bếp (vòm 5200–6600)
    root.add(part(walls, 'Tường (cắt thấp 0.9 m để nhìn vào)', 'Robot chạm tường bằng bumper. Đi men tường là cách duy nhất để chổi cạnh quét được chân tường.'));
    fixedObs.push(world.addBox(0, -100, HOUSE_W, 0, { zBot: -300, zTop: 800, name: 'Lan can' }));
    root.add(part(group(bx(0, -60, HOUSE_W, -40, -300, 750, MAT.glass), bx(0, -70, HOUSE_W, -30, 750, 790, M.metal)), 'Lan can kính ban công', 'Cao 1.1 m tính từ sàn ban công.'));
    root.add(part(group(bx(2600, 1020, 2640, 1080, -150, WALL_H, M.metal), bx(4360, 1020, 4400, 1080, -150, WALL_H, M.metal), bx(2600, 1035, 4400, 1065, -150, -140, M.metal)),
      'Ray cửa kính ban công', 'Cửa đang mở. Ngay sau ray là bậc xuống 15 cm — mép nguy hiểm nhất nhà với robot.'));
    label(root, 'Phòng khách', [1300, 1000, -2600]);
    label(root, 'Phòng ngủ', [1700, 1000, -3600]);
    label(root, 'Bếp', [5600, 1000, -4900]);
    label(root, 'Ban công (thấp 30 cm)', [1300, 300, -500]);

    // =====================================================================================
    // THƯ VIỆN ĐỒ ĐẠC (kéo-thả). meta: xem src/sim/sandbox-world.js
    // =====================================================================================
    let bedClear = 100;
    const bedMeta = (c) => ({ solids: [
      { box: [-1000, -800, 1000, 800], z: [c, c + 250], name: 'Khung giường' },
      ...[[-1000, -800], [930, -800], [-1000, 730], [930, 730]].map(([x, y]) => ({ box: [x, y, x + 70, y + 70], z: [0, c], name: 'Chân giường' })),
    ] });
    function buildBed(c) {
      const top = G(lb(-1000, -800, 1000, 800, 0, 100, M.wood, 6), lb(-970, -770, 970, 770, 100, 330, M.sheet, 30), lb(-300, -760, 980, 760, 330, 380, M.blanket, 20),
        lb(-940, -680, -550, -50, 330, 420, M.white, 30), lb(-940, 50, -550, 680, 330, 420, M.white, 30), lb(-1000, -800, -940, 800, 100, 1000, M.wood, 6));
      const legGeo = box(70, 1, 70); legGeo.translate(0, 0.5, 0);
      const legs = [[-965, -765], [965, -765], [-965, 765], [965, 765]].map(([x, y]) => mesh(legGeo, M.wood, { x, z: -y }));
      const g = G(top, ...legs);
      g.userData.setClear = (h) => { top.position.y = h; legs.forEach((l) => (l.scale.y = h)); };
      g.userData.setClear(c);
      return g;
    }
    const chairMeta = { solids: [
      ...[[-215, -215], [190, -215], [-215, 190], [190, 190]].map(([x, y]) => ({ box: [x, y, x + 25, y + 25], z: [0, 430], name: 'Chân ghế' })),
      { box: [-225, -225, 225, 225], z: [430, 460], name: 'Mặt ghế' }, { box: [-225, -225, 225, -205], z: [460, 900], name: 'Tựa ghế' },
    ] };
    const tableLegs = (w, d, inset, s, h) => [[-w / 2 + inset, -d / 2 + inset], [w / 2 - inset - s, -d / 2 + inset], [-w / 2 + inset, d / 2 - inset - s], [w / 2 - inset - s, d / 2 - inset - s]]
      .map(([x, y]) => ({ box: [x, y, x + s, y + s], z: [0, h] }));
    const cablePts = [[-600, 0], [-300, 90], [0, -40], [300, 70], [600, 0]];
    const tube = (pts, y, r) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, y, -z))), 60, r, 6, false), M.cable);

    const catalog = [
      // ----- Phòng khách -----
      { id: 'sofa', name: 'Sofa 3 chỗ', icon: '🛋', group: 'Phòng khách', desc: 'Đế liền sàn, robot không chui được — chỉ đi men theo.',
        build: () => G(lb(-1050, -425, 1050, 425, 0, 420, M.sofa, 30), lb(-1050, -425, 1050, -205, 420, 820, M.sofaDark, 40), lb(-1050, -425, -870, 425, 420, 620, M.sofaDark, 40),
          lb(870, -425, 1050, 425, 420, 620, M.sofaDark, 40), lb(-850, -185, -10, 395, 420, 520, M.sofa, 40), lb(10, -185, 850, 395, 420, 520, M.sofa, 40)),
        meta: { solids: [{ box: [-1050, -425, 1050, 425], z: [0, 820] }] } },
      { id: 'ban-tra', name: 'Bàn trà (gầm 400 mm)', icon: '☕', group: 'Phòng khách', surface: true, desc: 'Robot chui gầm thoải mái; 4 chân 50 mm là vật cản nhỏ.',
        build: () => G(lb(-500, -250, 500, 250, 400, 430, M.woodLight, 6), ...tableLegs(1000, 500, 0, 50, 400).map((l) => lb(...l.box, 0, 400, M.wood))),
        meta: { solids: [...tableLegs(1000, 500, 0, 50, 400), { box: [-500, -250, 500, 250], z: [400, 430] }] } },
      { id: 'ke-tv', name: 'Kệ TV + TV 55"', icon: '📺', group: 'Phòng khách', surface: true, desc: 'Đế liền. Sau kệ TV luôn có ổ cắm và dây điện.',
        build: () => G(lb(-900, -160, 900, 160, 0, 450, M.white, 8), lb(-600, 40, 600, 80, 470, 1150, M.black, 6), lb(-50, 20, 50, 100, 450, 470, M.black)),
        meta: { solids: [{ box: [-900, -160, 900, 160], z: [0, 450] }, { box: [-600, 40, 600, 80], z: [450, 1150] }] } },
      { id: 'tham', name: 'Thảm lông ngắn', icon: '🟥', group: 'Phòng khách', desc: 'Dày 10 mm: robot chậm ~15%, chổi tốn thêm dòng, bánh ít trượt (STUCK dễ phát hiện).',
        build: () => { const m = lb(-975, -400, 975, 400, 0, 10, M.rug); m.castShadow = false; return G(m); },
        meta: { zone: { rect: [-975, -400, 975, 400], h: 10, name: 'Thảm', rho: 0.33, speed: 0.85, slip: 0.06, encSlip: 0.05, kind: 'rug' } } },
      { id: 'tu-thap', name: 'Tủ thấp / buffet', icon: '🗄', group: 'Phòng khách', surface: true, desc: 'Đế liền sàn.',
        build: () => G(lb(-650, -200, 650, 200, 0, 800, M.white, 8)), meta: { solids: [{ box: [-650, -200, 650, 200], z: [0, 800] }] } },
      { id: 'den-cay', name: 'Đèn cây', icon: '💡', group: 'Phòng khách', desc: 'Đế tròn Ø300 — va chạm ở rìa tròn làm robot xoay theo hướng khó đoán.',
        build: () => G(lc(0, 0, 150, 150, 0, 20, M.metal, 32), lc(0, 0, 12, 12, 20, 1500, M.metal, 12), lc(0, 0, 160, 160, 1450, 1650, M.white)),
        meta: { solids: [{ circle: [0, 0, 150], z: [0, 1650] }] } },
      // ----- Phòng ngủ -----
      { id: 'giuong-thap', name: 'Giường gầm thấp (robot chui được)', icon: '🛏', group: 'Phòng ngủ', surface: true,
        desc: 'Gầm chỉnh bằng thanh trượt "Chiều cao gầm giường" (mặc định 100 mm ≥ 97 mm robot). 80–97 mm: tháp lidar kẹt.',
        build: () => buildBed(bedClear), meta: bedMeta(100) },
      { id: 'giuong-cao', name: 'Giường gầm cao 300 mm', icon: '🛏', group: 'Phòng ngủ', surface: true, desc: 'Robot chui gầm dọn bụi dễ dàng, lidar nhìn xuyên dưới gầm.',
        build: () => buildBed(300), meta: bedMeta(300) },
      { id: 'tu-quan-ao', name: 'Tủ quần áo', icon: '🚪', group: 'Phòng ngủ', desc: 'Đế liền sàn, cao 1.9 m.',
        build: () => G(lb(-300, -800, 300, 800, 0, 1900, M.woodLight, 8)), meta: { solids: [{ box: [-300, -800, 300, 800], z: [0, 1900] }] } },
      { id: 'tu-dau-giuong', name: 'Tủ đầu giường', icon: '🗃', group: 'Phòng ngủ', surface: true, desc: '',
        build: () => G(lb(-225, -225, 225, 225, 0, 550, M.woodLight, 6)), meta: { solids: [{ box: [-225, -225, 225, 225], z: [0, 550] }] } },
      // ----- Bếp / ăn -----
      { id: 'ban-an', name: 'Bàn ăn 1.6 × 0.9 m', icon: '🍽', group: 'Bếp / ăn', surface: true, desc: 'Gầm 720 mm, 4 chân 60 mm.',
        build: () => G(lb(-800, -450, 800, 450, 720, 750, M.woodLight, 6), ...tableLegs(1600, 900, 40, 60, 720).map((l) => lb(...l.box, 0, 720, M.wood))),
        meta: { solids: [...tableLegs(1600, 900, 40, 60, 720), { box: [-800, -450, 800, 450], z: [720, 750] }] } },
      { id: 'ghe', name: 'Ghế ăn (4 chân mảnh)', icon: '🪑', group: 'Bếp / ăn', desc: 'Khe giữa 2 chân 380 mm — robot Ø350 lọt vào gầm ghế rồi loay hoay mãi mới ra.',
        build: () => G(...chairMeta.solids.slice(0, 4).map((l) => lb(...l.box, 0, 430, M.metal)), lb(-225, -225, 225, 225, 430, 460, M.wood, 4), lb(-225, -225, 225, -205, 460, 900, M.wood, 4)),
        meta: chairMeta },
      { id: 'tu-lanh', name: 'Tủ lạnh', icon: '🧊', group: 'Bếp / ăn', desc: '',
        build: () => G(lb(-375, -375, 375, 375, 0, 1800, M.fridge, 10)), meta: { solids: [{ box: [-375, -375, 375, 375], z: [0, 1800] }] } },
      { id: 'tu-bep', name: 'Tủ bếp dưới 1.8 m', icon: '🍳', group: 'Bếp / ăn', surface: true, desc: 'Hõm chân tủ 100 mm robot không với tới — chỉ chổi cạnh gạt rác ra được.',
        build: () => G(lb(-900, -300, 900, 300, 0, 880, M.white, 6), lb(-900, -320, 900, 300, 880, 910, M.black, 4)), meta: { solids: [{ box: [-900, -300, 900, 300], z: [0, 910] }] } },
      // ----- Vật cản nhỏ -----
      { id: 'day-dien', name: 'Dây điện trên sàn', icon: '🔌', group: 'Vật cản nhỏ', desc: 'Ø5 mm, bumper không chạm. Chổi chính cán qua là cuốn vào → robot bị neo.',
        build: () => G(tube(cablePts, 5, 5)), meta: { hazard: { kind: 'cable', pts: cablePts, r: 5 } } },
      { id: 'tat', name: 'Tất rơi', icon: '🧦', group: 'Vật cản nhỏ', desc: 'Bị hút vào rồi quấn chổi chính.',
        build: () => { const m = new THREE.Mesh(new THREE.SphereGeometry(55, 14, 8), M.sock); m.scale.set(1.6, 0.22, 0.8); m.position.y = 10; return G(m); },
        meta: { hazard: { kind: 'sock', pts: [[0, 0]], r: 45 } } },
      { id: 'do-choi', name: 'Bóng đồ chơi', icon: '⚽', group: 'Vật cản nhỏ', desc: 'Robot chạm là bóng lăn đi — vật cản di động.',
        build: () => G(mesh(new THREE.SphereGeometry(60, 20, 14), M.ball, { y: 60 })), meta: { movable: { circle: 60, h: 120, mass: 0.1, mu: 0.05, roll: 0.5 } } },
      { id: 'dep', name: 'Dép lê', icon: '🩴', group: 'Vật cản nhỏ', desc: '0.15 kg: lực đẩy ~0.7 N < 2.5 N của bumper → robot ủi dép đi mà không biết.',
        build: () => G(mesh(box(240, 30, 95, 12), M.slipper, { y: 15 })), meta: { movable: { circle: 70, h: 40, mass: 0.15, mu: 0.5 } } },
      { id: 'chau-cay', name: 'Chậu cây Ø340', icon: '🪴', group: 'Vật cản nhỏ', desc: '',
        build: () => G(lc(0, 0, 170, 140, 0, 420, M.pot, 28), mesh(new THREE.IcosahedronGeometry(300, 1), M.leaf, { y: 800 })), meta: { solids: [{ circle: [0, 0, 170], z: [0, 1100] }] } },
      { id: 'thung-rac', name: 'Thùng rác', icon: '🗑', group: 'Vật cản nhỏ', desc: 'Đủ nặng để ấn bumper; tắt bumper thì robot ủi nó đi.',
        build: () => G(lc(0, 0, 140, 125, 0, 380, M.bin, 28), lc(0, 0, 145, 145, 380, 400, MAT.plasticDark, 28)),
        meta: { movable: { circle: 140, h: 400, mass: 1.2, mu: 0.5 } } },
      // ----- Đặc biệt -----
      { id: 'dock', name: 'Đế sạc', icon: '🔋', group: 'Đặc biệt', maxCount: 1, desc: 'Robot xuất phát trước đế sạc (mặt có cửa sổ IR). Xoay đế để đổi hướng xuất phát.',
        build: () => G(lb(-80, -140, 80, 140, 0, 110, M.black, 10), lb(80, -120, 220, 120, 0, 6, M.black),
          lb(78, -70, 84, 70, 50, 90, new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0x440000, emissiveIntensity: 1 })),
          lb(140, -70, 180, -50, 6, 9, MAT.brass), lb(140, 50, 180, 70, 6, 9, MAT.brass)),
        meta: { solids: [{ box: [-80, -140, 80, 140], z: [0, 110] }], dock: { front: 355 } } },
      { id: 'nep-cua', name: 'Nẹp cửa 12 mm', icon: '▬', group: 'Đặc biệt', desc: 'Bánh Ø70 leo được bậc ≤ 20 mm nhưng chậm lại và trượt mạnh → odometry sai thêm.',
        build: () => G(lb(-450, -50, 450, 50, 0, 12, M.threshold)),
        meta: { zone: { rect: [-450, -50, 450, 50], h: 12, name: 'Nẹp cửa', rho: 0.5, speed: 0.6, slip: 0.12, kind: 'threshold' } } },
      { id: 'tham-den', name: 'Thảm đen (cliff giả)', icon: '⬛', group: 'Đặc biệt', desc: 'Hấp thụ hồng ngoại (ρ ≈ 0.05) → cảm biến cliff tưởng là hố, robot không dám lên.',
        build: () => { const m = lb(-600, -400, 600, 400, 0, 12, M.rugBlack); m.castShadow = false; return G(m); },
        meta: { zone: { rect: [-600, -400, 600, 400], h: 12, name: 'Thảm đen', rho: 0.05, speed: 0.85, slip: 0.06, encSlip: 0.05, kind: 'rug' } } },
      { id: 'ho-cau-thang', name: 'Hố cầu thang (cliff thật)', icon: '🕳', group: 'Đặc biệt', desc: 'Lỗ cầu thang xuống tầng dưới sâu 1.5 m, không lan can. Sàn tự khoét lỗ.',
        build: () => {
          const parts = [lb(-500, -550, 500, -540, -1500, 0, M.pit), lb(-500, 540, 500, 550, -1500, 0, M.pit), lb(-500, -550, -490, 550, -1500, 0, M.pit), lb(490, -550, 500, 550, -1500, 0, M.pit),
            lb(-490, -540, 490, 540, -1520, -1500, M.pit)];
          for (let i = 0; i < 7; i++) parts.push(lb(-490, 540 - (i + 1) * 150, 490, 540 - i * 150, -1500, -(i + 1) * 200, M.step));
          for (const [a, b, c, d] of [[-500, -550, 500, -500], [-500, 500, 500, 550], [-500, -550, -450, 550], [450, -550, 500, 550]]) { const s = lb(a, b, c, d, 0, 2, M.warn); s.castShadow = false; parts.push(s); }
          return G(...parts);
        },
        meta: { zone: { rect: [-500, -550, 500, 550], h: -1500, name: 'Hố cầu thang', rho: 0.5, kind: 'pit' } } },
    ];

    const INITIAL = [
      ['sofa', 1200, 1525, 0], ['ban-tra', 1250, 2450, 0], ['tham', 1275, 2450, 0], ['ke-tv', 1300, 3040, 0], ['den-cay', 3150, 1350, 0],
      ['ban-an', 6000, 2650, 0], ['ghe', 5650, 1900, 0], ['ghe', 6350, 1900, 0], ['ghe', 5650, 3400, Math.PI], ['ghe', 6350, 3400, Math.PI],
      ['tu-thap', 4350, 4000, 0], ['chau-cay', 7650, 1400, 0], ['dock', 7920, 2540, Math.PI],
      ['tu-bep', 4400, 5700, 0], ['tu-bep', 6250, 5700, 0], ['tu-lanh', 7625, 5625, 0], ['thung-rac', 3800, 4650, 0],
      ['giuong-thap', 1000, 4700, 0], ['tu-dau-giuong', 225, 5775, 0], ['tu-quan-ao', 3100, 5200, 0],
      ['nep-cua', 2750, 3250, 0], ['nep-cua', 5900, 4250, 0], ['dep', 4300, 1500, 0], ['dep', 4470, 1430, 0.4], ['do-choi', 2900, 2150, 0],
    ].map(([type, x, y, rotY]) => ({ type, ...W(x, y), rotY }));

    // ---------- độ phủ ----------
    const cov = new CoverageGrid({ x0: 0, y0: 1100, x1: HOUSE_W, y1: HOUSE_D, cell: 25, rClean: RG.R_CLEAN });
    cov.z0 = 0;
    const overlay = buildCoverageOverlay(THREE, cov, 13);
    root.add(overlay.mesh);

    // ---------- robot ----------
    const sim = new RobotSim(world, { coverage: cov });
    const R = buildRobot({ THREE, MAT, geom, tint });
    root.add(R.root);
    const robotLabel = label(R.root, 'AUTO', [0, 160, 0]);
    const ghost = buildGhost(THREE);
    root.add(ghost);
    const rays = buildLidarRays(THREE, LIDAR_RAYS);
    rays.group.visible = false;
    root.add(rays.group);

    // ---------- dựng lại thế giới mỗi khi bố cục thay đổi ----------
    let movables = new Map(), dockPose = null, pitsKey = '';
    const blocks = (o) => o.zBot < RG.H && o.zTop > RG.BODY_BOT;
    const computeReach = () => cov.computeReach(world, { startX: sim.start.x, startY: sim.start.y, z0: 0, blocks });
    const override = (it, m) => (it.type === 'giuong-thap' ? bedMeta(bedClear) : m);
    function rebuildAll(items, reach = true) {
      const r = rebuildWorld(world, { obstacles: fixedObs, floors: fixedFloors }, items, movables, { OX, OY, override });
      movables = r.movables;
      dockPose = r.dock;
      const key = JSON.stringify(r.pits.map((p) => p.map(Math.round)));
      if (key !== pitsKey) {     // khoét lỗ sàn cho hố cầu thang
        pitsKey = key;
        for (const k of Object.keys(slabMeshes)) { slabMeshes[k].geometry.dispose(); slabMeshes[k].geometry = floorGeo(k, r.pits); }
      }
      if (reach) computeReach();
    }
    const makeSandbox = ctx.sandbox || ((o) => createSandbox(null, o));
    const sb = makeSandbox({
      title: 'Đồ đạc căn hộ', root: sbRoot, catalog,
      surfaces: [slabMeshes.living, slabMeshes.bed, slabMeshes.kitchen, balc, stepM],
      floorY: 0, grid: 50, bounds: { minX: -OX, maxX: OX, minZ: -OY, maxZ: OY },
      storageKey: 'robovac.can-nha.v1', initial: INITIAL,
      onChange: (items) => rebuildAll(items),
    });
    const startFor = (a) => (a === 'SPIRAL' ? { x: 4250, y: 2450, th: 0 } : dockPose || DOCK);

    // ---------- trạng thái điều khiển ----------
    let running = true, acc = 0, algo = 'AUTO', camMode = 'free', slowDemo = false, cliffForcedOff = false;
    let readT = 1, lastLogLen = -1, lidarPhase = 0, smoked = false, faultId = null, faultCable = null, placeArmed = false;
    let selKey = '';
    const rig = new CameraRig(THREE, viewer, root);
    const kb = createKeyboard(() => algo === 'MANUAL');

    function resetAll(pose = startFor(algo)) {
      restoreMovables(sb.items);
      for (const mv of movables.values()) mv.item.object.userData.simPos = null;
      sim.reset(pose);
      rebuildAll(sb.items);
      cov.clear();
      computeReach();
      overlay.update(0, true);
      sim.setMode(algo);
      acc = 0;
    }
    function placeRobot(x, y, th) {
      sim.reset({ x, y, th }, { keepBattery: true });
      computeReach();
      sim.setMode(algo);
      running = true;
    }
    resetAll();

    const disposePick = floorPicker(THREE, viewer, root, (x, y) => {
      if (!placeArmed) return;
      placeArmed = false;
      if (sim.canPlace(x, y)) { placeRobot(x, y, sim.th); sim.addLog(`Đặt robot tại (${(x / 1000).toFixed(2)}, ${(y / 1000).toFixed(2)}) m`); }
      else sim.addLog('Không đặt được: chạm đồ vật hoặc sát mép hố — bấm "📍 Đặt robot" và thử chỗ khác');
    });

    const v3 = new THREE.Vector3();
    const toWorld = (x, z, y) => { root.localToWorld(v3.set(x, z, -y)); return [v3.x, v3.y, v3.z]; };

    function syncScene(dtSim, p) {
      poseRobot(THREE, R.root, sim);
      R.animate(dtSim, { vL: sim.vL, vR: sim.vR, brush: sim.pic.brushSide && sim.status === 'ok', lidar: sim.status !== 'broken' });
      R.setBump(sim.bumpRaw);
      R.setCliff(sim.pic.cliffMask);
      R.setLed(ledColor(sim));
      ghost.visible = !!p.ghost && sim.status === 'ok';
      if (ghost.visible) { const g = sim.ghostPose(); ghost.position.set(g.x, sim.z0 + 4, -g.y); ghost.rotation.y = g.th; }
      syncMovables(movables, world, OX, OY);
    }

    function handleImpacts() {
      for (const im of sim.impacts) {
        const pos = toWorld(im.x, im.z + 40, im.y);
        if (im.kind === 'robot') {
          if (im.speed > 700) {
            fx.sparks(pos, { count: 60, speed: 900, size: 14 });
            fx.flash(pos, { size: 300, color: 0xffe0a0 });
          }
          if (sim.status === 'falling' || im.speed > 1200) fx.smoke(pos, { size: 160, duration: 4 });
        } else if (im.o?.broken) fx.sparks(pos, { count: 25, speed: 500, size: 8, color: 0xffffff });
      }
      sim.impacts.length = 0;
    }

    return {
      object: root,
      sim, sandbox: sb,          // để gỡ lỗi trên console / kiểm thử

      onAction(id, p) {
        if (id === 'start') {
          running = true;
          if (sim.status === 'ok' && sim.brain.mode === 'IDLE') sim.setMode(p.algo);
        } else if (id === 'pause') running = false;
        else if (id === 'reset') { algo = p.algo; resetAll(startFor(algo)); running = true; }
        else if (id === 'place') { placeArmed = true; sim.addLog('📍 Bấm chuột lên sàn trống để đặt robot'); }
        else if (id === 'rescue') {
          if (sim.tangled) {
            const it = sim.tangled.h.item;
            sim.untangle();
            if (it) sb.remove(it.uid);
          } else { const d = dockPose || DOCK; placeRobot(d.x, d.y, d.th); sim.addLog('Đã nhấc robot về đế sạc (giữ bản đồ độ phủ)'); }
        }
      },

      update(dt, t, p) {
        // đồ đang được chọn/kéo → dựng lại vật cản ngay (không đợi thả chuột)
        const sel = sb.selected;
        if (sel) {
          const o = sel.object;
          const key = `${sel.uid}:${o.position.x.toFixed(1)},${o.position.y.toFixed(1)},${o.position.z.toFixed(1)},${o.rotation.y.toFixed(3)}`;
          if (key !== selKey) { if (selKey.startsWith(sel.uid + ':')) rebuildAll(sb.items, false); selKey = key; }
        } else selKey = '';
        // --- thay đổi tham số ---
        if (p.algo !== algo) { algo = p.algo; if (sim.status === 'ok') sim.setMode(algo); running = true; if (algo === 'MANUAL') releaseFocus(); }
        if (p.bed !== bedClear) {
          bedClear = p.bed;
          for (const it of sb.items) if (it.type === 'giuong-thap') it.object.userData.setClear?.(bedClear);
          rebuildAll(sb.items);
        }
        if (p.cam !== camMode) { camMode = p.cam; rig.set(camMode, R.root, [HOUSE_W / 2, HOUSE_D / 2], [HOUSE_W + 400, HOUSE_D + 400]); }
        sim.opt.cliffOn = !!p.cliff && !cliffForcedOff;
        sim.opt.bumperOn = !!p.bumper;
        sim.opt.slip = !!p.slip;
        sim.opt.useImu = !!p.imu;

        // --- chạy mô phỏng với bước cố định 10 ms ---
        let speed = Number(p.speed) || 1;
        if (slowDemo) speed = Math.min(speed, 2);
        let simDt = 0;
        if (running) {
          acc += dt * speed;
          let n = 0;
          while (acc >= sim.DT && n < 500) {
            if (algo === 'MANUAL') { const [l, r] = kb.drive(); sim.manual(l, r); }
            sim.step();
            acc -= sim.DT; n++; simDt += sim.DT;
          }
          if (n >= 500) acc = 0;
        }
        handleImpacts();
        syncScene(Math.min(simDt, dt * 4), p);
        overlay.mesh.visible = !!p.heat;
        overlay.update(dt);
        rays.group.visible = !!p.lidar && sim.status === 'ok';
        if (rays.group.visible) { lidarPhase += dt * 2 * Math.PI * 0.7; rays.update(sim, 6000, lidarPhase); }
        rig.update(dt, R.root);
        if (sim.status === 'broken' && !smoked) { smoked = true; fx.smoke(R.root, { size: 120, duration: 8 }); }
        if (sim.status === 'ok') smoked = false;

        // --- số đo (10 lần/s) ---
        readT += dt;
        if (readT > 0.1) {
          readT = 0;
          const st = sim.status === 'ok' ? `${sim.brain.mode} · ${sim.brain.state}${sim.tangled ? ' · KẸT DÂY' : ''}` : STATUS_VI[sim.status];
          readout('time', fmtTime(sim.t) + (running ? '' : ' ⏸') + (placeArmed ? ' 📍' : ''));
          readout('state', st);
          readout('cov', cov.percent());
          readout('passes', cov.meanPasses());
          readout('bat', sim.batteryPct());
          readout('vbat', sim.vbat);
          readout('amp', sim.current);
          readout('dist', sim.distTrue / 1000);
          readout('odo', sim.odoError());
          readout('sens', `${bits(sim.pic.bumpMask, 2)} · ${bits(sim.pic.cliffMask, 4)} · ${bits(sim.pic.dropMask, 2)}${sim.pic.blockFwd ? ' ⛔tiến' : ''}${sim.pic.vbatLow ? ' 🔋yếu' : ''}`);
          if (sim.log.length !== lastLogLen || lastLogLen < 0) {
            lastLogLen = sim.log.length;
            const last = sim.log.slice(-2).reverse().map((e) => `${fmtTime(e.t)} ${e.msg}`).join(' · ');
            readout('ev', last || '—');
          }
          if (robotLabel?.element) {
            const ev = sim.log.length ? sim.log[sim.log.length - 1] : null;
            const fresh = ev && sim.t - ev.t < 1.5 && ev.kind === 'fw' ? ` ⚡${ev.msg.slice(2)}` : '';
            robotLabel.element.textContent = sim.status === 'ok' ? `${sim.brain.mode}·${sim.brain.state}${fresh}` : STATUS_VI[sim.status];
          }
        }
        return [sim.vL, sim.vR, sim.batteryPct(), cov.percent()];
      },

      triggerFault(id) {
        if (sim.status !== 'ok') resetAll();
        faultId = id;
        if (id === 'cliff-tat') {
          cliffForcedOff = true; slowDemo = true;
          placeRobot(3600, 2000, -Math.PI / 2);
          sim.brain.debugAutoForward(sim.odo, sim.nowMs);
          sim.addLog('Sự cố: CLIFF_ENABLE_MASK = 0x00 — robot không còn "mắt nhìn xuống"');
        } else if (id === 'bumper-ket') {
          sim.fault.bumperStuck = 0x01;
          sim.addLog('Sự cố: công tắc bumper TRÁI kẹt ở trạng thái ấn');
        } else if (id === 'encoder-hong') {
          sim.fault.encDeadL = true;
          sim.setMode(algo === 'MANUAL' ? 'ZIGZAG' : algo);
          sim.addLog('Sự cố: encoder trái không còn xung');
        } else if (id === 'pin-yeu') {
          sim.soc = 0.095;
          sim.addLog('Sự cố: pin chỉ còn ~10%');
        } else if (id === 'day-quan') {
          // thả một sợi dây điện (đồ vật sandbox) vắt ngang trước mặt robot 300 mm
          const c = Math.cos(sim.th), s = Math.sin(sim.th);
          const it = sb.add('day-dien', { ...W(sim.x + c * 330, sim.y + s * 330), rotY: sim.th + Math.PI / 2 });
          faultCable = it?.uid ?? null;
          if (sim.brain.mode === 'IDLE' || sim.brain.mode === 'MANUAL') sim.setMode('AUTO');
          if (!['FWD', 'LANE'].includes(sim.brain.state)) sim.brain.debugAutoForward(sim.odo, sim.nowMs);
          sim.addLog('Sự cố: có dây điện vắt ngang đường đi');
        } else if (id === 'mat-ket-noi') {
          sim.fault.comm = true;
          sim.addLog('Sự cố: dây UART ESP32 ↔ PIC bị tuột');
        }
        running = true;
      },

      resetFault() {
        sim.fault.encDeadL = false; sim.fault.bumperStuck = 0; sim.fault.comm = false;
        cliffForcedOff = false; slowDemo = false;
        if (sim.tangled) sim.untangle();
        if (faultCable != null) { sb.remove(faultCable); faultCable = null; }
        if (faultId === 'pin-yeu') sim.soc = 1;           // thay pin mới
        faultId = null;
        if (sim.status !== 'ok') resetAll();
        else if (sim.brain.mode === 'IDLE') sim.setMode(algo);
      },

      dispose() {
        kb.dispose();
        disposePick();
      },
    };
  },
};
