// =============================================================================
// _solder_kb.js — CƠ SỞ TRI THỨC HÀN cho minigame (thuần dữ liệu, không THREE/DOM). (KHÔNG export default.)
// Nguồn sự thật: docs/07_KIEN_THUC_HAN_MACH.md — mọi con số ghi kèm mục (§) và nhãn độ tin cậy của tài liệu:
//   [V] = đã đọc trực tiếp nguồn · [S] = trích đoạn tìm kiếm, nên kiểm lại · [TK] = ước tính/thiết kế cho game.
//
//   TIPS[code]            mũi hàn (docs §1.2, §1.3, §13.1): diện tích tiếp xúc, nhiệt khối tương đối, hồi nhiệt, độ chính xác…
//   STATIONS[kind]        loại trạm (docs §1.1, §9, §13.1 "hệ số trạm")
//   COMPONENTS            giới hạn nhiệt linh kiện (docs §4.1, §13.2) + tham số mô hình khối nhiệt (game)
//   DEFECTS[code]         lỗi mối hàn (docs §5.5, §13.3, §13.4): nhận dạng, nguyên nhân, cách sửa, phóng đại tối thiểu để thấy
//   IPC                   tiêu chí IPC-A-610E Table 7-4 / 5.3 (docs §5.2, §5.3)
//   MAG_TABLE, magRangeFor(landMm)   bảng phóng đại kiểm tra (docs §10.1)
//   WORKFLOW              quy trình 14 bước của thợ chuyên nghiệp (docs §11)
//   LESSONS               thẻ bài học tổng quát (nhiệt độ, chăm sóc mũi, làm sạch, kính…)
// =============================================================================

export const DOC = 'docs/07_KIEN_THUC_HAN_MACH.md';

// ----------------------------------------------------------------------------- mũi hàn
// area: diện tích tiếp xúc hiệu dụng (mm²) — edge (cạnh/đầu) · face (mặt) · tht (khi hàn mối xuyên lỗ đúng cách,
//       bị giới hạn bởi kích thước mối) — docs §13.1 [TK]; mass: nhiệt khối tương đối (B = 1.0) §13.1 [TK];
// tau: hồi nhiệt τ_rec (s) { t12, sleeve } §13.1 [TK, dựa V11/S28]; width: bề rộng đầu (mm) §1.2;
// precision / bridge: 1–5 §13.1 [TK]; suits: loại mối phù hợp (fine | small | header | tht | power | ground | drag | rework).
export const TIPS = {
  I: {
    code: 'I', name: 'Côn kim I', shape: 'needle', width: 0.2, area: { edge: 0.05, face: 0.05, tht: 0.05 }, mass: 0.6, tau: { t12: 1.5, sleeve: 4 },
    precision: 5, bridge: 1, suits: ['fine', 'rework'], tag: '[V][13] [S][3] · số mô hình §13.1 [TK]',
    desc: 'Côn rất nhọn, bán kính đầu ~0,15–0,2 mm (ILS: dài làm việc ~13,5 mm [S][3]).',
    use: 'Linh kiện 0201/0402, chân fine-pitch, khe hẹp, chấm sửa một điểm.',
    pros: ['Với tới chỗ chật nhất', 'Gần như không chạm pad bên cạnh'],
    cons: ['Nhiệt khối RẤT thấp → "đói nhiệt", mối xuyên lỗ không lên nổi nhiệt', 'Người dùng hay tăng nhiệt bù → cháy flux, oxy hoá mũi'],
    joints: 'Không dùng cho THT; chỉ SMD nhỏ / sửa chấm.',
  },
  B05: {
    code: 'B05', name: 'Côn B 0,5 mm', shape: 'conical', width: 0.5, area: { edge: 0.12, face: 0.12, tht: 0.12 }, mass: 0.8, tau: { t12: 1.3, sleeve: 3.8 },
    precision: 5, bridge: 1, suits: ['fine', 'rework'], tag: '[V][13] · số mô hình [TK] (nội suy giữa I và B §13.1)',
    desc: 'Côn tròn, đầu Ø0,5 mm. Đa hướng — không cần xoay mũi.',
    use: 'Chân nhỏ, SMD 0603/0805, chạm sửa.',
    pros: ['Chính xác, đa hướng', 'Ít rủi ro cầu thiếc'],
    cons: ['Diện tích tiếp xúc nhỏ → truyền nhiệt kém cho mối lớn [V][13]', 'Trên pad THT Ø1,8 mm ở 340 °C: thiếc chảy nhưng không loang → mối nguội'],
    joints: 'Không hợp mối THT tiêu chuẩn; hợp SMD nhỏ.',
  },
  B: {
    code: 'B', name: 'Côn B (R0,5 · Ø1 mm)', shape: 'conical', width: 1.0, area: { edge: 0.2, face: 0.2, tht: 0.2 }, mass: 1.0, tau: { t12: 1.2, sleeve: 3.5 },
    precision: 4, bridge: 1, suits: ['fine', 'small', 'rework'], tag: '[V][13] · §13.1 [TK]',
    desc: 'Côn tròn đầu R0,5 — mũi "mặc định" bán kèm nhiều trạm 936/888.',
    use: 'Linh kiện chính xác, chân nhỏ, chạm sửa.',
    pros: ['Đa hướng, không cần xoay', 'Ít chạm pad bên'],
    cons: ['Tiếp xúc nhỏ (0,2 mm²) → mối xuyên lỗ lên nhiệt chậm', 'Không dùng được cho ground plane / cầu đấu'],
    joints: 'Tạm được cho THT nhỏ nếu giữ lâu hơn; tốt hơn là D16/2C.',
  },
  J: {
    code: 'J', name: 'Côn cong J (30°)', shape: 'bent', width: 1.0, area: { edge: 0.25, face: 0.25, tht: 0.25 }, mass: 1.1, tau: { t12: 1.3, sleeve: 3.6 },
    precision: 4, bridge: 2, suits: ['fine', 'rework'], tag: '§1.2 [V][13] · số [TK]',
    desc: 'Côn/đục bẻ cong ~30°.',
    use: 'Góc khó, hàn dưới thân linh kiện, chỗ bị che.',
    pros: ['Góc tiếp cận tốt'],
    cons: ['Khó căn chỉnh', 'Tiếp xúc nhỏ như mũi côn'],
    joints: 'Sửa chữa ở góc khó, không phải mũi làm việc chính.',
  },
  '1C': {
    code: '1C', name: 'Vát 1C (Ø1 mm)', shape: 'bevel', width: 1.0, area: { edge: 0.4, face: 1.1, tht: 0.6 }, mass: 1.2, tau: { t12: 1.0, sleeve: 3.0 },
    precision: 4, bridge: 2, suits: ['fine', 'small', 'drag'], tag: '§1.2 [V][6] · số [TK]',
    desc: 'Vát xiên 45°, mặt cắt elip Ø1 mm (dòng T18 có 0.5C→5C [V][6]).',
    use: 'SMD 0603/0805, kéo thiếc chân nhỏ, THT rất nhỏ.',
    pros: ['Xoay mũi để chọn cạnh hẹp ↔ mặt rộng', 'Chứa được giọt thiếc nhỏ'],
    cons: ['Phải xoay đúng hướng', 'Hơi nhỏ cho THT Ø1,8 mm'],
    joints: 'THT nhỏ được; tốt nhất SMD.',
  },
  '2C': {
    code: '2C', name: 'Vát 2C (Ø2 mm)', shape: 'bevel', width: 2.0, area: { edge: 1.2, face: 4.4, tht: 2.0 }, mass: 2.0, tau: { t12: 0.9, sleeve: 2.5 },
    precision: 3, bridge: 3, suits: ['small', 'header', 'tht', 'drag'], tag: '§1.2, §1.4, §13.1 [V][4][6] · số [TK]',
    desc: 'Vát 45° Ø2 mm — "BC2/C2: hợp lý cho THT pad Ø1,6–2,0 mm" (§1.4).',
    use: 'THT tiêu chuẩn, header 2,54 mm, kéo thiếc SMD, dây nhỏ.',
    pros: ['Mặt vát áp được CẢ pad và chân → truyền nhiệt tốt', 'Giữ giọt thiếc làm "cầu nhiệt"'],
    cons: ['Mặt rộng: dồn nhiều thiếc dễ cầu sang pad kề (rủi ro 3/5)'],
    joints: 'Điện trở, diode, LED, header, tụ — lựa chọn đa dụng cho THT.',
  },
  '3C': {
    code: '3C', name: 'Vát 3C (Ø3 mm)', shape: 'bevel', width: 3.0, area: { edge: 1.8, face: 9, tht: 2.6 }, mass: 3.2, tau: { t12: 0.8, sleeve: 2.2 },
    precision: 2, bridge: 4, suits: ['tht', 'power', 'ground'], tag: '§1.4 [V][4] · số [TK]',
    desc: 'Vát 45° Ø3 mm.',
    use: 'Pad lớn, dây nguồn, cầu đấu, pad nối mass.',
    pros: ['Nhiệt khối lớn — sụt nhiệt ít khi chạm mối nặng'],
    cons: ['Chạm pad bên trên bước 2,54 mm → cầu thiếc', 'Kém cho linh kiện nhỏ nhạy nhiệt'],
    joints: 'Cầu đấu, jack DC, pad ground plane.',
  },
  '4C': {
    code: '4C', name: 'Vát 4C (Ø4 mm)', shape: 'bevel', width: 4.0, area: { edge: 2.5, face: 17, tht: 3.2 }, mass: 5.0, tau: { t12: 0.7, sleeve: 2.0 },
    precision: 1, bridge: 5, suits: ['power', 'ground'], tag: '§1.2 C4: Ø4, dài 11,5 mm [S][3]; §13.1 [TK]',
    desc: 'Vát 45° Ø4 mm — mũi "khủng".',
    use: 'Mối rất lớn, dây to, XT60, tấm đồng.',
    pros: ['Nhiệt khối 5× mũi B', 'Diện tích mặt tới ~17 mm²'],
    cons: ['Chắc chắn chạm pad bên ở bước 2,54 mm (rủi ro cầu 5/5)', 'Truyền quá nhiều nhiệt cho linh kiện nhỏ'],
    joints: 'Chỉ mối nguồn/ground cực lớn.',
  },
  D16: {
    code: 'D16', name: 'Dẹt D16 (1,6 mm)', shape: 'chisel', width: 1.6, area: { edge: 0.9, face: 0.9, tht: 0.9 }, mass: 1.8, tau: { t12: 0.9, sleeve: 2.5 },
    precision: 3, bridge: 2, suits: ['small', 'header', 'tht'], tag: '§1.2 "lựa chọn số 1 cho THT" [V][6]; §13.1 [TK]',
    desc: 'Đục dẹt (chisel/screwdriver) 1,6 mm.',
    use: 'THT chuẩn, header, connector — "lựa chọn số 1 cho THT" (§1.2).',
    pros: ['Mặt phẳng áp tốt lên pad + chân', 'Rủi ro cầu thấp (2/5) trên bước 2,54 mm', 'Quy tắc 60 %: pad Ø1,8 → mũi ~1,1–1,6 mm [V][14]'],
    cons: ['Cần định hướng mặt dẹt', 'Không đủ cho ground plane lớn'],
    joints: 'Điện trở, đế IC, header, LED, tụ — mặc định của bàn hàn này.',
  },
  D24: {
    code: 'D24', name: 'Dẹt D24 (2,4 mm)', shape: 'chisel', width: 2.4, area: { edge: 1.6, face: 1.6, tht: 1.6 }, mass: 2.8, tau: { t12: 0.8, sleeve: 2.0 },
    precision: 2, bridge: 3, suits: ['tht', 'header', 'power'], tag: '§1.4 [V][4]; §13.1 [TK]',
    desc: 'Đục dẹt 2,4 mm.',
    use: 'Header, jack, cầu đấu, mối cần nhiệt khá.',
    pros: ['Truyền nhiệt tốt, nhiệt khối 2,8× mũi B'],
    cons: ['Rộng gần bằng bước 2,54 mm → cẩn thận cầu thiếc'],
    joints: 'Cầu đấu vít, chân nguồn, header lớn.',
  },
  D32: {
    code: 'D32', name: 'Dẹt D32 (3,2 mm)', shape: 'chisel', width: 3.2, area: { edge: 2.6, face: 2.6, tht: 2.6 }, mass: 3.6, tau: { t12: 0.7, sleeve: 2.0 },
    precision: 2, bridge: 4, suits: ['power', 'ground'], tag: '§1.4 "pad nối mass/jack DC: D24/D32/C3/C4" [V][4]; §13.1 [TK]',
    desc: 'Đục dẹt 3,2 mm.',
    use: 'Ground plane, đầu cos, XT60, pad dây của module nguồn.',
    pros: ['Đủ nhiệt cho pad nối mặt đồng lớn mà KHÔNG phải tăng nhiệt bừa (§3.5)'],
    cons: ['Rủi ro cầu 4/5 trên bước 2,54 mm'],
    joints: 'Ground / nguồn / module buck.',
  },
  K: {
    code: 'K', name: 'Dao K', shape: 'knife', width: 1.0, area: { edge: 3.0, face: 3.0, tht: 1.2 }, mass: 3.0, tau: { t12: 0.8, sleeve: 2.5 },
    precision: 3, bridge: 3, suits: ['drag', 'header', 'rework'], tag: '§1.2 T12-K: dài 15 mm, Ø4,7 [S][3]; §13.1 [TK]',
    desc: 'Lưỡi dao — dùng được cạnh, mũi, mặt.',
    use: 'Kéo thiếc (drag) hàng chân, gỡ cầu thiếc, hàng chân connector.',
    pros: ['Cạnh dài kéo được cả hàng chân', 'Gỡ cầu thiếc rất hiệu quả [S][3]'],
    cons: ['Dễ chạm sang pad bên cạnh khi dùng cạnh'],
    joints: 'Header nhiều chân, sửa cầu thiếc.',
  },
};
export const TIP_ORDER = ['I', 'B05', 'B', 'J', '1C', '2C', '3C', '4C', 'D16', 'D24', 'D32', 'K'];
/** id item ↔ mã mũi */
export const tipItemId = (code) => `tip-${String(code).toLowerCase()}`;
export const tipCodeOfItem = (id) => { const m = /^tip-(.+)$/.exec(String(id || '')); if (!m) return null; const c = TIP_ORDER.find((k) => k.toLowerCase() === m[1]); return c || null; };
export const tipSpec = (code) => TIPS[code] || TIPS.D16;
export const DEFAULT_TIP = 'D16';

/** Mô hình nhiệt của đầu mũi (game) — docs §12 "ΔT_tip ≈ α·C_joint/M_tip; hồi nhiệt τ_rec" [TK] */
export function tipThermal(code, stationKind = '936') {
  const t = tipSpec(code);
  const st = STATIONS[stationKind] || STATIONS['936'];
  const Cw = 0.30 * t.mass;                         // J/K — khối đầu mũi làm việc (B ≈ 0,3 J/K) [TK]
  const K = 0.25 * Math.pow(t.mass, 0.8) * st.kMul; // W/K — dẫn nhiệt thân mũi → đầu mũi [TK]
  const gWet = 0.17 * (t.area.tht + 0.25 + 0.15 * t.width);   // W/K — cầu thiếc lỏng mũi↔mối: k_thiếc≈50 W/mK, dày ~0,3 mm, + ngấn [TK]
  return { Cw, K, gWet, width: t.width, tauRec: t.tau[st.series] ?? t.tau.sleeve };
}

// ----------------------------------------------------------------------------- trạm hàn
// tau: hằng số gia nhiệt (s) · pMax (W) · kMul: hệ số dẫn nhiệt lõi→mũi (mũi tích hợp nhanh hơn) · series: cột τ_rec §13.1
export const STATIONS = {
  936: { kind: '936', name: 'Trạm 936/937 (mũi lồng ống 900M/T18)', tau: 20, pMax: 70, kMul: 1.0, series: 'sleeve', heat: '≈ 40–60 s tới 350 °C (936 chậm hơn FX-888D ~20 s [S][28])', tag: '§1.1, §9', hotSwap: false },
  fx888d: { kind: 'fx888d', name: 'FX-888D (T18)', tau: 6, pMax: 70, kMul: 1.1, cMul: 1, series: 'sleeve', heat: '~20 s tới 350 °C [S][28]', tag: '§1.1, §9 [V][6]', hotSwap: false },
  t12: { kind: 't12', name: 'FX-951 / T12 (mũi tích hợp)', tau: 2.5, pMax: 75, kMul: 2.6, cMul: 0.35, series: 't12', heat: '~10 s tới ~427 °C [S][8]', tag: '§1.1, §9 [V][7]', hotSwap: true, sense: 0.7 },
};

// ----------------------------------------------------------------------------- hợp kim (bổ sung cho ALLOYS trong _solder_physics)
export const ALLOY_NOTES = {
  Sn63Pb37: 'Cùng tinh 183 °C — chảy/đông ở MỘT điểm, ít bị "disturbed" (§3.1 [S][9b]). Mũi 315–371 °C (Kester 44 [S][9]); Hakko khuyên bắt đầu 330–350 °C [V][5].',
  Sn60Pb40: 'Dải nhão 183–190 °C → dễ bị xáo động khi nguội (§3.1).',
  SAC305: 'Không chì 217–220 °C [V][10]; cần nóng hơn 30–40 °C [V][13]; oxy hoá mũi nhanh gấp 4–5 lần [V][5b]; mối hơi xỉn vẫn chấp nhận (IPC [V][2]).',
};

// ----------------------------------------------------------------------------- linh kiện
// limitT / limitS: giới hạn hàn tay theo datasheet (docs §4.1) · alpha: tỉ lệ ΔT mối truyền tới thân (game [TK]) ·
// tau: hằng số thời gian dẫn nhiệt dọc chân → thân (s, [TK]) · rate: tốc độ hỏng khi vượt (docs §13.2: LED "30 %/giây vượt") ·
// visible: phóng đại tối thiểu để THẤY hư hỏng (null = không thấy, chỉ lỗi chức năng) · plastic: vỏ nhựa biến dạng
export const COMPONENTS = {
  led: { name: 'LED 3/5 mm (đỏ/vàng/xanh lá)', limitT: 300, limitS: 3, alpha: 0.6, tau: 4, rate: 0.3, visible: 1.75, tag: 'Kingbright [V][15]; §13.2',
    damage: 'Ứng suất chân khi thân > 85 °C làm hỏng dây bond [V][15]; epoxy ngả vàng/đục, LED mờ → chết [S][15b].', fix: 'Kẹp tản nhiệt lên chân giữa thân và mối; ≤ 3 s/mối; mỏ ≤ 300 °C (chì).' },
  'led-blue': { name: 'LED xanh dương/trắng', limitT: 280, limitS: 3, alpha: 0.6, tau: 4, rate: 0.35, visible: 1.75, tag: 'Kingbright [V][15] (≤ 280 °C)',
    damage: 'Nhạy hơn LED đỏ: chip InGaN, giới hạn 280 °C.', fix: 'Như LED đỏ nhưng hạ nhiệt và luôn dùng kẹp tản nhiệt.' },
  elcap: { name: 'Tụ hoá nhôm chân cắm', limitT: 380, limitS: 3, alpha: 0.5, tau: 6, rate: 0.25, visible: 1, tag: 'Chemi-con 380 ± 10 °C, 3 ± 0,5 s [V][16]; Nichicon 350 °C [S][16b]; §13.2 hỏng > 5 s',
    damage: 'Điện phân sôi, gioăng cao su phồng, ống co nhiệt co rút/rách, vạch an toàn phồng, rò dịch (§4.2 [TK]).', fix: 'Mũi đủ to để mối nhanh (≤ 3 s), không giữ mũi lên chân.' },
  diode: { name: 'Diode chân cắm', limitT: 350, limitS: 3, alpha: 0.55, tau: 3, rate: 0.25, visible: null, once: true, tag: 'ROHM < 3 s, 1 lần [V][17]; §13.2',
    damage: 'Không thấy bằng mắt; ΔVF > 20 %, lần hàn thứ 2 cộng dồn (§13.2).', fix: 'Hàn 1 lần dứt khoát ≤ 3 s; kẹp tản nhiệt cho diode tín hiệu.' },
  crystal: { name: 'Thạch anh HC-49', limitT: 350, limitS: 3, alpha: 0.5, tau: 5, rate: 0.2, visible: null, tag: '350 ± 10 °C, 3 ± 1 s [S][18]; §13.2 hỏng > 4 s',
    damage: 'Không thấy; lệch tần số / nứt tinh thể → mạch không dao động (§4.2 [TK]).', fix: '≤ 3 s mỗi chân, để nguội giữa 2 chân.' },
  mlcc: { name: 'Tụ gốm (MLCC)', limitT: 350, limitS: 5, alpha: 0.5, tau: 3, rate: 0.2, visible: 20, shock: true, tag: 'Murata: preheat 150 °C, ≤ 350 °C, ≤ 5 s [S][19]; ΔT < ~190 °C; §13.2',
    damage: 'Sốc nhiệt (mũi > 350 °C, không preheat, ΔT lớn) → nứt nhỏ chỉ thấy dưới kính ≥ 10–20× → có thể chập sau này.', fix: 'Mũi ≤ 350 °C, không chạm mũi vào thân, preheat khi rework.' },
  ic: { name: 'IC DIP', limitT: 260, limitS: 10, alpha: 0.45, tau: 6, rate: 0.12, visible: null, tag: 'TI NE555: 260 °C/10 s ở 1,6 mm từ thân [S][21]; §13.2',
    damage: 'Thường không thấy — lỗi chức năng (die/dây bond quá nhiệt); vỏ có thể đổi màu (§4.2).', fix: 'Dùng ĐẾ IC; hàn xen kẽ các chân không kề nhau để thân kịp nguội.' },
  header: { name: 'Header PBT 2,54 mm', limitT: 260, limitS: 10, alpha: 0.7, tau: 3, rate: 0.15, visible: 1.75, plastic: true, tag: 'PBT 260 °C/10 s [S][23b]; §13.2 "mũi chạm nhựa hoặc > 5 s"',
    damage: 'Nhựa PBT mềm, chân xô lệch → cắm header cái/jumper không vào.', fix: 'Mỗi chân ≤ 3 s, hàn xen kẽ; không chạm mũi vào nhựa.' },
  jst: { name: 'Connector JST XH (PA66)', limitT: 260, limitS: 10, alpha: 0.7, tau: 3, rate: 0.15, visible: 1.75, plastic: true, tag: 'PA66 UL94V-0 [S][23]; §13.2',
    damage: 'Vỏ PA66 chảy/bóng, lỗ cắm méo → vỏ cái không cắm vào được.', fix: 'Mũi D16/2C, ≤ 3 s, không chạm vỏ.' },
  'dip-socket': { name: 'Đế IC DIP', limitT: 260, limitS: 10, alpha: 0.75, tau: 2.5, rate: 0.12, visible: 1.75, plastic: true, tag: 'nhựa PBT/PA [S][23b]; §4.2',
    damage: 'Nhựa đế mềm, lò xo tiếp xúc xô lệch → IC cắm vào tiếp xúc chập chờn / không vào.', fix: 'Hàn 2 chân chéo góc trước, sau đó xen kẽ hai hàng; ≤ 3 s/chân.' },
  terminal: { name: 'Cầu đấu vít (PA66)', limitT: 260, limitS: 10, alpha: 0.5, tau: 8, rate: 0.12, visible: 1.75, plastic: true, tag: 'PA66 [S][23]; §13.2',
    damage: 'Thân nhựa biến dạng, chân nghiêng.', fix: 'Mũi to (D24/D32) để mối nhanh thay vì giữ lâu.' },
  resistor: { name: 'Điện trở', limitT: 400, limitS: 10, alpha: 0.5, tau: 4, rate: 0.05, visible: 1, tag: '[TK] (bền nhiệt)',
    damage: 'Lớp sơn cháy sậm màu khi quá nhiệt kéo dài.', fix: '—' },
};
/** Lớp linh kiện theo item def → khoá COMPONENTS (null = không mô phỏng hư hỏng) */
export function componentClass(def) {
  const id = String(def?.id || ''), E = def?.electrical || {}, cat = String(def?.category || '');
  if (E.type === 'led' || /^led-/.test(id)) return /blue|white|xanh-duong|trang/.test(id) ? 'led-blue' : 'led';
  if (E.type === 'capacitor' || /cap-/.test(id)) return E.polar || /elec/.test(id) ? 'elcap' : 'mlcc';
  if (E.type === 'diode' || /1n58|1n40|ss34/.test(id)) return 'diode';
  if (E.type === 'crystal' || /crystal/.test(id)) return 'crystal';
  if (/dip\d+-socket/.test(id)) return 'dip-socket';
  if (/^header/.test(id)) return 'header';
  if (/^jst/.test(id)) return 'jst';
  if (/screw-terminal/.test(id)) return 'terminal';
  if (E.type === 'resistor' || /^resistor/.test(id)) return 'resistor';
  if (cat === 'ic' || /pic16|sn74|ne555|lm/.test(id)) return 'ic';
  return null;
}
/** Nhiệt độ thân tối đa cho phép (game): mối ở đúng giới hạn datasheet trong đúng thời gian giới hạn → thân đạt ngưỡng này */
export function bodyLimit(cls, ambient = 30) {
  const c = COMPONENTS[cls];
  if (!c) return Infinity;
  return ambient + (c.limitT - ambient) * c.alpha * (1 - Math.exp(-c.limitS / c.tau));
}

// ----------------------------------------------------------------------------- lỗi mối hàn
// mag: phóng đại tối thiểu để NHẬN RA (docs §13.4, dung sai ±15 % §10.1) · fail: lỗi (true) hay chỉ "chỉ báo quá trình"
// cls3Only: chỉ là lỗi ở Class 3 · src: nguồn
export const DEFECTS = {
  cold: { vi: 'Mối nguội (cold)', mag: 7.5, fail: true, src: '§5.5 [V][1][2][2b]; thấy rõ sần ở 7,5–10× (§13.4)',
    look: 'Xám, rỗ, sần, thấm ướt kém.', cause: 'Thiếu nhiệt (mũi nhỏ/nguội, rút mũi sớm), bề mặt bẩn.', fix: 'Thêm flux, gia nhiệt lại đến khi chảy loang; dùng mũi lớn hơn thay vì tăng nhiệt bừa (§3.5).' },
  rosin: { vi: 'Mối "kẹt nhựa thông" (rosin joint)', mag: 7.5, fail: true, src: '§5.5 [V][1][2]; §13.3 (< 0,5 s trên liquidus)',
    look: 'Như mối nguội + nhựa thông kẹt giữa thiếc và kim loại.', cause: 'Thiếu nhiệt/thời gian để flux nổi lên.', fix: 'Thêm flux, gia nhiệt đủ (2–4 s).' },
  disturbed: { vi: 'Mối bị xáo động (disturbed)', mag: 7.5, fail: true, src: '§5.5 [V][1][2][2b]; §13.3',
    look: 'Mờ, "đóng băng" (frosted), có vân ứng suất.', cause: 'Chân/linh kiện/bo xê dịch khi thiếc đang đông (đặc biệt Sn60Pb40).', fix: 'Gia nhiệt lại, giữ yên tới khi đông hẳn (vài giây), không thổi nguội.' },
  overheated: { vi: 'Mối quá nhiệt (overheated)', mag: 7.5, fail: true, src: '§4.2, §5.5 [V][1][2b] (NASA); §13.3: T_tip > 400 °C hoặc > 6 s',
    look: 'Sần, xỉn, như phấn (chalky); lớp liên kim Cu6Sn5/Cu3Sn dày, giòn [S][25].', cause: 'Quá nhiệt/quá lâu, hàn lại nhiều lần.', fix: 'Làm sạch, hút bớt, hàn lại NHANH với mũi phù hợp ở 330–350 °C.' },
  insufficient: { vi: 'Thiếu thiếc (insufficient)', mag: 1.75, fail: true, src: '§5.5 [V][1][2b]; §13.3 (< 60 % thể tích hoặc fill < 75 %)',
    look: 'Không phủ hết pad/chân, fillet thiếu, lỗ không đầy.', cause: 'Đưa quá ít thiếc.', fix: 'Thêm thiếc (kèm flux).' },
  excess: { vi: 'Thừa thiếc / cục tròn (excess)', mag: 1.75, fail: true, src: '§5.5 [V][1][2b]; §13.3 (> 150 % hoặc góc > 90°)',
    look: 'Cục tròn che mất đường viền chân, góc thấm ướt > 90°.', cause: 'Đưa quá nhiều thiếc.', fix: 'Rút bớt bằng mũi sạch, bấc đồng hoặc ống hút.' },
  'bridge-gross': { vi: 'Cầu thiếc rõ (bridge)', mag: 1, fail: true, src: '§5.5 [V][2][2b]; thấy bằng mắt thường §13.4',
    look: 'Thiếc nối 2 pad không chung mạng — CHẬP MẠCH.', cause: 'Thừa thiếc, mũi quá to so với pad (> ~1,2× pad), kéo mũi đầy thiếc qua pad bên.', fix: 'Chấm flux, kéo mũi sạch giữa 2 mối; hoặc bấc đồng.' },
  'bridge-hairline': { vi: 'Cầu thiếc mảnh (hairline bridge)', mag: 7.5, fail: true, src: '§13.4: "cầu thiếc mảnh" cần 7,5–10×',
    look: 'Sợi thiếc rất mảnh giữa 2 pad — bằng mắt/kính lúp KHÔNG thấy.', cause: 'Kéo mũi khi thiếc đang chảy, flux cạn.', fix: 'Flux + mũi K/2C sạch kéo qua; kiểm tra lại ở cùng phóng đại.' },
  icicle: { vi: 'Gai thiếc (icicle / spike)', mag: 1.75, fail: true, src: '§5.5 [V][1][2]; §13.3 (flux cạn + rút mũi chậm / mũi nguội)',
    look: 'Gai nhọn dựng lên từ mối.', cause: 'Flux cạn, rút mũi chậm (> 0,5 s sau khi rút thiếc) hoặc mũi nguội.', fix: 'Thêm flux, chạm lại mũi nóng và rút dứt khoát.' },
  pinhole: { vi: 'Lỗ khí (pinhole / blowhole)', mag: 7.5, fail: true, src: '§5.5 [V][1][2]; §13.3 (PCB ẩm hoặc flux sôi > 380 °C)',
    look: 'Lỗ nhỏ trên bề mặt mối.', cause: 'Khí/ẩm từ lỗ mạ, flux sôi mạnh khi quá nóng.', fix: 'Hút ẩm PCB (93 °C ≥ 2 h [V][1]), hàn lại ở nhiệt thấp hơn.' },
  dewetting: { vi: 'Co thiếc (dewetting)', mag: 4, fail: true, src: '§5.5 [V][1][2]; thấy ở 4× (§13.4)',
    look: 'Thiếc co lại thành gò, để lại màng mỏng.', cause: 'Bề mặt nhiễm bẩn/oxy hoá, flux cháy thành than.', fix: 'Làm sạch (IPA), thêm flux, hàn lại.' },
  nonwetting: { vi: 'Không thấm ướt (non-wetting)', mag: 4, fail: true, src: '§5.5 [V][1]',
    look: 'Thiếc không bám, lộ kim loại nền.', cause: 'Oxy hoá nặng, hết flux, mũi đen (de-wetting tip).', fix: 'Làm sạch cơ học/hoá học, flux mới, mũi sạch đã tinning.' },
  'wetting-angle': { vi: 'Góc thấm ướt > 90°', mag: 4, fail: true, src: '§5.2 IPC-A-610E: không vượt 90° [V][2]',
    look: 'Mép thiếc gặp pad dựng đứng/lồi.', cause: 'Thấm ướt kém hoặc thừa thiếc.', fix: 'Flux + gia nhiệt lại; bớt thiếc.' },
  'fillet-coverage': { vi: 'Fillet không đủ chu vi', mag: 4, fail: true, src: 'IPC Table 7-4 D: ≥ 270° (Class 1/2), ≥ 330° (Class 3) [V][2]',
    look: 'Fillet mặt hàn không phủ đủ quanh chân.', cause: 'Thiếu nhiệt một phía / thiếu thiếc.', fix: 'Đặt mũi chạm cả pad và chân, đưa thiếc phía đối diện.' },
  'hole-fill': { vi: 'Điền lỗ < 75 %', mag: 4, fail: true, src: 'IPC Table 7-4 A: 75 % (Class 2/3); ngoại lệ 50 % lỗ nối lớp tản nhiệt [V][2]',
    look: 'Nhìn từ mặt linh kiện thấy thiếc không leo lên thành lỗ.', cause: 'Lỗ chưa đủ nóng, thiếu thiếc, chân chưa thấm.', fix: 'Giữ mũi tới khi thiếc "hút" vào lỗ; mũi to hơn cho lỗ nối mass.' },
  'lifted-pad': { vi: 'Bong pad (lifted land)', mag: 1.75, fail: true, src: '§5.5 [V][2b][1]; §13.3 (> 8–10 s nhiệt hoặc kéo khi chưa chảy)',
    look: 'Vòng đồng tách khỏi nền, nghiêng.', cause: 'Quá nhiệt/lực khi tháo hàn, hàn đi hàn lại.', fix: 'Sửa bằng dây nối sang pad khác (NASA cấm sửa).' },
  'flux-residue': { vi: 'Cặn nhựa thông (RMA)', mag: 4, fail: false, cls3Fail: true, src: '§6.10, §10.5 #7 [V][1][12]',
    look: 'Lớp hổ phách dính quanh mối.', cause: 'Chưa làm sạch sau khi hàn (thiếc lõi RMA/ROM1).', fix: 'IPA + bàn chải trong ½ giờ sau hàn (NASA [V][1]), lau khô.' },
  'flux-charred': { vi: 'Flux cháy đen (charred)', mag: 4, fail: true, src: '§4.2 [V][2b]; §3.2: flux chịu ~350 °C, cao hơn hoá đen [S][12]',
    look: 'Cặn nâu/đen cứng quanh mối, cản thấm ướt.', cause: 'Giữ mũi quá lâu / quá nóng (> 350 °C).', fix: 'Cạo/IPA + bàn chải, flux mới, hàn lại nhanh.' },
  'solder-balls': { vi: 'Hạt thiếc văng (spatter)', mag: 1, fail: true, src: '§5.5 [V][2][2b]: kiểm KHÔNG phóng đại; §13.3',
    look: 'Hạt thiếc rời quanh mối.', cause: 'Thiếc chạm mũi quá nóng / mũi vừa lau bọt biển ướt, flux sôi.', fix: 'Gắp bằng nhíp; lau bùi nhùi đồng thay vì bọt biển ướt.' },
  untrimmed: { vi: 'Chân chưa cắt (untrimmed)', mag: 1, fail: true, src: '§5.3: max 2,5 mm (C2) / 1,5 mm (C3) [V][2]; §5.5',
    look: 'Chân nhô dài quá giới hạn.', cause: 'Chưa cắt / cắt chưa sát.', fix: 'Kìm cắt sát đỉnh mối, để lại 0,5–1,5 mm (§11.8).' },
  'protrusion-short': { vi: 'Chân không thấy đầu (< 0,5 mm)', mag: 1.75, fail: true, src: 'NASA 0,5 mm min [V][1]; IPC: đầu chân thấy được trong thiếc [V][2]',
    look: 'Không thấy đầu chân trong mối.', cause: 'Cắt quá sát / chân không xuyên hết.', fix: 'Không sửa được bằng thiếc — thay linh kiện nếu bắt buộc.' },
  measling: { vi: 'Đốm trắng nền (measling)', mag: 7.5, fail: true, src: '§4.2 [V][1]; §13.4 (7,5–10×); FR-4 Tg 130 °C, Td ~350 °C [V][24]',
    look: 'Đốm trắng dưới lớp phủ quanh pad.', cause: 'Nền FR-4 bị nung quá Td.', fix: 'Không sửa được; giảm nhiệt/thời gian.' },
  scorch: { vi: 'Cháy nền (nâu/đen)', mag: 1.75, fail: true, src: '§4.2 [V][1]',
    look: 'Nền bo quanh pad nâu sậm/đen.', cause: 'Nhiệt quá cao/quá lâu.', fix: 'Không sửa được; ghi nhận, giảm nhiệt.' },
  'component-damage': { vi: 'Linh kiện hỏng do nhiệt', mag: 1.75, fail: true, src: '§4.1–4.2, §13.2',
    look: 'LED epoxy vàng/đục · tụ hoá phồng/rò · vỏ connector chảy.', cause: 'Vượt giới hạn datasheet (nhiệt × thời gian), không kẹp tản nhiệt.', fix: 'Thay linh kiện; lần sau kẹp tản nhiệt, mũi phù hợp, ≤ 3 s.' },
  'mlcc-crack': { vi: 'Nứt tụ gốm (MLCC crack)', mag: 20, fail: true, src: '§4.2 [S][20]; §13.4 (20×)',
    look: 'Vết nứt rất nhỏ ở thân tụ.', cause: 'Sốc nhiệt: mũi > 350 °C, không preheat, ΔT > ~190 °C.', fix: 'Thay tụ; mũi ≤ 350 °C, preheat khi rework.' },
};

// ----------------------------------------------------------------------------- IPC-A-610E (docs §5.2, §5.3)
export const IPC = {
  2: { cls: 2, name: 'Class 2 — sản phẩm chuyên dụng', fill: 0.75, fillThermal: 0.5, primaryDeg: 180, secondaryDeg: 270, padCover: 0.75, protrMax: 2.5, protrMin: 0.5, maxAngle: 90, rosinFail: false },
  3: { cls: 3, name: 'Class 3 — hiệu năng cao (y tế, hàng không)', fill: 0.75, fillThermal: 0.75, primaryDeg: 270, secondaryDeg: 330, padCover: 0.75, protrMax: 1.5, protrMin: 0.5, maxAngle: 90, rosinFail: true },
};
export const IPC_SRC = 'IPC-A-610E Table 7-4 (redline Rev E) [V][2]; NASA-STD-8739.3 [V][1]';

// ----------------------------------------------------------------------------- phóng đại (docs §10.1, §10.2)
export const MAG_TABLE = [
  { land: '> 1,0 mm', min: 1.5, max: 3, referee: 4, gt: 1.0 },
  { land: '> 0,5 – ≤ 1,0 mm', min: 3, max: 7.5, referee: 10, gt: 0.5 },
  { land: '≥ 0,25 – ≤ 0,5 mm', min: 7.5, max: 10, referee: 20, gt: 0.25 },
  { land: '< 0,25 mm', min: 20, max: 20, referee: 40, gt: 0 },
];
export function magRangeFor(landMm) { return MAG_TABLE.find((r) => landMm > r.gt) || MAG_TABLE[MAG_TABLE.length - 1]; }
export const MAG_TOL = 0.15;           // ±15 % (§10.1)
export const LAMP_MAG = 2.25;          // đèn kính lúp 5 diopter = 5/4 + 1 = 2,25× (§10.2 [S][36]); 3 diopter = 1,75×
/** Lỗi `code` có nhận ra được ở độ phóng đại `mag` không (dung sai ±15 %) */
export const canSee = (code, mag) => (mag || 1) >= (DEFECTS[code]?.mag ?? 1) * (1 - MAG_TOL);

// ----------------------------------------------------------------------------- loại mối & chọn mũi (docs §1.4, §13.1)
export const JOINT_KINDS = {
  fine: { vi: 'chân/pad rất nhỏ', best: ['I', 'B05', '1C'], ok: ['B', 'J'] },
  small: { vi: 'THT pad Ø1,6–2,0 mm (điện trở, LED, tụ nhỏ)', best: ['D16', '2C'], ok: ['1C', 'D24', 'B', 'K'] },
  header: { vi: 'header / đế IC bước 2,54 mm', best: ['D16', '2C', 'K'], ok: ['1C', 'D24', 'B'] },
  power: { vi: 'cầu đấu / chân nguồn to / pad nối mass', best: ['D24', 'D32', '3C'], ok: ['4C', '2C', 'K'] },
};
export function tipVerdict(code, kind) {
  const k = JOINT_KINDS[kind] || JOINT_KINDS.small;
  if (k.best.includes(code)) return { ok: true, level: 'best', text: `Mũi ${code} đúng cho ${k.vi}` };
  if (k.ok.includes(code)) return { ok: true, level: 'ok', text: `Mũi ${code} tạm được cho ${k.vi} (tốt nhất: ${k.best.join('/')})` };
  return { ok: false, level: 'poor', text: `Mũi ${code} KHÔNG hợp cho ${k.vi} — nên dùng ${k.best.join('/')}` };
}

// ----------------------------------------------------------------------------- quy trình 14 bước (docs §11)
export const WORKFLOW = [
  ['Chuẩn bị bàn', 'Đèn ≥ 1000 lm/m²; hút khói; thảm + vòng ESD; trạm hàn nối đất', '[V][2][33][S][35]'],
  ['Hồ sơ', 'Sơ đồ, BOM, layout, hướng dẫn hàn', 'NASA [V][1]'],
  ['Kiểm tra bo trần', 'Xước, pad oxy hoá; hút ẩm 93 °C ≥ 2 h nếu cần', '[V][1]'],
  ['Kitting', 'Xếp linh kiện theo BOM, kiểm giá trị', '[TK]'],
  ['Uốn chân', '2×D từ thân; bán kính theo IPC Table 7-1', '[V][1][2]'],
  ['Lắp thấp → cao', 'Điện trở/diode → socket → tụ gốm → LED/transistor (kẹp tản nhiệt) → tụ hoá → connector', '[TK]'],
  ['Hàn', '330–350 °C (chì) / 350–380 °C (không chì), mũi D16/C2, 2–4 s/mối; nhạy nhiệt ≤ 3 s', '[V][5][12][15–17]'],
  ['Cắt chân', 'Kìm cắt sát, để lại 0,5–1,5 mm', '[V][1][2]'],
  ['Kiểm tra dưới kính', '1,5–3× (pad > 1 mm), nghi ngờ → 4× trọng tài; NASA 4–10×', '[V][1][2]'],
  ['Làm sạch', 'IPA + bàn chải trong ½ h; không siêu âm', '[V][1][12]'],
  ['Kiểm tra lại', 'Sau làm sạch (cặn trắng, sót lỗi)', '[V][1]'],
  ['Đo thông mạch', 'Điện trở nguồn–GND phải CAO (không chập)', '[S][40]'],
  ['Cấp nguồn lần đầu', 'Nguồn giới hạn dòng ~30 % trên dòng dự kiến; chạm giới hạn + áp tụt → chập', '[S][40]'],
  ['Ghi chép', 'Kết quả kiểm tra, lỗi đã sửa, ảnh', 'NASA 13.3 [V][1]'],
];

// ----------------------------------------------------------------------------- thẻ bài học tổng quát
export const LESSONS = {
  temperature: {
    title: 'Nhiệt độ & thời gian hàn', src: '§3',
    body: [
      ['Sn63Pb37', 'Chảy 183 °C (cùng tinh). Mũi 315–371 °C (Kester 44 [S][9]); Hakko: bắt đầu 330–350 °C, càng thấp càng tốt [V][5]; SparkFun 325–375 °C [V][12].'],
      ['SAC305', '217–220 °C [V][10]; mũi thường 350–400 °C — cao hơn có chì 30–40 °C [V][13].'],
      ['Thời gian', 'Mối THT thường 2–4 s [TK]; linh kiện nhạy nhiệt ≤ 3 s [V][15–18]; > 5 s chưa chảy tốt → ĐỔI MŨI LỚN, đừng tăng nhiệt bừa [V][4][13].'],
      ['Thứ tự xử lý mối nặng', 'Tăng kích thước mũi → thêm flux → preheat → cuối cùng mới tăng nhiệt (§3.5 [V][4][11][13]).'],
      ['Flux', 'Phần lớn flux chịu ~350 °C; cao hơn phân huỷ, hoá đen [S][12]. Khói nhiều = nhiệt quá cao [V][12].'],
    ],
  },
  tipcare: {
    title: 'Chăm sóc mũi hàn', src: '§2',
    body: [
      ['Mũi mới', 'Bật máy, để trên giá đến khi nóng, làm sạch rồi PHỦ THIẾC toàn bộ vùng mạ sẵn [V][5].'],
      ['Khi làm việc', 'Đặt nhiệt thấp nhất có thể; giữ vùng mạ luôn được thiếc thấm ướt; tắt máy nếu nghỉ > 5 phút [V][5].'],
      ['Cất mỏ', 'Phủ một lớp thiếc rồi mới đặt vào giá — KHÔNG lau rồi để (mũi trần oxy hoá) [V][5].'],
      ['Bọt biển vs bùi nhùi', 'Bọt biển ướt gây sốc nhiệt lặp lại → mỏi kim loại [S][30]; bùi nhùi đồng giữ lớp thiếc, không sụt nhiệt [V][5][12].'],
      ['Oxy hoá', 'Tăng theo nhiệt độ (hàm mũ) [V][11]; thiếc không chì oxy hoá nhanh 4–5× [V][5b]. Không dùng giũa/giấy nhám (mất lớp mạ sắt) [V][11].'],
      ['Sleep mode', 'Hạ nhiệt dưới điểm chảy khi đặt lên giá + tự tắt → tuổi thọ mũi tới 5× (JBC [V][11]).'],
    ],
  },
  tipchange: {
    title: 'Thay mũi hàn', src: '§2.1–2.2',
    body: [
      ['Mũi lồng ống (900M/T18)', 'Tắt nguồn, để nguội; vặn đai ốc ~90°, rút mũi, lắp mũi mới, vặn lại [S][29]. Có thể cần hiệu chỉnh nhiệt [V][6].'],
      ['Mũi tích hợp (T12)', 'Thay khi nóng được nhưng PHẢI kẹp bằng miếng chịu nhiệt (B2300), rút thẳng; không giữ phần nóng lâu [V][7][S][8b].'],
      ['Mũi nóng tháo ra', 'Đặt vào khay/giá mũi (B2756) — không đặt lên bàn [V][7].'],
      ['Sau khi lắp', 'Bật máy, chờ lên nhiệt, PHỦ THIẾC NGAY — mũi mới để trần ở nhiệt cao sẽ oxy hoá đen, mất thấm ướt [V][5].'],
    ],
  },
  cleaning: {
    title: 'Làm sạch sau hàn', src: '§6.10, §7.2',
    body: [
      ['No-clean', 'Cặn no-clean có thể để lại (Class 2); nếu muốn sạch: IPA + bàn chải, lau khô bằng giấy không xơ [V][12].'],
      ['Rosin / RMA', 'Thiếc lõi ROM1 (Kester 44, ~RMA): làm sạch theo yêu cầu; NASA: trong ½ giờ sau khi hàn, không dùng siêu âm cho bo có linh kiện [V][1].'],
      ['Flux cháy đen', 'Cứng, khó tan — phải chà kỹ; nó cản thấm ướt nếu hàn lại [V][2b].'],
      ['Water-soluble', 'Cặn ăn mòn — BẮT BUỘC rửa nước khử ion nóng [S][31][V][12].'],
    ],
  },
  magnification: {
    title: 'Phóng đại kiểm tra (IPC-A-610E Table 1-2)', src: '§10',
    body: [
      ['Pad > 1,0 mm', '1,5–3× · trọng tài 4×'], ['Pad 0,5–1,0 mm', '3–7,5× · trọng tài 10×'], ['Pad 0,25–0,5 mm', '7,5–10× · trọng tài 20×'], ['Pad < 0,25 mm', '20× · trọng tài 40×'],
      ['Dung sai', '±15 %. Văng thiếc kiểm KHÔNG phóng đại [V][2].'],
      ['Kính lúp đèn', '× = diopter/4 + 1 → 3 diopter = 1,75×, 5 diopter = 2,25× [S][36] (đèn ghi "5×" thường là 5 diopter!).'],
      ['Stereo', '7–45×, WD 100 mm (Barlow 0,5× → 200 mm) [V][38]; có chiều sâu 3D — bắt buộc khi hàn. Kính USB: không chiều sâu, có trễ — chủ yếu để chụp [V][37].'],
      ['NASA', 'Kiểm 4–10×, tăng thêm khi nghi lỗi; ánh sáng không bóng ≥ 1077 lm/m² [V][1].'],
    ],
  },
  ipc: {
    title: 'Tiêu chí IPC-A-610E cho mối xuyên lỗ', src: '§5.2–5.3',
    body: [
      ['Điền lỗ (vertical fill)', 'Class 2/3: ≥ 75 % (mục tiêu 100 %). Ngoại lệ Class 2: 50 % nếu lỗ nối lớp tản nhiệt [V][2].'],
      ['Mặt linh kiện', 'Thấm quanh chân & thành lỗ: Class 2 ≥ 180°, Class 3 ≥ 270° [V][2].'],
      ['Mặt hàn', 'Fillet & thấm quanh chân: Class 1/2 ≥ 270°, Class 3 ≥ 330°; pad phủ ≥ 75 % [V][2].'],
      ['Góc thấm ướt', 'Không vượt 90° [V][2]. Mối không chì hơi xỉn vẫn chấp nhận.'],
      ['Độ nhô chân', 'Thấy đầu chân; max 2,5 mm (Class 2), 1,5 mm (Class 3); NASA 0,5–2,29 mm [V][1][2].'],
      ['NASA', 'Nhẵn, không rỗ, không xáo động, satin → sáng; fillet lõm quanh toàn chu vi; thấy đường viền chân [V][1].'],
    ],
  },
  heatsink: {
    title: 'Kẹp tản nhiệt (thermal shunt)', src: '§6.11',
    body: [
      ['Là gì', 'Kẹp cá sấu đồng (dẫn nhiệt ~10× thép) kẹp lên chân GIỮA thân và mối hàn [S][27].'],
      ['Khi nào', 'LED, transistor, diode, linh kiện nhạy nhiệt — NASA yêu cầu thermal shunt khi nhiệt có thể làm hỏng linh kiện [V][1].'],
      ['Hiệu quả (game)', 'Nhiệt truyền tới thân giảm còn ~30 % [TK].'],
    ],
  },
};
