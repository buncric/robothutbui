// Kiểm tra nhanh THẾ GIỚI game (phòng lab, prop, dụng cụ, linh kiện) KHÔNG cần trình duyệt:
//   node tools/game-world-smoke.mjs            → tất cả
//   node tools/game-world-smoke.mjs multimeter → chỉ những gì khớp từ khoá
// Dựng labRoom với game giả, dựng mọi prop + mọi item trong registry, gọi update/tool hooks vài trăm khung,
// in số mesh / tam giác. Lỗi trong file của nhóm world/tools → thoát mã 1; lỗi trong items/parts → chỉ cảnh báo.
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { MAT, PIN_COLORS, tint } from '../src/core/materials.js';
import * as geom from '../src/core/geom.js';
import { FX } from '../src/core/fx.js';

const SRC = fileURLToPath(new URL('../src/game/', import.meta.url));
const filter = process.argv[2] || '';
let fail = 0, warn = 0;
const t0 = Date.now();

const events = [];
function makeGame(preset = 'high') {
  const listeners = new Map();
  const registered = [], sockets = [];
  const game = {
    THREE, MAT, PIN_COLORS, tint, geom,
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(70, 16 / 9, 10, 50000),
    quality: { preset },
    events: {
      on(t, fn) { if (!listeners.has(t)) listeners.set(t, []); listeners.get(t).push(fn); },
      off(t, fn) { const a = listeners.get(t); if (a) a.splice(a.indexOf(fn) >>> 0, 1); },
      emit(t, p) { events.push(t); for (const fn of listeners.get(t) || []) fn(p); },
    },
    interact: { register(obj, spec) { if (!obj?.isObject3D) throw new Error('interact.register: object không phải Object3D'); if (!spec?.name || !Array.isArray(spec.prompts)) throw new Error(`interact spec thiếu name/prompts (${spec?.name})`); registered.push({ obj, spec }); } },
    sockets: { add(s) { if (!s.id || !s.kind || !s.object3D) throw new Error(`socket thiếu id/kind/object3D (${s.id})`); sockets.push(s); } },
    audio: { play() {} },
    hud: { toast() {} },
    time: { now: 0, dt: 1 / 60, scale: 1 },
  };
  game.fx = new FX(game.scene);
  game._registered = registered; game._sockets = sockets;
  return game;
}

function stats(root) {
  let meshes = 0, tris = 0, inst = 0, mats = new Set();
  root.traverse((o) => {
    if (!o.isMesh || o.material?.visible === false) return;
    meshes++; mats.add(o.material);
    const g = o.geometry, t = (g.index ? g.index.count : g.attributes.position.count) / 3;
    if (o.isInstancedMesh) { inst++; tris += t * o.count; } else tris += t;
  });
  return { meshes, tris: Math.round(tris), instanced: inst, materials: mats.size };
}
function checkFinite(root, label) {
  root.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(root);
  const s = bb.getSize(new THREE.Vector3());
  if (![s.x, s.y, s.z].every(Number.isFinite)) throw new Error(`${label}: bounding box NaN/Infinity`);
  return s;
}
const fmt = (n) => n.toLocaleString('en-US');
const ok = (m) => console.log(`✓ ${m}`);
const bad = (m, e) => { console.log(`✗ ${m}\n    ${e?.stack?.split('\n').slice(0, 4).join('\n    ') || e}`); fail++; };
const wrn = (m, e) => { console.log(`⚠ ${m}\n    ${String(e?.message || e).split('\n')[0]}`); warn++; };

// ------------------------------------------------------------ registry (nạp module bằng fs vì Node không có import.meta.glob)
const registry = await import(pathToFileURL(join(SRC, 'items/registry.js')).href);
const loadErrors = [];
for (const sub of ['tools', 'parts']) {
  const dir = join(SRC, 'items', sub);
  if (!existsSync(dir)) continue;
  const rec = {};
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.js')).sort()) {
    try { rec[`./${sub}/${f}`] = await import(pathToFileURL(join(dir, f)).href); }
    catch (e) { loadErrors.push({ sub, f, e }); }
  }
  registry.registerItemModules(rec);
}
for (const { sub, f, e } of loadErrors) (sub === 'tools' ? bad : wrn)(`nạp items/${sub}/${f}`, e);

// ------------------------------------------------------------ phòng lab
let room = null;
if (!filter || 'labroom'.includes(filter.toLowerCase())) {
  for (const preset of ['low', 'high']) {
    try {
      const game = makeGame(preset);
      const { build } = await import(pathToFileURL(join(SRC, 'world/labRoom.js')).href);
      const t = Date.now();
      const w = build(game);
      const ms = Date.now() - t;
      if (!w?.root?.isObject3D) throw new Error('build() phải trả { root }');
      for (const k of ['colliders', 'surfaces', 'lights']) if (!Array.isArray(w[k])) throw new Error(`thiếu mảng ${k}`);
      if (!w.spawn?.pos || w.spawn.pos.length !== 3) throw new Error('spawn.pos sai');
      if (!w.colliders.every((b) => b.isBox3 && !b.isEmpty())) throw new Error('collider không phải Box3 hợp lệ');
      if (!w.surfaces.every((m) => m.isMesh)) throw new Error('surface không phải Mesh');
      for (const a of ['bench-solder', 'bench-assembly', 'bench-test', 'station-solder', 'psu', 'scope', 'vise', 'door-house']) if (!w.anchors?.[a]?.isObject3D) throw new Error(`thiếu anchor ${a}`);
      if (!Object.keys(w.anchors).some((k) => k.startsWith('drawer-'))) throw new Error('thiếu anchor drawer-*');
      if (!Object.keys(w.anchors).some((k) => k.startsWith('shelf-'))) throw new Error('thiếu anchor shelf-*');
      game.scene.add(w.root);
      for (let i = 0; i < 300; i++) { game.time.now += 1 / 60; w.update?.(1 / 60, game.time.now); game.fx.update(1 / 60); }
      // bấm thử mọi prompt đã đăng ký
      let pressed = 0;
      for (const { obj, spec } of game._registered) for (const p of spec.prompts) {
        const ctx = { game, target: obj, hit: { object: obj, point: obj.getWorldPosition(new THREE.Vector3()) }, instance: null };
        if (p.when && !p.when(ctx)) continue;
        p.do?.(ctx); pressed++;
        spec.onScroll?.(ctx, 1); spec.onDrag?.(ctx, 12, 0);
      }
      for (let i = 0; i < 120; i++) { game.time.now += 1 / 60; w.update?.(1 / 60, game.time.now); }
      checkFinite(w.root, 'labRoom');
      const s = stats(w.root);
      const shadow = w.lights.filter((l) => l.castShadow).length;
      ok(`labRoom [${preset}] dựng ${ms} ms · ${s.meshes} mesh (${s.instanced} instanced) · ${fmt(s.tris)} tam giác · ${s.materials} vật liệu · ${w.lights.length} đèn (${shadow} đổ bóng) · ${w.colliders.length} collider · ${w.surfaces.length} surface · ${Object.keys(w.anchors).length} anchor · ${game._registered.length} tương tác (${pressed} prompt bấm thử) · ${(w.sockets || []).length} socket phòng (+${game._sockets.length - (w.sockets || []).length} của item lấy từ ngăn kéo) · ${(w.items || []).length} item bày sẵn`);
      if (preset === 'high') room = { w, game, s };
    } catch (e) { bad(`labRoom [${preset}]`, e); }
  }
  if (room) {
    const names = Object.keys(room.w.anchors);
    const drawers = names.filter((n) => n.startsWith('drawer-'));
    console.log(`    anchors: ${names.filter((n) => !n.startsWith('drawer-')).join(', ')} + ${drawers.length} × drawer-* (${drawers.slice(0, 3).join(', ')}…)`);
  }
}

// ------------------------------------------------------------ prop đứng riêng
const propDir = join(SRC, 'world/props');
for (const f of existsSync(propDir) ? readdirSync(propDir).filter((f) => f.endsWith('.js') && !f.startsWith('_')).sort() : []) {
  if (filter && !f.includes(filter)) continue;
  try {
    const game = makeGame('high');
    const mod = await import(pathToFileURL(join(propDir, f)).href);
    const p = mod.build(game);
    if (!p?.object?.isObject3D) throw new Error('build() phải trả { object }');
    game.scene.add(p.object);
    for (const it of p.interact || []) game.interact.register(it.object, it.spec);
    for (const s of p.sockets || []) game.sockets.add(s);
    for (let i = 0; i < 200; i++) p.update?.(1 / 60);
    for (const { obj, spec } of game._registered) for (const pr of spec.prompts) {
      const ctx = { game, target: obj, hit: { object: obj }, instance: null };
      if (pr.when && !pr.when(ctx)) continue;
      pr.do?.(ctx);
    }
    for (const s of game._sockets) { const pose = s.pose; if (pose && !pose.isMatrix4) throw new Error(`socket ${s.id}: pose không phải Matrix4`); s.accepts?.({ def: { id: 'perfboard', category: 'pcb', size: [90, 1.6, 150], plug: 'banana' }, state: {} }); }
    for (let i = 0; i < 200; i++) p.update?.(1 / 60);
    const sz = checkFinite(p.object, f);
    const s = stats(p.object);
    ok(`prop ${f.padEnd(22)} ${String(s.meshes).padStart(3)} mesh · ${fmt(s.tris).padStart(7)} tam giác · ${Math.round(sz.x)}×${Math.round(sz.y)}×${Math.round(sz.z)} mm · ${(p.interact || []).length} tương tác · ${(p.sockets || []).length} socket`);
  } catch (e) { bad(`prop ${f}`, e); }
}

// ------------------------------------------------------------ item
const defs = registry.allItemDefs();
const tools = defs.filter((d) => registry.kindOf(d) === 'tool');
const parts = defs.filter((d) => registry.kindOf(d) !== 'tool');
console.log(`\nregistry: ${tools.length} dụng cụ, ${parts.length} linh kiện`);
for (const d of [...tools, ...parts]) {
  if (filter && !d.id.includes(filter)) continue;
  const isTool = registry.kindOf(d) === 'tool';
  const report = isTool ? bad : wrn;
  try {
    const game = makeGame('high');
    if (room) Object.assign(game, { lab: undefined });
    for (const k of ['id', 'name', 'build']) if (!d[k]) throw new Error(`thiếu ${k}`);
    if (isTool) {
      if (!d.grip?.pose) throw new Error('thiếu grip.pose');
      if (!Array.isArray(d.tool?.tip) || d.tool.tip.length !== 3) throw new Error('thiếu tool.tip [x,y,z]');
      for (const h of ['onUseStart', 'onUseHold', 'onUseEnd', 'hud']) if (typeof d.tool[h] !== 'function') throw new Error(`thiếu tool.${h}`);
    }
    const inst = registry.spawnItem(game, d.id, { pos: [0, 750, 0] });
    if (!inst?.object?.isObject3D) throw new Error('spawnItem thất bại');
    if (game.lab?.station) { game.lab.station.on = true; game.lab.station.setpoint = 350; }
    const target = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 10), new THREE.MeshBasicMaterial());
    target.userData.ironCleaner = undefined;
    game.scene.add(target);
    const ctx = { game, target, hit: { object: target, point: new THREE.Vector3(0, 760, 0) }, instance: inst };
    for (let i = 0; i < 240; i++) {
      d.update?.(inst, 1 / 60, game);
      if (isTool) {
        if (i === 30) d.tool.onUseStart(ctx);
        if (i > 30 && i < 120) d.tool.onUseHold(ctx, 1 / 60);
        if (i === 120) d.tool.onUseEnd(ctx);
        if (i === 150) for (const k of d.tool.keys || []) k.do?.({ ...ctx });
      }
    }
    // 60 s mô phỏng (mô hình nhiệt)
    for (let i = 0; i < 60; i++) d.update?.(inst, 1, game);
    const hud = isTool ? d.tool.hud(inst) : '';
    if (isTool && typeof hud !== 'string') throw new Error('hud() phải trả chuỗi');
    checkFinite(inst.object, d.id);
    const s = stats(inst.object);
    const bb = new THREE.Box3().setFromObject(inst.object).getSize(new THREE.Vector3());
    const extra = d.id === 'soldering-iron' ? ` · sau 60 s ở 350 °C: ${inst.state.tipTemp.toFixed(0)} °C` : '';
    ok(`${isTool ? 'tool' : 'part'} ${d.id.padEnd(18)} ${String(s.meshes).padStart(3)} mesh · ${fmt(s.tris).padStart(7)} tam giác · ${Math.round(bb.x)}×${Math.round(bb.y)}×${Math.round(bb.z)} mm${hud ? ` · HUD "${hud}"` : ''}${extra}`);
  } catch (e) { report(`${isTool ? 'tool' : 'part'} ${d.id}`, e); }
}

// ------------------------------------------------------------ mô hình nhiệt mỏ hàn: τ ≈ 20 s
const iron = registry.getItemDef('soldering-iron');
if (iron && (!filter || 'soldering-iron'.includes(filter))) {
  try {
    const game = makeGame('high');
    const inst = registry.spawnItem(game, 'soldering-iron', {});
    game.lab.station.on = true; game.lab.station.setpoint = 350;
    let t63 = null;
    const T0 = inst.state.tipTemp, target = T0 + (350 - T0) * 0.632;
    for (let i = 1; i <= 120 * 20; i++) { iron.update(inst, 1 / 20, game); if (t63 === null && inst.state.tipTemp >= target) t63 = i / 20; }
    if (!(t63 > 12 && t63 < 30)) throw new Error(`τ đo được ${t63} s (mong đợi ≈ 20 s)`);
    if (Math.abs(inst.state.tipTemp - 350) > 3) throw new Error(`sau 120 s: ${inst.state.tipTemp.toFixed(1)} °C`);
    const ox = inst.state.oxidation, T120 = inst.state.tipTemp;
    iron.clean(inst, 'sponge', game, null);
    ok(`mô hình nhiệt mỏ hàn: τ63 = ${t63.toFixed(1)} s · 120 s → ${T120.toFixed(1)} °C · oxy hoá ${ox.toFixed(3)} → lau bọt biển ${inst.state.oxidation.toFixed(3)} (mũi tụt ${(T120 - inst.state.tipTemp).toFixed(0)} °C)`);
  } catch (e) { bad('mô hình nhiệt mỏ hàn', e); }
}

// ------------------------------------------------------------ lượt 2: canvas GIẢ (chạy mọi đoạn vẽ CanvasTexture)
// Node không có document → lượt 1 bỏ qua code vẽ. Lượt này dựng lại với document/canvas giả (mọi lệnh vẽ là no-op)
// để bắt lỗi JS trong hàm vẽ (bảng LED 7 đoạn, LCD, poster…). Dùng preset khác để không trúng cache texture null.
if (!filter && typeof globalThis.document === 'undefined') {
  const fakeCanvas = () => {
    const c = { width: 300, height: 150, style: {} };
    const store = {};
    const ctx = new Proxy(store, {
      get(t, k) {
        if (k in t) return t[k];
        if (k === 'canvas') return c;
        if (k === 'measureText') return (s) => ({ width: String(s).length * 7 });
        if (k === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
        if (k === 'getImageData') return (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
        if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() {} });
        return () => {};
      },
      set(t, k, v) { if (typeof v === 'number' && !Number.isFinite(v) && k !== 'globalAlpha') throw new Error(`ctx.${String(k)} = ${v}`); t[k] = v; return true; },
    });
    c.getContext = () => ctx;
    return c;
  };
  globalThis.document = { createElement: (tag) => (tag === 'canvas' ? fakeCanvas() : { style: {} }) };
  let n = 0;
  try {
    const game = makeGame('ultra');
    const { build } = await import(pathToFileURL(join(SRC, 'world/labRoom.js')).href);
    const w = build(game);
    for (let i = 0; i < 90; i++) w.update?.(1 / 30);
    for (const { obj, spec } of game._registered) for (const p of spec.prompts) { const ctx = { game, target: obj, hit: { object: obj } }; if (!p.when || p.when(ctx)) p.do?.(ctx); }
    for (let i = 0; i < 90; i++) w.update?.(1 / 30);
    game.events.emit('scope:data', { ch: 1, samples: Array.from({ length: 200 }, (_, k) => (k % 50 < 25 ? 5 : 0)), vdiv: 2, tdiv: 1e-4 });
    for (let i = 0; i < 10; i++) w.update?.(1 / 10);
    n++;
    for (const d of registry.allItemDefs().filter((x) => registry.kindOf(x) === 'tool')) {
      const g2 = makeGame('medium');
      const inst = registry.spawnItem(g2, d.id, {});
      const ctx = { game: g2, target: null, hit: null, instance: inst };
      for (let i = 0; i < 30; i++) { d.update?.(inst, 1 / 30, g2); if (i === 5) d.tool.onUseStart(ctx); if (i === 6) d.tool.onUseEnd(ctx); }
      for (const k of d.tool.keys || []) k.do?.(ctx);
      d.tool.onScroll?.(ctx, 1);
      for (let i = 0; i < 10; i++) d.update?.(inst, 1 / 30, g2);
      n++;
    }
    ok(`lượt canvas giả: phòng lab + ${n - 1} dụng cụ vẽ CanvasTexture không lỗi`);
  } catch (e) { bad('lượt canvas giả (code vẽ canvas)', e); }
  delete globalThis.document;
}

const uniq = [...new Set(events)];
console.log(`\nsự kiện đã phát (${uniq.length} loại): ${uniq.join(', ')}`);
console.log(`\n${fail ? '✗' : '✓'} ${fail} lỗi, ${warn} cảnh báo — ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
