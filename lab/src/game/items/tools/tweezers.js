// Nhíp chống tĩnh điện mũi nhọn (inox, dài 120 mm, vùng cầm phủ epoxy tán điện xanh đen).
// Hai càng là dải thép mỏng hàn ở đuôi; giữ chuột trái = kẹp (hai mũi khép lại).
import { THREE, mats, own, extrudeXZ, rbox, M, G, dyn, decal, finish, text, emit, play, tipWorld, targetOf, approach } from './_kit.js';

const L = 120, T = 0.9, OPEN = 0.068;    // rad (≈ 8 mm ở mũi)
const CLOSE = -Math.atan(1.6 / L);       // khép kín: bù miếng đệm 1.6 mm ở đuôi

function legShape() {
  return [[-4.6, 60], [4.6, 60], [4.6, 8], [3.9, -8], [2.2, -30], [0.9, -52], [0.35, -59.4], [0, -60], [-0.35, -59.4], [-0.9, -52], [-2.2, -30], [-3.9, -8], [-4.6, 8]];
}

function build(game) {
  const K = mats(game);
  const root = new THREE.Group();
  const steel = own(K.stainless);
  steel.roughness = 0.22;
  const coat = new THREE.MeshStandardMaterial({ color: 0x23324a, roughness: 0.6, metalness: 0.1 });
  const leg = () => {
    const g = new THREE.Group();
    g.add(M(extrudeXZ(legShape(), T, { bevel: 0.25, curveSegments: 4 }), steel));
    // lớp phủ epoxy (2 mặt) vùng cầm
    const pad = [[-4.75, 42], [4.75, 42], [4.75, 8], [4.1, -6], [-4.1, -6], [-4.75, 8]];
    g.add(M(extrudeXZ(pad, T + 0.5, { bevel: 0.2, curveSegments: 2 }), coat, { y: -0.25 }));
    // gân chống trượt
    for (let k = 0; k < 7; k++) g.add(M(rbox(7.6, 0.3, 0.8, 0.12), coat, { y: T + 0.3, z: 34 - k * 5 }));
    return g;
  };
  const lower = leg();
  lower.rotation.z = Math.PI;              // lật: mặt phủ có gân hướng xuống (mặt ngoài)
  lower.position.y = T + 0.5;
  root.add(lower);
  // càng trên: xoay quanh mối hàn ở đuôi (z = +60), cách càng dưới 1.6 mm (miếng đệm)
  const hinge = new THREE.Group();
  hinge.position.set(0, T + 0.5 + 1.6, 60);
  const upper = leg();
  upper.position.set(0, 0, -60);
  hinge.add(upper);
  root.add(dyn(hinge));
  // khối hàn đuôi + chốt dẫn hướng
  root.add(M(rbox(9.4, 3.6, 7, 0.8), steel, { y: 2.3, z: 56.5 }));
  root.add(M(new THREE.CylinderGeometry(0.6, 0.6, 1.6, 8), steel, { y: T + 0.5 + 0.8, z: 10 }));
  const lab = decal(15, 2.6, (g, W, H) => { g.clearRect(0, 0, W, H); text(g, 'ESD-SAFE · 15', W / 2, H / 2, { size: H * 0.72, color: '#d9dde2', align: 'center', bold: true }); }, { y: T + 0.03, z: -20, rx: -Math.PI / 2, rz: Math.PI / 2, px: 16 });
  if (lab) upper.add(lab);
  const tipObject = new THREE.Object3D();
  tipObject.position.set(0, 1.2, -60);
  root.add(tipObject);
  finish(root, 'tweezers');
  root.userData.tipObject = tipObject;
  root.userData.parts = { hinge };
  return root;
}

const def = {
  id: 'tweezers', name: 'Nhíp ESD', kind: 'tool', category: 'tool', icon: '🥢',
  massG: 14, size: [10, 10, 120],
  desc: 'Nhíp inox chống tĩnh điện: gắp linh kiện nhỏ, giữ chân khi hàn, nắn chân IC. Kẹp nhẹ — kẹp mạnh làm linh kiện bắn ra.',
  build,
  grip: { pose: 'holdTool:tweezers', hand: 'right', offset: [2, 0, -15], rot: [0, 0, Math.PI / 2] },
  tool: {
    kind: 'tweezers',
    tip: [0, 1.2, -60],
    onUseStart(ctx) {
      const inst = ctx.instance, Tg = targetOf(ctx);
      inst.state.closing = true;
      inst.state.holding = Tg.item || null;
      play(ctx.game, 'click', { vol: 0.2 });
      emit(ctx.game, 'tweezers:pinch', { instance: inst, target: Tg.object, item: Tg.item, pos: tipWorld(inst) });
    },
    onUseHold(ctx) { /* giữ kẹp — vật đang kẹp do engine/hands gắn vào tipObject */ },
    onUseEnd(ctx) {
      const inst = ctx.instance;
      inst.state.closing = false;
      emit(ctx.game, 'tweezers:release', { instance: inst, item: inst.state.holding, pos: tipWorld(inst) });
      inst.state.holding = null;
    },
    hud(inst) { return inst.state.holding ? `Nhíp · đang kẹp ${inst.state.holding.def?.name || 'linh kiện'}` : 'Nhíp ESD'; },
  },
  init(inst) { Object.assign(inst.state, { closing: false, closed: 0, holding: null }); },
  update(inst, dt) {
    const s = inst.state, P = inst.object.userData.parts;
    s.closed = approach(s.closed, s.closing ? 1 : 0, dt, 0.05);
    if (P) P.hinge.rotation.x = CLOSE + OPEN * (1 - s.closed);
  },
};
export default def;
