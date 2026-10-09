// =============================================================================
// _solder_physics.js — Mô hình VẬT LÝ mối hàn (thuần số, không THREE, không DOM) cho minigames/soldering.js.
// (KHÔNG export default.)
//
// Mỗi pad được coi là MỘT KHỐI NHIỆT tập trung (lumped): vòng đồng + đoạn chân linh kiện xuyên lỗ + thiếc đã có
// + một phần FR-4 xung quanh. Phương trình cân bằng năng lượng (đơn vị SI: J, W, K):
//
//     C · dT/dt = G·(T_mũi − T) − h·(T − T_môi_trường) − P_nóng_chảy + Σ k·(T_cầu − T)
//
//   C  (J/K)  nhiệt dung: pad đồng Ø1.8 + chân Ø0.6 + thiếc (8.4 g/cm³ × 0.18 J/gK ≈ 0.0015 J/K mỗi mm³)
//   h  (W/K)  hệ số tản: dẫn nhiệt dọc chân linh kiện vào thân + vào FR-4 + đối lưu. Pad nối mặt đồng lớn (ground plane,
//             pad dây của module nguồn) có h lớn gấp nhiều lần → phải tăng nhiệt / dùng mũi to.
//   G  (W/K)  độ dẫn nhiệt tiếp xúc mũi ↔ mối hàn: tiếp xúc KHÔ (điểm chạm kim loại–kim loại) chỉ ~0.045 W/K;
//             khi có "cầu thiếc lỏng" giữa mũi và pad (mũi đã tráng thiếc / thiếc đã chảy trên pad) lên ~0.45 W/K
//             (thiếc k ≈ 50 W/mK, diện tích vài mm², dày ~0.3 mm). Mũi bị oxy hoá (đen) → G giảm mạnh.
//   P_nóng_chảy  nhiệt để nung chảy dây thiếc mới đưa vào: 0.0084 g/mm³ × (0.18 J/gK × 155 K + 45 J/g ẩn nhiệt) ≈ 0.61 J/mm³.
//
// Với pad board đục lỗ (C ≈ 0.04 J/K, h ≈ 0.036 W/K) và mũi 350 °C đã tráng thiếc: τ = C/(G+h) ≈ 0.35 s,
// pad đạt ~230 °C sau ≈ 0.7–1 s ⇒ đúng kinh nghiệm "chạm mũi 1–2 s rồi mới đưa thiếc".
// Rút mũi: pad nguội với τ = C/h ≈ 1.2 s ⇒ thiếc đông lại sau ~1 s.
//
// Thấm ướt (wetting): thiếc lỏng chỉ "ăn" vào đồng sạch khi đủ QUÁ NHIỆT so với nhiệt độ chảy lỏng và còn nhựa thông
// (flux khử lớp oxit). Tốc độ thấm: dW/dt = K·(1−W)·s²·a_flux·(1 − 0.7·oxit), s = (T − T_lỏng)/(T_chảy_loang − T_lỏng).
// Nhựa thông bay hơi/cháy theo Arrhenius gần đúng: k = 0.06·e^((T−250)/55) /s (ở 350 °C còn ~4 s; ở 420 °C chỉ ~1 s).
// Thiếc lỏng không có nhựa thông → oxy hoá bề mặt → xỉn, sần (mối hàn "nguội" về hình thức lẫn điện).
// Bong pad: lớp keo epoxy giữa đồng và FR-4 mất bám — "liều nhiệt" quy về giây-tương-đương ở 350 °C (Td FR-4 ~350 °C [V][24]),
//   ngưỡng 8 s (docs/07 §13.2 "> 8 s liên tục"). 
//
// [PRO] Nâng cấp theo docs/07_KIEN_THUC_HAN_MACH.md (§12, §13):
//   • G phụ thuộc HÌNH DẠNG MŨI: G_ướt = 0.17·(A_tiếp_xúc + 0.5) W/K (A từ bảng §13.1, bị giới hạn bởi kích thước mối) —
//     mũi B05 (0.12 mm²) chỉ ~0.1 W/K, mũi 2C (2 mm²) ~0.43 W/K. Đầu mũi có khối nhiệt riêng (items/tools/soldering-iron.js).
//   • Flux tiếp xúc mũi cháy theo nhiệt độ hỗn hợp (0.6·T_mũi + 0.4·T_pad); phần cháy > 280 °C thành THAN (pad.char) — than
//     chặn thấm ướt: W_max = 1 − 0.8·min(1, char/0.3) → mối không thấm / co thiếc (§4.2, §13.3).
//   • Liều nhiệt nền FR-4 (pad.boardDose): đốm trắng (measling) → cháy nâu → cháy đen (§4.2, §13.2).
//   • Liên kim (pad.imc) khi giữ thiếc lỏng lâu/nóng → mối xỉn sần "overheated" (§4.2 [S][25]).
// =============================================================================

export const AMBIENT_FALLBACK = 30;            // °C (phòng lab Việt Nam)
export const WIRE_FLUX_PER_MM3 = 0.12;         // "đơn vị hoạt tính" nhựa thông mang theo trong lõi dây (2.2 % khối lượng)
export const PEN_FLUX_PER_ML = 40;             // bút nhựa thông: 0.03 ml/s × 40 → ~1.2 đơn vị/s
export const MELT_J_PER_MM3 = 0.61;            // J để nung chảy 1 mm³ thiếc từ 30 °C (nhiệt hiện + ẩn nhiệt)
export const SOLDER_C_PER_MM3 = 0.0015;        // J/K mỗi mm³ thiếc
export const G_DRY = 0.045;                    // W/K — tiếp xúc khô
export const G_WET = 0.45;                     // W/K — có cầu thiếc lỏng
export const CONTACT_IRON_MM = 1.2;            // mũi hàn cách bề mặt mối hàn ≤ 1.2 mm = "chạm"
export const CONTACT_WIRE_MM = 1.5;            // đầu dây thiếc cách chỗ tiếp xúc pad/chân ≤ 1.5 mm
export const NEAR_IRON_MM = 2.6;               // đầu dây thiếc cách mũi hàn ≤ 2.6 mm = chạm mũi
export const LIFT_T = 350;                     // °C — nhiệt quy chiếu liều bong pad (Td FR-4 ~350 °C, docs §4.1 [V][24])
export const LIFT_SECONDS = 8;                 // "giây tương đương ở 350 °C" trước khi bong pad (docs §13.2: > 8 s liên tục)
export const LIFT_DIV = 30;                    // °C — liều tăng e lần mỗi +30 °C
export const CHAR_FULL = 0.3;                  // lượng than flux chặn hoàn toàn thấm ướt
export const FILM_MM3 = 0.35;                  // lớp thiếc mỏng còn lại sau khi hút — coi như pad trống

/** Hợp kim thiếc theo cuộn: solidus/liquidus (°C) + nhiệt độ thiếc bắt đầu CHẢY LOANG trên đồng (wetting) */
export const ALLOYS = {
  Sn63Pb37: { id: 'Sn63Pb37', name: 'Sn63/Pb37 (có chì, cùng tinh)', solidus: 183, liquidus: 183, flowT: 230 },
  Sn60Pb40: { id: 'Sn60Pb40', name: 'Sn60/Pb40', solidus: 183, liquidus: 190, flowT: 235 },
  SAC305: { id: 'SAC305', name: 'SAC305 (không chì Sn96.5/Ag3/Cu0.5)', solidus: 217, liquidus: 221, flowT: 262 },
};
export function alloyOf(nameOrDef) {
  const s = String(nameOrDef?.alloy ?? nameOrDef ?? '').replace(/[\s/._-]/g, '').toLowerCase();
  if (s.includes('sac') || s.includes('leadfree') || s.includes('khongchi')) return ALLOYS.SAC305;
  if (s.includes('sn60')) return ALLOYS.Sn60Pb40;
  return ALLOYS.Sn63Pb37;
}

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const clamp01 = (x) => clamp(x, 0, 1);

/**
 * Thông số nhiệt của chân linh kiện (theo loại): r (mm bán kính), C (J/K thêm), h (W/K thêm).
 * Chân to/kim loại khối (cầu đấu vít, TO-220 có tản nhiệt) hút nhiệt nhiều hơn → lâu nóng hơn.
 */
export function leadThermal(def) {
  const id = String(def?.id || ''), cat = String(def?.category || '');
  if (/screw-terminal/.test(id)) return { r: 0.5, C: 0.06, h: 0.03 };
  if (/irlz44|to220|7805/.test(id)) return { r: 0.42, C: 0.05, h: 0.035 };
  if (/1000uf/.test(id)) return { r: 0.4, C: 0.02, h: 0.012 };
  if (/header/.test(id)) return { r: 0.34, C: 0.01, h: 0.006 };
  if (/dip\d+-socket/.test(id)) return { r: 0.26, C: 0.006, h: 0.004 };
  if (/xt60/.test(id)) return { r: 1.2, C: 0.4, h: 0.08 };
  if (cat === 'module') return { r: 0.34, C: 0.02, h: 0.012 };
  return { r: 0.3, C: 0.008, h: 0.006 };
}

/** Khởi tạo các trường mô hình cho một bản ghi pad (từ padRecord trong items/parts/_shared.js) */
export function initPad(pad, ambient = AMBIENT_FALLBACK) {
  if (pad._phys) return pad;
  const tm = pad.thermalMass ?? 1;
  const ring = pad.ring ?? 0.9;
  const k = (ring / 0.9) ** 2;
  pad._phys = {
    C0: 0.05 * tm,          // J/K — pad đồng + FR-4 quanh lỗ (perfboard tm 0.6 → 0.03 J/K)
    h0: 0.06 * (tm <= 1 ? tm : Math.pow(tm, 0.7)),   // W/K — pad nối mặt đồng lớn (tm > 1): tản theo tm^0.7 [TK]
    k,                      // tỉ lệ diện tích vòng đồng so với pad chuẩn Ø1.8
  };
  pad.T = Number.isFinite(pad.T) && pad.T > ambient - 1 ? pad.T : ambient;
  pad.solderVol = pad.solderVol ?? pad.V ?? 0;
  pad.V = pad.solderVol;
  pad.flux = pad.flux ?? 0;
  pad.wetting = pad.wetting ?? 0;
  pad.oxide = pad.oxide ?? 0;
  pad.state = pad.state || 'empty';
  pad.peakT = pad.peakT ?? pad.T;
  pad.molten = false;
  pad.overheat = 0;
  pad.alloy = pad.alloy || null;
  pad.bridges = pad.bridges || [];      // khoá pad bên cạnh bị cầu thiếc ('boardUid/padId')
  pad.lead = pad.lead || null;          // { item, pinId, r, L, C, h, trimmed }
  pad.leadId = pad.leadId ?? null;
  pad.issues = pad.issues || [];
  pad.reworked = false;
  pad.leadWet = 0;
  pad.char = pad.char || 0;             // [PRO] than flux (cặn cháy)
  pad.boardDose = pad.boardDose || 0;   // [PRO] liều nhiệt nền FR-4
  pad.imc = 0;                          // [PRO] liều liên kim (giây-tương-đương ở 320 °C)
  pad.moltenT = 0;                      // [PRO] tổng thời gian thiếc lỏng trong lần hàn này
  pad.defects = pad.defects || {};      // [PRO] lỗi phụ: icicle, disturbed, pinhole, balls, overheated…
  pad.version = pad.version || 0;       // [PRO] tăng mỗi khi mối thay đổi (phiếu kiểm tra cũ hết hiệu lực)
  pad.residue = pad.residue || { rma: 0, nc: 0 };   // [PRO] cặn flux theo loại (thiếc lõi RMA / bút no-clean)
  return pad;
}

/** Ngưỡng lượng thiếc (mm³) cho pad: [ít nhất, lý tưởng, nhiều nhất, bắt đầu tràn sang pad bên] */
export function volumeLimits(pad) {
  const k = pad._phys?.k ?? 1;
  const lead = pad.lead ? 1 : 0.7;
  // lỗ Ø1.0 + chân Ø0.6 dày 1.6 mm: lấp lỗ ≈ 0.8 mm³; nón chân ≈ 1.1 mm³ ⇒ lý tưởng ≈ 1.9 mm³ (≈ 3.8 mm dây Ø0.8)
  return { min: 0.9 * k * lead, ideal: 1.9 * k * lead, max: 3.4 * k * lead, bridge: 5.6 * k * lead };
}

/** Nhiệt dung & hệ số tản tức thời của pad */
export function padCH(pad, extraC = 0, extraH = 0) {
  const P = pad._phys;
  const L = pad.lead;
  const C = P.C0 + (L ? L.C : 0) + pad.solderVol * SOLDER_C_PER_MM3 + extraC;
  const h = P.h0 + (L ? L.h : 0) + extraH;
  return { C, h };
}

/** Diện tích (mm²) tối đa mũi có thể áp lên một mối THT (vòng đồng + chân) */
export function jointArea(pad) {
  const k = pad?._phys?.k ?? 1;
  const big = (pad?.thermalMass ?? 1) >= 2 ? 1.8 : 1;
  return 2.2 * k * big;
}

/**
 * Độ dẫn nhiệt tiếp xúc mũi ↔ mối hàn (W/K).
 *   tipWet: iron.def.wetting(inst) 0..1 (mũi sạch, có thiếc = 1; oxy hoá đen → ~0)
 *   tinned: lớp thiếc trên mũi 0..1 · blob: giọt thiếc lỏng đang bám trên mũi (mm³)
 *   along: khoảng cách (mm) từ chỗ chạm tới mặt pad dọc theo chân (chạm đầu chân xa pad → truyền nhiệt kém)
 *   area: diện tích tiếp xúc THT của mũi (docs/07 §13.1) — mặc định 2.15 mm² (≈ hằng số G_WET cũ 0.45 W/K) · width: bề rộng mũi (mm)
 */
export function contactG(pad, { tipWet = 1, tinned = 0.5, blob = 0, along = 0, wick = false, alloy = ALLOYS.Sn63Pb37, area = 2.15, width = 2.0 } = {}) {
  const moltenPool = pad.T > alloy.liquidus && pad.solderVol > 0.05 ? clamp01(pad.solderVol / 0.6) : 0;
  // lớp thiếc lỏng trên mũi đã tráng tạo ngay "cầu nhiệt" khi chạm (docs §6.4 "heat bridge")
  const bridge = clamp01(tinned + moltenPool + clamp01(blob / 0.4) + (wick ? 0.55 : 0));
  const A = Math.min(area, jointArea(pad));
  const gWet = 0.17 * (A + 0.25 + 0.15 * width);          // + ngấn thiếc quanh chỗ chạm (rộng theo cỡ mũi)
  const gDry = 0.1 * gWet;
  const fluxK = 1 + 0.35 * clamp01(pad.flux / 0.3);
  const dist = 1 / (1 + Math.max(0, along - 0.8) / 1.5);   // 0.8 mm đầu tiên = ngay chỗ tiếp xúc pad/chân
  return (gDry + (gWet - gDry) * bridge) * (0.2 + 0.8 * clamp01(tipWet)) * fluxK * dist * (wick ? 0.75 : 1);
}

/**
 * Một bước nhiệt cho pad. Trả về công suất mũi hàn truyền vào (W, ≥ 0 khi mũi nóng hơn).
 *   ext = { tipT, G, ambient, Pmelt, extraC, extraH, coupling: [[padKhác, k]] }
 */
export function stepThermal(pad, dt, ext) {
  const { C, h } = padCH(pad, ext.extraC || 0, ext.extraH || 0);
  let Pin = 0;
  if (ext.G > 0 && Number.isFinite(ext.tipT)) Pin = ext.G * (ext.tipT - pad.T);
  // chia bước con nếu hằng số thời gian nhỏ hơn dt (ổn định số học)
  const tau = C / Math.max(1e-6, h + (ext.G || 0) + (ext.coupling ? ext.coupling.reduce((s, c) => s + c[1], 0) : 0));
  const n = Math.min(20, Math.max(1, Math.ceil(dt / (tau * 0.5))));
  const hdt = dt / n;
  for (let i = 0; i < n; i++) {
    const pin = ext.G > 0 ? ext.G * (ext.tipT - pad.T) : 0;
    let pc = 0;
    if (ext.coupling) for (const [q, k] of ext.coupling) pc += k * (q.T - pad.T);
    pad.T += ((pin - h * (pad.T - ext.ambient) - (ext.Pmelt || 0) + pc) / C) * hdt;
  }
  if (!Number.isFinite(pad.T)) pad.T = ext.ambient;
  pad.T = clamp(pad.T, ext.ambient - 5, 600);
  return Math.max(0, Pin);
}

/**
 * Nhựa thông cháy/bay hơi + than + oxy hoá + thấm ướt + liều nhiệt (gọi mỗi bước khi pad hoạt động).
 *   Tflux: nhiệt độ nơi flux tiếp xúc (mũi đang chạm → 0.6·T_mũi + 0.4·T_pad; không chạm → T_pad)
 */
export function stepChemistry(pad, dt, alloy, Tflux = pad.T) {
  const out = { fluxBurn: 0, boiling: false, charred: 0 };
  pad.char = pad.char || 0;
  // nhựa thông: sôi lăn tăn từ ~150 °C, cháy nhanh trên 350 °C (docs §3.2 [S][12])
  const Tf = Math.max(pad.T, Tflux);
  if (pad.flux > 1e-4 && Tf > 120) {
    const k = 0.06 * Math.exp((Tf - 250) / 55);
    const burn = pad.flux * (1 - Math.exp(-k * dt));
    pad.flux -= burn;
    out.fluxBurn = burn;
    out.boiling = pad.T > 150;
    // phần cháy ở > 280 °C hoá than (cặn nâu/đen cứng — docs §4.2)
    const ch = burn * clamp01((Tf - 280) / 60);
    if (ch > 0) { pad.char = Math.min(1.5, pad.char + ch); out.charred = ch; }
  }
  if (pad.flux < 1e-4) pad.flux = 0;
  const molten = pad.solderVol > 0.05 && pad.T > alloy.liquidus;
  if (molten) {
    // oxit: thiếc lỏng trần (không nhựa thông) bị oxy hoá; nhựa thông khử oxit
    if (pad.flux < 0.04) pad.oxide = clamp01(pad.oxide + 0.35 * dt * (pad.T / 300));
    else pad.oxide = clamp01(pad.oxide - 0.9 * dt * clamp01(pad.flux / 0.2));
    // thấm ướt — than flux chặn (giới hạn trên Wmax)
    const s = clamp((pad.T - alloy.liquidus) / Math.max(5, alloy.flowT - alloy.liquidus), 0, 1.6);
    const fluxAct = 0.12 + 0.88 * clamp01(pad.flux / 0.25);
    const charK = clamp01(pad.char / CHAR_FULL);
    const Wmax = 1 - 0.8 * charK;
    const rate = 3.2 * s * s * fluxAct * (1 - 0.7 * pad.oxide) * (1 - 0.5 * charK);
    if (pad.wetting < Wmax) pad.wetting += (Wmax - pad.wetting) * (1 - Math.exp(-rate * dt));
    else pad.wetting += (Wmax - pad.wetting) * (1 - Math.exp(-0.8 * dt));      // co thiếc (dewetting) khi than lan ra
    // chân linh kiện thấm chậm hơn pad một chút (khối nhiệt chân phải nóng theo)
    if (pad.lead) pad.leadWet += (pad.wetting - pad.leadWet) * (1 - Math.exp(-rate * 0.7 * dt));
    if (pad.T > pad.peakT) pad.peakT = pad.T;
    // lớp liên kim Cu6Sn5/Cu3Sn dày lên theo nhiệt × thời gian (docs §4.2 [S][25]) — giây-tương-đương ở 320 °C
    pad.imc = (pad.imc || 0) + dt * Math.exp((pad.T - 320) / 30);
    pad.moltenT = (pad.moltenT || 0) + dt;
  }
  // bong pad: "liều nhiệt" kiểu Arrhenius — keo epoxy giữa đồng và FR-4 xuống cấp nhanh gấp e lần mỗi +30 °C.
  // Quy đổi về giây-tương-đương ở 350 °C: 8 s @350 °C · ~4,1 s @370 °C · ~2,1 s @390 °C · > 30 s @310 °C.
  if (pad.T > 300) {
    const d = dt * Math.exp((pad.T - LIFT_T) / LIFT_DIV);
    pad.overheat += d;
    pad.boardDose = (pad.boardDose || 0) + d;            // nền FR-4 quanh pad (không giảm — vết cháy là vĩnh viễn)
  } else if (pad.T < 280) pad.overheat = Math.max(0, pad.overheat - 0.1 * dt);
  return out;
}

/**
 * Đánh giá chất lượng khi thiếc ĐÔNG lại.
 * → { state:'empty'|'cold'|'good'|'excess'|'bridge'|'lifted', issues:[chuỗi tiếng Việt], stats }
 */
export function evaluateJoint(pad, alloy) {
  const lim = volumeLimits(pad);
  const V = pad.solderVol;
  const issues = [];
  let state;
  if (pad.state === 'lifted') state = 'lifted';
  else if (pad.bridges.length) { state = 'bridge'; issues.push('Cầu thiếc sang pad bên cạnh — chập mạch'); }
  else if (V < FILM_MM3) state = 'empty';
  else {
    const leadOk = !pad.lead || pad.leadWet >= 0.5;
    const hot = pad.peakT >= alloy.flowT - 8;
    if (!hot) issues.push(`Pad chỉ đạt ${Math.round(pad.peakT)} °C (< ${alloy.flowT} °C) — thiếc không chảy loang`);
    if (pad.wetting < 0.6) issues.push(`Thấm ướt kém (${Math.round(pad.wetting * 100)} %)`);
    if (!leadOk) issues.push('Thiếc không bám chân linh kiện');
    if (pad.oxide > 0.6) issues.push('Thiếc bị oxy hoá (hết nhựa thông) — xỉn, sần');
    if (V < lim.min) issues.push(`Thiếu thiếc (${V.toFixed(1)} mm³ < ${lim.min.toFixed(1)})`);
    if (!hot || pad.wetting < 0.6 || !leadOk || (pad.oxide > 0.6 && pad.wetting < 0.85) || V < lim.min) state = 'cold';
    else if (V > lim.max) { state = 'excess'; issues.push(`Thừa thiếc (${V.toFixed(1)} mm³ > ${lim.max.toFixed(1)}) — cục tròn che mất chân`); }
    else state = 'good';
  }
  return {
    state, issues,
    stats: { volume: +V.toFixed(2), wetting: +pad.wetting.toFixed(2), leadWet: +pad.leadWet.toFixed(2), peakT: Math.round(pad.peakT), flux: +pad.flux.toFixed(2), oxide: +pad.oxide.toFixed(2), alloy: alloy.id, limits: lim },
  };
}

/** Nhãn + màu trạng thái (HUD) */
export const STATE_INFO = {
  empty: { vi: 'TRỐNG', color: '#9fb3c8' },
  molten: { vi: 'ĐANG CHẢY', color: '#ffd166' },
  heating: { vi: 'ĐANG NUNG', color: '#ff9f43' },
  cold: { vi: 'NGUỘI ✗', color: '#ff8f8f' },
  good: { vi: 'ĐẸP ✓', color: '#5fe39a' },
  excess: { vi: 'THỪA THIẾC', color: '#ffcf5c' },
  bridge: { vi: 'CẦU THIẾC ✗', color: '#ff5d5d' },
  lifted: { vi: 'BONG PAD ✗', color: '#ff5d5d' },
};

/** Thông báo kết quả mối hàn (toast) */
export function jointToast(state, issues = []) {
  switch (state) {
    case 'good': return { msg: 'Mối hàn ĐẸP ✓ — nón bóng, thấm đều pad và chân', kind: 'success' };
    case 'cold': return { msg: `Mối hàn NGUỘI — hàn lại${issues[0] ? ` (${issues[0]})` : ''}`, kind: 'warn' };
    case 'excess': return { msg: 'Thừa thiếc — mối hàn thành cục tròn, dùng dây hút thiếc rút bớt', kind: 'warn' };
    case 'bridge': return { msg: 'CẦU THIẾC sang pad bên cạnh — CHẬP MẠCH! Chấm nhựa thông rồi kéo mũi / hút thiếc', kind: 'danger' };
    case 'lifted': return { msg: 'BONG PAD — giữ mỏ hàn quá lâu / quá nóng, vòng đồng đã tróc khỏi board', kind: 'danger' };
    case 'empty': return { msg: 'Đã gỡ sạch thiếc khỏi pad', kind: 'info' };
    default: return null;
  }
}
