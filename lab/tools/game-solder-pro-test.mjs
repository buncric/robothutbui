// Kiểm tra HÀN MỨC KỸ THUẬT VIÊN (minigames/solder-pro.js + _solder_physics.js + items/tools/tip-*.js) không cần trình duyệt:
//   node tools/game-solder-pro-test.mjs [--verbose]
// Số liệu đối chiếu docs/07_KIEN_THUC_HAN_MACH.md:
//   • mũi 2C @340 °C Sn63: mối ĐẸP trong ~2–3 s · mũi B05 cùng mối: lâu hơn / NGUỘI (§1.3, §13.1)
//   • pad nối mặt đồng lớn: mũi nhỏ không thấm, mũi D32 @380 °C được (SparkFun ~382 °C cho ground plane §3.2; §3.5, §1.4)
//   • LED giữ mũi lâu không kẹp tản nhiệt → hỏng; có kẹp → an toàn (§4.1 Kingbright 300 °C/3 s, §6.11)
//   • flux cháy thành than sau khi giữ mũi lâu → không thấm (§4.2, §13.3)
//   • mũi mới không phủ thiếc → oxy hoá (§2.3, §2.5) · rút mũi nóng tay trần → bỏng (§2.1)
//   • soi 1,75× không thấy cầu thiếc mảnh, 10× thấy (§13.4) · độ nhô chân sau cắt (IPC §5.3) · lỗi phụ, làm sạch, QC, thẻ bài học
import { readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { createGame } from '../src/game/main.js';
import * as Vise from '../src/game/world/props/vise.js';
import { labState } from '../src/game/world/_labState.js';
import { initPad } from '../src/game/minigames/_solder_physics.js';
import { TIPS, DEFECTS, COMPONENTS, bodyLimit } from '../src/game/minigames/_solder_kb.js';

const VERBOSE = process.argv.includes('--verbose');
const ROOT = fileURLToPath(new URL('../src/game/', import.meta.url));
let fails = 0, passes = 0;
const ok = (cond, msg, extra = '') => { if (cond) { passes++; console.log('  ✓', msg); } else { fails++; console.log('  ✗', msg, extra); } return cond; };
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

console.log('\n▶ Hàn kỹ thuật viên — mô phỏng headless');
const reg = await loadRegistry();
const game = await createGame({ headless: true, storage: memoryStorage(), worldModule: null, registryModule: reg });
game.app.locked = true; game.started = true; game.app.setPaused(false);
const S = game.soldering, P = S.pro;
ok(!!P, 'game.soldering.pro (SolderPro) khởi tạo');
const events = [];
game.events.on('*', (e) => { if (!e.type.startsWith('input:') && e.type !== 'footstep') events.push(e); });
const since = (n) => events.slice(n);
const has = (list, t, pred = () => true) => list.some((e) => e.type === t && pred(e));
const step = (s) => { const n = Math.round(s * 60); for (let i = 0; i < n; i++) game.app.step(1 / 60); };

// ---------------------------------------------------------------- 12 mũi hàn = item
const tipIds = Object.keys(TIPS).map((c) => `tip-${c.toLowerCase()}`);
ok(tipIds.every((id) => !!game.items.get(id)), `${tipIds.length} mũi hàn đăng ký: ${Object.keys(TIPS).join(' ')}`);
ok(['heatsink-clip', 'tip-change-pad', 'ipa-brush', 'esd-wrist-strap'].every((id) => !!game.items.get(id)), 'dụng cụ nghề: kẹp tản nhiệt · miếng chịu nhiệt · bàn chải IPA · vòng ESD');
ok(!game.inventory.slots.some((t) => /^tip-|heatsink|ipa-brush|tip-change|esd-wrist/.test(t?.def.id || '')), 'mũi/dụng cụ mới KHÔNG chiếm thanh dụng cụ mặc định');

// ---------------------------------------------------------------- bàn hàn
const vise = Vise.build(game);
vise.object.position.set(0, 750, -350);
game.scene.add(vise.object); vise.object.updateMatrixWorld(true);
for (const s of vise.sockets) game.sockets.add(s);
const pb = game.items.spawn('perfboard-9x15', { pos: [0, 800, -350] });
game.sockets.insert(pb, game.sockets.get('vise'), { instant: true });
vise.interact[0].spec.prompts[0].do();
for (let i = 0; i < 180; i++) vise.update(1 / 60);
pb.object.updateMatrixWorld(true);
const rec = S.board(pb);
const st = labState(game).station;
const iron = game.inventory.slots.find((t) => t?.def.id === 'soldering-iron');
const wire = game.inventory.slots.find((t) => t?.def.id === 'solder-wire');
ok(iron?.state.tip === 'D16', `mỏ hàn mặc định lắp mũi D16 ("lựa chọn số 1 cho THT", §1.2) — ${iron?.state.tip}`);
labState(game).fume.on = true;

/** Cắm linh kiện id vào lỗ r,c (bẻ chân n bước nếu có) */
function place(id, hole, span = null) {
  const it = game.items.spawn(id, { pos: [0, 900, -250] });
  if (span && it.def.bendLeads) it.def.bendLeads(it, span);
  game.sockets.insert(it, game.sockets.get(`${pb.uid}:${hole}`), { instant: true });
  S.board(pb).leadsDirty = true;
  step(0.1);
  return it;
}
/** Chuẩn bị mũi: lắp mã code (tức thì), tráng thiếc tốt, chờ nhiệt độ */
function prepTip(code, setpoint, secs = 90) {
  iron.def.setTip(iron, code);
  st.on = true; st.setpoint = setpoint;
  step(secs);
  Object.assign(iron.state, { oxidation: 0.05, tinned: 0.7 });
  return iron.state.tipTemp;
}
const eye = (cp) => cp.center.clone().addScaledVector(cp.normal, 300).add(new THREE.Vector3(0, 0, 250));
/** Hàn 1 mối: pre (s) chạm mũi · feed (s) đưa thiếc · post (s) giữ mũi · cool (s). Trả { pad, ev, tReach } */
function solder(padId, { pre = 1.0, feed = 0.8, post = 0.4, cool = 3, reach = null } = {}) {
  const cp0 = S.contactPoints(pb, padId);
  const cp = S.contactPoints(pb, padId, eye(cp0));
  const n = events.length;
  S.debug = { iron: { tip: cp.iron.clone(), down: true }, wire: { tip: cp.feed.clone(), down: false } };
  let t = 0, tReach = null;
  const run = (s) => { const k = Math.round(s * 60); for (let i = 0; i < k; i++) { game.app.step(1 / 60); t += 1 / 60; if (reach != null && tReach == null && cp.pad.T >= reach) tReach = t; } };
  run(pre);
  const padT0 = cp.pad.T;
  S.debug.wire.down = true; run(feed); S.debug.wire.down = false;
  run(post);
  S.debug.iron.down = false; S.debug.iron.tip = cp.iron.clone().addScaledVector(cp.normal, 30);
  run(cool);
  S.debug = null;
  return { pad: cp.pad, ev: since(n), padT0, tReach };
}
const jointQ = (r) => r.ev.filter((e) => e.type === 'solder:joint' && e.pad === r.pad).pop()?.quality;

// ---------------------------------------------------------------- 1) 2C @340 °C vs B05 @340 °C
console.log('\n▶ 1) Mũi 2C vs B05 trên cùng loại mối (pad Ø1,8 + chân điện trở)');
const r1 = place('resistor-10k', '10,20', 4);
let T = prepTip('2C', 340);
let a = solder('10,20', { pre: 1.0, feed: 0.8, post: 0.4, reach: 230 });
log('2C:', jointQ(a), 'reach230', a.tReach, 'padT0', a.padT0.toFixed(0), 'tip', T.toFixed(0));
ok(jointQ(a) === 'good' && a.tReach != null && a.tReach < 1.0, `2C @${Math.round(T)} °C Sn63: pad ≥ 230 °C sau ${a.tReach?.toFixed(2)} s → mối ĐẸP, tổng 2,2 s chạm mũi`);
const tip2C = a.pad.tipCode;
ok(tip2C === '2C', `mối ghi lại mũi đã dùng: ${tip2C}`);
T = prepTip('B05', 340, 20);
let b = solder('10,24', { pre: 1.0, feed: 0.8, post: 0.4, reach: 230 });
log('B05:', jointQ(b), 'reach230', b.tReach, 'padT0', b.padT0.toFixed(0), 'peak', b.pad.peakT?.toFixed(0), 'wet', b.pad.wetting.toFixed(2));
ok(jointQ(b) === 'cold' && (b.tReach == null || b.tReach > 2 * (a.tReach || 0)), `B05 @${Math.round(T)} °C cùng thời gian: pad chỉ ${b.padT0.toFixed(0)} °C khi đưa thiếc → mối NGUỘI (đỉnh ${b.pad.peakT.toFixed(0)} °C)`);
const v = P.tipLog.filter((x) => x.key === b.pad._key).pop();
ok(v && v.tip === 'B05' && !v.ok, `chọn mũi: B05 cho "${v?.kind}" bị đánh giá không hợp (${v?.level})`);
// B05 giữ rất lâu: vẫn khó loang (§1.3 "bỏ đói mối hàn")
b = solder('10,24', { pre: 4.0, feed: 0.6, post: 0.4, reach: 230 });
log('B05 giữ lâu:', jointQ(b), b.tReach, b.pad.peakT.toFixed(0));
ok(b.tReach == null || b.tReach > 2.5, `B05 giữ 4 s: ${b.tReach == null ? 'pad KHÔNG BAO GIỜ tới 230 °C' : `tới 230 °C sau ${b.tReach.toFixed(1)} s`} (mũi nhỏ "đói nhiệt")`);

// ---------------------------------------------------------------- 2) pad nối mặt đồng lớn
console.log('\n▶ 2) Pad nối mặt đồng lớn (ground plane, thermalMass ×5)');
const gp = rec.byId.get('3,40');
gp.thermalMass = 3; delete gp._phys; initPad(gp, 30);
T = prepTip('B', 350, 20);
let g = solder('3,40', { pre: 3.0, feed: 0.8, post: 0.6 });
log('B ground:', jointQ(g), g.pad.peakT?.toFixed(0), g.pad.wetting.toFixed(2));
ok(['cold', undefined].includes(jointQ(g)) && g.pad.state !== 'good', `mũi B @350 °C giữ 3 s: pad đỉnh ${g.pad.peakT.toFixed(0)} °C → KHÔNG thấm (${g.pad.state})`);
const gp2 = rec.byId.get('3,46');
gp2.thermalMass = 3; delete gp2._phys; initPad(gp2, 30);
T = prepTip('D32', 380, 60);
g = solder('3,46', { pre: 2.5, feed: 0.6, post: 0.8 });
log('D32 ground:', jointQ(g), g.pad.peakT?.toFixed(0), g.pad.wetting.toFixed(2));
ok(jointQ(g) === 'good', `đổi mũi D32 @${Math.round(T)} °C (to hơn — không tăng nhiệt bừa, §3.5): mối ĐẸP (đỉnh ${g.pad.peakT.toFixed(0)} °C)`);

// ---------------------------------------------------------------- 3) LED quá nhiệt — không kẹp vs có kẹp tản nhiệt
console.log('\n▶ 3) LED 5 mm: giữ mũi 7 s (giới hạn Kingbright 300 °C / 3 s)');
const led1 = place('led-5mm-red', '20,10');
const led2 = place('led-5mm-red', '20,20');
const lj1 = S.partJoints(led1), lj2 = S.partJoints(led2);
log('LED sockets:', led1.socket, led2.socket);
ok(lj1.length === 2 && lj2.length === 2, `2 LED cắm board (${lj1.map((j) => j.padId).join(', ')} · ${lj2.map((j) => j.padId).join(', ')})`);
log('ngưỡng thân LED (game):', bodyLimit('led', 30).toFixed(1), '°C');
prepTip('D16', 350, 20);
let n = events.length;
solder(lj1[0].padId, { pre: 1.0, feed: 0.8, post: 5.2, cool: 6 });
const ov = since(n).filter((e) => e.type === 'solder:overheat' && e.item === led1);
log('LED không kẹp:', JSON.stringify(led1.state.heat), ov.map((e) => e.cause));
ok(ov.length > 0 && led1.state.heatDamage?.level >= 1, `KHÔNG kẹp: 'solder:overheat' {part:${ov[0]?.part}, maxT ${ov[0]?.maxT} °C, ${ov[0]?.seconds} s} → ${led1.state.heatDamage?.label}`);
ok((led1.state.heatDamage?.brightness ?? 1) < 1, `LED hỏng sáng mờ: brightness ${led1.state.heatDamage?.brightness?.toFixed(2)} (power.js nhân vào độ sáng)`);
const clip = game.items.spawn('heatsink-clip', { pos: [100, 800, 0] });
const clipOn = P.setClip(led2, lj2[0].pin, clip);
ok(clipOn && led2.state.heat.clips.includes(lj2[0].pin) && clip.state.free === 1, `kẹp tản nhiệt lên chân ${lj2[0].pin} LED 2 (còn ${clip.state.free}/2 kẹp)`);
n = events.length;
solder(lj2[0].padId, { pre: 1.0, feed: 0.8, post: 5.2, cool: 6 });
log('LED có kẹp:', JSON.stringify(led2.state.heat));
ok(!has(since(n), 'solder:overheat', (e) => e.item === led2) && !(led2.state.heatDamage?.level > 0), `CÓ kẹp: thân LED max ${led2.state.heat.maxT.toFixed(0)} °C < ngưỡng ${bodyLimit('led', 30).toFixed(0)} °C → an toàn`);
// mối LED chuẩn 2,5 s không kẹp → không hỏng
const led3 = place('led-5mm-red', '25,10');
const lj3 = S.partJoints(led3);
solder(lj3[0].padId, { pre: 0.9, feed: 0.7, post: 0.3, cool: 6 });
ok(!(led3.state.heatDamage?.level > 0), `LED hàn đúng 1,9 s/mối (không kẹp): thân max ${led3.state.heat?.maxT?.toFixed(0)} °C → không hỏng`);

// ---------------------------------------------------------------- 4) tụ hoá quá nhiệt → phồng
console.log('\n▶ 4) Tụ hoá 100 µF giữ mũi lâu (Chemi-con 380 °C / 3 s)');
const cap = place('cap-elec-100uf-25v', '30,10');
const cj = S.partJoints(cap);
prepTip('D16', 400, 20);
n = events.length;
solder(cj[0].padId, { pre: 1.0, feed: 0.8, post: 9, cool: 8 });
log('tụ:', JSON.stringify(cap.state.heat), cap.state.heatDamage);
ok(cap.state.heatDamage?.level >= 1 && has(since(n), 'solder:overheat', (e) => e.item === cap), `tụ hoá: ${cap.state.heatDamage?.label} (C ×${cap.state.heatDamage?.cMul}, ESR ×${cap.state.heatDamage?.esrMul})`);
ok(!!cap.object.getObjectByName('heat-fx'), 'hình ảnh: đáy/nắp tụ phồng (heat-fx)');

// ---------------------------------------------------------------- 5) flux cháy thành than → không thấm
console.log('\n▶ 5) Flux cháy: chấm flux rồi giữ mũi 380 °C 8 s không đưa thiếc');
prepTip('D16', 380, 20);
const fp = rec.byId.get('30,40');
const cpf = S.contactPoints(pb, '30,40');
for (let i = 0; i < 40; i++) game.events.emit('flux:applied', { amount: 0.03 / 60, pos: cpf.center.clone().addScaledVector(cpf.normal, 0.3) });
const flux0 = fp.flux;
S.debug = { iron: { tip: S.contactPoints(pb, '30,40', eye(cpf)).iron.clone(), down: true } };
step(8);
S.debug = null; step(2);
log('than:', fp.char.toFixed(3), 'flux', fp.flux.toFixed(3), 'peak', fp.T.toFixed(0));
ok(fp.char > 0.25 && fp.flux < 0.15 * flux0, `flux ${flux0.toFixed(2)} → ${fp.flux.toFixed(3)}, than ${fp.char.toFixed(2)} (cặn nâu/đen)`);
const fr = solder('30,40', { pre: 1.0, feed: 0.8, post: 0.5 });
const fg = P.grade(fr.pad, 2);
log('sau khi cháy:', fr.pad.state, fr.pad.wetting.toFixed(2), fg.defects.map((d) => d.code));
ok(fr.pad.state === 'cold' && fg.defects.some((d) => ['dewetting', 'nonwetting'].includes(d.code)) && fg.defects.some((d) => d.code === 'flux-charred'),
  `đưa thiếc lên than flux: thấm ${Math.round(fr.pad.wetting * 100)} % → ${fg.defects.map((d) => d.code).join(', ')}`);

// ---------------------------------------------------------------- 6) thay mũi: bỏng tay trần, miếng chịu nhiệt, phủ thiếc
console.log('\n▶ 6) Thay mũi nóng (§2.1–2.3)');
prepTip('D16', 350, 30);
n = events.length;
let rm = P.removeTip({ protection: 'bare' });
ok(!rm && iron.state.tip === 'D16' && has(since(n), 'safety:burn', (e) => e.cause === 'hot-tip') && P.stats.tipBurns >= 1, `rút mũi ${Math.round(iron.state.tipTemp)} °C tay trần → "Bỏng!" (safety:burn) — mũi vẫn trên mỏ`);
n = events.length;
rm = P.removeTip({ protection: 'pad' });
const oldTip = rm && rm !== true ? rm : null;
ok(!!oldTip && iron.state.tip == null && oldTip.state.temp > 200 && has(since(n), 'tip:removed', (e) => e.protection === 'pad'), `miếng chịu nhiệt: rút được mũi D16 (${Math.round(oldTip?.state.temp)} °C) → đặt ${since(n).find((e) => e.type === 'tip:removed')?.where}`);
n = events.length;
game.events.emit('item:picked', { item: oldTip });
ok(has(since(n), 'safety:burn'), 'nhặt mũi vừa tháo (còn nóng) bằng tay → bỏng');
// mỏ không mũi → không hàn được
const nt = solder('2,5', { pre: 0.6, feed: 0.3, post: 0.2 });
ok(!has(nt.ev, 'iron:contact'), 'mỏ hàn chưa lắp mũi → không chạm/hàn được');
// lắp mũi mới (nguội) bằng miếng chịu nhiệt, KHÔNG phủ thiếc
const t2 = game.items.spawn('tip-2c', { pos: [60, 760, 0] });
n = events.length;
ok(P.fitTip(t2, { protection: 'pad' }) && iron.state.tip === '2C' && has(since(n), 'tip:inserted'), 'lắp mũi 2C mới (tip:inserted)');
step(150);
log('không phủ thiếc 150 s:', iron.state.oxidation.toFixed(2), iron.state.tinned.toFixed(2), 'wet', iron.def.wetting(iron).toFixed(2));
ok(iron.state.oxidation > 0.6 && iron.def.wetting(iron) < 0.45 && P.stats.untinnedHot >= 1, `KHÔNG phủ thiếc: sau 150 s ở ${Math.round(iron.state.tipTemp)} °C oxy hoá ${iron.state.oxidation.toFixed(2)} → mũi đen, thấm ướt ${iron.def.wetting(iron).toFixed(2)}`);
// lại lắp mũi 2C khác, lần này phủ thiếc ngay khi > 250 °C
P.removeTip({ protection: 'pad' });
const t3 = game.items.spawn('tip-2c', { pos: [70, 760, 0] });
P.fitTip(t3, { protection: 'pad' });
let tinnedAt = null;
for (let i = 0; i < 150 * 60; i++) { game.app.step(1 / 60); if (tinnedAt == null && iron.state.tipTemp > 250) { iron.def.tin(iron, 0.5, game); tinnedAt = i / 60; } }
log('phủ thiếc ngay:', tinnedAt, iron.state.oxidation.toFixed(2), iron.state.tinned.toFixed(2));
ok(tinnedAt != null && iron.state.oxidation < 0.25, `phủ thiếc ngay khi mũi > 250 °C (sau ${tinnedAt?.toFixed(1)} s): 150 s sau oxy hoá chỉ ${iron.state.oxidation.toFixed(2)}`);
// thời gian lên nhiệt theo loại trạm
const heat = (kind) => { const it = game.items.spawn('soldering-iron', { pos: [0, 2000, 0] }); const saved = st.kind; st.kind = kind; st.on = true; st.setpoint = 350; let t = null; for (let i = 0; i < 120 * 20; i++) { it.def.update(it, 1 / 20, game); if (t == null && it.state.tipTemp >= 340) t = i / 20; } st.kind = saved; game.items.remove(it); return t; };
const h936 = heat('936'), h888 = heat('fx888d'), h12 = heat('t12');
log('lên 340 °C:', h936, h888, h12);
ok(h12 < h888 && h888 < h936, `lên 340 °C: T12 ${h12?.toFixed(0)} s < FX-888D ${h888?.toFixed(0)} s < 936 ${h936?.toFixed(0)} s (§1.1, §9)`);
st.kind = undefined;

// ---------------------------------------------------------------- 7) soi: cầu thiếc mảnh chỉ thấy ≥ 7,5–10×
console.log('\n▶ 7) Kiểm tra theo độ phóng đại (§10.1, §13.4)');
prepTip('D16', 340, 10);
const pA = solder('32,10', { pre: 1.0, feed: 0.4, post: 0.3 }).pad;
const pB = solder('32,11', { pre: 1.0, feed: 0.4, post: 0.3 }).pad;
S._addBridge(rec, pA, pB, 'drag');
for (const p of [pA, pB]) { p.state = 'bridge'; p.reworked = false; }
ok(pA._thinBridge?.has(pB._key), 'cầu thiếc MẢNH giữa 45,10 ↔ 45,11 (kéo mũi)');
n = events.length;
game.events.emit('solder:inspected', { pad: pA, magnification: 1.75, by: 'lamp', visible: true });
let rep = since(n).find((e) => e.type === 'solder:graded')?.report;
log('1.75×:', rep?.seen.map((d) => d.code), rep?.missed);
ok(rep && rep.pass && !rep.seen.some((d) => d.code === 'bridge-hairline') && rep.missed >= 1, `1,75× (kính lúp 3 diopter): KHÔNG thấy cầu mảnh → "ĐẠT" (bỏ sót ${rep?.missed} lỗi)`);
n = events.length;
game.events.emit('solder:inspected', { pad: pA, magnification: 10, by: 'microscope', visible: true, quality: pA.state });
rep = since(n).find((e) => e.type === 'solder:graded')?.report;
ok(rep && !rep.pass && rep.seen.some((d) => d.code === 'bridge-hairline'), `10× kính hiển vi: thấy "${DEFECTS['bridge-hairline'].vi}" → KHÔNG ĐẠT`);
n = events.length;
game.events.emit('solder:inspected', { pad: pA, magnification: 10, by: 'microscope', visible: false, reason: 'Ảnh mờ — chỉnh nét (R/F) trước khi đánh giá' });
ok(!has(since(n), 'solder:graded'), 'ảnh mờ (kính hiển vi báo) → không chấm');

// ---------------------------------------------------------------- 8) độ nhô chân sau khi cắt (IPC §5.3)
console.log('\n▶ 8) Độ nhô chân & Class 2/3');
const rp = place('resistor-1k', '26,30', 4);
prepTip('2C', 340, 10);
const rj = S.partJoints(rp);
for (const j of rj) solder(j.padId, { pre: 1.0, feed: 0.8, post: 0.4 });
let g2 = P.grade(rj[0].pad, 2);
ok(g2.defects.some((d) => d.code === 'untrimmed'), `chưa cắt (nhô ${g2.metrics.protrusion} mm) → lỗi "untrimmed" (max 2,5 mm Class 2)`);
const cutAt = (j, keepMm) => { const c = S.contactPoints(pb, j.padId); game.events.emit('cut', { what: 'lead', pos: c.center.clone().addScaledVector(c.normal, 6), keepMm }); };
cutAt(rj[0], 1.0); cutAt(rj[1], 2.0);
step(0.2);
const g20 = P.grade(rj[0].pad, 2), g30 = P.grade(rj[0].pad, 3), g21 = P.grade(rj[1].pad, 2), g31 = P.grade(rj[1].pad, 3);
log('protrusion:', g20.metrics.protrusion, g21.metrics.protrusion, g31.defects.map((d) => d.code));
ok(!g20.defects.some((d) => d.code === 'untrimmed') && !g30.defects.some((d) => d.code === 'untrimmed'), `cắt còn ${g20.metrics.protrusion} mm → đạt cả Class 2 & 3`);
ok(!g21.defects.some((d) => d.code === 'untrimmed') && g31.defects.some((d) => d.code === 'untrimmed'), `cắt còn ${g21.metrics.protrusion} mm → đạt Class 2 (≤ 2,5), KHÔNG đạt Class 3 (≤ 1,5)`);
ok(g20.metrics.angle <= 90 && g20.metrics.secondaryDeg >= 270 && g20.metrics.holeFill >= 0.75, `mối 2C đẹp: góc ${g20.metrics.angle}° · fillet ${g20.metrics.secondaryDeg}° · điền lỗ ${Math.round(g20.metrics.holeFill * 100)} %`);
ok(g30.defects.some((d) => d.code === 'flux-residue' && d.fail) && !g20.defects.some((d) => d.code === 'flux-residue' && d.fail), 'cặn RMA: Class 2 chỉ báo quá trình, Class 3 = lỗi');

// ---------------------------------------------------------------- 9) làm sạch IPA
console.log('\n▶ 9) Làm sạch bằng IPA + bàn chải');
const brush = game.items.spawn('ipa-brush', { pos: [80, 800, 0] });
step(4);
n = events.length;
const cpc = S.contactPoints(pb, rj[0].padId);
for (let i = 0; i < 4 * 60; i++) P.brush(brush, cpc.center, 1 / 60);
ok(rj[0].pad.flux === 0 && has(since(n), 'solder:cleaned') && brush.state.ml < 60, `chà IPA 4 s: hết cặn nhựa thông (IPA còn ${brush.state.ml.toFixed(1)} ml)`);
ok(!P.grade(rj[0].pad, 3).defects.some((d) => d.code === 'flux-residue'), 'sau làm sạch: Class 3 không còn lỗi cặn flux');
ok((rj[0].pad.insp == null) || rj[0].pad.insp.version !== rj[0].pad.version, 'làm sạch → phiếu soi cũ hết hiệu lực (phải soi lại)');

// ---------------------------------------------------------------- 10) lỗi phụ: xáo động, gai, văng, quá nhiệt
console.log('\n▶ 10) Lỗi phụ');
prepTip('D16', 340, 10);
let cp = S.contactPoints(pb, '5,30', eye(S.contactPoints(pb, '5,30')));
S.debug = { iron: { tip: cp.iron.clone(), down: true }, wire: { tip: cp.feed.clone(), down: false } };
step(1.0); S.debug.wire.down = true; step(0.7); S.debug.wire.down = false; step(0.3);
S.debug.iron.down = false; S.debug.iron.tip = cp.iron.clone().addScaledVector(cp.normal, 30);
step(0.05);
n = events.length;
pb.object.position.x += 0.5; pb.object.updateMatrixWorld(true);       // rung bo khi thiếc đang đông
step(3);
pb.object.position.x -= 0.5; pb.object.updateMatrixWorld(true);
S.debug = null; step(0.5);
ok(cp.pad.defects.disturbed && has(since(n), 'solder:disturbed'), 'xê dịch bo 0,5 mm khi thiếc đang đông → mối XÁO ĐỘNG (disturbed)');
// gai: flux cạn rồi rút chậm
const ic = solder('5,34', { pre: 1.0, feed: 0.6, post: 4.5 });
log('gai:', ic.pad.defects, ic.pad.flux.toFixed(3));
ok(ic.pad.defects.icicle || ic.pad.defects.overheated, `giữ mũi 4,5 s sau khi rút thiếc (flux ${ic.pad.flux.toFixed(2)}) → ${ic.pad.defects.icicle ? 'GAI THIẾC' : ''} ${ic.pad.defects.overheated ? 'QUÁ NHIỆT' : ''}`);
// văng thiếc: lau bọt biển ướt rồi đưa thiếc ngay
iron.def.clean(iron, 'sponge', game, null);
const sp = solder('5,38', { pre: 0.6, feed: 0.6, post: 0.3 });
ok(sp.pad.defects.balls > 0 && has(sp.ev, 'solder:spatter'), `vừa lau bọt biển ướt → đưa thiếc: VĂNG ${sp.pad.defects.balls} hạt thiếc`);
// quá nhiệt: giữ > 6 s
const oh = solder('8,40', { pre: 1.0, feed: 0.6, post: 6.5 });
ok(oh.pad.defects.overheated && P.grade(oh.pad).defects.some((d) => d.code === 'overheated'), 'giữ mũi > 6 s → mối QUÁ NHIỆT (xỉn, sần — §13.3)');

// ---------------------------------------------------------------- 11) tụ gốm sốc nhiệt · vỏ nhựa biến dạng
console.log('\n▶ 11) Tụ gốm nứt (sốc nhiệt) · header biến dạng');
const cer = place('cap-ceramic-100nf', '28,5', 2);
const cerj = S.partJoints(cer);
prepTip('D16', 430, 25);
solder(cerj[0].padId, { pre: 1.2, feed: 0.4, post: 0.4 });
log('MLCC:', cer.state.heat);
ok(cer.state.heatDamage?.cracked && cer.state.dead, `mũi ${Math.round(iron.state.tipTemp)} °C lên chân tụ gốm (ΔT > 190 °C, không preheat) → NỨT (dead, mode short)`);
const gcer = P.grade(cerj[0].pad);
const inspCer = P.inspect(cerj[0].pad, 10, 'microscope');
ok(gcer.defects.some((d) => d.code === 'mlcc-crack') && !inspCer.seen.some((d) => d.code === 'mlcc-crack') && P.inspect(cerj[0].pad, 20, 'microscope').seen.some((d) => d.code === 'mlcc-crack'), 'vết nứt MLCC: 10× không thấy, 20× thấy (§13.4)');
const hdr = game.items.spawn('header-male-1x40', { pos: [0, 900, -250] });
hdr.def.breakTo?.(hdr, 4);
game.sockets.insert(hdr, game.sockets.get(`${pb.uid}:15,45`), { instant: true });
S.board(pb).leadsDirty = true;
step(0.1);
n = events.length;
P.onPlasticTouch({ object: hdr.object.children[0] || hdr.object }, 400);
ok(hdr.state.heatDamage?.deformed && has(since(n), 'solder:overheat', (e) => e.item === hdr), 'mũi chạm vỏ nhựa header → vỏ biến dạng');
n = events.length;
const fake = game.items.spawn('jumper-wire-ff', { pos: [0, 950, 0] });
game.events.emit('socket:inserted', { item: fake, socket: { owner: hdr, kind: 'header-female' } });
await new Promise((r) => setTimeout(r, 5));
ok(has(since(n), 'fault', (e) => e.kind === 'mate-fail'), 'cắm dây vào header đã biến dạng → không vào (fault mate-fail)');

// ---------------------------------------------------------------- 12) sleep mode
console.log('\n▶ 12) Sleep mode trên giá');
prepTip('D16', 350, 5);
const holder = new THREE.Object3D(); game.scene.add(holder);
game.sockets.add({ id: 'test-holder', kind: 'iron-holder', object3D: holder, accepts: () => ({ ok: true }), pose: new THREE.Matrix4(), tolerance: { pos: 50, angleDeg: 90 }, occupiedBy: null });
iron.socket = 'test-holder';
step(75);
log('sleep:', iron.state.sleeping, iron.state.tipTemp.toFixed(0));
ok(iron.state.sleeping && iron.state.tipTemp < 230, `cắm giá > 20 s → SLEEP ${Math.round(iron.state.tipTemp)} °C (dưới điểm chảy; JBC: tuổi thọ mũi ×5)`);
iron.socket = null;
step(45);
ok(!iron.state.sleeping && iron.state.tipTemp > 330, `nhấc khỏi giá → lên lại ${Math.round(iron.state.tipTemp)} °C`);

// ---------------------------------------------------------------- 13) QC + thẻ bài học
console.log('\n▶ 13) Biên bản QC + sổ tay');
for (const j of S.partJoints(rp)) P.inspect(j.pad, 2.25, 'lamp');
const qc = P.qcReport(pb);
log('QC:', JSON.stringify({ total: qc.total, insp: qc.inspected, pass: qc.observedPass, true: qc.truePass, d: qc.defects }));
ok(qc.total >= 15 && qc.inspected >= 2 && qc.truePass < qc.total && Object.keys(qc.defects).length >= 6, `QC: ${qc.total} mối · soi ${qc.inspected} · đạt (thật) ${qc.truePass} · ${Object.keys(qc.defects).length} loại lỗi`);
n = events.length;
P.saveQc(pb);
ok(has(since(n), 'solder:qc-report'), "lưu biên bản → 'solder:qc-report'");
let pagesOk = 0, pagesN = 0;
const pages = ['index', 'workflow', 'ipc', 'qc', 'report', ...Object.keys(TIPS).map((c) => `tip:${c}`), ...Object.keys(DEFECTS).map((c) => `defect:${c}`), ...Object.keys(COMPONENTS).map((c) => `comp:${c}`), 'lesson:temperature', 'lesson:tipcare', 'lesson:tipchange', 'lesson:cleaning', 'lesson:magnification', 'lesson:heatsink'];
for (const pg of pages) { pagesN++; try { const h = P.cards.render(pg); if (h.length > 80 && !/undefined|NaN/.test(h)) pagesOk++; else log('trang lỗi', pg, h.slice(0, 200)); } catch (e) { log('trang lỗi', pg, e); } }
ok(pagesOk === pagesN, `sổ tay: ${pagesOk}/${pagesN} trang dựng được (mũi, lỗi, linh kiện, IPC, phóng đại, quy trình, QC)`);
const tipCard = P.cards.render('tip:2C');
ok(/2C/.test(tipCard) && /\[V\]/.test(tipCard) && /\[TK/.test(tipCard) && /THT/.test(tipCard), 'thẻ "phân tích mũi 2C": công dụng, ưu/nhược, số liệu kèm nhãn [V]/[TK]');
const nq = events.length;
P.cards.quiz({ id: 't', question: 'Nhiệt độ?', options: ['250', '340', '450'], correct: 1 }, () => {});
P.cards._answer(1);
ok(has(since(nq), 'solder:quiz', (e) => e.correct), "câu hỏi trắc nghiệm → 'solder:quiz' {correct}");
P.cards.close();
ok(!game.app.uiMode, 'đóng sổ tay trả lại điều khiển');

// ---------------------------------------------------------------- 14) nhiệm vụ "Thợ hàn chuyên nghiệp"
console.log('\n▶ 14) Nhiệm vụ m1b-ky-thuat-vien');
const Q = game.quests;
const m1b = Q.defs.get('m1b-ky-thuat-vien');
ok(!!m1b && !m1b.mission && !m1b.autoStart && !(m1b.requires || []).length && m1b.steps.length === 17, `đăng ký: ${m1b?.steps.length} bước (quy trình 14 bước §11), ngoài chuỗi m0–m6`);
Q.start('m1b-ky-thuat-vien', { force: true });
step(0.5);
const L = labState(game);
L.esd = { worn: true }; L.fume.on = true; L.lamp.on = true;
step(0.6);
ok(Q.progress('m1b-ky-thuat-vien')?.step >= 1, 'bước 1: ESD + hút khói + đèn');
P.openCard('workflow'); P.cards.close(); step(0.6);
ok(Q.progress('m1b-ky-thuat-vien')?.step >= 2, 'bước 2: mở quy trình 14 bước trong sổ tay');
P.inspect(rec.byId.get('1,1'), 2.25, 'lamp'); step(0.6);
ok(Q.progress('m1b-ky-thuat-vien')?.step >= 3, 'bước 3: soi bo trần trên kẹp mạch');
step(1.0);
await new Promise((r) => setTimeout(r, 450));
ok(P.cards.quizState && !P.cards.quizState.answered, 'bước 4: câu hỏi nhiệt độ tự hiện');
P.cards._answer(1); P.cards.onKey({ code: 'Enter', down: true }); st.on = true; st.setpoint = 340; step(0.6);
ok(Q.progress('m1b-ky-thuat-vien')?.step >= 4, 'trả lời đúng 330–350 °C + đặt trạm 340 °C → qua bước 4');
const sc1b = m1b.scoring(Q.progress('m1b-ky-thuat-vien'));
log('điểm m1b:', sc1b.score, sc1b.notes);
ok(typeof sc1b.score === 'number' && sc1b.notes.some((x) => /IPC-A-610/.test(x)), `chấm điểm: ${sc1b.score} — ${sc1b.notes.find((x) => /IPC/.test(x))}`);
Q.stop?.('m1b-ky-thuat-vien');

// ---------------------------------------------------------------- lưu / tải
const data = S.serialize();
const any = Object.values(data.boards[pb.uid].pads).find((a) => a[8]?.c > 0.2);
ok(!!any, 'serialize: lưu than flux / lỗi phụ / mũi đã dùng theo pad');

// ---------------------------------------------------------------- hiệu năng
const cpp = S.contactPoints(pb, '33,50');
S.debug = { iron: { tip: cpp.iron, down: true }, wire: { tip: cpp.feed, down: true } };
const t0 = performance.now();
for (let i = 0; i < 300; i++) S.fixedUpdate(1 / 60);
const ms = (performance.now() - t0) / 300;
S.debug = null;
ok(ms < 1.5, `soldering.fixedUpdate (+pro) ${ms.toFixed(3)} ms/bước`);

console.error = origErr;
if (consoleErrors) { console.log(`  ✗ có ${consoleErrors} console.error`); fails++; }
console.log(`\n${passes} đạt, ${fails} lỗi`);
process.exit(fails ? 1 : 0);
