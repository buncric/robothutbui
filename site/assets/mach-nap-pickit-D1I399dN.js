const n=`// 🔌 Mạch nạp PICkit 3 + ICSP — nạp file .hex (CCS C) vào PIC16F877A qua 5 dây MCLR/VDD/GND/PGD/PGC.
// Mô phỏng trình tự nạp điện áp cao (HVP) theo tài liệu lập trình PIC16F87XA: VPP 13 V lên MCLR → lệnh 6 bit
// (LSB trước) trên PGC/PGD → đọc Device ID → xóa → ghi từng word 14 bit → kiểm tra → ghi config → thả MCLR.
// Thời gian làm chậm rất nhiều (thật ~3–8 s cho cả 8K word, mỗi bit ~1 µs).

import { cadAttach, ownMaterial } from '../../core/cadParts.js';

const DT = 0.025;                     // độ phân giải mẫu dạng sóng hiển thị (s)
const VPP = 13.0;
// Vài word đầu của chương trình CCS (vector reset): MOVLW 0 · MOVWF PCLATH · GOTO 0x004 · NOP
const PROG = [[0x3000, 'MOVLW 0x00'], [0x008a, 'MOVWF PCLATH'], [0x2804, 'GOTO 0x004'], [0x0000, 'NOP']];
const CONFIG = 0x3f72;                // HS, NOWDT, PUT, BROWNOUT, NOLVP, không khóa code
const DEVID = 0x0e20;                 // PIC16F877A: Device ID 0x0E2x (4 bit thấp = revision)
const CMD = { LOAD_CONF: 0x00, LOAD_DATA: 0x02, READ_DATA: 0x04, INC_ADDR: 0x06, BEGIN_PROG: 0x08, BULK_ERASE: 0x09 };
const hex4 = (v) => '0x' + v.toString(16).toUpperCase().padStart(4, '0');

// Chân ICSP chuẩn PICkit (tam giác trắng = chân 1)
const ICSP = [
  [1, 'MCLR/VPP', 'icsp', 'Chân 1 PIC. PICkit nâng lên 13 V để vào chế độ nạp; bình thường trở 10 kΩ kéo lên 5 V.'],
  [2, 'VDD', 'power', 'PICkit đo điện áp mạch đích ở đây (hoặc cấp ≤ 30 mA nếu chọn "Power target from tool").'],
  [3, 'GND', 'ground', 'GND chung (VSS chân 12/31).'],
  [4, 'PGD (RB7)', 'icsp', 'Dữ liệu nạp 2 chiều — chân 40. Không nối LED/tải/tụ.'],
  [5, 'PGC (RB6)', 'icsp', 'Xung nhịp nạp do PICkit phát — chân 39. Không nối tải.'],
  [6, 'NC / PGM', 'spare', 'Không dùng (fuse NOLVP). Có thể là RB3/PGM cho nạp điện áp thấp.'],
];

export default {
  id: 'mach-nap-pickit',
  name: 'Mạch nạp PICkit 3 + ICSP',
  category: 'dieu-khien',
  order: 6,
  icon: '🔌',
  summary: 'Đưa file .hex từ máy tính vào bộ nhớ Flash của PIC qua 5 dây ICSP. Xem PICkit nâng MCLR lên 13 V, gửi lệnh 6 bit và dữ liệu 14 bit trên PGC/PGD, kiểm tra Device ID — và vì sao cắm ngược đầu nạp hay nối LED vào RB7 làm nạp thất bại.',
  tags: ['PICkit', 'PICkit 3', 'ICSP', 'nạp', 'program', 'MPLAB IPE', 'VPP', 'PGC', 'PGD', 'MCLR', 'hex', 'CCS'],

  params: [
    { id: 'cad', label: '🧊 Mô hình CAD thật (PICkit 3 + PIC16F877A)', type: 'toggle', value: true, hint: 'Tắt = mô hình học tự dựng. Đèn, nút, tín hiệu nạp vẫn chạy trên cả hai.' },
    { id: 'program', label: '▶ Program (nạp file .hex)', type: 'button' },
    { id: 'auto', label: 'Tự nạp lại liên tục (để quan sát)', type: 'toggle', value: true },
    { id: 'power', label: 'Nguồn cho mạch PIC', type: 'select', value: 'board', options: [['board', 'Mạch tự có 5 V (buck XL4015) — khuyên dùng'], ['tool', 'PICkit cấp 5 V (≤ 30 mA, chỉ bo PIC trần)']] },
    { id: 'speed', label: 'Tốc độ hiển thị', type: 'select', value: '1', options: [['0.5', 'Chậm'], ['1', 'Vừa'], ['2', 'Nhanh']] },
  ],
  readouts: [
    { id: 'phase', label: 'Bước', unit: '' },
    { id: 'log', label: 'MPLAB IPE (Output)', unit: '' },
    { id: 'addr', label: 'Địa chỉ / word', unit: '' },
    { id: 'pins', label: 'VPP / VDD', unit: 'V' },
    { id: 'leds', label: 'Đèn PICkit (Power · Active · Status)', unit: '' },
  ],
  scope: {
    window: 4,
    note: '(đã làm chậm ~50 000×: mỗi xung PGC thật ~1 µs; chờ xóa/ghi thật ~4–8 ms)',
    channels: [
      { name: 'MCLR / VPP', unit: 'V', min: -0.5, max: 14, color: '#a86bf0' },
      { name: 'PGC (RB6)', unit: 'V', min: -0.5, max: 5.5, color: '#ffd34d' },
      { name: 'PGD (RB7)', unit: 'V', min: -0.5, max: 5.5, color: '#4cc2ff' },
      { name: 'VDD', unit: 'V', min: -0.5, max: 5.5, color: '#ff6b9a' },
    ],
  },

  info: {
    overview: \`
      <p><b>PICkit 3</b> (Microchip) là mạch nạp/gỡ lỗi nối máy tính qua USB. Nó ghi chương trình (file <code>.hex</code> do <b>CCS C</b> biên dịch) vào bộ nhớ Flash của PIC ngay trên bo mạch — gọi là <b>ICSP</b> (In-Circuit Serial Programming), không cần gỡ chip ra.</p>
      <p>Phần mềm: <b>MPLAB X IPE 6.20</b> — bản cuối còn hỗ trợ PICkit 3 (các bản mới hơn bỏ PICkit 3; PICkit 4/5 thì dùng bản mới).</p>
      <p>Thử: để mặc định và quan sát máy hiện sóng: MCLR nhảy lên 13 V, rồi từng cụm 6 xung (lệnh) và 16 xung (dữ liệu) trên PGC/PGD. Rồi bấm các <b>⚠️ Sự cố</b> để xem thông báo lỗi giống hệt khi nạp thật.</p>\`,
    specs: [
      ['Kết nối', 'USB mini-B tới máy tính; đầu cái 6 chân bước 2.54 mm tới mạch đích'],
      ['Thứ tự chân ICSP', '1 MCLR/VPP · 2 VDD · 3 GND · 4 PGD · 5 PGC · 6 NC (tam giác trắng = chân 1)'],
      ['VPP', 'Tạo bằng mạch tăng áp trong PICkit; PIC16F87XA cần 12.75–13.25 V trên MCLR để vào chế độ nạp'],
      ['Cấp nguồn mạch đích', 'Tùy chọn, tối đa ~30 mA ở 5 V — chỉ đủ cho PIC trần + LED'],
      ['Đèn', 'Power (xanh lá) · Active (xanh dương) · Status (xanh = xong, vàng = đang bận, đỏ = lỗi)'],
      ['Phần mềm', 'MPLAB X IPE 6.20 (Windows/macOS/Linux): chọn Device PIC16F877A, Tool PICkit 3, Browse .hex, Program'],
      ['Bộ nhớ PIC16F877A', 'Flash 8K word × 14 bit (0x0000–0x1FFF) · config word ở 0x2007 · Device ID ở 0x2006'],
    ],
    principle: \`
      <h4>1. Vào chế độ nạp (HVP — High Voltage Programming)</h4>
      <p>Giữ PGC, PGD ở 0 rồi nâng MCLR từ 0 lên <b>VPP ≈ 13 V</b>. PIC hiểu đây không phải reset bình thường (VDD chỉ 5 V) → chuyển RB6/RB7 thành cổng nạp, CPU dừng.</p>
      <h4>2. Lệnh 6 bit + dữ liệu 16 xung</h4>
      <p>PICkit phát xung PGC; mỗi bit đặt trên PGD khi PGC lên và được PIC chốt khi PGC xuống, <b>LSB trước</b>. Một số lệnh của họ PIC16F87X(A):</p>
      <ul>
        <li><code>000000</code> Load Configuration (nhảy tới vùng 0x2000), <code>000010</code> Load Data for Program Memory, <code>000100</code> Read Data, <code>000110</code> Increment Address, <code>001000</code> Begin Erase/Program Cycle, <code>001001</code> Bulk Erase.</li>
        <li>Dữ liệu: 16 xung = bit start 0 + <b>14 bit</b> word (LSB trước) + bit stop 0.</li>
      </ul>
      <h4>3. Trình tự IPE làm khi bấm "Program"</h4>
      <ol>
        <li>Đo VDD mạch đích → nâng VPP.</li>
        <li>Đọc <b>Device ID</b> ở 0x2006 → so với thiết bị đã chọn (PIC16F877A = 0x0E2x).</li>
        <li>Xóa toàn bộ (Bulk Erase).</li>
        <li>Lặp: Load Data (word) → Begin Program (chờ ~4 ms) → Increment Address.</li>
        <li>Đọc lại từng word để <b>Verify</b>.</li>
        <li>Ghi config word 0x2007 (từ <code>#fuses</code>: HS, NOWDT, PUT, BROWNOUT, NOLVP → <code>0x3F72</code>).</li>
        <li>Hạ VPP, thả MCLR → PIC reset và chạy chương trình mới ngay.</li>
      </ol>
      <h4>4. File .hex</h4>
      <p>Định dạng Intel HEX: mỗi dòng <code>:LLAAAATT[dữ liệu]CC</code> (độ dài, địa chỉ byte, loại, dữ liệu, checksum). Mỗi word 14 bit chiếm 2 byte little-endian, địa chỉ byte = 2 × địa chỉ word.</p>\`,
    inRobot: \`
      <ul>
        <li>Header ICSP 6 chân trên bo PIC của robot theo docs/01: 1-MCLR, 2-VDD, 3-GND, 4-PGD (RB7), 5-PGC (RB6), 6-NC.</li>
        <li>MCLR: trở 10 kΩ lên 5 V (có thể thêm diode 1N4148 hoặc trở 470 Ω nối tiếp để VPP 13 V không lọt vào đường 5 V). Không gắn tụ lớn lên MCLR.</li>
        <li>RB6/RB7 <b>để dành cho nạp</b> — firmware không dùng (<code>config.h</code>: "RB6/RB7 dành cho mạch nạp ICSP — KHÔNG dùng"). Fuse <code>NOLVP</code> → RB3 là I/O thường.</li>
        <li>Nạp khi robot <b>kê bánh lên</b>: ngay khi nạp xong PIC chạy chương trình mới, bánh có thể quay. Nên tắt công tắc nguồn động cơ hoặc để ESP32 tắt (PIC dừng sau 300 ms không có heartbeat).</li>
        <li>Quy trình: CCS C biên dịch <code>firmware/pic16f877a_ccs/main.c</code> → <code>main.hex</code> → MPLAB X IPE 6.20 → PICkit 3 → Program.</li>
      </ul>\`,
    mistakes: \`
      <ul>
        <li>Cắm ngược đầu 6 chân (tam giác trắng không trùng chân 1) → "Invalid Device ID", có thể đưa 13 V vào sai chân.</li>
        <li>Nối LED, trở kéo, tụ vào RB6/RB7 → nạp được nhưng "Verify failed".</li>
        <li>Quên cấp nguồn mạch đích và không bật "Power target from tool" → "Target VDD not detected".</li>
        <li>Bật cấp nguồn từ PICkit cho cả robot (ESP32, cảm biến) → quá tải 30 mA, PICkit báo lỗi điện áp VDD.</li>
        <li>Thiếu trở 10 kΩ ở MCLR → nạp được nhưng tháo PICkit ra là PIC không chạy (MCLR thả nổi = reset).</li>
        <li>Dây ICSP dài &gt; 15 cm, không xoắn với GND → lỗi ngẫu nhiên khi nạp.</li>
      </ul>\`,
    quiz: [
      { q: 'Vì sao MCLR phải lên 13 V chứ không phải 5 V khi nạp?', a: '5 V trên MCLR chỉ là thả reset → PIC chạy chương trình. Điện áp cao ≈ 13 V (> VDD + 3.5 V) là "tín hiệu đặc biệt" mà PIC chỉ hiểu là lệnh vào chế độ nạp, nên không thể xảy ra vô tình.' },
      { q: 'Lệnh Increment Address là 000110. Trên dây PGD, 6 bit được gửi theo thứ tự nào?', a: 'LSB trước: 0, 1, 1, 0, 0, 0.' },
      { q: 'Word 0x2804 (GOTO 0x004) gửi bằng 16 xung như thế nào?', a: 'Bit start 0, rồi 14 bit của 0x2804 từ LSB tới MSB (0,0,1,0,0,0,0,0,0,0,0,1,0,1), cuối cùng bit stop 0.' },
    ],
  },

  steps: [
    { title: 'Bước 1 — Chuẩn bị phần mềm', text: 'Cài MPLAB X IDE/IPE <b>v6.20</b> (bản cuối hỗ trợ PICkit 3). Mở IPE → Device: <b>PIC16F877A</b> → Tool: PICkit 3. Biên dịch firmware bằng CCS C để có <code>main.hex</code>.' },
    { title: 'Bước 2 — Mạch đích tối thiểu', text: 'PIC trên đế, VDD/VSS + tụ 100 nF, thạch anh 20 MHz + 2 × 22 pF, <b>trở 10 kΩ từ MCLR lên 5 V</b> (sáng), header 6 chân. RB6/RB7 không nối gì khác.' },
    { title: 'Bước 3 — Cắm PICkit đúng chiều', text: 'Tam giác trắng trên PICkit = chân 1 = MCLR. Cắm thẳng, không xiên. Nếu dùng dây nối: giữ &lt; 15 cm, đúng thứ tự 1–6.' },
    { title: 'Bước 4 — Nguồn', text: 'Cách tốt: bật nguồn 5 V của mạch (buck) và để IPE <b>không</b> cấp nguồn. Chỉ khi bo PIC trần (không ESP32, không cảm biến) mới cho PICkit cấp 5 V (Power → "Power target circuit from tool").' },
    { title: 'Bước 5 — Connect → Program → Verify', text: 'Bấm Connect: IPE đọc Device ID và báo "Target device PIC16F877A found". Browse chọn .hex → Program. Chờ "Programming/Verify complete". PIC chạy chương trình ngay — kê bánh robot lên trước!' },
  ],

  faults: [
    { id: 'nguoc-dau', label: 'Cắm ngược đầu ICSP (xoay 180°)', severity: 'hong',
      what: '<p>IPE báo <i>"Target Device ID (0x0) is an Invalid Device ID. Please check your connections to the Target Device."</i>; đèn Status đỏ. Sau vài lần thử, chân RB3 hoặc cả PIC có thể chết.</p>',
      why: '<p>Đảo 6 chân: VPP 13 V (chân 1 của PICkit) rơi vào chân 6 của header = <b>RB3/PGM</b> — tuyệt đối tối đa VDD + 0.3 V. Diode bảo vệ dẫn, dòng do mạch VPP cấp (vài chục mA) chạy vào đường VDD. Đồng thời PGC của PICkit đối đầu với VDD, PGD với GND → không đọc được gì (ID = 0).</p>',
      fix: '<p>Đánh dấu chân 1 trên bo (tam giác/chấm sơn), dùng header có khóa hoặc cắt 1 chân làm "chốt chiều". Kiểm tra trước khi bấm Connect.</p>' },
    { id: 'tai-pgd', label: 'LED + trở 330 Ω nối vào RB7 (PGD)', severity: 'loi',
      what: '<p>Đọc ID được, xóa được, nhưng cuối cùng: <i>"Programming failed" / "Verify failed at program memory address 0x0000"</i>.</p>',
      why: '<p>PGD là đường 2 chiều trở kháng cao. LED + 330 Ω kéo dòng ~10 mA và làm méo sườn: khi PIC trả dữ liệu đọc (verify), driver yếu của PIC không kéo nổi đường lên mức 1 kịp → bit 1 đọc thành 0.</p>',
      fix: '<p>RB6/RB7 dành riêng cho ICSP (như docs/01). Bắt buộc dùng thì cách ly bằng trở ≥ 4.7 kΩ hoặc jumper tháo ra khi nạp.</p>' },
    { id: 'thieu-nguon', label: 'Mạch chưa cấp nguồn & PICkit không cấp', severity: 'loi',
      what: '<p>IPE báo <i>"Target VDD not detected"</i> hoặc <i>"Target device was not found (could not detect target voltage VDD)"</i>.</p>',
      why: '<p>PICkit đo chân VDD của header trước khi làm gì; 0 V nghĩa là mạch chưa có điện → nó không dám nâng VPP (13 V vào chip không nguồn có thể làm hỏng chip).</p>',
      fix: '<p>Bật công tắc nguồn 5 V của mạch, hoặc (bo PIC trần) bật Power target from tool, 5.0 V.</p>' },
    { id: 'qua-tai', label: 'Cho PICkit cấp nguồn cả bo robot (ESP32, cảm biến)', severity: 'nhe',
      what: '<p>VDD tụt còn ~3 V, IPE báo lỗi mức điện áp VDD / PICkit ngừng cấp nguồn; đôi khi máy tính ngắt cổng USB.</p>',
      why: '<p>PICkit 3 chỉ cấp được ~30 mA. ESP32-S3 (40–130 mA) + cảm biến + LED cần vài trăm mA → nguồn trong PICkit bị kéo sụt, mạch bảo vệ quá dòng tác động.</p>',
      fix: '<p>Dùng nguồn 5 V của robot (buck XL4015) khi nạp; PICkit chỉ "đo" VDD. Chung GND qua chân 3.</p>' },
    { id: 'banh-quay', label: 'Nạp khi robot đặt trên bàn, nguồn động cơ đang bật', severity: 'loi',
      what: '<p>"Programming/Verify complete" — và ngay lập tức hai bánh quay, robot lao khỏi bàn kéo theo PICkit.</p>',
      why: '<p>Nạp xong, IPE hạ VPP và thả MCLR → PIC reset và chạy chương trình mới ngay (chế độ tự chạy hoặc lệnh test động cơ). Trong lúc nạp, các chân PWM/DIR ở trạng thái trở kháng cao, driver có thể nhận mức ngẫu nhiên.</p>',
      fix: '<p>Kê robot lên (bánh không chạm đất), tắt công tắc nguồn động cơ khi nạp, hoặc bật "Hold in Reset" trong IPE cho tới khi sẵn sàng. Firmware nên chờ lệnh/nút START trước khi quay bánh.</p>' },
  ],

  build(ctx) {
    const { THREE, MAT, PIN_COLORS, geom, label, readout, fx } = ctx;
    const { mesh, group, part, cyl, box, pcb, wire, dipPackage } = geom;
    const root = new THREE.Group();

    // ---------- bo mạch PIC đích (nâng trên 4 cột đồng 8 mm) ----------
    const tgt = new THREE.Group();
    root.add(tgt);
    tgt.add(pcb(76, 52, { mat: MAT.pcbGreen }));
    tgt.children[0].position.x = 45;
    for (const [x, z] of [[11, -22], [79, -22], [11, 22], [79, 22]]) tgt.add(mesh(cyl(2.3, 2.3, 8.4, 6), MAT.brass, { x, y: -5.8, z }));
    const dip = dipPackage(40);
    dip.group.position.x = 50;
    // khấc chip quay về +X: chân 1 ở phía −Z, cùng phía chân 1 của header ICSP (PICkit 3 thật: nhìn mặt có logo,
    // đầu cắm hướng lên trên → tam giác chân 1 ở bên TRÁI ⇒ khi đầu cắm hướng +X, chân 1 nằm ở −Z)
    dip.group.rotation.y = Math.PI;
    tgt.add(dip.group);
    part(dip.body, 'PIC16F877A (mạch đích)', 'Trong lúc nạp: CPU dừng, RB6/RB7 thành cổng nạp. Sau khi thả MCLR: chạy chương trình mới.');
    const icspPins = { 1: 0, 11: 10, 12: 11, 30: 29, 39: 38, 40: 39, 36: 35 };
    for (const [n, i] of Object.entries(icspPins)) {
      const grp = n === '11' ? 'power' : n === '12' ? 'ground' : n === '30' ? 'output' : n === '36' ? 'spare' : 'icsp';
      dip.pins[i].traverse((o) => { if (o.isMesh) { o.material = MAT.tin.clone(); o.material.color.set(PIN_COLORS[grp]); } });
      const nm = { 1: 'MCLR/VPP', 11: 'VDD', 12: 'VSS', 30: 'RD7 (LED)', 39: 'RB6/PGC', 40: 'RB7/PGD', 36: 'RB3/PGM' }[n];
      part(dip.pins[i], \`PIC chân \${n} — \${nm}\`, n === '1' ? 'Nhận VPP 13 V khi nạp; trở 10 kΩ kéo lên 5 V khi chạy.' : n === '36' ? 'Để trống (NOLVP). Nếu cắm ngược đầu nạp, 13 V rơi vào đây!' : n === '30' ? 'LED trạng thái — nháy khi chương trình mới chạy.' : 'Nối header ICSP.');
    }
    label(tgt, 'PIC16F877A', [50, 8, 0]);
    // header ICSP góc vuông 6 chân ở mép trái bo
    const hdr = new THREE.Group();
    hdr.position.set(12, 0, 0);
    hdr.add(mesh(box(2.5, 2.5, 15.2), MAT.plasticBlack, { x: 1.5, y: 1.25 }));
    const hdrPins = [];
    ICSP.forEach(([n, nm, grp, desc], k) => {
      const z = -6.35 + k * 2.54;
      const m = MAT.gold.clone(); m.color.set(PIN_COLORS[grp]);
      const pinG = group(mesh(box(8, 0.64, 0.64), m, { x: -2.5, y: 2.5, z }), mesh(box(0.64, 3, 0.64), m, { x: 1.5, y: 1, z }));
      hdr.add(part(pinG, \`Header ICSP chân \${n} — \${nm}\`, desc));
      hdrPins.push(pinG);
    });
    hdr.add(mesh(new THREE.ConeGeometry(1.2, 2, 3), MAT.silkscreen, { x: 4.5, y: 0.05, z: -6.35, rx: -Math.PI / 2 }));
    tgt.add(part(hdr, 'Header ICSP 6 chân (góc vuông)', 'Thứ tự chuẩn PICkit: 1 MCLR · 2 VDD · 3 GND · 4 PGD · 5 PGC · 6 NC. Tam giác in trên bo = chân 1.'));
    label(tgt, 'ICSP ▲1', [12, 7, -9]);
    // đường nối header → chân PIC
    // vị trí chân (chip xoay 180°: x, z đổi dấu)
    const pinTop = (i) => { const p = dip.pins[i].position; return [50 - p.x, 1.2, -p.z > 0 ? -p.z + 1.5 : -p.z - 1.5]; };
    const cu = 0xc87533;
    const traces = group(
      wire([[13, 0.3, -6.35], [17, 0.3, -21], [72, 0.3, -21], pinTop(0)], { radius: 0.35, color: cu }),
      wire([[13, 0.3, -3.81], [16, 0.3, -17], [47, 0.3, -17], pinTop(10)], { radius: 0.35, color: cu }),
      wire([[13, 0.3, -1.27], [15, 0.3, -12], [44.5, 0.3, -12], pinTop(11)], { radius: 0.35, color: cu }),
      wire([[13, 0.3, 1.27], [16, 0.3, 21], [72, 0.3, 21], pinTop(39)], { radius: 0.35, color: cu }),
      wire([[13, 0.3, 3.81], [15, 0.3, 17], [69.5, 0.3, 17], pinTop(38)], { radius: 0.35, color: cu }));
    tgt.add(part(traces, 'Đường mạch ICSP', 'MCLR → chân 1, VDD → 11, GND → 12, PGD → 40, PGC → 39. Ngắn, không rẽ nhánh tới tải khác.'));
    const resMat = MAT.plasticYellow.clone(); resMat.color.set(0xd9c39a);
    const r10k = group(mesh(cyl(1.2, 1.2, 6, 16), resMat, { rz: Math.PI / 2 }), mesh(cyl(1.25, 1.25, 0.6, 16), MAT.icBody, { x: -1.6, rz: Math.PI / 2 }), mesh(cyl(1.25, 1.25, 0.6, 16), MAT.icBody, { x: -0.6, rz: Math.PI / 2 }), mesh(cyl(1.25, 1.25, 0.6, 16), tintMat(MAT.plasticYellow, 0xff8c1a), { x: 0.4, rz: Math.PI / 2 }));
    r10k.position.set(26, 2, -24);
    tgt.add(part(r10k, 'Trở 10 kΩ MCLR → 5 V (nâu-đen-cam)', 'Giữ MCLR ở mức 1 để PIC chạy. Khi nạp, PICkit nâng MCLR lên 13 V — dòng chảy ngược qua trở này về 5 V chỉ ~0.8 mA.'));
    const ledMat = new THREE.MeshStandardMaterial({ color: 0x113311, emissive: 0x30ff60, emissiveIntensity: 0 });
    const tLed = mesh(cyl(1.5, 1.5, 3, 16), ledMat, { x: 52, y: 1.5, z: -18 });
    tgt.add(part(tLed, 'LED trạng thái (RD7)', 'Nháy khi chương trình mới đã chạy.'));
    // bánh xe (chỉ hiện khi diễn sự cố)
    const wheel = group(mesh(cyl(9, 9, 6, 32), MAT.rubber, { rx: Math.PI / 2 }), mesh(cyl(4, 4, 6.2, 16), MAT.plasticWhite, { rx: Math.PI / 2 }));
    wheel.position.set(84, 0, -30);
    part(wheel, 'Bánh xe robot', 'Robot đang nằm trên bàn, nguồn động cơ còn bật.');

    // ---------- PICkit 3 ----------
    const pk = new THREE.Group();
    root.add(pk);
    const shellMat = new THREE.MeshPhysicalMaterial({ color: 0x2b2e34, roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.92 });
    pk.add(part(mesh(box(102, 21, 40, 8), shellMat, { x: -48, y: 0.5 }), 'Vỏ PICkit 3', 'Bên trong: vi điều khiển PIC24 xử lý USB + trình tự nạp, mạch tăng áp tạo VPP, bộ đệm mức logic, nguồn ≤ 30 mA cho mạch đích.'));
    const fem = group(mesh(box(3, 3.2, 15.4), MAT.plasticBlack, { x: 1.5, y: 2.5 }));
    for (let k = 0; k < 6; k++) fem.add(mesh(box(3.05, 1, 1), MAT.icBody, { x: 1.5, y: 2.5, z: -6.35 + k * 2.54 }));
    pk.add(part(fem, 'Đầu cái 6 chân của PICkit', 'Cắm thẳng vào header ICSP. Tam giác trắng trên vỏ đánh dấu chân 1 (MCLR/VPP).'));
    pk.add(mesh(new THREE.ConeGeometry(2.2, 4, 3), MAT.silkscreen, { x: -6, y: 11.1, z: -6.35, rx: -Math.PI / 2 }));
    const mkLed = (x, c, nm, d) => { const m = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: c, emissiveIntensity: 0 }); pk.add(part(mesh(cyl(1.6, 1.6, 1.2, 16), m, { x, y: 11.2, z: -10 }), nm, d)); return m; };
    const ledPow = mkLed(-26, 0x30ff60, 'Đèn Power (xanh lá)', 'Sáng khi PICkit có nguồn USB.');
    const ledAct = mkLed(-20, 0x3b8ef0, 'Đèn Active (xanh dương)', 'Sáng khi IPE đang kết nối/điều khiển PICkit.');
    const ledSt = mkLed(-14, 0xffd34d, 'Đèn Status', 'Vàng = đang nạp · xanh = thành công · đỏ = lỗi.');
    pk.add(part(mesh(cyl(3, 3, 1.5, 24), MAT.plasticWhite, { x: -40, y: 11.2 }), 'Nút Programmer-to-Go', 'Nạp lại file đã lưu sẵn trong PICkit mà không cần máy tính.'));
    pk.add(part(mesh(box(6, 4, 8), MAT.steel, { x: -99, y: 0.5 }), 'Cổng USB mini-B', 'Nối máy tính chạy MPLAB X IPE 6.20.'));
    const usbCable = wire([[-102, 0.5, 0], [-125, 0, 0], [-140, -6, 12]], { radius: 1.6, color: 0x222222 });
    pk.add(usbCable);
    const pkProc = pk.children.filter((o) => o !== usbCable && !o.userData.isLabel);
    label(pk, 'PICkit 3', [-48, 16, 0]);
    pk.traverse((o) => { if (o.isMesh) o.castShadow = true; });

    // ---------- mô hình CAD thật ----------
    // PICkit 3 (build123d theo DS51795): khung GLB đầu cắm 6 chân ở −X, USB ở +X, chân 1 ở z = +6,4.
    // Xoay 180° quanh Y → đầu cắm hướng +X vào header mạch đích, chân 1 về z = −6,4 (trùng tam giác ▲1 trên bo đích);
    // dời để miệng đầu cắm ở x ≈ +3 và hàng chân cao y = 2,5 như mô hình học.
    let cadLed = {}, cadBtn = null, cadCase = null, btnT = 0;
    const cadPk = cadAttach(ctx, pk, 'boards/pickit3', {
      onBottom: false, rotateY: Math.PI, offset: [-43.75, -4.4, 0],
      hide: pkProc,
      partDefault: ['PICkit 3 (CAD thật)', 'Mạch nạp/gỡ lỗi của Microchip, ~95 × 42 × 15 mm. Bên trong: PIC24 xử lý USB + trình tự nạp, mạch tăng áp tạo VPP 13 V, đệm mức logic.'],
      parts: {
        case_top: ['Vỏ trên PICkit 3', 'Nhựa có in logo và tam giác ▼ chỉ chân 1. Bên trong là mạch PIC24 + bơm điện áp VPP.'],
        case_bottom: ['Vỏ dưới PICkit 3', 'Nửa vỏ dưới, có lỗ móc dây đeo.'],
        print_top: ['Chữ in & tam giác chân 1', 'Logo "PICkit 3" và mũi tên ▼ đánh dấu chân 1 (MCLR/VPP) của đầu cắm.'],
        btn_ptg: ['Nút Programmer-to-Go', 'Nạp lại file đã lưu sẵn trong PICkit mà không cần máy tính.'],
        led_pwr: ['Đèn Power (xanh lá)', 'Sáng khi PICkit có nguồn USB.'],
        led_active: ['Đèn Active (xanh dương)', 'Sáng khi IPE đang kết nối/điều khiển PICkit.'],
        led_status: ['Đèn Status', 'Vàng = đang nạp · xanh = thành công · đỏ = lỗi.'],
        J_usb: ['Cổng USB mini-B', 'Nối máy tính chạy MPLAB X IPE 6.20.'],
        hdr_J1_body: ['Đầu cái 6 chân của PICkit', 'Cắm thẳng vào header ICSP. Tam giác trắng trên vỏ đánh dấu chân 1 (MCLR/VPP).'],
        ...Object.fromEntries(ICSP.map(([n, nm, , d]) => [\`pin_J1_\${n}\`, [\`PICkit chân \${n} — \${nm}\`, d]])),
      },
      onLoad(c) {
        const ms = (n) => { const a = []; c.node(n)?.traverse((o) => { if (o.isMesh) { ownMaterial(o); a.push(o); } }); return a; };
        cadLed = { pwr: ms('led_pwr'), act: ms('led_active'), st: ms('led_status') };
        for (const l of Object.values(cadLed)) for (const o of l) o.userData._ledBase = o.material.color.getHex();
        cadBtn = c.slide('btn_ptg', [0, -1, 0]);
        cadCase = c.node('case_top');
        ICSP.forEach(([n, , grp]) => c.color(\`pin_J1_\${n}\`, PIN_COLORS[grp]));
      },
    });
    // PIC đích: CAD boards/pic16f877a-dip40 nằm trong dip.group (khung trùng mô hình học, xem trang PIC16F877A)
    const dipHide = [dip.body, ...dip.group.children.filter((o) => o.isMesh && o !== dip.body)];
    dip.pins.forEach((pg) => pg.children.forEach((o) => { if (o.isMesh) dipHide.push(o); }));
    const cadPic = cadAttach(ctx, dip.group, 'boards/pic16f877a-dip40', {
      onBottom: false, frame: false,
      hide: dipHide,
      partDefault: ['PIC16F877A (mạch đích, CAD thật)', 'Trong lúc nạp: CPU dừng, RB6/RB7 thành cổng nạp. Sau khi thả MCLR: chạy chương trình mới.'],
      parts: {
        pic16f877a_body: ['PIC16F877A (mạch đích)', 'Trong lúc nạp: CPU dừng, RB6/RB7 thành cổng nạp. Sau khi thả MCLR: chạy chương trình mới. Khấc → phía chân 1.'],
        pin_1: ['PIC chân 1 — MCLR/VPP', 'Nhận VPP 13 V khi nạp; trở 10 kΩ kéo lên 5 V khi chạy.'],
        pin_11: ['PIC chân 11 — VDD', 'Nối header ICSP chân 2.'], pin_12: ['PIC chân 12 — VSS', 'Nối header ICSP chân 3.'],
        pin_30: ['PIC chân 30 — RD7 (LED)', 'LED trạng thái — nháy khi chương trình mới chạy.'],
        pin_36: ['PIC chân 36 — RB3/PGM', 'Để trống (NOLVP). Nếu cắm ngược đầu nạp, 13 V rơi vào đây!'],
        pin_39: ['PIC chân 39 — RB6/PGC', 'Nối header ICSP chân 5.'], pin_40: ['PIC chân 40 — RB7/PGD', 'Nối header ICSP chân 4.'],
      },
      onLoad(c) {
        for (const [n, grp] of [[1, 'icsp'], [11, 'power'], [12, 'ground'], [30, 'output'], [39, 'icsp'], [40, 'icsp'], [36, 'spare']]) c.color(\`pin_\${n}\`, PIN_COLORS[grp]);
      },
    });
    const ledSet = (list, hex, k) => {
      for (const o of list || []) {
        if (o.userData._preHeat) continue;
        o.material.emissive.setHex(hex); o.material.emissiveIntensity = k;
        if (k > 0.05) o.material.color.setHex(hex).multiplyScalar(0.5); else o.material.color.setHex(o.userData._ledBase);
      }
    };

    // ---------- tạo dạng sóng của một lần nạp ----------
    function buildSeq(mode, powerSrc) {
      const S = [];
      const cur = { vpp: 0, pgc: 0, pgd: 0, vdd: 0, ph: 'Kết nối', log: 'Connecting to MPLAB PICkit 3…', addr: '—', st: 'busy' };
      const emit = (n, ch = {}) => { Object.assign(cur, ch); for (let i = 0; i < n; i++) S.push({ ...cur }); };
      const vddOk = mode === 'thieu-nguon' ? 0 : mode === 'qua-tai' ? 2.9 : 5;
      const cmd = (code) => { for (let k = 0; k < 6; k++) { emit(1, { pgc: 5, pgd: ((code >> k) & 1) * 5 }); emit(1, { pgc: 0 }); } emit(1, { pgd: 0 }); };
      const data = (w, slowPgd = false) => {
        const bits = [0]; for (let k = 0; k < 14; k++) bits.push((w >> k) & 1); bits.push(0);
        for (const b of bits) { emit(1, { pgc: 5, pgd: b * (slowPgd ? 2.6 : 5) }); emit(1, { pgc: 0 }); }
        emit(1, { pgd: 0 });
      };
      // 1. đo VDD
      emit(10, { log: 'Connecting to MPLAB PICkit 3… Firmware OK' });
      emit(12, { vdd: vddOk, ph: '1. Đo VDD mạch đích', log: powerSrc === 'tool' ? 'PICkit 3 is supplying power to the target (5.00 volts).' : 'Target voltage detected' });
      if (mode === 'thieu-nguon') { emit(20, { ph: '✗ Dừng', log: 'Target VDD not detected — Target device was not found (could not detect target voltage VDD).', st: 'err' }); return S; }
      if (mode === 'qua-tai') { emit(20, { ph: '✗ Dừng', log: 'VDD đo được 2.9 V < 4.5 V — PICkit 3 ngừng cấp nguồn (quá tải ~30 mA).', st: 'err' }); return S; }
      // 2. VPP
      for (let k = 1; k <= 8; k++) emit(1, { vpp: (VPP * k) / 8, ph: '2. Nâng MCLR lên VPP 13 V (vào chế độ nạp)' });
      emit(8);
      // 3. đọc Device ID
      emit(1, { ph: '3. Đọc Device ID (0x2006)', addr: '0x2000' });
      cmd(CMD.LOAD_CONF); data(0);
      for (let k = 0; k < 2; k++) cmd(CMD.INC_ADDR);
      emit(4, { addr: '… 0x2006' });
      cmd(CMD.READ_DATA);
      const idRead = mode === 'nguoc-dau' ? 0x0000 : DEVID;
      data(idRead);
      if (mode === 'nguoc-dau') { emit(4, { vpp: 0 }); emit(24, { ph: '✗ Dừng', log: 'Target Device ID (0x0) is an Invalid Device ID. Please check your connections to the Target Device.', st: 'err' }); return S; }
      emit(6, { log: \`Device ID = \${hex4(idRead)} → Target device PIC16F877A found.\` });
      // 4. xóa
      emit(1, { ph: '4. Xóa toàn bộ (Bulk Erase)', addr: '0x0000' });
      cmd(CMD.BULK_ERASE);
      emit(12, { log: 'Erasing…' });
      // 5. ghi
      PROG.forEach(([w, asm], i) => {
        emit(1, { ph: '5. Ghi bộ nhớ chương trình', addr: \`\${hex4(i)}: \${hex4(w)}  \${asm}\`, log: 'Programming…' });
        cmd(CMD.LOAD_DATA); data(w);
        cmd(CMD.BEGIN_PROG); emit(6);
        cmd(CMD.INC_ADDR);
      });
      emit(10, { addr: '… 0x0004 → 0x03FF (tua nhanh)', pgc: 0, pgd: 0 });
      // 6. verify
      emit(1, { ph: '6. Đọc lại để kiểm tra (Verify)', addr: '0x0000', log: 'Verifying…' });
      cmd(CMD.READ_DATA);
      const slow = mode === 'tai-pgd';
      data(PROG[0][0], slow);
      if (slow) { emit(4, { vpp: 0 }); emit(24, { ph: '✗ Verify thất bại', log: 'Programming failed — Verify failed at program memory address 0x0000 (expected 0x3000, read 0x0000).', st: 'err' }); return S; }
      // 7. config
      emit(1, { ph: '7. Ghi Configuration Word 0x2007', addr: \`0x2007: \${hex4(CONFIG)} (HS, NOWDT, PUT, BOR, NOLVP)\` });
      cmd(CMD.LOAD_CONF); data(CONFIG);
      for (let k = 0; k < 2; k++) cmd(CMD.INC_ADDR);
      cmd(CMD.BEGIN_PROG); emit(6);
      // 8. thả
      for (let k = 7; k >= 0; k--) emit(1, { vpp: (VPP * k) / 8, ph: '8. Hạ VPP, thả MCLR → PIC chạy chương trình mới' });
      emit(2, { vpp: vddOk, log: 'Programming/Verify complete', st: 'ok', addr: '—' });
      emit(30);
      return S;
    }

    // ---------- trạng thái ----------
    let seq = buildSeq(null, 'board'), t0 = 0.3, clock = 0, fault = null, fT = 0, step = -1, lastKey = '', runT = -1, smoked = false, pkX = 0;

    function start(p) { seq = buildSeq(fault, p.power); t0 = clock; runT = -1; smoked = false; }

    return {
      object: root,
      onAction(id, p) { if (id === 'program') { start(p); btnT = 0.35; } },
      setStep(i) { step = i; },
      triggerFault(id, p) {
        fault = id; fT = 0;
        pk.rotation.x = id === 'nguoc-dau' ? Math.PI : 0;
        pk.position.y = id === 'nguoc-dau' ? 5 : 0;
        if (id === 'banh-quay') tgt.add(wheel);
        start(p);
      },
      resetFault(p) { fault = null; pk.rotation.x = 0; pk.position.y = 0; tgt.remove(wheel); wheel.rotation.set(0, 0, 0); start(p); },
      update(dt, t, p) {
        clock += dt * Number(p.speed); fT += dt;
        const cadOn = cadPk.sync(p);
        const picOn = cadPic.sync(p);
        usbCable.position.x = cadOn ? 11 : 0;          // dây USB cắm vào cổng mini-B của vỏ CAD (ngắn hơn vỏ tự dựng)
        // ---- tháo lắp ----
        const s = step;
        r10k.children[0].material.emissive.setRGB(s === 1 ? 0.6 : 0, s === 1 ? 0.5 : 0, 0);
        const attached = s < 0 || s >= 2;
        pkX += ((attached ? 0 : -60) - pkX) * (1 - Math.pow(0.01, dt));
        pk.position.x = pkX;
        const key = \`\${p.power}|\${fault}\`;
        if (key !== lastKey) { lastKey = key; start(p); }

        // ---- phát lại dạng sóng ----
        const idx = Math.floor((clock - t0) / DT);
        const sm = attached && idx >= 0 ? seq[Math.min(idx, seq.length - 1)] : { vpp: 5, pgc: 0, pgd: 0, vdd: 5, ph: attached ? 'Chờ' : 'Chưa cắm PICkit', log: '—', addr: '—', st: 'idle' };
        const finished = idx >= seq.length - 1;
        if (finished && p.auto && clock - t0 > seq.length * DT + 2) start(p);
        let vpp = sm.vpp;
        if (finished && sm.st === 'ok') vpp = 5;            // trở 10 kΩ kéo MCLR lên 5 V
        const running = finished && sm.st === 'ok';
        if (running && runT < 0) runT = clock;

        // ---- hiệu ứng ----
        ledPow.emissiveIntensity = 1.2;
        ledAct.emissiveIntensity = attached && !finished ? 1.2 : 0.3;
        ledSt.emissive.setHex(sm.st === 'err' ? 0xff2020 : sm.st === 'ok' ? 0x30ff60 : 0xffd34d);
        ledSt.emissiveIntensity = sm.st === 'idle' ? 0 : 1.3;
        if (cadOn) {
          ledSet(cadLed.pwr, 0x30ff60, 1.6);
          ledSet(cadLed.act, 0x3b8ef0, attached && !finished ? 1.6 : 0.25);
          ledSet(cadLed.st, sm.st === 'err' ? 0xff2020 : sm.st === 'ok' ? 0x30ff60 : 0xffd34d, sm.st === 'idle' ? 0 : 1.7);
          btnT = Math.max(0, btnT - dt);
          cadBtn?.set(btnT > 0 ? -0.4 : 0);              // nút bị nhấn khi bấm "Program"
        }
        ledMat.emissiveIntensity = running && Math.floor((clock - runT) * 2) % 2 === 0 ? 1.5 : 0;
        hdrPins.forEach((g, k) => g.traverse((o) => { if (o.isMesh && !o.userData._preHeat) o.material.emissive.setRGB(k === 0 ? vpp / 14 : k === 4 ? sm.pgc / 6 : k === 3 ? sm.pgd / 6 : 0, 0, k === 0 ? vpp / 14 : 0); }));
        if (fault === 'nguoc-dau') {
          const p36 = picOn && cadPic.node('pin_36') ? cadPic.node('pin_36') : dip.pins[35];
          fx.heat(p36, Math.min(0.8, fT / 3));
          if (fT > 2.5 && !smoked) { smoked = true; fx.smoke(p36, { size: 4, duration: 3, color: 0xdddddd }); }
        }
        if (fault === 'qua-tai') fx.heat(cadOn && cadCase ? cadCase : pk.children[0], Math.min(0.25, fT / 8));
        if (fault === 'banh-quay' && running) { wheel.rotation.z -= dt * 12; if (!smoked) { smoked = true; fx.flash(wheel, { size: 15, color: 0xffd34d }); } }

        // ---- số đo ----
        readout('phase', sm.ph + (fault === 'banh-quay' && running ? ' — ⚠️ BÁNH QUAY NGAY!' : ''));
        readout('log', sm.log);
        readout('addr', sm.addr);
        readout('pins', \`\${vpp.toFixed(1)} / \${sm.vdd.toFixed(1)}\`);
        readout('leds', \`Power ● · Active \${attached && !finished ? '●' : '○'} · Status \${sm.st === 'err' ? 'ĐỎ' : sm.st === 'ok' ? 'XANH' : sm.st === 'busy' ? 'VÀNG' : '○'}\`);
        return [vpp, sm.pgc, sm.pgd, sm.vdd];
      },
    };

    function tintMat(m, c) { const x = m.clone(); x.color.set(c); return x; }
  },
};
`;export{n as default};
