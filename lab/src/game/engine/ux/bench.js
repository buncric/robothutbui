// =============================================================================
// ux/bench.js — CHẾ ĐỘ BÀN LÀM VIỆC 3D (ngồi vào bàn → camera quỹ đạo + chuột thật, như trang "Hàn mạch PIC" của Lab 3D).
//
//   Vào: ngồi ghế có bàn (seating.sit) khi cài đặt 'benchMode' bật (mặc định) · Tab từ góc nhìn thứ nhất khi đang ngồi.
//   Chuột KHÔNG bị khoá (app.freeCursor = true) — con trỏ hệ điều hành hiện, tia tương tác đi qua con trỏ (ux/precision.js chế độ
//   'absolute' → interact.pointerRay), nên hàn / cắt / đo / cắm dây đều chạy y như thao tác tỉ mỉ.
//   Camera: game.camera bị ghi đè (player.cameraOverride) thành camera QUỸ ĐẠO quanh tâm làm việc (kẹp mạch / bo trên bàn),
//     pha trộn mượt từ mắt người ngồi; cự li 150–1200 mm, góc ngẩng 12–90°, luôn cao hơn mặt bàn, không xuyên tường / bảng ghim
//     (hộp va chạm world.colliders). Tầm với vẫn tính từ VAI người ngồi (interact.bodyEye), không từ camera.
//   Chuột:  kéo phải = xoay · kéo giữa / Shift+kéo phải = dời dọc bàn · cuộn = phóng to về phía con trỏ (Shift+cuộn = nâng/hạ mũi
//           dụng cụ; trên núm xoay = vặn núm) · nhấp phải = nhặt / đặt vật dưới con trỏ · nhấp trái = dùng dụng cụ (giữ để hàn) /
//           cắm linh kiện đang cầm / hành động chính của vật (bật trạm, mở ngăn…).
//   Phím:   T nhìn thẳng xuống bo (T lần nữa = về góc cũ) · G góc 45° mặc định · F xem gần vật dưới con trỏ · C góc thấp nhìn ngang ·
//           W/A/S/D dời camera · R / Shift+R xoay vật đang cầm 90° · X đảo 180° · Esc đặt xuống chỗ con trỏ (tay không: menu) ·
//           M kính hiển vi soi nổi (rời kính → về bàn 3D) · Tab góc nhìn thứ nhất (ngồi) · Space đứng dậy (khoá chuột lại).
//           Shift+T / Shift+G / Shift+F = phím gốc (rút mũi hàn, thả vật, bài học). 1–9 / Q đổi dụng cụ như thường.
//   Hiển thị: viền sáng (OutlinePass) + thẻ chú thích cạnh con trỏ (tên + 1 dòng giải thích lấy từ def.desc / tóm tắt bài học
//     Lab 3D / gợi ý phím của vật) · bóng xem trước khi cầm linh kiện: xanh = cắm được, vàng = lệch (cong chân), đỏ = sai chỗ / NGƯỢC
//     chiều (vẫn cắm được — hậu quả khi cấp nguồn như cũ) + nhãn cực tính (def.orientationKey: khấc chân 1, A/K của LED, −/+ tụ hoá…).
//     Bàn tay viewmodel ẩn; dụng cụ đang cầm bay theo con trỏ, mũi chạm đúng điểm dưới con trỏ.
//   API (test / Playwright): bench.active · enter(seat?) · exit({ stand, lock }) · view('top'|'iso'|'frame'|'front')
//     · pointAt(clientX, clientY) · aimAt(worldPoint) · pickAt(x, y) · mouse(button, down, { shift }) · drag(dx, dy) · wheel(delta, { shift })
//     · cam { target, dist, az, el } (hiện tại) · goal · cameraPose(out?) → { pos, quat } · bodyEye(out)
//   Sự kiện: 'bench:enter' { seat } · 'bench:exit' { stand } · 'bench:view' { view }
// =============================================================================
import * as THREE from 'three';
import { toolUseLabel } from './keys.js';
import { itemName } from '../interact.js';

export const BENCH = {
  distMin: 150, distMax: 1200, distIso: 600,
  elMin: THREE.MathUtils.degToRad(12), elMax: Math.PI / 2, elIso: THREE.MathUtils.degToRad(45), elFront: THREE.MathUtils.degToRad(20),
  clear: 45,          // mm — camera luôn cao hơn mặt bàn ít nhất
  wallPad: 30,        // mm — lùi khỏi tường / bảng ghim
  far: 2600,          // mm — tầm tia con trỏ
  dragPx: 5,
  blendIn: 0.55, blendOut: 0.4,
  reachLimit: 2000,   // mm — mũi dụng cụ với tới điểm con trỏ (hands.reachLimit)
};
const D2R = Math.PI / 180;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _ray = new THREE.Ray(), _box = new THREE.Box3(), _m = new THREE.Matrix4();
const OUTLINE = { ok: [0x2bff7a, 0x0f5c30], warn: [0xffc400, 0x6b5a1f], bad: [0xff2a40, 0x6b1f26] };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const call = (v, ...a) => { try { return typeof v === 'function' ? v(...a) : v; } catch { return ''; } };

const CATEGORY_VI = {
  ic: 'Vi mạch (IC)', passive: 'Linh kiện thụ động', semi: 'Linh kiện bán dẫn', socket: 'Đế cắm IC', connector: 'Đầu nối',
  module: 'Module', pcb: 'Bo mạch', mech: 'Cơ khí', tool: 'Dụng cụ', 'solder-tip': 'Mũi hàn rời', power: 'Nguồn / pin', sensor: 'Cảm biến',
};

// ---------------------------------------------------------------------------- tóm tắt bài học Lab 3D (nạp lười, dạng ?raw)
let LESSON_SRC = null;
try { LESSON_SRC = import.meta.glob(['../../../components/**/*.js', '!../../../components/**/_*.js'], { query: '?raw', import: 'default' }); } catch { LESSON_SRC = null; }
const LESSONS = new Map();
const SUMMARY_RE = /\bsummary:\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/;
function shortText(s, max = 150) {
  s = String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const cut = s.search(/[.:;!?](\s|$)/);
  if (cut > 30 && cut < max) s = s.slice(0, cut + 1);
  return s.length > max ? `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : s;
}
export function lessonSummary(id) {
  if (!id || !LESSON_SRC) return null;
  if (LESSONS.has(id)) return LESSONS.get(id);
  LESSONS.set(id, null);
  const key = Object.keys(LESSON_SRC).find((k) => k.endsWith(`/${id}.js`));
  if (key) LESSON_SRC[key]().then((src) => { const m = SUMMARY_RE.exec(src); if (m) LESSONS.set(id, shortText(m[2].replace(/\\(.)/g, '$1'))); }).catch(() => {});
  return null;
}

/** Nhãn cực tính / chân 1 của linh kiện (def.orientationKey) → [{ pin, text, cls }] */
export function polarityMarks(def, pins) {
  const ok = def?.orientationKey;
  if (!ok || !pins?.length) return [];
  const find = (id) => pins.find((p) => String(p.id) === String(id) || String(p.name) === String(id));
  const out = [];
  const key = find(ok.pin);
  const mark = String(ok.mark || '');
  if (/notch/.test(mark)) { if (key) out.push({ pin: key, text: 'Khấc ← chân 1', cls: 'key' }); }
  else if (/flat|short-lead/.test(mark) && /K/.test(String(ok.pin))) {
    if (key) out.push({ pin: key, text: 'K (−) chân ngắn', cls: 'neg' });
    const a = find('A'); if (a) out.push({ pin: a, text: 'A (+) chân dài', cls: 'pos' });
  } else if (/stripe/.test(mark)) {
    if (key) out.push({ pin: key, text: '− vạch sọc', cls: 'neg' });
    const p = find('+'); if (p) out.push({ pin: p, text: '+', cls: 'pos' });
  } else if (/band/.test(mark)) {
    if (key) out.push({ pin: key, text: 'K · vạch', cls: 'neg' });
    const a = find('A'); if (a) out.push({ pin: a, text: 'A', cls: 'pos' });
  } else {
    for (const p of pins.slice(0, 4)) out.push({ pin: p, text: String(p.name ?? p.id), cls: p === key ? 'key' : '' });
  }
  return out;
}

export class Bench {
  constructor(game, ux) {
    this.game = game;
    this.ux = ux;
    this.active = false;
    this.seat = null;
    this.cam = { target: new THREE.Vector3(), dist: BENCH.distIso, az: 0, el: BENCH.elIso };
    this.goal = { target: new THREE.Vector3(), dist: BENCH.distIso, az: 0, el: BENCH.elIso };
    this.viewName = 'iso';
    this.k = 0;                 // pha trộn camera (0 = mắt người, 1 = quỹ đạo)
    this._leaving = false;
    this._prev = null;          // góc nhìn trước khi bấm T
    this._saved = null;         // góc nhìn lần ngồi trước (cùng ghế)
    this.client = { x: 0, y: 0, in: false };
    this._btns = new Map();     // nút chuột đang giữ → { button, x0, y0, moved, mode:'orbit'|'pan'|null, shift, fwd }
    this._pos = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this.effDist = BENCH.distIso;
    this.top = 750;
    this.rect = null;
    this.az0 = 0;
    this.work = new THREE.Vector3();
    this._hiddenHeld = null;
    this._cursorCss = '';
    this._bindDom();
  }

  get fov() { return this.game.quality?.settings?.benchFov ?? 40; }
  get ndc() { return this.ux.precision.ndc; }

  // ------------------------------------------------------------------ vào / ra
  enter(seat = this.ux.seating.seated) {
    const ux = this.ux, game = this.game, app = game.app;
    if (typeof seat === 'string') seat = ux.seating.get(seat);
    if (!seat?.bench) return false;
    if (ux.seating.seated !== seat) { if (ux.seating.seated) ux.seating.stand(); if (!ux.seating.sit(seat, { bench: false })) return false; }
    if (this.active) return true;
    if (game.interact?.inspecting) game.interact.stopInspect();
    if (ux.microscope?.active) ux.microscope.exit(true);
    this.seat = seat;
    seat.computeFrame();
    this.top = seat.benchTop ?? 750;
    const b = seat.bench;
    this.rect = { x0: b.x - b.w / 2 + 20, x1: b.x + b.w / 2 - 20, z0: b.z - b.d / 2 + 20, z1: b.z + b.d / 2 - 20 };
    this.az0 = seat.yawCenter;
    this.work = this._workCenter();
    if (this._saved && this._saved.seat === seat) { this._setGoal(this._saved.goal, true); this.viewName = this._saved.view; }
    else { this._setGoal(this._isoGoal(), true); this.viewName = 'iso'; }
    this._prev = null;
    this.k = app.headless ? 1 : (this._leaving ? this.k : 0);
    this._leaving = false;
    this.active = true;
    // con trỏ chuột thật (thao tác tỉ mỉ "tuyệt đối")
    const pr = ux.precision;
    if (pr.active) pr.disable();
    pr.far = BENCH.far;
    pr.enable(null, { absolute: true });
    if (this.client.in) this._updateNdc(); else pr.ndc.set(0, 0);
    const h = game.hands;
    if (h) { h.reachLimit = BENCH.reachLimit; h.right.visible = false; h.left.visible = false; }
    game.interact.bodyEye = (out) => this.bodyEye(out);
    if (game.sockets?.ghost) game.sockets.ghost.strong = true;
    this._bloom(true);
    game.player.cameraOverride = (cam, dt) => this._camera(cam, dt);
    // nhả khoá chuột (main.js không mở menu tạm dừng khi app.freeCursor)
    app.freeCursor = true;
    if (app.locked) app.unlockPointer?.();
    if (typeof document === 'undefined' || !document.pointerLockElement) app.locked = false;
    ux.hints?.showTipOnce('bench');
    game.audio?.play?.('whoosh', { vol: 0.22 });
    game.events?.emit('bench:enter', { seat });
    return true;
  }

  /** Rời chế độ bàn 3D. { stand: đứng dậy luôn (seating gọi), lock: khoá chuột lại (mặc định true) } */
  exit({ stand = false, lock = true } = {}) {
    if (!this.active) return false;
    const ux = this.ux, game = this.game, app = game.app;
    this.active = false;
    this._saved = { seat: this.seat, goal: this._cloneGoal(this.goal), view: this.viewName };
    this._releaseAll();
    if (this._hiddenHeld) { this._hiddenHeld.object.visible = true; this._hiddenHeld = null; }
    if (ux.microscope?.active) ux.microscope.exit(true);
    if (ux.precision.active) ux.precision.disable();
    const h = game.hands;
    if (h) { h.right.visible = true; h.left.visible = true; }
    game.interact.bodyEye = null;
    game.interact.placeYaw = null;
    if (game.sockets?.ghost) game.sockets.ghost.strong = false;
    this._ghostOutline(false);
    this._bloom(false);
    // góc nhìn thứ nhất: nhìn về chỗ đang làm
    if (!stand && this.seat) {
      const eye = this.bodyEye(_v), d = _v2.copy(this.cam.target).sub(eye);
      game.player.yaw = Math.atan2(-d.x, -d.z);
      game.player.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    }
    if (app.headless) { this.k = 0; game.player.cameraOverride = null; } else this._leaving = true;
    ux.hud.setBench?.(null);
    this._setCursorCss('');
    app.freeCursor = false;
    if (lock && game.started !== false) {
      const p = app.lockPointer?.();
      p?.then?.((ok) => { if (!ok && !app.locked) game.hud?.toast?.('Bấm vào màn hình để điều khiển góc nhìn', { kind: 'info', short: true }); });
    }
    game.audio?.play?.('whoosh', { vol: 0.16 });
    game.events?.emit('bench:exit', { stand });
    return true;
  }

  /** Mắt thân người đang ngồi (tầm với tính từ đây, không từ camera quỹ đạo) */
  bodyEye(out = new THREE.Vector3()) {
    const s = this.seat || this.ux.seating.seated;
    if (!s) return this.game.player.eyePosition(out);
    return this.ux.seating._eyeFor(s, out);
  }

  // ------------------------------------------------------------------ góc nhìn
  _cloneGoal(g) { return { target: g.target.clone(), dist: g.dist, az: g.az, el: g.el }; }

  _inRect(p) { const r = this.rect; return !!r && p.x >= r.x0 - 60 && p.x <= r.x1 + 60 && p.z >= r.z0 - 60 && p.z <= r.z1 + 60; }

  /** Tâm làm việc: kẹp mạch (bo trên kẹp) trên bàn này → không có thì giữa mặt bàn trước người ngồi */
  _workCenter() {
    const vs = this.game.sockets?.get?.('vise');
    if (vs?.object3D?.parent) {
      const p = vs.object3D.getWorldPosition(new THREE.Vector3());
      if (this._inRect(p)) {
        if (vs.occupiedBy?.object) { _box.setFromObject(vs.occupiedBy.object); if (!_box.isEmpty()) return _box.getCenter(new THREE.Vector3()).setY(_box.max.y); }
        return p;
      }
    }
    const s = this.seat;
    return s.edge.clone().addScaledVector(s.normal, 330).setY(this.top + 10);
  }

  /** Bo mạch để nhìn thẳng xuống: bo trên kẹp → bo gần tâm làm việc nhất trên bàn → tâm làm việc */
  boardFocus() {
    const game = this.game;
    const vs = game.sockets?.get?.('vise');
    let it = vs?.occupiedBy && vs.object3D && this._inRect(vs.object3D.getWorldPosition(_v)) ? vs.occupiedBy : null;
    if (!it) {
      const w = this._workCenter();
      let best = null;
      for (const i of game.items?.all || []) {
        if (i.heldBy || i.inBag || !i.object?.parent) continue;
        if (!/board|perfboard|breadboard|pcb/.test(`${i.def.id} ${i.def.category || ''}`)) continue;
        const p = i.object.getWorldPosition(_v2);
        if (!this._inRect(p) || p.y < this.top - 20 || p.y > this.top + 300) continue;
        const d = p.distanceTo(w);
        if (!best || d < best.d) best = { i, d };
      }
      it = best?.i || null;
    }
    if (it) {
      const box = new THREE.Box3().setFromObject(it.object);
      if (!box.isEmpty()) return { item: it, box, center: box.getCenter(new THREE.Vector3()).setY(box.max.y) };
    }
    return { item: null, box: null, center: this._workCenter() };
  }

  /** Góc 45° mặc định: tâm nhích về phía người ngồi ~70 mm để linh kiện sát mép bàn không bị thanh dụng cụ che */
  _isoGoal() { return { target: this._workCenter().addScaledVector(this.seat.normal, -70), dist: BENCH.distIso, az: this.az0, el: BENCH.elIso }; }

  /** Cự li để khung hình vừa hộp `box` (nhìn từ trên xuống: chiều sâu bàn = dọc màn hình) */
  _fitTop(box) {
    const s = this.seat;
    const size = box.getSize(_v);
    const along = Math.abs(size.x * s.normal.x) + Math.abs(size.z * s.normal.z);
    const across = Math.abs(size.x * s.lateral.x) + Math.abs(size.z * s.lateral.z);
    const t = Math.tan((this.fov * D2R) / 2), asp = (this.game.app.width || 1280) / (this.game.app.height || 720);
    return Math.max(along / (2 * t), across / (2 * t * asp)) * 1.3 + 20;
  }
  _fitSphere(box) {
    const r = box.getSize(_v).length() / 2;
    return (r / Math.sin((this.fov * D2R) / 2)) * 1.15;
  }

  /** Đổi góc nhìn: 'top' (T — bấm lại = về góc cũ) · 'iso' (G) · 'frame' (F — vật dưới con trỏ) · 'front' (C) */
  view(name = 'iso') {
    if (!this.active) return false;
    const g = this.goal;
    if (name === 'top') {
      if (this.viewName === 'top' && this._prev) { this._setGoal(this._prev.goal); this.viewName = this._prev.view; this._prev = null; }
      else {
        this._prev = { goal: this._cloneGoal(g), view: this.viewName };
        const f = this.boardFocus();
        this._setGoal({ target: f.center, dist: f.box ? this._fitTop(f.box) : 420, az: this.az0, el: BENCH.elMax });
        this.viewName = 'top';
      }
    } else if (name === 'iso') { this._prev = null; this._setGoal(this._isoGoal()); this.viewName = 'iso'; }
    else if (name === 'front') { this._prev = null; this._setGoal({ target: this._workCenter(), dist: 560, az: this.az0, el: BENCH.elFront }); this.viewName = 'front'; }
    else if (name === 'frame') {
      const t = this.game.interact.target;
      const obj = t?.item?.object || t?.object;
      if (!obj || t?.isSurface && !t.item) {
        const p = this.game.interact.pointer.point;
        if (!p) return false;
        this._setGoal({ target: p.clone(), dist: 320, az: g.az, el: g.el });
      } else {
        const box = new THREE.Box3().setFromObject(obj);
        if (box.isEmpty()) return false;
        this._setGoal({ target: box.getCenter(new THREE.Vector3()), dist: this._fitSphere(box), az: g.az, el: Math.max(g.el, BENCH.elIso * 0.8) });
      }
      this._prev = null;
      this.viewName = 'frame';
    } else return false;
    this.game.audio?.play?.('tick', { vol: 0.25 });
    this.game.events?.emit('bench:view', { view: this.viewName });
    return true;
  }

  /** Đặt đích camera (đã giới hạn); snap → nhảy ngay không trượt */
  _setGoal(g, snap = false) {
    const G = this.goal;
    if (g.target) G.target.copy(g.target);
    if (g.dist != null) G.dist = g.dist;
    if (g.az != null) G.az = g.az;
    if (g.el != null) G.el = g.el;
    this._clampGoal();
    if (snap || this.game.app.headless) {
      const C = this.cam;
      C.target.copy(G.target); C.dist = G.dist; C.az = G.az; C.el = G.el;
    }
  }

  _clampGoal() {
    const G = this.goal, r = this.rect;
    G.dist = THREE.MathUtils.clamp(G.dist, BENCH.distMin, BENCH.distMax);
    G.el = THREE.MathUtils.clamp(G.el, BENCH.elMin, BENCH.elMax);
    if (r) {
      G.target.x = THREE.MathUtils.clamp(G.target.x, r.x0, r.x1);
      G.target.z = THREE.MathUtils.clamp(G.target.z, r.z0, r.z1);
    }
    G.target.y = THREE.MathUtils.clamp(G.target.y, this.top, this.top + 450);
  }

  /** Tư thế camera quỹ đạo từ { target, dist, az, el } (đã tránh mặt bàn + tường) */
  cameraPose(c = this.cam, out = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() }) {
    let el = THREE.MathUtils.clamp(c.el, BENCH.elMin, BENCH.elMax);
    let d = THREE.MathUtils.clamp(c.dist, BENCH.distMin, BENCH.distMax);
    // luôn cao hơn mặt bàn: nâng góc ngẩng nếu cần
    const minY = this.top + BENCH.clear;
    if (c.target.y + d * Math.sin(el) < minY) el = Math.asin(THREE.MathUtils.clamp((minY - c.target.y) / d, Math.sin(BENCH.elMin), 1));
    const dir = _v3.set(Math.cos(el) * Math.sin(c.az), Math.sin(el), Math.cos(el) * Math.cos(c.az));
    // không xuyên tường / tủ / bảng ghim (world.colliders)
    _ray.set(c.target, dir);
    for (const b of this.game.world?.colliders || []) {
      if (!b || b === this.seat?.collider || b.max.y < c.target.y + 2 || b.containsPoint(c.target)) continue;
      const p = _ray.intersectBox(b, _v);
      if (!p) continue;
      const t = p.distanceTo(c.target);
      if (t < d + BENCH.wallPad) d = Math.max(60, t - BENCH.wallPad);
    }
    // vật che giữa tâm và camera (kính hiển vi, đèn kẹp, quạt hút khói…): kéo camera lại gần (đo 10 lần/giây trong update)
    const oc = this._occ;
    if (oc && Math.abs(wrap(oc.az - c.az)) < 0.1 && Math.abs(oc.el - el) < 0.1 && oc.target.distanceToSquared(c.target) < 400) d = Math.min(d, oc.d);
    this.effDist = d;
    this.effEl = el;
    out.pos.copy(c.target).addScaledVector(dir, d);
    _e.set(-el, c.az, 0, 'YXZ');
    out.quat.setFromEuler(_e);
    return out;
  }

  /** Khoảng trống từ tâm quỹ đạo tới vật che gần nhất theo hướng camera (raycast các vật đã đăng ký tương tác + item) */
  _occlusion() {
    const c = this.cam, game = this.game, it = game.interact;
    const el = this.effEl ?? c.el;
    const dir = _v3.set(Math.cos(el) * Math.sin(c.az), Math.sin(el), Math.cos(el) * Math.cos(c.az));
    const rc = this._rc || (this._rc = new THREE.Raycaster());
    rc.set(c.target, dir);
    rc.far = BENCH.distMax;
    const ghost = game.sockets?.ghost?.root;
    let best = Infinity;
    for (const h of rc.intersectObjects(it._gatherCandidates(), true)) {
      if (h.distance < 4) continue;
      let skip = false;
      for (let o = h.object; o; o = o.parent) {
        if (!o.visible || o === ghost || o.userData?.isHand || o.userData?.noInteract || o.userData?.item?.heldBy) { skip = true; break; }
      }
      if (skip) continue;
      best = h.distance; break;
    }
    this._occ = { az: c.az, el, target: c.target.clone(), d: Number.isFinite(best) ? Math.max(40, best - 14) : Infinity };
  }

  /** player.cameraOverride: camera người chơi → camera quỹ đạo (pha trộn k) */
  _camera(cam, dt) {
    const app = this.game.app, hl = !!app.headless;
    if (this._leaving) {
      this.k = hl ? 0 : Math.max(0, this.k - dt / BENCH.blendOut);
      if (this.k <= 0) { this._leaving = false; this.game.player.cameraOverride = null; return; }
    } else this.k = hl ? 1 : Math.min(1, this.k + dt / BENCH.blendIn);
    const C = this.cam, G = this.goal;
    if (this.active) {
      const a = hl || this._drag?.mode ? 1 : 1 - Math.exp(-11 * dt);
      C.target.lerp(G.target, a);
      C.dist += (G.dist - C.dist) * a;
      C.az += wrap(G.az - C.az) * a;
      C.el += (G.el - C.el) * a;
    }
    const pose = this.cameraPose(C, this._poseOut || (this._poseOut = { pos: this._pos, quat: this._quat }));
    const k = this.k, e = k * k * (3 - 2 * k);
    cam.position.lerp(pose.pos, e);
    cam.quaternion.slerp(pose.quat, e);
    const fov = cam.fov + (this.fov - cam.fov) * e;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }

  // ------------------------------------------------------------------ chuột (DOM + API cho test)
  _bindDom() {
    const el = this.game.app?.renderer?.domElement;
    if (!el || typeof window === 'undefined') return;
    this.el = el;
    // sự kiện CHUỘT (không dùng pointer*): bấm thêm nút thứ 2 khi đang giữ nút 1 (giữ trái hàn + nhấn phải mớm thiếc) chỉ phát
    // 'pointermove' theo chuẩn Pointer Events, còn 'mousedown' thì phát cho từng nút
    el.addEventListener('mousedown', (e) => {
      if (!this._accept()) return;
      e.preventDefault();
      this.client.in = true;
      this._moveTo(e.clientX, e.clientY);
      this.mouse(e.button, true, { shift: e.shiftKey });
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.active) return;
      if (e.target !== el && !this._btns.size) { this.client.in = false; return; }
      this.client.in = true;
      this._moveTo(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', (e) => { if (this.active) this.mouse(e.button, false); });
    el.addEventListener('mouseleave', () => { if (!this._btns.size) this.client.in = false; });
    window.addEventListener('blur', () => this._releaseAll());          // nhả chuột ngoài cửa sổ → không kẹt nút (mỏ hàn dính mãi)
    this.game.events?.on?.('game:paused', (e) => { if (e.paused) this._releaseAll(); });
    el.addEventListener('wheel', (e) => {
      if (!this._accept()) return;
      e.preventDefault();
      this._moveTo(e.clientX, e.clientY);
      this.wheel(Math.sign(e.deltaY), { shift: e.shiftKey });
    }, { passive: false });
  }

  _accept() {
    const g = this.game, app = g.app;
    return this.active && !app.paused && !g.hud?.menuOpen && !app.uiMode && !g.inventory?.bagOpen;
  }

  _rect() {
    if (this.el?.getBoundingClientRect) return this.el.getBoundingClientRect();
    const app = this.game.app;
    return { left: 0, top: 0, width: app.width || 1280, height: app.height || 720 };
  }

  _updateNdc() {
    const r = this._rect();
    const nx = ((this.client.x - r.left) / r.width) * 2 - 1, ny = -((this.client.y - r.top) / r.height) * 2 + 1;
    const ndc = this.ndc;
    ndc.set(THREE.MathUtils.clamp(nx, -1, 1), THREE.MathUtils.clamp(ny, -1, 1));
    // kính hiển vi: giữ con trỏ trong vòng thị kính
    if (this.ux.microscope?.active) {
      const asp = r.width / r.height, rx = ndc.x * asp, ry = ndc.y, rr = Math.hypot(rx, ry), R = 0.9;
      if (rr > R) ndc.set((rx * R / rr) / asp, ry * R / rr);
    }
  }

  /** Rê con trỏ tới (clientX, clientY) — kéo chuột phải / giữa thì xoay / dời camera */
  _moveTo(x, y) {
    const dx = x - this.client.x, dy = y - this.client.y;
    this.client.x = x; this.client.y = y;
    this._updateNdc();
    if (!this._btns.size) return;
    const using = this._btns.get(0)?.fwd;      // đang giữ chuột trái dùng dụng cụ (hàn) → chuột phải không xoay camera
    for (const d of this._btns.values()) {
      if (d.moved || Math.hypot(x - d.x0, y - d.y0) <= BENCH.dragPx) continue;
      d.moved = true;
      if (this.ux.microscope?.active || this._drag || (using && d.button === 2)) continue;
      d.mode = d.button === 1 || (d.button === 2 && d.shift) ? 'pan' : d.button === 2 ? 'orbit' : null;
      if (d.mode && d.fwd) { this._fwd(d.button, false); d.fwd = false; }      // đang mớm thiếc mà kéo → thành xoay camera
    }
    const m = this._drag;
    if (m) this.drag(dx, dy, m.mode);
  }

  /** Nút chuột đang kéo xoay / dời camera (nếu có) */
  get _drag() { for (const d of this._btns.values()) if (d.mode) return d; return null; }

  /** Xoay ('orbit') / dời ('pan') camera theo độ dời chuột (pixel) */
  drag(dx, dy, mode = 'orbit') {
    const G = this.goal;
    if (mode === 'orbit') {
      G.az -= dx * 0.0065;
      G.el = THREE.MathUtils.clamp(G.el + dy * 0.0055, BENCH.elMin, BENCH.elMax);
    } else {
      const H = this.game.app.height || 720;
      const s = (2 * this.cam.dist * Math.tan((this.fov * D2R) / 2)) / H;
      const az = this.cam.az;
      const rx = Math.cos(az), rz = -Math.sin(az);            // phải màn hình (trên mặt bàn)
      const fx = -Math.sin(az), fz = -Math.cos(az);           // "lên" màn hình chiếu xuống mặt bàn
      const kf = 1 / Math.max(0.35, Math.sin(this.cam.el));
      G.target.x += -rx * dx * s + fx * dy * s * kf;
      G.target.z += -rz * dx * s + fz * dy * s * kf;
    }
    this._clampGoal();
    if (this.game.app.headless || this._drag?.mode) { this.cam.az = G.az; this.cam.el = G.el; this.cam.target.copy(G.target); }
    this.viewName = 'free';
    this._prev = null;
  }

  /** Cuộn: phóng to về phía con trỏ · Shift = phím gốc (nâng/hạ mũi, cuộn dụng cụ) · trên núm xoay = vặn núm */
  wheel(delta, { shift = false } = {}) {
    if (!this.active || !delta) return;
    const it = this.game.interact;
    const knob = it.target?.inReach && (it.target.chain.some((s) => s.onScroll) || it._targetScroll);
    if (this.ux.microscope?.active || shift || knob) { this.game.events.emit('input:wheel', { delta, fine: false, _bench: true }); return; }
    const G = this.goal;
    const nd = THREE.MathUtils.clamp(G.dist * Math.pow(1.15, delta), BENCH.distMin, BENCH.distMax);
    const P = it.pointer?.point;
    if (P && delta < 0 && nd < G.dist) G.target.lerp(P, 1 - nd / G.dist);
    G.dist = nd;
    this._clampGoal();
    if (this.game.app.headless) this._setGoal({}, true);
    this.viewName = 'free';
    this._prev = null;
  }

  /** Nút chuột (0 trái · 1 giữa · 2 phải) — chung cho DOM và test */
  mouse(button, down, { shift = false } = {}) {
    if (!this.active) return;
    const it = this.game.interact;
    const mic = !!this.ux.microscope?.active;
    if (down) {
      if (this._btns.has(button)) return;
      const d = { button, x0: this.client.x, y0: this.client.y, moved: false, mode: null, shift, fwd: false };
      this._btns.set(button, d);
      if (mic) { if (button === 0 || (button === 2 && this.game.inventory?.secondaryTool)) { this._fwd(button, true); d.fwd = true; } return; }
      if (button === 0) d.fwd = this._primary();
      else if (button === 2 && !shift && this.game.inventory?.secondaryTool && !it.heldItem) { this._fwd(2, true); d.fwd = true; }
      return;
    }
    const d = this._btns.get(button);
    if (!d) return;
    this._btns.delete(button);
    if (d.fwd) this._fwd(button, false);
    else if (button === 2 && !d.moved && !mic) this._secondaryClick();
  }

  /** Nhả mọi nút đang giữ (không tính là nhấp) */
  _releaseAll() {
    for (const d of this._btns.values()) if (d.fwd) this._fwd(d.button, false);
    this._btns.clear();
  }

  _fwd(button, down) { this.game.events.emit('input:mouse', { button, down, _bench: true }); }

  /** Chuột trái: cắm / đặt vật đang cầm · dùng dụng cụ · hành động chính của vật. true = đã chuyển nút cho interact (cần nhả) */
  _primary() {
    const it = this.game.interact;
    if (it.heldItem) { this.place(); return false; }
    if (it.tool) { this._fwd(0, true); return true; }
    it._prompts = it._collectPrompts();
    const lp = it._findPrompt('LMB');
    if (lp && !lp.display) { this._fwd(0, true); return true; }
    const ep = it._findPrompt('E');
    if (ep && !ep.display) {
      if (ep.disabled) { this.game.audio?.play?.('error'); if (ep.reason) this.game.hud?.toast?.(ep.reason, { kind: 'warn', short: true }); }
      else it._runPrompt(ep, 'E');
      return false;
    }
    if (it.target && !it.target.inReach && (it.target.chain.length || it.target.item)) this.game.hud?.toast?.('Ngoài tầm tay khi ngồi — dời ghế hoặc đứng dậy (Space)', { kind: 'info', short: true });
    return false;
  }

  /** Chuột phải (nhấp, không kéo): nhặt vật dưới con trỏ / đặt vật đang cầm */
  _secondaryClick() {
    const it = this.game.interact;
    if (it.heldItem) return this.place();
    const t = it.target;
    if (t?.item && this.game.items?.pickable?.(t.item) && !t.item.isHotbarTool) {
      if (!t.inReach) { this.game.hud?.toast?.('Ngoài tầm tay khi ngồi', { kind: 'info', short: true }); return null; }
      return it.pick(t.item) ? t.item : null;
    }
    return null;
  }

  /** Cắm vào khe / đặt xuống mặt bàn theo bóng xem trước hiện tại */
  place() {
    const it = this.game.interact, pl = it.placement;
    const warn = (msg) => { this.game.audio?.play?.('error'); this.game.hud?.toast?.(msg, { kind: 'warn', short: true }); return false; };
    if (pl?.kind === 'socket') return pl.valid ? it.insertHeld() : warn(pl.result?.reason || (pl.reach ? 'Không cắm được vào đây' : 'Ngoài tầm tay'));
    if (pl?.kind === 'surface') return pl.valid ? it.placeHeld() : warn(pl.reason || 'Không đặt được ở đây');
    return warn('Rê chuột lên mặt bàn hoặc lỗ cắm rồi bấm để đặt');
  }

  /** Esc: đặt vật đang cầm xuống chỗ con trỏ (mặt phẳng) */
  putDown() {
    const it = this.game.interact, pl = it.placement;
    if (pl?.kind === 'surface' && pl.valid) return it.placeHeld();
    this.game.audio?.play?.('error');
    this.game.hud?.toast?.(pl?.kind === 'socket' ? 'Đang trỏ vào lỗ cắm — bấm chuột để cắm, hoặc rê ra chỗ trống rồi Esc' : (pl?.reason || 'Rê chuột ra chỗ trống trên mặt bàn rồi Esc'), { kind: 'info', short: true });
    return false;
  }

  // ------------------------------------------------------------------ API tiện cho test / Playwright
  pointAt(x, y) {
    this.client.in = true;
    this._moveTo(x, y);
    this.game.camera.updateMatrixWorld();
    this.game.interact.update(0);
    return this.game.interact.pointer.point?.clone() || null;
  }
  /** Con trỏ tới điểm thế giới → toạ độ màn hình { x, y } */
  aimAt(p) {
    const cam = this.game.camera;
    cam.updateMatrixWorld();
    const v = _v.copy(p).project(cam), r = this._rect();
    const x = r.left + (v.x * 0.5 + 0.5) * r.width, y = r.top + (-v.y * 0.5 + 0.5) * r.height;
    this.pointAt(x, y);
    return { x, y };
  }
  /** Nhấp chuột phải tại (x, y): nhặt / đặt */
  pickAt(x, y) {
    this.pointAt(x, y);
    return this._secondaryClick();
  }

  // ------------------------------------------------------------------ phím (ux.capture → đây trước seating)
  onInput(e) {
    if (!this.active || e._bench) return false;
    const it = this.game.interact;
    if (e.type === 'input:key') {
      if (!e.down) return false;
      const held = it.heldItem;
      switch (e.code) {
        case 'Space': this.ux.seating.stand(); return true;
        case 'Tab': if (e.shift) return false; this.exit(); return true;
        case 'Escape':
          if (held) this.putDown();
          else this.game.pauseMenu ? this.game.pauseMenu() : this.game.hud?.openMenu?.('settings');
          return true;
        case 'KeyT': if (e.shift) return false; this.view('top'); return true;
        case 'KeyG': if (e.shift) return false; this.view('iso'); return true;
        case 'KeyF': if (e.shift) return false; this.view('frame'); return true;
        case 'KeyC': this.view('front'); return true;
        case 'KeyM': {
          const m = this.ux.microscope;
          if (!m?.root) return true;
          if (m.active) m.exit();
          else { const c = m.canEnter(); if (c.ok) m.enter(); else this.game.hud?.toast?.(c.reason, { kind: 'warn', short: true }); }
          return true;
        }
        case 'KeyR': if (!held) return false; it.rotate(e.shift ? 3 : 1); return true;
        case 'KeyX': if (!held) return false; it.rotate(2); return true;
        case 'KeyZ': return true;
        case 'KeyW': case 'KeyA': case 'KeyS': case 'KeyD': case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight': return true;
        default: return false;
      }
    }
    if (e.type === 'input:wheel') return true;                       // cuộn thật đi qua bench.wheel (DOM)
    if (e.type === 'input:mouse') return !!e.down && e.button === 1;  // chuột giữa: không bật tỉ mỉ
    return false;
  }

  // ------------------------------------------------------------------ mỗi khung (ux.update, sau interact)
  update(dt) {
    if (!this.active) return;
    const game = this.game, app = game.app, it = game.interact;
    // vật che camera: đo lại 10 lần/giây (và ngay khi góc quay đổi nhiều)
    this._occT = (this._occT || 0) - dt;
    const oc = this._occ;
    if (this._occT <= 0 || !oc || Math.abs(wrap(oc.az - this.cam.az)) > 0.05 || Math.abs(oc.el - (this.effEl ?? this.cam.el)) > 0.05 || oc.target.distanceToSquared(this.cam.target) > 100) { this._occT = 0.1; this._occlusion(); }
    // W/A/S/D: dời camera dọc bàn
    const keys = app.input?.keys;
    if (keys && !app.paused && !app.uiMode && !this.ux.microscope?.active) {
      const px = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      const pz = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      if (px || pz) this.drag(-px * 900 * dt, pz * 900 * dt * Math.max(0.35, Math.sin(this.cam.el)), 'pan');
    }
    // vật đặt xuống thẳng hàng với bàn (bội số 90° quanh hướng ngồi)
    it.placeYaw = this.az0 + Math.round(wrap(this.cam.az - this.az0) / (Math.PI / 2)) * (Math.PI / 2);
    // bóng xem trước: cắm NGƯỢC chiều → đỏ (vẫn cắm được); vật đang cầm ẩn khi đã có bóng
    const held = it.heldItem, ghost = game.sockets?.ghost, pl = it.placement;
    if (held && ghost && pl?.kind === 'socket' && pl.valid && pl.result?.orientation === 'reversed') ghost.show(held, pl.matrix, 'bad');
    if (ghost?.root.children[0] && !ghost.root.children[0].visible) ghost.root.children[0].visible = true;
    if (this._hiddenHeld && this._hiddenHeld !== held) { this._hiddenHeld.object.visible = true; this._hiddenHeld = null; }
    if (held) {
      const show = !(ghost?.visible);
      if (held.object.visible !== show) held.object.visible = show;
      this._hiddenHeld = held;
    }
    this._ghostOutline(!!(held && ghost?.visible), ghost?.state);
    // con trỏ CSS
    const d = this._drag, t = it.target;
    this._setCursorCss(d?.mode === 'orbit' ? 'grabbing' : d?.mode === 'pan' ? 'move' : this.ux.microscope?.active ? 'none'
      : it.tool && !held ? 'crosshair' : !held && t?.inReach && t.item && game.items?.pickable?.(t.item) && !t.item.isHotbarTool ? 'grab'
        : !held && t?.inReach && t.chain?.length ? 'pointer' : 'default');
    // thẻ chú thích + nhãn chân
    const hud = this.ux.hud;
    if (!hud?.setBench) return;
    const using = it.uses?.size || it.holding || it.dragging;      // đang hàn / giữ nút: không che chỗ làm việc
    if (app.paused || this.ux.microscope?.active || d?.mode || using || !this.client.in || game.hud?.menuOpen || app.uiMode) { hud.setBench(null); return; }
    hud.setBench({ tip: this._tipModel(), pins: this._pinModel() });
  }

  /** Bloom dịu hơn khi nhìn gần mặt bo từ trên: lớp phủ bóng + pad thiếc phản chiếu đèn trần vượt ngưỡng → loá trắng cả bo,
   *  che mất bóng xem trước. Vẫn giữ loé cho LED / mũi hàn đỏ (rất sáng). */
  _bloom(on) {
    const bl = this.game.app.passes?.bloom;
    if (!bl) return;
    if (on) {
      if (this._bloomWas) return;
      this._bloomWas = { strength: bl.strength, threshold: bl.threshold };
      bl.strength = Math.min(bl.strength, 0.18); bl.threshold = Math.max(bl.threshold, 2.6);
    } else if (this._bloomWas) {
      Object.assign(bl, this._bloomWas);
      this._bloomWas = null;
    }
  }

  /** Viền sáng (OutlinePass) quanh bóng xem trước, màu theo trạng thái — bóng nhỏ trên bo xanh vẫn nổi rõ */
  _ghostOutline(on, state = 'ok') {
    const app = this.game.app, ol = app.passes?.outline;
    if (!ol || !app.setOutline) return;
    if (on) {
      const c = OUTLINE[state] || OUTLINE.ok;
      if (this._olState !== state) { ol.visibleEdgeColor.setHex(c[0]); ol.hiddenEdgeColor.setHex(c[1]); ol.edgeStrength = 7; ol.edgeThickness = 2; this._olState = state; }
      if (app._outlineSel?.[0] !== this.game.sockets.ghost.root) app.setOutline([this.game.sockets.ghost.root]);
      this._olOn = true;
    } else if (this._olOn) {
      this._olOn = false; this._olState = null;
      ol.visibleEdgeColor.setHex(0x7fd8ff); ol.hiddenEdgeColor.setHex(0x1d3a52); ol.edgeStrength = 4; ol.edgeThickness = 1.2;   // như app.js
      const h = this.game.interact._highlighted;
      app.setOutline(h ? [h] : []);
    }
  }

  _setCursorCss(c) {
    if (c === this._cursorCss || !this.el) return;
    this._cursorCss = c;
    this.el.style.cursor = c;
  }

  // ------------------------------------------------------------------ thẻ chú thích
  /** Mô tả 1 dòng: def.desc → tóm tắt bài học Lab 3D → loại linh kiện */
  describe(item) {
    const d = item?.def;
    if (!d) return '';
    return shortText(d.desc || d.summary || d.info || '') || lessonSummary(d.lessonId) || CATEGORY_VI[d.category] || (d.kind === 'tool' ? 'Dụng cụ' : 'Linh kiện');
  }

  _tipModel() {
    const game = this.game, it = game.interact, inv = game.inventory;
    const held = it.heldItem, tool = it.tool, sec = inv?.secondaryTool, t = it.target;
    const x = this.client.x, y = this.client.y;
    const keys = [];
    if (held) {
      const pl = it.placement;
      let sub = 'Rê lên mặt bàn hoặc lỗ cắm', cls = '';
      if (pl?.kind === 'socket') {
        const s = pl.socket, owner = s.owner ? itemName(s.owner) : '';
        const where = `${s.name || (s.localId ? `lỗ ${s.localId}` : `khe ${s.kind}`)}${owner && !s.name ? ` · ${owner}` : ''}`;
        if (!pl.valid) { sub = `✗ ${pl.result?.reason || (pl.reach ? 'Không cắm được' : 'Ngoài tầm tay')}`; cls = 'bad'; }
        else if (pl.result?.orientation === 'reversed') { sub = `⚠ NGƯỢC chiều 180° — vẫn cắm được vào ${where}, cấp nguồn sẽ hỏng!`; cls = 'bad'; }
        else if (!pl.aligned) { sub = `⚠ Lệch tâm ${where} — ấn vào sẽ cong chân`; cls = 'warn'; }
        else { sub = `✓ Cắm vào ${where}`; cls = 'ok'; }
        keys.push(['LMB', 'Cắm']);
      } else if (pl?.kind === 'surface') {
        sub = pl.valid ? '✓ Đặt xuống chỗ này' : `✗ ${pl.reason || 'Không đặt được'}`; cls = pl.valid ? 'ok' : 'bad';
        keys.push(['LMB', 'Đặt xuống']);
      }
      keys.push(['R', 'Xoay 90°'], ['X', 'Đảo 180°']);
      const hp = it.parts?.heldPrompts?.(held)?.find((p) => p.key === 'B');
      if (hp) keys.push(['B', shortText(hp.label, 34)]);
      keys.push(['Esc', 'Đặt xuống']);
      return { x, y, name: itemName(held), desc: '', sub, cls, keys };
    }
    if (!t || (!t.chain.length && !t.item)) return null;
    const ctx = it._ctx();
    let name = call(t.spec?.name, ctx) || (t.item ? itemName(t.item) : '');
    if (t.subpart && t.item && !name.includes(itemName(t.item))) name = `${name} · ${itemName(t.item)}`;
    if (!name) return null;
    let desc = tool ? '' : t.item ? this.describe(t.item) : shortText(call(t.spec?.desc, ctx) || '');
    const pickable = t.item && game.items?.pickable?.(t.item) && !t.item.isHotbarTool;
    if (!t.inReach) return { x, y, name, desc, sub: 'Ngoài tầm tay khi ngồi', cls: 'far', keys: [['F', 'Xem gần']] };
    const prompts = (it._prompts || []).filter((p) => !p.src && !p.display && !p.disabled);
    if (tool) {
      keys.push(['LMB', toolUseLabel(tool)]);
      if (sec) keys.push(['RMB', `${toolUseLabel(sec)} (tay trái)`]);
      else if (pickable) keys.push(['RMB', 'Nhặt']);
    } else if (pickable) {
      keys.push(['RMB', t.item.def.kind === 'tool' ? 'Lấy' : 'Nhặt']);
      const lp = prompts.find((p) => p.key === 'LMB');
      keys.push(['LMB', lp ? shortText(lp.label, 30) : (t.item.def.kind === 'tool' ? 'Lấy' : 'Nhặt')]);
    } else {
      const lp = prompts.find((p) => p.key === 'LMB') || prompts.find((p) => p.key === 'E');
      if (lp) keys.push(['LMB', shortText(lp.label, 34)]);
      if (!desc && lp) desc = '';
    }
    const ss = t.chain.find((s) => s.onScroll);
    if (ss || it._targetScroll) keys.push(['WHEEL', ss?.scrollLabel ? call(ss.scrollLabel) : 'Vặn núm']);
    if (!desc && !t.item) {
      const pp = this.ux.hints?.primaryPrompt?.(t.object);
      if (pp && !keys.length) keys.push(['LMB', pp.label]);
    }
    const lesson = t.chain.find((s) => s.lessonId)?.lessonId || t.item?.def?.lessonId;
    if (lesson) keys.push(['Shift+F', 'Bài học']);
    return { x, y, name, desc, sub: '', cls: '', keys };
  }

  /** Nhãn cực tính trên bóng xem trước (toạ độ màn hình) */
  _pinModel() {
    const game = this.game, it = game.interact, held = it.heldItem, ghost = game.sockets?.ghost;
    if (!held || !ghost?.visible) return [];
    const def = held.def;
    let pins;
    try { pins = def.getPins?.(held) ?? def.pins ?? []; } catch { pins = def.pins || []; }
    const marks = polarityMarks(def, pins);
    if (!marks.length) return [];
    const cam = game.camera, app = game.app, W = app.width || 1280, H = app.height || 720;
    ghost.root.updateMatrixWorld();
    _m.copy(ghost.root.matrixWorld);
    const out = [];
    for (const mk of marks) {
      const p = mk.pin.pos || [0, 0, 0];
      const v = _v.set(p[0], (p[1] || 0) + 2, p[2]).applyMatrix4(_m).project(cam);
      if (v.z > 1) continue;
      out.push({ x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, text: mk.text, cls: mk.cls });
    }
    return out;
  }

  modeCard() {
    if (!this.active) return null;
    const it = this.game.interact, held = it.heldItem, tool = it.tool;
    const compact = this.ux.hints?.mode === 'compact';
    const keys = [
      ['RMB', held ? 'Nhấp: cắm / đặt · kéo: xoay' : 'Nhấp: nhặt · kéo: xoay'],
      ['LMB', held ? 'Cắm / đặt xuống' : tool ? `${toolUseLabel(tool)} (giữ)` : 'Nhặt · bấm · mở'],
      ['MMB', 'Kéo: dời dọc bàn'],
      ['WHEEL', 'Phóng to về con trỏ'],
      ['T', this.viewName === 'top' ? 'Về góc nhìn trước' : 'Nhìn thẳng xuống bo'],
      ['G', 'Góc 45° · F: xem gần'],
    ];
    if (held) keys.push(['R/X', 'Xoay 90° / đảo 180°'], ['Esc', 'Đặt xuống chỗ con trỏ']);
    if (this.ux.microscope?.root) keys.push(['M', 'Kính hiển vi']);
    keys.push(['Tab', 'Góc nhìn thứ nhất'], ['Space', 'Đứng dậy']);
    const VIEW = { iso: 'góc 45°', top: 'nhìn thẳng xuống', front: 'góc thấp', frame: 'xem gần', free: 'tự do' };
    return {
      icon: '🧰', title: `Bàn 3D · ${this.seat?.bench?.label || 'bàn'}`, badge: '3D',
      sub: `${VIEW[this.viewName] || ''} · ${Math.round(this.effDist)} mm`,
      keys: compact ? keys.filter(([k]) => ['RMB', 'LMB', 'T', 'Tab', 'Space'].includes(k)) : keys,
    };
  }
}

