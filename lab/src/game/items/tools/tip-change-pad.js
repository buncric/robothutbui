// Miếng chịu nhiệt thay mũi (kiểu Hakko B2300, silicone dày) — docs/07 §2.1 [V][7]: "kẹp phần đầu mũi bằng pad chịu nhiệt,
// rút thẳng mũi ra khỏi tay cầm; không giữ phần nóng quá lâu, kể cả có pad" [S][8b].
// Cầm TAY TRÁI cùng lúc với mỏ hàn (tay phải) → chuột phải: rút mũi đang lắp (đặt vào giá mũi / thảm chịu nhiệt);
// nhắm một mũi rời rồi chuột phải: lắp mũi đó vào mỏ hàn. Không có miếng này mà rút mũi NÓNG bằng tay → BỎNG.
import { THREE, mats, own, rbox, M, finish, decal, text, targetOf } from './_kit.js';

function build(game) {
  const K = mats(game);
  const root = new THREE.Group();
  const sil = own(K.rubberBlue); sil.color.set(0x5d7f9e); sil.roughness = 0.85;
  root.add(M(rbox(42, 4, 30, 1.6), sil, { y: 2 }));
  // rãnh kẹp mũi (nửa ống)
  root.add(M(new THREE.CylinderGeometry(3.4, 3.4, 30, 16, 1, true, 0, Math.PI), K.rubber, { y: 4.05, rz: Math.PI / 2, ry: Math.PI / 2 }));
  const lab = decal(30, 8, (g, W, H) => { g.clearRect(0, 0, W, H); text(g, 'HEAT RESISTANT', W / 2, H * 0.35, { size: H * 0.32, color: '#eef3f7', align: 'center', bold: true }); text(g, '≤ 500 °C · thay mũi', W / 2, H * 0.75, { size: H * 0.26, color: '#d9e3ec', align: 'center' }); }, { y: 4.03, z: 9, rx: -Math.PI / 2, px: 16 });
  if (lab) root.add(lab);
  const tipObject = new THREE.Object3D(); tipObject.position.set(0, 4, -15); root.add(tipObject);
  finish(root, 'tip-change-pad');
  root.userData.tipObject = tipObject;
  return root;
}

const def = {
  id: 'tip-change-pad', name: 'Miếng chịu nhiệt thay mũi', kind: 'tool', category: 'tool', icon: '🧤', hidden: true,
  massG: 12, size: [42, 6, 30],
  desc: 'Silicone chịu nhiệt: kẹp mũi hàn NÓNG để rút ra / cắm vào mà không bỏng (Hakko B2300, docs/07 §2.1).',
  build,
  grip: { pose: 'grip', hand: 'left', offset: [0, -2, 0], rot: [0, 0, 0] },
  tool: {
    kind: 'pliers',
    tip: [0, 4, -15],
    onUseStart(ctx) { ctx.game?.soldering?.pro?.padAction?.(ctx.instance, targetOf(ctx)); },
    onUseHold() {},
    onUseEnd() {},
    hud(inst, game) { return 'Miếng chịu nhiệt · RMB: rút / lắp mũi hàn'; },
  },
};
export default def;
