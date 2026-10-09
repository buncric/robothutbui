// =============================================================================
// _solder_visual.js — Hình ảnh cho minigame hàn: hình nón thiếc (fillet) theo thể tích + chất lượng, cầu thiếc giữa
// 2 pad, pad bong, vệt nhựa thông, bọt nhựa thông phát sáng, mẩu chân bị cắt văng, vết chảy nhựa, đồng hồ nổi (DOM).
// (KHÔNG export default.)  Mọi geometry được cache theo khoá lượng tử hoá (không tạo mới mỗi khung).
// =============================================================================
import * as THREE from 'three';
import { clamp, clamp01, STATE_INFO } from './_solder_physics.js';

const HAS_DOC = typeof document !== 'undefined' && typeof document.createElement === 'function';

// ----------------------------------------------------------------------------- vật liệu (dùng chung)
let _M = null;
export function solderMats() {
  if (_M) return _M;
  const std = (color, metalness, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
  _M = {
    good: std(0xe8ebee, 1, 0.1),                         // thiếc bóng như gương
    molten: std(0xf4f6f8, 1, 0.04),                      // thiếc lỏng: bóng hơn, gợn
    cold: std(0x75787b, 0.75, 0.6),                      // nguội: xám đục, sần
    oxide: std(0x7d786f, 0.45, 0.88),                    // cháy hết nhựa thông: xỉn vàng xám
    lifted: std(0x8a4b2a, 0.85, 0.55),                   // vòng đồng tróc, đổi màu
    scorch: std(0x2a1a10, 0, 1, { transparent: true, opacity: 0.75, depthWrite: false }),
    flux: new THREE.MeshStandardMaterial({ color: 0xd99a2b, metalness: 0, roughness: 0.08, transparent: true, opacity: 0.55, depthWrite: false }),
    bubble: new THREE.MeshBasicMaterial({ color: 0xffc35a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    melt: std(0x2b1d14, 0, 1, { transparent: true, opacity: 0.85, depthWrite: false }),
    lead: std(0xdde1e4, 1, 0.27),
    ball: std(0xe6e9eb, 1, 0.15),
    // [PRO] lỗi theo docs/07 §4.2, §5.5
    overheated: std(0x5f605b, 0.5, 0.74),                // quá nhiệt: xỉn, sần như phấn (liên kim dày)
    frosted: std(0xa8acaf, 0.8, 0.46),                   // xáo động: mờ "đóng băng"
    char: new THREE.MeshStandardMaterial({ color: 0x1e120a, metalness: 0, roughness: 0.35, transparent: true, opacity: 0.88, depthWrite: false }),
    charBrown: new THREE.MeshStandardMaterial({ color: 0x5a3416, metalness: 0, roughness: 0.3, transparent: true, opacity: 0.75, depthWrite: false }),
    scorchBrown: std(0x6b4322, 0, 1, { transparent: true, opacity: 0.6, depthWrite: false }),
    measle: new THREE.MeshStandardMaterial({ color: 0xf4f1e6, metalness: 0, roughness: 0.9, transparent: true, opacity: 0.85, depthWrite: false }),
    copper: std(0xc87a45, 1, 0.42),                       // đồng lộ ra (không thấm ướt)
    pinhole: new THREE.MeshBasicMaterial({ color: 0x050505 }),
    clip: std(0xc8763a, 1, 0.3),
  };
  for (const k of ['char', 'charBrown', 'scorchBrown', 'measle']) { _M[k].polygonOffset = true; _M[k].polygonOffsetFactor = -3; }
  _M.scorch.polygonOffset = true; _M.scorch.polygonOffsetFactor = -2;
  _M.flux.polygonOffset = true; _M.flux.polygonOffsetFactor = -3;
  _M.melt.polygonOffset = true; _M.melt.polygonOffsetFactor = -2;
  return _M;
}
/** Vật liệu theo trạng thái pad */
export function matForPad(pad) {
  const M = solderMats();
  if (pad.molten) return M.molten;
  const d = pad.defects || {};
  if (pad.state === 'cold') return pad.oxide > 0.6 ? M.oxide : M.cold;
  if (pad.state === 'lifted') return pad.wetting > 0.6 ? M.good : M.cold;
  if (d.overheated) return M.overheated;
  if (d.disturbed) return M.frosted;
  return M.good;
}

// ----------------------------------------------------------------------------- [PRO] chi tiết lỗi (cache, dùng chung)
let _icicle = null, _pin = null, _measle = null, _spot = null, _ballS = null, _ringCu = null;
/** Gai thiếc (icicle) cao 1 mm, gốc ở y = 0 */
export const icicleGeo = () => (_icicle ||= new THREE.ConeGeometry(0.22, 1.1, 8).translate(0, 0.55, 0));
/** Chấm lỗ khí (pinhole) */
export const pinholeGeo = () => (_pin ||= new THREE.CircleGeometry(0.07, 8));
/** Cụm đốm trắng measling quanh pad (nằm trên mặt phẳng XZ) */
export const measleGeo = () => (_measle ||= (() => {
  const geos = [];
  for (let i = 0; i < 9; i++) {
    const a = i * 2.39996, r = 1.25 + (i % 3) * 0.32;
    const g = new THREE.CircleGeometry(0.12 + (i % 2) * 0.07, 7); g.rotateX(-Math.PI / 2); g.translate(Math.cos(a) * r, 0, Math.sin(a) * r);
    geos.push(g);
  }
  return mergeGeos(geos);
})());
/** Vệt flux cháy (đĩa méo) */
export const charGeo = () => (_spot ||= (() => {
  const g = new THREE.CircleGeometry(1.35, 48); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z); if (r < 0.01) continue; const a = Math.atan2(z, x); const k = 1 + 0.09 * Math.sin(3 * a + 1) + 0.05 * Math.sin(7 * a + 0.4); p.setX(i, x * k); p.setZ(i, z * k); }
  return g;
})());
/** Hạt thiếc văng nhỏ */
export const smallBallGeo = () => (_ballS ||= new THREE.SphereGeometry(0.16, 8, 6));
/** Vòng đồng lộ (non-wetting) */
export const copperRingGeo = () => (_ringCu ||= (() => { const g = new THREE.RingGeometry(0.62, 0.9, 20); g.rotateX(-Math.PI / 2); return g; })());

function mergeGeos(list) {
  let n = 0, ni = 0;
  for (const g of list) { n += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), idx = [];
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    if (g.index) for (const i of g.index.array) idx.push(i + o); else for (let i = 0; i < g.attributes.position.count; i++) idx.push(i + o);
    o += g.attributes.position.count;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setIndex(idx);
  void ni;
  return m;
}

// ----------------------------------------------------------------------------- hình nón thiếc
const GEO = new Map();
const SAMPLES = 16;

/** Biên dạng bán kính R(t), t = 0 (mặt pad) → 1 (đỉnh) */
function profile(shape, t, Rb, rl, bulge) {
  const m = shape === 'good' ? 0.55 : shape === 'cold' ? 1.7 : shape === 'dome' ? 2 : 2.2;
  const base = rl + (Rb - rl) * Math.pow(Math.max(0, 1 - Math.pow(t, m)), 1 / m);
  return base + bulge * Math.sin(Math.PI * Math.min(1, t * 1.05)) * Rb;
}
/** Thể tích (mm³) của fillet cao H với biên dạng đã chọn (trừ phần chân xuyên qua) */
function volumeOf(shape, H, Rb, rl, bulge) {
  let s = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const t = (i + 0.5) / SAMPLES;
    const r = profile(shape, t, Rb, rl, bulge);
    s += Math.max(0, r * r - rl * rl);
  }
  return Math.PI * H * (s / SAMPLES);
}

/**
 * Geometry hình nón thiếc (trục +Y = pháp tuyến pad, gốc ở mặt pad).
 *   kind: 'good' (lõm, ôm chân) | 'cold' (cục tròn không thấm, sần) | 'excess' (phồng) | 'film' (lớp mỏng)
 *   V: thể tích fillet (mm³, đã trừ phần lấp lỗ) · ring: bán kính vòng đồng · rl: bán kính chân (0 = không chân)
 *   Hmax: chiều cao tối đa (độ nhô của chân)
 */
export function filletGeometry(kind, V, ring, rl, Hmax, cutH = null) {
  const Vq = Math.round(V / 0.05) * 0.05;
  const cq = cutH == null ? -1 : Math.round(cutH * 10) / 10;
  const key = `${kind}|${Vq.toFixed(2)}|${ring.toFixed(2)}|${rl.toFixed(2)}|${(Math.round(Hmax * 4) / 4).toFixed(2)}|${cq}`;
  let g = GEO.get(key);
  if (g) return g;
  const shape = kind === 'good' || kind === 'grainy' ? (rl > 0 ? 'good' : 'dome') : kind === 'cold' ? 'cold' : kind === 'film' ? 'dome' : 'excess';
  const Rb = kind === 'cold' ? ring * 0.82 : ring;
  const vol = Math.max(0.01, Vq);
  let bulge = 0, H;
  const Vu = volumeOf(shape, 1, Rb, rl, 0);
  H = vol / Math.max(1e-4, Vu);
  const Hcap = kind === 'film' ? 0.18 : Math.max(0.5, Hmax);
  if (H > Hcap) {
    // không đủ chỗ theo chiều cao → phồng ra (cục tròn): tìm bulge sao cho thể tích khớp
    H = Hcap;
    let lo = 0, hi = 3;
    for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (volumeOf(shape, H, Rb, rl, mid) < vol) lo = mid; else hi = mid; }
    bulge = lo;
  }
  if (kind === 'film') H = Math.min(H, 0.18);
  const pts = [];
  const N = 20;
  // [PRO] chân đã cắt sau khi hàn: nón thiếc bị kìm cắt phẳng ở độ cao cắt (mặt cắt phẳng quanh đầu chân)
  const tc = cq > 0 && cq < H ? cq / H : 1;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * tc;
    pts.push(new THREE.Vector2(Math.max(rl + 0.005, profile(shape, t, Rb, rl, bulge)), t * H));
  }
  if (tc < 1) pts.push(new THREE.Vector2(rl + 0.005, tc * H));
  if (rl <= 0) pts.push(new THREE.Vector2(0, tc * H));
  pts.unshift(new THREE.Vector2(rl > 0 ? Math.max(0, Rb - 0.02) : 0, 0));
  const SEG = 36;
  g = new THREE.LatheGeometry(pts, SEG);
  if (kind === 'cold' || kind === 'excess' || kind === 'grainy') {
    // bề mặt sần (nguội) / gợn (thừa) / hạt (quá nhiệt) — nhiễu xác định theo góc + chiều cao
    const amp = kind === 'cold' ? 0.16 : kind === 'grainy' ? 0.07 : 0.04;
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const r = Math.hypot(x, z);
      if (r <= rl + 0.02 || y < 0.01) continue;
      const a = Math.atan2(z, x);
      const n = kind === 'grainy'
        ? Math.sin(17 * a + y * 23) * 0.5 + Math.sin(29 * a - y * 31 + 0.7) * 0.5
        : Math.sin(3 * a + y * 5) * 0.5 + Math.sin(7 * a - y * 9 + 1.3) * 0.3 + Math.sin(11 * a + 2.1 + y * 3) * 0.2;
      const k = 1 + amp * n;
      p.setX(i, x * k); p.setZ(i, z * k);
    }
    g.computeVertexNormals();
    fixSeam(g, pts.length, SEG);
  }
  g.userData.height = H * tc;
  g.userData.bulge = bulge;
  if (GEO.size > 400) GEO.delete(GEO.keys().next().value);
  GEO.set(key, g);
  return g;
}

/** LatheGeometry sau computeVertexNormals: cột đầu (góc 0) và cột cuối (2π) trùng vị trí → lấy trung bình pháp tuyến (hết vệt nối) */
function fixSeam(g, nPts, seg) {
  const nr = g.attributes.normal;
  for (let j = 0; j < nPts; j++) {
    const a = j, b = seg * nPts + j;
    const x = nr.getX(a) + nr.getX(b), y = nr.getY(a) + nr.getY(b), z = nr.getZ(a) + nr.getZ(b);
    const L = Math.hypot(x, y, z) || 1;
    nr.setXYZ(a, x / L, y / L, z / L); nr.setXYZ(b, x / L, y / L, z / L);
  }
  nr.needsUpdate = true;
}

/** Cầu thiếc dài len (mm) dọc trục X (hình con nhộng dẹt) */
const BRIDGE = new Map();
export function bridgeGeometry(len) {
  const L = Math.round(len * 10) / 10;
  let g = BRIDGE.get(L);
  if (!g) {
    g = new THREE.CapsuleGeometry(0.5, Math.max(0.1, L), 4, 12);
    g.rotateZ(Math.PI / 2);
    BRIDGE.set(L, g);
  }
  return g;
}

let _stub = null;
/** Trụ chân linh kiện đơn vị (r = 1, cao 1, gốc ở đáy) — scale theo bán kính/độ nhô */
export const leadStubGeo = () => (_stub ||= new THREE.CylinderGeometry(1, 1, 1, 16).translate(0, 0.5, 0));
let _ring = null, _disc = null, _scorchG = null, _bubbleG = null, _ballG = null, _meltG = null;
export const liftedRingGeo = () => (_ring ||= (() => { const g = new THREE.RingGeometry(0.5, 0.95, 18); g.rotateX(-Math.PI / 2); return g; })());
export const fluxDiscGeo = () => (_disc ||= (() => { const g = new THREE.CircleGeometry(1.25, 20); g.rotateX(-Math.PI / 2); return g; })());
export const scorchGeo = () => (_scorchG ||= (() => { const g = new THREE.RingGeometry(0.9, 2.1, 22); g.rotateX(-Math.PI / 2); return g; })());
export const bubbleGeo = () => (_bubbleG ||= new THREE.SphereGeometry(0.22, 8, 6));
export const ballGeo = () => (_ballG ||= new THREE.SphereGeometry(0.55, 10, 8));
export const meltGeo = () => (_meltG ||= (() => { const g = new THREE.CircleGeometry(1.4, 16); return g; })());

// ----------------------------------------------------------------------------- hiệu ứng động (bọt, mẩu chân, giọt thiếc)
const _v = new THREE.Vector3();
/** Bể hạt dùng lại (không cấp phát mỗi khung) */
export class Particles {
  constructor(scene, count = 24) {
    this.group = new THREE.Group();
    this.group.name = 'solder-fx';
    scene?.add(this.group);
    const M = solderMats();
    this.bubbles = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(bubbleGeo(), M.bubble);
      m.visible = false; m.frustumCulled = false; m.userData.noInteract = true;
      this.group.add(m);
      this.bubbles.push({ m, life: 0, max: 1, v: new THREE.Vector3() });
    }
    this.flyers = [];     // { m, v, w, life, ground }
    this._i = 0;
  }
  /** Bọt nhựa thông sôi lăn tăn tại điểm p (thế giới), n = pháp tuyến hướng ra */
  bubble(p, n, size = 1) {
    const b = this.bubbles[this._i++ % this.bubbles.length];
    b.m.visible = true;
    b.m.position.copy(p).addScaledVector(_v.set(Math.random() - 0.5, 0, Math.random() - 0.5), 1.4);
    b.m.scale.setScalar(size * (0.5 + Math.random() * 0.8));
    b.v.copy(n).multiplyScalar(2 + Math.random() * 3).add(_v.set((Math.random() - 0.5) * 2, 4 + Math.random() * 4, (Math.random() - 0.5) * 2));
    b.life = b.max = 0.35 + Math.random() * 0.4;
  }
  /** Vật bay (mẩu chân bị cắt, giọt thiếc rơi): mesh đã đặt ở vị trí thế giới */
  fly(mesh, vel, spin, life = 2.0) {
    mesh.userData.noInteract = true;
    this.group.add(mesh);
    this.flyers.push({ m: mesh, v: vel.clone(), w: spin.clone(), life });
  }
  update(dt, floorY = 0) {
    for (const b of this.bubbles) {
      if (!b.m.visible) continue;
      b.life -= dt;
      if (b.life <= 0) { b.m.visible = false; continue; }
      b.m.position.addScaledVector(b.v, dt);
      const k = b.life / b.max;
      b.m.scale.multiplyScalar(1 + dt * 0.8);
      b.m.visible = k > 0.02;
    }
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.life -= dt;
      f.v.y -= 9810 * dt;
      f.m.position.addScaledVector(f.v, dt);
      f.m.rotation.x += f.w.x * dt; f.m.rotation.y += f.w.y * dt; f.m.rotation.z += f.w.z * dt;
      if (f.m.position.y < floorY) { f.m.position.y = floorY; f.v.multiplyScalar(-0.25); f.v.y = Math.abs(f.v.y); f.w.multiplyScalar(0.5); }
      if (f.life <= 0) { this.group.remove(f.m); if (f.m.userData.disposeGeo) f.m.geometry.dispose(); this.flyers.splice(i, 1); }
    }
  }
}

// ----------------------------------------------------------------------------- đồng hồ nổi cạnh pad (DOM)
const CSS = `
.rvs-gauge{position:fixed;left:0;top:0;z-index:12;pointer-events:none;min-width:190px;padding:8px 10px;border-radius:10px;
 background:rgba(10,14,20,.78);border:1px solid rgba(255,255,255,.1);color:#e8eef5;font:12px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;
 box-shadow:0 6px 22px rgba(0,0,0,.4);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);transition:opacity .15s}
.rvs-gauge b{font-size:12.5px}.rvs-gauge .st{float:right;font-weight:800;margin-left:10px}
.rvs-gauge .bar{position:relative;height:7px;margin:6px 0 4px;border-radius:4px;background:linear-gradient(90deg,#2b3a4a,#3f5d7a 40%,#e0a43a 70%,#e2523a)}
.rvs-gauge .bar i{position:absolute;top:-3px;width:3px;height:13px;margin-left:-1px;background:#fff;border-radius:2px;box-shadow:0 0 4px #fff}
.rvs-gauge .bar em{position:absolute;top:0;width:1px;height:7px;background:rgba(255,255,255,.65)}
.rvs-gauge .bar em.f{background:#ffd166}
.rvs-gauge .row{display:flex;justify-content:space-between;gap:10px;white-space:nowrap}
.rvs-gauge .dim{color:#9fb3c8}
.rvs-gauge .warn{color:#ff8f8f;font-weight:700}
.rvs-burn{position:fixed;inset:0;z-index:13;pointer-events:none;display:flex;align-items:center;justify-content:center;
 font:900 64px/1 system-ui,sans-serif;color:#fff;text-shadow:0 0 18px #ff3b1f,0 0 40px #ff3b1f;opacity:0;transition:opacity .6s}
`;
export class Gauge {
  constructor() {
    this.has = HAS_DOC && !!document.body;
    this.visible = false;
    this._key = '';
    if (!this.has) return;
    if (!document.getElementById('rvs-gauge-css')) {
      const s = document.createElement('style'); s.id = 'rvs-gauge-css'; s.textContent = CSS; document.head.appendChild(s);
    }
    this.el = document.createElement('div');
    this.el.className = 'rvs-gauge';
    this.el.style.opacity = '0';
    document.body.appendChild(this.el);
    this.burnEl = document.createElement('div');
    this.burnEl.className = 'rvs-burn';
    this.burnEl.textContent = 'BỎNG TAY!';
    document.body.appendChild(this.burnEl);
  }
  hide() { if (this.has && this.visible) { this.visible = false; this.el.style.opacity = '0'; } }
  /** d = { x, y (px màn hình), title, state, padT, tipT, vol, lim, wet, flux, alloy, warn } */
  show(d) {
    if (!this.has) return;
    if (!this.visible) { this.visible = true; this.el.style.opacity = '1'; }
    this.el.style.transform = `translate(${Math.round(d.x)}px, ${Math.round(d.y)}px)`;
    const key = [d.title, d.state, Math.round(d.padT / 2), Math.round(d.tipT / 2), d.vol.toFixed(1), Math.round(d.wet * 20), Math.round(d.flux * 10), d.warn || ''].join('|');
    if (key === this._key) return;
    this._key = key;
    const info = STATE_INFO[d.state] || STATE_INFO.empty;
    const pos = (T) => `${clamp01((T - 20) / 430) * 100}%`;
    const lim = d.lim;
    const volCls = d.vol > lim.max ? 'warn' : '';
    this.el.innerHTML = `<b>${esc(d.title)}</b><span class="st" style="color:${info.color}">${info.vi}</span>
      <div class="bar"><em style="left:${pos(d.alloy.liquidus)}" title="chảy lỏng"></em><em class="f" style="left:${pos(d.alloy.flowT)}"></em><i style="left:${pos(d.padT)}"></i></div>
      <div class="row"><span>Pad <b>${Math.round(d.padT)} °C</b></span><span class="dim">${d.tipT == null ? 'Mũi —' : `Mũi ${Math.round(d.tipT)} °C`}</span></div>
      <div class="row"><span class="${volCls}">Thiếc ${d.vol.toFixed(1)} mm³</span><span class="dim">đủ ${lim.min.toFixed(1)}–${lim.max.toFixed(1)}</span></div>
      <div class="row"><span>Thấm ướt ${Math.round(d.wet * 100)} %</span><span class="dim">Nhựa thông ${bar(d.flux)}</span></div>
      ${d.warn ? `<div class="warn">${esc(d.warn)}</div>` : `<div class="dim">${esc(d.alloy.name)} · chảy loang ≥ ${d.alloy.flowT} °C</div>`}`;
  }
  burn() {
    if (!this.has) return;
    const e = this.burnEl;
    e.style.transition = 'none'; e.style.opacity = '1';
    requestAnimationFrame(() => requestAnimationFrame(() => { e.style.transition = 'opacity 1.4s'; e.style.opacity = '0'; }));
  }
  dispose() { this.el?.remove(); this.burnEl?.remove(); }
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const bar = (f) => { const n = Math.round(clamp(f / 0.5, 0, 1) * 4); return '▮'.repeat(n) + '▯'.repeat(4 - n); };
