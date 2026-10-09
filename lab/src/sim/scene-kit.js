// =============================================================================
// scene-kit.js — Đồ dùng 3D chung cho các môi trường mô phỏng (three.js):
//   robot rút gọn (Ø350, chổi cạnh quay, tháp lidar), bóng "odometry", tia lidar, lớp phủ bản đồ nhiệt,
//   camera (từ trên / bám theo / tự do), bàn phím lái tay, bấm chuột lên sàn để đặt robot.
// Quy ước đổi tọa độ: điểm 2D (x, y) mm ở độ cao h → three.js (x, h, −y). Góc θ (CCW) → rotation.y = θ.
// Mọi hàm đều chịu được viewer = null (smoke test chạy trong Node).
// =============================================================================
import { RG } from './robot-sim.js';

const DEG = Math.PI / 180;

/**
 * Dựng robot rút gọn. Gốc nhóm `root` = TÂM THÂN (cao 50 mm so với sàn) để lật/rơi quay quanh trọng tâm.
 * Trả về { root, bumper, led, lidarHead, brushes[], wheels[], cliffEyes[], setBump(bits), setLed(hex), animate(dt, s) }
 */
export function buildRobot({ THREE, MAT, geom, tint }) {
  const { mesh, part, group, cyl, box, arcSector } = geom;
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = -50;            // sàn ở y = −50 trong khung root
  root.add(body);

  const shellMat = tint(MAT.plasticWhite, 0xf2f4f6);
  const shell = mesh(geom.lathe([[0, 8], [168, 8], [175, 16], [175, 70], [170, 78], [150, 80], [0, 80]], 48), shellMat);
  const cover = mesh(cyl(140, 140, 1.5, 48), tint(MAT.plasticBlack, 0x22262c), { y: 80.6 });
  const btn1 = mesh(cyl(12, 12, 3, 20), MAT.plasticGrey, { x: 95, y: 81.5, z: -18 });
  const btn2 = mesh(cyl(12, 12, 3, 20), MAT.plasticGrey, { x: 95, y: 81.5, z: 18 });
  body.add(part(group(shell, cover, btn1, btn2), 'Thân robot Ø350 × 80 mm',
    'Vỏ ABS chứa pin 4S, quạt hút, hộp bụi, 2 mạch: PIC16F877A (tầng thấp, an toàn) và ESP32-S3 (thuật toán).'));

  const ledMat = new THREE.MeshStandardMaterial({ color: 0x55ff99, emissive: 0x22ff66, emissiveIntensity: 1.5 });
  const led = mesh(new THREE.SphereGeometry(7, 16, 10), ledMat, { x: 95, y: 82 });
  body.add(part(led, 'Đèn trạng thái', 'Xanh = đang dọn · Xanh dương = lái tay · Cam = pin yếu · Đỏ = lỗi/va chạm · Tắt = nghỉ.'));

  // Bumper: cung trước ±80°, cao 15…65 mm
  const bumperMat = tint(MAT.plasticGrey, 0x9aa3ad);
  const bumper = mesh(arcSector(174, 181, -80 * DEG, 80 * DEG, 50, 32), bumperMat, { y: 40 });
  body.add(part(bumper, 'Bumper (cản trước) + 2 công tắc',
    'Cung cản ±80° phía trước, lò xo giữ. Bị đẩy lùi ~3 mm sẽ ấn công tắc TRÁI (RB4) hoặc PHẢI (RB5) của PIC; ấn giữa → cả 2. Đỏ = đang bị ấn.'));

  // Tháp lidar (lệch về sau)
  const turretBase = mesh(cyl(RG.TURRET_R, RG.TURRET_R, 6, 32), MAT.plasticDark, { x: RG.TURRET_OFF, y: 83 });
  const lidarHead = new THREE.Group();
  lidarHead.position.set(RG.TURRET_OFF, 86, 0);
  const cap = mesh(cyl(RG.TURRET_R - 2, RG.TURRET_R - 2, 11, 32), MAT.plasticBlack, { y: 5.5 });
  const win = mesh(box(6, 6, 22), tint(MAT.plasticRed, 0xff3030), { x: RG.TURRET_R - 3, y: 5 });
  lidarHead.add(cap, win);
  body.add(part(group(turretBase, lidarHead), 'Lidar LDS02RR (giai đoạn sau)',
    'Đầu laser quay 5 vòng/s, đo khoảng cách 360°. Cao nhất robot (97 mm) → hay kẹt dưới gầm giường/tủ thấp. Firmware hiện tại CHƯA dùng lidar (để ODROID + ROS 2 làm SLAM sau).'));

  // Bánh xe chủ động
  const wheels = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(0, 35, s * RG.WHEEL_Y);
    const tire = mesh(cyl(35, 35, 22, 28), MAT.rubber, { rx: Math.PI / 2 });
    const hub = mesh(cyl(16, 16, 23, 16), MAT.plasticGrey, { rx: Math.PI / 2 });
    const spoke = mesh(box(50, 6, 23.5), MAT.plasticDark);
    w.add(tire, hub, spoke);
    body.add(part(w, s < 0 ? 'Bánh TRÁI + encoder (RA4/T0CKI)' : 'Bánh PHẢI + encoder (RC0/T1CKI)',
      'Bánh Ø70 mm, cách nhau 235 mm. Encoder Hall 1 kênh: 1000 xung/vòng → 0.22 mm/xung. Không biết chiều quay → PIC gán dấu theo chiều đang xuất PWM.'));
    wheels.push(w);
  }
  const caster = mesh(new THREE.SphereGeometry(10, 12, 8), MAT.plasticDark, { x: 130, y: 10 });
  body.add(caster);

  // Chổi cạnh
  const brushes = [];
  for (const s of [-1, 1]) {
    const b = new THREE.Group();
    b.position.set(118, 5, s * 112);
    b.add(mesh(cyl(14, 14, 6, 16), MAT.plasticDark));
    for (let k = 0; k < 3; k++) {
      const arm = mesh(box(92, 1.5, 3), tint(MAT.plasticYellow, 0xf0c040), { x: 46, ry: 0 });
      const holder = new THREE.Group();
      holder.rotation.y = (k * 2 * Math.PI) / 3;
      holder.add(arm);
      b.add(holder);
    }
    b.userData.dir = s;   // hai chổi quay ngược chiều nhau, gom rác vào giữa
    body.add(part(b, 'Chổi cạnh', 'Động cơ N20 nhỏ, quay ~150 vòng/phút, gạt rác ở góc tường vào miệng hút. Dây/tóc rất hay quấn vào đây.'));
    brushes.push(b);
  }
  // Mắt cảm biến chống rơi
  const cliffEyes = [];
  RG.CLIFF_ANG.forEach((a, i) => {
    const m = mesh(box(14, 3, 10), tint(MAT.plasticBlack, 0x101010), { x: RG.CLIFF_R * Math.cos(a), y: 7, z: -RG.CLIFF_R * Math.sin(a), ry: a });
    m.material = m.material.clone();
    body.add(part(m, `Cảm biến chống rơi ${['#1 trái (AN1)', '#2 trước-trái (AN2)', '#3 trước-phải (AN3)', '#4 phải (AN4)'][i]}`,
      'LED hồng ngoại + phototransistor nhìn xuống sàn. Sàn phản xạ mạnh → hiệu ADC lớn; hố/mép bàn → ánh sáng không dội về → hiệu < 60 → "CLIFF".'));
    cliffEyes.push(m);
  });

  let brushAng = 0, lidarAng = 0;
  const wheelAng = [0, 0];
  return {
    root, bumper, led, lidarHead, brushes, wheels, cliffEyes,
    setBump(bits) {
      const m = bumper.material;
      if (!m.emissive) return;
      m.emissive.setHex(bits ? 0xff2020 : 0x000000);
      m.emissiveIntensity = bits ? 0.8 : 0;
    },
    setLed(hex) {
      const m = led.material;
      if (!m.emissive) return;
      m.color.setHex(hex || 0x333333);
      m.emissive.setHex(hex || 0x000000);
      m.emissiveIntensity = hex ? 1.6 : 0;
    },
    setCliff(mask) {
      cliffEyes.forEach((e, i) => { const m = e.material; if (m.emissive) { m.emissive.setHex((mask >> i) & 1 ? 0xff2020 : 0x000000); m.emissiveIntensity = 1; } });
    },
    /** s = { vL, vR (mm/s), brush (bool), lidar (bool) } — dt là thời gian MÔ PHỎNG đã trôi */
    animate(dt, s) {
      if (s.brush) brushAng += dt * 15;          // ~150 vòng/phút
      if (s.lidar) lidarAng += dt * 2 * Math.PI * 5;
      brushes.forEach((b) => (b.rotation.y = brushAng * b.userData.dir));
      lidarHead.rotation.y = lidarAng;
      wheelAng[0] -= (s.vL / 35) * dt; wheelAng[1] -= (s.vR / 35) * dt;
      wheels[0].rotation.z = wheelAng[0]; wheels[1].rotation.z = wheelAng[1];
    },
  };
}

/** Bóng robot theo ODOMETRY (robot "nghĩ" mình đang ở đây) */
export function buildGhost(THREE) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x4cc2ff, transparent: true, opacity: 0.55, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(RG.R, 5, 6, 48), mat);
  ring.rotation.x = Math.PI / 2;
  const arrowM = new THREE.Mesh(new THREE.BoxGeometry(RG.R, 4, 10), mat);
  arrowM.position.x = RG.R / 2;
  const disk = new THREE.Mesh(new THREE.CircleGeometry(RG.R, 40), new THREE.MeshBasicMaterial({ color: 0x4cc2ff, transparent: true, opacity: 0.12, depthWrite: false }));
  disk.rotation.x = -Math.PI / 2;
  g.add(ring, arrowM, disk);
  g.traverse((o) => { o.raycast = () => {}; });
  return g;
}

/** Đặt tư thế robot 3D theo mô phỏng (kể cả khi đang rơi/lật) */
export function poseRobot(THREE, obj, sim, scratch) {
  if (!poseRobot._s) poseRobot._s = { qy: new THREE.Quaternion(), qt: new THREE.Quaternion(), ax: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) };
  const q = scratch || poseRobot._s;
  q.qy.setFromAxisAngle(q.up, sim.th);
  if (sim.fall) {
    const F = sim.fall;
    // trục lật 3D = up × hướng_đổ  (đổi (ux, uy) 2D → (ux, 0, −uy))
    q.ax.set(-F.uy, 0, -F.ux).normalize();
    q.qt.setFromAxisAngle(q.ax, F.tilt);
    obj.quaternion.copy(q.qt).multiply(q.qy);
    obj.position.set(sim.x, F.zc, -sim.y);
  } else {
    obj.quaternion.copy(q.qy);
    obj.position.set(sim.x, sim.z0 + 50, -sim.y);
  }
}

/** Tia lidar: LineSegments cập nhật được */
export function buildLidarRays(THREE, n) {
  const pos = new Float32Array(n * 6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xff5040, transparent: true, opacity: 0.35, depthWrite: false }));
  const ptsPos = new Float32Array(n * 3);
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(ptsPos, 3));
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xff3020, size: 6, sizeAttenuation: false, depthWrite: false }));
  const g = new THREE.Group();
  g.add(lines, pts);
  lines.raycast = () => {}; pts.raycast = () => {};
  lines.frustumCulled = false; pts.frustumCulled = false;
  const dist = new Float32Array(n);
  return {
    group: g, dist,
    update(sim, maxR, phase) {
      const [ox, oy] = sim.lidarScan(n, maxR, dist, phase);
      const h = sim.z0 + RG.LIDAR_Z;
      for (let i = 0; i < n; i++) {
        const a = phase + (i / n) * Math.PI * 2, d = dist[i];
        const x = ox + Math.cos(a) * d, y = oy + Math.sin(a) * d;
        pos.set([ox, h, -oy, x, h, -y], i * 6);
        if (d < maxR - 1) ptsPos.set([x, h, -y], i * 3); else ptsPos.set([ox, h, -oy], i * 3);
      }
      geo.attributes.position.needsUpdate = true;
      pg.attributes.position.needsUpdate = true;
    },
  };
}

/** Lớp phủ bản đồ nhiệt từ CoverageGrid (DataTexture — không cần document, chạy được trong Node) */
export function buildCoverageOverlay(THREE, cov, y) {
  const tex = new THREE.DataTexture(cov.rgba, cov.W, cov.H, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  const w = cov.W * cov.cell, h = cov.H * cov.cell;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  m.rotation.x = -Math.PI / 2;     // mặt phẳng: +Y cục bộ → −Z thế giới → hàng ảnh tăng theo y 2D
  m.position.set(cov.x0 + w / 2, y, -(cov.y0 + h / 2));
  m.renderOrder = 2;
  m.userData.floor = true;
  let acc = 0;
  return {
    mesh: m,
    update(dt, force = false) {
      acc += dt;
      if ((cov.dirty && acc > 0.15) || force) { tex.needsUpdate = true; cov.dirty = false; acc = 0; }
    },
  };
}

/** Lưới 0.5 m vẽ mờ trên sàn để ước lượng kích thước */
export function buildFloorGrid(THREE, x0, y0, x1, y1, step, h, color = 0x000000) {
  const v = [];
  for (let x = x0; x <= x1 + 1e-6; x += step) v.push(x, h, -y0, x, h, -y1);
  for (let y = y0; y <= y1 + 1e-6; y += step) v.push(x0, h, -y, x1, h, -y);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.08, depthWrite: false }));
  l.raycast = () => {};
  return l;
}

// =============================================================================
// Camera: 'free' tự do · 'top' nhìn thẳng từ trên · 'follow' bám theo robot (vẫn xoay quanh được)
// =============================================================================
export class CameraRig {
  constructor(THREE, viewer, root) {
    this.THREE = THREE; this.viewer = viewer; this.root = root;
    this.mode = 'free';
    this._v = new THREE.Vector3(); this._t = new THREE.Vector3(); this._d = new THREE.Vector3(); this._n = new THREE.Vector3();
    this._q = new THREE.Quaternion();
  }
  /** center2d: [x, y], size: [w, d] (mm) của vùng cần nhìn từ trên */
  set(mode, robotObj, center2d, size, level = 0) {
    this.mode = mode;
    const V = this.viewer;
    if (!V) return;
    const cam = V.camera, ctl = V.controls;
    if (mode === 'top') {
      const c = this.root.localToWorld(this._v.set(center2d[0], level, -center2d[1]));
      const tan = Math.tan((cam.fov * Math.PI) / 360);
      const H = 1.12 * Math.max(size[1] / 2 / tan, size[0] / 2 / (tan * cam.aspect));
      cam.position.set(c.x, c.y + H, c.z + H * 0.02);
      ctl.target.copy(c);
      cam.near = Math.max(1, H / 300); cam.far = H * 10; cam.updateProjectionMatrix();
    } else if (mode === 'follow' && robotObj) {
      const p = robotObj.getWorldPosition(this._t);
      const dir = this._d.set(1, 0, 0).applyQuaternion(robotObj.getWorldQuaternion(this._q));
      dir.y = 0; dir.normalize();
      cam.position.copy(p).addScaledVector(dir, -1100).add(this._v.set(0, 750, 0));
      ctl.target.copy(p);
      cam.near = 5; cam.far = 60000; cam.updateProjectionMatrix();
    } else if (mode === 'free') {
      V.frame();
    }
    ctl.update();
  }
  update(dt, robotObj) {
    const V = this.viewer;
    if (!V || this.mode !== 'follow' || !robotObj) return;
    const p = robotObj.getWorldPosition(this._t);
    const k = 1 - Math.exp(-dt * 5);
    const old = this._v.copy(V.controls.target);
    const nt = this._n.copy(old).lerp(p, k);
    V.camera.position.add(old.sub(nt).negate());   // dời camera đúng bằng quãng target dời
    V.controls.target.copy(nt);
  }
}

// =============================================================================
// Bàn phím lái tay (mũi tên / WASD). active(): chỉ chặn cuộn trang khi đang ở chế độ lái tay.
// =============================================================================
/** Bỏ focus khỏi ô chọn (select) để phím mũi tên lái robot thay vì đổi lựa chọn */
export function releaseFocus() {
  if (typeof document === 'undefined') return;
  const el = document.activeElement;
  if (el && /SELECT|INPUT/.test(el.tagName)) el.blur();
}

export function createKeyboard(active = () => true) {
  const keys = new Set();
  if (typeof window === 'undefined') return { keys, drive: () => [0, 0], dispose() {} };
  const skip = (e) => e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox';
  const down = (e) => {
    if (skip(e)) return;
    keys.add(e.code);
    if (active() && /^(Arrow(Up|Down|Left|Right)|Space)$/.test(e.code)) e.preventDefault();
  };
  const up = (e) => keys.delete(e.code);
  const blur = () => keys.clear();
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  return {
    keys,
    /** → [trái %, phải %] */
    drive() {
      const f = keys.has('ArrowUp') || keys.has('KeyW');
      const b = keys.has('ArrowDown') || keys.has('KeyS');
      const l = keys.has('ArrowLeft') || keys.has('KeyA');
      const r = keys.has('ArrowRight') || keys.has('KeyD');
      const fast = keys.has('ShiftLeft') || keys.has('ShiftRight');
      const v = (f ? 1 : 0) - (b ? 1 : 0), w = (l ? 1 : 0) - (r ? 1 : 0);
      const sp = fast ? 80 : 50;
      if (!v) return [-w * 35, w * 35];                       // xoay tại chỗ
      return [v * sp - w * 20, v * sp + w * 20];
    },
    dispose() {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    },
  };
}

// =============================================================================
// Bấm chuột lên SÀN (vật có userData.floor) → gọi onPick(x2d, y2d). Kéo chuột để xoay thì bỏ qua.
// =============================================================================
export function floorPicker(THREE, viewer, root, onPick) {
  if (!viewer?.renderer?.domElement) return () => {};
  const el = viewer.renderer.domElement;
  const ray = new THREE.Raycaster();
  const m = new THREE.Vector2();
  let downAt = null;
  const pd = (e) => { downAt = [e.clientX, e.clientY]; };
  const pu = (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5 || e.button !== 0) return;
    downAt = null;
    const r = el.getBoundingClientRect();
    m.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(m, viewer.camera);
    const hits = ray.intersectObject(root, true).filter((h) => h.object.visible && h.object.isMesh);
    const h = hits[0];
    if (!h || !h.object.userData.floor) return;
    const p = root.worldToLocal(h.point.clone());
    onPick(p.x, -p.z, e);
  };
  el.addEventListener('pointerdown', pd);
  el.addEventListener('pointerup', pu);
  return () => { el.removeEventListener('pointerdown', pd); el.removeEventListener('pointerup', pu); };
}

/** Màu đèn trạng thái theo chế độ */
export function ledColor(sim) {
  if (sim.status !== 'ok') return 0xff2020;
  if (sim.pic.vbatLow) return 0xff9020;
  if (sim.pic.bumpMask || sim.pic.cliffMask) return 0xff4040;
  const m = sim.brain.mode;
  if (m === 'IDLE') return 0;
  if (m === 'MANUAL') return 0x3080ff;
  return 0x30ff70;
}

/** Chuỗi bit kiểu firmware: 0b0101 */
export const bits = (v, n) => (v >>> 0).toString(2).padStart(n, '0');
export { DEG };
