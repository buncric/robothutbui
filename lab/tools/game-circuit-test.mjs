// Kiểm thử MẠCH ĐIỆN trong game (không cần trình duyệt):   node tools/game-circuit-test.mjs [--verbose]
// Dựng game thật (labRoom + registry như tools/game-smoke.mjs lượt B), rồi:
//   1) breadboard + LED đỏ + 330 Ω + 2 dây Dupont + kẹp nguồn bàn CH1 5 V / 50 mA → LED sáng, I ≈ (5 − 2)/330 ≈ 9 mA
//   2) đồng hồ vạn năng: V⎓ 2 thanh nguồn = 5.0 V, V⎓ trên LED ≈ 2 V; thông mạch qua 1 dây Dupont → tít (< 50 Ω)
//   3) rút điện trở, nối thẳng LED: giới hạn 50 mA → nguồn chuyển CC, LED sống; giới hạn 3 A → LED cháy (state.dead + hiệu ứng)
//   4) PIC16F877A cắm NGƯỢC trong đế DIP-40 trên breadboard + cấp nguồn → PIC hỏng
//   5) minigame đi dây: cắm 2 đầu bằng tia nhìn (peek/placeFromTarget), rút dây, cắt dây từ cuộn, tuốt, cầu đấu vít phải SIẾT mới dẫn
//   6) lưu / tải giữ dây đã đi
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
const f = (v, d = 3) => (typeof v === 'number' ? v.toFixed(d) : String(v));

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
const step = (game, n = 1) => { for (let i = 0; i < n; i++) game.app.step(1 / 60); };

const origErr = console.error;
let consoleErrors = 0;
console.error = (...a) => { consoleErrors++; origErr('  [console.error]', ...a); };

try {
  const reg = await loadRegistry();
  const worldModule = await import(pathToFileURL(join(ROOT, 'world/labRoom.js')).href);
  const game = await createGame({ headless: true, storage: memoryStorage(), worldModule, registryModule: reg });
  game.app.locked = true; game.started = true; game.app.setPaused(false);
  step(game, 10);
  console.log('\n▶ Khởi tạo');
  ok(!!(game.netlist && game.wiring && game.power && game.circuit && game.measuring), 'có game.netlist / wiring / power / circuit / measuring');
  ok(Array.isArray(game.tickers) && game.tickers.length >= 3, `game.tickers (${game.tickers?.length})`);
  ok(!!game.quests.defs.get('m0-led'), 'nhiệm vụ m0-led đã đăng ký');
  const psu = game.lab?.psu, ch = psu?.channels?.[0];
  ok(!!ch, 'nguồn bàn CH1 có trong phòng lab');

  // ---------------------------------------------------------------- tiện ích
  const events = [];
  game.events.on('*', (e) => { if (!e.type.startsWith('input:') && e.type !== 'footstep') events.push(e); });
  let fxCalls = 0;
  for (const k of ['sparks', 'smoke', 'fire', 'flash', 'pop', 'scorch']) { const o = game.fx[k].bind(game.fx); game.fx[k] = (...a) => { fxCalls++; try { return o(...a); } catch { return null; } }; }
  const spawn = (id, pos) => { const it = game.items.spawn(id, { pos }); if (!it) throw new Error(`không sinh được ${id}`); return it; };
  const sock = (owner, id) => game.sockets.get(`${owner.uid}:${id}`);
  const insert = (it, s, opts = {}) => { const r = game.sockets.insert(it, s, opts); step(game, 30); return r && it.socket === s.id; };
  const bbAtt = (b, hole) => ({ kind: 'bb', uid: b.uid, hole });
  const powerOn = (v, i) => { ch.vset = v; ch.iset = i; psu.on = true; ch.out = true; game.events.emit('power:on', { source: 'psu', ch: 1, v, ilim: i }); game.events.emit('psu:changed', { ch: 1, ...ch }); };
  const powerOff = () => { ch.out = false; game.events.emit('power:off', { source: 'psu', ch: 1 }); };
  const ledEl = (led) => game.power.elementsOf(led)[0];
  const meter = game.inventory.slots.find((s) => s?.def.id === 'multimeter') || spawn('multimeter', [0, 2000, 0]);
  const T = (it) => ({ object: it.object, item: it, data: () => undefined });
  const measure = (mode, redAtt, blackAtt, target) => {
    meter.state.mode = { off: 0, vdc: 1, vac: 2, ohm: 3, cont: 4, adc: 5 }[mode];
    game.measuring.black = blackAtt;
    game.measuring.touchRed(redAtt);
    const v = meter.def.measure(meter, game, T(target));
    game.measuring.touchRed(null);
    return v;
  };

  // ================================================================ 1) LED + 330 Ω
  console.log('\n▶ 1) LED đỏ + 330 Ω trên breadboard, nguồn bàn 5 V / 50 mA');
  const bb = spawn('breadboard-830', [2600, 1100, 2600]);
  const led = spawn('led-5mm-red', [2600, 1300, 2600]);
  ok(insert(led, sock(bb, 'a10')), 'cắm LED (catốt a10, anốt a11)');
  const res = spawn('resistor-330', [2650, 1300, 2600]);
  ok(res.def.bendLeads(res, 4)?.ok !== false, 'bẻ chân điện trở 4 bước (10.16 mm)');
  ok(insert(res, sock(bb, 'b11')), 'cắm điện trở b11 → b15');
  const j1 = spawn('jumper-wire-mm', [2600, 1300, 2700]);
  const j2 = spawn('jumper-wire-mm', [2600, 1300, 2750]);
  ok(game.wiring.connect(j1, bbAtt(bb, 'c15'), bbAtt(bb, 'W5')), 'dây Dupont 1: c15 → thanh + (W5)');
  ok(game.wiring.connect(j2, bbAtt(bb, 'c10'), bbAtt(bb, 'X5')), 'dây Dupont 2: c10 → thanh − (X5)');
  ok(j1.state.cable.laid && game.wiring.groups.has(j1.uid), 'dây nằm võng giữa 2 điểm (có hình cáp)');
  const NL = game.netlist;
  ok(NL.netOfPin(led, 'A') === NL.netOfPin(res, '1'), 'netlist: anốt LED cùng mạng chân 1 điện trở');
  ok(NL.netOfPin(res, '2') === NL.netOf(bbAtt(bb, 'W30')), 'netlist: chân 2 điện trở ↔ thanh + qua dây');
  ok(NL.netOfPin(led, 'K') !== NL.netOfPin(led, 'A'), 'netlist: 2 chân LED khác mạng');
  ok(NL.nets().length > 3, `netlist.nets(): ${NL.nets().length} mạng`);
  game.power.clipLead('red', bbAtt(bb, 'W20'));
  game.power.clipLead('black', bbAtt(bb, 'X20'));
  ok(!!game.power.leads.red && !!game.power.leads.black, 'kẹp cá sấu đỏ → W20, đen → X20');
  powerOn(5.0, 0.05);
  step(game, 120);
  let el = ledEl(led);
  ok(!!el, 'LED có phần tử trong bộ giải');
  ok(el && el.I > 0.0085 && el.I < 0.0100, 'dòng LED ≈ (5 − 2)/330 ≈ 9 mA', `I = ${f(el?.I * 1000, 2)} mA, Vf = ${f(el?.V, 2)} V`);
  ok((led.state.lit ?? 0) > 0.3 && !led.state.dead, `LED sáng (độ sáng ${f(led.state.lit, 2)})`);
  ok(events.some((e) => e.type === 'led:lit' && e.item === led), "phát 'led:lit'");
  step(game, 5);
  ok(ch.mode === 'CV' && Math.abs(ch.i - 0.009) < 0.0015, `màn nguồn bàn: CV, ${f(ch.v, 2)} V / ${f(ch.i * 1000, 1)} mA`);
  log(`bộ giải: ${game.power.stats.nodes} nút, ${game.power.stats.steps} bước/tick, ${f(game.power.stats.ms, 2)} ms`);

  // ================================================================ 2) đồng hồ vạn năng
  console.log('\n▶ 2) Đồng hồ vạn năng');
  let v = measure('vdc', bbAtt(bb, 'W40'), bbAtt(bb, 'X40'), bb);
  ok(Math.abs(v - 5) < 0.05, 'V⎓ giữa 2 thanh nguồn = 5.0 V', `${f(v)} V · LCD "${meter.state.display} ${meter.state.unitText}"`);
  v = measure('vdc', bbAtt(bb, 'e11'), bbAtt(bb, 'e10'), bb);
  ok(v > 1.7 && v < 2.3, 'V⎓ trên LED ≈ 2 V', `${f(v)} V`);
  ok(events.some((e) => e.type === 'measure' && e.mode === 'vdc'), "phát 'measure'");
  v = measure('vdc', bbAtt(bb, 'e11'), null, bb);
  ok(v === null && meter.state.display === '----', 'chưa kẹp que đen → "----"');
  powerOff();
  step(game, 10);
  ok(!(led.state.lit > 0.05), 'tắt OUTPUT → LED tắt');
  v = measure('cont', { kind: 'pin', uid: j1.uid, pin: 'A' }, { kind: 'pin', uid: j1.uid, pin: 'B' }, j1);
  ok(v < 50 && meter.state.beeping, 'thông mạch qua dây Dupont → tít', `${f(v, 3)} Ω`);
  v = measure('ohm', bbAtt(bb, 'e15'), bbAtt(bb, 'e11'), bb);
  ok(Math.abs(v - 330) < 5, 'Ω giữa 2 chân điện trở ≈ 330 Ω', `${f(v, 1)} Ω`);
  v = measure('cont', bbAtt(bb, 'e40'), bbAtt(bb, 'e45'), bb);
  ok(!Number.isFinite(v) && !meter.state.beeping, 'hở mạch → "0L", không tít', meter.state.display);

  // ================================================================ 3) bỏ điện trở
  console.log('\n▶ 3) Rút điện trở, nối thẳng LED vào nguồn');
  game.items.remove(res);
  ok(game.wiring.connect(j1, bbAtt(bb, 'c11'), bbAtt(bb, 'W5')), 'dây 1 chuyển sang anốt LED (c11)');
  powerOn(5.0, 0.05);
  step(game, 180);
  el = ledEl(led);
  const pe = game.power.psuElement();
  step(game, 3);
  ok(pe?.cc && ch.mode === 'CC', 'giới hạn 50 mA → nguồn chuyển CC', `${f(ch.v, 2)} V / ${f(ch.i * 1000, 1)} mA, đèn CC`);
  ok(el && !led.state.dead && el.I > 0.045 && el.I < 0.052, 'LED SỐNG nhờ giới hạn dòng', `I = ${f(el?.I * 1000, 1)} mA, T = ${f(el?.T, 0)} °C`);
  ok(events.some((e) => e.type === 'psu:mode' && e.mode === 'CC'), "nguồn bàn phát 'psu:mode' CC");
  const fx0 = fxCalls;
  ch.iset = 3.0; game.events.emit('psu:changed', { ch: 1, ...ch });
  let tDead = null;
  for (let i = 0; i < 180 && tDead == null; i++) { step(game, 1); if (led.state.dead) tDead = i / 60; }
  ok(led.state.dead, 'giới hạn 3 A → LED CHẾT', `sau ${f(tDead, 2)} s — ${led.state.damage?.cause}`);
  ok(fxCalls > fx0, `hiệu ứng tại LED (${fxCalls - fx0} lần gọi fx)`);
  ok(events.some((e) => e.type === 'fault' && e.item === led), "phát 'fault' cho LED");
  ok(!(led.state.lit > 0), 'LED chết không sáng nữa');
  powerOff();
  step(game, 5);

  // ================================================================ 4) PIC cắm ngược
  console.log('\n▶ 4) PIC16F877A cắm NGƯỢC trong đế DIP-40 + cấp nguồn');
  const bb2 = spawn('breadboard-830', [-2600, 1100, 2600]);
  const ds = spawn('dip40-socket', [-2600, 1300, 2600]);
  ok(insert(ds, sock(bb2, 'bb-span-600:20')), 'đế DIP-40 vắt rãnh breadboard (cột 20–39)');
  const pic = spawn('pic16f877a', [-2600, 1350, 2600]);
  const dsock = ds.sockets.find((s) => s.kind === 'dip40');
  ok(insert(pic, dsock, { rotSteps: 2 }) && pic.socketInfo?.orientation === 'reversed', 'PIC cắm NGƯỢC khấc (xoay 180°)');
  ok(NL.netOfPin(pic, '1') === NL.netOfPin(ds, '21'), 'netlist: chân 1 PIC nằm ở tiếp điểm 21 của đế (hình học)');
  const jp = ['W', 'X', 'W', 'X'].map((r, i) => spawn('jumper-wire-mm', [-2600, 1300, 2700 + i * 40]));
  // đế: chân 11 → h30, 12 → h31, 32 → d28, 31 → d29  (VDD = 11, 32 · VSS = 12, 31)
  // (hàng breadboard đã đánh số lại theo bản in thật: hàng a ở phía +Z)
  game.wiring.connect(jp[0], bbAtt(bb2, 'a30'), bbAtt(bb2, 'W25'));
  game.wiring.connect(jp[1], bbAtt(bb2, 'a31'), bbAtt(bb2, 'X25'));
  game.wiring.connect(jp[2], bbAtt(bb2, 'j28'), bbAtt(bb2, 'W20'));
  game.wiring.connect(jp[3], bbAtt(bb2, 'j29'), bbAtt(bb2, 'X20'));
  ok(NL.netOfPin(ds, '11') === NL.netOf(bbAtt(bb2, 'W1')) && NL.netOfPin(ds, '31') === NL.netOf(bbAtt(bb2, 'X1')), 'đế: VDD (11) → +, VSS (31) → −');
  ok(NL.netOfPin(pic, '11') === NL.netOf(bbAtt(bb2, 'X1')), 'PIC ngược: chân VDD (11) của chip lại nằm ở thanh −');
  game.power.clipLead('red', bbAtt(bb2, 'W45'));
  game.power.clipLead('black', bbAtt(bb2, 'X45'));
  const faults0 = events.filter((e) => e.type === 'fault').length;
  powerOn(5.0, 3.0);
  let picDeadAt = null;
  for (let i = 0; i < 240 && picDeadAt == null; i++) { step(game, 1); if (pic.state.dead) picDeadAt = i / 60; }
  const pel = game.power.elementsOf(pic)[0];
  ok(pic.state.dead, 'PIC cắm ngược + nguồn 3 A → PIC hỏng', `sau ${f(picDeadAt, 2)} s — ${pic.state.damage?.cause || pel?.dmg?.cause}`);
  ok(events.some((e) => e.type === 'fault' && e.kind === 'reversed-ic' && e.item === pic), "phát 'fault' reversed-ic khi bật nguồn");
  ok(events.filter((e) => e.type === 'fault').length > faults0, 'có sự kiện fault');
  powerOff();
  step(game, 5);

  // ================================================================ 5) minigame đi dây
  console.log('\n▶ 5) Đi dây bằng tia nhìn, cắt / tuốt dây, cầu đấu vít');
  const j3 = spawn('jumper-wire-mm', [2600, 1300, 2800]);
  game.hands.attach('right', j3.object, { ...(j3.def.grip || {}), item: j3 }); j3.heldBy = 'right';
  const holeWorld = (b, id) => NL.posOf(bbAtt(b, id), new THREE.Vector3());
  const aim = (b, id) => { game.interact.target = { hit: { point: holeWorld(b, id), object: b.object }, inReach: true, item: b, chain: [] }; game.wiring._peekCache.key = null; };
  aim(bb, 'g40');
  const pk1 = game.wiring.peek(j3);
  ok(pk1?.ok && pk1.att.hole === 'g40', `nhắm lỗ → gợi ý "${pk1?.label}"`);
  const acts = game.interact.parts.heldPrompts(j3);
  ok(acts.some((a) => a.key === 'LMB' && /Cắm/.test(a.label)), 'cầm dây Dupont có gợi ý [Chuột trái] cắm đầu dây');
  ok(game.wiring.placeFromTarget(j3) === true && j3.state.cable.ends.A?.hole === 'g40', 'chuột trái lần 1 → đầu A vào g40');
  aim(bb, 'g44');
  ok(game.wiring.placeFromTarget(j3) === true && j3.state.cable.laid && !j3.heldBy, 'chuột trái lần 2 → đầu B vào g44, dây rời tay');
  ok(events.some((e) => e.type === 'wire:connected' && e.item === j3), "phát 'wire:connected'");
  ok(NL.netOf(bbAtt(bb, 'i40')) === NL.netOf(bbAtt(bb, 'f44')), 'dải 40R ↔ 44R thông qua dây');
  game.interact.target = null;
  game.wiring.pickUp(j3);
  step(game, 2);
  ok(j3.heldBy === 'right' && !j3.state.cable.laid && !j3.state.cable.ends.A, 'nhìn dây + E → rút dây cầm lên tay');
  ok(events.some((e) => e.type === 'wire:removed' && e.item === j3), "phát 'wire:removed'");
  ok(NL.netOf(bbAtt(bb, 'i40')) !== NL.netOf(bbAtt(bb, 'f44')), 'rút dây → 2 dải hết thông');
  game.inventory.stash(j3, true);
  // cuộn dây: [B] cắt đoạn
  const spool = spawn('wire-spool-22awg-red', [2600, 1300, 2900]);
  game.hands.attach('right', spool.object, { ...(spool.def.grip || {}), item: spool }); spool.heldBy = 'right';
  const cutAct = game.interact.parts.heldPrompts(spool).find((a) => a.key === 'B');
  cutAct?.do?.();
  const piece = game.inventory.bag.get('wire-piece')?.[0];
  ok(!!piece && piece.state.lengthMm === 150, `cuộn dây [B] cắt 150 mm → đoạn dây vào túi`);
  game.hands.detach('right'); spool.heldBy = null;
  const pieceOut = game.inventory.takeFromBag('wire-piece');
  game.hands.detach('right'); pieceOut.heldBy = null;
  pieceOut.object.position.set(2600, 1100, 3000); game.items.root.add(pieceOut.object); pieceOut.object.updateMatrixWorld(true);
  const endA = pieceOut.object.localToWorld(new THREE.Vector3(...pieceOut.def.getPins(pieceOut)[0].pos));
  game.events.emit('wire:strip', { item: pieceOut, gauge: 22, wireAwg: 22, result: 'ok', pos: endA });
  ok(pieceOut.state.strip[0] === 6, 'kìm tuốt khấc 22 → đầu A tuốt 6 mm');
  game.events.emit('wire:strip', { item: pieceOut, gauge: 22, wireAwg: 22, result: 'ok', pos: pieceOut.object.localToWorld(new THREE.Vector3(...pieceOut.def.getPins(pieceOut)[1].pos)) });
  game.events.emit('wire:crimp', { item: pieceOut, quality: 'good', terminal: 'jst-xh', die: '2.5', pos: endA });
  ok(pieceOut.state.crimp[0] === 'jst-xh', 'kìm bấm cos → đầu A có cos JST-XH');
  const shell = spawn('jst-xh-2-shell', [2650, 1100, 3000]);
  const term = spawn('screw-terminal-2p', [2700, 1100, 3000]);
  ok(game.wiring.connect(pieceOut, { kind: 'shell', uid: shell.uid, cavity: 0 }, { kind: 'screw', uid: term.uid, index: 0 }), 'đầu cos → vỏ JST lỗ 1, đầu tuốt → cầu đấu vít');
  ok(!NL.connected({ kind: 'pin', uid: shell.uid, pin: 'C1' }, { kind: 'pin', uid: term.uid, pin: '1' }), 'vít chưa siết → chưa dẫn điện');
  const r = term.def.driveScrew(term, 0, 0.5);
  game.events.emit('screw:driven', { item: term, node: 'screw-0', torque: 0.4, stripped: false, dir: 'in' });
  ok(r.clamped && NL.connected({ kind: 'pin', uid: shell.uid, pin: 'C1' }, { kind: 'pin', uid: term.uid, pin: '1' }), 'siết vít → dây dẫn điện: vỏ JST C1 ↔ cầu đấu chân 1');
  const hdr = spawn('jst-xh-2', [2750, 1100, 3000]);
  ok(insert(shell, hdr.sockets[0]), 'cắm vỏ JST vào đầu đực JST-XH-2 (đúng chiều)');
  ok(NL.connected({ kind: 'pin', uid: hdr.uid, pin: '1' }, { kind: 'pin', uid: term.uid, pin: '1' }), 'đầu đực JST chân 1 ↔ cầu đấu qua dây tự bấm');

  // ================================================================ 6) lưu / tải
  console.log('\n▶ 6) Lưu / tải');
  ok(game.save.save('manual'), 'lưu game');
  ok(game.save.apply(game.save.load()), 'tải game');
  step(game, 20);
  ok(j1.state.cable.laid && game.wiring.groups.has(j1.uid) && !j1.object.parent, 'dây Dupont đã đi vẫn nằm đúng chỗ sau khi tải');
  ok(!!game.power.leads.red, 'kẹp nguồn bàn được khôi phục');
} catch (e) {
  fails++;
  console.log('✗ NGOẠI LỆ:', e.stack);
}
console.error = origErr;
if (consoleErrors) { console.log(`  ✗ có ${consoleErrors} console.error`); fails++; }
console.log(`\n${passes} đạt, ${fails} lỗi`);
process.exit(fails ? 1 : 0);
