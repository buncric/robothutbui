// Bảng điều khiển thí nghiệm + ô số đo, dựng từ khai báo của linh kiện.
import { fmt } from './scope.js';

/**
 * params: [{ id, label, type: 'range'|'toggle'|'select'|'button', min, max, step, value, unit, options:[[value,label]], hint }]
 * Trả về object giá trị hiện tại (cập nhật trực tiếp khi người dùng kéo/bấm).
 */
export function buildControls(container, params = [], onAction = () => {}) {
  container.innerHTML = '';
  const values = {};
  if (!params.length) {
    container.innerHTML = '<p style="color:var(--muted);font-size:13px">Linh kiện này chỉ để quan sát — xoay, phóng to, rê chuột lên từng bộ phận.</p>';
    return values;
  }
  for (const p of params) {
    const wrap = document.createElement('div');
    wrap.className = 'ctl';
    if (p.hint) wrap.title = p.hint;
    if (p.type === 'range') {
      values[p.id] = p.value ?? p.min;
      wrap.innerHTML = `<label><span>${p.label}</span><output>${show(values[p.id], p)}</output></label>
        <input type="range" min="${p.min}" max="${p.max}" step="${p.step ?? (p.max - p.min) / 100}" value="${values[p.id]}">`;
      const input = wrap.querySelector('input'), out = wrap.querySelector('output');
      input.addEventListener('input', () => { values[p.id] = parseFloat(input.value); out.textContent = show(values[p.id], p); });
    } else if (p.type === 'toggle') {
      values[p.id] = !!p.value;
      wrap.innerHTML = `<label class="toggle"><input type="checkbox" ${p.value ? 'checked' : ''}> <span>${p.label}</span></label>`;
      const input = wrap.querySelector('input');
      input.addEventListener('change', () => (values[p.id] = input.checked));
    } else if (p.type === 'select') {
      values[p.id] = p.value ?? p.options[0][0];
      wrap.innerHTML = `<label><span>${p.label}</span></label><select>${p.options
        .map(([v, l]) => `<option value="${v}" ${v === values[p.id] ? 'selected' : ''}>${l}</option>`)
        .join('')}</select>`;
      const sel = wrap.querySelector('select');
      sel.addEventListener('change', () => (values[p.id] = sel.value));
    } else if (p.type === 'button') {
      wrap.innerHTML = `<button class="btn">${p.label}</button>`;
      wrap.querySelector('button').addEventListener('click', () => onAction(p.id));
    }
    container.appendChild(wrap);
  }
  return values;
}

function show(v, p) {
  const s = p.step && p.step >= 1 ? String(Math.round(v)) : fmt(v);
  return `${s}${p.unit ? ' ' + p.unit : ''}`;
}

/** readouts: [{ id, label, unit }] → hàm set(id, value) */
export function buildReadouts(container, defs = []) {
  container.innerHTML = '';
  const els = {};
  if (!defs.length) container.innerHTML = '<p style="color:var(--muted);font-size:13px">—</p>';
  for (const d of defs) {
    const el = document.createElement('div');
    el.className = 'readout';
    el.innerHTML = `<span>${d.label}</span><b>–<small>${d.unit || ''}</small></b>`;
    container.appendChild(el);
    els[d.id] = { b: el.querySelector('b'), unit: d.unit || '' };
  }
  return (id, value) => {
    const e = els[id];
    if (!e) return;
    const txt = typeof value === 'number' ? fmt(value) : String(value);
    e.b.innerHTML = `${txt}<small>${e.unit}</small>`;
  };
}
