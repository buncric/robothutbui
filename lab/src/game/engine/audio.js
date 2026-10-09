// =============================================================================
// audio.js — Âm thanh TỔNG HỢP bằng WebAudio (không cần file âm thanh).
//
//   audio.unlock()                               gọi trong sự kiện bấm của người dùng (trình duyệt bắt buộc)
//   audio.play('snap', { pos, vol, rate })       pos: Vector3 | [x,y,z] | Object3D (mm) → âm lượng theo khoảng cách + trái/phải
//   const h = audio.play('motor', { loop:true, pos: obj });  h.setRate(1.5); h.setVol(0.5); h.stop(0.2);
//   audio.setVolume(0..1)
//
// Âm có sẵn: click, snap, sizzle (hàn), hiss (nhựa thông), zap (tia lửa), pop (nổ tụ), beep (thông mạch),
//            motor (vòng lặp, chỉnh tốc), whoosh, footstep, pickup, place, drop, ui, toast, quest, error, buzz, tick
// Node / trình duyệt không hỗ trợ → mọi hàm là no-op, play() trả về handle rỗng.
// =============================================================================
import * as THREE from 'three';

const NOOP_HANDLE = Object.freeze({ stop() {}, setRate() {}, setVol() {}, setPos() {}, playing: false });

export class Audio {
  constructor(game = {}) {
    this.game = game;
    this.ctx = null;
    this.master = null;
    this.volume = game.quality?.settings?.volume ?? 0.8;
    const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
    this.supported = !!AC;
    this._AC = AC;
    this._loops = new Set();       // các âm lặp đang chạy (cập nhật vị trí mỗi khung)
    this._v = new THREE.Vector3();
    this._camPos = new THREE.Vector3();
    this._camRight = new THREE.Vector3();
    this._lastPlay = new Map();    // chống phát trùng cùng lúc quá dày
  }

  /** Tạo / đánh thức AudioContext — phải gọi trong sự kiện người dùng (click, phím) */
  unlock() {
    if (!this.supported) return;
    try {
      if (!this.ctx) {
        this.ctx = new this._AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        // nén nhẹ để tiếng nổ không bị vỡ
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14; comp.ratio.value = 4;
        this.master.connect(comp).connect(this.ctx.destination);
        this._noise = this._makeNoise(1.5, false);
        this._crackle = this._makeNoise(2.5, true);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { console.warn('[audio] không khởi tạo được WebAudio', e); this.supported = false; }
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  suspend(on) {
    if (!this.ctx) return;
    try { on ? this.ctx.suspend() : this.ctx.resume(); } catch { /* bỏ qua */ }
  }

  get ready() { return !!(this.ctx && this.ctx.state === 'running'); }

  // ---------------------------------------------------------------------------
  _makeNoise(seconds, crackle) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let env = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (crackle) {
        // tiếng lách tách: nhiễu nền nhỏ + các xung nổ lép bép ngẫu nhiên
        if (Math.random() < 0.0009) env = 0.6 + Math.random() * 0.4;
        env *= 0.9965;
        d[i] = w * (0.12 + env);
      } else d[i] = w;
    }
    return buf;
  }

  /** Vị trí → [độ lớn theo khoảng cách, pan trái/phải] */
  _spatial(pos) {
    if (!pos) return [1, 0];
    const cam = this.game.camera;
    if (!cam) return [1, 0];
    const p = this._v;
    if (pos.isObject3D) pos.getWorldPosition(p);
    else if (Array.isArray(pos)) p.set(pos[0], pos[1], pos[2]);
    else p.copy(pos);
    cam.getWorldPosition(this._camPos);
    const d = p.distanceTo(this._camPos);
    const gain = 1 / (1 + Math.pow(Math.max(0, d - 300) / 1400, 1.6));
    this._camRight.set(1, 0, 0).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
    p.sub(this._camPos);
    const pan = d > 1 ? THREE.MathUtils.clamp(p.dot(this._camRight) / d, -1, 1) * 0.8 : 0;
    return [gain, pan];
  }

  /**
   * Phát một âm.
   * @param {string} name
   * @param {{pos?, vol?:number, rate?:number, loop?:boolean, duration?:number}} o
   */
  play(name, o = {}) {
    if (!this.ctx || this.ctx.state === 'closed') return NOOP_HANDLE;
    const synth = SYNTHS[name];
    if (!synth) { console.warn('[audio] không có âm', name); return NOOP_HANDLE; }
    // chống "súng máy": cùng âm không lặp lại trong 25 ms
    const now = this.ctx.currentTime;
    if (!o.loop && (this._lastPlay.get(name) ?? -1) > now - 0.025) return NOOP_HANDLE;
    this._lastPlay.set(name, now);
    try {
      const ctx = this.ctx;
      const out = ctx.createGain();
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      const [g, p] = this._spatial(o.pos);
      const vol = o.vol ?? 1;
      out.gain.value = vol * g;
      if (pan) { pan.pan.value = p; out.connect(pan).connect(this.master); } else out.connect(this.master);
      const voice = synth(this, ctx, out, { rate: 1, ...o }) || {};
      const handle = {
        playing: true,
        pos: o.pos || null,
        vol,
        stop: (fade = 0.08) => {
          if (!handle.playing) return;
          handle.playing = false;
          this._loops.delete(handle);
          const t = ctx.currentTime;
          out.gain.cancelScheduledValues(t);
          out.gain.setValueAtTime(out.gain.value, t);
          out.gain.linearRampToValueAtTime(0, t + fade);
          setTimeout(() => { try { voice.stop?.(); out.disconnect(); pan?.disconnect(); } catch { /* đã dừng */ } }, fade * 1000 + 60);
        },
        setRate: (r) => voice.setRate?.(r),
        setVol: (v) => { handle.vol = v; },
        setPos: (pp) => { handle.pos = pp; },
        _out: out, _pan: pan,
      };
      if (o.loop) this._loops.add(handle);
      else setTimeout(() => { handle.playing = false; try { out.disconnect(); pan?.disconnect(); } catch { /* */ } }, ((voice.duration ?? 1.5) + 0.3) * 1000);
      return handle;
    } catch (e) {
      console.warn('[audio] lỗi phát', name, e);
      return NOOP_HANDLE;
    }
  }

  /** Gọi mỗi khung: cập nhật âm lượng/pan của các âm lặp theo vị trí người nghe */
  update() {
    if (!this.ctx || !this._loops.size) return;
    const t = this.ctx.currentTime;
    for (const h of this._loops) {
      const [g, p] = this._spatial(h.pos);
      h._out.gain.setTargetAtTime(h.vol * g, t, 0.05);
      if (h._pan) h._pan.pan.setTargetAtTime(p, t, 0.05);
    }
  }

  stopAll() { for (const h of [...this._loops]) h.stop(0.05); }
}

// -----------------------------------------------------------------------------
// Bộ tổng hợp từng âm: (audio, ctx, out, o) → { stop?, setRate?, duration }
// -----------------------------------------------------------------------------
function env(ctx, node, t0, a, peak, d, end = 0.0001) {
  const g = node.gain;
  g.setValueAtTime(0.0001, t0);
  g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + a);
  g.exponentialRampToValueAtTime(end, t0 + a + d);
}

function osc(ctx, type, freq, out) {
  const o = ctx.createOscillator();
  o.type = type; o.frequency.value = freq;
  o.connect(out);
  return o;
}

function noiseSrc(audio, ctx, out, { crackle = false, loop = false, rate = 1 } = {}) {
  const s = ctx.createBufferSource();
  s.buffer = crackle ? audio._crackle : audio._noise;
  s.loop = loop;
  s.playbackRate.value = rate;
  s.loopStart = 0;
  s.connect(out);
  return s;
}

function filter(ctx, type, freq, q = 1) {
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  return f;
}

/** Một tiếng ngắn dạng nhiễu lọc */
function noiseHit(audio, ctx, out, { type = 'bandpass', freq = 2000, q = 1, a = 0.002, d = 0.08, peak = 0.8, t = 0 }) {
  const t0 = ctx.currentTime + t;
  const g = ctx.createGain();
  const f = filter(ctx, type, freq, q);
  f.connect(g).connect(out);
  const s = noiseSrc(audio, ctx, f, { rate: 0.8 + Math.random() * 0.4 });
  s.start(t0, Math.random() * 0.5);
  env(ctx, g, t0, a, peak, d);
  s.stop(t0 + a + d + 0.05);
  return t + a + d;
}

/** Một tiếng ngắn dạng sóng */
function tone(ctx, out, { type = 'sine', f0 = 440, f1 = null, a = 0.003, d = 0.1, peak = 0.5, t = 0 }) {
  const t0 = ctx.currentTime + t;
  const g = ctx.createGain();
  g.connect(out);
  const o = osc(ctx, type, f0, g);
  if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + a + d);
  o.start(t0);
  env(ctx, g, t0, a, peak, d);
  o.stop(t0 + a + d + 0.05);
  return t + a + d;
}

const SYNTHS = {
  click(audio, ctx, out) {
    tone(ctx, out, { type: 'square', f0: 2200, f1: 1400, d: 0.018, peak: 0.18 });
    noiseHit(audio, ctx, out, { freq: 5000, d: 0.02, peak: 0.3 });
    return { duration: 0.05 };
  },
  ui(audio, ctx, out) { tone(ctx, out, { type: 'triangle', f0: 1650, f1: 1900, d: 0.04, peak: 0.12 }); return { duration: 0.06 }; },
  tick(audio, ctx, out) { tone(ctx, out, { type: 'square', f0: 3200, d: 0.008, peak: 0.08 }); return { duration: 0.02 }; },
  snap(audio, ctx, out) {
    // "tách" của chân cắm vào đế: tiếng nhựa sắc + thịch trầm
    noiseHit(audio, ctx, out, { type: 'highpass', freq: 2500, d: 0.03, peak: 0.9 });
    tone(ctx, out, { type: 'sine', f0: 240, f1: 110, d: 0.07, peak: 0.6 });
    noiseHit(audio, ctx, out, { freq: 1200, q: 4, d: 0.025, peak: 0.4, t: 0.012 });
    return { duration: 0.15 };
  },
  pickup(audio, ctx, out) {
    noiseHit(audio, ctx, out, { freq: 3000, d: 0.02, peak: 0.25 });
    tone(ctx, out, { type: 'sine', f0: 520, f1: 760, d: 0.06, peak: 0.12 });
    return { duration: 0.1 };
  },
  place(audio, ctx, out) {
    tone(ctx, out, { type: 'sine', f0: 180, f1: 90, d: 0.07, peak: 0.45 });
    noiseHit(audio, ctx, out, { type: 'lowpass', freq: 1800, d: 0.04, peak: 0.35 });
    return { duration: 0.12 };
  },
  drop(audio, ctx, out, o) {
    const k = Math.min(1.5, o.rate || 1);
    tone(ctx, out, { type: 'sine', f0: 140 * k, f1: 60, d: 0.12, peak: 0.6 });
    noiseHit(audio, ctx, out, { type: 'lowpass', freq: 2200, d: 0.06, peak: 0.5 });
    noiseHit(audio, ctx, out, { freq: 3500, q: 3, d: 0.03, peak: 0.25, t: 0.05 });
    return { duration: 0.2 };
  },
  footstep(audio, ctx, out, o) {
    const v = 0.85 + Math.random() * 0.3;
    tone(ctx, out, { type: 'sine', f0: 85 * v, f1: 45, d: 0.09, peak: 0.35 });
    noiseHit(audio, ctx, out, { type: 'lowpass', freq: 700 * v * (o.rate || 1), d: 0.07, peak: 0.28 });
    noiseHit(audio, ctx, out, { type: 'bandpass', freq: 2600 * v, q: 2, d: 0.03, peak: 0.06, t: 0.02 });
    return { duration: 0.15 };
  },
  whoosh(audio, ctx, out) {
    const t0 = ctx.currentTime;
    const f = filter(ctx, 'bandpass', 400, 1.2);
    const g = ctx.createGain();
    f.connect(g).connect(out);
    const s = noiseSrc(audio, ctx, f);
    f.frequency.setValueAtTime(350, t0);
    f.frequency.exponentialRampToValueAtTime(2200, t0 + 0.15);
    f.frequency.exponentialRampToValueAtTime(500, t0 + 0.35);
    env(ctx, g, t0, 0.08, 0.35, 0.28);
    s.start(t0); s.stop(t0 + 0.45);
    return { duration: 0.45 };
  },
  hiss(audio, ctx, out, o) {
    const t0 = ctx.currentTime, dur = o.duration ?? 0.9;
    const f = filter(ctx, 'highpass', 3500, 0.7);
    const g = ctx.createGain();
    f.connect(g).connect(out);
    const s = noiseSrc(audio, ctx, f, { loop: true });
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.start(t0); s.stop(t0 + dur + 0.05);
    return { duration: dur };
  },
  sizzle(audio, ctx, out, o) {
    // tiếng xèo xèo của mũi hàn chạm thiếc/nhựa thông — vòng lặp lách tách
    const t0 = ctx.currentTime;
    const f = filter(ctx, 'bandpass', 4200, 0.8);
    const f2 = filter(ctx, 'highpass', 1500, 0.5);
    const g = ctx.createGain();
    f.connect(f2).connect(g).connect(out);
    const s = noiseSrc(audio, ctx, f, { crackle: true, loop: true });
    s.start(t0, Math.random() * 2);
    if (o.loop) {
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.7, t0 + 0.06);
      return { stop: () => s.stop(), setRate: (r) => (s.playbackRate.value = r), duration: 1e9 };
    }
    const dur = o.duration ?? 0.6;
    env(ctx, g, t0, 0.03, 0.7, dur);
    s.stop(t0 + dur + 0.1);
    return { duration: dur };
  },
  zap(audio, ctx, out) {
    const t0 = ctx.currentTime;
    const g = ctx.createGain();
    g.connect(out);
    const o1 = osc(ctx, 'sawtooth', 90, g);
    o1.frequency.setValueAtTime(90, t0);
    o1.frequency.exponentialRampToValueAtTime(1800, t0 + 0.05);
    o1.frequency.exponentialRampToValueAtTime(140, t0 + 0.14);
    env(ctx, g, t0, 0.002, 0.35, 0.14);
    o1.start(t0); o1.stop(t0 + 0.2);
    noiseHit(audio, ctx, out, { type: 'highpass', freq: 2000, d: 0.12, peak: 0.9 });
    noiseHit(audio, ctx, out, { type: 'highpass', freq: 3000, d: 0.05, peak: 0.6, t: 0.07 });
    return { duration: 0.25 };
  },
  pop(audio, ctx, out) {
    // nổ tụ: bùm trầm + tiếng vỡ + xì
    noiseHit(audio, ctx, out, { type: 'lowpass', freq: 900, a: 0.001, d: 0.35, peak: 1 });
    tone(ctx, out, { type: 'sine', f0: 110, f1: 35, d: 0.3, peak: 0.9 });
    noiseHit(audio, ctx, out, { type: 'highpass', freq: 2500, d: 0.08, peak: 0.6, t: 0.01 });
    SYNTHS.hiss(audio, ctx, out, { duration: 1.2 });
    return { duration: 1.3 };
  },
  beep(audio, ctx, out, o) {
    const t0 = ctx.currentTime;
    const g = ctx.createGain();
    g.connect(out);
    const o1 = osc(ctx, 'sine', o.freq || 2730, g);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.005);
    o1.start(t0);
    if (o.loop) return { stop: () => o1.stop(), setRate: (r) => (o1.frequency.value = (o.freq || 2730) * r), duration: 1e9 };
    const dur = o.duration ?? 0.12;
    g.gain.setValueAtTime(0.22, t0 + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.01);
    o1.stop(t0 + dur + 0.03);
    return { duration: dur };
  },
  buzz(audio, ctx, out, o) {
    const dur = o.duration ?? 0.25;
    tone(ctx, out, { type: 'square', f0: 140, d: dur, peak: 0.12 });
    tone(ctx, out, { type: 'square', f0: 147, d: dur, peak: 0.1 });
    return { duration: dur };
  },
  motor(audio, ctx, out, o) {
    // động cơ DC: răng cưa + vuông tần số thấp, lọc thông thấp, rung nhẹ — đổi tốc bằng setRate
    const t0 = ctx.currentTime;
    const g = ctx.createGain();
    const f = filter(ctx, 'lowpass', 900, 2);
    f.connect(g).connect(out);
    const base = o.freq || 110;
    const a = osc(ctx, 'sawtooth', base, f);
    const b = osc(ctx, 'square', base * 0.5, f);
    const lfo = osc(ctx, 'sine', 7, ctx.createGain());
    const lfoGain = lfo.context.createGain(); lfoGain.gain.value = 4;
    lfo.disconnect(); lfo.connect(lfoGain).connect(a.frequency);
    const nz = noiseSrc(audio, ctx, filter(ctx, 'bandpass', 3000, 1), { loop: true });
    const nzg = ctx.createGain(); nzg.gain.value = 0.04;
    nz.disconnect(); const nf = filter(ctx, 'bandpass', 3000, 1); nz.connect(nf).connect(nzg).connect(g);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.2);
    for (const s of [a, b, lfo, nz]) s.start(t0);
    const setRate = (r) => {
      const t = ctx.currentTime;
      a.frequency.setTargetAtTime(base * r, t, 0.08);
      b.frequency.setTargetAtTime(base * 0.5 * r, t, 0.08);
      f.frequency.setTargetAtTime(600 + 700 * r, t, 0.08);
    };
    setRate(o.rate || 1);
    if (!o.loop) {
      const dur = o.duration ?? 1;
      g.gain.setValueAtTime(0.25, t0 + dur);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.25);
      for (const s of [a, b, lfo, nz]) s.stop(t0 + dur + 0.3);
      return { duration: dur + 0.3 };
    }
    return { stop: () => { for (const s of [a, b, lfo, nz]) s.stop(); }, setRate, duration: 1e9 };
  },
  toast(audio, ctx, out) {
    tone(ctx, out, { type: 'sine', f0: 880, d: 0.09, peak: 0.12 });
    tone(ctx, out, { type: 'sine', f0: 1320, d: 0.14, peak: 0.1, t: 0.07 });
    return { duration: 0.25 };
  },
  quest(audio, ctx, out) {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(ctx, out, { type: 'triangle', f0: f, d: 0.35, peak: 0.16, t: i * 0.09 }));
    return { duration: 0.75 };
  },
  error(audio, ctx, out) {
    tone(ctx, out, { type: 'square', f0: 220, d: 0.09, peak: 0.1 });
    tone(ctx, out, { type: 'square', f0: 165, d: 0.14, peak: 0.1, t: 0.1 });
    return { duration: 0.3 };
  },
};

export const SOUND_NAMES = Object.keys(SYNTHS);
