// Texture thủ tục cho thế giới game (gỗ, thảm ESD, gạch vinyl, tường sơn, kim loại xước, bìa các-tông,
// bảng ghim, trần thả, chữ/nhãn, LED 7 đoạn). Dùng CanvasTexture — trong Node (smoke test) không có
// document → mọi hàm trả về null và vật liệu chỉ dùng màu trơn.
// Chất lượng ≥ high: thêm normalMap + roughnessMap sinh từ bản đồ độ cao.
import * as THREE from 'three';

export const hasDoc = () => typeof document !== 'undefined' && typeof document.createElement === 'function';
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const FONT = 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const MONO = 'ui-monospace, Menlo, Consolas, monospace';

const QL = { low: 0, medium: 1, high: 2, ultra: 3 };
/** Mức chất lượng 0..3 (low..ultra) — đọc game.quality một cách phòng thủ */
export function qualityLevel(game) {
  const q = game?.quality;
  let p;
  try {
    if (typeof q === 'string') p = q;
    else {
      // engine/quality.js: quality.preset là OBJECT preset, tên nằm ở presetName / settings.preset
      const cands = [q?.presetName, q?.settings?.preset, q?.preset, q?.current?.preset, typeof q?.get === 'function' ? q.get('preset') : undefined];
      p = cands.find((c) => typeof c === 'string' && QL[c] !== undefined);
      if (!p && q?.preset && typeof q.preset === 'object') {
        const o = q.preset;   // suy từ thông số
        p = o.shadowMapSize >= 4096 ? 'ultra' : o.normalMaps ? 'high' : o.shadows ? 'medium' : 'low';
      }
    }
  } catch { p = undefined; }
  return QL[p] ?? 2;
}
/** Cạnh texture theo chất lượng (base = cạnh ở 'high') */
export function texSize(game, base = 1024) {
  const l = qualityLevel(game);
  const s = l === 0 ? base / 4 : l === 1 ? base / 2 : base;          // ultra dùng như high (thời gian sinh texture)
  return Math.min(2048, Math.max(64, 2 ** Math.round(Math.log2(s))));
}

/** Bộ sinh số ngẫu nhiên có hạt giống (texture tất định) */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCanvas(W, H) {
  if (!hasDoc()) return null;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: false });
  if (!g) return null;
  return { c, g, W, H };
}

export function toTexture(canvas, { srgb = true, repeat = true, aniso = 8 } = {}) {
  if (!canvas) return null;
  const t = new THREE.CanvasTexture(canvas.c || canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}

// ---------------------------------------------------------------- nhiễu tuần hoàn (tile được)
/** Nhiễu giá trị fBm tuần hoàn: Float32Array W×H trong [0,1] */
export function noiseField(W, H, { sx = 8, sy = 8, octaves = 4, seed = 1, gain = 0.5 } = {}) {
  const out = new Float32Array(W * H);
  const rand = mulberry32(seed * 7919 + 13);
  let amp = 1, tot = 0;
  for (let o = 0; o < octaves; o++) {
    const nx = Math.max(1, Math.round(sx * 2 ** o)), ny = Math.max(1, Math.round(sy * 2 ** o));
    const lat = new Float32Array(nx * ny);
    for (let i = 0; i < lat.length; i++) lat[i] = rand();
    for (let y = 0; y < H; y++) {
      const fy = (y / H) * ny, y0 = Math.floor(fy), ty = fy - y0, s = ty * ty * (3 - 2 * ty);
      const r0 = (y0 % ny) * nx, r1 = ((y0 + 1) % ny) * nx;
      for (let x = 0; x < W; x++) {
        const fx = (x / W) * nx, x0 = Math.floor(fx), tx = fx - x0, u = tx * tx * (3 - 2 * tx);
        const c0 = x0 % nx, c1 = (x0 + 1) % nx;
        const a = lat[r0 + c0] + (lat[r0 + c1] - lat[r0 + c0]) * u;
        const b = lat[r1 + c0] + (lat[r1 + c1] - lat[r1 + c0]) * u;
        out[y * W + x] += (a + (b - a) * s) * amp;
      }
    }
    tot += amp; amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

/** Ghi trường RGB vào canvas: fn(i, x, y) → [r,g,b] (0..255) */
export function paint(W, H, fn) {
  const cv = makeCanvas(W, H);
  if (!cv) return null;
  const img = cv.g.createImageData(W, H);
  const d = img.data;
  for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
    const c = fn(i, x, y);
    d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = c[3] ?? 255;
  }
  cv.g.putImageData(img, 0, 0);
  return cv;
}

/** Bản đồ độ cao → normal map (tangent space, quy ước OpenGL, tile được) */
export function heightToNormal(h, W, H, strength = 2) {
  return paint(W, H, (i, x, y) => {
    const l = h[y * W + ((x - 1 + W) % W)], r = h[y * W + ((x + 1) % W)];
    const u = h[((y - 1 + H) % H) * W + x], d = h[((y + 1) % H) * W + x];
    let nx = (l - r) * strength, ny = (d - u) * strength, nz = 1;
    const k = 1 / Math.hypot(nx, ny, nz);
    nx *= k; ny *= k; nz *= k;
    return [(nx * 0.5 + 0.5) * 255, (ny * 0.5 + 0.5) * 255, (nz * 0.5 + 0.5) * 255];
  });
}
/** Trường [0,1] → roughness map (kênh G được three đọc) */
export function fieldToGray(f, W, H, lo, hi) {
  return paint(W, H, (i) => { const v = clamp(lo + (hi - lo) * f[i], 0, 1) * 255; return [v, v, v]; });
}

const hex = (c) => { const n = new THREE.Color(c); return [n.r * 255, n.g * 255, n.b * 255]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ---------------------------------------------------------------- bộ đệm
const CACHE = new Map();
function cached(key, game, build) {
  const k = `${key}@${qualityLevel(game)}`;
  if (!CACHE.has(k)) CACHE.set(k, hasDoc() ? build(texSize(game, 1024), qualityLevel(game) >= 2) : { map: null, normalMap: null, roughnessMap: null });
  return CACHE.get(k);
}
function finishSet(color, height, rough, W, H, detail, normalStrength) {
  const set = { map: toTexture(color), normalMap: null, roughnessMap: null };
  if (detail && height) set.normalMap = toTexture(heightToNormal(height, W, H, normalStrength), { srgb: false });
  if (detail && rough) set.roughnessMap = toTexture(rough, { srgb: false });
  return set;
}

/** Vật liệu từ một bộ texture */
export function texturedMaterial(set, params = {}, { repeat = [1, 1], normalScale = 1 } = {}) {
  const m = new THREE.MeshStandardMaterial({ ...params });
  if (set?.map) {
    for (const k of ['map', 'normalMap', 'roughnessMap']) {
      if (!set[k]) continue;
      const t = set[k].clone();
      t.repeat.set(repeat[0], repeat[1]);
      t.needsUpdate = true;
      m[k] = t;
    }
    if (m.map) m.color.set(0xffffff);
    if (m.normalMap) m.normalScale.set(normalScale, normalScale);
    if (m.roughnessMap) m.roughness = 1;
  }
  return m;
}

// ---------------------------------------------------------------- gỗ (mặt bàn gỗ ghép thanh)
export function woodSet(game, { light = '#cfa772', dark = '#9c6b3c', strips = 7, seed = 3, key = 'wood' } = {}) {
  return cached(`${key}:${light}:${dark}:${strips}:${seed}`, game, (S, detail) => {
    const W = S, H = S;
    const warp = noiseField(W, H, { sx: 2, sy: 6, octaves: 4, seed });
    const pores = noiseField(W, H, { sx: 4, sy: 96, octaves: 2, seed: seed + 1 });
    const L = hex(light), D = hex(dark);
    const rand = mulberry32(seed);
    const stripTint = Array.from({ length: strips }, () => 0.86 + rand() * 0.22);
    const stripOff = Array.from({ length: strips }, () => rand() * 10);
    const height = new Float32Array(W * H);
    const color = paint(W, H, (i, x, y) => {
      const si = Math.floor((y / H) * strips);
      const ring = 0.5 + 0.5 * Math.sin(((y / H) * strips * 7 + warp[i] * 2.2 + stripOff[si]) * Math.PI * 2);   // [2026-10] vân mảnh, ít xoáy
      const v = Math.pow(ring, 2.2) * 0.45 + pores[i] * 0.35 + 0.1;
      const seam = ((y / H) * strips) % 1 < 0.004 ? 0.55 : 1;
      height[i] = v * 0.4 + pores[i] * 0.6 - (seam < 1 ? 0.5 : 0);
      const c = mix(L, D, v);
      const t = stripTint[si] * seam;
      return [c[0] * t, c[1] * t, c[2] * t];
    });
    const rough = detail ? fieldToGray(pores, W, H, 0.42, 0.7) : null;
    return finishSet(color, height, rough, W, H, detail, 1.5);
  });
}

// ---------------------------------------------------------------- thảm chống tĩnh điện
export function esdMatSet(game, { base = '#3d8c69', seed = 5 } = {}) {
  return cached(`esd:${base}`, game, (S, detail) => {
    const W = S, H = Math.round(S / 2);
    const mott = noiseField(W, H, { sx: 6, sy: 3, octaves: 4, seed });
    const grain = noiseField(W, H, { sx: 128, sy: 64, octaves: 1, seed: seed + 3 });
    const B = hex(base);
    const color = paint(W, H, (i) => {
      const k = 0.92 + mott[i] * 0.14 + (grain[i] - 0.5) * 0.06;
      return [B[0] * k, B[1] * k, B[2] * k];
    });
    // chữ in mờ ở góc (biểu tượng ESD)
    const g = color.g;
    g.globalAlpha = 0.28;
    g.fillStyle = '#e8fff2';
    g.font = `bold ${Math.round(H * 0.045)}px ${FONT}`;
    g.textBaseline = 'bottom'; g.textAlign = 'right';
    g.fillText('⏚ ESD PROTECTED AREA · 10⁶–10⁹ Ω · NỐI ĐẤT 1 MΩ', W * 0.975, H * 0.965);
    g.globalAlpha = 1;
    const h = new Float32Array(W * H);
    for (let i = 0; i < h.length; i++) h[i] = grain[i] * 0.7 + mott[i] * 0.3;
    const rough = detail ? fieldToGray(mott, W, H, 0.78, 0.92) : null;
    return finishSet(color, h, rough, W, H, detail, 0.8);
  });
}

// ---------------------------------------------------------------- sàn vinyl chống tĩnh điện (gạch 600 × 600, hạt li ti kiểu terrazzo)
// [2026-10] thay mẫu cũ (vệt loang lớn trông như "rằn ri"): hạt nhỏ mật độ cao, tương phản thấp, mỗi viên lệch tông rất nhẹ,
// mạch ghép mảnh + vài vệt mòn/bóng mờ tần số thấp. Một tile texture = 4 × 4 viên (2400 mm).
export function tileSet(game, { base = '#c9ccce', seed = 11 } = {}) {
  return cached(`tile2:${base}`, game, (S, detail) => {
    const W = S, H = S, n = 4;
    const wear = noiseField(W, H, { sx: 2, sy: 2, octaves: 3, seed: seed + 1 });
    const rand = mulberry32(seed);
    const tint = Array.from({ length: n * n }, () => 0.975 + rand() * 0.04);
    const B = hex(base);
    const grout = Math.max(1, Math.round(W / 700));
    const height = new Float32Array(W * H);
    // hạt: chấm 1–3 px nhiều màu xám/đen/trắng (tần số cao, ngẫu nhiên tất định)
    const speck = new Float32Array(W * H);
    const r2 = mulberry32(seed + 7);
    const N = Math.round(W * H * 0.06);
    for (let k = 0; k < N; k++) {
      const x = Math.floor(r2() * W), y = Math.floor(r2() * H), v = r2();
      const s = v < 0.55 ? -0.16 - r2() * 0.18 : v < 0.85 ? 0.08 + r2() * 0.08 : -0.38;
      const sz = r2() < 0.15 ? 2 : 1;
      for (let dy = 0; dy < sz; dy++) for (let dx = 0; dx < sz; dx++) speck[((y + dy) % H) * W + ((x + dx) % W)] = s;
    }
    const color = paint(W, H, (i, x, y) => {
      const tx = Math.floor((x / W) * n), ty = Math.floor((y / H) * n);
      const lx = x % (W / n), ly = y % (H / n);
      const edge = lx < grout || ly < grout;
      let k = tint[ty * n + tx] * (0.985 + wear[i] * 0.03) * (1 + speck[i] * 0.55);
      if (edge) k *= 0.8;
      height[i] = edge ? 0.2 : 0.62 + speck[i] * 0.2;
      return [B[0] * k, B[1] * k, B[2] * k];
    });
    const rough = detail ? fieldToGray(wear, W, H, 0.3, 0.55) : null;
    return finishSet(color, height, rough, W, H, detail, 1.2);
  });
}

/** Thảm cao su chống tĩnh điện trải sàn (xám đậm, vân hạt) */
export function floorMatSet(game, { base = '#3b3f45', seed = 61 } = {}) {
  return cached(`fmat:${base}`, game, (S, detail) => {
    const W = Math.round(S / 2), H = W;
    const grain = noiseField(W, H, { sx: 96, sy: 96, octaves: 2, seed });
    const mott = noiseField(W, H, { sx: 4, sy: 4, octaves: 3, seed: seed + 1 });
    const B = hex(base);
    const color = paint(W, H, (i) => { const k = 0.9 + grain[i] * 0.16 + mott[i] * 0.06; return [B[0] * k, B[1] * k, B[2] * k]; });
    const rough = detail ? fieldToGray(grain, W, H, 0.75, 0.95) : null;
    return finishSet(color, grain, rough, W, H, detail, 1.6);
  });
}

/** Bảng ghim bần (cork) */
export function corkSet(game, { base = '#b98d5c', seed = 71 } = {}) {
  return cached(`cork:${base}`, game, (S, detail) => {
    const W = Math.round(S / 2), H = W;
    const g1 = noiseField(W, H, { sx: 80, sy: 80, octaves: 3, seed });
    const B = hex(base);
    const color = paint(W, H, (i) => { const v = g1[i]; const k = v > 0.62 ? 0.72 : v < 0.3 ? 1.12 : 0.95 + v * 0.1; return [B[0] * k, B[1] * k, B[2] * k]; });
    return finishSet(color, g1, null, W, H, detail, 2.2);
  });
}

// ---------------------------------------------------------------- tường sơn nước (vết lăn sơn)
export function paintedWallSet(game, { base = '#e9e6df', seed = 21 } = {}) {
  return cached(`wall:${base}`, game, (S, detail) => {
    const W = Math.round(S / 2), H = W;
    const stip = noiseField(W, H, { sx: 96, sy: 96, octaves: 2, seed });
    const blot = noiseField(W, H, { sx: 4, sy: 4, octaves: 3, seed: seed + 2 });
    const B = hex(base);
    const color = paint(W, H, (i) => { const k = 0.975 + blot[i] * 0.035 + (stip[i] - 0.5) * 0.02; return [B[0] * k, B[1] * k, B[2] * k]; });
    const rough = detail ? fieldToGray(stip, W, H, 0.82, 0.95) : null;
    return finishSet(color, stip, rough, W, H, detail, 0.35);      // [2026-10] gân sơn nhẹ hơn (trước: nhìn gần như vữa sần)
  });
}

// ---------------------------------------------------------------- kim loại xước (inox / nhôm)
export function brushedSet(game, { base = '#b9bec4', seed = 31 } = {}) {
  return cached(`brushed:${base}`, game, (S, detail) => {
    const W = Math.round(S / 2), H = W;
    const streak = noiseField(W, H, { sx: 2, sy: 192, octaves: 3, seed });
    const B = hex(base);
    const color = paint(W, H, (i) => { const k = 0.9 + streak[i] * 0.18; return [B[0] * k, B[1] * k, B[2] * k]; });
    const rough = detail ? fieldToGray(streak, W, H, 0.22, 0.48) : null;
    return finishSet(color, streak, rough, W, H, detail, 0.6);
  });
}

// ---------------------------------------------------------------- bìa các-tông (hộp)
export function cardboardSet(game, { base = '#b98c57', tape = true, seed = 41 } = {}) {
  return cached(`card:${base}:${tape}`, game, (S, detail) => {
    const W = Math.round(S / 2), H = W;
    const fib = noiseField(W, H, { sx: 64, sy: 8, octaves: 2, seed });
    const blot = noiseField(W, H, { sx: 4, sy: 4, octaves: 3, seed: seed + 1 });
    const B = hex(base), T = hex('#c8a16b');
    const height = new Float32Array(W * H);
    const color = paint(W, H, (i, x, y) => {
      const onTape = tape && Math.abs(x / W - 0.5) < 0.09;
      const k = 0.9 + fib[i] * 0.12 + blot[i] * 0.06;
      height[i] = onTape ? 0.8 : fib[i] * 0.4 + 0.5 * (0.5 + 0.5 * Math.sin((y / H) * Math.PI * 2 * 60));
      const c = onTape ? T : B;
      const edge = Math.min(x, y, W - 1 - x, H - 1 - y) < W * 0.012 ? 0.8 : 1;
      return [c[0] * k * edge, c[1] * k * edge, c[2] * k * edge];
    });
    const g = color.g;
    g.strokeStyle = 'rgba(40,30,20,.22)'; g.lineWidth = W * 0.008;
    for (const [x, y] of [[0.2, 0.25], [0.8, 0.25]]) {          // ký hiệu "hướng lên"
      g.beginPath(); g.moveTo(W * x, H * (y + 0.1)); g.lineTo(W * x, H * (y - 0.06)); g.moveTo(W * (x - 0.04), H * (y - 0.02)); g.lineTo(W * x, H * (y - 0.07)); g.lineTo(W * (x + 0.04), H * (y - 0.02)); g.stroke();
    }
    const rough = detail ? fieldToGray(fib, W, H, 0.82, 0.96) : null;
    return finishSet(color, height, rough, W, H, detail, 0.7);
  });
}

// ---------------------------------------------------------------- bảng ghim thép đục lỗ (4×4 lỗ / tile)
export function pegboardSet(game, { base = '#8f969e' } = {}) {
  return cached(`peg:${base}`, game, (S, detail) => {
    const W = Math.round(S / 4), H = W, n = 4;
    const B = hex(base);
    const height = new Float32Array(W * H);
    const color = paint(W, H, (i, x, y) => {
      const cx = ((x % (W / n)) / (W / n)) - 0.5, cy = ((y % (H / n)) / (H / n)) - 0.5;
      const r = Math.hypot(cx, cy);
      height[i] = r < 0.13 ? 0 : r < 0.18 ? (r - 0.13) / 0.05 : 1;
      if (r < 0.13) return [18, 18, 20];
      const k = r < 0.18 ? 0.8 : 1;
      return [B[0] * k, B[1] * k, B[2] * k];
    });
    return finishSet(color, height, null, W, H, detail, 4);
  });
}

// ---------------------------------------------------------------- tấm trần thả 600×600
export function ceilingTileSet(game, { seed = 51 } = {}) {
  return cached('ceil', game, (S, detail) => {
    const W = Math.round(S / 2), H = W;
    const fis = noiseField(W, H, { sx: 40, sy: 40, octaves: 2, seed });
    const height = new Float32Array(W * H);
    const color = paint(W, H, (i, x, y) => {
      const e = Math.min(x, y, W - 1 - x, H - 1 - y) / W;
      const pit = fis[i] > 0.66;
      height[i] = pit ? 0.2 : 0.8;
      if (e < 0.012) return [236, 238, 240];                // khung chữ T
      if (e < 0.02) return [190, 190, 186];                 // bóng mép
      const k = pit ? 0.86 : 0.98;
      return [242 * k, 242 * k, 238 * k];
    });
    return finishSet(color, height, null, W, H, detail, 1.2);
  });
}

// ---------------------------------------------------------------- chữ / nhãn
/** Texture vẽ tay: draw(g, W, H). Trả null trong Node */
export function drawTexture(W, H, draw, { srgb = true, repeat = false } = {}) {
  const cv = makeCanvas(W, H);
  if (!cv) return null;
  draw(cv.g, W, H);
  const t = toTexture(cv, { srgb, repeat, aniso: 4 });
  t.userData.canvas = cv;
  return t;
}

/** Tấm phẳng (mặt +Z) mang texture canvas; fallback màu trơn */
export function canvasPlane(w, h, draw, { pxPerMm = 2, maxPx = 1024, fallback = '#ffffff', lit = true, transparent = false, rough = 0.8, emissive = false } = {}) {
  const k = Math.min(pxPerMm, maxPx / Math.max(w, h));
  const W = Math.max(16, Math.round(w * k)), H = Math.max(16, Math.round(h * k));
  const tex = drawTexture(W, H, draw);
  const opts = { color: tex ? 0xffffff : fallback, map: tex, transparent };
  let mat;
  if (emissive) mat = new THREE.MeshBasicMaterial({ ...opts, toneMapped: false });
  else if (lit) mat = new THREE.MeshStandardMaterial({ ...opts, roughness: rough, metalness: 0 });
  else mat = new THREE.MeshBasicMaterial(opts);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.userData.redraw = (fn) => { if (!tex) return; fn(tex.userData.canvas.g, W, H); tex.needsUpdate = true; };
  m.userData.canvasSize = [W, H];
  return m;
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}

export function text(g, s, x, y, { size = 20, color = '#111', align = 'left', base = 'middle', bold = false, font = FONT, maxW } = {}) {
  g.fillStyle = color; g.textAlign = align; g.textBaseline = base;
  g.font = `${bold ? 'bold ' : ''}${Math.round(size)}px ${font}`;
  if (maxW) g.fillText(s, x, y, maxW); else g.fillText(s, x, y);
}

export function wrapText(g, s, maxW) {
  const words = String(s).split(' ');
  const lines = []; let cur = '';
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  return lines;
}

// ---------------------------------------------------------------- LED 7 đoạn
const SEG = {
  0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
  '-': 'g', ' ': '', _: 'd', E: 'adefg', r: 'eg', o: 'cdeg', F: 'aefg', S: 'afgcd', C: 'adef', c: 'deg', H: 'bcefg', L: 'def',
  P: 'abefg', n: 'ceg', U: 'bcdef', u: 'cde', A: 'abcefg', b: 'cdefg', d: 'bcdeg', t: 'defg', O: 'abcdef', I: 'bc', h: 'cefg', y: 'bcdfg', '°': 'abfg',
};
/**
 * Vẽ chuỗi LED 7 đoạn: dấu '.' gắn vào chữ số trước. on/off = màu đoạn sáng/tắt (bóng mờ).
 * Trả về bề rộng đã vẽ.
 */
export function drawSeg7(g, str, x, y, h, on = '#ff3322', off = 'rgba(255,60,40,0.08)', { slant = 0.12, glow = true } = {}) {
  const w = h * 0.56, t = h * 0.11, gap = t * 0.18, adv = w + h * 0.22;
  const chars = [];
  for (const ch of String(str)) { if (ch === '.' && chars.length) chars[chars.length - 1].dp = true; else chars.push({ ch, dp: false }); }
  const seg = (name) => {
    const hx = w, hy = h / 2;
    switch (name) {
      case 'a': return [[gap, 0], [hx - gap, 0], [hx - gap - t, t], [gap + t, t]];
      case 'd': return [[gap + t, h - t], [hx - gap - t, h - t], [hx - gap, h], [gap, h]];
      case 'g': return [[gap + t * 0.5, hy - t / 2], [hx - gap - t * 0.5, hy - t / 2], [hx - gap, hy], [hx - gap - t * 0.5, hy + t / 2], [gap + t * 0.5, hy + t / 2], [gap, hy]];
      case 'f': return [[0, gap], [t, gap + t], [t, hy - gap - t / 2], [0, hy - gap]];
      case 'b': return [[hx, gap], [hx, hy - gap], [hx - t, hy - gap - t / 2], [hx - t, gap + t]];
      case 'e': return [[0, hy + gap], [t, hy + gap + t / 2], [t, h - gap - t], [0, h - gap]];
      case 'c': return [[hx, hy + gap], [hx, h - gap], [hx - t, h - gap - t], [hx - t, hy + gap + t / 2]];
      default: return [];
    }
  };
  let cx = x;
  g.save();
  for (const { ch, dp } of chars) {
    const lit = SEG[ch] ?? '';
    for (const s of 'abcdefg') {
      const isOn = lit.includes(s);
      if (!isOn && !off) continue;
      g.fillStyle = isOn ? on : off;
      if (isOn && glow) { g.shadowColor = on; g.shadowBlur = h * 0.12; } else g.shadowBlur = 0;
      g.beginPath();
      seg(s).forEach(([px, py], i) => { const X = cx + px + (h - py) * slant, Y = y + py; i ? g.lineTo(X, Y) : g.moveTo(X, Y); });
      g.closePath(); g.fill();
    }
    g.fillStyle = dp ? on : off || 'transparent';
    g.beginPath(); g.arc(cx + w + t * 1.1, y + h - t / 2, t * 0.6, 0, Math.PI * 2); g.fill();
    cx += adv;
  }
  g.restore();
  return cx - x;
}

/** Giữ texture đã có — để module khác tái dùng khi cần cùng một texture */
export function clearTextureCache() { for (const s of CACHE.values()) for (const t of Object.values(s)) t?.dispose?.(); CACHE.clear(); }
