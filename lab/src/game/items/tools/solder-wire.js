// Cuộn thiếc hàn Sn63/Pb37 Ø 0.8 mm, lõi nhựa thông 2.2 %, 100 g (~23.7 m). Cuộn nằm ngửa (trục Y),
// thấy rõ từng vòng dây quấn; đầu dây thò ra khỏi cuộn (cầm tay trái đưa vào chỗ tiếp xúc pad/chân).
// Lượng dây giảm khi dùng → bán kính lớp quấn nhỏ lại.
import { THREE, mats, own, lathe, cyl, tube, M, G, dyn, decal, finish, text, FONT, emit, tipWorld, targetOf, clamp } from './_kit.js';

const R_FLANGE = 25, R_CORE = 9, R_FULL = 20, WIDTH = 28, FL_T = 1.6;
const DIA = 0.8;
const FULL_MM = 23700;
const FEED_RATE = 6;       // mm/s khi giữ chuột trái

function build(game) {
  const K = mats(game);
  const root = new THREE.Group();
  const spoolMat = K.absRed;
  // hai mặt bích có gân, lõi rỗng
  const flange = lathe([[R_CORE - 1.5, 0], [R_FLANGE - 1, 0], [R_FLANGE, 0.6], [R_FLANGE, FL_T - 0.6], [R_FLANGE - 1, FL_T], [R_CORE - 1.5, FL_T], [R_CORE - 1.5, 0]], 48);
  root.add(M(flange, spoolMat, { y: 0 }), M(flange, spoolMat, { y: WIDTH + FL_T }));
  root.add(M(cyl(R_CORE, R_CORE, WIDTH, 32, true), spoolMat, { y: FL_T + WIDTH / 2 }));
  root.add(M(cyl(R_CORE - 1.5, R_CORE - 1.5, WIDTH + 2 * FL_T, 32, true), K.absDark, { y: FL_T + WIDTH / 2 }));
  for (let k = 0; k < 6; k++) {    // gân tăng cứng trên mặt bích
    const a = (k / 6) * Math.PI * 2;
    for (const y of [-0.4, WIDTH + 2 * FL_T + 0.4]) root.add(M(new THREE.BoxGeometry(R_FLANGE - R_CORE - 3, 0.8, 1.4), spoolMat, { x: Math.cos(a) * (R_CORE + R_FLANGE) / 2, y, z: Math.sin(a) * (R_CORE + R_FLANGE) / 2, ry: -a }));
  }
  // khối dây quấn (co giãn theo lượng còn lại) + lớp vòng xoắn ngoài cùng
  const wound = new THREE.Group();
  wound.position.y = FL_T;
  const solderMat = own(K.tin);
  solderMat.roughness = 0.24;
  wound.add(M(cyl(R_FULL - DIA / 2, R_FULL - DIA / 2, WIDTH - 0.4, 48, true), solderMat, { y: WIDTH / 2 }));
  const turns = WIDTH / DIA - 1;
  class Helix extends THREE.Curve {
    getPoint(t, out = new THREE.Vector3()) { const a = t * turns * Math.PI * 2; return out.set(Math.cos(a) * R_FULL, DIA / 2 + t * (WIDTH - DIA), Math.sin(a) * R_FULL); }
  }
  const hel = new THREE.TubeGeometry(new Helix(), Math.round(turns * 20), DIA / 2, 5, false);
  wound.add(M(hel, solderMat, { name: 'helix' }));
  root.add(dyn(wound));
  // nhãn trên mặt bích trên
  const lab = decal(34, 34, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#f4f1e8'; g.beginPath(); g.arc(W / 2, H / 2, W * 0.49, 0, Math.PI * 2); g.arc(W / 2, H / 2, W * 0.2, 0, Math.PI * 2, true); g.fill('evenodd');
    text(g, 'Sn63 Pb37', W / 2, H * 0.16, { size: H * 0.1, color: '#b3262b', align: 'center', bold: true });
    text(g, 'Ø 0.8 mm · 100 g', W / 2, H * 0.84, { size: H * 0.075, color: '#222', align: 'center' });
    text(g, 'FLUX 2.2%', W * 0.16, H / 2, { size: H * 0.065, color: '#222', align: 'center' });
    text(g, '183 °C', W * 0.84, H / 2, { size: H * 0.065, color: '#222', align: 'center' });
  }, { y: WIDTH + 2 * FL_T + 0.05, rx: -Math.PI / 2, px: 14 });
  if (lab) root.add(lab);
  // đầu dây thò ra: từ mép lớp quấn, vòng ra phía trước (−Z)
  const loosePts = [[R_FULL, FL_T + WIDTH * 0.6, 0], [R_FULL + 3, FL_T + WIDTH * 0.62, -10], [R_FULL + 2, FL_T + WIDTH * 0.55, -30], [R_FULL - 6, FL_T + WIDTH * 0.45, -52], [R_FULL - 14, FL_T + WIDTH * 0.4, -70]];
  const loose = M(tube(loosePts, DIA / 2, { seg: 40, radial: 6 }), solderMat, { name: 'loose-end' });
  root.add(dyn(loose));
  const tipObject = new THREE.Object3D();
  tipObject.position.set(...loosePts[loosePts.length - 1]);
  root.add(tipObject);
  finish(root, 'solder-wire');
  root.userData.tipObject = tipObject;
  root.userData.parts = { wound, solderMat, loose };
  return root;
}

const def = {
  id: 'solder-wire', name: 'Thiếc hàn Ø0.8', kind: 'tool', category: 'tool', icon: '🧵',
  massG: 118, size: [50, 32, 50],
  desc: 'Thiếc Sn63/Pb37 có lõi nhựa thông, chảy ở 183 °C (cùng tinh). Đưa vào CHỖ TIẾP XÚC giữa pad và chân linh kiện — không đưa vào mũi mỏ hàn.',
  diameter: DIA, alloy: 'Sn63Pb37', meltC: 183, fluxCore: true,
  build,
  grip: { pose: 'holdTool:solder', hand: 'left', offset: [0, -(FL_T + WIDTH / 2), 10], rot: [0, 0, 0] },
  tool: {
    kind: 'solder',
    tip: [R_FULL - 14, FL_T + WIDTH * 0.4, -70],
    onUseStart(ctx) { ctx.instance.state.feeding = true; emit(ctx.game, 'solder:start', { instance: ctx.instance, pos: tipWorld(ctx.instance), target: targetOf(ctx).object }); },
    onUseHold(ctx, dt) {
      // minigames/soldering.js đang chạy → nó tự tính thiếc có CHẢY không (pad đủ nóng / chạm mũi hàn) và chỉ trừ
      // đúng lượng dây đã chảy (def.feed). Không có minigame → hành vi cũ (rút dây đều 6 mm/s).
      if (ctx.game?.soldering?.active) return;
      const inst = ctx.instance, T = targetOf(ctx);
      const mm = def.feed(inst, FEED_RATE * dt, ctx.game);
      if (mm <= 0) return;
      // chạm mũi mỏ hàn nóng → tráng thiếc cho mũi
      const iron = T.item?.def?.id === 'soldering-iron' ? T.item : null;
      if (iron) iron.def.tin?.(iron, mm * 0.05, ctx.game);
      emit(ctx.game, 'solder:feed', { instance: inst, mm, volume: mm * Math.PI * (DIA / 2) ** 2, pos: tipWorld(inst), target: T.object, item: T.item });
    },
    onUseEnd(ctx) { ctx.instance.state.feeding = false; emit(ctx.game, 'solder:stop', { instance: ctx.instance }); },
    hud(inst) { return `Thiếc Ø0.8 · còn ${(inst.state.lengthMm / 1000).toFixed(1)} m`; },
  },
  init(inst) { Object.assign(inst.state, { lengthMm: FULL_MM, feeding: false, _shown: -1 }); def._visual(inst); },
  update(inst) { if (Math.abs(inst.state._shown - inst.state.lengthMm) > 50) def._visual(inst); },
  /** Rút ra mm thiếc (trả về lượng thực rút được) */
  feed(inst, mm, game = null) {
    const s = inst.state;
    const take = clamp(mm, 0, s.lengthMm);
    s.lengthMm -= take;
    if (s.lengthMm <= 0 && take > 0) emit(game, 'solder:empty', { instance: inst });
    return take;
  },
  _visual(inst) {
    const P = inst.object.userData.parts;
    if (!P) return;
    const f = clamp(inst.state.lengthMm / FULL_MM, 0, 1);
    const r = Math.sqrt(R_CORE * R_CORE + (R_FULL * R_FULL - R_CORE * R_CORE) * f);
    P.wound.scale.set(r / R_FULL, 1, r / R_FULL);
    P.wound.visible = f > 0.002;
    P.loose.visible = f > 0;
    inst.state._shown = inst.state.lengthMm;
  },
};
export default def;
