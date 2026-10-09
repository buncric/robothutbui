// =============================================================================
// ux/index.js — HỆ UX TƯƠNG TÁC (game.ux): gợi ý phím theo ngữ cảnh, ngồi ghế, thao tác tỉ mỉ, kính hiển vi, xem gần,
// laptop, hành động bổ sung cho đồ đạc. Khởi tạo trong main.js SAU khi dựng world + item:
//     game.ux = new UX(game); game.ux.init();      // mỗi khung: game.ux.update(dt)
//
//   game.ux.capture(e) — bộ định tuyến đầu vào: interact / inventory / player hỏi TRƯỚC khi xử lý một phím / chuột / cuộn;
//     true = chế độ hiện tại (kính hiển vi › xem gần › ngồi + tỉ mỉ) đã dùng sự kiện. Kết quả nhớ trên chính object sự kiện
//     (e._ux) nên gọi nhiều lần vẫn chỉ xử lý một lần.
//   game.ux.extraPrompts(add, ctx, taken) — interact thêm hành động của chế độ (vd "E Đứng dậy") vào thanh gợi ý.
//   game.ux.mode → 'microscope' | 'focus' | 'bench' | 'precision' | 'seated' | 'laptop' | null
//   Mô-đun: hud (DOM) · hints · seating · precision · bench (bàn làm việc 3D) · focus · laptop · microscope · context
// =============================================================================
import { UxHud } from './uxHud.js';
import { Hints } from './hints.js';
import { Seating } from './seating.js';
import { Precision } from './precision.js';
import { Focus } from './focus.js';
import { Laptop } from './laptop.js';
import { Microscope } from './microscope.js';
import { ContextActions } from './contextActions.js';
import { Bench } from './bench.js';

export class UX {
  constructor(game) {
    this.game = game;
    this.hud = new UxHud(game);
    this.seating = new Seating(game, this);
    this.precision = new Precision(game, this);
    this.focus = new Focus(game, this);
    this.laptop = new Laptop(game, this);
    this.microscope = new Microscope(game, this);
    this.context = new ContextActions(game, this);
    this.bench = new Bench(game, this);
    this.hints = new Hints(game, this);
    const ev = game.events;
    // nghe trực tiếp (cho sự kiện không ai khác hỏi capture, vd khi interact tạm tắt)
    for (const t of ['input:key', 'input:mouse', 'input:wheel']) ev.on(t, (e) => this.capture(e));
    ev.on('game:loaded', () => { if (this.seating.seated) this.seating.stand(); });
  }

  init() {
    const safe = (name, fn) => { try { fn(); } catch (e) { console.error(`[ux] ${name} lỗi khởi tạo`, e); } };
    safe('seating', () => this.seating.discover());
    safe('context', () => this.context.init());
    safe('microscope', () => this.microscope.init());
    return this;
  }

  get mode() {
    if (this.laptop.isOpen) return 'laptop';
    if (this.microscope.active) return 'microscope';
    if (this.focus.active) return 'focus';
    if (this.bench.active) return 'bench';
    if (this.precision.active) return 'precision';
    if (this.seating.seated) return 'seated';
    return null;
  }

  capture(e) {
    if (!e || typeof e !== 'object') return false;
    if (e._ux !== undefined) return e._ux;
    let r = false;
    try { r = this._route(e); } catch (err) { console.error('[ux] input', err); r = false; }
    e._ux = !!r;
    return e._ux;
  }

  _route(e) {
    const app = this.game.app;
    if (this.laptop.isOpen) return e.type !== 'input:mouse' || e.down;   // cửa sổ laptop nuốt mọi phím / chuột
    if (app.paused || this.game.hud?.menuOpen) return false;
    if (this.game.inventory?.bagOpen) return false;
    if (this.microscope.active && this.microscope.onInput(e)) return true;
    if (this.focus.active && this.focus.onInput(e)) return true;
    if (this.bench.active && this.bench.onInput(e)) return true;
    if (e.type === 'input:wheel' && this.precision.active && this.precision.onWheel(e)) return true;
    if (this.seating.seated && this.seating.onInput(e)) return true;
    return false;
  }

  extraPrompts(add, ctx, taken) {
    if (this.focus.active) { if (!taken.has('E')) add({ key: 'E', label: 'Thôi xem', do: () => this.focus.exit(), src: 'mode' }); return; }
    if (this.microscope.active || this.bench.active) return;
    if (this.precision.active && !taken.has('WHEEL')) add({ key: 'WHEEL', label: `Nâng / hạ mũi (${this.precision.height.toFixed(0)} mm)`, display: true, src: 'hand' });
    this.seating.extraPrompts(add, taken);
  }

  update(dt) {
    const g = this.game;
    try {
      this.seating.update(dt);
      this.focus.update(dt);
      this.precision.update(dt);
      this.microscope.update(dt);
      this.bench.update(dt);
      this.hints.update(dt);
      const card = this.microscope.modeCard() || this.focus.modeCard() || this.bench.modeCard() || this.seating.modeCard();
      const show = !g.app.paused && (this.hints.mode !== 'off' || this.microscope.active);
      this.hud.setMode(show ? card : null);
      if (this.microscope.active || this.precision.active || this.focus.active) g.hud?.setCrosshair?.('hidden');
      // tên vật dưới tâm ngắm: ẩn khi soi kính / xem gần (đã có khung riêng)
      const mode = this.mode;
      if (mode !== this._lastMode) { this._lastMode = mode; if (g.hud) g.hud._targetKey = '#'; }   // vẽ lại tên / thanh hành động
      const tgt = g.hud?.el?.target;
      if (tgt && (this.microscope.active || this.focus.active)) tgt.hidden = true;
      if (g.hud?.root) {
        const cl = g.hud.root.classList;
        cl.toggle('ux-scope', this.microscope.active); cl.toggle('ux-focus', !!this.focus.active);
        cl.toggle('ux-seated', !!this.seating.seated); cl.toggle('ux-prec', !!this.precision.active);   // bảng nhiệm vụ thu gọn 1 dòng
        cl.toggle('ux-bench', !!this.bench.active && !this.microscope.active);                          // bàn 3D: không tâm ngắm / thanh hành động
      }
      this.hud.layout?.(dt);
      // con trỏ tỉ mỉ 2D (ngoài kính hiển vi — trong kính đã có vòng ngắm riêng)
      const pr = this.precision;
      if (pr.active && !this.microscope.active && !this.bench.active && !g.app.paused) {
        const W = g.app.width, H = g.app.height;
        this.hud.setCursor({ x: (pr.ndc.x * 0.5 + 0.5) * W, y: (-pr.ndc.y * 0.5 + 0.5) * H, text: `↕ ${pr.height.toFixed(pr.height % 1 ? 1 : 0)} mm` });
      } else this.hud.setCursor(null);
    } catch (e) {
      if (!this._err) { this._err = true; console.error('[ux] update', e); }
    }
  }
}
