// =============================================================================
// quests/m1-han-pic.js — Nhiệm vụ M1 "Hàn mạch PIC tối thiểu" (dùng minigames/soldering.js).
// Thứ tự theo bài "Hàn mạch PIC" ở lab 3D (src/components/mo-phong/han-mach-pic.js) + bảng chân docs/01:
//   board vào kẹp → đế DIP-40 (khấc TRÁI) → hàn 40 chân đế → 2 tụ 100 nF sát cặp VDD/VSS (11-12, 32-31)
//   → thạch anh 20 MHz + 2 tụ 22 pF sát chân 13/14 → trở 10 kΩ kéo MCLR (chân 1) → header ICSP 6 chân
//   → LED + trở 330 Ω trên RD7 (chân 30) → cầu đấu nguồn → đo thông mạch → cấp nguồn KHÔNG có chip → cắm PIC.
//   (Nạp chương trình bằng PICkit: nhiệm vụ sau.)
// Chấm điểm: % mối hàn đẹp, cầu thiếc, mối nguội, bong pad, an toàn (máy hút khói, bỏng, chảy nhựa, cất mỏ hàn / tắt trạm), thời gian.
// Gỡ lỗi (chỉ khi chạy vite dev): F9 = hoàn thành ngay bước hiện tại.
// =============================================================================
import * as THREE from 'three';
import { labState } from '../world/_labState.js';

export const QUEST_ID = 'm1-han-pic';
let DEV = false;
try { DEV = !!import.meta.env?.DEV; } catch { DEV = false; }

const SOLDERED = new Set(['good', 'excess', 'cold', 'lifted']);

// ---------------------------------------------------------------------------- tiện ích tra cứu
const S = (game) => game.soldering;
/** Board đục lỗ đang kẹp trên kẹp mạch (hoặc null) */
function boardInVise(game) {
  const vs = game.sockets?.get?.('vise') || game.sockets?.all?.().find((s) => s.kind === 'vise');
  const b = vs?.occupiedBy;
  return b && typeof b.def?.solderPads === 'function' ? b : null;
}
/** Linh kiện id (RegExp hoặc chuỗi) đang cắm trên board */
function partsOn(game, board, id) {
  if (!board) return [];
  const re = id instanceof RegExp ? id : new RegExp(`^${id}$`);
  return (game.items?.all || []).filter((it) => re.test(it.def?.id || '') && S(game)?.boardOf(it) === board);
}
/** Mọi chân của linh kiện đã được hàn (không cầu thiếc) */
function fullySoldered(game, part, minPins = 2) {
  const js = S(game)?.partJoints(part) || [];
  return js.length >= minPins && js.every((j) => SOLDERED.has(j.state) && !j.pad.bridges?.length);
}
/** Khoảng cách (theo số bước lỗ 2.54 mm) giữa 2 pad của board đục lỗ */
const holeDist = (a, b) => (a && b && a.r != null && b.r != null ? Math.hypot(a.r - b.r, a.c - b.c) : Infinity);
/** Pad mà chân `pin` của đế DIP xuyên qua */
function dipPad(game, dip, pin) { return (S(game)?.partJoints(dip) || []).find((j) => j.pin === String(pin))?.pad || null; }
/** Linh kiện có một chân nằm trong `n` lỗ quanh 1 trong các chân DIP cho trước */
function nearPins(game, part, dip, pins, n) {
  const js = S(game)?.partJoints(part) || [];
  const targets = pins.map((p) => dipPad(game, dip, p)).filter(Boolean);
  return js.some((j) => targets.some((t) => holeDist(j.pad, t) <= n));
}
function theDip(game) {
  const b = boardInVise(game);
  return partsOn(game, b, 'dip40-socket')[0] || null;
}
/** Khấc đế (đầu −X cục bộ) quay sang trái board: trục X của đế cùng chiều trục X của board */
function notchLeft(dip, board) {
  if (!dip || !board) return false;
  dip.object.updateWorldMatrix(true, false); board.object.updateWorldMatrix(true, false);
  const a = new THREE.Vector3().setFromMatrixColumn(dip.object.matrixWorld, 0).normalize();
  const b = new THREE.Vector3().setFromMatrixColumn(board.object.matrixWorld, 0).normalize();
  return a.dot(b) > 0.7;
}
const posOf = (it) => it?.object?.getWorldPosition(new THREE.Vector3()) || null;
function viseWhere(game) {
  const b = boardInVise(game);
  if (b) return posOf(b);
  const a = game.world?.anchors?.['vise-base'];
  return a ? a.getWorldPosition(new THREE.Vector3()) : null;
}

// ---------------------------------------------------------------------------- định nghĩa
export function defineM1HanPic(game) {
  const steps = [
    {
      id: 'lay-board', text: 'Lấy board đục lỗ 9×15 trên kệ B2, cắm vào KẸP MẠCH (E)',
      hint: 'Cầm board lại gần kẹp mạch → bóng xanh → E. Bật máy hút khói và trạm hàn (320–350 °C) luôn cho tiện.',
      check: (g) => !!boardInVise(g),
      where: (g) => posOf((g.items?.all || []).find((i) => /^perfboard/.test(i.def.id) && !i.heldBy)) || viseWhere(g),
    },
    {
      id: 'dip-socket', text: 'Cắm đế DIP-40 lên board — KHẤC QUAY SANG TRÁI (chân 1 góc trái-trước)',
      hint: 'Đế IC chứ không hàn chết chip: chip hỏng thay trong 10 s, nhiệt mỏ hàn không tới chip. R để xoay trước khi cắm.',
      check: (g) => { const d = theDip(g); return !!d && notchLeft(d, boardInVise(g)); },
      where: viseWhere,
    },
    {
      id: 'dip-solder', text: 'Lật bo (E vào kẹp) rồi hàn đủ 40 chân đế — hàn 2 chân chéo góc (1 và 21) trước',
      hint: 'Mũi D16 (mặc định). Mỗi mối: LMB chạm mũi vào CẢ pad và chân ~1 s → RMB đưa thiếc vào chỗ tiếp xúc (không vào mũi) → thả thiếc → thả mũi. Nón bóng, lõm nhẹ = đẹp. I: soi mối · N: sổ tay hàn.',
      check: (g) => { const d = theDip(g); return !!d && fullySoldered(g, d, 40); },
      where: viseWhere,
    },
    {
      id: 'cap-vdd', text: 'Hàn 2 tụ 100 nF ("104") sát cặp VDD/VSS: chân 11–12 và chân 32–31',
      hint: 'Tụ khử nhiễu cấp dòng tức thời khi CPU chuyển mạch — chân càng ngắn, càng sát chip càng tốt (≤ 3 lỗ).',
      check: (g) => {
        const d = theDip(g); if (!d) return false;
        const caps = partsOn(g, boardInVise(g), 'cap-ceramic-100nf').filter((c) => fullySoldered(g, c));
        return caps.some((c) => nearPins(g, c, d, [11, 12], 3)) && caps.some((c) => nearPins(g, c, d, [31, 32], 3));
      },
      where: viseWhere,
    },
    {
      id: 'xtal', text: 'Hàn thạch anh 20 MHz sát chân 13/14 + 2 tụ 22 pF xuống GND',
      hint: 'Càng sát càng tốt (< 1 cm): dây dài = điện dung/điện cảm ký sinh → không dao động. Fuse cấu hình HS.',
      check: (g) => {
        const d = theDip(g), b = boardInVise(g); if (!d) return false;
        const x = partsOn(g, b, 'crystal-20mhz-hc49s').some((c) => fullySoldered(g, c) && nearPins(g, c, d, [13, 14], 3));
        const c22 = partsOn(g, b, 'cap-ceramic-22pf').filter((c) => fullySoldered(g, c) && nearPins(g, c, d, [13, 14], 4));
        return x && c22.length >= 2;
      },
      where: viseWhere,
    },
    {
      id: 'mclr', text: 'Hàn trở 10 kΩ (nâu-đen-cam) kéo MCLR (chân 1) lên 5 V',
      hint: 'MCLR = 0 V → chip bị reset; thả nổi → reset lung tung. Bẻ chân trở (B) theo bước lỗ trước khi cắm.',
      check: (g) => { const d = theDip(g); return !!d && partsOn(g, boardInVise(g), 'resistor-10k').some((r) => fullySoldered(g, r) && nearPins(g, r, d, [1], 3)); },
      where: viseWhere,
    },
    {
      id: 'icsp', text: 'Bẻ header đực còn 6 chân, hàn làm cổng nạp ICSP (1-MCLR 2-VDD 3-GND 4-PGD 5-PGC 6-NC)',
      hint: 'Cầm header, cuộn chuột chọn 6 chân rồi B để bẻ. Không nối tải vào RB6/RB7 (chân 39/40).',
      check: (g) => partsOn(g, boardInVise(g), /^header-male/).some((h) => { const n = S(g)?.partJoints(h).length || 0; return n >= 5 && n <= 8 && fullySoldered(g, h, n); }),
      where: viseWhere,
    },
    {
      id: 'led', text: 'Hàn LED trạng thái + trở 330 Ω trên RD7 (chân 30)',
      hint: '(5 − 2.0) / 330 ≈ 9 mA < 25 mA/chân. Chân dài LED = anốt. LED nháy đều = chương trình chạy.',
      check: (g) => {
        const d = theDip(g), b = boardInVise(g); if (!d) return false;
        const r = partsOn(g, b, 'resistor-330').some((x) => fullySoldered(g, x) && nearPins(g, x, d, [30], 4));
        const l = partsOn(g, b, /^led-/).some((x) => fullySoldered(g, x));
        return r && l;
      },
      where: viseWhere,
    },
    {
      id: 'power', text: 'Hàn cầu đấu nguồn 2P (đánh dấu + / −)',
      hint: 'Chân cầu đấu to, hút nhiệt nhiều: ĐỔI MŨI TO (D24/D32 trên giá mũi — T để lắp, miếng chịu nhiệt khi mũi nóng), chấm thêm nhựa thông; chỉ tăng nhiệt là bước cuối (docs/07 §3.5).',
      check: (g) => partsOn(g, boardInVise(g), 'screw-terminal-2p').some((x) => fullySoldered(g, x)),
      where: viseWhere,
    },
    {
      id: 'continuity', text: 'Đo THÔNG MẠCH bằng đồng hồ vạn năng (thang ·)))) — KHÔNG cấp nguồn',
      hint: '11↔32 phải kêu, VDD↔GND KHÔNG được kêu, MCLR↔VDD ≈ 10 kΩ. Cầu thiếc sẽ lộ ra ở bước này!',
      done: (e) => e.type === 'measure' && (e.mode === 'cont' || e.mode === 'ohm'),
      where: viseWhere,
    },
    {
      id: 'power-nochip', text: 'Cấp nguồn bàn 5.0 V (giới hạn 50–100 mA) khi CHƯA có chip — dòng phải ≈ 0',
      hint: 'Đèn CC sáng / dòng > 10 mA → có chập, tắt ngay. Tắt nguồn trước khi cắm chip.',
      done: (e, g) => e.type === 'power:on' && e.source === 'psu' && !(theDip(g)?.sockets || []).some((s) => s.occupiedBy),
    },
    {
      id: 'insert-pic', text: 'TẮT nguồn rồi cắm PIC16F877A vào đế — khấc chip trùng khấc đế',
      hint: 'Chân DIP mới xoè ~6°: tì một hàng chân lên bàn ép thẳng (T) trước khi cắm. Cắm ngược = chip nóng, có thể cháy!',
      done: (e, g) => {
        if (e.type !== 'socket:inserted' || e.item?.def?.id !== 'pic16f877a' || !/^dip40/.test(e.socket?.kind || '')) return false;
        if (e.socket.owner !== theDip(g)) return false;
        if (e.orientation !== 'ok') { g.hud?.toast?.('PIC cắm NGƯỢC khấc! Rút ra cắm lại cho đúng chiều.', { kind: 'danger' }); return false; }
        return true;
      },
      where: viseWhere,
    },
  ];

  const def = {
    id: QUEST_ID,
    title: 'Hàn mạch PIC tối thiểu',
    intro: 'Hàn bo PIC16F877A trên board đục lỗ: đế IC, tụ, thạch anh, MCLR, ICSP, LED, nguồn — rồi kiểm tra trước khi cắm chip. (Nạp chương trình: nhiệm vụ sau.)',
    order: 10,
    autoStart: true,
    steps,
    reward: { xp: 300 },
    scoring: (st) => scoreM1(game, st),
  };
  game.quests.define(def);

  // ---- gỡ lỗi: F9 hoàn thành bước hiện tại (chỉ vite dev)
  if (DEV) {
    game.events.on('input:key', (e) => {
      if (e.down && !e.repeat && e.code === 'F9' && game.quests.activeId === QUEST_ID) cheatStep(game);
    });
  }
  // nhắc nhở an toàn theo ngữ cảnh khi nhiệm vụ đang chạy
  game.events.on('station:power', (e) => {
    if (e.on && game.quests.activeId === QUEST_ID && !labState(game).fume?.on) game.hud?.toast?.('Nhớ BẬT máy hút khói trước khi hàn (khói nhựa thông).', { kind: 'info', short: true });
  });
  return def;
}

/** (gỡ lỗi) hoàn thành ngay bước hiện tại của nhiệm vụ M1 */
export function cheatStep(game) {
  const q = game.quests;
  const def = q.defs.get(QUEST_ID);
  const s = q.state.get(QUEST_ID);
  if (!def || !s || s.done) return false;
  game.hud?.toast?.(`[DEV] Bỏ qua bước: ${def.steps[s.step]?.text || ''}`, { kind: 'info', short: true });
  q._advance(def, s);
  return true;
}

/** Chấm điểm: mối hàn + an toàn + thời gian */
export function scoreM1(game, st) {
  const notes = [];
  let score = 100;
  const ev = st.events || {};
  const b = boardInVise(game) || (game.items?.all || []).find((i) => /^perfboard/.test(i.def.id));
  const sum = b && game.soldering ? game.soldering.boardSummary(b) : null;
  if (sum) {
    const total = sum.good + sum.cold + sum.excess + sum.bridge + sum.lifted;
    const pct = total ? sum.good / total : 0;
    score -= Math.round((1 - pct) * 30);
    notes.push(`Mối hàn đẹp ${Math.round(pct * 100)} % (${sum.good}/${total}) · nguội ${sum.cold} · thừa ${sum.excess} · cầu ${sum.bridge} · bong pad ${sum.lifted}`);
    if (sum.cold) { score -= Math.min(15, sum.cold); notes.push(`Còn ${sum.cold} mối nguội — sau này chập chờn, hàn lại cho bóng`); }
    if (sum.lifted) { score -= 4 * sum.lifted; notes.push('Bong pad: hạ nhiệt độ / rút mũi sớm hơn (≤ 3 s mỗi mối)'); }
    if (pct >= 0.9 && total >= 40) notes.push('Tay hàn rất chắc! ✓');
  }
  // [hàn chuyên nghiệp] biên bản QC theo IPC-A-610 Class 2 (chỉ ghi chú, không đổi thang điểm)
  try { const qc = b && game.soldering?.pro?.qcReport(b, 2); if (qc?.total) notes.push(`IPC-A-610 Class 2: ${qc.truePass}/${qc.total} mối đạt · đã soi ${qc.inspected}`); } catch { /* */ }
  const bridges = ev['solder:bridge'] || 0;
  if (bridges) { score -= 5 * bridges; notes.push(`${bridges} lần tạo cầu thiếc — ít thiếc hơn, không kéo mũi đầy thiếc qua pad bên`); }
  const intoIron = ev['solder:into-iron'] || 0;
  if (intoIron > 3) { score -= Math.min(10, intoIron); notes.push('Hay đưa thiếc vào mũi hàn — đưa vào CHỖ TIẾP XÚC pad/chân'); }
  const fume = ev['safety:fume'] || 0;
  if (fume) { score -= 5 * fume; notes.push('Hàn khi máy hút khói TẮT — khói nhựa thông gây hen nghề nghiệp'); }
  else notes.push('Máy hút khói bật đầy đủ ✓');
  const burns = ev['safety:burn'] || 0;
  if (burns) { score -= 5 * burns; notes.push(`Bỏng tay ${burns} lần — giữ thiếc/bấc xa mũi hàn`); }
  const melts = ev['safety:plastic-melt'] || 0;
  if (melts) { score -= 3 * melts; notes.push('Mũi hàn chạm nhựa (chảy nhựa) — chỉ chạm kim loại'); }
  if (ev['safety:iron-left-on']) { score -= 10; notes.push('Bỏ trạm hàn bật rồi đi xa — nguy cơ cháy'); }
  const ironInHand = game.inventory?.rightTool?.def?.id === 'soldering-iron';
  const stationOn = !!labState(game).station?.on;
  if (ironInHand && stationOn) { score -= 5; notes.push('Kết thúc vẫn cầm mỏ hàn nóng — cất mỏ hàn về giá / tắt trạm'); }
  else notes.push('Mỏ hàn đã cất ✓');
  const faults = (st.faults || []).length;
  if (faults) { score -= 2 * Math.min(10, faults); notes.push(`${faults} sự cố (cong chân, cắm ngược, bong pad…)`); }
  const min = (st.time || 0) / 60;
  if (min < 25) { score += 5; notes.push(`Nhanh: ${min.toFixed(0)} phút`); }
  else if (min > 60) { score -= 5; notes.push(`Mất ${min.toFixed(0)} phút — luyện thêm nhịp tay`); }
  return { score: Math.max(0, Math.min(100, Math.round(score))), notes };
}
