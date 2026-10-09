// 🧑‍🔬 Phòng lab góc nhìn thứ nhất — đi lại trong một phòng thí nghiệm điện tử/cơ khí thật (10 × 7 × 3 m),
// lấy linh kiện từ kệ, đặt lên bàn, bật trạm hàn / nguồn / máy hút khói, chạy thử robot, mở cửa sang
// các môi trường khác. Đồ đặt trên bàn dùng chung sandbox (ctx.sandbox) → kéo-thả được cả ở chế độ orbit
// và tự lưu (storageKey 'robovac.phong-lab.v1').
// Tọa độ: mm, Y lên, gốc giữa sàn phòng. Tường bắc z = −3500 (bàn hàn, bàn đo, trạm sạc), tường tây x = −5000
// (kệ linh kiện), tường nam z = +3500 (bảng trắng, nội quy, cửa ra căn hộ), tường đông x = +5000 (cửa sang bàn mạch).
import * as LH from './_lab_room_helpers.js';
import { FirstPerson } from '../../core/fps.js';

const X0 = -5000, X1 = 5000, Z0 = -3500, Z1 = 3500, RH = 3000, WT = 150;
const ROBOT = { x: 2900, z: 1200 };
const PIT = { x0: 3700, x1: 4100, z0: 600, z1: 1800, depth: 150 };     // bậc thử cảm biến chống rơi (trùng mép "cầu thang" của khu thử robot)
const TAPE = { x0: 1900, x1: 4400, z0: 300, z1: 2150 };
const START = { x: 1450, z: 2750, yaw: 0 };                             // đứng trong cửa ra căn hộ, nhìn về phía bắc
const MAX_ITEMS = 30;
const LEVELS = [1580, 1210, 840, 470, 100];                            // mặt các tầng kệ (từ trên xuống)
const RACK = { z0: -2300, w: 1200, pitch: 1260, d: 450 };
const BIN = { d: 360, h: 170, w: 210, pitch: 222 };
const STORE_KEY = 'robovac.phong-lab.v1';

const BENCHES = [
  { id: 'b1', name: 'Bàn hàn mạch (khu ESD)', x0: -4900, x1: -2800, z0: -3480, z1: -2730, h: 900, pad: 'esdBlue', back: true,
    desc: 'Bàn hàn trong vùng bảo vệ tĩnh điện (EPA): thảm ESD nối đất, vòng tay, trạm hàn có điều nhiệt, máy hút khói, bảng treo dụng cụ.' },
  { id: 'b2', name: 'Bàn đo lường', x0: -2500, x1: -500, z0: -3480, z1: -2730, h: 900, pad: 'esdGrey', back: true,
    desc: 'Nguồn DC có giới hạn dòng, máy hiện sóng, đồng hồ vạn năng, laptop lập trình. Mọi mạch mới đều “cấp điện lần đầu” ở đây.' },
  { id: 'b3', name: 'Bàn lắp ráp cơ khí', x0: -2400, x1: 600, z0: -700, z1: 200, h: 900, pad: 'esdGreen',
    desc: 'Bàn đảo giữa phòng để mổ xác, ráp khung, bánh xe, chổi. Đặt linh kiện lấy từ kệ lên đây để học.' },
  { id: 'b4', name: 'Trạm sạc pin (mặt thép)', x0: 300, x1: 1700, z0: -3480, z1: -2880, h: 850, pad: null,
    desc: 'Mặt thép không cháy, xa vật dễ cháy, cạnh bình chữa cháy và xô cát. Pin chỉ sạc ở đây, trong túi chống cháy.' },
];

const HELP_HTML = `<table>
  <tr><th>W A S D / mũi tên</th><td>đi lại (1.4 m/s — tốc độ đi bộ thật)</td></tr>
  <tr><th>Shift</th><td>chạy nhanh</td></tr>
  <tr><th>C</th><td>ngồi xuống / đứng lên — nhìn gầm bàn, tầng kệ dưới cùng</td></tr>
  <tr><th>Chuột</th><td>nhìn quanh (chuột bị khoá giữa màn hình — <b>Esc</b> để nhả)</td></tr>
  <tr><th>E / bấm chuột</th><td>tương tác với thứ ở tâm ngắm: lấy linh kiện ở thùng, đặt lên mặt bàn, cầm lại, mở cửa, bật/tắt máy, đọc mô tả</td></tr>
  <tr><th>F</th><td>mở trang chi tiết của linh kiện đang nhìn / đang cầm</td></tr>
  <tr><th>Q / R</th><td>xoay vật đang cầm (hoặc vật trên bàn đang nhìn) 15°</td></tr>
  <tr><th>Cuộn chuột</th><td>đưa vật đang cầm ra xa / lại gần mắt để soi</td></tr>
  <tr><th>X / Delete</th><td>cất vật về kệ</td></tr></table>`;

const DEF = {
  id: 'phong-lab',
  name: 'Phòng lab góc nhìn thứ nhất',
  category: 'mo-phong',
  order: 0,
  icon: '🧑‍🔬',
  summary: 'Bước vào một phòng thí nghiệm điện tử thật 10 × 7 m: đi lại bằng WASD, lấy linh kiện từ kệ, đặt lên bàn để soi, bật trạm hàn, nguồn, máy hiện sóng, chạy thử robot — và tập văn hoá an toàn: chống tĩnh điện, khói hàn, sạc pin LiPo, bình chữa cháy.',
  tags: ['phòng lab', 'góc nhìn thứ nhất', 'FPS', 'WASD', 'an toàn', 'ESD', 'tĩnh điện', 'khói hàn', 'LiPo', 'bình chữa cháy', 'trạm hàn', 'kệ linh kiện', '5S'],

  params: [
    { id: 'enter', label: '▶ Vào phòng lab (góc nhìn thứ nhất)', type: 'button' },
    { id: 'mode', label: 'Chế độ', type: 'select', value: 'orbit', options: [['orbit', 'Nhìn tự do (orbit) — toàn phòng, kéo-thả linh kiện'], ['fps', 'Góc nhìn thứ nhất — đi lại trong lab']] },
    { id: 'robot', label: '🤖 Bật / tắt robot chạy thử ở khu thử', type: 'button' },
    { id: 'layout', label: '↺ Dọn bàn về bố cục mặc định', type: 'button' },
    { id: 'sens', label: 'Độ nhạy chuột', type: 'range', min: 0.3, max: 2, step: 0.1, value: 1, unit: '×' },
    { id: 'fov', label: 'Góc nhìn (FOV)', type: 'range', min: 50, max: 90, step: 1, value: 70, unit: '°', hint: 'Mắt người ~ 60–75° cho màn hình máy tính' },
  ],
  readouts: [
    { id: 'mode', label: 'Chế độ', unit: '' },
    { id: 'zone', label: 'Đang đứng ở', unit: '' },
    { id: 'pos', label: 'Tọa độ (x, z)', unit: 'm' },
    { id: 'hand', label: 'Trong tay', unit: '' },
    { id: 'count', label: 'Linh kiện đang bày', unit: 'món' },
    { id: 'safety', label: 'An toàn phòng lab', unit: '' },
  ],

  info: {
    overview: `<p>Đây là một <b>phòng thí nghiệm điện tử – cơ khí</b> giống phòng lab thật ở trường/xưởng: 2 bàn tựa tường (hàn mạch, đo lường), 1 bàn đảo lắp ráp, 1 trạm sạc pin mặt thép, 3 kệ thùng linh kiện xếp theo nhóm, khu thử robot dán băng vàng có bậc thử chống rơi, bảng trắng sơ đồ khối và nội quy.</p>
      <h4>Hai chế độ</h4>
      <ul><li><b>Nhìn tự do (orbit)</b>: xem toàn phòng như nhà búp bê (tường phía camera tự ẩn), kéo linh kiện từ bảng <i>Thư viện</i> thả lên bàn.</li>
      <li><b>Góc nhìn thứ nhất</b>: bấm <b>▶ Vào phòng lab</b>, chuột bị khoá giữa màn hình như chơi game.</li></ul>
      <h4>Phím điều khiển</h4>${HELP_HTML}
      <div class="tip">Thử: vào phòng → rẽ trái tới <b>kệ linh kiện</b> → nhìn thùng “Động cơ DC” → <b>E</b> → đi tới <b>bàn lắp ráp</b> giữa phòng → nhìn mặt bàn → <b>E</b> để đặt → <b>F</b> mở trang chi tiết. Rồi nhìn cửa phía sau lưng (tường nam) → <b>E</b> để sang <i>Căn hộ thử robot</i>.</div>
      <p>Trên điện thoại/máy tính bảng: cần điều khiển ảo bên trái để đi, kéo màn hình để nhìn, chạm để tương tác.</p>`,
    specs: [
      ['Kích thước phòng', '10 × 7 × 3 m — đủ 4–6 sinh viên làm việc'],
      ['Chiều cao bàn', '900 mm (làm đứng/ghế cao), mặt sạc pin 850 mm; sâu 750 mm'],
      ['Thảm ESD', 'điện trở bề mặt 10⁶–10⁹ Ω, nối đất qua 1 MΩ'],
      ['Vòng tay ESD', 'điện trở 1 MΩ trong dây — kiểm tra mỗi ngày bằng máy thử vòng tay'],
      ['Độ ẩm khuyến nghị', '40–60 % RH — không khí khô (máy lạnh) làm tích điện mạnh hơn'],
      ['Ánh sáng bàn làm việc', '750–1000 lux (TCVN/EN 12464: công việc chi tiết nhỏ)'],
      ['Trạm hàn', '60 W, 200–450 °C; thiếc 63/37 chảy ở 183 °C, đặt mũi 330–350 °C'],
      ['Máy hút khói', 'lọc than hoạt tính, đặt cách mối hàn 15–25 cm'],
      ['Nguồn bàn', '0–30 V / 0–5 A, có chế độ giới hạn dòng (CC)'],
      ['Chữa cháy', 'bình bột ABC 4 kg + CO₂, chăn chữa cháy, xô cát khô; số khẩn cấp 114'],
      ['Mắt người (camera)', 'cao 1650 mm, ngồi 1050 mm; đi bộ 1.4 m/s, chạy ~2.7 m/s'],
    ],
    principle: `<h4>Một phòng lab điện tử được tổ chức thế nào?</h4>
      <p><b>1. Chia khu theo luồng công việc</b> — linh kiện đi một chiều: <i>nhận hàng → kiểm tra → kệ lưu trữ → bàn đo/kiểm → bàn hàn → bàn lắp ráp → khu thử</i>. Không ai phải đi ngược, không chen nhau.</p>
      <p><b>2. Vùng bảo vệ tĩnh điện (EPA — ESD Protected Area)</b>: thảm bàn, vòng tay, (sàn, ghế, áo) cùng nối về một điểm đất chung. Linh kiện nhạy (ESP32, MOSFET, IC) chỉ được lấy ra khỏi túi chống tĩnh điện trong EPA. Tiêu chuẩn tham khảo: IEC 61340-5-1 / ANSI ESD S20.20.</p>
      <p><b>3. Kệ thùng theo nhóm, có nhãn</b> (5S: Sàng lọc – Sắp xếp – Sạch sẽ – Săn sóc – Sẵn sàng): mỗi thùng một loại, nhãn có tên + màu nhóm. Lấy xong trả đúng thùng. Bảng treo dụng cụ vẽ bóng từng món → thiếu là thấy ngay.</p>
      <p><b>4. Năng lượng nguy hiểm tách riêng</b>: pin Li-ion/LiPo sạc ở trạm mặt thép, có túi chống cháy, bình chữa cháy và xô cát ngay cạnh; tủ điện có aptomat chống giật 30 mA, mỗi bàn có nút dừng khẩn.</p>
      <p><b>5. Thông gió & ánh sáng</b>: hút khói tại nguồn (máy hút khói ở bàn hàn) tốt hơn quạt thổi; ánh sáng 750–1000 lux trên mặt bàn để thấy mối hàn nhỏ.</p>
      <p><b>6. Thông tin trực quan</b>: bảng trắng ghi sơ đồ khối & tiến độ, nội quy dán ở cửa, biển chỉ lối thoát & thiết bị chữa cháy.</p>
      <h4>Mô phỏng trong trang này</h4>
      <p>Góc nhìn thứ nhất dùng <code>PointerLockControls</code>: chuột dịch Δx, Δy → góc quay yaw, pitch (giới hạn ±86°). Di chuyển trên mặt phẳng XZ: <code>v = (hướng trước·W/S + hướng phải·A/D) × 1400 mm/s</code>, va chạm bằng hình tròn bán kính 230 mm (vai người) với hộp chữ nhật của bàn/kệ — trượt dọc theo cạnh vật cản như game. Tương tác bằng một tia (raycast) bắn từ giữa màn hình, tầm với 2.6 m.</p>`,
    inRobot: `<h4>Từ phòng lab tới robot hút bụi</h4>
      <ol><li><b>Kệ linh kiện</b> — mỗi thùng là một trang học trong lab (cơ khí, động lực, điện tử, nguồn, điều khiển, cảm biến). Lấy ra, soi trong tay, F để học kỹ.</li>
      <li><b>Bàn đo lường</b> — cấp điện lần đầu cho bo PIC16F877A / buck XL4015 bằng nguồn bàn ĐẶT GIỚI HẠN DÒNG 0.2–0.3 A; xem PWM 20 kHz cho DRV8871 trên máy hiện sóng.</li>
      <li><b>Bàn hàn (ESD)</b> — hàn bo điều khiển PIC + header cho ESP32-S3, mạch chuyển mức BSS138. Đeo vòng tay khi cầm ESP32.</li>
      <li><b>Trạm sạc</b> — sạc khối pin 4S 18650 (16.8 V) bằng bộ sạc cân bằng, trong túi chống cháy, có người trông.</li>
      <li><b>Bàn lắp ráp</b> — mổ xác robot cũ, ráp khung, bánh xe, chổi, hộp bụi.</li>
      <li><b>Khu thử robot</b> — sàn 1.6 × 1.2 m có tường, vật cản và <b>bậc thử sâu 15 cm</b> để kiểm tra 4 cảm biến chống rơi trước khi cho robot chạy trong nhà. Nhìn vào robot → E để chạy/dừng.</li>
      <li><b>Cửa ra</b> → <i>Căn hộ thử robot</i> (thuật toán dọn nhà) · <i>Bàn mạch tự do</i> (tự nối mạch).</li></ol>`,
    mistakes: `<h4>Nội quy an toàn — vì sao?</h4>
      <ul><li><b>⚡ Tĩnh điện (ESD)</b>: người đi trên sàn khô tích 2–15 kV mà không cảm thấy (chỉ thấy “tách” khi > 3 kV). Chân ESP32 chịu ~±2 kV (HBM). Chip có thể chết ngay hoặc <i>hỏng ngầm</i> — chạy được vài tuần rồi lỗi lạ. → Đeo vòng tay nối đất, làm trên thảm ESD, cầm bo ở mép, cất trong túi chống tĩnh điện.</li>
      <li><b>💨 Khói hàn</b>: khói trắng là nhựa thông (colophony) trong lõi thiếc bay hơi — gây kích ứng, <i>hen suyễn nghề nghiệp</i>. Chì trong thiếc 63/37 không bay hơi ở 350 °C nhưng dính tay → rửa tay, không ăn ở bàn hàn. → Bật máy hút khói trước khi hàn.</li>
      <li><b>🔋 Sạc pin Li-ion/LiPo</b>: sạc sai số cell, sạc quá 4.2 V/cell, pin phồng/móp → <i>thoát nhiệt</i> (thermal runaway): cell tự nóng > 150 °C, phụt khí cháy độc (có HF), lan sang cell bên cạnh. → Bộ sạc cân bằng đặt đúng 4S, túi chống cháy, mặt thép, có người trông, không sạc qua đêm.</li>
      <li><b>🥽 Mắt</b>: chân linh kiện bị kìm cắt bay với tốc độ cao, thiếc nóng văng khi gõ mỏ hàn, tụ nổ khi cắm ngược. → Kính bảo hộ.</li>
      <li><b>🧯 Bình chữa cháy cho pin lithium</b>: không có “bình hoàn hảo”. Bột ABC/CO₂ dập lửa <i>xung quanh</i> (giấy, nhựa, dây). Cell lithium đang thoát nhiệt tự sinh oxy nên có thể bùng lại → làm mát bằng <b>rất nhiều nước</b> hoặc vùi <b>cát khô</b>, cách ly ≥ 24 h. Bình loại D (kim loại) dành cho lithium <i>kim loại</i>, không phải pin Li-ion. Cháy lớn: thoát ra, gọi <b>114</b>.</li>
      <li><b>🔌 Làm việc khi mạch đang có điện</b>: tua vít trượt chạm 2 cực → ngắn mạch. Với nguồn bàn đã giới hạn dòng chỉ tóe lửa nhẹ; với pin 4S dòng ngắn mạch hàng trăm ampe → chảy đầu tua vít, bỏng, cháy. → Tắt nguồn, rút pin, chờ tụ xả, đo lại bằng đồng hồ rồi mới chạm.</li></ul>`,
    quiz: [
      { q: 'Vì sao vòng tay chống tĩnh điện có điện trở 1 MΩ trong dây thay vì nối thẳng xuống đất?', a: 'Để điện tích trên người xả ra TỪ TỪ (hằng số thời gian RC ~ 100 pF × 1 MΩ = 0.1 ms) thay vì tia lửa tức thời, và để hạn chế dòng qua người nếu tay lỡ chạm vào điện áp nguy hiểm (230 V / 1 MΩ ≈ 0.23 mA — dưới ngưỡng cảm nhận).' },
      { q: 'Pin 4S đang sạc bỗng phồng, bốc khói trắng. Làm gì theo thứ tự?', a: '1) Rút điện bộ sạc (nếu còn an toàn tới gần). 2) Báo mọi người tránh xa, mở cửa thông gió, không hít khói. 3) Nếu đã bốc lửa: bình bột/CO₂ dập lửa xung quanh, rồi làm mát bằng nhiều nước hoặc dùng kẹp thả pin vào xô cát và phủ kín. 4) Cách ly ngoài trời ≥ 24 h vì có thể bùng lại. Cháy lớn: thoát ra, gọi 114.' },
      { q: 'Cấp điện lần đầu cho bo mạch vừa hàn xong, nên đặt nguồn bàn thế nào?', a: 'Đặt đúng điện áp (vd 12 V) và GIỚI HẠN DÒNG thấp (0.1–0.3 A) trước khi nối. Nếu mạch chập hay cắm ngược, nguồn chuyển sang chế độ CC — điện áp sụp, dòng bị chặn, không linh kiện nào cháy. Quan sát dòng: tăng vọt = có lỗi, tắt ngay.' },
      { q: 'Tại sao máy hút khói phải đặt sát mối hàn chứ không chỉ bật quạt trần?', a: 'Khói nhựa thông bốc thẳng lên mặt người hàn (cách 30–40 cm). Hút tại nguồn (15–25 cm) bắt khói trước khi tới mũi; quạt trần chỉ khuấy khói ra khắp phòng.' },
    ],
  },

  faults: [
    { id: 'han-khong-hut-khoi', label: 'Hàn mạch không bật máy hút khói', severity: 'loi',
      what: '<p>Mỗi lần chạm thiếc, một cột khói trắng bốc thẳng lên mặt người hàn. Mùi hăng, cay mắt, ho khan; hàn cả buổi thì tối về khò khè, nghẹt mũi.</p>',
      why: '<p>Lõi thiếc chứa 1–3 % nhựa thông (colophony) làm chất trợ hàn. Ở 350 °C nó bay hơi thành khói có aldehyde, axit nhựa — tác nhân <b>hen suyễn nghề nghiệp</b> đã được ghi nhận (HSE Anh). Khói nóng bốc lên đúng vùng thở vì mặt người cúi sát mối hàn 30–40 cm.</p>',
      fix: '<p>Bật máy hút khói TRƯỚC khi hàn, đặt cách mối hàn 15–25 cm, ngang tầm mũi hàn; thay lọc than hoạt tính định kỳ. Phòng thoáng; không cúi mặt sát mối hàn. <b>Trong cảnh này:</b> nhìn vào máy hút khói và nhấn E để bật.</p>' },
    { id: 'sac-pin-khong-trong-coi', label: 'Sạc pin Li-ion không người trông, ngoài túi chống cháy', severity: 'chay',
      what: '<p>Khối pin 4S đặt trên thùng các-tông, sạc rồi đi ăn trưa. Pin nóng dần, phồng, xì khói trắng có mùi ngọt hắc, rồi phụt lửa như pháo sáng — chuông báo khói kêu, lửa bén sang thùng giấy.</p>',
      why: '<p>Sạc sai cấu hình (vd đặt 5S → 4.2 × 5 = 21 V cho pin 4S, tức 5.25 V/cell) hoặc cell bị lỗi/móp → lớp ngăn cách (separator) tan ở ~130 °C → chập trong → <b>thoát nhiệt</b>: cell tự nóng tới 600 °C+, phụt khí dễ cháy (có HF độc). Khối 38 Wh giải phóng năng lượng trong vài giây, lan sang cell bên cạnh. Không ai trông → không ai rút điện kịp ở giai đoạn phồng/khói (thường có 1–5 phút).</p>',
      fix: '<p><b>Phòng:</b> bộ sạc cân bằng đặt đúng hóa học & số cell, sạc trong túi chống cháy trên mặt thép, có người trông, không sạc qua đêm, loại bỏ pin phồng/móp. <b>Khi xảy ra:</b> rút điện sạc nếu an toàn; báo động, tránh xa khói; dập lửa xung quanh bằng bình bột ABC/CO₂; làm mát bằng nhiều nước hoặc vùi xô cát; cách ly ngoài trời ≥ 24 h; cháy lớn → thoát ra, gọi 114. <b>Trong cảnh:</b> nhìn bình chữa cháy (cạnh trạm sạc) → E; trước khi bốc lửa có thể nhìn bộ sạc → E để rút điện.</p>' },
    { id: 'tinh-dien', label: 'Chạm ESP32 khi không đeo vòng chống tĩnh điện', severity: 'hong',
      what: '<p>Đi dép trên sàn khô, máy lạnh chạy cả ngày, bước tới bàn và cầm bo ESP32 — “tách!”, một tia lửa nhỏ xanh từ đầu ngón tay. Bo vẫn sáng đèn… nhưng nạp code báo lỗi, hoặc chạy được vài ngày rồi Wi-Fi/BLE chập chờn.</p>',
      why: '<p>Cơ thể người ~100–200 pF tích 5–15 kV khi đi lại trên sàn khô (độ ẩm < 30 %). Chạm vào chân GPIO, điện tích xả trong ~100 ns với đỉnh dòng vài ampe qua lớp ô-xít cổng dày vài nanomet. ESP32 chỉ chịu ±2 kV (mô hình HBM). Lớp ô-xít thủng → chết ngay, hoặc <b>hỏng ngầm</b> (dòng rò tăng, sau này mới lỗi). Bạn chỉ CẢM thấy ESD > ~3 kV — nhỏ hơn vẫn phá được chip.</p>',
      fix: '<p>Đeo vòng tay ESD nối vào điểm đất của thảm (dây 1 MΩ), chạm tay vào thảm/khung kim loại nối đất trước khi cầm bo, cầm ở mép bo, để bo trong túi chống tĩnh điện, giữ độ ẩm 40–60 %. <b>Trong cảnh:</b> nhìn vòng tay ESD trên bàn hàn → E để cắm dây nối đất.</p>' },
    { id: 'mo-hang-dang-cam-dien', label: 'Mò sửa mạch khi đang cấp điện', severity: 'hong',
      what: '<p>Mạch buck đang chạy, cầm tua vít siết cọc domino — tay trượt, thân tua vít chạm ngang 2 cực tụ: chớp sáng, tóe lửa, đầu tua vít rỗ, mùi khét. Nguồn bàn nhảy sang “CC 5.00 A”, đèn mạch tắt.</p>',
      why: '<p>Ngắn mạch: R ≈ 0.01–0.05 Ω → I = U/R rất lớn. Nhờ nguồn bàn đặt giới hạn 5 A nên chỉ tóe lửa và tụ xả đột ngột (tụ 1000 µF ở 12 V tích ½CU² = 72 mJ — đủ làm rỗ kim loại). Nếu mạch cấp từ <b>pin 4S</b> (dòng ngắn mạch 100–300 A), tua vít đỏ rực, hồ quang làm bỏng tay, cầu chì/BMS cắt hoặc pin cháy. Xung chập còn có thể giết IC buck và vi điều khiển phía sau.</p>',
      fix: '<p>Tắt nguồn / rút pin trước khi tháo lắp, chờ tụ xả rồi đo lại bằng đồng hồ. Đặt giới hạn dòng thấp khi thử mạch. Dùng dụng cụ cán cách điện, bọc đầu cos, làm một tay khi buộc phải đo trên mạch có điện. Có cầu chì gần pin. <b>Trong cảnh:</b> nhìn nguồn bàn → E để tắt ngõ ra.</p>' },
  ],

  build(ctx) {
    const { THREE, MAT, geom, fx } = ctx;
    const viewer = ctx.viewer || null;
    const { mesh, box, cyl, part, group } = geom;
    const std = (color, metalness = 0, roughness = 0.6, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
    const K = { THREE, MAT, geom, std };
    const hasDoc = LH.hasDoc() && !!viewer;
    const root = new THREE.Group();
    const room = new THREE.Group();          // mọi thứ cố định (tia nhìn chạm được)
    const itemsRoot = new THREE.Group();     // đồ đặt trên bàn (sandbox)
    const heldRoot = new THREE.Group();      // đồ đang cầm (không bị tia nhìn chạm)
    root.add(room, itemsRoot, heldRoot);
    const colliders = [];
    const zoneLabels = [];
    const tmpV = new THREE.Vector3(), tmpN = new THREE.Vector3();

    const M = {
      wall: std(0xe8ebee, 0, 0.92), wallBase: std(0x9aa3ad, 0, 0.8), slab: std(0x50565e, 0, 0.9),
      ceiling: std(0xf3f4f5, 0, 0.95), laminate: std(0xd9d3c4, 0, 0.55), frame: std(0x3b424b, 0.6, 0.45),
      esdBlue: std(0x3f6e9c, 0, 0.88), esdGrey: std(0x5b6874, 0, 0.88), esdGreen: std(0x3c7559, 0, 0.88),
      steelTop: std(0xaeb6be, 0.85, 0.38), rackFrame: std(0x34628f, 0.5, 0.5), rackBoard: std(0xa5afb9, 0.5, 0.5),
      bin: std(0xffffff, 0, 0.55), pit: std(0x3a3f45, 0, 0.9), tape: std(0xf2c200, 0, 0.6), black: std(0x15171a, 0, 0.7),
      light: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    };

    // ---------------------------------------------------------------- danh mục linh kiện
    const catalog = (ctx.catalog || []).filter((d) => d && d.id && typeof d.build === 'function');
    const byId = Object.fromEntries(catalog.map((d) => [d.id, d]));
    const partDefs = catalog.filter((d) => d.category !== 'mo-phong' && d.category !== 'lap-rap');
    const defaultsOf = (def) => {
      const p = {};
      for (const q of def.params || []) if (q.type !== 'button') p[q.id] = q.value ?? (q.type === 'range' ? q.min : q.type === 'select' ? q.options?.[0]?.[0] : false);
      return p;
    };
    const stubSandbox = { items: [], add() { return null; }, remove() { return false; }, clear() {}, serialize: () => [], load() {}, select() {}, selected: null, enabled: false, dispose() {} };
    const subCtx = {
      ...ctx, viewer: null,
      label: (parent, text, pos = [0, 0, 0]) => { const o = new THREE.Object3D(); o.position.set(...pos); o.userData.isLabel = true; parent.add(o); return o; },
      readout: () => {}, sandbox: () => stubSandbox,
    };

    /** Dựng một linh kiện thật của lab, bọc trong wrapper có gốc ở ĐÁY, tâm XZ */
    function spawnWrapper(def) {
      const wrapper = new THREE.Group();
      const offset = new THREE.Group();
      wrapper.add(offset);
      let inst = null;
      try { inst = def.build(subCtx); } catch (e) { console.warn('[phong-lab] build lỗi', def.id, e); }
      if (inst?.object?.isObject3D) {
        offset.add(inst.object);
        wrapper.updateMatrixWorld(true);
        const bb = new THREE.Box3().setFromObject(inst.object);
        if (!bb.isEmpty()) {
          offset.position.set(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
          wrapper.userData.labSize = bb.getSize(new THREE.Vector3());
        }
      } else {
        offset.add(mesh(box(60, 40, 60, 4), MAT.plasticGrey, { y: 20 }));
        inst = null;
      }
      wrapper.userData.labType = def.id;
      wrapper.userData.labInst = inst;
      wrapper.userData.labParams = defaultsOf(def);
      if (!wrapper.userData.labSize) wrapper.userData.labSize = new THREE.Vector3(60, 40, 60);
      return wrapper;
    }
    function runInst(w, dt, t) {
      const inst = w.userData.labInst;
      if (!inst?.update) return;
      try { inst.update(dt, t, w.userData.labParams); } catch (e) { console.warn('[phong-lab] update lỗi', w.userData.labType, e); inst.update = null; }
    }
    function disposeWrapper(w) {
      try { w.userData.labInst?.dispose?.(); } catch { /* bỏ qua */ }
      w.userData.labInst = null;
      w.parent?.remove(w);
      w.traverse((o) => { if (o.isCSS2DObject) o.element?.remove(); o.geometry?.dispose?.(); });
    }

    // ---------------------------------------------------------------- sàn + bậc thử chống rơi
    const ftex = LH.floorTexture(THREE);
    const floorMat = std(ftex ? 0xffffff : 0xc9ced3, 0, 0.75, ftex ? { map: ftex } : {});
    const floorG = new THREE.Group();
    const floorPiece = (x0, x1, z0, z1) => {
      const w = x1 - x0, d = z1 - z0;
      const geo = new THREE.PlaneGeometry(w, d);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 - X0) / 600 + (uv.getX(i) * w) / 600, (Z1 - z1) / 600 + (uv.getY(i) * d) / 600);
      const m = new THREE.Mesh(geo, floorMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
      m.receiveShadow = true;
      m.userData.labSurface = 'Sàn phòng lab';
      floorG.add(m);
    };
    floorPiece(X0, X1, Z0, PIT.z0); floorPiece(X0, X1, PIT.z1, Z1);
    floorPiece(X0, PIT.x0, PIT.z0, PIT.z1); floorPiece(PIT.x1, X1, PIT.z0, PIT.z1);
    room.add(part(floorG, 'Sàn vinyl chống tĩnh điện', 'Gạch vinyl dẫn điện nhẹ (10⁶–10⁸ Ω) nối đất — cùng với giày/ghế tạo vùng EPA. Dễ lau, không bám bụi.'));
    room.add(noShadow(mesh(box(X1 - X0 + 2 * WT, 200, Z1 - Z0 + 2 * WT), M.slab, { y: -260 })));
    // hố/bậc 15 cm
    const pitG = group(
      mesh(box(PIT.x1 - PIT.x0, 10, PIT.z1 - PIT.z0), M.pit, { x: (PIT.x0 + PIT.x1) / 2, y: -PIT.depth - 5, z: (PIT.z0 + PIT.z1) / 2 }),
      mesh(box(10, PIT.depth, PIT.z1 - PIT.z0), M.pit, { x: PIT.x0 - 5, y: -PIT.depth / 2, z: (PIT.z0 + PIT.z1) / 2 }),
      mesh(box(10, PIT.depth, PIT.z1 - PIT.z0), M.pit, { x: PIT.x1 + 5, y: -PIT.depth / 2, z: (PIT.z0 + PIT.z1) / 2 }),
      mesh(box(PIT.x1 - PIT.x0, PIT.depth, 10), M.pit, { x: (PIT.x0 + PIT.x1) / 2, y: -PIT.depth / 2, z: PIT.z0 - 5 }),
      mesh(box(PIT.x1 - PIT.x0, PIT.depth, 10), M.pit, { x: (PIT.x0 + PIT.x1) / 2, y: -PIT.depth / 2, z: PIT.z1 + 5 }));
    const hazTex = LH.canvasTexture(THREE, 128, 32, (g, W, H) => { g.fillStyle = '#f2c200'; g.fillRect(0, 0, W, H); g.fillStyle = '#111'; for (let x = -H; x < W; x += 32) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + 16, H); g.lineTo(x + 16 + H, 0); g.lineTo(x + H, 0); g.fill(); } });
    if (hazTex) { hazTex.wrapS = THREE.RepeatWrapping; hazTex.repeat.set(10, 1); }
    const hazMat = std(hazTex ? 0xffffff : 0xf2c200, 0, 0.6, hazTex ? { map: hazTex } : {});
    pitG.add(mesh(box(PIT.x1 - PIT.x0 + 120, 2, 60), hazMat, { x: (PIT.x0 + PIT.x1) / 2, y: 1, z: PIT.z0 - 30, castShadow: false }),
      mesh(box(PIT.x1 - PIT.x0 + 120, 2, 60), hazMat, { x: (PIT.x0 + PIT.x1) / 2, y: 1, z: PIT.z1 + 30, castShadow: false }),
      mesh(box(60, 2, PIT.z1 - PIT.z0), hazMat, { x: PIT.x0 - 30, y: 1, z: (PIT.z0 + PIT.z1) / 2, castShadow: false, ry: 0 }),
      mesh(box(60, 2, PIT.z1 - PIT.z0), hazMat, { x: PIT.x1 + 30, y: 1, z: (PIT.z0 + PIT.z1) / 2, castShadow: false }));
    room.add(part(pitG, 'Bậc thử chống rơi (sâu 15 cm)', 'Mô phỏng mép cầu thang/ban công: 4 cảm biến hồng ngoại cliff dưới đáy robot phải thấy sàn "biến mất" và lùi lại TRƯỚC khi bánh xoay lọt xuống. <a href="#/c/cliff-ir">Xem cliff IR →</a>'));
    colliders.push({ minX: PIT.x0 - 40, maxX: PIT.x1 + 40, minZ: PIT.z0 - 40, maxZ: PIT.z1 + 40 });
    // băng dán khu thử robot
    const tapeG = group(
      mesh(box(TAPE.x1 - TAPE.x0, 1.5, 50), M.tape, { x: (TAPE.x0 + TAPE.x1) / 2, y: 0.75, z: TAPE.z0, castShadow: false }),
      mesh(box(TAPE.x1 - TAPE.x0, 1.5, 50), M.tape, { x: (TAPE.x0 + TAPE.x1) / 2, y: 0.75, z: TAPE.z1, castShadow: false }),
      mesh(box(50, 1.5, TAPE.z1 - TAPE.z0), M.tape, { x: TAPE.x0, y: 0.75, z: (TAPE.z0 + TAPE.z1) / 2, castShadow: false }),
      mesh(box(50, 1.5, TAPE.z1 - TAPE.z0), M.tape, { x: TAPE.x1, y: 0.75, z: (TAPE.z0 + TAPE.z1) / 2, castShadow: false }));
    room.add(part(tapeG, 'Khu thử robot (băng dán vàng)', 'Vùng 2.5 × 1.85 m: robot chạy thử va chạm-quay với tường thấp, chân ghế, thùng các-tông và bậc 15 cm. Người đứng ngoài vạch vàng khi robot chạy.'));
    const floorSign = LH.canvasPlane(THREE, 1400, 200, LH.signDraw('KHU THỬ ROBOT', 'Đứng ngoài vạch vàng khi robot chạy', { bg: 'rgba(0,0,0,0)', fg: '#d9a400' }), { px: 0.6, transparent: true, fallback: '#c9ced3' });
    floorSign.rotation.x = -Math.PI / 2;
    floorSign.position.set((TAPE.x0 + TAPE.x1) / 2, 2, TAPE.z1 - 150);
    floorSign.material.depthWrite = false;
    room.add(LH.noRay(floorSign));

    // ---------------------------------------------------------------- tường, cửa sổ, cửa ra vào
    const skyTex = LH.canvasTexture(THREE, 512, 256, LH.skyDraw);
    const skyMat = new THREE.MeshBasicMaterial({ color: skyTex ? 0xffffff : 0xcfe8ff, map: skyTex });
    const WALLS = [
      { id: 'N', pos: [0, 0, Z0], rotY: 0, len: X1 - X0 + 2 * WT, out: (c) => c.z < Z0 },
      { id: 'S', pos: [0, 0, Z1], rotY: Math.PI, len: X1 - X0 + 2 * WT, out: (c) => c.z > Z1 },
      { id: 'W', pos: [X0, 0, 0], rotY: Math.PI / 2, len: Z1 - Z0, out: (c) => c.x < X0 },
      { id: 'E', pos: [X1, 0, 0], rotY: -Math.PI / 2, len: Z1 - Z0, out: (c) => c.x > X1 },
    ];
    // u = tọa độ dọc tường (N: x · S: −x · W: −z · E: z)
    const OPEN = {
      N: [{ u0: -1800, u1: -600, y0: 1250, y1: 2500, win: true }, { u0: 2600, u1: 4400, y0: 1250, y1: 2500, win: true }],
      S: [{ u0: -1900, u1: -1000, y0: 0, y1: 2100, door: 'd1' }],
      E: [{ u0: -1900, u1: -1000, y0: 0, y1: 2100, door: 'd2' }, { u0: 700, u1: 2700, y0: 1100, y1: 2400, win: true }],
      W: [],
    };
    const DOORS = {
      d1: { to: 'can-nha', title: '→ Căn hộ thử robot', sub: 'Mô phỏng robot dọn nhà · nhìn vào cửa, nhấn E' },
      d2: { to: 'ban-mach-tu-do', title: '→ Bàn mạch tự do', sub: 'Tự nối mạch trên breadboard · nhìn vào cửa, nhấn E' },
    };
    const walls = {};
    for (const W of WALLS) {
      const g = new THREE.Group();
      g.position.set(...W.pos);
      g.rotation.y = W.rotY;
      const pieces = new THREE.Group();
      for (const p of LH.wallPieces(W.len, RH, OPEN[W.id], -400)) {
        pieces.add(mesh(box(p.u1 - p.u0, p.y1 - p.y0, WT), M.wall, { x: (p.u0 + p.u1) / 2, y: (p.y0 + p.y1) / 2, z: -WT / 2 }));
      }
      g.add(part(pieces, 'Tường phòng lab', 'Sơn sáng màu để phản xạ ánh sáng đều lên bàn làm việc.'));
      for (const o of OPEN[W.id]) {
        if (o.win) {
          const wu = LH.windowUnit(K, o.u1 - o.u0, o.y1 - o.y0, WT, skyMat);
          wu.position.set((o.u0 + o.u1) / 2, o.y0, 0);
          g.add(part(wu, 'Cửa sổ', 'Ánh sáng tự nhiên + mở cửa thông gió khi hàn nhiều hoặc khi có khói pin.'));
        }
        if (o.door) {
          const D = DOORS[o.door];
          const dg = LH.door(K, o.u1 - o.u0, o.y1 - o.y0, WT);
          dg.position.set((o.u0 + o.u1) / 2, 0, 0);
          const sign = LH.canvasPlane(THREE, o.u1 - o.u0 + 300, 280, LH.signDraw(D.title, D.sub, { bg: '#1f8a4c' }), { px: 0.9, fallback: '#1f8a4c' });
          sign.position.set((o.u0 + o.u1) / 2, o.y1 + 200, 8);
          sign.material.toneMapped = false;
          const act = { kind: 'door', to: D.to, title: `🚪 ${D.title.replace('→ ', '')}`, hint: '[E] mở cửa đi sang' };
          dg.userData.labAct = act; sign.userData.labAct = act;
          g.add(part(dg, `Cửa ${D.title}`, D.sub), part(sign, `Biển cửa ${D.title}`, D.sub));
        }
      }
      room.add(g);
      walls[W.id] = { group: g, out: W.out };
    }
    const onWall = (id, obj, u, y, z = 0, ry = 0) => { obj.position.set(u, y, z); obj.rotation.y = ry; walls[id].group.add(obj); return obj; };

    // ---------------------------------------------------------------- trần + đèn
    const ceilG = new THREE.Group();
    ceilG.add(noShadow(mesh(box(X1 - X0 + 2 * WT, 60, Z1 - Z0 + 2 * WT), M.ceiling, { y: RH + 30 })));
    const troffer = new THREE.InstancedMesh(new THREE.BoxGeometry(1200, 24, 300), M.light, 6);
    [[-3300, -1700], [0, -1700], [3300, -1700], [-3300, 1700], [0, 1700], [3300, 1700]].forEach(([x, z], i) => troffer.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, RH - 12, z)));
    ceilG.add(part(troffer, 'Đèn LED panel 1200 × 300', '6 bộ × 40 W ≈ 600–800 lux trên mặt bàn. Ánh sáng trắng trung tính 4000–5000 K giúp phân biệt màu vạch điện trở, màu dây.'));
    const alarmMat = std(0x330000, 0, 0.4, { emissive: 0x000000 });
    const detector = group(mesh(cyl(55, 60, 30, 24), std(0xf4f4f4, 0, 0.5), { y: RH - 15 }), mesh(cyl(6, 6, 4, 12), alarmMat, { y: RH - 32 }));
    detector.position.set(1000, 0, -3100);
    ceilG.add(part(detector, 'Đầu báo khói', 'Phát hiện khói pin/khói cháy, hú còi. Đèn đỏ nháy khi báo động.'));
    ceilG.visible = false;
    room.add(ceilG);
    const fill1 = new THREE.PointLight(0xfff3e6, 0.3, 0, 0);
    fill1.position.set(-2500, RH - 300, 0);
    const fill2 = new THREE.PointLight(0xfff3e6, 0.3, 0, 0);
    fill2.position.set(2500, RH - 300, 0);
    root.add(fill1, fill2);

    // ---------------------------------------------------------------- bàn làm việc
    const surfaces = [];
    const benchInfo = {};
    for (const b of BENCHES) {
      const w = b.x1 - b.x0, d = b.z1 - b.z0;
      const bb = LH.bench(K, { w, d, h: b.h, topMat: b.pad ? M.laminate : M.steelTop, padMat: b.pad ? M[b.pad] : null, legMat: M.frame, name: b.name, desc: b.desc, backPanel: b.back });
      bb.group.position.set((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);
      room.add(bb.group);
      surfaces.push(bb.surface);
      colliders.push({ minX: b.x0, maxX: b.x1, minZ: b.z0, maxZ: b.z1 });
      benchInfo[b.id] = { y: bb.top, cx: (b.x0 + b.x1) / 2, cz: (b.z0 + b.z1) / 2 };
    }
    const at = (obj, x, y, z, ry = 0) => { obj.position.set(x, y, z); obj.rotation.y = ry; room.add(obj); return obj; };
    const yB1 = benchInfo.b1.y, yB2 = benchInfo.b2.y, yB4 = benchInfo.b4.y;

    // --- bàn hàn (b1)
    const sol = LH.solderStation(K);
    at(sol.group, -4450, yB1, -3250);
    const fume = LH.fumeExtractor(K);
    at(fume.group, -4050, yB1, -3330, -0.8);
    const esp = LH.esp32Demo(K);
    at(esp.group, -3600, yB1, -3000);
    const strap = LH.wristStrap(K);
    at(strap.group, -3250, yB1, -3150);
    at(LH.glasses(K).group, -3000, yB1, -3300, 0.3);
    at(LH.powerStrip(K, 1500), -3850, yB1, -3420);
    const toolbox = at(group(mesh(box(450, 220, 250, 10), std(0xc0392b, 0.3, 0.5), { y: 110 }), mesh(box(200, 20, 30), MAT.blackOxide, { y: 230 })), -4300, 0, -3150);
    part(toolbox, 'Hộp dụng cụ dưới gầm bàn', 'Mỏ hàn dự phòng, đầu mũi hàn, súng khò, keo nến, băng keo cách điện. Ngồi xuống (C) để thấy rõ gầm bàn.');
    const peg = LH.pegboard(K, 1900, 800);
    onWall('N', peg.group, -3850, 1100, 6);
    const esdSign = LH.canvasPlane(THREE, 700, 220, LH.signDraw('⚠ EPA — VÙNG CHỐNG TĨNH ĐIỆN', 'Đeo vòng tay nối đất trước khi chạm mạch', { bg: '#f2c200', fg: '#111' }), { px: 0.9, fallback: '#f2c200' });
    onWall('N', part(esdSign, 'Biển vùng EPA', 'Khu bảo vệ tĩnh điện: chỉ mở túi linh kiện nhạy (ESP32, MOSFET) ở đây, đeo vòng tay.'), -3850, 2150, 5);

    // --- bàn đo (b2)
    const psu = LH.benchPSU(K);
    at(psu.group, -2250, yB2, -3250);
    const osc = LH.oscilloscope(K);
    at(osc.group, -1780, yB2, -3260);
    const dut = LH.dutBoard(K);
    at(dut.group, -1330, yB2, -3080, 0.2);
    room.add(LH.noRay(geom.wire([[-2290, yB2 + 30, -3100], [-1900, yB2 + 8, -2980], [-1500, yB2 + 8, -3000], [-1300, yB2 + 18, -3110]], { radius: 2.5, color: 0xd23b3b })));
    room.add(LH.noRay(geom.wire([[-2250, yB2 + 30, -3100], [-1880, yB2 + 6, -2960], [-1480, yB2 + 6, -2990], [-1290, yB2 + 18, -3100]], { radius: 2.5, color: 0x222222 })));
    const dmm = LH.multimeter(K);
    at(dmm.group, -1050, yB2, -2980, 0.3);
    at(LH.laptop(K).group, -760, yB2, -3150, -0.15);
    at(LH.powerStrip(K, 1200), -1500, yB2, -3420);

    // --- bàn lắp ráp (b3) + ghế
    for (const [x, z] of [[-1600, 620], [-300, 620]]) { at(LH.stool(K).group, x, 0, z); colliders.push({ x, z, r: 200 }); }

    // --- trạm sạc pin (b4) + chữa cháy
    const chg = LH.charger(K);
    at(chg.group, 620, yB4, -3250);
    const bag = LH.lipoBag(K);
    at(bag.group, 1030, yB4, -3200);
    const pack = LH.pack4S(K);
    const packHolder = at(new THREE.Group(), 1370, yB4, -3080);
    const carton = mesh(box(260, 160, 200), std(0xb48a5a, 0, 0.9), { y: 80 });
    packHolder.add(part(carton, 'Thùng các-tông (dễ cháy!)', 'Đặt pin đang sạc lên giấy/các-tông là mồi lửa sẵn.'));
    pack.group.position.y = 160;
    packHolder.add(pack.group);
    packHolder.visible = false;
    const packAnchor = new THREE.Object3D();
    packAnchor.position.set(0, 190, 0);
    packHolder.add(packAnchor);
    room.add(LH.noRay(geom.wire([[650, yB4 + 40, -3170], [800, yB4 + 6, -3120], [930, yB4 + 40, -3160]], { radius: 2, color: 0xd23b3b })));
    const binRed = group(mesh(box(220, 160, 160, 6), std(0xc81e1e, 0, 0.5), { y: 80 }));
    const binLbl = LH.canvasPlane(THREE, 200, 70, LH.signDraw('PIN HỎNG', 'không vứt thùng rác', { bg: '#ffffff', fg: '#c81e1e' }), { px: 1, fallback: '#ffffff' });
    binLbl.position.set(0, 90, 80.5);
    binRed.add(binLbl);
    at(part(binRed, 'Hộp thu gom pin hỏng/phồng', 'Pin phồng, móp, rò: dán băng keo 2 cực, bỏ vào hộp kim loại có cát, mang tới điểm thu gom pin — tuyệt đối không vứt thùng rác (gây cháy xe rác).'), 1500, yB4, -3330);
    const ext = LH.extinguisher(K);
    at(ext.group, 1950, 0, -3320);
    colliders.push({ x: 1950, z: -3320, r: 130 });
    const bucket = LH.sandBucket(K);
    at(bucket.group, 2350, 0, -3290);
    colliders.push({ x: 2350, z: -3290, r: 170 });
    const extSign = LH.canvasPlane(THREE, 300, 260, LH.signDraw('🧯', 'BÌNH CHỮA CHÁY', { bg: '#c81e1e' }), { px: 1, fallback: '#c81e1e' });
    onWall('N', part(extSign, 'Biển bình chữa cháy', 'Biển đỏ phát quang chỉ chỗ đặt bình — ai cũng phải biết trước khi bắt đầu làm việc.'), 1950, 1250, 5);
    onWall('N', LH.fireBlanket(K).group, 2290, 1050, 40);
    const chargeSign = LH.canvasPlane(THREE, 800, 200, LH.signDraw('🔋 TRẠM SẠC PIN', 'Trong túi chống cháy · có người trông', { bg: '#d9661e' }), { px: 0.9, fallback: '#d9661e' });
    onWall('N', part(chargeSign, 'Biển trạm sạc pin', 'Pin lithium chỉ được sạc tại trạm này.'), 1000, 1500, 5);

    // ---------------------------------------------------------------- tường nam: bảng trắng, nội quy, sơ cứu
    const wbFrame = mesh(box(2860, 1260, 30), std(0xc9ced3, 0.7, 0.35), { y: 0, z: 15 });
    const wb = LH.canvasPlane(THREE, 2800, 1200, LH.drawWhiteboard, { px: 0.73, fallback: '#fbfcfd' });
    wb.position.z = 31;
    const wbG = group(wbFrame, wb, mesh(box(900, 30, 70), std(0xc9ced3, 0.7, 0.35), { y: -640, z: 40 }));
    wbG.userData.labAct = { kind: 'info', link: 'robot-assembly', title: '📋 Bảng trắng: sơ đồ khối & lộ trình', hint: '[E] tóm tắt · [F] mở trang Robot hoàn chỉnh',
      text: 'Pin 4S → BMS → buck 5 V/3.3 V nuôi PIC16F877A (an toàn, PWM, cảm biến) và ESP32-S3 (BLE, thuật toán, lidar), nói chuyện qua UART 115200 + chuyển mức BSS138. Lộ trình: cơ khí → động cơ → nguồn → vi điều khiển → cảm biến → ráp robot → thử.' };
    onWall('S', part(wbG, 'Bảng trắng: sơ đồ khối robot + lộ trình', 'Sơ đồ khối toàn hệ thống và 7 chặng học. Nhấn F khi nhìn bảng để mở trang robot hoàn chỉnh.'), 2000, 1500, 0);
    const poster = LH.canvasPlane(THREE, 700, 1000, LH.drawPoster, { px: 1, fallback: '#fffaf0' });
    poster.userData.labAct = { kind: 'info', title: '📜 Nội quy phòng lab', hint: '[E] đọc', text: LH.SAFETY_RULES.map(([i, t]) => `${i} ${t}`).join('<br>') };
    onWall('S', part(poster, 'Nội quy phòng lab', LH.SAFETY_RULES.map(([i, t]) => `${i} ${t}`).join('<br>')), -200, 1500, 5);
    onWall('S', LH.firstAid(K).group, -2400, 1250, 62);
    const trash = group(mesh(cyl(170, 150, 450, 20, true), std(0x5b6168, 0.3, 0.6), { y: 225 }), mesh(cyl(150, 150, 5, 20), std(0x5b6168, 0.3, 0.6), { y: 3 }));
    at(part(trash, 'Thùng rác thường', 'Chỉ rác thường: giấy, vỏ dây. Không bỏ pin, linh kiện chứa chì, mũi hàn vào đây.'), 600, 0, 3200);
    colliders.push({ x: 600, z: 3200, r: 190 });

    // ---------------------------------------------------------------- kệ linh kiện (tường tây)
    const byCat = {};
    for (const d of partDefs) (byCat[d.category] ||= []).push(d);
    const cats = [...LH.SHELF_CATS.filter((c) => byCat[c]), ...Object.keys(byCat).filter((c) => !LH.SHELF_CATS.includes(c))];
    const rows = [];
    for (const c of cats) {
      const list = byCat[c].sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name, 'vi'));
      for (let i = 0; i < list.length; i += 5) rows.push({ cat: c, defs: list.slice(i, i + 5) });
    }
    const nRacks = Math.max(1, Math.min(4, Math.ceil(rows.length / LEVELS.length)));
    const rackX = X0 + 20 + RACK.d / 2;
    const binX = X0 + 20 + 30 + BIN.d / 2;
    const binList = [];
    rows.slice(0, nRacks * LEVELS.length).forEach((row, r) => {
      const rk = Math.floor(r / LEVELS.length), lv = r % LEVELS.length;
      const z0 = RACK.z0 + rk * RACK.pitch;
      row.defs.forEach((def, i) => {
        const z = z0 + 50 + BIN.pitch * i + BIN.pitch / 2;
        const y = LEVELS[lv] + BIN.h / 2;
        binList.push({ def, rack: rk, x: binX, y, z, color: LH.catInfo(def.category).color,
          box: new THREE.Box3(new THREE.Vector3(binX - BIN.d / 2, y - BIN.h / 2, z - BIN.w / 2), new THREE.Vector3(binX + BIN.d / 2, y + BIN.h / 2, z + BIN.w / 2)) });
      });
    });
    for (let rk = 0; rk < nRacks; rk++) {
      const zc = RACK.z0 + rk * RACK.pitch + RACK.w / 2;
      const rg = LH.rack(K, { w: RACK.w, d: RACK.d, h: 2000, levels: LEVELS, frameMat: M.rackFrame, boardMat: M.rackBoard });
      rg.position.set(rackX, 0, zc);
      room.add(part(rg, `Kệ linh kiện ${'ABCD'[rk]}`, 'Kệ thép 5 tầng, thùng nhựa xếp theo nhóm màu. Linh kiện dùng nhiều để tầm mắt, nặng để dưới thấp. Lấy xong trả đúng thùng (5S).'));
      const mine = binList.filter((b) => b.rack === rk);
      if (mine.length) {
        room.add(LH.labelAtlas(THREE, mine.map((b) => ({ icon: b.def.icon, title: b.def.name, sub: LH.catInfo(b.def.category).name, color: b.color })),
          mine.map((b) => ({ x: binX + BIN.d / 2 + 1.5, y: b.y + 25, z: b.z, w: BIN.w - 16, h: 74 }))));
      }
      const names = [...new Set(mine.map((b) => b.def.category))].map((c) => `${LH.catInfo(c).icon} ${LH.catInfo(c).name}`).join(' · ');
      const rs = LH.canvasPlane(THREE, 1150, 220, LH.signDraw(`KỆ ${'ABCD'[rk]}`, names || 'Dự phòng', { bg: '#34628f' }), { px: 0.9, fallback: '#34628f' });
      rs.position.set(X0 + 20 + RACK.d + 4, 2140, zc);
      rs.rotation.y = Math.PI / 2;
      room.add(part(rs, `Biển kệ ${'ABCD'[rk]}`, names));
    }
    let bins = null;
    if (binList.length) {
      bins = new THREE.InstancedMesh(new THREE.BoxGeometry(BIN.d, BIN.h, BIN.w), M.bin, binList.length);
      const m4 = new THREE.Matrix4(), col = new THREE.Color();
      binList.forEach((b, i) => { bins.setMatrixAt(i, m4.makeTranslation(b.x, b.y, b.z)); bins.setColorAt(i, col.set(b.color)); });
      bins.instanceMatrix.needsUpdate = true;
      if (bins.instanceColor) bins.instanceColor.needsUpdate = true;
      bins.receiveShadow = true;
      bins.computeBoundingSphere?.();
      room.add(part(bins, 'Thùng linh kiện', 'Mỗi thùng một loại linh kiện, nhãn có tên + màu nhóm. Ở góc nhìn thứ nhất: nhìn vào thùng và nhấn E để lấy ra, F để mở trang học.'));
    }
    const rackEnd = RACK.z0 + (nRacks - 1) * RACK.pitch + RACK.w;
    colliders.push({ minX: X0, maxX: X0 + 20 + RACK.d + 10, minZ: RACK.z0 - 10, maxZ: rackEnd + 10 });

    // ---------------------------------------------------------------- robot ở khu thử
    const robotHolder = new THREE.Group();
    robotHolder.position.set(ROBOT.x, 2, ROBOT.z);
    room.add(robotHolder);
    let robotInst = null, robotParams = {};
    const robotDef = byId['robot-assembly'];
    if (robotDef) {
      try { robotInst = robotDef.build(subCtx); robotParams = defaultsOf(robotDef); robotHolder.add(robotInst.object); } catch (e) { console.warn('[phong-lab] robot lỗi', e); robotInst = null; }
    }
    if (!robotInst) robotHolder.add(part(mesh(cyl(175, 175, 90, 40), MAT.plasticWhite, { y: 45 }), 'Robot hút bụi', 'Ø350 mm.'));
    robotHolder.userData.labAct = { kind: 'robot', link: 'robot-assembly', title: () => `🤖 Robot hút bụi — ${robotParams.run ? 'đang chạy thử' : 'đang dừng'}`, hint: () => `[E] ${robotParams.run ? 'dừng' : 'chạy thử va chạm-quay'} · [F] mở trang robot` };

    // ---------------------------------------------------------------- nhãn khu (chế độ orbit)
    const zl = (t, x, z) => { const o = ctx.label(room, t, [x, 2350, z]); zoneLabels.push(o); };
    zl('🔥 Khu hàn mạch (ESD)', -3850, -3100); zl('📟 Khu đo lường', -1500, -3100); zl('🔋 Trạm sạc pin', 1000, -3150);
    zl('📦 Kệ linh kiện', -4700, 0); zl('🔧 Bàn lắp ráp', -900, -250); zl('🤖 Khu thử robot', 3150, 1250);

    // ---------------------------------------------------------------- thiết bị tương tác
    let solderOn = true, fumeOn = true, psuOn = true, strapOn = true;
    let fault = null, faultT = 0, fired = false, faultFixed = false, nextArc = 0;
    let safety = '✅ An toàn';
    let toast = (msg) => { /* thay bằng fps.toast khi có giao diện */ };
    sol.group.userData.labAct = { kind: 'toggle', title: () => `🔥 Trạm hàn — ${solderOn ? 'BẬT 350 °C' : 'tắt'}`, hint: '[E] bật / tắt',
      run: () => { solderOn = !solderOn; toast(solderOn ? 'Trạm hàn bật — đợi ~20 s mũi lên 350 °C. Nhớ bật máy hút khói!' : 'Đã tắt trạm hàn. Mũi còn nóng vài phút — để yên trong giá.'); } };
    fume.group.userData.labAct = { kind: 'toggle', title: () => `💨 Máy hút khói — ${fumeOn ? 'đang chạy' : 'tắt'}`, hint: '[E] bật / tắt',
      run: () => {
        fumeOn = !fumeOn;
        if (fumeOn && fault === 'han-khong-hut-khoi' && !faultFixed) { fx.clear(); faultFixed = true; safety = '✅ Đã bật hút khói — khói đi vào lọc than'; toast('✅ Đúng rồi! Khói hàn bị hút vào lọc than hoạt tính, không còn bốc lên mặt.'); }
        else toast(fumeOn ? 'Máy hút khói đang chạy.' : 'Đã tắt máy hút khói — đừng hàn khi máy tắt.');
      } };
    psu.group.userData.labAct = { kind: 'toggle', title: () => `🔌 Nguồn bàn — ngõ ra ${psuOn ? 'BẬT' : 'TẮT'}`, hint: '[E] bật / tắt ngõ ra',
      run: () => {
        psuOn = !psuOn;
        if (!psuOn && fault === 'mo-hang-dang-cam-dien' && !faultFixed) { faultFixed = true; dut.screwdriver.visible = false; safety = '✅ Đã cắt nguồn — giờ mới được sửa mạch'; toast('✅ Đã tắt ngõ ra. Chờ tụ xả, đo lại 0 V bằng đồng hồ rồi mới sửa.'); }
        else toast(psuOn ? 'Ngõ ra nguồn bàn: 12.00 V, giới hạn 5.00 A.' : 'Ngõ ra đã tắt — mạch không còn điện.');
      } };
    strap.group.userData.labAct = { kind: 'toggle', title: () => `⚡ Vòng tay ESD — ${strapOn ? 'đã nối đất' : 'CHƯA cắm dây đất'}`, hint: '[E] cắm / rút dây nối đất',
      run: () => {
        strapOn = !strapOn;
        strap.cord.visible = strapOn;
        if (strapOn && fault === 'tinh-dien') { faultFixed = true; safety = '✅ Đã đeo vòng tay nối đất'; toast('✅ Đã nối đất. Điện tích trên người xả từ từ qua 1 MΩ — giờ cầm bo an toàn.'); }
        else toast(strapOn ? 'Vòng tay đã nối đất.' : 'Đã rút dây đất — vòng tay mất tác dụng!');
      } };
    chg.group.userData.labAct = { kind: 'toggle', title: '🔋 Bộ sạc cân bằng 4S', hint: '[E] rút điện bộ sạc',
      run: () => {
        if (fault === 'sac-pin-khong-trong-coi' && !fired && !faultFixed) { faultFixed = true; fx.clear(); safety = '✅ Rút sạc kịp — cách ly pin phồng'; toast('✅ Rút điện kịp lúc! Dùng kẹp đưa pin phồng vào xô cát, mang ra ngoài trời theo dõi 24 h.'); }
        else if (fault === 'sac-pin-khong-trong-coi' && fired) toast('🔥 Pin đã bốc lửa — dùng BÌNH CHỮA CHÁY cạnh trạm sạc!');
        else toast('Bộ sạc: 4S Li-ion, 1.0 A, cắt ở 16.80 V. Pin đang ở trong túi chống cháy.');
      } };
    ext.group.userData.labAct = { kind: 'toggle', title: '🧯 Bình chữa cháy bột ABC', hint: () => (fault === 'sac-pin-khong-trong-coi' && fired && !faultFixed ? '[E] RÚT CHỐT, XỊT VÀO GỐC LỬA!' : '[E] đọc hướng dẫn'),
      run: () => {
        if (fault === 'sac-pin-khong-trong-coi' && fired && !faultFixed) {
          faultFixed = true;
          fx.clear();
          fx.smoke(packAnchor, { size: 260, duration: 3, rate: 40, color: 0xf2f2f2 });
          safety = '⚠️ Đã dập lửa bề mặt — pin có thể bùng lại, làm mát/vùi cát';
          toast('🧯 Đã dập lửa bề mặt. Pin lithium có thể bùng lại: làm mát bằng nhiều nước hoặc vùi xô cát, cách ly ≥ 24 h, thông gió (khói có HF).', 5000);
        } else toast('Rút chốt → cầm vòi hướng vào GỐC lửa → bóp cò → quét qua lại. Đứng đầu gió, cách 2–3 m. Bột ABC/CO₂ dập lửa xung quanh; pin lithium cần làm mát lâu bằng nước/cát.', 5000);
      } };

    // ---------------------------------------------------------------- sandbox: đồ đặt trên bàn
    let pendingWrapper = null;
    const tracked = new Set();
    const sbCatalog = partDefs.map((def) => ({
      id: def.id, name: def.name, icon: def.icon, group: `${LH.catInfo(def.category).icon} ${LH.catInfo(def.category).name}`, desc: (def.summary || '').replace(/"/g, '&quot;'),
      build: () => { const w = pendingWrapper || spawnWrapper(def); pendingWrapper = null; return w; },
    }));
    const onItemsChange = (items) => {
      const live = new Set(items.map((i) => i.object));
      for (const w of [...tracked]) if (!live.has(w)) { tracked.delete(w); if (!w.userData.labHeld) disposeWrapper(w); }
      for (const w of live) tracked.add(w);
    };
    const initial = [
      ['vo-khung', -1700, -250, 0.3], ['dong-co-dc', -900, -380, 0], ['banh-xe', -350, -150, 1.2], ['pic16f877a', -3950, -2960, 0],
    ].filter(([t]) => byId[t] && partDefs.includes(byId[t])).map(([type, x, z, rotY]) => ({ type, x, y: z < -2000 ? yB1 : benchInfo.b3.y, z, rotY }));
    const sb = ctx.sandbox ? ctx.sandbox({
      title: 'Linh kiện (kéo lên bàn)', root: itemsRoot, catalog: sbCatalog, surfaces, floorY: 0, grid: 10,
      bounds: { minX: X0 + 60, maxX: X1 - 60, minZ: Z0 + 60, maxZ: Z1 - 60 }, storageKey: STORE_KEY, initial, onChange: onItemsChange,
    }) : stubSandbox;

    // ---------------------------------------------------------------- góc nhìn thứ nhất
    let held = null;         // { wrapper, def, rot, dist }
    let curParams = null, lastMode = 'orbit';
    const isUp = (hit) => {
      if (!hit?.face) return false;
      tmpN.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      return tmpN.y > 0.6;
    };
    const val = (x) => (typeof x === 'function' ? x() : x);
    const itemOf = (o) => { for (; o && o !== root; o = o.parent) if (o.userData.sandboxUid) return sb.items.find((i) => i.uid === o.userData.sandboxUid) || null; return null; };

    /** Phân loại thứ ở tâm ngắm */
    function classify(hit) {
      if (!hit) return { kind: 'none' };
      if (bins && hit.object === bins && hit.instanceId != null) return { kind: 'bin', bin: binList[hit.instanceId] };
      const it = itemOf(hit.object);
      if (it) return { kind: 'item', item: it, place: !!held && isUp(hit), point: hit.point };
      for (let o = hit.object; o && o !== root; o = o.parent) if (o.userData.labAct) return { kind: 'act', act: o.userData.labAct, obj: o };
      if (hit.object.userData.labSurface && isUp(hit)) return { kind: 'surface', name: hit.object.userData.labSurface, point: hit.point, part: hit.object.userData.part };
      for (let o = hit.object; o && o !== root; o = o.parent) if (o.userData.part) return { kind: 'part', part: o.userData.part, obj: o };
      return { kind: 'none' };
    }

    function describe(hit) {
      const c = classify(hit);
      const hn = held ? `${held.def.icon || ''} ${held.def.name}` : '';
      if (c.kind === 'bin') return { title: `📦 ${c.bin.def.icon || ''} ${c.bin.def.name}`, hint: held ? '[E] đổi: cất món đang cầm, lấy món này · [F] chi tiết' : '[E] lấy ra · [F] mở trang chi tiết', box: c.bin.box };
      if (c.kind === 'item') return { title: `${c.item.def.icon || ''} ${c.item.def.name}`, hint: held ? (c.place ? `[E] đặt ${hn} lên trên` : 'Nhìn mặt trên để đặt chồng') : '[E] cầm lên · [F] chi tiết · [Q/R] xoay · [X] cất về kệ', target: c.item.object };
      if (c.kind === 'act') return { title: val(c.act.title), hint: val(c.act.hint) || '', target: c.act.kind === 'door' ? null : c.obj };
      if (c.kind === 'surface') return { title: c.name, hint: held ? `[E] đặt ${hn} xuống đây` : '' };
      if (c.kind === 'part') return { title: c.part.name, hint: '[E] đọc mô tả' };
      return null;
    }

    function go(id, name) {
      if (!byId[id]) { toast(`Trang “${name || id}” chưa có trong lab.`); return; }
      if (typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock?.();
      if (typeof location !== 'undefined') location.hash = `#/c/${id}`;
    }
    function returnHeld(msg = true) {
      if (!held) return;
      const name = held.def.name;
      disposeWrapper(held.wrapper);
      held = null;
      if (msg) toast(`Đã cất “${name}” về kệ.`);
    }
    function autoDist(w) { const s = w.userData.labSize; return LH.clamp((s ? s.length() / 2 : 60) * 3.2, 140, 1100); }
    function takeFromBin(def) {
      if (held) returnHeld(false);
      const w = spawnWrapper(def);
      heldRoot.add(w);
      held = { wrapper: w, def, rot: 0, dist: autoDist(w), fresh: true };
      toast(`✋ Đã lấy <b>${def.icon || ''} ${def.name}</b> — nhìn mặt bàn và nhấn E để đặt, cuộn chuột để soi gần.`);
    }
    function pickUp(it) {
      const w = it.object;
      const def = byId[it.type];
      if (!def) return;
      w.userData.labHeld = true;
      if (!sb.remove(it.uid)) { w.userData.labHeld = false; return; }
      heldRoot.add(w);
      held = { wrapper: w, def, rot: w.rotation.y - (fps?.yaw || 0), dist: autoDist(w), fresh: true };
      fps?.refreshHover();
    }
    function placeHeld(point) {
      if (!held) return;
      if (sb.items.length >= MAX_ITEMS) { toast(`Bàn đã đầy (${MAX_ITEMS} món) — cất bớt (X) rồi đặt tiếp.`); return; }
      const p = root.worldToLocal(tmpV.copy(point));
      if (p.x < X0 + 60 || p.x > X1 - 60 || p.z < Z0 + 60 || p.z > Z1 - 60) return;
      const w = held.wrapper;
      w.userData.labHeld = false;
      pendingWrapper = w;
      const it = sb.add(held.def.id, { x: p.x, y: p.y, z: p.z, rotY: (fps?.yaw || 0) + held.rot });
      pendingWrapper = null;
      if (!it) { w.userData.labHeld = true; heldRoot.add(w); toast('Không đặt được ở đây.'); return; }
      held = null;
      fps?.refreshHover();
    }

    function onAction(name, hover, arg) {
      const c = classify(hover?.hit);
      if (name === 'interact') {
        if (c.kind === 'act') {
          const a = c.act;
          if (a.kind === 'door') { toast(`🚪 Mở cửa… ${a.title}`); go(a.to, a.title); return; }
          if (a.kind === 'robot') { robotParams.run = !robotParams.run; toast(robotParams.run ? '🤖 Robot chạy thử: tiến → chạm vật/thấy hố → lùi 6 cm → quay ngẫu nhiên 100–170°.' : '🤖 Đã dừng robot.'); return; }
          if (a.run) { a.run(); return; }
          if (a.text) { toast(`<b>${val(a.title)}</b><br>${a.text}`, 6000); return; }
        }
        if (c.kind === 'bin') { takeFromBin(c.bin.def); return; }
        if (c.kind === 'item') { if (!held) pickUp(c.item); else if (c.place) placeHeld(c.point); else toast('Nhìn vào mặt trên của vật để đặt chồng lên.'); return; }
        if (c.kind === 'surface' && held) { placeHeld(c.point); return; }
        if ((c.kind === 'part' || c.kind === 'surface') && (c.part)) { toast(`<b>${c.part.name}</b><br>${c.part.desc || ''}`, 6000); return; }
        if (held) toast('Nhìn vào mặt bàn (hoặc sàn) rồi nhấn E để đặt.');
        return;
      }
      if (name === 'detail') {
        const id = c.kind === 'bin' ? c.bin.def.id : c.kind === 'item' ? c.item.type : c.kind === 'act' && c.act.link ? c.act.link : held ? held.def.id : null;
        if (id) go(id); else toast('Nhìn vào một linh kiện (hoặc cầm trên tay) rồi nhấn F.');
        return;
      }
      if (name === 'remove') {
        if (c.kind === 'item') { const n = c.item.def.name; sb.remove(c.item.uid); toast(`Đã cất “${n}” về kệ.`); fps?.refreshHover(); }
        else if (held) returnHeld();
        else toast('Nhìn vào món đồ trên bàn rồi nhấn X để cất.');
        return;
      }
      if (name === 'rotate') {
        if (held) held.rot -= (arg || 1) * (Math.PI / 12);
        else if (c.kind === 'item') { sb.select(c.item); sb.rotateSelected(-(arg || 1) * 15); sb.select(null); fps?.refreshHover(); }
        return;
      }
      if (name === 'wheel' && held) held.dist = LH.clamp(held.dist * (arg > 0 ? 1.12 : 1 / 1.12), 110, 1600);
    }

    function zoneOf(x, z) {
      if (x < -4400 && z > -2500) return 'Kệ linh kiện (tường tây)';
      if (z < -2100 && x < -2650) return 'Khu hàn mạch (ESD)';
      if (z < -2100 && x < 0) return 'Khu đo lường';
      if (z < -2100 && x < 2800) return 'Trạm sạc pin & chữa cháy';
      if (x > 1700 && z > 0 && z < 2500) return 'Khu thử robot';
      if (x > -2700 && x < 1000 && z > -1300 && z < 1100) return 'Bàn lắp ráp cơ khí';
      if (z > 2500 && x > 600 && x < 2300) return 'Cửa ra → Căn hộ thử robot';
      if (x > 4000 && z < -500 && z > -2400) return 'Cửa sang → Bàn mạch tự do';
      if (z > 2400 && x < 0) return 'Bảng trắng & nội quy';
      return 'Lối đi giữa phòng';
    }

    function syncModeSelect(v) {
      if (typeof document === 'undefined') return;
      const i = DEF.params.findIndex((p) => p.id === 'mode');
      const sel = document.querySelectorAll('#controls .ctl')[i]?.querySelector('select');
      if (sel && sel.value !== v) sel.value = v;
    }

    const fps = hasDoc ? new FirstPerson(viewer, {
      start: START, colliders, bounds: { minX: X0, maxX: X1, minZ: Z0, maxZ: Z1 },
      targets: () => [room, itemsRoot], describe, onAction, title: 'Phòng lab RoboVac',
      onEnter: () => {
        sb.enabled = false;
        ceilG.visible = true;
        for (const k in walls) walls[k].group.visible = true;
        for (const l of zoneLabels) l.visible = false;
        if (curParams) curParams.mode = 'fps';
        lastMode = 'fps';
        syncModeSelect('fps');
        fps.toast('Chào mừng tới phòng lab! 📦 Kệ linh kiện ở tường bên TRÁI phía xa · 🔥 bàn hàn & 📟 bàn đo phía trước · 🤖 khu thử bên phải.', 5000);
      },
      onExit: () => {
        returnHeld(false);
        sb.enabled = true;
        ceilG.visible = false;
        for (const l of zoneLabels) l.visible = viewer.labelsVisible;
        if (curParams) curParams.mode = 'orbit';
        lastMode = 'orbit';
        syncModeSelect('orbit');
      },
    }) : null;
    if (fps) toast = (msg, ms) => fps.toast(msg, ms);

    function enterFPS(lock) {
      if (!fps) return;
      if (fps.active) { fps.lock(); return; }
      fps.start({ lock });
    }

    function focus(anchor, msg) {
      if (fps?.active) { toast(msg, 4500); return; }
      if (!viewer) return;
      const p = anchor.getWorldPosition(new THREE.Vector3());
      viewer.controls.target.copy(p);
      viewer.camera.position.set(p.x + 600, p.y + 900, p.z + 2300);
      viewer.controls.update();
    }

    // ---------------------------------------------------------------- vòng lặp
    let scopeT = 0, scopePhase = 0, readT = 1, blink = 0;
    const cam = viewer?.camera;
    function update(dt, t, params) {
      curParams = params;
      if (params.mode !== lastMode) { lastMode = params.mode; if (params.mode === 'fps') enterFPS(false); else fps?.stop(); }
      if (fps) { fps.setSensitivity(params.sens ?? 1); fps.setFov(params.fov ?? 70); fps.update(dt); }

      // đồ đang cầm bám theo mắt
      if (held && fps?.active && cam) {
        const s = held.wrapper.userData.labSize;
        tmpV.set(held.dist * 0.17, -held.dist * 0.2 - (s ? s.y / 2 : 0), -held.dist).applyQuaternion(cam.quaternion).add(cam.position);
        root.worldToLocal(tmpV);
        if (held.fresh) { held.wrapper.position.copy(tmpV); held.fresh = false; } else held.wrapper.position.lerp(tmpV, Math.min(1, dt * 20));
        held.wrapper.rotation.set(0, fps.yaw + held.rot, 0);
      }
      for (const it of sb.items) runInst(it.object, dt, t);
      if (held) runInst(held.wrapper, dt, t);
      if (robotInst?.update) { try { robotInst.update(dt, t, robotParams); } catch (e) { console.warn('[phong-lab] robot update', e); robotInst.update = null; } }

      // thiết bị
      if (fumeOn) fume.fan.rotation.z += dt * 45;
      sol.tip.material.emissive?.setRGB(solderOn ? 0.55 : 0, solderOn ? 0.12 : 0, 0);
      sol.tip.material.emissiveIntensity = solderOn ? 1.2 : 0;
      sol.lcd.set(solderOn ? [['350°C', '#ff6a3d', 0.7], ['SET 350', '#888', 0.3]] : [['OFF', '#555', 1]]);
      const shorted = fault === 'mo-hang-dang-cam-dien' && !faultFixed;
      psu.lcdV.set(psuOn ? [shorted ? '0.08V' : '12.00V'] : ['--.--']);
      psu.lcdA.set(psuOn ? [[shorted ? 'CC 5.00A' : '0.35A', shorted ? '#ff3b2f' : '#3dff6a', 1]] : ['-.--']);
      psu.led.material.emissive.setHex(psuOn ? (shorted ? 0xff2020 : 0x20ff40) : 0x000000);
      psu.led.material.emissiveIntensity = psuOn ? 1.5 : 0;
      dut.led.visible = psuOn && !shorted;
      dmm.lcd.set([psuOn && !shorted ? '12.01 V' : '0.00 V']);
      const fire = fault === 'sac-pin-khong-trong-coi';
      chg.lcd.set(fire && !faultFixed ? [['LỖI: NHIỆT', '#ff6a5a', 0.55], [fired ? '>150°C !!' : '78°C ↑', '#ffd34d', 0.45]] : [['4S Li-ion 1.0A', '#e8f4ff', 0.5], ['15.92V  82%', '#7fd3ff', 0.5]]);
      scopeT += dt;
      if (scopeT > 0.12) { scopeT = 0; scopePhase += 0.37; osc.screen.userData.redraw((g, W, H) => LH.drawScope(g, W, H, psuOn ? scopePhase : 0, psuOn && !shorted ? 0.45 : 0)); }

      // sự cố theo thời gian
      if (fault) faultT += dt;
      if (fire && !faultFixed && !fired && faultT > 2.2) {
        fired = true;
        fx.fire(packAnchor, { size: 110, duration: 40 });
        fx.smoke(packAnchor, { size: 240, duration: 40, rate: 14, color: 0x2b2b2b });
        fx.sparks(packAnchor, { count: 60, speed: 500, size: 14 });
        fx.scorch(pack.group, 0.85);
        fx.scorch(carton, 0.9);
        safety = '🔥 CHÁY PIN ở trạm sạc!';
        toast('🔥 Pin bốc cháy ở TRẠM SẠC! Lấy bình chữa cháy ngay cạnh (nhìn bình → E).', 5000);
      }
      if (shorted && faultT < 3 && faultT > nextArc) {
        nextArc = faultT + 0.5 + Math.random() * 0.5;
        fx.sparks(dut.anchor, { count: 25, speed: 160, size: 4 });
      }
      blink += dt;
      const alarm = fire && !faultFixed && fired && Math.sin(blink * 12) > 0;
      alarmMat.emissive.setHex(alarm ? 0xff0000 : 0x000000);
      alarmMat.emissiveIntensity = alarm ? 3 : 0;

      // nhà búp bê: ẩn tường phía camera khi nhìn tự do
      if (cam && !fps?.active) {
        root.worldToLocal(tmpV.copy(cam.position));
        for (const k in walls) walls[k].group.visible = !walls[k].out(tmpV);
        for (const l of zoneLabels) if (!viewer.labelsVisible) l.visible = false;
      } else if (fps?.active) for (const l of zoneLabels) l.visible = false;

      // số đo (5 lần/giây)
      readT += dt;
      if (readT > 0.2) {
        readT = 0;
        const on = sb.items.filter((i) => i.object.position.y > 300).length;
        ctx.readout('mode', fps?.active ? (fps.paused ? 'Góc nhìn thứ nhất (tạm dừng)' : 'Góc nhìn thứ nhất') : 'Nhìn tự do (orbit)');
        if (fps?.active) {
          const z = zoneOf(fps.pos.x, fps.pos.z);
          ctx.readout('zone', `${z}${fps.crouch ? ' · đang ngồi' : ''}`);
          ctx.readout('pos', `${(fps.pos.x / 1000).toFixed(1)}, ${(fps.pos.z / 1000).toFixed(1)}`);
          fps.setZone(`📍 ${z}${fps.crouch ? ' (ngồi)' : ''}`);
          fps.setHand(held ? `✋ Đang cầm <b>${held.def.icon || ''} ${held.def.name}</b><br><small>[E] đặt lên mặt bàn đang nhìn · [Q]/[R] xoay · cuộn: xa/gần · [X] cất về kệ · [F] chi tiết</small>` : '');
        } else {
          ctx.readout('zone', 'Tổng quan cả phòng');
          ctx.readout('pos', '—');
        }
        ctx.readout('hand', held ? `${held.def.icon || ''} ${held.def.name}` : 'Tay không');
        ctx.readout('count', `${on} trên bàn · ${sb.items.length - on} dưới sàn`);
        ctx.readout('safety', safety);
      }
    }

    for (const k in walls) noShadow(walls[k].group);     // tường/trần không đổ bóng (ánh nắng chiếu xuyên như phòng mở mái)

    return {
      object: root,
      update,
      onAction(id, params) {
        curParams = params;
        if (id === 'enter') { params.mode = 'fps'; lastMode = 'fps'; syncModeSelect('fps'); enterFPS(true); }
        if (id === 'robot') { robotParams.run = !robotParams.run; toast(robotParams.run ? '🤖 Robot bắt đầu chạy thử.' : '🤖 Robot dừng.'); }
        if (id === 'layout') { returnHeld(false); sb.resetLayout?.(); toast('Đã dọn bàn về bố cục mặc định.'); }
      },
      triggerFault(id) {
        fault = id; faultT = 0; fired = false; faultFixed = false; nextArc = 0;
        if (id === 'han-khong-hut-khoi') {
          solderOn = true; fumeOn = false;
          fx.smoke(sol.tipAnchor, { size: 45, duration: 30, rate: 16, color: 0xdadada });
          safety = '⚠️ Khói nhựa thông bốc thẳng vào mặt — bật máy hút khói!';
          focus(sol.tipAnchor, '⚠️ Khói hàn ở BÀN HÀN (góc trái phía trước) — bật máy hút khói (nhìn máy → E).');
        } else if (id === 'sac-pin-khong-trong-coi') {
          packHolder.visible = true;
          fx.smoke(packAnchor, { size: 90, duration: 2.5, rate: 20, color: 0xd0d0d0 });
          safety = '⚠️ Pin phồng, xì khói ở trạm sạc!';
          focus(packAnchor, '⚠️ Pin ở TRẠM SẠC đang phồng & xì khói — rút điện bộ sạc (nhìn bộ sạc → E)!');
        } else if (id === 'tinh-dien') {
          strapOn = false; strap.cord.visible = false;
          fx.sparks(esp.anchor, { count: 30, speed: 40, size: 2.5, color: 0xbfe0ff });
          fx.flash(esp.anchor, { size: 40, duration: 0.25, color: 0xbfe0ff, intensity: 4 });
          fx.smoke(esp.anchor, { size: 10, duration: 1.5 });
          fx.scorch(esp.chip, 0.6);
          safety = '⚡ ESP32 bị phóng tĩnh điện — có thể hỏng ngầm';
          focus(esp.anchor, '⚡ “Tách!” — ESP32 trên bàn hàn vừa bị phóng tĩnh điện. Cắm dây nối đất vòng tay (nhìn vòng → E).');
        } else if (id === 'mo-hang-dang-cam-dien') {
          psuOn = true; dut.screwdriver.visible = true;
          fx.sparks(dut.anchor, { count: 90, speed: 200, size: 5 });
          fx.flash(dut.anchor, { size: 120, duration: 0.3, color: 0xfff1c0, intensity: 6 });
          fx.smoke(dut.anchor, { size: 30, duration: 3 });
          safety = '⚡ Ngắn mạch! Nguồn bàn vào chế độ CC 5 A';
          focus(dut.anchor, '⚡ Chập mạch ở BÀN ĐO — tắt ngõ ra nguồn bàn (nhìn nguồn → E).');
        }
      },
      resetFault() {
        fault = null; faultT = 0; fired = false; faultFixed = false;
        solderOn = true; fumeOn = true; psuOn = true; strapOn = true;
        strap.cord.visible = true; dut.screwdriver.visible = false; packHolder.visible = false;
        safety = '✅ An toàn';
      },
      dispose() {
        fps?.dispose();
        returnHeld(false);
        for (const w of tracked) { try { w.userData.labInst?.dispose?.(); } catch { /* bỏ qua */ } }
        tracked.clear();
        try { robotInst?.dispose?.(); } catch { /* bỏ qua */ }
        root.remove(fill1, fill2);
      },
    };

    function noShadow(o) { o.traverse((m) => { m.castShadow = false; }); return o; }
  },
};

export default DEF;
