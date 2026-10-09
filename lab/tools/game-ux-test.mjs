// Kiểm tra HỆ UX TƯƠNG TÁC (engine/ux/*) không cần trình duyệt:
//   node tools/game-ux-test.mjs [--verbose]
// Dựng phòng lab thật + registry thật rồi kiểm:
//   1) gợi ý nổi: ghế "E Ngồi", ngăn kéo "E Mở ngăn kéo", dụng cụ trên bàn "E Lấy" · chế độ Gọn / Tắt · mẹo lần đầu
//   2) thanh hành động: cầm mỏ hàn + thiếc nhìn pad → "Giữ LMB Hàn · RMB Mớm thiếc · Q Cất" · núm trạm hàn → "Cuộn Chỉnh nhiệt độ"
//      · thùng rác tay không → E mờ kèm lý do
//   3) ngồi / đứng: mắt 1150 mm sát bàn, không đi được, nón nhìn, ghế kéo vào, đứng dậy chỗ không va chạm, Space / E
//   4) con trỏ tỉ mỉ lái MỎ HÀN hàn một pad trên board đục lỗ (kẹp mạch) → 'solder:joint'
//   5) con trỏ tỉ mỉ cắm dây Dupont vào 2 lỗ breadboard → 'wire:connected'
//   6) kính hiển vi: vào khi ngồi, con trỏ trên mặt phẳng tiêu cự, đánh giá mối hàn (cần đủ phóng đại / nét) → 'solder:inspected'
//   7) laptop · xem gần bảng trắng · thùng rác · hộp linh kiện · lưu/tải (không lưu tư thế ngồi, cài đặt tỉ mỉ được lưu)
import { readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { createGame } from '../src/game/main.js';
import { labState } from '../src/game/world/_labState.js';
import { miniMarkdown } from '../src/game/engine/ux/laptop.js';
import { MIN_MAG } from '../src/game/engine/ux/microscope.js';
import { STORAGE_KEY } from '../src/game/engine/quality.js';

const VERBOSE = process.argv.includes('--verbose');
const ROOT = fileURLToPath(new URL('../src/game/', import.meta.url));
let fails = 0, passes = 0;
const ok = (cond, msg, detail = '') => { if (cond) { passes++; console.log('  ✓', msg, detail ? `— ${detail}` : ''); } else { fails++; console.log('  ✗', msg, detail ? `— ${detail}` : ''); } return cond; };
const log = (...a) => { if (VERBOSE) console.log('    ·', ...a); };
const f1 = (v) => (typeof v === 'number' ? v.toFixed(1) : String(v));

function memoryStorage() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; }
async function loadRegistry() {
  const reg = await import(pathToFileURL(join(ROOT, 'items/registry.js')).href);
  const record = {};
  for (const sub of ['tools', 'parts']) {
    const dir = join(ROOT, 'items', sub);
    if (!existsSync(dir)) continue;
    for (const fn of readdirSync(dir)) {
      const p = join(dir, fn);
      if (!fn.endsWith('.js') || statSync(p).isDirectory()) continue;
      try { record[`./${sub}/${fn}`] = await import(pathToFileURL(p).href); } catch (e) { if (!fn.startsWith('_')) console.log(`  ! không nạp được items/${sub}/${fn}: ${e.message}`); }
    }
  }
  reg.registerItemModules?.(record);
  return reg;
}

const origErr = console.error;
let consoleErrors = 0;
console.error = (...a) => { consoleErrors++; origErr('  [console.error]', ...a); };

const t0 = Date.now();
const storage = memoryStorage();
const reg = await loadRegistry();
const worldModule = await import(pathToFileURL(join(ROOT, 'world/labRoom.js')).href);
const game = await createGame({ headless: true, storage, worldModule, registryModule: reg });
game.app.locked = true; game.started = true; game.app.setPaused(false);
game.quality.set('benchMode', false);   // các mục dưới kiểm tra chế độ NGỒI góc nhìn thứ nhất (bàn 3D: tools/game-bench-test.mjs)
const step = (n = 1) => { for (let i = 0; i < n; i++) game.app.step(1 / 60); };
const sec = (s) => step(Math.round(s * 60));
const events = [];
game.events.on('*', (e) => { if (!e.type.startsWith('input:') && e.type !== 'footstep') events.push(e); });
const since = (n) => events.slice(n);
const key = (code, down = true, extra = {}) => game.events.emit('input:key', { code, key: code, down, repeat: false, shift: false, ctrl: false, ...extra });
const mouse = (button, down) => game.events.emit('input:mouse', { button, down });
const hold = (code, s) => { game.app.input.keys.add(code); sec(s); game.app.input.keys.delete(code); };
const lookAt = (p) => { const e = game.camera.getWorldPosition(new THREE.Vector3()); const d = p.clone().sub(e); game.player.yaw = Math.atan2(-d.x, -d.z); game.player.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); };
step(5);

const ux = game.ux;
const I = game.interact;
console.log('\n▶ 0) Khởi tạo');
ok(!!ux, 'game.ux được tạo (main.js)');
const seats = ux?.seating.seats || [];
ok(seats.length >= 4, `tìm thấy ${seats.length} chỗ ngồi`, seats.map((s) => `${s.id}${s.bench ? `@${s.bench.name}` : ''}`).join(', '));
ok(seats.filter((s) => s.bench).length >= 3, 'mỗi bàn (hàn / đo / lắp ráp) có ghế');
ok(!!ux.microscope.root, `kính hiển vi sẵn sàng (${ux.microscope.cad ? 'CAD phòng lab' : 'mô hình dự phòng'})`);
ok(ux.microscope.focal.y > 760 && ux.microscope.focal.y < 950, `tiêu điểm kính trên mặt bàn hàn (y=${f1(ux.microscope.focal.y)})`);

// ============================================================ 1) gợi ý nổi
console.log('\n▶ 1) Gợi ý phím nổi');
const chairSolder = ux.seating.get('bench-solder');
ok(!!chairSolder, 'ghế bàn hàn');
const pp = ux.hints.primaryPrompt(chairSolder.object);
ok(pp?.key === 'E' && pp.label === 'Ngồi' && pp.icon === '🪑', `ghế → chip "${pp?.icon} ${pp?.key} ${pp?.label}"`);
game.player.teleport([-2900, 0, -1900], 0, -0.3);
step(3);
let chips = ux.hints.compute();
log('chips ghế:', chips.map((c) => `${c.key} ${c.label} (${(c.dist / 1000).toFixed(1)} m)`).join(' | '));
ok(chips.some((c) => c.object === chairSolder.object && c.key === 'E' && c.label === 'Ngồi'), 'đứng cách ghế ~1 m, hướng mặt tới → có chip "E Ngồi"');
ok(chips.length <= 6, `tối đa 6 chip (${chips.length})`);
// ngăn kéo
const drawerObj = [...I.objects].find((o) => /^Ngăn /.test(String((() => { try { return o.userData.interactSpec.name(); } catch { return o.userData.interactSpec?.name; } })())));
ok(!!drawerObj, 'tủ ngăn kéo có trong danh sách tương tác');
const dp = drawerObj && ux.hints.primaryPrompt(drawerObj);
ok(dp?.key === 'E' && /ngăn kéo/i.test(dp.label), `ngăn kéo → chip "${dp?.icon} ${dp?.key} ${dp?.label}"`);
const dpos = drawerObj.getWorldPosition(new THREE.Vector3());
game.player.teleport([dpos.x + 1100, 0, dpos.z], Math.PI / 2, -0.15);
step(3);
lookAt(dpos.clone().add(new THREE.Vector3(0, 300, 0)));
step(2);
chips = ux.hints.compute();
log('chips tủ:', chips.map((c) => `${c.key} ${c.label}`).join(' | '));
ok(chips.some((c) => c.key === 'E' && /Mở ngăn kéo/.test(c.label)), 'đứng trước tủ → chip "E Mở ngăn kéo"');
const drawerChips = chips.filter((c) => /ngăn kéo/i.test(c.label)).length;
ok(drawerChips <= 3, `dãy ngăn kéo được gộp (${drawerChips} chip)`);
// dụng cụ trên bàn hàn
game.player.teleport([-3330, 0, -2700], 0, -0.55);
step(3);
chips = ux.hints.compute();
log('chips bàn hàn:', chips.map((c) => `${c.key} ${c.label} ${c.item?.def.id || ''}`).join(' | '));
ok(chips.some((c) => c.item && c.item.def.kind === 'tool' && c.key === 'E' && c.label === 'Lấy'), 'dụng cụ trên bàn → chip "E Lấy"');
ok(chips.some((c) => /Trạm hàn|nhiệt|Bật/i.test(c.label) || c.icon === '🔥'), 'trạm hàn có chip');
// chế độ gọn / tắt
game.quality.set('hints', 'compact');
const cc = ux.hints.compute();
ok(cc.length <= 3, `Gọn → ≤ 3 chip (${cc.length})`);
game.quality.set('hints', 'off');
ux.hints._t = 0; ux.update(1 / 60);
ok(ux.hints.list.length === 0, 'Tắt → không chip');
game.quality.set('hints', 'full');
// mẹo lần đầu
const tip1 = ux.hints.showTipOnce('vise');
const tip2 = ux.hints.showTipOnce('vise');
ok(tip1 && !tip2 && game.quality.settings.tipsSeen.includes('vise'), 'mẹo lần đầu chỉ hiện 1 lần, nhớ trong cài đặt');

// ============================================================ 2) thanh hành động
console.log('\n▶ 2) Thanh hành động theo ngữ cảnh');
const stProp = game.world.props['soldering-station'];
const stSpec = stProp.interact.find((x) => x.spec.onScroll);
I.target = { object: stSpec.object, spec: stSpec.spec, chain: [stSpec.spec], item: null, hit: { point: stSpec.object.getWorldPosition(new THREE.Vector3()), object: stSpec.object }, inReach: true };
let pr = I._collectPrompts();
log('trạm hàn:', pr.map((p) => `${p.key}:${p.label}`).join(' · '));
ok(pr.some((p) => p.key === 'WHEEL' && p.label === 'Chỉnh nhiệt độ'), 'núm trạm hàn → "Cuộn  Chỉnh nhiệt độ"');
ok(pr.some((p) => p.key === 'E'), 'trạm hàn → E bật/tắt');
// thùng rác tay không
const trash = ux.context.registered.find((o) => o.name === 'ux-trash-proxy');
ok(!!trash, 'thùng rác đăng ký tương tác');
I.target = { object: trash, spec: trash.userData.interactSpec, chain: [trash.userData.interactSpec], item: null, hit: { point: trash.position.clone(), object: trash }, inReach: true };
pr = I._collectPrompts();
const tE = pr.find((p) => p.key === 'E');
ok(tE?.disabled && /Cầm vật/.test(tE.reason), `thùng rác, tay không → E mờ: "${tE?.label}" (${tE?.reason})`);
I.target = null;

// ============================================================ 3) ngồi / đứng
console.log('\n▶ 3) Ngồi ghế · đứng dậy');
game.player.teleport([-2900, 0, -2420], 0, 0);
step(3);
const chairStart = chairSolder.object.position.clone();
lookAt(chairSolder.object.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 450, 0)));
step(3);
ok(I.target?.object === chairSolder.object, `nhìn ghế → mục tiêu tương tác là ghế (${I.target?.spec ? (typeof I.target.spec.name === 'function' ? I.target.spec.name() : I.target.spec.name) : '—'})`);
const barP = I._collectPrompts();
log('nhìn ghế:', I.target?.inReach, barP.map((p) => `${p.key}:${p.label}${p.disabled ? '(x)' : ''}`).join(' · '), 'hit', I.hit?.point?.toArray().map((v) => v.toFixed(0)).join(','));
ok(barP.some((p) => p.key === 'E' && p.label === 'Ngồi'), 'thanh hành động: "E Ngồi"');
key('KeyE');
step(40);
ok(ux.seating.seated === chairSolder, 'E → đang ngồi ghế bàn hàn');
ok(game.player.rig?.lockMove && game.player.rig.name === 'seat', 'khung nhìn ngồi (khoá đi lại)');
const eye = game.camera.getWorldPosition(new THREE.Vector3());
ok(Math.abs(eye.y - 1150) < 40, `mắt khi ngồi ${f1(eye.y)} mm (≈ 1150)`);
const edgeZ = -3600 + 400;
ok(eye.z - edgeZ < 420 && eye.z - edgeZ > 120, `mắt sát mép bàn (${f1(eye.z - edgeZ)} mm)`);
ok(chairSolder.dist < 330, `ghế kéo sát bàn (tâm ghế cách mép ${f1(chairSolder.dist)} mm)`);
const pos0 = game.player.pos.clone();
hold('KeyA', 0.4);
ok(game.player.pos.distanceTo(pos0) < 1, 'giữ A khi ngồi → không đi (chỉ nghiêng người)');
game.player.yaw += 2.5;
step(2);
let dy = Math.atan2(Math.sin(game.player.yaw - chairSolder.yawCenter), Math.cos(game.player.yaw - chairSolder.yawCenter));
ok(Math.abs(dy) <= 1.26, `nón nhìn: quay quá đà bị giới hạn (lệch ${f1(THREE.MathUtils.radToDeg(dy))}°)`);
game.player.yaw = chairSolder.yawCenter; game.player.pitch = -0.6;
const d0 = chairSolder.dist;
hold('KeyS', 0.5);
ok(chairSolder.dist > d0 + 100, `giữ S → kéo ghế ra (${f1(d0)} → ${f1(chairSolder.dist)} mm)`);
hold('KeyW', 0.6);
ok(chairSolder.dist < d0 + 30, `giữ W → kéo ghế vào (${f1(chairSolder.dist)} mm)`);
const fov0 = game.camera.fov;
key('KeyZ'); step(30);
ok(ux.seating.zoom && game.camera.fov < fov0 - 10, `Z → kính lúp (FOV ${f1(fov0)} → ${f1(game.camera.fov)}°)`);
key('KeyZ'); step(30);
const nSit = events.length;
key('Space');
step(30);
ok(!ux.seating.seated && !game.player.rig, 'Space → đứng dậy');
ok(ux.seating._isFree(game.player.pos.x, game.player.pos.z), `đứng dậy ở chỗ không va chạm (${f1(game.player.pos.x)}, ${f1(game.player.pos.z)})`);
ok(Math.abs(game.camera.getWorldPosition(new THREE.Vector3()).y - 1650) < 40, 'mắt về lại 1650 mm');
ok(since(nSit).some((e) => e.type === 'player:stand'), "phát 'player:stand'");
ok(chairSolder.collider && Math.abs((chairSolder.collider.min.z + chairSolder.collider.max.z) / 2 - chairSolder.object.position.z) < 1, 'hộp va chạm ghế đi theo ghế');
// ngồi lại bằng API + E đứng dậy khi không nhìn gì có phím E
ux.seating.sit(chairSolder); step(10);
game.player.pitch = 0.4; step(3);   // nhìn lên tường: không có hành động E nào
const eP = I._collectPrompts().find((p) => p.key === 'E');
ok(eP?.label === 'Đứng dậy', `ngồi, không nhìn gì → thanh hành động có "E ${eP?.label}"`);
key('KeyE'); step(10);
ok(!ux.seating.seated, 'E → đứng dậy');
// ghế đẩu (không có bàn)
const stool = seats.find((s) => s.kind === 'stool');
if (stool) { ok(ux.seating.sit(stool), 'ngồi ghế đẩu khu thử robot'); key('Tab'); ok(!ux.precision.active, 'ghế đẩu: Tab không bật tỉ mỉ (không có bàn)'); ux.seating.stand(); step(5); }
// R: kéo ghế ra / đẩy vào khi đứng
const dR = chairSolder.dist;
ux.seating.togglePull(chairSolder); step(40);
ok(Math.abs(chairSolder.dist - dR) > 100, `R trên ghế → kéo / đẩy ghế (${f1(dR)} → ${f1(chairSolder.dist)} mm)`);

// ============================================================ 4) con trỏ tỉ mỉ → hàn 1 pad
console.log('\n▶ 4) Chế độ tỉ mỉ lái mỏ hàn trên board đục lỗ');
const S = game.soldering;
const vise = game.world.props.vise;
const viseSock = game.sockets.get('vise');
let pb = game.items.all.find((i) => i.def.id === 'perfboard-9x15');
if (!pb) pb = game.items.spawn('perfboard-9x15', { pos: [-2880, 900, -3440] });
game.sockets.insert(pb, viseSock, { instant: true });
ok(viseSock.occupiedBy === pb, 'board đục lỗ kẹp vào kẹp mạch bàn hàn');
vise.interact[0].spec.prompts[0].do();      // lật bo: mặt hàn lên
sec(3);
const n0 = new THREE.Vector3();
S.padWorld(S.board(pb), S.board(pb).byId.get('10,20'), new THREE.Vector3(), n0);
ok(n0.y > 0.95, 'lật bo: mặt hàn hướng lên');
const res = game.items.spawn('resistor-10k', { pos: [-2880, 950, -3300] });
res.def.bendLeads?.(res, 4);
game.sockets.insert(res, game.sockets.get(`${pb.uid}:10,20`), { instant: true });
sec(0.8);
ok(S.partJoints(res).length === 2, 'điện trở xuyên 2 pad', `socket=${res.socket}`);
const st = labState(game).station;
st.on = true; st.setpoint = 350;
const ironT = game.inventory.slots.findIndex((t) => t?.def.id === 'soldering-iron');
const wireT = game.inventory.slots.findIndex((t) => t?.def.id === 'solder-wire');
const iron = game.inventory.slots[ironT];
// ngồi + cầm mỏ hàn (phải) + thiếc (trái)
ux.seating.stand(); step(2);
ux.seating.sit(chairSolder); step(40);
game.inventory.select(ironT); game.inventory.select(wireT); step(30);
ok(game.inventory.rightTool?.def.id === 'soldering-iron' && game.inventory.leftTool?.def.id === 'solder-wire', 'cầm mỏ hàn (phải) + thiếc (trái)');
sec(70);   // mũi nóng theo trạm
ok(iron.state.tipTemp > 320, `mũi hàn nóng ${f1(iron.state.tipTemp)} °C`);
key('Tab'); step(2);
ok(ux.precision.active && I.pointerRay?.camera === game.camera, 'Tab → chế độ tỉ mỉ (tia qua con trỏ)');
const cp = S.contactPoints(pb, '10,20');
lookAt(cp.center); sec(1);
ux.precision.aimAt(cp.center); step(6);
const P = I.pointer;
const pname = (o) => { const n = []; for (let x = o; x && n.length < 4; x = x.parent) n.push(x.name || x.type); return n.join('<'); };
log('con trỏ:', P.point?.toArray().map((v) => v.toFixed(1)).join(','), pname(P.object), 'pad', cp.center.toArray().map((v) => v.toFixed(1)).join(','));
ok(P.active && P.point && P.point.distanceTo(cp.center) < 2.0, `con trỏ trên pad 10,20 (lệch ${f1(P.point?.distanceTo(cp.center))} mm)`);
// rê chuột thật: con trỏ dịch đi rồi quay lại
const ndc0 = ux.precision.ndc.clone();
game.app.input._dx = 40; step(1);
ok(ux.precision.ndc.x > ndc0.x + 0.02 && Math.abs(game.player.yaw - chairSolder.yawCenter) < 1.3, 'rê chuột → con trỏ di chuyển, đầu không quay');
ux.precision.aimAt(cp.center); step(3);
// prompts khi cầm mỏ hàn + nhìn pad
pr = I._collectPrompts();
log('cầm mỏ hàn:', pr.map((p) => `${p.hold ? 'giữ ' : ''}${p.key}:${p.label}${p.src ? `[${p.src}]` : ''}`).join(' · '));
ok(pr.some((p) => p.key === 'LMB' && p.label === 'Hàn' && p.hold && p.src === 'hand'), 'thanh hành động: "Giữ LMB  Hàn" (trên tay)');
ok(pr.some((p) => p.key === 'RMB' && /Mớm thiếc/.test(p.label)), 'thanh hành động: "Chuột phải  Mớm thiếc"');
ok(pr.some((p) => p.key === 'Q' && /Cất/.test(p.label)), 'thanh hành động: "Q  Cất dụng cụ"');
ok(pr.some((p) => p.key === 'WHEEL' && /mũi/.test(p.label)), 'thanh hành động: "Cuộn  Nâng / hạ mũi"');
// cuộn = độ cao mũi
const h0 = ux.precision.height;
game.events.emit('input:wheel', { delta: -1 });
ok(ux.precision.height === h0 + 2, `cuộn → mũi cao ${h0} → ${ux.precision.height} mm`);
game.events.emit('input:wheel', { delta: 1 });
sec(0.8);
const tipHover = game.hands.right.tipWorldPosition(new THREE.Vector3());
ok(tipHover.distanceTo(cp.center) < 25, `mũi hàn bay theo con trỏ (cách pad ${f1(tipHover.distanceTo(cp.center))} mm, cao ${ux.precision.height} mm)`);
// hàn: giữ LMB 1.6 s → giữ RMB (mớm thiếc) 0.8 s → nhả → nhấc
const nS = events.length;
mouse(0, true);
sec(1.6);
const touched = since(nS).some((e) => e.type === 'iron:contact' && e.padId === '10,20') || S.contact?.pad?.id === '10,20';
ok(touched, `giữ LMB → mũi chạm pad 10,20 (T pad ${f1(S.board(pb).byId.get('10,20').T)} °C)`);
mouse(2, true); sec(0.8); mouse(2, false);
sec(0.5);
mouse(0, false);
sec(3);
const je = since(nS).filter((e) => e.type === 'solder:joint' && e.padId === '10,20').pop();
ok(!!je, `con trỏ tỉ mỉ hàn được mối 10,20 → 'solder:joint' (${je?.quality})`, je?.issues?.join('; ') || '');

// ============================================================ 6) kính hiển vi (trước khi rời bàn hàn)
console.log('\n▶ 6) Kính hiển vi soi mạch');
const M = ux.microscope;
ok(M.canEnter().ok, 'đang ngồi bàn hàn → được nhìn qua kính');
const mp = I._collectPrompts();
key('Tab'); step(2);    // tắt tỉ mỉ để kiểm tra kính tự bật
ok(!ux.precision.active, 'Tab → tắt tỉ mỉ');
ok(M.enter(), 'vào kính hiển vi');
step(3);
ok(game.app.viewCamera === M.cam && ux.precision.active && I.pointerRay?.camera === M.cam, 'camera quang học + con trỏ tỉ mỉ trong kính');
const pad = S.board(pb).byId.get('10,20');
const pc = S.padWorld(S.board(pb), pad, new THREE.Vector3());
M.pan.set(pc.x - M.focal.x, pc.z - M.focal.z);
step(2);
const padDepth = () => M.cam.position.y - pc.y;
M.focusD = padDepth();
M.setMag(7); step(2);
ux.precision.aimAt(pc); step(3);
log('con trỏ kính:', I.pointer.point?.toArray().map((v) => v.toFixed(1)).join(','), pname(I.pointer.object), 'pad', pc.toArray().map((v) => v.toFixed(1)).join(','), 'cam', M.cam.position.toArray().map((v) => v.toFixed(1)).join(','));
const dxz = I.pointer.point ? Math.hypot(I.pointer.point.x - pc.x, I.pointer.point.z - pc.z) : 99;
ok(dxz < 1.2, `con trỏ trong kính trúng pad / chân linh kiện (lệch ngang ${f1(dxz)} mm)`);
ok(M.field > 25 && M.field < 30, `7× → trường nhìn Ø ${f1(M.field)} mm`);
let nI = events.length;
key('KeyI');
let ie = since(nI).find((e) => e.type === 'solder:inspected');
const need = MIN_MAG[pad.state] ?? 10;
ok(!!ie && ie.pad === pad, `I → 'solder:inspected' pad ${ie?.padId} (thật: ${ie?.quality})`, ie?.reason || '');
ok(ie && (need > 7 ? ie.observed === 'unknown' && /phóng đại/.test(ie.reason) : ie.observed === pad.state), `7×: ${need > 7 ? 'chưa đủ phóng đại → unknown' : 'thấy được'} (cần ≥ ${need}×)`);
// phóng to, làm mờ → không đánh giá được
M.setMag(25); M.focusD = padDepth() + 4; step(2);
nI = events.length; key('KeyI');
ie = since(nI).find((e) => e.type === 'solder:inspected');
ok(ie?.observed === 'unknown' && /mờ/.test(ie.reason), `25× nhưng lệch nét 4 mm → "${ie?.reason}"`);
ok(Math.abs(padDepth() - M.focusD) > 3, `mặt phẳng nét lệch mặt pad ${f1(M.focusD - padDepth())} mm`);
// chỉnh nét bằng R/F (giữ)
const fd0 = M.focusD;
hold('KeyR', 0.5);
ok(M.focusD < fd0, `giữ R → chỉnh nét (${f1(fd0)} → ${f1(M.focusD)} mm)`);
M.focusD = padDepth(); step(2);
nI = events.length; key('KeyI');
ie = since(nI).find((e) => e.type === 'solder:inspected');
ok(ie?.visible && ie.observed === pad.state, `25× + nét → thấy "${ie?.observed}" (đúng chất lượng thật)`);
ok(M.marks.some((m) => m.pad === pad), 'mối hàn được đánh dấu trong ảnh kính');
game.events.emit('input:wheel', { delta: -1 });
ok(M.mag > 25, `cuộn → độ phóng đại ${f1(M.mag)}×`);
const L0 = M.light; key('KeyL'); ok(M.light !== L0, `L → đèn vòng ${Math.round(L0 * 100)} → ${Math.round(M.light * 100)} %`);
// hàn dưới kính: mũi dụng cụ thấy trong ảnh
sec(0.6);
const tipV = game.hands.right.tipWorldPosition(new THREE.Vector3()).project(M.cam);
ok(Math.abs(tipV.x) < 1 && Math.abs(tipV.y) < 1 && tipV.z < 1, `mũi hàn nằm trong khung ảnh kính (ndc ${f1(tipV.x)}, ${f1(tipV.y)})`);
key('KeyE'); step(3);
ok(!M.active && game.app.viewCamera === null, 'E → rời kính');
ok(ux.seating.seated === chairSolder, 'rời kính vẫn đang ngồi');
const usb = M.usb;
ok(!!usb.screen && (usb.external || !!usb.cam), `kính USB có màn hình (${usb.external ? 'prop CAD tự vẽ RenderTarget' : 'UX vẽ RenderTarget'})`);
ux.seating.stand(); step(5);
ok(!M.canEnter().ok && /Ngồi/.test(M.canEnter().reason), `đứng → "${M.canEnter().reason}"`);
game.inventory.select(-1); step(30);

// ============================================================ 5) con trỏ tỉ mỉ → cắm dây breadboard
console.log('\n▶ 5) Chế độ tỉ mỉ cắm dây Dupont vào breadboard');
const chairAsm = ux.seating.get('bench-assembly');
ok(!!chairAsm, 'ghế bàn lắp ráp');
chairAsm.computeFrame();
const bbPos = chairAsm.edge.clone().addScaledVector(chairAsm.normal, 260).setY(752);
const bb = game.items.spawn('breadboard-830', { pos: bbPos.toArray(), rotY: chairAsm.yawCenter, drop: true });
sec(0.6);
const jw = game.items.spawn('jumper-wire-mm', { pos: [bbPos.x + 200, 760, bbPos.z] });
sec(0.3);
ux.seating.sit(chairAsm); sec(1);
ok(ux.seating.seated === chairAsm, 'ngồi bàn lắp ráp');
I.pick(jw); step(5);
ok(jw.heldBy === 'right', 'cầm dây Dupont đực-đực');
key('Tab'); sec(1);
ok(ux.precision.active, 'Tab → tỉ mỉ');
const NL = game.netlist;
const holeW = (id) => NL.posOf({ kind: 'bb', uid: bb.uid, hole: id }, new THREE.Vector3());
lookAt(holeW('g40')); sec(0.5);
ux.precision.aimAt(holeW('g40')); step(4);
const pk = game.wiring.peek(jw);
log('breadboard:', bb.object.position.toArray().map((v) => v.toFixed(0)).join(','), 'g40', holeW('g40')?.toArray().map((v) => v.toFixed(1)).join(','), 'con trỏ', I.pointer.point?.toArray().map((v) => v.toFixed(1)).join(','), pname(I.pointer.object), 'inReach', I.target?.inReach);
ok(pk?.ok && pk.att.hole === 'g40', `con trỏ trên lỗ → "${pk?.label || pk?.reason}"`);
pr = I._collectPrompts();
ok(pr.some((p) => p.key === 'LMB' && /Cắm/.test(p.label)), 'thanh hành động: "LMB Cắm đầu dây"');
mouse(0, true); step(1); mouse(0, false); step(3);
ok(jw.state.cable?.ends?.A?.hole === 'g40', 'LMB → đầu A vào g40');
ux.precision.aimAt(holeW('g44')); step(4);
const nW = events.length;
mouse(0, true); step(1); mouse(0, false); step(5);
ok(jw.state.cable?.ends?.B?.hole === 'g44' && since(nW).some((e) => e.type === 'wire:connected' && e.item === jw), "LMB → đầu B vào g44 → 'wire:connected'");
key('Tab'); step(2);
ux.seating.stand(); step(5);

// ============================================================ 7) laptop · xem gần · thùng rác · hộp linh kiện · lưu
console.log('\n▶ 7) Laptop · bảng trắng · thùng rác · hộp linh kiện · lưu/tải');
const lap = ux.laptop;
ok(lap.lessons().length >= 10 && lap.lessons().every((l) => l.url.startsWith('./index.html#/c/')), `laptop: ${lap.lessons().length} bài học Lab 3D`);
ok(lap.docs().length >= 6, `laptop: ${lap.docs().length} tài liệu docs/*.md`);
lap.open();
ok(game.app.uiMode === 'laptop' && ux.mode === 'laptop', 'mở laptop → app.uiMode = laptop');
lap.close();
ok(!game.app.uiMode, 'đóng laptop');
ok(/<h1>A<\/h1>[\s\S]*<li>b<\/li>[\s\S]*<b>c<\/b>/.test(miniMarkdown('# A\n- b\n\n**c**')), 'miniMarkdown: tiêu đề / danh sách / đậm');
const lapSpec = game.world.anchors.laptop.userData.interactSpec;
ok(lapSpec.prompts.some((p) => p.key === 'E' && /laptop/i.test(p.label)), 'laptop có hành động "E Mở laptop"');
const wb = game.world.anchors.whiteboard;
const wbp = wb.getWorldPosition(new THREE.Vector3());
game.player.teleport([wbp.x, 0, wbp.z - 1300], Math.PI, 0); step(3);
ok(ux.focus.enter(wb, { dist: 1500, name: 'Bảng trắng' }) && game.player.rig?.name === 'focus', 'bảng trắng: E → xem gần');
key('KeyW'); step(5);
ok(Math.abs(game.player.pos.z - (wbp.z - 1300)) < 1, 'xem gần: không đi được');
key('Space'); step(5);
ok(!ux.focus.active && !game.player.rig, 'Space → thôi xem');
ok(game.world.anchors['poster-pinout'].userData.interactSpec.prompts.some((p) => /Đọc/.test(p.label)), 'poster sơ đồ chân: "E Đọc poster"');
// hộp linh kiện + thùng rác
const binObj = ux.context.registered.find((o) => o.name === 'shelf-bins');
ok(!!binObj && ux.context.binPool?.length > 0, `hộp linh kiện trên kệ (${ux.context.binPool?.length} loại)`);
const taken = ux.context.takeFromBin(ux.context.binPool[0], new THREE.Vector3(wbp.x, 1000, wbp.z - 600));
step(5);
ok(taken && taken.heldBy === 'right', `E trên hộp → cầm 1 ${taken?.def.name}`);
const nT = game.items.all.length;
I.target = { object: trash, spec: trash.userData.interactSpec, chain: [trash.userData.interactSpec], item: null, hit: { point: trash.position.clone(), object: trash }, inReach: true };
const tP = I._collectPrompts().find((p) => p.key === 'E');
ok(tP && !tP.disabled && /thùng rác/.test(tP.label), `cầm vật nhìn thùng rác → "E ${tP?.label}"`);
I._runPrompt(tP, 'E');
I.target = null;
ok(game.items.all.length === nT - 1 && !game.items.all.includes(taken) && events.some((e) => e.type === 'item:disposed'), 'vứt vào thùng rác → vật bị xoá');
// lưu / tải
ux.seating.sit(chairSolder); step(20);
const save = game.save.collect();
ok(!JSON.stringify(save).includes('"seat'), 'bản lưu không chứa trạng thái ngồi');
ok(save.player.pos.every(Number.isFinite), 'bản lưu có vị trí người chơi (chỗ đứng trước khi ngồi)');
game.save.apply(save);
step(5);
ok(!ux.seating.seated, 'tải game → đứng (không ngồi)');
game.quality.set('precisionHeight', 12);
const stored = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
ok(stored.precisionHeight === 12 && stored.hints === 'full', 'cài đặt tỉ mỉ + gợi ý lưu trong robovac.game.settings');

console.log(`\n${passes} đạt, ${fails} lỗi, console.error: ${consoleErrors} — ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fails || consoleErrors ? 1 : 0);
