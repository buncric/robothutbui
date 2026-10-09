// =============================================================================
// main.js — Khởi động RoboVac Lab Simulator (game.html).
//
//   createGame(opts) dựng toàn bộ đối tượng `game` (GAME_API §2) — dùng chung cho trình duyệt và smoke test Node:
//     opts = { container, headless, storage, worldModule, registryModule, itemDefs, onProgress }
//     worldModule / registryModule: undefined → tự import('./world/labRoom.js') / ('./items/registry.js');
//                                   null → bỏ qua (dùng phòng thử + item thử dựng sẵn trong engine/testkit.js)
//   Trình duyệt: màn hình "Nhấn để bắt đầu" → khoá chuột → vòng lặp (logic 60 Hz + vẽ theo rAF).
//   Mất khoá chuột (Esc) → tạm dừng + menu. Tự lưu mỗi 30 s và khi tạm dừng.
//   [bàn 3D] app.freeCursor = true (ux/bench.js): chuột cố ý không khoá → không tạm dừng khi nhả khoá, không tự khoá lại khi bấm canvas;
//   Esc (tay không) → game.pauseMenu() · "Tiếp tục" chỉ bỏ tạm dừng (không khoá chuột).
// =============================================================================
import * as THREE from 'three';
import { MAT, PIN_COLORS, tint } from '../core/materials.js';
import * as geom from '../core/geom.js';
import { FX } from '../core/fx.js';
import { Events } from './engine/events.js';
import { Quality } from './engine/quality.js';
import { createApp, FIXED_DT } from './engine/app.js';
import { Audio } from './engine/audio.js';
import { createTextures } from './engine/textures.js';
import { Player } from './engine/player.js';
import { Hands } from './engine/hands.js';
import { Items } from './engine/items.js';
import { Sockets } from './engine/sockets.js';
import { Interact } from './engine/interact.js';
import { SubParts } from './engine/subparts.js';
import { Inventory } from './engine/inventory.js';
import { Hud } from './engine/hud.js';
import { Quests, defineDemoQuest } from './engine/quests.js';
import { Save } from './engine/save.js';
import { buildTestRoom, registerTestItems } from './engine/testkit.js';
// [minigame hàn] mô hình mối hàn + nhiệm vụ M1 (thêm bởi minigames/soldering.js — xem GAME_API §9)
import { Soldering } from './minigames/soldering.js';
import { defineM1HanPic } from './quests/m1-han-pic.js';
// [đi dây / đo / cấp nguồn] netlist sống + bộ giải mạch src/circuit + đồng hồ vạn năng + nhiệm vụ M0 (minigames/{netlist,wiring,power,measuring}.js)
import { initCircuitGames } from './minigames/power.js';
import { defineM0LedQuest } from './quests/m0-led.js';
// [nhiệm vụ] chuỗi nhiệm vụ đồ án M2–M6 (nạp PIC, cây nguồn 5 V, 74HC32 + DRV8871, mổ xác robot, lắp & chạy thử) + bảng nhiệm vụ (phím J)
import { defineMissionChain } from './quests/missions.js';
// [UX] gợi ý phím theo ngữ cảnh · ngồi ghế · thao tác tỉ mỉ · kính hiển vi · laptop (engine/ux/*)
import { UX } from './engine/ux/index.js';

// Module tuỳ chọn (do người khác viết, có thể chưa tồn tại): Vite dùng import.meta.glob (file thiếu → {} chứ không lỗi build),
// Node (smoke test) không có import.meta.glob → import() động.
let OPTIONAL = null;
try { OPTIONAL = { ...import.meta.glob('./world/labRoom.js'), ...import.meta.glob('./items/registry.js') }; } catch { OPTIONAL = null; }
async function loadOptional(rel) {
  if (OPTIONAL) { const f = OPTIONAL[rel]; return f ? f() : null; }
  return import(/* @vite-ignore */ new URL(rel, import.meta.url).href);
}

/** Chuẩn hoá kết quả world.build(): colliders → Box3[], surfaces → Object3D[] */
function normalizeWorld(w) {
  const toBox = (c) => {
    if (!c) return null;
    if (c.isBox3) return c;
    if (c.isObject3D) { c.updateWorldMatrix(true, true); return new THREE.Box3().setFromObject(c); }
    if (c.min && c.max) return new THREE.Box3(new THREE.Vector3(c.min.x ?? c.min[0], c.min.y ?? c.min[1], c.min.z ?? c.min[2]), new THREE.Vector3(c.max.x ?? c.max[0], c.max.y ?? c.max[1], c.max.z ?? c.max[2]));
    return null;
  };
  w.colliders = (w.colliders || []).map(toBox).filter((b) => b && !b.isEmpty());
  w.surfaces = (w.surfaces || []).filter((s) => s?.isObject3D);
  w.lights = w.lights || [];
  const sp = w.spawn || {};
  const pos = sp.pos ? (Array.isArray(sp.pos) ? sp.pos : [sp.pos.x, sp.pos.y, sp.pos.z]) : [0, 0, 1500];
  w.spawn = { pos, yaw: sp.yaw ?? 0, pitch: sp.pitch ?? 0 };
  return w;
}

/** Labroom không tự đặt item nào → bày mọi linh kiện lên mặt bàn lớn nhất */
function spawnDemoLayout(game) {
  const parts = game.items.defs().filter((d) => d.kind !== 'tool' && !d.hidden && !d.generated);
  if (!parts.length) return;
  let best = null;
  for (const s of game.world.surfaces) {
    const b = new THREE.Box3().setFromObject(s);
    const area = (b.max.x - b.min.x) * (b.max.z - b.min.z);
    if (b.max.y > 600 && b.max.y < 1100 && (!best || area > best.area)) best = { b, area };
  }
  if (!best) return;
  const { b } = best;
  const step = 110, cols = Math.max(1, Math.floor((b.max.x - b.min.x - 100) / step));
  parts.slice(0, 40).forEach((d, i) => {
    const x = b.min.x + 80 + (i % cols) * step, z = b.max.z - 120 - Math.floor(i / cols) * step;
    if (z < b.min.z + 60) return;
    try { game.items.spawn(d.id, { pos: [x, b.max.y + 40, z], rotY: 0, drop: true }); } catch (e) { console.warn('[game] không sinh được', d.id, e); }
  });
}

export async function createGame(opts = {}) {
  const { container = null, headless = false, storage, onProgress = () => {} } = opts;
  const events = new Events();
  const quality = new Quality(events, storage);
  const app = await createApp({ container, quality, events, headless });
  const game = {
    THREE, app, scene: app.scene, camera: app.camera, events, quality,
    MAT, PIN_COLORS, tint, geom,
    time: { now: 0, dt: FIXED_DT, scale: 1 },
    circuit: null,
    world: { colliders: [], surfaces: [], lights: [] },
    started: false,
  };
  game.audio = new Audio(game);
  game.fx = new FX(app.scene);
  game.textures = createTextures(game);
  game.hud = new Hud(game, null);
  game.player = new Player(game);
  game.hands = new Hands(game);
  game.items = new Items(game);
  game.sockets = new Sockets(game);
  game.interact = new Interact(game);
  game.subparts = new SubParts(game);
  game.inventory = new Inventory(game);
  game.quests = new Quests(game);
  game.save = new Save(game, storage);
  // [minigame hàn] khởi tạo SỚM để thấy mọi 'item:spawned' (board, linh kiện) — lỗi ở đây không được làm hỏng game
  try { game.soldering = new Soldering(game); } catch (e) { console.error('[game] minigame hàn lỗi khởi tạo', e); game.soldering = null; }
  registerTestItems(game.items);
  for (const d of opts.itemDefs || []) game.items.register(d);

  // ---- sổ đăng ký item (items/registry.js)
  onProgress('Nạp danh mục dụng cụ & linh kiện…');
  let reg = opts.registryModule;
  if (reg === undefined) {
    try { reg = await loadOptional('./items/registry.js'); } catch (e) { console.warn('[game] chưa có items/registry.js → dùng item thử', e?.message || e); reg = null; }
  }
  if (reg?.getItemDef) {
    game.registry = reg;
    game.items.setRegistry({ getDef: reg.getItemDef, allDefs: reg.allItemDefs || reg.allDefs || (() => []) });
  }
  if (!headless) {
    await game.items.loadCadSupport();
    // manifest CAD (bộ phận con tương tác): không chặn khởi động quá 2 s
    await Promise.race([game.subparts.loadManifest(), new Promise((r) => setTimeout(r, 2000))]);
  }

  // ---- phòng lab (world/labRoom.js)
  onProgress('Dựng phòng lab…');
  let worldMod = opts.worldModule;
  if (worldMod === undefined) {
    try { worldMod = await loadOptional('./world/labRoom.js'); } catch (e) { console.warn('[game] chưa có world/labRoom.js → dùng phòng thử', e?.message || e); worldMod = null; }
  }
  let world = null;
  const build = worldMod?.build || worldMod?.default?.build || (typeof worldMod?.default === 'function' ? worldMod.default : null);
  if (build) {
    try { world = await build(game); } catch (e) { console.error('[game] labRoom.build lỗi → dùng phòng thử', e); world = null; game.worldError = e; }
  }
  if (!world?.root?.isObject3D) { world = buildTestRoom(game); world.isTest = true; }
  normalizeWorld(world);
  if (!world.root.parent) app.scene.add(world.root);
  world.root.updateMatrixWorld(true);
  game.world = world;

  // ---- vật thể trong phòng
  onProgress('Bày dụng cụ & linh kiện…');
  for (const s of world.items || []) {
    try { game.items.spawn(s.id, s); } catch (e) { console.warn('[game] không sinh được item', s?.id, e); }
  }
  if (!world.isTest && game.items.all.length === 0) spawnDemoLayout(game);
  game.inventory.init();
  game.player.teleport(world.spawn.pos, world.spawn.yaw, world.spawn.pitch);

  // [đi dây / đo / cấp nguồn] tạo game.netlist · game.wiring · game.power · game.circuit · game.measuring (+ game.tickers 60 Hz)
  try { initCircuitGames(game); } catch (e) { console.error('[game] minigame mạch điện lỗi khởi tạo', e); }
  // [UX] sau world + item + khe: tìm ghế, kính hiển vi, đăng ký hành động bổ sung
  try { game.ux = new UX(game).init(); } catch (e) { console.error('[game] UX lỗi khởi tạo', e); game.ux = null; }

  // ---- nhiệm vụ
  defineDemoQuest(game.quests);
  try { defineM0LedQuest(game); } catch (e) { console.warn('[game] nhiệm vụ m0-led lỗi', e); }   // [đi dây / đo / cấp nguồn]
  try { defineM1HanPic(game); } catch (e) { console.warn('[game] nhiệm vụ m1-han-pic lỗi', e); }   // [minigame hàn]
  try { defineMissionChain(game); } catch (e) { console.warn('[game] chuỗi nhiệm vụ M2–M6 lỗi', e); }   // [nhiệm vụ]
  for (const q of world.quests || []) { try { game.quests.define(q); } catch (e) { console.warn('[game] nhiệm vụ lỗi', e); } }

  // ---- đồ hoạ theo chất lượng
  await app.applyQuality();
  app.applyShadows();
  quality.onChange((key, v) => { if (key === 'volume') game.audio.setVolume(v); });
  // âm thanh / hiệu ứng chung theo sự kiện
  events.on('footstep', (e) => game.audio.play('footstep', { vol: e.crouch ? 0.18 : e.run ? 0.5 : 0.32, rate: e.run ? 1.25 : 1 }));
  events.on('fault', () => game.hud.flash('danger'));

  // ---- vòng lặp
  app.start({
    fixed(dt) {
      game.time.dt = dt * game.time.scale;
      game.time.now += game.time.dt;
      game.player.fixedUpdate(dt);
      game.items.fixedUpdate(game.time.dt);
      game.interact.fixedUpdate(dt);
      // [minigame hàn] SAU interact (ghi đè điểm với tay khi bám mối hàn, đọc dụng cụ đang dùng)
      if (game.soldering) { try { game.soldering.fixedUpdate(game.time.dt); } catch (e) { if (!game._solderErr) { game._solderErr = true; console.error('[game] soldering.fixedUpdate lỗi', e); } } }
      try { world.update?.(game.time.dt, game); } catch (e) { if (!world._updErr) { world._updErr = true; console.error('[game] world.update lỗi', e); } }
      // [đi dây / đo / cấp nguồn] SAU world.update (nguồn bàn đã cập nhật núm/OUTPUT): đi dây → bộ giải mạch → đồng hồ đo
      for (const f of game.tickers || []) { try { f(game.time.dt); } catch (e) { if (!game._tickErr) { game._tickErr = true; console.error('[game] ticker lỗi', e); } } }
    },
    frame(dt, alpha) {
      game.player.frameUpdate(dt, alpha);
      game.hands.update(dt);
      if (!app.paused) {
        game.items.frameUpdate(dt);
        game.sockets.update(dt);
        game.subparts.update(dt);
        game.fx.update(dt);
        if (game.soldering) { try { game.soldering.frameUpdate(dt); } catch (e) { if (!game._solderFErr) { game._solderFErr = true; console.error('[game] soldering.frameUpdate lỗi', e); } } }   // [minigame hàn]
        game.inventory.update(dt);
        game.quests.update(dt);
        if (game.started) game.save.update(dt);
      }
      game.interact.update(dt);
      if (game.ux) game.ux.update(dt);     // [UX] sau interact (đọc mục tiêu / con trỏ), trước HUD
      game.audio.update();
      game.hud.update(dt);
    },
  });
  return game;
}

// =============================================================================
// Trình duyệt
// =============================================================================
async function boot() {
  const container = document.getElementById('game');
  // màn hình chờ đơn giản trong lúc nạp
  const pre = document.createElement('div');
  pre.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#9fb3c8;font:15px system-ui;background:#0b0f14;z-index:30';
  pre.textContent = 'Đang khởi động RoboVac Lab Simulator…';
  document.body.appendChild(pre);
  let game;
  try {
    game = await createGame({ container, onProgress: (t) => { pre.textContent = t; } });
  } catch (e) {
    console.error(e);
    pre.innerHTML = `<div style="max-width:560px;text-align:center"><b style="color:#ff8f8f">Không khởi động được game</b><br><small>${String(e?.message || e)}</small><br><br><a style="color:#7fd8ff" href="./index.html">← Về Lab 3D</a></div>`;
    return;
  }
  pre.remove();
  window.game = game;       // tiện gỡ lỗi trong console
  const { app, hud, save, events } = game;

  // bản lưu cũ
  let saveInfo = null;
  if (save.has()) {
    const data = save.load();
    if (data) { save.apply(data); saveInfo = save.info(); }
  }
  if (!game.quests.active && !game.quests.progress('lam-quen-lab')?.done) game.quests.start('lam-quen-lab');
  if (game.worldError) setTimeout(() => hud.toast('Không dựng được phòng lab chi tiết — đang dùng phòng thử', { kind: 'warn' }), 500);

  const newGame = () => { save.enabled = false; save.clear(); location.reload(); };
  const resume = async () => {
    game.audio.unlock();
    if (app.freeCursor) { app.setPaused(false); hud.hidePause(); game.audio.suspend(false); return; }   // [bàn 3D] chuột tự do
    const ok = await app.lockPointer();
    if (!ok) hud.toast('Trình duyệt chưa cho khoá chuột — bấm vào màn hình thêm lần nữa', { kind: 'warn', short: true });
  };
  const start = () => {
    hud.hideStart();
    hud.show(true);
    game.started = true;
    resume();
  };
  hud.showStart({ onStart: start, onNewGame: newGame, saveInfo });
  const pauseCb = { onResume: resume, onSave: () => save.save('manual'), onNewGame: newGame };
  hud._pauseCb = pauseCb;
  /** [bàn 3D] mở menu tạm dừng khi chuột không khoá (Esc ở chế độ bàn 3D) */
  game.pauseMenu = () => {
    if (!game.started || hud.menuOpen) return;
    app.setPaused(true);
    save.save('pause');
    game.audio.suspend(true);
    hud.showPause(pauseCb);
  };

  events.on('pointerlock:change', ({ locked }) => {
    if (!game.started) return;
    if (app.uiMode === 'laptop') return;      // [UX] cửa sổ laptop nhả chuột — không mở menu tạm dừng
    if (app.freeCursor && !locked) return;    // [bàn 3D] chế độ bàn 3D cố ý nhả chuột
    if (locked) {
      app.setPaused(false);
      hud.hidePause();
      game.audio.suspend(false);
    } else {
      if (game.inventory.bagOpen) game.inventory.toggleBag(false);
      app.setPaused(true);
      save.save('pause');
      game.audio.suspend(true);
      hud.showPause(pauseCb);
    }
  });
  // bấm vào canvas khi đang chơi mà mất khoá (vd đổi tab) → khoá lại
  app.renderer.domElement.addEventListener('click', () => { if (game.started && !app.locked && !hud.menuOpen && !app.freeCursor) resume(); });
  events.on('input:key', (e) => {
    // e._ux: chính phím Esc này vừa mở menu ở chế độ bàn 3D → không đóng lại ngay
    if (e.down && e.code === 'Escape' && game.started && app.paused && hud.menuOpen && !e._ux) resume();
  });
  window.addEventListener('beforeunload', () => { if (game.started) save.save('auto'); });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined' && document.getElementById('game')) boot();
