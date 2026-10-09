// Hàm dựng hình dùng chung. Đơn vị: mm. Trục Y hướng lên.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { MAT } from './materials.js';

/** Gắn thông tin "bộ phận" cho một vật thể: rê chuột sẽ hiện tên + mô tả, bấm vào sẽ hiện ở bảng bên phải */
export function part(obj, name, desc = '') {
  obj.userData.part = { name, desc };
  return obj;
}

export function mesh(geometry, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, castShadow = true } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = castShadow;
  m.receiveShadow = true;
  return m;
}

export function group(...children) {
  const g = new THREE.Group();
  children.forEach((c) => c && g.add(c));
  return g;
}

export const box = (w, h, d, r = 0, seg = 3) =>
  r > 0 ? new RoundedBoxGeometry(w, h, d, seg, r) : new THREE.BoxGeometry(w, h, d);

/** Trụ đứng theo trục Y */
export const cyl = (rTop, rBot, h, seg = 32, open = false) => new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open);

/** Vật thể tròn xoay từ biên dạng [[r, y], ...] (giống tiện trên máy tiện) */
export function lathe(profile, seg = 48) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

/** Ren xoắn: ống nhỏ chạy theo đường xoắn ốc quanh trục Y, từ y0 xuống y0 - turns*pitch */
export function helixThread({ radius, pitch, turns, tube, y0 = 0, segPerTurn = 48 }) {
  class Helix extends THREE.Curve {
    getPoint(t, target = new THREE.Vector3()) {
      const a = t * turns * Math.PI * 2;
      return target.set(Math.cos(a) * radius, y0 - t * turns * pitch, Math.sin(a) * radius);
    }
  }
  return new THREE.TubeGeometry(new Helix(), Math.max(16, Math.round(turns * segPerTurn)), tube, 6, false);
}

/** Bánh răng thẳng (đùn từ biên dạng 2D), nằm trong mặt phẳng XZ, dày theo Y */
export function gearGeometry({ teeth = 12, module: m = 1, width = 4, bore = 1 }) {
  const rp = (m * teeth) / 2;          // bán kính vòng chia
  const ra = rp + m;                   // đỉnh răng
  const rf = rp - 1.25 * m;            // chân răng
  const shape = new THREE.Shape();
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const pts = [
      [rf, a], [ra, a + step * 0.18], [ra, a + step * 0.42], [rf, a + step * 0.6],
    ];
    pts.forEach(([r, ang], k) => {
      const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
      if (i === 0 && k === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    });
    const a2 = a + step;
    shape.absarc(0, 0, rf, a + step * 0.6, a2, false);
  }
  if (bore > 0) {
    const h = new THREE.Path();
    h.absarc(0, 0, bore, 0, Math.PI * 2, true);
    shape.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 6 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -width / 2, 0);
  g.computeVertexNormals();
  return g;
}

/** Bo mạch in hình chữ nhật bo góc (mặt trên ở y = 0) */
export function pcb(w, d, { t = 1.6, r = 1, mat = MAT.pcbGreen } = {}) {
  const m = mesh(box(w, t, d, Math.min(r, t / 2 - 0.01)), mat, { y: -t / 2 });
  return part(m, 'Bo mạch in (PCB)', `Tấm sợi thủy tinh FR-4 dày ${t} mm, phủ đồng làm đường dẫn điện, phủ sơn xanh chống hàn.`);
}

/** Chân header 2.54 mm: n chân thẳng hàng theo X, gốc ở (0,0,0) mặt PCB */
export function pinHeader(n, { pitch = 2.54, height = 8.5, below = 3, mat = MAT.gold } = {}) {
  const g = new THREE.Group();
  const base = mesh(box(n * pitch, 2.5, 2.5), MAT.plasticBlack, { x: ((n - 1) * pitch) / 2, y: 1.25 });
  g.add(base);
  const pinGeo = box(0.64, height + below, 0.64);
  for (let i = 0; i < n; i++) g.add(mesh(pinGeo, mat, { x: i * pitch, y: (height - below) / 2 }));
  return part(g, `Hàng rào chân ${n} pin`, 'Header bước 2.54 mm — chuẩn phổ biến nhất cho dây cắm/breadboard.');
}

/**
 * Vỏ IC DIP (2 hàng chân xuyên lỗ). Trả về { group, pins[] } — pins[i] là Mesh chân số i+1.
 * Đánh số chân chuẩn: chân 1 cạnh khấc, đếm ngược chiều kim đồng hồ nhìn từ trên.
 */
export function dipPackage(nPins, { pitch = 2.54, rowSpacing = 15.24, bodyH = 3.6, standoff = 0.8, label = '' } = {}) {
  const half = nPins / 2;
  const len = half * pitch + 1.0;
  const width = rowSpacing - 2.0;
  const g = new THREE.Group();
  const body = mesh(box(len, bodyH, width, 0.6), MAT.icBody, { y: standoff + bodyH / 2 });
  g.add(body);
  // khấc đánh dấu đầu chân 1
  const notch = mesh(cyl(1.2, 1.2, 0.4, 24), MAT.plasticDark, { x: -len / 2 + 1.6, y: standoff + bodyH + 0.01 });
  notch.scale.set(1, 1, 1);
  g.add(notch);
  const dot = mesh(cyl(0.6, 0.6, 0.12, 16), MAT.plasticDark, { x: -len / 2 + 2.2, y: standoff + bodyH + 0.02, z: width / 2 - 2.0 });
  g.add(dot);
  const pins = [];
  // chân: phần vai rộng + phần chân hẹp đi xuống
  const shoulder = box(1.5, 0.25, 1.4);
  const leg = box(0.5, 3.3, 0.25);
  for (let i = 0; i < nPins; i++) {
    const p = new THREE.Group();
    let x, z;
    if (i < half) { x = -((half - 1) * pitch) / 2 + i * pitch; z = rowSpacing / 2; }
    else { x = ((half - 1) * pitch) / 2 - (i - half) * pitch; z = -rowSpacing / 2; }
    const sh = mesh(shoulder, MAT.tin, { y: standoff + 1.2, z: z > 0 ? -0.7 : 0.7 });
    const lg = mesh(leg, MAT.tin, { y: standoff + 1.2 - 1.65 });
    p.add(sh, lg);
    p.position.set(x, 0, z);
    p.userData.pinNumber = i + 1;
    g.add(p);
    pins.push(p);
  }
  return { group: g, pins, body, len, width };
}

/** Linh kiện SMD dạng hộp nhỏ (IC SOIC/QFN đơn giản hóa) */
export function smdChip(w, d, h = 1, mat = MAT.icBody) {
  return mesh(box(w, h, d, Math.min(0.2, h / 3)), mat, { y: h / 2 });
}

/** Dây dẫn mềm qua các điểm (mm) */
export function wire(points, { radius = 0.5, color = 0xd23b3b } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  return mesh(new THREE.TubeGeometry(curve, Math.max(20, points.length * 12), radius, 8, false), m);
}

/** Mũi tên chỉ hướng (dòng điện, luồng khí, lực…) */
export function arrow(from, to, color = 0x4cc2ff, headLen = null) {
  const dir = new THREE.Vector3(...to).sub(new THREE.Vector3(...from));
  const len = dir.length();
  return new THREE.ArrowHelper(dir.normalize(), new THREE.Vector3(...from), len, color, headLen ?? len * 0.25, (headLen ?? len * 0.25) * 0.6);
}

/**
 * Bật "cắt bổ" cho vật thể: mọi vật liệu bên trong được clone và gắn mặt phẳng cắt.
 * Trả về hàm setEnabled(bool). Mặt phẳng mặc định cắt bỏ nửa z > 0 (nhìn thấy ruột từ phía trước).
 */
export function makeCutaway(object, plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)) {
  const mats = [];
  object.traverse((o) => {
    if (o.isMesh && !o.userData.noCut) {
      o.material = o.material.clone();
      o.material.side = THREE.DoubleSide;
      mats.push(o.material);
    }
  });
  return (enabled) => {
    mats.forEach((m) => { m.clippingPlanes = enabled ? [plane] : null; m.needsUpdate = true; });
  };
}

/** Lò xo xoắn (trục Y) */
export function springGeometry({ radius = 3, wire: w = 0.4, turns = 8, length = 15 }) {
  return helixThread({ radius, pitch: length / turns, turns, tube: w, y0: length / 2 });
}

/**
 * Khối hình quạt vành khuyên (nam châm cung, lá cổ góp, vấu cực…), đùn theo trục Y, tâm y = 0.
 * Góc a0..a1 (rad) đo cùng chiều rotation.y của three.js (từ +X quay về −Z).
 */
export function arcSector(rIn, rOut, a0, a1, len, seg = 24) {
  const s = new THREE.Shape();
  s.absarc(0, 0, rOut, a0, a1, false);
  s.lineTo(Math.cos(a1) * rIn, Math.sin(a1) * rIn);
  s.absarc(0, 0, rIn, a1, a0, true);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false, curveSegments: seg });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -len / 2, 0);
  g.computeVertexNormals();
  return g;
}

/** Hiệu góc quấn về [0, π] */
export function angDist(a, b) {
  let d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
}
