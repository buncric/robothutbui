// Máy hiện sóng ảo: vẽ nhiều kênh tín hiệu theo thời gian trên <canvas>.
// Linh kiện khai báo kênh: scope: { channels: [{ name, unit, min, max, color }], window: 2, note }
// rồi mỗi khung hình trả về mảng giá trị cùng thứ tự kênh.

const DEFAULT_COLORS = ['#ffd34d', '#4cc2ff', '#ff6b9a', '#3fcf8e'];

export class Scope {
  constructor(canvas, noteEl) {
    this.canvas = canvas;
    this.noteEl = noteEl;
    this.ctx = canvas.getContext('2d');
    this.setup(null);
    new ResizeObserver(() => this._resize()).observe(canvas);
    this._resize();
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = Math.max(10, this.canvas.clientWidth * dpr);
    this.canvas.height = Math.max(10, this.canvas.clientHeight * dpr);
    this.dpr = dpr;
    this.draw();
  }

  setup(cfg) {
    this.cfg = cfg;
    this.window = cfg?.window ?? 2;          // giây hiển thị
    this.samples = [];                       // [t, [v...]]
    this.t = 0;
    if (this.noteEl) this.noteEl.textContent = cfg?.note ?? (cfg ? '' : '— linh kiện này không có tín hiệu');
    this.draw();
  }

  push(dt, values) {
    if (!this.cfg || !values) return;
    this.t += dt;
    this.samples.push([this.t, values]);
    const t0 = this.t - this.window;
    while (this.samples.length && this.samples[0][0] < t0) this.samples.shift();
  }

  draw() {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height, d = this.dpr || 1;
    ctx.fillStyle = '#05080b';
    ctx.fillRect(0, 0, W, H);
    // lưới
    ctx.strokeStyle = 'rgba(80,110,90,0.35)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) { const x = (W * i) / 10; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let i = 1; i < 6; i++) { const y = (H * i) / 6; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    if (!this.cfg) return;
    const chans = this.cfg.channels;
    const n = chans.length;
    const laneH = H / n;
    chans.forEach((ch, k) => {
      const color = ch.color || DEFAULT_COLORS[k % DEFAULT_COLORS.length];
      const top = laneH * k + 6 * d, bot = laneH * (k + 1) - 6 * d;
      const yOf = (v) => bot - ((v - ch.min) / (ch.max - ch.min || 1)) * (bot - top);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6 * d;
      ctx.beginPath();
      let first = true;
      const t0 = this.t - this.window;
      for (const [t, vals] of this.samples) {
        const x = ((t - t0) / this.window) * W;
        const y = yOf(Math.max(ch.min, Math.min(ch.max, vals[k])));
        if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      const last = this.samples.length ? this.samples[this.samples.length - 1][1][k] : 0;
      ctx.fillStyle = color;
      ctx.font = `${11 * d}px ui-monospace, monospace`;
      ctx.fillText(`${ch.name}: ${fmt(last)} ${ch.unit || ''}`, 6 * d, top + 10 * d);
      ctx.fillStyle = 'rgba(200,210,220,0.5)';
      ctx.fillText(`${fmt(ch.max)}`, W - 44 * d, top + 10 * d);
      ctx.fillText(`${fmt(ch.min)}`, W - 44 * d, bot);
    });
  }
}

export function fmt(v) {
  if (v === undefined || v === null || Number.isNaN(v)) return '–';
  const a = Math.abs(v);
  if (a >= 1000) return v.toFixed(0);
  if (a >= 100) return v.toFixed(1);
  if (a >= 10) return v.toFixed(2);
  return v.toFixed(3);
}
