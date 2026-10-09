// Thư viện dựng tua vít Phillips (dùng chung cho screwdriver-ph0/ph1). Không có export default.
// Cán 2 thành phần (nhựa cứng có rãnh + cao su mềm), nắp đuôi xoay được có in cỡ mũi, cổ mạ chrome,
// thân thép Cr-V, mũi Phillips nhuộm đen (từ tính). Trục theo Z, mũi ở −Z; nhóm "spin" quay quanh trục khi vặn.
import {
  THREE, mats, own, lathe, latheZ, flutedLatheZ, cyl, M, G, dyn, decal, finish, text, FONT,
  emit, play, tipWorld, targetOf, clamp,
} from './_kit.js';

/** Toạ độ mũi / điểm cầm (không cần dựng hình) */
export function screwdriverDims({ L, R, shaftR, shaftL }) {
  const zBack = L * 0.5, tipLen = Math.max(5, shaftR * 2.6);
  return { tip: [0, R + 0.35, zBack - L - shaftL + 1 - tipLen], grip: [0, R + 0.35, zBack - L * 0.45] };
}

export function buildScrewdriver(game, { size = 'PH1', L = 100, R = 15, shaftR = 2.5, shaftL = 80, color = 0xc62f2a }) {
  const K = mats(game);
  const hard = new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.3 });
  const root = new THREE.Group();
  const spin = new THREE.Group();
  spin.position.y = R + 0.35;
  const zBack = L * 0.5;
  // nắp đuôi (vòm)
  spin.add(M(latheZ([[0, 0], [R * 0.55, 0.4], [R * 0.82, 1.6], [R * 0.9, 4]], { seg: 40, zBack, axisY: 0 }), K.absBlack));
  // thân cán nhựa cứng có 6 rãnh
  const body = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, s = 3.5 + t * (L * 0.78 - 3.5);
    const r = R * (0.9 + 0.1 * Math.sin(Math.PI * Math.min(1, t * 1.25))) * (t > 0.85 ? 1 - (t - 0.85) * 1.6 : 1);
    body.push([r, s, 1]);
  }
  spin.add(M(flutedLatheZ(body, { flutes: 6, depth: 0.13, seg: 96, sharp: 2 }, { zBack, axisY: 0 }), hard));
  // vùng cao su mềm (2 thành phần) — rộng hơn chút, chừa rãnh
  const soft = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16, s = L * 0.12 + t * L * 0.5;
    const tt = (s - 3.5) / (L * 0.78 - 3.5);
    const r = R * (0.9 + 0.1 * Math.sin(Math.PI * Math.min(1, tt * 1.25))) + 0.35;
    soft.push([i === 0 || i === 16 ? r - 0.6 : r, s, 1]);
  }
  const softG = flutedLatheZ(soft, { flutes: 6, depth: 0.2, seg: 96, sharp: 0.6 }, { zBack, axisY: 0 });
  softG.rotateZ(Math.PI / 6);
  spin.add(M(softG, K.rubber));
  // cổ + ống bọc (ferrule) chrome
  const s0 = L * 0.78;
  spin.add(M(latheZ([[R * 0.66, s0 - 0.5], [R * 0.5, s0 + 5], [R * 0.36, s0 + 12], [shaftR * 2.1, L - 3], [shaftR * 2.1, L - 1], [shaftR * 1.4, L], [0, L]], { seg: 32, zBack, axisY: 0 }), K.absBlack));
  spin.add(M(latheZ([[0, L - 9], [shaftR * 2.2, L - 9], [shaftR * 2.25, L - 2], [shaftR * 1.5, L + 1], [0, L + 1]], { seg: 24, zBack, axisY: 0 }), K.chrome));
  // thân thép
  spin.add(M(cyl(shaftR, shaftR, shaftL, 20), K.chrome, { z: zBack - L - shaftL / 2 + 1, rx: Math.PI / 2 }));
  // mũi Phillips: 4 cánh chữ thập (rãnh tròn xoay), nhuộm đen
  const tipLen = Math.max(5, shaftR * 2.6);
  const tipProf = [[shaftR, 0, 0], [shaftR, 1.5, 0.35], [shaftR * 0.92, tipLen * 0.45, 1], [shaftR * 0.55, tipLen * 0.85, 1], [shaftR * 0.3, tipLen, 1], [0, tipLen + 0.05, 1]];
  const tipG = flutedLatheZ(tipProf, { flutes: 4, depth: 0.62, seg: 64, sharp: 1.2 }, { zBack: zBack - L - shaftL + 1, axisY: 0 });
  spin.add(M(tipG, K.blackOxide));
  spin.add(M(cyl(shaftR * 1.002, shaftR * 1.002, 9, 20), K.blackOxide, { z: zBack - L - shaftL + 1 + 4.5, rx: Math.PI / 2 }));
  // in cỡ mũi trên nắp đuôi
  const cap = decal(R * 1.3, R * 1.3, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#e9ecef'; g.beginPath(); g.arc(W / 2, H / 2, W * 0.46, 0, Math.PI * 2); g.fill();
    text(g, size, W / 2, H * 0.47, { size: H * 0.36, color: '#111', align: 'center', bold: true });
    text(g, '✚', W / 2, H * 0.8, { size: H * 0.16, color: '#c62f2a', align: 'center', bold: true });
  }, { z: zBack + 0.45, px: 12 });
  if (cap) spin.add(cap);
  root.add(dyn(spin));
  const { tip, grip } = screwdriverDims({ L, R, shaftR, shaftL });
  const tipObject = new THREE.Object3D();
  tipObject.position.set(...tip);
  root.add(tipObject);
  // gộp tĩnh bên trong nhóm quay
  spin.userData.dynamic = false;
  finish(spin, 'spin');
  spin.userData.dynamic = true;
  root.name = `screwdriver-${size.toLowerCase()}`;
  root.userData.tipObject = tipObject;
  root.userData.parts = { spin };
  return { root, tip, grip };
}

/** Tạo def tua vít theo GAME_API §7 */
export function screwdriverDef({ id, name, size, dims, massG, desc }) {
  const geo = screwdriverDims(dims);
  const def = {
    id, name, kind: 'tool', category: 'tool', icon: '🪛', massG, desc, bitSize: size,
    size: [dims.R * 2, dims.R * 2, dims.L + dims.shaftL],
    build(game) { return buildScrewdriver(game, { size, ...dims }).root; },
    grip: { pose: 'holdTool:screwdriver', hand: 'right', offset: [-geo.grip[0], -geo.grip[1], -geo.grip[2]], rot: [0, 0, 0] },
    tool: {
      kind: 'screwdriver', bit: size,
      tip: geo.tip,
      onScroll(ctx) { const s = ctx.instance.state; s.dir = -s.dir; ctx.game?.hud?.toast?.(s.dir > 0 ? 'Vặn vào ↻' : 'Nới ra ↺'); },
      onUseStart(ctx) {
        const inst = ctx.instance, s = inst.state, T = targetOf(ctx);
        const screw = T.data('screw');
        s.target = T; s.turns = 0; s.camOut = 0; s.screw = screw || null;
        s.fit = !screw ? 'none' : (screw.size || screw.bit) === size ? 'ok' : 'wrong';
        emit(ctx.game, 'screw:engage', { instance: inst, size, target: T.object, item: T.item, fit: s.fit, dir: s.dir });
        if (s.fit === 'wrong') ctx.game?.hud?.toast?.(`Mũi ${size} không khớp vít ${screw.size || screw.bit} — dễ trờn đầu vít!`);
      },
      onUseHold(ctx, dt) {
        const inst = ctx.instance, s = inst.state;
        const w = 4.2;                                   // rad/s (~40 vòng/phút khi vặn tay)
        s.angle += s.dir * w * dt;
        s.turns += (w * dt) / (Math.PI * 2);
        if (s.fit === 'wrong') s.camOut += dt * 0.9;
        const torque = s.screw ? Math.min(1.2, 0.15 + s.turns * 0.08) : 0;
        if (s.screw?.drive) { try { s.screw.drive(s.dir * (w * dt) / (Math.PI * 2), { size, torque, fit: s.fit }); } catch { /* vít của nhóm khác */ } }
        emit(ctx.game, 'screw:turn', { instance: inst, size, dir: s.dir, deg: (s.dir * w * dt * 180) / Math.PI, turns: s.turns, torque, target: s.target?.object, item: s.target?.item, pos: tipWorld(inst) });
        if (s.camOut > 1 && !s.stripped) {
          s.stripped = true;
          play(ctx.game, 'click', { vol: 0.6 });
          emit(ctx.game, 'fault', { kind: 'screw-stripped', item: s.target?.item, target: s.target?.object, by: inst });
        }
      },
      onUseEnd(ctx) {
        const inst = ctx.instance, s = inst.state;
        if (s.target?.object || s.target?.item) {
          const torque = s.screw ? Math.min(1.2, 0.15 + s.turns * 0.08) : 0;
          emit(ctx.game, 'screw:driven', { instance: inst, size, dir: s.dir, turns: s.turns, torque, stripped: !!s.stripped, target: s.target.object, item: s.target.item });
        }
        s.target = null; s.stripped = false;
      },
      hud(inst) { return `${name} · ${inst.state.dir > 0 ? 'vặn vào ↻' : 'nới ra ↺'}`; },
      keys: [{ key: 'R', label: 'Đổi chiều vặn', do(ctx) { const s = ctx.instance.state; s.dir = -s.dir; } }],
    },
    prompts: [{ key: 'R', label: 'Đổi chiều vặn', when: (inst) => !!inst?.heldBy, do(ctx) { const s = (ctx.instance || ctx.item)?.state; if (s) s.dir = -s.dir; } }],
    init(inst) { Object.assign(inst.state, { angle: 0, dir: 1, turns: 0, camOut: 0, stripped: false, target: null }); },
    update(inst) {
      const sp = inst.object.userData.parts?.spin;
      if (sp) sp.rotation.z = inst.state.angle;
    },
  };
  return def;
}
