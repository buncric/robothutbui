// =============================================================================
// netlist.js — Từ "bố cục trên bàn" (linh kiện + dây) dựng ra mạch cho bộ giải.
//
// Đầu vào:
//   parts: [{ uid, type, props, label, pins: { tênChân: netKey } }]
//          netKey: một chuỗi đại diện cho "điểm nối" — vd 'bb:T12' (dải 5 lỗ a–e cột 12 của breadboard)
//          hoặc 'pin:<uid>:<chân>' (chân linh kiện không cắm vào breadboard)
//   wires: [{ id, a: netKey, b: netKey, len }]   — dây nhảy là PHẦN TỬ (có điện trở, nóng lên được)
//   meter: { mode, com: netKey|null, probe: netKey|null }
//   ground: netKey của cực − nguồn chính (= 0 V)
//   prev:  kết quả lần dựng trước → giữ nguyên phần tử (nhiệt độ, hư hỏng, điện áp tụ…) & nghiệm cũ
// =============================================================================
import { Circuit } from './solver.js';
import { Wire, Meter } from './elements.js';
import { LIB } from './library.js';

class UF {
  constructor() { this.p = new Map(); }
  find(a) {
    if (!this.p.has(a)) this.p.set(a, a);
    let r = a;
    while (this.p.get(r) !== r) r = this.p.get(r);
    let c = a;
    while (this.p.get(c) !== r) { const n = this.p.get(c); this.p.set(c, r); c = n; }
    return r;
  }
  union(a, b) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.p.set(ra < rb ? rb : ra, ra < rb ? ra : rb); }
  clone() { const u = new UF(); u.p = new Map(this.p); return u; }
}

export function buildCircuit({ parts = [], wires = [], meter = null, ground = null, powered = true }, prev = null) {
  const uf = new UF();
  // 1) gộp các chân nối liền bên trong linh kiện
  for (const pt of parts) {
    const L = LIB[pt.type];
    if (!L) continue;
    for (const k of L.pins) uf.find(pt.pins[k]);
    for (const [a, b] of L.bridges || []) uf.union(pt.pins[a], pt.pins[b]);
  }
  for (const w of wires) { uf.find(w.a); uf.find(w.b); }
  if (meter) { if (meter.com) uf.find(meter.com); if (meter.probe) uf.find(meter.probe); }
  if (ground) uf.find(ground);

  // 2) đếm số "chân" trên mỗi lưới để bỏ các lưới chỉ có một chân tuỳ chọn (chân MCU bỏ trống)
  const cnt = new Map();
  const bump = (key, opt) => { const r = uf.find(key); const c = cnt.get(r) || { all: 0, req: 0 }; c.all++; if (!opt) c.req++; cnt.set(r, c); };
  for (const pt of parts) { const L = LIB[pt.type]; if (!L) continue; for (const k of L.pins) bump(pt.pins[k], !!L.optional); }
  for (const w of wires) { bump(w.a, false); bump(w.b, false); }
  if (meter?.com) bump(meter.com, true);
  if (meter?.probe) bump(meter.probe, true);

  const c = new Circuit();
  c.powered = powered;
  const groot = ground ? uf.find(ground) : null;
  const nodeOfRoot = new Map();
  const nodeOf = (key) => {
    if (key == null) return null;
    const r = uf.find(key);
    if (nodeOfRoot.has(r)) return nodeOfRoot.get(r);
    let n;
    if (r === groot) n = 0;
    else {
      const k = cnt.get(r) || { all: 0, req: 0 };
      n = k.req >= 1 || k.all >= 2 ? c.node(`n:${r}`) : null;
    }
    nodeOfRoot.set(r, n);
    return n;
  };

  // 3) nhóm liên thông (qua dây còn tốt) — để PIC kiểm tra thạch anh & tụ 22 pF, và để tô sáng lưới
  const conn = uf.clone();
  const prevEls = prev?.byKey || new Map();
  for (const w of wires) { const pe = prevEls.get(`w:${w.id}`); if (!pe || !pe.dead) conn.union(w.a, w.b); }
  const groupOf = (key) => (key == null ? null : conn.find(key));
  const gGround = ground ? groupOf(ground) : null;

  const byKey = new Map();
  const partEls = new Map();
  const reuse = (key, Cls, nodes, params) => {
    let el = prevEls.get(key);
    if (el && el.constructor === Cls) { el.nodes = nodes; el.configure(params); }
    else el = new Cls(nodes, { ...params, key });
    el.key = key;
    c.add(el);
    byKey.set(key, el);
    return el;
  };

  // 4) phần tử của từng linh kiện
  for (const pt of parts) {
    const L = LIB[pt.type];
    if (!L) continue;
    const info = {};
    if (pt.type === 'pic') {
      const g13 = groupOf(pt.pins['13']), g14 = groupOf(pt.pins['14']);
      for (const q of parts) {
        if (q.type === 'crystal') {
          const a = groupOf(q.pins['1']), b = groupOf(q.pins['2']);
          if ((a === g13 && b === g14) || (a === g14 && b === g13)) info.crystal = true;
        }
      }
      let caps = 0;
      for (const q of parts) {
        if (q.type !== 'ceramic' || (q.props?.C ?? 1) > 1e-9) continue;
        const a = groupOf(q.pins['1']), b = groupOf(q.pins['2']);
        for (const g of [g13, g14]) if ((a === g && b === gGround) || (b === g && a === gGround)) caps++;
      }
      info.caps = caps >= 2;
    }
    const list = [];
    const B = {
      info,
      n: (name) => nodeOf(pt.pins[name]),
      int: (name) => c.node(`${pt.uid}/${name}`),
      add: (sub, Cls, nodes, params) => {
        const el = reuse(`${pt.uid}/${sub}`, Cls, nodes, { ...params, label: pt.label || params.label });
        list.push(el);
        return el;
      },
    };
    L.make(B, pt.props || {});
    partEls.set(pt.uid, list);
  }

  // 5) dây nhảy
  const wireEls = new Map();
  for (const w of wires) {
    const len = w.len ?? 100;
    const el = reuse(`w:${w.id}`, Wire, [nodeOf(w.a), nodeOf(w.b)], { R: 0.02 + 0.00009 * len, label: w.label || 'Dây nối' });
    wireEls.set(w.id, el);
  }

  // 6) đồng hồ vạn năng
  let meterEl = null;
  if (meter && meter.mode && meter.mode !== 'off') {
    meterEl = reuse('meter', Meter, [nodeOf(meter.com), nodeOf(meter.probe)], { mode: meter.mode, label: 'Đồng hồ vạn năng' });
  } else if (prevEls.get('meter')) byKey.set('meter', prevEls.get('meter'));   // giữ trạng thái cầu chì

  // 7) giữ nghiệm cũ (hội tụ nhanh, tụ không "giật")
  if (prev?.circuit) {
    const pc = prev.circuit;
    c._prepare();
    for (let i = 1; i < c.nodeNames.length; i++) {
      const j = pc.nodeIndex.get(c.nodeNames[i]);
      if (j > 0) c.x[i - 1] = pc.v(j);
    }
    c.t = pc.t;
  }

  return {
    circuit: c, byKey, partEls, wireEls, meter: meterEl,
    nodeOf, groupOf, ground: groot,
    /** điện áp của một điểm nối (so với GND chung), null nếu lưới không có nút */
    v(key) { const n = nodeOf(key); return n == null ? null : c.v(n); },
  };
}
