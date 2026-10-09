// =============================================================================
// quests/m2-nap-pic.js — Nhiệm vụ M2 "Nạp chương trình PIC" (Ngày 1 · 15–16h, docs/03 + firmware/pic16f877a_ccs/README.md).
//   Bo PIC đã hàn ở M1 → cấp 5 V từ nguồn bàn (giới hạn 100 mA) → PICkit 3 cắm header ICSP (▶ = chân 1 MCLR) → nạp main.hex
//   → LED RD7 nháy nhanh 3 lần rồi nháy 1 Hz (bộ giải mạch: chương trình PIC 'blink').
//   Lỗi thật được mô phỏng: đầu ICSP cắm NGƯỢC → "Invalid Device ID"; chưa cấp nguồn → "Target VDD not detected";
//   thiếu trở 10 kΩ kéo MCLR → nạp được nhưng chip reset liên tục (LED không nháy); PIC cắm ngược khấc → cháy chip (thất bại).
//   Phím X (khi cầm PICkit 3): xoay đầu cắm ICSP 180°.
// =============================================================================
import { defineMission, whereItem, whereAnchor, pinNet, boardPic } from './_mission.js';
import { installCircuitExt } from './_circuit-ext.js';

export const QUEST_ID = 'm2-nap-pic';
const isPic = (i) => /pic16f877/i.test(i?.def?.id || '');

/** PIC đang nằm trong đế DIP-40 (bo M1 hoặc đế rời) */
export function picInSocket(game) {
  const b = boardPic(game);
  return b && b.socket && /dip40/.test(game.sockets.get(b.socket)?.kind || '') ? b : null;
}
const picEl = (game, pic) => (pic ? game.power?.elementsOf(pic)?.[0] || null : null);
const psuCh = (game) => game.lab?.psu?.channels?.[0] || null;
const pickit = (game) => game.items.all.find((i) => i.def?.id === 'pickit3') || null;

/** Kẹp nguồn bàn: đỏ ở mạng VDD (chân 11/32), đen ở mạng VSS (12/31) của PIC */
export function leadsOnPic(game, pic) {
  const P = game.power, NL = game.netlist;
  if (!pic || !P?.leads.red || !P?.leads.black) return { ok: false };
  const N = NL.get();
  const net = (att) => { const k = NL.keyOf(att); return k ? N.uf2.find(k) : null; };
  const r = net(P.leads.red), b = net(P.leads.black);
  const vdd = [pinNet(game, pic, '11'), pinNet(game, pic, '32')], vss = [pinNet(game, pic, '12'), pinNet(game, pic, '31')];
  return { ok: vdd.includes(r) && vss.includes(b), reversed: vss.includes(r) && vdd.includes(b), r, b };
}

export function defineM2NapPic(game) {
  installCircuitExt(game);
  let M = null;
  M = defineMission(game, {
    id: QUEST_ID,
    title: 'Nạp chương trình PIC',
    chapter: 'Ngày 1 · 15–16h',
    order: 20,
    requires: ['m1-han-pic'],
    lessonId: 'mach-nap-pickit',
    intro: 'Ngày 1, 15h: bo PIC vừa hàn xong. Cấp 5 V có giới hạn dòng, cắm PICkit 3 vào header ICSP (▶ trùng chân 1 MCLR), nạp main.hex (biên dịch từ Ngày 0) — LED RD7 phải nháy 3 lần rồi 1 Hz.',
    kit: [
      { id: 'pickit3', at: 'bench-test', dx: 250, dz: 120 },
      { id: 'dip40-socket', at: 'bench-test', dx: -300, dz: 60 },
      { id: 'pic16f877a', at: 'bench-test', dx: -200, dz: 60 },
    ],
    kitLabel: 'bàn đo & nạp',
    safety: { psuMaxIlim: 0.15, psuOffAtEnd: true },
    xp: 250,
    fastMin: 8,
    realLife: [
      'MPLAB X/IPE v6.20 (bản cuối hỗ trợ PICkit 3) → chọn PIC16F877A → Browse main.hex → Program, đợi "Programming/Verify complete".',
      'Tam giác ▶ trên PICkit = chân 1 (MCLR/VPP). Cắm ngược → "Invalid Device ID (0x0000)" — tháo ra, xoay lại, KHÔNG cố nạp tiếp.',
      'Cấp 5 V từ nguồn bàn giới hạn 50–100 mA (hoặc tick "Power target from tool" cho mạch nhỏ, chưa nối động cơ).',
      'Không nối tải vào RB6/RB7 (PGC/PGD) và không gắn tụ lớn vào MCLR: PICkit kéo MCLR lên ~13 V khi nạp.',
      'LED nháy 3 lần rồi 1 Hz = firmware đang chờ ESP32 (README bước 1). Không nháy → kiểm tra 5 V chân 11/32, thạch anh 20 MHz, trở 10 kΩ MCLR, fuse HS.',
    ],
    counters: { flashed: false, flashTries: 0, lit: 0, mclrWarned: false },
    steps: [
      {
        id: 'board', text: 'Đặt bo PIC đã hàn (M1) lên bàn đo & nạp — PIC16F877A nằm trong đế DIP-40, khấc đúng chiều',
        hint: 'Bo của M1 nằm ở kẹp mạch bàn hàn — nhặt (E) mang sang bàn đo & nạp. Chưa có thì cắm PIC vào đế DIP-40 (khấc trùng khấc).',
        check: (g) => { const p = picInSocket(g); return !!p && p.socketInfo?.orientation !== 'reversed'; },
        where: (g) => whereItem(isPic)(g) || whereAnchor('bench-test')(g),
      },
      {
        id: 'psu-set', text: 'Chỉnh nguồn bàn CH1: 5.00 V, giới hạn dòng 0.05–0.10 A (OUTPUT còn TẮT)',
        hint: 'Núm VOLTAGE / CURRENT trên nguồn bàn: cuộn chuột ±0.1 V / ±0.01 A. Bo PIC + LED chỉ ăn ~15 mA — giới hạn thấp để chập thì nguồn tự hạ áp (CC).',
        check: (g) => { const c = psuCh(g); return !!c && Math.abs(c.vset - 5) <= 0.06 && c.iset >= 0.03 && c.iset <= 0.105; },
        where: whereAnchor('psu', 160),
      },
      {
        id: 'leads', text: 'Kẹp que nguồn: ĐỎ → +5 V (VDD, chân 11/32 / cầu đấu +), ĐEN → GND (VSS, chân 12/31)',
        hint: 'Cầm "Dây nguồn bàn" (phím số): chuột trái lần 1 = kẹp đỏ, lần 2 = kẹp đen. Kẹp vào cầu đấu nguồn của bo M1 (nếu đã đi dây tới chân 11/32 & 12/31) hoặc kẹp thẳng chân 11 (VDD) / 12 (VSS) của PIC. R = tháo kẹp.',
        check: (g) => {
          const r = leadsOnPic(g, picInSocket(g));
          if (r.reversed && !M.T.revWarned) { M.T.revWarned = true; g.hud?.toast?.('Kẹp nguồn NGƯỢC cực (đỏ ở GND)! Tháo ra kẹp lại — bật nguồn lúc này là cháy PIC.', { kind: 'danger' }); }
          return r.ok;
        },
        where: (g) => whereItem(isPic)(g),
      },
      {
        id: 'power', text: 'Bật OUTPUT CH1 — dòng phải nhỏ (≈ 10–20 mA), đèn CC KHÔNG sáng',
        hint: 'Đèn CC sáng / dòng chạm giới hạn = có chập (cầu thiếc, IC ngược) → TẮT ngay, đo thông mạch VDD–GND.',
        check: (g) => { const c = psuCh(g); const e = picEl(g, picInSocket(g)); return !!c?.out && !!g.power?.psuOutputOn && (e?.vcore ?? 0) > 4.5; },
        where: whereAnchor('psu', 160),
      },
      {
        id: 'flash', text: 'Cầm PICkit 3, cắm đầu ICSP vào header (▶ = chân 1 MCLR, X để xoay đầu cắm), chuột trái lên bo PIC → nạp main.hex',
        hint: () => (M.T.lastErr ? `Lần trước lỗi: ${M.T.lastErr}` : 'PICkit 3 nằm ở bàn đo & nạp (cạnh nguồn bàn). Cầm lên (E) → nhìn vào chip PIC/header ICSP → chuột trái. Đợi ~3.5 s.'),
        done: (e) => e.type === 'program:flashed' && e.ok !== false && isPic(e.item || e.target?.userData?.item),
        where: (g) => whereItem('pickit3')(g) || whereAnchor('pickit-spot')(g),
      },
      {
        id: 'blink', text: 'Quan sát LED RD7: nháy nhanh 3 lần rồi nháy đều 1 Hz (chương trình đang chạy, chờ ESP32)',
        hint: () => {
          const e = picEl(game, picInSocket(game));
          const st = e?.status || picInSocket(game)?.state?.mcuStatus || '';
          return st ? `Trạng thái PIC (bộ giải mạch): ${st}` : 'LED không nháy → kiểm tra 5 V chân 11/32, thạch anh 20 MHz + 2 tụ 22 pF, trở 10 kΩ kéo MCLR, LED + 330 Ω ở chân 30.';
        },
        check: () => M.T.lit >= 4,
        where: (g) => whereItem(isPic)(g),
      },
      {
        id: 'off', text: 'Tắt OUTPUT nguồn bàn rồi rút PICkit — xong mốc "LED nháy" của Ngày 1',
        hint: 'Luôn tắt nguồn trước khi rút/cắm mạch nạp hoặc sửa mạch.',
        done: (e) => e.type === 'power:off' && e.source === 'psu',
        where: whereAnchor('psu', 160),
      },
    ],
    failOn(e, g) {
      if (e.type === 'fault' && isPic(e.item) && (e.kind === 'dead' || e.kind === 'burn' || e.kind === 'explode')) return `PIC16F877A đã cháy — ${e.cause || 'quá áp / ngược cực'}`;
      return null;
    },
    score(Mi) {
      let s = 0;
      if (Mi.T.flashTries === 1) Mi.note('Nạp thành công ngay lần đầu ✓');
      if ((Mi.T._maxIlim || 0) > 0 && Mi.T._maxIlim <= 0.105) Mi.note(`Giới hạn dòng ${(Mi.T._maxIlim * 1000).toFixed(0)} mA khi cấp nguồn bo mới ✓`);
      return s;
    },
    onStart(Mi) {
      const pk = pickit(game);
      if (pk) { pk.state.hex = 'main.hex'; pk.state.result = null; }
      Mi.T.lit = 0; Mi.T.flashed = false;
    },
  });
  if (!M) return null;

  // ---- PICkit 3: kiểm tra trước khi nạp (người nghe 'program:start' được đặt payload.ok/reason — xem items/tools/pickit3.js)
  game.events.on('program:start', (p) => {
    if (!M.active()) return;
    const pk = p.instance;
    M.T.flashTries++;
    const pic = isPic(p.item) ? p.item : picInSocket(game);
    const el = picEl(game, pic);
    let reason = '';
    if (pk?.state?.icspFlip) reason = 'Invalid Device ID (0x0000) — đầu ICSP cắm NGƯỢC: tam giác ▶ phải trùng chân 1 (MCLR)';
    else if (pic?.socketInfo?.orientation === 'reversed') reason = 'Invalid Device ID — PIC cắm ngược khấc trong đế';
    else if (!el || (el.vcore ?? 0) < 4.5) reason = 'Target VDD not detected — chưa cấp 5 V cho bo (bật OUTPUT nguồn bàn)';
    if (reason) {
      // events.emit() truyền BẢN SAO payload → đặt p.ok không tới được PICkit; PICkit giữ payload gốc ở state.payload
      // (gán ngay SAU khi emit) → áp kết quả ở bước logic kế tiếp, trước khi nạp xong (3.5 s)
      p.ok = false; p.reason = reason;
      if (pk) pk.state._verdict = { ok: false, reason };
      M.T.lastErr = reason;
      M.mistake(`PICkit báo lỗi: ${reason}`, 5, `pk:${reason.slice(0, 20)}`);
    } else {
      M.T.lastErr = '';
      // thiếu trở kéo MCLR: PICkit tự lái MCLR khi nạp nên VẪN nạp được — nhưng sau đó chip reset liên tục
      const st = String(el?.status || '');
      if (/MCLR/.test(st) && !M.T.mclrWarned) {
        M.T.mclrWarned = true;
        game.hud?.toast?.('PICkit: Programming/Verify complete — nhưng MCLR đang thả nổi / bị kéo thấp: thiếu trở 10 kΩ lên 5 V → chip sẽ reset liên tục!', { kind: 'warn', ms: 7000 });
        M.mistake('Thiếu điện trở 10 kΩ kéo MCLR (chân 1) lên 5 V', 5, 'mclr');
      }
    }
  });
  game.tickers ||= [];
  game.tickers.push(() => {
    for (const pk of game.items.all) {
      const v = pk.def?.id === 'pickit3' ? pk.state._verdict : null;
      if (!v) continue;
      if (pk.state.busy && pk.state.payload) Object.assign(pk.state.payload, v);
      pk.state._verdict = null;
    }
  });
  game.events.on('program:flashed', (e) => {
    if (!M.active() || e.ok === false) return;
    M.T.flashed = true; M.T.lit = 0;
    game.hud?.toast?.('PICkit 3: Programming/Verify complete — main.hex', { kind: 'success' });
  });
  game.events.on('led:lit', () => { if (M.active() && M.T.flashed) M.T.lit++; });
  // phím X: xoay đầu cắm ICSP (khi đang cầm PICkit 3)
  game.events.on('input:key', (e) => {
    if (!e.down || e.repeat || e.code !== 'KeyX') return;
    const pk = game.inventory?.activeTool?.def?.id === 'pickit3' ? game.inventory.activeTool : game.items.all.find((i) => i.def?.id === 'pickit3' && i.heldBy);
    if (!pk) return;
    pk.state.icspFlip = !pk.state.icspFlip;
    game.audio?.play('click');
    game.hud?.toast?.(pk.state.icspFlip ? 'Đầu ICSP: ▶ ở phía chân 6 — NGƯỢC!' : 'Đầu ICSP: ▶ trùng chân 1 (MCLR) — đúng chiều', { kind: pk.state.icspFlip ? 'warn' : 'info', short: true });
  });
  return M;
}
