// =============================================================================
// cadParts.js — ghép MÔ HÌNH CAD THẬT (GLB, xem core/cad.js) vào một trang linh kiện mà vẫn giữ
// được mô phỏng: gắn tên/mô tả (part) cho từng node GLB, tạo khớp quay/trượt theo node, phát sáng,
// bật/tắt giữa "CAD thật" và "mô hình học" (tự dựng, có tô màu chức năng / cắt bổ).
//
//   import { cadAttach, zup } from '../../core/cadParts.js';
//   const cad = cadAttach(ctx, root, 'robot/rs360-motor', {
//     hide: [motor],                        // mô hình tự dựng bị ẩn khi đang xem CAD
//     parts: { can: ['Vỏ thép', '…'], shaft: ['Trục', '…'], 'screw_*': ['Vít PT', '…'] },
//     rotateZ: Math.PI / 2,                 // chuyển tiếp cho ctx.cad (rotateX/Y/Z, offset, scale, onBottom)
//     onLoad(c) { shaft = c.pivot('shaft', { axis: [0, 1, 0] }); },
//   });
//   update(dt, t, p) { if (cad.sync(p)) shaft?.set(theta); }
//
// Hệ toạ độ: mọi `axis`/`origin` truyền vào là theo KHUNG GLB (Y-up) tính bằng mm — đúng như
// manifest.robot.json / manifest.vendor.json ghi. Manifest boards ghi khung CAD Z-up → dùng zup([x,y,z]).
// Trong Node (smoke test) GLB không bao giờ tải → `loaded` = false, sync() luôn trả false,
// mô hình tự dựng vẫn hiện — mô phỏng phải chạy được không cần CAD.
// =============================================================================
import * as THREE from 'three';

/** Toạ độ CAD Z-up (manifest boards) → khung GLB Y-up: (x, y, z) → (x, z, −y) */
export const zup = ([x, y, z]) => [x, z, -y];

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _m3 = new THREE.Matrix3();

/**
 * Khớp tên node: 'a/b' (đường dẫn), 'screw_*' (tiền tố), /regex/ hoặc tên chính xác.
 * GLTFLoader đổi tên trùng thành 'wheel_1', 'can_2'… nhưng giữ tên gốc ở userData.name → khớp cả hai.
 */
const names = (o) => (o.userData?.name && o.userData.name !== o.name ? [o.name, o.userData.name] : [o.name]);
function matcher(key) {
  if (key instanceof RegExp) return (o) => names(o).some((n) => key.test(n));
  if (key.endsWith('*')) { const pre = key.slice(0, -1); return (o) => names(o).some((n) => n.startsWith(pre)); }
  return (o) => names(o).includes(key);
}

/** Tìm node: 'cover_top/lid_top' → node lid_top nằm dưới cover_top. Trả node đầu tiên (duyệt theo chiều rộng). */
export function findNode(root, path) {
  if (!root || !path) return null;
  if (path instanceof RegExp || path.endsWith?.('*')) return findNodes(root, path)[0] || null;
  const segs = path.split('/');
  let cur = root;
  for (const s of segs) {
    let hit = null;
    const q = [...cur.children];
    while (q.length) { const o = q.shift(); if (names(o).includes(s)) { hit = o; break; } q.push(...o.children); }
    if (!hit) return null;
    cur = hit;
  }
  return cur;
}

export function findNodes(root, key) {
  if (!root) return [];
  if (typeof key === 'string' && key.includes('/') && !key.endsWith('*')) { const n = findNode(root, key); return n ? [n] : []; }
  const m = matcher(key);
  const out = [];
  root.traverse((o) => { if (o !== root && m(o)) out.push(o); });
  // bỏ node con nếu cha nó cũng khớp (vd. 'bumper' lồng 'bumper')
  return out.filter((o) => { for (let p = o.parent; p && p !== root; p = p.parent) if (out.includes(p)) return false; return true; });
}

/** Vật liệu riêng cho mesh (GLB nhân bản dùng chung vật liệu với bản trong cache → phải clone trước khi đổi màu) */
export function ownMaterial(mesh) {
  if (!mesh.material) return null;
  if (!mesh.userData._cadOwnMat) { mesh.material = mesh.material.clone(); mesh.userData._cadOwnMat = true; }
  return mesh.material;
}

/** Ma trận đổi từ khung GLB (trong obj, đơn vị m) sang khung cục bộ của `parent` */
function glbToLocal(obj, parent) {
  obj.updateWorldMatrix(true, true);
  return _m.copy(parent.matrixWorld).invert().multiply(obj.matrixWorld).clone();
}

/**
 * Gắn mô hình CAD vào `parent` (thường là root của trang).
 * @returns điều khiển { holder, loaded, active, obj, node(), nodes(), pivot(), slide(), glow(), color(), sync(p), refit() }
 */
export function cadAttach(ctx, parent, path, opts = {}) {
  const { hide = [], parts = {}, param = 'cad', labels = [], partDefault } = opts;
  const ctl = {
    holder: null, obj: null, loaded: false, active: false, path,
    node: (n) => findNode(ctl.obj, n),
    nodes: (k) => findNodes(ctl.obj, k),
    pivot, pivotMany, slide, move, mmSpace, glow, color, sync, refit, tag, worldOf,
  };
  const cadOpts = { ...opts, fallback: undefined, part: undefined, onLoad: (obj) => onLoaded(obj) };
  delete cadOpts.hide; delete cadOpts.parts; delete cadOpts.labels;
  ctl.holder = ctx.cad ? ctx.cad(path, cadOpts) : new THREE.Group();
  ctl.holder.name = 'cad:' + path;
  ctl.holder.visible = false;
  if (partDefault) ctl.holder.userData.part = { name: partDefault[0], desc: partDefault[1] || '' };
  if (opts.at) {
    const a = opts.at;
    ctl.holder.position.set(a.x || 0, a.y || 0, a.z || 0);
    ctl.holder.rotation.set(a.rx || 0, a.ry || 0, a.rz || 0);
  }
  parent.add(ctl.holder);

  function onLoaded(obj) {
    ctl.obj = obj;
    ctl.loaded = true;
    obj.traverse((o) => { if (o.isMesh) o.userData.noCut = true; });
    for (const [k, v] of Object.entries(parts)) tag(k, v[0], v[1]);
    for (const [text, where, off] of labels) {
      const p = typeof where === 'string' ? worldOf(where, ctl.holder) : new THREE.Vector3(...where);
      if (!p) continue;
      if (off) p.add(new THREE.Vector3(...off));
      ctx.label(ctl.holder, text, [p.x, p.y, p.z]);
    }
    try { opts.onLoad?.(ctl); } catch (e) { console.warn('[cadParts] onLoad lỗi', path, e); }
    ctl.holder.visible = false;      // sync() quyết định hiện/ẩn ở khung hình kế tiếp
    ctl.active = false;
    ctl._needFrame = true;
  }

  /** Gắn tên/mô tả cho node (mọi node khớp key) */
  function tag(key, name, desc = '') {
    for (const n of findNodes(ctl.obj, key)) n.userData.part = { name: typeof name === 'function' ? name(n) : name, desc };
  }

  /** Tâm hộp bao của node, đổi về khung `space` (mặc định holder) */
  function worldOf(key, space = ctl.holder) {
    const n = typeof key === 'string' ? findNode(ctl.obj, key) : key;
    if (!n) return null;
    n.updateWorldMatrix(true, true);
    const c = new THREE.Box3().setFromObject(n).getCenter(new THREE.Vector3());
    space.updateWorldMatrix(true, false);
    return space.worldToLocal(c);
  }

  /**
   * Khớp quay quanh trục: axis (khung GLB), origin (mm, khung GLB) — bỏ trống = tâm hộp bao của node.
   * Trả { set(angleRad), node, pivot } — hoặc null nếu không có node.
   */
  function pivot(key, { axis = [0, 1, 0], origin = null } = {}) {
    const node = typeof key === 'string' ? findNode(ctl.obj, key) : key;
    if (!node || !node.parent) return null;
    const P = node.parent;
    const R = glbToLocal(ctl.obj, P);
    let o;
    if (origin) o = new THREE.Vector3(...origin).multiplyScalar(0.001).applyMatrix4(R);
    else {
      node.updateWorldMatrix(true, true);
      o = P.worldToLocal(new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3()));
    }
    const ax = new THREE.Vector3(...axis).applyMatrix3(_m3.setFromMatrix4(R)).normalize();
    const pv = new THREE.Group();
    pv.name = (node.userData?.name || node.name) + '__pivot';
    pv.position.copy(o);
    P.add(pv);
    node.position.sub(o);
    pv.add(node);
    let last = 0;
    return { node, pivot: pv, axis: ax, set(a) { if (a !== last) { pv.quaternion.setFromAxisAngle(ax, a); last = a; } } };
  }

  /**
   * Khớp quay mang NHIỀU node cùng cha (vd. tay đòn treo bánh mang bánh + hộp số + động cơ):
   * keys = ['arm_pivot', 'wheel', 'screw_*', …] (tên tương đối với `scope` nếu có, vd. 'wheel_l').
   */
  function pivotMany(keys, { axis = [0, 1, 0], origin = null, scope = null } = {}) {
    const base = scope ? findNode(ctl.obj, scope) : ctl.obj;
    if (!base) return null;
    const list = [...new Set(keys.flatMap((k) => findNodes(base, k)))].filter((n) => n.parent);
    if (!list.length) return null;
    const P = list[0].parent;
    const nodes = list.filter((n) => n.parent === P);
    const R = glbToLocal(ctl.obj, P);
    let o;
    if (origin) o = new THREE.Vector3(...origin).multiplyScalar(0.001).applyMatrix4(R);
    else {
      const bb = new THREE.Box3();
      nodes.forEach((n) => { n.updateWorldMatrix(true, true); bb.expandByObject(n); });
      o = P.worldToLocal(bb.getCenter(new THREE.Vector3()));
    }
    const ax = new THREE.Vector3(...axis).applyMatrix3(_m3.setFromMatrix4(R)).normalize();
    const pv = new THREE.Group();
    pv.name = (nodes[0].userData?.name || nodes[0].name) + '__pivotMany';
    pv.position.copy(o);
    P.add(pv);
    for (const n of nodes) { n.position.sub(o); pv.add(n); }
    let last = 0;
    return { nodes, pivot: pv, axis: ax, set(a) { if (a !== last) { pv.quaternion.setFromAxisAngle(ax, a); last = a; } } };
  }

  /** Dời tự do theo vectơ [dx,dy,dz] mm (khung GLB): { set([x,y,z]) , node } — dùng cho tháo lắp/tách lớp */
  function move(key) {
    const node = typeof key === 'string' ? findNode(ctl.obj, key) : key;
    if (!node || !node.parent) return null;
    const R = glbToLocal(ctl.obj, node.parent);
    const lin = new THREE.Matrix3().setFromMatrix4(R).multiplyScalar(0.001);
    const base = node.position.clone();
    const v = new THREE.Vector3();
    return { node, base, set(d) { v.set(d[0], d[1], d[2]).applyMatrix3(lin); node.position.copy(base).add(v); } };
  }

  /**
   * Node GLB nằm trong khung đơn vị MÉT → fx.pop(node) (đẩy position theo mm) sẽ văng xa ×1000.
   * mmSpace(key) chèn một nhóm tỉ lệ 0,001 giữa node và cha: position của node thành mm → fx.pop/restore đúng.
   */
  function mmSpace(key) {
    const node = typeof key === 'string' ? findNode(ctl.obj, key) : key;
    if (!node || !node.parent) return null;
    if (node.parent.userData._cadMm) return node;
    const P = node.parent;
    const g = new THREE.Group();
    g.name = node.name + '__mm';
    g.userData._cadMm = true;
    g.scale.setScalar(0.001);
    P.add(g);
    node.position.multiplyScalar(1000);
    node.scale.multiplyScalar(1000);
    g.add(node);
    return node;
  }

  /** Trượt theo trục (khung GLB): { set(mm) } */
  function slide(key, axis = [0, 1, 0]) {
    const node = typeof key === 'string' ? findNode(ctl.obj, key) : key;
    if (!node || !node.parent) return null;
    const R = glbToLocal(ctl.obj, node.parent);
    const dir = new THREE.Vector3(...axis).multiplyScalar(0.001).applyMatrix3(_m3.setFromMatrix4(R));
    const base = node.position.clone();
    let last = 0;
    return { node, set(mm) { if (mm !== last) { node.position.copy(base).addScaledVector(dir, mm); last = mm; } } };
  }

  /** Phát sáng node (LED, cuộn dây nóng…): color hex, k 0..1 */
  function glow(key, colorHex, k = 1) {
    const list = typeof key === 'string' || key instanceof RegExp ? findNodes(ctl.obj, key) : [key];
    for (const n of list) if (n) n.traverse((o) => {
      if (!o.isMesh) return;
      const m = ownMaterial(o);
      if (!m || !m.emissive) return;
      m.emissive.setHex(colorHex);
      m.emissiveIntensity = k;
    });
  }

  /** Đổi màu node (tô màu chức năng chân IC…) — null = trả màu gốc */
  function color(key, colorHex) {
    const list = typeof key === 'string' || key instanceof RegExp ? findNodes(ctl.obj, key) : [key];
    for (const n of list) if (n) n.traverse((o) => {
      if (!o.isMesh || !o.material?.color) return;
      if (o.userData._cadBaseColor === undefined) o.userData._cadBaseColor = o.material.color.getHex();
      const m = ownMaterial(o);
      m.color.setHex(colorHex == null ? o.userData._cadBaseColor : colorHex);
    });
  }

  /** Căn camera chỉ theo phần đang hiện (tạm tháo mô hình bị ẩn khỏi cảnh) */
  function refit() {
    const viewer = ctx.viewer;
    if (!viewer?.frame) return;
    const hidden = (ctl.active ? hide : [ctl.holder]).filter((o) => o && o.parent && !o.visible);
    const parents = hidden.map((o) => o.parent);
    hidden.forEach((o) => o.parent.remove(o));
    try { viewer.frame(); } finally { hidden.forEach((o, i) => parents[i].add(o)); }
  }

  /**
   * Gọi mỗi khung hình trong update(): hiện CAD (nếu đã tải & tham số bật) hoặc mô hình tự dựng.
   * Trả true khi đang hiện CAD (để chạy hoạt ảnh trên node CAD).
   */
  function sync(p) {
    const want = typeof param === 'function' ? !!param(p) : (p?.[param] ?? true) !== false;
    const on = ctl.loaded && want;
    if (on !== ctl.active || ctl._needFrame) {
      ctl.active = on;
      ctl.holder.visible = on;
      for (const o of hide) if (o) o.visible = !on;
      if (ctl._needFrame || opts.frame !== false) refit();
      ctl._needFrame = false;
      opts.onToggle?.(on, ctl);
    }
    return on;
  }

  return ctl;
}

/** Hộp thông tin ngắn cho phần CAD (dùng trong part desc) */
export function cadNote(src) { return `<br><i>Mô hình CAD thật: ${src}</i>`; }
