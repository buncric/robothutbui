// Kiểm tra MINIGAME HÀN không cần trình duyệt (minigames/soldering.js):
//   node tools/game-solder-test.mjs [--verbose]
// Dựng phòng thử + registry thật, kẹp board đục lỗ vào kẹp mạch (lật mặt hàn lên), cắm điện trở đã bẻ chân vào 2 lỗ,
// rồi mô phỏng tay người chơi qua soldering.debug (vị trí mũi hàn / đầu dây thiếc / bấc) theo thời gian:
//   mối ĐẸP khi chạm đúng thời gian · NGUỘI khi rút mũi sớm · CẦU THIẾC khi dồn thiếc cạnh pad có thiếc ·
//   BONG PAD khi quá nhiệt · hút thiếc (ống hút + dây hút) · cắt chân · an toàn (bỏng tay, chảy nhựa, khói) ·
//   netlist + đồng hồ đo Ω · nhiệm vụ m1-han-pic · lưu/tải.
import { readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { createGame } from '../src/game/main.js';
import * as Vise from '../src/game/world/props/vise.js';
import { labState } from '../src/game/world/_labState.js';
import { PM } from '../src/game/items/parts/_shared.js';
import { alloyOf, FILM_MM3 } from '../src/game/minigames/_solder_physics.js';
import { cheatStep, scoreM1 } from '../src/game/quests/m1-han-pic.js';

const VERBOSE = process.argv.includes('--verbose');
const ROOT = fileURLToPath(new URL('../src/game/', import.meta.url));
let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) { passes++; console.log('  ✓', msg); } else { fails++; console.log('  ✗', msg); } return cond; };
const log = (...a) => { if (VERBOSE) console.log('    ·', ...a); };

function memoryStorage() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; }
async function loadRegistry() {
  const reg = await import(pathToFileURL(join(ROOT, 'items/registry.js')).href);
  const record = {};
  for (const sub of ['tools', 'parts']) {
    const dir = join(ROOT, 'items', sub);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (!f.endsWith('.js') || statSync(p).isDirectory()) continue;
      record[`./${sub}/${f}`] = await import(pathToFileURL(p).href);
    }
  }
  reg.registerItemModules?.(record);
  return reg;
}

const origErr = console.error;
let consoleErrors = 0;
console.error = (...a) => { consoleErrors++; origErr('  [console.error]', ...a); };

console.log('\n▶ Minigame hàn — mô phỏng headless');
const reg = await loadRegistry();
const game = await createGame({ headless: true, storage: memoryStorage(), worldModule: null, registryModule: reg });
game.app.locked = true; game.started = true; game.app.setPaused(false);
const S = game.soldering;
ok(!!S && typeof S.fixedUpdate === 'function', 'game.soldering khởi tạo (main.js)');
ok(!!game.quests.defs.get('m1-han-pic'), "nhiệm vụ 'm1-han-pic' đã đăng ký");

const events = [];
game.events.on('*', (e) => { if (!e.type.startsWith('input:') && e.type !== 'footstep') events.push(e); });
const since = (n) => events.slice(n);
const has = (list, t, pred = () => true) => list.some((e) => e.type === t && pred(e));
const sec = (s) => {
  const n = Math.round(s * 60);
  for (let i = 0; i < n; i++) { const a = performance.now(); game.app.step(1 / 60); const d = performance.now() - a; if (VERBOSE && d > 100) console.log(`    ⚠ bước chậm ${d.toFixed(0)} ms`); }
};

// ---------------------------------------------------------------- dựng bàn hàn: kẹp mạch + board + điện trở
const vise = Vise.build(game);
vise.object.position.set(0, 750, -350);
game.scene.add(vise.object);
vise.object.updateMatrixWorld(true);
for (const s of vise.sockets) game.sockets.add(s);
const pb = game.items.spawn('perfboard-9x15', { pos: [0, 800, -350] });
const viseSock = game.sockets.get('vise');
game.sockets.insert(pb, viseSock, { instant: true });
ok(viseSock.occupiedBy === pb, 'board đục lỗ kẹp vào kẹp mạch');
// lật bo: mặt hàn (dưới) lên trên
vise.interact[0].spec.prompts[0].do();
for (let i = 0; i < 180; i++) vise.update(1 / 60);
pb.object.updateMatrixWorld(true);
const n0 = new THREE.Vector3();
S.padWorld(S.board(pb), S.board(pb).byId.get('10,20'), new THREE.Vector3(), n0);
ok(n0.y > 0.95, `lật bo: pháp tuyến mặt hàn hướng lên (${n0.toArray().map((v) => v.toFixed(2)).join(', ')})`);
// anchor fix: khe lỗ board dùng được khi chơi
const hole = game.sockets.get(`${pb.uid}:10,20`);
const res = game.items.spawn('resistor-10k', { pos: [0, 900, -250] });
ok(game.sockets._available(hole, res), 'khe lỗ board "khả dụng" khi chơi (sửa nhóm __anchors ẩn)');
ok(res.def.bendLeads(res, 4)?.ok, 'bẻ chân điện trở 4 × 2.54 mm');
game.sockets.insert(res, hole, { instant: true });
sec(0.1);
const rj = S.partJoints(res);
ok(rj.length === 2 && rj.map((j) => j.padId).sort().join(' ') === '10,20 10,24', `2 chân điện trở xuyên pad ${rj.map((j) => j.padId).join(', ')}`);
ok(rj.every((j) => j.pad.lead && j.pad.lead.L > 5), `chân nhô ra mặt hàn ${rj[0]?.pad.lead?.L.toFixed(1)} mm (chưa cắt)`);

// ---------------------------------------------------------------- trạm hàn: nhiệt mũi τ≈20 s
const st = labState(game).station;
st.on = true; st.setpoint = 350;
const iron = game.inventory.slots.find((t) => t?.def.id === 'soldering-iron');
const wire = game.inventory.slots.find((t) => t?.def.id === 'solder-wire');
ok(!!iron && !!wire, 'mỏ hàn + thiếc có trên thanh dụng cụ');
sec(20);
const T20 = iron.state.tipTemp;
sec(60);
ok(T20 > 180 && T20 < 300 && iron.state.tipTemp > 335, `mũi nóng dần theo trạm: 20 s → ${T20.toFixed(0)} °C, 80 s → ${iron.state.tipTemp.toFixed(0)} °C`);
labState(game).fume.on = false;

const eye = (cp) => cp.center.clone().addScaledVector(cp.normal, 300).add(new THREE.Vector3(0, 0, 250));
/** Hàn 1 mối theo kịch bản thời gian. Trả { pad, ev, minTip } */
function solder(padId, { pre = 1.2, feed = 0.7, post = 0.4, cool = 3, feedAt = 'joint', touchIron = true } = {}) {
  const cp0 = S.contactPoints(pb, padId);
  const cp = S.contactPoints(pb, padId, eye(cp0));
  const n = events.length;
  S.debug = { iron: { tip: cp.iron.clone(), down: touchIron }, wire: { tip: (feedAt === 'iron' ? cp.iron.clone().addScaledVector(cp.normal, 1.6) : cp.feed.clone()), down: false } };
  let minTip = iron.state.tipTemp;
  const run = (s) => { const k = Math.round(s * 60); for (let i = 0; i < k; i++) { game.app.step(1 / 60); minTip = Math.min(minTip, iron.state.tipTemp); } };
  run(pre);
  const padT0 = cp.pad.T;
  S.debug.wire.down = true; run(feed); S.debug.wire.down = false;
  run(post);
  S.debug.iron.down = false;
  S.debug.iron.tip = cp.iron.clone().addScaledVector(cp.normal, 30);      // nhấc mũi lên
  run(cool);
  S.debug = null;
  return { pad: cp.pad, ev: since(n), minTip, padT0 };
}
const jointEv = (ev, padId) => ev.filter((e) => e.type === 'solder:joint' && e.padId === padId).pop();

// ---------------------------------------------------------------- 1) mối hàn đẹp
const len0 = wire.state.lengthMm;
const tip0 = iron.state.tipTemp;
let r = solder('10,20', { pre: 1.2, feed: 0.7, post: 0.5 });
let je = jointEv(r.ev, '10,20');
log('đẹp:', je?.quality, JSON.stringify(je?.stats), je?.issues);
ok(r.padT0 >= 230, `chạm mũi 1.2 s → pad ${r.padT0.toFixed(0)} °C (≥ 230 °C trước khi đưa thiếc)`);
ok(je?.quality === 'good' && r.pad.state === 'good', `MỐI HÀN ĐẸP (V ${je?.stats.volume} mm³, ướt ${Math.round((je?.stats.wetting || 0) * 100)} %, đỉnh ${je?.stats.peakT} °C)`);
ok(has(r.ev, 'iron:contact') && has(r.ev, 'solder:melt'), 'sự kiện iron:contact + solder:melt');
ok(r.minTip < tip0 - 1, `mũi hàn tụt nhiệt khi hàn (${tip0.toFixed(0)} → ${r.minTip.toFixed(0)} °C) rồi hồi lại`);
ok(len0 - wire.state.lengthMm > 2 && len0 - wire.state.lengthMm < 6, `dây thiếc chỉ trừ phần đã chảy: ${(len0 - wire.state.lengthMm).toFixed(1)} mm`);
ok(!!r.pad._vis?.fillet?.visible && r.pad._vis.fillet.material === S.board(pb).byId.get('10,20')._vis.fillet.material, 'có lưới hình nón thiếc trên pad');
ok(S.connections().some((c) => c.kind === 'joint' && c.a === `${res.uid}/1` && c.b === `${pb.uid}/10,20` && c.quality === 'good'), 'netlist: chân 1 điện trở ↔ pad 10,20 (good)');

// ---------------------------------------------------------------- 2) mối hàn nguội (rút mũi sớm)
r = solder('10,24', { pre: 0.15, feed: 0.3, post: 0, cool: 3 });
je = jointEv(r.ev, '10,24');
log('nguội:', je?.quality, JSON.stringify(je?.stats), je?.issues);
ok(r.padT0 < 183, `chạm mũi 0.15 s → pad mới ${r.padT0.toFixed(0)} °C`);
ok(je?.quality === 'cold' && r.pad.state === 'cold', `MỐI HÀN NGUỘI khi rút mũi sớm (${(je?.issues || []).join('; ')})`);
ok(has(r.ev, 'solder:cold-feed') || has(r.ev, 'solder:into-iron') || (je?.stats.wetting ?? 1) < 0.6, 'phát hiện thiếc vón trên mũi / không thấm');
ok(S.connections().some((c) => c.kind === 'joint' && c.b === `${pb.uid}/10,24` && c.flaky), 'netlist: mối nguội đánh dấu chập chờn (flaky)');

// ---- hàn lại: chấm nhựa thông + giữ mũi đủ lâu → đẹp
const cp24 = S.contactPoints(pb, '10,24');
let n = events.length;
for (let i = 0; i < 30; i++) game.events.emit('flux:applied', { amount: 0.03 / 60, pos: cp24.center.clone().addScaledVector(cp24.normal, 0.3) });
ok(r.pad.flux > 0.3 && has(since(n), 'solder:flux'), `bút nhựa thông: flux pad ${r.pad.flux.toFixed(2)}`);
r = solder('10,24', { pre: 1.5, feed: 0.25, post: 0.6 });
je = jointEv(r.ev, '10,24');
log('hàn lại:', je?.quality, JSON.stringify(je?.stats));
ok(je?.quality === 'good', `hàn lại có nhựa thông → ĐẸP (${je?.quality})`);
ok(has(r.ev, 'safety:fume') || S.stats.fume > 0, 'máy hút khói TẮT + khói nhựa thông → cảnh báo safety:fume');

// ---- đồng hồ vạn năng Ω qua điện trở đã hàn 2 đầu
const c20 = S.contactPoints(pb, '10,20'), c24 = S.contactPoints(pb, '10,24');
const req = { mode: 'ohm', a: c20.center.clone().addScaledVector(c20.normal, 0.5), b: c24.center.clone().addScaledVector(c24.normal, 0.5), value: undefined };
req.value = S.measure(req);
ok(req.value === 10000, `đo Ω giữa 2 pad điện trở 10 kΩ đã hàn → ${req.value}`);

// ---- cắt chân sau khi hàn
n = events.length;
game.events.emit('cut', { tool: 'flush-cutter', what: 'lead', item: pb, pos: c24.center.clone().addScaledVector(c24.normal, 6) });
let tr = since(n).find((e) => e.type === 'lead:trimmed');
ok(!!tr && tr.soldered && tr.lengthMm > 5 && r.pad.lead.L === 1, `kìm cắt: cắt chân sát ${tr?.lengthMm} mm (lead:trimmed), còn nhô 1 mm`);
ok(S.particles.flyers.length > 0, 'mẩu chân văng ra');
game.events.emit('cut', { tool: 'flush-cutter', what: 'lead', item: pb, pos: c20.center.clone().addScaledVector(c20.normal, 6) });
sec(0.2);
ok(res.state.trimProtrude != null && S.partJoints(res).every((j) => j.pad.lead.L <= 1.05), 'cắt cả 2 chân → mô hình chân linh kiện được cắt (trimLeads)');

// ---------------------------------------------------------------- 3) cầu thiếc khi dồn thiếc cạnh pad đã có thiếc
r = solder('20,30', { pre: 1.0, feed: 0.5, post: 0.3 });
ok(['good', 'cold'].includes(r.pad.state) && r.pad.solderVol > 0.5, `pad trống 20,30 có thiếc (${r.pad.state}, ${r.pad.solderVol.toFixed(1)} mm³)`);
r = solder('20,31', { pre: 1.0, feed: 3.5, post: 0.3 });
const be = r.ev.find((e) => e.type === 'solder:bridge');
log('cầu:', be?.a, be?.b, r.pad.solderVol.toFixed(2));
ok(!!be && [be.a, be.b].includes(`${pb.uid}/20,31`), `CẦU THIẾC khi dồn thiếc (${be?.a} ↔ ${be?.b})`);
const other = be ? [be.a, be.b].find((k) => k !== `${pb.uid}/20,31`) : null;
ok(r.pad.state === 'bridge' && S.sameNet(`${pb.uid}/20,31`, other), 'netlist: 2 pad bị chập (sameNet)');
ok(S.shorts().length >= 1 && S.board(pb).bridgeMeshes.size >= 1, `shorts() = ${S.shorts().length}, có lưới cầu thiếc`);

// ---- ống hút thiếc: nung chảy rồi hút → tách cầu
const c31 = S.contactPoints(pb, '20,31');
const pump = game.items.all.find((i) => i.def.id === 'desolder-pump') || game.items.spawn('desolder-pump', { pos: [200, 800, 0] });
S.debug = { iron: { tip: c31.iron.clone(), down: true }, tools: { 'desolder-pump': pump } };
sec(2.5);
ok(r.pad.molten, `nung chảy lại mối cầu (${r.pad.T.toFixed(0)} °C)`);
n = events.length;
game.events.emit('desolder:suck', { instance: pump, pos: c31.center.clone().addScaledVector(c31.normal, 1.2) });
sec(0.1);
S.debug = null; sec(3);
const ev3 = since(n);
ok(has(ev3, 'solder:removed', (e) => e.by === 'pump') && has(ev3, 'solder:bridge-removed'), 'ống hút: solder:removed + tách cầu thiếc');
ok(!S.sameNet(`${pb.uid}/20,31`, other) && S.shorts().length === 0, 'hết chập sau khi hút');

// ---------------------------------------------------------------- 4) hút thiếc mối hàn đẹp (pad 10,20) → trống
const c10 = S.contactPoints(pb, '10,20');
S.debug = { iron: { tip: c10.iron.clone(), down: true } };
sec(1.5);
n = events.length;
game.events.emit('desolder:suck', { pos: c10.center.clone().addScaledVector(c10.normal, 1.2) });
S.debug = null; sec(3);
const p10 = S.board(pb).byId.get('10,20');
ok(has(since(n), 'solder:removed') && p10.solderVol < FILM_MM3 && p10.state === 'empty', `hút sạch mối 10,20 → trống (còn ${p10.solderVol.toFixed(2)} mm³)`);
ok(!S.connections().some((c) => c.b === `${pb.uid}/10,20`), 'netlist: chân 1 điện trở không còn nối');

// ---- dây hút thiếc (bấc)
r = solder('5,5', { pre: 1.0, feed: 0.8, post: 0.3 });
const V55 = r.pad.solderVol;
const wick = game.items.all.find((i) => i.def.id === 'solder-wick') || game.items.spawn('solder-wick', { pos: [250, 800, 0] });
const c55 = S.contactPoints(pb, '5,5');
const wickTip = c55.center.clone().addScaledVector(c55.normal, 0.4);
n = events.length;
S.debug = { tools: { 'solder-wick': wick }, wick: { tip: wickTip, down: true }, iron: { tip: wickTip.clone().addScaledVector(c55.normal, 0.8), down: true } };
sec(3);
S.debug = null; sec(3);
ok(r.pad.solderVol < V55 * 0.5 && wick.state.saturation > 0.1 && has(since(n), 'solder:removed', (e) => e.by === 'wick'), `dây hút thiếc: ${V55.toFixed(1)} → ${r.pad.solderVol.toFixed(1)} mm³, bấc no ${Math.round(wick.state.saturation * 100)} % (bạc dần)`);

// ---------------------------------------------------------------- 5) bong pad khi quá nhiệt
st.setpoint = 450;
sec(60);
log('mũi 450:', iron.state.tipTemp.toFixed(0), 'oxy hoá', iron.state.oxidation.toFixed(2));
iron.def.clean(iron, 'brass', game); iron.def.tin(iron, 0.6, game);      // lau bùi nhùi đồng + tráng thiếc như người thợ
r = solder('25,40', { pre: 1.0, feed: 0.6, post: 14, cool: 4 });
je = jointEv(r.ev, '25,40');
log('bong pad:', 'peak', r.pad.peakT.toFixed(0), 'dose', r.pad.overheat.toFixed(2), 'state', r.pad.state, 'minTip', r.minTip.toFixed(0), je?.quality);
ok(has(r.ev, 'solder:lifted') && r.pad.state === 'lifted', `BONG PAD khi giữ mũi ${iron.state.tipTemp.toFixed(0)} °C quá lâu (${je?.quality})`);
ok(has(r.ev, 'fault', (e) => e.kind === 'pad-lifted'), "phát 'fault' pad-lifted");
st.setpoint = 340;

// ---------------------------------------------------------------- 6) an toàn
const tipP = new THREE.Vector3(0, 900, 0);
n = events.length;
S.debug = { iron: { tip: tipP, down: false }, leftHand: [tipP.clone().add(new THREE.Vector3(8, 0, 0))] };
sec(0.2);
ok(has(since(n), 'safety:burn'), 'mũi hàn sát ngón tay trái (8 mm) → "Bỏng tay!" safety:burn');
const plastic = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), PM.pbtBlack);
plastic.position.set(0, 950, 0); game.scene.add(plastic); plastic.updateMatrixWorld(true);
n = events.length;
S.debug = { iron: { tip: new THREE.Vector3(0, 955, 0), down: true }, ironTouch: { object: plastic, point: new THREE.Vector3(0, 955, 0), face: { normal: new THREE.Vector3(0, 1, 0) } } };
sec(0.6);
S.debug = null;
ok(has(since(n), 'safety:plastic-melt') && plastic.children.length > 0, 'mũi hàn chạm vỏ nhựa PBT → safety:plastic-melt + vết chảy');
// bỏ trạm bật rồi đi xa > 6 m trong > 60 s
game.world.anchors = { 'station-solder': new THREE.Object3D() };
game.world.anchors['station-solder'].position.set(0, 750, -350);
game.scene.add(game.world.anchors['station-solder']);
n = events.length;
game.player.teleport([0, 0, 9000], 0, 0);
sec(66);
ok(has(since(n), 'safety:iron-left-on'), 'trạm hàn bật + rời xa 9 m > 60 s → safety:iron-left-on');
game.player.teleport([0, 0, 600], 0, 0);

// ---------------------------------------------------------------- 7) đưa thiếc vào mũi khi đang hàn
r = solder('15,15', { pre: 0.9, feed: 0.4, post: 0.3, feedAt: 'iron' });
ok(has(r.ev, 'solder:into-iron'), 'đưa thiếc vào MŨI (không vào chỗ tiếp xúc) → cảnh báo solder:into-iron');

// ---------------------------------------------------------------- hợp kim
ok(alloyOf('SAC305').liquidus === 221 && alloyOf({ alloy: 'Sn63Pb37' }).liquidus === 183, 'hợp kim theo cuộn: Sn63Pb37 183 °C · SAC305 217–221 °C');

// ---------------------------------------------------------------- dụng cụ thật (hook) không lỗi + iron:returned
n = events.length;
const islot = game.inventory.slots.indexOf(iron);
game.inventory.select(islot); sec(0.2);
game.inventory.holster(true); sec(0.1);
ok(has(since(n), 'iron:returned'), 'cất mỏ hàn → iron:returned');

// ---------------------------------------------------------------- nhiệm vụ
game.quests.start('m1-han-pic');
sec(0.6);
const qs = () => game.quests.progress('m1-han-pic');
ok(qs()?.step >= 1, `nhiệm vụ M1: bước "đặt board vào kẹp" tự hoàn thành (bước ${qs()?.step})`);
const dip = game.items.spawn('dip40-socket', { pos: [0, 900, -300] });
const dh = game.sockets.get(`${pb.uid}:12,10`);   // chân 1 ở hàng 12 → hàng chân kia ở hàng 6 (board đang lật)
game.sockets.insert(dip, dh, { instant: true });
sec(0.6);
ok(S.partJoints(dip).length === 40, `đế DIP-40 cắm board: 40 chân ↔ 40 pad`);
ok(qs()?.step >= 2, `bước "đế DIP-40 khấc trái" hoàn thành (bước ${qs()?.step})`);
let cheats = 0;
while (!qs()?.done && cheats < 20) { cheatStep(game); cheats++; }
ok(qs()?.done && typeof qs()?.score === 'number', `cheat F9 qua hết ${cheats} bước còn lại → điểm ${qs()?.score}`);
const sc = scoreM1(game, { events: { 'solder:bridge': 1, 'safety:fume': 1 }, faults: [], time: 1200 });
ok(sc.score >= 0 && sc.score <= 100 && sc.notes.length > 2, `chấm điểm: ${sc.score} — ${sc.notes[0]}`);

// ---------------------------------------------------------------- lưu / tải
const data = S.serialize();
ok(Object.keys(data.boards[pb.uid]?.pads || {}).length >= 4, `serialize: ${Object.keys(data.boards[pb.uid]?.pads || {}).length} pad có thiếc`);
ok(game.save.save('manual'), 'game.save có module soldering');
const p55 = S.board(pb).byId.get('25,40');
p55.solderVol = 0; p55.state = 'empty';
S._pendingLoad = data; sec(0.05);
ok(S.board(pb).byId.get('25,40').state === 'lifted', 'tải lại: trạng thái pad khôi phục');

// ---------------------------------------------------------------- hiệu năng: 1 bước logic khi đang hàn
const cpp = S.contactPoints(pb, '28,50');
S.debug = { iron: { tip: cpp.iron, down: true }, wire: { tip: cpp.feed, down: true } };
const t0 = performance.now();
for (let i = 0; i < 300; i++) S.fixedUpdate(1 / 60);
const ms = (performance.now() - t0) / 300;
S.debug = null;
ok(ms < 1.5, `soldering.fixedUpdate ${ms.toFixed(3)} ms/bước`);

console.error = origErr;
if (consoleErrors) { console.log(`  ✗ có ${consoleErrors} console.error`); fails++; }
console.log(`\n${passes} đạt, ${fails} lỗi`);
process.exit(fails ? 1 : 0);
