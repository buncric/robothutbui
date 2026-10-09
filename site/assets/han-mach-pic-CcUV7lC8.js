const n=`// 🔧 Hàn mạch PIC tối thiểu từng bước — bo đục lỗ 9 × 15 cm, 14 bước có hoạt cảnh đặt linh kiện + mỏ hàn,
// kiểm tra thông mạch, cấp nguồn không chip, cắm chip & nạp. 7 sự cố hàn/lắp sai.
import {
  AMBIENT, clamp, thermal, heatLevel, makeWire, perfboard, dipSocket, dipPinXZ, ceramicCap, electrolytic, resistor,
  crystal, led5, setLed, solderJointGeo, solderingIron, screwTerminal, benchSupply, multimeter, pickit, probe, aimTool,
} from './_bench_helpers.js';

const STEPS = [
  { title: 'Bước 1 — Lên phương án bố trí (layout)', text: 'Đặt bo 9 × 15 cm (lỗ 2.54 mm) lên thảm chống tĩnh điện. Vẽ ra giấy kẻ ô: đế DIP-40 ở giữa, <b>khấc quay sang trái</b> (chân 1 ở góc trái-trước). Linh kiện thụ động (tụ, thạch anh) sát chân chip; header ở mép bo. Khung mờ trên bo là vị trí dự kiến. Dụng cụ: mỏ hàn 30–60 W đầu dao/đầu bút (320–350 °C), thiếc 0.8 mm Sn63/Pb37 hoặc SAC305 có lõi nhựa thông, kìm cắt, nhíp, đồng hồ vạn năng, kính lúp.' },
  { title: 'Bước 2 — Hàn đế DIP-40 (khấc sang trái!)', text: 'Cắm đế, kiểm tra khấc. Lật bo, hàn trước <b>2 chân chéo góc</b> (1 và 21), lật lại xem đế áp sát bo chưa — chỉnh rồi mới hàn 38 chân còn lại. Mỗi mối: chạm mỏ vào cả pad và chân 1 s, đưa thiếc vào chỗ tiếp xúc (không phải vào mũi mỏ), rút thiếc rồi rút mỏ — mối đẹp là nón bóng, lõm nhẹ. <b>Luôn hàn đế, không hàn chết chip</b>: chip hỏng thay trong 10 s, và nhiệt mỏ hàn không đến chip.' },
  { title: 'Bước 3 — Tụ 100 nF sát 2 cặp VDD/VSS', text: 'Chân 11 (VDD) và 12 (VSS) nằm cạnh nhau; chân 32 (VDD) và 31 (VSS) cũng vậy → mỗi cặp một tụ gốm 100 nF (mã "104") cắm ngay hàng lỗ kế bên, chân càng ngắn càng tốt. Tụ này cấp dòng tức thời khi CPU chuyển mạch (hàng chục mA trong vài ns) — thiếu nó PIC dễ treo/reset.' },
  { title: 'Bước 4 — Thạch anh 20 MHz + 2 tụ 22 pF sát chân 13/14', text: 'Thạch anh HC-49S nối chân 13 (OSC1) và 14 (OSC2), mỗi chân thêm 1 tụ 22 pF xuống GND. <b>Càng sát càng tốt (&lt; 1 cm)</b>: dây dài = thêm điện dung/điện cảm ký sinh → không dao động hoặc sai tần số. Fuse cấu hình: <code>HS</code>.' },
  { title: 'Bước 5 — Trở 10 kΩ kéo MCLR (+ tụ 100 nF tùy chọn)', text: 'Chân 1 (MCLR) nối trở 10 kΩ (nâu-đen-cam) lên 5 V. MCLR = 0 V thì chip bị reset; thả nổi thì reset lung tung. Tụ 100 nF từ MCLR xuống GND giúp chống nhiễu (chỉ thêm nếu robot reset do nhiễu — tụ lớn làm khó nạp ICSP).' },
  { title: 'Bước 6 — Header nạp ICSP 6 chân', text: 'Thứ tự chuẩn PICkit: 1-MCLR, 2-VDD, 3-GND, 4-PGD (chân 40/RB7), 5-PGC (chân 39/RB6), 6-NC. Đánh dấu tam giác ở chân 1. <b>Không nối tải vào RB6/RB7</b> — làm sai tín hiệu nạp.' },
  { title: 'Bước 7 — LED trạng thái + trở 330 Ω trên RD7', text: 'Chân 30 (RD7) → trở 330 Ω → LED (chân dài = anốt) → GND. Dòng: <code>(5 − 2.0)/330 ≈ 9 mA</code>, dưới mức 25 mA/chân của PIC. LED là "nhịp tim": nháy đều = chương trình chạy; tắt rồi nháy lại từ đầu = vừa reset.' },
  { title: 'Bước 8 — Đầu nguồn: domino + diode chống ngược + cầu chì tự phục hồi + tụ 100 µF', text: 'Domino 2 cực (đánh dấu + / −). Nối tiếp: polyfuse 0.5 A (tự ngắt khi quá dòng, nguội thì nối lại) → diode Schottky 1N5819 (sụt ~0.2–0.4 V; cắm ngược nguồn thì diode chặn) → tụ hóa 100 µF/16 V (vạch trắng về GND) → ray 5 V. VDD còn ~4.7–4.8 V: vẫn đủ cho 20 MHz (cần ≥ 4.5 V).' },
  { title: 'Bước 9 — Đi dây ray 5 V và GND (nối chân 11↔32, 12↔31)', text: 'Dây đỏ: ray 5 V tới chân 11 và vòng qua đầu chip tới chân 32. Dây đen: GND tới chân 12 và vòng sang chân 31. <b>Phải nối CẢ HAI cặp</b> — PIC có 2 chân VSS để chia dòng và giảm nhiễu đất. Mặt dưới nối bằng dây đồng trần/cầu thiếc theo hàng lỗ; cẩn thận đừng để thiếc chảy sang lỗ bên cạnh.' },
  { title: 'Bước 10 — Header UART 4 chân (sang BSS138)', text: 'Thứ tự: 5V, GND, TX (chân 25/RC6), RX (chân 26/RC7). Header này cắm sang phía HV của mạch chuyển mức BSS138 → ESP32. Luôn có GND trong cùng đầu cắm.' },
  { title: 'Bước 11 — Header động cơ & cảm biến', text: 'Header động cơ 5 chân: CCP1 (17), RD0 (19), CCP2 (16), RD2 (21), GND → 2 DRV8871. Header cảm biến 6 chân: RA4 (encoder trái, cần trở kéo lên 10 kΩ vì RA4 là open-drain), RC0 (encoder phải), RB4/RB5 (bumper), 5 V, GND. Xem bảng chân trong docs/01.' },
  { title: 'Bước 12 — Kiểm tra thông mạch TRƯỚC khi cắm chip', text: 'Đồng hồ ở thang thông mạch (biểu tượng loa). Không cấp nguồn! Kiểm: 11↔32 phải kêu (≈ 0 Ω); 12↔31 phải kêu; <b>VDD↔GND KHÔNG được kêu</b> (lúc đầu kêu ngắn rồi tắt do tụ đang nạp là bình thường); ICSP-4↔chân 40, ICSP-5↔chân 39, ICSP-1↔chân 1; MCLR↔VDD ≈ 10 kΩ. Kết quả ở ô "Kiểm tra thông mạch".' },
  { title: 'Bước 13 — Cấp nguồn KHÔNG có chip, đo 5 V ở đế', text: 'Nguồn bàn 5.0 V, giới hạn dòng 50–100 mA. Bật: dòng phải ≈ 0 mA (chưa có chip). Đo que đỏ ở lỗ 11 rồi 32, que đen ở lỗ 12 rồi 31: phải ≈ 4.7–4.8 V (sau diode). Nếu đèn CC sáng hoặc dòng > 10 mA → có chập, tắt ngay. Tắt nguồn trước khi cắm chip.' },
  { title: 'Bước 14 — Cắm PIC (khấc trùng khấc) và nạp bằng PICkit', text: 'Chân DIP mới thường xòe rộng: tì một hàng chân lên mặt bàn, ép nhẹ cho thẳng. Khấc chip trùng khấc đế, ấn đều. Cắm PICkit vào ICSP (tam giác = chân 1), MPLAB IPE hoặc CCS: Program. Nạp chương trình nháy LED → LED RD7 nháy 1 Hz, dòng ~10–16 mA. Xong!' },
];

const FAULTS = [
  {
    id: 'pic-nguoc', label: 'Cắm PIC ngược chiều trong đế', severity: 'chay',
    what: '<p>Khấc chip ngược khấc đế, cấp bằng buck 5 V của robot (không giới hạn dòng). LED không nháy, PICkit báo không nhận chip. Dòng vọt ~2.5 A; ~5 s chip nóng bỏng tay; ~30 s bốc khói, mùi nhựa cháy; rồi nứt vỏ.</p>',
    why: '<p>Xoay 180°, chân n của chip vào lỗ 41−n: 5 V ở lỗ 11/32 đi vào chân 30 (RD7) và 9 (RE1); GND ở lỗ 12/31 vào chân 29 (RD6) và 10 (RE2). Dòng chạy qua diode bảo vệ ESD lên ray VDD trong chip → dòng chích lớn kích hoạt <b>latch-up</b> (thyristor ký sinh CMOS đóng lại) → chập nội bộ, chỉ bị giới hạn bởi nguồn: 5 V × 2.5 A ≈ 12 W trong DIP-40 (47 °C/W).</p>',
    fix: '<p>Khấc chip trùng khấc đế, chấm tròn = chân 1. Lần đầu cấp nguồn sau khi cắm chip luôn dùng nguồn bàn giới hạn 50–100 mA: chip ngược → đèn CC sáng ngay, áp tụt, chip chỉ ấm — tắt và xoay lại (thử: chọn "Nguồn cấp = nguồn bàn" rồi bấm lại sự cố này). Chip đã nóng tới khói → bỏ.</p>',
  },
  {
    id: 'cau-thiec', label: 'Cầu thiếc chạm VDD–GND (chân 11–12)', severity: 'hong',
    what: '<p>Hai pad chân 11 và 12 cạnh nhau, thiếc thừa chảy thành cầu. Bật nguồn bàn: đèn CC đỏ sáng ngay, VDD chỉ còn vài chục mV, dòng đứng đúng giới hạn. Đặt giới hạn cao (2–3 A) thì cầu thiếc và dây mảnh nóng lên rõ rệt. Cấp bằng buck robot qua header (không có polyfuse): buck dồn ~5 A, cầu thiếc/đường dây nóng &gt; 250 °C, bốc khói, bong pad.</p>',
    why: '<p>Cầu thiếc ≈ 0.02 Ω + đường dây ~0.08 Ω. Nguồn bàn ở CC: <code>V = I_lim × R ≈ 0.1 A × 0.1 Ω = 10 mV</code>, công suất 1 mW — vô hại. Với giới hạn 3 A: <code>P = 9 × 0.1 ≈ 0.9 W</code> dồn vào chỗ nhỏ xíu → 100+ °C. Cấp bằng pin/buck thì polyfuse 0.5 A ở đầu nguồn sẽ ngắt — nếu không có polyfuse, dây/đường mạch cháy.</p>',
    fix: '<p>Bước 12 (đo thông mạch VDD↔GND) bắt được lỗi này TRƯỚC khi cấp nguồn. Sửa: chấm nhựa thông, chạm mỏ hàn sạch kéo thiếc ra, hoặc dùng dây hút thiếc (bấc đồng). Soi kính lúp mọi cặp chân cạnh nhau.</p>',
  },
  {
    id: 'han-nguoi', label: 'Mối hàn nguội ở đầu nguồn', severity: 'loi',
    what: '<p>Mối hàn ở cực + của domino xám đục, dạng hòn bi, chân lỏng. PIC chạy được vài giây rồi reset, LED nháy lộn xộn; gõ nhẹ vào bo là reset; máy hiện sóng VDD có những lần rớt xuống 0.</p>',
    why: '<p>Mối hàn nguội: thiếc không thấm vào pad/chân (mỏ chưa đủ nóng, rút mỏ trước khi thiếc chảy hẳn, hoặc chân bị rung khi thiếc đông) → tiếp xúc chỉ là vài điểm, điện trở thay đổi theo rung động/nhiệt. VDD mất trong vài ms là đủ để PIC rơi dưới ngưỡng BOR → reset.</p>',
    fix: '<p>Hàn lại: thêm chút nhựa thông, nung đến khi thiếc chảy loáng và thấm thành nón bóng (2–3 s), giữ yên đến khi đông. Mối tốt: bóng, lõm nhẹ, bao quanh chân. Mối xấu: xám đục, tròn như hòn bi, có khe quanh chân.</p>',
  },
  {
    id: 'thieu-22pf', label: 'Thiếu tụ 22 pF / thạch anh để xa chân', severity: 'loi',
    what: '<p>Nạp chương trình thành công (ICSP không cần thạch anh) nhưng LED không bao giờ nháy. Dòng chỉ ~1 mA. Đo chân 13/14 bằng máy hiện sóng: không có sóng 20 MHz.</p>',
    why: '<p>Mạch dao động Pierce cần thạch anh + 2 tụ tải (22 pF) tạo đủ dịch pha 360° và độ lợi vòng. Thiếu tụ, hoặc thạch anh đặt xa bằng dây 3 cm (thêm ~3 pF và cảm kháng, bắt nhiễu) → không khởi động dao động. PIC chờ Oscillator Start-up Timer (1024 chu kỳ) mãi mãi → không chạy lệnh nào.</p>',
    fix: '<p>Thạch anh và 2 tụ 22 pF sát chân 13/14 (&lt; 1 cm), tụ về GND ngắn. Kiểm fuse <code>HS</code> (không phải XT/RC). Thạch anh 20 MHz cần tụ 15–33 pF tùy datasheet.</p>',
  },
  {
    id: 'quen-mclr', label: 'Quên trở 10 kΩ kéo MCLR lên', severity: 'loi',
    what: '<p>LED lúc nháy lúc không; chạm tay gần chân 1 là chip reset hoặc chạy; để yên có khi đứng im hàng phút. Trạng thái PIC nhảy RESET ↔ CHẠY lung tung.</p>',
    why: '<p>MCLR là chân reset tích cực mức thấp. Thả nổi, nó là một tụ ~5 pF bắt mọi nhiễu (tay người, động cơ, 50 Hz điện lưới) → điện áp trôi qua lại ngưỡng → reset ngẫu nhiên. Trở 10 kΩ lên VDD giữ nó chắc chắn ở mức 1 nhưng vẫn cho PICkit kéo lên 13 V (VPP) khi nạp.</p>',
    fix: '<p>Hàn trở 10 kΩ từ chân 1 lên 5 V (thêm diode 1N4148 nếu nguồn có linh kiện sợ 13 V). Hoặc tắt MCLR bằng fuse <code>NOMCLR</code> (chỉ một số PIC có; PIC16F877A thì không).</p>',
  },
  {
    id: 'led-khong-tro', label: 'LED trạng thái thiếu trở 330 Ω', severity: 'hong',
    what: '<p>LED sáng chói bất thường một lúc, nóng, rồi tắt ngúm vĩnh viễn (trường hợp xấu: vài giây; LED tốt có thể chịu vài phút). Chân RD7 cũng bị quá dòng — điện áp mức 1 sụt, có thể hỏng chân.</p>',
    why: '<p>Không có trở, dòng chỉ bị giới hạn bởi điện trở trong của tầng ra PIC (~40 Ω) và LED: <code>I ≈ (5 − 2.2)/45 ≈ 60 mA</code> — gấp đôi giới hạn LED đỏ 5 mm (20–30 mA) và vượt 25 mA/chân của PIC. Mối nối bán dẫn LED quá nhiệt, suy giảm nhanh → đứt.</p>',
    fix: '<p>Luôn có trở hạn dòng: <code>R = (VDD − V_LED)/I = (5 − 2)/0.009 ≈ 330 Ω</code>. LED trắng/xanh dương (Vf ~3 V): 220 Ω. Tải &gt; 20 mA dùng transistor.</p>',
  },
  {
    id: 'thieu-vss31', label: 'Quên nối VSS chân 31', severity: 'loi',
    what: '<p>Có vẻ chạy, nhưng thỉnh thoảng reset khi LED/động cơ bật; ADC đọc nhảy; UART lỗi lẻ tẻ. Máy hiện sóng VDD có gai mỗi lần chân ra đổi trạng thái.</p>',
    why: '<p>PIC16F877A có 2 cặp VDD/VSS vì dòng của các cổng I/O hai bên chip đi về các chân đất khác nhau. Thiếu chân 31, toàn bộ dòng (kể cả xung khi nhiều chân đổi trạng thái cùng lúc) phải đi qua chân 12 và dây bond bên trong → "nảy đất" (ground bounce) hàng trăm mV → sai ngưỡng logic, reset BOR.</p>',
    fix: '<p>Nối CẢ 2 chân VSS (12, 31) và CẢ 2 chân VDD (11, 32), mỗi cặp một tụ 100 nF. Kiểm bằng bước thông mạch 12↔31.</p>',
  },
];

export default {
  id: 'han-mach-pic',
  name: 'Hàn mạch PIC tối thiểu từng bước',
  category: 'mo-phong',
  order: 4,
  icon: '🔧',
  summary: 'Tự hàn bo PIC16F877A trên perfboard 9 × 15 cm: 14 bước có hoạt cảnh đặt linh kiện, lật bo, mỏ hàn chạm từng mối; đo thông mạch, cấp nguồn không chip, cắm chip & nạp. Kèm 7 lỗi hàn/lắp sai thường gặp.',
  tags: ['hàn', 'perfboard', 'mạch tối thiểu', 'thạch anh', 'ICSP', 'PICkit', 'cầu thiếc', 'mối hàn nguội', 'thông mạch'],

  params: [
    { id: 'tempo', label: 'Tốc độ hoạt cảnh', type: 'range', min: 0.5, max: 4, step: 0.5, value: 1.5, unit: '×' },
    { id: 'flip', label: 'Lật bo xem mặt hàn', type: 'toggle', value: false },
    { id: 'ghost', label: 'Hiện khung bố trí (layout)', type: 'toggle', value: false },
    { id: 'src', label: 'Nguồn cấp khi thử sự cố', type: 'select', value: 'buck', options: [['buck', 'Buck 5 V của robot qua header (~5 A, không giới hạn)'], ['bench', 'Nguồn bàn 5.0 V qua domino (giới hạn dòng)']], hint: 'Các bước 13–14 luôn dùng nguồn bàn' },
    { id: 'ilim', label: 'Giới hạn dòng nguồn bàn', type: 'range', min: 0.02, max: 3, step: 0.02, value: 0.1, unit: 'A' },
    { id: 'replay', label: '▶ Diễn lại bước này', type: 'button' },
  ],
  readouts: [
    { id: 'step', label: 'Tiến độ' },
    { id: 'joints', label: 'Mối hàn đã làm', unit: 'mối' },
    { id: 'cont', label: 'Kiểm tra thông mạch' },
    { id: 'vdd', label: 'VDD tại lỗ 11/32', unit: 'V' },
    { id: 'isup', label: 'Dòng nguồn', unit: 'mA' },
    { id: 'mode', label: 'Nguồn' },
    { id: 'pic', label: 'PIC16F877A' },
    { id: 'temp', label: 'Nhiệt độ chip / LED / cầu thiếc', unit: '°C' },
  ],
  scope: {
    window: 4,
    note: '(thời gian thực; dao động 20 MHz không vẽ — chỉ vẽ VDD, chân LED và dòng)',
    channels: [
      { name: 'VDD (lỗ 11)', unit: 'V', min: 0, max: 6, color: '#ffd34d' },
      { name: 'Chân 30 RD7 (LED)', unit: 'V', min: 0, max: 6, color: '#ff6b6b' },
      { name: 'Dòng nguồn', unit: 'mA', min: 0, max: 200, color: '#4cc2ff' },
    ],
  },
  steps: STEPS,
  faults: FAULTS,

  info: {
    overview: \`
      <p>"Mạch tối thiểu" là những gì PIC16F877A cần để chạy: nguồn 5 V + tụ lọc, thạch anh + 2 tụ, trở kéo MCLR, cổng nạp ICSP — cộng LED để biết nó sống. Bài này hướng dẫn hàn trên bo đục lỗ (perfboard) 9 × 15 cm theo đúng thứ tự thợ làm.</p>
      <p>Dùng nút <b>◀ ▶</b> ở khung "Tháo lắp từng bước". Mỗi bước: linh kiện bay từ khay vào bo, bo tự lật, mỏ hàn chạm từng mối (nón thiếc bóng xuất hiện), bo lật lại. Bật <b>Lật bo xem mặt hàn</b> để xem mặt dưới. Thử: tới bước 12 xem kết quả đo thông mạch, rồi bấm sự cố "Cầu thiếc chạm VDD–GND" và kéo giới hạn dòng từ 0.1 A lên 3 A.</p>\`,
    specs: [
      ['Bo đục lỗ', '90 × 150 mm, FR-4 2 mặt phủ thiếc, lỗ Ø1 mm bước 2.54 mm (35 × 59 lỗ)'],
      ['Mỏ hàn', '30–60 W có chỉnh nhiệt, 320–350 °C (thiếc chì) / 350–380 °C (không chì)'],
      ['Thiếc', 'Ø0.8 mm Sn63/Pb37 (chảy 183 °C, dễ hàn) hoặc SAC305 (217 °C), lõi nhựa thông'],
      ['Đế IC', 'DIP-40 15.24 mm (600 mil), loại lò xo hoặc tiện tròn'],
      ['Thạch anh', '20 MHz HC-49S + 2 × 22 pF NP0/C0G'],
      ['Tụ lọc', '2 × 100 nF gốm (sát VDD/VSS) + 100 µF/16 V hóa (đầu nguồn)'],
      ['MCLR', '10 kΩ lên VDD (+ 100 nF xuống GND tùy chọn)'],
      ['LED', '5 mm đỏ + 330 Ω → ~9 mA'],
      ['Bảo vệ nguồn', 'Polyfuse 0.5 A + Schottky 1N5819 chống ngược (sụt ~0.3 V)'],
    ],
    principle: \`
      <h4>Mối hàn tốt hình thành thế nào</h4>
      <p>Thiếc nóng chảy hòa tan một lớp mỏng đồng của pad và chân linh kiện, tạo <b>hợp chất liên kim</b> (Cu₆Sn₅) — đó mới là mối nối điện + cơ thật sự. Muốn vậy, CẢ pad và chân phải nóng trên điểm chảy, bề mặt sạch ô-xít (nhựa thông lo việc này). Mỏ nung chi tiết, thiếc chạm vào chi tiết — không "phết" thiếc từ mũi mỏ.</p>
      <h4>Vì sao thứ tự hàn quan trọng</h4>
      <ul><li>Linh kiện thấp trước, cao sau (đế IC, trở, tụ → thạch anh, tụ hóa → header, domino) để bo nằm phẳng khi lật.</li><li>Đế trước chip: chip không bao giờ chịu nhiệt mỏ hàn và không bị tĩnh điện từ mỏ.</li><li>Đo thông mạch và cấp nguồn KHÔNG có chip trước: lỗi lắp ráp chỉ làm hỏng thứ rẻ tiền.</li></ul>
      <h4>Dòng điện nguồn bàn khi thử</h4>
      <p>Không chip: ~0 mA. Có chip chạy 20 MHz: ~7 mA + LED 9 mA khi sáng. Nếu dòng vượt xa những con số này → có lỗi. Đặt giới hạn 50–100 mA thì mọi lỗi chập đều chỉ làm nguồn chuyển CC, không gì cháy.</p>\`,
    inRobot: \`
      <p>Đây là "tủy sống" của robot theo <code>docs/01_KIEN_TRUC_VA_SO_DO_CHAN.md</code>: 5 V từ buck XL4015 vào domino; UART RC6/RC7 → BSS138 → ESP32 GPIO18/17; CCP1/RD0 → DRV8871 bánh trái, CCP2/RD2 → bánh phải; RA4/RC0 ← encoder; RB4/RB5 ← bumper; RD7 → LED; ICSP để nạp firmware <code>firmware/pic16f877a_ccs/</code>. Xem bài "Bàn thí nghiệm điện" để thấy bo này nối vào cả hệ.</p>\`,
    mistakes: \`
      <ul>
        <li>Hàn chip trực tiếp (không đế) → hỏng là phải tháo 40 chân.</li>
        <li>Đế/chip quay ngược khấc → latch-up, cháy chip.</li>
        <li>Cầu thiếc giữa 2 chân cạnh nhau (11–12 là VDD–GND!).</li>
        <li>Mối hàn nguội (xám, hòn bi) → reset ngẫu nhiên khi rung.</li>
        <li>Thạch anh xa chân, thiếu tụ 22 pF → không dao động.</li>
        <li>Quên trở MCLR, quên nối chân 31/32.</li>
        <li>Giữ mỏ quá lâu (&gt; 5 s) → bong pad perfboard.</li>
      </ul>\`,
    quiz: [
      { q: 'Vì sao phải đo thông mạch VDD↔GND trước khi cắm chip?', a: 'Để bắt chập (cầu thiếc, linh kiện cắm sai) khi chưa có điện và chưa có chip — lỗi chỉ cần sửa mối hàn, không mất chip.' },
      { q: 'LED đỏ Vf = 2 V, muốn dòng 9 mA từ chân PIC 5 V. Trở bao nhiêu?', a: 'R = (5 − 2) / 0.009 ≈ 333 Ω → chọn 330 Ω.' },
      { q: 'Cắm chip ngược khi nguồn bàn giới hạn 0.1 A — chuyện gì xảy ra?', a: 'Latch-up đòi vài ampe nhưng nguồn chỉ cho 0.1 A → chuyển CC, áp tụt, chip chỉ ấm. Thấy CC thì tắt ngay, xoay chip lại.' },
    ],
  },

  build(ctx) {
    const { THREE, MAT, geom, label, readout, fx } = ctx;
    const { mesh, part, box, cyl } = geom;
    const root = new THREE.Group();
    const BOARD_Y = 14;

    // ---------------- thảm + bo (bd = nhóm xoay được để lật bo; gốc = tâm mặt trên bo)
    root.add(part(mesh(box(470, 3, 300, 3), new THREE.MeshStandardMaterial({ color: 0x35566f, roughness: 0.95 }), { y: -1.5, z: 10 }),
      'Thảm chống tĩnh điện', 'Đặt bo và linh kiện trên thảm ESD, đeo vòng tay nối đất khi cầm chip CMOS.'));
    const bd = new THREE.Group();
    bd.position.y = BOARD_Y;
    root.add(bd);
    const pf = perfboard(ctx, 150, 90);
    bd.add(part(pf.group, 'Bo đục lỗ 9 × 15 cm', 'FR-4 2 mặt phủ thiếc, 35 × 58 lỗ bước 2.54 mm. Linh kiện cắm mặt trên, hàn mặt dưới.'));
    const feet = new THREE.Group();
    for (const [x, z] of [[-70, -40], [70, -40], [-70, 40], [70, 40]]) feet.add(mesh(cyl(2.6, 2.6, BOARD_Y - 1.6, 6), MAT.brass, { x, y: (BOARD_Y - 1.6) / 2, z }));
    root.add(part(feet, 'Cột đồng M3 kê bo', 'Kê bo cao 12 mm để chân linh kiện không cào thảm, dễ lật.'));
    label(bd, 'Khấc ← chân 1', [-48, 8, 12]);

    // ---------------- toạ độ chân DIP-40 trên bo
    const SX = -10.16;
    const X = (n) => SX + dipPinXZ(n)[0], Z = (n) => dipPinXZ(n)[1];
    const range = (n, f) => Array.from({ length: n }, (_, k) => f(k));

    // ---------------- khay linh kiện
    const tray = new THREE.Group();
    tray.position.set(0, 0, 100);
    tray.add(mesh(box(190, 4, 56, 2), new THREE.MeshStandardMaterial({ color: 0xd88aa6, roughness: 0.85 }), { y: 2 }));
    root.add(part(tray, 'Khay linh kiện (mút chống tĩnh điện)', 'Bày sẵn linh kiện theo thứ tự hàn. Chip CMOS cắm vào mút dẫn điện màu hồng/đen.'));
    label(tray, 'Khay linh kiện', [0, 12, -30]);

    // ---------------- linh kiện
    const tinMat = MAT.tin.clone(); tinMat.roughness = 0.12; tinMat.metalness = 1;
    const diodeAxial = () => {
      const g = new THREE.Group();
      g.add(mesh(cyl(1.35, 1.35, 5.2, 16), MAT.icBody, { y: 2.8, rz: Math.PI / 2 }));
      g.add(mesh(cyl(1.4, 1.4, 0.8, 16), MAT.plasticGrey, { x: -1.9, y: 2.8, rz: Math.PI / 2 }));
      for (const s of [-1, 1]) {
        g.add(mesh(cyl(0.3, 0.3, 2.5, 6), MAT.tin, { x: s * 3.8, y: 2.8, rz: Math.PI / 2 }));
        g.add(mesh(cyl(0.3, 0.3, 4.3, 6), MAT.tin, { x: s * 5.08, y: 0.65 }));
      }
      return g;
    };
    const hdr = (n, alongZ) => { const h = geom.pinHeader(n); if (alongZ) h.rotation.y = -Math.PI / 2; const g = new THREE.Group(); g.add(h); return g; };
    const flat = (pts, color) => makeWire(ctx, null, null, color, 0.45, { points: pts.map(([x, z]) => [x, 1.3, z]) });
    const railR1 = flat([[31.75, 20.32], [31.75, 25.4], [-8.89, 25.4], [-8.89, 12.7]], 0xd23b3b);
    const railR2 = flat([[-8.89, 25.4], [-44.45, 25.4], [-44.45, -25.4], [-13.97, -25.4], [-13.97, -12.7]], 0xd23b3b);
    const railG1 = flat([[57.15, 30.48], [57.15, 22.86], [-6.35, 22.86], [-6.35, 12.7]], 0x1e1f22);
    const railG2 = flat([[19.05, 22.86], [19.05, -22.86], [-11.43, -22.86], [-11.43, -12.7]], 0x1e1f22);
    const rails = new THREE.Group(); rails.add(railR1, railR2, railG1, railG2);
    const uartG = hdr(4, true);
    const jTx = flat([[X(25), -12.7], [X(25), -30.48], [60.96, -30.48], [60.96, -2.54], [67.31, -2.54]], 0xf2d13a);
    const jRx = flat([[X(26), -12.7], [X(26), -33.02], [63.5, -33.02], [63.5, 0], [67.31, 0]], 0x3fbf5f);
    const uartJ = new THREE.Group(); uartJ.add(jTx, jRx);
    const chipG = new THREE.Group();
    const dip = geom.dipPackage(40);
    chipG.add(dip.group);
    const crack = mesh(box(0.5, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0xd9d2c0 }), { x: 3, y: 4.7, ry: 0.4 });
    crack.visible = false; chipG.add(crack);
    const ledObj = led5(ctx, 0xff3030);
    const xtal = crystal(ctx);
    const r330 = resistor(ctx, ['orange', 'orange', 'brown', 'gold'], { span: 7.62 });
    const rmclr = resistor(ctx);
    const c22a = ceramicCap(ctx, { color: 0xd9822b, r: 1.8, h: 4 }), c22b = ceramicCap(ctx, { color: 0xd9822b, r: 1.8, h: 4 });
    const cbulk = electrolytic(ctx, { r: 3.15, h: 11, span: 2.54, legs: 2, color: 0x15171a });
    cbulk.group.rotation.y = Math.PI / 2;

    // key, bước, đối tượng, vị trí trên bo [x, y, z, ry], mối hàn [[x,z]], khung layout [w, d], tên, mô tả
    const PARTS = [
      ['socket', 1, dipSocket(ctx).group, [SX, 0, 0, 0], range(40, (k) => [X(k + 1), Z(k + 1)]), [54, 20], 'Đế DIP-40', 'Khấc ở đầu TRÁI = phía chân 1. Hàn 2 chân chéo góc trước để cố định.'],
      ['c1', 2, ceramicCap(ctx), [-7.62, 0, 10.16, 0], [[X(11), 10.16], [X(12), 10.16]], [6, 4], 'Tụ 100 nF (chân 11–12)', 'Tụ gốm "104" ngay cạnh cặp VDD/VSS thứ nhất.'],
      ['c2', 2, ceramicCap(ctx), [-12.7, 0, -10.16, 0], [[X(32), -10.16], [X(31), -10.16]], [6, 4], 'Tụ 100 nF (chân 31–32)', 'Tụ cho cặp VDD/VSS thứ hai.'],
      ['xtal', 3, xtal, [-1.27, 0, 15.24, 0], [[-3.81, 15.24], [1.27, 15.24]], [12, 5], 'Thạch anh 20 MHz (chân 13/14)', 'Nối OSC1/OSC2; càng sát chân càng tốt.'],
      ['c22a', 3, c22a, [-5.08, 0, 20.32, 0], [[-6.35, 20.32], [-3.81, 20.32]], [5, 3], 'Tụ 22 pF (OSC1 → GND)', 'Tụ tải cho thạch anh, loại NP0/C0G.'],
      ['c22b', 3, c22b, [2.54, 0, 20.32, 0], [[1.27, 20.32], [3.81, 20.32]], [5, 3], 'Tụ 22 pF (OSC2 → GND)', ''],
      ['rmclr', 4, rmclr, [-29.21, 0, 12.7, 0], [[-34.29, 12.7], [-24.13, 12.7]], [12, 3], 'Trở 10 kΩ kéo MCLR lên 5 V', 'Nâu-đen-cam-vàng kim. Giữ chân 1 ở mức 1.'],
      ['cmclr', 4, ceramicCap(ctx), [-35.56, 0, 17.78, 0], [[-36.83, 17.78], [-34.29, 17.78]], [6, 4], 'Tụ 100 nF MCLR (tùy chọn)', 'Lọc nhiễu chân reset.'],
      ['icsp', 5, hdr(6, true), [-67.31, 0, -7.62, 0], range(6, (k) => [-67.31, -7.62 + 2.54 * k]), [3, 16], 'Header ICSP 6 chân', '1-MCLR, 2-VDD, 3-GND, 4-PGD, 5-PGC, 6-NC.'],
      ['r330', 6, r330, [-5.08, 0, -15.24, 0], [[-8.89, -15.24], [-1.27, -15.24]], [9, 3], 'Trở 330 Ω (RD7 → LED)', 'Cam-cam-nâu: hạn dòng LED ~9 mA.'],
      ['led', 6, ledObj.group, [2.54, 0, -15.24, 0], [[1.27, -15.24], [3.81, -15.24]], [6, 6], 'LED trạng thái', 'Chân dài = anốt (+) về phía trở; chân ngắn/mặt vát = catốt về GND.'],
      ['term', 7, screwTerminal(ctx, 2, 5.08), [52.07, 0, 33.02, 0], [[52.07, 33.02], [57.15, 33.02]], [11, 8], 'Domino nguồn 5 V', 'Trái +5 V, phải GND.'],
      ['ptc', 7, ceramicCap(ctx, { color: 0xc9d23a, span: 5.08, r: 3.2, h: 7 }), [44.45, 0, 25.4, 0], [[41.91, 25.4], [46.99, 25.4]], [8, 4], 'Cầu chì tự phục hồi (polyfuse) 0.5 A', 'Polymer PTC: quá dòng thì nóng lên và tăng điện trở vọt → gần như ngắt; nguội thì nối lại.'],
      ['diode', 7, diodeAxial(), [36.83, 0, 20.32, 0], [[31.75, 20.32], [41.91, 20.32]], [12, 3], 'Diode Schottky 1N5819 chống ngược', 'Vạch xám = catốt, hướng về phía mạch. Cắm ngược nguồn → diode chặn.'],
      ['cbulk', 7, cbulk.group, [27.94, 0, 27.94, 0], [[26.67, 27.94], [29.21, 27.94]], [7, 7], 'Tụ hóa 100 µF / 16 V', 'Kho năng lượng đầu nguồn; vạch trắng = âm.'],
      ['rails', 8, rails, [0, 0, 0, 0], [[-8.89, 12.7], [-13.97, -12.7], [-6.35, 12.7], [-11.43, -12.7], [31.75, 25.4], [57.15, 30.48], [-44.45, 25.4], [19.05, 22.86]], null, 'Dây ray 5 V (đỏ) và GND (đen)', 'Nối domino → chân 11 & 32 (đỏ), chân 12 & 31 (đen).'],
      ['uart', 9, uartG, [67.31, 0, -7.62, 0], range(4, (k) => [67.31, -7.62 + 2.54 * k]), [3, 11], 'Header UART (5V, GND, TX, RX)', 'Sang mạch chuyển mức BSS138 → ESP32.'],
      ['uartJ', 9, uartJ, [0, 0, 0, 0], [[X(25), -12.7], [X(26), -12.7]], null, 'Dây TX (vàng, chân 25) / RX (xanh, chân 26)', ''],
      ['hmot', 10, hdr(5, false), [19.05, 0, -38.1, 0], range(5, (k) => [19.05 + 2.54 * k, -38.1]), [13, 3], 'Header động cơ (CCP1, RD0, CCP2, RD2, GND)', '→ 2 driver DRV8871.'],
      ['hsen', 10, hdr(6, false), [-44.45, 0, 38.1, 0], range(6, (k) => [-44.45 + 2.54 * k, 38.1]), [16, 3], 'Header cảm biến (RA4, RC0, RB4, RB5, 5V, GND)', 'Encoder trái/phải, bumper trái/phải.'],
      ['chip', 13, chipG, [SX, 2.6, 0, 0], [], null, 'PIC16F877A', 'Khấc chip trùng khấc đế. Chân DIP mới xòe — ép thẳng trước khi cắm.'],
    ];

    const jointGeo = geom.lathe([[0, 2.3], [0.25, 2.3], [0.25, 1.2], [0.45, 1.05], [0.7, 0.6], [1.05, 0.22], [1.2, 0.04], [1.22, 0]], 16);
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false });
    const parts = PARTS.map(([key, step, obj, home, joints, ghost, name, desc], k) => {
      const holder = new THREE.Group();
      holder.add(obj);
      part(holder, name, desc);
      const noTray = key === 'rails' || key === 'uartJ';
      const slot = PARTS.slice(0, k).filter((p) => p[0] !== 'rails' && p[0] !== 'uartJ').length;
      const trayPos = noTray ? null : [-80 + (slot % 10) * 17.5, 4.5, slot < 10 ? -12 : 12];
      const js = joints.map(([x, z]) => {
        const m = mesh(jointGeo, tinMat, { x, y: -1.6, z, rx: Math.PI });
        m.visible = false;
        bd.add(m);
        return m;
      });
      let gh = null;
      if (ghost) { gh = mesh(box(ghost[0], 0.3, ghost[1]), ghostMat, { x: home[0], y: 0.25, z: home[2], castShadow: false }); gh.visible = false; bd.add(gh); }
      return { key, step, holder, home: [...home], js, gh, trayPos, from: null };
    });
    const byKey = Object.fromEntries(parts.map((p) => [p.key, p]));

    // ---------------- dụng cụ & thiết bị
    const iron = solderingIron(ctx);
    iron.rotation.x = Math.PI - 0.6;
    iron.visible = false;
    bd.add(part(iron, 'Mỏ hàn 320–350 °C', 'Chạm mũi vào CẢ pad và chân linh kiện ~1 s, đưa thiếc vào chỗ tiếp xúc, rút thiếc rồi rút mỏ. Lau mũi bằng bọt biển ướt/bùi nhùi đồng.'));
    const bs = benchSupply(ctx);
    bs.group.position.set(-160, 0, -60);
    bs.group.rotation.y = Math.PI / 4;
    root.add(part(bs.group, 'Nguồn bàn (5.0 V, giới hạn dòng)', 'Bước 13: đặt 5.0 V, giới hạn 50–100 mA trước khi bật. Đèn đỏ CC = đang giới hạn dòng → có chập.'));
    const mm = multimeter(ctx);
    mm.group.position.set(150, 0, -10);
    mm.group.rotation.y = -0.3;
    root.add(part(mm.group, 'Đồng hồ vạn năng', 'Bước 12: thang thông mạch (loa). Bước 13: thang V DC.'));
    const pk = pickit(ctx);
    pk.group.position.set(-150, 0, 70);
    root.add(part(pk.group, 'PICkit 3', 'Cắm vào header ICSP, tam giác trùng chân 1 (MCLR).'));
    const probeR = probe(ctx, 0xd23b3b), probeB = probe(ctx, 0x222222);
    root.add(part(probeR, 'Que đo đỏ', ''), part(probeB, 'Que đo đen', ''));
    root.updateMatrixWorld(true);
    const W = (obj, p) => obj.localToWorld(new THREE.Vector3(...p)).toArray();
    const benchLeads = new THREE.Group();
    benchLeads.add(makeWire(ctx, W(bs.group, [22, 18, 77]), W(bd, [52.07, 10, 33.02]), 0xd23b3b, 0.9, { lift: 14 }));
    benchLeads.add(makeWire(ctx, W(bs.group, [42, 18, 77]), W(bd, [57.15, 10, 33.02]), 0x1e1f22, 0.9, { lift: 14, side: 1 }));
    root.add(part(benchLeads, 'Dây kẹp cá sấu từ nguồn bàn', 'Đỏ vào cực + domino, đen vào cực −.'));
    const ribbon = new THREE.Group();
    for (let i = 0; i < 6; i++) ribbon.add(makeWire(ctx, W(pk.group, [56, 11, -6.35 + 2.54 * i]), W(bd, [-67.31, 8.5, -7.62 + 2.54 * i]), [0xd23b3b, 0xff8c1a, 0x1e1f22, 0x3fbf5f, 0x3b7dd8, 0x8a9099][i], 0.35, { side: i * 0.4 }));
    root.add(ribbon);
    const mmJack = (k) => W(mm.group, mm.jack[k]);
    let probeWires = [];
    const kill = (m) => { m.parent?.remove(m); m.geometry.dispose(); m.material.dispose(); };
    let probeKey = '';
    function placeProbes(a, b) {   // a, b: [x, z] lỗ trên bo, hoặc null = để nghỉ
      const key = a ? a.join() + b.join() : 'rest';
      if (key === probeKey) return;
      probeKey = key;
      root.updateMatrixWorld(true);
      if (!a) { aimTool(probeR, [118, 3.5, 40], 0.3, 1, 1.45); aimTool(probeB, [128, 3.5, 48], 0.3, 1, 1.45); }
      else { aimTool(probeR, W(bd, [a[0], 3.4, a[1]]), 0.5, 1, 0.5); aimTool(probeB, W(bd, [b[0], 3.4, b[1]]), 0.8, 1, 0.5); }
      probeWires.forEach(kill);
      probeWires = [];
      root.updateMatrixWorld(true);
      for (const [j, pr, col] of [[mmJack('v'), probeR, 0xd23b3b], [mmJack('com'), probeB, 0x1e1f22]]) {
        const e = pr.localToWorld(new THREE.Vector3(0, 78, 0)).toArray();
        const m = makeWire(ctx, null, null, col, 1.0, { points: [j, [j[0], j[1] + 20, j[2]], [(j[0] + e[0]) / 2, 45, (j[2] + e[2]) / 2], e] });
        probeWires.push(m);
        root.add(m);
      }
    }

    // ---------------- hình ảnh cho sự cố
    const blob = mesh(new THREE.SphereGeometry(1.5, 12, 8), tinMat, { x: (X(11) + X(12)) / 2, y: -2.2, z: Z(11) });
    blob.scale.set(1.9, 0.7, 1.1);
    blob.visible = false;
    bd.add(part(blob, 'Cầu thiếc giữa chân 11 (VDD) và 12 (VSS)', 'Thiếc thừa nối 2 pad cạnh nhau = chập nguồn.'));
    const coldMat = new THREE.MeshStandardMaterial({ color: 0x8d9094, roughness: 0.9, metalness: 0.3 });
    const coldJoint = mesh(new THREE.SphereGeometry(1.4, 12, 8), coldMat, { x: 52.07, y: -2.4, z: 33.02 });
    coldJoint.visible = false;
    bd.add(part(coldJoint, 'Mối hàn nguội (xám, hòn bi)', 'Thiếc không thấm vào pad — tiếp xúc chập chờn.'));
    const jumper = makeWire(ctx, null, null, 0xdfe3e6, 0.3, { points: [[-8.89, 0.6, -15.24], [-8.89, 3, -15.24], [-1.27, 3, -15.24], [-1.27, 0.6, -15.24]] });
    jumper.visible = false;
    bd.add(part(jumper, 'Dây nối tắt thay cho trở 330 Ω', 'Không còn gì hạn dòng LED.'));
    const xtalWires = new THREE.Group();
    xtalWires.add(makeWire(ctx, null, null, 0x3b7dd8, 0.3, { points: [[-3.81, 0.5, 15.24], [-3.81, 4, 22], [-3.81, 4, 36], [-3.81, 0.5, 40.64]] }));
    xtalWires.add(makeWire(ctx, null, null, 0x3b7dd8, 0.3, { points: [[1.27, 0.5, 15.24], [1.27, 4, 22], [1.27, 4, 36], [1.27, 0.5, 40.64]] }));
    xtalWires.visible = false;
    bd.add(part(xtalWires, 'Dây nối thạch anh dài 3 cm', 'Thêm điện dung + điện cảm ký sinh và bắt nhiễu → không dao động.'));
    const markMat = new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.85, depthTest: false });
    const marker = new THREE.Mesh(new THREE.TorusGeometry(9, 0.8, 8, 36), markMat);
    marker.rotation.x = Math.PI / 2;
    marker.renderOrder = 10;
    marker.visible = false;
    root.add(marker);
    const FAULT_AT = {
      'pic-nguoc': [SX, 6, 0], 'cau-thiec': [(X(11) + X(12)) / 2, 1, Z(11)], 'han-nguoi': [52.07, 1, 33.02], 'thieu-22pf': [-1.27, 1, 15.24],
      'quen-mclr': [-29.21, 1, 12.7], 'led-khong-tro': [2.54, 1, -15.24], 'thieu-vss31': [X(31), 1, Z(31)],
    };

    // =============================================================== trạng thái
    let curStep = -1, stepT = 99, flipA = 0, P = {}, fault = null, solderList = [];
    const TESTS = [
      ['11↔32 (VDD)', [X(11), Z(11)], [X(32), Z(32)], () => '0.3 Ω bíp ✓'],
      ['12↔31 (VSS)', [X(12), Z(12)], [X(31), Z(31)], () => (fault === 'thieu-vss31' ? 'OL — HỞ ✗' : '0.3 Ω bíp ✓')],
      ['VDD↔GND', [X(11), Z(11)], [X(12), Z(12)], () => (fault === 'cau-thiec' ? '0.1 Ω — CHẬP ✗' : 'bíp ngắn → OL ✓')],
      ['MCLR↔VDD', [X(1), Z(1)], [X(11), Z(11)], () => (fault === 'quen-mclr' ? 'OL — thiếu trở ✗' : '10.0 kΩ ✓')],
      ['ICSP4↔40', [-67.31, 0], [X(40), Z(40)], () => '0.2 Ω ✓'],
      ['ICSP5↔39', [-67.31, 2.54], [X(39), Z(39)], () => '0.2 Ω ✓'],
      ['ICSP1↔1', [-67.31, -7.62], [X(1), Z(1)], () => '0.2 Ω ✓'],
    ];
    const contAll = () => TESTS.map(([n, , , f]) => \`\${n}: \${f()}\`).join(' · ');
    const fresh = () => ({
      V: 0, I: 0, mode: '—', picT: 0, pic: '—', led: false, ledV: 0, iLed: 0, Tchip: AMBIENT, Tled: AMBIENT, Tbr: AMBIENT,
      latch: false, picDead: false, ledDead: false, ledOn: 0, ptcAcc: 0, ptcTrip: false, mclrLow: false, mclrNext: 0.5,
      drop: 0, ft: 0, resets: 0, ev: {}, cont: '—',
    });
    let S = fresh();
    const once = (id, fn) => { if (!S.ev[id]) { S.ev[id] = true; fn(); } };

    function toTray(p) {
      if (p.trayPos) { tray.add(p.holder); p.holder.position.set(...p.trayPos); p.holder.rotation.set(0, 0, 0); p.holder.visible = true; }
      else { bd.add(p.holder); p.holder.visible = false; }
      p.from = null;
    }
    function toBoard(p) {
      bd.add(p.holder);
      p.holder.position.set(p.home[0], p.home[1], p.home[2]);
      p.holder.rotation.set(0, p.home[3], 0);
      p.holder.visible = true;
      p.from = null;
    }
    function startFly(p) {
      p.holder.visible = true;
      if (p.trayPos) { tray.add(p.holder); p.holder.position.set(...p.trayPos); p.holder.rotation.set(0, 0, 0); root.updateMatrixWorld(true); bd.attach(p.holder); }
      else { bd.add(p.holder); p.holder.position.set(p.home[0], p.home[1] + 60, p.home[2]); p.holder.rotation.set(0, p.home[3], 0); }
      p.from = p.holder.position.clone();
    }
    function showJoints(p, on) { for (const j of p.js) { j.visible = on; j.scale.setScalar(on ? 1 : 0.001); } }

    function clearFault() {
      fx.restore(root);
      fault = null;
      byKey.chip.home[3] = 0;
      blob.visible = coldJoint.visible = jumper.visible = xtalWires.visible = marker.visible = false;
      for (const k of ['c22a', 'c22b', 'rmclr', 'r330']) byKey[k].holder.visible = byKey[k].holder.parent === bd || !!byKey[k].trayPos;
      for (const k of ['xtal', 'chip']) if (byKey[k].holder.parent === bd && !byKey[k].from) toBoard(byKey[k]);
      railG2.visible = true;
      const vssJ = byKey.socket.js[30]; if (vssJ) vssJ.visible = curStep > 1;
      byKey.term.js[0].visible = curStep > 7;
      crack.visible = false;
      setLed(ledObj, 0);
    }

    function setStepImpl(i) {
      if (fault) clearFault();
      curStep = i;
      stepT = 0;
      flipA = P.flip ? Math.PI : 0;
      bd.rotation.x = flipA;
      bd.position.y = BOARD_Y + (P.flip ? 32 : 0);
      S = fresh();
      for (const p of parts) {
        if (p.step < i) { toBoard(p); showJoints(p, true); }
        else if (p.step === i) { startFly(p); showJoints(p, false); }
        else { toTray(p); showJoints(p, false); }
        if (p.gh) p.gh.visible = false;
      }
      solderList = parts.filter((p) => p.step === i).flatMap((p) => p.js);
      probeKey = '';
    }

    // =============================================================== điện
    function electrical(dt) {
      const powered = fault ? true : curStep >= 12;
      const chipIn = fault ? true : curStep >= 13 && stepT > 0.8;
      const bench = fault ? P.src === 'bench' : true;
      const programming = !fault && curStep === 13 && stepT > 1.2 && stepT < 4.2;
      if (!powered) { S.V = 0; S.I = 0; S.mode = 'tắt'; S.pic = chipIn ? 'TẮT' : 'chưa cắm chip'; S.led = false; return; }
      S.ft += dt;
      const ilim = bench ? (P.ilim ?? 0.1) : 5.5;
      const Rs = 0.05 + (bench && S.ptcTrip ? 30 : 0);
      const run = S.pic === 'CHẠY ✓';
      const iChip = (V) => {
        if (!chipIn || V < 1.5 || S.picDead) return 0;
        if (fault === 'pic-nguoc') return S.latch ? V / 2 : (0.15 * V) / 5;
        if (programming) return 0.005;
        if (fault === 'thieu-22pf') return 0.0015;
        return run ? 0.007 : 0.002;
      };
      const iLed = (V) => (!S.led || S.ledDead ? 0 : fault === 'led-khong-tro' ? Math.max(0, (V - 2.2) / 45) : Math.max(0, (V - 2.0) / 330));
      const iLoad = (V) => iChip(V) + iLed(V) + (fault === 'cau-thiec' ? V / 0.1 : 0) + V / 1e5;
      const vd = (I) => (bench ? 0.15 + 0.06 * Math.log10(1 + I / 0.001) : 0);
      const solveV = (g) => { let lo = 0, hi = 5; for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (g(m) > 0) hi = m; else lo = m; } return (lo + hi) / 2; };
      let V = solveV((v) => { const I = iLoad(v); return v + vd(I) + I * Rs - 5.0; });
      let I = iLoad(V), mode = bench ? 'nguồn bàn CV' : 'buck robot';
      if (I > ilim) { V = solveV((v) => iLoad(v) - ilim); I = ilim; mode = bench ? 'nguồn bàn CC (giới hạn!)' : 'buck giới hạn dòng'; }
      // mối hàn nguội: thỉnh thoảng mất tiếp xúc vài chục ms
      if (fault === 'han-nguoi') { if (S.drop > 0) { S.drop -= dt; V = 0; I = 0; } else if (Math.random() < dt * 0.7) S.drop = 0.02 + Math.random() * 0.05; }
      if (bench && !S.ptcTrip) { if (I > 1.0) { S.ptcAcc += dt; if (S.ptcAcc > 0.4) { S.ptcTrip = true; once('ptc', () => {}); } } else S.ptcAcc = Math.max(0, S.ptcAcc - dt); }
      S.V = V; S.I = I; S.mode = mode;
      // nhiệt
      const Ic = iChip(V), Il = iLed(V);
      if (fault === 'pic-nguoc' && chipIn && S.ft > 0.2 && V > 3 && !S.picDead) S.latch = true;
      S.Tchip = thermal(S.Tchip, V * Ic * 0.85, 1.5, 47, dt);
      S.Tled = thermal(S.Tled, Il * 2.2, 0.05, 250, dt);
      S.Tbr = thermal(S.Tbr, fault === 'cau-thiec' ? I * I * 0.08 : 0, 0.03, 120, dt);
      if (fault === 'cau-thiec' && S.Tbr > 250) once('cb1', () => { fx.smoke(blob, { size: 5, duration: 6 }); fx.scorch(pf.group, 0.25); });
      if (fault === 'pic-nguoc') {
        if (S.Tchip > 220) once('pn1', () => fx.smoke(chipG, { size: 8, duration: 8 }));
        if (S.Tchip > 300 && !S.picDead) { S.picDead = true; S.latch = false; crack.visible = true; fx.flash(chipG, { size: 16 }); fx.scorch(chipG); }
      }
      // trạng thái PIC
      const wasRun = run || S.pic.startsWith('KHỞI');
      const reset = (why) => { if (wasRun) S.resets++; S.picT = 0; S.pic = \`RESET ↻ (\${why})\`; };
      if (!chipIn) S.pic = 'chưa cắm chip';
      else if (S.picDead) S.pic = 'CHẾT ✗';
      else if (fault === 'pic-nguoc') S.pic = V > 2 ? (S.latch ? 'CẮM NGƯỢC — latch-up!' : 'CẮM NGƯỢC — không chạy') : 'TẮT';
      else if (V < 2) { if (wasRun && fault) S.resets++; S.picT = 0; S.pic = fault === 'han-nguoi' ? 'MẤT NGUỒN (mối hàn nguội)' : 'TẮT'; }
      else if (programming) { S.picT = 0; S.pic = 'ĐANG NẠP (MCLR = 13 V)'; }
      else if (V < 4.0) reset('VDD < 4.0 V');
      else if (fault === 'thieu-22pf') S.pic = 'KHÔNG DAO ĐỘNG — chờ OST mãi';
      else {
        if (fault === 'quen-mclr' && S.ft > S.mclrNext) { S.mclrLow = !S.mclrLow; S.mclrNext = S.ft + (S.mclrLow ? 0.2 + Math.random() * 2 : 0.3 + Math.random() * 3); }
        if (fault === 'quen-mclr' && S.mclrLow) reset('MCLR thả nổi');
        else { S.picT += dt; S.pic = S.picT < 0.0725 ? 'KHỞI ĐỘNG (PWRT 72 ms)' : 'CHẠY ✓'; }
      }
      const ledWas = S.led;
      S.led = S.pic === 'CHẠY ✓' && S.picT % 1 < 0.5;
      if (fault === 'thieu-vss31' && S.led !== ledWas && Math.random() < 0.3) { reset('nảy đất — thiếu VSS 31'); S.led = false; }
      S.iLed = Il;
      if (S.led && !S.ledDead) S.ledOn += dt;
      if (fault === 'led-khong-tro' && !S.ledDead && S.ledOn > 5) {
        S.ledDead = true;
        fx.flash(ledObj.group, { size: 10, color: 0xff6060 }); fx.smoke(ledObj.group, { size: 3, duration: 2 }); fx.scorch(ledObj.group, 0.5);
      }
      S.ledV = S.led ? (fault === 'led-khong-tro' ? Math.max(0, V - Il * 40) : V - 0.36) : 0;
    }

    function applyFault(id) {
      clearFault();
      curStep = 13; stepT = 99;
      for (const p of parts) { toBoard(p); showJoints(p, true); if (p.gh) p.gh.visible = false; }
      solderList = [];
      fault = id;
      S = fresh();
      if (id === 'pic-nguoc') { byKey.chip.home[3] = Math.PI; toBoard(byKey.chip); }
      if (id === 'cau-thiec') blob.visible = true;
      if (id === 'han-nguoi') { byKey.term.js[0].visible = false; coldJoint.visible = true; }
      if (id === 'thieu-22pf') { byKey.c22a.holder.visible = byKey.c22b.holder.visible = false; byKey.xtal.holder.position.set(-1.27, 0, 40.64); xtalWires.visible = true; }
      if (id === 'quen-mclr') byKey.rmclr.holder.visible = false;
      if (id === 'led-khong-tro') { byKey.r330.holder.visible = false; jumper.visible = true; }
      if (id === 'thieu-vss31') { byKey.socket.js[30].visible = false; railG2.visible = false; }
      marker.visible = true;
      S.cont = contAll();
    }

    // =============================================================== hoạt cảnh mỗi khung
    let tDisp = 0;
    function animate(dt) {
      const tempo = P.tempo ?? 1.5;
      stepT += dt * tempo;
      tDisp += dt;
      // linh kiện bay từ khay vào bo theo đường vòng cung
      for (const p of parts) {
        if (!p.from) continue;
        const k = clamp(stepT / 0.8, 0, 1), e = k * k * (3 - 2 * k);
        const [hx, hy, hz] = p.home;
        p.holder.position.set(p.from.x + (hx - p.from.x) * e, p.from.y + (hy - p.from.y) * e + Math.sin(Math.PI * e) * 45, p.from.z + (hz - p.from.z) * e);
        p.holder.quaternion.slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.home[3], 0)), e);
        if (k >= 1) toBoard(p);
      }
      // lật bo + mỏ hàn
      const N = solderList.length, dj = N ? Math.min(0.35, 3.5 / N) : 0, t0 = 1.3, t1 = t0 + N * dj;
      const soldering = N > 0 && stepT > 0.8 && stepT < t1 + 0.15;
      const target = P.flip || soldering ? Math.PI : 0;
      const sp = dt * tempo * 6.3;
      flipA += clamp(target - flipA, -sp, sp);
      bd.rotation.x = flipA;
      bd.position.y = BOARD_Y + (32 * (1 - Math.cos(flipA))) / 2;
      if (N && stepT >= t0 && stepT < t1 + 0.15) {
        const idx = Math.min(N - 1, Math.floor((stepT - t0) / dj));
        solderList.forEach((j, i) => { const g = clamp((stepT - t0 - i * dj - dj * 0.3) / (dj * 0.6), 0, 1); j.visible = g > 0; j.scale.setScalar(Math.max(0.001, g)); });
        const j = solderList[idx];
        iron.visible = true;
        iron.position.set(j.position.x, -1.7, j.position.z);
      } else {
        iron.visible = false;
        if (N && stepT >= t1) solderList.forEach((j) => { j.visible = true; j.scale.setScalar(1); });
      }
      // khung bố trí
      for (const p of parts) if (p.gh) p.gh.visible = (curStep === 0 || P.ghost) && !fault && p.step >= Math.max(1, curStep);
      // thiết bị theo bước
      const showBench = (fault || curStep >= 12) && flipA < 0.05;
      benchLeads.visible = !!showBench;
      ribbon.visible = !fault && curStep === 13 && stepT > 0.9 && flipA < 0.05;
      pk.group.visible = !fault && curStep === 13;
      pk.led.material.emissiveIntensity = S.pic.startsWith('ĐANG NẠP') && Math.sin(tDisp * 20) > 0 ? 2 : 0;
      let meter = '----';
      if (!fault && curStep === 11 && flipA < 0.05) {
        const k = Math.min(TESTS.length - 1, Math.floor(stepT / 1.3));
        placeProbes(TESTS[k][1], TESTS[k][2]);
        S.cont = TESTS.slice(0, k + 1).map(([n, , , f]) => \`\${n}: \${f()}\`).join(' · ');
        meter = TESTS[k][3]().split(' ')[0] === 'bíp' ? '0.0 Ω' : TESTS[k][3]().split(' ')[0] + (TESTS[k][3]().includes('kΩ') ? ' kΩ' : TESTS[k][3]().includes('Ω') ? ' Ω' : '');
      } else if (!fault && curStep === 12 && flipA < 0.05) {
        const a = Math.floor(stepT / 2) % 2 === 0;
        placeProbes(a ? [X(11), Z(11)] : [X(32), Z(32)], a ? [X(12), Z(12)] : [X(31), Z(31)]);
        meter = \`\${S.V.toFixed(2)} V\`;
        S.cont = \`Đo \${a ? '11 ↔ 12' : '32 ↔ 31'}: \${S.V.toFixed(2)} V \${S.V > 4.5 ? '✓' : '✗'}\`;
      } else placeProbes(null, null);
      mm.lcd.set([[meter, '#121810', 1]]);
      const bl = S.V > 0.05;
      bs.lcd.set(bl ? [[\`\${S.V.toFixed(2)} V\`, '#5dff9a', 0.5], [\`\${S.I.toFixed(3)} A\`, S.mode.includes('CC') ? '#ff5a4a' : '#5dff9a', 0.5]] : [['5.00 V', '#2d6b45', 0.5], [\`\${(P.ilim ?? 0.1).toFixed(3)} A\`, '#2d6b45', 0.5]]);
      bs.ledCV.material.emissiveIntensity = bl && !S.mode.includes('CC') ? 1.8 : 0;
      bs.ledCC.material.emissiveIntensity = S.mode.includes('CC') && (fault ? P.src === 'bench' : true) ? 1.5 + Math.sin(tDisp * 12) : 0;
      // LED, nhiệt, đánh dấu
      setLed(ledObj, S.led && !S.ledDead ? (fault === 'led-khong-tro' ? 2.5 : 1) : 0);
      const hot = [[chipG, S.Tchip], [blob, S.Tbr]];
      for (const [o, T] of hot) { const lv = heatLevel(T, 80, 400); if (lv > 0 || o.userData._hot) { fx.heat(o, lv); o.userData._hot = lv > 0; } }
      if (marker.visible && fault) {
        const p = FAULT_AT[fault];
        root.updateMatrixWorld(true);
        const v = bd.localToWorld(new THREE.Vector3(p[0], p[1] + (flipA > 1.5 ? -4 : 0), p[2]));
        root.worldToLocal(v);
        marker.position.copy(v);
        const s = 1 + 0.12 * Math.sin(tDisp * 4);
        marker.scale.set(s, s, s);
      }
    }

    for (const p of parts) toTray(p);   // trạng thái mặc định: bo trống + khay linh kiện

    function jointCount() { let n = 0; for (const p of parts) for (const j of p.js) if (j.visible && j.scale.x > 0.5) n++; return n; }

    return {
      object: root,
      update(dt, t, p) {
        P = p;
        animate(dt);
        electrical(dt);
        const st = curStep < 0 ? 'Chưa bắt đầu — bấm ▶ ở khung "Tháo lắp từng bước"' : \`\${curStep + 1}/\${STEPS.length} — \${STEPS[curStep].title.replace(/^Bước \\d+ — /, '')}\`;
        readout('step', fault ? \`Bo hoàn chỉnh — đang thử sự cố\` : st);
        readout('joints', jointCount());
        readout('cont', S.cont);
        readout('vdd', S.V);
        readout('isup', S.I * 1000);
        readout('mode', S.mode + (S.ptcTrip ? ' · polyfuse ĐÃ NGẮT' : ''));
        readout('pic', S.pic + (S.resets ? \` · reset \${S.resets} lần\` : '') + (S.ledDead ? ' · LED đã chết' : ''));
        readout('temp', \`\${S.Tchip.toFixed(0)} / \${S.Tled.toFixed(0)} / \${S.Tbr.toFixed(0)}\`);
        return [S.V, S.ledV, S.I * 1000];
      },
      setStep(i, p) { if (p) P = p; setStepImpl(Math.max(-1, Math.min(STEPS.length - 1, i))); },
      onAction(id, p) { if (p) P = p; if (id === 'replay' && curStep >= 0) setStepImpl(curStep); },
      triggerFault(id, p) { if (p) P = p; applyFault(id); },
      resetFault(p) { if (p) P = p; if (fault) { clearFault(); S = fresh(); } },
      dispose() { probeWires.forEach(kill); },
    };
  },
};
`;export{n as default};
