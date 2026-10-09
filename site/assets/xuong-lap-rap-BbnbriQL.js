const n=`// 🛠 Xưởng lắp ráp tự do — bàn làm việc 2 × 1 m + khung đáy robot Ø350 có "ô lắp mờ" cho từng module.
// Kéo MỌI linh kiện của lab (Thư viện bên trái) ra bàn, ghép vào khung: tới gần ô ~40 mm là tự bắt dính.
// Ô xanh = đúng, ô đỏ = lắp vừa nhưng sai chỗ (kèm lý do). Bảng kiểm tra: % hoàn thành, thiếu gì, cảnh báo
// (cầu chì, buck, BSS138, cliff, bumper, trọng tâm), kiểm tra đi dây (docs/01) và chạy thử va chạm-quay.
// Hệ trục robot: +x = phía trước, +z = bên phải, y lên; sàn y = 0 (giống robot-assembly).
import * as H from './_xuong_helpers.js';

const { SLOTS, WIRES, ARENA, OBST } = H;
const VMAX = 600, BASE = 235;                       // mm/s ở 1000 ‰, khoảng cách 2 bánh
const CRUISE = 450, BACK = 300, BACKUP_MM = 60;     // như firmware ESP32 (robot.cpp)
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const small = (s) => \`<span style="display:block;font-size:12px;font-weight:400;line-height:1.35">\${s}</span>\`;

// tab "Thông số": lý do vị trí từng module (lấy từ bảng ô lắp, mỗi loại 1 dòng)
const SPEC_ROWS = (() => {
  const seen = new Set(), rows = [['Bàn & khung', 'Bàn 2.0 × 1.0 m · khung đáy Ø350 mm trên giá kê 45 mm · tầng mạch mica ở y = 80 mm · đế lidar y = 118 mm · bắt dính trong bán kính ~40 mm (module to: 50–60 mm)']];
  for (const s of SLOTS) { if (seen.has(s.kind)) continue; seen.add(s.kind); rows.push([s.kind + (s.req === false ? ' (khuyên dùng)' : ''), s.why]); }
  return rows;
})();
const WIRE_LIST_HTML = \`<ul>\${WIRES.map((w) => \`<li><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#\${H.WIRE_COLORS[w.kind].toString(16).padStart(6, '0')};margin-right:5px"></span>\${w.label}</li>\`).join('')}</ul>\`;

const DEF = {
  id: 'xuong-lap-rap',
  name: 'Xưởng lắp ráp tự do',
  category: 'lap-rap',
  order: 2,
  icon: '🛠',
  summary: 'Bàn làm việc có khung robot Ø350 mm và ô lắp mờ cho từng module. Kéo bất kỳ linh kiện nào của lab ra bàn, sắp xếp, ghép thành robot của riêng bạn — xưởng chấm đúng/sai vị trí, cảnh báo lỗi nguồn, kiểm tra đi dây và cho chạy thử.',
  tags: ['lắp ráp', 'xưởng', 'kéo thả', 'sandbox', 'tự do', 'trọng tâm', 'đi dây', 'chạy thử', 'workshop'],

  params: [
    { id: 'run', label: '▶ Chạy thử (nhấc robot xuống khu thử)', type: 'button' },
    { id: 'home', label: '■ Dừng & đưa robot về bàn', type: 'button' },
    { id: 'wire', label: '🔌 Kiểm tra đi dây', type: 'button' },
    { id: 'auto', label: '🪄 Lắp đúng tất cả (xem đáp án — Ctrl+Z để hoàn tác)', type: 'button' },
    { id: 'kit', label: '📦 Tháo hết, bày bộ linh kiện ra bàn', type: 'button' },
    { id: 'ghost', label: 'Hiện ô lắp mờ + đường gió', type: 'toggle', value: true },
    { id: 'wires', label: 'Hiện dây 3D (sau khi kiểm tra đi dây)', type: 'toggle', value: true },
    { id: 'speed', label: 'Tốc độ chạy thử', type: 'select', value: '1.5', options: [['1', '1× (thật)'], ['1.5', '1.5×'], ['3', '3×']] },
  ],
  readouts: [
    { id: 'pct', label: 'Hoàn thành (module bắt buộc đúng chỗ)', unit: '%' },
    { id: 'missing', label: 'Còn thiếu', unit: '' },
    { id: 'warn', label: 'Cảnh báo', unit: '' },
    { id: 'wiring', label: 'Đi dây nối được', unit: '' },
    { id: 'mass', label: 'Khối lượng ước tính', unit: 'kg' },
    { id: 'cg', label: 'Trọng tâm: trước trục bánh · độ cao', unit: 'mm' },
    { id: 'dust', label: 'Rác đã gom (chạy thử)', unit: '%' },
    { id: 'state', label: 'Trạng thái', unit: '' },
  ],

  steps: [
    { title: 'Bước 1 — Khung đáy, giá kê & dụng cụ', text: 'Khung đáy Ø350 mm nằm trên giá kê cao 45 mm (bánh không chạm bàn). Bộ linh kiện đã bày sẵn: <b>bên phải là cơ khí, bên trái là nguồn & điện tử</b>. Dụng cụ: tua vít PH1/PH2, kìm tuốt dây, mỏ hàn, đồng hồ vạn năng, thảm chống tĩnh điện. Nguyên tắc: lắp từ <b>dưới lên trên, nặng trước nhẹ sau</b>; pin chỉ cắm ở bước cuối sau khi đã đo không chập.' },
    { title: 'Bước 2 — Hai module bánh xe', text: 'Bắt 2 module bánh (động cơ + hộp số + encoder Hall + công tắc nhấc bánh) vào hốc bánh, 2–3 vít mỗi bên, hộp số quay vào trong. Hai bánh cách nhau <b>235 mm</b> trên đường kính ngang qua tâm → robot xoay tại chỗ quanh tâm. Thử: nhấc khung lên, bánh phải tụt xuống nhờ lò xo treo.' },
    { title: 'Bước 3 — Bánh xoay trước', text: 'Ấn bánh xoay vào ngàm phía trước, cách trục bánh 125 mm. Robot đứng trên 3 điểm: 2 bánh + bánh xoay; <b>trọng tâm phải nằm trong tam giác này</b>, tốt nhất hơi trước trục bánh để bánh xoay luôn có tải.' },
    { title: 'Bước 4 — Chổi cuộn & 2 chổi cạnh', text: 'Chổi cuộn vào khe ngay trước trục bánh (đầu vuông về phía động cơ), đóng nắp chặn. Hai chổi cạnh ở 2 góc trước, 1 vít PH1 mỗi cái — trái và phải quay ngược chiều nhau để cùng gom rác vào giữa đường chổi cuộn.' },
    { title: 'Bước 5 — Hộp bụi + lọc HEPA', text: 'Hộp bụi vào khoang phía sau, rút ra từ đuôi để đổ rác. Lưới lọc thô + HEPA nằm ở cửa ra. Kiểm tra gioăng cao su miệng vào và cửa ra — hở 1 mm là mất đáng kể lực hút.' },
    { title: 'Bước 6 — Quạt hút (sau lọc)', text: 'Quạt đặt <b>ngay sau cửa ra của hộp bụi</b> — "phía sạch". Đường gió: chổi → miệng hút → hộp bụi → lưới lọc → HEPA → quạt → cửa xả. Đặt ngược thì bụi, cát, tóc đi thẳng vào cánh quạt 15–20 nghìn vòng/phút.' },
    { title: 'Bước 7 — Pin 4S + cầu chì + công tắc', text: 'Pack 4S + BMS nằm <b>thấp, giữa 2 bánh, hơi trước trục</b>: khối nặng nhất quyết định trọng tâm. Cầu chì 10 A ngay sau cực + (dây trước cầu chì < 5 cm), rồi tới công tắc chính gắn sẵn ở thành sau. Chưa cắm giắc pin!' },
    { title: 'Bước 8 — Mạch hạ áp buck 5 V', text: 'Buck XL4015: chỉnh trimmer cho ra <b>đúng 5.0 V bằng đồng hồ TRƯỚC khi nối bo logic</b> (module mới thường để sẵn ~12 V). Đặt ở mép tầng mạch cho thoáng: cuộn cảm và diode SS54 ấm lên khi tải 1–2 A.' },
    { title: 'Bước 9 — Bo PIC16F877A', text: 'Cắm PIC vào đế 40 chân trên bo đục lỗ, <b>đúng chiều khuyết</b> (chân 1 cạnh chấm tròn). Bo có sẵn thạch anh 20 MHz + 2 tụ 22 pF, trở MCLR 10 kΩ, tụ 100 nF sát mỗi cặp VDD/VSS, header ICSP 6 chân.' },
    { title: 'Bước 10 — 2 driver DRV8871 (+ bo MOSFET chổi)', text: 'Mỗi DRV8871 ngay trên động cơ bánh của nó (dây động cơ ngắn, ít nhiễu), PowerPAD dán lên đế nhôm, hàn tụ 1000 µF ở đầu VM. Bo MOSFET IRLZ44N + diode SS34 gần động cơ chổi cuộn.' },
    { title: 'Bước 11 — ESP32-S3 + chuyển mức BSS138', text: 'ESP32 ở giữa-sau tầng mạch, <b>xa động cơ chổi than</b> (tia lửa cổ góp + PWM 20 kHz gây nhiễu). BSS138 nằm giữa PIC và ESP32: RC7 của PIC là chân Schmitt cần ≥ 4 V, còn GPIO ESP32 chỉ chịu tối đa 3.6 V.' },
    { title: 'Bước 12 — Cảm biến chống rơi ×4 + MPU6050', text: '4 cảm biến chống rơi ở mép trước đáy (trái, trước-trái, trước-phải, phải), nhìn thẳng xuống, cách sàn ~10–15 mm — phải thấy mép hố TRƯỚC bánh xoay. MPU6050 nằm phẳng gần tâm quay (trung điểm trục bánh).' },
    { title: 'Bước 13 — Bumper', text: 'Bumper ôm nửa trước, 2 lò xo hồi, 2 công tắc hành trình: trái → RB4, phải → RB5 (chạm = 0). Bấm thử từng bên nghe "tách" và đo bằng đồng hồ.' },
    { title: 'Bước 14 — Lidar trên nóc', text: 'Lidar lên cột đồng cao nhất, lệch về sau: tia quét 360° không bị vỏ che, khối 190 g phía sau cân với chổi + bánh xoay phía trước. Dây: TX → GPIO16, PWM motor ← GPIO15.' },
    { title: 'Bước 15 — Đi dây & đo kiểm', text: 'Đi dây theo docs/01 (danh sách hiện ở bảng 📋 bên phải): đỏ = VBAT, cam = 5 V, đen = GND hình sao về cực âm pin, vàng = PWM, xanh dương = UART, xanh lá = analog. Trước khi cắm pin: đo VBAT↔GND và 5V↔GND <b>không chập</b>, đo buck ra 5.0 V.' },
    { title: 'Bước 16 — Cắm pin & chạy thử', text: 'Cắm pin, bật công tắc. Robot được nhấc xuống khu thử chạy AUTO: đi thẳng 450 ‰ → va/thấy hố → lùi 60 mm → quay 100–170° → đi tiếp. Sau đó thử mục <b>⚠️ Thử lắp sai</b> để xem hậu quả từng lỗi lắp ráp.' },
  ],

  faults: [
    { id: 'thieu-buck', label: 'Quên mạch buck — nối PIC & ESP32 thẳng vào pin', severity: 'chay',
      what: '<p>Vừa bật công tắc: mùi khét, <b>khói bốc từ con PIC</b> và LDO trên ESP32, chip nóng tới mức không chạm được. Robot đứng im, không đèn, không BLE.</p>',
      why: '<p>VDD của PIC16F877A chỉ cho phép 4–5.5 V (tối đa tuyệt đối 7.5 V); pin 4S cho 14.4–16.8 V — gấp 3 lần. Lớp ô-xít cổng bị đánh thủng, dòng chạy qua diode bảo vệ ESD → chip đoản mạch nội và tự đốt nóng. ESP32 DevKit có LDO 3.3 V: vào 16.8 V, tải 0.3 A → tiêu tán <code>(16.8 − 3.3) × 0.3 ≈ 4 W</code> trên vỏ SOT-223 (chịu ~1 W) → quá nhiệt/quá áp, cháy.</p>',
      fix: '<p>Luôn có buck XL4015 riêng cho logic, <b>chỉnh ra 5.0 V bằng đồng hồ trước khi nối tải</b>. Thêm cầu chì và (nếu được) diode zener/TVS 5.6 V ở thanh 5 V. Lần đầu cấp điện qua nguồn bàn giới hạn dòng 0.3–1 A. Đã cháy: thay PIC (DIP-40 cắm đế nên thay dễ), kiểm tra lại LDO ESP32.</p>' },
    { id: 'khong-cau-chi', label: 'Không có cầu chì — dây quạt cọ mép vít bị chập', severity: 'chay',
      what: '<p>Chạy được vài giây thì tóe lửa ở dây quạt, <b>dây đỏ rực, vỏ dây chảy, khói đen</b>, lửa bén sang bụi trong robot và khối pin. Không có gì ngắt dòng.</p>',
      why: '<p>Rung khi chạy làm dây cọ vào mép vít kim loại → tróc vỏ → chập VBAT xuống GND. Dòng ngắn mạch <code>I ≈ 14.4 V / (0.18 Ω pin + 0.05 Ω dây) ≈ 60 A</code>. Dây AWG22 (~0.053 Ω/m) tiêu tán <code>60² × 0.053 ≈ 190 W/m</code> → vỏ PVC (chảy ~105 °C) cháy trong chưa đầy 1 giây. Cell 18650 chịu 10–20 A liên tục: ở 60 A nóng nhanh, có thể xì khí, bắt lửa nếu BMS không cắt.</p>',
      fix: '<p><b>Cầu chì 10 A ngay sau cực + của pin</b> (đoạn dây trước cầu chì càng ngắn càng tốt) — đứt trong vài ms khi chập. BMS có bảo vệ ngắn mạch. Dây đủ cỡ (quạt ≥ AWG20), ống co nhiệt, kẹp/đi dây tránh cạnh sắc và vít. Cháy pin Li-ion: tránh xa, dùng nhiều nước/cát, không dùng bình CO₂ cho pin lớn.</p>' },
    { id: 'quat-truoc-hop-bui', label: 'Lắp quạt hút TRƯỚC hộp bụi (đổi chỗ quạt ↔ hộp bụi)', severity: 'hong',
      what: '<p>Lúc đầu hút rất mạnh. Vài giây sau quạt <b>kêu rè rè, rung</b>, có mùi khét rồi tắt hẳn. Lực hút = 0, rác vương lại trên sàn.</p>',
      why: '<p>Quạt đứng ở "phía bẩn": cát, vụn, tóc đập thẳng vào cánh quạt quay 15–20 nghìn vòng/phút → cánh mẻ, <b>mất cân bằng</b>, rung phá bạc đạn; bụi mịn chui vào động cơ, tóc quấn trục → kẹt. Động cơ đứng thì dòng tăng tới mức kẹt (vài ampe) → cuộn dây/driver quá nhiệt. Bộ lọc ở đúng chỗ là để <b>bảo vệ quạt</b>.</p>',
      fix: '<p>Thứ tự bắt buộc: chổi → miệng hút → hộp bụi (rác lắng) → lưới lọc thô → HEPA → <b>quạt</b> → cửa xả. Gioăng kín ở mọi chỗ nối, không chạy khi chưa lắp lọc. Firmware đọc chân FG của quạt (GPIO5): có lệnh chạy mà FG = 0 → tắt quạt, báo lỗi.</p>' },
    { id: 'esp-canh-dong-co', label: 'Đổi chỗ ESP32 ↔ DRV8871 trái', severity: 'loi',
      what: '<p>Robot chạy giật cục: cứ 2 giây lại <b>khựng, đèn ESP32 chớp như vừa khởi động</b>, rồi đi tiếp theo hướng lạ. Sau ~7 s bánh trái tắt hẳn → robot quay vòng tròn tại chỗ. Driver trái nóng bỏng tay.</p>',
      why: '<p><b>ESP32 nằm trên động cơ chổi than:</b> tia lửa ở cổ góp + PWM 20 kHz tạo xung nhiễu điện từ vài chục volt, cảm ứng vào dây 3.3 V/ chân EN → brown-out reset; mỗi lần reset mất trạng thái odometry. <b>DRV8871 ở giữa tầng mạch:</b> không có đế nhôm tản nhiệt, dây động cơ dài; tổn hao <code>P = I² × R<sub>DS(on)</sub> ≈ 1.5² × 0.57 ≈ 1.3 W</code> trong vỏ nhỏ → nhiệt độ chạm 175 °C → mạch bảo vệ nhiệt tự ngắt (thermal shutdown).</p>',
      fix: '<p>Driver sát động cơ của nó, PowerPAD dán lên đế nhôm/ mặt đồng lớn; ESP32 xa động cơ, xa dây động cơ (xoắn đôi dây động cơ, tụ 100 nF hai cực mỗi động cơ, tụ 1000 µF đầu driver). Nguồn logic riêng qua buck, GND hình sao.</p>' },
    { id: 'thieu-bss138', label: 'Bỏ mạch chuyển mức BSS138 — nối thẳng UART PIC ↔ ESP32', severity: 'loi',
      what: '<p>Robot chạy <b>giật từng cơn</b> (khung lệnh lúc nhận được lúc không) rồi sau vài giây đứng hẳn. App báo mất liên lạc với PIC. Về sau ESP32 không nhận UART nữa dù đã lắp lại BSS138.</p>',
      why: '<p>PIC TX = 5 V đâm vào GPIO18 của ESP32 (tối đa 3.6 V): dòng chạy qua diode bảo vệ lên đường 3.3 V → chân hỏng dần. Chiều ngược lại, ESP32 TX chỉ 3.3 V trong khi RC7/RX của PIC là chân <b>Schmitt Trigger cần ≥ 0.8·VDD = 4 V</b> mới chắc chắn hiểu là 1 → byte sai checksum → PIC bỏ khung; quá 300 ms không có DRIVE hợp lệ thì PIC tự dừng động cơ (phản xạ an toàn).</p>',
      fix: '<p>Luôn qua BSS138 (2 kênh, kéo lên 10 kΩ mỗi phía): HV = 5 V phía PIC, LV = 3.3 V phía ESP32, chung GND. Kiểm tra bằng máy hiện sóng: mức cao phía ESP32 ≤ 3.3 V, phía PIC ≈ 5 V.</p>' },
    { id: 'pin-sau', label: 'Đổi chỗ pin ↔ hộp bụi (pin ra đuôi robot)', severity: 'hong',
      what: '<p>Robot <b>ngóc đầu</b>: bánh xoay phía trước lơ lửng, đuôi lết xuống sàn. Đi lạng lách, quay không đều, đâm vào vật cản thì nảy ngửa.</p>',
      why: '<p>Robot 2 bánh + 1 bánh xoay chỉ vững khi trọng tâm nằm <b>giữa trục bánh (x = 0) và bánh xoay (x = 125 mm)</b>. <code>x<sub>G</sub> = Σ m<sub>i</sub>·x<sub>i</sub> / Σ m<sub>i</sub></code>: đổi chỗ pin 300 g (x = 0) với hộp bụi 100 g (x = −125) làm x<sub>G</sub> thay đổi <code>(0.3·(−125) + 0.1·125) / 2.5 ≈ −10 mm</code> → từ ~+7 mm xuống ~−3 mm, tức là ra SAU trục bánh → mô-men trọng lực lật robot về sau, bánh xoay mất tải nên không còn giữ hướng. Hộp bụi đầy rác còn làm tệ thêm.</p>',
      fix: '<p>Khối nặng nhất (pin) đặt <b>thấp, ở giữa 2 bánh</b>; các khối nặng phía sau (hộp bụi, quạt, lidar) phải được cân bằng bởi phía trước (chổi, bánh xoay, bumper). Sau khi lắp, đọc ô "Trọng tâm" trong bảng số đo: phải dương (trước trục) và nhỏ hơn 125 mm. Kiểm tra tay: đặt robot lên sàn, ấn nhẹ đuôi rồi thả — robot phải tự trở lại 3 điểm tựa.</p>' },
    { id: 'thieu-cliff', label: 'Chỉ lắp 2 cảm biến chống rơi ở hai hông (thiếu 2 cái phía trước)', severity: 'hong',
      what: '<p>Robot đi thẳng ra mép bậc thang và <b>lao xuống</b>: va đập, bung hộp bụi, gãy bánh xoay, có thể nứt vỏ hoặc móp pin.</p>',
      why: '<p>Hai cảm biến còn lại ở góc ±80° (hai bên hông) chỉ nhô trước tâm <code>155 × cos 80° ≈ 27 mm</code>, trong khi bánh xoay ở 125 mm: khi cảm biến thấy mép thì bánh xoay đã hụt chân từ lâu. Hai cảm biến ±18° nhô trước <code>155 × cos 18° ≈ 147 mm</code> — trước bánh xoay 22 mm; đi 0.27 m/s, PIC cấm tiến trong 1 chu kỳ 5 ms (robot trôi ~1–2 mm) nên dư đủ.</p>',
      fix: '<p>Đủ 4 cảm biến trải từ trái sang phải ở mép trước, nằm trước bánh xoay; hiệu chỉnh <code>CLIFF_THRESHOLD</code> trên sàn tối màu; không tắt <code>CLIFF_ENABLE_MASK</code> khi thử thật. Thử trên bàn có rào chắn trước.</p>' },
    { id: 'thieu-bumper', label: 'Không lắp bumper', severity: 'loi',
      what: '<p>Robot đâm vào thùng/ tường rồi <b>cứ thế ép vào</b>: bánh quay trượt tại chỗ, kêu rít, mòn lốp, xước đồ đạc. Không lùi, không quay.</p>',
      why: '<p>Không có công tắc va chạm thì PIC (RB4/RB5) và ESP32 không bao giờ nhận cờ "bump" → máy trạng thái AUTO mãi ở FWD. Động cơ bị ghì gần như đứng yên → dòng tăng về phía dòng kẹt <code>I ≈ V/R</code>, driver và động cơ nóng dần.</p>',
      fix: '<p>Lắp bumper + 2 công tắc (trái/phải) với lò xo hồi; kiểm tra bằng app mỗi lần trước khi chạy. Firmware nên có thêm phát hiện kẹt: lệnh tiến mà encoder không tăng trong 1 s → coi như va chạm.</p>' },
    { id: 'thieu-driver', label: 'Quên driver DRV8871 bánh phải', severity: 'nhe',
      what: '<p>Robot <b>xoay vòng tròn</b> quanh bánh phải đứng yên, không đi thẳng được.</p>',
      why: '<p>Kinematics vi sai: <code>v = (v<sub>L</sub> + v<sub>R</sub>)/2</code>, <code>ω = (v<sub>R</sub> − v<sub>L</sub>)/L</code>. Bánh phải không có điện → v<sub>R</sub> = 0 → robot quay với bán kính L/2 = 117 mm quanh bánh phải.</p>',
      fix: '<p>Lắp đủ 2 driver, đi dây CCP2/RD2 → IN1/IN2 phải. Kiểm tra trước từng bánh bằng BOOT_MOTOR_SELFTEST khi robot đang trên giá kê.</p>' },
  ],

  info: {
    overview: \`
      <p>Đây là <b>xưởng lắp ráp tự do</b>: bàn làm việc với khung đáy robot Ø350 mm ở giữa, mỗi chỗ cần lắp là một <b>ô mờ màu xanh</b>. Bảng <b>📦 Thư viện</b> (góc trái khung 3D) chứa <b>mọi linh kiện của lab</b>, nhóm theo danh mục — chính là các mô hình 3D bạn đã học ở từng trang.</p>
      <ul>
        <li><b>Kéo</b> linh kiện từ Thư viện thả lên bàn (hoặc bấm mục rồi bấm vào cảnh). Bấm để chọn, kéo để dời, <b>Q/E</b> xoay, <b>Del</b> xoá, <b>Ctrl+Z</b> hoàn tác, xuất/nhập file JSON bằng ⤓/📂.</li>
        <li>Kéo linh kiện tới gần ô lắp (~40 mm) là <b>tự bắt dính</b>: nhảy đúng vị trí + hướng, thu nhỏ cho vừa nếu cần. Ô <span style="color:#3fcf8e">xanh lá</span> = đúng; ô <span style="color:#ff6b6b">đỏ</span> = lắp vừa nhưng sai chỗ (đọc lý do ở bảng 📋 bên phải); thả linh kiện không hợp ô thì ô nháy đỏ và không nhận.</li>
        <li>Bảng <b>📋 Kiểm tra lắp ráp</b> (góc phải) và ô <b>Số đo</b>: % hoàn thành, module còn thiếu, cảnh báo (cầu chì, buck 5 V, BSS138, cảm biến chống rơi, bumper, trọng tâm…).</li>
        <li><b>🔌 Kiểm tra đi dây</b>: liệt kê mọi dây theo docs/01 và vẽ dây 3D (màu theo loại) giữa các module đã có.</li>
        <li><b>▶ Chạy thử</b>: robot được nhấc khỏi bàn xuống khu thử, chạy va chạm-quay như firmware. Lắp thiếu/sai thì sẽ thấy hậu quả: khói ở PIC khi thiếu buck, cháy khi không cầu chì, quạt chết khi đặt trước hộp bụi, lao xuống cầu thang khi thiếu cảm biến chống rơi…</li>
      </ul>
      <p>Mục <b>🔧 Tháo lắp từng bước</b> (◀ ▶) tự lắp robot theo thứ tự chuẩn kèm giải thích; mục <b>⚠️ Thử lắp sai</b> nạp sẵn bố cục có lỗi và chạy thử. Bố cục của bạn tự lưu trong trình duyệt và không mất khi xem hướng dẫn (◀ về đầu để quay lại).</p>
      <p class="tip">Thử: bấm <b>📦</b> để bày bộ linh kiện ra bàn, tự lắp theo trí nhớ, xem % hoàn thành và trọng tâm thay đổi khi bạn đặt pin ở chỗ khác nhau. Các trang "Môi trường mô phỏng" và "Robot hoàn chỉnh" không có trong Thư viện vì chúng là cả căn phòng/ cả robot; mô hình nào lớn hơn 600 mm sẽ được thay bằng khối đại diện.</p>\`,
    specs: SPEC_ROWS,
    principle: \`
      <h4>1. Trọng tâm & phân bố khối lượng</h4>
      <p>Robot đứng trên 3 điểm: 2 bánh chủ động (x = 0) và bánh xoay (x = 125 mm). Trọng tâm <code>x<sub>G</sub> = Σ m<sub>i</sub>·x<sub>i</sub> / Σ m<sub>i</sub></code> phải nằm <b>giữa</b> 0 và 125 mm: âm → robot lật ngửa về sau, quá gần bánh xoay → bánh chủ động ít tải, trượt. Chiều cao trọng tâm <code>h</code> càng thấp càng khó lật: góc lật ngang <code>θ = atan(117 / h)</code>. Vì vậy khối nặng nhất (pin ~300 g) đặt thấp, giữa 2 bánh; lidar (190 g, phải ở cao) lệch về sau để cân với chổi + bánh xoay phía trước. Xưởng tính x<sub>G</sub>, h theo khối lượng ước tính từng module (ô Số đo).</p>
      <h4>2. Đường gió</h4>
      <p>Chổi cuộn → miệng hút → <b>hộp bụi</b> (vận tốc giảm, rác nặng lắng xuống) → lưới lọc thô → HEPA → <b>quạt</b> → cửa xả. Quạt phải ở "phía sạch": cánh quay 15–20 nghìn vòng/phút, một hạt cát cũng đủ làm mẻ cánh. Lọc tắc → lưu lượng giảm, quạt quay nhanh hơn nhưng hút yếu hơn (đường đặc tính quạt).</p>
      <h4>3. Nhiễu điện từ (EMI)</h4>
      <p>Động cơ chổi than đánh lửa ở cổ góp; PWM 20 kHz có sườn vài chục ns → dòng biến thiên nhanh trên dây động cơ cảm ứng sang dây tín hiệu (<code>V = L·di/dt</code>, <code>V = M·di/dt</code>). Quy tắc: driver sát động cơ (vòng dây dòng lớn ngắn nhất), MCU xa động cơ, dây động cơ xoắn đôi, tụ 100 nF hai cực động cơ, logic có buck riêng, GND hình sao về cực âm pin.</p>
      <h4>4. Nhiệt</h4>
      <p>DRV8871: <code>P = I²·R<sub>DS(on)</sub></code> với R<sub>DS(on)</sub> (cao + thấp) ≈ 0.57 Ω → 1.5 A cho ~1.3 W trong vỏ HSOP-8 → cần đồng/ nhôm tản nhiệt dưới PowerPAD, nếu không chạm 175 °C là tự ngắt. Buck XL4015 hiệu suất ~88 %: tải 1.5 A ở 5 V tỏa ~1 W ở cuộn cảm + diode. Pin cũng ấm lên khi xả mạnh — đừng đặt sát quạt nóng/ động cơ.</p>
      <h4>5. Bảo trì (serviceability)</h4>
      <p>Thứ hay phải đụng tới thì để dễ lấy: hộp bụi rút từ đuôi, chổi cuộn tháo bằng 2 lẫy, pin mở từ đáy (tháo pin là việc đầu tiên khi sửa), cầu chì gần nắp, header ICSP của PIC và cổng USB của ESP32 quay ra chỗ cắm được khi robot đã lắp xong.</p>
      <h4>6. Cây nguồn</h4>
      <p>Pin 4S (12.0–16.8 V) → cầu chì 10 A → công tắc → <b>VBAT</b>: 2× DRV8871, quạt, MOSFET chổi · VBAT → buck XL4015 → <b>5 V</b>: PIC, ESP32 (LDO → 3.3 V), cảm biến, BSS138 phía HV, lidar. Không bao giờ lấy 5 V cho logic từ driver động cơ.</p>\`,
    inRobot: \`
      <p>Dây cần đi khi lắp xong (theo <code>docs/01_KIEN_TRUC_VA_SO_DO_CHAN.md</code>) — nút <b>🔌 Kiểm tra đi dây</b> đối chiếu danh sách này với các module bạn đã lắp:</p>
      \${WIRE_LIST_HTML}
      <p>Firmware: <code>firmware/pic16f877a_ccs/</code> (CCS C — PWM, encoder, phản xạ an toàn) và <code>firmware/esp32s3/</code> (BLE, AUTO va chạm-quay, odometry). Xem từng linh kiện ở trang riêng để biết chi tiết bên trong.</p>\`,
    mistakes: \`
      <ul>
        <li>Nối logic thẳng vào pin (quên buck) hoặc chưa chỉnh buck về 5.0 V trước khi nối → cháy PIC/ESP32.</li>
        <li>Không có cầu chì, dây quá mảnh, dây đi sát cạnh kim loại → chập là cháy.</li>
        <li>Quạt đặt trước hộp bụi/ chạy không lọc → bụi phá quạt.</li>
        <li>ESP32 đặt sát động cơ, driver không tản nhiệt → reset ngẫu nhiên, driver tự ngắt.</li>
        <li>Bỏ BSS138 → GPIO ESP32 hỏng dần, PIC đọc 3.3 V không chắc.</li>
        <li>Pin đặt cao/ ở đuôi → trọng tâm sai, robot ngóc đầu hoặc lắc mạnh.</li>
        <li>Thiếu cảm biến chống rơi phía trước, quên bumper → rơi cầu thang, ép vào tường.</li>
        <li>Cắm pin trước khi đo không chập; chạy thử lần đầu trên sàn thay vì trên giá kê.</li>
      </ul>\`,
    quiz: [
      { q: 'Robot nặng 2.5 kg, trọng tâm ở x = +7 mm (trước trục bánh). Đổi chỗ pin 300 g (x = 0) với hộp bụi 100 g (x = −125 mm) thì trọng tâm mới ở đâu, robot còn vững không?', a: 'Δx = [0.3 × (−125 − 0) + 0.1 × (0 − (−125))] / 2.5 = (−37.5 + 12.5) / 2.5 = −10 mm → x<sub>G</sub> ≈ −3 mm: ra SAU trục bánh → robot ngóc đầu, bánh xoay không còn tải, đi lạng lách. Phải đưa pin về giữa.' },
      { q: 'Vì sao quạt hút phải nằm sau hộp bụi và lọc, chứ không phải trước?', a: 'Quạt quay 15–20 nghìn vòng/phút; nếu nằm trước, mọi hạt cát, tóc, vụn đi xuyên qua cánh quạt → mẻ cánh, mất cân bằng, kẹt bạc đạn, quạt chết. Đặt sau lọc thì chỉ có không khí sạch đi qua quạt — lọc bảo vệ quạt.' },
      { q: 'Bạn lắp đủ mọi thứ nhưng quên buck 5 V. Bật nguồn điều gì xảy ra và vì sao cầu chì 10 A không cứu được?', a: 'PIC và LDO của ESP32 nhận 14.4–16.8 V → cháy ngay (PIC tối đa 7.5 V). Dòng qua chip chỉ vài trăm mA – vài A, nhỏ hơn 10 A nên cầu chì không đứt: cầu chì bảo vệ DÂY và PIN khỏi chập, không bảo vệ chip khỏi quá áp.' },
      { q: 'Tại sao driver DRV8871 nên đặt sát động cơ, còn ESP32 thì xa động cơ?', a: 'Dây động cơ mang dòng PWM 20 kHz lớn — dây càng dài thì vòng dây phát nhiễu càng lớn; driver sát động cơ cho vòng dây ngắn nhất và tản nhiệt xuống đế nhôm. ESP32 (3.3 V, tín hiệu nhỏ, có anten) dễ bị nhiễu chổi than/ PWM làm reset hoặc sai dữ liệu nên đặt xa.' },
      { q: 'Chỉ có 2 cảm biến chống rơi ở hai hông (góc ±80°). Vì sao robot vẫn rơi khi đi thẳng ra mép?', a: 'Cảm biến ±80° chỉ nhô trước tâm 155·cos80° ≈ 27 mm, còn bánh xoay ở 125 mm — bánh xoay hụt mép trước khi cảm biến thấy hố. Cần 2 cảm biến phía trước (±18°, nhô 147 mm — trước cả bánh xoay).' },
    ],
  },

  build(ctx) {
    const { THREE, geom, fx } = ctx;
    const viewer = ctx.viewer || null;
    const hasDom = !!(viewer && viewer.container && typeof document !== 'undefined');
    const root = new THREE.Group();

    // ---------- cảnh: bàn, khung robot (rig — di chuyển khi chạy thử), khu thử ----------
    const bench = H.buildBench(ctx);
    root.add(bench.group);
    const rig = new THREE.Group();
    rig.rotation.order = 'YXZ';
    rig.position.set(0, H.STAND, 0);
    root.add(rig);
    const chassis = H.buildChassis(ctx);
    rig.add(chassis.group);
    const airflow = H.airflowArrows(geom);
    rig.add(airflow);
    const wiresG = new THREE.Group();
    rig.add(wiresG);
    const arena = H.buildArena(ctx);
    root.add(arena.group);
    const swMarker = new THREE.Object3D();
    swMarker.position.set(...H.SWITCH_POS);
    rig.add(swMarker);

    // ---------- danh mục linh kiện của lab ----------
    const comps = (ctx.catalog || [])
      .filter((c) => c && c.id && typeof c.build === 'function' && !['mo-phong', 'lap-rap'].includes(c.category) && c.id !== 'xuong-lap-rap')
      .sort((a, b) => (H.CAT_ORDER.indexOf(a.category) + 1 || 99) - (H.CAT_ORDER.indexOf(b.category) + 1 || 99) || (a.order ?? 99) - (b.order ?? 99));
    const compById = Object.fromEntries(comps.map((c) => [c.id, c]));

    const slots = SLOTS.map((s) => {
      const o = { ...s, req: s.req !== false, ry: s.ry || 0, available: s.accepts.some((id) => compById[id]) };
      o.acceptNames = s.accepts.map((id) => compById[id]?.name || id).join(', ');
      o.world = new THREE.Vector3(s.pos[0], s.pos[1] + H.STAND, s.pos[2]);
      o.ghostObj = H.makeGhost(geom, o);
      o.ghostObj.visible = o.available;
      rig.add(o.ghostObj);
      o.marker = new THREE.Object3D();
      o.marker.position.set(s.pos[0], s.pos[1] + Math.min(s.fit[1], 40) * 0.6, s.pos[2]);
      rig.add(o.marker);
      return o;
    });
    const slotById = Object.fromEntries(slots.map((s) => [s.id, s]));
    const avail = slots.filter((s) => s.available);

    const where = {};
    for (const s of slots) for (const id of s.accepts) (where[id] ||= new Set()).add(s.name);
    const clean = (t) => String(t || '').replace(/<[^>]+>/g, '').replace(/"/g, '”');
    const catalog = comps.map((def) => ({
      id: def.id, name: def.name, icon: def.icon, group: H.CAT_NAMES[def.category] || 'Khác',
      desc: clean(\`\${def.summary || ''} \${where[def.id] ? '→ Lắp vào: ' + [...where[def.id]].join(', ') : '(không có ô lắp riêng — để trên bàn tham khảo)'}\`),
      build: () => H.makeItem(ctx, def),
    }));

    // ---------- bố cục mẫu ----------
    const entrySlot = (s, type = s.accepts[0]) => ({ type, x: +s.world.x.toFixed(1), y: +s.world.y.toFixed(1), z: +s.world.z.toFixed(1), rotY: s.ry });
    const entryKit = (s, type = s.accepts[0]) => { const k = H.KIT[s.id] || [0, 300]; return { type, x: k[0], y: 0, z: k[1], rotY: 0 }; };
    const fullLayout = () => avail.map((s) => entrySlot(s));
    const kitLayout = () => avail.map((s) => entryKit(s));

    // ---------- trạng thái ----------
    let assign = new Map();         // slotId → { it, status: 'ok'|'wrong', reason, run }
    const lastPos = new Map();      // uid → "x,z,rot" sau lần đánh giá trước (để biết món nào vừa bị dời)
    const flashes = new Map();      // slotId → giây còn nháy đỏ
    const tweens = [];              // linh kiện bay từ bàn vào ô (hướng dẫn từng bước)
    let internal = 0;               // > 0: thay đổi bố cục do code (không phải người dùng)
    let mode = 'free';              // 'free' | 'tour' | 'fault'
    let backup = null;              // bố cục người dùng khi đang xem hướng dẫn / sự cố
    let wiringShown = false;
    let ghostOn = true, wiresOn = true;
    let msg = { kind: 'info', text: 'Kéo linh kiện từ <b>📦 Thư viện</b> ra bàn rồi vào các ô lắp mờ trên khung robot.' };
    let status = { pct: 0, done: 0, total: 0, missing: [], warns: [], wiring: [], wOk: 0, wTot: 0, mass: 0, cg: [0, 0, 0] };
    let diag = {};
    let camInit = false;
    let panel = null, styleEl = null;
    let sb = null;
    const run = { phase: 'idle', t: 0, from: null, fromTh: 0, snap: [] };   // khai báo sớm: onLayout dùng ngay khi tạo sandbox
    const sim = {};

    const readout = (id, v) => { try { ctx.readout?.(id, v); } catch { /* bỏ qua */ } };
    const STORE = 'robovac.xuong.v1';
    const save = () => { if (!sb) return; try { localStorage.setItem(STORE, JSON.stringify(sb.serialize())); } catch { /* không có localStorage */ } };

    function setMsg(kind, text) { msg = { kind, text }; renderPanel(); readout('state', small(text)); }

    const DENY = {
      'cong-tac-hanh-trinh': 'Công tắc hành trình là một phần của bumper và module bánh (nhấc bánh) — đã có sẵn trong các module đó.',
      'pin-18650': 'Một cell 18650 rời chỉ 3.6 V — phải ghép 4 cell nối tiếp + BMS thành pack 4S rồi đặt vào ô Pin.',
      'dong-co-dc': 'Động cơ rời đã nằm sẵn trong module bánh / chổi / quạt — lắp nguyên module.',
      'hop-so': 'Hộp số nằm sẵn trong module bánh xe.',
      'encoder-hall': 'Encoder Hall nằm sẵn ở đuôi động cơ trong module bánh xe.',
      'lo-xo': 'Lò xo treo bánh/ lò xo hồi bumper đã có trong module bánh và bumper.',
      'oc-vit': 'Ốc vít dùng để bắt các module — không chiếm một ô riêng.',
      'thach-anh': 'Thạch anh 20 MHz đã hàn sẵn trên bo PIC (cạnh chân 13/14).',
      'vo-khung': 'Đây là vỏ hoàn chỉnh của robot gốc — xưởng đã có khung đáy cố định.',
      'sac-pin': 'Dock sạc đặt trên sàn sát tường, không lắp trong robot.',
      'uart-khung': 'Khung UART là giao thức (phần mềm) giữa PIC và ESP32 — không phải linh kiện để lắp.',
    };
    const denyReason = (it, s) => DENY[it.type] || \`\${it.def.name} không hợp ô “\${s.name}” — ô này dành cho: \${s.acceptNames}.\`;

    // ---------- đánh giá bố cục: bắt dính vào ô, đúng/sai ----------
    const key = (o) => \`\${o.position.x.toFixed(1)},\${o.position.z.toFixed(1)},\${o.rotation.y.toFixed(3)}\`;
    function onLayout(items) {
      if (run.phase !== 'idle') return;
      const userChange = internal === 0;
      if (userChange && mode !== 'free') { mode = 'free'; backup = null; tweens.length = 0; }
      const moved = new Set(items.filter((it) => lastPos.get(it.uid) !== key(it.object)).map((it) => it.uid));
      const nA = new Map(), nI = new Map();
      const notes = [];
      const order = [...items.filter((i) => !moved.has(i.uid)), ...items.filter((i) => moved.has(i.uid))];
      for (const it of order) {
        if (!it.object.userData.xw) continue;
        const p = it.object.position;
        const cands = [];
        for (const s of avail) {
          const d = Math.hypot(p.x - s.world.x, p.z - s.world.z);
          if (d > s.r) continue;
          const kind = s.accepts.includes(it.type) ? 'ok' : s.misfit?.[it.type] ? 'wrong' : 'no';
          cands.push({ s, d, kind, score: d - (kind === 'ok' ? 30 : kind === 'wrong' ? 10 : 0) });
        }
        if (!cands.length) continue;
        cands.sort((a, b) => a.score - b.score);
        const pick = cands.find((c) => c.kind !== 'no' && !nA.has(c.s.id));
        const tell = moved.has(it.uid) && userChange;
        if (pick) {
          const mf = pick.kind === 'wrong' ? pick.s.misfit[it.type] : null;
          nA.set(pick.s.id, { it, status: pick.kind, reason: mf?.reason || '', run: mf?.run || null });
          nI.set(it.uid, pick.s.id);
          if (tell) notes.push(pick.kind === 'ok' ? ['ok', \`✓ \${it.def.name} → \${pick.s.name}\`] : ['bad', \`✗ Lắp vừa nhưng SAI chỗ: \${mf.reason}\`]);
          if (pick.kind === 'wrong' && tell) flashes.set(pick.s.id, 2.5);
        } else if (tell) {
          const c = cands[0];
          if (c.kind !== 'no') notes.push(['bad', \`Ô “\${c.s.name}” đã có \${nA.get(c.s.id)?.it.def.name || 'linh kiện khác'} — kéo cái cũ ra bàn trước.\`]);
          else notes.push(['bad', \`✗ \${denyReason(it, c.s)}\`]);
          flashes.set(c.s.id, 2.5);
        }
      }
      assign = nA;
      for (const it of items) {
        const x = it.object.userData.xw;
        if (!x) continue;
        const sid = nI.get(it.uid);
        if (sid) {
          const s = slotById[sid];
          it.object.position.copy(s.world);
          it.object.rotation.set(0, s.ry, 0);
          H.layoutItem(it.object, H.fitScale(it.object, s.fit), !!s.mirror);
        } else if (x.scale !== 1 || x.mirror) H.layoutItem(it.object, 1, false);
        lastPos.set(it.uid, key(it.object));
      }
      const live = new Set(items.map((i) => i.uid));
      for (const u of [...lastPos.keys()]) if (!live.has(u)) lastPos.delete(u);
      if (sb?.selected) sb.select(sb.selected);          // vẽ lại khung chọn sau khi bắt dính
      if (userChange && mode === 'free') save();
      if (notes.length) { const [k, t] = notes[notes.length - 1]; msg = { kind: k, text: t }; }
      assess();
    }

    // ---------- chấm điểm: thiếu gì, cảnh báo gì, trọng tâm ----------
    function assess() {
      const at = (sid) => assign.get(sid);
      const typeIn = (sid) => at(sid)?.it.type;
      const okIn = (sid) => at(sid)?.status === 'ok';
      const all = [...assign.entries()];
      const has = (type) => all.some(([, a]) => a.it.type === type);
      const count = (type) => all.filter(([, a]) => a.it.type === type).length;
      const slotOf = (type) => { const e = all.find(([, a]) => a.it.type === type); return e ? { slot: slotById[e[0]], item: e[1].it } : null; };
      const req = avail.filter((s) => s.req);
      const done = req.filter((s) => okIn(s.id)).length;
      const pct = req.length ? Math.round((100 * done) / req.length) : 0;
      // còn thiếu (gộp theo loại)
      const kinds = new Map();
      for (const s of req) { const k = kinds.get(s.kind) || { n: 0, ok: 0 }; k.n++; if (okIn(s.id)) k.ok++; kinds.set(s.kind, k); }
      const missing = [...kinds.entries()].filter(([, k]) => k.ok < k.n).map(([name, k]) => (k.n > 1 ? \`\${name} (\${k.ok}/\${k.n})\` : name));
      // chẩn đoán điện / cơ
      const DRV = 'driver-drv8871';
      const drvMis = typeIn('esp32') === DRV;
      const hotSide = !drvMis ? null : typeIn('drv-trai') !== DRV ? 'L' : typeIn('drv-phai') !== DRV ? 'R' : null;
      const pack = has('pack-4s-bms'), cell = has('pin-18650');
      // khối lượng & trọng tâm
      let m = H.CHASSIS_MASS, sx = H.CHASSIS_CG[0] * m, sy = H.CHASSIS_CG[1] * m, sz = H.CHASSIS_CG[2] * m;
      for (const [sid, a] of all) {
        const s = slotById[sid], mi = H.MASS[a.it.type] ?? 0.03;
        m += mi; sx += mi * (s.cgx ?? s.pos[0]); sy += mi * (s.pos[1] + s.fit[1] * 0.45 * (a.it.object.userData.xw?.scale ?? 1)); sz += mi * s.pos[2];
      }
      const cg = [sx / m, sy / m, sz / m];
      const fanS = slotOf('quat-bldc');
      diag = {
        power: pack || cell, lowVolt: !pack && cell, fuse: has('cau-chi'), buck: has('buck-xl4015'),
        pic: has('pic16f877a'), esp: has('esp32-s3'), bss: has('bss138-level-shifter'),
        wheelL: typeIn('banh-trai') === 'banh-xe', wheelR: typeIn('banh-phai') === 'banh-xe',
        drvL: typeIn('drv-trai') === DRV || hotSide === 'L', drvR: typeIn('drv-phai') === DRV || hotSide === 'R',
        hotSide, espNoise: typeIn('drv-trai') === 'esp32-s3' || typeIn('drv-phai') === 'esp32-s3',
        fan: !!fanS, bin: has('hop-bui'), brush: has('choi-cuon'),
        dustFan: typeIn('hop-bui') === 'quat-bldc' || typeIn('quat') === 'hop-bui' || (!!fanS && !has('hop-bui')),
        cliffs: avail.filter((s) => s.id.startsWith('cliff-') && typeIn(s.id) === 'cliff-ir').map((s) => s.angle),
        bumper: typeIn('bumper') === 'bumper', batRear: typeIn('hop-bui') === 'pack-4s-bms', batTop: typeIn('lidar') === 'pack-4s-bms',
        cg, mass: m,
        picAt: slotOf('pic16f877a'), espAt: slotOf('esp32-s3'), packAt: slotOf('pack-4s-bms') || slotOf('pin-18650'), fanAt: fanS,
        drvHotAt: drvMis ? { slot: slotById.esp32, item: at('esp32').it } : null,
      };
      // cảnh báo
      const W = [];
      for (const [sid, a] of all) if (a.status === 'wrong') W.push(['crit', \`\${a.it.def.name} ở ô “\${slotById[sid].name}”: \${a.reason}.\`]);
      if (diag.power && !diag.fuse) W.push(['crit', 'Không có cầu chì giữa pin và tải — chập mạch là cháy dây/ pin (dòng ngắn mạch ~60 A).']);
      if (diag.pic && !diag.buck) W.push(['crit', 'Thiếu buck 5 V: PIC sẽ nhận 14.4 V — cháy (VDD tối đa tuyệt đối 7.5 V).']);
      if (diag.esp && !diag.buck) W.push(['crit', 'Thiếu buck 5 V: ESP32 nhận 14.4–16.8 V vào chân 5V — LDO onboard quá áp/ quá nhiệt.']);
      if (diag.pic && diag.esp && !diag.bss) W.push(['warn', 'Thiếu BSS138: TX 5 V của PIC vào ESP32 3.3 V (GPIO tối đa 3.6 V); TX 3.3 V của ESP32 không đủ cho RX Schmitt của PIC (cần ≥ 4 V).']);
      if ((diag.wheelL && !diag.drvL) || (diag.wheelR && !diag.drvR)) W.push(['crit', \`Thiếu driver DRV8871 bánh \${!diag.drvL && diag.wheelL ? 'trái' : 'phải'} — bánh đó không có điện, robot sẽ quay vòng.\`]);
      if (diag.pic && !diag.esp) W.push(['warn', 'Không có ESP32: PIC không nhận lệnh DRIVE → tự dừng động cơ sau 300 ms.']);
      if (diag.fan && !diag.bin) W.push(['crit', 'Có quạt hút nhưng không có hộp bụi + lọc — bụi bị hút thẳng vào quạt.']);
      if (diag.cliffs.length < 4) W.push(['warn', \`Chỉ có \${diag.cliffs.length}/4 cảm biến chống rơi — robot có thể lao xuống cầu thang.\`]);
      if (!diag.bumper) W.push(['warn', 'Không có bumper — đâm tường mà không biết, bánh quay trượt tại chỗ.']);
      if (all.length > 3 && cg[0] < 0) W.push(['crit', \`Trọng tâm ở SAU trục bánh (\${cg[0].toFixed(0)} mm) — robot ngóc đầu, bánh xoay mất tải.\`]);
      else if (all.length > 3 && cg[0] < 2) W.push(['warn', \`Trọng tâm chỉ trước trục bánh \${cg[0].toFixed(0)} mm — sát mép, bánh xoay ít tải.\`]);
      else if (cg[0] > 110) W.push(['warn', \`Trọng tâm quá gần bánh xoay (\${cg[0].toFixed(0)} mm) — bánh chủ động ít tải, dễ trượt.\`]);
      if (diag.lowVolt) W.push(['crit', 'Nguồn chỉ là 1 cell 18650 (3.7 V) — không đủ cho buck 5 V và động cơ 14.4 V.']);
      if (!diag.fan) W.push(['info', 'Chưa có quạt hút — chỉ quét, không hút được bụi mịn.']);
      if (diag.brush && !has('mosfet')) W.push(['info', 'Chổi chưa có bo MOSFET — PIC (RD5/RD6) không bật/tắt được chổi.']);
      if (!has('mpu6050')) W.push(['info', 'Chưa có MPU6050 — góc quay chỉ tính từ encoder (trượt bánh → lệch hướng dần).']);
      if (!has('lidar-lds')) W.push(['info', 'Chưa có lidar — vẫn chạy va chạm-quay được; lập bản đồ là giai đoạn sau.']);
      if (count('cau-chi') === 0 && !diag.power) { /* chưa có pin thì chưa cần nhắc */ }
      // đi dây
      const present = (sid) => sid === '@sw' || assign.has(sid);
      const wiring = WIRES.filter((w) => !w.optional || (present(w.a) && present(w.b))).map((w) => {
        const miss = [w.a, w.b].filter((x) => !present(x)).map((x) => slotById[x]?.name || x);
        const bad = [w.a, w.b].some((x) => x !== '@sw' && at(x)?.status === 'wrong');
        return { w, ok: !miss.length && !bad, bad: !miss.length && bad, miss };
      });
      const wOk = wiring.filter((x) => x.ok).length;
      status = { pct, done, total: req.length, missing, warns: W, wiring, wOk, wTot: wiring.length, mass: m, cg };
      // ô số đo
      readout('pct', pct);
      readout('missing', small(missing.length ? missing.join(' · ') : 'Không — đủ module bắt buộc ✓'));
      const nc = W.filter((w) => w[0] === 'crit').length, nw = W.filter((w) => w[0] === 'warn').length;
      readout('warn', small(nc + nw ? \`\${nc ? \`🔥 \${nc} nghiêm trọng\` : ''}\${nc && nw ? ' · ' : ''}\${nw ? \`⚠️ \${nw} cảnh báo\` : ''} — xem bảng 📋\` : 'Không có lỗi nghiêm trọng ✓'));
      readout('wiring', small(\`\${wOk}/\${wiring.length} dây đủ 2 đầu\${wiringShown ? '' : ' (bấm 🔌 để xem)'}\`));
      readout('mass', +m.toFixed(2));
      readout('cg', \`\${cg[0].toFixed(0)} · \${cg[1].toFixed(0)}\`);
      readout('state', small(msg.text));
      colorGhosts();
      rebuildWires();
      renderPanel();
    }

    // ---------- ô mờ ----------
    const NO_RAY = () => {};
    function colorGhost(s) {
      const a = assign.get(s.id);
      // ô đã có linh kiện: không bắt chuột nữa để rê chuột xem được từng bộ phận của linh kiện bên trong
      const { fill, edges } = s.ghostObj.userData;
      fill.raycast = a ? NO_RAY : THREE.Mesh.prototype.raycast;
      edges.raycast = a ? NO_RAY : THREE.LineSegments.prototype.raycast;
      if (!a) H.setGhost(s.ghostObj, 0x4cc2ff, 0.12, 0.7);
      else if (a.status === 'ok') H.setGhost(s.ghostObj, 0x3fcf8e, 0.05, 0.45);
      else H.setGhost(s.ghostObj, 0xff4d4d, 0.28, 0.95);
    }
    function colorGhosts() { for (const s of avail) colorGhost(s); }
    function ghostVis() {
      const on = ghostOn && run.phase === 'idle';
      for (const s of slots) s.ghostObj.visible = on && s.available;
      airflow.visible = on;
    }

    // ---------- dây 3D ----------
    function wirePoint(id) {
      if (id === '@sw') return new THREE.Vector3(...H.SWITCH_POS);
      return slotById[id].marker.position.clone();
    }
    function rebuildWires() {
      for (const c of [...wiresG.children]) { wiresG.remove(c); c.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); }); }
      wiresG.visible = wiresOn;
      if (!wiringShown) return;
      let n = 0;
      for (const { w, miss } of status.wiring) {
        if (miss.length) continue;
        const a = wirePoint(w.a), b = wirePoint(w.b);
        if (a.distanceTo(b) < 2) continue;
        const up = Math.max(a.y, b.y) + 16 + (n++ % 5) * 3;
        const pts = [[a.x, a.y, a.z], [a.x, up, a.z], [(a.x + b.x) / 2, up + 8, (a.z + b.z) / 2], [b.x, up, b.z], [b.x, b.y, b.z]];
        const big = w.kind === 'vbat' || w.kind === 'gnd' || w.kind === 'motor';
        const tube = geom.wire(pts, { radius: big ? 1.3 : 0.8, color: H.WIRE_COLORS[w.kind] });
        tube.castShadow = false;
        geom.part(tube, \`Dây \${H.WIRE_KIND_NAMES[w.kind]}\`, w.label);
        wiresG.add(tube);
      }
    }

    // ---------- bảng 📋 (DOM, chỉ khi có trình duyệt) ----------
    if (hasDom) {
      if (!document.getElementById('xw-style')) {
        styleEl = document.createElement('style');
        styleEl.id = 'xw-style';
        styleEl.textContent = \`
.xw-panel{position:absolute;top:46px;right:10px;width:272px;max-height:48%;overflow:auto;z-index:6;padding:8px 10px;color:var(--text);
  background:color-mix(in srgb,var(--bg2) 94%,transparent);border:1px solid var(--line);border-radius:11px;font-size:12.5px;line-height:1.4;
  box-shadow:0 8px 24px rgba(0,0,0,.3);backdrop-filter:blur(6px)}
.xw-panel.min{max-height:none}.xw-panel.min .xw-body{display:none}
.xw-head{display:flex;justify-content:space-between;align-items:center;font-weight:700}
.xw-head button{background:none;border:0;cursor:pointer;font-size:16px;color:var(--muted)}
.xw-bar{height:7px;border-radius:4px;background:var(--bg3);margin:6px 0 3px;overflow:hidden}.xw-bar i{display:block;height:100%;background:var(--good);transition:width .3s}
.xw-msg{margin:6px 0;padding:5px 7px;border-radius:7px;background:var(--bg3)}.xw-msg.ok{color:var(--good)}.xw-msg.bad{color:var(--bad)}
.xw-panel h5{margin:8px 0 3px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.xw-panel ul{margin:0;padding-left:16px}.xw-panel li{margin:2px 0}.xw-panel p{margin:2px 0}
.xw-panel li.crit{color:var(--bad)}.xw-panel li.warn{color:var(--accent2)}.xw-panel li.info{color:var(--muted)}
.xw-panel li.wok{color:var(--good)}.xw-panel li.wbad{color:var(--accent2)}.xw-panel li.wmiss{color:var(--muted)}
.xw-btns{display:flex;gap:4px;margin-top:6px}.xw-btns button{flex:1;padding:4px 4px;border-radius:7px;border:1px solid var(--line);background:var(--bg3);color:var(--text);cursor:pointer;font-size:12px}
.xw-btns button:hover{border-color:var(--accent)}
.xw-sw{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:middle}
@media (max-width:760px){.xw-panel{width:200px;font-size:11px}}\`;
        document.head.appendChild(styleEl);
      }
      panel = document.createElement('div');
      panel.className = 'xw-panel';
      viewer.container.appendChild(panel);
      panel.addEventListener('click', (e) => {
        if (e.target.closest('.xw-min')) { panel.classList.toggle('min'); return; }
        const a = e.target.closest('[data-xw]')?.dataset.xw;
        if (a) act(a);
      });
    }
    function renderPanel() {
      if (!panel) return;
      const s = status;
      const hex = (c) => '#' + c.toString(16).padStart(6, '0');
      const wiringHtml = !wiringShown ? '' : \`<h5>🔌 Đi dây (\${s.wOk}/\${s.wTot})</h5><ul>\${s.wiring.map((x) =>
        \`<li class="\${x.ok ? 'wok' : x.bad ? 'wbad' : 'wmiss'}"><span class="xw-sw" style="background:\${hex(H.WIRE_COLORS[x.w.kind])}"></span>\${x.ok ? '✓' : x.bad ? '⚠' : '✗'} \${x.w.label}\${x.miss.length ? \` <i>(thiếu: \${x.miss.join(', ')})</i>\` : x.bad ? ' <i>(module sai chỗ → dây dài, qua vùng nhiễu/nóng)</i>' : ''}</li>\`).join('')}</ul>\`;
      panel.innerHTML = \`<div class="xw-head"><span>📋 Kiểm tra lắp ráp</span><button class="xw-min" title="Thu gọn / mở">–</button></div>
        <div class="xw-body">
          <div class="xw-bar"><i style="width:\${s.pct}%"></i></div>
          <div>\${s.done}/\${s.total} module bắt buộc đúng chỗ — <b>\${s.pct}%</b></div>
          <div class="xw-msg \${msg.kind}">\${msg.text}</div>
          <div class="xw-btns"><button data-xw="run">▶ Chạy thử</button><button data-xw="wire">🔌 Đi dây</button><button data-xw="home">■ Về bàn</button></div>
          <h5>Còn thiếu</h5>\${s.missing.length ? \`<ul>\${s.missing.map((m) => \`<li>\${m}</li>\`).join('')}</ul>\` : '<p style="color:var(--good)">Đủ module bắt buộc ✓</p>'}
          <h5>Cảnh báo</h5><ul>\${s.warns.map(([l, t]) => \`<li class="\${l}">\${l === 'crit' ? '🔥' : l === 'warn' ? '⚠️' : 'ℹ️'} \${t}</li>\`).join('') || '<li class="info">Không có</li>'}</ul>
          <h5>Trọng tâm & khối lượng</h5><p>\${s.mass.toFixed(2)} kg · trọng tâm trước trục bánh <b>\${s.cg[0].toFixed(0)} mm</b> (phải &gt; 0 và &lt; 125) · lệch ngang \${s.cg[2].toFixed(0)} mm · cao \${s.cg[1].toFixed(0)} mm</p>
          \${wiringHtml}
        </div>\`;
    }

    // ---------- sandbox ----------
    internal++;
    sb = ctx.sandbox ? ctx.sandbox({
      title: 'Linh kiện của lab', root, catalog,
      surfaces: [...bench.surfaces, ...chassis.surfaces],
      floorY: 0, grid: 10, bounds: { minX: -975, maxX: 975, minZ: -475, maxZ: 475 },
      storageKey: STORE, initial: kitLayout(),
      onChange: (items) => onLayout(items),
    }) : null;
    internal--;
    if (!sb) assess();

    function loadInternal(list) {
      if (!sb) return;
      internal++;
      try { sb.load(list, false); } finally { internal--; }
    }
    function restoreUser() {
      if (mode === 'free') return;
      mode = 'free';
      if (backup) loadInternal(backup);
      backup = null;
    }

    // ---------- chạy thử ----------
    const dustM = new THREE.Matrix4();
    const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
    function resetDust() {
      arena.pts.forEach(([x, z], i) => { dustM.makeTranslation(x, 1.5, z); arena.dust.setMatrixAt(i, dustM); });
      arena.dust.instanceMatrix.needsUpdate = true;
    }
    function resetSim() {
      Object.assign(sim, {
        px: -470, pz: 0, th: 0, T: 0, mode: 'FWD', backDist: 0, turnTarget: 0, turnSign: 1, vL: 0, vR: 0,
        pitch: 0, roll: 0, yOff: 0, rollV: 0, on: false, dead: false, picDead: false, espDead: false, fanDead: false,
        shorted: false, commDead: false, drvOff: false, drvK: 0, espResetT: 0, nextReset: 2.2, jerkT: 0, stuckT: 0, saidStuck: false,
        fallT: -1, collected: new Set(), said: new Set(), bumps: 0, notes: [],
      });
    }
    resetSim();
    const item = (at) => at?.item?.object;
    const mark = (at) => at?.slot?.marker;
    function once(key, kind, text, note) { if (sim.said.has(key)) return; sim.said.add(key); setMsg(kind, text); if (note) sim.notes.push(note); }
    function die(kind, text) { if (sim.dead) return; sim.dead = true; setMsg(kind, text); }

    function cam(v) {
      if (!viewer?.camera || !viewer.controls) return;
      viewer.controls.target.set(...v.target);
      viewer.camera.position.set(...v.cam);
      viewer.controls.update?.();
    }

    function startRun() {
      if (run.phase !== 'idle') return;
      if (!assign.size) { setMsg('bad', 'Khung còn trống — lắp linh kiện vào trước đã.'); return; }
      tweens.length = 0;
      flashes.clear();
      if (sb) sb.enabled = false;
      root.updateMatrixWorld(true);
      run.snap = (sb?.items || []).map((it) => ({ it, pos: it.object.position.clone(), ry: it.object.rotation.y }));
      for (const [, a] of assign) rig.attach(a.it.object);
      resetSim();
      resetDust();
      run.phase = 'lift'; run.t = 0; run.from = rig.position.clone();
      ghostVis();
      cam(H.ARENA_VIEW);
      setMsg('info', 'Nhấc robot khỏi giá kê, đặt xuống khu chạy thử…');
    }

    function finishReturn() {
      rig.position.set(0, H.STAND, 0);
      rig.rotation.set(0, 0, 0);
      root.updateMatrixWorld(true);
      for (const s of run.snap) {
        if (s.it.object.parent !== root) root.attach(s.it.object);
        s.it.object.position.copy(s.pos);
        s.it.object.rotation.set(0, s.ry, 0);
      }
      run.snap = [];
      run.phase = 'idle';
      try { fx?.restore?.(root); } catch { /* bỏ qua */ }
      resetDust();
      if (sb) sb.enabled = true;
      ghostVis();
      colorGhosts();
      cam(H.BENCH_VIEW);
    }

    function stopRun(instant) {
      if (run.phase === 'idle') return;
      if (instant || run.phase === 'return') { finishReturn(); return; }
      run.phase = 'return'; run.t = 0; run.from = rig.position.clone(); run.fromTh = rig.rotation.y;
      rig.rotation.x = 0; rig.rotation.z = 0;
      setMsg('info', 'Đưa robot về giá kê trên bàn…');
    }

    function powerOn() {
      const d = diag;
      sim.on = true;
      if (!d.power) return die('bad', 'Không có pin — bật công tắc chẳng có gì xảy ra. Lắp pack 4S vào ô Pin.');
      if (d.lowVolt) {
        if (mark(d.picAt)) fx.flash(mark(d.picAt), { size: 14, color: 0xff4040 });
        return die('bad', '1 cell 18650 chỉ 3.7 V: buck không đủ áp vào để ra 5 V, PIC/ESP32 sập nguồn liên tục (brown-out), động cơ chỉ giật nhẹ. Cần pack 4S.');
      }
      const burnt = [];
      if (d.pic && !d.buck && d.picAt) {
        sim.picDead = true; burnt.push('PIC');
        fx.sparks(mark(d.picAt), { count: 30, speed: 40, size: 2 });
        fx.smoke(mark(d.picAt), { size: 24, duration: 9 });
        fx.scorch(item(d.picAt));
      }
      if (d.esp && !d.buck && d.espAt) {
        sim.espDead = true; burnt.push('ESP32');
        fx.smoke(mark(d.espAt), { size: 20, duration: 8 });
        fx.scorch(item(d.espAt));
      }
      if (burnt.length) return die('bad', \`💨 Khói bốc từ \${burnt.join(' và ')}! Không có buck nên 14.4 V đi thẳng vào chân 5 V → chip cháy ngay khi bật công tắc. Robot đứng im.\`);
      if (!d.pic) return die('bad', 'Không có PIC16F877A — không ai phát PWM cho 2 driver bánh. Robot đứng im.');
      if (!d.esp) return die('bad', 'PIC chờ lệnh DRIVE từ ESP32 nhưng không có ESP32 → hết 300 ms là PIC tự giữ động cơ dừng (phản xạ an toàn).');
      if (!d.wheelL && !d.wheelR) return die('bad', 'Chưa có bánh xe chủ động — robot không thể di chuyển.');
      const okL = d.wheelL && d.drvL, okR = d.wheelR && d.drvR;
      if (okL !== okR) return once('onewheel', 'bad', \`Chỉ bánh \${okL ? 'trái' : 'phải'} có điện (bánh kia thiếu \${!(okL ? d.wheelR : d.wheelL) ? 'module bánh' : 'driver DRV8871'}) → ω = (v<sub>R</sub> − v<sub>L</sub>)/L ≠ 0 dù lệnh đi thẳng → robot xoay vòng tròn quanh bánh đứng yên.\`, 'chỉ 1 bánh có điện → quay vòng');
      setMsg('ok', 'Bật nguồn ✓ PIC & ESP32 khởi động, ESP32 gửi DRIVE 20 lần/s → chạy AUTO va chạm-quay.');
    }

    function collide() {
      const R = 178, hits = [], { x0, z0, z1 } = ARENA;
      if (sim.px - R < x0) hits.push([1, 0, x0 - (sim.px - R)]);
      if (sim.pz - R < z0) hits.push([0, 1, z0 - (sim.pz - R)]);
      if (sim.pz + R > z1) hits.push([0, -1, sim.pz + R - z1]);
      const dx = sim.px - OBST.leg[0], dz = sim.pz - OBST.leg[1], dd = Math.hypot(dx, dz);
      if (dd < R + 20 && dd > 1e-6) hits.push([dx / dd, dz / dd, R + 20 - dd]);
      const [bx, bz, hx, hz] = OBST.box;
      const cx = clamp(sim.px, bx - hx, bx + hx), cz = clamp(sim.pz, bz - hz, bz + hz);
      const ex = sim.px - cx, ez = sim.pz - cz, ed = Math.hypot(ex, ez);
      if (ed < R && ed > 1e-6) hits.push([ex / ed, ez / ed, R - ed]);
      return hits;
    }
    // điểm (lx, lz) trong hệ robot → x thế giới-khu-thử
    const wx = (lx, lz) => sim.px + lx * Math.cos(sim.th) + lz * Math.sin(sim.th);

    function startBackup(side) {        // side: +1 va/hố bên trái → quay phải; −1 bên phải → quay trái
      sim.mode = 'BACK'; sim.backDist = 0;
      sim.turnSign = side > 0 ? -1 : side < 0 ? 1 : (Math.random() < 0.5 ? 1 : -1);
      sim.bumps++;
      if (diag.batTop) sim.rollV += 0.9;
    }

    function drive(dt, t, p) {
      const k = Number(p?.speed) || 1.5;
      const h = dt * k;
      const d = diag;
      sim.T += h;
      if (!sim.on && sim.T > 0.3) powerOn();
      // ---- sự cố theo thời gian ----
      if (sim.on && !sim.dead) {
        if (!d.fuse && sim.T > 5 && !sim.shorted) {
          sim.shorted = true;
          const at = mark(d.fanAt) || swMarker;
          fx.sparks(at, { count: 90, speed: 90, size: 3 });
          fx.fire(mark(d.packAt) || at, { size: 34, duration: 9 });
          fx.smoke(mark(d.packAt) || at, { size: 45, duration: 12 });
          if (item(d.packAt)) fx.scorch(item(d.packAt));
          if (item(d.fanAt)) fx.scorch(item(d.fanAt));
          die('bad', '🔥 Rung làm dây quạt cọ vào mép vít, tróc vỏ → CHẬP VBAT–GND. Không có cầu chì: ~60 A chạy qua dây AWG22 → dây đỏ rực, vỏ chảy, lửa lan sang pin!');
        }
        if (d.dustFan && d.fan && sim.T > 3.5 && !sim.fanDead) {
          sim.fanDead = true;
          if (mark(d.fanAt)) { fx.smoke(mark(d.fanAt), { size: 22, duration: 7 }); fx.sparks(mark(d.fanAt), { count: 25, speed: 35, size: 1.5 }); }
          setMsg('bad', '💨 Bụi, cát, tóc đi thẳng vào cánh quạt 18 000 vòng/phút → cánh mẻ, rung, bạc đạn kẹt → QUẠT CHẾT. Lực hút = 0.');
          sim.notes.push('quạt hút chết vì bụi đi thẳng vào cánh');
        }
        if (d.pic && d.esp && !d.bss) {
          once('bss', 'bad', '⚠️ Không có BSS138: byte UART lúc đúng lúc sai (RX của PIC cần ≥ 4 V, ESP32 chỉ có 3.3 V) → robot giật cục…');
          sim.jerkT -= h;
          if (sim.jerkT < -0.8) sim.jerkT = 0.3;
          if (sim.T > 7 && !sim.commDead) { sim.commDead = true; die('bad', 'GPIO18 của ESP32 đã hỏng vì 5 V từ PIC TX đổ vào liên tục → không còn nghe được PIC; PIC mất lệnh 300 ms → dừng hẳn.'); }
        }
        if (d.hotSide && d.drvHotAt) {
          sim.drvK = clamp((sim.T - 1) / 6, 0, 1);
          fx.heat(d.drvHotAt.item.object, sim.drvK);
          if (sim.drvK >= 1 && !sim.drvOff) {
            sim.drvOff = true;
            setMsg('bad', \`🌡 DRV8871 \${d.hotSide === 'L' ? 'trái' : 'phải'} không có đế tản nhiệt chạm 175 °C → tự ngắt (thermal shutdown) → bánh \${d.hotSide === 'L' ? 'trái' : 'phải'} đứng, robot quay vòng tròn.\`);
            sim.notes.push('DRV8871 quá nhiệt tự ngắt');
          }
        }
        if (d.espNoise) {
          sim.nextReset -= h;
          if (sim.nextReset <= 0) {
            sim.nextReset = 2.2; sim.espResetT = 0.55;
            sim.mode = 'TURN'; sim.turnTarget = sim.th + (Math.random() - 0.5) * 2.4;   // khởi động lại: mất odometry, quay sai hướng
            if (mark(d.espAt)) fx.flash(mark(d.espAt), { size: 26, color: 0x6aa8ff });
            once('noise', 'bad', '⚡ ESP32 nằm trên động cơ chổi than: nhiễu tia lửa cổ góp + PWM làm ESP32 reset liên tục → robot khựng, mất hướng.', 'ESP32 reset liên tục vì nhiễu động cơ');
          }
        }
        if (d.cg[0] < 0) once('rear', 'bad', \`↗ Trọng tâm ở sau trục bánh (\${d.cg[0].toFixed(0)} mm): robot ngóc đầu, bánh xoay lơ lửng, đi lạng lách.\`, 'trọng tâm sau trục → ngóc đầu, lạng lách');
        if (d.batTop && sim.bumps) once('top', 'bad', '↔ Pin trên nóc làm trọng tâm cao: mỗi lần va chạm robot lắc mạnh.', 'pin trên nóc → lắc mạnh khi va');
      }
      sim.espResetT = Math.max(0, sim.espResetT - h);
      // ---- máy trạng thái AUTO ----
      let cL = 0, cR = 0;
      const moving = sim.on && !sim.dead && sim.fallT < 0 && sim.espResetT <= 0 && sim.jerkT <= 0;
      if (moving) {
        if (sim.mode === 'FWD') { cL = cR = CRUISE; }
        else if (sim.mode === 'BACK') {
          cL = cR = -BACK;
          if (sim.backDist >= BACKUP_MM) {
            sim.mode = 'TURN';
            sim.turnTarget = sim.th + sim.turnSign * (100 + Math.random() * 70) * Math.PI / 180;
          }
        } else if (sim.mode === 'TURN') {
          const err = wrapA(sim.turnTarget - sim.th);
          const sp = clamp(600 * Math.abs(err), 160, 380) * Math.sign(err);
          cL = -sp; cR = sp;
          if (Math.abs(err) < 0.06) sim.mode = 'FWD';
        }
      }
      const effL = d.wheelL && d.drvL && !(sim.drvOff && d.hotSide === 'L');
      const effR = d.wheelR && d.drvR && !(sim.drvOff && d.hotSide === 'R');
      const tL = effL ? cL * VMAX / 1000 : 0, tR = effR ? cR * VMAX / 1000 : 0;
      const a = Math.min(1, h * 8);
      sim.vL += (tL - sim.vL) * a; sim.vR += (tR - sim.vR) * a;
      const tail = d.cg[0] < 0 && moving;          // trọng tâm sau trục → bánh xoay mất tải → lạng lách
      if (sim.fallT < 0) {
        // chia nhỏ bước tích phân (≤ 3 mm/bước) để cảm biến chống rơi & va chạm không "nhảy cóc" qua mép
        const n = Math.min(12, Math.max(1, Math.ceil((Math.max(Math.abs(sim.vL), Math.abs(sim.vR)) * h) / 3)));
        const hs = h / n;
        let mask = 0;
        for (let i = 0; i < n && sim.fallT < 0; i++) {
          const v = (sim.vL + sim.vR) / 2;
          let w = (sim.vR - sim.vL) / BASE;
          if (tail) w += (Math.sin(sim.T * 1.7) + Math.sin(sim.T * 3.1)) * 0.35;
          sim.th += w * hs;
          sim.px += v * Math.cos(sim.th) * hs;
          sim.pz += -v * Math.sin(sim.th) * hs;
          if (sim.mode === 'BACK') sim.backDist += Math.abs(v) * hs;
          // va chạm
          for (const [nx, nz, pen] of collide()) {
            sim.px += nx * pen; sim.pz += nz * pen;
            const cx = -nx, cz = -nz;
            const lx = cx * Math.cos(sim.th) - cz * Math.sin(sim.th);
            const lz = cx * Math.sin(sim.th) + cz * Math.cos(sim.th);
            const ang = Math.atan2(-lz, lx);
            if (Math.abs(ang) < 1.75) mask |= ang > 0.26 ? 1 : ang < -0.26 ? 2 : 3;
          }
          // cảm biến chống rơi: phản xạ của PIC cấm tiến ngay (1 chu kỳ 5 ms) — kể cả khi ESP32 đang reset
          const picAlive = sim.on && !sim.dead;
          const seen = picAlive ? d.cliffs.find((ang) => wx(155 * Math.cos(ang), -155 * Math.sin(ang)) > ARENA.x1) : undefined;
          if (seen !== undefined) {
            sim.vL = Math.min(sim.vL, 0); sim.vR = Math.min(sim.vR, 0);
            if (moving && sim.mode === 'FWD') {
              startBackup(seen > 0.05 ? 1 : seen < -0.05 ? -1 : 0);
              once('cliff', 'ok', '✓ Cảm biến chống rơi thấy mép bậc thang → PIC cấm tiến ngay, ESP32 lùi 60 mm rồi quay.');
            }
          }
          // rơi: bánh xoay hoặc bánh chủ động hụt mép
          if (wx(125, 0) > ARENA.x1 + 4 || wx(0, -117) > ARENA.x1 + 4 || wx(0, 117) > ARENA.x1 + 4) { sim.fallT = 0; sim.vL = sim.vR = 0; }
        }
        if (mask && moving) {
          if (d.bumper) { if (sim.mode === 'FWD') startBackup(mask === 1 ? 1 : mask === 2 ? -1 : 0); }
          else if (sim.mode === 'FWD') {
            sim.stuckT += h;
            if (sim.stuckT > 1.5 && !sim.saidStuck) { sim.saidStuck = true; sim.notes.push('kẹt ép vào vật cản (không có bumper)'); setMsg('bad', '🛑 Không có bumper: robot ép vào vật cản, bánh quay trượt tại chỗ (dòng động cơ tăng gần mức kẹt) — firmware không biết để lùi.'); }
          }
        } else sim.stuckT = Math.max(0, sim.stuckT - h);
      }
      // ---- rơi xuống bậc ----
      if (sim.fallT >= 0) {
        sim.fallT += dt;
        const u = Math.min(1, sim.fallT / 0.7);
        sim.pitch = -0.5 * u;
        sim.yOff = -ARENA.drop * 0.55 * u * u;
        if (u < 1) sim.px += 120 * Math.cos(sim.th) * dt;
        if (u >= 1 && !sim.said.has('fall')) {
          sim.said.add('fall');
          fx.sparks(chassis.group, { count: 40, speed: 50, size: 2 });
          fx.smoke(chassis.group, { size: 30, duration: 3, color: 0x9a8f80 });
          sim.dead = false;
          die('bad', \`💥 Rơi xuống bậc thang! \${d.cliffs.length < 4 ? \`Chỉ có \${d.cliffs.length}/4 cảm biến chống rơi — không cái nào nhìn thấy mép trước khi bánh xoay (cách trục 125 mm) hụt chân.\` : 'Cảm biến chống rơi không kịp phát hiện.'}\`);
        }
      } else {
        // dáng: ngóc đầu khi trọng tâm sau trục, lắc khi pin trên nóc
        const pT = d.cg[0] < 0 ? 0.075 + 0.02 * Math.sin(sim.T * 6) * (moving ? 1 : 0) : 0;
        sim.pitch += (pT - sim.pitch) * Math.min(1, dt * 5);
        sim.yOff = d.cg[0] < 0 ? 5 : 0;
        sim.rollV *= Math.exp(-dt * 1.6);
        sim.roll = sim.rollV * 0.12 * Math.sin(sim.T * 11);
      }
      // ---- gom rác ----
      const sweeping = sim.on && !sim.dead && d.brush && d.bin;
      if (sweeping) {
        const rad = d.fan && !sim.fanDead ? 140 : 90;
        let changed = false;
        arena.pts.forEach(([x, z], i) => {
          if (sim.collected.has(i)) return;
          if (Math.hypot(x - sim.px, z - sim.pz) < rad) { sim.collected.add(i); arena.dust.setMatrixAt(i, ZERO); changed = true; }
        });
        if (changed) arena.dust.instanceMatrix.needsUpdate = true;
      }
      // ---- hết giờ ----
      if (sim.T > 45 && !sim.dead) die(sim.notes.length ? 'bad' : 'ok', \`\${sim.notes.length ? '⚠️' : '✓'} Chạy thử xong 45 s: gom được \${Math.round((100 * sim.collected.size) / arena.pts.length)} % rác, \${sim.bumps} lần va/thấy hố. \${sim.notes.length ? 'Sự cố: ' + sim.notes.join('; ') + '.' : 'Không có sự cố ✓'} Bấm ■ để đưa robot về bàn.\`);
      // ---- pose ----
      rig.position.set(ARENA.cx + sim.px, ARENA.cy + sim.yOff, ARENA.cz + sim.pz);
      rig.rotation.set(sim.roll, sim.th, sim.pitch);
      // ---- linh kiện con chuyển động (bánh, chổi, quạt, lidar…) ----
      const powered = sim.on && !sim.dead;
      if (powered) {
        for (const [sid, a2] of assign) {
          if (sim.fanDead && a2.it.type === 'quat-bldc') continue;
          if (sid === 'banh-trai' && !effL) continue;
          if (sid === 'banh-phai' && !effR) continue;
          H.tickItem(a2.it.object, dt, t);
        }
      }
    }

    // ---------- hành động (nút bên trái + nút trong bảng 📋) ----------
    function act(id) {
      if (id === 'run') startRun();
      if (id === 'home') { if (run.phase === 'idle') cam(H.BENCH_VIEW); else stopRun(false); }
      if (id === 'wire') {
        wiringShown = true;
        assess();
        const miss = status.wiring.filter((x) => !x.ok).length;
        setMsg(miss ? 'bad' : 'ok', miss ? \`🔌 \${status.wOk}/\${status.wTot} dây nối được — \${miss} dây thiếu module hoặc module sai chỗ (xem danh sách).\` : \`🔌 Đủ \${status.wTot} dây theo docs/01 ✓ — đỏ VBAT, cam 5 V, đen GND, vàng PWM, xanh dương UART, xanh lá analog.\`);
      }
      if (id === 'auto' && sb) { stopRun(true); sb.load(fullLayout()); setMsg('ok', '🪄 Đã lắp đúng toàn bộ (đáp án). Ctrl+Z để hoàn tác về bố cục của bạn.'); }
      if (id === 'kit' && sb) { stopRun(true); sb.load(kitLayout()); setMsg('info', '📦 Bộ linh kiện đã bày ra bàn: phải = cơ khí, trái = nguồn & điện tử. Kéo từng món vào ô lắp.'); }
    }

    // ---------- bố cục cho sự cố ----------
    function faultLayout(id) {
      const mods = {
        'thieu-buck': { buck: null },
        'khong-cau-chi': { 'cau-chi': null },
        'quat-truoc-hop-bui': { 'hop-bui': 'quat-bldc', quat: 'hop-bui' },
        'esp-canh-dong-co': { 'drv-trai': 'esp32-s3', esp32: 'driver-drv8871' },
        'thieu-bss138': { bss138: null },
        'pin-sau': { 'hop-bui': 'pack-4s-bms', pin: 'hop-bui' },
        'thieu-cliff': { 'cliff-2': null, 'cliff-3': null },
        'thieu-bumper': { bumper: null },
        'thieu-driver': { 'drv-phai': null },
      }[id] || {};
      const list = [];
      for (const s of avail) {
        const type = s.id in mods ? mods[s.id] : s.accepts[0];
        if (type && compById[type]) list.push(entrySlot(s, type));
        if (s.id in mods && mods[s.id] === null && !Object.values(mods).includes(s.accepts[0])) list.push(entryKit(s));   // món bị "quên" nằm lại trên bàn
      }
      return list;
    }

    // ---------- vòng lặp ----------
    let tRead = 0;
    let preview = null;            // ô đang được "ngắm" khi kéo linh kiện (xem trước bắt dính)
    const tmpV = new THREE.Vector3();
    function previewSnap(t) {
      const it = run.phase === 'idle' ? sb?.selected : null;
      let best = null;
      if (it?.object?.userData.xw && lastPos.get(it.uid) !== key(it.object)) {      // đang bị kéo
        const p = it.object.position;
        for (const s of avail) {
          const d = Math.hypot(p.x - s.world.x, p.z - s.world.z);
          if (d > s.r) continue;
          const kind = s.accepts.includes(it.type) ? 'ok' : s.misfit?.[it.type] ? 'wrong' : 'no';
          const sc = d - (kind === 'ok' ? 30 : kind === 'wrong' ? 10 : 0);
          if (!best || sc < best.sc) best = { s, sc, kind };
        }
      }
      if ((best?.s.id || null) !== preview) { if (preview) colorGhost(slotById[preview]); preview = best?.s.id || null; }
      if (best) {
        const other = assign.get(best.s.id);
        const busy = other && other.it !== it;
        const col = best.kind === 'ok' && !busy ? 0x3fcf8e : best.kind === 'wrong' && !busy ? 0xffb347 : 0xff3030;
        H.setGhost(best.s.ghostObj, col, 0.3 + 0.15 * Math.sin(t * 10), 1);
      }
    }
    return {
      object: root,

      update(dt, t, p) {
        if (!camInit) { camInit = true; cam(H.BENCH_VIEW); }
        const gOn = p?.ghost !== false, wOn = p?.wires !== false;
        if (gOn !== ghostOn) { ghostOn = gOn; ghostVis(); }
        if (wOn !== wiresOn) { wiresOn = wOn; wiresG.visible = wOn; }
        // ô nháy đỏ khi thả sai
        for (const [sid, rem] of [...flashes]) {
          const s = slotById[sid];
          const left = rem - dt;
          if (left <= 0) { flashes.delete(sid); colorGhost(s); continue; }
          flashes.set(sid, left);
          const k = 0.5 + 0.5 * Math.sin(t * 14);
          H.setGhost(s.ghostObj, 0xff3030, 0.15 + 0.3 * k, 1);
        }
        previewSnap(t);
        // linh kiện bay từ bàn vào ô (hướng dẫn)
        for (let i = tweens.length - 1; i >= 0; i--) {
          const tw = tweens[i];
          tw.t += dt;
          const u = Math.min(1, tw.t / tw.dur), e = u * u * (3 - 2 * u);
          tmpV.lerpVectors(tw.from, tw.to, e);
          tmpV.y += Math.sin(Math.PI * u) * 220;
          tw.obj.position.copy(tmpV);
          if (u >= 1) { tw.obj.position.copy(tw.to); tweens.splice(i, 1); }
        }
        // chạy thử
        if (run.phase === 'lift') {
          run.t += dt;
          const u = Math.min(1, run.t / 2.4), e = u * u * (3 - 2 * u);
          tmpV.set(ARENA.cx + sim.px, ARENA.cy, ARENA.cz + sim.pz);
          rig.position.lerpVectors(run.from, tmpV, e);
          rig.position.y += Math.sin(Math.PI * u) * 380;
          rig.rotation.set(0, sim.th * e, 0);
          if (u >= 1) run.phase = 'drive';
        } else if (run.phase === 'drive') {
          drive(dt, t, p);
        } else if (run.phase === 'return') {
          run.t += dt;
          const u = Math.min(1, run.t / 1.4), e = u * u * (3 - 2 * u);
          tmpV.set(0, H.STAND, 0);
          rig.position.lerpVectors(run.from, tmpV, e);
          rig.position.y += Math.sin(Math.PI * u) * 380;
          rig.rotation.set(0, run.fromTh * (1 - e), 0);
          if (u >= 1) { finishReturn(); setMsg('info', 'Robot đã về giá kê — sửa lắp ráp rồi ▶ chạy thử lại.'); }
        }
        tRead += dt;
        if (tRead > 0.25) {
          tRead = 0;
          readout('dust', run.phase === 'idle' ? 0 : Math.round((100 * sim.collected.size) / arena.pts.length));
        }
      },

      onAction(id) { act(id); },

      setStep(i) {
        stopRun(true);
        tweens.length = 0;
        if (i < 0) { restoreUser(); wiringShown = false; assess(); setMsg('info', 'Đã về bố cục của bạn.'); return; }
        if (mode === 'free' && sb) backup = sb.serialize();
        mode = 'tour';
        loadInternal(avail.map((s) => (s.step <= i ? entrySlot(s) : entryKit(s))));
        for (const s of avail.filter((x) => x.step === i)) {
          const a = assign.get(s.id);
          const k = H.KIT[s.id];
          if (!a || !k) continue;
          const from = new THREE.Vector3(k[0], 0, k[1]);
          a.it.object.position.copy(from);
          tweens.push({ obj: a.it.object, from, to: s.world.clone(), t: 0, dur: 1.0 });
        }
        wiringShown = i >= 14;
        assess();
        setMsg('info', \`<b>\${DEF.steps[i]?.title || \`Bước \${i + 1}\`}</b> — bố cục của bạn vẫn được giữ, ◀ về đầu để quay lại.\`);
        if (i >= 15) startRun();
      },

      triggerFault(id) {
        stopRun(true);
        tweens.length = 0;
        if (mode === 'free' && sb) backup = sb.serialize();
        mode = 'fault';
        loadInternal(faultLayout(id));
        wiringShown = true;
        assess();
        startRun();
      },

      resetFault() {
        stopRun(true);
        restoreUser();
        wiringShown = false;
        try { fx?.restore?.(root); } catch { /* bỏ qua */ }
        assess();
      },

      dispose() {
        for (const it of sb?.items || []) { try { it.object.userData.xw?.inst?.dispose?.(); } catch { /* bỏ qua */ } }
        panel?.remove();
        styleEl?.remove();
        if (hasDom) document.getElementById('xw-style')?.remove();
      },
    };
  },
};

export default DEF;
`;export{n as default};
