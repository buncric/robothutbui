// Bút nhựa thông (flux pen, loại no-clean 10 ml): thân trong suốt thấy mức dung dịch màu hổ phách,
// đầu dạ, nắp có kẹp. Lần đầu dùng sẽ tự rút nắp và cắm nắp ra đuôi bút. Mức dung dịch giảm khi dùng.
import { THREE, mats, own, latheZ, rbox, cyl, M, G, dyn, decal, finish, text, emit, play, tipWorld, targetOf, clamp, approach } from './_kit.js';

const AX = 7.8, Z_BACK = 67, ML = 10, RATE = 0.03;   // ml/s khi giữ

function build(game) {
  const K = mats(game);
  const root = new THREE.Group();
  const L = (p, m, o = {}) => M(latheZ(p, { seg: 32, zBack: Z_BACK, axisY: AX }), m, o);
  root.add(L([[0, 0], [6.4, 0], [7, 1.2], [7, 7], [0, 7]], K.absWhite));                     // nút đuôi
  root.add(L([[7, 6.5], [7, 100.5]], K.clearPlastic));                                       // ống trong
  const liquidMat = new THREE.MeshPhysicalMaterial({ color: 0xd99a2b, roughness: 0.1, transparent: true, opacity: 0.72, transmission: 0 });
  const liquid = dyn(M(cyl(6.2, 6.2, 1, 24), liquidMat, { y: AX, z: Z_BACK - 8, rx: -Math.PI / 2 }));
  liquid.geometry.translate(0, 0.5, 0);    // gốc ở đáy cột chất lỏng → scale theo mức
  root.add(liquid);
  root.add(L([[7.06, 34], [7.06, 78]], K.absWhite));                                         // nhãn dán (ống)
  root.add(L([[0, 100], [7, 100], [7, 109], [5.2, 112], [0, 112]], K.absWhite));            // cổ trước
  root.add(L([[0, 112], [5, 112], [3.2, 118], [2.4, 122], [0, 122]], K.absGrey));           // giữ đầu dạ
  root.add(L([[0, 121], [2.05, 121], [2, 126], [1.5, 129], [0.9, 130.2], [0, 130.6]], K.felt)); // đầu dạ
  const lab = decal(40, 9, (g, W, H) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e8701a'; g.fillRect(0, 0, W * 0.2, H);
    text(g, 'FLUX', W * 0.1, H / 2, { size: H * 0.42, color: '#fff', align: 'center', bold: true });
    text(g, 'NO-CLEAN · 10 ml', W * 0.6, H * 0.36, { size: H * 0.3, color: '#222', align: 'center', bold: true });
    text(g, 'nhựa thông · không cần rửa', W * 0.6, H * 0.74, { size: H * 0.2, color: '#555', align: 'center' });
  }, { y: AX + 7.1, z: Z_BACK - 56, rx: -Math.PI / 2, rz: Math.PI / 2, px: 14 });
  if (lab) root.add(lab);
  // nắp (động): đậy đầu bút / cắm ra đuôi
  const cap = new THREE.Group();
  cap.add(M(latheZ([[0, 0], [7.4, 0], [7.8, 1.5], [7.8, 38], [7.2, 41], [0, 42]], { seg: 32, zBack: 0, axisY: 0 }), K.absOrange));
  cap.add(M(rbox(3.6, 2.2, 30, 1), K.absOrange, { y: 8.6, z: -16 }));                     // kẹp
  cap.add(M(rbox(3.6, 1.4, 3, 0.6), K.absOrange, { y: 7.4, z: -30 }));
  cap.position.set(0, AX, Z_BACK - 98);
  root.add(dyn(cap));
  const tipObject = new THREE.Object3D();
  tipObject.position.set(0, AX, Z_BACK - 130.6);
  root.add(tipObject);
  finish(root, 'flux-pen');
  root.userData.tipObject = tipObject;
  root.userData.parts = { cap, liquid };
  return root;
}

const def = {
  id: 'flux-pen', name: 'Bút nhựa thông', kind: 'tool', category: 'tool', icon: '🖊️',
  massG: 22, size: [16, 16, 150],
  desc: 'Chấm nhựa thông lên pad/chân trước khi hàn hoặc gỡ cầu thiếc: tẩy lớp oxit, giúp thiếc chảy loang và bóng.',
  build,
  grip: { pose: 'holdTool:pen', hand: 'right', offset: [0, -AX, -(Z_BACK - 92)], rot: [0, 0, 0] },
  tool: {
    onScroll(ctx) { const s = ctx.instance.state; s.capped = !s.capped; },
    tip: [0, AX, Z_BACK - 130.6],
    onUseStart(ctx) {
      const s = ctx.instance.state;
      if (s.capped) { s.capped = false; play(ctx.game, 'click'); emit(ctx.game, 'flux:uncap', { instance: ctx.instance }); }
    },
    onUseHold(ctx, dt) {
      const inst = ctx.instance, s = inst.state;
      if (s.capped || s.ml <= 0) return;
      const amount = Math.min(s.ml, RATE * dt);
      s.ml -= amount;
      const T = targetOf(ctx);
      emit(ctx.game, 'flux:applied', { instance: inst, amount, pos: tipWorld(inst), target: T.object, item: T.item });
    },
    onUseEnd() {},
    hud(inst) { return `Bút nhựa thông · ${Math.round((inst.state.ml / ML) * 100)} %${inst.state.capped ? ' (đang đậy nắp)' : ''}`; },
    keys: [{ key: 'R', label: 'Đậy / mở nắp', do(ctx) { const s = ctx.instance.state; s.capped = !s.capped; play(ctx.game, 'click'); } }],
  },
  init(inst) { Object.assign(inst.state, { ml: ML, capped: true, capK: 1 }); },
  update(inst, dt) {
    const s = inst.state, P = inst.object.userData.parts;
    if (!P) return;
    s.capK = approach(s.capK, s.capped ? 1 : 0, dt, 0.08);
    // nắp: đậy (z = đầu bút) ↔ cắm đuôi (lật 180°, z = đuôi)
    if (s.capK > 0.5) { P.cap.position.z = Z_BACK - 98 - (1 - s.capK) * 40; P.cap.rotation.y = 0; }
    else { P.cap.position.z = Z_BACK + 30 - s.capK * 40; P.cap.rotation.y = Math.PI; }
    P.liquid.scale.set(1, clamp((s.ml / ML) * 86, 0.01, 86), 1);
  },
};
export default def;
