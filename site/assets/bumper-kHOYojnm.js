const n=`// 🛡️ Cản va (bumper) — vòng cung nhựa phía trước + 2 lò xo hồi + 2 công tắc hành trình trái/phải.
// Lực va F tại góc θ (vuông góc mặt cản, hướng vào tâm) được chia cho 2 gối đỡ ở ±45°:
//   F·(cosθ, sinθ) = a·n_T + b·n_P  với n_T = (cos45°, sin45°), n_P = (cos45°, −sin45°)
//   → a = F/2·(cosθ/cos45° + sinθ/sin45°),  b = F/2·(cosθ/cos45° − sinθ/sin45°)   (gối không kéo được: a, b ≥ 0)
// Mỗi gối: lò xo hồi nén sẵn P0, độ cứng k → độ lún δ = (tải − P0)/k; công tắc đóng khi δ ≥ 1 mm.
// Công tắc nối RB4 (trái) / RB5 (phải) với trở kéo lên → chạm = 0 V. PIC đọc mỗi 1 ms, chống dội 5 ms (sensors.c).

import { cadAttach, ownMaterial } from '../../core/cadParts.js';

const R_B = 175;               // bán kính ngoài cản (robot Ø350)
const ALPHA = Math.PI / 4;     // gối đỡ/công tắc ở ±45°
const P0 = 1.0;                // lực nén sẵn lò xo hồi mỗi bên (N)
const KS = 0.8;                // độ cứng mỗi gối (N/mm)
const D_OP = 1.0;              // độ lún để công tắc tác động (mm)
const D_MAX = 4.0;             // hành trình tối đa trước khi cản chạm cữ (mm)
const DEBOUNCE_MS = 5;
const BOUNCE_MS = 2.5;         // tiếp điểm kim loại dội trong ~2–3 ms
const V_ROBOT = 0.3;           // mm/ms (= 0.3 m/s)
const BRAKE = 0.006;           // mm/ms² (6 m/s² — giới hạn bám bánh)

export default {
  id: 'bumper',
  name: 'Cản va (bumper) + công tắc',
  category: 'co-khi',
  order: 6,
  icon: '🛡️',
  summary: 'Vòng cung nhựa phía trước là "xúc giác" của robot: va vào vật cản, cản lún 1–4 mm, ấn công tắc trái/phải → PIC biết va ở đâu (RB4/RB5) để lùi và quay đúng hướng. Học chia lực, độ lún, dội phím và chống dội.',
  tags: ['bumper', 'cản va', 'công tắc hành trình', 'micro switch', 'RB4', 'RB5', 'debounce', 'chống dội'],

  params: [
    { id: 'cad', label: '🧊 Mô hình CAD thật (cản + 2 công tắc SS-5GL + vỏ đáy)', type: 'toggle', value: true, hint: 'Tắt = mô hình học tự dựng (gân ấn công tắc ở ±45°, đèn báo trên công tắc)' },
    { id: 'angle', label: 'Góc va (+ = bên trái, 0 = chính diện)', type: 'range', min: -90, max: 90, step: 1, value: 25, unit: '°' },
    { id: 'force', label: 'Lực ép tĩnh (ép bằng tay)', type: 'range', min: 0, max: 15, step: 0.1, value: 3.5, unit: 'N' },
    { id: 'hold', label: 'Ép tĩnh liên tục bằng tay', type: 'toggle', value: true },
    { id: 'go', label: '💥 Cho robot đâm vào vật cản (0.3 m/s)', type: 'button' },
    { id: 'slow', label: 'Làm chậm', type: 'select', value: '10', options: [['1', '1× (thật)'], ['10', '10×'], ['100', '100× (xem dội phím)']] },
  ],
  readouts: [
    { id: 'a', label: 'Lực lên gối TRÁI', unit: 'N' },
    { id: 'b', label: 'Lực lên gối PHẢI', unit: 'N' },
    { id: 'disp', label: 'Độ lún cản', unit: 'mm' },
    { id: 'rb4', label: 'RB4 (bumper trái)', unit: 'V' },
    { id: 'rb5', label: 'RB5 (bumper phải)', unit: 'V' },
    { id: 'mask', label: 'bump_mask (đã chống dội)', unit: '' },
    { id: 'edges', label: 'Số lần PIC thấy "có va chạm"', unit: 'lần' },
    { id: 'peak', label: 'Lực va lớn nhất (lần đâm gần nhất)', unit: 'N' },
    { id: 'act', label: 'PIC phản xạ', unit: '' },
  ],
  scope: {
    window: 4,
    note: '(thời gian mô phỏng, đã làm chậm theo lựa chọn — chọn 100× để thấy tiếp điểm dội)',
    channels: [
      { name: 'RB4 thô', unit: 'V', min: -0.5, max: 5.5, color: '#ffd34d' },
      { name: 'RB5 thô', unit: 'V', min: -0.5, max: 5.5, color: '#4cc2ff' },
      { name: 'bump_mask', unit: '', min: -0.2, max: 3.2, color: '#ff6b9a' },
    ],
  },

  steps: [
    { title: 'Bước 0 — Robot nguyên vẹn (nắp trên đang đậy)', text: 'Tắt công tắc chính, <b>tháo nắp pin & rút giắc pin trước tiên</b>. Dụng cụ: tua vít PH1 cán dài, que nạy nhựa, khay, bút đánh dấu. Ở trạng thái mặc định mô phỏng ẩn nắp trên để bạn nhìn thấy công tắc.' },
    { title: 'Bước 1 — Tháo nắp trên', text: 'Vít giữ nắp nằm ở <b>mặt đáy</b> (thường 8–14 con, có con giấu dưới chân cao su/nhãn). Lật lại, nhấc nắp phía sau trước — phía trước còn móc vào cản. Không giật: dây lidar/nút bấm nối từ nắp xuống bo mạch.' },
    { title: 'Bước 2 — Rút giắc công tắc cản', text: 'Hai công tắc trái/phải (và cảm biến IR trên cản nếu có) đi chung một giắc 3–5 chân về bo mạch. <b>Chụp ảnh, đánh dấu T/P</b> rồi bóp lẫy rút ra.' },
    { title: 'Bước 3 — Tháo lò xo hồi & vít dẫn hướng', text: 'Mỗi bên có 1 lò xo nhỏ (hoặc lá nhựa đàn hồi) đẩy cản ra ngoài, cùng vít/chốt dẫn hướng trong rãnh ô-van cho cản trượt 3–5 mm. Lò xo nhỏ dễ bắn mất — tháo trong hộp.' },
    { title: 'Bước 4 — Kéo cản ra phía trước', text: 'Kéo thẳng cản về trước, nghiêng nhẹ để các vấu móc thoát khỏi khe vỏ đáy. Kiểm tra vết nứt ở 2 chân cản (chỗ hay gãy sau nhiều năm va đập).' },
    { title: 'Bước 5 — Đo kiểm công tắc', text: 'Đồng hồ vạn năng thang thông mạch (beep) giữa COM–NO: ấn cần → kêu, nhả → im. Nếu lúc kêu lúc không → tiếp điểm bẩn/oxi hóa, thay công tắc (loại KW10, lực 0.5–1 N).' },
    { title: 'Bước 6 — Lắp lại & thử', text: 'Lắp cản, lò xo, vít dẫn hướng (cản phải tự bật ra êm, không kẹt), cắm giắc, đậy nắp. Thử: ấn cản bên trái → app/terminal hiện bump bit0; bên phải → bit1; chính giữa → cả hai.' },
  ],
  faults: [
    { id: 'lech-cong-tac', label: 'Công tắc trái lắp lệch — bị ấn sẵn', severity: 'loi',
      what: '<p>Robot vừa chạy đã lùi lại và quay phải, rồi lại lùi… <b>mãi mãi</b>, kể cả giữa phòng trống. RB4 luôn 0 V, bump_mask luôn = 1.</p>',
      why: '<p>Công tắc gắn sát quá 1.5 mm (hoặc cản bị cấn lệch sau va đập) → cần gạt đã ở quá điểm tác động ngay cả khi không có lực. PIC đọc "va trái" liên tục → phản xạ an toàn <code>hazard_fwd</code> cấm tiến.</p>',
      fix: '<p>Chỉnh lại gá công tắc để còn ~0.5 mm hành trình tự do; kiểm tra cản trượt tự do. Firmware: nếu bumper bị ấn liên tục &gt; 5 s mà robot đã lùi → báo lỗi "kẹt cản" thay vì lặp vô hạn.</p>' },
    { id: 'gay-lo-xo', label: 'Mất lò xo hồi — cản không bật ra', severity: 'loi',
      what: '<p>Sau một cú va, cản <b>ở lại vị trí lún</b>, công tắc bị giữ → robot lùi/quay liên tục; lúc rung lắc thì công tắc nhả/đóng ngẫu nhiên.</p>',
      why: '<p>Lò xo hồi tạo lực P0 đưa cản về vị trí ngoài cùng. Thiếu nó, chỉ còn lực nhỏ của cần công tắc (~0.3 N) — không thắng nổi ma sát rãnh trượt.</p>',
      fix: '<p>Lắp lại lò xo đúng loại (Ø3–4 mm, dài ~8 mm) hoặc lá nhựa đàn hồi. Đếm đủ chi tiết khi tháo.</p>' },
    { id: 'dao-day', label: 'Đấu nhầm dây trái ↔ phải', severity: 'loi',
      what: '<p>Va bên trái, robot lại quay <b>sang trái</b> — đâm thẳng vào vật cản lần nữa, rồi lại lùi… Ở góc tường robot kẹt mãi không thoát ra được.</p>',
      why: '<p>Chương trình bump-and-turn: bit0 (trái) → quay phải, bit1 (phải) → quay trái. Đảo dây thì PIC nhận ngược vị trí va.</p>',
      fix: '<p>Đánh dấu dây trước khi tháo; sau khi lắp luôn thử từng bên và đọc bump_mask trên terminal/app.</p>' },
    { id: 'thieu-debounce', label: 'Bỏ chống dội trong firmware', severity: 'nhe',
      what: '<p>Một cú va nhưng PIC thấy <b>3–6 lần</b> "có va chạm": bộ đếm va chạm nhảy loạn, chế độ tự chạy lùi giật nhiều lần, log gửi lên ESP32 dày đặc.</p>',
      why: '<p>Tiếp điểm kim loại khi đóng/mở <b>nảy</b> vài lần trong 1–3 ms. PIC đọc mỗi 1 ms nên bắt được cả những lần nảy. Chống dội: chỉ chấp nhận trạng thái mới khi nó giữ nguyên đủ <code>DEBOUNCE_MS = 5</code> lần đọc liên tiếp.</p>',
      fix: '<p>Giữ hàm <code>db_update()</code> trong <code>sensors.c</code>; hoặc phần cứng: tụ 100 nF song song công tắc + trở 10 kΩ (lọc RC τ = 1 ms).</p>' },
  ],

  info: {
    overview: \`
      <p><b>Cản va (bumper)</b> là vòng cung nhựa ôm nửa trước robot (~200°). Nó được lắp "lỏng": trượt vào trong được vài mm, có <b>lò xo hồi</b> đẩy ra. Phía sau cản là <b>2 công tắc hành trình</b> ở hai bên.</p>
      <ul>
        <li>Va <b>bên trái</b> → chỉ công tắc trái đóng → <code>bump_mask = 01</code> → PIC lùi rồi quay phải.</li>
        <li>Va <b>bên phải</b> → <code>10</code> → lùi rồi quay trái.</li>
        <li>Va <b>chính diện</b> → cả hai → <code>11</code> → lùi, quay ngẫu nhiên/180°.</li>
      </ul>
      <p>Thử: kéo <b>Góc va</b> từ −90° đến 90° với lực 3.5 N và xem công tắc nào sáng. Có một vùng ở giữa mà lực nhỏ <b>không đủ</b> làm đóng công tắc nào (lực bị chia đôi!). Bấm <b>Cho robot đâm</b> và chọn làm chậm 100× để thấy tiếp điểm "dội".</p>\`,
    specs: [
      ['Cản', 'Vòng cung ABS/PC dày 2–2.5 mm, ôm ~200°, cao ~45 mm, bán kính ngoài 175 mm'],
      ['Hành trình', '≈ 1 mm để tác động công tắc, tối đa 3–5 mm trước khi chạm cữ'],
      ['Lò xo hồi', '2 lò xo nén nhỏ (hoặc lá nhựa), nén sẵn ~1 N, k ≈ 0.8 N/mm mỗi bên'],
      ['Công tắc', 'Micro-switch KW10/SS-5GL có cần gạt; lực tác động 0.5–1 N; tuổi thọ cơ ~10⁶ lần'],
      ['Dội tiếp điểm', '1–3 ms khi đóng/mở'],
      ['Nối điện', 'COM → GND, NO → RB4 (trái) / RB5 (phải), dùng trở kéo lên nội PORTB'],
      ['Lực cần để kích', 'Va chính diện: F ≥ 2·(P0 + k·δ_op)·cos45° ≈ 2.5 N; va lệch hẳn 1 bên ≈ 1.8 N'],
    ],
    principle: \`
      <h4>1. Chia lực cho 2 gối (cân bằng lực)</h4>
      <p>Lực va F vuông góc mặt cản tại góc θ. Hai gối ở ±45° chỉ đẩy theo hướng của chúng. Giải hệ 2 phương trình:</p>
      <p><code>a = F/2·(cosθ/cos45° + sinθ/sin45°)</code> · <code>b = F/2·(cosθ/cos45° − sinθ/sin45°)</code></p>
      <p>θ = 0 (chính diện): <code>a = b = 0.707·F</code>. θ = 45°: <code>a = F, b = 0</code>. Gối không thể "kéo" nên lực âm = 0.</p>
      <h4>2. Độ lún & công tắc</h4>
      <p>Mỗi gối: <code>δ = (tải − P0)/k</code>. Công tắc đóng khi <code>δ ≥ δ_op = 1 mm</code> ⇔ tải ≥ P0 + k·δ_op = 1.8 N.</p>
      <h4>3. Robot dừng không kịp — vì sao cản phải có hành trình</h4>
      <p>Chạy 0.3 m/s, phát hiện mất <code>δ_op/v + 5 ms</code> chống dội ≈ 8 ms, rồi phanh với a ≈ 6 m/s²: quãng phanh <code>v²/(2a) = 0.09/12 = 7.5 mm</code>. Cản chỉ lún được ~4 mm → phần còn lại thân robot ép thẳng vào vật cản: động năng <code>½·m·v² = ½ × 3.6 × 0.3² ≈ 0.16 J</code> bị hấp thụ trên vài mm → lực đỉnh ~50–60 N (xem ô <b>Lực va lớn nhất</b> sau khi bấm Đâm). Robot chạy nhanh hơn → va mạnh hơn nhiều (∝ v²). Đó là lý do robot giảm tốc khi cảm biến hồng ngoại/lidar thấy vật cản gần.</p>
      <h4>4. Dội phím & chống dội</h4>
      <p>Lá tiếp điểm kim loại đập vào nhau rồi nảy, tạo vài xung 0/1 trong 1–3 ms. Firmware (<code>db_update</code>): đếm số lần đọc liên tiếp có trạng thái mới; đủ 5 lần (5 ms) mới chấp nhận.</p>\`,
    inRobot: \`
      <ul>
        <li>Công tắc trái → <b>RB4 (chân 37)</b>, phải → <b>RB5 (chân 38)</b>, <code>port_b_pullups(TRUE)</code>, <code>BUMP_ACTIVE_LEVEL 0</code> (config.h).</li>
        <li><code>sensors_tick_1ms()</code> gọi trong ngắt Timer 1 ms → <code>bump_mask</code> bit0 trái, bit1 phải.</li>
        <li><code>main.c</code>: <code>hazard_fwd</code> = có va && bit SAFETY bật → cấm tiến ngay ở tầng PIC (kể cả ESP32 đang ra lệnh tiến). Chế độ tự chạy <code>standalone.c</code>: lùi <code>SA_BACK_MS = 400</code> ms rồi quay theo phía va.</li>
        <li>PIC gửi bump_mask lên ESP32 trong bản tin STATUS (50 Hz) → app hiển thị.</li>
      </ul>\`,
    mistakes: \`
      <ul>
        <li>Quên bật trở kéo lên PORTB → chân thả nổi, robot "va" ngẫu nhiên.</li>
        <li>Nối công tắc giữa chân PIC và 5 V (thay vì GND) mà lại bật kéo lên → luôn đọc 1, không bao giờ thấy va.</li>
        <li>Đảo dây trái/phải → quay sai hướng, kẹt ở góc tường.</li>
        <li>Đi dây công tắc dài sát dây động cơ không xoắn → nhiễu gây "va ảo" (chống dội giúp lọc phần lớn).</li>
        <li>Cản bị kẹt lệch sau va đập mạnh → luôn ấn một công tắc.</li>
      </ul>\`,
    quiz: [
      { q: 'Lực 3 N đè chính giữa cản. Mỗi công tắc nhận bao nhiêu? Với ngưỡng 1.8 N mỗi bên, robot có nhận ra va chạm không?', a: 'a = b = 3 × 0.707 ≈ 2.12 N > 1.8 N → cả hai công tắc đóng, bump_mask = 3 (11).' },
      { q: 'Vì sao đọc công tắc mỗi 1 ms lại cần chống dội 5 ms?', a: 'Tiếp điểm nảy 1–3 ms khi đóng/mở; đọc 1 ms sẽ thấy nhiều lần 0/1. Chỉ chấp nhận khi trạng thái giữ ổn định 5 lần đọc liên tiếp → mỗi cú va chỉ tính 1 lần.' },
      { q: 'RB4 đọc 0, RB5 đọc 1. bump_mask bằng bao nhiêu và robot nên quay về phía nào?', a: 'Chân 0 = đang bị ấn (tích cực mức thấp) → công tắc trái đóng → bump_mask = 0b01 = 1 → va bên trái → lùi rồi quay PHẢI.' },
    ],
  },

  build(ctx) {
    const { THREE, MAT, geom, label, readout, fx } = ctx;
    const { mesh, group, part, cyl, box, arcSector, springGeometry, arrow } = geom;
    const root = new THREE.Group();
    const A0 = (-100 * Math.PI) / 180, A1 = (100 * Math.PI) / 180;

    // ---------- thân robot (đáy + vách sau) ----------
    const body = new THREE.Group();
    root.add(body);
    const baseDisk = part(mesh(cyl(165, 165, 3, 96), MAT.plasticDark, { y: 5 }), 'Vỏ đáy robot Ø330', 'Công tắc và gối lò xo của cản bắt trên vỏ đáy.');
    const backWall = part(mesh(arcSector(162, 166, Math.PI - 1.6, Math.PI + 1.6, 48, 48), MAT.plasticGrey, { y: 30 }), 'Vách sau thân robot', 'Nửa sau không có cản — chỉ có vách cố định.');
    body.add(baseDisk, backWall);
    const coverMat = MAT.plasticWhite.clone();
    const cover = mesh(cyl(172, 172, 4, 96), coverMat, { y: 58 });
    cover.visible = false;
    body.add(part(cover, 'Nắp trên', 'Đậy toàn bộ robot; phải tháo trước khi tháo cản.'));

    // ---------- cản (nhóm di chuyển theo độ lún) ----------
    const bumper = new THREE.Group();
    root.add(bumper);
    const shellMat = MAT.plasticBlack.clone();
    const shell = mesh(arcSector(171, 175, A0, A1, 42, 64), shellMat, { y: 31 });
    const lip = mesh(arcSector(160, 175, A0, A1, 3, 64), shellMat, { y: 53.5 });
    const strip = mesh(arcSector(175, 176.5, A0 + 0.1, A1 - 0.1, 10, 64), MAT.rubber, { y: 28 });
    const shellG = part(group(shell, lip), 'Vỏ cản (bumper) — vòng cung ABS 200°', 'Lắp lỏng trong rãnh trượt, lún vào được ~4 mm. Truyền lực va về 2 công tắc phía sau.');
    bumper.add(shellG);
    bumper.add(part(strip, 'Dải cao su chống trầy', 'Giảm va đập, bảo vệ đồ nội thất.'));
    const ribs = [];
    // gân ấn công tắc ở ±45°
    for (const s of [1, -1]) {
      const rib = mesh(box(12, 8, 4), shellMat, { x: Math.cos(s * ALPHA) * 166, y: 24, z: -Math.sin(s * ALPHA) * 166, ry: s * ALPHA });
      bumper.add(part(rib, s > 0 ? 'Gân ấn công tắc TRÁI' : 'Gân ấn công tắc PHẢI', 'Gân nhựa phía trong cản, chạm cần gạt công tắc khi cản lún.'));
      ribs.push(rib);
    }

    // ---------- công tắc + lò xo hồi (cố định trên vỏ đáy) ----------
    const switches = [];
    for (const s of [1, -1]) {
      const g = new THREE.Group();
      const a = s * ALPHA;
      g.position.set(Math.cos(a) * 150, 9.5, -Math.sin(a) * 150);
      g.rotation.y = a;                     // trục X cục bộ hướng ra ngoài (về phía cản)
      const sbody = mesh(box(6.5, 6.5, 12.8, 0.4), MAT.plasticBlack, { y: 3.25 });
      const btn = mesh(box(1.2, 1.6, 2.2), MAT.plasticRed, { x: 3.8, y: 4 });
      const lever = new THREE.Group();
      lever.position.set(3.6, 4, -5.5);
      lever.add(mesh(box(0.4, 4, 13), MAT.steel, { x: 0, z: 6.5 }));
      const led = mesh(cyl(2, 2, 3, 16), MAT.glow.clone(), { y: 9 });
      g.add(part(group(sbody, btn), s > 0 ? 'Công tắc bumper TRÁI → RB4' : 'Công tắc bumper PHẢI → RB5', 'Micro-switch KW10. COM nối GND, NO nối chân PIC (kéo lên nội). Ấn → 0 V.'));
      g.add(part(lever, 'Cần gạt công tắc', 'Hành trình tự do ~0.5 mm, điểm tác động ~1 mm.'));
      g.add(part(led, s > 0 ? 'Đèn báo RB4 = 0' : 'Đèn báo RB5 = 0', 'Sáng khi tiếp điểm đang đóng (tín hiệu thô, chưa chống dội).'));
      const post = mesh(box(10, 4, 16), MAT.plasticDark, { y: -2 });
      g.add(post);
      root.add(g);
      const lb = label(root, s > 0 ? 'Công tắc TRÁI (RB4)' : 'Công tắc PHẢI (RB5)', [Math.cos(a) * 140, 30, -Math.sin(a) * 140]);
      switches.push({ g, lever, led, lb, lbHome: [Math.cos(a) * 140, 30, -Math.sin(a) * 140] });
    }
    const springs = [];
    for (const s of [1, -1]) {
      const a = s * 1.2;
      const sp = mesh(springGeometry({ radius: 2, wire: 0.3, turns: 6, length: 10 }), MAT.steel);
      sp.rotation.z = Math.PI / 2;
      const wrap = new THREE.Group();
      wrap.position.set(Math.cos(a) * 163, 24, -Math.sin(a) * 163);
      wrap.rotation.y = a;
      wrap.add(sp);
      root.add(part(wrap, 'Lò xo hồi cản', \`Nén sẵn \${P0} N, k = \${KS} N/mm. Đẩy cản về vị trí ngoài cùng sau va chạm.\`));
      springs.push({ wrap, sp, a });
    }
    // lò xo tự dựng hiện/ẩn theo chế độ (gói lại để cadAttach ẩn khi xem CAD)
    const springWraps = springs.map((s) => s.wrap);

    // ---------- vật cản + mũi tên lực ----------
    const obstacle = mesh(cyl(15, 15, 70, 32), MAT.aluminum, { y: 35 });
    root.add(part(obstacle, 'Vật cản (chân ghế Ø30)', 'Di chuyển tới cản theo góc va đã chọn.'));
    const arF = arrow([0, 0, 0], [0, 0, 10], 0xff5a5a, 6);
    root.add(arF);
    label(root, 'Cản va 200°', [185, 60, 0]);

    // ---------- MÔ HÌNH CAD THẬT ----------
    // rf = khung robot của CAD (GLB Y-up, mm, gốc = tâm robot trên mặt sàn, trước = −Z, trái = −X).
    // Xoay −90° quanh Y → trước = +X, trái = −Z, đúng như mô hình tự dựng.
    const rf = new THREE.Group();
    rf.rotation.y = -Math.PI / 2;
    root.add(rf);
    const deg = Math.PI / 180;
    let cMove = null, cSprings = null, cSpringNode = null;
    const cad = cadAttach(ctx, rf, 'robot/bumper', {
      onBottom: false,
      hide: [shellG, strip, ...ribs, ...springWraps],
      partDefault: ['Cản trước (CAD thật)', 'Cung 200°, R175, cao 64 mm, vỏ ABS dày 2,5 mm.'],
      parts: {
        bumper_shell: ['Vỏ cản (bumper) — ABS đen, cung 200°', 'Đúc liền: gân đứng mỗi 10°, 4 trụ lò xo (30°/75°/105°/150°), 2 <b>vấu gạt công tắc</b> ở 55° và 125° (±35° so với hướng tiến), 3 móc giữ ở mép dưới. Cả cản trượt vào trong tối đa ~4 mm.'],
        soft_strip: ['Dải đệm mềm TPE', 'Dải cao su mềm dán quanh mặt trước: giảm tiếng va, chống trầy đồ nội thất.'],
        window_ir: ['Cửa sổ hồng ngoại (nhựa PC khói)', 'Ô nhựa sẫm màu cho tia hồng ngoại đi qua — phía sau là cảm biến tường / tín hiệu đế sạc.'],
        springs: ['4 lò xo hồi cản Ø6 × 6 mm', 'Tì vào vách trước của vỏ đáy, luôn đẩy cản ra ngoài. Sau va chạm, chính chúng đưa cản về và nhả công tắc.'],
      },
      labels: [['Vấu gạt công tắc', [94.9, 44, -135.6]]],
      onLoad(c) {
        cMove = c.move('bumper_1');      // GLTFLoader đổi tên node trùng: cản bên trong = 'bumper_1'
        cSprings = c.move('springs');
        cSpringNode = c.node('springs');
      },
    });
    // vỏ đáy CAD (làm mờ) — để thấy bệ đặt công tắc và vách trước nơi lò xo tì vào
    const cadCh = cadAttach(ctx, rf, 'robot/chassis-bottom', {
      onBottom: false, frame: false,
      hide: [baseDisk, backWall],
      parts: {
        chassis_shell: ['Vỏ đáy robot (CAD, làm mờ)', 'Có 2 bệ nhựa đặt công tắc cản và vách trước thấp — nơi 4 lò xo hồi tì vào. Cản lắp lỏng phía trước vách này.'],
        'screw_*': ['Vít PT 3×8 nắp pin', 'Vít tự ren cho nhựa, mũi PH1.'],
        lid_battery: ['Nắp hộc pin', 'Mở từ mặt đáy (2 vít).'],
        lid_brush: ['Khung chổi chính', 'Bóp 2 lẫy, lật xuống để lấy chổi cuộn.'],
        'contact_*': ['Tiếp điểm sạc', 'Tì vào đế sạc.'],
        'skid_*': ['Đệm trượt', 'Chân trượt nhựa phía sau.'],
      },
      onLoad(c) {
        c.obj.traverse((o) => {
          if (!o.isMesh) return;
          const m = ownMaterial(o);
          m.transparent = true; m.opacity = 0.35; m.depthWrite = false;
        });
      },
    });
    // nắp trên CAD (chỉ hiện trong các bước tháo lắp 0–5)
    const cadTop = cadAttach(ctx, rf, 'robot/top-cover', {
      onBottom: false, frame: false, hide: [],
      partDefault: ['Nắp trên (CAD thật)', 'Phải tháo trước khi tháo cản: 4 vít từ mặt đáy, nhấc phía sau trước.'],
      parts: { cover_shell: ['Nắp trên', 'Đậy toàn bộ robot; phải tháo trước khi tháo cản.'] },
    });
    // 2 công tắc Omron SS-5GL đặt đúng như bản lắp ráp CAD: tâm R147,5 tại 55° (phải) / 125° (trái), cao 33 mm,
    // thân dựng đứng, cần gạt quay ra ngoài đối diện vấu gạt của cản.
    const swCadFrame = new THREE.Group();            // khung CAD Z-up bên trong rf
    swCadFrame.rotation.x = -Math.PI / 2;
    rf.add(swCadFrame);
    const swCad = [];
    [[125, 'TRÁI', 'RB4'], [55, 'PHẢI', 'RB5']].forEach(([aDeg, side, pin], k) => {
      const g1 = new THREE.Group();
      g1.position.set(147.5 * Math.cos(aDeg * deg), 147.5 * Math.sin(aDeg * deg), 33);
      g1.rotation.z = aDeg * deg;
      const g2 = new THREE.Group();
      g2.rotation.y = Math.PI / 2;
      g1.add(g2);
      swCadFrame.add(g1);
      const sw = { g1, home: g1.position.clone(), aDeg, lever: null, plunger: null, lastGlow: -1 };
      sw.c = cadAttach(ctx, g2, 'robot/microswitch-ss5', {
        onBottom: false, frame: false, rotateX: Math.PI / 2,
        hide: [switches[k].g],
        partDefault: [\`Công tắc cản \${side} → \${pin}\`, 'Omron SS-5GL.'],
        parts: {
          body: [\`Công tắc hành trình Omron SS-5GL — \${side} → \${pin}\`, \`Thân 19,8 × 6,4 × 10,2 mm, 2 lỗ bắt vít Ø2,35. COM nối GND, NO nối \${pin} (kéo lên nội PORTB) → ấn = 0 V. <b>Thân sáng vàng = tiếp điểm đang đóng</b> (tín hiệu thô, chưa chống dội).\`],
          lever: ['Cần gạt inox (hinge lever)', 'Dài ~16 mm. Vấu của cản đè cần xuống ~11° → cần ép nút tác động. Hành trình tự do ~0,5 mm, tác động ở ~1 mm.'],
          lever_pin: ['Chốt bản lề cần gạt', 'Trục quay của cần gạt.'],
          plunger: ['Nút tác động (plunger)', 'Bị cần gạt ép xuống ~0,6 mm → lá tiếp điểm bên trong bật sang (nghe "tách").'],
          term_com: ['Chân COM', \`Chân chung — nối GND.\`],
          term_no: ['Chân NO (thường hở)', \`Nối \${pin}. Hở khi chưa ấn (đọc 5 V nhờ trở kéo lên), đóng về GND khi ấn (0 V).\`],
          term_nc: ['Chân NC (thường đóng)', 'Không dùng trong robot này.'],
        },
        onLoad(c) {
          // bản lề cần gạt: chốt tại (−8,6; 10,6; 0) khung GLB, trục ⊥ mặt cần (Z của GLB)
          sw.lever = c.pivot('lever', { axis: [0, 0, 1], origin: [-8.6, 10.6, 0] });
          sw.plunger = c.slide('plunger', [0, -1, 0]);
        },
      });
      swCad.push(sw);
    });

    // ---------- mô phỏng ----------
    let tSim = 0, lastTick = 0, ev = null, edges = 0, fault = null, step = -1, stepPos = 0, stuck = null;
    const ideal = [false, false], raw = [false, false], edgeT = [-1e9, -1e9], dbCnt = [0, 0], dbState = [false, false];
    let prevMask = 0, peakF = 0;
    const tmpV = new THREE.Vector3();
    const nT = [Math.cos(ALPHA), Math.sin(ALPHA)], nP = [Math.cos(ALPHA), -Math.sin(ALPHA)];

    // lực F tại góc θ → tải 2 gối → độ lún → dịch chuyển cản D (hệ 2D: x tiến, y = sang TRÁI)
    function solve(F, th, sticky) {
      let a = (F / 2) * (Math.cos(th) / Math.cos(ALPHA) + Math.sin(th) / Math.sin(ALPHA));
      let b = (F / 2) * (Math.cos(th) / Math.cos(ALPHA) - Math.sin(th) / Math.sin(ALPHA));
      a = Math.max(0, a); b = Math.max(0, b);
      const p0 = fault === 'gay-lo-xo' ? 0.05 : P0;
      let dT = Math.min(D_MAX, Math.max(0, (a - p0) / KS)), dP = Math.min(D_MAX, Math.max(0, (b - p0) / KS));
      if (sticky) { dT = Math.max(dT, sticky[0]); dP = Math.max(dP, sticky[1]); }
      // D·nT = −dT, D·nP = −dP  (cản lùi vào trong)
      const det = nT[0] * nP[1] - nT[1] * nP[0];
      const Dx = (-dT * nP[1] + dP * nT[1]) / det;
      const Dy = (-dP * nT[0] + dT * nP[0]) / det;
      return { a, b, dT, dP, Dx, Dy };
    }
    // lực cần để cản lún u mm theo hướng va (tìm ngược bằng chia đôi)
    function forceForIntrusion(u, th) {
      let lo = 0, hi = 60;
      for (let i = 0; i < 24; i++) {
        const m = (lo + hi) / 2, r = solve(m, th);
        const un = -(r.Dx * Math.cos(th) + r.Dy * Math.sin(th));
        un < u ? (lo = m) : (hi = m);
      }
      return (lo + hi) / 2;
    }
    const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

    return {
      object: root,
      onAction(id) { if (id === 'go') { ev = { t0: tSim, stopAt: null, closing: 0, vel: V_ROBOT, rev: false, lastF: 0 }; edges = 0; peakF = 0; } },
      setStep(i) { step = i; },
      triggerFault(id) { fault = id; stuck = null; edges = 0; },
      resetFault() { fault = null; stuck = null; edges = 0; },
      update(dt, t, p) {
        const slow = Number(p.slow);
        const hFrame = (dt * 1000) / slow;          // ms mô phỏng trong khung này
        const th = (p.angle * Math.PI) / 180;
        const nSub = Math.max(1, Math.ceil(hFrame / 0.25));   // bước con ≤ 0.25 ms
        const hms = hFrame / nSub;
        const rawAt = (k, tt) => (tt - edgeT[k] < BOUNCE_MS ? hash(Math.floor(tt / 0.3) + k * 999) > 0.5 : ideal[k]);
        let F = 0, intr = null, obstacleGap = 40, r = null, dT = 0, dP = 0;
        for (let sub = 0; sub < nSub; sub++) {
          tSim += hms;
          // ---------- lực tác dụng ----------
          F = 0; intr = null; obstacleGap = 40;
          if (ev) {
            const te = tSim - ev.t0;
            // robot tiến: vật cản tiến lại gần cản; khi PIC thấy va → phanh; dừng → lùi
            ev.closing += ev.vel * hms;
            if (ev.stopAt === null && dbState.some(Boolean)) ev.stopAt = te;
            // lực va đẩy ngược thân robot 3.6 kg (a = F/m); trước khi PIC phát hiện, 2 bánh còn đẩy tới ~10 N
            const fPush = ev.stopAt === null ? 10 : 0;
            if (ev.vel > 0 && ev.rev === false) ev.vel -= (Math.max(0, ev.lastF - fPush) / 3.6) * 1e-3 * hms;
            if (ev.stopAt !== null && ev.rev === false) ev.vel -= BRAKE * hms;
            if (ev.rev === false && (ev.stopAt !== null || ev.lastF > 20) && ev.vel <= 0) { ev.vel = 0; ev.rev = te; }
            if (ev.rev !== false && te - ev.rev > 30) ev.vel = -0.3;   // lùi 0.3 m/s
            const u = ev.closing - 30;                  // bắt đầu cách 30 mm
            obstacleGap = Math.max(0, -u);
            if (u > 0) {
              const rm = solve(60, th);
              const uMax = -(rm.Dx * Math.cos(th) + rm.Dy * Math.sin(th));
              // quá hành trình: cản chạm cữ, thân robot ép thẳng vào vật cản → lực tăng vọt (~30 N/mm)
              F = u <= uMax ? forceForIntrusion(u, th) : forceForIntrusion(uMax * 0.999, th) + (u - uMax) * 30;
              intr = u;
            }
            ev.lastF = F;
            peakF = Math.max(peakF, F);
            if (te > 900 || ev.closing < -5) ev = null;
          } else if (p.hold) F = p.force;
          r = solve(F, th, fault === 'gay-lo-xo' ? stuck : null);
          if (fault === 'gay-lo-xo') stuck = [Math.max(stuck?.[0] || 0, r.dT), Math.max(stuck?.[1] || 0, r.dP)];
          dT = r.dT; dP = r.dP;
          if (fault === 'lech-cong-tac') dT = Math.max(dT, 0) + 1.5;      // công tắc trái gắn sát → bị ấn sẵn
          // ---------- công tắc: lý tưởng → thô (có dội) ----------
          const now = [dT >= D_OP, dP >= D_OP];
          for (let k = 0; k < 2; k++) if (now[k] !== ideal[k]) { ideal[k] = now[k]; edgeT[k] = tSim; }
          // ---------- ngắt 1 ms của PIC: đọc chân + chống dội ----------
          while (lastTick + 1 <= tSim) {
            lastTick += 1;
            const inputs = [rawAt(0, lastTick), rawAt(1, lastTick)];
            if (fault === 'dao-day') inputs.reverse();
            for (let k = 0; k < 2; k++) {
              if (fault === 'thieu-debounce') { dbState[k] = inputs[k]; continue; }
              if (inputs[k] !== dbState[k]) { if (++dbCnt[k] >= DEBOUNCE_MS) { dbState[k] = inputs[k]; dbCnt[k] = 0; } } else dbCnt[k] = 0;
            }
            const m = (dbState[0] ? 1 : 0) | (dbState[1] ? 2 : 0);
            if (m && !prevMask) edges++;
            prevMask = m;
          }
        }
        for (let k = 0; k < 2; k++) raw[k] = rawAt(k, tSim);
        let pinL = raw[0], pinR = raw[1];
        if (fault === 'dao-day') [pinL, pinR] = [pinR, pinL];
        const mask = (dbState[0] ? 1 : 0) | (dbState[1] ? 2 : 0);

        // ---------- tháo lắp ----------
        stepPos += ((step >= 6 ? 0 : Math.max(0, step)) - stepPos) * Math.min(1, dt * 3);
        const coverOn = step >= 0 && step < 6;
        cover.visible = coverOn;
        cover.position.y = 58 + Math.min(1, stepPos) * 90;
        const sOut = Math.max(0, Math.min(1, stepPos - 2)), bOut = Math.max(0, Math.min(1, stepPos - 3));
        springs.forEach((s) => { s.wrap.position.y = 24 + 50 * sOut; });

        // ---------- hình ----------
        bumper.position.set(r.Dx + 70 * bOut, 0, -r.Dy);
        springs.forEach((s) => { s.sp.scale.y = 1 - (s.a > 0 ? r.dT : r.dP) / 14; });
        switches.forEach((s, k) => {
          const d = k === 0 ? dT : dP;
          s.lever.rotation.y = -Math.min(d, 2) * 0.09;
          s.led.material.emissiveIntensity = raw[k] ? 1.6 : 0;
          s.led.material.color.set(raw[k] ? 0xffd34d : 0x555555);
          s.g.position.y = 9.5 + 25 * Math.max(0, Math.min(1, stepPos - 4)) * (step === 5 ? 1 : 0);
        });
        const R0 = R_B + 15 + obstacleGap;
        obstacle.position.set(Math.cos(th) * R0 + r.Dx, 35, -Math.sin(th) * R0 - r.Dy);
        obstacle.visible = !!ev || (p.hold && F > 0);
        if (!ev && p.hold) obstacle.position.set(Math.cos(th) * (R_B + 15) + r.Dx, 35, -Math.sin(th) * (R_B + 15) - r.Dy);
        arF.visible = F > 0.05;
        if (F > 0.05) {
          const L = 8 + F * 4;
          arF.position.set(Math.cos(th) * (R_B + L + 2) + r.Dx, 40, -Math.sin(th) * (R_B + L + 2) - r.Dy);
          arF.setDirection(tmpV.set(-Math.cos(th), 0, Math.sin(th)));
          arF.setLength(L, 5, 3.5);
        }
        // ---------- CAD thật: cản trượt theo (Dx, Dy), cần gạt + nút tác động theo độ lún từng gối ----------
        const cadOn = cad.sync(p);
        cadCh.sync(p);
        const topOn = cadTop.sync(p);
        swCad.forEach((s) => s.c.sync(p));
        if (cadTop.loaded) {
          cadTop.holder.visible = topOn && coverOn;
          cadTop.holder.position.y = Math.min(1, stepPos) * 120;      // manifest: nhấc nắp +Y 120 mm
          if (topOn) cover.visible = false;
        }
        // khung GLB: x_g = Z_lab, z_g = −X_lab
        if (cadOn && cMove) cMove.set([-r.Dy, 0, -(r.Dx + 70 * bOut)]);
        if (cadOn && cSprings) { cSprings.set([0, 50 * sOut, 0]); cSpringNode.visible = fault !== 'gay-lo-xo'; }
        swCad.forEach((s, k) => {
          const lb = switches[k].lb;
          if (!s.c.active) { lb?.position.set(...switches[k].lbHome); return; }
          const d = k === 0 ? dT : dP;
          s.lever?.set(-11 * deg * Math.min(1, d / 2));
          s.plunger?.set(0.6 * Math.min(1, d / 1.2));
          const gk = raw[k] ? 1 : 0;
          if (gk !== s.lastGlow) { s.lastGlow = gk; s.c.glow('body', gk ? 0xffb020 : 0x000000, gk ? 1.4 : 0); }
          // công tắc trái gắn lệch 1,5 mm ra ngoài (sự cố) + nhấc lên ở bước 5
          const out = k === 0 && fault === 'lech-cong-tac' ? 1.5 : 0;
          s.g1.position.set(s.home.x + Math.cos(s.aDeg * deg) * out, s.home.y + Math.sin(s.aDeg * deg) * out,
            33 + 25 * Math.max(0, Math.min(1, stepPos - 4)) * (step === 5 ? 1 : 0));
          lb?.position.set(140 * Math.sin(s.aDeg * deg), 52, 140 * Math.cos(s.aDeg * deg));
        });
        if (ev && intr > 4.2 && !ev.flashed) { ev.flashed = true; fx.flash([Math.cos(th) * R_B, 40, -Math.sin(th) * R_B], { size: 20, duration: 0.15, color: 0xffffff, intensity: 1 }); }

        const act = mask === 0 ? 'Đi tiếp' : mask === 1 ? 'Va TRÁI → dừng, lùi 400 ms, quay PHẢI' : mask === 2 ? 'Va PHẢI → dừng, lùi 400 ms, quay TRÁI' : 'Va CHÍNH DIỆN → dừng, lùi, quay ~180°';
        readout('a', r.a);
        readout('b', r.b);
        readout('disp', Math.hypot(r.Dx, r.Dy));
        readout('rb4', pinL ? 0 : 5);
        readout('rb5', pinR ? 0 : 5);
        readout('peak', peakF);
        readout('mask', \`\${mask} (0b\${mask.toString(2).padStart(2, '0')})\`);
        readout('edges', edges);
        readout('act', act);
        return [pinL ? 0 : 5, pinR ? 0 : 5, mask];
      },
    };
  },
};
`;export{n as default};
