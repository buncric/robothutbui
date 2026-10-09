// =============================================================================
// quests/m3-nguon-5v.js — Nhiệm vụ M3 "Cây nguồn: pin 4S → cầu chì → công tắc → buck 5 V" (docs/01 §2, Ngày 1–2).
//   pack-4s-bms (14.4 V, XT60) → cầu chì 10 A (sát cực +) → công tắc KCD1 → XL4015 IN; ĐO và VẶN trimmer cho OUT = 5.0 V
//   TRƯỚC khi nối bo PIC. XL4015 xuất xưởng ≈ 12 V: nối tải trước → PIC nhận 12 V > 7.5 V tuyệt đối → cháy (bộ giải mạch thật,
//   circuit/damage.js) → NHIỆM VỤ THẤT BẠI kèm giải thích. Kiểm tra GND chung bằng đồng hồ (thông mạch pin− ↔ GND bo PIC).
// =============================================================================
import { defineMission, whereItem, pinNet, probeNets, isLive, boardPic, sameNode } from './_mission.js';
import { installCircuitExt } from './_circuit-ext.js';

export const QUEST_ID = 'm3-nguon-5v';
const MINUS = '−';
const id = (x) => (i) => i?.def?.id === x;
const isPic = (i) => /pic16f877/i.test(i?.def?.id || '');
const isBuck = (i) => i?.def?.electrical?.type === 'buck';
const isPack = (i) => i?.def?.id === 'pack-4s-bms';
const isFuse = (i) => i?.def?.electrical?.type === 'fuse';
const isRocker = (i) => i?.def?.id === 'rocker-switch-kcd1';

function parts(game) {
  const f = (p) => game.items.all.find((i) => isLive(i) && p(i)) || null;
  return { pack: f(isPack), fuse: f(isFuse), rk: f(isRocker), buck: f(isBuck), pic: boardPic(game) };
}
const buckEl = (game, b) => (b ? game.power?.elementsOf(b)?.[0] || null : null);

/** Kiểm tra đường nguồn: pin+ → cầu chì → công tắc → buck IN+, pin− → buck IN− (trả { ok, missing:[…] }) */
export function powerPath(game) {
  const { pack, fuse, rk, buck } = parts(game);
  const miss = [];
  if (!pack || !fuse || !rk || !buck) return { ok: false, missing: ['đủ pin 4S, cầu chì, công tắc, buck trên bàn'] };
  const n = (it, p) => pinNet(game, it, p);
  const pPlus = n(pack, 'P+'), pMinus = n(pack, `P${MINUS}`);
  const f1 = n(fuse, '1'), f2 = n(fuse, '2'), r1 = n(rk, '1'), r2 = n(rk, '2');
  const inP = n(buck, 'IN+'), inM = n(buck, `IN${MINUS}`);
  const fuseIn = pPlus === f1 ? f2 : pPlus === f2 ? f1 : null;
  if (!fuseIn) miss.push('cực + pin (P+) → cầu chì 10 A (cầu chì SÁT cực + pin)');
  const rkOut = fuseIn && fuseIn === r1 ? r2 : fuseIn && fuseIn === r2 ? r1 : null;
  if (fuseIn && !rkOut) miss.push('cầu chì → công tắc nguồn');
  if (rkOut && rkOut !== inP) miss.push('công tắc → buck IN+');
  if (!sameNode(game, pMinus, inM)) miss.push('cực − pin (P−) → buck IN−');
  return { ok: !miss.length, missing: miss };
}
/** bo PIC nhận nguồn từ buck OUT */
export function picOnBuck(game) {
  const { buck, pic } = parts(game);
  if (!buck || !pic) return { ok: false, missing: ['bo PIC'] };
  const op = pinNet(game, buck, 'OUT+'), om = pinNet(game, buck, `OUT${MINUS}`);
  const miss = [];
  if (op !== pinNet(game, pic, '11') && op !== pinNet(game, pic, '32')) miss.push('buck OUT+ → VDD bo PIC (cầu đấu +, chân 11/32)');
  if (!sameNode(game, om, pinNet(game, pic, '12')) && !sameNode(game, om, pinNet(game, pic, '31'))) miss.push('buck OUT− → GND bo PIC (chân 12/31)');
  return { ok: !miss.length, missing: miss };
}

export function defineM3Nguon5V(game) {
  installCircuitExt(game);
  let M = null;
  const vout = () => { const { buck } = parts(game); return buck?.state?.vout ?? buckEl(game, buck)?.vout ?? null; };
  const vset = () => { const { buck } = parts(game); try { return buck ? buck.def.outputVoltage(buck, 16) : null; } catch { return null; } };
  M = defineMission(game, {
    id: QUEST_ID,
    title: 'Cây nguồn: pin 4S → cầu chì → công tắc → buck 5 V',
    chapter: 'Ngày 1 · 16–18h',
    order: 30,
    requires: ['m2-nap-pic'],
    lessonId: 'buck-xl4015',
    intro: 'Bo PIC phải sống bằng PIN của robot chứ không phải nguồn bàn. Đi cây nguồn đúng docs/01 §2: pin 4S → cầu chì 10 A → công tắc → buck XL4015 — và CHỈNH buck về 5.0 V TRƯỚC khi nối bo PIC (xuất xưởng ≈ 12 V!).',
    kit: [
      { id: 'pack-4s-bms', at: 'bench-assembly', dx: -700, dz: 150 },
      { id: 'xt60-pair', at: 'bench-assembly', dx: -560, dz: 220 },
      { id: 'blade-fuse-10a', at: 'bench-assembly', dx: -480, dz: 150 },
      { id: 'rocker-switch-kcd1', at: 'bench-assembly', dx: -400, dz: 150 },
      { id: 'xl4015-module', at: 'bench-assembly', dx: -300, dz: 150 },
    ],
    kitLabel: 'bàn lắp ráp',
    safety: {},
    xp: 300,
    fastMin: 12,
    realLife: [
      'Đo áp pin trước (12.0–16.8 V). Cầu chì 10 A đặt SÁT cực + pin — đoạn dây trước cầu chì càng ngắn càng tốt.',
      'XL4015/LM2596 mua về thường đặt sẵn ≈ 12 V: cấp vào, ĐO đầu ra bằng đồng hồ, vặn trimmer (ngược chiều kim đồng hồ = giảm) tới 5.0–5.05 V RỒI mới nối tải.',
      'Tắt công tắc trước khi nối/tháo dây; nối xong kiểm tra lại cực tính bằng đồng hồ.',
      'Chung GND hình sao về cực âm pin cho TẤT CẢ khối (PIC, ESP32, driver) — không chung GND thì UART/encoder sai.',
      'Đo 5 V ngay tại chân 11/32 của PIC (docs/03, Ngày 1 13–15h). Logic không lấy 5 V từ driver động cơ.',
    ],
    counters: { firstVout: null, measuredVouts: 0, vinOk: false, loadVout: null },
    steps: [
      {
        id: 'path', text: 'Đi dây: P+ → cầu chì 10 A → công tắc → buck IN+, P− → buck IN− (nối qua XT60, dây 18–20 AWG)',
        hint: () => { const r = powerPath(game); return r.ok ? '' : `Còn thiếu: ${r.missing.join(' · ')}`; },
        check: (g) => powerPath(g).ok,
        where: whereItem(isFuse),
      },
      {
        id: 'battery', text: 'Công tắc còn TẮT: đo áp pin 4S bằng đồng hồ V⎓ (que đen P−, que đỏ P+) — phải 12.0–16.8 V',
        hint: 'Cầm đồng hồ (phím số), vặn thang V⎓, V = kẹp que ĐEN vào cực − (P−) của pin, chuột trái chạm que ĐỎ vào P+.',
        done: (e) => e.type === 'measure' && e.mode === 'vdc' && e.value > 11.5 && e.value < 17.2,
        where: whereItem(isPack),
      },
      {
        id: 'switch-on', text: 'Bật công tắc nguồn (chưa nối bo PIC!) — buck có điện đầu vào',
        hint: 'Nhìn vào công tắc KCD1, chuột trái để gạt sang "I".',
        check: (g) => { const { rk, buck } = parts(g); const el = buckEl(g, buck); return !!rk?.state?.on && (el?.vin ?? 0) > 10; },
        where: whereItem(isRocker),
      },
      {
        id: 'set-5v', text: 'ĐO áp ra buck (OUT+ / OUT−) rồi vặn trimmer bằng tua vít tới 4.95–5.10 V — đo lại để xác nhận',
        hint: () => {
          const v = vout();
          return `Hiện tại buck ra ≈ ${v != null ? v.toFixed(2) : '?'} V. Cầm tua vít, nhìn vít đồng trên trimmer xanh, CUỘN chuột (1 nấc ≈ 0.5 vòng ≈ 0.7 V; ngược chiều kim đồng hồ = giảm). Đo lại bằng đồng hồ.`;
        },
        done: (e, g) => {
          if (e.type !== 'measure' || e.mode !== 'vdc') return false;
          const { buck } = parts(g);
          const pn = probeNets(g);
          if (!buck || pn.red !== pinNet(g, buck, 'OUT+') || pn.black !== pinNet(g, buck, `OUT${MINUS}`)) return false;
          M.T.measuredVouts++;
          if (M.T.firstVout == null) { M.T.firstVout = e.value; if (e.value > 6) g.hud?.toast?.(`Buck đang ra ${e.value.toFixed(2)} V — đúng như cảnh báo: xuất xưởng ≈ 12 V! Vặn trimmer xuống 5.0 V.`, { kind: 'warn', ms: 6000 }); }
          return e.value >= 4.95 && e.value <= 5.1;
        },
        where: whereItem(isBuck),
      },
      {
        id: 'switch-off', text: 'TẮT công tắc trước khi nối bo PIC',
        hint: 'Không bao giờ nối/tháo dây khi mạch đang có điện.',
        check: (g) => { const { rk } = parts(g); return !!rk && !rk.state?.on; },
        where: whereItem(isRocker),
      },
      {
        id: 'connect', text: 'Nối buck OUT+ → VDD bo PIC (cầu đấu +), OUT− → GND bo PIC',
        hint: () => { const r = picOnBuck(game); return r.ok ? '' : `Còn thiếu: ${r.missing.join(' · ')}`; },
        check: (g) => picOnBuck(g).ok,
        where: whereItem(isPic),
      },
      {
        id: 'gnd', text: 'Kiểm tra GND CHUNG: đồng hồ thang thông mạch ·))) giữa cực − pin và GND bo PIC phải kêu (≈ 0 Ω)',
        hint: 'Que ĐEN kẹp P− của pin (V), que ĐỎ chạm chân GND (12/31) / cầu đấu − của bo PIC. Mạch đang TẮT nguồn mới đo Ω.',
        done: (e, g) => {
          if (e.type !== 'measure' || (e.mode !== 'cont' && e.mode !== 'ohm') || !(e.value < 2)) return false;
          const { pack, pic } = parts(g);
          const pn = probeNets(g), gnd = pinNet(g, pack, `P${MINUS}`);
          const pg = [pinNet(g, pic, '12'), pinNet(g, pic, '31')];
          const at = (x, ref) => sameNode(g, x, ref);
          return !!gnd && ((at(pn.black, gnd) && pg.some((x) => at(pn.red, x))) || (at(pn.red, gnd) && pg.some((x) => at(pn.black, x))));
        },
        where: whereItem(isPack),
      },
      {
        id: 'power', text: 'Bật công tắc: PIC nhận 4.75–5.25 V và chạy (LED RD7 nháy)',
        hint: () => { const { pic } = parts(game); return `Trạng thái PIC: ${pic?.state?.mcuStatus || '—'}`; },
        check: (g) => {
          const { rk, pic } = parts(g);
          const el = pic ? g.power?.elementsOf(pic)?.[0] : null;
          return !!rk?.state?.on && !!el && !pic.state.dead && el.vcore > 4.75 && el.vcore < 5.25;
        },
        where: whereItem(isRocker),
      },
      {
        id: 'vdd', text: 'Đo VDD ngay tại chân PIC (11 hoặc 32) so với GND: ≈ 5.0 V có tải',
        hint: 'Que đen ở GND, que đỏ chạm chân 11/32 (hoặc lỗ đế ngay cạnh). Sụt nhiều (< 4.75 V) → dây mảnh/dài hoặc buck yếu.',
        done: (e, g) => {
          if (e.type !== 'measure' || e.mode !== 'vdc' || !(e.value > 4.75 && e.value < 5.25)) return false;
          const { pic } = parts(g);
          const pn = probeNets(g);
          return [pinNet(g, pic, '11'), pinNet(g, pic, '32')].includes(pn.red);
        },
        where: whereItem(isPic),
      },
    ],
    failOn(e, g) {
      if (e.type === 'fault' && isPic(e.item) && ['dead', 'burn', 'explode'].includes(e.kind)) {
        const v = vset();
        if (v != null && v > 5.6) return `Chưa chỉnh buck về 5.0 V: XL4015 đang đặt ${v.toFixed(1)} V (xuất xưởng ≈ 12 V) → PIC nhận VDD > 7.5 V tuyệt đối, mạch bảo vệ dẫn mạnh, chip tự đốt → CHÁY. Ngoài đời: luôn đo & vặn buck TRƯỚC khi nối tải.`;
        return `PIC16F877A cháy — ${e.cause || 'quá áp / ngược cực'}`;
      }
      if (e.type === 'fault' && isBuck(e.item) && e.kind === 'dead') return `Buck XL4015 hỏng — ${e.cause || ''}`;
      return null;
    },
    score(Mi) {
      if (Mi.T.firstVout != null && Mi.T.firstVout > 6) Mi.note(`Đo trước khi nối tải: phát hiện buck ra ${Mi.T.firstVout.toFixed(1)} V ✓`);
      if (Mi.T.measuredVouts >= 2) Mi.note(`Đo lại ${Mi.T.measuredVouts} lần khi vặn trimmer ✓`);
      return 0;
    },
  });
  if (!M) return null;
  // vặn trimmer khi tải (PIC) đã nối mà buck > 5.5 V → nguy hiểm, nhắc
  game.events.on('part:action', (e) => {
    if (!M.active() || e.action !== 'turnTrimmer' || !isBuck(e.item)) return;
    const v = e.result?.vout;
    if (v != null) game.hud?.toast?.(`Trimmer: đặt ≈ ${v.toFixed(2)} V (không tải) — ĐO lại đầu ra để chắc chắn`, { kind: 'info', short: true });
  });
  // nối dây vào bo PIC khi buck còn > 5.5 V → cảnh báo (chưa trừ điểm — hậu quả xảy ra khi bật)
  game.events.on('wire:connected', () => {
    if (!M.active()) return;
    const s = game.quests.progress(QUEST_ID);
    const v = vset();
    if (s && s.step < 4 && v > 5.6 && picOnBuck(game).ok && !M.T.warnedLoad) {
      M.T.warnedLoad = true;
      game.hud?.toast?.(`⚠ Bo PIC đã nối vào buck đang đặt ${v.toFixed(1)} V! Bật công tắc lúc này là CHÁY PIC.`, { kind: 'danger', ms: 6000 });
    }
  });
  void id;
  return M;
}
