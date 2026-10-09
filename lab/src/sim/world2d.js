// =============================================================================
// world2d.js — Thế giới 2D (nhìn từ trên xuống) cho mô phỏng robot: vật cản, vùng sàn, dây/tất, độ phủ.
// Logic thuần (không three.js) → chạy được trong Node để kiểm thử.
//
// Tọa độ: x sang phải, y hướng "lên trên bản đồ" (bắc), mm. Mỗi vật cản có dải độ cao [zBot, zTop]
// (mm, tuyệt đối) → robot chui gầm được nếu gầm (zBot) cao hơn robot.
// Vùng sàn (floor zone): hình chữ nhật có độ cao h, hệ số phản xạ IR rho, hệ số tốc độ, độ trượt…
// Vùng thêm sau "đè" vùng thêm trước. Ngoài mọi vùng → sàn nền (base).
// =============================================================================

let _id = 0;

export class World2D {
  constructor({ bounds = { x0: -1e5, y0: -1e5, x1: 1e5, y1: 1e5 }, base = {} } = {}) {
    this.bounds = bounds;
    this.base = { name: 'Sàn', h: 0, rho: 0.6, speed: 1, slip: 0.02, encSlip: 0.3, kind: 'floor', ...base };
    this.obstacles = [];   // { kind:'box'|'circle', ... , zBot, zTop, name, movable, mass, mu, roll }
    this.floors = [];
    this.hazards = [];     // { kind:'cable'|'sock', pts:[[x,y]...], r, active }
  }

  /** Vật cản hộp chữ nhật thẳng trục. opts: { zBot=0, zTop=1000, name, movable, mass(kg), mu, data } */
  addBox(x0, y0, x1, y1, opts = {}) {
    const o = {
      id: ++_id, kind: 'box', x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1),
      zBot: 0, zTop: 1000, name: '', movable: false, mass: 0, mu: 0.4, roll: 0, vx: 0, vy: 0, ...opts,
    };
    this.obstacles.push(o);
    return o;
  }
  /** Vật cản tròn (chân bàn tròn, thùng rác, cốc…) */
  addCircle(cx, cy, r, opts = {}) {
    const o = { id: ++_id, kind: 'circle', cx, cy, r, zBot: 0, zTop: 1000, name: '', movable: false, mass: 0, mu: 0.4, roll: 0, vx: 0, vy: 0, ...opts };
    this.obstacles.push(o);
    return o;
  }
  /** Vùng sàn chữ nhật */
  addFloor(x0, y0, x1, y1, props = {}) {
    const z = { id: ++_id, x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), ...this.base, name: '', ...props };
    this.floors.push(z);
    return z;
  }
  /** Dây điện / tất / dây rèm nằm trên sàn — nguy cơ quấn chổi */
  addHazard(kind, pts, r = 6, extra = {}) {
    const h = { id: ++_id, kind, pts, r, active: true, ...extra };
    this.hazards.push(h);
    return h;
  }

  floorAt(x, y) {
    for (let i = this.floors.length - 1; i >= 0; i--) {
      const z = this.floors[i];
      if (x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1) return z;
    }
    return this.base;
  }

  /** Điểm gần nhất trên vật cản → { d (âm nếu tâm nằm trong), nx, ny (pháp tuyến hướng RA khỏi vật), px, py } */
  closest(o, x, y, out = {}) {
    if (o.kind === 'circle') {
      const dx = x - o.cx, dy = y - o.cy;
      const L = Math.hypot(dx, dy) || 1e-6;
      out.nx = dx / L; out.ny = dy / L;
      out.d = L - o.r;
      out.px = o.cx + out.nx * o.r; out.py = o.cy + out.ny * o.r;
      return out;
    }
    const px = Math.max(o.x0, Math.min(x, o.x1)), py = Math.max(o.y0, Math.min(y, o.y1));
    const dx = x - px, dy = y - py;
    const L = Math.hypot(dx, dy);
    if (L > 1e-9) { out.d = L; out.nx = dx / L; out.ny = dy / L; out.px = px; out.py = py; return out; }
    // tâm nằm trong hộp → đẩy ra theo cạnh gần nhất
    const dl = x - o.x0, dr = o.x1 - x, db = y - o.y0, dt = o.y1 - y;
    const m = Math.min(dl, dr, db, dt);
    if (m === dl) { out.nx = -1; out.ny = 0; out.px = o.x0; out.py = y; }
    else if (m === dr) { out.nx = 1; out.ny = 0; out.px = o.x1; out.py = y; }
    else if (m === db) { out.nx = 0; out.ny = -1; out.px = x; out.py = o.y0; }
    else { out.nx = 0; out.ny = 1; out.px = x; out.py = o.y1; }
    out.d = -m;
    return out;
  }

  /** Khung bao 2D của vật cản */
  bbox(o) {
    return o.kind === 'circle' ? [o.cx - o.r, o.cy - o.r, o.cx + o.r, o.cy + o.r] : [o.x0, o.y0, o.x1, o.y1];
  }
  moveObstacle(o, dx, dy) {
    if (o.kind === 'circle') { o.cx += dx; o.cy += dy; } else { o.x0 += dx; o.x1 += dx; o.y0 += dy; o.y1 += dy; }
  }
  center(o) { return o.kind === 'circle' ? [o.cx, o.cy] : [(o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2]; }

  /**
   * Tia 2D từ (ox,oy) theo hướng (dx,dy) chuẩn hóa → khoảng cách tới vật cản đầu tiên thỏa filter(o), tối đa maxR.
   */
  raycast(ox, oy, dx, dy, maxR, filter) {
    let best = maxR;
    for (const o of this.obstacles) {
      if (filter && !filter(o)) continue;
      let t;
      if (o.kind === 'circle') {
        const fx = ox - o.cx, fy = oy - o.cy;
        const b = fx * dx + fy * dy, c = fx * fx + fy * fy - o.r * o.r;
        const disc = b * b - c;
        if (disc < 0) continue;
        t = -b - Math.sqrt(disc);
        if (t < 0) t = c < 0 ? 0 : -b + Math.sqrt(disc);
      } else {
        let tmin = -Infinity, tmax = Infinity;
        if (Math.abs(dx) < 1e-12) { if (ox < o.x0 || ox > o.x1) continue; }
        else { let a = (o.x0 - ox) / dx, b2 = (o.x1 - ox) / dx; if (a > b2) [a, b2] = [b2, a]; tmin = Math.max(tmin, a); tmax = Math.min(tmax, b2); }
        if (Math.abs(dy) < 1e-12) { if (oy < o.y0 || oy > o.y1) continue; }
        else { let a = (o.y0 - oy) / dy, b2 = (o.y1 - oy) / dy; if (a > b2) [a, b2] = [b2, a]; tmin = Math.max(tmin, a); tmax = Math.min(tmax, b2); }
        if (tmax < tmin || tmax < 0) continue;
        t = tmin >= 0 ? tmin : 0;
      }
      if (t >= 0 && t < best) best = t;
    }
    return best;
  }

  /** Khoảng cách từ điểm tới đường gấp khúc của mối nguy */
  hazardDist(h, x, y) {
    if (h.pts.length === 1) return Math.hypot(x - h.pts[0][0], y - h.pts[0][1]) - h.r;
    let best = Infinity;
    for (let i = 1; i < h.pts.length; i++) {
      const [ax, ay] = h.pts[i - 1], [bx, by] = h.pts[i];
      const vx = bx - ax, vy = by - ay;
      const L2 = vx * vx + vy * vy || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L2));
      best = Math.min(best, Math.hypot(x - ax - t * vx, y - ay - t * vy));
    }
    return best - h.r;
  }
}

// =============================================================================
// CoverageGrid — lưới độ phủ (bản đồ nhiệt số lần quét), mỗi ô `cell` mm.
//   reach: ô mà miệng hút CÓ THỂ chạm tới (tâm robot tới được + bán kính làm sạch) — mẫu số của %.
//   rgba : ảnh màu để dán lên sàn (DataTexture), hàng j = y tăng dần.
// =============================================================================
export class CoverageGrid {
  constructor({ x0, y0, x1, y1, cell = 25, rClean = 125 }) {
    this.x0 = x0; this.y0 = y0; this.cell = cell; this.rClean = rClean;
    this.W = Math.ceil((x1 - x0) / cell); this.H = Math.ceil((y1 - y0) / cell);
    const n = this.W * this.H;
    this.count = new Uint8Array(n);
    this.last = new Float32Array(n).fill(-1e9);
    this.reach = new Uint8Array(n);
    this.reachTotal = 1;
    this.cleaned = 0;
    this.rgba = new Uint8Array(n * 4);
    this.dirty = true;
    const rc = rClean / cell;
    this.disk = [];
    const k = Math.ceil(rc);
    for (let dj = -k; dj <= k; dj++) for (let di = -k; di <= k; di++) if (di * di + dj * dj <= rc * rc) this.disk.push([di, dj]);
  }

  clear() {
    this.count.fill(0); this.last.fill(-1e9); this.rgba.fill(0); this.cleaned = 0; this.dirty = true;
  }

  /**
   * Tính vùng tới được: tâm robot hợp lệ = cách mọi vật cản (cùng tầng) ≥ rRobot, sàn đúng độ cao
   * và cách mép hố ≥ rCliff; loang (BFS) từ điểm xuất phát rồi nở thêm rClean.
   */
  computeReach(world, { startX, startY, z0 = 0, rRobot = 175, rCliff = 150, blocks }) {
    const { W, H, cell, x0, y0 } = this;
    const valid = new Uint8Array(W * H).fill(1);
    const drop = new Uint8Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const f = world.floorAt(x0 + (i + 0.5) * cell, y0 + (j + 0.5) * cell);
      if (f.h < z0 - 25) { drop[j * W + i] = 1; valid[j * W + i] = 0; }
      else if (f.h > z0 + 25) valid[j * W + i] = 0;
    }
    // mép hố: tô vòng tròn rCliff quanh các ô hố nằm ở biên
    const rcC = Math.ceil(rCliff / cell), rc2 = (rCliff / cell) ** 2;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i;
      if (!drop[k]) continue;
      const edge = (i > 0 && !drop[k - 1]) || (i < W - 1 && !drop[k + 1]) || (j > 0 && !drop[k - W]) || (j < H - 1 && !drop[k + W]);
      if (!edge) continue;
      for (let dj = -rcC; dj <= rcC; dj++) for (let di = -rcC; di <= rcC; di++) {
        if (di * di + dj * dj > rc2) continue;
        const ii = i + di, jj = j + dj;
        if (ii >= 0 && jj >= 0 && ii < W && jj < H) valid[jj * W + ii] = 0;
      }
    }
    // vật cản: tô vùng phồng rRobot
    const tmp = {};
    for (const o of world.obstacles) {
      if (o.movable) continue;
      if (blocks && !blocks(o)) continue;
      const [bx0, by0, bx1, by1] = world.bbox(o);
      const i0 = Math.max(0, Math.floor((bx0 - rRobot - x0) / cell)), i1 = Math.min(W - 1, Math.floor((bx1 + rRobot - x0) / cell));
      const j0 = Math.max(0, Math.floor((by0 - rRobot - y0) / cell)), j1 = Math.min(H - 1, Math.floor((by1 + rRobot - y0) / cell));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        world.closest(o, x0 + (i + 0.5) * cell, y0 + (j + 0.5) * cell, tmp);
        if (tmp.d < rRobot) valid[j * W + i] = 0;
      }
    }
    // loang từ điểm xuất phát
    const seen = new Uint8Array(W * H);
    const q = new Int32Array(W * H);
    let si = Math.floor((startX - x0) / cell), sj = Math.floor((startY - y0) / cell);
    si = Math.max(0, Math.min(W - 1, si)); sj = Math.max(0, Math.min(H - 1, sj));
    // điểm xuất phát có thể sát vật (đế sạc) → tìm ô hợp lệ gần nhất
    if (!valid[sj * W + si]) {
      let best = -1, bd = Infinity;
      for (let j = Math.max(0, sj - 12); j <= Math.min(H - 1, sj + 12); j++) for (let i = Math.max(0, si - 12); i <= Math.min(W - 1, si + 12); i++) {
        if (!valid[j * W + i]) continue;
        const d = (i - si) ** 2 + (j - sj) ** 2;
        if (d < bd) { bd = d; best = j * W + i; }
      }
      if (best >= 0) { si = best % W; sj = Math.floor(best / W); }
    }
    let qh = 0, qt = 0;
    if (valid[sj * W + si]) { q[qt++] = sj * W + si; seen[sj * W + si] = 1; }
    while (qh < qt) {
      const k = q[qh++];
      const i = k % W, j = (k - i) / W;
      if (i > 0 && valid[k - 1] && !seen[k - 1]) { seen[k - 1] = 1; q[qt++] = k - 1; }
      if (i < W - 1 && valid[k + 1] && !seen[k + 1]) { seen[k + 1] = 1; q[qt++] = k + 1; }
      if (j > 0 && valid[k - W] && !seen[k - W]) { seen[k - W] = 1; q[qt++] = k - W; }
      if (j < H - 1 && valid[k + W] && !seen[k + W]) { seen[k + W] = 1; q[qt++] = k + W; }
    }
    // nở theo bán kính làm sạch
    this.reach.fill(0);
    for (let n = 0; n < qt; n++) {
      const k = q[n];
      const i = k % W, j = (k - i) / W;
      for (const [di, dj] of this.disk) {
        const ii = i + di, jj = j + dj;
        if (ii >= 0 && jj >= 0 && ii < W && jj < H) this.reach[jj * W + ii] = 1;
      }
    }
    let tot = 0;
    for (let k = 0; k < W * H; k++) tot += this.reach[k];
    this.reachTotal = Math.max(1, tot);
    // đếm lại các ô đã sạch nằm trong vùng tới được
    this.cleaned = 0;
    for (let k = 0; k < W * H; k++) if (this.count[k] && this.reach[k]) this.cleaned++;
    return this.reachTotal;
  }

  /** Quét tại (x, y) thời điểm t (s). Một ô chỉ được tính thêm 1 lượt nếu đã rời đi ≥ 2 s. */
  paint(x, y, t) {
    const { W, H, cell } = this;
    const ci = Math.floor((x - this.x0) / cell), cj = Math.floor((y - this.y0) / cell);
    let changed = false;
    for (const [di, dj] of this.disk) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= W || j >= H) continue;
      const k = j * W + i;
      const fresh = t - this.last[k] > 2;
      this.last[k] = t;
      if (!fresh) continue;
      if (this.count[k] === 0 && this.reach[k]) this.cleaned++;
      if (this.count[k] < 255) this.count[k]++;
      this._color(k);
      changed = true;
    }
    if (changed) this.dirty = true;
    return changed;
  }

  // Bảng màu nhiệt: 1 lượt xanh lá nhạt → 2 xanh đậm → 3 vàng → ≥4 cam
  _color(k) {
    const c = this.count[k], p = k * 4, d = this.rgba;
    if (c === 1) { d[p] = 90; d[p + 1] = 210; d[p + 2] = 130; d[p + 3] = 120; }
    else if (c === 2) { d[p] = 40; d[p + 1] = 170; d[p + 2] = 95; d[p + 3] = 160; }
    else if (c === 3) { d[p] = 235; d[p + 1] = 205; d[p + 2] = 60; d[p + 3] = 170; }
    else if (c >= 4) { d[p] = 240; d[p + 1] = 120; d[p + 2] = 45; d[p + 3] = 185; }
  }

  percent() { return (100 * this.cleaned) / this.reachTotal; }

  /** Số lượt quét trung bình trên các ô đã sạch (đo mức "chạy lại chỗ cũ") */
  meanPasses() {
    let s = 0, n = 0;
    for (let k = 0; k < this.count.length; k++) if (this.count[k] && this.reach[k]) { s += this.count[k]; n++; }
    return n ? s / n : 0;
  }
}
