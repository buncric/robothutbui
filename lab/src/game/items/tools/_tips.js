// Mũi hàn rời kiểu T18 / 900M (dùng chung cho item mũi hàn tip-*.js và mỏ hàn soldering-iron.js). KHÔNG export default.
// Hình học theo cad/src/lab/_tips.py (ống gốc Ø6.5 dài 22 mm lồng vào ống nhiệt, phần làm việc mạ thiếc, tổng dài ~40 mm).
// tipGeometry(code) → Group trục +Z: gốc z = 0 ở ĐÁY ống gốc, đầu làm việc ở z ≈ 40 (cùng quy ước node CAD tip_<mã>).
// Thông số kỹ thuật & bài học: minigames/_solder_kb.js (docs/07_KIEN_THUC_HAN_MACH.md §1, §2, §13.1).
import * as THREE from 'three';
import { TIPS, tipSpec, tipItemId } from '../../minigames/_solder_kb.js';

export const TIP_LEN = 40, BASE_LEN = 22, R_BASE = 3.25, R_SHANK = 2.55;
const SEG = 20;

let _M = null;
/** Vật liệu mũi (dùng chung) — 'body' thép mạ sắt-niken, 'work' đầu mạ thiếc (instance clone khi cần đổi màu) */
export function tipMats() {
  if (_M) return _M;
  _M = {
    body: new THREE.MeshStandardMaterial({ color: 0x8f959b, metalness: 1, roughness: 0.38 }),
    work: new THREE.MeshStandardMaterial({ color: 0xe3e7ea, metalness: 1, roughness: 0.16 }),
  };
  return _M;
}

const lathe = (pts, seg = SEG) => new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(Math.max(0, r), z)), seg).rotateX(Math.PI / 2);
// LatheGeometry quay quanh trục Y; rotateX(+90°) đưa trục Y → +Z ((x, y, z) → (x, −z, y)).

function cone(z0, r0, z1, r1, ball = 0) {
  const p = [[0, z0], [r0, z0], [r1, z1]];
  if (ball > 0) for (let i = 1; i <= 6; i++) { const a = (Math.PI / 2) * (i / 6); p.push([r1 * Math.cos(a), z1 + ball * Math.sin(a)]); }
  p.push([0, z1 + (ball > 0 ? ball : 0)]);
  return lathe(p);
}
function baseGeo() {
  return lathe([[0, 0], [R_BASE - 0.2, 0], [R_BASE, 0.4], [R_BASE, BASE_LEN], [R_SHANK + 0.25, BASE_LEN + 1.2], [R_SHANK, BASE_LEN + 2], [R_SHANK, 26], [0, 26]]);
}

/** Hình học phần làm việc theo mã (trục +Z). Trả { body:[Geometry], work:[Geometry], end: z đầu mũi } */
function shapes(code) {
  const body = [baseGeo()], work = [];
  let end = 39.9;
  const t = tipSpec(code);
  if (t.shape === 'conical' || t.shape === 'needle') {
    const rEnd = code === 'I' ? 0.2 : code === 'B05' ? 0.28 : 0.55;
    const z1 = code === 'I' ? 41.6 : 39.4;
    body.push(cone(25.9, R_SHANK, 31, code === 'I' ? 1.7 : 1.9));
    work.push(cone(30.95, code === 'I' ? 1.7 : 1.9, z1, rEnd, rEnd));
    end = z1 + rEnd;
  } else if (t.shape === 'bevel') {
    const d = t.width, r = d / 2;
    const r0 = Math.max(r + 0.35, 1.2);
    body.push(cone(25.9, R_SHANK, 31.5, r0));
    const len = 6.5 + d;
    // trụ Ø d rồi cắt vát 45°: dựng bằng Lathe trụ + dịch đỉnh theo mặt phẳng nghiêng
    const g = new THREE.CylinderGeometry(r, r0, len + 1.5, 24, 6).rotateX(Math.PI / 2).translate(0, 0, 31.5 + (len + 1.5) / 2);
    const p = g.attributes.position;
    const zc = 31.5 + len + 1.5 - r;            // mặt vát đi qua tâm ở z = zc
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), z = p.getZ(i);
      const zMax = zc - y;                      // mặt phẳng 45°: z + y = zc
      if (z > zMax) p.setZ(i, Math.max(31.5, zMax));
    }
    g.computeVertexNormals();
    work.push(g);
    end = zc + r;
  } else if (t.shape === 'chisel') {
    const w = t.width;
    body.push(cone(25.9, R_SHANK, 30, 2.1));
    // loft tròn → chữ nhật (w × 0,55)
    const g = new THREE.CylinderGeometry(1, 1, 9.2, 24, 8).rotateX(Math.PI / 2).translate(0, 0, 30 + 4.6);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = (z - 30) / 9.2;                 // 0 → 1
      const a = Math.atan2(y, x);
      const rx = 2.1 + (w / 2 - 2.1) * k, ry = 2.1 + (0.275 - 2.1) * Math.pow(k, 0.7);
      // nội suy tròn → chữ nhật bo góc
      const c = Math.cos(a), s = Math.sin(a);
      const sq = Math.min(1 / Math.max(Math.abs(c), 1e-3), 1 / Math.max(Math.abs(s), 1e-3));
      const m = 1 + (Math.min(sq, 1.35) - 1) * k;
      p.setXYZ(i, c * rx * m, s * ry * m, z);
    }
    g.computeVertexNormals();
    work.push(g);
    end = 39.2;
  } else if (t.shape === 'knife') {
    body.push(cone(25.9, R_SHANK, 30, 2.0));
    work.push(cone(29.95, 2.0, 32, 1.6));
    const sh = new THREE.Shape([[-1.6, 31.5], [1.6, 31.5], [1.6, 36], [0.4, 40.6], [-1.6, 40.6]].map(([x, z]) => new THREE.Vector2(x, z)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1.1, bevelEnabled: true, bevelSize: 0.15, bevelThickness: 0.15, bevelSegments: 1 });
    // hình (x, y) + đùn theo z → (x, z−0.55, y): lưỡi nằm trong mặt XZ, dày 1,1 mm theo Y (phép đổi trục đảo chiều mặt → flip)
    const q = g.attributes.position;
    for (let i = 0; i < q.count; i++) { const x = q.getX(i), y = q.getY(i), z = q.getZ(i); q.setXYZ(i, x, z - 0.55, y); }
    flip(g);
    work.push(g);
    end = 40.6;
  } else if (t.shape === 'bent') {
    body.push(cone(25.9, R_SHANK, 30, 1.9));
    const b = cone(0, 1.9, 9, 0.45, 0.45);
    b.rotateX(-Math.PI / 6).translate(0, 0, 29.95);
    work.push(b, new THREE.SphereGeometry(1.9, 16, 10).translate(0, 0, 29.95));
    end = 29.95 + 9.4 * Math.cos(Math.PI / 6);
  }
  return { body, work, end };
}
function flip(g) {
  const idx = g.index;
  if (idx) { const a = idx.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } idx.needsUpdate = true; }
  else {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 3) for (const at of Object.values(g.attributes)) {
      const n = at.itemSize;
      for (let k = 0; k < n; k++) { const t = at.array[(i + 1) * n + k]; at.array[(i + 1) * n + k] = at.array[(i + 2) * n + k]; at.array[(i + 2) * n + k] = t; }
    }
  }
  g.computeVertexNormals();
}

const GEO = new Map();
/** Group mũi hàn (trục +Z, gốc ở đáy ống gốc). workMat: vật liệu đầu mạ thiếc (instance riêng để đổi màu oxy hoá) */
export function tipGeometry(code, { workMat = null, bodyMat = null } = {}) {
  let s = GEO.get(code);
  if (!s) { s = shapes(code); GEO.set(code, s); }
  const M = tipMats();
  const g = new THREE.Group();
  g.name = `tip_${code}`;
  for (const geo of s.body) { const m = new THREE.Mesh(geo, bodyMat || M.body); m.castShadow = true; m.receiveShadow = true; m.name = `tip_${code}_body`; g.add(m); }
  for (const geo of s.work) { const m = new THREE.Mesh(geo, workMat || M.work); m.castShadow = true; m.receiveShadow = true; m.name = `tip_${code}_work`; g.add(m); }
  g.userData.tipEnd = s.end;
  g.userData.tipCode = code;
  return g;
}
export const tipEndZ = (code) => { let s = GEO.get(code); if (!s) { s = shapes(code); GEO.set(code, s); } return s.end; };

const TIN = new THREE.Color(0xe3e7ea), OXIDE = new THREE.Color(0x2c241f), GLOW = new THREE.Color(1, 0.28, 0.06);
/** Đổi màu vật liệu đầu mũi theo oxy hoá / lớp thiếc / nhiệt độ (dùng cho mũi rời và mũi đang lắp) */
export function paintTip(mat, { oxidation = 0, tinned = 0.5, temp = 30 } = {}) {
  if (!mat) return;
  const k = Math.min(1, oxidation * (1 - Math.min(1, tinned) * 0.6));
  mat.color.copy(TIN).lerp(OXIDE, k);
  mat.roughness = 0.16 + k * 0.62;
  mat.metalness = 1 - k * 0.35;
  if (mat.emissive) {
    const glow = Math.max(0, Math.min(1, (temp - 250) / 200));
    mat.emissive.copy(GLOW);
    mat.emissiveIntensity = glow * 2.2;
  }
}

/**
 * Item def cho một mũi hàn rời (kind 'part' → không chiếm thanh dụng cụ; cầm bằng tay như linh kiện).
 * state: { oxidation, tinned, temp (°C — mũi vừa tháo ra còn NÓNG, nguội τ ≈ 45 s), uses }
 * Hành động: F (nhìn hoặc cầm) → thẻ "phân tích mũi hàn" · T (nhìn) → lắp / thay mũi này vào mỏ hàn (minigames/solder-pro.js).
 */
export function tipDef(code) {
  const t = TIPS[code];
  const id = tipItemId(code);
  const def = {
    id, name: `Mũi hàn ${t.name}`, kind: 'part', category: 'solder-tip', icon: '🔩', massG: 4, size: [6.5, 6.5, 40],
    tipCode: code, desc: `${t.desc} Dùng cho: ${t.use}`,
    build() {
      const root = new THREE.Group();
      root.name = id;
      const workMat = tipMats().work.clone(); workMat.userData.own = true;
      const g = tipGeometry(code, { workMat });
      g.position.set(0, R_BASE, -20);       // nằm ngang trên bàn, tâm dài ở gốc
      root.add(g);
      root.userData.parts = { workMat, tip: g };
      return root;
    },
    grip: { pose: 'pinch', offset: [0, -R_BASE, 0], rot: [0, 0, 0] },
    init(inst) {
      const s = inst.state;
      if (s.oxidation == null) s.oxidation = 0;
      if (s.tinned == null) s.tinned = 0.28;          // lớp mạ thiếc sẵn của nhà sản xuất (mỏng — phải phủ thiếc khi nóng) [V][5]
      if (s.temp == null) s.temp = 30;
      if (s.uses == null) s.uses = 0;
    },
    update(inst, dt, game) {
      const s = inst.state;
      const amb = game?.lab?.ambient ?? 30;
      if (s.temp > amb + 0.5 && dt > 0) {
        // mũi rời nguội τ ≈ 45 s (đặt trên giá nhôm/thảm silicone) [TK]
        s.temp = amb + (s.temp - amb) * Math.exp(-dt / 45);
        if (s.temp > 200) s.oxidation = Math.min(1, s.oxidation + 0.008 * Math.exp((s.temp - 350) / 50) * (s.tinned > 0.25 ? 0.08 : 1) * dt);
      }
      const P = inst.object?.userData?.parts;
      if (P && (inst._paintKey !== `${s.oxidation.toFixed(2)}|${Math.round(s.temp / 10)}`)) {
        inst._paintKey = `${s.oxidation.toFixed(2)}|${Math.round(s.temp / 10)}`;
        paintTip(P.workMat, s);
      }
    },
    /** Dữ liệu tra cứu cho thẻ bài học */
    spec: t,
    actions: [
      { id: 'tip-card', key: 'F', target: true, held: true, label: () => `Phân tích mũi ${code} (thẻ bài học)`, do: (inst, game) => game?.soldering?.pro?.openCard?.(`tip:${code}`) },
      {
        id: 'tip-fit', key: 'T', target: true,
        label: (inst, game) => game?.soldering?.pro?.fitLabel?.(inst) || `Lắp mũi ${code} vào mỏ hàn`,
        do: (inst, game) => game?.soldering?.pro?.fitTip?.(inst),
      },
    ],
  };
  return def;
}
