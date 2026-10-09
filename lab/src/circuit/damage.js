// =============================================================================
// damage.js — Nhiệt độ & hư hỏng của linh kiện.
//
// Mỗi linh kiện là một "nút nhiệt": C·dT/dt = P − (T − Ta)/Rth
//   P   : công suất tỏa nhiệt (W) do bộ giải tính ra mỗi bước
//   Rth : nhiệt trở ra môi trường (°C/W) — linh kiện nhỏ/không tản nhiệt thì lớn
//   C   : nhiệt dung (J/°C) — linh kiện nhỏ thì nóng rất nhanh
// Nghiệm chính xác trong một bước h (ổn định cả khi h lớn):
//   T(h) = Tss + (T − Tss)·e^(−h/(Rth·C)),  Tss = Ta + P·Rth
//
// Trạng thái: ok → hot (nóng) → smoking (bốc khói) → burning (cháy) → dead (chết: hở mạch hoặc chập)
//             hoặc exploded (nổ: tụ hoá ngược cực / quá áp).
// Khi chết, phần tử đổi mô hình điện (hở hoặc chập) → hư hỏng lan truyền như thật
// (vd PIC chết chập → nguồn bị ngắn mạch → cầu chì đứt).
// =============================================================================

export const AMBIENT = 30;          // °C — phòng ở Việt Nam

export const ST = {
  OK: 'ok', HOT: 'hot', SMOKING: 'smoking', BURNING: 'burning', DEAD: 'dead', EXPLODED: 'exploded',
};
const ORDER = { ok: 0, hot: 1, smoking: 2, burning: 3, dead: 4, exploded: 5 };
export const STATE_VI = {
  ok: 'Bình thường', hot: 'Nóng', smoking: 'Bốc khói', burning: 'Đang cháy', dead: 'Đã chết', exploded: 'Đã nổ',
};

/** Bộ thông số nhiệt/hư hỏng theo loại linh kiện. Nhiệt độ ngưỡng (°C). */
export const THERMAL = {
  resistor:  { Rth: 340, C: 0.025, hot: 100, smoke: 250, burn: 330, dead: 360, mode: 'open', burnTime: 1.5 },
  powerres:  { Rth: 25, C: 3.0, hot: 150, smoke: 300, burn: 380, dead: 420, mode: 'open', burnTime: 3 },
  pot:       { Rth: 150, C: 0.2, hot: 90, smoke: 200, burn: 240, dead: 260, mode: 'open', burnTime: 1 },
  wire:      { Rth: 73, C: 0.08, hot: 70, smoke: 160, burn: 250, dead: 1085, mode: 'open', burnTime: 999 },
  led:       { Rth: 250, C: 0.004, hot: 85, smoke: 140, burn: 1e9, dead: 170, mode: 'open' },
  diode:     { Rth: 70, C: 0.15, hot: 110, smoke: 200, burn: 1e9, dead: 230, mode: 'short' },
  schottky:  { Rth: 40, C: 0.3, hot: 110, smoke: 180, burn: 1e9, dead: 210, mode: 'short' },
  ceramic:   { Rth: 200, C: 0.02, hot: 100, smoke: 200, burn: 1e9, dead: 250, mode: 'short' },
  electro:   { Rth: 40, C: 3, hot: 65, smoke: 90, burn: 1e9, dead: 105, mode: 'open', explode: true },
  inductor:  { Rth: 30, C: 1, hot: 100, smoke: 180, burn: 1e9, dead: 220, mode: 'open' },
  to220:     { Rth: 62, C: 1.0, hot: 100, smoke: 200, burn: 260, dead: 280, mode: 'short', burnTime: 2 },
  sot23:     { Rth: 350, C: 0.01, hot: 100, smoke: 170, burn: 1e9, dead: 200, mode: 'short' },
  motor:     { Rth: 8, C: 12, hot: 80, smoke: 160, burn: 220, dead: 240, mode: 'short', burnTime: 4 },
  buck:      { Rth: 20, C: 0.3, hot: 90, smoke: 200, burn: 1e9, dead: 230, mode: 'short' },
  ldo:       { Rth: 60, C: 1.0, hot: 90, smoke: 220, burn: 1e9, dead: 250, mode: 'short' },
  drv:       { Rth: 65, C: 0.35, hot: 90, smoke: 220, burn: 1e9, dead: 250, mode: 'short' },
  pic:       { Rth: 47, C: 0.15, hot: 85, smoke: 150, burn: 200, dead: 220, mode: 'short', burnTime: 0.3 },
  esp32:     { Rth: 30, C: 0.3, hot: 85, smoke: 150, burn: 1e9, dead: 200, mode: 'short' },
  pack:      { Rth: 5, C: 180, hot: 60, smoke: 100, burn: 150, dead: 200, mode: 'open', burnTime: 20 },
  bat9v:     { Rth: 25, C: 40, hot: 60, smoke: 100, burn: 1e9, dead: 140, mode: 'open' },
  switch:    { Rth: 100, C: 0.05, hot: 80, smoke: 150, burn: 1e9, dead: 200, mode: 'open' },
  none:      { Rth: 50, C: 1, hot: 1e9, smoke: 1e9, burn: 1e9, dead: 1e9, mode: 'open' },
};

export class Damage {
  /** opts: một mục trong THERMAL (có thể ghi đè từng trường) */
  constructor(opts = THERMAL.none) {
    this.o = { ...opts };
    this.events = [];
    this.reset();
  }
  reset() {
    this.T = AMBIENT;
    this.Tmax = AMBIENT;
    this.state = ST.OK;
    this.deadMode = null;     // 'open' | 'short' | khác (tuỳ phần tử)
    this.cause = '';
    this.burnT = 0;
    this.events.length = 0;
  }
  get dead() { return this.state === ST.DEAD || this.state === ST.EXPLODED; }
  get level() { return ORDER[this.state]; }
  _set(s, cause) {
    if (s === this.state) return;
    const up = ORDER[s] > ORDER[this.state];
    this.state = s;
    if (cause) this.cause = cause;
    this.events.push({ type: s, up, cause: this.cause, T: this.T });
  }
  /** Linh kiện chết ngay (quá áp đánh thủng, đứt dây bond…) */
  kill(mode, cause, explode = false) {
    if (this.dead) return;
    this.deadMode = mode || this.o.mode;
    this._set(explode ? ST.EXPLODED : ST.DEAD, cause);
  }
  /** Tích phân nhiệt độ một bước h với công suất P (W). why = lời giải thích nguyên nhân khi nóng */
  update(P, h, why = '') {
    const o = this.o;
    const tau = o.Rth * o.C;
    const Tss = AMBIENT + Math.max(0, P) * o.Rth;
    this.T = Tss + (this.T - Tss) * Math.exp(-h / tau);
    if (this.T > this.Tmax) this.Tmax = this.T;
    if (this.dead) return;
    const T = this.T;
    if (T >= o.dead) { this.kill(o.mode, why || `quá nhiệt ${T.toFixed(0)} °C`, !!o.explode); return; }
    if (T >= o.burn) {
      this.burnT += h;
      this._set(ST.BURNING, why);
      if (this.burnT > (o.burnTime ?? 2)) this.kill(o.mode, why || 'cháy');
      return;
    }
    // trạng thái có trễ nhỏ để không nhấp nháy
    const hy = 3;
    if (T >= o.smoke) this._set(ST.SMOKING, why);
    else if (T >= o.hot) { if (this.state === ST.OK || T < o.smoke - hy) this._set(ST.HOT, why); }
    else if (T < o.hot - hy) this._set(ST.OK);
  }
  /** Mức "đỏ rực" 0..1 cho hiệu ứng nóng */
  glow() { return Math.max(0, Math.min(1, (this.T - 90) / 360)); }
}
