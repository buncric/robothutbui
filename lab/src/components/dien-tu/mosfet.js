// 🔌 MOSFET kênh N logic-level IRLZ44N (TO-220) — công tắc phía thấp cho chổi cuộn / chổi cạnh.
// Mô hình (đơn giản hóa nhưng bám datasheet):
//   Vùng tuyến tính (mở hẳn): Rds(Vgs, Tj) = (R0 + a/(Vgs − Vth))·(1 + 0.007·(Tj − 25))
//   Vùng bão hòa (mở chưa đủ): Id ≤ K·(Vgs − Vth)²   → nếu dòng tải cần > Id_sat: MOSFET "ghì" dòng, Vds lớn, P = Vds·Id rất lớn
//   Tải = động cơ chổi cuộn coi như điện trở tương đương R_tải = VBAT / I_tải
//   Đóng ngắt PWM: P_sw = ½·VBAT·I·(t_r + t_f)·f, t = Q_sw / I_g, I_g = (V_drive − V_plateau)/R_g
//   Nhiệt: C·dTj/dt = P − (Tj − Ta)/RθJA  (RθJA 62 °C/W không tản nhiệt; ~10 °C/W có tản nhiệt)

const VBAT = 14.4, TA = 30, RG = 100 + 2, F_PWM = 20000;
const PARTS = {
  irlz44n: { name: 'IRLZ44N (logic-level, 55 V, 22 mΩ @10 V)', vth: 1.5, k: 7, r0: 0.0165, a: 0.025, vpl: 2.8, qsw: 30e-9, vgsMax: 16, vds: 55 },
  irf520: { name: 'IRF520 (chuẩn, 100 V, 270 mΩ @10 V)', vth: 3.0, k: 1, r0: 0.2, a: 0.49, vpl: 4.6, qsw: 10e-9, vgsMax: 20, vds: 100 },
};
import { cadAttach, ownMaterial } from '../../core/cadParts.js';

const TH_FAST = 10;           // tua nhanh nhiệt 10×
const SLOW_SHOW = 1;          // PWM vẽ 1 Hz

export default {
  id: 'mosfet',
  name: 'MOSFET IRLZ44N (logic-level)',
  category: 'dien-tu',
  order: 4,
  icon: '🔌',
  summary: 'Công tắc điện tử: điện áp nhỏ ở cổng (Gate) đóng/ngắt dòng lớn qua Drain–Source. IRLZ44N mở hẳn chỉ với 5 V từ chân PIC — điều khiển chổi cuộn & chổi cạnh. So sánh với IRF520 (module phổ biến nhưng KHÔNG hợp vi điều khiển).',
  tags: ['MOSFET', 'IRLZ44N', 'IRF520', 'TO-220', 'logic level', 'Rds(on)', 'gate', 'công tắc', 'low-side', 'Vgs(th)'],

  params: [
    { id: 'cad', label: '🧊 Mô hình CAD thật (TO-220 IRLZ44N)', type: 'toggle', value: true, hint: 'Tắt = mô hình học tự dựng (khối đơn giản, dễ nhìn lõi bên trong)' },
    { id: 'part', label: 'Loại MOSFET', type: 'select', value: 'irlz44n', options: Object.entries(PARTS).map(([k, v]) => [k, v.name]) },
    { id: 'vgs', label: 'Điện áp cổng Vgs (3.3 = ESP32, 5 = PIC)', type: 'range', min: 0, max: 10, step: 0.1, value: 5, unit: 'V' },
    { id: 'iload', label: 'Dòng tải cần (1.5 A chạy · 7 A kẹt tóc)', type: 'range', min: 0.5, max: 7, step: 0.1, value: 1.5, unit: 'A' },
    { id: 'mode', label: 'Cách điều khiển', type: 'select', value: 'on', options: [['on', 'Bật liên tục (RD5 = 1)'], ['pwm', 'PWM 20 kHz'], ['off', 'Tắt (RD5 = 0)']] },
    { id: 'duty', label: 'Duty PWM', type: 'range', min: 0, max: 100, step: 1, value: 60, unit: '%' },
    { id: 'hs', label: 'Gắn tản nhiệt nhôm', type: 'toggle', value: false },
    { id: 'open', label: 'Mở vỏ xem lõi silicon', type: 'toggle', value: false },
    { id: 'renew', label: '↺ Thay MOSFET mới (nếu đã cháy)', type: 'button' },
  ],
  readouts: [
    { id: 'region', label: 'Vùng làm việc', unit: '' },
    { id: 'rds', label: 'Rds(on) lúc này', unit: 'mΩ' },
    { id: 'id', label: 'Dòng Id', unit: 'A' },
    { id: 'vds', label: 'Sụt áp Vds', unit: 'V' },
    { id: 'pc', label: 'Tổn hao dẫn', unit: 'W' },
    { id: 'psw', label: 'Tổn hao đóng ngắt (PWM)', unit: 'W' },
    { id: 'tj', label: 'Nhiệt độ lõi Tj (tua nhanh 10×)', unit: '°C' },
    { id: 'state', label: 'Trạng thái', unit: '' },
  ],
  scope: {
    window: 4,
    note: '(PWM 20 kHz vẽ chậm 20 000× (1 chu kỳ = 1 s), sườn đóng/ngắt và "bậc Miller" được phóng to cho dễ thấy · nhiệt độ tua nhanh 10×)',
    channels: [
      { name: 'Vgs', unit: 'V', min: -0.5, max: 17, color: '#ff8c1a' },
      { name: 'Id', unit: 'A', min: 0, max: 8, color: '#ffd34d' },
      { name: 'Vds', unit: 'V', min: 0, max: 16, color: '#4cc2ff' },
      { name: 'Tj', unit: '°C', min: 20, max: 260, color: '#ff6b9a' },
    ],
  },

  info: {
    overview: `
      <p><b>MOSFET</b> (transistor hiệu ứng trường) có 3 chân: <b>G</b>ate (cổng), <b>D</b>rain (máng), <b>S</b>ource (nguồn). Đặt điện áp <code>Vgs</code> đủ lớn giữa G và S → kênh dẫn mở → dòng lớn chạy D → S với điện trở rất nhỏ <code>Rds(on)</code>. Cổng gần như không ăn dòng (chỉ nạp tụ cổng) nên chân vi điều khiển lái được.</p>
      <p>Trong robot: 2 con IRLZ44N làm công tắc <b>phía thấp</b> (low-side) cho chổi cuộn (RD5) và chổi cạnh (RD6): VBAT → động cơ → Drain; Source → GND.</p>
      <p>Thử: kéo <b>Vgs</b> từ 0 lên 5 V — dòng tăng vọt khi qua ngưỡng ~1.5 V rồi Rds giảm còn ~25 mΩ. Đổi sang <b>IRF520</b> ở cùng 5 V và tải 7 A: nó không mở hết, Vds lớn, nhiệt độ leo vùn vụt. Rồi bật <b>tản nhiệt</b> để so sánh.</p>`,
    specs: [
      ['IRLZ44N', 'Vds 55 V · Id 47 A (25 °C vỏ) · Rds(on) 22 mΩ @ Vgs 10 V, 25 mΩ @ 5 V, 35 mΩ @ 4 V'],
      ['Ngưỡng Vgs(th)', 'IRLZ44N 1–2 V · IRF520 2–4 V (chỉ là điểm BẮT ĐẦU dẫn 250 µA, không phải mở hẳn!)'],
      ['Vgs tối đa', 'IRLZ44N ±16 V · IRF520 ±20 V — vượt là thủng lớp ôxít cổng (dày ~50 nm)'],
      ['Điện tích cổng Qg', 'IRLZ44N 48 nC · IRF520 16 nC'],
      ['Nhiệt trở', 'RθJC 1.4 °C/W (lõi → vỏ) · RθJA 62 °C/W (không tản nhiệt, đứng trong không khí)'],
      ['Vỏ TO-220', 'Thân 10 × 9 × 4.5 mm, tab kim loại có lỗ Ø3.7 mm (tab nối Drain!), 3 chân bước 2.54 mm: G-D-S'],
      ['Tj tối đa', '175 °C'],
    ],
    principle: `
      <h4>1. Ngưỡng ≠ mở hẳn</h4>
      <p>Vgs(th) là điện áp kênh <i>bắt đầu</i> dẫn (250 µA). Muốn dẫn vài ampe với Rds nhỏ phải vượt xa ngưỡng. Datasheet chỉ đảm bảo Rds(on) ở các Vgs ghi rõ: IRLZ44N ghi ở <b>4 V, 5 V, 10 V</b> (logic-level); IRF520 chỉ ghi ở <b>10 V</b>.</p>
      <h4>2. Hai vùng làm việc</h4>
      <ul><li><b>Tuyến tính / mở hẳn</b> (vùng ohmic): MOSFET như điện trở nhỏ: <code>P = I²·Rds</code>. 1.5 A × 1.5 A × 0.025 Ω = 0.06 W — mát.</li>
      <li><b>Bão hòa / mở chưa đủ</b>: dòng bị giới hạn <code>Id ≈ K·(Vgs − Vth)²</code>, phần điện áp còn lại rơi trên MOSFET: <code>P = Vds·Id</code> — có thể hàng chục W → cháy.</li></ul>
      <h4>3. Nhiệt</h4>
      <p><code>Tj = Ta + P·RθJA</code>. Không tản nhiệt: 1 W → nóng thêm 62 °C. Có tản nhiệt nhỏ (~10 °C/W) chịu được vài W. Rds tăng ~0.7 %/°C → càng nóng càng tốn.</p>
      <h4>4. Đóng ngắt & bậc Miller</h4>
      <p>Cổng là một tụ (~2 nF). Khi đóng, Vgs dừng lại ở "bậc Miller" (~2.8 V với IRLZ44N) trong lúc Vds rơi xuống — đó là lúc MOSFET vừa có dòng vừa có áp → tổn hao đóng ngắt <code>P_sw = ½·V·I·(t_r + t_f)·f</code>. Trở cổng 100 Ω giới hạn dòng nạp tụ cổng (bảo vệ chân PIC) nhưng làm sườn chậm hơn.</p>
      <h4>5. Vì sao trở kéo xuống 10 kΩ?</h4>
      <p>Lúc PIC đang reset/khởi động, chân RD5 là đầu vào trở kháng cao → cổng thả nổi, nhiễm điện tích → MOSFET có thể tự mở nửa chừng. 10 kΩ giữ cổng ở 0 V.</p>`,
    inRobot: `
      <ul>
        <li><b>Chổi cuộn</b>: RD5 (chân 28) → 100 Ω → Gate; 10 kΩ Gate → GND; Drain → đầu âm động cơ; Source → GND; <b>SS34</b> song song ngược động cơ. Firmware: <code>PIN_MAIN_BRUSH = PIN_D5</code>.</li>
        <li><b>Chổi cạnh</b>: giống hệt với RD6 (chân 29), <code>PIN_SIDE_BRUSH</code>.</li>
        <li>Quạt hút loại DC chổi than (nếu có): IRLZ44N + driver cổng, PWM từ ESP32 GPIO4 — ESP32 chỉ có 3.3 V nên phải có mạch kích cổng (hoặc dùng MOSFET mở tốt ở 2.5 V như AO3400 cho tải nhỏ).</li>
        <li>KHÔNG dùng module IRF520 (docs/01 quy tắc 4).</li>
        <li>Đặt Source và GND động lực nối thẳng về cực âm pin (GND hình sao) — dòng 1.5–7 A không được chạy qua GND của PIC.</li>
      </ul>`,
    mistakes: `
      <ul>
        <li>Mua module "IRF520 MOSFET driver" cắm vào ESP32/PIC → động cơ yếu, MOSFET nóng bỏng (thử trong Sự cố).</li>
        <li>Quên trở kéo xuống → chổi giật khi cấp điện/nạp chương trình.</li>
        <li>Bắt tab vào khung kim loại không có miếng cách điện → Drain chạm khung.</li>
        <li>Chạm tay vào chân cổng khi đang khô hanh → tĩnh điện làm thủng cổng.</li>
        <li>Nhìn nhầm thứ tự chân (mỗi hãng/mỗi kiểu vỏ một khác) → luôn tra datasheet: IRLZ44N TO-220 là G-D-S nhìn từ mặt chữ.</li>
        <li>Quên diode dập cho động cơ → gai 68 V đánh thủng MOSFET (xem bài Diode).</li>
      </ul>`,
    quiz: [
      { q: 'IRLZ44N mở bằng 5 V, Rds ≈ 25 mΩ, dòng chổi cuộn 1.5 A. Tổn hao và nhiệt độ tăng thêm (không tản nhiệt)?', a: 'P = 1.5² × 0.025 ≈ 0.056 W → ΔT ≈ 0.056 × 62 ≈ 3.5 °C. Rất mát.' },
      { q: 'Vì sao IRF520 có Vgs(th) 2–4 V vẫn không dùng tốt ở 5 V?', a: 'Ngưỡng chỉ là lúc bắt đầu dẫn 250 µA. Ở 5 V, con có Vth = 4 V chỉ dẫn được ~1 A ở vùng bão hòa → tải cần 1.5 A thì phần áp dư rơi trên MOSFET, P = Vds·Id vài W → rất nóng.' },
      { q: 'Tab kim loại của TO-220 nối với chân nào? Hệ quả khi bắt tản nhiệt?', a: 'Nối Drain. Nếu tản nhiệt chạm khung/GND → chập Drain xuống GND (động cơ chạy luôn). Cần miếng cách điện + ống lót nhựa cho vít.' },
    ],
  },

  faults: [
    { id: 'irf520-33v', label: 'Module IRF520 lái bằng ESP32 3.3 V', severity: 'chay',
      what: '<p>Chổi quay yếu ớt hoặc không quay, MOSFET nóng tới mức sờ bỏng (&gt; 100 °C) chỉ sau vài chục giây, mùi nhựa khét, cuối cùng bốc khói. LED trên module vẫn sáng nên tưởng "đã bật".</p>',
      why: '<p>IRF520 cần ~10 V để mở hẳn. Con này có Vth ≈ 2.6 V: ở 3.3 V chỉ cho <code>Id ≈ K·(3.3 − 2.6)² ≈ 0.5 A</code> (bão hòa) trong khi chổi cần 1.5 A. Điện áp rơi trên MOSFET <code>Vds ≈ 14.4 − 0.5 × 9.6 ≈ 9.6 V</code> → <code>P = 9.6 × 0.5 ≈ 4.8 W</code> → <code>Tj ≈ 30 + 4.8 × 62 ≈ 330 °C</code>. Silicon chết khi &gt; 175 °C.</p>',
      fix: '<p>Dùng MOSFET logic-level có Rds(on) ghi ở 4.5 V hoặc thấp hơn (IRLZ44N, IRLB8721, AO3400 cho tải nhỏ), hoặc thêm mạch kích cổng (transistor/IC gate driver) lên 10–12 V. Đo Vds khi đang chạy: &gt; 0.3 V là MOSFET chưa mở hẳn.</p>' },
    { id: 'khong-keo-xuong', label: 'Quên trở kéo xuống 10 kΩ ở cổng', severity: 'loi',
      what: '<p>Lúc cắm pin hoặc lúc đang nạp chương trình cho PIC, chổi cuộn tự giật, quay nửa chừng; chạm tay gần dây cổng thì nó đổi. MOSFET ấm bất thường dù "đang tắt".</p>',
      why: '<p>Khi PIC reset, RD5 là đầu vào trở kháng cao → cổng thả nổi. Tụ cổng ~2 nF bị nhiễm điện tích từ nhiễu và từ tụ ký sinh Cgd (Drain đang dao động 0–14 V). Với IRLZ44N chỉ cần Vgs ≈ 2–2.5 V là đã dẫn vài ampe → mở nửa chừng = vùng bão hòa = nóng.</p>',
      fix: '<p>Luôn có 10 kΩ từ Gate xuống Source (GND), hàn sát MOSFET. Firmware: đặt RD5 = 0 ngay dòng đầu tiên của <code>main()</code>.</p>' },
    { id: 'tinh-dien', label: 'Tĩnh điện từ tay chạm vào chân cổng', severity: 'hong',
      what: '<p>Một tiếng "tách" nhỏ khó thấy. Sau đó MOSFET không bật được nữa, hoặc rò: cổng như bị chập xuống Source, chân RD5 của PIC phải cấp dòng lớn và nóng.</p>',
      why: '<p>Cơ thể tích điện tĩnh 2–15 kV (đi dép trên thảm, trời hanh). Lớp ôxít cổng chỉ dày ~50 nm, chịu được ±16 V. Tia phóng điện xuyên thủng lớp ôxít → cổng chập vĩnh viễn. Khi đó PIC cấp <code>5 V / (100 Ω + ~50 Ω) ≈ 33 mA</code> &gt; giới hạn 25 mA/chân.</p>',
      fix: '<p>Chạm vào vỏ kim loại nối đất trước khi cầm linh kiện, dùng vòng đeo tay chống tĩnh điện, giữ MOSFET trong túi chống tĩnh điện tới khi hàn. Trở kéo xuống 10 kΩ cũng giúp xả bớt.</p>' },
    { id: 'nham-chan', label: 'Lắp nhầm Drain ↔ Source', severity: 'loi',
      what: '<p>Chổi cuộn chạy luôn ngay khi cắm pin, không tắt được bằng RD5; MOSFET ấm dần.</p>',
      why: '<p>Mỗi MOSFET có <b>diode thân</b> từ Source → Drain. Đảo D và S thì diode này phân cực thuận nằm đúng đường dòng động cơ → dòng chạy qua diode bất kể cổng: <code>P ≈ 0.9 V × 1.5 A ≈ 1.4 W</code> → nóng thêm ~85 °C.</p>',
      fix: '<p>Tra datasheet: IRLZ44N nhìn mặt chữ, chân trái → phải: G, D, S; tab = D. Đo bằng đồng hồ chế độ diode: que đỏ ở S, đen ở D thấy ~0.5–0.7 V (diode thân).</p>' },
    { id: 'cong-168v', label: 'Nối cổng thẳng vào VBAT 16.8 V "cho mở hết"', severity: 'hong',
      what: '<p>Chạy được vài giây/vài phút rồi MOSFET chết: thường chập luôn cả 3 chân → chổi chạy liên tục, có thể kèm tiếng nổ nhỏ và khói.</p>',
      why: '<p>Vgs tối đa của IRLZ44N là ±16 V. Pin 4S đầy = 16.8 V, cộng gai nhiễu → vượt độ bền điện môi của lớp ôxít cổng → đánh thủng. Điện tích tích trong động cơ/ dây còn đẩy gai cao hơn.</p>',
      fix: '<p>Mức cổng 5–10 V là đủ cho IRLZ44N. Nếu buộc phải dùng nguồn cao, thêm zener 12 V Gate–Source và trở nối tiếp.</p>' },
    { id: 'ket-choi', label: 'Tóc quấn kẹt chổi: 7 A kéo dài', severity: 'loi',
      what: '<p>Chổi đứng im, IRLZ44N nóng lên ~150 °C (không tản nhiệt) nhưng chưa chết; động cơ chổi mới là thứ cháy trước (cuộn dây quá nhiệt), mùi khét.</p>',
      why: '<p>Dòng kẹt ~7 A: <code>P = 7² × 0.03 Ω × hệ số nhiệt ≈ 1.5–2 W</code> → +90–120 °C. Với tản nhiệt chỉ +20 °C. Động cơ thì tỏa <code>7² × 2 Ω ≈ 98 W</code>!</p>',
      fix: '<p>Thêm điện trở shunt 0.05 Ω + ADC (hoặc cầu chì tự phục hồi PTC 3 A) để PIC phát hiện quá dòng và tắt chổi, đảo chiều gỡ tóc. Vệ sinh chổi định kỳ.</p>' },
  ],

  build(ctx) {
    const { THREE, MAT, geom, label, readout, fx } = ctx;
    const { mesh, group, part, cyl, box, pcb, wire, helixThread } = geom;
    const root = new THREE.Group();
    const board = pcb(46, 32, { mat: MAT.pcbGreen.clone() });
    part(board, 'Bo công tắc chổi cuộn', 'Đường đồng dòng lớn (Drain, Source) phải rộng ≥ 2–3 mm; GND động lực đi riêng về cực âm pin.');
    root.add(board);

    // ---------- TO-220 ----------
    const fet = new THREE.Group();
    fet.position.set(4, 0, -2);
    root.add(fet);
    const bodyMat = MAT.icBody.clone();
    bodyMat.transparent = true;
    const body = mesh(box(10, 9, 4.5, 0.3), bodyMat, { y: 7.5 });
    fet.add(part(body, 'Thân epoxy TO-220', 'Mặt chữ "IRLZ44N" hướng về phía bạn: chân trái → phải = G, D, S.'));
    const tabG = new THREE.Group();
    const tab = mesh(box(10, 15.5, 1.3), MAT.tin.clone(), { y: 10.75, z: -2.6 });
    const hole = mesh(cyl(1.85, 1.85, 1.5, 24), MAT.plasticDark, { y: 15.6, z: -2.6, rx: Math.PI / 2 });
    tabG.add(tab, hole);
    fet.add(part(tabG, 'Tab tản nhiệt kim loại = DRAIN', 'Đồng mạ thiếc, nối thẳng với Drain. Bắt tản nhiệt qua lỗ Ø3.7 mm bằng vít M3 — nhớ đệm cách điện nếu tản nhiệt chạm GND/khung.'));
    const leadNames = [['Chân G (Gate — cổng)', 'Nối RD5 qua 100 Ω, và 10 kΩ xuống GND. Gần như không ăn dòng DC.'], ['Chân D (Drain — máng)', 'Nối đầu âm động cơ chổi (và anode diode SS34). Cũng chính là tab.'], ['Chân S (Source — nguồn)', 'Nối GND động lực (dây to về cực âm pin).']];
    const leads = [-2.54, 0, 2.54].map((x, k) => {
      const l = group(mesh(box(1.2, 1.2, 0.5), MAT.tin, { x, y: 2.6 }), mesh(box(0.8, 5.4, 0.5), MAT.tin, { x, y: -0.3 }));
      fet.add(part(l, leadNames[k][0], leadNames[k][1]));
      return l;
    });
    // lõi bên trong
    const inside = new THREE.Group();
    inside.visible = false;
    const die = mesh(box(4.2, 3.6, 0.3), MAT.silicon.clone(), { y: 8.5, z: -1.8 });
    inside.add(part(die, 'Lõi silicon ~4 × 3.6 mm', 'Hàng chục nghìn ô MOSFET nhỏ nối song song (cấu trúc HEXFET) → Rds rất nhỏ. Mặt dưới die là Drain, hàn lên tab.'));
    inside.add(wire([[-0.8, 9.6, -1.6], [-2.0, 7, -1.0], [-2.54, 3.2, -0.6]], { radius: 0.06, color: 0xd0d4d8 }));
    inside.add(wire([[0.8, 9.0, -1.6], [2.0, 7, -1.0], [2.54, 3.2, -0.6]], { radius: 0.2, color: 0xd0d4d8 }));
    inside.add(wire([[1.2, 8.0, -1.6], [2.3, 6, -1.0], [2.7, 3.2, -0.6]], { radius: 0.2, color: 0xd0d4d8 }));
    part(inside.children[1], 'Dây bond nhôm', 'Dây Gate mảnh (chỉ nạp tụ cổng); 2 dây Source to (~0.4 mm) chở cả chục ampe.');
    fet.add(inside);

    // tản nhiệt
    const sink = new THREE.Group();
    sink.position.set(0, 10.5, -8.8);
    sink.add(mesh(box(22, 21, 3), MAT.aluminum, {}));
    for (let k = 0; k < 6; k++) sink.add(mesh(box(1.4, 21, 8), MAT.aluminum, { x: -9.5 + k * 3.8, z: -5 }));
    sink.add(mesh(cyl(2.6, 2.6, 2.4, 6), MAT.zinc, { y: 5.1, z: 2.6, rx: Math.PI / 2 }));
    fet.add(part(sink, 'Tản nhiệt nhôm + vít M3', 'Giảm nhiệt trở lõi → không khí từ ~62 °C/W xuống ~10 °C/W. Bôi keo tản nhiệt mỏng giữa tab và nhôm.'));

    // ---------- linh kiện quanh MOSFET ----------
    const axial = (len, r, color, bands) => {
      const g = new THREE.Group();
      g.add(mesh(cyl(r, r, len, 20), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }), { rz: Math.PI / 2 }));
      bands.forEach(([x, c]) => g.add(mesh(cyl(r * 1.05, r * 1.05, 0.5, 20, true), new THREE.MeshStandardMaterial({ color: c }), { x, rz: Math.PI / 2 })));
      g.add(mesh(cyl(0.3, 0.3, len + 5, 10), MAT.tin, { rz: Math.PI / 2 }));
      return g;
    };
    const rg = axial(6.3, 1.15, 0xd8c39a, [[-2, 0x6b3a1e], [-1, 0x111111], [0, 0x6b3a1e], [2.2, 0xc9a33a]]);
    rg.position.set(-9, 2.2, 6);
    root.add(part(rg, 'R cổng 100 Ω (Nâu–Đen–Nâu)', 'Hạn dòng nạp tụ cổng lúc đóng ngắt (đỉnh ~50 mA) để bảo vệ chân PIC, giảm dao động.'));
    const rpd = axial(6.3, 1.15, 0xd8c39a, [[-2, 0x6b3a1e], [-1, 0x111111], [0, 0xf07f13], [2.2, 0xc9a33a]]);
    rpd.position.set(-2, 2.2, 10);
    rpd.rotation.y = 0.5;
    root.add(part(rpd, 'R kéo xuống 10 kΩ (Nâu–Đen–Cam)', 'Giữ Gate = 0 V khi PIC đang reset → MOSFET chắc chắn tắt.'));
    const ss = group(mesh(box(4.3, 2.1, 2.6, 0.2), MAT.icBody, { y: 1.05 }), mesh(box(0.8, 0.05, 2.6), MAT.plasticGrey, { x: -1.4, y: 2.13 }));
    ss.position.set(15, 0, 6);
    root.add(part(ss, 'Diode SS34 (song song ngược động cơ)', 'Dập điện áp cảm ứng khi MOSFET ngắt. Vạch về +VBAT.'));
    const term = group(mesh(box(7.4, 8.5, 7, 0.4), MAT.plasticBlue, { y: 4.25 }), mesh(cyl(1.4, 1.4, 0.8, 16), MAT.zinc, { x: -1.75, y: 8.7 }), mesh(cyl(1.4, 1.4, 0.8, 16), MAT.zinc, { x: 1.75, y: 8.7 }));
    term.position.set(17, 0, -8);
    root.add(part(term, 'Domino ra động cơ (+VBAT, Drain)', 'Dây ≥ 0.5 mm²: dòng kẹt chổi tới 7 A.'));
    const hdr = geom.pinHeader(3);
    hdr.position.set(-20, 0, 11);
    root.add(part(hdr, 'Header từ PIC: RD5 · GND · 5V', 'RD5 = chân 28 PIC (chổi cuộn).'));
    root.add(wire([[-20, 8.6, 11], [-16, 5, 8], [-12.5, 2.2, 6]], { radius: 0.35, color: 0xff8c1a }));

    // ---------- chổi cuộn ----------
    const brush = new THREE.Group();
    brush.position.set(-6, 12, -26);
    const roller = new THREE.Group();
    roller.add(mesh(cyl(5, 5, 40, 32), MAT.plasticYellow, {}));
    roller.add(mesh(helixThread({ radius: 6, pitch: 20, turns: 2, tube: 1.2, y0: 20 }), MAT.rubber));
    roller.add(mesh(helixThread({ radius: 6, pitch: 20, turns: 2, tube: 1.2, y0: 10 }), MAT.plasticDark));
    roller.rotation.z = Math.PI / 2;
    brush.add(roller);
    brush.add(mesh(cyl(8, 8, 18, 32), MAT.steel, { x: 29, rz: Math.PI / 2 }));
    root.add(part(brush, 'Chổi cuộn + động cơ (1.5 A chạy, 7 A kẹt)', 'Quay nhanh/chậm theo dòng điện MOSFET cho qua. Tóc quấn vào chổi là nguyên nhân kẹt số 1.'));
    root.add(wire([[17, 8.6, -8], [24, 10, -16], [23, 12, -26]], { radius: 0.6, color: 0xd23b3b }));
    root.add(wire([[4, 1, -2], [12, 4, -10], [21, 10, -24]], { radius: 0.6, color: 0x4a4f57 }));

    label(fet, 'IRLZ44N  G · D · S', [0, 21, 0]);
    label(fet, 'Tab = Drain', [7, 17, -2.6]);
    label(rg, 'R cổng 100 Ω', [0, 3, 0]);
    label(rpd, 'R kéo xuống 10 kΩ', [0, 3, 0]);
    label(ss, 'SS34', [0, 4, 0]);
    label(brush, 'Chổi cuộn', [0, 9, 0]);

    // ---------- mô hình CAD thật TO-220 (khung GLB: y = 0 là mặt bo, tab phía −z, chân 1-2-3 = G-D-S theo +x) ----------
    // Đặt trong `fet` → trùng vị trí thân tự dựng. Chân dài 9,8 mm dưới mặt bo được "cắt chân" còn ~3 mm như sau khi hàn.
    let cadBody = null, cadBodyPop = null, cadPins = [];
    const cad = cadAttach(ctx, fet, 'vendor/to_220_3_vertical', {
      onBottom: false,
      hide: [body, tabG, ...leads],
      partDefault: ['MOSFET IRLZ44N — vỏ TO-220 (CAD thật)', 'Mô hình CAD đúng kích thước vỏ TO-220-3: thân 10 × 4,5 mm, tab có lỗ Ø3,6 mm, 3 chân bước 2,54 mm.'],
      parts: {
        mosfet_irlz44n: ['Thân epoxy + tab kim loại (= DRAIN)', 'Mặt chữ "IRLZ44N" hướng về phía bạn: chân trái → phải = G, D, S. Tab đồng mạ thiếc phía sau nối thẳng Drain; lỗ Ø3,6 mm bắt tản nhiệt bằng vít M3 (nhớ đệm cách điện).'],
        pin_1: ['Chân 1 — G (Gate, cổng)', 'Nối RD5 qua 100 Ω, và 10 kΩ xuống GND. Gần như không ăn dòng DC — chỉ nạp/xả tụ cổng ~2 nF.'],
        pin_2: ['Chân 2 — D (Drain, máng)', 'Nối đầu âm động cơ chổi (và anode diode SS34). Nối liền với tab kim loại.'],
        pin_3: ['Chân 3 — S (Source, nguồn)', 'Nối GND động lực bằng đường đồng to, dây về thẳng cực âm pin.'],
      },
      labels: [['G', [-2.54, 1.2, 3.2]], ['D', [0, 1.2, 3.2]], ['S', [2.54, 1.2, 3.2]]],
      onLoad(c) {
        cadPins = ['pin_1', 'pin_2', 'pin_3'].map((n) => c.node(n)).filter(Boolean);
        cadPins.forEach((n) => { n.scale.y *= 0.32; });          // chân đã cắt sau khi hàn (≈ 3 mm dưới mặt bo)
        cadBody = c.node('mosfet_irlz44n');
        // nhóm trung gian theo mm quanh tâm thân → fx.pop bay đúng tỉ lệ (node GLB nằm trong khung mét ×1000)
        if (cadBody) {
          const g = new THREE.Group();
          g.position.copy(c.worldOf(cadBody));
          c.holder.add(g);
          g.updateMatrixWorld(true);
          g.attach(cadBody);
          cadBodyPop = g;
        }
      },
    });
    const PIN_FN = [0xff8c1a, 0xe5484d, 0x555b66];   // G cam (tín hiệu) · D đỏ (phía tải) · S xám (GND)
    let lastOpenCad = null;

    // ---------- trạng thái ----------
    let tj = TA, ang = 0, fault = null, dead = false, heated = false, gFloat = 0, gT = 0, smokeT = 0, seed = 3, popT = -1;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    function solve(P, vgs, iDem, tj) {
      // trả về {i, vds, rds, region}
      if (vgs <= P.vth) return { i: 0, vds: VBAT, rds: Infinity, region: 'Tắt (Vgs < ngưỡng)' };
      const rds = (P.r0 + P.a / (vgs - P.vth)) * (1 + 0.007 * (tj - 25));
      const rl = VBAT / iDem;
      const iOhm = VBAT / (rl + rds);
      const iSat = P.k * (vgs - P.vth) ** 2;
      if (iSat >= iOhm) return { i: iOhm, vds: iOhm * rds, rds, region: 'Mở hẳn (tuyến tính, như điện trở nhỏ)' };
      return { i: iSat, vds: VBAT - iSat * rl, rds, region: '⚠️ Mở chưa đủ (bão hòa) — Vds lớn, rất nóng' };
    }

    return {
      object: root,
      onAction(id) { if (id === 'renew') { fx.restore(fet); dead = false; tj = TA; popT = -1; heated = false; } },
      triggerFault(id) {
        fault = id; dead = false; tj = TA; popT = -1;
        if (id === 'tinh-dien') {
          const at = fet.localToWorld(new THREE.Vector3(-2.54, 1.5, 0.9)).toArray();      // ngay chân G
          fx.sparks(at, { count: 6, speed: 8, size: 0.3, color: 0xbfe3ff }); fx.flash(at, { size: 4, color: 0xcfe6ff, intensity: 2 });
        }
      },
      resetFault() { fault = null; dead = false; tj = TA; popT = -1; },
      update(dt, t, p) {
        const open = p.open;
        bodyMat.opacity = open ? 0.2 : 1;
        bodyMat.depthWrite = !open;
        inside.visible = open;
        sink.visible = p.hs;
        // ----- CAD thật: mở vỏ = thân epoxy trong suốt (thấy lõi silicon tự dựng bên trong); chân tô màu chức năng G/D/S -----
        const cadOn = cad.sync(p);
        if (cadOn) {
          if (cadBody) cadBody.traverse((o) => {
            if (!o.isMesh) return;
            const m = ownMaterial(o);
            if (m.transparent !== open) { m.transparent = open; m.needsUpdate = true; }
            m.opacity = open ? 0.25 : 1;
            m.depthWrite = !open;
          });
          if (open !== lastOpenCad) { lastOpenCad = open; cadPins.forEach((n, k) => cad.color(n, open ? PIN_FN[k] : null)); }
        }

        // ----- thông số hiệu dụng theo sự cố -----
        let partKey = p.part, vgsSet = p.vgs, iDem = p.iload, mode = p.mode;
        let P = PARTS[partKey];
        if (fault === 'irf520-33v') { P = { ...PARTS.irf520, vth: 2.6 }; vgsSet = 3.3; mode = 'on'; iDem = 1.5; }
        if (fault === 'ket-choi') { iDem = 7; mode = 'on'; }
        if (fault === 'cong-168v') { vgsSet = 16.8; mode = 'on'; }
        if (fault === 'khong-keo-xuong') {
          mode = 'float';
          gT -= dt;
          if (gT <= 0) { gT = 0.3 + rnd() * 0.9; gFloat = rnd() < 0.5 ? rnd() * 1.4 : 1.4 + rnd() * 1.6; }
        }
        // ----- dạng sóng cổng (vẽ chậm) -----
        const ph = (t * SLOW_SHOW) % 1;
        const D = p.duty / 100;
        let vgsNow, frac;          // frac = mức dẫn tức thời 0..1 cho scope
        const vpl = Math.min(P.vpl, vgsSet);
        const edge = (x, from, to) => to + (from - to) * Math.exp(-x / 0.025);
        if (mode === 'on') { vgsNow = vgsSet; frac = 1; }
        else if (mode === 'off') { vgsNow = 0; frac = 0; }
        else if (mode === 'float') { vgsNow = gFloat; frac = 1; }
        else {
          // PWM: sườn lên có bậc Miller dài 0.05 chu kỳ, sườn xuống tương tự
          const x1 = vgsSet > vpl ? -0.025 * Math.log(1 - vpl / vgsSet) : 1;
          if (ph < D) {
            const x = ph;
            if (x < x1) { vgsNow = edge(x, 0, vgsSet); frac = 0; }
            else if (x < x1 + 0.05) { vgsNow = vpl; frac = (x - x1) / 0.05; }
            else { vgsNow = edge(x - 0.05, 0, vgsSet); frac = 1; }
          } else {
            const x = ph - D;
            const x2 = vgsSet > vpl ? -0.025 * Math.log(vpl / vgsSet) : 0;
            if (x < x2) { vgsNow = edge(x, vgsSet, 0); frac = 1; }
            else if (x < x2 + 0.05) { vgsNow = vpl; frac = 1 - (x - x2) / 0.05; }
            else { vgsNow = edge(x - 0.05, vgsSet, 0); frac = 0; }
          }
        }
        // ----- điểm làm việc khi dẫn -----
        let sOn = solve(P, mode === 'float' ? gFloat : vgsSet, iDem, tj);
        let id, vds;
        const gateShort = fault === 'tinh-dien';
        if (gateShort) sOn = { i: 0, vds: VBAT, rds: Infinity, region: '⚡ Cổng thủng — không mở được' };
        if (fault === 'nham-chan') {
          const iD = VBAT / (VBAT / iDem + 0.06) * (1 - 0.9 / VBAT);
          sOn = { i: iD, vds: 0.9, rds: Infinity, region: '⚠️ Dòng đi qua diode thân (lắp ngược D/S)' };
          frac = 1;
        }
        if (dead) { const rl = VBAT / iDem; sOn = { i: VBAT / (rl + 0.01), vds: VBAT / (rl + 0.01) * 0.01, rds: 10, region: '⚡ Hỏng CHẬP D–S' }; frac = 1; vgsNow = fault === 'cong-168v' ? 0.3 : vgsNow; }
        id = sOn.i * frac;
        vds = mode === 'off' && !dead && fault !== 'nham-chan' ? VBAT : VBAT - (VBAT - sOn.vds) * frac;
        if (gateShort) { id = 0; vds = VBAT; }
        // ----- công suất trung bình -----
        const duty = mode === 'pwm' ? D : mode === 'off' && !dead && fault !== 'nham-chan' ? 0 : 1;
        const pCond = sOn.i * sOn.vds * (fault === 'nham-chan' || dead ? 1 : duty);
        let pSw = 0;
        if (mode === 'pwm' && !dead && vgsSet > P.vpl + 0.2) {
          const ig = (vgsSet - P.vpl) / RG, igOff = P.vpl / RG;
          const tsw = P.qsw / ig + P.qsw / igOff;
          pSw = 0.5 * VBAT * sOn.i * tsw * F_PWM;
        } else if (mode === 'pwm' && !dead && D > 0 && D < 1) pSw = 0.5 * VBAT * sOn.i * 0.2;       // không vượt nổi bậc Miller → luôn nửa vời
        const pTot = pCond + pSw;
        // ----- nhiệt -----
        const rth = p.hs ? 10 : 62, cth = p.hs ? 8 : 1.5;
        tj += ((pTot - (tj - TA) / rth) / cth) * dt * TH_FAST;
        // vật bị nổ/cháy/nóng: thân CAD (node mosfet_irlz44n) khi đang xem CAD, ngược lại thân tự dựng
        const bodyFx = cadOn && cadBody ? cadBody : body;
        if (fault === 'cong-168v' && !dead) { if (popT < 0) popT = 1.5; popT -= dt; if (popT <= 0) { dead = true; fx.pop(cadOn && cadBodyPop ? cadBodyPop : body, { force: 20, size: 5 }); fx.smoke(fet, { size: 6, duration: 4 }); } }
        if (tj > 175 && !dead && pTot > 1) {
          smokeT -= dt;
          if (smokeT <= 0) { smokeT = 1.2; fx.smoke(fet, { size: 6, duration: 1.5 }); }
          if (tj > 250) { dead = true; fx.scorch(bodyFx, 0.7); fx.sparks(fet, { count: 10, speed: 10, size: 0.4 }); }
        }
        const hot = Math.max(0, (tj - 70) / 160);
        const heatObj = cadOn && cadBody ? cadBody : fet;
        if (hot > 0.02) { fx.heat(heatObj, hot); if (heated && heated !== heatObj) fx.heat(heated, 0); heated = heatObj; } else if (heated) { fx.heat(heated, 0); heated = false; }
        die.material.emissive.setRGB(Math.min(1, hot * 1.5), Math.min(1, hot * 0.4), 0);

        // ----- chổi quay theo dòng -----
        const iAvg = sOn.i * duty;
        const speed = fault === 'ket-choi' ? 0 : Math.min(1.3, iAvg / iDem) * 8;
        ang += speed * dt;
        roller.rotation.y = ang;

        let state = sOn.region;
        if (mode === 'off' && !dead && fault !== 'nham-chan') state = 'Tắt: Vgs = 0, chỉ rò ~µA';
        if (fault === 'irf520-33v') state = `🔥 IRF520 ở 3.3 V: bão hòa, P = ${pTot.toFixed(1)} W, Tj ${tj.toFixed(0)} °C`;
        if (fault === 'khong-keo-xuong') state = `⚠️ Cổng thả nổi: Vgs ≈ ${gFloat.toFixed(1)} V ngẫu nhiên → chổi tự giật`;
        if (fault === 'tinh-dien') state = '⚡ Ôxít cổng thủng: G chập S, chân RD5 phải cấp ~33 mA (> 25 mA)';
        if (fault === 'cong-168v') state = dead ? '⚡ Thủng cổng → chập cả 3 chân, chổi chạy liên tục' : '⚠️ Vgs 16.8 V > 16 V tối đa — sắp thủng cổng!';
        if (fault === 'ket-choi') state = `Kẹt 7 A: MOSFET ${tj.toFixed(0)} °C (vẫn sống) — động cơ chổi mới là thứ cháy`;
        if (dead && fault !== 'cong-168v') state = '⚡ MOSFET chết (thường hỏng chập D–S)';

        readout('region', sOn.region);
        readout('rds', Number.isFinite(sOn.rds) ? sOn.rds * 1000 : 0);
        readout('id', iAvg);
        readout('vds', mode === 'pwm' ? sOn.vds : vds);
        readout('pc', pCond);
        readout('psw', pSw);
        readout('tj', tj);
        readout('state', state);
        return [Math.min(17, gateShort ? 0.2 : vgsNow), id, vds, tj];
      },
    };
  },
};
