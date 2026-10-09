// 🔌 Mạch hạ áp buck XL4015 — 16.8 V (pin 4S) → 5 V cho logic (PIC, ESP32, cảm biến).
// Mô phỏng: nút chuyển mạch (SW), dòng cuộn cảm tam giác, Vout = D·Vin, gợn sóng theo L/C/ESR, CCM/DCM,
// tổn hao (dẫn, chuyển mạch, diode, cuộn cảm) → hiệu suất & nhiệt. Tần số đóng cắt thật 180 kHz (làm chậm để xem).

import { cadAttach } from '../../core/cadParts.js';

const F_SW = 180e3;        // tần số đóng cắt XL4015 (Hz)
const RDS = 0.08;          // điện trở công tắc nội (Ω)
const VF = 0.45;           // sụt áp diode Schottky SS54 ở vài ampe (V)
const DCR = 0.03;          // điện trở dây cuộn cảm (Ω)
const T_SWITCH = 30e-9;    // tổng thời gian sườn lên + xuống (s)
const IQ = 0.003;          // dòng tĩnh của IC (A)
const VFB = 1.25;          // điện áp hồi tiếp chuẩn (V)
const R_FB_LOW = 1.0;      // điện trở dưới của bộ chia hồi tiếp (kΩ)
const N = 240;             // số mẫu mỗi chu kỳ để tính dạng sóng
const T_AMB = 35;          // nhiệt độ trong thân robot (°C)
const TRIM_VMIN = 1.25, TRIM_VMAX = 32, TRIM_TURNS = 25;   // trimmer 3296W: 25 vòng phủ dải 1.25–32 V (manifest boards)

// Node GLB có gốc toạ độ ở gốc mô hình (không ở tâm chi tiết) → fx.pop/fx.smoke(node) sẽ phát ở sai chỗ.
// popTarget: đưa node vào khung mm (mmSpace) rồi bọc trong nhóm đặt đúng TÂM chi tiết → fx.pop(nhóm) bay & toé lửa đúng chỗ.
function popTarget(THREE, c, key) {
  const n = c.mmSpace(key);
  if (!n) return null;
  const P = n.parent;
  n.updateWorldMatrix(true, true);
  const ctr = P.worldToLocal(new THREE.Box3().setFromObject(n).getCenter(new THREE.Vector3()));
  const g = new THREE.Group();
  g.name = n.name + '__pop';
  g.position.copy(ctr);
  P.add(g);
  n.position.sub(ctr);
  g.add(n);
  return g;
}


export default {
  id: 'buck-xl4015',
  name: 'Mạch hạ áp buck XL4015',
  category: 'nguon',
  order: 3,
  icon: '🔌',
  summary: 'Biến 12–16.8 V của pin thành 5 V sạch cho PIC & ESP32 với hiệu suất ~90 %. Xem công tắc đóng/cắt 180 000 lần/giây, dòng cuộn cảm hình tam giác, và vì sao tụ khô hay vặn nhầm trimmer có thể giết cả bộ não robot.',
  tags: ['buck', 'XL4015', 'DC-DC', 'hạ áp', 'step-down', 'cuộn cảm', 'Schottky', 'PWM', 'nguồn 5V'],

  params: [
    { id: 'cad', label: '🧊 Mô hình CAD thật (module XL4015 54×23 mm)', type: 'toggle', value: true, hint: 'Tắt = mô hình học tự dựng (bố trí đơn giản hoá để dễ nhìn đường dòng điện).' },
    { id: 'vin', label: 'Điện áp vào (pin 4S)', type: 'range', min: 8, max: 20, step: 0.1, value: 16.8, unit: 'V', hint: 'Pin 4S: 16.8 V đầy → 12.0 V cạn. XL4015 chịu tới 36 V.' },
    { id: 'vset', label: 'Vout cài bằng trimmer', type: 'range', min: 1.25, max: 18, step: 0.05, value: 5.0, unit: 'V' },
    { id: 'io', label: 'Dòng tải 5 V', type: 'range', min: 0.02, max: 5, step: 0.01, value: 1.2, unit: 'A', hint: 'PIC + cảm biến ~0.15 A, ESP32-S3 BLE ~0.1–0.3 A, lidar sau này ~0.5–1 A.' },
    { id: 'L', label: 'Cuộn cảm L', type: 'select', value: '47', options: [['10', '10 µH (nhỏ quá)'], ['22', '22 µH'], ['47', '47 µH (gốc của module)'], ['100', '100 µH']] },
    { id: 'C', label: 'Tụ ra Cout', type: 'select', value: '220', options: [['47', '47 µF'], ['220', '220 µF (gốc)'], ['470', '470 µF'], ['1000', '1000 µF']] },
    { id: 'esr', label: 'Chất lượng tụ ra', type: 'select', value: 'cheap', options: [['lowesr', 'Low-ESR tốt (30 mΩ)'], ['cheap', 'Tụ hóa thường (150 mΩ)'], ['dried', 'Tụ đã khô/phồng (1.5 Ω)']] },
    { id: 'flow', label: 'Hiện đường đi của dòng điện', type: 'toggle', value: true },
  ],
  readouts: [
    { id: 'd', label: 'Hệ số chu kỳ D = t_on / T', unit: '%' },
    { id: 'vout', label: 'Vout trung bình', unit: 'V' },
    { id: 'dil', label: 'Gợn dòng cuộn cảm ΔI_L', unit: 'A' },
    { id: 'rip', label: 'Gợn áp ra (đỉnh-đỉnh)', unit: 'mV' },
    { id: 'mode', label: 'Chế độ dẫn', unit: '' },
    { id: 'eff', label: 'Hiệu suất η', unit: '%' },
    { id: 'loss', label: 'Tổn hao (IC / diode / L)', unit: 'W' },
    { id: 'temp', label: 'Nhiệt IC / diode', unit: '°C' },
    { id: 'iin', label: 'Dòng lấy từ pin', unit: 'A' },
  ],
  scope: {
    window: 3,
    note: '(đã làm chậm 180 000×: 1 chu kỳ 5.6 µs hiển thị thành 1 s)',
    channels: [
      { name: 'Nút SW', unit: 'V', min: -2, max: 21, color: '#ffd34d' },
      { name: 'Dòng I_L', unit: 'A', min: 0, max: 8, color: '#4cc2ff' },
      { name: 'Gợn Vout (AC)', unit: 'mV', min: -200, max: 200, color: '#ff6b9a' },
    ],
  },

  info: {
    overview: `
      <p>Buck (mạch hạ áp kiểu đóng cắt) giống <b>người bấm vòi nước rất nhanh</b>: một công tắc bán dẫn đóng/mở 180 000 lần mỗi giây, cuộn cảm và tụ điện "làm phẳng" các xung thành điện áp một chiều thấp hơn. Khác với IC ổn áp tuyến tính 7805 (đốt phần thừa thành nhiệt), buck chỉ tốn ~10 % năng lượng.</p>
      <p>Trong robot: pin 4S 12–16.8 V → <b>XL4015 → 5 V</b> cho PIC16F877A, ESP32-S3 (qua LDO 3.3 V của board), encoder, cảm biến chống rơi, BSS138.</p>
      <p>Thử: kéo <b>Dòng tải</b> xuống 0.05 A để thấy dòng cuộn cảm chạm 0 (chế độ DCM). Đổi <b>tụ ra</b> sang "đã khô" và nhìn gợn Vout. Kéo <b>Vin</b> xuống 5.5 V để thấy buck "hết đường" (D = 100 %).</p>`,
    specs: [
      ['IC', 'XL4015E1 (XLSEMI), vỏ TO-263-5, công tắc nội + mạch PWM'],
      ['Điện áp vào', '8–36 V (tuyệt đối tối đa 40 V)'],
      ['Điện áp ra', '1.25–32 V chỉnh bằng trimmer; VFB = 1.25 V'],
      ['Dòng ra', 'Tối đa 5 A (thực tế ≤ 3 A nếu không tản nhiệt)'],
      ['Tần số đóng cắt', '180 kHz cố định (giảm còn ~48 kHz khi đoản mạch)'],
      ['Hiệu suất', '~88–92 % khi 16.8 V → 5 V, 1–2 A; tới 96 % khi Vout cao'],
      ['Linh kiện ngoài', 'Cuộn cảm 47 µH · Schottky SS54 (5 A, 40 V) · tụ 220 µF vào/ra · trimmer 3296 10 kΩ'],
      ['Module', '≈ 51 × 26 × 14 mm, pad IN+/IN−/OUT+/OUT−'],
    ],
    principle: `
      <h4>1. Hai pha của một chu kỳ T = 1/f = 5.6 µs</h4>
      <ul>
        <li><b>ON</b> (thời gian D·T): công tắc đóng, nút SW ≈ Vin. Cuộn cảm chịu <code>Vin − Vout</code> → dòng tăng tuyến tính với độ dốc <code>(Vin − Vout)/L</code>.</li>
        <li><b>OFF</b> ((1−D)·T): công tắc mở; cuộn cảm "không chịu" mất dòng nên tự đảo áp, kéo dòng qua <b>diode Schottky</b> từ GND → nút SW ≈ −0.45 V; dòng giảm với độ dốc <code>Vout/L</code>.</li>
      </ul>
      <h4>2. Cân bằng vôn-giây → Vout = D·Vin</h4>
      <p>Ở trạng thái ổn định, dòng tăng bao nhiêu thì phải giảm bấy nhiêu: <code>(Vin − Vout)·D = Vout·(1 − D)</code> ⇒ <code>Vout = D·Vin</code>. 16.8 V → 5 V cần D ≈ 30 % (thực tế hơi lớn hơn vì sụt áp diode & công tắc: <code>D = (Vo + Vf)/(Vin − I·Rds + Vf)</code>).</p>
      <h4>3. Gợn dòng & gợn áp</h4>
      <p><code>ΔI_L = (Vin − Vout)·D / (L·f)</code> — 47 µH: ≈ 0.4 A. L nhỏ → ΔI lớn. Nếu dòng tải &lt; ΔI/2, dòng cuộn cảm chạm 0 → <b>DCM</b> (dẫn gián đoạn), nút SW "rung" quanh Vout.</p>
      <p>Gợn áp ra: <code>ΔV ≈ ΔI/(8·f·C) + ΔI·ESR</code>. Với 220 µF: phần tụ chỉ ~1 mV, phần <b>ESR</b> (điện trở nối tiếp tương đương) 0.15 Ω → 60 mV! ⇒ chất lượng tụ quan trọng hơn số µF.</p>
      <h4>4. Hồi tiếp: trimmer đặt Vout</h4>
      <p>IC so điện áp chân FB với 1.25 V: <code>Vout = 1.25 × (1 + R_trên/R_dưới)</code>. 5 V cần R_trên/R_dưới = 3 (vd 3 kΩ / 1 kΩ). Vặn trimmer = đổi R_trên.</p>
      <h4>5. Tổn hao</h4>
      <p>Diode: <code>Vf·Io·(1−D)</code> (lớn nhất khi Vout thấp!) · công tắc: <code>D·I²·Rds</code> + <code>½·Vin·Io·(tr+tf)·f</code> · cuộn cảm: <code>I²·DCR</code>. η = Pout / (Pout + tổn hao).</p>`,
    inRobot: `
      <ul>
        <li>Theo <code>docs/01</code> mục Nguồn: pin → cầu chì 10 A → công tắc → <b>Buck XL4015 → 5V/3A (LOGIC)</b>: PIC (tụ 100 nF mỗi cặp VDD/VSS), encoder Hall, cliff IR, BSS138 phía HV, ESP32-S3 chân 5V, sau này lidar LDS02RR (~1 A đỉnh).</li>
        <li><b>Quy tắc 3:</b> "Không lấy 5V từ driver động cơ cho logic. Logic phải có buck riêng." Động cơ khởi động kéo 2–10 A, chổi than phóng nhiễu; nếu chung đường 5 V, áp tụt dưới 4 V vài ms là PIC reset (BOR), ESP32 báo "Brownout detector was triggered".</li>
        <li>Tổng tải logic thực tế ~0.4–0.6 A → XL4015 chạy mát, hiệu suất ~88 %. Dư dòng cho lidar.</li>
        <li>Đặt module xa động cơ, dây vào/ra ngắn, thêm tụ 470 µF + 100 nF ngay tại đầu vào bo PIC/ESP32.</li>
      </ul>`,
    mistakes: `
      <ul>
        <li>Nối tải trước rồi mới chỉnh trimmer — module mới thường đang để ở 12–20 V ra! Luôn chỉnh không tải bằng đồng hồ trước.</li>
        <li>Trimmer bị rung xoay dần → Vout trôi. Chấm sơn móng tay/keo khóa ren sau khi chỉnh.</li>
        <li>Đấu ngược IN+/IN− → IC nổ (không có chống ngược cực).</li>
        <li>Đo "5.00 V" lúc không tải rồi yên tâm — phải đo lại khi có tải và xem gợn bằng máy hiện sóng (AC, 20 MHz BW).</li>
        <li>Nhầm IN và OUT (cấp pin vào OUT) → dòng ngược qua diode thân, hỏng IC.</li>
        <li>Dây vào dài và mảnh, không có tụ tại đầu vào → gai áp khi đóng cắt, nhiễu lan ra cả robot.</li>
      </ul>`,
    quiz: [
      { q: 'Vin = 16.8 V, muốn Vout = 5 V. D lý tưởng bao nhiêu? Khi pin xuống 12 V thì D thay đổi thế nào?', a: 'D = 5/16.8 ≈ 29.8 %. Pin 12 V → D = 5/12 ≈ 41.7 %: IC tự tăng D để giữ Vout = 5 V.' },
      { q: 'L = 47 µH, f = 180 kHz, Vin = 16.8 V, Vout = 5 V. Tính ΔI_L. Với tải 0.15 A, mạch ở CCM hay DCM?', a: 'ΔI = (16.8−5)·0.298/(47e-6·180e3) ≈ 0.42 A. Tải 0.15 A < ΔI/2 = 0.21 A → DCM.' },
      { q: 'Tụ ra 220 µF có ESR 0.15 Ω, ΔI = 0.4 A. Gợn áp chủ yếu do đâu, bao nhiêu?', a: 'Do ESR: 0.4 × 0.15 = 60 mV (phần tụ ΔI/(8fC) ≈ 1.3 mV, rất nhỏ).' },
    ],
  },

  steps: [
    { title: 'Bước 1 — Nhận diện module', text: 'Pad <b>IN+ / IN−</b> (bên tụ vào, gần IC) và <b>OUT+ / OUT−</b> (bên tụ ra, gần trimmer). IC XL4015 hàn mặt lưng xuống đồng để tản nhiệt. Cuộn cảm xuyến 47 µH, diode SS54 (vạch trắng = catốt, nối nút SW). Kiểm tra mắt: tụ không phồng, mối hàn không nứt.' },
    { title: 'Bước 2 — Hàn dây vào (CHƯA nối tải)', text: 'Dây silicone 20–22 AWG: đỏ vào IN+, đen vào IN−, lấy sau cầu chì & công tắc chính. Kiểm tra cực tính bằng đồng hồ <b>trước</b> khi bật nguồn. Dây ngắn, xoắn đôi để giảm nhiễu.' },
    { title: 'Bước 3 — Chỉnh 5.05 V khi KHÔNG tải', text: 'Bật nguồn, đo OUT+/OUT− bằng đồng hồ. Trimmer 3296 là loại nhiều vòng (25 vòng): vặn từ từ bằng tua vít dẹt nhỏ; module thường giảm áp khi vặn ngược chiều kim đồng hồ — nhưng hãy <b>đo</b> để biết chiều. Đặt 5.05 V (bù sụt áp dây). Trimmer đang sáng = chỗ cần vặn.' },
    { title: 'Bước 4 — Nối tải 5 V, thử tải giả', text: 'Tắt nguồn, hàn dây OUT tới bo logic (PIC + ESP32). Lần đầu nên thử với điện trở công suất 10 Ω/5 W (0.5 A) thay cho bo thật. Đo lại Vout khi có tải (≥ 4.95 V), sờ IC/diode sau 5 phút (&lt; 60 °C).' },
    { title: 'Bước 5 — Khóa trimmer & cố định', text: 'Chấm sơn móng tay/keo lên vít trimmer chống rung. Dán module bằng băng keo 2 mặt cách điện hoặc bắt vít M3 qua cột nhựa, xa động cơ & quạt; tránh để mặt dưới (có đường đồng) chạm khung kim loại.' },
  ],

  faults: [
    { id: 'nguoc-cuc', label: 'Đấu ngược IN+ / IN−', severity: 'no',
      what: '<p>"Bụp" ngay khi bật công tắc: IC XL4015 nứt vỏ, có khói và mùi khét; tụ vào phồng. Cầu chì 10 A đứt (nếu có), hoặc BMS ngắt.</p>',
      why: '<p>XL4015 không có chống ngược cực. Đặt −16.8 V lên chân VIN: diode thân của công tắc nội và diode bảo vệ ESD dẫn thuận → gần như đoản mạch pin qua die silicon. Dòng chỉ bị hạn bởi điện trở pin + dây (~0.1 Ω) → hàng trăm ampe trong vài trăm µs trước khi BMS/cầu chì ngắt — đủ làm bốc hơi mối dây bond trong IC. Tụ hóa 220 µF chịu áp ngược → sinh khí.</p>',
      fix: '<p>Diode Schottky nối tiếp (mất ~0.4 V) hoặc P-MOSFET chống ngược cực ở đầu vào; đầu nối có khóa chiều; đánh dấu đỏ/đen; đo bằng đồng hồ trước khi cấp điện lần đầu.</p>' },
    { id: 'trimmer-max', label: 'Trimmer để ở mức cao khi đã nối PIC/ESP32', severity: 'chay',
      what: '<p>Bật nguồn: LED trên bo logic sáng chói rồi tắt, PIC nóng bỏng, có khói từ IC ổn áp 3.3 V của ESP32 và từ chip PIC. Đo OUT thấy ~16 V.</p>',
      why: '<p>Khi Vout đặt cao hơn Vin, IC chạy D = 100 % → <code>Vout ≈ Vin − I·(Rds + DCR) ≈ 16 V</code>. PIC16F877A tuyệt đối tối đa VDD = 7.5 V; cảm biến 5 V, BSS138 phía HV cũng vượt mức. LDO 3.3 V trên board ESP32 phải đốt <code>(16 − 3.3) × 0.2 A ≈ 2.5 W</code> → quá nhiệt.</p>',
      fix: '<p>Chỉnh Vout KHÔNG tải trước; thêm diode TVS/zener 5.6 V + cầu chì PTC 1 A ở đầu ra làm "bảo hiểm"; khóa trimmer bằng sơn.</p>' },
    { id: 'chap-ra', label: 'Chập đầu ra OUT+ / OUT−', severity: 'nhe',
      what: '<p>Vout về 0, module kêu "rít" nhẹ, diode SS54 và cuộn cảm nóng lên nhanh. Gỡ chập ra là chạy lại bình thường (nếu không kéo dài).</p>',
      why: '<p>XL4015 có giới hạn dòng đỉnh và giảm tần số còn ~48 kHz khi FB về 0. Dòng ngắn mạch ~6–8 A chủ yếu chạy qua diode trong pha OFF: <code>P = 0.5 V × 7 A ≈ 3.5 W</code> trên vỏ SMC nhỏ → &gt; 150 °C sau vài chục giây; IC có bảo vệ quá nhiệt, diode thì không.</p>',
      fix: '<p>Cầu chì PTC sau đầu ra, bọc co nhiệt đầu dây, đo dây tải bằng thang Ω trước khi cấp điện.</p>' },
    { id: 'tu-kho', label: 'Tụ ra đã khô (ESR 1.5 Ω)', severity: 'loi',
      what: '<p>Vout trung bình vẫn ~5 V trên đồng hồ, nhưng ESP32 thỉnh thoảng reset, ADC của PIC nhảy lung tung, encoder đếm sai.</p>',
      why: '<p>Tụ hóa rẻ để gần chỗ nóng sẽ bay hơi điện phân → ESR tăng gấp 10 lần. Gợn áp <code>ΔI·ESR = 0.4 A × 1.5 Ω ≈ 600 mV</code> đỉnh-đỉnh ở 180 kHz → logic thấy 4.7–5.3 V răng cưa, gai nhiễu vào ADC (Vref = VDD) và vào nguồn RF của ESP32.</p>',
      fix: '<p>Dùng tụ low-ESR 105 °C hoặc ghép song song tụ gốm 22 µF. Đo gợn bằng máy hiện sóng (AC coupling, giới hạn băng thông 20 MHz, lò xo đất ngắn).</p>' },
    { id: 'chung-dong-co', label: 'Cấp động cơ chổi cạnh từ chung đường 5 V logic', severity: 'loi',
      what: '<p>Mỗi lần chổi cạnh bật, robot "khựng": PIC reset (LED nháy lại từ đầu), ESP32 in "Brownout detector was triggered" và mất kết nối BLE.</p>',
      why: '<p>Động cơ đứng yên có dòng khởi động <code>I = V/R</code> ≈ 3 A trong vài ms + gai nhiễu chổi than. Buck không kịp đáp ứng (vòng hồi tiếp ~10–50 µs và giới hạn dòng) → Vout tụt dưới 4 V. PIC16F877A có BOR ~4.0 V, ESP32-S3 brownout ~2.7 V sau LDO.</p>',
      fix: '<p>Đúng như docs/01: động cơ lấy từ VBAT qua MOSFET/driver, logic có buck riêng; tụ 1000 µF ở đầu driver; diode SS34 ngược song song động cơ; chung GND hình sao.</p>' },
  ],

  build(ctx) {
    const { THREE, MAT, geom, label, readout, fx } = ctx;
    const { mesh, group, part, cyl, box, pcb, wire, arrow } = geom;
    const root = new THREE.Group();
    const W = 51, D = 26.3;
    const board = pcb(W, D, { mat: MAT.pcbBlue });
    root.add(board);
    const procLabels = new THREE.Group();     // nhãn của mô hình học (ẩn khi xem CAD — CAD có nhãn riêng đúng vị trí)
    root.add(procLabels);

    // ---------- pad vào/ra ----------
    const pads = {};
    [['IN+', -22.5, -7], ['IN−', -22.5, 7], ['OUT+', 22.5, -7], ['OUT−', 22.5, 7]].forEach(([n, x, z]) => {
      const pd = mesh(box(4, 0.3, 4.5), MAT.tin, { x, y: 0.15, z });
      pads[n] = pd;
      root.add(part(pd, `Pad ${n}`, n.startsWith('IN') ? 'Đầu vào từ pin 4S (sau cầu chì + công tắc). Không có chống ngược cực!' : 'Đầu ra 5 V tới bo logic. Chỉnh trimmer trước khi nối tải.'));
    });

    // ---------- tụ hóa ----------
    const mkCap = (x, z, name, desc) => {
      const g = new THREE.Group();
      g.add(mesh(cyl(4, 4, 11, 32), MAT.plasticBlack, { y: 5.5 }));
      g.add(mesh(cyl(3.7, 3.7, 0.3, 32), MAT.aluminum, { y: 11.1 }));
      g.add(mesh(box(1, 11.05, 1.6), MAT.plasticGrey, { x: -3.6, y: 5.5 }));
      g.position.set(x, 0, z);
      root.add(part(g, name, desc));
      return g;
    };
    const capIn = mkCap(-15, 6.5, 'Tụ vào 220 µF / 50 V', 'Cấp dòng xung cho công tắc mỗi lần đóng (dòng vào là xung chữ nhật). Không có nó, dây pin dài sẽ "rung" và gây gai áp. Vạch xám = cực âm.');
    const capOut = mkCap(15, 6.5, 'Tụ ra 220 µF / 35 V', 'Làm phẳng gợn dòng tam giác thành điện áp DC. Gợn áp ≈ ΔI·ESR — ESR mới là thứ quan trọng.');

    // ---------- IC XL4015 TO-263-5 ----------
    const icG = new THREE.Group();
    icG.position.set(-7, 0, -5);
    const icBody = mesh(box(10, 4.4, 9.2, 0.3), MAT.icBody.clone(), { y: 2.2 });
    icG.add(icBody);
    icG.add(mesh(box(10.6, 0.5, 3), MAT.tin, { y: 0.25, z: -5.8 }));
    for (let k = 0; k < 5; k++) icG.add(mesh(box(0.8, 0.5, 3), MAT.tin, { x: -3.4 + k * 1.7, y: 0.6, z: 5.8 }));
    root.add(part(icG, 'IC XL4015E1 (TO-263-5)', 'Bên trong: công tắc công suất, bộ dao động 180 kHz, so sánh FB với 1.25 V, giới hạn dòng & quá nhiệt. Mặt lưng hàn xuống mảng đồng để tản nhiệt. Chân: 1 GND, 2 FB, 3 SW, 4 VC, 5 VIN.'));
    label(procLabels, 'XL4015', [-7, 7, -5]);

    // ---------- diode Schottky SS54 (SMC) ----------
    const diode = new THREE.Group();
    diode.position.set(2.5, 0, -6.5);
    const dBody = mesh(box(7, 2.3, 6, 0.2), MAT.icBody.clone(), { y: 1.15 });
    diode.add(dBody);
    diode.add(mesh(box(1, 2.32, 6.02), MAT.silkscreen, { x: -2.6, y: 1.15 }));
    diode.add(mesh(box(1.5, 0.3, 3), MAT.tin, { x: -4, y: 0.15 }), mesh(box(1.5, 0.3, 3), MAT.tin, { x: 4, y: 0.15 }));
    root.add(part(diode, 'Diode Schottky SS54 (5 A, 40 V)', 'Dẫn dòng cuộn cảm trong pha OFF (kẹp nút SW ở −0.45 V). Schottky vì sụt áp thấp và chuyển mạch cực nhanh. Vạch trắng = catốt (nối SW).'));

    // ---------- cuộn cảm xuyến 47 µH ----------
    const ind = new THREE.Group();
    ind.position.set(5, 4, 5.5);
    const core = mesh(new THREE.TorusGeometry(5.5, 2.6, 16, 40), MAT.plasticYellow.clone(), { rx: Math.PI / 2 });
    ind.add(core);
    const winding = new THREE.Group();
    for (let k = 0; k < 22; k++) {
      const a = (k / 22) * Math.PI * 2;
      const ring = mesh(new THREE.TorusGeometry(2.85, 0.42, 6, 14), MAT.copper.clone(), { x: Math.cos(a) * 5.5, z: Math.sin(a) * 5.5, ry: -a });
      winding.add(ring);
    }
    ind.add(winding);
    root.add(part(ind, 'Cuộn cảm xuyến 47 µH (lõi bột sắt)', 'Tích năng lượng từ trường trong pha ON (E = ½·L·I²), nhả ra trong pha OFF. Dòng qua nó hình tam giác: không thể thay đổi đột ngột. Lõi bột sắt vàng-trắng, dây đồng Ø1 mm.'));
    label(procLabels, 'Cuộn cảm 47 µH', [5, 12, 5.5]);

    // ---------- trimmer 3296W + điện trở hồi tiếp ----------
    const trim = new THREE.Group();
    trim.position.set(14, 0, -7);
    const trimBody = mesh(box(9.5, 10, 4.8, 0.3), MAT.plasticBlue.clone(), { y: 5 });
    trim.add(trimBody);
    trim.add(mesh(cyl(1.2, 1.2, 1, 16), MAT.brass, { x: -3.2, y: 10.4 }));
    const glue = mesh(new THREE.SphereGeometry(1.4, 12, 8), MAT.plasticRed, { x: -3.2, y: 10.8 });
    glue.visible = false;
    trim.add(glue);
    root.add(part(trim, 'Trimmer 3296W 10 kΩ (25 vòng)', 'Điện trở chỉnh nhiều vòng = R_trên của bộ chia hồi tiếp: Vout = 1.25 × (1 + R_trên/R_dưới). Vít đồng ở góc. Chấm keo đỏ = đã khóa.'));
    const rfb = group(mesh(box(2, 0.6, 1.25), MAT.icBody, { x: 7, y: 0.3, z: -11 }), mesh(box(1.6, 0.8, 0.8), MAT.plasticYellow, { x: 3.5, y: 0.4, z: -11 }));
    root.add(part(rfb, 'Điện trở hồi tiếp 1 kΩ + tụ bù', 'R_dưới của bộ chia FB và tụ gốm nhỏ ổn định vòng điều khiển.'));
    const ledMat = new THREE.MeshStandardMaterial({ color: 0x551111, emissive: 0xff2020, emissiveIntensity: 1 });
    const led = mesh(box(1.6, 0.7, 0.8), ledMat, { x: 20, y: 0.35, z: -1 });
    root.add(part(led, 'LED nguồn (đỏ)', 'Báo có điện đầu ra — sáng = Vout > ~2 V.'));
    label(procLabels, 'Trimmer', [14, 13, -7]);

    // ---------- dây vào/ra ----------
    const wiresIn = group(
      wire([[-22.5, 0.6, -7], [-30, 3, -7], [-45, 2, -8]], { radius: 0.8, color: 0xd23b3b }),
      wire([[-22.5, 0.6, 7], [-30, 3, 7], [-45, 2, 8]], { radius: 0.8, color: 0x111111 }));
    root.add(part(wiresIn, 'Dây vào từ pin 4S (12–16.8 V)', 'Đỏ = IN+, đen = IN−. Lấy SAU cầu chì 10 A và công tắc chính.'));
    label(root, 'Pin 4S 16.8 V', [-44, 5, 0]);
    // tải logic 5 V (bo PIC + ESP32 thu nhỏ)
    const loadG = new THREE.Group();
    loadG.position.set(48, 0, 0);
    loadG.add(pcb(34, 26, { mat: MAT.pcbGreen }));
    const picStub = mesh(box(20, 3.6, 7), MAT.icBody.clone(), { x: -4, y: 2.6, z: -5 });
    const espStub = mesh(box(12, 3, 9), MAT.steel.clone(), { x: 9, y: 2.3, z: 6 });
    loadG.add(picStub, espStub);
    const wiresOut = group(
      wire([[22.5, 0.6, -7], [28, 3, -7], [31, 2, -7]], { radius: 0.6, color: 0xd23b3b }),
      wire([[22.5, 0.6, 7], [28, 3, 7], [31, 2, 7]], { radius: 0.6, color: 0x111111 }));
    root.add(part(wiresOut, 'Dây ra 5 V', 'Tới bo logic: PIC VDD, ESP32 chân 5V, cảm biến.'));
    root.add(part(loadG, 'Bo logic 5 V (PIC + ESP32) — tải', 'Đại diện cho phần "bộ não" robot ăn 5 V. Quá 7.5 V là PIC chết; gợn áp lớn làm ESP32 reset.'));
    label(root, 'Bo logic 5 V', [48, 8, 0]);

    // ---------- mũi tên dòng điện ----------
    const onFlow = new THREE.Group(), offFlow = new THREE.Group();
    const Y = 14;
    onFlow.add(arrow([-22, Y, -7], [-9, Y, -5], 0xffd34d, 2.5), arrow([-6, Y, -4], [3, Y, 4], 0xffd34d, 2.5), arrow([7, Y, 5], [21, Y, -5], 0xffd34d, 2.5));
    offFlow.add(arrow([2, Y, -9], [3, Y, 2], 0x4cc2ff, 2.5), arrow([7, Y, 5], [21, Y, -5], 0x4cc2ff, 2.5), arrow([21, Y - 2, 7], [3, Y - 2, -9], 0x4cc2ff, 2.5));
    root.add(onFlow, offFlow);

    // ---------- MÔ HÌNH CAD THẬT: module XL4015 54 × 23 mm (khung GLB: Y lên, mặt dưới PCB ở y = 0) ----------
    // Đặt mặt trên PCB ở y = 0 như mô hình học; IN ở −X, OUT ở +X, IN+/OUT+ ở phía −Z — trùng bố trí dây.
    const procBoard = [board, ...Object.values(pads), capIn, capOut, icG, diode, ind, trim, rfb, led, procLabels];
    let aC1 = null, aD1 = null, cadKnob = null, cadMark = null, cadIc = null, cadIcBody = null, cadDiode = null, cadCore = [], cadWinding = null, cadLed = null, cadTrimBody = null, cadCapTop = null;
    const cad = cadAttach(ctx, root, 'boards/xl4015-module', {
      onBottom: false, offset: [0, -1.6, 0],
      hide: procBoard,
      partDefault: ['Module hạ áp XL4015 (CAD thật)', 'Mô hình CAD đúng kích thước module bán ngoài chợ: 54 × 23 mm, cao 18,5 mm (tính cả cuộn cảm).'],
      parts: {
        pcb: ['Bo mạch in FR-4 hai lớp', 'Tấm 54 × 23 × 1,6 mm. Mảng đồng lớn dưới IC vừa dẫn điện vừa làm tấm tản nhiệt. 2 lỗ M3 để bắt vít lên cột nhựa.'],
        U1_XL4015: ['IC XL4015E1 (TO-263-5)', 'Bên trong: công tắc công suất, dao động 180 kHz, so sánh FB với 1,25 V, giới hạn dòng & quá nhiệt. Tab kim loại hàn xuống đồng để tản nhiệt. Chân: 1 GND, 2 FB, 3 SW, 4 VC, 5 VIN.'],
        U1_marking: ['Chữ in trên IC', 'Dòng chữ "XL4015E1" + mã lô — kiểm tra kỹ, hàng nhái hay ghi sai hoặc mờ.'],
        L1_47uH: ['Cuộn cảm xuyến 47 µH (lõi bột sắt)', 'Tích năng lượng từ trường khi công tắc đóng (E = ½·L·I²), nhả ra khi công tắc mở. Dây đồng phát sáng theo dòng tam giác I_L; lõi nóng khi quá tải.'],
        L1_leads: ['Chân cuộn cảm', 'Một đầu nối nút SW (IC + diode), đầu kia nối tụ ra / OUT+.'],
        C1_in_220uF: ['Tụ vào 220 µF / 50 V', 'Cấp dòng xung cho công tắc mỗi lần đóng. Vạch xám trên vỏ = cực âm. Đấu ngược cực pin là tụ này phồng đầu tiên.'],
        C2_out_220uF: ['Tụ ra 220 µF / 35 V', 'Làm phẳng gợn dòng tam giác thành điện áp DC. Gợn áp ≈ ΔI·ESR — tụ khô thì nắp nhôm phồng lên.'],
        trim_vadj_3296w: ['Trimmer 3296W 10 kΩ (25 vòng)', 'Điện trở chỉnh nhiều vòng = R_trên của bộ chia hồi tiếp: Vout = 1,25 × (1 + R_trên/R_dưới). Vặn vít đồng thau trên đỉnh: 25 vòng mới đi hết dải.'],
        trim_vadj: ['Vít chỉnh trimmer (quay theo Vout)', 'Kéo thanh "Vout cài bằng trimmer" để thấy vít quay: mỗi vòng ≈ 1,2 V. Theo chiều kim đồng hồ = tăng áp.'],
        D1_SS54: ['Diode Schottky SS54 (5 A, 40 V)', 'Dẫn dòng cuộn cảm khi công tắc mở (kẹp nút SW ở −0,45 V). Vạch trắng = catốt (nối SW). Nóng nhất khi chập đầu ra.'],
        led_pwr_pkg: ['LED nguồn (đỏ, 0805)', 'Sáng khi module có điện vào. Đi kèm điện trở hạn dòng R3.'],
        R3_led: ['Điện trở hạn dòng LED', 'Giới hạn dòng LED vài mA.'],
        R1_fb: ['Điện trở hồi tiếp R_dưới', 'Cùng trimmer tạo bộ chia áp đưa về chân FB (so với 1,25 V).'],
        C5: ['Tụ gốm bù vòng hồi tiếp', 'Ổn định vòng điều khiển, chống dao động.'],
        C4: ['Tụ gốm lọc nhiễu đầu ra', 'Song song tụ hoá: lọc gai nhiễu tần số cao mà tụ hoá (ESR, ESL lớn) không lọc được.'],
        silkscreen: ['Chữ in lụa trên PCB', 'Ký hiệu IN+/IN−/OUT+/OUT− — luôn đọc kỹ trước khi hàn dây.'],
      },
      labels: [['XL4015', 'U1_XL4015', [0, 5, 0]], ['Cuộn cảm 47 µH', 'L1_47uH', [0, 10, 0]], ['Trimmer 25 vòng', 'trim_vadj', [0, 4, 0]], ['LED nguồn', 'led_pwr', [0, 3, 0]]],
      onLoad(c) {
        cadIc = popTarget(THREE, c, 'U1_XL4015');             // fx.pop(): văng đúng tỉ lệ mm, từ đúng tâm IC
        const mk = (key) => { const q = c.worldOf(key); if (!q) return null; const o = new THREE.Object3D(); o.position.copy(q); root.add(o); return o; };
        aC1 = mk('C1_in_220uF'); aD1 = mk('D1_SS54');
        cadIcBody = c.node('U1_XL4015/body');
        cadMark = c.node('U1_marking');
        cadKnob = c.pivot('trim_vadj', { axis: [0, 1, 0] });   // manifest: trục Z-up [0,0,1] → GLB +Y
        cadTrimBody = c.node('trim_vadj_body');
        cadDiode = c.node('D1_SS54');
        cadCore = ['L1_47uH/core_top', 'L1_47uH/core_bottom'].map((n) => c.node(n)).filter(Boolean);
        cadWinding = c.node('L1_47uH/winding');
        cadLed = c.node('led_pwr');
        { let top = null; c.node('C2_out_220uF')?.traverse((o) => { if (!top && /^top/.test(o.name)) top = o; }); cadCapTop = top && c.move(top); }   // tên node trùng bị đổi (top_1…)
      },
    });
    // khía vít trimmer (vít trụ tròn nhìn không ra là đang quay) — dựng trong khung mm, gắn theo góc vít
    const knobSlot = new THREE.Group();
    knobSlot.add(mesh(box(2.0, 0.25, 0.35), MAT.plasticBlack, { y: 0 }));
    knobSlot.position.set(-7, 10.3, -10);
    knobSlot.visible = false;
    root.add(knobSlot);
    // chấm keo khoá trimmer (bước 5) trên vít CAD
    const cadGlue = mesh(new THREE.SphereGeometry(1.2, 12, 8), MAT.plasticRed, { x: -7, y: 10.4, z: -10 });
    cadGlue.visible = false;
    root.add(cadGlue);
    // mũi tên dòng điện theo bố trí THẬT của module (IC bên trái, diode phía sau, cuộn cảm giữa)
    const cadOnFlow = new THREE.Group(), cadOffFlow = new THREE.Group();
    const YC = 19;
    cadOnFlow.add(arrow([-24, YC, -9.8], [-11, YC, 2], 0xffd34d, 2.5), arrow([-7, YC, 2.5], [2, YC, 1], 0xffd34d, 2.5), arrow([6.5, YC, 1], [21, YC, -6], 0xffd34d, 2.5));
    cadOffFlow.add(arrow([7.5, YC, 10], [4.5, YC, 3], 0x4cc2ff, 2.5), arrow([6.5, YC, 1], [21, YC, -6], 0x4cc2ff, 2.5), arrow([22, YC - 2, 9], [10, YC - 2, 9.5], 0x4cc2ff, 2.5));
    cadOnFlow.visible = cadOffFlow.visible = false;
    root.add(cadOnFlow, cadOffFlow);
    let knobA = 0, tL = T_AMB;

    // ---------- tính dạng sóng theo tham số (chỉ tính lại khi tham số đổi) ----------
    const wave = { key: '', vsw: new Float32Array(N), il: new Float32Array(N), vr: new Float32Array(N) };
    const res = {};
    function compute(Vin, Vset, Io, Lh, C, ESR, fsw) {
      const key = [Vin, Vset, Io, Lh, C, ESR, fsw].join('|');
      if (key === wave.key) return;
      wave.key = key;
      const T = 1 / fsw;
      let Dc = (Vset + VF) / (Vin - Io * RDS + VF);
      let Vo = Vset, sat = false;
      if (Dc >= 0.98) { Dc = 1; sat = true; Vo = Math.max(0, Vin - Io * (RDS + DCR)); }
      let dI = ((Vin - Vo) * Dc) / (Lh * fsw);
      let mode = 'CCM', D1 = Dc, D2 = 1 - Dc, Ipk, Imin;
      if (sat) { dI = 0; Ipk = Imin = Io; mode = 'D = 100 % (Vin quá thấp)'; }
      else if (Io < dI / 2) {
        mode = 'DCM';
        D1 = Math.sqrt((2 * Lh * fsw * Io * (Vo + VF)) / (Vin * (Vin - Vo)));
        Ipk = ((Vin - Vo) * D1) / (Lh * fsw);
        D2 = Math.min(1 - D1, (Ipk * Lh * fsw) / (Vo + VF));
        Imin = 0; dI = Ipk;
      } else { Ipk = Io + dI / 2; Imin = Io - dI / 2; }
      // dạng sóng
      let vc = 0, sum = 0;
      const vcArr = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const ph = i / N;
        let il, vs;
        if (sat) { il = Io; vs = Vin - Io * RDS; }
        else if (ph < D1) { il = Imin + (Ipk - Imin) * (ph / D1); vs = Vin - il * RDS; }
        else if (ph < D1 + D2) { il = Ipk - (Ipk - Imin) * ((ph - D1) / D2); vs = -VF; }
        else { il = 0; vs = Vo + 1.5 * Math.exp(-(ph - D1 - D2) * 30) * Math.cos((ph - D1 - D2) * 80); }   // DCM: rung LC quanh Vout
        wave.il[i] = il; wave.vsw[i] = vs;
        vc += ((il - Io) / C) * (T / N);
        vcArr[i] = vc; sum += vc;
      }
      const mean = sum / N;
      let vmin = 1e9, vmax = -1e9;
      for (let i = 0; i < N; i++) {
        const v = vcArr[i] - mean + ESR * (wave.il[i] - Io);
        wave.vr[i] = v; vmin = Math.min(vmin, v); vmax = Math.max(vmax, v);
      }
      // tổn hao
      const irms2 = sat ? Io * Io : mode === 'DCM' ? (Ipk * Ipk * (D1 + D2)) / 3 : Io * Io + (dI * dI) / 12;
      const swRms2 = sat ? Io * Io : mode === 'DCM' ? (Ipk * Ipk * D1) / 3 : Dc * (Io * Io + (dI * dI) / 12);
      const pCond = swRms2 * RDS;
      const pSw = sat ? 0 : 0.5 * Vin * Io * T_SWITCH * fsw;
      const pD = sat ? 0 : VF * Io * (mode === 'DCM' ? (D2 * Ipk) / 2 / Math.max(Io, 1e-6) : 1 - Dc);
      const pL = irms2 * DCR;
      const pQ = Vin * IQ;
      const pOut = Vo * Io;
      Object.assign(res, { D: sat ? 1 : D1, Vo, dI: sat ? 0 : dI, rip: (vmax - vmin) * 1000, mode, pIc: pCond + pSw + pQ, pD, pL, pOut,
        eff: (100 * pOut) / (pOut + pCond + pSw + pD + pL + pQ), iin: (pOut + pCond + pSw + pD + pL + pQ) / Vin });
    }

    // ---------- trạng thái ----------
    let fault = null, fT = 0, dead = false, loadDead = false, smokeAcc = 0, step = -1;
    let tIc = T_AMB, tD = T_AMB;

    return {
      object: root,
      setStep(i) { step = i; },
      triggerFault(id) {
        fault = id; fT = 0; smokeAcc = 0;
        if (id === 'nguoc-cuc') {
          dead = true;
          const onCad = cad.active && cadIc;          // đang xem CAD → nổ đúng IC XL4015 thật
          const ic = onCad ? cadIc : icG;
          fx.pop(ic, { force: 25, size: 8 }); fx.flash(ic, { size: 30, color: 0xffe0a0 });
          fx.scorch(onCad ? cadIcBody || cadIc : icBody, 0.6);
          fx.smoke(onCad && aC1 ? aC1 : capIn, { size: 8, duration: 5, color: 0xcccccc });
        }
      },
      resetFault() { fault = null; fT = 0; dead = false; loadDead = false; tIc = tD = tL = T_AMB; },
      update(dt, t, p) {
        fT += dt;
        // ---- tháo lắp ----
        const s = step;
        wiresIn.visible = s < 0 || s >= 1;
        const showLoad = s < 0 || s >= 3;
        loadG.visible = wiresOut.visible = showLoad;
        glue.visible = s < 0 || s >= 4;
        trimBody.material.emissive.setRGB(s === 2 ? 0.3 + 0.3 * Math.sin(t * 6) : 0, s === 2 ? 0.3 + 0.3 * Math.sin(t * 6) : 0, s === 2 ? 0.6 : 0);

        // ---- tham số (có thể bị sự cố ghi đè) ----
        let Vin = p.vin, Vset = p.vset, Io = showLoad ? p.io : 0.005, fsw = F_SW;
        let ESR = { lowesr: 0.03, cheap: 0.15, dried: 1.5 }[p.esr];
        const Lh = Number(p.L) * 1e-6, C = Number(p.C) * 1e-6;
        let dip = 0;
        if (fault === 'trimmer-max') { Vset = 30; Io = loadDead ? 0.01 : 0.35; }
        if (fault === 'tu-kho') ESR = 1.5;
        if (fault === 'chap-ra') { Vset = 0.3; Io = 6.5; fsw = 48e3; }
        if (fault === 'chung-dong-co') {
          // chổi cạnh bật/tắt mỗi 2 s: dòng khởi động 3 A trong ~0.3 s (làm chậm), rồi 0.4 A + nhiễu
          const ph = fT % 2;
          Io = p.io + (ph < 0.3 ? 3 : 0.4);
          dip = ph < 0.3 ? 1.2 * Math.exp(-ph * 8) : 0.15 * Math.sin(t * 90);
        }
        if (dead) { Vin = 0; }
        compute(Math.max(Vin, 0.01), Vset, Math.max(Io, 0.005), Lh, C, ESR, fsw);
        const ph = (t % 1);
        const idx = Math.min(N - 1, Math.floor(ph * N));
        let vsw = dead ? 0 : wave.vsw[idx], il = dead ? 0 : wave.il[idx], vr = dead ? 0 : wave.vr[idx] * 1000;
        let vout = dead ? 0 : res.Vo - dip;
        if (fault === 'chap-ra') vout = 0.05;

        // ---- nhiệt (thời gian thực, hằng số thời gian ~20 s) ----
        const pIc = dead ? 0 : res.pIc, pD = dead ? 0 : res.pD;
        tIc += ((T_AMB + pIc * 40 - tIc) / 20) * dt * (fault ? 4 : 1);
        tD += ((T_AMB + pD * 50 - tD) / 15) * dt * (fault ? 4 : 1);
        tL += ((T_AMB + (dead ? 0 : res.pL) * 45 - tL) / 20) * dt * (fault ? 4 : 1);   // lõi cuộn cảm (≈ 45 K/W)

        // ---- hiệu ứng ----
        const cadOn = cad.sync(p);
        const flowOn = p.flow && !dead && ph < res.D;
        const flowOff = p.flow && !dead && ph >= res.D && (res.mode !== 'DCM' || ph < res.D + 0.5);
        onFlow.visible = !cadOn && flowOn; offFlow.visible = !cadOn && flowOff;
        cadOnFlow.visible = cadOn && flowOn; cadOffFlow.visible = cadOn && flowOff;
        fx.heat(icG, (tIc - 70) / 100);
        fx.heat(diode, (tD - 70) / 100);
        const ilNorm = Math.min(1, il / 6);
        winding.children.forEach((r) => { r.material.emissive.setRGB(ilNorm * 0.5, ilNorm * 0.25, 0); });
        ledMat.emissiveIntensity = vout > 2 ? 1.2 : 0;
        // dây ra/vào bám đúng pad của module CAD (pad thật ở x = ±25,1, z = ±9,8)
        const sh = cadOn ? 1 : 0;
        wiresIn.position.x = -2.6 * sh; wiresOut.position.x = 2.6 * sh;
        wiresIn.children[0].position.z = wiresOut.children[0].position.z = -2.8 * sh;
        wiresIn.children[1].position.z = wiresOut.children[1].position.z = 2.8 * sh;
        // vít trimmer quay theo Vout cài đặt: 25 vòng cho 1,25 → 32 V, chiều kim đồng hồ (nhìn từ trên) = tăng
        const vKnob = Math.max(TRIM_VMIN, Math.min(TRIM_VMAX, fault === 'trimmer-max' ? 30 : p.vset));
        const knobT = -((vKnob - TRIM_VMIN) / (TRIM_VMAX - TRIM_VMIN)) * TRIM_TURNS * 2 * Math.PI;
        knobA += (knobT - knobA) * Math.min(1, dt * 2.5);
        knobSlot.visible = cadOn && !!cadKnob;
        cadGlue.visible = cadOn && s >= 4;            // CAD: chỉ chấm keo ở bước 5 để vẫn thấy vít quay
        if (cadOn) {
          cadKnob?.set(knobA);
          if (cadMark) cadMark.visible = !dead;            // IC đã nổ bay → mất luôn dòng chữ in
          knobSlot.rotation.y = knobA;
          if (cadIcBody) fx.heat(cadIcBody, (tIc - 70) / 100);
          if (cadDiode) fx.heat(cadDiode, (tD - 70) / 100);
          cadCore.forEach((n) => fx.heat(n, (tL - 70) / 100));
          if (cadWinding) cad.glow(cadWinding, 0xff8a1a, ilNorm * 0.9);           // dây đồng sáng theo dòng tam giác I_L
          if (cadLed) { const on = !dead && Vin > 0.5; cad.color(cadLed, on ? 0xc01010 : null); cad.glow(cadLed, 0xff1a1a, on ? 1.1 : 0); }   // LED nguồn: sáng khi có Vin
          if (cadTrimBody) cad.glow(cadTrimBody, 0x2a7bff, s === 2 ? 0.45 + 0.35 * Math.sin(t * 6) : 0);   // bước 3: chỗ cần vặn
          cadCapTop?.set([0, (fault === 'tu-kho' || p.esr === 'dried') ? 0.7 : 0, 0]);                       // tụ khô: nắp nhôm phồng
        }
        if (fault === 'trimmer-max' && fT > 0.6 && !loadDead) {
          loadDead = true;
          fx.smoke(picStub, { size: 10, duration: 6, color: 0xbdbdbd });
          fx.smoke(espStub, { size: 8, duration: 5, color: 0xbdbdbd });
          fx.scorch(picStub, 0.6); fx.sparks(espStub, { count: 25, speed: 25, size: 0.5 });
        }
        if (fault === 'chap-ra' && tD > 120) { smokeAcc += dt; if (smokeAcc > 1.5) { smokeAcc = 0; fx.smoke(cadOn && aD1 ? aD1 : diode, { size: 4, duration: 1.5, color: 0xdddddd }); } }

        // ---- số đo ----
        readout('d', res.D * 100);
        readout('vout', vout);
        readout('dil', res.dI);
        readout('rip', dead ? 0 : res.rip);
        readout('mode', dead ? '💥 IC đã hỏng' : fault === 'chap-ra' ? 'Đoản mạch — giới hạn dòng, 48 kHz' : fault === 'trimmer-max' ? `⚠️ D=100 %: Vout ≈ ${vout.toFixed(1)} V vào bo 5 V!` : fault === 'chung-dong-co' && dip > 0.6 ? '⚠️ Sụt áp do động cơ — PIC BOR reset' : res.mode);
        readout('eff', dead || fault === 'trimmer-max' || fault === 'chap-ra' ? '—' : res.eff);
        readout('loss', dead ? '—' : `${res.pIc.toFixed(2)} / ${res.pD.toFixed(2)} / ${res.pL.toFixed(2)}`);
        readout('temp', `${tIc.toFixed(0)} / ${tD.toFixed(0)}`);
        readout('iin', dead ? 0 : res.iin);
        return [vsw, il, Math.max(-200, Math.min(200, vr))];
      },
    };
  },
};
