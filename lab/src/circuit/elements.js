// =============================================================================
// elements.js — Các phần tử mạch cho solver.js (JS thuần).
//
// Mỗi phần tử: new X(nodes, params)  — nodes: mảng chỉ số nút (0 = GND, null = chân hở)
//   configure(params)  — đổi thông số khi đang chạy (giữ nguyên trạng thái nhiệt/hư hỏng)
//   stamp / accept / begin — xem solver.js
//   P (W tỏa nhiệt), I (A), V (V) — số đo sau mỗi bước; dmg — nhiệt độ & hư hỏng (damage.js)
//   repair() — thay linh kiện mới
// Số liệu bám datasheet và các bài linh kiện trong lab (điện trở, LED, MOSFET, động cơ RS-360,
// buck XL4015, DRV8871, PIC16F877A, ESP32-S3…).
// =============================================================================
import { Damage, THERMAL, AMBIENT } from './damage.js';

export const VT = 0.025852;           // điện áp nhiệt kT/q ở 27 °C
let SEQ = 0;

// ---------------------------------------------------------------- hàm toán nhỏ
/** softplus: ≈ max(0, x) nhưng trơn (độ rộng chuyển tiếp w) — giúp Newton hội tụ */
export function sp(x, w) { const z = x / w; if (z > 30) return x; if (z < -30) return w * Math.exp(z); return w * Math.log1p(Math.exp(z)); }
/** đạo hàm của softplus theo x */
export function sg(x, w) { const z = x / w; if (z > 30) return 1; if (z < -30) return Math.exp(z); return 1 / (1 + Math.exp(-z)); }
const V = (x, n) => (n > 0 ? x[n - 1] : 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Giới hạn bước điện áp tiếp giáp p-n (thuật toán pnjlim của SPICE) → tránh e^x nổ tung khi lặp */
export function pnjlim(vnew, vold, vt, vcrit) {
  if (vnew > vcrit && Math.abs(vnew - vold) > 2 * vt) {
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / vt;
      return [arg > 0 ? vold + vt * Math.log(arg) : vcrit, true];
    }
    return [vt * Math.log(Math.max(vnew / vt, 1e-30)), true];
  }
  return [vnew, false];
}
/** Dòng Shockley I = Is(e^(v/nVt) − 1) và đạo hàm, nối dài tuyến tính khi v quá lớn */
export function jexp(v, Is, nvt) {
  const z = v / nvt;
  if (z > 60) { const e = Math.exp(60); return [Is * (e - 1) + (Is * e / nvt) * (v - 60 * nvt), Is * e / nvt]; }
  if (z < -40) return [-Is, 1e-15];
  const e = Math.exp(z);
  return [Is * (e - 1), (Is * e) / nvt];
}
/** "Diode kẹp" trơn: bắt đầu dẫn ở vth, điện trở nối tiếp R. Trả [I, dI/du] */
function clampD(u, vth, R, w = 0.02) { return [sp(u - vth, w) / R, sg(u - vth, w) / R]; }

// ---------------------------------------------------------------- phần tử gốc
export class Element {
  constructor(nodes, p = {}) {
    this.nodes = nodes;
    this.key = p.key || `e${++SEQ}`;
    this.label = p.label || this.constructor.name;
    this.p = {};
    this.P = 0; this.I = 0; this.V = 0;
    this.dmg = null;
    this.configure(p);
  }
  static get defaults() { return {}; }
  configure(p = {}) { this.p = { ...this.constructor.defaults, ...this.p, ...p }; if (p.label) this.label = p.label; this._derive?.(); }
  init() {}
  begin() {}
  stamp() {}
  accept() {}
  repair() { this.dmg?.reset(); this._repair?.(); }
  get state() { return this.dmg ? this.dmg.state : 'ok'; }
  get T() { return this.dmg ? this.dmg.T : AMBIENT; }
  get dead() { return !!this.dmg?.dead; }
  /** vẽ 2 cực phi tuyến: dòng p→q = f(v), f' = g */
  _nl2(S, p, q, v, f, g) { S.lin(p, q, g + 1e-12, f - g * v); }
}

// ---------------------------------------------------------------- điện trở
export class Resistor extends Element {
  static get defaults() { return { R: 1000, kind: 'resistor', Prated: 0.25, tc: 0 }; }
  _derive() {
    if (!this.dmg || this._kind !== this.p.kind) { this.dmg = new Damage(THERMAL[this.p.kind] || THERMAL.resistor); this._kind = this.p.kind; }
  }
  get R() { return Math.max(1e-4, this.p.R * (1 + this.p.tc * (this.T - 25))); }
  stamp(S) {
    const [a, b] = this.nodes;
    S.g(a, b, this.dead ? 1e-9 : 1 / this.R);
  }
  accept(x, ctx) {
    const [a, b] = this.nodes;
    this.V = V(x, a) - V(x, b);
    this.I = this.dead ? 0 : this.V / this.R;
    this.P = this.V * this.I;
    const pr = this.p.Prated;
    this.dmg.update(this.P, ctx.dt, `công suất P = ${this.P.toFixed(2)} W > định mức ${pr} W`);
  }
}

/** Dây nối (jumper) — điện trở nhỏ, nóng theo I²R, vỏ nhựa chảy > 160 °C, lõi đồng chảy 1085 °C */
export class Wire extends Resistor {
  static get defaults() { return { R: 0.03, kind: 'wire', Prated: 1.2, tc: 0.0039 }; }
  accept(x, ctx) {
    const [a, b] = this.nodes;
    this.V = V(x, a) - V(x, b);
    this.I = this.dead ? 0 : this.V / this.R;
    this.P = this.V * this.I;
    this.dmg.update(this.P, ctx.dt, `dòng ${Math.abs(this.I).toFixed(1)} A quá lớn cho dây nhảy 0.2 mm² (chịu ~2 A)`);
  }
}

/** Điện trở shunt của ampe kế */
export class Shunt extends Resistor {
  static get defaults() { return { R: 0.05, kind: 'powerres', Prated: 5, tc: 0 }; }
}

/** Biến trở (chiết áp) 3 chân: 1 — W (con chạy) — 3 */
export class Pot extends Element {
  static get defaults() { return { R: 10000, pos: 0.5 }; }
  _derive() { if (!this.dmg) this.dmg = new Damage(THERMAL.pot); }
  get r1() { return this.p.R * clamp(this.p.pos, 0, 1) + 1; }
  get r2() { return this.p.R * (1 - clamp(this.p.pos, 0, 1)) + 1; }
  stamp(S) {
    const [a, w, b] = this.nodes;
    const k = this.dead ? 1e-9 : 1;
    S.g(a, w, k / this.r1); S.g(w, b, k / this.r2);
  }
  accept(x, ctx) {
    const [a, w, b] = this.nodes;
    if (this.dead) { this.P = 0; this.I = 0; this.dmg.update(0, ctx.dt); return; }
    const v1 = V(x, a) - V(x, w), v2 = V(x, w) - V(x, b);
    this.I = v1 / this.r1;
    this.P = v1 * v1 / this.r1 + v2 * v2 / this.r2;
    this.V = V(x, w) - V(x, b);
    this.dmg.update(this.P, ctx.dt, `công suất ${this.P.toFixed(2)} W > 0.25 W của biến trở (dòng qua con chạy quá lớn)`);
  }
}

// ---------------------------------------------------------------- công tắc, nút nhấn, cầu chì
export class Switch extends Element {
  static get defaults() { return { closed: false, Ron: 0.03, Irated: 0.5 }; }
  _derive() { if (!this.dmg) this.dmg = new Damage(THERMAL.switch); if (this._was !== undefined && this._was !== this.p.closed) this._edge = true; this._was = this.p.closed; }
  begin(x, ctx) { if (this._edge) { ctx.circuit.wantRefine = true; this._edge = false; } }
  stamp(S) {
    const [a, b] = this.nodes;
    S.g(a, b, this.p.closed && !this.dead ? 1 / this.p.Ron : 1e-9);
  }
  accept(x, ctx) {
    const [a, b] = this.nodes;
    this.V = V(x, a) - V(x, b);
    this.I = this.p.closed && !this.dead ? this.V / this.p.Ron : 0;
    this.P = this.I * this.I * this.p.Ron;
    this.dmg.update(this.P, ctx.dt, `dòng ${Math.abs(this.I).toFixed(1)} A > ${this.p.Irated} A định mức của tiếp điểm`);
  }
}

/** Công tắc gạt 3 chân (SPDT): pos 'A' nối 1–C, pos 'B' nối C–3 */
export class SwitchSPDT extends Element {
  static get defaults() { return { pos: 'A', Ron: 0.03, Irated: 0.5 }; }
  _derive() { if (!this.dmg) this.dmg = new Damage(THERMAL.switch); if (this._was !== undefined && this._was !== this.p.pos) this._edge = true; this._was = this.p.pos; }
  begin(x, ctx) { if (this._edge) { ctx.circuit.wantRefine = true; this._edge = false; } }
  stamp(S) {
    const [a, c, b] = this.nodes;
    const on = this.dead ? 1e-9 : 1 / this.p.Ron;
    S.g(a, c, this.p.pos === 'A' ? on : 1e-9);
    S.g(c, b, this.p.pos === 'B' ? on : 1e-9);
  }
  accept(x, ctx) {
    const [a, c, b] = this.nodes;
    const v = this.p.pos === 'A' ? V(x, a) - V(x, c) : V(x, c) - V(x, b);
    this.I = this.dead ? 0 : v / this.p.Ron;
    this.P = this.I * this.I * this.p.Ron;
    this.dmg.update(this.P, ctx.dt, `dòng ${Math.abs(this.I).toFixed(1)} A > ${this.p.Irated} A định mức của công tắc`);
  }
}

/**
 * Cầu chì: dây chảy nóng chảy ở 420 °C. R = 0.08/In, nhiệt trở & nhiệt dung chọn để:
 * không đứt dưới ~1.35·In · 2·In ≈ 1 s · 10·In ≈ 30 ms (khớp đường đặc tính cầu chì tác động nhanh).
 */
export class Fuse extends Element {
  static get defaults() { return { rating: 1 }; }
  _derive() {
    const In = this.p.rating;
    if (!this.dmg || this._In !== In) {
      const Rth = 2675 / In;
      this.dmg = new Damage({ Rth, C: 1.8 / Rth, hot: 1e9, smoke: 1e9, burn: 1e9, dead: 420, mode: 'open' });
      this._In = In;
    }
    this.R = 0.08 / In;
  }
  get blown() { return this.dead; }
  stamp(S) { const [a, b] = this.nodes; S.g(a, b, this.blown ? 1e-9 : 1 / this.R); }
  accept(x, ctx) {
    const [a, b] = this.nodes;
    this.V = V(x, a) - V(x, b);
    this.I = this.blown ? 0 : this.V / this.R;
    this.P = this.I * this.I * this.R;
    const was = this.blown;
    this.dmg.update(this.P, ctx.dt, `dòng ${Math.abs(this.I).toFixed(1)} A = ${(Math.abs(this.I) / this.p.rating).toFixed(1)}× định mức → dây chảy nóng chảy`);
    if (!was && this.blown) { this.blownAt = ctx.t; this.blowI = Math.abs(this.I); }
  }
  _repair() { this.blownAt = null; }
}

// ---------------------------------------------------------------- nguồn
/** Nguồn áp lý tưởng (dùng trong kiểm thử, không có trên bàn) — có ẩn dòng nhánh */
export class VSource extends Element {
  static get defaults() { return { V: 5 }; }
  _derive() { if (this._was !== undefined && this._was !== this.p.V) this._edge = true; this._was = this.p.V; }
  begin(x, ctx) { if (this._edge) { ctx.circuit.wantRefine = true; this._edge = false; } }
  init(c) { this.br = c.branch(); }
  stamp(S, x, ctx) { const [p, q] = this.nodes; S.vsrc(p, q, this.br, ctx.powered ? this.p.V : 0); }
  accept(x) { this.I = -this.circuit.ib(this.br, x); this.V = this.p.V; this.P = 0; }
}

/** Nguồn có điện trở trong (Thevenin → Norton). Cực + nodes[0], cực − nodes[1]. I = dòng ra từ cực + */
export class Battery extends Element {
  static get defaults() { return { V: 9, Rint: 1.7, capAh: 0.5, soc: 1, kind: 'bat9v' }; }
  _derive() { if (!this.dmg || this._kind !== this.p.kind) { this.dmg = new Damage(THERMAL[this.p.kind] || THERMAL.bat9v); this._kind = this.p.kind; } }
  emf() { return 7.0 + 2.4 * clamp(this.p.soc, 0, 1); }
  rint() { return this.p.Rint + 2 * (1 - clamp(this.p.soc, 0, 1)); }
  on(ctx) { return ctx.powered && !this.dead; }
  stamp(S, x, ctx) {
    const [p, n] = this.nodes;
    if (!this.on(ctx)) { S.g(p, n, 1e-7); return; }
    const G = 1 / this.rint();
    S.lin(p, n, G, -G * this.emf());
  }
  accept(x, ctx) {
    const [p, n] = this.nodes;
    this.V = V(x, p) - V(x, n);
    this.I = this.on(ctx) ? (this.emf() - this.V) / this.rint() : 0;
    this.P = this.I * this.I * this.rint();
    this.p.soc = clamp(this.p.soc - (this.I * ctx.dt) / (this.p.capAh * 3600), 0, 1);
    this.dmg.update(this.P, ctx.dt, `dòng ${this.I.toFixed(1)} A làm nóng bên trong pin (I²·R_trong = ${this.P.toFixed(0)} W)`);
  }
}

// điện áp hở mạch 1 cell Li-ion theo % dung lượng (từ bài pack-4s-bms)
const OCV_T = [[0, 3.0], [5, 3.30], [10, 3.45], [20, 3.56], [30, 3.63], [40, 3.69], [50, 3.75], [60, 3.83], [70, 3.92], [80, 4.00], [90, 4.09], [100, 4.20]];
export function cellOcv(socPct) {
  const s = clamp(socPct, 0, 100);
  for (let i = 1; i < OCV_T.length; i++) {
    const [s1, v1] = OCV_T[i];
    if (s <= s1) { const [s0, v0] = OCV_T[i - 1]; return v0 + ((v1 - v0) * (s - s0)) / (s1 - s0); }
  }
  return 4.2;
}

/** Pack 4S Li-ion 18650 (14.4 V danh định, 16.8 V đầy → 12.0 V cạn), có/không mạch BMS */
export class Pack4S extends Battery {
  static get defaults() { return { Rint: 0.08, capAh: 2.6, soc: 1, kind: 'pack', bms: true }; }
  emf() { return 4 * cellOcv(this.p.soc * 100); }
  rint() { return this.p.Rint + (this.p.bms ? 0.02 : 0) + 0.04 * (1 - this.p.soc); }
  on(ctx) { return ctx.powered && !this.dead && !this.cut; }
  begin(x, ctx) { if (!ctx.powered) { this.cut = null; this.ocpT = 0; } }
  accept(x, ctx) {
    super.accept(x, ctx);
    if (!this.p.bms || this.cut || !ctx.powered) return;
    const I = Math.abs(this.I);
    this.ocpT = I > 35 ? (this.ocpT || 0) + ctx.dt : 0;
    if (I > 100) this.cut = 'SCP';                                  // ngắn mạch: BMS ngắt sau ~200 µs
    else if (this.ocpT > 1.0) this.cut = 'OCP';                     // quá dòng > 35 A kéo dài 1 s
    else if (this.emf() / 4 < 2.7) this.cut = 'UVP';                // quá xả (cell < 2.7 V)
    if (this.cut) this.cutAt = ctx.t;
  }
  _repair() { this.cut = null; this.ocpT = 0; }
}

/**
 * Ổn áp có giới hạn dòng, tuyến tính TỪNG ĐOẠN (bền vững hơn hàm trơn khi giải Newton):
 *   'CV' — nguồn áp vtar nối tiếp Rout · 'CC' — nguồn dòng Ilim · 'OFF' — không hút dòng (bộ hạ áp không "sink" được)
 * Vùng được chọn theo nghiệm đang lặp, có trễ, tối đa 6 lần đổi vùng mỗi bước (chống dao động vô hạn).
 */
function regRegion(el, S, ctx, vo, vtar, Rout, Ilim, sink) {
  if (ctx.iter === 0) el._sw = 0;
  const icv = (vtar - vo) / Rout;
  let r = el._reg || 'CV';
  let want = r;
  if (r === 'CV') want = icv > Ilim * 1.001 ? 'CC' : !sink && icv < -1e-4 ? 'OFF' : 'CV';
  else if (r === 'CC') want = icv < Ilim * 0.999 ? 'CV' : 'CC';          // chỉ đổi sang vùng kề bên: OFF ↔ CV ↔ CC
  else want = icv > 1e-4 ? 'CV' : 'OFF';
  if (want !== r && el._sw < 8) { r = want; el._sw++; S.limited = true; }
  el._reg = r;
  return r;
}
/** dập vùng đã chọn: dòng ra khỏi cực p (vào mạch ngoài), cực chuẩn q */
function regStamp(S, r, p, q, vtar, Rout, Ilim) {
  if (r === 'CV') S.lin(p, q, 1 / Rout, -vtar / Rout);
  else if (r === 'CC') S.lin(p, q, 1e-7, -Ilim);
  else S.lin(p, q, 1e-7, 0);
}
const regI = (r, vo, vtar, Rout, Ilim) => (r === 'CV' ? (vtar - vo) / Rout : r === 'CC' ? Ilim : 0);

/** Nguồn bàn thí nghiệm: ổn áp (CV) Vset, giới hạn dòng (CC) Ilim */
export class BenchSupply extends Element {
  static get defaults() { return { v: 5, i: 1, Rout: 0.01 }; }
  _derive() { if (!this.dmg) this.dmg = new Damage(THERMAL.none); }
  stamp(S, x, ctx) {
    const [p, n] = this.nodes;
    if (!ctx.powered) { S.g(p, n, 1e-6); return; }       // tắt: chỉ còn điện trở xả 1 MΩ trong máy
    const v = V(x, p) - V(x, n);
    const r = regRegion(this, S, ctx, v, this.p.v, this.p.Rout, Math.max(0.001, this.p.i), true);
    regStamp(S, r, p, n, this.p.v, this.p.Rout, Math.max(0.001, this.p.i));
  }
  accept(x, ctx) {
    const [p, n] = this.nodes;
    this.V = V(x, p) - V(x, n);
    this.I = ctx.powered ? regI(this._reg || 'CV', this.V, this.p.v, this.p.Rout, Math.max(0.001, this.p.i)) : 0;
    this.cc = ctx.powered && this._reg === 'CC';
    this.P = 0;
  }
}

/** Máy phát xung vuông: OUT = nodes[0], GND = nodes[1]; mức cao v (V), tần số f (Hz), độ rộng duty (%), điện trở ra 50 Ω */
export class PulseGen extends Element {
  static get defaults() { return { v: 5, f: 2, duty: 50, Rout: 50 }; }
  level(t) { const ph = (t * this.p.f) % 1; return ph < this.p.duty / 100 ? 1 : 0; }
  begin(x, ctx) { if (ctx.powered && this.level(ctx.t) !== this.level(ctx.t + ctx.dt)) ctx.circuit.wantRefine = true; }
  stamp(S, x, ctx) {
    const [o, g] = this.nodes;
    const vt = ctx.powered ? this.level(ctx.t) * this.p.v : 0;
    S.lin(o, g, 1 / this.p.Rout, -vt / this.p.Rout);
  }
  accept(x, ctx) {
    const [o, g] = this.nodes;
    this.out = ctx.powered ? this.level(ctx.t) : 0;
    this.V = V(x, o) - V(x, g);
    this.I = (this.out * this.p.v - this.V) / this.p.Rout;
    this.P = 0;
  }
}

// ---------------------------------------------------------------- tụ, cuộn cảm
export class Capacitor extends Element {
  static get defaults() { return { C: 100e-9, Vr: 50 }; }
  _derive() { if (!this.dmg) this.dmg = new Damage(THERMAL.ceramic); this.vc ??= 0; }
  stamp(S, x, ctx) {
    const [a, b] = this.nodes;
    if (this.dead) { S.g(a, b, 5); return; }                       // tụ gốm nứt → chập
    const G = this.p.C / ctx.dt;
    S.lin(a, b, G, -G * this.vc);
  }
  accept(x, ctx) {
    const [a, b] = this.nodes;
    const v = V(x, a) - V(x, b);
    this.I = this.dead ? v * 5 : (this.p.C / ctx.dt) * (v - this.vc);
    this.V = this.vc = this.dead ? 0 : v;
    this.P = this.dead ? v * v * 5 : 0;
    if (Math.abs(v) > 2.5 * this.p.Vr) this.dmg.kill('short', `điện áp ${v.toFixed(1)} V vượt xa định mức ${this.p.Vr} V → điện môi bị đánh thủng`);
    this.dmg.update(this.P, ctx.dt);
  }
  _repair() { this.vc = 0; }
}

/**
 * Tụ hoá nhôm (có cực tính): nhánh ESR + C, song song với đường rò phi tuyến:
 *   • ngược cực: lớp ôxít không còn cách điện → dẫn như diode (~1 V, R_rev ≈ 3·√(1000µF/C) Ω)
 *   • quá áp > 1.3·Vr: ôxít bị đánh thủng → dòng rò tăng vọt
 * Dòng rò làm nóng dung dịch điện phân → sôi → áp suất mở van an toàn (rãnh chữ K) → NỔ.
 */
export class Electrolytic extends Element {
  static get defaults() { return { C: 1000e-6, Vr: 25, ESR: 0.08 }; }
  _derive() {
    const uF = this.p.C * 1e6;
    const C = 0.3 + 2.7 * Math.sqrt(uF / 1000);
    if (!this.dmg || this._uF !== uF) { this.dmg = new Damage({ ...THERMAL.electro, C }); this._uF = uF; }
    this.Rrev = 3 * Math.sqrt(1000 / uF);
    this.Rov = 2 * Math.sqrt(1000 / uF);
    this.vc ??= 0;
  }
  _leak(v) {
    const ur = -v - 1.0, uo = v - 1.3 * this.p.Vr;
    const f = -sp(ur, 0.1) / this.Rrev + sp(uo, 0.2) / this.Rov + v * 1e-6;
    const g = sg(ur, 0.1) / this.Rrev + sg(uo, 0.2) / this.Rov + 1e-6;
    return [f, g];
  }
  stamp(S, x, ctx) {
    const [a, b] = this.nodes;
    if (this.dead) { S.g(a, b, 1e-9); return; }
    const G = 1 / (this.p.ESR + ctx.dt / this.p.C);
    S.lin(a, b, G, -G * this.vc);
    const v = V(x, a) - V(x, b);
    const [f, g] = this._leak(v);
    this._nl2(S, a, b, v, f, g);
  }
  accept(x, ctx) {
    const [a, b] = this.nodes;
    const v = V(x, a) - V(x, b);
    this.V = v;
    if (this.dead) { this.I = 0; this.P = 0; this.dmg.update(0, ctx.dt); return; }
    const G = 1 / (this.p.ESR + ctx.dt / this.p.C);
    const i1 = G * (v - this.vc);
    this.vc += (i1 * ctx.dt) / this.p.C;
    const [i2] = this._leak(v);
    this.Ileak = i2;
    this.I = i1 + i2;
    this.P = i1 * i1 * this.p.ESR + i2 * v;
    const why = v < -1 ? `bị cắm NGƯỢC cực (${v.toFixed(1)} V): lớp ôxít không chặn được, dòng rò ${Math.abs(i2).toFixed(2)} A làm sôi dung dịch`
      : v > 1.3 * this.p.Vr ? `quá áp ${v.toFixed(1)} V > định mức ${this.p.Vr} V: ôxít bị đánh thủng, dòng rò ${i2.toFixed(2)} A`
        : `gợn dòng lớn qua ESR`;
    this.dmg.update(this.P, ctx.dt, why);
  }
  _repair() { this.vc = 0; }
}

export class Inductor extends Element {
  static get defaults() { return { L: 1e-3, DCR: 0.5, Irated: 1 }; }
  _derive() { if (!this.dmg) this.dmg = new Damage(THERMAL.inductor); this.il ??= 0; }
  stamp(S, x, ctx) {
    const [a, b] = this.nodes;
    if (this.dead) { S.g(a, b, 1e-9); return; }
    const Lh = this.p.L / ctx.dt, G = 1 / (this.p.DCR + Lh);
    S.lin(a, b, G, G * Lh * this.il);
  }
  accept(x, ctx) {
    const [a, b] = this.nodes;
    const v = V(x, a) - V(x, b);
    if (this.dead) { this.il = 0; this.I = 0; this.P = 0; this.dmg.update(0, ctx.dt); return; }
    const Lh = this.p.L / ctx.dt, G = 1 / (this.p.DCR + Lh);
    this.il = G * v + G * Lh * this.il;
    this.I = this.il; this.V = v;
    this.P = this.il * this.il * this.p.DCR;
    this.dmg.update(this.P, ctx.dt, `dòng ${Math.abs(this.il).toFixed(2)} A > ${this.p.Irated} A định mức của cuộn cảm`);
  }
  _repair() { this.il = 0; }
}

// ---------------------------------------------------------------- bán dẫn
export const DIODES = {
  '1n4007': { name: '1N4007', Is: 1.65e-8, n: 1.9, Rs: 0.05, BV: 1000, If: 1, th: 'diode' },
  '1n5822': { name: '1N5822 (Schottky)', Is: 5.5e-6, n: 1.1, Rs: 0.04, BV: 40, If: 3, th: 'schottky' },
  ss34: { name: 'SS34 (Schottky)', Is: 6e-6, n: 1.1, Rs: 0.045, BV: 40, If: 3, th: 'schottky' },
};

/** Diode: cực A → điện trở nối tiếp Rs → nút nội m → tiếp giáp Shockley → cực K; đánh thủng ngược ở BV */
export class Diode extends Element {
  static get defaults() { return { model: '1n4007' }; }
  _derive() {
    const m = DIODES[this.p.model] || this.p.custom || DIODES['1n4007'];
    this.m_ = m;
    this.nvt = m.n * VT;
    this.vcrit = this.nvt * Math.log(this.nvt / (Math.SQRT2 * m.Is));
    if (!this.dmg || this._th !== m.th) { this.dmg = new Damage(THERMAL[m.th] || THERMAL.diode); this._th = m.th; }
    this.vj ??= 0;
  }
  init(c) { this.mid = c.node(`${this.key}/j`); }
  _j(vj) {
    const m = this.m_;
    let [I, g] = jexp(vj, m.Is, this.nvt);
    const ub = -vj - m.BV, rbd = m.Rbd ?? 1;
    I -= sp(ub, 0.05) / rbd; g += sg(ub, 0.05) / rbd;
    return [I, g + 1e-12];
  }
  stamp(S, x) {
    const [a, k] = this.nodes, m = this.mid;
    if (this.dead) {
      S.g(a, m, 1);
      S.g(m, k, this.dmg.deadMode === 'short' ? 20 : 1e-9);
      return;
    }
    S.g(a, m, 1 / this.m_.Rs);
    const [vj, lim] = pnjlim(V(x, m) - V(x, k), this.vjIt ?? this.vj, this.nvt, this.vcrit);
    if (lim) S.limited = true;
    this.vjIt = vj;
    const [I, g] = this._j(vj);
    this._nl2(S, m, k, vj, I, g);
  }
  accept(x, ctx) {
    const [a, k] = this.nodes, m = this.mid;
    this.V = V(x, a) - V(x, k);
    this.vj = this.vjIt = V(x, m) - V(x, k);
    this.I = this.dead ? (this.dmg.deadMode === 'short' ? this.V * 20 / 21 : 0) : (V(x, a) - V(x, m)) / this.m_.Rs;
    this.P = this.V * this.I;
    const why = this.V < -this.m_.BV * 0.9 ? `điện áp ngược ${(-this.V).toFixed(0)} V vượt định mức ${this.m_.BV} V`
      : `dòng ${Math.abs(this.I).toFixed(2)} A > ${this.m_.If} A định mức`;
    this.dmg.update(this.P, ctx.dt, why);
  }
}

export const LED_COLORS = {
  red: { name: 'đỏ', vf: 2.0, Rs: 10, hex: 0xff2a2a },
  yellow: { name: 'vàng', vf: 2.1, Rs: 10, hex: 0xffd21a },
  green: { name: 'xanh lá', vf: 2.2, Rs: 10, hex: 0x2aff4a },
  blue: { name: 'xanh dương', vf: 3.1, Rs: 12, hex: 0x3a7dff },
  white: { name: 'trắng', vf: 3.1, Rs: 12, hex: 0xf4f6ff },
};

/** LED 5 mm: diode với Vf theo màu (đo ở 20 mA), If tối đa 30 mA, chịu ngược 5 V */
export class Led extends Diode {
  static get defaults() { return { color: 'red' }; }
  _derive() {
    const c = LED_COLORS[this.p.color] || LED_COLORS.red;
    const n = 2, Rs = c.Rs, nvt = n * VT;
    const vj20 = c.vf - 0.02 * Rs;
    this.color = c;
    this.p.custom = { Is: 0.02 / Math.exp(vj20 / nvt), n, Rs, BV: 5, Rbd: 20, If: 0.03, th: 'led' };
    this.p.model = '_led';
    super._derive();
  }
  /** độ sáng tương đối 0..1.5 (1 = 20 mA) */
  get brightness() { return this.dead ? 0 : clamp(this.I / 0.02, 0, 1.5); }
  accept(x, ctx) {
    const [a, k] = this.nodes, m = this.mid;
    this.V = V(x, a) - V(x, k);
    this.vj = this.vjIt = V(x, m) - V(x, k);
    this.I = this.dead ? 0 : (V(x, a) - V(x, m)) / this.m_.Rs;
    this.P = this.V * this.I;
    if (!this.dead && this.I > 0.6) { this.dmg.kill('open', `dòng ${(this.I * 1000).toFixed(0)} mA làm đứt sợi dây vàng nối chip LED`); return; }
    const why = this.V < -4 ? `điện áp ngược ${(-this.V).toFixed(1)} V > 5 V (LED chịu ngược rất kém)`
      : `dòng ${(this.I * 1000).toFixed(0)} mA > 30 mA tối đa — thiếu điện trở hạn dòng`;
    this.dmg.update(this.P, ctx.dt, why);
  }
}

export const MOSFETS = {
  irlz44n: { name: 'IRLZ44N', vth: 1.5, k: 7, r0: 0.0165, a: 0.025, bv: 55, vgsMax: 16, th: 'to220', Is: 1e-12 },
  irf520: { name: 'IRF520', vth: 3.1, k: 1, r0: 0.2, a: 0.49, bv: 100, vgsMax: 20, th: 'to220', Is: 1e-12 },
  bss138: { name: 'BSS138', vth: 1.3, k: 0.25, r0: 1.5, a: 2.0, bv: 50, vgsMax: 20, th: 'sot23', Is: 1e-13 },
};

/**
 * MOSFET kênh N (G, D, S):
 *   vov = softplus(Vgs − Vth) ; Isat = K·vov² ; Rds = (r0 + a/vov)·(1 + 0.007·(Tj − 25))
 *   Id = Isat·tanh(Vds/(Rds·Isat))  → Vds nhỏ: điện trở Rds ; Vds lớn: bão hoà Isat
 *   + diode thân S→D + đánh thủng thác lũ (avalanche) D→S ở ~1.2·BVdss
 */
export class Nmos extends Element {
  static get defaults() { return { model: 'irlz44n' }; }
  _derive() {
    const m = MOSFETS[this.p.model] || MOSFETS.irlz44n;
    this.m_ = m;
    this.nvt = 1.2 * VT;
    this.vcrit = this.nvt * Math.log(this.nvt / (Math.SQRT2 * m.Is));
    if (!this.dmg || this._th !== m.th) { this.dmg = new Damage(THERMAL[m.th]); this._th = m.th; }
    this.vsd ??= 0;
  }
  _ch(vgs, vds) {
    const m = this.m_;
    if (vds < 0) return -this._ch(vgs - vds, -vds);
    const vov = sp(vgs - m.vth, 0.04);
    const isat = m.k * vov * vov + 1e-9;                       // + dòng rò ~1 nA khi tắt
    const rds = (m.r0 + m.a / (vov + 1e-9)) * (1 + 0.007 * (this.T - 25));   // tắt hẳn: Rds → hàng chục MΩ
    return isat * Math.tanh(vds / (rds * isat));
  }
  _f(vg, vd, vs) {
    return this._ch(vg - vs, vd - vs) + sp(vd - vs - 1.2 * this.m_.bv, 0.3) / 0.5;
  }
  stamp(S, x) {
    const [g, d, s] = this.nodes;
    S.g(g, s, 1e-9);
    if (this.dead) { S.g(d, s, 50); S.g(g, s, 0.02); return; }
    const vg = V(x, g), vd = V(x, d), vs = V(x, s);
    const I0 = this._f(vg, vd, vs);
    const h = 1e-6;
    const dg = (this._f(vg + h, vd, vs) - I0) / h;
    const dd = (this._f(vg, vd + h, vs) - I0) / h;
    const ds = (this._f(vg, vd, vs + h) - I0) / h;
    S.nl(d, s, I0, [g, d, s], [dg, dd + 1e-12, ds - 1e-12], [vg, vd, vs]);
    // diode thân: anode S, cathode D
    const [u, lim] = pnjlim(vs - vd, this.vsdIt ?? this.vsd, this.nvt, this.vcrit);
    if (lim) S.limited = true;
    this.vsdIt = u;
    const [Ib, gb] = jexp(u, this.m_.Is, this.nvt);
    this._nl2(S, s, d, u, Ib, gb + 1e-12);
  }
  accept(x, ctx) {
    const [g, d, s] = this.nodes;
    const vg = V(x, g), vd = V(x, d), vs = V(x, s);
    this.vgs = vg - vs; this.vds = vd - vs;
    this.vsd = this.vsdIt = vs - vd;
    if (this.dead) { this.I = this.vds * 50; this.P = this.I * this.vds; this.dmg.update(this.P, ctx.dt); return; }
    const ich = this._f(vg, vd, vs);
    const ib = jexp(this.vsd, this.m_.Is, this.nvt)[0];
    this.I = ich - ib;                                     // dòng máng (D→S)
    this.Iaval = sp(this.vds - 1.2 * this.m_.bv, 0.3) / 0.5;
    this.P = ich * this.vds + ib * this.vsd;
    this.V = this.vds;
    if (Math.abs(this.vgs) > this.m_.vgsMax * 1.5) {
      this.dmg.kill('short', `Vgs = ${this.vgs.toFixed(1)} V vượt ±${this.m_.vgsMax} V → lớp ôxít cổng mỏng ~50 nm bị đánh thủng`);
      return;
    }
    const why = this.Iaval > 0.01 ? `xung điện áp ${this.vds.toFixed(0)} V vượt BVdss ${this.m_.bv} V → đánh thủng thác lũ (thiếu diode dập)`
      : this.vgs < this.m_.vth + 2 && Math.abs(ich) > 0.3 ? `Vgs = ${this.vgs.toFixed(1)} V chưa đủ mở hẳn (Vth ≈ ${this.m_.vth} V) → MOSFET làm việc như điện trở lớn, P = ${this.P.toFixed(1)} W`
        : `công suất ${this.P.toFixed(1)} W (dòng ${Math.abs(this.I).toFixed(1)} A) không có tản nhiệt`;
    this.dmg.update(this.P, ctx.dt, why);
  }
}

// ---------------------------------------------------------------- động cơ DC
/**
 * Động cơ DC chổi than RS-360 (bánh xe 14.4 V): v = R·i + L·di/dt + Ke·ω ; J·dω/dt = Kt·i − B·ω − τ_ma sát − τ_tải
 * Hằng số giống bài "Động cơ DC" và "DRV8871".
 */
export class Motor extends Element {
  static get defaults() { return { R: 7.0, Ke: 0.011, J: 2.0e-6, B: 1.2e-6, Tf: 0.0012, L: 1.5e-3, load: 0, stall: false }; }
  _derive() { if (!this.dmg) this.dmg = new Damage(THERMAL.motor); this.w ??= 0; this.il ??= 0; this.angle ??= 0; }
  get R() { return this.dead ? 2.0 : this.p.R; }
  get E() { return this.dead ? 0 : this.p.Ke * this.w; }
  stamp(S, x, ctx) {
    const [p, n] = this.nodes;
    const Lh = this.p.L / ctx.dt, G = 1 / (this.R + Lh);
    S.lin(p, n, G, G * (-this.E + Lh * this.il));
  }
  accept(x, ctx) {
    const [p, n] = this.nodes;
    const v = V(x, p) - V(x, n);
    const Lh = this.p.L / ctx.dt, G = 1 / (this.R + Lh);
    this.il = G * v + G * (-this.E + Lh * this.il);
    this.I = this.il; this.V = v;
    this.P = this.il * this.il * this.R;
    const { Ke, J, B, Tf } = this.p;
    const tl = (this.p.load || 0) * 1e-3;
    if (this.p.stall || this.dead) this.w = 0;
    else {
      const te = Ke * this.il;
      const drag = Tf + tl;
      let w = this.w;
      if (Math.abs(w) < 1e-3 && Math.abs(te) <= drag) w = 0;
      else {
        const dir = Math.abs(w) < 1e-3 ? Math.sign(te) : Math.sign(w);
        const w1 = (w + (ctx.dt * (te - dir * drag)) / J) / (1 + (ctx.dt * B) / J);
        w = Math.sign(w1) !== dir && Math.abs(w) > 0 ? 0 : w1;
      }
      this.w = w;
    }
    this.angle = (this.angle + this.w * ctx.dt) % (Math.PI * 2);
    this.rpm = (this.w * 60) / (2 * Math.PI);
    this.dmg.update(this.P, ctx.dt, this.p.stall ? `trục bị kẹt: không có sức phản điện động, dòng ${Math.abs(this.il).toFixed(2)} A, P = I²R = ${this.P.toFixed(0)} W đốt nóng cuộn dây`
      : `dòng ${Math.abs(this.il).toFixed(2)} A, P = ${this.P.toFixed(1)} W trong cuộn dây`);
  }
  _repair() { this.w = 0; this.il = 0; }
}

// ---------------------------------------------------------------- mạch nguồn
/**
 * Module hạ áp buck XL4015 (mô hình hành vi, trung bình theo chu kỳ đóng cắt 180 kHz):
 * IN+, IN−, OUT+, OUT− (IN− và OUT− nối chung trên module).
 *   Vout = min(Vset, Vin − sụt áp) · khởi động mềm 2.5 V/ms · chỉ đẩy dòng ra, không hút được · giới hạn 5 A
 *   Pin = Pout + tổn hao (dẫn, diode, chuyển mạch, tĩnh) → hiệu suất ~85–92 %
 *   Vin < 4.5 V tắt (UVLO) · Tj > 150 °C ngắt nhiệt · Vin > 40 V → công tắc bên trong chập: Vin chạy thẳng ra Vout!
 *   Cắm ngược cực vào → dòng chạy qua diode ký sinh → IC chết chập.
 */
export class Buck extends Element {
  static get defaults() { return { vset: 5.0, Cout: 220e-6, Ilim: 5, Rout: 0.02 }; }
  _derive() {
    if (!this.dmg) this.dmg = new Damage(THERMAL.buck);
    this.vc ??= 0; this.vref ??= 0; this.iout ??= 0; this.pin ??= 0; this.vin ??= 0; this.on ??= false;
  }
  begin(x, ctx) {
    const [ip, im] = this.nodes;
    const vin = V(x, ip) - V(x, im);
    this.vin = vin;
    if (!this.on && vin > 5.0 && !this.tsd) this.on = true;
    if (this.on && (vin < 4.5 || this.tsd)) this.on = false;
    if (this.dead) this.on = false;
    this.vref = this.on ? Math.min(this.p.vset, this.vref + 2500 * ctx.dt) : 0;
    this.vtar = Math.max(0, Math.min(this.vref, vin - 0.3 - 0.11 * this.iout));
    this.gin = this.on ? this.pin / Math.max(vin, 3) ** 2 : 0;
  }
  _rev(vin) { const u = -vin - 1.3; return [-sp(u, 0.03) / 0.05, sg(u, 0.03) / 0.05]; }
  stamp(S, x, ctx) {
    const [ip, im, op, om] = this.nodes;
    const Cg = this.p.Cout / ctx.dt;
    S.lin(op, om, Cg, -Cg * this.vc);
    S.g(op, om, 1e-4);                                  // cầu phân áp hồi tiếp ~10 kΩ
    const vin = V(x, ip) - V(x, im);
    if (this.dead) {
      if (this.dmg.deadMode === 'pass') S.g(ip, op, 10);
      else S.g(ip, im, 20);
      return;
    }
    if (this.on) {
      const vo = V(x, op) - V(x, om);
      const r = regRegion(this, S, ctx, vo, this.vtar, this.p.Rout, this.p.Ilim, false);
      regStamp(S, r, op, om, this.vtar, this.p.Rout, this.p.Ilim);
      S.g(ip, im, this.gin + 1e-6);
    }
    const [f, g] = this._rev(vin);
    this._nl2(S, ip, im, vin, f, g + 1e-12);
  }
  accept(x, ctx) {
    const [ip, im, op, om] = this.nodes;
    const vin = V(x, ip) - V(x, im), vo = V(x, op) - V(x, om);
    this.vin = vin; this.vout = vo;
    this.iout = this.on && !this.dead ? Math.max(0, regI(this._reg, vo, this.vtar, this.p.Rout, this.p.Ilim)) : 0;
    this.vc = vo;
    const [irev] = this._rev(vin);
    const Prev = this.dead ? 0 : Math.abs(irev * vin);
    let Ploss = 0;
    if (this.on && !this.dead) {
      const D = clamp(vo / Math.max(vin, 0.1), 0, 1), Io = this.iout;
      Ploss = Io * Io * (0.08 * D + 0.03) + 0.45 * Io * (1 - D) + 0.5 * vin * Io * 30e-9 * 180e3 + vin * 0.003;
    }
    const Pout = vo * this.iout;
    this.pin = Pout + Ploss;
    this.iin = this.on ? this.gin * vin : 0;
    this.eff = this.pin > 1e-3 ? Pout / this.pin : 0;
    this.P = Ploss + Prev;
    this.I = this.iout; this.V = vo;
    if (vin > 40 && !this.dead) {
      this.dmg.kill('pass', `Vin = ${vin.toFixed(1)} V > 40 V tuyệt đối: công tắc MOSFET bên trong XL4015 bị đánh thủng (chập) → điện áp vào chạy THẲNG ra đầu ra`);
      return;
    }
    const wasDead = this.dmg.dead;
    this.dmg.update(this.P, ctx.dt, Prev > 1 ? `cắm NGƯỢC cực đầu vào: dòng ${Math.abs(irev).toFixed(1)} A chạy qua diode ký sinh trong module` : `tổn hao ${Ploss.toFixed(1)} W`);
    if (!wasDead && this.dmg.dead && Prev <= 1) this.dmg.deadMode = 'pass';
    if (this.dmg.T > 150) this.tsd = true;
    if (this.dmg.T < 125) this.tsd = false;
  }
  _repair() { this.vc = 0; this.vref = 0; this.iout = 0; this.pin = 0; this.on = false; this.tsd = false; }
}

/** LDO LM1117-3.3 (TO-220): GND, OUT, IN. Vout = min(3.3, Vin − 1.1 V), giới hạn ~1 A, ngắt nhiệt 165 °C */
export class Ldo extends Element {
  static get defaults() { return { vout: 3.3, drop: 1.1, Ilim: 1.0, Cout: 10e-6, Iq: 0.005, Rout: 0.05, vinMax: 20 }; }
  _derive() { if (!this.dmg) this.dmg = new Damage(THERMAL.ldo); this.vc ??= 0; this.iout ??= 0; this.vin ??= 0; }
  begin(x) {
    const [g, , i] = this.nodes;
    this.vin = V(x, i) - V(x, g);
    this.vtar = this.tsd || this.dead ? 0 : Math.max(0, Math.min(this.p.vout, this.vin - this.p.drop));
    this.gin = (this.iout + (this.vin > 1.5 ? this.p.Iq : 0)) / Math.max(this.vin, 1);
  }
  stamp(S, x, ctx) {
    const [g, o, i] = this.nodes;
    const Cg = this.p.Cout / ctx.dt;
    S.lin(o, g, Cg, -Cg * this.vc);
    if (this.dead) { S.g(i, o, 2); return; }
    const vo = V(x, o) - V(x, g);
    const r = regRegion(this, S, ctx, vo, this.vtar, this.p.Rout, this.p.Ilim, false);
    regStamp(S, r, o, g, this.vtar, this.p.Rout, this.p.Ilim);
    S.g(i, g, this.gin + 1e-7);
  }
  accept(x, ctx) {
    const [g, o, i] = this.nodes;
    const vo = V(x, o) - V(x, g);
    this.vin = V(x, i) - V(x, g);
    this.vc = vo; this.vout = vo;
    this.iout = this.dead ? 0 : Math.max(0, regI(this._reg, vo, this.vtar, this.p.Rout, this.p.Ilim));
    this.P = this.dead ? 0 : Math.max(0, this.vin - vo) * this.iout + this.vin * this.p.Iq;
    this.I = this.iout; this.V = vo;
    if (this.vin > this.p.vinMax && !this.dead) { this.dmg.kill('pass', `Vin = ${this.vin.toFixed(1)} V > ${this.p.vinMax} V tuyệt đối của LM1117 → IC bị đánh thủng, đầu vào chạy thẳng ra đầu ra`); return; }
    this.dmg.update(this.P, ctx.dt, `LDO đốt bỏ (Vin − Vout)·I = ${this.P.toFixed(1)} W thành nhiệt`);
    if (this.dmg.T > 165) this.tsd = true;
    if (this.dmg.T < 140) this.tsd = false;
  }
  _repair() { this.vc = 0; this.iout = 0; this.tsd = false; }
}

/**
 * Driver cầu H DRV8871 (hành vi): IN1, IN2, GND, VM, OUT1, OUT2.
 *   IN1 IN2 → 0 0: thả trôi (Hi-Z) · 1 0: OUT1=VM, OUT2=GND (tiến) · 0 1: lùi · 1 1: phanh (2 FET dưới dẫn)
 *   Rds(on) mỗi FET 0.28 Ω · giới hạn dòng I_TRIP = 64/R_ILIM(30 kΩ) ≈ 2.1 A (băm dòng) · quá dòng 4.5 A → ngắt 3 ms
 *   Tj > 175 °C ngắt nhiệt · VM > 50 V chết · cấp NGƯỢC nguồn: dòng chạy qua 2 diode thân nối tiếp → chết chập
 */
export class Drv8871 extends Element {
  static get defaults() { return { Rds: 0.2825, Rilim: 30 }; }
  _derive() { if (!this.dmg) this.dmg = new Damage(THERMAL.drv); this.mode ??= ['Z', 'Z']; this.iA ??= 0; this.sleepT ??= 0; this.ocpT ??= 0; }
  get itrip() { return 64 / this.p.Rilim; }
  begin(x, ctx) {
    const [i1, i2, g, vm] = this.nodes;
    const th = (n, prev) => V(x, n) - V(x, g) > (prev ? 1.2 : 1.6);
    this.in1 = th(i1, this.in1); this.in2 = th(i2, this.in2);
    this.vm = V(x, vm) - V(x, g);
    if (this.ocpT > 0) this.ocpT -= ctx.dt;
    let m = ['Z', 'Z'];
    this.why = '';
    const ok = !this.dead && this.vm > 6.0 && !this.tsd && this.ocpT <= 0;
    if (!this.in1 && !this.in2) { this.sleepT += ctx.dt; m = ['Z', 'Z']; this.dir = 'Thả trôi (coast)'; }
    else {
      this.sleepT = 0;
      if (this.in1 && !this.in2) { m = ['H', 'L']; this.dir = 'Tiến (OUT1 = VM)'; }
      else if (!this.in1 && this.in2) { m = ['L', 'H']; this.dir = 'Lùi (OUT2 = VM)'; }
      else { m = ['L', 'L']; this.dir = 'Phanh'; }
      if (Math.abs(this.iA) > this.itrip && m[0] !== m[1]) { m = ['L', 'L']; this.dir += ' · đang băm dòng (ILIM)'; }
    }
    if (!ok) {
      m = ['Z', 'Z'];
      this.dir = this.dead ? 'Đã chết' : this.vm <= 6.0 ? (this.vm < -0.5 ? 'Nguồn VM bị NGƯỢC cực!' : 'Thiếu nguồn VM (< 6.5 V)') : this.tsd ? 'Ngắt nhiệt (TSD)' : 'Ngắt quá dòng (OCP), thử lại sau 3 ms';
    }
    if (this.mode && (m[0] !== this.mode[0] || m[1] !== this.mode[1])) ctx.circuit.wantRefine = true;
    this.mode = m;
  }
  _bd(u) { return clampD(u, 0.6, 0.05, 0.025); }
  stamp(S, x) {
    const [i1, i2, g, vm, o1, o2] = this.nodes;
    S.g(i1, g, 1e-5); S.g(i2, g, 1e-5);                 // điện trở kéo xuống 100 kΩ bên trong
    if (this.dead) { S.g(vm, g, 10); return; }
    S.g(vm, g, 1 / 4000);                               // dòng tĩnh ~3 mA
    const G = 1 / this.p.Rds;
    [o1, o2].forEach((o, k) => {
      if (this.mode[k] === 'H') S.g(o, vm, G);
      if (this.mode[k] === 'L') S.g(o, g, G);
      let u = V(x, o) - V(x, vm); let [f, d] = this._bd(u); this._nl2(S, o, vm, u, f, d);   // diode thân OUT→VM
      u = V(x, g) - V(x, o); [f, d] = this._bd(u); this._nl2(S, g, o, u, f, d);               // diode thân GND→OUT
    });
    const u = V(x, g) - V(x, vm);                         // nguồn ngược: 2 diode thân nối tiếp
    const f = sp(u - 1.4, 0.03) / 0.05, d = sg(u - 1.4, 0.03) / 0.05;
    this._nl2(S, g, vm, u, f, d + 1e-12);
  }
  accept(x, ctx) {
    const [, , g, vm, o1, o2] = this.nodes;
    const G = 1 / this.p.Rds;
    const Vg = V(x, g), Vm = V(x, vm);
    let P = 0;
    const iout = [o1, o2].map((o, k) => {
      const vo = V(x, o);
      let i = 0;
      if (this.mode[k] === 'H') { const ih = (Vm - vo) * G; i += ih; P += ih * ih / G; }
      if (this.mode[k] === 'L') { const il = (Vg - vo) * G; i += il; P += il * il / G; }
      const du = this._bd(vo - Vm)[0], dd = this._bd(Vg - vo)[0];
      i += dd - du;
      P += du * 0.8 + dd * 0.8;
      return i;
    });
    this.iA = iout[0];
    this.I = iout[0];
    this.vout = V(x, o1) - V(x, o2);
    const u = Vg - Vm, irev = sp(u - 1.4, 0.03) / 0.05;
    P += irev * Math.max(u, 0);
    this.Irev = irev;
    this.P = this.dead ? 0 : P;
    this.V = Vm - Vg;
    if (!this.dead && Math.abs(this.iA) > 4.5) this.ocpT = 3e-3;
    if (!this.dead && this.V > 50) { this.dmg.kill('short', `VM = ${this.V.toFixed(0)} V > 50 V tuyệt đối → cầu H bị đánh thủng`); return; }
    this.dmg.update(this.P, ctx.dt, irev > 0.5 ? `nguồn VM bị cắm NGƯỢC: ${irev.toFixed(0)} A chạy qua 2 diode thân MOSFET — mạch ngắt nhiệt không cứu được` : `tổn hao ${this.P.toFixed(1)} W trong cầu H`);
    if (this.dmg.T > 175) this.tsd = true;
    if (this.dmg.T < 135) this.tsd = false;
  }
  _repair() { this.tsd = false; this.ocpT = 0; this.iA = 0; }
}

// ---------------------------------------------------------------- vi điều khiển (hành vi)
/**
 * Lớp chung cho vi điều khiển: 2 thanh nguồn nội (vdd, vss), chân I/O:
 *   ra (output): nối vdd hoặc vss qua R_out ≈ 25 Ω ; vào (input): trở kháng cao
 *   mọi chân I/O có 2 diode kẹp (lên vdd, xuống vss) — dòng kẹp lớn làm hỏng chân theo thời gian
 *   giữa vdd–vss: dòng lõi + "diode" bảo vệ quá áp (dẫn mạnh trên ngưỡng tuyệt đối) + diode đế (ngược cực)
 */
export class Mcu extends Element {
  constructor(nodes, p) {
    super(nodes, p);
    const n = this.roles.length;
    this.out = new Int8Array(n).fill(-1);
    this.pull = new Uint8Array(n);
    this.stress = new Float64Array(n);
    this.pinDead = new Uint8Array(n);
    this.Ipin = new Float64Array(n);
    this.upT = 0;
    this.status = 'Chưa có nguồn';
    this.running = false;
  }
  init(c) { this.vdd = c.node(`${this.key}/vdd`); this.vss = c.node(`${this.key}/vss`); }
  get roles() { return []; }
  /** ngưỡng & thông số — lớp con ghi đè */
  get cfg() { return { rOut: 25, rCl: 15, vClamp: 7.0, rClamp: 2, gCore: 1 / 1100, iPin: 0.025, iCl: 0.02, pinLife: 20, quad: true, gRail: 2, iBond: 1.5 }; }
  _clamp(S, x, p, q, rCl) { const u = V(x, p) - V(x, q); const [f, g] = clampD(u, 0.65, rCl); this._nl2(S, p, q, u, f, g); }
  _coreF(v) {
    const c = this.cfg;
    const f = v * c.gCore + sp(v - c.vClamp, 0.1) / c.rClamp - sp(-v - 0.6, 0.03) / 0.3;
    const g = c.gCore + sg(v - c.vClamp, 0.1) / c.rClamp + sg(-v - 0.6, 0.03) / 0.3;
    return [f, g];
  }
  stamp(S, x, ctx) {
    const c = this.cfg, { vdd, vss } = this, R = this.roles;
    for (let i = 0; i < R.length; i++) {
      const n = this.nodes[i];
      if (n == null) continue;
      const r = R[i];
      if (r === 'vdd') { S.g(n, vdd, c.gRail); continue; }
      if (r === 'vss') { S.g(n, vss, c.gRail); continue; }
      if (r === 'nc' || r === 'v5') continue;
      if (this.pinDead[i]) S.g(n, vss, 1 / 300);
      else {
        if (this.out[i] === 1) S.g(n, vdd, 1 / c.rOut);
        else if (this.out[i] === 0) S.g(n, vss, 1 / c.rOut);
        if (this.pull[i]) S.g(n, vdd, 1 / 20000);
      }
      if (r !== 'mclr') this._clamp(S, x, n, vdd, c.rCl);
      this._clamp(S, x, vss, n, c.rCl);
    }
    if (this.dead) { S.g(vdd, vss, 1); return; }
    const v = V(x, vdd) - V(x, vss);
    const [f, g] = this._coreF(v);
    this._nl2(S, vdd, vss, v, f, g);
    this.stampExtra?.(S, x, ctx);
  }
  pinV(x, i) { const n = this.nodes[i]; return n == null ? null : V(x, n) - V(x, this.vss); }
  /** chạy "chương trình" (lớp con: _logic) rồi báo bộ giải chia mịn bước nếu có chân ra đổi mức */
  begin(x, ctx) {
    this._logic?.(x, ctx);
    if (!this._prevOut) this._prevOut = new Int8Array(this.out.length).fill(-1);
    for (let i = 0; i < this.out.length; i++) if (this.out[i] !== this._prevOut[i]) { ctx.circuit.wantRefine = true; break; }
    this._prevOut.set(this.out);
  }
  accept(x, ctx) {
    const c = this.cfg, { vdd, vss } = this, R = this.roles;
    const vd = V(x, vdd), vs = V(x, vss), v = vd - vs;
    this.vcore = v;
    let P = 0, worst = 0, worstWhy = '';
    for (let i = 0; i < R.length; i++) {
      const n = this.nodes[i];
      this.Ipin[i] = 0;
      if (n == null || R[i] === 'vdd' || R[i] === 'vss' || R[i] === 'nc' || R[i] === 'v5') continue;
      const vp = V(x, n);
      let idrv = 0;
      if (!this.pinDead[i]) {
        if (this.out[i] === 1) idrv = (vd - vp) / c.rOut;
        else if (this.out[i] === 0) idrv = (vs - vp) / c.rOut;
      }
      const icu = R[i] !== 'mclr' ? clampD(vp - vd, 0.65, c.rCl)[0] : 0;
      const icd = clampD(vs - vp, 0.65, c.rCl)[0];
      this.Ipin[i] = idrv - icu + icd;
      P += idrv * idrv * c.rOut + icu * Math.max(0, vp - vd) + icd * Math.max(0, vs - vp);
      const ratio = Math.max(Math.abs(idrv) / c.iPin, (icu + icd) / c.iCl);
      if (ratio > 1 && !this.pinDead[i]) {
        this.stress[i] += ctx.dt * (c.quad ? ratio * ratio - 1 : ratio - 1);
        if (ratio > worst) { worst = ratio; worstWhy = `${this.pinName(i)}: ${Math.abs(idrv) > icu + icd ? `dòng ra ${(Math.abs(idrv) * 1000).toFixed(0)} mA > ${c.iPin * 1000} mA` : `dòng qua diode kẹp ${((icu + icd) * 1000).toFixed(0)} mA > ${c.iCl * 1000} mA (điện áp chân vượt nguồn)`}`; }
        if (this.stress[i] > c.pinLife) { this.pinDead[i] = 1; this.deadPins = (this.deadPins || []).concat(this.pinName(i)); this.dmg.events.push({ type: 'pin', up: true, cause: `Hỏng chân ${worstWhy}` }); }
      }
    }
    this.worstPin = worstWhy;
    const [f] = this._coreF(v);
    P += f * v;
    this.Isup = f;
    this.P = this.dead ? v * v : P;
    this.I = f; this.V = v;
    this.dmg.update(this.P, ctx.dt, this.overWhy(v) || (worstWhy ? `quá dòng chân ${worstWhy}` : `công suất ${this.P.toFixed(2)} W`));
    // dây bond (vàng Ø25 µm) nối chip ra chân nguồn chịu ~1–2 A: quá lâu thì đứt/chảy dính → chip chết
    this.bondT = Math.abs(f) > c.iBond ? (this.bondT || 0) + ctx.dt : Math.max(0, (this.bondT || 0) - ctx.dt);
    if (this.bondT > 0.8 && !this.dead) this.dmg.kill('short', `${this.overWhy(v) || 'quá dòng nguồn'} — dòng ${Math.abs(f).toFixed(1)} A làm chảy dây bond & lớp kim loại trong chip`);
    this.acceptExtra?.(x, ctx);
  }
  pinName(i) { return String(i + 1); }
  overWhy() { return ''; }
  _repair() { this.stress.fill(0); this.pinDead.fill(0); this.deadPins = []; this.upT = 0; this.bondT = 0; }
}

const blink = (t, hz) => (Math.floor(t * hz * 2) % 2 === 0 ? 1 : 0);

/** PIC16F877A DIP-40 — sơ đồ chân theo docs/01. Chân 11/32 VDD, 12/31 VSS, 1 MCLR, 13/14 thạch anh */
export class Pic16F877A extends Mcu {
  static get defaults() { return { program: 'robovac', crystal: false, caps: false }; }
  _derive() { if (!this.dmg) this.dmg = new Damage(THERMAL.pic); }
  get roles() {
    if (!this._roles) {
      this._roles = Array.from({ length: 40 }, (_, i) => {
        const n = i + 1;
        if (n === 11 || n === 32) return 'vdd';
        if (n === 12 || n === 31) return 'vss';
        if (n === 1) return 'mclr';
        if (n === 13 || n === 14) return 'osc';
        return 'io';
      });
    }
    return this._roles;
  }
  overWhy(v) {
    if (v > 7) return `VDD = ${v.toFixed(1)} V > 7.5 V tuyệt đối → mạch bảo vệ bên trong dẫn mạnh, chip tự đốt ${this.P.toFixed(0)} W`;
    if (v < -0.6) return `NGƯỢC cực nguồn: dòng chạy qua diode đế silicon (VSS→VDD) ${Math.abs(this.Isup).toFixed(1)} A`;
    return '';
  }
  _logic(x, ctx) {
    const v = V(x, this.vdd) - V(x, this.vss);
    const nd = this.nodes;
    const pins = (a) => a.every((p) => nd[p - 1] != null);
    let why = '';
    if (this.dead) why = '💀 Chip đã chết';
    else if (v < -0.5) why = '⚠️ Nguồn bị NGƯỢC cực (VSS cao hơn VDD)';
    else if (v < 2.0) why = 'Chưa có nguồn (VDD < 2 V)';
    else if (!pins([11, 32]) || !pins([12, 31])) why = `Thiếu nối ${!pins([11, 32]) ? `VDD chân ${nd[10] == null ? 11 : 32}` : `VSS chân ${nd[11] == null ? 12 : 31}`} — PIC16F877A phải nối CẢ 2 cặp VDD/VSS (11-12 và 32-31)`;
    else if (v < 4.0) why = `VDD = ${v.toFixed(2)} V < 4.0 V: thạch anh 20 MHz (chế độ HS) cần ≥ 4.0 V — mạch BOR giữ chip ở trạng thái reset`;
    else if (nd[0] == null) why = 'Chân MCLR (1) thả nổi — thiếu điện trở 10 kΩ kéo lên 5 V → chip reset lung tung';
    else if (V(x, nd[0]) - V(x, this.vss) < 0.8 * v) why = `MCLR (chân 1) = ${(V(x, nd[0]) - V(x, this.vss)).toFixed(2)} V < 0.8·VDD → chip đang bị giữ RESET`;
    else if (!this.p.crystal) why = 'Không có thạch anh giữa OSC1 (13) và OSC2 (14) → không có xung nhịp, CPU đứng yên';
    else if (v > 5.5) why = `⚠️ VDD = ${v.toFixed(1)} V vượt 5.5 V cho phép`;
    const okRun = !why || why.startsWith('⚠️ VDD');
    this.upT = okRun ? this.upT + ctx.dt : 0;
    this.running = okRun && this.upT > 0.072;                    // PWRT 72 ms + OST
    this.status = this.running ? (why || `Đang chạy chương trình "${this.p.program}"${this.p.caps ? '' : ' (⚠️ thiếu 2 tụ 22 pF ở thạch anh — dao động kém ổn định)'}`)
      : okRun ? 'Đang khởi động (PWRT 72 ms)…' : why;
    this.out.fill(-1); this.pull.fill(0);
    if (!this.running) return;
    const t = ctx.t;
    const set = (pin, val) => { this.out[pin - 1] = val; };
    const prog = this.p.program;
    if (prog === 'blink') set(30, blink(t, 1));
    if (prog === 'robovac') {
      [33, 34, 35, 37, 38].forEach((p) => (this.pull[p - 1] = 1));          // RBPU: kéo lên nội cổng B
      set(25, 1);                                                              // UART TX nghỉ = mức 1
      const an0 = this.pinV(x, 1);
      const adc = an0 == null ? 0 : clamp(Math.round((an0 / v) * 1023), 0, 1023);
      this.adc = adc;
      this.vbat = (adc * 21017) / 1000;
      const noDiv = an0 == null || an0 < 0.3;
      const bump = (this.pinV(x, 36) ?? v) < 1.0 || (this.pinV(x, 37) ?? v) < 1.0;
      const low = !noDiv && this.vbat < 12400;
      this.note = noDiv ? 'Không đo được pin (AN0 trống) — vẫn chạy' : low ? `Pin yếu ${(this.vbat / 1000).toFixed(2)} V < 12.4 V → dừng động cơ, LED nháy nhanh` : bump ? 'Bumper bị chạm (RB4/RB5 = 0) → dừng bánh' : `Pin ${(this.vbat / 1000).toFixed(2)} V`;
      set(30, blink(t, low ? 4 : 1));
      const run = !low && !bump ? 1 : 0;
      set(28, run); set(29, run);                                              // RD5, RD6 MOSFET chổi
      set(17, run); set(19, 0);                                                // RC2 PWM trái (100 %), RD0 DIR
      set(16, run); set(21, 0);                                                // RC1 PWM phải, RD2 DIR
    }
    if (prog === 'dao-chieu') {                                               // đảo chiều bánh trái mỗi 2 s
      set(30, blink(t, 1));
      const fwd = Math.floor(t / 2) % 2 === 0 ? 1 : 0;
      set(17, fwd); set(19, 1 - fwd);
    }
  }
  pinName(i) { const n = i + 1; return `chân ${n} (${PIC_NAMES[n] || ''})`; }
}
export const PIC_NAMES = {
  1: 'MCLR', 2: 'RA0/AN0', 3: 'RA1', 4: 'RA2', 5: 'RA3', 6: 'RA4', 7: 'RA5', 8: 'RE0', 9: 'RE1', 10: 'RE2',
  11: 'VDD', 12: 'VSS', 13: 'OSC1', 14: 'OSC2', 15: 'RC0', 16: 'RC1/CCP2', 17: 'RC2/CCP1', 18: 'RC3', 19: 'RD0', 20: 'RD1',
  21: 'RD2', 22: 'RD3', 23: 'RC4', 24: 'RC5', 25: 'RC6/TX', 26: 'RC7/RX', 27: 'RD4', 28: 'RD5', 29: 'RD6', 30: 'RD7',
  31: 'VSS', 32: 'VDD', 33: 'RB0', 34: 'RB1', 35: 'RB2', 36: 'RB3', 37: 'RB4', 38: 'RB5', 39: 'RB6/PGC', 40: 'RB7/PGD',
};

/** Chân ESP32-S3-DevKitC-1: J1 (22 chân) rồi J2 (22 chân) */
export const ESP_PINS = [
  '3V3', '3V3_2', 'RST', 'G4', 'G5', 'G6', 'G7', 'G15', 'G16', 'G17', 'G18', 'G8', 'G3', 'G46', 'G9', 'G10', 'G11', 'G12', 'G13', 'G14', '5V', 'GND',
  'GND_2', 'TX', 'RX', 'G1', 'G2', 'G42', 'G41', 'G40', 'G39', 'G38', 'G37', 'G36', 'G35', 'G0', 'G45', 'G48', 'G47', 'G21', 'G20', 'G19', 'GND_3', 'GND_4',
];

/**
 * ESP32-S3-DevKitC-1 (miền 3.3 V): chân 5V → LDO trên board → 3V3. Tuyệt đối VDD 3.6 V.
 * GPIO KHÔNG chịu 5 V: 5 V vào GPIO → dòng qua diode kẹp, chân hỏng dần ; 5 V vào chân 3V3 → chết.
 */
export class Esp32S3 extends Mcu {
  static get defaults() { return { program: 'uart' }; }
  _derive() { if (!this.dmg) this.dmg = new Damage(THERMAL.esp32); }
  get roles() {
    if (!this._roles) this._roles = ESP_PINS.map((n) => (n.startsWith('3V3') ? 'vdd' : n.startsWith('GND') ? 'vss' : n === '5V' ? 'v5' : 'io'));
    return this._roles;
  }
  get cfg() { return { rOut: 30, rCl: 50, vClamp: 3.8, rClamp: 0.15, gCore: 1 / 41, iPin: 0.04, iCl: 0.006, pinLife: 60, quad: false, gRail: 20, iBond: 2.5 }; }
  idx(name) { return ESP_PINS.indexOf(name); }
  stampExtra(S, x, ctx) {
    const n5 = this.nodes[this.idx('5V')];
    if (n5 == null) return;
    S.g(n5, this.vss, 1e-4);
    if (this.ldoDead) { S.g(n5, this.vdd, 2); return; }
    // LDO trên board: nguồn áp vt = min(3.3, V5 − 0.25) giữa vdd–vss, dòng LẤY TỪ chân 5V, giới hạn 0.8 A.
    // Điện áp V5 tức thời nằm trong công thức → mất 5 V là LDO thôi cấp ngay (không "bơm dòng từ hư không").
    const vd = V(x, this.vdd), vs = V(x, this.vss), v5 = V(x, n5);
    const f = (a, d, s0) => this._ldo(a - s0, d - s0);
    const I0 = f(v5, vd, vs), h = 1e-6;
    const dd = [(f(v5 + h, vd, vs) - I0) / h, (f(v5, vd + h, vs) - I0) / h, (f(v5, vd, vs + h) - I0) / h];
    S.nl(n5, this.vdd, I0, [n5, this.vdd, this.vss], dd, [v5, vd, vs]);
  }
  _ldo(v5, vc) {
    const vt = 3.3 - sp(3.3 - (v5 - 0.25), 0.02);
    const u = (vt - vc) / 0.3;
    const a = sp(u, 0.002);
    return a - sp(a - 0.8, 0.02);
  }
  acceptExtra(x) {
    const n5 = this.nodes[this.idx('5V')];
    this.v5 = n5 == null ? null : V(x, n5) - V(x, this.vss);
    if (this.v5 != null && this.v5 > 7 && !this.ldoDead) { this.ldoDead = true; this.dmg.events.push({ type: 'pin', up: true, cause: `LDO trên board chết vì chân 5V nhận ${this.v5.toFixed(1)} V → 3V3 không còn được ổn áp` }); }
  }
  overWhy(v) {
    if (v > 3.7) return `nguồn 3V3 nội = ${v.toFixed(2)} V > 3.6 V tuyệt đối (có ai cấp 5 V vào chân 3V3?) → chip tự đốt ${this.P.toFixed(1)} W`;
    if (v < -0.6) return 'NGƯỢC cực nguồn';
    return '';
  }
  _logic(x, ctx) {
    const v = V(x, this.vdd) - V(x, this.vss);
    const rst = this.pinV(x, this.idx('RST'));
    const n5 = this.nodes[this.idx('5V')];
    const v5 = n5 == null ? 0 : V(x, n5) - V(x, this.vss);
    this.vtLdo = Math.max(0, Math.min(3.3, v5 - 0.25));
    this.ldoOk = v5 > 1.5;
    let why = '';
    if (this.dead) why = '💀 Chip đã chết';
    else if (v < 2.5) why = 'Chưa có nguồn 3.3 V (cấp 5 V vào chân 5V hoặc 3.3 V vào chân 3V3)';
    else if (v < 3.0) why = `3V3 = ${v.toFixed(2)} V thấp → brown-out reset`;
    else if (rst != null && rst < 0.8) why = 'Chân RST/EN bị kéo xuống 0 → chip đang reset';
    else if (v > 3.6) why = `⚠️ 3V3 = ${v.toFixed(2)} V > 3.6 V`;
    const okRun = !why || why.startsWith('⚠️');
    this.upT = okRun ? this.upT + ctx.dt : 0;
    this.running = okRun && this.upT > 0.05;
    const dp = this.deadPins?.length ? ` · ⚠️ hỏng: ${this.deadPins.join(', ')}` : '';
    this.status = (this.running ? (why || `Đang chạy "${this.p.program}"`) : okRun ? 'Đang khởi động…' : why) + dp;
    this.out.fill(-1); this.pull.fill(0);
    this.pull[this.idx('RST')] = 1;                                  // RST có điện trở 10 kΩ kéo lên trên board
    if (!this.running) return;
    const t = ctx.t;
    if (this.p.program === 'uart') { this.out[this.idx('G17')] = 1; this.led = blink(t, 1); }
    else if (this.p.program === 'blink') { this.out[this.idx('G2')] = blink(t, 1); this.led = blink(t, 1); }
    else this.led = 0;
  }
  pinName(i) { return ESP_PINS[i]; }
  _repair() { super._repair(); this.ldoDead = false; }
}

/** Thạch anh: với mô phỏng một chiều/chậm thì gần như hở mạch — chỉ dùng để PIC kiểm tra "có dao động không" */
export class Crystal extends Element {
  stamp(S) { const [a, b] = this.nodes; S.g(a, b, 1e-12); }
}

// ---------------------------------------------------------------- đồng hồ vạn năng
/**
 * Đồng hồ vạn năng: COM = nodes[0], que đỏ = nodes[1].
 *   V: 10 MΩ · mA: shunt 1 Ω + cầu chì 200 mA · A: shunt 0.01 Ω + cầu chì 10 A · Ω: nguồn đo 3 V qua 10 kΩ
 */
export class Meter extends Element {
  static get defaults() { return { mode: 'V' }; }
  _derive() {
    this.fmA ??= new Fuse([null, null], { rating: 0.2 });
    this.fA ??= new Fuse([null, null], { rating: 10 });
    this.dmg ??= new Damage(THERMAL.none);
  }
  get shunt() { return this.p.mode === 'mA' ? 1 + this.fmA.R : this.fA.R + 0.01; }
  get fuse() { return this.p.mode === 'mA' ? this.fmA : this.fA; }
  stamp(S) {
    const [c, p] = this.nodes;
    if (c == null || p == null) return;
    const m = this.p.mode;
    if (m === 'V') S.g(p, c, 1e-7);
    else if (m === 'mA' || m === 'A') S.g(p, c, this.fuse.blown ? 1e-9 : 1 / this.shunt);
    else if (m === 'ohm') S.lin(p, c, 1e-4, -3e-4);
  }
  accept(x, ctx) {
    const [c, p] = this.nodes;
    this.reading = null;
    if (c == null || p == null || this.p.mode === 'off') return;
    const v = V(x, p) - V(x, c);
    const m = this.p.mode;
    if (m === 'V') this.reading = v;
    else if (m === 'mA' || m === 'A') {
      const f = this.fuse;
      const i = f.blown ? 0 : v / this.shunt;
      f.I = i; f.P = i * i * f.R;
      const was = f.blown;
      f.dmg.update(f.P, ctx.dt);
      if (!was && f.blown) { f.blownAt = ctx.t; f.blowI = Math.abs(i); this.blewNow = true; }
      this.reading = i;
    } else if (m === 'ohm') {
      const i = (3 - v) / 1e4;
      this.reading = i > 1e-9 ? v / i : Infinity;
    }
    this.V = v;
  }
  _repair() { this.fmA.repair(); this.fA.repair(); }
}
