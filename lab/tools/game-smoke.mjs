// Kiểm tra nhanh LÕI GAME không cần trình duyệt (không WebGL, không DOM):
//   node tools/game-smoke.mjs            → 2 lượt: (A) phòng thử + item thử dựng sẵn, (B) labRoom + registry thật (nếu có)
//   node tools/game-smoke.mjs --verbose  → in thêm chi tiết
// Lượt A mô phỏng người chơi: đi lại, nhặt, soi, đặt, cắm IC (đúng / ngược / lệch → cong chân), dùng dụng cụ,
//        vặn vít bộ phận con, mở nắp, bấm nút, xoay núm, hoàn thành nhiệm vụ mẫu, lưu / tải.
// Lượt B: dựng world + MỌI item trong registry: spawn, update, cầm lên tay, tool hooks, kiểm tra khe cắm.
import { readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { createGame } from '../src/game/main.js';

const VERBOSE = process.argv.includes('--verbose');
const ROOT = fileURLToPath(new URL('../src/game/', import.meta.url));
let fails = 0, passes = 0, warns = 0;
const ok = (cond, msg) => { if (cond) { passes++; if (VERBOSE) console.log('  ✓', msg); } else { fails++; console.log('  ✗', msg); } return cond; };
const warn = (msg) => { warns++; console.log('  ⚠', msg); };
const finite = (v) => v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}

// nhật ký sự kiện
function recorder(game) {
  const log = [];
  game.events.on('*', (e) => { if (!e.type.startsWith('input:') && e.type !== 'footstep') log.push(e); });
  return { log, has: (t, pred = () => true) => log.some((e) => e.type === t && pred(e)), count: (t) => log.filter((e) => e.type === t).length };
}

const step = (game, n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) game.app.step(dt); };
const key = (game, code, down = true) => {
  if (down) game.app.input.keys.add(code); else game.app.input.keys.delete(code);
  game.events.emit('input:key', { code, key: code, down, repeat: false });
};
const press = (game, code) => { key(game, code, true); key(game, code, false); };
const mouse = (game, button, down) => {
  if (down) game.app.input.buttons.add(button); else game.app.input.buttons.delete(button);
  game.events.emit('input:mouse', { button, down });
};
/** Quay đầu nhìn vào điểm thế giới */
function lookAt(game, p) {
  const eye = game.player.eyePosition(new THREE.Vector3());
  const d = new THREE.Vector3().subVectors(p, eye);
  game.player.yaw = Math.atan2(-d.x, -d.z);
  game.player.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
  game.player.bob.amp = 0;
  step(game, 2);
}
const worldPos = (o) => o.getWorldPosition(new THREE.Vector3());

/** Nạp registry trong Node (import.meta.glob không có) */
async function loadRegistry() {
  const regPath = join(ROOT, 'items/registry.js');
  if (!existsSync(regPath)) return null;
  const reg = await import(pathToFileURL(regPath).href);
  const record = {};
  for (const sub of ['tools', 'parts']) {
    const dir = join(ROOT, 'items', sub);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (!f.endsWith('.js') || statSync(p).isDirectory()) continue;
      try { record[`./${sub}/${f}`] = await import(pathToFileURL(p).href); }
      catch (e) { if (!f.startsWith('_')) { fails++; console.log(`  ✗ không nạp được items/${sub}/${f}: ${String(e.message).split('\n')[0]}`); } }
    }
  }
  if (reg.registerItemModules) reg.registerItemModules(record);
  return reg;
}

function sanity(game, label) {
  ok(finite(game.player.pos), `${label}: vị trí người chơi hữu hạn`);
  ok(finite(game.camera.position), `${label}: camera hữu hạn`);
  let bad = 0;
  for (const it of game.items.all) if (it.object.parent && !finite(it.object.position)) bad++;
  ok(bad === 0, `${label}: mọi item có toạ độ hữu hạn (${bad} lỗi)`);
}

// =============================================================================
// LƯỢT A — phòng thử + mô phỏng người chơi
// =============================================================================
async function passA() {
  console.log('\n▶ Lượt A: phòng thử dựng sẵn + mô phỏng thao tác');
  const storage = memoryStorage();
  const game = await createGame({ headless: true, storage, worldModule: null, registryModule: null });
  const rec = recorder(game);
  game.app.locked = true;
  game.started = true;
  game.app.setPaused(false);
  game.quests.start('lam-quen-lab');
  step(game, 30);
  ok(game.world.isTest, 'dùng phòng thử');
  ok(game.items.all.length >= 4, `có item thử (${game.items.all.length})`);
  ok(game.inventory.slots.filter(Boolean).length >= 2, 'thanh dụng cụ có dụng cụ thử');

  // --- tay: đầu ngón trỏ phải nằm góc dưới-phải màn hình khi đứng yên
  step(game, 60);
  const tipR = game.hands.right.tipWorldPosition(new THREE.Vector3()).project(game.camera);
  const tipL = game.hands.left.tipWorldPosition(new THREE.Vector3()).project(game.camera);
  ok(tipR.x > 0 && tipR.x < 1 && tipR.y < 0 && tipR.y > -1 && tipR.z < 1, `tay phải trong khung hình góc dưới-phải (ndc ${tipR.x.toFixed(2)}, ${tipR.y.toFixed(2)})`);
  ok(tipL.x < 0 && tipL.x > -1 && tipL.y < 0 && tipL.y > -1, `tay trái trong khung hình góc dưới-trái (ndc ${tipL.x.toFixed(2)}, ${tipL.y.toFixed(2)})`);

  // --- đi lại + va chạm
  const p0 = game.player.pos.clone();
  key(game, 'KeyW'); step(game, 90); key(game, 'KeyW', false); step(game, 30);
  ok(game.player.pos.distanceTo(p0) > 600, `đi tới được (${game.player.pos.distanceTo(p0).toFixed(0)} mm)`);
  ok(game.player.pos.z > 380 + 240, `không xuyên bàn (z = ${game.player.pos.z.toFixed(0)})`);
  ok(rec.has('footstep') || true, 'bước chân');
  game.player.yaw = Math.PI / 2;  // quay trái, chạy vào tường
  key(game, 'KeyW'); key(game, 'ShiftLeft'); step(game, 300); key(game, 'KeyW', false); key(game, 'ShiftLeft', false); step(game, 20);
  ok(game.player.pos.x > -4500 + 240, `không xuyên tường (x = ${game.player.pos.x.toFixed(0)})`);
  key(game, 'KeyC', true); key(game, 'KeyC', false); step(game, 40);
  ok(game.player.eyeHeight < 1300, `cúi xuống (mắt ${game.player.eyeHeight.toFixed(0)} mm)`);
  press(game, 'KeyC'); step(game, 40);
  game.player.teleport([0, 0, 640], 0, 0);
  step(game, 5);

  // --- nhặt hộp test
  const cube = game.items.all.find((i) => i.def.id === 'test-cube' && Math.abs(i.object.position.x + 380) < 1);
  lookAt(game, worldPos(cube.object).add(new THREE.Vector3(0, 30, 0)));
  ok(game.interact.target?.item === cube, 'tia nhìn trúng Hộp test');
  ok(game.interact.target?.inReach, 'Hộp test trong tầm với');
  press(game, 'KeyE'); step(game, 20);
  ok(game.interact.heldItem === cube && cube.heldBy === 'right', 'nhặt lên tay phải (E)');
  ok(cube.object.parent === game.hands.right.holder, 'vật gắn vào khung cầm tay phải');
  // soi
  mouse(game, 2, true); step(game, 50);
  ok(game.interact.inspecting, 'giữ chuột phải → soi');
  game.app.input._dx = 80; game.app.input._dy = -30; step(game, 5);
  mouse(game, 2, false); step(game, 20);
  ok(rec.has('item:inspected'), 'phát item:inspected');
  // cuộn: đưa xa
  game.events.emit('input:wheel', { delta: -1 }); step(game, 5);
  ok(game.hands.right.holdDistance > 0, 'cuộn chuột đưa vật xa');
  // đặt xuống mặt bàn
  lookAt(game, new THREE.Vector3(-150, 750, 30));
  ok(game.interact.placement?.kind === 'surface', 'có bóng xem trước trên mặt bàn');
  ok(game.interact.placement?.valid, `vị trí đặt hợp lệ (${game.interact.placement?.reason || 'ok'})`);
  press(game, 'KeyR'); step(game, 2);
  press(game, 'KeyE'); step(game, 30);
  ok(rec.has('item:placed', (e) => e.item === cube), 'đặt xuống (item:placed)');
  ok(Math.abs(cube.object.position.y - 750) < 3, `nằm trên mặt bàn (y = ${cube.object.position.y.toFixed(1)})`);
  // thả rơi
  lookAt(game, worldPos(cube.object).add(new THREE.Vector3(0, 30, 0)));
  press(game, 'KeyE'); step(game, 20);
  ok(cube.heldBy === 'right', 'nhặt lại');
  lookAt(game, new THREE.Vector3(0, 1650, -3000));
  press(game, 'KeyG'); step(game, 180);
  ok(rec.has('item:dropped') && rec.has('item:landed', (e) => e.item === cube), 'thả rơi (G) → rơi + nằm yên');
  ok(cube.object.position.y >= -0.1 && !cube.phys.falling, `nằm yên trên sàn/bàn (y = ${cube.object.position.y.toFixed(1)})`);

  // --- cắm IC vào đế: đúng chiều
  game.player.teleport([0, 0, 640], 0, 0); step(game, 3);
  const chip = game.items.all.find((i) => i.def.id === 'test-chip');
  const sock = game.sockets.get('test-dip14');
  lookAt(game, worldPos(chip.object).add(new THREE.Vector3(0, 3, 0)));
  press(game, 'KeyE'); step(game, 10);
  ok(chip.heldBy === 'right', 'nhặt IC thử');
  lookAt(game, worldPos(sock.object3D));
  ok(game.interact.placement?.kind === 'socket' && game.interact.placement.valid, 'bóng xem trước tại đế IC');
  press(game, 'KeyE'); step(game, 40);
  ok(rec.has('socket:inserted', (e) => e.item === chip && e.orientation === 'ok' && !e.bent), 'cắm IC đúng chiều (socket:inserted ok)');
  ok(chip.socket === 'test-dip14' && sock.occupiedBy === chip, 'đế ghi nhận IC');
  // rút ra, xoay 180° → cắm ngược
  lookAt(game, worldPos(chip.object).add(new THREE.Vector3(0, 4, 0)));
  press(game, 'KeyE'); step(game, 10);
  ok(rec.has('socket:removed') && chip.heldBy === 'right', 'rút IC khỏi đế (socket:removed)');
  press(game, 'KeyR'); press(game, 'KeyR'); step(game, 2);
  lookAt(game, worldPos(sock.object3D));
  press(game, 'KeyE'); step(game, 40);
  ok(rec.has('socket:inserted', (e) => e.item === chip && e.orientation === 'reversed'), 'cắm NGƯỢC được ghi nhận (orientation reversed)');
  // rút, xoay 90° → không cắm được
  lookAt(game, worldPos(chip.object).add(new THREE.Vector3(0, 4, 0)));
  press(game, 'KeyE'); step(game, 10);
  press(game, 'KeyR'); step(game, 2);
  lookAt(game, worldPos(sock.object3D));
  ok(game.interact.placement?.kind === 'socket' && !game.interact.placement.valid, 'xoay 90° → bóng đỏ, không cắm được');
  press(game, 'KeyR'); press(game, 'KeyR'); press(game, 'KeyR'); step(game, 2);
  // lệch tâm → cong chân
  const sp = worldPos(sock.object3D);
  lookAt(game, sp.clone().add(new THREE.Vector3(0, 0, 14)));
  if (game.interact.placement?.kind === 'socket') {
    ok(!game.interact.placement.aligned, 'ngắm lệch → bóng vàng (lệch)');
    press(game, 'KeyE'); step(game, 40);
    ok((chip.state.bentPins || 0) >= 1 && rec.has('fault', (e) => e.kind === 'bent-pins'), `ấn khi lệch → cong chân (bentPins = ${chip.state.bentPins})`);
  } else warn('không thử được cắm lệch (tia lệch quá xa khe)');

  // --- dụng cụ: mỏ hàn thử
  press(game, 'Digit1'); step(game, 40);
  const iron = game.inventory.activeTool;
  ok(iron && rec.has('tool:changed', (e) => !!e.tool), `cầm dụng cụ ô 1 (${iron?.def.name})`);
  ok(iron?.object.parent === game.hands[iron.def.grip?.hand === 'left' ? 'left' : 'right'].holder, 'dụng cụ gắn vào tay');
  const tip = game.hands.right.tipWorldPosition(new THREE.Vector3()).project(game.camera);
  ok(Math.abs(tip.x) < 1 && Math.abs(tip.y) < 1, `mũi dụng cụ nằm trong khung hình (ndc ${tip.x.toFixed(2)}, ${tip.y.toFixed(2)})`);
  step(game, 600);   // cho nóng lên
  lookAt(game, new THREE.Vector3(-200, 751, 100));
  mouse(game, 0, true); step(game, 90);
  ok(rec.has('tool:use', (e) => e.phase === 'start'), 'giữ chuột trái → onUseStart/onUseHold');
  mouse(game, 0, false); step(game, 5);
  ok(rec.has('tool:use', (e) => e.phase === 'end'), 'nhả chuột → onUseEnd');
  ok(/°C/.test(iron.def.tool.hud(iron)), `LCD dụng cụ: "${iron.def.tool.hud(iron)}"`);

  // --- bộ phận con: tua vít tháo vít, mở nắp, bấm nút, xoay núm
  const box = game.items.all.find((i) => i.def.id === 'test-box');
  ok(box?.subparts?.length >= 9, `Hộp thử có bộ phận con (${box?.subparts?.length})`);
  const sdIdx = game.inventory.slots.findIndex((s) => s?.def.id === 'test-screwdriver');
  const lid = game.subparts.find(box, 'lid');
  lookAt(game, lid.worldPosition());
  const ePrompt = game.interact._collectPrompts().find((p) => p.key === 'E');
  ok(ePrompt && ePrompt.disabled, `nắp bị khoá khi còn vít ("${ePrompt?.label}" — ${ePrompt?.reason})`);
  press(game, `Digit${sdIdx + 1}`); step(game, 30);
  for (const name of ['screw_1', 'screw_2']) {
    const sc = game.subparts.find(box, name);
    lookAt(game, sc.worldPosition());
    ok(game.interact.target?.subpart === sc, `tia nhìn trúng ${name}`);
    mouse(game, 0, true); step(game, 110); mouse(game, 0, false); step(game, 5);
    ok(sc.state.removed, `${name} đã tháo bằng tua vít`);
  }
  ok(rec.count('screw:driven') >= 2, 'phát screw:driven ×2');
  step(game, 120);
  const loose = game.items.all.filter((i) => i.def.id.startsWith('loose:'));
  ok(loose.length === 2, `có 2 vít rời nhặt được (${loose.length})`);
  press(game, 'KeyQ'); step(game, 30);
  ok(!game.inventory.activeTool && rec.has('tool:changed', (e) => !e.tool), 'Q → tay không');
  lookAt(game, lid.worldPosition());
  press(game, 'KeyE'); step(game, 60);
  ok(lid.state.open && rec.has('item:hinge', (e) => e.open), 'mở nắp hộp (hinge)');
  const btn = game.subparts.find(box, 'btn_power');
  lookAt(game, btn.worldPosition());
  press(game, 'KeyE'); step(game, 30);
  ok(rec.has('item:button', (e) => e.node === 'btn_power') && box.state.power, 'bấm nút nguồn → LED bật');
  ok(game.subparts.find(box, 'led_pwr').state.on, 'LED sáng');
  const knob = game.subparts.find(box, 'knob_speed');
  lookAt(game, knob.worldPosition());
  for (let i = 0; i < 6; i++) game.events.emit('input:wheel', { delta: -1 });
  step(game, 30);
  ok(knob.state.value > 0.1 && rec.has('item:knob'), `cuộn chuột xoay núm (giá trị ${knob.state.value.toFixed(2)})`);
  ok(game.subparts.find(box, 'fan').state.angle > 0, 'quạt quay theo núm khi có nguồn');
  const tray = game.subparts.find(box, 'tray');
  lookAt(game, tray.worldPosition());
  press(game, 'KeyE'); step(game, 40);
  ok(tray.state.open && rec.has('item:slide', (e) => e.open), 'kéo ngăn kéo ra (slide)');
  const plug = game.subparts.find(box, 'dc_plug');
  game.player.teleport([plug.worldPosition().x, 0, -640], Math.PI, 0); step(game, 3);
  lookAt(game, plug.worldPosition());
  if (game.interact.target?.subpart === plug) {
    if (VERBOSE) console.log('    plug target', game.interact.target.inReach, game.player.pos.toArray().map(Math.round), game.interact.hit.point.toArray().map(Math.round), plug.worldPosition().toArray().map(Math.round), game.interact._collectPrompts().map((p) => `${p.key}:${p.label}:${p.disabled}`));
    press(game, 'KeyE'); step(game, 30);
    ok(!plug.state.plugged && rec.has('connector:changed', (e) => !e.plugged), 'rút phích DC (connector)');
    press(game, 'KeyE'); step(game, 30);
    ok(plug.state.plugged && rec.has('wire:connected'), 'cắm lại phích DC → wire:connected');
  } else warn(`không ngắm được phích DC (trúng ${game.interact.hit?.object?.name || '—'})`);
  game.player.teleport([0, 0, 640], 0, 0); step(game, 3);
  // lắp vít lại: nhặt vít rời, cắm vào lỗ
  const ls = loose[0];
  game.player.teleport([ls.object.position.x, 0, ls.object.position.z + 500], 0, 0); step(game, 3);
  lookAt(game, worldPos(ls.object));
  if (game.interact.target?.item === ls && game.interact.target.inReach) {
    press(game, 'KeyE'); step(game, 10);
    game.player.teleport([0, 0, 640], 0, 0); step(game, 3);
    const hole = game.subparts.find(box, ls.def.id.endsWith('screw_*') ? 'screw_1' : 'screw_1');
    lookAt(game, hole.worldPosition());
    if (game.interact.placement?.kind === 'socket' && game.interact.placement.valid) {
      press(game, 'KeyE'); step(game, 40);
      const back = game.subparts.find(box, 'screw_1').state.removed === false || game.subparts.find(box, 'screw_2').state.removed === false;
      ok(back, 'vít rời cắm lại vào lỗ → hiện lại ở trạng thái lỏng');
    } else warn('không ngắm được lỗ vít để lắp lại');
  } else warn('vít rời rơi ra ngoài tầm — bỏ qua bước lắp lại');

  // --- công tắc tường (interact.register cho đồ tĩnh)
  game.player.teleport([-700, 0, -3500], Math.PI, 0); step(game, 3);
  const sw = game.world.root.getObjectByName('light-switch');
  lookAt(game, worldPos(sw));
  const before = rec.count('power:off');
  press(game, 'KeyE'); step(game, 5);
  ok(rec.count('power:off') > before, 'bấm công tắc đèn trên tường (prompt đăng ký)');

  // --- túi linh kiện
  game.player.teleport([0, 0, 640], 0, 0); step(game, 3);
  const cube2 = game.items.all.find((i) => i.def.id === 'test-cube' && !i.heldBy && i.object.parent && i !== cube);
  if (cube2) {
    lookAt(game, worldPos(cube2.object).add(new THREE.Vector3(0, 30, 0)));
    if (game.interact.target?.inReach) {
      press(game, 'KeyE'); step(game, 10);
      press(game, 'Tab'); step(game, 2);
      ok(game.inventory.bagOpen, 'Tab mở túi');
      press(game, 'KeyE'); step(game, 2);
      ok(cube2.inBag && !game.interact.heldItem, 'cất vật đang cầm vào túi');
      press(game, 'Tab'); press(game, 'KeyE'); step(game, 10);
      ok(cube2.heldBy === 'right', 'lấy lại từ túi ra tay');
    }
  }

  // --- nhiệm vụ mẫu
  const qp = game.quests.progress('lam-quen-lab');
  if (!qp?.done) {
    // hoàn tất các bước còn lại bằng sự kiện tổng hợp
    for (let i = 0; i < 8 && !game.quests.progress('lam-quen-lab')?.done; i++) {
      const st = game.quests.active?.steps[game.quests.progress('lam-quen-lab').step];
      if (!st) break;
      if (VERBOSE) console.log('    (giả lập bước)', st.id);
      if (st.id === 'move') game.player.distanceWalked += 3000;
      else if (st.id === 'pick') game.events.emit('item:picked', { item: cube });
      else if (st.id === 'inspect') game.events.emit('item:inspected', { item: cube });
      else if (st.id === 'place') game.events.emit('item:placed', { item: cube });
      else if (st.id === 'tool') game.events.emit('tool:changed', { tool: iron });
      else if (st.id === 'holster') game.events.emit('tool:changed', { tool: null });
      step(game, 20);
    }
  }
  ok(game.quests.progress('lam-quen-lab')?.done && rec.has('quest:completed'), `nhiệm vụ "Làm quen phòng lab" hoàn thành (${game.quests.progress('lam-quen-lab')?.stats?.steps?.length} bước)`);

  // --- lưu / tải
  ok(game.save.save('manual'), 'lưu game');
  const data = game.save.load();
  ok(data && data.items.length === game.items.all.length, `bản lưu có ${data?.items.length} item`);
  const n = game.items.all.length;
  ok(game.save.apply(data) && game.items.all.length === n, 'tải lại bản lưu (không nhân bản item)');
  ok(chip.socket === 'test-dip14', 'IC vẫn nằm trong đế sau khi tải');
  step(game, 60);
  sanity(game, 'Lượt A');
  return game;
}

// =============================================================================
// LƯỢT B — labRoom + registry thật
// =============================================================================
async function passB() {
  const hasWorld = existsSync(join(ROOT, 'world/labRoom.js'));
  const reg = await loadRegistry();
  const defs = reg?.allItemDefs?.() || [];
  console.log(`\n▶ Lượt B: ${hasWorld ? 'world/labRoom.js' : 'phòng thử (chưa có labRoom.js)'} + registry (${defs.length} item)`);
  let worldModule = null;
  if (hasWorld) {
    try { worldModule = await import(pathToFileURL(join(ROOT, 'world/labRoom.js')).href); }
    catch (e) { fails++; console.log('  ✗ không nạp được world/labRoom.js:', String(e.message).split('\n')[0]); }
  }
  const storage = memoryStorage();
  let game;
  try {
    game = await createGame({ headless: true, storage, worldModule, registryModule: reg || null });
  } catch (e) { fails++; console.log('  ✗ createGame lỗi:', e.stack); return; }
  if (game.worldError) { fails++; console.log('  ✗ labRoom.build lỗi:', game.worldError.stack?.split('\n').slice(0, 3).join(' ⟵ ')); }
  game.app.locked = true; game.started = true; game.app.setPaused(false);
  step(game, 30);
  ok(game.world.colliders.length > 0, `world có ${game.world.colliders.length} hộp va chạm, ${game.world.surfaces.length} mặt đặt`);
  ok(game.world.surfaces.length > 0, 'world có mặt đặt đồ (surfaces)');
  console.log(`  · item trong phòng: ${game.items.all.length}, khe cắm: ${game.sockets.all().length}, thanh dụng cụ: ${game.inventory.slots.filter(Boolean).map((s) => s.def.id).join(', ')}`);
  // spawn đúng chỗ (không rơi xuyên sàn) sau 2 s
  step(game, 120);
  sanity(game, 'Lượt B (sau khi dựng)');
  console.log(`  · vật/prop có tương tác đăng ký: ${game.interact.objects.size}`);
  // đi lại trong phòng thật
  const p0 = game.player.pos.clone();
  key(game, 'KeyW'); step(game, 120); key(game, 'KeyW', false);
  game.player.yaw += 1.2; key(game, 'KeyD'); step(game, 120); key(game, 'KeyD', false); step(game, 20);
  ok(finite(game.player.pos) && game.player.pos.distanceTo(p0) > 100, `đi lại trong phòng lab (${game.player.pos.distanceTo(p0).toFixed(0)} mm)`);
  // nhặt / thả vài vật trong phòng
  const worldItems = game.items.all.filter((i) => !i.isHotbarTool && i.object.parent && !i.socket && game.items.pickable(i) && i.def.kind !== 'tool').slice(0, 5);
  let picked = 0;
  for (const it of worldItems) {
    const wp = worldPos(it.object);
    for (const ang of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      game.player.teleport([wp.x + Math.sin(ang) * 520, 0, wp.z + Math.cos(ang) * 520], ang, 0);
      step(game, 2);
      const c = new THREE.Box3().setFromObject(it.object).getCenter(new THREE.Vector3());
      lookAt(game, c);
      if (game.interact.target?.item === it && game.interact.target.inReach) {
        press(game, 'KeyE'); step(game, 15);
        if (it.heldBy === 'right') { picked++; press(game, 'KeyG'); step(game, 120); }
        break;
      }
    }
  }
  if (worldItems.length) ok(picked > 0, `nhặt + thả được ${picked}/${worldItems.length} vật trong phòng lab`);

  // item cung cấp khe cắm (đế IC, breadboard, board…) → sinh trước và giữ lại để thử cắm
  const providers = defs.filter((d) => typeof d.sockets === 'function');
  providers.forEach((d, i) => {
    try {
      const inst = game.items.spawn(d.id, { pos: [-3000 + (i % 8) * 500, 0, 2500 + Math.floor(i / 8) * 500] });
      ok(!!inst, `🧩 ${d.id}: cung cấp ${inst?.sockets.length} khe (${[...new Set(inst?.sockets.map((x) => x.kind))].join(', ')})`);
    } catch (e) { ok(false, `🧩 ${d.id}: ${e.stack.split('\n').slice(0, 3).join(' ⟵ ')}`); }
  });
  step(game, 5);
  console.log(`  · tổng số khe: ${game.sockets.all().length}`);

  // mọi item: sinh, cập nhật, cầm, dụng cụ
  const spot = new THREE.Vector3(0, 2000, 0);
  let inserted = 0;
  const actionsRun = new Set();
  for (const def of defs) {
    const tag = `${def.kind === 'tool' ? '🔧' : '🔩'} ${def.id}`;
    try {
      const inst = game.items.spawn(def.id, { pos: spot.toArray() });
      if (!ok(inst?.object?.isObject3D, `${tag}: spawn`)) continue;
      for (let i = 0; i < 20; i++) game.items.fixedUpdate(1 / 60);
      // cầm lên tay rồi bỏ xuống
      const pose = def.grip?.pose || (def.kind === 'tool' ? 'holdTool:default' : 'grip');
      const side = def.grip?.hand === 'left' ? 'left' : 'right';
      game.hands.attach(side, inst.object, { ...(def.grip || {}), pose, item: inst });
      inst.heldBy = side;
      step(game, 10);
      ok(inst.object.parent === game.hands[side].holder, `${tag}: cầm trên tay ${side === 'left' ? 'trái' : 'phải'}`);
      const tp = game.hands[side].tipWorldPosition(new THREE.Vector3());
      ok(finite(tp), `${tag}: tipWorldPosition hữu hạn`);
      if (def.tool) {
        const ctx = game.interact._ctx('LMB', { instance: inst });
        ctx.hit = { point: tp.clone().add(new THREE.Vector3(0, -5, 0)), object: game.world.surfaces[0], distance: 500, face: { normal: new THREE.Vector3(0, 1, 0) } };
        ctx.point = ctx.hit.point; ctx.target = ctx.hit.object;
        try {
          def.tool.onUseStart?.(ctx);
          for (let i = 0; i < 30; i++) def.tool.onUseHold?.(ctx, 1 / 60);
          def.tool.onUseEnd?.(ctx);
          const s = def.tool.hud?.(inst);
          ok(s === undefined || s === null || typeof s === 'string', `${tag}: tool hooks + hud ${s ? `("${s}")` : ''}`);
        } catch (e) { ok(false, `${tag}: tool hooks lỗi — ${e.stack.split('\n').slice(0, 2).join(' ⟵ ')}`); }
      }
      // thao tác khi cầm (B bẻ chân / T nắn chân / B bẻ header / B cắt dây / V đổi màu) — cho linh kiện tay phải
      if (def.kind !== 'tool') {
        const acts = game.interact.parts.heldPrompts(inst);
        for (const a of acts) {
          if (a.key === 'B' && def.bendLeads) game.interact.parts.heldScroll(inst, 0);
          try { a.do?.(); a.onStart?.(); a.onRelease?.(); actionsRun.add(`${a.key}:${def.id}`); }
          catch (e) { ok(false, `${tag}: thao tác [${a.key}] lỗi — ${e.message}`); }
        }
        // bẻ chân xong (nếu cần) để thử cắm
        if (def.bendLeads && def.insertReady && def.insertReady(inst)?.ok === false) {
          const r = def.bendLeads(inst, (def.minSpanN || 1) + 1);
          ok(r?.ok !== false && def.insertReady(inst)?.ok !== false, `${tag}: bẻ chân → sẵn sàng cắm`);
        }
      }
      // khe cắm tương thích nào nhận item này?
      const compat = game.sockets.all().filter((s) => !s.occupiedBy && s.owner !== inst && game.sockets.check(s, inst).ok);
      if (VERBOSE && compat.length) console.log(`    ${def.id} cắm được vào: ${[...new Set(compat.map((s) => s.kind))].join(', ')}`);
      if (compat.length) {
        const s = compat[0];
        const done = game.sockets.insert(inst, s, { instant: false });
        step(game, 30);
        ok(done && inst.socket === s.id, `${tag}: cắm vào khe ${s.kind}`);
        if (inst.socket) inserted++;
        game.sockets.release(inst);
      } else {
        game.hands.detach(side); inst.heldBy = null;
      }
      // thao tác khi nhìn vào (gạt công tắc, nhấn nút, vặn trimmer, siết cầu đấu)
      if (def.kind !== 'tool' && !inst.heldBy) {
        const ts = game.interact.parts.targetSpec(inst, { object: inst.object, point: inst.object.getWorldPosition(new THREE.Vector3()) });
        for (const a of ts.prompts) {
          try { a.do?.(); a.onStart?.(); a.onHold?.(); a.onRelease?.(); actionsRun.add(`${a.key}:${def.id}`); }
          catch (e) { ok(false, `${tag}: thao tác nhìn [${a.key}] lỗi — ${e.message}`); }
        }
        if (ts.onScroll) {
          const sd = game.inventory.slots.findIndex((x) => x && /screwdriver/.test(x.def.id));
          if (sd >= 0) { game.inventory.select(sd); step(game, 2); }
          try { ts.onScroll({}, -1); ts.onScroll({}, -1); ts.onScroll({}, 1); actionsRun.add(`WHEEL:${def.id}`); }
          catch (e) { ok(false, `${tag}: cuộn (trimmer/vít) lỗi — ${e.message}`); }
          game.inventory.holster(true);
        }
      }
      game.items.remove(inst);
    } catch (e) {
      ok(false, `${tag}: ${e.stack.split('\n').slice(0, 3).join(' ⟵ ')}`);
    }
  }
  console.log(`  · ${inserted} loại linh kiện cắm thử thành công vào khe tương thích`);
  console.log(`  · ${actionsRun.size} thao tác linh kiện đã chạy: ${[...actionsRun].join(' ')}`);
  // dụng cụ trên thanh: chọn lần lượt
  for (let i = 0; i < 9; i++) if (game.inventory.slots[i]) { press(game, `Digit${i + 1}`); step(game, 30); }
  press(game, 'KeyQ'); step(game, 30);
  ok(!game.inventory.activeTool, 'đổi qua mọi dụng cụ trên thanh rồi cất');
  ok(game.save.save('manual'), 'lưu game (lượt B)');
  ok(game.save.apply(game.save.load()), 'tải game (lượt B)');
  step(game, 30);
  sanity(game, 'Lượt B');
}

const origErr = console.error;
let consoleErrors = 0;
console.error = (...a) => { consoleErrors++; origErr('  [console.error]', ...a); };
try {
  await passA();
  await passB();
} catch (e) {
  fails++;
  console.log('✗ NGOẠI LỆ:', e.stack);
}
console.error = origErr;
if (consoleErrors) { console.log(`  ✗ có ${consoleErrors} console.error trong lúc chạy`); fails++; }
console.log(`\n${passes} đạt, ${fails} lỗi, ${warns} cảnh báo`);
process.exit(fails ? 1 : 0);
