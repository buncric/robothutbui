// Bo mạch module + linh kiện dán (SMD) + đầu nối trên board. KHÔNG export default.
// Mọi hàm "B" nhận bộ gộp B của staticParts() (xem _shared.js), toạ độ trên mặt board (y = 0 là mặt trên đồng).
import {
  THREE, PM, cached, colorMat, gBox, gCyl, gDisc, gRing, gLathe, extrudeY, roundRectShape, circlePath, taperBox, tf, mergeGeometries, PITCH,
} from '../_shared.js';

// ----------------------------------------------------------------------------- tấm PCB
/** Geometry tấm PCB (đáy y=0, mặt trên y=t), lỗ bắt vít holes:[[x,z,r]] — nhóm 0 = phủ, nhóm 1 = cạnh FR-4 */
export function boardGeo(w, d, t = 1.6, { r = 1, holes = [], cut = null } = {}) {
  const key = `board:${w}:${d}:${t}:${r}:${JSON.stringify(holes)}:${cut ? JSON.stringify(cut) : ''}`;
  return cached(key, () => {
    const s = cut ? cut() : roundRectShape(w, d, r);
    for (const [x, z, hr] of holes) s.holes.push(circlePath(x, -z, hr));
    return extrudeY(s, t, { curveSeg: 10 });
  });
}
export function boardMesh(w, d, t, maskMat, opts = {}) {
  const m = new THREE.Mesh(boardGeo(w, d, t, opts), [maskMat, PM.fr4]);
  m.castShadow = true; m.receiveShadow = true;
  m.name = 'pcb';
  return m;
}
/** Vòng đồng quanh lỗ bắt vít (2 mặt) */
export function mountRing(B, x, z, t, r = 1.6, ro = 3.0, mat = PM.hasl) {
  B.add(gRing(r, ro, 20), mat, { x, y: t + 0.02, z }, { shadow: false });
  B.add(gRing(r, ro, 20), mat, { x, y: -0.02, z, rx: Math.PI }, { shadow: false });
  B.add(gCyl(r, r, t, 16, true), PM.hasl, { x, y: t / 2, z }, { shadow: false });
}

/** Pad tròn/chữ nhật (đồng) trên mặt board, lỗ xuyên tuỳ chọn */
export function padsTH(B, list, t, { ring = 0.85, hole = 0.5, mat = PM.hasl, both = true, square1 = false } = {}) {
  const top = [], bot = [], holes = [], sq = [];
  const M = new THREE.Matrix4();
  list.forEach(([x, z], i) => {
    if (square1 && i === 0) { sq.push(tf({ x, y: t + 0.02, z })); }
    else top.push(M.clone().makeTranslation(x, t + 0.02, z));
    if (both) bot.push(new THREE.Matrix4().compose(new THREE.Vector3(x, -0.02, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0)), new THREE.Vector3(1, 1, 1)));
    holes.push(M.clone().makeTranslation(x, t / 2, z));
  });
  B.inst(gRing(hole, ring, 14), mat, top);
  if (both) B.inst(gRing(hole, ring, 14), mat, bot);
  if (sq.length) B.inst(squareRingGeo(ring, hole), mat, sq);
  B.inst(gCyl(hole, hole, t + 0.02, 10, true), PM.holeGrey, holes);
}
export function squareRingGeo(ring, hole) {
  return cached(`sqring:${ring}:${hole}`, () => {
    const s = roundRectShape(ring * 2, ring * 2, 0.1);
    s.holes.push(circlePath(0, 0, hole));
    return extrudeY(s, 0.035, { curveSeg: 8 });
  });
}

// ----------------------------------------------------------------------------- SMD thụ động
const CHIP = { '0402': [1.0, 0.5, 0.35], '0603': [1.6, 0.8, 0.45], '0805': [2.0, 1.25, 0.5], '1206': [3.2, 1.6, 0.55], '1210': [3.2, 2.5, 0.6], '2512': [6.3, 3.2, 0.6] };
/** Điện trở/tụ SMD. kind 'R' (mặt đen) | 'C' (gốm nâu) | 'L' (cuộn cảm xám) */
export function chip(B, size, x, z, ry = 0, kind = 'R') {
  const [L, W, H] = CHIP[size] || CHIP['0603'];
  const cap = Math.max(0.2, L * 0.18);
  const body = kind === 'R' ? PM.chipR : kind === 'C' ? PM.ceramicTan : PM.ferrite;
  const g = B.group({ x, z, ry });
  g.add(gBox(L - 2 * cap + 0.02, H * 0.92, W * 0.98), body, { y: H * 0.46 }, { shadow: false });
  if (kind === 'R') g.add(gBox(L - 2 * cap, 0.02, W * 0.9), PM.ceramic, { y: 0.01 }, { shadow: false });
  for (const s of [-1, 1]) {
    g.add(gBox(cap, H, W, Math.min(0.08, H / 4), 1), PM.lead, { x: s * (L / 2 - cap / 2), y: H / 2 }, { shadow: false });
    g.add(solderFilletGeo(W), PM.solder, { x: s * (L / 2 + 0.05), y: 0, ry: s > 0 ? 0 : Math.PI }, { shadow: false });
  }
}
/** Gờ thiếc hàn ở đầu linh kiện SMD (nêm thấp) */
export function solderFilletGeo(w) {
  return cached(`fillet:${w}`, () => {
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.lineTo(0.35, 0); s.quadraticCurveTo(0.05, 0.05, 0, 0.32); s.lineTo(0, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false, curveSegments: 4 });
    g.translate(-0.05, 0, -w / 2);
    g.computeVertexNormals();
    return g;
  });
}

/** Chân cánh chim (gull-wing) SMD: dài l theo +X, rộng w */
export function gullWingGeo(l = 0.9, w = 0.4, h = 0.6, t = 0.15) {
  return cached(`gull:${l}:${w}:${h}:${t}`, () => {
    const s = new THREE.Shape();
    const a = l * 0.35;
    s.moveTo(0, h); s.lineTo(a * 0.6, h); s.lineTo(a, t); s.lineTo(l, t); s.lineTo(l, 0); s.lineTo(a - t * 0.4, 0); s.lineTo(a * 0.6 - t * 0.4, h - t); s.lineTo(0, h - t); s.lineTo(0, h);
    const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
    g.translate(0, 0, -w / 2);
    g.computeVertexNormals();
    return g;
  });
}

/** IC SOIC/TSSOP/HSOP. n chân, thân dài L × rộng W × cao H; pad nhiệt đáy tuỳ chọn. Chấm chân 1 ở góc (−X, +Z) */
export function soic(B, n, x, z, ry = 0, { pitch = 1.27, W = 3.9, H = 1.45, span = 6.0, lead = 0.42, ep = false, L } = {}) {
  const half = n / 2;
  const len = L ?? half * pitch + 0.4;
  const g = B.group({ x, z, ry });
  g.add(gBox(len, H - 0.1, W, 0.12, 1), PM.epoxy, { y: 0.1 + (H - 0.1) / 2 });
  g.add(gCyl(0.3, 0.3, 0.02, 12), PM.epoxyMark, { x: -len / 2 + 0.7, y: H + 0.005, z: W / 2 - 0.7 }, { shadow: false });
  const ll = (span - W) / 2;
  const mats = [];
  for (let i = 0; i < half; i++) {
    const px = -((half - 1) * pitch) / 2 + i * pitch;
    mats.push(tf({ x: px, z: W / 2 - 0.05, ry: -Math.PI / 2 }));
    mats.push(tf({ x: px, z: -W / 2 + 0.05, ry: Math.PI / 2 }));
  }
  g.many(gullWingGeo(ll + 0.05, lead, H * 0.55, 0.15), PM.lead, mats);
  if (ep) g.add(gBox(len * 0.55, 0.05, W * 0.55), PM.lead, { y: 0.02 }, { shadow: false });
}
/** QFN vuông: cạnh s, n pad mỗi cạnh */
export function qfn(B, s, x, z, ry = 0, { n = 6, H = 0.9, mark = true } = {}) {
  const g = B.group({ x, z, ry });
  g.add(gBox(s, H, s, 0.05, 1), PM.epoxy, { y: H / 2 });
  if (mark) g.add(gCyl(s * 0.07, s * 0.07, 0.02, 10), PM.epoxyMark, { x: -s / 2 + s * 0.15, y: H + 0.005, z: s / 2 - s * 0.15 }, { shadow: false });
  const p = s / (n + 1);
  const mats = [];
  for (let i = 0; i < n; i++) {
    const o = -s / 2 + p * (i + 1);
    mats.push(tf({ x: o, y: 0.1, z: s / 2 }), tf({ x: o, y: 0.1, z: -s / 2 }), tf({ x: s / 2, y: 0.1, z: o, ry: Math.PI / 2 }), tf({ x: -s / 2, y: 0.1, z: o, ry: Math.PI / 2 }));
  }
  g.many(gBox(p * 0.5, 0.2, 0.25), PM.lead, mats);
}
/** SOT-23 (3 chân) / SOT-23-5 */
export function sot23(B, x, z, ry = 0, { five = false } = {}) {
  const g = B.group({ x, z, ry });
  g.add(gBox(2.9, 1.0, 1.3, 0.08, 1), PM.epoxy, { y: 0.6 });
  const mats = five
    ? [tf({ x: -0.95, z: 0.65, ry: -Math.PI / 2 }), tf({ x: 0, z: 0.65, ry: -Math.PI / 2 }), tf({ x: 0.95, z: 0.65, ry: -Math.PI / 2 }), tf({ x: -0.95, z: -0.65, ry: Math.PI / 2 }), tf({ x: 0.95, z: -0.65, ry: Math.PI / 2 })]
    : [tf({ x: -0.95, z: 0.65, ry: -Math.PI / 2 }), tf({ x: 0.95, z: 0.65, ry: -Math.PI / 2 }), tf({ x: 0, z: -0.65, ry: Math.PI / 2 })];
  g.many(gullWingGeo(0.6, 0.4, 0.6, 0.12), PM.lead, mats);
}
/** SOT-223 (LDO): 3 chân + tab */
export function sot223(B, x, z, ry = 0) {
  const g = B.group({ x, z, ry });
  g.add(gBox(6.5, 1.6, 3.5, 0.15, 1), PM.epoxy, { y: 0.9 });
  g.add(gBox(3.0, 0.25, 1.6), PM.lead, { y: 0.12, z: -2.8 });
  const mats = [-2.3, 0, 2.3].map((px) => tf({ x: px, z: 1.75, ry: -Math.PI / 2 }));
  g.many(gullWingGeo(1.6, 0.7, 0.9, 0.25), PM.lead, mats);
}
/** TO-263 (D²PAK) 5 chân: tab đồng to hàn xuống board */
export function to263(B, x, z, ry = 0, { n = 5 } = {}) {
  const g = B.group({ x, z, ry });
  g.add(gBox(10.1, 4.4, 8.9, 0.3, 1), PM.epoxy, { y: 2.3, z: -0.5 });
  g.add(gBox(10.4, 0.25, 2.2), PM.lead, { y: 0.13, z: -5.6 });
  g.add(gBox(8.0, 0.02, 8.0), PM.lead, { y: 0.01, z: -1 }, { shadow: false });
  const p = n === 5 ? 1.7 : 2.54;
  const mats = [];
  for (let i = 0; i < n; i++) mats.push(tf({ x: -((n - 1) * p) / 2 + i * p, z: 3.9, ry: -Math.PI / 2 }));
  g.many(gullWingGeo(2.6, 0.8, 1.8, 0.4), PM.lead, mats);
}
/** Diode SMA/SMB (dải catốt ở −X) */
export function smaDiode(B, x, z, ry = 0, { L = 4.3, W = 2.6, H = 2.1 } = {}) {
  const g = B.group({ x, z, ry });
  g.add(gBox(L, H, W, 0.2, 1), PM.epoxy, { y: H / 2 + 0.05 });
  g.add(gBox(0.6, 0.02, W - 0.3), PM.silk, { x: -L / 2 + 0.7, y: H + 0.06 }, { shadow: false });
  for (const s of [-1, 1]) g.add(gBox(1.1, 0.2, 1.5), PM.lead, { x: s * (L / 2 + 0.35), y: 0.1 });
}
/** Nút nhấn SMD (vỏ thép + nút đen) */
export function tactSmd(B, x, z, ry = 0, { w = 3.5, d = 4.5, h = 1.6, btn = 'black' } = {}) {
  const g = B.group({ x, z, ry });
  g.add(gBox(w, h * 0.6, d, 0.1, 1), PM.pbtBlack, { y: h * 0.3 });
  g.add(gBox(w + 0.05, 0.12, d + 0.05), PM.steel, { y: h * 0.6 });
  g.add(gCyl(Math.min(w, d) * 0.3, Math.min(w, d) * 0.32, h * 0.5, 16), btn === 'black' ? PM.pbtBlack : colorMat(0xd8d8d8), { y: h * 0.6 + h * 0.25 });
  for (const s of [-1, 1]) g.add(gBox(0.6, 0.15, 0.8), PM.lead, { x: s * (w / 2 + 0.3), y: 0.08, z: d / 2 - 0.6 }, { shadow: false }), g.add(gBox(0.6, 0.15, 0.8), PM.lead, { x: s * (w / 2 + 0.3), y: 0.08, z: -d / 2 + 0.6 }, { shadow: false });
}
/** LED SMD 0603/0805 (thân trong suốt hơi màu) — tĩnh */
export function ledSmd(B, x, z, ry = 0, color = 0xff2a2a, size = '0603') {
  const [L, W, H] = CHIP[size];
  const g = B.group({ x, z, ry });
  g.add(gBox(L * 0.7, H * 0.5, W), PM.ceramic, { y: H * 0.25 }, { shadow: false });
  g.add(gBox(L * 0.7, H * 0.5, W), colorMat(color, { rough: 0.2, opacity: 0.8 }), { y: H * 0.75 }, { shadow: false });
  for (const s of [-1, 1]) g.add(gBox(L * 0.15, H, W), PM.lead, { x: s * L * 0.42, y: H / 2 }, { shadow: false });
}
/** Tụ hoá SMD (lon nhôm trên đế nhựa đen, nắp có vạch đen = cực âm) */
export function elecSmd(B, x, z, ry = 0, { d = 6.3, h = 5.4 } = {}) {
  const g = B.group({ x, z, ry });
  g.add(gBox(d + 0.3, 0.6, d + 0.3, 0.2, 1), PM.pbtBlack, { y: 0.3 });
  g.add(gLathe(`elsmd:${d}:${h}`, [[0, h], [d / 2 - 0.3, h], [d / 2, h - 0.3], [d / 2, 1.2], [d / 2 - 0.15, 1.0], [d / 2, 0.8], [d / 2, 0.6]], 28), PM.aluminum, {});
  g.add(halfDiscGeo(d / 2 - 0.35), PM.pbtBlack, { y: h + 0.01, ry: Math.PI / 2 }, { shadow: false });
  for (const s of [-1, 1]) g.add(gBox(1.8, 0.15, 0.6), PM.lead, { x: s * (d / 2 + 0.4), y: 0.08 }, { shadow: false });
}
export function halfDiscGeo(r) {
  return cached(`halfdisc:${r}`, () => { const g = new THREE.CircleGeometry(r, 16, 0, Math.PI * 0.35); g.rotateX(-Math.PI / 2); g.translate(0, 0, 0); return g; });
}
/** Thạch anh SMD 3225 / 5032 (nắp kim loại) */
export function crystalSmd(B, x, z, ry = 0, { L = 3.2, W = 2.5 } = {}) {
  const g = B.group({ x, z, ry });
  g.add(gBox(L, 0.3, W), PM.ceramic, { y: 0.15 });
  g.add(gBox(L - 0.3, 0.5, W - 0.3, 0.1, 1), PM.nickel, { y: 0.55 });
}
/** Cuộn cảm dán bọc kín (CD54/SLF) vuông */
export function inductorShielded(B, x, z, ry = 0, { s = 5.8, h = 4.5 } = {}) {
  const g = B.group({ x, z, ry });
  g.add(gBox(s, h * 0.9, s, 0.5, 2), PM.ferrite, { y: h * 0.45 });
  g.add(gCyl(s * 0.38, s * 0.38, 0.1, 24), colorMat(0x55585c, { rough: 0.6 }), { y: h * 0.9 + 0.03 }, { shadow: false });
}

// ----------------------------------------------------------------------------- đầu nối trên board
/** USB-C receptacle (8.94 × 3.26 × 7.35), miệng hướng +X cục bộ, đặt ở mép board */
export function usbC(B, x, z, ry = 0) {
  const g = B.group({ x, z, ry });
  // shell: trục dài theo X, mặt cắt (Y × Z) = 3.26 × 8.94
  const sg = cached('usbc:shell2', () => {
    const s = roundRectShape(8.94, 3.26, 1.6);
    s.holes.push(roundRectShape(8.3, 2.6, 1.25));
    const geo = new THREE.ExtrudeGeometry(s, { depth: 7.35, bevelEnabled: false, curveSegments: 10 });
    geo.rotateY(Math.PI / 2);           // đùn theo +X
    geo.translate(-7.35 / 2, 0, 0);
    geo.computeVertexNormals();
    return geo;
  });
  g.add(sg, PM.steelBrushed, { y: 1.63 });
  g.add(gBox(7.0, 2.6, 8.3), PM.pbtBlack, { x: -0.5, y: 1.63 }, { shadow: false });
  g.add(gBox(6.0, 0.7, 6.6), PM.pbtBlack, { x: 0.3, y: 1.63 }, { shadow: false });
  g.add(gBox(5.0, 0.72, 6.0), PM.enig, { x: 0.8, y: 1.63 }, { shadow: false });
  for (const s of [-1, 1]) g.add(gBox(1.6, 0.3, 0.8), PM.lead, { x: -2.5, y: 0.15, z: s * 4.8 }, { shadow: false });
}
/** micro-USB B receptacle */
export function microUsb(B, x, z, ry = 0) {
  const g = B.group({ x, z, ry });
  g.add(gBox(5.0, 2.6, 7.6, 0.3, 1), PM.steelBrushed, { y: 1.3 });
  g.add(gBox(0.2, 1.8, 6.6), PM.pbtBlack, { x: 2.52, y: 1.35 }, { shadow: false });
}
/** USB-B (Arduino): 12 × 11 × 16, miệng hướng +X */
export function usbB(B, x, z, ry = 0) {
  const g = B.group({ x, z, ry });
  g.add(gBox(16.3, 10.9, 12.0, 0.5, 1), PM.steelBrushed, { y: 5.45 });
  g.add(gBox(0.3, 7.6, 8.2), PM.hole, { x: 8.1, y: 5.6 }, { shadow: false });
  g.add(gBox(0.5, 5.4, 4.2), PM.nylonWhite, { x: 8.0, y: 5.6 }, { shadow: false });
}
/** Giắc DC 5.5/2.1 (đen): 14 × 11 × 9, miệng hướng +X */
export function dcJack(B, x, z, ry = 0) {
  const g = B.group({ x, z, ry });
  g.add(gBox(14.2, 10.9, 9.0, 0.6, 2), PM.pbtBlack, { y: 5.45 });
  g.add(gCyl(3.2, 3.2, 0.4, 24), PM.hole, { x: 7.12, y: 6.4, rz: Math.PI / 2 }, { shadow: false });
  g.add(gCyl(1.0, 1.0, 1.0, 12), PM.lead, { x: 7.0, y: 6.4, rz: Math.PI / 2 }, { shadow: false });
}
/** USB-A kép xếp chồng (miệng +X) */
export function usbAStack(B, x, z, ry = 0, { blue = true } = {}) {
  const g = B.group({ x, z, ry });
  g.add(gBox(17.5, 15.6, 14.5, 0.3, 1), PM.steelBrushed, { y: 7.8 });
  for (const yy of [4.2, 11.2]) {
    g.add(gBox(0.3, 5.2, 12.4), PM.hole, { x: 8.76, y: yy }, { shadow: false });
    g.add(gBox(0.6, 1.6, 11.0), blue ? colorMat(0x1f5fd1, { rough: 0.4 }) : PM.pbtBlack, { x: 8.6, y: yy - 0.8 }, { shadow: false });
  }
}
/** RJ45 có LED (miệng +X) */
export function rj45(B, x, z, ry = 0) {
  const g = B.group({ x, z, ry });
  g.add(gBox(21, 13.5, 16, 0.4, 1), PM.steelBrushed, { y: 6.75 });
  g.add(gBox(0.4, 8.0, 11.8), PM.hole, { x: 10.5, y: 6.0 }, { shadow: false });
  g.add(gBox(0.5, 2.2, 3.0), colorMat(0x3bdc5a, { rough: 0.3, opacity: 0.9 }), { x: 10.6, y: 11.6, z: -5.5 }, { shadow: false });
  g.add(gBox(0.5, 2.2, 3.0), colorMat(0xf0b030, { rough: 0.3, opacity: 0.9 }), { x: 10.6, y: 11.6, z: 5.5 }, { shadow: false });
}
/** HDMI type A (miệng +X) */
export function hdmi(B, x, z, ry = 0) {
  const g = B.group({ x, z, ry });
  g.add(gBox(11.5, 6.0, 15.0, 0.3, 1), PM.steelBrushed, { y: 3.0 });
  g.add(gBox(0.3, 4.2, 13.6), PM.hole, { x: 5.76, y: 3.1 }, { shadow: false });
  g.add(gBox(0.5, 1.2, 11), PM.pbtBlack, { x: 5.6, y: 3.2 }, { shadow: false });
}

// ----------------------------------------------------------------------------- header 2.54 trên module
/** Hình học 1 chân header vuông 0.64 dài len (vát 2 đầu), tâm ở giữa theo Y */
export function headerPinGeo(len) {
  return cached(`hpin:${len}`, () => {
    const body = new THREE.BoxGeometry(0.64, len - 0.8, 0.64);
    const t1 = taperBox(0.64, 0.3, 0.4, 0.64, 0.3).clone(); t1.translate(0, -(len - 0.8) / 2 - 0.2, 0);
    const t2 = taperBox(0.3, 0.64, 0.4, 0.3, 0.64).clone(); t2.translate(0, (len - 0.8) / 2 + 0.2, 0);
    const parts = [body, t1, t2].map((g) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; });
    const m = mergeGeometries(parts, false);
    m.computeVertexNormals();
    return m;
  });
}
/** Nón thiếc quanh chân xuyên lỗ (mặt hàn) */
export function solderConeGeo() {
  return gLathe('solcone', [[0.33, 1.0], [0.42, 0.85], [0.62, 0.45], [0.88, 0.14], [0.95, 0.02], [0.96, 0]], 14);
}
/**
 * Hàng header ĐỰC chân chúc xuống dưới module (module cắm breadboard).
 * pins: [[x,z]…] (toạ độ trên board); boardBottomY: y đáy board trong hệ của B.
 * Chuẩn: đầu chân y = boardBottomY − 8.5 (6 mm cắm + 2.5 nhựa), đuôi nhô 1.4 mm trên mặt board.
 */
export function maleHeaderDown(B, pins, boardBottomY, t = 1.6, { plastic = PM.pbtBlack, solder = true, axis = 'x' } = {}) {
  const tipY = boardBottomY - 8.5, len = 11.5;
  const pm = pins.map(([x, z]) => tf({ x, y: tipY + len / 2, z }));
  B.inst(headerPinGeo(len), PM.gold, pm, { shadow: true });
  // nhựa: mỗi chân 1 khối, có rãnh bẻ giữa các khối
  const blk = pins.map(([x, z]) => tf({ x, y: boardBottomY - 1.25, z, ry: axis === 'x' ? 0 : Math.PI / 2 }));
  B.inst(gBox(2.44, 2.5, 2.5, 0.12, 1), plastic, blk, { shadow: true });
  if (solder) B.inst(solderConeGeo(), PM.solder, pins.map(([x, z]) => tf({ x, y: boardBottomY + t, z })));
  return { tipY };
}
/** Hàng header CÁI hướng lên (Arduino): cao 8.5 */
export function femaleHeaderUp(B, pins, boardTopY, { plastic = PM.pbtBlack, h = 8.5 } = {}) {
  const blk = pins.map(([x, z]) => tf({ x, y: boardTopY + h / 2, z }));
  B.inst(femaleCellGeo(h), plastic, blk, { shadow: true });
  B.inst(gBox(1.0, 0.05, 1.0), PM.hole, pins.map(([x, z]) => tf({ x, y: boardTopY + h + 0.01, z })));
  B.inst(gBox(0.3, 1.5, 0.75), PM.gold, pins.map(([x, z]) => tf({ x: x + 0.35, y: boardTopY + h - 1.2, z })));
}
export function femaleCellGeo(h) {
  return cached(`fcell:${h}`, () => {
    const s = roundRectShape(2.5, 2.5, 0.1);
    s.holes.push(roundRectShape(1.0, 1.0, 0.0));
    const g = extrudeY(s, h, {});
    g.translate(0, -h / 2, 0);
    return g;
  });
}

/**
 * Biến trở tinh chỉnh đa vòng 3296W (25 vòng, vít chỉnh ở đỉnh): thân xanh 9.5 × 10 × 4.8 mm, vít đồng có rãnh.
 * Trả { group, screw } — xoay screw.rotation.y theo số vòng.
 */
export function trimmer3296(parent, x, y, z, ry = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z); g.rotation.y = ry;
  const body = new THREE.Mesh(gBox(9.5, 10, 4.8, 0.35, 1), colorMat(0x2a5fd0, { rough: 0.45 }));
  body.position.y = 5; body.castShadow = true;
  g.add(body);
  const lab = new THREE.Mesh(gBox(5.0, 0.02, 3.0), colorMat(0xf0f0f0, { rough: 0.7 }));
  lab.position.set(1.4, 10.01, 0);
  g.add(lab);
  const screw = new THREE.Group();
  const head = new THREE.Mesh(gCyl(1.15, 1.15, 0.9, 18), PM.brass);
  head.castShadow = true;
  screw.add(head);
  const slot = new THREE.Mesh(gBox(2.0, 0.3, 0.3), PM.hole);
  slot.position.y = 0.35;
  screw.add(slot);
  screw.position.set(-3.1, 10.35, 0);
  g.add(screw);
  for (const px of [-2.54, 0, 2.54]) { const l = new THREE.Mesh(gBox(0.5, 1.2, 0.5), PM.lead); l.position.set(px, -0.4, 0); g.add(l); }
  parent.add(g);
  return { group: g, screw };
}
/**
 * Domino PCB bước 3.5 mm (n cực): thân xanh, lối luồn dây ở mặt +Z cục bộ, vít trên đỉnh. Gốc ở giữa đáy.
 * Trả toạ độ lối luồn dây (cục bộ khối) để tạo khe.
 */
export function terminalBlock35(B, x, z, ry = 0, n = 2, { color = 0x2a6fd6, pitch = 3.5, H = 8.5, D = 7.0 } = {}) {
  const g = B.group({ x, z, ry });
  const m = colorMat(color, { rough: 0.5 });
  const Wd = n * pitch;
  g.add(gBox(Wd, H * 0.55, D, 0.25, 1), m, { y: H * 0.275 });
  const out = [];
  for (let i = 0; i < n; i++) {
    const px = -((n - 1) * pitch) / 2 + i * pitch;
    g.add(gBox(pitch - 0.35, H * 0.45, D - 1.6, 0.25, 1), m, { x: px, y: H * 0.775, z: -0.8 });
    g.add(gCyl(1.2, 1.2, 0.5, 14), PM.nickel, { x: px, y: H + 0.05, z: -0.8 });
    g.add(gBox(2.0, 0.3, 0.35), PM.hole, { x: px, y: H + 0.3, z: -0.8 }, { shadow: false });
    g.add(gBox(2.4, 2.4, 0.3), PM.hole, { x: px, y: 2.4, z: D / 2 + 0.02 }, { shadow: false });
    g.add(gBox(2.2, 0.25, 2.4), PM.nickel, { x: px, y: 1.15, z: D / 2 - 1.3 }, { shadow: false });
    out.push([px, 2.4, D / 2]);
  }
  return out;
}
export { PITCH };
