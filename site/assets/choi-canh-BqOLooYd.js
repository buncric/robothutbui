const n=`// 🌼 Chổi cạnh (side brush) — 3 chùm lông quay ~150 vòng/phút ở góc trước-phải robot, gom rác ở mép tường
// vào làn của miệng hút chính. Mô phỏng hạt (hệ tọa độ gắn robot, nhìn từ trên):
//   • Sàn trôi lùi với tốc độ robot v.  • Đầu lông chỉ chạm sàn trong "cung tiếp xúc" phía trước (do trục chổi nghiêng).
//   • Lông quét qua hạt → hạt nhận vận tốc tiếp tuyến e·ω·r (e ≈ 0.7) rồi trượt chậm dần với gia tốc μ·g.
//   • Hạt lọt vào miệng hút → "gom được"; trôi ra sau robot → "sót"; bị hất ra ngoài mép robot → "văng ra".

import { cadAttach } from '../../core/cadParts.js';

const R_TIP = 75;            // bán kính quét (chổi Ø150)
const R_HUB = 9;
const HUB_Y = 9;
const MU_G = 0.5 * 9810;     // mm/s² — hạt cát trượt trên sàn
const E_HIT = 0.7;
// vị trí trong hệ tọa độ chổi (gốc = trục chổi, +X = hướng robot tiến, +Z = bên phải)
const CENTER = [-110, -105];             // tâm robot
const INLET = { x0: -128, x1: -88, z0: -190, z1: -20 };   // miệng hút chính
const ROBOT_R = 175;

export default {
  id: 'choi-canh',
  name: 'Chổi cạnh',
  category: 'co-khi',
  order: 8,
  icon: '🌼',
  summary: 'Chùm lông 3 cánh quay chậm ở góc trước-phải, quét rác sát chân tường vào làn hút của chổi chính. Mô phỏng hạt cho thấy vì sao chổi phải nghiêng, quay đúng chiều và đúng tốc độ.',
  tags: ['chổi cạnh', 'side brush', 'chổi bên', 'mép tường', 'N20', 'RD6'],

  params: [
    { id: 'cad', label: '🧊 Mô hình CAD thật (chổi cạnh 3 nhánh + động cơ N20)', type: 'toggle', value: true, hint: 'CAD có đúng 3 chùm lông; chọn "5 chùm" sẽ hiện chổi tự dựng. Tắt = mô hình học tự dựng' },
    { id: 'rpm', label: 'Tốc độ chổi', type: 'range', min: 40, max: 300, step: 5, value: 180, unit: 'vòng/phút' },
    { id: 'v', label: 'Tốc độ robot', type: 'range', min: 0, max: 0.4, step: 0.01, value: 0.25, unit: 'm/s' },
    { id: 'tilt', label: 'Góc nghiêng trục chổi về trước', type: 'range', min: 0, max: 12, step: 0.5, value: 6, unit: '°', hint: 'Nghiêng để đầu lông chỉ chạm sàn ở nửa trước — nửa sau nhấc lên, không hất rác ngược ra.' },
    { id: 'arms', label: 'Số chùm lông', type: 'select', value: '3', options: [['3', '3 chùm'], ['5', '5 chùm']] },
    { id: 'slow', label: 'Làm chậm', type: 'select', value: '3', options: [['1', '1× (thật)'], ['3', '3×'], ['10', '10×']] },
    { id: 'reset', label: '↺ Rải lại rác', type: 'button' },
  ],
  readouts: [
    { id: 'tip', label: 'Tốc độ đầu lông v = ω·r', unit: 'm/s' },
    { id: 'col', label: 'Hạt vào miệng hút', unit: 'hạt' },
    { id: 'miss', label: 'Hạt bị sót lại', unit: 'hạt' },
    { id: 'out', label: 'Hạt bị văng ra ngoài', unit: 'hạt' },
    { id: 'eff', label: 'Hiệu suất gom', unit: '%' },
    { id: 'arc', label: 'Cung tiếp xúc sàn', unit: '°' },
    { id: 'st', label: 'Nhận xét', unit: '' },
  ],
  scope: {
    window: 8,
    note: '(thời gian mô phỏng — đã làm chậm theo lựa chọn)',
    channels: [
      { name: 'Hiệu suất gom', unit: '%', min: 0, max: 100, color: '#3fcf8e' },
      { name: 'Hạt văng ra / s', unit: '1/s', min: 0, max: 6, color: '#ff6b9a' },
      { name: 'Tốc độ đầu lông', unit: 'm/s', min: 0, max: 2.5, color: '#4cc2ff' },
    ],
  },

  steps: [
    { title: 'Bước 0 — Chổi cạnh trên trục', text: 'Tắt robot, lật ngửa. Chổi cạnh có ký hiệu <b>L/R hoặc màu</b> ở chân lông — robot 1 chổi luôn dùng chổi bên phải. Dụng cụ: tua vít PH1 (có loại chỉ cần rút tay).' },
    { title: 'Bước 1 — Tháo vít giữa', text: 'Vặn ngược chiều kim đồng hồ 1 vít PT 2.6 ở tâm chổi. Giữ chổi bằng tay kia để trục động cơ không quay theo.' },
    { title: 'Bước 2 — Rút chổi khỏi trục', text: 'Kéo thẳng chổi ra. Lỗ chổi là lỗ chữ D/lục giác ăn khớp đầu trục hộp số N20.' },
    { title: 'Bước 3 — Gỡ tóc & nắn lông', text: 'Tóc quấn rất chặt ở <b>chân trục</b> giữa chổi và vỏ — dùng nhíp gỡ hết. Lông cong vênh: nhúng nước nóng ~60 °C vài chục giây rồi vuốt thẳng, để khô. Lông ngắn/rụng nhiều → thay chổi.' },
    { title: 'Bước 4 — Lắp lại', text: 'Cắm chổi đúng chiều (ký hiệu R cho bên phải), vặn vít vừa tay (~0.2 N·m). Bật thử: nhìn từ trên xuống, chổi bên phải phải quay <b>ngược chiều kim đồng hồ</b> (gạt rác vào trong).' },
  ],
  faults: [
    { id: 'nguoc-chieu', label: 'Đảo dây động cơ → chổi quay ngược chiều', severity: 'loi',
      what: '<p>Rác ở mép tường bị <b>hất văng ra xa</b> thay vì vào miệng hút; robot đi xong còn sạch hơn… hai bên robot lại bẩn hơn. Số hạt văng ra tăng vọt.</p>',
      why: '<p>Ở cung tiếp xúc phía trước, đầu lông phải chuyển động <b>vào trong</b> (về phía miệng hút). Quay ngược thì vận tốc tiếp tuyến <code>ω·r</code> hướng <b>ra ngoài</b>, cộng thêm lông chéo ngược chiều → hất rác ra.</p>',
      fix: '<p>Kiểm tra chiều quay sau khi đấu dây (chổi phải: ngược chiều kim đồng hồ nhìn từ trên). Động cơ DC đổi chiều bằng cách đảo 2 dây; nhớ diode bảo vệ MOSFET vẫn phải đúng cực.</p>' },
    { id: 'toc-truc', label: 'Tóc quấn chặt chân trục', severity: 'loi',
      what: '<p>Chổi quay chậm, giật cục, có lúc đứng hẳn; động cơ N20 nóng. Rác mép tường bị sót nhiều.</p>',
      why: '<p>Tóc siết giữa chổi và vỏ tạo mô-men ma sát lớn so với động cơ N20 rất nhỏ (mô-men cỡ 0.05–0.1 N·m sau hộp số) → tốc độ tụt còn ~30 %. Kẹt lâu: dòng kẹt làm nóng cuộn dây.</p>',
      fix: '<p>Gỡ tóc chân trục mỗi 1–2 tuần. Thiết kế tốt có nắp chặn tóc trên chân chổi.</p>' },
    { id: 'long-cong', label: 'Lông chổi cong vênh, ngắn đi (chổi cũ)', severity: 'nhe',
      what: '<p>Chổi không còn chạm sàn đều, quét được ít, góc tường còn bụi.</p>',
      why: '<p>Bán kính quét giảm từ 75 mm còn ~50 mm và lông mềm, ít đàn hồi → ít hạt bị quét, vận tốc truyền cho hạt nhỏ.</p>',
      fix: '<p>Nắn lông bằng nước nóng hoặc thay chổi mới (vật tư tiêu hao 3–6 tháng).</p>' },
  ],

  info: {
    overview: \`
      <p>Chổi chính nằm giữa robot nên không với tới <b>mép tường, chân tủ, góc phòng</b>. <b>Chổi cạnh</b> gắn ở góc trước-phải, lông thò ra khỏi thân robot, quay chậm để gạt rác từ mép vào làn của miệng hút.</p>
      <p>Ba yếu tố quyết định nó gom tốt hay hất rác lung tung:</p>
      <ul>
        <li><b>Chiều quay</b>: ở phía trước, đầu lông phải chuyển động vào trong.</li>
        <li><b>Góc nghiêng</b> trục: chỉ nửa trước chạm sàn.</li>
        <li><b>Tốc độ</b>: chậm quá thì bỏ sót, nhanh quá thì hạt bị hất văng.</li>
      </ul>
      <p>Thử: kéo <b>Góc nghiêng</b> về 0° → cả vòng lông chạm sàn, nửa sau hất rác ra ngoài. Kéo <b>Tốc độ chổi</b> lên 300 vòng/phút → số hạt văng ra tăng. Bấm sự cố <b>quay ngược chiều</b>.</p>\`,
    specs: [
      ['Đường kính quét', '≈ 140–160 mm (3 hoặc 5 chùm lông nylon dài ~65 mm)'],
      ['Tốc độ', '≈ 100–200 vòng/phút → đầu lông ≈ 1–1.5 m/s'],
      ['Động cơ', 'DC hộp số mini kiểu N20 (6–12 V) hoặc động cơ 14.4 V có hộp số, dòng 50–150 mA, kẹt ~0.5 A'],
      ['Góc nghiêng trục', '≈ 5–8° về trước-ngoài'],
      ['Vị trí', 'Góc trước-phải, tâm cách tâm robot ~150 mm, lông thò ra ngoài mép ~5–10 mm'],
      ['Gắn', '1 vít PT 2.6 hoặc lẫy rút tay; lỗ D/lục giác'],
    ],
    principle: \`
      <h4>1. Vận tốc đầu lông</h4>
      <p><code>v = ω·r = 2π·n/60·r</code>. 150 vòng/phút, r = 75 mm → 1.18 m/s.</p>
      <h4>2. Truyền vận tốc cho hạt</h4>
      <p>Lông quét qua hạt trong cung tiếp xúc → hạt nhận vận tốc ≈ <code>e·ω·r</code> (e ≈ 0.7) theo phương tiếp tuyến, rồi trượt chậm dần với gia tốc <code>a = μ·g ≈ 5 m/s²</code>. Quãng trượt <code>s = v²/(2μg)</code>: v = 0.8 m/s → 6.5 cm — vừa đủ đưa hạt vào làn hút. Quá nhanh → hạt bay xa, văng khỏi làn.</p>
      <h4>3. Cung tiếp xúc nhờ nghiêng trục</h4>
      <p>Trục nghiêng góc α thì đầu lông ở phía trước thấp hơn phía sau khoảng <code>2·r·sinα</code> (r = 75, α = 6° → 16 mm). Chỉ cung phía trước chạm sàn → lông chỉ gạt vào trong, không hất ngược ra ở nửa sau.</p>
      <h4>4. Kết hợp với chuyển động robot</h4>
      <p>Trong hệ quy chiếu gắn robot, sàn và rác trôi lùi với tốc độ v_robot. Robot chạy quá nhanh so với tốc độ chổi → rác vượt qua vùng quét trước khi bị gạt (sót).</p>\`,
    inRobot: \`
      <ul>
        <li>Theo <code>docs/01</code>: chổi cạnh bật/tắt bằng MOSFET IRLZ44N nối chân <b>RD6 (chân 29)</b> của PIC, nguồn VBAT, diode SS34 song song ngược với động cơ.</li>
        <li>Động cơ 14.4 V có hộp số riêng (hoặc N20 + mạch hạ áp). Chỉ bật/tắt — tốc độ do hộp số quyết định.</li>
        <li>Firmware tắt chổi khi robot bị nhấc (<code>drop_mask</code>) để tránh kẹp tay.</li>
      </ul>\`,
    mistakes: \`
      <ul>
        <li>Lắp chổi trái vào trục phải (lông chéo ngược) hoặc đảo dây → hất rác ra ngoài.</li>
        <li>Cho chổi quay quá nhanh (cấp thẳng 14.4 V cho động cơ 6 V) → rác bắn tung tóe, động cơ nóng, mòn lông nhanh.</li>
        <li>Không gỡ tóc chân trục → động cơ nhỏ quá tải, cháy.</li>
        <li>Siết vít giữa quá tay → toét lỗ nhựa của chổi.</li>
      </ul>\`,
    quiz: [
      { q: 'Chổi cạnh bán kính 70 mm quay 180 vòng/phút. Tốc độ đầu lông?', a: 'v = 2π × 180/60 × 0.07 ≈ 1.32 m/s.' },
      { q: 'Chổi cạnh bên phải robot, nhìn từ trên xuống phải quay theo chiều nào? Vì sao?', a: 'Ngược chiều kim đồng hồ: ở phía trước (cung chạm sàn), đầu lông chuyển động từ phải sang trái — vào trong, về phía miệng hút.' },
      { q: 'Vì sao trục chổi cạnh phải nghiêng vài độ?', a: 'Để chỉ cung phía trước chạm sàn. Nếu nằm phẳng, nửa sau của vòng quay cũng chạm sàn và gạt rác ngược ra ngoài.' },
    ],
  },

  build(ctx) {
    const { THREE, MAT, geom, label, readout, fx } = ctx;
    const { mesh, group, part, cyl, box, arcSector } = geom;
    const root = new THREE.Group();

    // ---------- sàn ----------
    const floorMat = MAT.plasticGrey.clone();
    floorMat.color.set(0xb89a72);
    root.add(part(mesh(box(380, 2, 360), floorMat, { x: -60, y: -1, z: -40 }), 'Sàn nhà', 'Trong hệ quy chiếu gắn robot, sàn và rác trôi lùi với tốc độ robot.'));
    const wall = mesh(box(380, 30, 6), MAT.plasticWhite, { x: -60, y: 15, z: 120 });
    root.add(part(wall, 'Chân tường', 'Rác hay đọng ở mép tường — chỗ chổi chính không với tới.'));

    // ---------- một phần thân robot (vỏ đáy) ----------
    const shellMat = MAT.plasticDark.clone();
    shellMat.transparent = true; shellMat.opacity = 0.55;
    const shell = mesh(arcSector(0, ROBOT_R, -1.8, 0.7, 3, 64), shellMat, { x: CENTER[0], y: 22, z: CENTER[1] });
    root.add(part(shell, 'Vỏ đáy robot (vẽ mờ)', 'Robot Ø350. Chổi cạnh ở góc trước-phải, tâm cách tâm robot ~150 mm.'));
    const inlet = group(
      mesh(box(INLET.x1 - INLET.x0, 1, INLET.z1 - INLET.z0), MAT.plasticBlack, { x: (INLET.x0 + INLET.x1) / 2, y: 0.6, z: (INLET.z0 + INLET.z1) / 2 }),
      mesh(cyl(20, 20, INLET.z1 - INLET.z0, 32), MAT.plasticBlue, { x: (INLET.x0 + INLET.x1) / 2, y: 20, z: (INLET.z0 + INLET.z1) / 2, rx: Math.PI / 2 }),
    );
    root.add(part(inlet, 'Miệng hút + chổi cuộn chính', 'Hạt lọt vào vùng này sẽ bị chổi chính hất lên và hút vào hộp bụi.'));

    // ---------- chổi cạnh ----------
    const motor = group(
      mesh(cyl(6, 6, 16, 24), MAT.steel, { y: 40 }),
      mesh(box(12, 9, 10), MAT.brass, { y: 28 }),
      mesh(cyl(1.5, 1.5, 12, 12), MAT.steel, { y: 20 }),
    );
    root.add(part(motor, 'Động cơ hộp số mini (kiểu N20)', 'Bật/tắt bằng MOSFET từ chân RD6 của PIC. Dòng chạy ~0.1 A, kẹt ~0.5 A.'));
    const tiltG = new THREE.Group();
    tiltG.position.y = HUB_Y;
    root.add(tiltG);
    const spinG = new THREE.Group();
    tiltG.add(spinG);
    const hub = group(mesh(cyl(R_HUB, R_HUB + 1, 6, 32), MAT.plasticWhite), mesh(cyl(2.4, 2.4, 1.2, 16), MAT.zinc, { y: -3.3 }));
    spinG.add(part(hub, 'Đế chổi + vít giữa', 'Lỗ chữ D ăn khớp trục hộp số; 1 vít PT 2.6 giữ chổi.'));
    const armsWrap = new THREE.Group();
    spinG.add(armsWrap);
    const bristleMat = MAT.plasticYellow.clone();
    bristleMat.color.set(0xd9d2c0);
    let nArms = 0, reach = R_TIP;
    function buildArms(n, r) {
      armsWrap.children.forEach((c) => c.traverse((o) => o.geometry?.dispose()));
      armsWrap.clear();
      for (let k = 0; k < n; k++) {
        const arm = new THREE.Group();
        arm.rotation.y = (k * 2 * Math.PI) / n;
        for (let j = 0; j < 9; j++) {
          const spread = (j - 4) * 0.025;
          const len = r - R_HUB + (j % 3) * 2;
          const g = cyl(0.45, 0.8, len, 5);
          g.translate(0, len / 2, 0);
          const b = mesh(g, bristleMat);
          // bó lông chéo về phía sau chiều quay một chút (lông "kéo" chứ không "đẩy")
          b.rotation.set(0, spread - 0.12, -Math.PI / 2 - 0.11, 'YZX');   // nằm ngang theo +X, rủ xuống ~6°
          b.position.set(Math.cos(spread) * (R_HUB - 1), -1, -Math.sin(spread) * (R_HUB - 1));
          arm.add(b);
        }
        armsWrap.add(part(arm, \`Chùm lông \${k + 1}\`, 'Lông nylon đàn hồi, chéo nhẹ ngược chiều quay để "kéo" rác vào trong.'));
      }
    }
    label(root, 'Chổi cạnh', [0, 30, 20]);

    // ---------- MÔ HÌNH CAD THẬT ----------
    // Chổi (robot/side-brush-3arm): gốc GLB = trục quay, y = 0 ở điểm đầu lông chạm sàn → đặt trong spinG (quay theo mô phỏng),
    // KHÔNG căn giữa theo hộp bao (hộp bao 3 nhánh lệch khỏi trục). Nhánh 1 hướng +X giống chùm lông tự dựng số 1.
    const C = {};
    const cadBrush = cadAttach(ctx, spinG, 'robot/side-brush-3arm', {
      param: (p) => p.cad && p.arms === '3',
      onBottom: false, offset: [0, -HUB_Y, 0],
      hide: [hub, armsWrap],
      partDefault: ['Chổi cạnh 3 nhánh (CAD thật)', 'Mô hình CAD theo chổi Roborock S5 / Xiaomi gen1: vòng đầu lông Ø150, đế Ø28, 3 chùm lông nylon rủ xuống 9°, lỗ chữ D cho trục N20.'],
      parts: {
        hub: ['Đế chổi PP + lỗ chữ D', 'Lỗ chữ D Ø3 (mặt vát 2.5) ăn khớp trục hộp số N20; 3 gân trên mặt truyền mô-men. Có ký hiệu L/R.'],
        bristles: ['3 chùm lông nylon (rủ 9°, xòe ±7°)', 'Mỗi chùm dài 54 mm, rủ xuống sàn và chéo nhẹ để "kéo" rác vào trong. Lông cong/ngắn đi → quét kém.'],
        screw_1: ['Vít PT 2.6 × 10 giữa chổi', 'Bắt từ phía sàn vào đầu trục. Tháo: vặn ngược chiều kim đồng hồ, giữ chổi bằng tay kia.'],
      },
      onLoad(c) {
        C.screw = c.pivot('screw_1', { axis: [0, 1, 0] });
        C.mScrew = c.slide('screw_1', [0, -1, 0]);
        C.bristles = c.node('bristles');
      },
    });
    // Động cơ N20 (robot/n20-gearmotor): lật ngược (trục chĩa xuống) — đầu trục ở y ≈ 7 mm, lọt vào lỗ D của đế chổi.
    const motorTilt = new THREE.Group();
    motorTilt.position.y = HUB_Y;
    root.add(motorTilt);
    const N20_GEARS = [['gear_1', 0], ['gear_2', 3.3], ['gear_3', 3.3], ['gear_4', 0], ['gear_5', 0], ['gear_6', -3.3], ['gear_7', -3.3], ['gear_8', 0]];
    const N20_I = (34 / 10) * (26 / 9) * (24 / 9) * (22 / 9);   // tỉ số minh hoạ của mô hình CAD (≈ 64)
    const cadMotor = cadAttach(ctx, motorTilt, 'robot/n20-gearmotor', {
      rotateX: Math.PI, onBottom: false, offset: [0, 32, 0],
      hide: [motor],
      partDefault: ['Động cơ giảm tốc N20 (CAD thật)', 'Động cơ DC Ø12 × 10 mm + hộp số kim loại 12 × 10 × 9 mm, trục ra chữ D Ø3. Bật/tắt bằng MOSFET từ chân RD6 của PIC; chạy ~0.1 A, kẹt ~0.5 A.'],
      parts: {
        can: ['Vỏ động cơ N20', 'Động cơ DC chổi than nhỏ (12 × 10 mm), quay hàng nghìn vòng/phút.'],
        endcap: ['Nắp sau + chổi than', '2 cực hàn dây; nên hàn tụ 100 nF chống nhiễu.'],
        term_pos: ['Cực (+)', 'Đảo 2 dây → chổi quay ngược chiều (xem sự cố).'],
        term_neg: ['Cực (−)', 'Nối ra MOSFET (RD6).'],
        mark_pos: ['Chấm đánh dấu cực (+)', 'Nối đúng chiều để chổi gạt rác VÀO trong.'],
        gb_plates: ['Tấm đỡ hộp số (thép)', 'Hai tấm thép giữ trục các bánh răng.'],
        gb_clamps: ['Kẹp hộp số', 'Ghép tấm đỡ với vỏ động cơ.'],
        gb_pins: ['Trục bánh răng', 'Các trục thép nhỏ giữa 2 tấm đỡ.'],
        bushing: ['Bạc trục ra', 'Bạc đồng đỡ trục ra. Tóc quấn ở đây làm chổi nặng, động cơ nóng.'],
        shaft: ['Trục ra chữ D Ø3', 'Quay bằng tốc độ chổi (~150–180 vòng/phút); mặt vát D truyền mô-men sang đế chổi.'],
        gear_1: ['Bánh răng con trên trục động cơ (z = 10)', 'Quay nhanh nhất — bằng tốc độ động cơ.'],
        'gear_*': ['Bánh răng hộp số N20', \`Hộp số 3–4 tầng nhìn qua 2 khe hở bên hông; mô hình CAD minh hoạ i ≈ \${N20_I.toFixed(0)}. Các bánh liền kề quay ngược chiều nhau.\`],
      },
      labels: [['Động cơ N20 (RD6)', 'can', [0, 10, 0]]],
      onLoad(c) {
        C.shaft = c.pivot('shaft', { axis: [0, 1, 0], origin: [0, 0, 0] });
        C.gears = N20_GEARS.map(([n, x]) => c.pivot(n, { axis: [0, 1, 0], origin: [x, 0, 0] }));
        const hm = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.9, 8, 24), new THREE.MeshStandardMaterial({ color: 0x3b2a1a, roughness: 0.9 }));
        hm.rotation.x = Math.PI / 2;
        hm.position.y = 25.5;
        hm.scale.setScalar(1);
        const w = new THREE.Group();
        w.scale.setScalar(0.001);                // node GLB tính bằng mét → nhóm này dùng mm
        w.add(hm);
        c.obj.add(w);
        hm.visible = false;
        hm.userData.part = { name: 'Tóc quấn chân trục', desc: 'Tóc quấn chặt giữa đế chổi và bạc trục → ma sát lớn, chổi quay giật, động cơ nóng.' };
        C.hair = hm;
      },
    });
    label(root, 'Miệng hút', [(INLET.x0 + INLET.x1) / 2, 45, -100]);
    label(root, 'Chân tường', [-60, 35, 120]);

    // ---------- hạt rác ----------
    const NP = 80;
    const pMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1.6, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), NP);
    pMesh.raycast = () => {};
    root.add(pMesh);
    const cRest = new THREE.Color(0x6b4a2a), cHit = new THREE.Color(0xffa733), cOut = new THREE.Color(0xff3b3b);
    const rnd = (a, b) => a + Math.random() * (b - a);
    const spawn = (q, farAhead) => {
      // dải rác sát mép phải robot
      q.x = farAhead ? rnd(90, 260) : rnd(-60, 260); q.z = rnd(-15, 85); q.ux = 0; q.uz = 0; q.state = 0;
    };
    const P = Array.from({ length: NP }, () => { const q = {}; spawn(q, false); return q; });
    const dummy = new THREE.Object3D();

    // ---------- mô phỏng ----------
    let theta = 0, col = 0, miss = 0, out = 0, effAvg = 50, outRate = 0, fault = null, step = -1, stepPos = 0;
    const angOf = (x, z) => Math.atan2(-z, x);           // góc theo quy ước rotation.y
    const angDist = geom.angDist;

    return {
      object: root,
      onAction(id) { if (id === 'reset') { P.forEach((q) => spawn(q, false)); col = miss = out = 0; effAvg = 50; } },
      setStep(i) { step = i; },
      triggerFault(id) { fault = id; col = miss = out = 0; effAvg = 50; },
      resetFault() { fault = null; if (C.hair) C.hair.visible = false; },
      update(dt, t, p) {
        const n = Number(p.arms);
        const r = fault === 'long-cong' ? 52 : R_TIP;
        if (n !== nArms || r !== reach) { buildArms(n, r); nArms = n; reach = r; }
        const slow = Number(p.slow);
        const h = dt / slow;
        // ---------- tháo lắp ----------
        stepPos += ((step >= 4 ? 0 : Math.max(0, step)) - stepPos) * Math.min(1, dt * 3);
        const off = Math.max(0, Math.min(1, stepPos - 1));
        tiltG.position.y = HUB_Y - 30 * off;
        const running = stepPos < 0.3;
        // ---------- động học ----------
        let rpm = running ? p.rpm : 0;
        if (fault === 'toc-truc') rpm *= 0.3 + 0.15 * Math.sin(t * 7);
        const dir = fault === 'nguoc-chieu' ? -1 : 1;
        const w = (dir * rpm * 2 * Math.PI) / 60;           // rad/s, + = ngược kim đồng hồ nhìn từ trên (gạt vào trong)
        const tiltR = (p.tilt * Math.PI) / 180;
        tiltG.rotation.z = -tiltR;                           // đầu lông phía trước hạ thấp
        tiltG.rotation.x = tiltR * 0.4;                      // nghiêng thêm ra ngoài một chút
        // nửa cung tiếp xúc: phẳng → chạm cả vòng (180°), nghiêng 6° → ±~95°, 12° → ±~50°
        const hw = Math.max(0.8, Math.PI * (1 - p.tilt / 14));
        const contactC = 0;                                  // tâm cung tiếp xúc: phía trước
        const prev = theta;
        theta += w * h;
        spinG.rotation.y = theta;
        // ---------- CAD thật ----------
        motorTilt.rotation.copy(tiltG.rotation);
        const brushOn = cadBrush.sync(p), motorOn = cadMotor.sync(p);
        motorTilt.position.y = HUB_Y;
        if (brushOn && C.mScrew) {
          const s1 = Math.min(1, stepPos);
          // CAD: nhấc cả cụm lên 20 mm (như lật robot) để vít rút ra phía dưới, rồi rút động cơ/trục khỏi lỗ D (+18 mm)
          tiltG.position.y = HUB_Y + 20 * s1;
          motorTilt.position.y = HUB_Y + 20 * s1 + 18 * off;
          C.mScrew.set(12 * s1);
          C.screw.set(-s1 * 6 * Math.PI);                    // vặn ngược chiều kim đồng hồ nhìn từ dưới
          if (C.bristles) { const k = reach / R_TIP; C.bristles.scale.set(k, 1, k); }
        }
        if (motorOn && C.shaft) {
          // trục ra = chổi (GLB lật ngược → đổi dấu); mỗi cặp bánh răng đảo chiều theo tỉ số z2/z1
          const out = -theta;
          const a67 = -out * 22 / 9, a45 = -a67 * 24 / 9, a23 = -a45 * 26 / 10, a1 = -a23 * 34 / 10;
          const ang = [a1, a23, a23, a45, a45, a67, a67, out];
          C.shaft.set(out);
          C.gears.forEach((g, k) => g?.set(ang[k]));
          if (C.hair) C.hair.visible = fault === 'toc-truc';
        }
        const vR = p.v * 1000;                               // mm/s
        let outNow = 0;
        // ---------- hạt ----------
        P.forEach((q, i) => {
          const d = Math.hypot(q.x, q.z);
          if (d > R_HUB && d < reach && running) {
            const a = angOf(q.x, q.z);
            if (angDist(a, contactC) < hw) {
              for (let k = 0; k < n; k++) {
                const off0 = (k * 2 * Math.PI) / n;
                // cánh quét qua góc a trong bước này?
                const a0 = prev + off0, a1 = theta + off0;
                const span = Math.abs(a1 - a0);
                const da = Math.atan2(Math.sin(a - a0), Math.cos(a - a0)) * Math.sign(a1 - a0 || 1);
                if (da >= 0 && da <= span + 1e-6) {
                  // vận tốc tiếp tuyến tại đầu lông: d/dθ (d·cos a, −d·sin a) = d·(−sin a, −cos a)
                  // hệ số truyền ngẫu nhiên quanh E_HIT; chổi càng nhanh, hướng văng càng tản mát
                  const sp = (E_HIT + (Math.random() - 0.5) * 0.3) * w * d;
                  // đầu lông nhanh → hạt bị "búng" nảy lên, hướng văng tản mát tăng theo bình phương tốc độ
                  const kTip = (Math.abs(w) * reach) / 1200;
                  const scat = (Math.random() - 0.5) * 1.1 * Math.min(4, kTip * kTip);
                  q.ux = sp * -Math.sin(a + scat);
                  q.uz = sp * -Math.cos(a + scat);
                  q.state = 1;
                  break;
                }
              }
            }
          }
          // trượt chậm dần (vận tốc so với sàn)
          const u = Math.hypot(q.ux, q.uz);
          if (u > 0) { const nu = Math.max(0, u - MU_G * h); q.ux *= nu / u; q.uz *= nu / u; }
          q.x += (q.ux - vR) * h;
          q.z += q.uz * h;
          // phân loại
          if (q.x > INLET.x0 && q.x < INLET.x1 && q.z > INLET.z0 && q.z < INLET.z1) { col++; spawn(q, true); }
          else if (q.z > 118 || (q.state === 1 && Math.hypot(q.x - CENTER[0], q.z - CENTER[1]) > ROBOT_R + 25 && q.z > 60)) { out++; outNow++; spawn(q, true); }
          else if (q.x < INLET.x0 - 20) { if (q.z > INLET.z1) miss++; else col++; spawn(q, true); }
          else if (q.z < -200) { out++; outNow++; spawn(q, true); }      // trượt quá xa, vượt qua cả làn hút
          dummy.position.set(q.x, 1.6, q.z);
          dummy.updateMatrix();
          pMesh.setMatrixAt(i, dummy.matrix);
          pMesh.setColorAt(i, q.state === 1 ? (u > 300 ? cOut : cHit) : cRest);
        });
        pMesh.instanceMatrix.needsUpdate = true;
        if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;
        const total = col + miss + out;
        const eff = total > 0 ? (100 * col) / total : 0;
        effAvg += (eff - effAvg) * Math.min(1, h * 2);
        outRate += (outNow / Math.max(h, 1e-4) - outRate) * Math.min(1, h * 3);

        const tip = (Math.abs(w) * reach) / 1000;
        const st = fault === 'nguoc-chieu' ? '⚠ Quay ngược: hất rác ra ngoài!' : p.tilt < 2 ? '⚠ Trục phẳng: nửa sau hất rác ngược' : tip > 2.0 ? '⚠ Quá nhanh: rác bắn văng' : tip < 0.9 ? '⚠ Quá chậm: sót rác' : 'Tốt';
        readout('tip', tip);
        readout('col', col);
        readout('miss', miss);
        readout('out', out);
        readout('eff', eff);
        readout('arc', (2 * hw * 180) / Math.PI);
        readout('st', st);
        return [effAvg, Math.min(6, outRate), tip];
      },
    };
  },
};
`;export{n as default};
