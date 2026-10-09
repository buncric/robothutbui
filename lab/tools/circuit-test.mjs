// Kiểm thử bộ giải mạch (không cần trình duyệt):   node tools/circuit-test.mjs
// Mỗi bài dựng một mạch nhỏ bằng phần tử của src/circuit/elements.js, chạy theo thời gian và so với số liệu thật.
import { Circuit } from '../src/circuit/solver.js';
import {
  Resistor, VSource, Battery, Pack4S, BenchSupply, Capacitor, Electrolytic, Diode, Led, Nmos, Motor, Buck,
  Fuse, Wire, Pic16F877A, Esp32S3, ESP_PINS, Drv8871, Meter, Ldo, Crystal,
} from '../src/circuit/elements.js';
import { buildCircuit } from '../src/circuit/netlist.js';

let pass = 0, fail = 0;
const results = [];
function check(name, cond, detail) {
  (cond ? pass++ : fail++);
  results.push(`${cond ? '✓' : '✗'} ${name}${detail ? '  — ' + detail : ''}`);
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const f = (v, d = 3) => (typeof v === 'number' ? v.toFixed(d) : String(v));

// 1) Phân áp: nguồn lý tưởng 10 V, 2 × 10 kΩ
{
  const c = new Circuit();
  const a = c.node('a'), m = c.node('m');
  c.add(new VSource([a, 0], { V: 10 }));
  c.add(new Resistor([a, m], { R: 10000 }));
  c.add(new Resistor([m, 0], { R: 10000 }));
  c.step(1e-4);
  check('Phân áp 10 V / (10k + 10k) = 5 V', near(c.v(m), 5, 1e-4), `V = ${f(c.v(m), 5)} V`);
  // phân áp 33k/10k đo pin 16.8 V (dùng pin 4S thật, có điện trở trong)
  const c2 = new Circuit();
  const p = c2.node('p'), an = c2.node('an');
  c2.add(new Pack4S([p, 0], { soc: 1 }));
  c2.add(new Resistor([p, an], { R: 33000 }));
  c2.add(new Resistor([an, 0], { R: 10000 }));
  c2.step(1e-3);
  check('Phân áp 33k/10k: pin 4S đầy 16.8 V → AN0 ≈ 3.9 V', near(c2.v(an), 16.8 * 10 / 43, 0.02), `AN0 = ${f(c2.v(an))} V`);
}

// 2) LED đỏ + 330 Ω ở 5 V → ~9 mA
{
  const c = new Circuit();
  const a = c.node('a'), k = c.node('k');
  c.add(new VSource([a, 0], { V: 5 }));
  c.add(new Resistor([a, k], { R: 330 }));
  const led = c.add(new Led([k, 0], { color: 'red' }));
  c.run(2, 1e-3);
  check('LED đỏ + 330 Ω ở 5 V: I ≈ 9 mA, LED bình thường', led.I > 0.0085 && led.I < 0.0105 && led.state === 'ok', `I = ${f(led.I * 1000, 2)} mA, Vf = ${f(led.V, 2)} V, ${led.state}`);
}

// 3) LED không điện trở → chết
{
  const c = new Circuit();
  const a = c.node('a');
  c.add(new BenchSupply([a, 0], { v: 5, i: 3 }));
  const led = c.add(new Led([a, 0], { color: 'red' }));
  let peak = 0, tDead = null;
  c.run(3, 2e-4, (t) => { peak = Math.max(peak, led.I); if (led.dead && tDead == null) tDead = t; });
  check('LED nối thẳng 5 V (không điện trở) chết trong < 3 s', led.dead && tDead < 3, `dòng đỉnh ${f(peak * 1000, 0)} mA, chết sau ${f(tDead)} s (${led.dmg.deadMode}) — ${led.dmg.cause}`);
}

// 4) Mạch RC: τ = R·C = 1 kΩ × 1000 µF = 1 s
{
  const c = new Circuit();
  const a = c.node('a'), m = c.node('m');
  c.add(new VSource([a, 0], { V: 5 }));
  c.add(new Resistor([a, m], { R: 1000 }));
  const cap = c.add(new Electrolytic([m, 0], { C: 1000e-6, Vr: 25, ESR: 0.05 }));
  c.run(1.0, 1e-3);
  const v1 = c.v(m);
  c.run(4.0, 1e-3);
  check('Nạp tụ RC: sau 1τ = 63.2 %, sau 5τ ≈ 99 %', near(v1 / 5, 0.632, 0.01) && c.v(m) > 4.95 && cap.state === 'ok', `V(1 s) = ${f(v1)} V (${f(v1 / 5 * 100, 1)} %), V(5 s) = ${f(c.v(m))} V`);
}

// 5) Cầu chì 10 A khi chập pin 4S (không BMS)
{
  const c = new Circuit();
  const p = c.node('p'), q = c.node('q');
  c.add(new Pack4S([p, 0], { soc: 1, bms: false }));
  const fu = c.add(new Fuse([p, q], { rating: 10 }));
  const w = c.add(new Wire([q, 0], { R: 0.03 }));
  let peak = 0, t = null;
  c.run(0.3, 1e-4, (tt) => { peak = Math.max(peak, fu.I); if (fu.blown && t == null) t = tt; });
  check('Chập pin 4S qua cầu chì 10 A: đứt trong 5–100 ms', fu.blown && t > 0.005 && t < 0.1, `dòng ${f(peak, 0)} A, đứt sau ${f(t * 1000, 1)} ms; dây nhảy lên ${f(w.dmg.Tmax, 0)} °C`);
  // cùng chập nhưng pin có BMS → BMS ngắt trước khi cầu chì kịp nóng
  const c2 = new Circuit();
  const p2 = c2.node('p'), q2 = c2.node('q');
  const pk = c2.add(new Pack4S([p2, 0], { soc: 1, bms: true }));
  const fu2 = c2.add(new Fuse([p2, q2], { rating: 10 }));
  c2.add(new Wire([q2, 0], { R: 0.03 }));
  c2.run(0.05, 1e-4);
  check('Pin 4S có BMS: mạch bảo vệ ngắn mạch (SCP) ngắt trước, cầu chì còn nguyên', pk.cut === 'SCP' && !fu2.blown, `BMS: ${pk.cut}, cầu chì ${fu2.blown ? 'đứt' : 'còn'}`);
  // dây quá tải không có bảo vệ → nóng chảy vỏ rồi đứt lõi
  const c3 = new Circuit();
  const p3 = c3.node('p');
  c3.add(new Pack4S([p3, 0], { soc: 1, bms: false }));
  const w3 = c3.add(new Wire([p3, 0], { R: 0.03 }));
  const seen = new Set();
  c3.run(1.0, 1e-4, () => { seen.add(w3.state); });
  check('Chập pin 4S trực tiếp bằng dây nhảy: vỏ chảy, bốc khói, lõi đồng đứt', w3.dead && seen.has('smoking'), `trạng thái đã qua: ${[...seen].join(' → ')}; Tmax ${f(w3.dmg.Tmax, 0)} °C`);
}

// 6) Buck XL4015 16.8 V → 5 V, tải 10 Ω
{
  const c = new Circuit();
  const p = c.node('p'), o = c.node('o');
  const pk = c.add(new Pack4S([p, 0], { soc: 1 }));
  const b = c.add(new Buck([p, 0, o, 0], { vset: 5 }));
  c.add(new Resistor([o, 0], { R: 10, kind: 'powerres', Prated: 5 }));
  c.run(0.1, 2e-4);
  const iin = pk.I;
  check('Buck 16.8 V → 5.0 V / 0.5 A: Vout ≈ 5 V, Iin ≈ 0.17 A, η ≈ 85–92 %', near(b.vout, 5, 0.08) && iin > 0.15 && iin < 0.2 && b.eff > 0.8 && b.eff < 0.95,
    `Vout = ${f(b.vout)} V, Iout = ${f(b.iout)} A, Iin = ${f(iin)} A, η = ${f(b.eff * 100, 1)} %`);
  // ngược cực đầu vào → chết
  const c2 = new Circuit();
  const p2 = c2.node('p'), o2 = c2.node('o');
  c2.add(new Pack4S([0, p2], { soc: 0.6, bms: false }));   // pin 4S cắm ngược vào IN+/IN−
  const b2 = c2.add(new Buck([p2, 0, o2, 0], { vset: 5 }));
  let td = null;
  c2.run(3, 1e-4, (t) => { if (b2.dead && td == null) td = t; });
  check('Buck bị cắm NGƯỢC pin 4S vào đầu vào → chết chập', b2.dead && b2.dmg.deadMode === 'short', `chết sau ${f(td * 1000, 1)} ms — ${b2.dmg.cause}`);
}

// 7) PIC16F877A: 5 V chạy được, 12 V chết
function picCircuit(vsup, { crystal = true, mclr = true } = {}) {
  const c = new Circuit();
  const vdd = c.node('vdd'), mc = c.node('mclr'), led = c.node('led'), lk = c.node('lk');
  const psu = c.add(new BenchSupply([vdd, 0], { v: vsup, i: 3 }));
  const nodes = Array(40).fill(null);
  nodes[10] = vdd; nodes[31] = vdd; nodes[11] = 0; nodes[30] = 0;
  nodes[0] = mc; nodes[29] = led;
  if (mclr) c.add(new Resistor([vdd, mc], { R: 10000 }));
  const pic = c.add(new Pic16F877A(nodes, { program: 'blink', crystal }));
  c.add(new Resistor([led, lk], { R: 330 }));
  const l = c.add(new Led([lk, 0], { color: 'green' }));
  return { c, pic, l, psu };
}
{
  const { c, pic, l } = picCircuit(5);
  let on = 0, off = 0;
  c.run(3, 1e-3, () => { if (l.I > 0.005) on++; else off++; });
  check('PIC 5 V + MCLR kéo lên + thạch anh: chạy, LED RD7 nháy', pic.running && on > 800 && off > 800 && pic.state === 'ok', `${pic.status}; LED sáng ${on} ms / tắt ${off} ms, I_LED ${f(l.I * 1000, 1)} mA`);
  const r2 = picCircuit(5, { crystal: false });
  r2.c.run(0.5, 1e-3);
  check('PIC thiếu thạch anh: không chạy, có giải thích', !r2.pic.running && /thạch anh/.test(r2.pic.status), r2.pic.status);
  const r3 = picCircuit(12);
  let td = null;
  r3.c.run(3, 1e-3, (t) => { if (r3.pic.dead && td == null) td = t; });
  check('PIC cấp 12 V: chết (chập) trong < 3 s, nguồn chuyển sang giới hạn dòng', r3.pic.dead && td < 3 && r3.psu.cc, `chết sau ${f(td)} s — ${r3.pic.dmg.cause}; nguồn ${f(r3.psu.I, 2)} A (CC)`);
}

// 7b) PIC cắm ngược nguồn: diode đế dẫn → chết
{
  const c = new Circuit();
  const vdd = c.node('vdd');
  const psu = c.add(new BenchSupply([0, vdd], { v: 5, i: 3 }));     // + của nguồn vào VSS, − vào VDD
  const nodes = Array(40).fill(null);
  nodes[10] = vdd; nodes[31] = vdd; nodes[11] = 0; nodes[30] = 0;
  const pic = c.add(new Pic16F877A(nodes, { program: 'blink', crystal: true }));
  let td = null;
  c.run(5, 1e-3, (t) => { if (pic.dead && td == null) td = t; });
  check('PIC cắm NGƯỢC nguồn 5 V: dòng lớn qua diode đế, chip chết', pic.dead && psu.cc, `chết sau ${f(td)} s — ${pic.dmg.cause}`);
}

// 8) Tụ hoá ngược cực → nổ ; đúng cực → bình thường
{
  const mk = (rev) => {
    const c = new Circuit();
    const p = c.node('p');
    c.add(new Pack4S([p, 0], { soc: 0.5 }));
    const cap = c.add(new Electrolytic(rev ? [0, p] : [p, 0], { C: 1000e-6, Vr: 25 }));
    let t = null;
    c.run(15, 1e-3, (tt) => { if (cap.state === 'exploded' && t == null) t = tt; });
    return { cap, t };
  };
  const r = mk(true), ok = mk(false);
  check('Tụ hoá 1000 µF/25 V cắm NGƯỢC trên 14.4 V: phồng & nổ trong < 15 s', r.cap.state === 'exploded', `nổ sau ${f(r.t, 1)} s — ${r.cap.dmg.cause}`);
  check('Tụ hoá cắm đúng cực trên 14.4 V: bình thường', ok.cap.state === 'ok' && near(ok.cap.vc, 14.9, 0.6), `Vc = ${f(ok.cap.vc, 2)} V, T = ${f(ok.cap.T, 1)} °C`);
}

// 9) MOSFET: cổng 3.3 V vs 5 V, IRLZ44N vs IRF520, tải 2.4 Ω ở 12 V (5 A)
function fet(model, vg) {
  const c = new Circuit();
  const vp = c.node('vp'), d = c.node('d'), g = c.node('g');
  c.add(new BenchSupply([vp, 0], { v: 12, i: 10 }));
  c.add(new Resistor([vp, d], { R: 2.4, kind: 'powerres', Prated: 100 }));
  c.add(new VSource([g, 0], { V: vg }));
  const q = c.add(new Nmos([g, d, 0], { model }));
  c.run(0.2, 1e-3);
  return q;
}
{
  const a = fet('irlz44n', 5), b = fet('irf520', 5), a3 = fet('irlz44n', 3.3), b3 = fet('irf520', 3.3);
  check('IRLZ44N, Vgs = 5 V: mở hẳn, tỏa < 1.5 W', a.I > 4.7 && a.P < 1.5, `I = ${f(a.I, 2)} A, Vds = ${f(a.vds, 3)} V, P = ${f(a.P, 2)} W`);
  check('IRF520, Vgs = 5 V: mở không hết, tỏa > 5 W (nóng)', b.P > 5, `I = ${f(b.I, 2)} A, Vds = ${f(b.vds, 2)} V, P = ${f(b.P, 1)} W`);
  check('IRLZ44N, Vgs = 3.3 V (ESP32): vẫn dẫn > 4 A', a3.I > 4 && a3.P < 3, `I = ${f(a3.I, 2)} A, P = ${f(a3.P, 2)} W`);
  check('IRF520, Vgs = 3.3 V: gần như không dẫn', b3.I < 0.3, `I = ${f(b3.I, 3)} A`);
  // IRF520 ở 5 V để lâu → quá nhiệt
  const c = new Circuit();
  const vp = c.node('vp'), d = c.node('d'), g = c.node('g');
  c.add(new BenchSupply([vp, 0], { v: 12, i: 10 }));
  c.add(new Resistor([vp, d], { R: 2.4, kind: 'powerres', Prated: 100 }));
  c.add(new VSource([g, 0], { V: 5 }));
  const q = c.add(new Nmos([g, d, 0], { model: 'irf520' }));
  c.run(30, 5e-3);
  check('IRF520 Vgs = 5 V sau 30 s không tản nhiệt: quá nhiệt (≥ bốc khói)', ['smoking', 'burning', 'dead'].includes(q.state), `${q.state}, Tj = ${f(q.T, 0)} °C`);
}

// 10) Động cơ: dòng kẹt & không tải
{
  const c = new Circuit();
  const p = c.node('p');
  c.add(new BenchSupply([p, 0], { v: 14.4, i: 5 }));
  const m = c.add(new Motor([p, 0], { load: 0, stall: true }));
  c.run(0.05, 2e-4);
  check('Động cơ RS-360 kẹt ở 14.4 V: I = V/R ≈ 2.06 A', near(m.I, 14.4 / 7, 0.08), `I = ${f(m.I, 3)} A`);
  m.configure({ stall: false });
  c.run(1.5, 5e-4);
  check('Động cơ chạy không tải (ma sát 1.2 mN·m): ~0.1–0.25 A, ~11 000 vòng/phút', m.I > 0.08 && m.I < 0.25 && m.rpm > 10000 && m.rpm < 13000, `I = ${f(m.I, 3)} A, ${f(m.rpm, 0)} rpm`);
}

// 11) Xung flyback khi ngắt MOSFET: không diode vs có diode Schottky
function flyback(withDiode) {
  const c = new Circuit();
  const p = c.node('p'), d = c.node('d'), g = c.node('g');
  c.add(new Pack4S([p, 0], { soc: 0.6 }));
  const m = c.add(new Motor([p, d], { load: 0, stall: true }));
  if (withDiode) c.add(new Diode([d, p], { model: '1n5822' }));
  const gs = c.add(new VSource([g, 0], { V: 5 }));
  const q = c.add(new Nmos([g, d, 0], { model: 'irlz44n' }));
  c.run(0.02, 2e-5);
  const i0 = m.I;
  gs.configure({ V: 0 });
  let peak = 0;
  c.run(0.01, 2e-5, () => { peak = Math.max(peak, c.v(d)); });
  return { peak, i0, q };
}
{
  const a = flyback(false), b = flyback(true);
  check('Ngắt động cơ KHÔNG có diode flyback: Vds vọt > 45 V (MOSFET đánh thủng thác lũ)', a.peak > 45, `I trước khi ngắt ${f(a.i0, 2)} A, Vds đỉnh ${f(a.peak, 1)} V`);
  check('Có diode Schottky 1N5822 song song ngược động cơ: Vds đỉnh < 16 V', b.peak < 16, `Vds đỉnh ${f(b.peak, 2)} V`);
}

// 11b) Cùng mạch flyback nhưng bước dt = 0.2 ms như trên bàn mạch: bộ giải tự chia mịn bước khi có sườn chuyển mạch
{
  const c = new Circuit();
  const p = c.node('p'), d = c.node('d'), g = c.node('g');
  c.add(new Pack4S([p, 0], { soc: 0.6 }));
  c.add(new Motor([p, d], { load: 2 }));
  const gs = c.add(new VSource([g, 0], { V: 5 }));
  c.add(new Nmos([g, d, 0], { model: 'irlz44n' }));
  c.run(0.3, 2e-4);
  gs.configure({ V: 0 });
  c.watchNode = d; c.watchPeak = null;
  c.run(0.01, 2e-4);
  check('dt = 0.2 ms + chia mịn khi có sườn: vẫn bắt được xung flyback > 45 V', c.watchPeak > 45, `đỉnh ${f(c.watchPeak, 1)} V, ${c.stats.refined} lần chia mịn`);
}

// 12) Nguồn bàn giới hạn dòng (CC)
{
  const c = new Circuit();
  const p = c.node('p');
  const s = c.add(new BenchSupply([p, 0], { v: 12, i: 1 }));
  c.add(new Wire([p, 0], { R: 0.03 }));
  c.run(0.01, 1e-3);
  check('Nguồn bàn 12 V / giới hạn 1 A bị chập: dòng giữ ở 1 A (chế độ CC)', near(s.I, 1, 0.03) && s.cc, `I = ${f(s.I, 3)} A, V = ${f(s.V, 3)} V`);
}

// 13) Đồng hồ để thang A mà đo song song nguồn → đứt cầu chì đồng hồ
{
  const c = new Circuit();
  const p = c.node('p');
  c.add(new Pack4S([p, 0], { soc: 1, bms: false }));
  const mt = c.add(new Meter([0, p], { mode: 'A' }));
  c.run(0.2, 1e-4);
  check('Đồng hồ thang 10 A đo "điện áp" pin 4S: cầu chì 10 A trong đồng hồ đứt', mt.fA.blown, `cầu chì ${mt.fA.blown ? 'đứt' : 'còn'} sau ${f(mt.fA.blownAt * 1000, 1)} ms`);
  const c2 = new Circuit();
  const p2 = c2.node('p'), m2 = c2.node('m');
  c2.add(new VSource([p2, 0], { V: 9 }));
  c2.add(new Resistor([p2, m2], { R: 4700 }));
  c2.add(new Resistor([m2, 0], { R: 4700 }));
  const mv = c2.add(new Meter([0, m2], { mode: 'V' }));
  c2.step(1e-3);
  check('Đồng hồ thang V đo phân áp 9 V / 2 × 4.7 kΩ: ≈ 4.5 V', near(mv.reading, 4.5, 0.01), `đọc ${f(mv.reading)} V`);
  const c3 = new Circuit();
  const a3 = c3.node('a');
  c3.add(new Resistor([a3, 0], { R: 3300 }));
  const mo = c3.add(new Meter([0, a3], { mode: 'ohm' }));
  c3.step(1e-3);
  check('Đồng hồ thang Ω đo điện trở 3.3 kΩ', near(mo.reading, 3300, 5), `đọc ${f(mo.reading, 1)} Ω`);
}

// 14) ESP32-S3: 5 V vào GPIO hỏng dần ; 5 V vào chân 3V3 → chết
{
  const idx = (n) => ESP_PINS.indexOf(n);
  const c = new Circuit();
  const v33 = c.node('v33'), v5 = c.node('v5');
  c.add(new BenchSupply([v5, 0], { v: 5, i: 3 }));
  const nodes = Array(ESP_PINS.length).fill(null);
  nodes[idx('5V')] = v5; nodes[idx('GND')] = 0; nodes[idx('G18')] = v5;   // 5 V nối thẳng vào GPIO18
  nodes[idx('3V3')] = v33;
  const esp = c.add(new Esp32S3(nodes, {}));
  c.run(0.2, 1e-3);
  const v3 = c.v(v33);
  const icl = esp.Ipin[idx('G18')];
  c.run(40, 5e-3);
  check('ESP32-S3 cấp 5V → LDO onboard ra 3.3 V', near(v3, 3.3, 0.06), `3V3 = ${f(v3)} V`);
  check('5 V nối thẳng vào GPIO18: dòng kẹp vài chục mA, chân hỏng sau vài chục giây', Math.abs(icl) > 0.005 && esp.pinDead[idx('G18')] === 1, `dòng kẹp ${f(Math.abs(icl) * 1000, 1)} mA, hỏng: ${esp.deadPins?.join(', ')}`);
  const c2 = new Circuit();
  const p2 = c2.node('p');
  c2.add(new BenchSupply([p2, 0], { v: 5, i: 3 }));
  const n2 = Array(ESP_PINS.length).fill(null);
  n2[idx('3V3')] = p2; n2[idx('GND')] = 0;
  const e2 = c2.add(new Esp32S3(n2, {}));
  c2.run(10, 2e-3);
  check('5 V cấp vào chân 3V3 của ESP32 → chết', e2.dead, `${e2.state} — ${e2.dmg.cause}`);
}

// 15) DRV8871: tiến / lùi / ngược nguồn
{
  const c = new Circuit();
  const vm = c.node('vm'), i1 = c.node('i1'), i2 = c.node('i2'), o1 = c.node('o1'), o2 = c.node('o2');
  const psu = c.add(new BenchSupply([vm, 0], { v: 12, i: 5 }));
  const s1 = c.add(new VSource([i1, 0], { V: 5 })), s2 = c.add(new VSource([i2, 0], { V: 0 }));
  const drv = c.add(new Drv8871([i1, i2, 0, vm, o1, o2], {}));
  const m = c.add(new Motor([o1, o2], { load: 2 }));
  c.run(1.0, 5e-4);
  const fw = m.rpm;
  s1.configure({ V: 0 }); s2.configure({ V: 5 });
  c.run(1.5, 5e-4);
  check('DRV8871 IN1=1 IN2=0 → tiến ; IN1=0 IN2=1 → lùi', fw > 5000 && m.rpm < -5000, `tiến ${f(fw, 0)} rpm, lùi ${f(m.rpm, 0)} rpm (${drv.dir})`);
  psu.configure({ v: 12 });
  const c2 = new Circuit();
  const vm2 = c2.node('vm');
  c2.add(new Pack4S([0, vm2], { soc: 0.6, bms: false }));      // pin cắm ngược vào VM/GND
  const d2 = c2.add(new Drv8871([c2.node('a'), c2.node('b'), 0, vm2, c2.node('c'), c2.node('d')], {}));
  c2.run(2, 1e-4);
  check('DRV8871 cấp ngược nguồn VM → chết (ngắt nhiệt không cứu được)', d2.dead, `${d2.state} — ${d2.dmg.cause}`);
}

// 16) LDO 3.3 V từ 5 V và từ 14.4 V
{
  const c = new Circuit();
  const i = c.node('i'), o = c.node('o');
  c.add(new BenchSupply([i, 0], { v: 5, i: 2 }));
  const l = c.add(new Ldo([0, o, i], {}));
  c.add(new Resistor([o, 0], { R: 33, kind: 'powerres', Prated: 5 }));
  c.run(0.1, 1e-3);
  check('LDO LM1117-3.3 từ 5 V, tải 0.1 A: Vout ≈ 3.3 V', near(l.vout, 3.3, 0.05), `Vout = ${f(l.vout)} V, P = ${f(l.P, 2)} W`);
}

// 17) Dựng từ netlist (như trên bàn mạch): pin 4S → cầu chì → buck → PIC + thạch anh + LED
{
  const parts = [
    { uid: 1, type: 'pack4s', props: { soc: 90 }, pins: { '+': 'P+', '-': 'GND' } },
    { uid: 2, type: 'fuse', props: { rating: 5 }, pins: { 1: 'P+', 2: 'F' } },
    { uid: 3, type: 'buck', props: { vset: 5 }, pins: { 'IN+': 'F', 'IN-': 'GND', 'OUT+': '5V', 'OUT-': 'GND2' } },
    { uid: 4, type: 'pic', props: { program: 'blink' }, pins: Object.fromEntries(Array.from({ length: 40 }, (_, k) => [String(k + 1), `pic${k + 1}`])) },
    { uid: 5, type: 'crystal', props: {}, pins: { 1: 'pic13', 2: 'pic14' } },
    { uid: 6, type: 'resistor', props: { R: 10000 }, pins: { 1: '5V', 2: 'pic1' } },
    { uid: 7, type: 'resistor', props: { R: 330 }, pins: { 1: 'pic30', 2: 'ledA' } },
    { uid: 8, type: 'led', props: { color: 'red' }, pins: { A: 'ledA', K: 'GND' } },
  ];
  const wires = [
    { id: 1, a: '5V', b: 'pic11' }, { id: 2, a: '5V', b: 'pic32' }, { id: 3, a: 'GND', b: 'pic12' }, { id: 4, a: 'GND', b: 'pic31' },
  ];
  let nl = buildCircuit({ parts, wires, ground: 'GND' });
  nl.circuit.run(0.5, 5e-4);
  const pic = nl.partEls.get(4)[0];
  check('Netlist: pin 4S → cầu chì → buck 5 V → PIC chạy', pic.running, `${pic.status}; buck ${f(nl.partEls.get(3)[0].vout)} V`);
  // dựng lại (thêm dây) giữ nguyên trạng thái
  nl = buildCircuit({ parts, wires: [...wires, { id: 5, a: 'pic2', b: 'GND' }], ground: 'GND' }, nl);
  nl.circuit.run(0.1, 5e-4);
  const pic2 = nl.partEls.get(4)[0];
  check('Dựng lại mạch giữ trạng thái phần tử', pic2 === pic && pic2.running, `cùng đối tượng: ${pic2 === pic}`);
  const t0 = performance.now();
  nl.circuit.run(1, 5e-4);
  const ms = performance.now() - t0;
  check('Hiệu năng: 1 s mô phỏng (2000 bước) mạch PIC < 1500 ms', ms < 1500, `${f(ms, 0)} ms, ${nl.circuit.nodeNames.length} nút, Newton TB ${f(nl.circuit.stats.iters / nl.circuit.stats.steps, 2)} vòng/bước`);
}

console.log(results.join('\n'));
console.log(`\n${pass} đạt, ${fail} lỗi`);
process.exit(fail ? 1 : 0);
