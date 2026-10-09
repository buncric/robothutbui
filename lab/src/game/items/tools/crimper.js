// Kìm bấm cos JST-XH (cóc/ratchet) ~200 mm: đầu kìm dày có 3 khuôn bấm (1.0 / 1.9 / 2.5), răng cóc + cóc hãm,
// lẫy nhả cóc màu vàng, cán thép bọc nhựa 2 màu. Cơ cấu cóc: đã bóp thì không mở ra được cho đến khi bóp hết hành trình
// (hoặc gạt lẫy nhả — R). Bóp đủ → mối bấm đạt, phát 'wire:crimp'.
import { THREE, mats, extrudeXZ, rbox, cyl, M, G, dyn, decal, makePliers, finishPliers, text, emit, play, tipWorld, targetOf, clamp } from './_kit.js';

const DIES = [{ name: '2.5', z: -27, terminal: 'jst-xh' }, { name: '1.9', z: -19.5, terminal: 'jst-xh' }, { name: '1.0', z: -12, terminal: 'jst-ph' }];

function head() {
  const pts = [[0, -34]];
  for (const d of DIES) {      // khuôn bấm hình chữ "B" (2 hõm) cắt vào mép trong
    const w = d.name === '1.0' ? 1.6 : d.name === '1.9' ? 2.1 : 2.6;
    pts.push([0, d.z - w - 0.6], [0.9, d.z - w], [1.6, d.z - w * 0.45], [1.1, d.z], [1.6, d.z + w * 0.45], [0.9, d.z + w], [0, d.z + w + 0.6]);
  }
  pts.push([0, -4], [0, 6]);
  return [...pts, [6, 9.5], [12, 6.5], [15.5, -2], [16.5, -14], [16, -28], [13.5, -33.6], [8, -35.4], [2, -35.2]].reverse();
}
const HANDLE = [[0, 0], [-6, 13], [-11, 34], [-15, 64], [-16.6, 98], [-16.4, 130], [-15, 160]];

function build(game) {
  const K = mats(game);
  const p = makePliers(game, {
    head: head(), handle: HANDLE, gripFrom: 3, T: 10, steelW: 8, gripW: 18, gripT: 15, maxAngle: 0.22, bossR: 11,
    steel: K.blackOxide, gripMat: K.rubberRed, gripMat2: K.rubber,
    extras(pivot, { a, b, y0, T }) {
      // răng cóc (cung răng) trên nửa B, cóc hãm trên nửa A
      const teeth = [];
      for (let i = 0; i <= 14; i++) {
        const ang = -0.5 + (i / 14) * 1.0, r = i % 2 ? 31 : 33.2;
        teeth.push([Math.sin(ang) * r, Math.cos(ang) * r]);
      }
      const sector = [...teeth, [Math.sin(0.5) * 25, Math.cos(0.5) * 25], [Math.sin(-0.5) * 25, Math.cos(-0.5) * 25]];
      b.add(M(extrudeXZ(sector, 3, { bevel: 0.3 }), K.satin, { x: -3, y: y0 + T + 0.2 }));
      a.add(M(rbox(3, 3, 9, 0.6), K.satin, { x: -9, y: y0 + T + 1.7, z: 30, ry: 0.5 }));
      // lẫy nhả cóc
      a.add(M(rbox(4, 2.4, 13, 0.8), K.absYellow, { x: -13, y: y0 + T + 1.2, z: 40, ry: 0.3 }));
      // lò xo kéo giữa 2 cán
      const coil = new THREE.Group();
      for (let i = 0; i < 9; i++) coil.add(M(new THREE.TorusGeometry(2.4, 0.45, 6, 16), K.satin, { x: -7 + i * 1.75, ry: Math.PI / 2 }));
      coil.position.set(0, y0 + T / 2, 46);
      pivot.add(coil);
      // vít điều chỉnh lực bấm
      a.add(M(cyl(3.2, 3.2, 3, 16), K.zinc || K.satin, { x: -6, y: y0 + T + 1.5, z: 18 }));
    },
  });
  const lab = decal(10, 30, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    DIES.forEach((d) => text(g, d.name, W * 0.5, H * ((d.z + 35) / 30), { size: W * 0.34, color: '#e8eaee', align: 'center', bold: true }));
    text(g, 'XH/PH', W * 0.5, H * 0.95, { size: W * 0.22, color: '#f2b705', align: 'center', bold: true });
  }, { x: 8.6, y: p.y0 + 10 + 0.05, z: -20, rx: -Math.PI / 2, px: 16 });
  if (lab) p.a.add(lab);
  const root = finishPliers(p, 'crimper');
  const tipObject = new THREE.Object3D();
  tipObject.position.set(0, p.y0 + 5, -19.5);
  root.add(tipObject);
  root.userData.tipObject = tipObject;
  root.userData.pliers = p;
  return root;
}

const def = {
  id: 'crimper', name: 'Kìm bấm cos JST-XH', kind: 'tool', category: 'tool', icon: '🗜️',
  massG: 290, size: [50, 16, 196], dies: DIES.map((d) => d.name),
  desc: 'Kìm bấm cóc cho đầu cos JST-XH (khuôn 1.9/2.5): đặt cos vào khuôn (tai bấm hướng lên), luồn dây đã tuốt 2–2.5 mm, bóp HẾT hành trình tới khi cóc nhả. Tai trước kẹp lõi đồng, tai sau kẹp vỏ.',
  build,
  grip: { pose: 'holdTool:crimper', hand: 'right', offset: [0, -7.5, -105], rot: [0, 0, 0] },
  tool: {
    kind: 'pliers',
    onScroll(ctx) { def.rKey(ctx.instance, ctx.game); },
    tip: [0, 0.45 + 5, -19.5],
    onUseStart(ctx) {
      const s = ctx.instance.state;
      s.squeeze = true;
      if (s.progress === 0) s.target = targetOf(ctx);
    },
    onUseHold(ctx, dt) {
      const inst = ctx.instance, s = inst.state;
      const before = s.progress;
      s.progress = clamp(s.progress + dt / 1.1, 0, 1);
      if (Math.floor(before * 10) !== Math.floor(s.progress * 10)) play(ctx.game, 'click', { pos: tipWorld(inst), vol: 0.25 });
      if (s.progress >= 1 && before < 1) {
        const T = s.target || targetOf(ctx);
        const die = DIES[s.die];
        const terminal = T.data('terminal') ?? null;
        const quality = terminal && terminal !== die.terminal ? 'wrong-die' : 'good';
        play(ctx.game, 'snap', { pos: tipWorld(inst) });
        emit(ctx.game, 'wire:crimp', { instance: inst, terminal: terminal || die.terminal, die: die.name, quality, target: T.object, item: T.item, pos: tipWorld(inst) });
        s.release = true;      // cóc nhả khi bóp hết hành trình
      }
    },
    onUseEnd(ctx) { ctx.instance.state.squeeze = false; },
    hud(inst) {
      const s = inst.state;
      return `Kìm bấm cos · khuôn ${DIES[s.die].name}${s.progress > 0 && s.progress < 1 ? ` · cóc khoá ${Math.round(s.progress * 100)} %` : ''}`;
    },
    keys: [
      { key: 'R', label: 'Đổi khuôn / gạt lẫy nhả cóc', do(ctx) { def.rKey(ctx.instance, ctx.game); } },
    ],
  },
  prompts: [{ key: 'R', label: 'Đổi khuôn / nhả cóc', when: (inst) => !!inst?.heldBy, do(ctx) { const i = ctx.instance || ctx.item; if (i) def.rKey(i, ctx.game); } }],
  rKey(inst, game) {
    const s = inst.state;
    if (s.progress > 0 && s.progress < 1) {
      emit(game, 'wire:crimp', { instance: inst, terminal: DIES[s.die].terminal, die: DIES[s.die].name, quality: 'aborted' });
      s.release = true;
      game?.hud?.toast?.('Gạt lẫy nhả cóc — mối bấm dở dang, cắt bỏ đầu cos và làm lại');
    } else {
      s.die = (s.die + 1) % DIES.length;
      game?.hud?.toast?.(`Khuôn bấm ${DIES[s.die].name} mm`);
    }
  },
  init(inst) { Object.assign(inst.state, { squeeze: false, progress: 0, die: 0, release: false, target: null }); },
  update(inst, dt) {
    const s = inst.state;
    if (s.release) {
      s.progress = Math.max(0, s.progress - dt / 0.25);
      if (s.progress === 0) { s.release = false; s.target = null; }
    }
    inst.object.userData.pliers?.setOpen(1 - s.progress);
  },
};
export default def;
