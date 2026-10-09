// 🔩 Ốc vít — linh kiện mẫu (xem COMPONENT_API.md)
// Mô phỏng: vặn vít tự ren vào cột nhựa / vít máy M3 vào cột đồng; mô-men tăng khi siết, quá lực → toét ren.

import { cadAttach, ownMaterial } from '../../core/cadParts.js';

// bước ren theo mô hình CAD thật: PT 3×8 (EJOT, ≈ 0,45·d = 1,35 mm, 5,9 vòng) · M3×8 ISO 4762 (0,5 mm, 16 vòng)
const TYPES = {
  pt: { name: 'Vít tự ren PT 3×8 (vào cột nhựa)', pitch: 1.35, tRun: 0.12, tStrip: 0.75, kSeat: 0.6 },
  m3: { name: 'Vít máy M3×8 (vào cột đồng ren sẵn)', pitch: 0.5, tRun: 0.02, tStrip: 1.6, kSeat: 1.2 },
};
const LEN = 8;          // chiều dài thân vít (mm)
const PLATE = 1.6;      // tấm bị kẹp (PCB) dày 1.6 mm

export default {
  id: 'oc-vit',
  name: 'Ốc vít M3 & vít tự ren',
  category: 'co-khi',
  order: 1,
  icon: '🔩',
  summary: 'Chi tiết nhỏ nhất nhưng nhiều nhất trong robot (40–60 con). Học bước ren, lỗ mồi, mô-men siết — và vì sao vặn quá tay sẽ toét ren nhựa.',
  tags: ['ốc', 'vít', 'ren', 'screw', 'bulong', 'cột đồng', 'standoff'],

  params: [
    { id: 'cad', label: '🧊 Mô hình CAD thật (vít PT 3×8 · ốc lục giác chìm M3×8 · trụ đồng)', type: 'toggle', value: true, hint: 'Tắt = mô hình học tự dựng (ren xoắn vẽ rõ, đầu vít đơn giản)' },
    { id: 'type', label: 'Loại vít', type: 'select', value: 'pt', options: [['pt', TYPES.pt.name], ['m3', TYPES.m3.name]] },
    { id: 'speed', label: 'Tốc độ tua vít', type: 'range', min: 0.2, max: 3, step: 0.1, value: 1, unit: 'vòng/s' },
    { id: 'clutch', label: 'Ly hợp tua vít điện (lực siết cài sẵn)', type: 'range', min: 0.1, max: 2, step: 0.05, value: 0.4, unit: 'N·m', hint: 'Tua vít điện tự nhả khi đạt mô-men này. Đặt cao hơn sức chịu của ren → toét ren.' },
    { id: 'in', label: '▶ Vặn vào (theo chiều kim đồng hồ)', type: 'button' },
    { id: 'out', label: '◀ Vặn ra', type: 'button' },
    { id: 'stop', label: '⏸ Dừng', type: 'button' },
    { id: 'reset', label: '↺ Làm lại', type: 'button' },
    { id: 'cut', label: 'Cắt bổ xem ren ăn vào', type: 'toggle', value: true },
    { id: 'tray', label: '🧰 Khay ốc vít thật (CAD): M2–M3, đai ốc, long đen, trụ đồng', type: 'toggle', value: false, hint: 'Bày cạnh mối ghép các loại ốc vít hay dùng khi lắp bo mạch/robot — rê chuột để xem tên & công dụng' },
  ],
  readouts: [
    { id: 'turns', label: 'Số vòng đã vặn', unit: 'vòng' },
    { id: 'depth', label: 'Chiều dài ren đã ăn', unit: 'mm' },
    { id: 'torque', label: 'Mô-men vặn', unit: 'N·m' },
    { id: 'state', label: 'Trạng thái', unit: '' },
  ],
  faults: [
    { id: 'vit-dai', label: 'Bắt nắp pin bằng vít quá dài', severity: 'chay',
      what: '<p>Vít xuyên qua nắp nhựa mỏng và <b>đâm thủng cell pin 18650</b> nằm ngay bên dưới: tia lửa, khói trắng ngọt mùi hóa chất, cell nóng lên rất nhanh và có thể bốc cháy (thermal runaway) vài giây sau.</p>',
      why: '<p>Vít thép xuyên qua lớp màng ngăn (separator) → <b>chập trong</b> giữa cực âm và dương. Năng lượng cả cell (~9 Wh) xả qua một điểm nhỏ → nhiệt độ cục bộ hàng trăm °C, chất điện phân bay hơi và bắt lửa.</p>',
      fix: '<p>Khi mổ xác: <b>phân loại vít theo vị trí</b>, đo chiều dài, chụp ảnh; vít nắp pin thường ngắn nhất. Tháo pin ra trước mọi thao tác. Nếu đã thủng: đưa robot ra chỗ thoáng, nền gạch/cát, tránh xa vật dễ cháy; không dùng nước cho pin đang cháy lớn — dùng cát/bình CO₂ và để nó cháy hết ở nơi an toàn.</p>' },
    { id: 'sai-mui', label: 'Dùng mũi PH2 cho vít PH1 (sai cỡ)', severity: 'hong',
      what: '<p>Mũi tua vít trượt ra khỏi rãnh (cam-out) mỗi khi lực tăng, rãnh chữ thập bị <b>toét tròn</b>; vít kẹt giữa chừng, không vặn vào cũng không tháo ra được.</p>',
      why: '<p>Rãnh Phillips có thành nghiêng: mũi lớn hơn không ăn sâu, mô-men tạo lực đẩy mũi ra ngoài (thiết kế gốc của Phillips). Mũi càng sai cỡ, lực đẩy ra càng lớn.</p>',
      fix: '<p>Dùng đúng PH1 cho vít 3 mm, PH0 cho vít 2 mm; ấn mạnh dọc trục khi vặn. Vít đã toét: đặt miếng dây thun lên đầu vít rồi vặn, dùng mũi tháo vít toét, hoặc kìm bấm đầu vít (với đầu lồi).</p>' },
    { id: 'qua-luc', label: 'Siết bằng máy khoan pin ở mức lực cao nhất', severity: 'loi',
      what: '<p>Vít chạm mặt rồi vẫn bị vặn tiếp → mô-men vọt lên rồi tụt: ren nhựa đã bị cắt, vít quay trơn. Có khi <b>nứt luôn cột nhựa</b>.</p>',
      why: '<p>Ren nhựa ABS/PC chỉ chịu ~0.6–0.9 N·m với vít 3 mm, trong khi máy khoan pin dễ tạo 5–20 N·m.</p>',
      fix: '<p>Dùng tua vít tay hoặc đặt ly hợp máy ở mức thấp nhất (thử dần); vít tự ren vào lỗ cũ: vặn ngược đến khi nghe "tách" rồi mới vặn xuôi. Lỗ đã toét: dùng vít dài/lớn hơn một cỡ (nếu đủ chỗ), keo epoxy + tăm, hoặc ốc cấy (insert) đồng nhiệt.</p>' },
  ],
  scope: {
    window: 6,
    note: '(thời gian thực)',
    channels: [
      { name: 'Mô-men', unit: 'N·m', min: 0, max: 1.8, color: '#ffd34d' },
      { name: 'Độ sâu', unit: 'mm', min: 0, max: 8, color: '#4cc2ff' },
    ],
  },

  info: {
    overview: `
      <p>Robot hút bụi dùng 2 loại vít chính:</p>
      <ul>
        <li><b>Vít tự ren (PT, "tapping screw")</b>: vặn thẳng vào <b>cột nhựa có lỗ mồi trơn</b>. Ren vít tự "cán" ra ren trong nhựa. Dùng cho vỏ trên/dưới, nắp pin, bo mạch bắt vào khung.</li>
        <li><b>Vít máy M3/M2 (ISO metric)</b>: vặn vào <b>đai ốc</b>, <b>cột đồng (standoff)</b> hoặc lỗ kim loại đã taro ren. Dùng cho động cơ, hộp số, tản nhiệt.</li>
      </ul>
      <p>Thử: chọn loại vít → bấm <b>Vặn vào</b>, xem đồ thị mô-men. Khi đầu vít chạm mặt bo, mô-men tăng vọt. Nếu tiếp tục vặn → <b>toét ren</b>.</p>`,
    specs: [
      ['Ký hiệu', '<code>M3×8</code> = đường kính danh nghĩa 3 mm, dài thân 8 mm (không tính đầu, với đầu tròn/đầu dù)'],
      ['Bước ren M3 (ISO thô)', '0.5 mm — vặn 1 vòng tiến 0.5 mm'],
      ['Bước ren vít tự ren PT 3 mm', '≈ 1.1–1.35 mm (EJOT PT: ≈ 0.45·d — ren thưa, sâu để bám nhựa)'],
      ['Lỗ mồi cho PT 3 mm vào ABS/PC', '≈ 2.4–2.5 mm'],
      ['Mũi tua vít', 'Phillips PH1 (vít 3 mm), PH0 (vít 2 mm) — sai cỡ là toét đầu vít'],
      ['Mô-men khuyến nghị', 'PT 3 mm vào nhựa: 0.3–0.5 N·m · M3 thép vào đồng: 0.5–0.9 N·m'],
      ['Vật liệu', 'Thép carbon mạ kẽm (sáng xanh) hoặc nhuộm đen; inox ở chỗ ẩm'],
    ],
    principle: `
      <h4>Ren vít là một mặt phẳng nghiêng quấn quanh trụ</h4>
      <p>Mỗi vòng quay, vít tiến đúng <b>1 bước ren</b>. Mô-men tay bạn tạo ra lực dọc trục rất lớn nhờ "đòn bẩy" của mặt nghiêng: lực kẹp ≈ <code>F = T / (0.2 × d)</code>. Với T = 0.5 N·m, d = 3 mm → F ≈ <b>830 N</b> (~83 kg)! Đó là lý do một con vít nhỏ giữ chặt được cả robot.</p>
      <h4>3 giai đoạn khi vặn (nhìn đồ thị)</h4>
      <ol>
        <li><b>Chạy ren</b>: mô-men nhỏ, gần như không đổi (thắng ma sát ren; vít tự ren tốn hơn vì phải ép nhựa).</li>
        <li><b>Chạm mặt (seat)</b>: đầu vít ép lên bo → mô-men tăng rất nhanh, tạo lực kẹp.</li>
        <li><b>Quá lực</b>: ren nhựa bị cắt đứt → mô-men tụt đột ngột, vít quay trơn = <b>toét ren</b>.</li>
      </ol>
      <div class="tip">Mẹo khi lắp lại vít tự ren vào lỗ cũ: <b>vặn NGƯỢC chiều</b> nhẹ đến khi nghe "tách" (ren vít rơi vào rãnh ren cũ) rồi mới vặn xuôi — tránh cắt thêm một đường ren mới làm nát lỗ.</div>`,
    inRobot: `
      <ul>
        <li>Vỏ dưới ↔ vỏ trên: 8–14 vít PT 3×10/3×12, nhiều con giấu dưới nhãn dán / chân cao su.</li>
        <li>Module bánh xe, chổi cạnh, quạt hút: vít PT 2.6 hoặc 3 mm.</li>
        <li>Động cơ ↔ hộp số: vít máy M2/M2.5.</li>
        <li>Bo mạch PIC/ESP32 của bạn: bắt bằng <b>cột đồng M3 + vít M3</b> để cách đất & dễ tháo.</li>
      </ul>
      <div class="warn">Khi mổ xác robot: chụp ảnh trước khi tháo, dùng khay nhiều ngăn, dán nhãn "vỏ dưới — dài 12 mm"… Vít dài lắp nhầm vào lỗ nông có thể <b>đâm thủng vỏ hoặc chọc vào pin</b>.</div>`,
    mistakes: `
      <ul>
        <li>Dùng mũi PH2 cho vít PH1 → toét đầu vít (rất hay gặp với vít robot cũ, đã rỉ).</li>
        <li>Siết bằng máy khoan pin ở mức lực cao → toét ren nhựa ngay lần đầu.</li>
        <li>Lẫn vít máy M3 (ren mịn) vào cột nhựa → không ăn; lẫn vít PT vào đai ốc → hỏng đai ốc.</li>
        <li>Quên long-đen/vòng đệm khi bắt PCB lên cột kim loại → chập mạch đường đồng gần lỗ.</li>
      </ul>`,
    quiz: [
      { q: 'Vít M3×0.5 cần vặn bao nhiêu vòng để tiến 6 mm?', a: '6 / 0.5 = 12 vòng.' },
      { q: 'Vì sao vít tự ren có bước ren thưa và sâu hơn vít máy?', a: 'Để mỗi vòng ren "ôm" nhiều nhựa hơn — nhựa mềm nên cần diện tích ăn ren lớn để không bị tuột.' },
      { q: 'Trên đồ thị, dấu hiệu nào cho biết ren đã bị toét?', a: 'Mô-men đang tăng thì tụt đột ngột và giữ thấp dù vẫn quay — vít quay trơn, không tiến.' },
    ],
  },

  build(ctx) {
    const { THREE, MAT, geom, label, readout, fx } = ctx;
    const { mesh, group, part, lathe, cyl, box, helixThread, makeCutaway } = geom;
    const root = new THREE.Group();
    let type = 'pt', turns = 0, vel = 0, stripped = false, torque = 0, maxTurns = 0, cutSet = null, clutchOk = false;
    let fault = null, pierced = false, camOut = false, fT = 0;

    // ---------- con vít (đáy đầu vít tại y = 0, thân đi xuống -y) ----------
    const screw = new THREE.Group();
    const head = mesh(lathe([[0, 0], [2.75, 0], [2.85, 0.25], [2.75, 1.4], [2.1, 2.05], [0, 2.15]], 48), MAT.zinc);
    const cross1 = mesh(box(0.55, 0.6, 3.0), MAT.blackOxide, { y: 2.0 });
    const cross2 = mesh(box(3.0, 0.6, 0.55), MAT.blackOxide, { y: 2.0 });
    const headG = group(head, cross1, cross2);
    screw.add(part(headG, 'Đầu vít (pan head) + rãnh Phillips', 'Đầu tròn dẹt; rãnh chữ thập PH1. Mặt dưới đầu vít ép lên chi tiết để tạo lực kẹp.'));
    const shankWrap = new THREE.Group();
    screw.add(shankWrap);

    function buildShank() {
      shankWrap.clear();
      const t = TYPES[type];
      const core = mesh(cyl(type === 'pt' ? 1.05 : 1.25, type === 'pt' ? 1.05 : 1.25, LEN - 1, 32), MAT.zinc, { y: -(LEN - 1) / 2 });
      const tip = type === 'pt'
        ? mesh(cyl(1.05, 0.25, 1.2, 32), MAT.zinc, { y: -LEN + 0.4 })
        : mesh(cyl(1.25, 1.0, 1.0, 32), MAT.zinc, { y: -LEN + 0.5 });
      const turnsN = (LEN - 1.2) / t.pitch;
      const thread = mesh(helixThread({ radius: type === 'pt' ? 1.2 : 1.3, pitch: t.pitch, turns: turnsN, tube: type === 'pt' ? 0.3 : 0.2, y0: -0.4 }), MAT.zinc);
      shankWrap.add(part(group(core, tip, thread), type === 'pt' ? 'Thân vít tự ren (ren thưa, mũi nhọn)' : 'Thân vít máy M3 (ren mịn 0.5 mm)',
        type === 'pt' ? `Bước ren ${t.pitch} mm, mũi nhọn để dẫn hướng vào lỗ mồi trơn và tự cán ren trong nhựa.`
          : 'Ren hệ mét ISO, góc ren 60°, chỉ ăn vào lỗ đã có ren sẵn (đai ốc, cột đồng, lỗ taro).'));
      screw.traverse((o) => (o.userData.noCut = true));
      maxTurns = LEN / t.pitch;
    }

    // ---------- tấm PCB bị kẹp (mặt dưới tại y=0) ----------
    const plate = mesh(box(16, PLATE, 12), MAT.pcbGreen, { y: PLATE / 2 });
    part(plate, 'Chi tiết được kẹp (miếng PCB 1.6 mm)', 'Lỗ trên PCB là lỗ trơn 3.2 mm — ren chỉ ăn vào cột bên dưới.');
    const pad = mesh(cyl(3.2, 3.2, 0.06, 32), MAT.tin, { y: PLATE + 0.03 });
    root.add(plate, pad);

    // ---------- cột bên dưới (mặt trên tại y=0) ----------
    let bossHex = null;
    const bossWrap = new THREE.Group();
    root.add(bossWrap);
    function buildBoss() {
      bossWrap.clear();
      bossHex = null;
      if (type === 'pt') {
        const boss = mesh(lathe([[1.22, -12], [3.6, -12], [3.6, 0], [1.22, 0], [1.22, -12]], 48), MAT.plasticDark);
        const base = mesh(box(22, 2, 18), MAT.plasticDark, { y: -13 });
        const rib1 = mesh(box(1.2, 6, 7), MAT.plasticDark, { x: 0, y: -9, z: 6.5 });
        const rib2 = mesh(box(1.2, 6, 7), MAT.plasticDark, { x: 0, y: -9, z: -6.5 });
        bossWrap.add(part(group(boss, base, rib1, rib2), 'Cột nhựa có lỗ mồi (boss)', 'Lỗ trơn Ø2.45 mm đúc liền vỏ robot, có gân tăng cứng. Vít tự ren cán ra ren trong thành lỗ này.'));
      } else {
        // cột đồng lục giác M3 cái-cái 10 mm, ren trong (vẽ tượng trưng bằng ren xoắn bên trong)
        const hex = mesh(lathe([[1.25, -10], [2.9, -10], [2.9, 0], [1.25, 0], [1.25, -10]], 6), MAT.brass);
        const inner = mesh(helixThread({ radius: 1.3, pitch: 0.5, turns: 19, tube: 0.12, y0: -0.3 }), MAT.brass);
        const base = mesh(box(22, 2, 18), MAT.pcbGreen, { y: -11 });
        bossHex = hex;
        bossWrap.add(part(group(hex, inner), 'Cột đồng lục giác M3 (standoff)', 'Đồng thau, lỗ đã có ren M3×0.5. Dùng để nâng bo mạch khỏi khung, cách điện và dễ tháo lắp nhiều lần.'));
        bossWrap.add(part(base, 'Bo mạch phía dưới', 'Hai bo mạch xếp tầng bằng cột đồng.'));
      }
    }

    // ----- dùng cho sự cố "vít quá dài": nắp pin mỏng + cell 18650 ngay bên dưới -----
    const faultScene = new THREE.Group();
    faultScene.visible = false;
    const thin = mesh(box(30, 2, 24), MAT.plasticDark, { y: -1 });
    const cellGeo = cyl(9, 9, 40, 40);
    cellGeo.rotateZ(Math.PI / 2);
    const cell = mesh(cellGeo, MAT.plasticBlue, { y: -11.2 });
    faultScene.add(part(thin, 'Nắp hộp pin (nhựa dày 2 mm)', 'Rất mỏng — vít đúng chỉ dài 4–5 mm.'));
    faultScene.add(part(cell, 'Cell pin 18650 bên dưới nắp', 'Vỏ thép chỉ dày ~0.25 mm. Bên trong là cuộn điện cực + chất điện phân dễ cháy.'));
    root.add(faultScene);

    root.add(screw);
    buildShank();
    buildBoss();
    cutSet = makeCutaway(root);
    cutSet(true);
    // ---------- MÔ HÌNH CAD THẬT ----------
    // Cả 2 con vít CAD nằm TRONG nhóm `screw` → hoạt ảnh vặn (tiến 1 bước ren mỗi vòng + quay) lái thẳng node CAD.
    // PT 3×8: khung GLB đã đúng (mặt dưới đầu vít y = 0, thân đi xuống). ISO 4762: mũi ở y = 0, đầu lên trên → hạ 8 mm.
    const cutPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);     // giống makeCutaway(root)
    const firstMesh = (c) => { let m = null; c.obj?.traverse((o) => { if (!m && o.isMesh) m = o; }); return m; };
    const cadPT = cadAttach(ctx, screw, 'robot/pt-screw-3x8', {
      onBottom: false, frame: false, param: (p) => p.cad !== false && p.type === 'pt', hide: [headG, shankWrap],
      partDefault: ['Vít tự ren PT 3×8 — đầu PWA, PH1 (CAD thật)', 'Ren EJOT PT góc 30°, bước 1,35 mm (≈ 0,45·d): ren thưa và sâu để cán ren trong nhựa mà không làm nứt cột. Đầu PWA có vành rộng ép đều lên chi tiết. Mũi PH1. 1 vòng tiến 1,35 mm → 8 mm ≈ 5,9 vòng.'],
    });
    const cadM3 = cadAttach(ctx, screw, 'vendor/iso4762_socket_head_cap_screw_m3x8', {
      onBottom: false, frame: false, offset: [0, -8, 0], param: (p) => p.cad !== false && p.type === 'm3', hide: [headG, shankWrap],
      partDefault: ['Ốc lục giác chìm M3×8 ISO 4762 (CAD thật)', 'Đầu trụ Ø5,5 × 3 mm, lỗ lục giác 2,5 mm (vặn bằng lục giác/bit H2.5). Ren hệ mét M3 × 0,5: 1 vòng tiến 0,5 mm → 8 mm = 16 vòng. Chỉ ăn vào lỗ đã có ren (trụ đồng, đai ốc, lỗ taro).'],
    });
    // trụ đồng lục giác M3 × 10 cái-cái (thay khối lục giác tự dựng; ren trong tự dựng vẫn hiện để thấy ren ăn vào)
    let stClip = null;
    const cadSt = cadAttach(ctx, root, 'vendor/standoff_hex_female_female_m3_l0010_simple', {
      onBottom: false, frame: false, offset: [0, -10, 0], param: (p) => p.cad !== false && p.type === 'm3', hide: [],
      partDefault: ['Trụ đồng lục giác M3 × 10 cái-cái (CAD thật)', 'Đồng thau, lục giác 5 mm, lỗ ren M3 × 0,5 suốt 2 đầu. Nâng bo mạch cách khung 10 mm, cách điện và tháo lắp được nhiều lần.'],
      onLoad() { stClip = null; },
    });
    // khay ốc vít (CAD thật) — nhóm riêng, chỉ gắn vào cảnh khi bật để không làm camera lùi xa
    const trayG = new THREE.Group();
    const TRAY = [
      // [đường dẫn, x, z, xoay X, tên, mô tả]
      ['vendor/iso4762_socket_head_cap_screw_m2x6', -36, -26, 0, 'Ốc lục giác chìm M2×6', 'Bước 0,4 mm. Bắt module nhỏ (cảm biến, màn hình OLED), động cơ N20.'],
      ['vendor/iso4762_socket_head_cap_screw_m2p5x6', -28, -26, 0, 'Ốc lục giác chìm M2.5×6', 'Bước 0,45 mm. Lỗ bắt của Raspberry Pi, nhiều bo ESP32/driver.'],
      ['vendor/iso4762_socket_head_cap_screw_m2p5x10', -20, -26, 0, 'Ốc lục giác chìm M2.5×10', 'Như M2.5×6 nhưng dài hơn — xuyên qua bo + trụ đồng.'],
      ['vendor/iso4762_socket_head_cap_screw_m3x6', -12, -26, 0, 'Ốc lục giác chìm M3×6', 'Ngắn nhất: bắt bo 1,6 mm vào trụ đồng cái-cái (ăn ren ~4 mm = 8 vòng).'],
      ['vendor/iso4762_socket_head_cap_screw_m3x8', -4, -26, 0, 'Ốc lục giác chìm M3×8', 'Cỡ phổ biến nhất trong dự án (đang dùng ở mối ghép bên cạnh).'],
      ['vendor/iso4762_socket_head_cap_screw_m3x10', 4, -26, 0, 'Ốc lục giác chìm M3×10', 'Bắt qua tấm dày 3–4 mm.'],
      ['vendor/iso4762_socket_head_cap_screw_m3x12', 12, -26, 0, 'Ốc lục giác chìm M3×12', 'Bắt giá động cơ/khung nhôm, xuyên qua + đai ốc.'],
      ['vendor/iso4762_socket_head_cap_screw_m3x16', 20, -26, 0, 'Ốc lục giác chìm M3×16', 'Xuyên qua 2 tấm + đai ốc khoá.'],
      ['vendor/iso4762_socket_head_cap_screw_m3x20', 28, -26, 0, 'Ốc lục giác chìm M3×20', 'Dài nhất trong khay — cẩn thận: vít quá dài có thể đâm vào pin/bo mạch bên dưới!'],
      ['robot/pt-screw-2.6x10', 36, -26, 0, 'Vít tự ren PT 2.6×10 (đen)', 'Bước 1,17 mm. Bắt tháp lidar, module nhỏ vào cột nhựa.'],
      ['vendor/iso4032_hex_nut_m3', -30, -40, 0, 'Đai ốc lục giác M3 ISO 4032', 'Lục giác 5,5 mm, dày 2,4 mm. Dùng với vít xuyên qua; vặn bằng cờ lê 5,5.'],
      ['vendor/nyloc_nut_m3', -20, -40, 0, 'Đai ốc khoá nylon M3', 'Vòng nylon bóp chặt ren → không tự lỏng khi rung (bánh xe, động cơ). Dùng 1–2 lần là nên thay.'],
      ['vendor/flat_washer_normal_m3_simple', -10, -40, 0, 'Long đen phẳng M3 ISO 7089', 'Ø7 × 0,5 mm: chia đều lực kẹp, đỡ cho lỗ nhựa/PCB không bị đầu vít ép lõm.'],
      ['vendor/split_lock_washer_m3_simple', 0, -40, 0, 'Long đen vênh M3', 'Vòng thép bị xẻ & vênh: đàn hồi giữ lực căng chống lỏng (hiệu quả kém hơn đai ốc nylon).'],
      ['vendor/hex_standoff_m3_12mm_male_female', 10, -40, 0, 'Trụ đồng M3×12 đực-cái', 'Một đầu ren ngoài, một đầu ren trong → xếp chồng được nhiều tầng bo mạch.'],
      ['vendor/standoff_hex_female_female_m3_l0010_simple', 20, -40, 0, 'Trụ đồng M3×10 cái-cái', 'Hai đầu ren trong: 2 con vít M3 bắt từ trên & dưới (như mối ghép bên cạnh).'],
      ['vendor/heat_set_insert_m3_short_generic_simple', 30, -40, 0, 'Ốc cấy nhiệt M3 (heat-set insert)', 'Ống đồng có khía, dùng mỏ hàn ~220 °C ép vào lỗ nhựa in 3D → có ren M3 bền, tháo lắp nhiều lần. Cách sửa cột vít đã toét ren.'],
    ];
    const TX = 64, TZ = { [-26]: -7, [-40]: 7 };             // khay đặt bên phải mối ghép (+X)
    const trayBase = mesh(box(84, 2, 28), MAT.plasticDark, { x: TX, y: -15, z: 0 });
    trayG.add(part(trayBase, 'Khay ốc vít', 'Hàng trên: vít M2 → M3×20 và PT 2.6×10. Hàng dưới: đai ốc, long đen, trụ đồng, ốc cấy nhiệt.'));
    const trayCads = TRAY.map(([path, x, z, , name, desc]) => {
      const g = new THREE.Group();
      g.position.set(TX + x, -14, TZ[z]);
      trayG.add(g);
      return cadAttach(ctx, g, path, { onBottom: true, frame: false, hide: [], partDefault: [name + ' (CAD thật)', desc] });
    });
    let trayShown = false;

    label(root, 'Đầu vít', [0, PLATE + LEN + 3.5, 0]);
    label(root, 'Chi tiết bị kẹp', [9, PLATE, 0]);
    label(root, 'Cột (ren ăn vào đây)', [5, -6, 0]);

    let lastType = type, lastCut = true;
    function reset() { turns = 0; vel = 0; stripped = false; torque = 0; clutchOk = false; }

    return {
      object: root,
      triggerFault(id) {
        reset();
        fault = id; pierced = false; camOut = false; fT = 0;
        faultScene.visible = id === 'vit-dai';
        bossWrap.visible = id !== 'vit-dai';
        vel = 1;
      },
      resetFault() {
        fault = null; pierced = false; camOut = false;
        faultScene.visible = false; bossWrap.visible = true;
        reset();
      },
      onAction(id) {
        if (id === 'in') { vel = 1; clutchOk = false; }
        if (id === 'out') vel = -1;
        if (id === 'stop') vel = 0;
        if (id === 'reset') reset();
      },
      update(dt, t, p) {
        if (p.type !== lastType) {
          type = lastType = p.type;
          buildShank(); buildBoss(); reset();
          cutSet = makeCutaway(root); cutSet(p.cut); lastCut = p.cut;
        }
        if (p.cut !== lastCut) { cutSet(p.cut); lastCut = p.cut; }
        // ---------- CAD: chọn con vít theo loại, ẩn mô hình học tương ứng ----------
        const onPT = cadPT.sync(p), onM3 = cadM3.sync(p), onSt = cadSt.sync(p);
        const cadScrew = onPT || onM3;
        headG.visible = !cadScrew; shankWrap.visible = !cadScrew;      // 2 bộ CAD dùng chung phần bị ẩn → tự đặt lại
        if (bossHex) bossHex.visible = !onSt;
        if (cadSt.loaded) cadSt.holder.visible = onSt && fault !== 'vit-dai';
        if (onSt && stClip !== p.cut) {
          stClip = p.cut;
          cadSt.obj?.traverse((o) => { if (o.isMesh) { const m = ownMaterial(o); m.clippingPlanes = stClip ? [cutPlane] : null; m.side = THREE.DoubleSide; m.needsUpdate = true; } });
        }
        trayCads.forEach((c) => c.sync(p));
        const wantTray = !!(p.tray && p.cad !== false && trayCads.some((c) => c.loaded));
        if (wantTray !== trayShown) {
          trayShown = wantTray;
          if (wantTray) root.add(trayG); else root.remove(trayG);
          cadPT.refit();
        }
        const tp = TYPES[type];
        if (fault) fT += dt;
        const clutch = fault === 'qua-luc' ? 5 : p.clutch;     // máy khoan ở lực cao nhất
        const dTurn = (camOut ? 0 : vel * p.speed) * dt;
        const seated = turns >= maxTurns;
        // ----- mô hình mô-men -----
        if (vel > 0 && !stripped) {
          if (!seated) {
            turns = Math.min(maxTurns, turns + dTurn);
            const engaged = Math.max(0, turns * tp.pitch - PLATE);   // ren đã vào cột
            torque = engaged > 0 ? tp.tRun * (0.4 + engaged / LEN) : 0.01;
          } else {
            // đã chạm mặt: vít gần như không tiến, mô-men tăng theo góc vặn thêm
            torque += tp.kSeat * dTurn;
            turns += dTurn * 0.02;
            if (torque > tp.tStrip) { stripped = true; torque = tp.tRun * 0.3; }
            else if (torque >= clutch) { vel = 0; clutchOk = true; }   // ly hợp nhả: đạt lực siết
          }
        } else if (vel > 0 && stripped) {
          torque = tp.tRun * 0.3 + 0.02 * Math.sin(t * 20);   // quay trơn
        } else if (vel < 0) {
          turns = Math.max(0, turns + dTurn);
          torque = turns > PLATE / tp.pitch ? tp.tRun * 0.8 : 0.01;
          if (turns === 0) vel = 0;
        } else if (!clutchOk) torque *= Math.pow(0.02, dt);
        // sai cỡ mũi: khi mô-men vượt ~0.15 N·m mũi trượt ra, rãnh toét, vít đứng im
        if (fault === 'sai-mui' && torque > 0.15 && !camOut) {
          camOut = true;
          if (cadScrew) { const m = firstMesh(onPT ? cadPT : cadM3); if (m) fx.scorch(m, 0.35); }   // toét đầu vít CAD
          else screw.traverse((o) => { if (o.isMesh && o.geometry.type === 'BoxGeometry') fx.scorch(o, 0.35); });
          fx.sparks(screw, { count: 8, speed: 12, size: 0.25 });
        }
        // vít dài: mũi vít xuyên qua nắp 2 mm và vào cell pin
        if (fault === 'vit-dai' && !pierced && turns * tp.pitch - PLATE > 3.5) {
          pierced = true;
          fx.sparks([0, -2.5, 0], { count: 70, speed: 50, size: 0.6 });
          fx.flash([0, -2.5, 0], { size: 25, color: 0xfff0c0 });
          fx.smoke([0, -2, 0], { size: 10, duration: 7, color: 0xd8d8d8 });
          setTimeout(() => fault === 'vit-dai' && fx.fire([0, -1, 0], { size: 8, duration: 4 }), 2500);
        }
        if (pierced) fx.heat(cell, Math.min(1, fT / 6));

        // ----- vị trí & góc quay của vít -----
        const advance = Math.min(turns, maxTurns) * tp.pitch;
        screw.position.y = PLATE + LEN - advance;
        screw.rotation.y = -(stripped && vel > 0 ? turns * 2 * Math.PI + t * p.speed * 2 * Math.PI : turns * 2 * Math.PI);

        const depth = Math.max(0, advance - PLATE);
        readout('turns', turns);
        readout('depth', depth);
        readout('torque', torque);
        readout('state', pierced ? '🔥 ĐÂM THỦNG PIN!' : camOut ? '⚡ Toét đầu vít — mũi trượt' : stripped ? '⚠️ TOÉT REN' : clutchOk ? `✓ Ly hợp nhả — đã siết ${p.clutch.toFixed(2)} N·m` : seated ? (torque > tp.tStrip * 0.6 ? 'Siết căng — dừng lại!' : 'Đã chạm mặt') : vel ? 'Đang chạy ren' : 'Đứng yên');
        return [torque, depth];
      },
    };
  },
};
