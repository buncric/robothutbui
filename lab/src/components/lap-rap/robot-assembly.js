// 🤖 Robot hút bụi hoàn chỉnh — ghép mọi hệ thống: cơ khí, động lực, nguồn, điều khiển (PIC + ESP32), cảm biến.
// Ø350 × ~96 mm. Hệ trục robot: +x = phía trước, +z = bên PHẢI, y lên; sàn y = 0.
// Chạy thử: máy trạng thái giống firmware ESP32 (robot.cpp, chế độ AUTO phần va chạm-quay):
//   FWD (450 ‰) → va chạm/hố → BACKUP (−300 ‰, 60 mm) → TURN ngẫu nhiên 100–170° (va trái → quay phải) → FWD.
// Ngân sách dòng: bánh 2×0.3 A, chổi cuộn 0.6 A, chổi cạnh 2×0.1 A, quạt 0.1 + 2.9·(p)³ A, logic 5 V qua buck η ≈ 88 %.

import { cadAttach } from '../../core/cadParts.js';

const WHEEL_R = 35, BASE = 235, VMAX = 600;          // mm, mm, mm/s ở 1000 ‰
const SPEED_CRUISE = 450, SPEED_BACK = 300, BACKUP_MM = 60;
const ARENA = { x0: -800, x1: 800, z0: -600, z1: 600, drop: 150 };   // x1 = mép cầu thang
const CAP_AH = 2.6, R_PACK = 0.18;                   // 4S1P 18650 2600 mAh, điện trở trong cả khối (Ω)
const LAYER_GAP = 70;
const CLIFF_ANG = [70, 25, -25, -70].map((d) => (d * Math.PI) / 180);   // #1 trái … #4 phải (dương = bên trái)
const LAYERS = [['all', 'Tất cả'], ['co-khi', 'Cơ khí'], ['dong-luc', 'Động lực'], ['nguon', 'Nguồn'], ['dieu-khien', 'Điều khiển'], ['cam-bien', 'Cảm biến']];
const OCV = [[0, 3.0], [0.05, 3.3], [0.1, 3.45], [0.2, 3.56], [0.4, 3.68], [0.6, 3.8], [0.8, 3.95], [1, 4.2]];

export default {
  id: 'robot-assembly',
  name: 'Robot hút bụi hoàn chỉnh',
  category: 'lap-rap',
  order: 1,
  icon: '🤖',
  summary: 'Toàn bộ robot Ø350 mm ghép từ mọi linh kiện trong lab: vỏ, bánh, chổi, hộp bụi, quạt, pin 4S, bo PIC + ESP32, driver, cảm biến, lidar. Tách lớp, lọc theo hệ thống, chạy thử va chạm-quay, xem ngân sách dòng điện — và tháo robot gốc từng bước.',
  tags: ['robot', 'lắp ráp', 'tổng thể', 'exploded', 'tháo', 'mổ xác', 'dòng điện', 'thời gian chạy'],

  params: [
    { id: 'cad', label: '🧊 Mô hình CAD thật (lắp ráp đầy đủ)', type: 'toggle', value: true, hint: 'Tắt = mô hình học tự dựng (có thêm bo hạ áp, driver, MOSFET, IMU, dây điện)' },
    { id: 'explode', label: 'Tách lớp (exploded view)', type: 'range', min: 0, max: 1, step: 0.01, value: 0, unit: '' },
    { id: 'shell', label: 'Ẩn vỏ trên', type: 'toggle', value: false },
    { id: 'run', label: '▶ Chạy thử (va chạm-quay trong khu thử)', type: 'toggle', value: false },
    { id: 'layer', label: 'Chỉ hiện hệ thống', type: 'select', value: 'all', options: LAYERS },
    { id: 'fan', label: 'Công suất quạt hút (lệnh FAN)', type: 'range', min: 0, max: 100, step: 1, value: 70, unit: '%' },
    { id: 'soc', label: 'Dung lượng pin còn lại', type: 'range', min: 0, max: 100, step: 1, value: 85, unit: '%' },
  ],
  readouts: [
    { id: 'vbat', label: 'Điện áp pin (đã trừ sụt áp tải)', unit: 'V' },
    { id: 'pct', label: 'Pin % (công thức firmware)', unit: '%' },
    { id: 'itot', label: 'Dòng tổng từ pin', unit: 'A' },
    { id: 'budget', label: 'Chia dòng (A)', unit: '' },
    { id: 'pw', label: 'Công suất', unit: 'W' },
    { id: 'runtime', label: 'Ước tính thời gian chạy', unit: 'phút' },
    { id: 'state', label: 'Trạng thái (ESP32 / PIC)', unit: '' },
  ],
  scope: {
    window: 8,
    note: '(thời gian thực)',
    channels: [
      { name: 'Dòng tổng từ pin', unit: 'A', min: 0, max: 16, color: '#ffd34d' },
      { name: 'Lệnh bánh trái', unit: '‰', min: -1000, max: 1000, color: '#4cc2ff' },
      { name: 'Lệnh bánh phải', unit: '‰', min: -1000, max: 1000, color: '#ff6b9a' },
    ],
  },

  steps: [
    { title: 'Bước 1 — Chuẩn bị, tắt nguồn, chụp ảnh', text: 'Robot gốc còn nguyên (bên trong là <b>bo mạch gốc</b>). Tắt công tắc, rút khỏi dock. Dụng cụ: tua vít PH1 + PH2 (đầu dài), que nạy nhựa (spudger), khay nhiều ngăn + bút dạ, điện thoại để chụp ảnh, đồng hồ vạn năng. Chụp 4 mặt robot trước khi tháo.' },
    { title: 'Bước 2 — Lật robot, tháo PIN TRƯỚC TIÊN', text: 'Lật ngửa trên khăn mềm (đừng đè lên đầu lidar). Tháo 2 vít nắp khoang pin, rút giắc pin rồi nhấc khối pin ra. <b>Luôn tháo pin trước mọi việc khác</b>: pin 4S chập qua tua vít có thể cho dòng &gt; 50 A — tóe lửa, cháy. Dán băng keo cách điện lên giắc pin.' },
    { title: 'Bước 3 — Tháo chổi cạnh, bánh xoay, chổi cuộn', text: 'Chổi cạnh: 1 vít PH1 mỗi cái. Bánh xoay: nạy thẳng ra (cài khớp). Nắp chặn chổi cuộn: bóp 2 lẫy, nhấc chổi cuộn ra. Gỡ tóc quấn ở 2 đầu chổi — nguyên nhân hàng đầu làm động cơ chổi quá dòng.' },
    { title: 'Bước 4 — Tháo hộp bụi', text: 'Bấm lẫy, kéo hộp bụi về phía sau. Gõ sạch bụi, giũ lọc HEPA (không rửa nước lọc giấy). Kiểm tra gioăng cao su kín khí — hở là mất lực hút.' },
    { title: 'Bước 5 — Tìm và tháo vít giấu', text: 'Vỏ dưới có 8–14 vít PT 3×12. Nhiều con <b>giấu dưới nhãn dán, chân đệm cao su, trong hốc bánh</b> (chúng phát sáng trong mô hình). Dùng ngón tay miết nhãn để tìm lỗ lõm, lột chân cao su bằng que nạy. Xếp vít theo vị trí vào khay — vít dài lắp nhầm lỗ nông sẽ đâm thủng vỏ.' },
    { title: 'Bước 6 — Lật lại, nhấc vỏ trên + bumper', text: 'Lật robot lại. Nạy nhẹ quanh khe vỏ từ phía sau ra trước (lẫy nhựa giòn — đừng bẻ mạnh). Nhấc vỏ trên <b>từ từ</b>: còn dây nút bấm/ loa/ cảm biến nối xuống — chụp ảnh rồi rút giắc. Bumper thường đi cùng vỏ trên; chú ý 2 công tắc bumper và lò xo hồi bumper.' },
    { title: 'Bước 7 — Tháo đầu lidar', text: 'Tháo 3–4 vít đế lidar, rút giắc dữ liệu 4 chân + giắc motor 2 chân. Cầm đế, không cầm đầu quay. Cất riêng, đậy che bụi cửa sổ.' },
    { title: 'Bước 8 — Chụp ảnh, ghi nhãn, rút các giắc', text: 'Chụp cận bo mạch gốc với mọi giắc đang cắm. Dán nhãn từng giắc (bánh trái, bánh phải, chổi, quạt, cliff, bumper, nhấc bánh, sạc). Rút bằng cách bóp lẫy và kéo thân giắc — <b>không kéo dây</b>. Đo và ghi lại: điện trở động cơ, mức logic công tắc (đóng khi nào?), sơ đồ dây encoder (5 V/GND/OUT).' },
    { title: 'Bước 9 — Tháo 2 module bánh xe', text: 'Mỗi module 2–3 vít. Nhấc lên, lò xo treo bánh bật nhẹ. Module có sẵn: động cơ + hộp số + encoder Hall + công tắc nhấc bánh. Thử: cấp 5–7 V vào động cơ, quay tay bánh 10 vòng đếm xung encoder (xem linh kiện Encoder Hall).' },
    { title: 'Bước 10 — Tháo quạt hút và bo cảm biến chống rơi', text: 'Quạt hút: 2–4 vít + ống gió có gioăng. Ghi lại kiểu quạt (BLDC 3–4 dây có driver tích hợp, hay chổi than 2 dây). Bo cliff: thường là các bo nhỏ ở mép trước, giữ bằng vít/ ngàm — kiểm tra bằng camera điện thoại xem LED IR còn sáng.' },
    { title: 'Bước 11 — Tháo bo mạch gốc', text: 'Tháo vít, nhấc bo gốc ra. Giữ lại: có thể tham khảo mạch sạc, đo chân giắc. <b>Không vứt</b> cho tới khi robot mới chạy ổn. Kiểm tra khung: cột nhựa nào toét ren thì dùng vít to hơn một cỡ hoặc keo + ốc cấy.' },
    { title: 'Bước 12 — Lắp bo PIC + ESP32 + driver của bạn', text: 'Bắt bo PIC16F877A, ESP32-S3, 2 DRV8871, buck XL4015, BSS138, MOSFET, MPU6050 lên <b>cột đồng M3</b> (cách điện với khung). Đi dây theo docs/01: nguồn hình sao về cực âm pin, cầu chì 10 A ngay sau pin, tụ 1000 µF ở đầu mỗi driver, tụ 100 nF hai cực mỗi động cơ. Kiểm tra thông mạch/ chập 14.4 V–GND bằng đồng hồ <b>trước</b> khi cắm pin.' },
    { title: 'Bước 13 — Lắp lại & chạy thử', text: 'Lắp ngược thứ tự: quạt, cliff → bánh → giắc → lidar → vỏ trên + bumper → vít → hộp bụi → chổi → <b>pin cuối cùng</b>. Lần đầu: kê robot cho bánh không chạm sàn, cấp nguồn qua nguồn bàn giới hạn dòng 1 A, nạp firmware, thử từng động cơ (BOOT_MOTOR_SELFTEST), bấm thử bumper, nhấc bánh, che cliff. Rồi mới bật "Chạy thử".' },
  ],

  faults: [
    { id: 'nguoc-pin', label: 'Cắm ngược cực pin vào bo của bạn (chưa có cầu chì)', severity: 'no',
      what: '<p>Tiếng "bụp", tụ hóa đầu vào mạch hạ áp <b>phồng/ nổ tung</b>, khói trắng mùi khét từ XL4015 và 2 DRV8871. Bo PIC/ESP32 tắt ngóm. Dòng vọt lên hàng chục ampe trong tích tắc.</p>',
      why: '<p>Hầu hết IC công suất có <b>diode ký sinh</b> (body diode) từ GND lên nguồn. Đảo cực: pin 14.4 V gặp các diode này phân cực thuận → gần như chập mạch, chỉ còn điện trở dây và pin (~0.2–0.4 Ω) → <code>I ≈ 14.4/0.3 ≈ 50 A</code>. Tụ hóa bị phân cực ngược → điện phân sinh khí → phồng/nổ. Diode và đường mạch nhỏ cháy đứt.</p>',
      fix: '<p>Cầu chì 10 A ngay sau pin (docs/01) + <b>bảo vệ ngược cực</b>: diode Schottky nối tiếp (mất ~0.4 V) hoặc P-MOSFET lý tưởng (gần như không mất áp). Đầu nối có khóa chỉ cắm được 1 chiều (XT30/XT60), dây đỏ/đen rõ ràng. Đã nổ: tháo pin ngay, thay tụ, kiểm tra từng IC.</p>' },
    { id: 'nhieu-dong-co', label: 'Không hàn tụ chống nhiễu cho động cơ', severity: 'loi',
      what: '<p>Robot chạy được vài giây thì <b>giật cục, dừng khựng</b> rồi chạy tiếp theo hướng lạ — đi lung tung, mất hướng. Log ESP32: <code>E,PIC_LOST</code>, LED trạng thái PIC chớp lại như vừa khởi động.</p>',
      why: '<p>Chổi than đánh lửa + PWM 20 kHz tạo xung nhiễu vài chục volt lan theo dây nguồn/ GND tới PIC → sụt áp/ gai ở chân MCLR → <b>PIC reset</b>: động cơ dừng, bộ đếm encoder về 0. ESP32 thấy enc nhảy từ hàng nghìn về 0 → odometry sai → tưởng mình đã quay → bẻ lái sai.</p>',
      fix: '<p>Tụ gốm 100 nF hai cực MỖI động cơ (+ 2 tụ 47 nF ra vỏ nếu cần), tụ 1000 µF đầu nguồn driver, buck riêng cho logic, tụ 100 nF sát VDD PIC và MCLR, dây động cơ xoắn đôi, đi xa dây tín hiệu. ESP32 nên phát hiện PIC vừa reset (enc về 0, cờ) và reset odometry thay vì tin số liệu nhảy.</p>' },
    { id: 'quen-gnd', label: 'Quên nối GND chung giữa nguồn logic và PIC/ESP32', severity: 'loi',
      what: '<p>Bấm chạy nhưng robot <b>đứng im</b>, chổi không quay. App báo PIC mất liên lạc (cờ bit1). Đo UART thấy toàn rác. Có lúc mạch chuyển mức BSS138 ấm lên.</p>',
      why: '<p>Điện áp luôn đo <b>giữa 2 điểm</b>: mức 3.3 V của ESP32 chỉ có nghĩa so với GND của ESP32. Không chung GND, PIC "thấy" tín hiệu lơ lửng → byte sai checksum → bỏ khung → sau 300 ms không có khung DRIVE hợp lệ, PIC <b>tự dừng động cơ</b> (phản xạ an toàn). Dòng hồi về lại tìm đường qua dây tín hiệu.</p>',
      fix: '<p>Nối GND hình sao: mọi khối (pin −, buck, driver, PIC, ESP32, cảm biến) về một điểm ở cực âm pin bằng dây đủ to. Kiểm tra bằng đồng hồ: GND PIC ↔ GND ESP32 = 0 Ω.</p>' },
    { id: 'quat-ket', label: 'Quạt hút kẹt (tóc/ túi nilon) — không có cầu chì, dây mảnh', severity: 'chay',
      what: '<p>Tiếng quạt tắt, dòng tổng vọt lên ~12 A. Sau vài giây <b>dây quạt nóng đỏ, vỏ dây chảy, bốc khói</b>, có thể bắt lửa vào bụi trong hộp bụi.</p>',
      why: '<p>Động cơ đứng yên không có sức phản điện động → dòng chỉ bị giới hạn bởi điện trở cuộn dây: ~14.4/1.2 ≈ 12 A. Dây AWG26 (0.13 mm², ~0.13 Ω/m) tiêu tán <code>P = I²R ≈ 12² × 0.13 ≈ 19 W/m</code> → vượt 100 °C trong vài giây, PVC chảy ở ~105 °C.</p>',
      fix: '<p>Cầu chì 10 A tổng + cầu chì/ PTC riêng cho quạt (~4–5 A); dây quạt ≥ AWG20; firmware đo dòng hoặc tốc độ quạt (chân FG → GPIO5): lệnh chạy mà FG = 0 → tắt quạt, báo lỗi. Quạt BLDC có driver tích hợp thường tự ngắt khi kẹt.</p>' },
    { id: 'mat-nhac-banh', label: 'Đứt dây công tắc nhấc bánh — nhấc robot lên', severity: 'hong',
      what: '<p>Nhấc robot lên mà <b>2 bánh vẫn quay tít, chổi vẫn chạy</b>. Ngón tay/ tóc/ dây áo có thể bị cuốn vào bánh và chổi.</p>',
      why: '<p>Công tắc nhấc bánh đấu kiểu "đóng = 0" với trở kéo lên: đứt dây → chân RB1/RB2 luôn = 1 → PIC tưởng bánh vẫn chạm sàn → không kích hoạt phản xạ "dừng hết khi bị nhấc". Không cảm biến nào khác báo được việc này.</p>',
      fix: '<p>Đấu sao cho <b>đứt dây = trạng thái an toàn</b> (fail-safe): chọn chân NC của công tắc hoặc đổi <code>DROP_ACTIVE_LEVEL</code> cho khớp. Kiểm tra trước mỗi lần chạy thử: nhấc robot → app phải báo <code>E,LIFTED</code>, bánh dừng ngay.</p>' },
    { id: 'tat-cliff', label: 'Tắt cảm biến chống rơi khi test rồi quên bật lại', severity: 'hong',
      what: '<p>Robot chạy thẳng ra mép cầu thang và <b>lao xuống</b>: va đập, bung nắp hộp bụi, gãy bánh xoay, có thể nứt vỏ/ hỏng pin.</p>',
      why: '<p>Khi test trên bàn, người ta hay gửi lệnh <code>SAFETY</code> xóa bit1 hoặc đặt <code>CLIFF_ENABLE_MASK = 0</code> để robot khỏi dừng. PIC khi đó không còn phản xạ "hố → cấm tiến", còn ESP32 không nhận được bit cliff → không lùi.</p>',
      fix: '<p>Mặc định luôn bật (0x07); chỉ tắt bằng lệnh có thời hạn, tự bật lại khi khởi động lại; app hiển thị cảnh báo đỏ khi phản xạ an toàn đang tắt. Test ở sàn có rào chắn.</p>' },
  ],

  info: {
    overview: `
      <p>Đây là robot hút bụi của dự án sau khi "độ": giữ lại phần cơ khí của robot cũ (vỏ, module bánh, chổi, hộp bụi, quạt, cảm biến) và thay bo mạch gốc bằng <b>PIC16F877A (tủy sống)</b> + <b>ESP32-S3 (bộ não)</b>. Rê chuột lên bất kỳ bộ phận nào, bấm để ghim — mỗi bộ phận có liên kết <b>"Xem chi tiết →"</b> tới bài học riêng.</p>
      <p>Thử: kéo <b>Tách lớp</b> để các tầng bay lên; chọn <b>Chỉ hiện hệ thống → Cảm biến</b>; bật <b>Chạy thử</b> và theo dõi dòng điện + thời gian chạy; đẩy quạt lên 100 % xem thời gian chạy tụt bao nhiêu. Dùng ◀ ▶ ở mục <b>Tháo lắp từng bước</b> để mổ robot gốc và lắp bo của bạn vào. Mục <b>Thử lắp sai</b> cho thấy hậu quả thật của các lỗi hay gặp.</p>`,
    specs: [
      ['Kích thước', 'Ø350 × 96 mm (vỏ 80 mm + đầu lidar), nặng ~3 kg'],
      ['Bánh', '2 bánh chủ động Ø70 mm, cách nhau 235 mm, động cơ DC + hộp số + encoder Hall; 1 bánh xoay phía trước'],
      ['Tốc độ', '1000 ‰ ≈ 0.6 m/s; đi thường 450 ‰ ≈ 0.27 m/s; lùi 300 ‰'],
      ['Làm sạch', 'Chổi cuộn 170 mm, 2 chổi cạnh, quạt hút BLDC 14.4 V (~30–40 W ở 100 %), hộp bụi + lọc HEPA'],
      ['Pin', '4S1P Li-ion 18650: 14.4 V danh định (12.0–16.8 V), 2600 mAh ≈ 37 Wh, BMS 4S, cầu chì 10 A'],
      ['Logic', 'Buck XL4015 → 5 V/3 A: PIC16F877A, ESP32-S3 (qua LDO 3.3 V), cảm biến, lidar'],
      ['Điều khiển', 'PIC: PWM 2 bánh, encoder, bumper, cliff, nhấc bánh, đo pin, MOSFET chổi · ESP32: BLE app, thuật toán đi, IMU, quạt, lidar'],
      ['Cảm biến', '2 encoder Hall, 4 cliff IR, 2 bumper, 2 công tắc nhấc bánh, MPU6050, lidar LDS (giai đoạn sau)'],
      ['Ngân sách dòng (quạt 70 %)', 'bánh 2×0.3 + chổi cuộn 0.6 + chổi cạnh 0.2 + quạt ~1.1 + logic&lidar ~0.25 ≈ <b>2.7 A</b> → ~45–50 phút'],
    ],
    principle: `
      <h4>1. Kiến trúc 2 bộ điều khiển</h4>
      <p><b>ESP32-S3</b> (3.3 V) quyết định <i>đi đâu</i>: BLE với app, chế độ AUTO/SPIRAL/ZIGZAG, odometry + con quay, quạt hút. Gửi lệnh <code>DRIVE</code> 20 lần/s qua UART 19200 (qua BSS138) xuống <b>PIC16F877A</b> (5 V) — PIC lo <i>đi thế nào cho an toàn</i>: PWM 20 kHz cho 2 DRV8871, đếm encoder, đọc bumper/ cliff/ nhấc bánh/ pin, và tự dừng nếu mất lệnh 300 ms.</p>
      <h4>2. Ngân sách dòng & thời gian chạy</h4>
      <p><code>I<sub>tổng</sub> = I<sub>bánh</sub> + I<sub>chổi</sub> + I<sub>quạt</sub> + P<sub>logic</sub>/(V<sub>pin</sub>·η)</code>. Quạt có công suất ∝ tốc độ³ nên <code>I<sub>quạt</sub> ≈ 0.1 + 2.9·p³</code> (p = 0…1): 70 % → 1.1 A, 100 % → 3 A.</p>
      <p><code>t ≈ C × SOC × 0.9 / I<sub>tổng</sub></code> (0.9: không xả cạn để giữ tuổi thọ pin). 2.6 Ah, 85 %, 2.7 A → ~49 phút.</p>
      <p>Sụt áp: <code>V = V<sub>hở mạch</sub> − I·R<sub>trong</sub></code> (R ≈ 0.18 Ω cả khối). Pin yếu thì sụt áp càng làm chạm ngưỡng <code>VBAT_LOW_MV = 13200</code> sớm hơn.</p>
      <h4>3. Hành vi va chạm-quay (AUTO, robot.cpp)</h4>
      <ul><li><b>FWD</b>: hai bánh 450 ‰, giữ hướng.</li><li>Bumper/ cliff → <b>BACKUP</b>: lùi 300 ‰ đủ 60 mm.</li><li><b>TURN</b>: quay tại chỗ 100–170° ngẫu nhiên; va trái → quay phải, va phải → quay trái. Tốc độ quay ‰ = 600 × sai số (rad), kẹp 160–380 ‰.</li></ul>
      <p>Kinematics vi sai: <code>v = (v<sub>L</sub>+v<sub>R</sub>)/2</code>, <code>ω = (v<sub>R</sub>−v<sub>L</sub>)/L</code>, L = 235 mm.</p>`,
    inRobot: `
      <p>Bản đồ đi dây (theo <code>docs/01_KIEN_TRUC_VA_SO_DO_CHAN.md</code>):</p>
      <ul>
        <li><b>Nguồn</b>: Pin 4S → cầu chì 10 A → công tắc → VBAT: 2× DRV8871 (tụ 1000 µF mỗi cái), quạt BLDC, MOSFET IRLZ44N chổi cuộn (RD5) & chổi cạnh (RD6) + diode SS34; VBAT → XL4015 → 5 V logic.</li>
        <li><b>Bánh</b>: CCP1 (RC2, chân 17) → DRV trái IN1, RD0 → IN2; CCP2 (RC1, chân 16) → DRV phải IN1, RD2 → IN2. Encoder trái → RA4/T0CKI, phải → RC0/T1CKI.</li>
        <li><b>Cảm biến PIC</b>: bumper RB4/RB5, nhấc bánh RB1/RB2, cliff AN1–AN4 (LED chung RD4), pin AN0 (phân áp 33k/10k), nút START RB0.</li>
        <li><b>UART</b>: PIC RC6/TX → BSS138 → ESP32 GPIO18; ESP32 GPIO17 → BSS138 → PIC RC7/RX.</li>
        <li><b>ESP32</b>: quạt PWM GPIO4 (FG GPIO5), MPU6050 SDA/SCL GPIO8/9, lidar TX → GPIO16, motor lidar PWM GPIO15, nút BOOT GPIO0.</li>
        <li>Firmware: <code>firmware/pic16f877a_ccs/</code> (CCS C) và <code>firmware/esp32s3/</code> (PlatformIO). App Flutter qua BLE "RoboVac-PIC".</li>
      </ul>`,
    mistakes: `
      <ul>
        <li>Tháo lắp khi chưa rút pin → chập tua vít qua mạch 14.4 V.</li>
        <li>Không chụp ảnh/ ghi nhãn giắc → lắp nhầm bánh trái/phải, đảo chiều encoder.</li>
        <li>Lấy 5 V cho logic từ driver động cơ, hoặc không chung GND → reset ngẫu nhiên, UART rác.</li>
        <li>Không có cầu chì; dây quạt/ chổi quá mảnh.</li>
        <li>Vít dài lắp vào lỗ nông → thủng vỏ trên, chạm cell pin.</li>
        <li>Quên bật lại phản xạ an toàn (cliff/ bumper/ nhấc bánh) sau khi test trên bàn.</li>
        <li>Chạy thử lần đầu trên sàn thay vì kê bánh lên → robot lao đi khi firmware sai chiều động cơ.</li>
      </ul>`,
    quiz: [
      { q: 'Quạt 70 % kéo ~1.1 A, bánh 2×0.3 A, chổi cuộn 0.6 A, chổi cạnh 0.2 A, logic 0.25 A. Pin 2600 mAh còn 100 %, dùng 90 %. Chạy được bao lâu?', a: 'I ≈ 2.75 A → t ≈ 2.6 × 0.9 / 2.75 ≈ 0.85 h ≈ 51 phút.' },
      { q: 'Vì sao phải tháo pin trước tiên khi mổ robot?', a: 'Pin 4S có thể cấp hàng chục ampe; tua vít kim loại chạm nhầm 2 điểm của mạch 14.4 V sẽ chập mạch, tóe lửa, cháy bo hoặc pin. Không có pin thì mọi thao tác an toàn.' },
      { q: 'Bumper trái bị chạm. Firmware ESP32 (AUTO) phản ứng thế nào, PIC làm gì?', a: 'PIC lập tức ép mọi tốc độ dương về 0 (chỉ cho lùi/ quay). ESP32 nhận bit bump → BACKUP lùi 60 mm → TURN quay PHẢI 100–170° (góc âm) → FWD.' },
    ],
  },

  build(ctx) {
    const { THREE, MAT, geom, label, readout, fx, viewer } = ctx;
    const { mesh, group, part, cyl, box, lathe, arcSector, springGeometry, helixThread, wire } = geom;
    const root = new THREE.Group();
    const cats = [];        // nút có userData.cat để lọc theo hệ thống
    const pieces = [];      // chi tiết di chuyển khi tháo lắp
    const P = (obj, name, desc, link, cat) => {
      part(obj, name, `${desc} <a href="#/c/${link}">Xem chi tiết →</a>`);
      obj.userData.cat = cat;
      cats.push(obj);
      return obj;
    };
    // off: dời đi khi tháo (tọa độ thân robot); off2: chỗ đặt trên sàn cạnh robot khi robot KHÔNG lật (chi tiết gầm)
    const piece = (obj, off, removed, { hide = false, off2 = null, startHidden = false } = {}) => {
      pieces.push({ obj, home: obj.position.clone(), off: new THREE.Vector3(...off), off2: off2 && new THREE.Vector3(...off2), removed, hide, curV: new THREE.Vector3(), arrived: startHidden });
      if (startHidden) obj.visible = false;
      return obj;
    };
    const m4 = new THREE.Matrix4();
    const inst = (geo, mat, pts) => {
      const im = new THREE.InstancedMesh(geo, mat, pts.length);
      pts.forEach(([x, y, z], i) => { m4.makeTranslation(x, y, z); im.setMatrixAt(i, m4); });
      im.castShadow = true; im.receiveShadow = true;
      im.computeBoundingBox(); im.computeBoundingSphere();
      return im;
    };
    const R = (s0, s1) => (s) => s >= s0 && s <= s1;     // "đang bị tháo" trong khoảng bước s0..s1

    // ---------- cây đối tượng: robot (di chuyển) → pivot (lật) → body → 6 tầng ----------
    const robot = new THREE.Group();
    root.add(robot);
    const pivot = new THREE.Group();
    pivot.position.y = 48;
    robot.add(pivot);
    const body = new THREE.Group();
    body.position.y = -48;
    pivot.add(body);
    const L = [0, 1, 2, 3, 4, 5].map(() => { const g = new THREE.Group(); body.add(g); return g; });

    // ---------- vật liệu/hình dùng lại ----------
    const tireGeo = cyl(WHEEL_R, WHEEL_R, 20, 40); tireGeo.rotateX(Math.PI / 2);
    const hubGeo = cyl(22, 22, 21, 24); hubGeo.rotateX(Math.PI / 2);
    const spokeGeo = box(44, 5, 21.6);
    const motorGeo = cyl(12, 12, 32, 24); motorGeo.rotateX(Math.PI / 2);
    const resGeo = box(6, 2, 2, 0.6);
    const resMat = new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 0.6 });
    const capMat = new THREE.MeshStandardMaterial({ color: 0xb08850, roughness: 0.6 });
    const elecMat = new THREE.MeshStandardMaterial({ color: 0x1d2a55, roughness: 0.45 });
    const bristleMat = new THREE.MeshStandardMaterial({ color: 0x3a6b4a, roughness: 0.9 });
    const termMat = new THREE.MeshStandardMaterial({ color: 0x2b6fd6, roughness: 0.5 });
    const pinGeo = box(0.6, 3, 0.6);

    // ======================= TẦNG 0 — GẦM: bánh, bánh xoay, chổi, cliff =======================
    const wheelSpin = [];
    const wheelLift = [];
    [-1, 1].forEach((s) => {
      const zc = s * BASE / 2;
      const mod = new THREE.Group();
      mod.position.set(0, 0, zc);
      L[0].add(mod);
      const spin = new THREE.Group();
      spin.position.y = WHEEL_R;
      const tire = mesh(tireGeo, MAT.rubber);
      const hub = mesh(hubGeo, MAT.plasticGrey);
      const spokes = [0, 1, 2].map((k) => mesh(spokeGeo, MAT.plasticDark, { rz: (k * Math.PI) / 3 }));
      spin.add(tire, hub, ...spokes);
      const lift = new THREE.Group();
      lift.add(spin);
      mod.add(P(lift, `Bánh xe ${s < 0 ? 'TRÁI' : 'PHẢI'} Ø70 mm`, 'Lốp cao su gai, bám sàn. Quãng đường mỗi vòng π×70 ≈ 220 mm.', 'banh-xe', 'co-khi'));
      wheelSpin.push(spin); wheelLift.push(lift);
      const gb = mesh(box(90, 30, 22, 3), MAT.plasticDark, { x: -10, y: 45, z: -s * 24 });
      mod.add(P(gb, 'Hộp số module bánh', 'Giảm tốc ~1:60–1:100, tăng mô-men để kéo robot 3 kg leo thảm.', 'hop-so', 'co-khi'));
      const mot = mesh(motorGeo, MAT.steel, { x: -40, y: 50, z: -s * 51 });
      mod.add(P(mot, `Động cơ bánh ${s < 0 ? 'trái' : 'phải'}`, 'DC chổi than 14.4 V, nhận PWM 20 kHz từ DRV8871. Nên có tụ 100 nF hai cực.', 'dong-co-dc', 'dong-luc'));
      const enc = group(mesh(cyl(8, 8, 3, 20), MAT.magnetN, { x: -40, y: 50, z: -s * 68.5, rx: Math.PI / 2 }), mesh(box(12, 14, 1.2), MAT.pcbGreen, { x: -40, y: 62, z: -s * 71 }));
      mod.add(P(enc, `Encoder Hall bánh ${s < 0 ? 'trái → RA4/T0CKI' : 'phải → RC0/T1CKI'}`, 'Vòng nam châm nhiều cực trên đuôi trục động cơ + IC Hall: ~1000 xung/vòng bánh.', 'encoder-hall', 'cam-bien'));
      const spr = mesh(springGeometry({ radius: 4, wire: 0.6, turns: 7, length: 22 }), MAT.steel, { x: 30, y: 60, z: -s * 24 });
      mod.add(P(spr, 'Lò xo treo bánh', 'Ép bánh xuống sàn để bám; nhấc robot thì bánh tụt xuống, kích công tắc nhấc bánh.', 'lo-xo', 'co-khi'));
      const dsw = group(mesh(box(12.8, 6.5, 5.8, 0.4), MAT.plasticBlack, { x: 25, y: 70, z: -s * 10 }), mesh(box(10, 0.4, 3), MAT.steel, { x: 28, y: 73.6, z: -s * 10, rz: -0.12 }));
      mod.add(P(dsw, `Công tắc nhấc bánh ${s < 0 ? 'trái → RB1' : 'phải → RB2'}`, 'Microswitch: bánh tụt xuống khi robot bị nhấc → PIC dừng mọi động cơ ngay.', 'cong-tac-hanh-trinh', 'cam-bien'));
      piece(mod, [0, 60, s * 160], R(8, 11));
    });

    // bánh xoay
    const caster = new THREE.Group();
    caster.position.set(125, 0, 0);
    L[0].add(caster);
    const swivel = new THREE.Group();
    caster.add(swivel);
    const cw = mesh(cyl(12, 12, 10, 20), MAT.plasticDark, { x: -4, y: 12, rx: Math.PI / 2 });
    const fork = mesh(box(14, 10, 14), MAT.plasticGrey, { y: 24 });
    swivel.add(cw, fork);
    P(swivel, 'Bánh xoay đa hướng (caster)', 'Bánh phụ phía trước, tự xoay theo hướng đi. Có vân để encoder quang của robot gốc biết robot có thật sự di chuyển.', 'banh-xoay', 'co-khi');
    piece(caster, [0, -50, 0], R(2, 11), { off2: [0, -2, 330] });

    // chổi cuộn + nắp chặn + động cơ
    const brushP = new THREE.Group();
    brushP.position.set(55, 17, 0);
    L[0].add(brushP);
    const brushSpin = new THREE.Group();
    brushP.add(brushSpin);
    const bCore = new THREE.Group();
    bCore.rotation.x = Math.PI / 2;
    bCore.add(mesh(cyl(8, 8, 170, 20), MAT.plasticYellow));
    bCore.add(mesh(helixThread({ radius: 10.5, pitch: 170, turns: 1, tube: 2.4, y0: 85 }), bristleMat));
    bCore.add(mesh(helixThread({ radius: 10.5, pitch: 170, turns: 1, tube: 2.4, y0: 85 }), MAT.rubber, { ry: Math.PI }));
    bCore.add(mesh(cyl(9.5, 9.5, 6, 20), MAT.plasticDark, { y: 88 }), mesh(cyl(9.5, 9.5, 6, 20), MAT.plasticDark, { y: -88 }));
    brushSpin.add(bCore);
    P(brushSpin, 'Chổi cuộn 170 mm (lông + gân cao su)', 'Quay ~1000–1500 vòng/phút hất bụi vào miệng hút. Tóc quấn 2 đầu làm kẹt → dòng tăng vọt.', 'choi-cuon', 'co-khi');
    piece(brushP, [0, -80, 0], R(2, 11), { off2: [-55, -6, 300] });
    const guardMat = MAT.plasticGrey.clone(); guardMat.transparent = true; guardMat.opacity = 0.45;
    const guard = mesh(box(60, 2, 184), guardMat, { x: 55, y: 7 });
    L[0].add(P(guard, 'Nắp chặn chổi cuộn', 'Khung lưới giữ chổi, có 2 lẫy bóp để tháo.', 'choi-cuon', 'co-khi'));
    piece(guard, [0, -35, 0], R(2, 11), { off2: [-55, -6, 380] });
    const bMotor = mesh(motorGeo, MAT.steel, { x: 55, y: 30, z: -108 });
    L[0].add(P(bMotor, 'Động cơ chổi cuộn → MOSFET IRLZ44N (RD5)', 'DC 14.4 V ~0.6 A, kẹt tóc có thể tới 5–7 A. Điều khiển bật/tắt qua MOSFET + diode SS34.', 'dong-co-dc', 'dong-luc'));

    // chổi cạnh ×2
    const sideSpin = [];
    const armGeo = cyl(0.8, 3, 72, 8); armGeo.translate(0, 36, 0); armGeo.rotateZ(-Math.PI / 2 + 0.12);
    [-1, 1].forEach((s) => {
      const sp = new THREE.Group();
      sp.position.set(120, 6, s * 125);
      L[0].add(sp);
      const spin = new THREE.Group();
      sp.add(spin);
      spin.add(mesh(cyl(10, 10, 6, 20), MAT.plasticDark));
      for (let k = 0; k < 3; k++) spin.add(mesh(armGeo, bristleMat, { ry: (k * 2 * Math.PI) / 3 }));
      P(spin, `Chổi cạnh ${s < 0 ? 'trái' : 'phải'}`, '3 chùm lông quét bụi ở góc tường vào giữa đường chổi cuộn. 1 vít PH1.', 'choi-canh', 'co-khi');
      const sm = mesh(cyl(6, 6, 20, 16), MAT.steel, { y: 16 });
      sp.add(P(sm, 'Động cơ chổi cạnh (N20 có hộp số) → MOSFET (RD6)', 'Nhỏ, ~0.1 A, chỉ cần bật/tắt.', 'dong-co-dc', 'dong-luc'));
      sideSpin.push(spin);
      piece(sp, [0, -60, 0], R(2, 11), { off2: [-250, -4, s * 160] });
    });

    // cảm biến chống rơi ×4
    const cliffG = new THREE.Group();
    L[0].add(cliffG);
    const cliffHouse = box(14, 10, 24, 1.5);
    const cliffWin = box(10, 0.6, 18);
    const winMat = new THREE.MeshStandardMaterial({ color: 0x501018, roughness: 0.2 });
    CLIFF_ANG.forEach((a, i) => {
      const g = group(mesh(cliffHouse, MAT.plasticBlack, { y: 15 }), mesh(cliffWin, winMat, { y: 9.7 }));
      g.position.set(155 * Math.cos(a), 0, -155 * Math.sin(a));
      g.rotation.y = a;
      cliffG.add(P(g, `Cảm biến chống rơi #${i + 1} → AN${i + 1}`, `LED IR + phototransistor nhìn xuống sàn (${['trái', 'trước-trái', 'trước-phải', 'phải'][i]}). LED bật chung bằng RD4.`, 'cliff-ir', 'cam-bien'));
    });
    piece(cliffG, [0, 120, 0], R(9, 11));

    // ======================= TẦNG 1 — VỎ DƯỚI, BUMPER, SẠC, VÍT =======================
    const shellMat = MAT.plasticDark.clone(); shellMat.side = THREE.DoubleSide;
    const bottom = mesh(lathe([[0, 8], [166, 8], [172, 10], [174, 16], [174, 40], [171, 40]], 64), shellMat);
    L[1].add(P(bottom, 'Vỏ dưới (khung đáy)', 'Nhựa ABS dày 2–2.5 mm có gân và cột vít. Mọi module bắt vào đây.', 'vo-khung', 'co-khi'));
    const bcover = mesh(box(84, 2, 76, 1), MAT.plasticGrey, { x: -15, y: 7 });
    L[1].add(P(bcover, 'Nắp khoang pin (2 vít)', 'Mở từ mặt dưới — tháo pin là việc ĐẦU TIÊN khi mổ robot.', 'pack-4s-bms', 'nguon'));
    piece(bcover, [0, -45, 0], R(1, 11), { off2: [60, -6, -300] });
    const screwPts = [];
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 + 0.3; screwPts.push([150 * Math.cos(a), 6.8, -150 * Math.sin(a)]); }
    const screwMat = MAT.zinc.clone();
    const screws = inst(cyl(2.8, 2.8, 2, 16), screwMat, screwPts);
    L[1].add(P(screws, 'Vít PT 3×12 giữ vỏ (10 con)', 'Vít tự ren vào cột nhựa. 2 con giấu dưới chân đệm cao su, có con dưới nhãn dán.', 'oc-vit', 'co-khi'));
    piece(screws, [0, -30, 0], R(4, 11), { off2: [430, -5, 0] });
    const feet = group(...[0, 5].map((k) => mesh(cyl(5, 5, 2.4, 16), MAT.rubber, { x: screwPts[k][0], y: 5.6, z: screwPts[k][2] })));
    L[1].add(P(feet, 'Chân đệm cao su (che vít giấu)', 'Lột bằng que nạy, dán lại bằng keo 2 mặt sau khi lắp.', 'oc-vit', 'co-khi'));
    piece(feet, [0, -50, 0], R(4, 11), { off2: [430, -4, 0] });
    const charge = group(mesh(box(10, 1.2, 14), MAT.brass, { x: 150, y: 7.5, z: -25 }), mesh(box(10, 1.2, 14), MAT.brass, { x: 150, y: 7.5, z: 25 }), mesh(cyl(4, 4, 8, 16), MAT.plasticBlack, { x: -168, y: 30, z: -60, rz: Math.PI / 2 }));
    L[1].add(P(charge, 'Tiếp điểm sạc (dock) + jack DC', 'Dock cấp ~19–20 V qua 2 lá đồng; mạch sạc giới hạn dòng, ngắt ở 16.8 V. Không sạc NiMH bằng mạch Li-ion!', 'sac-pin', 'nguon'));
    const bumperP = new THREE.Group();
    L[1].add(bumperP);
    const bumperIn = new THREE.Group();
    bumperP.add(bumperIn);
    bumperIn.add(P(mesh(arcSector(176, 182, -1.75, 1.75, 50, 48), MAT.plasticBlack, { y: 40 }), 'Bumper (cản va phía trước)', 'Ôm nửa trước robot, có lò xo hồi. Va chạm → lùi vài mm → ép 2 công tắc.', 'bumper', 'co-khi'));
    [-1, 1].forEach((s) => {
      const a = (-s * 35 * Math.PI) / 180;
      const sw = group(mesh(box(19.8, 10.2, 6.4, 0.5), MAT.plasticBlack), mesh(box(18, 0.5, 4), MAT.steel, { x: 4, y: 5.4, rz: 0.1 }));
      sw.position.set(163 * Math.cos(a), 30, -163 * Math.sin(a));
      sw.rotation.y = a + Math.PI / 2;
      bumperP.add(P(sw, `Công tắc bumper ${s < 0 ? 'TRÁI → RB4' : 'PHẢI → RB5'}`, 'Microswitch có cần gạt; COM–GND, NO → PORTB (kéo lên nội, chạm = 0). Firmware chống dội 5 ms.', 'cong-tac-hanh-trinh', 'cam-bien'));
    });
    piece(bumperP, [40, 150, 0], R(5, 11));
    label(bumperIn, 'Bumper', [190, 70, 0]);

    // ======================= TẦNG 2 — PIN, HỘP BỤI, QUẠT, CẦU CHÌ =======================
    const pack = new THREE.Group();
    pack.position.set(-15, 0, 0);
    L[2].add(pack);
    const cellGeo = cyl(9, 9, 65, 24); cellGeo.rotateX(Math.PI / 2);
    const cells = [0, 1, 2, 3].map((i) => mesh(cellGeo, MAT.plasticBlue, { x: (i - 1.5) * 18.6, y: 22 }));
    pack.add(P(group(...cells), '4 cell Li-ion 18650 nối tiếp (4S1P)', 'Mỗi cell 3.6 V danh định (3.0–4.2 V), 2600 mAh. 4 cell nối tiếp → 14.4 V (12.0–16.8 V).', 'pin-18650', 'nguon'));
    const nickel = group(mesh(box(74, 14, 0.3), MAT.steel, { y: 22, z: 33.2 }), mesh(box(74, 14, 0.3), MAT.steel, { y: 22, z: -33.2 }));
    pack.add(P(nickel, 'Lá kền hàn điểm', 'Nối các cell nối tiếp. Hàn điểm (spot weld), KHÔNG hàn thiếc trực tiếp lên cell (nhiệt làm hỏng cell).', 'pin-18650', 'nguon'));
    const bms = group(mesh(box(60, 1.6, 18, 0.5), MAT.pcbGreen, { y: 32.8 }), mesh(box(6, 1.2, 5), MAT.icBody, { x: -14, y: 34.2 }), mesh(box(5, 1.2, 4), MAT.icBody, { x: 6, y: 34.2 }), mesh(box(5, 1.2, 4), MAT.icBody, { x: 14, y: 34.2 }));
    pack.add(P(bms, 'Mạch bảo vệ BMS 4S', 'Ngắt khi quá áp (4.25 V/cell), thấp áp (2.5–2.8 V), quá dòng, chập. Có dây cân bằng từng cell.', 'pack-4s-bms', 'nguon'));
    label(pack, 'Pin 4S', [0, 40, -40]);
    piece(pack, [0, -130, 0], R(1, 11), { off2: [-20, -12, -320] });

    const binP = new THREE.Group();
    binP.position.set(-110, 0, -30);
    L[2].add(binP);
    const binIn = new THREE.Group();
    binP.add(binIn);
    const binMat = MAT.plasticGrey.clone(); binMat.transparent = true; binMat.opacity = 0.7;
    binIn.add(P(group(mesh(box(76, 50, 140, 6), binMat, { y: 45 }), mesh(box(76, 3, 140, 1), MAT.plasticDark, { y: 71.5 }), mesh(box(10, 4, 34, 1), MAT.plasticDark, { x: -36, y: 75 })),
      'Hộp bụi ~0.4 L', 'Bụi theo luồng gió từ chổi cuộn vào đây. Đầy bụi → gió yếu → hút kém. Có gioăng kín khí.', 'hop-bui', 'co-khi'));
    binIn.add(P(mesh(box(8, 40, 110, 1), MAT.plasticWhite, { x: 42, y: 45 }), 'Lọc HEPA', 'Giấy lọc gấp nếp giữ bụi mịn trước khi gió vào quạt. Tắc lọc = mất lực hút, quạt nóng.', 'hop-bui', 'co-khi'));
    piece(binP, [-170, 0, 0], R(3, 11));

    const fanP = new THREE.Group();
    fanP.position.set(-60, 0, 75);
    L[2].add(fanP);
    const fanHouseMat = MAT.plasticDark.clone(); fanHouseMat.side = THREE.DoubleSide; fanHouseMat.transparent = true; fanHouseMat.opacity = 0.55;
    const rotor = new THREE.Group();
    rotor.position.y = 40;
    rotor.add(mesh(cyl(8, 8, 14, 16), MAT.aluminum));
    for (let k = 0; k < 7; k++) rotor.add(mesh(box(20, 12, 1.2), MAT.aluminum, { x: 0, ry: (k * 2 * Math.PI) / 7 }).translateX(14));
    fanP.add(P(group(mesh(cyl(30, 30, 36, 32, true), fanHouseMat, { y: 40 }), mesh(cyl(30, 30, 2, 32), fanHouseMat, { y: 59 }), rotor, mesh(cyl(14, 14, 16, 20), MAT.steel, { y: 14 })),
      'Quạt hút BLDC 14.4 V', 'Cánh ly tâm quay 15 000–25 000 vòng/phút tạo áp suất âm. ESP32 GPIO4 phát PWM (LEDC 20 kHz), FG → GPIO5 đo tốc độ.', 'quat-bldc', 'dong-luc'));
    label(fanP, 'Quạt hút', [0, 80, 20]);
    piece(fanP, [0, 160, 0], R(9, 11));

    const fuse = group(mesh(box(22, 10, 9, 1), MAT.plasticBlack, { x: 75, y: 45, z: 60 }), mesh(cyl(2.6, 2.6, 20, 12), MAT.glass, { x: 75, y: 51, z: 60, rz: Math.PI / 2 }));
    L[2].add(P(fuse, 'Cầu chì 10 A (ngay sau pin)', 'Đứt khi chập mạch/ kẹt quá dòng — bảo vệ dây và pin khỏi cháy.', 'cau-chi', 'nguon'));
    const mainSw = mesh(box(12, 8, 20, 1), MAT.plasticRed, { x: -150, y: 52, z: 55 });
    L[2].add(P(mainSw, 'Công tắc nguồn chính', 'Ngắt VBAT tới toàn bộ mạch. Đặt sau cầu chì.', 'cau-chi', 'nguon'));

    // ======================= TẦNG 3 — BO MẠCH & DÂY =======================
    const boards = new THREE.Group();       // bo của dự án (ẩn khi đang mổ robot gốc)
    L[3].add(boards);
    // --- bo PIC ---
    const picB = new THREE.Group();
    picB.position.set(10, 62, -45);
    boards.add(picB);
    const dipPins = [];
    for (let i = 0; i < 20; i++) { dipPins.push([-24.13 + i * 2.54, 1.8, 7.62], [-24.13 + i * 2.54, 1.8, -7.62]); }
    picB.add(P(group(mesh(box(70, 1.6, 50, 0.5), MAT.pcbGreen, { y: 0.8 }), mesh(box(52.3, 3.6, 13.2, 0.5), MAT.icBody, { y: 4.4 }), inst(pinGeo, MAT.tin, dipPins)),
      'Bo PIC16F877A (bo đục lỗ 70×50, DIP-40)', '"Tủy sống": PWM 2 bánh, đếm encoder, bumper, cliff, nhấc bánh, đo pin, phản xạ an toàn.', 'pic16f877a', 'dieu-khien'));
    picB.add(P(group(mesh(box(11, 3.5, 4.6, 1.2), MAT.steel, { x: -12, y: 3.4, z: 16 }), mesh(box(3, 3, 1.5), capMat, { x: -20, y: 3, z: 16 }), mesh(box(3, 3, 1.5), capMat, { x: -4, y: 3, z: 16 })),
      'Thạch anh 20 MHz + 2 tụ 22 pF', 'Nhịp tim của PIC: 20 MHz → 1 lệnh 0.2 µs. Đặt sát chân 13–14.', 'thach-anh', 'dieu-khien'));
    picB.add(P(inst(resGeo, resMat, [[20, 2.6, 15], [20, 2.6, 19], [8, 2.6, 19], [-28, 2.6, -15]]), 'Điện trở: 10 kΩ MCLR, 10 kΩ kéo lên RA4/RC0, phân áp pin 33k/10k',
      'MCLR phải kéo lên 5 V; encoder open-collector cần kéo lên; phân áp đưa 16.8 V xuống 3.9 V cho AN0.', 'dien-tro', 'dieu-khien'));
    picB.add(P(group(mesh(box(3, 3, 1.5), capMat, { x: 28, y: 3, z: 5 }), mesh(box(3, 3, 1.5), capMat, { x: -28, y: 3, z: -5 })), 'Tụ 100 nF sát chân VDD', 'Mỗi cặp VDD/VSS một tụ, càng sát càng tốt — chặn gai nhiễu làm PIC reset.', 'tu-dien', 'dieu-khien'));
    picB.add(P(group(mesh(box(15.2, 2.5, 2.5), MAT.plasticBlack, { x: 18, y: 2.85, z: -20 }), inst(pinGeo, MAT.gold, [0, 1, 2, 3, 4, 5].map((i) => [11.65 + i * 2.54, 5.5, -20]))),
      'Header ICSP 6 chân (PICkit)', '1 MCLR · 2 VDD · 3 GND · 4 PGD (RB7) · 5 PGC (RB6) · 6 NC. Nạp chương trình ngay trên robot.', 'mach-nap-pickit', 'dieu-khien'));
    picB.add(P(group(mesh(box(10, 10, 7.5, 1), termMat, { x: -29, y: 6.6, z: 18 }), mesh(box(10, 10, 7.5, 1), termMat, { x: 29, y: 6.6, z: -18 })), 'Domino bắt dây (terminal)', 'Nối dây cảm biến/ nguồn chắc chắn, tháo lắp được.', 'pic16f877a', 'dieu-khien'));
    const statusLed = mesh(cyl(1.5, 1.5, 4, 12), new THREE.MeshStandardMaterial({ color: 0xff3030, emissive: 0xff0000, emissiveIntensity: 0.2 }), { x: 30, y: 3.6, z: 18 });
    picB.add(P(statusLed, 'LED trạng thái (RD7)', 'Nháy theo trạng thái PIC; nháy lại từ đầu = PIC vừa reset.', 'diode', 'dieu-khien'));
    label(picB, 'Bo PIC16F877A', [0, 12, -10]);
    // --- ESP32-S3 DevKitC-1 ---
    const espB = new THREE.Group();
    espB.position.set(20, 62, 55);
    boards.add(espB);
    const hdrPts = [];
    for (let i = 0; i < 22; i++) { hdrPts.push([-26.7 + i * 2.54, -1.5, 11.4], [-26.7 + i * 2.54, -1.5, -11.4]); }
    espB.add(P(group(mesh(box(63, 1.6, 25.4, 0.5), MAT.pcbBlack, { y: 0.8 }), mesh(box(18, 0.8, 25.5), MAT.pcbBlack, { x: 23, y: 2 }), mesh(box(15.8, 2.4, 17.6, 0.3), MAT.steel, { x: 21, y: 3.6 }),
      mesh(box(7.4, 3.2, 9, 1), MAT.steel, { x: -29, y: 3.2, z: 6 }), mesh(box(7.4, 3.2, 9, 1), MAT.steel, { x: -29, y: 3.2, z: -6 }), inst(pinGeo, MAT.gold, hdrPts)),
      'ESP32-S3 DevKitC-1', '"Bộ não" 3.3 V, 2 nhân 240 MHz, BLE + Wi-Fi: app, thuật toán đi, odometry, IMU, quạt, lidar. Nhận 5 V vào chân 5V → LDO 3.3 V.', 'esp32-s3', 'dieu-khien'));
    label(espB, 'ESP32-S3', [0, 10, 0]);
    // --- BSS138 ---
    const bssB = new THREE.Group();
    bssB.position.set(25, 62, 15);
    boards.add(bssB);
    bssB.add(P(group(mesh(box(14, 1.6, 16, 0.4), MAT.pcbBlue, { y: 0.8 }), inst(box(2.9, 1, 1.3), MAT.icBody, [[-3, 2.1, -3], [3, 2.1, -3], [-3, 2.1, 3], [3, 2.1, 3]])),
      'Mạch chuyển mức BSS138 (3.3 V ⇄ 5 V)', 'Bắt buộc: chân RX của PIC cần ≥ 4.0 V mới hiểu là mức 1, ESP32 chỉ chịu 3.6 V.', 'bss138-level-shifter', 'dieu-khien'));
    // --- GY-521 ở tâm robot ---
    const imuB = mesh(box(21.2, 1.6, 16.4, 0.5), MAT.pcbBlue, { x: -5, y: 62.8, z: 5 });
    const imuChip = mesh(box(4, 0.9, 4), MAT.icBody, { x: -5, y: 64, z: 5 });
    boards.add(P(group(imuB, imuChip), 'Cảm biến góc MPU6050 (GY-521) — I2C GPIO8/9', 'Đặt gần tâm robot, nằm phẳng: con quay trục Z đo góc quay chính xác hơn encoder.', 'mpu6050', 'cam-bien'));
    // --- DRV8871 ×2 + tụ 1000 µF ---
    const drvChips = [];
    [-1, 1].forEach((s) => {
      const d = new THREE.Group();
      d.position.set(-15, 62, s * 95);
      boards.add(d);
      const chip = mesh(box(5, 1.5, 6, 0.2), MAT.icBody, { y: 2.4 });
      drvChips.push(chip);
      d.add(P(group(mesh(box(25, 1.6, 20, 0.5), MAT.pcbBlue, { y: 0.8 }), chip, mesh(box(10, 10, 7.5, 1), termMat, { x: -8, y: 6.6, z: -s * 5 }), mesh(box(10, 10, 7.5, 1), termMat, { x: 8, y: 6.6, z: -s * 5 })),
        `Driver DRV8871 bánh ${s < 0 ? 'trái' : 'phải'}`, 'Cầu H 3.6 A, chịu tới 45 V: IN1 = PWM (CCP), IN2 = chiều (RD0/RD2). Có giới hạn dòng bằng điện trở ILIM.', 'driver-drv8871', 'dong-luc'));
      d.add(P(mesh(cyl(5, 5, 13, 16), elecMat, { x: 16, y: 6.5, z: 0 }), 'Tụ hóa 1000 µF/25 V đầu nguồn driver', 'Bù dòng đỉnh khi động cơ khởi động/ đảo chiều, giảm sụt áp làm reset MCU.', 'tu-dien', 'dong-luc'));
    });
    // --- buck XL4015 ---
    const buckB = new THREE.Group();
    buckB.position.set(-100, 62, 55);
    boards.add(buckB);
    const buckCapIn = mesh(cyl(4, 4, 9, 16), elecMat, { x: -18, y: 6.1, z: 7 });
    buckB.add(P(group(mesh(box(51, 1.6, 26, 0.5), MAT.pcbBlue, { y: 0.8 }), mesh(cyl(7, 7, 7, 20), MAT.ferrite, { x: 2, y: 5.1 }), mesh(box(10, 4.5, 9, 0.5), MAT.icBody, { x: 16, y: 3.85, z: -5 }), mesh(box(9, 6, 4.5, 0.5), MAT.plasticBlue, { x: 16, y: 4.6, z: 8 })),
      'Mạch hạ áp XL4015 (14.4 V → 5 V/3 A)', 'Buck đóng cắt 180 kHz, hiệu suất ~88 %. Cấp 5 V cho PIC, ESP32, cảm biến, lidar. Không có bảo vệ ngược cực!', 'buck-xl4015', 'nguon'));
    buckB.add(P(group(buckCapIn, mesh(cyl(4, 4, 9, 16), elecMat, { x: 20, y: 6.1, z: 7 })), 'Tụ hóa vào 220 µF/50 V · ra 220 µF/35 V', 'Tụ có cực: cắm ngược hoặc cấp ngược cực pin là phồng/ nổ.', 'tu-dien', 'nguon'));
    buckB.add(P(mesh(box(5, 2.5, 4, 0.3), MAT.icBody, { x: -6, y: 2.85, z: -8 }), 'Diode Schottky SS54 (bánh xe tự do)', 'Dẫn dòng cuộn cảm khi khóa tắt. Sụt áp thấp ~0.5 V → ít nóng.', 'diode', 'nguon'));
    // --- bo MOSFET chổi ---
    const mosB = new THREE.Group();
    mosB.position.set(75, 62, -20);
    boards.add(mosB);
    mosB.add(P(group(mesh(box(40, 1.6, 30, 0.5), MAT.pcbGreen, { y: 0.8 }), ...[-8, 8].map((x) => mesh(box(10, 9, 4.5, 0.3), MAT.icBody, { x, y: 6.1, z: -6 })), ...[-8, 8].map((x) => mesh(box(10, 6, 1.3), MAT.tin, { x, y: 13.6, z: -7.6 }))),
      'MOSFET IRLZ44N ×2 (chổi cuộn RD5, chổi cạnh RD6)', 'MOSFET mức logic: mở hoàn toàn với 5 V từ PIC. Cổng qua 100 Ω, kéo xuống 10 kΩ.', 'mosfet', 'dong-luc'));
    mosB.add(P(group(...[-8, 8].map((x) => mesh(box(5, 2.5, 4, 0.3), MAT.icBody, { x, y: 2.85, z: 8 }))), 'Diode SS34 song song ngược động cơ (flyback)', 'Hấp thụ xung điện áp ngược khi MOSFET tắt dòng cuộn dây — thiếu nó MOSFET chết.', 'diode', 'dong-luc'));
    mosB.add(P(inst(resGeo, resMat, [[-14, 2.6, 12], [-14, 2.6, 6], [14, 2.6, 12], [14, 2.6, 6]]), 'Điện trở cổng 100 Ω + kéo xuống 10 kΩ', '100 Ω hạn dòng nạp tụ cổng; 10 kΩ giữ MOSFET tắt khi PIC đang reset.', 'dien-tro', 'dong-luc'));
    piece(boards, [0, 120, 0], (s) => s >= 0 && s <= 10, { hide: true });

    // --- bo mạch gốc (chỉ có trong các bước mổ robot gốc) ---
    const orig = group(mesh(box(150, 1.6, 100, 1), MAT.pcbGreen, { y: 62.8 }), mesh(box(14, 1.4, 14, 0.2), MAT.icBody, { x: 10, y: 64.3 }), mesh(box(10, 1.2, 8), MAT.icBody, { x: -30, y: 64.2, z: 25 }), mesh(box(20, 8, 6), MAT.plasticWhite, { x: -50, y: 67.6, z: -40 }));
    const origP = group(P(orig, 'Bo mạch gốc của robot (sẽ thay bằng PIC + ESP32)', 'MCU ARM + driver + mạch sạc của hãng. Firmware đóng → thay bằng bo của bạn để tự lập trình.', 'pic16f877a', 'dieu-khien'));
    L[3].add(origP);
    piece(origP, [0, 200, 0], (s) => s < 0 || s >= 10, { hide: true, startHidden: true });

    // --- dây ---
    const wires = new THREE.Group();
    L[3].add(wires);
    wires.add(P(group(wire([[-15, 34, 30], [20, 50, 45], [70, 50, 60]], { radius: 1.2, color: 0xd23b3b }), wire([[80, 50, 60], [40, 58, 80], [-140, 58, 70], [-150, 55, 58]], { radius: 1.2, color: 0xd23b3b }),
      wire([[-150, 55, 50], [-120, 60, 40], [-120, 63, 55]], { radius: 1.2, color: 0xd23b3b }), wire([[-15, 34, -30], [-20, 55, -60], [-15, 63, -95]], { radius: 1.2, color: 0x222222 })),
    'Dây nguồn VBAT (đỏ) + GND hình sao (đen)', 'Pin → cầu chì 10 A → công tắc → buck, driver, quạt, MOSFET. GND mọi khối về một điểm ở cực âm pin.', 'cau-chi', 'nguon'));
    wires.add(P(group(wire([[22, 64, -22], [25, 68, 0], [22, 64, 10]], { radius: 0.6, color: 0x3b8ef0 }), wire([[28, 64, 20], [30, 68, 35], [30, 64, 44]], { radius: 0.6, color: 0x2fbf71 })),
      'Dây UART PIC ⇄ BSS138 ⇄ ESP32', 'RC6/TX → GPIO18, GPIO17 → RC7/RX; 19200 baud 8N1, khung 0xAA LEN CMD … CHK.', 'uart-khung', 'dieu-khien'));
    wires.add(P(group(wire([[-10, 64, -45], [-15, 70, -70], [-15, 64, -88]], { radius: 0.6, color: 0xff8c1a }), wire([[0, 64, -25], [-10, 72, 40], [-15, 64, 88]], { radius: 0.6, color: 0xff8c1a })),
      'Dây PWM 20 kHz: CCP1 → DRV trái, CCP2 → DRV phải', 'Duty = tốc độ; IN2 = chiều (sign-magnitude). Lùi thì firmware đảo duty.', 'pwm', 'dong-luc'));
    wires.add(P(group(wire([[-15, 62, -100], [-30, 60, -110], [-40, 52, -100]], { radius: 0.9, color: 0xd23b3b }), wire([[-15, 62, 100], [-30, 60, 110], [-40, 52, 100]], { radius: 0.9, color: 0xd23b3b })),
      'Dây DRV8871 OUT1/OUT2 → động cơ bánh', 'Xoắn đôi, có tụ 100 nF ở đầu động cơ.', 'driver-drv8871', 'dong-luc'));
    const fanWire = wire([[-100, 63, 50], [-80, 62, 60], [-60, 58, 75]], { radius: 0.5, color: 0xd23b3b });
    wires.add(P(fanWire, 'Dây quạt hút (VBAT/GND/PWM/FG)', 'Quạt kéo 1–3 A — dây phải ≥ AWG20. PWM từ GPIO4, FG về GPIO5.', 'quat-bldc', 'dong-luc'));
    piece(wires, [0, 90, 0], R(7, 11), { hide: true });

    // ======================= TẦNG 4 — VỎ TRÊN =======================
    const topP = new THREE.Group();
    L[4].add(topP);
    const topMat = MAT.plasticWhite.clone(); topMat.side = THREE.DoubleSide;
    const topShell = P(mesh(lathe([[174, 40], [175, 62], [172, 73], [165, 79], [150, 80], [0, 80]], 64), topMat), 'Vỏ trên', 'Che bụi/ nước, chịu lực khi bị đè. Có lỗ cho đầu lidar và nút bấm.', 'vo-khung', 'co-khi');
    topP.add(topShell);
    topP.add(P(group(mesh(cyl(6, 6, 2, 20), MAT.plasticGrey, { x: 120, y: 80.6, z: -12 }), mesh(cyl(6, 6, 2, 20), MAT.plasticGrey, { x: 120, y: 80.6, z: 12 })), 'Nút START (→ RB0) và HOME', 'Nút nhấn kéo lên nội, nhấn = 0; PIC chống dội 5 ms như bumper.', 'cong-tac-hanh-trinh', 'dieu-khien'));
    piece(topP, [0, 150, 0], R(5, 11));

    // ======================= TẦNG 5 — LIDAR =======================
    const lidP = new THREE.Group();
    lidP.position.set(-80, 0, 0);
    L[5].add(lidP);
    const turret = new THREE.Group();
    turret.position.set(12, 82, 0);
    turret.add(mesh(cyl(34, 34, 14, 40), MAT.plasticDark, { y: 7 }), mesh(arcSector(34, 34.8, -0.5, 0.5, 8), winMat, { y: 7 }));
    lidP.add(P(group(mesh(box(96, 5, 72, 2), MAT.plasticBlack, { y: 79.5 }), turret), 'Lidar LDS (đầu quay laser 360°)', 'Giai đoạn sau: 5 vòng/s, 360 điểm/vòng, UART 115200 → ESP32 GPIO16; motor PWM GPIO15.', 'lidar-lds', 'cam-bien'));
    label(lidP, 'Lidar', [12, 110, 0]);
    piece(lidP, [0, 260, 0], R(6, 11));

    // ======================= KHU THỬ (chỉ khi chạy) =======================
    const arena = new THREE.Group();
    const aFloorMat = MAT.plasticWhite.clone(); aFloorMat.color.setHex(0xc9a57a); aFloorMat.roughness = 0.85;
    arena.add(part(mesh(box(ARENA.x1 - ARENA.x0, 20, ARENA.z1 - ARENA.z0), aFloorMat, { y: -10 }), 'Sàn khu thử 1.6 × 1.2 m', 'Robot chạy va chạm-quay như chế độ AUTO. Bánh lăn không trượt: quãng đường = góc quay × 35 mm. <a href="#/c/banh-xe">Xem chi tiết →</a>'));
    const aWall = MAT.plasticWhite.clone(); aWall.color.setHex(0xe5e1d8);
    arena.add(part(group(mesh(box(20, 100, ARENA.z1 - ARENA.z0 + 40), aWall, { x: ARENA.x0 - 10, y: 50 }), mesh(box(ARENA.x1 - ARENA.x0, 100, 20), aWall, { y: 50, z: ARENA.z0 - 10 }), mesh(box(ARENA.x1 - ARENA.x0, 100, 20), aWall, { y: 50, z: ARENA.z1 + 10 })),
      'Tường thấp', 'Bumper chạm → lùi 60 mm → quay 100–170°. <a href="#/c/bumper">Xem chi tiết →</a>'));
    const lowerMat = aFloorMat.clone(); lowerMat.color.setHex(0x8a6a48);
    arena.add(part(mesh(box(400, 20, ARENA.z1 - ARENA.z0), lowerMat, { x: ARENA.x1 + 200, y: -ARENA.drop - 10 }), 'Bậc cầu thang (sâu 15 cm)', 'Mép sàn phía trước: 4 cảm biến chống rơi phải phát hiện trước khi bánh xoay lọt xuống. <a href="#/c/cliff-ir">Xem chi tiết →</a>'));
    const OBST = [{ c: [250, -250], r: 20, h: 400 }, { rect: [-450, -250, 250, 400], h: 300 }];
    const legMat = MAT.plasticWhite.clone(); legMat.color.setHex(0x9c6b3e);
    arena.add(part(mesh(cyl(20, 20, 400, 16), legMat, { x: 250, y: 200, z: -250 }), 'Chân ghế Ø40', 'Vật cản nhỏ — bumper có thể chỉ chạm một bên (BUMP_L hoặc BUMP_R). <a href="#/c/cong-tac-hanh-trinh">Xem chi tiết →</a>'));
    arena.add(part(mesh(box(200, 300, 150, 6), MAT.plasticGrey, { x: -350, y: 150, z: 325 }), 'Thùng các-tông', 'Vật cản vuông — chạm chính diện thì cả 2 công tắc bumper cùng đóng (BUMP_C). <a href="#/c/bumper">Xem chi tiết →</a>'));

    // ======================= MÔ HÌNH CAD THẬT (robot/robot-vacuum-assembly.glb) =======================
    // Khung GLB: trước = −Z, phải = +X, sàn y = 0 → xoay −90° quanh Y: trước = +x, phải = +z như mô hình tự dựng.
    // Đổi vectơ thân robot (x, y, z) → khung GLB: (z, y, −x).
    const toG = (v) => [v[2], v[1], -v[0]];
    const link = (l) => (l ? ` <a href="#/c/${l}">Xem chi tiết →</a>` : '');
    // [node, tên, mô tả, bài học, hệ thống, tầng (chỉ node cấp 1 — dùng cho tách lớp)]
    const CADMAP = [
      ['chassis', 'Vỏ đáy (chassis) Ø350', 'Nhựa ABS có hốc bánh, khe chổi cuộn, hộc pin, cửa sổ cảm biến chống rơi; mọi module bắt vào đây.', 'vo-khung', 'co-khi', 1],
      ['chassis/lid_battery', 'Nắp khoang pin (2 vít PH1)', 'Mở từ mặt dưới — tháo pin là việc ĐẦU TIÊN khi mổ robot.', 'pack-4s-bms', 'nguon'],
      ['chassis/screw_1', 'Vít PT 3×8 nắp pin', 'Vít tự ren cho nhựa, đầu PH1.', 'oc-vit', 'co-khi'],
      ['chassis/screw_2', 'Vít PT 3×8 nắp pin', 'Vít tự ren cho nhựa, đầu PH1.', 'oc-vit', 'co-khi'],
      ['chassis/lid_brush', 'Nắp chặn chổi cuộn (2 lẫy)', 'Bóp 2 lẫy, lật xuống rồi nhấc chổi cuộn ra để gỡ tóc.', 'choi-cuon', 'co-khi'],
      ['chassis/contact_l', 'Tiếp điểm sạc (−)', 'Lá đồng chạm lò xo của dock; mạch sạc giới hạn dòng, ngắt ở 16,8 V.', 'sac-pin', 'nguon'],
      ['chassis/contact_r', 'Tiếp điểm sạc (+)', 'Dock cấp ~19–20 V qua 2 lá đồng này.', 'sac-pin', 'nguon'],
      ['cover_top', 'Vỏ trên', 'Che bụi/nước, chịu lực khi bị đè. Có lỗ đầu lidar, nắp lật hộp bụi và 2 nút bấm. Bắt bằng 4 vít từ mặt dưới.', 'vo-khung', 'co-khi', 4],
      ['cover_top/lid_top', 'Nắp lật hộp bụi', 'Bản lề phía sau, mở ~100° để nhấc hộp bụi ra (hộp bụi nạp từ trên).', 'hop-bui', 'co-khi'],
      ['cover_top/btn_power', 'Nút START / nguồn (→ RB0)', 'Nút nhấn kéo lên nội, nhấn = 0; PIC chống dội.', 'cong-tac-hanh-trinh', 'dieu-khien'],
      ['cover_top/btn_home', 'Nút HOME (về dock)', 'ESP32 nhận lệnh về dock.', 'esp32-s3', 'dieu-khien'],
      ['cover_top/led_ring', 'Vòng LED trạng thái', 'Xanh = đang chạy, nháy đỏ = PIC vừa reset, tắt = mất nguồn logic.', 'diode', 'dieu-khien'],
      ['bumper', 'Bumper (cản va phía trước)', 'Cung 200° có lò xo hồi; va chạm → lùi 4 mm → vấu gạt ép 2 công tắc.', 'bumper', 'co-khi', 1],
      ['switch_bump_l', 'Công tắc bumper TRÁI → RB4', 'Omron SS-5GL cần gạt; COM–GND, NO → PORTB (kéo lên nội, chạm = 0).', 'cong-tac-hanh-trinh', 'cam-bien', 1],
      ['switch_bump_r', 'Công tắc bumper PHẢI → RB5', 'Omron SS-5GL cần gạt; firmware chống dội 5 ms.', 'cong-tac-hanh-trinh', 'cam-bien', 1],
      ['caster', 'Bánh xoay đa hướng (caster)', 'Bánh phụ phía trước, tự xoay theo hướng đi; cài khớp — kéo thẳng ra để tháo.', 'banh-xoay', 'co-khi', 0],
      ['brush_main', 'Chổi cuộn chính (lông + gạt cao su chữ V)', 'Quay ~1500 vòng/phút hất bụi vào miệng hút. Tóc quấn 2 đầu → kẹt → dòng tăng vọt.', 'choi-cuon', 'co-khi', 0],
      ['motor_brush', 'Động cơ chổi cuộn RS-360 → MOSFET IRLZ44N (RD5)', 'DC 14,4 V ~0,6 A, kẹt tóc có thể 5–7 A. Bật/tắt qua MOSFET + diode SS34.', 'dong-co-dc', 'dong-luc', 0],
      ['brush_gearbox', 'Hộp số chổi cuộn', 'Giảm tốc từ động cơ xuống ~1500 vòng/phút cho chổi.', 'hop-so', 'co-khi', 0],
      ['brush_side_1', 'Chổi cạnh 3 nhánh Ø150', 'Quét bụi ở góc tường vào giữa đường chổi cuộn. 1 vít PH1.', 'choi-canh', 'co-khi', 0],
      ['motor_side_brush', 'Động cơ N20 chổi cạnh → MOSFET (RD6)', 'Động cơ giảm tốc nhỏ ~0,1 A, chỉ cần bật/tắt.', 'dong-co-dc', 'dong-luc', 0],
      ['bin', 'Hộp bụi 0,43 L', 'Nắp bản lề + chốt, lưới lọc thô, lọc HEPA xếp nếp. Đầy bụi → gió yếu → hút kém.', 'hop-bui', 'co-khi', 2],
      ['bin/filter_hepa', 'Lọc HEPA xếp nếp', 'Giữ bụi mịn trước khi gió vào quạt. Tắc lọc = mất lực hút, quạt nóng.', 'hop-bui', 'co-khi'],
      ['fan', 'Quạt hút BLDC 14,4 V', 'Cánh ly tâm 15 000–25 000 vòng/phút trong buồng xoắn ốc. ESP32 GPIO4 phát PWM, FG → GPIO5.', 'quat-bldc', 'dong-luc', 2],
      ['fan/conn_fan', 'Dây + giắc quạt (VCC/GND/PWM/FG)', 'Quạt kéo 1–3 A — dây phải ≥ AWG20.', 'quat-bldc', 'dong-luc'],
      ['battery', 'Pin 4S1P 18650 (14,4 V) + BMS', '4 cell nối tiếp 12,0–16,8 V, 2600 mAh; BMS 4S, giắc XT60 + JST-XH cân bằng.', 'pack-4s-bms', 'nguon', 2],
      ['battery/cells', '4 cell Li-ion 18650', 'Mỗi cell 3,6 V danh định (3,0–4,2 V).', 'pin-18650', 'nguon'],
      ['battery/bms', 'Mạch bảo vệ BMS 4S', 'Ngắt khi quá áp, thấp áp, quá dòng, chập.', 'pack-4s-bms', 'nguon'],
      ['lidar', 'Lidar LDS02RR (đầu quay laser 360°)', '5 vòng/s, 360 điểm/vòng, UART 115200 → ESP32 GPIO16; motor PWM GPIO15.', 'lidar-lds', 'cam-bien', 5],
      ['board_pic', 'Bo PIC16F877A (tủy sống)', 'PWM 2 bánh, đếm encoder, bumper, cliff, nhấc bánh, đo pin, phản xạ an toàn.', 'pic16f877a', 'dieu-khien', 3],
      ['board_pic/crystal_20mhz', 'Thạch anh 20 MHz', 'Nhịp tim của PIC: 1 lệnh 0,2 µs.', 'thach-anh', 'dieu-khien'],
      ['board_esp32', 'ESP32-S3 DevKitC-1 (bộ não)', 'BLE app, thuật toán đi, odometry, IMU, quạt, lidar. Nói chuyện với PIC qua UART + BSS138.', 'esp32-s3', 'dieu-khien', 3],
    ];
    const CLIFF_N = { cliff_4: 1, cliff_2: 2, cliff_1: 3, cliff_3: 4 };   // số thứ tự như mô hình tự dựng (#1 trái … #4 phải)
    for (const [k, n] of Object.entries(CLIFF_N)) CADMAP.push([k, `Cảm biến chống rơi #${n} → AN${n}`, `LED IR + phototransistor nhìn xuống sàn (${['trái', 'trước-trái', 'trước-phải', 'phải'][n - 1]}). LED bật chung bằng RD4.`, 'cliff-ir', 'cam-bien', 0]);
    for (const s of ['l', 'r']) {
      const side = s === 'l' ? 'TRÁI' : 'PHẢI';
      CADMAP.push(
        [`wheel_${s}`, `Module bánh xe ${side}`, 'Động cơ RS-360 + hộp số m0,5 + encoder Hall + công tắc nhấc bánh trên tay đòn có lò xo.', 'banh-xe', 'co-khi', 0],
        [`wheel_${s}/wheel`, `Bánh xe ${side} Ø70 mm`, 'Lốp cao su gai, mỗi vòng π×70 ≈ 220 mm.', 'banh-xe', 'co-khi'],
        [`wheel_${s}/motor`, `Động cơ bánh ${s === 'l' ? 'trái' : 'phải'} (RS-360)`, 'DC chổi than 14,4 V, nhận PWM 20 kHz từ DRV8871. Nên có tụ 100 nF hai cực.', 'dong-co-dc', 'dong-luc'],
        [`wheel_${s}/gear_train`, 'Hộp số bánh (m0,5)', 'Giảm tốc nhiều cấp, tăng mô-men để kéo robot 3 kg leo thảm.', 'hop-so', 'co-khi'],
        [`wheel_${s}/encoder`, `Encoder Hall bánh ${s === 'l' ? 'trái → RA4/T0CKI' : 'phải → RC0/T1CKI'}`, 'IC Hall đọc nam châm trên trục trung gian của hộp số.', 'encoder-hall', 'cam-bien'],
        [`wheel_${s}/encoder_magnet`, 'Nam châm encoder', 'Nhiều cực N/S xen kẽ, quay cùng bánh răng → xung cho IC Hall.', 'encoder-hall', 'cam-bien'],
        [`wheel_${s}/spring`, 'Lò xo treo bánh', 'Ép bánh xuống sàn để bám; nhấc robot thì bánh tụt xuống.', 'lo-xo', 'co-khi'],
        [`wheel_${s}/switch_drop`, `Công tắc nhấc bánh ${s === 'l' ? 'trái → RB1' : 'phải → RB2'}`, 'Bánh tụt quá 8° → nhả công tắc → PIC dừng mọi động cơ.', 'cong-tac-hanh-trinh', 'cam-bien'],
      );
    }
    for (let i = 1; i <= 4; i++) {
      CADMAP.push([`screw_top_${i}`, 'Vít PT 3×8 giữ vỏ trên (bắt từ dưới)', 'Vít giấu dưới chân đệm/nhãn dán — phát sáng ở bước 5.', 'oc-vit', 'co-khi', 1]);
      CADMAP.push([`screw_lidar_${i}`, 'Vít PT 2,6×10 đế lidar', 'Tháo 4 vít rồi nhấc cả cụm lidar (cầm đế, không cầm đầu quay).', 'oc-vit', 'co-khi', 5]);
    }
    // tháo lắp từng bước — offset theo thân robot (mm); spot = chỗ đặt trên sàn khi robot không lật
    const CADSTEPS = [
      ['chassis/screw_1', R(1, 11), [0, -25, 0], [430, 0, -40]],
      ['chassis/screw_2', R(1, 11), [0, -25, 0], [430, 0, -25]],
      ['chassis/lid_battery', R(1, 11), [0, -45, 0], [60, 0, -300]],
      ['battery', R(1, 11), [0, -130, 0], [-60, 0, -330]],
      ['caster', R(2, 11), [0, -50, 0], [0, 0, 330]],
      ['brush_main', R(2, 11), [0, -80, 0], [-70, 0, 330]],
      ['brush_side_1', R(2, 11), [0, -60, 0], [-250, 0, 160]],
      ['bin', R(3, 11), [-290, 0, 0], [-400, 0, 0]],
      ['screw_top_1', R(4, 11), [0, -30, 0], [430, 0, 0]],
      ['screw_top_2', R(4, 11), [0, -30, 0], [430, 0, 15]],
      ['screw_top_3', R(4, 11), [0, -30, 0], [430, 0, 30]],
      ['screw_top_4', R(4, 11), [0, -30, 0], [430, 0, 45]],
      ['cover_top', R(5, 11), [0, 150, 0]],
      ['bumper', R(5, 11), [40, 150, 0]],
      ['screw_lidar_1', R(6, 11), [0, 300, 0]],
      ['screw_lidar_2', R(6, 11), [0, 300, 0]],
      ['screw_lidar_3', R(6, 11), [0, 300, 0]],
      ['screw_lidar_4', R(6, 11), [0, 300, 0]],
      ['lidar', R(6, 11), [0, 260, 0]],
      ['wheel_l/conn_wheel', R(7, 11), [0, 25, 0]],
      ['wheel_r/conn_wheel', R(7, 11), [0, 25, 0]],
      ['fan/conn_fan', R(7, 11), [0, 25, 0]],
      ['wheel_l', R(8, 11), [0, 60, -170]],
      ['wheel_r', R(8, 11), [0, 60, 170]],
      ['cliff_1', R(9, 11), [0, 120, 0]], ['cliff_2', R(9, 11), [0, 120, 0]], ['cliff_3', R(9, 11), [0, 120, 0]], ['cliff_4', R(9, 11), [0, 120, 0]],
      ['switch_bump_l', R(9, 11), [0, 120, 0]], ['switch_bump_r', R(9, 11), [0, 120, 0]],
      ['fan', R(9, 11), [0, 160, 0]],
      ['board_pic', (s) => s >= 0 && s <= 10, [0, 120, 0], null, true],
      ['board_esp32', (s) => s >= 0 && s <= 10, [0, 120, 0], null, true],
    ];
    const cadMovers = new Map();      // node → { mv, layer, steps:[{removed, off, spotOff, hide}], curV }
    const cadAnim = {};
    let cadCatMeshes = [], lastCadKey = '';
    const procHide = [L[0], L[1], L[2], L[4], L[5], boards, wires];
    const cad = cadAttach(ctx, body, 'robot/robot-vacuum-assembly', {
      onBottom: false, rotateY: -Math.PI / 2,
      hide: procHide,
      partDefault: ['Robot hút bụi (CAD thật)', 'Mô hình CAD lắp ráp đầy đủ Ø350 mm.'],
      onLoad(c) {
        for (const [k, name, desc, l, cat] of CADMAP) for (const n of c.nodes(k)) { n.userData.part = { name, desc: desc + link(l) }; n.userData.cat = cat; }
        // khớp động (tạo trước khi tính vị trí tháo lắp)
        cadAnim.wheel = ['l', 'r'].map((s) => c.pivot(`wheel_${s}/wheel`, { axis: [1, 0, 0] }));
        cadAnim.brush = c.pivot('brush_main/brush_main', { axis: [1, 0, 0] });
        cadAnim.side = c.pivot('brush_side_1', { axis: [0, 1, 0], origin: [105, 0, -105] });
        cadAnim.fan = c.pivot('fan/impeller', { axis: [1, 0, 0] });
        cadAnim.head = c.pivot('lidar/head', { axis: [0, 1, 0] });
        cadAnim.swivel = c.pivot('caster/swivel', { axis: [0, 1, 0], origin: [0, 0, -142] });
        cadAnim.castW = c.pivot('caster/swivel/wheel', { axis: [1, 0, 0] });
        // tâm hộp bao của node trong khung GLB (mm) — không phụ thuộc robot đang lật hay chạy
        const glbC = (n) => c.obj.worldToLocal(new THREE.Box3().setFromObject(n).getCenter(new THREE.Vector3())).multiplyScalar(1000);
        // chọn chiều quay sao cho `probe` đi lên (up = true) hoặc xuống
        const orient = (pv, probe, up) => {
          if (!pv || !probe) return pv;
          const y0 = glbC(probe).y; pv.set(0.2); const y1 = glbC(probe).y; pv.set(0);
          pv.sign = (y1 > y0) === up ? 1 : -1;
          return pv;
        };
        const hingeO = (k) => { const n = c.node(k); return n ? glbC(n).toArray() : null; };
        cadAnim.lidTop = orient(c.pivot('cover_top/lid_top', { axis: [1, 0, 0], origin: [0, 82, 54.5] }), c.node('cover_top/lid_top'), true);
        cadAnim.lidBrush = orient(c.pivot('chassis/lid_brush', { axis: [1, 0, 0], origin: [0, 9, 14] }), c.node('chassis/lid_brush'), false);
        cadAnim.lidBin = orient(c.pivot('bin/lid_bin', { axis: [1, 0, 0], origin: hingeO('bin/bin_body/hinge_pin') }), c.node('bin/lid_bin'), true);
        // tay đòn treo bánh: quay quanh chốt pivot_pin, mang theo bánh + hộp số + động cơ + encoder
        cadAnim.arm = ['l', 'r'].map((s) => {
          const o = hingeO(`wheel_${s}/pivot_pin`);
          if (!o) return null;
          const pv = c.pivotMany(['arm_pivot', 'wheel__pivot', 'axle', 'lid_gearbox', 'gear_train', 'motor', 'motor_plate', 'encoder', 'encoder_magnet', 'conn_wheel', 'screw_1', 'screw_2', 'screw_3', 'screw_4', 'screw_5', 'screw_6'],
            { axis: [1, 0, 0], origin: o, scope: `wheel_${s}` });
          return orient(pv, c.node(`wheel_${s}/wheel`), false);       // + = bánh tụt xuống
        });
        // tháo lắp + tách lớp: mỗi node một bộ dời
        const hInv = new THREE.Matrix4();
        const bottomOf = (n) => { c.holder.updateWorldMatrix(true, true); hInv.copy(c.holder.matrixWorld).invert(); const b = new THREE.Box3().setFromObject(n).applyMatrix4(hInv); return new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2); };
        const entry = (n0) => { const n = n0.parent?.name?.endsWith('__pivot') ? n0.parent : n0; if (!cadMovers.has(n)) cadMovers.set(n, { mv: c.move(n), layer: n0.userData.layer ?? null, steps: [], curV: new THREE.Vector3(), tgt: new THREE.Vector3(), name: n0.name }); return cadMovers.get(n); };
        for (const [k, , , , , layer] of CADMAP) if (layer != null) for (const n of c.nodes(k)) { n.userData.layer = layer; entry(n); }
        for (const [k, removed, off, spot, hide] of CADSTEPS) for (const n of c.nodes(k)) {
          const e = entry(n);
          const spotOff = spot ? new THREE.Vector3(...spot).sub(bottomOf(n)) : null;
          e.steps.push({ removed, off: new THREE.Vector3(...off), spotOff, hide });
        }
        cadAnim.led = c.node('cover_top/led_ring');
        cadAnim.picBoard = c.node('board_pic');
        cadAnim.motorBrush = c.node('motor_brush');
        cadAnim.fanWire = c.node('fan/conn_fan');
        cadAnim.screwsTop = c.nodes('screw_top_*');
        c.obj.traverse((o) => { if (o.isMesh) cadCatMeshes.push(o); });
      },
    });
    // bo gốc: ở chế độ CAD đặt vào chỗ bo PIC của mô hình CAD (trước, dưới lidar)
    const origPiece = pieces.find((pc) => pc.obj === origP);
    const ORIG_HOME = origPiece.home.clone(), ORIG_HOME_CAD = ORIG_HOME.clone().add(new THREE.Vector3(95, -20, 0));
    const cadGlowCats = (layer) => {
      for (const o of cadCatMeshes) {
        let cat = null;
        for (let q = o; q && q !== cad.obj; q = q.parent) if (q.userData.cat) { cat = q.userData.cat; break; }
        o.visible = layer === 'all' || cat === layer;
      }
    };
    let cadAngL = 0, cadAngR = 0, cadCastA = 0, cadDrop = 0, binBurst = false, lidTopV = 0, lidBrushV = 0;

    // ---------- trạng thái ----------
    let step = -1, lastKey = '', arenaOn = false, fault = null, faultT = 0;
    let px = 0, pz = 0, th = 0, mode = 'IDLE', backD = 0, turnTarget = 0, pendTurn = 0, bumpT = 0, bumpMask = 0, event = '';
    let cmdL = 0, cmdR = 0, vy = 0, fallen = false, falling = false, liftY = 0, flipA = 0, deadLogic = false;
    let fanTemp = 25, smoked = false, fired = false, hOffset = 0, picResetT = 0, popDone = false, spikeT = 0;
    const ZERO = new THREE.Vector3();
    let lastV = 16, lastSoc = -1, lowLatch = false;

    function setArena(on) {
      if (on === arenaOn) return;
      arenaOn = on;
      if (on) root.add(arena); else root.remove(arena);
      viewer?.frame?.();
    }
    function resetPose() { px = 0; pz = 0; th = 0; mode = 'FWD'; vy = 0; fallen = false; falling = false; robot.position.set(0, 0, 0); robot.rotation.set(0, 0, 0); }
    const randTurn = (bump) => { const mag = ((100 + Math.random() * 70) * Math.PI) / 180; return bump === 1 ? -mag : bump === 2 ? mag : Math.random() < 0.5 ? mag : -mag; };
    function ocv(soc) {
      const x = Math.max(0, Math.min(1, soc));
      for (let i = 1; i < OCV.length; i++) if (x <= OCV[i][0]) { const [a0, v0] = OCV[i - 1], [a1, v1] = OCV[i]; return 4 * (v0 + ((x - a0) / (a1 - a0)) * (v1 - v0)); }
      return 16.8;
    }
    // va chạm của thân tròn với tường/ vật cản → [nx, nz, sâu] (pháp tuyến đẩy robot ra)
    function collide() {
      const r = 176;
      const hits = [];
      if (px - r < ARENA.x0) hits.push([1, 0, ARENA.x0 - (px - r)]);
      if (pz - r < ARENA.z0) hits.push([0, 1, ARENA.z0 - (pz - r)]);
      if (pz + r > ARENA.z1) hits.push([0, -1, pz + r - ARENA.z1]);
      for (const o of OBST) {
        let cx, cz;
        if (o.c) { cx = o.c[0]; cz = o.c[1]; const dx = px - cx, dz = pz - cz, d = Math.hypot(dx, dz); if (d < r + o.r) hits.push([dx / d, dz / d, r + o.r - d]); }
        else {
          const [x0, x1, z0, z1] = o.rect;
          cx = Math.max(x0, Math.min(x1, px)); cz = Math.max(z0, Math.min(z1, pz));
          const dx = px - cx, dz = pz - cz, d = Math.hypot(dx, dz) || 1e-6;
          if (d < r) hits.push([dx / d, dz / d, r - d]);
        }
      }
      return hits;
    }

    return {
      object: root,
      setStep(i) { step = i; },
      triggerFault(id) {
        fault = id; faultT = 0; deadLogic = false; smoked = false; fired = false; fanTemp = 25; popDone = false; picResetT = 0; hOffset = 0; spikeT = 0; binBurst = false;
        step = -1;
        if (id === 'tat-cliff') { setArena(true); resetPose(); px = 300; pz = 100; th = -0.15; mode = 'FWD'; }
        if (id === 'nhieu-dong-co' || id === 'quen-gnd' || id === 'quat-ket') { setArena(true); resetPose(); }
        if (id === 'mat-nhac-banh') resetPose();
        if (id === 'nguoc-pin') {
          spikeT = 0.25;
          if (cad.active) {
            // CAD lắp ráp không có bo hạ áp/driver riêng → diễn trên bo PIC + giắc pin của mô hình thật
            const pic = cadAnim.picBoard, esp = cad.node('board_esp32'), xt = cad.node('battery/conn_main');
            fx.flash(pic, { size: 60, color: 0xfff0b0, intensity: 6 });
            fx.smoke(pic, { size: 30, duration: 6 });
            fx.scorch(pic, 0.6); if (esp) fx.scorch(esp, 0.5);
            if (xt) { fx.sparks(xt, { count: 40, speed: 60, size: 1.2 }); fx.smoke(xt, { size: 18, duration: 5 }); }
            deadLogic = true;
            return;
          }
          fx.flash(buckB, { size: 60, color: 0xfff0b0, intensity: 6 });
          fx.pop(buckCapIn, { force: 60, size: 10 });
          fx.smoke(buckB, { size: 30, duration: 6 });
          fx.scorch(buckB, 0.6);
          drvChips.forEach((c) => { fx.sparks(c, { count: 30, speed: 60, size: 1.2 }); fx.smoke(c, { size: 18, duration: 5 }); fx.scorch(c, 0.8); });
          deadLogic = true;
        }
      },
      resetFault(p) {
        fault = null; deadLogic = false; fanTemp = 25; liftY = 0; hOffset = 0; binBurst = false;
        resetPose(); mode = 'IDLE';
        setArena(!!p?.run);
      },
      update(dt, t, p) {
        faultT += dt;
        // ---------- tách lớp ----------
        L.forEach((g, i) => { g.position.y = p.explode * i * LAYER_GAP; });

        // ---------- tháo lắp: lật robot + chi tiết bay ra ----------
        const flipped = step >= 1 && step <= 4;
        flipA += ((flipped ? Math.PI : 0) - flipA) * Math.min(1, dt * 3);
        pivot.rotation.x = flipA;
        const kk = Math.min(1, dt * 3.5);
        for (const pc of pieces) {
          const rem = pc.removed(step);
          const tgt = rem ? (pc.off2 && !flipped ? pc.off2 : pc.off) : ZERO;
          if (pc.hide && rem && pc.arrived) { pc.obj.visible = false; pc.obj.position.copy(pc.home); continue; }   // ẩn: để ở chỗ cũ cho camera khỏi lệch
          pc.curV.lerp(tgt, kk);
          pc.arrived = rem && pc.curV.distanceTo(tgt) < 3;
          pc.obj.position.copy(pc.home).add(pc.curV);
          if (pc.hide) pc.obj.visible = true;
        }
        // ---------- CAD thật: tháo lắp + tách lớp + lọc hệ thống ----------
        origPiece.home.copy(cad.active ? ORIG_HOME_CAD : ORIG_HOME);
        const cadOn = cad.sync(p);
        if (cadOn) {
          for (const o of procHide) o.visible = false;      // vòng tháo lắp ở trên có thể vừa bật lại
          const press = bumpT > 0 ? 4 : 0;
          for (const [n, e] of cadMovers) {
            e.tgt.set(0, 0, 0);
            let hid = false;
            for (const st of e.steps) if (st.removed(step)) { e.tgt.copy(st.spotOff && !flipped ? st.spotOff : st.off); hid = hid || !!st.hide; }
            e.curV.lerp(e.tgt, kk);
            const ex = e.layer != null ? p.explode * e.layer * LAYER_GAP : 0;
            e.mv.set(toG([e.curV.x - (e.name === 'bumper' ? press : 0), e.curV.y + ex, e.curV.z]));
            if (e.steps.some((st) => st.hide)) n.visible = !(hid && e.curV.distanceTo(e.tgt) < 3);
          }
          const binOut = step >= 3 && step <= 11;
          lidTopV += ((binOut ? 1 : 0) - lidTopV) * kk;
          lidBrushV += ((step >= 2 && step <= 11 ? 1 : 0) - lidBrushV) * kk;
          cadAnim.lidTop?.set(cadAnim.lidTop.sign * lidTopV * 100 * Math.PI / 180);
          cadAnim.lidBrush?.set(cadAnim.lidBrush.sign * lidBrushV * 70 * Math.PI / 180);
          const g = step === 4 ? 0.6 + 0.4 * Math.sin(t * 6) : 0;
          for (const sc of cadAnim.screwsTop || []) cad.glow(sc, 0xffcc00, g * 1.5);
          const ck = `${p.layer}|${p.shell}`;
          if (ck !== lastCadKey) {
            lastCadKey = ck;
            cadGlowCats(p.layer);
            const cov = cad.node('cover_top');
            if (cov) cov.visible = !p.shell;
          }
        } else lastCadKey = '';
        // vít giấu phát sáng ở bước 5
        const sm = screws.material;
        if (sm.emissive) { const g = step === 4 ? 0.6 + 0.4 * Math.sin(t * 6) : 0; sm.emissive.setRGB(g, g * 0.8, 0); sm.emissiveIntensity = 1.5; }

        // ---------- lọc hệ thống + ẩn vỏ ----------
        const key = `${p.layer}|${p.shell}`;
        if (key !== lastKey) {
          lastKey = key;
          for (const o of cats) o.visible = p.layer === 'all' || o.userData.cat === p.layer;
          if (p.shell) topShell.visible = false;
        }

        // ---------- khu thử ----------
        const needArena = p.run || fault === 'tat-cliff' || fault === 'nhieu-dong-co' || fault === 'quen-gnd' || fault === 'quat-ket';
        setArena(needArena);
        const assembled = step < 0 || step >= 12;
        // pin yếu (< 13.2 V): ESP32 finish("LOWBAT"); pin cạn (< 12.4 V): PIC cắt hết
        // chốt như firmware: đã báo LOWBAT thì đứng yên tới khi người dùng tắt "Chạy thử" hoặc thay pin (đổi SOC)
        if (!p.run || p.soc !== lastSoc) lowLatch = false;
        lastSoc = p.soc;
        if (lastV < 13.2 && !fault && p.run) lowLatch = true;
        const lowbat = lowLatch && !fault;
        const running = (p.run || needArena || fault === 'mat-nhac-banh') && assembled && !deadLogic && !lowbat;

        // ---------- pin & PIC ----------
        const soc = p.soc / 100;
        const commOk = fault !== 'quen-gnd';
        const fanCmd = running && commOk && !fallen ? p.fan / 100 : 0;
        // PIC reset do nhiễu (sự cố): cứ ~1.6 s một lần, dừng 0.35 s, encoder về 0 → hướng lệch
        if (fault === 'nhieu-dong-co' && running) {
          picResetT -= dt;
          if (picResetT < -1.6) {
            picResetT = 0.35;
            hOffset += (Math.random() - 0.5) * 1.6;
            fx.sparks(cad.active && cadAnim.motorBrush ? cadAnim.motorBrush : bMotor, { count: 10, speed: 30, size: 1.5 });
            fx.flash(cad.active && cadAnim.led ? cadAnim.led : statusLed, { size: 20, color: 0xff4040 });
          }
        }
        const picResetting = picResetT > 0;

        // ---------- máy trạng thái AUTO (va chạm-quay) ----------
        let tL = 0, tR = 0;
        bumpMask = 0;
        let cliff = false;
        if (running && arenaOn && !fallen && !falling && commOk && !picResetting) {
          const hits = collide();
          for (const [nx, nz, dpt] of hits) {
            px += nx * dpt; pz += nz * dpt;
            // vị trí chạm so với hướng robot → bumper trái/phải
            const cxw = -nx, czw = -nz;
            const lx = cxw * Math.cos(th) - czw * Math.sin(th);
            const lz = cxw * Math.sin(th) + czw * Math.cos(th);
            const ang = Math.atan2(-lz, lx);
            if (Math.abs(ang) < 1.75) bumpMask |= ang > 0.26 ? 1 : ang < -0.26 ? 2 : 3;
          }
          if (fault === 'tat-cliff') {
            if (px > ARENA.x1 - 40) { falling = true; vy = 0; }
          } else {
            for (const a of CLIFF_ANG) { const sx = px + 155 * Math.cos(th + a); if (sx > ARENA.x1) cliff = true; }
          }
          const hit = bumpMask || cliff;
          if (hit) { bumpT = 0.25; if (mode === 'FWD') { mode = 'BACKUP'; backD = 0; pendTurn = randTurn(bumpMask); event = bumpMask === 1 ? 'BUMP_L' : bumpMask === 2 ? 'BUMP_R' : bumpMask ? 'BUMP_C' : 'CLIFF'; } }
          if (mode === 'IDLE') mode = 'FWD';
          if (mode === 'FWD') { tL = tR = SPEED_CRUISE; if (hit) tL = tR = 0; }
          else if (mode === 'BACKUP') { tL = tR = -SPEED_BACK; if (backD >= BACKUP_MM) { mode = 'TURN'; turnTarget = th + pendTurn; } }
          else if (mode === 'TURN') {
            const err = turnTarget - th;
            if (Math.abs(err) < (2.5 * Math.PI) / 180) mode = 'FWD';
            else { const s = Math.max(160, Math.min(380, Math.abs(err) * 600)); tL = err > 0 ? -s : s; tR = -tL; }
          }
          // sự cố nhiễu: odometry hỏng → ESP32 lái lệch hướng
          if (fault === 'nhieu-dong-co' && mode === 'FWD') { const corr = Math.max(-250, Math.min(250, hOffset * 400)); tL -= corr; tR += corr; }
        }
        if (fault === 'mat-nhac-banh') { tL = tR = SPEED_CRUISE; }
        // PIC ramp 10 ‰/ms (dừng khẩn thì cắt ngay)
        const rampStep = 10 * dt * 1000;
        const ramp = (c, tg) => (Math.abs(tg) < Math.abs(c) && Math.sign(tg) !== Math.sign(c) ? tg : c + Math.max(-rampStep, Math.min(rampStep, tg - c)));
        cmdL = picResetting || !running ? 0 : ramp(cmdL, tL);
        cmdR = picResetting || !running ? 0 : ramp(cmdR, tR);

        // ---------- chuyển động ----------
        const vL = (cmdL / 1000) * VMAX, vR = (cmdR / 1000) * VMAX;
        const lifted = fault === 'mat-nhac-banh';
        if (arenaOn && !lifted && !fallen) {
          const v = (vL + vR) / 2, w = (vR - vL) / BASE;
          th += w * dt;
          px += v * Math.cos(th) * dt;
          pz -= v * Math.sin(th) * dt;
          if (mode === 'BACKUP') backD += Math.abs(v) * dt;
          if (falling) {
            vy -= 9810 * dt;
            robot.position.y += vy * dt;
            px += 150 * dt;
            robot.rotation.z = Math.max(-0.9, robot.rotation.z - dt * 2.2);
            if (robot.position.y <= -ARENA.drop) {
              robot.position.y = -ARENA.drop; falling = false; fallen = true; robot.rotation.z = -0.15;
              if (!popDone) {
                popDone = true;
                if (cad.active) binBurst = true;            // CAD: nắp hộp bụi bật tung
                else fx.pop(binIn, { force: 120, size: 40 });
                fx.smoke(robot, { size: 120, duration: 3, color: 0x9a8a78 });
              }
            }
          }
        }
        if (arenaOn || lifted) { robot.position.x = px; robot.position.z = pz; robot.rotation.y = th; }
        else if (!falling && !fallen) { robot.position.set(0, 0, 0); robot.rotation.set(0, 0, 0); px = pz = th = 0; }
        liftY += ((lifted ? 120 : 0) - liftY) * Math.min(1, dt * 3);
        if (!falling && !fallen) robot.position.y = liftY;
        wheelLift.forEach((g) => { g.position.y = -Math.min(15, liftY * 0.15); });

        // ---------- quay bánh, chổi, quạt, lidar ----------
        wheelSpin[0].rotation.z -= (vL / WHEEL_R) * dt;
        wheelSpin[1].rotation.z -= (vR / WHEEL_R) * dt;
        const brushesOn = running && commOk && !picResetting && !fallen;
        brushSpin.rotation.z -= (brushesOn ? 2 * Math.PI * 4 : 0) * dt;
        sideSpin[0].rotation.y += (brushesOn ? 2 * Math.PI * 1.5 : 0) * dt;
        sideSpin[1].rotation.y -= (brushesOn ? 2 * Math.PI * 1.5 : 0) * dt;
        const fanStalled = fault === 'quat-ket';
        rotor.rotation.y += (fanCmd > 0 && !fanStalled && !fallen ? 2 * Math.PI * 6 * (0.3 + fanCmd) : 0) * dt;
        turret.rotation.y += (running && !deadLogic ? 2 * Math.PI * 0.8 : 0) * dt;
        swivel.rotation.y += ((Math.atan2(vR - vL, 300) * 0.8) - swivel.rotation.y) * Math.min(1, dt * 4);
        // ---------- CAD thật: bánh, chổi, quạt, lidar, bánh xoay, treo bánh, LED ----------
        cadAngL -= (vL / WHEEL_R) * dt; cadAngR -= (vR / WHEEL_R) * dt;
        cadCastA -= (((vL + vR) / 2) / 12.5) * dt;
        cadDrop += ((lifted ? Math.min(1, liftY / 100) : 0) - cadDrop) * Math.min(1, dt * 4);
        if (cadOn) {
          cadAnim.wheel?.[0]?.set(cadAngL); cadAnim.wheel?.[1]?.set(cadAngR);
          cadAnim.brush?.set(brushSpin.rotation.z);
          cadAnim.side?.set(sideSpin[1].rotation.y);
          cadAnim.fan?.set(rotor.rotation.y);
          cadAnim.head?.set(turret.rotation.y);
          cadAnim.swivel?.set(swivel.rotation.y);
          cadAnim.castW?.set(cadCastA);
          cadAnim.arm?.forEach((a) => a?.set(a.sign * cadDrop * 12 * Math.PI / 180));
          cadAnim.lidBin?.set(cadAnim.lidBin.sign * (binBurst ? 95 : 0) * Math.PI / 180);
          if (cadAnim.led) {
            const on = deadLogic ? 0 : picResetting ? (Math.sin(t * 40) > 0 ? 2 : 0) : running ? 1.2 : 0.35;
            cad.glow(cadAnim.led, picResetting ? 0xff2020 : running ? 0x20ff70 : 0x2080ff, on);
          }
        }
        bumpT = Math.max(0, bumpT - dt);
        bumperIn.position.x = bumpT > 0 ? -3 : 0;
        const led = statusLed.material;
        if (led.emissive) led.emissiveIntensity = deadLogic ? 0 : picResetting ? (Math.sin(t * 40) > 0 ? 2 : 0) : running ? (Math.sin(t * 6) > 0 ? 1.5 : 0.1) : 0.6;

        // ---------- dòng điện ----------
        const iWheel = (c) => (Math.abs(c) > 1 ? 0.12 + 0.18 * (Math.abs(c) / SPEED_CRUISE) : 0);
        let iWheels = iWheel(cmdL) + iWheel(cmdR);
        const iMain = brushesOn ? 0.6 : 0;
        const iSide = brushesOn ? 0.2 : 0;
        let iFan = fanCmd > 0 ? 0.1 + 2.9 * fanCmd * fanCmd * fanCmd : 0;
        if (fanStalled && running) iFan = 12;
        const p5 = deadLogic ? 0 : 0.3 * 5 + (running ? 0.35 * 5 : 0);         // logic 0.3 A + lidar 0.35 A ở 5 V
        const v0 = ocv(soc);
        let iLogic = p5 / (Math.max(10, v0) * 0.88);
        let itot = iWheels + iMain + iSide + iFan + iLogic;
        if (fault === 'nguoc-pin') { spikeT = Math.max(0, spikeT - dt); itot = spikeT > 0 ? 48 : 0; iWheels = iFan = iLogic = 0; }
        const vbat = Math.max(0, v0 - itot * R_PACK);
        lastV = vbat;
        const pct = Math.max(0, Math.min(100, ((vbat * 1000 - 12800) / (16600 - 12800)) * 100));
        const runtime = itot > 0.01 ? (CAP_AH * soc * 0.9 * 60) / itot : 0;

        // sự cố quạt kẹt: dây nóng → khói → lửa
        if (fault === 'quat-ket') {
          // dây AWG26 dài ~0.3 m: P = I²R ≈ 12²×0.04 ≈ 6 W, C ≈ 0.35 J/K, Rth ≈ 32 K/W → ΔT∞ ≈ 190 K, τ ≈ 11 s (tua nhanh 2×)
          fanTemp += ((25 + 190 * (iFan / 12) * (iFan / 12)) - fanTemp) * Math.min(1, (dt * 2) / 11);
          const fw = cad.active && cadAnim.fanWire ? cadAnim.fanWire : fanWire;
          fx.heat(fw, Math.max(0, (fanTemp - 60) / 120));
          if (fanTemp > 105 && !smoked) { smoked = true; fx.smoke(fw, { size: 25, duration: 8 }); }
          if (fanTemp > 160 && !fired) { fired = true; fx.fire(fw, { size: 12, duration: 5 }); fx.scorch(fw, 0.9); }
        }

        // ---------- số đo ----------
        readout('vbat', vbat);
        readout('pct', pct);
        readout('itot', itot);
        readout('budget', `bánh ${iWheels.toFixed(2)} · chổi ${(iMain + iSide).toFixed(2)} · quạt ${iFan.toFixed(2)} · logic ${iLogic.toFixed(2)}`);
        readout('pw', vbat * itot);
        readout('runtime', runtime);
        let st;
        if (step >= 0 && step < 12) st = `🔧 Đang ở bước ${step + 1} — đã ngắt nguồn`;
        else if (fault === 'nguoc-pin') st = '💥 Ngược cực: tụ nổ, XL4015 + DRV8871 cháy — mạch chết';
        else if (fault === 'quen-gnd') st = 'PIC: không có khung hợp lệ 300 ms → dừng (flags bit1 · E,PIC_LOST)';
        else if (fault === 'nhieu-dong-co') st = picResetting ? '⚡ PIC RESET do nhiễu! enc về 0 → odometry hỏng' : `${mode} · hướng lệch ${((hOffset * 180) / Math.PI).toFixed(0)}°`;
        else if (fault === 'quat-ket') st = `🔥 Quạt kẹt: ${iFan.toFixed(1)} A qua dây AWG26 · dây ${fanTemp.toFixed(0)} °C`;
        else if (fault === 'mat-nhac-banh') st = '⚠ Robot bị nhấc nhưng drop_mask = 0 → bánh & chổi vẫn quay!';
        else if (fault === 'tat-cliff') st = fallen ? '❌ Đã rơi xuống cầu thang!' : falling ? '❌ Đang rơi…' : '⚠ Phản xạ cliff đã tắt (SAFETY bit1 = 0)…';
        else if (vbat < 12.4) st = '🪫 Pin cạn < 12.4 V → PIC cắt hết (flags bit3)';
        else if (lowbat && p.run) st = '🪫 Pin yếu < 13.2 V → ESP32 dừng (E,LOWBAT)';
        else if (running) st = `AUTO · ${mode}${event ? ' · E,' + event : ''}${cliff ? ' · CLIFF' : ''}`;
        else st = 'IDLE — bật "Chạy thử" hoặc gửi MODE:AUTO';
        readout('state', st);
        return [Math.min(16, itot), cmdL, cmdR];
      },
    };
  },
};
