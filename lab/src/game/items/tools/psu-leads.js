// Cặp dây nguồn bàn: phích chuối 4 mm (xếp chồng được) ↔ kẹp cá sấu bọc nhựa, đỏ (+) và đen (−), dài 50 cm,
// cuộn gọn trên bàn. def.plug = 'banana' → cắm vào lỗ chuối của nguồn bàn (socket kind 'banana').
// Bấm chuột trái lên điểm/chân → kẹp que đỏ (lần 1) rồi que đen (lần 2) → phát 'wire:connected'.
import { THREE, mats, own, rbox, cyl, lathe, latheZ, extrudeYZ, tube, M, G, dyn, finish, emit, play, toast, tipWorld, targetOf } from './_kit.js';

function bananaPlug(K, mat) {
  const g = new THREE.Group();
  g.add(M(latheZ([[0, 0], [3.4, 0], [3.8, 2], [3.8, 30], [4.6, 31], [4.6, 34], [2.6, 34], [0, 34]], { seg: 24, zBack: 0, axisY: 0 }), mat));
  g.add(M(latheZ([[0, 33.9], [1.9, 33.9], [2.15, 38], [1.8, 44], [2.15, 50], [1.6, 52], [0, 52.3]], { seg: 16, zBack: 0, axisY: 0 }), K.brass));   // chốt lò xo 4 mm
  g.add(M(cyl(2.1, 2.1, 0.4, 16), K.brass, { z: 0.15, rx: Math.PI / 2 }));        // lỗ xếp chồng phía sau
  return g;
}

function crocClip(K, mat) {
  const g = new THREE.Group();
  // ống bọc nhựa mềm
  g.add(M(latheZ([[2.6, 0], [4.5, 6], [6.2, 22], [6.6, 34], [5.6, 38]], { seg: 24, zBack: 0, axisY: 0 }), mat));
  // 2 hàm thép có răng
  for (const s of [1, -1]) {
    const jaw = M(extrudeYZ([[-34, 0], [-62, 0.6 * s], [-64, 2.2 * s], [-50, 3.2 * s], [-36, 3.6 * s]].map(([z, y]) => [z, y * 1]), 5.2, { bevel: 0.3 }), K.satin);
    g.add(jaw);
    for (let i = 0; i < 6; i++) g.add(M(rbox(5.2, 0.8, 0.9, 0), K.satin, { y: 0.55 * s, z: -40 - i * 3.6 }));
  }
  return g;
}

function build(game) {
  const K = mats(game);
  const root = new THREE.Group();
  const lay = (obj, x, z, ry, y = 4.6) => { obj.position.set(x, y, z); obj.rotation.y = ry; root.add(obj); return obj; };
  lay(bananaPlug(K, K.absRed), -10, 60, Math.PI);
  lay(bananaPlug(K, K.absBlack), 10, 62, Math.PI);
  const clipR = lay(crocClip(K, own(K.rubberRed)), -14, -10, 0, 6.6);
  lay(crocClip(K, K.rubber), 14, -6, 0.12, 6.6);
  // dây cuộn gọn (vòng số 8 dẹt)
  const loop = (side, color) => {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, a = t * Math.PI * 2 * 1.5;
      pts.push([side * 10 + Math.sin(a) * 34 * (0.6 + t * 0.4) + side * 18 * t, 1.6 + (i % 2) * 0.2 + t * 1.5, 60 - t * 32 + Math.cos(a) * 26 - 26]);
    }
    pts[0] = [side * 10, 4.6, 60 + 4];
    pts.push([side * 14, 6, 34], [side * 14, 6.6, 26]);
    return M(tube(pts, 1.6, { seg: 160, radial: 7 }), color);
  };
  root.add(loop(-1, K.pvcRed), loop(1, K.pvcBlack));
  const tipObject = new THREE.Object3D();
  tipObject.position.set(-14, 6.6, -10 - 64);
  root.add(tipObject);
  finish(root, 'psu-leads');
  root.userData.tipObject = tipObject;
  root.userData.clipRed = clipR;
  return root;
}

const def = {
  id: 'psu-leads', name: 'Dây nguồn bàn (chuối–cá sấu)', kind: 'tool', category: 'tool', icon: '🔌',
  massG: 70, size: [110, 14, 150], plug: 'banana',
  desc: 'Cắm phích chuối vào cọc + (đỏ) và − (đen) của nguồn bàn; kẹp cá sấu vào domino/đầu nguồn của mạch. Đặt giới hạn dòng TRƯỚC khi bật OUTPUT.',
  build,
  grip: { pose: 'holdTool:probe', hand: 'right', offset: [14, -6.6, 40], rot: [0, 0, 0] },
  tool: {
    kind: 'probe',
    tip: [-14, 6.6, -74],
    onUseStart(ctx) {
      const inst = ctx.instance, s = inst.state, T = targetOf(ctx);
      if (!T.object) return;
      const which = s.red ? 'black' : 'red';
      s[which] = { object: T.object, item: T.item };
      play(ctx.game, 'snap', { pos: tipWorld(inst), vol: 0.5 });
      emit(ctx.game, 'wire:connected', { a: `psu-lead:${which}`, b: T.item || T.object, instance: inst, polarity: which === 'red' ? '+' : '-', pos: tipWorld(inst) });
      toast(ctx.game, which === 'red' ? 'Đã kẹp que ĐỎ (+). Bấm lần nữa để kẹp que ĐEN (−).' : 'Đã kẹp que ĐEN (−).');
    },
    onUseHold() {},
    onUseEnd() {},
    hud(inst) { const s = inst.state; return `Dây nguồn bàn · đỏ ${s.red ? '✓' : '—'} · đen ${s.black ? '✓' : '—'}`; },
    keys: [{ key: 'R', label: 'Tháo kẹp', do(ctx) { const s = ctx.instance.state; if (s.red || s.black) emit(ctx.game, 'wire:disconnected', { instance: ctx.instance }); s.red = null; s.black = null; } }],
  },
  init(inst) { Object.assign(inst.state, { red: null, black: null }); },
};
export default def;
