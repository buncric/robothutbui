// Thước kẹp điện tử 150 mm (inox): thân thước có vạch chia mm, mỏ đo ngoài (−Z), mỏ đo trong (+Z), con trượt mang
// hộp điện tử (LCD 5 số, nút ON/OFF · ZERO · mm/in, bánh xe ngón cái), cần đo sâu ở đuôi. Nằm phẳng, thân theo +X.
// Giữ chuột trái lên vật → mỏ khép vào kích thước nhỏ nhất của vật, LCD hiện số đo.
import { THREE, mats, own, rbox, cyl, extrudeXZ, flutedLathe, M, G, dyn, decal, finish, lcdPanel, drawSeg7, text, emit, play, targetOf, clamp, approach, hasDoc } from './_kit.js';

const BEAM_L = 236, BEAM_W = 16, BEAM_T = 3.4, X0 = -40;      // thân: x ∈ [X0, X0 + BEAM_L]
const JAW_X = -30;                                            // mặt trong mỏ cố định
const Y0 = 1.6;                                               // đáy thân (đáy con trượt chạm mặt bàn)

function build(game) {
  const K = mats(game);
  const root = new THREE.Group();
  const steel = K.stainless;
  // thân thước
  root.add(M(rbox(BEAM_L, BEAM_T, BEAM_W, 0.6), steel, { x: X0 + BEAM_L / 2, y: Y0 + BEAM_T / 2 }));
  const scale = decal(160, 5, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    const k = W / 160;
    g.strokeStyle = '#1a1c1f'; g.fillStyle = '#1a1c1f';
    for (let mm = 0; mm <= 155; mm++) {
      const x = (mm + 2) * k, len = mm % 10 === 0 ? 0.55 : mm % 5 === 0 ? 0.38 : 0.24;
      g.lineWidth = Math.max(1, 0.12 * k); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H * len); g.stroke();
      if (mm % 10 === 0) text(g, String(mm / 10), x, H * 0.8, { size: H * 0.34, color: '#1a1c1f', align: 'center', bold: true });
    }
  }, { x: JAW_X - 2 + 80, y: Y0 + BEAM_T + 0.02, z: -BEAM_W / 2 + 2.6, rx: -Math.PI / 2, px: 10, maxPx: 2048 });
  if (scale) root.add(scale);
  // mỏ cố định: mỏ ngoài (−Z) + mỏ trong (+Z)
  const outerJaw = [[0, 0], [0, -44], [-2.5, -47], [-6, -42], [-10, -14], [-12, 0]];
  root.add(M(extrudeXZ(outerJaw.map(([x, z]) => [JAW_X + x, -BEAM_W / 2 + z + 1]), BEAM_T, { bevel: 0.4 }), steel, { y: Y0 }));
  const innerJaw = [[0, 0], [0, 17], [-1.4, 19.5], [-4.5, 14], [-8, 0]];
  root.add(M(extrudeXZ(innerJaw.map(([x, z]) => [JAW_X + x, BEAM_W / 2 + z - 1]), BEAM_T * 0.8, { bevel: 0.3 }), steel, { y: Y0 + 0.3 }));
  // con trượt (động)
  const slider = new THREE.Group();
  slider.add(M(extrudeXZ(outerJaw.map(([x, z]) => [-x, -BEAM_W / 2 + z + 1]), BEAM_T, { bevel: 0.4 }), steel, { y: Y0 }));
  slider.add(M(extrudeXZ(innerJaw.map(([x, z]) => [-x, BEAM_W / 2 + z - 1]), BEAM_T * 0.8, { bevel: 0.3 }), steel, { y: Y0 + 0.3 }));
  slider.add(M(rbox(48, BEAM_T + 3, BEAM_W + 7, 1), steel, { x: 24, y: Y0 + BEAM_T / 2 }));
  slider.add(M(rbox(60, 8.5, 33, 3.2, 3), K.absBlack, { x: 32, y: Y0 + BEAM_T + 4.2, z: 2.5 }));
  const lcd = lcdPanel(34, 11, { pxPerMm: 12, bg: '#a9b69b' });
  lcd.mesh.rotation.x = -Math.PI / 2;
  lcd.mesh.position.set(30, Y0 + BEAM_T + 8.5, -1);
  slider.add(lcd.mesh);
  slider.add(M(new THREE.PlaneGeometry(37, 13.5), K.glass, { x: 30, y: Y0 + BEAM_T + 8.7, z: -1, rx: -Math.PI / 2, cast: false }));
  for (const [i, c] of [[0, K.absRed], [1, K.absGrey], [2, K.absGrey]].map(([i, c]) => [i, c])) slider.add(M(rbox(7, 2, 4.5, 1), c, { x: 18 + i * 12, y: Y0 + BEAM_T + 8.8, z: 10.5 }));
  const btnLab = decal(38, 3, (g, W, H) => { g.clearRect(0, 0, W, H); ['ON/OFF', 'ZERO', 'mm/in'].forEach((t, i) => text(g, t, W * (0.12 + i * 0.32), H / 2, { size: H * 0.7, color: '#e8eaee', align: 'center', bold: true })); },
    { x: 30, y: Y0 + BEAM_T + 8.47, z: 14.6, rx: -Math.PI / 2, px: 16 });
  if (btnLab) slider.add(btnLab);
  const wheel = M(flutedLathe([[0, 0, 0], [5, 0, 0], [5.4, 0.4, 1], [5.4, 3, 1], [5, 3.4, 0], [0, 3.4, 0]], { flutes: 28, depth: 0.08, seg: 84 }), K.satin, { x: 19, y: Y0 - 0.4, z: -BEAM_W / 2 - 3.4 });
  slider.add(wheel);
  slider.add(M(cyl(1.6, 1.6, 6, 12), K.satin, { x: 40, y: Y0 + BEAM_T + 3.2, z: -BEAM_W / 2 - 4.5, rx: Math.PI / 2 }));   // vít khoá
  // cần đo sâu: chạy trong rãnh, thò ra ở đuôi
  slider.add(M(rbox(BEAM_L - 40, 1.2, 3.2, 0.3), steel, { x: BEAM_L / 2 + 10, y: Y0 + 0.4 }));
  slider.position.x = JAW_X;
  root.add(dyn(slider));
  // nhãn trên thân
  const brand = decal(40, 4.2, (g, W, H) => { g.clearRect(0, 0, W, H); text(g, 'RVL · 0–150 mm · 0.01 mm', W / 2, H / 2, { size: H * 0.72, color: '#1a1c1f', align: 'center', bold: true }); },
    { x: 150, y: Y0 + BEAM_T + 0.02, z: 3.6, rx: -Math.PI / 2, px: 14 });
  if (brand) root.add(brand);
  const tipObject = new THREE.Object3D();
  tipObject.position.set(JAW_X, Y0 + BEAM_T / 2, -BEAM_W / 2 - 40);
  root.add(tipObject);
  finish(root, 'calipers');
  root.userData.tipObject = tipObject;
  root.userData.parts = { slider, lcd, wheel };
  return root;
}

function drawLcd(g, W, H, s) {
  g.fillStyle = '#a9b69b'; g.fillRect(0, 0, W, H);
  if (!s.on) return;
  const v = s.inch ? s.shown / 25.4 : s.shown;
  const str = s.inch ? v.toFixed(4) : v.toFixed(2);
  const on = '#141a10', off = 'rgba(20,26,16,.06)';
  const pad = ' '.repeat(Math.max(0, 6 - str.replace('.', '').length));
  drawSeg7(g, pad + str, W * 0.04, H * 0.16, H * 0.68, on, off, { glow: false, slant: 0.1 });
  text(g, s.inch ? 'in' : 'mm', W * 0.97, H * 0.7, { size: H * 0.3, color: on, align: 'right', bold: true });
}

const def = {
  id: 'calipers', name: 'Thước kẹp điện tử', kind: 'tool', category: 'tool', icon: '📏',
  massG: 165, size: [240, 22, 75],
  desc: 'Đo đường kính trục động cơ, bước ren vít, độ dày bo mạch, khoảng cách lỗ bắt vít. Khép mỏ → ZERO trước khi đo; áp mỏ vuông góc vật, không bóp mạnh.',
  build,
  grip: { pose: 'holdTool:default', hand: 'right', offset: [-40, -12, 0], rot: [0, 0, 0] },
  tool: {
    onScroll(ctx) { const s = ctx.instance.state; s.inch = !s.inch; },
    tip: [JAW_X, Y0 + BEAM_T / 2, -BEAM_W / 2 - 40],
    onUseStart(ctx) {
      const inst = ctx.instance, s = inst.state;
      s.on = true;
      const T = targetOf(ctx);
      let v = 0;
      const given = T.data('caliper') ?? T.data('diameter');
      if (typeof given === 'number') v = given;
      else if (T.object) {
        const bb = new THREE.Box3().setFromObject(T.item?.object || T.object);
        const sz = bb.getSize(new THREE.Vector3());
        const dims = [sz.x, sz.y, sz.z].filter((d) => d > 0.05 && Number.isFinite(d));
        v = dims.length ? Math.min(...dims) : 0;
      }
      s.target = clamp(v, 0, 150);
      s.measuring = true;
      emit(ctx.game, 'measure', { instance: inst, mode: 'length', value: s.target - s.zero, unit: 'mm', a: T.object, b: null, item: T.item });
    },
    onUseHold() {},
    onUseEnd(ctx) { ctx.instance.state.measuring = false; },
    hud(inst) { const s = inst.state; return `Thước kẹp · ${s.on ? `${(s.shown).toFixed(2)} mm` : 'tắt'}`; },
    keys: [{ key: 'R', label: 'ZERO (về 0)', do(ctx) { const s = ctx.instance.state; s.zero = s.open; s.on = true; play(ctx.game, 'click', { vol: 0.3 }); } }],
  },
  prompts: [{ key: 'R', label: 'Bật / ZERO thước kẹp', do(ctx) { const i = ctx.instance || ctx.item; if (!i) return; const s = i.state; if (!s.on) s.on = true; else s.zero = s.open; } }],
  init(inst) { Object.assign(inst.state, { on: false, open: 0, target: 0, zero: 0, shown: 0, inch: false, measuring: false }); },
  update(inst, dt) {
    const s = inst.state, P = inst.object.userData.parts;
    s.open = approach(s.open, s.target, dt, 0.12);
    s.shown = s.open - s.zero;
    if (!P) return;
    P.slider.position.x = JAW_X + s.open;
    P.wheel.rotation.y = -s.open * 0.35;
    if (hasDoc()) P.lcd.draw(`${s.on}|${s.shown.toFixed(2)}|${s.inch}`, (g, W, H) => drawLcd(g, W, H, s));
  },
};
export default def;
