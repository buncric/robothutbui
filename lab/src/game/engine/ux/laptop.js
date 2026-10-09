// =============================================================================
// ux/laptop.js — LAPTOP trên bàn đo & nạp: [E] mở cửa sổ "tài liệu" (nhả khoá chuột, app.uiMode = 'laptop'):
//   • Bài học Lab 3D: mọi lessonId của dụng cụ / linh kiện → ./index.html#/c/<id> (tab mới) + trang chủ Lab 3D
//   • Tài liệu đồ án docs/*.md: đọc ngay trong cửa sổ (Vite nạp dạng ?raw; không có → chỉ hiện tiêu đề)
//   Đóng: nút ✕ / Esc / bấm ra ngoài → khoá chuột lại (cần cú bấm của người dùng — main.js tự khoá khi bấm canvas).
//   API: laptop.open() · close() · isOpen · docs() → [{ file, title }]
// =============================================================================

// tiêu đề tài liệu (dự phòng khi không nạp được nội dung — vd. chạy Node)
export const DOCS = [
  { file: '01_KIEN_TRUC_VA_SO_DO_CHAN.md', title: '01 — Kiến trúc hệ thống & sơ đồ chân' },
  { file: '02_GIAO_THUC.md', title: '02 — Giao thức truyền thông' },
  { file: '03_PLAN_3_NGAY_VA_BOM.md', title: '03 — Kế hoạch 3 ngày & danh sách linh kiện (BOM)' },
  { file: '04_ROADMAP_MASTER.md', title: '04 — Lộ trình từ cơ bản đến master' },
  { file: '05_TAI_LIEU_THAM_KHAO.md', title: '05 — Tài liệu tham khảo' },
  { file: '06_DO_DAC_XAC_ROBOT.md', title: '06 — Phiếu đo đạc xác robot' },
];

let DOC_LOADERS = null;
try { DOC_LOADERS = import.meta.glob('../../../../../docs/*.md', { query: '?raw', import: 'default' }); } catch { DOC_LOADERS = null; }

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Markdown tối giản → HTML (tiêu đề, danh sách, code, bảng, đậm/nghiêng, liên kết) */
export function miniMarkdown(md) {
  const lines = String(md).replace(/\r/g, '').split('\n');
  const out = [];
  let inCode = false, list = null, table = null;
  const inline = (t) => esc(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*]+)\*/g, '<i>$1</i>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const flush = () => { if (list) { out.push(`</${list}>`); list = null; } if (table) { out.push('</table>'); table = null; } };
  for (const ln of lines) {
    if (/^```/.test(ln)) { flush(); out.push(inCode ? '</pre>' : '<pre>'); inCode = !inCode; continue; }
    if (inCode) { out.push(esc(ln)); continue; }
    const h = /^(#{1,4})\s+(.*)/.exec(ln);
    if (h) { flush(); const n = Math.min(3, h[1].length); out.push(`<h${n}>${inline(h[2])}</h${n}>`); continue; }
    if (/^\s*\|/.test(ln)) {
      if (/^\s*\|[\s:|-]+\|\s*$/.test(ln)) continue;
      if (!table) { flush(); table = true; out.push('<table>'); }
      out.push(`<tr>${ln.trim().replace(/^\||\|$/g, '').split('|').map((c) => `<td>${inline(c.trim())}</td>`).join('')}</tr>`);
      continue;
    }
    const li = /^\s*(?:[-*+]|\d+\.)\s+(.*)/.exec(ln);
    if (li) { const t = /^\s*\d+\./.test(ln) ? 'ol' : 'ul'; if (list !== t) { flush(); list = t; out.push(`<${t}>`); } out.push(`<li>${inline(li[1])}</li>`); continue; }
    if (!ln.trim()) { flush(); continue; }
    flush();
    out.push(`<p>${inline(ln)}</p>`);
  }
  flush();
  if (inCode) out.push('</pre>');
  return out.join('\n');
}

export class Laptop {
  constructor(game, ux) {
    this.game = game;
    this.ux = ux;
    this.isOpen = false;
    this._sel = null;
  }

  /** Danh sách tài liệu: theo file thật trong docs/ (Vite) — không có thì danh sách dựng sẵn */
  docs() {
    if (!DOC_LOADERS || !Object.keys(DOC_LOADERS).length) return DOCS;
    return Object.keys(DOC_LOADERS).map((k) => k.split('/').pop()).sort().map((file) => DOCS.find((d) => d.file === file) || { file, title: file.replace(/\.md$/, '').replace(/_/g, ' ').replace(/^(\d+)\s/, '$1 — ') });
  }

  lessons() {
    const seen = new Map();
    for (const d of this.game.items?.defs?.() || []) {
      if (!d.lessonId || seen.has(d.lessonId)) continue;
      seen.set(d.lessonId, d.name || d.lessonId);
    }
    return [...seen].map(([id, name]) => ({ id, name, url: `./index.html#/c/${encodeURIComponent(id)}` })).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }

  open() {
    const game = this.game;
    if (this.isOpen) return;
    this.isOpen = true;
    game.app.uiMode = 'laptop';
    game.app.uiBlocksMovement = true;
    game.interact?._cancelAll?.();
    game.events?.emit('laptop:open', {});
    game.audio?.play?.('ui');
    if (!this.ux.hud.has) return;
    game.app.unlockPointer?.();
    const lessons = this.lessons();
    const html = `<div class="win" data-stop>
      <div class="bar"><span class="dots"><i></i><i></i><i></i></span><b>💻 Laptop lab — CCS C · MPLAB IPE · Tài liệu</b><button class="btn" data-close>✕ Đóng (Esc)</button></div>
      <div class="body"><nav>
        <h5>Lab 3D</h5><a href="./index.html" target="_blank" rel="noopener">🏠 Trang chủ Lab 3D</a>
        <h5>Tài liệu đồ án</h5>${this.docs().map((d) => `<button data-doc="${esc(d.file)}">📄 ${esc(d.title)}</button>`).join('')}
        <h5>Bài học linh kiện (${lessons.length})</h5>${lessons.map((l) => `<a href="${l.url}" target="_blank" rel="noopener">📘 ${esc(l.name)}</a>`).join('')}
      </nav><main><h1>Chào kỹ sư 👋</h1><p>Chọn một tài liệu bên trái để đọc ngay tại đây, hoặc mở bài học linh kiện trong Lab 3D (tab mới).</p>
        <p style="color:#9fb3c8">Mẹo: tài liệu 01 có sơ đồ chân PIC16F877A — mở song song khi đi dây trên breadboard.</p></main></div>
    </div>`;
    const ov = this.ux.hud.showPanel(html, (e) => {
      const t = e.target.closest?.('[data-doc],[data-close]');
      if (t && 'close' in t.dataset) { this.close(); return; }
      if (t?.dataset.doc) { this.showDoc(t.dataset.doc); return; }
      if (!e.target.closest?.('[data-stop]')) this.close();
    });
    this._ov = ov;
    this._esc = (e) => { if (e.key === 'Escape') this.close(); };
    window.addEventListener('keydown', this._esc);
  }

  async showDoc(file) {
    const main = this._ov?.querySelector('main');
    if (!main) return;
    this._ov.querySelectorAll('[data-doc]').forEach((b) => b.classList.toggle('on', b.dataset.doc === file));
    const meta = this.docs().find((d) => d.file === file);
    const key = DOC_LOADERS && Object.keys(DOC_LOADERS).find((k) => k.endsWith(`/${file}`));
    if (!key) { main.innerHTML = `<h1>${esc(meta?.title || file)}</h1><p>Không nạp được nội dung (mở file docs/${esc(file)} trong thư mục dự án).</p>`; return; }
    main.innerHTML = '<p>Đang tải…</p>';
    try { const md = await DOC_LOADERS[key](); main.innerHTML = miniMarkdown(md); main.scrollTop = 0; } catch (err) { main.innerHTML = `<p>Lỗi tải tài liệu: ${esc(err?.message || err)}</p>`; }
  }

  close() {
    if (!this.isOpen) return;
    const game = this.game;
    this.isOpen = false;
    this.ux.hud.hidePanel();
    if (this._esc) window.removeEventListener('keydown', this._esc);
    this._esc = null; this._ov = null;
    if (game.app.uiMode === 'laptop') game.app.uiMode = null;
    game.app.uiBlocksMovement = false;
    game.events?.emit('laptop:close', {});
    if (this.ux.hud.has && game.started && !game.app.freeCursor) game.app.lockPointer?.();   // [bàn 3D] chuột tự do thì không khoá
  }
}
