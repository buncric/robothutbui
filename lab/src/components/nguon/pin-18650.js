// 🔋 Pin Li-ion 18650 — cắt bổ cuộn điện cực (jelly roll), đường cong OCV theo SOC,
// sụt áp do điện trở trong, C-rate, năng lượng còn lại, nhiệt & an toàn (quá xả / quá sạc / thermal runaway).
// Thông số gần cell INR18650 2500 mAh 20 A (kiểu Samsung 25R / LG HE2) — loại hay dùng để đóng pack 4S cho robot.

import { cadAttach, ownMaterial } from '../../core/cadParts.js';

const CAP_AH = 2.5;        // dung lượng danh định (Ah)
const R0 = 0.020;          // điện trở trong DC ở SOC trung bình (Ω)
const C_TH = 45;           // nhiệt dung cell ≈ 45 g × 1.0 J/(g·K)
const R_TH = 20;           // nhiệt trở cell → không khí tĩnh (K/W)
const T_AMB = 30;          // nhiệt độ môi trường trong robot (°C)
const R_SHORT = 0.005;     // điện trở dây đoản mạch (Ω)
const T_SEP = 130;         // màng ngăn PE chảy (°C)
const T_VENT = 160;        // van an toàn bung, bắt đầu cháy (°C)

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

// Đường cong điện áp hở mạch (OCV) của cell NMC theo SOC (%). Ngoài 0…100 % là vùng nguy hiểm.
const OCV_T = [[-8, 2.0], [0, 3.0], [5, 3.30], [10, 3.45], [20, 3.56], [30, 3.63], [40, 3.69], [50, 3.75],
  [60, 3.83], [70, 3.92], [80, 4.00], [90, 4.09], [100, 4.20], [106, 4.60]];

function ocv(s) {
  if (s <= OCV_T[0][0]) return OCV_T[0][1];
  for (let i = 1; i < OCV_T.length; i++) {
    const [s1, v1] = OCV_T[i];
    if (s <= s1) { const [s0, v0] = OCV_T[i - 1]; return v0 + ((v1 - v0) * (s - s0)) / (s1 - s0); }
  }
  return OCV_T[OCV_T.length - 1][1];
}
// Điện trở trong tăng mạnh khi gần cạn (khuếch tán ion chậm)
const rInt = (s) => R0 * (1 + 0.8 * Math.exp(-Math.max(s, -8) / 10));
// Năng lượng tích lũy E(s) = C·∫OCV ds (Wh), tính sẵn theo bước 1 %
const E_TAB = [];
{ let e = 0; for (let s = 0; s <= 100; s++) { E_TAB.push(e); e += (CAP_AH * (ocv(s) + ocv(s + 1)) / 2) / 100; } E_TAB.push(e); }
const energy = (s) => { const c = Math.max(0, Math.min(100, s)); const k = Math.floor(c); return E_TAB[k] + (E_TAB[k + 1] - E_TAB[k]) * (c - k); };

export default {
  id: 'pin-18650',
  name: 'Pin Li-ion 18650',
  category: 'nguon',
  order: 1,
  icon: '🔋',
  summary: 'Viên pin trụ Ø18 × 65 mm — "viên gạch" để đóng pack 4S cho robot. Cắt bổ xem cuộn điện cực, kéo SOC & dòng tải để thấy điện áp sụt, pin nóng lên và vì sao không bao giờ được xả dưới 2.5 V.',
  tags: ['18650', 'Li-ion', 'lithium', 'pin', 'cell', 'SOC', 'OCV', 'C-rate', 'thermal runaway', 'NMC'],

  params: [
    { id: 'cad', label: '🧊 Mô hình CAD thật (cell INR18650-25R Ø18,33 × 64,85 mm)', type: 'toggle', value: true, hint: 'Tắt = mô hình học tự dựng. Bật "Cắt bổ" để cắt đôi vỏ CAD và nhìn cuộn điện cực bên trong.' },
    { id: 'soc', label: 'Mức sạc SOC (State of Charge)', type: 'range', min: 0, max: 100, step: 1, value: 70, unit: '%', hint: 'Kéo để đặt lại SOC. Khi bật "Cho dòng chạy", SOC tự thay đổi theo dòng.' },
    { id: 'i', label: 'Dòng tải (âm = đang sạc)', type: 'range', min: -2.5, max: 25, step: 0.1, value: 2, unit: 'A', hint: '2 A ≈ robot chạy bình thường; 20 A = giới hạn xả liên tục của cell 25R.' },
    { id: 'run', label: 'Cho dòng chạy thật (SOC & nhiệt thay đổi)', type: 'toggle', value: false },
    { id: 'speed', label: 'Tua nhanh thời gian', type: 'range', min: 1, max: 600, step: 1, value: 60, unit: '×' },
    { id: 'bms', label: 'Có mạch bảo vệ (BMS/PCM)', type: 'toggle', value: true, hint: 'Tắt để xem chuyện gì xảy ra khi pin không được bảo vệ.' },
    { id: 'cut', label: 'Cắt bổ xem bên trong', type: 'toggle', value: true },
    { id: 'ions', label: 'Hiện ion Li⁺ (phóng to 1 lớp)', type: 'toggle', value: true },
    { id: 'reset', label: '↺ Pin mới (nguội, đặt lại SOC)', type: 'button' },
  ],
  readouts: [
    { id: 'ocv', label: 'Điện áp hở mạch OCV', unit: 'V' },
    { id: 'v', label: 'Điện áp 2 cực khi có tải', unit: 'V' },
    { id: 'crate', label: 'Dòng / C-rate', unit: '' },
    { id: 'soc', label: 'SOC hiện tại', unit: '%' },
    { id: 'wh', label: 'Năng lượng còn lại', unit: 'Wh' },
    { id: 'heat', label: 'Nhiệt sinh ra', unit: 'W' },
    { id: 'temp', label: 'Nhiệt độ lõi', unit: '°C' },
    { id: 'state', label: 'Trạng thái', unit: '' },
  ],
  scope: {
    window: 6,
    note: '(thời gian thực × tốc độ tua; dòng hiển thị bị cắt ở 160 A)',
    channels: [
      { name: 'V cực', unit: 'V', min: 0, max: 4.8, color: '#ffd34d' },
      { name: 'Dòng I', unit: 'A', min: -5, max: 30, color: '#4cc2ff' },
      { name: 'Nhiệt độ', unit: '°C', min: 20, max: 200, color: '#ff6b9a' },
    ],
  },

  info: {
    overview: `
      <p><b>18650</b> nghĩa là Ø<b>18</b> mm, dài <b>65</b> mm, vỏ trụ (<b>0</b>). Bên trong là một dải điện cực dài ~60 cm cuộn tròn như cuộn chả giò ("jelly roll"): cực dương phủ oxit kim loại (NMC) trên lá nhôm, cực âm phủ than chì (graphite) trên lá đồng, ngăn cách bằng màng nhựa xốp mỏng 20 µm thấm dung dịch điện phân.</p>
      <p>Pin robot hút bụi phổ biến là <b>4S1P hoặc 4S2P</b> 18650 (4 viên nối tiếp = 14.4 V danh định). Hiểu 1 viên là hiểu cả pack.</p>
      <p>Thử: đặt <b>Dòng tải 20 A</b>, kéo <b>SOC về 5 %</b> — điện áp tụt xuống dưới 2.7 V dù pin "vẫn còn". Rồi bật <b>Cho dòng chạy thật</b>, tắt <b>BMS</b> và xem nhiệt độ leo lên. Cuối cùng thử mục <b>⚠️ Sự cố</b> → "Đoản mạch".</p>`,
    specs: [
      ['Kích thước', 'Ø18.3 × 65.0 mm (đầu dương nhô 0.5–1 mm), nặng ≈ 45 g'],
      ['Hóa học', 'INR = NMC (Ni-Mn-Co) cực dương, than chì cực âm'],
      ['Điện áp danh định', '3.6 V (trung bình khi xả) · đầy 4.20 V · cạn 2.5–3.0 V'],
      ['Dung lượng', '2500 mAh (≈ 9 Wh) — loại "năng lượng" có thể 3000–3500 mAh nhưng dòng thấp'],
      ['Dòng xả liên tục', '20 A (8C) cho 25R; loại 3500 mAh chỉ ~8–10 A'],
      ['Dòng sạc chuẩn', '1.25 A (0.5C), tối đa 4 A; CC/CV 4.20 V ±50 mV'],
      ['Điện trở trong', '≈ 15–25 mΩ (đo AC 1 kHz thấp hơn, DC cao hơn)'],
      ['Nhiệt độ', 'Sạc 0…45 °C · xả −20…60/75 °C — dưới 0 °C KHÔNG được sạc'],
      ['Tuổi thọ', '≈ 300–500 chu kỳ còn 80 % dung lượng (sạc 4.2 V); sạc tới 4.1 V tăng gấp đôi'],
    ],
    principle: `
      <h4>1. Pin là "máy bơm ion"</h4>
      <p>Khi <b>xả</b>, ion Li⁺ rời than chì (cực âm) đi xuyên màng ngăn sang oxit NMC (cực dương); electron không qua được màng nên phải chạy vòng qua mạch ngoài → đó là dòng điện nuôi robot. Khi <b>sạc</b> thì ngược lại. Bật "Hiện ion Li⁺" để xem.</p>
      <h4>2. Mô hình điện đơn giản: nguồn + điện trở</h4>
      <p><code>V_cực = OCV(SOC) − I·R_trong</code>. OCV phụ thuộc mức sạc (đường cong bảng thông số), <code>R_trong ≈ 20 mΩ</code> và tăng mạnh khi gần cạn. Ví dụ SOC 50 %, I = 10 A: <code>3.75 − 10×0.02 = 3.55 V</code>.</p>
      <h4>3. C-rate</h4>
      <p><code>C-rate = I / dung lượng</code>. Pin 2.5 Ah xả 5 A = <b>2C</b> → hết trong ~30 phút. 0.5C = 2 giờ.</p>
      <h4>4. Năng lượng</h4>
      <p><code>E = ∫V·I dt ≈ dung lượng × điện áp trung bình</code> = 2.5 Ah × 3.6 V ≈ <b>9 Wh</b>. Pack 4S1P = 36 Wh, robot tiêu thụ ~25–35 W → chạy ~1 giờ.</p>
      <h4>5. Nhiệt</h4>
      <p>Nhiệt sinh ra <code>P = I²·R</code>: 2 A → 0.08 W (không đáng kể); 20 A → 8 W → cell nóng ~1 °C mỗi 6 s. Mô phỏng dùng <code>C·dT/dt = P − (T − T_môi trường)/R_th</code> với C = 45 J/K, R_th = 20 K/W.</p>
      <h4>6. Vì sao nguy hiểm? (thermal runaway)</h4>
      <ul>
        <li><b>Quá xả &lt; 2.5 V</b>: lá đồng ở cực âm bắt đầu hòa tan; sạc lại thì đồng kết tủa thành gai xuyên màng ngăn → đoản mạch trong.</li>
        <li><b>Quá sạc &gt; 4.3 V</b>: lithium kim loại bám lên than chì (plating), cực dương mất ổn định nhả oxy.</li>
        <li><b>&gt; 130 °C</b>: màng ngăn PE/PP chảy → hai cực chạm nhau → tỏa nhiệt nhiều hơn → nóng hơn nữa = <b>phản ứng dây chuyền</b>. Van an toàn (vent) bật, phun khí cháy. Không dập được bằng cách ngắt điện.</li>
      </ul>
      <div class="tip">Trong nắp dương có tới 3 lớp bảo vệ cơ khí: <b>PTC</b> (điện trở tăng vọt khi nóng), <b>CID</b> (đĩa ngắt dòng khi áp suất trong tăng) và <b>màng vent</b> (xả khí). Cell xả cao (25R, HE2) thường <b>bỏ PTC</b> để không giới hạn dòng. Chúng là lớp cuối cùng — BMS mới là lớp chính.</div>`,
    inRobot: `
      <ul>
        <li>Pack <b>4S</b> (4 cell nối tiếp): 12.0 V (cạn) … 14.4 V (danh định) … 16.8 V (đầy). Xem linh kiện <i>Pack 4S + BMS</i>.</li>
        <li>PIC đo pin qua phân áp 33k/10k vào chân 2 (RA0/AN0). Firmware (<code>firmware/pic16f877a_ccs/config.h</code>): <code>VBAT_LOW_MV 13200</code> (3.30 V/cell → báo yếu) và <code>VBAT_CUT_MV 12400</code> (3.10 V/cell → dừng hết) — cắt sớm hơn BMS (2.7 V) để bảo vệ tuổi thọ pin.</li>
        <li>Robot chạy ~2–3 A trung bình (2 bánh + chổi + quạt 20–30 W) → mỗi cell ~1C với 4S1P, ~0.5C với 4S2P.</li>
        <li>Dòng đỉnh khi quạt hút khởi động/chổi kẹt tóc có thể 8–10 A → chọn cell xả ≥ 10 A (25R, HE2, VTC5…), không dùng cell "năng lượng" rẻ tiền.</li>
        <li>Pack nằm trong hộc pin dưới đáy robot — vít vỏ dài lắp nhầm chỗ có thể <b>đâm thủng cell</b> (xem sự cố).</li>
      </ul>`,
    mistakes: `
      <ul>
        <li>Mua pin "9900 mAh" giá rẻ → thực ra 800–1200 mAh, nội trở cao, sụt áp khi quạt chạy → robot reset.</li>
        <li>Hàn mỏ hàn trực tiếp lên cell → nhiệt làm hỏng gioăng & màng ngăn. Dùng máy hàn bấm điểm (spot welder) với kẽm niken.</li>
        <li>Rách lớp vỏ nhựa PVC ở mép đầu dương → vỏ thép (cực âm) chạm kẽm dương → đoản mạch. Thay vỏ co nhiệt + vòng cách điện giấy.</li>
        <li>Để robot cạn pin nhiều tuần → tự xả xuống dưới 2.5 V → BMS khóa, pin hỏng vĩnh viễn. Cất kho ở ~50 %.</li>
        <li>Ghép cell khác hãng/khác tuổi/khác điện áp trong một pack → mất cân bằng nhanh.</li>
        <li>Sạc khi pin lạnh dưới 0 °C → lithium plating, mất dung lượng không hồi phục.</li>
      </ul>`,
    quiz: [
      { q: 'Cell 2.5 Ah xả 5 A. C-rate bao nhiêu và chạy được khoảng bao lâu?', a: 'C-rate = 5/2.5 = 2C → khoảng 1/2 giờ = 30 phút (thực tế ít hơn chút vì sụt áp).' },
      { q: 'OCV = 3.70 V, R_trong = 20 mΩ, dòng 15 A. Điện áp 2 cực? Nhiệt sinh ra?', a: 'V = 3.70 − 15×0.02 = 3.40 V; P = 15²×0.02 = 4.5 W.' },
      { q: 'Vì sao firmware cắt ở 12.4 V (3.1 V/cell) chứ không đợi tới 10 V (2.5 V/cell)?', a: 'Dưới ~3.3 V gần như không còn năng lượng (đường cong dốc), mà xả sâu làm giảm tuổi thọ & tăng nội trở; dừng sớm vẫn còn dư cho tự xả và cho BMS khỏi khóa.' },
    ],
  },

  steps: [
    { title: 'Bước 1 — Cell hoàn chỉnh: kiểm tra trước khi dùng', text: 'Đo điện áp bằng đồng hồ (cell mới: 3.5–3.7 V; &lt; 2.5 V → bỏ). Đo nội trở bằng máy đo IR 1 kHz (25R: &lt; 20 mΩ). Soi vỏ PVC: không rách, không móp, không gỉ ở đầu âm. Các bước sau là <b>cấu tạo (nhà máy lắp)</b> — <b>tuyệt đối không tự mổ cell</b>: dung dịch điện phân LiPF₆ gặp ẩm sinh HF độc, và có thể đoản mạch gây cháy.' },
    { title: 'Bước 2 — Vỏ co nhiệt PVC + vòng cách điện', text: 'Lớp ngoài cùng chỉ là nhựa co nhiệt 0.1 mm. Khi đóng pack, nếu vỏ rách ở mép đầu dương: thay vỏ co nhiệt 18650 (Ø29 mm phẳng) bằng máy khò ~120 °C, và dán thêm <b>vòng giấy cách điện (fish paper ring)</b> lên đầu dương.' },
    { title: 'Bước 3 — Cụm nắp dương: gioăng, PTC, CID, van vent', text: 'Nhà máy hàn tab nhôm của cuộn điện cực vào đĩa CID, xếp chồng PTC + nắp, rồi <b>dập gân & bẻ mép vỏ</b> ép gioăng PP kín khí. Chú ý: gioăng là thứ cách điện giữa + và −; nhiệt mỏ hàn &gt; 200 °C làm chảy gioăng → rò điện phân.' },
    { title: 'Bước 4 — Vỏ thép mạ niken (cực âm)', text: 'Vỏ thép dập sâu, dày ~0.25 mm. Đáy vỏ được hàn với tab niken của cực âm. Vì cả thân vỏ là cực âm, mọi vật kim loại chạm vỏ và núm dương cùng lúc = đoản mạch 150 A.' },
    { title: 'Bước 5 — Cuộn điện cực (jelly roll)', text: 'Bốn lớp cuộn chung: cực dương (NMC/nhôm) — màng ngăn — cực âm (graphite/đồng) — màng ngăn. Cực âm rộng hơn cực dương ~1 mm mỗi bên, màng ngăn rộng hơn nữa. Sau khi cho vào vỏ, nhà máy bơm ~5 g dung dịch điện phân rồi mới đóng nắp.' },
    { title: 'Bước 6 — Lắp lại & hóa thành (formation)', text: 'Lắp theo thứ tự ngược: cuộn → vỏ → hàn tab âm → bơm điện phân → cụm nắp → dập kín → bọc PVC. Cell mới được sạc/xả chậm lần đầu để tạo lớp SEI bảo vệ trên than chì, rồi phân loại theo dung lượng & nội trở — đó là lý do cell cùng lô ghép pack tốt hơn.' },
  ],

  faults: [
    { id: 'doan-mach', label: 'Đoản mạch 2 cực (dây/đồng xu chạm + và −)', severity: 'chay',
      what: '<p>Tia lửa lóe ở chỗ chạm, dây nối đỏ rực trong vài giây, cell nóng bỏng tay rồi bốc khói trắng ngọt mùi điện phân. Sau ~10–15 s van an toàn bung "xì" và phun lửa như pháo sáng.</p>',
      why: '<p>Dòng chỉ bị giới hạn bởi điện trở trong: <code>I = 3.7 V / (0.020 + 0.005) Ω ≈ 150 A</code>. Nhiệt bên trong <code>P = I²·R = 150² × 0.02 ≈ 450 W</code> → nhiệt dung 45 J/K nóng lên ~10 °C mỗi giây. Tới 130 °C màng ngăn chảy → đoản mạch trong → thermal runaway (~600 °C), không ngắt được nữa. Cell xả cao không có PTC nên không gì hạn dòng.</p>',
      fix: '<p>Luôn có BMS cắt đoản mạch (≈ 200–500 µs), cầu chì 10 A ở dây ra pack, bọc kín các cực, cất cell trong hộp nhựa riêng (không bỏ túi quần với chìa khóa). Nếu cell đã phun lửa: tránh xa, dùng nhiều nước/cát để làm mát xung quanh, không hít khói.</p>' },
    { id: 'dam-thung', label: 'Vít dài đâm thủng cell khi lắp vỏ robot', severity: 'no',
      what: '<p>Khói bốc ngay chỗ vít chọc vào, sau 3–5 s cell phun lửa dữ dội, có thể văng nắp.</p>',
      why: '<p>Vít thép xuyên qua nhiều lớp điện cực → nối tắt cực dương và cực âm ngay bên trong. Toàn bộ năng lượng 9 Wh (~32 kJ) dồn vào một điểm nhỏ → điểm nóng &gt; 200 °C chỉ sau vài giây → màng ngăn chảy lan ra → thermal runaway. BMS bên ngoài không cứu được vì dòng chạy bên trong cell.</p>',
      fix: '<p>Phân loại vít theo vị trí khi mổ robot (khay nhiều ngăn + ảnh chụp); kiểm tra chiều dài trước khi vặn vào cột gần hộc pin; có tấm chắn nhựa/giấy cách điện quanh pack.</p>' },
    { id: 'qua-sac', label: 'Sạc quá áp 4.6 V (không có BMS)', severity: 'hong',
      what: '<p>Cell ấm dần, điện áp vượt 4.3 V, rồi đột ngột về 0 V — cell "chết hẳn". Nếu là cell nhái không có CID: phồng, rò dung dịch, có thể cháy.</p>',
      why: '<p>Trên 4.3 V than chì không nhận thêm Li⁺ → lithium kim loại bám bề mặt (plating), cực dương nhả oxy, điện phân bị oxi hóa sinh khí CO₂. Áp suất trong tăng tới ~1 MPa → đĩa CID phồng lên giật đứt mối hàn = ngắt dòng vĩnh viễn.</p>',
      fix: '<p>Chỉ dùng bộ sạc CC/CV đúng 4.20 V/cell (16.8 V cho 4S) + BMS ngắt ở 4.25–4.30 V. Không sạc pin không có mạch bảo vệ.</p>' },
    { id: 'qua-xa', label: 'Quá xả xuống 2.0 V rồi sạc lại', severity: 'hong',
      what: '<p>Pin để lâu trong robot cạn tới 2.0 V. Khi sạc lại, cell ấm bất thường, giữ điện kém, tự tụt áp sau vài ngày.</p>',
      why: '<p>Dưới ~2.0–2.5 V, điện thế cực âm tăng tới mức lá đồng bị hòa tan thành ion Cu²⁺. Khi sạc lại, đồng kết tủa thành sợi nhánh (dendrite) xuyên màng ngăn → đoản mạch "mềm" bên trong → tự xả + sinh nhiệt khi sạc. Nội trở tăng gấp 2–3 lần.</p>',
      fix: '<p>Firmware cắt ở 12.4 V (3.1 V/cell), BMS cắt ở 2.7 V. Cất kho ở 40–60 %. Cell đã xuống &lt; 2.0 V lâu ngày: bỏ, đừng "cứu".</p>' },
    { id: 'han-thiec', label: 'Hàn mỏ hàn 350 °C trực tiếp lên đầu cell', severity: 'nhe',
      what: '<p>Mùi nhựa cháy, khói nhựa thông; mối hàn bám kém phải giữ mỏ hàn lâu. Vài tuần sau thấy vết muối trắng/rỉ quanh đầu dương.</p>',
      why: '<p>Vỏ thép + niken tản nhiệt rất nhanh nên phải giữ mỏ hàn 5–10 s; nhiệt truyền vào gioăng PP (chảy ở ~160 °C) và đầu cuộn điện cực → rò điện phân, hỏng màng ngăn cục bộ.</p>',
      fix: '<p>Dùng máy hàn bấm điểm (spot welder) + kẽm niken 0.15 mm. Bắt buộc phải hàn thiếc: mỏ hàn công suất lớn (≥ 80 W), mài nhám + flux, chạm &lt; 2 s.</p>' },
  ],

  build(ctx) {
    const { THREE, MAT, geom, label, readout, fx } = ctx;
    const { mesh, group, part, cyl, box, makeCutaway, arrow } = geom;
    const root = new THREE.Group();
    const cell = new THREE.Group();
    root.add(cell);

    // ---------- vỏ ngoài ----------
    const sleeveMat = MAT.plasticBlue.clone();
    sleeveMat.color.set(0x2f8f6a);
    const sleeve = mesh(cyl(9.15, 9.15, 64.2, 64, true), sleeveMat, { y: 32.6 });
    const lipT = mesh(new THREE.TorusGeometry(8.7, 0.45, 8, 48), sleeveMat, { y: 64.7, rx: Math.PI / 2 });
    const lipB = mesh(new THREE.TorusGeometry(8.7, 0.45, 8, 48), sleeveMat, { y: 0.5, rx: Math.PI / 2 });
    const sleeveG = part(group(sleeve, lipT, lipB), 'Vỏ co nhiệt PVC (wrap)', 'Lớp nhựa mỏng 0.1 mm cách điện vỏ thép. Rách lớp này ở mép đầu dương là nguyên nhân đoản mạch hay gặp nhất khi đóng pack.');
    cell.add(sleeveG);
    const can = mesh(cyl(9.0, 9.0, 63.6, 64, true), MAT.steel, { y: 32.2 });
    const bottom = mesh(cyl(9.0, 9.0, 0.35, 64), MAT.steel, { y: 0.2 });
    const bead = mesh(new THREE.TorusGeometry(8.75, 0.45, 8, 48), MAT.steel, { y: 61.8, rx: Math.PI / 2 });
    const canG = part(group(can, bottom, bead), 'Vỏ thép mạ niken = cực ÂM (−)', 'Vỏ dày 0.25 mm nối với lá đồng cực âm. Rãnh thắt (bead) gần đầu giữ cụm nắp. Cả thân vỏ là cực âm — chỉ có núm trên cùng là dương.');
    cell.add(canG);

    // ---------- cụm nắp dương ----------
    const capAsm = new THREE.Group();
    cell.add(capAsm);
    const gasket = mesh(new THREE.TorusGeometry(8.2, 0.65, 10, 48), MAT.rubber, { y: 63.9, rx: Math.PI / 2 });
    capAsm.add(part(gasket, 'Gioăng cách điện (gasket)', 'Vòng nhựa PP kín khí, cách điện nắp dương khỏi vỏ âm và giữ dung dịch điện phân không rò. Chảy ở ~160 °C.'));
    const capPlate = mesh(cyl(7.6, 7.6, 0.45, 48), MAT.zinc, { y: 64.25 });
    const button = mesh(cyl(3.3, 3.6, 1.0, 48), MAT.zinc, { y: 64.95 });
    const capGroup = part(group(capPlate, button), 'Nắp dương (+) có lỗ thoát khí', 'Núm nhô ~0.8 mm là cực DƯƠNG. Xung quanh có lỗ nhỏ để khí thoát ra khi van vent bung.');
    capAsm.add(capGroup);
    const ptc = mesh(cyl(7.0, 7.0, 0.35, 48), MAT.plasticBlack, { y: 63.75 });
    capAsm.add(part(ptc, 'Vòng PTC (cầu chì tự phục hồi)', 'Polyme dẫn điện: nóng lên khi quá dòng → điện trở tăng hàng nghìn lần → hạn dòng. Cell xả cao (25R, HE2) thường KHÔNG có PTC để không giới hạn dòng.'));
    const ventMat = MAT.aluminum.clone();
    const vent = mesh(cyl(7.4, 7.4, 0.3, 48), ventMat, { y: 63.2 });
    const dimple = mesh(cyl(1.6, 2.4, 0.5, 32), ventMat, { y: 62.9 });
    const ventGroup = part(group(vent, dimple), 'Đĩa van an toàn + CID', 'Đĩa nhôm có rãnh khắc. Áp suất khí trong ~1 MPa → đĩa phồng lên, giật đứt mối hàn với lá tab (CID = ngắt dòng vĩnh viễn); áp cao hơn nữa → rách rãnh, xả khí (vent).');
    capAsm.add(ventGroup);

    // ---------- cuộn điện cực (jelly roll) ----------
    const roll = new THREE.Group();
    const cathMat = MAT.plasticGrey.clone(); cathMat.color.set(0x5f6b78); cathMat.metalness = 0.4; cathMat.roughness = 0.5;
    const anodeMat = MAT.copper.clone();
    const sepMat = MAT.plasticWhite.clone();
    const cathG = new THREE.Group(), anodeG = new THREE.Group(), sepG = new THREE.Group();
    let r = 1.9;
    for (let k = 0; k < 7; k++) {
      cathG.add(mesh(cyl(r, r, 55, 40, true), cathMat, { y: 32 })); r += 0.24;
      sepG.add(mesh(cyl(r, r, 58, 40, true), sepMat, { y: 32 })); r += 0.24;
      anodeG.add(mesh(cyl(r, r, 57, 40, true), anodeMat, { y: 32 })); r += 0.24;
      sepG.add(mesh(cyl(r, r, 58, 40, true), sepMat, { y: 32 })); r += 0.24;
    }
    roll.add(part(cathG, 'Cực DƯƠNG (cathode) — NMC trên lá nhôm', 'Lá nhôm 15 µm phủ 2 mặt bột Li(Ni,Mn,Co)O₂ ~60 µm. Đây là nơi "chứa" lithium khi pin cạn.'));
    roll.add(part(anodeG, 'Cực ÂM (anode) — than chì trên lá đồng', 'Lá đồng 10 µm phủ graphite ~60 µm. Khi sạc, Li⁺ chui vào giữa các lớp than chì. Cực âm luôn rộng/dài hơn cực dương một chút để lithium không bám ra mép.'));
    roll.add(part(sepG, 'Màng ngăn (separator) PE/PP 20 µm', 'Màng nhựa xốp thấm dung dịch điện phân: cho ion Li⁺ đi qua nhưng chặn electron. Chảy ở ~130 °C → đoản mạch trong → thermal runaway.'));
    const mandrel = mesh(cyl(1.25, 1.25, 58, 24, true), MAT.steel, { y: 32 });
    roll.add(part(mandrel, 'Ống lõi (center pin)', 'Ống thép rỗng giữa cuộn: giữ hình dạng cuộn và làm đường thoát khí từ đáy lên van khi có sự cố.'));
    const insTop = mesh(cyl(8.5, 8.5, 0.3, 48), sepMat, { y: 61.2 });
    const insBot = mesh(cyl(8.5, 8.5, 0.3, 48), sepMat, { y: 2.6 });
    const tabAl = mesh(box(3, 2.2, 0.15), MAT.aluminum, { x: 4.5, y: 62.1 });
    const tabNi = mesh(box(3, 2.2, 0.15), MAT.zinc, { x: -4.5, y: 1.5 });
    roll.add(part(group(insTop, insBot, tabAl, tabNi), 'Đệm cách điện + lá tab', 'Tab nhôm nối cực dương lên nắp, tab niken nối cực âm xuống đáy vỏ (hàn điểm). Đệm giấy/nhựa ngăn mép cuộn chạm vỏ.'));
    cell.add(roll);

    // ---------- vật gây sự cố (ẩn) ----------
    const screw = new THREE.Group();
    screw.add(mesh(cyl(1.5, 1.5, 22, 16), MAT.zinc, { rz: Math.PI / 2, x: 11 }));
    screw.add(mesh(cyl(2.8, 2.8, 2.0, 24), MAT.zinc, { rz: Math.PI / 2, x: 23 }));
    screw.position.set(0, 30, 0);
    screw.visible = false;
    screw.traverse((o) => (o.userData.noCut = true));
    part(screw, 'Vít PT 3×25 lắp nhầm chỗ', 'Vít dài chọc xuyên vỏ vào cuộn điện cực → đoản mạch bên trong.');
    const iron = new THREE.Group();
    iron.add(mesh(cyl(0.6, 1.6, 8, 16), MAT.copper, { y: 4 }));
    iron.add(mesh(cyl(2.5, 2.5, 30, 16), MAT.steel, { y: 23 }));
    iron.add(mesh(cyl(5, 5, 25, 24), MAT.plasticBlue, { y: 50 }));
    iron.position.set(0, 66, 0);
    iron.rotation.z = 0.5;
    iron.visible = false;
    iron.traverse((o) => (o.userData.noCut = true));
    part(iron, 'Mỏ hàn 350 °C', 'Chạm lâu lên đầu cell — nhiệt đi thẳng vào gioăng và cuộn điện cực.');
    // vật gây sự cố chỉ gắn vào cảnh khi diễn sự cố (để camera không căn theo chúng)

    const setCut = makeCutaway(cell);
    setCut(true);

    // ---------- MÔ HÌNH CAD THẬT: vỏ cell 18650 (khung GLB: trục Y, đáy ở y = 0 — trùng mô hình học) ----------
    // CAD chỉ có lớp vỏ (can, nắp +, vòng cách điện, vỏ PVC) → ruột (cuộn điện cực, PTC, van) vẫn là mô hình học,
    // hiện ra khi bật "Cắt bổ" (vỏ CAD bị cắt cùng mặt phẳng) hoặc khi tháo từng bước.
    const cutPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    let cadCapPop = null, cadWrap = null, cadCan = null, cadCap = null, cadIns = null, sWrap = null, sCan = null, sCap = null, sIns = null, cadShell = [];
    const cad = cadAttach(ctx, cell, 'robot/cell-18650', {
      hide: [sleeveG, canG, capGroup],
      partDefault: ['Cell INR18650-25R (CAD thật)', 'Mô hình CAD theo datasheet Samsung 25R: Ø18,33 × 64,85 mm, nặng ~45 g, 2,5 Ah, xả liên tục 20 A.'],
      parts: {
        wrap: ['Vỏ co nhiệt PVC (wrap)', 'Lớp nhựa mỏng 0,1 mm cách điện vỏ thép. Rách lớp này ở mép đầu dương là nguyên nhân đoản mạch hay gặp nhất khi đóng pack.'],
        can: ['Vỏ thép mạ niken = cực ÂM (−)', 'Vỏ dày ~0,25 mm nối với lá đồng cực âm. Cả thân vỏ là cực âm — chỉ có núm trên cùng là dương.'],
        cap_pos: ['Nắp dương (+) có lỗ thoát khí', 'Núm nhô ~0,8 mm là cực DƯƠNG. Bên dưới là PTC, đĩa CID và van an toàn — khi thermal runaway nắp có thể bật ra.'],
        insulator: ['Vòng giấy cách điện đầu dương', 'Vòng giấy/nhựa quanh núm dương: ngăn kẽm hàn hoặc vật kim loại chạm cùng lúc núm (+) và mép vỏ (−).'],
      },
      onLoad(c) {
        cadCapPop = popTarget(THREE, c, 'cap_pos');     // fx.pop() (bung nắp) văng đúng tỉ lệ mm, từ tâm nắp
        cadCap = c.node('cap_pos');
        cadWrap = c.node('wrap'); cadCan = c.node('can'); cadIns = c.node('insulator');
        sWrap = c.slide('wrap', [0, 1, 0]);             // bước 2: tuột vỏ PVC lên
        sCap = c.slide(cadCap, [0, 1, 0]);              // bước 3: nhấc cụm nắp
        sIns = c.slide('insulator', [0, 1, 0]);
        sCan = c.slide('can', [1, 0, 0]);               // bước 4: rút vỏ thép sang bên
        cadShell = [cadWrap, cadCan, cadCap, cadIns].filter(Boolean);
      },
    });
    // cắt bổ vỏ CAD: chỉ đổi khi khác trạng thái (vật liệu có thể bị fx.heat thay bằng bản sao → kiểm tra từng mesh)
    function clipCad(on) {
      for (const n of cadShell) n.traverse((o) => {
        if (!o.isMesh) return;
        const want = on ? cutPlane : null;
        if ((o.material.clippingPlanes?.[0] || null) === want) return;
        const m = ownMaterial(o);
        m.clippingPlanes = on ? [cutPlane] : null; m.side = THREE.DoubleSide; m.needsUpdate = true;
      });
    }
    label(cell, '+ (núm nắp)', [0, 69, 0]);
    label(cell, '− (cả vỏ thép)', [0, -3, 10]);
    label(cell, 'Cuộn điện cực', [-14, 40, 0]);

    // ---------- ô phóng to 1 lớp điện cực (×100) ----------
    const zoom = new THREE.Group();
    zoom.position.set(24, 18, 0);
    root.add(zoom);
    // trục X: [lá đồng 1 | graphite 6 | màng 2.5 | NMC 6 | lá nhôm 1.5] mm (×100 từ µm thật)
    const H = 30, D = 14;
    const L = [['cu', 1, MAT.copper], ['gr', 6, MAT.carbon], ['sep', 2.5, sepMat], ['nmc', 6, cathMat], ['al', 1.5, MAT.aluminum]];
    const xs = {};
    let x = 0;
    const zoomDesc = {
      cu: ['Lá đồng (collector âm) 10 µm', 'Thu electron từ than chì đưa ra vỏ âm.'],
      gr: ['Than chì (graphite) 60 µm', 'Các lớp carbon xếp chồng; Li⁺ chen vào giữa khi sạc (LiC₆).'],
      sep: ['Màng ngăn 20–25 µm (thấm điện phân)', 'Ion đi xuyên qua lỗ xốp; electron thì không.'],
      nmc: ['Hạt NMC 60 µm', 'Oxit kim loại chuyển tiếp nhận Li⁺ khi xả.'],
      al: ['Lá nhôm (collector dương) 15 µm', 'Thu electron đưa lên nắp dương.'],
    };
    for (const [k, w, m] of L) {
      const mm = k === 'sep' ? sepMat.clone() : m;
      if (k === 'sep') { mm.transparent = true; mm.opacity = 0.55; }
      const slab = mesh(box(w, H, D), mm, { x: x + w / 2, y: H / 2 });
      zoom.add(part(slab, zoomDesc[k][0], zoomDesc[k][1]));
      xs[k] = [x, x + w];
      x += w;
    }
    const zoomW = x;
    label(zoom, 'Phóng to 1 lớp ×100', [zoomW / 2, H + 4, 0]);
    const ionMat = new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffb000, emissiveIntensity: 0.9 });
    const ionGeo = new THREE.SphereGeometry(0.55, 12, 8);
    const ions = [];
    for (let k = 0; k < 14; k++) {
      const s = mesh(ionGeo, ionMat, { castShadow: false });
      s.userData.ph = k / 14;
      s.userData.y = 3 + ((k * 7.3) % (H - 6));
      s.userData.z = -D / 2 + 2 + ((k * 4.1) % (D - 4));
      zoom.add(s);
      ions.push(s);
    }
    const eArrow = arrow([0.5, H + 1.5, 0], [zoomW - 0.5, H + 1.5, 0], 0x4cc2ff, 2.5);
    zoom.add(eArrow);
    const xGr = (xs.gr[0] + xs.gr[1]) / 2, xNmc = (xs.nmc[0] + xs.nmc[1]) / 2;

    // ---------- tháo lắp từng bước: vị trí mục tiêu của từng cụm ----------
    // [sleeveY, capY, canX, rollY, visible sleeve, visible can, visible cap]
    const STEP_POSE = [
      [0, 0, 0, 0, 1, 1, 1],
      [80, 0, 0, 0, 1, 1, 1],
      [80, 18, 0, 0, 1, 1, 1],
      [80, 18, -28, 0, 1, 1, 1],
      [0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 1, 1, 1],
    ];
    let pose = STEP_POSE[0];

    // ---------- trạng thái ----------
    let soc = 70, lastSoc = null, T = T_AMB, cutoff = '', vented = false, ionPh = 0, lastCut = true;
    let fault = null, fT = 0, cid = false, smokeAcc = 0, heated = false, Rmul = 1, chargeBack = false;
    const DIR_D = new THREE.Vector3(1, 0, 0), DIR_C = new THREE.Vector3(-1, 0, 0);
    const hotSpot = new THREE.Object3D(); hotSpot.position.set(0, 66, 0); cell.add(hotSpot);
    const sideSpot = new THREE.Object3D(); sideSpot.position.set(10, 30, 0); cell.add(sideSpot);

    function resetAll(p) {
      soc = p?.soc ?? 70; T = T_AMB; vented = false; cutoff = ''; cid = false;
      fault = null; fT = 0; smokeAcc = 0; Rmul = 1; chargeBack = false;
      screw.visible = false; iron.visible = false;
      cell.remove(screw); cell.remove(iron);
      ventGroup.position.y = 0; capGroup.position.y = 0;
    }

    return {
      object: root,
      onAction(id, p) { if (id === 'reset') resetAll(p); },
      setStep(i) { pose = STEP_POSE[i < 0 ? 0 : Math.min(STEP_POSE.length - 1, i)]; },   // i < 0 = lắp hoàn chỉnh
      triggerFault(id, p) {
        resetAll(p);
        fault = id; fT = 0;
        if (id === 'doan-mach') { soc = 90; fx.sparks(hotSpot, { count: 70, speed: 60, size: 1.2 }); fx.flash(hotSpot, { size: 30, color: 0xbfe0ff }); }
        if (id === 'dam-thung') { soc = 95; cell.add(screw); screw.visible = true; screw.position.x = 12; fx.sparks(sideSpot, { count: 40, speed: 40, size: 1 }); }
        if (id === 'qua-sac') soc = 98;
        if (id === 'qua-xa') { soc = -8; Rmul = 2.5; }
        if (id === 'han-thiec') { soc = 60; cell.add(iron); iron.visible = true; fx.smoke(hotSpot, { size: 6, duration: 4, color: 0xdddddd }); }
      },
      resetFault(p) { resetAll(p); lastSoc = p?.soc; },
      update(dt, t, p) {
        if (p.cut !== lastCut) { setCut(p.cut); lastCut = p.cut; }
        if (p.soc !== lastSoc && !fault) { soc = p.soc; lastSoc = p.soc; cutoff = ''; }

        // ---- tháo lắp: nội suy mượt tới tư thế của bước ----
        const k = 1 - Math.pow(0.002, dt);
        sleeveG.position.y += (pose[0] - sleeveG.position.y) * k;
        capAsm.position.y += (pose[1] - capAsm.position.y) * k;
        canG.position.x += (pose[2] - canG.position.x) * k;
        sleeveG.visible = !!pose[4]; canG.visible = !!pose[5]; capAsm.visible = !!pose[6];
        // CAD: cùng tư thế tháo lắp, cùng mặt cắt; ẩn lại mô hình học của vỏ sau khi đổi visible ở trên
        const cadOn = cad.sync(p);
        if (cadOn) {
          sleeveG.visible = canG.visible = capGroup.visible = false;
          sWrap?.set(sleeveG.position.y); sCap?.set(capAsm.position.y); sIns?.set(capAsm.position.y); sCan?.set(canG.position.x);
          if (cadWrap) cadWrap.visible = !!pose[4];
          if (cadCan) cadCan.visible = !!pose[5];
          if (cadCap) cadCap.visible = !!pose[6];
          if (cadIns) cadIns.visible = !!pose[6];
          clipCad(p.cut);
        } else capGroup.visible = true;

        let spd = p.run ? p.speed : 1;
        let R = rInt(soc) * Rmul;
        const E0 = ocv(soc);
        let I = p.i, extraP = 0, useBms = p.bms, running = p.run;
        fT += dt;
        // ---- kịch bản sự cố (ghi đè mô phỏng bình thường) ----
        if (fault === 'doan-mach') { I = E0 / (R + R_SHORT); useBms = false; running = true; spd = 1; }
        if (fault === 'dam-thung') {
          screw.position.x = Math.max(4, 12 - fT * 16);
          I = 0; running = true; spd = 1;
          extraP = fT > 0.5 ? 900 : 0;                 // đoản mạch trong cục bộ ~ năng lượng dồn vào 1 điểm
        }
        if (fault === 'qua-sac') { I = -2.5; useBms = false; running = true; spd = 120; }
        if (fault === 'qua-xa') {
          useBms = false; running = true; spd = 60;
          if (fT < 2) I = 0;                              // nằm im ở 2.0 V
          else { chargeBack = true; I = -1.25; extraP = 2.5; }   // sạc lại: dendrite đồng đoản mạch mềm
        }
        if (fault === 'han-thiec') {
          I = 0; running = true; spd = 1;
          extraP = fT < 8 ? 12 : 0;                      // nhiệt mỏ hàn truyền vào đầu cell
          iron.visible = fT < 8;
        }
        if (cid || vented) I = 0;

        let V = E0 - I * R;
        if (useBms && !fault) {
          if (I > 0 && V < 2.5) { cutoff = 'BMS ngắt XẢ (V < 2.5 V)'; I = 0; V = E0; }
          else if (I < 0 && V > 4.25) { cutoff = 'BMS ngắt SẠC (V > 4.25 V)'; I = 0; V = E0; }
          else cutoff = '';
        }
        if (cid || vented) V = 0;
        // CID ngắt khi áp suất khí (quá sạc) đủ lớn
        if (fault === 'qua-sac' && !cid && E0 > 4.55) { cid = true; fx.smoke(hotSpot, { size: 4, duration: 3, color: 0xcfcfcf }); }

        // ---- nhiệt: C·dT/dt = I²R + phản ứng phụ − (T − Tamb)/Rth ----
        let P = I * I * R + extraP;
        if (soc > 100 && I < 0) P += 3 * (soc - 100);                 // phản ứng phụ khi quá sạc
        if (T > T_SEP && !vented) P += 40 * Math.exp((Math.min(T, 300) - T_SEP) / 30); // màng ngăn chảy → tự tỏa nhiệt
        if (vented) P = T > 300 ? 0 : 400;                             // cháy phần còn lại
        const sim = dt * spd;
        T += ((P - (T - T_AMB) / R_TH) / C_TH) * (running || T > T_SEP ? sim : dt * spd);
        T = Math.min(T, 650);
        if (running && !vented && !cid) soc -= (I / (CAP_AH * 3600)) * 100 * sim;
        soc = Math.max(-8, Math.min(106, soc));
        if (fault === 'qua-xa' && chargeBack) soc = Math.min(soc, 40);

        // ---- hiệu ứng ----
        if (T > T_VENT && !vented) {
          vented = true;
          fx.pop(ventGroup, { force: 30, size: 10 });
          if (cad.active && cadCapPop) fx.pop(cadCapPop, { force: 30, size: 10 });     // CAD: nắp dương bật ra
          fx.fire(hotSpot, { size: 9, duration: 8 });
          fx.smoke(hotSpot, { size: 14, duration: 10, color: 0x6a6a6a });
        }
        if (T > 90 && !vented) {
          smokeAcc += dt;
          if (smokeAcc > 1.2) { smokeAcc = 0; fx.smoke(fault === 'dam-thung' ? sideSpot : hotSpot, { size: 5, duration: 1.2, color: 0xe8e8e8 }); }
        }
        const hot = Math.max(0, Math.min(1, (T - 50) / 250));
        if (hot > 0.01 || heated) {
          fx.heat(roll, hot); fx.heat(sleeveG, hot * 0.6);
          if (cadWrap) fx.heat(cadWrap, hot * 0.6);          // vỏ PVC CAD nóng đỏ
          if (cadCan) fx.heat(cadCan, hot * 0.8);            // vỏ thép (thấy ở mặt cắt / khi tuột vỏ PVC)
          heated = hot > 0.01;
        }

        // ion Li⁺: xả → từ than chì sang NMC; sạc → ngược lại
        zoom.visible = p.ions;
        ionPh += dt * Math.min(1.5, Math.abs(I) / 4) * (I >= 0 ? 1 : -1);
        for (const s of ions) {
          let f = (s.userData.ph + ionPh) % 1; if (f < 0) f += 1;
          s.position.set(xGr + (xNmc - xGr) * f, s.userData.y, s.userData.z);
          s.visible = Math.abs(I) > 0.05;
        }
        eArrow.visible = Math.abs(I) > 0.05;
        eArrow.setDirection(I >= 0 ? DIR_D : DIR_C);
        eArrow.position.x = I >= 0 ? 0.5 : zoomW - 0.5;

        // ---- trạng thái chữ ----
        let st;
        if (vented) st = '🔥 THERMAL RUNAWAY — van bung, phun lửa';
        else if (T > T_SEP) st = '🔥 Màng ngăn đang chảy — sắp bùng cháy!';
        else if (cid) st = 'CID đã ngắt vĩnh viễn — cell chết (0 V)';
        else if (fault === 'doan-mach') st = `⚡ ĐOẢN MẠCH ${I.toFixed(0)} A — ${(I * I * R).toFixed(0)} W bên trong`;
        else if (fault === 'dam-thung') st = '⚡ Đoản mạch BÊN TRONG — BMS vô dụng';
        else if (fault === 'qua-xa') st = chargeBack ? 'Sạc lại: dendrite đồng → tự nóng, rò điện (tua 60×)' : 'Nằm ở 2.0 V: lá đồng đang hòa tan';
        else if (fault === 'qua-sac') st = `Quá sạc ${V.toFixed(2)} V — lithium plating, sinh khí (tua 120×)`;
        else if (fault === 'han-thiec') st = fT < 8 ? 'Đang hàn: nhiệt dồn vào gioăng & cuộn cực' : 'Đã hàn xong — gioăng có thể đã hỏng';
        else if (cutoff) st = cutoff;
        else if (V < 2.5) st = '⚠️ Quá xả (< 2.5 V) — hỏng cực âm';
        else if (V > 4.3) st = '⚠️ Quá sạc (> 4.3 V) — lithium plating';
        else if (T > 60) st = '⚠️ Quá nóng (> 60 °C) — giảm dòng';
        else if (I / CAP_AH > 8) st = '⚠️ Vượt 8C (20 A) liên tục';
        else if (soc < 5 && I > 0) st = 'Gần cạn — điện áp tụt nhanh';
        else st = I > 0.05 ? 'Đang xả' : I < -0.05 ? 'Đang sạc' : 'Nghỉ';

        readout('ocv', cid || vented ? 0 : E0);
        readout('v', V);
        readout('crate', `${I.toFixed(1)} A · ${(I / CAP_AH).toFixed(2)}C`);
        readout('soc', soc);
        readout('wh', energy(soc));
        readout('heat', P);
        readout('temp', T);
        readout('state', st);
        return [Math.max(0, V), Math.max(-5, Math.min(160, I)), Math.min(T, 200)];
      },
    };
  },
};
