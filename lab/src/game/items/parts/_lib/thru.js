// Linh kiện xuyên lỗ: vỏ DIP, đế DIP, TO-220, thân điện trở/diode, LED, tụ, thạch anh + bộ khung "linh kiện có chân dây".
// KHÔNG export default.
import {
  THREE, PM, cached, colorMat, ownMat, gBox, gCyl, gLathe, gDisc, extrudeY, roundRectShape, circlePath, taperBox, tf,
  staticParts, instanced, decal, text, Leads, axialPaths, radialPaths, trimPaths, minAxialSpanN, PITCH, finalizeDef, ud,
  socketSpec, socketsOnce, anchor, orientationByAxis, fitsKind,
} from '../_shared.js';
import { splayCadPins, cadNodes, hideMeshes, isMetal, cropMesh } from './cad.js';

// ============================================================================= khung linh kiện có chân dây
/**
 * Tạo def cho linh kiện có chân dây (hướng trục hoặc hướng tâm).
 * cfg: { id, name, category, lessonId, massG, size, body(B, game) → static fill, extra(root, game, inst?) → object dynamic,
 *        axial: { halfBody, axisY, leadLen, names, radius, square }  hoặc
 *        radial: { leads:[{name,x,z,len}], topY, radius, square, span0 },
 *        pinInfo: { name: {…} }, insertInto, orientationKey, electrical, … }
 */
export function leadedDef(cfg) {
  const ax = cfg.axial, rad = cfg.radial;
  const leadOpts = { radius: (ax || rad).radius ?? 0.3, radial: (ax || rad).square ? 4 : 6, square: !!(ax || rad).square, mat: (ax || rad).mat || PM.lead, bendR: (ax || rad).bendR ?? 0.7 };
  const pinInfo = cfg.pinInfo || {};
  const pathsFor = (st = {}) => {
    let paths;
    if (ax) paths = axialPaths({ ...ax, span: st.leadSpanN ? st.leadSpanN * PITCH : null });
    else paths = radialPaths(rad.leads, rad.topY, { span: st.leadSpanN ? st.leadSpanN * PITCH : null });
    if (!paths) return null;
    if (st.trimProtrude != null) paths = trimPaths(paths, seatOf(st), st.trimProtrude);
    return paths;
  };
  const seatOf = (st = {}) => (ax ? (st.leadSpanN ? 0 : ax.axisY) : rad.topY);
  const defaultPaths = pathsFor({});
  const lp = new Leads(new THREE.Group(), leadOpts).set(defaultPaths);
  const pins = lp.pins(pinInfo);

  const def = {
    kind: 'part',
    ...cfg.meta,
    id: cfg.id, name: cfg.name, category: cfg.category, lessonId: cfg.lessonId, massG: cfg.massG, size: cfg.size,
    grip: cfg.grip || { pose: 'pinch', offset: [0, cfg.size[1] * 0.6, 0], rot: [0, 0, 0] },
    pins,
    leadBendable: true,
    leadStyle: ax ? 'axial' : 'radial',
    minSpanN: ax ? minAxialSpanN(ax.halfBody) : 1,
    insertInto: cfg.insertInto || ['pcb-hole', 'bb-hole'],
    mount: { seatY: seatOf({ leadSpanN: ax ? minAxialSpanN(ax.halfBody) : null }), pitch: PITCH, needsBend: !!ax },
    orientationKey: cfg.orientationKey || null,
    electrical: cfg.electrical || null,
    // CAD thật chỉ thay THÂN: chân dây thủ tục (mesh 'leads') giữ nguyên — bẻ/cắt/hàn được; chân CAD (pin_*, chỉ là đoạn
    // ngắn dưới mặt PCB) bị ẩn. cfg.cadOptions bổ sung offset/rotate/onLoad (cắt phần chân kim loại gộp trong node thân…).
    ...(cfg.cad ? {
      cad: cfg.cad,
      cadOptions: { onBottom: false, ...(cfg.cadOptions || {}), hide: ['pin_*', ...(cfg.cadOptions?.hide || [])], keep: ['leads', ...(cfg.cadOptions?.keep || [])] },
    } : {}),
    build(game) {
      const root = new THREE.Group();
      root.name = cfg.id;
      root.add(staticParts(cfg.id + ':body', (B) => cfg.body(B, game)));
      const leads = new Leads(root, leadOpts).set(defaultPaths);
      ud(root, 'leads', leads);
      ud(root, 'leadState', {});
      ud(root, 'pins', () => leads.pins(pinInfo));
      cfg.extra?.(root, game);
      return root;
    },
    init(inst) { if (inst?.state && (inst.state.leadSpanN || inst.state.trimProtrude != null)) applyLeads(inst); },
    /** Bẻ chân 90° cho khoảng cách n × 2.54 mm (n = null → duỗi thẳng lại) */
    bendLeads(inst, n) {
      if (n != null && ax && n < def.minSpanN) return { ok: false, reason: `Thân dài ${(ax.halfBody * 2).toFixed(1)} mm — cần ít nhất ${def.minSpanN} × 2.54 mm` };
      const st = inst.state || (inst.state = {});
      const prev = st.leadSpanN;
      st.leadSpanN = n || null;
      if (st.trimProtrude != null && n !== prev) { st.leadSpanN = prev; return { ok: false, reason: 'Chân đã cắt ngắn — không bẻ lại được' }; }
      if (!applyLeads(inst)) { st.leadSpanN = prev; applyLeads(inst); return { ok: false, reason: 'Không bẻ được với khoảng cách này' }; }
      st.bendCount = (st.bendCount || 0) + 1;
      return { ok: true, spanMm: n ? n * PITCH : null, seatY: seatOf(st), fatigue: st.bendCount > 3 ? 'Chân đã bẻ nhiều lần — dễ gãy' : null };
    },
    /** Cắt chân (kìm cắt) còn nhô `protrudeMm` dưới mặt tựa (mặt board) */
    trimLeads(inst, protrudeMm = 1.0) {
      const st = inst.state || (inst.state = {});
      st.trimProtrude = protrudeMm;
      applyLeads(inst);
      return { ok: true };
    },
    /** Linh kiện đã sẵn sàng cắm board chưa (hướng trục phải bẻ chân trước) */
    insertReady(inst) {
      if (ax && !inst?.state?.leadSpanN) return { ok: false, reason: 'Chưa bẻ chân — dùng nhíp bẻ 90° theo bước lỗ' };
      return { ok: true };
    },
    footprint(inst) {
      const p = def.getPins(inst);
      return p.map((q) => [q.pos[0], q.pos[2]]);
    },
    ...cfg.extraDef,
  };
  const userInit = cfg.extraDef?.init;
  def.init = (inst, game) => {
    if (inst?.state && (inst.state.leadSpanN || inst.state.trimProtrude != null)) applyLeads(inst);
    userInit?.(inst, game);
  };
  function applyLeads(inst) {
    const leads = inst?.object?.userData?.leads;
    const paths = pathsFor(inst.state || {});
    if (!paths) return false;
    leads?.set(paths);
    return true;
  }
  def.getPins = (inst) => inst?.object?.userData?.pins?.() ?? pins;
  return finalizeDef(def);
}

// ============================================================================= DIP
/** Toạ độ chân n (1..N) của DIP: chân 1 ở (−X, +Z), đếm ngược chiều kim đồng hồ nhìn từ trên */
export function dipPinXZ(num, n, row) {
  const half = n / 2, i = num - 1;
  if (i < half) return [-((half - 1) * PITCH) / 2 + i * PITCH, row / 2];
  return [((half - 1) * PITCH) / 2 - (i - half) * PITCH, -row / 2];
}

/** Thân DIP có khấc nửa tròn đầu −X (shape) */
function dipBodyShape(D, E, notchR) {
  const s = new THREE.Shape();
  const x0 = -D / 2, x1 = D / 2, z0 = -E / 2, z1 = E / 2, r = 0.25;
  s.moveTo(x0 + r, z0); s.lineTo(x1 - r, z0); s.quadraticCurveTo(x1, z0, x1, z0 + r);
  s.lineTo(x1, z1 - r); s.quadraticCurveTo(x1, z1, x1 - r, z1);
  s.lineTo(x0 + r, z1); s.quadraticCurveTo(x0, z1, x0, z1 - r);
  if (notchR > 0) { s.lineTo(x0, notchR); s.absarc(x0, 0, notchR, Math.PI / 2, -Math.PI / 2, true); }
  s.lineTo(x0, z0 + r); s.quadraticCurveTo(x0, z0, x0 + r, z0);
  return s;
}

/** Hình học 1 chân DIP (hàng +Z), gốc ở đầu chân; hMid = độ cao điểm ra khỏi thân; stub = đoạn ngang vào thân (−Z) */
export function dipLeadGeo(L, hMid, stub, { b = 0.46, b1 = 1.27, c = 0.25 } = {}) {
  return cached(`diplead:${L}:${hMid}:${stub}:${b}:${b1}:${c}`, () => {
    const parts = [];
    const add = (g, x, y, z) => { const n = g.index ? g.toNonIndexed() : g.clone(); n.translate(x, y, z); n.deleteAttribute('uv'); parts.push(n); };
    add(taperBox(b, b * 0.55, 0.35, c, c), 0, 0.175, 0);                 // mũi vát
    add(new THREE.BoxGeometry(b, L - 0.95, c), 0, 0.35 + (L - 0.95) / 2, 0);
    add(taperBox(b1, b, 0.6, c, c), 0, L - 0.3, 0);                      // vai côn
    add(new THREE.BoxGeometry(b1, hMid - L + c / 2, c), 0, L + (hMid - L + c / 2) / 2, 0);
    add(new THREE.BoxGeometry(b1, c, stub), 0, hMid, -stub / 2 + c / 2);  // đoạn ngang vào thân
    const g = mergeAll(parts);
    g.computeVertexNormals();
    return g;
  });
}
function mergeAll(list) {
  // gộp đơn giản (cùng thuộc tính position/normal)
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

/**
 * Def IC DIP. cfg: { id, name, n, row (7.62 | 15.24), D, E1, A2, marking(g,W,H,s), pinNames:[[num,name,group,desc]…], massG, lessonId, electrical }
 * Gốc: đầu chân (y = 0). Mặt tựa (seating plane) y = L = 3.3. Thân từ L + A1.
 */
export function dipDef(cfg) {
  const { n, row, D, E1, A2 } = cfg;
  const L = 3.3, A1 = 0.5;
  const yBody = L + A1, yTop = yBody + A2;
  const hMid = yBody + A2 * 0.42;
  const stub = row / 2 - E1 / 2 + 0.35;
  const SPLAY = cfg.splayDeg ?? 6;
  const pinList = [];
  for (let k = 1; k <= n; k++) {
    const [x, z] = dipPinXZ(k, n, row);
    const nm = cfg.pinNames?.find((p) => p[0] === k);
    pinList.push({ id: String(k), num: k, name: nm ? nm[1] : String(k), group: nm?.[2], desc: nm?.[3], pos: [+x.toFixed(3), 0, z], dir: [0, -1, 0] });
  }
  const leadMats = (splayDeg) => {
    const a = -splayDeg * Math.PI / 180;
    return pinList.map((p) => {
      const side = p.pos[2] > 0 ? 0 : Math.PI;
      const m = new THREE.Matrix4().makeTranslation(p.pos[0], 0, p.pos[2]);
      m.multiply(new THREE.Matrix4().makeRotationY(side));
      m.multiply(new THREE.Matrix4().makeTranslation(0, hMid, 0));
      m.multiply(new THREE.Matrix4().makeRotationX(a));
      m.multiply(new THREE.Matrix4().makeTranslation(0, -hMid, 0));
      return m;
    });
  };
  const def = {
    id: cfg.id, name: cfg.name, kind: 'part', category: 'ic', lessonId: cfg.lessonId, massG: cfg.massG,
    size: [D + 0.6, yTop, row + 1.6],
    grip: { pose: 'pinch', offset: [0, yTop, 0], rot: [0, 0, 0] },
    pins: pinList,
    dip: { n, row, pitch: PITCH },
    insertInto: [`dip${n}`, row > 10 ? 'bb-span-600' : 'bb-span', 'bb-span', 'pcb-hole'].filter((v, i, a) => a.indexOf(v) === i),
    mount: { seatY: L, pitch: PITCH, rowSpacing: row },
    orientationKey: { pin: '1', axis: 'x', sign: -1, mark: 'notch', note: 'Khấc + chấm ở đầu −X; chân 1 ở góc (−X, +Z)' },
    electrical: cfg.electrical || null,
    footprint: pinList.map((p) => [p.pos[0], p.pos[2]]),
    // CAD thật (boards/<ic>): gốc GLB = tâm, y = 0 là mặt tựa, chân 1 ở (−X, +Z), đếm ngược chiều kim đồng hồ — trùng hệ item,
    // chỉ dời lên L (đầu chân y = 0). Chân CAD (pin_1…pin_n) được xoè theo trạng thái 'splay' giống chân thủ tục.
    ...(cfg.cad ? {
      cad: cfg.cad,
      cadOptions: { onBottom: false, offset: [0, L, 0], onLoad: (glb, root) => splayCadPins(root, root.userData.splay ?? SPLAY, hMid) },
    } : {}),
    build(game) {
      const root = new THREE.Group();
      root.name = cfg.id;
      root.add(staticParts(cfg.id + ':body', (B) => {
        const shape = dipBodyShape(D, E1, 1.0);
        const lo = cached(`dipbody:lo:${D}:${E1}:${A2}`, () => extrudeY(shape, A2 * 0.45, { bevel: 0.16, y0: yBody, curveSeg: 10 }));
        const hi = cached(`dipbody:hi:${D}:${E1}:${A2}`, () => extrudeY(shape, A2 * 0.55, { bevel: 0.2, y0: yBody + A2 * 0.45, curveSeg: 10 }));
        B.add(lo, PM.epoxy); B.add(hi, PM.epoxy);
        // vết đẩy khuôn + chấm chân 1
        B.add(gCyl(0.75, 0.75, 0.04, 20), PM.epoxyMark, { x: -D / 2 + 2.6, y: yTop - 0.01, z: E1 / 2 - 2.2 }, { shadow: false });
        for (const s of [-1, 1]) B.add(gCyl(1.1, 1.1, 0.03, 24), PM.epoxyGloss, { x: s * (D / 2 - 3.6), y: yTop - 0.01, z: -E1 / 2 + 2.4 }, { shadow: false });
        B.obj(() => decal(`mark:${cfg.id}`, D - 2, E1 - 1.5, cfg.marking, { y: yTop + 0.012, pxPerMm: 28, rough: 0.7 }));
      }));
      const legs = instanced(dipLeadGeo(L, hMid, stub), PM.lead, leadMats(SPLAY), { shadow: true });
      legs.name = 'dip-leads';
      root.add(legs);
      ud(root, 'legs', legs);
      ud(root, 'splay', SPLAY);
      ud(root, 'pins', () => splayPins(pinList, root.userData.splay, hMid));
      return root;
    },
    init(inst) { if (inst.state?.legsStraight) def.straightenLegs(inst); },
    /** Nắn chân: chân DIP mới xoè ~6°, phải tì cả hàng xuống bàn ép thẳng trước khi cắm */
    straightenLegs(inst) {
      const r = inst.object.userData;
      r.splay = 0;
      leadMats(0).forEach((m, i) => r.legs.setMatrixAt(i, m));
      r.legs.instanceMatrix.needsUpdate = true;
      if (r.cad) splayCadPins(inst.object, 0, hMid);
      (inst.state ||= {}).legsStraight = true;
      return { ok: true };
    },
    legsReady(inst) { return inst?.object?.userData?.splay === 0 || inst?.state?.legsStraight ? { ok: true } : { ok: true, warn: 'Chân còn xoè ~6° — nên nắn thẳng trước, dễ cong chân' }; },
  };
  def.getPins = (inst) => inst?.object?.userData?.pins?.() ?? pinList;
  return finalizeDef(def);
}
function splayPins(list, deg, hMid) {
  if (!deg) return list;
  const a = deg * Math.PI / 180;
  return list.map((p) => {
    const s = Math.sign(p.pos[2]);
    return { ...p, pos: [p.pos[0], +(hMid * (1 - Math.cos(a))).toFixed(3), +(p.pos[2] + s * hMid * Math.sin(a)).toFixed(3)], dir: [0, -Math.cos(a), +(s * Math.sin(a)).toFixed(4)] };
  });
}

// ============================================================================= đế DIP
/**
 * Def đế IC DIP (dual-wipe). Gốc: đầu chân đế; mặt tựa trên board y = 3.0; mặt trên đế y = 3.0 + H.
 * Cung cấp khe kind 'dip<n>' (IC cắm vào) — phát hiện cắm ngược theo hướng khấc.
 */
export function dipSocketDef({ id, name, n, row, cad = null }) {
  // kích thước theo CAD thật (vendor/dip_<n>_w…_socket, KiCad/step.parts): chân 3.78 dưới mặt tựa, thân cao 4.01,
  // dài n/2 × 2.54, rộng row + 2.54
  const T = 3.78, H = 4.01, half = n / 2;
  const len = half * PITCH, W = row + 2.54;
  const top = T + H;
  const pins = [];
  for (let k = 1; k <= n; k++) { const [x, z] = dipPinXZ(k, n, row); pins.push({ id: String(k), num: k, name: `S${k}`, pos: [+x.toFixed(3), 0, z], dir: [0, -1, 0] }); }
  const def = {
    id, name, kind: 'part', category: 'socket', lessonId: 'pic16f877a', massG: n === 40 ? 4.5 : 1.5,
    size: [len, top, W], grip: { pose: 'pinch', offset: [0, top, 0], rot: [0, 0, 0] },
    pins,
    insertInto: ['pcb-hole', row > 10 ? 'bb-span-600' : 'bb-span'],
    mount: { seatY: T, pitch: PITCH, rowSpacing: row },
    orientationKey: { pin: '1', axis: 'x', sign: -1, mark: 'notch' },
    footprint: pins.map((p) => [p.pos[0], p.pos[2]]),
    provides: [`dip${n}`],
    // CAD: hàng chân dọc Z, chân 1 ở (−X_cad, −Z_cad) → quay +90° quanh Y: (x, z) → (z, −x) = chân 1 ở (−X, +Z) như item
    ...(cad ? { cad, cadOptions: { rotateY: Math.PI / 2, onBottom: false, offset: [0, T, 0] } } : {}),
    build() {
      const root = new THREE.Group();
      root.name = id;
      root.add(staticParts(id, (B) => {
        // khung: 2 thanh dọc chứa tiếp điểm + 2 thanh ngang đầu, giữa rỗng
        const rail = cached(`dsrail:${len}`, () => {
          const s = roundRectShape(len, W - row, 0.3);
          for (let i = 0; i < half; i++) s.holes.push(roundRectShape(1.0, 1.25, 0.15, -((half - 1) * PITCH) / 2 + i * PITCH, 0));
          return extrudeY(s, H, { bevel: 0.12, y0: T, curveSeg: 4 });
        });
        for (const sz of [1, -1]) B.add(rail, PM.pbtBlack, { z: sz * row / 2 });
        const endBar = cached(`dsend:${row}`, () => {
          const s = roundRectShape(2.2, row - 2.54, 0.2);
          return extrudeY(s, H - 0.6, { bevel: 0.1, y0: T + 0.6 });
        });
        B.add(endBar, PM.pbtBlack, { x: len / 2 - 1.1 });
        // đầu khấc (chân 1): thanh ngang có khấc chữ U
        const notchBar = cached(`dsnotch:${row}`, () => {
          const s = new THREE.Shape();
          const w = 2.2, d = row - 2.54;
          s.moveTo(-w / 2, -d / 2); s.lineTo(w / 2, -d / 2); s.lineTo(w / 2, d / 2); s.lineTo(-w / 2, d / 2);
          s.lineTo(-w / 2, 1.1); s.absarc(-w / 2, 0, 1.1, Math.PI / 2, -Math.PI / 2, true); s.lineTo(-w / 2, -d / 2);
          return extrudeY(s, H - 0.6, { bevel: 0.1, y0: T + 0.6, curveSeg: 10 });
        });
        B.add(notchBar, PM.pbtBlack, { x: -len / 2 + 1.1 });
        // gân giữa
        const ribs = Math.max(1, Math.floor(half / 7));
        for (let i = 1; i <= ribs; i++) B.add(gBox(1.2, 1.0, row - 2.4), PM.pbtBlack, { x: -len / 2 + (len * i) / (ribs + 1), y: T + 0.5 });
        // đế chân: chân dẹt 0.5 × 0.25 dưới mặt tựa, lò xo tiếp điểm trong lỗ
        const tips = pins.map((p) => tf({ x: p.pos[0], y: T / 2, z: p.pos[2] }));
        B.inst(dsPinGeo(T), PM.lead, tips, { shadow: true });
        B.inst(gBox(0.7, 1.0, 0.15), PM.gold, pins.map((p) => tf({ x: p.pos[0], y: top - 0.9, z: p.pos[2] + 0.38 })));
        B.inst(gBox(0.7, 1.0, 0.15), PM.gold, pins.map((p) => tf({ x: p.pos[0], y: top - 0.9, z: p.pos[2] - 0.38 })));
        B.inst(gBox(0.9, 0.05, 1.1), PM.hole, pins.map((p) => tf({ x: p.pos[0], y: top - 1.6, z: p.pos[2] })));
        // in nổi chữ trên thân
        B.obj(() => decal(`dsock:${n}`, len - 5, 1.6, (g, W2, H2) => { text(g, `${n}P  DIP  ${row > 10 ? '600' : '300'}mil`, W2 / 2, H2 / 2, H2 * 0.7, { color: '#5a5d63' }); }, { y: top + 0.01, z: row / 2 + 0.95, pxPerMm: 18 }));
      }));
      return root;
    },
    sockets(inst) {
      return socketsOnce(inst, () => {
        const a = anchor(inst.object, `dip${n}`, [0, top, 0]);
        return [socketSpec(inst, {
          id: `dip${n}`, kind: `dip${n}`, anchor: a, surfaceY: 0,
          pin1Local: [dipPinXZ(1, n, row)[0], 0, row / 2],
          accepts(item, ctx) {
            const d = item?.def;
            if (!d) return { ok: false, reason: 'Không phải linh kiện' };
            if (!fitsKind(item, `dip${n}`)) {
              if (d.dip) return { ok: false, reason: `IC ${d.dip.n} chân không vừa đế ${n} chân` };
              return { ok: false, reason: `Không cắm vừa đế DIP-${n}` };
            }
            const orientation = orientationByAxis(item, a, 'x', ctx);
            if (orientation === 'offset') return { ok: false, orientation, reason: 'Xoay 90° — hàng chân không khớp đế' };
            const legs = d.legsReady?.(item);
            return { ok: true, orientation, warn: orientation === 'reversed' ? 'Khấc IC ngược khấc đế!' : legs?.warn };
          },
          // IC: mặt tựa (seatY) của IC chạm mặt trên đế
          poseFor(item) { const seat = item?.def?.mount?.seatY ?? 3.3; return new THREE.Matrix4().makeTranslation(0, -seat, 0); },
          contacts: pins.map((p) => ({ pin: p.id, local: [p.pos[0], top, p.pos[2]] })),
        })];
      });
    },
  };
  def.getPins = () => pins;
  return finalizeDef(def);
}
function dsPinGeo(T) {
  return cached(`dspin:${T}`, () => {
    const a = new THREE.BoxGeometry(0.5, T - 0.4, 0.25).toNonIndexed();
    const b = taperBox(0.5, 0.25, 0.4, 0.25, 0.25).toNonIndexed(); b.translate(0, -(T - 0.4) / 2 - 0.2, 0);
    const c = new THREE.BoxGeometry(0.9, 0.6, 0.3).toNonIndexed(); c.translate(0, T / 2 - 0.3, 0);
    for (const g of [a, b, c]) g.deleteAttribute('uv');
    const g = mergeAll([a, b, c]); g.computeVertexNormals(); return g;
  });
}

// ============================================================================= thân hướng trục (điện trở, DO-41)
export const RES_PROFILE = [[0.3, -3.3], [0.85, -3.25], [1.15, -3.08], [1.25, -2.75], [1.24, -2.35], [1.12, -1.95], [1.04, -1.7], [1.04, 1.7], [1.12, 1.95], [1.24, 2.35], [1.25, 2.75], [1.15, 3.08], [0.85, 3.25], [0.3, 3.3]];
/** Bán kính profile tại toạ độ trục t (nội suy) */
export function profileR(profile, t) {
  for (let i = 1; i < profile.length; i++) {
    const [r0, y0] = profile[i - 1], [r1, y1] = profile[i];
    if (t >= y0 && t <= y1) return r0 + ((t - y0) / (y1 - y0 || 1)) * (r1 - r0);
  }
  return profile[0][0];
}
/** Vành màu theo profile (dải [t0, t1]) phồng ra 1.5 % */
export function bandGeo(profile, t0, t1, key) {
  return cached(`band:${key}:${t0}:${t1}`, () => {
    const pts = [];
    const N = 6;
    for (let k = 0; k <= N; k++) { const t = t0 + ((t1 - t0) * k) / N; pts.push([profileR(profile, t) * 1.018 + 0.01, t]); }
    const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 24);
    return g;
  });
}

// ============================================================================= LED
/**
 * Def LED tròn xuyên lỗ. opt: { id, name, d (5|3), color, lensColor, vf, clear }
 * Gốc: đầu chân anốt (dài hơn). Mặt tựa (đáy vành) y = seat. Cạnh phẳng ở −X = catốt.
 */
export function ledDef({ id, name, d = 5, color = 0xff2020, lensColor, vf = 2.0, clear = false, wl = '' }) {
  const r = d / 2, fr = d === 5 ? 2.9 : 1.9, fh = 1.0, H = d === 5 ? 8.6 : 5.3;
  const LA = 27, LK = 25.0, seat = LA;
  const cyl = H - fh - r;
  const lensMatBase = new THREE.MeshPhysicalMaterial({
    color: lensColor ?? color, roughness: clear ? 0.05 : 0.35, metalness: 0, transparent: true, opacity: clear ? 0.45 : 0.72,
    emissive: color, emissiveIntensity: 0, clearcoat: 1, clearcoatRoughness: 0.1, depthWrite: false,
  });
  const lensGeo = cached(`ledlens:${d}`, () => {
    const prof = [[0, fh + cyl + r]];
    for (let k = 1; k <= 8; k++) { const a = (k / 8) * (Math.PI / 2); prof.push([Math.sin(a) * r, fh + cyl + Math.cos(a) * r]); }
    prof.push([r, fh], [0.01, fh]);
    return gLathe(`ledlens:${d}`, prof, 28);
  });
  const flangeGeo = cached(`ledflange:${d}`, () => {
    const cut = -fr + (d === 5 ? 0.55 : 0.4);          // cạnh phẳng (catốt) ở −X
    const zc = Math.sqrt(fr * fr - cut * cut);
    const a1 = Math.atan2(zc, cut), a0 = Math.atan2(-zc, cut);
    const sh = new THREE.Shape();
    sh.moveTo(cut, zc);
    sh.absarc(0, 0, fr, a1, a0, true);
    sh.lineTo(cut, zc);
    return extrudeY(sh, fh, { bevel: 0.08, curveSeg: 24 });
  });
  const body = (B) => {
    const g = B.group({ y: seat });
    // khung dẫn bên trong: đe (catốt, to) + cột (anốt)
    const fh2 = fh + cyl * 0.9;
    g.add(gBox(0.5, fh2 - 0.2, 0.5), PM.lead, { x: -PITCH / 2, y: (fh2 - 0.2) / 2 }, { shadow: false });
    g.add(gBox(0.5, fh2 - 0.6, 0.5), PM.lead, { x: PITCH / 2, y: (fh2 - 0.6) / 2 }, { shadow: false });
    g.add(gBox(1.6, 0.9, 0.4), PM.lead, { x: -PITCH / 2 + 0.45, y: fh2 - 0.2 }, { shadow: false });
    g.add(gCyl(0.55, 0.35, 0.45, 14, true), PM.lead, { x: -PITCH / 2 + 0.7, y: fh2 + 0.45 }, { shadow: false });
    g.add(gBox(0.3, 0.12, 0.3), colorMat(clear ? 0xf5e15a : 0x202024, { rough: 0.4 }), { x: -PITCH / 2 + 0.7, y: fh2 + 0.32 }, { shadow: false });
    g.add(gBox(0.9, 0.35, 0.4), PM.lead, { x: PITCH / 2 - 0.35, y: fh2 - 0.4 }, { shadow: false });
  };
  const def = leadedDef({
    id, name, category: 'semi', lessonId: 'diode', massG: d === 5 ? 0.3 : 0.15, size: [fr * 2, LA + H, fr * 2],
    radial: { leads: [{ name: 'K', x: -PITCH / 2, z: 0, len: LK }, { name: 'A', x: PITCH / 2, z: 0, len: LA }].map((l) => ({ ...l, len: l.len })), topY: seat, radius: 0.25, square: true, bendR: 0.5 },
    body,
    extra(root) {
      const lm = lensMatBase.clone();
      const lens = new THREE.Mesh(lensGeo, lm); lens.position.y = seat; lens.renderOrder = 3;
      const fl = new THREE.Mesh(flangeGeo, lm); fl.position.y = seat; fl.renderOrder = 3;
      lens.castShadow = fl.castShadow = true;
      root.add(lens, fl);
      ud(root, 'lensMat', lm);
    },
    pinInfo: { A: { polarity: 'anode', num: 2, longer: true }, K: { polarity: 'cathode', num: 1, flatSide: true } },
    orientationKey: { pin: 'K', axis: 'x', sign: -1, mark: 'flat+short-lead', note: 'Cạnh phẳng vành + chân ngắn = catốt (−)' },
    electrical: { type: 'led', vf, ifMax: 0.03, color: wl || name },
    // CAD thật vendor/led_d5_0mm | led_d3_0mm (KiCad): vành đặt ở y = 3 (đứng cách PCB), tâm thấu kính x = −0.2 (chân 1 = K ở −1.47,
    // cạnh phẳng −X) → dời (+0.2, seat − 3, 0). Thấu kính CAD (đỏ chung) nhận vật liệu thấu kính riêng của item (màu, trong suốt,
    // phát sáng theo setLit / sub-part 'led' màu của item); đoạn chân kim loại 0…3 mm trong node thân bị ẩn (chân dây thủ tục thay).
    // Giữ khung dẫn bên trong (static body thủ tục) nhìn xuyên thấu kính.
    cad: d === 5 ? 'vendor/led_d5_0mm' : 'vendor/led_d3_0mm',
    cadOptions: {
      offset: [0.2, seat - 3, 0],
      keep: [`static:${id}:body`],
      onLoad(glb, root) {
        const lm = root.userData.lensMat;
        for (const node of cadNodes(glb, 'led_*')) {
          hideMeshes(node, isMetal);
          node.traverse((m) => {
            if (!m.isMesh || isMetal(m)) return;
            cropMesh(m, root, (x, y) => y > seat - 2.5, `led${d}`);      // bỏ mặt nhỏ ở chân (y = 0 của CAD), nằm trong chân thủ tục
            if (lm) { m.material = lm; m.renderOrder = 3; root.userData.lensMesh ||= m; }
          });
          node.userData.interact = { type: 'led', color: '#' + new THREE.Color(color).getHexString(), label: `LED ${name}` };
        }
      },
    },
    extraDef: {
      /** Độ sáng 0..1 (dòng / 20 mA) — gọi từ bộ giải mạch */
      setLit(inst, level) {
        const u = inst?.object?.userData, ei = Math.max(0, level) * 3.2;
        if (u?.lensMat) u.lensMat.emissiveIntensity = ei;
        const cm = u?.lensMesh?.material;          // sub-part 'led' có thể đã thay bằng bản sao riêng
        if (cm && cm !== u.lensMat && 'emissiveIntensity' in cm) cm.emissiveIntensity = ei;
      },
      update(inst) { const lv = inst?.state?.lit; if (lv != null) def.setLit(inst, lv); },
    },
  });
  return def;
}
