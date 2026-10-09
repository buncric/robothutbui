const n=`// ⚙️ Động cơ DC chổi than — linh kiện mẫu có mô phỏng vật lý
// Mô hình: J·dω/dt = Kt·I − b·ω − τ_tải ;  I = (V − Ke·ω) / R
// Thông số gần với động cơ RS-360 trong module bánh xe robot hút bụi (14.4 V).
// Vỏ ngoài = mô hình CAD thật Mabuchi RS-360SH (robot/rs360-motor.glb); ruột (rô-to, nam châm, chổi than)
// vẫn là mô hình học tự dựng để thấy cuộn dây sáng khi có dòng.
import { cadAttach, ownMaterial } from '../../core/cadParts.js';

const R = 7.0;          // điện trở cuộn dây (Ω) → dòng kẹt 14.4/7 ≈ 2 A
const KE = 0.011;       // hằng số sức phản điện động (V·s/rad) = Kt (N·m/A)
const J = 2.0e-6;       // mô-men quán tính rô-to (kg·m²)
const B = 1.2e-6;       // ma sát nhớt (N·m·s/rad)
const T_FRIC = 0.0012;  // ma sát khô ổ bi + chổi than (N·m) → dòng không tải ~0.14 A
const SLOW = 60;        // hiển thị chậm 60 lần cho mắt người theo kịp

export default {
  id: 'dong-co-dc',
  name: 'Động cơ DC chổi than',
  category: 'dong-luc',
  order: 1,
  icon: '⚙️',
  summary: 'Trái tim của bánh xe, chổi cuộn, chổi cạnh. Cắt bổ xem nam châm, rô-to 3 cực, cổ góp, chổi than — chỉnh điện áp & tải để thấy dòng điện, tốc độ, hiệu suất thay đổi.',
  tags: ['motor', 'mô tơ', 'RS-360', 'cổ góp', 'chổi than', 'back-EMF'],

  params: [
    { id: 'v', label: 'Điện áp cấp (âm = quay ngược)', type: 'range', min: -14.4, max: 14.4, step: 0.1, value: 7.2, unit: 'V' },
    { id: 'load', label: 'Tải trên trục (bánh xe ép sàn…)', type: 'range', min: 0, max: 22, step: 0.5, value: 2, unit: 'mN·m' },
    { id: 'cad', label: '🧊 Mô hình CAD thật (RS-360SH)', type: 'toggle', value: true, hint: 'Tắt = mô hình học tự dựng (tô màu chức năng)' },
    { id: 'cut', label: 'Cắt bổ vỏ (xem ruột: rô-to, cổ góp, chổi than)', type: 'toggle', value: true },
    { id: 'field', label: 'Hiện từ trường nam châm', type: 'toggle', value: false },
    { id: 'stall', label: '✋ Giữ chặt trục 1 giây (kẹt bánh)', type: 'button' },
  ],
  readouts: [
    { id: 'rpm', label: 'Tốc độ', unit: 'vòng/phút' },
    { id: 'i', label: 'Dòng điện', unit: 'A' },
    { id: 'emf', label: 'Sức phản điện động E = Ke·ω', unit: 'V' },
    { id: 'pm', label: 'Công suất cơ', unit: 'W' },
    { id: 'eff', label: 'Hiệu suất', unit: '%' },
    { id: 'temp', label: 'Nhiệt độ cuộn dây', unit: '°C' },
    { id: 'st', label: 'Tình trạng', unit: '' },
  ],
  steps: [
    { title: 'Bước 0 — Động cơ nguyên vẹn', text: 'Trước khi tháo: <b>tháo động cơ khỏi robot, rút dây</b>, đánh dấu cực (+) bằng bút. Dụng cụ: tua vít dẹt nhỏ, kìm mỏ nhọn, khay đựng.' },
    { title: 'Bước 1 — Mở nắp sau (cụm chổi than)', text: 'Nạy thẳng 2 vấu kim loại giữ nắp nhựa, rút nắp ra <b>thật từ từ</b>: 2 chổi than có lò xo sẽ bật ra. Mẹo: luồn sợi kẽm giữ chổi than lại trước khi rút.' },
    { title: 'Bước 2 — Rút rô-to', text: 'Nam châm hút rô-to rất mạnh — kéo thẳng trục, không bẻ nghiêng (cong trục, gãy lá cổ góp). Kiểm tra: cổ góp đen/mòn rãnh? Cuộn dây có mùi khét/đổi màu (đã từng quá nhiệt)?' },
    { title: 'Bước 3 — Kiểm tra & vệ sinh', text: 'Đo điện trở giữa từng cặp lá cổ góp: 3 giá trị phải gần bằng nhau (≈ 2/3 R). Một cặp = 0 Ω → chập vòng dây; = ∞ → đứt. Lau cổ góp bằng cồn, không dùng giấy nhám thô.' },
    { title: 'Bước 4 — Lắp lại', text: 'Làm ngược lại: đưa rô-to vào (giữ chặt kẻo nam châm hút mạnh), ép chổi than lùi lại để luồn cổ góp qua, đóng nắp, bẻ vấu. Cấp 3–5 V thử trước khi lắp vào robot.' },
  ],
  faults: [
    { id: 'thieu-tu', label: 'Không hàn tụ chống nhiễu 100 nF', severity: 'loi',
      what: '<p>Chổi than đánh tia lửa liên tục, dòng điện trên máy hiện sóng đầy gai nhọn. Trong robot: PIC/ESP32 <b>tự reset</b> mỗi khi bánh khởi động, BLE rớt kết nối.</p>',
      why: '<p>Mỗi lần chổi than rời một lá cổ góp, dòng trong cuộn cảm bị cắt đột ngột → <code>V = L·di/dt</code> tạo xung vài chục volt, tần số MHz, lan theo dây nguồn và bức xạ ra không khí.</p>',
      fix: '<p>Hàn tụ gốm 100 nF giữa 2 cực động cơ (thêm 2 tụ 10–47 nF từ mỗi cực ra vỏ nếu vẫn nhiễu), xoắn đôi dây động cơ, tụ 1000 µF ở đầu nguồn driver, buck riêng cho mạch logic.</p>' },
    { id: 'ket-lau', label: 'Kẹt bánh kéo dài ở 14.4 V (không giới hạn dòng)', severity: 'chay',
      what: '<p>Dòng giữ ở ~2 A, cuộn dây nóng dần: ~60 s lên &gt;150 °C → mùi khét, khói, lớp men cách điện cháy → <b>chập vòng dây</b>, động cơ hỏng vĩnh viễn.</p>',
      why: '<p>Khi kẹt, ω = 0 nên không có sức phản điện động: I = V/R = 2 A, toàn bộ công suất <code>P = I²R ≈ 29 W</code> biến thành nhiệt trong một cuộn dây nhỏ chỉ tản được ~8 K/W.</p>',
      fix: '<p>Firmware phát hiện kẹt (encoder không tăng khi đang ra lệnh chạy → <code>STUCK</code>) và dừng sau 2–3 s; driver có giới hạn dòng (DRV8871 ILIM); cầu chì; không chạy thử trên tải nặng lâu.</p>' },
    { id: 'qua-ap', label: 'Cấp 24 V cho động cơ 14.4 V', severity: 'hong',
      what: '<p>Động cơ rú lên ~20 000 vòng/phút, chổi than tóe lửa mạnh, ổ bạc nóng, mòn chổi than cực nhanh; hộp số nhựa có thể vỡ răng.</p>',
      why: '<p>Tốc độ không tải ≈ V/Ke tăng theo điện áp; tổn hao do ma sát và tia lửa tăng nhanh hơn. Dòng kẹt cũng tăng thành 24/7 ≈ 3.4 A → vượt khả năng driver.</p>',
      fix: '<p>Dùng đúng điện áp danh định; muốn chạy chậm hơn thì giảm duty PWM, không tăng áp. Kiểm tra nhãn động cơ trước khi cấp nguồn.</p>' },
    { id: 'dao-chieu', label: 'Đảo chiều đột ngột khi đang chạy max', severity: 'hong',
      what: '<p>Dòng vọt ngược ~ −3.9 A (gần gấp đôi dòng kẹt) trong vài chục ms — nhìn gai âm trên máy hiện sóng. Driver yếu sẽ ngắt bảo vệ hoặc cháy, nguồn sụt áp làm reset MCU.</p>',
      why: '<p>Lúc đảo chiều, sức phản điện động E ≈ +12.7 V vẫn còn (rô-to chưa kịp dừng) và cộng thêm vào điện áp ngược: <code>I = (−V − E)/R = (−14.4 − 12.7)/7 ≈ −3.9 A</code>.</p>',
      fix: '<p>Giảm tốc về 0 rồi mới đảo (firmware PIC có <code>ramp_toward()</code> 10 ‰/ms), hoặc phanh trước. Chọn driver có dòng đỉnh ≥ 2× dòng kẹt.</p>' },
  ],
  scope: {
    window: 3,
    note: '(thời gian thực · rô-to vẽ chậm 60×)',
    channels: [
      { name: 'Dòng I', unit: 'A', min: -2.2, max: 2.2, color: '#ffd34d' },
      { name: 'Tốc độ', unit: 'rpm', min: -13000, max: 13000, color: '#4cc2ff' },
    ],
  },

  info: {
    overview: \`
      <p>Động cơ DC chổi than biến <b>điện năng → cơ năng</b>. Nó rẻ, dễ điều khiển (đổi chiều chỉ cần đảo cực, đổi tốc độ bằng PWM) nên có mặt ở hầu hết robot hút bụi: <b>2 bánh xe, chổi cuộn, chổi cạnh</b>.</p>
      <p>Thử ngay: kéo <b>Điện áp</b> lên 14.4 V rồi bấm <b>Giữ chặt trục</b> — nhìn dòng điện vọt lên ~2 A. Đó là lý do driver phải chịu được <b>dòng kẹt</b>, không chỉ dòng chạy bình thường.</p>\`,
    specs: [
      ['Loại tham khảo', 'RS-360SH (module bánh xe Roborock/Xiaomi), 14.4 V danh định'],
      ['Không tải', '≈ 12 000 vòng/phút, ≈ 0.14 A'],
      ['Kẹt (stall)', '≈ 2 A, mô-men ≈ 22 mN·m'],
      ['Điện trở cuộn dây R', '≈ 7 Ω (đo bằng đồng hồ giữa 2 cực, quay trục vài vị trí lấy giá trị nhỏ nhất)'],
      ['Hằng số Ke = Kt', '0.011 V·s/rad = 0.011 N·m/A'],
      ['Sau hộp số', 'Tỉ số ~1:60–1:100 → bánh 70 mm quay 120–200 vòng/phút (≈ 0.4–0.7 m/s)'],
    ],
    principle: \`
      <h4>1. Lực từ (lực Lorentz)</h4>
      <p>Dây dẫn có dòng <code>I</code> nằm trong từ trường <code>B</code> chịu lực <code>F = B·I·L</code>. Cuộn dây trên rô-to bị lực đẩy → sinh <b>mô-men</b> <code>τ = Kt·I</code>.</p>
      <h4>2. Cổ góp + chổi than = "công tắc tự động"</h4>
      <p>Khi rô-to quay, các lá đồng của <b>cổ góp</b> lần lượt chạm 2 <b>chổi than</b> → dòng điện được chuyển sang cuộn dây đang ở vị trí sinh lực tốt nhất. Trong mô phỏng, cuộn đang có điện <b>phát sáng</b>.</p>
      <h4>3. Sức phản điện động (back-EMF)</h4>
      <p>Rô-to quay cũng là một máy phát: sinh ra điện áp ngược <code>E = Ke·ω</code>. Dòng điện thực là <code>I = (V − E)/R</code>.</p>
      <ul>
        <li>Lúc mới khởi động ω = 0 → E = 0 → I = V/R lớn nhất (dòng khởi động).</li>
        <li>Quay nhanh → E gần bằng V → dòng nhỏ.</li>
        <li>Thêm tải → chậm lại → E giảm → dòng tăng để sinh thêm mô-men.</li>
      </ul>
      <div class="tip">Tốc độ không tải ≈ V/Ke. Giảm điện áp trung bình (bằng PWM) → giảm tốc độ. Đó chính là cách PIC điều khiển bánh xe.</div>\`,
    inRobot: \`
      <ul>
        <li><b>Bánh trái/phải</b>: PIC16F877A xuất PWM 20 kHz (CCP1/CCP2) → driver DRV8871 → động cơ. Encoder Hall trên trục động cơ báo số vòng về chân T0CKI/T1CKI.</li>
        <li><b>Chổi cuộn</b>: động cơ lớn hơn, dòng kẹt có thể tới 7 A (tóc quấn!) → điều khiển qua MOSFET IRLZ44N.</li>
        <li><b>Chổi cạnh</b>: động cơ nhỏ N20 có hộp số, chỉ cần bật/tắt.</li>
      </ul>
      <p>Firmware: <code>firmware/pic16f877a_ccs/motor.c</code> — hàm <code>motor_output()</code>, tăng tốc dần <code>ramp_toward()</code> để giảm dòng khởi động.</p>\`,
    mistakes: \`
      <ul>
        <li>Không hàn <b>tụ 100 nF</b> giữa 2 cực động cơ → tia lửa ở chổi than gây nhiễu, làm <b>reset PIC/ESP32</b>.</li>
        <li>Chọn driver theo dòng chạy (0.3 A) thay vì dòng kẹt (2 A) → cháy driver khi bánh kẹt vào chân ghế.</li>
        <li>Đảo chiều đột ngột từ tiến sang lùi ở tốc độ cao → dòng ≈ 2V/R (gấp đôi dòng kẹt). Hãy giảm tốc về 0 trước.</li>
        <li>Đo điện trở cuộn dây chỉ 1 vị trí trục → sai do chổi than chạm giữa 2 lá cổ góp.</li>
      </ul>\`,
    quiz: [
      { q: 'Động cơ R = 7 Ω, cấp 14.4 V, đang đứng yên. Dòng khởi động bao nhiêu?', a: 'I = 14.4 / 7 ≈ 2.06 A (vì ω = 0 nên E = 0).' },
      { q: 'Vì sao động cơ quay càng nhanh thì dòng điện càng nhỏ?', a: 'Vì sức phản điện động E = Ke·ω tăng, chống lại điện áp cấp: I = (V − E)/R.' },
      { q: 'Muốn đảo chiều động cơ DC chổi than, làm gì?', a: 'Đảo cực tính điện áp cấp (driver cầu H làm việc này).' },
    ],
  },

  build(ctx) {
    const { THREE, MAT, geom, label, readout, fx } = ctx;
    const { mesh, group, part, cyl, box, arcSector, angDist, makeCutaway, arrow } = geom;
    const root = new THREE.Group();           // trục động cơ dọc theo Y, sau cùng xoay nằm ngang
    const motor = new THREE.Group();
    root.add(motor);

    // ---------- vỏ & nắp ----------
    const can = mesh(cyl(14, 14, 30, 64, true), MAT.steel);
    motor.add(part(can, 'Vỏ thép (stator yoke)', 'Ống thép vừa là vỏ, vừa là đường dẫn từ khép kín giữa 2 nam châm.'));
    const flange = mesh(cyl(14, 14, 1.2, 64), MAT.steel, { y: 15.6 });
    const boss = mesh(cyl(4.2, 4.2, 2.5, 32), MAT.steel, { y: 17.4 });
    const front = part(group(flange, boss), 'Nắp trước + bạc đỡ trục', 'Có 2 lỗ ren M2.5 để bắt vào hộp số; bạc/ổ bi giữ trục đồng tâm.');
    motor.add(front);
    const cap = mesh(cyl(14, 14, 5, 64), MAT.plasticWhite, { y: -17.5 });
    motor.add(part(cap, 'Nắp sau bằng nhựa', 'Giữ cụm chổi than và 2 cực đấu dây.'));

    // ---------- nam châm ----------
    const magN = mesh(arcSector(10.3, 13.7, -0.95, 0.95, 24), MAT.magnetN);
    const magS = mesh(arcSector(10.3, 13.7, Math.PI - 0.95, Math.PI + 0.95, 24), MAT.magnetS);
    motor.add(part(magN, 'Nam châm ferrite — cực Bắc (N)', 'Nam châm vĩnh cửu hình cung dán vào vỏ, tạo từ trường cố định (stator).'));
    motor.add(part(magS, 'Nam châm ferrite — cực Nam (S)', 'Từ trường đi từ N, xuyên qua rô-to, sang S rồi khép kín qua vỏ thép.'));
    label(motor, 'N', [12, 13, 0]);
    label(motor, 'S', [-12, 13, 0]);

    // ---------- rô-to (quay) ----------
    const rotor = new THREE.Group();
    motor.add(rotor);
    const shaft = mesh(cyl(1, 1, 46, 24), MAT.steel, { y: 2 });
    rotor.add(part(shaft, 'Trục thép Ø2 mm', 'Truyền mô-men ra hộp số. Đầu trước thường có bánh răng con (pinion) hoặc nam châm encoder.'));
    const coreCyl = mesh(cyl(2.6, 2.6, 18, 24), MAT.ferrite);
    rotor.add(coreCyl);
    const coils = [];
    for (let k = 0; k < 3; k++) {
      const pivot = new THREE.Group();
      pivot.rotation.y = (k * 2 * Math.PI) / 3;
      const arm = mesh(box(6, 18, 2.4), MAT.ferrite, { x: 5 });
      const shoe = mesh(arcSector(8.1, 9.6, -0.75, 0.75, 18), MAT.ferrite);
      const coilMat = MAT.copper.clone();
      const coilGeo = new THREE.TorusGeometry(2.1, 1.25, 10, 24);
      coilGeo.scale(1, 4.6, 1);
      coilGeo.rotateY(Math.PI / 2);
      const coil = mesh(coilGeo, coilMat, { x: 5 });
      coils.push(coil);
      pivot.add(part(group(arm, shoe), \`Cực rô-to #\${k + 1} (lõi thép lá)\`, 'Thép kỹ thuật điện ghép từ nhiều lá mỏng cách điện để giảm dòng xoáy (nóng).'));
      pivot.add(part(coil, \`Cuộn dây #\${k + 1} (đồng tráng men)\`, 'Hàng trăm vòng dây đồng Ø0.2 mm. Khi có dòng điện nó thành nam châm điện — phát sáng khi đang được cấp điện.'));
      rotor.add(pivot);
    }
    // cổ góp 3 lá
    const comm = new THREE.Group();
    comm.position.y = -12.5;
    const segMats = [];
    for (let k = 0; k < 3; k++) {
      const a = (k * 2 * Math.PI) / 3;
      const m = MAT.copper.clone();
      const seg = mesh(arcSector(1.8, 3.4, a - 0.95, a + 0.95, 4.5), m);
      segMats.push(seg);
      comm.add(seg);
    }
    rotor.add(part(comm, 'Cổ góp (commutator) 3 lá đồng', 'Mỗi lá nối với một đầu cuộn dây. Quay theo rô-to và trượt dưới chổi than để tự động đảo chiều dòng điện.'));

    // ---------- chổi than (đứng yên) ----------
    const brushes = new THREE.Group();
    brushes.position.y = -12.5;
    for (const s of [1, -1]) {
      const b = mesh(box(3, 3, 3.2), MAT.carbon, { x: s * 4.9 });
      const leaf = mesh(box(0.3, 3.4, 9), MAT.brass, { x: s * 6.6, z: -2.5 });
      const tab = mesh(box(2.2, 0.4, 7), MAT.brass, { x: s * 7, y: -8, z: -3 });
      brushes.add(part(group(b, leaf), s > 0 ? 'Chổi than (+)' : 'Chổi than (−)', 'Khối carbon được lá đồng thau đàn hồi ép vào cổ góp. Mòn dần theo thời gian — nguyên nhân chính làm động cơ chổi than "chết".'));
      brushes.add(part(tab, s > 0 ? 'Cực đấu dây (+)' : 'Cực đấu dây (−)', 'Hàn dây ra driver ở đây. Nên hàn thêm tụ 100 nF giữa 2 cực để chống nhiễu.'));
    }
    motor.add(brushes);
    label(motor, 'Cổ góp + chổi than', [0, -24, 8]);
    label(motor, 'Rô-to 3 cực', [0, 11, 8]);

    // ---------- đường sức từ (tùy chọn) ----------
    const field = new THREE.Group();
    for (const z of [-5, 0, 5]) for (const y of [-6, 0, 6]) field.add(arrow([9.5, y, z], [-9.5, y, z], 0x5fd3ff, 2.2));
    field.visible = false;
    motor.add(field);

    root.rotation.z = Math.PI / 2;           // nằm ngang như khi lắp trong module bánh xe
    const setCut = makeCutaway(root, new THREE.Plane(new THREE.Vector3(0, 0, -1), 0));
    // rô-to, cổ góp, chổi than không cắt để nhìn rõ
    setCut(true);
    rotor.traverse((o) => { if (o.material) o.material.clippingPlanes = null; });
    brushes.traverse((o) => { if (o.material) o.material.clippingPlanes = null; });

    // ---------- mô hình CAD thật RS-360SH (khung GLB: trục +Y, tâm vỏ ở y = 17,6 mm) ----------
    // Đặt trong \`motor\` (trước khi root xoay nằm ngang) để khớp đúng vị trí vỏ tự dựng.
    const cutPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    let cadShaft = null, cadCap = null, cadShells = [];
    const cad = cadAttach(ctx, motor, 'robot/rs360-motor', {
      onBottom: false, offset: [0, -17.6, 0], rotateY: Math.PI / 2,   // mặt vát hướng ra trước/sau, nam châm nằm ở 2 phía cong
      hide: [can, front, cap],
      partDefault: ['Động cơ Mabuchi RS-360SH (CAD thật)', 'Mô hình CAD đúng kích thước: vỏ Ø27,7 mm có 2 mặt vát 22,5 mm, dài 30 mm, trục Ø2,3 mm.'],
      parts: {
        can: ['Vỏ thép RS-360 (stator yoke)', 'Ống thép dập có 2 mặt vát — vừa là vỏ vừa khép kín đường sức từ của 2 nam châm ferrite bên trong.'],
        endcap: ['Nắp sau nhựa + giá chổi than', 'Giữ 2 chổi than carbon ép vào cổ góp; có lỗ thông gió. Tháo bằng cách nạy 2 vấu kim loại.'],
        term_pos: ['Cực đấu dây (+)', 'Cực có chấm đỏ. Hàn dây ra OUT1 của DRV8871; nên hàn tụ 100 nF giữa 2 cực để chống nhiễu.'],
        term_neg: ['Cực đấu dây (−)', 'Hàn dây ra OUT2 của DRV8871.'],
        mark_pos: ['Chấm đỏ đánh dấu cực (+)', 'Cấp (+) vào cực này → trục quay theo chiều kim đồng hồ khi nhìn từ đầu trục.'],
        shaft: ['Trục thép Ø2,3 mm', 'Ép bánh răng con (pinion) m0.5 vào hộp số module bánh xe. Quay nhanh = động cơ đang chạy.'],
      },
      onLoad(c) {
        cadShaft = c.pivot('shaft', { axis: [0, 1, 0], origin: [0, 0, 0] });
        cadCap = ['endcap', 'term_pos', 'term_neg', 'mark_pos'].map((n) => c.slide(n, [0, 1, 0])).filter(Boolean);
        cadShells = ['can', 'endcap'].map((n) => c.node(n)).filter(Boolean);
      },
    });
    let lastClip = null;
    const internals = [magN, magS, rotor, brushes];

    // ---------- trạng thái mô phỏng ----------
    let w = 0, theta = 0, stallT = 0, lastCut = true;
    let temp = 25, fault = null, burnt = false, smoked = false, vOverride = null, sparkT = 0, step = 0, stepPos = 0;
    const coilMeshes = () => coils;

    return {
      object: root,
      onAction(id) { if (id === 'stall') stallT = 1.0; },
      setStep(i) { step = i; },
      triggerFault(id, p) {
        fault = id;
        if (id === 'ket-lau') { stallT = 1e9; vOverride = 14.4; }
        if (id === 'qua-ap') vOverride = 24;
        if (id === 'dao-chieu') { w = (14.4 - 0.236 * R) / KE; vOverride = -14.4; }
      },
      resetFault() { fault = null; burnt = false; smoked = false; vOverride = null; stallT = 0; temp = 25; },
      update(dt, t, p) {
        if (p.cut !== lastCut) {
          setCut(p.cut);
          rotor.traverse((o) => { if (o.material) o.material.clippingPlanes = null; });
          brushes.traverse((o) => { if (o.material) o.material.clippingPlanes = null; });
          lastCut = p.cut;
        }
        field.visible = p.field;
        // tích phân nhiều bước nhỏ cho ổn định
        const n = 20, h = dt / n;
        let I = 0;
        const V = vOverride ?? p.v;
        for (let i = 0; i < n; i++) {
          I = burnt ? 0 : (V - KE * w) / R;
          if (stallT > 0) { w = 0; continue; }
          const tm = KE * I;
          const tl = p.load / 1000 + T_FRIC;
          let net;
          if (Math.abs(w) < 0.5 && Math.abs(tm) <= tl) { w = 0; continue; }   // không thắng được ma sát tĩnh
          net = tm - B * w - Math.sign(w || tm) * tl;
          w += (net / J) * h;
        }
        stallT = Math.max(0, stallT - dt);
        // ----- nhiệt cuộn dây: C·dT/dt = I²R − (T−25)/Rth ; Rth = 8 K/W, C = 6 J/K (τ ≈ 48 s) -----
        // sự cố "kẹt lâu" tua nhanh 10× cho khỏi phải chờ 1 phút
        const heatSpeed = fault === 'ket-lau' ? 10 : 1;
        temp += ((I * I * R - (temp - 25) / 8) / 6) * dt * heatSpeed;
        if (temp > 150 && !smoked) { smoked = true; fx.smoke(motor, { size: 14, duration: 6 }); }
        if (temp > 190 && !burnt) {
          burnt = true;
          coils.forEach((c) => fx.scorch(c, 0.85));
          fx.sparks(motor, { count: 30, speed: 40, size: 1 });
          fx.smoke(motor, { size: 18, duration: 8 });
        }
        coils.forEach((c) => fx.heat(c, burnt ? 0 : Math.max(0, (temp - 80) / 120)));
        if (cadShells[0]) fx.heat(cadShells[0], burnt ? 0 : Math.max(0, (temp - 110) / 160));
        // tia lửa ở chổi than: luôn có chút, nhiều khi thiếu tụ / quá áp
        sparkT -= dt;
        const sparky = (fault === 'thieu-tu' || fault === 'qua-ap') && Math.abs(w) > 50;
        if (sparky && sparkT <= 0) { sparkT = fault === 'qua-ap' ? 0.05 : 0.12; fx.sparks(brushes, { count: 6, speed: 25, size: 0.6 }); }
        // ----- tháo lắp: nắp sau + chổi than lùi ra, rô-to rút ra -----
        stepPos += (Math.max(0, step) - stepPos) * Math.min(1, dt * 4);
        cap.position.y = -17.5 - Math.min(1, stepPos) * 30;
        brushes.position.y = -12.5 - Math.min(1, stepPos) * 30;
        rotor.position.y = Math.max(0, Math.min(1, stepPos - 1)) * 45;
        theta += (w / SLOW) * dt;
        rotor.rotation.y = theta;
        // ----- CAD thật: vỏ RS-360; bật cắt bổ hoặc đang tháo → hiện ruột tự dựng bên trong -----
        const cadOn = cad.sync(p);
        const inside = !cadOn || p.cut || stepPos > 0.05;
        internals.forEach((o) => (o.visible = inside));
        if (cadOn) {
          const clip = p.cut && stepPos < 0.05;
          if (clip !== lastClip) {
            lastClip = clip;
            cadShells.forEach((n) => n.traverse((o) => { if (o.isMesh) { const m = ownMaterial(o); m.clippingPlanes = clip ? [cutPlane] : null; m.side = THREE.DoubleSide; m.needsUpdate = true; } }));
          }
          if (cadShaft) { cadShaft.node.visible = !inside; cadShaft.set(theta); }
          cadCap.forEach((s) => s.set(-Math.min(1, stepPos) * 30));
        }
        // cuộn nào có lá cổ góp đang chạm chổi than → có dòng → phát sáng
        for (let k = 0; k < 3; k++) {
          const a = theta + (k * 2 * Math.PI) / 3;
          const on = angDist(a, 0) < 0.95 || angDist(a, Math.PI) < 0.95;
          const glow = on ? Math.min(1, Math.abs(I) / 1.2) : 0;
          // lấy material hiện tại của mesh (có thể đã được clone bởi cắt bổ / tô sáng khi rê chuột)
          const cm = coils[k].material, sm = segMats[k].material;
          cm.emissive.setRGB(1.0 * glow, 0.55 * glow, 0.1 * glow);
          cm.emissiveIntensity = 1.5;
          sm.emissive.setRGB(0.6 * glow, 0.3 * glow, 0);
        }
        const rpm = (w * 60) / (2 * Math.PI);
        const emf = KE * w;
        const pin = p.v * I;
        const pm = (p.load / 1000) * Math.abs(w);
        readout('rpm', rpm);
        readout('i', I);
        readout('emf', emf);
        readout('pm', pm);
        readout('eff', pin > 0.01 ? Math.max(0, (100 * pm) / pin) : 0);
        readout('temp', temp);
        readout('st', burnt ? '🔥 Cuộn dây cháy — hở mạch' : temp > 120 ? '⚠️ Quá nhiệt!' : fault === 'thieu-tu' ? 'Nhiễu mạnh → MCU reset' : 'Bình thường');
        // nhiễu xung trên dòng điện khi thiếu tụ
        const noise = fault === 'thieu-tu' && Math.abs(w) > 50 && Math.random() < 0.3 ? (Math.random() - 0.5) * 3 : 0;
        return [I + noise, rpm];
      },
    };
  },
};
`;export{n as default};
