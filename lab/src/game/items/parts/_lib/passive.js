// Linh kiện thụ động xuyên lỗ: điện trở, tụ gốm, tụ hoá, thạch anh, cuộn cảm xuyến. KHÔNG export default.
import {
  THREE, PM, cached, colorMat, gBox, gCyl, gLathe, gSphere, extrudeY, roundRectShape, tubeGeo, canvasTex, text, decal,
  resistorBands, BAND_COLORS, fmtOhm, PITCH, HAS_DOC, ud,
} from '../_shared.js';
import { leadedDef, RES_PROFILE, bandGeo, profileR } from './thru.js';
import { cadNodes, hideMeshes, isMetal, cropMesh, setMaterial, stretchY, hslOf } from './cad.js';

// ============================================================================= điện trở 1/4 W (màng than, 4 vạch ±5 %)
const BAND_T = [[-2.75, -2.25], [-1.55, -1.1], [-0.65, -0.2], [1.9, 2.45]];   // vị trí 4 vạch dọc thân (mm, trục X)
const bandMat = (c) => colorMat(BAND_COLORS[c] ?? 0x888888, { rough: c === 'gold' ? 0.35 : 0.5, metal: c === 'gold' || c === 'silver' ? 0.6 : 0 });
const resBodyMat = colorMat(0xd9c49b, { rough: 0.55 });
const CAD_RES_PROFILE = [[1.25, -3.3], [1.25, 3.3]];      // thân CAD DIN0207: trụ Ø2.5 (vạch ôm ngoài)

export function resistorDef({ id, name, ohms = 10000 }) {
  const axisY = 1.26;
  const def = leadedDef({
    id, name: name || `Điện trở ${fmtOhm(ohms)} ¼ W`, category: 'passive', lessonId: 'dien-tro', massG: 0.25, size: [62, 2.6, 2.6],
    axial: { halfBody: 3.3, axisY, leadLen: 28, names: ['1', '2'], radius: 0.3 },
    grip: { pose: 'pinch', offset: [0, axisY, 0], rot: [0, 0, 0] },
    body(B) {
      const g = B.group({ y: axisY, rz: -Math.PI / 2 });
      g.add(gLathe('res14', RES_PROFILE, 24), resBodyMat);
    },
    // CAD thật vendor/r_axial_din0207_l6_3mm_d2_5mm_p10_16mm_horizontal (thân Ø2.5 × 6.3, trục y = 1.25, dọc X) — chỉ lấy THÂN:
    // node 'resistor' gộp cả đoạn chân bẻ sẵn bước 10.16 (vật liệu kim loại → ẩn) + đĩa nhỏ ở chân (cắt bỏ |x| > 3.5).
    // Thân CAD trơn (không vạch màu) → giữ 4 vạch thủ tục ('bands'), đổi sang vòng bán kính không đổi 1.28 ôm thân CAD.
    // Chỉ dùng bản nằm ngang: game chỉ bẻ chân kiểu nằm (axial), không có kiểu đứng (hairpin).
    cad: 'vendor/r_axial_din0207_l6_3mm_d2_5mm_p10_16mm_horizontal',
    cadOptions: {
      offset: [0, axisY - 1.25, 0],
      keep: ['bands'],
      onLoad(glb, root) {
        for (const n of cadNodes(glb, 'resistor')) {
          hideMeshes(n, isMetal);
          n.traverse((m) => { if (m.isMesh && m.visible) cropMesh(m, root, (x) => Math.abs(x) < 3.5, 'res0207'); });
        }
        root.userData.bands?.children.forEach((m, i) => { m.geometry = bandGeo(CAD_RES_PROFILE, BAND_T[i][0], BAND_T[i][1], 'res0207cad'); });
      },
    },
    extra(root) {
      // 4 vạch màu: mesh riêng (đổi giá trị được)
      const bands = new THREE.Group();
      bands.name = 'bands';
      bands.position.y = axisY; bands.rotation.z = -Math.PI / 2;
      const cols = resistorBands(ohms);
      BAND_T.forEach(([t0, t1], i) => {
        const m = new THREE.Mesh(bandGeo(RES_PROFILE, t0, t1, 'res14'), bandMat(cols[i]));
        bands.add(m);
      });
      root.add(bands);
      ud(root, 'bands', bands);
    },
    insertInto: ['pcb-hole', 'bb-hole', 'screw-terminal'],
    electrical: { type: 'resistor', ohms, tolerance: 0.05, powerW: 0.25 },
    extraDef: {
      props: { value: ohms },
      bands: resistorBands(ohms),
      /** Đổi giá trị (Ω) → đổi vạch màu của bản sao này */
      setValue(inst, v) {
        const cols = resistorBands(v);
        inst.object.userData.bands?.children.forEach((m, i) => { m.material = bandMat(cols[i]); });
        (inst.state ||= {}).value = v;
        return { ok: true, bands: cols };
      },
      init(inst) { if (inst.state?.value) def.setValue(inst, inst.state.value); },
    },
  });
  return def;
}

// ============================================================================= tụ gốm
/**
 * Tụ gốm hướng tâm. style 'disc' (đĩa nâu cam 22 pF) | 'dip' (MLCC nhúng epoxy vàng "104").
 * Gốc: đầu chân; đáy thân (mặt tựa) y = seat.
 */
export function ceramicCapDef({ id, name, style = 'disc', code = '22', farads = 22e-12, pitch = 2.54, color = 0xc8742c, massG = 0.2 }) {
  const L = 24, seat = L;
  const isDisc = style === 'disc';
  // kích thước thân theo CAD thật: 104 → vendor/c_disc_d5_0mm_w2_5mm_p5_00mm (5.5 × 5.1 × 2.5),
  // 22 pF → vendor/c_disc_d3_0mm_w1_6mm_p2_50mm (3.0 × 3.1 × 1.6). Chân thủ tục giữ bước lưới 2.54/5.08 (CAD 2.5/5.0, lệch ≤ 0.04).
  const W = isDisc ? 3.0 : 5.5, H = isDisc ? 3.1 : 5.1, T = isDisc ? 1.6 : 2.5;
  const cadPath = isDisc ? 'vendor/c_disc_d3_0mm_w1_6mm_p2_50mm' : 'vendor/c_disc_d5_0mm_w2_5mm_p5_00mm';
  const mat = colorMat(color, { rough: isDisc ? 0.45 : 0.32 });
  const def = leadedDef({
    id, name, category: 'passive', lessonId: 'tu-dien', massG, size: [W, seat + H, T],
    radial: { leads: [{ name: '1', x: -pitch / 2, z: 0, len: L }, { name: '2', x: pitch / 2, z: 0, len: L }], topY: seat, radius: 0.25 },
    // CAD: thân đặt trên mặt tựa (y = 0), tâm XZ = gốc → dời lên seat; đoạn chân kim loại trong node thân bị ẩn (chân thủ tục);
    // giữ màu thân của item (mẫu KiCad tô cam chung) và chữ in ('decal:ccmark:*').
    cad: cadPath,
    cadOptions: {
      offset: [0, seat, 0],
      keep: [`decal:ccmark:${id}`],
      onLoad(glb, root) {
        for (const n of cadNodes(glb, 'cap_ceramic*')) { hideMeshes(n, isMetal); setMaterial(n, (m) => !isMetal(m), mat); }
      },
    },
    body(B) {
      const g = B.group({ y: seat });
      if (isDisc) {
        // đĩa phủ epoxy: tròn xoay quanh trục Z, phồng giữa
        const prof = [[0, -T / 2], [W * 0.38, -T / 2], [W / 2, -T * 0.25], [W / 2 + 0.02, 0], [W / 2, T * 0.25], [W * 0.38, T / 2], [0, T / 2]];
        g.add(gLathe(`cdisc:${W}:${T}`, prof, 28), mat, { y: H / 2 + 0.6, rx: Math.PI / 2 });
        // giọt epoxy chảy xuống chân
        for (const s of [-1, 1]) g.add(gCyl(0.55, 0.32, 1.4, 10), mat, { x: s * pitch / 2 * 0.75, y: 0.7 });
      } else {
        g.add(gSphere(1, 20, 14), mat, { y: H / 2 + 0.3, sx: W / 2, sy: H / 2, sz: T / 2 });
        for (const s of [-1, 1]) g.add(gCyl(0.6, 0.35, 1.2, 10), mat, { x: s * pitch / 2 * 0.8, y: 0.5 });
      }
      B.obj(() => decal(`ccmark:${id}`, W * 0.7, H * 0.45, (gx, Wp, Hp) => {
        text(gx, code, Wp / 2, Hp * 0.5, Hp * 0.8, { color: isDisc ? '#2a1a0a' : '#3a3010', weight: '700' });
      }, { x: 0, y: seat + H * 0.6, z: T / 2 + 0.03, rx: 0, pxPerMm: 40, rough: 0.6 }));
    },
    insertInto: ['pcb-hole', 'bb-hole'],
    electrical: { type: 'capacitor', farads, vmax: 50, polar: false, dielectric: isDisc ? 'C0G/NP0' : 'X7R' },
    extraDef: { props: { code } },
  });
  return def;
}

// ============================================================================= tụ hoá nhôm
/**
 * Tụ hoá đứng. Gốc: đầu chân DƯƠNG (dài hơn). Vạch sọc + dấu "−" ở phía −X (chân âm).
 */
export function electrolyticDef({ id, name, D = 10, H = 20, pitch = 5.0, lead = 0.6, uF = 1000, V = 25, sleeve = 0x16181d, stripe = '#c9ced6', series = 'ZLH', massG = 2.5, vent = '+' }) {
  const LP = 20, LN = 18.5, seat = LP;
  const R = D / 2;
  const sleeveMat = colorMat(sleeve, { rough: 0.32 });
  const prof = [[R * 0.84, H], [R - 0.25, H - 0.02], [R, H - 0.35], [R, 2.2], [R - 0.28, 1.75], [R - 0.28, 1.45], [R, 1.0], [R, 0.35], [R - 0.3, 0.05], [R * 0.86, 0.05]];
  const printTex = () => canvasTex(`ecap:${id}`, 512, 256, (g, W, Hh) => {
    g.clearRect(0, 0, W, Hh);
    // sọc cực âm quanh u = 0.75 (phía −X)
    const sx = W * 0.75, sw = W * 0.16;
    g.fillStyle = stripe; g.fillRect(sx - sw / 2, 0, sw, Hh);
    g.save(); g.translate(sx, Hh / 2); g.rotate(-Math.PI / 2);
    for (let k = -2; k <= 2; k++) text(g, '−', k * Hh * 0.2, 0, sw * 0.9, { color: '#111', weight: '900' });
    g.restore();
    const ink = stripe;
    g.save(); g.translate(W * 0.25, Hh / 2); g.rotate(-Math.PI / 2);
    text(g, `${uF}µF`, 0, -W * 0.06, W * 0.05, { color: ink });
    text(g, `${V}V`, 0, W * 0.0, W * 0.045, { color: ink });
    text(g, `${series} 105°C`, 0, W * 0.06, W * 0.035, { color: ink });
    g.restore();
  });
  const def = leadedDef({
    id, name, category: 'passive', lessonId: 'tu-dien', massG, size: [D, seat + H, D],
    radial: { leads: [{ name: '−', x: -pitch / 2, z: 0, len: LN }, { name: '+', x: pitch / 2, z: 0, len: LP }], topY: seat, radius: lead / 2 },
    grip: { pose: 'pinch', offset: [0, seat + H * 0.5, 0], rot: [0, 0, 0] },
    body(B) {
      const g = B.group({ y: seat });
      g.add(gLathe(`ecapsleeve:${D}:${H}`, prof, 40), sleeveMat);
      // nắp nhôm + rãnh van an toàn
      g.add(gCyl(R * 0.85, R * 0.85, 0.1, 36), PM.aluminum, { y: H - 0.1 });
      const vlen = R * 1.2;
      if (vent === '+') { g.add(gBox(vlen, 0.04, 0.22), PM.holeGrey, { y: H - 0.02 }, { shadow: false }); g.add(gBox(0.22, 0.04, vlen), PM.holeGrey, { y: H - 0.02 }, { shadow: false }); }
      else for (const a of [0, Math.PI / 3, -Math.PI / 3]) g.add(gBox(vlen * 0.55, 0.04, 0.2), PM.holeGrey, { x: Math.cos(a) * vlen * 0.2, y: H - 0.02, z: -Math.sin(a) * vlen * 0.2, ry: a }, { shadow: false });
      // đáy cao su
      g.add(gCyl(R * 0.86, R * 0.86, 0.3, 32), PM.rubber, { y: 0.1 });
      if (!HAS_DOC) {
        // không có canvas: vạch sọc bằng hình học
        const arc = cached(`ecapstripe:${D}:${H}`, () => {
          const geo = new THREE.CylinderGeometry(R + 0.02, R + 0.02, H - 3, 12, 1, true, Math.PI * 1.5 - 0.5, 1.0);
          return geo;
        });
        g.add(arc, colorMat(0xc9ced6, { rough: 0.4 }), { y: 1.2 + (H - 3) / 2 + 0.5 });
      }
      B.obj(() => {
        const t = printTex();
        if (!t) return null;
        const m = new THREE.Mesh(cached(`ecapprint:${D}:${H}`, () => new THREE.CylinderGeometry(R + 0.015, R + 0.015, H - 3.2, 40, 1, true)),
          cached(`ecapprintmat:${id}`, () => new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })));
        m.position.y = seat + 2.4 + (H - 3.2) / 2;
        m.name = 'ecap-print';
        return m;
      });
    },
    // CAD thật vendor/cp_radial_d10_0mm_p5_00mm (1000 µF) | cp_radial_d6_3mm_p2_50mm (100 µF): mẫu KiCad cao 10 / 6.3 mm, chân 1 (+)
    // ở −X, sọc (−) ở +X, tâm thân x = +1.1 / +0.69 → quay 180° quanh Y (sọc sang −X như item) + dời tâm về 0, lên seat;
    // kéo dài thân ở giữa (stretchY) tới chiều cao thật H của item (10×20, 6.3×11) — giữ nguyên gờ/van nắp và đáy.
    // Màu vỏ & sọc theo item (series ZLH đen / KM xanh), giữ lớp chữ in ('ecap-print').
    ...(D === 10 || D === 6.3 ? {
      cad: D === 10 ? 'vendor/cp_radial_d10_0mm_p5_00mm' : 'vendor/cp_radial_d6_3mm_p2_50mm',
      cadOptions: {
        rotateY: Math.PI,
        offset: [D === 10 ? 1.1 : 0.69, seat, 0],
        keep: ['ecap-print'],
        onLoad(glb, root) {
          const Hc = D === 10 ? 10 : 6.3;
          for (const n of cadNodes(glb, 'cap_elec*')) {
            stretchY(n, root, seat + Hc / 2, H - Hc, `ecap${D}:${H}`);
            setMaterial(n, (m) => { const h = hslOf(m); return !isMetal(m) && h.s > 0.5 && h.h > 0.5 && h.h < 0.75; }, sleeveMat);
            setMaterial(n, (m) => { const h = hslOf(m); return !isMetal(m) && h.s < 0.3 && h.l > 0.25; }, colorMat(new THREE.Color(stripe).getHex(), { rough: 0.4 }));
          }
        },
      },
    } : {}),
    pinInfo: { '+': { polarity: 'positive', longer: true }, '−': { polarity: 'negative', stripe: true } },
    orientationKey: { pin: '−', axis: 'x', sign: -1, mark: 'stripe+short-lead', note: 'Vạch sọc "−" + chân ngắn = cực âm' },
    insertInto: ['pcb-hole', 'bb-hole'],
    electrical: { type: 'capacitor', farads: uF * 1e-6, vmax: V, polar: true, esr: D >= 10 ? 0.04 : 0.3, reverseFail: 'pop' },
  });
  return def;
}

// ============================================================================= thạch anh HC-49/S
export function crystalDef({ id, name, mhz = 20 }) {
  const L = 13.5, seat = L;
  const W = 11.05, Dd = 4.65, Hh = 3.6;   // tổng cao 0.5 + 3.6 = 4.1 = CAD vendor/crystal_hc49_4h_vertical
  const can = () => cached('hc49s:can', () => extrudeY(roundRectShape(W, Dd, Dd / 2 - 0.05), Hh, { bevel: 0.35, bevelSeg: 2, curveSeg: 12 }));
  const base = () => cached('hc49s:base', () => extrudeY(roundRectShape(W + 0.5, Dd + 0.4, (Dd + 0.4) / 2 - 0.05), 0.55, { bevel: 0.12, curveSeg: 12 }));
  return leadedDef({
    id, name, category: 'passive', lessonId: 'thach-anh', massG: 0.8, size: [W + 0.5, seat + Hh + 0.6, Dd + 0.4],
    radial: { leads: [{ name: '1', x: -2.44, z: 0, len: L }, { name: '2', x: 2.44, z: 0, len: L }], topY: seat, radius: 0.215 },
    // CAD thật vendor/crystal_hc49_4h_vertical (HC-49/S thấp 11.05 × 4.65 × 4.1, chân ±2.44 — trùng item) → dời lên seat.
    // Vỏ CAD tô xám tối (mẫu KiCad) → đổi sang thép mạ niken như vỏ thật; giữ chữ in 'decal:hc49:*'.
    cad: 'vendor/crystal_hc49_4h_vertical',
    cadOptions: {
      offset: [0, seat, 0],
      keep: [`decal:hc49:${mhz}`],
      onLoad(glb) { for (const n of cadNodes(glb, 'crystal*')) setMaterial(n, (m) => hslOf(m).s < 0.2, PM.steelBrushed); },
    },
    body(B) {
      const g = B.group({ y: seat });
      g.add(base(), PM.nickel, {});                       // đế + mép gấp (đường viền ghép vỏ)
      g.add(gBox(W - 0.2, 0.06, Dd - 0.4), PM.pbtBlack, { y: -0.01 }, { shadow: false });   // đệm cách điện thuỷ tinh đáy
      g.add(can(), PM.steelBrushed, { y: 0.5 });
      B.obj(() => decal(`hc49:${mhz}`, W - 2, Dd - 1, (gx, Wp, Hp) => {
        text(gx, `${mhz.toFixed(3)}`, Wp / 2, Hp * 0.42, Hp * 0.55, { color: '#2a2c30', weight: '800' });
        text(gx, 'KDS  4H', Wp / 2, Hp * 0.86, Hp * 0.24, { color: '#2a2c30', weight: '600' });
      }, { y: seat + 0.5 + Hh + 0.01, pxPerMm: 40, rough: 0.45, metal: 0.2 }));
    },
    insertInto: ['pcb-hole', 'bb-hole'],
    electrical: { type: 'crystal', hz: mhz * 1e6, loadPF: 20, esr: 40 },
    extraDef: { props: { mhz } },
  });
}

// ============================================================================= cuộn cảm xuyến
export function toroidDef({ id, name, uH = 47, OD = 17.5, ID = 9.4, Hc = 6.0, turns = 22, wire = 0.8, coreColor = 0xe8dc6a, coreColor2 = 0xf4f1e8 }) {
  const L = 8, seat = L;
  const Rm = (OD + ID) / 4, rt = (OD - ID) / 4;
  const sy = Hc / 2 / rt;
  const rw = rt + wire * 0.55;
  // 2 chân: ở mép ngoài, cách nhau 7.62 mm theo X (vừa lưới 2.54)
  const lx = 3.81;
  const rOut = Rm + rw * 0.9;
  const lz = Math.sqrt(rOut * rOut - lx * lx);
  const phiA = Math.atan2(lz, -lx), phiB = Math.atan2(lz, lx);   // góc trên vòng (XZ)
  const windGeo = () => cached(`toroidwind:${id}`, () => {
    const pts = [];
    // quấn từ phiA đi vòng dài (qua −Z) tới phiB
    let a0 = phiA, a1 = phiB;
    if (a1 > a0) a1 -= Math.PI * 2;
    const span = a0 - a1;
    const N = turns * 14;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const phi = a0 - (span * (0.04 + 0.92 * t));
      const psi = t * turns * Math.PI * 2;
      const rr = Rm + rw * Math.cos(psi);
      pts.push(new THREE.Vector3(Math.cos(phi) * rr, Math.sin(psi) * rw * sy * 0.98 + Hc / 2, Math.sin(phi) * rr));
    }
    return tubeGeo(pts, wire / 2, { radial: 6 });
  });
  return leadedDef({
    id, name, category: 'passive', lessonId: 'buck-xl4015', massG: 9, size: [OD + 2, seat + Hc + 1.6, OD + 2],
    radial: { leads: [{ name: '1', x: -lx, z: lz, len: L + 0.6 }, { name: '2', x: lx, z: lz, len: L + 0.6 }], topY: seat + 0.6, radius: wire / 2, mat: PM.lead },
    body(B) {
      const g = B.group({ y: seat + 0.8 });
      const core = cached(`toroidcore:${Rm}:${rt}`, () => { const t = new THREE.TorusGeometry(Rm, rt, 14, 40); t.rotateX(Math.PI / 2); return t; });
      g.add(core, colorMat(coreColor, { rough: 0.6 }), { y: Hc / 2, sy });
      // mặt trên sơn trắng (vật liệu bột sắt -26: vàng/trắng)
      g.add(cached(`toroidtop:${Rm}:${rt}`, () => { const r = new THREE.RingGeometry(Rm - rt * 0.55, Rm + rt * 0.55, 40); r.rotateX(-Math.PI / 2); return r; }), colorMat(coreColor2, { rough: 0.6 }), { y: Hc - 0.02 }, { shadow: false });
      g.add(windGeo(), PM.enamel, {});
    },
    insertInto: ['pcb-hole', 'bb-hole'],
    electrical: { type: 'inductor', henry: uH * 1e-6, isat: 5, dcr: 0.03 },
  });
}

// ============================================================================= bản "gắn trên board" (dùng trong module)
/** Tụ hoá đứng trên board (tĩnh) — B ở mặt board */
export function elecCapOnBoard(B, x, z, { D = 8, H = 11.5, sleeve = 0x15171c, stripe = 0xc9ced6, rot = 0 } = {}) {
  const R = D / 2;
  const prof = [[R * 0.84, H], [R - 0.25, H - 0.02], [R, H - 0.35], [R, 2.0], [R - 0.25, 1.6], [R - 0.25, 1.3], [R, 0.9], [R, 0.3], [R - 0.3, 0.02], [R * 0.86, 0.02]];
  const g = B.group({ x, z, ry: rot });
  g.add(gLathe(`ecapsleeve:${D}:${H}`, prof, 32), colorMat(sleeve, { rough: 0.32 }));
  g.add(gCyl(R * 0.85, R * 0.85, 0.1, 28), PM.aluminum, { y: H - 0.1 });
  g.add(gBox(R * 1.2, 0.04, 0.2), PM.holeGrey, { y: H - 0.02 }, { shadow: false });
  g.add(gBox(0.2, 0.04, R * 1.2), PM.holeGrey, { y: H - 0.02 }, { shadow: false });
  g.add(cached(`ecapstripe2:${D}:${H}`, () => new THREE.CylinderGeometry(R + 0.02, R + 0.02, H - 3, 10, 1, true, Math.PI * 1.5 - 0.45, 0.9)), colorMat(stripe, { rough: 0.4 }), { y: 1.1 + (H - 3) / 2 + 0.6 }, { shadow: false });
}
/** Cuộn cảm xuyến nằm trên board (tĩnh) */
export function toroidOnBoard(B, x, z, { OD = 18, ID = 9.5, Hc = 7, turns = 18, wire = 0.9, core = 0xe3d66a, coreTop = 0xf3efe2, key = 'tb' } = {}) {
  const Rm = (OD + ID) / 4, rt = (OD - ID) / 4, sy = Hc / 2 / rt, rw = rt + wire * 0.55;
  const g = B.group({ x, z });
  g.add(cached(`toroidcore:${Rm}:${rt}`, () => { const t = new THREE.TorusGeometry(Rm, rt, 14, 40); t.rotateX(Math.PI / 2); return t; }), colorMat(core, { rough: 0.6 }), { y: Hc / 2 + 0.3, sy });
  g.add(cached(`toroidtop:${Rm}:${rt}`, () => { const r = new THREE.RingGeometry(Rm - rt * 0.55, Rm + rt * 0.55, 40); r.rotateX(-Math.PI / 2); return r; }), colorMat(coreTop, { rough: 0.6 }), { y: Hc + 0.28 }, { shadow: false });
  const wind = cached(`toroidwind2:${key}:${OD}:${turns}`, () => {
    const pts = [];
    const N = turns * 14, a0 = 0.35, span = Math.PI * 2 - 0.7;
    for (let i = 0; i <= N; i++) {
      const t = i / N, phi = a0 + span * t, psi = t * turns * Math.PI * 2, rr = Rm + rw * Math.cos(psi);
      pts.push(new THREE.Vector3(Math.cos(phi) * rr, Math.sin(psi) * rw * sy * 0.98 + Hc / 2 + 0.3, Math.sin(phi) * rr));
    }
    return tubeGeo(pts, wire / 2, { radial: 6 });
  });
  g.add(wind, PM.enamel);
}
