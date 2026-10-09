// Khung chung cho module hạ áp (buck) có trimmer chỉnh áp: XL4015, LM2596. KHÔNG export default.
import { PM, text, padRecord, padsOnce } from '../_shared.js';
import { moduleDef, wirePadSocket, ud } from './module.js';
import { trimmer3296 } from './pcb.js';

/**
 * cfg: { id, name, w, d, padX, padZ, vref=1.25, voutMax, vinRange, ioutA, fsw, defaultV, trim:{x,z,ry}, fill(B), silk(g…), chip }
 *      pads: { 'IN+': [x, z], 'IN−': …, 'OUT+': …, 'OUT−': … } (tuỳ chọn, ghi đè padX/padZ — pad lệch theo CAD)
 *      cad: 'boards/…' (GLB: gốc = mặt dưới PCB = gốc item; pad_INP/INN/OUTP/OUTN, núm trimmer 'trim_vadj')
 * Vặn trimmer: def.turnTrimmer(inst, vòng) (25 vòng hết hành trình). def.outputVoltage(inst, vin) → V ra không tải.
 * Khi có CAD: núm 'trim_vadj' là subpart 'knob' (manifest) — đồng bộ hai chiều với trimTurns (0…25 vòng ↔ 0…9000°).
 */
const TURNS = 25;
const CAD_PAD = { 'IN+': 'pad_INP', 'IN−': 'pad_INN', 'OUT+': 'pad_OUTP', 'OUT−': 'pad_OUTN' };
const trimKnob = (inst) => (inst.subparts || []).find((q) => q.type === 'knob' && /trim/i.test(q.name)) || null;

export function buckDef(cfg) {
  const { padX, padZ } = cfg;
  const pz = cfg.pads || {};
  const PADS = [['IN+', -padX, -padZ], ['IN−', -padX, padZ], ['OUT+', padX, -padZ], ['OUT−', padX, padZ]].map(([n, x, z]) => (pz[n] ? [n, pz[n][0], pz[n][1]] : [n, x, z]));
  const T = 1.6;
  const vmin = cfg.vref ?? 1.25, vmax = cfg.voutMax;
  const vOf = (turns) => vmin + (vmax - vmin) * Math.max(0, Math.min(25, turns)) / 25;
  const turnsOf = (v) => ((v - vmin) / (vmax - vmin)) * 25;
  const def = moduleDef({
    id: cfg.id, name: cfg.name, lessonId: 'buck-xl4015', massG: cfg.massG, w: cfg.w, d: cfg.d, mask: PM.maskBlue, padsOnly: true,
    holes: cfg.holes || [], height: cfg.height ?? 14, r: 1.0,
    thPads: PADS.map(([, x, z]) => [x, z]),
    extraPins: PADS.map(([n, x, z]) => ({ id: n, name: n, pos: [x, T + 0.05, z], dir: [0, 1, 0], extra: { pad: true, polarity: n.endsWith('+') ? '+' : '−' } })),
    fill: cfg.fill,
    silk(g, W, H, s, X, Z) {
      const c = '#f2f4f6';
      PADS.forEach(([n, x, z]) => text(g, n, X(x + (x < 0 ? 4.2 : -4.4)), Z(z), 1.3 * s, { color: c }));
      cfg.silk?.(g, W, H, s, X, Z);
    },
    extra(root, ctx) {
      const tr = trimmer3296(root, cfg.trim.x, ctx.top, cfg.trim.z, cfg.trim.ry || 0);
      ud(root, 'trim', tr);
    },
    sockets(inst) { return PADS.map(([n, x, z]) => wirePadSocket(inst, n, [x, T + 0.05, z])); },
    extraDef: {
      ...(cfg.cad ? {
        cad: cfg.cad,
        cadOptions: { onBottom: false, offset: [0, 0, 0], ...(cfg.cadOptions || {}) },
        cadPinNode: (p) => CAD_PAD[p.id] || null,
      } : {}),
      init(inst) { setTrim(inst, inst.state?.trimTurns ?? turnsOf(cfg.defaultV)); },
      /** đồng bộ núm trimmer CAD (subpart knob) ↔ trimTurns */
      update(inst) {
        const sp = trimKnob(inst);
        if (!sp) return;
        const st = inst.state || (inst.state = {});
        if (!sp._buck) {
          sp._buck = true;
          sp.spec.min_deg = 0; sp.spec.max_deg = TURNS * 360; sp.spec.detents = TURNS * 24;
          sp.axis.set(0, -1, 0);                 // quay thuận chiều kim đồng hồ (nhìn từ trên) khi tăng áp
          sp.state.value = (st.trimTurns ?? turnsOf(cfg.defaultV)) / TURNS; sp._v = sp.state.value; sp.apply();
        } else if (sp.state.value !== sp._v) {
          sp._v = sp.state.value;
          st.trimTurns = sp.state.value * TURNS;   // người chơi vặn núm (subpart) → áp ra đổi theo
        }
      },
      /** Vặn vít trimmer `d` vòng (dương = cùng chiều kim đồng hồ = tăng áp ra). Trả { ok, turns, vout } */
      turnTrimmer(inst, d = 1) {
        const st = inst.state || (inst.state = {});
        const cur = st.trimTurns ?? turnsOf(cfg.defaultV);
        const nx = Math.max(0, Math.min(25, cur + d));
        setTrim(inst, nx);
        return { ok: true, turns: +nx.toFixed(2), vout: +vOf(nx).toFixed(2), endStop: nx === 0 || nx === 25 ? 'Hết hành trình — vít trượt (click click)' : null };
      },
      /** Điện áp ra không tải (V) với điện áp vào vin (bão hoà khi vin thấp) */
      outputVoltage(inst, vin = cfg.vinRange[1]) {
        const vset = vOf(inst?.state?.trimTurns ?? turnsOf(cfg.defaultV));
        return +Math.max(0, Math.min(vset, vin - cfg.dropout)).toFixed(3);
      },
      solderPads(inst) {
        return padsOnce(inst, () => PADS.map(([n, x, z]) => padRecord(n, [x, T + 0.05, z], { side: 'top', ring: 1.4, hole: 0.65, thermalMass: 3, kind: 'wire-pad' })));
      },
    },
    electrical: {
      type: 'buck', chip: cfg.chip, vin: cfg.vinRange, vout: [vmin, vmax], ioutA: cfg.ioutA, fswHz: cfg.fsw, efficiency: cfg.eff ?? 0.9, dropoutV: cfg.dropout,
      input: ['IN+', 'IN−'], output: ['OUT+', 'OUT−'], commonGround: true, reversePolarity: 'phá huỷ IC (không có diode chống ngược)',
    },
    meta: { trimmer: { turnsTotal: 25, defaultV: cfg.defaultV, cwIncreases: true } },
  });
  function setTrim(inst, turns) {
    const tr = inst.object.userData.trim;
    if (tr) tr.screw.rotation.y = -turns * Math.PI * 2;
    (inst.state ||= {}).trimTurns = turns;
    const sp = trimKnob(inst);
    if (sp?._buck) { sp.state.value = turns / TURNS; sp._v = sp.state.value; sp.apply(); }
  }
  return def;
}
