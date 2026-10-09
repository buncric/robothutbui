const n=`// 🔋 Tụ điện — tụ hóa 1000 µF/25 V (cắt bổ thấy cuộn lá nhôm) + tụ gốm 100 nF.
// Thí nghiệm 1 — mạch RC: dVc/dt = (Vs − Vc)/(R·C) → Vc = 5·(1 − e^(−t/τ)), τ = R·C ; I = (Vs − Vc)/R ; E = ½·C·V²
// Thí nghiệm 2 — lọc nguồn: động cơ chổi than tạo gai nhanh (HF, vài µs) + sụt áp chậm (LF, theo dòng khởi động/đổi chiều).
//   Tụ gốm 100 nF sát chân (ESL nhỏ) dập gai HF; tụ hóa 1000 µF (C lớn) giữ áp khi sụt LF. VDD < 4.0 V → PIC reset (BOR).

import { cadAttach, ownMaterial } from '../../core/cadParts.js';

const RC_SLOW = { '1000u': 1, '100n': 10000 };   // tụ 100 nF: τ thật quá nhỏ → vẽ chậm 10 000×
const CAP_F = { '1000u': 1000e-6, '100n': 100e-9 };
const R_BANDS = { 100: [1, 0, 1], 1000: [1, 0, 2], 4700: [4, 7, 2], 10000: [1, 0, 3] };
const BAND_HEX = [0x111111, 0x6b3a1e, 0xc4161c, 0xf07f13, 0xf2d313, 0x2e9e3a, 0x2457c5, 0x7a3fb0, 0x8c8c8c, 0xf2f2f2];
const BOR = 4.0;

export default {
  id: 'tu-dien',
  name: 'Tụ điện (tụ hóa & tụ gốm)',
  category: 'dien-tu',
  order: 2,
  icon: '🥫',
  summary: 'Tụ điện là "bình chứa điện tích": nạp/xả theo hằng số thời gian τ = RC, chặn DC cho AC đi qua. Trong robot: tụ 1000 µF giữ ổn định nguồn cho driver, tụ 100 nF dập nhiễu sát chân IC — thiếu chúng PIC/ESP32 sẽ reset khi động cơ chạy.',
  tags: ['capacitor', 'tụ hóa', 'tụ gốm', 'electrolytic', 'MLCC', 'RC', 'decoupling', 'lọc nhiễu', '104', 'phân cực'],

  params: [
    { id: 'cad', label: '🧊 Mô hình CAD thật (tụ hóa Ø10 mm, tụ gốm 104)', type: 'toggle', value: true, hint: 'Tắt = mô hình học tự dựng. Bật "Cắt bổ" khi đang xem CAD: vỏ CAD bị cắt nửa, thấy cuộn lá nhôm bên trong.' },
    { id: 'c', label: 'Tụ dùng cho mạch RC', type: 'select', value: '1000u', options: [['1000u', 'Tụ hóa 1000 µF'], ['100n', 'Tụ gốm 100 nF (104)']] },
    { id: 'r', label: 'Điện trở nạp R', type: 'select', value: '1000', options: [['100', '100 Ω'], ['1000', '1 kΩ'], ['4700', '4.7 kΩ'], ['10000', '10 kΩ']] },
    { id: 'sw', label: 'Công tắc RC', type: 'select', value: 'xung', options: [['xung', 'Tự động nạp ↔ xả (sóng vuông)'], ['nap', 'Nạp (nối nguồn 5 V)'], ['xa', 'Xả (nối GND)']] },
    { id: 'motor', label: 'Động cơ đang chạy (nguồn nhiễu)', type: 'toggle', value: true },
    { id: 'c100n', label: 'Có tụ gốm 100 nF sát chân VDD', type: 'toggle', value: true },
    { id: 'c1000u', label: 'Có tụ hóa 1000 µF đầu nguồn', type: 'toggle', value: true },
    { id: 'cut', label: 'Cắt bổ tụ hóa (xem cuộn lá nhôm)', type: 'toggle', value: true },
  ],
  readouts: [
    { id: 'tau', label: 'Hằng số thời gian τ = R·C (thật)', unit: '' },
    { id: 'vc', label: 'Điện áp tụ Vc', unit: 'V' },
    { id: 'i', label: 'Dòng nạp/xả', unit: 'mA' },
    { id: 'pct', label: 'Đã nạp', unit: '%' },
    { id: 'e', label: 'Năng lượng ½CV²', unit: 'mJ' },
    { id: 'vmin', label: 'VDD thấp nhất tại chip (1 s gần nhất)', unit: 'V' },
    { id: 'resets', label: 'Số lần PIC reset (BOR < 4.0 V)', unit: 'lần' },
    { id: 'state', label: 'Trạng thái', unit: '' },
  ],
  scope: {
    window: 6,
    note: '(RC với tụ 1000 µF: thời gian thực · tụ 100 nF: vẽ chậm 10 000× · gai nhiễu động cơ thật dài vài µs: vẽ chậm)',
    channels: [
      { name: 'Vc (RC)', unit: 'V', min: -0.3, max: 5.5, color: '#4cc2ff' },
      { name: 'I nạp/xả', unit: 'mA', min: -55, max: 55, color: '#ffd34d' },
      { name: 'Nguồn 5 V thô (nhiễu)', unit: 'V', min: 2, max: 6.5, color: '#ff6b9a' },
      { name: 'VDD tại chip', unit: 'V', min: 2, max: 6.5, color: '#3fcf8e' },
    ],
  },

  info: {
    overview: \`
      <p><b>Tụ điện</b> (capacitor) gồm 2 bản dẫn điện ngăn cách bởi lớp cách điện (điện môi). Đặt điện áp vào → điện tích dồn lên 2 bản: <code>Q = C·V</code>. Nó nạp/xả <b>không tức thời</b> mà theo đường cong mũ với hằng số thời gian <code>τ = R·C</code>.</p>
      <ul>
        <li><b>Tụ hóa (điện phân nhôm)</b>: điện dung lớn (µF–mF), rẻ, nhưng <b>có cực tính</b> (vạch trắng = cực âm) và chậm ở tần số cao.</li>
        <li><b>Tụ gốm (MLCC)</b>: nhỏ (pF–µF), không cực tính, rất nhanh — chuyên dập nhiễu tần số cao. "104" = 10 × 10⁴ pF = 100 nF.</li>
      </ul>
      <p>Thử: để công tắc ở <b>sóng vuông</b>, đổi R từ 1 kΩ sang 4.7 kΩ — đường cong nạp chậm hẳn. Rồi tắt <b>tụ gốm 100 nF</b> và <b>tụ hóa 1000 µF</b> trong khi động cơ chạy: VDD tại chip rớt xuống dưới 4 V và PIC reset liên tục.</p>\`,
    specs: [
      ['Tụ hóa dự án', '1000 µF / 25 V, Ø10 × 20 mm, chân cách 5 mm, 105 °C, ESR ~0.05–0.1 Ω'],
      ['Tụ gốm dự án', '100 nF (104) / 50 V, X7R, chân cách 5 mm (hoặc SMD 0805)'],
      ['Chọn điện áp', 'Định mức ≥ 1.5 × điện áp làm việc: VBAT tối đa 16.8 V → tụ 25 V'],
      ['Sai số', 'Tụ hóa ±20 % · tụ gốm X7R ±10 % (giảm điện dung khi đặt điện áp DC cao)'],
      ['Dòng rò', 'Tụ hóa ≈ 0.01·C·V = 0.01 × 1000 × 25 ≈ 250 µA (tối đa sau 2 phút)'],
      ['Tuổi thọ', '2 000–5 000 giờ ở 105 °C; giảm một nửa mỗi +10 °C'],
      ['Năng lượng', '½CV²: 1000 µF ở 16.8 V = 0.14 J — đủ tạo tia lửa khi chập'],
    ],
    principle: \`
      <h4>1. Nạp và xả</h4>
      <p>Nạp qua R từ nguồn Vs: <code>Vc(t) = Vs·(1 − e^(−t/τ))</code>; xả: <code>Vc(t) = V0·e^(−t/τ)</code>. Sau 1τ đạt 63 %, sau 3τ đạt 95 %, sau 5τ coi như đầy (99.3 %). Dòng lớn nhất ở thời điểm đầu: <code>I = Vs/R</code>, rồi giảm dần về 0 — tụ "chặn" dòng DC khi đã đầy.</p>
      <p>Ví dụ: 1 kΩ × 1000 µF = 1 s. 10 kΩ × 100 nF = 1 ms (quá nhanh, mô phỏng vẽ chậm lại).</p>
      <h4>2. Bên trong tụ hóa</h4>
      <p>2 lá nhôm dài cuộn tròn, ngăn bằng giấy tẩm dung dịch điện phân. Lá dương (anode) được ăn mòn nhám và phủ lớp ôxít nhôm Al₂O₃ dày chỉ vài chục nm — chính lớp ôxít mỏng này là điện môi → điện dung rất lớn. Đặt ngược cực, lớp ôxít bị phá → dòng rò lớn → sinh khí → phồng, nổ van (vết khía chữ K trên nắp).</p>
      <h4>3. Lọc nguồn (decoupling)</h4>
      <p>Trở kháng của tụ <code>Xc = 1/(2π·f·C)</code>: tần số càng cao càng "thông" xuống GND → nhiễu bị dẫn đi. Nhưng tụ thật còn có điện cảm ký sinh (ESL): tụ hóa to (ESL ~10–20 nH) kém ở &gt; 1 MHz; tụ gốm nhỏ (ESL ~1 nH) bắt được gai nhanh. Vì vậy luôn dùng <b>cặp</b>: tụ hóa lớn đầu nguồn + tụ gốm nhỏ sát từng chân VDD.</p>
      <div class="tip">Quy tắc: tụ gốm phải nằm <b>sát chân</b> (&lt; 5 mm). Mỗi 1 cm dây thêm ~10 nH, ở 100 MHz là 6 Ω — tụ đặt xa gần như vô dụng.</div>\`,
    inRobot: \`
      <ul>
        <li><b>1000 µF / 25 V</b> ngay đầu VM của mỗi DRV8871 (docs/01 quy tắc 2) — cấp dòng xung PWM 20 kHz, hấp thụ năng lượng động cơ trả về khi phanh.</li>
        <li><b>100 nF</b> sát mỗi cặp VDD/VSS của PIC16F877A (chân 11–12 và 31–32), và hàn thẳng 2 cực mỗi động cơ chổi than.</li>
        <li><b>22 pF × 2</b> cho thạch anh 20 MHz (chân 13, 14).</li>
        <li>Mạch hạ áp XL4015: tụ hóa ở ngõ vào và ngõ ra 5 V.</li>
        <li>Tùy chọn: 100 nF ở MCLR (nếu bị reset do nhiễu) và ở chân AN0 đo pin.</li>
      </ul>\`,
    mistakes: \`
      <ul>
        <li>Hàn ngược cực tụ hóa (vạch trắng là âm, chân dài là dương) → phồng, nổ.</li>
        <li>Chọn tụ 16 V cho pin 4S (16.8 V khi đầy) → vượt định mức, nóng, phồng dần.</li>
        <li>Đặt tụ 100 nF ở góc bo mạch xa chip → PIC vẫn reset khi động cơ đổi chiều.</li>
        <li>Chập 2 chân tụ lớn đang nạp bằng tua vít → tia lửa làm rỗ đầu tua vít, có thể hỏng tụ.</li>
        <li>Tưởng "tụ càng lớn càng tốt" cho mọi chỗ: tụ quá lớn ở ngõ ra LDO có thể làm nó dao động; tụ lớn đầu nguồn làm dòng cắm điện vọt (tia lửa ở đầu nối).</li>
      </ul>\`,
    quiz: [
      { q: 'R = 4.7 kΩ, C = 1000 µF. Sau bao lâu tụ nạp được 95 %?', a: 'τ = 4.7 s; 95 % ≈ 3τ ≈ 14 s.' },
      { q: 'Vì sao cần cả tụ 1000 µF lẫn tụ 100 nF mà không chỉ dùng 1 tụ thật to?', a: 'Tụ hóa to có điện cảm/ESR ký sinh lớn nên không dập được gai nhanh (MHz); tụ gốm nhỏ, ESL thấp, đặt sát chân thì dập được. Hai tụ bổ sung cho nhau.' },
      { q: 'Tụ ghi "104" là bao nhiêu?', a: '10 × 10⁴ pF = 100 000 pF = 100 nF = 0.1 µF.' },
    ],
  },

  faults: [
    { id: 'nguoc-cuc', label: 'Hàn ngược cực tụ hóa trên VBAT 14.4 V', severity: 'no',
      what: '<p>Vài giây đầu không thấy gì, rồi tụ nóng lên, nắp phồng vồng lên ở vết khía chữ K, có tiếng xì, mùi tanh (dung dịch điện phân), rồi "BỤP" — van nổ, giấy và dung dịch bắn ra, khói trắng. Có khi cả vỏ nhôm bắn khỏi chân.</p>',
      why: '<p>Điện áp ngược phá lớp ôxít Al₂O₃ (điện môi) bằng phản ứng điện hóa → tụ thành gần như dây dẫn: dòng rò từ µA tăng lên hàng ampe. <code>P = 14.4 V × ~1 A ≈ 15 W</code> dồn vào khối 10 × 20 mm → dung dịch sôi, sinh khí H₂ → áp suất phá vết khía an toàn.</p>',
      fix: '<p>Vạch trắng/xám có dấu "−" = cực âm; chân dài = dương; trên PCB nửa hình tròn gạch sọc = âm. Kiểm tra lại trước khi cấp điện lần đầu, cấp qua nguồn có giới hạn dòng. Đã phồng: ngắt điện, đeo kính, thay tụ, lau sạch dung dịch (ăn mòn mạch).</p>' },
    { id: 'qua-ap', label: 'Lắp tụ 10 V vào đường VBAT 16.8 V', severity: 'no',
      what: '<p>Tụ ấm dần, dòng rò tăng, đỉnh tụ phồng sau vài phút đến vài giờ (mô phỏng tua nhanh), cuối cùng xì van, khói. Trước khi nổ, tụ đã mất phần lớn điện dung → driver nhiễu, reset.</p>',
      why: '<p>Lớp ôxít của tụ 10 V được "nuôi" (formed) chỉ dày đủ chịu ~12–13 V. Ở 16.8 V điện trường vượt độ bền điện môi → các điểm yếu bị đánh thủng cục bộ, dòng rò tăng theo cấp số mũ, nóng → càng rò hơn (thoát nhiệt — thermal runaway).</p>',
      fix: '<p>Chọn điện áp định mức ≥ 1.5 × điện áp lớn nhất: pin 4S đầy 16.8 V → dùng 25 V (hoặc 35 V cho dư). Đọc kỹ chữ in trên thân: "1000µF 25V 105°C".</p>' },
    { id: 'thieu-tu', label: 'Bỏ hết tụ lọc nguồn (không 100 nF, không 1000 µF)', severity: 'loi',
      what: '<p>Robot chạy được vài giây rồi "khựng", đèn trạng thái chớp lại từ đầu: PIC bị reset mỗi khi động cơ khởi động hay đổi chiều. ESP32 có thể báo "Brownout detector was triggered". UART nhận byte rác.</p>',
      why: '<p>Dòng động cơ thay đổi nhanh (di/dt lớn) qua điện cảm dây (~1 µH) và điện trở dây: <code>ΔV = L·di/dt + I·R</code> — vài trăm mV tới vài volt gai nhọn. Không có tụ cấp điện tích tại chỗ → VDD của chip rớt dưới ngưỡng BOR 4.0 V → chip tự reset để bảo vệ.</p>',
      fix: '<p>Tụ 100 nF sát MỖI chân VDD + tụ hóa lớn đầu nguồn; nguồn logic tách riêng (buck XL4015) với nguồn động cơ; GND nối hình sao; tụ 100 nF ở 2 cực động cơ.</p>' },
    { id: 'gom-xa', label: 'Tụ 100 nF đặt xa chip (dây 10 cm)', severity: 'loi',
      what: '<p>Có tụ mà vẫn thỉnh thoảng reset — các gai nhọn vẫn lọt tới chân VDD.</p>',
      why: '<p>Dây 10 cm có điện cảm ≈ 100 nH. Ở tần số gai ~50 MHz: <code>X_L = 2π·f·L ≈ 31 Ω</code> — lớn hơn rất nhiều trở kháng tụ (0.03 Ω). Tụ bị "cách ly" khỏi chip bởi chính đoạn dây.</p>',
      fix: '<p>Đặt tụ gốm sát chân VDD–VSS, đường mạch ngắn và rộng, mặt GND liền. Trên breadboard: cắm tụ ngay cạnh chân chip.</p>' },
    { id: 'chap-tu', label: 'Chập 2 chân tụ 1000 µF đang nạp 16.8 V bằng tua vít', severity: 'nhe',
      what: '<p>"TẠCH!" — tia lửa xanh trắng, đầu tua vít bị rỗ một chấm. Không giật người (điện áp thấp) nhưng có thể hỏng tab nối bên trong tụ.</p>',
      why: '<p>Năng lượng <code>E = ½·C·V² = ½ × 0.001 × 16.8² ≈ 0.14 J</code> xả trong vài µs qua ESR ~0.05 Ω: dòng đỉnh <code>I ≈ V/ESR ≈ 300 A</code> → kim loại tại điểm chạm nóng chảy tức thì. Tụ cao áp (nguồn TV, lò vi sóng) có thể giữ hàng chục J ở hàng trăm V — chết người!</p>',
      fix: '<p>Xả tụ qua điện trở (ví dụ 100 Ω 5 W, τ = 0.1 s) rồi đo lại bằng đồng hồ trước khi chạm. Không bao giờ chập trực tiếp.</p>' },
  ],

  build(ctx) {
    const { THREE, MAT, geom, label, readout, fx } = ctx;
    const { mesh, group, part, cyl, box, makeCutaway, pcb, wire, dipPackage } = geom;
    const root = new THREE.Group();
    root.add(part(pcb(52, 32, { mat: MAT.pcbGreen.clone() }), 'Bo thí nghiệm', 'Nguồn 5 V → R nạp → tụ; nguồn nhiễu là động cơ chổi than; chip ở góc phải nhận VDD sau tụ.'));

    // ---------- tụ hóa 1000 µF / 25 V (Ø10 × 20) ----------
    const ecap = new THREE.Group();
    ecap.position.set(-12, 0, -2);
    root.add(ecap);
    const canMat = MAT.aluminum.clone();
    const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x1d2a5a, roughness: 0.45 });
    const can = mesh(cyl(4.9, 4.9, 19, 48, true), canMat, { y: 11 });
    const sleeve = mesh(cyl(5.05, 5.05, 18.6, 48, true), sleeveMat, { y: 11 });
    const top = mesh(cyl(4.6, 4.6, 0.4, 48), canMat, { y: 20.3 });
    const vent = group(mesh(box(0.25, 0.1, 6), MAT.steel, { y: 20.55 }), mesh(box(3.2, 0.1, 0.25), MAT.steel, { x: 1.5, y: 20.55, ry: 0.6 }), mesh(box(3.2, 0.1, 0.25), MAT.steel, { x: 1.5, y: 20.55, ry: -0.6 }));
    const domeGeo = new THREE.SphereGeometry(4.5, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const dome = mesh(domeGeo, canMat, { y: 20.4 });
    dome.scale.y = 0.02;
    const stripe = mesh(box(3.0, 18.4, 0.3), new THREE.MeshStandardMaterial({ color: 0xc7cbd2, roughness: 0.5 }), { y: 11, z: 4.95 });
    const minus = group(...[0, 1, 2, 3].map((k) => mesh(box(1.4, 0.35, 0.2), MAT.plasticDark, { y: 5 + k * 4, z: 5.12 })));
    const bung = mesh(cyl(4.6, 4.6, 1.6, 32), MAT.rubber, { y: 1.6 });
    const capShell = group(can, sleeve, top);
    ecap.add(part(capShell, 'Vỏ nhôm + vỏ bọc nhựa co nhiệt', 'Ghi: 1000µF 25V 105°C. Vỏ nhôm chính là cực âm nối với lá cathode.'));
    ecap.add(part(group(vent, dome), 'Vết khía chữ K (van an toàn)', 'Khi áp suất khí trong tụ tăng (ngược cực, quá áp, quá nóng), nắp phồng và nứt theo vết khía để xả khí thay vì nổ tung cả vỏ.'));
    ecap.add(part(group(stripe, minus), 'Vạch cực ÂM (−)', 'Dải màu sáng in dấu "−" phía chân âm. Chân dương dài hơn.'));
    ecap.add(part(bung, 'Nút cao su đáy', 'Bịt kín dung dịch điện phân; 2 chân xuyên qua.'));
    // cuộn lá nhôm bên trong
    const roll = new THREE.Group();
    roll.position.y = 2.6;
    const spiralBand = (phase, th) => {
      const s = new THREE.Shape();
      const turns = 6, r0 = 1.0, r1 = 4.3, N = 220;
      const pts = [];
      for (let k = 0; k <= N; k++) { const a = (k / N) * turns * Math.PI * 2; pts.push([a, r0 + ((r1 - r0) * k) / N + phase]); }
      pts.forEach(([a, r], k) => (k === 0 ? s.moveTo(r * Math.cos(a), r * Math.sin(a)) : s.lineTo(r * Math.cos(a), r * Math.sin(a))));
      for (let k = pts.length - 1; k >= 0; k--) { const [a, r] = pts[k]; s.lineTo((r + th) * Math.cos(a), (r + th) * Math.sin(a)); }
      s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: 16.5, bevelEnabled: false, curveSegments: 4 });
      g.rotateX(-Math.PI / 2);
      return g;
    };
    const pitch = 3.3 / 6;
    const anode = mesh(spiralBand(0, 0.08), MAT.aluminum.clone());
    const paper = mesh(spiralBand(pitch * 0.33, 0.1), new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 0.9 }));
    const cathode = mesh(spiralBand(pitch * 0.66, 0.06), new THREE.MeshStandardMaterial({ color: 0x9aa1ab, metalness: 0.8, roughness: 0.5 }));
    roll.add(part(anode, 'Lá nhôm DƯƠNG (anode) + lớp ôxít', 'Lá nhôm được ăn mòn cho nhám (tăng diện tích ~100 lần) và phủ ôxít Al₂O₃ dày vài chục nm — lớp điện môi siêu mỏng.'));
    roll.add(part(paper, 'Giấy tẩm dung dịch điện phân', 'Dung dịch dẫn điện đóng vai trò bản cực âm thật sự, len vào mọi rãnh nhám của lá dương.'));
    roll.add(part(cathode, 'Lá nhôm ÂM (cathode)', 'Lá nhôm trơn, tiếp xúc với dung dịch, nối ra chân âm và vỏ.'));
    ecap.add(roll);
    const leadsE = group(mesh(cyl(0.3, 0.3, 4, 10), MAT.tin, { z: -2.5, y: -0.5 }), mesh(cyl(0.3, 0.3, 4, 10), MAT.tin, { z: 2.5, y: -0.5 }));
    ecap.add(leadsE);
    const halfMoon = mesh(geomHalf(THREE), new THREE.MeshStandardMaterial({ color: 0xf3f3f3, roughness: 0.6 }), { y: 0.02 });
    ecap.add(part(halfMoon, 'Ký hiệu PCB: nửa tròn gạch = cực âm', 'In lụa trên bo: vòng tròn + nửa được tô = phía chân âm.'));
    // cắt bỏ nửa x > 0 (camera nhìn từ phía +x thấy mặt cắt cuộn lá); vạch âm & ký hiệu PCB giữ nguyên
    for (const o of [stripe, minus, halfMoon, leadsE]) o.traverse((m) => (m.userData.noCut = true));
    // mặt phẳng cắt (toạ độ thế giới) đi qua tâm tụ: bỏ phần x > x_tâm
    const setCut = makeCutaway(ecap, new THREE.Plane(new THREE.Vector3(-1, 0, 0), ecap.position.x));

    // ---------- tụ gốm 100 nF ----------
    const ccap = new THREE.Group();
    ccap.position.set(12, 0, -8);
    const blob = mesh(new THREE.SphereGeometry(2.6, 24, 16), new THREE.MeshStandardMaterial({ color: 0x3b6fd6, roughness: 0.4 }), { y: 6.2 });
    blob.scale.set(1, 1.15, 0.55);
    const leadsC = group(mesh(cyl(0.25, 0.25, 5, 10), MAT.tin, { x: -1.25, y: 2.4 }), mesh(cyl(0.25, 0.25, 5, 10), MAT.tin, { x: 1.25, y: 2.4 }));
    ccap.add(part(group(blob, leadsC), 'Tụ gốm 100 nF "104" (MLCC X7R)', 'Nhiều lớp gốm titanat bari xen kẽ điện cực, nhúng epoxy xanh. Không có cực tính. ESL ~2 nH → dập gai nhanh rất tốt.'));
    root.add(ccap);

    // ---------- chip nhận VDD (DIP-8 tượng trưng) ----------
    const dip = dipPackage(8);
    dip.group.position.set(14, 0, 3);
    dip.group.rotation.y = Math.PI / 2;
    root.add(part(dip.group, 'Chip logic (đại diện PIC16F877A)', 'Cần VDD 5 V ổn định. Khi VDD < 4.0 V mạch BOR (Brown-Out Reset) bắt chip khởi động lại.'));

    // ---------- điện trở nạp ----------
    const res = new THREE.Group();
    res.position.set(-1, 2.2, 9);
    res.add(mesh(cyl(1.15, 1.15, 6.3, 24), new THREE.MeshStandardMaterial({ color: 0xd8c39a, roughness: 0.55 }), { rz: Math.PI / 2 }));
    const bandMeshes = [-2, -1, 0, 2.2].map((x) => mesh(cyl(1.2, 1.2, 0.5, 24, true), new THREE.MeshStandardMaterial({ color: 0x111111 }), { x, rz: Math.PI / 2 }));
    bandMeshes[3].material.color.setHex(0xc9a33a);
    res.add(...bandMeshes, mesh(cyl(0.3, 0.3, 11, 10), MAT.tin, { rz: Math.PI / 2 }));
    root.add(part(res, 'Điện trở nạp R', 'Giới hạn dòng nạp/xả: I_max = 5 V / R. Cùng với C quyết định τ = R·C.'));

    // ---------- nguồn 5 V + động cơ nhiễu ----------
    const hdr = geom.pinHeader(2);
    hdr.position.set(-22, 0, 11);
    root.add(part(hdr, 'Nguồn 5 V vào (từ buck XL4015)', 'Chân 1: +5 V · chân 2: GND.'));
    const motor = new THREE.Group();
    motor.position.set(0, 6.5, -11);
    motor.add(mesh(cyl(6, 6, 15, 32), MAT.steel, { rz: Math.PI / 2 }), mesh(cyl(6, 6, 2, 32), MAT.plasticWhite, { x: -8.4, rz: Math.PI / 2 }));
    motor.add(mesh(cyl(0.8, 0.8, 6, 12), MAT.steel, { x: 10, rz: Math.PI / 2 }));
    root.add(part(motor, 'Động cơ chổi than (nguồn nhiễu)', 'Mỗi lần cổ góp chuyển lá, chổi than đánh tia lửa nhỏ → gai điện áp vài µs lan theo dây nguồn.'));
    root.add(wire([[-20.7, 8, 11], [-18, 6, 6], [-12, 3, 3]], { radius: 0.35, color: 0xd23b3b }));
    root.add(wire([[-18.2, 8, 11], [-14, 7, 8], [-4.5, 3, 9]], { radius: 0.35, color: 0xd23b3b }));
    root.add(wire([[-8.4, 6.5, -11], [-10, 3, -7], [-12, 1, -4]], { radius: 0.35, color: 0x1d1f23 }));

    // ---------- mô hình CAD thật (thư viện 3D KiCad) ----------
    // Tụ hóa CP_Radial D10 P5.00: chân 1 (+) ở −x, chân 2 (−) ở +x → xoay −90° quanh Y để chân (−) về +z như mô hình học
    // (vạch âm ở +z). Mẫu KiCad cao 10 mm → kéo dài thân theo trục Y thành 20 mm cho đúng tụ 1000 µF/25 V thật (Ø10 × 20).
    const cutPlaneCad = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
    let cadCapBody = null, lastCadClip = null;
    const cadE = cadAttach(ctx, ecap, 'vendor/cp_radial_d10_0mm_p5_00mm', {
      onBottom: false, rotateY: -Math.PI / 2, offset: [0, 0, -1.1],
      hide: [capShell, vent.parent, stripe.parent, bung, leadsE],
      partDefault: ['Tụ hóa 1000 µF / 25 V (CAD thật, Ø10 mm, chân 5 mm)', 'Mô hình CAD theo thư viện KiCad CP_Radial_D10.0mm_P5.00mm (thân kéo dài thành 20 mm như tụ 1000 µF/25 V thật).'],
      parts: {
        cap_elec_d10: ['Vỏ nhôm + vỏ bọc nhựa co nhiệt', 'Ghi: 1000µF 25V 105°C. Dải sáng in dấu "−" là phía chân ÂM. Vỏ nhôm nối với lá cathode. Đỉnh có vết khía chữ K (van an toàn) — phồng lên là tụ sắp hỏng.'],
        pin_1: ['Chân DƯƠNG (+) — chân dài hơn', 'Nối phía điện áp cao (+5 V / VBAT). Hàn ngược là tụ phồng, xì van, có thể nổ.'],
        pin_2: ['Chân ÂM (−) — phía có vạch', 'Nối GND.'],
      },
      onLoad(c) {
        cadCapBody = c.node('cap_elec_d10');
        if (cadCapBody) {
          // kéo dài theo Y (gốc y = 0 là đáy thân → đáy giữ nguyên)
          const bb = new THREE.Box3().setFromObject(cadCapBody);
          const h = bb.max.y - Math.max(0, bb.min.y);
          if (h > 1) cadCapBody.scale.y *= 20 / h;
        }
      },
    });
    const cadC = cadAttach(ctx, ccap, 'vendor/c_disc_d5_0mm_w2_5mm_p5_00mm', {
      onBottom: false, frame: false,
      hide: [blob.parent],
      partDefault: ['Tụ gốm 100 nF "104" (CAD thật, đĩa Ø5 mm, chân 5 mm)', 'Mô hình CAD theo thư viện KiCad C_Disc_D5.0mm_W2.5mm_P5.00mm.'],
      parts: {
        cap_ceramic_104: ['Tụ gốm 100 nF "104" (X7R)', 'Mã 104 = 10 × 10⁴ pF = 100 nF. Nhiều lớp gốm titanat bari xen kẽ điện cực, nhúng epoxy. Không có cực tính. ESL ~2 nH → dập gai nhanh rất tốt.'],
        'pin_*': ['Chân tụ gốm (không phân cực)', 'Cắm chiều nào cũng được. Đặt càng sát chân VDD–GND của chip càng tốt (dây ngắn = điện cảm nhỏ).'],
      },
    });

    label(ecap, 'Tụ hóa 1000 µF 25 V', [0, 25, 0]);
    label(ecap, 'Vạch − (cực âm)', [0, 14, 7]);
    label(ccap, 'Tụ gốm 100 nF (104)', [0, 11, 0]);
    label(res, 'R nạp', [0, 3, 0]);
    label(motor, 'Động cơ (nguồn nhiễu)', [0, 8, 0]);
    label(root, 'VDD chip', [14, 6, 3]);

    // ---------- trạng thái ----------
    let vc = 0, swPh = 0, lastCut = null, resets = 0, vminWin = 5, vminT = 0, vminShow = 5, belowBOR = false;
    let hfNoise = 0, lfSag = 0, nextSpike = 0, seed = 99, sparkT = 0;
    let fault = null, press = 0, popped = false, heated = false, leak = 0, shortT = 0, vcap16 = 16.8;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const _wp = new THREE.Vector3();
    const resetState = () => { fault = null; press = 0; popped = false; leak = 0; shortT = 0; vcap16 = 16.8; resets = 0; dome.scale.y = 0.02; };

    return {
      object: root,
      triggerFault(id) {
        resetState();
        fault = id;
        if (id === 'chap-tu') {
          shortT = 0.6; vcap16 = 0;
          fx.sparks([-12, 2, 2], { count: 45, speed: 40, size: 0.6, color: 0xbfe3ff });
          fx.flash([-12, 2, 2], { size: 18, color: 0xcfe6ff, intensity: 5 });
        }
      },
      resetFault() { resetState(); heated = false; lastCadClip = null; },
      update(dt, t, p) {
        if (p.cut !== lastCut) { setCut(p.cut); lastCut = p.cut; }
        // ----- CAD thật: cắt bổ = cắt nửa vỏ CAD bằng mặt phẳng qua tâm tụ, cuộn lá tự dựng hiện bên trong -----
        const cadOn = cadE.sync(p);
        cadC.sync(p);
        roll.visible = !cadOn || p.cut;
        if (cadOn && cadCapBody) {
          ecap.updateWorldMatrix(true, false);
          cutPlaneCad.constant = ecap.getWorldPosition(_wp).x;        // bỏ nửa x > tâm tụ (phía camera)
          const clip = !!p.cut && !popped;
          if (clip !== lastCadClip) {
            lastCadClip = clip;
            cadCapBody.traverse((o) => { if (o.isMesh) { const m = ownMaterial(o); m.clippingPlanes = clip ? [cutPlaneCad] : null; m.side = THREE.DoubleSide; m.needsUpdate = true; } });
          }
        }
        // khi tụ phồng (sự cố) đang xem CAD: hiện nắp vòm tự dựng trên đỉnh vỏ CAD
        vent.parent.visible = !cadOn || press > 0.02;
        // ---------- RC ----------
        const R = Number(p.r), C = CAP_F[p.c], slow = RC_SLOW[p.c];
        const tauReal = R * C, tauShow = tauReal * slow;
        let vs;
        if (p.sw === 'nap') vs = 5; else if (p.sw === 'xa') vs = 0;
        else { const per = Math.min(40, Math.max(2, 10 * tauShow)); swPh = (swPh + dt / per) % 1; vs = swPh < 0.5 ? 5 : 0; }
        const nSub = 8;
        for (let k = 0; k < nSub; k++) vc += ((vs - vc) / tauShow) * (dt / nSub);
        if (p.c === '1000u' && popped) vc = 0;
        const iRC = ((vs - vc) / R) * 1000;
        res.children.slice(1, 4).forEach((b, k) => b.material.color.setHex(BAND_HEX[R_BANDS[R][k]]));

        // ---------- lọc nguồn ----------
        let has100n = p.c100n, has1000u = p.c1000u && !popped;
        if (fault === 'thieu-tu') { has100n = false; has1000u = false; }
        let kHF = has100n ? 0.07 : 1;
        if (fault === 'gom-xa' && has100n) kHF = 0.7;
        if (has1000u) kHF *= has100n ? 1 : 0.55;
        const kLF = has1000u ? 0.1 : 1;
        // gai HF từ chổi than (ngẫu nhiên ~6 lần/giây trên màn hình) + sụt áp LF khi động cơ tăng tốc/đổi tải
        hfNoise *= Math.exp(-dt / 0.02);
        nextSpike -= dt;
        if (p.motor && nextSpike <= 0) { hfNoise = -(1.2 + 1.3 * rnd()) * (rnd() < 0.5 ? 1 : -0.6); nextSpike = 0.08 + 0.25 * rnd(); }
        const lfTarget = p.motor ? 0.35 + 0.45 * Math.max(0, Math.sin(t * 1.3)) + (Math.sin(t * 0.37) > 0.92 ? 0.6 : 0) : 0;
        lfSag += (lfTarget - lfSag) * Math.min(1, dt * 6);
        const vRaw = 5 + hfNoise - lfSag;
        const vdd = 5 + hfNoise * kHF - lfSag * kLF;
        if (p.motor && !has100n && !has1000u) { sparkT -= dt; if (sparkT <= 0) { sparkT = 0.5; fx.sparks([-8.6, 6.5, -11], { count: 4, speed: 10, size: 0.3 }); } }
        if (vdd < BOR && !belowBOR) { resets++; belowBOR = true; }
        if (vdd > BOR + 0.1) belowBOR = false;
        vminWin = Math.min(vminWin, vdd);
        vminT += dt;
        if (vminT > 1) { vminShow = vminWin; vminWin = 5; vminT = 0; }

        // ---------- sự cố tụ hóa ----------
        let iShow = iRC;
        if (fault === 'nguoc-cuc' || fault === 'qua-ap') {
          const rate = fault === 'nguoc-cuc' ? 1 / 3.5 : 1 / 6;
          if (!popped) {
            press = Math.min(1, press + dt * rate * (0.4 + press));
            leak = (fault === 'nguoc-cuc' ? 1200 : 300) * press * press;   // mA rò
            dome.scale.y = 0.02 + 0.5 * press;
            const lvl = 0.15 + 0.6 * press;
            const hObj = cadE.active && cadCapBody ? cadCapBody : capShell;
            fx.heat(hObj, lvl); if (heated && heated !== hObj) fx.heat(heated, 0); heated = hObj;
            if (press > 0.6 && Math.random() < dt * 3) fx.smoke([-12, 21, -2], { size: 3, duration: 0.6, color: 0xdddddd });
            if (press >= 1) {
              popped = true;
              leak = 0;
              fx.pop(ecap, { force: fault === 'nguoc-cuc' ? 60 : 35, size: 10 });
              fx.flash([-12, 18, -2], { size: 25, color: 0xfff1c0 });
              fx.smoke([-12, 10, -2], { size: 12, duration: 6, color: 0xe6e6e6 });
              fx.scorch(root.children[0], 0.25);
            }
          }
          iShow = leak;
        } else if (heated) { fx.heat(heated, 0); heated = false; }
        if (fault === 'chap-tu') { shortT -= dt; iShow = shortT > 0.45 ? 55 : iRC; }

        let state = vs > vc + 0.01 ? 'Đang nạp' : vc > vs + 0.01 ? 'Đang xả' : 'Ổn định (tụ chặn DC: I = 0)';
        if (vdd < BOR) state = '⚠️ VDD < 4.0 V → PIC RESET!';
        if (fault === 'nguoc-cuc') state = popped ? '💥 Tụ nổ van — đã hỏng' : \`🔥 Ngược cực: rò \${(leak / 1000).toFixed(2)} A, áp suất trong tụ \${(press * 100).toFixed(0)} %\`;
        if (fault === 'qua-ap') state = popped ? '💥 Tụ xì van — đã hỏng' : \`🔥 Quá áp 16.8 V / định mức 10 V: rò \${leak.toFixed(0)} mA, phồng \${(press * 100).toFixed(0)} %\`;
        if (fault === 'chap-tu') state = shortT > 0 ? '⚡ Xả 0.14 J trong vài µs — dòng đỉnh ~300 A' : 'Tụ đã xả hết (0 V)';
        if (fault === 'thieu-tu') state = \`⚠️ Không tụ lọc: VDD rớt tới \${vminShow.toFixed(2)} V\`;
        if (fault === 'gom-xa') state = '⚠️ Tụ 100 nF xa chip: dây 100 nH chặn mất tác dụng ở tần số cao';

        readout('tau', tauReal >= 1 ? \`\${tauReal.toFixed(2)} s\` : tauReal >= 1e-3 ? \`\${(tauReal * 1e3).toFixed(2)} ms\` : \`\${(tauReal * 1e6).toFixed(1)} µs\`);
        readout('vc', vc);
        readout('i', iShow);
        readout('pct', (vc / 5) * 100);
        readout('e', fault === 'chap-tu' ? 0.5 * 1e-3 * vcap16 * vcap16 * 1000 : 0.5 * C * vc * vc * 1000);
        readout('vmin', vminShow);
        readout('resets', resets);
        readout('state', state);
        return [vc, iShow, vRaw, vdd];
      },
    };
  },
};

// nửa vành tròn in lụa (ký hiệu cực âm trên PCB) — nằm phẳng trên mặt bo
function geomHalf(THREE) {
  const s = new THREE.Shape();
  s.absarc(0, 0, 5.6, Math.PI, 2 * Math.PI, false);
  s.closePath();
  const g = new THREE.ShapeGeometry(s, 24);
  g.rotateX(-Math.PI / 2);
  return g;
}
`;export{n as default};
