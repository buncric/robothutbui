// =============================================================================
// hud.js — Giao diện trên màn hình (DOM): tâm ngắm, gợi ý phím, thanh dụng cụ, thông báo (toast),
// bảng nhiệm vụ, màn LCD dụng cụ, túi linh kiện, soi vật, menu tạm dừng (Esc) + Cài đặt + Phím điều khiển,
// màn hình bắt đầu. Kiểu "game HUD" hiện đại: bảng tối trong mờ, chữ rõ, co giãn theo cửa sổ.
//
//   hud.toast(msg, { kind:'info'|'success'|'warn'|'danger', short })
//   hud.setTarget({ name, sub, prompts:[{key,label,hold,disabled,reason,warn,src}], far, progress } | null)
//     [UX] tên vật hiện dưới tâm ngắm; các hành động hiện ở THANH HÀNH ĐỘNG đáy giữa (trên thanh dụng cụ), chia nhóm:
//     vật đang nhìn | trên tay (src:'hand') | chế độ (src:'mode'); nắp phím vẽ bằng ux/keys.js keyCapHtml.
//   hud.setCrosshair('idle'|'target'|'far'|'hidden') · hud.setInspect(name, desc) | setInspect(null)
//   hud.updateHotbar(slots) · hud.setToolLCD(title, text) · hud.setLCD(text, title) (ghi đè cho minigame)
//   hud.setQuest(model | null) · hud.questComplete({title, score, notes, xp}) · hud.setMarker(Vector3|null, label)
//   hud.flash('danger'|'warn'|'success') · hud.showBag(entries, sel, onPick) / hideBag()
//   hud.showStart({ onStart, onNewGame, saveInfo }) · hud.setLoading(text) · hud.showPause() / hidePause()
//   [nhiệm vụ] hud.questSummary(card) — thẻ tổng kết nhiệm vụ · hud.addMenuTab({ id, label, render(sec, hud), when?() })
//              hud.openMenu(tabId) — mở menu tạm dừng ở tab cho trước (phím J = bảng nhiệm vụ)
// Chạy trong Node (không có document) → mọi hàm là no-op.
// =============================================================================
import * as THREE from 'three';
import { PRESETS } from './quality.js';
import { keyCapHtml } from './ux/keys.js';

const CSS = `
.rvh{position:fixed;inset:0;pointer-events:none;z-index:10;color:#e8eef5;font:14px/1.4 "Be Vietnam Pro",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased;user-select:none}
.rvh *{box-sizing:border-box}
.rvh [hidden]{display:none!important}
.rvh-panel{background:rgba(12,17,24,.72);backdrop-filter:blur(10px) saturate(1.2);-webkit-backdrop-filter:blur(10px) saturate(1.2);border:1px solid rgba(255,255,255,.08);border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.35)}
/* tâm ngắm */
.rvh-cross{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;transition:transform .12s,opacity .15s}
.rvh-cross i{position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px 0 0 -2px;border-radius:50%;background:#fff;box-shadow:0 0 0 1.5px rgba(0,0,0,.55)}
.rvh-cross b{position:absolute;inset:3px;border-radius:50%;border:1.5px solid rgba(255,255,255,.0);transition:all .15s}
.rvh-cross.target b{border-color:rgba(127,216,255,.95);inset:2px;box-shadow:0 0 8px rgba(127,216,255,.5)}
.rvh-cross.far b{border-color:rgba(255,255,255,.35);border-style:dashed}
.rvh-cross.hidden{opacity:0}
.rvh-ring{position:absolute;inset:-3px;transform:rotate(-90deg)}
.rvh-ring circle{fill:none;stroke:#7fd8ff;stroke-width:3;stroke-linecap:round;transition:stroke-dashoffset .05s linear}
/* gợi ý dưới tâm ngắm */
.rvh-target{position:absolute;left:50%;top:calc(50% + 26px);transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:6px;max-width:min(720px,92vw);text-align:center}
.rvh-name{font-weight:700;font-size:15px;letter-spacing:.2px;text-shadow:0 1px 3px rgba(0,0,0,.9);background:rgba(10,15,22,.42);padding:2px 10px;border-radius:8px}
.rvh-name small{display:block;font-weight:500;font-size:12px;color:#9fb3c8}
.rvh-prompts{display:flex;flex-wrap:wrap;justify-content:center;gap:6px 12px;padding:6px 10px}
.rvh-p{display:flex;align-items:center;gap:6px;font-size:13px;white-space:nowrap;text-shadow:0 1px 2px #000}
.rvh-p.dis{opacity:.45}.rvh-p.warn span{color:#ffcf5c}
.rvh-p em{font-style:normal;color:#ff8f8f;font-size:12px}
.rvh-key{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 6px;border-radius:6px;background:linear-gradient(#f4f7fa,#cdd6df);color:#0d1520;font:700 12px/1 system-ui,sans-serif;box-shadow:0 2px 0 #7d8a97,0 3px 6px rgba(0,0,0,.4)}
.rvh-key.mouse{background:linear-gradient(#e8f6ff,#b9dcf2)}
.rvh-key.hold::after{content:"giữ";margin-left:4px;font-weight:600;font-size:10px;color:#2c4a63}
/* thanh dụng cụ */
.rvh-hotbar{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);display:flex;gap:6px;padding:6px;max-width:calc(100vw - 24px)}
.rvh-slot{position:relative;width:clamp(48px,6.2vw,74px);height:clamp(48px,6.2vw,74px);border-radius:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);display:flex;flex-direction:column;align-items:center;justify-content:center;transition:all .15s}
.rvh-slot .ic{font-size:clamp(18px,2.4vw,28px);line-height:1;filter:drop-shadow(0 2px 2px rgba(0,0,0,.5))}
.rvh-slot .k{position:absolute;left:5px;top:3px;font:700 10px/1 system-ui;color:#9fb3c8}
.rvh-slot .nm{position:absolute;bottom:3px;left:3px;right:3px;font-size:9.5px;line-height:1.1;color:#c9d6e3;text-align:center;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.rvh-slot .hd{position:absolute;right:4px;top:3px;font:700 8.5px/1 system-ui;color:#7fd8ff;text-transform:uppercase}
.rvh-slot.empty{opacity:.35}
.rvh-slot.on{background:rgba(127,216,255,.16);border-color:rgba(127,216,255,.85);box-shadow:0 0 0 1px rgba(127,216,255,.4),0 0 18px rgba(127,216,255,.25);transform:translateY(-4px)}
.rvh-toolname{position:absolute;left:50%;bottom:calc(18px + clamp(48px,6.2vw,74px) + 22px);transform:translateX(-50%);font-weight:700;font-size:14px;text-shadow:0 1px 3px #000;transition:opacity .4s;white-space:nowrap}
.rvh-toolname small{color:#9fb3c8;font-weight:500;margin-left:8px}
.rvh.has-lcd .rvh-toolname small{display:none}
/* LCD dụng cụ */
.rvh-lcd{position:absolute;right:18px;bottom:18px;min-width:200px;max-width:min(360px,40vw);padding:10px 12px}
.rvh-lcd h4{margin:0 0 6px;font-size:11px;letter-spacing:.8px;text-transform:uppercase;color:#9fb3c8;font-weight:600}
.rvh-lcd .scr{background:linear-gradient(#a9bea2,#93aa8b);color:#16220f;border-radius:6px;padding:8px 10px;font:700 18px/1.25 "SFMono-Regular",Menlo,Consolas,monospace;box-shadow:inset 0 2px 6px rgba(0,0,0,.35);white-space:pre-wrap;word-break:break-word}
/* nhiệm vụ — [UX 2026-10] nằm trong CỘT TRÁI (.rvh-lcol) cùng thẻ mẹo lần đầu: xếp chồng, không đè nhau */
.rvh-lcol{position:absolute;left:18px;top:18px;display:flex;flex-direction:column;align-items:flex-start;gap:10px;max-height:calc(100vh - 36px - clamp(48px,6.2vw,74px) - 40px);width:min(340px,42vw);pointer-events:none}
.rvh-quest{position:relative;width:100%;padding:12px 14px;flex:0 1 auto;min-height:0;overflow:hidden;transition:padding .2s}
.rvh-quest h3{margin:0;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#7fd8ff}
.rvh-quest h2{margin:2px 0 8px;font-size:16px}
.rvh-quest ol{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:5px}
.rvh-quest li{display:flex;gap:8px;font-size:13px;color:#9fb3c8}
.rvh-quest li::before{content:"";flex:0 0 14px;height:14px;margin-top:2px;border-radius:4px;border:1.5px solid #4c6378}
.rvh-quest li.cur{color:#fff;font-weight:600}.rvh-quest li.cur::before{border-color:#7fd8ff;box-shadow:0 0 8px rgba(127,216,255,.5)}
.rvh-quest li.done{color:#6f8597;text-decoration:line-through}.rvh-quest li.done::before{background:#3ddc84;border-color:#3ddc84}
.rvh-quest li.more{font-size:11.5px;color:#6f8597;font-style:italic}.rvh-quest li.more::before{border:0;flex-basis:14px}
.rvh-quest .hint{margin-top:8px;font-size:12px;color:#ffcf5c}
.rvh-quest .bar{height:4px;border-radius:2px;background:rgba(255,255,255,.1);margin-top:10px;overflow:hidden}.rvh-quest .bar i{display:block;height:100%;background:linear-gradient(90deg,#3ddc84,#7fd8ff);transition:width .4s}
.rvh-quest .cl{display:none;align-items:center;gap:8px;font-size:12.5px;white-space:nowrap;overflow:hidden}
.rvh-quest .cl b{flex:none;font:700 10.5px/1 system-ui;letter-spacing:.8px;text-transform:uppercase;color:#7fd8ff}
.rvh-quest .cl span{overflow:hidden;text-overflow:ellipsis;color:#eef3f8;font-weight:600}
.rvh-quest .cl i{flex:none;font-style:normal;font-size:11px;color:#7d90a3}
/* đang ngồi / tỉ mỉ: thu gọn còn 1 dòng (bước hiện tại) — tự mở ~6 s khi sang bước mới (.peek); J: bảng đầy đủ */
.rvh.ux-seated .rvh-quest:not(.peek),.rvh.ux-prec .rvh-quest:not(.peek){padding:7px 12px}
.rvh.ux-seated .rvh-quest:not(.peek)>:not(.cl),.rvh.ux-prec .rvh-quest:not(.peek)>:not(.cl){display:none}
.rvh.ux-seated .rvh-quest:not(.peek) .cl,.rvh.ux-prec .rvh-quest:not(.peek) .cl{display:flex}
/* thông báo */
.rvh-toasts{position:absolute;left:50%;top:16px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:8px;width:min(560px,92vw)}
.rvh-toast{padding:9px 16px;border-radius:10px;font-size:14px;display:flex;gap:10px;align-items:center;border-left:3px solid #7fd8ff;animation:rvhIn .25s ease-out;transition:opacity .4s,transform .4s}
.rvh-toast.success{border-left-color:#3ddc84}.rvh-toast.warn{border-left-color:#ffcf5c}.rvh-toast.danger{border-left-color:#ff5c5c;background:rgba(60,12,14,.8)}
.rvh-toast.out{opacity:0;transform:translateY(-8px)}
@keyframes rvhIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}
/* soi vật */
.rvh-inspect{position:absolute;left:50%;bottom:120px;transform:translateX(-50%);padding:10px 16px;text-align:center;max-width:min(560px,92vw)}
.rvh-inspect b{font-size:16px}.rvh-inspect p{margin:4px 0 0;font-size:12.5px;color:#b9c8d6}.rvh-inspect small{display:block;margin-top:6px;color:#7fd8ff;font-size:12px}
/* điểm đánh dấu nhiệm vụ */
.rvh-marker{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11px;font-weight:700;color:#ffcf5c;text-shadow:0 1px 2px #000;transition:opacity .2s}
.rvh-marker i{width:12px;height:12px;transform:rotate(45deg);border:2px solid #ffcf5c;box-shadow:0 0 10px rgba(255,207,92,.6)}
/* chớp màn hình */
.rvh-flash{position:absolute;inset:0;opacity:0;transition:opacity .5s;background:radial-gradient(ellipse at center,transparent 45%,rgba(255,40,40,.55))}
.rvh-flash.success{background:radial-gradient(ellipse at center,transparent 50%,rgba(61,220,132,.35))}
.rvh-flash.warn{background:radial-gradient(ellipse at center,transparent 50%,rgba(255,200,60,.4))}
.rvh-fps{position:absolute;right:12px;top:10px;font:600 11px/1 ui-monospace,Menlo,monospace;color:#9fb3c8;background:rgba(0,0,0,.35);padding:4px 6px;border-radius:5px}
/* túi */
.rvh-bag{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(440px,92vw);max-height:70vh;overflow:auto;padding:14px;pointer-events:auto}
.rvh-bag h2{margin:0 0 4px;font-size:17px}.rvh-bag .sub{font-size:12px;color:#9fb3c8;margin-bottom:10px}
.rvh-bag ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
.rvh-bag li{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;border:1px solid transparent}
.rvh-bag li .ic{font-size:20px;width:26px;text-align:center}.rvh-bag li .c{margin-left:auto;font-weight:700;color:#7fd8ff}
.rvh-bag li.on{background:rgba(127,216,255,.14);border-color:rgba(127,216,255,.6)}
.rvh-bag .empty{color:#9fb3c8;font-size:13px;padding:10px}
/* menu & màn bắt đầu */
.rvh-overlay{position:fixed;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;padding:16px;background:radial-gradient(ellipse at 50% 40%,rgba(10,20,32,.55),rgba(4,8,14,.88));backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);pointer-events:auto;color:#e8eef5;font:14px/1.45 "Be Vietnam Pro",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.rvh-start{text-align:center;max-width:640px;cursor:pointer}
.rvh-start .logo{font-size:12px;letter-spacing:4px;text-transform:uppercase;color:#7fd8ff;margin-bottom:6px}
.rvh-start h1{margin:0;font-size:clamp(30px,5.5vw,54px);font-weight:800;letter-spacing:-.5px;background:linear-gradient(180deg,#fff,#a9d9f2);-webkit-background-clip:text;background-clip:text;color:transparent}
.rvh-start p{color:#b9c8d6;margin:10px auto 0;max-width:520px}
.rvh-go{display:inline-flex;align-items:center;gap:10px;margin-top:26px;padding:14px 28px;border-radius:999px;background:linear-gradient(180deg,#8fe0ff,#3cb4ec);color:#03131f;font-weight:800;font-size:17px;box-shadow:0 10px 30px rgba(60,180,236,.35);animation:rvhPulse 2s ease-in-out infinite}
@keyframes rvhPulse{50%{box-shadow:0 10px 40px rgba(60,180,236,.6);transform:translateY(-1px)}}
.rvh-keys{display:flex;flex-wrap:wrap;justify-content:center;gap:8px 16px;margin-top:24px;font-size:12.5px;color:#9fb3c8}
.rvh-keys span{display:flex;align-items:center;gap:6px}
.rvh-small{margin-top:18px;font-size:12px;color:#7d90a3}
.rvh-small button,.rvh-menu button,.rvh-btn{font:inherit;cursor:pointer;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#e8eef5;padding:8px 14px}
.rvh-small button:hover,.rvh-menu button:hover{background:rgba(127,216,255,.14);border-color:rgba(127,216,255,.5)}
.rvh-loading{margin-top:22px;color:#9fb3c8;font-size:13px}
.rvh-menu{display:flex;width:min(860px,96vw);max-height:min(620px,92vh);overflow:hidden;border-radius:16px}
.rvh-menu nav{flex:0 0 220px;display:flex;flex-direction:column;gap:6px;padding:18px;background:rgba(255,255,255,.03);border-right:1px solid rgba(255,255,255,.06)}
.rvh-menu nav h2{margin:0 0 10px;font-size:18px}
.rvh-menu nav button{text-align:left}
.rvh-menu nav button.on{background:rgba(127,216,255,.16);border-color:rgba(127,216,255,.6)}
.rvh-menu nav .go{background:linear-gradient(180deg,#8fe0ff,#3cb4ec);color:#03131f;font-weight:800;border:0}
.rvh-menu section{flex:1;padding:20px 22px;overflow:auto}
.rvh-menu h3{margin:0 0 14px;font-size:16px}
.rvh-row{display:grid;grid-template-columns:170px 1fr 56px;align-items:center;gap:12px;margin-bottom:12px}
.rvh-row label{color:#c9d6e3}.rvh-row output{text-align:right;color:#7fd8ff;font-variant-numeric:tabular-nums}
.rvh-row input[type=range]{width:100%;accent-color:#7fd8ff}
.rvh-row select{font:inherit;background:#101820;color:#e8eef5;border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:6px 8px}
.rvh-help{width:100%;border-collapse:collapse;font-size:13px}
.rvh-help td{padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.06);vertical-align:top}
.rvh-help td:first-child{white-space:nowrap;width:1%}
.rvh-ql{display:flex;flex-direction:column;gap:10px}
.rvh-ql .q{padding:12px;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07)}
.rvh-ql .q b{display:block}.rvh-ql .q small{color:#9fb3c8}
.rvh-ql .q.done{border-color:rgba(61,220,132,.5)}
/* [nhiệm vụ] bảng nhiệm vụ + thẻ tổng kết */
.rvh-ql .q .hd{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.rvh-ql .q .hd b{display:inline}
.rvh-ql .q .ch{font-size:11px;color:#7fd8ff;letter-spacing:.3px}
.rvh-ql .q .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.rvh-ql .q .row .rvh-btn{padding:5px 10px;font-size:12.5px}
.rvh-ql .q.locked{opacity:.55}.rvh-ql .q.failed{border-color:rgba(255,92,92,.55)}.rvh-ql .q.active{border-color:rgba(127,216,255,.7);background:rgba(127,216,255,.07)}
.rvh-ql .q .why{display:block;color:#ff9b9b!important;margin-top:4px}
.rvh-free{display:flex;gap:8px;align-items:center;margin:0 0 12px;color:#c9d6e3;font-size:13px}
.rvh-free input{accent-color:#7fd8ff}
.rvh-sum{position:absolute;right:18px;top:18px;width:min(420px,92vw);padding:16px 18px;border-left:3px solid #3ddc84;animation:rvhIn .3s ease-out}
.rvh-sum.fail{border-left-color:#ff5c5c}
.rvh-sum h3,.rvh-sumc h3{margin:0;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#7fd8ff}
.rvh-sum h2,.rvh-sumc h2{margin:2px 0 6px;font-size:17px}
.rvh-sum .sc,.rvh-sumc .sc{font-size:34px;font-weight:800;line-height:1.1}.rvh-sum.fail .sc,.rvh-sumc.fail .sc{color:#ff7b7b}
.rvh-sum ul,.rvh-sumc ul{margin:4px 0 8px;padding-left:18px;font-size:13px;color:#c9d6e3}
.rvh-sum h4,.rvh-sumc h4{margin:8px 0 2px;font-size:12.5px;color:#ffcf5c}
.rvh-sum .ft{font-size:12px;color:#7d90a3;margin-top:6px}
.rvh-sumc a{color:#7fd8ff}
.rvh-sheet .rvh-row{grid-template-columns:1fr 130px 70px}.rvh-sheet input[type=number],.rvh-sheet input[type=text]{font:inherit;width:100%;background:#101820;color:#e8eef5;border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:5px 8px}
.rvh-sheet .err{color:#ff9b9b;font-size:12.5px}.rvh-sheet .ok{color:#3ddc84;font-size:12.5px}
@media (max-width:640px){.rvh-menu{flex-direction:column}.rvh-menu nav{flex:none;flex-direction:row;flex-wrap:wrap;border-right:0}.rvh-menu nav h2{width:100%}.rvh-row{grid-template-columns:1fr 1fr 44px}.rvh-lcol{width:min(300px,70vw)}.rvh-lcd{display:none}}
`;

const KEY_LABEL = { LMB: 'Chuột trái', RMB: 'Chuột phải', WHEEL: 'Cuộn', MMB: 'Chuột giữa' };

export const CONTROLS_HELP = [
  ['W A S D / ← ↑ → ↓', 'Đi lại'], ['Shift', 'Chạy'], ['C', 'Cúi xuống / đứng lên (mắt 1650 → 1150 mm)'], ['Chuột', 'Nhìn quanh'],
  ['E', 'Nhặt · đặt xuống (bóng xanh = được, đỏ = không) · cắm vào khe · bấm nút / mở nắp'],
  ['G', 'Thả rơi vật đang cầm'], ['Giữ chuột phải', 'Soi vật trước mắt — kéo chuột để xoay, cuộn để đưa xa/gần'],
  ['Cuộn chuột', 'Đưa vật đang cầm xa/gần · chỉnh núm xoay · đổi dụng cụ (khi tay rảnh)'],
  ['R', 'Xoay 90° trước khi đặt / cắm (IC xoay 180° = cắm NGƯỢC!)'], ['F', 'Mở bài học của linh kiện (tab mới)'],
  ['Chuột trái', 'Dùng dụng cụ tay phải (giữ để hàn, vặn vít; nhấp để đo, bấm)'],
  ['Chuột phải', 'Khi cầm 2 dụng cụ (vd mỏ hàn + thiếc): dùng dụng cụ TAY TRÁI (đưa thiếc vào mối hàn)'],
  ['1 – 9', 'Chọn dụng cụ'], ['Q / 0', 'Cất dụng cụ (tay không)'], ['Tab', 'Túi linh kiện'], ['Esc', 'Tạm dừng / menu'],
  // [nhiệm vụ]
  ['J', 'Bảng nhiệm vụ (m0–m6, chọn nhiệm vụ, Chế độ tự do, xem tổng kết)'], ['Enter', 'Đóng thẻ tổng kết nhiệm vụ'],
  ['X', 'Khi cầm PICkit 3: xoay đầu cắm ICSP 180° (▶ phải trùng chân 1 MCLR)'], ['P', 'Chụp ảnh đầu nối đang nhìn (mổ xác robot)'],
  ['K', 'Gửi lệnh thử động cơ DRV tiến → lùi → dừng (nhiệm vụ M4)'], ['H', 'Giữ chặt bánh/trục động cơ để đo dòng kẹt (nhiệm vụ M4)'],
  ['T', 'Nhìn vào robot: lật úp / lật ngửa'],
  // [UX] ngồi ghế · thao tác tỉ mỉ · kính hiển vi
  ['E', 'Nhìn ghế: Ngồi · R: kéo ghế ra / đẩy vào bàn'], ['Space', 'Đang ngồi: đứng dậy'],
  ['Tab / MMB', 'Đang ngồi: bật / tắt THAO TÁC TỈ MỈ — chuột rê con trỏ trên mặt bàn, mũi dụng cụ đi theo (Shift+Tab = túi)'],
  ['Shift', 'Tỉ mỉ: rê chậm, chính xác'], ['WHEEL', 'Tỉ mỉ: nâng / hạ mũi dụng cụ (mm) · kính hiển vi: độ phóng đại'],
  ['Z', 'Đang ngồi: kính lúp (FOV 35°)'], ['W/S', 'Đang ngồi: kéo ghế vào / ra'], ['A/D', 'Đang ngồi: nghiêng người'],
  ['R/F', 'Kính hiển vi: chỉnh nét'], ['L', 'Kính hiển vi: đèn vòng'], ['I', 'Kính hiển vi: đánh giá mối hàn dưới tâm kính'],
  // [bàn 3D] ngồi vào bàn → camera quỹ đạo + chuột thật (Cài đặt → "Ngồi vào bàn → chế độ 3D")
  ['RMB', 'Bàn 3D: nhấp = nhặt / đặt linh kiện dưới con trỏ · kéo = xoay góc nhìn'],
  ['LMB', 'Bàn 3D: dùng dụng cụ tại con trỏ (giữ để hàn) · cắm linh kiện đang cầm'],
  ['MMB', 'Bàn 3D: kéo = dời dọc bàn (hoặc Shift + kéo chuột phải) · W/A/S/D cũng dời'],
  ['WHEEL', 'Bàn 3D: phóng to về phía con trỏ · Shift + cuộn = nâng / hạ mũi dụng cụ'],
  ['T', 'Bàn 3D: nhìn thẳng xuống bo (bấm lại = về góc cũ) · G: góc 45° · F: xem gần vật dưới chuột · C: góc thấp'],
  ['X', 'Bàn 3D: đảo linh kiện đang cầm 180° · R / Shift+R: xoay 90°'], ['M', 'Bàn 3D: kính hiển vi soi mạch'],
  ['Tab', 'Bàn 3D ↔ góc nhìn thứ nhất khi ngồi'], ['Esc', 'Bàn 3D: đặt vật đang cầm xuống chỗ con trỏ (tay không: menu)'],
];

const h = (tag, cls, parent, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const keyCap = (k, hold) => keyCapHtml(k, { hold });     // [UX] nắp phím / chuột đẹp (ux/keys.js)

export class Hud {
  constructor(game, container = null) {
    this.game = game;
    this.has = typeof document !== 'undefined';
    this._targetKey = '';
    this._hotbarKey = '';
    this._lcdOverride = null;
    this._marker = null;
    this._v = new THREE.Vector3();
    this.menuOpen = false;
    this.menuTabs = [];          // [nhiệm vụ] tab thêm vào menu tạm dừng (addMenuTab)
    this._nextTab = null;
    // [nhiệm vụ] phím J → mở bảng nhiệm vụ · Enter → đóng thẻ tổng kết
    game.events?.on?.('input:key', (e) => {
      if (!e.down || e.repeat) return;
      if (e.code === 'KeyJ' && game.started && !this.menuOpen && !game.inventory?.bagOpen) this.openMenu('quests');
      if (e.code === 'Enter' && this._sumEl) this.hideSummary();
    });
    if (!this.has) return;
    if (!document.getElementById('rvh-style')) {
      const st = h('style'); st.id = 'rvh-style'; st.textContent = CSS; document.head.appendChild(st);
      // phông chữ có dấu tiếng Việt đẹp (không có mạng → dùng phông hệ thống)
      const ln = document.createElement('link');
      ln.rel = 'stylesheet';
      ln.href = 'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap';
      document.head.appendChild(ln);
    }
    const root = (this.root = h('div', 'rvh', container || document.body));
    this.el = {
      cross: h('div', 'rvh-cross', root, '<svg class="rvh-ring" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" stroke-dasharray="88" stroke-dashoffset="88"/></svg><b></b><i></i>'),
      target: h('div', 'rvh-target', root),
      bar: h('div', 'rvh-bar rvh-panel', root),        // [UX] thanh hành động đáy giữa
      toasts: h('div', 'rvh-toasts', root),
      lcol: h('div', 'rvh-lcol', root),                 // [UX] cột trái: nhiệm vụ + thẻ mẹo (ux/uxHud.js) xếp chồng
      quest: null,
      toolname: h('div', 'rvh-toolname', root),
      hotbar: h('div', 'rvh-hotbar rvh-panel', root),
      lcd: h('div', 'rvh-lcd rvh-panel', root, '<h4></h4><div class="scr"></div>'),
      inspect: h('div', 'rvh-inspect rvh-panel', root),
      marker: h('div', 'rvh-marker', root, '<i></i><span></span>'),
      flash: h('div', 'rvh-flash', root),
      fps: h('div', 'rvh-fps', root),
      bag: h('div', 'rvh-bag rvh-panel', root),
    };
    this.el.quest = h('div', 'rvh-quest rvh-panel', this.el.lcol);
    this.el.ring = this.el.cross.querySelector('circle');
    for (const k of ['quest', 'lcd', 'inspect', 'marker', 'bag', 'fps']) this.el[k].hidden = true;
    this.el.target.hidden = true;
    this.el.bar.hidden = true;
    root.hidden = true;     // hiện sau khi bắt đầu
  }

  show(v = true) { if (this.has) this.root.hidden = !v; }

  // ------------------------------------------------------------------ thông báo
  toast(msg, { kind = 'info', short = false, ms } = {}) {
    if (!this.has) { return; }
    const ICON = { info: 'ℹ️', success: '✅', warn: '⚠️', danger: '⛔' };
    // không lặp cùng nội dung liên tục
    if (this._lastToast === msg && performance.now() - this._lastToastT < 1200) return;
    this._lastToast = msg; this._lastToastT = performance.now();
    const t = h('div', `rvh-toast rvh-panel ${kind}`, this.el.toasts, `<span>${ICON[kind] || ''}</span><span>${esc(msg)}</span>`);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
    const life = ms ?? (short ? 2200 : 3800);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 450); }, life);
    if (kind === 'danger') this.flash('danger');
    this.game.audio?.play(kind === 'danger' || kind === 'warn' ? 'error' : 'toast', { vol: 0.5 });
  }

  flash(kind = 'danger') {
    if (!this.has) return;
    const f = this.el.flash;
    f.className = `rvh-flash ${kind === 'danger' ? '' : kind}`;
    f.style.transition = 'none'; f.style.opacity = '1';
    requestAnimationFrame(() => { f.style.transition = 'opacity .7s'; f.style.opacity = '0'; });
  }

  // ------------------------------------------------------------------ tâm ngắm + gợi ý
  setCrosshair(state = 'idle') {
    if (!this.has || this._cross === state) return;
    this._cross = state;
    this.el.cross.className = `rvh-cross ${state}`;
  }

  setTarget(t) {
    if (!this.has) return;
    const ring = this.el.ring;
    const prog = t?.progress;
    ring.style.strokeDashoffset = prog != null && prog > 0.001 ? String(88 * (1 - Math.min(1, prog))) : '88';
    const key = t ? JSON.stringify([t.name, t.sub, t.far, (t.prompts || []).map((p) => [p.key, p.label, p.disabled, p.reason, p.warn, p.hold, p.src])]) : '';
    if (key === this._targetKey) return;
    this._targetKey = key;
    const el = this.el.target, bar = this.el.bar;
    if (!t) { el.hidden = true; bar.hidden = true; return; }
    // tên vật dưới tâm ngắm
    el.hidden = !(t.name || t.sub);
    el.innerHTML = `<div class="rvh-name">${esc(t.name)}${t.sub ? `<small>${esc(t.sub)}</small>` : ''}</div>`;
    // [UX] thanh hành động: nhóm vật đang nhìn | trên tay | chế độ
    const act = (p, i) => `<div class="rvh-act${p.disabled ? ' dis' : ''}${p.warn ? ' warn' : ''}${i === 0 && !p.disabled ? ' pri' : ''}">${keyCap(p.key, p.hold)}<span>${esc(p.label)}</span>${p.disabled && p.reason ? `<em>${esc(p.reason)}</em>` : ''}</div>`;
    const groups = [
      ['', (t.prompts || []).filter((p) => !p.src)],
      ['Trên tay', (t.prompts || []).filter((p) => p.src === 'hand')],
      ['', (t.prompts || []).filter((p) => p.src === 'mode')],
    ].filter(([, list]) => list.length);
    bar.hidden = !groups.length;
    bar.innerHTML = groups.map(([label, list]) => `<div class="grp">${label ? `<span class="gl">${esc(label)}</span>` : ''}${list.map(act).join('')}</div>`).join('');
  }

  setInspect(name, desc = '') {
    if (!this.has) return;
    const el = this.el.inspect;
    if (!name) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<b>${esc(name)}</b>${desc ? `<p>${esc(String(desc).replace(/<[^>]+>/g, '')).slice(0, 220)}</p>` : ''}<small>Kéo chuột để xoay · cuộn: xa/gần · thả chuột phải để thôi</small>`;
  }

  // ------------------------------------------------------------------ thanh dụng cụ + LCD
  updateHotbar(slots, force = false) {
    if (!this.has) return;
    // dòng tên + trạng thái dụng cụ đang cầm (vd "Mỏ hàn · Mỏ hàn 350 °C → 350 °C") — cập nhật liên tục
    const acts = slots.filter((s) => s.active && !s.empty && s.key !== 'Q');
    const tn = this.el.toolname;
    const label = acts.map((a) => `${esc(a.name)}${a.status && a.status !== a.name ? `<small>${esc(a.status)}</small>` : ''}`).join('<span style="opacity:.4"> + </span>');
    if (label !== this._tnLabel) {
      this._tnLabel = label;
      tn.innerHTML = label;
      clearTimeout(this._tnT);
      tn.style.transition = 'none'; tn.style.opacity = acts.length ? '1' : '0';
    }
    const key = JSON.stringify(slots.map((s) => [s.key, s.name, s.icon, s.active, s.empty, s.hand]));
    if (!force && key === this._hotbarKey) return;
    this._hotbarKey = key;
    this.el.hotbar.innerHTML = slots.map((s) => s.empty
      ? `<div class="rvh-slot empty"><span class="k">${s.key}</span></div>`
      : `<div class="rvh-slot${s.active ? ' on' : ''}" title="${esc(s.name)}"><span class="k">${s.key}</span>${s.hand ? `<span class="hd">${s.hand === 'L' ? 'trái' : 'phải'}</span>` : ''}<span class="ic">${s.icon || '🧰'}</span><span class="nm">${esc(s.name)}</span></div>`).join('');
  }

  /** Màn LCD dụng cụ (tự cập nhật từ def.tool.hud) */
  setToolLCD(title, text) {
    this._toolLCD = title ? { title, text } : null;
    this._renderLCD();
  }
  /** Ghi đè LCD (minigame / đồng hồ đo) — null để trả lại */
  setLCD(text, title = 'Số đo') {
    this._lcdOverride = text == null ? null : { title, text };
    this._renderLCD();
  }
  _renderLCD() {
    if (!this.has) return;
    const d = this._lcdOverride || (this._toolLCD?.text ? this._toolLCD : null);
    const el = this.el.lcd;
    this.root.classList.toggle('has-lcd', !!d);      // [UX] có LCD → dòng tên dụng cụ chỉ còn tên (trạng thái đã ở LCD)
    if (!d) { el.hidden = true; return; }
    el.hidden = false;
    el.firstChild.textContent = d.title;
    el.lastChild.textContent = d.text;
  }

  // ------------------------------------------------------------------ nhiệm vụ
  setQuest(q) {
    if (!this.has) return;
    const el = this.el.quest;
    if (!q) { el.hidden = true; this._questCur = null; return; }
    el.hidden = false;
    const n = q.steps.length, done = q.steps.filter((s) => s.done).length;
    let cur = q.steps.findIndex((s) => s.current);
    if (cur < 0) cur = Math.min(done, n - 1);
    // [UX] chỉ hiện cửa sổ bước: 1 bước vừa xong + bước hiện tại + 2 bước kế (danh sách đầy đủ: J)
    const a = Math.max(0, cur - 1), b = Math.min(n, cur + 3);
    const li = (s) => `<li class="${s.done ? 'done' : s.current ? 'cur' : ''}">${esc(s.text)}</li>`;
    const more = (k, what) => (k > 0 ? `<li class="more">${k} bước ${what}</li>` : '');
    const curText = q.steps[cur]?.text || '';
    el.innerHTML = `<div class="cl"><b>Nhiệm vụ ${Math.min(done + 1, n)}/${n}</b><span>${esc(curText.replace(/^\d+\.\s*/, ''))}</span><i>J</i></div>`
      + `<h3>Nhiệm vụ${q.chapter ? ` · ${esc(q.chapter)}` : ''}</h3><h2>${esc(q.title)}</h2>`
      + `<ol>${more(a, 'đã xong ✓')}${q.steps.slice(a, b).map(li).join('')}${more(n - b, 'nữa · J: xem hết')}</ol>`
      + `${q.hint ? `<div class="hint">💡 ${esc(q.hint)}</div>` : ''}<div class="bar"><i style="width:${(100 * done) / Math.max(1, n)}%"></i></div>`;
    // sang bước mới → mở rộng tạm khi đang thu gọn (ngồi / tỉ mỉ) để người chơi thấy bước kế
    const key = `${q.title}|${cur}`;
    if (key !== this._questCur) {
      if (this._questCur != null) { el.classList.add('peek'); clearTimeout(this._peekT); this._peekT = setTimeout(() => el.classList.remove('peek'), 6000); }
      this._questCur = key;
    }
  }

  questComplete({ title, score, notes, xp }) {
    this.toast(`Hoàn thành nhiệm vụ "${title}"${score != null ? ` — ${score} điểm` : ''}${xp ? ` · +${xp} XP` : ''}`, { kind: 'success', ms: 5200 });
    if (notes?.length) setTimeout(() => this.toast(notes.join(' · '), { kind: 'info', ms: 5200 }), 600);
    this.flash('success');
  }

  // ------------------------------------------------------------------ [nhiệm vụ] thẻ tổng kết + tab menu
  /** Thẻ tổng kết: { title, chapter, score, failed, reason, mistakes:[…], realLife:[…], notes:[…], lessonId, time } */
  questSummary(card) {
    this.lastSummary = card;
    if (!this.has || !card) return;
    this.hideSummary();
    const el = (this._sumEl = h('div', `rvh-sum rvh-panel${card.failed ? ' fail' : ''}`, this.root));
    el.innerHTML = this._summaryHtml(card, false) + '<div class="ft">Enter: đóng · J: bảng nhiệm vụ (mở bài học, làm lại)</div>';
    clearTimeout(this._sumT);
    this._sumT = setTimeout(() => this.hideSummary(), 30000);
  }
  hideSummary() { clearTimeout(this._sumT); this._sumEl?.remove(); this._sumEl = null; }
  _summaryHtml(c, links = true) {
    const li = (a) => (a?.length ? `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<ul><li>—</li></ul>');
    const min = Math.floor((c.time || 0) / 60), sec = Math.round((c.time || 0) % 60);
    return `<h3>${c.failed ? '❌ Nhiệm vụ thất bại' : '✅ Hoàn thành'}${c.chapter ? ` · ${esc(c.chapter)}` : ''}</h3><h2>${esc(c.title)}</h2>
      <div class="sc">${c.score ?? 0}<small style="font-size:14px;color:#9fb3c8"> / 100 điểm · ${min} phút ${sec} giây</small></div>
      ${c.failed && c.reason ? `<h4>Vì sao thất bại</h4><ul><li>${esc(c.reason)}</li></ul>` : ''}
      <h4>Lỗi / trừ điểm</h4>${li(c.mistakes)}
      ${c.notes?.length ? `<h4>Nhận xét</h4>${li(c.notes)}` : ''}
      <h4>Ngoài đời thật nhớ làm</h4>${li(c.realLife)}
      ${links && c.lessonId ? `<a class="rvh-btn" href="./index.html#/c/${encodeURIComponent(c.lessonId)}" target="_blank" rel="noopener">📘 Xem bài học</a>` : c.lessonId ? `<div style="font-size:12.5px;color:#7fd8ff">📘 Bài học: ./index.html#/c/${esc(c.lessonId)}</div>` : ''}`;
  }
  /** Thêm tab vào menu tạm dừng: { id, label, render(sec, hud), when?() → bool } */
  addMenuTab(tab) { if (tab?.id && !this.menuTabs.some((t) => t.id === tab.id)) this.menuTabs.push(tab); }
  /** Mở menu tạm dừng ở tab `id` (nhả khoá chuột → main.js hiện menu) */
  openMenu(id = 'quests') {
    this._nextTab = id;
    const app = this.game.app;
    if (app?.locked && app.unlockPointer) app.unlockPointer();
    else if (this.has && this.menuOpen) this.showPause();
    else if (this.has && this.game.started) { app?.setPaused?.(true); this.showPause(); }
  }

  setMarker(pos, label = '') {
    this._marker = pos ? { pos: pos.clone ? pos.clone() : new THREE.Vector3(...pos), label } : null;
    if (this.has && !pos) this.el.marker.hidden = true;
  }

  // ------------------------------------------------------------------ túi
  showBag(entries, sel, onPick) {
    if (!this.has) return;
    const el = this.el.bag;
    el.hidden = false;
    el.innerHTML = `<h2>🎒 Túi linh kiện</h2><div class="sub">W/S hoặc cuộn để chọn · E / chuột trái để lấy · Tab để đóng</div>${entries.length
      ? `<ul>${entries.map((e, i) => `<li data-i="${i}" class="${i === sel ? 'on' : ''}"><span class="ic">${e.icon}</span><span>${esc(e.label)}</span>${e.count != null ? `<span class="c">×${e.count}</span>` : ''}</li>`).join('')}</ul>`
      : '<div class="empty">Túi trống. Nhặt linh kiện (E) rồi bấm Tab → "Cất vào túi", hoặc đổi sang dụng cụ khi đang cầm.</div>'}`;
    el.querySelectorAll('li').forEach((li) => li.addEventListener('click', () => onPick?.(+li.dataset.i)));
  }
  hideBag() { if (this.has) this.el.bag.hidden = true; }

  // ------------------------------------------------------------------ mỗi khung
  update(dt) {
    if (!this.has) return;
    const game = this.game;
    // FPS
    const showFps = game.quality?.settings?.showFps;
    this.el.fps.hidden = !showFps;
    if (showFps) { this._fpsT = (this._fpsT || 0) - dt; if (this._fpsT <= 0) { this._fpsT = 0.5; this.el.fps.textContent = `${Math.round(game.app.fps)} fps · ${game.app.frameMs.toFixed(1)} ms`; } }
    // điểm đánh dấu nhiệm vụ
    const m = this._marker, el = this.el.marker;
    if (m && game.camera) {
      const v = this._v.copy(m.pos).project(game.camera);
      const behind = v.z > 1;
      const W = window.innerWidth, H = window.innerHeight;
      let x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
      if (behind) { x = W - x; y = H - 40; }
      x = Math.min(W - 30, Math.max(30, x)); y = Math.min(H - 110, Math.max(30, y));
      const d = game.camera.getWorldPosition(new THREE.Vector3()).distanceTo(m.pos) / 1000;
      el.hidden = false;
      el.style.left = `${x}px`; el.style.top = `${y}px`;
      el.lastChild.textContent = `${m.label ? `${m.label} · ` : ''}${d.toFixed(1)} m`;
      el.style.opacity = d < 1.2 ? '0.35' : '1';
    }
  }

  // ------------------------------------------------------------------ màn bắt đầu
  showStart({ onStart, onNewGame, saveInfo = null } = {}) {
    if (!this.has) return;
    this.hidePause();
    this._start?.remove();
    const ov = (this._start = h('div', 'rvh-overlay', document.body));
    ov.innerHTML = `<div class="rvh-start">
      <div class="logo">Đồ án 2 · Robot hút bụi</div>
      <h1>RoboVac Lab Simulator</h1>
      <p>Bạn là kỹ sư trong phòng lab điện tử: cầm nắm linh kiện, hàn mạch, cắm IC, đo đạc — làm sai là cháy nổ đúng vật lý.</p>
      <div class="rvh-loading" hidden></div>
      <div class="rvh-go">🖱️ Nhấn để bắt đầu</div>
      <div class="rvh-keys">${[['WASD', 'đi'], ['Chuột', 'nhìn'], ['E', 'nhặt / đặt'], ['Giữ chuột phải', 'soi'], ['1–9', 'dụng cụ'], ['Tab', 'túi'], ['Esc', 'menu']].map(([k, v]) => `<span>${keyCap(k)}${v}</span>`).join('')}</div>
      <div class="rvh-small">${saveInfo ? `Đã tải bản lưu lúc ${esc(saveInfo)} · ` : ''}<button data-act="new">Chơi lại từ đầu</button> <button data-act="lab">← Về Lab 3D</button></div>
    </div>`;
    this._startLoading = ov.querySelector('.rvh-loading');
    ov.addEventListener('click', (e) => {
      const act = e.target?.dataset?.act;
      if (act === 'new') { e.stopPropagation(); onNewGame?.(); return; }
      if (act === 'lab') { e.stopPropagation(); location.href = './index.html'; return; }
      if (this._loadingNow) return;
      onStart?.();
    });
  }
  hideStart() { this._start?.remove(); this._start = null; }
  setLoading(text) {
    this._loadingNow = !!text;
    if (!this.has || !this._startLoading) return;
    this._startLoading.hidden = !text;
    this._startLoading.textContent = text || '';
    const go = this._start?.querySelector('.rvh-go');
    if (go) go.style.opacity = text ? '0.4' : '1';
  }

  // ------------------------------------------------------------------ menu tạm dừng
  showPause({ onResume, onSave, onNewGame } = this._pauseCb || {}) {
    if (!this.has) return;
    this._pauseCb = { onResume, onSave, onNewGame };
    this.menuOpen = true;
    this._menu?.remove();
    const ov = (this._menu = h('div', 'rvh-overlay', document.body));
    const box = h('div', 'rvh-menu rvh-panel', ov);
    box.addEventListener('click', (e) => e.stopPropagation());
    const nav = h('nav', '', box, '<h2>⏸ Tạm dừng</h2>');
    const sec = h('section', '', box);
    const tabs = [
      ['resume', '▶ Tiếp tục', 'go'], ['settings', '⚙️ Cài đặt'], ['quests', '🎯 Nhiệm vụ'], ['help', '⌨️ Phím điều khiển'],
      ['save', '💾 Lưu game'], ['new', '↺ Chơi lại từ đầu'], ['lab', '← Về Lab 3D'],
    ];
    // [nhiệm vụ] tab thêm (vd. "📋 Phiếu đo" khi đang mổ xác robot) — chèn sau "Nhiệm vụ"
    const extra = this.menuTabs.filter((t) => { try { return !t.when || t.when(); } catch { return false; } });
    tabs.splice(3, 0, ...extra.map((t) => [t.id, t.label]));
    const show = (id) => {
      nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
      if (id === 'settings') this._renderSettings(sec);
      else if (id === 'help') sec.innerHTML = `<h3>Phím điều khiển</h3><table class="rvh-help">${CONTROLS_HELP.map(([k, v]) => `<tr><td>${k.split(' / ').map((x) => keyCap(x.replace('Chuột phải', 'RMB').replace('Chuột trái', 'LMB').replace('Giữ chuột phải', 'RMB').replace('Cuộn chuột', 'WHEEL').replace('MMB', 'MMB'))).join(' ')}</td><td>${esc(v)}</td></tr>`).join('')}</table>`;
      else if (id === 'quests') this._renderQuests(sec);
      else { const t = extra.find((x) => x.id === id); if (t) { try { t.render(sec, this); } catch (err) { console.warn('[hud] tab', id, err); sec.textContent = String(err); } } }
    };
    for (const [id, label, cls] of tabs) {
      const b = h('button', cls || '', nav, label);
      b.dataset.id = id;
      b.addEventListener('click', () => {
        this.game.audio?.play('ui');
        if (id === 'resume') onResume?.();
        else if (id === 'save') { onSave?.(); }
        else if (id === 'new') { if (confirm('Xoá bản lưu và chơi lại từ đầu?')) onNewGame?.(); }
        else if (id === 'lab') location.href = './index.html';
        else show(id);
      });
    }
    // [nhiệm vụ] mở thẳng tab được yêu cầu (phím J / hud.openMenu)
    const first = this._nextTab && tabs.some(([id]) => id === this._nextTab) ? this._nextTab : 'settings';
    this._nextTab = null;
    show(first);
  }

  hidePause() { this.menuOpen = false; this._menu?.remove(); this._menu = null; }

  /** [nhiệm vụ] Bảng nhiệm vụ: trạng thái khoá / sẵn sàng / đang làm / xong / thất bại, tiên quyết, Chế độ tự do, tổng kết */
  _renderQuests(sec) {
    const q = this.game.quests;
    const list = q?.list?.() || [];
    const ICON = { locked: '🔒', available: '○', active: '▶', done: '✅', failed: '❌' };
    const LABEL = { locked: 'Khoá', available: 'Sẵn sàng', active: 'Đang làm', done: 'Hoàn thành', failed: 'Thất bại' };
    const title = (id) => list.find((x) => x.id === id)?.title || id;
    const card = (x) => {
      const st = x.status || (x.done ? 'done' : x.active ? 'active' : 'available');
      const btns = [];
      if (st === 'available') btns.push(`<button class="rvh-btn" data-q="${esc(x.id)}">Bắt đầu</button>`);
      if (st === 'failed' || st === 'done') btns.push(`<button class="rvh-btn" data-q="${esc(x.id)}">↺ Làm lại</button>`);
      if (x.summary) btns.push(`<button class="rvh-btn" data-sum="${esc(x.id)}">📄 Tổng kết</button>`);
      if (x.lessonId) btns.push(`<a class="rvh-btn" href="./index.html#/c/${encodeURIComponent(x.lessonId)}" target="_blank" rel="noopener">📘 Xem bài học</a>`);
      return `<div class="q ${st}${x.done ? ' done' : ''}">
        <div class="hd"><span>${ICON[st] || '○'}</span><b>${esc(x.title)}</b>${x.chapter ? `<span class="ch">${esc(x.chapter)}</span>` : ''}<small>· ${LABEL[st] || ''}${x.active ? ` (bước ${x.step + 1}/${x.total})` : ''}</small></div>
        <small>${esc(x.intro || '')}</small>
        ${st === 'locked' && x.missing?.length ? `<small class="why">Cần xong trước: ${x.missing.map((m) => esc(title(m))).join(', ')}</small>` : ''}
        ${st === 'available' && x.recommends?.length ? `<small class="why" style="color:#ffcf5c!important">Nên làm trước: ${x.recommends.map((m) => esc(title(m))).join(', ')}</small>` : ''}
        ${st === 'failed' && x.failReason ? `<small class="why">Thất bại: ${esc(x.failReason)}</small>` : ''}
        ${x.score != null || x.best != null ? `<small> Điểm: ${x.score ?? '—'}${x.best != null ? ` · cao nhất ${x.best}` : ''}</small>` : ''}
        ${btns.length ? `<div class="row">${btns.join('')}</div>` : ''}
      </div>`;
    };
    const missions = list.some((x) => x.mission || x.requires?.length);
    sec.innerHTML = `<h3>Nhiệm vụ${q?.xp ? ` · ${q.xp} XP` : ''}</h3>
      ${missions ? `<label class="rvh-free"><input type="checkbox" data-free ${q?.freeMode ? 'checked' : ''}> Chế độ tự do — mở khoá mọi nhiệm vụ (bỏ thứ tự m0 → m6)</label>` : ''}
      <div class="rvh-ql">${list.map(card).join('') || '<small>Chưa có nhiệm vụ.</small>'}</div>`;
    sec.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => { q.start(b.dataset.q); this._renderQuests(sec); }));
    sec.querySelector('[data-free]')?.addEventListener('change', (e) => { q.setFreeMode?.(e.target.checked); this._renderQuests(sec); });
    sec.querySelectorAll('[data-sum]').forEach((b) => b.addEventListener('click', () => {
      const c = list.find((x) => x.id === b.dataset.sum)?.summary;
      if (!c) return;
      sec.innerHTML = `<div class="rvh-sumc${c.failed ? ' fail' : ''}">${this._summaryHtml(c, true)}</div><p><button class="rvh-btn" data-back>← Bảng nhiệm vụ</button></p>`;
      sec.querySelector('[data-back]').addEventListener('click', () => this._renderQuests(sec));
    }));
  }

  _renderSettings(sec) {
    const Q = this.game.quality;
    const s = Q.settings;
    sec.innerHTML = `<h3>Cài đặt</h3>
      <div class="rvh-row"><label>Chất lượng đồ hoạ</label><select data-k="preset">${Object.entries(PRESETS).map(([k, p]) => `<option value="${k}" ${k === s.preset ? 'selected' : ''}>${p.label}</option>`).join('')}</select><output></output></div>
      <div class="rvh-row"><label>Góc nhìn (FOV)</label><input type="range" data-k="fov" min="55" max="100" step="1" value="${s.fov}"><output>${s.fov}°</output></div>
      <div class="rvh-row"><label>Độ nhạy chuột</label><input type="range" data-k="sensitivity" min="0.2" max="3" step="0.05" value="${s.sensitivity}"><output>${(+s.sensitivity).toFixed(2)}</output></div>
      <div class="rvh-row"><label>Âm lượng</label><input type="range" data-k="volume" min="0" max="1" step="0.05" value="${s.volume}"><output>${Math.round(s.volume * 100)}%</output></div>
      <div class="rvh-row"><label>Đảo trục Y</label><input type="checkbox" data-k="invertY" ${s.invertY ? 'checked' : ''}><output></output></div>
      <div class="rvh-row"><label>Lắc đầu khi đi</label><input type="checkbox" data-k="headBob" ${s.headBob ? 'checked' : ''}><output></output></div>
      <div class="rvh-row"><label>Hiện FPS</label><input type="checkbox" data-k="showFps" ${s.showFps ? 'checked' : ''}><output></output></div>
      <h3 style="margin-top:22px">Gợi ý & thao tác tại bàn</h3>
      <div class="rvh-row"><label>Gợi ý phím</label><select data-k="hints">${[['full', 'Đầy đủ'], ['compact', 'Gọn'], ['off', 'Tắt']].map(([v, l]) => `<option value="${v}" ${s.hints === v ? 'selected' : ''}>${l}</option>`).join('')}</select><output></output></div>
      <div class="rvh-row"><label>Mẹo lần đầu</label><button class="rvh-btn" data-reset-tips>Xem lại tất cả mẹo</button><output>${(s.tipsSeen || []).length}</output></div>
      <div class="rvh-row"><label>Tốc độ con trỏ tỉ mỉ</label><input type="range" data-k="precisionSens" min="0.2" max="3" step="0.05" value="${s.precisionSens}"><output>${(+s.precisionSens).toFixed(2)}</output></div>
      <div class="rvh-row"><label>FOV khi ngồi (so với FOV)</label><input type="range" data-k="seatedFov" min="-25" max="10" step="1" value="${s.seatedFov}"><output>${s.seatedFov}°</output></div>
      <div class="rvh-row"><label>FOV kính lúp (Z)</label><input type="range" data-k="magnifierFov" min="20" max="60" step="1" value="${s.magnifierFov}"><output>${s.magnifierFov}°</output></div>
      <div class="rvh-row"><label>Ngồi vào bàn → chế độ 3D</label><input type="checkbox" data-k="benchMode" ${s.benchMode !== false ? 'checked' : ''}><output></output></div>
      <div class="rvh-row"><label>FOV bàn 3D</label><input type="range" data-k="benchFov" min="25" max="70" step="1" value="${s.benchFov ?? 40}"><output>${s.benchFov ?? 40}°</output></div>
      <div class="rvh-row"><label>Kính hiển vi: mờ ngoài vùng nét</label><input type="checkbox" data-k="microscopeBlur" ${s.microscopeBlur ? 'checked' : ''}><output></output></div>
      <p style="color:#7d90a3;font-size:12px;margin-top:16px">Cao = mục tiêu 60 fps trên MacBook M1 Pro. Cực cao thêm bóng 4096 + AO đẹp hơn. Máy yếu chọn Trung bình / Thấp.</p>`;
    sec.querySelectorAll('[data-k]').forEach((inp) => {
      const k = inp.dataset.k;
      const fmt = { fov: (v) => `${v}°`, sensitivity: (v) => (+v).toFixed(2), volume: (v) => `${Math.round(v * 100)}%`, precisionSens: (v) => (+v).toFixed(2), seatedFov: (v) => `${v}°`, magnifierFov: (v) => `${v}°`, benchFov: (v) => `${v}°` };
      inp.addEventListener('input', () => {
        const v = inp.type === 'checkbox' ? inp.checked : inp.tagName === 'SELECT' ? inp.value : +inp.value;
        if (fmt[k]) inp.nextElementSibling.textContent = fmt[k](v);
        if (k !== 'preset') Q.set(k, v);
      });
      inp.addEventListener('change', () => { if (k === 'preset') Q.set('preset', inp.value); });
    });
    sec.querySelector('[data-reset-tips]')?.addEventListener('click', (e) => { Q.set('tipsSeen', []); e.target.nextElementSibling.textContent = '0'; this.toast('Mẹo lần đầu sẽ hiện lại', { kind: 'info', short: true }); });
  }
}
