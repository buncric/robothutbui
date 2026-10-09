// Sổ đăng ký item: tự nạp mọi dụng cụ (tools/*.js) và linh kiện (parts/*.js) bằng import.meta.glob (eager).
// File bắt đầu bằng "_" hoặc không có export default { id, build } bị bỏ qua (thư viện dùng chung).
// Trong Node (smoke test) import.meta.glob không tồn tại → registry rỗng; smoke test gọi registerItemModules().
import * as THREE from 'three';

const DEFS = new Map();
const SOURCES = new Map();   // id → đường dẫn file

let globbed = {};
try {
  globbed = import.meta.glob(['./tools/*.js', './parts/*.js'], { eager: true });
} catch {
  globbed = {};   // Node: không có import.meta.glob
}
registerItemModules(globbed);

/** Nạp bản ghi { đường_dẫn: module } (định dạng của import.meta.glob eager). Trả về số item mới. */
export function registerItemModules(record) {
  let n = 0;
  for (const [path, mod] of Object.entries(record || {})) {
    const file = path.split('/').pop();
    if (file.startsWith('_')) continue;
    const def = mod?.default;
    if (!def || typeof def !== 'object' || !def.id || typeof def.build !== 'function') continue;
    if (DEFS.has(def.id) && DEFS.get(def.id) !== def) console.warn(`[items] id trùng "${def.id}": ${SOURCES.get(def.id)} và ${path} — giữ bản sau`);
    if (DEFS.get(def.id) !== def) n++;
    DEFS.set(def.id, def);
    SOURCES.set(def.id, path);
  }
  return n;
}
export function registerItemDef(def, source = '(runtime)') {
  if (!def?.id || typeof def.build !== 'function') throw new Error('item def cần { id, build }');
  DEFS.set(def.id, def); SOURCES.set(def.id, source);
  return def;
}

export const getItemDef = (id) => DEFS.get(id) || null;
export const allItemDefs = () => [...DEFS.values()];
export const itemSource = (id) => SOURCES.get(id) || null;
/** 'tool' | 'part' (suy ra từ def.kind hoặc thư mục) */
export function kindOf(def) {
  if (!def) return null;
  if (def.kind) return def.kind;
  const src = SOURCES.get(def.id) || '';
  return src.includes('/tools/') ? 'tool' : 'part';
}

/**
 * Tìm item theo id chính xác, rồi theo từ khoá (khớp id/tên/category, không phân biệt hoa thường).
 * opts.kind: lọc 'tool' | 'part'.
 */
export function findItemDef(query, { kind = null } = {}) {
  if (!query) return null;
  const exact = DEFS.get(query);
  if (exact && (!kind || kindOf(exact) === kind)) return exact;
  const q = String(query).toLowerCase();
  for (const d of DEFS.values()) {
    if (kind && kindOf(d) !== kind) continue;
    if (d.id.toLowerCase().includes(q) || String(d.name || '').toLowerCase().includes(q) || String(d.category || '').toLowerCase() === q) return d;
  }
  return null;
}

let SEQ = 0;
const _e = new THREE.Euler();

/** Áp tư thế: pose = { pos:[x,y,z]|Vector3, rot:[rx,ry,rz]|Euler, quat:[x,y,z,w]|Quaternion, rotY, scale, matrix: Matrix4 (thế giới) } */
export function applyPose(object, pose = {}) {
  if (!pose) return object;
  if (pose.matrix?.isMatrix4) {
    pose.matrix.decompose(object.position, object.quaternion, object.scale);
    return object;
  }
  const p = pose.pos ?? pose.position;
  if (p) Array.isArray(p) ? object.position.set(p[0] || 0, p[1] || 0, p[2] || 0) : object.position.copy(p);
  if (pose.quat) Array.isArray(pose.quat) ? object.quaternion.set(...pose.quat) : object.quaternion.copy(pose.quat);
  else if (pose.rot) {
    if (Array.isArray(pose.rot)) object.rotation.copy(_e.set(pose.rot[0] || 0, pose.rot[1] || 0, pose.rot[2] || 0));
    else object.rotation.copy(pose.rot);
  } else if (pose.rotY !== undefined) object.rotation.set(0, pose.rotY, 0);
  if (pose.scale) object.scale.setScalar(pose.scale);
  return object;
}

/**
 * Sinh một ItemInstance (GAME_API §7): { uid, def, object, state, heldBy, socket }.
 * pose.parent: Object3D cha (mặc định game.scene); pose.addToScene=false để không gắn vào đâu.
 */
export function spawnItem(game, id, pose = {}) {
  const def = typeof id === 'object' && id?.build ? id : getItemDef(id);
  if (!def) { console.warn(`[items] không có item "${id}"`); return null; }
  const object = def.build(game);
  if (!object?.isObject3D) throw new Error(`[items] ${def.id}.build() phải trả về Object3D`);
  const inst = { uid: `${def.id}#${++SEQ}`, def, object, state: {}, heldBy: null, socket: null };
  object.name = object.name || def.id;
  object.userData.item = inst;
  object.userData.itemId = def.id;
  applyPose(object, pose);
  const parent = pose?.parent ?? (pose?.addToScene === false ? null : game?.scene);
  if (parent?.add) parent.add(object);
  try { def.init?.(inst, game); } catch (e) { console.warn(`[items] ${def.id}.init lỗi`, e); }
  if (typeof def.sockets === 'function') {
    try {
      const specs = def.sockets(inst, game) || [];
      inst.sockets = specs;
      for (const s of specs) game?.sockets?.add?.({ owner: inst, ...s });
    } catch (e) { console.warn(`[items] ${def.id}.sockets lỗi`, e); }
  }
  game?.events?.emit?.('item:spawned', { item: inst });
  return inst;
}

/**
 * Kho item tối giản theo GAME_API §2 (game.items) — engine có thể dùng trực tiếp hoặc tự viết:
 * { get(id), spawn(id, pose), all:[ItemInstance], remove(inst), update(dt) }
 */
export function createItemStore(game) {
  const all = [];
  const store = {
    all,
    get: getItemDef,
    defs: allItemDefs,
    spawn(id, pose) { const inst = spawnItem(game, id, pose); if (inst) all.push(inst); return inst; },
    remove(inst) {
      const i = all.indexOf(inst);
      if (i >= 0) all.splice(i, 1);
      inst?.object?.parent?.remove(inst.object);
      game?.events?.emit?.('item:removed', { item: inst });
    },
    find(pred) { return all.find(pred) || null; },
    byDef(id) { return all.filter((i) => i.def.id === id); },
    update(dt) { for (const inst of all) if (inst.def.update) inst.def.update(inst, dt, game); },
  };
  return store;
}
