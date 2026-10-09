// Board đục lỗ (perfboard) 9 × 15 cm, FR-4 1.6 mm phủ xanh 2 mặt, lỗ mạ xuyên Ø1.0 / pad thiếc HASL Ø1.8 — theo CAD
// boards/perfboard-9x15 (Elecrow 9×15): lưới 2.54 mm: 34 hàng (Z) × 52 cột (X) = 1768 lỗ, lỗ đầu ở (±64.77, ±41.91),
// 4 lỗ bắt vít Ø3 tại (±70, ±40). Hàng game r = 34 − hàng CAD (pads_row_1 ở +Z ↔ r = 33), cột c = 0 ở −X.
// Mỗi lỗ: 1 khe 'pcb-hole' (id pad 'r,c') + 1 bản ghi pad hàn (mặt dưới) cho minigames/soldering.js.
// Gốc: đáy giữa. Mặt pad dưới y = 0, mặt pad trên y = 1.68 (TOP) — tấm FR-4 hiển thị đặc từ 0 → TOP.
//
// [HIỆU NĂNG 2026-10] GLB gốc 806k tam giác (34 hàng pad × 20k + 34 dải FR-4 khoét lỗ) — một mình nó kéo cảnh toàn phòng
// từ ~125 xuống ~50 fps (cả bóng đổ + raycast 800k tam giác). Nay vẽ thủ tục rẻ, giữ nguyên dáng CAD:
//   • khung viền FR-4 (đùn, khoét ô lưới + 4 lỗ vít) + 2 mặt lưới phẳng (mặt trên/dưới) dán TEXTURE LẶP 1 Ô 2.54 mm:
//     màu (xanh phủ / vòng pad HASL / lỗ alpha = 0 → alphaTest khoét lỗ thật), normal (gờ vòng pad), ORM (nhám/kim loại);
//   • ống mạ xuyên: 1 InstancedMesh (12 cạnh, chỉ mặt trong) — nhìn xuyên lỗ thấy thành ống + mặt kia như thật;
//   • GLB chỉ còn silkscreen (ẩn pads_row_* / pcb_row_* / pcb_margin_* / pads_mount).  ≈ 42k tam giác, 4 draw call.
import {
  THREE, PM, gRing, gCyl, staticParts, socketSpec, socketsOnce, anchor, fitsKind, padRecord, padsOnce, padWorld,
  finalizeDef, tf, cached, PITCH, ud, roundRectShape, circlePath, extrudeY,
} from './_shared.js';

export const ROWS = 34, COLS = 52;
const W = 150, D = 90, T = 1.6, CU = 0.04;
const TOP = CU + T + CU;
const holeX = (c) => (c - (COLS - 1) / 2) * PITCH;
const holeZ = (r) => (r - (ROWS - 1) / 2) * PITCH;
export const padId = (r, c) => `${r},${c}`;
const MOUNT = [[-70, -40], [70, -40], [-70, 40], [70, 40]];

const GW = COLS * PITCH, GD = ROWS * PITCH;           // ô lưới 132.08 × 86.36 (mép giữa 2 lỗ)
const TILE = 512;                                    // px / ô 2.54 mm (≈ 200 px/mm — nét ở kính hiển vi 45×)
const C_MASK = [0x21, 0x79, 0x40], C_PAD = [0xcb, 0xcb, 0xcb], C_HOLE = [0x16, 0x17, 0x17];   // = vật liệu CAD (sRGB)
const R_HOLE = 0.5, R_PAD = 0.9;

/** 3 texture lặp của 1 ô lưới (DataTexture — chạy cả trong Node): map RGBA (alpha 0 = lỗ), normal (gờ pad), ORM */
function tileMaps() {
  return cached('pfb:tile', () => {
    const N = TILE, col = new Uint8Array(N * N * 4), nrm = new Uint8Array(N * N * 4), orm = new Uint8Array(N * N * 4);
    const px = PITCH / N, sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i + 0.5) * px - PITCH / 2, y = (j + 0.5) * px - PITCH / 2, r = Math.hypot(x, y) || 1e-6;
      const pad = sm(R_PAD + px, R_PAD - px, r);                       // 1 trong vòng pad (khử răng cưa 1 px)
      const hole = sm(R_HOLE + px, R_HOLE - px, r);                    // 1 trong lỗ
      const k = (j * N + i) * 4;
      for (let c = 0; c < 3; c++) col[k + c] = Math.round((C_MASK[c] * (1 - pad) + C_PAD[c] * pad) * (1 - hole) + C_HOLE[c] * hole);
      col[k + 3] = Math.round(255 * (1 - hole));
      // độ dốc mặt pad (dh/dr): mép ngoài vát xuống phủ xanh, mép trong vát vào lỗ, giữa hơi vồng (HASL)
      const dh = r > R_PAD - 0.06 && r < R_PAD + 0.02 ? -1.1 : r > R_HOLE && r < R_HOLE + 0.07 ? 0.9 : pad > 0.5 ? (0.7 - r) * 0.35 : 0;
      const g = pad * (1 - hole) * dh, nx = -g * x / r, ny = -g * y / r, l = Math.hypot(nx, ny, 1);
      nrm[k] = Math.round((nx / l * 0.5 + 0.5) * 255); nrm[k + 1] = Math.round((ny / l * 0.5 + 0.5) * 255); nrm[k + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); nrm[k + 3] = 255;
      orm[k] = 255; orm[k + 1] = Math.round(255 * (0.55 + (0.3 - 0.55) * pad)); orm[k + 2] = Math.round(255 * (0.05 + (0.9 - 0.05) * pad)); orm[k + 3] = 255;
    }
    const mk = (data, srgb) => {
      const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      return t;
    };
    return { map: mk(col, true), normalMap: mk(nrm, false), orm: mk(orm, false) };
  });
}
const gridMat = () => cached('pfb:gridMat', () => {
  const t = tileMaps();
  return new THREE.MeshStandardMaterial({
    map: t.map, normalMap: t.normalMap, roughnessMap: t.orm, metalnessMap: t.orm, roughness: 1, metalness: 1, alphaTest: 0.5, name: 'perfboard-grid',
  });
});
const maskMat = () => cached('pfb:mask', () => new THREE.MeshStandardMaterial({ color: 0x217940, metalness: 0.05, roughness: 0.55, name: 'perfboard-mask' }));
const barrelMat = () => cached('pfb:barrel', () => new THREE.MeshStandardMaterial({ color: 0xcbcbcb, metalness: 0.9, roughness: 0.3, side: THREE.BackSide, name: 'perfboard-barrel' }));
/** mặt lưới phẳng (UV = số ô → texture lặp 1 ô / lỗ, tâm lỗ ở tâm ô) */
function gridFace(top) {
  return cached(`pfb:face:${top}`, () => {
    const g = new THREE.PlaneGeometry(GW, GD);
    g.rotateX(top ? -Math.PI / 2 : Math.PI / 2);
    g.translate(0, top ? TOP : 0, 0);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * COLS, uv.getY(i) * ROWS);
    return g;
  });
}
/** khung FR-4 quanh ô lưới (đặc 0 → TOP), 4 lỗ vít */
function frameGeo() {
  return cached('pfb:frame', () => {
    const s = roundRectShape(W, D, 1.2);
    s.holes.push(roundRectShape(GW, GD, 0, 0, 0, new THREE.Path()));
    for (const [x, z] of MOUNT) s.holes.push(circlePath(x, -z, 1.5));
    return extrudeY(s, TOP, { curveSeg: 10 });
  });
}

/** toạ độ cục bộ (mặt trên) của lỗ r,c */
export function holeLocal(r, c, side = 'top') { return [holeX(c), side === 'top' ? TOP : 0, holeZ(r)]; }
/** lỗ gần nhất với điểm cục bộ (x, z) */
export function nearestHoleLocal(x, z) {
  const c = Math.round(x / PITCH + (COLS - 1) / 2), r = Math.round(z / PITCH + (ROWS - 1) / 2);
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
  return { r, c, id: padId(r, c), dist: Math.hypot(x - holeX(c), z - holeZ(r)) };
}

const barrelGeo = () => cached('pfb:barrelGeo', () => new THREE.CylinderGeometry(R_HOLE / Math.cos(Math.PI / 12), R_HOLE / Math.cos(Math.PI / 12), TOP - 0.006, 12, 1, true));
const barrelMatrices = () => cached('pfb:barrelM', () => {
  const a = new Float32Array(ROWS * COLS * 16), m = new THREE.Matrix4();
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) m.makeTranslation(holeX(c), TOP / 2, holeZ(r)).toArray(a, (r * COLS + c) * 16);
  return new THREE.InstancedBufferAttribute(a, 16);
});

const def = finalizeDef({
  id: 'perfboard-9x15',
  name: 'Board đục lỗ 9×15 cm (2 mặt)',
  kind: 'part',
  category: 'board',
  lessonId: 'han-mach-pic',
  massG: 40,
  size: [W, TOP, D],
  grip: { pose: 'grip', offset: [-W / 2 + 12, TOP, 0], rot: [0, 0, 0] },
  pins: [],
  grid: { rows: ROWS, cols: COLS, pitch: PITCH, idFormat: 'r,c', origin: 'r=0 ở −Z, c=0 ở −X' },
  provides: ['pcb-hole'],
  insertInto: ['vise', 'pcb-holder'],
  mount: { seatY: 0 },
  cad: 'boards/perfboard-9x15',
  // GLB: đáy FR-4 y = 0 → +0.08 để silkscreen (y 1.612 trong GLB) nổi trên mặt lưới TOP = 1.68. Phần nặng của GLB bị ẩn,
  // hình thủ tục (rẻ) giữ nguyên hiển thị cạnh CAD (keepFallback).
  cadOptions: {
    onBottom: false, offset: [0, 0.08, 0], keepFallback: true,
    hide: ['pads_row_*', 'pcb_row_*', 'pcb_margin_*', 'pads_mount', 'part_o1_*'],
    onLoad(glb) {
      glb.traverse((m) => {
        if (!m.isMesh || m.layers.isEnabled(31)) return;           // nút đã ẩn (layer 31)
        m.castShadow = false;
        m.material = m.material.clone();
        m.material.polygonOffset = true; m.material.polygonOffsetFactor = -2; m.material.polygonOffsetUnits = -2;
      });
    },
  },
  holeLocal, nearestHoleLocal, padId,
  build() {
    const root = new THREE.Group();
    root.name = 'perfboard-9x15';
    root.add(staticParts('perfboard-9x15:v2', (B) => {
      B.obj(() => { const m = new THREE.Mesh(frameGeo(), [maskMat(), PM.fr4]); m.name = 'fr4'; m.castShadow = m.receiveShadow = true; return m; });
      B.obj(() => {
        const g = new THREE.Group(); g.name = 'grid';
        for (const top of [true, false]) {
          const m = new THREE.Mesh(gridFace(top), gridMat());
          m.name = top ? 'grid-top' : 'grid-bottom'; m.receiveShadow = true; m.castShadow = true; m.matrixAutoUpdate = false;
          g.add(m);
        }
        return g;
      });
      // vòng đồng + ống mạ lỗ bắt vít (2 mặt)
      for (const [x, z] of MOUNT) {
        B.add(gRing(1.5, 2.5, 24), PM.hasl, { x, y: TOP + 0.012, z }, { shadow: false, name: 'mount' });
        B.add(gRing(1.5, 2.5, 24), PM.hasl, tf({ x, y: -0.012, z, rx: Math.PI }), { shadow: false, name: 'mount' });
        B.add(gCyl(1.5, 1.5, TOP - 0.01, 16, true), barrelMat(), { x, y: TOP / 2, z }, { shadow: false, name: 'mount' });
      }
      // ống mạ xuyên 1768 lỗ: đa giác 12 cạnh NGOẠI tiếp lỗ Ø1.0 (đỉnh nằm dưới vòng pad, không lộ khe)
      B.obj(() => {
        const im = new THREE.InstancedMesh(barrelGeo(), barrelMat(), ROWS * COLS);
        im.instanceMatrix = barrelMatrices();
        im.name = 'barrels';
        im.matrixAutoUpdate = false;
        im.userData.noShadow = true;
        im.raycast = () => {};                 // tia tương tác dừng ở mặt lưới (không duyệt 1768 bản)
        im.computeBoundingSphere();
        return im;
      });
    }));
    return root;
  },
  init(inst) {
    // items.spawn bật castShadow cho mọi mesh — ống mạ / vòng vít không cần đổ bóng (rẻ hơn 1 lượt shadow)
    inst.object.traverse((m) => { if (m.userData.noShadow || m.name === 'mount') m.castShadow = false; });
  },
  /** 1768 khe 'pcb-hole' (tạo lười khi engine hỏi lần đầu) */
  sockets(inst) {
    return socketsOnce(inst, () => {
      const list = [];
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const id = padId(r, c);
        const a = anchor(inst.object, `hole:${id}`, [holeX(c), TOP, holeZ(r)]);
        list.push(socketSpec(inst, {
          id, kind: 'pcb-hole', anchor: a, r, c, pad: id, tolerance: { pos: 1.0, angleDeg: 10 },
          accepts(item) {
            if (this.occupiedBy) return { ok: false, reason: `Lỗ ${id} đã có chân` };
            if (!fitsKind(item, 'pcb-hole')) return { ok: false, reason: 'Không cắm xuyên lỗ được' };
            const ready = item.def.insertReady?.(item);
            if (ready && !ready.ok) return ready;
            return { ok: true, orientation: 'ok' };
          },
          /** đặt item sao cho chân pinId (mặc định chân đầu tiên) xuyên lỗ này, mặt tựa chạm mặt board */
          poseFor(item, pinId) {
            const d = item?.def;
            const pins = d?.getPins?.(item) ?? d?.pins ?? [];
            const p = (pinId && pins.find((q) => q.id === pinId)) || pins[0];
            const seat = d?.mount?.seatY ?? 0;
            return new THREE.Matrix4().makeTranslation(-(p?.pos[0] ?? 0), -seat, -(p?.pos[2] ?? 0));
          },
        }));
      }
      return list;
    });
  },
  /** Bản ghi pad hàn cho mỗi lỗ (mặt dưới — mặt hàn). local = toạ độ cục bộ mặt pad dưới */
  solderPads(inst) {
    return padsOnce(inst, () => {
      const arr = [];
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const nb = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([a, b]) => a >= 0 && a < ROWS && b >= 0 && b < COLS).map(([a, b]) => padId(a, b));
        const rec = padRecord(padId(r, c), [holeX(c), 0, holeZ(r)], { side: 'bottom', ring: 0.9, hole: 0.5, neighbors: nb, thermalMass: 0.6 });
        rec.topLocal = [holeX(c), TOP, holeZ(r)];
        rec.r = r; rec.c = c;
        arr.push(rec);
      }
      const byId = new Map(arr.map((p) => [p.id, p]));
      ud(inst.object, 'padIndex', byId);
      return arr;
    });
  },
  getPad(inst, id) { def.solderPads(inst); return inst.object.userData.padIndex.get(id) || null; },
  padWorldPosition(inst, id, out = new THREE.Vector3(), side = 'bottom') {
    const p = def.getPad(inst, id);
    if (!p) return null;
    return padWorld(inst, side === 'top' ? { local: p.topLocal } : p, out);
  },
  /** Lỗ gần nhất với một điểm thế giới (raycast) → { r, c, id, dist } */
  nearestHole(inst, worldPoint) {
    const v = cached('pfb:v', () => new THREE.Vector3());
    v.copy(worldPoint);
    inst.object.updateWorldMatrix(true, false);
    inst.object.worldToLocal(v);
    return nearestHoleLocal(v.x, v.z);
  },
});
export default def;
