// =============================================================================
// solver.js — Bộ giải mạch điện: Modified Nodal Analysis (MNA) + Newton–Raphson + bước thời gian.
// (JS thuần, không phụ thuộc three.js → chạy được trong trình duyệt lẫn Node.)
//
// Ý tưởng bằng lời:
//   • Mỗi "nút" (node) là một điểm có điện áp chưa biết. Nút 0 = GND (0 V).
//   • Định luật Kirchhoff về dòng (KCL): tổng dòng đi ra khỏi mỗi nút = 0  →  hệ phương trình A·x = b.
//   • Nguồn áp lý tưởng thêm một ẩn "dòng nhánh" (đó là chữ "Modified" trong MNA).
//   • Linh kiện phi tuyến (diode, LED, MOSFET…) được "tuyến tính hoá" quanh nghiệm đoán hiện tại
//     rồi giải lặp (Newton–Raphson) tới khi nghiệm không đổi nữa.
//   • Tụ & cuộn cảm: phương pháp Euler lùi (backward Euler) → mỗi bước thời gian chúng thành
//     "điện trở + nguồn dòng" tương đương (companion model).
//
// Cách dùng:
//   const c = new Circuit();
//   const a = c.node('A');                     // tạo/lấy nút theo tên
//   c.add(new Resistor([a, 0], { R: 1000 }));  // phần tử (xem elements.js)
//   c.step(1e-4);                              // tiến 0.1 ms
//   c.v(a)                                     // điện áp nút A
// =============================================================================

export const DEFAULT_GMIN = 1e-9;   // 1 GΩ từ mỗi nút xuống GND: giữ ma trận không suy biến khi có nút "thả nổi"

/**
 * "Bộ dập" (stamper): mỗi phần tử gọi các hàm này để cộng phần đóng góp của nó vào A và b.
 * Quy ước: chỉ số nút 0 = GND (không có hàng/cột), null = chân hở (không nối).
 */
export class Stamper {
  constructor() { this.n = 0; this.nn = 0; this.A = null; this.b = null; this.limited = false; }
  resize(nn, nb) {
    this.nn = nn;                    // số nút (kể cả GND)
    this.n = nn - 1 + nb;            // kích thước hệ
    this.A = new Float64Array(this.n * this.n);
    this.b = new Float64Array(this.n);
  }
  clear() { this.A.fill(0); this.b.fill(0); this.limited = false; }
  /** cộng vào A[nút r][nút c] */
  a(r, c, g) { if (r > 0 && c > 0) this.A[(r - 1) * this.n + (c - 1)] += g; }
  /** dòng I bơm VÀO nút r (từ bên ngoài) */
  i(r, I) { if (r > 0) this.b[r - 1] += I; }
  /** điện dẫn G giữa nút p và q */
  g(p, q, G) {
    if (p == null || q == null) return;
    this.a(p, p, G); this.a(q, q, G); this.a(p, q, -G); this.a(q, p, -G);
  }
  /** phần tử 2 cực tuyến tính hoá: dòng chảy p→q (qua phần tử) = G·(Vp − Vq) + I0 */
  lin(p, q, G, I0) {
    if (p == null || q == null) return;
    this.g(p, q, G);
    this.i(p, -I0); this.i(q, I0);
  }
  /**
   * Nguồn dòng phụ thuộc nhiều điện áp (phi tuyến, đã tuyến tính hoá):
   * dòng chảy p→q = I0 + Σ d[k]·(V(ctrl[k]) − v0[k])
   */
  nl(p, q, I0, ctrl, d, v0) {
    if (p == null || q == null) return;
    let Ieq = I0;
    for (let k = 0; k < ctrl.length; k++) {
      const c = ctrl[k];
      if (c == null) continue;
      this.a(p, c, d[k]); this.a(q, c, -d[k]);
      Ieq -= d[k] * v0[k];
    }
    this.i(p, -Ieq); this.i(q, Ieq);
  }
  /** nguồn áp lý tưởng V giữa p(+) và q(−), ẩn dòng nhánh thứ `br` (dòng chảy từ p qua nguồn sang q) */
  vsrc(p, q, br, V) {
    const k = this.nn - 1 + br;       // chỉ số hàng/cột nhánh trong hệ
    const n = this.n;
    if (p > 0) { this.A[(p - 1) * n + k] += 1; this.A[k * n + (p - 1)] += 1; }
    if (q > 0) { this.A[(q - 1) * n + k] -= 1; this.A[k * n + (q - 1)] -= 1; }
    this.b[k] += V;
  }
}

/** Giải A·x = b (khử Gauss, chọn trụ từng phần). Ghi đè A, b. Trả x (mảng b) hoặc null nếu suy biến. */
export function solveDense(A, b, n) {
  for (let col = 0; col < n; col++) {
    let piv = col, best = Math.abs(A[col * n + col]);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(A[r * n + col]);
      if (v > best) { best = v; piv = r; }
    }
    if (!(best > 1e-30)) return null;
    if (piv !== col) {
      for (let c = col; c < n; c++) { const t = A[col * n + c]; A[col * n + c] = A[piv * n + c]; A[piv * n + c] = t; }
      const t = b[col]; b[col] = b[piv]; b[piv] = t;
    }
    const d = A[col * n + col];
    for (let r = col + 1; r < n; r++) {
      const f = A[r * n + col] / d;
      if (f === 0) continue;
      const ro = r * n, co = col * n;
      for (let c = col + 1; c < n; c++) A[ro + c] -= f * A[co + c];
      b[r] -= f * b[col];
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let c = r + 1; c < n; c++) s -= A[r * n + c] * b[c];
    b[r] = s / A[r * n + r];
  }
  return b;
}

/**
 * Mạch điện. Phần tử (elements.js) cài các phương thức:
 *   init(circuit)         — tạo nút nội / nhánh (gọi khi add)
 *   stamp(S, x, ctx)      — dập phương trình, tuyến tính hoá quanh nghiệm đoán x
 *   accept(x, ctx)        — bước đã hội tụ: cập nhật trạng thái (điện áp tụ, dòng cuộn cảm, nhiệt, hư hỏng)
 *   begin?(ctx)           — đầu mỗi bước (chốt trạng thái logic dùng cho cả bước)
 */
export class Circuit {
  constructor({ gmin = DEFAULT_GMIN, maxIter = 60, reltol = 1e-4, vntol = 1e-6, maxDv = 20 } = {}) {
    this.nodeNames = ['0'];
    this.nodeIndex = new Map([['0', 0]]);
    this.elements = [];
    this.nBranch = 0;
    this.t = 0;
    this.gmin = gmin;
    this.maxIter = maxIter;
    this.reltol = reltol;
    this.vntol = vntol;
    this.maxDv = maxDv;           // hạn chế bước Newton: mỗi vòng lặp điện áp nút đổi tối đa maxDv (V)
    this.powered = true;          // công tắc tổng của mọi nguồn
    this.S = new Stamper();
    this.x = new Float64Array(0);
    this._size = -1;
    this.stats = { steps: 0, iters: 0, lastIters: 0, fallbacks: 0, nonConverged: 0 };
    this.refineSteps = 20;        // số bước con khi có sườn chuyển mạch
    this.watchNode = null;        // nút cần ghi điện áp đỉnh
    this.watchPeak = null;
  }

  /** Lấy/tạo nút theo tên. '0', 'gnd' → GND. null → null (hở). */
  node(name) {
    if (name == null) return null;
    if (name === '0' || name === 'gnd' || name === 0) return 0;
    let i = this.nodeIndex.get(name);
    if (i === undefined) { i = this.nodeNames.length; this.nodeNames.push(name); this.nodeIndex.set(name, i); }
    return i;
  }
  /** Cấp một ẩn dòng nhánh (cho nguồn áp lý tưởng) — trả chỉ số nhánh */
  branch() { return this.nBranch++; }
  add(el) {
    el.circuit = this;
    if (el.init) el.init(this);
    this.elements.push(el);
    return el;
  }

  _prepare() {
    const nn = this.nodeNames.length;
    const size = nn - 1 + this.nBranch;
    if (size === this._size) return;
    const old = this.x;
    this.S.resize(nn, this.nBranch);
    this.x = new Float64Array(size);
    this.x.set(old.subarray(0, Math.min(old.length, nn - 1)));
    this._size = size;
  }

  /** điện áp nút i theo nghiệm x (mặc định nghiệm hiện tại) */
  v(i, x = this.x) { return i > 0 ? x[i - 1] : 0; }
  /** dòng nhánh br */
  ib(br, x = this.x) { return x[this.nodeNames.length - 1 + br]; }
  /** Đặt điện áp ban đầu cho nút (khi dựng lại mạch, giữ nghiệm cũ để hội tụ nhanh) */
  seed(name, v) { const i = this.nodeIndex.get(name); if (i > 0) { this._prepare(); this.x[i - 1] = v; } }

  /** Một lần giải Newton–Raphson cho bước dt. Trả { ok, x, iters } */
  _newton(dt, x0, gminExtra = 0) {
    const S = this.S, n = S.n, nn = S.nn;
    const x = Float64Array.from(x0);
    const ctx = { dt, t: this.t + dt, powered: this.powered, circuit: this, iter: 0 };
    const gm = this.gmin + gminExtra;
    for (let it = 0; it < this.maxIter; it++) {
      ctx.iter = it;
      S.clear();
      for (let k = 0; k < nn - 1; k++) S.A[k * n + k] += gm;
      for (const el of this.elements) el.stamp(S, x, ctx);
      const sol = solveDense(S.A, S.b, n);
      if (!sol) return { ok: false, x, iters: it + 1 };
      let conv = !S.limited;
      const damp = it >= 12 ? 0.5 : 1;            // dao động 2 chu kỳ → giảm chấn một nửa
      for (let k = 0; k < n; k++) {
        let nv = sol[k];
        if (!Number.isFinite(nv)) return { ok: false, x, iters: it + 1 };
        let d = (nv - x[k]) * damp;
        nv = x[k] + d;
        if (k < nn - 1 && Math.abs(d) > this.maxDv) { d = Math.sign(d) * this.maxDv; nv = x[k] + d; conv = false; }
        const tol = this.reltol * Math.max(Math.abs(nv), Math.abs(x[k])) + (k < nn - 1 ? this.vntol : 1e-9);
        if (Math.abs(d) > tol) conv = false;
        x[k] = nv;
      }
      if (conv && it > 0) return { ok: true, x, iters: it + 1 };
    }
    return { ok: false, x, iters: this.maxIter };
  }

  _accept(x, dt) {
    const ctx = { dt, t: this.t + dt, powered: this.powered, circuit: this };
    this.x = x;
    for (const el of this.elements) if (el.accept) el.accept(x, ctx);
    this.t += dt;
    this.stats.steps++;
    if (this.watchNode != null) {                 // ghi đỉnh điện áp của nút đang "đo" (kể cả trong bước chia mịn)
      const v = this.v(this.watchNode);
      if (this.watchPeak == null || Math.abs(v) > Math.abs(this.watchPeak)) this.watchPeak = v;
    }
  }

  _begin(dt) {
    const ctx = { dt, t: this.t, powered: this.powered, circuit: this };
    for (const el of this.elements) if (el.begin) el.begin(this.x, ctx);
  }

  /**
   * Tiến một bước thời gian dt (s). Có cơ chế dự phòng khi Newton không hội tụ.
   * Khi một phần tử báo có "sườn" (công tắc đóng/ngắt, xung đổi mức, chân MCU đổi trạng thái) trong bước này,
   * bước được chia mịn `refineSteps` lần để bắt được hiện tượng nhanh (xung flyback L·di/dt chỉ kéo dài vài µs).
   */
  step(dt) {
    this._prepare();
    this.wantRefine = false;
    this._begin(dt);
    if (this.wantRefine && !this._inRefine && this.refineSteps > 1) {
      this._inRefine = true;
      let ok = true;
      const k = this.refineSteps;
      for (let i = 0; i < k; i++) ok = this.step(dt / k) && ok;
      this._inRefine = false;
      this.stats.refined = (this.stats.refined || 0) + 1;
      return ok;
    }
    let r = this._newton(dt, this.x);
    this.stats.lastIters = r.iters;
    this.stats.iters += r.iters;
    if (r.ok) { this._accept(r.x, dt); return true; }
    // 1) chia nhỏ bước thời gian
    this.stats.fallbacks++;
    for (const k of [4, 16]) {
      const save = this.x;
      let ok = true;
      const h = dt / k;
      for (let s = 0; s < k; s++) {
        if (s) this._begin(h);
        const q = this._newton(h, this.x);
        this.stats.iters += q.iters;
        if (!q.ok) { ok = false; break; }
        this._accept(q.x, h);
      }
      if (ok) return true;
      this.x = save;  // (trạng thái phần tử đã tiến một phần — chấp nhận, rất hiếm)
    }
    // 2) "gmin stepping": giải với điện dẫn phụ lớn rồi giảm dần
    let x = this.x;
    for (const g of [1e-2, 1e-4, 1e-6, 1e-8, 0]) {
      const q = this._newton(dt, x, g);
      this.stats.iters += q.iters;
      x = q.x;
      if (!q.ok && g === 0) break;
      if (q.ok && g === 0) { this._accept(q.x, dt); return true; }
    }
    // 3) không hội tụ: chấp nhận nghiệm gần nhất (đánh dấu)
    this.stats.nonConverged++;
    const finite = x.every(Number.isFinite);
    this._accept(finite ? x : this.x, dt);
    return false;
  }

  /** Chạy liên tục `duration` giây với bước dt, gọi cb(t) sau mỗi bước (tuỳ chọn) */
  run(duration, dt, cb) {
    const n = Math.round(duration / dt);
    for (let i = 0; i < n; i++) { this.step(dt); if (cb && cb(this.t) === false) break; }
  }

  /** Thu gom sự kiện hư hỏng của mọi phần tử (khói, cháy, nổ…) — gọi định kỳ từ giao diện */
  drainEvents() {
    const out = [];
    for (const el of this.elements) {
      const d = el.dmg;
      if (d && d.events.length) { for (const e of d.events) out.push({ el, ...e }); d.events.length = 0; }
    }
    return out;
  }
}
