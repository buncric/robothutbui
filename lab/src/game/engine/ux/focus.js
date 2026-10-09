// =============================================================================
// ux/focus.js — XEM GẦN (bảng trắng, poster…): camera trượt tới trước mặt vật, khoá đi lại, nhìn trong nón hẹp.
//   focus.enter(object, { dist, fov, name, normal? }) · focus.exit() · focus.active
//   Phím: [E] / [Space] / [Esc] thôi xem · chuột: nhìn quanh trong nón nhỏ · cuộn: lại gần / ra xa
//   Pháp tuyến mặt vật = +Z cục bộ của object (PlaneGeometry) — có thể truyền normal (Vector3 thế giới).
// =============================================================================
import * as THREE from 'three';

export class Focus {
  constructor(game, ux) {
    this.game = game;
    this.ux = ux;
    this.active = null;     // { object, name, center, normal, dist }
  }

  enter(object, { dist = 1200, fov = 45, name = '', normal = null } = {}) {
    const game = this.game;
    if (this.ux.seating?.seated) { game.hud?.toast?.('Đứng dậy trước (Space)', { kind: 'info', short: true }); return false; }
    if (game.interact?.inspecting) game.interact.stopInspect();
    object.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const n = normal ? normal.clone() : new THREE.Vector3(0, 0, 1).transformDirection(object.matrixWorld).setY(0).normalize();
    // pháp tuyến phải hướng về phía người chơi
    const eye = game.camera.getWorldPosition(new THREE.Vector3());
    if (n.dot(eye.clone().sub(center)) < 0) n.negate();
    this.active = { object, name, center, normal: n, dist, fov };
    const look = n.clone().negate();
    game.player.setRig({
      name: 'focus', eye: this._eye(), yawCenter: Math.atan2(-look.x, -look.z), yawRange: 0.3,
      pitchMin: -0.25, pitchMax: 0.25, fov, dur: 0.55, lockMove: true,
    });
    // quay thẳng vào vật
    game.player.yaw = Math.atan2(-look.x, -look.z);
    game.player.pitch = Math.atan2(center.y - this._eye().y, dist) * 0.5;
    game.audio?.play?.('whoosh', { vol: 0.2 });
    game.events?.emit('focus:enter', { object, name });
    return true;
  }

  _eye(out = new THREE.Vector3()) {
    const a = this.active;
    return out.copy(a.center).addScaledVector(a.normal, a.dist).setY(Math.max(1100, Math.min(a.center.y, 1750)));
  }

  exit(silent = false) {
    if (!this.active) return;
    const a = this.active;
    this.active = null;
    this.game.player.releaseRig();
    if (!silent) this.game.audio?.play?.('whoosh', { vol: 0.15 });
    this.game.events?.emit('focus:exit', { object: a.object });
  }

  onInput(e) {
    if (!this.active) return false;
    if (e.type === 'input:key' && e.down && ['KeyE', 'Space', 'Escape', 'KeyF'].includes(e.code)) { this.exit(); return true; }
    if (e.type === 'input:key' && e.down && /^Key[WASDCGRQ]$/.test(e.code)) return true;
    if (e.type === 'input:wheel') {
      this.active.dist = THREE.MathUtils.clamp(this.active.dist + e.delta * 120, 400, 2600);
      return true;
    }
    if (e.type === 'input:mouse' && e.down) return true;
    return false;
  }

  update() {
    if (!this.active) return;
    const rig = this.game.player.rig;
    if (rig?.name === 'focus') rig.eye.lerp(this._eye(), 0.2);
  }

  modeCard() {
    if (!this.active) return null;
    return { icon: '📖', title: `Đang xem gần${this.active.name ? ` · ${this.active.name}` : ''}`, keys: [['E/Space', 'Thôi xem'], ['WHEEL', 'Lại gần / ra xa'], ['Chuột', 'Nhìn quanh']] };
  }
}
