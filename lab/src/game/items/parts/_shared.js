// =============================================================================
// _shared.js — Thư viện dùng chung cho mọi linh kiện trong items/parts/*.js
// (KHÔNG có export default → registry bỏ qua file này).
//
// Quy ước: đơn vị mm, trục Y lên, gốc toạ độ ở ĐÁY-GIỮA vật (linh kiện có chân: đầu chân dài nhất ở y = 0).
// Mọi geometry / material / texture được cache cấp module → nhiều bản sao cùng loại dùng chung bộ nhớ GPU.
// Canvas (chữ in, silkscreen) chỉ dùng khi có `document` (trình duyệt); trong Node trả về null / vật liệu trơn.
//
// Mở rộng hợp đồng §7 (GAME_API.md) — mọi def linh kiện có thêm:
//   insertInto: ['dip40','bb-span',…]     loại khe mà linh kiện cắm vừa
//   mount: { seatY, pitch?, rowSpacing? }   độ cao mặt tựa (mặt board) so với gốc — pose khi cắm = khe + (0, −seatY, 0)
//   footprint: [[x,z],…]                    toạ độ (x,z) các chân tại mặt tựa — để kiểm tra lỗ board/breadboard
//   orientationKey: { pin, axis, sign, mark } chân/dấu định hướng — engine & khe dùng để phát hiện cắm ngược
//   getPins(instance)                       chân hiện tại (sau khi bẻ / cắt chân); def.pins = trạng thái mặc định
//   leadBendable, bendLeads(inst, n), trimLeads(inst, mm)  (linh kiện có chân dây)
// =============================================================================
import * as THREE from 'three';
import { MAT } from '../../../core/materials.js';
import * as geom from '../../../core/geom.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export { THREE, MAT, geom, mergeGeometries };

export const HAS_DOC = typeof document !== 'undefined' && typeof document.createElement === 'function';
export const PITCH = 2.54;
const DEG = Math.PI / 180;
export { DEG };

// ----------------------------------------------------------------------------- cache
const _cache = new Map();
export function cached(key, make) {
  let v = _cache.get(key);
  if (v === undefined) { v = make(); _cache.set(key, v); }
  return v;
}

/** Mức chất lượng ('low'|'medium'|'high'|'ultra') từ game (chấp nhận cả stub { quality:{ preset:'high' } }) */
export function qualityOf(game) {
  const q = game?.quality;
  if (!q) return 'high';
  if (typeof q.preset === 'string') return q.preset;
  if (q.settings?.preset) return q.settings.preset;
  return 'high';
}
export const isHigh = (game) => { const q = qualityOf(game); return q === 'high' || q === 'ultra'; };

// ----------------------------------------------------------------------------- vật liệu PBR
const std = (color, metalness, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
const mask = (color, rough = 0.42) => new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: rough, clearcoat: 0.55, clearcoatRoughness: 0.35 });

export const PM = {
  lead: std(0xdde1e4, 1.0, 0.27),            // chân mạ thiếc (sáng, hơi xước)
  leadDark: std(0xa9afb5, 1.0, 0.4),         // chân thép mạ niken / cũ hơn
  enig: std(0xe9bb5f, 1.0, 0.2),             // pad mạ vàng ENIG
  gold: std(0xf0c25a, 1.0, 0.18),            // tiếp điểm mạ vàng (header cái, đế IC)
  hasl: std(0xd3d8dc, 1.0, 0.3),             // pad phủ thiếc HASL
  solder: std(0xe6e9eb, 1.0, 0.16),          // mối hàn bóng
  copper: std(0xcf7d45, 1.0, 0.3),
  enamel: std(0xb5562a, 0.9, 0.28),          // dây đồng tráng men (cuộn cảm)
  fr4: std(0xcfc28c, 0.0, 0.78),             // cạnh sợi thuỷ tinh FR-4 (vàng nhạt)
  fr4Raw: std(0xd8cc98, 0.0, 0.7),
  maskGreen: mask(0x1c6b3a),
  maskGreenLight: mask(0x2f8a4c),
  maskBlue: mask(0x1a4f9c),
  maskBlack: mask(0x16181b, 0.38),
  maskRed: mask(0xa31f24),
  maskPurple: mask(0x4a2a7a),
  maskTeal: mask(0x0d6b6b),
  epoxy: std(0x1b1b1d, 0.0, 0.62),           // vỏ nhựa epoxy IC
  epoxyMark: std(0x0f0f10, 0.0, 0.85),       // chấm chân 1 / vết đẩy khuôn (lõm, nhám hơn)
  epoxyGloss: std(0x242427, 0.0, 0.32),
  hole: new THREE.MeshBasicMaterial({ color: 0x050606 }),
  holeGrey: std(0x2a2c2e, 0.0, 0.9),
  silk: std(0xf3f3ee, 0.0, 0.65),
  silkYellow: std(0xf2e9a0, 0.0, 0.65),
  pbtBlack: std(0x1c1d20, 0.0, 0.5),         // nhựa header đen
  nylonCream: std(0xede4c8, 0.0, 0.55),      // nhựa JST-XH tự nhiên
  nylonWhite: std(0xf4f2ea, 0.0, 0.5),
  nylonYellow: std(0xf3c21a, 0.0, 0.42),     // XT60
  absWhite: std(0xf2f1ec, 0.0, 0.55),        // breadboard
  absGrey: std(0x8f949b, 0.0, 0.55),
  absDark: std(0x2d3036, 0.0, 0.5),
  plasticBlue: std(0x2860b8, 0.0, 0.45),
  plasticGreen: std(0x2d8a4a, 0.0, 0.48),
  plasticRed: std(0xc52a2a, 0.0, 0.45),
  nickel: std(0xc5c9cc, 1.0, 0.33),
  steel: std(0xb9bfc6, 1.0, 0.3),
  steelBrushed: std(0xc8cdd2, 1.0, 0.38),
  aluminum: std(0xd3d7dc, 1.0, 0.34),
  aluAnodBlack: std(0x23252a, 0.6, 0.45),
  brass: std(0xd6aa45, 1.0, 0.3),
  rubber: std(0x222222, 0.0, 0.92),
  rubberGrey: std(0x4b4d50, 0.0, 0.9),
  ceramic: std(0xe9e4d6, 0.0, 0.55),
  ceramicTan: std(0xb48a5a, 0.0, 0.6),       // tụ MLCC SMD (nâu nhạt)
  chipR: std(0x161616, 0.0, 0.55),           // điện trở SMD mặt đen
  ferrite: std(0x3f3f43, 0.2, 0.7),
  glassDark: new THREE.MeshPhysicalMaterial({ color: 0x0b0d10, metalness: 0, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.05 }),
  lensGlass: new THREE.MeshPhysicalMaterial({ color: 0x223040, metalness: 0.1, roughness: 0.04, clearcoat: 1 }),
  kapton: std(0xd98a1e, 0.0, 0.35, { transparent: true, opacity: 0.85 }),
  fishPaper: std(0xe8e1cc, 0.0, 0.85),
  wireRed: std(0xc8211f, 0.0, 0.5),
  wireBlack: std(0x1a1a1a, 0.0, 0.5),
  wireYellow: std(0xe6c21c, 0.0, 0.5),
  wireBlue: std(0x2457c5, 0.0, 0.5),
  wireGreen: std(0x22914a, 0.0, 0.5),
  wireWhite: std(0xe8e8e8, 0.0, 0.5),
  wireOrange: std(0xe5761c, 0.0, 0.5),
  wireBrown: std(0x6b3d1d, 0.0, 0.5),
  wireGrey: std(0x8a8d90, 0.0, 0.5),
  wirePurple: std(0x7a3fb5, 0.0, 0.5),
};

/** Vật liệu màu tuỳ ý (cache theo màu/độ nhám) */
export function colorMat(color, { metal = 0, rough = 0.5, opacity = 1, emissive = 0, ei = 0 } = {}) {
  return cached(`cm:${color}:${metal}:${rough}:${opacity}:${emissive}:${ei}`, () => std(color, metal, rough, {
    transparent: opacity < 1, opacity, emissive, emissiveIntensity: ei,
  }));
}
/** Vật liệu riêng cho từng bản sao (đổi màu / phát sáng theo trạng thái) */
export function ownMat(base, patch = {}) {
  const m = base.clone();
  for (const [k, v] of Object.entries(patch)) {
    if (m[k] && m[k].isColor) m[k].set(v); else m[k] = v;
  }
  return m;
}

const WIRE_COLORS = { red: 'wireRed', black: 'wireBlack', yellow: 'wireYellow', blue: 'wireBlue', green: 'wireGreen', white: 'wireWhite', orange: 'wireOrange', brown: 'wireBrown', grey: 'wireGrey', purple: 'wirePurple' };
export const wireMat = (c) => PM[WIRE_COLORS[c]] || PM.wireGrey;

// ----------------------------------------------------------------------------- canvas / chữ in
/** CanvasTexture cache theo key; null khi không có document */
export function canvasTex(key, w, h, draw) {
  if (!HAS_DOC) return null;
  return cached(`tex:${key}`, () => {
    const c = document.createElement('canvas');
    c.width = Math.max(4, Math.min(2048, Math.round(w)));
    c.height = Math.max(4, Math.min(2048, Math.round(h)));
    const g = c.getContext('2d');
    if (!g) return null;
    draw(g, c.width, c.height);
    const t = new THREE.CanvasTexture(c);
    if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
}

/** Vẽ chữ */
export function text(g, s, x, y, px, { color = '#fff', align = 'center', weight = '700', font = 'Arial, Helvetica, sans-serif', baseline = 'middle', maxW, italic = false } = {}) {
  g.fillStyle = color;
  g.font = `${italic ? 'italic ' : ''}${weight} ${Math.max(1, Math.round(px))}px ${font}`;
  g.textAlign = align;
  g.textBaseline = baseline;
  if (maxW) g.fillText(String(s), x, y, maxW); else g.fillText(String(s), x, y);
}

/**
 * Tấm "in" phẳng (chữ laser trên IC, silkscreen PCB…) nằm ngang hướng +Y.
 * draw(g, W, H, s) — s = px/mm. Trả về Mesh hoặc null (Node).
 */
export function decal(key, w, d, draw, { pxPerMm = 24, x = 0, y = 0, z = 0, rx = -Math.PI / 2, ry = 0, rz = 0, rough = 0.6, metal = 0, opacity = 1 } = {}) {
  if (!HAS_DOC) return null;
  const s = Math.min(pxPerMm, 2048 / Math.max(w, d));
  const tex = canvasTex(key, w * s, d * s, (g, W, H) => draw(g, W, H, W / w));
  if (!tex) return null;
  const mat = cached(`decalmat:${key}`, () => new THREE.MeshStandardMaterial({
    map: tex, transparent: true, opacity, roughness: rough, metalness: metal, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  }));
  const geo = cached(`plane:${w}:${d}`, () => new THREE.PlaneGeometry(w, d));
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.renderOrder = 2;
  m.castShadow = false;
  m.receiveShadow = true;
  m.userData.decal = true;
  m.name = `decal:${key}`;          // tên để def.cadOptions.keep giữ chữ in trên mô hình CAD (vd. 'decal:hc49*')
  return m;
}

// ----------------------------------------------------------------------------- hình học
export function tf({ x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}, out = new THREE.Matrix4()) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
  return out.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
}

/** Hộp (cache) — bo góc r>0 */
export const gBox = (w, h, d, r = 0, seg = 2) => cached(`box:${w}:${h}:${d}:${r}:${seg}`, () => geom.box(w, h, d, r, seg));
/** Trụ trục Y (cache) */
export const gCyl = (rt, rb, h, seg = 20, open = false) => cached(`cyl:${rt}:${rb}:${h}:${seg}:${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
export const gSphere = (r, ws = 16, hs = 10, t0 = 0, tl = Math.PI) => cached(`sph:${r}:${ws}:${hs}:${t0}:${tl}`, () => new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, t0, tl));
export const gLathe = (key, profile, seg = 32) => cached(`lathe:${key}:${seg}`, () => geom.lathe(profile, seg));
export const gRing = (ri, ro, seg = 16) => cached(`ring:${ri}:${ro}:${seg}`, () => { const g = new THREE.RingGeometry(ri, ro, seg); g.rotateX(-Math.PI / 2); return g; });
export const gDisc = (r, seg = 16) => cached(`disc:${r}:${seg}`, () => { const g = new THREE.CircleGeometry(r, seg); g.rotateX(-Math.PI / 2); return g; });
export const gTorus = (R, r, rs = 8, ts = 24, arc = Math.PI * 2) => cached(`tor:${R}:${r}:${rs}:${ts}:${arc}`, () => new THREE.TorusGeometry(R, r, rs, ts, arc));

/** Hình chữ nhật bo góc (Shape trong mặt phẳng x/y) tâm (cx, cy) */
export function roundRectShape(w, d, r = 0, cx = 0, cy = 0, path = new THREE.Shape()) {
  const x0 = cx - w / 2, y0 = cy - d / 2;
  r = Math.min(r, w / 2, d / 2);
  if (r <= 0) {
    path.moveTo(x0, y0); path.lineTo(x0 + w, y0); path.lineTo(x0 + w, y0 + d); path.lineTo(x0, y0 + d); path.lineTo(x0, y0);
    return path;
  }
  path.moveTo(x0 + r, y0);
  path.lineTo(x0 + w - r, y0); path.absarc(x0 + w - r, y0 + r, r, -Math.PI / 2, 0, false);
  path.lineTo(x0 + w, y0 + d - r); path.absarc(x0 + w - r, y0 + d - r, r, 0, Math.PI / 2, false);
  path.lineTo(x0 + r, y0 + d); path.absarc(x0 + r, y0 + d - r, r, Math.PI / 2, Math.PI, false);
  path.lineTo(x0, y0 + r); path.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
  return path;
}
export function circlePath(cx, cy, r, path = new THREE.Path()) { path.absarc(cx, cy, r, 0, Math.PI * 2, true); return path; }

/**
 * Đùn Shape (vẽ trong mặt phẳng XZ: điểm shape (x, s) ↦ (x, ·, −s)) lên theo +Y từ y0, cao h.
 * bevel: vát cạnh (kiểu vỏ đúc). Trả geometry có 2 nhóm: 0 = mặt trên/dưới, 1 = thành bên.
 */
export function extrudeY(shape, h, { bevel = 0, bevelSeg = 1, y0 = 0, curveSeg = 8 } = {}) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, h - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: bevelSeg, curveSegments: curveSeg,
  });
  g.translate(0, 0, bevel);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  g.computeVertexNormals();
  return g;
}

/** Hộp có đáy nhỏ hơn đỉnh (côn) — dùng cho vai chân IC, thân vát */
export function taperBox(wTop, wBot, h, dTop, dBot = dTop) {
  return cached(`taper:${wTop}:${wBot}:${h}:${dTop}:${dBot}`, () => {
    const g = new THREE.BoxGeometry(1, h, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const top = p.getY(i) > 0;
      p.setX(i, p.getX(i) * (top ? wTop : wBot));
      p.setZ(i, p.getZ(i) * (top ? dTop : dBot));
    }
    g.computeVertexNormals();
    return g;
  });
}

/** Bo tròn góc một đường gấp khúc (điểm Vector3) — bán kính uốn r */
export function roundPolyline(pts, r = 0.6, seg = 5) {
  const P = pts.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(...p)));
  if (P.length < 3 || r <= 0) return P;
  const out = [P[0]];
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], b = P[i], c = P[i + 1];
    const d1 = b.clone().sub(a), d2 = c.clone().sub(b);
    const l1 = d1.length(), l2 = d2.length();
    if (l1 < 1e-6 || l2 < 1e-6) continue;
    d1.divideScalar(l1); d2.divideScalar(l2);
    if (d1.dot(d2) > 0.9999) { out.push(b); continue; }
    const rr = Math.min(r, l1 * 0.45, l2 * 0.45);
    const p0 = b.clone().addScaledVector(d1, -rr), p1 = b.clone().addScaledVector(d2, rr);
    for (let k = 0; k <= seg; k++) {
      const t = k / seg, u = 1 - t;
      out.push(new THREE.Vector3().addScaledVector(p0, u * u).addScaledVector(b, 2 * u * t).addScaledVector(p1, t * t));
    }
  }
  out.push(P[P.length - 1]);
  return out;
}

/**
 * Ống tròn/vuông đi qua các điểm (khung song song — không xoắn), có nắp 2 đầu.
 * square: tiết diện vuông (chân LED, header). Trả BufferGeometry chỉ mục.
 */
export function tubeGeo(points, radius, { radial = 6, square = false, caps = true, radii = null } = {}) {
  const P = points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p)));
  const n = P.length;
  const T = [];
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
    T.push(b.clone().sub(a).normalize());
  }
  // pháp tuyến ban đầu
  const t0 = T[0];
  let N = Math.abs(t0.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  N = N.sub(t0.clone().multiplyScalar(N.dot(t0))).normalize();
  const Ns = [N.clone()];
  for (let i = 1; i < n; i++) {
    const axis = new THREE.Vector3().crossVectors(T[i - 1], T[i]);
    const s = axis.length();
    if (s > 1e-6) {
      axis.divideScalar(s);
      const ang = Math.acos(THREE.MathUtils.clamp(T[i - 1].dot(T[i]), -1, 1));
      N.applyAxisAngle(axis, ang);
    }
    Ns.push(N.clone());
  }
  const pos = [], nor = [], uv = [], idx = [];
  const rs = radial;
  const off = square ? Math.PI / 4 : 0;
  const rad = square ? radius * Math.SQRT2 : radius;
  for (let i = 0; i < n; i++) {
    const B = new THREE.Vector3().crossVectors(T[i], Ns[i]).normalize();
    const R = radii ? radii[i] : rad;
    for (let j = 0; j <= rs; j++) {
      const a = (j / rs) * Math.PI * 2 + off;
      const dx = Math.cos(a), dy = Math.sin(a);
      const nx = Ns[i].x * dx + B.x * dy, ny = Ns[i].y * dx + B.y * dy, nz = Ns[i].z * dx + B.z * dy;
      pos.push(P[i].x + nx * R, P[i].y + ny * R, P[i].z + nz * R);
      nor.push(nx, ny, nz);
      uv.push(j / rs, i / (n - 1));
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < rs; j++) {
    const a = i * (rs + 1) + j, b = a + rs + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  if (caps) {
    for (const [i, sgn] of [[0, -1], [n - 1, 1]]) {
      const c = pos.length / 3;
      pos.push(P[i].x, P[i].y, P[i].z); nor.push(T[i].x * sgn, T[i].y * sgn, T[i].z * sgn); uv.push(0.5, 0.5);
      const base = pos.length / 3;
      for (let j = 0; j <= rs; j++) {
        const k = i * (rs + 1) + j;
        pos.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]); nor.push(T[i].x * sgn, T[i].y * sgn, T[i].z * sgn); uv.push(0.5, 0.5);
      }
      for (let j = 0; j < rs; j++) { if (sgn > 0) idx.push(c, base + j, base + j + 1); else idx.push(c, base + j + 1, base + j); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Chuẩn hoá geometry để gộp: không chỉ mục, chỉ position/normal/uv */
function normGeo(geo, m) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.clearGroups();
  if (m) g.applyMatrix4(m);
  return g;
}

// ----------------------------------------------------------------------------- gộp tĩnh (batch)
/**
 * Dựng phần TĨNH của linh kiện 1 lần, gộp theo vật liệu (1 draw call / vật liệu), cache theo key;
 * mỗi lần gọi trả Group mới dùng chung geometry.
 *   fill(B):  B.add(geo, mat, {x,y,z,rx,ry,rz,sx,sy,sz} | Matrix4, { shadow })
 *             B.inst(geo, mat, [Matrix4…], { shadow })   → InstancedMesh (chân, pad, lỗ)
 *             B.mesh(meshOrGroup)                         → giữ nguyên (đối tượng riêng, ví dụ decal)
 *             B.group(t) → B con có phép biến đổi lồng (cùng bucket)
 */
export function staticParts(key, fill) {
  const spec = cached(`static:${key}`, () => {
    const buckets = new Map();
    const insts = [];
    const extras = [];
    const mk = (parentM) => ({
      // name (tuỳ chọn): gộp vào mesh RIÊNG mang tên đó (vd. để def.cadOptions.keep giữ phần này hiện cạnh mô hình CAD)
      add(geo, mat, t = {}, { shadow = true, name = null } = {}) {
        if (!geo || !mat) return this;
        const m = t.isMatrix4 ? t.clone() : tf(t);
        if (parentM) m.premultiply(parentM);
        const k = mat.uuid + (shadow ? 's' : 'n') + (name ? `:${name}` : '');
        if (!buckets.has(k)) buckets.set(k, { mat, shadow, name, list: [] });
        buckets.get(k).list.push(normGeo(geo, m));
        return this;
      },
      inst(geo, mat, matrices, { shadow = false } = {}) {
        if (!matrices.length) return this;
        const arr = new Float32Array(matrices.length * 16);
        matrices.forEach((m0, i) => { const m = m0.clone(); if (parentM) m.premultiply(parentM); m.toArray(arr, i * 16); });
        insts.push({ geo, mat, arr, count: matrices.length, shadow });
        return this;
      },
      /** gộp nhiều bản của cùng geometry (chân SMD nhỏ — rẻ hơn tạo InstancedMesh riêng) */
      many(geo, mat, matrices, opts = { shadow: false }) { for (const m of matrices) this.add(geo, mat, m, opts); return this; },
      obj(fn) { extras.push(fn); return this; },
      group(t) { const m = t.isMatrix4 ? t.clone() : tf(t); if (parentM) m.premultiply(parentM); return mk(m); },
    });
    fill(mk(null));
    const meshes = [];
    for (const b of buckets.values()) {
      const merged = b.list.length === 1 ? b.list[0] : mergeGeometries(b.list, false);
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      meshes.push({ geo: merged, mat: b.mat, shadow: b.shadow, name: b.name });
    }
    const instSpecs = insts.map((s) => ({ ...s, attr: new THREE.InstancedBufferAttribute(s.arr, 16) }));
    return { meshes, instSpecs, extras };
  });
  const g = new THREE.Group();
  g.name = `static:${key}`;
  for (const s of spec.meshes) {
    const m = new THREE.Mesh(s.geo, s.mat);
    if (s.name) m.name = s.name;
    m.castShadow = s.shadow; m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    g.add(m);
  }
  for (const s of spec.instSpecs) {
    const im = new THREE.InstancedMesh(s.geo, s.mat, s.count);
    im.instanceMatrix = s.attr;
    im.castShadow = s.shadow; im.receiveShadow = true;
    im.matrixAutoUpdate = false;
    im.computeBoundingSphere();
    g.add(im);
  }
  for (const fn of spec.extras) { const o = fn(); if (o) g.add(o); }
  return g;
}

/** InstancedMesh riêng cho từng bản sao (ma trận thay đổi được: header bẻ, chân xoè…) */
export function instanced(geo, mat, matrices, { shadow = false, capacity } = {}) {
  const im = new THREE.InstancedMesh(geo, mat, capacity ?? matrices.length);
  matrices.forEach((m, i) => im.setMatrixAt(i, m));
  im.count = matrices.length;
  im.castShadow = shadow; im.receiveShadow = true;
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  return im;
}

/** Mesh đơn tiện dụng */
export function mesh(geo, mat, t = {}, { shadow = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(t.x || 0, t.y || 0, t.z || 0);
  m.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0);
  if (t.sx || t.sy || t.sz) m.scale.set(t.sx || 1, t.sy || 1, t.sz || 1);
  m.castShadow = shadow; m.receiveShadow = true;
  return m;
}

// ----------------------------------------------------------------------------- chân linh kiện (dây)
/**
 * Bộ chân dây của một linh kiện (điện trở, LED, tụ…): mỗi chân là đường gấp khúc → ống.
 * Tất cả chân gộp thành 1 mesh; geometry cache theo hình dạng (bản chưa bẻ dùng chung).
 */
export class Leads {
  constructor(parent, { radius = 0.3, radial = 6, square = false, mat = PM.lead, bendR = 0.7, name = 'leads' } = {}) {
    this.opts = { radius, radial, square, bendR };
    this.mat = mat;
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    this.mesh.name = name;
    this.mesh.castShadow = true;
    parent.add(this.mesh);
    this.paths = [];
  }
  /** list: [{ name, pts:[[x,y,z]…] }] */
  set(list) {
    this.paths = list.map((l) => ({ name: l.name, pts: l.pts.map((p) => [...p]) }));
    const key = 'leads:' + JSON.stringify(this.opts) + JSON.stringify(this.paths.map((l) => l.pts.map((p) => p.map((v) => +v.toFixed(3)))));
    this.mesh.geometry = cached(key, () => {
      const gs = this.paths.map((l) => tubeGeo(roundPolyline(l.pts, this.opts.bendR, 5), this.opts.radius, { radial: this.opts.radial, square: this.opts.square }));
      return gs.length === 1 ? gs[0] : mergeGeometries(gs.map((g) => normGeo(g)), false);
    });
    return this;
  }
  /** chân hiện tại: đầu chân + hướng đoạn cuối */
  pins(extra = {}) {
    return this.paths.map((l) => {
      const a = l.pts[l.pts.length - 2], b = l.pts[l.pts.length - 1];
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const len = Math.hypot(...d) || 1;
      return { id: l.name, name: l.name, pos: [...b], dir: d.map((v) => +(v / len).toFixed(4)), ...(extra[l.name] || {}) };
    });
  }
}

/**
 * Đường chân linh kiện HƯỚNG TRỤC (điện trở, diode DO-41): thân dọc trục X, tâm (0, axisY, 0).
 * span = null → chân thẳng (như mới cắt khỏi băng giấy); span = 2.54·N → bẻ 90° xuống, chân cách nhau span.
 */
export function axialPaths({ halfBody, axisY, leadLen, span = null, names = ['1', '2'], minBend = 0.9 }) {
  if (!span) {
    return [
      { name: names[0], pts: [[-halfBody + 0.3, axisY, 0], [-halfBody - leadLen, axisY, 0]] },
      { name: names[1], pts: [[halfBody - 0.3, axisY, 0], [halfBody + leadLen, axisY, 0]] },
    ];
  }
  const h = span / 2;
  if (h < halfBody + minBend) return null;
  const rem = Math.max(2, leadLen - (h - halfBody));
  return [
    { name: names[0], pts: [[-halfBody + 0.3, axisY, 0], [-h, axisY, 0], [-h, axisY - rem, 0]] },
    { name: names[1], pts: [[halfBody - 0.3, axisY, 0], [h, axisY, 0], [h, axisY - rem, 0]] },
  ];
}
/** Khoảng cách chân nhỏ nhất (bội số 2.54) khi bẻ chân hướng trục */
export const minAxialSpanN = (halfBody, minBend = 0.9) => Math.ceil((2 * (halfBody + minBend)) / PITCH);

/**
 * Đường chân linh kiện HƯỚNG TÂM (LED, tụ, thạch anh): chân đi xuống từ đáy thân (y = topY).
 * leads: [{ name, x, z, len }]; span (tuỳ chọn) → nắn chân ra/vào cho khoảng cách mới (gập 90° 2 lần).
 */
export function radialPaths(leads, topY, { span = null, kinkAt = 2.2 } = {}) {
  const cx = leads.reduce((s, l) => s + l.x, 0) / leads.length;
  return leads.map((l, i) => {
    if (!span || leads.length !== 2) return { name: l.name, pts: [[l.x, topY + 0.4, l.z], [l.x, topY - l.len, l.z]] };
    const left = l.x < cx || (l.x === cx && i === 0);
    const nx = left ? cx - span / 2 : cx + span / 2;
    const jog = Math.abs(nx - l.x);
    if (jog < 0.05) return { name: l.name, pts: [[l.x, topY + 0.4, l.z], [l.x, topY - l.len, l.z]] };
    const yk = topY - kinkAt;
    return { name: l.name, pts: [[l.x, topY + 0.4, l.z], [l.x, yk, l.z], [nx, yk, l.z], [nx, yk - Math.max(2, l.len - kinkAt - jog), l.z]] };
  });
}

/** Cắt chân: mọi chân có đoạn cuối hướng xuống được cắt còn nhô `protrude` mm dưới mặt tựa seatY */
export function trimPaths(paths, seatY, protrude) {
  const yCut = seatY - Math.max(0.3, protrude);
  return paths.map((l) => {
    const pts = l.pts.map((p) => [...p]);
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    if (b[1] < a[1] - 0.5 && b[1] < yCut && a[1] > yCut) b[1] = yCut;
    return { name: l.name, pts };
  });
}

// ----------------------------------------------------------------------------- chân linh kiện (định nghĩa)
export const P = (id, name, pos, dir = [0, -1, 0], extra = {}) => ({ id: String(id), name, pos: pos.map((v) => +(+v).toFixed(3)), dir, ...extra });

/** Chân hiện tại của một bản sao (sau khi bẻ/cắt) — engine: def.getPins?.(inst) ?? def.pins */
export function getPinsDefault(def) {
  return (inst) => inst?.object?.userData?.pins?.() ?? def.pins;
}

/**
 * Gắn tham chiếu runtime vào object.userData KHÔNG đếm được (enumerable:false) → Object3D.clone()/toJSON
 * (JSON.stringify userData) bỏ qua, không kéo theo mesh/hàm/vòng tham chiếu.
 */
export function ud(obj, key, value) {
  Object.defineProperty(obj.userData, key, { value, writable: true, configurable: true, enumerable: false });
  return value;
}

// ----------------------------------------------------------------------------- khe cắm (sockets)
const _sockets = new WeakMap();
const _pads = new WeakMap();
export { _pads as PAD_STORE };

/** Điểm neo (Object3D) của khe — con của instance.object, ma trận tĩnh (không tốn cập nhật) */
export function anchor(parent, name, [x, y, z], rotY = 0, rotX = 0) {
  let holder = parent.userData.__anchors;
  if (!holder) { holder = new THREE.Group(); holder.name = '__anchors'; holder.visible = true; /* chỉ chứa Object3D rỗng — phải hiện để linh kiện cắm vào khe không bị ẩn theo */ parent.add(holder); ud(parent, '__anchors', holder); }
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(x, y, z);
  o.rotation.set(rotX, rotY, 0);
  o.updateMatrix();
  o.matrixAutoUpdate = false;
  holder.add(o);
  return o;
}

/** Kiểm tra item có cắm vừa loại khe `kind` không */
export function fitsKind(item, kind) {
  const def = item?.def || item;
  const list = def?.insertInto || [];
  if (list.includes(kind)) return true;
  // 'pcb-hole' / 'bb-hole' chấp nhận mọi linh kiện có chân xuyên lỗ bước 2.54
  return false;
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
/**
 * Hướng cắm của item so với khe. Ưu tiên ctx.rotSteps của engine (số lần nhấn R: 0 = đúng, 2 = xoay 180° → 'reversed',
 * 1/3 → 'offset'); không có ctx → so trục cục bộ của item với trục khe (expect 'same' | 'opposite').
 */
export function orientationByAxis(item, anchorObj, axis = 'x', ctx = null, expect = 'same') {
  if (ctx && typeof ctx.rotSteps === 'number') {
    const st = ((ctx.rotSteps % 4) + 4) % 4;
    return st === 0 ? 'ok' : st === 2 ? 'reversed' : 'offset';
  }
  const o = item?.object;
  if (!o || !anchorObj || !o.parent) return 'ok';
  o.updateWorldMatrix(true, false);
  anchorObj.updateWorldMatrix(true, false);
  const col = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  _v1.setFromMatrixColumn(o.matrixWorld, col).normalize();
  _v2.setFromMatrixColumn(anchorObj.matrixWorld, col).normalize();
  const d = _v1.dot(_v2) * (expect === 'opposite' ? -1 : 1);
  return d > 0.7 ? 'ok' : d < -0.7 ? 'reversed' : 'offset';
}

/**
 * Tạo socketSpec theo §5. pose = Matrix4 CỤC BỘ so với object3D (khe); thêm:
 *   poseFor(item) → Matrix4 cục bộ (theo mount.seatY / chân của item), worldPose(item?, out), worldPosition(out).
 *   pose cố định: truyền `pose` (vd XT60 quay 180°); không truyền → accepts() cập nhật pose theo item.
 */
export function socketSpec(instance, { id, kind, anchor: a, accepts, surfaceY = 0, tolerance = { pos: 2, angleDeg: 8 }, onInsert, onRemove, poseFor, pose, ...meta }) {
  const userAccepts = accepts || ((item) => (fitsKind(item, kind) ? { ok: true, orientation: 'ok' } : { ok: false, reason: `Không cắm vừa khe ${kind}` }));
  const pf = poseFor || ((item) => {
    const seat = item?.def?.mount?.seatY ?? item?.mount?.seatY ?? 0;
    return new THREE.Matrix4().makeTranslation(0, surfaceY - seat, 0);
  });
  const s = {
    id: `${instance?.uid ?? 'x'}:${id}`,
    localId: id,
    owner: instance || null,
    object3D: a,
    kind,
    tolerance,
    occupiedBy: null,
    ...meta,
    poseFor: pf,
    // pose TƯƠNG ĐỐI object3D. Với khe mà tư thế phụ thuộc item (lỗ board, breadboard…), accepts() cập nhật this.pose
    // theo item vừa kiểm tra — engine (sockets.js) gọi socket.accepts(item, ctx) ngay trước khi tính localPose.
    pose: pose || pf(null),
    accepts(item, ctx) {
      const self = this || s;
      const r = userAccepts.call(self, item, ctx);
      if (r?.ok && !pose) { try { self.pose = self.poseFor(item); } catch { /* giữ pose cũ */ } }
      return r;
    },
    worldPose(item, out = new THREE.Matrix4()) {
      a.updateWorldMatrix(true, false);
      return out.multiplyMatrices(a.matrixWorld, (this || s).poseFor(item ?? (this || s).occupiedBy));
    },
    worldPosition(out = new THREE.Vector3()) { a.updateWorldMatrix(true, false); return out.setFromMatrixPosition(a.matrixWorld); },
    onInsert(item, info) { const self = this || s; self.occupiedBy = item; onInsert?.call(self, item, info); },
    onRemove(item) { const self = this || s; self.occupiedBy = null; onRemove?.call(self, item); },
  };
  return s;
}

/** Cache danh sách khe cho mỗi bản sao (không lưu vào instance.state để save JSON không vướng vòng tham chiếu) */
export function socketsOnce(instance, make) {
  let list = _sockets.get(instance);
  if (!list) { list = make(); _sockets.set(instance, list); }
  return list;
}

// ----------------------------------------------------------------------------- pad hàn
/** Bản ghi pad hàn (dùng cho minigames/soldering.js) */
export function padRecord(id, local, { side = 'bottom', ring = 0.9, hole = 0.5, neighbors = [], thermalMass = 1, kind = 'pcb' } = {}) {
  return { id, local, side, ring, hole, neighbors, thermalMass, kind, T: 25, V: 0, flux: 0, state: 'empty', pin: null, net: null };
}
/** Pad hàn của một bản sao (tạo 1 lần) */
export function padsOnce(instance, make) {
  let p = _pads.get(instance);
  if (!p) { p = make(); _pads.set(instance, p); }
  return p;
}
const _pv = new THREE.Vector3();
export function padWorld(instance, rec, out = new THREE.Vector3()) {
  const o = instance?.object;
  out.set(...rec.local);
  if (o) { o.updateWorldMatrix(true, false); out.applyMatrix4(o.matrixWorld); }
  return out;
}
export { _pv };

// ----------------------------------------------------------------------------- hàm tiện ích def
/** Gán mặc định cho def (getPins, grip …) */
export function finalizeDef(def) {
  def.kind ??= 'part';
  def.getPins ??= (inst) => inst?.object?.userData?.pins?.() ?? def.pins;
  def.grip ??= { pose: 'pinch', offset: [0, def.size ? def.size[1] / 2 : 0, 0], rot: [0, 0, 0] };
  return def;
}

/** Màu vạch điện trở */
export const BAND_COLORS = { black: 0x111111, brown: 0x7a4520, red: 0xd2232a, orange: 0xf07c12, yellow: 0xf5d327, green: 0x24a24c, blue: 0x2b5fd3, violet: 0x8a49cf, grey: 0x8c8c8c, white: 0xf4f4f4, gold: 0xc9a13a, silver: 0xbfc4c9 };
const DIGIT = ['black', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'grey', 'white'];
/** Giá trị Ω → 4 vạch màu (±5 %) */
export function resistorBands(ohms, tol = 'gold') {
  if (!(ohms > 0)) return ['black', 'black', 'black', tol];
  let e = Math.floor(Math.log10(ohms)) - 1;
  let sig = Math.round(ohms / 10 ** e);
  if (sig >= 100) { sig = Math.round(sig / 10); e += 1; }
  const d1 = Math.floor(sig / 10), d2 = sig % 10;
  const mult = e >= 0 ? DIGIT[e] : e === -1 ? 'gold' : 'silver';
  return [DIGIT[d1], DIGIT[d2], mult, tol];
}
export function fmtOhm(v) {
  if (v >= 1e6) return `${+(v / 1e6).toFixed(2)} MΩ`;
  if (v >= 1e3) return `${+(v / 1e3).toFixed(2)} kΩ`;
  return `${+v.toFixed(2)} Ω`;
}

/** Đếm tam giác của một Object3D (InstancedMesh tính × count) */
export function countTris(obj) {
  let tris = 0, unique = 0, meshes = 0, inst = 0, draws = 0;
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const g = o.geometry;
    const t = (g.index ? g.index.count : g.attributes.position.count) / 3;
    meshes++; draws++;
    unique += t;
    if (o.isInstancedMesh) { inst++; tris += t * o.count; } else tris += t;
  });
  return { tris: Math.round(tris), unique: Math.round(unique), meshes, inst, draws };
}
