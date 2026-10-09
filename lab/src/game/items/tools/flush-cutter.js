// Kìm cắt chân linh kiện (flush cutter) 125 mm: má nhọn mài phẳng một mặt (cắt sát mặt bo), chốt khớp,
// lò xo lá mở kìm, cán bọc nhựa 2 màu. Giữ chuột trái = bóp kìm; khép hẳn → cắt (chân linh kiện, dây…).
import { THREE, mats, own, extrudeXZ, rbox, tube, M, G, dyn, decal, makePliers, finishPliers, text, emit, play, tipWorld, targetOf, approach } from './_kit.js';

const HEAD = [[0, -23], [1.8, -21.6], [4.6, -14], [7.2, -6], [8.6, 0.5], [7.6, 5.5], [4, 8.6], [0, 7]];
const HANDLE = [[0, 0], [-5, 10], [-9, 21], [-12.6, 40], [-14.6, 62], [-15.2, 84], [-14, 100]];

function build(game) {
  const K = mats(game);
  const p = makePliers(game, {
    head: HEAD, handle: HANDLE, gripFrom: 2, T: 7.5, steelW: 6, gripW: 15, gripT: 12.5, maxAngle: 0.3, bossR: 8.6,
    steel: K.blackOxide, gripMat: K.rubberBlue, gripMat2: K.rubber,
    extras(pivot, { a, b, y0, T }) {
      for (const [h, sgn] of [[a, 1], [b, -1]]) {
        // mép cắt mài sáng
        h.add(M(rbox(0.9, T * 0.55, 20, 0.2), K.chrome, { x: sgn * 0.5, y: y0 + T * 0.5, z: -12 }));
        // lò xo lá: từ cán uốn về giữa
        h.add(M(tube([[sgn * -7.5, y0 + T / 2, 17], [sgn * -4, y0 + T / 2, 21], [sgn * -0.6, y0 + T / 2, 27]], 0.7, { seg: 16, radial: 6 }), K.satin));
      }
    },
  });
  // chữ khắc trên má
  const lab = decal(9, 3, (g, W, H) => { g.clearRect(0, 0, W, H); text(g, 'ESD · 1.0 Cu', W / 2, H / 2, { size: H * 0.6, color: '#c9ced4', align: 'center', bold: true }); },
    { x: 4.6, y: p.y0 + 7.5 + 0.05, z: -8, rx: -Math.PI / 2, rz: Math.PI / 2 - 0.2, px: 18 });
  if (lab) p.a.add(lab);
  const root = finishPliers(p, 'flush-cutter');
  const tipObject = new THREE.Object3D();
  tipObject.position.set(0, p.y0 + 3.75, -23);
  root.add(tipObject);
  root.userData.tipObject = tipObject;
  root.userData.pliers = p;
  return root;
}

const def = {
  id: 'flush-cutter', name: 'Kìm cắt chân', kind: 'tool', category: 'tool', icon: '✂️',
  massG: 68, size: [40, 13, 125],
  desc: 'Kìm cắt sát (flush): cắt chân linh kiện sau khi hàn, mặt phẳng của má áp vào bo để vết cắt bằng. Chỉ cắt đồng ≤ 1 mm — không cắt dây thép/ốc vít (mẻ má).',
  build,
  grip: { pose: 'holdTool:cutter', hand: 'right', offset: [0, -6.5, -62], rot: [0, 0, 0] },
  tool: {
    kind: 'cutter',
    tip: [0, 0.45 + 3.75, -23],
    onUseStart(ctx) { const s = ctx.instance.state; s.squeeze = true; s.cut = false; s.target = targetOf(ctx); },
    onUseHold(ctx) {
      const inst = ctx.instance, s = inst.state;
      if (!s.cut && s.closed > 0.92) {
        s.cut = true;
        const T = s.target || targetOf(ctx);
        const what = T.data('cuttable') ?? (T.item ? 'lead' : null);
        play(ctx.game, 'snap', { pos: tipWorld(inst), vol: what ? 0.9 : 0.3 });
        emit(ctx.game, 'cut', { instance: inst, tool: 'flush-cutter', what, target: T.object, item: T.item, pos: tipWorld(inst) });
        if (what === 'steel' || what === 'screw') emit(ctx.game, 'fault', { kind: 'cutter-chipped', item: inst, target: T.object });
      }
    },
    onUseEnd(ctx) { ctx.instance.state.squeeze = false; },
    hud() { return 'Kìm cắt chân'; },
  },
  init(inst) { Object.assign(inst.state, { squeeze: false, closed: 0, cut: false }); },
  update(inst, dt) {
    const s = inst.state;
    s.closed = approach(s.closed, s.squeeze ? 1 : 0, dt, s.squeeze ? 0.06 : 0.1);
    inst.object.userData.pliers?.setOpen(1 - s.closed);
  },
};
export default def;
