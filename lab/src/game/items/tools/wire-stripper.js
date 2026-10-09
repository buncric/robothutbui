// Kìm tuốt dây cơ 165 mm: má dài có 6 khấc tuốt theo cỡ AWG 30–20 (in số trên má), lưỡi cắt dây gần chốt,
// khoá cán ở đuôi. R = chọn cỡ khấc; giữ chuột trái = bóp + kéo tuốt vỏ.
import { THREE, mats, extrudeXZ, rbox, M, G, dyn, decal, makePliers, finishPliers, text, emit, play, tipWorld, targetOf, approach } from './_kit.js';

const GAUGES = [30, 28, 26, 24, 22, 20];
const CORE_MM = { 30: 0.25, 28: 0.32, 26: 0.4, 24: 0.51, 22: 0.64, 20: 0.81 };
const NOTCH_Z = [-31, -26.5, -22, -17.5, -13, -8.5];

function head() {
  // mép trong (x = 0) có các khấc nửa tròn — đi từ mũi về chốt
  const pts = [[0, -36]];
  GAUGES.forEach((gauge, i) => {
    const r = CORE_MM[gauge] / 2 + 0.18, zc = NOTCH_Z[i];
    for (let k = 0; k <= 6; k++) { const t = Math.PI - (k / 6) * Math.PI; pts.push([Math.sin(t) * r, zc + Math.cos(t) * r]); }
  });
  pts.push([0, -5], [0.4, -3.5], [0, -2]);
  return [...pts, [0, 6], [4.5, 8.2], [8.8, 5], [9.6, -2], [8.8, -18], [6.6, -30], [3.4, -35.4], [1.4, -36.4]].reverse();
}
const HANDLE = [[0, 0], [-4.5, 11], [-8, 24], [-11.5, 48], [-13.5, 76], [-13.8, 104], [-12.5, 128]];

function build(game) {
  const K = mats(game);
  const p = makePliers(game, {
    head: head(), handle: HANDLE, gripFrom: 2, T: 7, steelW: 6, gripW: 15.5, gripT: 12.5, maxAngle: 0.28, bossR: 8.4,
    steel: K.satin, gripMat: K.rubberYellow, gripMat2: K.rubber,
    extras(pivot, { a, b, y0, T }) {
      // khoá cán (móc) ở đuôi nửa B
      b.add(M(rbox(2.2, 2, 14, 0.6), K.blackOxide, { x: 12.5, y: y0 + T / 2, z: 126, ry: 0.12 }));
      a.add(M(new THREE.CylinderGeometry(1.2, 1.2, T + 1, 10), K.satin, { x: -12.3, y: y0 + T / 2, z: 120 }));
    },
  });
  const lab = decal(6.5, 30, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    GAUGES.forEach((gauge, i) => text(g, String(gauge), W * 0.5, H * ((NOTCH_Z[i] + 36 - 2) / 30), { size: W * 0.42, color: '#1b1d21', align: 'center', bold: true }));
    text(g, 'AWG', W * 0.5, H * 0.97, { size: W * 0.28, color: '#1b1d21', align: 'center', bold: true });
  }, { x: 4.6, y: p.y0 + 7 + 0.05, z: -21, rx: -Math.PI / 2, px: 16 });
  if (lab) p.a.add(lab);
  const root = finishPliers(p, 'wire-stripper');
  const tipObject = new THREE.Object3D();
  tipObject.position.set(0, p.y0 + 3.5, -22);
  root.add(tipObject);
  root.userData.tipObject = tipObject;
  root.userData.pliers = p;
  return root;
}

const def = {
  id: 'wire-stripper', name: 'Kìm tuốt dây', kind: 'tool', category: 'tool', icon: '🔧',
  massG: 160, size: [42, 13, 165], gauges: GAUGES,
  desc: 'Đặt dây vào khấc ĐÚNG cỡ (số AWG in trên má), bóp kín rồi kéo: lưỡi cắt đứt vỏ nhựa mà không chạm lõi đồng. Khấc nhỏ hơn cỡ dây → đứt sợi đồng.',
  build,
  grip: { pose: 'holdTool:stripper', hand: 'right', offset: [0, -6.5, -78], rot: [0, 0, 0] },
  tool: {
    kind: 'pliers',
    onScroll(ctx, d) { def.cycle(ctx.instance, ctx.game, Math.sign(d) || 1); },
    tip: [0, 0.45 + 3.5, -22],
    onUseStart(ctx) { const s = ctx.instance.state; s.squeeze = true; s.done = false; s.target = targetOf(ctx); },
    onUseHold(ctx) {
      const inst = ctx.instance, s = inst.state;
      if (!s.done && s.closed > 0.9) {
        s.done = true;
        const T = s.target || targetOf(ctx);
        const wireAwg = T.data('awg') ?? null;
        const result = wireAwg == null ? 'ok' : s.gauge > wireAwg ? 'nicked' : s.gauge < wireAwg ? 'not-cut' : 'ok';
        play(ctx.game, 'snap', { pos: tipWorld(inst), vol: 0.5 });
        emit(ctx.game, 'wire:strip', { instance: inst, gauge: s.gauge, wireAwg, result, lengthMm: 5, target: T.object, item: T.item, pos: tipWorld(inst) });
        if (result === 'nicked') ctx.game?.hud?.toast?.(`Khấc AWG ${s.gauge} nhỏ hơn dây AWG ${wireAwg} — đứt mất vài sợi đồng!`);
      }
    },
    onUseEnd(ctx) { ctx.instance.state.squeeze = false; },
    hud(inst) { return `Kìm tuốt · khấc AWG ${inst.state.gauge} (Ø${CORE_MM[inst.state.gauge]} mm)`; },
    keys: [{ key: 'R', label: 'Đổi khấc AWG', do(ctx) { def.cycle(ctx.instance, ctx.game); } }],
  },
  prompts: [{ key: 'R', label: 'Đổi khấc AWG', when: (inst) => !!inst?.heldBy, do(ctx) { const i = ctx.instance || ctx.item; if (i) def.cycle(i, ctx.game); } }],
  cycle(inst, game, dir = 1) {
    const s = inst.state, i = GAUGES.indexOf(s.gauge);
    s.gauge = GAUGES[(i + dir + GAUGES.length) % GAUGES.length];
    game?.hud?.toast?.(`Khấc tuốt: AWG ${s.gauge}`);
  },
  init(inst) { Object.assign(inst.state, { squeeze: false, closed: 0, gauge: 22, done: false }); },
  update(inst, dt) {
    const s = inst.state;
    s.closed = approach(s.closed, s.squeeze ? 1 : 0, dt, s.squeeze ? 0.07 : 0.12);
    inst.object.userData.pliers?.setOpen(1 - s.closed);
  },
};
export default def;
