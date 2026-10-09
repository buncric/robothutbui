// Mạch nạp PIC kiểu PICkit 3 (tương thích, không nhãn hãng): vỏ đỏ bo tròn ~112 × 40 × 23 mm, ô cửa sổ khói,
// 3 đèn (Power xanh · Active vàng · Status), nút "programmer-to-go", lỗ móc dây đeo, cổng mini-USB + cáp USB-A,
// đầu cái ICSP 6 chân (tam giác ▶ = chân 1 MCLR). Bấm chuột trái lên header ICSP / chip → nạp (~3.5 s).
// Phát 'program:start' { target, item, hex } — người nghe có thể đặt payload.ok = false / payload.reason;
// xong phát 'program:flashed' { ok, reason, target, item } (GAME_API §8).
import { THREE, mats, own, rbox, cyl, extrudeXZ, tube, M, G, dyn, decal, finish, text, ledMat, emit, play, toast, tipWorld, targetOf, clamp } from './_kit.js';

const LEN = 112, WID = 40, HGT = 23, R_BACK = 19;
const ICSP = ['MCLR', 'VDD', 'GND', 'PGD', 'PGC', 'LVP'];
const DURATION = 3.5;

function outline() {
  // mặt bằng: đầu −Z vuông bo nhẹ (đầu ICSP), đuôi +Z bo tròn lớn
  const pts = [];
  const zF = -LEN / 2, zB = LEN / 2;
  const r1 = 5;
  for (let i = 0; i <= 6; i++) { const a = Math.PI + (i / 6) * (Math.PI / 2); pts.push([-WID / 2 + r1 + Math.cos(a) * r1, zF + r1 + Math.sin(a) * r1]); }
  for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2); pts.push([WID / 2 - r1 + Math.cos(a) * r1, zF + r1 + Math.sin(a) * r1]); }
  for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI; pts.push([Math.cos(a) * (WID / 2), zB - R_BACK + Math.sin(a) * R_BACK * 1.0]); }
  return pts;
}

function build(game) {
  const K = mats(game);
  const root = new THREE.Group();
  const red = new THREE.MeshPhysicalMaterial({ color: 0xb02a2e, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  root.add(M(extrudeXZ(outline(), HGT, { bevel: 4.5, curveSegments: 10, bevelSegments: 3, holes: [[[-WID / 2 + 5, LEN / 2 - 9], [-WID / 2 + 9.5, LEN / 2 - 9], [-WID / 2 + 9.5, LEN / 2 - 4.5], [-WID / 2 + 5, LEN / 2 - 4.5]]] }), red));
  // cửa sổ khói trên mặt + vạch
  const win = outline().map(([x, z]) => [x * 0.72, z * 0.72 - 6]);
  root.add(M(extrudeXZ(win, 0.8, { bevel: 0.3 }), K.smoke, { y: HGT - 0.2 }));
  // đèn LED (động) — Power, Active, Status
  const leds = [ledMat(0x29ff5a), ledMat(0xffc21a), ledMat(0xff3322)];
  leds.forEach((m, i) => root.add(dyn(M(cyl(1.6, 1.8, 1.4, 12), m, { x: -10 + i * 10, y: HGT + 0.5, z: -26 }))));
  // nút programmer-to-go
  root.add(M(cyl(3.6, 4, 1.8, 20), K.absBlack, { x: 0, y: HGT + 0.7, z: 18 }));
  const panel = decal(30, 52, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    text(g, 'RVL PK3', W / 2, H * 0.09, { size: H * 0.085, color: '#f2f2f2', align: 'center', bold: true });
    text(g, 'ICSP PROGRAMMER', W / 2, H * 0.17, { size: H * 0.05, color: '#d0d4d9', align: 'center', bold: true });
    ['POWER', 'ACTIVE', 'STATUS'].forEach((t, i) => text(g, t, W * (0.17 + i * 0.333), H * 0.355, { size: H * 0.036, color: '#e8e8e8', align: 'center', bold: true }));
    text(g, '▶ 1  MCLR VDD GND PGD PGC LVP', W / 2, H * 0.03, { size: H * 0.03, color: '#ffd75a', align: 'center' });
    g.strokeStyle = '#f2f2f2'; g.lineWidth = H * 0.006; g.beginPath(); g.arc(W / 2, H * 0.8, W * 0.17, 0, Math.PI * 2); g.stroke();
  }, { y: HGT + 0.62, z: -12, rx: -Math.PI / 2, px: 14 });
  if (panel) root.add(panel);
  // đầu cái ICSP 6 chân ở đầu −Z + tam giác chân 1
  const hdr = new THREE.Group();
  hdr.position.set(0, HGT / 2, -LEN / 2 - 1);
  hdr.add(M(rbox(16.2, 3.2, 9, 0.4), K.absBlack, { z: -3.5 }));
  for (let i = 0; i < 6; i++) hdr.add(M(new THREE.PlaneGeometry(1, 1), K.lcdBezel, { x: -6.35 + i * 2.54, z: -8.02, ry: Math.PI, cast: false }));
  hdr.add(M(extrudeXZ([[-1.4, 0], [1.4, 0], [0, -2.2]], 0.3, { bevel: 0 }), K.absWhite, { x: -6.35, y: 1.6, z: -5 }));
  root.add(hdr);
  // cổng mini-USB + cáp
  root.add(M(rbox(10, 6.5, 8, 1.2), K.absBlack, { y: HGT / 2, z: LEN / 2 + 2 }));
  root.add(M(tube([[0, HGT / 2, LEN / 2 + 6], [0, HGT / 2 - 2, LEN / 2 + 30], [14, 3, LEN / 2 + 70], [40, 2.4, LEN / 2 + 110], [52, 2.4, LEN / 2 + 160], [38, 2.4, LEN / 2 + 205]], 2.1, { seg: 64, radial: 8 }), K.rubber));
  root.add(M(rbox(16, 8, 30, 2), K.absDark, { x: 30, y: 4, z: LEN / 2 + 230, ry: -0.5 }));
  root.add(M(rbox(12.2, 4.6, 12, 0.3), K.chrome, { x: 23, y: 4, z: LEN / 2 + 247, ry: -0.5 }));
  const tipObject = new THREE.Object3D();
  tipObject.position.set(-6.35, HGT / 2, -LEN / 2 - 9);
  root.add(tipObject);
  finish(root, 'pickit3');
  root.userData.tipObject = tipObject;
  root.userData.parts = { leds };
  return root;
}

function isIcsp(T) {
  if (T.data('icsp') !== undefined) return true;
  const id = String(T.item?.def?.id || '').toLowerCase(), cat = String(T.item?.def?.category || '').toLowerCase();
  return /icsp|pic|header-6|prog/.test(id) || cat === 'mcu' || cat === 'ic';
}

/**
 * Mô hình CAD boards/pickit3 (95 × 42 × 14.6, trục dài theo X, đầu ICSP ở −X, chân 1 ở z = +6.35): quay −90° quanh Y → đầu ICSP
 * về −Z, chân 1 về x = −6.35 (trùng ▶ của bản thủ tục); đáy ở y = 0; dời theo Z để miệng header (CAD x = −46.7) nằm đúng
 * tool.tip (z = −LEN/2 − 9). CAD không có cáp USB → cáp thủ tục ẩn cùng thân. onLoad: dời mốc tipObject tới miệng chân 1 của
 * header CAD và nối 3 LED (Power/Active/Status) của CAD vào userData.parts.leds (proxy đọc mesh.material mỗi lần — subparts
 * 'led' nhân bản material sau onLoad).
 */
const CAD_MOUTH_X = -46.7, CAD_PIN_Y = 6.91;
const cadOptions = {
  onBottom: false, rotateY: -Math.PI / 2, offset: [0, 0, -LEN / 2 - 9 - CAD_MOUTH_X],
  onLoad(glb, root) {
    const t = root.userData.tipObject;
    if (t) t.position.set(-6.35, CAD_PIN_Y, -LEN / 2 - 9);
    const P = root.userData.parts;
    const meshOf = (n) => { let m = null; glb.getObjectByName(n)?.traverse((o) => { if (!m && o.isMesh) m = o; }); return m; };
    const ms = ['led_pwr', 'led_active', 'led_status'].map(meshOf);
    if (!P || ms.some((m) => !m)) return;
    P.leds = ms.map((m, i) => {
      const src = P.leds[i];
      m.material = m.material.clone();
      if ('emissive' in m.material) { m.material.emissive = src.emissive.clone(); m.material.emissiveIntensity = 0; }
      return {
        get emissive() { return m.material.emissive; },
        get emissiveIntensity() { return m.material.emissiveIntensity; },
        set emissiveIntensity(v) { m.material.emissiveIntensity = v; },
      };
    });
  },
};

const def = {
  id: 'pickit3', name: 'Mạch nạp PICkit 3', kind: 'tool', category: 'tool', icon: '🧩',
  cad: 'boards/pickit3', cadOptions,
  massG: 60, size: [WID, HGT, LEN + 260], icspPinout: ICSP,
  desc: 'Nạp chương trình cho PIC16F877A qua ICSP: tam giác ▶ trên mạch nạp trùng chân 1 (MCLR) của header. Mạch nạp kéo MCLR lên 13 V khi nạp — đừng nối tụ lớn vào MCLR.',
  build,
  grip: { pose: 'holdTool:default', hand: 'right', offset: [0, -HGT / 2, 0], rot: [0, 0, 0] },
  tool: {
    tip: [-6.35, HGT / 2, -LEN / 2 - 9],
    onUseStart(ctx) {
      const inst = ctx.instance, s = inst.state;
      if (s.busy) return;
      const T = targetOf(ctx);
      if (!T.object || !isIcsp(T)) { toast(ctx.game, 'Cắm đầu ICSP vào header 6 chân của bo (▶ = chân 1 MCLR) rồi bấm để nạp'); return; }
      const payload = { instance: inst, target: T.object, item: T.item, hex: s.hex, ok: true, reason: '' };
      emit(ctx.game, 'program:start', payload);
      Object.assign(s, { busy: true, t: 0, payload, result: null });
      play(ctx.game, 'click', { pos: tipWorld(inst) });
    },
    onUseHold() {},
    onUseEnd() {},
    hud(inst) {
      const s = inst.state;
      if (s.busy) return `PICkit 3 · đang nạp ${Math.round((s.t / DURATION) * 100)} %`;
      if (s.result) return `PICkit 3 · ${s.result.ok ? 'nạp xong ✓' : `lỗi: ${s.result.reason || 'không nhận chip'}`}`;
      return `PICkit 3 · ${s.hex}`;
    },
  },
  init(inst) { Object.assign(inst.state, { busy: false, t: 0, hex: 'blink-led.hex', result: null, payload: null, blink: 0 }); },
  update(inst, dt, game) {
    const s = inst.state, P = inst.object.userData.parts;
    s.blink += dt;
    if (s.busy) {
      s.t += dt;
      if (s.t >= DURATION) {
        s.busy = false;
        const p = s.payload || {};
        s.result = { ok: p.ok !== false, reason: p.reason || '' };
        emit(game, 'program:flashed', { instance: inst, ok: s.result.ok, reason: s.result.reason, target: p.target, item: p.item, hex: s.hex });
        play(game, s.result.ok ? 'beep' : 'zap', { vol: 0.4 });
      }
    }
    if (!P) return;
    P.leds[0].emissiveIntensity = 2.2;
    P.leds[1].emissiveIntensity = s.busy && Math.sin(s.blink * 18) > 0 ? 2.4 : 0;
    const st = P.leds[2];
    if (s.result) { st.emissive.setHex(s.result.ok ? 0x29ff5a : 0xff3322); st.emissiveIntensity = 2.2; } else st.emissiveIntensity = 0;
  },
};
export default def;
