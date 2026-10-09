// Bộ công cụ dựng hình cho dụng cụ cầm tay (KHÔNG có export default → registry bỏ qua).
// Quy ước mọi dụng cụ: đơn vị mm, gốc ở ĐÁY (y = 0 là mặt bàn khi đặt nằm), trục dài theo Z,
// đầu làm việc hướng −Z (camera nhìn −Z nên khi cầm, đầu dụng cụ chĩa về phía trước).
// grip (theo engine/hands.js): offset = vị trí GỐC mô hình trong khung cầm (= −điểm cầm khi rot = 0), rot = Euler của mô hình
// trong khung cầm (−Z = hướng mũi, đã nghiêng sẵn theo tư thế). tool.tip = đầu làm việc (toạ độ cục bộ).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvasPlane, drawSeg7, text, roundRect, FONT, MONO, hasDoc, qualityLevel } from '../../world/_tex.js';
import { mergeObject } from '../../world/_merge.js';
import { emit, play, toast, itemOf, findUp, labState, AMBIENT_C } from '../../world/_labState.js';

export { THREE, canvasPlane, drawSeg7, text, roundRect, FONT, MONO, hasDoc, qualityLevel, emit, play, toast, itemOf, findUp, labState, AMBIENT_C };

// ---------------------------------------------------------------- vật liệu (bộ đệm theo game)
const MATS = new WeakMap();
const NOGAME = {};
const std = (color, metalness, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
const plastic = (color, roughness = 0.42, clearcoat = 0.25) =>
  new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness, clearcoat, clearcoatRoughness: 0.35 });

export function mats(game) {
  const key = game && typeof game === 'object' ? game : NOGAME;
  let m = MATS.get(key);
  if (m) return m;
  const hi = qualityLevel(game) >= 2;
  const pl = hi ? plastic : (c, r = 0.45) => std(c, 0, r);
  m = {
    chrome: std(0xe2e6ea, 1, 0.12),
    satin: std(0xb7bcc2, 1, 0.3),
    stainless: std(0xc4c9ce, 1, 0.26),
    blackOxide: std(0x25272b, 0.85, 0.42),
    gunmetal: std(0x4a4f56, 0.9, 0.35),
    brass: std(0xd6b05a, 1, 0.28),
    copper: std(0xc8763a, 1, 0.3),
    nickel: std(0x9ea3a8, 1, 0.34),
    tin: std(0xe3e7ea, 1, 0.16),
    aluminum: std(0xcfd4da, 1, 0.34),
    anodBlue: std(0x2f63b8, 0.85, 0.32),
    anodRed: std(0xb8322f, 0.85, 0.32),
    absBlack: pl(0x1b1d21, 0.45),
    absDark: pl(0x2c3036, 0.48),
    absGrey: pl(0x7d838b, 0.5),
    absWhite: pl(0xe9ecee, 0.4),
    absRed: pl(0xb3262b, 0.38),
    absYellow: pl(0xf2b705, 0.42),
    absOrange: pl(0xe8701a, 0.42),
    absBlue: pl(0x2b5fae, 0.4),
    absGreen: pl(0x2f8a4a, 0.42),
    rubber: std(0x1f2124, 0, 0.88),
    rubberBlue: std(0x2c5596, 0, 0.78),
    rubberRed: std(0xc23b2f, 0, 0.75),
    rubberYellow: std(0xf0b400, 0, 0.72),
    rubberOrange: std(0xe0661a, 0, 0.75),
    rubberGreen: std(0x2e8b57, 0, 0.78),
    foam: std(0x2a2d33, 0, 0.95),
    pvcRed: std(0xc8302a, 0, 0.5),
    pvcBlack: std(0x18191b, 0, 0.5),
    pvcGrey: std(0x6b7078, 0, 0.55),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xdfeef5, metalness: 0, roughness: 0.06, transparent: true, opacity: 0.28, depthWrite: false }),
    clearPlastic: new THREE.MeshPhysicalMaterial({ color: 0xf2f6f8, metalness: 0, roughness: 0.12, transparent: true, opacity: 0.38, depthWrite: false, clearcoat: hi ? 0.6 : 0 }),
    smoke: new THREE.MeshPhysicalMaterial({ color: 0x3a3f46, metalness: 0, roughness: 0.15, transparent: true, opacity: 0.6, clearcoat: hi ? 0.5 : 0 }),
    lcdBezel: std(0x101114, 0, 0.3),
    felt: std(0xe8e0cc, 0, 0.98),
    glueStick: new THREE.MeshPhysicalMaterial({ color: 0xf2efe0, roughness: 0.25, transparent: true, opacity: 0.82 }),
    braid: std(0xc8803f, 1, 0.45),
    cork: std(0xb08250, 0, 0.9),
    gold: std(0xf2c14e, 1, 0.22),
  };
  MATS.set(key, m);
  return m;
}

/** Vật liệu riêng cho một instance (đổi màu/phát sáng mà không ảnh hưởng instance khác) */
export const own = (mat) => { const m = mat.clone(); m.userData.own = true; return m; };
export function ledMat(color, on = false) {
  return new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: color, emissiveIntensity: on ? 2.4 : 0, roughness: 0.25, toneMapped: true });
}

// ---------------------------------------------------------------- hình học
export const rbox = (w, h, d, r = 0, seg = 3) => (r > 0 ? new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01)) : new THREE.BoxGeometry(w, h, d));
export const cyl = (rt, rb, h, seg = 24, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
export const lathe = (profile, seg = 32) => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), seg);

/**
 * Tròn xoay theo trục Z: profile [[r, s]] với s = khoảng cách tính từ đuôi (zBack) về phía đầu (−Z).
 * Trục nằm ở độ cao axisY.
 */
export function latheZ(profile, { seg = 32, zBack = 0, axisY = 0 } = {}) {
  const g = lathe(profile, seg);
  g.rotateX(-Math.PI / 2);
  g.translate(0, axisY, zBack);
  return g;
}

/**
 * Tròn xoay có rãnh khía (cán tua vít, núm vặn có khía, đai ốc khía nhám) theo trục Y.
 * profile: [[r, y, w]] — w ∈ [0,1] độ sâu rãnh tại tiết diện đó. flutes: số rãnh. depth: tỉ lệ sâu (0..1 của r).
 */
export function flutedLathe(profile, { flutes = 6, depth = 0.08, seg = 96, sharp = 3 } = {}) {
  const rows = profile.length, cols = seg + 1;
  const pos = new Float32Array(rows * cols * 3), uv = new Float32Array(rows * cols * 2);
  const idx = [];
  for (let i = 0; i < rows; i++) {
    const [r, y, w = 1] = profile[i];
    for (let j = 0; j < cols; j++) {
      const a = (j / seg) * Math.PI * 2;
      const f = Math.pow(Math.abs(Math.cos((a * flutes) / 2)), sharp);   // 1 ở giữa rãnh
      const rr = Math.max(0, r * (1 - depth * w * f));
      const k = i * cols + j;
      pos[k * 3] = Math.sin(a) * rr; pos[k * 3 + 1] = y; pos[k * 3 + 2] = Math.cos(a) * rr;
      uv[k * 2] = j / seg; uv[k * 2 + 1] = i / (rows - 1);
      if (i < rows - 1 && j < seg) { const b = k + cols; idx.push(k, b, k + 1, b, b + 1, k + 1); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
export function flutedLatheZ(profile, opts = {}, { zBack = 0, axisY = 0 } = {}) {
  const g = flutedLathe(profile, opts);
  g.rotateX(-Math.PI / 2);
  g.translate(0, axisY, zBack);
  return g;
}

/** Đùn biên dạng 2D (mặt phẳng XZ nhìn từ trên: pts [[x, z]]) lên theo +Y dày t, có vát mép */
export function extrudeXZ(pts, t, { bevel = 0.6, curveSegments = 8, holes = [], bevelSegments = 2 } = {}) {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, z))));
  const b = Math.min(bevel, t / 2 - 0.05);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, t - 2 * Math.max(0, b)), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments, curveSegments });
  // shape (x, y) → thế giới (x, z); đùn theo +Z → +Y
  g.rotateX(Math.PI / 2);          // (x, y, z) → (x, -z, y)
  g.scale(1, -1, 1);               // đùn hướng lên +Y (lật lại mặt bằng scale âm → sửa winding bên dưới)
  flipWinding(g);
  g.translate(0, Math.max(0, b), 0);
  g.computeVertexNormals();
  return g;
}
/** Đùn biên dạng mặt bên (YZ: pts [[z, y]]) theo trục X, bề rộng w, tâm x = 0 */
export function extrudeYZ(pts, w, { bevel = 0.6, curveSegments = 8, holes = [] } = {}) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([z, y]) => new THREE.Vector2(z, y))));
  const b = Math.min(bevel, w / 2 - 0.05);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, w - 2 * Math.max(0, b)), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments });
  // shape (x=z, y=y), đùn +Z → trục X: xoay quanh Y +90° : (x,y,z) → (z, y, -x)
  g.rotateY(Math.PI / 2);          // (x, y, z) → (z, y, −x)
  g.scale(1, 1, -1);               // → (z, y, x)
  flipWinding(g);
  g.translate(-(w - 2 * Math.max(0, b)) / 2, 0, 0);
  g.computeVertexNormals();
  return g;
}
export function flipWinding(g) {
  if (g.index) {
    const a = g.index.array;
    for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
    g.index.needsUpdate = true;
  } else {
    for (const name of Object.keys(g.attributes)) {
      const at = g.attributes[name], n = at.itemSize, arr = at.array;
      for (let i = 0; i < at.count; i += 3) for (let k = 0; k < n; k++) {
        const t = arr[(i + 1) * n + k]; arr[(i + 1) * n + k] = arr[(i + 2) * n + k]; arr[(i + 2) * n + k] = t;
      }
      at.needsUpdate = true;
    }
  }
  return g;
}

/** Ống theo đường cong qua các điểm */
export function tube(points, r, { seg = 48, radial = 8, closed = false } = {}) {
  const c = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))), closed);
  return new THREE.TubeGeometry(c, seg, r, radial, closed);
}

export function M(geometry, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, cast = true, name } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  if (s !== 1) m.scale.setScalar(s);
  m.castShadow = cast; m.receiveShadow = true;
  if (name) m.name = name;
  return m;
}
export const G = (...children) => { const g = new THREE.Group(); children.forEach((c) => c && g.add(c)); return g; };
export const dyn = (o) => { o.userData.dynamic = true; return o; };

/** Nhãn in (decal) — mặt +Z; xoay theo tham số. Trả về Mesh hoặc null (Node) */
export function decal(w, h, draw, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, px = 12, maxPx = 512, transparent = true, emissive = false } = {}) {
  if (!hasDoc()) return null;
  const m = canvasPlane(w, h, draw, { pxPerMm: px, maxPx, transparent, rough: 0.6, emissive });
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.material.polygonOffset = true; m.material.polygonOffsetFactor = -2;
  m.castShadow = false; m.receiveShadow = true;
  m.userData.keep = true;
  return m;
}

/** Hoàn thiện: gộp tĩnh theo vật liệu, đặt tên, cờ đổ bóng */
export function finish(root, name) {
  root.name = name;
  mergeObject(root);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = o.castShadow !== false; o.receiveShadow = true; } });
  return root;
}

// ---------------------------------------------------------------- tiện ích item
const _v = new THREE.Vector3();
/** Vị trí thế giới của đầu dụng cụ (def.tool.tip) */
export function tipWorld(inst, out = new THREE.Vector3()) {
  const t = inst?.def?.tool?.tip || [0, 0, 0];
  if (inst?.object?.userData?.tipObject) return inst.object.userData.tipObject.getWorldPosition(out);
  out.set(t[0], t[1], t[2]);
  return inst?.object ? inst.object.localToWorld(out) : out;
}
/** Thông tin đích đang nhắm: { object, item, data(key) } */
export function targetOf(ctx) {
  const object = ctx?.target?.isObject3D ? ctx.target : ctx?.target?.object || ctx?.hit?.object || null;
  const item = ctx?.target?.def ? ctx.target : itemOf(object);
  return {
    object, item,
    point: ctx?.hit?.point || null,
    data(key) { const o = findUp(object, key); if (o) return o.userData[key]; return item?.state?.[key] ?? item?.def?.[key]; },
  };
}
export const approach = (x, target, dt, tau) => target + (x - target) * Math.exp(-dt / Math.max(1e-3, tau));
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const tmpV = _v;

/** Màn hình LCD canvas (đồng hồ, thước kẹp…): { mesh, draw(fn) } — mesh mặt +Z */
export function lcdPanel(w, h, { pxPerMm = 10, bg = '#b5c2a3' } = {}) {
  const mesh = canvasPlane(w, h, (g, W, H) => { g.fillStyle = bg; g.fillRect(0, 0, W, H); }, { pxPerMm, maxPx: 512, fallback: bg, rough: 0.35 });
  mesh.castShadow = false;
  mesh.userData.keep = true;
  let last = '';
  return {
    mesh,
    draw(key, fn) { if (key === last) return; last = key; mesh.userData.redraw?.(fn); },
  };
}

/**
 * Kìm (2 nửa xoay quanh chốt Y tại gốc): nửa A = má phải phía trước (−Z, x ≥ 0) + cán trái phía sau (x ≤ 0).
 * head: đa giác [[x, z]] của má + vấu (nửa A), handle: đường tâm cán [[x, z]] (nửa A), grip từ chỉ số gripFrom.
 * Trả về { root, a, b, setOpen(k∈[0,1]) } — root đặt sao cho đáy y = 0.
 */
export function makePliers(game, { head, handle, gripFrom = 1, T = 8, steelW = 7, gripW = 15, gripT = 13, maxAngle = 0.32,
  steel, gripMat, gripMat2 = null, bossR = 9, extras = null } = {}) {
  const K = mats(game);
  steel = steel || K.blackOxide;
  gripMat = gripMat || K.rubberRed;
  const y0 = (gripT - T) / 2 + 0.2;
  const half = (sign) => {
    const g = new THREE.Group();
    const mx = (p) => [p[0] * sign, p[1]];
    const hp = head.map(mx);
    if (sign < 0) hp.reverse();
    g.add(M(extrudeXZ(hp, T, { bevel: 0.8 }), steel, { y: y0 }));
    // vấu tròn quanh chốt (nửa dày: A ở dưới, B ở trên)
    g.add(M(cyl(bossR, bossR, T / 2, 32), steel, { y: y0 + (sign > 0 ? T / 4 : (3 * T) / 4) }));
    // lõi thép cán + vỏ bọc
    const hl = handle.map(mx);
    const curve = new THREE.CatmullRomCurve3(hl.map(([x, z]) => new THREE.Vector3(x, y0 + T / 2, z)));
    g.add(M(new THREE.TubeGeometry(curve, 40, steelW / 2, 8, false), steel));
    const gp = hl.slice(gripFrom);
    if (gp.length >= 2) {
      const gc = new THREE.CatmullRomCurve3(gp.map(([x, z]) => new THREE.Vector3(x, y0 + T / 2, z)));
      const n = 48, pts = gc.getSpacedPoints(n);
      const outl = [], inl = [];
      for (let i = 0; i <= n; i++) {
        const p = pts[i], q = pts[Math.min(n, i + 1)], o = pts[Math.max(0, i - 1)];
        const tx = q.x - o.x, tz = q.z - o.z, L = Math.hypot(tx, tz) || 1;
        const nx = -tz / L, nz = tx / L;
        const t = i / n;
        const w = (gripW / 2) * (0.82 + 0.18 * Math.sin(Math.PI * Math.min(1, t * 1.15))) * (t > 0.96 ? 0.85 : 1);
        outl.push([p.x + nx * w, p.z + nz * w]); inl.push([p.x - nx * w, p.z - nz * w]);
      }
      const poly = [...outl, ...inl.reverse()];
      let area = 0;
      for (let i = 0; i < poly.length; i++) { const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % poly.length]; area += x1 * z2 - x2 * z1; }
      if (area < 0) poly.reverse();
      const grip = M(extrudeXZ(poly, gripT, { bevel: 3.2, curveSegments: 4, bevelSegments: 3 }), gripMat, { y: 0.2 });
      g.add(grip);
      if (gripMat2) {   // vùng mềm 2 màu ở giữa cán
        const mid = poly.length / 2;
        const sub = [...outl.slice(10, 38)];
        const sub2 = inl.slice().reverse().slice(10, 38).reverse();
        const p2 = [...sub, ...sub2];
        let a2 = 0;
        for (let i = 0; i < p2.length; i++) { const [x1, z1] = p2[i], [x2, z2] = p2[(i + 1) % p2.length]; a2 += x1 * z2 - x2 * z1; }
        if (a2 < 0) p2.reverse();
        if (mid > 10) g.add(M(extrudeXZ(p2.map(([x, z]) => [x * 1.0, z]), gripT + 1.2, { bevel: 3.6, curveSegments: 4, bevelSegments: 3 }), gripMat2, { y: -0.4 }));
      }
    }
    return g;
  };
  const a = half(1), b = half(-1);
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.add(a, b);
  root.add(pivot);
  // chốt + đai ốc
  pivot.add(M(cyl(4.2, 4.2, T + 1.6, 20), K.satin, { y: y0 + T / 2 }));
  pivot.add(M(cyl(2.4, 2.4, 0.6, 12), K.blackOxide, { y: y0 + T + 0.9 }));
  if (extras) extras(pivot, { a, b, y0, T, K });
  a.userData.dynamic = true; b.userData.dynamic = true;
  let open = 0;
  return {
    root, a, b, y0,
    setOpen(k) {
      open = clamp(k, 0, 1);
      a.rotation.y = -open * maxAngle / 2;
      b.rotation.y = open * maxAngle / 2;
    },
    get open() { return open; },
  };
}

/** Gộp tĩnh bên trong từng nửa kìm (giữ nửa là nhóm động) */
export function finishPliers(p, name) {
  for (const h of [p.a, p.b]) { h.userData.dynamic = false; mergeObject(h); h.userData.dynamic = true; }
  p.root.name = name;
  return p.root;
}
