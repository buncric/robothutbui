// =============================================================================
// editor.js — "Sandbox" kéo-thả dùng chung cho mọi môi trường (căn nhà, mặt bàn,
// xưởng lắp ráp, bàn mạch điện, phòng lab góc nhìn thứ nhất).
//
//   const sb = ctx.sandbox({ catalog, root, surfaces, grid, storageKey, onChange, initial })
//
// catalog: [{ id, name, icon, group, build: () => Object3D, surface?: bool, // đồ vật khác đặt lên được (bàn, kệ)
//             collider?: 'box'|'circle'|'none', fixed?: bool, maxCount?: n, meta?: {...} }]
// Người dùng: kéo mục từ bảng "Thư viện" vào cảnh (hoặc bấm mục rồi bấm vào cảnh),
// bấm vật để chọn & kéo di chuyển, Q/E xoay 15°, Del xoá, Ctrl+D nhân bản, Ctrl+Z/Y hoàn tác,
// Esc bỏ chọn. Bố cục tự lưu vào trình duyệt (storageKey) và xuất/nhập được file JSON.
// Chạy được cả khi không có trình duyệt (smoke test): khi đó chỉ có API, không có giao diện.
// =============================================================================
import * as THREE from 'three';

let UID = 1;
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* bỏ qua */ } },
};

export function createSandbox(viewer, opts) {
  const {
    catalog = [], root, surfaces = [], grid = 50, storageKey = null,
    onChange = () => {}, initial = [], title = 'Thư viện', floorY = 0, bounds = null,
    rotStep = 15,               // độ mỗi lần Q/E (breadboard nên dùng 90)
    onDrag = null,              // (item) => {} gọi liên tục khi đang kéo (dây bám theo, xem trước khe…)
  } = opts;
  const byType = Object.fromEntries(catalog.map((c) => [c.id, c]));
  const items = [];                 // { uid, type, def, object }
  let selected = null;
  let enabled = true;
  let snap = true;
  const undo = [], redo = [];
  const listeners = [];
  const hasDom = !!(viewer && typeof document !== 'undefined');
  let panel = null;                 // bảng Thư viện (chỉ có khi chạy trong trình duyệt)

  // ---------------- API lõi (dùng được cả khi không có DOM) ----------------
  function add(type, { x = 0, y = null, z = 0, rotY = 0, uid = null } = {}, record = true) {
    const def = byType[type];
    if (!def) return null;
    if (def.maxCount && items.filter((i) => i.type === type).length >= def.maxCount) return null;
    if (record) pushUndo();
    const object = def.build();
    object.position.set(x, y ?? floorY, z);
    object.rotation.y = rotY;
    object.userData.sandboxUid = uid ?? UID++;
    if (uid && uid >= UID) UID = uid + 1;
    if (!object.userData.part) object.userData.part = { name: def.name, desc: (def.desc || '') + ' <i>(bấm để chọn · kéo để di chuyển · Q/E xoay · Del xoá)</i>' };
    root.add(object);
    const it = { uid: object.userData.sandboxUid, type, def, object };
    items.push(it);
    if (record) changed();
    return it;
  }

  function remove(uid, record = true) {
    const i = items.findIndex((it) => it.uid === uid);
    if (i < 0 || items[i].def.fixed) return false;
    if (record) pushUndo();
    const it = items[i];
    if (selected === it) select(null);
    root.remove(it.object);
    it.object.traverse((o) => { o.geometry?.dispose(); if (o.isCSS2DObject) o.element.remove(); });
    items.splice(i, 1);
    if (record) changed();
    return true;
  }

  function clear(record = true) {
    if (record) pushUndo();
    for (const it of [...items]) if (!it.def.fixed) remove(it.uid, false);
    if (record) changed();
  }

  function serialize() {
    return items.map((it) => ({
      type: it.type, uid: it.uid,
      x: +it.object.position.x.toFixed(1), y: +it.object.position.y.toFixed(1), z: +it.object.position.z.toFixed(1),
      rotY: +it.object.rotation.y.toFixed(4),
    }));
  }

  function load(list, record = true) {
    if (!Array.isArray(list)) return;
    if (record) pushUndo();
    for (const it of [...items]) { root.remove(it.object); it.object.traverse((o) => { if (o.isCSS2DObject) o.element.remove(); }); }
    items.length = 0;
    select(null);
    for (const s of list) add(s.type, s, false);
    changed(record);
  }

  function changed(save = true) {
    onChange(items);                                   // trước: cho phép onChange chỉnh vị trí (bắt khe) rồi mới lưu
    if (save && storageKey) store.set(storageKey, serialize());
    renderList();
  }

  function pushUndo() {
    undo.push(JSON.stringify(serialize()));
    if (undo.length > 60) undo.shift();
    redo.length = 0;
  }
  function doUndo() { if (!undo.length) return; redo.push(JSON.stringify(serialize())); load(JSON.parse(undo.pop()), false); }
  function doRedo() { if (!redo.length) return; undo.push(JSON.stringify(serialize())); load(JSON.parse(redo.pop()), false); }

  function rotateSel(deg) {
    if (!selected) return;
    pushUndo();
    selected.object.rotation.y += THREE.MathUtils.degToRad(deg);
    updateBox();
    changed();
  }

  function duplicateSel() {
    if (!selected) return;
    const p = selected.object.position;
    const it = add(selected.type, { x: p.x + grid * 2, y: p.y, z: p.z + grid * 2, rotY: selected.object.rotation.y });
    if (it) select(it);
  }

  // ---------------- chọn & khung viền ----------------
  let boxHelper = null;
  function select(it) {
    selected = it;
    if (boxHelper) { boxHelper.parent?.remove(boxHelper); boxHelper.geometry.dispose(); boxHelper = null; }
    if (it && viewer) {
      boxHelper = new THREE.BoxHelper(it.object, 0xffc83d);
      boxHelper.userData.noPick = true;
      viewer.scene.add(boxHelper);
    }
    renderList();
  }
  function updateBox() { boxHelper?.setFromObject(selected.object); }

  // khởi tạo: bố cục đã lưu > bố cục mặc định
  const saved = storageKey ? store.get(storageKey) : null;
  (saved && saved.length ? saved : initial).forEach((s) => add(s.type, s, false));
  onChange(items);

  const api = {
    items, add, remove, clear, serialize, load, select,
    get selected() { return selected; },
    get enabled() { return enabled; },
    set enabled(v) { enabled = v; if (!v) select(null); if (panel) panel.classList.toggle('disabled', !v); },
    rotateSelected: rotateSel, duplicateSelected: duplicateSel, undo: doUndo, redo: doRedo,
    resetLayout() { pushUndo(); load(initial, false); changed(); },
    save() { if (storageKey) store.set(storageKey, serialize()); },
    dispose,
  };
  if (!hasDom) { renderList(); return api; }

  // ---------------- giao diện: bảng Thư viện ----------------
  const vp = viewer.container;
  panel = document.createElement('div');
  panel.className = 'sb-panel';
  panel.innerHTML = `
    <div class="sb-head"><b>📦 ${title}</b><button class="sb-min" title="Thu gọn">–</button></div>
    <input class="sb-search" type="search" placeholder="Tìm…">
    <div class="sb-cats"></div>
    <div class="sb-tools">
      <button data-a="rotL" title="Xoay trái (Q)">⟲</button><button data-a="rotR" title="Xoay phải (E)">⟳</button>
      <button data-a="dup" title="Nhân bản (Ctrl+D)">⧉</button><button data-a="del" title="Xoá (Del)">🗑</button>
      <button data-a="undo" title="Hoàn tác (Ctrl+Z)">↶</button><button data-a="redo" title="Làm lại (Ctrl+Y)">↷</button>
      <button data-a="snap" title="Bắt lưới ${grid} mm" class="on">⌗</button>
      <button data-a="export" title="Xuất bố cục ra file JSON">⤓</button><button data-a="import" title="Mở bố cục từ file JSON">📂</button>
      <button data-a="reset" title="Về bố cục mặc định">↺</button><button data-a="clear" title="Xoá hết đồ có thể xoá">🧹</button>
    </div>
    <div class="sb-sel"></div>
    <div class="sb-hint">Kéo đồ vật vào cảnh · bấm để chọn, kéo để dời · Q/E xoay · Del xoá</div>`;
  vp.appendChild(panel);
  const cats = panel.querySelector('.sb-cats');
  const search = panel.querySelector('.sb-search');
  let armed = null;          // chế độ "bấm mục rồi bấm vào cảnh" (cho màn hình cảm ứng)

  function renderCatalog() {
    const f = search.value.trim().toLowerCase();
    const groups = {};
    for (const c of catalog) {
      if (c.hidden) continue;
      if (f && !(c.name + ' ' + (c.group || '')).toLowerCase().includes(f)) continue;
      (groups[c.group || 'Khác'] ||= []).push(c);
    }
    cats.innerHTML = Object.entries(groups).map(([g, list]) => `<div class="sb-group"><h5>${g}</h5>${list.map((c) =>
      `<div class="sb-item ${armed === c.id ? 'armed' : ''}" draggable="true" data-type="${c.id}" title="${c.desc || c.name}"><span>${c.icon || '▪'}</span>${c.name}</div>`).join('')}</div>`).join('');
    cats.querySelectorAll('.sb-item').forEach((el) => {
      el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/sandbox-type', el.dataset.type); e.dataTransfer.effectAllowed = 'copy'; });
      el.addEventListener('click', () => { armed = armed === el.dataset.type ? null : el.dataset.type; renderCatalog(); });
    });
  }
  search.addEventListener('input', renderCatalog);
  renderCatalog();

  function renderList() {
    if (!hasDom || !panel) return;
    const sel = panel.querySelector('.sb-sel');
    if (!sel) return;
    const counts = {};
    items.forEach((i) => (counts[i.type] = (counts[i.type] || 0) + 1));
    sel.innerHTML = selected
      ? `Đang chọn: <b>${selected.def.icon || ''} ${selected.def.name}</b>${selected.def.fixed ? ' (cố định)' : ''}`
      : `<span>${items.length} đồ vật trong cảnh</span>`;
  }

  panel.querySelector('.sb-min').onclick = () => panel.classList.toggle('min');
  const fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.accept = '.json,application/json';
  fileInput.onchange = async () => {
    const f = fileInput.files[0];
    if (!f) return;
    try { load(JSON.parse(await f.text())); } catch { alert('File bố cục không hợp lệ'); }
    fileInput.value = '';
  };
  panel.querySelector('.sb-tools').addEventListener('click', (e) => {
    const a = e.target.closest('button')?.dataset.a;
    if (!a) return;
    if (a === 'rotL') rotateSel(rotStep);
    if (a === 'rotR') rotateSel(-rotStep);
    if (a === 'dup') duplicateSel();
    if (a === 'del' && selected) remove(selected.uid);
    if (a === 'undo') doUndo();
    if (a === 'redo') doRedo();
    if (a === 'snap') { snap = !snap; e.target.classList.toggle('on', snap); }
    if (a === 'reset' && confirm('Đưa bố cục về mặc định?')) api.resetLayout();
    if (a === 'clear' && confirm('Xoá hết đồ vật (trừ đồ cố định)?')) clear();
    if (a === 'import') fileInput.click();
    if (a === 'export') {
      const blob = new Blob([JSON.stringify(serialize(), null, 1)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `${storageKey || 'bo-cuc'}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  });

  // ---------------- chuột: thả, chọn, kéo di chuyển ----------------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  // mặt sàn tính theo hệ toạ độ thế giới (root thường ở gốc; nếu root bị dời, dùng floorY thế giới)
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorY);
  const dom = viewer.renderer.domElement;

  function setNdc(e) {
    const r = dom.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, viewer.camera);
  }
  const visibleChain = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  function itemOf(obj) {
    for (let o = obj; o; o = o.parent) if (o.userData.sandboxUid) return items.find((i) => i.uid === o.userData.sandboxUid);
    return null;
  }
  // điểm đặt: mặt "surface" (bàn, kệ, đồ có surface:true) cao nhất bị trúng, nếu không thì mặt sàn
  function dropPoint(exclude) {
    const targets = [...surfaces, ...items.filter((i) => i.def.surface && i !== exclude).map((i) => i.object)];
    const hits = ray.intersectObjects(targets, true).filter((h) => h.face && h.face.normal.y > -0.1 && visibleChain(h.object));
    if (hits.length) return hits[0].point;
    const p = new THREE.Vector3();
    return ray.ray.intersectPlane(ground, p) ? p : null;
  }
  const toLocal = (p) => root.worldToLocal(p.clone());
  function snapV(p) {
    if (!snap) return p;
    p.x = Math.round(p.x / grid) * grid;
    p.z = Math.round(p.z / grid) * grid;
    return p;
  }
  function clampBounds(p) {
    if (bounds) { p.x = Math.max(bounds.minX, Math.min(bounds.maxX, p.x)); p.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, p.z)); }
    return p;
  }

  const onDragOver = (e) => { if (enabled && e.dataTransfer.types.includes('text/sandbox-type')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } };
  const onDrop = (e) => {
    const type = e.dataTransfer.getData('text/sandbox-type');
    if (!type || !enabled) return;
    e.preventDefault();
    setNdc(e);
    const pw = dropPoint(null);
    if (!pw) return;
    const p = clampBounds(snapV(toLocal(pw)));
    const it = add(type, { x: p.x, y: p.y, z: p.z });
    if (it) select(it);
  };
  vp.addEventListener('dragover', onDragOver);
  vp.addEventListener('drop', onDrop);

  let drag = null;   // { it, offset, startJson }
  const onDown = (e) => {
    if (!enabled || e.button !== 0) return;
    setNdc(e);
    if (armed) {                                  // đặt đồ ở chế độ bấm-để-đặt
      const pw = dropPoint(null);
      if (pw) { const p = clampBounds(snapV(toLocal(pw))); const it = add(armed, { x: p.x, y: p.y, z: p.z }); if (it) select(it); }
      armed = null; renderCatalog();
      e.stopImmediatePropagation();
      return;
    }
    const hits = ray.intersectObjects(items.map((i) => i.object), true).filter((h) => visibleChain(h.object));
    const it = hits.length ? itemOf(hits[0].object) : null;
    if (!it) { if (selected) select(null); return; }
    select(it);
    if (it.def.fixed) return;
    const pw = dropPoint(it);
    const p = pw ? toLocal(pw) : it.object.position.clone();
    drag = { it, offset: it.object.position.clone().sub(p), before: JSON.stringify(serialize()), moved: false };
    viewer.controls.enabled = false;
    e.stopImmediatePropagation();       // không cho OrbitControls xoay camera khi đang kéo đồ
  };
  const onMove = (e) => {
    if (!drag) return;
    setNdc(e);
    const pw = dropPoint(drag.it);
    if (!pw) return;
    const p = toLocal(pw);
    const np = clampBounds(snapV(p.clone().add(new THREE.Vector3(drag.offset.x, 0, drag.offset.z))));
    drag.it.object.position.set(np.x, p.y, np.z);
    drag.moved = true;
    updateBox();
    onDrag?.(drag.it);
  };
  const onUp = () => {
    if (!drag) return;
    viewer.controls.enabled = true;
    if (drag.moved) { undo.push(drag.before); redo.length = 0; changed(); }
    drag = null;
  };
  dom.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  const onKey = (e) => {
    if (!enabled || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); doRedo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); duplicateSel(); return; }
    if (!selected) return;
    if (k === 'delete' || k === 'backspace') { e.preventDefault(); remove(selected.uid); }
    if (k === 'q') rotateSel(rotStep);
    if (k === 'e') rotateSel(-rotStep);
    if (k === 'escape') select(null);
  };
  window.addEventListener('keydown', onKey);

  function dispose() {
    select(null);
    panel.remove();
    vp.removeEventListener('dragover', onDragOver);
    vp.removeEventListener('drop', onDrop);
    dom.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('keydown', onKey);
    viewer.controls.enabled = true;
  }
  return api;
}

/** Tiện ích: tính hộp va chạm 2D (mặt sàn XZ) của một vật trong sandbox — dùng cho mô phỏng robot */
export function footprint(object) {
  const bb = new THREE.Box3().setFromObject(object);
  return { minX: bb.min.x, maxX: bb.max.x, minZ: bb.min.z, maxZ: bb.max.z, minY: bb.min.y, maxY: bb.max.y };
}
