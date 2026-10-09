// RoboVac Lab — khung ứng dụng: danh mục, định tuyến, bảng bài học, vòng lặp mô phỏng.
// Linh kiện được TỰ ĐỘNG nạp từ src/components/**/*.js (xem COMPONENT_API.md).
import * as THREE from 'three';
import { Viewer } from './core/viewer.js';
import { Scope } from './core/scope.js';
import { buildControls, buildReadouts } from './core/ui.js';
import { MAT, PIN_COLORS, tint } from './core/materials.js';
import * as geom from './core/geom.js';
import { createSandbox, footprint } from './core/editor.js';
import { cadModel, cadManifest } from './core/cad.js';

export const CATEGORIES = [
  { id: 'lap-rap', name: 'Robot hoàn chỉnh', icon: '🤖' },
  { id: 'mo-phong', name: 'Môi trường mô phỏng', icon: '🏠' },
  { id: 'cad', name: 'Thư viện CAD (mô hình thật)', icon: '📐' },
  { id: 'co-khi', name: 'Cơ khí', icon: '🔩' },
  { id: 'dong-luc', name: 'Động cơ & truyền động', icon: '⚙️' },
  { id: 'dien-tu', name: 'Linh kiện điện tử cơ bản', icon: '🔌' },
  { id: 'nguon', name: 'Nguồn & pin', icon: '🔋' },
  { id: 'dieu-khien', name: 'Vi điều khiển & mạch', icon: '🧠' },
  { id: 'cam-bien', name: 'Cảm biến', icon: '📡' },
];

// Nạp từng file riêng lẻ: một file đang lỗi (đang viết dở) chỉ bị bỏ qua, không làm sập cả lab.
const loaders = import.meta.glob(['./components/**/*.js', '!./components/**/_*.js']);
const COMPONENTS = [];
const byId = {};
const LOAD_ERRORS = [];
async function loadComponents() {
  const results = await Promise.allSettled(Object.entries(loaders).map(([path, fn]) => fn().then((m) => [path, m])));
  for (const r of results) {
    if (r.status === 'rejected') { LOAD_ERRORS.push(String(r.reason?.message || r.reason)); console.warn('[lab] bỏ qua linh kiện lỗi:', r.reason); continue; }
    const def = r.value[1].default;
    if (def && def.id && def.build) COMPONENTS.push(def);
  }
  COMPONENTS.sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name, 'vi'));
  COMPONENTS.forEach((c) => (byId[c.id] = c));
}

// ---------- lưu tiến độ (an toàn khi trình duyệt chặn localStorage) ----------
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* bỏ qua */ } },
};
let learned = new Set(store.get('robovac.learned', []));

// ---------- DOM ----------
const $ = (s) => document.querySelector(s);
const viewer = new Viewer($('#viewport'), $('#tooltip'));
const scope = new Scope($('#scope'), $('#scopeNote'));
let current = null;     // { def, inst, params, readout }
let home = false;       // đang ở trang chủ (vẫn trưng bày 1 mô hình)

// ---------- giao diện sáng/tối ----------
const theme = store.get('robovac.theme', null);
if (theme) document.documentElement.dataset.theme = theme;
$('#themeBtn').onclick = () => {
  const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  store.set('robovac.theme', t);
};
$('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');

// ---------- danh mục ----------
function renderSidebar(filter = '') {
  const f = filter.trim().toLowerCase();
  const nav = $('#sidebar');
  nav.innerHTML = `<div class="cat"><a href="#/" class="${home ? 'active' : ''}"><span class="ico">🏠</span>Trang chủ</a>
    <a href="./game.html" target="_blank" style="font-weight:600;color:var(--accent2)"><span class="ico">🎮</span>Chơi Lab Simulator</a></div>`;
  for (const cat of CATEGORIES) {
    const items = COMPONENTS.filter((c) => c.category === cat.id &&
      (!f || (c.name + ' ' + (c.summary || '') + ' ' + (c.tags || []).join(' ')).toLowerCase().includes(f)));
    if (!items.length) continue;
    const div = document.createElement('div');
    div.className = 'cat';
    div.innerHTML = `<h4>${cat.icon} ${cat.name}</h4>` + items.map((c) =>
      `<a href="#/c/${c.id}" class="${!home && current?.def.id === c.id ? 'active' : ''}">
         <span class="ico">${c.icon || '•'}</span>${c.name}${learned.has(c.id) ? '<span class="tick">✓</span>' : ''}</a>`).join('');
    nav.appendChild(div);
  }
  $('#progressText').textContent = `${learned.size}/${COMPONENTS.length}`;
  $('#progressBar').style.width = COMPONENTS.length ? `${(100 * learned.size) / COMPONENTS.length}%` : '0';
}
$('#search').addEventListener('input', (e) => renderSidebar(e.target.value));

// ---------- bảng bài học ----------
const TABS = [
  ['overview', 'Tổng quan'], ['specs', 'Thông số'], ['principle', 'Nguyên lý'],
  ['inRobot', 'Trong robot'], ['mistakes', 'Lỗi hay gặp'], ['quiz', 'Kiểm tra'],
];

function renderTabs(def) {
  const info = def.info || {};
  const tabs = $('#tabs');
  const avail = TABS.filter(([k]) => k === 'overview' || info[k]);
  tabs.innerHTML = avail.map(([k, l], i) => `<button data-tab="${k}" class="${i === 0 ? 'active' : ''}">${l}</button>`).join('');
  tabs.querySelectorAll('button').forEach((b) => (b.onclick = () => {
    tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
    showTab(def, b.dataset.tab);
  }));
  showTab(def, 'overview');
}

function showTab(def, key) {
  const info = def.info || {};
  const body = $('#tabBody');
  if (key === 'overview') {
    body.innerHTML = `<h3 style="margin-top:0">${def.icon || ''} ${def.name}</h3><p>${def.summary || ''}</p>${info.overview || ''}
      <div class="tip">🖱 Kéo chuột để xoay · cuộn để phóng to · <b>rê chuột lên từng bộ phận</b> để xem tên, bấm để ghim.</div>`;
  } else if (key === 'specs') {
    body.innerHTML = `<table><tbody>${info.specs.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</tbody></table>`;
  } else if (key === 'quiz') {
    body.innerHTML = info.quiz.map((q, i) =>
      `<div class="quiz"><details><summary>Câu ${i + 1}. ${q.q}</summary><p>➜ ${q.a}</p></details></div>`).join('');
  } else body.innerHTML = info[key];
}

function renderHome() {
  $('#tabs').innerHTML = '<button class="active">Giới thiệu</button>';
  const counts = CATEGORIES.map((c) => [c, COMPONENTS.filter((x) => x.category === c.id).length]).filter(([, n]) => n);
  $('#tabBody').innerHTML = `<div class="home">
    <h3 style="margin-top:0">Chào mừng tới RoboVac Lab 🧪</h3>
    <p>Phòng thí nghiệm 3D để học <b>từng linh kiện</b> của robot hút bụi — từ con ốc, lò xo, bánh răng đến động cơ, pin, vi điều khiển, cảm biến — rồi ghép thành robot hoàn chỉnh.</p>
    <p>Mỗi linh kiện có: mô hình 3D tháo được · thí nghiệm kéo-thả · số đo · máy hiện sóng · bài học 6 phần · câu hỏi kiểm tra.</p>
    <div class="cards">${counts.map(([c, n]) => `<div class="card" data-cat="${c.id}">${c.icon} <b>${c.name}</b><br><small>${n} linh kiện</small></div>`).join('')}</div>
    <h4>Lộ trình gợi ý</h4>
    <ol><li>Cơ khí: ốc vít → lò xo → bánh răng → bánh xe</li><li>Động cơ DC → driver cầu H → PWM</li><li>Pin 18650 → BMS → mạch hạ áp</li><li>PIC16F877A → ESP32 → chuyển mức</li><li>Cảm biến → Robot hoàn chỉnh</li></ol>
  </div>`;
  $('#tabBody').querySelectorAll('.card').forEach((el) => (el.onclick = () => {
    const first = COMPONENTS.find((c) => c.category === el.dataset.cat);
    if (first) location.hash = `#/c/${first.id}`;
  }));
  $('#doneBtn').hidden = true;
  $('#partBox').hidden = true;
}

// ---------- tải một linh kiện ----------
let sandboxes = [];
function load(def) {
  if (current?.inst?.dispose) current.inst.dispose();
  sandboxes.forEach((sb) => sb.dispose());
  sandboxes = [];
  const readout = buildReadouts($('#readouts'), def.readouts);
  const ctx = {
    THREE, MAT, PIN_COLORS, tint, geom, viewer,
    label: (parent, text, pos) => viewer.addLabel(parent, text, pos),
    readout,
    fx: viewer.fx,
    // trình kéo-thả dùng chung (xem core/editor.js) — tự dọn khi đổi linh kiện
    sandbox: (opts) => { const sb = createSandbox(viewer, opts); sandboxes.push(sb); return sb; },
    footprint,
    // mô hình CAD thật (GLB từ STEP) — xem core/cad.js
    cad: cadModel,
    cadManifest,
    // danh sách mọi linh kiện của lab (cho xưởng lắp ráp / phòng lab)
    catalog: COMPONENTS,
  };
  const inst = def.build(ctx);
  const params = buildControls($('#controls'), def.params, (id) => inst.onAction?.(id, params));
  current = { def, inst, params, readout };
  viewer.setObject(inst.object);
  buildSteps(def, inst);
  buildFaults(def, inst);
  viewer.setLabelsVisible(viewer.labelsVisible);
  scope.setup(def.scope || null);
  $('#compTitle').innerHTML = `${def.icon || ''} ${def.name}<small>${CATEGORIES.find((c) => c.id === def.category)?.name || ''}</small>`;
  renderTabs(def);
  const done = $('#doneBtn');
  done.hidden = false;
  const sync = () => { done.classList.toggle('done', learned.has(def.id)); done.textContent = learned.has(def.id) ? '✓ Đã học' : '✓ Đánh dấu đã học'; };
  sync();
  done.onclick = () => {
    learned.has(def.id) ? learned.delete(def.id) : learned.add(def.id);
    store.set('robovac.learned', [...learned]);
    sync();
    renderSidebar($('#search').value);
  };
  document.title = `${def.name} — RoboVac Lab`;
}

// ---------- tháo lắp từng bước ----------
const SEVERITY = { no: '💥 NỔ', chay: '🔥 CHÁY', hong: '⚡ HỎNG', loi: '⚠️ LỖI', nhe: 'ℹ️ NHẸ' };
function buildSteps(def, inst) {
  const box = $('#steps');
  box.innerHTML = '';
  if (!def.steps?.length || !inst.setStep) return;
  let i = -1;                      // -1 = lắp hoàn chỉnh (mặc định), chưa bắt đầu
  box.innerHTML = `<h4>🔧 Tháo lắp từng bước</h4>
    <div class="step-nav"><button data-d="-1">◀</button><span></span><button data-d="1">▶</button></div>
    <div class="step-text"></div>`;
  const show = (apply) => {
    const st = def.steps[i];
    box.querySelector('span').textContent = i < 0 ? `${def.steps.length} bước` : `Bước ${i + 1}/${def.steps.length}`;
    box.querySelector('.step-text').innerHTML = i < 0 ? 'Bấm <b>▶</b> để bắt đầu tháo lắp từng bước.' : `<b>${st.title}</b><br>${st.text || ''}`;
    if (apply) inst.setStep(i, current.params);
  };
  box.querySelectorAll('button').forEach((b) => (b.onclick = () => {
    i = Math.max(-1, Math.min(def.steps.length - 1, i + Number(b.dataset.d)));
    show(true);
  }));
  show(false);
}

// ---------- tình huống lắp sai / sự cố ----------
function buildFaults(def, inst) {
  const box = $('#faults');
  box.innerHTML = '';
  $('#faultCard').hidden = true;
  if (!def.faults?.length || !inst.triggerFault) return;
  box.innerHTML = `<h4>⚠️ Thử lắp sai / sự cố</h4>` + def.faults.map((f) =>
    `<button class="fault-btn" data-f="${f.id}">${f.label}<span class="sev">${SEVERITY[f.severity] || ''}</span></button>`).join('') +
    `<button class="fault-reset">↺ Khôi phục bình thường</button>`;
  box.querySelectorAll('.fault-btn').forEach((b) => (b.onclick = () => {
    const f = def.faults.find((x) => x.id === b.dataset.f);
    viewer.fx.restore(inst.object);
    inst.resetFault?.(current.params);
    inst.triggerFault(f.id, current.params);
    const card = $('#faultCard');
    card.hidden = false;
    card.innerHTML = `<button class="close" aria-label="Đóng">✕</button><h4>${SEVERITY[f.severity] || ''} ${f.label}</h4>
      ${f.what ? `<div class="row"><b>Hiện tượng</b>${f.what}</div>` : ''}
      ${f.why ? `<div class="row"><b>Vì sao</b>${f.why}</div>` : ''}
      ${f.fix ? `<div class="row"><b>Cách phòng / xử lý</b>${f.fix}</div>` : ''}`;
    card.querySelector('.close').onclick = () => (card.hidden = true);
  }));
  box.querySelector('.fault-reset').onclick = () => {
    viewer.fx.restore(inst.object);
    inst.resetFault?.(current.params);
    $('#faultCard').hidden = true;
  };
}

viewer.onPick = (p) => {
  const box = $('#partBox');
  if (!p) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `📌 <b>${p.name}</b><br>${p.desc || ''}`;
};

viewer.onFrame = (dt, t) => {
  if (!current?.inst?.update) { scope.draw(); return; }
  const vals = current.inst.update(dt, t, current.params);
  if (vals) scope.push(dt, vals);
  scope.draw();
};

// ---------- thanh công cụ ----------
const toolbar = $('.viewport-toolbar');
const panelBtn = document.createElement('button');
panelBtn.dataset.act = 'panel';
panelBtn.textContent = '📖 Bài học';
toolbar.appendChild(panelBtn);
toolbar.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'reset') viewer.frame();
  if (act === 'labels') { viewer.setLabelsVisible(!viewer.labelsVisible); b.classList.toggle('on', viewer.labelsVisible); }
  if (act === 'rotate') { viewer.autoRotate = !viewer.autoRotate; b.classList.toggle('on', viewer.autoRotate); }
  if (act === 'wire') { b.classList.toggle('on'); viewer.setWireframe(b.classList.contains('on')); }
  if (act === 'panel') $('#panel').classList.toggle('open');
});
toolbar.querySelector('[data-act=labels]').classList.add('on');

// ---------- định tuyến ----------
function route() {
  const m = location.hash.match(/^#\/c\/(.+)$/);
  const def = m && byId[decodeURIComponent(m[1])];
  $('#sidebar').classList.remove('open');
  if (def) { home = false; load(def); }
  else {
    home = true;
    const showcase = byId['robot-assembly'] || COMPONENTS[0];
    if (showcase) load(showcase);
    renderHome();
    document.title = 'RoboVac Lab 3D';
  }
  renderSidebar($('#search').value);
}
window.addEventListener('hashchange', route);
loadComponents().then(() => {
  route();
  if (LOAD_ERRORS.length) console.warn(`[lab] ${LOAD_ERRORS.length} linh kiện chưa nạp được (đang được viết?)`);
});

// Gỡ lỗi trên console: window.lab
window.lab = { viewer, COMPONENTS, THREE, createSandbox };
