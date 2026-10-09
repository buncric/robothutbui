// =============================================================================
// quests/m6-lap-robot.js — Nhiệm vụ M6 "Lắp mạch vào robot & chạy thử" (Ngày 2 · 15–19h, docs/03; ô lắp theo
//   src/components/lap-rap/_xuong_helpers.js SLOTS). Lắp bo PIC + ESP32 + 2×DRV8871 + 74HC32 + buck + BSS138 vào khoang
//   mạch của xác robot (đã mổ ở M5) → cắm lại JST bánh xe, cắm PIN CUỐI CÙNG → đóng nắp → đặt robot ở vòng tròn xuất phát
//   khu thử → bấm nút nguồn → robot TỰ CHẠY AUTO bằng bộ não thật src/sim/robot-brain.js (va chạm → lùi → quay; gặp HỐ dán
//   băng vàng-đen thì cảm biến chống rơi dừng & quay đầu). Buck chưa chỉnh 5 V (M3) → bật nguồn là CHÁY bo → thất bại.
// =============================================================================
import * as THREE from 'three';
import { defineMission, posOf } from './_mission.js';
import { registerRobotDef, ROBOT_ID, ROBOT_SLOTS, subpart, isUpsideDown, presetOpened } from './_robot.js';
import { RobotRun, seeded } from './_robot-run.js';

export const QUEST_ID = 'm6-lap-robot';
export const TEST_ZONE = { x0: 800, x1: 4200, z0: -600, z1: 2600 };
export const PIT = { x0: 1050, x1: 1550, z0: 300, z1: 700 };          // hố thử (dán băng) phía trước vòng xuất phát
const isRobot = (i) => i?.def?.id === ROBOT_ID;
const RUN_OK_S = 30;

export function theRobot(game) { return game.items.all.find((i) => isRobot(i) && !i.inBag) || null; }
const sp = (game, n) => { const r = theRobot(game); return r ? subpart(game, r, n) : null; };
const plugged = (game, n) => sp(game, n)?.state.plugged !== false;

/** Ô lắp còn trống / đã lắp */
export function slotStatus(game) {
  const r = theRobot(game);
  if (!r) return { ok: false, missing: ROBOT_SLOTS.map((s) => s.name), parts: {} };
  const parts = {}, missing = [];
  for (const s of ROBOT_SLOTS) {
    const sock = game.sockets.get(`${r.uid}:slot-${s.id}`);
    if (sock?.occupiedBy) parts[s.id] = sock.occupiedBy; else missing.push(s.name);
  }
  return { ok: !missing.length, missing, parts };
}
export function onTestFloor(game) {
  const r = theRobot(game);
  if (!r || r.heldBy) return false;
  const p = posOf(r);
  return p.x > TEST_ZONE.x0 + 150 && p.x < TEST_ZONE.x1 - 150 && p.z > TEST_ZONE.z0 + 150 && p.z < TEST_ZONE.z1 - 150 && p.y < 60 && !isUpsideDown(r);
}

/** Vách chắn xốp quanh khu thử + hố thử (hình) */
function buildArena(game) {
  const root = new THREE.Group();
  root.name = 'm6-arena';
  const fence = new THREE.MeshStandardMaterial({ color: 0x8fb3d9, transparent: true, opacity: 0.55, roughness: 0.7 });
  const Z = TEST_ZONE, H = 80, T = 30;
  const walls = [];
  for (const [x0, z0, x1, z1] of [[Z.x0, Z.z0 - T, Z.x1, Z.z0], [Z.x0, Z.z1, Z.x1, Z.z1 + T], [Z.x0 - T, Z.z0, Z.x0, Z.z1], [Z.x1, Z.z0, Z.x1 + T, Z.z1]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, H, z1 - z0), fence);
    m.position.set((x0 + x1) / 2, H / 2, (z0 + z1) / 2);
    m.raycast = () => {};
    root.add(m);
    walls.push(new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, H, z1)));
  }
  // hố: mặt tối + băng vàng-đen quanh mép
  const pit = new THREE.Mesh(new THREE.PlaneGeometry(PIT.x1 - PIT.x0, PIT.z1 - PIT.z0), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 }));
  pit.rotation.x = -Math.PI / 2; pit.position.set((PIT.x0 + PIT.x1) / 2, 0.9, (PIT.z0 + PIT.z1) / 2); pit.raycast = () => {};
  root.add(pit);
  const tape = new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.6 });
  for (const [x, z, w, d] of [[(PIT.x0 + PIT.x1) / 2, PIT.z0, PIT.x1 - PIT.x0 + 50, 50], [(PIT.x0 + PIT.x1) / 2, PIT.z1, PIT.x1 - PIT.x0 + 50, 50], [PIT.x0, (PIT.z0 + PIT.z1) / 2, 50, PIT.z1 - PIT.z0], [PIT.x1, (PIT.z0 + PIT.z1) / 2, 50, PIT.z1 - PIT.z0]]) {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(w, d), tape);
    t.rotation.x = -Math.PI / 2; t.position.set(x, 1.0, z); t.raycast = () => {};
    root.add(t);
  }
  return { root, walls };
}

export function defineM6LapRobot(game) {
  registerRobotDef(game);
  let M = null, arena = null, run = null;
  const ensureArena = () => {
    if (arena) return arena;
    arena = buildArena(game);
    game.scene.add(arena.root);
    return arena;
  };
  const removeArena = () => { if (arena) { arena.root.parent?.remove(arena.root); arena = null; } };

  /** Bật nguồn robot: kiểm tra đủ điều kiện như ngoài đời rồi chạy bộ não */
  const powerOn = () => {
    const r = theRobot(game);
    if (!r || !M.active()) return false;
    const st = slotStatus(game);
    const why = [];
    if (!st.ok) why.push(`chưa lắp: ${st.missing.join(', ')}`);
    if (!plugged(game, 'conn_main')) why.push('chưa cắm pin');
    if (!plugged(game, 'conn_wheel_l') || !plugged(game, 'conn_wheel_r')) why.push('chưa cắm đầu nối bánh');
    if (why.length) { game.hud?.toast?.(`Robot không lên nguồn — ${why.join(' · ')}`, { kind: 'warn' }); M.T.badPower++; return false; }
    // buck ở ô lắp phải đã chỉnh 5 V (M3)
    const buck = st.parts.buck;
    let v = 5;
    try { v = buck.def.outputVoltage(buck, 15.2); } catch { v = 5; }
    M.T.buckV = v;
    if (v > 5.6) {
      for (const k of ['pic', 'esp32', 'hc32', 'bss138']) {
        const it = st.parts[k];
        if (!it) continue;
        it.state.dead = true;
        it.state.damage = { state: 'dead', cause: `nguồn logic ${v.toFixed(1)} V từ buck chưa chỉnh` };
        try { game.fx?.smoke?.(posOf(it), { size: 8, duration: 4 }); game.fx?.sparks?.(posOf(it), { count: 30, speed: 30, size: 0.5 }); } catch { /* */ }
      }
      game.audio?.play('zap', { vol: 1 });
      game.events.emit('fault', { kind: 'dead', item: st.parts.pic, cause: `Buck XL4015 trong robot đang đặt ${v.toFixed(1)} V (chưa chỉnh về 5 V) → PIC/ESP32/74HC32 nhận quá áp` });
      return false;
    }
    M.T.powered = true;
    run = new RobotRun(game, r, { pit: PIT, walls: ensureArena().walls, rng: seeded(M.T.seed || 7) });
    game.events.emit('robot:power', { item: r, on: true });
    game.hud?.toast?.('🤖 Robot lên nguồn: LED PIC nháy, ESP32 BLE "RoboVac-PIC" → chế độ AUTO (va chạm – quay)', { kind: 'success' });
    game.audio?.play('motor', { vol: 0.3 });
    return true;
  };

  M = defineMission(game, {
    id: QUEST_ID,
    title: 'Lắp mạch vào robot & chạy thử',
    chapter: 'Ngày 2 · 15–19h',
    order: 60,
    requires: ['m5-mo-xac'],
    lessonId: 'xuong-lap-rap',
    intro: 'Chiều Ngày 2: lắp gọn mọi bo vào khoang mạch của xác robot (đúng ô như Xưởng lắp ráp), cắm lại đầu nối bánh, cắm PIN CUỐI CÙNG, đóng nắp và cho robot tự chạy AUTO trên khu thử — phải né vật và không rơi xuống hố.',
    kit: [
      { id: 'esp32-s3-devkitc-1', at: 'bench-assembly', dx: -500, dz: -250 },
      { id: 'drv8871-module', at: 'bench-assembly', dx: -420, dz: -250 },
      { id: 'drv8871-module', at: 'bench-assembly', dx: -360, dz: -250 },
      { id: 'sn74hc32n', at: 'bench-assembly', dx: -300, dz: -250 },
      { id: 'xl4015-module', at: 'bench-assembly', dx: -240, dz: -250 },       // buck MỚI = xuất xưởng ≈ 12 V → phải chỉnh (M3) trước khi lắp!
      { id: 'bss138-4ch-module', at: 'bench-assembly', dx: -180, dz: -250 },
      { id: 'pic16f877a', at: 'bench-assembly', dx: -120, dz: -250 },
    ],
    kitLabel: 'bàn lắp ráp',
    safety: { allowHotEdit: true },
    xp: 500,
    fastMin: 20,
    realLife: [
      'Lắp ĐỦ mạch, kiểm tra dây bằng đồng hồ, RỒI mới cắm pin — pin luôn là thứ cắm sau cùng, rút đầu tiên.',
      'Driver đặt ngay trên động cơ bánh (dây động cơ ngắn), ESP32 xa động cơ chổi than, buck ở mép cho thoáng.',
      'Cầu chì 10 A + công tắc ở thành sau; đi dây gọn, buộc lạt, không để dây cọ bánh/chổi.',
      'Chạy AUTO lần đầu: có người đứng cạnh, thử mép bàn/hố với tay sẵn sàng bắt robot. Chỉnh CLIFF_THRESHOLD theo RAW? sàn/mép.',
      'Ghi video demo; lỗi gì sửa config.h (SPEED_*, BACKUP_MM, CLIFF_THRESHOLD) rồi nạp lại.',
    ],
    counters: { badPower: 0, earlyBattery: 0, powered: false, buckV: null, runT: 0, seed: 7 },
    steps: [
      {
        id: 'robot', text: 'Xác robot đã mổ trên bàn lắp ráp: nắp trên ĐÃ NHẤC, pin ĐÃ RÚT (từ M5)',
        hint: 'Nếu chưa làm M5: robot "đã mổ sẵn" được bày lên bàn lắp ráp (Chế độ tự do).',
        check: (g) => { const r = theRobot(g); return !!r && !!sp(g, 'cover_top')?.state.open && !plugged(g, 'conn_main'); },
        where: (g) => { const r = theRobot(g); return r ? posOf(r).add(new THREE.Vector3(0, 160, 0)) : null; },
      },
      {
        id: 'mount', text: 'Lắp 7 module vào ô xanh trong khoang mạch: PIC, ESP32-S3, 2 × DRV8871, 74HC32, buck 5 V, BSS138',
        hint: () => { const s = slotStatus(game); return s.ok ? 'Buck trong ô phải ĐÃ CHỈNH 5.0 V (M3) — buck mới xuất xưởng ≈ 12 V!' : `Còn trống: ${s.missing.join(', ')}. Cầm module (E) lại gần ô xanh → E. Buck phải đã chỉnh 5.0 V (M3).`; },
        check: (g) => slotStatus(g).ok,
        where: (g) => { const r = theRobot(g); return r ? posOf(r).add(new THREE.Vector3(0, 140, 0)) : null; },
      },
      {
        id: 'jst', text: 'Cắm lại đầu nối JST 2 bánh xe (vào DRV8871 trái/phải) — theo ẢNH đã chụp ở M5',
        hint: 'E vào từng đầu nối ở mặt trong bánh. Cắm sai bên → bánh trái nhận lệnh bánh phải.',
        check: (g) => plugged(g, 'conn_wheel_l') && plugged(g, 'conn_wheel_r'),
        where: (g) => sp(g, 'conn_wheel_l')?.worldPosition() || null,
      },
      {
        id: 'battery', text: 'CUỐI CÙNG mới cắm đầu cắm PIN',
        hint: 'Đầu cắm trắng cạnh pin (khoang pin ở đáy — lật úp nếu cần, T).',
        check: (g) => plugged(g, 'conn_main'),
        where: (g) => sp(g, 'conn_main')?.worldPosition() || null,
      },
      {
        id: 'close', text: 'Đóng nắp trên lại (robot nằm NGỬA)',
        hint: 'E vào nắp trên để hạ xuống. Vít lắp lại sau khi chạy thử ổn.',
        check: (g) => { const r = theRobot(g); return !!r && !sp(g, 'cover_top')?.state.open && !isUpsideDown(r); },
        where: (g) => { const r = theRobot(g); return r ? posOf(r).add(new THREE.Vector3(0, 160, 0)) : null; },
      },
      {
        id: 'floor', text: 'Bê robot (E) đặt vào VÒNG TRÒN xuất phát trong khu thử robot (vách chắn xanh, hố dán băng phía trước)',
        hint: 'Khu thử: góc phòng có băng vàng-đen "KHU THỬ ROBOT". Đặt robot ngửa, mặt trước (bánh xoay) hướng về phía hố.',
        check: (g) => onTestFloor(g),
        where: (g) => { const a = g.world?.anchors?.['robot-start']; return a ? a.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 200, 0)) : null; },
      },
      {
        id: 'run', text: `Bấm NÚT NGUỒN trên nắp robot → robot tự chạy AUTO ≥ ${RUN_OK_S} s: va chạm thì lùi–quay, tới hố thì dừng & quay đầu, KHÔNG rơi`,
        hint: () => (run ? `Đang chạy ${run.stats.t.toFixed(0)} s · va chạm ${run.stats.bumps} · hố ${run.stats.cliffs} · đi ${(run.stats.dist / 1000).toFixed(1)} m` : 'Nút nguồn tròn đen ở mép trước nắp trên — E để bấm.'),
        check: () => !!run && !run.stats.fell && run.stats.t >= RUN_OK_S && (run.stats.cliffs >= 1 || run.stats.bumps >= 2),
        where: (g) => { const r = theRobot(g); return r ? posOf(r).add(new THREE.Vector3(0, 200, 0)) : null; },
      },
    ],
    failOn(e) {
      if (e.type === 'robot:fell') return 'Robot rơi xuống hố! Cảm biến chống rơi không kịp dừng (kiểm tra CLIFF_THRESHOLD, vị trí cảm biến ở mép TRƯỚC).';
      if (e.type === 'fault' && e.kind === 'dead' && /quá áp|Buck/i.test(e.cause || '')) return e.cause;
      return null;
    },
    score(Mi) {
      if (run) Mi.note(`Chạy ${run.stats.t.toFixed(0)} s, ${(run.stats.dist / 1000).toFixed(1)} m · va chạm ${run.stats.bumps} · dừng ở hố ${run.stats.cliffs} lần · cách mép hố gần nhất ${Number.isFinite(run.stats.minPitGap) ? run.stats.minPitGap.toFixed(0) : '—'} mm`);
      if (Mi.T.buckV != null) Mi.note(`Buck logic ${Mi.T.buckV.toFixed(2)} V ✓`);
      return 0;
    },
    onStart(Mi) {
      ensureArena();
      Mi.T.seed = 7;
      let r = theRobot(game);
      if (!r) {
        const a = Mi.anchorPos('bench-assembly');
        r = game.items.spawn(ROBOT_ID, { pos: [a.x + 300, a.y + 5, a.z], drop: true });
      }
      if (r && !game.quests.progress('m5-mo-xac')?.done && !sp(game, 'cover_top')?.state.open) presetOpened(game, r);
      if (r && isUpsideDown(r)) game.hud?.toast?.('Robot đang úp — nhấn T để lật ngửa trước khi lắp mạch', { kind: 'info', short: true });
    },
    onResume() { ensureArena(); },
    onStop(Mi, why) { if (run && why !== 'completed') { run.stop(); run = null; } if (why === 'completed' && run) { /* để robot chạy tiếp cho đẹp */ } },
  });
  if (!M) return null;
  const ev = game.events;
  // cắm pin khi chưa lắp đủ mạch → trừ điểm
  ev.on('connector:changed', (e) => {
    if (!M.active() || !isRobot(e.item) || !e.plugged || e.node !== 'conn_main') return;
    const st = slotStatus(game);
    if (!st.ok || !plugged(game, 'conn_wheel_l') || !plugged(game, 'conn_wheel_r')) { M.T.earlyBattery++; M.mistake('Cắm pin khi CHƯA lắp xong mạch / đầu nối — pin phải cắm SAU CÙNG', 15, 'bat-early'); }
  });
  // nút nguồn robot
  ev.on('item:button', (e) => { if (isRobot(e.item) && e.node === 'btn_power') { if (run?.running) { run.stop(); game.hud?.toast?.('Robot dừng (IDLE)', { kind: 'info', short: true }); } else powerOn(); } });
  // vòng lặp mô phỏng robot (60 Hz)
  game.tickers ||= [];
  game.tickers.push((dt) => { if (run?.running) { run.tick(dt); M.T.runT = run.stats.t; } });
  M.powerOn = powerOn;
  M.getRun = () => run;
  return M;
}
