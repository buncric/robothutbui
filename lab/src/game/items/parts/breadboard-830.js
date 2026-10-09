// Breadboard 830 lỗ (MB-102 / BB830) — theo CAD boards/breadboard-830 (BusBoard BB830): thân ABS trắng 165.1 × 54.6 × 8.5 mm
// (+ gờ ghép mộng 2.2 mm ở cạnh +Z) trên lớp keo dán 0.8 mm → mặt trên y = 9.3.
// Vùng chính: 63 cột × 10 hàng (a–j), rãnh giữa 7.62 mm; mỗi cột a–e nối nhau (1 lá kẹp 5 lỗ), f–j nối nhau.
// Đánh số như chữ in trên board thật (CAD): cột 1 ở −X, hàng a ở +Z (phía người nhìn), j ở −Z.
// 4 thanh nguồn × 50 lỗ (10 nhóm × 5), liền suốt chiều dài: phía sau (−Z) W (+, trong, z = −19.05) · X (−, ngoài, z = −21.59);
// phía trước (+Z) Z (+, trong, z = +19.05) · Y (−, ngoài, z = +21.59).
// Khe: 'bb-hole' × 830, 'bb-span' × 63 (IC 300 mil vắt rãnh: chân 1…n/2 ở hàng e, còn lại hàng f),
// 'bb-span-600' × 63 (IC 600 mil: chân 1…n/2 ở hàng d, còn lại hàng h). IC luôn có chân 1 ở phía +Z, chạy theo +X.
// Gốc: đáy giữa (đáy lớp keo).
import {
  THREE, PM, gBox, staticParts, decal, text, socketSpec, socketsOnce, anchor, fitsKind, finalizeDef, orientationByAxis, colorMat, cached, PITCH, tf,
} from './_shared.js';

const L = 165.1, Wd = 54.6, H = 9.3, TAPE = 0.8;
export const ROWS = 'abcdefghij';
const ROW_Z = { a: 13.97, b: 11.43, c: 8.89, d: 6.35, e: 3.81, f: -3.81, g: -6.35, h: -8.89, i: -11.43, j: -13.97 };
const RAIL_Z = { W: -19.05, X: -21.59, Y: 21.59, Z: 19.05 };
const RAIL_SIGN = { W: '+', X: '−', Y: '−', Z: '+' };
const colX = (col) => (col - 32) * PITCH;
/** vị trí lỗ thứ k (1..50) của thanh nguồn: 10 nhóm × 5, cách 1 bước giữa các nhóm, thẳng cột 3…61 */
const railX = (k) => { const g = Math.floor((k - 1) / 5), j = (k - 1) % 5; return colX(3 + g * 6 + j); };

/** Danh sách lỗ: { id, x, z, net } */
export const HOLES = (() => {
  const out = [];
  for (let col = 1; col <= 63; col++) for (const r of ROWS) out.push({ id: `${r}${col}`, x: colX(col), z: ROW_Z[r], net: `${col}${'abcde'.includes(r) ? 'L' : 'R'}`, row: r, col });
  for (const rail of 'WXYZ') for (let k = 1; k <= 50; k++) out.push({ id: `${rail}${k}`, x: railX(k), z: RAIL_Z[rail], net: `RAIL_${rail}`, rail, k, sign: RAIL_SIGN[rail] });
  return out;
})();
const HOLE_BY_ID = new Map(HOLES.map((h) => [h.id, h]));

/** Mạng (net) của một lỗ. state.railsSplit = true → thanh nguồn bị cắt đôi giữa (một số board 830) */
export function netOf(holeId, state = {}) {
  const h = HOLE_BY_ID.get(holeId);
  if (!h) return null;
  if (h.rail && state.railsSplit) return `RAIL_${h.rail}${h.k <= 25 ? 'a' : 'b'}`;
  return h.net;
}
/** Tất cả mạng: { id → [holeId…] } */
export function nets(state = {}) {
  const m = {};
  for (const h of HOLES) (m[netOf(h.id, state)] ||= []).push(h.id);
  return m;
}

/** vạch màu dọc thanh nguồn (CAD stripe_*): đỏ cạnh thanh +, xanh cạnh thanh − */
const STRIPES = [[-17.55, '#d42a2a'], [-23.5, '#2a55d4'], [17.55, '#d42a2a'], [23.5, '#2a55d4']];

function bodyGeo() {
  return cached('bb830:body', () => {
    // mặt cắt ngang (z, y) đùn theo X: rãnh giữa + 2 rãnh phân cách thanh nguồn
    const s = new THREE.Shape();
    const hz = Wd / 2, ch = 1.5, cd = 4.5, gz = 16.3, gw = 0.6, gd = 0.6, y0 = TAPE;
    s.moveTo(-hz, y0); s.lineTo(hz, y0); s.lineTo(hz, H - 0.5); s.lineTo(hz - 0.5, H);
    s.lineTo(gz + gw, H); s.lineTo(gz + gw / 2, H - gd); s.lineTo(gz, H);
    s.lineTo(ch, H); s.lineTo(ch * 0.8, H - cd); s.lineTo(-ch * 0.8, H - cd); s.lineTo(-ch, H);
    s.lineTo(-gz, H); s.lineTo(-gz - gw / 2, H - gd); s.lineTo(-gz - gw, H);
    s.lineTo(-hz + 0.5, H); s.lineTo(-hz, H - 0.5); s.lineTo(-hz, y0);
    const g = new THREE.ExtrudeGeometry(s, { depth: L, bevelEnabled: false });
    g.rotateY(-Math.PI / 2);            // đùn theo −X → chạy dọc X
    g.translate(L / 2, 0, 0);
    // shape (z, y): sau khi quay, trục shape-x → z
    g.computeVertexNormals();
    return g;
  });
}

function labels(g, Wp, Hp, s) {
  const X = (x) => (x + L / 2) * s, Z = (z) => (z + Wd / 2) * s;
  // vạch đỏ/xanh dọc thanh nguồn
  const line = (z, col) => { g.fillStyle = col; g.fillRect(X(colX(2)), Z(z) - 0.35 * s, (colX(62) - colX(2)) * s, 0.7 * s); };
  for (const [z, col] of STRIPES) line(z, col);
  const sym = (z, ch, col) => { for (const x of [colX(1), colX(63)]) text(g, ch, X(x), Z(z), 2.6 * s, { color: col, weight: '900' }); };
  sym(RAIL_Z.W, '+', '#d42a2a'); sym(RAIL_Z.X, '−', '#2a55d4'); sym(RAIL_Z.Y, '−', '#2a55d4'); sym(RAIL_Z.Z, '+', '#d42a2a');
  // số cột (mỗi 5) 2 bên vùng chính
  for (let col = 1; col <= 63; col++) {
    if (col !== 1 && col % 5) continue;
    for (const z of [-16.5, 16.5]) text(g, String(col), X(colX(col)), Z(z), 1.5 * s, { color: '#55585e', weight: '600' });
  }
  // chữ hàng 2 đầu
  for (const r of ROWS) for (const x of [colX(0) + 0.6, colX(64) - 0.6]) text(g, r, X(x), Z(ROW_Z[r]), 1.6 * s, { color: '#55585e', weight: '600' });
}

const def = finalizeDef({
  id: 'breadboard-830', name: 'Breadboard 830 lỗ', kind: 'part', category: 'board', lessonId: 'ban-thi-nghiem-dien', massG: 60,
  size: [L, H, Wd],
  grip: { pose: 'grip', offset: [-L / 2 + 15, H, 0], rot: [0, 0, 0] },
  pins: [],
  provides: ['bb-hole', 'bb-span', 'bb-span-600'],
  insertInto: [],
  mount: { seatY: 0 },
  connectivity: { strips: '63 cột × 2 (a–e = "<cột>L", f–j = "<cột>R")', rails: { RAIL_W: '+', RAIL_X: '−', RAIL_Y: '−', RAIL_Z: '+' }, railsSplit: false },
  top: H,
  cad: 'boards/breadboard-830',
  cadOptions: { onBottom: false, offset: [0, 0, 0] },
  holes: HOLES, netOf, nets,
  build() {
    const root = new THREE.Group();
    root.name = 'breadboard-830';
    root.add(staticParts('breadboard-830', (B) => {
      B.add(bodyGeo(), PM.absWhite);
      B.add(gBox(L - 1.0, TAPE, Wd - 1.0), colorMat(0xf4f1e6, { rough: 0.9 }), { y: TAPE / 2 }, { shadow: false });   // lớp keo + giấy đế
      // gờ ghép mộng 2 bên (dovetail): mộng nhô 2.2 mm ở +Z, rãnh ở −Z
      for (let k = 0; k < 6; k++) {
        B.add(gBox(5, 4, 2.2), PM.absWhite, { x: -65 + k * 26, y: TAPE + 3.0, z: Wd / 2 + 1.1 });
        B.add(gBox(5.4, 4.2, 1.3), PM.absGrey, { x: -65 + k * 26, y: TAPE + 2.9, z: -Wd / 2 + 0.6 }, { shadow: false });
      }
      // lỗ: ô vuông tối hơi lõm
      const ms = HOLES.map((h) => tf({ x: h.x, y: H - 0.02, z: h.z }));
      B.inst(gBox(0.95, 0.06, 0.95), PM.hole, ms);
      B.inst(gBox(1.35, 0.03, 1.35), colorMat(0xd9d7cf, { rough: 0.7 }), HOLES.map((h) => tf({ x: h.x, y: H + 0.004, z: h.z })));
      // vạch nguồn bằng hình học (luôn có, kể cả không canvas)
      for (const [z, c] of STRIPES.map(([z0, c0]) => [z0, parseInt(c0.slice(1), 16)])) B.add(gBox(colX(62) - colX(2), 0.02, 0.7), colorMat(c, { rough: 0.5 }), { y: H + 0.006, z }, { shadow: false });
      B.obj(() => decal('bb830:labels', L, Wd, labels, { y: H + 0.012, pxPerMm: 7, rough: 0.6 }));
    }));
    return root;
  },
  sockets(inst) {
    return socketsOnce(inst, () => {
      const list = [];
      for (const h of HOLES) {
        const a = anchor(inst.object, `bb:${h.id}`, [h.x, H, h.z]);
        list.push(socketSpec(inst, {
          id: h.id, kind: 'bb-hole', anchor: a, net: h.net, tolerance: { pos: 1.0, angleDeg: 10 },
          accepts(item) {
            if (this.occupiedBy) return { ok: false, reason: `Lỗ ${h.id} đã có chân` };
            if (!fitsKind(item, 'bb-hole')) return { ok: false, reason: 'Không cắm breadboard được' };
            const ready = item.def.insertReady?.(item);
            if (ready && !ready.ok) return ready;
            return { ok: true, orientation: 'ok' };
          },
          poseFor(item, pinId) {
            const d = item?.def;
            const pins = d?.getPins?.(item) ?? d?.pins ?? [];
            const p = (pinId && pins.find((q) => q.id === pinId)) || pins[0];
            return new THREE.Matrix4().makeTranslation(-(p?.pos[0] ?? 0), -(d?.mount?.seatY ?? 0), -(p?.pos[2] ?? 0));
          },
        }));
      }
      // IC vắt rãnh giữa: chân 1 ở cột col, hàng phía +Z (e | d), chạy theo +X
      for (const [kind, zc, rowsSpan] of [['bb-span', 0, 7.62], ['bb-span-600', -1.27, 15.24]]) {
        for (let col = 1; col <= 63; col++) {
          const a = anchor(inst.object, `${kind}:${col}`, [colX(col), H, zc]);
          list.push(socketSpec(inst, {
            id: `${kind}:${col}`, kind, anchor: a, col,
            accepts(item, ctx) {
              const d = item?.def;
              if (!fitsKind(item, kind)) return { ok: false, reason: kind === 'bb-span-600' ? 'Chỉ cho IC/module 600 mil' : 'Chỉ cho IC/module 300 mil' };
              const n = d.dip?.n ?? d.pins?.length ?? 2;
              if (d.dip && Math.abs(d.dip.row - rowsSpan) > 0.1) return { ok: false, reason: `IC hàng cách ${d.dip.row} mm — không vừa khe ${rowsSpan}` };
              if (col + n / 2 - 1 > 63) return { ok: false, reason: 'Hết cột — dịch IC sang trái' };
              const orientation = orientationByAxis(item, a, 'x', ctx);
              return orientation === 'offset' ? { ok: false, orientation, reason: 'Xoay 90° — IC phải nằm dọc theo hàng' } : { ok: true, orientation };
            },
            poseFor(item) {
              const d = item?.def;
              const n = d?.dip?.n ?? d?.pins?.length ?? 2;   // [đi dây] đế DIP (không có def.dip) cũng phải căn giữa theo số chân
              return new THREE.Matrix4().makeTranslation(((n / 2 - 1) * PITCH) / 2, -(d?.mount?.seatY ?? 0), 0);
            },
            holesFor(item) {
              const n = item?.def?.dip?.n ?? item?.def?.pins?.length ?? 2;   // [đi dây] như poseFor
              const r1 = kind === 'bb-span' ? ['e', 'f'] : ['d', 'h'];   // [hàng chân 1…n/2 (+Z), hàng chân n/2+1…n (−Z)]
              const out = [];
              for (let k = 0; k < n / 2; k++) out.push(`${r1[0]}${col + k}`);
              for (let k = n / 2 - 1; k >= 0; k--) out.push(`${r1[1]}${col + k}`);
              return out;   // theo thứ tự chân 1..n
            },
          }));
        }
      }
      return list;
    });
  },
});
export default def;
