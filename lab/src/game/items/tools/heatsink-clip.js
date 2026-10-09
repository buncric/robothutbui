// Kẹp tản nhiệt (thermal shunt) — cặp kẹp cá sấu ĐỒNG mỏ phẳng (đồng dẫn nhiệt ~10× thép, docs/07 §6.11 [S][27]).
// Cầm tay phải, nhắm vào CHÂN linh kiện đã cắm trên board (LED, transistor, diode) → chuột trái: kẹp lên chân gần điểm nhắm
// nhất (giữa thân và mối hàn). Nhắm lại chân đang kẹp → tháo. Hai kẹp / bộ. Hiệu quả trong mô hình: nhiệt truyền tới thân
// linh kiện chỉ còn ~30 % (minigames/solder-pro.js, COMPONENTS[*].alpha) [TK]. NASA yêu cầu thermal shunt khi nhiệt có thể
// làm hỏng linh kiện [V][1].
import { THREE, mats, own, rbox, cyl, M, G, dyn, finish, targetOf, tipWorld } from './_kit.js';

export const CLIPS = 2;

/** Một kẹp cá sấu đồng nhỏ (dài 28 mm), gốc ở đáy, mỏ hướng −Z */
export function clipMesh(K, openK = 0) {
  const g = new THREE.Group();
  const cu = K.copper;
  for (const s of [1, -1]) {
    const jaw = new THREE.Group();
    jaw.add(M(rbox(5.2, 0.9, 26, 0.3), cu, { y: 0, z: 0 }));
    for (let i = 0; i < 6; i++) jaw.add(M(new THREE.BoxGeometry(5, 0.5, 0.5), cu, { y: -0.55 * s, z: -12.5 + i * 1.1 }));   // răng
    jaw.add(M(rbox(5.6, 2.4, 8, 0.8), cu, { y: 1.2 * s, z: 8 }));     // cánh bấm
    jaw.position.y = s * (0.7 + openK * 1.2);
    jaw.rotation.x = s * openK * 0.12;
    g.add(jaw);
  }
  g.add(M(cyl(1.2, 1.2, 6.4, 12), K.satin, { y: 0, z: 2, rz: Math.PI / 2 }));    // chốt + lò xo
  return g;
}

function build(game) {
  const K = mats(game);
  const root = new THREE.Group();
  const a = clipMesh(K); a.position.set(-4, 3.2, 0); root.add(a);
  const b = clipMesh(K); b.position.set(4, 3.2, 2); b.rotation.y = 0.12; root.add(b);
  const tipObject = new THREE.Object3D(); tipObject.position.set(-4, 3.2, -13); root.add(tipObject);
  finish(root, 'heatsink-clip');
  root.userData.tipObject = tipObject;
  root.userData.parts = { a, b };
  return root;
}

const def = {
  id: 'heatsink-clip', name: 'Kẹp tản nhiệt (đồng)', kind: 'tool', category: 'tool', icon: '🐊', hidden: true,
  massG: 9, size: [14, 7, 30],
  desc: 'Kẹp cá sấu đồng kẹp lên chân LED/transistor/diode GIỮA thân và mối hàn: hút bớt nhiệt để thân linh kiện không quá nhiệt (docs/07 §6.11).',
  build,
  grip: { pose: 'holdTool:tweezers', hand: 'right', offset: [4, -3.2, -2], rot: [0, 0, 0] },
  tool: {
    kind: 'tweezers',
    tip: [-4, 3.2, -13],
    onUseStart(ctx) { ctx.game?.soldering?.pro?.clipAction?.(ctx.instance, targetOf(ctx), ctx.hit?.point || tipWorld(ctx.instance)); },
    onUseHold() {},
    onUseEnd() {},
    hud(inst) { const n = inst.state.free ?? CLIPS; return `Kẹp tản nhiệt · còn ${n}/${CLIPS} kẹp (nhắm chân linh kiện, LMB)`; },
  },
  init(inst) { if (inst.state.free == null) inst.state.free = CLIPS; },
  update(inst) { const P = inst.object.userData.parts; if (P) { const n = inst.state.free ?? CLIPS; P.a.visible = n >= 1; P.b.visible = n >= 2; } },
};
export default def;
