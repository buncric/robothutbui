// Đầu nối: JST-XH (header đực trên PCB + vỏ cái có đầu bấm), XT60 (đực/cái), dây cáp. KHÔNG export default.
import {
  THREE, PM, cached, colorMat, gBox, gCyl, extrudeY, roundRectShape, tubeGeo, roundPolyline, staticParts, decal, text, tf,
  finalizeDef, socketSpec, socketsOnce, anchor, fitsKind, orientationByAxis, wireMat, P, ud,
} from '../_shared.js';
import { headerPinGeo } from './pcb.js';

// ============================================================================= dây cáp
/** Dây bọc nhựa đi qua các điểm + đoạn tuốt vỏ (thiếc) ở đầu cuối. Trả { geo, tipGeo } (cache theo key) */
export function cableGeos(key, pts, r, { strip = 5, bendR = 3, core = 0.6 } = {}) {
  return cached(`cable:${key}`, () => {
    const P0 = roundPolyline(pts, bendR, 6);
    // tách đoạn tuốt ở cuối
    const last = P0[P0.length - 1], prev = P0[P0.length - 2];
    const dir = last.clone().sub(prev).normalize();
    const cut = last.clone().addScaledVector(dir, -strip);
    const ins = P0.slice(0, -1).concat([cut]);
    return { geo: tubeGeo(ins, r, { radial: 8 }), tipGeo: strip > 0 ? tubeGeo([cut, last], r * core, { radial: 6 }) : null, tip: last.toArray(), dir: dir.toArray() };
  });
}
export const AWG = { 14: { r: 1.45, core: 0.56 }, 18: { r: 1.0, core: 0.52 }, 20: { r: 0.85, core: 0.5 }, 22: { r: 0.75, core: 0.45 }, 24: { r: 0.62, core: 0.42 }, 26: { r: 0.55, core: 0.38 }, 28: { r: 0.45, core: 0.35 } };
/** Thêm dây vào bộ gộp B */
export function addCable(B, key, pts, color, gauge = 22, opts = {}) {
  const a = AWG[gauge] || AWG[22];
  const c = cableGeos(`${key}:${gauge}`, pts, a.r, { core: a.core, ...opts });
  B.add(c.geo, wireMat(color), {}, { shadow: true });
  if (c.tipGeo) B.add(c.tipGeo, PM.solder, {}, { shadow: false });
  return c;
}

// ============================================================================= JST-XH
export const XH = { pitch: 2.5, A: (n) => (n - 1) * 2.5 + 4.9, depth: 5.75, H: 7.0, tail: 3.4 };
const XH_COLORS = ['red', 'black', 'yellow', 'blue', 'green', 'white', 'orange'];

/** Header đực B{n}B-XH-A (đứng, gắn PCB). Gốc: đầu đuôi; mặt tựa y = 3.4; đáy hốc y = 4.4 */
export function jstHeaderDef(n) {
  const A = XH.A(n), Dd = XH.depth, T = XH.tail, H = XH.H;
  const floorY = T + 1.0, topY = T + H;
  // chân 1 ở +X khi cửa sổ khoá quay +Z — đúng đánh số của JST/KiCad (nhìn từ trên, cửa sổ phía sau: chân 1 bên trái)
  const pins = Array.from({ length: n }, (_, i) => P(i + 1, String(i + 1), [((n - 1) / 2 - i) * XH.pitch, 0, 0]));
  const def = finalizeDef({
    id: `jst-xh-${n}`, name: `Đầu JST-XH ${n} chân (đực, hàn PCB)`, kind: 'part', category: 'connector', lessonId: 'pack-4s-bms', massG: 0.3 + n * 0.12,
    size: [A, topY, Dd], grip: { pose: 'pinch', offset: [0, topY, 0], rot: [0, 0, 0] },
    pins,
    insertInto: ['pcb-hole'],
    mount: { seatY: T, pitch: XH.pitch, note: 'Bước 2.5 mm — gần 2.54: cắm board đục lỗ được nhưng hơi chéo khi > 6 chân' },
    footprint: pins.map((p) => [p.pos[0], p.pos[2]]),
    orientationKey: { pin: '1', axis: 'z', sign: 1, mark: 'lock-window', note: 'Cửa sổ khoá ở mặt +Z' },
    provides: [`jst-xh-${n}`],
    // CAD thật vendor/jst_xh_b<n>b_xh_a_1x0<n>_p2_50mm_vertical (JST B<n>B-XH-A): thân A × 5.75 × 7.0, đuôi 3.4 — trùng kích thước
    // item; vách có cửa sổ/khe khoá ở −Z của CAD → quay 180° (cửa sổ khoá ở +Z như item & vỏ XHP); hàng chân lệch z = −0.54
    // so với tâm thân → sau khi quay ở +0.54 → dời −0.54 (chân ở z = 0), lên T. Việc cắm vỏ XHP do khe 'jst-xh-n' đảm nhận
    // → bỏ sub-part 'connector' của manifest (không cho thân đầu cắm trượt).
    ...(n >= 2 && n <= 6 ? {
      cad: `vendor/jst_xh_b${n}b_xh_a_1x0${n}_p2_50mm_vertical`,
      cadOptions: { rotateY: Math.PI, onBottom: false, offset: [0, T, -0.54] },
      cadInteractSkip: ['connector'],
    } : {}),
    build() {
      const root = new THREE.Group();
      root.add(staticParts(`jst-xh-${n}`, (B) => {
        const shell = cached(`xhshell:${n}`, () => {
          const s = roundRectShape(A, Dd, 0.3);
          s.holes.push(roundRectShape(A - 1.3, Dd - 1.4, 0.15));
          return extrudeY(s, H, { y0: T, curveSeg: 4 });
        });
        B.add(shell, PM.nylonCream);
        B.add(gBox(A - 1.2, 1.0, Dd - 1.3), PM.nylonCream, { y: T + 0.5 });
        // cửa sổ khoá (+Z) + gân định hướng bên trong mặt −Z
        B.add(gBox(2.2, 1.6, 0.72), PM.hole, { y: topY - 1.6, z: Dd / 2 - 0.34 }, { shadow: false });
        for (let i = 0; i < n - 1; i++) B.add(gBox(0.6, H - 2.2, 0.5), PM.nylonCream, { x: (i - (n - 2) / 2) * XH.pitch, y: floorY + (H - 2.2) / 2, z: -Dd / 2 + 0.95 });
        // tai 2 bên + chân đế nhỏ
        for (const s of [-1, 1]) B.add(gBox(0.5, H * 0.75, 2.2), PM.nylonCream, { x: s * (A / 2 + 0.2), y: T + H * 0.375 });
        B.inst(headerPinGeo(H - 1.0 + T), PM.lead, pins.map((p) => tf({ x: p.pos[0], y: (H - 1.0 + T) / 2 })), { shadow: true });
        B.obj(() => decal(`xhmark:${n}`, A - 1, 1.6, (g, W, Hh) => text(g, 'JST', W / 2, Hh / 2, Hh * 0.7, { color: '#b9b29c' }), { y: topY - 3.8, z: -Dd / 2 - 0.01, ry: Math.PI, rx: 0, pxPerMm: 30 }));
      }));
      return root;
    },
    sockets(inst) {
      return socketsOnce(inst, () => {
        const a = anchor(inst.object, `xh${n}`, [0, floorY, 0]);
        return [socketSpec(inst, {
          id: `jst-xh-${n}`, kind: `jst-xh-${n}`, anchor: a,
          accepts(item, ctx) {
            if (!fitsKind(item, `jst-xh-${n}`)) return { ok: false, reason: item?.def?.jst ? `Vỏ ${item.def.jst} chân không vừa đầu ${n} chân` : 'Không phải vỏ JST-XH' };
            const o = orientationByAxis(item, a, 'z', ctx);
            return o === 'ok' ? { ok: true, orientation: 'ok' } : { ok: false, reason: 'Ngược chiều — JST-XH có gờ khoá 1 chiều', orientation: 'reversed' };
          },
          poseFor() { return new THREE.Matrix4(); },
          contacts: pins.map((p) => ({ pin: p.id, local: [p.pos[0], floorY, 0] })),
        })];
      });
    },
  });
  return def;
}

/**
 * Vỏ cái XHP-n + đầu bấm SXH + dây 26 AWG dài len mm (đầu tuốt sẵn). Gốc: đáy vỏ (mặt cắm).
 * pins: C1..Cn (tiếp điểm ở mặt cắm, tương ứng chân header) + W1..Wn (đầu dây tuốt).
 */
export function jstHousingDef(n, { id, name, len = 150, colors, gauge = 26 } = {}) {
  const A = XH.A(n) - 1.45, Dd = XH.depth - 1.5, H = 9.8;
  const cols = colors || XH_COLORS.slice(0, n);
  const xs = Array.from({ length: n }, (_, i) => ((n - 1) / 2 - i) * XH.pitch);   // C1 ở +X — khớp chân 1 của header (CAD JST)
  const pathFor = (x, i) => [[x, H - 1, 0], [x, H + 6, 0], [x, H + 6, -7], [x * 1.4, 1.2, -22 - i * 0.2], [x * 1.4, AWG[gauge].r, -len + 10]];
  const cablesInfo = xs.map((x, i) => cableGeos(`xhp${n}:${i}:${len}:${gauge}`, pathFor(x, i), AWG[gauge].r, { core: AWG[gauge].core, bendR: 3 }));
  const pins = [
    ...xs.map((x, i) => P(`C${i + 1}`, `${i + 1}`, [x, 0, 0], [0, -1, 0], { wire: cols[i], contact: true, mates: String(i + 1) })),
    ...cablesInfo.map((c, i) => P(`W${i + 1}`, `dây ${i + 1} (${cols[i]})`, c.tip, c.dir, { wire: cols[i], wireEnd: true, net: `C${i + 1}` })),
  ];
  const def = finalizeDef({
    id: id || `jst-xh-${n}-housing`, name: name || `Vỏ JST-XH ${n} chân + dây`, kind: 'part', category: 'connector', lessonId: 'pack-4s-bms', massG: 0.4 + n * 0.9,
    size: [A + 4, H + 7, len], grip: { pose: 'pinch', offset: [0, H * 0.6, 0], rot: [0, 0, 0] },
    pins,
    jst: n,
    insertInto: [`jst-xh-${n}`],
    mount: { seatY: 0 },
    orientationKey: { pin: 'C1', axis: 'z', sign: 1, mark: 'lock-ramp', note: 'Gờ khoá ở mặt +Z' },
    build() {
      const root = new THREE.Group();
      root.add(staticParts(def.id, (B) => {
        const body = cached(`xhpbody:${n}`, () => {
          const s = roundRectShape(A, Dd, 0.25);
          for (const x of xs) s.holes.push(roundRectShape(1.5, 1.5, 0.1, x, 0.1));
          return extrudeY(s, H, { bevel: 0.15, curveSeg: 4 });
        });
        B.add(body, PM.nylonCream);
        // gờ khoá (ramp) mặt +Z
        const ramp = cached('xhpramp', () => {
          const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.75, 1.2); s.lineTo(0.75, 2.4); s.lineTo(0, 2.4); s.lineTo(0, 0);
          const g = new THREE.ExtrudeGeometry(s, { depth: 2.0, bevelEnabled: false }); g.rotateY(-Math.PI / 2); g.translate(1.0, 0, 0); g.computeVertexNormals();
          // shape x → z (ra ngoài), y giữ nguyên
          return g;
        });
        B.add(ramp, PM.nylonCream, { y: 3.6, z: Dd / 2 });
        // đầu bấm trong hốc (thấy từ mặt cắm & mặt trên)
        B.inst(gBox(1.1, 6.5, 0.9), PM.lead, xs.map((x) => tf({ x, y: 4.0, z: 0.1 })));
        B.inst(gBox(1.3, 0.05, 1.3), PM.hole, xs.map((x) => tf({ x, y: -0.01, z: 0.1 })));
        xs.forEach((x, i) => addCable(B, `xhp${n}:${i}:${len}:${gauge}`, pathFor(x, i), cols[i], gauge, { bendR: 3 }));
      }));
      return root;
    },
  });
  return def;
}

// ============================================================================= XT60
const XT_W = 15.5, XT_H = 8.0, XT_L = 16, XT_X = 3.6;
/** Mặt cắt XT60: chữ nhật vát 2 góc ở phía chamferSide (−1: −X, +1: +X). Toạ độ shape (x, y) */
export function xt60Shape(w, h, chamferSide, ch = 2.4, inset = 0, oy = 0) {
  const s = new THREE.Shape();
  const x0 = -w / 2 + inset, x1 = w / 2 - inset, y0 = inset + oy, y1 = h - inset + oy;
  const c = ch - inset * 0.4;
  if (chamferSide < 0) { s.moveTo(x0 + c, y0); s.lineTo(x1, y0); s.lineTo(x1, y1); s.lineTo(x0 + c, y1); s.lineTo(x0, y1 - c); s.lineTo(x0, y0 + c); s.lineTo(x0 + c, y0); }
  else { s.moveTo(x0, y0); s.lineTo(x1 - c, y0); s.lineTo(x1, y0 + c); s.lineTo(x1, y1 - c); s.lineTo(x1 - c, y1); s.lineTo(x0, y1); s.lineTo(x0, y0); }
  return s;
}
/** Đùn mặt cắt theo +Z (z0 → z0+len) */
function extrudeZ(shape, len, z0) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.2, bevelOffset: -0.2, bevelSegments: 1, curveSegments: 16 });
  g.translate(0, 0, z0);
  g.computeVertexNormals();
  return g;
}
/** Cốc hàn (nửa ống) phía sau, trục Z */
export function solderCupGeo() {
  return cached('xt60cup', () => {
    const g = new THREE.CylinderGeometry(2.1, 2.1, 5.5, 16, 1, true, 0, Math.PI * 1.3);
    g.rotateX(Math.PI / 2);
    g.rotateZ(-Math.PI * 0.15 + Math.PI);
    return g;
  });
}
/** Thân XT60 cái (miệng +Z, '−' vát ở −X) vào B, offset z */
export function xt60FemaleInto(B, { z = 0 } = {}) {
  const g = B.group({ z });
  const body = cached('xt60f:body', () => {
    const s = xt60Shape(XT_W, XT_H, -1);
    for (const sx of [-1, 1]) { const h = new THREE.Path(); h.absarc(sx * XT_X, XT_H / 2, 2.25, 0, Math.PI * 2, true); s.holes.push(h); }
    return extrudeZ(s, XT_L, -XT_L / 2);
  });
  g.add(body, PM.nylonYellow);
  for (const sx of [-1, 1]) {
    g.add(gCyl(2.0, 2.0, XT_L - 1, 18, true), PM.gold, { x: sx * XT_X, y: XT_H / 2, z: 0.3, rx: Math.PI / 2 }, { shadow: false });
    g.add(gCyl(1.75, 1.75, 0.2, 14), PM.hole, { x: sx * XT_X, y: XT_H / 2, z: -2, rx: Math.PI / 2 }, { shadow: false });
    // cốc hàn: mesh riêng tên 'xt60-cups' (giữ hiện cạnh CAD — mẫu CAD là bản hàn PCB, không có cốc hàn)
    g.add(solderCupGeo(), PM.gold, { x: sx * XT_X, y: XT_H / 2, z: -XT_L / 2 - 2.6 }, { name: 'xt60-cups' });
  }
  g.add(gBox(XT_W - 5, XT_H - 1, 4), PM.nylonYellow, { y: XT_H / 2, z: -XT_L / 2 - 1.6 });   // vách ngăn giữa 2 cốc hàn
}
/** Thân XT60 đực (miệng +Z, '−' vát ở +X — vì khi cắm sẽ quay 180°) */
export function xt60MaleInto(B, { z = 0 } = {}) {
  const g = B.group({ z });
  const shell = cached('xt60m:shell', () => {
    const sh = xt60Shape(XT_W + 0.9, XT_H + 0.9, 1, 2.6);
    sh.holes.push(xt60Shape(XT_W + 0.1, XT_H + 0.1, 1, 2.45, 0, 0.4));
    return extrudeZ(sh, 8, 0);
  });
  g.add(shell, PM.nylonYellow);
  const back = cached('xt60m:back', () => extrudeZ(xt60Shape(XT_W + 0.9, XT_H + 0.9, 1, 2.6), 8, -8));
  g.add(back, PM.nylonYellow, { y: 0 });
  for (const sx of [-1, 1]) {
    g.add(gCyl(1.75, 1.75, 9, 18), PM.gold, { x: sx * XT_X, y: XT_H / 2 + 0.45, z: 3.5, rx: Math.PI / 2 });
    g.add(gCyl(1.55, 1.75, 0.6, 18), PM.gold, { x: sx * XT_X, y: XT_H / 2 + 0.45, z: 8.2, rx: Math.PI / 2 });
    g.add(solderCupGeo(), PM.gold, { x: sx * XT_X, y: XT_H / 2 + 0.45, z: -8 - 2.6 }, { name: 'xt60-cups' });
  }
}
export const XT60 = { W: XT_W, H: XT_H, L: XT_L, X: XT_X };

/** Đánh dấu "+" "−" nổi trên mặt trên XT60 */
export function xt60Marks(id, minusSide, y, z = 0) {
  return () => decal(`xt60mark:${id}`, XT_W - 2, 8, (g, W, H) => {
    text(g, '−', W / 2 + minusSide * W * 0.28, H * 0.5, H * 0.55, { color: '#c79a10', weight: '900' });
    text(g, '+', W / 2 - minusSide * W * 0.28, H * 0.5, H * 0.55, { color: '#c79a10', weight: '900' });
    text(g, 'XT60', W / 2, H * 0.5, H * 0.3, { color: '#c79a10' });
  }, { y, z, pxPerMm: 30 });
}
export { ud };
