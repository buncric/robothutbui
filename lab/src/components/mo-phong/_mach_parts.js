// Mô hình 3D + chân cắm của "Bàn mạch tự do" (ban-mach-tu-do.js). KHÔNG có export default → app bỏ qua file này.
// Quy ước: 1 đơn vị = 1 mm, Y hướng lên. Linh kiện cắm breadboard có GỐC TOẠ ĐỘ TẠI CHÂN 1 (mặt breadboard),
// mọi chân nằm trên lưới 2.54 mm → sandbox bắt lưới 2.54 là chân rơi đúng lỗ.
// Mô-đun ngoài breadboard (nguồn, buck, động cơ…) có cực/terminal: chân `ins: false`, toạ độ = đỉnh cực để nối dây.

export const P = 2.54;            // bước lỗ breadboard 0.1"
export const BB_TOP = 8.5;        // mặt trên breadboard (mm)
export const ROWZ = { a: -6, b: -5, c: -4, d: -3, e: -2, f: 1, g: 2, h: 3, i: 4, j: 5, 'T-': -10, 'T+': -9, 'B+': 8, 'B-': 9 };
export const MAIN_ROWS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
export const RAILS = ['T-', 'T+', 'B+', 'B-'];
export const railHas = (col) => col >= 2 && col <= 60 && (col - 2) % 6 < 5;
export const colX = (col) => (col - 32) * P;
/** toạ độ thế giới (x, z) của lỗ */
export const holeXZ = (row, col) => [colX(col), ROWZ[row] * P];
/** lưới điện bên trong breadboard của lỗ */
export function holeNet(row, col) {
  if (RAILS.includes(row)) return `bb:rail${row}`;
  return 'abcde'.includes(row) ? `bb:T${col}` : `bb:B${col}`;
}
export const holeId = (row, col) => `${row}${col}`;
export function parseHole(id) {
  const m = /^(T-|T\+|B\+|B-|[a-j])(\d+)$/.exec(id);
  return m ? { row: m[1], col: +m[2] } : null;
}
export function netName(net) {
  if (!net) return '';
  if (net.startsWith('bb:rail')) { const r = net.slice(7); return `thanh nguồn ${r[0] === 'T' ? 'phía sau' : 'phía trước'} (${r[1] === '+' ? 'đỏ +' : 'xanh −'})`; }
  if (net.startsWith('bb:T')) return `dải cột ${net.slice(4)} (hàng a–e)`;
  if (net.startsWith('bb:B')) return `dải cột ${net.slice(4)} (hàng f–j)`;
  return 'chân linh kiện (không cắm breadboard)';
}

// ---------------------------------------------------------------- màn hình LCD (canvas → texture)
export function makeLCD(THREE, w, h, { bg = '#9db48a', fg = '#10170c', pxPerMm = 8 } = {}) {
  const hasDoc = typeof document !== 'undefined';
  const mat = new THREE.MeshBasicMaterial({ color: hasDoc ? 0xffffff : bg, toneMapped: false });
  let canvas = null, g = null, tex = null;
  if (hasDoc) {
    canvas = document.createElement('canvas');
    canvas.width = Math.min(1024, Math.round(w * pxPerMm));
    canvas.height = Math.min(512, Math.round(h * pxPerMm));
    g = canvas.getContext('2d');
    tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    mat.map = tex;
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.userData.noCut = true;
  let last = '';
  function set(lines, background = bg) {
    if (!hasDoc) return;
    const key = background + JSON.stringify(lines);
    if (key === last) return;
    last = key;
    const W = canvas.width, H = canvas.height;
    g.fillStyle = background;
    g.fillRect(0, 0, W, H);
    let y = 0;
    for (const ln of lines) {
      const [txt, col, size] = Array.isArray(ln) ? ln : [ln, fg, 1 / lines.length];
      const lh = H * size;
      g.fillStyle = col || fg;
      g.font = `bold ${Math.round(lh * 0.78)}px ui-monospace, Menlo, Consolas, monospace`;
      g.textBaseline = 'middle';
      g.textAlign = 'right';
      g.fillText(String(txt), W * 0.96, y + lh / 2);
      y += lh;
    }
    tex.needsUpdate = true;
  }
  return { mesh, set };
}

// ---------------------------------------------------------------- breadboard 830 lỗ
export function buildBreadboard(ctx) {
  const { THREE, MAT, geom } = ctx;
  const g = new THREE.Group();
  const W = 166.5, zMin = -10 * P - 3.2, zMax = 9 * P + 3.2, H = zMax - zMin, zc = (zMin + zMax) / 2;
  const bodyMat = MAT.plasticWhite.clone();
  bodyMat.color = new THREE.Color(0xf1efe8);
  const body = geom.mesh(geom.box(W, BB_TOP, H, 1.2), bodyMat, { y: BB_TOP / 2, z: zc });
  body.receiveShadow = true;
  g.add(geom.part(body, 'Breadboard 830 lỗ (bảng cắm thử)', 'Lỗ cách nhau 2.54 mm. Mỗi cột có 2 dải 5 lỗ nối liền bên trong (a–e và f–j); 4 thanh nguồn dài nối liền theo chiều ngang. Rê chuột lên lỗ để thấy các lỗ cùng lưới điện.'));
  // rãnh giữa
  const ch = geom.mesh(geom.box(W - 6, 0.6, 2.2), MAT.plasticGrey, { y: BB_TOP - 0.25, z: -0.5 * P });
  g.add(geom.part(ch, 'Rãnh giữa breadboard', 'Ngăn cách nửa trên (a–e) và nửa dưới (f–j): IC DIP cắm vắt qua rãnh để mỗi chân nằm trên một dải riêng.'));

  // mặt in (số cột, chữ hàng, vạch thanh nguồn)
  const hasDoc = typeof document !== 'undefined';
  if (hasDoc) {
    const s = 8;
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * s); cv.height = Math.round(H * s);
    const c2 = cv.getContext('2d');
    c2.fillStyle = '#f1efe8'; c2.fillRect(0, 0, cv.width, cv.height);
    const X = (x) => (x + W / 2) * s, Z = (z) => (z - zMin) * s;
    const line = (z, col) => { c2.strokeStyle = col; c2.lineWidth = 0.35 * s; c2.beginPath(); c2.moveTo(X(colX(2) - 2), Z(z)); c2.lineTo(X(colX(60) + 2), Z(z)); c2.stroke(); };
    line(-10.8 * P, '#2f62c9'); line(-8.2 * P, '#d23b3b'); line(7.2 * P, '#d23b3b'); line(9.8 * P, '#2f62c9');
    c2.fillStyle = '#5c5c5c';
    c2.font = `bold ${Math.round(1.5 * s)}px Arial`;
    c2.textAlign = 'center'; c2.textBaseline = 'middle';
    for (let c = 1; c <= 63; c++) if (c === 1 || c % 5 === 0) { c2.fillText(String(c), X(colX(c)), Z(-7 * P)); c2.fillText(String(c), X(colX(c)), Z(6 * P)); }
    for (const r of MAIN_ROWS) { c2.fillText(r, X(colX(1) - 2.6), Z(ROWZ[r] * P)); c2.fillText(r, X(colX(63) + 2.6), Z(ROWZ[r] * P)); }
    c2.fillStyle = '#d23b3b'; c2.fillText('+', X(colX(1)), Z(-9 * P)); c2.fillText('+', X(colX(1)), Z(8 * P));
    c2.fillStyle = '#2f62c9'; c2.fillText('−', X(colX(1)), Z(-10 * P)); c2.fillText('−', X(colX(1)), Z(9 * P));
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const top = new THREE.Mesh(new THREE.PlaneGeometry(W - 1, H - 1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
    top.rotation.x = -Math.PI / 2;
    top.position.set(0, BB_TOP + 0.01, zc);
    top.receiveShadow = true;
    top.userData.noPick = true;
    g.add(top);
  }

  // lỗ
  const holes = [];
  for (let col = 1; col <= 63; col++) for (const r of MAIN_ROWS) holes.push({ id: holeId(r, col), row: r, col, net: holeNet(r, col) });
  for (const r of RAILS) for (let col = 1; col <= 63; col++) if (railHas(col)) holes.push({ id: holeId(r, col), row: r, col, net: holeNet(r, col) });
  holes.forEach((h) => { [h.x, h.z] = holeXZ(h.row, h.col); });
  const holeGeo = new THREE.PlaneGeometry(1.05, 1.05);
  holeGeo.rotateX(-Math.PI / 2);
  const im = new THREE.InstancedMesh(holeGeo, new THREE.MeshBasicMaterial({ color: 0x23262b }), holes.length);
  const M = new THREE.Matrix4();
  holes.forEach((h, i) => { M.makeTranslation(h.x, BB_TOP + 0.03, h.z); im.setMatrixAt(i, M); });
  im.userData.noPick = true;
  g.add(im);
  // tô sáng lưới khi rê chuột
  const hlGeo = new THREE.PlaneGeometry(1.9, 1.9);
  hlGeo.rotateX(-Math.PI / 2);
  const hlMat = new THREE.MeshBasicMaterial({ color: 0x3fcf8e, transparent: true, opacity: 0.75, depthWrite: false });
  const hl = new THREE.InstancedMesh(hlGeo, hlMat, holes.length);
  hl.count = 0;
  hl.userData.noPick = true;
  hl.renderOrder = 2;
  g.add(hl);
  const byId = new Map(holes.map((h) => [h.id, h]));
  const byNet = new Map();
  for (const h of holes) (byNet.get(h.net) || byNet.set(h.net, []).get(h.net)).push(h);

  /** lỗ gần điểm (x, z) nhất trong bán kính tol (mm) */
  function holeAt(x, z, tol = 0.9) {
    const col = Math.round(x / P) + 32;
    const rz = Math.round(z / P);
    const row = Object.keys(ROWZ).find((k) => ROWZ[k] === rz);
    if (!row || col < 1 || col > 63) return null;
    const h = byId.get(holeId(row, col));
    if (!h) return null;
    return Math.hypot(h.x - x, h.z - z) <= tol ? h : null;
  }
  function highlight(list, color = 0x3fcf8e) {
    hlMat.color.setHex(color);
    let i = 0;
    for (const h of list) { M.makeTranslation(h.x, BB_TOP + 0.06, h.z); hl.setMatrixAt(i++, M); }
    hl.count = i;
    hl.instanceMatrix.needsUpdate = true;
  }
  return { group: g, body, holes, byId, byNet, holeAt, highlight };
}

// ---------------------------------------------------------------- tiện ích dựng linh kiện
const colorMat = (THREE, base, hex, extra = {}) => { const m = base.clone(); m.color = new THREE.Color(hex); Object.assign(m, extra); return m; };
function leg(ctx, x, z, top, r = 0.3) {
  return ctx.geom.mesh(ctx.geom.cyl(r, r, top + 3, 8), ctx.MAT.tin, { x, y: (top - 3) / 2, z });
}
/** linh kiện trục (điện trở, diode): 2 chân ở x = 0 và x = span, thân nằm ngang ở độ cao y */
function axial(ctx, span, body, y) {
  const { THREE, geom, MAT } = ctx;
  const g = new THREE.Group();
  body.position.set(span / 2, y, 0);
  g.add(body);
  const hw = 3.5;
  for (const x of [0, span]) {
    g.add(leg(ctx, x, 0, y));
    const len = Math.max(0.1, Math.abs(span / 2 - x) - hw + 0.4);
    g.add(geom.mesh(geom.cyl(0.3, 0.3, len, 8), MAT.tin, { x: x === 0 ? len / 2 : span - len / 2, y, rz: Math.PI / 2 }));
  }
  return g;
}

const BANDS = [0x111111, 0x7a4a1e, 0xd02c2c, 0xf08a1c, 0xf2d13a, 0x2fa84f, 0x2f5fd0, 0x8a4fd0, 0x8a8a8a, 0xf2f2f2];
export function bandColors(R) {
  let exp = Math.floor(Math.log10(R)) - 1;
  let sig = Math.round(R / 10 ** exp);
  if (sig >= 100) { sig /= 10; exp++; }
  const d = String(sig).padStart(2, '0').split('').map(Number);
  return [BANDS[d[0]], BANDS[d[1]], exp >= 0 ? BANDS[exp] : 0xd4a640, 0xd4a640];
}
export function fmtR(r) { return r >= 1e6 ? `${+(r / 1e6).toPrecision(3)} MΩ` : r >= 1e3 ? `${+(r / 1e3).toPrecision(3)} kΩ` : `${+r.toPrecision(3)} Ω`; }
export function fmtC(c) { return c >= 1e-6 ? `${+(c * 1e6).toPrecision(3)} µF` : c >= 1e-9 ? `${+(c * 1e9).toPrecision(3)} nF` : `${+(c * 1e12).toPrecision(3)} pF`; }

function terminalPost(ctx, mat, x, y, z) {
  const { THREE, geom, MAT } = ctx;
  const g = new THREE.Group();
  g.add(geom.mesh(geom.cyl(3.2, 3.6, 6, 16), mat, { y: 3 }));
  g.add(geom.mesh(geom.cyl(1.4, 1.4, 3, 10), MAT.brass, { y: 7 }));
  g.position.set(x, y, z);
  return g;
}

// ---------------------------------------------------------------- từng loại linh kiện
function mResistor(ctx) {
  const { THREE, geom } = ctx;
  const bodyMat = colorMat(THREE, ctx.MAT.plasticWhite, 0xd9c39a);
  const body = new THREE.Group();
  body.add(geom.mesh(geom.lathe([[0, -3.15], [1.05, -3.15], [1.22, -2.9], [1.22, -1.9], [1.02, -1.5], [1.02, 1.5], [1.22, 1.9], [1.22, 2.9], [1.05, 3.15], [0, 3.15]], 24), bodyMat, { rz: Math.PI / 2 }));
  const bands = [-2.2, -1.25, -0.3, 2.2].map((x) => { const m = geom.mesh(geom.cyl(1.09, 1.09, 0.5, 20, true), new THREE.MeshStandardMaterial({ color: 0, roughness: 0.4 }), { x, rz: Math.PI / 2 }); if (Math.abs(x) > 1.6) m.scale.set(1.13, 1, 1.13); body.add(m); return m; });
  const g = axial(ctx, 4 * P, body, 2.6);
  g.userData.view = {
    heat: body,
    apply(p) { bandColors(p.R ?? 330).forEach((c, i) => bands[i].material.color.setHex(c)); },
  };
  return g;
}
function mPowerRes(ctx) {
  const { THREE, geom, MAT } = ctx;
  const g = new THREE.Group();
  const body = geom.mesh(geom.box(22, 9, 9, 0.6), colorMat(THREE, MAT.plasticWhite, 0xf4f2ec), { x: 5 * P, y: 6.5 });
  g.add(body, leg(ctx, 0, 0, 2.5), leg(ctx, 10 * P, 0, 2.5));
  g.add(geom.mesh(geom.box(10 * P, 0.6, 0.6), MAT.tin, { x: 5 * P, y: 2.3 }));
  g.userData.view = { heat: body };
  return g;
}
function mPot(ctx) {
  const { THREE, geom, MAT } = ctx;
  const g = new THREE.Group();
  const body = geom.mesh(geom.cyl(4.8, 4.8, 5, 24), colorMat(THREE, MAT.plasticBlue, 0x2d5fb3), { x: P, y: 5.5, z: -2 });
  g.add(body);
  const knob = new THREE.Group();
  knob.add(geom.mesh(geom.cyl(3, 3, 6, 20), MAT.plasticWhite, { y: 3 }));
  knob.add(geom.mesh(geom.box(0.8, 0.4, 2.8), MAT.plasticDark, { y: 6.1, z: 1.4 }));
  knob.position.set(P, 8, -2);
  g.add(knob);
  for (let k = 0; k < 3; k++) g.add(leg(ctx, k * P, 0, 3.4));
  g.userData.view = { heat: body, apply(p) { knob.rotation.y = -((p.pos ?? 50) / 100 - 0.5) * 4.7; } };
  return g;
}
function mLed(ctx) {
  const { THREE, geom } = ctx;
  const g = new THREE.Group();
  const lm = new THREE.MeshStandardMaterial({ color: 0xff3030, transparent: true, opacity: 0.88, roughness: 0.2, emissive: 0xff3030, emissiveIntensity: 0 });
  const lens = new THREE.Group();
  const ms = [geom.mesh(geom.cyl(2.5, 2.5, 5.2, 24), lm, { y: 4.6 }), geom.mesh(new THREE.SphereGeometry(2.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), lm, { y: 7.2 }), geom.mesh(geom.cyl(2.9, 2.9, 1, 24), lm, { y: 1.6 })];
  lens.add(...ms);
  lens.position.x = P / 2;
  g.add(lens);
  const legs = new THREE.Group();
  legs.add(leg(ctx, 0, 0, 1.2), leg(ctx, P, 0, 1.2));
  g.add(legs);
  // luôn lấy material HIỆN TẠI của mesh (khung nhìn có thể thay material khi rê chuột)
  g.userData.view = {
    heat: legs, pop: lens,
    apply(p, LED) { const c = (LED[p.color] || LED.red).hex; for (const m of ms) { m.material.color.setHex(c); m.material.emissive?.setHex(c); } },
    level(b) { for (const m of ms) if (m.material.emissive) m.material.emissiveIntensity = b * 3.2; },
  };
  return g;
}
function mDiode(ctx, big) {
  const { THREE, geom, MAT } = ctx;
  const r = big ? 1.6 : 1.35, L = big ? 7.5 : 5.2;
  const body = new THREE.Group();
  body.add(geom.mesh(geom.cyl(r, r, L, 20), MAT.icBody, { rz: Math.PI / 2 }));
  body.add(geom.mesh(geom.cyl(r + 0.02, r + 0.02, 0.9, 20), MAT.plasticGrey, { x: L / 2 - 1, rz: Math.PI / 2 }));
  const g = axial(ctx, 4 * P, body, 2.6);
  g.userData.view = { heat: body };
  return g;
}
function mCeramic(ctx, color, span = P) {
  const { THREE, geom, MAT } = ctx;
  const g = new THREE.Group();
  const disc = geom.mesh(geom.cyl(2.4, 2.4, 1.6, 20), colorMat(THREE, MAT.plasticYellow, color), { x: span / 2, y: 5, rx: Math.PI / 2 });
  g.add(disc, leg(ctx, 0, 0, 4), leg(ctx, span, 0, 4));
  g.userData.view = { heat: disc, pop: disc };
  return g;
}
function mElectro(ctx, r, h, span) {
  const { THREE, geom, MAT } = ctx;
  const g = new THREE.Group();
  const can = new THREE.Group();
  const sleeve = colorMat(THREE, MAT.plasticBlue, 0x1d2a55, { roughness: 0.35 });
  can.add(geom.mesh(geom.cyl(r, r, h, 32), sleeve, { y: h / 2 + 0.6 }));
  can.add(geom.mesh(geom.arcSector(r + 0.01, r + 0.1, -0.45, 0.45, h * 0.94), colorMat(THREE, MAT.plasticWhite, 0xc9d2dc), { y: h / 2 + 0.6 }));
  can.add(geom.mesh(geom.cyl(r * 0.95, r * 0.95, 0.6, 24), MAT.rubber, { y: 0.3 }));
  const top = new THREE.Group();
  top.add(geom.mesh(geom.cyl(r * 0.93, r * 0.93, 0.3, 24), MAT.aluminum));
  for (const a of [0, Math.PI / 3, -Math.PI / 3]) top.add(geom.mesh(geom.box(r * 1.4, 0.06, 0.25), MAT.plasticDark, { y: 0.17, ry: a }));
  top.position.y = h + 0.7;
  can.add(top);
  can.position.x = span / 2;
  g.add(can, leg(ctx, 0, 0, 0.4), leg(ctx, span, 0, 0.4));
  g.userData.view = { heat: can, pop: top };
  return g;
}
function mInductor(ctx) {
  const { THREE, geom, MAT } = ctx;
  const g = new THREE.Group();
  const b = new THREE.Group();
  b.add(geom.mesh(geom.cyl(4, 4, 1.2, 24), MAT.ferrite, { y: 0.6 }), geom.mesh(geom.cyl(4, 4, 1.2, 24), MAT.ferrite, { y: 8.4 }));
  b.add(geom.mesh(geom.cyl(3.3, 3.3, 6.6, 24), MAT.copper, { y: 4.5 }));
  b.position.x = P;
  g.add(b, leg(ctx, 0, 0, 0.5), leg(ctx, 2 * P, 0, 0.5));
  g.userData.view = { heat: b };
  return g;
}
function mCrystal(ctx) {
  const { THREE, geom, MAT } = ctx;
  const g = new THREE.Group();
  const can = geom.mesh(geom.box(11, 3.6, 4.6, 1.2), MAT.steel, { x: P / 2, y: 3.6 });
  g.add(can, geom.mesh(geom.box(11.6, 0.4, 5, 0.2), MAT.steel, { x: P / 2, y: 1.8 }), leg(ctx, 0, 0, 1.8), leg(ctx, P, 0, 1.8));
  g.userData.view = { heat: can };
  return g;
}
function mSwitch(ctx) {
  const { THREE, geom, MAT } = ctx;
  const g = new THREE.Group();
  const body = geom.mesh(geom.box(8.6, 3.6, 4.4, 0.3), MAT.plasticBlack, { x: P, y: 2.6 });
  const knob = geom.mesh(geom.box(1.6, 3, 1.6), MAT.plasticWhite, { x: P, y: 5.6 });
  g.add(body, knob);
  for (let k = 0; k < 3; k++) g.add(leg(ctx, k * P, 0, 0.8));
  g.userData.view = { heat: body, apply(p) { knob.position.x = P + (p.on ? 1.5 : -1.5); } };
  return g;
}
function mButton(ctx) {
  const { THREE, geom, MAT } = ctx;
  const g = new THREE.Group();
  const body = geom.mesh(geom.box(6.2, 3.4, 6.2, 0.3), MAT.plasticBlack, { x: P, y: 2.2, z: 1.5 * P });
  const cap = geom.mesh(geom.cyl(1.75, 1.75, 2.4, 20), colorMat(THREE, MAT.plasticRed, 0xd23b3b), { x: P, y: 5, z: 1.5 * P });
  g.add(body, cap);
  for (const [x, z] of [[0, 0], [2 * P, 0], [0, 3 * P], [2 * P, 3 * P]]) g.add(leg(ctx, x, z, 0.6));
  g.userData.view = { heat: body, apply(p) { cap.position.y = p.pressed ? 4.1 : 5; } };
  return g;
}
function mTo220(ctx, name) {
  const { THREE, geom, MAT } = ctx;
  const g = new THREE.Group();
  const pkg = new THREE.Group();
  pkg.add(geom.mesh(geom.box(10, 9, 4.5, 0.3), MAT.icBody, { y: 9.5 }));
  const tab = geom.mesh(geom.box(10, 6.5, 1.3), MAT.tin, { y: 17, z: -1.6 });
  pkg.add(tab);
  pkg.add(geom.mesh(geom.cyl(1.8, 1.8, 1.5, 16), MAT.plasticDark, { y: 17.2, z: -1.6, rx: Math.PI / 2 }));
  pkg.position.x = P;
  g.add(geom.part(pkg, name, 'Vỏ TO-220: tấm kim loại phía sau (tab) nối với chân giữa — bắt tản nhiệt vào đây.'));
  for (let k = 0; k < 3; k++) g.add(leg(ctx, k * P, 0, 5.2, 0.4));
  g.userData.view = { heat: pkg, pop: pkg };
  return g;
}
function mPic(ctx) {
  const { THREE, geom } = ctx;
  const d = geom.dipPackage(40);
  d.group.position.set(19 * P / 2, 0, -3 * P);
  const g = new THREE.Group();
  g.add(d.group);
  const names = ['MCLR', 'RA0/AN0', 'RA1', 'RA2', 'RA3', 'RA4', 'RA5', 'RE0', 'RE1', 'RE2', 'VDD', 'VSS', 'OSC1', 'OSC2', 'RC0', 'RC1/CCP2', 'RC2/CCP1', 'RC3', 'RD0', 'RD1',
    'RD2', 'RD3', 'RC4', 'RC5', 'RC6/TX', 'RC7/RX', 'RD4', 'RD5', 'RD6', 'RD7', 'VSS', 'VDD', 'RB0', 'RB1', 'RB2', 'RB3', 'RB4', 'RB5', 'RB6/PGC', 'RB7/PGD'];
  d.pins.forEach((p, i) => geom.part(p, `PIC chân ${i + 1}: ${names[i]}`, i === 10 || i === 31 ? 'Nối +5 V (cả 2 chân 11 và 32!)' : i === 11 || i === 30 ? 'Nối GND (cả 2 chân 12 và 31!)' : i === 0 ? 'MCLR: điện trở 10 kΩ kéo lên 5 V, nếu không chip bị reset' : i === 12 || i === 13 ? 'Thạch anh 20 MHz + 2 tụ 22 pF xuống GND' : 'Chân I/O (theo docs/01)'));
  geom.part(d.body, 'PIC16F877A (DIP-40)', 'Vi điều khiển 8-bit 5 V. Khấc ở đầu chân 1. Cắm vắt qua rãnh giữa: chân 1–20 ở hàng g, chân 21–40 ở hàng c.');
  g.userData.view = { heat: d.body, pop: d.body };
  return g;
}
function mEsp32(ctx) {
  const { THREE, geom, MAT } = ctx;
  const g = new THREE.Group();
  const top = 10;
  const L = 22 * P + 6, Wd = 9 * P + 4;
  const pcb = geom.mesh(geom.box(L, 1.6, Wd, 0.6), colorMat(THREE, MAT.pcbBlack, 0x1b1f2b), { x: 21 * P / 2, y: top, z: -4.5 * P });
  g.add(geom.part(pcb, 'ESP32-S3-DevKitC-1', 'Bo phát triển 3.3 V. J1 (gần) / J2 (xa) mỗi hàng 22 chân. Cấp 5 V vào chân 5V, hoặc 3.3 V vào 3V3 — KHÔNG cấp 5 V vào 3V3 hay GPIO!'));
  const mod = geom.mesh(geom.box(25.5, 3.2, 18, 0.3), MAT.steel, { x: 21 * P - 14, y: top + 2.4, z: -4.5 * P });
  g.add(geom.part(mod, 'Module ESP32-S3-WROOM-1 (vỏ chống nhiễu)', 'Bên trong: chip ESP32-S3, flash, thạch anh 40 MHz. Ăng-ten PCB ở đầu mép.'));
  g.add(geom.mesh(geom.box(8, 0.3, 18, 0.2), colorMat(THREE, MAT.pcbBlack, 0x2a2f3b), { x: 21 * P + 1, y: top + 0.95, z: -4.5 * P }));
  g.add(geom.mesh(geom.box(7.5, 3.2, 9, 0.8), MAT.steel, { x: -1.5, y: top + 2, z: -2 * P }), geom.mesh(geom.box(7.5, 3.2, 9, 0.8), MAT.steel, { x: -1.5, y: top + 2, z: -7 * P }));
  const ledM = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x2a6bff, emissiveIntensity: 0 });
  const pwrM = new THREE.MeshStandardMaterial({ color: 0x331111, emissive: 0xff2020, emissiveIntensity: 0 });
  const rgb = geom.mesh(geom.box(1.6, 0.8, 1.6), ledM, { x: 6, y: top + 1.2, z: -4.5 * P });
  const pled = geom.mesh(geom.box(1, 0.6, 0.6), pwrM, { x: 10, y: top + 1.1, z: -3 * P });
  g.add(rgb, pled);
  for (const z of [0, -9 * P]) {
    g.add(geom.mesh(geom.box(22 * P, 2.5, 2.5), MAT.plasticBlack, { x: 21 * P / 2, y: top - 2.05, z }));
    for (let k = 0; k < 22; k++) g.add(geom.mesh(geom.box(0.64, top + 3, 0.64), MAT.gold, { x: k * P, y: (top - 3) / 2, z }));
  }
  g.userData.view = { heat: pcb, pop: mod, led(on, pwr) { if (rgb.material.emissive) rgb.material.emissiveIntensity = on ? 2.5 : 0; if (pled.material.emissive) pled.material.emissiveIntensity = pwr ? 2 : 0; } };
  return g;
}
function mBss138(ctx) {
  const { THREE, geom, MAT } = ctx;
  const g = new THREE.Group();
  const top = 9;
  const pcb = geom.mesh(geom.box(6 * P + 2, 1.6, 5 * P + 4, 0.5), colorMat(THREE, MAT.pcbBlue, 0xc0392b), { x: 2.5 * P, y: top, z: -2.5 * P });
  g.add(geom.part(pcb, 'Module chuyển mức BSS138 4 kênh', 'Hàng gần: LV1 LV2 LV GND LV3 LV4 (phía 3.3 V). Hàng xa: HV1 HV2 HV GND HV3 HV4 (phía 5 V). Mỗi kênh = 1 MOSFET BSS138 + 2 trở kéo lên 10 kΩ.'));
  for (let k = 0; k < 4; k++) g.add(geom.mesh(geom.box(2.9, 1, 1.3), MAT.icBody, { x: (k + 1) * P - 1.3, y: top + 1.3, z: -2.5 * P }));
  for (const z of [0, -5 * P]) for (let k = 0; k < 6; k++) g.add(geom.mesh(geom.box(0.64, top + 3, 0.64), MAT.gold, { x: k * P, y: (top - 3) / 2, z }));
  for (const z of [0, -5 * P]) g.add(geom.mesh(geom.box(6 * P, 2.5, 2.5), MAT.plasticBlack, { x: 2.5 * P, y: top - 2, z }));
  g.userData.view = { heat: pcb };
  return g;
}
function screwBlock(ctx, n, x, y, z, color = 0x2f7fd0) {
  const { THREE, geom, MAT } = ctx;
  const g = new THREE.Group();
  g.add(geom.mesh(geom.box(n * 5, 9, 7.5, 0.4), colorMat(THREE, MAT.plasticGreen, color), { x: ((n - 1) * 5) / 2, y: 4.5 }));
  for (let i = 0; i < n; i++) g.add(geom.mesh(geom.cyl(1.5, 1.5, 0.6, 14), MAT.zinc, { x: i * 5, y: 9.1 }));
  g.position.set(x, y, z);
  return g;
}
function mDrv(ctx) {
  const { THREE, geom, MAT } = ctx;
  const g = new THREE.Group();
  const top = 9;
  const pcb = geom.mesh(geom.box(25, 1.6, 20, 0.8), colorMat(THREE, MAT.pcbBlack, 0x101318), { x: P, y: top, z: 9 });
  g.add(geom.part(pcb, 'Module DRV8871 (cầu H 3.6 A)', 'Hàng chân: IN1, IN2, GND (cắm breadboard). Cầu đấu: VM/GND (nguồn động cơ 6.5–45 V) và OUT1/OUT2 (động cơ). R_ILIM 30 kΩ → giới hạn ~2.1 A.'));
  const ic = geom.mesh(geom.box(5, 1.4, 4, 0.2), MAT.icBody, { x: P, y: top + 1.5, z: 7 });
  g.add(ic);
  g.add(screwBlock(ctx, 2, -8.5, top + 0.8, 15), screwBlock(ctx, 2, 8.5, top + 0.8, 15));
  g.add(geom.mesh(geom.box(3 * P, 2.5, 2.5), MAT.plasticBlack, { x: P, y: top - 2, z: 0 }));
  for (let k = 0; k < 3; k++) g.add(geom.mesh(geom.box(0.64, top + 3, 0.64), MAT.gold, { x: k * P, y: (top - 3) / 2, z: 0 }));
  g.userData.view = { heat: ic, pop: ic };
  return g;
}
function mBuck(ctx) {
  const { THREE, geom, MAT } = ctx;
  const g = new THREE.Group();
  const pcb = geom.mesh(geom.box(54, 1.6, 26, 0.8), colorMat(THREE, MAT.pcbBlue, 0x1d4f91), { y: 1.6 });
  g.add(geom.part(pcb, 'Module hạ áp XL4015 (5 A)', 'IN+/IN− bên trái (8–36 V), OUT+/OUT− bên phải. Vặn biến trở xanh để chỉnh Vout. IN− và OUT− nối chung. KHÔNG có bảo vệ ngược cực!'));
  const ind = geom.mesh(geom.box(12, 7, 12, 1.5), MAT.ferrite, { x: 0, y: 6, z: -3 });
  const ic = geom.mesh(geom.box(10, 2.5, 9, 0.3), MAT.icBody, { x: -12, y: 3.7, z: 5 });
  g.add(geom.part(ind, 'Cuộn cảm 47 µH', 'Tích/xả năng lượng mỗi chu kỳ đóng cắt 180 kHz.'), geom.part(ic, 'IC XL4015 (TO-263)', 'Công tắc MOSFET + mạch điều khiển PWM 180 kHz. Nóng lên theo tổn hao.'));
  for (const x of [-16, 13]) g.add(geom.mesh(geom.cyl(4, 4, 10, 20), colorMat(THREE, MAT.plasticBlue, 0x1a1a1a), { x, y: 7.4, z: -6 }));
  const trim = geom.mesh(geom.box(9.5, 5, 4.8, 0.3), colorMat(THREE, MAT.plasticBlue, 0x2f7fd0), { x: 12, y: 5, z: 7 });
  g.add(geom.part(trim, 'Biến trở chỉnh Vout (trimmer)', 'Vặn theo chiều kim đồng hồ để giảm Vout (tuỳ module). LUÔN đo Vout trước khi nối tải!'));
  const ledM = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xff2020, emissiveIntensity: 0 });
  const pled = geom.mesh(geom.box(1.6, 0.8, 1), ledM, { x: 4, y: 2.8, z: 9 });
  g.add(pled);
  g.add(screwBlock(ctx, 2, -24.5, 1.6, 2.5, 0x2f7fd0), screwBlock(ctx, 2, 24.5, 1.6, 2.5, 0x2f7fd0));
  g.children.slice(-2).forEach((b) => (b.rotation.y = Math.PI / 2));
  g.userData.view = { heat: ic, pop: ic, led(on) { if (pled.material.emissive) pled.material.emissiveIntensity = on ? 2.4 : 0; } };
  return g;
}
function mLdo(ctx) { return mTo220(ctx, 'LM1117-3.3 (ổn áp tuyến tính, TO-220)'); }
function mPack(ctx) {
  const { THREE, geom, MAT } = ctx;
  const g = new THREE.Group();
  const holder = geom.mesh(geom.box(80, 20, 77, 2), MAT.plasticBlack, { y: 10 });
  g.add(geom.part(holder, 'Pack 4S Li-ion 18650 (14.4 V, 2.6 Ah)', '4 cell nối tiếp: 16.8 V đầy → 12.0 V cạn. Có thể đổi có/không mạch BMS bảo vệ. Chập mạch: dòng > 150 A!'));
  const cellM = colorMat(THREE, MAT.plasticBlue, 0x2e7d4a, { roughness: 0.35 });
  const cells = new THREE.Group();
  for (let i = 0; i < 4; i++) cells.add(geom.mesh(geom.cyl(9.2, 9.2, 65, 24), cellM, { x: -29 + i * 19.4, y: 20, rx: Math.PI / 2 }));
  g.add(cells);
  const bms = geom.mesh(geom.box(46, 1.6, 20, 0.5), MAT.pcbGreen, { x: 0, y: 30.5, z: 20 });
  g.add(geom.part(bms, 'Mạch BMS 4S', 'Ngắt khi: chập mạch > 100 A (~200 µs), quá dòng > 35 A trong 1 s, cell < 2.7 V.'));
  g.add(terminalPost(ctx, MAT.plasticRed, -12, 29, -28), terminalPost(ctx, MAT.plasticBlack, 12, 29, -28));
  g.userData.view = { heat: cells, apply(p) { bms.visible = p.bms !== false; } };
  return g;
}
function mBat9(ctx) {
  const { THREE, geom, MAT } = ctx;
  const g = new THREE.Group();
  const body = geom.mesh(geom.box(26.5, 46, 17.5, 1.5), colorMat(THREE, MAT.plasticDark, 0x2b2b2b), { y: 23 });
  g.add(geom.part(body, 'Pin 9 V (6LR61 kiềm)', '9.4 V khi mới, điện trở trong ~1.7 Ω → chập chỉ ~5 A nhưng pin nóng nhanh.'));
  g.add(geom.mesh(geom.box(26.6, 18, 17.6, 1.5), colorMat(THREE, MAT.plasticYellow, 0xd99a1c), { y: 37 }));
  g.add(geom.mesh(geom.cyl(3, 3, 3, 16), MAT.steel, { x: -6.3, y: 47.5 }), geom.mesh(geom.cyl(4, 4, 3, 6), MAT.steel, { x: 6.3, y: 47.5 }));
  g.userData.view = { heat: body };
  return g;
}
function mBench(ctx) {
  const { THREE, geom, MAT } = ctx;
  const g = new THREE.Group();
  const shell = geom.mesh(geom.box(120, 70, 130, 3), colorMat(THREE, MAT.plasticGrey, 0x3c4048), { y: 35 });
  g.add(geom.part(shell, 'Nguồn bàn 0–30 V / 0–5 A', 'Ổn áp (CV) theo núm V; khi tải đòi dòng vượt núm A thì chuyển sang giới hạn dòng (CC, đèn đỏ) — bảo vệ mạch thử. Chỉnh trong bảng Thuộc tính.'));
  g.add(geom.mesh(geom.box(116, 66, 2, 1), MAT.plasticBlack, { y: 35, z: 65.2 }));
  const lcd = makeLCD(THREE, 64, 26, { bg: '#0a1a12', fg: '#5dff9a', pxPerMm: 7 });
  lcd.mesh.position.set(-14, 50, 66.4);
  g.add(lcd.mesh);
  const lm = (c) => new THREE.MeshStandardMaterial({ color: 0x222222, emissive: c, emissiveIntensity: 0 });
  const cv = geom.mesh(geom.cyl(1.6, 1.6, 1, 12), lm(0x33ff66), { x: 30, y: 56, z: 66.4, rx: Math.PI / 2 });
  const cc = geom.mesh(geom.cyl(1.6, 1.6, 1, 12), lm(0xff3322), { x: 30, y: 46, z: 66.4, rx: Math.PI / 2 });
  g.add(cv, cc);
  for (const x of [-42, -18]) g.add(geom.mesh(geom.cyl(7.5, 8, 10, 24), MAT.plasticBlack, { x, y: 20, z: 71, rx: Math.PI / 2 }));
  const post = (x, m) => { g.add(geom.mesh(geom.cyl(5, 5, 9, 20), m, { x, y: 18, z: 70.5, rx: Math.PI / 2 })); g.add(geom.mesh(geom.cyl(1.6, 1.6, 12, 10), MAT.brass, { x, y: 18, z: 72, rx: Math.PI / 2 })); };
  post(22, MAT.plasticRed); post(42, MAT.plasticBlack);
  g.userData.view = {
    show(V, I, isCC, on) {
      lcd.set(on ? [[`${V.toFixed(2)} V`, '#5dff9a', 0.55], [`${I.toFixed(3)} A`, '#ffd34d', 0.45]] : [['--.-- V', '#2b5a3a', 0.55], ['-.--- A', '#5a4a1a', 0.45]]);
      if (cv.material.emissive) cv.material.emissiveIntensity = on && !isCC ? 2 : 0;
      if (cc.material.emissive) cc.material.emissiveIntensity = on && isCC ? 2.5 : 0;
    },
  };
  return g;
}
function mGen(ctx) {
  const { THREE, geom, MAT } = ctx;
  const g = new THREE.Group();
  const shell = geom.mesh(geom.box(70, 30, 50, 3), colorMat(THREE, MAT.plasticGrey, 0x2c5a8a), { y: 15 });
  g.add(geom.part(shell, 'Máy phát xung vuông (giả lập chân PWM/UART)', 'Ra xung 0 ↔ Vcao qua điện trở ra 50 Ω. Dùng để lái cổng MOSFET, chân IN của driver, chân RX… Chỉnh tần số, độ rộng xung trong Thuộc tính.'));
  const lcd = makeLCD(THREE, 40, 14, { bg: '#0a1520', fg: '#7fd3ff', pxPerMm: 8 });
  lcd.mesh.position.set(-8, 22, 25.2);
  g.add(lcd.mesh);
  g.add(terminalPost(ctx, MAT.plasticRed, 18, 6, 22), terminalPost(ctx, MAT.plasticBlack, 28, 6, 22));
  g.children.slice(-2).forEach((t) => (t.rotation.x = 0));
  g.userData.view = { show(p, on, out) { lcd.set([[`${p.f ?? 2} Hz ${p.duty ?? 50}%`, '#7fd3ff', 0.55], [on ? (out ? `OUT ${(p.v ?? 5).toFixed(1)} V` : 'OUT 0 V') : 'TẮT', out && on ? '#ffd34d' : '#3a5a70', 0.45]]); } };
  return g;
}
function mMotor(ctx) {
  const { THREE, geom, MAT } = ctx;
  const g = new THREE.Group();
  const can = new THREE.Group();
  can.add(geom.mesh(geom.cyl(14, 14, 30, 32), MAT.steel, { rz: Math.PI / 2 }));
  can.add(geom.mesh(geom.cyl(14, 14, 5, 32), MAT.plasticWhite, { x: -17.5, rz: Math.PI / 2 }));
  can.position.y = 16;
  g.add(geom.part(can, 'Động cơ DC RS-360 (14.4 V)', 'R cuộn dây 7 Ω → dòng kẹt ≈ 2 A. Không tải ~11 500 vòng/phút. Có cuộn cảm 1.5 mH → ngắt đột ngột sinh xung điện áp lớn.'));
  g.add(geom.mesh(geom.box(30, 2, 34), MAT.aluminum, { y: 1 }));
  const shaft = new THREE.Group();
  shaft.add(geom.mesh(geom.cyl(1, 1, 14, 12), MAT.steel, { rz: Math.PI / 2, x: 7 }));
  const flag = new THREE.Group();
  flag.add(geom.mesh(geom.arcSector(0, 11, 0, Math.PI, 1.2), colorMat(THREE, MAT.plasticRed, 0xd23b3b), { rz: Math.PI / 2 }));
  flag.add(geom.mesh(geom.arcSector(0, 11, Math.PI, Math.PI * 2, 1.2), MAT.plasticWhite, { rz: Math.PI / 2 }));
  flag.position.x = 12;
  shaft.add(flag);
  shaft.position.set(15, 16, 0);
  g.add(shaft);
  for (const z of [-5, 5]) g.add(geom.mesh(geom.box(0.5, 6, 3), MAT.brass, { x: -21, y: 16 + 6, z }));
  g.userData.view = { heat: can, spin(a) { shaft.rotation.x = a; } };
  return g;
}
function mFuse(ctx) {
  const { THREE, geom, MAT } = ctx;
  const g = new THREE.Group();
  const holder = geom.mesh(geom.box(30, 10, 12, 2), MAT.plasticBlack, { y: 5 });
  g.add(geom.part(holder, 'Đế cầu chì lưỡi (dây rời)', 'Đặt ngay sau cực + của pin. Đổi định mức cầu chì trong Thuộc tính.'));
  const fm = new THREE.MeshStandardMaterial({ color: 0xd23b3b, transparent: true, opacity: 0.85, roughness: 0.3 });
  const blade = geom.mesh(geom.box(19, 9, 5.2, 0.8), fm, { y: 14 });
  g.add(geom.part(blade, 'Cầu chì lưỡi ATO', 'Dây chảy kẽm nóng chảy ở 420 °C: 2× định mức ≈ 1 s, chập mạch ≈ vài chục ms.'));
  const el = geom.mesh(geom.box(8, 1, 0.8), MAT.zinc.clone(), { y: 14 });
  g.add(el);
  for (const x of [-15, 15]) g.add(geom.mesh(geom.cyl(1.2, 1.2, 10, 10), x < 0 ? MAT.plasticRed : MAT.plasticRed, { x: x * 1.4, y: 4, rz: Math.PI / 2 }));
  for (const x of [-25, 25]) g.add(terminalPost(ctx, MAT.plasticDark, x, 0, 0));
  const COL = { 1: 0x111111, 2: 0x8a8a8a, 3: 0x7a3fb0, 5: 0xd9b38c, 7.5: 0x7a4a2a, 10: 0xd23b3b, 15: 0x2e6fd8, 20: 0xf2d313 };
  g.userData.view = { heat: blade, apply(p) { blade.material.color.setHex(COL[p.rating] ?? 0xd23b3b); }, blown(b) { el.visible = !b; } };
  return g;
}
function mAmmeter(ctx) {
  const { THREE, geom, MAT } = ctx;
  const g = new THREE.Group();
  const shell = geom.mesh(geom.box(48, 14, 30, 2), MAT.plasticBlack, { y: 7 });
  g.add(geom.part(shell, 'Ampe kế DC 10 A (shunt 50 mΩ)', 'Mắc NỐI TIẾP với tải: dòng phải chảy QUA nó. Mắc song song với nguồn = chập mạch!'));
  const lcd = makeLCD(THREE, 30, 12, { bg: '#1a0808', fg: '#ff5a4a', pxPerMm: 8 });
  lcd.mesh.rotation.x = -Math.PI / 2;
  lcd.mesh.position.set(-4, 14.1, 0);
  g.add(lcd.mesh);
  g.add(terminalPost(ctx, MAT.plasticRed, 18, 6, -8), terminalPost(ctx, MAT.plasticBlack, 18, 6, 8));
  g.userData.view = { heat: shell, show(txt) { lcd.set([[txt, '#ff5a4a', 1]]); } };
  return g;
}

// ---------------------------------------------------------------- danh mục
const LEDHEX = { red: 0xff2a2a, yellow: 0xffd21a, green: 0x2aff4a, blue: 0x3a7dff, white: 0xf4f6ff };
const ins = (n, x, z = 0) => ({ n, x, z, y: 0, ins: true });
const term = (n, x, y, z) => ({ n, x, y, z, ins: false });
const R_OPTS = [10, 47, 100, 220, 330, 470, 1000, 2200, 4700, 10000, 33000, 100000, 1000000].map((v) => [v, fmtR(v)]);
const S = {
  R: { k: 'R', label: 'Điện trở', type: 'select', options: R_OPTS },
  led: { k: 'color', label: 'Màu LED', type: 'select', options: [['red', 'Đỏ (Vf 2.0 V)'], ['yellow', 'Vàng (2.1 V)'], ['green', 'Xanh lá (2.2 V)'], ['blue', 'Xanh dương (3.1 V)'], ['white', 'Trắng (3.1 V)']] },
};

/** id danh mục → { name, icon, group, desc, etype, props, pins, schema, build } */
export const CATALOG = [
  // Nguồn
  { id: 'nguon-ban', name: 'Nguồn bàn 0–30 V / 5 A', icon: '🔌', group: 'Nguồn', etype: 'bench', props: { v: 5, i: 1 }, pins: [term('+', 22, 18, 78), term('-', 42, 18, 78)], build: mBench,
    schema: [{ k: 'v', label: 'Điện áp đặt V', type: 'range', min: 0, max: 30, step: 0.1, unit: 'V' }, { k: 'i', label: 'Giới hạn dòng', type: 'range', min: 0.01, max: 5, step: 0.01, unit: 'A' }],
    desc: 'Nguồn thí nghiệm có giới hạn dòng — người bạn tốt nhất khi thử mạch mới.' },
  { id: 'pin-4s', name: 'Pin 4S Li-ion 14.4 V', icon: '🔋', group: 'Nguồn', etype: 'pack4s', props: { soc: 100, bms: true }, pins: [term('+', -12, 39, -28), term('-', 12, 39, -28)], build: mPack,
    schema: [{ k: 'soc', label: 'Dung lượng còn', type: 'range', min: 0, max: 100, step: 1, unit: '%' }, { k: 'bms', label: 'Có mạch BMS bảo vệ', type: 'toggle' }],
    desc: 'Pin của robot: 16.8 V đầy → 12.0 V cạn, điện trở trong ~0.1 Ω.' },
  { id: 'pin-9v', name: 'Pin 9 V', icon: '🔋', group: 'Nguồn', etype: 'bat9v', props: { soc: 100 }, pins: [term('+', -6.3, 49, 0), term('-', 6.3, 49, 0)], build: mBat9,
    schema: [{ k: 'soc', label: 'Dung lượng còn', type: 'range', min: 0, max: 100, step: 1, unit: '%' }], desc: 'Pin vuông 9 V kiềm — tiện thử LED.' },
  { id: 'phat-xung', name: 'Máy phát xung vuông', icon: '〰️', group: 'Nguồn', etype: 'pulse', props: { v: 5, f: 2, duty: 50 }, pins: [term('OUT', 18, 15, 22), term('GND', 28, 15, 22)], build: mGen,
    schema: [{ k: 'v', label: 'Mức cao', type: 'range', min: 0, max: 15, step: 0.1, unit: 'V' }, { k: 'f', label: 'Tần số', type: 'range', min: 0.2, max: 200, step: 0.1, unit: 'Hz' }, { k: 'duty', label: 'Độ rộng xung', type: 'range', min: 0, max: 100, step: 1, unit: '%' }],
    desc: 'Giả lập chân PWM/UART của vi điều khiển (tần số làm chậm để mắt thấy).' },
  // Linh kiện cơ bản
  ...[[220, 'r-220'], [330, 'r-330'], [1000, 'r-1k'], [10000, 'r-10k'], [33000, 'r-33k'], [100, 'r-100']].map(([R, id]) => ({
    id, name: `Điện trở ${fmtR(R)} ¼ W`, icon: '🟫', group: 'Linh kiện cơ bản', etype: 'resistor', props: { R }, pins: [ins('1', 0), ins('2', 4 * P)], build: mResistor, schema: [S.R],
    desc: 'Điện trở ¼ W, 2 chân cách 4 lỗ (10.16 mm). Đổi giá trị trong Thuộc tính.' })),
  { id: 'bien-tro', name: 'Biến trở 10 kΩ', icon: '🎚', group: 'Linh kiện cơ bản', etype: 'pot', props: { R: 10000, pos: 50 }, pins: [ins('1', 0), ins('W', P), ins('3', 2 * P)], build: mPot,
    schema: [{ k: 'pos', label: 'Vị trí con chạy', type: 'range', min: 0, max: 100, step: 1, unit: '%' }, { k: 'R', label: 'Tổng trở', type: 'select', options: [[1000, '1 kΩ'], [10000, '10 kΩ'], [100000, '100 kΩ']] }],
    desc: 'Chiết áp 3 chân: 1 — W (con chạy) — 3. Dùng làm phân áp chỉnh được.' },
  { id: 'tu-gom-100n', name: 'Tụ gốm 100 nF (104)', icon: '🟡', group: 'Linh kiện cơ bản', etype: 'ceramic', props: { C: 100e-9, Vr: 50 }, pins: [ins('1', 0), ins('2', P)], build: (c) => mCeramic(c, 0xe0b23a), desc: 'Tụ lọc nhiễu sát chân IC.' },
  { id: 'tu-gom-22p', name: 'Tụ gốm 22 pF', icon: '🟠', group: 'Linh kiện cơ bản', etype: 'ceramic', props: { C: 22e-12, Vr: 50 }, pins: [ins('1', 0), ins('2', P)], build: (c) => mCeramic(c, 0xd2691e), desc: 'Tụ tải thạch anh (2 cái, từ OSC1/OSC2 xuống GND).' },
  { id: 'tu-hoa-1000u', name: 'Tụ hoá 1000 µF / 25 V', icon: '🥫', group: 'Linh kiện cơ bản', etype: 'electro', props: { C: 1000e-6, Vr: 25 }, pins: [ins('+', 0), ins('-', 2 * P)], build: (c) => mElectro(c, 5, 20, 2 * P),
    schema: [{ k: 'Vr', label: 'Điện áp định mức', type: 'select', options: [[6.3, '6.3 V'], [16, '16 V'], [25, '25 V'], [35, '35 V']] }], desc: 'Có cực tính: vạch trắng = chân ÂM. Cắm ngược → nổ!' },
  { id: 'tu-hoa-100u', name: 'Tụ hoá 100 µF / 16 V', icon: '🥫', group: 'Linh kiện cơ bản', etype: 'electro', props: { C: 100e-6, Vr: 16 }, pins: [ins('+', 0), ins('-', P)], build: (c) => mElectro(c, 3.15, 11, P),
    schema: [{ k: 'Vr', label: 'Điện áp định mức', type: 'select', options: [[6.3, '6.3 V'], [16, '16 V'], [25, '25 V'], [35, '35 V']] }], desc: 'Tụ hoá nhỏ — chú ý định mức 16 V < pin 16.8 V!' },
  { id: 'cuon-cam', name: 'Cuộn cảm 1 mH', icon: '🌀', group: 'Linh kiện cơ bản', etype: 'inductor', props: { L: 1e-3, DCR: 0.5, Irated: 1 }, pins: [ins('1', 0), ins('2', 2 * P)], build: mInductor, desc: 'Cuộn dây quấn trên lõi ferrite: chống lại sự thay đổi dòng điện.' },
  { id: 'cong-tac', name: 'Công tắc gạt 3 chân', icon: '🎛', group: 'Linh kiện cơ bản', etype: 'switch', props: { on: false }, pins: [ins('1', 0), ins('C', P), ins('3', 2 * P)], build: mSwitch,
    schema: [{ k: 'on', label: 'Gạt sang chân 3 (C–3)', type: 'toggle' }], desc: 'SPDT: chân giữa C nối với 1 hoặc 3. Chọn rồi bấm phím Space để gạt.' },
  { id: 'nut-nhan', name: 'Nút nhấn 4 chân 6×6', icon: '🔘', group: 'Linh kiện cơ bản', etype: 'button', props: { pressed: false }, pins: [ins('A1', 0), ins('B1', 2 * P), ins('A2', 0, 3 * P), ins('B2', 2 * P, 3 * P)], build: mButton,
    schema: [{ k: 'pressed', label: 'Đang nhấn', type: 'toggle' }], desc: 'Cắm vắt qua rãnh giữa. A1–A2 luôn nối nhau, B1–B2 luôn nối nhau; nhấn → A nối B. Chọn rồi giữ phím Space để nhấn.' },
  { id: 'thach-anh', name: 'Thạch anh 20 MHz', icon: '💎', group: 'Linh kiện cơ bản', etype: 'crystal', props: {}, pins: [ins('1', 0), ins('2', P)], build: mCrystal, desc: 'Cho PIC xung nhịp 20 MHz (chân đã bẻ cho vừa 2 lỗ liền nhau).' },
  // Bán dẫn
  ...[['led-do', 'red', 'LED đỏ 5 mm'], ['led-xanh', 'green', 'LED xanh lá 5 mm'], ['led-vang', 'yellow', 'LED vàng 5 mm'], ['led-lam', 'blue', 'LED xanh dương 5 mm'], ['led-trang', 'white', 'LED trắng 5 mm']].map(([id, color, name]) => ({
    id, name, icon: '💡', group: 'Bán dẫn', etype: 'led', props: { color }, pins: [ins('A', 0), ins('K', P)], build: (c) => { const o = mLed(c); o.userData.view.apply({ color }, Object.fromEntries(Object.entries(LEDHEX).map(([k, h]) => [k, { hex: h }]))); return o; }, schema: [S.led],
    desc: 'Chân dài = A (+), chân ngắn/mặt vát = K (−). Luôn có điện trở hạn dòng!' })),
  { id: 'diode-1n4007', name: 'Diode 1N4007', icon: '➡️', group: 'Bán dẫn', etype: 'diode', props: { model: '1n4007' }, pins: [ins('A', 0), ins('K', 4 * P)], build: (c) => mDiode(c, false), desc: 'Diode silic 1 A / 1000 V. Vạch bạc = K.' },
  { id: 'diode-1n5822', name: 'Diode Schottky 1N5822', icon: '➡️', group: 'Bán dẫn', etype: 'diode', props: { model: '1n5822' }, pins: [ins('A', 0), ins('K', 4 * P)], build: (c) => mDiode(c, true), desc: 'Schottky 3 A / 40 V, sụt áp thấp, nhanh — diode dập (flyback) cho động cơ.' },
  { id: 'irlz44n', name: 'MOSFET IRLZ44N', icon: '🔲', group: 'Bán dẫn', etype: 'nmos', props: { model: 'irlz44n' }, pins: [ins('G', 0), ins('D', P), ins('S', 2 * P)], build: (c) => mTo220(c, 'MOSFET IRLZ44N (logic-level, TO-220)'),
    schema: [{ k: 'model', label: 'Loại', type: 'select', options: [['irlz44n', 'IRLZ44N (logic-level)'], ['irf520', 'IRF520 (cần 10 V)']] }], desc: 'Chân: G – D – S. Mở hẳn với 5 V (thậm chí 3.3 V).' },
  { id: 'irf520', name: 'MOSFET IRF520', icon: '🔲', group: 'Bán dẫn', etype: 'nmos', props: { model: 'irf520' }, pins: [ins('G', 0), ins('D', P), ins('S', 2 * P)], build: (c) => mTo220(c, 'MOSFET IRF520 (chuẩn, TO-220)'),
    schema: [{ k: 'model', label: 'Loại', type: 'select', options: [['irlz44n', 'IRLZ44N (logic-level)'], ['irf520', 'IRF520 (cần 10 V)']] }], desc: 'Cần Vgs 10 V mới mở hẳn — với 5 V chỉ mở một phần và nóng!' },
  // Mô-đun
  { id: 'buck-xl4015', name: 'Module buck XL4015', icon: '🔌', group: 'Mô-đun', etype: 'buck', props: { vset: 5 }, pins: [term('IN+', -24.5, 11, -2.5), term('IN-', -24.5, 11, 2.5), term('OUT+', 24.5, 11, -2.5), term('OUT-', 24.5, 11, 2.5)], build: mBuck,
    schema: [{ k: 'vset', label: 'Vout (vặn trimmer)', type: 'range', min: 1.25, max: 20, step: 0.05, unit: 'V' }], desc: 'Hạ áp 8–36 V → 1.25–32 V, 5 A, hiệu suất ~90 %.' },
  { id: 'ldo-1117', name: 'Ổn áp LM1117-3.3', icon: '🔲', group: 'Mô-đun', etype: 'ldo', props: {}, pins: [ins('GND', 0), ins('OUT', P), ins('IN', 2 * P)], build: mLdo, desc: 'LDO 3.3 V / 1 A. Chân: GND – OUT – IN. Đốt (Vin−3.3)·I thành nhiệt!' },
  { id: 'drv8871', name: 'Module DRV8871', icon: '🔀', group: 'Mô-đun', etype: 'drv8871', props: {},
    pins: [ins('IN1', 0), ins('IN2', P), ins('GND', 2 * P), term('VM', -8.5, 19, 15), term('GND2', -3.5, 19, 15), term('OUT1', 8.5, 19, 15), term('OUT2', 13.5, 19, 15)], build: mDrv,
    desc: 'Cầu H 1 kênh: IN1/IN2 điều khiển chiều quay, VM 6.5–45 V, giới hạn dòng ~2.1 A.' },
  { id: 'bss138', name: 'Module chuyển mức BSS138', icon: '🔀', group: 'Mô-đun', etype: 'bss138', props: {},
    pins: [...['LV1', 'LV2', 'LV', 'GND', 'LV3', 'LV4'].map((n, k) => ins(n, k * P)), ...['HV1', 'HV2', 'HV', 'GND2', 'HV3', 'HV4'].map((n, k) => ins(n, k * P, -5 * P))], build: mBss138,
    desc: '4 kênh 2 chiều 3.3 V ⇄ 5 V. LV = 3.3 V, HV = 5 V, chung GND.' },
  // Vi điều khiển
  { id: 'pic16f877a', name: 'PIC16F877A (DIP-40)', icon: '🧠', group: 'Vi điều khiển', etype: 'pic', props: { program: 'blink' },
    pins: Array.from({ length: 40 }, (_, i) => (i < 20 ? ins(String(i + 1), i * P) : ins(String(i + 1), (39 - i) * P, -6 * P))), build: mPic,
    schema: [{ k: 'program', label: 'Chương trình đã nạp', type: 'select', options: [['blink', 'Nháy LED RD7 (1 Hz)'], ['robovac', 'RoboVac rút gọn (chổi, bánh, đo pin)'], ['dao-chieu', 'Đảo chiều bánh trái mỗi 2 s'], ['chua-nap', 'Chip trắng (chưa nạp)']] }],
    desc: 'Cắm vắt qua rãnh: chân 1 ở hàng g, chân 40 ở hàng c. Cần: VDD+VSS cả 2 cặp, MCLR kéo lên 10 kΩ, thạch anh 20 MHz.' },
  { id: 'esp32-s3', name: 'ESP32-S3-DevKitC-1', icon: '📶', group: 'Vi điều khiển', etype: 'esp32', props: { program: 'uart' },
    pins: [...['3V3', '3V3_2', 'RST', 'G4', 'G5', 'G6', 'G7', 'G15', 'G16', 'G17', 'G18', 'G8', 'G3', 'G46', 'G9', 'G10', 'G11', 'G12', 'G13', 'G14', '5V', 'GND'].map((n, k) => ins(n, k * P)),
      ...['GND_2', 'TX', 'RX', 'G1', 'G2', 'G42', 'G41', 'G40', 'G39', 'G38', 'G37', 'G36', 'G35', 'G0', 'G45', 'G48', 'G47', 'G21', 'G20', 'G19', 'GND_3', 'GND_4'].map((n, k) => ins(n, k * P, -9 * P))],
    build: mEsp32, schema: [{ k: 'program', label: 'Chương trình', type: 'select', options: [['uart', 'UART chờ lệnh (G17 = TX ở mức 1)'], ['blink', 'Nháy G2'], ['chua-nap', 'Không chạy gì']] }],
    desc: 'Bo 3.3 V. Hàng J1 (3V3…5V, GND) ở phía gần, J2 ở phía xa, cách 9 lỗ.' },
  // Tải
  { id: 'dong-co', name: 'Động cơ DC RS-360', icon: '⚙️', group: 'Tải', etype: 'motor', props: { load: 2, stall: false }, pins: [term('+', -21, 25, -5), term('-', -21, 25, 5)], build: mMotor,
    schema: [{ k: 'load', label: 'Tải trên trục', type: 'range', min: 0, max: 22, step: 0.5, unit: 'mN·m' }, { k: 'stall', label: 'Giữ chặt trục (kẹt)', type: 'toggle' }], desc: 'Động cơ bánh xe: 7 Ω, 1.5 mH, kẹt ≈ 2 A ở 14.4 V.' },
  { id: 'tro-cong-suat', name: 'Điện trở công suất 10 Ω 5 W', icon: '🧱', group: 'Tải', etype: 'powerres', props: { R: 10 }, pins: [ins('1', 0), ins('2', 10 * P)], build: mPowerRes,
    schema: [{ k: 'R', label: 'Điện trở', type: 'select', options: [[2.2, '2.2 Ω'], [4.7, '4.7 Ω'], [10, '10 Ω'], [22, '22 Ω']] }], desc: 'Tải giả (dummy load) — chịu 5 W, rất nóng khi chạy hết công suất.' },
  // Đo lường
  { id: 'cau-chi', name: 'Cầu chì lưỡi + đế', icon: '🧯', group: 'Đo lường', etype: 'fuse', props: { rating: 10 }, pins: [term('1', -25, 10, 0), term('2', 25, 10, 0)], build: mFuse,
    schema: [{ k: 'rating', label: 'Định mức', type: 'select', options: [[1, '1 A'], [2, '2 A'], [3, '3 A'], [5, '5 A'], [10, '10 A'], [15, '15 A']] }], desc: 'Bảo vệ: đứt trước khi dây dẫn kịp cháy.' },
  { id: 'ampe-ke', name: 'Ampe kế 10 A', icon: '📟', group: 'Đo lường', etype: 'ammeter', props: {}, pins: [term('+', 18, 15, -8), term('-', 18, 15, 8)], build: mAmmeter, desc: 'Mắc nối tiếp để đo dòng.' },
].map((c) => ({ ...c, schema: c.schema || [] }));

// ---------------------------------------------------------------- đồng hồ vạn năng cố định trên bàn
export function buildMultimeter(ctx) {
  const { THREE, geom, MAT } = ctx;
  const g = new THREE.Group();
  const holster = colorMat(THREE, MAT.plasticYellow, 0xf2b705);
  g.add(geom.part(geom.mesh(geom.box(76, 30, 150, 6), holster, { y: 15 }), 'Đồng hồ vạn năng', 'Chọn thang đo trong bảng Thí nghiệm, bấm "🔴⚫ Que đo" rồi bấm 2 điểm: điểm 1 = que đen (COM), điểm 2 = que đỏ. Thang A/mA phải mắc NỐI TIẾP.'));
  g.add(geom.mesh(geom.box(64, 2, 136, 3), MAT.plasticDark, { y: 30 }));
  const lcd = makeLCD(THREE, 52, 26, { bg: '#b9c6a6', fg: '#121810', pxPerMm: 7 });
  lcd.mesh.rotation.x = -Math.PI / 2;
  lcd.mesh.position.set(0, 31.2, -46);
  g.add(lcd.mesh);
  const dial = new THREE.Group();
  dial.add(geom.mesh(geom.cyl(17, 17, 5, 40), MAT.plasticBlack));
  dial.add(geom.mesh(geom.box(4, 4, 30), MAT.plasticGrey, { y: 3.2 }));
  dial.position.set(0, 33, 8);
  g.add(dial);
  const jacks = { com: [8, 32, 56], v: [24, 32, 56], a: [-24, 32, 56] };
  for (const [k, p] of Object.entries(jacks)) g.add(geom.mesh(geom.cyl(4.2, 4.2, 2, 20), k === 'com' ? MAT.plasticBlack : MAT.plasticRed, { x: p[0], y: 31.2, z: p[2] }));
  return { group: g, lcd, dial, jacks };
}
