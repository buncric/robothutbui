// ⚡ Bàn thí nghiệm điện: cắm đúng & cắm sai — 19 tình huống có mô phỏng mạch + nhiệt + hiệu ứng.
// Mô hình mạch (đơn giản hóa nhưng đúng bậc độ lớn):
//   Nguồn (pin 4S: 14.4 V, nội trở 65 mΩ | nguồn bàn CV/CC) → [cầu chì] → dây 30 mΩ → nút "bus" có tụ 1.5 mF
//   Tải trên bus: buck XL4015 (→ 5 V logic: PIC, ESP32, BSS138), DRV8871 + động cơ bánh, MOSFET + động cơ chổi,
//   cộng các "đường sự cố" dạng diode/điện trở (vk, r). Tụ bus giải bằng Euler ẩn (ổn định cả khi chập 0.02 Ω).
//   Nhiệt mỗi linh kiện: C·dT/dt = P − (T − Ta)/Rth. Thời gian tự làm chậm/tua nhanh theo tình huống.
import {
  AMBIENT, fmtTime, fmtRate, clamp, fuseBlowTime, thermal, heatLevel, makeWire, perfboard, dipSocket,
  ceramicCap, electrolytic, resistor, crystal, led5, setLed, bladeFuse, screwTerminal, benchSupply, multimeter,
  pickit, probe, aimTool, wirePoints,
} from './_bench_helpers.js';

// ---------------------------------------------------------------- tình huống
// rate: [[t_thật_kết_thúc, tốc độ phát], …] — chế độ "Tự động" (chậm lúc sự kiện nhanh, tua nhanh lúc chờ nóng)
const SCEN = [
  {
    id: 'dung', opt: '✅ Cắm đúng chuẩn — mọi thứ chạy', rate: [[0.002, 0.002], [0.1, 0.02], [1.5, 0.25], [Infinity, 1]],
  },
  {
    id: 'nguoc-buck', opt: '💥 Cắm ngược cực pin vào buck XL4015', label: 'Cắm ngược cực pin vào buck XL4015', severity: 'no',
    rate: [[0.012, 0.002], [0.3, 0.05], [Infinity, 1]],
    what: '<p>Bật công tắc → "tách", chớp sáng ở IC XL4015/diode SS54, khói xám mùi khét, IC vỡ vỏ bay lên. Ngõ ra buck 0 V. Cầu chì 10 A cũng đứt sau ~4 ms — nhưng IC đã chết trước đó (~3 ms).</p>',
    why: '<p>Module XL4015 <b>không có chống ngược cực</b>. IN− (GND của bo) nhận +14.4 V → dòng chạy: GND bo → diode SS54 (thuận) → nút SW → diode thân của khóa công suất trong XL4015 → IN+ → âm pin. Hai diode ≈ 1.4 V, còn lại chỉ có nội trở pin ~65 mΩ + dây ~35 mΩ → <code>I ≈ (14.4 − 1.4)/0.1 ≈ 130 A</code>. <code>P ≈ 130 × 1.4 ≈ 180 W</code> dồn vào mẩu silicon vài mm² → > 300 °C trong ~3 ms → nổ vỡ.</p><p>Cầu chì 10 A ở 13× định mức cần ~4 ms để đứt: <b>cầu chì bảo vệ DÂY và PIN, không kịp bảo vệ chip bán dẫn</b>.</p>',
    fix: '<ul><li>Đầu nối có chiều (XT60, JST) + đi dây đúng màu đỏ/đen; đo cực bằng đồng hồ trước khi cắm.</li><li>Mạch chống ngược ở nguồn tổng: P-MOSFET (IRF4905/AO4407, sụt vài chục mV) hoặc diode Schottky nối tiếp (sụt ~0.4 V).</li><li>Lần cấp nguồn đầu: nguồn bàn giới hạn 0.1–0.2 A → ngược cực thì nguồn vào CC, áp chỉ ~1.4 V, không gì cháy (bật "Dùng nguồn bàn" rồi cấp lại để thấy).</li><li>Đã nổ: ngắt nguồn, chờ nguội, bỏ module, kiểm tra lại dây.</li></ul>',
  },
  {
    id: 'nguoc-tu', opt: '💥 Tụ hóa 1000 µF cắm ngược cực', label: 'Tụ hóa 1000 µF cắm ngược cực', severity: 'no',
    rate: [[0.002, 0.005], [0.1, 0.05], [1.5, 0.5], [Infinity, 1.5]],
    what: '<p>Ban đầu mọi thứ chạy bình thường! Vài giây sau tụ ấm, nóng; nắp nhôm phồng thành vòm; khoảng 10 s: "BỤP" — van an toàn khía chữ K xé ra, phụt hơi trắng mùi tanh, có khi cả vỏ tụ bắn khỏi đế.</p>',
    why: '<p>Tụ hóa nhôm dựa vào lớp ô-xít nhôm cực mỏng chỉ có ở cực <b>dương</b>. Cắm ngược, phía âm chỉ chịu ~1–1.5 V → ở 14.4 V dòng rò tăng dần từ mA lên vài A (điện phân sinh khí H₂). <code>P = 14.4 V × 2–4 A ≈ 30–60 W</code> trong lon Ø10×20 mm → dung dịch sôi (~105 °C), áp suất tăng → nắp phồng → van xé.</p>',
    fix: '<ul><li>Vạch trắng có dấu "−" trên vỏ = cực ÂM; chân ngắn = âm; trên PCB nửa vòng tô đậm = âm.</li><li>Chọn tụ áp ≥ 1.5× áp làm việc (25 V cho pin 16.8 V).</li><li>Cấp nguồn lần đầu bằng nguồn bàn giới hạn dòng: tụ ngược làm dòng tăng dần → thấy CC là dừng.</li><li>Tụ đã phồng/xì: bỏ, không "thử lại". Mở cửa thoáng khí, rửa tay.</li></ul>',
  },
  {
    id: 'chap-khong-cc', opt: '🔥 Chập +/− pin, KHÔNG có cầu chì', label: 'Chập +/− pin, không cầu chì', severity: 'chay',
    rate: [[0.0005, 0.002], [0.1, 0.1], [0.49, 0.5], [0.51, 0.002], [1.6, 0.1], [Infinity, 1]],
    what: '<p>Hệ thống đang chạy, một đoạn dây 22AWG tuốt 2 đầu rơi vắt ngang thanh cái + và −. Dòng vọt ~170 A, PIC/ESP32 reset vì áp sập. ~0.2 s vỏ PVC bốc khói, ~0.4 s bốc cháy, ~1 s lõi đồng đỏ rực rồi chảy đứt, tóe lửa. Pin nóng lên.</p>',
    why: '<p>Tổng trở: nội trở pin ~65 mΩ + dây nguồn ~30 mΩ + 30 cm dây 0.33 mm² (~16 mΩ) → <code>I ≈ 14.4/0.11 ≈ 130–170 A</code>. Trên dây chập <code>P = I²R ≈ 400–500 W</code> mà dây chỉ nặng ~1 g → tăng ~1000 °C/s; điện trở đồng tăng 0.39 %/°C nên càng nóng càng nhanh. PVC mềm 80–105 °C, phân hủy ~200 °C, cháy ~400 °C; đồng chảy 1085 °C. Bên trong pin cũng tỏa <code>I²·R_pin ≈ 1.5 kW</code>.</p><p>Giả định pin không có BMS hoặc BMS hỏng — hay gặp với pin tháo từ robot cũ/pack tự ghép.</p>',
    fix: '<ul><li>Cầu chì đặt <b>sát cực dương pin</b> (đoạn dây trước cầu chì là không được bảo vệ).</li><li>Định mức cầu chì ≤ khả năng chịu dòng của dây nhỏ nhất phía sau (dự án: 10 A cho dây 18AWG).</li><li>Dùng BMS có bảo vệ ngắn mạch; bọc co nhiệt mọi đầu dây; tháo nhẫn/đồng hồ kim loại.</li><li>Bật "Xem cách làm ĐÚNG": cầu chì 10 A đứt trong ~3 ms, dây gần như không kịp ấm.</li><li>Nếu cháy: rút XT60 nếu an toàn, bình CO₂/bột; pin Li-ion cháy → để xa, làm mát bằng nhiều nước/cát.</li></ul>',
  },
  {
    id: 'cau-chi-30a', opt: '🔥 Cầu chì quá to (30 A) + dây nhỏ chập mềm', label: 'Cầu chì quá to 30 A', severity: 'chay',
    rate: [[0.001, 0.005], [0.49, 0.5], [0.7, 0.02], [Infinity, 1]],
    what: '<p>Dây 24AWG cọ rách vỏ chạm vít khung (nối GND). Robot <b>VẪN CHẠY BÌNH THƯỜNG</b> — không reset, không báo gì — trong khi chỗ chạm đỏ rực, tóe lửa lách tách, dây bốc khói rồi cháy. Cầu chì 30 A còn nguyên.</p>',
    why: '<p>Chập "mềm" qua điện trở tiếp xúc ~0.4 Ω + 1 m dây 0.2 mm² (84 mΩ): <code>I ≈ 14.4/0.58 ≈ 25 A</code> = 0.83× định mức 30 A → cầu chì <b>không bao giờ đứt</b> (cần ≥ 135 %). Nhưng dây 24AWG chỉ chịu ~3–5 A: <code>P_dây ≈ 25² × 0.084 ≈ 50 W</code>, tại điểm chạm <code>25² × 0.4 ≈ 250 W</code> → đỏ rực, mồi lửa. Áp pin chỉ sụt ~1.6 V nên mạch điều khiển không hề biết.</p>',
    fix: '<ul><li>Chọn cầu chì theo <b>DÂY</b>, không theo tải: 24AWG ≈ 3 A, 22AWG ≈ 5 A, 18AWG ≈ 10 A, 14AWG ≈ 20 A.</li><li>Nhánh dây nhỏ thêm cầu chì nhánh (polyfuse 1–3 A).</li><li>Bọc gen/ống ruột gà chỗ dây đi qua mép kim loại.</li><li>Bật "Xem cách làm ĐÚNG": cầu chì 10 A đứt sau ~0.15 s.</li></ul>',
  },
  {
    id: 'pin-vao-vdd', opt: '💥 Cắm 14.4 V pin thẳng vào VDD của PIC', label: '14.4 V pin vào VDD PIC', severity: 'no',
    rate: [[0.0002, 0.0005], [0.02, 0.005], [1, 0.1], [Infinity, 1]],
    what: '<p>Hai header 2 chân giống hệt nhau trên bo — cắm nhầm dây VBAT vào header 5 V. Sau ~50 µs PIC đã chết; vài ms sau "tách", vỏ nứt, chớp sáng, khói; chip nóng cháy xém đế. LED không bao giờ sáng. ESP32 (cấp USB) sống nhờ BSS138 ngăn cách.</p>',
    why: '<p>PIC16F877A chịu tối đa <b>VDD = 7.5 V</b> (Absolute Maximum). Ở 14.4 V lớp ô-xít cổng (vài nm) bị đánh thủng → chip thành điện trở ~1.5 Ω: <code>I ≈ 9 A, P ≈ 120 W</code>. Dây vàng bond Ø25 µm chảy đứt sau vài ms → vỡ vỏ. Cầu chì 10 A không đứt (9 A < 13.5 A). Nguồn bàn giới hạn dòng cũng <b>không cứu được chip</b> (quá ÁP giết trong µs) — chỉ giúp không cháy.</p>',
    fix: '<ul><li>Dùng đầu nối KHÁC LOẠI cho VBAT (XT30) và 5 V (JST-XH), đánh dấu màu.</li><li>Đầu vào 5 V của bo PIC: polyfuse + diode TVS/zener 5.6 V (zener chập → polyfuse ngắt).</li><li>Đo bằng đồng hồ trước khi cắm. Luôn hàn ĐẾ DIP để thay chip trong 10 giây.</li></ul>',
  },
  {
    id: 'buck-chua-chinh', opt: '🔥 Quên chỉnh buck trước khi nối tải (ra 13.4 V)', label: 'Quên chỉnh buck (ra 13.4 V)', severity: 'chay',
    rate: [[0.03, 0.005], [1, 0.1], [3, 1], [Infinity, 6]],
    what: '<p>XL4015 mua về để biến trở ở vị trí bất kỳ — thường gần max. Bật nguồn: ray "5 V" lên 13.4 V; PIC nổ nứt trong vài ms. ESP32 sống lay lắt: LDO 3.3 V nóng bỏng, tự ngắt nhiệt rồi bật lại (ESP32 reset liên tục); sau ~1 phút LDO hỏng chập → 13.4 V vào ESP32 → chết, khói.</p>',
    why: '<p>Buck hạ áp theo tỉ lệ biến trở hồi tiếp; ở max, ngõ ra ≈ Vin − ~1 V. PIC chịu tối đa 7.5 V → đánh thủng (buck giới hạn ~5.5 A vẫn đủ đốt). LDO của ESP32 tiêu tán <code>(13.4 − 3.3) × 0.15 A ≈ 1.5 W</code> trên vỏ SOT-223 (~110 °C/W) → > 160 °C → bảo vệ nhiệt cắt/đóng lặp lại, sau vài chu kỳ hỏng kiểu chập.</p>',
    fix: '<p><b>QUY TẮC VÀNG:</b> chỉnh buck khi <b>CHƯA nối tải</b>: cấp vào, que đồng hồ (V DC) ở OUT+/OUT−, vặn biến trở đa vòng 3296 tới 5.0–5.1 V (ngược chiều kim đồng hồ là giảm). Rồi mới nối tải, đo lại khi có tải. Nhỏ keo khóa biến trở. Thêm zener/TVS 5.6 V + polyfuse ở bo PIC. Bật "Xem cách làm ĐÚNG": đồng hồ đọc 5.0 V trước khi nối.</p>',
  },
  {
    id: 'uart-thang', opt: '⚡ Nối thẳng UART PIC (5 V) ↔ ESP32 (3.3 V), bỏ BSS138', label: 'UART 5 V nối thẳng ESP32', severity: 'hong',
    rate: [[0.001, 0.01], [4, 1], [Infinity, 3600]],
    what: '<p>"Lúc được lúc không": ESP32 vẫn nhận STATUS từ PIC, nhưng PIC hiếm khi nhận đúng khung DRIVE → bánh giật, dừng mỗi 300 ms. Tua nhanh: sau ~10 giờ chân GPIO18 của ESP32 hỏng hẳn → mất STATUS, app báo mất kết nối PIC.</p>',
    why: '<p><b>PIC → ESP32:</b> mức 1 của PIC = 5 V, chân ESP32-S3 chịu tối đa 3.6 V. Dòng chui qua diode ESD vào ray 3.3 V: <code>(5 − 3.3 − 0.6)/~40 Ω ≈ 27 mA</code>, kéo dài vì UART rảnh ở mức 1 → diode/kim loại hóa xuống cấp dần (hỏng sau giờ–ngày).</p><p><b>ESP32 → PIC:</b> mức 1 của ESP32 chỉ 3.3 V, nhưng RC7/RX của PIC là đầu vào Schmitt cần ≥ 0.8·VDD = 4.0 V → bit sai, checksum sai.</p>',
    fix: '<ul><li>Dùng BSS138 2 chiều (như dự án). Tối thiểu: PIC TX → phân áp 1 k/2 k → ESP32 RX (3.33 V); ESP32 TX → PIC RX bắt buộc nâng mức (BSS138, 74HCT).</li><li>Luôn chung GND.</li><li>Chân đã bị quá áp lâu ngày: chuyển UART sang GPIO khác (ESP32-S3 ánh xạ UART tự do).</li></ul>',
  },
  {
    id: 'quen-gnd', opt: '⚠️ Quên nối chung GND PIC ↔ ESP32', label: 'Quên chung GND', severity: 'loi',
    rate: [[0.001, 0.01], [Infinity, 1]],
    what: '<p>ESP32 cấp bằng USB laptop, PIC cấp bằng buck, chỉ có dây TX/RX. Terminal ESP32 đầy ký tự rác, lỗi checksum tăng vọt; PIC thỉnh thoảng mới nhận đúng DRIVE → bánh chạy 0.3 s rồi dừng, lặp lại. Động cơ càng chạy, lỗi càng nhiều.</p>',
    why: '<p>Điện áp là <b>chênh lệch giữa 2 điểm</b>. "1" = 3.3 V so với GND của ESP32, nhưng PIC đo so với GND của nó. Không nối chung, hai GND trôi nổi lệch nhau (điện dung ký sinh, nhiễu động cơ — có thể vài volt, dao động) → đọc sai bit. Dòng tín hiệu không có đường về nên đi qua đường ký sinh.</p>',
    fix: '<ul><li>Quy tắc dự án số 1: <b>CHUNG GND</b> mọi khối, nối hình sao về cực âm pin.</li><li>Mỗi bó dây tín hiệu luôn kèm GND (cáp UART 4 sợi 5V/GND/TX/RX).</li><li>Debug bằng USB laptop vẫn phải nối GND robot ↔ ESP32.</li></ul>',
  },
  {
    id: 'thieu-flyback', opt: '⚡ Thiếu diode flyback ở động cơ chổi (MOSFET)', label: 'Thiếu diode flyback (MOSFET chổi)', severity: 'hong',
    rate: [[0.001, 0.01], [3, 1], [Infinity, 10]],
    what: '<p>Chổi cuộn điều tốc PWM 1 kHz qua IRLZ44N, tải thảm ~2 A. Máy hiện sóng ở cực D: gai 60–90 V mỗi lần MOSFET tắt (nguồn chỉ 14.4 V!). MOSFET nóng dần — ~1 phút sau vượt 175 °C, "tách", mùi khét: hỏng <b>CHẬP D–S</b> → chổi quay hết tốc độ mãi, PIC ra lệnh tắt cũng không dừng.</p>',
    why: '<p>Cuộn dây (L ≈ 2 mH) chống thay đổi dòng: <code>V = L·di/dt</code>. Cắt 2 A trong ~100 ns → muốn vọt hàng nghìn volt, bị MOSFET kẹp ở áp đánh thủng thác lũ (avalanche) ~60–70 V (V_DSS = 55 V) + dao động ký sinh. Mỗi lần tắt <code>E = ½·L·I² ≈ 4–5 mJ</code> đổ vào MOSFET; × 1000 lần/s ≈ 5 W → TO-220 không tản nhiệt (62 °C/W) → > 175 °C → hỏng (thường chập). Gai áp còn lan theo GND gây reset PIC.</p>',
    fix: '<ul><li>Diode Schottky SS34 song song NGƯỢC với động cơ (catốt về +VBAT, anốt về cực D) → V_D bị kẹp ở 14.4 + 0.5 V.</li><li>Tụ 100 nF ngang 2 cực động cơ; trở cổng 100 Ω + kéo xuống 10 kΩ (docs/01 quy tắc 4).</li><li>Chổi tự chạy không tắt được: ngắt nguồn ngay, thay MOSFET.</li></ul>',
  },
  {
    id: 'thieu-tu-nhieu', opt: '⚠️ Thiếu tụ chống nhiễu động cơ + tụ 1000 µF', label: 'Thiếu tụ chống nhiễu động cơ', severity: 'loi',
    rate: [[0.001, 0.01], [Infinity, 0.5]],
    what: '<p>Mỗi lần bánh/chổi khởi động, PIC reset: LED tắt rồi nháy lại từ đầu, bánh giật, chổi bật–tắt liên tục, robot "co giật". Kênh ray 5 V trên máy hiện sóng có gai tụt dưới 4 V.</p>',
    why: '<p>Động cơ chổi than tóe lửa ở cổ góp (nhiễu vài MHz) và có dòng khởi động lớn (chổi ~7 A, bánh ~0.8 A trong vài chục ms). Không có tụ 1000 µF sát driver, dòng xung chạy qua dây dài → sụt áp và "nảy GND" (<code>V = L·di/dt + I·R</code> trên dây GND chung). PIC thấy VDD &lt; ngưỡng BOR 4.0 V → reset → ngõ ra thả nổi → động cơ dừng → 72 ms sau (PWRT) PIC chạy lại, nhận lệnh, bật động cơ → lại reset… vòng lặp.</p>',
    fix: '<ul><li>Tụ gốm 100 nF hàn ngay 2 cực mỗi động cơ (+ 2 tụ 47 nF xuống vỏ nếu nhiễu nặng).</li><li>Tụ hóa 1000 µF/25 V sát chân nguồn mỗi driver; 100 nF sát mỗi cặp VDD/VSS của PIC.</li><li>GND động lực và GND logic đi riêng, gặp nhau 1 điểm (hình sao); firmware tăng tốc dần (ramp).</li></ul>',
  },
];
SCEN.push(
  {
    id: 'drv-nguoc', opt: '💥 Cấp nguồn ngược cho DRV8871', label: 'DRV8871 cấp nguồn ngược', severity: 'no',
    rate: [[0.01, 0.002], [0.3, 0.05], [Infinity, 1]],
    what: '<p>"Bốp" — IC DRV8871 chớp sáng, vỡ vỏ, khói; cầu chì 10 A đứt sau ~4 ms; PIC/ESP32 mất nguồn. Dây GND tín hiệu (dupont) giữa PIC và driver cũng gánh ~20 A trong tích tắc — nếu không có cầu chì nó sẽ nóng rực rồi đứt.</p>',
    why: '<p>Trong DRV8871 là cầu H 4 MOSFET, mỗi cái có diode thân. Đảo VM/GND: dòng đi GND → diode thân MOSFET dưới → OUT → diode thân MOSFET trên → VM: hai diode ≈ 1.4 V → gần như chập: ~110 A, ~150 W trong chip 5×4 mm → hỏng sau ~3 ms (trước khi cầu chì đứt). Thêm nữa: chân GND driver nay là +14.4 V, nối qua dây GND tín hiệu (0.13 mm², ~0.09 Ω) về GND của PIC → đường chập thứ hai qua dây mảnh nhất hệ thống. DRV8871 không có chống ngược (VM tối thiểu −0.3 V).</p>',
    fix: '<ul><li>Đầu nối có chiều; P-MOSFET chống ngược ở nguồn tổng (bảo vệ mọi module phía sau).</li><li>Lần đầu cấp bằng nguồn bàn giới hạn dòng: ngược cực → CC ở ~0.2 V → không cháy.</li><li>Đo VM so với GND phải là +14.x V trước khi cắm driver.</li></ul>',
  },
  {
    id: 'ket-dong-co', opt: '🔥 Kẹt bánh xe, cấp 14.4 V liên tục', label: 'Kẹt động cơ kéo dài', severity: 'chay',
    rate: [[0.001, 0.01], [1, 1], [Infinity, 30]],
    what: '<p>Bánh bị chèn cứng nhưng ESP32 vẫn ra lệnh 100 %. Dòng ~2 A liên tục. ~2–3 phút: mùi khét véc-ni; ~4–5 phút: khói nhẹ; ~6 phút: chập vòng dây → dòng tăng, DRV8871 giới hạn dòng, nóng tới 175 °C → tự ngắt nhiệt, nguội rồi chạy lại → bánh giật từng cơn.</p>',
    why: '<p>Kẹt → không quay → không có sức phản điện động: <code>I = V/R = 14.4/7 ≈ 2 A</code>, toàn bộ <code>P = I²R ≈ 30 W</code> thành nhiệt trong cuộn dây (chạy thường chỉ 1–2 W), quạt trên rô-to cũng đứng. Men cách điện cấp B/F chịu 130–155 °C. Điện trở đồng tăng theo nhiệt nên dòng giảm dần, nhưng cuộn vẫn tới ~200 °C. DRV8871: R_DS(on) tổng 0.565 Ω, giới hạn dòng <code>I_TRIP = 64/R_ILIM(kΩ)</code> (bo Adafruit 30 kΩ → 2.1 A), ngắt nhiệt ~175 °C.</p>',
    fix: '<ul><li>Firmware phát hiện kẹt: PWM > 30 % mà encoder 0 xung trong 0.5 s → dừng, báo lỗi, thử lùi.</li><li>Đặt R_ILIM phù hợp, tăng tốc dần (ramp) khi khởi động.</li><li>Bật "Xem cách làm ĐÚNG": firmware cắt sau 0.5 s, động cơ không kịp ấm.</li></ul>',
  },
  {
    id: 'pic-nguoc-de', opt: '🔥 Cắm PIC ngược chiều trong đế', label: 'Cắm PIC ngược chiều trong đế', severity: 'chay',
    rate: [[0.3, 0.1], [2, 1], [Infinity, 4]],
    what: '<p>Khấc chip ngược khấc đế. Bật nguồn: LED không nháy, ESP32 báo mất liên lạc. Dòng 5 V vọt ~2.5 A; ~5 s chip nóng không sờ được; ~30–40 s bốc khói, mùi nhựa cháy; cuối cùng nứt vỏ.</p>',
    why: '<p>Xoay 180°, chân n của chip rơi vào lỗ 41−n: 5 V ở lỗ 11 & 32 đi vào chân 30 (RD7) & 9 (RE1) của chip; GND ở lỗ 12 & 31 vào chân 29 (RD6) & 10 (RE2). Dòng chạy qua diode bảo vệ ESD từ chân I/O lên ray VDD trong chip — chip được "cấp nguồn" sai đường. Dòng chích lớn kích hoạt <b>latch-up</b> (thyristor ký sinh trong CMOS đóng lại) → chập nội bộ, chỉ bị giới hạn bởi nguồn: <code>5 V × 2.5 A ≈ 10 W</code> trong DIP-40 (47 °C/W) → vài trăm độ.</p>',
    fix: '<ul><li>Khấc chip trùng khấc đế; chân 1 có chấm tròn.</li><li>Cấp nguồn đầu tiên sau khi cắm chip bằng nguồn bàn giới hạn 50–100 mA: thấy CC hoặc dòng > 30 mA khi chưa chạy → tắt ngay.</li><li>Chip đã nóng → gần như chắc chắn hỏng; thay chip, kiểm tra linh kiện nối chân 9/10/29/30.</li></ul>',
  },
  {
    id: 'nap-khi-dong-co', opt: '⚠️ Nạp chương trình khi động cơ đang có nguồn', label: 'Nạp chương trình khi động cơ có nguồn', severity: 'loi',
    rate: [[0.001, 0.01], [Infinity, 1]],
    what: '<p>Robot trên bàn, bánh chạm mặt bàn. Bấm Program trong MPLAB IPE: trong ~3.5 s nạp, bánh thỉnh thoảng giật; vừa nạp xong chương trình test chạy ngay <code>motor_output(1000,1000)</code> → bánh 100 % — robot lao khỏi bàn.</p>',
    why: '<p>Khi nạp, PICkit kéo MCLR lên VPP ≈ 13 V; mọi chân I/O thành đầu vào thả nổi (Hi-Z). Dây IN1/IN2 dài 20 cm bắt nhiễu (xung PGC/PGD, động cơ) → DRV8871 lúc nhận 1 lúc 0 (kéo xuống nội ~100 kΩ là yếu). Nạp xong PICkit nhả MCLR → chương trình chạy <b>ngay</b>. Trong lúc nạp, phản xạ an toàn (bumper, mất liên lạc 300 ms) cũng không chạy.</p>',
    fix: '<ul><li>Trước khi nạp: rút nguồn động lực (dây VBAT của driver/chổi hoặc công tắc động lực riêng), kê robot cho bánh lơ lửng.</li><li>Firmware: sau reset để động cơ TẮT, chờ lệnh hợp lệ đầu tiên từ ESP32 hoặc nút START.</li><li>Trở kéo xuống 10 kΩ ở IN1/IN2 và cổng MOSFET.</li></ul>',
  },
  {
    id: 'do-dong-song-song', opt: '💥 Đo dòng (thang 10 A) mà đặt que song song nguồn', label: 'Đồng hồ thang A cắm song song nguồn', severity: 'no',
    rate: [[0.001, 0.01], [0.299, 1], [0.33, 0.005], [Infinity, 1]],
    what: '<p>Đồng hồ đang ở thang A (que đỏ ở lỗ 10A) — chạm 2 que vào 2 cực pin "để xem pin còn bao nhiêu". Tóe lửa ở đầu que, đầu kim rỗ/dính; "bụp" trong đồng hồ — cầu chì của đồng hồ đứt sau ~15 ms. Đồng hồ rẻ không có cầu chì ở lỗ 10A: shunt đỏ rực, vỏ chảy, khói. Cầu chì 10 A của robot không giúp gì vì que chạm TRƯỚC cầu chì.</p>',
    why: '<p>Ở thang dòng, đồng hồ là một sợi dây: shunt ~0.01 Ω + dây que ~0.06 Ω. Đặt song song pin: <code>I ≈ 14.4/(0.065 + 0.08) ≈ 100 A</code>. Ampe kế phải mắc <b>nối tiếp</b>; vôn kế mắc <b>song song</b> (10 MΩ, gần như không lấy dòng).</p>',
    fix: '<ul><li>Trước mỗi lần chạm que: nhìn núm xoay + lỗ que đỏ.</li><li>Đo áp: núm V, que đỏ ở VΩ. Đo dòng: ngắt mạch, đưa đồng hồ vào giữa (nối tiếp), bắt đầu ở 10 A; đo xong trả que về VΩ ngay.</li><li>Dùng đồng hồ CAT III có cầu chì HRC cho lỗ mA và 10A; thay đúng loại (F10A H 600V), không quấn dây đồng.</li></ul>',
  },
  {
    id: 'gioi-han-dong', opt: 'ℹ️ Nguồn bàn giới hạn dòng cứu mạch (chế độ CC)', label: 'Nguồn bàn giới hạn dòng (CC) cứu mạch', severity: 'nhe',
    rate: [[0.03, 0.005], [Infinity, 1]],
    what: '<p>Bo MOSFET mới hàn có một cầu thiếc chập VBAT–GND. Cấp thẳng bằng pin: chớp sáng ở cầu thiếc, cầu chì 10 A đứt sau ~5 ms. Cấp bằng nguồn bàn (bật "Xem cách làm ĐÚNG"): đèn CC đỏ sáng ngay, áp tụt ~0.1 V, dòng đứng yên đúng giới hạn — không gì nóng; bạn biết NGAY có chập.</p>',
    why: '<p>Nguồn bàn có 2 chế độ: <b>CV</b> (giữ áp, dòng tùy tải) và <b>CC</b> (giữ dòng ≤ giới hạn, áp tự hạ: <code>V = I_lim × R_tải</code>). Chập 0.05 Ω, giới hạn 0.1 A → V = 5 mV, P = 0.5 mW. Pin không giới hạn gì: <code>I ≈ 14.4/0.15 ≈ 100 A</code>.</p>',
    fix: '<ol><li>Đo thông mạch VBAT–GND, 5V–GND (không được ≈ 0 Ω).</li><li>Nguồn bàn đặt đúng áp, giới hạn 50–200 mA.</li><li>Bật, nhìn đèn CC & dòng; sờ kiểm tra linh kiện nóng.</li><li>Mới tăng giới hạn dần. Thử kéo "Giới hạn dòng" lên 5 A rồi cấp lại để so sánh.</li></ol>',
  },
  {
    id: 'rut-gnd-truoc', opt: '⚡ Tháo ESP32 khi đang cấp điện (rút GND trước)', label: 'Tháo dây khi đang có điện (rút GND trước)', severity: 'hong',
    rate: [[0.001, 0.01], [Infinity, 1]],
    what: '<p>Đang chạy, rút dây GND của ESP32 trước (dây 5 V vẫn cắm). ESP32 reset liên tục, PIC mất liên lạc → tự dừng bánh sau 300 ms (phản xạ an toàn đúng!). Cắm lại GND: ESP32 chạy lại nhưng UART chết hẳn — chân TX/RX đã hỏng.</p>',
    why: '<p>Rút GND, dòng ~100 mA của ESP32 vẫn phải tìm đường về âm nguồn: qua diode ESD của GPIO17/18 → dây UART → BSS138 → chân RC6/RC7 của PIC → diode ESD → VSS. Mỗi chân gánh ~50 mA, gấp 2–10× mức cho phép (PIC ±20 mA dòng chích; ESP32 vài mA).</p>',
    fix: '<ul><li>Tắt nguồn rồi mới tháo/lắp bất kỳ module nào.</li><li>Buộc phải cắm nóng: GND nối ĐẦU TIÊN, tháo CUỐI CÙNG (chân GND của USB dài hơn vì lý do này).</li><li>Trở 100–330 Ω nối tiếp trên dây UART để hạn dòng chích.</li><li>Bật "Xem cách làm ĐÚNG": tắt → tháo → lắp → bật.</li></ul>',
  },
  {
    id: 'cam-nong-xt60', opt: 'ℹ️ Cắm nóng XT60 khi công tắc đang BẬT (tia lửa)', label: 'Cắm nóng XT60 (tia lửa)', severity: 'nhe',
    rate: [[0.299, 1], [0.302, 0.001], [0.5, 0.05], [Infinity, 1]],
    what: '<p>Công tắc bật sẵn, cắm XT60: "tạch" — tia lửa xanh ở đầu nối. Mạch vẫn chạy, nhưng chân XT60 rỗ đen; lặp lại nhiều lần → tiếp xúc kém, nóng.</p>',
    why: '<p>Tụ 1000 µF + 470 µF đang 0 V = chập trong tích tắc: <code>I_đỉnh ≈ 14.4/(0.065 + 0.03) ≈ 150 A</code>, giảm theo <code>e^(−t/RC)</code>, RC ≈ 0.1 Ω × 1.5 mF ≈ 0.15 ms. Chân cắm chạm–nảy vài lần → hồ quang mỗi lần. Nếu đầu vào chỉ có tụ gốm, cảm kháng dây còn gây vọt áp gần gấp đôi (~25–28 V).</p>',
    fix: '<ul><li>Cắm pin khi công tắc TẮT.</li><li>Đầu nối chống tia lửa XT90-S (điện trở nạp trước 5 Ω), hoặc mạch precharge (10 Ω nạp tụ ~0.1 s rồi MOSFET/rơ-le nối tắt), hoặc NTC hạn dòng khởi động.</li><li>Bật "Xem cách làm ĐÚNG": precharge → dòng xung chỉ ~1.4 A.</li></ul>',
  },
);
const SC = Object.fromEntries(SCEN.map((s) => [s.id, s]));

// ---------------------------------------------------------------- dây nối & cấu hình hình ảnh
const C = {
  red: 0xd23b3b, blk: 0x1e1f22, org: 0xff8c1a, yel: 0xf2d13a, grn: 0x3fbf5f, blu: 0x3b7dd8, cyn: 0x2fc7c7,
  pur: 0xa86bf0, pnk: 0xff7eb6, wht: 0xe8e8e8, gry: 0x8a9099, cu: 0xc87533,
};
// [id, từ, tới, màu, bán kính, lệch]
const BASE = [
  ['sP', 'srcP', 'fuseIn', C.red, 1.1, 0], ['f2s', 'fuseOut', 'swIn', C.red, 1.1, 0], ['s2b', 'swOut', 'busP0', C.red, 1.1, 0],
  ['sN', 'srcN', 'busN0', C.blk, 1.1, -1],
  ['bkP', 'busP1', 'buckInP', C.red, 0.9, 1], ['bkN', 'busN1', 'buckInN', C.blk, 0.9, -1],
  ['o5', 'buckOutP', 'picVin', C.org, 0.7, 0], ['oG', 'buckOutN', 'picGnd', C.blk, 0.7, 1],
  ['dP', 'busP2', 'drvVM', C.red, 0.9, 0], ['dN', 'busN2', 'drvGnd', C.blk, 0.9, 1],
  ['cP', 'capP', 'drvVM', C.red, 0.5, 0], ['cN', 'capN', 'drvGnd', C.blk, 0.5, 0],
  ['m1', 'drvO1', 'motA', C.wht, 0.6, 0], ['m2', 'drvO2', 'motB', C.gry, 0.6, 1],
  ['in1', 'picCCP1', 'drvIn1', C.blu, 0.45, 0], ['in2', 'picRD0', 'drvIn2', C.cyn, 0.45, 1], ['dg', 'picGndM', 'drvInG', C.blk, 0.45, 2],
  ['brP', 'busP3', 'brushP', C.red, 0.9, 0], ['brN', 'mosD', 'brushN', C.gry, 0.9, 1], ['mG', 'busN3', 'mosS', C.blk, 0.9, 0],
  ['gate', 'picRD5', 'mosG', C.pur, 0.45, 0], ['gG', 'picGndB', 'mosGG', C.blk, 0.45, 1],
  ['hv', 'picU5V', 'bssHV', C.org, 0.45, 0], ['hg', 'picUGnd', 'bssGH', C.blk, 0.45, 1],
  ['tx', 'picTX', 'bssHV1', C.yel, 0.45, -1], ['rx', 'picRX', 'bssHV2', C.grn, 0.45, -2],
  ['lv1', 'bssLV1', 'espRX', C.yel, 0.45, 0], ['lv2', 'bssLV2', 'espTX', C.grn, 0.45, 1],
  ['lv', 'bssLV', 'esp3V3', C.pnk, 0.45, 2], ['lg', 'bssGL', 'espGnd', C.blk, 0.45, -1],
  ['e5', 'picE5', 'esp5V', C.org, 0.5, 0], ['eg', 'picEG', 'espGnd2', C.blk, 0.5, 1],
];
const WIRE_DESC = {
  [C.red]: 'Dây đỏ = cực dương. Dây nguồn VBAT 18AWG (0.82 mm², chịu ~10 A).',
  [C.blk]: 'Dây đen = GND (mass). Mọi khối phải chung GND.',
  [C.org]: 'Dây cam = +5 V logic (sau buck).',
  [C.yel]: 'Dây vàng = UART TX của PIC (RC6) → RX của ESP32 (GPIO18).',
  [C.grn]: 'Dây xanh lá = UART TX của ESP32 (GPIO17) → RX của PIC (RC7).',
  [C.blu]: 'Dây xanh dương = PWM 20 kHz (CCP1) → DRV8871 IN1.',
  [C.cyn]: 'Dây xanh ngọc = chiều quay (RD0) → DRV8871 IN2.',
  [C.pur]: 'Dây tím = cổng MOSFET chổi (RD5).',
  [C.pnk]: 'Dây hồng = 3.3 V từ ESP32 cho phía LV của BSS138.',
  [C.wht]: 'Dây ra động cơ bánh (OUT1).', [C.gry]: 'Dây ra động cơ (OUT2 / cực âm chổi về cực D MOSFET).',
  [C.cu]: 'Đoạn dây đồng 22AWG tuốt vỏ rơi lung tung — nguồn gốc chập mạch.',
};

// Cấu hình hình ảnh theo tình huống: (fixed) => {...}
const VIS = {
  dung: () => ({}),
  'nguoc-buck': (f) => ({
    del: f ? ['o5', 'oG', 'e5', 'eg'] : ['bkP', 'bkN', 'o5', 'oG', 'e5', 'eg'],
    add: f ? [] : [['bkPx', 'busN1', 'buckInP', C.blk, 0.9, 1], ['bkNx', 'busP1', 'buckInN', C.red, 0.9, -1]],
    bad: ['bkPx', 'bkNx'], focus: 'buck', probes: 'buck',
  }),
  'nguoc-tu': (f) => ({ capRev: !f, focus: 'cap' }),
  'chap-khong-cc': (f) => ({
    del: f ? [] : ['sP', 'f2s'], add: [...(f ? [] : [['sPd', 'srcP', 'swIn', C.red, 1.1, 0]]), ['short', 'busP4', 'busN4', C.cu, 0.35, 3]],
    fuse: f ? 10 : 0, bad: ['short', 'sPd'], focus: 'short',
  }),
  'cau-chi-30a': (f) => ({
    add: [['chafeP', 'busP4', 'chassis', C.red, 0.4, 2], ['chafeN', 'chassis', 'busN4', C.blk, 0.6, -2]],
    fuse: f ? 10 : 30, chassis: true, bad: ['chafeP'], focus: 'screw',
  }),
  'pin-vao-vdd': (f) => (f ? {} : {
    del: ['o5', 'oG', 'e5'], add: [['vbP', 'busP4', 'picVin', C.red, 0.9, 0], ['vbN', 'busN4', 'picGnd', C.blk, 0.9, 1]],
    bad: ['vbP'], usb: true, focus: 'pic',
  }),
  'buck-chua-chinh': (f) => ({ probes: f ? 'buck' : 'rest', focus: 'buck' }),
  'uart-thang': (f) => (f ? {} : {
    del: ['tx', 'rx', 'lv1', 'lv2'], add: [['txd', 'picTX', 'espRX', C.yel, 0.45, 0], ['rxd', 'espTX', 'picRX', C.grn, 0.45, 1]],
    bad: ['txd', 'rxd'], focus: 'esp',
  }),
  'quen-gnd': (f) => (f ? {} : { del: ['e5', 'eg', 'lg'], usb: true, focus: 'espGnd' }),
  'thieu-flyback': (f) => ({ diode: f, focus: 'mos' }),
  'thieu-tu-nhieu': (f) => (f ? {} : { del: ['cP', 'cN'], bulkCap: false, motorCaps: false, focus: 'mot' }),
  'drv-nguoc': (f) => (f ? {} : {
    del: ['dP', 'dN'], add: [['dPx', 'busN2', 'drvVM', C.blk, 0.9, 0], ['dNx', 'busP2', 'drvGnd', C.red, 0.9, 1]],
    bad: ['dPx', 'dNx'], focus: 'drv',
  }),
  'ket-dong-co': () => ({ block: true, focus: 'wheel' }),
  'pic-nguoc-de': (f) => ({ picRev: !f, focus: 'pic' }),
  'nap-khi-dong-co': (f) => ({ pickit: true, del: f ? ['dP', 'brP'] : [], focus: 'wheel' }),
  'do-dong-song-song': (f) => ({ meter: f ? 'V' : 'A', probes: 'src', focus: 'meter' }),
  'gioi-han-dong': (f) => ({ bridge: true, forceBench: f, focus: 'bridge' }),
  'rut-gnd-truoc': () => ({ focus: 'espGnd' }),
  'cam-nong-xt60': () => ({ focus: 'xt' }),
};

const RUN = 'CHẠY ✓';
const TH = {   // [C (J/K), Rth (K/W)] — nút nhiệt
  buck: [3, 25], buckJ: [0.002, 40], pic: [1.5, 47], ldo: [0.25, 110], drv: [0.5, 62], drvJ: [0.002, 40], mot: [15, 11],
  mos: [2, 62], cap: [2.5, 35], wire: [0.5, 60], chafe: [1.7, 20], screw: [1.5, 15], batt: [160, 3], bridge: [0.03, 100],
  dg: [0.14, 80], meter: [3, 20], bss: [0.3, 150],
};
const TNAME = {
  buck: 'XL4015', buckJ: 'Lõi XL4015/SS54', pic: 'PIC16F877A', ldo: 'LDO 3.3 V của ESP32', drv: 'DRV8871', drvJ: 'Lõi DRV8871',
  mot: 'Cuộn dây động cơ bánh', mos: 'MOSFET IRLZ44N', cap: 'Tụ 1000 µF', wire: 'Dây chập', chafe: 'Dây 24AWG cọ rách',
  screw: 'Điểm chạm vít khung', batt: 'Pin 4S', bridge: 'Cầu thiếc', dg: 'Dây GND tín hiệu', meter: 'Shunt đồng hồ', bss: 'BSS138',
};
const BAT_V = 14.4, BAT_R = 0.065, BENCH_R = 0.02, R_FEED = 0.03, CBUS = 1.5e-3;
const KE = 0.011, T_FRIC = 0.0012, B_V = 1.2e-6;   // động cơ bánh như dong-co-dc.js

export default {
  id: 'ban-thi-nghiem-dien',
  name: 'Bàn thí nghiệm điện: cắm đúng & cắm sai',
  category: 'mo-phong',
  order: 3,
  icon: '⚡',
  summary: 'Cả hệ điện của robot trải trên thảm chống tĩnh điện: pin 4S, cầu chì, buck XL4015, PIC, ESP32, BSS138, DRV8871, MOSFET chổi, nguồn bàn, đồng hồ. 19 tình huống cắm đúng/cắm sai — bấm ⚡ Cấp nguồn để xem dòng vọt, nhiệt tăng, khói, lửa, nổ… và vì sao.',
  tags: ['cháy nổ', 'ngược cực', 'chập mạch', 'cầu chì', 'nguồn bàn', 'CC CV', 'flyback', 'GND', 'an toàn điện', 'tháo lắp'],

  params: [
    { id: 'scen', label: 'Tình huống', type: 'select', value: 'dung', options: SCEN.map((s) => [s.id, s.opt]) },
    { id: 'fixed', label: '✔ Xem cách làm ĐÚNG (sửa lỗi)', type: 'toggle', value: false, hint: 'Cùng tình huống nhưng đã sửa theo mục "Cách phòng"' },
    { id: 'go', label: '⚡ Cấp nguồn (bật công tắc)', type: 'button' },
    { id: 'off', label: '⏻ Ngắt nguồn & dọn bàn', type: 'button' },
    { id: 'bench', label: 'Dùng nguồn bàn thay vì pin', type: 'toggle', value: false, hint: 'Nguồn bàn có giới hạn dòng (CC) — cách an toàn để cấp nguồn lần đầu' },
    { id: 'ilim', label: 'Giới hạn dòng nguồn bàn', type: 'range', min: 0.05, max: 5, step: 0.05, value: 2, unit: 'A' },
    { id: 'vset', label: 'Áp đặt nguồn bàn', type: 'range', min: 0, max: 16.8, step: 0.1, value: 14.4, unit: 'V' },
    { id: 'speed', label: 'Tốc độ thời gian', type: 'select', value: 'auto', options: [
      ['auto', 'Tự động (chậm lúc sự kiện nhanh)'], ['1', 'Thời gian thật 1×'], ['0.1', 'Chậm 10×'], ['0.01', 'Chậm 100×'],
      ['0.001', 'Chậm 1000×'], ['10', 'Nhanh 10×'],
    ] },
  ],
  readouts: [
    { id: 'log', label: 'Diễn biến' },
    { id: 'time', label: 'Thời gian thật (tốc độ phát)' },
    { id: 'src', label: 'Nguồn: áp · dòng · chế độ' },
    { id: 'ipk', label: 'Dòng đỉnh từ lúc cấp nguồn', unit: 'A' },
    { id: 'v5', label: 'Ray 5 V logic (VDD PIC)', unit: 'V' },
    { id: 'temp', label: 'Nhiệt độ XL4015 · PIC · DRV8871 · MOSFET · động cơ', unit: '°C' },
    { id: 'hot', label: 'Điểm nóng nhất' },
    { id: 'pic', label: 'PIC16F877A' },
    { id: 'esp', label: 'ESP32-S3' },
    { id: 'uart', label: 'UART PIC ⇄ ESP32 (khung lỗi)' },
    { id: 'fuse', label: 'Cầu chì' },
  ],
  scope: {
    window: 4,
    note: '(trục ngang = thời gian hiển thị; sự kiện nhanh được làm chậm tới 2000× — xem "Thời gian thật"; dòng > 10 A bị cắt đỉnh, xem "Dòng đỉnh")',
    channels: [
      { name: 'V bus pin (sau cầu chì)', unit: 'V', min: 0, max: 18, color: '#ff6b6b' },
      { name: 'V ray 5 V logic', unit: 'V', min: 0, max: 16, color: '#ffd34d' },
      { name: 'V cực D MOSFET chổi', unit: 'V', min: 0, max: 100, color: '#c58bff' },
      { name: 'I nguồn', unit: 'A', min: 0, max: 10, color: '#4cc2ff' },
    ],
  },

  faults: SCEN.filter((s) => s.what).map(({ id, label, severity, what, why, fix }) => ({ id, label, severity, what, why, fix })),

  info: {
    overview: `
      <p>Đây là <b>bàn làm việc</b> của bạn khi ráp robot: mọi khối điện nằm trên thảm chống tĩnh điện, nối bằng dây thật (đỏ = dương, đen = GND, cam = 5 V, vàng/xanh = UART…). Rê chuột lên từng thứ để biết nó là gì.</p>
      <p>Cách dùng: chọn <b>Tình huống</b> → bấm <b>⚡ Cấp nguồn</b> → xem ô <b>Diễn biến</b>, máy hiện sóng, nhiệt độ. Vòng đỏ đánh dấu chỗ sai. Bật <b>✔ Xem cách làm ĐÚNG</b> rồi cấp lại để so sánh. Mỗi tình huống cũng có nút trong khung <b>⚠️ Thử lắp sai</b> kèm thẻ Hiện tượng / Vì sao / Cách phòng.</p>
      <p>Thử: chọn "Chập +/− pin, KHÔNG cầu chì" rồi bật/tắt "Xem cách làm ĐÚNG" — so sánh dây cháy trong 1 s với cầu chì đứt trong 3 ms. Sau đó bật <b>Dùng nguồn bàn</b>, đặt giới hạn 0.1 A và cấp lại: không gì cháy cả.</p>`,
    specs: [
      ['Pin 4S1P 18650', '14.4 V danh định (12.0–16.8 V), nội trở ~65 mΩ → dòng chập có thể > 150 A'],
      ['Cầu chì lưỡi ATO 10 A', 'Đứt: 2× → ~0.3 s · 3.5× → ~70 ms · 10× → ~7 ms · 16× → ~3 ms; < 1.35× không đứt'],
      ['Buck XL4015', 'Vào 8–36 V, ra 1.25–32 V, giới hạn ~5 A, hiệu suất ~87 %; KHÔNG chống ngược cực'],
      ['PIC16F877A', 'VDD 4.0–5.5 V ở 20 MHz; tối đa tuyệt đối 7.5 V; BOR 4.0 V; PWRT 72 ms; ±20 mA dòng chích mỗi chân'],
      ['ESP32-S3', 'I/O 3.3 V, chịu tối đa 3.6 V; ~100 mA (đỉnh 250 mA lúc bật RF); LDO trên bo từ chân 5V'],
      ['DRV8871', 'VM 6.5–45 V, R_DS(on) tổng 0.565 Ω, I_TRIP = 64/R_ILIM(kΩ), ngắt nhiệt ~175 °C, không chống ngược'],
      ['IRLZ44N', 'V_DSS 55 V, R_DS(on) 25 mΩ @ 5 V, TO-220 không tản nhiệt 62 °C/W, Tj max 175 °C'],
      ['Tụ hóa 1000 µF/25 V', 'Ø10×20 mm, vạch trắng = cực âm, van an toàn khía chữ K trên nắp'],
      ['Nguồn bàn', 'CV: giữ áp; CC: giữ dòng ≤ giới hạn, áp tự hạ V = I·R'],
    ],
    principle: `
      <h4>1. Ba câu hỏi trước mỗi lần cấp nguồn</h4>
      <ul><li><b>Áp có đúng không?</b> (đo bằng đồng hồ, đặc biệt ngõ ra buck)</li><li><b>Cực có đúng không?</b> (đỏ +, đen −, vạch trắng tụ = −, khấc IC)</li><li><b>Dòng tối đa là bao nhiêu nếu có chập?</b> (I = V / R_tổng — pin Li-ion: hàng trăm ampe)</li></ul>
      <h4>2. Công suất là thứ đốt cháy</h4>
      <p><code>P = I²·R</code> (dây, cầu thiếc, shunt) hoặc <code>P = V·I</code> (diode, MOSFET, chip). Nhiệt độ tăng theo <code>C·dT/dt = P − (T − T_môi_trường)/R_th</code>: vật nhỏ (dây mảnh, lõi silicon) có C nhỏ → nóng trong mili-giây; cuộn dây động cơ C lớn → vài phút.</p>
      <h4>3. Bảo vệ đúng thứ</h4>
      <ul><li><b>Cầu chì</b> bảo vệ DÂY và PIN khỏi cháy — chọn theo dây nhỏ nhất, đặt sát pin. Không bảo vệ được chip (chậm hơn chip vài ms).</li><li><b>Chống ngược cực</b> (P-MOSFET/diode) bảo vệ module.</li><li><b>Zener/TVS + polyfuse</b> bảo vệ chip khỏi quá áp.</li><li><b>Giới hạn dòng nguồn bàn</b> bảo vệ bo mới khỏi mọi lỗi lắp ráp — trừ quá áp.</li><li><b>Diode flyback, tụ chống nhiễu</b> bảo vệ khỏi năng lượng cuộn cảm (<code>V = L·di/dt</code>).</li></ul>
      <h4>4. Mô phỏng này tính gì?</h4>
      <p>Nguồn (pin: 14.4 V, 65 mΩ; nguồn bàn: CV/CC) → cầu chì → dây 30 mΩ → tụ bus 1.5 mF (giải bằng Euler ẩn) với các tải: buck (→ 5 V), động cơ bánh (phương trình như bài Động cơ DC), động cơ chổi, và "đường sự cố" (diode 1.4 V, dây chập…). Mỗi linh kiện có một nút nhiệt (C, R_th). Số liệu là ước lượng đúng bậc độ lớn, không thay được đo thật.</p>`,
    inRobot: `
      <p>Sơ đồ trên bàn bám đúng <code>docs/01_KIEN_TRUC_VA_SO_DO_CHAN.md</code>: Pin 4S → cầu chì 10 A → công tắc → VBAT (DRV8871 ×2, MOSFET chổi IRLZ44N + diode SS34) và buck XL4015 → 5 V (PIC16F877A, ESP32-S3 chân 5V, BSS138 phía HV). UART 19200 PIC RC6/RC7 ⇄ BSS138 ⇄ ESP32 GPIO18/17 (<code>docs/02_GIAO_THUC.md</code>). PIC: CCP1 → IN1, RD0 → IN2, RD5 → cổng MOSFET chổi, RD7 → LED.</p>
      <p>Quy tắc bắt buộc của dự án được minh họa ở đây: chung GND hình sao; tụ 1000 µF ở mỗi driver + 100 nF ở mỗi VDD PIC và 2 cực động cơ; logic có buck riêng; diode SS34 song song ngược động cơ chổi.</p>`,
    mistakes: `
      <ul>
        <li>Vặn buck sau khi đã nối PIC/ESP32 → 13 V vào chip 5 V/3.3 V.</li>
        <li>Chọn cầu chì "cho chắc" 30 A cho dây 24AWG → dây cháy trước cầu chì.</li>
        <li>Đo áp pin khi que đỏ còn ở lỗ 10A → chập qua đồng hồ.</li>
        <li>Tháo/lắp module khi còn điện, rút GND trước → dòng chạy qua chân tín hiệu.</li>
        <li>Cắm chip ngược khấc; cắm tụ ngược vạch; quên nối GND chung.</li>
        <li>Cấp bo mới bằng pin thay vì nguồn bàn giới hạn dòng.</li>
      </ul>`,
    quiz: [
      { q: 'Pin 4S nội trở 65 mΩ, dây 30 mΩ, chập bằng dây 16 mΩ. Dòng chập xấp xỉ bao nhiêu? Cầu chì 10 A đứt sau bao lâu?', a: 'I ≈ 14.4 / 0.111 ≈ 130 A (13×) → theo đường cong ATO ~4 ms.' },
      { q: 'Vì sao cầu chì 10 A không cứu được XL4015 khi cắm ngược cực?', a: 'Hai diode dẫn ~130 A, chip nhận ~180 W và vượt 300 °C sau ~3 ms — nhanh hơn thời gian cầu chì đứt (~4 ms). Cầu chì bảo vệ dây/pin, còn chip cần mạch chống ngược.' },
      { q: 'Nguồn bàn đặt 14.4 V, giới hạn 0.1 A, nối vào chỗ chập 0.05 Ω. Đèn nào sáng, áp ra bao nhiêu?', a: 'Đèn CC; V = 0.1 × 0.05 = 5 mV; công suất chỉ 0.5 mW — không gì nóng.' },
    ],
  },

  build(ctx) {
    const { THREE, MAT, geom, label, readout, fx } = ctx;
    const { mesh, part, box, cyl } = geom;
    const root = new THREE.Group();
    const A = {};                       // điểm đấu dây (toạ độ root)
    const SP = {};                      // điểm đặt hiệu ứng
    const at = (obj, p) => { root.updateMatrixWorld(true); return obj.localToWorld(new THREE.Vector3(...p)).toArray(); };
    const spot = (parent, p) => { const o = new THREE.Object3D(); o.position.set(...p); parent.add(o); return o; };
    const stdMat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...extra });

    // ---------------- thảm chống tĩnh điện
    root.add(part(mesh(box(560, 3, 340, 3), stdMat(0x35566f, { roughness: 0.95 }), { y: -1.5, z: -10 }),
      'Thảm chống tĩnh điện (ESD mat)', 'Cao su 2 lớp, điện trở bề mặt 10⁶–10⁹ Ω, nối đất qua 1 MΩ: xả từ từ điện tích trên tay/dụng cụ để không đánh thủng cổng MOSFET, chân ESP32. Đeo kèm vòng tay chống tĩnh điện.'));
    root.add(part(mesh(cyl(4, 4, 3, 16), MAT.zinc, { x: 262, y: 1.5, z: 142 }), 'Nút nối đất thảm + vòng tay', 'Kẹp dây vòng tay vào đây; dây có điện trở 1 MΩ để an toàn khi chạm điện.'));

    // ---------------- nguồn bàn
    const bs = benchSupply(ctx);
    bs.group.position.set(-200, 0, -105);
    root.add(part(bs.group, 'Nguồn bàn 0–30 V / 0–5 A', 'Hai núm: ÁP (CV) và GIỚI HẠN DÒNG (CC). Đèn xanh CV = đang giữ áp; đèn đỏ CC = tải đòi nhiều hơn giới hạn → nguồn tự hạ áp. Cách an toàn nhất để cấp điện lần đầu cho bo mới.'));
    label(bs.group, 'Nguồn bàn', [0, 82, 0]);
    A.benchP = at(bs.group, bs.posP); A.benchN = at(bs.group, bs.posN);

    // ---------------- pin 4S + XT60
    const pack = new THREE.Group();
    pack.position.set(-205, 0, 50);
    const cellMat = stdMat(0x2e7d5b, { roughness: 0.35 });
    for (let i = 0; i < 4; i++) pack.add(mesh(cyl(9.15, 9.15, 65, 28), cellMat, { x: -27.6 + i * 18.4, y: 9.4, rx: Math.PI / 2 }));
    pack.add(mesh(box(76, 19.6, 68, 3), stdMat(0x2a5db0, { transparent: true, opacity: 0.45, roughness: 0.25 }), { y: 9.8 }));
    for (const s of [-1, 1]) pack.add(mesh(box(72, 8, 0.4), MAT.zinc, { y: 9.4, z: s * 34.3 }));
    pack.add(mesh(box(56, 1.2, 20), MAT.pcbBlue, { y: 20.3 }));
    for (let i = 0; i < 4; i++) pack.add(mesh(box(5, 1.5, 4), MAT.icBody, { x: -18 + i * 12, y: 21.6 }));
    root.add(part(pack, 'Pin Li-ion 4S1P 14.4 V (4 × 18650)', 'Bốn cell nối tiếp: 4 × 3.6 V = 14.4 V (12.0 cạn – 16.8 V đầy). Nội trở ~65 mΩ cả khối → chập mạch cho > 150 A. Mạch BMS dán phía trên (bảo vệ quá dòng/quá xả).'));
    label(pack, 'Pin 4S 14.4 V', [0, 32, 0]);
    root.add(makeWire(ctx, [-167, 14, 46], [-158, 4, 47], C.red, 1.2), makeWire(ctx, [-167, 14, 54], [-158, 4, 53], C.blk, 1.2));
    const xt = new THREE.Group();
    xt.position.set(-150, 0, 50);
    const yellow = stdMat(0xf2c200);
    xt.add(mesh(box(16, 8.2, 15.5, 1.5), yellow, { x: -8, y: 4.1 }));
    const xtMale = mesh(box(16, 8.2, 15.5, 1.5), yellow, { x: 8, y: 4.1 });
    xt.add(xtMale);
    root.add(part(xt, 'Đầu nối XT60 (có chiều)', 'Chịu 60 A, vỏ vát một góc nên không cắm ngược được. Cắm khi công tắc đang bật sẽ tóe lửa (tụ đầu vào nạp ~150 A trong ~0.2 ms).'));
    SP.xt = spot(xt, [0, 10, 0]);
    A.batP = [-134, 5, 47]; A.batN = [-134, 5, 53];

    // ---------------- cầu chì + công tắc
    const fh = new THREE.Group();
    fh.position.set(-110, 0, 30);
    fh.add(mesh(box(28, 10, 13, 2), MAT.plasticBlack, { y: 5 }));
    const fuse = bladeFuse(ctx, C.red);
    fuse.group.scale.setScalar(0.85);
    fh.add(fuse.group);
    root.add(part(fh, 'Cầu chì lưỡi ATO trong đế nối dây', 'Màu = định mức: đỏ 10 A, xanh lá 30 A. Dây chảy kẽm bên trong đứt khi dòng vượt lâu. Phải đặt sát cực dương pin.'));
    SP.fuse = spot(fh, [0, 18, 0]);
    A.fuseIn = at(fh, [-14, 5, 0]); A.fuseOut = at(fh, [14, 5, 0]);
    const sw = new THREE.Group();
    sw.position.set(-75, 0, 30);
    sw.add(mesh(box(22, 14, 16, 2), MAT.plasticBlack, { y: 7 }));
    const rocker = mesh(box(18, 5, 12, 1.5), MAT.plasticRed, { y: 15 });
    sw.add(rocker);
    root.add(part(sw, 'Công tắc nguồn chính (rocker 16 A)', 'Ngắt toàn bộ VBAT. Khi bật, tụ đầu vào nạp → tia lửa nhỏ bên trong công tắc là bình thường.'));
    A.swIn = at(sw, [-11, 6, 0]); A.swOut = at(sw, [11, 6, 0]);

    // ---------------- 2 thanh cái Wago (+VBAT, GND)
    const wago = (pos, name, desc, key) => {
      const g = new THREE.Group();
      g.position.set(...pos);
      g.add(mesh(box(33, 9, 19, 1.5), stdMat(0xd8dde3, { transparent: true, opacity: 0.8, roughness: 0.3 }), { y: 4.5 }));
      for (let i = 0; i < 5; i++) g.add(mesh(box(5, 2, 13, 0.6), stdMat(0xff8c1a), { x: -12.8 + 6.4 * i, y: 9.8, z: 2 }));
      root.add(part(g, name, desc));
      for (let i = 0; i < 5; i++) A[key + i] = at(g, [-12.8 + 6.4 * i, 9, -6]);
      return g;
    };
    wago([-40, 0, -5], 'Cút nối Wago 221 — thanh cái +VBAT', 'Một điểm chia nguồn dương tới buck, DRV8871, động cơ chổi. Cần gạt cam kẹp dây, không cần hàn.', 'busP');
    wago([-40, 0, 25], 'Cút nối Wago 221 — thanh cái GND', 'Điểm GND chung hình sao: mọi GND gặp nhau ở đây rồi về cực âm pin.', 'busN');

    // ---------------- buck XL4015
    const bk = new THREE.Group();
    bk.position.set(-40, 2, 95);
    bk.add(geom.pcb(54, 23, { mat: MAT.pcbBlue }));
    const capIn = electrolytic(ctx, { r: 4, h: 11, color: 0x15171a, legs: 0.5 });
    capIn.group.position.set(-17, 0, -5);
    const capOut = electrolytic(ctx, { r: 4, h: 11, color: 0x15171a, legs: 0.5 });
    capOut.group.position.set(17, 0, 5);
    bk.add(part(capIn.group, 'Tụ đầu vào 220 µF/50 V', 'Lọc dòng xung của bộ chuyển mạch.'), part(capOut.group, 'Tụ đầu ra 220 µF/35 V', 'Làm phẳng 5 V.'));
    const torG = new THREE.TorusGeometry(6.5, 2.8, 12, 32);
    torG.rotateX(Math.PI / 2);
    bk.add(part(mesh(torG, MAT.copper, { x: 3, y: 3, z: -2 }), 'Cuộn cảm 47 µH (lõi xuyến)', 'Tích năng lượng mỗi chu kỳ 180 kHz.'));
    const buckIC = mesh(box(10, 4.4, 9, 0.5), MAT.icBody, { x: -6, y: 2.2, z: 6 });
    bk.add(part(buckIC, 'IC XL4015 (TO-263)', 'Bộ hạ áp chuyển mạch 5 A, khóa công suất bên trong có diode thân → đường chập khi cắm ngược cực.'));
    bk.add(part(mesh(box(7, 2.3, 5.5, 0.4), MAT.icBody, { x: -18, y: 1.15, z: 6 }), 'Diode Schottky SS54', 'Diode bắt dòng của buck (5 A, 40 V). Khi ngược cực nó dẫn thuận nối tiếp diode thân XL4015.'));
    bk.add(part(mesh(box(9.5, 10, 4.8, 0.6), MAT.plasticBlue, { x: 14, y: 5, z: -7 }), 'Biến trở đa vòng 3296 (chỉnh áp ra)', 'Vặn 25 vòng hết hành trình. PHẢI chỉnh ra 5.0 V bằng đồng hồ TRƯỚC khi nối tải.'));
    for (const [x, z] of [[-24, -6], [-24, 6], [24, -6], [24, 6]]) bk.add(mesh(box(4, 0.3, 4), MAT.tin, { x, y: 0.15, z }));
    root.add(part(bk, 'Module buck XL4015 (14.4 V → 5 V)', 'Hạ áp hiệu suất ~87 %. Không có chống ngược cực, không có giới hạn áp ra — tùy biến trở.'));
    label(bk, 'Buck XL4015', [0, 24, 0]);
    SP.buck = spot(bk, [-6, 8, 6]);
    A.buckInP = at(bk, [-24, 1, -6]); A.buckInN = at(bk, [-24, 1, 6]); A.buckOutP = at(bk, [24, 1, -6]); A.buckOutN = at(bk, [24, 1, 6]);

    // ---------------- bo PIC (perfboard)
    const pb = new THREE.Group();
    pb.position.set(40, 7, 80);
    const pf = perfboard(ctx, 84, 56);
    pb.add(part(pf.group, 'Bo đục lỗ (perfboard) mạch PIC', 'Xem bài "Hàn mạch PIC tối thiểu từng bước" để hàn bo này.'));
    for (const [x, z] of [[-38, -24], [38, -24], [-38, 24], [38, 24]]) pb.add(mesh(cyl(2.5, 2.5, 5.4, 6), MAT.brass, { x, y: -4.3, z }));
    const sock = dipSocket(ctx);
    pb.add(part(sock.group, 'Đế IC DIP-40', 'Khấc của đế ở đầu bên trái — khấc chip phải trùng khấc đế.'));
    const chipG = new THREE.Group();
    const dip = geom.dipPackage(40);
    chipG.add(dip.group);
    chipG.position.y = 2.6;
    pb.add(part(chipG, 'PIC16F877A', 'VDD 4.0–5.5 V (tối đa tuyệt đối 7.5 V). Khấc đánh dấu đầu chân 1.'));
    const crack = mesh(box(0.5, 0.3, 12), stdMat(0xd9d2c0), { x: 3, y: 7.3, ry: 0.4 });
    crack.visible = false;
    chipG.add(crack);
    for (const [x, z] of [[2.54, 11.5], [-2.54, -11.5]]) { const c = ceramicCap(ctx); c.position.set(x, 0, z); pb.add(part(c, 'Tụ 100 nF sát VDD/VSS', 'Tụ lọc cao tần cho chip.')); }
    const xtal = crystal(ctx); xtal.position.set(7.62, 0, 14); pb.add(part(xtal, 'Thạch anh 20 MHz + 2 tụ 22 pF', 'Nhịp tim của PIC.'));
    const r10k = resistor(ctx); r10k.position.set(-22, 0, 14); pb.add(part(r10k, 'Trở 10 kΩ kéo MCLR lên 5 V', ''));
    const picLed = led5(ctx, 0xff3030); picLed.group.position.set(26, 0, 20); pb.add(part(picLed.group, 'LED trạng thái (RD7, chân 30)', 'Nháy 1 Hz khi chương trình chạy. Tắt/nháy lại từ đầu = PIC vừa reset.'));
    const rLed = resistor(ctx, ['orange', 'orange', 'brown', 'gold'], { span: 7.62 }); rLed.position.set(16, 0, 20); pb.add(part(rLed, 'Trở 330 Ω hạn dòng LED', ''));
    const pterm = screwTerminal(ctx, 2); pterm.position.set(-38, 0, 18); pb.add(part(pterm, 'Domino nguồn 5 V vào bo PIC', 'Trái: +5 V, phải: GND. Trông y hệt domino VBAT — dễ cắm nhầm!'));
    A.picVin = at(pb, [-38, 10, 21]); A.picGnd = at(pb, [-33, 10, 21]);
    const hdr = (n, x, z, alongZ, name, desc, keys) => {
      const h = geom.pinHeader(n);
      h.position.set(x, 0, z);
      if (alongZ) h.rotation.y = -Math.PI / 2;
      pb.add(part(h, name, desc));
      keys.forEach((k, i) => { if (k) A[k] = at(pb, alongZ ? [x, 8.5, z + 2.54 * i] : [x + 2.54 * i, 8.5, z]); });
    };
    hdr(6, 38, -8, true, 'Header UART/ESP32 (TX, RX, 5V, GND, 5V, GND)', 'RC6/TX, RC7/RX → BSS138; 5 V + GND cấp cho BSS138 và ESP32.', ['picTX', 'picRX', 'picU5V', 'picUGnd', 'picE5', 'picEG']);
    hdr(3, 6, -22, false, 'Header driver bánh (CCP1, RD0, GND)', 'PWM 20 kHz → IN1, chiều → IN2.', ['picCCP1', 'picRD0', 'picGndM']);
    hdr(2, -12, -22, false, 'Header MOSFET chổi (RD5, GND)', '', ['picRD5', 'picGndB']);
    hdr(6, -38, -14, true, 'Header nạp ICSP (MCLR, VDD, GND, PGD, PGC, NC)', 'Cắm PICkit vào đây.', ['icsp0', 'icsp1', 'icsp2', 'icsp3', 'icsp4', 'icsp5']);
    root.add(pb);
    label(pb, 'PIC16F877A', [0, 16, -8]);
    SP.pic = spot(pb, [0, 8, 0]);

    // ---------------- BSS138
    const bss = new THREE.Group();
    bss.position.set(100, 3, 80);
    bss.add(mesh(box(16, 1.6, 15.5, 0.4), MAT.pcbBlue, { y: -0.8 }));
    for (let i = 0; i < 4; i++) bss.add(mesh(box(2.9, 1.1, 1.6), MAT.icBody, { y: 0.55, z: -4.5 + i * 3 }));
    for (const x of [-6.35, 6.35]) { const h = geom.pinHeader(6); h.position.set(x, 0, -6.35); h.rotation.y = -Math.PI / 2; bss.add(h); }
    root.add(part(bss, 'Mạch chuyển mức BSS138 4 kênh (5 V ⇄ 3.3 V)', 'Mỗi kênh: 1 MOSFET BSS138 + 2 trở kéo 10 kΩ. Trái HV (5 V, phía PIC), phải LV (3.3 V, phía ESP32). Hai chiều, đủ nhanh cho UART 19200.'));
    ['bssHV', 'bssHV1', 'bssHV2', 'bssHV3', 'bssHV4', 'bssGH'].forEach((k, i) => (A[k] = at(bss, [-6.35, 8.5, -6.35 + 2.54 * i])));
    ['bssLV', 'bssLV1', 'bssLV2', 'bssLV3', 'bssLV4', 'bssGL'].forEach((k, i) => (A[k] = at(bss, [6.35, 8.5, -6.35 + 2.54 * i])));

    // ---------------- ESP32-S3 DevKitC-1
    const esp = new THREE.Group();
    esp.position.set(165, 9, 80);
    esp.add(mesh(box(62.7, 1.6, 25.4, 0.5), MAT.pcbBlack));
    for (const z of [-11.43, 11.43]) {
      esp.add(mesh(box(56, 2.5, 2.5), MAT.plasticBlack, { y: -2.1, z }));
      for (let k = 0; k < 22; k++) esp.add(mesh(box(0.64, 7, 0.64), MAT.gold, { x: 26.67 - k * 2.54, y: -5.5, z }));
    }
    esp.add(mesh(box(25.5, 0.8, 18), MAT.pcbBlack, { x: 19, y: 1.2 }));
    esp.add(part(mesh(box(17.6, 2.6, 16), MAT.aluminum, { x: 14, y: 2.9 }), 'Module ESP32-S3-WROOM-1', 'Chip ESP32-S3 + flash + ăng-ten in, dưới nắp kim loại chống nhiễu. I/O 3.3 V — chịu tối đa 3.6 V.'));
    for (let i = 0; i < 5; i++) esp.add(mesh(box(0.5, 0.2, 14), MAT.gold, { x: 25 + i * 1.3, y: 1.7 }));
    for (const z of [-6, 6]) esp.add(mesh(box(7.5, 3.2, 9, 1), MAT.steel, { x: -29, y: 2.4, z }));
    const espLdo = mesh(box(6.5, 1.8, 3.5), MAT.icBody, { x: -18, y: 1.7, z: 5 });
    esp.add(part(espLdo, 'LDO 3.3 V trên bo ESP32', 'Hạ 5 V xuống 3.3 V bằng cách "đốt" phần dư: P = (Vin − 3.3) × I. Vin = 13 V thì nóng bỏng.'));
    const espLedMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x00ff66, emissiveIntensity: 0 });
    const espLed = mesh(box(5, 1.6, 5), espLedMat, { x: -16, y: 1.6, z: -6 });
    esp.add(part(espLed, 'LED RGB trên bo (GPIO48)', 'Xanh = chạy, đỏ nhấp nháy = reset/brownout.'));
    root.add(part(esp, 'ESP32-S3-DevKitC-1', '"Bộ não": BLE, thuật toán đi. Cấp 5 V vào chân 5V (LDO trên bo → 3.3 V). Chân 5V và GND ở đầu cổng USB.'));
    label(esp, 'ESP32-S3', [0, 14, 0]);
    SP.esp = spot(esp, [14, 6, 0]); SP.ldo = spot(esp, [-18, 4, 5]);
    const espPin = (row, k) => at(esp, [26.67 - (k - 1) * 2.54, 1.2, row * 11.43]);
    A.esp3V3 = espPin(1, 1); A.espTX = espPin(1, 10); A.espRX = espPin(1, 11); A.esp5V = espPin(1, 21); A.espGnd = espPin(1, 22);
    A.espGnd2 = espPin(-1, 21);
    const usb = makeWire(ctx, null, null, C.blk, 1.8, { points: [at(esp, [-34, 2.4, -6]), at(esp, [-50, -6, -6]), [110, 2, 130], [90, 2, 175]] });
    root.add(part(usb, 'Cáp USB → laptop', 'ESP32 đang được cấp điện từ laptop (GND của laptop, không phải GND robot).'));

    // ---------------- DRV8871 + tụ 1000 µF
    const drv = new THREE.Group();
    drv.position.set(40, 2, -40);
    drv.add(mesh(box(25.4, 1.6, 20.3, 0.5), MAT.pcbBlack, { y: -0.8 }));
    const drvIC = mesh(box(4.9, 1.5, 3.9, 0.2), MAT.icBody, { y: 0.75 });
    drv.add(part(drvIC, 'IC DRV8871 (HSOP-8)', 'Cầu H 3.6 A đỉnh, 45 V. Có giới hạn dòng (R_ILIM), ngắt nhiệt ~175 °C. KHÔNG chống ngược cực.'));
    for (const x of [-9, 9]) { const t = screwTerminal(ctx, 2, 3.5, 0x2a62c9); t.position.set(x, 0, 1.75); t.rotation.y = Math.PI / 2; drv.add(t); }
    const dh = geom.pinHeader(3); dh.position.set(-2.54, 0, 8.5); drv.add(dh);
    root.add(part(drv, 'Driver động cơ DRV8871', 'Trái: VM (+VBAT) và GND. Phải: OUT1/OUT2 ra động cơ. Chân IN1 = PWM, IN2 = chiều.'));
    label(drv, 'DRV8871', [0, 16, 0]);
    SP.drv = spot(drv, [0, 4, 0]);
    A.drvVM = at(drv, [-10, 9, -1.75]); A.drvGnd = at(drv, [-10, 9, 1.75]); A.drvO1 = at(drv, [10, 9, -1.75]); A.drvO2 = at(drv, [10, 9, 1.75]);
    A.drvIn1 = at(drv, [-2.54, 8.5, 8.5]); A.drvIn2 = at(drv, [0, 8.5, 8.5]); A.drvInG = at(drv, [2.54, 8.5, 8.5]);
    const capG = new THREE.Group();
    capG.position.set(12, 3, -40);
    const cap = electrolytic(ctx, { r: 5, h: 20 });
    capG.add(cap.group);
    root.add(part(capG, 'Tụ hóa 1000 µF / 25 V', 'Kho năng lượng tại chỗ cho dòng xung của động cơ. Vạch trắng = cực ÂM, phải nối GND.'));
    SP.cap = spot(capG, [0, 24, 0]);
    A.capP = [12, 1.5, -42.5]; A.capN = [12, 1.5, -37.5];

    // ---------------- module bánh xe
    const wm = new THREE.Group();
    wm.position.set(100, 0, -45);
    const motorCan = mesh(cyl(14, 14, 30, 32), MAT.steel, { x: -16, y: 18, rz: Math.PI / 2 });
    wm.add(part(motorCan, 'Động cơ bánh (DC chổi than, R ≈ 7 Ω)', 'Dòng kẹt 14.4/7 ≈ 2 A. Xem bài Động cơ DC.'));
    wm.add(mesh(cyl(14, 14, 4, 32), MAT.plasticWhite, { x: -33, y: 18, rz: Math.PI / 2 }));
    wm.add(part(mesh(box(34, 34, 26, 3), MAT.plasticBlack, { x: 16, y: 20 }), 'Hộp số ~1:60', ''));
    const wheel = new THREE.Group();
    wheel.position.set(42, 35, 0);
    wheel.add(mesh(cyl(35, 35, 18, 48), MAT.rubber, { rz: Math.PI / 2 }));
    wheel.add(mesh(cyl(22, 22, 19, 32), MAT.plasticGrey, { rz: Math.PI / 2 }));
    for (let k = 0; k < 6; k++) wheel.add(mesh(box(19.4, 3, 30), MAT.plasticDark, { rx: (k * Math.PI) / 6 }));
    wm.add(part(wheel, 'Bánh xe Ø70 mm', ''));
    for (const y of [23, 13]) wm.add(mesh(box(1, 4, 3), MAT.brass, { x: -35.5, y }));
    const motCap = ceramicCap(ctx, { span: 5 }); motCap.position.set(-38, 10, 0); motCap.rotation.set(0, Math.PI / 2, Math.PI / 2);
    wm.add(part(motCap, 'Tụ 100 nF chống nhiễu động cơ', 'Hàn ngay 2 cực động cơ — "nuốt" tia lửa cổ góp.'));
    const wood = mesh(box(40, 22, 22, 2), stdMat(0xb08050, { roughness: 0.9 }), { x: 42, y: 11, z: 44 });
    wm.add(part(wood, 'Khúc gỗ chèn bánh (kẹt)', 'Bánh không quay được → động cơ kẹt.'));
    root.add(wm);
    SP.mot = spot(wm, [-16, 34, 0]); SP.wheel = spot(wm, [42, 72, 0]);
    A.motA = at(wm, [-36, 23, 0]); A.motB = at(wm, [-36, 13, 0]);

    // ---------------- bo MOSFET chổi + động cơ chổi cuộn
    const mb = new THREE.Group();
    mb.position.set(-60, 6, -40);
    mb.add(perfboard(ctx, 36, 26).group);
    const mos = new THREE.Group();
    mos.position.set(2, 0, -2);
    const mosBody = mesh(box(10.2, 9.2, 4.5, 0.3), MAT.icBody, { y: 8.6 });
    mos.add(mosBody, mesh(box(10.2, 6.4, 1.3), MAT.zinc, { y: 16.4, z: -1.6 }));
    for (let i = -1; i <= 1; i++) mos.add(mesh(box(0.8, 4.2, 0.5), MAT.tin, { x: i * 2.54, y: 2 }));
    mb.add(part(mos, 'MOSFET IRLZ44N (TO-220)', 'Logic-level: mở hẳn ở 5 V. V_DSS 55 V, 25 mΩ. Không tản nhiệt: 62 °C/W.'));
    const diodeG = new THREE.Group();
    diodeG.add(mesh(box(5.5, 2.4, 3.2, 0.3), MAT.icBody, { y: 1.2 }), mesh(box(0.9, 2.45, 3.25), MAT.plasticGrey, { x: 2, y: 1.2 }));
    diodeG.position.set(-6, 0, 7);
    mb.add(part(diodeG, 'Diode flyback SS34 (song song ngược động cơ)', 'Vạch xám = catốt, nối về +VBAT. Cho dòng cuộn dây chạy vòng khi MOSFET tắt → kẹp gai áp ở ~15 V.'));
    const bridge = mesh(new THREE.SphereGeometry(1.6, 12, 8), MAT.tin, { x: -6, y: 0.4, z: -6 });
    bridge.scale.set(1.8, 0.6, 1);
    mb.add(part(bridge, 'Cầu thiếc (chập VBAT–GND)', 'Một giọt thiếc thừa nối 2 pad cạnh nhau — lỗi hàn hay gặp nhất.'));
    for (const z of [-8, -3]) { const t = screwTerminal(ctx, 1); t.position.set(-15, 0, z); mb.add(t); }
    const gh = geom.pinHeader(2); gh.position.set(10, 0, 9); mb.add(gh);
    root.add(part(mb, 'Bo MOSFET chổi', 'IRLZ44N đóng cắt cực âm động cơ chổi; trở cổng 100 Ω, kéo xuống 10 kΩ; diode SS34.'));
    SP.mos = spot(mb, [2, 20, -2]); SP.bridge = spot(mb, [-6, 3, -6]);
    A.mosS = at(mb, [-15, 10, -8]); A.mosD = at(mb, [-15, 10, -3]); A.mosG = at(mb, [10, 8.5, 9]); A.mosGG = at(mb, [12.54, 8.5, 9]);
    const br = new THREE.Group();
    br.position.set(-60, 0, -112);
    br.add(part(mesh(cyl(14, 14, 38, 32), MAT.steel, { x: -30, y: 18, rz: Math.PI / 2 }), 'Động cơ chổi cuộn', 'Không tải ~1 A, khởi động ~7 A, cuộn dây ~2 mH.'));
    br.add(mesh(cyl(14, 14, 4, 32), MAT.plasticWhite, { x: -51, y: 18, rz: Math.PI / 2 }));
    const roller = new THREE.Group();
    roller.position.set(55, 18, 0);
    roller.add(mesh(cyl(6, 6, 110, 20), MAT.plasticBlack, { rz: Math.PI / 2 }));
    for (let k = 0; k < 4; k++) {
      const pv = new THREE.Group(); pv.rotation.x = (k * Math.PI) / 2;
      pv.add(mesh(box(106, 9, 1), k % 2 ? stdMat(0x3a6fd0) : MAT.rubber, { y: 10 }));
      roller.add(pv);
    }
    br.add(part(roller, 'Chổi cuộn (lông + lá cao su)', ''));
    const brCap = ceramicCap(ctx, { span: 5 }); brCap.position.set(-54, 10, 0); brCap.rotation.set(0, Math.PI / 2, Math.PI / 2);
    br.add(part(brCap, 'Tụ 100 nF chống nhiễu động cơ chổi', ''));
    root.add(br);
    SP.brush = spot(br, [-30, 34, 0]);
    A.brushP = at(br, [-53, 23, 0]); A.brushN = at(br, [-53, 13, 0]);

    // ---------------- đồng hồ vạn năng + que đo
    const mm = multimeter(ctx);
    mm.group.position.set(225, 0, -65);
    root.add(part(mm.group, 'Đồng hồ vạn năng', 'Núm: V (đo áp, mắc SONG SONG, 10 MΩ) hoặc A (đo dòng, mắc NỐI TIẾP, ~0.01 Ω). Que đỏ: lỗ VΩ hoặc 10A; que đen: COM.'));
    SP.meter = spot(mm.group, [-20, 34, 50]);
    const J = Object.fromEntries(Object.entries(mm.jack).map(([k, p]) => [k, at(mm.group, p)]));
    const probeR = probe(ctx, C.red), probeB = probe(ctx, 0x222222);
    root.add(part(probeR, 'Que đo đỏ', ''), part(probeB, 'Que đo đen (COM)', ''));
    SP.tips = spot(probeR, [0, 0, 0]);

    // ---------------- PICkit, vít khung, đánh dấu
    const pk = pickit(ctx);
    pk.group.position.set(-40, 0, 135);
    root.add(part(pk.group, 'Bộ nạp PICkit 3', 'Khi nạp: kéo MCLR lên 13 V, mọi chân I/O của PIC thả nổi.'));
    const ribbon = new THREE.Group();
    for (let i = 0; i < 6; i++) ribbon.add(makeWire(ctx, at(pk.group, [56, 11, -6.35 + 2.54 * i]), A['icsp' + i], [0xd23b3b, 0xff8c1a, 0x1e1f22, 0x3fbf5f, 0x3b7dd8, 0x8a9099][i], 0.35, { side: i * 0.3 }));
    root.add(ribbon);
    const chassis = new THREE.Group();
    chassis.position.set(-100, 0, -15);
    const screw = mesh(cyl(3.2, 3.2, 10, 6), MAT.zinc, { y: 5 });
    chassis.add(screw, mesh(cyl(3, 3, 1.5, 16), MAT.zinc, { y: 10.6 }));
    root.add(part(chassis, 'Vít khung (nối GND)', 'Khung kim loại nối GND — dây trần chạm vào là chập.'));
    A.chassis = [-100, 10, -15]; SP.screw = spot(chassis, [0, 12, 0]);
    const marker = new THREE.Group();
    const markMat = new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.85, depthTest: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(14, 1.2, 8, 40), markMat); ring.rotation.x = Math.PI / 2;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(4, 10, 16), markMat); cone.rotation.x = Math.PI; cone.position.y = 26;
    marker.add(ring, cone);
    marker.renderOrder = 10;
    root.add(marker);
    SP.short = spot(root, [-40, 14, 10]);

    // =============================================================== dây & cấu hình
    const wireGroup = new THREE.Group();
    root.add(wireGroup);
    let wires = {}, probeWires = [];
    const kill = (m) => { m.parent?.remove(m); m.geometry.dispose(); m.material.dispose(); };
    function buildWires(list, bad) {
      Object.values(wires).forEach(kill);
      wires = {};
      for (const [id, a, b, color, r, side] of list) {
        if (!A[a] || !A[b]) continue;
        const m = makeWire(ctx, A[a], A[b], color, r, { side });
        part(m, bad.includes(id) ? '⚠️ Dây nối SAI' : 'Dây nối', WIRE_DESC[color] || '');
        m.userData.bad = bad.includes(id);
        wires[id] = m;
        wireGroup.add(m);
      }
    }
    let vis = {}, cur = { id: 'dung', fixed: false }, benchNow = false, fuseA = 10;
    function placeProbes() {
      probeWires.forEach(kill);
      probeWires = [];
      const where = vis.probes || 'buck';
      if (where === 'rest') { aimTool(probeR, [170, 3.5, 25], 0.2, 1, 1.45); aimTool(probeB, [182, 3.5, 32], 0.2, 1, 1.45); }
      else {
        const [p, n] = where === 'src' ? [A.srcP, A.srcN] : [A.buckOutP, A.buckOutN];
        aimTool(probeR, p, 0.4, 1, 0.55); aimTool(probeB, n, 0.7, 1, 0.55);
      }
      const end = (pr) => { root.updateMatrixWorld(true); return pr.localToWorld(new THREE.Vector3(0, 78, 0)).toArray(); };
      const jr = vis.meter === 'A' ? J.a : J.v;
      for (const [j, pr, col] of [[jr, probeR, C.red], [J.com, probeB, C.blk]]) {
        const m = makeWire(ctx, null, null, col, 1.1, { points: [j, [j[0], j[1] + 20, j[2] + 10], [(j[0] + end(pr)[0]) / 2, 40, (j[2] + end(pr)[2]) / 2], end(pr)] });
        probeWires.push(m);
        root.add(m);
      }
      mm.dial.rotation.y = vis.meter === 'A' ? 2.3 : 0;
    }
    function applyConfig() {
      vis = VIS[cur.id] ? VIS[cur.id](cur.fixed) : {};
      benchNow = !!(P.bench || vis.forceBench);
      A.srcP = benchNow ? A.benchP : A.batP;
      A.srcN = benchNow ? A.benchN : A.batN;
      const del = vis.del || [];
      buildWires(BASE.filter((w) => !del.includes(w[0])).concat(vis.add || []), vis.bad || []);
      fuseA = vis.fuse ?? 10;
      fh.visible = fuseA > 0;
      fuse.mat.color.setHex(fuseA >= 30 ? 0x2fa84f : C.red);
      capG.rotation.y = vis.capRev ? -Math.PI / 2 : Math.PI / 2;
      capG.visible = vis.bulkCap !== false;
      chipG.rotation.y = vis.picRev ? Math.PI : 0;
      diodeG.visible = vis.diode !== false;
      motCap.visible = brCap.visible = vis.motorCaps !== false;
      chassis.visible = !!vis.chassis;
      usb.visible = !!vis.usb;
      pk.group.visible = ribbon.visible = !!vis.pickit;
      wood.visible = !!vis.block;
      bridge.visible = !!vis.bridge;
      placeProbes();
      const f = vis.focus;
      marker.visible = !!f;
      if (f) {
        if (f === 'short') SP.short.position.set((A.busP4[0] + A.busN4[0]) / 2, 16, (A.busP4[2] + A.busN4[2]) / 2);
        const v = new THREE.Vector3();
        if (SP[f]) { root.updateMatrixWorld(true); SP[f].getWorldPosition(v); root.worldToLocal(v); } else if (A[f]) v.set(...A[f]);
        marker.position.set(v.x, Math.max(v.y, 2), v.z);
        markMat.color.setHex(cur.fixed ? 0x33dd66 : 0xff3030);
      }
    }

    // =============================================================== trạng thái mô phỏng
    let P = {};
    let S;
    const Pw = {};
    function resetSim() {
      S = {
        on: false, t: 0, vbus: 0, Vsrc: 0, Isrc: 0, Ib: 0, Isp: 0, mode: '—', ipk: 0, fuseDmg: 0, fuseOpen: false,
        v5buck: 0, v5: 0, v5min: 5, v5max: 0, i5: 0, i5fix: 0, iPicX: 0, picT: 0, espT: 0, pic: 'TẮT', esp: 'TẮT', led: false,
        picResets: 0, picPhase: 0, ovT: 0, bondE: 0, ldoOff: false, ldoCycles: 0, ldoShort: false,
        frameAcc: 0, stAcc: 0, lastGood: -1, linkOk: false, errP: 0, errE: 0,
        wW: 0, iWheel: 0, iWheelS: 0, bS: 0, iBrush: 0, iBrushS: 0, brushOnNow: false, vd: 0, vdPk: 0, iPk: 0,
        dead: {}, ev: {}, log: [], T: {}, bulge: 0, jumpZ: 0, stallAcc: 0, stallTrip: false, drvTsd: false, motShort: false,
        gpioDmg: 0, pinDmg: 0, mfDmg: 0, meterFuseOpen: false, meterRead: 0, glitchUntil: -1, switchOff: false,
        wireHidden: [], xtPlugged: true, mosDeadT: 0, fuseT0: -1,
      };
      for (const k in TH) S.T[k] = AMBIENT;
    }
    resetSim();
    const say = (msg) => { S.log.unshift(`[${fmtTime(S.t)}] ${msg}`); if (S.log.length > 6) S.log.pop(); };
    const once = (id, fn) => { if (!S.ev[id]) { S.ev[id] = true; fn(); } };

    // --- nguồn + cầu chì + tụ bus (Euler ẩn) --------------------------------
    function solve(h, o) {
      const Vs = benchNow ? P.vset : BAT_V, Rs = benchNow ? BENCH_R : BAT_R;
      const Cb = o.C ?? CBUS, k = Cb / h, vc = S.vbus;
      const paths = o.paths || [];
      const fuseOn = fuseA > 0;
      const conn = o.connected !== false && !S.fuseOpen;
      const sp = o.srcPath;
      const V0 = sp ? (Vs * sp.r) / (Rs + sp.r) : Vs;
      const R0 = sp ? (Rs * sp.r) / (Rs + sp.r) : Rs;
      const Rf = R0 + R_FEED + (o.extraR || 0);
      const act = paths.map((p) => !!p);
      const node = (src) => {
        let vn = 0;
        for (let it = 0; it < 4; it++) {
          let G = 0, GV = 0;
          paths.forEach((p, i) => { if (p && act[i]) { G += 1 / p.r; GV += p.vk / p.r; } });
          vn = src === 'cv' ? (vc * k + V0 / Rf - o.iLoad + GV) / (k + 1 / Rf + G)
            : (vc * k + (src === 'cc' ? Ib : 0) - o.iLoad + GV) / (k + G);
          let ch = false;
          paths.forEach((p, i) => { if (p) { const on = vn > p.vk; if (on !== act[i]) { act[i] = on; ch = true; } } });
          if (!ch) break;
        }
        return Math.max(0, vn);
      };
      let Ib = 0, vn, mode = benchNow ? 'CV' : 'PIN', Isp = 0, Vt;
      vn = node(conn ? 'cv' : 'off');
      Ib = conn ? (V0 - vn) / Rf : 0;
      Vt = V0 - R0 * Ib;
      Isp = sp ? Vt / sp.r : 0;
      if (benchNow && Ib + Isp > P.ilim) {
        mode = 'CC';
        if (sp) { Isp = P.ilim; Ib = 0; Vt = P.ilim * sp.r; vn = node('off'); }
        else { Ib = P.ilim; vn = node('cc'); Vt = vn + Ib * R_FEED; }
      }
      if (!conn && !sp) Vt = S.fuseOpen || o.connected === false ? Vs : Vt;
      // cầu chì
      if (fuseOn && conn) {
        const x = Ib / fuseA;
        if (x >= 1.35) {
          if (S.fuseT0 < 0) S.fuseT0 = S.t;
          S.fuseDmg += h / fuseBlowTime(x);
          if (S.fuseDmg >= 1) {
            S.fuseOpen = true;
            once('fuse', () => {
              fx.flash(SP.fuse, { size: 22, color: 0xfff0c0 });
              fx.sparks(SP.fuse, { count: 25, speed: 35, size: 0.6 });
              fx.smoke(SP.fuse, { size: 5, duration: 1.5 });
              say(`Cầu chì ${fuseA} A ĐỨT sau ${fmtTime(S.t - S.fuseT0)} (dòng ~${Ib.toFixed(0)} A = ${x.toFixed(1)}× định mức)`);
            });
          }
        } else { S.fuseDmg *= Math.exp(-h / 2); S.fuseT0 = -1; }
      }
      S.vbus = vn; S.Vsrc = Math.max(0, Vt); S.Ib = Ib; S.Isp = Isp; S.Isrc = Ib + Isp; S.mode = mode;
      S.ipk = Math.max(S.ipk, S.Isrc); S.iPk = Math.max(S.iPk, S.Isrc);
      if (!benchNow) Pw.batt += S.Isrc * S.Isrc * Rs;
      return { Ib, Isp, Ip: paths.map((p, i) => (p && act[i] ? Math.max(0, (vn - p.vk) / p.r) : 0)) };
    }

    // --- một bước hệ thống: nguồn → buck → logic → UART → động cơ ----------
    function sys(h, o = {}) {
      const vb = S.vbus;
      const iBuckIn = !o.noLogic && vb > 6 && S.v5buck > 0.05 && o.v5 === undefined ? (S.v5 * S.i5) / (0.87 * vb) : 0;
      const iLoad = Math.max(0, iBuckIn + S.iWheelS + S.iBrushS + (o.iExtra || 0));
      const r = solve(h, { ...o, iLoad: vb < 0.5 ? Math.min(iLoad, 0.05) : iLoad });
      const v = S.vbus;
      const tgt = !o.buckDead && v > 6 ? Math.min(o.buckSet ?? 5.0, v - 1.0) : 0;
      S.v5buck += (tgt - S.v5buck) * (1 - Math.exp(-h / 0.003));
      let v5 = o.noLogic ? 0 : (o.v5 !== undefined ? o.v5 : S.v5buck);
      if (o.rx && o.rx < 1e6 && o.v5 === undefined) v5 = Math.min(v5, Math.max(0, (5.5 - S.i5fix) * o.rx));   // XL4015 giới hạn ~5.5 A
      S.v5 = v5;
      S.iPicX = o.rx && o.rx < 1e6 ? v5 / o.rx : 0;
      if (!o.noLogic && o.v5 === undefined) Pw.buck += S.v5 * S.i5 * 0.15;
      logic(h, o);
      link(h, o);
      motors(h, o);
      return r;
    }

    function logic(h, o) {
      const v = S.v5, vs = v - (o.noise || 0);
      S.v5min = Math.min(S.v5min, vs);
      S.v5max = Math.max(S.v5max, v);
      const wasUp = S.pic === RUN || S.pic.startsWith('KHỞI');
      if (!S.dead.pic && v > 7.5) {
        S.ovT += h;
        if (S.ovT > 50e-6) {
          S.dead.pic = true; S.picPhase = 1;
          once('ov', () => say(`VDD = ${v.toFixed(1)} V > 7.5 V (tối đa tuyệt đối): ô-xít cổng bị đánh thủng sau ~50 µs — PIC CHẾT, thành điện trở ~1.5 Ω`));
        }
      }
      let iPic = 0;
      if (S.dead.pic || S.dead.pic2) { S.pic = 'CHẾT ✗'; S.picT = 0; }
      else if (o.picRev) { S.pic = v > 2 ? 'CẮM NGƯỢC — không chạy' : 'TẮT'; S.picT = 0; }
      else if (o.picProg) { S.pic = 'ĐANG NẠP (MCLR = 13 V, I/O thả nổi)'; S.picT = 0; iPic = 0.005; }
      else if (vs < 2.0) { S.pic = 'TẮT'; S.picT = 0; }
      else if (vs < 4.0) { if (wasUp) S.picResets++; S.pic = 'RESET ↻ (VDD < 4.0 V)'; S.picT = 0; iPic = 0.002; }
      else { S.picT += h; S.pic = S.picT < 0.0725 ? 'KHỞI ĐỘNG (PWRT 72 ms)' : RUN; iPic = 0.007; }
      S.led = S.pic === RUN && S.picT % 1 < 0.5;
      if (S.led) iPic += 0.009;
      // ESP32: LDO 3.3 V từ chân 5V (hoặc USB)
      const ve = o.espUsb ? 5.0 : v;
      let v33 = S.ldoShort ? ve : S.ldoOff ? 0 : Math.max(0, Math.min(3.3, ve - 1.1));
      if (o.espFloat) v33 = 2.5;
      let iEsp = 0;
      if (!S.dead.esp && v33 > 3.9) {
        S.dead.esp = true;
        once('espdie', () => { fx.flash(SP.esp, { size: 18 }); fx.smoke(SP.esp, { size: 9, duration: 5 }); fx.scorch(espLdo); say(`ESP32 nhận ${v33.toFixed(1)} V trên ray 3.3 V (tối đa 3.6 V) → CHẾT, khói từ module`); });
      }
      if (S.dead.esp) { S.esp = 'CHẾT ✗'; S.espT = 0; }
      else if (v33 < 2.9) { S.esp = ve > 1 ? 'RESET ↻ (sụt áp)' : 'TẮT'; S.espT = 0; iEsp = ve > 1 ? 0.03 : 0; }
      else { S.espT += h; S.esp = S.espT < 0.35 ? 'KHỞI ĐỘNG' : RUN; iEsp = S.espT < 0.35 ? 0.25 : o.ldo ? 0.15 : 0.10; }
      if (o.ldo && !S.dead.esp) {
        Pw.ldo += Math.max(0, ve - 3.3) * iEsp;
        if (!S.ldoShort) {
          if (!S.ldoOff && S.T.ldo > 160) { S.ldoOff = true; S.ldoCycles++; once('ldo1', () => say(`LDO 3.3 V của ESP32 > 160 °C (tiêu tán ${(ve - 3.3).toFixed(1)} V × ~0.15 A) → tự ngắt nhiệt → ESP32 reset, nguội rồi lặp lại`)); }
          if (S.ldoOff && S.T.ldo < 140) S.ldoOff = false;
          if (S.ldoCycles >= 3) { S.ldoShort = true; once('ldo2', () => say('Sau nhiều chu kỳ quá nhiệt LDO hỏng kiểu CHẬP: 13.4 V đi thẳng vào ESP32!')); }
        }
      }
      S.i5fix = iPic + (o.espUsb ? 0 : iEsp) + 0.004;
      S.i5 = S.i5fix + S.iPicX;
    }

    function link(h, o) {
      if (S.pic === RUN && S.esp === RUN && S.espT > 0.25) {
        S.frameAcc += h * 10;       // DRIVE 10 lần/s (ESP32 → PIC)
        while (S.frameAcc >= 1) { S.frameAcc -= 1; const bad = Math.random() < (o.errPic || 0); if (!bad) S.lastGood = S.t; S.errP += ((bad ? 1 : 0) - S.errP) * 0.1; }
        S.stAcc += h * 50;          // STATUS 50 lần/s (PIC → ESP32)
        while (S.stAcc >= 1) { S.stAcc -= 1; const bad = Math.random() < (o.errEsp || 0); S.errE += ((bad ? 1 : 0) - S.errE) * 0.03; }
      }
      S.linkOk = S.pic === RUN && S.lastGood >= 0 && S.t - S.lastGood < 0.3;   // phản xạ 300 ms của PIC
    }

    function motors(h, o) {
      const vbW = o.drvPowered === false ? 0 : S.vbus;
      let d = o.wheelForce !== undefined ? o.wheelForce : (S.linkOk && S.espT > 0.6 ? (o.wheelCmd ?? 0.4) : 0);
      if (S.dead.drv || S.drvTsd || S.stallTrip || (o.wheelForce === undefined && S.pic !== RUN)) d = 0;
      const Rm = 7 * (1 + 0.0039 * (S.T.mot - 20)) * (S.motShort ? 0.45 : 1);
      const Veff = vbW * d;
      const wss = o.stall ? 0 : Math.max(0, (KE * Veff - Rm * T_FRIC) / (KE * KE + Rm * B_V));
      S.wW += (wss - S.wW) * (1 - Math.exp(-h / 0.116));
      if (o.stall) S.wW = 0;
      let Im = d > 0 ? Math.max(0, (Veff - KE * S.wW) / Rm) : 0;
      S.drvLim = Im > 2.13;
      if (S.drvLim) Im = 2.13;                     // DRV8871 I_TRIP = 64/30k
      S.iWheel = Im; S.iWheelS = Im * d;
      Pw.mot += Im * Im * Rm;
      Pw.drv += Im * Im * 0.565 * (1 + 0.004 * (S.T.drv - 25)) + (S.drvLim ? 0.8 : 0);
      const vbB = o.brushPowered === false ? 0 : S.vbus;
      let db = o.noBrush ? 0 : (S.linkOk && S.espT > 1.0 ? (o.brushDuty ?? 1) : 0);
      if (o.brushStuck) db = 1;
      S.brushOnNow = db > 0 && vbB > 1;
      S.bS += ((S.brushOnNow ? (vbB * db) / 14.4 : 0) - S.bS) * (1 - Math.exp(-h / 0.25));
      let Ibr = S.brushOnNow ? Math.max(0, (vbB * db - 12.4 * S.bS) / 2.0) : 0;
      if (S.brushOnNow && o.brushLoad) Ibr = Math.max(Ibr, (o.brushLoad * vbB) / 14.4);
      S.iBrush = Ibr; S.iBrushS = Ibr * db;
      Pw.mos += Ibr * Ibr * 0.025 * db;
      S.vd = !S.brushOnNow ? vbB : db >= 1 ? Ibr * 0.025 : vbB + 0.5;
      S.vdPk = Math.max(S.vdPk, S.vd);
    }

    function narrate() {
      if (S.ipk > 5 && S.t > 0.0003 && cur.id !== 'cam-nong-xt60') once('n0', () => say(benchNow ? `Nguồn bàn vào CC lúc nạp tụ bus (giới hạn ${P.ilim} A) — bình thường` : `Bật công tắc: tụ 1000 µF + 470 µF nạp, dòng xung ${S.ipk.toFixed(0)} A trong ~0.2 ms (bình thường)`));
      if (S.v5 > 4.9 && S.v5 < 5.6) once('n1', () => say('Buck XL4015 lên 5.0 V (khởi động mềm ~3 ms)'));
      if (S.pic === RUN) once('n2', () => say('PIC chạy sau PWRT 72 ms — LED RD7 nháy 1 Hz'));
      if (S.esp === RUN) once('n3', () => say('ESP32-S3 khởi động xong (~0.35 s), gửi DRIVE 10 lần/s qua UART'));
      if (S.iWheel > 0.05 && S.linkOk) once('n4', () => say('PIC nhận DRIVE hợp lệ → PWM 20 kHz → DRV8871 → bánh quay'));
      if (S.brushOnNow) once('n5', () => say('PIC bật MOSFET chổi (RD5 = 1) — dòng khởi động chổi ~7 A trong vài chục ms'));
    }

    // PIC bị quá áp: pha 1 đánh thủng (1.5 Ω) → dây bond chảy (pha 2, 25 Ω) → nứt hở mạch (pha 3)
    const picPath = () => (S.picPhase === 1 ? { vk: 0, r: 1.5 } : S.picPhase === 2 ? { vk: 0, r: 10 } : null);
    function picOverAfter(h, I) {
      const p = picPath();
      if (!p) return;
      Pw.pic += I * I * p.r;
      if (S.picPhase === 1) {
        S.bondE += I * I * 0.3 * h;
        if (S.bondE > 0.08) {
          S.picPhase = 2;
          crack.visible = true;
          fx.flash(SP.pic, { size: 26, color: 0xfff2c0 }); fx.sparks(SP.pic, { count: 35, speed: 45, size: 0.6 });
          say(`TÁCH! ${I.toFixed(1)} A làm chảy dây bond vàng Ø25 µm → vỏ epoxy nứt`);
        }
      }
      if (S.T.pic > 200) once('pic-smoke', () => { fx.smoke(SP.pic, { size: 9, duration: 6 }); say('Khói, mùi nhựa epoxy cháy từ PIC'); });
      if (S.T.pic > 380) { S.picPhase = 3; once('pic-open', () => { fx.scorch(chipG); say('Lõi PIC cháy đứt — hở mạch, dòng về 0. Chip là rác.'); }); }
    }

    // =============================================================== từng tình huống (h = bước thời gian THẬT, giây)
    const fixed = () => cur.fixed;
    const SIMS = {
      dung(h) { sys(h); narrate(); },

      'nguoc-buck'(h) {
        const rev = !fixed(), cond = rev && !S.dead.buck;
        const r = sys(h, { noLogic: true, buckDead: rev, paths: [cond ? { vk: 1.4, r: 0.005 } : null] });
        if (!rev) { if (S.v5buck > 4.9) once('nb-ok', () => say('Đúng cực: buck chạy, đồng hồ đọc 5.0 V ở ngõ ra (chưa nối tải)')); return; }
        S.v5buck = 0;
        if (cond) {
          const I = r.Ip[0];
          Pw.buckJ += I * 1.4 + I * I * 0.005;
          if (I > (benchNow ? 0.9 * P.ilim : 60)) once('nb1', () => say(`Ngược cực: ${I.toFixed(I > 10 ? 0 : 2)} A chạy qua diode SS54 + diode thân của XL4015 (≈ 1.4 V)${benchNow ? ' — nguồn bàn giữ dòng ở giới hạn' : ''}`));
          if (S.T.buckJ > 300) {
            S.dead.buck = true;
            once('nb2', () => { fx.flash(SP.buck, { size: 30, color: 0xfff0c0 }); fx.pop(buckIC, { force: 35, size: 8 }); fx.smoke(SP.buck, { size: 10, duration: 5 }); fx.scorch(bk); say('XL4015 NỔ: lõi silicon > 300 °C, vỡ vỏ — module chết'); });
          }
        }
      },

      'nguoc-tu'(h) {
        const rev = !fixed() && !S.dead.cap;
        const Il = Math.min(6, 0.05 + 4 * (S.t / 10) ** 2);
        const r = sys(h, { paths: [rev ? { vk: 0, r: Math.max(0.5, 14.4 / Il) } : null] });
        narrate();
        if (fixed() || S.dead.cap) return;
        const I = r.Ip[0];
        Pw.cap += I * S.vbus;
        S.bulge = clamp((S.T.cap - 65) / 40, 0, 1);
        if (S.T.cap > 50) once('c1', () => say(`Tụ ấm lên — dòng rò ${I.toFixed(2)} A (tụ đúng cực chỉ rò < 0.1 mA)`));
        if (S.bulge > 0.3) once('c2', () => say(`Nắp nhôm PHỒNG (khí H₂ bên trong), dòng rò ${I.toFixed(1)} A, tụ ${S.T.cap.toFixed(0)} °C`));
        if (S.T.cap >= 105) {
          S.dead.cap = true; S.bulge = 1;
          once('c3', () => { fx.pop(cap.group, { force: 70, size: 10 }); fx.smoke(SP.cap, { size: 14, duration: 5, color: 0xd9d6cc }); say('BỤP! Van an toàn xé, hơi điện phân phụt ra (mùi tanh). Tụ hỏng — bỏ đi'); });
        }
      },

      'chap-khong-cc'(h) {
        const act = S.t >= 0.5 && !S.dead.wire;
        const Rw = 0.016 * (1 + 0.0039 * (S.T.wire - 20));
        const r = sys(h, { paths: [act ? { vk: 0, r: Rw + 0.003 } : null] });
        narrate();
        if (!act) return;
        const I = r.Ip[0];
        Pw.wire += I * I * Rw;
        if (I > 1) once('s0', () => { fx.sparks(SP.short, { count: 50, speed: 70, size: 1 }); fx.flash(SP.short, { size: 20 }); });
        if (S.t > 0.502) once('s0b', () => say(`Dây đồng rơi vắt ngang 2 thanh cái: tụ bus xả ~${S.ipk.toFixed(0)} A trong vài chục µs (tia lửa), rồi pin duy trì ${I.toFixed(0)} A!`));
        if (S.T.wire > 160) once('s1', () => { fx.smoke(SP.short, { size: 10, duration: 6 }); say('Vỏ PVC của dây chảy, bốc khói (> 160 °C)'); });
        if (S.T.wire > 400) once('s2', () => { fx.fire(SP.short, { size: 9, duration: 3 }); say('Vỏ dây BỐC CHÁY (~400 °C), lõi đồng đỏ rực'); });
        if (S.T.wire >= 1085) {
          S.dead.wire = true;
          once('s3', () => { fx.sparks(SP.short, { count: 120, speed: 90, size: 1.2 }); fx.flash(SP.short, { size: 40 }); say(`Lõi đồng chảy (1085 °C) và ĐỨT sau ${fmtTime(S.t - 0.5)} — dây tự thành "cầu chì". Pin đã nóng thêm ${(S.T.batt - AMBIENT).toFixed(0)} °C`); });
        }
      },

      'cau-chi-30a'(h) {
        const act = S.t >= 0.5 && !S.dead.screw;
        const Rw = 0.084 * (1 + 0.0039 * (S.T.chafe - 20)), Rc = 0.4;
        const r = sys(h, { paths: [act ? { vk: 0, r: Rw + Rc } : null] });
        narrate();
        if (!act) return;
        const I = r.Ip[0];
        Pw.chafe += I * I * (Rw + Rc * 0.1); Pw.screw += I * I * Rc * 0.9;
        if (S.t > 0.51) once('k0', () => say(`Dây 24AWG cọ rách chạm vít khung: chập "mềm" ${I.toFixed(0)} A — chỉ ${(I / fuseA * 100).toFixed(0)} % định mức cầu chì ${fuseA} A`));
        if (I > 3 && Math.random() < h * 6) fx.sparks(SP.screw, { count: 10, speed: 35, size: 0.6 });
        if (S.T.screw > 500) once('k1', () => say(`Điểm chạm đỏ rực (> 500 °C) — PIC vẫn "${S.pic}", robot chạy bình thường, không ai biết!`));
        if (S.T.screw > 650) once('k2', () => { fx.fire(SP.screw, { size: 8, duration: 6 }); say('Vỏ dây cạnh điểm chạm BẮT LỬA'); });
        if (S.T.chafe > 180) once('k3', () => { fx.smoke(SP.screw, { size: 8, duration: 8 }); say('Cả đoạn dây 24AWG nóng > 180 °C, vỏ chảy, bốc khói'); });
        if (S.T.screw > 1000) { S.dead.screw = true; once('k4', () => { fx.sparks(SP.screw, { count: 60, speed: 60, size: 0.9 }); say('Chỗ chạm cháy đứt hở mạch — nhưng dây và đồ xung quanh đã cháy. Cầu chì 30 A vẫn nguyên!'); }); }
      },

      'pin-vao-vdd'(h) {
        if (fixed()) { sys(h); narrate(); return; }
        const r = sys(h, { paths: [picPath()], espUsb: true, v5: S.vbus });
        picOverAfter(h, r.Ip[0]);
        if (S.esp === RUN) once('pv1', () => say('ESP32 (cấp qua USB) vẫn sống: BSS138 chặn 14 V khỏi chân 3.3 V'));
      },

      'buck-chua-chinh'(h) {
        if (fixed()) { sys(h); narrate(); if (S.v5 > 4.9) once('bc-ok', () => say('Đã chỉnh buck ra 5.0 V bằng đồng hồ TRƯỚC khi nối — mọi thứ chạy')); return; }
        const p = picPath();
        sys(h, { buckSet: 13.6, rx: p ? p.r : Infinity, ldo: true });
        picOverAfter(h, S.iPicX);
        if (S.v5buck > 13) once('bc0', () => say(`Buck chưa chỉnh: ray "5 V" lên ${S.v5buck.toFixed(1)} V!`));
      },

      'uart-thang'(h) {
        if (fixed()) { sys(h); narrate(); return; }
        sys(h, { errPic: 0.72, errEsp: S.dead.espRx ? 1 : 0.01 });
        if (S.pic === RUN && S.esp === RUN && !S.dead.espRx) {
          S.gpioDmg += h / (10 * 3600);
          once('u1', () => say('PIC TX 5 V → GPIO18 (chịu 3.6 V): ~27 mA chui qua diode ESD vào ray 3.3 V của ESP32'));
          if (S.t > 1.5) once('u2', () => say('ESP32 TX 3.3 V < 4.0 V (ngưỡng Schmitt RC7) → PIC nhận sai ~70 % khung → bánh giật, dừng mỗi 300 ms'));
          if (S.gpioDmg >= 1) { S.dead.espRx = true; once('u3', () => say('Sau ~10 giờ: GPIO18 hỏng hẳn — ESP32 mất STATUS, app báo mất kết nối PIC')); }
        }
      },

      'quen-gnd'(h) {
        if (fixed()) { sys(h); narrate(); return; }
        const n = clamp(0.35 + 0.25 * (S.iWheel + S.iBrush), 0, 0.92);
        sys(h, { espUsb: true, errPic: n, errEsp: n });
        if (S.esp === RUN && S.pic === RUN) once('g1', () => say('Hai GND trôi nổi: ESP32 đọc ký tự rác, checksum sai; PIC thỉnh thoảng mới có DRIVE đúng'));
        if (S.iWheel > 0.05) once('g2', () => say('Bánh chạy được 0.3 s rồi dừng (PIC mất liên lạc) — giật cục; động cơ chạy càng làm GND nhiễu thêm'));
      },

      'thieu-flyback'(h) {
        const stuck = !!S.dead.mos;
        sys(h, { brushDuty: 0.7, brushLoad: 2.0, brushStuck: stuck });
        narrate();
        const Ib = S.iBrush;
        if (stuck) {
          Pw.mos += Ib * Ib * 0.4;
          S.vd = 0.3;
          if (S.t - S.mosDeadT > 3) once('f4', () => say('PIC ra lệnh TẮT chổi (RD5 = 0) — chổi VẪN quay: MOSFET chập không tắt được. Phải ngắt nguồn!'));
          return;
        }
        if (!S.brushOnNow || Ib < 0.1) return;
        if (fixed()) { S.vdPk = Math.max(S.vdPk, S.vbus + 0.5); Pw.mos += 0.05; return; }
        const Eav = 0.5 * 2e-3 * Ib * Ib * (65 / Math.max(5, 65 - S.vbus));
        Pw.mos += Eav * 1000;
        S.vdPk = Math.max(S.vdPk, 62 + Math.random() * 28);
        if (S.t > 1.6) once('f1', () => say(`Mỗi lần MOSFET tắt: gai 60–90 V ở cực D (nguồn chỉ 14.4 V); ${(Eav * 1e3).toFixed(1)} mJ × 1000 lần/s ≈ ${(Eav * 1000).toFixed(1)} W dồn vào MOSFET`));
        if (S.T.mos > 100) once('f2', () => say('MOSFET > 100 °C (không tản nhiệt) — chạm vào sẽ bỏng'));
        if (S.T.mos >= 175) {
          S.dead.mos = true; S.mosDeadT = S.t;
          once('f3', () => { fx.flash(SP.mos, { size: 14 }); fx.smoke(SP.mos, { size: 7, duration: 4 }); fx.scorch(mosBody); say('Tách! MOSFET vượt 175 °C → hỏng CHẬP D–S. Chổi quay hết tốc độ'); });
        }
      },

      'thieu-tu-nhieu'(h) {
        let noise;
        if (!fixed()) {
          const di = Math.max(0, S.iBrush - 1.1) * 0.5 + Math.max(0, S.iWheel - 0.3) * 0.6 + (S.brushOnNow ? 0.5 : 0) + (S.iWheel > 0.05 ? 0.25 : 0);
          noise = Math.random() < 0.35 ? di * Math.random() * 1.6 : 0;
        } else noise = (S.brushOnNow ? 0.06 : 0.01) * Math.random();
        sys(h, { C: fixed() ? CBUS : 0.47e-3, noise });
        narrate();
        if (S.picResets >= 1) once('t1', () => say(`Động cơ khởi động → gai nhiễu kéo VDD của PIC xuống ${S.v5min.toFixed(2)} V < 4.0 V → PIC RESET`));
        if (S.picResets >= 4) once('t2', () => say(`Vòng lặp: PIC chạy lại → bật động cơ → nhiễu → reset… (${S.picResets} lần) — robot "co giật"`));
      },

      'drv-nguoc'(h) {
        if (fixed()) { sys(h); narrate(); return; }
        const Rdg = 0.07 * (1 + 0.0039 * (S.T.dg - 20)) + 0.02;
        const r = sys(h, { paths: [S.dead.drv ? null : { vk: 1.4, r: 0.006 }, S.dead.dg ? null : { vk: 0, r: Rdg }], drvPowered: false });
        const [Ia, Ig] = r.Ip;
        Pw.drvJ += Ia * 1.4; Pw.dg += Ig * Ig * (Rdg - 0.02);
        if (Ia + Ig > (benchNow ? 0.05 : 40)) once('d0', () => say(`Ngược cực: ${Ia.toFixed(Ia > 10 ? 0 : 2)} A qua diode thân cầu H + ${Ig.toFixed(Ig > 10 ? 0 : 2)} A qua dây GND tín hiệu (dupont)!`));
        if (S.T.drvJ > 300 && !S.dead.drv) {
          S.dead.drv = true;
          once('d1', () => { fx.flash(SP.drv, { size: 24 }); fx.pop(drvIC, { force: 30, size: 5 }); fx.smoke(SP.drv, { size: 8, duration: 5 }); fx.scorch(drv); say('BỐP! DRV8871 vỡ vỏ (> 300 °C trong vài ms)'); });
        }
        if (S.T.dg > 250) once('d2', () => say('Dây GND dupont nóng chảy vỏ'));
        if (S.T.dg >= 1085) { S.dead.dg = true; once('d3', () => say('Dây GND dupont đứt chảy')); }
      },

      'ket-dong-co'(h) {
        sys(h, { stall: true, wheelCmd: 1.0 });
        narrate();
        if (S.iWheel > 0.3) once('j0', () => say(`Bánh kẹt cứng, ESP32 vẫn ra lệnh 100 %: dòng ${S.iWheel.toFixed(2)} A, cuộn dây nhận ${(S.iWheel ** 2 * 7).toFixed(0)} W`));
        if (fixed()) {
          if (S.iWheel > 0.3 && !S.stallTrip) { S.stallAcc += h; if (S.stallAcc > 0.5) { S.stallTrip = true; say('Firmware: PWM 100 % mà encoder 0 xung trong 0.5 s → KẸT! Cắt động cơ, báo lỗi về ESP32'); } }
          return;
        }
        if (!S.drvTsd && S.T.drv > 175) { S.drvTsd = true; S.tsdN = (S.tsdN || 0) + 1; if (S.tsdN === 1) say(`DRV8871 ${S.T.drv.toFixed(0)} °C → NGẮT NHIỆT (thermal shutdown), chân nFAULT kéo xuống`); }
        if (S.drvTsd && S.T.drv < 135) { S.drvTsd = false; once('j5', () => say('DRV8871 nguội < 135 °C → tự chạy lại → lại nóng… bánh giật từng cơn')); }
        if (S.T.mot > 130) once('j1', () => say('Mùi khét véc-ni: cuộn dây > 130 °C'));
        if (S.T.mot > 170) once('j2', () => say('Động cơ bốc khói nhẹ (> 170 °C) — men cách điện đang hỏng'));
        if (S.T.mot > 190 && !S.motShort) { S.motShort = true; say('Men cách điện thủng → CHẬP VÒNG DÂY: R còn ~45 %, dòng tăng, DRV8871 chuyển sang giới hạn dòng 2.1 A'); }
      },

      'pic-nguoc-de'(h) {
        if (fixed()) { sys(h); narrate(); return; }
        const latch = S.t > 0.2 && !S.dead.pic2;
        sys(h, { picRev: true, rx: S.dead.pic2 ? Infinity : latch ? 2.0 : 33 });
        Pw.pic += S.v5 * S.iPicX * 0.85;
        if (S.v5 > 2) once('p1', () => say('Chip ngược: 5 V vào chân RD7/RE1, GND vào RD6/RE2 → dòng qua diode ESD ~0.15 A'));
        if (latch) once('p2', () => say(`LATCH-UP! Thyristor ký sinh đóng: dòng 5 V vọt ${S.iPicX.toFixed(1)} A, chip nhận ~${(S.v5 * S.iPicX).toFixed(0)} W`));
        if (S.T.pic > 60) once('p3', () => say('Chip > 60 °C — chạm vào bỏng tay'));
        if (S.T.pic > 220) once('p4', () => say('Khói, mùi nhựa epoxy cháy'));
        if (S.T.pic > 300 && !S.dead.pic2) {
          S.dead.pic2 = true;
          once('p5', () => { crack.visible = true; fx.flash(SP.pic, { size: 18 }); fx.scorch(chipG); say('Vỏ nứt, lõi đứt mạch — PIC chết hẳn'); });
        }
      },

      'nap-khi-dong-co'(h) {
        const prog = S.t >= 1.0 && S.t < 4.5, after = S.t >= 4.5;
        let wf = 0;
        if (prog && !fixed()) { if (Math.random() < h * 2.5) S.glitchUntil = S.t + 0.06; wf = S.t < S.glitchUntil ? 0.6 : 0; }
        if (after) wf = 1.0;
        sys(h, { picProg: prog, wheelForce: wf, drvPowered: !fixed(), brushPowered: !fixed(), noBrush: true });
        if (prog) once('a1', () => say('Bấm Program: PICkit kéo MCLR = 13 V, mọi chân I/O của PIC thả nổi (Hi-Z)'));
        if (prog && wf > 0) once('a2', () => say('Dây IN1 thả nổi bắt nhiễu → DRV8871 nhận "1" → bánh giật'));
        if (after) once('a3', () => say('Nạp xong → chương trình test chạy NGAY: motor_output(1000,1000) → bánh 100 %'));
        if (after && !fixed()) {
          S.jumpZ += ((S.wW / 60) * 35) * h;
          if (S.jumpZ > 30) once('a4', () => say('Robot LAO khỏi mép bàn!'));
        }
        if (after && fixed()) once('a5', () => say('Nguồn động lực đã rút: chương trình chạy nhưng bánh đứng yên — an toàn'));
      },

      'do-dong-song-song'(h) {
        const touch = S.t >= 0.3;
        const sp = touch && !fixed() && !S.meterFuseOpen ? { r: 0.08 } : null;
        const r = sys(h, { srcPath: sp });
        narrate();
        S.meterRead = touch ? (fixed() ? S.Vsrc : S.meterFuseOpen ? 0 : r.Isp) : 0;
        if (!sp) { if (touch && fixed()) once('m5', () => say(`Thang V, que đỏ ở VΩ: đồng hồ 10 MΩ chỉ lấy ~1.4 µA, đọc ${S.Vsrc.toFixed(2)} V`)); return; }
        const I = r.Isp;
        Pw.meter += I * I * 0.012;
        once('m0', () => { fx.sparks(SP.tips, { count: 40, speed: 60, size: 0.8 }); fx.flash(SP.tips, { size: 20 }); say(`Que chạm 2 cực nguồn ở thang 10 A: đồng hồ = sợi dây 0.08 Ω → ${I.toFixed(I > 10 ? 0 : 2)} A!`); });
        if (I > 13.5) {
          if (Math.random() < h * 40) fx.sparks(SP.tips, { count: 8, speed: 30, size: 0.5 });
          S.mfDmg += h / fuseBlowTime(I / 10, 1.5);
          if (S.mfDmg >= 1) {
            S.meterFuseOpen = true;
            once('m1', () => { fx.flash(SP.meter, { size: 30 }); fx.smoke(SP.meter, { size: 8, duration: 3 }); say(`BỤP trong đồng hồ: cầu chì 10 A của đồng hồ đứt sau ${fmtTime(S.t - 0.3)}. Cầu chì robot vẫn nguyên (que chạm trước nó)`); });
          }
        } else once('m2', () => say(`Nguồn bàn giới hạn ${P.ilim} A → đồng hồ chỉ thấy ${I.toFixed(2)} A, không hỏng`));
      },

      'gioi-han-dong'(h) {
        const r = sys(h, { paths: [S.dead.bridge ? null : { vk: 0, r: 0.05 * (1 + 0.0039 * (S.T.bridge - 20)) }] });
        const I = r.Ip[0];
        Pw.bridge += I * I * 0.05;
        if (I > 20 && S.t > 0.0005) once('l0', () => { fx.sparks(SP.bridge, { count: 30, speed: 40, size: 0.6 }); fx.flash(SP.bridge, { size: 18 }); say(`Cấp bằng PIN: cầu thiếc chập → ${I.toFixed(0)} A`); });
        if (benchNow && S.mode === 'CC' && S.t > 0.01) once('l1', () => say(`Nguồn bàn chuyển CC (đèn đỏ): dòng giữ ở ${P.ilim} A, áp chỉ còn ${S.Vsrc.toFixed(2)} V → biết NGAY có chập, cầu thiếc chỉ nhận ${(P.ilim * P.ilim * 0.05).toFixed(3)} W`));
        if (S.T.bridge > 900 && !S.dead.bridge) { S.dead.bridge = true; fx.sparks(SP.bridge, { count: 40, speed: 50, size: 0.7 }); fx.scorch(mb); say('Đường đồng/cầu thiếc bốc hơi — pad bị xém'); }
      },

      'rut-gnd-truoc'(h) {
        const t = S.t;
        if (!fixed()) {
          const unpl = t >= 2.0 && t < 4.0;
          S.wireHidden = unpl ? ['eg', 'lg'] : [];
          const dead = !!S.dead.uartPins;
          sys(h, { espFloat: unpl, errPic: dead ? 1 : 0, errEsp: dead ? 1 : 0 });
          if (t < 2) narrate();
          if (unpl) {
            S.pinDmg += h / 0.8; Pw.bss += 0.07;
            once('r0', () => say('Rút GND của ESP32 khi đang chạy: ~100 mA đi về qua GPIO17/18 → BSS138 → RC6/RC7 của PIC (~50 mA mỗi chân!)'));
            if (S.pinDmg >= 1 && !dead) { S.dead.uartPins = true; say('Diode ESD / tầng ra của RC6/RC7 và GPIO17/18 quá dòng → HỎNG'); }
          }
          if (t >= 4.0) once('r2', () => say(S.dead.uartPins ? 'Cắm lại GND: ESP32 chạy lại nhưng UART CHẾT — PIC mất liên lạc, giữ bánh dừng (phản xạ 300 ms)' : 'Cắm lại GND: chạy lại'));
        } else {
          const off = t >= 2.0 && t < 3.5;
          S.switchOff = off;
          S.wireHidden = t >= 2.5 && t < 3.0 ? ['eg', 'lg', 'e5'] : [];
          sys(h, { connected: !off });
          if (t < 2) narrate();
          if (t >= 2.0) once('r3', () => say('Đúng: TẮT công tắc trước'));
          if (t >= 2.5) once('r4', () => say('Tháo ESP32 khi không có điện — an toàn'));
          if (t >= 3.0) once('r5', () => say('Lắp lại: nối GND trước tiên'));
          if (t >= 3.5) once('r6', () => say('Bật lại → PIC, ESP32, UART chạy bình thường'));
        }
      },

      'cam-nong-xt60'(h) {
        const plugged = S.t >= 0.3;
        S.xtPlugged = plugged;
        sys(h, { connected: plugged, extraR: fixed() && S.t < 0.45 ? 10 : 0 });
        narrate();
        if (!plugged) return;
        if (!fixed()) {
          once('x0', () => { fx.sparks(SP.xt, { count: 60, speed: 55, size: 0.8 }); fx.flash(SP.xt, { size: 25, color: 0xbfe0ff }); });
          if (S.t > 0.3002) once('x0b', () => say(`Cắm XT60 khi công tắc đang BẬT: tụ rỗng hút ${S.ipk.toFixed(0)} A → hồ quang ở chân cắm`));
          if (S.t > 0.3004) once('x1', () => fx.sparks(SP.xt, { count: 20, speed: 40, size: 0.6 }));
          if (S.t > 0.3009) once('x2', () => { fx.sparks(SP.xt, { count: 15, speed: 35, size: 0.5 }); say('Chân cắm nảy (contact bounce) → thêm 2 tia lửa nhỏ. Chân XT60 bị rỗ đen'); });
        } else once('x3', () => say(`Precharge 10 Ω: dòng xung chỉ ~${S.ipk.toFixed(1)} A, tụ nạp ~0.1 s rồi nối tắt — không tia lửa`));
      },
    };

    // =============================================================== vòng lặp
    function step(h) {
      for (const k in TH) Pw[k] = 0;
      S.t += h;
      (SIMS[cur.id] || SIMS.dung)(h);
      for (const k in TH) S.T[k] = thermal(S.T[k], Pw[k], TH[k][0], TH[k][1], h);
    }
    function rateNow() {
      if (P.speed && P.speed !== 'auto') return +P.speed;
      for (const [tEnd, r] of SC[cur.id].rate || [[Infinity, 1]]) if (S.t < tEnd) return r;
      return 1;
    }
    function restoreVisual() {
      fx.restore(root);
      crack.visible = false;
      chipG.rotation.x = 0;
      fuse.element.scale.x = 1;
      fuse.element.material.color.setHex(0xc9d3dd);
      cap.top.scale.y = 1;
      wm.position.set(100, 0, -45); wm.rotation.set(0, 0, 0);
      xtMale.position.x = 8;
      for (const o of [buckIC, drvIC, cap.group]) o.visible = true;
    }
    function powerOn() {
      restoreVisual();
      resetSim();
      S.on = true;
    }
    function powerOff() {
      restoreVisual();
      resetSim();
    }

    // phát hiện người học đổi tình huống/toggle
    let override = null, lock = false, lastScen = null, lastFixed = null, lastBench = null, key = '';
    function sync(p) {
      P = p;
      if (p.scen !== lastScen) { if (lastScen !== null) override = null; lastScen = p.scen; }
      if (p.fixed !== lastFixed) { if (lastFixed !== null) lock = false; lastFixed = p.fixed; }
      if (p.bench !== lastBench) lastBench = p.bench;
      const id = override || p.scen || 'dung';
      const f = lock ? false : !!p.fixed;
      const k = `${id}|${f}|${!!p.bench}`;
      if (k !== key) { key = k; cur = { id: SC[id] ? id : 'dung', fixed: f }; powerOff(); applyConfig(); }
    }

    let tDisp = 0, smokeAcc = 0, rateShown = 1;
    function visuals(dt, realDt) {
      tDisp += dt;
      // nguồn bàn
      const benchLive = benchNow && S.on;
      if (benchLive) bs.lcd.set([[`${S.Vsrc.toFixed(2)} V`, '#5dff9a', 0.5], [`${S.Isrc.toFixed(3)} A`, S.mode === 'CC' ? '#ff5a4a' : '#5dff9a', 0.5]]);
      else bs.lcd.set([[benchNow ? `${(P.vset ?? 14.4).toFixed(2)} V` : '-- OFF --', '#2d6b45', 0.5], [benchNow ? `${(P.ilim ?? 2).toFixed(3)} A` : '', '#2d6b45', 0.5]]);
      bs.ledCV.material.emissiveIntensity = benchLive && S.mode === 'CV' ? 1.8 : 0;
      bs.ledCC.material.emissiveIntensity = benchLive && S.mode === 'CC' ? 1.5 + Math.sin(tDisp * 12) : 0;
      bs.knobV.rotation.z = 2.4 - ((P.vset ?? 14.4) / 30) * 4.8;
      bs.knobI.rotation.z = 2.4 - ((P.ilim ?? 2) / 5) * 4.8;
      // đồng hồ
      let mtxt;
      if (vis.meter === 'A') mtxt = !S.on || S.t < 0.3 ? '0.000 A' : S.meterFuseOpen ? '0.000 A' : S.meterRead > 10 ? '  OL  A' : `${S.meterRead.toFixed(3)} A`;
      else if ((vis.probes || 'buck') === 'rest') mtxt = '0.00 V';
      else if (vis.probes === 'src') mtxt = `${(S.on && S.t >= 0.3 ? S.Vsrc : 0).toFixed(2)} V`;
      else mtxt = `${(S.on ? S.v5buck : 0).toFixed(2)} V`;
      mm.lcd.set([[mtxt, '#121810', 1]]);
      // công tắc, XT60, PICkit
      const swOn = S.on && !S.switchOff;
      rocker.rotation.z = swOn ? -0.25 : 0.25;
      xtMale.position.x = S.on && !S.xtPlugged ? 22 : 8;
      if (cur.id === 'cam-nong-xt60' && !S.on) xtMale.position.x = 22;
      pk.led.material.emissiveIntensity = S.pic.startsWith('ĐANG NẠP') ? 2 * (Math.sin(tDisp * 20) > 0) : 0;
      // LED
      setLed(picLed, S.led ? 1 : 0);
      if (S.esp === RUN) { espLed.material.emissive.setHex(0x00ff66); espLed.material.emissiveIntensity = 1.5; }
      else if (S.esp.startsWith('RESET')) { espLed.material.emissive.setHex(0xff2020); espLed.material.emissiveIntensity = Math.sin(tDisp * 25) > 0 ? 1.5 : 0; }
      else espLed.material.emissiveIntensity = 0;
      // quay
      wheel.rotation.x -= Math.min(0.5, (S.wW / 60) * realDt);
      roller.rotation.x -= Math.min(0.6, S.bS * 150 * realDt);
      // cầu chì đứt
      if (S.fuseOpen) { fuse.element.scale.x = 0.35; fuse.element.material.color.setHex(0x1a1410); }
      // tụ phồng
      cap.top.scale.y = 1 + S.bulge * 10;
      // robot lao khỏi bàn (về phía −Z)
      if (S.jumpZ > 0) {
        const z = Math.min(S.jumpZ, 160);
        wm.position.z = -45 - z;
        if (z > 125) { wm.position.y = -Math.min(60, (z - 125) * 2); wm.rotation.x = -Math.min(0.9, (z - 125) * 0.03); }
      }
      // dây ẩn (đang tháo) và dây sai nhấp nháy
      for (const [id, m] of Object.entries(wires)) {
        m.visible = !S.wireHidden.includes(id);
        if (m.userData.bad && m.material.emissive) { m.material.emissive.setHex(0xff2010); m.material.emissiveIntensity = 0.35 + 0.35 * Math.sin(tDisp * 6); }
      }
      // vòng đánh dấu
      if (marker.visible) { const s = 1 + 0.12 * Math.sin(tDisp * 4); ring.scale.set(s, s, s); cone.position.y = 26 + 3 * Math.sin(tDisp * 4); }
      // nóng đỏ
      const glow = [[buckIC, Math.max(S.T.buck, S.T.buckJ)], [chipG, S.T.pic], [espLdo, S.T.ldo], [drvIC, Math.max(S.T.drv, S.T.drvJ)],
        [motorCan, S.T.mot], [mosBody, S.T.mos], [cap.body, S.T.cap], [wires.short, S.T.wire], [wires.chafeP, S.T.chafe],
        [screw, S.T.screw], [wires.dg, S.T.dg], [bridge, S.T.bridge]];
      for (const [o, T] of glow) {
        if (!o) continue;
        const lvl = heatLevel(T, 80, o === wires.short || o === screw ? 900 : 450);
        if (lvl > 0 || o.userData._hot) { fx.heat(o, lvl); o.userData._hot = lvl > 0; }
      }
      // khói lặp lại khi còn rất nóng
      smokeAcc += dt;
      if (smokeAcc > 2.2) {
        smokeAcc = 0;
        if (S.T.mot > 170) fx.smoke(SP.mot, { size: 8, duration: 2.5, color: 0x8a8a8a });
        if (S.T.pic > 220) fx.smoke(SP.pic, { size: 7, duration: 2.5 });
        if (S.T.ldo > 150) fx.smoke(SP.ldo, { size: 4, duration: 2 });
        if (S.T.mos > 160) fx.smoke(SP.mos, { size: 5, duration: 2 });
        if (S.T.cap > 90 && !S.dead.cap) fx.smoke(SP.cap, { size: 5, duration: 2, color: 0xcfcfc8 });
      }
    }

    function hottest() {
      let k = 'batt';
      for (const n in S.T) if (S.T[n] > S.T[k]) k = n;
      return `${TNAME[k]} ${S.T[k].toFixed(0)} °C`;
    }

    return {
      object: root,
      update(dt, t, p) {
        sync(p);
        let realDt = 0;
        S.v5min = 99; S.v5max = 0; S.vdPk = 0; S.iPk = 0;
        if (S.on) {
          // chia khung hình thành các đoạn không vượt qua mốc đổi tốc độ (để sự kiện nhanh luôn được làm chậm đúng lúc)
          let left = dt;
          for (let chunk = 0; chunk < 4 && left > 1e-9; chunk++) {
            rateShown = rateNow();
            let real = left * rateShown;
            if (!P.speed || P.speed === 'auto') {
              const nb = (SC[cur.id].rate || []).map(([tEnd]) => tEnd).find((tEnd) => tEnd > S.t + 1e-12);
              if (nb !== undefined && S.t + real > nb) real = nb - S.t + 1e-9;
            }
            const n = clamp(Math.ceil(real / clamp(real / 50, 2e-6, 0.01)), 1, 400);
            for (let i = 0; i < n; i++) step(real / n);
            realDt += real;
            left -= real / rateShown;
          }
        } else {
          for (const k in TH) S.T[k] = thermal(S.T[k], 0, TH[k][0], TH[k][1], dt);
          S.v5min = S.v5max = 0;
        }
        visuals(dt, realDt);
        readout('log', S.log[0] || (S.on ? '…' : `Bấm ⚡ Cấp nguồn — ${cur.fixed ? 'đang xem cách làm ĐÚNG' : SC[cur.id].opt}`));
        readout('time', S.on ? `${fmtTime(S.t)} · ${fmtRate(rateShown)}` : '—');
        const modeTxt = { PIN: 'pin', CV: 'nguồn bàn CV', CC: 'nguồn bàn CC (giới hạn!)' }[S.mode] || '—';
        readout('src', S.on ? `${S.Vsrc.toFixed(2)} V · ${S.Isrc < 10 ? S.Isrc.toFixed(3) : S.Isrc.toFixed(0)} A · ${modeTxt}` : 'tắt');
        readout('ipk', S.ipk);
        readout('v5', S.v5);
        readout('temp', `${S.T.buck.toFixed(0)} · ${S.T.pic.toFixed(0)} · ${S.T.drv.toFixed(0)} · ${S.T.mos.toFixed(0)} · ${S.T.mot.toFixed(0)}`);
        readout('hot', hottest());
        readout('pic', S.pic + (S.picResets ? ` · đã reset ${S.picResets} lần` : ''));
        readout('esp', S.esp);
        readout('uart', S.pic === RUN && S.esp === RUN ? `ESP→PIC ${(S.errP * 100).toFixed(0)} % · PIC→ESP ${(S.errE * 100).toFixed(0)} %${S.linkOk ? '' : ' · MẤT LIÊN LẠC'}` : '—');
        readout('fuse', fuseA ? (S.fuseOpen ? `ĐỨT (${fuseA} A)` : `${fuseA} A còn tốt`) : 'KHÔNG CÓ cầu chì!');
        const v5s = S.on ? (S.v5max > 5.6 ? S.v5max : S.v5min) : 0;
        return [S.vbus, Math.max(0, v5s), S.on ? S.vdPk : 0, S.on ? S.iPk : 0];
      },
      onAction(id, p) {
        sync(p);
        if (id === 'go') powerOn();
        if (id === 'off') powerOff();
      },
      triggerFault(id, p) {
        override = id; lock = true;
        lastScen = p.scen; lastFixed = p.fixed;
        sync(p);
        powerOn();
      },
      resetFault(p) {
        override = null; lock = false;
        sync(p || P);
      },
      dispose() { Object.values(wires).forEach(kill); probeWires.forEach(kill); },
    };
  },
};
