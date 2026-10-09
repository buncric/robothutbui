const n=`// 🔘 Bánh xoay đa hướng (caster) — bánh tự lựa phía trước robot.
// Động học bánh lái theo (trailing caster): bánh nằm SAU trục xoay một đoạn d (trail) và không trượt ngang:
//   dψ/dt = |V|·sin(β − ψ)/d − ω        (trong hệ tọa độ robot)
// V = vận tốc điểm gắn bánh xoay = v·x̂ + ω × r_c (r_c = 125 mm phía trước trục bánh chủ động), β = hướng của V.
// → bánh luôn "đuổi theo" hướng chuyển động với hằng số thời gian τ = d/|V|; lùi lại thì nó phải lật 180°.

import { cadAttach, ownMaterial } from '../../core/cadParts.js';

const LC = 125;          // khoảng cách trục 2 bánh chủ động → trục xoay bánh trước (mm)
const RW = 12.5;         // bán kính bánh xoay (Ø25)
const N_C = 3.0;         // tải trên bánh xoay (N) — xem trang Lò xo
const MU_LAT = 0.6;      // ma sát trượt ngang cao su/sàn
const MODES = {
  thang: 'Chạy thẳng',
  cua: 'Ôm cua trái (bán kính ~0.2 m)',
  xoay: 'Quay tại chỗ',
  zigzag: 'Zig-zag (đi thẳng – quay 90° – đi thẳng)',
};

export default {
  id: 'banh-xoay',
  name: 'Bánh xoay đa hướng (caster)',
  category: 'co-khi',
  order: 5,
  icon: '🔘',
  summary: 'Bánh nhỏ phía trước giữ robot thăng bằng trên 3 điểm. Không có động cơ — nó tự xoay theo hướng di chuyển nhờ "độ lệch đuôi" (trail). Xem nó lật 180° khi robot lùi và cạ ngang khi kẹt tóc.',
  tags: ['caster', 'bánh xoay', 'bánh tự lựa', 'trail', 'swivel', 'bánh trước'],

  params: [
    { id: 'cad', label: '🧊 Mô hình CAD thật (bánh xoay Roborock S5)', type: 'toggle', value: true, hint: 'Tắt = mô hình học tự dựng (càng dựng lại theo độ lệch đuôi d bạn chọn, thấy cả vòng bi)' },
    { id: 'cut', label: 'Cắt bổ cốc cài (thấy càng + bánh bên trong)', type: 'toggle', value: true, hint: 'Chỉ áp dụng cho mô hình CAD: cắt nửa cốc và vỏ đáy phía người xem' },
    { id: 'mode', label: 'Kiểu chạy của robot', type: 'select', value: 'zigzag', options: Object.entries(MODES) },
    { id: 'speed', label: 'Tốc độ tiến', type: 'range', min: 0.1, max: 0.5, step: 0.01, value: 0.3, unit: 'm/s' },
    { id: 'trail', label: 'Độ lệch đuôi d (trail)', type: 'range', min: 2, max: 20, step: 0.5, value: 9, unit: 'mm', hint: 'Khoảng cách ngang từ trục xoay đứng đến điểm bánh chạm sàn. Lớn → ổn định nhưng xoay chậm và quét rộng.' },
    { id: 'rev', label: '⇄ Đảo chiều đột ngột (lùi / tiến)', type: 'button' },
    { id: 'slow', label: 'Làm chậm', type: 'select', value: '4', options: [['1', '1× (thật)'], ['4', '4×'], ['20', '20×']] },
  ],
  readouts: [
    { id: 'psi', label: 'Góc càng bánh ψ (so với robot)', unit: '°' },
    { id: 'beta', label: 'Hướng chuyển động điểm gắn β', unit: '°' },
    { id: 'err', label: 'Lệch hướng β − ψ', unit: '°' },
    { id: 'vm', label: 'Tốc độ điểm gắn |V|', unit: 'm/s' },
    { id: 'tau', label: 'Hằng số thời gian τ = d/|V|', unit: 'ms' },
    { id: 'rpm', label: 'Tốc độ bánh xoay', unit: 'vòng/phút' },
    { id: 'scrub', label: 'Lực cạ ngang lên sàn', unit: 'N' },
    { id: 'sweep', label: 'Bán kính quét khi xoay (khoảng hở cần có)', unit: 'mm' },
  ],
  scope: {
    window: 5,
    note: '(thời gian mô phỏng — đã làm chậm theo lựa chọn)',
    channels: [
      { name: 'Hướng V (β)', unit: '°', min: -180, max: 180, color: '#4cc2ff' },
      { name: 'Góc càng ψ', unit: '°', min: -180, max: 180, color: '#ffd34d' },
      { name: 'Lực cạ ngang', unit: 'N', min: 0, max: 2.5, color: '#ff6b9a' },
    ],
  },

  steps: [
    { title: 'Bước 0 — Bánh xoay lắp trên vỏ đáy', text: 'Bánh xoay phía trước, giữa thân robot, cách trục 2 bánh chủ động ~125 mm. Tắt nguồn và lật ngửa robot. Dụng cụ: tua vít dẹt nhỏ hoặc que nạy nhựa, nhíp, cồn, tăm bông.' },
    { title: 'Bước 1 — Nạy cả cụm ra', text: 'Đa số robot chỉ <b>ấn khớp (snap-fit)</b>: luồn tua vít dẹt vào khe cạnh, bẩy nhẹ và kéo thẳng ra. Không vặn xoắn — gãy vấu cài là cụm sẽ rơi khi chạy. Một số đời dùng 2 vít PT 2.6.' },
    { title: 'Bước 2 — Rút trục, tách bánh khỏi càng', text: 'Trục bánh là chốt thép Ø2 mm ép vào càng; đẩy ra bằng que nhỏ. Kiểm tra: lốp mòn dẹt một phía (dấu hiệu từng bị kẹt không quay), lỗ bánh bị rơ.' },
    { title: 'Bước 3 — Gỡ tóc & vệ sinh ổ xoay', text: 'Tóc hay quấn ở <b>hai đầu trục bánh</b> và <b>quanh trục xoay đứng</b>. Gỡ sạch, lau ổ xoay bằng cồn, không tra dầu (dầu hút bụi thành bùn).' },
    { title: 'Bước 4 — Lắp lại', text: 'Lắp bánh vào càng, đóng trục, ấn cả cụm vào lỗ đến khi nghe "tách". Thử bằng tay: càng phải xoay 360° trơn, bánh lăn nhẹ, không lắc.' },
  ],
  faults: [
    { id: 'ket-xoay', label: 'Ổ xoay kẹt bụi/tóc — càng không xoay được', severity: 'loi',
      what: '<p>Robot khó quay, đi thẳng thì bị kéo lệch; nghe tiếng rít; bánh xoay để lại vệt đen trên sàn. Odometry lệch góc vì lực cạ tạo mô-men quay thân robot.</p>',
      why: '<p>Bánh không xoay theo hướng chuyển động → phải <b>trượt ngang</b>: lực ma sát trượt <code>F = μ·N ≈ 0.6 × 3 = 1.8 N</code>, đặt cách tâm robot 125 mm → mô-men nhiễu <code>≈ 0.23 N·m</code> mà 2 bánh chủ động phải chống lại.</p>',
      fix: '<p>Vệ sinh ổ xoay định kỳ (mỗi tháng), gỡ tóc quanh trục đứng. Firmware: so sánh góc quay từ encoder với IMU để phát hiện trượt bất thường.</p>' },
    { id: 'toc-quan', label: 'Tóc quấn trục bánh — bánh không lăn', severity: 'loi',
      what: '<p>Bánh xoay bị kéo lê như một cái chân, kêu "rèn rẹt", mòn dẹt một chỗ; robot chậm hơn, khó leo thảm.</p>',
      why: '<p>Bánh không lăn thì ma sát lăn (rất nhỏ) biến thành ma sát trượt <code>F = μ·N ≈ 1.8 N</code> kéo lùi robot — tương đương 10 % lực kéo tối đa của 2 bánh chủ động.</p>',
      fix: '<p>Tháo bánh, gỡ tóc hai đầu trục; nếu lốp đã mòn dẹt thì thay bánh.</p>' },
    { id: 'mat-banh', label: 'Lắp thiếu bánh xoay (vấu cài gãy, rơi mất)', severity: 'loi',
      what: '<p>Mũi robot chúi xuống ~8 mm, đáy và cản va cạ sàn; cảm biến chống rơi phía trước đọc sai (quá gần sàn); chổi cuộn ép quá sâu → dòng tăng.</p>',
      why: '<p>Robot cần <b>3 điểm tựa</b> không thẳng hàng để đứng vững. Thiếu bánh trước, thân xoay quanh trục bánh chủ động cho tới khi mép trước chạm sàn.</p>',
      fix: '<p>Kiểm tra vấu cài trước khi lắp; nếu gãy dùng 2 vít PT 2.6 + keo epoxy gia cố. Không chạy robot khi thiếu bánh trước.</p>' },
  ],

  info: {
    overview: \`
      <p>Robot hút bụi đứng trên <b>3 điểm</b>: 2 bánh chủ động hai bên và 1 <b>bánh xoay</b> phía trước. Bánh xoay không có động cơ, không có cảm biến — nó chỉ đỡ trọng lượng và <b>tự quay theo hướng robot đi</b>.</p>
      <p>Bí quyết là <b>độ lệch đuôi (trail)</b>: điểm bánh chạm sàn nằm <i>sau</i> trục xoay đứng một đoạn d. Giống bánh xe đẩy siêu thị: kéo đi đâu, bánh "lết" theo đó.</p>
      <p>Thử: chọn <b>Zig-zag</b> rồi xem đường vàng (ψ) đuổi theo đường xanh (β) trên máy hiện sóng. Bấm <b>Đảo chiều đột ngột</b> để thấy càng lật 180°. Kéo <b>d</b> về 2 mm: bánh xoay theo gần như tức thì nhưng dễ rung lắc (shimmy); d = 20 mm: xoay chậm, quét rộng.</p>\`,
    specs: [
      ['Bánh', 'Ø25 × 10 mm, nhựa POM + vỏ cao su TPU'],
      ['Độ lệch đuôi d', '≈ 8–10 mm'],
      ['Ổ xoay', 'Vòng bi đỡ chặn mini hoặc bạc nhựa, xoay tự do 360°'],
      ['Vị trí', 'Trên trục dọc robot, cách trục bánh chủ động ~125 mm về phía trước'],
      ['Tải', '≈ 2–5 N (10–15 % trọng lượng robot)'],
      ['Lắp ráp', 'Ấn khớp (snap-fit) vào vỏ đáy, tháo không cần dụng cụ đặc biệt'],
      ['Biến thể', 'Một số robot dùng "bánh bi" (ball caster) hoặc gắn thêm đĩa sọc trắng-đen + cảm biến IR để phát hiện robot bị kẹt (bánh xoay đứng yên dù bánh chủ động quay)'],
    ],
    principle: \`
      <h4>1. Vận tốc của điểm gắn</h4>
      <p>Robot tiến với tốc độ v và quay với tốc độ góc ω. Điểm gắn bánh xoay cách tâm quay r_c nên có vận tốc <code>V = v + ω × r_c</code>. Quay tại chỗ (v = 0): điểm gắn đi ngang với tốc độ <code>ω·r_c</code>.</p>
      <h4>2. Bánh tự lựa theo hướng V</h4>
      <p>Bánh không thể trượt ngang. Điều kiện này cho phương trình: <code>dψ/dt = |V|·sin(β − ψ)/d − ω</code>. Khi ψ lệch β, mô-men do lực sàn tác dụng sau trục xoay kéo càng về đúng hướng — giống chiếc chong chóng gió.</p>
      <p>Thời gian để bánh xoay theo: <code>τ ≈ d/|V|</code>. Với d = 9 mm, V = 0.3 m/s → τ = 30 ms.</p>
      <h4>3. Lật 180° khi lùi</h4>
      <p>Hướng ψ = β là cân bằng <b>ổn định</b>; ψ = β + 180° là cân bằng <b>không ổn định</b>. Khi robot lùi, β đổi 180° → bánh phải quét một nửa vòng tròn bán kính <code>d + r_bánh</code> — vỏ phải chừa khoảng hở.</p>
      <h4>4. Lực cạ khi bánh không theo kịp</h4>
      <p>Nếu ổ xoay kẹt, bánh trượt ngang với lực <code>F = μ·N·sign(v_ngang)</code>.</p>\`,
    inRobot: \`
      <ul>
        <li>Không nối điện với PIC/ESP32 trong thiết kế của dự án — nhưng ảnh hưởng trực tiếp tới <b>odometry</b>: bánh xoay kẹt làm robot quay lệch so với tính toán từ encoder 2 bánh.</li>
        <li>Phân bố tải (xem trang <b>Lò xo treo bánh xe</b>): trọng tâm lệch trước trục bánh 12 mm → bánh xoay gánh ≈ 3 N. Lắp thêm lidar/pin nặng ở phía sau → bánh xoay mất tải, robot chổng mũi.</li>
        <li>Ý tưởng mở rộng: dán đĩa sọc lên bánh xoay + 1 cảm biến IR phản xạ vào chân dự phòng RE0/AN5 của PIC để phát hiện "bánh chủ động quay nhưng robot không đi" (bị kẹt dưới gầm ghế).</li>
      </ul>\`,
    mistakes: \`
      <ul>
        <li>Tra dầu vào ổ xoay → bụi bám thành bùn, kẹt nhanh hơn.</li>
        <li>Bẻ ngang khi tháo → gãy vấu snap-fit, cụm bánh rơi khi chạy.</li>
        <li>Lắp nhầm bánh "cố định" (không xoay) thay cho bánh xoay → robot không quay được, cạ sàn.</li>
        <li>Thiết kế vỏ/gá in 3D không chừa bán kính quét d + r_bánh → bánh kẹt khi robot lùi.</li>
      </ul>\`,
    quiz: [
      { q: 'Robot quay tại chỗ với ω = 2 rad/s, bánh xoay cách tâm 125 mm. Điểm gắn bánh xoay đi với tốc độ bao nhiêu, theo hướng nào?', a: '|V| = ω·r = 2 × 0.125 = 0.25 m/s, vuông góc với trục dọc robot (đi ngang) → bánh xoay sẽ nằm ngang 90°.' },
      { q: 'Vì sao bánh xoay phải có độ lệch đuôi d > 0?', a: 'Có d thì lực ma sát sàn đặt sau trục xoay tạo mô-men kéo càng về hướng chuyển động (tự lựa, ổn định). d = 0 thì không có mô-men tự lựa — bánh đứng yên ở góc bất kỳ và bị cạ ngang.' },
      { q: 'd = 10 mm, robot chạy 0.25 m/s. Bánh xoay theo hướng mới mất khoảng bao lâu?', a: 'τ = d/|V| = 0.01/0.25 = 40 ms (mất vài τ để gần như thẳng hàng hoàn toàn, ~0.1–0.15 s).' },
    ],
  },

  build(ctx) {
    const { THREE, MAT, geom, label, readout, fx } = ctx;
    const { mesh, group, part, cyl, box, lathe, arrow } = geom;
    const root = new THREE.Group();

    // ---------- sàn (mảnh 100×100 có chấm để thấy sàn trôi tương đối) ----------
    const floor = mesh(box(110, 3, 110), MAT.plasticGrey.clone(), { y: -1.5 });
    floor.material.color.set(0xa4825c);
    root.add(part(floor, 'Sàn nhà', 'Các chấm trôi theo chuyển động tương đối của sàn so với robot.'));
    const dots = [];
    const dotGeo = cyl(1.4, 1.4, 0.4, 10);
    for (let i = 0; i < 36; i++) {
      const d = mesh(dotGeo, MAT.plasticDark, { x: ((i % 6) - 2.5) * 18, y: 0.2, z: (Math.floor(i / 6) - 2.5) * 18 });
      root.add(d); dots.push(d);
    }

    // ---------- phần cố định với vỏ robot ----------
    const MOUNT_Y = 36;
    const chassis = new THREE.Group();
    root.add(chassis);
    const plate = mesh(lathe([[13, 0], [40, 0], [40, 2.5], [13, 2.5], [13, 0]], 48), MAT.plasticDark, { y: MOUNT_Y + 2 });
    chassis.add(part(plate, 'Vỏ đáy robot quanh hốc bánh xoay', 'Lỗ tròn có vấu cài; cả cụm bánh xoay ấn khớp từ dưới lên.'));
    const housing = group(
      mesh(cyl(12, 12, 6, 40), MAT.plasticBlack, { y: MOUNT_Y - 1 }),
      ...[0, 1, 2].map((k) => mesh(box(3, 4, 2), MAT.plasticBlack, { x: Math.cos(k * 2.1) * 12.5, y: MOUNT_Y + 1, z: Math.sin(k * 2.1) * 12.5, ry: -k * 2.1 })),
    );
    chassis.add(part(housing, 'Ổ xoay + 3 vấu cài (snap-fit)', 'Vấu nhựa đàn hồi bung ra giữ cụm trong lỗ vỏ đáy. Tháo: bẩy nhẹ và kéo thẳng.'));
    const balls = new THREE.Group();
    for (let k = 0; k < 10; k++) balls.add(mesh(new THREE.SphereGeometry(1.1, 12, 8), MAT.steel, { x: Math.cos(k * 0.628) * 8.5, y: MOUNT_Y - 4.6, z: Math.sin(k * 0.628) * 8.5 }));
    chassis.add(part(balls, 'Vòng bi đỡ chặn (10 viên Ø2.2)', 'Chịu tải đứng và cho càng xoay nhẹ 360°. Bụi + tóc lọt vào đây là nguyên nhân kẹt xoay.'));

    // ---------- càng + bánh (xoay quanh trục Y) ----------
    const swivel = new THREE.Group();
    swivel.position.y = MOUNT_Y - 6;
    chassis.add(swivel);
    const pin = mesh(cyl(2, 2, 12, 16), MAT.steel, { y: 4 });
    swivel.add(part(pin, 'Trục xoay đứng Ø4', 'Đi qua tâm ổ xoay. Hướng của càng quanh trục này là góc ψ.'));
    const forkWrap = new THREE.Group();
    swivel.add(forkWrap);
    const wheelG = new THREE.Group();
    const wheelSpin = new THREE.Group();
    wheelG.add(wheelSpin);
    const tyreGeo = lathe([[8, -5], [11.5, -5], [12.5, -3.5], [12.5, 3.5], [11.5, 5], [8, 5]], 48);
    tyreGeo.rotateX(Math.PI / 2);
    const tyre = mesh(tyreGeo, MAT.rubber);
    const hubG = group(mesh(cyl(8, 8, 9, 32), MAT.plasticWhite, { rx: Math.PI / 2 }), mesh(box(14, 2, 9.4), MAT.plasticGrey));
    wheelSpin.add(part(tyre, 'Lốp TPU Ø25', 'Mềm để êm và không trầy sàn; ma sát trượt ngang μ ≈ 0.6.'));
    wheelSpin.add(part(hubG, 'Bánh nhựa POM (vạch để thấy bánh lăn)', 'Lăn quanh trục ngang Ø2.'));
    const hair = mesh(new THREE.TorusGeometry(3.2, 1.0, 8, 24), MAT.plasticYellow.clone(), { z: 5.6 });
    hair.material.color.set(0x3b2a1a);
    hair.visible = false;
    wheelG.add(part(hair, 'Tóc quấn đầu trục', 'Quấn chặt giữa bánh và càng → bánh không lăn.'));
    forkWrap.add(wheelG);
    let lastTrail = -1;
    function buildFork(d) {
      // giữ lại bánh, dựng lại càng theo độ lệch đuôi d
      [...forkWrap.children].forEach((c) => { if (c !== wheelG) { forkWrap.remove(c); c.traverse((o) => o.geometry?.dispose()); } });
      const H = swivel.position.y - RW;               // từ đỉnh càng xuống tâm trục bánh
      const legs = group(
        mesh(box(d + 10, 2, 16, 0.6), MAT.plasticBlack, { x: -d / 2, y: -1 }),
        mesh(box(6, H, 1.6), MAT.plasticBlack, { x: -d, y: -H / 2 - 1, z: 6.6 }),
        mesh(box(6, H, 1.6), MAT.plasticBlack, { x: -d, y: -H / 2 - 1, z: -6.6 }),
        mesh(cyl(1, 1, 15, 12), MAT.steel, { x: -d, y: -H, rx: Math.PI / 2 }),
      );
      forkWrap.add(part(legs, \`Càng bánh (độ lệch đuôi d = \${d} mm)\`, 'Tâm trục bánh nằm sau trục xoay đứng một đoạn d → bánh tự lựa theo hướng chuyển động.'));
      wheelG.position.set(-d, -H, 0);
    }

    // ---------- mũi tên vận tốc & sơ đồ robot thu nhỏ ----------
    const arV = arrow([0, 2, 0], [20, 2, 0], 0x4cc2ff, 5);
    root.add(arV);
    const mini = new THREE.Group();
    mini.position.set(95, 0.5, -45);
    root.add(mini);
    const miniBody = group(
      mesh(cyl(17.5, 17.5, 2, 48), MAT.plasticWhite),
      mesh(box(4, 2.6, 2), MAT.plasticBlack, { y: 0.4, z: -11.75 }),
      mesh(box(4, 2.6, 2), MAT.plasticBlack, { y: 0.4, z: 11.75 }),
      mesh(cyl(1.8, 1.8, 2.8, 16), MAT.plasticRed, { x: LC / 10, y: 0.4 }),
    );
    mini.add(part(miniBody, 'Sơ đồ robot thu nhỏ 1:10 (nhìn từ trên)', 'Chấm đỏ = vị trí bánh xoay, 2 thanh đen = 2 bánh chủ động. Mũi tên xanh = vận tốc điểm gắn bánh xoay.'));
    const miniArrow = arrow([LC / 10, 3, 0], [LC / 10 + 8, 3, 0], 0x4cc2ff, 3);
    mini.add(miniArrow);
    const procLbl = new THREE.Group();
    root.add(procLbl);
    label(procLbl, 'Ổ xoay', [0, MOUNT_Y + 6, 16]);

    // ---------- MÔ HÌNH CAD THẬT (robot/caster-wheel-omni) ----------
    // Khung GLB: trục xoay đứng tại x = z = 0, sàn y = 0, phía trước robot = −Z, bánh lệch đuôi 4 mm về +Z.
    // rotateY(−90°): −Z → +X (hướng tiến của mô phỏng), trục bánh X → Z giống mô hình học.
    const C = {};
    const cutPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);   // bỏ nửa z > 0 (phía người xem)
    const attachMm = (c, parentNode, obj, posMm) => {
      c.obj.updateWorldMatrix(true, true);
      const Mx = new THREE.Matrix4().copy(parentNode.matrixWorld).invert().multiply(c.obj.matrixWorld);
      const w = new THREE.Group();
      Mx.decompose(w.position, w.quaternion, w.scale);
      const inner = new THREE.Group();
      inner.scale.setScalar(0.001);
      inner.position.set(posMm[0] * 0.001, posMm[1] * 0.001, posMm[2] * 0.001);
      inner.add(obj);
      w.add(inner);
      parentNode.add(w);
      return obj;
    };
    // vỏ đáy quanh cốc bánh xoay (mặt dưới vỏ robot cách sàn 9 mm — đúng như CAD)
    const plateMat = MAT.plasticDark.clone();
    plateMat.transparent = true; plateMat.opacity = 0.55;
    const cadPlate = mesh(lathe([[21.2, 9], [48, 9], [48, 11.5], [21.2, 11.5], [21.2, 9]], 64), plateMat);
    cadPlate.visible = false;
    chassis.add(part(cadPlate, 'Vỏ đáy robot (vẽ mờ)', 'Mặt dưới vỏ robot cách sàn 9 mm; vành cốc bánh xoay nằm phẳng với mặt này.'));
    const cad = cadAttach(ctx, chassis, 'robot/caster-wheel-omni', {
      rotateY: -Math.PI / 2, onBottom: false,
      hide: [plate, housing, balls, swivel, procLbl],
      onToggle: (on) => { cadPlate.visible = on; },
      partDefault: ['Cụm bánh xoay (CAD thật)', 'Mô hình CAD theo bánh đa hướng Roborock S5: cốc Ø36 có vành Ø42 cài vào vỏ, càng xoay trên chốt thép, bánh Ø25 × 12, độ lệch đuôi thật 4 mm. Thanh trượt d chỉ đổi mô phỏng (và mô hình học).'],
      parts: {
        cup: ['Cốc cài (snap-in) + vành Ø42', 'Ấn từ dưới lên vào lỗ vỏ đáy, 2 móc nhựa bung ra giữ chặt. Tháo: kéo thẳng xuống (~30 mm).'],
        yoke: ['Càng xoay (yoke) + mâm xoay Ø30', 'Xoay tự do 360° quanh chốt đứng. Tâm trục bánh nằm sau chốt 4 mm (trail) → bánh tự lựa theo hướng chạy.'],
        kingpin: ['Chốt xoay đứng (kingpin)', 'Chốt thép xuyên tâm cốc; góc của càng quanh chốt là ψ. Bụi + tóc lọt vào đây làm kẹt xoay.'],
        tyre: ['Lốp TPU Ø25 × 12', 'Mềm, êm, không trầy sàn; ma sát trượt ngang μ ≈ 0.6.'],
        hub: ['Bánh nhựa POM', 'Lăn quanh trục ngang Ø2.'],
        axle: ['Trục bánh thép Ø2', 'Ép vào 2 chân càng; rút ra bằng que nhỏ để tháo bánh. Tóc hay quấn ở hai đầu trục.'],
      },
      labels: [['Cốc cài + ổ xoay', 'cup', [0, 16, 0]], ['Bánh Ø25', 'wheel', [0, -4, 16]]],
      onLoad(c) {
        C.sw = c.pivot('swivel', { axis: [0, 1, 0], origin: [0, 0, 0] });
        C.wh = c.pivot('wheel', { axis: [1, 0, 0], origin: [0, 12.5, 4] });
        C.mCup = c.move('cup');
        C.mSw = c.move(C.sw.pivot);
        C.mWh = c.move(C.wh.pivot);
        C.mAxle = c.move('axle');
        const hm = new THREE.Mesh(new THREE.TorusGeometry(2.8, 1.3, 8, 24), hair.material);
        hm.rotation.y = Math.PI / 2;
        hm.visible = false;
        hm.userData.part = { name: 'Tóc quấn đầu trục', desc: 'Quấn chặt giữa bánh và chân càng → bánh không lăn, bị cạ trượt trên sàn.' };
        C.cutMats = [];
        c.node('cup')?.traverse((o) => { if (o.isMesh) { const m = ownMaterial(o); m.side = THREE.DoubleSide; C.cutMats.push(m); } });
        C.cutMats.push(plateMat);
        C.lastCut = null;
        C.hair = [6.8, -6.8].map((x) => attachMm(c, c.node('swivel'), x > 0 ? hm : hm.clone(), [x, 12.5, 4]));
      },
    });
    label(root, 'Robot (1:10)', [95, 6, -45]);

    // ---------- mô phỏng ----------
    let psi = 0, robotTheta = 0, wheelAng = 0, tz = 0, revSign = 1, fault = null, step = -1, stepPos = 0, drop = 0;
    const tmpD = new THREE.Vector3();
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

    // kịch bản zig-zag: [thời gian (s), v (hệ số), ω (rad/s)]
    // quay 90° với ω = 3 rad/s mất 0.52 s (robot thật quay 1.5–3 rad/s)
    const ZZ = [[0.6, 1, 0], [0.52, 0, 3.02], [0.3, 1, 0], [0.52, 0, 3.02], [0.6, 1, 0], [0.52, 0, -3.02], [0.3, 1, 0], [0.52, 0, -3.02]];
    const zzLen = ZZ.reduce((a, s) => a + s[0], 0);

    return {
      object: root,
      onAction(id) { if (id === 'rev') revSign = -revSign; },
      setStep(i) { step = i; },
      triggerFault(id) { fault = id; },
      resetFault() { fault = null; hair.visible = false; wheelG.visible = true; if (C.hair) C.hair.forEach((h) => (h.visible = false)); },
      update(dt, t, p) {
        if (p.trail !== lastTrail) { buildFork(p.trail); lastTrail = p.trail; }
        const slow = Number(p.slow);
        const h = dt / slow;                  // bước thời gian mô phỏng
        tz += h;
        // ---------- chuyển động robot ----------
        let v = p.speed, w = 0;
        if (p.mode === 'cua') { v = p.speed; w = p.speed / 0.2; }
        if (p.mode === 'xoay') { v = 0; w = 1.6; }
        if (p.mode === 'zigzag') {
          let u = tz % zzLen;
          for (const [d, kv, kw] of ZZ) { if (u < d) { v = kv * p.speed; w = kw; break; } u -= d; }
        }
        v *= revSign;
        // tháo lắp / thiếu bánh: robot đứng yên
        stepPos += ((step >= 4 ? 0 : Math.max(0, step)) - stepPos) * Math.min(1, dt * 3);
        if (stepPos > 0.05) { v = 0; w = 0; }
        // vận tốc điểm gắn (hệ robot, mm/s): V = (v + 0, −ω·LC)
        const Vx = v * 1000, Vz = -w * LC;
        const Vm = Math.hypot(Vx, Vz);
        const beta = Math.atan2(-Vz, Vx);
        // ---------- động học càng xoay (bước con cho ổn định khi d nhỏ) ----------
        const jam = fault === 'ket-xoay';
        const n = 20;
        for (let k = 0; k < n; k++) {
          if (!jam && Vm > 1) psi += (Vm * Math.sin(beta - psi) / p.trail - w) * (h / n);
          else if (!jam) psi += 0;            // đứng yên: càng giữ nguyên góc
        }
        psi = wrap(psi);
        robotTheta += w * h;
        const err = wrap(beta - psi);
        // vận tốc tại điểm chạm bánh (gần đúng = V) chiếu lên hướng lăn & phương ngang
        const hx = Math.cos(psi), hz = -Math.sin(psi);
        const vRoll = (Vx * hx + Vz * hz) / 1000;                    // m/s
        const vLat = (-Vx * hz + Vz * hx) / 1000;                    // m/s (trượt ngang)
        const locked = fault === 'toc-quan';
        let scrub = 0;
        if (jam && Math.abs(vLat) > 0.005) scrub = MU_LAT * N_C;
        if (locked && Math.abs(vRoll) > 0.005) scrub = Math.max(scrub, MU_LAT * N_C);
        if (!jam && !locked) scrub = 0;
        hair.visible = locked;

        // ---------- hình ----------
        swivel.rotation.y = psi;
        if (!locked) wheelAng += (vRoll / (RW / 1000)) * h;
        wheelSpin.rotation.z = -wheelAng;
        const cadOn = cad.sync(p);
        if (jam && Math.abs(vLat) > 0.05 && Math.random() < 0.15) fx.smoke(cadOn && C.wh ? C.wh.node : wheelG, { size: 3, duration: 0.2, color: 0x777777 });
        // sàn trôi ngược chiều chuyển động điểm (hệ robot)
        dots.forEach((d) => {
          const rx = LC + d.position.x, rz = d.position.z;
          const gx = -(v * 1000 + w * rz), gz = -(-w * rx);
          d.position.x += gx * h; d.position.z += gz * h;
          if (d.position.x > 54) d.position.x -= 108; if (d.position.x < -54) d.position.x += 108;
          if (d.position.z > 54) d.position.z -= 108; if (d.position.z < -54) d.position.z += 108;
        });
        arV.visible = Vm > 1;
        if (Vm > 1) { arV.setDirection(tmpD.set(Vx, 0, Vz).normalize()); arV.setLength(10 + Vm / 15, 5, 3); }
        mini.rotation.y = robotTheta;
        miniArrow.visible = Vm > 1;
        if (Vm > 1) { miniArrow.setDirection(tmpD.set(Vx, 0, Vz).normalize()); miniArrow.setLength(4 + Vm / 60, 2, 1.5); }
        // tháo lắp: kéo cụm xuống, bánh tách ra; thiếu bánh: mũi robot hạ 8 mm
        const s1 = Math.min(1, stepPos), s2 = Math.max(0, Math.min(1, stepPos - 1));
        swivel.position.y = MOUNT_Y - 6 - 35 * s1;
        housing.position.y = -35 * s1; balls.position.y = -35 * s1;
        wheelG.position.z = 22 * s2;
        wheelG.visible = fault !== 'mat-banh';
        drop += ((fault === 'mat-banh' ? -8 : 0) - drop) * Math.min(1, dt * 4);
        chassis.position.y = drop;
        if (!cadOn) swivel.visible = fault !== 'mat-banh';
        if (cadOn && C.sw) {
          if (p.cut !== C.lastCut) {
            C.lastCut = p.cut;
            C.cutMats.forEach((m) => { m.clippingPlanes = p.cut ? [cutPlane] : null; m.needsUpdate = true; });
          }
          C.sw.set(psi);
          C.wh.set(-wheelAng);
          // tháo: nhấc robot lên 40 mm cho dễ nhìn, kéo cả cụm thẳng xuống 30 mm; rút trục, bánh rơi khỏi càng
          chassis.position.y = drop + 40 * s1;
          C.mCup.set([0, -30 * s1, 0]);
          C.mSw.set([0, -30 * s1, 0]);
          C.mAxle.set([22 * s2, 0, 0]);
          C.mWh.set([0, -16 * s2, 0]);
          C.sw.node.visible = fault !== 'mat-banh';
          C.hair.forEach((h) => (h.visible = locked));
        }

        const deg = 180 / Math.PI;
        readout('psi', psi * deg);
        readout('beta', Vm > 1 ? beta * deg : '— (đứng yên)');
        readout('err', Vm > 1 ? err * deg : 0);
        readout('vm', Vm / 1000);
        readout('tau', Vm > 1 ? (p.trail / Vm) * 1000 : '∞');
        readout('rpm', locked ? 0 : (vRoll / (2 * Math.PI * RW / 1000)) * 60);
        readout('scrub', scrub);
        readout('sweep', p.trail + RW);
        return [Vm > 1 ? beta * deg : psi * deg, psi * deg, scrub];
      },
    };
  },
};
`;export{n as default};
