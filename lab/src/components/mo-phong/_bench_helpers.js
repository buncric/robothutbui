// Thư viện dùng chung cho các "bàn thí nghiệm" trong nhóm mo-phong
// (ban-thi-nghiem-dien.js, han-mach-pic.js). KHÔNG có export default → app bỏ qua file này khi nạp linh kiện.
// Đơn vị: mm, trục Y hướng lên. Mọi hàm dựng hình nhận `ctx` (THREE, MAT, geom) của linh kiện gọi nó.

export const AMBIENT = 30;   // °C — phòng thí nghiệm ở Việt Nam

// ---------------------------------------------------------------- định dạng
/** Thời gian thật: µs / ms / s / phút / giờ */
export function fmtTime(s) {
  if (!(s > 0)) return '0 s';
  if (s < 1e-3) return `${(s * 1e6).toFixed(0)} µs`;
  if (s < 1) return `${(s * 1e3).toFixed(s < 0.01 ? 2 : 1)} ms`;
  if (s < 120) return `${s.toFixed(2)} s`;
  if (s < 7200) return `${Math.floor(s / 60)} phút ${Math.floor(s % 60)} s`;
  return `${(s / 3600).toFixed(1)} giờ`;
}
/** Tốc độ phát: chậm 100× / thời gian thật / nhanh 10× */
export function fmtRate(r) {
  if (Math.abs(r - 1) < 1e-6) return 'thời gian thật';
  return r < 1 ? `chậm ${Math.round(1 / r)}×` : `nhanh ${Math.round(r)}×`;
}
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ---------------------------------------------------------------- vật lý nhỏ
/**
 * Thời gian đứt của cầu chì lưỡi (ATO/ATC, loại thường) theo bội số dòng x = I / I_định_mức.
 * Xấp xỉ đường cong datasheet: 135 % → ~30 s · 200 % → ~0.3 s · 350 % → ~70 ms · 1000 % → ~7 ms · 1600 % → ~3 ms.
 * Dưới 135 % coi như không bao giờ đứt.
 */
export function fuseBlowTime(x, k = 0.7) {
  if (x < 1.35) return Infinity;
  return k / (x * x - 1.8);
}

/** Một bước nhiệt độ của "nút nhiệt" (linh kiện): C·dT/dt = P − (T − Ta)/Rth  (dạng mũ chính xác, ổn định với bước lớn) */
export function thermal(T, P, C, Rth, h, Ta = AMBIENT) {
  const Tss = Ta + P * Rth;
  return Tss + (T - Tss) * Math.exp(-h / (Rth * C));
}

/** Mức "nóng đỏ" 0..1 cho fx.heat */
export const heatLevel = (T, start = 90, full = 450) => clamp((T - start) / (full - start), 0, 1);

// ---------------------------------------------------------------- màn hình LCD (canvas)
/**
 * Màn hình chữ số vẽ bằng canvas → texture. Trong Node (smoke test) không có document → chỉ là tấm màu.
 * Trả về { mesh, set(lines) } — lines: mảng chuỗi hoặc [chuỗi, màu, cỡ(0..1 theo chiều cao)].
 */
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
    if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
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
    const n = lines.length;
    let y = 0;
    lines.forEach((ln) => {
      const [txt, col, size] = Array.isArray(ln) ? ln : [ln, fg, 1 / n];
      const lh = H * (size ?? 1 / n);
      g.fillStyle = col || fg;
      g.font = `bold ${Math.round(lh * 0.78)}px ui-monospace, Menlo, Consolas, monospace`;
      g.textBaseline = 'middle';
      g.textAlign = 'right';
      g.fillText(String(txt), W - W * 0.04, y + lh / 2);
      y += lh;
    });
    tex.needsUpdate = true;
  }
  return { mesh, set };
}

// ---------------------------------------------------------------- dây nối
/** Đường đi của dây mềm: nhô lên khỏi đầu cực, võng xuống mặt bàn, rồi lên đầu cực kia */
export function wirePoints(a, b, { lift = 9, rest = 1.6, side = 0 } = {}) {
  const dx = b[0] - a[0], dz = b[2] - a[2];
  const len = Math.hypot(dx, dz) || 1;
  const nx = -dz / len, nz = dx / len;              // pháp tuyến ngang (để các dây không chồng nhau)
  const off = side * 3;
  const p = (k, y) => [a[0] + dx * k + nx * off * Math.sin(Math.PI * k), y, a[2] + dz * k + nz * off * Math.sin(Math.PI * k)];
  const hi = Math.max(a[1], b[1]);
  if (len < 40) {   // dây ngắn: một vòng cung
    return [a, [a[0], a[1] + lift * 0.6, a[2]], p(0.5, hi + lift), [b[0], b[1] + lift * 0.6, b[2]], b];
  }
  return [a, [a[0], a[1] + lift, a[2]], p(0.22, rest + 2), p(0.5, rest), p(0.78, rest + 2), [b[0], b[1] + lift, b[2]], b];
}

/** Dây ống (TubeGeometry) với vật liệu riêng (để làm nóng/đổi màu từng dây) */
export function makeWire(ctx, a, b, color, radius = 0.6, opt = {}) {
  const pts = opt.points || wirePoints(a, b, opt);
  const m = ctx.geom.wire(pts, { radius, color });
  m.material.roughness = 0.55;
  return m;
}

// ---------------------------------------------------------------- linh kiện nhỏ xuyên lỗ
/** Bo mạch đục lỗ (perfboard) phủ thiếc 2 mặt — pad dùng InstancedMesh (1 lần vẽ cho hàng nghìn lỗ) */
export function perfboard(ctx, w, d, { pitch = 2.54, t = 1.6, color = 0x2f7d4a } = {}) {
  const { THREE, MAT, geom } = ctx;
  const g = new THREE.Group();
  const fr4 = MAT.pcbGreen.clone();
  fr4.color = new THREE.Color(color);
  const board = geom.mesh(geom.box(w, t, d, 0.6), fr4, { y: -t / 2 });
  g.add(board);
  const nx = Math.floor((w - 3) / pitch) + 1, nz = Math.floor((d - 3) / pitch) + 1;
  const x0 = -((nx - 1) * pitch) / 2, z0 = -((nz - 1) * pitch) / 2;
  const padGeo = new THREE.CylinderGeometry(0.85, 0.85, 0.06, 10);
  const holeGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.08, 8);
  const padMat = MAT.tin.clone();
  padMat.roughness = 0.4;
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x0d0f10 });
  const n = nx * nz;
  const pads = new THREE.InstancedMesh(padGeo, padMat, n * 2);
  const holes = new THREE.InstancedMesh(holeGeo, holeMat, n * 2);
  const M = new THREE.Matrix4();
  let k = 0;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x = x0 + i * pitch, z = z0 + j * pitch;
    M.makeTranslation(x, 0.03, z); pads.setMatrixAt(k, M); M.makeTranslation(x, 0.045, z); holes.setMatrixAt(k, M); k++;
    M.makeTranslation(x, -t - 0.03, z); pads.setMatrixAt(k, M); M.makeTranslation(x, -t - 0.045, z); holes.setMatrixAt(k, M); k++;
  }
  pads.receiveShadow = true;
  g.add(pads, holes);
  /** toạ độ lỗ (i, j) → [x, z] */
  const hole = (i, j) => [x0 + i * pitch, z0 + j * pitch];
  return { group: g, board, hole, nx, nz, pitch, t };
}

/** Đế IC DIP-40 (khấc ở đầu −X, chân 1 ở góc −X, +Z) */
export function dipSocket(ctx, { pins = 40, pitch = 2.54, row = 15.24 } = {}) {
  const { THREE, MAT, geom } = ctx;
  const half = pins / 2;
  const len = half * pitch + 1.6;
  const g = new THREE.Group();
  const plastic = MAT.plasticBlack;
  for (const s of [1, -1]) g.add(geom.mesh(geom.box(len, 3.2, 2.6, 0.3), plastic, { y: 1.6, z: s * row / 2 }));
  for (const s of [1, -1]) g.add(geom.mesh(geom.box(2.2, 3.2, row + 2.6, 0.3), plastic, { x: s * (len / 2 - 1.1), y: 1.6 }));
  g.add(geom.mesh(geom.box(len - 4, 0.8, 2, 0.2), plastic, { y: 0.4 }));       // thanh giữa
  const notch = geom.mesh(geom.cyl(1.5, 1.5, 0.5, 20, false), MAT.plasticGrey, { x: -len / 2 + 0.9, y: 3.2 });
  g.add(notch);
  const contactGeo = geom.box(1.1, 0.3, 1.1);
  for (let i = 0; i < pins; i++) {
    const x = i < half ? -((half - 1) * pitch) / 2 + i * pitch : ((half - 1) * pitch) / 2 - (i - half) * pitch;
    const z = i < half ? row / 2 : -row / 2;
    g.add(geom.mesh(contactGeo, MAT.gold, { x, y: 3.25, z }));
  }
  return { group: g, len, notch };
}

/** Toạ độ chân n (1..40) của IC DIP đặt tại gốc (khấc −X): [x, z] — theo đúng quy ước geom.dipPackage */
export function dipPinXZ(n, { pins = 40, pitch = 2.54, row = 15.24 } = {}) {
  const half = pins / 2;
  const i = n - 1;
  if (i < half) return [-((half - 1) * pitch) / 2 + i * pitch, row / 2];
  return [((half - 1) * pitch) / 2 - (i - half) * pitch, -row / 2];
}

/** Tụ gốm (đĩa) đứng, 2 chân cách `span` mm theo X. color: vàng (MLCC 104) / cam-nâu (22 pF) */
export function ceramicCap(ctx, { color = 0xe0b23a, span = 2.54, r = 2.3, h = 5 } = {}) {
  const { THREE, MAT, geom } = ctx;
  const g = new THREE.Group();
  const m = MAT.plasticYellow.clone();
  m.color = new THREE.Color(color);
  const disc = geom.mesh(geom.cyl(r, r, 1.6, 24), m, { y: h, rx: Math.PI / 2 });
  g.add(disc);
  for (const s of [-1, 1]) g.add(geom.mesh(geom.cyl(0.25, 0.25, h, 6), MAT.tin, { x: s * span / 2, y: h / 2 - 1.2 }));
  return g;
}

/** Tụ hóa (điện phân nhôm) đứng: vạch trắng đánh dấu cực ÂM ở phía −X. Trả { group, body, top, stripe } */
export function electrolytic(ctx, { r = 5, h = 20, color = 0x1d2a55, span = 5, legs = 3 } = {}) {
  const { THREE, MAT, geom } = ctx;
  const g = new THREE.Group();
  const sleeve = MAT.plasticBlue.clone();
  sleeve.color = new THREE.Color(color);
  sleeve.roughness = 0.35;
  const body = geom.mesh(geom.cyl(r, r, h, 40), sleeve, { y: h / 2 + 0.6 });
  g.add(body);
  const stripeMat = MAT.plasticWhite.clone();
  stripeMat.color = new THREE.Color(0xc9d2dc);
  const stripe = geom.mesh(geom.arcSector(r + 0.01, r + 0.08, Math.PI - 0.45, Math.PI + 0.45, h * 0.94), stripeMat, { y: h / 2 + 0.6 });
  g.add(stripe);
  // nắp nhôm có rãnh "K" (van an toàn) — dạng vòm để làm phồng
  const topGeo = geom.lathe([[0, 0.25], [r * 0.5, 0.2], [r * 0.85, 0.08], [r * 0.93, 0]], 32);
  const top = geom.mesh(topGeo, MAT.aluminum, { y: h + 0.6 });
  g.add(top);
  for (const a of [0, Math.PI / 3, -Math.PI / 3]) {
    top.add(geom.mesh(geom.box(r * 1.4, 0.06, 0.25), MAT.plasticDark, { y: 0.24, ry: a }));
  }
  g.add(geom.mesh(geom.cyl(r * 0.95, r * 0.95, 0.6, 32), MAT.rubber, { y: 0.3 }));
  for (const s of [-1, 1]) g.add(geom.mesh(geom.cyl(0.3, 0.3, legs, 6), MAT.tin, { x: s * span / 2, y: -legs / 2 + 0.2 }));
  return { group: g, body, top, stripe };
}

const BAND = { black: 0x111111, brown: 0x7a4a1e, red: 0xd02c2c, orange: 0xf08a1c, yellow: 0xf2d13a, green: 0x2fa84f, blue: 0x2f5fd0, violet: 0x8a4fd0, grey: 0x8a8a8a, white: 0xf2f2f2, gold: 0xd4a640 };
/** Điện trở 1/4 W nằm ngang, chân cách `span` mm theo X. bands: ['brown','black','orange','gold'] = 10 kΩ */
export function resistor(ctx, bands = ['brown', 'black', 'orange', 'gold'], { span = 10.16, lift = 1.6 } = {}) {
  const { THREE, MAT, geom } = ctx;
  const g = new THREE.Group();
  const bodyMat = MAT.plasticWhite.clone();
  bodyMat.color = new THREE.Color(0xd9c39a);
  const y = lift + 1.2;
  g.add(geom.mesh(geom.cyl(1.15, 1.15, 6.0, 16), bodyMat, { y, rz: Math.PI / 2 }));
  for (const s of [-1, 1]) g.add(geom.mesh(geom.cyl(1.3, 1.3, 0.9, 16), bodyMat, { x: s * 2.7, y, rz: Math.PI / 2 }));
  bands.forEach((b, i) => {
    const m = MAT.plasticRed.clone();
    m.color = new THREE.Color(BAND[b] ?? 0x888888);
    g.add(geom.mesh(geom.cyl(1.2, 1.2, 0.5, 16), m, { x: -2.1 + i * (i === 3 ? 1.5 : 1.15), y, rz: Math.PI / 2 }));
  });
  for (const s of [-1, 1]) {
    g.add(geom.mesh(geom.cyl(0.25, 0.25, span / 2 - 3, 6), MAT.tin, { x: s * (span / 4 + 1.5), y, rz: Math.PI / 2 }));
    g.add(geom.mesh(geom.cyl(0.25, 0.25, y + 1.5, 6), MAT.tin, { x: s * span / 2, y: (y - 1.5) / 2 }));
  }
  return g;
}

/** Thạch anh HC-49/S (vỏ thép thấp), 2 chân cách 4.88 mm theo X */
export function crystal(ctx) {
  const { THREE, MAT, geom } = ctx;
  const g = new THREE.Group();
  g.add(geom.mesh(geom.box(11, 3.6, 4.6, 1.2), MAT.steel, { y: 2.3 }));
  g.add(geom.mesh(geom.box(11.6, 0.4, 5.0, 0.2), MAT.steel, { y: 0.6 }));
  for (const s of [-1, 1]) g.add(geom.mesh(geom.cyl(0.22, 0.22, 3, 6), MAT.tin, { x: s * 2.44, y: -0.8 }));
  return g;
}

/** LED 5 mm. Trả { group, lens } — đổi lens.material.emissive để sáng */
export function led5(ctx, color = 0xff3030) {
  const { THREE, MAT, geom } = ctx;
  const g = new THREE.Group();
  const lm = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.85, roughness: 0.2, emissive: color, emissiveIntensity: 0 });
  const lens = geom.mesh(geom.cyl(2.5, 2.5, 5.2, 24), lm, { y: 4.6 });
  const dome = geom.mesh(new THREE.SphereGeometry(2.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), lm, { y: 7.2 });
  const flange = geom.mesh(geom.cyl(2.9, 2.9, 1, 24), lm, { y: 1.6 });
  g.add(lens, dome, flange);
  g.add(geom.mesh(geom.cyl(0.25, 0.25, 3, 6), MAT.tin, { x: -1.27, y: 0 }), geom.mesh(geom.cyl(0.25, 0.25, 3, 6), MAT.tin, { x: 1.27, y: 0 }));
  g.userData.lensMeshes = [lens, dome, flange];
  return { group: g, lens };
}

/** Đặt độ sáng cho LED (0..1) — luôn lấy material HIỆN TẠI của mesh */
export function setLed(ledObj, level, color) {
  for (const m of ledObj.group.userData.lensMeshes) {
    if (!m.material.emissive) continue;
    if (color !== undefined) m.material.emissive.setHex(color);
    m.material.emissiveIntensity = level * 2.2;
  }
}

/** Mối hàn thiếc: nón bóng sáng quanh chân linh kiện. material dùng chung (truyền vào) */
export function solderJointGeo(ctx) {
  return ctx.geom.lathe([[0.32, 1.25], [0.45, 1.05], [0.7, 0.6], [1.05, 0.22], [1.2, 0.04], [1.22, 0]], 20);
}

/** Mỏ hàn: gốc toạ độ = đầu mũi hàn, thân kéo dài theo +Y */
export function solderingIron(ctx) {
  const { THREE, MAT, geom } = ctx;
  const g = new THREE.Group();
  const tipMat = MAT.tin.clone();
  tipMat.emissive = new THREE.Color(0x401000);
  g.add(geom.mesh(geom.lathe([[0, 0], [0.5, 1.5], [1.1, 6], [1.6, 10]], 16), tipMat));
  g.add(geom.mesh(geom.cyl(2.4, 2.4, 40, 20), MAT.steel, { y: 30 }));
  const grip = MAT.rubber.clone();
  grip.color = new THREE.Color(0x2c4f8c);
  g.add(geom.mesh(geom.cyl(6, 5, 75, 24), grip, { y: 87 }));
  g.add(geom.mesh(geom.cyl(7, 7, 6, 24), MAT.plasticBlack, { y: 52 }));
  g.add(geom.mesh(geom.cyl(2, 2, 30, 8), MAT.plasticBlack, { y: 138 }));
  return g;
}

/** Que đo đồng hồ: gốc = mũi kim, cán theo +Y */
export function probe(ctx, color = 0xd23b3b) {
  const { THREE, MAT, geom } = ctx;
  const g = new THREE.Group();
  g.add(geom.mesh(geom.cyl(0.25, 0.6, 14, 10), MAT.steel, { y: 7 }));
  const m = MAT.plasticRed.clone();
  m.color = new THREE.Color(color);
  g.add(geom.mesh(geom.cyl(3.6, 3.6, 4, 16), m, { y: 16 }));
  g.add(geom.mesh(geom.cyl(3.0, 2.6, 60, 16), m, { y: 48 }));
  return g;
}

/** Đặt một vật có gốc tại mũi (que đo, mỏ hàn) chạm điểm p, cán ngả theo hướng (dirX, dirZ) góc tilt (rad) */
export function aimTool(obj, p, dirX, dirZ, tilt = 0.75) {
  obj.position.set(p[0], p[1], p[2]);
  const yaw = Math.atan2(dirX, dirZ);
  obj.rotation.set(0, 0, 0);
  obj.rotateY(yaw);
  obj.rotateX(tilt);
}

/** Cầu chì lưỡi ATO 19 × 19 × 5 mm. Màu theo định mức: 5A vàng nâu, 10A đỏ, 15A xanh dương, 20A vàng, 30A xanh lá */
export function bladeFuse(ctx, color = 0xd23b3b) {
  const { THREE, MAT, geom } = ctx;
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.8, roughness: 0.3 });
  const body = geom.mesh(geom.box(19, 9, 5.2, 0.8), m, { y: 13.5 });
  g.add(body);
  const element = geom.mesh(geom.box(9, 1, 0.8), MAT.zinc.clone(), { y: 12.5 });
  g.add(element);
  for (const s of [-1, 1]) g.add(geom.mesh(geom.box(6.3, 9.5, 0.6), MAT.zinc, { x: s * 4.6, y: 4.8 }));
  return { group: g, body, element, mat: m };
}

/** Domino (cầu đấu vít) n cực, bước 5 mm, dọc theo X */
export function screwTerminal(ctx, n = 2, pitch = 5.0, color = 0x2f9a4a) {
  const { THREE, MAT, geom } = ctx;
  const g = new THREE.Group();
  const m = MAT.plasticGreen.clone();
  m.color = new THREE.Color(color);
  g.add(geom.mesh(geom.box(n * pitch, 10, 7.5, 0.4), m, { x: ((n - 1) * pitch) / 2, y: 5 }));
  for (let i = 0; i < n; i++) {
    g.add(geom.mesh(geom.cyl(1.5, 1.5, 0.6, 16), MAT.zinc, { x: i * pitch, y: 10.1, z: -1 }));
    g.add(geom.mesh(geom.box(2.8, 3, 0.6), MAT.plasticDark, { x: i * pitch, y: 6, z: 3.8 }));
  }
  return g;
}

// ---------------------------------------------------------------- thiết bị đo
/**
 * Nguồn bàn (bench power supply) 0–30 V / 0–5 A loại nhỏ: 120 × 70 × 130 mm, mặt trước hướng +Z.
 * Trả { group, lcd, ledCV, ledCC, knobV, knobI, posP:[x,y,z], posN:[x,y,z] } (toạ độ trong group)
 */
export function benchSupply(ctx) {
  const { THREE, MAT, geom } = ctx;
  const g = new THREE.Group();
  const shell = MAT.plasticGrey.clone();
  shell.color = new THREE.Color(0x3c4048);
  g.add(geom.mesh(geom.box(120, 70, 130, 3), shell, { y: 35 }));
  g.add(geom.mesh(geom.box(116, 66, 2, 1), MAT.plasticBlack, { y: 35, z: 65.2 }));
  const lcd = makeLCD(THREE, 64, 26, { bg: '#0a1a12', fg: '#5dff9a', pxPerMm: 7 });
  lcd.mesh.position.set(-14, 50, 66.4);
  g.add(lcd.mesh);
  const ledMat = (c) => new THREE.MeshStandardMaterial({ color: 0x222222, emissive: c, emissiveIntensity: 0 });
  const ledCV = geom.mesh(geom.cyl(1.6, 1.6, 1, 12), ledMat(0x33ff66), { x: 30, y: 56, z: 66.4, rx: Math.PI / 2 });
  const ledCC = geom.mesh(geom.cyl(1.6, 1.6, 1, 12), ledMat(0xff3322), { x: 30, y: 46, z: 66.4, rx: Math.PI / 2 });
  g.add(ledCV, ledCC);
  const knob = (x) => {
    const k = new THREE.Group();
    k.add(geom.mesh(geom.cyl(7.5, 8, 10, 24), MAT.plasticBlack, { rx: Math.PI / 2 }));
    k.add(geom.mesh(geom.box(1.2, 6, 1), MAT.plasticWhite, { y: 3.5, z: 5.2 }));
    k.position.set(x, 20, 71);
    g.add(k);
    return k;
  };
  const knobV = knob(-42), knobI = knob(-18);
  const post = (x, mat) => {
    g.add(geom.mesh(geom.cyl(5, 5, 9, 20), mat, { x, y: 18, z: 70.5, rx: Math.PI / 2 }));
    g.add(geom.mesh(geom.cyl(1.6, 1.6, 12, 10), MAT.brass, { x, y: 18, z: 72, rx: Math.PI / 2 }));
  };
  post(22, MAT.plasticRed);
  post(42, MAT.plasticBlack);
  g.add(geom.mesh(geom.box(10, 8, 3), MAT.plasticWhite, { x: 4, y: 18, z: 66.5 }));   // nút ON/OFF output
  return { group: g, lcd, ledCV, ledCC, knobV, knobI, posP: [22, 18, 77], posN: [42, 18, 77] };
}

/**
 * Đồng hồ vạn năng nằm ngửa: thân 76 × 30 × 150 mm (dài theo Z), màn hình ở đầu −Z, giắc cắm ở đầu +Z.
 * Trả { group, lcd, dial, jack: { a, ma, com, v } } (toạ độ giắc trong group)
 */
export function multimeter(ctx) {
  const { THREE, MAT, geom } = ctx;
  const g = new THREE.Group();
  const holster = MAT.plasticYellow.clone();
  holster.color = new THREE.Color(0xf2b705);
  g.add(geom.mesh(geom.box(76, 30, 150, 6), holster, { y: 15 }));
  g.add(geom.mesh(geom.box(64, 2, 136, 3), MAT.plasticDark, { y: 30 }));
  const lcd = makeLCD(THREE, 52, 26, { bg: '#b9c6a6', fg: '#121810', pxPerMm: 7 });
  lcd.mesh.rotation.x = -Math.PI / 2;
  lcd.mesh.position.set(0, 31.2, -46);
  g.add(lcd.mesh);
  const dial = new THREE.Group();
  dial.add(geom.mesh(geom.cyl(17, 17, 5, 40), MAT.plasticBlack));
  dial.add(geom.mesh(geom.box(4, 4, 30), MAT.plasticGrey, { y: 3.2 }));
  dial.add(geom.mesh(geom.box(1.6, 1, 10), MAT.plasticWhite, { y: 5.4, z: -10 }));
  dial.position.set(0, 33, 8);
  g.add(dial);
  const jack = {};
  [['a', -24, MAT.plasticRed], ['ma', -8, MAT.plasticRed], ['com', 8, MAT.plasticBlack], ['v', 24, MAT.plasticRed]].forEach(([k, x, m]) => {
    g.add(geom.mesh(geom.cyl(4.2, 4.2, 2, 20), m, { x, y: 31.2, z: 56 }));
    g.add(geom.mesh(geom.cyl(2, 2, 2.2, 12), MAT.plasticBlack, { x, y: 31.4, z: 56 }));
    jack[k] = [x, 32, 56];
  });
  return { group: g, lcd, dial, jack };
}

/** Bộ nạp PICkit 3 (≈ 100 × 22 × 40 mm), đầu cắm ICSP 6 chân ở đầu +X */
export function pickit(ctx) {
  const { THREE, MAT, geom } = ctx;
  const g = new THREE.Group();
  const red = MAT.plasticRed.clone();
  red.color = new THREE.Color(0xb3262b);
  g.add(geom.mesh(geom.box(100, 22, 40, 6), red, { y: 11 }));
  g.add(geom.mesh(geom.box(60, 1, 28, 2), MAT.plasticBlack, { x: -10, y: 22.2 }));
  const ledM = new THREE.MeshStandardMaterial({ color: 0x202020, emissive: 0x33ff55, emissiveIntensity: 0 });
  const led = geom.mesh(geom.cyl(1.4, 1.4, 1, 10), ledM, { x: 30, y: 22.5, z: -8 });
  g.add(led);
  g.add(geom.mesh(geom.box(6, 10, 16), MAT.plasticBlack, { x: 52, y: 11 }));
  return { group: g, led };
}
