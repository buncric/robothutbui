// Hiệu ứng sự cố: khói, tia lửa, lửa, chớp sáng, nổ bung, cháy xém, nóng đỏ.
// Dùng trong linh kiện qua ctx.fx (đơn vị mm — truyền `size` theo kích thước linh kiện).
import * as THREE from 'three';

let _tex = null;
function softTexture() {
  if (_tex !== null) return _tex;
  if (typeof document === 'undefined') return (_tex = undefined);     // chạy trong Node (smoke test)
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  _tex = new THREE.CanvasTexture(c);
  return _tex;
}

export class FX {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'fx';
    scene.add(this.group);
    this.parts = [];       // hạt đang bay
    this.emitters = [];    // nguồn phát liên tục (khói, lửa)
    this.lights = [];
    this.anims = [];       // vật thể đang bay/rung (pop)
  }

  _sprite(color, size, opacity, additive) {
    const opts = { color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending };
    const tex = softTexture();
    if (tex) opts.map = tex;
    const m = new THREE.SpriteMaterial(opts);
    const s = new THREE.Sprite(m);
    s.scale.setScalar(size);
    this.group.add(s);
    return s;
  }

  _toWorld(pos) {
    if (pos && pos.isObject3D) return pos.getWorldPosition(new THREE.Vector3());
    return new THREE.Vector3(...pos);
  }

  /** Khói bốc lên liên tục trong `duration` giây. size ~ kích thước linh kiện (mm) */
  smoke(pos, { size = 6, duration = 4, rate = 25, color = 0x4a4a4a } = {}) {
    this.emitters.push({ kind: 'smoke', at: this._toWorld(pos), size, life: duration, rate, color, acc: 0 });
  }

  /** Lửa (ngọn lửa nhỏ, phát sáng) */
  fire(pos, { size = 5, duration = 3 } = {}) {
    const at = this._toWorld(pos);
    this.emitters.push({ kind: 'fire', at, size, life: duration, rate: 60, acc: 0 });
    this.flash(at, { size: size * 3, duration, color: 0xff7a1a, intensity: 2 });
  }

  /** Tia lửa bắn tung tóe (chập mạch, đánh lửa) */
  sparks(pos, { count = 60, speed = 60, size = 0.8, color = 0xffd27a } = {}) {
    const at = this._toWorld(pos);
    for (let i = 0; i < count; i++) {
      const s = this._sprite(color, size, 1, true);
      s.position.copy(at);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random()));
      this.parts.push({ s, v, life: 0.4 + Math.random() * 0.6, max: 1, g: -speed * 2, kind: 'spark' });
    }
    this.flash(at, { size: speed * 0.6, duration: 0.15, color: 0xfff1c0, intensity: 6 });
  }

  /** Chớp sáng (đèn điểm + quầng) */
  flash(pos, { size = 20, duration = 0.2, color = 0xffffff, intensity = 4 } = {}) {
    const at = this._toWorld(pos);
    const l = new THREE.PointLight(color, intensity * 1000, size * 6, 2);
    l.position.copy(at);
    this.group.add(l);
    const halo = this._sprite(color, size, 0.9, true);
    halo.position.copy(at);
    this.lights.push({ l, halo, life: duration, max: duration, intensity: intensity * 1000 });
  }

  /** Nổ bung một vật (tụ điện phồng nổ, IC vỡ): vật bay lên, xoay, kèm khói + tia lửa */
  pop(obj, { force = 40, size = 6 } = {}) {
    const at = obj.getWorldPosition(new THREE.Vector3());
    this.anims.push({ obj, v: new THREE.Vector3((Math.random() - 0.5) * force * 0.4, force, (Math.random() - 0.5) * force * 0.4), w: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8), life: 1.2, home: obj.position.clone(), rot: obj.rotation.clone() });
    this.sparks(at, { count: 40, speed: force * 1.2, size: size * 0.12 });
    this.smoke(at, { size, duration: 3 });
  }

  /** Cháy xém: làm tối màu vật liệu của mesh (giữ nguyên tới khi reset linh kiện) */
  scorch(obj, amount = 0.75) {
    obj.traverse((o) => {
      if (!o.isMesh || !o.material?.color) return;
      if (!o.userData._preScorch) { o.userData._preScorch = o.material; o.material = o.material.clone(); }
      o.material.color.lerp(new THREE.Color(0x120c08), amount);
      o.material.roughness = 1;
    });
  }

  /** Nóng đỏ theo nhiệt độ: level 0 (nguội) → 1 (đỏ rực). Gọi mỗi khung hình */
  heat(obj, level) {
    const k = Math.max(0, Math.min(1, level));
    obj.traverse((o) => {
      if (!o.isMesh || !o.material || !('emissive' in o.material)) return;
      if (!o.userData._preHeat) { o.userData._preHeat = o.material; o.material = o.material.clone(); }
      o.material.emissive.setRGB(k, k * k * 0.35, 0);
      o.material.emissiveIntensity = k * 1.6;
    });
  }

  /** Khôi phục vật liệu đã xém/nóng và vật đã bay (gọi khi người học bấm "Khôi phục") */
  restore(root) {
    root.traverse((o) => {
      for (const key of ['_preScorch', '_preHeat']) {
        if (o.userData[key]) { o.material = o.userData[key]; delete o.userData[key]; }
      }
    });
    for (const a of this.anims) { a.obj.position.copy(a.home); a.obj.rotation.copy(a.rot); }
    this.anims = [];
    this.clear();
  }

  clear() {
    for (const p of this.parts) this._kill(p.s);
    for (const l of this.lights) { this.group.remove(l.l); this._kill(l.halo); }
    this.parts = []; this.emitters = []; this.lights = [];
  }

  _kill(s) { this.group.remove(s); s.material.dispose(); }

  update(dt) {
    // nguồn phát
    for (const e of this.emitters) {
      e.life -= dt;
      e.acc += e.rate * dt;
      while (e.acc >= 1 && e.life > 0) {
        e.acc -= 1;
        if (e.kind === 'smoke') {
          const s = this._sprite(e.color, e.size * (0.6 + Math.random() * 0.4), 0.55, false);
          s.position.copy(e.at).add(new THREE.Vector3((Math.random() - 0.5) * e.size * 0.3, 0, (Math.random() - 0.5) * e.size * 0.3));
          this.parts.push({ s, v: new THREE.Vector3((Math.random() - 0.5) * e.size * 0.3, e.size * (1.2 + Math.random()), (Math.random() - 0.5) * e.size * 0.3), life: 2.5, max: 2.5, grow: e.size * 1.2, kind: 'smoke' });
        } else {
          const hot = Math.random() < 0.5 ? 0xffd25a : 0xff5a1a;
          const s = this._sprite(hot, e.size * (0.4 + Math.random() * 0.5), 0.9, true);
          s.position.copy(e.at).add(new THREE.Vector3((Math.random() - 0.5) * e.size * 0.5, 0, (Math.random() - 0.5) * e.size * 0.5));
          this.parts.push({ s, v: new THREE.Vector3(0, e.size * (2 + Math.random() * 2), 0), life: 0.5, max: 0.5, grow: -e.size * 0.6, kind: 'fire' });
        }
      }
    }
    this.emitters = this.emitters.filter((e) => e.life > 0);
    // hạt
    for (const p of this.parts) {
      p.life -= dt;
      p.s.position.addScaledVector(p.v, dt);
      if (p.g) p.v.y += p.g * dt;
      if (p.grow) p.s.scale.addScalar(p.grow * dt);
      const k = Math.max(0, p.life / p.max);
      p.s.material.opacity = p.kind === 'smoke' ? 0.55 * k : k;
    }
    this.parts = this.parts.filter((p) => (p.life > 0 && p.s.scale.x > 0) || (this._kill(p.s), false));
    // đèn chớp
    for (const l of this.lights) {
      l.life -= dt;
      const k = Math.max(0, l.life / l.max);
      l.l.intensity = l.intensity * k;
      l.halo.material.opacity = 0.9 * k;
    }
    this.lights = this.lights.filter((l) => l.life > 0 || (this.group.remove(l.l), this._kill(l.halo), false));
    // vật nổ bay
    for (const a of this.anims) {
      if (a.life <= 0) continue;
      a.life -= dt;
      a.v.y -= 400 * dt * 0.25;
      a.obj.position.addScaledVector(a.v, dt);
      a.obj.rotation.x += a.w.x * dt; a.obj.rotation.y += a.w.y * dt; a.obj.rotation.z += a.w.z * dt;
    }
  }
}
