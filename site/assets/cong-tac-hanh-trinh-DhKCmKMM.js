const n=`// 🔘 Công tắc hành trình (microswitch có cần gạt) — dùng cho bumper (RB4/RB5) và công tắc nhấc bánh (RB1/RB2)
// Cơ cấu "bật nhanh" (snap-action): lá lò xo tích năng rồi lật đột ngột khi chốt nhấn qua vị trí tác động (OP),
// lật về khi nhả qua vị trí nhả (RP < OP) → có trễ, tiếp điểm không "lưỡng lự".
// Dội tiếp điểm (contact bounce): tiếp điểm động đập vào tiếp điểm tĩnh rồi nảy lại, mỗi lần nảy ngắn đi
//   t_k = t_1·e^k (e ≈ 0.55 hệ số phục hồi) → tổng thời gian dội ≈ t_1/(1 − e) ≈ 1–3 ms.
// Firmware sensors.c: db_update() gọi mỗi 1 ms, mức mới phải giữ ổn định DEBOUNCE_MS = 5 lần liên tiếp mới được nhận.
// Mô hình CAD thật: robot/microswitch-ss5.glb (Omron SS-5GL theo datasheet) — thứ tự chân COM · NO · NC (NC ở đầu xa bản lề).
// Mô hình tự dựng giữ lại làm "chế độ học" và làm ruột (lá tiếp điểm, lò xo bật) khi cắt bổ vỏ CAD.
import { cadAttach, ownMaterial } from '../../core/cadParts.js';

const SLOW = 100;           // 1 ms thật = 0.1 s trên màn hình
const DEBOUNCE_MS = 5;
const L_LEVER = 20;         // mm — bản lề → đầu cần
const A_PLUNGER = 10.1;     // mm — bản lề → điểm tì lên chốt
const OP = 0.6, RP = 0.45;  // mm — hành trình CHỐT tại điểm tác động / điểm nhả
const TIP_MAX = 2.6;        // mm — hành trình tối đa đầu cần
const HINGE = [-8.6, 15.05];
const BODY_Y0 = 4, BODY_H = 10.2;

export default {
  id: 'cong-tac-hanh-trinh',
  name: 'Công tắc hành trình (microswitch)',
  category: 'cam-bien',
  order: 3,
  icon: '🔘',
  summary: 'Công tắc nhỏ có cần gạt nằm sau bumper và trên module bánh xe. Cắt bổ xem lá lò xo bật nhanh, tiếp điểm COM/NO/NC, và nhìn tiếp điểm "dội" vài ms trên máy hiện sóng — lý do firmware phải chống dội 5 ms.',
  tags: ['microswitch', 'công tắc', 'bumper', 'va chạm', 'chống dội', 'debounce', 'NO', 'NC', 'RB4', 'nhấc bánh'],

  params: [
    { id: 'cad', label: '🧊 Mô hình CAD thật (Omron SS-5GL)', type: 'toggle', value: true, hint: 'Tắt = mô hình học tự dựng (cần gạt dài, chốt đỏ to dễ nhìn)' },
    { id: 'mode', label: 'Cách nhấn', type: 'select', value: 'hit', options: [['hit', 'Tự động: bumper va tường liên tục'], ['manual', 'Bằng tay (thanh trượt bên dưới)']] },
    { id: 'pos', label: 'Đẩy đầu cần gạt (chế độ bằng tay)', type: 'range', min: 0, max: TIP_MAX, step: 0.02, value: 0, unit: 'mm' },
    { id: 'wiring', label: 'Cách đấu', type: 'select', value: 'no', options: [
      ['no', 'COM–GND, NO → RB4 (nhấn = 0) — dự án dùng'], ['nc', 'COM–GND, NC → RB4 (nhấn = 1, đứt dây = báo va chạm)'],
    ] },
    { id: 'debounce', label: 'Chống dội 5 ms trong firmware (db_update)', type: 'toggle', value: true },
    { id: 'cut', label: 'Cắt bổ vỏ xem bên trong', type: 'toggle', value: true },
    { id: 'hit1', label: '💥 Va chạm 1 lần', type: 'button' },
    { id: 'clr', label: '↺ Xóa bộ đếm sự kiện', type: 'button' },
  ],
  readouts: [
    { id: 'tip', label: 'Hành trình đầu cần', unit: 'mm' },
    { id: 'force', label: 'Lực tại đầu cần', unit: 'gf' },
    { id: 'contact', label: 'Tiếp điểm động đang chạm', unit: '' },
    { id: 'raw', label: 'Mức chân RB4 (thô)', unit: 'V' },
    { id: 'db', label: 'bump_mask bit0 (sau chống dội)', unit: '' },
    { id: 'edges', label: 'Số lần "chạm" nếu đọc thô', unit: 'lần' },
    { id: 'events', label: 'Số va chạm sau chống dội', unit: 'lần' },
    { id: 'bounce', label: 'Thời gian dội lần gần nhất', unit: 'ms' },
    { id: 'state', label: 'Tình trạng', unit: '' },
  ],
  scope: {
    window: 4,
    note: '(làm chậm 100×: cả khung = 40 ms thật; mỗi ô dọc = 4 ms)',
    channels: [
      { name: 'RB4 thô', unit: 'V', min: -0.5, max: 5.5, color: '#ffd34d' },
      { name: 'db_cnt (đếm ms ổn định)', unit: '', min: 0, max: 6, color: '#ff6b9a' },
      { name: 'Kết quả chống dội (1 = va chạm)', unit: '', min: -0.2, max: 1.2, color: '#3fcf8e' },
    ],
  },

  faults: [
    { id: 'dao-no-nc', label: 'Đấu nhầm vào chân NC (firmware vẫn đặt "nhấn = 0")', severity: 'loi',
      what: '<p>Vừa bật nguồn PIC đã báo <b>bumper luôn bị chạm</b>: robot không chịu tiến, chỉ lùi rồi quay mãi (phản xạ an toàn ép tốc độ dương về 0). Khi bumper bị chạm thật thì PIC lại tưởng hết chạm.</p>',
      why: '<p>NC (Normally Closed) = <b>thường đóng</b>: lúc không nhấn, COM nối NC → chân RB4 bị kéo xuống 0 V. Firmware <code>BUMP_ACTIVE_LEVEL = 0</code> hiểu 0 = "đang chạm". Logic bị đảo ngược hoàn toàn.</p>',
      fix: '<p>Đo bằng đồng hồ (thang thông mạch/ tít) giữa COM với từng chân khi nhấn và nhả, ghi nhãn NO/NC trước khi hàn. Hoặc đổi <code>BUMP_ACTIVE_LEVEL</code> thành 1 trong <code>config.h</code> nếu cố ý dùng NC.</p>' },
    { id: 'khong-chong-doi', label: 'Bỏ chống dội (đọc thẳng chân RB4)', severity: 'nhe',
      what: '<p>Mỗi lần bumper va tường, chương trình đếm được <b>3–8 lần chạm</b> thay vì 1. ESP32 nhận nhiều sự kiện <code>BUMP_L</code> liên tiếp, máy trạng thái bị khởi động lại giữa chừng → robot giật, quay góc kỳ lạ.</p>',
      why: '<p>Tiếp điểm kim loại có khối lượng và đàn hồi: khi đập vào nhau nó nảy lên vài lần trong 1–3 ms. Vi điều khiển đọc chân hàng nghìn lần mỗi giây nên "thấy" từng lần nảy là một lần nhấn.</p>',
      fix: '<p>Chống dội bằng phần mềm (dự án: <code>db_update()</code> — mức mới phải giữ 5 ms liên tục) hoặc phần cứng (RC 10 kΩ + 100 nF ≈ 1 ms + cổng Schmitt). Không dùng ngắt cạnh thẳng từ công tắc cơ khí.</p>' },
    { id: 'dut-day', label: 'Dây bumper bị đứt / giắc lỏng', severity: 'loi',
      what: '<p>Robot đâm vào tường mà <b>không biết</b>: bánh tiếp tục đẩy, động cơ gần kẹt (dòng ~1.5–2 A mỗi bánh), lốp mài sàn, có thể đẩy đổ đồ. Sau 3 s ESP32 mới nhận ra nhờ phát hiện kẹt (<code>STUCK_MS</code>: encoder không tăng).</p>',
      why: '<p>Với cách đấu NO + trở kéo lên, <b>đứt dây = không nhấn</b>: chân RB4 luôn ở 5 V. Không có cách nào phân biệt "không chạm" với "hỏng dây" — đấu NO <i>không an toàn khi hỏng</i> (not fail-safe).</p>',
      fix: '<p>Dùng đấu NC (chọn ở mục Cách đấu): đứt dây → chân lên 1 → báo va chạm → robot dừng (an toàn khi hỏng, fail-safe). Đi dây có chừa độ chùng, không kẹp vào bản lề bumper, dùng giắc có khóa; giữ phát hiện kẹt bằng encoder làm lớp bảo vệ thứ 2.</p>' },
    { id: 'quen-keo-len', label: 'Quên bật trở kéo lên nội PORTB', severity: 'loi',
      what: '<p>Robot dừng/lùi ngẫu nhiên giữa phòng, nhất là khi chạm tay vào dây hay khi động cơ chạy: chân RB4 lúc 0 lúc 1 dù không ai chạm bumper.</p>',
      why: '<p>Khi công tắc hở, chân RB4 không nối vào đâu (thả nổi) — ngõ vào CMOS trở kháng ~10<sup>12</sup> Ω nên chỉ cần nhiễu điện dung vài pF cũng đổi mức. Trở kéo lên nội PORTB (~20 kΩ, I ≈ 250 µA) chỉ bật khi gọi <code>port_b_pullups(TRUE)</code> (bit RBPU = 0).</p>',
      fix: '<p>Gọi <code>port_b_pullups(TRUE)</code> trong <code>sensors_init()</code> (dự án đã có), hoặc hàn trở 10 kΩ lên 5 V. Nhớ: RA/RC/RD không có kéo lên nội.</p>' },
    { id: 'han-lau', label: 'Hàn chân quá lâu (mỏ hàn 400 °C, 10 giây)', severity: 'hong',
      what: '<p>Chân đồng nóng truyền nhiệt vào thân nhựa → nhựa chảy mềm, lá tiếp điểm bên trong bị xô lệch → công tắc <b>kẹt ở trạng thái nhấn</b> (hoặc không bao giờ đóng). Có mùi nhựa khét, vỏ biến dạng.</p>',
      why: '<p>Thân microswitch thường là nhựa PBT/PA chịu ~220 °C trong vài giây. Datasheet cho phép hàn tay 350 °C tối đa ~3 s. Giữ 10 s ở 400 °C vượt xa giới hạn.</p>',
      fix: '<p>Tráng thiếc dây và chân trước, hàn nhanh ≤ 3 s, nhiệt độ 330–350 °C. Dùng giắc cắm/ đầu cos nếu có. Thử thông mạch NO/NC sau khi hàn.</p>' },
  ],

  info: {
    overview: \`
      <p><b>Công tắc hành trình</b> (microswitch, limit switch) đóng/ngắt mạch khi bị đẩy. Trong robot hút bụi có ít nhất 4 cái: <b>2 sau bumper</b> (cản va phía trước — biết đâm trái hay phải) và <b>2 trên module bánh xe</b> (biết robot bị nhấc lên khỏi sàn để dừng bánh ngay).</p>
      <p>Thử: để chế độ <b>Tự động</b>, nhìn máy hiện sóng: đường vàng (chân RB4) <b>nhảy nhiều lần</b> trong ~2 ms mỗi khi tiếp điểm đóng — đó là <b>dội tiếp điểm</b>. Đường xanh lá (sau chống dội) chỉ đổi 1 lần, trễ 5 ms. Tắt "Chống dội" và so sánh ô "Số lần chạm nếu đọc thô". Chuyển sang <b>Bằng tay</b>, kéo từ từ để thấy điểm bật (OP) và điểm nhả (RP) khác nhau.</p>\`,
    specs: [
      ['Kích thước (loại SS-5 / KW4)', '19.8 × 10.2 × 6.4 mm, 2 lỗ bắt vít Ø2.35 cách nhau 9.5 mm'],
      ['Tiếp điểm', 'COM (chung), NO (thường mở), NC (thường đóng) — 1 tiếp điểm chuyển mạch SPDT'],
      ['Định mức', '3–5 A 125/250 VAC — dùng cho tín hiệu logic thì dư sức (chỉ 0.25 mA)'],
      ['Lực tác động', '~0.5 N ở chốt, ~0.25 N (25 gf) ở đầu cần gạt 20 mm'],
      ['Hành trình chốt', 'OP ≈ 0.6 mm (bật) · RP ≈ 0.45 mm (nhả) · trễ MD ≈ 0.15 mm · tổng ~1.3 mm'],
      ['Tuổi thọ cơ', '10⁶–10⁷ lần nhấn'],
      ['Thời gian dội', '0.5–5 ms (thường 1–3 ms), dài hơn khi tiếp điểm bẩn/ oxy hóa'],
      ['Trở kéo lên nội PORTB', '~20 kΩ (50–400 µA) — bật bằng <code>port_b_pullups(TRUE)</code>'],
    ],
    principle: \`
      <h4>1. Cơ cấu bật nhanh (snap-action)</h4>
      <p>Lá lò xo được uốn cong sẵn (tích năng). Khi chốt ép xuống tới <b>vị trí tác động OP</b>, lá lò xo vượt "điểm chết" và lật đột ngột → tiếp điểm động rời NC, đập xuống NO với tốc độ cao, không phụ thuộc người nhấn chậm hay nhanh. Nhả ra phải lùi về <b>vị trí nhả RP</b> (thấp hơn OP) mới lật lại → <b>trễ</b> (hysteresis), không rung ở ranh giới.</p>
      <h4>2. Đòn bẩy của cần gạt</h4>
      <p>Cần dài L = 20 mm, chốt cách bản lề a = 10.1 mm: <code>hành trình chốt = hành trình đầu cần × a/L ≈ 0.5×</code>, còn lực ở đầu cần chỉ bằng ~½ lực ở chốt. Bumper nhẹ cũng kích được.</p>
      <h4>3. Dội tiếp điểm (contact bounce)</h4>
      <p>Tiếp điểm động có khối lượng, va vào tiếp điểm tĩnh và nảy lại. Mỗi lần nảy năng lượng mất bớt theo hệ số phục hồi e: <code>t<sub>k</sub> = t<sub>1</sub>·e<sup>k</sup></code>, tổng <code>≈ t<sub>1</sub>/(1−e)</code>. Với t<sub>1</sub> ≈ 0.5 ms, e ≈ 0.55 → ~1.1 ms.</p>
      <h4>4. Chống dội trong firmware dự án</h4>
      <pre><code>if (raw != db_state) { if (++db_cnt >= 5) { db_state = raw; db_cnt = 0; } }
else db_cnt = 0;</code></pre>
      <p>Hàm chạy mỗi 1 ms (ngắt Timer2). Mức mới phải giữ <b>5 lần liên tiếp</b> mới được chấp nhận → kết quả trễ ~5 ms, đủ nhanh cho robot (0.3 m/s × 5 ms = 1.5 mm).</p>
      <h4>5. Đấu NO hay NC?</h4>
      <p>NO + kéo lên: nhấn = 0 V. NC + kéo lên: nhấn = 5 V, và <b>đứt dây cũng = 5 V</b> → hệ thống tưởng đang va chạm → dừng: "an toàn khi hỏng" (fail-safe).</p>\`,
    inRobot: \`
      <ul>
        <li><b>Bumper trái → RB4 (chân 37)</b>, <b>bumper phải → RB5 (chân 38)</b>. Va chính giữa → cả 2 cùng chạm (<code>bump = 0x03</code>).</li>
        <li><b>Nhấc bánh trái → RB1 (chân 34)</b>, <b>phải → RB2 (chân 35)</b>. Công tắc nằm trên tay đòn module bánh, lò xo ép bánh xuống; nhấc robot → bánh tụt xuống → công tắc đổi trạng thái.</li>
        <li>Tất cả: COM → GND, chân tín hiệu → PORTB với <b>trở kéo lên nội</b>; <code>BUMP_ACTIVE_LEVEL = 0</code>, <code>DROP_ACTIVE_LEVEL = 0</code> trong <code>config.h</code> — <i>đo lại bằng đồng hồ</i> vì có robot công tắc nhấc bánh đóng khi bánh hạ.</li>
        <li><code>sensors_tick_1ms()</code> → <code>db_update()</code> cho 5 đầu vào (bumpL, bumpR, dropL, dropR, nút START) → <code>bump_mask</code>, <code>drop_mask</code> gửi trong STATUS.</li>
        <li>Phản xạ trên PIC: bumper chạm → cấm tiến (vẫn cho lùi); bánh bị nhấc → <b>dừng cả 2 bánh + tắt chổi</b>. ESP32: <code>E,BUMP_L</code> → lùi 60 mm, quay 100–170° về phía ngược lại.</li>
      </ul>\`,
    mistakes: \`
      <ul>
        <li>Nhầm NO/NC khi hàn → bumper luôn báo chạm.</li>
        <li>Không chống dội → 1 va chạm thành nhiều sự kiện.</li>
        <li>Quên <code>port_b_pullups(TRUE)</code> → chân thả nổi, báo va chạm ma.</li>
        <li>Lắp bumper lệch, cần gạt luôn bị tì nửa chừng (giữa RP và OP) → rung nhẹ là bật/nhả liên tục.</li>
        <li>Dây đi qua bản lề bumper → gãy ngầm sau vài nghìn lần va.</li>
        <li>Hàn quá lâu làm chảy thân nhựa.</li>
      </ul>\`,
    quiz: [
      { q: 'Công tắc có 3 chân COM, NO, NC. Khi KHÔNG nhấn, COM thông với chân nào?', a: 'Với NC (Normally Closed — thường đóng). Khi nhấn, COM chuyển sang thông với NO.' },
      { q: 'Vì sao firmware cần chống dội, và dự án chống dội thế nào?', a: 'Tiếp điểm nảy nhiều lần trong 1–3 ms nên đọc thô sẽ thấy nhiều lần nhấn. db_update() chạy mỗi 1 ms, chỉ chấp nhận mức mới khi nó giữ ổn định 5 lần liên tiếp (5 ms).' },
      { q: 'Đấu NC có lợi gì về an toàn so với NO?', a: 'Đứt dây/ lỏng giắc thì chân bị kéo lên = giống như đang bị nhấn → robot dừng (fail-safe). Đấu NO thì đứt dây trông như "không chạm" → robot đâm mà không biết.' },
    ],
  },

  build(ctx) {
    const { THREE, MAT, geom, label, readout, fx } = ctx;
    const { mesh, group, part, cyl, box, wire, makeCutaway } = geom;
    const root = new THREE.Group();
    const cy = BODY_Y0 + BODY_H / 2;

    // ---------- vỏ (bị cắt bổ) ----------
    const housing = new THREE.Group();
    const shell = mesh(box(19.8, BODY_H, 6.4, 0.5), MAT.plasticBlack, { y: cy });
    const holes = [-4.75, 4.75].map((x) => mesh(cyl(1.25, 1.25, 6.6, 20), MAT.plasticDark, { x, y: cy - 1, rx: Math.PI / 2 }));
    housing.add(part(group(shell, ...holes), 'Thân công tắc (nhựa PBT) 19.8 × 10.2 × 6.4 mm',
      'Hai lỗ Ø2.35 bắt vít M2 vào khung bumper/ module bánh. Nhựa chịu nhiệt có giới hạn — hàn nhanh!'));
    root.add(housing);

    // ---------- chốt nhấn ----------
    const plunger = mesh(box(2.8, 3, 2.8, 0.3), MAT.plasticRed, { x: 1.5, y: 13.3 });
    plunger.userData.noCut = true;
    root.add(part(plunger, 'Chốt nhấn (plunger)', \`Cần gạt ép chốt xuống. Chốt đi \${OP} mm thì lá lò xo lật (vị trí tác động OP), lùi về \${RP} mm mới lật lại (RP).\`));

    // ---------- cần gạt (xoay quanh bản lề) ----------
    const leverPivot = new THREE.Group();
    leverPivot.position.set(HINGE[0], HINGE[1], 0);
    const leverBar = mesh(box(L_LEVER + 1, 0.5, 4), MAT.steel, { x: L_LEVER / 2 });
    const leverTip = mesh(box(1.6, 0.5, 4), MAT.steel, { x: L_LEVER + 0.3, y: 0.45, rz: 0.6 });
    const hingePin = mesh(cyl(0.6, 0.6, 5, 12), MAT.steel, { rx: Math.PI / 2 });
    leverPivot.add(part(group(leverBar, leverTip, hingePin), 'Cần gạt thép (hinge lever) 20 mm',
      'Đòn bẩy: đầu cần đi 1 mm thì chốt chỉ đi ~0.5 mm, nhưng lực cần chỉ ~½ → bumper nhẹ cũng kích được.'));
    leverPivot.traverse((o) => (o.userData.noCut = true));
    root.add(leverPivot);

    // ---------- bên trong: lá lò xo + tiếp điểm ----------
    const inside = new THREE.Group();
    // lá tiếp điểm động (gốc ở trụ COM)
    const bladePivot = new THREE.Group();
    bladePivot.position.set(-7, 9, 0);
    const blade = mesh(box(13.4, 0.25, 2.4), MAT.copper, { x: 6.7 });
    const button = mesh(cyl(0.9, 0.9, 1.4, 16), MAT.tin, { x: 13 });
    bladePivot.add(part(group(blade, button), 'Lá tiếp điểm động (đồng berili) + nút bạc',
      'Nối với COM. Lật giữa NC (trên) và NO (dưới). Nút tiếp điểm mạ bạc để điện trở tiếp xúc thấp.'));
    inside.add(bladePivot);
    const tongue = mesh(box(0.25, 3.2, 2), MAT.brass, { x: 1.5, y: 10.3 });
    inside.add(part(tongue, 'Lò xo lá bật (tongue spring)', 'Lá thép cong tích năng. Khi chốt ép qua "điểm chết", nó lật đột ngột kéo lá tiếp điểm theo — snap-action.'));
    // trụ COM, tay NC, tay NO
    const comPost = mesh(box(1.2, 6.5, 2.4), MAT.brass, { x: -7.6, y: 7.2 });
    inside.add(part(comPost, 'Trụ COM (chung)', 'Chân chung: nối GND trong dự án.'));
    // thứ tự chân theo datasheet Omron SS: COM (gần bản lề) · NO (giữa) · NC (đầu xa)
    const ncArm = group(mesh(box(1, 8, 2.4), MAT.brass, { x: 7.6, y: 8.2 }), mesh(box(2.6, 1, 2.4), MAT.brass, { x: 6.8, y: 12.2 }), mesh(cyl(0.8, 0.8, 0.9, 16), MAT.tin, { x: 6, y: 11.3 }));
    inside.add(part(ncArm, 'Tiếp điểm tĩnh NC (thường đóng)', 'Lúc không nhấn, lá động tì vào đây: COM–NC thông mạch.'));
    const noArm = group(mesh(box(1, 1.6, 2.4), MAT.brass, { x: 0.8, y: 5.0 }), mesh(box(6.2, 0.8, 2.4), MAT.brass, { x: 3.4, y: 5.4 }), mesh(cyl(0.8, 0.8, 0.9, 16), MAT.tin, { x: 6, y: 6.2 }));
    inside.add(part(noArm, 'Tiếp điểm tĩnh NO (thường mở)', 'Khi nhấn qua OP, lá động đập xuống đây (và nảy vài lần — dội tiếp điểm): COM–NO thông mạch.'));
    inside.traverse((o) => (o.userData.noCut = true));
    root.add(inside);

    // ---------- 3 chân hàn ----------
    const terms = [[-7.6, 'COM'], [0.8, 'NO'], [7.6, 'NC']].map(([x, n]) => {
      const t = mesh(box(0.5, 4.4, 3.2), MAT.brass, { x, y: 2.2 });
      t.userData.noCut = true;
      root.add(part(t, \`Chân hàn \${n}\`, n === 'COM' ? 'Chân chung → GND.' : n === 'NO' ? 'Thường mở → RB4 (dự án). Nhấn = nối GND = mức 0.' : 'Thường đóng. Đấu vào đây nếu muốn kiểu "an toàn khi hỏng" (fail-safe).'));
      return t;
    });
    const procLabels = new THREE.Group();     // nhãn chân của mô hình học (CAD có nhãn riêng theo vị trí chân thật)
    root.add(procLabels);
    label(procLabels, 'COM', [-7.6, -1.5, 3]);
    label(procLabels, 'NO', [0.8, -1.5, 3]);
    label(procLabels, 'NC', [7.6, -1.5, 3]);

    // dây ra PIC
    const wGnd = wire([[-7.6, 0, 0], [-7.6, -6, 0], [-12, -10, 0], [-20, -12, 0]], { radius: 0.4, color: 0x222222 });
    const wNO = wire([[0.8, 0, 0], [0.8, -5, 0], [5, -9, 0], [18, -12, 0]], { radius: 0.4, color: 0x1fc7c7 });
    const wNC = wire([[7.6, 0, 0], [7.6, -6, 0], [10, -10, 0], [18, -13, 0]], { radius: 0.4, color: 0x1fc7c7 });
    [wGnd, wNO, wNC].forEach((w) => (w.userData.noCut = true));
    root.add(part(wGnd, 'Dây GND', 'COM → GND chung của bo PIC.'));
    root.add(part(wNO, 'Dây tín hiệu → RB4 (bumper trái, chân 37)', 'PIC bật trở kéo lên nội ~20 kΩ: hở = 5 V, đóng = 0 V. Bumper phải → RB5; nhấc bánh → RB1/RB2.'));
    root.add(part(wNC, 'Dây tín hiệu (đấu NC) → RB4', 'Đấu NC: không nhấn = 0 V, nhấn = 5 V, đứt dây = 5 V (báo va chạm — an toàn khi hỏng).'));
    label(root, '→ RB4', [19, -12, 0]);

    // ---------- mảnh bumper đẩy đầu cần ----------
    const bumper = mesh(box(16, 4, 10, 1), MAT.plasticGrey, { x: HINGE[0] + L_LEVER + 1, y: HINGE[1] + 3.5 });
    bumper.userData.noCut = true;
    root.add(part(bumper, 'Mảnh bumper (cản va)', 'Khi robot đâm vật cản, bumper lùi lại vài mm và ép cần gạt. <a href="#/c/bumper">Xem chi tiết →</a>'));
    label(root, 'Bumper', [HINGE[0] + L_LEVER + 1, HINGE[1] + 7, 0]);

    const setCut = makeCutaway(root);
    setCut(true);

    // ---------- mô hình CAD thật Omron SS-5GL (khung GLB: đáy thân ở y = 0, chân hướng −Y) ----------
    // Nâng 4 mm để đáy thân trùng mô hình tự dựng (y = 4). Bản lề CAD (−8.6, 14.6), cần dài ~16.4 mm, nhô 11°.
    const cutPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    const cadR = { bodyMats: [] };
    const cad = cadAttach(ctx, root, 'robot/microswitch-ss5', {
      onBottom: false, offset: [0, 4, 0],
      hide: [housing, plunger, leverPivot, ...terms, procLabels],
      partDefault: ['Công tắc Omron SS-5GL (CAD thật)', 'Mô hình CAD theo datasheet Omron SS: thân 19.8 × 6.4 × 10.2 mm, cần gạt thép không gỉ ~16.4 mm, 3 chân hàn COM · NO · NC.'],
      parts: {
        body: ['Thân công tắc (nhựa PBT đen) 19.8 × 10.2 × 6.4 mm', 'Hai lỗ Ø2.35 cách nhau 9.5 mm bắt vít M2 vào khung bumper/ module bánh. Nhựa chịu nhiệt có giới hạn — hàn nhanh!'],
        plunger: ['Chốt nhấn đỏ (plunger)', \`Cần gạt ép chốt xuống. Chốt đi \${OP} mm thì lá lò xo bên trong lật (vị trí tác động OP), lùi về \${RP} mm mới lật lại (RP).\`],
        lever: ['Cần gạt thép không gỉ (hinge lever)', 'Đòn bẩy: ép đầu cần xuống ~11° là chốt đi hết hành trình. Lực ở đầu cần chỉ ~½ lực ở chốt → bumper nhẹ cũng kích được.'],
        lever_pin: ['Chốt bản lề cần gạt', 'Trục xoay của cần. Cần cong/ lỏng chốt → điểm tác động lệch, bumper "lúc ăn lúc không".'],
        term_com: ['Chân hàn COM (chung)', 'Chân gần bản lề. Dự án: nối GND.'],
        term_no: ['Chân hàn NO (thường mở)', 'Chân giữa. → RB4 (dự án). Nhấn = nối GND = mức 0.'],
        term_nc: ['Chân hàn NC (thường đóng)', 'Chân ở đầu xa bản lề. Đấu vào đây nếu muốn kiểu "an toàn khi hỏng" (fail-safe).'],
      },
      labels: [['COM', 'term_com', [0, -4.5, 3]], ['NO', 'term_no', [0, -4.5, 3]], ['NC', 'term_nc', [0, -4.5, 3]]],
      onLoad(c) {
        // manifest ghi theo CAD Z-up: trục bản lề (0,−1,0) → GLB (0,0,1); gốc (−8.6, 0, 10.6) → (−8.6, 10.6, 0); chốt trượt (0,0,−1) → (0,−1,0)
        cadR.lever = c.pivot('lever', { axis: [0, 0, 1], origin: [-8.6, 10.6, 0] });
        cadR.plunger = c.slide('plunger', [0, -1, 0]);
        cadR.body = c.node('body');
        cadR.no = c.node('term_no');
        cadR.body?.traverse((o) => { if (o.isMesh) { const m = ownMaterial(o); m.side = THREE.DoubleSide; cadR.bodyMats.push(m); } });
      },
    });
    let lastCadClip = null;
    const tgt = (cadNode, proc) => (cad.active && cadNode ? cadNode : proc);

    // ---------- trạng thái mô phỏng (thời gian "thật" τ tính bằng ms) ----------
    let tau = 0, snapNO = false, seq = null, lastCut = true, anim = null, autoT = 0;
    let dbState = 0, dbCnt = 0, msAcc = 0, prevRawActive = 0, edges = 0, events = 0, prevDb = 0, lastBounce = 0;
    let fault = null, faultT = 0, burnt = false;
    const bladeAngle = { NC: 0.135, NO: -0.135, MID: 0 };
    let bladeA = bladeAngle.NC;

    // tạo chuỗi dội khi lá lật sang phía \`toNO\`
    function makeBounce(toNO) {
      const ev = [];          // [thời điểm τ (ms), đang chạm đích?]
      let tt = tau + 0.25;    // thời gian bay giữa 2 tiếp điểm ~0.25 ms
      const t1 = (toNO ? 0.45 : 0.25) + Math.random() * 0.25;
      const e = 0.5 + Math.random() * 0.12;
      const n = toNO ? 3 + Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 2);
      for (let k = 0; k < n; k++) {
        ev.push([tt, true]);
        tt += 0.12 + Math.random() * 0.25;              // chạm một chút
        ev.push([tt, false]);
        tt += t1 * Math.pow(e, k);                      // nảy lên, mỗi lần ngắn hơn
      }
      ev.push([tt, true]);
      lastBounce = tt - (tau + 0.25);
      return { toNO, ev, start: tau };
    }
    // trạng thái tiếp điểm tại τ: 'NO' | 'NC' | 'MID'
    function contactNow() {
      if (fault === 'han-lau' && burnt) return 'NO';
      if (!seq) return snapNO ? 'NO' : 'NC';
      let touching = false;
      for (const [te, s] of seq.ev) { if (tau >= te) touching = s; else break; }
      if (tau > seq.ev[seq.ev.length - 1][0]) { seq = null; return snapNO ? 'NO' : 'NC'; }
      return touching ? (seq.toNO ? 'NO' : 'NC') : 'MID';
    }
    // biên dạng va chạm (ms): ép 8 ms → giữ 15 ms → nhả 8 ms
    function hitProfile(ms) {
      if (ms < 8) return (ms / 8) * 2.4;
      if (ms < 23) return 2.4;
      if (ms < 31) return 2.4 * (1 - (ms - 23) / 8);
      return null;
    }

    return {
      object: root,
      onAction(id) {
        if (id === 'hit1') anim = { t0: tau };
        if (id === 'clr') { edges = 0; events = 0; }
      },
      triggerFault(id) { fault = id; faultT = 0; burnt = false; edges = 0; events = 0; if (id !== 'han-lau') anim = { t0: tau }; },
      resetFault() { fault = null; burnt = false; wNO.position.set(0, 0, 0); },
      update(dt, t, p) {
        const dms = (dt * 1000) / SLOW;
        tau += dms;
        faultT += dt;
        if (p.cut !== lastCut) { setCut(p.cut); lastCut = p.cut; }

        // ----- vị trí đầu cần -----
        let tip = p.mode === 'manual' ? p.pos : 0;
        if (p.mode === 'hit' && !anim && fault !== 'han-lau') { autoT += dms; if (autoT > 12) { autoT = 0; anim = { t0: tau }; } }
        if (anim) { const s = hitProfile(tau - anim.t0); if (s === null) anim = null; else tip = Math.max(tip, s); }
        // hàn quá lâu: nóng → chảy → kẹt
        if (fault === 'han-lau') {
          tip = 0;
          if (faultT < 2.5) fx.heat(tgt(cadR.no, terms[1]), Math.min(1, faultT / 1.5));
          if (faultT > 1.6 && !burnt) {
            burnt = true;
            fx.heat(tgt(cadR.no, terms[1]), 0);
            fx.smoke(tgt(cadR.no, terms[1]), { size: 6, duration: 4 });
            fx.scorch(tgt(cadR.body, shell), 0.55);
          }
        }
        const plTravel = (tip * A_PLUNGER) / L_LEVER;
        leverPivot.rotation.z = -Math.asin(Math.min(1, tip / L_LEVER));
        plunger.position.y = 13.3 - plTravel;
        bumper.position.y = HINGE[1] + 3.5 - tip;
        // ----- CAD thật: cần gạt xoay quanh chốt bản lề, chốt đỏ trượt xuống theo cùng hành trình mô phỏng -----
        const cadOn = cad.sync(p);
        if (cadOn) {
          cadR.lever?.set(-Math.asin(Math.min(1, tip / 16.4)));
          cadR.plunger?.set(Math.min(plTravel, 0.9));
          bumper.position.x = 15.5;                // đầu cần CAD ngắn hơn (x ≈ 8) và nhô cao hơn (y ≈ 18.7)
          bumper.position.y = 20.7 - tip;
          const clip = !!p.cut;
          if (clip !== lastCadClip) {
            lastCadClip = clip;
            cadR.bodyMats.forEach((m) => { m.clippingPlanes = clip ? [cutPlane] : null; m.needsUpdate = true; });
          }
        } else bumper.position.x = HINGE[0] + L_LEVER + 1;

        // ----- cơ cấu bật nhanh có trễ -----
        if (!snapNO && plTravel >= OP) { snapNO = true; seq = makeBounce(true); }
        else if (snapNO && plTravel <= RP) { snapNO = false; seq = makeBounce(false); }
        const c = contactNow();
        const target = bladeAngle[c];
        bladeA += (target - bladeA) * Math.min(1, dt * 30);
        bladePivot.rotation.z = bladeA;
        tongue.rotation.z = snapNO ? -0.35 : 0.35;
        tongue.position.y = 10.3 - plTravel;

        // ----- mức điện chân RB4 -----
        const wiredNC = p.wiring === 'nc' || fault === 'dao-no-nc';
        const activeLevel = p.wiring === 'nc' ? 1 : 0;          // BUMP_ACTIVE_LEVEL trong config.h (lỗi đảo: vẫn = 0)
        let closed = wiredNC ? c === 'NC' : c === 'NO';
        if (fault === 'dut-day') { closed = false; wNO.position.set(0, -3, 3); }
        let vPin;
        if (closed) vPin = 0.05;
        else if (fault === 'quen-keo-len') vPin = Math.max(0, Math.min(5, 2.5 + 2.6 * Math.sin(t * 9.3) + 1.5 * (Math.random() - 0.5)));
        else vPin = 5;
        const level = vPin > 2 ? 1 : 0;                          // ngõ vào TTL của PORTB: ngưỡng ~0.8/2.0 V
        const rawActive = level === activeLevel ? 1 : 0;
        if (rawActive && !prevRawActive) edges++;
        prevRawActive = rawActive;

        // ----- firmware: db_update() mỗi 1 ms -----
        msAcc += dms;
        while (msAcc >= 1) {
          msAcc -= 1;
          if (rawActive !== dbState) { if (++dbCnt >= DEBOUNCE_MS) { dbState = rawActive; dbCnt = 0; } }
          else dbCnt = 0;
        }
        const useDb = p.debounce && fault !== 'khong-chong-doi';
        const outState = useDb ? dbState : rawActive;
        if (useDb && dbState && !prevDb) events++;
        if (!useDb) events = edges;
        prevDb = dbState;

        // ----- lực tại đầu cần (gf) -----
        let force;
        if (!snapNO) force = 8 + (tip / ((OP * L_LEVER) / A_PLUNGER)) * 18;
        else force = 17 + (tip / TIP_MAX) * 13;
        if (tip <= 0) force = 0;

        readout('tip', tip);
        readout('force', force);
        readout('contact', c === 'MID' ? '↕ đang bay / nảy' : c === 'NO' ? 'COM–NO' : 'COM–NC');
        readout('raw', vPin);
        readout('db', outState);
        readout('edges', edges);
        readout('events', events);
        readout('bounce', lastBounce);
        let st = outState ? '💥 Va chạm (bump_mask bit0 = 1) → PIC cấm tiến' : '✓ Không chạm';
        if (fault === 'dao-no-nc') st = outState ? '⚠ Luôn báo chạm (đấu NC, firmware chờ NO)' : '⚠ Va thật lại thành "hết chạm"!';
        if (fault === 'dut-day') st = '⚠ Dây đứt: RB4 luôn 5 V → không bao giờ thấy va chạm';
        if (fault === 'quen-keo-len' && !closed) st = '⚠ Chân thả nổi — mức đọc ngẫu nhiên';
        if (fault === 'han-lau') st = burnt ? '💀 Thân chảy, tiếp điểm kẹt ở NO → luôn báo chạm' : '🔥 Đang nung chân hàn…';
        if (!useDb) st += \` · đọc thô đếm \${edges} lần\`;
        readout('state', st);
        return [vPin, dbCnt, outState];
      },
    };
  },
};
`;export{n as default};
