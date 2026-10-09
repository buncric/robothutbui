// Kiểm thử CHUỖI NHIỆM VỤ đồ án (không cần trình duyệt):   node tools/game-quests-test.mjs [--verbose]
// Dựng game thật (labRoom + registry), rồi chơi từng nhiệm vụ bằng API của các hệ thống (sockets, netlist, nguồn bàn, đồng hồ,
// PICkit 3, bộ phận con của xác robot, bộ não robot) — KHÔNG tự đánh dấu hoàn thành:
//   0) bảng nhiệm vụ: m2 khoá khi m1 chưa xong · Chế độ tự do mở khoá · gợi ý sau 60 s đứng yên
//   M2 nạp PIC: đầu ICSP ngược → "Invalid Device ID" (trừ điểm) · thiếu trở MCLR → nạp được nhưng LED không nháy · đủ → LED nháy
//   M3 cây nguồn: NỐI PIC TRƯỚC KHI CHỈNH BUCK (12 V) → PIC CHẾT → nhiệm vụ THẤT BẠI; làm lại đúng thứ tự → hoàn thành
//   M4 74HC32 + DRV8871: tiến/lùi đối xứng (bộ giải mạch thật), dòng kẹt
//   M5 mổ xác: tháo vít khi pin còn cắm → trừ 20 · ảnh đầu nối · đo Ω cuộn dây ≈ 7 Ω · đếm xung encoder · phiếu đo
//   M6 lắp robot: 7 ô lắp, JST, pin cuối, khu thử → robot chạy AUTO bằng robot-brain, dừng ở hố, không rơi
//   + lưu / tải tiến độ nhiệm vụ
import { readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { createGame } from '../src/game/main.js';

const VERBOSE = process.argv.includes('--verbose');
const ROOT = fileURLToPath(new URL('../src/game/', import.meta.url));
let fails = 0, passes = 0;
const ok = (cond, msg, detail = '') => { if (cond) { passes++; console.log('  ✓', msg, detail ? `— ${detail}` : ''); } else { fails++; console.log('  ✗', msg, detail ? `— ${detail}` : ''); } return cond; };
const log = (...a) => { if (VERBOSE) console.log('   ·', ...a); };
const f = (v, d = 2) => (typeof v === 'number' ? v.toFixed(d) : String(v));

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
async function loadRegistry() {
  const regPath = join(ROOT, 'items/registry.js');
  if (!existsSync(regPath)) return null;
  const reg = await import(pathToFileURL(regPath).href);
  const record = {};
  for (const sub of ['tools', 'parts']) {
    const dir = join(ROOT, 'items', sub);
    for (const fn of readdirSync(dir)) {
      const p = join(dir, fn);
      if (!fn.endsWith('.js') || statSync(p).isDirectory()) continue;
      try { record[`./${sub}/${fn}`] = await import(pathToFileURL(p).href); } catch (e) { if (!fn.startsWith('_')) { fails++; console.log(`  ✗ không nạp được items/${sub}/${fn}: ${e.message}`); } }
    }
  }
  reg.registerItemModules?.(record);
  return reg;
}

const origErr = console.error;
let consoleErrors = 0;
console.error = (...a) => { consoleErrors++; origErr('  [console.error]', ...a); };

try {
  const reg = await loadRegistry();
  const worldModule = await import(pathToFileURL(join(ROOT, 'world/labRoom.js')).href);
  const R = await import(pathToFileURL(join(ROOT, 'quests/_robot.js')).href);
  const storage = memoryStorage();
  const game = await createGame({ headless: true, storage, worldModule, registryModule: reg });
  game.app.locked = true; game.started = true; game.app.setPaused(false);
  // ======== từ đây trở đi KHÔNG await: hẹn giờ autoStart của quests.js (setTimeout) không chen vào giữa kịch bản
  const step = (n = 1) => { for (let i = 0; i < n; i++) game.app.step(1 / 60); };
  step(10);
  const Q = game.quests, NL = game.netlist, ch = game.lab.psu.channels[0];
  const events = [];
  game.events.on('*', (e) => { if (!e.type.startsWith('input:') && e.type !== 'footstep') events.push(e); });
  const pin = (it, p) => ({ kind: 'pin', uid: it.uid, pin: p });
  let L = 0;
  const linksOf = new Map();
  const link = (a, b) => { const id = `qt${++L}`; NL.link(id, a, b); for (const u of [a.uid, b.uid]) { if (!linksOf.has(u)) linksOf.set(u, []); linksOf.get(u).push(id); } return id; };
  const unlinkItem = (it) => { for (const id of linksOf.get(it.uid) || []) NL.unlink(id); linksOf.delete(it.uid); };
  const spawn = (id, pos) => { const it = game.items.spawn(id, { pos }); if (!it) throw new Error(`không sinh được ${id}`); return it; };
  const find = (id) => game.items.all.find((i) => i.def.id === id && !i.inBag && !i.isHotbarTool) || null;
  const findAll = (id) => game.items.all.filter((i) => i.def.id === id && !i.inBag && !i.isHotbarTool);
  const startQ = (id) => Q.start(id, { force: true });
  const cur = (id) => { const d = Q.defs.get(id), s = Q.progress(id); return s?.done ? 'DONE' : s?.failed ? 'FAILED' : d.steps[s?.step ?? 0]?.id; };
  /** đợi tới khi bước hiện tại khác `sid` (tối đa n khung) */
  const waitPast = (id, sid, n = 240) => { for (let i = 0; i < n; i++) { if (cur(id) !== sid) return true; step(1); } return cur(id) !== sid; };
  const expectStep = (id, sid, act, n = 240, detail = '') => {
    const at = cur(id);
    if (at !== sid) { ok(false, `[${id}] đang ở bước "${sid}"`, `thực tế "${at}"`); return false; }
    act?.();
    const passed = waitPast(id, sid, n);
    let d = typeof detail === 'function' ? detail() : detail;
    if (!passed) { const st = Q.defs.get(id).steps.find((x) => x.id === sid); const h = typeof st?.hint === 'function' ? st.hint(game) : st?.hint; d = `${d} · gợi ý: ${h}`; }
    return ok(passed, `[${id}] xong bước "${sid}"`, d);
  };
  const psuOn = (v, i) => { ch.vset = v; ch.iset = i; game.lab.psu.on = true; ch.out = true; game.events.emit('power:on', { source: 'psu', ch: 1, v, ilim: i }); game.events.emit('psu:changed', { ch: 1, ...ch }); };
  const psuOff = () => { ch.out = false; game.events.emit('power:off', { source: 'psu', ch: 1 }); };
  const meter = game.inventory.slots.find((s) => s?.def.id === 'multimeter');
  const MODE = { off: 0, vdc: 1, vac: 2, ohm: 3, cont: 4, adc: 5 };
  const measure = (mode, redAtt, blackAtt, target) => {
    meter.state.mode = MODE[mode];
    game.measuring.black = blackAtt;
    game.measuring.touchRed(redAtt);
    const v = meter.def.measure(meter, game, { object: target.object, item: target, data: () => undefined });
    game.measuring.touchRed(null);
    return v;
  };
  const toggleSwitch = (rk) => { const r = rk.def.toggle(rk); game.events.emit('switch:changed', { item: rk, on: r.on }); return r.on; };
  const key = (code, down = true) => game.events.emit('input:key', { code, key: code, down, repeat: false });
  const removeAll = (re) => { for (const it of [...game.items.all]) if (re.test(it.def.id) && !it.isHotbarTool) game.items.remove(it); };
  const mistakesOf = (id) => game.missions[id]?.mistakes || [];

  /** Bo PIC tối thiểu (như M1): PIC trong đế DIP-40 + thạch anh 20 MHz + 10 kΩ MCLR + LED/330 Ω trên RD7 — nối bằng liên kết netlist */
  const board = { xtal: null, r10: null, led: null, r330: null, ds: null };
  function wireBoard(pic, { mclr = true } = {}) {
    const b = board;
    b.xtal ||= spawn('crystal-20mhz-hc49s', [-650, 900, -3400]);
    b.led ||= spawn('led-5mm-red', [-600, 900, -3400]);
    b.r330 ||= spawn('resistor-330', [-550, 900, -3400]);
    link(pin(pic, '11'), pin(pic, '32')); link(pin(pic, '12'), pin(pic, '31'));
    link(pin(b.xtal, '1'), pin(pic, '13')); link(pin(b.xtal, '2'), pin(pic, '14'));
    link(pin(b.r330, '1'), pin(pic, '30')); link(pin(b.r330, '2'), pin(b.led, 'A')); link(pin(b.led, 'K'), pin(pic, '12'));
    if (mclr) addMclr(pic);
  }
  function addMclr(pic) {
    board.r10 ||= spawn('resistor-10k', [-500, 900, -3400]);
    link(pin(board.r10, '1'), pin(pic, '1')); link(pin(board.r10, '2'), pin(pic, '11'));
  }
  function seatPic(pic) {
    const ds = board.ds;
    const s = ds.sockets.find((x) => x.kind === 'dip40');
    const r = game.sockets.insert(pic, s, {});
    step(20);
    return !!r && pic.socket === s.id;
  }

  console.log('\n▶ 0) Bảng nhiệm vụ & khoá tiên quyết');
  const IDS = ['m2-nap-pic', 'm3-nguon-5v', 'm4-dong-co', 'm5-mo-xac', 'm6-lap-robot'];
  ok(IDS.every((id) => Q.defs.has(id)), `đăng ký đủ ${IDS.join(', ')}`);
  ok(Q.defs.get('m2-nap-pic').requires.includes('m1-han-pic') && Q.defs.get('m6-lap-robot').requires.includes('m5-mo-xac'), 'chuỗi tiên quyết m1 → m2 → … → m6');
  ok(Q.status('m2-nap-pic') === 'locked' && Q.status('m6-lap-robot') === 'locked', `m2/m6 khoá khi m1 chưa xong (${Q.status('m2-nap-pic')})`);
  ok(Q.start('m2-nap-pic') === false && Q.activeId !== 'm2-nap-pic', 'quests.start(m2) bị từ chối khi còn khoá');
  ok(Q.status('m1-han-pic') !== 'locked', `m1 KHÔNG bị khoá cứng (tương thích test hàn) — ${Q.status('m1-han-pic')}`);
  Q.setFreeMode(true);
  ok(Q.status('m4-dong-co') === 'available', 'Chế độ tự do → mở khoá m4');
  Q.setFreeMode(false);
  const board0 = Q.list().filter((x) => x.mission);
  ok(board0.length === 5 && board0.every((x) => x.chapter && x.lessonId && x.status), 'Q.list(): nhiệm vụ có chương (Ngày…), bài học, trạng thái', board0.map((x) => `${x.id}:${x.status}`).join(' '));
  ok(typeof game.hud.questSummary === 'function' && typeof game.hud.addMenuTab === 'function', 'HUD có thẻ tổng kết + tab menu');

  // =====================================================================================================================
  console.log('\n▶ M2) Nạp chương trình PIC');
  removeAll(/^pic16f877a$|^dip40-socket$/);
  ch.vset = 12; ch.iset = 1; game.events.emit('psu:changed', { ch: 1, ...ch });     // nhiệm vụ trước để nguồn ở 12 V / 1 A
  ok(startQ('m2-nap-pic') && Q.activeId === 'm2-nap-pic', 'bắt đầu M2 (force)');
  const pk = find('pickit3');
  ok(!!pk && pk.state.hex === 'main.hex', `PICkit 3 có trong phòng, hex = ${pk?.state.hex}`);
  board.ds = find('dip40-socket');
  let pic = find('pic16f877a');
  ok(!!board.ds && !!pic, 'bộ linh kiện M2 được bày (đế DIP-40 + PIC)');
  expectStep('m2-nap-pic', 'board', () => { seatPic(pic); wireBoard(pic, { mclr: false }); });
  // gợi ý khi đứng yên 60 s
  const hints0 = events.filter((e) => e.type === 'quest:hint').length;
  Q.update(61);
  ok(events.filter((e) => e.type === 'quest:hint').length === hints0 + 1, 'đứng yên 60 s → nhắc gợi ý (quest:hint)');
  expectStep('m2-nap-pic', 'psu-set', () => { ch.vset = 5; ch.iset = 0.1; game.events.emit('psu:changed', { ch: 1, ...ch }); });
  expectStep('m2-nap-pic', 'leads', () => { game.power.clipLead('red', pin(pic, '11')); game.power.clipLead('black', pin(pic, '12')); });
  expectStep('m2-nap-pic', 'power', () => psuOn(5, 0.1), 120, () => `I = ${f(ch.i * 1000, 1)} mA`);
  const flash = () => { pk.def.tool.onUseStart({ game, instance: pk, target: pic }); step(60 * 4); return pk.state.result; };
  pk.state.icspFlip = true;
  let r = flash();
  ok(r && r.ok === false && /Invalid Device ID/.test(r.reason), 'đầu ICSP NGƯỢC → "Invalid Device ID"', r?.reason || JSON.stringify({ r, busy: pk.state.busy, t: pk.state.t, held: pk.heldBy, live: !!pk.object.parent, tool: pk.isHotbarTool }));
  ok(cur('m2-nap-pic') === 'flash', 'nạp lỗi → vẫn ở bước nạp');
  pk.state.icspFlip = false;
  r = flash();
  ok(r?.ok === true && cur('m2-nap-pic') === 'blink', 'xoay đúng ▶ = chân 1 → nạp xong (Programming/Verify complete)');
  ok(mistakesOf('m2-nap-pic').some((m) => /MCLR/.test(m.text)), 'thiếu trở 10 kΩ MCLR → cảnh báo + trừ điểm');
  step(60 * 3);
  ok(cur('m2-nap-pic') === 'blink' && /MCLR/.test(pic.state.mcuStatus || ''), 'không có trở kéo MCLR → chip reset liên tục, LED KHÔNG nháy', pic.state.mcuStatus);
  expectStep('m2-nap-pic', 'blink', () => addMclr(pic), 60 * 5, () => `LED sáng ${game.missions['m2-nap-pic'].T.lit} lần · ${pic.state.mcuStatus}`);
  expectStep('m2-nap-pic', 'off', () => psuOff(), 30);
  let pr = Q.progress('m2-nap-pic');
  ok(pr?.done && pr.score >= 80 && pr.score < 100, `M2 hoàn thành, điểm ${pr?.score} (trừ: ICSP ngược + thiếu MCLR)`);
  ok(pr?.summary?.lessonId === 'mach-nap-pickit' && pr.summary.mistakes.length === 2 && pr.summary.realLife.length >= 3, 'thẻ tổng kết: lỗi, việc ngoài đời, link bài học', pr?.summary?.mistakes.join(' | '));
  ok(Q.status('m3-nguon-5v') === 'available', 'M2 xong → M3 mở khoá (m3 chỉ cần m2)');

  // =====================================================================================================================
  console.log('\n▶ M3) Cây nguồn 5 V — đường THẤT BẠI: nối PIC trước khi chỉnh buck');
  game.power.unclipLead('red'); game.power.unclipLead('black');
  ok(startQ('m3-nguon-5v'), 'bắt đầu M3');
  const pack = find('pack-4s-bms'), fuse = find('blade-fuse-10a'), rk = find('rocker-switch-kcd1'), buck = find('xl4015-module');
  ok(!!(pack && fuse && rk && buck && find('xt60-pair')), 'bộ linh kiện M3: pin 4S, XT60, cầu chì, công tắc, XL4015');
  expectStep('m3-nguon-5v', 'path', () => {
    link(pin(pack, 'P+'), pin(fuse, '1')); link(pin(fuse, '2'), pin(rk, '1')); link(pin(rk, '2'), pin(buck, 'IN+')); link(pin(pack, 'P−'), pin(buck, 'IN−'));
  });
  expectStep('m3-nguon-5v', 'battery', () => { const v = measure('vdc', pin(pack, 'P+'), pin(pack, 'P−'), pack); log('pin', v); }, 30);
  // SAI: nối bo PIC vào buck ngay (buck đang ≈ 12 V xuất xưởng), rồi bật công tắc
  ok(buck.def.outputVoltage(buck, 16) > 11, `buck mới đặt ${f(buck.def.outputVoltage(buck, 16))} V (xuất xưởng)`);
  link(pin(buck, 'OUT+'), pin(pic, '11')); link(pin(buck, 'OUT−'), pin(pic, '12'));
  toggleSwitch(rk);
  for (let i = 0; i < 240 && !pic.state.dead; i++) step(1);
  step(5);
  pr = Q.progress('m3-nguon-5v');
  ok(pic.state.dead, 'PIC nhận 12 V → CHẾT (bộ giải mạch)', pic.state.damage?.cause);
  ok(pr?.failed && Q.status('m3-nguon-5v') === 'failed' && Q.activeId == null, 'nhiệm vụ M3 THẤT BẠI');
  ok(/buck|12|5\.0 V/i.test(pr?.failReason || ''), 'lý do thất bại giải thích buck chưa chỉnh', pr?.failReason);
  ok(pr?.summary?.failed === true && pr.summary.score === 0, 'thẻ tổng kết thất bại (0 điểm)');
  ok(events.some((e) => e.type === 'quest:failed' && e.quest.id === 'm3-nguon-5v'), "phát 'quest:failed'");
  const ser = Q.serialize();
  ok(ser.quests['m3-nguon-5v']?.failed === true && ser.quests['m2-nap-pic']?.done === true, 'serialize giữ trạng thái thất bại / hoàn thành');

  console.log('\n▶ M3) Cây nguồn 5 V — làm lại đúng thứ tự');
  toggleSwitch(rk); step(5);
  unlinkItem(pic); game.items.remove(pic);
  pic = spawn('pic16f877a', [-500, 900, -3350]);
  ok(seatPic(pic), 'thay PIC mới vào đế');
  wireBoard(pic, { mclr: true });
  ok(startQ('m3-nguon-5v') && cur('m3-nguon-5v') !== 'FAILED', 'làm lại M3');
  waitPast('m3-nguon-5v', 'path', 30);
  expectStep('m3-nguon-5v', 'battery', () => measure('vdc', pin(pack, 'P+'), pin(pack, 'P−'), pack), 30);
  expectStep('m3-nguon-5v', 'switch-on', () => toggleSwitch(rk), 60);
  let v = measure('vdc', pin(buck, 'OUT+'), pin(buck, 'OUT−'), buck);
  ok(v > 11 && cur('m3-nguon-5v') === 'set-5v', `đo buck lần 1: ${f(v)} V — chưa đạt`);
  expectStep('m3-nguon-5v', 'set-5v', () => {
    const t = buck.def.turnTrimmer(buck, -5.03);
    game.events.emit('part:action', { item: buck, action: 'turnTrimmer', result: t });
    step(60 * 6);              // không tải: tụ ra 220 µF chỉ xả qua cầu phân áp hồi tiếp (τ ≈ 2 s) — buck không hút dòng được
    v = measure('vdc', pin(buck, 'OUT+'), pin(buck, 'OUT−'), buck);
  }, 30, () => `đo lại: ${f(v)} V`);
  expectStep('m3-nguon-5v', 'switch-off', () => toggleSwitch(rk), 30);
  expectStep('m3-nguon-5v', 'connect', () => { link(pin(buck, 'OUT+'), pin(pic, '11')); link(pin(buck, 'OUT−'), pin(pic, '12')); }, 30);
  expectStep('m3-nguon-5v', 'gnd', () => { v = measure('cont', pin(pic, '12'), pin(pack, 'P−'), pic); }, 30, () => `thông mạch ${f(v, 3)} Ω`);
  expectStep('m3-nguon-5v', 'power', () => toggleSwitch(rk), 120, () => `PIC: ${pic.state.mcuStatus}`);
  expectStep('m3-nguon-5v', 'vdd', () => { v = measure('vdc', pin(pic, '11'), pin(pic, '12'), pic); }, 30, () => `VDD = ${f(v)} V`);
  pr = Q.progress('m3-nguon-5v');
  ok(pr?.done && !pr.failed && pr.score >= 90, `M3 hoàn thành (lần 2), điểm ${pr?.score}`, (pr?.notes || []).join(' | '));
  ok(!pic.state.dead && pic.state.running, 'PIC sống, chạy bằng nguồn pin qua buck 5 V');

  // =====================================================================================================================
  console.log('\n▶ M4) 74HC32 + DRV8871 + động cơ');
  toggleSwitch(rk); step(5);                       // tắt nguồn trước khi đi dây
  ok(startQ('m4-dong-co'), 'bắt đầu M4');
  const bb = find('breadboard-830'), hc = find('sn74hc32n'), drv = find('drv8871-module'), mot = find('dc-motor-rs360'), cap = find('cap-elec-1000uf-25v');
  ok(!!(bb && hc && drv && mot && cap), 'bộ linh kiện M4: breadboard, 74HC32, DRV8871, RS-360, tụ 1000 µF');
  expectStep('m4-dong-co', 'place', () => { const s = game.sockets.get(`${bb.uid}:bb-span:20`); game.sockets.insert(hc, s, {}); step(20); }, 60, () => `74HC32 → ${hc.socket}`);
  expectStep('m4-dong-co', 'hc-power', () => { link(pin(hc, '14'), pin(pic, '11')); link(pin(hc, '7'), pin(pic, '12')); }, 30);
  // nối nhầm kinh điển trước: 1B (chân 2) vào RD0 → bị phát hiện
  const wrongId = link(pin(hc, '2'), pin(pic, '19'));
  step(20);
  ok(mistakesOf('m4-dong-co').some((m) => /RD1|nDIR/.test(m.text)), 'nối 1B vào RD0 (DIR) → phát hiện SAI (phải là nDIR/RD1)');
  NL.unlink(wrongId);
  expectStep('m4-dong-co', 'hc-left', () => {
    link(pin(hc, '1'), pin(pic, '17')); link(pin(hc, '4'), pin(pic, '17')); link(pin(hc, '2'), pin(pic, '20')); link(pin(hc, '5'), pin(pic, '19'));
    link(pin(hc, '3'), pin(drv, 'IN1')); link(pin(hc, '6'), pin(drv, 'IN2'));
  }, 30);
  expectStep('m4-dong-co', 'drv-power', () => {
    link(pin(drv, 'GND'), pin(pack, 'P−')); link(pin(drv, 'VM'), pin(rk, '2'));
    link(pin(cap, '+'), pin(drv, 'VM')); link(pin(cap, '−'), pin(drv, 'GND'));
  }, 30);
  expectStep('m4-dong-co', 'motor', () => { link(pin(mot, '+'), pin(drv, 'T-OUT1')); link(pin(mot, '−'), pin(drv, 'T-OUT2')); }, 30);
  expectStep('m4-dong-co', 'power', () => toggleSwitch(rk), 120, () => `DRV: ${game.power.elementsOf(drv)[0]?.dir}`);
  const M4 = game.missions['m4-dong-co'];
  expectStep('m4-dong-co', 'fwd', () => key('KeyK'), 120, () => `tiến ${f(M4.T.fwdRpm, 0)} v/ph`);
  expectStep('m4-dong-co', 'rev', () => key('KeyK'), 120, () => `lùi ${f(M4.T.revRpm, 0)} v/ph`);
  const hcEl = game.power.elementsOf(hc)[0];
  ok(!!hcEl && hcEl.out?.[0] === 0 && hcEl.out?.[1] === 1, '74HC32 là phần tử thật trong bộ giải: lùi → 1Y = 0, 2Y = 1', JSON.stringify(hcEl?.out));
  ok(Math.abs(M4.T.fwdRpm - M4.T.revRpm) / M4.T.fwdRpm < 0.15, 'tiến / lùi ĐỐI XỨNG (±15 %)');
  expectStep('m4-dong-co', 'stall', () => { key('KeyH', true); step(60); key('KeyH', false); }, 30, () => `dòng kẹt ${f(M4.T.stallPeak)} A`);
  expectStep('m4-dong-co', 'off', () => { key('KeyK'); step(10); toggleSwitch(rk); }, 60);
  pr = Q.progress('m4-dong-co');
  ok(pr?.done && pr.score >= 85 && pr.score < 100, `M4 hoàn thành, điểm ${pr?.score} (trừ nối nhầm 1B)`, (pr?.notes || []).join(' | '));
  ok(M4.T.stallPeak > 1 && M4.T.stallPeak < 3, `dòng kẹt hợp lý ${f(M4.T.stallPeak)} A (DRV8871 băm ~2.1 A)`);

  // =====================================================================================================================
  console.log('\n▶ M5) Mổ xác robot');
  ok(startQ('m5-mo-xac'), 'bắt đầu M5');
  const robot = find(R.ROBOT_ID);
  ok(!!robot && robot.subparts.length >= 30, `xác robot được bày lên bàn lắp ráp (${robot?.subparts.length} bộ phận con)`);
  const S = (n) => R.subpart(game, robot, n);
  const tog = (n) => game.subparts.toggle(S(n));
  const ph1 = game.inventory.slots.findIndex((s) => s?.def.id === 'screwdriver-ph1');
  game.inventory.select(ph1);
  const unscrew = (n) => { const s = S(n); s._dir = 1; let k = 0; while (!game.subparts._driveScrew(s, 0.1) && k++ < 200); return s.state.removed; };
  expectStep('m5-mo-xac', 'bin', () => { tog('lid_top'); tog('bin'); }, 30);
  expectStep('m5-mo-xac', 'flip', () => R.flipRobot(game, robot), 30);
  // SAI: tháo vít chổi cạnh khi pin còn cắm
  ok(unscrew('screw_side'), 'tháo vít chổi cạnh (khi pin CHƯA rút)');
  ok(mistakesOf('m5-mo-xac').some((m) => m.pts === 20 && /pin/.test(m.text)), 'tháo vít khi pin còn cắm → trừ 20 điểm');
  expectStep('m5-mo-xac', 'bat-lid', () => { unscrew('screw_bat_1'); unscrew('screw_bat_2'); tog('lid_battery'); }, 30);
  expectStep('m5-mo-xac', 'bat-unplug', () => { R.takePhoto(game, robot, S('conn_main')); tog('conn_main'); }, 30);
  expectStep('m5-mo-xac', 'brushes', () => { tog('lid_brush'); tog('brush_main_grip'); }, 30);
  expectStep('m5-mo-xac', 'hidden', () => {
    for (let i = 1; i <= 4; i++) { tog(`sticker_${i}`); unscrew(`screw_hidden_${i}`); unscrew(`screw_top_${i}`); }
  }, 30);
  ok(game.items.all.filter((i) => i.def.generated && /^loose:robot/.test(i.def.id)).length >= 11, 'vít tháo ra rơi thành vật rời (nhặt được)');
  expectStep('m5-mo-xac', 'cover', () => { R.flipRobot(game, robot); tog('cover_top'); }, 30);
  expectStep('m5-mo-xac', 'photos', () => { for (const n of ['conn_wheel_l', 'conn_wheel_r', 'conn_lidar', 'conn_cliff']) R.takePhoto(game, robot, S(n)); }, 30);
  expectStep('m5-mo-xac', 'unplug-wheels', () => { tog('conn_wheel_l'); tog('conn_wheel_r'); }, 30);
  let rL = 0, rR = 0;
  expectStep('m5-mo-xac', 'measure-r', () => {
    rL = measure('ohm', pin(robot, 'WL-M+'), pin(robot, 'WL-M−'), robot);
    rR = measure('ohm', pin(robot, 'WR-M+'), pin(robot, 'WR-M−'), robot);
  }, 30, () => `R trái ${f(rL)} Ω, phải ${f(rR)} Ω (đồng hồ thật)`);
  ok(rL > 5 && rL < 10 && rR > 5 && rR < 10, 'điện trở cuộn dây ≈ 7 Ω');
  const M5 = game.missions['m5-mo-xac'];
  const wl = S('wheel_l_spin');
  expectStep('m5-mo-xac', 'encoder', () => { for (let i = 0; i < 400 && M5.T.revAcc < 10; i++) { wl.state.omega = 30; step(1); } }, 30, () => `${f(M5.T.revAcc, 1)} vòng = ${M5.T.pulses} xung`);
  const bad = M5.submitSheet({ vbat: 12, rL: 70, rR: 7, pulses10: 1000, ticks: 100, wheelD: 70, wheelBase: 235, bumpers: 2, cliffs: 4 });
  ok(!bad.ok && bad.errors.length >= 3 && cur('m5-mo-xac') === 'sheet', 'phiếu đo SAI bị từ chối', bad.errors.slice(0, 3).join(' | '));
  expectStep('m5-mo-xac', 'sheet', () => {
    const r2 = M5.submitSheet({ vbat: 14.4, rL: +rL.toFixed(1), rR: +rR.toFixed(1), pulses10: M5.T.pulses, ticks: Math.round(M5.T.pulses / 10), wheelD: 70, wheelBase: 235, bumpers: 2, cliffs: 4 });
    log('phiếu', r2);
  }, 30);
  pr = Q.progress('m5-mo-xac');
  ok(pr?.done && pr.score <= 85 && pr.score >= 60, `M5 hoàn thành, điểm ${pr?.score} (trừ 20 vì tháo vít trước khi rút pin, 2 vì phiếu sai)`, (pr?.notes || []).join(' | '));

  // =====================================================================================================================
  console.log('\n▶ M6) Lắp mạch vào robot & chạy thử');
  ok(startQ('m6-lap-robot'), 'bắt đầu M6');
  waitPast('m6-lap-robot', 'robot', 30);
  ok(cur('m6-lap-robot') === 'mount', 'robot đã mổ (nắp mở, pin rút) → sang bước lắp mạch');
  const mod = {
    pic: spawn('pic16f877a', [-2400, 900, -1300]), esp32: spawn('esp32-s3-devkitc-1', [-2350, 900, -1300]),
    'drv-trai': spawn('drv8871-module', [-2300, 900, -1300]), 'drv-phai': spawn('drv8871-module', [-2250, 900, -1300]),
    hc32: spawn('sn74hc32n', [-2200, 900, -1300]), buck: spawn('xl4015-module', [-2150, 900, -1300]), bss138: spawn('bss138-4ch-module', [-2100, 900, -1300]),
  };
  mod.buck.def.turnTrimmer(mod.buck, -5.03);          // buck đã chỉnh 5.0 V (bài học M3)
  const sockOf = (id) => game.sockets.get(`${robot.uid}:slot-${id}`);
  const wrong = game.sockets.check?.(sockOf('pic'), mod.esp32, {});
  ok(!wrong || wrong.ok === false, 'ô PIC không nhận ESP32', wrong?.reason);
  expectStep('m6-lap-robot', 'mount', () => { for (const [id, it] of Object.entries(mod)) { game.sockets.insert(it, sockOf(id), {}); step(2); } step(30); }, 60,
    () => Object.entries(mod).map(([id, it]) => `${id}:${it.socket ? '✓' : '✗'}`).join(' '));
  expectStep('m6-lap-robot', 'jst', () => { tog('conn_wheel_l'); tog('conn_wheel_r'); }, 30);
  expectStep('m6-lap-robot', 'battery', () => tog('conn_main'), 30);
  ok(!mistakesOf('m6-lap-robot').some((m) => /pin/.test(m.text)), 'pin cắm SAU CÙNG → không bị trừ');
  expectStep('m6-lap-robot', 'close', () => tog('cover_top'), 30);
  const start = game.world.anchors['robot-start'].getWorldPosition(new THREE.Vector3());
  expectStep('m6-lap-robot', 'floor', () => {
    robot.object.position.set(start.x, 0, start.z); robot.object.rotation.set(0, 0, 0); robot.object.updateMatrixWorld(true);
    game.events.emit('item:placed', { item: robot });
  }, 30, `vòng xuất phát (${start.x.toFixed(0)}, ${start.z.toFixed(0)}), mặt trước hướng về hố`);
  const M6 = game.missions['m6-lap-robot'];
  game.subparts.press(S('btn_power'));
  const run = M6.getRun();
  ok(!!run?.running, 'bấm nút nguồn → robot lên nguồn, AUTO');
  const p0 = robot.object.position.clone();
  for (let i = 0; i < 60 * 45 && !Q.progress('m6-lap-robot')?.done && !Q.progress('m6-lap-robot')?.failed; i++) step(1);
  const st = run.stats;
  ok(robot.object.position.distanceTo(p0) > 300 && st.dist > 1500, `robot tự đi (${f(st.dist / 1000)} m bằng động học vi sai)`);
  ok(st.cliffs >= 1 && !st.fell, `gặp hố → cảm biến chống rơi dừng & quay (${st.cliffs} lần), KHÔNG rơi — cách mép gần nhất ${f(st.minPitGap, 0)} mm`, st.events.slice(0, 6).map((e) => `${e.t}s ${e.ev}`).join(', '));
  pr = Q.progress('m6-lap-robot');
  ok(pr?.done && !pr.failed && pr.score >= 90, `M6 hoàn thành sau ${f(st.t, 0)} s chạy, điểm ${pr?.score}`, (pr?.notes || []).join(' | '));

  // =====================================================================================================================
  console.log('\n▶ Lưu / tải tiến độ');
  const after = Q.list().filter((x) => x.mission);
  ok(after.every((x) => x.status === 'done' && x.best != null), 'bảng nhiệm vụ: M2–M6 đều "Hoàn thành" + điểm cao nhất', after.map((x) => `${x.id}:${x.score}`).join(' '));
  ok(game.save.save('manual'), 'lưu game');
  const data = game.save.load();
  ok(data?.quests?.quests?.['m6-lap-robot']?.done && data.quests.quests['m3-nguon-5v'].best != null && !!data.quests.quests['m5-mo-xac'].summary, 'bản lưu có tiến độ + điểm + thẻ tổng kết');
  Q.state.clear(); Q.activeId = null;
  ok(Q.status('m6-lap-robot') === 'locked', 'xoá tiến độ → m6 khoá lại');
  game.save.apply(data);
  ok(Q.status('m6-lap-robot') === 'done' && Q.progress('m5-mo-xac')?.summary?.lessonId === 'vo-khung', 'tải lại → tiến độ & tổng kết được khôi phục');
  ok(!!data.extra?.['mission:m5-mo-xac']?.sheet, 'số đo phiếu M5 được lưu');
} catch (e) {
  fails++;
  console.log('✗ NGOẠI LỆ:', e.stack);
}
console.error = origErr;
if (consoleErrors) { console.log(`  ✗ có ${consoleErrors} console.error`); fails++; }
console.log(`\n${passes} đạt, ${fails} lỗi`);
process.exit(fails ? 1 : 0);
