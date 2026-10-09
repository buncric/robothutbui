// Giá mũi hàn 10 lỗ (khối nhôm anode đen) với bộ mũi T18 / 900M: B, I, 1C, 2C, 3C, D16, D24, D32, K, J.
// Hình CAD: lab/public/models/lab/tip-rack.glb (cad/src/lab/tip_rack.py) — mỗi mũi là node riêng 'tip_<mã>' (không gộp)
// để hệ thống đổi mũi (minigames/soldering.js · items/tools/soldering-iron.js) nhấc ra / cắm vào.
//
// API cho người khác:
//   prop.slots: [{ code, info, anchor: Object3D (miệng lỗ, +Y lên), tip: Object3D | null (mũi đang cắm), occupied }]
//   prop.tips:  { [code]: Object3D }  (đổi sang node CAD khi GLB nạp xong — sự kiện 'world:tip-rack-ready')
//   prop.takeTip(code) → Object3D | null   (tách mũi khỏi giá, giữ vị trí thế giới; slot.occupied = false)
//   prop.returnTip(code, obj)               (cắm mũi obj về lỗ của mã code)
// Mốc world: 'tip-rack' (gốc giá), 'tip-rack-slot-<mã>' = 'tip-rack-<mã>' (miệng lỗ, khung game: +Y lên = trục mũi).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvasPlane, text } from '../_tex.js';
import { mergeObject } from '../_merge.js';
import { emit, play } from '../_labState.js';
import { upgradeProp, cadFrame } from '../_cad.js';
import { CAD_ANCHORS } from '../_cadAnchors.js';

export const TIP_CODES = ['B', 'I', '1C', '2C', '3C', 'D16', 'D24', 'D32', 'K', 'J'];
export const TIP_INFO = {
  B: 'Côn tròn R0.5 — đa dụng, chân xuyên lỗ', I: 'Côn kim R0.2 — SMD nhỏ, chỗ hẹp', '1C': 'Vát 45° Ø1 — SMD 0603/0805',
  '2C': 'Vát 45° Ø2 — đa dụng, pad vừa', '3C': 'Vát 45° Ø3 — pad lớn, dây nguồn', D16: 'Dẹt 1.6 mm — chân DIP, header',
  D24: 'Dẹt 2.4 mm — truyền nhiệt tốt', D32: 'Dẹt 3.2 mm — mặt đồng lớn, XT60', K: 'Dao — kéo thiếc chân IC, sửa cầu thiếc', J: 'Côn cong 30° — góc khó',
};
const TOP = 30, DEPTH = 18;
const std = (color, metalness, roughness) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
const M = (g, m, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = {}) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; o.receiveShadow = true; return o; };
const rbox = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01));

function slotPos(code, i) {
  const a = CAD_ANCHORS?.['tip-rack']?.[`slot_${code}`]?.p;
  if (a) return new THREE.Vector3(...a);
  const row = Math.floor(i / 5), col = i % 5;
  return new THREE.Vector3((col - 2) * 27, TOP, row === 0 ? -11.5 : 11.5);
}

/** Mũi thủ tục (dự phòng): trục +Y, gốc ở đáy ống gốc */
function procTip(code, K) {
  const g = new THREE.Group();
  g.name = `tip_${code}`;
  const lathe = (pts, mat) => M(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 16), mat);
  g.add(lathe([[0, 0], [3.25, 0], [3.25, 22], [2.55, 24], [2.55, 26], [0, 26]], K.body));
  const work = {
    B: [[0, 26], [2.5, 26], [1.9, 31], [0.55, 39], [0, 39.8]], I: [[0, 26], [2.4, 26], [1.7, 30], [0.2, 41.5], [0, 41.8]],
    '1C': [[0, 26], [2.4, 26], [1.2, 31.5], [0.5, 33], [0.5, 40], [0, 40]], '2C': [[0, 26], [2.4, 26], [1.4, 31.5], [1, 33], [1, 41], [0, 41]],
    '3C': [[0, 26], [2.4, 26], [1.85, 31.5], [1.5, 33], [1.5, 42], [0, 42]], K: [[0, 26], [2.2, 26], [1.6, 32], [1.2, 40], [0, 40.6]],
    J: [[0, 26], [2.2, 26], [1.9, 30], [0.5, 38], [0, 38.5]],
  }[code];
  if (work) g.add(lathe(work, K.tin));
  else {   // dẹt D: nêm
    const wdt = +code.slice(1) / 10;
    g.add(lathe([[0, 26], [2.4, 26], [2.1, 30], [0, 30]], K.tin));
    g.add(M(new THREE.BoxGeometry(wdt, 9, 0.9), K.tin, { y: 34.5 }));
  }
  g.userData.tip = code;
  return g;
}

export function build(game) {
  const K = { body: std(0x8e9296, 0.9, 0.35), tin: std(0xd4d7d9, 0.9, 0.28), block: std(0x232527, 0.7, 0.4), base: std(0x25272a, 0.3, 0.5), white: std(0xe8e9e6, 0, 0.45) };
  const root = new THREE.Group();
  root.name = 'tip-rack';
  const shell = new THREE.Group();
  shell.add(M(rbox(170, 4, 70, 1.2), K.base, { y: 2, z: 6 }));
  shell.add(M(rbox(150, 26, 46, 2), K.block, { y: 4 + 13 }));
  shell.add(M(new THREE.BoxGeometry(144, 10, 12), K.white, { y: 4 + 5, z: 29, rx: -0.55 }));
  root.add(shell);
  // nhãn mã mũi trên dải trắng phía trước (JS — cả khi có CAD)
  const lab = canvasPlane(140, 9, (g, W, H) => {
    g.fillStyle = '#c3c5bf'; g.fillRect(0, 0, W, H);
    TIP_CODES.slice(5).forEach((c, i) => text(g, c, W * (0.1 + i * 0.2), H * 0.5, { size: H * 0.62, color: '#1b1d21', align: 'center', bold: true }));
    TIP_CODES.slice(0, 5).forEach((c, i) => text(g, c, W * (0.1 + i * 0.2), H * 0.5, { size: H * 0.3, color: '#7a7f86', align: 'center', bold: true }));
  }, { pxPerMm: 6, maxPx: 900, fallback: '#d9dad5', rough: 0.9 });
  const la = CAD_ANCHORS?.['tip-rack']?.anchor_label;
  if (la) { const f = cadFrame(la); lab.position.copy(f.p); lab.quaternion.copy(f.q); lab.translateZ(0.3); } else { lab.position.set(0, 9.5, 31); lab.rotation.x = -0.55; }
  lab.castShadow = false;
  lab.userData.keepWithCad = true;
  root.add(lab);
  mergeObject(shell);
  // lỗ + mũi
  const slots = [], tips = {}, anchors = { 'tip-rack': root };
  TIP_CODES.forEach((code, i) => {
    const p = slotPos(code, i);
    const a = new THREE.Object3D();
    a.name = `tip-rack-slot-${code}`;
    a.position.copy(p);
    a.userData.tipCode = code;
    root.add(a);
    anchors[`tip-rack-slot-${code}`] = a;
    anchors[`tip-rack-${code}`] = a;          // bí danh (minigames/solder-pro.js tìm 'tip-rack-<mã>' trước) — khung game, +Y lên
    const t = procTip(code, K);
    t.position.set(p.x, p.y - DEPTH, p.z);
    t.userData.dynamic = true;
    root.add(t);
    tips[code] = t;
    slots.push({ code, info: TIP_INFO[code], anchor: a, tip: t, occupied: true, restPos: t.position.clone(), restQuat: t.quaternion.clone() });
  });
  const prop = {
    object: root, sockets: [], anchors, slots, tips, size: [170, 70, 70],
    interact: [{
      object: root,
      spec: {
        name: () => `Giá mũi hàn T18 · ${slots.filter((s) => s.occupied).length}/10 mũi (${slots.filter((s) => s.occupied).map((s) => s.code).join(' ')})`,
        highlight: true, prompts: [],
      },
    }],
    takeTip(code) {
      const s = slots.find((x) => x.code === code);
      if (!s?.occupied || !s.tip) return null;
      const t = s.tip;
      s.occupied = false;
      play(game, 'click', { vol: 0.2 });
      emit(game, 'tip-rack:take', { code, tip: t });
      return t;
    },
    returnTip(code, obj) {
      const s = slots.find((x) => x.code === code);
      if (!s) return false;
      const t = obj || s.tip;
      if (!t) return false;
      root.add(t);
      t.position.copy(s.restPos);
      t.quaternion.copy(s.restQuat);
      if (s.restScale) t.scale.copy(s.restScale);
      s.tip = t; s.occupied = true; tips[code] = t;
      play(game, 'snap', { vol: 0.3 });
      emit(game, 'tip-rack:return', { code, tip: t });
      return true;
    },
  };
  root.userData.tipRack = prop;
  prop.cadReady = upgradeProp(game, prop, 'tip-rack', {
    keep: ['tip_*'],
    onLoad(cad) {
      for (const s of slots) {
        const n = cad.getObjectByName(`tip_${s.code}`);
        if (!n) continue;
        n.userData.tip = s.code;
        n.userData.info = s.info;
        root.updateWorldMatrix(true, true);
        root.attach(n);                       // mũi CAD thành con trực tiếp của giá (khung game, mm)
        s.restPos = n.position.clone(); s.restQuat = n.quaternion.clone(); s.restScale = n.scale.clone();
        s.tip = n; tips[s.code] = n;
      }
      emit(game, 'world:tip-rack-ready', { rack: prop });
    },
  });
  return prop;
}

export default { id: 'tip-rack', name: 'Giá mũi hàn 10 lỗ', build };
