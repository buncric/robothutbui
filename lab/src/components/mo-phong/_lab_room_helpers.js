// Thư viện dựng hình cho "Phòng lab góc nhìn thứ nhất" (phong-lab.js).
// KHÔNG có export default → app và smoke test bỏ qua file này khi nạp linh kiện.
// Đơn vị mm, trục Y lên. Mọi chữ trên bảng/biển/nhãn vẽ bằng canvas → texture;
// trong Node (smoke test) không có document → chỉ là tấm màu trơn.

// ---------------------------------------------------------------- nhóm linh kiện trên kệ
export const CAT_INFO = {
  'lap-rap': { name: 'Robot hoàn chỉnh', icon: '🤖', color: '#8e6bd8' },
  'co-khi': { name: 'Cơ khí', icon: '🔩', color: '#e0962d' },
  'dong-luc': { name: 'Động cơ & truyền động', icon: '⚙️', color: '#d64545' },
  'dien-tu': { name: 'Linh kiện điện tử', icon: '🔌', color: '#2f9e6b' },
  'nguon': { name: 'Nguồn & pin', icon: '🔋', color: '#d9b520' },
  'dieu-khien': { name: 'Vi điều khiển & mạch', icon: '🧠', color: '#3b7dd8' },
  'cam-bien': { name: 'Cảm biến', icon: '📡', color: '#1fb5c7' },
};
export const SHELF_CATS = ['co-khi', 'dong-luc', 'dien-tu', 'nguon', 'dieu-khien', 'cam-bien'];
export const catInfo = (id) => CAT_INFO[id] || { name: 'Khác', icon: '📦', color: '#8a9099' };

export const hasDoc = () => typeof document !== 'undefined' && typeof document.createElement === 'function';
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const FONT = 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Tắt raycast cho vật trang trí (tia nhìn/rê chuột xuyên qua) */
export function noRay(obj) { obj.traverse((o) => { o.raycast = () => {}; }); return obj; }

// ---------------------------------------------------------------- canvas → texture
export function canvasTexture(THREE, W, H, draw) {
  if (!hasDoc()) return null;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (!g) return null;
  draw(g, W, H);
  const t = new THREE.CanvasTexture(c);
  if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.userData.g = g;
  return t;
}

/** Tấm phẳng có hình vẽ canvas (biển, áp phích, bảng trắng). Mặt hướng +Z cục bộ. */
export function canvasPlane(THREE, w, h, draw, { px = 1, fallback = '#ffffff', lit = false, maxPx = 2048, transparent = false } = {}) {
  const k = Math.min(px, maxPx / Math.max(w, h));
  const W = Math.max(16, Math.round(w * k)), H = Math.max(16, Math.round(h * k));
  const tex = canvasTexture(THREE, W, H, draw);
  const opts = { color: tex ? 0xffffff : fallback, map: tex || null, transparent };
  const mat = lit ? new THREE.MeshStandardMaterial({ ...opts, roughness: 0.85, metalness: 0 }) : new THREE.MeshBasicMaterial(opts);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.userData.redraw = (fn) => { if (!tex) return; fn(tex.userData.g, W, H); tex.needsUpdate = true; };
  return m;
}

/** Màn hình chữ (LCD/LED 7 đoạn giả lập). set(lines, bg): lines = ['chuỗi'] hoặc [['chuỗi', màu, tỉ lệ cao]] */
export function screen(THREE, w, h, { bg = '#0b1a10', fg = '#7dff9a', px = 6 } = {}) {
  const m = canvasPlane(THREE, w, h, (g, W, H) => { g.fillStyle = bg; g.fillRect(0, 0, W, H); }, { px, fallback: bg, maxPx: 512 });
  m.material.toneMapped = false;
  let last = '';
  return {
    mesh: m,
    set(lines, background = bg) {
      const key = background + JSON.stringify(lines);
      if (key === last) return;
      last = key;
      m.userData.redraw((g, W, H) => {
        g.fillStyle = background; g.fillRect(0, 0, W, H);
        const n = lines.length;
        let y = 0;
        for (const ln of lines) {
          const [txt, col, size] = Array.isArray(ln) ? ln : [ln, fg, 1 / n];
          const lh = H * (size ?? 1 / n);
          g.fillStyle = col || fg;
          g.font = `bold ${Math.round(lh * 0.74)}px ui-monospace, Menlo, Consolas, monospace`;
          g.textBaseline = 'middle';
          g.textAlign = 'center';
          g.fillText(txt, W / 2, y + lh / 2, W * 0.94);
          y += lh;
        }
      });
    },
  };
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function wrapText(g, text, maxW) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Hàm vẽ biển báo một/hai dòng */
export function signDraw(title, sub = '', { bg = '#1f8a4c', fg = '#ffffff', border = null } = {}) {
  return (g, W, H) => {
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    if (border) { g.strokeStyle = border; g.lineWidth = Math.max(4, H * 0.06); g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, W - g.lineWidth, H - g.lineWidth); }
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const hasSub = !!sub;
    g.font = `bold ${Math.round(H * (hasSub ? 0.42 : 0.55))}px ${FONT}`;
    g.fillText(title, W / 2, H * (hasSub ? 0.38 : 0.52), W * 0.94);
    if (hasSub) { g.font = `${Math.round(H * 0.2)}px ${FONT}`; g.globalAlpha = 0.9; g.fillText(sub, W / 2, H * 0.78, W * 0.94); g.globalAlpha = 1; }
  };
}

// ---------------------------------------------------------------- bảng trắng: sơ đồ khối + lộ trình
export function drawWhiteboard(g, W, H) {
  g.fillStyle = '#fbfcfd'; g.fillRect(0, 0, W, H);
  const s = W / 2048;
  const marker = (c, w = 5) => { g.strokeStyle = c; g.fillStyle = c; g.lineWidth = w * s; g.lineJoin = 'round'; g.lineCap = 'round'; };
  const text = (t, x, y, size, c = '#1b3a8a', align = 'left', bold = true) => {
    g.fillStyle = c; g.font = `${bold ? 'bold ' : ''}${Math.round(size * s)}px ${FONT}`; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(t, x * s, y * s);
  };
  const block = (x, y, w, h, title, sub, c) => {
    marker(c, 5); roundRect(g, x * s, y * s, w * s, h * s, 14 * s); g.stroke();
    text(title, x + w / 2, y + h * (sub ? 0.36 : 0.5), 30, c, 'center');
    if (sub) text(sub, x + w / 2, y + h * 0.72, 21, '#333', 'center', false);
  };
  const arrowL = (x1, y1, x2, y2, c = '#333', label = '') => {
    marker(c, 4);
    g.beginPath(); g.moveTo(x1 * s, y1 * s); g.lineTo(x2 * s, y2 * s); g.stroke();
    const a = Math.atan2(y2 - y1, x2 - x1), L = 18;
    g.beginPath(); g.moveTo(x2 * s, y2 * s);
    g.lineTo((x2 - L * Math.cos(a - 0.45)) * s, (y2 - L * Math.sin(a - 0.45)) * s);
    g.lineTo((x2 - L * Math.cos(a + 0.45)) * s, (y2 - L * Math.sin(a + 0.45)) * s); g.closePath(); g.fill();
    if (label) text(label, (x1 + x2) / 2, (y1 + y2) / 2 - 18, 20, c, 'center', false);
  };
  text('SƠ ĐỒ KHỐI ROBOT HÚT BỤI DIY', 40, 50, 44, '#1b3a8a');
  text('PIC16F877A (tầng thấp, an toàn) + ESP32-S3 (BLE, thuật toán)', 40, 100, 24, '#555', 'left', false);
  // nguồn
  block(40, 150, 300, 110, 'Pin 4S 18650', '14.8 V · 2600 mAh', '#c0392b');
  block(40, 300, 300, 100, 'BMS 4S + cầu chì', 'chống quá dòng/xả sâu', '#c0392b');
  block(40, 440, 300, 110, 'Buck XL4015', '14.8 → 5 V · LDO 3.3 V', '#c0392b');
  arrowL(190, 260, 190, 300, '#c0392b'); arrowL(190, 400, 190, 440, '#c0392b');
  // não
  block(470, 180, 360, 150, 'PIC16F877A', '20 MHz · PWM · ADC · an toàn', '#1b6e3a');
  block(1000, 180, 360, 150, 'ESP32-S3', 'BLE app · thuật toán · lidar', '#1b3a8a');
  arrowL(830, 235, 1000, 235, '#6b2fa0', 'UART 19200');
  arrowL(1000, 280, 830, 280, '#6b2fa0', 'BSS138 3.3↔5 V');
  arrowL(340, 495, 470, 300, '#c0392b', '5 V');
  arrowL(340, 470, 1000, 320, '#c0392b');
  // chấp hành
  block(420, 420, 250, 100, 'DRV8871 ×2', 'cầu H, 3.6 A', '#a35a00');
  block(700, 420, 250, 100, 'MOSFET', 'chổi cuộn/cạnh', '#a35a00');
  block(420, 570, 250, 110, 'Động cơ bánh', '+ encoder Hall', '#a35a00');
  block(700, 570, 250, 110, 'Quạt BLDC', 'hút bụi', '#a35a00');
  arrowL(545, 330, 545, 420, '#a35a00', 'PWM'); arrowL(650, 330, 800, 420, '#a35a00');
  arrowL(545, 520, 545, 570, '#a35a00'); arrowL(825, 520, 825, 570, '#a35a00');
  // cảm biến
  block(470, 740, 480, 110, 'Bumper · Cliff IR ×4', 'công tắc hành trình → PIC (ngắt)', '#0e7c86');
  block(1000, 420, 360, 110, 'Lidar LDS', 'UART → ESP32', '#0e7c86');
  block(1000, 570, 360, 110, 'MPU6050', 'I²C → ESP32 (góc quay)', '#0e7c86');
  arrowL(650, 740, 650, 680, '#0e7c86'); arrowL(610, 740, 560, 330, '#0e7c86');
  arrowL(1180, 420, 1180, 330, '#0e7c86'); arrowL(1180, 570, 1180, 530, '#0e7c86');
  block(1000, 740, 360, 110, '📱 App BLE', 'điện thoại ↔ ESP32', '#1b3a8a');
  arrowL(1180, 740, 1180, 680, '#1b3a8a');
  // lộ trình
  marker('#333', 3); g.beginPath(); g.moveTo(1440 * s, 140 * s); g.lineTo(1440 * s, 980 * s); g.stroke();
  text('LỘ TRÌNH HỌC', 1480, 170, 36, '#c0392b');
  const road = [
    ['1', 'Cơ khí: ốc → lò xo → bánh răng → bánh xe'],
    ['2', 'Động cơ DC → driver cầu H → PWM'],
    ['3', 'Pin 18650 → BMS → mạch hạ áp'],
    ['4', 'PIC16F877A → ESP32 → chuyển mức'],
    ['5', 'Cảm biến: bumper, cliff, encoder, IMU'],
    ['6', 'Ráp robot → chạy thử ở khu thử'],
    ['7', 'Căn hộ mô phỏng → app BLE'],
  ];
  road.forEach(([n, t], i) => {
    const y = 250 + i * 95;
    marker('#c0392b', 4); g.beginPath(); g.arc(1500 * s, y * s, 24 * s, 0, Math.PI * 2); g.stroke();
    text(n, 1500, y + 1, 26, '#c0392b', 'center');
    g.font = `${Math.round(23 * s)}px ${FONT}`;
    const lines = wrapText(g, t, 470 * s);
    lines.slice(0, 2).forEach((l, j) => text(l, 1540, y + (j - (lines.length > 1 ? 0.5 : 0)) * 28, 23, '#222', 'left', false));
  });
  text('☐ Nhớ: tắt nguồn trước khi tháo · đeo vòng ESD', 40, 960, 24, '#c0392b', 'left', false);
}

// ---------------------------------------------------------------- áp phích nội quy
export const SAFETY_RULES = [
  ['⚡', 'Đeo vòng tay chống tĩnh điện (ESD) nối đất trước khi chạm mạch'],
  ['💨', 'Bật máy hút khói trước khi hàn — không hít khói nhựa thông'],
  ['🥽', 'Đeo kính bảo hộ khi hàn, cắt chân linh kiện, thử động cơ'],
  ['🔋', 'Sạc pin Li-ion/LiPo trong túi chống cháy, trên mặt thép, LUÔN có người trông'],
  ['🔌', 'Tắt nguồn, rút pin trước khi tháo lắp hay hàn sửa'],
  ['🧯', 'Biết chỗ bình chữa cháy, xô cát, lối thoát — gọi 114 khi cháy lớn'],
  ['🍜', 'Không ăn uống ở bàn hàn (chì) — rửa tay sau khi hàn'],
  ['🧹', 'Dọn bàn cuối buổi: mỏ hàn về giá, tắt máy, cất linh kiện vào thùng'],
];
export function drawPoster(g, W, H) {
  g.fillStyle = '#fffaf0'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#c0392b'; g.fillRect(0, 0, W, H * 0.13);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold ${Math.round(H * 0.06)}px ${FONT}`;
  g.fillText('NỘI QUY PHÒNG LAB', W / 2, H * 0.065, W * 0.92);
  const rowH = (H * 0.84) / SAFETY_RULES.length;
  SAFETY_RULES.forEach(([ic, t], i) => {
    const y = H * 0.15 + i * rowH;
    g.textAlign = 'center'; g.font = `${Math.round(rowH * 0.5)}px ${FONT}`; g.fillStyle = '#000';
    g.fillText(ic, W * 0.1, y + rowH / 2);
    g.textAlign = 'left'; g.fillStyle = '#222'; g.font = `${Math.round(rowH * 0.24)}px ${FONT}`;
    const lines = wrapText(g, t, W * 0.74);
    lines.slice(0, 3).forEach((l, j) => g.fillText(l, W * 0.2, y + rowH / 2 + (j - (Math.min(lines.length, 3) - 1) / 2) * rowH * 0.28));
    g.strokeStyle = '#e5d8c2'; g.lineWidth = 2; g.beginPath(); g.moveTo(W * 0.04, y + rowH); g.lineTo(W * 0.96, y + rowH); g.stroke();
  });
}

// ---------------------------------------------------------------- nhãn thùng linh kiện (gộp 1 mesh/kệ)
/** cells: [{ icon, title, sub, color }] · quads: [{ x, y, z, w, h }] mặt hướng +X. Trả về Mesh (1 texture atlas). */
export function labelAtlas(THREE, cells, quads, { cols = 5 } = {}) {
  const n = cells.length;
  const rows = Math.max(1, Math.ceil(n / cols));
  const CW = 400, CH = 140;
  const tex = canvasTexture(THREE, CW * cols, CH * rows, (g) => {
    cells.forEach((c, i) => {
      const x = (i % cols) * CW, y = Math.floor(i / cols) * CH;
      g.fillStyle = '#fbfbf7'; g.fillRect(x, y, CW, CH);
      g.fillStyle = c.color; g.fillRect(x, y, CW, 22);
      g.fillStyle = '#111'; g.textBaseline = 'middle'; g.textAlign = 'left';
      g.font = `48px ${FONT}`; g.fillText(c.icon || '📦', x + 10, y + 80);
      g.font = `bold 30px ${FONT}`;
      const lines = wrapText(g, c.title, CW - 92);
      const ls = lines.slice(0, 2);
      ls.forEach((l, j) => g.fillText(l, x + 78, y + 70 + (j - (ls.length - 1) / 2) * 32, CW - 88));
      if (c.sub) { g.font = `20px ${FONT}`; g.fillStyle = '#666'; g.fillText(c.sub, x + 78, y + 122, CW - 88); }
      g.strokeStyle = '#999'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, CW - 2, CH - 2);
    });
  });
  const pos = [], uv = [], idx = [];
  quads.forEach((q, i) => {
    const u0 = (i % cols) / cols, u1 = u0 + 1 / cols;
    const v1 = 1 - Math.floor(i / cols) / rows, v0 = v1 - 1 / rows;
    const b = pos.length / 3;
    // nhìn từ +X: bên phải màn hình là −Z
    pos.push(q.x, q.y - q.h / 2, q.z + q.w / 2, q.x, q.y - q.h / 2, q.z - q.w / 2, q.x, q.y + q.h / 2, q.z - q.w / 2, q.x, q.y + q.h / 2, q.z + q.w / 2);
    uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color: tex ? 0xe8e8e8 : 0xf2f2ee, map: tex });
  return noRay(new THREE.Mesh(geo, mat));
}

// ---------------------------------------------------------------- tường có lỗ cửa
/** Chia tường dài len (u từ −len/2..len/2), cao h thành các khối quanh lỗ [{u0,u1,y0,y1}] */
export function wallPieces(len, h, openings, yBottom = 0) {
  const ops = [...openings].sort((a, b) => a.u0 - b.u0);
  const out = [];
  let u = -len / 2;
  for (const o of ops) {
    if (o.u0 > u) out.push({ u0: u, u1: o.u0, y0: yBottom, y1: h });
    if (o.y0 > yBottom) out.push({ u0: o.u0, u1: o.u1, y0: yBottom, y1: o.y0 });
    if (o.y1 < h) out.push({ u0: o.u0, u1: o.u1, y0: o.y1, y1: h });
    u = o.u1;
  }
  if (u < len / 2) out.push({ u0: u, u1: len / 2, y0: yBottom, y1: h });
  return out;
}

// ---------------------------------------------------------------- sàn gạch vinyl + bầu trời ngoài cửa sổ
export function floorTexture(THREE) {
  const t = canvasTexture(THREE, 256, 256, (g, W, H) => {
    g.fillStyle = '#c9ced3'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(90,100,110,.10)' : 'rgba(255,255,255,.18)';
      g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
    }
    g.strokeStyle = '#9aa1a8'; g.lineWidth = 3; g.strokeRect(0, 0, W, H);
  });
  if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}

export function skyDraw(g, W, H) {
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#8cc8f0'); gr.addColorStop(0.7, '#d6ecfa'); gr.addColorStop(1, '#eef6fb');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.fillStyle = '#b7c3cc';
  for (let x = 0; x < W; x += W / 9) {
    const bh = H * (0.25 + Math.random() * 0.3);
    g.fillRect(x, H - bh, W / 11, bh);
  }
  g.fillStyle = '#5f8f5a';
  for (let x = 0; x < W; x += W / 14) { g.beginPath(); g.arc(x, H * 0.97, W / 18, 0, Math.PI * 2); g.fill(); }
}

// =============================================================================
// THIẾT BỊ — mỗi hàm nhận K = { THREE, MAT, geom, std } và trả về group gốc ở ĐÁY, tâm XZ.
// Mặt trước thiết bị hướng +Z cục bộ (xoay group khi đặt).
// =============================================================================

/** Bàn thí nghiệm: mặt bàn + thảm (bề mặt đặt đồ) + chân + kệ dưới */
export function bench(K, { w, d, h = 900, topMat, padMat = null, legMat, name, desc, backPanel = false }) {
  const { THREE, geom } = K;
  const { mesh, box, part } = geom;
  const g = new THREE.Group();
  const top = mesh(box(w, 40, d), topMat, { y: h - 20 });
  g.add(part(top, name, desc));
  let surface = top, sy = h;
  if (padMat) {
    const pad = mesh(box(w - 60, 4, d - 60), padMat, { y: h + 2, castShadow: false });
    g.add(part(pad, `Thảm chống tĩnh điện — ${name}`, 'Thảm cao su 2 lớp, điện trở bề mặt 10⁶–10⁹ Ω, nối đất qua điện trở 1 MΩ: điện tích trên người/linh kiện xả CHẬM xuống đất thay vì phóng tia làm chết chip. Nhìn vào đây và nhấn E để đặt linh kiện đang cầm.'));
    surface = pad; sy = h + 4;
  }
  const legGeo = box(50, h - 40, 50);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(legGeo, legMat, { x: sx * (w / 2 - 50), y: (h - 40) / 2, z: sz * (d / 2 - 50) }));
  g.add(mesh(box(w - 120, 20, d - 120), topMat, { y: 170 }));
  if (backPanel) g.add(mesh(box(w - 120, 380, 16), legMat, { y: h - 240, z: -d / 2 + 60 }));
  surface.userData.labSurface = name;
  return { group: g, surface, top: sy };
}

/** Kệ thép nhiều tầng (mặt trước hướng +X) */
export function rack(K, { w = 1200, d = 450, h = 2000, levels, frameMat, boardMat }) {
  const { THREE, geom } = K;
  const { mesh, box } = geom;
  const g = new THREE.Group();
  const post = box(40, h, 40);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(post, frameMat, { x: sx * (d / 2 - 20), y: h / 2, z: sz * (w / 2 - 20) }));
  const board = box(d, 20, w);
  for (const y of levels) g.add(mesh(board, boardMat, { y: y - 10, castShadow: false }));
  g.add(mesh(box(d, 20, w), boardMat, { y: h - 10, castShadow: false }));
  g.add(mesh(box(8, h - 60, w - 40), boardMat, { x: -d / 2 + 4, y: h / 2, castShadow: false }));
  return g;
}

/** Trạm hàn (nhiệt độ điều chỉnh) + giá mỏ hàn lò xo + mỏ hàn + bùi nhùi đồng */
export function solderStation(K) {
  const { THREE, MAT, geom, std } = K;
  const { mesh, box, cyl, part, group, wire, springGeometry } = geom;
  const g = new THREE.Group();
  const base = mesh(box(150, 95, 130, 6), std(0x2f6fb5, 0.1, 0.5), { y: 47.5 });
  const lcd = screen(THREE, 70, 30, { bg: '#10140f', fg: '#ff6a3d' });
  lcd.mesh.position.set(-25, 65, 65.2);
  const knob = mesh(cyl(14, 14, 16, 24), MAT.plasticBlack, { x: 40, y: 50, z: 70, rx: Math.PI / 2 });
  g.add(part(group(base, lcd.mesh, knob), 'Trạm hàn 60 W (có điều nhiệt)', 'Đặt 330–350 °C cho thiếc có chì 63/37, 350–380 °C cho thiếc không chì. Cảm biến nhiệt trong mũi + vòng PID giữ nhiệt ổn định. Nhìn vào và nhấn E để bật/tắt.'));
  // giá đỡ
  const stand = new THREE.Group();
  stand.position.set(170, 0, 10);
  stand.add(mesh(cyl(55, 60, 18, 32), MAT.blackOxide, { y: 9 }));
  const coil = mesh(springGeometry({ radius: 18, wire: 1.4, turns: 9, length: 110 }), MAT.steel, { y: 70, x: -20, rz: 0.75 });
  stand.add(coil);
  const cup = mesh(cyl(26, 26, 22, 24), MAT.brass, { x: 30, y: 29, z: 25 });
  stand.add(cup);
  g.add(part(stand, 'Giá mỏ hàn + bùi nhùi đồng', 'Mỏ hàn LUÔN phải nằm trong giá lò xo khi không cầm — mũi 350 °C rơi lên dây/da gây bỏng, cháy. Bùi nhùi đồng lau mũi không làm tụt nhiệt như bọt biển ướt.'));
  // mỏ hàn đặt nghiêng trong giá
  const iron = new THREE.Group();
  iron.position.set(150, 85, 10);
  iron.rotation.z = 0.75;
  iron.add(mesh(cyl(11, 13, 110, 20), std(0x26292e, 0, 0.6), { y: 40 }));
  iron.add(mesh(cyl(6, 7, 40, 16), MAT.steel, { y: -35 }));
  const tip = mesh(cyl(1.2, 4, 26, 12), MAT.copper.clone(), { y: -68 });
  iron.add(tip);
  g.add(part(iron, 'Mỏ hàn (mũi 350 °C)', 'Cầm như cầm bút, chạm mũi vào CẢ chân linh kiện và pad, đưa thiếc vào điểm tiếp xúc (không đưa vào mũi), 2–3 giây là đủ. Mũi đang nóng — không chạm!'));
  g.add(noRay(wire([[60, 30, -40], [120, 5, -60], [200, 30, -30], [200, 125, 10], [175, 120, 10]], { radius: 3, color: 0x222222 })));
  const tipAnchor = new THREE.Object3D();
  tip.add(tipAnchor);
  tipAnchor.position.set(0, -14, 0);
  return { group: g, tip, tipAnchor, lcd };
}

/** Máy hút khói hàn (quạt + lọc than hoạt tính) */
export function fumeExtractor(K) {
  const { THREE, MAT, geom, std } = K;
  const { mesh, box, cyl, part, group } = geom;
  const g = new THREE.Group();
  const body = mesh(box(200, 240, 110, 8), std(0xd9dde2, 0, 0.5), { y: 140 });
  const foot = mesh(box(170, 20, 160, 4), MAT.plasticDark, { y: 10 });
  const filter = mesh(box(170, 170, 4), std(0x202020, 0, 0.95), { y: 140, z: 56 });
  const fan = new THREE.Group();
  fan.position.set(0, 140, 50);
  const blade = box(70, 4, 18);
  for (let i = 0; i < 5; i++) { const b = mesh(blade, MAT.plasticBlack, { castShadow: false }); b.rotation.z = (i / 5) * Math.PI * 2; b.position.set(Math.cos((i / 5) * Math.PI * 2) * 32, Math.sin((i / 5) * Math.PI * 2) * 32, 0); fan.add(b); }
  fan.add(mesh(cyl(14, 14, 10, 16), MAT.plasticDark, { rx: Math.PI / 2 }));
  const grill = mesh(new THREE.TorusGeometry(80, 3, 6, 40), MAT.steel, { y: 140, z: 60 });
  g.add(part(group(body, foot, filter, grill, fan), 'Máy hút khói hàn', 'Quạt kéo khói nhựa thông qua tấm lọc than hoạt tính. Đặt cách mối hàn 15–25 cm, ngang tầm mũi hàn. Khói nhựa thông (colophony) gây hen nghề nghiệp — bật máy TRƯỚC khi hàn. Nhìn vào và nhấn E để bật/tắt.'));
  return { group: g, fan };
}

/** Nguồn tổ ong phòng thí nghiệm 0–30 V / 0–5 A */
export function benchPSU(K) {
  const { THREE, MAT, geom, std } = K;
  const { mesh, box, cyl, part, group } = geom;
  const g = new THREE.Group();
  const body = mesh(box(220, 150, 290, 6), std(0x3a3f46, 0.2, 0.5), { y: 75 });
  const lcdV = screen(THREE, 70, 26, { bg: '#1a0606', fg: '#ff3b2f' });
  lcdV.mesh.position.set(-55, 112, 145.3);
  const lcdA = screen(THREE, 70, 26, { bg: '#061a0b', fg: '#3dff6a' });
  lcdA.mesh.position.set(40, 112, 145.3);
  const knobG = cyl(13, 13, 18, 24);
  const k1 = mesh(knobG, MAT.plasticBlack, { x: -55, y: 70, z: 152, rx: Math.PI / 2 });
  const k2 = mesh(knobG, MAT.plasticBlack, { x: 40, y: 70, z: 152, rx: Math.PI / 2 });
  const jackG = cyl(6, 6, 14, 16);
  const jr = mesh(jackG, MAT.plasticRed, { x: -40, y: 30, z: 150, rx: Math.PI / 2 });
  const jb = mesh(jackG, MAT.plasticBlack, { x: 0, y: 30, z: 150, rx: Math.PI / 2 });
  const jg = mesh(jackG, MAT.plasticGreen, { x: 40, y: 30, z: 150, rx: Math.PI / 2 });
  const ledMat = std(0x330000, 0, 0.4, { emissive: 0x000000 });
  const led = mesh(cyl(4, 4, 4, 12), ledMat, { x: 85, y: 70, z: 147, rx: Math.PI / 2 });
  const btn = mesh(box(30, 20, 8), MAT.plasticGrey, { x: -95, y: 30, z: 147 });
  g.add(part(group(body, lcdV.mesh, lcdA.mesh, k1, k2, jr, jb, jg, led, btn), 'Nguồn DC phòng thí nghiệm 30 V / 5 A', 'Hai núm: điện áp (CV) và GIỚI HẠN DÒNG (CC). Luôn đặt giới hạn dòng thấp (vd 0.3 A) khi cấp điện lần đầu cho mạch mới — chập thì nguồn chuyển sang CC, mạch không cháy. Nhìn vào và nhấn E để bật/tắt ngõ ra.'));
  return { group: g, lcdV, lcdA, led };
}

/** Máy hiện sóng số 2 kênh */
export function oscilloscope(K) {
  const { THREE, MAT, geom, std } = K;
  const { mesh, box, cyl, part, group } = geom;
  const g = new THREE.Group();
  const body = mesh(box(330, 170, 140, 8), std(0xe6e8eb, 0, 0.5), { y: 85 });
  const scr = canvasPlane(THREE, 175, 110, (gg, W, H) => { gg.fillStyle = '#020a12'; gg.fillRect(0, 0, W, H); }, { px: 2, fallback: '#06202e', maxPx: 512 });
  scr.material.toneMapped = false;
  scr.position.set(-55, 92, 70.3);
  const parts = [body, scr];
  const kg = cyl(8, 8, 12, 16);
  for (let i = 0; i < 6; i++) parts.push(mesh(kg, MAT.plasticDark, { x: 70 + (i % 2) * 40, y: 140 - Math.floor(i / 2) * 38, z: 75, rx: Math.PI / 2, castShadow: false }));
  parts.push(mesh(cyl(6, 6, 10, 12), MAT.plasticYellow, { x: 70, y: 22, z: 74, rx: Math.PI / 2 }), mesh(cyl(6, 6, 10, 12), MAT.plasticBlue, { x: 110, y: 22, z: 74, rx: Math.PI / 2 }));
  g.add(part(group(...parts), 'Máy hiện sóng số 2 kênh 100 MHz', 'Vẽ điện áp theo thời gian: xem xung PWM 20 kHz cấp cho driver, gợn nguồn sau buck, khung UART giữa PIC và ESP32. Kênh 1 vàng, kênh 2 xanh. Kẹp đất của que đo nối GND — KHÔNG kẹp vào điểm có điện áp khác GND (chập qua dây đất).'));
  return { group: g, screen: scr };
}

/** Vẽ màn hình máy hiện sóng: PWM (vàng) + gợn nguồn (xanh) */
export function drawScope(g, W, H, phase, duty = 0.45) {
  g.fillStyle = '#020a12'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(120,160,190,.25)'; g.lineWidth = 1;
  for (let i = 1; i < 10; i++) { g.beginPath(); g.moveTo((i * W) / 10, 0); g.lineTo((i * W) / 10, H); g.stroke(); }
  for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(0, (i * H) / 8); g.lineTo(W, (i * H) / 8); g.stroke(); }
  g.strokeStyle = '#ffd34d'; g.lineWidth = 2; g.beginPath();
  const per = W / 4;
  for (let x = 0; x <= W; x += 1) {
    const ph = (((x + phase * per) % per) + per) % per / per;
    const y = ph < duty ? H * 0.18 : H * 0.42;
    x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
  }
  g.stroke();
  g.strokeStyle = '#4cc2ff'; g.beginPath();
  for (let x = 0; x <= W; x += 2) {
    const y = H * 0.72 + Math.sin((x / W) * Math.PI * 8 + phase * 6) * H * 0.05 + (Math.random() - 0.5) * 2;
    x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
  }
  g.stroke();
  g.fillStyle = '#ffd34d'; g.font = `${Math.round(H * 0.08)}px monospace`; g.fillText('CH1 5V 20kHz', 4, H * 0.08);
  g.fillStyle = '#4cc2ff'; g.fillText('CH2 50mV~', 4, H * 0.96);
}

/** Đồng hồ vạn năng (để nằm nghiêng) + 2 que đo */
export function multimeter(K) {
  const { THREE, MAT, geom, std } = K;
  const { mesh, box, cyl, part, group, wire } = geom;
  const g = new THREE.Group();
  const m = new THREE.Group();
  m.rotation.x = -1.2;
  m.position.set(0, 30, 0);
  m.add(mesh(box(95, 185, 40, 10), MAT.plasticYellow, { y: 92 }));
  m.add(mesh(box(80, 165, 6), MAT.plasticDark, { y: 95, z: 18 }));
  const lcd = screen(THREE, 64, 32, { bg: '#b9c6a7', fg: '#111' });
  lcd.mesh.position.set(0, 150, 21.5);
  m.add(lcd.mesh);
  m.add(mesh(cyl(24, 24, 8, 24), MAT.plasticBlack, { y: 90, z: 22, rx: Math.PI / 2 }));
  g.add(part(m, 'Đồng hồ vạn năng (multimeter)', 'Đo V (song song), A (NỐI TIẾP — cắm que đỏ sang lỗ 10 A), Ω (mạch phải TẮT điện), thông mạch (tít). Lỗi kinh điển: để que ở lỗ A rồi đo áp pin → chập, đứt cầu chì đồng hồ.'));
  g.add(noRay(wire([[-15, 10, 40], [-60, 5, 120], [-30, 5, 190], [40, 5, 160]], { radius: 2.2, color: 0xd23b3b })));
  g.add(noRay(wire([[15, 10, 40], [40, 5, 110], [90, 5, 170], [120, 5, 120]], { radius: 2.2, color: 0x222222 })));
  return { group: g, lcd };
}

/** Bo mạch đang cấp điện (cho sự cố "mò hàng khi đang cắm điện") + tua vít rơi chập */
export function dutBoard(K) {
  const { THREE, MAT, geom, std } = K;
  const { mesh, box, cyl, part, group, pcb } = geom;
  const g = new THREE.Group();
  const board = pcb(110, 70, { mat: MAT.pcbBlue });
  board.position.y = 12;
  const legs = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => mesh(cyl(3, 3, 10, 8), MAT.brass, { x: sx * 48, y: 5, z: sz * 28 })));
  const cap = mesh(cyl(8, 8, 20, 20), std(0x1f3d8a, 0.2, 0.5), { x: -25, y: 22, z: 10 });
  const term = mesh(box(20, 12, 14), MAT.plasticGreen, { x: 40, y: 18, z: -18 });
  const chip = mesh(box(18, 3, 18), MAT.icBody, { x: 10, y: 13.5, z: 10 });
  const ind = mesh(box(22, 12, 22), MAT.ferrite, { x: -30, y: 18, z: -20 });
  const led = mesh(box(4, 2, 3), std(0x00ff55, 0, 0.4, { emissive: 0x00ff55, emissiveIntensity: 1.5 }), { x: 45, y: 13, z: 25 });
  g.add(part(group(board, ...legs, cap, term, chip, ind, led), 'Mạch buck đang CẤP ĐIỆN 12 V', 'Mạch đang chạy (đèn xanh sáng). Muốn đo/hàn/tháo: TẮT nguồn trước, chờ tụ xả. Không đặt dụng cụ kim loại lên mạch đang có điện.'));
  const sd = new THREE.Group();
  sd.add(mesh(cyl(9, 10, 90, 16), MAT.plasticRed, { y: 0 }));
  sd.add(mesh(cyl(2.5, 2.5, 100, 10), MAT.steel, { y: -95 }));
  sd.rotation.set(0, 0.4, 1.45);
  sd.position.set(-5, 20, 0);
  sd.visible = false;
  g.add(part(sd, 'Tua vít kim loại rơi ngang 2 cực', 'Tua vít trượt tay chạm cùng lúc cực + và − của tụ/cọc nối → ngắn mạch.'));
  const anchor = new THREE.Object3D();
  anchor.position.set(-25, 32, 10);
  g.add(anchor);
  return { group: g, screwdriver: sd, anchor, led };
}

/** Laptop đang mở CCS C */
export function laptop(K) {
  const { THREE, MAT, geom, std } = K;
  const { mesh, box, part, group } = geom;
  const g = new THREE.Group();
  const base = mesh(box(320, 18, 220, 6), std(0x9ea4ab, 0.7, 0.35), { y: 9 });
  const kb = mesh(box(280, 2, 100), MAT.plasticBlack, { y: 19, z: -20, castShadow: false });
  const lid = new THREE.Group();
  lid.position.set(0, 18, -108);
  lid.rotation.x = -0.25;
  lid.add(mesh(box(320, 210, 8, 4), std(0x9ea4ab, 0.7, 0.35), { y: 105 }));
  const scr = canvasPlane(THREE, 296, 186, (gg, W, H) => {
    gg.fillStyle = '#1e1e1e'; gg.fillRect(0, 0, W, H);
    gg.fillStyle = '#2d2d30'; gg.fillRect(0, 0, W, H * 0.08);
    gg.fillStyle = '#ccc'; gg.font = `${Math.round(H * 0.05)}px monospace`; gg.fillText('main.c — CCS C (PIC16F877A)', 6, H * 0.055);
    const code = [['#include <16F877A.h>', '#c586c0'], ['#fuses HS,NOWDT,NOLVP', '#c586c0'], ['#use delay(clock=20M)', '#c586c0'], ['#use rs232(baud=19200,UART1)', '#c586c0'], ['', ''], ['void main(void) {', '#4fc1ff'], ['  setup_ccp1(CCP_PWM);', '#dcdcaa'], ['  setup_timer_2(T2_DIV_BY_1,249,10);', '#dcdcaa'], ['  while (TRUE) {', '#4fc1ff'], ['    if (bumper_hit()) stop();', '#ce9178'], ['    set_pwm1_duty(450);', '#dcdcaa'], ['  }', '#4fc1ff'], ['}', '#4fc1ff']];
    gg.font = `${Math.round(H * 0.055)}px monospace`;
    code.forEach(([t, c], i) => { gg.fillStyle = '#6a6a6a'; gg.fillText(String(i + 1).padStart(2), 4, H * (0.15 + i * 0.065)); gg.fillStyle = c; gg.fillText(t, W * 0.08, H * (0.15 + i * 0.065)); });
  }, { px: 2.5, fallback: '#1e1e1e', maxPx: 1024 });
  scr.material.toneMapped = false;
  scr.position.set(0, 107, 4.2);
  lid.add(scr);
  g.add(part(group(base, kb, lid), 'Laptop lập trình (CCS C + MPLAB)', 'Viết firmware PIC16F877A bằng CCS C, nạp qua PICkit 3 (ICSP). Bên phải: ESP32-S3 nạp bằng Arduino/ESP-IDF qua USB.'));
  return { group: g };
}

/** Bo ESP32 mẫu nằm trên thảm (cho sự cố tĩnh điện) + túi chống tĩnh điện */
export function esp32Demo(K) {
  const { THREE, MAT, geom, std } = K;
  const { mesh, box, part, group, pcb } = geom;
  const g = new THREE.Group();
  const b = pcb(52, 28, { mat: MAT.pcbBlack });
  b.position.y = 10;
  const can = mesh(box(18, 3, 25), MAT.aluminum, { x: -8, y: 11.5 });
  const chip = mesh(box(7, 1.2, 7), MAT.icBody.clone(), { x: 14, y: 10.6 });
  const h1 = mesh(box(50, 9, 2.5), MAT.plasticBlack, { y: 4.5, z: 12 });
  const h2 = mesh(box(50, 9, 2.5), MAT.plasticBlack, { y: 4.5, z: -12 });
  const usb = mesh(box(8, 3, 9), MAT.steel, { x: 24, y: 11.5 });
  g.add(part(group(b, can, chip, h1, h2, usb), 'Bo ESP32-S3 DevKit (nhạy tĩnh điện)', 'Chân GPIO chịu ESD chỉ ~±2 kV (mô hình người HBM). Người đi trên sàn khô có thể tích 5–15 kV. Cầm bo ở MÉP, đeo vòng ESD, để trong túi chống tĩnh điện khi không dùng.'));
  const bag = mesh(box(110, 2, 150), std(0xb9b3b8, 0.6, 0.35, { transparent: true, opacity: 0.85 }), { x: 95, y: 1, z: 0, castShadow: false });
  g.add(part(bag, 'Túi chống tĩnh điện (shielding bag)', 'Lớp kim loại mỏng tạo "lồng Faraday" — điện trường bên ngoài không lọt vào linh kiện. Túi hồng chỉ chống TÍCH điện, không che chắn.'));
  const anchor = new THREE.Object3D();
  anchor.position.set(14, 14, 0);
  g.add(anchor);
  return { group: g, chip, anchor };
}

/** Vòng tay chống tĩnh điện + dây nối đất (cord) */
export function wristStrap(K) {
  const { THREE, geom, std } = K;
  const { mesh, part, group, wire, cyl } = geom;
  const g = new THREE.Group();
  const band = mesh(new THREE.TorusGeometry(34, 7, 8, 28), std(0x1d4f91, 0, 0.7), { y: 7, rx: Math.PI / 2 });
  const snap = mesh(cyl(9, 9, 6, 16), std(0xc0c4c8, 1, 0.3), { y: 14, z: 34 });
  const cord = wire([[0, 12, 40], [40, 6, 120], [-30, 6, 200], [60, 6, 260], [130, 6, 300]], { radius: 2.4, color: 0x1a1a1a });
  const plug = mesh(cyl(8, 8, 18, 12), std(0x2c7a3b, 0, 0.6), { x: 140, y: 9, z: 300, rz: Math.PI / 2 });
  const cordG = group(cord, plug);
  g.add(part(group(band, snap), 'Vòng tay chống tĩnh điện (ESD wrist strap)', 'Đeo sát da cổ tay, dây nối vào điểm đất của thảm. Bên trong dây có điện trở 1 MΩ: xả điện tích người từ từ và hạn chế dòng nếu lỡ chạm điện áp nguy hiểm.'));
  g.add(part(cordG, 'Dây nối đất 1 MΩ', 'Phải cắm vào nút đất của thảm thì vòng tay mới có tác dụng. Đeo vòng mà quên cắm dây = không đeo.'));
  return { group: g, cord: cordG, band };
}

export function glasses(K) {
  const { THREE, geom, std } = K;
  const { mesh, box, part, group } = geom;
  const lens = std(0xbfe6ff, 0, 0.1, { transparent: true, opacity: 0.45 });
  const frame = std(0xf2c200, 0, 0.5);
  const g = group(mesh(box(150, 45, 4, 2), lens, { y: 25 }), mesh(box(155, 8, 8), frame, { y: 48 }),
    mesh(box(4, 8, 120), frame, { x: -76, y: 44, z: -60 }), mesh(box(4, 8, 120), frame, { x: 76, y: 44, z: -60 }));
  return { group: part(g, 'Kính bảo hộ', 'Thiếc nóng văng khi cắt chân linh kiện / lau mũi hàn, chân linh kiện bay khi cắt — đeo kính khi hàn, cắt, thử động cơ & chổi.') };
}

/** Bộ sạc cân bằng (balance charger) */
export function charger(K) {
  const { THREE, MAT, geom, std } = K;
  const { mesh, box, cyl, part, group } = geom;
  const g = new THREE.Group();
  const body = mesh(box(140, 60, 160, 6), std(0x2a2d33, 0.2, 0.5), { y: 30 });
  const lcd = screen(THREE, 80, 30, { bg: '#0d2a4a', fg: '#e8f4ff' });
  lcd.mesh.position.set(0, 40, 80.3);
  const btns = [-45, -15, 15, 45].map((x) => mesh(box(16, 8, 4), MAT.plasticRed, { x, y: 14, z: 81 }));
  g.add(part(group(body, lcd.mesh, ...btns), 'Bộ sạc cân bằng (balance charger)', 'Sạc 4S Li-ion: CC 1 A rồi CV 16.8 V (4.20 V/cell), cắm thêm dây cân bằng để sạc đều từng cell. Đặt ĐÚNG số cell & hóa học (Li-ion 4.20 V, LiPo 4.20 V, LiFe 3.65 V).'));
  return { group: g, lcd };
}

/** Túi chống cháy LiPo (LiPo safety bag) */
export function lipoBag(K) {
  const { THREE, geom, std } = K;
  const { mesh, box, part, group } = geom;
  const bag = std(0xd9661e, 0, 0.85);
  const g = group(mesh(box(240, 75, 180, 14), bag, { y: 37.5 }), mesh(box(244, 6, 6), std(0x111111, 0, 0.6), { y: 72, z: 0 }),
    mesh(box(80, 1, 60), std(0x111111, 0, 0.8), { y: 75.5, z: 30 }));
  return { group: part(g, 'Túi chống cháy LiPo (LiPo safety bag)', 'Vải sợi thủy tinh phủ silicon: nếu cell bị thoát nhiệt (thermal runaway) khi sạc, túi giữ lửa và tàn bên trong, cho thời gian xử lý. Sạc pin LUÔN trong túi, trên mặt không cháy, có người trông.') };
}

/** Khối pin 4S1P 18650 (4 cell bọc co nhiệt) */
export function pack4S(K) {
  const { THREE, MAT, geom, std } = K;
  const { mesh, cyl, part, group, wire } = geom;
  const wrap = std(0x2a6fd6, 0, 0.45);
  const cells = [0, 1, 2, 3].map((i) => mesh(cyl(9.25, 9.25, 65, 20), wrap, { x: (i - 1.5) * 18.6, y: 9.25, rx: Math.PI / 2 }));
  const g = group(...cells, mesh(geom.box(76, 1, 50), MAT.plasticYellow, { y: 19 }));
  g.add(noRay(wire([[-20, 18, 33], [-25, 12, 70], [-40, 6, 110]], { radius: 1.8, color: 0xd23b3b })));
  return { group: part(g, 'Khối pin 4S 18650 (14.8 V, 2600 mAh)', 'Năng lượng ~38 Wh — đủ làm nóng đỏ cả khối nếu chập/thoát nhiệt. Kiểm tra trước khi sạc: không phồng, không móp, điện áp các cell lệch < 0.05 V.') };
}

export function extinguisher(K) {
  const { THREE, MAT, geom, std } = K;
  const { mesh, cyl, part, group, wire, box } = geom;
  const red = std(0xc81e1e, 0.2, 0.45);
  const g = group(mesh(cyl(75, 75, 480, 28), red, { y: 240 }), mesh(cyl(45, 75, 50, 28), red, { y: 505 }),
    mesh(cyl(18, 18, 60, 16), MAT.brass, { y: 560 }), mesh(box(110, 14, 30), MAT.blackOxide, { x: 30, y: 590 }),
    mesh(box(90, 12, 26), MAT.blackOxide, { x: 30, y: 565, rz: -0.25 }), mesh(cyl(18, 18, 26, 16), MAT.plasticDark, { x: 0, y: 600 }),
    mesh(box(100, 140, 1), std(0xf5f5f5, 0, 0.6), { y: 280, z: 76 }));
  g.add(noRay(wire([[0, 560, 20], [40, 500, 70], [70, 380, 80], [70, 300, 80]], { radius: 7, color: 0x111111 })));
  return { group: part(g, 'Bình chữa cháy bột ABC 4 kg + CO₂', 'Bột ABC dập lửa vật liệu xung quanh (giấy, nhựa, dây điện). CO₂ cho thiết bị điện. Pin lithium tự sinh oxy khi thoát nhiệt nên CÓ THỂ BÙNG LẠI: sau khi dập phải làm mát bằng nhiều nước hoặc vùi cát, cách ly ≥ 24 h. Rút chốt → hướng vòi vào GỐC lửa → bóp → quét qua lại. Nhìn vào và nhấn E khi có cháy.') };
}

export function sandBucket(K) {
  const { THREE, geom, std } = K;
  const { mesh, cyl, part, group } = geom;
  const g = group(mesh(cyl(150, 120, 300, 28, true), std(0xc81e1e, 0.1, 0.5), { y: 150 }), mesh(cyl(120, 120, 6, 28), std(0xc81e1e, 0.1, 0.5), { y: 3 }),
    mesh(cyl(143, 143, 10, 28), std(0xd8c27a, 0, 1), { y: 260 }));
  return { group: part(g, 'Xô cát khô (dập pin cháy)', 'Pin nhỏ đang cháy/phồng: dùng kẹp gắp (không tay trần) thả vào xô cát và phủ kín — cát làm ngạt và hút nhiệt, chặn tàn lửa. Mang ra ngoài trời sau khi nguội.') };
}

export function firstAid(K) {
  const { THREE, geom, std } = K;
  const { mesh, box, part, group } = geom;
  const g = group(mesh(box(400, 300, 120, 10), std(0xf4f6f8, 0, 0.5), { y: 150 }), mesh(box(150, 50, 2), std(0x1d9e4a, 0, 0.5), { y: 150, z: 61 }),
    mesh(box(50, 150, 2), std(0x1d9e4a, 0, 0.5), { y: 150, z: 61.5 }));
  return { group: part(g, 'Tủ sơ cứu', 'Bỏng mỏ hàn: xả nước mát (không phải đá) 15–20 phút, không bôi kem đánh răng/mỡ, che gạc sạch. Đứt tay do kìm/dao: ép gạc cầm máu. Hít khói pin cháy: ra chỗ thoáng, đi khám.') };
}

export function fireBlanket(K) {
  const { THREE, geom, std } = K;
  const { mesh, box, part, group } = geom;
  const g = group(mesh(box(280, 340, 70, 8), std(0xc81e1e, 0, 0.6), { y: 170 }), mesh(box(200, 40, 2), std(0xffffff, 0, 0.6), { y: 60, z: 36 }));
  return { group: part(g, 'Chăn chữa cháy', 'Kéo 2 dây giật để lấy chăn, trùm kín đám cháy nhỏ (khay hàn, giẻ lau) để ngạt oxy. Không dùng để giữ pin lithium đang phụt lửa — dùng cát/nước nhiều.') };
}

export function stool(K) {
  const { THREE, MAT, geom, std } = K;
  const { mesh, cyl, part, group } = geom;
  const g = group(mesh(cyl(170, 170, 50, 28), std(0x1f2b3a, 0, 0.7), { y: 655 }), mesh(cyl(25, 25, 560, 12), MAT.steel, { y: 350 }),
    mesh(cyl(200, 210, 40, 5), MAT.plasticBlack, { y: 40 }));
  return { group: part(g, 'Ghế thí nghiệm (đệm chống tĩnh điện)', 'Ghế xoay có bánh dẫn điện — người ngồi không tích điện khi xoay/đứng dậy.') };
}

export function powerStrip(K, len = 1200) {
  const { THREE, MAT, geom, std } = K;
  const { mesh, box, part, group, cyl } = geom;
  const g = group(mesh(box(len, 60, 55), std(0xe8e9eb, 0, 0.5), { y: 30 }));
  for (let i = 0; i < 6; i++) g.add(mesh(box(36, 30, 4), MAT.plasticDark, { x: -len / 2 + 110 + i * ((len - 260) / 5), y: 30, z: 28, castShadow: false }));
  g.add(mesh(cyl(22, 22, 20, 20), std(0xd01010, 0, 0.5, { emissive: 0x300000 }), { x: len / 2 - 60, y: 30, z: 32, rx: Math.PI / 2 }));
  return part(g, 'Thanh ổ cắm có nút DỪNG KHẨN (E-stop)', 'Cả bàn cấp điện qua 1 thanh ổ cắm có nút đỏ: đập nút là cắt toàn bộ bàn. Có aptomat chống giật (RCBO 30 mA) ở tủ điện.');
}

/** Bảng đục lỗ treo dụng cụ (mặt hướng +Z). Trả về group + danh sách [obj, info] */
export function pegboard(K, w, h) {
  const { THREE, MAT, geom, std } = K;
  const { mesh, box, cyl, part } = geom;
  const g = new THREE.Group();
  const board = canvasPlane(THREE, w, h, (gg, W, H) => {
    gg.fillStyle = '#c8b28a'; gg.fillRect(0, 0, W, H);
    gg.fillStyle = 'rgba(60,45,25,.55)';
    const st = W / (w / 25);
    for (let y = st / 2; y < H; y += st) for (let x = st / 2; x < W; x += st) { gg.beginPath(); gg.arc(x, y, st * 0.16, 0, Math.PI * 2); gg.fill(); }
  }, { px: 0.6, fallback: '#c8b28a', lit: true, maxPx: 1024 });
  board.position.set(0, h / 2, 8);
  g.add(mesh(box(w, h, 12), std(0xa8926a, 0, 0.8), { y: h / 2 }), part(board, 'Bảng treo dụng cụ (pegboard)', 'Mỗi dụng cụ có chỗ treo riêng, vẽ viền hình dụng cụ (shadow board): nhìn là biết thiếu cái gì — nguyên tắc 5S.'));
  const tools = [];
  const add = (obj, name, desc) => { g.add(part(obj, name, desc)); tools.push(obj); };
  const driver = (x, color, tipW, name, desc) => {
    const t = new THREE.Group();
    t.add(mesh(cyl(14, 13, 100, 16), std(color, 0, 0.5), { y: 0 }));
    t.add(mesh(cyl(2.8, 2.8, 120, 10), MAT.steel, { y: -110 }));
    t.add(mesh(geom.box(tipW, 8, 2), MAT.steel, { y: -172 }));
    t.position.set(x, h - 160, 40);
    add(t, name, desc);
  };
  const X0 = -w / 2 + 120;
  driver(X0, 0xd23b3b, 3, 'Tua vít Phillips PH1', 'Vít vỏ robot hút bụi thường là PH1/PH2 dài — tua vít PH1 cán dài để với vào lỗ sâu. Ấn mạnh rồi mới xoay để không toét đầu vít.');
  driver(X0 + 70, 0xf2c200, 4, 'Tua vít Phillips PH2', 'Vít M3 trên khung, giá động cơ. Sai cỡ (PH1 vào vít PH2) → trượt, toét đầu vít.');
  driver(X0 + 140, 0x2f9e6b, 2.5, 'Tua vít dẹt 2.5 mm', 'Siết cọc domino (terminal block), chỉnh biến trở. Không dùng để cạy mạch đang có điện.');
  driver(X0 + 210, 0x3b7dd8, 2, 'Tua vít lục giác 2.0', 'Vít lục giác chìm M2.5/M3 của bánh xe, hộp số.');
  driver(X0 + 280, 0x8e6bd8, 2, 'Tua vít Torx T10 (có lỗ)', 'Một số robot thương mại dùng vít Torx an ninh để chống mở — cần đầu T10H có lỗ giữa.');
  const plier = (x, color, name, desc, head = 'nose') => {
    const t = new THREE.Group();
    t.add(mesh(box(14, 120, 10, 3), std(color, 0, 0.6), { x: -10, y: -60, rz: 0.1 }));
    t.add(mesh(box(14, 120, 10, 3), std(color, 0, 0.6), { x: 10, y: -60, rz: -0.1 }));
    t.add(mesh(cyl(9, 9, 12, 12), MAT.steel, { y: 6, rx: Math.PI / 2 }));
    t.add(mesh(head === 'nose' ? cyl(2, 9, 70, 10) : box(26, 30, 8), MAT.steel, { y: head === 'nose' ? 45 : 25 }));
    t.position.set(x, h - 140, 40);
    add(t, name, desc);
  };
  plier(X0 + 400, 0xd23b3b, 'Kìm mỏ nhọn', 'Uốn chân linh kiện, giữ dây khi hàn (kìm hút bớt nhiệt cho linh kiện nhạy nhiệt).');
  plier(X0 + 470, 0x2f6fb5, 'Kìm cắt chân (flush cutter)', 'Cắt sát chân linh kiện sau khi hàn. Chĩa đầu chân về phía bàn/che tay — chân văng rất mạnh vào mắt.', 'cut');
  plier(X0 + 540, 0xf2c200, 'Kìm tuốt dây', 'Chọn đúng lỗ theo cỡ dây (AWG) để không cắt vào lõi đồng. Dây 22 AWG cho tín hiệu, 18 AWG cho động cơ.', 'cut');
  const tweez = (x, name, desc) => {
    const t = new THREE.Group();
    t.add(mesh(box(4, 120, 2), std(0x707780, 0.8, 0.3), { x: -5, y: -60, rz: 0.04 }));
    t.add(mesh(box(4, 120, 2), std(0x707780, 0.8, 0.3), { x: 5, y: -60, rz: -0.04 }));
    t.position.set(x, h - 200, 40);
    add(t, name, desc);
  };
  tweez(X0 + 640, 'Nhíp thẳng ESD', 'Gắp linh kiện dán (SMD) 0805, IC SOT-23. Loại phủ chống tĩnh điện không tích điện vào linh kiện.');
  tweez(X0 + 690, 'Nhíp cong', 'Đặt linh kiện vào chỗ khó với, gỡ dây cắm.');
  const hex = new THREE.Group();
  for (let i = 0; i < 6; i++) hex.add(mesh(box(3 + i * 0.6, 60 + i * 12, 3 + i * 0.6), MAT.blackOxide, { x: i * 12, y: -(60 + i * 12) / 2 }));
  hex.position.set(X0 + 760, h - 150, 40);
  add(hex, 'Bộ lục giác (hex key)', 'M1.5–M5: vít lục giác chìm trên khớp nối động cơ, bánh xe.');
  const iron2 = new THREE.Group();
  iron2.add(mesh(cyl(16, 16, 150, 16), std(0x2c7a3b, 0, 0.6), { y: -75 }), mesh(cyl(5, 5, 60, 10), MAT.steel, { y: -180 }));
  iron2.position.set(X0 + 900, h - 120, 40);
  add(iron2, 'Bơm hút thiếc (solder sucker)', 'Nhấn piston, đặt miệng lên mối hàn đang chảy, bấm nút — hút sạch thiếc để gỡ linh kiện xuyên lỗ.');
  return { group: g, tools };
}

/** Cửa ra vào (lá cửa + khung + tay nắm). Mặt trong phòng hướng +Z cục bộ, gốc ở đáy giữa. */
export function door(K, w, h, T) {
  const { THREE, MAT, geom, std } = K;
  const { mesh, box, cyl, part, group } = geom;
  const frameM = std(0x5b6168, 0.4, 0.5);
  const leaf = mesh(box(w - 40, h - 20, 45), std(0x8a6a48, 0, 0.6), { y: (h - 20) / 2, z: -T / 2 });
  const glass = mesh(box(220, 600, 47), std(0xbfe6ff, 0, 0.1, { transparent: true, opacity: 0.5 }), { x: 0, y: h * 0.62, z: -T / 2, castShadow: false });
  const handle = mesh(box(140, 22, 22, 6), MAT.steel, { x: w / 2 - 110, y: 1050, z: -T / 2 + 45 });
  const handleBase = mesh(cyl(12, 12, 30, 12), MAT.steel, { x: w / 2 - 60, y: 1050, z: -T / 2 + 32, rx: Math.PI / 2 });
  const f1 = mesh(box(40, h, T + 20), frameM, { x: -w / 2 + 20, y: h / 2, z: -T / 2 });
  const f2 = mesh(box(40, h, T + 20), frameM, { x: w / 2 - 20, y: h / 2, z: -T / 2 });
  const f3 = mesh(box(w, 40, T + 20), frameM, { y: h - 20, z: -T / 2 });
  return group(leaf, glass, handle, handleBase, f1, f2, f3);
}

/** Cửa sổ: khung nhôm + kính + nền trời phía ngoài (gốc giữa đáy, mặt trong +Z) */
export function windowUnit(K, w, h, T, skyMat) {
  const { THREE, MAT, geom, std } = K;
  const { mesh, box } = geom;
  const al = std(0xcfd4d9, 0.8, 0.35);
  const g = new THREE.Group();
  g.add(mesh(box(w, 40, T + 40), al, { y: 20, z: -T / 2 + 10 }), mesh(box(w, 40, T), al, { y: h - 20, z: -T / 2 }),
    mesh(box(40, h, T), al, { x: -w / 2 + 20, y: h / 2, z: -T / 2 }), mesh(box(40, h, T), al, { x: w / 2 - 20, y: h / 2, z: -T / 2 }),
    mesh(box(30, h, 40), al, { y: h / 2, z: -T / 2 }));
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.18, depthWrite: false }));
  glass.position.set(0, h / 2, -T / 2);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(w + 1600, h + 1200), skyMat);
  sky.position.set(0, h / 2, -T - 700);
  g.add(glass, sky);
  noRay(glass); noRay(sky);
  return g;
}
