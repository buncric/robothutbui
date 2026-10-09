const n=`// 🤖 Vỏ & khung robot Ø350 — vỏ đáy có lỗ & cột vít cho từng module, nắp trên, tháp lidar, khe cản va.
// Có: tháo tung (exploded view), quy trình TÁO TOÀN BỘ ROBOT từng bước, và tính TRỌNG TÂM + tải trên 3 điểm tựa:
//   N_xoay = W·x_G / L_c ;  N_T + N_P = W − N_xoay ;  N_P − N_T = W·z_G / (B/2)
//   Khi tăng/giảm tốc a: tải dồn trước–sau ΔN_xoay = −m·a·h_G / L_c  (h_G = chiều cao trọng tâm).

import { cadAttach } from '../../core/cadParts.js';

const R = 175;               // bán kính robot
const LC = 125;              // trục bánh → bánh xoay
const HALF_B = 117.5;        // nửa khoảng cách 2 bánh (wheelbase 235 mm, docs/01)
const H_CG = 42;             // chiều cao trọng tâm (mm)
const G = 9.81;

export default {
  id: 'vo-khung',
  name: 'Vỏ & khung robot',
  category: 'co-khi',
  order: 10,
  icon: '🤖',
  summary: 'Bộ xương của robot Ø350: vỏ đáy với lỗ và cột vít cho từng module, nắp trên, tháp lidar, khe cản. Tháo tung từng lớp, làm theo quy trình tháo cả robot, và xem trọng tâm quyết định tải lên 2 bánh và bánh xoay.',
  tags: ['vỏ', 'khung', 'chassis', 'tháo robot', 'teardown', 'trọng tâm', 'center of gravity', 'cột vít', 'boss'],

  params: [
    { id: 'cad', label: '🧊 Mô hình CAD thật (vỏ đáy + nắp trên + cản)', type: 'toggle', value: true, hint: 'Bật: vỏ/nắp/cản là CAD thật, các module (khối đơn giản) xếp theo bố trí của bản CAD. Tắt = mô hình học tự dựng (10 cột vít viền, gân, lỗ đơn giản)' },
    { id: 'explode', label: 'Tháo tung (exploded view)', type: 'range', min: 0, max: 1, step: 0.01, value: 0, unit: '' },
    { id: 'modules', label: 'Hiện các module bên trong', type: 'toggle', value: true },
    { id: 'cover', label: 'Hiện nắp trên', type: 'toggle', value: false },
    { id: 'battery', label: 'Pin', type: 'select', value: '4s1p', options: [['4s1p', '4S1P 18650 (2.5 Ah, ~0.25 kg)'], ['4s2p', '4S2P 18650 (5 Ah, ~0.45 kg)']] },
    { id: 'dust', label: 'Rác trong hộp bụi', type: 'range', min: 0, max: 100, step: 1, value: 20, unit: '%' },
    { id: 'lidar', label: 'Lắp lidar LDS02RR', type: 'toggle', value: true },
    { id: 'accel', label: '▶ Tăng tốc gấp (+2 m/s²)', type: 'button' },
    { id: 'brake', label: '■ Phanh gấp (−4 m/s²)', type: 'button' },
  ],
  readouts: [
    { id: 'm', label: 'Khối lượng robot', unit: 'kg' },
    { id: 'cg', label: 'Trọng tâm (trước trục bánh / lệch phải)', unit: 'mm' },
    { id: 'nl', label: 'Tải bánh TRÁI', unit: 'N' },
    { id: 'nr', label: 'Tải bánh PHẢI', unit: 'N' },
    { id: 'nc', label: 'Tải bánh xoay trước', unit: 'N' },
    { id: 'pc', label: 'Tỉ lệ tải trên bánh xoay', unit: '%' },
    { id: 'st', label: 'Nhận xét', unit: '' },
  ],
  scope: {
    window: 4,
    note: '(thời gian thực — bấm Tăng tốc / Phanh gấp để thấy tải dồn trước–sau)',
    channels: [
      { name: 'Bánh trái', unit: 'N', min: 0, max: 22, color: '#4cc2ff' },
      { name: 'Bánh phải', unit: 'N', min: 0, max: 22, color: '#3fcf8e' },
      { name: 'Bánh xoay', unit: 'N', min: -2, max: 10, color: '#ffd34d' },
    ],
  },

  steps: [
    { title: 'Bước 0 — Chuẩn bị', text: 'Sạc pin xuống ~30–50 % (an toàn hơn khi lỡ chập). Tắt công tắc nguồn, rút khỏi đế sạc. Chuẩn bị: tua vít PH1 + PH2 cán dài, que nạy nhựa, nhíp, khay nhiều ngăn, giấy + bút ghi "vít ở đâu, dài bao nhiêu", điện thoại chụp ảnh <b>trước mỗi bước</b>. Làm trên khăn mềm, đeo vòng chống tĩnh điện khi chạm bo mạch.' },
    { title: 'Bước 1 — Nhấc hộp bụi ra (từ nắp trên)', text: 'Mở nắp hộp bụi, nhấc hộp ra <b>trước khi lật robot</b> — nếu không rác đổ vào khoang quạt. Đổ rác luôn.' },
    { title: 'Bước 2 — Lật ngửa, mở nắp pin & RÚT GIẮC PIN TRƯỚC TIÊN', text: 'Lật robot nằm ngửa trên khăn. Tháo 2 vít nắp pin ở đáy, <b>rút giắc pin ngay</b> (bóp lẫy, kéo thân giắc, không kéo dây). Từ giờ trong robot không còn nguồn — tua vít lỡ chạm mạch cũng không chập. Pin Li-ion chập có thể cháy!' },
    { title: 'Bước 3 — Tháo chổi cạnh', text: '1 vít PT 2.6 ở giữa chổi. Bỏ vào ngăn "chổi cạnh".' },
    { title: 'Bước 4 — Tháo khung + chổi cuộn chính', text: 'Bóp 2 lẫy khung bảo vệ, nhấc chổi (đầu bạc trước). Bên dưới có thể có thêm vít giữ hộc chổi — ghi lại.' },
    { title: 'Bước 5 — Nạy bánh xoay', text: 'Bánh xoay ấn khớp: nạy thẳng ra. Lộ ra thêm 1 vít giấu bên trong hốc trên nhiều model.' },
    { title: 'Bước 6 — Tìm vít giấu dưới nhãn & chân cao su', text: 'Vỏ đáy giữ nắp trên bằng 8–14 vít PT 3×10/12. <b>Vài con nằm dưới nhãn dán (miết tay thấy lõm) và dưới chân/đệm cao su</b>. Bóc nhãn bằng máy sấy tóc cho đỡ rách. Vít dài/ngắn khác nhau — xếp đúng sơ đồ trên giấy.' },
    { title: 'Bước 7 — Lật lại, nhấc nắp trên', text: 'Lật robot thẳng lại, nhấc nắp <b>từ phía sau trước</b>, phía trước còn móc vào cản. Nhấc từ từ: dây nút bấm + cáp lidar nối từ nắp xuống bo mạch. Có lẫy cài quanh viền — nạy bằng que nhựa, đi vòng quanh.' },
    { title: 'Bước 8 — Rút các giắc, nhấc bo mạch', text: 'Chụp ảnh bo mạch rõ từng giắc. Rút: 2 module bánh (6 chân), quạt, chổi cuộn, chổi cạnh, cản (công tắc + IR), 4 cảm biến chống rơi, lidar, nút bấm, đế sạc. Đánh dấu bằng băng dính giấy. Tháo 4 vít bo mạch, nhấc ra.' },
    { title: 'Bước 9 — Tháo module bánh & quạt', text: 'Mỗi module bánh 2–3 vít PT 3×10 — giữ tay đòn kẻo lò xo bật. Quạt hút 3 vít, có gioăng cao su xốp — giữ nguyên gioăng (mất gioăng = hở gió).' },
    { title: 'Bước 10 — Tháo cản va', text: 'Tháo vít dẫn hướng + lò xo hồi hai bên, kéo cản về trước. Giờ chỉ còn vỏ đáy trơn: kiểm tra các cột vít (boss) có nứt không.' },
    { title: 'Bước 11 — Lắp lại (ngược lại từ bước 10 → 1)', text: 'Lắp từ trong ra ngoài: cản → bánh, quạt → bo mạch (cắm đủ giắc, kiểm tra theo ảnh) → nắp trên (<b>xem không kẹp dây</b>) → vít đáy (vặn tay, vào lỗ cũ, ~0.4 N·m) → bánh xoay, chổi → <b>giắc pin cuối cùng</b> → hộp bụi. Bật thử từng chức năng trước khi đậy hết nhãn.' },
  ],
  faults: [
    { id: 'nut-cot', label: 'Vặn quá lực bằng máy khoan → nứt cột vít', severity: 'loi',
      what: '<p>Nghe "tách" khi siết, vít quay trơn; sau đó nắp trên lỏng, robot kêu lạch cạch khi chạy, bụi lọt vào khoang điện tử, cản va bị lệch.</p>',
      why: '<p>Lực kẹp của vít <code>F ≈ T/(0.2·d)</code>: siết 1.5 N·m vào vít 3 mm → F ≈ 2 500 N, trong khi cột nhựa ABS thành mỏng chỉ chịu nổi ~600–800 N ứng suất vòng (hoop stress) → nứt dọc cột.</p>',
      fix: '<p>Vặn bằng tay hoặc tua vít điện có ly hợp đặt ~0.4 N·m. Vít tự ren: xoay ngược tới khi nghe "tách" rồi mới vặn xuôi. Cột đã nứt: quấn băng sợi + keo epoxy hoặc chèn ốc cấy ren nhiệt (heat-set insert) M3.</p>' },
    { id: 'kep-day', label: 'Kẹp dây pin giữa nắp và vỏ khi lắp lại', severity: 'hong',
      what: '<p>Đóng nắp nghe "cộm", ép mạnh vít cho kín. Lúc cắm pin: <b>tia lửa, mùi khét</b>, cầu chì 10 A đứt (hoặc tệ hơn: dây cháy, pin phồng nếu không có cầu chì).</p>',
      why: '<p>Mép nhựa/cột vít cắt thủng vỏ cách điện, lõi đồng dây VBAT chạm vít/khung kim loại nối GND → chập mạch trực tiếp pin 14.4 V: dòng hàng chục ampe, chỉ giới hạn bởi điện trở trong của pin (~0.1–0.2 Ω).</p>',
      fix: '<p>Đi dây theo rãnh/kẹp dây có sẵn, chụp ảnh đường dây trước khi tháo; đóng nắp phải nhẹ nhàng — cộm là dừng lại kiểm tra. Luôn có cầu chì gần cực pin. Cắm pin <b>sau cùng</b>.</p>' },
    { id: 'quen-giac', label: 'Quên cắm lại giắc module bánh trái', severity: 'loi',
      what: '<p>Bật robot: bánh trái không quay, robot xoay vòng tại chỗ hoặc báo lỗi "bánh trái"; PIC báo nhấc bánh trái liên tục (hoặc không bao giờ), encoder trái = 0.</p>',
      why: '<p>Giắc 6 chân mang cả nguồn động cơ, encoder và công tắc nhấc bánh. Thiếu giắc: chân RB1 thả nổi (chỉ còn kéo lên → luôn 5 V), RA4/T0CKI không có xung, động cơ hở mạch.</p>',
      fix: '<p>Danh sách kiểm tra giắc theo ảnh chụp ở bước 8. Bật thử trên bàn (bánh không chạm đất) trước khi đóng nắp.</p>' },
    { id: 'trong-tam', label: 'Gắn bình nước lau + pin 4S2P dồn ra sau', severity: 'nhe',
      what: '<p>Bánh xoay gần như không chạm sàn; khi tăng tốc robot <b>chổng mũi</b>, cảm biến chống rơi phía trước đọc sai (tưởng có hố), robot lùi liên tục; qua ngưỡng cửa thì kẹt bụng.</p>',
      why: '<p>Tải bánh xoay <code>N = W·x_G/L</code>. Thêm 0.35 kg nước ở x = −145 mm và pin nặng phía sau kéo x_G về gần 0 hoặc âm. Khi tăng tốc a, tải còn giảm thêm <code>m·a·h_G/L</code>.</p>',
      fix: '<p>Giữ trọng tâm trước trục bánh 10–20 mm: đặt pin/khối nặng gần tâm hoặc phía trước; tăng tốc từ từ (ramp) khi mang bình nước đầy.</p>' },
  ],

  info: {
    overview: \`
      <p><b>Vỏ & khung</b> là "bộ xương" giữ mọi module đúng vị trí. Robot hút bụi tròn Ø350 × ~96 mm gồm:</p>
      <ul>
        <li><b>Vỏ đáy</b> (chassis): tấm nhựa ABS/PC dày 2.5–3 mm có <b>lỗ</b> cho bánh, chổi, cảm biến và hàng trăm <b>cột vít (boss) + gân tăng cứng</b>.</li>
        <li><b>Nắp trên</b>: che bo mạch, có nút bấm, nắp hộp bụi, <b>tháp lidar</b> nhô cao ~10–18 mm.</li>
        <li><b>Cản va</b> ôm nửa trước, có khe trượt.</li>
      </ul>
      <p>Thử: kéo <b>Tháo tung</b> để thấy các lớp; tắt <b>Hiện các module</b> để nhìn các cột vít trên vỏ đáy. Đổi pin 4S2P, đổ đầy hộp bụi, tháo lidar → xem trọng tâm (chấm đỏ) và tải bánh xoay thay đổi. Bấm <b>Tăng tốc gấp</b>: tải bánh xoay tụt. Dùng bảng <b>Tháo lắp từng bước</b> để đi hết quy trình mổ robot.</p>\`,
    specs: [
      ['Kích thước', 'Ø350 mm, cao ~96 mm (có lidar), gầm cao ~8 mm'],
      ['Vật liệu', 'ABS hoặc PC/ABS đúc phun, dày 2–3 mm; gân tăng cứng 1–1.5 mm'],
      ['Khoảng cách 2 bánh', '235 mm (docs/01) · bánh xoay cách trục bánh ~125 mm'],
      ['Cột vít', 'Ø6–7 mm, lỗ mồi Ø2.4–2.5 cho vít PT 3; có gân chống nứt'],
      ['Vít', '40–60 con: PT 3×10/12 (vỏ), PT 2.6×8 (module), M2/M2.5 (động cơ)'],
      ['Khối lượng điển hình', '≈ 3–3.6 kg; trọng tâm trước trục bánh 10–20 mm, cao ~40 mm'],
    ],
    principle: \`
      <h4>1. Robot đứng trên 3 điểm</h4>
      <p>2 bánh chủ động (cách nhau B = 235 mm) + 1 bánh xoay phía trước (cách trục L = 125 mm). Cân bằng lực và mô-men với trọng tâm G(x_G, z_G):</p>
      <p><code>N_xoay = W·x_G/L</code> · <code>N_T + N_P = W − N_xoay</code> · <code>N_P − N_T = W·z_G/(B/2)</code></p>
      <p>Muốn 2 bánh bám tốt: dồn tải lên chúng (x_G nhỏ) nhưng N_xoay phải luôn &gt; 0, nếu không robot ngả ra sau.</p>
      <h4>2. Trọng tâm = trung bình có trọng số</h4>
      <p><code>x_G = Σ(mᵢ·xᵢ)/Σmᵢ</code>. Pin, quạt, hộp bụi là các khối nặng — vị trí của chúng quyết định trọng tâm.</p>
      <h4>3. Tải động khi tăng/giảm tốc</h4>
      <p>Lực quán tính <code>m·a</code> đặt ở độ cao h_G tạo mô-men: tăng tốc → tải dồn về bánh sau (bánh chủ động), bánh xoay nhẹ đi; phanh → dồn về trước. <code>ΔN_xoay = −m·a·h_G/L</code>.</p>
      <h4>4. Cột vít & gân tăng cứng</h4>
      <p>Thành cột ≈ 0.6 × chiều dày vỏ để không lõm bề mặt khi đúc; gân nối cột với vách chia lực. Siết quá lực → ứng suất vòng làm nứt cột (xem sự cố).</p>\`,
    inRobot: \`
      <ul>
        <li>Vị trí các module trong mô hình theo kiến trúc dự án (<code>docs/01</code>): 2 bánh (DRV8871 ← PIC CCP1/CCP2), chổi cuộn & chổi cạnh (MOSFET ← RD5/RD6), cản (RB4/RB5), 4 cảm biến chống rơi (AN1–AN4), quạt (ESP32 GPIO4/5), lidar (sau này, UART ESP32 GPIO16).</li>
        <li>Bo mạch tự làm (PIC16F877A + ESP32-S3 + buck XL4015) đặt phía trước dưới nắp, bắt bằng <b>cột đồng M3</b> vào các cột vít sẵn có (hoặc tấm gá in 3D).</li>
        <li>Đường dây: dây động lực (VBAT) đi riêng, xa dây tín hiệu encoder/UART; GND nối hình sao về cực âm pin.</li>
      </ul>\`,
    mistakes: \`
      <ul>
        <li>Lật robot khi chưa lấy hộp bụi → rác đổ vào khoang quạt/bo mạch.</li>
        <li>Tháo vít khi chưa rút giắc pin → tua vít chạm mạch, chập.</li>
        <li>Bỏ sót vít giấu dưới nhãn rồi cố nạy nắp → gãy lẫy, nứt vỏ.</li>
        <li>Lắp nhầm vít dài vào lỗ nông → đâm xuyên vỏ hoặc đâm vào pin.</li>
        <li>Kẹp dây khi đóng nắp → chập khi cắm pin.</li>
        <li>Thêm khối nặng ở phía sau (pin dự phòng, bình nước) → robot chổng mũi.</li>
      </ul>\`,
    quiz: [
      { q: 'Robot 3.2 kg, trọng tâm trước trục bánh 15 mm, bánh xoay cách trục 125 mm. Bánh xoay chịu bao nhiêu N?', a: 'W = 3.2 × 9.81 ≈ 31.4 N. N_xoay = 31.4 × 15/125 ≈ 3.8 N; mỗi bánh chủ động ≈ (31.4 − 3.8)/2 ≈ 13.8 N.' },
      { q: 'Khi tháo robot, vì sao phải rút giắc pin TRƯỚC khi tháo các vít khác?', a: 'Pin Li-ion 14.4 V có thể cấp hàng chục ampe; tua vít kim loại lỡ chạm 2 điểm mạch sẽ gây chập, tia lửa, hỏng linh kiện hoặc cháy. Rút pin trước thì robot "chết điện" hoàn toàn.' },
      { q: 'Robot 3.2 kg, h_G = 42 mm, tăng tốc 2 m/s². Tải bánh xoay giảm bao nhiêu?', a: 'ΔN = m·a·h_G/L = 3.2 × 2 × 0.042/0.125 ≈ 2.2 N — gần bằng toàn bộ tải tĩnh của bánh xoay → suýt chổng mũi.' },
    ],
  },

  build(ctx) {
    const { THREE, MAT, geom, label, readout, fx } = ctx;
    const { mesh, group, part, cyl, box, lathe, arcSector, wire } = geom;
    const root = new THREE.Group();
    const robot = new THREE.Group();          // toàn bộ robot (lật ngửa trong các bước tháo đáy)
    root.add(robot);
    const pivot = new THREE.Group();          // trục lật đặt ở giữa chiều cao robot
    pivot.position.y = 48;
    robot.add(pivot);
    const body = new THREE.Group();
    body.position.y = -48;
    pivot.add(body);

    // ---------- VỎ ĐÁY: tấm có lỗ (Shape + holes, đùn 3 mm) ----------
    const shape = new THREE.Shape();
    shape.absarc(0, 0, R - 3, 0, Math.PI * 2, false);
    const rectHole = (x0, x1, z0, z1) => { const h = new THREE.Path(); h.moveTo(x0, -z0); h.lineTo(x1, -z0); h.lineTo(x1, -z1); h.lineTo(x0, -z1); h.closePath(); shape.holes.push(h); };
    const circHole = (x, z, r) => { const h = new THREE.Path(); h.absarc(x, -z, r, 0, Math.PI * 2, true); shape.holes.push(h); };
    rectHole(-45, 45, -134, -100); rectHole(-45, 45, 100, 134);          // hốc 2 bánh
    rectHole(-12, 32, -88, 88);                                            // miệng hút chổi chính
    circHole(LC, 0, 14);                                                   // hốc bánh xoay
    circHole(110, 105, 4);                                                 // lỗ trục chổi cạnh
    const cliffAt = [[1.35, 'Cảm biến chống rơi #1 (trái) → AN1'], [0.5, 'Cảm biến chống rơi #2 (trước-trái) → AN2'], [-0.5, 'Cảm biến chống rơi #3 (trước-phải) → AN3'], [-1.35, 'Cảm biến chống rơi #4 (phải) → AN4']];
    cliffAt.forEach(([a]) => rectHole(Math.cos(a) * 152 - 6, Math.cos(a) * 152 + 6, -Math.sin(a) * 152 - 4, -Math.sin(a) * 152 + 4));
    const plateGeo = new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false, curveSegments: 48 });
    plateGeo.rotateX(-Math.PI / 2);
    plateGeo.translate(0, 8, 0);
    const shellMat = MAT.plasticDark.clone();
    const plate = mesh(plateGeo, shellMat);
    const wall = mesh(lathe([[R - 3, 8], [R - 0.5, 8], [R - 0.5, 50], [R - 3, 50]], 96), shellMat);
    const bottom = new THREE.Group();
    body.add(bottom);
    const plateG = group(plate, wall);
    bottom.add(part(plateG, 'Vỏ đáy (chassis) ABS 3 mm', 'Tấm đúc phun có lỗ cho bánh, chổi, bánh xoay, cảm biến chống rơi và rất nhiều cột vít + gân. Mọi module bắt vào đây.'));
    // gân tăng cứng hướng tâm
    const ribs = new THREE.Group();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 + 0.1;
      ribs.add(mesh(box(40, 6, 1.4), shellMat, { x: Math.cos(a) * 150, y: 14, z: -Math.sin(a) * 150, ry: a }));
    }
    bottom.add(part(ribs, 'Gân tăng cứng', 'Gân mỏng 1.2–1.5 mm chạy hướng tâm & dọc vách: tăng độ cứng mà không làm vỏ dày (đúc dày → co ngót, lõm).'));
    // cột vít theo từng nhóm
    const bossGeo = lathe([[1.2, 0], [3.5, 0], [3.5, 12], [1.2, 12]], 20);
    const bossGroups = {};
    const addBosses = (key, name, desc, pts, hgt = 12) => {
      const g = new THREE.Group();
      pts.forEach(([x, z]) => { const b = mesh(bossGeo, MAT.plasticDark, { x, y: 11, z }); b.scale.y = hgt / 12; g.add(b); });
      bottom.add(part(g, name, desc));
      bossGroups[key] = g;
      return g;
    };
    addBosses('wheel', 'Cột vít module bánh (2×3)', 'Mỗi module bánh bắt 3 vít PT 3×10 vào các cột này.', [[-50, -95], [50, -95], [-50, -140], [-50, 95], [50, 95], [-50, 140]]);
    addBosses('brush', 'Cột vít hộc chổi chính', '2 vít giữ hộc chổi + động cơ chổi.', [[10, -96], [10, 96]]);
    addBosses('pcb', 'Cột vít bo mạch (4 góc)', 'Bo mạch tự làm (PIC + ESP32) bắt bằng cột đồng M3 cao 10 mm lên 4 cột này.', [[45, -40], [125, -40], [45, 40], [125, 40]], 30);
    addBosses('fan', 'Cột vít quạt hút (3)', 'Quạt + gioăng xốp ép vào cửa ra hộp bụi.', [[-20, 35], [-20, 90], [-50, 62]], 20);
    const perim = [];
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 + 0.3; perim.push([Math.cos(a) * 163, -Math.sin(a) * 163]); }
    addBosses('cover', 'Cột vít nắp trên (10 cột viền)', 'Vít PT 3×12 vặn từ dưới đáy lên giữ nắp trên. Vài con giấu dưới nhãn/chân cao su.', perim, 36);
    const crack = mesh(box(1, 30, 8), MAT.plasticRed.clone(), { x: perim[2][0], y: 26, z: perim[2][1] });
    crack.visible = false;
    bottom.add(part(crack, 'Cột vít bị nứt', 'Nứt dọc do siết quá lực.'));
    const contacts = group(mesh(box(14, 1, 5), MAT.brass, { x: 160, y: 7.4, z: -18 }), mesh(box(14, 1, 5), MAT.brass, { x: 160, y: 7.4, z: 18 }));
    bottom.add(part(contacts, 'Tiếp điểm sạc', '2 lá đồng mạ, tì vào đế sạc. Nối về mạch sạc/BMS.'));
    // vít đáy + nhãn dán + chân cao su (vít giấu)
    const screwsBottom = new THREE.Group();
    perim.forEach(([x, z]) => screwsBottom.add(mesh(cyl(2.8, 2.8, 2, 16), MAT.zinc, { x, y: 7, z })));
    const sticker = mesh(box(70, 0.4, 45), MAT.plasticWhite, { x: perim[5][0] * 0.75, y: 7.6, z: perim[5][1] * 0.75 });
    const feet = group(...[perim[0], perim[7]].map(([x, z]) => mesh(cyl(6, 6, 2, 20), MAT.rubber, { x, y: 7.2, z })));
    body.add(part(screwsBottom, 'Vít đáy PT 3×12 (giữ nắp trên)', 'Có con giấu dưới nhãn dán và chân cao su — tìm hết trước khi nạy nắp.'));
    const hiders = new THREE.Group();
    hiders.add(sticker, feet);
    body.add(part(hiders, 'Nhãn dán + chân cao su (che vít)', 'Miết tay tìm chỗ lõm; bóc nhãn bằng máy sấy cho đỡ rách.'));

    // ---------- MODULES (khối đơn giản hóa) ----------
    const groups = [];        // { g, home, vec(explode), step(bước tháo), modFlag }
    const addG = (g, vec, step, isModule = true) => { body.add(g); groups.push({ g, home: g.position.clone(), vec: new THREE.Vector3(...vec), step, isModule }); return g; };
    // bánh xe
    const mkWheelModule = (side) => {
      const g = new THREE.Group();
      g.position.z = side * HALF_B;
      g.add(mesh(cyl(35, 35, 22, 40), MAT.rubber, { y: 35, rx: Math.PI / 2 }));
      g.add(mesh(cyl(29, 29, 23, 32), MAT.plasticWhite, { y: 35, rx: Math.PI / 2 }));
      g.add(mesh(box(120, 32, 22, 3), MAT.plasticGrey, { x: -5, y: 40, z: -side * 22 }));
      g.add(mesh(cyl(10, 10, 30, 24), MAT.steel, { x: -45, y: 44, z: -side * 45, rx: Math.PI / 2 }));
      return part(g, side < 0 ? 'Module bánh TRÁI' : 'Module bánh PHẢI', \`Động cơ + hộp số + encoder + lò xo + công tắc nhấc bánh (\${side < 0 ? 'RB1, encoder RA4/T0CKI, PWM CCP1' : 'RB2, encoder RC0/T1CKI, PWM CCP2'}). Xem trang "Module bánh xe".\`);
    };
    const wheelL = addG(mkWheelModule(-1), [0, -20, -70], 9);
    const wheelR = addG(mkWheelModule(1), [0, -20, 70], 9);
    const caster = addG(part(group(mesh(cyl(12.5, 12.5, 10, 24), MAT.rubber, { x: LC - 6, y: 12.5, rx: Math.PI / 2 }), mesh(cyl(12, 12, 8, 24), MAT.plasticBlack, { x: LC, y: 30 })),
      'Bánh xoay', 'Ấn khớp vào hốc tròn phía trước. Xem trang "Bánh xoay đa hướng".'), [0, -45, 0], 5);
    const mainBrush = addG(part(group(
      mesh(cyl(24, 24, 170, 32), MAT.plasticBlue, { x: 10, y: 24, rx: Math.PI / 2 }),
      mesh(box(56, 4, 180), MAT.plasticGrey, { x: 10, y: 3.5 }),
      mesh(cyl(14, 14, 36, 24), MAT.steel, { x: 10, y: 34, z: -110, rx: Math.PI / 2 }),
    ), 'Chổi cuộn chính + khung bảo vệ + động cơ', 'Nằm trong miệng hút giữa đáy. Động cơ bật/tắt bằng MOSFET ← RD5.'), [0, -70, 0], 4);
    const sideBrush = addG(part(group(
      mesh(cyl(9, 9, 6, 24), MAT.plasticWhite, { x: 110, y: 5, z: 105 }),
      ...[0, 1, 2].map((k) => mesh(box(70, 1.5, 4), MAT.plasticWhite, { x: 110 + Math.cos(k * 2.09) * 35, y: 3, z: 105 - Math.sin(k * 2.09) * 35, ry: k * 2.09 })),
      mesh(cyl(6, 6, 24, 20), MAT.steel, { x: 110, y: 26, z: 105 }),
    ), 'Chổi cạnh + động cơ', 'Góc trước-phải. MOSFET ← RD6. Xem trang "Chổi cạnh".'), [0, -55, 0], 3);
    const battery = new THREE.Group();
    const cells = new THREE.Group();
    battery.add(cells);
    const batCover = mesh(box(84, 2, 150), MAT.plasticDark, { x: -40, y: 7 });
    battery.add(batCover);
    addG(part(battery, 'Pin 18650 4S + nắp pin', 'Nằm ngay trên vỏ đáy, chính giữa (khối nặng nhất → đặt thấp & gần tâm). Nắp pin 2 vít ở đáy. Rút giắc pin TRƯỚC khi làm gì khác.'), [0, -55, 0], 2);
    const bin = addG(part(group(mesh(box(105, 50, 150, 4), MAT.plasticGrey, { x: -95, y: 58 }), mesh(box(60, 4, 120), MAT.plasticDark, { x: -95, y: 84 })),
      'Hộp bụi (lấy ra từ nắp trên)', 'Phía sau, nằm trên pin. Rác đầy làm trọng tâm dời ra sau. Xem trang "Hộp bụi + HEPA".'), [0, 130, 0], 1);
    const fan = addG(part(group(mesh(cyl(30, 30, 30, 32), MAT.plasticDark, { x: -30, y: 52, z: 62 }), mesh(cyl(16, 16, 26, 24), MAT.steel, { x: -30, y: 75, z: 62 })),
      'Quạt hút BLDC', 'Áp vào cửa ra hộp bụi qua gioăng xốp. ESP32 GPIO4 (PWM) / GPIO5 (FG).'), [0, 80, 40], 9);
    const pcbG = group(
      mesh(box(100, 1.6, 100), MAT.pcbGreen, { x: 85, y: 42 }),
      mesh(box(52, 5, 16), MAT.icBody, { x: 70, y: 45, z: -20 }),
      mesh(box(26, 4, 52), MAT.pcbBlack, { x: 110, y: 45, z: 20 }),
      mesh(box(24, 10, 18), MAT.plasticBlue, { x: 60, y: 48, z: 30 }),
    );
    const pcb = addG(part(pcbG, 'Bo mạch điều khiển (PIC16F877A + ESP32-S3 + buck 5 V)', 'Phía trước dưới nắp, bắt trên cột đồng M3. Mọi giắc module cắm về đây — chụp ảnh trước khi rút!'), [0, 90, 0], 8);
    const looms = group(
      wire([[85, 44, -45], [40, 40, -80], [0, 46, -100]], { radius: 1.6, color: 0x222222 }),
      wire([[85, 44, 45], [40, 40, 80], [0, 46, 100]], { radius: 1.6, color: 0x222222 }),
      wire([[60, 44, 0], [0, 36, 0], [-40, 30, 0]], { radius: 2.2, color: 0xd23b3b }),
    );
    const loomsP = addG(part(looms, 'Bó dây (giắc module, dây pin đỏ VBAT)', 'Đi theo rãnh/kẹp dây. Dây VBAT đỏ to nhất — không được để bị nắp kẹp.'), [0, 90, 0], 8);
    const bumper = addG(part(group(
      mesh(arcSector(R, R + 4, -1.75, 1.75, 44, 64), MAT.plasticBlack, { y: 33 }),
      mesh(arcSector(R - 12, R + 4, -1.75, 1.75, 3, 64), MAT.plasticBlack, { y: 56.5 }),
    ), 'Cản va + 2 công tắc (RB4/RB5)', 'Ôm 200° phía trước, khe trượt ~4 mm. Xem trang "Cản va".'), [80, 0, 0], 10, false);
    // nắp trên + lidar
    const coverMat = MAT.plasticWhite.clone();
    const topCover = addG(part(group(
      mesh(lathe([[0, 82], [150, 82], [168, 80], [R - 1, 74], [R - 1, 58], [R - 3, 58], [R - 3, 72], [166, 78], [0, 80]], 96), coverMat),
      mesh(box(80, 1, 110), MAT.plasticGrey, { x: -95, y: 82.6 }),
      mesh(cyl(6, 6, 1.5, 20), MAT.plasticGrey, { x: 120, y: 82.8, z: -15 }),
      mesh(cyl(6, 6, 1.5, 20), MAT.plasticGrey, { x: 120, y: 82.8, z: 15 }),
    ), 'Nắp trên', 'Có nắp hộp bụi (phía sau), 2 nút bấm, lỗ cho tháp lidar. Giữ bằng 10 vít từ đáy + lẫy cài viền.'), [0, 140, 0], 7, false);
    const lidar = addG(part(group(
      mesh(cyl(40, 40, 6, 48), MAT.plasticBlack, { x: 50, y: 86 }),
      mesh(cyl(36, 38, 12, 48), MAT.plasticBlack, { x: 50, y: 95 }),
      mesh(box(12, 6, 2), MAT.glass, { x: 86, y: 95 }),
    ), 'Tháp lidar LDS02RR', 'Đầu quét laser quay ~5 vòng/s, nhô cao hơn nắp ~15 mm. Cáp lidar nối xuống bo mạch → ESP32 UART2 (GPIO16).'), [0, 190, 0], 7, false);
    // trọng tâm
    const cgMark = group(mesh(new THREE.SphereGeometry(7, 20, 14), MAT.plasticRed.clone()), mesh(cyl(0.8, 0.8, 120, 8), MAT.plasticRed.clone(), { y: -60 }));
    cgMark.children.forEach((c) => (c.userData.noCut = true));
    robot.add(part(cgMark, 'Trọng tâm G', 'Chấm đỏ: vị trí trọng tâm tính từ khối lượng & vị trí từng module.'));
    const tri = group(...[[0, -HALF_B], [0, HALF_B], [LC, 0]].map(([x, z]) => mesh(cyl(5, 5, 1, 16), MAT.plasticYellow, { x, y: 0.6, z })));
    root.add(part(tri, '3 điểm tựa (2 bánh + bánh xoay)', 'Trọng tâm phải nằm trong tam giác này (và trước trục bánh) thì robot mới đứng vững.'));

    // ---------- MÔ HÌNH CAD THẬT ----------
    // Khung GLB của robot: Y lên, gốc = tâm robot trên sàn, trước = −Z, trái = −X → xoay −90° quanh Y
    // để trước = +X, trái = −Z như mô hình học. (CAD (x, y) Z-up → lab (y, ·, x).)
    const deg = Math.PI / 180;
    const rfIn = (parent) => { const g = new THREE.Group(); g.rotation.y = -Math.PI / 2; parent.add(g); return g; };
    let cLidBat = null, cLidBrush = null, cScrews = [];
    const cadCh = cadAttach(ctx, rfIn(bottom), 'robot/chassis-bottom', {
      onBottom: false,
      hide: [plateG, ribs, contacts, screwsBottom, ...Object.values(bossGroups), batCover],
      partDefault: ['Vỏ đáy (chassis) — CAD thật', 'Ø350, cao 65 mm.'],
      parts: {
        chassis_shell: ['Vỏ đáy (chassis) ABS — CAD thật', 'Sàn Ø344 dày 2,5 mm, gầm cao 9 mm. Có: 2 hốc bánh, khe chổi cuộn 200 × 48 + buồng chổi, hốc bánh xoay Ø36,5, 4 cửa sổ cảm biến chống rơi, hộc pin, lỗ trục chổi cạnh, kệ hộp bụi, bệ quạt, 4 trụ lidar, 4 cột vít nắp trên, bệ công tắc cản, khe xả gió, gân vòng + gân hướng tâm.'],
        lid_battery: ['Nắp hộc pin (2 vít PT 3×8)', 'Mở từ mặt đáy: tháo 2 vít rồi trượt nắp ra ~30 mm. Ngay dưới là pin — rút giắc pin trước tiên!'],
        screw_1: ['Vít nắp pin PT 3×8 (PH1)', 'Vít tự ren cho nhựa, vặn từ mặt đáy vào cột nhựa. Tháo bằng PH1, ~6 vòng.'],
        screw_2: ['Vít nắp pin PT 3×8 (PH1)', 'Vít tự ren cho nhựa, vặn từ mặt đáy vào cột nhựa. Tháo bằng PH1, ~6 vòng.'],
        lid_brush: ['Khung bảo vệ chổi cuộn (lid_brush)', 'Bóp 2 lẫy, lật khung xuống ~70° quanh bản lề phía trước rồi nhấc chổi cuộn ra (đầu bạc trước).'],
        contact_l: ['Tiếp điểm sạc (−)', 'Lá niken 30 × 6 mm tì vào đế sạc, nối về mạch sạc/BMS.'],
        contact_r: ['Tiếp điểm sạc (+)', 'Lá niken 30 × 6 mm tì vào đế sạc, nối về mạch sạc/BMS.'],
        'skid_*': ['Đệm trượt cao su', 'Hai chân trượt phía sau: đỡ khi robot ngả ra sau, chống trầy sàn.'],
      },
      onLoad(c) {
        cLidBrush = c.pivot('lid_brush', { axis: [1, 0, 0], origin: [0, 9, 14] });
        cLidBat = c.slide('lid_battery', [0, -1, 0]);
        cScrews = ['screw_1', 'screw_2'].map((n) => {
          const pv = c.pivot(n, { axis: [0, 1, 0] });          // tự quay quanh trục vít (tâm hộp bao)
          return pv && { pv, sl: c.slide(n, [0, -1, 0]) };     // rồi tụt ra theo −Y (ra khỏi mặt đáy)
        }).filter(Boolean);
      },
    });
    // 4 vít PT 3×8 giữ nắp trên, vặn từ dưới lên vào 4 cột vít (vị trí CAD: (±150, −40), (±125, 95))
    const TOP_SCREWS_LAB = [[-40, -150], [-40, 150], [95, -125], [95, 125]];
    const cadTopScrews = TOP_SCREWS_LAB.map(([x, z], i) => {
      const g = new THREE.Group();
      g.position.set(x, 10.6, z);
      body.add(g);
      return { g, c: cadAttach(ctx, g, 'robot/pt-screw-3x8', {
        onBottom: false, frame: false, rotateX: Math.PI, hide: [],
        partDefault: [\`Vít PT 3×8 giữ nắp trên #\${i + 1}\`, 'Vít tự ren cho nhựa, đầu PWA, PH1 — vặn từ mặt đáy lên cột vít của nắp trên. Có con giấu dưới nhãn dán/chân cao su. Siết tay ~0,4 N·m.'],
      }) };
    });
    // nắp trên CAD (nằm trong nhóm topCover → cùng được nhấc ra/tháo tung)
    let cLidTop = null, cBtnPower = null, cBtnHome = null;
    const cadTop = cadAttach(ctx, rfIn(topCover), 'robot/top-cover', {
      onBottom: false, frame: false,
      hide: [...topCover.children.filter((o) => o.isMesh)],
      partDefault: ['Nắp trên — CAD thật', 'Ø350, nhựa ABS.'],
      parts: {
        cover_shell: ['Nắp trên (CAD thật)', 'Tấm Ø344 dày 2,5 mm, mép bo R6; váy che phía sau xuống tới đường phân khuôn z = 40; lỗ Ø78 cho tháp lidar có gờ; 4 cột vít gặp cột vít vỏ đáy (vít vặn từ dưới lên) + gân tăng cứng mặt trong.'],
        lid_top: ['Nắp lật hộp bụi', 'Bản lề ở mép trước, mở ~100° để nhấc hộp bụi ra mà không cần tháo nắp trên.'],
        btn_power: ['Nút nguồn (cao su)', 'Nhấn lún ~1,2 mm. Giữ 3 s để tắt robot trước khi tháo.'],
        btn_home: ['Nút về đế sạc (cao su)', 'Nhấn lún ~1,2 mm.'],
        led_ring: ['Vòng đèn trạng thái (ống dẫn sáng)', 'Xanh = đang bật bình thường · tắt = đã tắt nguồn · cam nhấp nháy = lỗi (vd. mất giắc bánh).'],
      },
      onLoad(c) {
        cLidTop = c.pivot('lid_top', { axis: [1, 0, 0], origin: [0, 82, 54.5] });
        cBtnPower = c.slide('btn_power', [0, -1, 0]);
        cBtnHome = c.slide('btn_home', [0, -1, 0]);
      },
    });
    // cản trước CAD (trong nhóm bumper → được kéo ra ở bước 10)
    const cadBump = cadAttach(ctx, rfIn(bumper), 'robot/bumper', {
      onBottom: false, frame: false,
      hide: [...bumper.children.filter((o) => o.isMesh)],
      partDefault: ['Cản va + 2 công tắc (RB4/RB5) — CAD thật', 'Ôm 200° phía trước, trượt ~4 mm. Xem trang "Cản va".'],
      parts: {
        bumper_shell: ['Cản va (bumper) — CAD thật', 'Cung 200°, R175, cao 64 mm; 2 vấu gạt công tắc ở ±35°, 4 trụ lò xo. Xem trang "Cản va".'],
        soft_strip: ['Dải đệm mềm TPE', 'Giảm va đập, chống trầy đồ nội thất.'],
        window_ir: ['Cửa sổ hồng ngoại', 'Cho tia IR của cảm biến tường/đế sạc đi qua.'],
        springs: ['4 lò xo hồi cản', 'Đẩy cản ra ngoài sau mỗi lần va.'],
      },
    });
    // dời các module (khối đơn giản) về đúng chỗ của bản CAD khi đang xem CAD
    const CAD_D = new Map([
      [caster, [17, 0, 0]], [mainBrush, [-50, 0, 0]], [sideBrush, [-5, 0, 4.7]], [battery, [123.5, 0, 0]],
      [bin, [-8, -7.5, 0]], [fan, [-68.6, -15, -172.5]], [pcb, [10, -2, 0]], [lidar, [-10, 0, 0]],
    ]);
    groups.forEach((gr) => { gr.cadD = new THREE.Vector3(...(CAD_D.get(gr.g) || [0, 0, 0])); });
    const lbCaster = label(robot, 'Bánh xoay', [LC, 50, 0]);

    label(robot, 'Bánh trái', [0, 75, -HALF_B - 30]);
    label(robot, 'Bánh phải', [0, 75, HALF_B + 30]);
    label(robot, 'Hộp bụi', [-95, 110, 0]);
    label(robot, 'Bo mạch PIC + ESP32', [85, 70, 0]);
    label(robot, 'Lidar', [50, 120, 0]);

    // ---------- khối lượng (kg) & vị trí (x, z) ----------
    // vị trí (x, z) các khối nặng theo bố trí đang hiện (mô hình học / bản CAD) — chấm trọng tâm khớp với hình
    const massList = (p, c) => {
      const L = [
        [0.95, 6, 0],            // vỏ đáy + nắp + cản + vít
        [0.21, 0, -HALF_B], [0.21, 0, HALF_B],
        [0.03, c ? 142 : LC, 0],
        [0.17, c ? -40 : 10, -12],         // chổi chính + động cơ
        [0.05, c ? 105 : 110, c ? 110 : 105],
        [p.battery === '4s2p' ? 0.45 : 0.25, c ? 84 : -40, 0],
        [0.12, c ? -103 : -95, 0],          // hộp bụi rỗng
        [0.3 * (p.dust / 100), c ? -103 : -95, 0],
        [0.18, c ? -98.6 : -30, c ? -110 : 62],         // quạt
        [0.14, c ? 95 : 85, 0],           // bo mạch + dây
        [0.45, 75, 0],           // cảm biến chống rơi, cản IR, dây, gioăng, linh tinh (dồn phía trước)
      ];
      if (p.lidar) L.push([0.18, c ? 40 : 50, 0]);
      if (fault === 'trong-tam') { L.push([0.35, -145, 0]); L[6] = [0.45, c ? 30 : -80, 0]; }
      return L;
    };

    // ---------- mô phỏng ----------
    let fault = null, step = -1, stepPos = 0, flip = 0, acc = 0, accT = 0, accTarget = 0, sparkDone = false, lastBat = null;
    let btnT = 0, lastLed = '';
    const cellGeo = cyl(9.25, 9.25, 65, 20);
    // giắc 6 chân bánh trái bị bỏ quên (sự cố "quên cắm giắc")
    const looseConn = group(mesh(box(14, 6, 5, 0.5), MAT.plasticWhite.clone(), { x: 30, y: 60, z: -70 }), wire([[30, 60, -70], [20, 62, -85], [5, 50, -95]], { radius: 1.2, color: 0x222222 }));
    looseConn.children[0].material.emissive.set(0xff2020); looseConn.children[0].material.emissiveIntensity = 0.8;
    looseConn.visible = false;
    body.add(part(looseConn, 'Giắc module bánh trái — CHƯA CẮM', 'Giắc nằm lơ lửng: động cơ, encoder và công tắc nhấc bánh trái đều mất kết nối.'));
    const tmp = new THREE.Vector3();
    const flipSteps = (s) => s >= 2 && s <= 6;

    return {
      object: root,
      onAction(id) {
        if (id === 'accel') { accTarget = 2; accT = 0.6; }
        if (id === 'brake') { accTarget = -4; accT = 0.3; }
      },
      setStep(i) { if (step < 0 && i >= 0) btnT = 0.6; step = i; },   // vào bước 0: nhấn nút nguồn để tắt
      triggerFault(id) {
        fault = id; sparkDone = false;
        if (id === 'kep-day') { fx.sparks([40, 60, -60], { count: 70, speed: 70, size: 1.2 }); fx.smoke([40, 60, -60], { size: 14, duration: 4 }); fx.flash([40, 60, -60], { size: 40, color: 0xffe0a0 }); }
      },
      resetFault() { fault = null; crack.visible = false; sparkDone = false; },
      update(dt, t, p) {
        // ---------- tháo lắp + tháo tung ----------
        const target = step >= 11 ? 0 : Math.max(0, step);
        stepPos += (target - stepPos) * Math.min(1, dt * 3);
        flip += ((flipSteps(step) ? 1 : 0) - flip) * Math.min(1, dt * 3);
        pivot.rotation.x = flip * Math.PI;
        const cadOn = cadCh.sync(p);
        cadTop.sync(p); cadBump.sync(p);
        const scrOn = cadTopScrews.map((s) => s.c.sync(p)).some(Boolean);
        groups.forEach(({ g, home, vec, step: k, isModule, cadD }) => {
          const e = Math.max(p.explode, Math.max(0, Math.min(1, stepPos - k + 1)));
          g.position.copy(home).addScaledVector(vec, e);
          if (cadOn) g.position.add(cadD);
          if (isModule) g.visible = p.modules;
        });
        // nắp trên: chỉ hiện khi bật "Hiện nắp trên" hoặc đang trong quy trình tháo (bước 0–6)
        const coverShown = p.cover || (step >= 0 && step < 11);
        topCover.visible = coverShown || p.explode > 0.05;
        lidar.visible = p.lidar;
        const eScrew = Math.max(p.explode, Math.max(0, Math.min(1, stepPos - 5)));
        screwsBottom.position.y = -25 * eScrew;
        screwsBottom.visible = eScrew < 0.98;
        hiders.position.y = -12 * eScrew; hiders.position.x = 40 * eScrew;
        crack.visible = fault === 'nut-cot';
        // ---------- CAD: vít nắp trên, nắp pin, khung chổi, nắp lật hộp bụi, nút, đèn ----------
        const cl = (v) => Math.max(0, Math.min(1, v));
        cadTopScrews.forEach((s) => {           // tụt ra 25 mm + quay ~6 vòng (bước 6 / tháo tung)
          s.g.position.y = 10.6 - 25 * eScrew;
          s.g.rotation.y = -eScrew * 5.9 * 2 * Math.PI;
          s.g.visible = eScrew < 0.98;
        });
        if (scrOn) {
          // vít giấu: nhãn dán che vít #4 (95, 125), chân cao su che vít #1 (−40, −150) và #2 (−40, 150)
          sticker.position.set(80, 8.6, 105);
          feet.children[0].position.set(-40, 8, -150); feet.children[1].position.set(-40, 8, 150);
        } else {
          sticker.position.set(perim[5][0] * 0.75, 7.6, perim[5][1] * 0.75);
          feet.children[0].position.set(perim[0][0], 7.2, perim[0][1]); feet.children[1].position.set(perim[7][0], 7.2, perim[7][1]);
        }
        mainBrush.children[1].visible = !cadOn;              // khung bảo vệ tự dựng ↔ lid_brush của CAD
        if (cadOn) {
          crack.position.set(-44.7, 25.5, -150);           // nứt dọc cột vít nắp trên #1 (cột Ø9, cao 11,5→40)
          crack.scale.y = 0.9;
          const sB = cl(stepPos - 1);                       // bước 2: 2 vít nắp pin ra (0–0,5) rồi trượt nắp pin 30 mm
          cScrews.forEach(({ pv, sl }) => { pv.set(-cl(sB * 2) * 5.9 * 2 * Math.PI); sl?.set(12 * cl(sB * 2)); });
          cLidBat?.set(30 * cl((sB - 0.5) * 2));
          cLidBrush?.set(70 * deg * cl((stepPos - 3) * 2.5));   // bước 4: lật khung chổi xuống trước khi nhấc chổi
          cLidTop?.set(-100 * deg * cl(stepPos * 3));            // bước 1: mở nắp lật để nhấc hộp bụi
          btnT = Math.max(0, btnT - dt);
          cBtnPower?.set(btnT > 0.2 ? 1.2 : 0);
          cBtnHome?.set(0);
          const led = fault === 'kep-day' || step >= 0 ? 'off' : fault === 'quen-giac' ? (Math.sin(t * 8) > 0 ? 'err' : 'off') : 'on';
          if (led !== lastLed && cadTop.loaded) {
            lastLed = led;
            cadTop.glow('led_ring', led === 'on' ? 0x30c8ff : led === 'err' ? 0xff7a1a : 0x000000, led === 'off' ? 0 : 1.6);
          }
        } else {
          crack.position.set(perim[2][0], 26, perim[2][1]);
          crack.scale.y = 1;
          lastLed = '';
        }
        lbCaster?.position.set(cadOn ? 142 : LC, 50, 0);
        if (fault === 'nut-cot') { topCover.position.y += Math.sin(t * 40) * 0.8; }
        looseConn.visible = fault === 'quen-giac' && p.modules;
        if (p.battery !== lastBat) {        // dựng lại các cell khi đổi loại pin (không tạo mới mỗi khung hình)
          lastBat = p.battery;
          cells.clear();
          const nRows = p.battery === '4s2p' ? 2 : 1;
          for (let r = 0; r < nRows; r++) for (let k = 0; k < 4; k++) cells.add(mesh(cellGeo, MAT.plasticBlue, { x: -68 + k * 19, y: 20, z: (r - (nRows - 1) / 2) * 68, rx: Math.PI / 2 }));
        }

        // ---------- trọng tâm & tải ----------
        const L = massList(p, cadOn);
        let m = 0, mx = 0, mz = 0;
        L.forEach(([mi, x, z]) => { m += mi; mx += mi * x; mz += mi * z; });
        const xg = mx / m, zg = mz / m;
        const W = m * G;
        // gia tốc (xung ngắn) → tải dồn
        if (accT > 0) { accT -= dt; acc += (accTarget - acc) * Math.min(1, dt * 20); } else acc += (0 - acc) * Math.min(1, dt * 8);
        const dNc = -(m * acc * H_CG) / LC;
        const nc = (W * xg) / LC + dNc;
        const nSum = W - nc;
        const nr = (nSum + (W * zg) / HALF_B) / 2;
        const nl = nSum - nr;
        cgMark.position.set(xg, 42, zg);
        cgMark.visible = stepPos < 0.5 && p.explode < 0.05;
        // robot chổng mũi khi bánh xoay mất tải
        const tipAng = nc < 0 ? Math.min(0.08, -nc * 0.02) : 0;
        robot.rotation.z = tipAng;

        const st = fault === 'kep-day' ? '⚡ Chập VBAT — cầu chì đứt!' : fault === 'quen-giac' ? '⚠ Bánh trái không phản hồi' : fault === 'nut-cot' ? '⚠ Nắp lỏng, kêu lạch cạch' : nc < 0 ? '⚠ CHỔNG MŨI — bánh xoay nhấc khỏi sàn!' : nc < 0.08 * W ? '⚠ Bánh xoay quá nhẹ' : nc > 0.3 * W ? '⚠ Dồn trước quá nhiều — bánh chủ động dễ trượt' : 'Cân bằng tốt';
        readout('m', m);
        readout('cg', \`\${xg.toFixed(1)} / \${zg.toFixed(1)}\`);
        readout('nl', nl);
        readout('nr', nr);
        readout('nc', nc);
        readout('pc', (100 * nc) / W);
        readout('st', st);
        return [nl, nr, nc];
      },
    };
  },
};
`;export{n as default};
