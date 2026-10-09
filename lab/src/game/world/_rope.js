// Dây mềm động (dây mỏ hàn, dây que đo, cáp USB…): ống có số đốt cố định, cập nhật đỉnh tại chỗ
// (không cấp phát mỗi khung hình). Đường cong: Bézier bậc 3 từ A theo hướng aDir tới B theo hướng bDir,
// cộng độ võng; có thể kẹp không xuyên xuống dưới mặt minY (mặt bàn).
import * as THREE from 'three';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c1 = new THREE.Vector3(), _c2 = new THREE.Vector3();
const _t = new THREE.Vector3(), _n = new THREE.Vector3(), _bn = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _p = new THREE.Vector3(), _prevN = new THREE.Vector3();

export class Rope {
  constructor({ radius = 2, segments = 32, radial = 6, material, color = 0x1d1f23, sag = 0.18, minY = -Infinity } = {}) {
    this.radius = radius; this.segments = segments; this.radial = radial; this.sag = sag; this.minY = minY;
    const nv = (segments + 1) * (radial + 1);
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    const idx = [];
    for (let i = 0; i <= segments; i++) for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      uv[k * 2] = i / segments; uv[k * 2 + 1] = j / radial;
      if (i < segments && j < radial) {
        const a = k, b = k + radial + 1, c = b + 1, d = a + 1;
        idx.push(a, b, d, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.pts = Array.from({ length: segments + 1 }, () => new THREE.Vector3());
    this.mesh = new THREE.Mesh(g, material || new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0 }));
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.userData.rope = this;
    this.mesh.userData.dynamic = true;
    this._key = '';
  }

  /** a, b: Vector3 (toạ độ cục bộ của cha mesh); aDir/bDir: hướng dây đi ra khỏi đầu cắm */
  set(a, b, aDir = null, bDir = null) {
    const key = `${a.x.toFixed(1)},${a.y.toFixed(1)},${a.z.toFixed(1)},${b.x.toFixed(1)},${b.y.toFixed(1)},${b.z.toFixed(1)}`
      + (aDir ? `${aDir.x.toFixed(2)}${aDir.y.toFixed(2)}${aDir.z.toFixed(2)}` : '') + (bDir ? `${bDir.x.toFixed(2)}${bDir.y.toFixed(2)}${bDir.z.toFixed(2)}` : '');
    if (key === this._key) return false;
    this._key = key;
    _a.copy(a); _b.copy(b);
    const L = _a.distanceTo(_b);
    const k = Math.max(20, L * 0.35);
    _c1.copy(_a); if (aDir) _c1.addScaledVector(aDir, k);
    _c2.copy(_b); if (bDir) _c2.addScaledVector(bDir, k);
    const sag = L * this.sag;
    const n = this.segments;
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      const p = this.pts[i];
      p.set(0, 0, 0)
        .addScaledVector(_a, u * u * u).addScaledVector(_c1, 3 * u * u * t)
        .addScaledVector(_c2, 3 * u * t * t).addScaledVector(_b, t * t * t);
      p.y -= sag * 4 * t * u;
      if (p.y < this.minY + this.radius) p.y = this.minY + this.radius;
    }
    this._rebuild();
    return true;
  }

  /** Đặt trực tiếp danh sách điểm (≥ 2) — nội suy Catmull-Rom tới số đốt cố định */
  setPoints(points) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))));
    for (let i = 0; i <= this.segments; i++) curve.getPoint(i / this.segments, this.pts[i]);
    this._key = '';
    this._rebuild();
  }

  _rebuild() {
    const n = this.segments, R = this.radial, r = this.radius;
    const pos = this.mesh.geometry.attributes.position.array, nor = this.mesh.geometry.attributes.normal.array;
    _prevN.set(0, 0, 0);
    for (let i = 0; i <= n; i++) {
      const p0 = this.pts[Math.max(0, i - 1)], p1 = this.pts[Math.min(n, i + 1)];
      _t.subVectors(p1, p0);
      if (_t.lengthSq() < 1e-8) _t.set(0, 0, 1);
      _t.normalize();
      // khung song song (giảm xoắn): chiếu pháp tuyến trước lên mặt vuông góc tiếp tuyến
      if (_prevN.lengthSq() > 0.5) _n.copy(_prevN).addScaledVector(_t, -_prevN.dot(_t));
      else { _n.crossVectors(_t, Math.abs(_t.y) > 0.95 ? _p.set(1, 0, 0) : _up); }
      if (_n.lengthSq() < 1e-8) _n.set(1, 0, 0);
      _n.normalize();
      _prevN.copy(_n);
      _bn.crossVectors(_t, _n).normalize();
      const c = this.pts[i];
      for (let j = 0; j <= R; j++) {
        const a = (j / R) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const nx = _n.x * ca + _bn.x * sa, ny = _n.y * ca + _bn.y * sa, nz = _n.z * ca + _bn.z * sa;
        const k = (i * (R + 1) + j) * 3;
        pos[k] = c.x + nx * r; pos[k + 1] = c.y + ny * r; pos[k + 2] = c.z + nz * r;
        nor[k] = nx; nor[k + 1] = ny; nor[k + 2] = nz;
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.normal.needsUpdate = true;
  }
}

/** Toạ độ thế giới của obj → toạ độ cục bộ của space (ghi vào out) */
export function worldToLocalOf(space, obj, out) {
  obj.getWorldPosition(out);
  return space.worldToLocal(out);
}
