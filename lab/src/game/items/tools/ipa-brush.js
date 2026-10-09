// Bàn chải chống tĩnh điện + cồn IPA 99 % (bình bơm nhỏ gắn kèm) — làm sạch cặn nhựa thông sau khi hàn (docs/07 §6.10, §11.10):
// "no-clean có thể để lại, nếu muốn làm sạch dùng IPA và bàn chải; làm khô bằng khí/giấy không xơ" [V][12];
// NASA: làm sạch trong ½ giờ sau khi hàn, KHÔNG dùng siêu âm cho bo có linh kiện [V][1].
// Giữ chuột trái lên mối hàn: chà IPA (cặn RMA tan nhanh, no-clean chậm hơn, flux CHÁY ĐEN rất chậm) → tự lau khô.
import { THREE, mats, own, rbox, cyl, latheZ, M, finish, decal, text, targetOf, tipWorld, clamp } from './_kit.js';

const ML = 60;

function build(game) {
  const K = mats(game);
  const root = new THREE.Group();
  const AX = 5;
  root.add(M(latheZ([[0, 0], [3.2, 0], [3.6, 4], [3.4, 92], [2.6, 98], [0, 98]], { seg: 20, zBack: 60, axisY: AX }), K.absBlack));     // cán
  root.add(M(rbox(9, 4, 16, 1), K.absBlack, { y: AX, z: -44 }));                                                                       // đầu cắm lông
  const bristle = new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: 0.9 });
  for (let i = 0; i < 4; i++) for (let j = 0; j < 7; j++) root.add(M(cyl(0.45, 0.35, 7, 5), bristle, { x: -3 + i * 2, y: AX - 5, z: -50 + j * 2 }));
  // bình bơm IPA nhỏ buộc vào cán
  const bottle = new THREE.MeshPhysicalMaterial({ color: 0xf4f6f8, roughness: 0.2, transparent: true, opacity: 0.55 });
  root.add(M(cyl(6, 6, 30, 20), bottle, { x: 10, y: 6, z: 10, rx: Math.PI / 2 }));
  root.add(M(cyl(2, 2, 6, 12), K.absWhite, { x: 10, y: 6, z: -8, rx: Math.PI / 2 }));
  const lab = decal(24, 9, (g, W, H) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); text(g, 'IPA 99%', W / 2, H * 0.38, { size: H * 0.36, color: '#c8202a', align: 'center', bold: true }); text(g, 'Isopropyl · dễ cháy', W / 2, H * 0.78, { size: H * 0.2, color: '#333', align: 'center' }); }, { x: 10, y: 12.05, z: 10, rx: -Math.PI / 2, rz: Math.PI / 2, px: 14 });
  if (lab) root.add(lab);
  const tipObject = new THREE.Object3D(); tipObject.position.set(0, AX - 8.5, -44); root.add(tipObject);
  finish(root, 'ipa-brush');
  root.userData.tipObject = tipObject;
  return root;
}

const def = {
  id: 'ipa-brush', name: 'Bàn chải + IPA 99 %', kind: 'tool', category: 'tool', icon: '🪥', hidden: true,
  massG: 40, size: [22, 14, 110],
  desc: 'Làm sạch cặn nhựa thông quanh mối hàn bằng cồn IPA + bàn chải ESD, rồi lau khô (docs/07 §6.10). Flux cháy đen rất khó tan.',
  build,
  grip: { pose: 'holdTool:screwdriver', hand: 'right', offset: [0, -5, -10], rot: [0, 0, 0] },
  tool: {
    kind: 'screwdriver',
    tip: [0, -3.5, -44],
    onUseStart(ctx) { ctx.instance.state.scrub = 0; },
    onUseHold(ctx, dt) { ctx.game?.soldering?.pro?.brush?.(ctx.instance, ctx.hit?.point || tipWorld(ctx.instance), dt); },
    onUseEnd(ctx) { ctx.game?.soldering?.pro?.brushEnd?.(ctx.instance); },
    hud(inst) { return `Bàn chải + IPA · còn ${Math.round(inst.state.ml ?? ML)} ml (giữ LMB lên mối hàn)`; },
  },
  init(inst) { if (inst.state.ml == null) inst.state.ml = ML; },
  update(inst) { inst.state.ml = clamp(inst.state.ml ?? ML, 0, ML); },
};
export default def;
