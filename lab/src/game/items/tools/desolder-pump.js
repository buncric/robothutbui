// Ống hút thiếc (desolder pump) thân nhôm anod xanh 195 mm, đầu hút PTFE trắng, cần piston + núm, nút nhả.
// Lần bấm 1: nén piston (lên cò). Lần bấm 2 (khi mũi đặt sát mối hàn đang chảy): nhả → lò xo bật piston, hút thiếc.
import { THREE, mats, own, latheZ, flutedLatheZ, rbox, cyl, M, G, dyn, decal, finish, text, emit, play, tipWorld, targetOf, approach } from './_kit.js';

const AX = 10.5, EXT = 52;   // trục; hành trình piston (mm)

function build(game) {
  const K = mats(game);
  const root = new THREE.Group();
  const Z = (p, m, zBack, seg = 32) => M(latheZ(p, { seg, zBack, axisY: AX }), m);
  // thân nhôm anod (có rãnh khía nhám vùng cầm)
  root.add(Z([[9.5, 0], [9.5, 115]], K.anodBlue, 40));
  root.add(M(flutedLatheZ([[9.62, 0, 0], [9.62, 0.5, 1], [9.62, 34.5, 1], [9.62, 35, 0]], { flutes: 48, depth: 0.025, seg: 144, sharp: 2 }, { zBack: -12, axisY: AX }), K.anodBlue));
  root.add(Z([[0, 0], [9.6, 0], [10.5, 1], [10.5, 6], [9.8, 7], [3.2, 7.2], [0, 7.2]], K.absBlack, 47));           // nắp sau
  root.add(Z([[0, 0], [9.9, 0], [9.9, 6], [7.4, 9], [6.4, 10], [0, 10]], K.absBlack, -75));                         // cổ trước
  root.add(Z([[0, 0], [5.6, 0], [5.4, 4], [3.6, 13], [2.1, 18.5], [1.6, 19.6], [0, 19.6]], K.absWhite, -84, 28));    // đầu PTFE
  root.add(M(cyl(0.95, 0.95, 0.2, 12), K.lcdBezel, { y: AX, z: -84 - 19.62, rx: Math.PI / 2 }));                    // lỗ hút
  for (const z of [-30, -42]) root.add(Z([[9.6, 0], [10.1, 1], [10.1, 4], [9.6, 5]], K.rubber, z));
  // nút nhả (động)
  const btn = new THREE.Group();
  btn.position.set(0, AX + 9.5, 28);
  btn.add(M(rbox(7, 5, 11, 1.6), K.absBlack, { y: 1.8 }));
  for (let i = 0; i < 4; i++) btn.add(M(rbox(7.2, 0.6, 0.8, 0.2), K.absDark, { y: 4.3, z: -3.6 + i * 2.4 }));
  root.add(dyn(btn));
  // piston + núm (động): trượt theo +Z
  const plunger = new THREE.Group();
  plunger.add(M(cyl(2.4, 2.4, 70, 16), K.chrome, { y: AX, z: 47 - 35 + 8, rx: Math.PI / 2 }));
  plunger.add(Z([[0, 0], [5, 0], [7.5, 2], [8, 5], [7.4, 8.5], [4.6, 10.4], [0, 10.6]], K.absBlack, 66));
  root.add(dyn(plunger));
  const lab = decal(40, 7, (g, W, H) => { g.clearRect(0, 0, W, H); text(g, 'DESOLDER · ANTI-STATIC', W / 2, H / 2, { size: H * 0.55, color: '#e8eef6', align: 'center', bold: true }); },
    { y: AX + 9.53, z: 4, rx: -Math.PI / 2, rz: Math.PI / 2, px: 14 });
  if (lab) root.add(lab);
  const tipObject = new THREE.Object3D();
  tipObject.position.set(0, AX, -84 - 19.6);
  root.add(tipObject);
  finish(root, 'desolder-pump');
  root.userData.tipObject = tipObject;
  root.userData.parts = { btn, plunger };
  return root;
}

const def = {
  id: 'desolder-pump', name: 'Ống hút thiếc', kind: 'tool', category: 'tool', icon: '💉',
  massG: 70, size: [21, 21, 200],
  desc: 'Nhấn piston xuống (lên cò), nung chảy mối hàn, áp sát đầu PTFE vào thiếc lỏng rồi bấm nút nhả: piston bật lên hút thiếc. Bấm lại piston để đẩy thiếc thừa ra.',
  build,
  grip: { pose: 'holdTool:screwdriver', hand: 'left', offset: [0, -AX, 10], rot: [0, 0, 0] },
  tool: {
    tip: [0, AX, -84 - 19.6],
    onUseStart(ctx) {
      const inst = ctx.instance, s = inst.state;
      if (!s.cocked) {
        s.cocked = true;
        play(ctx.game, 'click', { pos: tipWorld(inst), vol: 0.5 });
        emit(ctx.game, 'desolder:cock', { instance: inst });
        return;
      }
      s.cocked = false; s.press = 0.25;
      const T = targetOf(ctx);
      play(ctx.game, 'whoosh', { pos: tipWorld(inst), vol: 0.6 });
      emit(ctx.game, 'desolder:suck', { instance: inst, pos: tipWorld(inst), target: T.object, item: T.item });
    },
    onUseHold() {},
    onUseEnd() {},
    hud(inst) { return `Ống hút thiếc · ${inst.state.cocked ? 'đã lên cò (bấm để hút)' : 'chưa lên cò (bấm để nén)'}`; },
  },
  init(inst) { Object.assign(inst.state, { cocked: false, ext: EXT, press: 0 }); },
  update(inst, dt) {
    const s = inst.state, P = inst.object.userData.parts;
    s.ext = approach(s.ext, s.cocked ? 0 : EXT, dt, s.cocked ? 0.12 : 0.025);
    s.press = Math.max(0, s.press - dt);
    if (P) { P.plunger.position.z = s.ext - EXT * 0.0; P.btn.position.y = AX + 9.5 - (s.press > 0 ? 1.2 : 0); }
  },
};
export default def;
