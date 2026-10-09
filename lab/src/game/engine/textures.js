// =============================================================================
// textures.js — Texture THỦ TỤC (vẽ bằng canvas, không cần file ảnh).
//
//   import { makeTexture, makeMaterial, TEXTURE_KINDS } from '../engine/textures.js';
//   const { map, normalMap, roughnessMap } = makeTexture('wood', { repeat: [2, 1] });
//   const mat = makeMaterial('esdMat', { repeat: [3, 2] });          // MeshStandardMaterial đã gắn map
//   // hoặc qua đối tượng game:  game.textures.get('tiles', {...}) / game.textures.material('pcb', {...})
//
// Loại (kind): 'wood' (gỗ) · 'esdMat' (thảm chống tĩnh điện xanh có chấm) · 'tiles' (gạch lát sàn)
//              'paint' (tường sơn) · 'pcb' (đường mạch + phủ xanh + chữ silkscreen) · 'brushedMetal' (kim loại xước)
//              'pinboard' (bảng ghim/bảng đục lỗ treo dụng cụ) · 'concrete' (bê tông trần)
// opts chung: { size (px, mặc định theo chất lượng), repeat:[u,v], seed, color (ghi đè màu nền CSS) }
//             pcb: { mask:'green'|'blue'|'black'|'red', label:'TEXT' }
// Normal/roughness map chỉ tạo khi quality.preset.normalMaps (≥ high).
// Chạy trong Node (không có document) → trả về { map:null } để code dựng hình vẫn chạy.
// Cache theo (kind + opts) — gọi nhiều lần không tạo lại.
// =============================================================================
import * as THREE from 'three';

export const TEXTURE_KINDS = ['wood', 'esdMat', 'tiles', 'paint', 'pcb', 'brushedMetal', 'pinboard', 'concrete'];

let _quality = null;           // gắn từ createTextures(game) để biết preset
const _cache = new Map();

/** Bộ sinh số ngẫu nhiên có hạt giống (để texture giống nhau mỗi lần tải) */
function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

/** Tạo normal map từ canvas độ cao (xám) bằng toán tử Sobel */
function normalFromHeight(hc, strength = 2) {
  const n = hc.width;
  const src = hc.getContext('2d').getImageData(0, 0, n, n).data;
  const out = canvas(n);
  const g = out.getContext('2d');
  const img = g.createImageData(n, n);
  const H = (x, y) => src[(((y + n) % n) * n + ((x + n) % n)) * 4] / 255;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
      const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
      let nx = -dx * strength, ny = dy * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * n + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return out;
}

/** Nhiễu hạt nhỏ phủ toàn ảnh (làm bề mặt bớt "phẳng nhựa") */
function speckle(g, n, r, count, colorFn) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = colorFn(r());
    const s = 1 + r() * 2;
    g.fillRect(r() * n, r() * n, s, s);
  }
}

// ---------------------------------------------------------------------------
// Các "hoạ sĩ": vẽ lên c (màu), h (độ cao xám, sáng = cao), k (độ nhám xám, sáng = nhám)
// ---------------------------------------------------------------------------
const PAINTERS = {
  wood(c, h, k, n, r, o) {
    const base = o.color || '#9a6a3f';
    c.fillStyle = base; c.fillRect(0, 0, n, n);
    h.fillStyle = '#808080'; h.fillRect(0, 0, n, n);
    k.fillStyle = '#9a9a9a'; k.fillRect(0, 0, n, n);
    // vân gỗ: các đường cong lượn sóng chạy theo trục X
    const lines = 70;
    for (let i = 0; i < lines; i++) {
      const y0 = (i / lines) * n + r() * 6;
      const amp = 2 + r() * 6, freq = 1 + r() * 3, ph = r() * 6.28;
      const dark = r();
      c.strokeStyle = `rgba(${50 + dark * 40},${28 + dark * 20},${12},${0.18 + r() * 0.3})`;
      c.lineWidth = 0.6 + r() * 2.4;
      h.strokeStyle = `rgba(40,40,40,${0.25 + r() * 0.3})`; h.lineWidth = c.lineWidth;
      for (const g of [c, h]) {
        g.beginPath();
        for (let x = 0; x <= n; x += 4) {
          const y = y0 + Math.sin((x / n) * Math.PI * 2 * freq + ph) * amp + Math.sin((x / n) * 31 + ph) * 0.8;
          x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
        }
        g.stroke();
      }
    }
    // mắt gỗ
    for (let i = 0; i < 2; i++) {
      const x = r() * n, y = r() * n, rx = 10 + r() * 18;
      for (let j = 6; j > 0; j--) {
        c.strokeStyle = `rgba(60,32,14,${0.12 + j * 0.03})`; c.lineWidth = 1.5;
        c.beginPath(); c.ellipse(x, y, rx * j / 6 * 2.2, rx * j / 6 * 0.6, 0, 0, 6.283); c.stroke();
      }
    }
    speckle(c, n, r, n * 3, (v) => `rgba(${v > 0.5 ? 255 : 0},${v > 0.5 ? 230 : 0},${v > 0.5 ? 200 : 0},0.05)`);
  },

  esdMat(c, h, k, n, r, o) {
    c.fillStyle = o.color || '#2f7484'; c.fillRect(0, 0, n, n);
    h.fillStyle = '#707070'; h.fillRect(0, 0, n, n);
    k.fillStyle = '#d0d0d0'; k.fillRect(0, 0, n, n);
    speckle(c, n, r, n * 6, (v) => `rgba(${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},0.06)`);
    // lưới chấm nổi (bề mặt thảm ESD) — chấm sáng màu hơn nền
    const step = n / 32;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const cx = (x + 0.5 + (y % 2) * 0.5) * step, cy = (y + 0.5) * step;
      c.fillStyle = 'rgba(160,220,230,0.22)';
      c.beginPath(); c.arc(cx, cy, step * 0.18, 0, 6.283); c.fill();
      h.fillStyle = '#c8c8c8';
      h.beginPath(); h.arc(cx, cy, step * 0.2, 0, 6.283); h.fill();
    }
  },

  tiles(c, h, k, n, r, o) {
    // 4×4 viên gạch vinyl/ceramic mỗi ảnh; mạch vữa lõm
    c.fillStyle = '#6d7277'; c.fillRect(0, 0, n, n);
    h.fillStyle = '#202020'; h.fillRect(0, 0, n, n);
    k.fillStyle = '#e0e0e0'; k.fillRect(0, 0, n, n);
    const cells = 4, s = n / cells, grout = Math.max(2, n / 256);
    const base = o.color || null;
    for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
      const v = 0.92 + r() * 0.1;
      const col = base || `rgb(${Math.round(196 * v)},${Math.round(200 * v)},${Math.round(204 * v)})`;
      c.fillStyle = col;
      c.fillRect(x * s + grout, y * s + grout, s - grout * 2, s - grout * 2);
      h.fillStyle = '#b0b0b0';
      h.fillRect(x * s + grout, y * s + grout, s - grout * 2, s - grout * 2);
      k.fillStyle = `rgb(${90 + r() * 40 | 0},${90 + r() * 40 | 0},${90 + r() * 40 | 0})`;
      k.fillRect(x * s + grout, y * s + grout, s - grout * 2, s - grout * 2);
    }
    speckle(c, n, r, n * 10, (v) => `rgba(${v > 0.6 ? 90 : 240},${v > 0.6 ? 95 : 240},${v > 0.6 ? 100 : 245},0.18)`);
  },

  paint(c, h, k, n, r, o) {
    c.fillStyle = o.color || '#dfe3e3'; c.fillRect(0, 0, n, n);
    h.fillStyle = '#808080'; h.fillRect(0, 0, n, n);
    k.fillStyle = '#cfcfcf'; k.fillRect(0, 0, n, n);
    // "vỏ cam" của sơn lăn
    for (let i = 0; i < n * 4; i++) {
      const x = r() * n, y = r() * n, rad = 1 + r() * 3, v = r();
      h.fillStyle = `rgba(${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},0.08)`;
      h.beginPath(); h.arc(x, y, rad, 0, 6.283); h.fill();
      c.fillStyle = `rgba(${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},0.025)`;
      c.beginPath(); c.arc(x, y, rad, 0, 6.283); c.fill();
    }
  },

  concrete(c, h, k, n, r, o) {
    c.fillStyle = o.color || '#8d8f8f'; c.fillRect(0, 0, n, n);
    h.fillStyle = '#808080'; h.fillRect(0, 0, n, n);
    k.fillStyle = '#e8e8e8'; k.fillRect(0, 0, n, n);
    for (let i = 0; i < 300; i++) {
      const x = r() * n, y = r() * n, rad = 4 + r() * 30, v = r();
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `rgba(${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},0.06)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    speckle(c, n, r, n * 12, (v) => `rgba(${v > 0.5 ? 220 : 40},${v > 0.5 ? 220 : 40},${v > 0.5 ? 220 : 40},0.25)`);
    speckle(h, n, r, n * 8, (v) => (v > 0.5 ? '#a0a0a0' : '#606060'));
  },

  brushedMetal(c, h, k, n, r, o) {
    c.fillStyle = o.color || '#a9afb5'; c.fillRect(0, 0, n, n);
    h.fillStyle = '#808080'; h.fillRect(0, 0, n, n);
    k.fillStyle = '#707070'; k.fillRect(0, 0, n, n);
    // vết xước chải ngang dài
    for (let i = 0; i < n * 3; i++) {
      const y = r() * n, x = r() * n, len = 20 + r() * n * 0.6, v = r();
      c.strokeStyle = `rgba(${v > 0.5 ? 255 : 30},${v > 0.5 ? 255 : 30},${v > 0.5 ? 255 : 30},${0.04 + r() * 0.06})`;
      c.lineWidth = 0.5 + r();
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + len, y + (r() - 0.5) * 1.5); c.stroke();
      k.strokeStyle = `rgba(${v > 0.5 ? 200 : 60},${v > 0.5 ? 200 : 60},${v > 0.5 ? 200 : 60},0.15)`;
      k.beginPath(); k.moveTo(x, y); k.lineTo(x + len, y); k.stroke();
      h.strokeStyle = `rgba(${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},0.05)`;
      h.beginPath(); h.moveTo(x, y); h.lineTo(x + len, y); h.stroke();
    }
  },

  pinboard(c, h, k, n, r, o) {
    // bảng gỗ ép đục lỗ treo dụng cụ (pegboard) — lỗ bước 25.4 mm, ảnh = 8×8 lỗ
    c.fillStyle = o.color || '#c9a67a'; c.fillRect(0, 0, n, n);
    h.fillStyle = '#c0c0c0'; h.fillRect(0, 0, n, n);
    k.fillStyle = '#bdbdbd'; k.fillRect(0, 0, n, n);
    speckle(c, n, r, n * 8, (v) => `rgba(${v > 0.5 ? 120 : 250},${v > 0.5 ? 80 : 230},${v > 0.5 ? 40 : 200},0.12)`);
    const holes = 8, s = n / holes;
    for (let y = 0; y < holes; y++) for (let x = 0; x < holes; x++) {
      const cx = (x + 0.5) * s, cy = (y + 0.5) * s, rad = s * 0.12;
      c.fillStyle = '#1b1712'; c.beginPath(); c.arc(cx, cy, rad, 0, 6.283); c.fill();
      c.strokeStyle = 'rgba(255,240,220,0.25)'; c.lineWidth = 1; c.beginPath(); c.arc(cx, cy + 0.8, rad + 0.6, 0.2, 2.9); c.stroke();
      h.fillStyle = '#000'; h.beginPath(); h.arc(cx, cy, rad, 0, 6.283); h.fill();
    }
  },

  pcb(c, h, k, n, r, o) {
    const MASK = { green: ['#1f6b3a', '#2f8a4c'], blue: ['#1d4f91', '#2c66b0'], black: ['#15171a', '#2a2e33'], red: ['#8c1f24', '#a8343a'] };
    const [maskCol, traceCol] = MASK[o.mask] || MASK.green;
    c.fillStyle = maskCol; c.fillRect(0, 0, n, n);
    h.fillStyle = '#808080'; h.fillRect(0, 0, n, n);
    k.fillStyle = '#707070'; k.fillRect(0, 0, n, n);
    // đường mạch: đoạn thẳng + gấp khúc 45° (giống router PCB)
    const u = n / 64;
    c.lineCap = h.lineCap = 'round';
    for (let i = 0; i < 46; i++) {
      let x = Math.round(r() * 64) * u, y = Math.round(r() * 64) * u;
      const w = (r() < 0.25 ? 1.6 : 0.7) * u;
      c.strokeStyle = traceCol; c.lineWidth = w;
      h.strokeStyle = '#a0a0a0'; h.lineWidth = w;
      c.beginPath(); h.beginPath(); c.moveTo(x, y); h.moveTo(x, y);
      for (let s = 0; s < 3; s++) {
        const dir = Math.floor(r() * 8) * (Math.PI / 4), len = (4 + r() * 18) * u;
        x += Math.round(Math.cos(dir)) * len; y += Math.round(Math.sin(dir)) * len;
        c.lineTo(x, y); h.lineTo(x, y);
      }
      c.stroke(); h.stroke();
      // via ở cuối đường
      c.fillStyle = '#d8c27a'; c.beginPath(); c.arc(x, y, w * 1.4, 0, 6.283); c.fill();
      c.fillStyle = '#20251f'; c.beginPath(); c.arc(x, y, w * 0.6, 0, 6.283); c.fill();
    }
    // pad linh kiện (mạ thiếc) — hàng chân kiểu DIP
    for (let j = 0; j < 4; j++) {
      const x0 = (6 + r() * 40) * u, y0 = (6 + r() * 50) * u;
      for (let p = 0; p < 6; p++) for (const dy of [0, 7.6 * u]) {
        c.fillStyle = '#cfd3d6'; c.beginPath(); c.arc(x0 + p * 2.54 * u, y0 + dy, 0.9 * u, 0, 6.283); c.fill();
        c.fillStyle = '#111'; c.beginPath(); c.arc(x0 + p * 2.54 * u, y0 + dy, 0.4 * u, 0, 6.283); c.fill();
        h.fillStyle = '#b0b0b0'; h.beginPath(); h.arc(x0 + p * 2.54 * u, y0 + dy, 0.9 * u, 0, 6.283); h.fill();
        k.fillStyle = '#404040'; k.beginPath(); k.arc(x0 + p * 2.54 * u, y0 + dy, 0.9 * u, 0, 6.283); k.fill();
      }
      // khung silkscreen quanh IC
      c.strokeStyle = 'rgba(240,240,240,0.85)'; c.lineWidth = 0.35 * u;
      c.strokeRect(x0 - 1.5 * u, y0 + 1.2 * u, 5 * 2.54 * u + 3 * u, 5.2 * u);
    }
    // chữ silkscreen
    c.fillStyle = 'rgba(245,245,245,0.9)';
    c.font = `bold ${Math.round(2.6 * u)}px monospace`;
    const labels = ['R1', 'R2', 'C3', 'C4', 'U1', 'D2', 'J1', 'Q1', '+5V', 'GND', 'SW1', 'TP3'];
    for (let i = 0; i < 14; i++) c.fillText(labels[Math.floor(r() * labels.length)], r() * 58 * u, (4 + r() * 58) * u);
    if (o.label) { c.font = `bold ${Math.round(3.4 * u)}px sans-serif`; c.fillText(o.label, 3 * u, 62 * u); }
  },
};

/**
 * Tạo bộ texture cho một loại vật liệu.
 * @returns {{map: THREE.Texture|null, normalMap?: THREE.Texture, roughnessMap?: THREE.Texture}}
 */
export function makeTexture(kind, opts = {}) {
  const painter = PAINTERS[kind];
  if (!painter) throw new Error(`textures: không có loại '${kind}' (có: ${TEXTURE_KINDS.join(', ')})`);
  const preset = _quality?.preset || { textureSize: 1024, normalMaps: true, anisotropy: 8 };
  const size = Math.min(2048, opts.size || preset.textureSize || 1024);
  const key = `${kind}|${size}|${preset.normalMaps ? 1 : 0}|${JSON.stringify(opts)}`;
  if (_cache.has(key)) return _cache.get(key);

  const cc = canvas(size);
  if (!cc) { const r = { map: null }; _cache.set(key, r); return r; }   // Node: không vẽ được
  const hc = canvas(size), kc = canvas(size);
  painter(cc.getContext('2d'), hc.getContext('2d'), kc.getContext('2d'), size, rng(opts.seed ?? kind.length * 977), opts);

  const rep = opts.repeat || [1, 1];
  const wrap = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rep[0], rep[1]);
    t.anisotropy = preset.anisotropy || 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const out = { map: wrap(cc, true) };
  if (preset.normalMaps) {
    out.normalMap = wrap(normalFromHeight(hc, opts.normalStrength ?? 2.5), false);
    out.roughnessMap = wrap(kc, false);
  }
  _cache.set(key, out);
  return out;
}

/** Thông số vật liệu mặc định cho từng loại */
const MAT_DEFAULTS = {
  wood: { roughness: 0.62, metalness: 0 },
  esdMat: { roughness: 0.85, metalness: 0 },
  tiles: { roughness: 0.45, metalness: 0 },
  paint: { roughness: 0.9, metalness: 0 },
  concrete: { roughness: 0.95, metalness: 0 },
  brushedMetal: { roughness: 0.38, metalness: 1 },
  pinboard: { roughness: 0.8, metalness: 0 },
  pcb: { roughness: 0.5, metalness: 0 },
};

/** MeshStandardMaterial đã gắn texture thủ tục. opts.material: thông số vật liệu thêm (color, roughness…) */
export function makeMaterial(kind, opts = {}) {
  const { material: extra = {}, ...texOpts } = opts;
  const tex = makeTexture(kind, texOpts);
  const params = { color: 0xffffff, ...MAT_DEFAULTS[kind], ...extra };
  if (tex.map) params.map = tex.map;
  else if (!extra.color) params.color = ({ wood: 0x9a6a3f, esdMat: 0x2f7484, tiles: 0xc4c8cc, paint: 0xdfe3e3, concrete: 0x8d8f8f, brushedMetal: 0xa9afb5, pinboard: 0xc9a67a, pcb: 0x1f6b3a })[kind];
  if (tex.normalMap) { params.normalMap = tex.normalMap; params.normalScale = new THREE.Vector2(0.6, 0.6); }
  if (tex.roughnessMap) params.roughnessMap = tex.roughnessMap;
  return new THREE.MeshStandardMaterial(params);
}

/** Gắn vào game: game.textures = createTextures(game) */
export function createTextures(game) {
  _quality = game?.quality || null;
  return {
    kinds: TEXTURE_KINDS,
    get: makeTexture,
    material: makeMaterial,
    ...Object.fromEntries(TEXTURE_KINDS.map((k) => [k, (o) => makeTexture(k, o)])),
    clearCache() { for (const t of _cache.values()) for (const x of Object.values(t)) x?.dispose?.(); _cache.clear(); },
  };
}
