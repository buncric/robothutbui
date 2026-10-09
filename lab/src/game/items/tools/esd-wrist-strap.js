// Vòng tay chống tĩnh điện (dây xoắn + điện trở 1 MΩ trong dây, kẹp vào điểm nối đất của thảm ESD) — docs/07 §9, §10.4:
// "đeo vòng tay nối đất qua 1 MΩ, thảm ESD, trạm hàn nối đất" [S][35][V][6]; hệ người–đất < 35 MΩ (ANSI/ESD S20.20) [S][35].
// Lấy (E) rồi chuột trái: đeo + kẹp vào điểm nối đất / tháo ra. Trạng thái công bố ở game.lab.esd = { worn } + sự kiện 'esd:strap'.
import { THREE, mats, own, rbox, cyl, tube, M, finish, emit, play } from './_kit.js';

function build(game) {
  const K = mats(game);
  const root = new THREE.Group();
  const band = own(K.rubberBlue); band.color.set(0x23395d);
  root.add(M(new THREE.TorusGeometry(30, 4, 10, 40), band, { y: 4, rx: Math.PI / 2 }));
  root.add(M(rbox(16, 7, 12, 2), K.satin, { x: 30, y: 4 }));                                    // khoá kim loại tiếp xúc da
  const coil = [];
  for (let i = 0; i <= 120; i++) { const t = i / 120, a = t * Math.PI * 22; coil.push([36 + t * 70 + Math.cos(a) * 3, 4 + Math.sin(a) * 3, t * 30]); }
  root.add(M(tube(coil, 0.9, { seg: 480, radial: 6 }), K.absYellow ? own(K.absYellow) : K.pvcRed));
  root.add(M(rbox(8, 6, 20, 2), K.absBlack, { x: 108, y: 4, z: 34 }));                        // điện trở 1 MΩ đúc trong vỏ
  root.add(M(cyl(3, 3, 10, 12), K.chrome, { x: 108, y: 4, z: 48, rx: Math.PI / 2 }));         // khuy bấm 10 mm
  finish(root, 'esd-wrist-strap');
  return root;
}

const def = {
  id: 'esd-wrist-strap', name: 'Vòng tay ESD (1 MΩ)', kind: 'tool', category: 'tool', icon: '⏚', hidden: true,
  massG: 30, size: [120, 9, 70],
  desc: 'Vòng tay chống tĩnh điện nối đất qua 1 MΩ — đeo TRƯỚC khi cầm linh kiện (docs/07 §10.4).',
  build,
  grip: { pose: 'grip', hand: 'right', offset: [0, -4, 0], rot: [0, 0, 0] },
  tool: {
    tip: [108, 4, 48],
    onUseStart(ctx) {
      const s = ctx.instance.state, game = ctx.game;
      s.worn = !s.worn;
      const lab = game?.lab; if (lab) lab.esd = { ...(lab.esd || {}), worn: s.worn };
      play(game, 'click', { vol: 0.5 });
      game?.hud?.toast?.(s.worn ? 'Đã đeo vòng ESD + kẹp vào điểm nối đất của thảm (1 MΩ) ✓' : 'Đã tháo vòng ESD', { kind: s.worn ? 'success' : 'info', short: true });
      emit(game, 'esd:strap', { on: s.worn, instance: ctx.instance });
    },
    onUseHold() {},
    onUseEnd() {},
    hud(inst) { return `Vòng ESD · ${inst.state.worn ? 'ĐANG ĐEO ✓' : 'chưa đeo (LMB để đeo)'}`; },
  },
  init(inst, game) { if (inst.state.worn == null) inst.state.worn = false; if (inst.state.worn && game?.lab) game.lab.esd = { worn: true }; },
};
export default def;
