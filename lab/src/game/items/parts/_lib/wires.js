// Dây cắm Dupont (jumper) và cuộn dây điện. KHÔNG export default.
import {
  THREE, PM, cached, gBox, gCyl, tubeGeo, staticParts, finalizeDef, P, wireMat, socketSpec, socketsOnce, anchor, fitsKind, ud, decal, text, tf, roundPolyline,
} from '../_shared.js';
import { headerPinGeo } from './pcb.js';
import { addCable, cableGeos, AWG } from './conn.js';

// ============================================================================= Dupont
const HL = 14, HS = 2.54, PIN = 6;
const WR = 0.65;   // bán kính vỏ dây 26 AWG (Ø1.3)
const housingGeo = () => cached('dupont:house', () => {
  // thân vuông 2.54, đuôi thu nhỏ chỗ bấm dây
  const g = gBox(HL - 2, HS, HS, 0.15, 1).clone();
  g.translate(-(HL - 2) / 2 - 2, 0, 0);
  return g;
});
function endInto(B, male) {
  // gốc ở MẶT CẮM (x = 0), thân kéo về −X (phía dây)
  B.add(housingGeo(), PM.pbtBlack, {});
  B.add(gBox(2, 2.0, 2.0, 0.3, 1), PM.pbtBlack, { x: -HL + 1, y: 0 });
  B.add(gBox(3.0, 0.35, 1.2), PM.pbtBlack, { x: -5.5, y: HS / 2 + 0.15 });            // lẫy khoá
  if (male) B.add(headerPinGeo(PIN + 3), PM.gold, tf({ x: PIN / 2 - 1.5, rz: -Math.PI / 2 }));
  else { B.add(gBox(0.05, 1.0, 1.0), PM.hole, { x: 0.01 }, { shadow: false }); B.add(gBox(2.0, 0.6, 0.6), PM.gold, { x: -1.6 }, { shadow: false }); }
  B.add(gCyl(1.0, 0.8, 2.5, 10), PM.lead, { x: -HL + 0.6, rz: Math.PI / 2 }, { shadow: false });   // đầu bấm lộ
}
/** Đường dây giữa 2 đầu: hình sin trong mặt phẳng XZ có độ dài cung ≈ len */
function wirePts(len) {
  const c = Math.max(30, Math.min(220, len * 0.6));
  const half = c / 2;
  const mk = (b) => { const pts = []; for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push(new THREE.Vector3(-half + c * t, WR + (1.27 - WR) * (Math.abs(t - 0.5) > 0.47 ? 1 : 0), b * Math.sin(Math.PI * t))); } return pts; };
  const L = (pts) => pts.reduce((s, p, i) => (i ? s + p.distanceTo(pts[i - 1]) : 0), 0);
  let lo = 0, hi = len;
  for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (L(mk(m)) < len) lo = m; else hi = m; }
  return { pts: mk((lo + hi) / 2), half };
}
/**
 * kind: 'mm' (đực–đực) | 'mf' (đực–cái) | 'ff' (cái–cái). Đầu A ở −X, đầu B ở +X (mặt cắm hướng ra ngoài).
 * def.setLength(inst, mm) đổi chiều dài (100…300), def.setColor(inst, 'red'…).
 */
export function jumperDef(kind, { color = 'orange', len = 200 } = {}) {
  const maleA = kind[0] === 'm', maleB = kind[1] === 'm';
  const pinsFor = (L) => {
    const { half } = wirePts(L);
    const xa = -half - HL - 0.2, xb = half + HL + 0.2;
    return [
      P('A', maleA ? 'A (đực)' : 'A (cái)', [xa - (maleA ? PIN : 0), 1.27, 0], [-1, 0, 0], { end: maleA ? 'male' : 'female' }),
      P('B', maleB ? 'B (đực)' : 'B (cái)', [xb + (maleB ? PIN : 0), 1.27, 0], [1, 0, 0], { end: maleB ? 'male' : 'female' }),
    ];
  };
  const id = `jumper-wire-${kind}`;
  const wp = wirePts(len);
  const bulge = Math.max(...wp.pts.map((p) => Math.abs(p.z)));
  const label = { mm: 'đực–đực', mf: 'đực–cái', ff: 'cái–cái' }[kind];
  const def = finalizeDef({
    id, name: `Dây cắm Dupont ${label} 20 cm`, kind: 'part', category: 'wire', lessonId: 'ban-thi-nghiem-dien', massG: 1.2,
    size: [+(2 * (wp.half + HL + PIN + 0.2)).toFixed(1), 2.6, +(2 * bulge + 2.6).toFixed(1)],
    grip: { pose: 'pinch', offset: [-(len * 0.3) - HL / 2, 2.6, 0], rot: [0, 0, 0] },
    pins: pinsFor(len),
    ends: { A: maleA ? 'male' : 'female', B: maleB ? 'male' : 'female' },
    insertInto: maleA || maleB ? ['bb-hole', 'header-female', 'pcb-hole'] : [],
    provides: !maleA || !maleB ? ['header-female'] : [],
    mount: { seatY: 0 },
    props: { lengthMm: len, color, awg: 26, lengths: [100, 150, 200, 300] },
    electrical: { type: 'wire', ohmPerM: 0.134, maxA: 2, internal: [['A', 'B']] },
    build() {
      const root = new THREE.Group();
      const a = staticParts(`dupont:${maleA ? 'm' : 'f'}`, (B) => endInto(B, maleA));
      const b = staticParts(`dupont:${maleB ? 'm' : 'f'}`, (B) => endInto(B, maleB));
      b.rotation.y = Math.PI;
      const w = new THREE.Mesh(wireGeo(len), wireMat(color));
      w.castShadow = true;
      root.add(a, b, w);
      ud(root, 'jw', { a, b, w, len });
      place(root, len);
      ud(root, 'pins', () => pinsFor(root.userData.jw.len));
      return root;
    },
    init(inst) { const s = inst.state || {}; if (s.lengthMm && s.lengthMm !== len) def.setLength(inst, s.lengthMm); if (s.color) def.setColor(inst, s.color); },
    setLength(inst, mm) {
      mm = Math.max(60, Math.min(400, Math.round(mm)));
      const u = inst.object.userData.jw;
      u.len = mm;
      u.w.geometry = wireGeo(mm);
      place(inst.object, mm);
      (inst.state ||= {}).lengthMm = mm;
      // cập nhật điểm neo khe (đầu cái)
      for (const s of socketsOnce(inst, () => [])) { const p = def.getPins(inst).find((q) => q.id === s.end); if (p) { s.object3D.position.set(...p.pos); s.object3D.updateMatrix(); } }
      return { ok: true, lengthMm: mm };
    },
    setColor(inst, c) { inst.object.userData.jw.w.material = wireMat(c); (inst.state ||= {}).color = c; return { ok: true }; },
    sockets(inst) {
      return socketsOnce(inst, () => def.getPins(inst).filter((p) => p.end === 'female').map((p) => {
        const an = anchor(inst.object, `dup:${p.id}`, p.pos, 0, 0);
        return socketSpec(inst, {
          id: `end-${p.id}`, kind: 'header-female', anchor: an, end: p.id, axis: p.dir,
          accepts(item) { if (this.occupiedBy) return { ok: false, reason: 'Đầu cái đã có chân' }; return fitsKind(item, 'header-female') ? { ok: true, orientation: 'ok' } : { ok: false, reason: 'Chỉ nhận chân đực 0.64 mm' }; },
        });
      }));
    },
  });
  def.getPins = (inst) => inst?.object?.userData?.pins?.() ?? def.pins;
  return def;
}
function wireGeo(len) {
  return cached(`dupont:wire:${len}`, () => {
    const { pts, half } = wirePts(len);
    const all = [new THREE.Vector3(-half - 1.5, 1.27, 0), ...pts, new THREE.Vector3(half + 1.5, 1.27, 0)];
    return tubeGeo(roundPolyline(all, 2, 3), WR, { radial: 8 });
  });
}
function place(root, len) {
  // endInto: gốc ở mặt cắm, thân kéo về −X → đầu A quay π (mặt cắm hướng −X), đầu B giữ nguyên (mặt cắm hướng +X)
  const u = root.userData.jw;
  const { half } = wirePts(len);
  u.a.position.set(-(half + HL + 0.2), 1.27, 0); u.a.rotation.y = Math.PI;
  u.b.position.set(half + HL + 0.2, 1.27, 0); u.b.rotation.y = 0;
}

// ============================================================================= cuộn dây điện
/** Cuộn dây UL1007 22 AWG 10 m. color 'red' | 'black' … def.cut(inst, mm) → { spawn: { kind:'wire', … } } */
export function spoolDef({ id, color, name }) {
  const FR = 30, HR = 11, WH = 26, FT = 2;
  const tail = [[24, FT + WH - 2, 0], [34, FT + WH - 6, 8], [60, AWG[22].r, 18], [120, AWG[22].r, 20]];
  const tc = cableGeos(`spool:tail:${color}`, tail, AWG[22].r, { core: AWG[22].core, bendR: 8, strip: 7 });
  const def = finalizeDef({
    id, name: name || `Cuộn dây 22 AWG ${color === 'red' ? 'đỏ' : 'đen'} (10 m)`, kind: 'part', category: 'wire', lessonId: 'ban-thi-nghiem-dien', massG: 120,
    size: [FR * 2 + 90, WH + 2 * FT, FR * 2],
    grip: { pose: 'grip', offset: [0, WH + 2 * FT, 0], rot: [0, 0, 0] },
    pins: [P('END', 'đầu dây (đã tuốt 7 mm)', tc.tip, tc.dir, { wireEnd: true, awg: 22, color })],
    insertInto: [],
    mount: { seatY: 0 },
    props: { color, awg: 22, lengthMm: 10000, insulation: 'PVC UL1007 300 V 80 °C', strands: '7/0.25 mm', ohmPerM: 0.053, maxA: 7 },
    build() {
      const root = new THREE.Group();
      root.add(staticParts(`spool:${color}`, (B) => {
        const fl = PM.absDark;
        B.add(gCyl(FR, FR, FT, 48), fl, { y: FT / 2 });
        B.add(gCyl(FR, FR, FT, 48), fl, { y: FT + WH + FT / 2 });
        B.add(gCyl(HR, HR, WH, 32), PM.absGrey, { y: FT + WH / 2 });
        B.add(gCyl(6, 6, 0.2, 20), PM.hole, { y: 2 * FT + WH + 0.02 }, { shadow: false });
        // các vòng dây quấn (gờ xoắn)
        const ring = cached('spool:ring', () => { const t = new THREE.TorusGeometry(24, AWG[22].r, 6, 48); t.rotateX(Math.PI / 2); return t; });
        const n = Math.floor(WH / (AWG[22].r * 2));
        for (let k = 0; k < n; k++) B.add(ring, wireMat(color), { y: FT + AWG[22].r + k * AWG[22].r * 2 });
        B.add(gCyl(23.4, 23.4, WH, 48), wireMat(color), { y: FT + WH / 2 });
        addCable(B, `spool:tail:${color}`, tail, color, 22, { bendR: 8, strip: 7 });
        B.obj(() => decal(`spool:lab:${color}`, 36, 36, (g, W, H) => {
          g.fillStyle = '#f3f1ea'; g.beginPath(); g.arc(W / 2, H / 2, W * 0.48, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#0d0f12'; g.beginPath(); g.arc(W / 2, H / 2, W * 0.18, 0, Math.PI * 2); g.fill();
          text(g, 'UL1007', W / 2, H * 0.18, H * 0.09, { color: '#222' });
          text(g, '22 AWG', W / 2, H * 0.8, H * 0.1, { color: color === 'red' ? '#b11' : '#111' });
          text(g, '300V 80°C  10m', W / 2, H * 0.91, H * 0.055, { color: '#333', weight: '600' });
        }, { y: 2 * FT + WH + 0.03, pxPerMm: 12 }));
      }));
      return root;
    },
    init(inst) { (inst.state ||= {}).remainingMm ??= 10000; },
    /** Kéo & cắt một đoạn dài mm → trả mô tả đoạn dây để engine tạo (minigames/wiring.js) */
    cut(inst, mm = 150) {
      const st = inst.state || (inst.state = {});
      st.remainingMm ??= 10000;
      mm = Math.max(10, Math.round(mm));
      if (mm > st.remainingMm) return { ok: false, reason: `Chỉ còn ${st.remainingMm} mm` };
      st.remainingMm -= mm;
      return { ok: true, remainingMm: st.remainingMm, spawn: { kind: 'wire', color, awg: 22, lengthMm: mm, stripped: [false, false] } };
    },
  });
  return def;
}
