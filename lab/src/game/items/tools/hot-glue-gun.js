// Súng bắn keo nến mini 20 W (thanh keo Ø 7 mm): thân 2 mảnh nhựa xanh, cò bóp, đầu đồng có ống silicon,
// chân đỡ dây thép, thanh keo trong mờ cắm phía sau, đèn báo (đỏ: đang nóng, xanh: sẵn sàng).
// R = cắm/rút điện. Nóng tới 175 °C (τ ≈ 50 s); trên 140 °C giữ chuột trái để bóp keo.
import { THREE, mats, own, extrudeYZ, latheZ, cyl, rbox, tube, M, G, dyn, decal, finish, text, ledMat, emit, play, toast, tipWorld, targetOf, clamp, AMBIENT_C, labState } from './_kit.js';

const BODY = [[-58, 62], [-58, 90], [-52, 97], [40, 97], [50, 93], [54, 78], [58, 52], [68, 14], [70, 4], [64, 0], [44, 0], [38, 4], [32, 30], [24, 56], [14, 62], [-20, 62], [-40, 64]];
const AXY = 79;               // độ cao trục nòng
const T_SET = 175, TAU = 50, READY = 140;

function build(game) {
  const K = mats(game);
  const root = new THREE.Group();
  const shell = new THREE.MeshPhysicalMaterial({ color: 0x2b6cc4, roughness: 0.38, clearcoat: 0.4, clearcoatRoughness: 0.4 });
  // 2 nửa vỏ + đường ráp giữa
  root.add(M(extrudeYZ(BODY, 15.4, { bevel: 4.5, curveSegments: 6 }), shell, { x: -7.9 }));
  root.add(M(extrudeYZ(BODY, 15.4, { bevel: 4.5, curveSegments: 6 }), shell, { x: 7.9 }));
  root.add(M(extrudeYZ(BODY.map(([z, y]) => [z, y]), 1.2, { bevel: 0 }), K.absDark, { x: 0, s: 0.985 }));
  // vùng cầm cao su
  root.add(M(extrudeYZ([[36, 8], [44, 4], [62, 4], [66, 14], [57, 50], [48, 56], [34, 50]], 33.5, { bevel: 2 }), K.rubber));
  // cò bóp (động — xoay quanh chốt trên)
  const trig = new THREE.Group();
  trig.position.set(0, 58, 6);
  trig.add(M(extrudeYZ([[-2, 0], [10, 0], [9, -12], [5, -26], [-2, -30], [-6, -24], [-3, -10]], 11, { bevel: 1.6 }), K.absDark));
  root.add(dyn(trig));
  // đầu phun: cổ nhôm + đầu đồng + ống silicon cam
  root.add(M(latheZ([[0, 0], [7, 0], [7, 6], [5.5, 8], [0, 8]], { seg: 24, zBack: -56, axisY: AXY }), K.aluminum));
  root.add(M(latheZ([[0, 0], [4.8, 0], [4.8, 7], [3.6, 12], [1.6, 19], [1.0, 22], [0, 22.2]], { seg: 24, zBack: -63, axisY: AXY }), K.brass));
  root.add(M(latheZ([[5.4, 0], [5.6, 1], [5.6, 7], [5.2, 8], [4.8, 8]], { seg: 24, zBack: -62, axisY: AXY }), K.rubberOrange));
  // chân đỡ (dây thép uốn chữ U)
  root.add(M(tube([[-9, 63, -34], [-11, 30, -40], [-12, 3, -42], [0, 1.5, -46], [12, 3, -42], [11, 30, -40], [9, 63, -34]], 1.4, { seg: 48, radial: 8 }), K.satin));
  // thanh keo trong mờ (động: ngắn dần)
  const stick = new THREE.Group();
  stick.position.set(0, AXY, 52);
  const st = M(cyl(3.55, 3.55, 1, 20), K.glueStick, { rx: Math.PI / 2 });
  st.geometry.translate(0, -0.5, 0);    // gốc ở đầu cắm vào thân → scale dọc theo +Z
  stick.add(st);
  root.add(dyn(stick));
  root.add(M(latheZ([[0, 0], [5.2, 0], [5.2, 4], [4, 5], [0, 5]], { seg: 24, zBack: 55, axisY: AXY }), K.absDark));   // vòng dẫn keo
  // dây nguồn
  root.add(M(tube([[54, 3, 0], [64, 2, 0], [90, 2, 6], [130, 2, 20], [170, 2, 10]], 2.4, { seg: 40, radial: 8 }), K.rubber));
  // đèn báo
  const led = ledMat(0xff2a1a);
  root.add(dyn(M(new THREE.SphereGeometry(1.8, 12, 8), led, { x: 8, y: 92, z: -30 })));
  const lab = decal(46, 11, (g, W, H) => { g.clearRect(0, 0, W, H); text(g, 'RVL GLUE 20W', W * 0.5, H * 0.38, { size: H * 0.4, color: '#ffffff', align: 'center', bold: true }); text(g, 'Ø7 mm · 175 °C · NÓNG!', W * 0.5, H * 0.8, { size: H * 0.24, color: '#ffd75a', align: 'center', bold: true }); },
    { x: 15.85 + 0.05, y: 80, z: -5, ry: Math.PI / 2, px: 12 });
  if (lab) root.add(lab);
  const tipObject = new THREE.Object3D();
  tipObject.position.set(0, AXY, -63 - 22.2);
  root.add(tipObject);
  finish(root, 'hot-glue-gun');
  root.userData.tipObject = tipObject;
  root.userData.parts = { trig, stick, led };
  return root;
}

const def = {
  id: 'hot-glue-gun', name: 'Súng bắn keo', kind: 'tool', category: 'tool', icon: '🔫',
  massG: 150, size: [32, 97, 150],
  desc: 'Cố định dây, cảm biến, tụ lớn chống rung trên khung robot. Cắm điện chờ ~1 phút cho nóng; đầu đồng 175 °C — đặt lên chân đỡ, không đặt nằm.',
  build,
  grip: { pose: 'holdTool:default', hand: 'right', offset: [0, -30, -52], rot: [0, 0, 0] },
  tool: {
    onScroll(ctx) { def.toggle(ctx.instance, ctx.game); },
    tip: [0, AXY, -63 - 22.2],
    onUseStart(ctx) {
      const s = ctx.instance.state;
      s.squeeze = true;
      if (!s.on) toast(ctx.game, 'Súng keo chưa cắm điện (R)');
      else if (s.temp < READY) toast(ctx.game, `Súng keo chưa đủ nóng (${Math.round(s.temp)} °C) — chờ đèn xanh`);
    },
    onUseHold(ctx, dt) {
      const inst = ctx.instance, s = inst.state;
      if (!s.on || s.temp < READY || s.stickMm <= 0) return;
      const mm = Math.min(s.stickMm, 3 * dt);
      s.stickMm -= mm;
      s.temp -= mm * 1.2;
      const T = targetOf(ctx);
      emit(ctx.game, 'glue:dispense', { instance: inst, mm, volume: mm * Math.PI * 3.5 * 3.5, pos: tipWorld(inst), target: T.object, item: T.item, temp: s.temp });
    },
    onUseEnd(ctx) { ctx.instance.state.squeeze = false; },
    hud(inst) { const s = inst.state; return `Súng keo · ${s.on ? `${Math.round(s.temp)} °C${s.temp >= READY ? ' sẵn sàng' : ' đang nóng…'}` : 'chưa cắm điện'} · keo ${Math.round(s.stickMm)} mm`; },
    keys: [{ key: 'R', label: 'Cắm / rút điện', do(ctx) { def.toggle(ctx.instance, ctx.game); } }],
  },
  prompts: [{ key: 'R', label: 'Cắm / rút điện súng keo', do(ctx) { const i = ctx.instance || ctx.item; if (i) def.toggle(i, ctx.game); } }],
  toggle(inst, game) {
    const s = inst.state;
    s.on = !s.on;
    play(game, 'click');
    emit(game, s.on ? 'power:on' : 'power:off', { source: 'hot-glue-gun', instance: inst });
  },
  init(inst, game) { Object.assign(inst.state, { on: false, temp: labState(game).ambient ?? AMBIENT_C, stickMm: 95, squeeze: false, trig: 0 }); },
  update(inst, dt, game) {
    const s = inst.state, P = inst.object.userData.parts;
    const Ta = labState(game).ambient ?? AMBIENT_C;
    const target = s.on ? T_SET : Ta;
    s.temp = target + (s.temp - target) * Math.exp(-dt / (s.on ? TAU : 120));
    s.trig += ((s.squeeze ? 1 : 0) - s.trig) * Math.min(1, dt * 14);
    if (!P) return;
    P.trig.rotation.x = -s.trig * 0.28;
    P.stick.scale.set(1, 1, clamp(s.stickMm, 0.01, 200));
    P.led.emissive.setHex(s.temp >= READY ? 0x2aff4a : 0xff2a1a);
    P.led.emissiveIntensity = s.on ? 2.2 : 0;
  },
};
export default def;
