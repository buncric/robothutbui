// =============================================================================
// minigames/power.js — CẤP NGUỒN: nối netlist sống của game (minigames/netlist.js) vào bộ giải mạch thật src/circuit/*.
//
//   game.power = new PowerSim(game)      (main.js gọi initCircuitGames → tạo cả game.circuit)
//   game.circuit = { nl, circuit, measure(req), v(keyOrAtt), elementsOf(item), build(spec), spec(opts), step(dt) }
//   game.power.clipLead('red'|'black', att | worldPoint, hitObject?) · unclipLead(which) · leads
//   game.power.tick(dt)   — gọi mỗi bước logic 60 Hz
//
// Nguồn: kênh CH1 nguồn bàn (world/props/bench-psu.js → game.lab.psu.channels[0]: vset, iset, out) qua 2 kẹp cá sấu của
//   dụng cụ 'psu-leads' (kẹp đỏ = +, đen = −) — kẹp vào điểm nào thì do tia nhìn lúc bấm quyết định (netlist.resolvePoint).
//   Pack pin 4S (pack-4s-bms, chân P+/P−) nối vào mạch (qua XT60 / dây) cũng là nguồn.
// Mỗi bước: chỉ phần mạch LIÊN THÔNG với nguồn được đưa vào bộ giải (linh kiện nằm lăn lóc trên bàn không làm chậm).
// Bộ giải chạy bước h = 1 ms (mạch lớn 2 ms), có ngân sách thời gian. Nguồn bàn: phần tử BenchSupply (CV/CC thật) → đồng bộ
//   lại hiển thị V/A + đèn CC của máy bằng psu.setLoad(R_tương đương = V/I).
// Kết quả: LED sáng (def.setLit + state.lit), động cơ quay (def.spin), PIC chạy/không (status), buck theo trimmer,
//   hư hỏng (damage.js) → khói/lửa/tia lửa/nổ/xém tại linh kiện + âm thanh + state.dead + sự kiện 'fault' {kind, item, cause}.
// Sự kiện phát: 'power:on'/'power:off' {source:'battery'} · 'fault' · 'led:lit' {item, current} · 'mcu:status' {item, status, running}
//   'power:hot-edit' (sửa mạch khi đang có điện) · 'psu:short' (R tải < 1 Ω).
// =============================================================================
import * as THREE from 'three';
import { buildCircuit } from '../../circuit/netlist.js';
import { STATE_VI } from '../../circuit/damage.js';
import { labState } from '../world/_labState.js';
import { pk, isLive, pinsOf, UF, GameNetlist } from './netlist.js';
import { Wiring } from './wiring.js';
import { Measuring } from './measuring.js';

/**
 * Khởi tạo cả bộ minigame mạch điện cho game (gọi 1 lần từ main.js sau khi world + registry đã nạp):
 * game.netlist · game.wiring · game.power · game.circuit · game.measuring, và đăng ký hàm cập nhật 60 Hz vào game.tickers.
 */
export function initCircuitGames(game) {
  if (game.power) return game.power;
  game.netlist = new GameNetlist(game);
  game.wiring = new Wiring(game);
  game.power = new PowerSim(game);
  game.measuring = new Measuring(game);
  const P = game.power;
  game.circuit = {
    get nl() { return P.nl; },
    get circuit() { return P.nl?.circuit || null; },
    measure: (req) => game.measuring.measure(req),
    v: (k) => P.v(k),
    elementsOf: (it) => P.elementsOf(it),
    spec: (o) => P.spec(o),
    build: (sp, prev) => P.build(sp, prev),
    step: (dt) => P.tick(dt),
  };
  game.tickers ||= [];
  game.tickers.push((dt) => game.wiring.tick(dt), (dt) => P.tick(dt), (dt) => game.measuring.tick(dt));
  // lưu kẹp que nguồn bàn + que đen đồng hồ
  game.save?.register?.('circuit', {
    serialize: () => ({ leads: P.leads, black: game.measuring.black }),
    deserialize: (d) => {
      if (!d) return;
      for (const w of ['red', 'black']) { if (d.leads?.[w]) P.clipLead(w, d.leads[w]); else P.unclipLead(w, true); }
      game.measuring.black = d.black || null;
    },
  });
  return P;
}

const _v = new THREE.Vector3();
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const LED_COLOR = (id) => (/blue/.test(id) ? 'blue' : /green/.test(id) ? 'green' : /white/.test(id) ? 'white' : /yellow/.test(id) ? 'yellow' : 'red');
const MINUS = '−';

/** Linh kiện game → loại phần tử trong circuit/library.js (+ ánh xạ chân thư viện → chân item) */
export function partSpecOf(it) {
  const d = it.def, E = d.electrical, id = d.id, st = it.state || {};
  if (!E && id !== 'pic16f877a') return null;
  const T = E?.type;
  const same = (...names) => Object.fromEntries(names.map((n) => [n, n]));
  switch (T) {
    case 'resistor': return { type: 'resistor', props: { R: st.value ?? d.props?.value ?? E.ohms ?? 1000 }, pins: same('1', '2') };
    case 'led': return { type: 'led', props: { color: LED_COLOR(id) }, pins: same('A', 'K') };
    case 'capacitor':
      // [hàn] tụ hoá quá nhiệt khi hàn (minigames/solder-pro.js → state.heatDamage): mất điện dung, ESR tăng (khô/rò điện phân)
      return E.polar ? { type: 'electro', props: { C: E.farads * (st.heatDamage?.cMul ?? 1), Vr: E.vmax, ESR: (E.esr ?? 0.1) * (st.heatDamage?.esrMul ?? 1) }, pins: { '+': '+', '-': MINUS } }
        : { type: 'ceramic', props: { C: E.farads, Vr: E.vmax ?? 50 }, pins: same('1', '2') };
    case 'crystal': return { type: 'crystal', props: {}, pins: same('1', '2') };
    case 'diode': return { type: 'diode', props: { model: E.schottky ? (E.ifMax >= 3 ? 'ss34' : '1n5822') : '1n4007' }, pins: same('A', 'K') };
    case 'inductor': return { type: 'inductor', props: { L: E.henry ?? 1e-4, DCR: E.dcr ?? 0.05, Irated: E.isat ?? 3 }, pins: same('1', '2') };
    case 'nmos': return { type: 'nmos', props: { model: 'irlz44n' }, pins: same('G', 'D', 'S') };
    case 'dc-motor': return { type: 'motor', props: { load: 0 }, pins: { '+': '+', '-': MINUS } };
    case 'buck': {
      let vset = 5;
      try { vset = d.outputVoltage?.(it, 1000) ?? 5; } catch { /* */ }
      return { type: 'buck', props: { vset }, pins: { 'IN+': 'IN+', 'IN-': `IN${MINUS}`, 'OUT+': 'OUT+', 'OUT-': `OUT${MINUS}` } };
    }
    case 'battery-pack': return { type: 'pack4s', props: { soc: st.soc ?? 100, bms: true }, pins: { '+': 'P+', '-': `P${MINUS}` }, source: true };
    case 'switch': return { type: 'button', props: { pressed: !!st.on }, pins: { A1: '1', A2: '1', B1: '2', B2: '2' } };
    case 'switch-spdt': return { type: 'switch', props: { on: !!st.pressed }, pins: { 1: 'NC', C: 'COM', 3: 'NO' } };
    case 'fuse': return { type: 'fuse', props: { rating: E.ratingA ?? 10 }, pins: same('1', '2') };
    case 'h-bridge': return { type: 'drv8871', props: {}, pins: { IN1: 'IN1', IN2: 'IN2', GND: 'GND', VM: 'VM', GND2: 'T-GND', OUT1: 'T-OUT1', OUT2: 'T-OUT2' } };
    case 'level-shifter': return { type: 'bss138', props: {}, pins: { ...same('LV1', 'LV2', 'LV', 'LV3', 'LV4', 'HV1', 'HV2', 'HV', 'HV3', 'HV4'), GND: 'GND-LV', GND2: 'GND-HV' } };
    default: break;
  }
  if (id === 'pic16f877a' || (T === 'mcu' && /pic16f877/i.test(id))) {
    const pins = {};
    for (let k = 1; k <= 40; k++) pins[String(k)] = String(k);
    return { type: 'pic', props: { program: st.program || 'none' }, pins };
  }
  return null;
}

export class PowerSim {
  constructor(game) {
    this.game = game;
    this.lab = game.lab || labState(game);
    this.leads = { red: null, black: null };     // att của kẹp cá sấu
    this.channel = 1;
    this.nl = null;                 // kết quả buildCircuit()
    this.specKey = '';
    this.netVer = -1;
    this.items = new Map();         // uid → item trong mạch hiện tại
    this.h = 1e-3;
    this.budgetMs = 8;
    this.visT = 0;
    this.lastStatus = new Map();
    this.ledOn = new Set();
    this.heated = new Set();
    this.powered = false;           // đang có nguồn cấp vào mạch nào đó
    this.batteryOn = new Set();
    this.shortWarned = false;
    this.ccWarned = false;
    this.stats = { steps: 0, ms: 0, nodes: 0 };
    const ev = game.events;
    const rebuild = () => { this.specKey = ''; };
    ev.on('power:on', (e) => { rebuild(); this.shortWarned = false; this.ccWarned = false; if (e.source === 'psu') this._checkIcs(); });
    ev.on('power:off', rebuild);
    ev.on('psu:changed', () => this._syncPsuParams());
    ev.on('program:flashed', (e) => this._onFlashed(e));
    // tháo / cắm linh kiện khi đang có điện → trừ điểm an toàn
    const hot = (e) => {
      if (!this.powered) return;
      const it = e.item;
      if (it && it.def?.kind === 'tool') return;
      ev.emit('power:hot-edit', { item: it, what: e.type });
    };
    for (const t of ['socket:inserted', 'socket:removed', 'wire:connected', 'wire:removed']) ev.on(t, (e) => { if (!String(e.a || '').startsWith('psu')) hot(e); });
    // dụng cụ dây nguồn bàn: kẹp đỏ/đen → điểm thật trên mạch
    ev.on('wire:connected', (e) => this._onLeadEvent(e));
    ev.on('wire:disconnected', (e) => { if (e.instance?.def?.id === 'psu-leads' || (!e.a && !e.b)) { this.unclipLead('red', true); this.unclipLead('black', true); } });
  }

  get psuChannel() { return this.lab?.psu?.channels?.[this.channel - 1] || null; }
  get psuOutputOn() { const c = this.psuChannel; return !!(c && c.out && this.lab.psu.on !== false); }

  // ------------------------------------------------------------------ kẹp cá sấu
  _onLeadEvent(e) {
    const a = String(e.a || '');
    if (!a.startsWith('psu-lead:')) return;
    const which = a.slice(9);
    const tgt = e.b && e.b.isObject3D ? e.b : e.b?.object || null;
    const hit = this.game.interact?.target?.hit || this.game.interact?.hit || null;
    let point = null, obj = tgt;
    if (hit?.point && (!tgt || isUnder(hit.object, tgt))) { point = hit.point; obj = hit.object; }
    else if (e.pos) point = e.pos;
    this.clipLead(which, point, obj);
  }

  /** Kẹp que nguồn bàn: att (điểm gắn) hoặc (điểm thế giới + vật trúng tia) */
  clipLead(which, attOrPoint, hitObject = null) {
    const NL = this.game.netlist;
    let att = attOrPoint && attOrPoint.kind ? attOrPoint : null;
    if (!att && attOrPoint && hitObject) att = NL.resolvePoint(attOrPoint.isVector3 ? attOrPoint : new THREE.Vector3(...attOrPoint), hitObject, { kinds: { bb: true, pin: true, pad: true, hf: true, screw: true } })?.att || null;
    if (!att) {
      this.game.hud?.toast?.(`Kẹp ${which === 'red' ? 'ĐỎ' : 'ĐEN'} chưa chạm vào chân / lỗ / đầu dây nào — nhắm sát hơn`, { kind: 'warn', short: true });
      this.leads[which] = null;
      NL.unlink(`psu-lead:${which}`);
      return null;
    }
    this.leads[which] = att;
    NL.link(`psu-lead:${which}`, `psu:${this.channel}:${which === 'red' ? '+' : '-'}`, att);
    this.specKey = '';
    this.game.hud?.toast?.(`Kẹp ${which === 'red' ? 'ĐỎ (+)' : 'ĐEN (−)'} → ${NL.labelOf(att)}`, { kind: 'info', short: true });
    this.game.events.emit('psu:lead', { which, att, label: NL.labelOf(att) });
    return att;
  }
  unclipLead(which, silent = false) {
    if (!this.leads[which]) return;
    this.leads[which] = null;
    this.game.netlist.unlink(`psu-lead:${which}`);
    this.specKey = '';
    if (!silent) this.game.events.emit('psu:lead', { which, att: null });
  }

  _onFlashed(e) {
    if (!e || e.ok === false) return;
    const items = this.game.items.all;
    let targets = [];
    const t = e.item || null;
    if (t && /pic16f877/i.test(t.def?.id || '')) targets = [t];
    else if (t) targets = items.filter((q) => /pic16f877/i.test(q.def.id) && isUnder(q.object, t.object));
    if (!targets.length) targets = items.filter((q) => /pic16f877/i.test(q.def.id) && isLive(q));
    for (const q of targets) q.state.program = e.program || 'blink';
    this.specKey = '';
  }

  _checkIcs() {
    // IC cắm ngược khấc + bật nguồn → cảnh báo ngay (hậu quả do bộ giải tính)
    for (const it of this.game.items.all) {
      if (it.socketInfo?.orientation === 'reversed' && it.def.dip && isLive(it)) this.game.events.emit('fault', { kind: 'reversed-ic', item: it, cause: `${it.def.name} cắm NGƯỢC khấc đế` });
    }
  }

  _syncPsuParams() {
    const el = this.nl?.byKey.get(`psu-ch${this.channel}/psu`);
    const c = this.psuChannel;
    if (el && c) el.configure({ v: c.vset, i: Math.max(0.001, c.iset) });
  }

  // ------------------------------------------------------------------ dựng mạch
  /**
   * Tạo đặc tả mạch cho circuit/netlist.js buildCircuit.
   * opts: { withPsu=true, roots:[gốc mạng cần giữ] (thay cho nguồn), extraRoots:[thêm vào nguồn], all=false }
   */
  spec({ withPsu = true, roots = null, extraRoots = null, all = false } = {}) {
    const game = this.game;
    const N = game.netlist.get();
    const R = (k) => N.uf.find(k);
    const parts = [], sourcesRoots = [];
    for (const it of N.live) {
      const sp = partSpecOf(it);
      if (!sp) continue;
      const ids = new Set(pinsOf(it).map((p) => p.id));
      const pins = {};
      let ok = true;
      for (const [lib, ip] of Object.entries(sp.pins)) {
        if (!ids.has(ip)) { if (sp.type === 'pic') { pins[lib] = `nc:${it.uid}:${ip}`; continue; } ok = false; break; }
        pins[lib] = R(pk(it.uid, ip));
      }
      if (!ok) continue;
      parts.push({ uid: it.uid, type: sp.type, props: sp.props, label: it.def.name, pins, item: it, source: !!sp.source });
      if (sp.source) sourcesRoots.push(pins['+'], pins['-']);
    }
    let ground = null, psuOn = false;
    const c = this.psuChannel;
    if (withPsu && this.leads.red && this.leads.black && c && this.psuOutputOn) {
      const p = R(`psu:${this.channel}:+`), n = R(`psu:${this.channel}:-`);
      parts.push({ uid: `psu-ch${this.channel}`, type: 'bench', props: { v: c.vset, i: Math.max(0.001, c.iset) }, label: `Nguồn bàn CH${this.channel}`, pins: { '+': p, '-': n }, source: true });
      sourcesRoots.push(p, n);
      ground = n;
      psuOn = true;
    }
    const wires = N.wires.map((w) => ({ id: w.id, a: R(w.a), b: R(w.b), len: w.len, label: w.label, item: w.item }));
    // phần liên thông
    const comp = new UF();
    for (const p of parts) { const v = Object.values(p.pins); for (let i = 1; i < v.length; i++) comp.union(v[0], v[i]); }
    for (const w of wires) comp.union(w.a, w.b);
    const keep = new Set();
    for (const r of (roots || [...sourcesRoots, ...(extraRoots || [])])) if (r) keep.add(comp.find(r));
    const inKeep = (k) => all || keep.has(comp.find(k));
    const fParts = parts.filter((p) => inKeep(Object.values(p.pins)[0]));
    const fWires = wires.filter((w) => inKeep(w.a));
    // pin: nguồn chỉ là "nguồn" khi nối vào tải (≥ 1 linh kiện/dây khác cùng phần liên thông)
    if (!ground) {
      const pack = fParts.find((p) => p.type === 'pack4s' && fParts.some((q) => q !== p && !q.source && sameComp(comp, q, p)));
      if (pack) ground = pack.pins['-'];
    }
    return { parts: fParts, wires: fWires, ground, psuOn, version: N.version };
  }

  /** buildCircuit + phục hồi linh kiện đã hỏng (state.dead) */
  build(spec, prev = null) {
    const nl = buildCircuit({ parts: spec.parts, wires: spec.wires, meter: spec.meter || null, ground: spec.ground, powered: spec.powered ?? true }, prev);
    const items = this.game.items;
    for (const p of spec.parts) {
      const it = p.item;
      if (!it?.state?.dead) continue;
      for (const el of nl.partEls.get(p.uid) || []) if (el.dmg && !el.dead) { el.dmg.kill(it.state.damage?.mode, it.state.damage?.cause || 'đã hỏng từ trước'); el.dmg.events.length = 0; }
    }
    for (const w of spec.wires) {
      const el = nl.wireEls.get(w.id);
      if (el && w.item?.state?.dead && !el.dead) { el.dmg.kill('open', 'dây đã cháy'); el.dmg.events.length = 0; }
    }
    void items;
    return nl;
  }

  _ensure() {
    const N = this.game.netlist.get();
    const c = this.psuChannel;
    const key = `${N.version}|${this.psuOutputOn ? 1 : 0}|${this.leads.red ? 1 : 0}${this.leads.black ? 1 : 0}`;
    if (key === this.specKey && this.nl) return this.nl;
    const sp = this.spec();
    this.specKey = key;
    this.curSpec = sp;
    const hasSource = sp.parts.some((p) => p.source && (p.type === 'bench' || sp.parts.length > 1));
    // tắt hẳn: các phần tử cũ giữ nhiệt độ/hư hỏng qua prev
    this.nl = this.build(sp, this.nl);
    this.items.clear();
    for (const p of sp.parts) if (p.item) this.items.set(p.uid, p.item);
    for (const w of sp.wires) if (w.item) this.items.set(w.id, w.item);
    this.hasSource = hasSource;
    this.stats.nodes = this.nl.circuit.nodeNames.length - 1;
    this.h = this.stats.nodes > 40 ? 2e-3 : 1e-3;
    // pin nối/tách → power:on/off
    const packs = new Set(sp.parts.filter((p) => p.type === 'pack4s' && sp.parts.length > 1).map((p) => p.uid));
    for (const u of packs) if (!this.batteryOn.has(u)) this.game.events.emit('power:on', { source: 'battery', item: this.game.items.byUid(u) });
    for (const u of this.batteryOn) if (!packs.has(u)) this.game.events.emit('power:off', { source: 'battery', item: this.game.items.byUid(u) });
    this.batteryOn = packs;
    void c;
    return this.nl;
  }

  // ------------------------------------------------------------------ vòng lặp
  tick(dt) {
    const game = this.game;
    let nl;
    try { nl = this._ensure(); } catch (e) { if (!this._err) { this._err = true; console.warn('[power] dựng mạch lỗi', e); } return; }
    const psuEl = nl.byKey.get(`psu-ch${this.channel}/psu`);
    this.powered = !!this.hasSource;
    if (this.hasSource) {
      const c = nl.circuit;
      c.powered = true;
      const h = this.h;
      let n = Math.max(1, Math.round(dt / h));
      const t0 = now();
      for (let i = 0; i < n; i++) {
        c.step(h);
        if ((i & 7) === 7 && now() - t0 > this.budgetMs) break;
      }
      this.stats.steps = n; this.stats.ms = now() - t0;
      this._events(nl);
    }
    // nguồn bàn: hiển thị V/A/CC qua tải tương đương
    const ch = this.psuChannel;
    if (ch && this.lab.psu?.setLoad) {
      if (psuEl && this.psuOutputOn) {
        const I = Math.max(0, psuEl.I), V = Math.max(0, psuEl.V);
        const Rl = I > 1e-6 ? Math.max(1e-4, V / I) : Infinity;
        this.lab.psu.setLoad(this.channel, Rl);
        if (Rl < 1 && !this.shortWarned) {
          this.shortWarned = true;
          game.events.emit('psu:short', { ch: this.channel, ohms: Rl, i: I });
          game.hud?.toast?.(`CH${this.channel}: tải ≈ ${Rl.toFixed(2)} Ω — CHẬP MẠCH! Nguồn chuyển CC giữ ${ch.iset.toFixed(3)} A (giới hạn dòng đã cứu mạch)`, { kind: 'warn' });
        }
        if (psuEl.cc && !this.ccWarned) {
          this.ccWarned = true;
          game.hud?.toast?.(`CH${this.channel} chuyển CC: mạch đòi > ${ch.iset.toFixed(3)} A → nguồn hạ áp xuống ${V.toFixed(2)} V để giữ dòng`, { kind: 'info' });
        }
        if (!psuEl.cc) this.ccWarned = false;
      } else this.lab.psu.setLoad(this.channel, Infinity);
    }
    this.visT -= dt;
    if (this.visT <= 0) { this.visT = 1 / 20; this._visuals(nl); }
  }

  // ------------------------------------------------------------------ hiển thị
  _visuals(nl) {
    const game = this.game;
    const seen = new Set();
    for (const [uid, els] of nl.partEls) {
      const it = this.items.get(uid);
      if (!it) continue;
      seen.add(uid);
      const el = els[0];
      if (!el) continue;
      const def = it.def;
      if ('brightness' in el) {
        // [hàn] LED quá nhiệt khi hàn (solder-pro.js → state.heatDamage.brightness): dây bond hỏng một phần → sáng mờ
        const b = (this.hasSource ? el.brightness : 0) * (it.state.heatDamage?.brightness ?? 1);
        if (Math.abs((it.state.lit ?? 0) - b) > 0.01) { it.state.lit = +b.toFixed(3); try { def.setLit?.(it, b); } catch { /* */ } }
        const on = b > 0.15;
        if (on && !this.ledOn.has(uid)) { this.ledOn.add(uid); game.events.emit('led:lit', { item: it, current: el.I, brightness: b }); }
        if (!on) this.ledOn.delete(uid);
      }
      if (def.spin && 'w' in el) { try { def.spin(it, this.hasSource ? el.V : 0); } catch { /* */ } it.state.rpm = el.rpm || 0; }
      if (el.status !== undefined) {
        const s = this.hasSource ? el.status : 'Chưa có nguồn';
        it.state.mcuStatus = s;
        it.state.running = !!el.running && this.hasSource;
        if (this.lastStatus.get(uid) !== s) {
          this.lastStatus.set(uid, s);
          game.events.emit('mcu:status', { item: it, status: s, running: it.state.running });
          if (this.hasSource) game.hud?.toast?.(`🧠 ${def.name}: ${s}`, { kind: el.running ? 'success' : 'info', short: true });
        }
      }
      if (def.electrical?.type === 'buck') it.state.vout = el.vout ?? null;
      // nóng đỏ
      const glow = el.dmg ? el.dmg.glow() : 0;
      if (glow > 0.02 || this.heated.has(uid)) {
        try { game.fx?.heat?.(it.state?.cable?.laid && it._cableGroup ? it._cableGroup : it.object, glow); } catch { /* */ }
        if (glow > 0.02) this.heated.add(uid); else this.heated.delete(uid);
      }
      it.state.tempC = el.T != null ? +el.T.toFixed(1) : undefined;
    }
    // linh kiện rời mạch → tắt
    for (const it of game.items.all) {
      if (seen.has(it.uid)) continue;
      if (it.state.lit) { it.state.lit = 0; try { it.def.setLit?.(it, 0); } catch { /* */ } this.ledOn.delete(it.uid); }
      if (it.state.voltage && it.def.spin && it.def.electrical?.type === 'dc-motor') { try { it.def.spin(it, 0); } catch { /* */ } }
      if (it.state.running) { it.state.running = false; it.state.mcuStatus = 'Chưa có nguồn'; this.lastStatus.delete(it.uid); }
    }
  }

  _fxSpot(obj) {
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return { pos: obj.getWorldPosition(new THREE.Vector3()), size: 4 };
    const s = box.getSize(_v);
    const c = box.getCenter(new THREE.Vector3());
    return { pos: new THREE.Vector3(c.x, box.max.y, c.z), size: Math.max(3, Math.min(25, s.length() / 3)) };
  }

  _events(nl) {
    const game = this.game, fx = game.fx;
    for (const e of nl.circuit.drainEvents()) {
      if (!e.up) continue;
      const key = String(e.el.key);
      const uid = key.startsWith('w:') ? key.slice(2) : key.split('/')[0];
      const it = this.items.get(uid) || game.items.byUid(uid);
      if (!it) continue;
      const obj = it.state?.cable?.laid && it._cableGroup ? it._cableGroup : it.object;
      const { pos, size } = this._fxSpot(obj);
      const name = it.def.name;
      const safe = (f) => { try { f(); } catch { /* fx không có trong môi trường này */ } };
      let kind = null;
      if (e.type === 'hot') { kind = null; }
      if (e.type === 'smoking') { kind = 'overheat'; safe(() => fx.smoke(pos, { size, duration: 5 })); game.audio?.play('hiss', { pos, vol: 0.5 }); }
      if (e.type === 'burning') { kind = 'burn'; safe(() => { fx.fire(pos, { size: size * 0.7, duration: 2.5 }); fx.smoke(pos, { size: size * 1.3, duration: 6 }); }); }
      if (e.type === 'dead') {
        kind = 'dead';
        safe(() => {
          fx.sparks(pos, { count: 50, speed: 45, size: Math.max(0.3, size * 0.08) });
          fx.flash(pos, { size: size * 4, duration: 0.25, color: 0xffe0b0 });
          fx.smoke(pos, { size, duration: 4 });
          fx.scorch(obj, 0.8);
        });
        game.audio?.play('zap', { pos, vol: 0.9 });
      }
      if (e.type === 'exploded') {
        kind = 'explode';
        safe(() => { fx.pop(obj, { force: 70, size: Math.max(4, size) }); fx.flash(pos, { size: size * 5, duration: 0.3, color: 0xfff1c0 }); });
        game.audio?.play('pop', { pos, vol: 1 });
      }
      if (e.type === 'pin') { kind = 'pin-damage'; safe(() => fx.sparks(pos, { count: 12, speed: 15, size: 0.3 })); game.audio?.play('zap', { pos, vol: 0.4 }); }
      if (e.type === 'dead' || e.type === 'exploded') {
        it.state.dead = true;
        it.state.damage = { state: e.type, cause: e.cause || '', mode: e.el.dmg?.deadMode || null };
        if (it.def.setLit) { it.state.lit = 0; try { it.def.setLit(it, 0); } catch { /* */ } }
        this.specKey = '';      // linh kiện chết đổi mô hình điện (hở/chập) — giữ nguyên phần tử
      }
      if (kind) {
        game.events.emit('fault', { kind, item: it, cause: e.cause || '', state: e.type, element: e.el });
        const msg = `${name}: ${STATE_VI[e.type] || 'hỏng chân'} — ${e.cause || ''}`;
        game.hud?.toast?.(msg, { kind: e.type === 'smoking' ? 'warn' : 'danger' });
      }
    }
  }

  // ------------------------------------------------------------------ tiện ích cho đo / nhiệm vụ
  /** điện áp (so với GND chung của mạch đang chạy) của khoá/att; null nếu điểm không nằm trong mạch có nguồn */
  v(keyOrAtt) {
    const k = this.game.netlist.keyOf(keyOrAtt);
    if (!k || !this.nl) return null;
    const r = this.game.netlist.get().uf.find(k);
    return this.nl.v(r);
  }
  elementsOf(item) { return this.nl?.partEls.get(item?.uid) || (this.nl?.wireEls.get(item?.uid) ? [this.nl.wireEls.get(item.uid)] : []); }
  psuElement() { return this.nl?.byKey.get(`psu-ch${this.channel}/psu`) || null; }
}

function isUnder(obj, anc) { for (let o = obj; o; o = o.parent) if (o === anc) return true; return false; }
function sameComp(comp, a, b) { return comp.find(Object.values(a.pins)[0]) === comp.find(Object.values(b.pins)[0]); }
