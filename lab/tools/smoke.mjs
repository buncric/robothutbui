// Kiểm tra nhanh mọi linh kiện KHÔNG cần trình duyệt:
//   node tools/smoke.mjs            → tất cả
//   node tools/smoke.mjs dong-co-dc → chỉ 1 linh kiện (theo id hoặc tên file)
// Dựng mô hình, chạy update() 300 khung hình với tham số mặc định + bấm mọi nút + đổi mọi toggle/select,
// kiểm tra: không lỗi, scope trả đúng số kênh, không NaN, có part() để rê chuột, info đủ 6 tab.
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { MAT, PIN_COLORS, tint } from '../src/core/materials.js';
import * as geom from '../src/core/geom.js';
import { FX } from '../src/core/fx.js';
import { createSandbox, footprint } from '../src/core/editor.js';
import { cadModel } from '../src/core/cad.js';

const root = fileURLToPath(new URL('../src/components/', import.meta.url));
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') && !f.startsWith('_') && files.push(p); } })(root);
const filter = process.argv[2];
const allDefs = [];
for (const f of files) { try { const m = await import(pathToFileURL(f).href); if (m.default?.id) allDefs.push(m.default); } catch { /* báo lỗi ở dưới */ } }
let fail = 0, ok = 0;
const ids = new Set();

for (const f of files) {
  let mod;
  try { mod = await import(pathToFileURL(f).href); }
  catch (e) {
    if (filter && !f.includes(filter)) continue;
    console.log(`✗ ${relative(root, f)}\n    LỖI nạp file: ${String(e.message).split('\n')[0]}`);
    fail++; continue;
  }
  const def = mod.default;
  if (filter && def?.id !== filter && !f.includes(filter)) continue;
  const name = relative(root, f);
  const errs = [], warns = [];
  try {
    if (!def?.id || !def.build) throw new Error('thiếu export default { id, build }');
    if (ids.has(def.id)) errs.push(`id trùng: ${def.id}`); ids.add(def.id);
    for (const k of ['name', 'category', 'summary', 'icon']) if (!def[k]) errs.push(`thiếu ${k}`);
    for (const k of ['overview', 'specs', 'principle', 'inRobot', 'mistakes', 'quiz']) if (!def.info?.[k]) warns.push(`info.${k} trống`);
    const reads = {};
    const ctx = { THREE, MAT, PIN_COLORS, tint, geom, viewer: null, label: (p, t, pos) => { const o = new THREE.Object3D(); o.userData.isLabel = true; p.add(o); return o; }, readout: (id, v) => (reads[id] = v), fx: new FX(new THREE.Group()), sandbox: (o) => createSandbox(null, o), footprint, catalog: allDefs, cad: cadModel, cadManifest: async () => ({ models: [] }) };
    const inst = def.build(ctx);
    if (!inst?.object?.isObject3D) throw new Error('build() phải trả về { object: Object3D }');
    let parts = 0, meshes = 0;
    inst.object.traverse((o) => { if (o.userData.part) parts++; if (o.isMesh) meshes++; });
    if (parts < 3) warns.push(`chỉ có ${parts} chi tiết part() — nên ≥ 3 để rê chuột học`);
    const bb = new THREE.Box3().setFromObject(inst.object);
    const size = bb.getSize(new THREE.Vector3());
    const params = {};
    for (const p of def.params || []) if (p.type !== 'button') params[p.id] = p.value ?? (p.type === 'range' ? p.min : p.type === 'select' ? p.options[0][0] : false);
    const nCh = def.scope?.channels?.length || 0;
    const run = (frames, label) => {
      for (let i = 0; i < frames; i++) {
        const v = inst.update?.(1 / 60, i / 60, params);
        if (nCh && v) {
          if (!Array.isArray(v) || v.length !== nCh) throw new Error(`${label}: update() trả ${JSON.stringify(v)} — cần mảng ${nCh} phần tử`);
          if (v.some((x) => typeof x !== 'number' || !Number.isFinite(x))) throw new Error(`${label}: scope có NaN/Infinity: ${JSON.stringify(v)}`);
        }
      }
    };
    run(120, 'mặc định');
    for (const p of def.params || []) {
      if (p.type === 'button') { inst.onAction?.(p.id, params); run(30, `nút ${p.id}`); }
      if (p.type === 'toggle') { params[p.id] = !params[p.id]; run(10, `toggle ${p.id}`); params[p.id] = !params[p.id]; }
      if (p.type === 'select') for (const [v] of p.options) { params[p.id] = v; run(10, `select ${p.id}=${v}`); }
      if (p.type === 'range') { for (const v of [p.min, p.max, p.value ?? p.min]) { params[p.id] = v; run(15, `range ${p.id}=${v}`); } }
    }
    if (def.steps?.length) {
      if (!inst.setStep) errs.push('có steps nhưng build() không trả về setStep(i)');
      else def.steps.forEach((st, i) => { if (!st.title) errs.push(`steps[${i}] thiếu title`); inst.setStep(i, params); run(20, `bước ${i + 1}`); ctx.fx.update(0.1); });
    }
    if (def.faults?.length) {
      if (!inst.triggerFault) errs.push('có faults nhưng build() không trả về triggerFault(id)');
      else for (const f of def.faults) {
        for (const k of ['id', 'label', 'severity', 'what', 'why', 'fix']) if (!f[k]) errs.push(`fault ${f.id}: thiếu ${k}`);
        ctx.fx.restore(inst.object); inst.resetFault?.(params); inst.triggerFault(f.id, params);
        for (let i = 0; i < 60; i++) { run(1, `sự cố ${f.id}`); ctx.fx.update(1 / 60); }
      }
      ctx.fx.restore(inst.object); inst.resetFault?.(params); run(10, 'sau khôi phục');
    }
    for (const [k, v] of Object.entries(reads)) if (typeof v === 'number' && !Number.isFinite(v)) errs.push(`readout ${k} = ${v}`);
    for (const r of def.readouts || []) if (!(r.id in reads)) warns.push(`readout '${r.id}' chưa bao giờ được cập nhật`);
    console.log(`${errs.length ? '✗' : '✓'} ${name.padEnd(36)} ${def.id.padEnd(22)} ${meshes} mesh, ${parts} part, ${def.steps?.length || 0} bước, ${def.faults?.length || 0} sự cố, kích thước ${size.x.toFixed(0)}×${size.y.toFixed(0)}×${size.z.toFixed(0)} mm`);
  } catch (e) {
    errs.push(e.stack.split('\n').slice(0, 3).join(' ⟵ '));
    console.log(`✗ ${name}`);
  }
  errs.forEach((e) => console.log('    LỖI:', e));
  warns.forEach((w) => console.log('    lưu ý:', w));
  errs.length ? fail++ : ok++;
}
console.log(`\n${ok} đạt, ${fail} lỗi`);
process.exit(fail ? 1 : 0);
