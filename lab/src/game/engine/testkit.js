// =============================================================================
// testkit.js — Phòng thử + item thử DỰNG SẴN để engine chạy độc lập (khi world/labRoom.js hoặc items/registry.js
// chưa có / lỗi) và để smoke test có cái mà kiểm tra.
//   buildTestRoom(game) → { root, colliders, surfaces, spawn, lights, update? }   (cùng hợp đồng labRoom.build)
//   TEST_ITEMS: test-cube (Hộp test) · test-chip (IC thử DIP-14) · test-iron (Mỏ hàn thử) ·
//               test-screwdriver (Tua vít thử) · test-box (Hộp thử tương tác: nắp bản lề + 2 vít + nút + núm + LED + quạt)
// Các def thử có hidden:true → không chiếm thanh dụng cụ khi đã có dụng cụ thật trong registry.
// =============================================================================
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { makeMaterial } from './textures.js';
import { MAT } from '../../core/materials.js';
import * as geom from '../../core/geom.js';

const BENCH_H = 750;

function M(geo, mat, x = 0, y = 0, z = 0, name) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  if (name) m.name = name;
  return m;
}

// ---------------------------------------------------------------------------- phòng thử
export function buildTestRoom(game) {
  const root = new THREE.Group();
  root.name = 'test-room';
  const colliders = [], surfaces = [], lights = [];
  const W = 9000, D = 8000, H = 3000;
  const floorMat = makeMaterial('tiles', { repeat: [W / 2400, D / 2400] });
  const wallMat = makeMaterial('paint', { repeat: [4, 1.5] });
  const floor = M(new THREE.PlaneGeometry(W, D), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.castShadow = false; floor.name = 'floor';
  root.add(floor); surfaces.push(floor);
  const ceil = M(new THREE.PlaneGeometry(W, D), wallMat, 0, H, 0);
  ceil.rotation.x = Math.PI / 2; ceil.castShadow = false;
  root.add(ceil);
  // tường + hộp va chạm
  const wall = (x, z, w, d) => {
    const m = M(new THREE.BoxGeometry(w, H, d), wallMat, x, H / 2, z);
    root.add(m);
    colliders.push(new THREE.Box3().setFromObject(m));
  };
  wall(0, -D / 2, W, 100); wall(0, D / 2, W, 100); wall(-W / 2, 0, 100, D); wall(W / 2, 0, 100, D);
  // chân tường
  const skirt = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.6 });
  for (const [x, z, w, d] of [[0, -D / 2 + 55, W, 10], [0, D / 2 - 55, W, 10], [-W / 2 + 55, 0, 10, D], [W / 2 - 55, 0, 10, D]]) root.add(M(new THREE.BoxGeometry(w, 100, d), skirt, x, 50, z));

  // bàn làm việc chính (gỗ + thảm ESD)
  const bench = new THREE.Group(); bench.name = 'bench';
  const wood = makeMaterial('wood', { repeat: [2, 1] });
  const esd = makeMaterial('esdMat', { repeat: [3, 1.3] });
  const top = M(new RoundedBoxGeometry(1600, 36, 760, 2, 4), wood, 0, BENCH_H - 18 - 3, 0, 'bench-top');
  const mat = M(new THREE.BoxGeometry(1480, 3, 640), esd, 0, BENCH_H - 1.5, 10, 'esd-mat');
  bench.add(top, mat);
  const steel = new THREE.MeshStandardMaterial({ color: 0x5b636d, metalness: 0.8, roughness: 0.4 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bench.add(M(new THREE.BoxGeometry(40, BENCH_H - 39, 40), steel, sx * 760, (BENCH_H - 39) / 2, sz * 340));
  bench.add(M(new THREE.BoxGeometry(1520, 30, 20), steel, 0, 160, -340));
  root.add(bench);
  surfaces.push(top, mat);
  colliders.push(new THREE.Box3(new THREE.Vector3(-800, 0, -380), new THREE.Vector3(800, BENCH_H, 380)));

  // kệ sau lưng bàn
  const shelf = new THREE.Group(); shelf.name = 'shelf';
  const sw = 1800, sd = 400, sz = -D / 2 + 50 + sd / 2;
  for (const y of [300, 900, 1500, 2000]) {
    const board = M(new THREE.BoxGeometry(sw, 25, sd), wood, 0, y, sz, `shelf-${y}`);
    shelf.add(board); surfaces.push(board);
  }
  for (const sx of [-1, 1]) shelf.add(M(new THREE.BoxGeometry(30, 2050, sd), steel, sx * (sw / 2 - 15), 1025, sz));
  shelf.position.x = 1800;
  root.add(shelf);
  colliders.push(new THREE.Box3(new THREE.Vector3(1800 - sw / 2, 0, sz - sd / 2), new THREE.Vector3(1800 + sw / 2, 2060, sz + sd / 2)));

  // bàn phụ
  const side = M(new RoundedBoxGeometry(900, 30, 600, 2, 4), wood, -2600, 720, -1500, 'side-table');
  root.add(side); surfaces.push(side);
  for (const sx of [-1, 1]) for (const sz2 of [-1, 1]) root.add(M(new THREE.BoxGeometry(35, 705, 35), steel, -2600 + sx * 420, 352, -1500 + sz2 * 270));
  colliders.push(new THREE.Box3(new THREE.Vector3(-3050, 0, -1800), new THREE.Vector3(-2150, 735, -1200)));

  // ánh sáng: trời + đèn trần (tấm phát sáng) + đèn điểm
  const hemi = new THREE.HemisphereLight(0xe3edf7, 0x3b342c, 0.9);
  root.add(hemi); lights.push(hemi);
  const sun = new THREE.DirectionalLight(0xfff3e2, 2.2);
  sun.position.set(2600, 4200, 2200);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.userData.shadowPriority = 10;
  const sc = sun.shadow.camera;
  sc.left = -4500; sc.right = 4500; sc.top = 4500; sc.bottom = -4500; sc.near = 100; sc.far = 12000;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 1.5;
  root.add(sun, sun.target); lights.push(sun);
  const panelMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.9 });
  const lamp = new THREE.PointLight(0xfff1dc, 1.4e6, 7000, 2);
  lamp.position.set(0, H - 120, 0);
  root.add(lamp); lights.push(lamp);
  for (const [x, z] of [[0, 0], [-2600, -1500], [1800, -2800]]) {
    const p = M(new THREE.BoxGeometry(1200, 12, 300), panelMat, x, H - 8, z);
    p.castShadow = false;
    root.add(p);
  }

  // công tắc đèn trên tường (ví dụ interact.register cho đồ tĩnh)
  const plate = M(new RoundedBoxGeometry(86, 86, 10, 2, 3), new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.4 }), -700, 1250, -D / 2 + 55, 'light-switch');
  const rocker = M(new THREE.BoxGeometry(30, 46, 10), new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.35 }), 0, 0, 8);
  plate.add(rocker);
  root.add(plate);
  let lampOn = true;
  game.interact?.register(plate, {
    name: () => `Công tắc đèn trần (${lampOn ? 'đang bật' : 'đang tắt'})`,
    prompts: [{ key: 'E', label: () => (lampOn ? 'Tắt đèn' : 'Bật đèn'), do: () => {
      lampOn = !lampOn;
      lamp.intensity = lampOn ? 1.4e6 : 0;
      panelMat.emissiveIntensity = lampOn ? 0.9 : 0.02;
      rocker.rotation.x = lampOn ? 0 : 0.25;
      game.audio?.play('click', { pos: plate });
      game.events?.emit('power:' + (lampOn ? 'on' : 'off'), { source: 'ceiling-light' });
    } }],
  });

  // đế IC 14 chân trên bàn (khe cắm dùng để thử cắm/cong chân/cắm ngược)
  const sockBase = M(new THREE.BoxGeometry(20, 4.5, 9.5), MAT.plasticBlack, 180, BENCH_H + 2.25, 60, 'dip14-socket');
  for (let i = 0; i < 7; i++) for (const zz of [-3.81, 3.81]) sockBase.add(M(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 8), MAT.gold, -7.62 + i * 2.54, 2.3, zz));
  root.add(sockBase);
  surfaces.push(sockBase);
  const anchor = new THREE.Object3D();
  anchor.position.set(0, 2.25, 0);
  sockBase.add(anchor);
  game.sockets?.add({ id: 'test-dip14', object3D: anchor, kind: 'dip14', name: 'Đế IC 14 chân' });

  return {
    root, colliders, surfaces, lights,
    spawn: { pos: [0, 0, 1350], yaw: 0 },
    items: [
      { id: 'test-cube', pos: [-380, BENCH_H, 60], rotY: 0.3 },
      { id: 'test-chip', pos: [-120, BENCH_H, 140], rotY: 0 },
      { id: 'test-box', pos: [330, BENCH_H, 90], rotY: -0.2 },
      { id: 'test-cube', pos: [1800, 925, sz], rotY: 0.8 },
    ],
  };
}

// ---------------------------------------------------------------------------- item thử
const hotTipMat = () => new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 1, roughness: 0.3, emissive: 0x000000 });

export const TEST_ITEMS = [
  {
    id: 'test-cube', name: 'Hộp test', kind: 'part', category: 'mech', hidden: true, massG: 40, size: [60, 60, 60], icon: '📦',
    desc: 'Khối nhựa 60 mm để thử cầm, soi, đặt, thả.',
    build() {
      const g = new THREE.Group();
      g.add(M(new RoundedBoxGeometry(60, 60, 60, 3, 6), new THREE.MeshStandardMaterial({ color: 0xf28c28, roughness: 0.45 }), 0, 30, 0));
      g.add(M(new THREE.BoxGeometry(40, 1, 12), new THREE.MeshStandardMaterial({ color: 0x1d1f23, roughness: 0.5 }), 0, 60.4, 0));
      return g;
    },
  },
  {
    id: 'test-chip', name: 'IC thử DIP-14', kind: 'part', category: 'ic', hidden: true, massG: 1, size: [19, 6, 10], icon: '🔲',
    insertInto: ['dip14'], mount: { seatY: 2.1 }, lessonId: 'pic16f877a',
    desc: 'IC 14 chân để thử cắm đế: khấc đánh dấu chân 1 — cắm ngược (R xoay 180°) sẽ bị ghi nhận!',
    build() {
      const { group } = geom.dipPackage(14, { label: 'TEST' });
      group.position.y = 1.3;
      const g = new THREE.Group(); g.add(group);
      return g;
    },
  },
  {
    id: 'test-iron', name: 'Mỏ hàn thử', kind: 'tool', category: 'tool', hidden: true, massG: 50, size: [22, 22, 190], icon: '🔥',
    desc: 'Mỏ hàn đơn giản để thử engine: tự nóng tới 350 °C, giữ chuột trái chạm vật → xèo xèo.',
    build() {
      const g = new THREE.Group();
      const axis = 11;
      const handle = M(new THREE.CylinderGeometry(10, 9, 110, 24), new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.85 }), 0, axis, 40);
      handle.rotation.x = Math.PI / 2;
      const guard = M(new THREE.CylinderGeometry(12, 12, 4, 24), MAT.plasticBlue, 0, axis, -17);
      guard.rotation.x = Math.PI / 2;
      const shaft = M(new THREE.CylinderGeometry(3.8, 3.8, 60, 16), MAT.steel, 0, axis, -49);
      shaft.rotation.x = Math.PI / 2;
      const tipMat = hotTipMat();
      const tip = M(new THREE.ConeGeometry(3.2, 18, 16), tipMat, 0, axis, -88);
      tip.rotation.x = -Math.PI / 2;
      g.add(handle, guard, shaft, tip);
      g.userData.tipMat = tipMat;
      return g;
    },
    grip: { pose: 'holdTool:iron', offset: [0, -11, 0], rot: [0, 0, 0] },
    tool: {
      kind: 'iron',
      tip: [0, 11, -97],
      onUseStart(ctx) { ctx.instance.state.using = true; },
      onUseHold(ctx, dt) {
        const s = ctx.instance.state;
        const g = ctx.game;
        const touching = !!ctx.point && ctx.tip && ctx.tip.distanceTo(ctx.point) < 12;
        if (touching && s.temp > 180) {
          if (!s._snd) s._snd = g.audio?.play('sizzle', { loop: true, pos: ctx.point.clone(), vol: 0.6 });
          s.smokeT = (s.smokeT || 0) - dt;
          if (s.smokeT <= 0) { s.smokeT = 0.35; g.fx?.smoke(ctx.point.toArray(), { size: 6, duration: 0.4, rate: 12, color: 0x9a9a9a }); }
          s.load = 15;
          g.events?.emit('solder:touch', { point: ctx.point, item: ctx.item, temp: s.temp });
        } else if (s._snd) { s._snd.stop(0.1); s._snd = null; }
      },
      onUseEnd(ctx) { const s = ctx.instance.state; s.using = false; if (s._snd) { s._snd.stop(0.1); s._snd = null; } },
      hud: (inst) => `Mỏ hàn ${Math.round(inst.state.temp ?? 30)} °C`,
    },
    init(inst) { inst.state.temp = 30; inst.state.load = 0; },
    update(inst, dt, game) {
      const s = inst.state;
      const target = 350 - (s.load || 0) * 4;
      s.temp += (target - s.temp) * (1 - Math.exp(-dt / 12));
      s.load = Math.max(0, (s.load || 0) - dt * 30);
      const m = inst.object.userData.tipMat;
      if (m) { const k = THREE.MathUtils.clamp((s.temp - 250) / 150, 0, 1); m.emissive.setRGB(k, k * 0.28, k * 0.05); m.emissiveIntensity = 1.6 * k; }
    },
  },
  {
    id: 'test-screwdriver', name: 'Tua vít thử PH1', kind: 'tool', category: 'tool', hidden: true, massG: 60, size: [26, 26, 200], icon: '🪛',
    desc: 'Tua vít đầu chữ thập — giữ chuột trái vào con vít để vặn.',
    build() {
      const g = new THREE.Group();
      const axis = 13;
      const handle = M(new THREE.CylinderGeometry(13, 11, 100, 6), new THREE.MeshStandardMaterial({ color: 0xd8372c, roughness: 0.4 }), 0, axis, 45);
      handle.rotation.x = Math.PI / 2;
      const shaft = M(new THREE.CylinderGeometry(2.6, 2.6, 95, 12), MAT.steel, 0, axis, -50);
      shaft.rotation.x = Math.PI / 2;
      const bit = M(new THREE.ConeGeometry(2.6, 8, 4), MAT.blackOxide, 0, axis, -101);
      bit.rotation.x = -Math.PI / 2;
      g.add(handle, shaft, bit);
      return g;
    },
    grip: { pose: 'holdTool:screwdriver', offset: [0, -13, -40], rot: [0, 0, 0] },
    tool: { kind: 'screwdriver', bit: 'PH1', tip: [0, 13, -105], hud: () => 'Tua vít PH1' },
  },
  {
    id: 'test-box', name: 'Hộp thử tương tác', kind: 'part', category: 'module', hidden: true, massG: 180, size: [120, 64, 90], icon: '🧪',
    desc: 'Hộp có nắp bản lề giữ bằng 2 vít, nút nguồn bật LED, núm chỉnh và quạt — thử hệ bộ phận con.',
    build() {
      const g = new THREE.Group();
      const shell = new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.5 });
      const body = M(new RoundedBoxGeometry(120, 56, 90, 2, 4), shell, 0, 28, 0, 'body');
      const lid = new THREE.Group(); lid.name = 'lid';
      lid.add(M(new RoundedBoxGeometry(120, 6, 90, 2, 2.5), new THREE.MeshStandardMaterial({ color: 0x55657a, roughness: 0.4 }), 0, 59, 0));
      for (const [i, x] of [[1, -48], [2, 48]]) {
        const sc = new THREE.Group(); sc.name = `screw_${i}`;
        sc.add(M(new THREE.CylinderGeometry(3, 3, 2, 16), MAT.zinc, 0, 0, 0));
        const slot = M(new THREE.BoxGeometry(4.2, 0.6, 0.8), MAT.blackOxide, 0, 1.05, 0);
        const slot2 = slot.clone(); slot2.rotation.y = Math.PI / 2;
        sc.add(slot, slot2, M(new THREE.CylinderGeometry(1.4, 1.4, 8, 10), MAT.zinc, 0, -4.5, 0));
        sc.position.set(x, 63, 34);
        g.add(sc);
      }
      const btn = M(new THREE.CylinderGeometry(6, 6, 4, 24), MAT.plasticRed, -30, 40, 46.5, 'btn_power');
      btn.rotation.x = Math.PI / 2;
      const knob = new THREE.Group(); knob.name = 'knob_speed';
      const kb = M(new THREE.CylinderGeometry(8, 9, 10, 24), MAT.plasticBlack, 0, 0, 0); kb.rotation.x = Math.PI / 2;
      const kmark = M(new THREE.BoxGeometry(1.4, 6, 1), MAT.plasticWhite, 0, 4, 5.2);
      knob.add(kb, kmark); knob.position.set(10, 30, 50);
      const led = M(new THREE.SphereGeometry(3, 16, 10), new THREE.MeshStandardMaterial({ color: 0x401010, emissive: 0xff2a1a, emissiveIntensity: 0, roughness: 0.2 }), 38, 40, 45.5, 'led_pwr');
      const fan = new THREE.Group(); fan.name = 'fan';
      for (let i = 0; i < 5; i++) { const b = M(new THREE.BoxGeometry(2, 30, 9), MAT.plasticGrey, 0, 0, 0); b.rotation.x = (i / 5) * Math.PI * 2; b.position.set(0, Math.sin((i / 5) * Math.PI * 2) * 0, 0); const arm = new THREE.Group(); arm.rotation.x = (i / 5) * Math.PI * 2; b.position.y = 16; b.rotation.x = 0.4; arm.add(b); fan.add(arm); }
      fan.add(M(new THREE.CylinderGeometry(6, 6, 6, 16), MAT.plasticDark, 0, 0, 0).rotateZ(Math.PI / 2));
      fan.position.set(61, 28, 0);
      // ngăn kéo nhỏ phía trước + phích cắm DC phía sau
      const tray = new THREE.Group(); tray.name = 'tray';
      tray.add(M(new THREE.BoxGeometry(60, 12, 4), MAT.plasticGrey, 0, 0, 0));
      tray.add(M(new THREE.BoxGeometry(14, 3, 4), MAT.plasticBlack, 0, 0, 2.5));
      tray.position.set(25, 12, 46);
      const plug = new THREE.Group(); plug.name = 'dc_plug';
      const pb = M(new THREE.CylinderGeometry(5, 5, 22, 16), MAT.plasticBlack, 0, 0, -11); pb.rotation.x = Math.PI / 2;
      plug.add(pb);
      plug.position.set(-30, 30, -45);
      g.add(body, lid, btn, knob, led, fan, tray, plug);
      return g;
    },
    interact: [
      { node: 'lid', type: 'hinge', label: 'nắp hộp', axis: [1, 0, 0], angle_deg: -105, side: [0, 0, -1], lockedBy: ['screw_*'] },
      { node: 'screw_*', type: 'screw', label: 'vít nắp M3', axis: [0, 1, 0], travel_mm: 7, turns: 5, tool: 'screwdriver', socket: 'screw-m3' },
      { node: 'btn_power', type: 'button', label: 'nút nguồn', axis: [0, 0, -1], travel_mm: 2 },
      { node: 'knob_speed', type: 'knob', label: 'núm tốc độ', axis: [0, 0, 1], min_deg: 135, max_deg: -135 },
      { node: 'led_pwr', type: 'led', label: 'đèn nguồn', color: '#ff2a1a' },
      { node: 'fan', type: 'spin', label: 'quạt', axis: [1, 0, 0] },
      { node: 'tray', type: 'slide', label: 'ngăn kéo', axis: [0, 0, 1], travel_mm: 40 },
      { node: 'dc_plug', type: 'connector', label: 'phích DC', axis: [0, 0, -1], travel_mm: 12, mate: 'dc-jack' },
    ],
    init(inst, game) {
      inst.state.power ??= false;
      game.events?.on('item:button', (e) => {
        if (e.item !== inst || e.node !== 'btn_power') return;
        inst.state.power = !inst.state.power;
        game.subparts?.setLed(inst, 'led_pwr', inst.state.power);
        game.events.emit(inst.state.power ? 'power:on' : 'power:off', { source: inst.uid, item: inst });
      });
    },
    update(inst, dt, game) {
      // quạt tự quay theo núm khi có nguồn
      const fan = game.subparts?.find(inst, 'fan');
      const knob = game.subparts?.find(inst, 'knob_speed');
      if (fan && inst.state.power) fan.state.omega = Math.max(fan.state.omega, (knob?.state.value ?? 0) * 40);
    },
  },
];

export function registerTestItems(items) {
  for (const d of TEST_ITEMS) if (!items.get(d.id)) items.register(d);
}
