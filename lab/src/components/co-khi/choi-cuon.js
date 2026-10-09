// 🧹 Chổi cuộn chính (main roller brush): lõi + 2 hàng lông chữ V + 2 lá cao su chữ V, quay ~1 200 vòng/phút.
// Truyền động: động cơ DC (RS-385, 14.4 V) → dây đai/bánh răng 1:10 → chổi.
//   I = (V − Ke·ω)/R ;  J·dω/dt = Kt·I − T_chổi/(i·η) − T0
//   T_chổi = T_sàn + T_tóc,  T_tóc ≈ 0.45·(mức quấn)^1.5 N·m  (tóc siết lõi + cọ vào vỏ)
// Nhiệt cuộn dây: C·dT/dt = I²·R − (T − T_mt)/R_th.  Mạch dự án chỉ bật/tắt chổi bằng MOSFET IRLZ44N (RD5) — KHÔNG đo dòng.

import { cadAttach } from '../../core/cadParts.js';

const RM = 2.0;          // Ω điện trở cuộn dây → dòng kẹt 7.2 A @14.4 V
const KE = 0.0095;       // V·s/rad = N·m/A
const JM = 1.5e-5;       // kg·m² (rô-to + chổi quy về trục động cơ)
const T0 = 0.004;        // N·m ma sát động cơ + ổ
const GEAR = 10;         // tỉ số truyền động cơ → chổi
const ETA = 0.85;
const C_TH = 8;          // J/K nhiệt dung cuộn dây
const R_TH = 10;         // K/W
const R_TIP = 24;        // bán kính đầu lông (chổi Ø48)
const R_CORE = 11;
const LEN = 175;         // dài chổi
const YC = R_TIP - 2;    // tâm chổi: lông lún sàn 2 mm
const FLOORS = { go: ['Sàn gỗ / gạch', 0.04], tham: ['Thảm lông ngắn', 0.12], day: ['Thảm lông dày', 0.22] };

export default {
  id: 'choi-cuon',
  name: 'Chổi cuộn chính',
  category: 'co-khi',
  order: 7,
  icon: '🧹',
  summary: 'Trục chổi lông + lá cao su quay 1 200 vòng/phút ngay trong miệng hút, hất rác lên ống gió. Thủ phạm số 1 gây quá tải: tóc quấn. Xem tóc làm mô-men tải, dòng động cơ và nhiệt độ tăng ra sao.',
  tags: ['chổi chính', 'main brush', 'roller', 'tóc quấn', 'dòng điện', 'quá nhiệt', 'MOSFET', 'RD5'],

  params: [
    { id: 'cad', label: '🧊 Mô hình CAD thật (chổi cuộn Roborock S5)', type: 'toggle', value: true, hint: 'Tắt = mô hình học tự dựng (lông xếp chữ V, lá cao su vẽ đơn giản)' },
    { id: 'vbat', label: 'Điện áp pin (MOSFET bật hoàn toàn)', type: 'range', min: 12, max: 16.8, step: 0.1, value: 14.4, unit: 'V' },
    { id: 'floor', label: 'Loại sàn', type: 'select', value: 'go', options: Object.entries(FLOORS).map(([k, v]) => [k, v[0]]) },
    { id: 'hair', label: 'Lượng tóc quấn', type: 'range', min: 0, max: 100, step: 1, value: 20, unit: '%' },
    { id: 'on', label: 'Bật chổi (RD5 = 1)', type: 'toggle', value: true },
    { id: 'jam', label: '🧦 Hút phải tất (kẹt cứng 1.5 s)', type: 'button' },
    { id: 'slow', label: 'Làm chậm hình 3D', type: 'select', value: '20', options: [['5', '5×'], ['20', '20×'], ['60', '60×']] },
    { id: 'cut', label: 'Cắt bổ hộc chổi', type: 'toggle', value: true },
  ],
  readouts: [
    { id: 'rpm', label: 'Tốc độ chổi', unit: 'vòng/phút' },
    { id: 'tip', label: 'Tốc độ đầu lông', unit: 'm/s' },
    { id: 'tl', label: 'Mô-men tải ở chổi', unit: 'N·m' },
    { id: 'i', label: 'Dòng động cơ', unit: 'A' },
    { id: 'p', label: 'Công suất điện', unit: 'W' },
    { id: 'temp', label: 'Nhiệt độ cuộn dây', unit: '°C' },
    { id: 'pick', label: 'Rác đã hất lên ống gió', unit: 'hạt' },
    { id: 'st', label: 'Trạng thái', unit: '' },
  ],
  scope: {
    window: 6,
    note: '(thời gian thực · hình 3D quay chậm theo lựa chọn)',
    channels: [
      { name: 'Dòng I', unit: 'A', min: 0, max: 8, color: '#ffd34d' },
      { name: 'Tốc độ chổi', unit: 'rpm', min: 0, max: 1600, color: '#4cc2ff' },
      { name: 'Nhiệt cuộn dây', unit: '°C', min: 20, max: 180, color: '#ff6b9a' },
    ],
  },

  steps: [
    { title: 'Bước 0 — Chổi cuộn trong hộc', text: 'Tắt robot (giữ nút nguồn) trước khi thao tác — chổi quay 1 200 vòng/phút, đủ quấn chặt ngón tay/tóc người. Lật ngửa robot. Dụng cụ: dao rọc giấy hoặc dao cắt tóc đi kèm robot, nhíp, khăn.' },
    { title: 'Bước 1 — Mở khung bảo vệ chổi', text: 'Bóp 2 lẫy nhựa ở mép khung lưới (brush guard) và nhấc khung lên. Khung chỉ cài lẫy — không có vít. Lẫy hay gãy nếu bẩy bằng tua vít.' },
    { title: 'Bước 2 — Nhấc chổi ra', text: 'Nhấc <b>đầu bạc (đầu tự do)</b> lên trước rồi rút <b>đầu khớp vuông</b> khỏi khớp nối động cơ. Ghi nhớ: đầu vuông luôn ở phía có động cơ.' },
    { title: 'Bước 3 — Tháo 2 nắp đầu chổi', text: 'Rút nắp chặn tóc và bạc ở hai đầu. Tóc hay chui sâu vào đây và quấn quanh trục — nguyên nhân chổi nặng, kêu rít.' },
    { title: 'Bước 4 — Cắt tóc theo rãnh', text: 'Luồn dao vào <b>rãnh dọc</b> trên lõi chổi, cắt đứt các vòng tóc rồi kéo ra. Kiểm tra lông chổi xơ/rụng, lá cao su rách → thay chổi (vật tư tiêu hao, 6–12 tháng).' },
    { title: 'Bước 5 — Lắp lại', text: 'Lắp nắp đầu, cắm đầu vuông vào khớp động cơ trước, ấn đầu bạc vào khe, xoay tay chổi phải nhẹ. Đậy khung bảo vệ đến khi nghe "tách" cả 2 lẫy.' },
  ],
  faults: [
    { id: 'toc-day', label: 'Tóc quấn kín + thảm dày, không ai dọn', severity: 'chay',
      what: '<p>Chổi quay chậm dần rồi gần như đứng; dòng động cơ vọt lên ~6–7 A; vỏ động cơ nóng bỏng tay, <b>mùi khét</b>, khói mỏng. Không có bảo vệ: cuộn dây cháy, hoặc MOSFET/đường mạch quá nhiệt.</p>',
      why: '<p>Tải ở chổi ≈ 0.6 N·m → quy về động cơ <code>0.6/(10 × 0.85) ≈ 0.07 N·m</code> ≈ mô-men kẹt. Gần như không còn sức phản điện động: <code>I ≈ V/R = 14.4/2 = 7.2 A</code>, nhiệt <code>P = I²R ≈ 100 W</code> trong cuộn dây chỉ tản được ~0.1 W/K → tăng ~12 °C/s. Cầu chì 10 A của pin <b>không đứt</b> vì 7 A &lt; 10 A!</p>',
      fix: '<p>Vệ sinh chổi hằng tuần. Phần cứng: thêm cầu chì tự phục hồi (PTC) ~3 A nối tiếp động cơ chổi, hoặc điện trở shunt 0.05 Ω + ADC (chân dự phòng RE0/AN5) để PIC đo dòng và tắt RD5 khi &gt; 4 A quá 2 s. Firmware: kiểm tra định kỳ dòng/tốc độ.</p>' },
    { id: 'lap-nguoc', label: 'Lắp chổi ngược đầu (đầu vuông sang phía bạc)', severity: 'loi',
      what: '<p>Động cơ chạy (nghe tiếng rú nhẹ) nhưng <b>chổi đứng yên</b>, rác nằm nguyên trên sàn; dòng động cơ rất nhỏ (~0.4 A) vì chạy không tải.</p>',
      why: '<p>Khớp nối động cơ là lỗ vuông; đầu chổi phía bên kia là bạc tròn → không ăn khớp, động cơ quay "trượt" trong không khí.</p>',
      fix: '<p>Đầu vuông luôn cắm vào phía có động cơ. Firmware có thể phát hiện: dòng chổi quá nhỏ khi đang bật = chổi không gắn / lắp sai.</p>' },
    { id: 'mat-nap', label: 'Mất nắp chặn tóc ở đầu chổi', severity: 'nhe',
      what: '<p>Ban đầu không thấy gì; vài tuần sau chổi kêu rít, dòng tăng dần, đầu chổi mòn rơ.</p>',
      why: '<p>Nắp đầu che khe giữa chổi và ổ đỡ. Thiếu nắp, tóc chui vào quấn quanh trục ngay tại ổ — chỗ cánh tay đòn nhỏ nhưng ép rất chặt — ma sát tăng dần theo thời gian.</p>',
      fix: '<p>Lắp đủ nắp đầu; khi tháo đếm đủ 2 nắp + 2 bạc.</p>' },
  ],

  info: {
    overview: `
      <p><b>Chổi cuộn chính</b> nằm ngang ngay trong <b>miệng hút</b> ở giữa đáy robot. Nó vừa quét vừa "đánh" rác (cát, vụn bánh, lông thú) bật lên để luồng gió của quạt hút cuốn vào hộp bụi.</p>
      <ul>
        <li><b>Lông chổi</b>: xới bụi trong thảm. <b>Lá cao su</b>: gạt sạch sàn cứng, ít quấn tóc.</li>
        <li>Xếp hình <b>chữ V</b> (chevron) → rác bị dồn về giữa, đúng vị trí cửa hút.</li>
      </ul>
      <p>Thử: kéo <b>Lượng tóc quấn</b> từ 0 → 100 % trên <b>Thảm dày</b>: tốc độ chổi tụt, dòng tăng gấp 5 lần, nhiệt độ cuộn dây tăng đều. Bấm <b>Hút phải tất</b> để xem dòng kẹt ~7 A.</p>`,
    specs: [
      ['Kích thước', 'Dài ≈ 175 mm, lõi Ø22, đường kính đầu lông Ø48 (lún sàn ~2 mm)'],
      ['Tốc độ', '≈ 1 100–1 300 vòng/phút → đầu lông ≈ 3 m/s'],
      ['Động cơ', 'DC chổi than kiểu RS-385, 14.4 V, R ≈ 2 Ω, dòng chạy 0.5–1.5 A, dòng kẹt ≈ 7 A'],
      ['Truyền động', 'Dây đai/bánh răng 1:10, khớp nối đầu vuông'],
      ['Vật liệu', 'Lõi ABS/PP, lông nylon PA6 Ø0.15 mm, lá cao su TPE/silicone'],
      ['Tuổi thọ', '6–12 tháng (vật tư tiêu hao)'],
    ],
    principle: `
      <h4>1. Tốc độ đầu lông</h4>
      <p><code>v = ω·r = 2π·n/60·r</code> → 1 200 vòng/phút, r = 24 mm → <b>3 m/s</b>: đủ hất hạt cát lên cao vài cm.</p>
      <h4>2. Mô-men tải & dòng điện</h4>
      <p>Mô-men tải ở chổi gồm ma sát với sàn (thảm lớn hơn sàn cứng nhiều) + tóc quấn. Quy về động cơ qua hộp số: <code>T_m = T_chổi/(i·η)</code>. Dòng: <code>I = T_m/Kt + I0</code>, tốc độ: <code>ω = (V − I·R)/Ke</code>. Tải tăng → tốc độ giảm, dòng tăng.</p>
      <h4>3. Nhiệt</h4>
      <p>Tổn hao đồng <code>P = I²·R</code>. Ở 1.3 A: 3.4 W (nguội). Ở 7 A: ~100 W → nóng rất nhanh. Phương trình: <code>C·dT/dt = I²R − (T − 25)/R_th</code>.</p>
      <h4>4. Cuốn rác</h4>
      <p>Phía dưới chổi quay <b>ngược chiều tiến</b> của robot: hạt rác bị lông hất về phía sau rồi lên ống gió, nơi luồng khí ~10 m/s cuốn vào hộp bụi.</p>`,
    inRobot: `
      <ul>
        <li>Theo <code>docs/01</code>: chổi cuộn bật/tắt bằng <b>MOSFET IRLZ44N</b> do chân <b>RD5 (chân 28)</b> của PIC điều khiển qua trở 100 Ω, kéo xuống 10 kΩ, <b>diode SS34</b> song song ngược với động cơ.</li>
        <li>Hàm <code>brushes_set(main, side)</code> trong <code>sensors.c</code>; PIC tự tắt chổi khi bị nhấc bánh (<code>main.c</code>).</li>
        <li>Lưu ý thiết kế: hiện tại <b>không đo dòng chổi</b>. Cải tiến khuyên làm: điện trở shunt 0.05 Ω ở chân nguồn MOSFET → khuếch đại → ADC RE0/AN5 (đang dự phòng).</li>
      </ul>`,
    mistakes: `
      <ul>
        <li>Thử chổi bằng tay khi robot đang bật → chổi kéo tóc/ngón tay vào.</li>
        <li>Quên diode song song động cơ → xung điện áp ngược khi tắt MOSFET làm chết MOSFET/reset PIC.</li>
        <li>Dùng module MOSFET IRF520 (không mở hết ở 5 V) → nóng, chổi yếu.</li>
        <li>Cắt tóc bằng kéo nhọn đâm thủng lá cao su.</li>
        <li>Lắp ngược đầu chổi → chổi không quay.</li>
      </ul>`,
    quiz: [
      { q: 'Chổi Ø48 mm quay 1 200 vòng/phút. Tốc độ đầu lông bao nhiêu m/s?', a: 'v = 2π × 1200/60 × 0.024 ≈ 3.0 m/s.' },
      { q: 'Động cơ R = 2 Ω, cấp 14.4 V bị kẹt cứng. Dòng và công suất nhiệt?', a: 'I = 14.4/2 = 7.2 A; P = I²R = 7.2² × 2 ≈ 104 W — toàn bộ thành nhiệt trong cuộn dây.' },
      { q: 'Vì sao cầu chì 10 A của pin không cứu được động cơ chổi bị kẹt?', a: 'Dòng kẹt chỉ ~7 A < 10 A nên cầu chì không đứt, nhưng 100 W nhiệt vẫn đủ làm cháy cuộn dây sau vài chục giây. Cần bảo vệ riêng (PTC ~3 A hoặc đo dòng bằng shunt + ADC).' },
    ],
  },

  build(ctx) {
    const { THREE, MAT, geom, label, readout, fx } = ctx;
    const { mesh, group, part, cyl, box, arcSector, makeCutaway } = geom;
    const root = new THREE.Group();

    // ---------- sàn ----------
    const floorMat = MAT.plasticGrey.clone();
    floorMat.color.set(0xa4825c);
    root.add(part(mesh(box(240, 3, 150), floorMat, { y: -1.5, z: 15 }), 'Sàn nhà', 'Robot tiến về phía +Z (về phía bạn). Rác trôi về phía chổi.'));

    // ---------- chổi (trục X) ----------
    const brushAxis = new THREE.Group();
    brushAxis.position.set(0, YC, 0);
    root.add(brushAxis);
    const brush = new THREE.Group();
    brushAxis.add(brush);
    const core = mesh(cyl(R_CORE, R_CORE, LEN - 16, 40), MAT.plasticBlack, { rz: Math.PI / 2 });
    const slot = mesh(box(LEN - 20, 1.5, 2.5), MAT.plasticDark, { y: R_CORE + 0.3 });
    const coreG = group(core, slot);
    brush.add(part(coreG, 'Lõi chổi Ø22 + rãnh cắt tóc', 'Ống nhựa rỗng. Rãnh dọc chạy suốt chiều dài để luồn dao cắt đứt các vòng tóc.'));
    // 2 hàng lông chữ V (InstancedMesh)
    const TUFTS = 2 * 46;
    const tuftGeo = cyl(0.9, 1.4, R_TIP - R_CORE, 6);
    tuftGeo.translate(0, (R_TIP - R_CORE) / 2 + R_CORE, 0);
    const tufts = new THREE.InstancedMesh(tuftGeo, MAT.plasticBlue.clone(), TUFTS);
    tufts.material.color.set(0x2f6fd0);
    const dummy = new THREE.Object3D();
    const chev = (x) => (Math.abs(x) / (LEN / 2)) * 1.1;      // góc xoắn chữ V
    let ti = 0;
    for (let row = 0; row < 2; row++) {
      for (let k = 0; k < 46; k++) {
        const x = -LEN / 2 + 10 + (k / 45) * (LEN - 20);
        const a = row * Math.PI + chev(x);
        dummy.position.set(x, 0, 0);
        dummy.rotation.set(a, 0, 0);
        dummy.updateMatrix();
        tufts.setMatrixAt(ti++, dummy.matrix);
      }
    }
    tufts.instanceMatrix.needsUpdate = true;
    brush.add(part(tufts, 'Lông chổi nylon (2 hàng chữ V)', 'Bó lông nylon Ø0.15 mm. Xếp chữ V để dồn rác về giữa (cửa hút). Xới bụi trong thảm.'));
    // 2 lá cao su chữ V: dải mặt cong dựng bằng BufferGeometry
    const flapGeo = (() => {
      const N = 40, pos = [], idx = [];
      for (let k = 0; k <= N; k++) {
        const x = -LEN / 2 + 10 + (k / N) * (LEN - 20);
        const a = Math.PI / 2 + chev(x);
        for (const r of [R_CORE, R_TIP - 3]) pos.push(x, Math.cos(a) * r, Math.sin(a) * r);
        if (k < N) { const b = k * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    })();
    const flapMat = MAT.rubber.clone();
    flapMat.side = THREE.DoubleSide;
    flapMat.color.set(0x3a3f47);
    const flap1 = mesh(flapGeo, flapMat);
    const flap2 = mesh(flapGeo, flapMat, { rx: Math.PI });
    const flapG = group(flap1, flap2);
    brush.add(part(flapG, 'Lá cao su chữ V', 'Gạt sạch sàn cứng như cái gạt nước, ít quấn tóc hơn lông. Rách/mòn → hút kém.'));
    // tóc quấn (vòng xuyến, độ dày theo mức quấn)
    const hairMat = MAT.plasticYellow.clone();
    hairMat.color.set(0x4a3020);
    const hairRings = [-70, -40, 0, 35, 72].map((x) => {
      const m = mesh(new THREE.TorusGeometry(R_CORE + 1, 2, 8, 32), hairMat, { x, ry: Math.PI / 2 });
      brush.add(m);
      return m;
    });
    part(hairRings[2], 'Tóc quấn', 'Tóc dài quấn quanh lõi, siết chặt và cọ vào vỏ → mô-men tải tăng.');
    // nắp hai đầu
    const capDrive = group(mesh(cyl(13, 13, 8, 32), MAT.plasticGrey, { rz: Math.PI / 2 }), mesh(box(6, 7, 7), MAT.steel, { x: 6 }));
    capDrive.position.x = LEN / 2 - 4;
    const capFree = group(mesh(cyl(13, 13, 8, 32), MAT.plasticGrey, { rz: Math.PI / 2 }), mesh(cyl(4, 4, 6, 20), MAT.plasticWhite, { x: -6, rz: Math.PI / 2 }));
    capFree.position.x = -LEN / 2 + 4;
    brushAxis.add(part(capDrive, 'Đầu khớp VUÔNG (phía động cơ)', 'Cắm vào khớp nối lỗ vuông của hộp truyền động. Có nắp chặn tóc.'));
    brushAxis.add(part(capFree, 'Đầu bạc tròn (đầu tự do)', 'Bạc nhựa quay trơn trong khe vỏ. Nắp chặn ngăn tóc chui vào ổ.'));

    // ---------- hộc chổi, khung bảo vệ, ống gió, động cơ ----------
    const housing = new THREE.Group();
    root.add(housing);
    const hMat = MAT.plasticDark.clone();
    // vỏ bao hình cung: dựng quanh trục Y rồi xoay sang trục X; góc 0 = đỉnh, π/2 = phía sau, π = đáy (để hở)
    const shellGeo = arcSector(R_TIP + 4, R_TIP + 7, -0.5, 2.5, LEN + 6, 48);
    shellGeo.rotateZ(Math.PI / 2);
    const shell = mesh(shellGeo, hMat);
    const shellG = group(shell);
    shellG.position.y = YC;
    housing.add(part(shellG, 'Hộc chổi (vỏ bao)', 'Ôm sát chổi để luồng gió đi qua chổi rồi vào ống. Khe hở lớn → mất lực hút.'));
    const duct = group(
      mesh(box(LEN - 30, 40, 3), hMat, { y: YC + 30, z: -R_TIP - 12 }),
      mesh(box(LEN - 30, 3, 26), hMat, { y: YC + 48, z: -R_TIP }),
    );
    housing.add(part(duct, 'Ống gió lên hộp bụi', 'Rác bị chổi hất lên đây, luồng gió ~10 m/s cuốn vào hộp bụi phía sau.'));
    const guard = new THREE.Group();
    guard.add(mesh(box(LEN + 10, 2, 4), MAT.plasticGrey, { y: 2, z: R_TIP + 4 }));
    guard.add(mesh(box(LEN + 10, 2, 4), MAT.plasticGrey, { y: 2, z: -R_TIP - 4 }));
    for (let k = 0; k < 7; k++) guard.add(mesh(box(3, 2, 2 * R_TIP + 10), MAT.plasticGrey, { x: -LEN / 2 + 10 + k * ((LEN - 20) / 6), y: 2 }));
    housing.add(part(guard, 'Khung bảo vệ chổi (brush guard)', 'Lưới nhựa cài 2 lẫy, ngăn dây điện/tất bị hút vào chổi. Mở khung để lấy chổi ra.'));
    const motor = group(
      mesh(cyl(14, 14, 38, 40), MAT.steel, { x: LEN / 2 + 30, y: YC + 20, rz: Math.PI / 2 }),
      mesh(box(20, 30, 12), MAT.plasticGrey, { x: LEN / 2 + 6, y: YC + 8 }),
    );
    housing.add(part(motor, 'Động cơ chổi + hộp truyền 1:10', 'DC 14.4 V (R ≈ 2 Ω). Bật/tắt bằng MOSFET IRLZ44N từ chân RD5 của PIC. Phát sáng đỏ khi quá nhiệt.'));
    motor.traverse((o) => (o.userData.noCut = true));
    guard.traverse((o) => (o.userData.noCut = true));
    const setCut = makeCutaway(housing, new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0));   // cắt bỏ nửa x > 0
    setCut(true);
    const procLbl = new THREE.Group(), cadLbl = new THREE.Group();
    root.add(procLbl);
    brushAxis.add(cadLbl);                       // nhãn CAD đi theo chổi khi tháo (không quay)
    cadLbl.visible = false;
    label(procLbl, 'Chổi cuộn Ø48', [-LEN / 2, YC + 30, 30]);
    label(cadLbl, 'Chổi cuộn Ø42 × 198', [-LEN / 2, 30, 30]);
    label(cadLbl, 'Nắp chặn tóc + ổ bi 685ZZ', [-LEN / 2 - 14, -22, 22]);

    // ---------- MÔ HÌNH CAD THẬT (robot/main-brush): trục X qua gốc, đầu khớp vuông ở +X (phía động cơ) ----------
    // Đặt trong `brush` → quay cùng chổi tự dựng (góc từ mô phỏng động cơ), đi theo các bước tháo.
    const C = {};
    const cad = cadAttach(ctx, brush, 'robot/main-brush', {
      onBottom: false,
      hide: [coreG, tufts, flapG, capDrive, capFree, procLbl],
      onToggle: (on) => { cadLbl.visible = on; },
      partDefault: ['Chổi cuộn chính (CAD thật)', 'Mô hình CAD theo chổi Roborock S5: dài 198 mm, Ø42, lõi + 2 hàng lông + 2 lá cao su xếp chữ V, đầu khớp vuông và đầu ổ bi 685ZZ.'],
      parts: {
        core: ['Lõi chổi Ø24 + rãnh cắt tóc', 'Ống nhựa; rãnh dọc suốt chiều dài để luồn dao cắt đứt các vòng tóc quấn.'],
        bristles_a: ['Hàng lông nylon A (xoắn chữ V)', 'Xới bụi trong thảm và dồn rác về giữa (cửa hút). Lông xơ/rụng → thay chổi.'],
        bristles_b: ['Hàng lông nylon B (xoắn chữ V)', 'Đối xứng hàng A qua trục; 2 hàng xen kẽ 2 lá cao su.'],
        flap_a: ['Lá cao su chữ V (A)', 'Gạt sạch sàn cứng như cái gạt nước, ít quấn tóc hơn lông. Rách/mòn → hút kém.'],
        flap_b: ['Lá cao su chữ V (B)', 'Đối xứng lá A.'],
        cap_drive: ['Đầu khớp VUÔNG (phía động cơ)', 'Cắm vào khớp nối lỗ vuông của hộp truyền động 1:10. Có nắp chặn tóc.'],
        cap_end: ['Nắp chặn tóc đầu tự do', 'Rút ra (−X ~15 mm) để gỡ tóc chui vào ổ. Mất nắp → tóc vào ổ bi, chổi nặng dần.'],
        bearing_outer: ['Ổ bi 685ZZ (5 × 11 × 5)', 'Vòng ngoài nằm yên trong khe vỏ, vòng trong quay cùng chổi.'],
        bearing_shield: ['Nắp che bụi ổ bi (ZZ)', 'Hai nắp thép chặn bụi — nhưng tóc vẫn có thể quấn vào khe.'],
        bearing_inner: ['Vòng trong ổ bi', 'Lắp trên chốt thép Ø5.'],
        pin: ['Chốt thép Ø5 đầu tự do', 'Đỡ ổ bi; đầu chốt lọt vào khe chữ U của vỏ hộc chổi.'],
      },
      onLoad(c) {
        C.mEnd = c.slide('end_assembly', [-1, 0, 0]);
        C.mDrive = c.slide('cap_drive', [1, 0, 0]);
        C.capEnd = c.node('cap_end');
      },
    });
    label(root, 'Động cơ (RD5)', [LEN / 2 + 30, YC + 40, 0]);
    label(root, '→ hộp bụi', [0, YC + 58, -R_TIP]);

    // ---------- hạt rác ----------
    const NP = 40;
    const pMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1.4, 8, 6), MAT.plasticYellow.clone(), NP);
    pMesh.material.color.set(0xc9a46a);
    pMesh.userData.noCut = true;
    pMesh.raycast = () => {};
    root.add(pMesh);
    const rnd = (a, b) => a + Math.random() * (b - a);
    const P = Array.from({ length: NP }, () => ({ ph: 0, x: rnd(-70, 70), z: rnd(20, 110), b: 0, y: 1.4, vy: 0, vz: 0 }));

    // ---------- mô phỏng ----------
    let w = 0, ang = 0, temp = 25, jamT = 0, picked = 0, fault = null, burnt = false, step = -1, stepPos = 0, smokeT = 0, wearT = 0, lastCut = true;

    return {
      object: root,
      onAction(id) { if (id === 'jam') jamT = 1.5; },
      setStep(i) { step = i; },
      triggerFault(id) { fault = id; wearT = 0; },
      resetFault() {
        fault = null; burnt = false; temp = 25; jamT = 0; wearT = 0;
        if (cad.loaded) { cad.glow('bearing', 0x000000, 0); if (C.capEnd) C.capEnd.visible = true; cad.holder.rotation.y = 0; }
      },
      update(dt, t, p) {
        if (p.cut !== lastCut) { setCut(p.cut); lastCut = p.cut; }
        // ---------- tải ----------
        let hair = p.hair / 100, floorT = FLOORS[p.floor][1];
        if (fault === 'toc-day') { hair = 1; floorT = FLOORS.day[1]; }
        if (fault === 'mat-nap') wearT = Math.min(1, wearT + dt / 20);      // tóc chui vào ổ dần dần
        if (stepPos > 3.5) hair = 0;                                        // bước 4: đã cắt tóc
        const tBrush = floorT + 0.45 * Math.pow(hair, 1.5) + 0.01 + 0.12 * wearT;
        const decoupled = fault === 'lap-nguoc' || stepPos > 1.5;           // chổi không nối với động cơ
        const V = p.on && !burnt ? p.vbat : 0;
        // ---------- động cơ (bước con) ----------
        const n = 20, h = dt / n;
        let I = 0;
        for (let k = 0; k < n; k++) {
          I = (V - KE * w) / RM;
          if (jamT > 0 && !decoupled) { w = 0; continue; }
          const tl = (decoupled ? 0 : tBrush / (GEAR * ETA)) + T0;
          let net = KE * I - tl * Math.sign(w || 1);
          if (Math.abs(w) < 1 && KE * I <= tl) { w = 0; continue; }
          w = Math.max(0, w + (net / JM) * h);
        }
        jamT = Math.max(0, jamT - dt);
        // ---------- nhiệt ----------
        temp += ((I * I * RM - (temp - 25) / R_TH) / C_TH) * dt;
        if (temp > 175 && !burnt) { burnt = true; fx.smoke(motor, { size: 14, duration: 6 }); fx.scorch(motor, 0.6); }
        if (temp > 110) fx.heat(motor, (temp - 110) / 70);
        smokeT -= dt;
        if (temp > 140 && !burnt && smokeT <= 0) { smokeT = 1.5; fx.smoke(motor, { size: 8, duration: 1 }); }

        const brushW = decoupled ? 0 : w / GEAR;              // rad/s chổi
        const rpm = (brushW * 60) / (2 * Math.PI);
        // ---------- tháo lắp ----------
        stepPos += ((step >= 5 ? 0 : Math.max(0, step)) - stepPos) * Math.min(1, dt * 3);
        const s1 = Math.min(1, stepPos), s2 = Math.max(0, Math.min(1, stepPos - 1)), s3 = Math.max(0, Math.min(1, stepPos - 2));
        guard.position.z = s1 * 70;                          // khung bảo vệ rút ra
        brushAxis.position.set(0, YC, s2 * 120);
        brushAxis.rotation.y = s2 * 0.25;
        capDrive.position.x = LEN / 2 - 4 + s3 * 30;
        capFree.position.x = -LEN / 2 + 4 - s3 * 30;
        // CAD thật: nắp đầu rút ra theo manifest (−X 15 mm), đầu vuông +X; lắp ngược = quay cả chổi 180°
        const cadOn = cad.sync(p);
        if (cadOn && C.mEnd) {
          C.mEnd.set(15 * s3);
          C.mDrive?.set(15 * s3);
          cad.holder.rotation.y = fault === 'lap-nguoc' ? Math.PI : 0;
          if (C.capEnd) C.capEnd.visible = fault !== 'mat-nap';
          if (fault === 'mat-nap') cad.glow('bearing', 0xff5020, 0.2 + 0.8 * wearT);
        }

        // ---------- hình: quay chậm ----------
        const slow = Number(p.slow);
        ang += (brushW / slow) * dt;
        brush.rotation.x = ang;
        capDrive.rotation.x = ang; capFree.rotation.x = ang;
        hairRings.forEach((m, k) => {
          const th = hair * (k === 2 ? 1 : 0.7);
          m.visible = th > 0.02;
          m.scale.set(1 + th * 0.15, 1 + th * 0.15, 0.3 + th * 2.5);
        });
        // ---------- hạt rác (theo thời gian đã làm chậm) ----------
        const vRobot = 300 / slow;                           // robot 0.3 m/s
        const spin = brushW / slow;
        const working = rpm > 250 && stepPos < 0.5;
        P.forEach((q, i) => {
          if (q.ph === 0) {
            q.z -= vRobot * dt;
            if (q.z < 9) { if (working) { q.ph = 1; q.b = 0; } else q.z = 9 + Math.random(); }
            dummy.position.set(q.x, 1.4, q.z);
          } else if (q.ph === 1) {
            q.b += spin * dt;
            const r = R_TIP - 1;
            dummy.position.set(q.x * (1 - q.b * 0.15), YC - r * Math.cos(q.b), -r * Math.sin(q.b));
            if (q.b > 1.9) { q.ph = 2; q.y = dummy.position.y; q.zz = dummy.position.z; q.vy = (rpm / 1200) * 1500 / slow; picked++; }
          } else {
            q.y += q.vy * dt;
            dummy.position.set(q.x * 0.7, q.y, q.zz);
            if (q.y > YC + 70) { q.ph = 0; q.x = rnd(-70, 70); q.z = rnd(60, 120); }
          }
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          pMesh.setMatrixAt(i, dummy.matrix);
        });
        pMesh.instanceMatrix.needsUpdate = true;

        const st = burnt ? '🔥 Cuộn dây cháy — động cơ hỏng' : !p.on ? 'Tắt (RD5 = 0)' : decoupled ? (stepPos > 1.5 ? 'Đang tháo' : '⚠ Động cơ quay, chổi đứng yên!') : jamT > 0 ? '✋ Kẹt cứng — dòng kẹt' : temp > 120 ? '⚠ Quá nhiệt!' : rpm < 300 ? '⚠ Quá tải — chổi gần đứng' : 'Bình thường';
        readout('rpm', rpm);
        readout('tip', brushW * R_TIP / 1000);
        readout('tl', decoupled ? 0 : tBrush);
        readout('i', I);
        readout('p', V * I);
        readout('temp', temp);
        readout('pick', picked);
        readout('st', st);
        return [Math.max(0, I), rpm, Math.min(180, temp)];
      },
    };
  },
};
