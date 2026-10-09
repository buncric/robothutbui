// Kiểm tra CHẾ ĐỘ BÀN LÀM VIỆC 3D (engine/ux/bench.js) không cần trình duyệt:
//   node tools/game-bench-test.mjs [--verbose]
// Dựng phòng lab thật + registry thật rồi kiểm:
//   1) ngồi ghế bàn hàn (E) → bàn 3D: chuột không khoá, camera quỹ đạo trên mặt bàn, tay ẩn, con trỏ tuyệt đối, tầm với từ vai người ngồi
//   2) giới hạn quỹ đạo: góc ngẩng, cự li 150–1200 mm, luôn cao hơn mặt bàn, không xuyên tường
//   3) T nhìn thẳng xuống bo trên kẹp (khung vừa bo) · T lần nữa về góc cũ · G góc 45°
//   4) nhặt điện trở trên bàn bằng chuột phải · thẻ chú thích (tên + giải thích + phím)
//   5) bóng xem trước khớp lỗ board đục lỗ (chân trùng lỗ) · bóng đỏ khi chưa bẻ chân · chuột trái cắm vào board trên kẹp
//   6) IC cắm NGƯỢC vào đế DIP-40: bóng đỏ + cảnh báo, vẫn cắm được, orientation 'reversed' + 'socket:reversed'
//   7) hàn 1 mối bằng con trỏ chuột (mỏ hàn tay phải + thiếc tay trái) → 'solder:joint'
//   8) M kính hiển vi → rời kính về bàn 3D · Tab ↔ góc nhìn thứ nhất · Space đứng dậy → khoá chuột, đi lại FPS · cài đặt lưu
import { readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { createGame } from '../src/game/main.js';
import { labState } from '../src/game/world/_labState.js';
import { STORAGE_KEY } from '../src/game/engine/quality.js';
import { BENCH, polarityMarks } from '../src/game/engine/ux/bench.js';

const VERBOSE = process.argv.includes('--verbose');
const ROOT = fileURLToPath(new URL('../src/game/', import.meta.url));
let fails = 0, passes = 0;
const ok = (cond, msg, detail = '') => { if (cond) { passes++; console.log('  ✓', msg, detail ? `— ${detail}` : ''); } else { fails++; console.log('  ✗', msg, detail ? `— ${detail}` : ''); } return cond; };
const log = (...a) => { if (VERBOSE) console.log('    ·', ...a); };
const f1 = (v) => (typeof v === 'number' ? v.toFixed(1) : String(v));
const deg = (r) => THREE.MathUtils.radToDeg(r).toFixed(1);

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
const step = (n = 1) => { for (let i = 0; i < n; i++) game.app.step(1 / 60); };
const sec = (s) => step(Math.round(s * 60));
const events = [];
game.events.on('*', (e) => { if (!e.type.startsWith('input:') && e.type !== 'footstep') events.push(e); });
const since = (n) => events.slice(n);
const key = (code, down = true, extra = {}) => game.events.emit('input:key', { code, key: code, down, repeat: false, shift: false, ctrl: false, ...extra });
const lookAt = (p) => { const e = game.camera.getWorldPosition(new THREE.Vector3()); const d = p.clone().sub(e); game.player.yaw = Math.atan2(-d.x, -d.z); game.player.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); };
const camPos = () => game.camera.getWorldPosition(new THREE.Vector3());
/** Trỏ chuột vào một item (thử vài điểm trong hộp bao cho tới khi tia trúng chính nó) → toạ độ màn hình */
const aimItem = (it) => {
  const b = new THREE.Box3().setFromObject(it.object), c = b.getCenter(new THREE.Vector3());
  let sp = null;
  for (const p of [c, c.clone().setY(b.max.y - 0.6), c.clone().setY((c.y + b.max.y) / 2)]) { sp = B.aimAt(p); if (I.target?.item === it) break; }
  return sp;
};
const insideCollider = (p) => (game.world.colliders || []).find((b) => b.containsPoint(p)) || null;
step(5);

const ux = game.ux, I = game.interact, B = ux.bench, S = game.soldering;
const W = game.app.width, H = game.app.height;
console.log('\n▶ 0) Khởi tạo');
ok(!!B, 'game.ux.bench được tạo');
ok(game.quality.settings.benchMode === true, 'cài đặt "Ngồi vào bàn → chế độ 3D" bật mặc định');
const chair = ux.seating.get('bench-solder');
ok(!!chair, 'ghế bàn hàn');
// bo đục lỗ lên kẹp mạch (mặt linh kiện lên)
const viseSock = game.sockets.get('vise');
let pb = game.items.all.find((i) => i.def.id === 'perfboard-9x15');
if (!pb) pb = game.items.spawn('perfboard-9x15', { pos: [-2880, 900, -3440] });
game.sockets.insert(pb, viseSock, { instant: true });
sec(1);
ok(viseSock.occupiedBy === pb, 'board đục lỗ kẹp vào kẹp mạch bàn hàn');

// ============================================================ 1) vào bàn 3D
console.log('\n▶ 1) Ngồi ghế → chế độ bàn 3D');
game.player.teleport([-2900, 0, -2420], 0, 0); step(3);
lookAt(chair.object.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 450, 0))); step(3);
ok(I.target?.object === chair.object, 'nhìn ghế bàn hàn');
const nE = events.length;
key('KeyE'); sec(0.8);
ok(ux.seating.seated === chair && B.active, 'E → ngồi + chế độ bàn 3D', `mode=${ux.mode}`);
ok(since(nE).some((e) => e.type === 'bench:enter'), "phát 'bench:enter'");
ok(game.app.freeCursor === true && game.app.locked === false, 'chuột không khoá (app.freeCursor)');
ok(typeof game.player.cameraOverride === 'function', 'camera người chơi bị ghi đè bằng camera quỹ đạo');
const top = chair.benchTop;
let cp0 = camPos();
const tgt0 = B.cam.target.clone();
ok(cp0.y > top + BENCH.clear - 1, `camera cao hơn mặt bàn (y=${f1(cp0.y)}, mặt bàn ${top})`);
ok(Math.abs(cp0.distanceTo(tgt0) - BENCH.distIso) < 5 && Math.abs(B.cam.el - BENCH.elIso) < 0.01, `góc 45° mặc định, cự li ${f1(cp0.distanceTo(tgt0))} mm`);
ok(tgt0.distanceTo(viseSock.object3D.getWorldPosition(new THREE.Vector3())) < 120, 'tâm quỹ đạo = kẹp mạch / bo trên kẹp');
const fwd = game.camera.getWorldDirection(new THREE.Vector3());
ok(fwd.dot(tgt0.clone().sub(cp0).normalize()) > 0.999, 'camera nhìn vào tâm làm việc');
ok(!game.hands.right.visible && !game.hands.left.visible, 'bàn tay viewmodel ẩn');
ok(ux.precision.active && ux.precision.absolute && I.pointerRay?.far === BENCH.far, 'con trỏ tuyệt đối (tia qua chuột thật)');
const eyeBody = B.bodyEye(new THREE.Vector3());
ok(Math.abs(I.shoulder(new THREE.Vector3()).y - (eyeBody.y - 350)) < 1 && Math.abs(eyeBody.y - 1220) < 60, `tầm với tính từ vai người ngồi (mắt ${f1(eyeBody.y)} mm), không từ camera`);
const card = B.modeCard();
ok(card?.keys.some(([k]) => k === 'T') && card.keys.some(([k]) => k === 'Space') && card.keys.some(([k]) => k === 'RMB'), 'thẻ phím: RMB · T · Space …', card?.keys.map(([k]) => k).join(' '));
ok(ux.mode === 'bench', "ux.mode = 'bench'");

// ============================================================ 2) giới hạn quỹ đạo
console.log('\n▶ 2) Giới hạn quỹ đạo');
B.drag(0, 5000, 'orbit'); step(2);
ok(Math.abs(B.goal.el - BENCH.elMax) < 1e-6, `kéo xuống hết → nhìn thẳng từ trên (${deg(B.goal.el)}°)`);
B.drag(0, -9000, 'orbit'); step(2);
ok(B.goal.el >= BENCH.elMin - 1e-6, `kéo lên hết → góc ngẩng ≥ ${deg(BENCH.elMin)}° (${deg(B.goal.el)}°) — không nhìn từ dưới bàn`);
ok(camPos().y >= top + BENCH.clear - 1, `camera vẫn cao hơn mặt bàn (y=${f1(camPos().y)})`);
for (let i = 0; i < 40; i++) B.wheel(1);
step(2);
ok(B.goal.dist <= BENCH.distMax + 1e-6, `cuộn ra hết → cự li ≤ ${BENCH.distMax} mm (${f1(B.goal.dist)})`);
for (let i = 0; i < 60; i++) B.wheel(-1);
step(2);
ok(B.goal.dist >= BENCH.distMin - 1e-6 && Math.abs(camPos().distanceTo(B.cam.target) - BENCH.distMin) < 2, `cuộn vào hết → cự li ≥ ${BENCH.distMin} mm (${f1(camPos().distanceTo(B.cam.target))})`);
// quay ra sau bàn (phía tường Bắc) xa nhất → bị tường chặn
B._setGoal({ az: chair.yawCenter + Math.PI, el: BENCH.elMin + 0.05, dist: BENCH.distMax }); step(2);
const cw = camPos();
ok(!insideCollider(cw), `quay ra phía tường, cự li 1200 → camera không nằm trong vật cản (${f1(cw.x)}, ${f1(cw.y)}, ${f1(cw.z)})`);
ok(B.effDist < BENCH.distMax - 50 && cw.z > -4000, `tường chặn: cự li thực ${f1(B.effDist)} mm, z=${f1(cw.z)} (> tường −4000)`);
// dời camera dọc bàn (chuột giữa) bị giới hạn trong mặt bàn
B.view('iso'); step(2);
B.drag(-40000, 0, 'pan'); step(2);
const r = B.rect;
ok(B.goal.target.x <= r.x1 + 1e-6 && B.goal.target.x >= r.x0 - 1e-6, `dời hết cỡ → tâm vẫn trong mặt bàn (x=${f1(B.goal.target.x)} ∈ [${r.x0}, ${r.x1}])`);
B.view('iso'); step(2);

// ============================================================ 3) nhìn thẳng xuống bo
console.log('\n▶ 3) T: nhìn thẳng xuống bo');
const elBefore = B.goal.el;
key('KeyT'); step(2);
const pbBox = new THREE.Box3().setFromObject(pb.object);
const pbC = pbBox.getCenter(new THREE.Vector3());
const ct = camPos();
ok(B.viewName === 'top' && Math.abs(B.cam.el - Math.PI / 2) < 1e-3, 'T → góc nhìn thẳng từ trên xuống');
ok(Math.hypot(ct.x - pbC.x, ct.z - pbC.z) < 3, `camera ngay trên tâm bo (lệch ${f1(Math.hypot(ct.x - pbC.x, ct.z - pbC.z))} mm)`);
const corners = [];
for (const x of [pbBox.min.x, pbBox.max.x]) for (const z of [pbBox.min.z, pbBox.max.z]) corners.push(new THREE.Vector3(x, pbBox.max.y, z).project(game.camera));
const inView = corners.every((v) => Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1);
const spanX = Math.max(...corners.map((v) => v.x)) - Math.min(...corners.map((v) => v.x)), spanY = Math.max(...corners.map((v) => v.y)) - Math.min(...corners.map((v) => v.y));
ok(inView && Math.max(spanX / 2, spanY / 2) > 0.55, `khung vừa bo: 4 góc trong ảnh, bo chiếm ${Math.round(Math.max(spanX, spanY) * 50)} % khung`);
const up = new THREE.Vector3(0, 1, 0).applyQuaternion(game.camera.quaternion);
ok(up.dot(chair.normal) > 0.99, 'phía xa bàn ở đỉnh ảnh (không lộn ngược)');
key('KeyT'); step(2);
ok(B.viewName !== 'top' && Math.abs(B.goal.el - elBefore) < 1e-6, `T lần nữa → về góc trước (${deg(B.goal.el)}°)`);
key('KeyG'); step(2);
ok(B.viewName === 'iso', 'G → góc 45° mặc định');

// ============================================================ 4) nhặt điện trở
console.log('\n▶ 4) Nhặt linh kiện bằng chuột phải · thẻ chú thích');
const work = B._workCenter();
// chỗ trên mặt bàn so với kẹp mạch: lat = sang phải người ngồi, n = vào trong bàn (âm = phía người ngồi)
const onBench = (lat, n) => work.clone().addScaledVector(chair.lateral, lat).addScaledVector(chair.normal, n).setY(top + 15).toArray();
const res = game.items.spawn('resistor-10k', { pos: onBench(150, -150), rotY: chair.yawCenter, drop: true });
sec(1);
const sp = aimItem(res);
step(1);
ok(I.target?.item === res && I.target.inReach, `con trỏ (${f1(sp.x)}, ${f1(sp.y)}) trên điện trở — trong tầm tay`);
B.client.in = true;
const tip = B._tipModel();
ok(tip && /10/.test(tip.name) && tip.desc.length > 5, `thẻ chú thích: "${tip?.name}" — ${tip?.desc}`);
ok(tip?.keys.some(([k, t]) => k === 'RMB' && /Nhặt/.test(t)), `phím trên thẻ: ${tip?.keys.map(([k, t]) => `${k} ${t}`).join(' · ')}`);
const picked = B.pickAt(sp.x, sp.y);
step(2);
ok(picked === res && I.heldItem === res, 'nhấp chuột phải → cầm điện trở');

// ============================================================ 5) bóng xem trước trên lỗ board
console.log('\n▶ 5) Bóng xem trước khớp lỗ board đục lỗ');
key('KeyT'); step(2);       // nhìn thẳng xuống bo để cắm
const holeTop = (id) => pb.def.padWorldPosition(pb, id, new THREE.Vector3(), 'top');
B.aimAt(holeTop('10,20')); step(1);
let pl = I.placement;
ok(pl?.kind === 'socket' && !pl.valid && /bẻ chân/i.test(pl.result?.reason || ''), `chưa bẻ chân → bóng đỏ: "${pl?.result?.reason}"`);
ok(game.sockets.ghost.visible && game.sockets.ghost.state === 'bad', 'bóng đỏ hiện trên board');
let tm = B._tipModel();
ok(tm?.cls === 'bad', `thẻ chú thích báo lỗi (${tm?.sub})`);
key('KeyB'); step(2);      // bẻ chân 90° (thao tác gốc của linh kiện)
ok(res.state.leadSpanN > 0, `B → bẻ chân (${res.state.leadSpanN} × 2.54 mm)`);
B.aimAt(holeTop('10,20')); step(1);
pl = I.placement;
ok(pl?.kind === 'socket' && pl.valid && pl.aligned && game.sockets.ghost.state === 'ok', `bóng xanh trên lỗ ${pl?.socket?.localId}`);
// chân của bóng trùng lỗ
const pins = res.def.getPins(res);
const near = pins.map((p) => {
  const w = new THREE.Vector3(p.pos[0], 0, p.pos[2]).applyMatrix4(pl.matrix);
  const h = pb.def.nearestHole(pb, w);
  const hw = holeTop(h.id);
  return { id: h.id, d: Math.hypot(w.x - hw.x, w.z - hw.z) };
});
ok(near.every((n) => n.d < 0.3), `chân bóng trùng tâm lỗ: ${near.map((n) => `${n.id} (${n.d.toFixed(2)} mm)`).join(', ')}`);
ok(I.heldItem.object.visible === false, 'vật thật ẩn khi có bóng (không che bóng)');
tm = B._tipModel();
ok(tm?.cls === 'ok' && /lỗ/.test(tm.sub), `thẻ: "${tm?.sub}"`);
// xoay 90° → hướng khác, Shift+R quay lại
const rs0 = I.rotSteps;
key('KeyR'); ok(I.rotSteps === (rs0 + 1) % 4, 'R → xoay 90°');
key('KeyR', true, { shift: true }); ok(I.rotSteps === rs0, 'Shift+R → xoay ngược');
step(1);
const nIns = events.length;
B.mouse(0, true); B.mouse(0, false);
sec(0.6);
ok(res.socket === `${pb.uid}:10,20` && since(nIns).some((e) => e.type === 'socket:inserted' && e.item === res), `chuột trái → cắm điện trở vào lỗ 10,20 (socket ${res.socket})`);
ok(res.object.visible && I.heldItem === null, 'điện trở hiện lại sau khi cắm, tay rảnh');
ok(S.partJoints(res).length === 2, 'điện trở xuyên 2 pad (minigame hàn nhận)');

// ============================================================ 6) IC cắm ngược
console.log('\n▶ 6) IC cắm ngược vào đế DIP-40');
key('KeyG'); step(2);
const sockIt = game.items.spawn('dip40-socket', { pos: onBench(-230, -60), rotY: chair.yawCenter, drop: true });
const pic = game.items.spawn('pic16f877a', { pos: onBench(-120, -160), rotY: chair.yawCenter, drop: true });
sec(1.2);
const pp = aimItem(pic); step(1);
ok(B.pickAt(pp.x, pp.y) === pic, 'nhặt PIC16F877A bằng chuột phải');
const dipS = game.sockets.ofOwner(sockIt).find((s) => s.kind === 'dip40');
const dipP = dipS.object3D.getWorldPosition(new THREE.Vector3());
B.aimAt(dipP); step(1);
pl = I.placement;
log('đế:', pl?.kind, pl?.socket?.kind, pl?.result?.orientation, pl?.result?.reason, 'rot', I.rotSteps);
ok(pl?.kind === 'socket' && pl.socket === dipS && pl.valid && pl.result.orientation === 'ok', `trỏ đế DIP-40 → cắm đúng chiều (bóng ${game.sockets.ghost.state})`);
const marks = polarityMarks(pic.def, pic.def.getPins?.(pic) ?? pic.def.pins);
ok(marks.some((m) => /Khấc/.test(m.text)), `nhãn khấc chân 1 cho IC: "${marks.map((m) => m.text).join(', ')}"`);
const pm = B._pinModel();
ok(pm.length >= 1 && pm[0].x > 0 && pm[0].x < W && pm[0].y > 0 && pm[0].y < H, `nhãn chân 1 nằm trong màn hình (${pm.map((p) => `${p.text}@${Math.round(p.x)},${Math.round(p.y)}`).join(' ')})`);
key('KeyX'); step(1);    // đảo 180°
pl = I.placement;
ok(pl?.valid && pl.result.orientation === 'reversed', `X → đảo 180°: orientation 'reversed' (vẫn cắm được)`);
ok(game.sockets.ghost.state === 'bad', 'bóng ĐỎ khi ngược chiều');
tm = B._tipModel();
ok(tm?.cls === 'bad' && /NGƯỢC/.test(tm.sub), `thẻ cảnh báo: "${tm?.sub}"`);
const nRev = events.length;
B.mouse(0, true); B.mouse(0, false);
sec(0.6);
ok(pic.socket === dipS.id && pic.socketInfo?.orientation === 'reversed', 'chuột trái → cắm NGƯỢC vào đế (hậu quả để dành khi cấp nguồn)');
ok(since(nRev).some((e) => e.type === 'socket:reversed' && e.item === pic), "phát 'socket:reversed' (minigame nguồn phát hiện được)");

// ============================================================ 7) hàn bằng con trỏ chuột
console.log('\n▶ 7) Hàn một mối bằng con trỏ chuột');
viseSock && game.world.props.vise.interact[0].spec.prompts[0].do();   // lật bo: mặt hàn lên
sec(3);
const st = labState(game).station;
st.on = true; st.setpoint = 350;
const ironT = game.inventory.slots.findIndex((t) => t?.def.id === 'soldering-iron');
const wireT = game.inventory.slots.findIndex((t) => t?.def.id === 'solder-wire');
const iron = game.inventory.slots[ironT];
key(`Digit${ironT + 1}`); key(`Digit${wireT + 1}`); step(30);
ok(B.active && game.inventory.rightTool === iron && game.inventory.leftTool?.def.id === 'solder-wire', 'phím số vẫn chọn dụng cụ ở bàn 3D: mỏ hàn (phải) + thiếc (trái)');
sec(70);
ok(iron.state.tipTemp > 320, `mũi hàn nóng ${f1(iron.state.tipTemp)} °C`);
const tip0 = iron.state.tip;
key('KeyT'); step(2);
ok(B.viewName === 'top' && iron.state.tip === tip0, `T ở bàn 3D = nhìn xuống bo, KHÔNG rút mũi hàn (mũi ${iron.state.tip})`);
const cp = S.contactPoints(pb, '10,20');
B.aimAt(cp.center); step(6);
const P = I.pointer;
ok(P.active && P.point && P.point.distanceTo(cp.center) < 2.0, `con trỏ chuột trên pad 10,20 (lệch ${f1(P.point?.distanceTo(cp.center))} mm)`);
B.client.in = true;
tm = B._tipModel();
ok(tm?.keys.some(([k, t]) => k === 'LMB' && /Hàn/.test(t)) && tm.keys.some(([k, t]) => k === 'RMB' && /thiếc/.test(t)), `thẻ: ${tm?.keys.map(([k, t]) => `${k} ${t}`).join(' · ')}`);
sec(0.8);
const tipHover = game.hands.right.tipWorldPosition(new THREE.Vector3());
ok(tipHover.distanceTo(cp.center) < 25 && game.hands.right.held?.visible !== false, `mũi hàn bay theo con trỏ (cách pad ${f1(tipHover.distanceTo(cp.center))} mm)`);
const nS = events.length;
B.mouse(0, true);
sec(1.6);
const touched = since(nS).some((e) => e.type === 'iron:contact' && e.padId === '10,20') || S.contact?.pad?.id === '10,20';
ok(touched, `giữ chuột trái → mũi chạm pad 10,20 (T pad ${f1(S.board(pb).byId.get('10,20').T)} °C)`);
B.mouse(2, true); sec(0.4);
{ const wt = game.hands.left.tipWorldPosition(new THREE.Vector3()), it2 = game.hands.right.tipWorldPosition(new THREE.Vector3());
  log('thiếc:', wt.toArray().map((v) => v.toFixed(1)).join(','), 'cách feed', f1(wt.distanceTo(cp.feed)), 'cách tâm', f1(wt.distanceTo(cp.center)), 'mỏ', f1(it2.distanceTo(cp.center)), 'uses', [...I.uses.keys()].join(','), 'reach L', game.hands.left.reachPoint?.toArray().map((v) => v.toFixed(0)).join(','), 'state', S._feedState, 'cam', camPos().toArray().map((v) => v.toFixed(0)).join(',')); }
sec(0.4); B.mouse(2, false);
sec(0.5);
B.mouse(0, false);
sec(3);
const je = since(nS).filter((e) => e.type === 'solder:joint' && e.padId === '10,20').pop();
log('sự kiện hàn:', [...new Set(since(nS).map((e) => e.type))].join(' '), 'pad', S.board(pb).byId.get('10,20').state, 'V', f1(S.board(pb).byId.get('10,20').V));
ok(!!je, `hàn bằng chuột ở bàn 3D → 'solder:joint' 10,20 (${je?.quality})`, je?.issues?.join('; ') || '');
ok(B.goal.el > 1.5, 'giữ chuột phải để mớm thiếc KHÔNG xoay camera (không kéo)');

// vật che camera: đẩy kẹp vào dưới kính hiển vi rồi nhìn thẳng xuống → camera dừng trước thân kính
const viseR = game.world.props.vise.interact[0].spec.prompts.find((p) => p.key === 'R');
viseR.do({ game }); sec(3);
key('KeyG'); step(2); key('KeyT'); sec(0.5);
const cOcc = camPos();
ok(B.viewName === 'top' && cOcc.y < ux.microscope.focal.y + 95 && B.effDist < B.cam.dist, `kẹp dưới kính hiển vi + T → camera dừng trước thân kính (cự li ${f1(B.effDist)} / ${f1(B.cam.dist)} mm)`);
viseR.do({ game }); sec(3);
key('KeyG'); step(2);

// ============================================================ 8) kính hiển vi · Tab · Space · cài đặt
console.log('\n▶ 8) Kính hiển vi · Tab · đứng dậy · cài đặt');
key('KeyM'); step(3);
const M = ux.microscope;
ok(M.active && game.app.viewCamera === M.cam && I.pointerRay?.camera === M.cam, 'M → kính hiển vi (con trỏ trong kính)');
ok(B.active && !game.app.locked, 'vẫn ở bàn 3D, chuột không khoá');
B.pointAt(W - 5, H / 2);
const ndcR = Math.hypot(ux.precision.ndc.x * (W / H), ux.precision.ndc.y);
ok(ndcR <= 0.901, `con trỏ bị giữ trong vòng thị kính (r=${ndcR.toFixed(2)})`);
key('Escape'); step(3);
ok(!M.active && game.app.viewCamera === null && B.active && I.pointerRay?.camera === game.camera, 'Esc → rời kính, về bàn 3D');
game.inventory.select(-1); step(20);
B.view('top'); step(2);
key('Tab'); step(3);
ok(!B.active && ux.seating.seated === chair && game.app.locked && !game.player.cameraOverride, 'Tab → góc nhìn thứ nhất (vẫn ngồi, khoá chuột)');
ok(Math.abs(camPos().y - eyeBody.y) < 80 && game.hands.right.visible, `camera về mắt người ngồi (y=${f1(camPos().y)}), tay hiện`);
key('Tab'); step(3);
ok(B.active && game.app.freeCursor && B.viewName === 'top', `Tab → lại bàn 3D (nhớ góc nhìn: ${B.viewName})`);
key('KeyG'); step(2);
// Esc khi cầm vật → đặt xuống chỗ con trỏ
const cap = game.items.spawn('cap-ceramic-100nf', { pos: onBench(60, -170), drop: true });
sec(1);
const cps = aimItem(cap); step(1);
B.pickAt(cps.x, cps.y); step(2);
ok(I.heldItem === cap, 'nhặt tụ 100 nF');
let dropP = null;
for (const [la, n] of [[0, -150], [-60, -170], [250, -120], [-350, -150], [120, -60]]) {
  dropP = new THREE.Vector3(...onBench(la, n)).setY(top); B.aimAt(dropP); step(1);
  if (I.placement?.kind === 'surface' && I.placement.valid) break;
}
log('đặt tụ:', I.placement?.kind, I.placement?.valid, I.placement?.reason, I.hit?.point?.toArray().map(Math.round).join(','), 'drop', dropP.toArray().map(Math.round).join(','));
key('Escape'); sec(0.5);
log('tụ ở', cap.object.getWorldPosition(new THREE.Vector3()).toArray().map(Math.round).join(','), 'menu', game.hud.menuOpen);
ok(!I.heldItem && cap.object.getWorldPosition(new THREE.Vector3()).distanceTo(dropP) < 40 && !game.hud.menuOpen, 'Esc khi cầm → đặt xuống chỗ con trỏ (không mở menu)');
// đứng dậy
const nSt = events.length;
key('Space'); sec(1);
ok(!B.active && !ux.seating.seated && since(nSt).some((e) => e.type === 'bench:exit') && since(nSt).some((e) => e.type === 'player:stand'), 'Space → đứng dậy, rời bàn 3D');
ok(game.app.locked && !game.app.freeCursor && !game.player.cameraOverride && !I.pointerRay && !I.bodyEye, 'khoá chuột lại, bỏ camera quỹ đạo / con trỏ');
ok(Math.abs(camPos().y - 1650) < 40 && game.hands.right.visible, `góc nhìn thứ nhất đứng (mắt ${f1(camPos().y)} mm)`);
const p0 = game.player.pos.clone();
game.app.input.keys.add('KeyS'); sec(0.5); game.app.input.keys.delete('KeyS');
ok(game.player.pos.distanceTo(p0) > 200, `S → đi lại được (lùi ${f1(game.player.pos.distanceTo(p0))} mm)`);
// tắt cài đặt → ngồi là góc nhìn thứ nhất
game.quality.set('benchMode', false);
ux.seating.sit(chair); step(10);
ok(ux.seating.seated === chair && !B.active, 'tắt "Ngồi vào bàn → chế độ 3D" → ngồi góc nhìn thứ nhất');
ux.seating.stand(); step(5);
const stored = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
ok(stored.benchMode === false, 'cài đặt lưu trong robovac.game.settings');
// enter() trực tiếp (API) vẫn chạy khi tắt cài đặt
ok(B.enter(chair) && B.active && ux.seating.seated === chair, 'bench.enter(seat) (API) ngồi + vào bàn 3D');
B.exit(); step(3);
ok(!B.active && ux.seating.seated === chair, 'bench.exit() → góc nhìn thứ nhất, vẫn ngồi');
ux.seating.stand(); step(5);

console.log(`\n${passes} đạt, ${fails} lỗi, console.error: ${consoleErrors} — ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fails || consoleErrors ? 1 : 0);
