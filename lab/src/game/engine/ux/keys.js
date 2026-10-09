// =============================================================================
// ux/keys.js — Phím tắt hiển thị đẹp + bảng nhãn hành động dùng chung cho HUD / gợi ý nổi / mẹo lần đầu.
//
//   keyCapHtml(key, { hold, small }) → HTML nắp phím (phím bàn phím = nắp sáng; chuột = hình con chuột có nút tô màu)
//   keyText(key) → chữ ngắn ('E', 'Chuột trái', 'Cuộn'…) · toolUseLabel(inst) / toolScrollLabel(inst) · scrollLabelFor(spec)
//   iconFor(spec, prompt, item) → emoji biểu tượng cho chip gợi ý nổi · tipKindOf(target) → loại vật cho "mẹo lần đầu"
//   TIPS[kind] = { icon, title, body:[[key, text]…] }
// Không phụ thuộc DOM (chạy được trong Node).
// =============================================================================
import { toolKind } from '../items.js';

export const KEY_TEXT = {
  LMB: 'Chuột trái', RMB: 'Chuột phải', MMB: 'Chuột giữa', WHEEL: 'Cuộn', Space: 'Space', Shift: 'Shift', Tab: 'Tab', Esc: 'Esc',
};
export const keyText = (k) => KEY_TEXT[k] || k;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Biểu tượng chuột SVG: nút nào được tô (l | r | m | wheel) */
function mouseSvg(which) {
  const on = '#2f9fe0', off = 'rgba(13,21,32,.18)';
  const l = which === 'l' ? on : off, r = which === 'r' ? on : off, m = which === 'm' || which === 'wheel' ? on : 'rgba(13,21,32,.45)';
  const arrows = which === 'wheel' ? '<path d="M12 2.2l-1.6 1.7h3.2zM12 13.6l-1.6-1.7h3.2z" fill="#0d1520"/>' : '';
  return `<svg class="ms" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 2.8c-3.9 0-6.2 2.5-6.2 6.4v5.6c0 3.9 2.6 6.4 6.2 6.4s6.2-2.5 6.2-6.4V9.2c0-3.9-2.3-6.4-6.2-6.4z" fill="#f4f7fa" stroke="#0d1520" stroke-width="1.3"/><path d="M12 3.4V10H6.4V9.2C6.4 5.9 8.4 3.6 12 3.4z" fill="${l}"/><path d="M12 3.4V10h5.6V9.2c0-3.3-2-5.6-5.6-5.8z" fill="${r}"/><rect x="11" y="5" width="2" height="4.2" rx="1" fill="${m}"/>${arrows}</svg>`;
}
const MOUSE = { LMB: 'l', RMB: 'r', MMB: 'm', WHEEL: 'wheel' };

/** HTML nắp phím. hold → nhãn "Giữ" phía trước. */
export function keyCapHtml(key, { hold = false, small = false } = {}) {
  const parts = String(key).split('/').map((x) => x.trim()).filter(Boolean);
  const one = (k) => {
    if (MOUSE[k]) return `<span class="rvk mouse${small ? ' sm' : ''}" title="${esc(keyText(k))}">${mouseSvg(MOUSE[k])}<b>${k === 'WHEEL' ? 'Cuộn' : k === 'LMB' ? 'Trái' : k === 'RMB' ? 'Phải' : 'Giữa'}</b></span>`;
    const wide = k.length > 2 ? ' wide' : '';
    return `<span class="rvk${wide}${small ? ' sm' : ''}">${esc(k === 'Space' ? 'Space' : k)}</span>`;
  };
  return `${hold ? '<span class="rvk-hold">Giữ</span>' : ''}${parts.map(one).join('<i class="rvk-or">/</i>')}`;
}

// ---------------------------------------------------------------------------- nhãn dụng cụ
const USE_BY_ID = {
  'soldering-iron': 'Hàn', 'solder-wire': 'Mớm thiếc', 'solder-wick': 'Đặt dây hút thiếc', 'desolder-pump': 'Hút thiếc',
  'flux-pen': 'Chấm nhựa thông', 'tweezers': 'Gắp', 'flush-cutter': 'Cắt', 'wire-stripper': 'Tuốt dây', 'crimper': 'Bấm cos',
  'multimeter': 'Chạm que đo', 'psu-leads': 'Kẹp que nguồn', 'screwdriver-ph1': 'Vặn vít', 'screwdriver-ph0': 'Vặn vít',
  'hot-glue-gun': 'Bắn keo', 'calipers': 'Đo kích thước', 'pickit3': 'Cắm ICSP',
};
const USE_BY_KIND = { iron: 'Hàn', solder: 'Mớm thiếc', tweezers: 'Gắp', screwdriver: 'Vặn vít', pliers: 'Kẹp / cắt', cutter: 'Cắt', meter: 'Đo', probe: 'Chạm que đo' };
const HOLD_KINDS = new Set(['iron', 'solder', 'screwdriver', 'pliers', 'cutter']);
const SCROLL_BY_ID = {
  multimeter: 'Xoay núm thang đo', 'wire-stripper': 'Đổi khấc AWG', crimper: 'Đổi cỡ cos', 'flux-pen': 'Mở / đóng nắp',
  'solder-wick': 'Cắt đầu dây hút', 'hot-glue-gun': 'Bật / tắt súng keo', calipers: 'Đổi mm / inch',
  'screwdriver-ph1': 'Đổi chiều vặn', 'screwdriver-ph0': 'Đổi chiều vặn', 'flush-cutter': 'Chỉnh độ dài cắt',
};

export function toolUseLabel(inst) {
  const d = inst?.def;
  if (!d) return 'Dùng';
  if (d.tool?.useLabel) return typeof d.tool.useLabel === 'function' ? d.tool.useLabel(inst) : d.tool.useLabel;
  return USE_BY_ID[d.id] || USE_BY_KIND[toolKind(d)] || `Dùng ${d.name || 'dụng cụ'}`;
}
export function toolUseHold(inst) {
  const d = inst?.def;
  if (!d) return true;
  if (d.tool?.useHold != null) return !!d.tool.useHold;
  if (['multimeter', 'psu-leads', 'calipers', 'pickit3'].includes(d.id)) return false;
  return HOLD_KINDS.has(toolKind(d)) || !!d.tool?.onUseHold;
}
export function toolScrollLabel(inst) {
  const d = inst?.def;
  if (!d?.tool?.onScroll) return null;
  return d.tool.scrollLabel || SCROLL_BY_ID[d.id] || 'Chức năng phụ';
}
/** Nhãn cuộn chuột cho vật có onScroll (núm xoay) */
export function scrollLabelFor(spec, name = '') {
  if (spec?.scrollLabel) return typeof spec.scrollLabel === 'function' ? spec.scrollLabel() : spec.scrollLabel;
  const s = `${name} ${(spec?.prompts || []).map((p) => (typeof p.label === 'string' ? p.label : '')).join(' ')}`.toLowerCase();
  if (/nhiệt/.test(s)) return 'Chỉnh nhiệt độ';
  if (/điện áp|volt/.test(s)) return 'Chỉnh điện áp';
  if (/dòng/.test(s)) return 'Chỉnh giới hạn dòng';
  if (/phóng|zoom/.test(s)) return 'Đổi độ phóng đại';
  if (/nét|focus/.test(s)) return 'Chỉnh nét';
  if (/sáng|đèn/.test(s)) return 'Chỉnh độ sáng';
  return 'Vặn núm';
}

// ---------------------------------------------------------------------------- biểu tượng chip
export function iconFor(spec, prompt, item) {
  if (spec?.icon) return spec.icon;
  if (item) return item.def?.icon || (item.def?.kind === 'tool' ? '🧰' : '✋');
  const s = `${typeof spec?.name === 'string' ? spec.name : ''} ${typeof prompt?.label === 'string' ? prompt.label : ''}`.toLowerCase();
  if (/ngồi|ghế/.test(s)) return '🪑';
  if (/ngăn kéo|ngăn /.test(s)) return '🗄️';
  if (/cửa/.test(s)) return '🚪';
  if (/đèn/.test(s)) return '💡';
  if (/kính hiển vi/.test(s)) return '🔬';
  if (/trạm hàn|nhiệt|mỏ hàn/.test(s)) return '🔥';
  if (/khói|quạt/.test(s)) return '🌀';
  if (/output|ngõ ra|nguồn|công tắc|bật|tắt/.test(s)) return '⏻';
  if (/núm/.test(s)) return '🎛️';
  if (/laptop|máy tính/.test(s)) return '💻';
  if (/bảng|poster|đọc|xem/.test(s)) return '📖';
  if (/rác/.test(s)) return '🗑️';
  if (/hộp|thùng|kệ/.test(s)) return '📦';
  if (/kẹp/.test(s)) return '🗜️';
  if (/robot/.test(s)) return '🤖';
  return '👆';
}

// ---------------------------------------------------------------------------- mẹo lần đầu
export const TIPS = {
  chair: { icon: '🪑', title: 'Ghế làm việc', body: [['E', 'Ngồi xuống — camera hạ sát mép bàn'], ['Tab', 'Chế độ thao tác tỉ mỉ (con trỏ trên mặt bàn)'], ['Z', 'Kính lúp (phóng to)'], ['W/S', 'Kéo ghế vào / ra'], ['Space', 'Đứng dậy']] },
  drawer: { icon: '🗄️', title: 'Tủ ngăn kéo linh kiện', body: [['E', 'Mở / đóng ngăn'], ['LMB', 'Lấy 1 linh kiện khi ngăn đang mở'], ['F', 'Xem bài học của linh kiện']] },
  'psu-knob': { icon: '🎛️', title: 'Núm nguồn bàn', body: [['WHEEL', 'Chỉnh ±0.1 V / ±0.01 A'], ['LMB', 'Giữ & kéo chuột để vặn nhanh'], ['E', 'Nút OUTPUT: bật/tắt ngõ ra — đặt giới hạn dòng TRƯỚC']] },
  station: { icon: '🔥', title: 'Trạm hàn', body: [['E', 'Bật / tắt trạm'], ['WHEEL', 'Chỉnh nhiệt độ (±5 °C) — chì 330–350 °C'], ['1', 'Cầm mỏ hàn · 2: thiếc hàn (tay trái)']] },
  vise: { icon: '🗜️', title: 'Kẹp mạch in', body: [['E', 'Cầm board lại gần → cắm vào kẹp'], ['E', 'Lật bo 180° để hàn mặt dưới'], ['Tab', 'Ngồi xuống rồi bật chế độ tỉ mỉ để hàn chính xác']] },
  multimeter: { icon: '📟', title: 'Đồng hồ vạn năng', body: [['WHEEL', 'Xoay núm thang đo (Ω, V⎓, V~, A, thông mạch)'], ['LMB', 'Chạm que đỏ vào điểm đo'], ['RMB', 'Kẹp que đen vào điểm chung (GND)']] },
  microscope: { icon: '🔬', title: 'Kính hiển vi soi mạch', body: [['E', 'Nhìn qua kính (khi đang ngồi ở bàn hàn)'], ['WHEEL', 'Độ phóng đại 7×–45×'], ['R/F', 'Chỉnh nét'], ['I', 'Đánh giá mối hàn dưới tâm kính']] },
  laptop: { icon: '💻', title: 'Laptop', body: [['E', 'Mở danh sách tài liệu & bài học Lab 3D'], ['Esc', 'Đóng']] },
  whiteboard: { icon: '📖', title: 'Bảng / poster', body: [['E', 'Xem gần để đọc'], ['E/Space', 'Thôi xem']] },
  bench: { icon: '🧰', title: 'Bàn làm việc 3D', body: [['RMB', 'Nhấp: nhặt / đặt linh kiện · kéo: xoay góc nhìn'], ['LMB', 'Dùng dụng cụ (giữ để hàn) · cắm linh kiện'], ['WHEEL', 'Phóng to về phía con trỏ'], ['T', 'Nhìn thẳng xuống bo để cắm linh kiện'], ['Space', 'Đứng dậy · Tab: góc nhìn thứ nhất']] },
  precision: { icon: '🎯', title: 'Thao tác tỉ mỉ', body: [['Chuột', 'Rê con trỏ trên mặt bàn — mũi dụng cụ đi theo'], ['Shift', 'Rê chậm, chính xác'], ['WHEEL', 'Nâng / hạ mũi dụng cụ (mm)'], ['A/D', 'Nghiêng người'], ['Tab', 'Thoát chế độ tỉ mỉ']] },
};

/** Loại vật để hiện mẹo lần đầu (null = không có mẹo) */
export function tipKindOf(t) {
  const spec = t?.spec;
  if (!spec && !t?.item) return null;
  if (spec?.uxKind) return spec.uxKind;
  const name = String(typeof spec?.name === 'function' ? (() => { try { return spec.name(); } catch { return ''; } })() : spec?.name || '').toLowerCase();
  if (/^ngăn /.test(name)) return 'drawer';
  if (/núm (điện áp|giới hạn dòng)/.test(name)) return 'psu-knob';
  if (/trạm hàn|núm chỉnh nhiệt/.test(name)) return 'station';
  if (/kẹp mạch/.test(name)) return 'vise';
  if (/kính hiển vi/.test(name)) return 'microscope';
  if (/laptop/.test(name)) return 'laptop';
  if (/bảng trắng|poster/.test(name)) return 'whiteboard';
  if (t?.item?.def?.id === 'multimeter') return 'multimeter';
  return null;
}
