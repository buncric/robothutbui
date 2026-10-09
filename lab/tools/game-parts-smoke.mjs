// Kiểm tra nhanh thư viện linh kiện game (src/game/items/parts/*.js) KHÔNG cần trình duyệt:
//   node tools/game-parts-smoke.mjs            → tất cả
//   node tools/game-parts-smoke.mjs pic        → chỉ các id/tên file chứa "pic"
// Dựng mỗi linh kiện với game giả ({ THREE, MAT, geom, quality:{preset:'high'} }), kiểm tra trường bắt buộc (§7),
// số chân IC, khe cắm (sockets) gọi được + accepts() trả { ok }, bẻ/cắt chân, update(); in số mesh / tam giác.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { MAT } from '../src/core/materials.js';
import * as geom from '../src/core/geom.js';

if (typeof globalThis.document !== 'undefined') console.warn('⚠ document tồn tại — smoke test nên chạy trong Node thuần');

const dir = fileURLToPath(new URL('../src/game/items/parts/', import.meta.url));
const filter = process.argv[2];
const files = readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
const shared = await import(pathToFileURL(join(dir, '_shared.js')).href);
const { countTris } = shared;

const EXPECT_PINS = {
  pic16f877a: 40, sn74hc32n: 14, 'dip40-socket': 40, 'dip14-socket': 14, irlz44n: 3, ss34: 2, '1n5819': 2,
  'header-male-1x40': 40, 'header-female-1x20': 20, 'jst-xh-2': 2, 'jst-xh-3': 3, 'jst-xh-4': 4,
  'esp32-s3-devkitc-1': 44, 'arduino-uno-r3': 32, 'bss138-4ch-module': 12, 'mpu6050-gy521': 8, 'drv8871-module': 8,
  'xiao-esp32s3-sense': 14, 'crystal-20mhz-hc49s': 2, 'cap-elec-1000uf-25v': 2, 'led-5mm-red': 2,
};
const SOCKET_EXPECT = { 'perfboard-9x15': 'pcb-hole', 'breadboard-830': 'bb-hole', 'dip40-socket': 'dip40', 'dip14-socket': 'dip14', 'header-female-1x20': 'header-female' };
const TRI_LIMIT = 40000;

const game = {
  THREE, MAT, geom, quality: { preset: 'high' },
  events: { emit() {}, on() {}, off() {} },
  time: { now: 0, dt: 1 / 60, scale: 1 },
};

const defs = [];
let fail = 0;
for (const f of files) {
  const mod = await import(pathToFileURL(join(dir, f)).href).catch((e) => ({ __err: e }));
  if (mod.__err) { console.log(`✗ ${f}: LỖI nạp — ${mod.__err.stack?.split('\n').slice(0, 3).join(' | ')}`); fail++; continue; }
  if (f.startsWith('_')) { if (mod.default) { console.log(`✗ ${f}: helper không được có export default`); fail++; } continue; }
  if (!mod.default) { console.log(`✗ ${f}: thiếu export default`); fail++; continue; }
  defs.push([f, mod.default]);
}

const ids = new Set();
const instances = [];
let uid = 1;
const rows = [];
const kindsProvided = new Set();
const compat = [];
const isFiniteArr = (a, n) => Array.isArray(a) && a.length === n && a.every((v) => typeof v === 'number' && Number.isFinite(v));

for (const [f, def] of defs) {
  if (filter && !def.id?.includes(filter) && !f.includes(filter)) continue;
  const errs = [], warns = [];
  try {
    for (const k of ['id', 'name', 'category']) if (typeof def[k] !== 'string' || !def[k]) errs.push(`thiếu ${k}`);
    if (def.kind !== 'part') errs.push(`kind phải là 'part' (đang ${def.kind})`);
    if (ids.has(def.id)) errs.push(`id trùng: ${def.id}`); ids.add(def.id);
    if (f !== `${def.id}.js`) warns.push(`tên file ≠ id (${def.id})`);
    if (!(def.massG > 0)) errs.push('massG phải > 0');
    if (!isFiniteArr(def.size, 3)) errs.push('size phải là [x,y,z]');
    if (!def.grip?.pose) errs.push('thiếu grip.pose');
    if (typeof def.build !== 'function') throw new Error('thiếu build()');
    if (!Array.isArray(def.pins)) errs.push('pins phải là mảng');
    if (EXPECT_PINS[def.id] != null && def.pins?.length !== EXPECT_PINS[def.id]) errs.push(`số chân ${def.pins?.length} ≠ ${EXPECT_PINS[def.id]}`);
    const pinIds = new Set();
    for (const p of def.pins || []) {
      if (!p.id && !p.name) errs.push('chân thiếu id/name');
      if (pinIds.has(p.id)) errs.push(`id chân trùng: ${p.id}`); pinIds.add(p.id);
      if (!isFiniteArr(p.pos, 3)) errs.push(`chân ${p.id}: pos sai`);
      if (!isFiniteArr(p.dir, 3) || Math.abs(Math.hypot(...p.dir) - 1) > 0.02) errs.push(`chân ${p.id}: dir không chuẩn hoá`);
    }
    if (!Array.isArray(def.insertInto)) warns.push('không có insertInto');

    const t0 = performance.now();
    const obj = def.build(game);
    const dt = performance.now() - t0;
    if (!obj?.isObject3D) throw new Error('build() phải trả Object3D');
    const obj2 = def.build(game); // bản sao thứ 2 dùng chung geometry
    const inst = { uid: `u${uid++}`, def, object: obj, state: {}, heldBy: null, socket: null };
    instances.push(inst);
    def.init?.(inst, game);
    const bb = new THREE.Box3().setFromObject(obj);
    const sz = bb.getSize(new THREE.Vector3());
    if (![bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z].every(Number.isFinite)) errs.push('bounding box có NaN');
    if (Math.abs(bb.min.y) > Math.max(1.5, sz.y * 0.05)) warns.push(`đáy y=${bb.min.y.toFixed(2)} (gốc nên ở đáy)`);
    const t = countTris(obj);
    let nanGeo = false;
    obj.traverse((o) => { if (o.isMesh) { const a = o.geometry.attributes.position?.array; if (a) for (let i = 0; i < a.length; i += 97) if (!Number.isFinite(a[i])) nanGeo = true; } });
    if (nanGeo) errs.push('geometry có NaN');
    // chia sẻ geometry giữa 2 bản sao
    let shared = 0, total = 0;
    const g1 = []; obj.traverse((o) => o.isMesh && g1.push(o.geometry));
    const g2 = new Set(); obj2.traverse((o) => o.isMesh && g2.add(o.geometry));
    for (const g of g1) { total++; if (g2.has(g)) shared++; }
    const nonInst = t.tris - (() => { let s = 0; obj.traverse((o) => { if (o.isInstancedMesh) { const g = o.geometry; s += ((g.index ? g.index.count : g.attributes.position.count) / 3) * o.count; } }); return s; })();
    if (nonInst > TRI_LIMIT) errs.push(`${nonInst} tam giác (không instancing) > ${TRI_LIMIT}`);

    // pins động
    const pinsNow = def.getPins?.(inst) ?? def.pins;
    if (!Array.isArray(pinsNow)) errs.push('getPins() không trả mảng');
    // bẻ / cắt chân
    if (def.leadBendable) {
      const n = def.minSpanN || 1;
      if (def.leadStyle === 'axial') {
        const r0 = def.insertReady?.(inst);
        if (r0?.ok) warns.push('insertReady ok khi chưa bẻ chân');
        const r = def.bendLeads(inst, n);
        if (!r?.ok) errs.push(`bendLeads(${n}) lỗi: ${r?.reason}`);
        const p = def.getPins(inst);
        const span = Math.abs(p[0].pos[0] - p[1].pos[0]);
        if (Math.abs(span - n * 2.54) > 0.01) errs.push(`bẻ chân: khoảng cách ${span} ≠ ${n * 2.54}`);
        if (p.some((q) => q.dir[1] > -0.99)) errs.push('bẻ chân: đầu chân không hướng xuống');
        const bad = def.bendLeads(inst, 1);
        if (bad?.ok && n > 1) errs.push('bendLeads(1) phải bị từ chối (thân dài hơn)');
      } else if (def.bendLeads) {
        const r = def.bendLeads(inst, 2);
        if (!r?.ok) warns.push(`bendLeads(2): ${r?.reason}`);
        def.bendLeads(inst, null);
      }
      def.trimLeads?.(inst, 1.5);
      const p2 = def.getPins(inst);
      if (!p2.every((q) => isFiniteArr(q.pos, 3))) errs.push('trimLeads: pos sai');
    }
    // khe
    let sockKinds = '';
    if (def.sockets) {
      if (typeof def.sockets !== 'function') errs.push('sockets phải là hàm (instance, game) => [...]');
      else {
        const list = def.sockets(inst, game);
        if (!Array.isArray(list)) errs.push('sockets() không trả mảng');
        else {
          const again = def.sockets(inst, game);
          if (again !== list) warns.push('sockets() tạo mới mỗi lần gọi (nên cache)');
          const kinds = new Map();
          for (const s of list) {
            if (!s.id || !s.kind) { errs.push('socket thiếu id/kind'); break; }
            if (!s.object3D?.isObject3D) { errs.push(`socket ${s.id}: thiếu object3D`); break; }
            if (typeof s.accepts !== 'function') { errs.push(`socket ${s.id}: thiếu accepts()`); break; }
            if (!s.pose?.isMatrix4) { errs.push(`socket ${s.id}: pose không phải Matrix4`); break; }
            kinds.set(s.kind, (kinds.get(s.kind) || 0) + 1);
            kindsProvided.add(s.kind);
          }
          sockKinds = [...kinds].map(([k, n]) => `${k}×${n}`).join(' ');
          if (SOCKET_EXPECT[def.id] && !kinds.has(SOCKET_EXPECT[def.id])) errs.push(`thiếu khe ${SOCKET_EXPECT[def.id]}`);
          // gọi accepts với vài linh kiện khác
          const s0 = list[0];
          if (s0) for (const [, d2] of defs.slice(0, 80)) {
            const r = s0.accepts({ def: d2, object: null, state: {} });
            if (typeof r?.ok !== 'boolean') { errs.push(`socket ${s0.kind}: accepts() phải trả { ok }`); break; }
          }
          // mô phỏng engine (sockets.js): spec bị sao chép bằng Object.assign → accepts(item, ctx) gọi như method trên bản sao,
          // pose phải là Matrix4 sau khi accepts() trả ok
          const partner = defs.map(([, d2]) => d2).find((d2) => (d2.insertInto || []).includes(s0?.kind) && d2 !== def);
          if (s0 && partner) {
            const copy = Object.assign({}, s0);
            const pInst = { uid: 'probe', def: partner, object: null, state: { leadSpanN: partner.minSpanN, legsStraight: true } };
            const r0 = copy.accepts(pInst, { rotSteps: 0, game });
            if (!r0?.ok) warns.push(`khe ${s0.kind}: ${partner.id} bị từ chối (${r0?.reason})`);
            if (!copy.pose?.isMatrix4 || !copy.pose.elements.every(Number.isFinite)) errs.push(`khe ${s0.kind}: pose sau accepts() không hợp lệ`);
            const r2 = copy.accepts(pInst, { rotSteps: 2, game });
            compat.push(`${s0.kind} ← ${partner.id}${r2?.ok === false ? ' (180°: từ chối)' : r2?.orientation === 'reversed' ? ' (180°: cắm được, reversed)' : ''}`);
            copy.onInsert(pInst, {}); if (copy.occupiedBy !== pInst) errs.push('onInsert không ghi occupiedBy');
            const busy = copy.accepts(pInst, { rotSteps: 0 });
            void busy;
            copy.onRemove(pInst);
          }
          // vòng đời
          if (s0) { s0.onInsert({ def, object: null, state: {} }, {}); s0.onRemove({ def }); }
        }
      }
    }
    // update
    for (let i = 0; i < 30; i++) def.update?.(inst, 1 / 60, game);
    // hàm tương tác riêng
    for (const fn of ['toggle', 'press', 'release', 'turnTrimmer', 'straightenLegs', 'setLit', 'breakTo', 'setValue', 'setLength', 'cut', 'spin']) {
      if (typeof def[fn] === 'function') {
        const arg = { turnTrimmer: 1.5, setLit: 0.8, breakTo: 6, setValue: 4700, setLength: 150, cut: 120, spin: 1 }[fn];
        const r = def[fn](inst, arg, game);
        if (r && typeof r === 'object' && r.ok === false && fn !== 'breakTo') warns.push(`${fn}(): ${r.reason}`);
      }
    }
    for (let i = 0; i < 10; i++) def.update?.(inst, 1 / 60, game);
    if (def.solderPads) {
      const pads = def.solderPads(inst, game);
      if (!Array.isArray(pads) || !pads.length) errs.push('solderPads() rỗng');
      else if (!pads.every((p) => p.id && isFiniteArr(p.local, 3) && p.state === 'empty')) errs.push('solderPads(): bản ghi sai');
    }
    rows.push({ id: def.id, pins: def.pins?.length ?? 0, ...t, nonInst, size: `${sz.x.toFixed(0)}×${sz.y.toFixed(0)}×${sz.z.toFixed(0)}`, ms: dt.toFixed(1), shared: `${shared}/${total}`, sock: sockKinds, errs, warns });
  } catch (e) {
    errs.push(`NGOẠI LỆ: ${e.stack?.split('\n').slice(0, 4).join(' | ')}`);
    rows.push({ id: def.id || f, pins: 0, tris: 0, unique: 0, meshes: 0, draws: 0, nonInst: 0, size: '-', ms: '-', shared: '-', sock: '', errs, warns });
  }
}

const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
console.log(`\n${pad('id', 26)}${lpad('chân', 5)}${lpad('draw', 6)}${lpad('Δ thường', 10)}${lpad('Δ tổng', 10)}  ${pad('kích thước mm', 16)}${lpad('ms', 7)}  chung  khe`);
console.log('─'.repeat(120));
let totalTris = 0;
for (const r of rows) {
  totalTris += r.tris;
  const mark = r.errs.length ? '✗' : r.warns.length ? '•' : '✓';
  console.log(`${mark} ${pad(r.id, 24)}${lpad(r.pins, 5)}${lpad(r.draws, 6)}${lpad(r.nonInst, 10)}${lpad(r.tris, 10)}  ${pad(r.size, 16)}${lpad(r.ms, 7)}  ${pad(r.shared, 6)} ${r.sock}`);
  for (const e of r.errs) console.log(`    ✗ ${e}`);
  for (const w of r.warns) console.log(`    • ${w}`);
  if (r.errs.length) fail++;
}
console.log('─'.repeat(120));
console.log(`${rows.length} linh kiện · ${rows.reduce((s, r) => s + r.draws, 0)} draw call · ${totalTris.toLocaleString()} tam giác (tính cả instancing) · khe cung cấp: ${[...kindsProvided].join(', ')}`);
console.log(`Ghép thử khe ↔ linh kiện: ${compat.join(' · ')}`);
if (fail) { console.log(`\n✗ ${fail} lỗi`); process.exit(1); }
console.log('\n✓ Không lỗi');
