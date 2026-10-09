// 🌀 Quạt hút BLDC + cánh ly tâm trong vỏ xoắn ốc (volute) — quạt hút của robot hút bụi.
// Mô hình:
//   • Driver tích hợp: duty PWM → tốc độ đặt n = n_max·(d − d_min)/(1 − d_min)  (dưới d_min quạt đứng)
//   • Đường đặc tính quạt: p = p0(n)·(1 − (Q/Q0(n))²),  p0 ∝ n², Q0 ∝ n  (định luật quạt)
//   • Đường đặc tính hệ (đầu hút + chổi + hộp rác + lưới lọc): p = K·Q²,  K = K0 / (độ thông)²
//   • Điểm làm việc = giao 2 đường:  Q = √(p0 / (K + p0/Q0²))
//   • Công suất trục P = P_max·(n/n_max)³·(0.45 + 0.55·Q/Q0)  → P ∝ n³; dòng I = P_điện / V_pin
//   • Nhiệt cuộn dây: C·dT/dt = P_tổn hao − (T − T_môi trường)·(G0 + G1·Q)  (quạt tự làm mát bằng chính luồng gió)
// Mô hình CAD thật: robot/bldc-fan.glb (cánh Ø38, vỏ xoắn ốc, động cơ Ø30, bo driver Ø36) — mô hình tự dựng giữ lại
// làm "chế độ học" (tắt tham số CAD) và làm ruột stator/rô-to khi cắt bổ.
import { cadAttach, ownMaterial } from '../../core/cadParts.js';

const VBAT = 14.4;        // pin 4S danh định (V)
const NMAX = 22000;       // vòng/phút ở 100 % PWM
const DMIN = 0.08;        // driver không khởi động dưới 8 % duty
const POLE_PAIRS = 2;     // rô-to 4 cực → 2 cặp cực → FG 2 xung/vòng
const SLOW = 150;         // vẽ cánh quay chậm 150× (22 000 vòng/phút thật không nhìn kịp)
const FG_SLOW = 200;      // xung FG trên scope làm chậm 200×
const PWM_SHOW_HZ = 1.5;  // PWM 20 kHz vẽ thành 1.5 Hz
const THERMAL_FAST = 60;  // tua nhanh nhiệt độ 60× (thực tế mất vài phút)

// Hai kiểu quạt để so sánh — cùng đường kính ~56 mm, cùng tốc độ đầu cánh
const FANS = {
  lytam: { p0: 2000, q0: 13, pmax: 34, name: 'Ly tâm (cánh cong ngược + vỏ xoắn ốc)' },
  truc: { p0: 380, q0: 24, pmax: 20, name: 'Hướng trục (kiểu quạt PC/quạt bàn)' },
};
const K0 = 24;            // trở kháng hệ thống Pa/(L/s)² khi đầu hút + lọc sạch

// Vỏ xoắn ốc (mm)
const R0 = 31, R1 = 42, TH_S = 0.35, DUCT_L = 34, VH = 18, WALL = 1.8;
const rSpiral = (th) => (th < TH_S ? R0 : R0 + ((R1 - R0) * (th - TH_S)) / (Math.PI * 2 - TH_S));

export default {
  id: 'quat-bldc',
  name: 'Quạt hút BLDC (cánh ly tâm)',
  category: 'dong-luc',
  order: 2,
  icon: '🌀',
  summary: 'Động cơ không chổi than 3 pha quay ~20 000 vòng/phút kéo cánh ly tâm trong vỏ xoắn ốc, tạo chênh áp ~1 300–2 000 Pa để hút bụi. Có driver tích hợp, điều khiển bằng 1 dây PWM và báo tốc độ bằng dây FG.',
  tags: ['quạt hút', 'BLDC', 'brushless', 'ly tâm', 'centrifugal', 'volute', 'PWM', 'FG', 'Pa', 'lực hút'],

  params: [
    { id: 'cad', label: '🧊 Mô hình CAD thật (quạt BLDC Ø74)', type: 'toggle', value: true, hint: 'Tắt = mô hình học tự dựng (cuộn dây phát sáng theo pha, kích thước phóng to dễ nhìn)' },
    { id: 'duty', label: 'PWM từ ESP32 GPIO4 (FAN:xx)', type: 'range', min: 0, max: 100, step: 1, value: 70, unit: '%', hint: 'Firmware ESP32: FAN_DEFAULT_PCT = 70 %. Dưới 8 % driver không khởi động.' },
    { id: 'open', label: 'Độ thông đầu hút / lưới lọc', type: 'range', min: 0, max: 100, step: 1, value: 100, unit: '%', hint: '100 % = lọc sạch, đầu hút thoáng. Giảm dần = lọc bẩn, tắc rác. 0 % = bịt kín.' },
    { id: 'type', label: 'Kiểu cánh quạt', type: 'select', value: 'lytam', options: [['lytam', FANS.lytam.name], ['truc', FANS.truc.name]] },
    { id: 'cut', label: 'Mở nắp + cắt bổ động cơ', type: 'toggle', value: true },
    { id: 'air', label: 'Hiện luồng khí', type: 'toggle', value: true },
  ],
  readouts: [
    { id: 'rpm', label: 'Tốc độ n', unit: 'vòng/phút' },
    { id: 'q', label: 'Lưu lượng Q', unit: 'L/s' },
    { id: 'p', label: 'Chênh áp (lực hút) p', unit: 'Pa' },
    { id: 'pe', label: 'Công suất điện', unit: 'W' },
    { id: 'i', label: 'Dòng từ pin 14.4 V', unit: 'A' },
    { id: 'air', label: 'Công suất khí p·Q', unit: 'W' },
    { id: 'fg', label: 'Tần số FG (2 xung/vòng)', unit: 'Hz' },
    { id: 'temp', label: 'Nhiệt cuộn dây (tua nhanh 60×)', unit: '°C' },
    { id: 'pick', label: 'Hút được', unit: '' },
    { id: 'state', label: 'Trạng thái', unit: '' },
  ],
  scope: {
    window: 4,
    note: '(đã làm chậm: PWM 20 kHz vẽ 1.5 Hz · FG thật 0–730 Hz vẽ chậm 200× · dòng & áp suất thời gian thực)',
    channels: [
      { name: 'PWM GPIO4', unit: 'V', min: -0.5, max: 16, color: '#ff8c1a' },
      { name: 'FG GPIO5', unit: 'V', min: -0.3, max: 3.6, color: '#3fcf8e' },
      { name: 'Dòng I', unit: 'A', min: 0, max: 5, color: '#ffd34d' },
      { name: 'Áp suất p', unit: 'Pa', min: 0, max: 2200, color: '#4cc2ff' },
    ],
  },

  info: {
    overview: `
      <p>Quạt hút là bộ phận <b>tốn điện nhất</b> của robot (20–40 W, hơn cả 2 bánh + chổi cộng lại). Nó gồm 3 phần:</p>
      <ul>
        <li><b>Cánh ly tâm (centrifugal impeller)</b>: không khí đi vào ở tâm (mắt quạt), bị cánh văng ra mép ngoài.</li>
        <li><b>Vỏ xoắn ốc (volute)</b>: rãnh rộng dần gom khí lại, đổi <i>động năng</i> thành <i>áp suất</i> rồi đẩy ra cửa xả.</li>
        <li><b>Động cơ BLDC (không chổi than) + driver tích hợp</b>: chỉ cần 4 dây — VCC (14.4 V), GND, PWM (điều tốc), FG (báo tốc độ).</li>
      </ul>
      <p>Thử: kéo <b>PWM</b> từ 100 % xuống 50 % — tốc độ giảm một nửa nhưng <b>lực hút còn ¼, công suất còn ⅛</b> (định luật quạt). Rồi kéo <b>Độ thông</b> về 0 % (bịt đầu hút): áp suất lên cực đại nhưng lưu lượng = 0 và <b>dòng điện lại GIẢM</b>. Cuối cùng chọn <b>Kiểu cánh → Hướng trục</b> để thấy vì sao quạt PC không hút được bụi.</p>`,
    specs: [
      ['Điện áp', '14.4 V danh định (pin 4S: 12.0–16.8 V)'],
      ['Tốc độ', '≈ 22 000 vòng/phút ở 100 % (mô phỏng); quạt robot thật 15 000–30 000 vòng/phút'],
      ['Lực hút (chênh áp tĩnh cực đại)', '≈ 2 000 Pa khi bịt kín; ≈ 1 300 Pa tại điểm làm việc bình thường'],
      ['Lưu lượng', '≈ 7.5 L/s (0.45 m³/phút) khi đầu hút thoáng'],
      ['Công suất điện', '≈ 30–35 W ở 100 %, dòng ≈ 2.3 A'],
      ['Cánh', 'Ø56 mm, 7 cánh cong ngược (backward-curved), mắt quạt Ø22 mm'],
      ['Dây', 'Đỏ VCC · Đen GND · Xanh PWM (vào, 3.3–5 V, 1–25 kHz) · Vàng FG (ra, open-collector, 2 xung/vòng)'],
      ['Động cơ', 'BLDC 3 pha, 6 rãnh stator / 4 cực nam châm, rô-to trong, ổ bi 2 đầu'],
    ],
    principle: `
      <h4>1. Vì sao quạt ly tâm tạo được áp suất cao?</h4>
      <p>Mỗi phần tử khí bị cánh kéo quay và văng ra bán kính lớn hơn → vận tốc đầu cánh <code>u = π·D·n/60</code>. Với D = 56 mm, n = 22 000 vòng/phút: <code>u ≈ 64 m/s</code>. Áp suất lý thuyết cỡ <code>p ≈ ψ·ρ·u²</code> (ρ = 1.2 kg/m³). Quạt ly tâm có hệ số áp <b>ψ ≈ 0.4–0.5</b> → <b>~2 000 Pa</b>. Quạt hướng trục chỉ đẩy khí dọc trục, ψ ≈ 0.05–0.1 → vài trăm Pa.</p>
      <h4>2. Định luật quạt (fan laws)</h4>
      <p><code>Q ∝ n</code> · <code>p ∝ n²</code> · <code>P ∝ n³</code>. Giảm tốc 20 % → tiết kiệm gần 50 % điện. Đó là lý do chế độ "Yên lặng/Eco" kéo dài thời gian dọn rất nhiều.</p>
      <h4>3. Điểm làm việc = giao 2 đường cong</h4>
      <p>Quạt: <code>p = p0·(1 − Q²/Q0²)</code>. Đường ống (đầu hút, chổi, hộp rác, lưới lọc): <code>p = K·Q²</code>. Lọc bẩn → K tăng → Q giảm. Với quạt ly tâm, <b>công suất tăng theo lưu lượng</b>: bịt đầu hút thì quạt "nhẹ tải", dòng điện giảm, tốc độ hơi vọt lên.</p>
      <h4>4. Động cơ BLDC & dây FG</h4>
      <p>Không có chổi than: driver đo vị trí rô-to (cảm biến Hall hoặc đo sức phản điện động — sensorless) rồi đóng 6 MOSFET theo <b>6 bước</b> để 2 trong 3 pha có điện (cuộn phát sáng trong mô hình). Mỗi lần đổi cực, chân FG lật mức → <code>f_FG = 2·n/60</code>. ESP32 đếm FG để biết quạt có thật sự quay không.</p>
      <div class="tip">Công suất khí hữu ích <code>P_khí = p·Q</code>. Ví dụ 1 300 Pa × 0.0075 m³/s ≈ 10 W trên ~33 W điện → hiệu suất tổng ~30 %. Phần còn lại thành nhiệt và tiếng ồn.</div>`,
    inRobot: `
      <ul>
        <li>Nằm sau hộp rác: đường khí đi <b>đầu hút → chổi cuộn → hộp rác → lưới lọc HEPA → mắt quạt → cửa xả</b> (thổi ra khe sau robot).</li>
        <li>Dây PWM nối <b>ESP32 GPIO4</b> (LEDC 20 kHz, 8 bit) — <code>firmware/esp32s3/src/main.cpp: fanWrite()</code>, mặc định <code>FAN_DEFAULT_PCT = 70</code>. App gửi lệnh <code>FAN:80</code> để đổi công suất.</li>
        <li>Dây FG nối <b>GPIO5</b>, cần trở kéo lên 3.3 V (FG là open-collector). Nếu quạt kéo lên sẵn tới 5 V thì phải qua phân áp/BSS138.</li>
        <li>VCC lấy thẳng từ <b>VBAT sau cầu chì 10 A</b>; tụ 1000 µF gần đầu nối nếu dây dài.</li>
        <li>Nếu quạt của xác robot là loại <b>DC chổi than 2 dây</b>: điều khiển qua MOSFET IRLZ44N + diode SS34 như chổi cuộn (xem docs/01).</li>
        <li><code>FAN_PWM_INVERT</code> trong <code>config.h</code>: một số driver chạy mạnh khi PWM thấp — đo trước!</li>
      </ul>`,
    mistakes: `
      <ul>
        <li>Đoán màu dây thay vì đo: nhầm dây PWM với VCC → <b>chết IC driver</b> (thử trong mục Sự cố).</li>
        <li>Kéo FG lên 5 V rồi cắm thẳng vào ESP32 (3.3 V) → hỏng chân GPIO dần dần.</li>
        <li>Chạy quạt khi tháo hộp rác/lưới lọc → cát, tóc bay thẳng vào cánh 20 000 vòng/phút → mòn cánh, lệch tâm, rung, hỏng ổ bi.</li>
        <li>Dùng quạt PC 12 V "cho mạnh" → lưu lượng lớn trong không khí tự do nhưng gần như <b>không có áp suất</b>, không nhấc nổi hạt cát.</li>
        <li>PWM tần số thấp (vài trăm Hz) → quạt kêu rít, một số driver hiểu sai duty.</li>
        <li>Bật 100 % đột ngột khi pin yếu → dòng khởi động làm sụt áp, ESP32 brown-out reset. Tăng dần (soft-start).</li>
      </ul>`,
    quiz: [
      { q: 'Quạt đang 1 600 Pa ở 20 000 vòng/phút. Giảm còn 15 000 vòng/phút thì áp suất và công suất thay đổi thế nào?', a: 'Tỉ số tốc độ 0.75 → p = 1 600·0.75² = 900 Pa; công suất còn 0.75³ ≈ 42 %.' },
      { q: 'Bịt kín đầu hút của quạt ly tâm thì dòng điện tăng hay giảm? Vì sao?', a: 'GIẢM — lưu lượng = 0 nên quạt không phải "đẩy" khí đi, công suất trục giảm còn ~45 %. Nhưng luồng gió làm mát động cơ cũng mất → lâu dài vẫn nóng.' },
      { q: 'FG đo được 600 Hz, quạt 2 xung/vòng. Tốc độ bao nhiêu?', a: 'n = 600/2 × 60 = 18 000 vòng/phút.' },
    ],
  },

  steps: [
    { title: 'Bước 1 — Nhìn tổng thể, rút nguồn', text: 'Tháo pin robot trước. Chụp ảnh hướng cửa xả và đường đi dây. Dụng cụ: tua vít PH1, kìm mỏ nhọn, nhíp, khay đựng vít.' },
    { title: 'Bước 2 — Tháo nắp vỏ xoắn ốc', text: '3–4 vít tự ren PT 2.6×8. Nắp có gioăng cao su quanh mắt quạt — đừng làm rách, rách là lọt gió, mất lực hút. Thấy cánh ly tâm 7 cánh cong ngược.' },
    { title: 'Bước 3 — Rút cánh quạt khỏi trục', text: 'Cánh ép chặt (press-fit) trên trục Ø3 mm. Dùng cảo nhỏ hoặc 2 tua vít dẹt bẩy ĐỀU 2 bên ở phần đĩa đế, KHÔNG bẩy vào cánh (cánh nhựa mỏng, gãy là mất cân bằng). Đánh dấu chiều cánh.' },
    { title: 'Bước 4 — Tách vỏ xoắn ốc khỏi động cơ', text: '3 vít M2 bắt mặt bích. Lúc này thấy ổ bi trên và đầu trục.' },
    { title: 'Bước 5 — Rút rô-to nam châm', text: 'Nam châm neodymium hút rất mạnh vào lõi stator — rút thẳng, không để va lệch làm mẻ nam châm. Thấy 6 cuộn dây stator chia 3 pha A-B-C.' },
    { title: 'Bước 6 — Lật bo driver', text: '6 MOSFET (3 nửa cầu), IC điều khiển BLDC, tụ lọc, đầu nối 4 dây. Đo bằng đồng hồ: điện trở giữa 2 pha bất kỳ phải bằng nhau (~0.5–1 Ω). Lắp lại theo thứ tự ngược, quay tay cánh phải trơn, không cạ.' },
  ],

  faults: [
    { id: 'pwm-vbat', label: 'Nối nhầm dây PWM vào 14.4 V', severity: 'hong',
      what: '<p>Có tiếng "tách", khói nhẹ bốc lên từ bo driver, mùi khét. Quạt không quay nữa, dòng chờ có thể tăng bất thường (IC chập bên trong). Nếu dây FG cũng đang cắm vào ESP32, GPIO5 có thể chết theo.</p>',
      why: '<p>Chân PWM của IC driver BLDC chịu tối đa ~5.5–6 V. Đặt 14.4 V vào: diode bảo vệ ESD bên trong dẫn, dòng chỉ bị giới hạn bởi điện trở rất nhỏ → hàng trăm mA chạy qua cấu trúc silicon vài µm² → nóng chảy cục bộ (latch-up), IC hỏng vĩnh viễn trong vài ms.</p>',
      fix: '<p>Đo bằng đồng hồ trước khi cắm: VCC–GND có tụ lớn (điện trở tăng dần khi đo), PWM thường có trở kéo 10–100 kΩ. Dùng đầu nối có khóa 1 chiều (JST-XH). Thêm trở 1 kΩ nối tiếp + diode zener 3.6 V trên đường PWM khi thử nghiệm. Đã cháy → thay bo driver/quạt.</p>' },
    { id: 'nguoc-cuc', label: 'Cắm ngược VCC / GND', severity: 'no',
      what: '<p>Chớp sáng, tiếng nổ nhỏ: tụ điện phân trên bo driver phồng/bung. Dòng vọt lên hàng chục ampe trong vài chục ms rồi cầu chì 10 A đứt. Bo driver chết.</p>',
      why: '<p>6 MOSFET cầu 3 pha đều có diode thân (body diode). Đảo cực: 3 cặp diode nối tiếp phân cực thuận ngay giữa + và − pin → gần như ngắn mạch: <code>I ≈ 14.4 V / (0.1 Ω pin + dây) ≈ 40–100 A</code>. Tụ điện phân bị ngược cực → lớp oxit tan, khí sinh ra → nổ van.</p>',
      fix: '<p>Dây đỏ/đen + đầu nối 1 chiều; cầu chì ngay sau pin; mạch chống ngược (P-MOSFET hoặc diode Schottky nối tiếp cho tải nhỏ). Đã nổ: rút pin ngay, chờ nguội, kiểm tra cầu chì & dây.</p>' },
    { id: 'tac', label: 'Bịt kín đầu hút (tắc rác, khăn bị hút vào)', severity: 'loi',
      what: '<p>Tiếng quạt rít cao hơn, tốc độ hơi vọt lên, dòng điện GIẢM. Nhưng sau vài phút động cơ nóng dần (≥ 100 °C) vì mất luồng gió làm mát; driver tốt sẽ tự ngắt bảo vệ nhiệt, quạt rẻ có thể cháy cuộn dây.</p>',
      why: '<p>Q = 0 → công suất trục còn ~45 % (quạt ly tâm). Nhưng cuộn dây tỏa ~5 W mà hệ số tản nhiệt tụt từ ~0.6 W/K (có gió) xuống ~0.05 W/K → <code>ΔT = P/G ≈ 5/0.05 = 100 °C</code>. Mô phỏng đang tua nhanh 60×.</p>',
      fix: '<p>Firmware: theo dõi dòng điện hoặc tần số FG — FG cao bất thường + dòng thấp = tắc → dừng quạt, báo app "Kiểm tra hộp rác/lưới lọc". Vệ sinh lưới lọc mỗi tuần.</p>' },
    { id: 'khong-loc', label: 'Chạy không lắp hộp rác / lưới lọc', severity: 'hong',
      what: '<p>Lực hút "có vẻ mạnh hơn" lúc đầu, nhưng cát và tóc bay thẳng vào cánh: tiếng lạo xạo, rung tăng dần, dòng điện tăng, cuối cùng ổ bi kẹt — quạt dừng hẳn.</p>',
      why: '<p>Hạt cát va vào đầu cánh ở vận tốc ~64 m/s → mài mòn, lệch tâm. Lực ly tâm do lệch tâm <code>F = m·e·ω²</code>: chỉ 0.05 g lệch 20 mm ở 2 300 rad/s đã là ~5 N, đập vào ổ bi hàng nghìn lần/giây. Tóc quấn quanh trục làm tăng ma sát.</p>',
      fix: '<p>Luôn lắp lưới lọc khi chạy; có công tắc phát hiện hộp rác (nhiều robot có) → firmware không cho bật quạt khi chưa lắp hộp.</p>' },
    { id: 'ket', label: 'Kẹt cánh (vật lạ chặn rô-to)', severity: 'loi',
      what: '<p>Quạt "giật giật" mỗi giây một lần rồi im hẳn. FG không có xung. Dòng có các xung ngắn ~3 A.</p>',
      why: '<p>Driver sensorless phải thấy rô-to quay mới đo được sức phản điện động. Rô-to kẹt → khởi động thất bại → thử lại vài lần (mỗi lần dòng khởi động lớn) → bật <b>khóa bảo vệ kẹt (lock protection)</b>, cần ngắt nguồn mới chạy lại.</p>',
      fix: '<p>ESP32 đọc FG: đặt PWM > 0 mà sau 1 s không có xung FG → tắt quạt, báo lỗi. Gỡ vật lạ, quay tay kiểm tra.</p>' },
  ],

  build(ctx) {
    const { THREE, MAT, geom, label, readout, fx } = ctx;
    const { mesh, group, part, cyl, box, lathe, arcSector, makeCutaway, wire } = geom;
    const root = new THREE.Group();
    const fan = new THREE.Group();
    fan.rotation.y = -Math.PI / 2;        // cửa xả hướng về +X cho dễ nhìn
    root.add(fan);
    const TAU = Math.PI * 2;

    // ---------- hình 2D vỏ xoắn ốc (toạ độ Shape: x, y → thế giới x, −z) ----------
    const tongue = [R0 * Math.cos(TH_S), R0 * Math.sin(TH_S)];
    function outline(off) {
      const s = new THREE.Shape();
      const N = 72;
      for (let k = 0; k <= N; k++) {
        const th = TH_S + ((TAU - TH_S) * k) / N;
        const r = rSpiral(th) + off;
        k === 0 ? s.moveTo(r * Math.cos(th), r * Math.sin(th)) : s.lineTo(r * Math.cos(th), r * Math.sin(th));
      }
      s.lineTo(R1 + off, DUCT_L);
      s.lineTo(tongue[0] - off, DUCT_L);
      s.lineTo(tongue[0] - off, tongue[1]);
      s.closePath();
      return s;
    }
    const flat = (shape, depth) => {
      const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 32 });
      g.rotateX(-Math.PI / 2);
      g.computeVertexNormals();
      return g;
    };
    const volMat = MAT.plasticDark.clone();
    const centri = new THREE.Group();     // cụm ly tâm (vỏ + cánh)
    fan.add(centri);

    // vỏ xoắn ốc: đáy + thành xoắn + 2 thành ống xả
    const volute = new THREE.Group();
    const floor = mesh(flat(outline(WALL), 1.5), volMat, { y: -1.5 });
    const band = new THREE.Shape();
    const NB = 72;
    for (let k = 0; k <= NB; k++) {
      const th = TH_S + ((TAU - TH_S) * k) / NB, r = rSpiral(th) + WALL;
      k === 0 ? band.moveTo(r * Math.cos(th), r * Math.sin(th)) : band.lineTo(r * Math.cos(th), r * Math.sin(th));
    }
    for (let k = NB; k >= 0; k--) {
      const th = TH_S + ((TAU - TH_S) * k) / NB, r = rSpiral(th);
      band.lineTo(r * Math.cos(th), r * Math.sin(th));
    }
    const spiralWall = mesh(flat(band, VH), volMat);
    const ductOut = mesh(box(WALL, VH, DUCT_L), volMat, { x: R1 + WALL / 2, y: VH / 2, z: -DUCT_L / 2 });
    const ductIn = mesh(box(WALL, VH, DUCT_L - tongue[1]), volMat, { x: tongue[0] - WALL / 2, y: VH / 2, z: -(DUCT_L + tongue[1]) / 2 });
    volute.add(part(group(floor, spiralWall), 'Vỏ xoắn ốc (volute)', 'Khe giữa cánh và thành vỏ rộng dần từ 0 → 11 mm theo vòng quay: khí văng ra từ cánh được gom lại, chậm dần và biến động năng thành áp suất.'));
    volute.add(part(group(ductOut, ductIn), 'Cửa xả (outlet)', 'Khí sau quạt thổi ra phía sau robot qua khe tản gió. Một số robot đặt thêm lưới lọc xả/tiêu âm ở đây.'));
    const tongueMark = mesh(cyl(0.9, 0.9, VH, 12), volMat, { x: tongue[0] - 0.3, y: VH / 2, z: -tongue[1] - 0.3 });
    volute.add(part(tongueMark, 'Lưỡi cắt (cutwater / tongue)', 'Điểm vỏ gần cánh nhất (khe ~1 mm), tách dòng khí ra cửa xả với dòng quay tiếp. Đây là nguồn tiếng rít chính (tần số = số cánh × vòng/giây).'));
    centri.add(volute);

    // nắp trên có mắt hút
    const coverShape = outline(WALL);
    const eye = new THREE.Path();
    eye.absarc(0, 0, 12, 0, TAU, true);
    coverShape.holes.push(eye);
    const coverMat = MAT.plasticDark.clone();
    coverMat.transparent = true;
    const coverPlate = mesh(flat(coverShape, 1.5), coverMat, { y: VH });
    const collar = mesh(lathe([[12, 0], [13.6, 0], [13.6, 4.5], [12, 4.5], [12, 0]], 48), coverMat, { y: VH + 1.5 });
    const gasket = mesh(new THREE.TorusGeometry(14.6, 0.9, 10, 48), MAT.rubber, { y: VH + 1.9, rx: Math.PI / 2 });
    const cover = new THREE.Group();
    cover.add(part(group(coverPlate, collar), 'Nắp vỏ + mắt hút Ø24 mm', 'Khí từ hộp rác/lưới lọc đi vào đúng tâm cánh. Khe giữa mép mắt hút và vành cánh phải rất nhỏ để khí áp cao không chảy ngược.'));
    cover.add(part(gasket, 'Gioăng cao su', 'Ép kín với ống nối hộp rác. Rách gioăng = hở = mất lực hút.'));
    centri.add(cover);

    // cánh ly tâm 7 cánh cong ngược
    const impMat = MAT.plasticWhite.clone();
    impMat.side = THREE.DoubleSide;
    const impeller = new THREE.Group();
    impeller.position.y = 1.2;
    const backplate = mesh(cyl(28, 28, 1.2, 64), impMat, { y: 1.0 });
    const hub = mesh(cyl(4.5, 5.5, 5, 32), impMat, { y: 3.5 });
    const shroud = mesh(lathe([[11.5, 11.9], [28, 10.4], [28, 11.2], [12.2, 13.0], [11.5, 11.9]], 64), impMat);
    impeller.add(part(group(backplate, hub), 'Đĩa đế + moay-ơ cánh', 'Ép chặt lên trục động cơ. Cánh được cân bằng động — mất một mẩu nhỏ là rung mạnh ở 20 000 vòng/phút.'));
    impeller.add(part(shroud, 'Vành che cánh (shroud)', 'Vòng nhựa hình nón phủ trên đỉnh cánh, giữ khí đi theo rãnh cánh, không tràn qua đỉnh.'));
    const bladeGeo = (() => {
      const s = new THREE.Shape();
      const pts = [];
      for (let k = 0; k <= 12; k++) { const u = k / 12; pts.push([12 + 15.5 * u, -1.0 * u]); }
      pts.forEach(([r, ph], k) => { const a = ph + 0.55 / r; k === 0 ? s.moveTo(r * Math.cos(a), r * Math.sin(a)) : s.lineTo(r * Math.cos(a), r * Math.sin(a)); });
      for (let k = pts.length - 1; k >= 0; k--) { const [r, ph] = pts[k]; const a = ph - 0.55 / r; s.lineTo(r * Math.cos(a), r * Math.sin(a)); }
      s.closePath();
      return flat(s, 8.6);
    })();
    const blades = new THREE.Group();
    for (let k = 0; k < 7; k++) blades.add(mesh(bladeGeo, impMat, { y: 1.6, ry: (k * TAU) / 7 }));
    impeller.add(part(blades, '7 cánh cong ngược (backward-curved)', 'Đầu cánh cong NGƯỢC chiều quay: hiệu suất cao, công suất không tăng vọt khi lưu lượng lớn (không quá tải động cơ). Khí đi từ mép trong r = 12 mm ra mép ngoài r = 27.5 mm.'));
    centri.add(impeller);

    // ---------- quạt hướng trục (so sánh) ----------
    const axial = new THREE.Group();
    axial.visible = false;
    const frameShape = new THREE.Shape();
    frameShape.moveTo(-40, -40); frameShape.lineTo(40, -40); frameShape.lineTo(40, 40); frameShape.lineTo(-40, 40); frameShape.closePath();
    const fh = new THREE.Path(); fh.absarc(0, 0, 38, 0, TAU, true); frameShape.holes.push(fh);
    axial.add(part(mesh(flat(frameShape, 25), MAT.plasticBlack, { y: 0 }), 'Khung quạt hướng trục 80×80×25 mm', 'Kiểu quạt máy tính: khí đi THẲNG dọc trục, không đổi hướng, không có vỏ xoắn ốc để nén khí.'));
    const axHub = mesh(cyl(15, 15, 22, 40), MAT.plasticBlack, { y: 12.5 });
    const axRotor = new THREE.Group();
    axRotor.add(axHub);
    for (let k = 0; k < 7; k++) {
      const b = mesh(box(22, 0.9, 13, 0.3), MAT.plasticBlack, { x: 26 * Math.cos((k * TAU) / 7), y: 12.5, z: -26 * Math.sin((k * TAU) / 7), ry: (k * TAU) / 7 });
      b.rotation.order = 'YXZ';
      b.rotation.x = 0.55;
      axRotor.add(b);
    }
    axial.add(part(axRotor, '7 cánh nghiêng (hướng trục)', 'Cánh nghiêng như chân vịt: đẩy nhiều khí khi thông thoáng nhưng áp suất rất thấp. Gặp lưới lọc + hộp rác là lưu lượng tụt gần hết.'));
    fan.add(axial);

    // ---------- động cơ BLDC ----------
    const motor = new THREE.Group();
    fan.add(motor);
    const housingMat = MAT.aluminum.clone();
    const housing = mesh(cyl(17, 17, 28, 64, true), housingMat, { y: -16 });
    const flange = mesh(cyl(20, 20, 1.6, 64), housingMat, { y: -2.3 });
    const bottomCap = mesh(cyl(17, 17, 1.2, 64), housingMat, { y: -30.4 });
    const housingG = part(group(housing, flange, bottomCap), 'Vỏ động cơ nhôm', 'Vỏ nhôm vừa giữ ổ bi vừa tản nhiệt. Nhiều quạt có khe để một phần luồng khí đi qua làm mát cuộn dây.');
    motor.add(housingG);
    // stator 6 rãnh
    const stator = new THREE.Group();
    stator.position.y = -16;
    const yoke = mesh(arcSector(13, 15.6, 0, TAU, 16, 48), MAT.ferrite);
    stator.add(part(yoke, 'Gông stator (thép lá)', 'Vòng thép kỹ thuật điện ghép lá, khép mạch từ cho 6 răng.'));
    const coilMeshes = [];
    const PH = ['A', 'B', 'C'];
    for (let k = 0; k < 6; k++) {
      const pv = new THREE.Group();
      pv.rotation.y = (k * TAU) / 6;
      const tooth = mesh(box(5.4, 16, 2.6), MAT.ferrite, { x: 10.5 });
      const shoe = mesh(arcSector(7.9, 8.9, -0.42, 0.42, 16, 8), MAT.ferrite);
      const cg = new THREE.TorusGeometry(2.0, 1.15, 8, 20);
      cg.scale(1, 4.0, 1);
      cg.rotateY(Math.PI / 2);
      const coil = mesh(cg, MAT.copper.clone(), { x: 10.6 });
      coilMeshes.push(coil);
      pv.add(tooth, shoe);
      pv.add(part(coil, `Cuộn pha ${PH[k % 3]} (#${k + 1})`, `Cuộn dây đồng quấn trên răng stator. Hai cuộn đối diện cùng pha ${PH[k % 3]} nối tiếp. Phát sáng khi driver đang cấp điện cho pha này.`));
      stator.add(pv);
    }
    motor.add(stator);
    // rô-to nam châm (quay)
    const rotor = new THREE.Group();
    rotor.position.y = -16;
    for (let k = 0; k < 4; k++) {
      const a = (k * TAU) / 4;
      rotor.add(mesh(arcSector(4.6, 7.4, a - 0.72, a + 0.72, 15, 12), k % 2 ? MAT.magnetS : MAT.magnetN));
    }
    rotor.add(mesh(cyl(4.6, 4.6, 15, 24), MAT.steel));
    part(rotor, 'Rô-to nam châm 4 cực (NdFeB)', 'Nam châm đất hiếm xen kẽ N–S dán trên lõi thép. Không có dây, không có chổi than → không mòn, quay rất nhanh được.');
    motor.add(rotor);
    const shaft = mesh(cyl(1.5, 1.5, 40, 16), MAT.steel, { y: -8 });
    const bearing1 = mesh(cyl(3.5, 3.5, 3, 24), MAT.steel, { y: -4.5 });
    const bearing2 = mesh(cyl(3.5, 3.5, 3, 24), MAT.steel, { y: -27.5 });
    motor.add(part(shaft, 'Trục thép Ø3 mm', 'Truyền mô-men từ rô-to lên cánh quạt.'));
    const bearings = part(group(bearing1, bearing2), '2 ổ bi 683ZZ', 'Ổ bi nhỏ chịu tốc độ > 20 000 vòng/phút. Hỏng ổ bi → tiếng hú, rung, dòng tăng.');
    motor.add(bearings);

    // ---------- bo driver (mặt linh kiện quay xuống dưới) ----------
    const pcbG = new THREE.Group();
    pcbG.position.y = -31.8;
    const board = mesh(cyl(17, 17, 1.6, 48), MAT.pcbBlack.clone());
    pcbG.add(part(board, 'Bo driver BLDC tròn', 'Gắn ở đuôi động cơ. Chứa IC điều khiển + 6 MOSFET + tụ lọc. Nhận 14.4 V và tín hiệu PWM, xuất xung FG.'));
    const ic = mesh(box(5, 1.2, 5, 0.2), MAT.icBody, { y: -1.4 });
    pcbG.add(part(ic, 'IC điều khiển BLDC (sensorless)', 'Đọc sức phản điện động pha đang thả nổi để biết vị trí rô-to, tạo 6 bước chuyển mạch, đọc duty PWM, xuất FG; có bảo vệ kẹt, quá dòng, quá nhiệt.'));
    const fets = new THREE.Group();
    for (let k = 0; k < 6; k++) {
      const a = (k * TAU) / 6 + 0.3;
      fets.add(mesh(box(3, 1, 3), MAT.icBody, { x: 11 * Math.cos(a), y: -1.3, z: 11 * Math.sin(a), ry: -a }));
    }
    pcbG.add(part(fets, '6 MOSFET — 3 nửa cầu (3 pha)', 'Mỗi pha 1 MOSFET phía cao + 1 phía thấp. Tại mỗi thời điểm 2 pha dẫn: 1 pha nối +14.4 V, 1 pha nối GND, pha thứ 3 thả nổi.'));
    const capMesh = mesh(cyl(3, 3, 7, 24), MAT.aluminum.clone(), { x: -6, y: -4.3, z: 5 });
    pcbG.add(part(capMesh, 'Tụ lọc 100 µF / 25 V', 'Cấp dòng xung cho cầu MOSFET, chặn nhiễu ngược về dây nguồn.'));
    const conn = mesh(box(10, 6, 5.8, 0.4), MAT.plasticWhite, { x: 12, y: -3.6, z: 0 });
    pcbG.add(part(conn, 'Đầu nối JST-XH 4 chân (bước 2.5 mm)', 'Có khóa, cắm được 1 chiều. Thứ tự dây thay đổi theo hãng — luôn đo lại!'));
    const wcol = [0xd23b3b, 0x1d1f23, 0x2e6fd8, 0xf2c14e];
    const wnames = [['Dây đỏ — VCC 14.4 V', 'Nối VBAT sau cầu chì 10 A. Dòng tới ~2.5 A.'], ['Dây đen — GND', 'Chung GND với ESP32 & PIC (nối sao về cực âm pin).'],
      ['Dây xanh — PWM (vào)', 'Từ ESP32 GPIO4, LEDC 20 kHz. Mức logic 3.3 V thường đủ — đo ngưỡng của driver trước.'], ['Dây vàng — FG (ra)', 'Open-collector, 2 xung/vòng. Kéo lên 3.3 V bằng trở 10 kΩ rồi vào ESP32 GPIO5.']];
    wcol.forEach((c, k) => {
      const z = -3.75 + k * 2.5;
      pcbG.add(part(wire([[16, -3.6, z], [24, -3.0, z], [34, -1, z * 1.3], [44, -2, z * 1.6]], { radius: 0.55, color: c }), wnames[k][0], wnames[k][1]));
    });
    motor.add(pcbG);

    const procLabels = new THREE.Group();     // nhãn của mô hình học (ẩn khi xem CAD — CAD có nhãn riêng)
    root.add(procLabels);
    label(procLabels, 'Mắt hút (khí vào)', [0, VH + 9, 0]);
    label(procLabels, 'Cánh ly tâm', [0, 12, 22]);
    label(procLabels, 'Vỏ xoắn ốc', [-36, VH + 2, 0]);
    label(procLabels, 'Cửa xả', [DUCT_L + 2, VH + 3, -36]);
    label(procLabels, 'Động cơ BLDC', [-19, -14, 10]);
    label(procLabels, 'Driver + 4 dây', [0, -38, 40]);

    // ---------- cắt bổ: chỉ vỏ động cơ ----------
    // mặt phẳng cắt bỏ nửa x > 0 của động cơ (nhìn thấy stator, rô-to bên trong)
    const cutHousing = makeCutaway(motor, new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0));
    const reCut = (on) => {
      cutHousing(on);
      // rô-to, stator, bo mạch: không cắt để nhìn rõ
      for (const g of [rotor, stator, pcbG, shaft, bearing1, bearing2]) g.traverse((o) => { if (o.material) o.material.clippingPlanes = null; });
    };
    reCut(true);

    // ---------- mô hình CAD thật (khung GLB: trục quạt +Y, cửa xả hướng −Z — trùng hướng với `fan`) ----------
    // Đáy vỏ xoắn ốc CAD ở y = 25 mm → hạ 25 mm để đáy vỏ / đĩa cánh khớp với mô hình tự dựng (y ≈ 0).
    const cutPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
    const cadR = {};          // node & khớp CAD (điền trong onLoad)
    const cad = cadAttach(ctx, fan, 'robot/bldc-fan', {
      onBottom: false, offset: [0, -25, 0],
      hide: [centri, housingG, shaft, bearings, pcbG, stator, rotor, procLabels],
      partDefault: ['Quạt hút BLDC (CAD thật)', 'Mô hình CAD đúng kích thước: vỏ xoắn ốc 74 × 63 mm, cánh ly tâm Ø38 mm, động cơ Ø30 mm, bo driver Ø36 mm, dây 4 sợi VCC/GND/PWM/FG.'],
      parts: {
        volute: ['Vỏ xoắn ốc (volute) — nửa dưới', 'Khe giữa cánh và thành vỏ rộng dần (bán kính 22 → 30 mm) theo vòng quay: khí văng ra được gom lại, chậm dần, biến động năng thành áp suất rồi ra cửa xả 8 × 16 mm.'],
        cover_shell: ['Nắp vỏ xoắn ốc + mắt hút Ø19 mm', 'Khí từ hộp rác/lưới lọc đi vào đúng tâm cánh. Bắt bằng 3 vít PT 2.6×10 vào 3 tai của vỏ dưới.'],
        gasket_inlet: ['Gioăng xốp mắt hút', 'Ép kín với ống nối hộp rác. Rách/xẹp gioăng = hở gió = mất lực hút.'],
        impeller: ['Cánh ly tâm 9 cánh cong ngược Ø38 mm', 'Ép chặt lên trục Ø3 mm. Đầu cánh cong NGƯỢC chiều quay → hiệu suất cao, không quá tải khi lưu lượng lớn. Được cân bằng động — sứt một mẩu là rung mạnh.'],
        motor_can: ['Vỏ động cơ nhôm Ø30 mm', 'Giữ ổ bi và tản nhiệt; các khe ở thành vỏ cho một phần luồng khí đi qua làm mát cuộn dây.'],
        stator: ['Stator + cuộn dây 3 pha', 'Lõi thép lá quấn 6 cuộn dây đồng (pha A-B-C). Bật "cắt bổ" để xem cuộn nào đang được cấp điện.'],
        shaft: ['Trục thép Ø3 mm (gắn rô-to nam châm)', 'Truyền mô-men từ rô-to lên cánh quạt. Quay ~20 000 vòng/phút (hình vẽ đã làm chậm 150×).'],
        pcb: ['Bo driver BLDC tròn Ø36 mm', 'Gắn ở đuôi động cơ. Nhận 14.4 V và tín hiệu PWM, xuất xung FG báo tốc độ.'],
        mosfets: ['6 MOSFET — 3 nửa cầu (3 pha)', 'Mỗi pha 1 MOSFET phía cao + 1 phía thấp. Mỗi lúc 2 pha dẫn, pha thứ 3 thả nổi để IC đo sức phản điện động.'],
        driver_ic: ['IC điều khiển BLDC (sensorless)', 'Đọc sức phản điện động để biết vị trí rô-to, tạo 6 bước chuyển mạch, đọc duty PWM, xuất FG; có bảo vệ kẹt, quá dòng, quá nhiệt.'],
        capacitor: ['Tụ lọc điện phân', 'Cấp dòng xung cho cầu MOSFET, chặn nhiễu ngược về dây nguồn. Cắm ngược cực → tụ phồng/nổ.'],
        conn_header: ['Đầu cái JST-PH 4 chân (bước 2.0 mm)', 'Có khóa, cắm được 1 chiều. Thứ tự dây thay đổi theo hãng — luôn đo lại!'],
        conn_pins: ['Chân đầu nối JST-PH', '4 chân hàn xuyên lỗ: VCC, GND, PWM, FG.'],
        plug_housing: ['Giắc cắm JST-PH 4 chân', 'Rút thẳng xuống (theo trục quạt), không kéo dây.'],
        wire_1: ['Dây 1 — VCC 14.4 V', 'Nối VBAT sau cầu chì 10 A. Dòng tới ~2.5 A.'],
        wire_2: ['Dây 2 — GND', 'Chung GND với ESP32 & PIC (nối sao về cực âm pin).'],
        wire_3: ['Dây 3 — PWM (vào)', 'Từ ESP32 GPIO4, LEDC 20 kHz. PWM thấp = quạt tắt.'],
        wire_4: ['Dây 4 — FG (ra)', 'Open-collector, 2 xung/vòng. Kéo lên 3.3 V bằng trở 10 kΩ rồi vào ESP32 GPIO5.'],
        'screw_*': ['Vít tự ren PT 2.6×10 (PH1)', '3 vít ghép nắp với vỏ xoắn ốc. Vặn vừa tay — nhựa dễ toác ren.'],
      },
      labels: [
        ['Mắt hút (khí vào)', 'gasket_inlet', [0, 6, 0]],
        ['Cánh ly tâm', 'impeller', [0, -2, 22]],
        ['Vỏ xoắn ốc', 'volute', [-38, 0, 0]],
        ['Cửa xả', 'volute', [26, 2, -34]],
        ['Động cơ BLDC', 'motor_can', [14, -4, 17]],
        ['Driver + 4 dây', 'conn_fan', [0, -8, 0]],
      ],
      onLoad(c) {
        cadR.imp = c.pivot('impeller', { axis: [0, 1, 0], origin: [0, 0, 0] });
        cadR.impUp = cadR.imp && c.slide(cadR.imp.pivot, [0, 1, 0]);
        cadR.shaft = c.pivot('shaft', { axis: [0, 1, 0], origin: [0, 0, 0] });
        cadR.shaftUp = cadR.shaft && c.slide(cadR.shaft.pivot, [0, 1, 0]);
        cadR.vol = c.slide('volute', [0, 1, 0]);
        cadR.lid = c.slide('lid_fan', [0, 1, 0]);
        cadR.screws = c.nodes('screw_*').map((n) => { const pv = c.pivot(n, { axis: [0, 1, 0] }); return { pv, up: c.slide(pv.pivot, [0, 1, 0]) }; });
        // giắc + dây đi theo bo driver khi lật bo
        const db = c.node('driver_board'), cf = c.node('conn_fan');
        if (db && cf) db.attach(cf);
        cadR.board = c.pivot('driver_board', { axis: [1, 0, 0], origin: [0, 0.8, 0] });
        cadR.boardDown = cadR.board && c.slide(cadR.board.pivot, [0, 1, 0]);
        cadR.stator = c.node('stator');
        cadR.can = c.node('motor_can');
        cadR.ic = c.node('driver_ic');
        cadR.fets = c.node('mosfets');
        cadR.cap = c.mmSpace('capacitor') || c.node('capacitor');   // khung mm → fx.pop văng đúng tầm
        cadR.pcb = c.node('pcb');
        cadR.plug = c.node('plug_housing');
        cadR.lidMats = [];
        c.node('cover_shell')?.traverse((o) => { if (o.isMesh) { const m = ownMaterial(o); m.transparent = true; cadR.lidMats.push(m); } });
        cadR.canMats = [];
        cadR.can?.traverse((o) => { if (o.isMesh) { const m = ownMaterial(o); m.side = THREE.DoubleSide; cadR.canMats.push(m); } });
      },
    });
    let lastCadClip = null;
    // chọn chi tiết để diễn sự cố: CAD (nếu đang hiện) hoặc mô hình tự dựng
    const tgt = (cadNode, proc) => (cad.active && cadNode ? cadNode : proc);
    let icHot = 0, fetHot = 0;

    // ---------- hạt luồng khí ----------
    const NP = 44;
    const airMat = MAT.airflow.clone();
    const pGeo = new THREE.SphereGeometry(0.9, 8, 6);
    const particles = [];
    for (let k = 0; k < NP; k++) {
      const m = new THREE.Mesh(pGeo, airMat);
      m.raycast = () => {};
      m.userData.noCut = true;
      const seed = (k * 0.6180339) % 1;
      particles.push({ m, s: seed, a: (k * 2.39996) % TAU, rr: 2 + ((k * 7) % 9), h: 3 + ((k * 5) % 11), fx: 0.15 + ((k * 3) % 7) / 10 });
      fan.add(m);
    }
    const tmpPos = (pt, out) => {
      const s = pt.s;
      if (s < 0.25) { const u = s / 0.25; out.set(pt.rr * Math.cos(pt.a), 40 - 31 * u, -pt.rr * Math.sin(pt.a)); return; }
      const a1 = pt.a + 1.4;
      if (s < 0.45) {
        const u = (s - 0.25) / 0.2; const r = pt.rr + (28 - pt.rr) * u; const ph = pt.a + 1.4 * u;
        out.set(r * Math.cos(ph), 7, -r * Math.sin(ph)); return;
      }
      if (curType === 'truc') { out.set(0, -100, 0); return; }
      if (s < 0.85) {
        const u = (s - 0.45) / 0.4;
        let ph0 = a1 % TAU; if (ph0 < 0) ph0 += TAU;
        const ph = ph0 + (TAU - ph0) * u;
        const r = rSpiral(ph % TAU === 0 ? TAU : ph) - 3.5;
        out.set(r * Math.cos(ph), pt.h, -r * Math.sin(ph)); return;
      }
      const u = (s - 0.85) / 0.15;
      out.set(tongue[0] + (R1 - tongue[0]) * pt.fx, pt.h, -(DUCT_L + 14) * u);
    };

    // ---------- trạng thái ----------
    let n = 0, theta = 0, fgPh = 0, pwmPh = 0, tempC = 30, lastCut = true, curType = 'lytam';
    let trip = false, fault = null, ft = 0, dead = false, locked = false, wear = 0, heated = false, spikeI = 0, tries = 0;
    const stepOff = { cover: 0, imp: 0, vol: 0, rot: 0, pcb: 0 };
    let stepTarget = { cover: 0, imp: 0, vol: 0, rot: 0, pcb: 0 };
    const STEP_TARGETS = [
      { cover: 0, imp: 0, vol: 0, rot: 0, pcb: 0 },
      { cover: 30, imp: 0, vol: 0, rot: 0, pcb: 0 },
      { cover: 50, imp: 30, vol: 0, rot: 0, pcb: 0 },
      { cover: 70, imp: 50, vol: 30, rot: 0, pcb: 0 },
      { cover: 80, imp: 60, vol: 40, rot: 28, pcb: 0 },
      { cover: 80, imp: 60, vol: 40, rot: 28, pcb: 1 },
    ];
    const v3 = new THREE.Vector3();

    function resetAll() {
      trip = false; fault = null; ft = 0; dead = false; locked = false; wear = 0; spikeI = 0; tries = 0; tempC = 30;
      impeller.position.x = impeller.position.z = 0;
      impeller.rotation.x = impeller.rotation.z = 0;
      airMat.color.set(0x7fd3ff);
    }

    return {
      object: root,
      // i < 0 = lắp hoàn chỉnh (mặc định)
      setStep(i) { stepTarget = STEP_TARGETS[Math.max(0, Math.min(STEP_TARGETS.length - 1, i))]; },
      triggerFault(id) {
        resetAll();
        fault = id;
        if (id === 'pwm-vbat') {
          const icT = tgt(cadR.ic, ic);
          fx.sparks(tgt(cadR.plug, conn), { count: 30, speed: 30, size: 0.7 });
          fx.flash(icT, { size: 14, color: 0xffe0a0 });
          fx.smoke(icT, { size: 6, duration: 4 });
          fx.scorch(icT);
          icHot = 1;
          dead = true;
        }
        if (id === 'nguoc-cuc') {
          spikeI = 45;
          const capT = tgt(cadR.cap, capMesh);
          fx.flash(capT, { size: 30, color: 0xfff1c0, intensity: 6 });
          fx.pop(capT, { force: 45, size: 8 });
          fx.smoke(tgt(cadR.pcb, board), { size: 8, duration: 5 });
          fx.scorch(tgt(cadR.fets, fets));
          fetHot = 1;
          dead = true;
        }
        if (id === 'khong-loc') airMat.color.set(0x8a6a3a);
        if (id === 'ket') { locked = true; tries = 0; }
      },
      resetFault() { resetAll(); icHot = 0; fetHot = 0; },
      update(dt, t, p) {
        // ----- giao diện -----
        if (p.cut !== lastCut) { reCut(p.cut); lastCut = p.cut; }
        if (p.type !== curType) { curType = p.type; }
        const cadOn = cad.sync(p);
        centri.visible = curType === 'lytam' && !cadOn;
        axial.visible = curType === 'truc';
        coverMat.opacity = p.cut ? 0.12 : 1;
        coverMat.depthWrite = !p.cut;
        // nội suy các bước tháo lắp
        const kk = Math.min(1, dt * 4);
        for (const key of Object.keys(stepOff)) stepOff[key] += (stepTarget[key] - stepOff[key]) * kk;
        cover.position.y = stepOff.cover;
        impeller.position.y = 1.2 + stepOff.imp;
        volute.position.y = stepOff.vol;
        cover.position.y += stepOff.vol;
        impeller.position.y += stepOff.vol;
        // CAD bật: stator + rô-to tự dựng thu nhỏ 0.64× cho vừa vỏ CAD Ø30 (stator CAD Ø20 ở y = −11) — chỉ hiện khi cắt bổ / rút rô-to
        const inside = !cadOn || p.cut || stepOff.rot > 0.5;
        const sIn = cadOn ? 0.64 : 1, yIn = cadOn ? -11 : -16;
        stator.visible = rotor.visible = inside;
        stator.scale.setScalar(sIn); rotor.scale.setScalar(sIn);
        stator.position.y = yIn;
        rotor.position.y = yIn + stepOff.rot;
        pcbG.position.y = -31.8 - 22 * stepOff.pcb;
        pcbG.position.x = 0;
        pcbG.rotation.x = Math.PI * stepOff.pcb;
        ft += dt;

        // ----- vật lý quạt -----
        const F = FANS[curType];
        const d = p.duty / 100;
        let open = p.open / 100;
        if (fault === 'tac') open = 0;
        let K = K0;
        if (fault === 'khong-loc') K = K0 * 0.55;
        const dEff = d >= DMIN ? (d - DMIN) / (1 - DMIN) : 0;
        // tỉ số Q/Q0 không phụ thuộc tốc độ (cùng tỉ lệ theo định luật quạt)
        const qr = open > 0 ? open * Math.sqrt(F.p0 / (K * F.q0 * F.q0 + open * open * F.p0)) : 0;
        let nT = NMAX * dEff * (1 + 0.06 * (1 - qr));
        if (dead) nT = 0;
        if (fault === 'khong-loc') { wear = Math.min(1, wear + dt / 9); if (wear >= 1) { nT = 0; if (!dead) { dead = true; fx.sparks(tgt(cadR.shaft?.node, shaft), { count: 25, speed: 25, size: 0.5 }); fx.smoke(tgt(cadR.can, bearing1), { size: 5, duration: 3 }); } } }
        let startPulse = 0;
        if (locked) {
          nT = 0;
          // thử khởi động mỗi 1.2 s, tối đa 4 lần rồi khóa
          if (dEff > 0 && tries < 4) { const ph = ft % 1.2; if (ph < 0.2) startPulse = 3.0; if (ph < dt) tries++; }
        }
        if (fault === 'tac' && tempC > 120 && !trip) { trip = true; fx.smoke(tgt(cadR.can, housing), { size: 6, duration: 3, color: 0x8a8a8a }); }
        if (trip) nT = 0;
        if (tempC > 150 && !dead) { dead = true; fx.smoke(tgt(cadR.can, housing), { size: 10, duration: 6 }); }
        // quán tính quay: hằng số thời gian ~0.5 s khi tăng tốc, 1.5 s khi thả trôi
        const tau = nT > n ? 0.5 : 1.5;
        n += (nT - n) * Math.min(1, dt / tau);
        if (n < 1) n = Math.max(0, n);
        const nr = n / NMAX;
        const p0 = F.p0 * nr * nr, q0 = F.q0 * nr;
        const Q = q0 * qr;
        const pres = p0 * (1 - qr * qr);
        let Pshaft = F.pmax * nr * nr * nr * (curType === 'lytam' ? 0.45 + 0.55 * qr : 1.15 - 0.3 * qr);
        if (fault === 'khong-loc') Pshaft *= 1 + 0.6 * wear;      // ma sát ổ bi + rung
        const Pel = n > 1 ? Pshaft / 0.8 + 0.4 : 0.15;
        let I = Pel / VBAT + startPulse;
        if (spikeI > 0) { I = spikeI; spikeI = Math.max(0, spikeI - dt * 900); }   // ~50 ms đến khi cầu chì đứt
        // nhiệt cuộn dây (tua nhanh)
        const Ploss = Pel - Pshaft + startPulse * 2;
        const G = 0.05 + 0.075 * Q;
        tempC += ((Ploss - (tempC - 30) * G) / 27) * dt * THERMAL_FAST;
        const hot = Math.max(0, (tempC - 70) / 90);
        if (hot > 0.02) { fx.heat(housing, hot); if (cadR.can) fx.heat(cadR.can, hot); heated = true; }
        else if (heated) { fx.heat(housing, 0); if (cadR.can) fx.heat(cadR.can, 0); heated = false; }
        // IC / MOSFET nóng đỏ sau sự cố điện (nguội dần trong ~8 s)
        if (icHot > 0) { icHot = Math.max(0, icHot - dt / 8); fx.heat(tgt(cadR.ic, ic), icHot); }
        if (fetHot > 0) { fetHot = Math.max(0, fetHot - dt / 8); fx.heat(tgt(cadR.fets, fets), fetHot); }

        // ----- hình ảnh -----
        const w = (n * TAU) / 60;
        theta += (w / SLOW) * dt;
        impeller.rotation.y = theta;
        axRotor.rotation.y = theta;
        rotor.rotation.y = theta;
        // ----- CAD thật: cánh + trục quay theo θ; tháo lắp theo manifest (vít → nắp +Y → cánh → vỏ → rô-to → lật bo) -----
        if (cadOn) {
          const showCentri = curType === 'lytam';
          for (const n of [cadR.vol?.node, cad.node('lid_fan'), cadR.imp?.pivot]) if (n) n.visible = showCentri;
          cadR.screws.forEach((s) => (s.pv.pivot.visible = showCentri));
          cadR.imp?.set(theta);
          cadR.shaft?.set(theta);
          const sOut = Math.min(1, stepOff.cover / 25);                  // vít ra trước, nắp nhấc sau
          cadR.screws.forEach((s) => { s.up?.set(stepOff.vol + sOut * 16); s.pv.set(-sOut * Math.PI * 8); });
          cadR.lid?.set(stepOff.vol + Math.max(0, stepOff.cover - 5) * 1.0);
          cadR.vol?.set(stepOff.vol);
          cadR.impUp?.set(stepOff.vol + stepOff.imp);
          cadR.shaftUp?.set(stepOff.rot);
          cadR.boardDown?.set(-28 * stepOff.pcb);
          cadR.board?.set(Math.PI * stepOff.pcb);
          if (cadR.stator) cadR.stator.visible = !inside;
          // cắt bổ: nắp trong suốt, vỏ động cơ bị cắt nửa x > 0 → thấy stator/rô-to phát sáng bên trong
          const clip = !!p.cut;
          if (clip !== lastCadClip) {
            lastCadClip = clip;
            cadR.lidMats.forEach((m) => { m.opacity = clip ? 0.18 : 1; m.depthWrite = !clip; m.needsUpdate = true; });
            cadR.canMats.forEach((m) => { m.clippingPlanes = clip ? [cutPlane] : null; m.needsUpdate = true; });
          }
        }
        if (fault === 'khong-loc' && n > 100) {
          const e = 0.6 * wear;
          impeller.position.x = e * Math.cos(t * 47);
          impeller.position.z = e * Math.sin(t * 53);
          impeller.rotation.x = 0.02 * wear * Math.sin(t * 61);
        }
        // 6 bước: 2 pha có điện, phát sáng
        const step = Math.floor(((theta * POLE_PAIRS) % TAU) / (TAU / 6));
        const ON = [[0, 1], [0, 2], [1, 2], [1, 0], [2, 0], [2, 1]][((step % 6) + 6) % 6];
        const glow = Math.min(1, (I - 0.1) / 2) * (n > 1 || startPulse ? 1 : 0);
        coilMeshes.forEach((c, k) => {
          const on = ON.includes(k % 3) ? glow : 0;
          c.material.emissive.setRGB(on, on * 0.5, on * 0.1);
          c.material.emissiveIntensity = 1.4;
        });
        // hạt khí
        const showAir = p.air && Q > 0.05;
        const rate = (0.55 * Q) / 7.5;
        for (const pt of particles) {
          pt.m.visible = showAir;
          if (!showAir) continue;
          pt.s = (pt.s + rate * dt) % 1;
          tmpPos(pt, v3);
          if (curType === 'truc' && pt.s >= 0.25) { const u = (pt.s - 0.25) / 0.75; v3.set(pt.rr * 3 * Math.cos(pt.a), 9 - 50 * u, -pt.rr * 3 * Math.sin(pt.a)); }
          else if (cadOn) { v3.x *= 0.72; v3.z *= 0.72; }     // vỏ CAD nhỏ hơn (R 22→30 mm thay vì 31→42 mm)
          pt.m.position.copy(v3);
        }

        // ----- tín hiệu -----
        pwmPh = (pwmPh + PWM_SHOW_HZ * dt) % 1;
        const pwmV = fault === 'pwm-vbat' ? 14.4 : (pwmPh < d ? 3.3 : 0);
        const fgHz = (n / 60) * 2;
        fgPh = (fgPh + (fgHz / FG_SLOW) * dt) % 1;
        const fgV = n > 30 ? (fgPh < 0.5 ? 0 : 3.3) : 3.3;

        const pick = pres < 1 ? '—' : pres < 300 ? 'Bụi mịn trên sàn cứng' : pres < 900 ? 'Bụi + vụn nhẹ' : 'Cát, gạo, tóc trên thảm ✓';
        let state = 'Bình thường';
        if (d > 0 && d < DMIN) state = 'PWM < 8 % → driver không khởi động';
        if (fault === 'tac') state = trip ? '⚠️ Bảo vệ nhiệt 120 °C đã ngắt quạt (mùi nhựa nóng)' : tempC > 100 ? '⚠️ Quá nhiệt — bảo vệ nhiệt sắp ngắt' : 'Tắc đầu hút: Q = 0, dòng giảm, đang nóng dần';
        if (fault === 'khong-loc') state = dead ? '⚡ Ổ bi kẹt — quạt chết' : `Cát va vào cánh — rung ${Math.round(wear * 100)} %`;
        if (fault === 'ket') state = tries >= 4 ? '🔒 Khóa bảo vệ kẹt (ngắt nguồn để chạy lại)' : `Khởi động thất bại — thử lại lần ${tries}`;
        if (fault === 'pwm-vbat') state = '⚡ IC driver chết (14.4 V vào chân PWM)';
        if (fault === 'nguoc-cuc') state = spikeI > 0 ? `💥 Ngắn mạch qua diode thân MOSFET: ${I.toFixed(0)} A` : '💥 Cầu chì đứt — driver hỏng';
        if (dead && !fault) state = '🔥 Cuộn dây cháy';

        readout('rpm', n);
        readout('q', Q);
        readout('p', pres);
        readout('pe', Pel);
        readout('i', I);
        readout('air', (pres * Q) / 1000);
        readout('fg', fgHz);
        readout('temp', tempC);
        readout('pick', pick);
        readout('state', state);
        return [pwmV, fgV, I, pres];
      },
    };
  },
};
