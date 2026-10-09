// 🛞 Module bánh xe hoàn chỉnh: bánh Ø70 lốp gai + động cơ DC + hộp số 3 tầng (i = 62.5) + encoder Hall
//    + lò xo treo + công tắc nhấc bánh, tất cả trong một tay đòn xoay. Có chế độ "tháo tung" (exploded view).
// Mô phỏng (thời gian thực, 60 bước con mỗi khung):
//   Động cơ:  I = (V − Ke·ω_m)/R ;  J·dω_m/dt = Kt·I − T_ms − F·r/(i·η)
//   Trượt:    λ = (ω_b·r − v)/max(|ω_b·r|, |v|, 0.05) ;  F = μ·N·tanh(λ/0.06)   (đường cong bám kiểu Pacejka rút gọn)
//   Thân xe:  M·dv/dt = F − C_rr·N − F_cản
//   Tốc độ vành bánh v_b = n·π·D/60 ; encoder 16 xung/vòng động cơ × 62.5 = 1 000 xung/vòng bánh.

import { cadAttach, ownMaterial } from '../../core/cadParts.js';

const R_W = 35;              // bán kính bánh (mm)
const I_RATIO = 62.5;        // 5 × 2.5 × 5
const ETA = 0.78;            // hiệu suất hộp số 3 tầng
const RM = 7.0, KE = 0.011, JM = 2.0e-6, TFRIC = 0.0012;   // động cơ RS-360 như trang "Động cơ DC"
const PPR = 16;              // xung encoder / vòng động cơ
const M_Q = 1.8;             // khối lượng robot quy về 1 bánh (kg) — robot 3.6 kg / 2 bánh
const N_FLOOR = 16;          // lực ép bánh xuống sàn do lò xo (N)
const LW = 62;               // chốt xoay → tâm bánh (mm)
const S_MAX = 28;            // hành trình bánh
const Y_TOP = 8;
const FLOORS = {
  go: { name: 'Sàn gỗ / gạch khô', mu: 0.8, crr: 0.015, color: 0xa4825c },
  tham: { name: 'Thảm lông ngắn', mu: 0.65, crr: 0.07, color: 0x6f6a8f },
  uot: { name: 'Gạch men ướt / có bụi mịn', mu: 0.25, crr: 0.015, color: 0xcfd8de },
};

const phiOf = (s) => Math.asin((Y_TOP - s) / LW);

// ---- mô hình CAD thật robot/wheel-module (khung GLB: Y lên, mm; trục bánh dọc X, bánh ở z = 0, chốt xoay tay đòn
//      trùng trục động cơ tại (y 40, z 50); bánh răng m0.5 trục dọc X). Đặt rotateY(−90°): −Z(GLB, phía trước) → +X lab.
const CAD_DROP = 12 * Math.PI / 180;     // góc thõng tối đa của tay đòn (manifest: hinge 12°)
const CAD_SW = 8 * Math.PI / 180;        // công tắc nhả ở 8°
const CAD_STAGES = [[10, 40], [12, 36], [12, 40], [14, 44]];          // (bánh nhỏ, bánh lớn) từng cặp — như cad/src/robot/rlib/wheel.py
const CAD_I = CAD_STAGES.reduce((a, [p, g]) => a * g / p, 1);         // ≈ 125.7
/** Tâm trục 5 bánh răng (pinion, gear_1, gear_2, gear_3, gear_out) theo khung GLB (mm) — cùng công thức a = m(z1+z2)/2 của file CAD */
function cadGearAxes() {
  const m = 0.5, P0 = [-50, 40], r = Math.PI / 180;                   // toạ độ CAD (y, z)
  const d = CAD_STAGES.map(([a, b]) => (m * (a + b)) / 2);
  const P1 = [P0[0] + d[0] * Math.cos(-12 * r), P0[1] + d[0] * Math.sin(-12 * r)];
  const P2 = [P1[0] + d[1] * Math.cos(14 * r), P1[1] + d[1] * Math.sin(14 * r)];
  const P4 = [0, 35];
  const dx = P4[0] - P2[0], dz = P4[1] - P2[1], D = Math.hypot(dx, dz);
  const a = (d[2] ** 2 - d[3] ** 2 + D ** 2) / (2 * D), h = Math.sqrt(Math.max(d[2] ** 2 - a * a, 0));
  const mx = P2[0] + (a * dx) / D, mz = P2[1] + (a * dz) / D;
  const c1 = [mx + (h * dz) / D, mz - (h * dx) / D], c2 = [mx - (h * dz) / D, mz + (h * dx) / D];
  const P3 = c1[1] < c2[1] ? c1 : c2;
  return [P0, P1, P2, P3, P4].map(([y, z]) => [0, z, -y]);           // CAD Z-up → GLB Y-up
}
/** Tên + mô tả tiếng Việt cho từng node GLB (dùng cho cả bản lắp và bản tháo rời) */
const CAD_PARTS = {
  tyre: ['Lốp cao su Ø70 × 22', 'Lốp gai chữ V ôm la-zăng. Hệ số ma sát μ của lốp với sàn quyết định lực kéo tối đa F = μ·N.'],
  hub: ['La-zăng nhựa (ổ bánh)', 'Có gân tăng cứng; lỗ giữa ăn khớp trục ra của hộp số.'],
  axle: ['Trục bánh thép Ø4', 'Trục ra của hộp số: bánh răng ra (44 răng) và bánh xe cùng quay trên trục này.'],
  arm_pivot: ['Tay đòn = nửa trong vỏ hộp số', 'Cả hộp số + động cơ + bánh là MỘT tay đòn, xoay quanh chốt trùng trục động cơ. Lò xo ép tay đòn xuống để bánh bám sàn.'],
  lid_gearbox: ['Nắp hộp số (nửa ngoài)', 'Bắt vào tay đòn bằng 6 vít PT 2.6; giữ đầu các trục bánh răng. Tháo vít rồi kéo thẳng ra (+25 mm).'],
  gear_motor_pinion: ['Bánh răng con trên trục động cơ (z = 10, m = 0.5)', 'Ép chặt trên trục Ø2.3 của động cơ — quay nhanh nhất (bằng tốc độ động cơ).'],
  gear_1: ['Bánh răng kép 1 (40/12)', 'Cặp 1: 40/10 = 4. Bánh nhỏ 12 răng đúc liền dẫn cặp 2. Quay ngược chiều bánh con.'],
  gear_2: ['Bánh răng kép 2 (36/12) + trục encoder', 'Cặp 2: 36/12 = 3. Đầu trục mang đĩa nam châm encoder.'],
  gear_3: ['Bánh răng kép 3 (40/14)', 'Cặp 3: 40/12 = 3.33. Bánh nhỏ 14 răng dẫn bánh răng ra.'],
  gear_out: ['Bánh răng ra (z = 44) trên trục bánh', 'Cặp 4: 44/14 = 3.14 → tổng i = 4 × 3 × 3.33 × 3.14 ≈ 125.7. Quay cùng bánh xe.'],
  gear_pins: ['Trục thép Ø1.6 của bánh răng kép', 'Ép vào tay đòn, đầu kia lọt vào lỗ trên nắp. Tra mỡ silicone/PTFE mỏng.'],
  can: ['Vỏ động cơ RS-360 (stator)', 'Động cơ DC chổi than 14.4 V bắt vào nắp hộp số; trục xuyên qua nắp vào bánh răng con.'],
  endcap: ['Nắp sau động cơ + chổi than', 'Giữ 2 chổi than carbon. Hai cực hàn dây M+ / M− (nên có tụ 100 nF chống nhiễu).'],
  term_pos: ['Cực (+) động cơ', 'Hàn dây M+ từ giắc 7 chân.'],
  term_neg: ['Cực (−) động cơ', 'Hàn dây M− từ giắc 7 chân.'],
  mark_pos: ['Chấm đỏ cực (+)', 'Đánh dấu cực dương để nối đúng chiều quay.'],
  shaft: ['Trục động cơ Ø2.3', 'Quay bằng tốc độ động cơ; bánh răng con ép ở đầu trục.'],
  motor_plate: ['Đai thép giữ động cơ', 'Kẹp động cơ vào nắp hộp số đồng trục với chốt xoay tay đòn.'],
  encoder_magnet: ['Đĩa nam châm encoder', 'Gắn ở đầu trục bánh răng kép 2; mỗi cặp cực N/S đi qua cảm biến Hall tạo 1 xung.'],
  hall_pcb: ['Bo mạch encoder Hall', 'Bo nhỏ đặt sát đĩa nam châm (~1 mm). Đừng bẻ cong — xa quá là mất xung.'],
  hall_sensor: ['Cảm biến Hall', 'Ngõ ra open-collector → cần trở kéo lên 10 kΩ → RA4/T0CKI (bánh trái) của PIC.'],
  hall_passives: ['Tụ + trở trên bo encoder', 'Lọc nguồn và kéo lên cho cảm biến Hall.'],
  conn_wheel_header: ['Đế giắc JST ZH 7 chân', 'Hàn trên bo encoder: MOT+, MOT−, HALL_GND, HALL_OUT, HALL_VCC, SW_A, SW_B.'],
  conn_wheel_pins: ['Chân giắc', 'Bước 1.5 mm (JST ZH).'],
  plug_housing: ['Giắc cắm JST ZH 7 chân', 'Bóp lẫy rồi kéo thân giắc (+X 6 mm) — không kéo dây.'],
  wire_1: ['Dây MOT+', 'Nguồn động cơ từ DRV8871.'],
  wire_2: ['Dây MOT−', 'Nguồn động cơ từ DRV8871.'],
  wire_3: ['Dây HALL_GND', 'Mass encoder.'],
  wire_4: ['Dây HALL_OUT', 'Xung encoder → RA4/T0CKI (trái) / RC0/T1CKI (phải).'],
  wire_5: ['Dây HALL_VCC', 'Nguồn 5 V cho cảm biến Hall.'],
  wire_6: ['Dây SW_A', 'Công tắc nhấc bánh → RB1 (trái) / RB2 (phải).'],
  wire_7: ['Dây SW_B', 'Chân còn lại của công tắc nhấc bánh (nối GND).'],
  spring: ['Lò xo kéo treo bánh', 'Dài tự do 24 mm, lắp 21 mm: ép tay đòn xuống → bánh bám sàn ~16 N. Bánh thõng → lò xo giãn.'],
  frame: ['Khung module (cố định với vỏ robot)', 'Bắt vào vỏ đáy robot bằng 3 vít PT 3×8; có tai giữ chốt xoay và đế công tắc.'],
  pivot_pin: ['Chốt xoay tay đòn Ø3', 'Đồng trục với động cơ → khi bánh nhún, bánh răng con không đổi khoảng cách ăn khớp.'],
  body: ['Công tắc nhấc bánh (micro-switch)', 'Đóng khi bánh chịu tải; tay đòn thõng quá 8° thì nhả → PIC đọc RB1 và dừng động cơ.'],
  plunger: ['Nút bấm công tắc', 'Hành trình ~0.6 mm.'],
  lever: ['Cần gạt công tắc', 'Vấu trên tay đòn tì vào cần này khi bánh chạm sàn.'],
  lever_pin: ['Chốt cần gạt', 'Trục xoay của cần gạt.'],
  term_com: ['Chân COM công tắc', 'Chân chung.'],
  term_no: ['Chân NO (thường hở)', 'Đóng khi cần bị ấn.'],
  term_nc: ['Chân NC (thường đóng)', 'Mở khi cần bị ấn.'],
};

export default {
  id: 'banh-xe',
  name: 'Module bánh xe hoàn chỉnh',
  category: 'co-khi',
  order: 4,
  icon: '🛞',
  summary: 'Cả một "chân" của robot trong một khối: động cơ, hộp số 1:62.5, encoder Hall, lò xo, công tắc nhấc bánh và bánh cao su Ø70. Tháo tung từng chi tiết, chạy thử trên 3 loại sàn để thấy trượt bánh và sai số quãng đường.',
  tags: ['bánh xe', 'wheel module', 'encoder', 'hall', 'trượt', 'slip', 'odometry', 'hộp số', 'lốp'],

  params: [
    { id: 'cad', label: '🧊 Mô hình CAD thật (module bánh Roborock S5)', type: 'toggle', value: true, hint: 'Tắt = mô hình học tự dựng (hộp số 3 tầng 1:62.5, vỏ trong suốt)' },
    { id: 'exgl', label: '🧩 Hình tháo rời CAD (exploded, tĩnh)', type: 'toggle', value: false, hint: 'Hiện bản CAD đã tách rời từng chi tiết theo đúng thứ tự lắp ráp (cần bật Mô hình CAD thật)' },
    { id: 'duty', label: 'Duty PWM (CCP1 → DRV8871)', type: 'range', min: 0, max: 100, step: 1, value: 60, unit: '%' },
    { id: 'floor', label: 'Loại sàn', type: 'select', value: 'go', options: Object.entries(FLOORS).map(([k, f]) => [k, f.name]) },
    { id: 'push', label: 'Lực cản thêm (vướng ngưỡng cửa, kéo dây)', type: 'range', min: 0, max: 20, step: 0.5, value: 0, unit: 'N' },
    { id: 'lift', label: 'Nhấc robot lên', type: 'toggle', value: false },
    { id: 'explode', label: 'Tháo tung (exploded view)', type: 'range', min: 0, max: 1, step: 0.01, value: 0, unit: '' },
    { id: 'slow', label: 'Làm chậm hình 3D', type: 'select', value: '10', options: [['1', '1× (thật)'], ['10', '10×'], ['50', '50×']] },
    { id: 'zero', label: '↺ Xóa bộ đếm encoder', type: 'button' },
  ],
  readouts: [
    { id: 'nm', label: 'Tốc độ động cơ', unit: 'vòng/phút' },
    { id: 'nw', label: 'Tốc độ bánh', unit: 'vòng/phút' },
    { id: 'vw', label: 'Tốc độ vành bánh v = n·π·D', unit: 'm/s' },
    { id: 'v', label: 'Tốc độ robot thật', unit: 'm/s' },
    { id: 'slip', label: 'Độ trượt λ', unit: '%' },
    { id: 'i', label: 'Dòng động cơ', unit: 'A' },
    { id: 'cnt', label: 'Xung encoder (Timer0)', unit: 'xung' },
    { id: 'fp', label: 'Tần số xung encoder', unit: 'Hz' },
    { id: 'odo', label: 'Sai số quãng đường (odometry)', unit: '%' },
    { id: 'rb1', label: 'Công tắc nhấc bánh RB1', unit: '' },
  ],
  scope: {
    window: 4,
    note: '(vật lý thời gian thực · kênh Hall vẽ chậm 200× · hình 3D chậm theo lựa chọn)',
    channels: [
      { name: 'v vành bánh', unit: 'm/s', min: 0, max: 1.2, color: '#4cc2ff' },
      { name: 'v robot', unit: 'm/s', min: 0, max: 1.2, color: '#3fcf8e' },
      { name: 'Dòng I', unit: 'A', min: 0, max: 2.2, color: '#ffd34d' },
      { name: 'Hall (chậm 200×)', unit: 'V', min: -0.5, max: 5.5, color: '#ff6b9a' },
    ],
  },

  steps: [
    { title: 'Bước 0 — Module bánh lắp hoàn chỉnh', text: 'Tắt công tắc chính, <b>rút giắc pin</b>. Lật ngửa robot trên khăn. Dụng cụ: tua vít PH1 + PH0, que nạy nhựa, nhíp, khay ngăn, bút đánh dấu, điện thoại chụp ảnh. Module bánh trái/phải thường giống nhau nhưng <b>đối xứng gương</b> — dán nhãn "T"/"P".' },
    { title: 'Bước 1 — Tháo module khỏi vỏ robot', text: 'Thường 2–3 vít PT 3×10 giữ module vào vỏ đáy. Nhấc module ra <b>từ từ</b> vì còn dây: rút giắc 6 chân (2 dây động cơ + 3 dây encoder VCC/GND/tín hiệu + 1 dây công tắc nhấc bánh). Bóp lẫy giắc, kéo thân giắc — <b>không kéo dây</b>.' },
    { title: 'Bước 2 — Tháo bánh xe', text: 'Bánh gắn vào trục ra có vát D, giữ bằng 1 vít giữa hoặc ép chặt. Gỡ sạch tóc/chỉ quấn ở khe giữa bánh và vỏ (thủ phạm số 1 làm bánh nặng, hao pin). Lốp cao su mòn trơn → thay lốp, không cần thay cả module.' },
    { title: 'Bước 3 — Mở nắp hộp số', text: 'Tháo 4–5 vít PT 2.6 quanh vỏ; tách 2 nửa bằng que nạy ở các lẫy cài. Nhấc <b>thẳng</b> nắp, chụp ảnh vị trí bánh răng ngay.' },
    { title: 'Bước 4 — Rút động cơ + đĩa encoder', text: 'Động cơ bắt 2 vít M2. Đĩa nam châm encoder ép ở đuôi trục động cơ, cảm biến Hall hàn trên bo nhỏ cách đĩa ~0.5–1 mm: <b>đừng bẻ cong</b> bo/khoảng cách này — xa quá là mất xung.' },
    { title: 'Bước 5 — Lấy bánh răng, kiểm tra', text: 'Xếp bánh răng theo thứ tự trên khay. Soi răng mẻ, mòn; lau mỡ cũ, tra mỡ silicone/PTFE mới mỏng. Đo điện trở động cơ (≈ 7 Ω), quay tay đo xung encoder bằng đồng hồ/máy hiện sóng.' },
    { title: 'Bước 6 — Lắp lại & thử', text: 'Lắp ngược lại từ trong ra ngoài: bánh răng → động cơ → nắp (xoay tay thử trơn) → lò xo + công tắc → bánh. Bắt module vào robot, cắm giắc. Thử: nhấc robot → RB1 = 0; quay tay bánh 10 vòng → đếm ≈ 10 000 xung.' },
  ],
  faults: [
    { id: 'toc-quan', label: 'Tóc quấn chặt trục bánh', severity: 'loi',
      what: '<p>Robot chạy chậm, lệch hướng về phía bánh bị quấn, hao pin nhanh; dòng động cơ tăng gấp đôi, động cơ ấm lên. Lâu ngày tóc ăn vào bạc trục, mòn rơ.</p>',
      why: '<p>Tóc xoắn thành sợi cứng chèn giữa la-zăng và vỏ, tạo mô-men ma sát ~0.15 N·m ở trục bánh. Quy về động cơ: <code>0.15/(62.5 × 0.78) ≈ 3 mN·m</code> — tương đương thêm ~0.28 A, đúng bằng gấp đôi dòng chạy bình thường.</p>',
      fix: '<p>Vệ sinh khe bánh mỗi 1–2 tuần (dùng nhíp, dao cắt nhỏ). Firmware: theo dõi dòng/duty — duty cao mà tốc độ thấp là dấu hiệu tải bất thường.</p>' },
    { id: 'mat-encoder', label: 'Lỏng dây encoder (mất xung)', severity: 'loi',
      what: '<p>Bộ đếm Timer0 <b>đứng yên</b> dù bánh vẫn quay. Bộ điều khiển PID tưởng bánh chưa chạy nên tăng PWM lên 100 % → robot lao nhanh bất thường; ESP32 tính odometry = 0 → bản đồ sai hoàn toàn, có thể báo lỗi "STUCK".</p>',
      why: '<p>Vòng điều khiển kín dựa trên phản hồi. Mất phản hồi = sai số luôn lớn = tích phân (I) tăng mãi đến bão hòa (integral windup).</p>',
      fix: '<p>Firmware kiểm tra hợp lý: duty &gt; 30 % trong 0.5 s mà không có xung → dừng, báo lỗi encoder. Phần cứng: giắc có lẫy khóa, trở kéo lên 10 kΩ cho RA4 (open-drain), dây xoắn tránh nhiễu.</p>' },
    { id: 'lop-mon', label: 'Lốp mòn trơn + sàn bụi mịn', severity: 'nhe',
      what: '<p>Robot quay bánh nhưng tiến chậm, đặc biệt khi tăng tốc hoặc vượt ngưỡng; quãng đường tính từ encoder lớn hơn thực tế → bản đồ bị "giãn", robot quay sai góc.</p>',
      why: '<p>Lực bám tối đa <code>F = μ·N</code>. Gai lốp mòn + bụi làm μ giảm ~50 %. Khi lực kéo cần &gt; μ·N, bánh trượt: <code>v_vành &gt; v_robot</code>, encoder đếm cả phần trượt.</p>',
      fix: '<p>Thay lốp; ESP32 có thể bù bằng IMU (con quay hồi chuyển) để phát hiện trượt; tăng tốc từ từ (ramp) để lực kéo không vượt μ·N.</p>' },
  ],

  info: {
    overview: `
      <p>Robot hút bụi dùng 2 <b>module bánh xe</b> độc lập (lái vi sai — differential drive). Mỗi module là một khối thay thế được gồm:</p>
      <ul>
        <li><b>Động cơ DC</b> 14.4 V → <b>hộp số</b> 3 tầng (1:62.5) → <b>bánh Ø70</b> lốp cao su gai chữ V.</li>
        <li><b>Encoder Hall</b>: đĩa nam châm 32 cực trên đuôi trục động cơ + cảm biến Hall → 16 xung/vòng động cơ = 1 000 xung/vòng bánh.</li>
        <li><b>Tay đòn + lò xo</b> ép bánh xuống sàn; <b>công tắc nhấc bánh</b> báo khi bánh thõng.</li>
      </ul>
      <p>Thử: chọn <b>Gạch men ướt</b>, kéo duty lên 100 % và thêm <b>Lực cản</b> 10 N — bánh quay tít nhưng robot gần như đứng yên (trượt), sai số odometry tăng vọt. Kéo <b>Tháo tung</b> để xem bên trong.</p>`,
    specs: [
      ['Bánh xe', 'Ø70 × 22 mm, lốp cao su gai chữ V, la-zăng nhựa'],
      ['Động cơ', 'DC chổi than RS-360, 14.4 V, ≈ 12 000 vòng/phút không tải, dòng kẹt ≈ 2 A'],
      ['Hộp số', '3 tầng 10→50 · 12→30 · 10→50 → i = 5 × 2.5 × 5 = 62.5, η ≈ 78 %'],
      ['Tốc độ bánh', '≈ 140 vòng/phút ở 9 000 vòng/phút động cơ → 0.51 m/s (robot thường chạy 0.3 m/s)'],
      ['Encoder', 'Hall 1 kênh, 16 xung/vòng động cơ → 1 000 xung/vòng bánh → 0.22 mm/xung'],
      ['Hành trình treo', '≈ 28 mm, lò xo ép ~16 N'],
      ['Giắc nối', '6 chân: M+, M−, VCC 5 V, GND, ENC, SW (công tắc)'],
      ['Khối lượng', '≈ 180–220 g mỗi module'],
    ],
    principle: `
      <h4>1. Tốc độ: từ vòng/phút ra m/s</h4>
      <p>Một vòng bánh đi được chu vi <code>π·D</code>. Vậy <code>v = n·π·D / 60</code> (n vòng/phút, D mét). Ví dụ 140 vòng/phút × π × 0.07 / 60 ≈ <b>0.51 m/s</b>.</p>
      <h4>2. Encoder → quãng đường (odometry)</h4>
      <p><code>mm/xung = π·D / (PPR × i) = π·70 / (16 × 62.5) ≈ 0.22 mm</code>. Quãng đường = số xung × 0.22 mm. Tần số xung <code>f = n_động_cơ/60 × 16</code> (≈ 2.4 kHz ở 9 000 vòng/phút) — đủ chậm để Timer0 của PIC đếm bằng phần cứng.</p>
      <h4>3. Lực bám & trượt</h4>
      <p>Lực kéo tối đa giữa lốp và sàn: <code>F_max = μ·N</code> (N = lực lò xo ép bánh ≈ 16 N). Độ trượt <code>λ = (v_vành − v_robot)/v_vành</code>. Lực kéo tăng theo λ rồi bão hòa ở μ·N (mô hình <code>F = μ·N·tanh(λ/0.06)</code>).</p>
      <ul>
        <li>Sàn gỗ μ ≈ 0.8 → F_max ≈ 13 N · Thảm μ ≈ 0.65 nhưng cản lăn lớn · Gạch ướt μ ≈ 0.25 → chỉ 4 N!</li>
      </ul>
      <h4>4. Động cơ chịu tải qua hộp số</h4>
      <p>Lực kéo F ở vành bánh tạo mô-men <code>F·r</code> ở trục bánh, quy về động cơ <code>F·r/(i·η)</code>. Dòng <code>I = (V − Ke·ω)/R</code> tăng khi tải tăng.</p>`,
    inRobot: `
      <ul>
        <li><b>Bánh TRÁI</b>: PWM từ RC2/CCP1 (chân 17) + chiều RD0 → DRV8871 trái; encoder → <b>RA4/T0CKI (chân 6)</b>, cần trở kéo lên 10 kΩ; công tắc nhấc bánh → <b>RB1 (chân 34)</b>.</li>
        <li><b>Bánh PHẢI</b>: PWM RC1/CCP2 (chân 16) + chiều RD2; encoder → <b>RC0/T1CKI (chân 15)</b>; công tắc → <b>RB2 (chân 35)</b>.</li>
        <li>PIC gửi số xung lên ESP32 (bản tin STATUS 50 Hz) → ESP32 tính odometry với khoảng cách 2 bánh 235 mm.</li>
        <li>Khi robot gốc của bạn khác: đo D bằng thước kẹp, quay tay bánh 10 vòng để đếm xung/vòng thật rồi sửa <code>config.h</code>.</li>
      </ul>`,
    mistakes: `
      <ul>
        <li>Lắp nhầm module trái sang phải (đối xứng gương) → bánh quay ngược chiều lệnh, robot xoay vòng tại chỗ. Sửa bằng đảo dây động cơ <b>và</b> kiểm tra lại chiều encoder.</li>
        <li>Cấp encoder Hall bằng 3.3 V khi nó cần 5 V (hoặc ngược lại) → không có xung / xung chập chờn.</li>
        <li>Không có trở kéo lên cho RA4 (open-drain) → Timer0 không đếm được.</li>
        <li>Tưởng "bánh quay = robot chạy" — trên sàn trơn bánh trượt, odometry sai. Luôn kiểm tra trên sàn thật.</li>
        <li>Để tóc quấn lâu ngày → mòn bạc, bánh rơ lắc, kêu "tạch tạch".</li>
      </ul>`,
    quiz: [
      { q: 'Bánh Ø70 mm quay 120 vòng/phút. Robot chạy bao nhiêu m/s (không trượt)?', a: 'v = 120 × π × 0.07 / 60 ≈ 0.44 m/s.' },
      { q: 'Encoder 16 xung/vòng động cơ, hộp số 1:62.5, bánh Ø70. Một xung ứng với bao nhiêu mm?', a: '1 vòng bánh = 16 × 62.5 = 1000 xung, đi π × 70 ≈ 219.9 mm → ≈ 0.22 mm/xung.' },
      { q: 'Vì sao trên sàn ướt robot dễ quay sai góc dù encoder vẫn đếm đúng số vòng bánh?', a: 'μ nhỏ → bánh trượt: vành bánh quay nhiều hơn quãng đường thật. Encoder đo vòng bánh, không đo chuyển động thật của robot → odometry sai, góc quay (tính từ hiệu 2 bánh) sai.' },
    ],
  },

  build(ctx) {
    const { THREE, MAT, geom, label, readout, fx } = ctx;
    const { mesh, group, part, cyl, box, lathe, gearGeometry, arcSector, springGeometry, wire } = geom;
    const root = new THREE.Group();

    // ================= SÀN (cố định, các vạch trôi theo tốc độ robot) =================
    const floorMat = MAT.plasticGrey.clone();
    const floor = mesh(box(260, 3, 80), floorMat, { y: -1.5, z: -12 });
    root.add(part(floor, 'Sàn nhà', 'Đổi loại sàn ở bảng Thí nghiệm. Các vạch trên sàn trôi theo tốc độ THẬT của robot — so với vành bánh để thấy trượt.'));
    const stripes = new THREE.Group();
    const stripeMat = MAT.plasticDark.clone();
    for (let i = 0; i < 13; i++) stripes.add(mesh(box(4, 0.4, 80), stripeMat, { x: -130 + i * 20, y: 0.2, z: -12 }));
    stripes.children.forEach((c) => (c.userData.noCut = true));
    root.add(stripes);

    // ================= KHUNG MODULE (cố định với vỏ robot) =================
    const frame = new THREE.Group();        // gốc = chốt xoay tay đòn
    frame.position.x = -LW;
    root.add(frame);
    const bracket = group(
      mesh(box(120, 3, 34, 1), MAT.plasticDark, { x: 35, y: 36, z: -27 }),
      mesh(box(10, 40, 4), MAT.plasticDark, { x: 0, y: 17, z: -46 }),
      mesh(cyl(2.5, 2.5, 40, 16), MAT.steel, { z: -26, rx: Math.PI / 2 }),
    );
    frame.add(part(bracket, 'Khung module + chốt xoay', 'Phần cố định bắt vít vào vỏ đáy robot (2–3 vít PT 3×10). Chốt thép làm trục xoay cho cả tay đòn.'));
    const seat = mesh(cyl(6, 6, 3, 24), MAT.plasticDark, { x: 32, y: 33, z: -24 });
    frame.add(part(seat, 'Đế tựa lò xo', 'Đầu trên lò xo tì vào đây.'));

    // công tắc nhấc bánh (cố định trên khung, phía sau chốt)
    const sw = new THREE.Group();
    sw.position.set(-22, 13, -24);
    const lever = new THREE.Group();
    lever.position.set(5.5, -3.4, 0);
    lever.add(mesh(box(13, 0.4, 4), MAT.steel, { x: -6.5 }));
    sw.add(part(group(mesh(box(12.8, 6.5, 5.8, 0.4), MAT.plasticBlack), mesh(box(1.6, 1.2, 2.2), MAT.plasticRed, { x: -2, y: -3.6 })),
      'Công tắc nhấc bánh (micro-switch)', 'Đuôi tay đòn ấn cần gạt khi bánh thõng hết → nối dây SW xuống GND → RB1 (bánh trái) / RB2 (bánh phải) = 0.'));
    sw.add(lever);
    frame.add(sw);

    // giắc nối 6 chân + bó dây
    const conn = group(
      mesh(box(14, 6, 5, 0.5), MAT.plasticWhite, { x: 92, y: 33, z: -40 }),
      wire([[92, 30, -40], [80, 22, -50], [40, 18, -62], [12, 6, -62]], { radius: 1.2, color: 0x222222 }),
    );
    frame.add(part(conn, 'Giắc 6 chân + bó dây', 'M+ / M− (động cơ), VCC / GND / ENC (encoder Hall), SW (công tắc nhấc bánh). Rút bằng cách bóp lẫy, không kéo dây.'));

    // ================= TAY ĐÒN (xoay quanh chốt) =================
    const arm = new THREE.Group();
    frame.add(arm);
    const HX0 = -20, HX1 = 85, HCX = (HX0 + HX1) / 2, HL = HX1 - HX0;
    const housingIn = mesh(box(HL, 32, 11.5, 2), MAT.plasticGrey, { x: HCX, z: -30.25 });
    arm.add(part(housingIn, 'Vỏ hộp số — nửa trong', 'Nhựa ABS; có lỗ bắt động cơ và các trục thép bánh răng ép chặt.'));
    const coverMat = MAT.plasticGrey.clone();
    coverMat.transparent = true; coverMat.opacity = 0.35; coverMat.depthWrite = false;
    const cover = mesh(box(HL, 32, 11.5, 2), coverMat, { x: HCX, z: -18.75 });
    cover.userData.noCut = true;
    arm.add(part(cover, 'Vỏ hộp số — nửa ngoài (nắp, vẽ trong suốt)', 'Ghép với nửa trong bằng 4–5 vít PT 2.6 và lẫy cài. Nhìn xuyên để thấy bánh răng.'));

    // --- bánh răng (trục Z) ---
    const M = [14, 6], A = [M[0] + 15, M[1]], OUT = [LW, 0];
    // tìm tâm B sao cho |AB| = 12.6 (m0.6: 12+30) và |B OUT| = 24 (m0.8: 10+50)
    const d = Math.hypot(OUT[0] - A[0], OUT[1] - A[1]), r1 = 12.6, r2 = 24;
    const aa = (r1 * r1 - r2 * r2 + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, r1 * r1 - aa * aa));
    const ux = (OUT[0] - A[0]) / d, uy = (OUT[1] - A[1]) / d;
    const B = [A[0] + aa * ux - hh * uy, A[1] + aa * uy + hh * ux];
    const gearAxes = [M, A, B, OUT].map(([x, y]) => { const g = new THREE.Group(); g.position.set(x, y, 0); arm.add(g); return g; });
    const mkGear = (z, m, w, zPos, mat, ang) => {
      const geo = gearGeometry({ teeth: z, module: m, width: w, bore: 0.8 });
      geo.rotateX(Math.PI / 2);               // trục bánh răng → trục Z
      const g = mesh(geo, mat, { z: zPos });
      g.rotation.z = ang;
      return g;
    };
    // pha ăn khớp: răng bánh dẫn hướng về bánh bị dẫn (quy ước góc quanh trục Z sau khi xoay)
    const dirTo = (P, Q) => Math.atan2(Q[1] - P[1], Q[0] - P[0]);
    const pitchAng = (z) => (2 * Math.PI) / z;
    // sau rotateX(+π/2): răng i có tâm tại góc (i+0.3)·bước, rãnh tại (i+0.8)·bước (đo quanh +Z, chiều dương thông thường)
    // → bánh dẫn đặt 1 răng hướng về bánh bị dẫn, bánh bị dẫn đặt 1 rãnh hướng ngược lại: răng lọt vào rãnh.
    const gMat2 = MAT.plasticWhite.clone(); gMat2.color.set(0xe8dcc0);
    const gMat3 = MAT.plasticWhite.clone(); gMat3.color.set(0x3a3d42);
    const a1 = dirTo(M, A), a2 = dirTo(A, B), a3 = dirTo(B, OUT);
    const g0 = mkGear(10, 0.5, 3, -21, MAT.brass, a1 - 0.3 * pitchAng(10));
    const gA = group(mkGear(50, 0.5, 3, -21, MAT.plasticWhite, a1 + Math.PI - 0.8 * pitchAng(50)), mkGear(12, 0.6, 4, -25, MAT.plasticWhite, a2 - 0.3 * pitchAng(12)));
    const gB = group(mkGear(30, 0.6, 4, -25, gMat2, a2 + Math.PI - 0.8 * pitchAng(30)), mkGear(10, 0.8, 5, -30, gMat2, a3 - 0.3 * pitchAng(10)));
    const gO = group(mkGear(50, 0.8, 5, -30, gMat3, a3 + Math.PI - 0.8 * pitchAng(50)), mesh(cyl(2.5, 2.5, 40, 16), MAT.steel, { z: -14, rx: Math.PI / 2 }));
    gearAxes[0].add(part(g0, 'Bánh răng con trên trục động cơ (z = 10, đồng thau)', 'Quay bằng tốc độ động cơ (~9 000 vòng/phút).'));
    gearAxes[1].add(part(gA, 'Bánh răng kép 1 (50/12)', 'Tầng 1: 50/10 = 5. Bánh nhỏ 12 răng đúc liền dẫn tầng 2.'));
    gearAxes[2].add(part(gB, 'Bánh răng kép 2 (30/10)', 'Tầng 2: 30/12 = 2.5. Bánh nhỏ 10 răng m = 0.8 dẫn tầng 3.'));
    gearAxes[3].add(part(gO, 'Bánh răng ra (z = 50, m = 0.8) + trục ra', 'Tầng 3: 50/10 = 5 → tổng 62.5. Trục ra Ø5 có vát D xuyên ra ngoài gắn bánh xe.'));

    // --- động cơ + encoder (trục Z, nhô vào phía trong robot) ---
    const motorG = new THREE.Group();
    motorG.position.set(M[0], M[1], 0);
    arm.add(motorG);
    const motorBody = group(
      mesh(cyl(10, 10, 30, 40), MAT.steel, { z: -51, rx: Math.PI / 2 }),
      mesh(cyl(10, 10, 3, 40), MAT.plasticWhite, { z: -67.5, rx: Math.PI / 2 }),
      mesh(box(1.5, 4, 0.5), MAT.brass, { x: 4, y: 9, z: -69 }),
      mesh(box(1.5, 4, 0.5), MAT.brass, { x: -4, y: 9, z: -69 }),
    );
    motorG.add(part(motorBody, 'Động cơ DC RS-360 (14.4 V)', 'Bắt vào vỏ hộp số bằng 2 vít M2. Hàn tụ 100 nF giữa 2 cực để chống nhiễu.'));
    const encDisc = new THREE.Group();
    encDisc.position.z = -71;
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2;
      const seg = mesh(arcSector(2, 6.5, a, a + (Math.PI * 2) / 32, 1.6, 4), k % 2 ? MAT.magnetN : MAT.magnetS);
      seg.rotation.x = Math.PI / 2;
      encDisc.add(seg);
    }
    motorG.add(part(encDisc, 'Đĩa nam châm encoder (32 cực = 16 cặp N/S)', 'Ép ở đuôi trục động cơ. Mỗi cặp cực đi qua cảm biến Hall tạo 1 xung → 16 xung/vòng động cơ.'));
    const hallPcb = group(
      mesh(box(16, 1.2, 10), MAT.pcbGreen, { y: 10, z: -71 }),
      mesh(box(3, 1.2, 1.6), MAT.icBody, { y: 9, z: -71 }),
    );
    motorG.add(part(hallPcb, 'Cảm biến Hall + bo nhỏ', 'IC Hall (kiểu A3144/OH137) cách đĩa nam châm ~1 mm. Ngõ ra open-collector: cần trở kéo lên → 0/5 V vào RA4/T0CKI (bánh trái) hoặc RC0/T1CKI (bánh phải).'));

    // --- bánh xe (gắn trên trục ra) ---
    const wheelG = new THREE.Group();
    wheelG.position.set(LW, 0, 0);
    arm.add(wheelG);
    const wheelSpin = new THREE.Group();
    wheelG.add(wheelSpin);
    const tyreG = new THREE.Group();
    const tyreGeo = lathe([[29, -11], [33.2, -11], [34.5, -9], [34.5, 9], [33.2, 11], [29, 11]], 72);
    tyreGeo.rotateX(Math.PI / 2);
    tyreG.add(mesh(tyreGeo, MAT.rubber));
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      for (const sg of [1, -1]) {
        // gai chữ V: xoắn quanh trục hướng kính (rx) rồi đặt theo góc a (rz) → thứ tự 'ZYX'
        const b = mesh(box(3, 1.5, 9), MAT.rubber, { x: Math.cos(a) * 34.8, y: Math.sin(a) * 34.8, z: sg * 5, rz: a, rx: sg * 0.55 });
        b.rotation.order = 'ZYX';
        tyreG.add(b);
      }
    }
    wheelSpin.add(part(tyreG, 'Lốp cao su gai chữ V (Ø70 × 22)', 'Gai chữ V bám thảm và tự đẩy rác ra hai bên. Hệ số ma sát μ quyết định lực kéo tối đa F = μ·N.'));
    const rim = group(
      mesh(cyl(29, 29, 18, 48), MAT.plasticWhite, { rx: Math.PI / 2 }),
      ...[0, 1, 2, 3, 4].map((k) => mesh(box(4, 40, 2), MAT.plasticGrey, { z: 9.5, rz: (k * Math.PI) / 5 })),
      mesh(cyl(5, 5, 4, 24), MAT.zinc, { z: 10, rx: Math.PI / 2 }),
    );
    wheelSpin.add(part(rim, 'La-zăng nhựa + vít giữa', 'Lỗ vát D ăn khớp trục ra. Vít giữa giữ bánh không tuột.'));
    const hair = mesh(new THREE.TorusGeometry(6.5, 1.6, 8, 32), MAT.plasticYellow.clone(), { z: -12 });
    hair.material.color.set(0x3b2a1a);
    hair.visible = false;
    wheelG.add(part(hair, 'Tóc quấn trục', 'Tóc + chỉ xoắn chặt quanh trục giữa bánh và vỏ → ma sát lớn.'));

    // --- lò xo (giữa khung và tay đòn) ---
    const spring = mesh(springGeometry({ radius: 4.5, wire: 0.55, turns: 7, length: 30 }), MAT.steel);
    spring.userData.noCut = true;
    frame.add(part(spring, 'Lò xo nén treo bánh', 'Ép tay đòn xuống → bánh bám sàn với lực ~16 N. Xem trang "Lò xo treo bánh xe" để học chi tiết.'));

    const procLbl = new THREE.Group();      // nhãn của mô hình học (ẩn khi xem CAD)
    root.add(procLbl);
    label(procLbl, 'Động cơ + encoder', [M[0] - LW, 30, -80]);
    label(procLbl, 'Hộp số 1:62.5', [0, 34, -30]);
    label(procLbl, 'Bánh Ø70', [0, 70, 14]);
    label(procLbl, 'Công tắc → RB1', [-LW - 25, 52, -24]);

    // ================= MÔ HÌNH CAD THẬT =================
    // Đặt thẳng trong root (sàn y = 0): bánh ở x = 0, tay đòn & động cơ phía sau (−X), động cơ/nắp hộp số quay về phía người xem (+Z).
    const AX = cadGearAxes();
    const C = {};                                  // các khớp/điều khiển node CAD
    /** Gắn một vật tự dựng (đơn vị mm, hướng theo khung GLB) vào một node CAD — dùng cho lớp phủ (tóc quấn…) */
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
    const cad = cadAttach(ctx, root, 'robot/wheel-module', {
      param: (p) => p.cad && !p.exgl,
      rotateY: -Math.PI / 2, onBottom: false,
      hide: [frame, procLbl],
      partDefault: ['Module bánh xe (CAD thật)', `Mô hình CAD đúng kích thước theo module Roborock S5 / Xiaomi gen1. Hộp số CAD 4 cặp m0.5 (10→40 · 12→36 · 12→40 · 14→44, i ≈ ${CAD_I.toFixed(1)}); số liệu mô phỏng vẫn dùng i = 62.5 của mô hình học.`],
      parts: { ...CAD_PARTS, 'screw_*': ['Vít PT 2.6 × 10 (PH1)', 'Vít tự ren vào nhựa. 6 vít giữ nắp hộp số; 3 vít trên khung bắt module vào vỏ robot. Siết ~0.25 N·m.'] },
      labels: [['Động cơ RS-360', 'can', [0, -16, 12]], ['Nắp hộp số', 'lid_gearbox', [26, -8, 8]], ['Bánh Ø70', 'wheel', [28, 26, -8]], ['Công tắc → RB1', 'switch_drop', [-14, 14, 0]], ['Encoder Hall', 'hall_pcb', [0, -20, 8]]],
      onLoad(c) {
        // 1) tay đòn: mọi chi tiết "carries" xoay chung quanh chốt (trục −X tại y 40, z 50)
        C.arm = c.pivotMany(['arm_pivot', 'wheel', 'axle', 'lid_gearbox', 'gear_train', 'motor', 'motor_plate', 'encoder', 'encoder_magnet', 'conn_wheel', /^screw_[1-6]$/],
          { axis: [-1, 0, 0], origin: [0, 40, 50] });
        // 2) chuyển động quay (trục dọc X, tâm tính đúng như file CAD)
        C.wheel = c.pivot('wheel', { axis: [1, 0, 0], origin: [0, 35, 0] });
        C.gears = ['gear_motor_pinion', 'gear_1', 'gear_2', 'gear_3', 'gear_out'].map((n, k) => c.pivot(n, { axis: [1, 0, 0], origin: AX[k] }));
        C.shaft = c.pivot('shaft', { axis: [1, 0, 0], origin: AX[0] });
        C.mag = c.pivot('encoder_magnet', { axis: [1, 0, 0], origin: AX[2] });
        C.screws = [1, 2, 3, 4, 5, 6].map((k) => c.pivot('screw_' + k, { axis: [1, 0, 0] }));
        C.top = [7, 8, 9].map((k) => c.pivot('screw_' + k, { axis: [0, 1, 0] }));
        // 3) dời (tháo lắp) — tạo SAU pivot để trượt bên trong khớp quay
        const mv = (n) => c.move(n);
        C.mWheel = mv('wheel'); C.mLid = mv('lid_gearbox'); C.mMotor = mv('motor'); C.mPlate = mv('motor_plate');
        C.mEnc = mv('encoder'); C.mMag = mv('encoder_magnet'); C.mConn = mv('conn_wheel');
        C.mGears = ['gear_motor_pinion', 'gear_1', 'gear_2', 'gear_3', 'gear_out'].map(mv);
        C.mScrews = [1, 2, 3, 4, 5, 6].map((k) => mv('screw_' + k));
        C.mTop = [7, 8, 9].map((k) => mv('screw_' + k));
        // 4) lò xo: co giãn quanh đầu trên (móc vào khung); công tắc: cần gạt + nút
        C.spring = c.pivot('spring', { axis: [0, 1, 0], origin: [20.5, 72.4, 7.0] });
        C.lever = c.pivot('lever', { axis: [1, 0, 0], origin: [18.0, 59.4, 17.4] });
        C.plunger = c.slide('plunger', [0, -1, 0]);
        // 5) lớp phủ: tóc quấn trục giữa bánh và vỏ hộp số
        const hairCad = new THREE.Mesh(new THREE.TorusGeometry(4.6, 1.7, 8, 28), hair.material);
        hairCad.rotation.y = Math.PI / 2;
        hairCad.visible = false;
        hairCad.userData.part = { name: 'Tóc quấn trục bánh', desc: 'Tóc + chỉ xoắn chặt quanh trục giữa la-zăng và tay đòn → ma sát lớn, dòng động cơ tăng.' };
        C.hair = attachMm(c, C.arm.pivot, hairCad, [11.8, 35, 0]);
        C.can = c.node('can');
      },
    });
    // bản tháo rời (exploded) — tĩnh, cùng hướng đặt
    const cadEx = cadAttach(ctx, root, 'robot/wheel-module-exploded', {
      param: (p) => p.cad && p.exgl,
      rotateY: -Math.PI / 2, onBottom: false,
      hide: [frame, procLbl],
      partDefault: ['Module bánh xe — hình tháo rời (CAD thật)', 'Các chi tiết được tách ra theo trục lắp ráp: bánh → trục → tay đòn/hộp số → nắp → động cơ → encoder → giắc; vít nắp kéo ra ngoài, khung nâng lên.'],
      parts: { ...CAD_PARTS, 'screw_*': ['Vít PT 2.6 × 10 (PH1)', 'Vít tự ren vào nhựa.'] },
      labels: [['Bánh + trục', 'wheel', [0, 42, 0]], ['Nắp hộp số', 'lid_gearbox', [0, 26, 0]], ['Động cơ', 'can', [0, 20, 0]], ['Khung + công tắc', 'frame', [0, 34, 0]]],
    });
    const cl = (x) => Math.max(0, Math.min(1, x));

    // ================= MÔ PHỎNG =================
    let wm = 0, v = 0, theta = 0, wheelAng = 0, motorAng = 0, cnt = 0, revs = 0, s = 6, chassisY = 0;
    let distEnc = 0, distReal = 0, fault = null, step = -1, stepPos = 0, temp = 25;
    const upV = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3();
    const local2frame = (lx, ly, phi) => [lx * Math.cos(phi) - ly * Math.sin(phi), lx * Math.sin(phi) + ly * Math.cos(phi)];
    // vị trí "tháo tung" cho từng nhóm (hướng × khoảng cách)
    const homes = new Map();
    const remember = (o) => homes.set(o, o.position.clone());
    [wheelG, cover, motorG, ...gearAxes, sw, conn].forEach(remember);

    return {
      object: root,
      onAction(id) { if (id === 'zero') { cnt = 0; distEnc = 0; distReal = 0; } },
      setStep(i) { step = i; },
      triggerFault(id) { fault = id; distEnc = 0; distReal = 0; },
      resetFault() {
        fault = null; hair.visible = false; temp = 25;
        if (cad.loaded) { cad.glow('plug_housing', 0x000000, 0); cad.color('tyre', null); if (C.hair) C.hair.visible = false; }
      },
      update(dt, t, p) {
        const fl = FLOORS[p.floor];
        floorMat.color.set(fl.color);
        // ---------- tháo lắp: bước → mức tháo của từng nhóm ----------
        stepPos += ((step >= 6 ? 0 : Math.max(0, step)) - stepPos) * Math.min(1, dt * 3);
        const lv = (k) => Math.max(p.explode, Math.max(0, Math.min(1, stepPos - k + 1)));
        const eWheel = lv(2), eCover = lv(3), eMotor = lv(4), eGear = lv(5);
        const eMod = Math.max(p.explode, Math.min(1, stepPos));
        wheelG.position.copy(homes.get(wheelG)).add(tmp.set(0, 0, 55 * eWheel));
        cover.position.copy(homes.get(cover)).add(tmp.set(0, 45 * eCover, 30 * eCover));
        motorG.position.copy(homes.get(motorG)).add(tmp.set(0, 0, -45 * eMotor));
        gearAxes.forEach((g, k) => g.position.copy(homes.get(g)).add(tmp.set(0, (15 + 12 * k) * eGear, 18 * eGear)));
        sw.position.copy(homes.get(sw)).add(tmp.set(-25 * eMod, 0, 0));
        conn.position.copy(homes.get(conn)).add(tmp.set(20 * eMod, 15 * eMod, 0));
        const takenApart = eMod > 0.05 || step >= 1 && step <= 5;

        // ---------- treo: robot trên sàn hay bị nhấc ----------
        const lifted = p.lift || takenApart;
        const sTarget = lifted ? S_MAX : 6.7;
        s += (sTarget - s) * Math.min(1, dt * 8);
        const phi = phiOf(s);
        arm.rotation.z = phi;
        const wheelY = LW * Math.sin(phi);
        const chassisTarget = R_W - (Y_TOP - 6.7) + (lifted ? 30 : 0);
        chassisY += (chassisTarget - chassisY) * Math.min(1, dt * 5);
        frame.position.y = chassisY;
        const onFloor = !lifted && chassisY + wheelY - R_W < 1;
        const N = onFloor ? N_FLOOR : 0;

        // lò xo: từ đế (32,33) trên khung tới điểm (34,16) trên tay đòn
        const [bx, by] = local2frame(34, 16, phi);
        const L = Math.hypot(32 - bx, 33 - by);
        spring.position.set((32 + bx) / 2, (33 + by) / 2, -24);
        spring.scale.y = L / 30;
        spring.quaternion.setFromUnitVectors(upV, tmp.set(32 - bx, 33 - by, 0).normalize());
        spring.position.y += 30 * eMod;
        // công tắc: đuôi tay đòn tại (−20, 0) đi lên khi bánh thõng
        const tailY = local2frame(-20, 0, phi)[1];
        const push = Math.max(0, tailY - (13 - 3.4 - 1.5));
        lever.rotation.z = -Math.min(push, 2.2) / 11;
        const pressed = push > 1.2 && eMod < 0.05;

        // ---------- vật lý (60 bước con) ----------
        const enc = fault !== 'mat-encoder';
        let duty = p.duty / 100;
        if (!enc && duty > 0) duty = 1;                       // PID mất phản hồi → bão hòa
        if (pressed || takenApart) duty = 0;                  // PIC dừng động cơ khi bánh bị nhấc
        const V = 14.4 * duty;
        const mu = fl.mu * (fault === 'lop-mon' ? 0.5 : 1) * (fault === 'lop-mon' && p.floor === 'go' ? 0.6 : 1);
        const tHair = fault === 'toc-quan' ? 0.15 : 0;        // N·m ở trục bánh
        hair.visible = fault === 'toc-quan';
        const r = R_W / 1000;
        const n = 60, h = dt / n;
        let I = 0, F = 0, lam = 0;
        for (let k = 0; k < n; k++) {
          I = (V - KE * wm) / RM;
          const ww = wm / I_RATIO;
          const vw = ww * r;
          lam = (vw - v) / Math.max(Math.abs(vw), Math.abs(v), 0.05);
          F = N > 0 ? mu * N * Math.tanh(lam / 0.06) : 0;
          // mô-men tải quy về động cơ
          const tLoad = (F * r + tHair * Math.sign(ww || V)) / (I_RATIO * ETA);
          let net = KE * I - tLoad;
          if (Math.abs(wm) < 1 && Math.abs(net) < TFRIC) { wm = 0; net = 0; }
          else net -= TFRIC * Math.sign(wm || net);
          wm += (net / JM) * h;
          // thân robot
          const rr = fl.crr * N_FLOOR + p.push;
          if (onFloor) {
            let acc = F - Math.sign(v) * rr;
            if (Math.abs(v) < 1e-3 && Math.abs(F) <= rr) { v = 0; acc = 0; }
            v += (acc / M_Q) * h;
          } else v *= Math.max(0, 1 - 6 * h);                // bị nhấc: robot đứng yên trong tay người
        }
        const nm = (wm * 60) / (2 * Math.PI);
        const nw = nm / I_RATIO;
        const vw = (nw * Math.PI * R_W * 2) / 60000;
        // encoder: đếm cạnh lên
        const dRev = (wm / (2 * Math.PI)) * dt;
        revs += dRev;
        if (enc) cnt += Math.abs(dRev) * PPR;
        const fp = enc ? Math.abs(nm / 60) * PPR : 0;
        if (enc) distEnc += Math.abs(dRev) / I_RATIO * Math.PI * R_W * 2;
        distReal += Math.abs(v) * 1000 * dt;
        const odoErr = distReal > 5 ? ((distEnc - distReal) / distReal) * 100 : 0;
        const odoTxt = distReal > 5 ? odoErr : distEnc > 5 ? '∞ — robot đứng yên mà encoder vẫn đếm!' : 0;
        // nhiệt động cơ đơn giản: P = I²R, tản 8 K/W, τ 40 s
        temp += ((25 + I * I * RM * 8) - temp) * Math.min(1, dt / 40) * (fault === 'toc-quan' ? 4 : 1);
        if (fault === 'toc-quan') fx.heat(motorBody, Math.max(0, (temp - 40) / 80));

        // ---------- hình 3D (làm chậm) ----------
        const slow = Number(p.slow);
        motorAng += (wm / slow) * dt;
        wheelAng += ((wm / I_RATIO) / slow) * dt;
        gearAxes[0].rotation.z = motorAng;
        gearAxes[1].rotation.z = -motorAng / 5;
        gearAxes[2].rotation.z = motorAng / 12.5;
        gearAxes[3].rotation.z = -motorAng / 62.5;
        encDisc.rotation.z = motorAng;
        wheelSpin.rotation.z = -wheelAng;                     // tiến về +X: bánh quay cùng chiều kim đồng hồ nhìn từ +Z
        gearAxes[3].rotation.z = -wheelAng;
        theta += (v * 1000 / slow) * dt;
        stripes.children.forEach((c, k) => { c.position.x = ((-130 + k * 20 - theta) % 260 + 390) % 260 - 130; });

        // ---------- CAD thật: cùng trạng thái mô phỏng ----------
        // sàn: thu gọn quanh module khi xem CAD (camera căn sát hơn), ẩn khi xem hình tháo rời
        const cadMode = p.cad && !p.exgl && cad.loaded, exMode = p.cad && p.exgl && cadEx.loaded;
        floor.scale.x = cadMode ? 0.65 : 1;
        floor.position.set(cadMode ? -20 : 0, -1.5, cadMode ? 27 : -12);
        stripes.position.z = cadMode ? 39 : 0;
        floor.visible = stripes.visible = !exMode;
        stripes.children.forEach((c) => { c.visible = !cadMode || Math.abs(c.position.x + 20) < 82; });
        // gọi tắt bản đang TẮT trước để bản đang BẬT ẩn mô hình học + căn camera sau cùng
        const exOn = p.exgl ? (cad.sync(p), cadEx.sync(p)) : (cadEx.sync(p), false);
        const cadOn = p.exgl ? false : cad.sync(p);
        if (cadOn || exOn) { frame.visible = false; procLbl.visible = false; }
        if (cadOn && C.arm) {
          // treo: chiều cao thân robot như mô hình học; tay đòn thõng 0 → 12° theo hành trình lò xo s
          cad.holder.position.y = chassisY - (R_W - (Y_TOP - 6.7));
          const drop = CAD_DROP * cl((s - 6.7) / (S_MAX - 6.7));
          C.arm.set(drop);
          // lò xo: đế trên tay đòn (y 50.5, z 8 — cách chốt Δy = 10.5, Δz = −42) hạ xuống khi tay đòn thõng
          const seatDy = 10.5 - (10.5 * Math.cos(drop) - 42 * Math.sin(drop));
          if (C.spring) C.spring.pivot.scale.y = (21.9 + seatDy) / 21.9;
          // công tắc: nhả dần sau 8°
          const rel = cl((drop - CAD_SW) / (CAD_DROP - CAD_SW));
          C.lever?.set(0.14 * rel);
          C.plunger?.set(0.6 * rel);
          // quay: bánh theo mô phỏng, bánh răng theo đúng tỉ số CAD, chiều đảo nhau ở mỗi cặp
          const A = -wheelAng;
          let g = A;
          const ang = [0, 0, 0, 0, A];
          for (let k = 3; k >= 0; k--) { g = -g * CAD_STAGES[k][1] / CAD_STAGES[k][0]; ang[k] = g; }
          C.wheel?.set(A);
          C.gears.forEach((gp, k) => gp?.set(ang[k]));
          C.shaft?.set(ang[0]);
          C.mag?.set(ang[2]);
          // tháo lắp (cùng mức lv() như mô hình học — thanh "Tháo tung" cũng tác động)
          const kScrew = cl(eCover * 2), kLid = cl(eCover * 2 - 1);
          C.mTop.forEach((m) => m?.set([0, 10 * eMod, 0]));
          C.top.forEach((sp) => sp?.set(-eMod * 8 * Math.PI));
          const loose = fault === 'mat-encoder' ? 2.5 : 0;
          C.mConn?.set([6 * eMod + loose, 0, 0]);
          C.mWheel?.set([-35 * eWheel, 0, 0]);
          C.mScrews.forEach((m) => m?.set([12 * kScrew, 0, 0]));
          C.screws.forEach((sp) => sp?.set(kScrew * 8 * Math.PI));
          C.mScrews.forEach((m) => m && (m.node.visible = kLid < 0.98));
          C.mLid?.set([25 * kLid, 0, 0]);
          const mot = 25 * kLid + 30 * eMotor;                  // động cơ bắt trên nắp → đi theo nắp, rồi rút ra thêm
          C.mMotor?.set([mot, 0, 0]);
          C.mPlate?.set([mot, 0, 0]);
          C.mEnc?.set([25 * kLid + 12 * eMotor, 22 * eMotor, 0]);
          C.mMag?.set([25 * kLid + 12 * eMotor, 22 * eMotor, 0]);
          C.mGears.forEach((m, k) => m?.set([k === 0 ? mot : (8 + 7 * k) * eGear, 0, 0]));   // bánh răng con đi theo trục động cơ
          // sự cố
          if (C.hair) C.hair.visible = fault === 'toc-quan';
          if (fault === 'toc-quan' && C.can) fx.heat(C.can, Math.max(0, (temp - 40) / 80));
          if (fault === 'mat-encoder') cad.glow('plug_housing', 0xff2020, 0.5 + 0.5 * Math.sin(t * 8));
          if (fault === 'lop-mon') cad.color('tyre', 0x8a8a84);
        }
        if (!cadOn && !exOn) procLbl.visible = true;

        const hall = enc ? (Math.floor(revs * PPR / 200 * 2) % 2 ? 5 : 0) : 0;
        readout('nm', nm);
        readout('nw', nw);
        readout('vw', vw);
        readout('v', v);
        readout('slip', vw > 0.01 ? Math.max(0, lam) * 100 : 0);
        readout('i', I);
        readout('cnt', Math.floor(cnt));
        readout('fp', fp);
        readout('odo', odoTxt);
        readout('rb1', pressed ? '0 V — bánh thõng → PIC dừng động cơ' : !enc ? '5 V · ⚠ không có xung encoder!' : '5 V — bình thường');
        return [Math.min(vw, 1.2), Math.min(Math.max(v, 0), 1.2), Math.min(Math.max(I, 0), 2.2), hall];
      },
    };
  },
};
