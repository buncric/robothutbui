// =============================================================================
// quests/_circuit-ext.js — [nhiệm vụ] Phần mở rộng NHỎ cho bộ giải mạch của game (minigames/power.js + src/circuit),
// cần cho các nhiệm vụ M2–M6. Cài một lần: installCircuitExt(game) (idempotent, không sửa file của người khác):
//
//  1) IC 74HC32 (4 cổng OR, item 'sn74hc32n') thành PHẦN TỬ THẬT trong bộ giải: Y = A OR B, ngưỡng CMOS 0.5·VCC (trễ ±0.1·VCC),
//     ngõ ra đẩy-kéo ~50 Ω về VCC (chân 14) / GND (chân 7); VCC < 2 V → ngõ ra thả nổi. Nhờ vậy dây PWM / DIR / nDIR từ PIC
//     qua 74HC32 tới IN1/IN2 của DRV8871 được mô phỏng đúng như docs/01 (phanh 2 chiều).
//  2) "Nhà cung cấp phần tử" (part providers): item không có trong partSpecOf của power.js vẫn góp phần tử vào mạch —
//     vd. cuộn dây động cơ bánh xe trong xác robot (đo Ω ≈ 7 Ω giữa M+/M−). addPartProvider(game, fn(game, R) → parts[]).
//     Cài bằng cách bọc game.power.spec(): gọi bản gốc với all:true, thêm phần tử, rồi LỌC LIÊN THÔNG lại y như bản gốc.
//  3) Chương trình PIC: 'blink' nháy nhanh 3 lần lúc khởi động rồi 1 Hz (đúng firmware/pic16f877a_ccs/README.md bước 1);
//     'motor-test:fwd|rev|stop' = lệnh thử DRV:100,100 / DRV:-100,-100 / DRV:0,0 qua 74HC32 (PWM RC2/RC1, DIR RD0/RD2, nDIR RD1/RD3).
// =============================================================================
import { LIB } from '../../circuit/library.js';
import { Element, Pic16F877A } from '../../circuit/elements.js';
import { UF, pk } from '../minigames/netlist.js';

const V = (x, n) => (n > 0 ? x[n - 1] : 0);
const GATES = [[1, 2, 3], [4, 5, 6], [9, 10, 8], [12, 13, 11]];      // [A, B, Y] theo chân DIP-14

/** 74HC32 hành vi: 4 cổng OR */
export class Hc32Or extends Element {
  static get defaults() { return { rOut: 50 }; }
  _derive() { this.q ??= [0, 0, 0, 0]; this.inHi ??= new Array(8).fill(false); this.vcc ??= 0; }
  begin(x, ctx) {
    const n = this.nodes, g = n[6], vc = n[13];
    const vg = V(x, g), vcc = vc == null || g == null ? 0 : V(x, vc) - vg;
    this.vcc = vcc;
    const on = vcc > 2;
    let changed = false;
    GATES.forEach(([a, b], k) => {
      const lvl = (pin, i) => {
        const node = n[pin - 1];
        if (node == null || !on) { this.inHi[i] = false; return false; }
        const v = V(x, node) - vg;
        this.inHi[i] = this.inHi[i] ? v > 0.4 * vcc : v > 0.6 * vcc;
        return this.inHi[i];
      };
      const y = on && (lvl(a, 2 * k) | lvl(b, 2 * k + 1)) ? 1 : on ? 0 : -1;
      if (y !== this.q[k]) { this.q[k] = y; changed = true; }
    });
    if (changed) ctx.circuit.wantRefine = true;
  }
  stamp(S) {
    const n = this.nodes, g = n[6], vc = n[13];
    if (g == null || vc == null) return;
    S.g(vc, g, 1e-5);                                       // dòng tĩnh (~0.5 mA ở 5 V)
    GATES.forEach(([a, b, y], k) => {
      for (const p of [a, b]) if (n[p - 1] != null) S.g(n[p - 1], g, 1e-9);   // ngõ vào CMOS trở kháng rất cao
      const yo = n[y - 1];
      if (yo == null || this.q[k] < 0) return;
      S.g(yo, this.q[k] ? vc : g, 1 / this.p.rOut);
    });
  }
  accept(x) {
    const n = this.nodes;
    this.V = this.vcc;
    this.I = n[13] != null ? (V(x, n[13]) - V(x, n[6])) * 1e-5 : 0;
    this.P = 0;
    this.out = GATES.map((_, k) => this.q[k]);
  }
}

/** Chương trình PIC thêm (bọc _logic gốc, không đổi các chương trình sẵn có) */
function patchPic() {
  const proto = Pic16F877A.prototype;
  if (proto._questPatched) return;
  const orig = proto._logic;
  proto._logic = function patched(x, ctx) {
    // nạp chương trình mới → PICkit nhả MCLR → chip RESET (PWRT 72 ms) rồi chạy lại từ đầu
    const base = String(this.p.program || '').split(':')[0];      // 'motor-test:fwd' → 'motor-test' (lệnh UART không reset chip)
    if (this._progSeen !== undefined && this._progSeen !== base) this.upT = 0;
    this._progSeen = base;
    orig.call(this, x, ctx);
    if (!this.running) return;
    const prog = String(this.p.program || '');
    const set = (pin, v) => { this.out[pin - 1] = v; };
    if (prog === 'blink' && this.upT < 0.82) set(30, Math.floor(this.upT * 8) % 2 === 0 ? 1 : 0);   // 3 nháy nhanh khi khởi động
    if (prog.startsWith('motor-test')) {
      const cmd = prog.split(':')[1] || 'stop';
      const t = ctx.t;
      set(30, Math.floor(t * (cmd === 'stop' ? 2 : 4)) % 2 === 0 ? 1 : 0);
      // docs/01: duty thanh ghi = 1000 − tốc độ → tốc độ 100 % = PWM luôn THẤP; dừng = PWM CAO (phanh)
      const pwm = cmd === 'stop' ? 1 : 0, dir = cmd === 'rev' ? 1 : 0;
      set(17, pwm); set(19, dir); set(20, 1 - dir);          // trái: RC2/CCP1, RD0 = DIR, RD1 = nDIR
      set(16, pwm); set(21, dir); set(22, 1 - dir);          // phải: RC1/CCP2, RD2 = DIR, RD3 = nDIR
    }
  };
  proto._questPatched = true;
}

const isLiveItem = (it) => !!it && !it.inBag && !it.isHotbarTool && it.def?.kind !== 'tool' && (!!it.object?.parent || !!it.state?.cable?.laid);

/** Phần tử 74HC32 cho mọi IC sn74hc32n đang nằm trong thế giới */
function hc32Provider(game, R) {
  const out = [];
  for (const it of game.items.all) {
    if (!isLiveItem(it) || !/74hc32/i.test(it.def.id) || it.state?.dead) continue;
    const pins = {};
    for (let i = 1; i <= 14; i++) pins[String(i)] = R(pk(it.uid, String(i)));
    out.push({ uid: it.uid, type: 'hc32', props: {}, label: it.def.name, pins, item: it });
  }
  return out;
}

export function addPartProvider(game, fn) {
  installCircuitExt(game);
  if (!game.circuitExt.providers.includes(fn)) game.circuitExt.providers.push(fn);
  game.power && (game.power.specKey = '');
}

/** Cài các phần mở rộng (gọi nhiều lần vô hại) */
export function installCircuitExt(game) {
  if (game.circuitExt) return game.circuitExt;
  if (!LIB.hc32) {
    LIB.hc32 = { pins: Array.from({ length: 14 }, (_, i) => String(i + 1)), optional: true, make: (B) => B.add('or', Hc32Or, Array.from({ length: 14 }, (_, i) => B.n(String(i + 1))), {}) };
  }
  patchPic();
  const ext = (game.circuitExt = { providers: [hc32Provider] });
  const P = game.power;
  if (!P || P._questSpecWrapped) return ext;
  const orig = P.spec.bind(P);
  P._questSpecWrapped = true;
  P.spec = (opts = {}) => {
    const N = game.netlist.get();
    const R = (k) => N.uf.find(k);
    let extra = [];
    for (const f of ext.providers) { try { extra = extra.concat(f(game, R) || []); } catch (e) { console.warn('[circuit-ext] provider lỗi', e); } }
    if (!extra.length) return orig(opts);
    const base = orig({ ...opts, all: true });
    const parts = [...base.parts, ...extra];
    // lọc liên thông — giống PowerSim.spec(): chỉ giữ phần mạch nối với nguồn (hoặc với opts.roots khi đo Ω)
    const comp = new UF();
    for (const p of parts) { const v = Object.values(p.pins); for (let i = 1; i < v.length; i++) comp.union(v[0], v[i]); }
    for (const w of base.wires) comp.union(w.a, w.b);
    const srcRoots = [];
    for (const p of parts) if (p.source) srcRoots.push(...Object.values(p.pins));
    const keep = new Set();
    for (const r of (opts.roots || [...srcRoots, ...(opts.extraRoots || [])])) if (r) keep.add(comp.find(r));
    const inKeep = (k) => opts.all || keep.has(comp.find(k));
    // phần tử thêm của linh kiện nằm lẻ (mọi chân chỉ có chính nó) thì bỏ — tránh nút treo
    return {
      ...base,
      parts: parts.filter((p) => inKeep(Object.values(p.pins)[0])),
      wires: base.wires.filter((w) => inKeep(w.a)),
    };
  };
  P.specKey = '';
  return ext;
}
