// 🧯 Cầu chì lưỡi (blade fuse ATO) 10 A — đặt ngay sau cực + của pin.
// Mô hình nhiệt dây chảy (kẽm, nóng chảy 420 °C):  C·dT/dt = I²·R − (T − Ta)/Rth
//   R = 0.8/In² (10 A → 8 mΩ), Rth = 292 K/W, C = 6.2 mJ/K → τ ≈ 1.8 s. Không đứt dưới ~1.3·In;
//   2·In ≈ 1 s; 3.5·In ≈ 0.25 s; chập 100 A ≈ 30 ms (khớp đường đặc tính ATO tác động nhanh).
//   Gần như đoạn nhiệt khi dòng rất lớn: tích phân I²t ≈ C·ΔT/R ("năng lượng nóng chảy").
// Dây dẫn AWG20 (0.5 mm²): nhiệt độ ổn định ΔT ≈ 35·(I/11 A)² °C, τ ≈ 6 s. Vỏ PVC mềm 105 °C, chảy/khói > 160 °C, cháy > 250 °C.

import { cadAttach } from '../../core/cadParts.js';

const VBAT = 14.4, R_PACK = 0.1, R_WIRE = 0.02, R_SHORT = 0.02, TA = 40;
const TM = 420, RTH = 292, CTH = 0.0062;
const SLOWMO = 20;               // chiếu chậm khi chập mạch
const RATINGS = { 3: 0x7a3fb0, 5: 0xd9b38c, 7.5: 0x7a4a2a, 10: 0xd23b3b, 15: 0x2e6fd8, 20: 0xf2d313, 30: 0x7fd36a };
const WIRES = { awg20: { name: 'AWG20 (0.5 mm²)', i0: 11 }, awg24: { name: 'AWG24 (0.2 mm²)', i0: 5 }, awg16: { name: 'AWG16 (1.3 mm²)', i0: 22 } };

export default {
  id: 'cau-chi',
  name: 'Cầu chì (blade fuse 10 A)',
  category: 'dien-tu',
  order: 5,
  icon: '🧯',
  summary: 'Một sợi kim loại mảnh được tính toán để nóng chảy TRƯỚC KHI dây điện bắt lửa. Đặt ngay sau cực dương của pin 14.4 V: chập mạch → đứt trong vài chục ms, cứu pin Li-ion và cả căn nhà.',
  tags: ['fuse', 'cầu chì', 'ATO', 'blade fuse', 'ngắn mạch', 'I²t', 'chập', 'an toàn pin'],

  params: [
    { id: 'cad', label: '🧊 Mô hình CAD thật (đế cầu chì mini Keystone 3568 hàn PCB)', type: 'toggle', value: true, hint: 'Bật = đế cầu chì lưỡi MINI (ATM) thật trên bo nguồn của robot, cầu chì mini 10,9 mm. Tắt = mô hình học: cầu chì ATO 19 mm cỡ lớn + đế nối dây, dễ nhìn dây chảy.' },
    { id: 'rating', label: 'Định mức cầu chì In', type: 'select', value: '10', options: Object.keys(RATINGS).sort((a, b) => a - b).map((k) => [k, `${k} A`]) },
    { id: 'i', label: 'Dòng tải của robot', type: 'range', min: 0, max: 40, step: 0.5, value: 5, unit: 'A', hint: 'Bình thường ~3–6 A (2 bánh + quạt + chổi + mạch). Kẹt chổi + khởi động quạt: đỉnh 8–10 A.' },
    { id: 'wire', label: 'Cỡ dây nguồn', type: 'select', value: 'awg20', options: Object.entries(WIRES).map(([k, w]) => [k, w.name]) },
    { id: 'see', label: 'Nhìn xuyên vỏ nhựa', type: 'toggle', value: true },
    { id: 'short', label: '⚡ Chập mạch phía sau cầu chì', type: 'button' },
    { id: 'replace', label: '↺ Thay cầu chì mới / gỡ chỗ chập', type: 'button' },
  ],
  readouts: [
    { id: 'ratio', label: 'Tỉ số I / In', unit: '×' },
    { id: 'tel', label: 'Nhiệt độ dây chảy (kẽm chảy 420 °C)', unit: '°C' },
    { id: 'tblow', label: 'Dự đoán thời gian đứt', unit: '' },
    { id: 'i2t', label: 'I²t nóng chảy của cầu chì này', unit: 'A²s' },
    { id: 'vdrop', label: 'Sụt áp trên cầu chì', unit: 'mV' },
    { id: 'vout', label: 'Điện áp sau cầu chì', unit: 'V' },
    { id: 'twire', label: 'Nhiệt độ dây dẫn', unit: '°C' },
    { id: 'state', label: 'Trạng thái', unit: '' },
  ],
  scope: {
    window: 6,
    note: '(thời gian thực; lúc chập mạch tự chiếu chậm 20× để thấy được vài chục ms trước khi đứt)',
    channels: [
      { name: 'Dòng I', unit: 'A', min: 0, max: 110, color: '#ffd34d' },
      { name: 'Nhiệt dây chảy', unit: '°C', min: 0, max: 450, color: '#ff6b9a' },
      { name: 'V sau cầu chì', unit: 'V', min: 0, max: 16, color: '#3fcf8e' },
      { name: 'Nhiệt dây dẫn', unit: '°C', min: 0, max: 320, color: '#4cc2ff' },
    ],
  },

  info: {
    overview: `
      <p><b>Cầu chì</b> (fuse) là "điểm yếu có chủ đích" của mạch: một sợi kẽm có chỗ thắt hẹp. Dòng bình thường: nó chỉ ấm. Dòng quá lớn: nhiệt <code>I²R</code> làm chỗ thắt nóng chảy → hở mạch → dòng về 0.</p>
      <p>Pin Li-ion 4S có thể cấp <b>hàng trăm ampe</b> khi chập. Không có cầu chì, dây điện đỏ rực trong 1 giây, vỏ cháy, pin quá nhiệt → cháy nổ. Vì vậy docs/01 đặt <b>cầu chì 10 A ngay sau cực dương pin</b>, trước cả công tắc chính.</p>
      <p>Thử: kéo <b>Dòng tải</b> lên 15 A (1.5×) rồi 20 A (2×) và xem thời gian dự đoán. Sau đó bấm <b>Chập mạch</b>: dòng vọt ~95 A, dây chảy đứt sau ~30 ms (mô phỏng tự chiếu chậm).</p>`,
    specs: [
      ['Loại', 'ATO/ATC (blade fuse tiêu chuẩn ô tô), tác động nhanh, 32 V DC'],
      ['Kích thước', '19.1 × 18.5 × 5.1 mm, 2 lưỡi cắm dày 0.64 mm'],
      ['Mã màu', '3 A tím · 5 A nâu nhạt · 7.5 A nâu · 10 A ĐỎ · 15 A xanh dương · 20 A vàng · 30 A xanh lá'],
      ['Đặc tính (ATO)', '110 % In: không đứt ≥ 100 giờ · 135 %: 0.75–600 s · 200 %: 0.15–5 s · 350 %: 0.04–0.5 s'],
      ['Điện trở', '10 A ≈ 6–9 mΩ → sụt ~70 mV ở 10 A'],
      ['Khả năng cắt', '1000 A ở 32 V — dập được hồ quang khi chập pin 4S'],
      ['Dây chảy', 'Hợp kim kẽm, nóng chảy ~420 °C, có đoạn thắt hẹp ở giữa'],
    ],
    principle: `
      <h4>1. Nhiệt Joule và cân bằng nhiệt</h4>
      <p>Dây chảy nhận <code>P = I²·R</code> và tỏa nhiệt ra lưỡi cắm + không khí: <code>C·dT/dt = I²R − (T − Ta)/Rth</code>. Nếu nhiệt độ cân bằng <code>Ta + I²R·Rth</code> &lt; 420 °C → không bao giờ đứt. Vượt → đứt sau <code>t = τ·ln(ΔT_cb / (ΔT_cb − ΔT_chảy))</code>, τ = R_th·C ≈ 1.8 s.</p>
      <h4>2. Dòng càng lớn đứt càng nhanh (đường đặc tính thời gian–dòng)</h4>
      <p>Với dòng rất lớn, nhiệt không kịp thoát → chỉ phụ thuộc <b>I²t</b> (tích phân bình phương dòng theo thời gian). Cầu chì 10 A trong mô hình cần ~290 A²s: chập 95 A → <code>t ≈ 290 / 95² ≈ 32 ms</code>.</p>
      <h4>3. Cầu chì bảo vệ DÂY, không bảo vệ linh kiện</h4>
      <p>Chọn In nhỏ hơn dòng chịu được của <b>dây</b> phía sau nhưng lớn hơn dòng làm việc + xung khởi động. Dây AWG20 chịu ~11 A liên tục → cầu chì 10 A. Muốn dùng cầu chì 15 A phải lên dây AWG16.</p>
      <h4>4. Vì sao đặt ngay sau pin?</h4>
      <p>Cầu chì chỉ bảo vệ phần mạch <b>phía sau</b> nó. Đoạn dây từ pin tới cầu chì không được bảo vệ → phải ngắn nhất có thể (vài cm).</p>
      <div class="tip">Cầu chì đứt = triệu chứng. Luôn tìm nguyên nhân (chập, kẹt động cơ, dây bị kẹp) trước khi thay cái mới — và KHÔNG BAO GIỜ thay bằng cái lớn hơn hay bằng dây đồng.</div>`,
    inRobot: `
      <ul>
        <li>Sơ đồ docs/01: <b>Pin 4S 14.4 V → cầu chì 10 A → công tắc chính → VBAT</b> (DRV8871 ×2, quạt, MOSFET chổi, buck XL4015).</li>
        <li>Dòng tổng ước tính: bánh 2 × 0.3–2 A, quạt ~2.3 A, chổi cuộn 1.5 A (kẹt 7 A), chổi cạnh 0.3 A, logic + ESP32 ~0.3 A → bình thường 4–6 A, đỉnh ngắn 8–10 A → cầu chì 10 A tác động nhanh là hợp lý.</li>
        <li>Dùng đế cầu chì lưỡi có dây AWG18–20 hàn chắc, bọc co nhiệt.</li>
        <li>Nếu dùng pin 4S tự ráp: BMS 4S ≥ 20 A <b>và</b> vẫn cần cầu chì (BMS có thể hỏng chập).</li>
        <li>Firmware không "thấy" cầu chì, nhưng thấy hậu quả: VBAT mất → PIC đo <code>vbat_mv</code> ≈ 0 qua phân áp (nếu phân áp đặt sau cầu chì).</li>
      </ul>`,
    mistakes: `
      <ul>
        <li>Cầu chì "hay đứt" nên thay 20–30 A hoặc quấn dây đồng → lần chập tiếp theo là cháy dây/cháy pin.</li>
        <li>Đặt cầu chì sau công tắc hoặc xa pin → đoạn dây dài phía trước không được bảo vệ.</li>
        <li>Đế cầu chì lỏng/ôxy hóa → điện trở tiếp xúc lớn → nóng chảy đế nhựa, cầu chì đứt vô cớ.</li>
        <li>Dùng cầu chì AC thủy tinh 250 V cho mạch DC dòng lớn: khả năng cắt DC kém, hồ quang có thể không tắt.</li>
        <li>Chọn cầu chì quá nhỏ (3 A) → đứt khi quạt và động cơ khởi động cùng lúc.</li>
      </ul>`,
    quiz: [
      { q: 'Cầu chì 10 A, robot kéo 13.5 A liên tục. Cầu chì có đứt không? Sau bao lâu?', a: 'Có nhưng chậm: 1.35 × In nằm trong khoảng 0.75–600 s theo chuẩn ATO (mô hình ≈ 4 s). Ở 11 A (1.1×) thì gần như không bao giờ đứt.' },
      { q: 'Vì sao không được thay cầu chì 10 A bằng 30 A dù dây vẫn là AWG20?', a: 'Dây AWG20 chỉ chịu ~11 A. Ở 25 A cầu chì 30 A không đứt nhưng dây nóng ~180 °C → chảy vỏ, chập tiếp, cháy.' },
      { q: 'Màu cầu chì lưỡi 10 A là gì?', a: 'Đỏ.' },
    ],
  },

  faults: [
    { id: 'chap-mach', label: 'Chập mạch sau cầu chì (dây trần chạm khung GND)', severity: 'loi',
      what: '<p>Một chớp sáng nhỏ bên trong vỏ nhựa trong suốt, tiếng "tách", robot tắt ngắt. Nhìn kỹ thấy đoạn thắt của dây chảy biến mất, 2 giọt kim loại đông lại, vỏ hơi ám khói. Dây điện và pin vẫn nguyên vẹn — cầu chì đã làm đúng việc.</p>',
      why: '<p>Điện trở vòng chập chỉ ~0.15 Ω (pin 0.1 Ω + dây + chỗ chập) → <code>I ≈ 14.4 / 0.15 ≈ 95 A</code> = 9.5 × In. Dây chảy nhận <code>95² × 0.008 ≈ 72 W</code>, nóng tới 420 °C sau ≈ <code>I²t / I² ≈ 290 / 9 000 ≈ 30 ms</code>. Khi đứt, hồ quang 14 V tắt ngay trong khe hở.</p>',
      fix: '<p>Rút pin, tìm chỗ chập (dây bị kẹp vào vít, mạt kim loại trên mạch, linh kiện chết chập), sửa xong mới thay cầu chì CÙNG định mức.</p>' },
    { id: 'cau-chi-to', label: 'Thay bằng cầu chì 30 A vì "hay đứt" (dây vẫn AWG20)', severity: 'chay',
      what: '<p>Lần kẹt tiếp theo (25 A kéo dài): cầu chì 30 A vẫn ấm bình thường, nhưng dây nguồn AWG20 nóng dần, mùi nhựa PVC khét, vỏ dây mềm nhũn rồi bốc khói, có thể bắt lửa lan sang vỏ robot.</p>',
      why: '<p>25 A là 0.83 × 30 A → cầu chì không bao giờ đứt. Nhưng với dây 0.5 mm²: <code>ΔT ≈ 35 × (25/11)² ≈ 180 °C</code> → vỏ PVC (định mức 105 °C) chảy ở ~160 °C, cháy ở ~250 °C khi có thêm nhiệt từ xung quanh.</p>',
      fix: '<p>Định mức cầu chì ≤ dòng chịu được của dây nhỏ nhất phía sau. Cầu chì hay đứt → tìm nguyên nhân (động cơ kẹt, driver chập), hoặc tăng CẢ cỡ dây lẫn cầu chì có tính toán.</p>' },
    { id: 'noi-tat', label: 'Không cầu chì (nối tắt bằng dây đồng/giấy bạc) + chập', severity: 'no',
      what: '<p>Dây điện đỏ rực trong chưa đầy 1 giây, khói đen, lửa. Pin Li-ion nóng ran, phồng; nếu không có BMS có thể xì khí và bùng cháy (thermal runaway) — loại lửa rất khó dập.</p>',
      why: '<p>~100 A chạy liên tục: dây AWG20 nhận <code>100² × 0.033 Ω/m ≈ 330 W/m</code>. Pin cũng tự tỏa <code>100² × 0.1 Ω ≈ 1 kW</code> bên trong! Không có gì ngắt mạch ngoài việc dây tự cháy đứt.</p>',
      fix: '<p>Không bao giờ nối tắt cầu chì. Đã cháy: KHÔNG dùng nước với pin Li-ion đang cháy gần điện — ngắt nguồn nếu an toàn, dùng bình CO₂/bột, cát, đưa pin ra chỗ thoáng; rời khỏi khói độc.</p>' },
    { id: 'sai-vi-tri', label: 'Đặt cầu chì xa pin — chập ở đoạn dây TRƯỚC cầu chì', severity: 'chay',
      what: '<p>Chập xảy ra trên đoạn dây 25 cm từ pin tới cầu chì (đặt sau công tắc ở mặt trên robot). Cầu chì nguyên vẹn, nhưng đoạn dây đó nóng đỏ, khói, cháy.</p>',
      why: '<p>Cầu chì chỉ bảo vệ những gì nằm PHÍA SAU nó. Dòng chập chạy pin → đoạn dây → chỗ chập → về pin, hoàn toàn không đi qua cầu chì.</p>',
      fix: '<p>Cầu chì phải là thứ ĐẦU TIÊN sau cực + của pin (trong vòng vài cm), trước công tắc, trước mọi nhánh rẽ.</p>' },
    { id: 'tiep-xuc-kem', label: 'Đế cầu chì lỏng / lưỡi bị ôxy hóa', severity: 'chay',
      what: '<p>Robot chạy được nhưng đế cầu chì nóng, nhựa đế biến màu, chảy méo; cầu chì "tự đứt" khi dòng mới 7–8 A dù định mức 10 A. Mùi khét nhẹ.</p>',
      why: '<p>Điện trở tiếp xúc tăng từ ~1 mΩ lên ~50 mΩ: ở 8 A <code>P = 8² × 0.05 = 3.2 W</code> tập trung ở 2 lưỡi cắm (lớn gấp 6 lần nhiệt của chính dây chảy). Nhiệt truyền vào dây chảy → nó đứt sớm hơn thiết kế.</p>',
      fix: '<p>Dùng đế cầu chì tốt, lưỡi kẹp chặt; vệ sinh/thay khi thấy ôxy hóa; hàn dây chắc, không dùng đầu cosse bóp lỏng.</p>' },
    { id: 'nho-qua', label: 'Lắp cầu chì 3 A cho cả robot', severity: 'nhe',
      what: '<p>Bật robot: quạt và bánh vừa khởi động thì mất điện. Thay cái mới lại đứt. Không có gì hỏng, chỉ là chọn sai.</p>',
      why: '<p>Dòng khởi động ~9 A trong 0.3 s (= 3 × In) rồi chạy ổn định ~4 A (= 1.33 × In) → dây chảy vượt nhiệt độ chảy sau vài giây.</p>',
      fix: '<p>Định mức ≈ 1.5–2 × dòng làm việc bình thường và ≤ dòng chịu của dây: robot 5 A → 10 A. Hoặc dùng cầu chì tác động chậm cho tải có dòng khởi động lớn.</p>' },
  ],

  build(ctx) {
    const { THREE, MAT, geom, label, readout, fx } = ctx;
    const { mesh, group, part, cyl, box, wire } = geom;
    const root = new THREE.Group();

    // ---------- cầu chì ATO ----------
    const fuse = new THREE.Group();
    fuse.position.y = 9;            // cắm vào đế
    root.add(fuse);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd23b3b, roughness: 0.25, transparent: true, opacity: 0.5, depthWrite: false });
    const body = mesh(box(19.1, 9.4, 5.1, 0.6), bodyMat, { y: 13.3 });
    const grip = mesh(box(19.1, 1.6, 5.1, 0.4), bodyMat, { y: 18.5 - 0.8 + 0.0 });
    fuse.add(part(group(body, grip), 'Vỏ nhựa trong (màu = định mức)', 'Nhựa polysulfone trong suốt, chịu nhiệt: nhìn được dây chảy còn hay đứt. 10 A = màu ĐỎ. Số "10" in nổi trên đỉnh.'));
    const bladeMat = MAT.zinc.clone();
    const blades = group(mesh(box(6.0, 9.5, 0.64), bladeMat, { x: -6.55, y: 4.75 }), mesh(box(6.0, 9.5, 0.64), bladeMat, { x: 6.55, y: 4.75 }));
    fuse.add(part(blades, '2 lưỡi cắm (blade) dày 0.64 mm', 'Hợp kim kẽm mạ thiếc, liền khối với dây chảy. Cắm vào kẹp lò xo của đế.'));
    const tps = group(mesh(cyl(0.7, 0.7, 0.4, 12), MAT.tin, { x: -6.55, y: 18.55 }), mesh(cyl(0.7, 0.7, 0.4, 12), MAT.tin, { x: 6.55, y: 18.55 }));
    fuse.add(part(tps, '2 điểm đo trên đỉnh', 'Kim loại lộ ra để đo bằng đồng hồ mà không cần rút cầu chì: 2 điểm cùng điện áp = còn tốt; chênh nhau đúng điện áp nguồn = đã đứt.'));
    const elMat = MAT.zinc.clone();
    const padL = mesh(box(4, 4, 0.5), elMat, { x: -5.5, y: 11.2 });
    const padR = mesh(box(4, 4, 0.5), elMat, { x: 5.5, y: 11.2 });
    const neckGeo = (() => {
      const c = new THREE.CatmullRomCurve3([[-3.6, 12.8], [-2.2, 15.2], [-0.8, 12.6], [0.8, 15.4], [2.2, 12.6], [3.6, 12.8]].map(([x, y]) => new THREE.Vector3(x, y, 0)));
      return new THREE.TubeGeometry(c, 60, 0.32, 8, false);
    })();
    const neck = mesh(neckGeo, elMat);
    const element = group(padL, padR, neck);
    fuse.add(part(element, 'Dây chảy kẽm có đoạn thắt hình chữ S', 'Đoạn mảnh ở giữa nóng nhất (tiết diện nhỏ, xa lưỡi tản nhiệt) → luôn đứt ở đây. Hình chữ S giúp dài hơn, khe hở sau khi đứt đủ rộng để dập hồ quang.'));
    const drop1 = mesh(new THREE.SphereGeometry(0.55, 12, 8), elMat, { x: -2.3, y: 14.2 });
    const drop2 = mesh(new THREE.SphereGeometry(0.55, 12, 8), elMat, { x: 2.3, y: 14.2 });
    const stub1 = mesh(cyl(0.32, 0.32, 1.8, 8), elMat, { x: -3.2, y: 13.5, rz: 0.6 });
    const stub2 = mesh(cyl(0.32, 0.32, 1.8, 8), elMat, { x: 3.2, y: 13.5, rz: -0.6 });
    const blownParts = group(drop1, drop2, stub1, stub2);
    blownParts.visible = false;
    fuse.add(blownParts);

    // ---------- đế cầu chì ----------
    const holder = new THREE.Group();
    holder.add(mesh(box(26, 11, 9, 0.8), MAT.plasticBlack, { y: 5.5 }));
    holder.add(mesh(box(20, 0.6, 6, 0.2), MAT.plasticDark, { y: 11.1 }));
    const clips = group(mesh(box(7, 8, 2.2), MAT.brass, { x: -6.55, y: 7.5 }), mesh(box(7, 8, 2.2), MAT.brass, { x: 6.55, y: 7.5 }));
    holder.add(clips);
    root.add(part(holder, 'Đế cầu chì (inline holder) + kẹp đồng', 'Kẹp đồng thau đàn hồi ôm 2 lưỡi. Kẹp lỏng/ôxy hóa = điện trở tiếp xúc lớn = nóng.'));

    // ---------- dây ----------
    const wIn = wire([[-13, 5, 0], [-24, 5, 0], [-36, 3, 4], [-48, 2, 8]], { radius: 0.9, color: 0xd23b3b });
    const wOut = wire([[13, 5, 0], [24, 5, 0], [36, 3, -4], [48, 2, -8]], { radius: 0.9, color: 0xd23b3b });
    root.add(part(wIn, 'Dây từ cực + pin (càng ngắn càng tốt)', 'Đoạn này KHÔNG được cầu chì bảo vệ — giữ dưới vài cm.'));
    root.add(part(wOut, 'Dây ra công tắc chính → VBAT', 'Được bảo vệ: chập ở bất cứ đâu phía sau → cầu chì đứt.'));
    const shortMark = mesh(new THREE.SphereGeometry(1.4, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffaa00, emissiveIntensity: 1.5 }), { x: 40, y: 3, z: -5 });
    shortMark.visible = false;
    root.add(shortMark);
    const shortMark2 = shortMark.clone();
    shortMark2.position.set(-30, 4, 2);
    root.add(shortMark2);

    // ---------- MÔ HÌNH CAD THẬT: đế cầu chì mini (ATM) Keystone 3568 hàn trên bo nguồn ----------
    // CAD chỉ có đế (16 × 6,7 × 7,4 mm, chân hàn ở y < 0) → cầu chì vẫn là mô hình tự dựng (dây chảy đứt/nóng được),
    // thu về cỡ MINI 10,9 × 3,6 mm và cắm vào khe đế; thêm mẩu PCB + 2 đường đồng nối pad dây.
    const MINI = { sx: 10.9 / 19.1, sy: 0.85, sz: 3.6 / 5.1, y: 0.3 };
    const board = new THREE.Group();
    board.add(mesh(box(36, 1.6, 14, 0.5), MAT.pcbGreen, { y: -0.8 }));
    board.add(mesh(box(8, 0.08, 2.4), MAT.tin, { x: -9.5, y: 0.04 }), mesh(box(8, 0.08, 2.4), MAT.tin, { x: 9.5, y: 0.04 }));
    board.add(mesh(box(3.5, 0.1, 3.5), MAT.tin, { x: -14.5, y: 0.05 }), mesh(box(3.5, 0.1, 3.5), MAT.tin, { x: 14.5, y: 0.05 }));
    part(board, 'Bo nguồn (PCB) ngay sau cực + pin', 'Đế cầu chì mini hàn xuyên lỗ lên bo; đường đồng rộng (≥ 2,5 mm, đồng 1 oz) chịu được 10 A. Dây từ pin và dây ra công tắc hàn vào 2 pad lớn.');
    board.visible = false;
    root.add(board);
    let cadSock = null;
    const cad = cadAttach(ctx, root, 'vendor/fuseholder_blade_mini_keystone_3568', {
      onBottom: false, offset: [0, 0, 0],
      hide: [holder],
      partDefault: ['Đế cầu chì mini Keystone 3568 (CAD thật)', 'Đế hàn PCB cho cầu chì lưỡi MINI (ATM): 16 × 6,7 mm, 4 chân hàn bước 3,4 mm, kẹp đồng mạ thiếc chịu 20 A.'],
      parts: {
        socket_fuse_blade: ['Đế cầu chì mini (ATM) Keystone 3568', 'Thân nhựa nylon chịu nhiệt + 2 kẹp đồng đàn hồi ôm 2 lưỡi cầu chì. Kẹp lỏng / ôxy hoá → nóng đỏ, nhựa đế biến màu (xem sự cố "Đế cầu chì lỏng").'],
        'pin_*': ['Chân hàn của đế', 'Mỗi kẹp có 2 chân hàn xuyên lỗ: hàn đủ cả 4 chân để chia dòng và giữ chắc khi rút/cắm cầu chì.'],
      },
      onLoad(c) { cadSock = c.node('socket_fuse_blade') || c.obj; },
    });
    const fuseTop = new THREE.Object3D(); fuseTop.position.set(0, 14, 0); fuse.add(fuseTop);   // vị trí đoạn thắt (theo khung cầu chì)
    let lastMini = null;
    function setMini(on) {
      if (on === lastMini) return;
      lastMini = on;
      fuse.scale.set(on ? MINI.sx : 1, on ? MINI.sy : 1, on ? MINI.sz : 1);
      fuse.position.y = on ? MINI.y : 9;
      board.visible = on;
      wIn.position.y = wOut.position.y = on ? -4.4 : 0;     // dây hàn xuống pad PCB thay vì cắm vào đế nối dây
    }

    label(fuse, 'Cầu chì 10 A (đỏ)', [0, 22, 0]);
    label(fuse, 'Đoạn thắt — đứt ở đây', [0, 16.5, 3]);
    label(root, 'Từ pin +', [-46, 6, 8]);
    label(root, '→ công tắc chính', [46, 6, -8]);
    label(root, 'Đế cầu chì', [0, -1, 6]);

    // ---------- trạng thái ----------
    let overT = 0, wireCut = false, T = TA, Tw = TA, Th = TA, blown = false, shorted = false, shortT = 0, blowAt = null, fault = null, ft = 0;
    let smokedW = false, firedW = false, heatedW = false, heatedH = false, heatedF = false, slowmo = false;
    const wireForHeat = () => (fault === 'sai-vi-tri' ? wIn : wOut);
    function reset() {
      overT = 0; wireCut = false; T = TA; Tw = TA; Th = TA; blown = false; shorted = false; shortT = 0; blowAt = null; smokedW = false; firedW = false;
      neck.visible = true; blownParts.visible = false; shortMark.visible = false; shortMark2.visible = false;
    }

    return {
      object: root,
      onAction(id) {
        if (id === 'short') { if (!blown) { shorted = true; shortT = 0; blowAt = null; shortMark.visible = true; fx.sparks(shortMark, { count: 30, speed: 30, size: 0.6 }); } }
        if (id === 'replace') { fx.restore(root); reset(); heatedW = heatedH = heatedF = false; }
      },
      triggerFault(id) {
        reset(); fault = id; ft = 0;
        if (id === 'chap-mach' || id === 'cau-chi-to' || id === 'noi-tat') { shorted = id !== 'cau-chi-to'; shortMark.visible = shorted; if (shorted) fx.sparks(shortMark, { count: 30, speed: 30, size: 0.6 }); }
        if (id === 'sai-vi-tri') { shortMark2.visible = true; fx.sparks(shortMark2, { count: 30, speed: 30, size: 0.6 }); }
      },
      resetFault() { reset(); fault = null; heatedW = heatedH = heatedF = false; },
      update(dt, t, p) {
        setMini(cad.loaded && p.cad !== false);       // đổi cỡ cầu chì TRƯỚC khi sync() căn lại camera
        const cadOn = cad.sync(p);
        bodyMat.opacity = p.see ? 0.45 : 0.95;
        let In = Number(p.rating);
        if (fault === 'cau-chi-to') In = 30;
        if (fault === 'nho-qua') In = 3;
        bodyMat.color.setHex(RATINGS[In] ?? 0xd23b3b);
        const W = WIRES[p.wire];
        const Rf = 0.8 / (In * In);
        const noFuse = fault === 'noi-tat';
        const rContact = fault === 'tiep-xuc-kem' ? 0.05 : 0.001;
        ft += dt;
        // dòng điện
        let iLoad = p.i;
        if (fault === 'cau-chi-to') iLoad = 25;
        if (fault === 'tiep-xuc-kem') iLoad = Math.max(8, p.i);
        if (fault === 'nho-qua') iLoad = 4 + 5 * Math.exp(-ft / 0.3);
        const iShort = VBAT / (R_PACK + R_WIRE + (noFuse ? 0.002 : Rf) + R_SHORT);
        const upstreamShort = fault === 'sai-vi-tri';
        let I = blown && !noFuse ? 0 : shorted ? iShort : iLoad;
        if (wireCut) I = 0;
        if (upstreamShort) I = 0;                                 // dòng chập không đi qua cầu chì
        slowmo = shorted && !blown && !noFuse;
        const h = slowmo ? dt / SLOWMO : dt;
        // dây chảy (nhiều bước con cho chính xác ms)
        const nSub = 40;
        for (let k = 0; k < nSub && !blown; k++) {
          const extra = fault === 'tiep-xuc-kem' ? 0.35 * I * I * rContact : 0;
          T += ((I * I * Rf + extra - (T - TA) / RTH) / CTH) * (h / nSub);
          if (shorted) shortT += h / nSub;
          if (I > In * 1.05) overT += h / nSub;
          if (T >= TM && !noFuse) {
            blown = true; blowAt = shorted ? shortT : overT;
            neck.visible = false; blownParts.visible = true;
            fx.flash(fuseTop, { size: 16, color: 0xfff1c0, intensity: 4 });      // đúng đoạn thắt (cả cầu chì ATO lẫn mini)
            fx.sparks(fuseTop, { count: 14, speed: 12, size: 0.35 });
            fx.smoke(fuseTop, { size: 4, duration: 2, color: 0x777777 });
            fx.scorch(body, 0.25);
          }
        }
        if (noFuse) T = Math.min(T, 300);
        // dây dẫn
        const iWire = wireCut ? 0 : upstreamShort ? VBAT / (R_PACK + R_WIRE + R_SHORT) : blown && !noFuse ? 0 : I;
        const dTss = 35 * (iWire / W.i0) ** 2;
        Tw += ((TA + dTss - Tw) / 6) * h;
        if (Tw > 1085 && !wireCut) { wireCut = true; fx.sparks(wireForHeat(), { count: 40, speed: 35, size: 0.6 }); fx.flash(wireForHeat(), { size: 30, color: 0xffd090, intensity: 5 }); }
        if (Tw > 160 && !smokedW) { smokedW = true; fx.smoke(wireForHeat(), { size: 6, duration: 6, color: 0x2f2f2f }); }
        if (Tw > 250 && !firedW) { firedW = true; fx.fire(wireForHeat(), { size: 5, duration: 5 }); fx.scorch(wireForHeat(), 0.9); if (noFuse) fx.smoke([-48, 4, 8], { size: 14, duration: 8, color: 0x222222 }); }
        const wl = Math.max(0, (Tw - 90) / 260);
        if (wl > 0.02) { fx.heat(wireForHeat(), wl); heatedW = true; } else if (heatedW) { fx.heat(wireForHeat(), 0); heatedW = false; }
        // đế (tiếp xúc kém)
        Th += ((TA + I * I * rContact * 40 - Th) / 8) * h;
        const hl = Math.max(0, (Th - 90) / 150);
        const hotHolder = cadOn && cadSock ? cadSock : clips;    // CAD: cả đế nhựa + kẹp nóng đỏ
        if (hl > 0.02) { fx.heat(hotHolder, cadOn ? hl * 0.8 : hl); heatedH = true; } else if (heatedH) { fx.heat(clips, 0); if (cadSock) fx.heat(cadSock, 0); heatedH = false; }
        if (fault === 'tiep-xuc-kem' && Th > 150 && Math.random() < dt * 0.6) fx.smoke(cadOn ? [0, 8, 0] : holder, { size: 4, duration: 1.2 });
        // dây chảy phát sáng
        const el = blown ? 0 : Math.max(0, (T - 250) / 170);
        if (el > 0.02) { fx.heat(element, el); heatedF = true; } else if (heatedF) { fx.heat(element, 0); heatedF = false; }

        // dự đoán thời gian đứt
        const dSS = I * I * Rf * RTH;
        let tb;
        if (blown) tb = blowAt == null ? 'ĐÃ ĐỨT' : blowAt < 1 ? `ĐÃ ĐỨT sau ${(blowAt * 1000).toFixed(0)} ms` : `ĐÃ ĐỨT sau ${blowAt.toFixed(1)} s quá tải`;
        else if (noFuse) tb = 'không có cầu chì!';
        else if (TA + dSS <= TM) tb = 'không đứt';
        else {
          const s = RTH * CTH * Math.log((dSS - (T - TA)) / (dSS - (TM - TA)));
          tb = s < 1 ? `≈ ${(s * 1000).toFixed(0)} ms` : `≈ ${s.toFixed(1)} s`;
        }
        const vout = wireCut ? 0 : upstreamShort ? 0.5 : blown && !noFuse ? 0 : VBAT - I * (R_PACK + Rf + rContact);
        let state = blown ? '🔌 Cầu chì đã đứt — mạch an toàn. Tìm nguyên nhân rồi mới thay.' : I > In * 1.3 ? '⚠️ Quá tải — dây chảy đang nóng lên' : 'Bình thường';
        if (slowmo) state = `⚡ CHẬP ${I.toFixed(0)} A — 🎥 chiếu chậm 20×`;
        if (fault === 'cau-chi-to') state = Tw > 160 ? `🔥 Cầu chì 30 A không đứt — vỏ dây ${Tw.toFixed(0)} °C đang cháy!` : `⚠️ 25 A qua dây AWG20: ${Tw.toFixed(0)} °C và đang tăng`;
        if (fault === 'noi-tat' && wireCut) state = '💥 Dây đồng đã cháy chảy đứt (> 1085 °C) sau khi đốt cháy vỏ — pin bị xả ~100 A suốt thời gian đó';
        else if (fault === 'noi-tat') state = `💥 Không cầu chì: ${I.toFixed(0)} A liên tục — dây ${Tw.toFixed(0)} °C, pin tỏa ~${((I * I * R_PACK) / 1000).toFixed(1)} kW`;
        if (fault === 'sai-vi-tri' && wireCut) state = '🔥 Đoạn dây trước cầu chì đã cháy chảy đứt — cầu chì vẫn nguyên, vô dụng';
        else if (fault === 'sai-vi-tri') state = `🔥 Chập TRƯỚC cầu chì: cầu chì 0 A, đoạn dây đầu ${Tw.toFixed(0)} °C`;
        if (fault === 'tiep-xuc-kem' && !blown) state = `🔥 Tiếp xúc kém 50 mΩ: đế ${Th.toFixed(0)} °C`;
        if (fault === 'nho-qua' && !blown) state = `⚠️ Cầu chì 3 A, dòng ${I.toFixed(1)} A (khởi động) — sắp đứt`;

        readout('ratio', I / In);
        readout('tel', T);
        readout('tblow', tb);
        readout('i2t', (CTH * (TM - TA)) / Rf);
        readout('vdrop', I * Rf * 1000);
        readout('vout', vout);
        readout('twire', Tw);
        readout('state', state);
        return [upstreamShort ? iWire : I, T, vout, Tw];
      },
    };
  },
};
