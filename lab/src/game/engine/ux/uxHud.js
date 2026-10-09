// =============================================================================
// ux/uxHud.js — Lớp DOM của hệ UX (gắn vào hud.root): nắp phím đẹp, chip gợi ý nổi trong không gian 3D, thẻ mẹo lần đầu,
// thẻ chế độ (đang ngồi / tỉ mỉ / kính hiển vi), lớp phủ thị kính kính hiển vi (vignette tròn, thước đo, tâm), bảng laptop.
// Node (không DOM) → mọi hàm là no-op.
//
//   uxHud.setChips([{ x, y, opacity, icon, key, hold, label, compact }])
//   uxHud.tip({ icon, title, body:[[key, text]] }) · uxHud.setMode({ icon, title, sub, keys:[[key, text, hold?]] } | null)
//   uxHud.setScope({ mag, focus, light, blur, reticle, scalePx, scaleMm, msg, cursor:{x,y}, marks:[{x,y,text,cls}] } | null)
//   uxHud.showPanel(html, onClick) / hidePanel() · uxHud.layout(dt) (mỗi khung: hàng đợi thẻ mẹo)
//   [bàn 3D] uxHud.setBench({ tip:{ x, y, name, desc, sub, cls:'ok'|'warn'|'bad'|'far', keys:[[key, text]] } | null,
//            pins:[{ x, y, text, cls:'key'|'pos'|'neg' }] } | null) — thẻ chú thích cạnh con trỏ (kiểu tooltip trang Lab 3D) +
//            nhãn cực tính trên bóng xem trước. Thẻ tự né mép màn hình và dải thanh dụng cụ ở đáy.
// [UX 2026-10 — bố cục gọn] Thẻ mẹo nằm trong CỘT TRÁI của HUD (dưới bảng nhiệm vụ, hud.el.lcol) — MỖI LẦN MỘT thẻ (hàng đợi),
//   tạm giấu khi phiếu kiểm tra mối hàn (solder-pro) đang hiện. Kính hiển vi: ẩn bảng nhiệm vụ / thanh hành động / thanh dụng cụ /
//   chip (chỉ giữ lớp phủ thị kính, thẻ phím chế độ, LCD, thông báo). Thẻ chế độ + LCD không lấn vào thanh dụng cụ.
// =============================================================================
import { keyCapHtml } from './keys.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const UX_CSS = `
.rvk{display:inline-flex;align-items:center;justify-content:center;gap:3px;min-width:23px;height:23px;padding:0 6px;border-radius:6px;background:linear-gradient(#f7f9fb,#cfd8e1);color:#0d1520;font:700 12px/1 "Be Vietnam Pro",system-ui,sans-serif;box-shadow:0 2px 0 #77838f,0 3px 7px rgba(0,0,0,.45),inset 0 1px 0 #fff;letter-spacing:.2px;white-space:nowrap}
.rvk.wide{padding:0 8px}.rvk.sm{height:19px;min-width:19px;font-size:10.5px;padding:0 5px;border-radius:5px;box-shadow:0 1.5px 0 #77838f,0 2px 5px rgba(0,0,0,.4)}
.rvk.mouse{background:linear-gradient(#eef8ff,#c4e2f5);padding:0 6px 0 3px}.rvk.mouse b{font-size:10.5px;font-weight:700}.rvk.mouse.sm b{font-size:9.5px}
.rvk .ms{display:block;flex:none}
.rvk-hold{display:inline-block;margin-right:3px;padding:2px 5px;border-radius:4px;background:rgba(127,216,255,.18);border:1px solid rgba(127,216,255,.45);color:#9fe0ff;font:700 9.5px/1.2 system-ui,sans-serif;text-transform:uppercase;letter-spacing:.4px;vertical-align:middle}
.rvk-or{font-style:normal;color:#8aa0b4;margin:0 2px;font-size:11px}
/* thanh hành động đáy giữa */
.rvh-bar{position:absolute;left:50%;bottom:calc(18px + clamp(48px,6.2vw,74px) + 48px);transform:translateX(-50%);display:flex;align-items:stretch;gap:0;max-width:min(980px,96vw);padding:5px 6px;border-radius:12px;transition:opacity .12s}
.rvh-bar .grp{display:flex;flex-wrap:wrap;align-items:center;gap:4px 4px;padding:0 4px}
.rvh-bar .grp+.grp{border-left:1px solid rgba(255,255,255,.12);margin-left:4px;padding-left:8px}
.rvh-bar .grp .gl{font:700 9.5px/1 system-ui;color:#7d90a3;text-transform:uppercase;letter-spacing:.8px;margin-right:2px;writing-mode:horizontal-tb}
.rvh-act{display:flex;align-items:center;gap:6px;padding:4px 7px;border-radius:8px;font-size:13px;white-space:nowrap;color:#eef3f8}
.rvh-act.dis{color:#8b98a6}.rvh-act.dis .rvk{filter:grayscale(1) brightness(.75)}
.rvh-act.dis em{font-style:normal;color:#ff9b9b;font-size:11.5px;margin-left:2px}
.rvh-act.warn>span{color:#ffcf5c}
.rvh-act.pri{background:rgba(127,216,255,.10)}
/* chế độ: kính hiển vi → ẩn HUD không cần (giữ lớp phủ thị kính); xem gần → làm mờ bảng nhiệm vụ */
.rvh.ux-scope .rvh-quest,.rvh.ux-scope .rvh-bar,.rvh.ux-scope .rvh-toolname,.rvh.ux-scope .rvh-hotbar,.rvh.ux-scope .rvh-chips,.rvh.ux-scope .rvh-target,.rvh.ux-scope .rvh-marker{display:none!important}
.rvh.ux-focus .rvh-quest{opacity:.18;transition:opacity .3s}
/* thẻ chế độ + LCD dụng cụ (góc dưới) không lấn vào thanh dụng cụ giữa đáy: rộng ≤ (nửa màn − nửa thanh dụng cụ) */
.rvh-mode,.rvh-lcd{max-width:max(190px,min(330px,calc(50vw - 5 * clamp(48px,6.2vw,74px) - 64px)))!important}
.rvh-lcd{min-width:min(200px,max(190px,calc(50vw - 5 * clamp(48px,6.2vw,74px) - 64px)))!important}
.rvh-lcd .scr{font-size:clamp(13px,1.25vw,18px)!important}
@media (max-width:1100px){.rvh-mode,.rvh-lcd{bottom:calc(18px + clamp(48px,6.2vw,74px) + 26px)!important;max-width:260px!important}}
/* tỉ mỉ: tên vật đi theo con trỏ — nền mờ cho dễ đọc trên nền 3D sáng */
.rvh.ux-prec .rvh-target .rvh-name{background:rgba(10,15,22,.6);padding:3px 9px;border-radius:7px;font-size:13px}
.rvh.ux-prec .rvh-target .rvh-name small{display:inline;margin-left:6px}
/* chip gợi ý nổi */
.rvh-chips{position:absolute;inset:0;overflow:hidden}
.rvh-chip{position:absolute;left:0;top:0;display:flex;align-items:center;gap:6px;padding:4px 9px 4px 5px;border-radius:999px;background:rgba(10,15,22,.68);border:1px solid rgba(255,255,255,.12);box-shadow:0 4px 14px rgba(0,0,0,.35);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);font-size:12.5px;font-weight:600;color:#eef3f8;white-space:nowrap;will-change:transform,opacity;transition:opacity .18s}
.rvh-chip .ic{font-size:14px;line-height:1;width:20px;height:20px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(255,255,255,.08)}
.rvh-chip.compact{padding:3px 5px}.rvh-chip.compact .lb{display:none}
.rvh-chip.dis{color:#9aa7b4;border-style:dashed}.rvh-chip.dis .rvk{filter:grayscale(1) brightness(.8)}
.rvh-pcur{position:absolute;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;border:1.5px solid #ffcf5c;box-shadow:0 0 0 1px rgba(0,0,0,.45),0 0 10px rgba(255,207,92,.45);pointer-events:none}
.rvh-pcur::before,.rvh-pcur::after{content:"";position:absolute;background:#ffcf5c;box-shadow:0 0 0 1px rgba(0,0,0,.35)}
.rvh-pcur::before{left:50%;top:-7px;bottom:-7px;width:1.5px;margin-left:-.75px;opacity:.55}.rvh-pcur::after{top:50%;left:-7px;right:-7px;height:1.5px;margin-top:-.75px;opacity:.55}
.rvh-pcur i{position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px;border-radius:50%;background:#ffcf5c}
.rvh-pcur b{position:absolute;left:18px;top:14px;font:700 10.5px/1 ui-monospace,Menlo,monospace;color:#ffcf5c;text-shadow:0 1px 2px #000;white-space:nowrap}
.rvh-chip::after{content:"";position:absolute;left:50%;bottom:-6px;width:1px;height:6px;background:rgba(255,255,255,.35)}
/* mẹo lần đầu */
.rvh-tip{position:relative;flex:none;width:min(320px,100%);padding:12px 14px 12px;border-left:3px solid #7fd8ff;animation:rvhTipIn .35s cubic-bezier(.2,.8,.2,1);transition:opacity .4s,transform .4s}
.rvh-tip.out{opacity:0;transform:translateX(-14px)}
.rvh-tip h4{margin:0 0 2px;font-size:10.5px;letter-spacing:1.2px;text-transform:uppercase;color:#7fd8ff;font-weight:700}
.rvh-tip h3{margin:0 0 8px;font-size:16px;display:flex;gap:8px;align-items:center}
.rvh-tip ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.rvh-tip li{display:flex;align-items:center;gap:8px;font-size:12.5px;color:#d5e0ea}.rvh-tip li .k{flex:none;min-width:58px;display:flex;justify-content:flex-start}
.rvh-tip .ft{margin-top:8px;font-size:11px;color:#7d90a3}
@keyframes rvhTipIn{from{opacity:0;transform:translateX(-16px)}to{opacity:1;transform:none}}
/* thẻ chế độ */
.rvh-mode{position:absolute;left:18px;bottom:18px;max-width:min(330px,44vw);padding:9px 12px}
.rvh-mode .t{display:flex;align-items:center;gap:8px;font-weight:700;font-size:13.5px}
.rvh-mode .t small{font-weight:500;color:#9fb3c8;font-size:11.5px}
.rvh-mode .t .badge{margin-left:auto;font:700 9.5px/1 system-ui;letter-spacing:.6px;text-transform:uppercase;padding:3px 6px;border-radius:5px;background:rgba(61,220,132,.18);color:#6ff0a8;border:1px solid rgba(61,220,132,.4)}
.rvh-mode ul{list-style:none;margin:7px 0 0;padding:0;display:grid;grid-template-columns:auto 1fr;gap:5px 8px;align-items:center;font-size:12px;color:#c9d6e3}
.rvh-mode ul .k{display:flex;justify-content:flex-start}
/* kính hiển vi */
.rvh-scope{position:absolute;inset:0;pointer-events:none}
.rvh-scope .vig{position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,transparent 0,transparent calc(46vh - 2px),rgba(0,0,0,.55) calc(46vh + 3px),#000 calc(46vh + 14px))}
.rvh-scope .ring{position:absolute;left:50%;top:50%;width:92vh;height:92vh;margin:-46vh 0 0 -46vh;border-radius:50%;box-shadow:inset 0 0 60px rgba(0,0,0,.65),inset 0 0 6px rgba(0,0,0,.8)}
.rvh-scope .ret{position:absolute;left:50%;top:50%;width:92vh;height:92vh;margin:-46vh 0 0 -46vh}
.rvh-scope .ret i{position:absolute;background:rgba(20,255,170,.55)}
.rvh-scope .ret .h{left:8%;right:8%;top:50%;height:1px}.rvh-scope .ret .v{top:8%;bottom:8%;left:50%;width:1px}
.rvh-scope .ret .c{left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;border:1px solid rgba(20,255,170,.75);border-radius:50%;background:none}
.rvh-scope .scale{position:absolute;left:50%;top:calc(50% + 30vh);transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:3px;font:700 11px/1 ui-monospace,Menlo,monospace;color:#7dffcb;text-shadow:0 1px 2px #000}
.rvh-scope .scale b{display:block;height:6px;border:1.5px solid #7dffcb;border-top:0}
.rvh-scope .info{position:absolute;right:max(18px,calc(50% - 46vh - 230px));top:50%;transform:translateY(-50%);width:200px;padding:12px 14px;font-size:12px;color:#c9d6e3}
.rvh-scope .info .mag{font:800 30px/1 "Be Vietnam Pro",system-ui;color:#fff}.rvh-scope .info .mag small{font-size:13px;color:#9fb3c8;font-weight:600}
.rvh-scope .info .row{display:flex;justify-content:space-between;margin-top:6px}.rvh-scope .info .row b{color:#7fd8ff;font-variant-numeric:tabular-nums}
.rvh-scope .info .meter{height:4px;border-radius:2px;background:rgba(255,255,255,.12);margin-top:4px;overflow:hidden}.rvh-scope .info .meter i{display:block;height:100%;background:linear-gradient(90deg,#3ddc84,#7fd8ff)}
.rvh-scope .cur{position:absolute;width:18px;height:18px;margin:-9px 0 0 -9px;border:1.5px solid #ffcf5c;border-radius:50%;box-shadow:0 0 6px rgba(255,207,92,.6)}
.rvh-scope .cur::after{content:"";position:absolute;left:50%;top:50%;width:3px;height:3px;margin:-1.5px;border-radius:50%;background:#ffcf5c}
.rvh-scope .mark{position:absolute;transform:translate(-50%,-130%);padding:3px 7px;border-radius:6px;font:700 11.5px/1.2 system-ui;color:#08130c;background:#6ff0a8;box-shadow:0 2px 8px rgba(0,0,0,.5);white-space:nowrap}
.rvh-scope .mark.bad{background:#ff8f8f}.rvh-scope .mark.warn{background:#ffcf5c}.rvh-scope .mark.unk{background:#c9d6e3}
.rvh-scope .msg{position:absolute;left:50%;top:calc(50% - 40vh);transform:translateX(-50%);padding:6px 12px;border-radius:8px;background:rgba(0,0,0,.6);font-size:12.5px;color:#ffcf5c;white-space:nowrap}
/* [bàn 3D] thẻ chú thích cạnh con trỏ + nhãn chân — giống tooltip / label3d của trang Lab 3D */
.rvh.ux-bench .rvh-cross,.rvh.ux-bench .rvh-target,.rvh.ux-bench .rvh-bar,.rvh.ux-bench .rvh-chips,.rvh.ux-bench .rvh-pcur{display:none!important}
.rvb-tip{position:absolute;left:0;top:0;max-width:300px;padding:7px 11px 8px;border-radius:9px;background:rgba(19,26,35,.93);border:1px solid #4cc2ff;box-shadow:0 6px 20px rgba(0,0,0,.4);font-size:12.5px;line-height:1.35;color:#e6edf3;pointer-events:none;will-change:transform}
.rvb-tip b{display:block;color:#4cc2ff;font-size:13.5px;margin-bottom:2px}
.rvb-tip .d{color:#c9d6e3}
.rvb-tip .s{margin-top:4px;font-weight:600;color:#c9d6e3}
.rvb-tip.ok{border-color:#3ddc84}.rvb-tip.ok .s{color:#6ff0a8}
.rvb-tip.warn{border-color:#ffcf5c}.rvb-tip.warn .s{color:#ffcf5c}
.rvb-tip.bad{border-color:#ff5c5c}.rvb-tip.bad .s{color:#ff9b9b}
.rvb-tip.far{border-color:#5d6b7a}.rvb-tip.far b{color:#9fb3c8}.rvb-tip.far .s{color:#9fb3c8;font-weight:500}
.rvb-tip .k{display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.1);font-size:11.5px;color:#9fb3c8}
.rvb-tip .k span{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}
.rvb-pins{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.rvb-pin{position:absolute;left:0;top:0;padding:2px 6px;border-radius:5px;white-space:nowrap;font:600 11px/1.2 "Be Vietnam Pro",system-ui,sans-serif;background:rgba(22,29,39,.9);border:1px solid #2a3542;color:#e6edf3;will-change:transform}
.rvb-pin::after{content:"";position:absolute;left:50%;bottom:-7px;width:1px;height:7px;background:currentColor;opacity:.7}
.rvb-pin.key{border-color:#ffcf5c;color:#ffe08a}.rvb-pin.pos{border-color:#ff6b6b;color:#ffb3b3}.rvb-pin.neg{border-color:#7fd8ff;color:#bfeaff}
/* bảng laptop */
.rvh-lap{position:fixed;inset:0;z-index:25;display:flex;align-items:center;justify-content:center;background:rgba(4,8,14,.55);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);pointer-events:auto;font:14px/1.45 "Be Vietnam Pro",system-ui,sans-serif;color:#e8eef5}
.rvh-lap .win{width:min(900px,96vw);height:min(600px,90vh);display:flex;flex-direction:column;border-radius:14px;overflow:hidden;background:#11161d;border:1px solid rgba(255,255,255,.1);box-shadow:0 30px 80px rgba(0,0,0,.6)}
.rvh-lap .bar{display:flex;align-items:center;gap:10px;padding:10px 14px;background:linear-gradient(#1d2530,#161c24);border-bottom:1px solid rgba(255,255,255,.07)}
.rvh-lap .bar .dots i{display:inline-block;width:11px;height:11px;border-radius:50%;margin-right:5px;background:#ff5f57}.rvh-lap .bar .dots i+i{background:#febc2e}.rvh-lap .bar .dots i+i+i{background:#28c840}
.rvh-lap .bar b{font-size:13px}.rvh-lap .bar button{margin-left:auto}
.rvh-lap .body{flex:1;display:flex;min-height:0}
.rvh-lap nav{flex:0 0 250px;overflow:auto;padding:12px;border-right:1px solid rgba(255,255,255,.07);display:flex;flex-direction:column;gap:4px}
.rvh-lap nav h5{margin:10px 6px 4px;font-size:10.5px;letter-spacing:1px;text-transform:uppercase;color:#7d90a3}
.rvh-lap nav a,.rvh-lap nav button{display:block;text-align:left;width:100%;font:inherit;font-size:13px;color:#d5e0ea;text-decoration:none;padding:6px 9px;border-radius:7px;border:0;background:none;cursor:pointer}
.rvh-lap nav a:hover,.rvh-lap nav button:hover,.rvh-lap nav .on{background:rgba(127,216,255,.13);color:#fff}
.rvh-lap main{flex:1;overflow:auto;padding:18px 22px;font-size:13.5px;color:#d5e0ea}
.rvh-lap main h1,.rvh-lap main h2,.rvh-lap main h3{color:#fff;margin:14px 0 6px}.rvh-lap main h1{font-size:20px;margin-top:0}.rvh-lap main h2{font-size:16px}.rvh-lap main h3{font-size:14px}
.rvh-lap main pre,.rvh-lap main code{font:12px/1.4 ui-monospace,Menlo,monospace;background:rgba(255,255,255,.05);border-radius:5px}.rvh-lap main pre{padding:8px 10px;overflow:auto}
.rvh-lap main table{border-collapse:collapse;font-size:12.5px;margin:6px 0}.rvh-lap main td,.rvh-lap main th{border:1px solid rgba(255,255,255,.1);padding:3px 7px}
.rvh-lap main a{color:#7fd8ff}
.rvh-lap .btn{font:inherit;font-size:12.5px;cursor:pointer;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.07);color:#e8eef5;padding:5px 12px}
`;

export class UxHud {
  constructor(game) {
    this.game = game;
    this.has = typeof document !== 'undefined' && !!game.hud?.root;
    this._chipsKey = '';
    this._modeKey = '';
    this._tipQ = [];               // hàng đợi thẻ mẹo (mỗi lần một thẻ)
    this._tipGap = 0;
    if (!this.has) return;
    if (!document.getElementById('rvh-ux-style')) {
      const st = document.createElement('style'); st.id = 'rvh-ux-style'; st.textContent = UX_CSS; document.head.appendChild(st);
    }
    const root = game.hud.root;
    const mk = (cls, html = '') => { const e = document.createElement('div'); e.className = cls; e.innerHTML = html; root.appendChild(e); return e; };
    this.el = {
      chips: mk('rvh-chips'),
      scope: mk('rvh-scope', '<div class="vig"></div><div class="ring"></div><div class="ret"><i class="h"></i><i class="v"></i><i class="c"></i></div><div class="scale"><span></span><b></b></div><div class="cur"></div><div class="marks"></div><div class="msg"></div><div class="info rvh-panel"></div>'),
      mode: mk('rvh-mode rvh-panel'),
      pcur: mk('rvh-pcur', '<i></i><b></b>'),
      bpins: mk('rvb-pins'),
      btip: mk('rvb-tip'),
    };
    this.el.btip.hidden = true; this.el.bpins.hidden = true;
    this._pinEls = [];
    this.el.scope.hidden = true; this.el.mode.hidden = true; this.el.pcur.hidden = true;
    // vignette nằm DƯỚI các bảng khác của HUD
    root.insertBefore(this.el.scope, root.firstChild);
    root.insertBefore(this.el.chips, root.firstChild);
    this._chipEls = [];
  }

  // ------------------------------------------------------------------ chip gợi ý nổi
  setChips(list) {
    if (!this.has) return;
    const box = this.el.chips;
    while (this._chipEls.length < list.length) {
      const e = document.createElement('div'); e.className = 'rvh-chip'; box.appendChild(e); this._chipEls.push({ e, key: '' });
    }
    this._chipEls.forEach((c, i) => {
      const d = list[i];
      if (!d) { if (c.e.style.display !== 'none') c.e.style.display = 'none'; return; }
      c.e.style.display = '';
      const key = `${d.icon}|${d.key}|${d.hold}|${d.label}|${d.compact}|${d.disabled}`;
      if (key !== c.key) {
        c.key = key;
        c.e.className = `rvh-chip${d.compact ? ' compact' : ''}${d.disabled ? ' dis' : ''}`;
        c.e.innerHTML = `<span class="ic">${d.icon || '👆'}</span>${keyCapHtml(d.key, { hold: d.hold, small: true })}<span class="lb">${esc(d.label)}</span>`;
      }
      c.e.style.transform = `translate(${d.x.toFixed(1)}px,${d.y.toFixed(1)}px) translate(-50%,-100%)`;
      c.e.style.opacity = d.opacity.toFixed(2);
    });
  }

  // ------------------------------------------------------------------ con trỏ tỉ mỉ (2D) + tên vật đi theo con trỏ
  setCursor(c) {
    if (!this.has) return;
    const el = this.el.pcur, tgt = this.game.hud.el?.target;
    if (!c) {
      if (!el.hidden) { el.hidden = true; if (tgt) { tgt.style.left = ''; tgt.style.top = ''; } }
      return;
    }
    el.hidden = false;
    el.style.transform = `translate(${c.x.toFixed(1)}px,${c.y.toFixed(1)}px)`;
    const t = c.text || '';
    if (t !== this._pcurText) { this._pcurText = t; el.lastChild.textContent = t; }
    if (tgt) { tgt.style.left = `${c.x.toFixed(0)}px`; tgt.style.top = `${(c.y + 22).toFixed(0)}px`; }
  }

  // ------------------------------------------------------------------ [bàn 3D] thẻ chú thích + nhãn chân
  setBench(m) {
    if (!this.has) return;
    const tipEl = this.el.btip, pinBox = this.el.bpins;
    const t = m?.tip;
    if (!t) { if (!tipEl.hidden) { tipEl.hidden = true; this._btipKey = ''; } }
    else {
      const key = JSON.stringify([t.name, t.desc, t.sub, t.cls, t.keys]);
      if (key !== this._btipKey) {
        this._btipKey = key;
        tipEl.className = `rvb-tip${t.cls ? ` ${t.cls}` : ''}`;
        tipEl.innerHTML = `<b>${esc(t.name)}</b>${t.desc ? `<div class="d">${esc(t.desc)}</div>` : ''}${t.sub ? `<div class="s">${esc(t.sub)}</div>` : ''}${t.keys?.length ? `<div class="k">${t.keys.map(([k, txt]) => `<span>${keyCapHtml(k, { small: true })}${esc(txt)}</span>`).join('')}</div>` : ''}`;
      }
      tipEl.hidden = false;
      // chỗ đặt: phải-dưới → trái-dưới → phải-trên → trái-trên con trỏ; né mép màn hình, dải thanh dụng cụ (đáy),
      // thẻ phím chế độ (trái-dưới) và LCD dụng cụ (phải-dưới)
      const W = window.innerWidth, H = window.innerHeight;
      const w = tipEl.offsetWidth || 260, h = tipEl.offsetHeight || 80;
      const band = Math.min(140, 0.062 * W + 70);
      const avoid = [this.el.mode, this.game.hud.el?.lcd].filter((e) => e && !e.hidden && e.offsetParent).map((e) => e.getBoundingClientRect());
      const hit = (x, y) => x < 8 || x + w > W - 8 || y < 8 || y + h > H - band || avoid.some((r) => x < r.right + 6 && x + w > r.left - 6 && y < r.bottom + 6 && y + h > r.top - 6);
      const cands = [[t.x + 18, t.y + 20], [t.x - w - 14, t.y + 20], [t.x + 18, t.y - h - 14], [t.x - w - 14, t.y - h - 14]];
      let [x, y] = cands.find(([cx, cy]) => !hit(cx, cy)) || cands[0];
      x = Math.max(8, Math.min(W - w - 8, x)); y = Math.max(8, Math.min(H - band - h, y));
      tipEl.style.transform = `translate(${x.toFixed(0)}px,${y.toFixed(0)}px)`;
    }
    const pins = m?.pins || [];
    pinBox.hidden = !pins.length;
    while (this._pinEls.length < pins.length) { const e = document.createElement('div'); e.className = 'rvb-pin'; pinBox.appendChild(e); this._pinEls.push({ e, k: '' }); }
    this._pinEls.forEach((p, i) => {
      const d = pins[i];
      if (!d) { if (p.e.style.display !== 'none') p.e.style.display = 'none'; return; }
      p.e.style.display = '';
      const k = `${d.text}|${d.cls}`;
      if (k !== p.k) { p.k = k; p.e.className = `rvb-pin${d.cls ? ` ${d.cls}` : ''}`; p.e.textContent = d.text; }
      p.e.style.transform = `translate(${d.x.toFixed(0)}px,${d.y.toFixed(0)}px) translate(-50%,calc(-100% - 8px))`;
    });
  }

  // ------------------------------------------------------------------ mẹo lần đầu (hàng đợi, cột trái dưới bảng nhiệm vụ)
  tip(t) {
    if (!this.has || !t) return;
    if (this._tipEl || this._tipBlocked() || this._tipGap > 0) {
      if (!this._tipQ.some((x) => x.title === t.title)) this._tipQ.push(t);
      return;
    }
    this._showTip(t);
  }
  /** Phiếu kiểm tra mối hàn đang hiện → chưa hiện mẹo (không đè phiếu) */
  _tipBlocked() { return !!this.game.soldering?.pro?.cards?.rep?.classList?.contains('on') || !!this.game.app?.paused; }
  _showTip(t) {
    const e = document.createElement('div');
    e.className = 'rvh-tip rvh-panel';
    e.innerHTML = `<h4>Mẹo · lần đầu${this._tipQ.length ? ` <span style="color:#7d90a3">(+${this._tipQ.length})</span>` : ''}</h4><h3><span>${t.icon || '💡'}</span>${esc(t.title)}</h3><ul>${(t.body || []).map(([k, txt]) => `<li><span class="k">${keyCapHtml(k, { small: true })}</span><span>${esc(txt)}</span></li>`).join('')}</ul><div class="ft">Tắt mẹo: Esc → Cài đặt → Gợi ý phím</div>`;
    (this.game.hud.el?.lcol || this.game.hud.root).appendChild(e);
    this._tipEl = e;
    this._tipData = t;
    this._tipLeft = 7.5;
    this.game.audio?.play?.('toast', { vol: 0.35 });
  }
  _endTip(requeue = false) {
    const e = this._tipEl;
    if (!e) return;
    if (requeue && this._tipData && this._tipLeft > 2.5) this._tipQ.unshift(this._tipData);
    this._tipEl = null; this._tipData = null;
    e.classList.add('out'); setTimeout(() => e.remove(), 450);
    this._tipGap = 0.6;
  }
  hideTip() { this._tipEl?.remove(); this._tipEl = null; this._tipData = null; this._tipQ.length = 0; }
  /** Mỗi khung (ux.update): đếm giờ thẻ mẹo, nhường phiếu kiểm tra, hiện thẻ kế trong hàng đợi */
  layout(dt) {
    if (!this.has) return;
    if (this._tipGap > 0) this._tipGap -= dt;
    if (this._tipEl) {
      if (this._tipBlocked()) { this._endTip(true); return; }
      this._tipLeft -= dt;
      if (this._tipLeft <= 0) this._endTip(false);
    } else if (this._tipQ.length && this._tipGap <= 0 && !this._tipBlocked()) this._showTip(this._tipQ.shift());
  }

  // ------------------------------------------------------------------ thẻ chế độ
  setMode(m) {
    if (!this.has) return;
    const key = m ? JSON.stringify(m) : '';
    if (key === this._modeKey) return;
    this._modeKey = key;
    const el = this.el.mode;
    if (!m) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<div class="t"><span>${m.icon || ''}</span><span>${esc(m.title)}${m.sub ? `<br><small>${esc(m.sub)}</small>` : ''}</span>${m.badge ? `<span class="badge">${esc(m.badge)}</span>` : ''}</div>${m.keys?.length ? `<ul>${m.keys.map(([k, t, hold]) => `<li class="k">${keyCapHtml(k, { small: true, hold })}</li><li>${esc(t)}</li>`).join('')}</ul>` : ''}`;
  }

  // ------------------------------------------------------------------ kính hiển vi
  setScope(s) {
    if (!this.has) return;
    const el = this.el.scope;
    if (!s) { if (!el.hidden) el.hidden = true; return; }
    el.hidden = false;
    const q = (c) => el.querySelector(c);
    q('.ret').style.display = s.reticle ? '' : 'none';
    const sc = q('.scale');
    sc.style.display = s.reticle && s.scalePx ? '' : 'none';
    if (s.scalePx) { sc.firstChild.textContent = `${s.scaleMm} mm`; sc.lastChild.style.width = `${s.scalePx.toFixed(0)}px`; }
    const cur = q('.cur');
    if (s.cursor) { cur.style.display = ''; cur.style.left = `${s.cursor.x}px`; cur.style.top = `${s.cursor.y}px`; } else cur.style.display = 'none';
    const msg = q('.msg');
    msg.style.display = s.msg ? '' : 'none'; if (s.msg) msg.textContent = s.msg;
    const lightPct = Math.round((s.light || 0) * 100);
    const infoKey = `${s.mag}|${s.focusTxt}|${lightPct}|${s.sharp}|${s.field}`;
    if (infoKey !== this._scopeInfo) {
      this._scopeInfo = infoKey;
      q('.info').innerHTML = `<div class="mag">${s.mag.toFixed(1)}<small>×</small></div><div class="row"><span>Trường nhìn</span><b>Ø ${s.field.toFixed(1)} mm</b></div><div class="row"><span>Độ nét</span><b>${esc(s.focusTxt)}</b></div><div class="meter"><i style="width:${Math.round(s.sharp * 100)}%"></i></div><div class="row"><span>Đèn vòng</span><b>${lightPct}%</b></div><div class="meter"><i style="width:${lightPct}%"></i></div>`;
    }
    const marks = q('.marks');
    const mk = (s.marks || []).map((m) => `<div class="mark ${m.cls || ''}" style="left:${m.x.toFixed(0)}px;top:${m.y.toFixed(0)}px">${esc(m.text)}</div>`).join('');
    if (mk !== this._marksHtml) { this._marksHtml = mk; marks.innerHTML = mk; }
  }

  // ------------------------------------------------------------------ bảng (laptop)
  showPanel(html, onClick) {
    if (!this.has) return null;
    this.hidePanel();
    const ov = document.createElement('div');
    ov.className = 'rvh-lap';
    ov.innerHTML = html;
    ov.addEventListener('click', (e) => onClick?.(e));
    document.body.appendChild(ov);
    this._panel = ov;
    return ov;
  }
  hidePanel() { this._panel?.remove(); this._panel = null; }
}
