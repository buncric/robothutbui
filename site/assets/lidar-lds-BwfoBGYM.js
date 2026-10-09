const n=`// 📡 Lidar LDS (kiểu Xiaomi LDS02RR / Neato XV-11) — đo khoảng cách bằng TAM GIÁC LƯỢNG, đầu quay 360°
// Nguyên lý: laser song song trục thấu kính, cách nhau đường cơ sở b. Điểm sáng trên vật ở khoảng cách d
//   tạo ảnh trên cảm biến CMOS dòng lệch x = f·b/d  →  d = f·b/x.  Sai số δd = d²·δx/(f·b) (tăng theo d²).
// Đầu quay ~300 vòng/phút (5 Hz), lấy mẫu ~1800 lần/s → 360 điểm/vòng; gói tin 22 byte × 90 gói/vòng @115200 baud.
// Mô hình CAD thật: robot/lidar-turret.glb (LDS02RR: đế 92×76, đầu quay Ø70 trên ổ bi, motor + dây đai, JST PH-4 + PH-2).
// Mô hình tự dựng giữ lại làm "chế độ học"; ruột đầu quay (laser, thấu kính, CMOS, tia tam giác lượng) vẫn hiện khi mở nắp.
import { cadAttach, ownMaterial } from '../../core/cadParts.js';

const SLOW_DEF = 10;
const F_MM = 4, B_MM = 20, DX_MM = 0.0004;      // tiêu cự, đường cơ sở, sai số định vị điểm ảnh (~1/16 pixel)
const R_MIN = 150, R_MAX = 6000;               // mm
const SAMPLE_HZ = 1800;
const ROOM = { x0: -1200, x1: 1200, z0: -900, z1: 900, h: 250 };
const BEAM_Y = 113;                            // độ cao tia quét (robot cao 88 mm + đầu lidar)
const MAP_REVS = 12;
const ROBOT_R = 175;
// đường đi của robot (elip) khi bật "Robot di chuyển"
const PATH = { cx: -150, cz: 250, ax: 500, az: 300 };
// SLAM rút gọn: lưới chiếm chỗ 40 mm, log-odds; so khớp quét với "trường khả năng" (likelihood field) của bản đồ
const CELL = 40, MARGIN = 2 * CELL;              // lưới rộng hơn phòng 2 ô mỗi phía để tường không nằm sát mép lưới
const GX0 = ROOM.x0 - MARGIN, GZ0 = ROOM.z0 - MARGIN;
const GW = Math.round((ROOM.x1 - ROOM.x0 + 2 * MARGIN) / CELL), GH = Math.round((ROOM.z1 - ROOM.z0 + 2 * MARGIN) / CELL);
const ODO_SCALE = 1.04, ODO_TURN = 0.98, ODO_BIAS = 0.05;   // odometry encoder: +4 % quãng đường, −2 % góc (bánh trượt khi quay), trôi 0.05 rad/m (phóng đại cho dễ thấy)
// kệ sách (vật thể lớn, phản xạ tốt — phá thế đối xứng của căn phòng) và chỗ mới khi "kê lại đồ đạc"
const SHELF_HOME = [-1200, -1030, 200, 800], SHELF_MOVED = [-600, 0, 730, 900];

export default {
  id: 'lidar-lds',
  name: 'Lidar LDS (cảm biến laser quét 360°)',
  category: 'cam-bien',
  order: 5,
  icon: '📡',
  summary: 'Đầu quay mang laser + thấu kính + cảm biến ảnh, đo khoảng cách bằng tam giác lượng 360 lần mỗi vòng, 5 vòng/giây. Xem tia quét vẽ ra "bản đồ điểm" của căn phòng — nền tảng của SLAM ở giai đoạn sau (ODROID-M2 + ROS 2).',
  tags: ['lidar', 'LDS02RR', 'XV-11', 'laser', 'tam giác lượng', 'SLAM', 'ROS 2', 'bản đồ', 'point cloud', 'UART 115200'],

  params: [
    { id: 'cad', label: '🧊 Mô hình CAD thật (LDS02RR)', type: 'toggle', value: true, hint: 'Tắt = mô hình học tự dựng (đơn giản hoá)' },
    { id: 'view', label: 'Góc nhìn', type: 'select', value: 'room', options: [['room', 'Cả căn phòng (robot + bản đồ điểm)'], ['close', 'Cận cảnh đầu lidar (tam giác lượng)']] },
    { id: 'mode', label: 'Chế độ làm việc', type: 'select', value: 'scan', options: [
      ['scan', 'Quét thô (xem từng vòng quét)'], ['mapping', 'Dựng bản đồ lần đầu (mapping)'], ['loc', 'Định vị trên bản đồ đã lưu (localization)'],
    ], hint: 'Mapping: robot đi khắp phòng, ghép các vòng quét thành bản đồ lưới rồi LƯU. Localization: mỗi vòng quét so khớp với bản đồ đã lưu để sửa vị trí — lidar phải quay suốt lúc làm việc.' },
    { id: 'lidarOff', label: 'Tắt lidar (GPIO15 PWM = 0 — như khi robot ở dock)', type: 'toggle', value: false },
    { id: 'slow', label: 'Làm chậm hình', type: 'range', min: 1, max: 40, step: 1, value: SLOW_DEF, unit: '×', hint: 'Thật: 5 vòng/s. Làm chậm để mắt theo kịp tia quét.' },
    { id: 'open', label: 'Mở nắp đầu quay (xem bên trong)', type: 'toggle', value: true },
    { id: 'move', label: 'Robot di chuyển trong phòng', type: 'toggle', value: false },
    { id: 'map', label: 'Giữ điểm các vòng trước (chế độ Quét thô)', type: 'toggle', value: false },
    { id: 'noise', label: 'Có sai số đo (tăng theo d²)', type: 'toggle', value: true },
    { id: 'pid', label: 'ESP32 tự giữ 300 vòng/phút (PI theo tốc độ trong gói tin)', type: 'toggle', value: true },
    { id: 'pwm', label: 'PWM motor lidar (khi tắt PI) — GPIO15', type: 'range', min: 0, max: 100, step: 1, value: 60, unit: '%' },
    { id: 'clear', label: '🧹 Xóa bản đồ điểm', type: 'button' },
    { id: 'furn', label: '🛋 Kê lại đồ đạc (dời thùng rác)', type: 'button' },
    { id: 'kidnap', label: '🫳 Nhấc robot đặt chỗ khác (kidnapped)', type: 'button' },
  ],
  readouts: [
    { id: 'rpm', label: 'Tốc độ đầu quay', unit: 'vòng/phút' },
    { id: 'hz', label: 'Tần số quét', unit: 'Hz' },
    { id: 'ang', label: 'Góc mẫu hiện tại', unit: '°' },
    { id: 'dist', label: 'Khoảng cách đo được', unit: 'mm' },
    { id: 'cmos', label: 'Vệt sáng lệch trên CMOS x = f·b/d', unit: 'µm' },
    { id: 'valid', label: 'Điểm hợp lệ vòng trước', unit: '/360' },
    { id: 'uart', label: 'Dữ liệu UART (22 B × 90 gói/vòng)', unit: '' },
    { id: 'state', label: 'Tình trạng', unit: '' },
    { id: 'slam', label: 'SLAM', unit: '' },
    { id: 'errOdo', label: 'Sai số CHỈ odometry (bóng đỏ)', unit: '' },
    { id: 'errLid', label: 'Sai số odometry + lidar (bóng xanh)', unit: '' },
    { id: 'match', label: 'Điểm quét khớp bản đồ', unit: '%' },
  ],
  scope: {
    window: 6,
    note: '(theo thời gian hình — đã làm chậm theo thanh "Làm chậm")',
    channels: [
      { name: 'Khoảng cách', unit: 'm', min: 0, max: 3.5, color: '#4cc2ff' },
      { name: 'Tốc độ đầu quay', unit: 'rpm', min: 0, max: 450, color: '#ffd34d' },
      { name: 'PWM motor', unit: '%', min: 0, max: 100, color: '#ff6b9a' },
    ],
  },

  steps: [
    { title: 'Bước 1 — Tháo lidar khỏi robot', text: 'Rút pin robot trước. Mở vỏ trên (xem robot hoàn chỉnh), tháo 3–4 vít PH1 giữ đế lidar, <b>chụp ảnh</b> rồi rút giắc 4 chân (dữ liệu) và giắc 2 chân (motor). Cầm đế, <b>không</b> cầm đầu quay.' },
    { title: 'Bước 2 — Mở nắp đầu quay', text: 'Nắp trên thường cài lẫy hoặc 2 vít nhỏ. Nạy nhẹ bằng que nhựa. Bên trong: module laser (ống đồng), thấu kính thu và bo CMOS. <b>Không chạm vào mặt thấu kính</b>, không xoay ốc chỉnh tiêu cự laser — lệch là đo sai toàn bộ.' },
    { title: 'Bước 3 — Tháo dây đai', text: 'Dây đai cao su nối puly motor với rãnh đầu quay. Kiểm tra: dây giãn/ nứt/ dính dầu → trượt → tốc độ dao động → bản đồ méo. Thay dây đai cùng chu vi (đo bằng sợi chỉ) — vài nghìn đồng.' },
    { title: 'Bước 4 — Nhấc đầu quay khỏi ổ bi', text: 'Nhấc thẳng lên (một số đời có phe cài trục). Bên dưới: cuộn dây truyền điện không tiếp xúc (hoặc vòng trượt), LED/ cảm biến truyền dữ liệu hồng ngoại ở tâm. Lau bụi ổ bi, <b>không tra dầu</b> lên dây đai.' },
    { title: 'Bước 5 — Lắp lại & thử', text: 'Làm ngược lại: đặt đầu quay → lắp dây đai (không xoắn) → đóng nắp. Cấp 5 V, PWM motor ~60 %: đầu quay phải êm, đều. Đọc gói tin trên ESP32 (GPIO16, 115200) — tốc độ ≈ 300 vòng/phút, ít điểm lỗi.' },
  ],

  faults: [
    { id: 'truot-dai', label: 'Dây đai giãn, trượt', severity: 'loi',
      what: '<p>Tiếng rít nhẹ; tốc độ đầu quay dao động mạnh ±30 % trong mỗi vòng; tường thẳng trên bản đồ bị <b>uốn cong, lệch góc</b>, góc phòng "xoắn". SLAM ghép bản đồ sai, robot tưởng mình ở chỗ khác.</p>',
      why: '<p>Nếu đầu lidar chỉ có 1 mốc góc mỗi vòng và <b>nội suy góc theo thời gian</b> (giả định quay đều), thì khi đai trượt — đầu quay lúc nhanh lúc chậm — góc gán cho mỗi điểm lệch khỏi góc thật. Sai lệch góc Δθ tại khoảng cách d làm điểm lệch ngang d·Δθ: 10° ở 2 m = 35 cm.</p>',
      fix: '<p>Thay dây đai mới, giữ khô sạch. Firmware: kiểm tra trường tốc độ trong gói tin, loại bỏ vòng có tốc độ lệch &gt; 5–10 %. Dùng lidar có encoder góc thật (đĩa mã hóa) nếu cần chính xác cao.</p>' },
    { id: 'tx-5v', label: 'Lidar xuất TX 5 V cắm thẳng vào RX ESP32', severity: 'hong',
      what: '<p>Chạy được một lúc rồi ESP32 không nhận dữ liệu nữa, hoặc chân GPIO16 chết hẳn (đo thấy rò xuống GND). Có khi cả ESP32 chập chờn, nóng nhẹ.</p>',
      why: '<p>ESP32-S3 chịu tối đa <b>3.6 V</b> trên chân I/O (VDD + 0.3 V). 5 V vào chân RX làm diode bảo vệ bên trong dẫn liên tục, dòng chảy vào nguồn 3.3 V → quá nhiệt cục bộ, hỏng chân. LDS02RR xuất mức 3.3 V (an toàn) nhưng nhiều lidar/ module khác xuất 5 V.</p>',
      fix: '<p><b>Đo điện áp chân TX</b> của lidar bằng đồng hồ trước khi nối. Nếu 5 V: chia áp 1 kΩ/2 kΩ (5 × 2/3 = 3.33 V) hoặc mạch chuyển mức BSS138 như đường UART PIC⇄ESP32. <a href="#/c/bss138-level-shifter">Xem BSS138 →</a></p>' },
    { id: 'nguon-yeu', label: 'Lấy nguồn lidar từ chân 5 V của ESP32 (cổng USB)', severity: 'loi',
      what: '<p>Mỗi lần motor lidar khởi động, ESP32 <b>tự reset</b> (log: <code>Brownout detector was triggered</code>), BLE rớt, motor dừng rồi lại chạy… lặp mãi. Không bao giờ có đủ một vòng dữ liệu.</p>',
      why: '<p>Lidar cần ~0.4 A khi chạy và tới ~1 A lúc motor khởi động. Cổng USB máy tính chỉ cấp 0.5 A, qua dây mảnh và diode → áp 5 V tụt xuống 4 V; LDO 3.3 V của ESP32 mất ổn áp → mạch phát hiện sụt áp (brownout) reset chip.</p>',
      fix: '<p>Cấp 5 V cho lidar từ buck XL4015 (3 A) như docs/01, không qua ESP32. Thêm tụ 470–1000 µF gần đầu nối lidar, tăng PWM motor từ từ (soft-start). Chung GND. <a href="#/c/buck-xl4015">Xem XL4015 →</a></p>' },
    { id: 'nhin-laser', label: 'Đầu quay đứng yên nhưng laser vẫn bật — nhìn thẳng vào', severity: 'hong',
      what: '<p>Không thấy gì cả (laser 785 nm gần như vô hình, chỉ thấy chấm đỏ mờ) — chính vì thế mới nguy hiểm: mắt không chớp phản xạ, võng mạc vẫn nhận năng lượng hội tụ.</p>',
      why: '<p>Lidar đạt chuẩn <b>Class 1</b> nhờ chùm tia <i>quét liên tục</i> và công suất trung bình nhỏ. Khi đầu quay bị kẹt/ đứt đai mà laser còn sáng, toàn bộ năng lượng dồn vào một điểm. Tháo thấu kính, chỉnh dòng laser hay soi bằng kính lúp/ ống nhòm làm mất điều kiện an toàn đó.</p>',
      fix: '<p>Không nhìn vào cửa sổ lidar khi đang cấp điện, nhất là khi đầu không quay. Firmware: nếu tốc độ trong gói tin = 0 quá 1 s → cắt nguồn/ PWM lidar. Không tháo, không sửa module laser.</p>' },
  ],

  info: {
    overview: \`
      <p><b>Lidar</b> (Light Detection And Ranging) đo khoảng cách bằng ánh sáng. Loại rẻ trong robot hút bụi (Xiaomi <b>LDS02RR</b>, Neato XV-11) dùng nguyên lý <b>tam giác lượng</b>: một tia laser chiếu ra, thấu kính bên cạnh thu điểm sáng phản xạ lên một <b>cảm biến ảnh dạng dòng</b> (CMOS). Vật càng gần, vệt sáng càng lệch xa tâm. Cả cụm nằm trên <b>đầu quay</b> do motor kéo bằng dây đai, 5 vòng/giây → mỗi giây 5 "lát cắt" 360° của căn phòng.</p>
      <p>Thử: bật <b>Robot di chuyển</b> + <b>Ghép bản đồ</b> và nhìn bản đồ điểm hiện dần. Để ý: <b>vách kính</b> không có điểm nào (laser xuyên qua), <b>đôi dép</b> thấp hơn tia quét nên vô hình, <b>sofa đen</b> ở xa bị thiếu điểm. Chuyển sang <b>Cận cảnh</b> để xem đường đi của tia laser và vệt sáng trên CMOS.</p>
      <p><b>Lidar quét 1 lần rồi thôi?</b> Không. Lần đầu robot <b>dựng bản đồ</b> (mapping) rồi lưu lại. Những lần dọn sau nó vẫn quay lidar <b>suốt lúc làm việc</b> để <b>định vị</b> (localization): mỗi vòng quét được so khớp với bản đồ đã lưu để sửa sai số của bánh xe. Chỉ khi về dock/ chờ, robot mới tắt motor lidar.</p>
      <p>Thử: chọn <b>Chế độ → Dựng bản đồ</b>, chờ robot đi hết 1 vòng (bản đồ được lưu), rồi chọn <b>Định vị</b>: bóng <span style="color:#ff6b6b">đỏ</span> (chỉ dùng encoder) trôi dần, bóng <span style="color:#3fcf8e">xanh</span> (encoder + lidar) bám sát robot thật. Bật <b>Tắt lidar</b> → bóng xanh cũng trôi theo. Bấm <b>Kê lại đồ đạc</b> và <b>Nhấc robot đặt chỗ khác</b> xem robot xử lý.</p>\`,
    specs: [
      ['Kiểu', 'LDS02RR (Xiaomi/Roborock đời đầu), tương tự Neato XV-11 — tam giác lượng'],
      ['Tầm đo', '0.15–6 m (vật tối màu ngắn hơn); độ phân giải góc 1°'],
      ['Tốc độ quét', '~300 vòng/phút = 5 Hz (host tự điều khiển motor)'],
      ['Tốc độ lấy mẫu', '~1800 mẫu/s → 360 điểm/vòng'],
      ['Laser', 'Hồng ngoại gần ~785 nm (như XV-11), Class 1 — an toàn mắt khi quét bình thường'],
      ['Nguồn', '5 V cho mạch đo (~0.1–0.2 A) + motor DC riêng (~0.2–0.3 A, đỉnh tới ~1 A khi khởi động)'],
      ['Giao tiếp', 'UART <b>115200</b> 8N1, mức 3.3 V, chỉ phát (TX)'],
      ['Gói tin', '22 byte: <code>0xFA</code>, chỉ số (0xA0–0xF9 → 90 gói), tốc độ (2 B, rpm×64), 4 × [khoảng cách 14 bit + cờ, cường độ 2 B], checksum 2 B'],
      ['Băng thông', '90 × 22 B × 5 vòng/s = 9 900 B/s ≈ 99 kbit/s (8N1 = 10 bit/byte) — chiếm ~86 % của 115200'],
      ['Đường cơ sở / tiêu cự (mô hình)', 'b ≈ 20 mm, f ≈ 4 mm'],
    ],
    principle: \`
      <h4>1. Tam giác lượng (triangulation)</h4>
      <p>Laser chiếu song song với trục thấu kính, cách nhau <b>đường cơ sở b</b>. Tia phản xạ từ vật ở khoảng cách d đi qua tâm thấu kính, rơi lên cảm biến (đặt cách thấu kính tiêu cự f) tại vị trí lệch <code>x = f·b/d</code> — hai tam giác đồng dạng. Suy ra <code>d = f·b/x</code>.</p>
      <p>Ví dụ f = 4 mm, b = 20 mm: d = 1 m → x = 80 µm; d = 4 m → x = 20 µm (vài điểm ảnh). Vì vậy lidar tam giác lượng <b>kém chính xác ở xa</b>: lấy đạo hàm, <code>δd = d²·δx/(f·b)</code> — sai số tăng theo bình phương khoảng cách.</p>
      <h4>2. Quét 360°</h4>
      <p>Đầu quay chở cả laser và cảm biến. Mỗi mẫu gắn với góc hiện tại θ: điểm trên bản đồ <code>(x, y) = (x<sub>robot</sub> + d·cos(φ+θ), y<sub>robot</sub> + d·sin(φ+θ))</code> với φ là hướng robot.</p>
      <h4>3. Vì sao host phải điều khiển motor?</h4>
      <p>LDS02RR không tự giữ tốc độ: host (ESP32) đọc tốc độ trong gói tin và chỉnh PWM motor (PI). Quay nhanh hơn 300 vòng/phút: số mẫu mỗi vòng = 1800·60/rpm &lt; 360 → <b>thiếu điểm</b>. Chậm hơn: quét thưa theo thời gian (robot đi xa giữa 2 vòng).</p>
      <h4>4. Những thứ lidar "không thấy"</h4>
      <ul><li><b>Kính, gương</b>: laser xuyên qua hoặc phản xạ đi chỗ khác.</li><li>Vật <b>thấp hơn mặt phẳng quét</b> (dép, dây điện) hoặc cao hơn (gầm bàn, gầm sofa).</li><li>Bề mặt <b>đen hấp thụ</b> ở xa: tín hiệu về quá yếu.</li></ul>
      <p>→ Robot vẫn cần bumper, cliff, encoder, IMU.</p>
      <h4>5. Dựng bản đồ (mapping) và định vị (localization)</h4>
      <p><b>Odometry</b> (encoder + con quay) cộng dồn từng bước nhỏ nên sai số <b>tích lũy mãi</b>: bánh trượt 4 % → đi 10 m sai 40 cm, lệch góc vài độ → càng đi xa càng lệch.</p>
      <p><b>Bản đồ lưới chiếm chỗ</b> (occupancy grid): sàn chia ô 4 cm, mỗi ô lưu <code>log-odds</code> = log(p/(1−p)). Mỗi tia: ô ở đầu tia <b>+0.9</b> (có vật), các ô dọc đường tia <b>−0.4</b> (trống). Nhiều vòng cộng dồn → bản đồ chắc chắn dần, nhiễu bị lấn át.</p>
      <p><b>So khớp quét</b> (scan matching): từ tư thế odometry dự đoán, thử các dịch chuyển nhỏ (±10 cm, ±6°), chọn tư thế làm điểm quét rơi đúng nhất vào ô "có vật" (cực đại tổng <i>trường khả năng</i> <code>Σ exp(−d²/2σ²)</code>, d = khoảng cách tới ô có vật gần nhất). Sai lệch tìm được = phần sửa cho odometry. Vì vậy <b>lidar phải quay liên tục khi làm việc</b>: mỗi vòng (0.2 s) là một lần "nhìn lại bản đồ" để sửa vị trí.</p>
      <ul>
        <li><b>Mapping</b>: vừa sửa tư thế vừa ghi bản đồ (SLAM — Simultaneous Localization And Mapping). Xong thì lưu.</li>
        <li><b>Localization</b>: bản đồ đã lưu cố định, chỉ sửa tư thế; vẫn <b>bảo trì bản đồ</b> chậm khi đồ đạc bị dời.</li>
        <li><b>Bị nhấc đặt chỗ khác</b> (kidnapped robot): điểm quét không còn khớp → tìm lại <b>toàn cục</b> trên cả bản đồ.</li>
      </ul>\`,
    inRobot: \`
      <ul>
        <li>Giai đoạn sau của dự án: lidar đặt ở nóc robot, đầu quay nhô cao hơn vỏ ~1 cm để quét không bị che.</li>
        <li><b>Nguồn</b>: 5 V từ buck XL4015 (docs/01: "(sau) lidar LDS02RR 5V (~1A đỉnh)"), chung GND.</li>
        <li><b>Dữ liệu</b>: TX lidar → <b>ESP32 GPIO16</b> (UART2 RX, 115200). LDS02RR xuất 3.3 V nên nối thẳng được — vẫn nên đo trước.</li>
        <li><b>Motor</b>: <b>GPIO15</b> phát PWM → N-MOSFET (IRLZ44N hoặc AO3400) → motor lidar; ESP32 chạy vòng PI giữ ~300 vòng/phút theo trường tốc độ trong gói tin.</li>
        <li><b>SLAM</b>: ESP32 chuyển tiếp lidar + odometry (encoder, IMU) qua UART/micro-ROS sang <b>ODROID-M2 chạy ROS 2</b>: <code>slam_toolbox</code> dựng bản đồ + định vị, <code>Nav2</code> lập đường đi, thuật toán phủ (coverage) dọn theo luống.</li>
        <li><b>slam_toolbox</b> có 2 chế độ đúng như mô phỏng: <code>mapping</code> (online_async — dựng bản đồ, lưu bằng <code>serialize_map</code>) và <code>localization</code> (nạp bản đồ đã lưu, chỉ định vị, cập nhật nhẹ). Nav2 dùng bản đồ đã lưu để lập đường và chia phòng.</li>
        <li>Khi robot <b>IDLE / về dock</b>: ESP32 đặt PWM <b>GPIO15 = 0</b> để dừng motor lidar (đỡ mòn đai/ổ bi, giảm ~1–2 W, an toàn laser); bật lại và chờ ~1–2 s cho đủ 300 vòng/phút trước khi đi tiếp. Robot thương mại cũng vậy: đầu lidar đứng im khi sạc.</li>
        <li>Giai đoạn hiện tại (không lidar): robot dùng AUTO/ZIGZAG/SPIRAL + bumper — mô phỏng <code>firmware/esp32s3/sim</code> phủ ~70–79 % sàn.</li>
      </ul>\`,
    mistakes: \`
      <ul>
        <li>Cấp motor lidar thẳng 5 V không PWM → quay quá nhanh, thiếu điểm; hoặc quên PWM → đầu không quay, không có dữ liệu.</li>
        <li>Cấp nguồn lidar qua ESP32/ cổng USB → sụt áp, ESP32 reset.</li>
        <li>Đọc UART bằng <code>Serial.read()</code> từng byte trong vòng lặp chậm → tràn bộ đệm (9.9 kB/s) → mất gói. Tăng bộ đệm RX (<code>setRxBufferSize(2048)</code>), đọc thường xuyên.</li>
        <li>Không kiểm tra checksum, cờ "invalid" và cờ "cường độ yếu" của từng điểm → bản đồ đầy điểm rác.</li>
        <li>Lắp lidar nghiêng → mặt phẳng quét chạm sàn ở xa (vệt điểm giả) hoặc bỏ sót đồ thấp.</li>
        <li>Đặt vỏ/ nắp che một phần đầu quay → mất một góc quét cố định.</li>
      </ul>\`,
    quiz: [
      { q: 'f = 4 mm, b = 20 mm. Vệt sáng lệch 40 µm trên CMOS. Vật cách bao xa?', a: 'd = f·b/x = 4 × 20 / 0.04 = 2000 mm = 2 m.' },
      { q: 'Vì sao lidar tam giác lượng chính xác ở gần nhưng kém ở xa?', a: 'x = f·b/d nên ở xa vệt sáng lệch rất ít, một sai số nhỏ δx trên cảm biến thành sai số lớn δd = d²·δx/(f·b) — tăng theo bình phương khoảng cách.' },
      { q: 'Lidar 360 điểm/vòng, 5 vòng/s, mỗi gói 22 byte chứa 4 điểm. UART cần bao nhiêu byte/s, 115200 baud có đủ không?', a: '90 gói × 22 B × 5 = 9 900 B/s ≈ 99 000 bit/s (8N1) < 115 200 → đủ, chiếm ~86 %.' },
      { q: 'Robot đã dựng và lưu bản đồ rồi. Vì sao lần dọn sau lidar vẫn phải quay liên tục?', a: 'Để định vị (localization): odometry tích lũy sai số mãi, mỗi vòng quét được so khớp với bản đồ đã lưu để sửa vị trí/hướng. Tắt lidar thì chỉ còn odometry → robot lệch dần, dọn sót/ đâm tường. Chỉ tắt khi IDLE hoặc ở dock.' },
      { q: 'Robot đang định vị tốt thì bị người nhấc sang phòng bên. Chuyện gì xảy ra và giải quyết thế nào?', a: 'Odometry không biết (bánh không quay) → điểm quét không khớp bản đồ quanh tư thế cũ (khớp thấp). Thuật toán phát hiện "lạc" và tìm lại toàn cục: thử các tư thế trên khắp bản đồ, chọn tư thế khớp nhất (kidnapped robot problem).' },
    ],
  },

  build(ctx) {
    const { THREE, MAT, geom, label, readout, fx, viewer } = ctx;
    const { mesh, group, part, cyl, box, arcSector, wire } = geom;
    const root = new THREE.Group();

    // ================= MODULE LIDAR (gốc: mặt dưới đế, trục quay tại x = 12) =================
    const lidar = new THREE.Group();
    root.add(lidar);
    const TCX = 12;
    const base = mesh(box(96, 5, 72, 2), MAT.plasticBlack, { y: 2.5 });
    lidar.add(part(base, 'Đế lidar (khung nhựa)', 'Giữ motor, ổ bi đầu quay, bo mạch chính. Bắt vào nóc robot bằng 3–4 vít.'));
    const bpcb = mesh(box(40, 1.6, 24, 0.5), MAT.pcbGreen, { x: -24, y: 5.8, z: -20 });
    const bchip = mesh(box(7, 1.2, 7, 0.2), MAT.icBody, { x: -20, y: 7.2, z: -20 });
    const bpcbG = part(group(bpcb, bchip), 'Bo mạch đế', 'Nhận điện, cấp điện cho đầu quay, nhận dữ liệu từ đầu quay và xuất UART 115200 ra đầu nối.');
    lidar.add(bpcbG);
    const jst = mesh(box(12, 5, 5, 0.5), MAT.plasticWhite, { x: -38, y: 9, z: -30 });
    const cables = [[0xd23b3b, -4], [0x222222, -1.3], [0x3b8ef0, 1.3], [0x888888, 4]].map(([color, dz]) =>
      wire([[-38 + dz, 11.5, -30], [-38 + dz, 16, -32], [-50 + dz, 16, -44], [-62 + dz, 6, -52]], { radius: 0.45, color }));
    const jstG = part(group(jst, ...cables), 'Đầu nối: 5 V · GND · TX (→ ESP32 GPIO16) · …', 'UART 115200 8N1, mức 3.3 V. Motor có giắc 2 chân riêng: ESP32 điều khiển bằng PWM qua MOSFET (GPIO15).');
    lidar.add(jstG);
    // motor + puly
    const MX = -34, MZ = 22;
    const motorBody = mesh(cyl(6, 6, 15, 24), MAT.steel, { x: MX, y: -7.5, z: MZ });
    const motorShaft = mesh(cyl(0.8, 0.8, 16, 10), MAT.steel, { x: MX, y: 6, z: MZ });
    const pulley = mesh(cyl(3.5, 3.5, 3, 20), MAT.brass, { x: MX, y: 13, z: MZ });
    const motorG = part(group(motorBody, motorShaft, pulley), 'Motor DC kéo đầu quay', 'Motor nhỏ, host cấp PWM. Puly nhỏ (Ø7) kéo rãnh đầu quay (Ø54) → giảm tốc ~7.7 lần. <a href="#/c/dong-co-dc">Xem động cơ DC →</a>');
    lidar.add(motorG);
    // dây đai: ôm puly motor và rãnh đầu quay (tiếp tuyến ngoài 2 đường tròn)
    const beltPts = [];
    {
      const c1 = new THREE.Vector2(MX, MZ), c2 = new THREE.Vector2(TCX, 0);
      const r1 = 4.1, r2 = 27.6;
      const u = c2.clone().sub(c1); const D = u.length(); u.normalize();
      const alpha = Math.acos((r1 - r2) / D);
      const base0 = Math.atan2(u.y, u.x);
      const pts = beltPts;
      for (let i = 0; i <= 24; i++) { const th = base0 - (Math.PI - alpha) + (2 * (Math.PI - alpha) * i) / 24; pts.push(new THREE.Vector3(c2.x + r2 * Math.cos(th + Math.PI), 13, c2.y + r2 * Math.sin(th + Math.PI))); }
      for (let i = 0; i <= 10; i++) { const th = base0 + alpha + ((2 * Math.PI - 2 * alpha) * i) / 10; pts.push(new THREE.Vector3(c1.x + r1 * Math.cos(th), 13, c1.y + r1 * Math.sin(th))); }
    }
    const beltG = part(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(beltPts, true), 120, 0.7, 6, true), MAT.rubber),
      'Dây đai cao su', 'Truyền chuyển động từ motor sang đầu quay. Giãn/ trượt → tốc độ dao động → bản đồ méo. Hỏng phổ biến nhất của lidar cũ.');
    lidar.add(beltG);
    const hub = mesh(cyl(10, 10, 4, 24), MAT.steel, { x: TCX, y: 7 });
    const baseCoil = mesh(new THREE.TorusGeometry(14, 1.1, 8, 40), MAT.copper, { x: TCX, y: 5.6, rx: Math.PI / 2 });
    const hubG = part(group(hub, baseCoil), 'Ổ bi + cuộn dây truyền điện (phía đế)', 'Ổ bi đỡ đầu quay. Nhiều đời LDS truyền điện lên đầu quay không tiếp xúc qua cặp cuộn dây (như sạc không dây) và gửi dữ liệu xuống bằng hồng ngoại — không có chổi than để mòn.');
    lidar.add(hubG);

    // ---------- đầu quay ----------
    const turret = new THREE.Group();
    turret.position.set(TCX, 9, 0);
    lidar.add(turret);
    const tPulley = mesh(cyl(27, 27, 4, 48), MAT.plasticDark, { y: 4 });
    const tFloor = mesh(cyl(33, 33, 1.5, 48), MAT.pcbGreen, { y: 6.75 });
    const tCoil = mesh(new THREE.TorusGeometry(14, 1.1, 8, 40), MAT.copper, { y: 7.8, rx: Math.PI / 2 });
    const tBaseG = part(group(tPulley, tFloor, tCoil), 'Đế đầu quay: rãnh puly + bo mạch quay + cuộn nhận điện', 'Bo tròn quay cùng đầu: điều khiển laser, đọc CMOS, tính khoảng cách, gửi kết quả xuống đế.');
    turret.add(tBaseG);
    const wallMat = MAT.plasticDark.clone();
    wallMat.transparent = true;
    const wall = mesh(cyl(34, 34, 20, 48, true), wallMat, { y: 16 });
    wallMat.side = THREE.DoubleSide;
    turret.add(part(wall, 'Vỏ đầu quay Ø68 mm', 'Quay ~5 vòng/giây. Mặt trước có cửa sổ lọc cho laser đi ra và ánh sáng phản xạ đi vào.'));
    const winM = mesh(arcSector(33.9, 34.7, -0.55, 0.55, 11), new THREE.MeshStandardMaterial({ color: 0x501018, transparent: true, opacity: 0.55, roughness: 0.1 }), { y: 16 });
    turret.add(part(winM, 'Cửa sổ lọc hồng ngoại', 'Cho bước sóng laser 785 nm đi qua, chặn bớt ánh sáng nhìn thấy. Bám bụi/ xước → giảm tầm đo.'));
    const cap = mesh(cyl(34, 34, 3, 48), MAT.plasticBlack, { y: 27.5 });
    turret.add(part(cap, 'Nắp đầu quay', 'Che bụi và ánh sáng. Bật "Mở nắp" để nhìn bên trong.'));
    const laserMod = mesh(cyl(3, 3, 14, 20), MAT.brass, { x: 14, y: 16, z: -10, rz: Math.PI / 2 });
    const laserDot = mesh(cyl(1.1, 1.1, 0.6, 12), new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff1010, emissiveIntensity: 2 }), { x: 21.3, y: 16, z: -10, rz: Math.PI / 2 });
    const laserG = part(group(laserMod, laserDot), 'Module laser 785 nm', 'Diode laser + thấu kính chuẩn trực trong ống đồng: chùm tia hẹp chiếu thẳng ra, song song trục thấu kính thu. Class 1 khi đang quét.');
    turret.add(laserG);
    const barrel = mesh(cyl(5.8, 5.8, 7, 24, true), MAT.plasticBlack, { x: 23, y: 16, z: 10, rz: Math.PI / 2 });
    const lens = mesh(cyl(5, 5, 2.4, 24), MAT.glass, { x: 26.3, y: 16, z: 10, rz: Math.PI / 2 });
    turret.add(part(group(barrel, lens), 'Thấu kính thu (tiêu cự f ≈ 4 mm)', \`Hội tụ ánh sáng phản xạ lên cảm biến CMOS. Cách laser một đoạn b ≈ \${B_MM} mm (đường cơ sở).\`));
    const cmos = mesh(box(1.2, 10, 12, 0.3), MAT.pcbGreen, { x: 13, y: 16, z: 10 });
    const cmosChip = mesh(box(0.8, 3, 9), MAT.icBody, { x: 13.9, y: 16, z: 10 });
    const spotMat = new THREE.MeshBasicMaterial({ color: 0xff3030 });
    const cmosSpot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 0.5), spotMat);
    cmosSpot.position.set(14.35, 16, 10);
    cmosSpot.raycast = () => {};
    turret.add(cmosSpot);
    turret.add(part(group(cmos, cmosChip), 'Cảm biến ảnh CMOS dạng dòng', 'Một hàng điểm ảnh. Vị trí vệt sáng trên hàng (x) cho biết khoảng cách: d = f·b/x. Vật gần → vệt lệch xa tâm.'));
    label(turret, 'Laser', [20, 24, -16]);
    label(turret, 'Thấu kính + CMOS', [18, 24, 16]);
    label(lidar, 'Dây đai', [-14, 16, 22]);

    // ---------- mô hình CAD thật LDS02RR (khung GLB: gốc = mặt dưới đế tại trục đầu quay, cửa sổ hướng −Z) ----------
    // Trục quay của mô hình tự dựng ở x = TCX → dời CAD +TCX. Đầu quay CAD xoay (α − 90°) để cửa sổ trùng hướng tia laser (+X).
    const cadR = { coverMats: [] };
    const cad = cadAttach(ctx, lidar, 'robot/lidar-turret', {
      onBottom: false, offset: [TCX, 0, 0],
      hide: [base, bpcbG, jstG, motorG, beltG, hubG, tBaseG, wall, winM, cap],
      partDefault: ['Lidar LDS02RR (CAD thật)', 'Mô hình CAD theo ảnh linh kiện + makerspet: đế 92 × 76 mm, đầu quay Ø70 × 22 mm, cửa sổ 70°, motor Ø12 kéo dây đai O-ring.'],
      parts: {
        base_frame: ['Đế lidar (khung nhựa 92 × 76 mm)', 'Giữ motor, ổ bi đầu quay, bo mạch chính. 4 tai Ø3.2 bắt vào nóc robot.'],
        base_pcb: ['Bo mạch đế', 'Nhận điện, cấp điện cho đầu quay, nhận dữ liệu từ đầu quay và xuất UART 115200 ra đầu nối.'],
        standoffs: ['Cột đỡ bo mạch', 'Giữ bo mạch đế cách khung nhựa.'],
        pcb_parts: ['Linh kiện bo đế', 'Vi điều khiển, ổn áp, mạch truyền điện/ dữ liệu cho đầu quay.'],
        conn_header: ['Đầu cái JST-PH 4 chân (dữ liệu)', '5 V · GND · TX (3.3 V → ESP32 GPIO16) · NC.'],
        conn_pins: ['Chân đầu nối JST-PH 4 chân', 'Bước 2.0 mm.'],
        conn_motor_header: ['Đầu cái JST-PH 2 chân (motor)', 'MOT+ · MOT−: ESP32 cấp PWM qua MOSFET (GPIO15).'],
        conn_motor_pins: ['Chân đầu nối motor', 'Bước 2.0 mm.'],
        motor: ['Motor DC Ø12 kéo đầu quay', 'Motor nhỏ, host cấp PWM. Puly Ø6 kéo rãnh đầu quay Ø40 → giảm tốc ~6.7 lần. <a href="#/c/dong-co-dc">Xem động cơ DC →</a>'],
        motor_shaft: ['Trục motor', 'Quay nhanh gấp ~6.7 lần đầu quay.'],
        motor_pulley: ['Puly motor Ø6', 'Quay cùng trục motor, kéo dây đai.'],
        belt: ['Dây đai cao su (O-ring 1.6 mm)', 'Truyền chuyển động từ motor sang đầu quay. Giãn/ trượt → tốc độ dao động → bản đồ méo. Hỏng phổ biến nhất của lidar cũ.'],
        pulley: ['Rãnh puly đầu quay Ø40', 'Dây đai ôm vào đây. Bên dưới là ổ bi + cuộn dây truyền điện không tiếp xúc.'],
        head_cover: ['Vỏ đầu quay Ø70 mm', 'Quay ~5 vòng/giây. Bật "Mở nắp" để nhìn laser, thấu kính và CMOS bên trong.'],
        window: ['Cửa sổ lọc hồng ngoại (70°)', 'Cho bước sóng laser 785 nm đi qua, chặn bớt ánh sáng nhìn thấy. Bám bụi/ xước → giảm tầm đo.'],
        optics: ['Lỗ laser Ø4 + thấu kính thu Ø6 (cách nhau 20 mm)', \`Đường cơ sở b ≈ \${B_MM} mm giữa laser và thấu kính — nền tảng của tam giác lượng d = f·b/x.\`],
        'conn_lidar/plug_housing': ['Giắc JST-PH 4 chân (dữ liệu)', 'UART 115200 8N1, mức 3.3 V. Rút thẳng xuống, không kéo dây.'],
        'conn_lidar_motor/plug_housing': ['Giắc JST-PH 2 chân (motor)', 'PWM motor từ ESP32 GPIO15 qua MOSFET.'],
      },
      onLoad(c) {
        c.tag('conn_lidar/wire_1', 'Dây 5 V', 'Từ buck XL4015 (không lấy từ ESP32).');
        c.tag('conn_lidar/wire_2', 'Dây GND', 'GND chung với ESP32.');
        c.tag('conn_lidar/wire_3', 'Dây TX → ESP32 GPIO16', 'UART 115200, mức 3.3 V — đo trước khi cắm, lidar khác có thể xuất 5 V.');
        c.tag('conn_lidar/wire_4', 'Dây NC (không dùng)', '');
        c.tag('conn_lidar_motor/wire_1', 'Dây MOT+', 'Motor lidar (+).');
        c.tag('conn_lidar_motor/wire_2', 'Dây MOT−', 'Về MOSFET do GPIO15 điều khiển (PWM).');
        cadR.head = c.pivot('head', { axis: [0, 1, 0], origin: [0, 0, 0] });
        cadR.headUp = cadR.head && c.slide(cadR.head.pivot, [0, 1, 0]);
        cadR.cover = c.slide('head_cover', [0, 1, 0]);
        cadR.belt = c.move('belt');
        cadR.mPulley = c.pivot('motor_pulley', { axis: [0, 1, 0] });
        cadR.mShaft = c.pivot('motor_shaft', { axis: [0, 1, 0] });
        cadR.plug = c.node('conn_lidar/plug_housing');
        cadR.optics = c.node('optics');
        c.node('head_cover')?.traverse((o) => { if (o.isMesh) { const m = ownMaterial(o); m.transparent = true; m.side = THREE.DoubleSide; cadR.coverMats.push(m); } });
      },
    });
    let mAng = 0, lastSee = null;

    // đường tia tam giác lượng trong đầu quay (cận cảnh)
    const triPos = new Float32Array(6 * 3);
    const triGeo = new THREE.BufferGeometry();
    triGeo.setAttribute('position', new THREE.BufferAttribute(triPos, 3));
    const triLines = new THREE.LineSegments(triGeo, new THREE.LineBasicMaterial({ color: 0xff3a3a, transparent: true, opacity: 0.9 }));
    triLines.frustumCulled = false;
    triLines.raycast = () => {};
    turret.add(triLines);
    const triTarget = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff5050 }));
    triTarget.raycast = () => {};
    turret.add(triTarget);

    // ================= CĂN PHÒNG =================
    const room = new THREE.Group();
    const floorMat = MAT.plasticWhite.clone(); floorMat.color.setHex(0xc9a57a); floorMat.roughness = 0.85;
    const floor = mesh(box(ROOM.x1 - ROOM.x0 + 60, 10, ROOM.z1 - ROOM.z0 + 60), floorMat, { y: -5 });
    room.add(part(floor, 'Sàn phòng 2.4 × 1.8 m', 'Các chấm trên sàn là điểm lidar đo được trong mặt phẳng quét (cao ~11 cm), chiếu xuống sàn cho dễ nhìn.'));
    const wallM = MAT.plasticWhite.clone(); wallM.color.setHex(0xe8e4dc);
    const walls = group(
      mesh(box(ROOM.x1 - ROOM.x0 + 60, ROOM.h, 30), wallM, { y: ROOM.h / 2, z: ROOM.z0 - 15 }),
      mesh(box(ROOM.x1 - ROOM.x0 + 60, ROOM.h, 30), wallM, { y: ROOM.h / 2, z: ROOM.z1 + 15 }),
      mesh(box(30, ROOM.h, ROOM.z1 - ROOM.z0), wallM, { x: ROOM.x0 - 15, y: ROOM.h / 2 }),
      mesh(box(30, ROOM.h, ROOM.z1 - ROOM.z0), wallM, { x: ROOM.x1 + 15, y: ROOM.h / 2 }),
    );
    room.add(part(walls, 'Tường (sơn trắng, phản xạ tốt)', 'Lidar thấy rõ — các điểm xếp thành đường thẳng. SLAM dùng chính các đường này để định vị.'));
    const sofaMat = MAT.plasticBlack.clone(); sofaMat.color.setHex(0x1a1a1e); sofaMat.roughness = 1;
    const sofa = group(mesh(box(800, 380, 400, 20), sofaMat, { x: -750, y: 190, z: -680 }), mesh(box(800, 200, 120, 20), sofaMat, { x: -750, y: 480, z: -820 }));
    room.add(part(sofa, 'Sofa vải đen (phản xạ ~3 %)', 'Tín hiệu về rất yếu → chỉ đo được khi robot ở gần (&lt; ~1.5 m). Ở xa: thiếu điểm.'));
    const tableMat = MAT.plasticWhite.clone(); tableMat.color.setHex(0x9c6b3e);
    const LEGS = [[130, -640], [770, -640], [130, -260], [770, -260]];
    const table = group(mesh(box(720, 20, 460, 4), tableMat, { x: 450, y: 450, z: -450 }), ...LEGS.map(([x, z]) => mesh(cyl(20, 20, 440, 16), tableMat, { x, y: 220, z })));
    room.add(part(table, 'Bàn trà (chỉ 4 chân cắt mặt phẳng quét)', 'Lidar chỉ thấy 4 chấm tròn nhỏ. Mặt bàn cao hơn tia quét — robot chui gầm được, nhưng vật treo thấp hơn nóc robot thì lidar không thấy.'));
    const bin = mesh(cyl(130, 120, 300, 32), MAT.plasticWhite, { x: 900, y: 150, z: 650 });
    room.add(part(bin, 'Thùng rác trắng Ø260 mm', 'Bề mặt cong sáng màu — các điểm xếp thành cung tròn.'));
    const shoes = group(mesh(box(260, 60, 100, 20), MAT.plasticRed, { x: 430, y: 30, z: 670 }), mesh(box(260, 60, 100, 20), MAT.plasticRed, { x: 430, y: 30, z: 790 }));
    room.add(part(shoes, 'Đôi dép (cao 6 cm)', 'Thấp hơn mặt phẳng quét (~11 cm) → lidar KHÔNG thấy. Robot chỉ biết khi bumper đụng phải.'));
    const glass = mesh(box(10, ROOM.h, 350), MAT.glass, { x: 700, y: ROOM.h / 2, z: -725 });
    room.add(part(glass, 'Vách kính', 'Laser xuyên qua kính → không có điểm, bản đồ "thủng" chỗ này → robot sẽ đâm vào nếu chỉ tin lidar.'));
    const shelfMat = MAT.plasticWhite.clone(); shelfMat.color.setHex(0xb98b5a);
    const shelf = mesh(box(170, 600, 600, 6), shelfMat, { x: (SHELF_HOME[0] + SHELF_HOME[1]) / 2, y: 300, z: (SHELF_HOME[2] + SHELF_HOME[3]) / 2 });
    room.add(part(shelf, 'Kệ sách gỗ 600 × 170 mm', 'Vật lớn, phản xạ tốt → nhiều điểm quét, giúp định vị (phòng hình chữ nhật trơn thì quay 180° trông y hệt!). Nút "Kê lại đồ đạc" dời kệ sang chỗ khác.'));
    label(room, 'Vách kính (lidar không thấy)', [700, ROOM.h + 20, -725]);
    label(room, 'Dép (thấp hơn tia quét)', [430, 120, 730]);

    // robot (thân giản lược)
    const robot = new THREE.Group();
    room.add(robot);
    const body = mesh(cyl(ROBOT_R, ROBOT_R, 80, 64), MAT.plasticWhite, { y: 48 });
    const bumperM = mesh(arcSector(ROBOT_R, ROBOT_R + 6, -1.6, 1.6, 50, 32), MAT.plasticDark, { y: 40 });
    robot.add(part(group(body, bumperM), 'Robot hút bụi Ø350 (giản lược)', 'Lidar đặt trên nóc, lệch về phía sau. <a href="#/c/robot-assembly">Xem robot hoàn chỉnh →</a>'));
    const robotLidarMount = new THREE.Group();
    robotLidarMount.position.set(-70 - TCX, 88, 0);
    robot.add(robotLidarMount);

    // bản đồ điểm
    const MAXP = 360 * MAP_REVS;
    const pPos = new Float32Array(MAXP * 3);
    const pCol = new Float32Array(MAXP * 3);
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
    const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 22, vertexColors: true, sizeAttenuation: true }));
    points.frustumCulled = false;
    points.raycast = () => {};
    room.add(points);
    const beamPos = new Float32Array(6);
    const beamGeo = new THREE.BufferGeometry();
    beamGeo.setAttribute('position', new THREE.BufferAttribute(beamPos, 3));
    const beam = new THREE.Line(beamGeo, new THREE.LineBasicMaterial({ color: 0xff2a2a }));
    beam.frustumCulled = false;
    beam.raycast = () => {};
    room.add(beam);
    const hitDot = new THREE.Mesh(new THREE.SphereGeometry(14, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff4040 }));
    hitDot.raycast = () => {};
    room.add(hitDot);

    // ---------- vật cản cho tia quét (2D, mặt phẳng XZ) ----------
    const SEG = [];   // [ax, az, bx, bz, rho]
    const addRect = (x0, x1, z0, z1, rho) => { SEG.push([x0, z0, x1, z0, rho], [x1, z0, x1, z1, rho], [x1, z1, x0, z1, rho], [x0, z1, x0, z0, rho]); };
    addRect(ROOM.x0, ROOM.x1, ROOM.z0, ROOM.z1, 0.7);
    addRect(-1150, -350, -880, -480, 0.03);
    const SHELF_SEG = SEG.length;
    addRect(...SHELF_HOME, 0.6);
    const CIR = [[900, 650, 130, 0.8], ...LEGS.map(([x, z]) => [x, z, 20, 0.5])];
    function cast(ox, oz, dx, dz) {
      let best = Infinity, rho = 0;
      for (const [ax, az, bx, bz, r] of SEG) {
        const ex = bx - ax, ez = bz - az;
        const den = dx * ez - dz * ex;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((ax - ox) * ez - (az - oz) * ex) / den;
        const s = ((ax - ox) * dz - (az - oz) * dx) / den;
        if (t > 1 && s >= 0 && s <= 1 && t < best) { best = t; rho = r; }
      }
      for (const [cx, cz, r, rr] of CIR) {
        const fx_ = ox - cx, fz = oz - cz;
        const b = fx_ * dx + fz * dz, c = fx_ * fx_ + fz * fz - r * r;
        const disc = b * b - c;
        if (disc < 0) continue;
        const t = -b - Math.sqrt(disc);
        if (t > 1 && t < best) { best = t; rho = rr; }
      }
      return [best, rho];
    }

    // ================= SLAM rút gọn =================
    const grid = new Float32Array(GW * GH);       // log-odds của bản đồ đang dựng / đang dùng
    let saved = null;                             // bản đồ đã lưu sau mapping
    const dist = new Float32Array(GW * GH);
    const field = new Float32Array(GW * GH);      // trường khả năng 0…1 (1 = ngay trên ô có vật)
    let occCount = 0;
    const texData = new Uint8Array(GW * GH * 4);
    const mapTex = new THREE.DataTexture(texData, GW, GH, THREE.RGBAFormat);
    mapTex.magFilter = THREE.NearestFilter; mapTex.minFilter = THREE.NearestFilter; mapTex.needsUpdate = true;
    const mapMat = new THREE.MeshBasicMaterial({ map: mapTex, transparent: true, depthWrite: false, opacity: 0.9 });
    const mapPlane = new THREE.Mesh(new THREE.PlaneGeometry(GW * CELL, GH * CELL), mapMat);
    mapPlane.rotation.x = -Math.PI / 2;
    mapPlane.position.set(GX0 + (GW * CELL) / 2, 1.5, GZ0 + (GH * CELL) / 2);
    mapPlane.castShadow = false;
    room.add(part(mapPlane, 'Bản đồ lưới chiếm chỗ (occupancy grid, ô 4 cm)', 'Ô sẫm = có vật (log-odds cao), ô sáng = trống, trong suốt = chưa biết. Đây là thứ slam_toolbox lưu lại sau lần dựng bản đồ đầu tiên.'));
    // 2 "bóng" robot: chỉ odometry (đỏ) và odometry + lidar (xanh)
    const mkGhost = (color, name, desc) => {
      const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.42, depthWrite: false });
      const g = group(mesh(cyl(ROBOT_R, ROBOT_R, 6, 48), m, { y: 100, castShadow: false }), mesh(box(170, 8, 26), m, { x: 85, y: 104, castShadow: false }));
      room.add(part(g, name, desc));
      return g;
    };
    const ghostOdo = mkGhost(0xff4a4a, 'Tư thế CHỈ theo odometry (bóng đỏ)', 'Cộng dồn quãng đường encoder + góc: sai số nhỏ mỗi bước nhưng tích lũy mãi → trôi xa dần robot thật.');
    const ghostEst = mkGhost(0x3fcf8e, 'Tư thế odometry + lidar (bóng xanh)', 'Odometry dự đoán, rồi mỗi vòng quét so khớp với bản đồ để kéo về đúng chỗ. Tắt lidar → không còn được sửa.');

    const cellOf = (x, z) => {
      const ix = Math.floor((x - GX0) / CELL), iz = Math.floor((z - GZ0) / CELL);
      return ix < 0 || iz < 0 || ix >= GW || iz >= GH ? -1 : iz * GW + ix;
    };
    function fieldAt(x, z) {
      const gx = (x - GX0) / CELL - 0.5, gz = (z - GZ0) / CELL - 0.5;
      if (gx < 0 || gz < 0 || gx > GW - 1.001 || gz > GH - 1.001) return 0;
      const ix = gx | 0, iz = gz | 0, ax = gx - ix, az = gz - iz, k = iz * GW + ix;
      return (field[k] * (1 - ax) + field[k + 1] * ax) * (1 - az) + (field[k + GW] * (1 - ax) + field[k + GW + 1] * ax) * az;
    }
    // biến đổi khoảng cách 2 lượt (chamfer) → trường khả năng exp(−d²/2σ²), σ = 50 mm
    function computeField(g) {
      occCount = 0;
      for (let k = 0; k < g.length; k++) { const o = g[k] > 0.6; dist[k] = o ? 0 : 1e6; if (o) occCount++; }
      const D = Math.SQRT2;
      for (let iz = 0; iz < GH; iz++) for (let ix = 0; ix < GW; ix++) {
        const k = iz * GW + ix; let d = dist[k];
        if (ix > 0) d = Math.min(d, dist[k - 1] + 1);
        if (iz > 0) { d = Math.min(d, dist[k - GW] + 1); if (ix > 0) d = Math.min(d, dist[k - GW - 1] + D); if (ix < GW - 1) d = Math.min(d, dist[k - GW + 1] + D); }
        dist[k] = d;
      }
      for (let iz = GH - 1; iz >= 0; iz--) for (let ix = GW - 1; ix >= 0; ix--) {
        const k = iz * GW + ix; let d = dist[k];
        if (ix < GW - 1) d = Math.min(d, dist[k + 1] + 1);
        if (iz < GH - 1) { d = Math.min(d, dist[k + GW] + 1); if (ix < GW - 1) d = Math.min(d, dist[k + GW + 1] + D); if (ix > 0) d = Math.min(d, dist[k + GW - 1] + D); }
        dist[k] = d;
        const mm = d * CELL;
        field[k] = Math.exp(-(mm * mm) / (2 * 50 * 50));
      }
    }
    function updateTexture(g) {
      for (let iz = 0; iz < GH; iz++) for (let ix = 0; ix < GW; ix++) {
        const v = g[iz * GW + ix], o = ((GH - 1 - iz) * GW + ix) * 4;     // hàng texture 0 = phía z lớn
        if (v > 0.6) { texData[o] = 25; texData[o + 1] = 35; texData[o + 2] = 70; texData[o + 3] = Math.min(255, 140 + v * 30); }
        else if (v < -0.3) { texData[o] = 235; texData[o + 1] = 242; texData[o + 2] = 250; texData[o + 3] = Math.min(150, 40 - v * 45); }
        else { texData[o + 3] = 0; }
      }
      mapTex.needsUpdate = true;
    }
    // bản đồ "dựng sẵn" (khi chưa chạy mapping): vẽ các cạnh vật cản mà lidar thấy được
    function rasterize(g) {
      g.fill(0);
      for (let k = 0; k < g.length; k++) { const ix = k % GW, iz = (k / GW) | 0, x = GX0 + (ix + 0.5) * CELL, z = GZ0 + (iz + 0.5) * CELL; if (x > ROOM.x0 && x < ROOM.x1 && z > ROOM.z0 && z < ROOM.z1) g[k] = -2; }
      const mark = (x, z) => { const c = cellOf(x, z); if (c >= 0) g[c] = 3; };
      for (const [ax, az, bx, bz] of SEG) { const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 10); for (let i = 0; i <= n; i++) mark(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n); }
      for (const [cx_, cz_, r] of CIR) for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2; mark(cx_ + r * Math.cos(a), cz_ + r * Math.sin(a)); }
    }
    // ghi một vòng quét vào lưới: ô đầu tia +wHit, ô dọc đường tia −wFree
    function integrate(g, ox, oz, xs, zs, n, wHit, wFree) {
      for (let i = 0; i < n; i++) {
        const dx = xs[i] - ox, dz = zs[i] - oz, len = Math.hypot(dx, dz);
        for (let r = 0; r < len - 1.5 * CELL; r += CELL * 0.5) { const c = cellOf(ox + (dx * r) / len, oz + (dz * r) / len); if (c >= 0) g[c] = Math.max(-2.5, g[c] - wFree); }
        const c = cellOf(xs[i], zs[i]);
        if (c >= 0) g[c] = Math.min(3.5, g[c] + wHit);
      }
    }
    // điểm quét của vòng hiện tại: tọa độ thế giới theo tư thế ƯỚC LƯỢNG lúc lấy mẫu
    const revX = new Float32Array(400), revZ = new Float32Array(400);
    const relX = new Float32Array(400), relZ = new Float32Array(400);
    let nRev = 0;
    function score(px, pz, pth, stride) {
      const c = Math.cos(pth), sn = Math.sin(pth);
      let sum = 0, cnt = 0;
      for (let i = 0; i < nRev; i += stride) { sum += fieldAt(px + relX[i] * c + relZ[i] * sn, pz - relX[i] * sn + relZ[i] * c); cnt++; }
      return cnt ? sum / cnt : 0;
    }
    function search(x0, z0, t0, rXZ, sXZ, rT, sT, stride) {
      let best = score(x0, z0, t0, stride), bx = x0, bz = z0, bt = t0;
      for (let dt_ = -rT; dt_ <= rT + 1e-9; dt_ += sT) for (let dx = -rXZ; dx <= rXZ; dx += sXZ) for (let dz = -rXZ; dz <= rXZ; dz += sXZ) {
        const sc = score(x0 + dx, z0 + dz, t0 + dt_, stride);
        if (sc > best + 1e-6) { best = sc; bx = x0 + dx; bz = z0 + dz; bt = t0 + dt_; }
      }
      return [bx, bz, bt, best];
    }
    const DEG = Math.PI / 180;
    function globalSearch() {
      let best = [0, 0, 0, -1];
      for (let t0 = 0; t0 < Math.PI * 2; t0 += 10 * DEG) {
        for (let x = ROOM.x0 + 200; x <= ROOM.x1 - 200; x += 100) for (let z = ROOM.z0 + 200; z <= ROOM.z1 - 200; z += 100) {
          const sc = score(x, z, t0, 8);
          if (sc > best[3]) best = [x, z, t0, sc];
        }
      }
      let r = search(best[0], best[1], best[2], 100, 25, 6 * DEG, 2 * DEG, 4);
      r = search(r[0], r[1], r[2], 20, 10, 1.5 * DEG, 0.5 * DEG, 2);
      return r;
    }
    const matchRatio = (px, pz, pth) => {
      const c = Math.cos(pth), sn = Math.sin(pth);
      let ok = 0;
      for (let i = 0; i < nRev; i++) if (fieldAt(px + relX[i] * c + relZ[i] * sn, pz - relX[i] * sn + relZ[i] * c) > 0.5) ok++;
      return nRev ? ok / nRev : 0;
    };

    // ================= TRẠNG THÁI =================
    let alpha = 0, idxPrev = 0, rpm = 0, pwm = 60, integ = 0, view = null, step = -1, stepPos = 0;
    let s = -2.0, mapHead = 0, validCount = 0, validRev = 0, lastD = 0, lastAng = 0, lastMap = false;
    let fault = null, faultT = 0, gpioDead = false, brownT = 0;
    // SLAM
    const odo = { x: 0, z: 0, th: 0 }, est = { x: 0, z: 0, th: 0 };
    let prevTrue = null, skipOdo = false, lastMode = null, sStart = 0, savedLoops = 0, lowRevs = 0, relocT = 0, matchPct = 0, mismatch = 0, shelfMoved = false, slamMsg = '';
    const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    function enterMode(m, rx, rz, hd) {
      odo.x = est.x = rx; odo.z = est.z = rz; odo.th = est.th = hd;
      lowRevs = 0; nRev = 0; relocT = 0; matchPct = 0;
      if (m === 'mapping') { grid.fill(0); sStart = s; savedLoops = 0; mapMat.opacity = 0.9; }
      if (m === 'loc') { if (saved) grid.set(saved); else rasterize(grid); mapMat.opacity = 0.55; }
      computeField(grid);
      updateTexture(grid);
      clearMap();
    }
    // xử lý 1 vòng quét: so khớp → sửa tư thế → (mapping) ghi bản đồ / (localization) bảo trì bản đồ
    function processRev(mode) {
      if (nRev < 40) { nRev = 0; return; }
      const c = Math.cos(est.th), sn = Math.sin(est.th);
      for (let i = 0; i < nRev; i++) { const dx = revX[i] - est.x, dz = revZ[i] - est.z; relX[i] = dx * c - dz * sn; relZ[i] = dx * sn + dz * c; }
      let ratio = 1;
      if (occCount > 30) {
        let r = search(est.x, est.z, est.th, 100, 25, 6 * DEG, 1.5 * DEG, 4);
        r = search(r[0], r[1], r[2], 20, 10, 1 * DEG, 0.5 * DEG, 2);
        ratio = matchRatio(r[0], r[1], r[2]);
        lowRevs = ratio < 0.3 ? lowRevs + 1 : 0;
        if (lowRevs >= 2) {
          r = globalSearch();                               // "kidnapped": tìm lại trên toàn bản đồ
          ratio = matchRatio(r[0], r[1], r[2]);
          lowRevs = 0; relocT = 3;
        }
        if (ratio >= 0.3 || mode === 'mapping') { est.x = r[0]; est.z = r[1]; est.th = r[2]; }
      }
      matchPct = ratio * 100;
      mismatch = 1 - ratio;
      // điểm quét tại tư thế đã sửa
      const c2 = Math.cos(est.th), s2 = Math.sin(est.th);
      for (let i = 0; i < nRev; i++) { revX[i] = est.x + relX[i] * c2 + relZ[i] * s2; revZ[i] = est.z - relX[i] * s2 + relZ[i] * c2; }
      const ox = est.x - 70 * c2, oz = est.z + 70 * s2;
      if (mode === 'mapping') { integrate(grid, ox, oz, revX, revZ, nRev, 0.9, 0.4); computeField(grid); updateTexture(grid); }
      else if (mode === 'loc' && ratio > 0.5) { integrate(grid, ox, oz, revX, revZ, nRev, 0.25, 0.12); computeField(grid); updateTexture(grid); }   // bảo trì bản đồ (cập nhật chậm)
      nRev = 0;
    }
    const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += Math.random(); return (u - 3) * Math.SQRT2; };
    function clearMap() { pPos.fill(0); pCol.fill(0); for (let i = 0; i < MAXP; i++) pPos[i * 3 + 1] = -20; pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true; mapHead = 0; }
    clearMap();

    // nhãn CSS2D nằm trong nhánh bị gỡ khỏi cảnh sẽ không được renderer cập nhật → tự ẩn/hiện
    const roomLabels = (show) => room.traverse((o) => {
      if (!o.userData.isLabel) return;
      if (o.element?.style) o.element.style.display = 'none';
      if (show) o.visible = viewer?.labelsVisible ?? true;
    });
    function setView(v) {
      view = v;
      if (v === 'room') {
        roomLabels(true);
        root.add(room);
        robotLidarMount.add(lidar);
        lidar.position.set(0, 0, 0);
      } else {
        roomLabels(false);
        root.remove(room);
        root.add(lidar);
        lidar.position.set(0, 15, 0);
        lidar.rotation.set(0, 0, 0);
      }
      viewer?.frame?.();
    }

    return {
      object: root,
      onAction(id) {
        if (id === 'clear') clearMap();
        if (id === 'furn') {
          shelfMoved = !shelfMoved;
          const [x0, x1, z0, z1] = shelfMoved ? SHELF_MOVED : SHELF_HOME;
          shelf.position.set((x0 + x1) / 2, 300, (z0 + z1) / 2);
          shelf.rotation.y = shelfMoved ? Math.PI / 2 : 0;
          SEG.splice(SHELF_SEG, 4); const tmpSeg = SEG.splice(SHELF_SEG); addRect(x0, x1, z0, z1, 0.6); SEG.push(...tmpSeg);
        }
        if (id === 'kidnap') { s += 2.4; skipOdo = true; }      // bị nhấc: bánh không quay → odometry không biết
      },
      dispose() { room.traverse((o) => { if (o.userData.isLabel) o.element?.remove?.(); }); },
      setStep(i) { step = i; },
      triggerFault(id) { fault = id; faultT = 0; gpioDead = false; brownT = 0; },
      resetFault() { fault = null; gpioDead = false; },
      update(dt, t, p) {
        faultT += dt;
        const wantView = step >= 0 ? 'close' : p.view;
        if (wantView !== view) setView(wantView);
        if (p.map !== lastMap) { clearMap(); lastMap = p.map; }
        const slow = Math.max(1, p.slow);
        const dtr = dt / slow;                                      // thời gian "thật" trôi trong khung hình này

        // ----- tháo lắp: nắp, đai, đầu quay -----
        // bước −1: lắp hoàn chỉnh · 0: đã tháo khỏi robot · 1: nhấc nắp · 2: tháo đai · 3: nhấc đầu quay · 4: lắp lại
        const stTarget = step < 0 ? 0 : step >= 4 ? 1 : step + 1;
        stepPos += (stTarget - stepPos) * Math.min(1, dt * 3);
        const k = (a) => Math.max(0, Math.min(1, stepPos - a));
        cap.position.y = 27.5 + k(1) * 40;
        cap.visible = step >= 0 ? true : !p.open;
        beltG.position.y = k(2) * 30;
        beltG.position.x = -k(2) * 20;
        turret.position.y = 9 + k(3) * 45;
        const seeThrough = step >= 0 ? (step >= 1 && step < 4) : p.open;
        wall.material.opacity = seeThrough ? 0.28 : 1;
        wall.material.depthWrite = !seeThrough;

        // ----- motor: PI giữ 300 rpm, hoặc PWM tay -----
        let target = 300;
        if (p.pid) { const e = target - rpm; integ = Math.max(-200, Math.min(400, integ + e * dtr * 2)); pwm = Math.max(0, Math.min(100, 50 + e * 0.12 + integ * 0.1)); }
        else pwm = p.pwm;
        if (p.lidarOff) { pwm = 0; integ = 0; }
        if (fault === 'nhin-laser') pwm = 0;
        if (fault === 'nguon-yeu') {
          // chu kỳ: ESP32 khởi động 0.4 s (PWM = 0) → bật motor → dòng khởi động ~1 A làm sụt áp sau ~0.12 s → reset
          brownT += dtr;
          if (brownT > 0.52) brownT = 0;
          if (brownT < 0.4) pwm = 0;
        }
        const beltEff = step >= 2 && step < 4 ? 0 : fault === 'truot-dai' ? 0.78 : 1;
        const rpmTarget = Math.max(0, (pwm - 12) / 88) * 520 * beltEff;
        rpm += (rpmTarget - rpm) * Math.min(1, dtr / 0.35);
        let rpmInst = rpm;
        if (fault === 'truot-dai') rpmInst = rpm * (1 + 0.35 * Math.sin(alpha * 2));   // trượt theo chu kỳ mỗi vòng
        const omega = (rpmInst / 60) * 2 * Math.PI;                 // rad/s thật
        const prevAlpha = alpha;
        alpha += omega * dtr;
        turret.rotation.y = alpha;
        motorG.children[2].rotation.y += omega * dtr * 7.7;
        // ----- CAD thật: đầu quay theo α, puly motor quay nhanh hơn ~6.7×; tháo lắp: nắp → đai → đầu quay -----
        mAng = (mAng + omega * dtr * 6.7) % (Math.PI * 2);
        if (cad.sync(p)) {
          cadR.head?.set(alpha - Math.PI / 2);
          cadR.headUp?.set(k(3) * 45);
          cadR.cover?.set(k(1) * 40);
          cadR.belt?.set([-k(2) * 20, k(2) * 30, 0]);
          cadR.mPulley?.set(mAng);
          cadR.mShaft?.set(mAng);
          if (seeThrough !== lastSee) {
            lastSee = seeThrough;
            cadR.coverMats.forEach((m) => { m.opacity = seeThrough ? 0.25 : 1; m.depthWrite = !seeThrough; m.needsUpdate = true; });
          }
        }

        // ----- tư thế robot -----
        let rx = 0, rz = 0, hd = 0;
        if (view === 'room') {
          if ((p.move || p.mode !== 'scan') && step < 0) s += (270 / slow) * dt / 412;     // ~0.27 m/s thật; elip chu vi ~2.6 m ≈ 412 mm mỗi radian tham số
          rx = PATH.cx + PATH.ax * Math.cos(s);
          rz = PATH.cz + PATH.az * Math.sin(s);
          const tx = -PATH.ax * Math.sin(s), tz = PATH.az * Math.cos(s);
          hd = Math.atan2(-tz, tx);
          robot.position.set(rx, 0, rz);
          robot.rotation.y = hd;
        }
        // tâm đầu quay trong tọa độ phòng
        const cx = rx + Math.cos(hd) * -70, cz = rz - Math.sin(hd) * -70;

        // ----- SLAM: odometry (có sai số) cho bóng đỏ và bóng xanh -----
        const slam = p.mode !== 'scan' && view === 'room' && step < 0;
        if (p.mode !== lastMode && view === 'room') { enterMode(p.mode, rx, rz, hd); lastMode = p.mode; prevTrue = null; }
        mapPlane.visible = slam;
        ghostOdo.visible = ghostEst.visible = slam;
        if (slam && prevTrue && !skipOdo) {
          const dX = rx - prevTrue[0], dZ = rz - prevTrue[1], dth = wrapA(hd - prevTrue[2]);
          const dl = dX * Math.cos(prevTrue[2]) - dZ * Math.sin(prevTrue[2]);
          const ds = Math.abs(dl);
          const dlO = dl * ODO_SCALE, dthO = dth * ODO_TURN + ODO_BIAS * (ds / 1000) + gauss() * 0.02 * Math.sqrt(ds / 1000);
          for (const q of [odo, est]) { q.x += dlO * Math.cos(q.th + dthO / 2); q.z -= dlO * Math.sin(q.th + dthO / 2); q.th += dthO; }
        }
        skipOdo = false;
        prevTrue = [rx, rz, hd];
        if (slam) {
          ghostOdo.position.set(odo.x, 0, odo.z); ghostOdo.rotation.y = odo.th;
          ghostEst.position.set(est.x, 0, est.z); ghostEst.rotation.y = est.th;
          if (p.mode === 'mapping' && s - sStart >= 2 * Math.PI) { saved = grid.slice(); savedLoops++; sStart = s; }
        }
        relocT = Math.max(0, relocT - dt);

        // ----- lấy mẫu: mỗi lần đầu quay đi qua 1 độ (không lấy được nếu quay quá nhanh) -----
        const laserOn = step < 0 && !(fault === 'nguon-yeu' && pwm === 0) && rpm > 60 || fault === 'nhin-laser';
        const samplesPerRev = rpm > 1 ? (SAMPLE_HZ * 60) / rpm : 0;
        const fill = Math.min(1, samplesPerRev / 360);
        const i0 = Math.floor((prevAlpha * 180) / Math.PI), i1 = Math.floor((alpha * 180) / Math.PI);
        if (fault === 'tx-5v' && faultT > 3 && !gpioDead) {
          gpioDead = true;
          const jT = cad.active && cadR.plug ? cadR.plug : jst;
          fx.flash(jT, { size: 10, color: 0xfff0a0 }); fx.smoke(jT, { size: 4, duration: 2 });
        }
        const nSamp = Math.min(400, i1 - i0);
        for (let n = 1; n <= nSamp; n++) {
          const deg = i0 + n;
          const bin = ((deg % 360) + 360) % 360;
          if (bin === 0) { validRev = validCount; validCount = 0; if (slam) processRev(p.mode); }
          // góc firmware gán (nội suy đều) vs góc thật khi đai trượt
          let realA = (deg * Math.PI) / 180;
          if (fault === 'truot-dai') realA += 0.17 * Math.sin(realA * 2 + 0.6);
          const th = hd + realA;
          const dx = Math.cos(th), dz = -Math.sin(th);
          let [d, rho] = cast(cx, cz, dx, dz);
          let ok = laserOn && view === 'room' && Math.random() < fill && d >= R_MIN && d <= R_MAX * Math.min(1, Math.sqrt(rho / 0.12)) && !gpioDead;
          if (p.noise) d += gauss() * (2 + (d * d * DX_MM) / (F_MM * B_MM));
          lastD = d; lastAng = bin;
          if (ok) validCount++;
          // ghi điểm vào bộ đệm
          const slot = p.map && !slam ? (mapHead++ % MAXP) : bin;
          const thAssigned = hd + (deg * Math.PI) / 180;
          if (ok && slam) {
            // điểm đặt theo tư thế ƯỚC LƯỢNG (robot chỉ biết vậy) — lệch khỏi tường nghĩa là tư thế đang sai
            const thE = est.th + (deg * Math.PI) / 180;
            const wx = est.x - 70 * Math.cos(est.th) + Math.cos(thE) * d, wz = est.z + 70 * Math.sin(est.th) - Math.sin(thE) * d;
            if (nRev < 400) { revX[nRev] = wx; revZ[nRev] = wz; nRev++; }
            pPos[slot * 3] = wx; pPos[slot * 3 + 1] = 4; pPos[slot * 3 + 2] = wz;
            const good = p.mode === 'mapping' || fieldAt(wx, wz) > 0.3;
            pCol[slot * 3] = good ? 0.2 : 1; pCol[slot * 3 + 1] = good ? 0.85 : 0.2; pCol[slot * 3 + 2] = good ? 1 : 0.2;
          } else if (ok) {
            pPos[slot * 3] = cx + Math.cos(thAssigned) * d;
            pPos[slot * 3 + 1] = 3;
            pPos[slot * 3 + 2] = cz - Math.sin(thAssigned) * d;
            const c = Math.min(1, d / 3000);
            pCol[slot * 3] = 1 - c * 0.7; pCol[slot * 3 + 1] = 0.35 + c * 0.4; pCol[slot * 3 + 2] = 0.2 + c * 0.8;
          } else { pPos[slot * 3] = cx; pPos[slot * 3 + 1] = -20; pPos[slot * 3 + 2] = cz; }
        }
        if (nSamp > 0) { pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true; }

        // ----- tia laser hiện tại -----
        const thNow = hd + alpha;
        const [dNow] = cast(cx, cz, Math.cos(thNow), -Math.sin(thNow));
        const dShow = Math.min(dNow, R_MAX);
        beam.visible = hitDot.visible = laserOn && view === 'room';
        if (beam.visible) {
          beamPos[0] = cx + Math.cos(thNow) * 34; beamPos[1] = BEAM_Y; beamPos[2] = cz - Math.sin(thNow) * 34;
          beamPos[3] = cx + Math.cos(thNow) * dShow; beamPos[4] = BEAM_Y; beamPos[5] = cz - Math.sin(thNow) * dShow;
          beamGeo.attributes.position.needsUpdate = true;
          hitDot.position.set(beamPos[3], BEAM_Y, beamPos[5]);
        }
        // ----- tam giác lượng trong đầu quay -----
        const L = view === 'room' ? Math.min(220, Math.max(40, dNow / 10)) : 60 + 40 * Math.sin(t * 0.7);
        const ex = 21.6, ez = -10, lx = 27.5, lz = 10;
        const txp = ex + L, tzp = ez;
        const kx = (13.9 - lx) / (lx - txp);
        const sz = lz + (lz - tzp) * kx;
        triPos.set([ex, 16, ez, txp, 16, tzp, txp, 16, tzp, lx, 16, lz, lx, 16, lz, 13.9, 16, sz]);
        triGeo.attributes.position.needsUpdate = true;
        triLines.visible = triTarget.visible = laserOn && (view === 'close' || p.open);
        triTarget.position.set(txp, 16, tzp);
        cmosSpot.position.z = sz;
        cmosSpot.visible = laserOn;
        const ldm = laserDot.material;
        if (ldm.emissive) ldm.emissiveIntensity = laserOn ? (fault === 'nhin-laser' ? 6 : 2) : 0;
        if (fault === 'nhin-laser' && laserOn && Math.floor(t * 2) !== Math.floor((t - dt) * 2)) fx.flash(cad.active && cadR.optics ? cadR.optics : laserDot, { size: 12, color: 0xff3030, intensity: 3, duration: 0.25 });

        // ----- số đo -----
        const realD = view === 'room' ? dNow : L;
        const xUm = (F_MM * B_MM / Math.max(1, realD)) * 1000;
        readout('rpm', rpmInst);
        readout('hz', rpmInst / 60);
        readout('ang', lastAng);
        readout('dist', view === 'room' ? lastD : realD);
        readout('cmos', xUm);
        readout('valid', validRev);
        // lấy mẫu cố định 1800/s = 450 gói 4 điểm/s → tối đa 9 900 B/s dù quay nhanh hơn (khi đó thiếu gói mỗi vòng)
        const bps = Math.min(SAMPLE_HZ / 4, 90 * (rpm / 60)) * 22;
        readout('uart', \`\${Math.round(bps)} B/s = \${Math.round((bps * 10 * 100) / 115200)} % của 115200\`);
        let st = '✓ Quét bình thường';
        if (step >= 0) st = '🔧 Đang tháo lắp — đã ngắt nguồn';
        else if (fault === 'truot-dai') st = '⚠ Đai trượt: tốc độ dao động ±35 % → bản đồ méo';
        else if (gpioDead) st = '💀 GPIO16 ESP32 hỏng (5 V vào chân 3.3 V) — mất dữ liệu';
        else if (fault === 'tx-5v') st = '⚠ 5 V đang vào chân RX 3.3 V…';
        else if (fault === 'nguon-yeu') st = '⚡ Sụt áp khi motor khởi động → ESP32 reset liên tục';
        else if (fault === 'nhin-laser') st = '⚠ Đầu quay đứng yên, laser vẫn bật — KHÔNG nhìn vào!';
        else if (rpm < 150) st = 'Đầu quay quá chậm / chưa quay';
        else if (fill < 0.98) st = \`⚠ Quay quá nhanh: chỉ \${Math.round(samplesPerRev)} mẫu/vòng < 360 → thiếu điểm\`;
        else if (view === 'close') st = 'Cận cảnh: tia laser → vật → thấu kính → vệt sáng trên CMOS';
        readout('state', st);
        const eO = Math.hypot(odo.x - rx, odo.z - rz), eL = Math.hypot(est.x - rx, est.z - rz);
        readout('errOdo', slam ? \`\${eO.toFixed(0)} mm · \${(Math.abs(wrapA(odo.th - hd)) / DEG).toFixed(1)}°\` : '—');
        readout('errLid', slam ? \`\${eL.toFixed(0)} mm · \${(Math.abs(wrapA(est.th - hd)) / DEG).toFixed(1)}°\` : '—');
        readout('match', slam ? matchPct : 0);
        if (!slam) slamMsg = p.mode === 'scan' ? 'Quét thô — không dựng bản đồ' : 'Chỉ chạy ở góc nhìn Cả căn phòng';
        else if (p.lidarOff || !laserOn) slamMsg = '⛔ Lidar tắt → không còn sửa sai, bóng xanh trôi theo odometry';
        else if (relocT > 0) slamMsg = '🔎 Mất định vị → đã tìm lại TOÀN CỤC trên bản đồ (kidnapped robot)';
        else if (p.mode === 'mapping') slamMsg = savedLoops ? \`💾 Đã lưu bản đồ (\${savedLoops} lần) — chuyển sang Định vị được rồi\` : \`🗺 Đang dựng bản đồ… \${Math.round(((s - sStart) / (2 * Math.PI)) * 100)} % quãng khám phá\`;
        else if (mismatch > 0.06) slamMsg = \`⚠ \${Math.round(mismatch * 100)} % điểm quét lệch bản đồ (chấm đỏ — đồ đạc đã dời?) → đang bảo trì bản đồ\`;
        else slamMsg = \`📍 Định vị trên bản đồ \${saved ? 'đã lưu' : 'dựng sẵn (chưa chạy mapping)'} — khớp tốt\`;
        readout('slam', slamMsg);
        return [Math.min(3.5, (view === 'room' ? lastD : realD) / 1000), rpmInst, pwm];
      },
    };
  },
};
`;export{n as default};
