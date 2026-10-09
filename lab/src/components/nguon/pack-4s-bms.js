// 🔋 Pack 4S + mạch BMS — 4 cell 18650 nối tiếp bằng kẽm niken, mạch BMS 4S có dây cân bằng B0–B4.
// Mô phỏng: lệch cell, cân bằng bằng điện trở xả (bleed), ngắt quá sạc 4.25 V / quá xả 2.7 V / quá dòng,
// và PIC đọc điện áp pack qua phân áp 33k/10k (VBAT_LOW 13.2 V, VBAT_CUT 12.4 V — firmware/pic16f877a_ccs/config.h).

import { cadAttach, ownMaterial } from '../../core/cadParts.js';

const CAP_AH = 2.5, R_CELL = 0.020;
const OVP = 4.25, OVP_REL = 4.15, UVP = 2.70, UVP_REL = 3.00;
const OCP = 35, SCP = 100;            // quá dòng xả (A), đoản mạch (A)
const BAL_V = 4.18, BAL_OFF = 4.12, R_BAL = 62;   // bật cân bằng ≥ 4.18 V, tắt < 4.12 V (trễ), điện trở xả 62 Ω → ~68 mA
const I_CC = 2.0, V_CV = 16.8, I_END = 0.2;
const T_AMB = 30;

const OCV_T = [[-8, 2.0], [0, 3.0], [5, 3.30], [10, 3.45], [20, 3.56], [30, 3.63], [40, 3.69], [50, 3.75],
  [60, 3.83], [70, 3.92], [80, 4.00], [90, 4.09], [100, 4.20], [106, 4.60]];
function ocv(s) {
  if (s <= OCV_T[0][0]) return OCV_T[0][1];
  for (let i = 1; i < OCV_T.length; i++) {
    const [s1, v1] = OCV_T[i];
    if (s <= s1) { const [s0, v0] = OCV_T[i - 1]; return v0 + ((v1 - v0) * (s - s0)) / (s1 - s0); }
  }
  return OCV_T[OCV_T.length - 1][1];
}
// PIC đọc pin đúng như firmware: ADC 10 bit, Vref 5 V, phân áp 33k/10k, VBAT_MUL 21017
function picRead(v) {
  const adc = Math.max(0, Math.min(1023, Math.round(((v * 10) / 43 / 5) * 1023)));
  return { adc, mv: Math.round((adc * 21017) / 1000) };
}

export default {
  id: 'pack-4s-bms',
  name: 'Pack pin 4S + mạch BMS',
  category: 'nguon',
  order: 2,
  icon: '🔋',
  summary: '4 viên 18650 nối tiếp (12.0–16.8 V) + mạch bảo vệ BMS 4S. Xem dây cân bằng B0–B4, cho một cell bị lệch rồi sạc/xả để thấy BMS ngắt và cân bằng — và vì sao firmware đo cả pack vẫn không đủ.',
  tags: ['4S', 'BMS', 'pack', 'cân bằng', 'balance', 'kẽm niken', 'nickel strip', 'B0', 'B4', 'quá xả', 'quá sạc'],

  params: [
    { id: 'cad', label: '🧊 Mô hình CAD thật (pack 4S1P của robot + XT60 + JST-XH)', type: 'toggle', value: true, hint: 'Tắt = mô hình học tự dựng (BMS phóng to, thấy từng MOSFET & điện trở cân bằng sáng theo trạng thái).' },
    { id: 'mode', label: 'Chế độ', type: 'select', value: 'discharge', options: [['rest', 'Nghỉ (không tải)'], ['discharge', 'Xả — robot đang chạy'], ['charge', 'Sạc 16.8 V / 2 A (CC/CV)']] },
    { id: 'load', label: 'Dòng tải robot', type: 'range', min: 0, max: 45, step: 0.5, value: 3, unit: 'A', hint: 'Robot chạy ~2–3 A; quạt khởi động/chổi kẹt 8–10 A; > 35 A BMS ngắt quá dòng.' },
    { id: 'soc0', label: 'SOC ban đầu (khi bấm Làm lại)', type: 'range', min: 0, max: 100, step: 1, value: 60, unit: '%' },
    { id: 'imb', label: 'Cell 3 lệch so với cell khác', type: 'range', min: -30, max: 30, step: 1, value: 10, unit: '% SOC' },
    { id: 'aged', label: 'Cell 3 đã già (còn 70 % dung lượng, nội trở ×2)', type: 'toggle', value: false },
    { id: 'balance', label: 'BMS có mạch cân bằng', type: 'toggle', value: true },
    { id: 'speed', label: 'Tua nhanh thời gian', type: 'range', min: 1, max: 1200, step: 1, value: 300, unit: '×' },
    { id: 'reset', label: '↺ Làm lại (đặt SOC & độ lệch)', type: 'button' },
  ],
  readouts: [
    { id: 'vpack', label: 'Điện áp pack (P+/P−)', unit: 'V' },
    { id: 'cells', label: 'Cell 1 / 2 / 3 / 4', unit: 'V' },
    { id: 'dv', label: 'Độ lệch cell (max − min)', unit: 'mV' },
    { id: 'i', label: 'Dòng pack (+ xả / − sạc)', unit: 'A' },
    { id: 'bms', label: 'MOSFET sạc / xả', unit: '' },
    { id: 'bal', label: 'Cân bằng (điện trở xả)', unit: '' },
    { id: 'pic', label: 'PIC đọc AN0 (firmware)', unit: '' },
    { id: 'state', label: 'Trạng thái', unit: '' },
  ],
  scope: {
    window: 8,
    note: '(thời gian tua nhanh theo thanh "Tua nhanh"; xung đoản mạch ~300 µs được kéo dài để nhìn thấy, dòng cắt ở 45 A)',
    channels: [
      { name: 'V pack', unit: 'V', min: 10, max: 18, color: '#ffd34d' },
      { name: 'I pack', unit: 'A', min: -5, max: 45, color: '#4cc2ff' },
      { name: 'Cell cao nhất', unit: 'V', min: 2.4, max: 4.6, color: '#ff6b9a' },
      { name: 'Cell thấp nhất', unit: 'V', min: 2.4, max: 4.6, color: '#3fcf8e' },
    ],
  },

  info: {
    overview: `
      <p>Một cell 18650 chỉ có 3.0–4.2 V. Robot cần ~14.4 V nên ghép <b>4 cell nối tiếp (4S)</b>: điện áp cộng lại (12.0–16.8 V), dung lượng giữ nguyên (2.5 Ah). Ghép thêm song song (4S2P) thì dung lượng gấp đôi.</p>
      <p><b>BMS</b> (Battery Management System) là mạch "người gác cổng": đo <b>từng cell</b> qua 5 dây cân bằng B0–B4, ngắt sạc khi bất kỳ cell nào &gt; 4.25 V, ngắt xả khi bất kỳ cell nào &lt; 2.7 V, ngắt khi quá dòng/đoản mạch, và xả bớt cell cao để các cell bằng nhau.</p>
      <p>Thử: để <b>Cell 3 lệch +10 %</b>, chọn <b>Sạc</b> — cell 3 chạm 4.25 V trước, BMS ngắt sạc dù pack chưa tới 16.8 V. Bật/tắt <b>cân bằng</b> để so sánh. Rồi chọn <b>Xả</b>, lệch −20 %: BMS ngắt khi pack vẫn còn ~13 V — trước cả khi PIC thấy "pin yếu".</p>`,
    specs: [
      ['Cấu hình', '4S1P: 4 × INR18650 2.5 Ah → 14.4 V danh định, 2.5 Ah, 36 Wh'],
      ['Điện áp pack', '12.0 V (cạn, 3.0 V/cell) · 14.4–14.8 V danh định · 16.8 V (đầy, 4.2 V/cell)'],
      ['BMS 4S 20 A', 'Ngắt quá sạc 4.25 ±0.025 V (nhả 4.15 V) · quá xả 2.70 V (nhả 3.0 V)'],
      ['Quá dòng / đoản mạch', '≈ 35 A trễ ~10 ms–1 s · &gt; 100 A trễ 200–500 µs'],
      ['Cân bằng', 'Thụ động: điện trở ~62 Ω song song cell, bật khi cell ≥ 4.18 V (tắt dưới 4.12 V) → xả ~68 mA'],
      ['MOSFET', 'Hai nhóm N-MOSFET quay lưng nhau ở cực âm: nhóm SẠC (C) và nhóm XẢ (D)'],
      ['Kẽm nối', 'Niken nguyên chất 0.15 × 8 mm chịu ~10 A; 20 A cần 2 lớp hoặc 0.2 × 10 mm'],
      ['Dây cân bằng', 'JST-XH 5 chân bước 2.5 mm: B0 (−) … B4 (+)'],
    ],
    principle: `
      <h4>1. Nối tiếp: điện áp cộng, dòng như nhau</h4>
      <p><code>V_pack = V1 + V2 + V3 + V4</code>, mọi cell chịu chung dòng <code>I</code>. Mỗi cell: <code>Vi = OCV(SOCi) − I·Ri</code> (Ri ≈ 20 mΩ).</p>
      <h4>2. Vì sao phải đo TỪNG cell?</h4>
      <p>Cell không bao giờ giống hệt nhau (dung lượng lệch 1–3 %, tự xả khác nhau). Sau nhiều chu kỳ, cell yếu nhất xuống thấp nhất khi xả và lên cao nhất khi sạc. Ví dụ pack 16.8 V có thể là <code>4.10 + 4.10 + 4.50 + 4.10</code> — cell 3 đang quá sạc nguy hiểm mà nhìn tổng vẫn "bình thường".</p>
      <h4>3. Cân bằng thụ động (passive balancing)</h4>
      <p>Khi cell ≥ 4.18 V, IC đóng MOSFET nhỏ nối điện trở song song cell: <code>I_bal = V/R = 4.2/62 ≈ 68 mA</code>, tỏa nhiệt <code>P = V²/R ≈ 0.28 W</code>. Để san 10 % của 2.5 Ah (= 250 mAh) cần <code>250/68 ≈ 3.7 giờ</code> — cân bằng thụ động rất chậm, chỉ sửa được lệch nhỏ.</p>
      <h4>4. Ngắt bằng MOSFET ở cực âm</h4>
      <p>Hai nhóm MOSFET nối tiếp quay lưng nhau giữa B− và P−: tắt nhóm "C" thì chặn dòng sạc (vẫn cho xả qua diode thân), tắt nhóm "D" thì chặn dòng xả. Vì vậy khi BMS ngắt, đo P+ vẫn thấy điện áp, nhưng P− "mất".</p>
      <h4>5. PIC đọc pin</h4>
      <p>Phân áp 33k/10k: <code>V_AN0 = V_pack × 10/43</code> → 16.8 V thành 3.91 V. ADC: <code>adc = V_AN0/5 × 1023</code>. Firmware: <code>vbat_mv = adc × 21017 / 1000</code>. Độ phân giải ≈ 21 mV/bước.</p>`,
    inRobot: `
      <ul>
        <li>Theo <code>docs/01</code>: Pin 4S (12.0–16.8 V) → <b>cầu chì 10 A</b> → công tắc chính → VBAT cho DRV8871, quạt, chổi; và qua <b>buck XL4015 → 5 V</b> cho logic.</li>
        <li>PIC chân 2 (RA0/AN0) đo pack. <code>VBAT_LOW_MV = 13200</code> (3.30 V/cell → cờ pin yếu bit2), <code>VBAT_CUT_MV = 12400</code> (3.10 V/cell → dừng hết, bit3).</li>
        <li>Firmware chỉ thấy <b>tổng</b> → nếu một cell lệch thấp, BMS (2.7 V) sẽ cắt trước khi PIC kịp báo; robot "tắt phụt" giữa phòng. Đó là dấu hiệu pack cần cân bằng/thay cell.</li>
        <li>Pin gốc của robot thường đã có BMS bên trong — tận dụng nếu còn tốt (đo từng cell qua đầu nối cân bằng nếu có).</li>
      </ul>`,
    mistakes: `
      <ul>
        <li>Cắm/hàn dây cân bằng sai thứ tự (B4 trước B0) → điện áp lạ đặt lên chân IC → cháy BMS ngay.</li>
        <li>Hàn dây chính P−/B− nhầm chỗ: nối tải vào B− thay vì P− → BMS không bảo vệ được gì.</li>
        <li>Ghép cell lệch áp &gt; 0.05 V hoặc khác lô → pack mất cân bằng nhanh, dung lượng bằng cell kém nhất.</li>
        <li>Dùng kẽm "niken" là thép mạ niken (thử bằng nam châm: hút mạnh = thép) → điện trở gấp 3–5 lần, nóng chảy vỏ PVC khi tải lớn.</li>
        <li>BMS mới lắp không ra điện ở P− → nhiều BMS cần "kích" bằng cách cắm sạc một lần. Không phải hỏng.</li>
        <li>Chọn BMS 10 A cho robot có quạt hút 8 A khởi động → BMS ngắt quá dòng ngẫu nhiên.</li>
      </ul>`,
    quiz: [
      { q: 'Pack 4S đang 15.0 V, các cell: 3.80, 3.80, 3.60, 3.80. Khi sạc, cell nào chạm 4.25 V trước? Khi xả, cell nào chạm 2.7 V trước?', a: 'Đề bài cố ý: cell thấp (3.60 V) có SOC thấp → khi XẢ nó chạm 2.7 V trước. Khi SẠC, nếu nó cũng là cell dung lượng nhỏ thì lại lên nhanh hơn; nếu cùng dung lượng thì các cell cao (3.80 V) chạm 4.25 V trước.' },
      { q: 'Điện trở cân bằng 62 Ω, cell 4.2 V. Dòng xả và thời gian san 100 mAh?', a: 'I = 4.2/62 ≈ 68 mA → 100/68 ≈ 1.5 giờ.' },
      { q: 'PIC đọc ADC = 700. vbat_mv theo firmware là bao nhiêu? Robot đang ở trạng thái nào?', a: '700 × 21017/1000 ≈ 14712 mV ≈ 14.7 V → trên 13.2 V, pin bình thường.' },
    ],
  },

  steps: [
    { title: 'Bước 1 — Chọn & đo 4 cell', text: 'Dùng 4 cell <b>cùng hãng, cùng lô</b>. Sạc đầy riêng từng cell hoặc đưa về cùng điện áp; lệch &lt; 0.05 V (lý tưởng &lt; 0.01 V). Đo nội trở (chênh &lt; 3 mΩ). Dụng cụ: đồng hồ vạn năng, máy đo IR, kính bảo hộ.' },
    { title: 'Bước 2 — Xếp cell đảo chiều xen kẽ', text: 'Xếp + − + − để kẽm nối ngắn nhất. Dùng giá đỡ nhựa (cell holder) hoặc keo nến/băng dính 2 mặt. Đặt <b>vòng giấy cách điện</b> lên mọi đầu dương. Dùng dụng cụ nhựa, tháo nhẫn/đồng hồ kim loại.' },
    { title: 'Bước 3 — Hàn bấm kẽm niken nối tiếp', text: 'Máy hàn điểm (spot welder), kẽm niken nguyên chất 0.15 × 8 mm, mỗi mối 2–4 điểm. Thứ tự: B− (cell 1) → nối 1-2 → 2-3 → 3-4 → B+ (cell 4). <b>Không dùng mỏ hàn thiếc</b> lên cell. Sau mỗi mối, đo điện áp lũy tiến: 3.7 → 7.4 → 11.1 → 14.8 V.' },
    { title: 'Bước 4 — Giấy cách điện + đặt BMS', text: 'Dán giấy cách điện (fish paper) che kín đầu cell và mép kẽm trước khi đặt BMS lên. Cố định BMS bằng băng keo 2 mặt cách điện. Mặt MOSFET hướng ra ngoài để tản nhiệt.' },
    { title: 'Bước 5 — Hàn dây chính: B− trước, rồi P−, B+', text: 'Hàn dây B− (to, đen) từ kẽm cell 1 vào pad B− của BMS. Dây ra tải: P− lấy từ pad <b>P−</b> của BMS (không phải B−!), P+ lấy thẳng từ kẽm B+ của cell 4. Dây silicone 14 AWG cho 20 A, đầu nối XT60.' },
    { title: 'Bước 6 — Dây cân bằng THEO THỨ TỰ B0 → B4', text: 'Hàn 5 dây vào kẽm: B0 = cực âm cell 1, B1 = nối 1-2, B2 = nối 2-3, B3 = nối 3-4, B4 = cực dương cell 4. <b>Trước khi cắm đầu JST vào BMS</b>: đo giữa chân B0 và từng chân phải ra 0 / 3.7 / 7.4 / 11.1 / 14.8 V tăng dần. Nhiều BMS yêu cầu cắm/hàn theo thứ tự B− → B0 → B1 … → B4.' },
    { title: 'Bước 7 — Kích hoạt, kiểm tra, bọc co nhiệt', text: 'Đo P+/P− ≈ tổng điện áp (nếu 0 V: cắm sạc 16.8 V vài giây để "kích" BMS). Thử tải nhỏ, theo dõi từng cell. Bọc màng co nhiệt PVC Ø lớn + tấm nhựa cứng chống va đập. Ghi nhãn: 4S1P 14.4 V 2.5 Ah 36 Wh, ngày đóng.' },
  ],

  faults: [
    { id: 'sai-day-can-bang', label: 'Cắm dây cân bằng sai thứ tự (B4 vào chân B0)', severity: 'chay',
      what: '<p>Vừa cắm đầu JST vào là nghe "tách", khói trắng bốc từ IC bảo vệ và điện trở cân bằng; có mùi khét. BMS từ đó không ra điện hoặc xả lệch một cell.</p>',
      why: '<p>Chân cảm biến cell của IC BMS chỉ chịu ~5–8 V mỗi chân so với chân kề. Đầu nối đảo ngược đặt <code>−16.8 V</code> giữa VDD/VSS của IC: diode bảo vệ bên trong dẫn, dòng chỉ bị giới hạn bởi dây cân bằng (vài chục mΩ) → hàng chục ampe qua chân IC và điện trở 62 Ω (<code>P = 16.8²/62 ≈ 4.5 W</code> trên con trở 1206 chịu 0.25 W) → cháy.</p>',
      fix: '<p>Đo điện áp lũy tiến từng chân bằng đồng hồ trước khi cắm. Dùng đầu JST có khấc một chiều, hàn theo sơ đồ in trên BMS. Rút dây cân bằng <b>trước</b>, cắm lại <b>sau cùng</b> theo thứ tự nhà sản xuất.</p>' },
    { id: 'khong-bms', label: 'Sạc pack lệch cell mà KHÔNG có BMS', severity: 'chay',
      what: '<p>Bộ sạc vẫn báo bình thường (16.8 V), nhưng cell 3 nóng dần, phồng nhẹ, khói, rồi bốc cháy ở cuối quá trình sạc.</p>',
      why: '<p>Bộ sạc chỉ biết tổng 16.8 V. Với cell 3 lệch +15 %: <code>4.07 + 4.07 + 4.60 + 4.07 ≈ 16.8 V</code> → cell 3 bị ép lên ~4.6 V: lithium plating, cực dương nhả oxy, sinh nhiệt → thermal runaway. Không ai ngắt vì không ai đo từng cell.</p>',
      fix: '<p>Pack Li-ion nối tiếp <b>bắt buộc</b> có BMS (hoặc sạc cân bằng từng cell như bộ sạc RC iMAX B6). Sạc trên nền không cháy, có người trông.</p>' },
    { id: 'nguoc-cuc-tai', label: 'Cắm ngược cực P+/P− vào robot', severity: 'no',
      what: '<p>Tia lửa ở đầu nối, tụ hóa 1000 µF đầu driver phồng và nổ "bụp", có thể cháy diode/MOSFET trong driver và buck.</p>',
      why: '<p>Tụ hóa phân cực bị đặt <code>−16.8 V</code>: lớp oxit nhôm bị phá, dòng rò tăng vọt → nước trong điện phân sôi → áp suất bung van/nổ. Đồng thời diode thân của MOSFET trong DRV8871/XL4015 dẫn thuận → gần như đoản mạch; BMS ngắt sau ~300 µs nhưng tụ đã hỏng.</p>',
      fix: '<p>Dùng đầu nối có khóa chiều (XT60/XT30, Deans), dây đỏ/đen đúng chuẩn. Thêm bảo vệ ngược cực: P-MOSFET ở dây dương hoặc diode Schottky + cầu chì.</p>' },
    { id: 'doan-mach', label: 'Chạm dây P+ và P− (đoản mạch đầu ra)', severity: 'nhe',
      what: '<p>Một tia lửa nhỏ "tách" rồi im lặng; pack không ra điện nữa cho tới khi bỏ chỗ chạm (một số BMS cần cắm sạc để nhả).</p>',
      why: '<p>Dòng đoản mạch tiềm năng <code>14.8 V / (4×20 + 10) mΩ ≈ 165 A</code>. BMS đo sụt áp trên shunt/MOSFET, vượt ngưỡng ~100 A trong ~300 µs → tắt MOSFET xả. Năng lượng lọt qua chỉ ~<code>14.8 × 165 × 0.0003 ≈ 0.7 J</code> → chỉ một tia lửa.</p>',
      fix: '<p>BMS là lớp bảo vệ, không phải để thử. Vẫn cần cầu chì 10 A (BMS hỏng thường hỏng ở trạng thái dẫn). Bọc đầu dây trần khi tháo lắp.</p>' },
    { id: 'kem-mong', label: 'Dùng kẽm thép mạ niken mỏng cho dòng 20 A', severity: 'chay',
      what: '<p>Robot chạy được vài phút lúc quạt hút mạnh thì kẽm nối nóng đỏ, vỏ PVC cell co lại, mùi nhựa cháy; điện áp pack sụt mạnh khi tải.</p>',
      why: '<p>Kẽm thép mạ niken 0.1 × 5 mm, dài 20 mm: <code>R = ρL/A ≈ 1.4×10⁻⁷ × 0.02 / 0.5×10⁻⁶ ≈ 5.6 mΩ</code> mỗi mối. Ở 20 A: <code>P = I²R ≈ 2.2 W</code> trên mẩu kim loại 0.1 g → &gt; 150 °C trong vài chục giây. Niken nguyên chất dày 0.15 × 8 mm chỉ ~1.2 mΩ.</p>',
      fix: '<p>Thử kẽm bằng nam châm (niken nguyên chất hút rất yếu), thử nhỏ muối/axit thấy gỉ = thép. Dòng lớn: 2 lớp kẽm hoặc kẽm đồng-niken.</p>' },
    { id: 'cell-lech', label: 'Ghép 1 cell cũ đang 3.2 V với 3 cell 3.9 V', severity: 'loi',
      what: '<p>Robot báo đầy nhưng chạy 10 phút đã tắt phụt giữa phòng. Lúc tắt, PIC vẫn đo ~13 V (chưa tới 12.4 V cắt).</p>',
      why: '<p>Dung lượng pack nối tiếp = cell <b>kém nhất</b>. Cell lệch xuống 2.7 V trước → BMS ngắt xả trong khi 3 cell kia còn 3.6 V: <code>3×3.6 + 2.7 ≈ 13.5 V</code>. Firmware chỉ thấy tổng nên không cảnh báo kịp.</p>',
      fix: '<p>Cân bằng thủ công trước khi ghép (sạc riêng từng cell tới cùng điện áp). Thay cả bộ nếu một cell đã già. Theo dõi chênh lệch qua dây cân bằng.</p>' },
  ],

  build(ctx) {
    const { THREE, MAT, geom, label, readout, fx } = ctx;
    const { mesh, group, part, cyl, box, pcb, wire, smdChip } = geom;
    const root = new THREE.Group();
    const PITCH = 18.6, CY = 9.2, ZE = 33.3;
    const cellX = (i) => (i - 1.5) * PITCH;
    const sleeveColors = [0x2f8f6a, 0x2f8f6a, 0x2f8f6a, 0x2f8f6a];

    // ---------- 4 cell nằm ngang, trục theo Z, đảo chiều xen kẽ ----------
    const cellsG = new THREE.Group();
    root.add(cellsG);
    const cells = [];
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Group();
      const sm = MAT.plasticGreen.clone(); sm.color.set(sleeveColors[i]);
      c.add(mesh(cyl(9.1, 9.1, 64.4, 40, true), sm));
      c.add(mesh(cyl(8.9, 8.9, 0.3, 40), MAT.steel, { y: -32.3 }));
      c.add(mesh(cyl(7.5, 7.5, 0.3, 40), MAT.zinc, { y: 32.3 }));
      c.add(mesh(cyl(3.4, 3.6, 0.8, 32), MAT.zinc, { y: 32.8 }));
      c.add(mesh(new THREE.TorusGeometry(5.6, 0.6, 6, 32), MAT.plasticWhite, { y: 32.6, rx: Math.PI / 2 }));
      const plusFront = i % 2 === 0;                     // cell 1, 3: + về phía +Z
      c.rotation.x = plusFront ? Math.PI / 2 : -Math.PI / 2;
      c.position.set(cellX(i), CY, 0);
      c.userData.home = c.position.clone();
      part(c, `Cell ${i + 1} — INR18650 2.5 Ah`, `Đầu dương hướng ${plusFront ? 'trước (+Z)' : 'sau (−Z)'} — xếp đảo chiều xen kẽ để kẽm nối ngắn. Vòng trắng là giấy cách điện đầu dương.`);
      cellsG.add(c);
      cells.push(c);
    }
    label(cellsG, 'Cell 1 (B0–B1)', [cellX(0), -2, 40]);
    label(cellsG, 'Cell 4 (B3–B4)', [cellX(3), -2, 40]);

    // ---------- kẽm niken ----------
    const strips = new THREE.Group();
    root.add(strips);
    const stripMeshes = [];
    const mkStrip = (x0, x1, z, name, desc) => {
      const w = x1 - x0 + 10;
      const s = mesh(box(w, 8, 0.15), MAT.tin.clone(), { x: (x0 + x1) / 2, y: CY, z });
      stripMeshes.push(s);
      strips.add(part(s, name, desc));
      return s;
    };
    mkStrip(cellX(0), cellX(0), -ZE, 'Kẽm B− (cực âm cell 1)', 'Cực âm của cả pack. Nối dây to vào pad B− của BMS và dây cân bằng B0.');
    mkStrip(cellX(0), cellX(1), ZE, 'Kẽm nối cell 1 → 2 (điểm B1)', 'Cực + cell 1 nối cực − cell 2. Điểm này = 3.7 V so với B−.');
    mkStrip(cellX(1), cellX(2), -ZE, 'Kẽm nối cell 2 → 3 (điểm B2)', 'Điểm này = 7.4 V so với B−.');
    mkStrip(cellX(2), cellX(3), ZE, 'Kẽm nối cell 3 → 4 (điểm B3)', 'Điểm này = 11.1 V so với B−.');
    mkStrip(cellX(3), cellX(3), -ZE, 'Kẽm B+ (cực dương cell 4)', 'Cực dương của cả pack = P+ (đi thẳng ra tải qua cầu chì) và dây cân bằng B4.');

    // ---------- giấy cách điện + BMS ----------
    const fish = mesh(box(76, 0.3, 64), tint(MAT.plasticRed, 0xb5482f), { y: 18.6 });
    root.add(part(fish, 'Giấy cách điện (fish paper)', 'Giấy sợi cách điện chịu nhiệt, ngăn mép kẽm & linh kiện mặt dưới BMS chạm vỏ cell.'));
    const bms = new THREE.Group();
    bms.position.set(0, 20.4, 0);
    root.add(bms);
    bms.add(pcb(56, 45, { mat: MAT.pcbBlue }));
    const icM = smdChip(5, 6.5, 1.4, MAT.icBody.clone()); icM.position.set(-8, 0, 4);
    bms.add(part(icM, 'IC bảo vệ 4S (kiểu S-8254A / HY2840)', 'Đo điện áp từng cell qua B0–B4, so với ngưỡng 4.25 V / 2.70 V, đo sụt áp trên shunt để phát hiện quá dòng → điều khiển cổng 2 nhóm MOSFET.'));
    const chgFets = new THREE.Group(), dsgFets = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const m1 = smdChip(5, 6.2, 1.6, MAT.icBody.clone()); m1.position.set(-21 + k * 6.2, 0, -14);
      const m2 = smdChip(5, 6.2, 1.6, MAT.icBody.clone()); m2.position.set(4 + k * 6.2, 0, -14);
      dsgFets.add(m1); chgFets.add(m2);
    }
    bms.add(part(dsgFets, 'Nhóm MOSFET XẢ (D) — 4 × SOP-8', 'N-MOSFET song song (~4 mΩ mỗi con) giữa B− và P−. Tắt khi quá xả / quá dòng / đoản mạch. Đỏ = đang TẮT.'));
    bms.add(part(chgFets, 'Nhóm MOSFET SẠC (C) — 4 × SOP-8', 'Quay lưng với nhóm XẢ. Tắt khi bất kỳ cell nào > 4.25 V. Đỏ = đang TẮT.'));
    const shunt = group(mesh(box(6.3, 0.6, 3.2), MAT.tin, { x: 18, y: 0.3, z: 6 }), mesh(box(6.3, 0.6, 3.2), MAT.tin, { x: 18, y: 0.3, z: 11 }));
    bms.add(part(shunt, 'Điện trở shunt 2 × 2 mΩ (2512)', 'Dòng 20 A tạo sụt áp 20 mV — IC đo áp này để biết dòng. 100 A → 100 mV → ngắt đoản mạch.'));
    const balR = [];
    for (let k = 0; k < 4; k++) {
      const rr = mesh(box(3.2, 0.6, 1.6), MAT.icBody.clone(), { x: -20 + k * 7, y: 0.3, z: 14 });
      const ends = group(mesh(box(0.5, 0.65, 1.6), MAT.tin, { x: -21.45 + k * 7, y: 0.32, z: 14 }), mesh(box(0.5, 0.65, 1.6), MAT.tin, { x: -18.55 + k * 7, y: 0.32, z: 14 }));
      bms.add(part(group(rr, ends), `Điện trở cân bằng cell ${k + 1} (62 Ω, 1206)`, 'Được đóng vào song song cell khi cell ≥ 4.18 V → xả ~68 mA, nóng ~0.28 W. Sáng cam = đang cân bằng.'));
      balR.push(rr);
    }
    // pad dây lớn
    const padB = mesh(box(7, 0.4, 5), MAT.tin, { x: -20, y: 0.2, z: -20 });
    const padP = mesh(box(7, 0.4, 5), MAT.tin, { x: 0, y: 0.2, z: -20 });
    const padBp = mesh(box(7, 0.4, 5), MAT.tin, { x: 20, y: 0.2, z: -20 });
    bms.add(part(padB, 'Pad B− (cực âm pin)', 'Hàn dây to từ kẽm B− của cell 1. Đây là phía "pin" của MOSFET.'));
    bms.add(part(padP, 'Pad P− (cực âm ra tải & sạc)', 'Dây âm ra robot và bộ sạc PHẢI lấy ở đây — đi qua MOSFET nên mới được bảo vệ.'));
    bms.add(part(padBp, 'Pad B+ (chỉ để đo)', 'Nhiều BMS chỉ cần dây mảnh tới B+ để cấp nguồn IC; dòng chính đi thẳng từ cell 4 ra P+.'));
    // đầu JST-XH 5 chân
    const jst = new THREE.Group();
    jst.add(mesh(box(12.4, 6, 5.8), MAT.plasticWhite, { y: 3 }));
    for (let k = 0; k < 5; k++) jst.add(mesh(box(0.64, 4, 0.64), MAT.tin, { x: -5 + k * 2.5, y: 3.5, z: 0 }));
    jst.position.set(8, 0, 18);
    bms.add(part(jst, 'Đầu cân bằng JST-XH 5 chân (B0…B4)', 'Bước 2.5 mm, có khấc 1 chiều. Chân trái → phải: B0 (−), B1, B2, B3, B4 (+). Cắm SAU CÙNG.'));
    const ledM = mesh(box(1.6, 0.6, 0.8), new THREE.MeshStandardMaterial({ color: 0x113311, emissive: 0x00ff55, emissiveIntensity: 0 }), { x: -2, y: 0.3, z: 10 });
    bms.add(part(ledM, 'LED trạng thái (nếu có)', 'Sáng xanh khi BMS đang cân bằng ở một số mạch.'));
    label(bms, 'Mạch BMS 4S', [0, 6, -4]);

    // ---------- dây ----------
    const wires = new THREE.Group();
    root.add(wires);
    const bmsTop = 20.4 + 0.2;
    const wB = wire([[cellX(0), CY + 3, -ZE - 0.5], [cellX(0) - 2, 22, -ZE - 4], [-20, bmsTop + 2, -24], [-20, bmsTop, -20]], { radius: 1.3, color: 0x111111 });
    wires.add(part(wB, 'Dây B− (14 AWG đen)', 'Từ kẽm B− cell 1 vào pad B−. Hàn dây này ĐẦU TIÊN.'));
    const wPm = wire([[0, bmsTop, -20], [0, bmsTop + 4, -28], [-4, 14, -48], [-4, 10, -58]], { radius: 1.3, color: 0x111111 });
    const wPp = wire([[cellX(3), CY + 3, -ZE - 0.5], [cellX(3) - 3, 24, -38], [10, 16, -50], [4, 10, -58]], { radius: 1.3, color: 0xd23b3b });
    wires.add(part(wPm, 'Dây P− ra tải (đen)', 'Cực âm của robot và bộ sạc — đi qua MOSFET của BMS.'));
    wires.add(part(wPp, 'Dây P+ ra tải (đỏ)', 'Lấy thẳng từ cực + cell 4. Robot: qua cầu chì 10 A rồi công tắc chính.'));
    const xt = group(mesh(box(15.5, 8, 16), MAT.plasticYellow, { y: 10, z: -66 }), mesh(cyl(1.8, 1.8, 6, 16), MAT.gold, { x: -3.6, y: 10, z: -75, rx: Math.PI / 2 }), mesh(cyl(1.8, 1.8, 6, 16), MAT.gold, { x: 3.6, y: 10, z: -75, rx: Math.PI / 2 }));
    wires.add(part(xt, 'Đầu nối XT60 (có khóa chiều)', 'Hình thang vát góc → không cắm ngược được. Chịu 60 A liên tục.'));
    // tụ hóa phía robot (để diễn sự cố ngược cực)
    const capR = group(mesh(cyl(6.3, 6.3, 20, 24), MAT.plasticBlue, { y: 10 }), mesh(cyl(6.0, 6.0, 0.4, 24), MAT.aluminum, { y: 20.2 }));
    capR.position.set(-22, 0, -66);
    wires.add(part(capR, 'Tụ hóa 1000 µF/25 V (đầu driver robot)', 'Tụ lọc đầu nguồn mỗi driver theo docs/01. Tụ hóa có cực tính — đặt ngược sẽ nổ.'));
    // dây cân bằng B0..B4 từ kẽm lên JST
    const balColors = [0x111111, 0xf5c400, 0x2fbf71, 0x3b8ef0, 0xd23b3b];
    const tapPts = [[cellX(0) + 4, -ZE - 0.3], [(cellX(0) + cellX(1)) / 2, ZE + 0.3], [(cellX(1) + cellX(2)) / 2, -ZE - 0.3], [(cellX(2) + cellX(3)) / 2, ZE + 0.3], [cellX(3) - 4, -ZE - 0.3]];
    const balWires = new THREE.Group();
    tapPts.forEach(([x, z], k) => {
      const jx = 8 - 5 + k * 2.5;
      const w = wire([[x, CY + 2, z], [x, 24, z + (z > 0 ? 1 : -1)], [jx, 30, z > 0 ? 26 : -10], [jx, bmsTop + 8, 20], [jx, bmsTop + 5, 18]], { radius: 0.45, color: balColors[k] });
      balWires.add(part(w, `Dây cân bằng B${k}`, ['B0 = cực âm cell 1 (0 V)', 'B1 = nối cell 1-2 (≈3.7 V)', 'B2 = nối cell 2-3 (≈7.4 V)', 'B3 = nối cell 3-4 (≈11.1 V)', 'B4 = cực dương cell 4 (≈14.8 V)'][k] + ' — dây 24–26 AWG, chỉ mang dòng đo & cân bằng.'));
    });
    wires.add(balWires);

    // ---------- màng co nhiệt (bước cuối) ----------
    const shrinkMat = new THREE.MeshStandardMaterial({ color: 0x2a64c8, transparent: true, opacity: 0.35, roughness: 0.3, depthWrite: false });
    const shrink = mesh(box(80, 32, 72, 4), shrinkMat, { y: 14 });
    shrink.visible = false;
    root.add(part(shrink, 'Màng co nhiệt PVC', 'Bọc ngoài cùng, giữ cell & BMS thành khối, chống bụi ẩm.'));

    // ---------- đồng hồ điện áp từng cell (ảo) ----------
    const bars = [];
    const barMats = [];
    for (let i = 0; i < 4; i++) {
      const bm = new THREE.MeshStandardMaterial({ color: 0x3fcf8e, emissive: 0x1f6b3a, emissiveIntensity: 0.5 });
      const b = mesh(box(8, 1, 3), bm, { x: cellX(i), y: 0.5, z: 48 });
      bars.push(b); barMats.push(bm);
      root.add(part(b, `Vạch điện áp cell ${i + 1} (ảo)`, 'Cao 2.5 → 4.4 V. Xanh = an toàn, vàng = gần ngưỡng, đỏ = vượt ngưỡng BMS.'));
    }
    label(root, 'Điện áp từng cell', [0, 2, 56]);

    // ---------- MÔ HÌNH CAD THẬT: pack 4S1P (docs/01 §2) ----------
    // Khung GLB: cell nằm theo trục X, xếp theo Z; XT60 ở −X, đầu cân bằng ở +X. Xoay −90° quanh Y →
    // cell 1 ở x = −27,8 (trùng mô hình học), đầu dương cell 1 hướng +Z, dây chính/XT60 ra phía −Z.
    const anchors = {};
    const subNode = (n, prefix) => { let r = null; n?.traverse((o) => { if (!r && o !== n && o.name.startsWith(prefix)) r = o; }); return r; };
    let cadCells = [], cadWraps = [], cadIns = [], sCells = [], sMain = null, sBal = null, sShrink = null;
    let cadStrips = null, cadBmsParts = null, cadShrink = null, cadVis = {};
    const cad = cadAttach(ctx, root, 'robot/battery-4s1p-pack', {
      rotateY: -Math.PI / 2, onBottom: false, offset: [0, -0.3, 0],
      hide: [cellsG, strips, fish, bms, wB, wPm, wPp, xt, balWires, shrink],
      partDefault: ['Pack pin 4S1P của robot (CAD thật)', 'Mô hình CAD đúng kích thước: 4 × 18650 nối tiếp, kẽm niken, BMS 4S, dây chính 14 AWG + XT60, dây cân bằng JST-XH 5P, bọc co nhiệt.'],
      parts: {
        cell_1: ['Cell 1 — INR18650 2,5 Ah (B0 → B1)', 'Cell ở đáy chuỗi: cực âm là B− của cả pack. Đầu dương hướng về phía đầu cân bằng.'],
        cell_2: ['Cell 2 — INR18650 2,5 Ah (B1 → B2)', 'Đặt đảo chiều so với cell 1 để kẽm nối ngắn nhất.'],
        cell_3: ['Cell 3 — INR18650 2,5 Ah (B2 → B3)', 'Cell "có vấn đề" trong thí nghiệm: lệch SOC / đã già. Phát sáng đỏ = vượt ngưỡng BMS, vàng = gần ngưỡng.'],
        cell_4: ['Cell 4 — INR18650 2,5 Ah (B3 → B4)', 'Cực dương cell 4 = B+ của cả pack, nối thẳng ra dây đỏ P+.'],
        'cap_pos*': ['Núm dương (+) của cell', 'Được hàn điểm kẽm niken; có vòng giấy cách điện bao quanh để kẽm không chạm mép vỏ (−).'],
        'insulator*': ['Vòng giấy cách điện đầu dương', 'Sáng cam = cell này đang được xả cân bằng qua điện trở 62 Ω.'],
        strip_p1: ['Kẽm niken nối cell 1 → 2 (B1)', 'Niken nguyên chất 0,15 × 8 mm hàn bấm điểm. Kẽm thép mạ niken (rẻ) sẽ nóng đỏ ở 20 A.'],
        strip_p2: ['Kẽm niken nối cell 2 → 3 (B2)', 'Điểm giữa pack ≈ 7,4 V so với B−.'],
        strip_p3: ['Kẽm niken nối cell 3 → 4 (B3)', 'Điểm ≈ 11,1 V so với B−.'],
        tab_bneg: ['Tab B− (cực âm pack)', 'Nối dây đen B− lên BMS và dây cân bằng B0.'],
        tab_bpos: ['Tab B+ (cực dương pack)', 'Nối dây đỏ P+ ra tải và dây cân bằng B4.'],
        fish_paper: ['Giấy cách điện (fish paper)', 'Giấy sợi chịu nhiệt bọc quanh khối cell, ngăn mép kẽm chạm vỏ cell bên cạnh.'],
        barley_paper: ['Giấy lúa mạch (barley paper) đỡ BMS', 'Tấm cách điện giữa đầu cell và mặt dưới BMS — linh kiện BMS chạm vỏ cell = chập.'],
        kapton: ['Băng keo Kapton', 'Băng polyimide chịu 260 °C giữ BMS và cách điện.'],
        bms: ['Mạch BMS 4S (bảo vệ + cân bằng)', 'Đo từng cell qua dây cân bằng, ngắt sạc > 4,25 V, ngắt xả < 2,7 V / quá dòng / đoản mạch. Sáng đỏ = MOSFET đang NGẮT, cam = đang cân bằng.'],
        conn_balance: ['Dây + đầu cân bằng JST-XH 5P (B0…B4)', 'Dây 24 AWG từ kẽm của từng cell. Cắm vào bộ sạc cân bằng / máy đo. Kiểm tra thứ tự bằng đồng hồ trước khi cắm.'],
        lead_neg: ['Dây P− (đen, 14 AWG)', 'Cực âm ra robot — lấy từ pad P− của BMS (đi qua MOSFET).'],
        lead_pos: ['Dây P+ (đỏ, 14 AWG)', 'Cực dương ra robot — qua cầu chì 10 A rồi công tắc chính.'],
        conn_main: ['Đầu nối XT60 (đực, phía pin)', 'Hình thang vát góc → không cắm ngược được. Chịu 60 A liên tục. Chân vàng = tiếp điểm.'],
        shrink_wrap: ['Màng co nhiệt PVC bọc pack', 'Lớp ngoài cùng (bước 7): giữ cell + BMS thành khối, chống bụi ẩm, chống va đập.'],
      },
      labels: [['Cell 1 (B0–B1)', 'cell_1', [0, -11, 40]], ['Cell 4 (B3–B4)', 'cell_4', [0, -11, 40]], ['Mạch BMS 4S', 'bms', [0, 6, 0]],
        ['XT60', 'conn_main', [0, 9, 0]], ['JST-XH cân bằng', 'xh_housing', [0, 10, 0]]],
      onLoad(c) {
        const mk = (key) => { const q = c.worldOf(key); if (!q) return null; const o = new THREE.Object3D(); o.position.copy(q); root.add(o); return o; };
        for (let i = 1; i <= 4; i++) anchors['cell' + i] = mk('cell_' + i);
        Object.assign(anchors, { main: mk('conn_main'), bms: mk('bms'), strip: mk('strip_p1'), bal: mk('xh_housing') });
        cadCells = [1, 2, 3, 4].map((i) => c.node('cell_' + i));
        // GLTFLoader đổi tên node trùng (wrap, wrap_1, …) → tìm theo tiền tố bên trong từng cell
        cadWraps = cadCells.map((n) => subNode(n, 'wrap'));
        cadIns = cadCells.map((n) => subNode(n, 'insulator'));
        // bước 1: tách 4 cell ra xa nhau theo trục xếp (GLB Z) — giống mô hình học (×1,9 khoảng cách)
        sCells = cadCells.map((n) => { const w = n && c.worldOf(n); const sl = w && c.slide(n, [0, 0, 1]); return sl ? { sl, z: -w.x } : null; });   // GLB z = −x (sau khi xoay)
        sMain = c.slide('conn_main', [1, 0, 0]);       // manifest: trục cắm XT60 [1,0,0], hành trình 12 mm
        sBal = c.slide('conn_balance', [0, 1, 0]);     // manifest: JST-XH cắm theo [0,1,0], 8 mm
        sShrink = c.slide('shrink_wrap', [0, 1, 0]);   // manifest: màng co nhiệt tháo/lồng theo trục Y
        cadStrips = c.node('nickel_strips');
        cadBmsParts = c.node('bms/bms_parts');
        cadShrink = c.node('shrink_wrap');
        if (cadShrink) cadShrink.traverse((o) => { if (o.isMesh) { const m = ownMaterial(o); m.transparent = true; m.opacity = 0.5; m.depthWrite = false; } });
        for (const k of ['nickel_strips', 'fish_paper', 'barley_paper', 'kapton', 'bms', 'lead_neg', 'lead_pos', 'conn_main', 'conn_balance', 'shrink_wrap']) cadVis[k] = c.node(k);
      },
    });
    let spreadK = 0, mainK = 0, balK = 0, shrinkK = 1, lastVis = null;

    // ---------- trạng thái mô phỏng ----------
    const soc = [60, 60, 70, 60], cap = [CAP_AH, CAP_AH, CAP_AH, CAP_AH], rr = [R_CELL, R_CELL, R_CELL, R_CELL];
    const V = [0, 0, 0, 0], balOn = [false, false, false, false];
    let chgOn = true, dsgOn = true, latch = '', done = false, ovpCell = 0, spikeT = 0, spikeI = 0, lastImb = null, lastAged = null, lastMode = null;
    let fault = null, fT = 0, tStrip = T_AMB, tCell3 = T_AMB, burned = false, smokeAcc = 0, firedCell = false;
    let step = -1;

    function resetPack(p) {
      const s0 = p?.soc0 ?? 60, imb = p?.imb ?? 10;
      for (let i = 0; i < 4; i++) soc[i] = s0;
      soc[2] = Math.max(0, Math.min(100, s0 + imb));
      cap[2] = p?.aged ? CAP_AH * 0.7 : CAP_AH;
      rr[2] = p?.aged ? R_CELL * 2 : R_CELL;
      chgOn = dsgOn = true; latch = ''; done = false;
      lastImb = p?.imb; lastAged = p?.aged;
    }
    resetPack();

    // vị trí từng bước: [tách cell, kẽm, giấy+BMS, dây chính, dây cân bằng, co nhiệt]
    const STEP_VIS = [
      [1, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 1, 0, 0, 0, 0], [0, 1, 1, 0, 0, 0],
      [0, 1, 1, 1, 0, 0], [0, 1, 1, 1, 1, 0], [0, 1, 1, 1, 1, 1],
    ];

    return {
      object: root,
      onAction(id, p) { if (id === 'reset') resetPack(p); },
      setStep(i) { step = i; },
      triggerFault(id, p) {
        fault = id; fT = 0; burned = false; firedCell = false; smokeAcc = 0; tStrip = T_AMB; tCell3 = T_AMB;
        resetPack(p);
        if (id === 'khong-bms') { for (let i = 0; i < 4; i++) soc[i] = 80; soc[2] = 95; }
        if (id === 'cell-lech') { for (let i = 0; i < 4; i++) soc[i] = 75; soc[2] = 12; }
        const onCad = cad.active;
        const xtAt = onCad && anchors.main ? anchors.main : xt, jstAt = onCad && anchors.bms ? anchors.bms : jst;
        if (id === 'doan-mach') fx.sparks(xtAt, { count: 25, speed: 35, size: 0.9 });
        if (id === 'nguoc-cuc-tai') { fx.sparks(xtAt, { count: 60, speed: 50, size: 1.1 }); fx.flash(xtAt, { size: 40 }); }
        if (id === 'sai-day-can-bang') { fx.sparks(jstAt, { count: 30, speed: 25, size: 0.6 }); fx.flash(jstAt, { size: 20, color: 0xfff1c0 }); }
      },
      resetFault(p) { fault = null; fT = 0; burned = false; firedCell = false; tStrip = T_AMB; tCell3 = T_AMB; resetPack(p); },
      update(dt, t, p) {
        fT += dt;
        if (!fault && (p.imb !== lastImb || p.aged !== lastAged)) resetPack(p);
        if (p.mode !== lastMode) { if (lastMode !== null && latch === 'ocp') { latch = ''; dsgOn = true; } done = false; lastMode = p.mode; }

        // ---- tháo lắp ----
        const vis = step < 0 ? [0, 1, 1, 1, 1, 0] : STEP_VIS[Math.min(step, STEP_VIS.length - 1)];
        const k = 1 - Math.pow(0.003, dt);
        cells.forEach((c, i) => { const tx = c.userData.home.x * (vis[0] ? 1.9 : 1); c.position.x += (tx - c.position.x) * k; });
        strips.visible = !!vis[1]; fish.visible = !!vis[2]; bms.visible = !!vis[2];
        wB.visible = wPm.visible = wPp.visible = !!vis[3];
        balWires.visible = !!vis[4]; shrink.visible = !!vis[5];
        // ---- CAD: cùng các bước, chạy trên node thật ----
        const cadOn = cad.sync(p);
        if (cadOn) {
          for (const o of [cellsG, strips, fish, bms, wB, wPm, wPp, xt, balWires, shrink]) o.visible = false;
          const vk = vis.join('');
          if (vk !== lastVis) {
            if (lastVis !== null) {
              if (vis[3] && lastVis[3] === '0') mainK = 1;      // dây chính vừa hàn → XT60 trượt vào vị trí
              if (vis[4] && lastVis[4] === '0') balK = 1;       // dây cân bằng vừa hàn → đầu JST hạ xuống
              if (vis[5] && lastVis[5] === '0') shrinkK = 1;    // màng co nhiệt lồng từ trên xuống
            }
            lastVis = vk;
          }
          spreadK += ((vis[0] ? 1 : 0) - spreadK) * k;
          mainK += (0 - mainK) * k * 0.6; balK += (0 - balK) * k * 0.6; shrinkK += (0 - shrinkK) * k * 0.5;
          sCells.forEach((q) => q?.sl.set(0.9 * q.z * spreadK));
          sMain?.set(-12 * mainK); sBal?.set(8 * balK); sShrink?.set(45 * shrinkK);
          const show = { nickel_strips: vis[1], fish_paper: vis[2], barley_paper: vis[2], kapton: vis[2], bms: vis[2],
            lead_neg: vis[3], lead_pos: vis[3], conn_main: vis[3], conn_balance: vis[4], shrink_wrap: vis[5] };
          for (const [n, v] of Object.entries(show)) if (cadVis[n]) cadVis[n].visible = !!v;
        }
        capR.position.set(cadOn ? -24 : -22, 0, cadOn ? -122 : -66);

        // ---- chế độ & sự cố ----
        let mode = p.mode, load = p.load, useBms = true, spd = p.speed;
        if (fault === 'khong-bms') { mode = 'charge'; useBms = false; spd = 600; }
        if (fault === 'cell-lech') { mode = 'discharge'; load = 3; spd = 600; }
        if (fault === 'doan-mach') { mode = 'discharge'; load = fT < 0.05 ? 165 : 0; spd = 1; }
        if (fault === 'nguoc-cuc-tai') { mode = 'discharge'; load = fT < 0.05 ? 160 : 0; spd = 1; if (fT > 0.05 && !burned) { burned = true; fx.pop(capR, { force: 45, size: 10 }); } }
        if (fault === 'kem-mong') { mode = 'discharge'; load = 20; spd = 1; }
        if (fault === 'sai-day-can-bang') { useBms = false; mode = 'rest'; if (!burned && fT > 0.3) { burned = true; fx.smoke(cad.active && anchors.bms ? anchors.bms : icM, { size: 10, duration: 6, color: 0xdddddd }); fx.scorch(icM, 0.9); if (cad.active && cadBmsParts) fx.scorch(cadBmsParts, 0.8); balR.forEach((b) => fx.scorch(b, 0.8)); } }

        // ---- dòng pack ----
        let ocvSum = 0, rSum = 0.01;          // 10 mΩ = MOSFET + shunt + kẽm
        for (let i = 0; i < 4; i++) { ocvSum += ocv(soc[i]); rSum += rr[i]; }
        let I = 0;
        if (mode === 'discharge' && dsgOn) I = load;
        if (mode === 'charge' && chgOn && !done) {
          I = -Math.min(I_CC, Math.max(0, (V_CV - ocvSum) / rSum));
          if (-I < I_END && ocvSum > 16.0) { done = true; I = 0; }
        }
        for (let i = 0; i < 4; i++) V[i] = ocv(soc[i]) - I * rr[i];

        // ---- logic BMS ----
        const vmax = Math.max(...V), vmin = Math.min(...V);
        const rawI = I;
        if (useBms && fault !== 'sai-day-can-bang') {
          if (I > SCP) { dsgOn = false; latch = 'scp'; spikeT = 0.25; spikeI = rawI; }
          else if (I > OCP) { dsgOn = false; latch = 'ocp'; }
          else if (I > 0 && vmin < UVP) { dsgOn = false; latch = 'uvp'; }
          if (I < 0 && vmax > OVP) { chgOn = false; latch = 'ovp'; ovpCell = V.indexOf(vmax); }
          // nhả quá sạc khi chính cell vừa vượt ngưỡng tụt dưới 4.15 V (nhờ nghỉ / điện trở cân bằng)
          if (!chgOn && latch === 'ovp' && ocv(soc[ovpCell]) < OVP_REL) { chgOn = true; latch = ''; done = false; }
          if (!dsgOn && latch === 'uvp' && mode === 'charge') { dsgOn = true; latch = ''; }
          if (!dsgOn && latch === 'uvp' && Math.min(...soc.map(ocv)) > UVP_REL) { dsgOn = true; latch = ''; }
          if (!dsgOn && latch === 'scp' && load < SCP && fault !== 'doan-mach' && fault !== 'nguoc-cuc-tai') { dsgOn = true; latch = ''; }
        }
        if ((mode === 'discharge' && !dsgOn) || (mode === 'charge' && !chgOn)) {
          I = 0; for (let i = 0; i < 4; i++) V[i] = ocv(soc[i]);
        }

        // ---- cân bằng & tích phân SOC ----
        const sim = dt * spd;
        for (let i = 0; i < 4; i++) {
          const oc = ocv(soc[i]);
          balOn[i] = p.balance && useBms && fault !== 'sai-day-can-bang' && mode !== 'discharge' && (oc >= BAL_V || (balOn[i] && oc > BAL_OFF));
          const iBal = balOn[i] ? ocv(soc[i]) / R_BAL : 0;
          soc[i] -= ((I + iBal) / (cap[i] * 3600)) * 100 * sim;
          soc[i] = Math.max(-8, Math.min(106, soc[i]));
        }

        // ---- nhiệt & hiệu ứng sự cố ----
        if (fault === 'kem-mong') {
          const Pk = I * I * 0.0056;            // một mối kẽm thép mạ niken
          tStrip += ((Pk - (tStrip - T_AMB) / 60) / 0.04) * dt;   // mẩu kẽm 0.09 g → ~0.04 J/K, nhiệt trở về cell ~60 K/W (thời gian thực)
          tStrip = Math.min(tStrip, 400);
          stripMeshes.forEach((s) => fx.heat(s, (tStrip - 80) / 250));
          if (cadOn && cadStrips) fx.heat(cadStrips, (tStrip - 80) / 250);
          if (tStrip > 160) { smokeAcc += dt; if (smokeAcc > 1) { smokeAcc = 0; fx.smoke(cadOn && anchors.strip ? anchors.strip : stripMeshes[1], { size: 6, duration: 1.2, color: 0xcfcfcf }); } }
        }
        if (fault === 'khong-bms') {
          const v3 = V[2];
          const Pp = v3 > 4.3 ? (v3 - 4.3) * 60 : 0;   // phản ứng phụ khi quá sạc
          tCell3 += ((Pp - (tCell3 - T_AMB) / 20) / 45) * sim;
          if (tCell3 > 130) tCell3 += 40 * dt;
          tCell3 = Math.min(tCell3, 600);
          fx.heat(cells[2], (tCell3 - 50) / 150);
          if (cadOn && cadCells[2]) fx.heat(cadCells[2], (tCell3 - 50) / 150);
          const c3 = cadOn && anchors.cell3 ? anchors.cell3 : cells[2];
          if (tCell3 > 90 && tCell3 < 160) { smokeAcc += dt; if (smokeAcc > 1) { smokeAcc = 0; fx.smoke(c3, { size: 8, duration: 1.5, color: 0xe0e0e0 }); } }
          if (tCell3 > 160 && !firedCell) { firedCell = true; fx.fire(c3, { size: 12, duration: 8 }); fx.smoke(c3, { size: 20, duration: 10, color: 0x555555 }); }
          if (firedCell) { I = 0; }
        }

        // ---- hình ảnh BMS ----
        dsgFets.children.forEach((m) => { m.material.emissive.setRGB(dsgOn ? 0 : 0.9, 0, 0); m.material.emissiveIntensity = 0.8; });
        chgFets.children.forEach((m) => { m.material.emissive.setRGB(chgOn ? 0 : 0.9, 0, 0); m.material.emissiveIntensity = 0.8; });
        if (fault !== 'sai-day-can-bang') balR.forEach((b, i) => { b.material.emissive.setRGB(balOn[i] ? 1 : 0, balOn[i] ? 0.45 : 0, 0); b.material.emissiveIntensity = 1; });
        ledM.material.emissiveIntensity = balOn.some(Boolean) && Math.floor(t * 2) % 2 ? 1.2 : 0;
        if (cadOn) {
          // BMS thật: đỏ = có nhóm MOSFET đang ngắt, cam nhấp nháy = đang xả cân bằng
          const balAny = balOn.some(Boolean);
          if (cadBmsParts && fault !== 'sai-day-can-bang') {
            if (!dsgOn || !chgOn) cad.glow(cadBmsParts, 0xff1a1a, 0.7);
            else cad.glow(cadBmsParts, 0xff8a1a, balAny ? 0.35 + 0.3 * Math.sin(t * 6) : 0);
          }
          for (let i = 0; i < 4; i++) {
            if (cadIns[i]) cad.glow(cadIns[i], 0xff8a1a, balOn[i] ? 0.8 : 0);
            if (!cadWraps[i] || (fault === 'khong-bms' && i === 2)) continue;
            const bad = V[i] > OVP || V[i] < UVP, near = V[i] > 4.15 || V[i] < 3.2;
            cad.color(cadWraps[i], bad ? 0xd83030 : near ? 0xe8a020 : null);              // vỏ cell: đỏ = vượt ngưỡng BMS, vàng = gần ngưỡng
            cad.glow(cadWraps[i], bad ? 0xff2020 : 0xffa020, bad ? 0.35 + 0.25 * Math.sin(t * 8) : near ? 0.12 : 0);
          }
        }
        for (let i = 0; i < 4; i++) {
          const h = Math.max(0.3, ((V[i] - 2.5) / 1.9) * 30);
          bars[i].scale.y = h; bars[i].position.y = h / 2;
          const c = V[i] > OVP || V[i] < UVP ? [1, 0.2, 0.2] : V[i] > 4.15 || V[i] < 3.2 ? [1, 0.8, 0.2] : [0.25, 0.8, 0.55];
          barMats[i].color.setRGB(...c); barMats[i].emissive.setRGB(c[0] * 0.4, c[1] * 0.4, c[2] * 0.4);
        }

        // ---- số đo ----
        let vpack = V[0] + V[1] + V[2] + V[3];
        if (fault === 'sai-day-can-bang') vpack = 0;
        if (fault === 'nguoc-cuc-tai') vpack = -vpack;
        const pr = picRead(Math.max(0, vpack));
        const picState = pr.mv < 6000 ? 'chưa nối pin' : pr.mv < 12400 ? 'CẮT HẾT (bit3)' : pr.mv < 13200 ? 'PIN YẾU (bit2)' : 'bình thường';
        const names = { ovp: 'quá sạc', uvp: 'quá xả', ocp: 'quá dòng', scp: 'ĐOẢN MẠCH' };
        let st;
        if (fault === 'sai-day-can-bang') st = '💥 IC BMS cháy — pack không ra điện';
        else if (fault === 'khong-bms') st = firedCell ? '🔥 Cell 3 thermal runaway!' : `Không BMS: cell 3 = ${V[2].toFixed(2)} V, ${tCell3.toFixed(0)} °C (tua 600×)`;
        else if (fault === 'nguoc-cuc-tai') st = '💥 Ngược cực: tụ đầu driver nổ; BMS ngắt đoản mạch';
        else if (fault === 'doan-mach') st = fT < 0.05 ? '⚡ 165 A!' : '✓ BMS ngắt đoản mạch sau ~300 µs';
        else if (fault === 'kem-mong') st = `Kẽm thép mạ niken ${tStrip.toFixed(0)} °C @ 20 A`;
        else if (latch) st = `BMS NGẮT: ${names[latch]}${latch === 'uvp' && pr.mv > 12400 ? ' — PIC vẫn tưởng pin còn!' : ''}${latch === 'ovp' && balOn.some(Boolean) ? ' — đang xả cân bằng cell cao' : ''}`;
        else if (done) st = '✓ Sạc xong (dòng < 0.2 A)';
        else if (mode === 'charge') st = -I >= I_CC - 0.01 ? 'Sạc CC 2 A' : 'Sạc CV 16.8 V (dòng giảm dần)';
        else if (mode === 'discharge') st = I > 20 ? '⚠️ Vượt dòng định mức BMS 20 A' : 'Đang xả';
        else st = 'Nghỉ';

        readout('vpack', vpack);
        readout('cells', V.map((v) => v.toFixed(2)).join(' / '));
        readout('dv', (vmax - vmin) * 1000);
        spikeT -= dt;
        const iShow = spikeT > 0 ? spikeI : I;     // giữ xung đoản mạch trên màn hình một chút cho mắt kịp thấy
        readout('i', iShow);
        readout('bms', `${chgOn ? 'C: BẬT' : 'C: TẮT'} · ${dsgOn ? 'D: BẬT' : 'D: TẮT'}`);
        readout('bal', balOn.some(Boolean) ? balOn.map((b, i) => (b ? `#${i + 1}` : '')).filter(Boolean).join(' ') + ' ~68 mA' : 'không');
        readout('pic', `adc ${pr.adc} → ${pr.mv} mV · ${picState}`);
        readout('state', st);
        return [Math.max(10, Math.min(18, vpack)), Math.max(-5, Math.min(45, iShow)), Math.min(4.6, vmax), Math.max(2.4, vmin)];
      },
    };

    function tint(m, c) { const x = m.clone(); x.color.set(c); return x; }
  },
};
