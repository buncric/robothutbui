// =============================================================================
// interact.js — Hệ tương tác (GAME_API §4): tia nhìn từ tâm màn hình, viền sáng, gợi ý phím, nhặt/đặt/thả/soi,
// dùng dụng cụ, cắm vào khe, bộ phận con (subparts.js).
//
//   interact.register(object3D, {
//     name: 'Công tắc nguồn' | () => string,
//     prompts: [{ key:'E'|'F'|'LMB'|'RMB'|'R'|'G', label: string | () => string,
//                 when?(ctx) → bool (ẩn), enabled?(ctx) → bool (hiện mờ), reason?: string | () => string,
//                 do?(ctx)                         // nhấn
//                 hold?: true, onStart?(ctx), onHold?(ctx, dt) → true khi xong, onRelease?(ctx), progress?() → 0..1,
//                 withTool?: bool (LMB vẫn chạy khi đang cầm dụng cụ) }],
//     onScroll?(ctx, delta), onDrag?(ctx, dx, dy),   // núm xoay: cuộn chuột / giữ LMB kéo chuột
//     lessonId?, highlight: true,
//   });
//   interact.unregister(object3D)
//   ctx = { game, key, hit, point, target (Object3D trúng tia), object (vật đã đăng ký gần nhất), item (ItemInstance),
//           subpart, pin, spec, instance (dụng cụ đang cầm), tip (Vector3 đầu dụng cụ) }
//
// Phím chuẩn: E nhặt / đặt (bóng xanh = hợp lệ, đỏ = không) / cắm khe · G thả rơi · giữ RMB soi (kéo chuột xoay)
//             cuộn chuột: đưa vật xa/gần (hoặc chỉnh núm) · R xoay 90° trước khi đặt · F mở bài học (tab mới)
//             LMB: dùng dụng cụ (giữ = onUseHold) hoặc hành động LMB của vật.
// Tầm với: 900 mm tính từ VAI (350 mm dưới mắt) — đứng sát bàn cao 750 mm vẫn với tới mặt bàn.
//
// [UX] Con trỏ tỉ mỉ (engine/ux/precision.js): interact.pointerRay = { camera, ndc:Vector2 } → tia nhìn đi từ camera đó qua
//      điểm ndc (thay cho tâm màn hình) — mọi minigame đọc interact.hit / target.hit tự động dùng con trỏ.
//      interact.pointer = { active, point, hit, normal, ndc, object } cập nhật mỗi khung (point = điểm trúng của tia hiện hành).
//      Gợi ý: mỗi prompt có thêm src:'hand' (dụng cụ / vật đang cầm) để HUD tách nhóm; 'WHEEL' (cuộn) tự sinh cho núm xoay /
//      dụng cụ có onScroll; game.ux.extraPrompts(add, ctx) thêm hành động của chế độ ngồi. game.ux.capture(e) được hỏi trước
//      mọi phím / chuột / cuộn — true = chế độ ngồi / kính hiển vi đã dùng sự kiện đó.
// [UX bàn 3D] (engine/ux/bench.js): camera quỹ đạo rời xa thân người → interact.bodyEye(out) = mắt THÂN NGƯỜI (tầm với tính từ
//      vai thật, không từ camera) · pointerRay.far (mm) = tầm tia dài hơn · interact.placeYaw = hướng đặt vật xuống mặt bàn (rad).
// =============================================================================
import * as THREE from 'three';
import { localBox } from './hands.js';
import { toolKind } from './items.js';
import { PartActions } from './partActions.js';
import { toolUseLabel, toolUseHold, toolScrollLabel, scrollLabelFor } from './ux/keys.js';

export const REACH = 900;            // mm, từ vai
export const SHOULDER_DROP = 350;    // vai thấp hơn mắt
const RAY_FAR = 1700;

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _box = new THREE.Box3(), _box2 = new THREE.Box3();
const KEYMAP = { KeyE: 'E', KeyF: 'F', KeyG: 'G', KeyR: 'R', KeyB: 'B', KeyT: 'T', KeyV: 'V' };

const call = (v, ...a) => (typeof v === 'function' ? v(...a) : v);

export class Interact {
  constructor(game) {
    this.game = game;
    this.objects = new Set();          // gốc đã đăng ký (prop, item, bộ phận con)
    this.ray = new THREE.Raycaster();
    this.ray.far = RAY_FAR;
    this.origin = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.hit = null;
    this.target = null;                // { object, spec, chain, item, subpart, hit, inReach, prompts }
    this.rotSteps = 0;                 // số lần nhấn R
    this.placement = null;             // { kind:'surface'|'socket', valid, state, matrix, … }
    this.inspecting = false;
    this.enabled = true;
    this.uses = new Map();             // nút chuột (0 trái / 2 phải) → { tool, ctx, t } dụng cụ đang dùng
    this.holding = null;               // gợi ý "giữ" đang chạy
    this.dragging = null;
    this.tweens = [];
    this._highlighted = null;
    this._inspectT = 0;
    this._candidates = [];
    this.parts = new PartActions(game);   // thao tác riêng của linh kiện (bẻ chân, gạt công tắc, vặn trimmer…)
    this._targetScroll = null;
    this.pointerRay = null;            // [UX] { camera, ndc } — tia qua con trỏ tỉ mỉ thay cho tâm màn hình
    this.pointer = { active: false, point: null, hit: null, normal: new THREE.Vector3(0, 1, 0), ndc: new THREE.Vector2(), object: null };
    this.bodyEye = null;               // [UX bàn 3D] (out: Vector3) → mắt thân người khi camera không ở mắt
    this.placeYaw = null;              // [UX bàn 3D] hướng đặt vật (rad) thay cho hướng nhìn của người chơi
    const ev = game.events;
    ev.on('input:key', (e) => this._onKey(e));
    ev.on('input:mouse', (e) => this._onMouse(e));
    ev.on('input:wheel', (e) => this._onWheel(e));
    ev.on('game:paused', (e) => { if (e.paused) this._cancelAll(); });
  }

  // ------------------------------------------------------------------ đăng ký
  register(object, spec = {}) {
    if (!object?.isObject3D) throw new Error('interact.register: cần Object3D');
    const prev = object.userData.interactSpec;
    if (prev && prev !== spec) {
      // gộp: giữ cờ item/subpart cũ, nối thêm gợi ý mới
      const merged = { ...prev, ...spec, prompts: [...(spec.prompts || []), ...(prev.prompts || [])] };
      if (prev.item && !spec.item) merged.item = prev.item;
      object.userData.interactSpec = merged;
    } else object.userData.interactSpec = spec;
    this.objects.add(object);
    return object.userData.interactSpec;
  }

  unregister(object) {
    if (!object) return;
    this.objects.delete(object);
    if (object.userData) delete object.userData.interactSpec;
    if (this.target?.object === object) this._setTarget(null);
  }

  /** Item được đăng ký tự động khi sinh ra (gợi ý chuẩn tạo động; def.prompts thêm vào) */
  registerItem(inst) {
    const def = inst.def;
    const prompts = (def.prompts || []).map((p) => ({ ...p, when: p.when ? (ctx) => p.when(inst, this.game, ctx) : undefined }));
    this.register(inst.object, { name: () => itemName(inst), item: inst, prompts, lessonId: def.lessonId, isItemRoot: true });
  }

  // ------------------------------------------------------------------ tiện ích
  get heldItem() {
    const h = this.game.hands?.right;
    const it = h?.heldItem;
    return it && !it.isHotbarTool ? it : null;
  }
  get tool() { return this.game.inventory?.activeTool || null; }

  shoulder(target = new THREE.Vector3()) {
    if (this.bodyEye) return this.bodyEye(target).add(_v3.set(0, -SHOULDER_DROP, 0));
    return this.game.camera.getWorldPosition(target).add(_v3.set(0, -SHOULDER_DROP, 0));
  }
  inReach(point, reach = REACH) { return this.shoulder(_v2).distanceTo(point) <= reach; }

  _ctx(key = null, extra = {}) {
    const t = this.target;
    const tool = this.tool;
    const ctx = {
      game: this.game, key,
      hit: t?.hit || this.hit || null,
      point: (t?.hit || this.hit)?.point || null,
      target: (t?.hit || this.hit)?.object || null,
      object: t?.object || null,
      item: t?.item || null,
      subpart: t?.subpart || null,
      pin: t?.spec?.pin || t?.chain?.find((s) => s.pin)?.pin || null,
      spec: t?.spec || null,
      instance: tool,
      tip: tool && this.game.hands ? this.game.hands[this._sideOf(tool)].tipWorldPosition(new THREE.Vector3()) : null,
      held: this.heldItem,
      ...extra,
    };
    return ctx;
  }

  // ------------------------------------------------------------------ tia nhìn
  _gatherCandidates() {
    const list = this._candidates;
    list.length = 0;
    const cam = this.origin;
    const maxD2 = 4000 * 4000;
    for (const o of this.objects) {
      if (!o.parent || o.userData?.item?.heldBy || o.userData?.item?.inBag) continue;
      // bộ phận con nằm trong item → đã được quét qua item gốc
      if (o.userData.interactSpec?.subpart) continue;
      o.getWorldPosition(_v);
      if (_v.distanceToSquared(cam) > maxD2 && !o.userData.interactSpec?.big) continue;
      list.push(o);
    }
    for (const s of this.game.world?.surfaces || []) if (s?.isObject3D && s.parent) list.push(s);
    for (const s of this.game.world?.raycastTargets || []) if (s?.isObject3D && s.parent) list.push(s);
    return list;
  }

  /** Khoảng cách tia tới hộp va chạm gần nhất (tường, tủ…) — dùng che khuất + rụt tay */
  _colliderHit(maxT, ignorePoint = null) {
    let best = Infinity;
    this._wallDist = Infinity;      // khoảng cách tới mặt ĐỨNG gần nhất (để tay rụt lại; mặt bàn nằm ngang thì không)
    const ray = this.ray.ray;
    for (const b of this.game.world?.colliders || []) {
      if (!b) continue;
      if (b.containsPoint(this.origin)) continue;
      const p = ray.intersectBox(b, _v);
      if (!p) continue;
      const t = p.distanceTo(this.origin);
      const top = Math.abs(p.y - b.max.y) < 1 || Math.abs(p.y - b.min.y) < 1;
      if (!top && t < this._wallDist) this._wallDist = t;
      if (t >= best || t > maxT) continue;
      if (ignorePoint && _box.copy(b).expandByScalar(25).containsPoint(ignorePoint)) continue;  // vật nằm trong tủ/kệ
      best = t;
    }
    return best;
  }

  _raycast() {
    const cam = this.game.camera;
    cam.updateMatrixWorld();
    const pr = this.pointerRay;
    if (pr?.camera) {
      // [UX] tia đi qua con trỏ tỉ mỉ (có thể từ camera kính hiển vi)
      pr.camera.updateMatrixWorld();
      this.ray.setFromCamera(pr.ndc, pr.camera);
      this.origin.copy(this.ray.ray.origin);
      this.dir.copy(this.ray.ray.direction);
    } else {
      cam.getWorldPosition(this.origin);
      cam.getWorldDirection(this.dir);
      this.ray.set(this.origin, this.dir);
    }
    this.ray.far = pr?.far || RAY_FAR;
    const hits = this.ray.intersectObjects(this._gatherCandidates(), true);
    let hit = null;
    const minD = pr?.minDist || 0;      // [UX] camera kính hiển vi nằm trong đầu kính → bỏ mặt sát ống kính
    for (const h of hits) {
      if (h.distance < minD) continue;
      if (!visibleChain(h.object) || h.object.userData?.isHand || h.object.userData?.noInteract) continue;
      const it = itemOf(h.object);
      if (it && (it.heldBy || it === this.heldItem)) continue;
      hit = h; break;
    }
    // che khuất bởi hộp va chạm (không xuyên tường)
    const occ = this._colliderHit(hit ? hit.distance - 4 : this.ray.far, hit?.point);
    if (hit && occ < hit.distance - 4) hit = null;
    this.hit = hit;
    // tay rụt lại khi sát mặt đứng (tường, tủ, vật to) — không tính mặt nằm ngang (nhìn xuống bàn)
    let wall = this._wallDist;
    if (hit && !itemOf(hit.object) && hit.face) {
      const ny = Math.abs(_v.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).y);
      if (ny < 0.6) wall = Math.min(wall, hit.distance);
    }
    this.game.hands?.setObstruction(pr ? null : wall);
    // [UX] con trỏ chung (minigame / HUD đọc)
    const P = this.pointer;
    P.active = !!pr;
    P.hit = hit; P.point = hit?.point || null; P.object = hit?.object || null;
    if (pr) P.ndc.copy(pr.ndc); else P.ndc.set(0, 0);
    if (hit?.face) P.normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld); else P.normal.set(0, 1, 0);
    return hit;
  }

  /** Từ vật trúng tia → chuỗi spec (gần nhất trước), item, bộ phận con */
  _resolve(hit) {
    if (!hit) return null;
    const chain = [];
    let object = null, item = null, subpart = null;
    for (let o = hit.object; o; o = o.parent) {
      const s = o.userData?.interactSpec;
      if (s) { chain.push(s); if (!object) object = o; if (s.subpart && !subpart) subpart = s.subpart; }
      if (!item && o.userData?.item) item = o.userData.item;
    }
    const isSurface = this._isSurface(hit.object);
    if (!chain.length && !item && !isSurface) return null;
    // [UX] spec.reach (mm) — vật to / thấp (ghế, cửa) với tới được từ xa hơn tầm tay chuẩn
    const reach = chain.find((s) => s.reach)?.reach || REACH;
    return { object: object || (item ? item.object : null), spec: chain[0] || null, chain, item, subpart, hit, isSurface, inReach: this.inReach(hit.point, reach) };
  }

  _isSurface(obj) {
    const surfaces = this.game.world?.surfaces || [];
    for (let o = obj; o; o = o.parent) if (surfaces.includes(o) || o.userData?.surface) return true;
    return false;
  }

  // ------------------------------------------------------------------ cập nhật mỗi khung
  update(dt) {
    const game = this.game;
    this._updateTweens(dt);
    if (!this.enabled || game.app.paused) { this._hideUi(); return; }
    if (this.inspecting) {
      this._inspectT += dt;
      game.hud?.setTarget(null);
      game.hud?.setCrosshair('hidden');
      this.game.sockets?.ghost.hide();
      return;
    }
    const hit = this._raycast();
    const t = this._resolve(hit);
    this._setTarget(t);
    this._updatePlacement();
    this._updatePrompts();
  }

  _hideUi() {
    this.game.hud?.setTarget(null);
    this.game.sockets?.ghost.hide();
    this._setHighlight(null);
  }

  _setTarget(t) {
    this.target = t;
    const obj = t && t.inReach && t.object && (t.spec?.highlight !== false) && (t.chain.length > 0) ? t.object : null;
    this._setHighlight(obj);
  }

  _setHighlight(obj) {
    if (obj === this._highlighted) return;
    const app = this.game.app;
    if (this._highlighted && !app.hasOutline?.()) emissiveHighlight(this._highlighted, false);
    this._highlighted = obj;
    if (app.hasOutline?.()) app.setOutline(obj ? [obj] : []);
    else if (obj) emissiveHighlight(obj, true);
  }

  // ------------------------------------------------------------------ đặt / cắm (bóng xem trước)
  _updatePlacement() {
    const held = this.heldItem;
    const ghost = this.game.sockets?.ghost;
    this.placement = null;
    if (!held || !ghost) { ghost?.hide(); return; }
    // 1) khe cắm gần tia nhìn
    const near = this.game.sockets.findNear(held, { origin: this.origin, direction: this.dir }, { maxT: this.ray.far || RAY_FAR, rotSteps: this.rotSteps });
    if (near) {
      const p = near.socket.object3D.getWorldPosition(new THREE.Vector3());
      const reach = this.inReach(p);
      const ok = near.result.ok && reach;
      const matrix = this.game.sockets.targetMatrix(near.socket, held, near.result, new THREE.Matrix4());
      const state = !ok ? 'bad' : near.aligned ? 'ok' : 'warn';
      this.placement = { kind: 'socket', valid: ok, state, matrix, socket: near.socket, result: near.result, aligned: near.aligned, reach };
      ghost.show(held, matrix, state);
      return;
    }
    // 2) mặt phẳng (bàn, kệ, nóc vật khác)
    const hit = this.hit;
    if (!hit || !hit.face) { ghost.hide(); return; }
    const n = _v.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
    const surfaceLike = this._isSurface(hit.object) || !!itemOf(hit.object);
    if (!surfaceLike) { ghost.hide(); return; }
    const yaw = (this.placeYaw ?? this.game.player.yaw) + this.rotSteps * (Math.PI / 2);
    const pos = _v2.copy(hit.point).addScaledVector(n, 0.3);
    const quat = _q.setFromAxisAngle(_v3.set(0, 1, 0), yaw);
    const matrix = new THREE.Matrix4().compose(pos, quat, held.object.scale);
    let valid = true, reason = '';
    if (n.y < 0.75) { valid = false; reason = 'Mặt quá nghiêng'; }
    else if (!this.inReach(hit.point)) { valid = false; reason = 'Quá xa — bước lại gần'; }
    else {
      const support = itemOf(hit.object);
      _box.copy(held.localBox || localBox(held.object)).applyMatrix4(matrix).expandByScalar(-0.8);
      for (const it of this.game.items?.all || []) {
        if (it === held || it === support || it.heldBy || it.inBag || !it.object.parent || it.isHotbarTool) continue;
        if (support && isDescendantItem(it, support)) continue;
        _box2.setFromObject(it.object);
        if (_box.intersectsBox(_box2)) { valid = false; reason = `Vướng ${itemName(it)}`; break; }
      }
      if (valid) for (const b of this.game.world?.colliders || []) {
        if (b.max.y <= hit.point.y + 2) continue;
        if (_box.intersectsBox(b) && !b.containsPoint(hit.point)) { valid = false; reason = 'Vướng vật cản'; break; }
      }
    }
    this.placement = { kind: 'surface', valid, state: valid ? 'ok' : 'bad', matrix, reason, support: itemOf(hit.object) || hit.object, point: hit.point.clone() };
    ghost.show(held, matrix, this.placement.state);
  }

  // ------------------------------------------------------------------ gợi ý phím
  _collectPrompts() {
    const t = this.target, held = this.heldItem, tool = this.tool;
    const out = [];
    const taken = new Set();
    const add = (p) => { if (!taken.has(p.key)) { taken.add(p.key); out.push(p); } };
    const ctx = this._ctx();
    // khi đang cầm vật
    if (held) {
      const pl = this.placement;
      if (pl?.kind === 'socket') {
        const name = pl.socket.name || `khe ${pl.socket.kind}`;
        if (pl.valid) add({ key: 'E', label: `Cắm vào ${name}${pl.result.orientation === 'reversed' ? ' (NGƯỢC chiều!)' : ''}${pl.aligned ? '' : ' — lệch, sẽ cong chân!'}`, warn: !pl.aligned || pl.result.orientation === 'reversed', do: () => this.insertHeld() });
        else add({ key: 'E', label: `Cắm vào ${name}`, disabled: true, reason: pl.result.reason || (pl.reach ? '' : 'quá xa') });
      }
    }
    // thao tác của linh kiện đang cầm (B bẻ chân, T nắn chân, V đổi màu dây…)
    if (held) for (const p of this.parts.heldPrompts(held)) add({ key: p.key, label: p.label, hold: !!p.hold, p, src: 'hand' });
    // gợi ý của vật đang nhìn (gần nhất trước)
    if (t?.inReach) {
      for (const spec of t.chain) {
        for (const p of spec.prompts || []) {
          if (taken.has(p.key)) continue;
          if (held && p.key === 'E' && spec.isItemRoot) continue;
          if (tool && p.key === 'LMB' && !p.withTool && !p.drag) continue;
          try { if (p.when && !p.when(ctx)) continue; } catch { continue; }
          let enabled = true;
          try { if (p.enabled) enabled = !!p.enabled(ctx); } catch { enabled = false; }
          add({ key: p.key, label: call(p.label, ctx), hold: !!p.hold, disabled: !enabled, reason: enabled ? '' : call(p.reason, ctx), progress: p.progress, spec, p });
        }
      }
      // [UX] núm xoay: hiện "Cuộn  <việc>" cho vật có onScroll
      const ss = t.chain.find((sp) => sp.onScroll);
      if (ss && !taken.has('WHEEL')) add({ key: 'WHEEL', label: scrollLabelFor(ss, call(ss.name, ctx) || ''), display: true, spec: ss });
    }
    // thao tác của linh kiện đang nhìn (gạt công tắc, nhấn nút, vặn trimmer, siết cầu đấu)
    this._targetScroll = null;
    if (t?.inReach && t.item && !held && !t.subpart) {
      const ts = this.parts.targetSpec(t.item, t.hit);
      for (const p of ts.prompts) {
        if (tool && p.key === 'LMB') continue;
        add({ key: p.key, label: p.label, hold: !!p.hold, disabled: !!p.disabled, reason: p.reason || '', p });
      }
      this._targetScroll = ts.onScroll;
    }
    if (held) {
      if (this.placement?.kind === 'surface') {
        if (this.placement.valid) add({ key: 'E', label: 'Đặt xuống', do: () => this.placeHeld() });
        else add({ key: 'E', label: 'Đặt xuống', disabled: true, reason: this.placement.reason });
      }
      add({ key: 'G', label: 'Thả', do: () => this.dropHeld(), src: 'hand' });
      add({ key: 'R', label: 'Xoay 90°', do: () => this.rotate(), src: 'hand' });
      add({ key: 'RMB', label: 'Soi', hold: true, src: 'hand' });
      if (held.def.lessonId) add({ key: 'F', label: 'Xem bài học', do: () => this.openLesson(held.def.lessonId), src: 'hand' });
      try { this.game.ux?.extraPrompts?.(add, ctx, taken); } catch (err) { console.error('[interact] ux prompts', err); }
      return out;
    }
    if (t?.inReach && t.item && this.game.items?.pickable(t.item) && !t.item.isHotbarTool) {
      add({ key: 'E', label: `${t.item.def.kind === 'tool' ? 'Lấy' : 'Nhặt'} ${itemName(t.item)}`, do: () => this.pick(t.item) });
      if (!this.game.inventory?.secondaryTool) add({ key: 'RMB', label: 'Soi', hold: true });   // cầm 2 dụng cụ: RMB = dụng cụ tay trái
      if (!t.item.socket) add({ key: 'R', label: 'Xoay', do: () => this.rotateInPlace(t.item) });
    }
    if (t?.inReach) {
      const lesson = t.chain.find((s) => s.lessonId)?.lessonId || t.item?.def?.lessonId;
      if (lesson) add({ key: 'F', label: 'Xem bài học', do: () => this.openLesson(lesson) });
    }
    // [UX] hành động của dụng cụ đang cầm — động từ cụ thể ("Giữ LMB Hàn · Chuột phải Mớm thiếc · Cuộn … · Q Cất")
    if (tool) add({ key: 'LMB', label: toolUseLabel(tool), hold: toolUseHold(tool), src: 'hand' });
    const sec = this.game.inventory?.secondaryTool;
    if (sec) add({ key: 'RMB', label: `${toolUseLabel(sec)} (tay trái)`, hold: toolUseHold(sec), src: 'hand' });
    if (tool && !taken.has('WHEEL') && !this._targetScroll) { const sl = toolScrollLabel(tool); if (sl) add({ key: 'WHEEL', label: sl, display: true, src: 'hand' }); }
    try { this.game.ux?.extraPrompts?.(add, ctx, taken); } catch (err) { console.error('[interact] ux prompts', err); }
    if (tool || sec) add({ key: 'Q', label: 'Cất dụng cụ', display: true, src: 'hand' });
    return out;
  }

  _updatePrompts() {
    const hud = this.game.hud;
    if (!hud) return;
    const t = this.target;
    this._prompts = this._collectPrompts();
    const name = t ? (call(t.spec?.name, this._ctx()) || (t.item ? itemName(t.item) : '')) : '';
    const sub = t?.subpart && t.item ? itemName(t.item) : (t?.item && t.spec && !t.spec.isItemRoot && !t.spec.subpart ? itemName(t.item) : '');
    if (t && !t.inReach && (t.chain.length || t.item)) {
      hud.setTarget({ name, sub: 'Quá xa — bước lại gần', prompts: this._prompts.filter((p) => p.src === 'hand' || p.src === 'mode'), far: true });
      hud.setCrosshair('far');
      return;
    }
    const prompts = this._prompts.filter((p) => !(t == null && !this.heldItem && p.key === 'F'));
    if (!name && !prompts.length) { hud.setTarget(null); hud.setCrosshair('idle'); return; }
    let progress = null;
    if (this.holding?.p?.progress) { try { progress = this.holding.p.progress(); } catch { progress = null; } }
    hud.setTarget({ name: this.heldItem && !t?.chain.length ? '' : name, sub, prompts, progress });
    hud.setCrosshair(t && (t.chain.length || t.item) ? 'target' : 'idle');
  }

  _findPrompt(key) {
    if (!this._prompts) this._prompts = this._collectPrompts();
    return this._prompts.find((p) => p.key === key) || null;
  }

  // ------------------------------------------------------------------ đầu vào
  _active() { return this.enabled && !this.game.app.paused && !this.game.app.uiMode; }

  _onKey(e) {
    if (!e.down || e.repeat || !this._active()) return;
    if (this.game.ux?.capture?.(e)) return;     // [UX] chế độ ngồi / kính hiển vi đã dùng phím này
    const k = KEYMAP[e.code];
    if (!k) return;
    if (this.inspecting) return;
    this._prompts = this._collectPrompts();
    const p = this._findPrompt(k);
    if (!p) {
      if (k === 'E' && this.target && !this.target.inReach) this.game.hud?.toast?.('Quá xa — bước lại gần', { kind: 'info', short: true });
      return;
    }
    if (p.disabled) { this.game.audio?.play('error'); if (p.reason) this.game.hud?.toast?.(p.reason, { kind: 'warn', short: true }); return; }
    if (p.display) return;
    this._runPrompt(p, k);
  }

  _runPrompt(p, key) {
    const ctx = this._ctx(key);
    try {
      if (p.do) p.do(ctx);
      else if (p.p?.do) {
        p.p.do(ctx);
        // cử chỉ tay mặc định cho hành động của vật (công tắc, ngăn kéo…)
        if (!p.spec?.subpart && !this.heldItem && this.game.hands && this.target?.hit) {
          const h = this.game.hands;
          if (!this.tool && !h.right.held && h.right.poseName !== 'reach') {
            h.setPose('right', 'press'); h.setReach('right', this.target.hit.point.clone()); h.playGesture('tap');
            setTimeout(() => { if (h.right.poseName === 'press') { h.setPose('right', 'idle'); h.setReach('right', null); } }, 300);
          }
        }
      }
    } catch (err) { console.error('[interact] lỗi hành động', err); }
  }

  _onMouse(e) {
    if (!this._active() && e.down) return;
    if (e.down && this.game.ux?.capture?.(e)) return;   // [UX] chuột giữa: bật/tắt tỉ mỉ
    if (e.button === 2) {
      // cầm 2 dụng cụ (vd mỏ hàn + thiếc) → chuột phải dùng dụng cụ tay trái; không thì soi vật
      const sec = this.game.inventory?.secondaryTool;
      if (e.down && sec && !this.heldItem) { this._startUse(2); return; }
      if (!e.down && this.uses.has(2)) { this._endUse(2); return; }
      if (e.down) this.startInspect(); else this.stopInspect();
      return;
    }
    if (e.button !== 0) return;
    if (e.down) {
      this._prompts = this._collectPrompts();
      const p = this._findPrompt('LMB');
      const spec = this.target?.inReach ? this.target.chain.find((s) => s.onDrag) : null;
      // núm xoay: giữ LMB + kéo chuột
      if (spec && (!this.tool || p?.p?.drag || p?.drag)) {
        const ctx = this._ctx('LMB');
        this.dragging = { spec, ctx };
        this.game.player.lookOverride = (dx, dy) => { try { spec.onDrag(ctx, dx, dy); } catch (err) { console.error(err); } };
        this.game.hands?.setPose('right', 'pinch');
        if (this.target?.hit) this.game.hands?.setReach('right', this.target.hit.point.clone());
        return;
      }
      if (p && !p.disabled && p.p) {
        if (p.hold) {
          const ctx = this._ctx('LMB');
          this.holding = { p: p.p, ctx, t: 0 };
          try { p.p.onStart?.(ctx); } catch (err) { console.error(err); }
        } else if (!this.tool || p.p.withTool) this._runPrompt(p, 'LMB');
      } else if (p?.disabled && p.reason) {
        this.game.hud?.toast?.(p.reason, { kind: 'warn', short: true });
        this.game.audio?.play('error');
      }
      if (this.tool) this._startUse(0);
    } else {
      if (this.dragging) {
        this.dragging = null;
        this.game.player.lookOverride = this.inspecting ? this.game.player.lookOverride : null;
        this.game.hands?.setReach('right', null);
        this.game.hands?.setPose('right', this.heldItem ? (this.heldItem.def.grip?.pose || 'grip') : (this.tool ? (this.tool.def.grip?.pose || 'holdTool:default') : 'idle'));
      }
      if (this.holding) { const h = this.holding; this.holding = null; try { h.p.onRelease?.(h.ctx); } catch (err) { console.error(err); } }
      if (this.uses.has(0)) this._endUse(0);
    }
  }

  _onWheel(e) {
    if (!this._active()) return;
    if (this.game.ux?.capture?.(e)) return;     // [UX] tỉ mỉ: cuộn = độ cao mũi · kính hiển vi: cuộn = độ phóng đại
    if (this.inspecting) {
      // cuộn khi soi: đưa vật xa/gần mắt
      const ins = this.game.hands.inspect;
      ins.dist = THREE.MathUtils.clamp(ins.dist + e.delta * 25, 180, 700);
      ins.holder.position.z = -ins.dist;
      return;
    }
    const spec = this.target?.inReach ? this.target.chain.find((s) => s.onScroll) : null;
    if (spec) { try { spec.onScroll(this._ctx('WHEEL'), e.delta); } catch (err) { console.error(err); } return; }
    if (this.heldItem) {
      if (this.parts.heldScroll(this.heldItem, e.delta)) return;      // chỉnh bước bẻ chân / số chân header / độ dài dây
      const h = this.game.hands.right;
      h.holdDistance = THREE.MathUtils.clamp(h.holdDistance - e.delta * 30, -60, 160);
      return;
    }
    if (this._targetScroll) { try { this._targetScroll(this._ctx('WHEEL'), e.delta); } catch (err) { console.error(err); } return; }
    const tool = this.tool;
    if (tool?.def.tool?.onScroll) { try { tool.def.tool.onScroll(this._ctx('WHEEL'), e.delta); } catch (err) { console.error(err); } return; }
    this.game.inventory?.cycle(e.delta);
  }

  _cancelAll() {
    for (const b of [...this.uses.keys()]) this._endUse(b);
    if (this.holding) { const h = this.holding; this.holding = null; try { h.p.onRelease?.(h.ctx); } catch { /* */ } }
    if (this.dragging) { this.dragging = null; this.game.player.lookOverride = null; }
    if (this.inspecting) this.stopInspect();
  }

  // ------------------------------------------------------------------ dụng cụ
  get using() { return this.uses.get(0) || null; }

  _toolFor(button) { return button === 2 ? this.game.inventory?.secondaryTool || null : this.tool; }
  _sideOf(tool) { return tool?.heldBy === 'left' ? 'left' : 'right'; }

  _startUse(button = 0) {
    const tool = this._toolFor(button);
    if (!tool?.def.tool || this.uses.has(button)) return;
    const key = button === 2 ? 'RMB' : 'LMB';
    const ctx = this._ctx(key, { instance: tool, tip: this.game.hands?.[this._sideOf(tool)].tipWorldPosition(new THREE.Vector3()) || null });
    this.uses.set(button, { tool, ctx, t: 0, key });
    try { tool.def.tool.onUseStart?.(ctx); } catch (err) { console.error(`[interact] ${tool.def.id}.onUseStart`, err); }
    this.game.events.emit('tool:use', { tool, phase: 'start', target: ctx.target, item: ctx.item, point: ctx.point, hand: this._sideOf(tool) });
  }

  _endUse(button = 0) {
    const u = this.uses.get(button);
    this.uses.delete(button);
    if (!u) return;
    this.game.hands?.setReach(this._sideOf(u.tool), null);
    const ctx = this._ctx(u.key, { instance: u.tool, tip: this.game.hands?.[this._sideOf(u.tool)].tipWorldPosition(new THREE.Vector3()) || null });
    try { u.tool.def.tool?.onUseEnd?.(ctx); } catch (err) { console.error(`[interact] ${u.tool.def.id}.onUseEnd`, err); }
    this.game.events.emit('tool:use', { tool: u.tool, phase: 'end', duration: u.t, hand: this._sideOf(u.tool) });
  }

  /** Dừng dùng một dụng cụ (khi cất nó đi) */
  endUseOf(inst) { for (const [b, u] of [...this.uses]) if (u.tool === inst) this._endUse(b); }

  /** Logic 60 Hz: giữ chuột dùng dụng cụ / hành động "giữ" */
  fixedUpdate(dt) {
    for (const [button, u] of [...this.uses]) {
      if (u.tool !== this._toolFor(button)) { this._endUse(button); continue; }
      u.t += dt;
      const side = this._sideOf(u.tool);
      const ctx = this._ctx(u.key, { instance: u.tool, tip: this.game.hands?.[side].tipWorldPosition(new THREE.Vector3()) || null });
      u.ctx = ctx;
      // đầu dụng cụ vươn tới điểm đang nhắm (nếu trong tầm)
      if (ctx.point && this.target?.inReach) this.game.hands?.setReach(side, ctx.point);
      else this.game.hands?.setReach(side, null);
      try { u.tool.def.tool?.onUseHold?.(ctx, dt); } catch (err) { console.error(`[interact] ${u.tool.def.id}.onUseHold`, err); }
    }
    if (this.holding) {
      const h = this.holding;
      h.t += dt;
      h.ctx = this._ctx('LMB');
      let done = false;
      try { done = !!h.p.onHold?.(h.ctx, dt); } catch (err) { console.error(err); done = true; }
      if (done) { this.holding = null; try { h.p.onRelease?.(h.ctx); } catch { /* */ } }
    }
  }

  // ------------------------------------------------------------------ nhặt / đặt / thả
  /** Nhặt item lên tay phải (dụng cụ → vào thanh dụng cụ) */
  pick(item) {
    const game = this.game;
    if (!item || item.heldBy || item._picking) return false;
    if (this.heldItem) { game.hud?.toast?.('Tay đang bận — đặt (E), thả (G) hoặc cất vào túi (Tab) trước', { kind: 'warn', short: true }); return false; }
    if (item.socket) game.sockets?.release(item);
    if (item.def.kind === 'tool' && game.inventory?.adoptTool) { game.inventory.adoptTool(item); return true; }
    const doPick = () => {
      item._picking = false;
      if (item.heldBy || this.heldItem) return;
      if (game.inventory?.activeTool) game.inventory.holster(true);
      item.phys.falling = false; item.phys.settleTo = null;
      const pose = item.def.grip?.pose || defaultGripPose(item);
      game.hands.attach('right', item.object, { ...(item.def.grip || {}), pose, item });
      item.heldBy = 'right';
      this.rotSteps = 0;
      game.hands.right.holdDistance = 0;
      game.audio?.play('pickup', { pos: item.object });
      game.events.emit('item:picked', { item });
    };
    // với tay tới vật trước khi nắm
    const h = game.hands;
    if (h && !game.app.headless) {
      item._picking = true;
      h.setPose('right', 'reach', { target: item.object.getWorldPosition(new THREE.Vector3()) });
      this.tweens.push({ t: 0, dur: 0.12, onDone: doPick });
    } else doPick();
    return true;
  }

  placeHeld() {
    const held = this.heldItem, pl = this.placement;
    if (!held || !pl || pl.kind !== 'surface' || !pl.valid) return false;
    const game = this.game;
    game.hands.detach('right');
    held.heldBy = null;
    const obj = held.object;
    game.items.root.attach(obj);
    const target = pl.matrix.clone();
    if (game.hands) { game.hands.playGesture('push', 'right', 0.3); }
    this.tweens.push({
      obj, from: obj.matrixWorld.clone(), to: target, t: 0, dur: 0.2,
      onDone: () => {
        game.audio?.play('place', { pos: obj });
        game.events.emit('item:placed', { item: held, surface: pl.support, socket: null, point: pl.point });
      },
    });
    this.rotSteps = 0;
    return true;
  }

  insertHeld() {
    const held = this.heldItem, pl = this.placement;
    if (!held || pl?.kind !== 'socket' || !pl.valid) return false;
    const ok = this.game.sockets.insert(held, pl.socket, { result: pl.result, aligned: pl.aligned });
    if (ok) { held.heldBy = null; this.rotSteps = 0; }
    return ok;
  }

  dropHeld() {
    const held = this.heldItem;
    if (!held) return false;
    const game = this.game;
    game.hands.detach('right');
    held.heldBy = null;
    const fwd = game.camera.getWorldDirection(new THREE.Vector3());
    const vel = fwd.multiplyScalar(700).add(game.player.vel || _v.set(0, 0, 0));
    vel.y += 250;
    game.items.drop(held, vel, new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 6));
    game.audio?.play('whoosh', { vol: 0.25 });
    game.events.emit('item:dropped', { item: held });
    this.rotSteps = 0;
    return true;
  }

  /** Xoay vật đang cầm thêm `steps` × 90° (1 = R, 3 = Shift+R ngược, 2 = đảo 180°) */
  rotate(steps = 1) {
    this.rotSteps = (((this.rotSteps + steps) % 4) + 4) % 4;
    this.game.hands?.playGesture('twist', 'right', 0.35);
    this.game.audio?.play('tick');
    this.game.events.emit('item:rotated', { item: this.heldItem, steps: this.rotSteps });
  }

  rotateInPlace(item) {
    const obj = item.object;
    const from = obj.matrixWorld.clone();
    obj.updateWorldMatrix(true, false);
    const to = new THREE.Matrix4().makeRotationY(Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(0, 0, 0));
    // xoay quanh trục đứng qua gốc vật
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    from.decompose(pos, q, s);
    q.premultiply(_q.setFromAxisAngle(_v.set(0, 1, 0), Math.PI / 2));
    to.compose(pos, q, s);
    this.tweens.push({ obj, from, to, t: 0, dur: 0.18 });
    this.game.hands?.playGesture('twist', 'right', 0.3);
    this.game.audio?.play('tick');
  }

  // ------------------------------------------------------------------ soi
  startInspect() {
    if (this.inspecting) return;
    const game = this.game;
    let held = this.heldItem;
    if (!held) {
      // soi thẳng vật đang nhìn: nhặt lên rồi soi
      const t = this.target;
      if (t?.inReach && t.item && game.items.pickable(t.item) && t.item.def.kind !== 'tool' && !this.tool) {
        if (t.item.socket) game.sockets.release(t.item);
        const pose = t.item.def.grip?.pose || defaultGripPose(t.item);
        game.hands.attach('right', t.item.object, { ...(t.item.def.grip || {}), pose, item: t.item });
        t.item.heldBy = 'right';
        game.events.emit('item:picked', { item: t.item });
        held = t.item;
      }
    }
    if (!held) return;
    const size = Math.max(held.size?.x || 50, held.size?.y || 50, held.size?.z || 50);
    if (!game.hands.inspect.start(held.object, size)) return;
    this.inspecting = true;
    this._inspectT = 0;
    this._inspectItem = held;
    game.player.lookOverride = (dx, dy) => game.hands.inspect.rotate(dx, dy);
    game.player.fovOffset = -6;
    game.sockets?.ghost.hide();
    game.hud?.setInspect?.(itemName(held), held.def.desc || held.def.summary || '');
    game.audio?.play('whoosh', { vol: 0.2 });
  }

  stopInspect() {
    if (!this.inspecting) return;
    const game = this.game;
    this.inspecting = false;
    game.hands.inspect.stop();
    game.player.lookOverride = null;
    game.player.fovOffset = 0;
    game.hud?.setInspect?.(null);
    if (this._inspectT >= 0.4) game.events.emit('item:inspected', { item: this._inspectItem, duration: this._inspectT });
    this._inspectItem = null;
  }

  openLesson(id) {
    const url = `./index.html#/c/${encodeURIComponent(id)}`;
    this.game.events.emit('lesson:open', { id, url });
    if (typeof window === 'undefined') return url;
    try { window.open(new URL(url, window.location.href).href, '_blank', 'noopener'); } catch (e) { console.warn(e); }
    return url;
  }

  // ------------------------------------------------------------------ hoạt cảnh nhỏ
  _updateTweens(dt) {
    if (!this.tweens.length) return;
    const done = [];
    for (const tw of this.tweens) {
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      if (tw.obj) {
        const e = k * k * (3 - 2 * k);
        lerpWorld(tw.obj, tw.from, tw.to, e);
      }
      if (k >= 1) done.push(tw);
    }
    for (const tw of done) { this.tweens.splice(this.tweens.indexOf(tw), 1); try { tw.onDone?.(); } catch (e) { console.error(e); } }
  }
}

// ---------------------------------------------------------------------------- tiện ích
function visibleChain(o) { for (; o; o = o.parent) if (!o.visible) return false; return true; }
function itemOf(obj) { for (let o = obj; o; o = o.parent) if (o.userData?.item) return o.userData.item; return null; }
function isDescendantItem(it, ancestorItem) { for (let o = it.object.parent; o; o = o.parent) if (o === ancestorItem.object) return true; return false; }
export function itemName(inst) { return inst?.def?.name || inst?.def?.id || 'Vật thể'; }

export function defaultGripPose(item) {
  const s = item.size || new THREE.Vector3(50, 50, 50);
  const maxDim = Math.max(s.x, s.y, s.z);
  if (item.def.kind === 'tool') return `holdTool:${toolKind(item.def) || 'default'}`;
  return maxDim < 75 && (item.def.massG ?? 20) < 80 ? 'pinch' : 'grip';
}

const _pa = new THREE.Vector3(), _pb = new THREE.Vector3(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _sa = new THREE.Vector3(), _sb = new THREE.Vector3();
function lerpWorld(obj, a, b, k) {
  a.decompose(_pa, _qa, _sa); b.decompose(_pb, _qb, _sb);
  _pa.lerp(_pb, k); _qa.slerp(_qb, k); _sa.lerp(_sb, k);
  _m.compose(_pa, _qa, _sa);
  if (obj.parent) { obj.parent.updateWorldMatrix(true, false); _m.premultiply(new THREE.Matrix4().copy(obj.parent.matrixWorld).invert()); }
  _m.decompose(obj.position, obj.quaternion, obj.scale);
}

/** Tô sáng dự phòng khi không có OutlinePass: clone vật liệu + emissive xanh nhạt */
function emissiveHighlight(obj, on) {
  obj.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    if (on) {
      if (o.userData._hlOrig) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (!mats.every((m) => 'emissive' in m)) return;
      o.userData._hlOrig = o.material;
      const cl = mats.map((m) => { const c = m.clone(); c.emissive = c.emissive.clone().add(new THREE.Color(0x0d2a40)); c.emissiveIntensity = Math.max(1, c.emissiveIntensity || 0); return c; });
      o.material = Array.isArray(o.material) ? cl : cl[0];
    } else if (o.userData._hlOrig) {
      const cur = Array.isArray(o.material) ? o.material : [o.material];
      cur.forEach((m) => m.dispose());
      o.material = o.userData._hlOrig;
      delete o.userData._hlOrig;
    }
  });
}
