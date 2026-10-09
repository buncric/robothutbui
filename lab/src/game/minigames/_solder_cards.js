// =============================================================================
// _solder_cards.js — THẺ BÀI HỌC & PHIẾU KIỂM TRA (DOM) cho minigames/solder-pro.js. (KHÔNG export default.)
//   showReport(report)  phiếu kiểm tra một mối (góc phải, tự ẩn sau ~10 s, không chặn điều khiển; ≤ 4 lỗi + "còn N" — đủ ở sổ tay N).
//                       [UX 2026-10] Đang nhìn qua kính hiển vi → phiếu sang CỘT TRÁI ngoài vòng thị kính (.scope), không che
//                       vùng soi giữa / bảng thông số kính bên phải; bảng nhiệm vụ ở cột trái bị ẩn khi soi.
//   showNote(text)      dòng nhắn ngắn trong khung phiếu
//   open(page)          SỔ TAY HÀN (modal, app.uiMode = 'solder-card'): 'index' · 'tip:<mã>' · 'defect:<mã>' · 'comp:<lớp>'
//                       · 'lesson:<khoá>' · 'workflow' · 'ipc' · 'qc' · 'report'
//                       Phím: 1–9 chọn mục · ←/→ trang trước/sau · Backspace mục lục · C đổi Class 2/3 (trang QC)
//                       · S lưu biên bản QC · N / Esc / Enter đóng
//   quiz({ id, title, question, options:[…], correct, explain }, cb)   câu hỏi trắc nghiệm (phím 1–4)
//   thumb(kind) → dataURL: ảnh "chụp" mối hàn dựng thủ tục bằng WebGL riêng (chỉ trình duyệt) — mối đẹp / nguội / cầu…
// Nội dung lấy từ ./_solder_kb.js (docs/07_KIEN_THUC_HAN_MACH.md), có nhãn nguồn [V]/[S]/[TK].
// =============================================================================
import * as THREE from 'three';
import { TIPS, TIP_ORDER, DEFECTS, COMPONENTS, IPC, IPC_SRC, MAG_TABLE, WORKFLOW, LESSONS, STATIONS, DOC, JOINT_KINDS, tipThermal, ALLOY_NOTES } from './_solder_kb.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { tipGeometry } from '../items/tools/_tips.js';
import { filletGeometry, bridgeGeometry, solderMats, icicleGeo, charGeo, measleGeo, scorchGeo, smallBallGeo, copperRingGeo, liftedRingGeo, fluxDiscGeo } from './_solder_visual.js';

const HAS_DOC = typeof document !== 'undefined' && typeof document.createElement === 'function';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const CSS = `
.rsc-rep{position:fixed;right:16px;top:86px;z-index:14;width:min(360px,calc(100vw - 32px));pointer-events:none;padding:12px 14px;border-radius:12px;
 background:rgba(9,13,19,.86);border:1px solid rgba(255,255,255,.12);color:#e8eef5;font:12.5px/1.42 "Be Vietnam Pro",system-ui,sans-serif;
 box-shadow:0 10px 30px rgba(0,0,0,.45);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);opacity:0;transform:translateX(12px);transition:opacity .25s,transform .25s}
.rsc-rep.on{opacity:1;transform:none}
.rsc-rep{max-height:calc(100vh - 86px - clamp(48px,6.2vw,74px) - 170px);overflow:hidden}
.rsc-rep.scope{left:16px;right:auto;top:16px;width:clamp(240px,calc(50vw - 46vh - 28px),340px);max-height:calc(100vh - 340px);transform:translateX(-12px)}
.rsc-rep.scope.on{transform:none}.rsc-rep.scope .m{grid-template-columns:1fr}
.rsc-rep h4{margin:0 0 4px;font-size:14px;display:flex;justify-content:space-between;gap:8px;align-items:baseline}
.rsc-rep .v{font-weight:900;font-size:15px}.rsc-rep .ok{color:#5fe39a}.rsc-rep .bad{color:#ff7b7b}.rsc-rep .dim{color:#9fb3c8}
.rsc-rep ul{margin:6px 0 0;padding-left:16px}.rsc-rep li{margin:2px 0}
.rsc-rep .m{display:grid;grid-template-columns:1fr 1fr;gap:2px 10px;margin:6px 0;color:#c9d6e2}
.rsc-rep img{width:100%;border-radius:8px;margin-top:6px;display:block}
.rsc-modal{position:fixed;inset:0;z-index:18;display:flex;align-items:center;justify-content:center;background:rgba(4,8,14,.62);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);
 color:#e8eef5;font:13.5px/1.5 "Be Vietnam Pro",system-ui,sans-serif;padding:16px}
.rsc-card{width:min(860px,100%);max-height:calc(100vh - 32px);overflow:auto;border-radius:14px;background:#0d141d;border:1px solid rgba(255,255,255,.12);box-shadow:0 20px 60px rgba(0,0,0,.55);padding:18px 20px}
.rsc-card h2{margin:0 0 2px;font-size:20px}.rsc-card h3{margin:14px 0 6px;font-size:15px;color:#ffd166}
.rsc-card .sub{color:#9fb3c8;font-size:12.5px;margin-bottom:10px}
.rsc-card table{border-collapse:collapse;width:100%;font-size:12.5px;margin:6px 0}.rsc-card td,.rsc-card th{border-bottom:1px solid rgba(255,255,255,.08);padding:4px 6px;text-align:left;vertical-align:top}
.rsc-card th{color:#9fb3c8;font-weight:600}
.rsc-card .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}
.rsc-card .it{border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:8px 10px;background:rgba(255,255,255,.03);cursor:pointer}
.rsc-card .it b{color:#7fd8ff}.rsc-card .k{display:inline-block;min-width:18px;padding:0 5px;margin-right:6px;border-radius:5px;background:#24384d;color:#cfe8ff;font-weight:800;text-align:center}
.rsc-card .foot{margin-top:12px;color:#8aa0b5;font-size:12px;border-top:1px solid rgba(255,255,255,.08);padding-top:8px}
.rsc-card .two{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px}@media (max-width:720px){.rsc-card .two{grid-template-columns:1fr}}
.rsc-card img.ph{width:100%;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:#1a222c}
.rsc-card .bar{height:8px;border-radius:4px;background:#1d2a38;overflow:hidden}.rsc-card .bar i{display:block;height:100%;background:linear-gradient(90deg,#3fa7ff,#5fe39a)}
.rsc-card .pros li{color:#a6efc5}.rsc-card .cons li{color:#ffb4a8}
.rsc-card .opt{display:block;width:100%;text-align:left;margin:6px 0;padding:9px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:inherit;font:inherit;cursor:pointer}
.rsc-card .opt.right{border-color:#5fe39a;background:rgba(95,227,154,.12)}.rsc-card .opt.wrong{border-color:#ff7b7b;background:rgba(255,123,123,.1)}
`;

const CATS = [
  { key: 'tips', vi: 'Mũi hàn — chọn mũi & tác dụng', pages: () => TIP_ORDER.map((c) => `tip:${c}`) },
  { key: 'defects', vi: 'Lỗi mối hàn (ảnh + nguyên nhân + cách sửa)', pages: () => Object.keys(DEFECTS).map((c) => `defect:${c}`) },
  { key: 'comps', vi: 'Quá nhiệt linh kiện (giới hạn datasheet)', pages: () => Object.keys(COMPONENTS).map((c) => `comp:${c}`) },
  { key: 'ipc', vi: 'Tiêu chí IPC-A-610 (Class 2/3)', pages: () => ['ipc'] },
  { key: 'mag', vi: 'Phóng đại kiểm tra & kính', pages: () => ['lesson:magnification'] },
  { key: 'temp', vi: 'Nhiệt độ, hợp kim, flux', pages: () => ['lesson:temperature'] },
  { key: 'care', vi: 'Chăm sóc & thay mũi, kẹp tản nhiệt', pages: () => ['lesson:tipcare', 'lesson:tipchange', 'lesson:heatsink'] },
  { key: 'clean', vi: 'Làm sạch sau hàn', pages: () => ['lesson:cleaning'] },
  { key: 'flow', vi: 'Quy trình 14 bước · biên bản QC · phiếu gần nhất', pages: () => ['workflow', 'qc', 'report'] },
];

export class SolderCards {
  constructor(game, pro) {
    this.game = game;
    this.pro = pro;
    this.has = HAS_DOC && !!document.body;
    this.page = null;
    this.quizState = null;
    this._repT = 0;
    this._thumbs = new Map();
    if (!this.has) return;
    if (!document.getElementById('rsc-css')) { const s = document.createElement('style'); s.id = 'rsc-css'; s.textContent = CSS; document.head.appendChild(s); }
    this.rep = document.createElement('div'); this.rep.className = 'rsc-rep'; document.body.appendChild(this.rep);
    this.modal = document.createElement('div'); this.modal.className = 'rsc-modal'; this.modal.style.display = 'none'; document.body.appendChild(this.modal);
    this.modal.addEventListener('click', (ev) => {
      const a = ev.target.closest?.('[data-page]'); if (a) { this.open(a.dataset.page); return; }
      const o = ev.target.closest?.('[data-opt]'); if (o) { this._answer(+o.dataset.opt); return; }
      if (ev.target.closest?.('[data-close]')) this.close();
    });
  }
  get isOpen() { return !!this.page; }

  // ------------------------------------------------------------------ phiếu kiểm tra (không chặn)
  showReport(r) {
    this.last = r;
    if (!this.has) return;
    const C = IPC[r.cls] || IPC[2];
    const head = r.empty ? '<span class="v dim">CHƯA HÀN</span>' : r.pass ? '<span class="v ok">ĐẠT ✓</span>' : '<span class="v bad">KHÔNG ĐẠT ✗</span>';
    const m = r.metrics;
    const fails = r.seen.filter((d) => d.fail), warns = r.seen.filter((d) => !d.fail);
    const li = (d) => `<li><b>${esc(d.vi)}</b>${d.detail ? ` — ${esc(d.detail)}` : ''}<br><span class="dim">Sửa: ${esc(d.fix)}</span></li>`;
    this.rep.innerHTML = `<h4><span>Mối ${esc(r.padId)}${r.part ? ` · ${esc(r.part)}${r.pin ? ` chân ${esc(r.pin)}` : ''}` : ''}</span>${head}</h4>
      <div class="dim">IPC-A-610 Class ${r.cls} · soi ${r.mag.toFixed(r.mag < 3 ? 2 : 0)}× (${esc(byVi(r.by))}) · mũi ${esc(r.tip || '?')}</div>
      ${r.empty ? '' : `<div class="m"><span>Góc thấm ướt ${m.angle}° (≤ ${C.maxAngle}°)</span><span>Fillet mặt hàn ${m.secondaryDeg}° (≥ ${C.secondaryDeg}°)</span>
      <span>Điền lỗ ${Math.round(m.holeFill * 100)} % (≥ ${Math.round((m.thermal ? C.fillThermal : C.fill) * 100)} %)</span><span>Nhô chân ${m.protrusion != null ? `${m.protrusion.toFixed(1)} mm (≤ ${C.protrMax})` : '—'}</span>
      <span>Thiếc ${m.volume} mm³ (${m.min}–${m.max})</span><span>Đỉnh nhiệt ${m.peakT} °C</span></div>`}
      ${fails.length ? `<ul>${fails.slice(0, 4).map(li).join('')}${fails.length > 4 ? `<li class="dim">… còn ${fails.length - 4} lỗi nữa — N: sổ tay → phiếu gần nhất</li>` : ''}</ul>` : ''}
      ${warns.length ? `<div class="dim" style="margin-top:4px">Chỉ báo quá trình: ${warns.map((d) => esc(d.vi)).join(', ')}</div>` : ''}
      ${!fails.length && !r.empty ? '<div class="dim">Không thấy lỗi ở độ phóng đại này. Mặt fillet lõm, bóng satin–sáng, thấy viền chân = chuẩn NASA [V][1].</div>' : ''}
      ${r.notes.map((n) => `<div class="dim" style="margin-top:4px">⚠ ${esc(n)}</div>`).join('')}
      <div class="dim" style="margin-top:6px">N: sổ tay hàn · dải soi IPC cho pad Ø${r.land.toFixed(1)}: ${r.ipcRange.min}–${r.ipcRange.max}× (trọng tài ${r.ipcRange.referee}×)</div>`;
    this.rep.classList.add('on');
    this._repT = 11;
  }
  showNote(text) {
    if (!this.has) return;
    this.rep.innerHTML = `<div>${esc(text)}</div>`;
    this.rep.classList.add('on');
    this._repT = 4;
  }
  update(dt) {
    if (this.rep) {
      const sc = !!this.game.ux?.microscope?.active;
      if (sc !== this._scope) { this._scope = sc; this.rep.classList.toggle('scope', sc); if (!sc) this.rep.style.maxHeight = ''; }
      // trong kính: phiếu (trên) + thẻ phím kính hiển vi (dưới) cùng cột trái → phiếu dừng trên mép thẻ phím
      if (sc && this._repT > 0) { const m = document.querySelector('.rvh-mode'); if (m && !m.hidden) this.rep.style.maxHeight = `${Math.max(180, m.getBoundingClientRect().top - 28)}px`; }
    }
    if (this._repT > 0) { this._repT -= dt; if (this._repT <= 0 && this.rep) this.rep.classList.remove('on'); }
  }

  // ------------------------------------------------------------------ sổ tay (modal)
  open(page = 'index') {
    this.page = page;
    const app = this.game.app;
    if (app && app.uiMode !== 'solder-card') { this._prevUi = app.uiMode || null; app.uiMode = 'solder-card'; app.uiBlocksMovement = true; if (this.game.player) this.game.player.lookEnabled = false; }
    this.game.interact?._cancelAll?.();
    try { this.game.events?.emit('solder:handbook', { page }); } catch { /* */ }
    if (this.has) { this.modal.style.display = 'flex'; this.modal.innerHTML = `<div class="rsc-card">${this.render(page)}</div>`; }
    return this.render(page);
  }
  close() {
    const app = this.game.app;
    this.page = null; this.quizState = null;
    if (app?.uiMode === 'solder-card') { app.uiMode = this._prevUi || null; app.uiBlocksMovement = false; if (this.game.player) this.game.player.lookEnabled = true; }
    if (this.has) this.modal.style.display = 'none';
  }
  /** Phím khi đang mở: true = đã dùng */
  onKey(e) {
    if (!this.page) return false;
    const c = e.code;
    if (this.quizState) {
      const m = /^(Digit|Numpad)([1-9])$/.exec(c);
      if (m) { this._answer(+m[2] - 1); return true; }
      if (c === 'Enter' || c === 'KeyN' || c === 'Escape') { if (this.quizState.answered) { const q = this.quizState; this.close(); q.cb?.(q.result); } return true; }
      return true;
    }
    if (c === 'KeyN' || c === 'Escape' || c === 'Enter') { this.close(); return true; }
    if (c === 'Backspace') { this.open('index'); return true; }
    if (c === 'ArrowRight' || c === 'ArrowLeft') { this._flip(c === 'ArrowRight' ? 1 : -1); return true; }
    if (this.page === 'qc' && c === 'KeyC') { this.pro.cls = this.pro.cls === 3 ? 2 : 3; this.open('qc'); return true; }
    if (this.page === 'qc' && c === 'KeyS') { const b = this._board(); if (b) this.pro.saveQc(b); this.open('qc'); return true; }
    const m = /^(Digit|Numpad)([1-9])$/.exec(c);
    if (m) {
      const i = +m[2] - 1;
      if (this.page === 'index') { const cat = CATS[i]; if (cat) this.open(cat.pages()[0]); }
      return true;
    }
    return true;     // chặn mọi phím khác khi đang mở sổ tay
  }
  _flip(d) {
    const cat = CATS.find((k) => k.pages().includes(this.page));
    if (!cat) return;
    const ps = cat.pages(), i = ps.indexOf(this.page);
    this.open(ps[(i + d + ps.length) % ps.length]);
  }
  _board() {
    const S = this.game.soldering;
    const vs = this.game.sockets?.get?.('vise')?.occupiedBy;
    if (vs && typeof vs.def?.solderPads === 'function') return vs;
    return this.pro.lastReport?.board || [...(S?.boards?.values?.() || [])].pop()?.inst || null;
  }

  // ------------------------------------------------------------------ câu hỏi trắc nghiệm
  quiz(q, cb) {
    this.quizState = { ...q, cb, answered: false, result: null };
    this.open('quiz');
    return this.quizState;
  }
  _answer(i) {
    const q = this.quizState;
    if (!q || q.answered || i < 0 || i >= q.options.length) return;
    q.answered = true;
    q.choice = i;
    q.result = { id: q.id, choice: i, correct: i === q.correct };
    this.game.events?.emit('solder:quiz', q.result);
    if (this.has) this.modal.innerHTML = `<div class="rsc-card">${this.render('quiz')}</div>`;
  }

  // ------------------------------------------------------------------ dựng nội dung (chuỗi HTML — dùng được cả trong test)
  render(page) {
    const foot = `<div class="foot">Nguồn: ${esc(DOC)} — [V] đã đọc trực tiếp · [S] trích đoạn, nên kiểm lại · [TK] ước tính thiết kế cho game. Phím: ←/→ trang · Backspace mục lục · N/Esc đóng</div>`;
    if (page === 'quiz') return this._quizHtml() + '';
    if (page === 'index') {
      return `<h2>📘 Sổ tay thợ hàn</h2><div class="sub">Chọn chủ đề bằng phím số (hoặc bấm khi chuột đang tự do).</div>
        <div class="grid">${CATS.map((c, i) => `<div class="it" data-page="${c.pages()[0]}"><span class="k">${i + 1}</span><b>${esc(c.vi)}</b></div>`).join('')}</div>${foot}`;
    }
    const [kind, arg] = page.split(':');
    if (kind === 'tip') return this._tipHtml(arg) + foot;
    if (kind === 'defect') return this._defectHtml(arg) + foot;
    if (kind === 'comp') return this._compHtml(arg) + foot;
    if (kind === 'lesson') return this._lessonHtml(arg) + foot;
    if (page === 'ipc') return this._ipcHtml() + foot;
    if (page === 'workflow') return this._workflowHtml() + foot;
    if (page === 'qc') return this._qcHtml() + foot;
    if (page === 'report') return this._reportHtml() + foot;
    return `<h2>?</h2>${foot}`;
  }
  _tipHtml(code) {
    const t = TIPS[code] || TIPS.D16;
    const st = this.game.lab?.station || {};
    const th = tipThermal(t.code, st.kind || '936');
    const cur = this.pro.iron()?.state?.tip;
    const kinds = Object.entries(JOINT_KINDS).map(([k, v]) => `<tr><td>${esc(v.vi)}</td><td>${v.best.includes(t.code) ? '<b style="color:#5fe39a">TỐT NHẤT</b>' : v.ok.includes(t.code) ? 'tạm được' : '<span style="color:#ff9f8f">không nên</span>'}</td></tr>`).join('');
    const bar = (v) => `<div class="bar"><i style="width:${v * 20}%"></i></div>`;
    return `<div class="two"><div>
      <h2>🔩 Mũi ${esc(t.name)}${cur === t.code ? ' <span style="font-size:13px;color:#5fe39a">(đang lắp)</span>' : ''}</h2>
      <div class="sub">${esc(t.desc)} ${esc(t.tag)}</div>
      <h3>Dùng cho</h3><div>${esc(t.use)}</div>
      <h3>Ưu điểm</h3><ul class="pros">${t.pros.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <h3>Nhược điểm</h3><ul class="cons">${t.cons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <h3>Mối khuyên dùng</h3><div>${esc(t.joints)}</div>
      <table>${kinds}</table>
    </div><div>
      <img class="ph" alt="" src="${this.tipThumb(t.code)}">
      <table>
        <tr><th>Diện tích tiếp xúc</th><td>cạnh ${t.area.edge} · mặt ${t.area.face} · THT ${t.area.tht} mm² [TK §13.1]</td></tr>
        <tr><th>Nhiệt khối (B = 1)</th><td>${t.mass.toFixed(1)}×</td></tr>
        <tr><th>Hồi nhiệt τ_rec</th><td>T12 ${t.tau.t12} s · 900M ${t.tau.sleeve} s</td></tr>
        <tr><th>Dẫn nhiệt mối (ướt)</th><td>${th.gWet.toFixed(2)} W/K (game)</td></tr>
        <tr><th>Độ chính xác</th><td>${bar(t.precision)}</td></tr>
        <tr><th>Rủi ro cầu thiếc</th><td>${bar(t.bridge)}</td></tr>
      </table>
      <div class="sub">Quy tắc 60 %: bề rộng mũi ≈ 60 % pad [V][14]. "Mũi to, nhiệt thấp" thắng "mũi nhọn, nhiệt cao" (§1.3).</div>
    </div></div>`;
  }
  _defectHtml(code) {
    const d = DEFECTS[code];
    if (!d) return '<h2>?</h2>';
    return `<div class="two"><div>
      <h2>${esc(d.vi)}</h2><div class="sub">${esc(d.src)}</div>
      <h3>Nhận dạng</h3><div>${esc(d.look)}</div>
      <h3>Nguyên nhân</h3><div>${esc(d.cause)}</div>
      <h3>Cách sửa</h3><div>${esc(d.fix)}</div>
      <h3>Phát hiện</h3><div>Cần phóng đại ≥ <b>${d.mag >= 999 ? '—' : `${d.mag}×`}</b> (dung sai ±15 %, §13.4). ${d.fail ? 'Là LỖI (reject).' : d.cls3Fail ? 'Class 2: chỉ báo quá trình · Class 3: lỗi.' : 'Chỉ báo quá trình.'}</div>
    </div><div><img class="ph" alt="" src="${this.thumb(code)}"></div></div>`;
  }
  _compHtml(cls) {
    const c = COMPONENTS[cls];
    if (!c) return '<h2>?</h2>';
    return `<h2>🌡️ ${esc(c.name)}</h2><div class="sub">${esc(c.tag)}</div>
      <table><tr><th>Giới hạn hàn tay</th><td><b>${c.limitT} °C · ${c.limitS} s</b>${c.once ? ' · chỉ 1 lần' : ''}</td></tr>
      <tr><th>Mô hình game</th><td>thân nhận ${Math.round(c.alpha * 100)} % ΔT của mối, τ ${c.tau} s; kẹp tản nhiệt → 30 % [TK]</td></tr>
      <tr><th>Thấy hư hỏng</th><td>${c.visible == null ? 'KHÔNG thấy — chỉ lỗi chức năng' : `≥ ${c.visible}×`}</td></tr></table>
      <h3>Hư hỏng</h3><div>${esc(c.damage)}</div><h3>Phòng tránh</h3><div>${esc(c.fix)}</div>`;
  }
  _lessonHtml(key) {
    const L = LESSONS[key];
    if (!L) return '<h2>?</h2>';
    let extra = '';
    if (key === 'magnification') extra = `<table><tr><th>Pad</th><th>Dải kiểm tra</th><th>Trọng tài</th></tr>${MAG_TABLE.map((r) => `<tr><td>${esc(r.land)}</td><td>${r.min}–${r.max}×</td><td>${r.referee}×</td></tr>`).join('')}</table>`;
    if (key === 'temperature') extra = `<h3>Hợp kim</h3><table>${Object.entries(ALLOY_NOTES).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>
      <h3>Trạm hàn</h3><table>${Object.values(STATIONS).map((s) => `<tr><th>${esc(s.name)}</th><td>${esc(s.heat)} ${esc(s.tag)}</td></tr>`).join('')}</table>`;
    return `<h2>${esc(L.title)}</h2><div class="sub">docs/07 ${esc(L.src)}</div><table>${L.body.map(([a, b]) => `<tr><th style="width:28%">${esc(a)}</th><td>${esc(b)}</td></tr>`).join('')}</table>${extra}`;
  }
  _ipcHtml() {
    const c2 = IPC[2], c3 = IPC[3];
    const L = LESSONS.ipc;
    return `<h2>📏 IPC-A-610E — mối xuyên lỗ</h2><div class="sub">${esc(IPC_SRC)} · đang chấm Class ${this.pro.cls}</div>
      <table><tr><th>Tiêu chí</th><th>Class 2</th><th>Class 3</th></tr>
      <tr><td>Điền đầy dọc</td><td>${c2.fill * 100} % (lỗ tản nhiệt ${c2.fillThermal * 100} %)</td><td>${c3.fill * 100} %</td></tr>
      <tr><td>Thấm mặt linh kiện</td><td>${c2.primaryDeg}°</td><td>${c3.primaryDeg}°</td></tr>
      <tr><td>Fillet mặt hàn</td><td>${c2.secondaryDeg}°</td><td>${c3.secondaryDeg}°</td></tr>
      <tr><td>Pad mặt hàn phủ</td><td>${c2.padCover * 100} %</td><td>${c3.padCover * 100} %</td></tr>
      <tr><td>Độ nhô chân</td><td>thấy đầu chân · ≤ ${c2.protrMax} mm</td><td>≤ ${c3.protrMax} mm</td></tr>
      <tr><td>Góc thấm ướt</td><td colspan="2">≤ 90°</td></tr>
      <tr><td>Cặn nhựa thông (RMA)</td><td>chỉ báo quá trình</td><td>lỗi — phải làm sạch</td></tr></table>
      <table>${L.body.slice(-1).map(([a, b]) => `<tr><th>${esc(a)}</th><td>${esc(b)}</td></tr>`).join('')}</table>`;
  }
  _workflowHtml() {
    return `<h2>🧑‍🔧 Quy trình thợ chuyên nghiệp (14 bước)</h2><div class="sub">docs/07 §11</div>
      <table><tr><th>#</th><th>Bước</th><th>Việc làm / số liệu</th><th>Nguồn</th></tr>${WORKFLOW.map(([a, b, c], i) => `<tr><td>${i + 1}</td><td><b>${esc(a)}</b></td><td>${esc(b)}</td><td>${esc(c)}</td></tr>`).join('')}</table>`;
  }
  _qcHtml() {
    const b = this._board();
    if (!b) return '<h2>📋 Biên bản QC</h2><div>Chưa có bo nào trên kẹp mạch.</div>';
    const r = this.pro.qcReport(b);
    const pct = (x) => `${Math.round(x * 100)} %`;
    const rows = Object.entries(r.seen).map(([k, n]) => `<tr><td>${esc(DEFECTS[k]?.vi || k)}</td><td>${n}</td></tr>`).join('') || '<tr><td colspan="2">Chưa thấy lỗi nào (trong các mối đã soi)</td></tr>';
    const tips = Object.entries(r.tips).map(([k, n]) => `${k}×${n}`).join(' · ') || '—';
    return `<h2>📋 Biên bản QC — ${esc(b.def?.name || 'board')}</h2><div class="sub">IPC-A-610 Class ${r.cls} (phím C đổi) · phím S: LƯU biên bản (bước 14 "Ghi chép")</div>
      <table><tr><th>Số mối</th><td>${r.total}</td><th>Đã soi (còn hiệu lực)</th><td>${r.inspected} (${pct(r.coverage)})</td></tr>
      <tr><th>Đạt (theo kết quả soi)</th><td>${r.observedPass} — ${pct(r.passRate)}</td><th>Mũi đã dùng</th><td>${esc(tips)}</td></tr></table>
      <h3>Lỗi phát hiện</h3><table><tr><th>Lỗi</th><th>Số mối</th></tr>${rows}</table>
      <div class="sub">Phiếu soi hết hiệu lực khi mối bị sửa / cắt chân / làm sạch → soi lại ở CÙNG độ phóng đại (§10.6).</div>`;
  }
  _reportHtml() {
    const r = this.pro.lastReport;
    if (!r) return '<h2>Phiếu kiểm tra</h2><div>Chưa soi mối nào (phím I, hoặc kính hiển vi).</div>';
    const m = r.metrics;
    return `<div class="two"><div><h2>Phiếu kiểm tra mối ${esc(r.padId)} — ${r.empty ? 'CHƯA HÀN' : r.pass ? '<span style="color:#5fe39a">ĐẠT</span>' : '<span style="color:#ff7b7b">KHÔNG ĐẠT</span>'}</h2>
      <div class="sub">${esc(r.part || '')} · Class ${r.cls} · ${r.mag.toFixed(2)}× (${esc(byVi(r.by))}) · mũi ${esc(r.tip || '?')}</div>
      <table><tr><th>Góc thấm ướt</th><td>${m.angle}°</td></tr><tr><th>Fillet mặt hàn</th><td>${m.secondaryDeg}°</td></tr><tr><th>Thấm mặt linh kiện</th><td>${m.primaryDeg}°</td></tr>
      <tr><th>Điền lỗ</th><td>${Math.round(m.holeFill * 100)} %</td></tr><tr><th>Nhô chân</th><td>${m.protrusion ?? '—'} mm</td></tr><tr><th>Thiếc</th><td>${m.volume} mm³</td></tr></table>
      <h3>Lỗi thấy được</h3>${r.seen.length ? `<ul>${r.seen.map((d) => `<li data-page="defect:${d.code}" style="cursor:pointer"><b>${esc(d.vi)}</b> ${esc(d.detail || '')} — sửa: ${esc(d.fix)}</li>`).join('')}</ul>` : '<div>Không có.</div>'}
      ${r.notes.map((n) => `<div class="sub">⚠ ${esc(n)}</div>`).join('')}</div>
      <div><img class="ph" alt="" src="${this.thumb(r.seen[0]?.code || (r.empty ? 'empty' : 'good'))}"></div></div>`;
  }
  _quizHtml() {
    const q = this.quizState;
    if (!q) return '';
    return `<h2>❓ ${esc(q.title || 'Câu hỏi')}</h2><div style="margin:8px 0 6px">${esc(q.question)}</div>
      ${q.options.map((o, i) => `<button class="opt${q.answered ? (i === q.correct ? ' right' : i === q.choice ? ' wrong' : '') : ''}" data-opt="${i}"><span class="k">${i + 1}</span>${esc(o)}</button>`).join('')}
      ${q.answered ? `<div style="margin-top:8px">${q.result.correct ? '✅ Đúng!' : '❌ Chưa đúng.'} ${esc(q.explain || '')}</div><div class="sub">Enter / N: đóng</div>` : '<div class="sub">Bấm phím 1–' + q.options.length + '</div>'}`;
  }

  // ------------------------------------------------------------------ ảnh dựng thủ tục (WebGL riêng, chỉ trình duyệt)
  _r() {
    if (this._ren !== undefined) return this._ren;
    this._ren = null;
    if (!this.has || this.game.app?.renderer?.isStub) return null;
    try {
      const canvas = document.createElement('canvas');
      const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
      r.setSize(360, 240, false);
      r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.8;
      r.outputColorSpace = THREE.SRGBColorSpace;
      this._ren = r;
    } catch { this._ren = null; }
    return this._ren;
  }
  _scene() {
    if (this._sc) return this._sc;
    const sc = new THREE.Scene();
    sc.background = new THREE.Color(0x1a222c);
    sc.add(new THREE.HemisphereLight(0xf2f6ff, 0x30281e, 0.5));
    const d = new THREE.DirectionalLight(0xffffff, 1.6); d.position.set(4, 9, 6); sc.add(d);
    const d2 = new THREE.DirectionalLight(0xbfd8ff, 0.6); d2.position.set(-6, 5, -3); sc.add(d2);
    try {
      const r = this._r();
      if (r) {
        const pm = new THREE.PMREMGenerator(r); sc.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; sc.environmentIntensity = 0.55;
      }
    } catch { /* */ }
    const cam = new THREE.PerspectiveCamera(30, 1.5, 0.1, 200);
    this._sc = { sc, cam };
    return this._sc;
  }
  /** Ảnh mối hàn (dataURL) theo mã lỗi — 'good' | 'empty' | mã DEFECTS */
  thumb(kind) {
    if (this._thumbs.has(kind)) return this._thumbs.get(kind);
    const url = this._renderJoint(kind) || '';
    this._thumbs.set(kind, url);
    return url;
  }
  tipThumb(code) {
    const k = `tip:${code}`;
    if (this._thumbs.has(k)) return this._thumbs.get(k);
    let url = '';
    const r = this._r();
    if (r) {
      try {
        const { sc, cam } = this._scene();
        const g = new THREE.Group();
        const t = tipGeometry(code);
        t.rotation.y = Math.PI / 2; t.position.set(-6, 0, 0);
        g.add(t);
        sc.add(g);
        cam.fov = 20; cam.updateProjectionMatrix();
        cam.position.set(24, 26, 92); cam.lookAt(22, 0, 0);
        r.render(sc, cam);
        url = r.domElement.toDataURL('image/png');
        sc.remove(g);
      } catch { url = ''; }
    }
    if (url) this._thumbs.set(k, url);
    return url;
  }
  _renderJoint(kind) {
    const r = this._r();
    if (!r) return '';
    try {
      const { sc, cam } = this._scene();
      const M = solderMats();
      const g = new THREE.Group();
      const board = new THREE.Mesh(new THREE.BoxGeometry(14, 1.6, 10), new THREE.MeshStandardMaterial({ color: 0x1f5a34, roughness: 0.55 }));
      board.position.y = -0.8; g.add(board);
      const cuMat = new THREE.MeshStandardMaterial({ color: 0xc9a46a, metalness: 1, roughness: 0.3 });
      const padAt = (x, tinned = true) => {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.9, 32).rotateX(-Math.PI / 2), tinned ? M.good : cuMat);
        ring.position.set(x, 0.01, 0); g.add(ring);
      };
      const lead = (x, L = 1.4) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, L, 16), M.lead); m.position.set(x, L / 2, 0); g.add(m); return m; };
      const fil = (x, k, V, mat, L = 1.4) => { const geo = filletGeometry(k, V, 0.9, 0.3, Math.max(L, 3) + 0.25, L < 3 ? L + 0.03 : null); const m = new THREE.Mesh(geo, mat); m.position.x = x; g.add(m); return m; };
      const two = ['bridge-gross', 'bridge-hairline'].includes(kind);
      const xs = two ? [-1.27, 1.27] : [0];
      for (const x of xs) { padAt(x, !['nonwetting', 'empty'].includes(kind)); lead(x, kind === 'untrimmed' ? 4.5 : kind === 'protrusion-short' ? 0.3 : 1.4); }
      const x0 = xs[0];
      switch (kind) {
        case 'empty': break;
        case 'cold': fil(x0, 'cold', 1.6, M.cold); break;
        case 'rosin': fil(x0, 'cold', 1.6, M.cold); { const f = new THREE.Mesh(fluxDiscGeo(), M.flux); f.position.y = 0.03; g.add(f); } break;
        case 'disturbed': fil(x0, 'grainy', 1.2, M.frosted); break;
        case 'overheated': fil(x0, 'grainy', 1.1, M.overheated); { const c = new THREE.Mesh(charGeo(), M.charBrown); c.position.y = 0.03; g.add(c); } break;
        case 'insufficient': case 'hole-fill': case 'fillet-coverage': fil(x0, 'good', 0.35, M.good); break;
        case 'excess': case 'wetting-angle': fil(x0, 'excess', 3.4, M.good, 1.0); break;
        case 'bridge-gross': for (const x of xs) fil(x, 'good', 1.6, M.good); { const b = new THREE.Mesh(bridgeGeometry(2.54), M.good); b.position.y = 0.32; b.scale.set(1, 0.65, 0.85); g.add(b); } break;
        case 'bridge-hairline': for (const x of xs) fil(x, 'good', 1.2, M.good); { const b = new THREE.Mesh(bridgeGeometry(2.54), M.good); b.position.y = 0.12; b.scale.set(1, 0.12, 0.14); g.add(b); } break;
        case 'icicle': fil(x0, 'good', 1.2, M.good); { const i = new THREE.Mesh(icicleGeo(), M.good); i.position.set(0.3, 0.8, 0.2); i.rotation.z = -0.35; g.add(i); } break;
        case 'pinhole': fil(x0, 'good', 1.2, M.good); for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.CircleGeometry(0.07, 8), M.pinhole); const a = i * 2.1; p.position.set(Math.cos(a) * 0.55, 0.36, Math.sin(a) * 0.55); p.lookAt(p.position.clone().multiplyScalar(3).setY(3)); g.add(p); } break;
        case 'dewetting': fil(x0, 'cold', 1.4, M.cold); { const c = new THREE.Mesh(charGeo(), M.char); c.position.y = 0.03; g.add(c); } break;
        case 'nonwetting': fil(x0, 'cold', 1.2, M.oxide); { const c = new THREE.Mesh(copperRingGeo(), M.copper); c.position.y = 0.012; g.add(c); } break;
        case 'lifted-pad': { const m = fil(x0, 'good', 1.2, M.cold); m.position.y = 0.18; m.rotation.z = 0.18; const rr = new THREE.Mesh(liftedRingGeo(), M.lifted); rr.position.y = 0.16; rr.rotation.z = 0.2; g.add(rr); const s = new THREE.Mesh(scorchGeo(), M.scorch); s.position.y = 0.02; g.add(s); } break;
        case 'flux-residue': fil(x0, 'good', 1.2, M.good); { const f = new THREE.Mesh(fluxDiscGeo(), M.flux); f.position.y = 0.03; f.scale.setScalar(1.4); g.add(f); } break;
        case 'flux-charred': fil(x0, 'good', 1.2, M.overheated); { const c = new THREE.Mesh(charGeo(), M.char); c.position.y = 0.03; c.scale.setScalar(1.3); g.add(c); } break;
        case 'solder-balls': fil(x0, 'good', 1.2, M.good); for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(smallBallGeo(), M.ball); const a = i * 2.4; b.position.set(Math.cos(a) * (1.7 + i * 0.3), 0.14, Math.sin(a) * (1.4 + i * 0.2)); g.add(b); } break;
        case 'untrimmed': fil(x0, 'good', 1.6, M.good, 4.5); break;
        case 'protrusion-short': fil(x0, 'good', 1.2, M.good, 0.3); break;
        case 'measling': fil(x0, 'good', 1.2, M.good); { const m = new THREE.Mesh(measleGeo(), M.measle); m.position.y = 0.02; g.add(m); } break;
        case 'scorch': fil(x0, 'good', 1.2, M.good); { const s = new THREE.Mesh(scorchGeo(), M.scorch); s.position.y = 0.02; g.add(s); } break;
        default: fil(x0, 'good', 1.6, M.good); break;
      }
      sc.add(g);
      if (two) cam.position.set(0, 6.5, 7.5); else cam.position.set(0, 4.4, 5.0); cam.lookAt(0, 0.45, 0);
      cam.fov = two ? 34 : 28; cam.updateProjectionMatrix();
      r.render(sc, cam);
      const url = r.domElement.toDataURL('image/png');
      sc.remove(g);
      return url;
    } catch (e) { console.warn('[solder-cards] ảnh', kind, e); return ''; }
  }
}

function byVi(by) { return by === 'microscope' ? 'kính hiển vi' : by === 'lamp' ? 'đèn kính lúp' : by === 'usb' ? 'kính USB' : by === 'eye' ? 'mắt thường' : String(by || ''); }
