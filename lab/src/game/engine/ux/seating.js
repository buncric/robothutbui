// =============================================================================
// ux/seating.js — NGỒI GHẾ & tư thế làm việc tại bàn.
//
//   Ghế: world.seats (Object3D có userData.seat = { id, bench, seatH, kind:'chair'|'stool', rolling, collider:Box3, size? })
//        → không có thì tìm trong world.root theo userData.seat / tên 'chair-*' 'stool-*' → không có nữa thì tạo ghế ảo trước
//        mỗi bàn trong world.benches (chỉ hộp va chạm tàng hình để vẫn ngồi được).
//   Đứng nhìn ghế: [E] Ngồi · [R] Kéo ghế ra / đẩy vào bàn.
//   Đang ngồi: mắt hạ xuống ≈ 1150 mm, sát mép bàn; không đi lại; góc nhìn giới hạn trong nón ±72° hướng về bàn; FOV hẹp
//              hơn (cài đặt "FOV khi ngồi"); 2 tay đặt trên mặt bàn khi rảnh.
//     [Space] / [E] (khi không nhìn vào gì) Đứng dậy (tìm chỗ đứng không va chạm) · [W]/[S] kéo ghế vào / ra
//     [A]/[D] nghiêng người · [Z] kính lúp (FOV 35°, nhích lại gần) · [Tab] / chuột giữa: chế độ thao tác tỉ mỉ
//     (Shift+Tab: túi linh kiện). Ghế xoay xoay theo hướng nhìn.
//   [bàn 3D] Cài đặt 'benchMode' bật (mặc định): ngồi ghế có bàn → chế độ BÀN LÀM VIỆC 3D (ux/bench.js: camera quỹ đạo, chuột thật).
//     Tab: bàn 3D ↔ góc nhìn thứ nhất khi ngồi (chuột giữa: thao tác tỉ mỉ). Tắt cài đặt → Tab = tỉ mỉ như cũ.
//   API: seating.seats · seated (Seat|null) · sit(seat|id, { bench? }) · stand() · toggleZoom() · seatOf(object)
//   Sự kiện: 'player:sit' {seat, bench} · 'player:stand' {seat} · 'chair:moved' {seat}
//   Trạng thái ngồi KHÔNG lưu (tải game → đứng).
// =============================================================================
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const PLAYER_R = 250;
export const SEATED_EYE = 1150;          // mm — mắt khi ngồi
const PULL_MIN = 200, PULL_MAX = 620, PULL_SIT = 300;   // khoảng cách tâm ghế → mép bàn (mm)

const invisibleMat = new THREE.MeshBasicMaterial({ visible: false });

export class Seat {
  constructor(object, info, bench) {
    this.object = object;
    this.id = info.id || object.name || 'seat';
    this.kind = info.kind || 'chair';
    this.benchName = info.bench || null;
    this.bench = bench || null;
    this.seatH = info.seatH ?? 465;
    this.rolling = info.rolling !== false && this.kind === 'chair';
    this.collider = info.collider || null;
    this.size = info.size || [520, 900, 520];
    this.home = { pos: object.position.clone(), ry: object.rotation.y };
    this.dist = 0;                // khoảng cách tâm ghế → mép bàn hiện tại (mm)
    this.lean = 0;                // −1 … 1
    this.computeFrame();
  }

  get label() { return this.kind === 'stool' ? 'Ghế đẩu' : 'Ghế xoay'; }

  /** Pháp tuyến hướng vào bàn + điểm mép bàn gần nhất (thế giới, theo vị trí ghế hiện tại) */
  computeFrame() {
    const p = this.object.getWorldPosition(new THREE.Vector3());
    const b = this.bench;
    if (!b) {
      // không có bàn: hướng theo mặt ghế (ghế quay +Z cục bộ)
      const ry = this.object.rotation.y;
      this.normal = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
      this.edge = p.clone().addScaledVector(this.normal, 400);
      this.lateral = new THREE.Vector3(this.normal.z, 0, -this.normal.x);
      this.dist = 400;
      this.benchTop = null;
      return;
    }
    const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
    // cạnh gần nhất của hình chữ nhật bàn
    const dists = [[p.z - z1, 0, 1], [z0 - p.z, 0, -1], [p.x - x1, 1, 0], [x0 - p.x, -1, 0]];
    dists.sort((a, c) => c[0] - a[0]);
    const [d, nx, nz] = dists[0];
    // pháp tuyến hướng VÀO bàn = ngược hướng từ bàn ra ghế
    this.normal = new THREE.Vector3(-nx, 0, -nz);
    this.lateral = new THREE.Vector3(this.normal.z, 0, -this.normal.x);
    const ex = nx ? (nx > 0 ? x1 : x0) : THREE.MathUtils.clamp(p.x, x0 + 150, x1 - 150);
    const ez = nz ? (nz > 0 ? z1 : z0) : THREE.MathUtils.clamp(p.z, z0 + 150, z1 - 150);
    this.edge = new THREE.Vector3(ex, 0, ez);
    this.dist = Math.max(0, d);
    this.benchTop = b.top ?? 750;
  }

  /** Vị trí tâm ghế ứng với khoảng cách `dist` tới mép bàn */
  posAt(dist, out = new THREE.Vector3()) {
    return out.copy(this.edge).addScaledVector(this.normal, -dist).setY(this.object.position.y);
  }
  /** Hướng nhìn (yaw người chơi) thẳng vào bàn */
  get yawCenter() { return Math.atan2(-this.normal.x, -this.normal.z); }
}

export class Seating {
  constructor(game, ux) {
    this.game = game;
    this.ux = ux;
    this.seats = [];
    this.seated = null;
    this.zoom = false;
    this._anim = null;          // { from, to, t, dur } dịch ghế
    this._t = 0;
    this._lean = 0;
    this._restOn = false;
  }

  // ------------------------------------------------------------------ tìm ghế
  discover() {
    const world = this.game.world || {};
    const benches = (world.benches || []).map((b) => ({ ...b, top: b.top ?? 750 }));
    const found = new Set();
    const add = (o) => { if (o && o.userData?.seat && !found.has(o)) found.add(o); };
    (world.seats || []).forEach(add);
    world.root?.traverse?.((o) => { if (o.userData?.seat) add(o); });
    for (const [k, o] of Object.entries(world.anchors || {})) if (/^(chair|seat|stool)[-_]/.test(k) && o?.isObject3D) { o.userData.seat ||= { id: k, kind: /stool/.test(k) ? 'stool' : 'chair' }; add(o); }
    // không có ghế nào → ghế ảo trước mỗi bàn
    if (!found.size && world.root) {
      for (const b of benches) {
        if (b.island) continue;
        const o = new THREE.Object3D();
        o.name = `seat-virtual-${b.name}`;
        o.position.set(b.x, 0, b.z + b.d / 2 + 380);
        o.rotation.y = Math.PI;
        o.userData.seat = { id: o.name, bench: b.name, kind: 'stool', virtual: true, size: [420, 470, 420] };
        world.root.add(o);
        add(o);
      }
    }
    this.seats = [];
    for (const o of found) {
      const info = o.userData.seat;
      let bench = info.bench ? benches.find((b) => b.name === info.bench) : null;
      if (!bench && info.bench !== null && benches.length) {
        // gán bàn gần nhất (≤ 1.2 m)
        const p = o.getWorldPosition(_v);
        let best = null;
        for (const b of benches) {
          const dx = Math.max(Math.abs(p.x - b.x) - b.w / 2, 0), dz = Math.max(Math.abs(p.z - b.z) - b.d / 2, 0);
          const d = Math.hypot(dx, dz);
          if (d < 1200 && (!best || d < best.d)) best = { b, d };
        }
        bench = best?.b || null;
      }
      if (!info.collider) info.collider = this._findCollider(o);
      const seat = new Seat(o, info, bench);
      this._ensureProxy(seat);
      this.seats.push(seat);
      this._register(seat);
    }
    return this.seats;
  }

  _findCollider(o) {
    const p = o.getWorldPosition(_v);
    let best = null;
    for (const b of this.game.world?.colliders || []) {
      if (b.max.y > 1000 || b.max.y < 300) continue;
      const c = b.getCenter(_v2);
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      const sx = b.max.x - b.min.x, sz = b.max.z - b.min.z;
      if (d < 120 && sx < 700 && sz < 700 && (!best || d < best.d)) best = { b, d };
    }
    return best?.b || null;
  }

  /** Ghế không có mesh (điểm neo / ghế gộp tĩnh) → hộp tàng hình để tia nhìn trúng */
  _ensureProxy(seat) {
    let hasMesh = false;
    seat.object.traverse((o) => { if (o.isMesh && o.userData?.uxProxy !== true) hasMesh = true; });
    if (hasMesh) return;
    const [w, h, d] = seat.size;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), invisibleMat);
    m.position.y = h / 2;
    m.userData.uxProxy = true;
    m.castShadow = m.receiveShadow = false;
    seat.object.add(m);
    seat.object.updateMatrixWorld(true);
  }

  _register(seat) {
    const it = this.game.interact;
    if (!it?.register) return;
    seat.object.userData.uxSeat = seat;
    it.register(seat.object, {
      name: () => `${seat.label}${seat.bench ? ` · ${seat.bench.label || seat.bench.name}` : ''}`,
      uxKind: 'chair', icon: '🪑', highlight: true, reach: 1350,
      prompts: [
        { key: 'E', label: 'Ngồi', when: () => !this.seated, do: () => this.sit(seat) },
        { key: 'R', label: () => (seat.dist > PULL_SIT + 120 ? 'Đẩy ghế vào bàn' : 'Kéo ghế ra'), when: () => !this.seated && !!seat.bench && seat.kind === 'chair', do: () => this.togglePull(seat) },
      ],
    });
  }

  seatOf(obj) { for (let o = obj; o; o = o.parent) if (o.userData?.uxSeat) return o.userData.uxSeat; return null; }
  get(id) { return this.seats.find((s) => s.id === id || s.object.name === id || s.benchName === id) || null; }

  // ------------------------------------------------------------------ kéo ghế (đứng)
  togglePull(seat) {
    seat.computeFrame();
    const to = seat.dist > PULL_SIT + 120 ? PULL_SIT + 40 : 560;
    this._moveChair(seat, to, 0.45);
    this.game.audio?.play?.('click', { vol: 0.3 });
  }

  _moveChair(seat, dist, dur = 0.4) {
    const from = seat.object.position.clone();
    const to = seat.posAt(THREE.MathUtils.clamp(dist, PULL_MIN, PULL_MAX));
    this._anim = { seat, from, to, t: 0, dur: this.game.app?.headless ? 0 : dur };
    if (this._anim.dur === 0) this._applyAnim(1);
  }
  _applyAnim(k) {
    const a = this._anim;
    if (!a) return;
    const e = k * k * (3 - 2 * k);
    a.seat.object.position.lerpVectors(a.from, a.to, e);
    a.seat.object.updateMatrixWorld(true);
    a.seat.dist = Math.max(0, a.seat.edge.clone().sub(a.seat.object.position).setY(0).dot(a.seat.normal));
    this._syncCollider(a.seat);
    if (k >= 1) { this._anim = null; this.game.events?.emit('chair:moved', { seat: a.seat }); }
  }
  _syncCollider(seat) {
    const c = seat.collider;
    if (!c) return;
    const p = seat.object.position;
    const hx = (c.max.x - c.min.x) / 2, hz = (c.max.z - c.min.z) / 2;
    c.min.x = p.x - hx; c.max.x = p.x + hx; c.min.z = p.z - hz; c.max.z = p.z + hz;
  }

  // ------------------------------------------------------------------ ngồi / đứng
  sit(seat, { bench } = {}) {
    if (typeof seat === 'string') seat = this.get(seat);
    if (!seat || this.seated) return false;
    const game = this.game;
    const ux = this.ux;
    if (ux.focus?.active) ux.focus.exit(true);
    if (game.interact?.inspecting) game.interact.stopInspect();
    seat.computeFrame();
    this.seated = seat;
    this.zoom = false;
    this._lean = 0;
    this._standPos = game.player.pos.clone();
    // ghế: kéo sát bàn + quay vào bàn
    if (seat.bench) this._moveChair(seat, PULL_SIT, 0.55);
    if (seat.kind === 'chair') seat.object.rotation.y = seat.yawCenter + Math.PI;
    const s = game.quality?.settings || {};
    game.player.setRig({
      name: 'seat', eye: this._eyeFor(seat), yawCenter: seat.yawCenter, yawRange: seat.bench ? 1.25 : Math.PI,
      pitchMin: -1.35, pitchMax: seat.bench ? 0.45 : 0.9, fov: (s.fov ?? 70) + (s.seatedFov ?? -8), dur: 0.6, lockMove: true,
    });
    if (game.player.crouched) { game.player.crouched = false; game.player.crouchK = 0; }
    // nhìn xuống mặt bàn
    this._lookTween = seat.bench ? { yaw: seat.yawCenter, pitch: -0.62, t: 0 } : null;
    if (game.app?.headless && this._lookTween) { game.player.yaw = this._lookTween.yaw; game.player.pitch = this._lookTween.pitch; this._lookTween = null; }
    game.audio?.play?.('whoosh', { vol: 0.25 });
    game.events?.emit('player:sit', { seat, bench: seat.bench?.name || null });
    // [bàn 3D] ngồi vào bàn → chế độ bàn làm việc 3D (cài đặt "Ngồi vào bàn → chế độ 3D")
    if (seat.bench && (bench ?? this.benchMode) && ux.bench) ux.bench.enter(seat);
    return true;
  }

  get benchMode() { return this.game.quality?.settings?.benchMode !== false; }

  /** Điểm mắt khi ngồi (thế giới) — trên tâm ghế, nhích về phía bàn, + nghiêng người */
  _eyeFor(seat, out = new THREE.Vector3()) {
    const p = seat.object.getWorldPosition(_v2);
    const fwd = seat.bench ? 70 : 0;
    out.copy(p).addScaledVector(seat.normal, fwd);
    out.y = (seat.object.position.y || 0) + SEATED_EYE + (seat.seatH - 465) * 0.5;
    // thao tác tỉ mỉ: cúi người về phía trước (nhìn xuống mạch dốc hơn — không bị hàm kẹp che pad)
    const hunch = this._hunch || 0;
    out.addScaledVector(seat.normal, 120 * hunch);
    out.y += 70 * hunch;
    out.addScaledVector(seat.lateral, this._lean * 130);
    out.y -= Math.abs(this._lean) * 25;
    if (this.zoom && seat.bench) {
      // kính lúp: nhích đầu lại gần mặt bàn theo hướng nhìn
      const f = this.game.player.forward(this._fz || (this._fz = new THREE.Vector3()));
      out.addScaledVector(f, 160);
    }
    return out;
  }

  stand() {
    const seat = this.seated;
    if (!seat) return false;
    const game = this.game;
    const ux = this.ux;
    const spot = this._freeSpot(seat);
    if (!spot) { game.hud?.toast?.('Không có chỗ đứng dậy — bị vướng', { kind: 'warn', short: true }); return false; }
    if (ux.bench?.active) ux.bench.exit({ stand: true });
    if (ux.microscope?.active) ux.microscope.exit(true);
    if (ux.precision?.active) ux.precision.disable();
    this.seated = null;
    this.zoom = false;
    this._lookTween = null;
    this._restHands(false);
    game.player.teleport([spot.x, 0, spot.z], game.player.yaw, game.player.pitch * 0.5);
    game.player.releaseRig();
    game.audio?.play?.('whoosh', { vol: 0.2 });
    game.events?.emit('player:stand', { seat });
    return true;
  }

  /** Chỗ đứng không va chạm quanh ghế: sau ghế → 2 bên → chỗ đứng trước khi ngồi */
  _freeSpot(seat) {
    seat.computeFrame();
    const p = seat.object.position;
    const n = seat.normal, l = seat.lateral;
    const cands = [
      p.clone().addScaledVector(n, -600), p.clone().addScaledVector(l, 600), p.clone().addScaledVector(l, -600),
      p.clone().addScaledVector(n, -600).addScaledVector(l, 450), p.clone().addScaledVector(n, -600).addScaledVector(l, -450),
      this._standPos, p.clone().addScaledVector(n, -820),
    ].filter(Boolean);
    for (const c of cands) if (this._isFree(c.x, c.z, seat)) return c;
    return null;
  }
  _isFree(x, z, seat) {
    const r = PLAYER_R + 15;
    for (const b of this.game.world?.colliders || []) {
      if (b.max.y < 140 || b.min.y > 1800) continue;
      const cx = Math.min(Math.max(x, b.min.x), b.max.x), cz = Math.min(Math.max(z, b.min.z), b.max.z);
      if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return false;
    }
    return true;
  }

  toggleZoom(force) {
    if (!this.seated?.bench) return;
    this.zoom = force ?? !this.zoom;
    const s = this.game.quality?.settings || {};
    const rig = this.game.player.rig;
    if (rig) rig.fov = this.zoom ? (s.magnifierFov ?? 35) : (s.fov ?? 70) + (s.seatedFov ?? -8);
    this.game.audio?.play?.('tick');
    this.game.events?.emit('player:zoom', { on: this.zoom });
  }

  // ------------------------------------------------------------------ đầu vào khi ngồi
  /** true = đã dùng sự kiện */
  onInput(e) {
    const seat = this.seated;
    if (!seat) return false;
    const ux = this.ux;
    if (e.type === 'input:key') {
      if (!e.down) return false;
      switch (e.code) {
        case 'Space': this.stand(); return true;
        case 'Tab':
          if (e.shift) return false;          // Shift+Tab → túi
          if (seat.bench && this.benchMode && ux.bench) { if (ux.precision.active) ux.precision.disable(); ux.bench.enter(seat); }   // [bàn 3D]
          else if (seat.bench) ux.precision.toggle();
          else this.game.hud?.toast?.('Ghế này không có bàn trước mặt', { kind: 'info', short: true });
          return true;
        case 'KeyZ': this.toggleZoom(); return true;
        case 'KeyC': return true;            // không cúi khi đang ngồi
        case 'KeyW': case 'KeyS': case 'KeyA': case 'KeyD': case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight': return true;
        default: return false;
      }
    }
    if (e.type === 'input:mouse' && e.button === 1 && e.down) {
      if (seat.bench) ux.precision.toggle();
      return true;
    }
    return false;
  }

  /** Thêm hành động của chế độ ngồi vào thanh gợi ý */
  extraPrompts(add, taken) {
    if (!this.seated || this.ux.bench?.active) return;
    if (!taken.has('E')) add({ key: 'E', label: 'Đứng dậy', do: () => this.stand(), src: 'mode' });
  }

  modeCard() {
    const seat = this.seated;
    if (!seat) return null;
    const p = this.ux.precision;
    const keys = [['Space', 'Đứng dậy']];
    if (seat.bench) {
      if (this.benchMode) { keys.push(['Tab', 'Chế độ bàn 3D (chuột)']); keys.push(['MMB', p.active ? 'Thoát thao tác tỉ mỉ' : 'Thao tác tỉ mỉ (con trỏ)']); }
      else keys.push(['Tab', p.active ? 'Thoát thao tác tỉ mỉ' : 'Thao tác tỉ mỉ (con trỏ)']);
      keys.push(['Z', this.zoom ? 'Thôi kính lúp' : 'Kính lúp (phóng to)']);
      if (p.active) { keys.push(['Shift', 'Rê chậm', true]); keys.push(['WHEEL', `Nâng / hạ mũi · ${p.height.toFixed(0)} mm`]); }
      keys.push(['W/S', 'Kéo ghế vào / ra']);
      keys.push(['A/D', 'Nghiêng người']);
    }
    keys.push(['Shift+Tab', 'Túi linh kiện']);
    return {
      icon: p.active ? '🎯' : '🪑',
      title: p.active ? 'Thao tác tỉ mỉ' : `Đang ngồi · ${seat.bench?.label || seat.label}`,
      sub: p.active ? `Mũi cao ${p.height.toFixed(0)} mm trên mặt${this.zoom ? ' · kính lúp' : ''}` : (this.zoom ? 'Kính lúp đang bật' : ''),
      badge: p.active ? 'tỉ mỉ' : null,
      keys,
    };
  }

  // ------------------------------------------------------------------ mỗi khung
  update(dt) {
    if (this._anim) { const a = this._anim; a.t += dt; this._applyAnim(a.dur ? Math.min(1, a.t / a.dur) : 1); }
    const seat = this.seated;
    if (!seat) return;
    const game = this.game;
    const app = game.app;
    const keys = app.input?.keys || new Set();
    const blocked = app.paused || app.uiMode || this.ux.microscope?.active || this.ux.bench?.active;
    // kéo ghế vào / ra (giữ W/S)
    if (seat.bench && !blocked && !this._anim) {
      const dir = (keys.has('KeyW') || keys.has('ArrowUp') ? -1 : 0) + (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      if (dir) {
        const nd = THREE.MathUtils.clamp(seat.dist + dir * 380 * dt, PULL_MIN, PULL_MAX);
        if (nd !== seat.dist) { seat.object.position.copy(seat.posAt(nd)); seat.dist = nd; this._syncCollider(seat); }
      }
    }
    // nghiêng người (giữ A/D)
    const lw = blocked ? 0 : (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    this._lean += (lw - this._lean) * (1 - Math.exp(-7 * dt));
    this._hunch = (this._hunch || 0) + ((this.ux.precision.active && !this.ux.microscope?.active ? 1 : 0) - (this._hunch || 0)) * (app.headless ? 1 : 1 - Math.exp(-5 * dt));
    // ghế xoay theo hướng nhìn (giới hạn)
    if (seat.rolling) {
      let d = game.player.yaw - seat.yawCenter;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const target = seat.yawCenter + Math.PI + THREE.MathUtils.clamp(d * 0.6, -0.6, 0.6);
      let cur = seat.object.rotation.y;
      let diff = Math.atan2(Math.sin(target - cur), Math.cos(target - cur));
      seat.object.rotation.y = cur + diff * (1 - Math.exp(-5 * dt));
    }
    // nhìn xuống bàn lúc mới ngồi
    if (this._lookTween) {
      const t = this._lookTween;
      t.t += dt;
      const a = 1 - Math.exp(-7 * dt);
      let dy = t.yaw - game.player.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      game.player.yaw += dy * a;
      game.player.pitch += (t.pitch - game.player.pitch) * a;
      if (t.t > 0.7) this._lookTween = null;
    }
    // mắt theo ghế + nghiêng + kính lúp
    const rig = game.player.rig;
    if (rig && rig.name === 'seat') {
      rig.eye.lerp(this._eyeFor(seat, _v), 1 - Math.exp(-10 * dt));
      rig.roll = -this._lean * 0.07;
    }
    this._restHands(!!seat.bench && !this.ux.precision.active && !this.ux.microscope?.active);
  }

  /** 2 bàn tay đặt trên mặt bàn khi rảnh */
  _restHands(on) {
    const h = this.game.hands;
    if (!h) return;
    const seat = this.seated;
    const inv = this.game.inventory;
    const it = this.game.interact;
    const sides = [['right', !inv?.rightTool && !it?.heldItem && !h.right.held], ['left', !inv?.leftTool && !h.left.held]];
    for (const [side, free] of sides) {
      const hand = h[side];
      if (on && free && seat) {
        if (hand.poseName === 'idle' || hand.poseName === 'rest') {
          if (hand.poseName !== 'rest') h.setPose(side, 'rest');
          const f = this.game.player.forward(_v).setY(0).normalize();
          const cam = this.game.camera.getWorldPosition(_v2);
          const s = side === 'right' ? 1 : -1;
          const lat = new THREE.Vector3(-f.z, 0, f.x).multiplyScalar(-s);   // phải của hướng nhìn
          const top = (seat.benchTop ?? 750) + 14;
          const pt = new THREE.Vector3(cam.x, top, cam.z).addScaledVector(f, 300).addScaledVector(lat, -215);
          h.setReach(side, pt);
          hand._uxRest = true;
        }
      } else if (hand._uxRest) {
        hand._uxRest = false;
        if (hand.poseName === 'rest') h.setPose(side, 'idle');
        if (!this.game.interact?.uses?.size) h.setReach(side, null);
      }
    }
  }
}
