// =============================================================================
// ux/precision.js — CHẾ ĐỘ THAO TÁC TỈ MỈ (khi ngồi ở bàn): chuột không xoay đầu nữa mà rê một CON TRỎ 3D trên mặt bàn
// (chuột vẫn bị khoá). Tia tương tác đi qua con trỏ (interact.pointerRay) → mọi minigame (hàn, đi dây, đo) tự nhắm theo con trỏ.
//
//   Chuột: rê con trỏ (Shift = chậm ×0.3) · đẩy con trỏ quá mép màn hình → đầu quay theo (trong nón nhìn khi ngồi)
//   Cuộn: nâng / hạ mũi dụng cụ (mm, lưu trong cài đặt 'precisionHeight') — trừ khi đang nhìn núm xoay (núm được ưu tiên)
//   Mũi dụng cụ (tay phải, hoặc tay trái nếu chỉ cầm dụng cụ tay trái) bay theo con trỏ ở độ cao đã chọn, có run tay rất nhẹ
//   (~0.05 mm — chỉ thấy dưới kính hiển vi). Khi giữ chuột trái/phải (dùng dụng cụ) interact kéo mũi xuống đúng điểm.
//
//   API: precision.active · enable(camera?) · disable() · toggle() · setCamera(cam) · aimAt(worldPoint) · move(dxPx, dyPx)
//        precision.ndc (Vector2) · precision.height (mm) · precision.hover (Vector3 điểm mũi dụng cụ)
//   game.interact.pointer = { active, point, hit, normal, ndc } (interact.js) là con trỏ chung cho minigame.
//   [UX bàn 3D] enable(cam, { absolute:true }) — con trỏ CHUỘT THẬT (ux/bench.js ghi thẳng ndc từ toạ độ chuột, không khoá chuột,
//        không quay đầu ở mép màn hình) · precision.far (mm) = tầm tia dài hơn cho camera quỹ đạo.
// =============================================================================
import * as THREE from 'three';

const _v = new THREE.Vector3();

export class Precision {
  constructor(game, ux) {
    this.game = game;
    this.ux = ux;
    this.active = false;
    this.ndc = new THREE.Vector2(0, 0);
    this.camera = null;
    this.hover = new THREE.Vector3();
    this.hasHover = false;
    this.fine = false;
    this._t = 0;
    this._marker = null;
    this.absolute = false;      // [UX bàn 3D] ndc do chuột thật đặt (ux/bench.js)
    this.far = null;            // [UX bàn 3D] tầm tia (mm)
  }

  get height() { return this.game.quality?.settings?.precisionHeight ?? 6; }
  set height(v) { this.game.quality?.set?.('precisionHeight', Math.round(THREE.MathUtils.clamp(v, 0, 60) * 2) / 2); }

  _ensureMarker() {
    if (this._marker) return this._marker;
    const g = new THREE.Group();
    g.name = 'ux-precision-cursor';
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffcf5c, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.6, 32), ringMat);
    ring.renderOrder = 999;
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.35, 16), ringMat);
    dot.renderOrder = 999;
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xffcf5c, transparent: true, opacity: 0.55, depthTest: false }));
    line.renderOrder = 999;
    const disc = new THREE.Group(); disc.add(ring, dot);
    g.add(disc, line);
    g.userData.disc = disc; g.userData.line = line;
    g.traverse((o) => { o.raycast = () => {}; o.userData.noInteract = true; o.castShadow = false; });
    g.visible = false;
    this.game.scene.add(g);
    this._marker = g;
    return g;
  }

  // ------------------------------------------------------------------ bật / tắt
  enable(camera = null, { absolute = false } = {}) {
    const game = this.game;
    this.camera = camera || game.camera;
    if (!this.active) {
      this.active = true;
      this.absolute = absolute;
      // bắt đầu tại điểm đang nhìn (tâm màn hình)
      this.ndc.set(0, -0.05);
      if (!absolute) game.player.lookBase = (dx, dy) => this.move(dx, dy);
      if (game.hands) { game.hands.reachLimit = 560; game.hands.toolTilt = 0.42; game.hands.toolYaw = 0.6; }
      if (!absolute) this.ux.hints?.showTipOnce('precision');
      game.audio?.play?.('tick');
      game.events?.emit('precision:on', { absolute });
    }
    game.interact.pointerRay = this._ray();
    this._ensureMarker();
    return true;
  }

  setCamera(cam) {
    this.camera = cam || this.game.camera;
    if (this.active) this.game.interact.pointerRay = this._ray();
  }
  _ray() { return { camera: this.camera, ndc: this.ndc, minDist: this.camera === this.game.camera ? 0 : 20, far: this.far || undefined }; }

  disable() {
    if (!this.active) return;
    const game = this.game;
    this.active = false;
    this.absolute = false;
    this.far = null;
    game.interact.pointerRay = null;
    if (game.player.lookBase) game.player.lookBase = null;
    if (game.hands) { game.hands.reachLimit = 300; game.hands.toolTilt = 0; game.hands.toolYaw = 0; if (!game.interact?.uses?.size) { game.hands.setReach('right', null); game.hands.setReach('left', null); } }
    if (this._marker) this._marker.visible = false;
    this.hasHover = false;
    game.audio?.play?.('tick');
    game.events?.emit('precision:off', {});
  }

  toggle() { if (this.active) this.disable(); else this.enable(this.ux.microscope?.active ? this.ux.microscope.cam : null); }

  /** Rê con trỏ theo pixel chuột */
  move(dx, dy) {
    const app = this.game.app;
    const keys = app.input?.keys;
    this.fine = !!(keys && (keys.has('ShiftLeft') || keys.has('ShiftRight')));
    const s = this.game.quality?.settings || {};
    const gain = (s.precisionSens ?? 1) * (this.fine ? 0.3 : 1) * 0.9;
    const W = app.width || 1280, H = app.height || 720;
    const nx = this.ndc.x + (dx * 2 / W) * gain, ny = this.ndc.y - (dy * 2 / H) * gain;
    const mic = this.ux.microscope;
    const LIM = 0.9;
    // đẩy con trỏ quá mép màn hình → quay đầu theo (trong nón nhìn khi ngồi); kính hiển vi thì không
    if (!mic?.active) {
      const cam = this.camera || this.game.camera;
      const vf = THREE.MathUtils.degToRad(cam.fov || 60) / 2, hf = Math.atan(Math.tan(vf) * (W / H));
      if (Math.abs(nx) > LIM) this.game.player.yaw -= Math.sign(nx) * (Math.abs(nx) - LIM) * hf;
      if (Math.abs(ny) > LIM) this.game.player.pitch += Math.sign(ny) * (Math.abs(ny) - LIM) * vf;
    }
    this.ndc.x = THREE.MathUtils.clamp(nx, -LIM, LIM);
    this.ndc.y = THREE.MathUtils.clamp(ny, -LIM, LIM);
    // giới hạn trong vòng thị kính khi soi kính hiển vi
    if (mic?.active) {
      const asp = W / H;
      const rx = this.ndc.x * asp, ry = this.ndc.y;
      const r = Math.hypot(rx, ry), R = 0.9;
      if (r > R) { this.ndc.x = (rx * R / r) / asp; this.ndc.y = ry * R / r; }
    }
  }

  /** Đặt con trỏ đúng lên một điểm thế giới (test / trợ ngắm) */
  aimAt(p) {
    const cam = this.camera || this.game.camera;
    cam.updateMatrixWorld();
    const v = _v.copy(p).project(cam);
    this.ndc.set(v.x, v.y);
    return this.ndc;
  }

  /** Mũi dụng cụ thuộc tay nào */
  _side() {
    const inv = this.game.inventory;
    if (inv?.rightTool || this.game.interact?.heldItem) return 'right';
    if (inv?.leftTool) return 'left';
    return 'right';
  }

  onWheel(e) {
    if (!this.active) return false;
    const it = this.game.interact;
    // đang nhìn núm xoay / linh kiện có cuộn riêng / cầm vật có cuộn riêng → để interact xử lý
    if (it.target?.inReach && (it.target.chain.some((s) => s.onScroll) || it._targetScroll)) return false;
    if (it.heldItem && it.parts?.heldPrompts?.(it.heldItem)?.some((p) => /cuộn/.test(p.label || ''))) return false;
    const keys = this.game.app.input?.keys;
    const fine = e.fine ?? (keys && (keys.has('ShiftLeft') || keys.has('ShiftRight')));
    this.height = this.height - e.delta * (fine ? 0.5 : 2);
    this.game.audio?.play?.('tick', { vol: 0.25 });
    return true;
  }

  // ------------------------------------------------------------------ mỗi khung
  update(dt) {
    if (!this.active) return;
    this._t += dt;
    const game = this.game;
    const it = game.interact;
    const P = it.pointer;
    const mk = this._ensureMarker();
    if (!P.point || !it.target?.inReach) {
      mk.visible = !!P.point;
      this.hasHover = false;
      if (P.point) this._placeMarker(P.point, P.normal, 0, false);
      if (!it.uses.size) { const h = game.hands; if (h && h[this._side()]._uxPrec) { h.setReach(this._side(), null); h[this._side()]._uxPrec = false; } }
      return;
    }
    // điểm mũi dụng cụ: trên mặt theo pháp tuyến + run tay nhẹ
    const hgt = this.height;
    const t = this._t;
    const amp = (this.fine ? 0.025 : 0.05);
    this.hover.copy(P.point).addScaledVector(P.normal, hgt);
    this.hover.x += (Math.sin(t * 7.3) + Math.sin(t * 11.9 + 1.3) * 0.6) * amp;
    this.hover.z += (Math.sin(t * 8.1 + 0.7) + Math.sin(t * 13.7) * 0.5) * amp;
    this.hover.y += Math.sin(t * 9.4 + 2.1) * amp * 0.6;
    this.hasHover = true;
    const side = this._side();
    const h = game.hands;
    if (h && !it.uses.size && !it.holding && !it.dragging) {
      h.setReach(side, this.hover);
      h[side]._uxPrec = true;
    }
    this._placeMarker(P.point, P.normal, hgt, true);
  }

  _placeMarker(point, normal, hgt, on) {
    const mk = this._marker;
    if (!mk) return;
    mk.visible = on || !!point;
    mk.position.copy(point).addScaledVector(normal, 0.08);
    mk.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    // cỡ vòng tròn theo khoảng cách tới camera (luôn ~ cùng cỡ trên màn hình)
    const cam = this.camera || this.game.camera;
    const d = cam.getWorldPosition(_v).distanceTo(point);
    const fov = cam.fov || 50;
    const k = Math.max(0.05, d * Math.tan((fov * Math.PI) / 360) / 180);
    mk.userData.disc.scale.setScalar(k);
    const line = mk.userData.line;
    line.visible = hgt > 0.3;
    line.scale.set(1, 1, Math.max(0.01, hgt));
  }
}
