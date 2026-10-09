// =============================================================================
// player.js — Nhân vật góc nhìn thứ nhất.
//
//   WASD / ↑↓←→ đi · Shift chạy · C cúi (mắt 1650 → 1150 mm) · chuột nhìn (pointer lock, chuyển động thô)
//   Va chạm: hình trụ bán kính 250 mm với danh sách AABB (game.world.colliders: Box3[]), trượt dọc tường.
//   Có gia tốc/giảm tốc, lắc đầu khi đi (head-bob), nghiêng nhẹ khi đi ngang, FOV nhích lên khi chạy.
//   Mỗi bước chân phát events 'footstep' { pos, run, crouch, speed }.
//
//   player.pos (Vector3, vị trí BÀN CHÂN) · player.yaw / pitch (rad) · player.crouched
//   player.lookOverride = (dx, dy) => {}   // khi soi vật: chuột xoay vật thay vì quay đầu
//   player.fovOffset (độ) · player.teleport(pos, yaw, pitch) · player.serialize() / deserialize(d)
//
//   [UX] Khung nhìn ghi đè (ngồi ghế, xem gần bảng trắng, kính lúp…): player.setRig({ eye:Vector3 (mắt, thế giới),
//        yawCenter, yawRange, pitchMin, pitchMax, fov?, roll?, dur?, lockMove? }) → camera trượt mượt tới `eye`, góc nhìn bị
//        giới hạn trong "nón" quanh yawCenter. player.releaseRig(onDone?) → trượt về mắt bình thường rồi gỡ.
//        player.rig.eye có thể đổi liên tục (nghiêng người, kéo ghế). player.lookBase(dx, dy) = điều khiển chuột nền
//        (con trỏ tỉ mỉ) — ưu tiên THẤP hơn lookOverride (soi vật, núm xoay).
//   [UX bàn 3D] player.cameraOverride = (camera, dt) => {} — gọi SAU khi đã đặt camera theo người chơi / rig (camera đang ở tư thế
//        góc nhìn thứ nhất) → hàm có thể ghi đè vị trí / hướng / FOV (camera quỹ đạo của ux/bench.js, pha trộn mượt vào / ra).
// =============================================================================
import * as THREE from 'three';

const MOVE_KEYS = {
  f: ['KeyW', 'ArrowUp'], b: ['KeyS', 'ArrowDown'], l: ['KeyA', 'ArrowLeft'], r: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
};

export const PLAYER = {
  eyeStand: 1650, eyeCrouch: 1150, radius: 250, height: 1800, crouchHeight: 1300,
  walk: 1450, run: 2900, crouchSpeed: 700,     // mm/s
  accel: 10, decel: 12, airless: true,         // hệ số tăng/giảm tốc (1/s)
  stride: 1450,                                // mm cho một chu kỳ 2 bước
  stepHeight: 140,                             // vật thấp hơn mức này coi như bước qua (bậc, thảm…)
  maxPitch: THREE.MathUtils.degToRad(88),
  lookScale: 0.0022,                           // rad / pixel ở độ nhạy 1
};

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3();
    this.prevPos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.crouched = false;
    this.crouchK = 0;                 // 0 đứng … 1 cúi (nội suy mượt)
    this.enabled = true;              // cho phép di chuyển
    this.lookEnabled = true;
    this.lookOverride = null;
    this.lookBase = null;             // [UX] con trỏ tỉ mỉ (ux/precision.js)
    this.rig = null;                  // [UX] khung nhìn ghi đè (ngồi, xem gần…)
    this.cameraOverride = null;       // [UX bàn 3D] (camera, dt) → ghi đè tư thế camera (ux/bench.js)
    this.fovOffset = 0;
    this.distanceWalked = 0;
    this.speed = 0;
    this.running = false;
    // head-bob
    this.bob = { phase: 0, amp: 0, x: 0, y: 0, roll: 0 };
    this._lean = 0;
    this._fovKick = 0;
    this._stepIdx = 0;
    this._lookVel = { x: 0, y: 0 };   // tốc độ quay đầu (để tay "trễ" theo — hands dùng)
    this._wish = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._eye = new THREE.Vector3();

    game.events?.on('input:key', (e) => {
      if (!e.down || e.repeat || !this.enabled) return;
      if (game.ux?.capture?.(e)) return;      // [UX] phím đã được chế độ ngồi / kính hiển vi dùng
      if (e.code === 'KeyC' && !this.rig?.lockMove) this.toggleCrouch();
    });
  }

  get eyeHeight() { return THREE.MathUtils.lerp(PLAYER.eyeStand, PLAYER.eyeCrouch, this.crouchK); }
  get bodyHeight() { return THREE.MathUtils.lerp(PLAYER.height, PLAYER.crouchHeight, this.crouchK); }

  toggleCrouch(force) {
    const want = force ?? !this.crouched;
    if (!want && this._blockedAbove()) { this.game.hud?.toast?.('Không đứng lên được — có vật cản phía trên', { kind: 'warn' }); return; }
    this.crouched = want;
    this.game.events?.emit('player:crouch', { crouched: want });
  }

  teleport(pos, yaw = this.yaw, pitch = 0) {
    if (Array.isArray(pos)) this.pos.set(pos[0], pos[1] || 0, pos[2]);
    else this.pos.copy(pos);
    this.pos.y = Math.max(0, this.pos.y || 0);
    this.prevPos.copy(this.pos);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = pitch;
    this._resolve();
    this.prevPos.copy(this.pos);
  }

  /** Vị trí mắt (thế giới) */
  eyePosition(target = new THREE.Vector3()) {
    return target.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
  }

  /** Hướng nhìn (vector đơn vị) */
  forward(target = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return target.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  // ---------------------------------------------------------------- [UX] khung nhìn ghi đè
  setRig(r) {
    const prev = this.rig;
    this.rig = {
      eye: (r.eye || new THREE.Vector3()).clone(), yawCenter: r.yawCenter ?? this.yaw, yawRange: r.yawRange ?? Math.PI,
      pitchMin: r.pitchMin ?? -PLAYER.maxPitch, pitchMax: r.pitchMax ?? PLAYER.maxPitch, fov: r.fov ?? null, roll: r.roll ?? 0,
      dur: r.dur ?? 0.55, lockMove: r.lockMove !== false, k: prev && prev.target === 1 ? prev.k : prev ? prev.k : 0, target: 1, onDone: null,
      name: r.name || 'rig',
    };
    this.vel.set(0, 0, 0);
    return this.rig;
  }
  releaseRig(onDone = null) {
    if (!this.rig) { onDone?.(); return; }
    this.rig.target = 0;
    this.rig.onDone = onDone;
    if (this.game.app?.headless) this._finishRig();
  }
  _finishRig() { const r = this.rig; this.rig = null; try { r?.onDone?.(); } catch (e) { console.error(e); } }
  /** Bỏ rig ngay (không hoạt cảnh) */
  clearRig() { this.rig = null; }

  _keyDown(list) { const k = this.game.app.input.keys; for (const c of list) if (k.has(c)) return true; return false; }

  // ---------------------------------------------------------------- logic 60 Hz
  fixedUpdate(dt) {
    this.prevPos.copy(this.pos);
    const app = this.game.app;
    if (this.rig?.lockMove) {
      // [UX] đang ngồi / xem gần: đứng yên, không va chạm (ghế nằm trong vùng va chạm của chính nó)
      this.vel.set(0, 0, 0); this.speed = 0; this.running = false;
      this.bob.amp *= Math.exp(-8 * dt);
      this._fovKick *= Math.exp(-5 * dt);
      return;
    }
    const active = this.enabled && (app.locked || app.headless) && !app.uiBlocksMovement;
    let fx = 0, fz = 0;
    if (active) {
      if (this._keyDown(MOVE_KEYS.f)) fz -= 1;
      if (this._keyDown(MOVE_KEYS.b)) fz += 1;
      if (this._keyDown(MOVE_KEYS.l)) fx -= 1;
      if (this._keyDown(MOVE_KEYS.r)) fx += 1;
    }
    this.running = active && this._keyDown(MOVE_KEYS.run) && fz < 0 && !this.crouched;
    const maxSpeed = this.crouched ? PLAYER.crouchSpeed : this.running ? PLAYER.run : PLAYER.walk;
    // hướng mong muốn trong hệ yaw
    const wish = this._wish.set(fx, 0, fz);
    if (wish.lengthSq() > 0) wish.normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.yaw).multiplyScalar(maxSpeed);
    // đi lùi / đi ngang chậm hơn một chút cho "có trọng lượng"
    if (fz > 0) wish.multiplyScalar(0.8);
    const k = wish.lengthSq() > 0 ? PLAYER.accel : PLAYER.decel;
    const a = 1 - Math.exp(-k * dt);
    this.vel.x += (wish.x - this.vel.x) * a;
    this.vel.z += (wish.z - this.vel.z) * a;
    if (Math.abs(this.vel.x) < 1) this.vel.x = 0;
    if (Math.abs(this.vel.z) < 1) this.vel.z = 0;

    // di chuyển + va chạm (chia bước nhỏ nếu nhanh)
    const move = Math.hypot(this.vel.x, this.vel.z) * dt;
    const n = Math.max(1, Math.ceil(move / (PLAYER.radius * 0.4)));
    for (let i = 0; i < n; i++) {
      this.pos.x += (this.vel.x * dt) / n;
      this.pos.z += (this.vel.z * dt) / n;
      this._resolve();
    }
    // tốc độ thật sau va chạm (đâm tường thì không "bob")
    const realSpeed = this._tmp.subVectors(this.pos, this.prevPos).setY(0).length() / dt;
    this.speed = realSpeed;
    this.distanceWalked += realSpeed * dt;

    // cúi / đứng mượt
    this.crouchK += ((this.crouched ? 1 : 0) - this.crouchK) * (1 - Math.exp(-10 * dt));

    // head-bob + bước chân
    const b = this.bob;
    const targetAmp = Math.min(1.6, realSpeed / PLAYER.walk);
    b.amp += (targetAmp - b.amp) * (1 - Math.exp(-8 * dt));
    if (realSpeed > 50) {
      b.phase += (realSpeed * dt / PLAYER.stride) * Math.PI * 2;
      const idx = Math.floor(b.phase / Math.PI);
      if (idx !== this._stepIdx) {
        this._stepIdx = idx;
        this.game.events?.emit('footstep', { pos: this.pos.clone(), run: this.running, crouch: this.crouched, speed: realSpeed, foot: idx % 2 ? 'left' : 'right' });
      }
    } else {
      // dừng: kéo pha về điểm cân bằng gần nhất để camera không đứng khựng giữa nhịp
      const target = Math.round(b.phase / Math.PI) * Math.PI;
      b.phase += (target - b.phase) * (1 - Math.exp(-6 * dt));
    }
    // nghiêng người khi đi ngang
    this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const side = this.vel.dot(this._right) / PLAYER.run;
    this._lean += (-side * 0.025 - this._lean) * (1 - Math.exp(-6 * dt));
    // FOV nhích khi chạy
    this._fovKick += ((this.running && realSpeed > PLAYER.walk * 1.1 ? 5 : 0) - this._fovKick) * (1 - Math.exp(-5 * dt));
  }

  /** Đẩy hình trụ người chơi ra khỏi mọi AABB (trượt dọc tường) */
  _resolve() {
    const cols = this.game.world?.colliders || [];
    const r = PLAYER.radius;
    const y0 = this.pos.y + PLAYER.stepHeight, y1 = this.pos.y + this.bodyHeight;
    for (let iter = 0; iter < 4; iter++) {
      let pushed = false;
      for (const bx of cols) {
        if (!bx || bx.max.y < y0 || bx.min.y > y1) continue;
        if (this.pos.x < bx.min.x - r || this.pos.x > bx.max.x + r || this.pos.z < bx.min.z - r || this.pos.z > bx.max.z + r) continue;
        const cx = Math.min(Math.max(this.pos.x, bx.min.x), bx.max.x);
        const cz = Math.min(Math.max(this.pos.z, bx.min.z), bx.max.z);
        let dx = this.pos.x - cx, dz = this.pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        let nx, nz, depth;
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          nx = dx / d; nz = dz / d; depth = r - d;
        } else {
          // tâm nằm trong hộp: thoát ra theo cạnh gần nhất
          const ex = [this.pos.x - bx.min.x, bx.max.x - this.pos.x, this.pos.z - bx.min.z, bx.max.z - this.pos.z];
          const m = Math.min(...ex), i = ex.indexOf(m);
          nx = i === 0 ? -1 : i === 1 ? 1 : 0; nz = i === 2 ? -1 : i === 3 ? 1 : 0; depth = m + r;
        }
        this.pos.x += nx * depth; this.pos.z += nz * depth;
        // bỏ thành phần vận tốc đâm vào tường → trượt
        const vn = this.vel.x * nx + this.vel.z * nz;
        if (vn < 0) { this.vel.x -= vn * nx; this.vel.z -= vn * nz; }
        pushed = true;
      }
      if (!pushed) break;
    }
  }

  _blockedAbove() {
    const cols = this.game.world?.colliders || [];
    const r = PLAYER.radius;
    for (const bx of cols) {
      if (bx.min.y > this.pos.y + PLAYER.crouchHeight && bx.min.y < this.pos.y + PLAYER.height &&
          this.pos.x > bx.min.x - r && this.pos.x < bx.max.x + r && this.pos.z > bx.min.z - r && this.pos.z < bx.max.z + r) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- mỗi khung vẽ
  frameUpdate(dt, alpha = 1) {
    const app = this.game.app;
    const s = this.game.quality?.settings || {};
    const { dx, dy } = app.input.consumeMouse();
    const sens = PLAYER.lookScale * (s.sensitivity ?? 1);
    const ddy = (s.invertY ? -dy : dy);
    const ov = this.lookOverride || this.lookBase;
    if (ov) {
      ov(dx, ddy);
      this._lookVel.x *= 0.8; this._lookVel.y *= 0.8;
    } else if (this.lookEnabled && (dx || dy)) {
      this.yaw -= dx * sens;
      this.pitch = THREE.MathUtils.clamp(this.pitch - ddy * sens, -PLAYER.maxPitch, PLAYER.maxPitch);
      // vận tốc quay (rad/s) — lọc để tay trễ mượt
      if (dt > 0) {
        this._lookVel.x += ((dx * sens) / dt - this._lookVel.x) * 0.35;
        this._lookVel.y += ((ddy * sens) / dt - this._lookVel.y) * 0.35;
      }
    } else {
      this._lookVel.x *= Math.exp(-12 * dt); this._lookVel.y *= Math.exp(-12 * dt);
    }
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
    // [UX] khung nhìn ghi đè: tiến/lùi hoạt cảnh + giới hạn nón nhìn
    const rig = this.rig;
    let rk = 0;
    if (rig) {
      const step = app.headless ? 1 : dt / Math.max(0.05, rig.dur);
      rig.k = rig.target ? Math.min(1, rig.k + step) : Math.max(0, rig.k - step);
      rk = rig.k * rig.k * (3 - 2 * rig.k);
      if (rig.target) {
        let d = this.yaw - rig.yawCenter;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        const cd = THREE.MathUtils.clamp(d, -rig.yawRange, rig.yawRange);
        const cp = THREE.MathUtils.clamp(this.pitch, rig.pitchMin, rig.pitchMax);
        const a = rig.k >= 1 ? 1 : 1 - Math.exp(-10 * dt);
        this.yaw = rig.yawCenter + d + (cd - d) * a;
        this.pitch += (cp - this.pitch) * a;
      } else if (rig.k <= 0) { this._finishRig(); rk = 0; }
    }

    const cam = this.game.camera;
    const b = this.bob;
    const bobOn = s.headBob !== false;
    b.y = bobOn ? Math.sin(b.phase * 2) * 9 * b.amp - b.amp * 4 : 0;
    b.x = bobOn ? Math.sin(b.phase) * 5 * b.amp : 0;
    b.roll = bobOn ? Math.sin(b.phase) * 0.004 * b.amp : 0;
    // vị trí nội suy giữa 2 bước logic → mượt trên màn 120 Hz
    this._eye.lerpVectors(this.prevPos, this.pos, alpha);
    const right = this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    cam.position.set(this._eye.x + right.x * b.x, this._eye.y + this.eyeHeight + b.y, this._eye.z + right.z * b.x);
    if (this.rig && rk > 0) cam.position.lerp(this.rig.eye, rk);
    cam.rotation.set(this.pitch, this.yaw, this._lean + b.roll + (this.rig ? this.rig.roll * rk : 0), 'YXZ');
    let fov = (s.fov ?? 70) + this._fovKick + this.fovOffset;
    if (this.rig?.fov != null && rk > 0) fov += (this.rig.fov + this.fovOffset - fov) * rk;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    if (this.cameraOverride) { try { this.cameraOverride(cam, dt); } catch (e) { if (!this._camErr) { this._camErr = true; console.error('[player] cameraOverride', e); } } }
    cam.updateMatrixWorld();
  }

  serialize() {
    return { pos: this.pos.toArray().map((v) => Math.round(v)), yaw: +this.yaw.toFixed(4), pitch: +this.pitch.toFixed(4), crouched: this.crouched };
  }

  deserialize(d) {
    if (!d?.pos) return;
    this.teleport(d.pos, d.yaw ?? 0, d.pitch ?? 0);
    this.crouched = !!d.crouched;
    this.crouchK = this.crouched ? 1 : 0;
  }
}
