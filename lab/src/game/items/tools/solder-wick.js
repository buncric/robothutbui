// Dây hút thiếc (bấc đồng tẩm nhựa thông) rộng 2.0 mm × 1.5 m trên lõi nhựa xanh: đặt bấc lên mối hàn/cầu thiếc,
// ấn mỏ hàn lên trên → thiếc lỏng bị hút vào sợi đồng (mao dẫn). Đoạn đã no thiếc (bạc) phải cắt bỏ (R).
import { THREE, mats, own, lathe, cyl, rbox, M, G, dyn, decal, finish, text, emit, play, tipWorld, targetOf, clamp, hasDoc } from './_kit.js';
import { drawTexture } from '../../world/_tex.js';

const R = 22, HUB = 7, THK = 10, BRAID_W = 2.0, FULL = 1500;

let braidTex = null;
function braidTexture() {
  if (braidTex !== null || !hasDoc()) return braidTex;
  braidTex = drawTexture(64, 64, (g, W, H) => {
    g.fillStyle = '#b8692e'; g.fillRect(0, 0, W, H);
    for (let i = -8; i < 16; i++) for (const d of [1, -1]) {
      g.strokeStyle = d > 0 ? 'rgba(255,200,140,.55)' : 'rgba(80,35,10,.45)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(i * 8, d > 0 ? 0 : H); g.lineTo(i * 8 + 64, d > 0 ? H : 0); g.stroke();
    }
  }, { repeat: true });
  return braidTex;
}

function build(game) {
  const K = mats(game);
  const root = new THREE.Group();
  const spool = own(K.absGreen);
  const disc = lathe([[HUB - 1, 0], [R - 0.8, 0], [R, 0.5], [R, 1.1], [R - 0.8, 1.5], [HUB - 1, 1.5]], 48);
  root.add(M(disc, spool), M(disc, spool, { y: THK - 1.5 }));
  root.add(M(cyl(HUB, HUB, THK, 32, true), spool, { y: THK / 2 }));
  const braid = own(K.braid);
  const tex = braidTexture();
  if (tex) { braid.map = tex.clone(); braid.map.repeat.set(30, 1); braid.map.needsUpdate = true; braid.color.set(0xffffff); }
  const wound = dyn(M(cyl(1, 1, THK - 3.2, 48, true), braid, { y: THK / 2 }));
  root.add(wound);
  // khe dẫn + đầu bấc thò ra (động — đổi màu khi no thiếc)
  root.add(M(rbox(8, THK - 1, 5, 1), spool, { x: R - 2, y: THK / 2, z: -2 }));
  const endMat = own(K.braid);
  if (tex) { endMat.map = tex.clone(); endMat.map.repeat.set(1, 4); endMat.map.needsUpdate = true; endMat.color.set(0xffffff); }
  const end = M(rbox(BRAID_W, 0.55, 22, 0.2), endMat, { x: R + 2, y: THK / 2, z: -13, ry: 0.15 });
  end.name = 'braid-end';
  root.add(dyn(end));
  const lab = decal(28, 28, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#f5f7f2'; g.beginPath(); g.arc(W / 2, H / 2, W * 0.49, 0, Math.PI * 2); g.arc(W / 2, H / 2, W * 0.24, 0, Math.PI * 2, true); g.fill('evenodd');
    text(g, 'DESOLDER WICK', W / 2, H * 0.14, { size: H * 0.085, color: '#1b5e3a', align: 'center', bold: true });
    text(g, '2.0 mm × 1.5 m', W / 2, H * 0.87, { size: H * 0.08, color: '#222', align: 'center', bold: true });
    text(g, 'FLUX', W * 0.13, H / 2, { size: H * 0.07, color: '#222', align: 'center' });
    text(g, 'Cu', W * 0.87, H / 2, { size: H * 0.08, color: '#b8692e', align: 'center', bold: true });
  }, { y: THK + 0.03, rx: -Math.PI / 2, px: 16 });
  if (lab) root.add(lab);
  const tipObject = new THREE.Object3D();
  tipObject.position.set(R + 2 + Math.sin(0.15) * -11, THK / 2, -24);
  root.add(tipObject);
  finish(root, 'solder-wick');
  root.userData.tipObject = tipObject;
  root.userData.parts = { wound, end, endMat };
  return root;
}

const COPPER = new THREE.Color(0xffffff), SILVER = new THREE.Color(0x8d9399);

const def = {
  id: 'solder-wick', name: 'Dây hút thiếc', kind: 'tool', category: 'tool', icon: '🧶',
  massG: 12, size: [48, 10, 48],
  desc: 'Bấc đồng bện có nhựa thông: đặt lên cầu thiếc, ấn mỏ hàn sạch lên trên 2–3 s — thiếc chảy vào sợi đồng. Không kéo lê bấc khi thiếc đã đông (bong pad). Cắt bỏ đoạn đã bạc.',
  build,
  grip: { pose: 'holdTool:solder', hand: 'left', offset: [-R, -THK / 2, 0], rot: [0, 0, 0] },
  tool: {
    kind: 'solder',
    onScroll(ctx) { def.trim(ctx.instance, ctx.game); },
    tip: [R + 2 - 1.6, THK / 2, -24],
    onUseStart(ctx) {
      const inst = ctx.instance, s = inst.state;
      if (s.lengthMm <= 0) { ctx.game?.hud?.toast?.('Hết dây hút thiếc'); return; }
      s.target = targetOf(ctx);
      emit(ctx.game, 'desolder:wick-place', { instance: inst, pos: tipWorld(inst), target: s.target.object, item: s.target.item, saturation: s.saturation });
    },
    onUseHold(ctx, dt) {
      const inst = ctx.instance, s = inst.state;
      if (s.lengthMm <= 0) return;
      emit(ctx.game, 'desolder:wick', { instance: inst, dt, pos: tipWorld(inst), target: s.target?.object, item: s.target?.item, capacity: 1 - s.saturation });
    },
    onUseEnd(ctx) { ctx.instance.state.target = null; },
    hud(inst) { const s = inst.state; return `Dây hút thiếc · còn ${(s.lengthMm / 1000).toFixed(2)} m${s.saturation > 0.7 ? ' · đầu đã no thiếc (R: cắt)' : ''}`; },
    keys: [{ key: 'R', label: 'Cắt đoạn đã no thiếc', do(ctx) { def.trim(ctx.instance, ctx.game); } }],
  },
  prompts: [{ key: 'R', label: 'Cắt đoạn đã no thiếc', when: (inst) => !!inst?.heldBy, do(ctx) { const i = ctx.instance || ctx.item; if (i) def.trim(i, ctx.game); } }],
  /** Minigame gọi khi bấc hút được V mm³ thiếc */
  absorb(inst, mm3) { const s = inst.state; s.saturation = clamp(s.saturation + mm3 / 6, 0, 1); return s.saturation; },
  trim(inst, game) {
    const s = inst.state;
    if (s.lengthMm <= 0) return;
    s.lengthMm = Math.max(0, s.lengthMm - 12);
    s.saturation = 0;
    play(game, 'snap', { vol: 0.3 });
    emit(game, 'wick:trim', { instance: inst, lengthMm: s.lengthMm });
  },
  init(inst) { Object.assign(inst.state, { lengthMm: FULL, saturation: 0, target: null }); },
  update(inst) {
    const s = inst.state, P = inst.object.userData.parts;
    if (!P) return;
    const f = clamp(s.lengthMm / FULL, 0, 1);
    const r = Math.sqrt(HUB * HUB + ((R - 1.2) ** 2 - HUB * HUB) * f) || HUB;
    P.wound.scale.set(r, 1, r);
    P.end.visible = s.lengthMm > 0;
    P.endMat.color.copy(COPPER).lerp(SILVER, s.saturation);
    P.endMat.metalness = 1; P.endMat.roughness = 0.45 - s.saturation * 0.25;
  },
};
export default def;
