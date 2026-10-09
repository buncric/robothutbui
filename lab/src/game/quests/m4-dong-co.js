// =============================================================================
// quests/m4-dong-co.js — Nhiệm vụ M4 "Điều khiển bánh xe: 74HC32 + DRV8871" (Ngày 1 · 19–22h, docs/01 bảng 74HC32).
//   Breadboard: SN74HC32 nuôi 5 V (chân 14/7) · cổng 1–2 cho bánh TRÁI: 1A=4A=RC2/CCP1 (PWM, chân 17), 1B=RD1 (nDIR, chân 20),
//   2B=RD0 (DIR, chân 19), 1Y→IN1, 2Y→IN2 của DRV8871 · DRV: VM = VBAT (pin 4S / nguồn bàn 12 V), GND chung với PIC,
//   tụ 1000 µF/25 V sát VM–GND (đúng cực!) · động cơ RS-360 ở OUT1/OUT2.
//   Thử: phím K = lệnh DRV:100,100 → DRV:-100,-100 → DRV:0,0 (PIC xuất PWM/DIR/nDIR — bộ giải mạch thật cả 74HC32, DRV8871,
//   động cơ) → tiến/lùi phải ĐỐI XỨNG. Phím H (giữ) = giữ chặt trục → đo dòng kẹt (≤ 2–3 s, DRV8871 băm dòng ~2.1 A).
// =============================================================================
import { defineMission, whereItem, pinNet, isLive, boardPic, sameNode } from './_mission.js';
import { installCircuitExt } from './_circuit-ext.js';

export const QUEST_ID = 'm4-dong-co';
const MINUS = '−';
const isPic = (i) => /pic16f877/i.test(i?.def?.id || '');
const isHc = (i) => /74hc32/i.test(i?.def?.id || '');
const isDrv = (i) => i?.def?.electrical?.type === 'h-bridge' || i?.def?.id === 'drv8871-module';
const isMotor = (i) => i?.def?.electrical?.type === 'dc-motor';
const isBulk = (i) => i?.def?.electrical?.type === 'capacitor' && i.def.electrical.polar && (i.def.electrical.farads || 0) >= 470e-6;

function parts(game) {
  const f = (p) => game.items.all.find((i) => isLive(i) && p(i) && !i.state?.dead) || game.items.all.find((i) => isLive(i) && p(i)) || null;
  return { pic: boardPic(game), hc: f(isHc), drv: f(isDrv), mot: f(isMotor), cap: f(isBulk) };
}
const el = (game, it) => (it ? game.power?.elementsOf(it)?.[0] || null : null);

/** Bảng nối 74HC32 ↔ PIC ↔ DRV8871 (bánh trái) theo docs/01 */
export const HC_LEFT = [
  { hc: '1', to: ['pic', '17'], label: '74HC32 chân 1 (1A) ← RC2/CCP1 — PWM trái (PIC chân 17)' },
  { hc: '4', to: ['pic', '17'], label: '74HC32 chân 4 (2A) ← RC2/CCP1 — PWM trái (PIC chân 17)' },
  { hc: '2', to: ['pic', '20'], label: '74HC32 chân 2 (1B) ← RD1 — nDIR trái (PIC chân 20)' },
  { hc: '5', to: ['pic', '19'], label: '74HC32 chân 5 (2B) ← RD0 — DIR trái (PIC chân 19)' },
  { hc: '3', to: ['drv', 'IN1'], label: '74HC32 chân 3 (1Y) → DRV8871 IN1' },
  { hc: '6', to: ['drv', 'IN2'], label: '74HC32 chân 6 (2Y) → DRV8871 IN2' },
];
export function hcWiring(game) {
  const P = parts(game);
  if (!P.hc || !P.pic || !P.drv) return { ok: false, missing: ['đủ 74HC32 + bo PIC + module DRV8871'], wrong: [] };
  const missing = [], wrong = [];
  for (const r of HC_LEFT) {
    const a = pinNet(game, P.hc, r.hc), b = pinNet(game, P[r.to[0]], r.to[1]);
    if (a !== b) missing.push(r.label);
  }
  // nối nhầm kinh điển: 1B vào RD0 (DIR) thay vì RD1 (nDIR) → tiến thả trôi yếu hơn lùi
  if (pinNet(game, P.hc, '2') === pinNet(game, P.pic, '19')) wrong.push('chân 2 (1B) đang nối RD0 (DIR) — phải là RD1 (nDIR)!');
  return { ok: !missing.length, missing, wrong };
}
export function hcPower(game) {
  const P = parts(game);
  if (!P.hc || !P.pic) return false;
  const vdd = [pinNet(game, P.pic, '11'), pinNet(game, P.pic, '32')], vss = [pinNet(game, P.pic, '12'), pinNet(game, P.pic, '31')];
  const h14 = pinNet(game, P.hc, '14'), h7 = pinNet(game, P.hc, '7');
  return vdd.some((x) => sameNode(game, x, h14)) && vss.some((x) => sameNode(game, x, h7));
}
export function drvPower(game) {
  const P = parts(game);
  const miss = [];
  if (!P.drv || !P.pic) return { ok: false, missing: ['module DRV8871 + bo PIC'], capReversed: false };
  const g = pinNet(game, P.drv, 'GND'), vm = pinNet(game, P.drv, 'VM');
  const vss = [pinNet(game, P.pic, '12'), pinNet(game, P.pic, '31')];
  const vdd = [pinNet(game, P.pic, '11'), pinNet(game, P.pic, '32')];
  if (!vss.some((x) => sameNode(game, x, g))) miss.push('GND của DRV8871 nối chung GND với PIC (GND chung!)');
  if (!vm || vdd.some((x) => sameNode(game, x, vm)) || sameNode(game, vm, g)) miss.push('VM của DRV8871 ← VBAT (pin 4S qua công tắc / nguồn bàn 12 V) — KHÔNG lấy từ 5 V');
  let capReversed = false;
  if (!P.cap) miss.push('tụ hoá 1000 µF/25 V ngay chân VM–GND');
  else {
    const cp = pinNet(game, P.cap, '+'), cm = pinNet(game, P.cap, MINUS);
    if (sameNode(game, cp, vm) && sameNode(game, cm, g)) { /* đúng */ } else if (sameNode(game, cp, g) && sameNode(game, cm, vm)) { capReversed = true; miss.push('tụ 1000 µF đang NGƯỢC cực (vạch trắng "−" phải về GND)'); } else miss.push('tụ 1000 µF: chân + (dài) → VM, chân − (vạch trắng) → GND');
  }
  return { ok: !miss.length, missing: miss, capReversed };
}
export function motorWired(game) {
  const P = parts(game);
  if (!P.mot || !P.drv) return false;
  const o1 = pinNet(game, P.drv, 'T-OUT1'), o2 = pinNet(game, P.drv, 'T-OUT2');
  const a = pinNet(game, P.mot, '+'), b = pinNet(game, P.mot, MINUS);
  return !!o1 && !!o2 && o1 !== o2 && ((a === o1 && b === o2) || (a === o2 && b === o1));
}

export function defineM4DongCo(game) {
  installCircuitExt(game);
  let M = null;
  const cmdOf = () => M?.T.cmd || 'stop';
  /** gửi lệnh thử tới PIC (như gõ DRV:… trên Serial Monitor ESP32) */
  const sendCmd = (cmd) => {
    const { pic } = parts(game);
    const e = el(game, pic);
    if (!pic || !e?.running) { game.hud?.toast?.(`PIC chưa chạy (${pic?.state?.mcuStatus || 'không có bo PIC'}) — không nhận lệnh`, { kind: 'warn' }); return false; }
    M.T.cmd = cmd;
    pic.state.program = `motor-test:${cmd}`;
    game.power.specKey = '';
    const TXT = { fwd: 'DRV:100,100 (tiến hết tốc)', rev: 'DRV:-100,-100 (lùi hết tốc)', stop: 'DRV:0,0 (dừng — phanh)' };
    game.hud?.toast?.(`⌨ Gửi lệnh ${TXT[cmd]}`, { kind: 'info', short: true });
    game.events.emit('motor:command', { cmd, item: pic });
    return true;
  };
  M = defineMission(game, {
    id: QUEST_ID,
    title: 'Điều khiển bánh xe: 74HC32 + DRV8871',
    chapter: 'Ngày 1 · 19–22h',
    order: 40,
    requires: ['m3-nguon-5v'],
    lessonId: 'driver-drv8871',
    intro: 'Tối Ngày 1: hàn/cắm 74HC32 + DRV8871 cho bánh trái theo bảng docs/01 (IN1 = PWM OR nDIR, IN2 = PWM OR DIR), kê động cơ lên, gửi DRV:100,100 rồi DRV:-100,-100 — tiến và lùi phải ĐỀU NHAU.',
    kit: [
      { id: 'breadboard-830', at: 'bench-test', dx: -150, dz: 120 },
      { id: 'sn74hc32n', at: 'bench-test', dx: 0, dz: 60 },
      { id: 'drv8871-module', at: 'bench-test', dx: 120, dz: 60 },
      { id: 'dc-motor-rs360', at: 'bench-test', dx: 260, dz: 60 },
      { id: 'cap-elec-1000uf-25v', at: 'bench-test', dx: 200, dz: 160 },
    ],
    kitLabel: 'bàn đo & nạp',
    safety: { psuMaxIlim: 3.1 },
    xp: 350,
    fastMin: 20,
    realLife: [
      'Kê robot/bánh khỏi mặt đất trước khi thử động cơ. ESP32 để USE_SPEED_PID 0 (chưa có encoder).',
      'Gõ DRV:30,30 rồi DRV:-30,-30 trên Serial ESP32: 2 chiều phải quay đều nhau. Tiến yếu hơn lùi rõ rệt → kiểm tra RD1/RD3 phải là nDIR (docs/01).',
      'Tụ 1000 µF/25 V sát VM–GND của MỖI driver (đúng cực!) + tụ 100 nF hai cực động cơ — nếu không, bật động cơ làm reset PIC.',
      'Dòng kẹt (stall) RS-360 ở 12–14 V ≈ 1.7–2 A: DRV8871 băm dòng ~2.1 A (R_ILIM 30 kΩ). Không để kẹt quá vài giây — cuộn dây nóng theo I²R.',
      'Bánh quay ngược chiều mong muốn → đổi MOTOR_L_INVERT/MOTOR_R_INVERT trong config.h thay vì đảo dây vội.',
    ],
    counters: { cmd: 'stop', fwdT: 0, revT: 0, fwdRpm: 0, revRpm: 0, stalling: false, stallT: 0, stallPeak: 0, stallDone: false, longStall: false },
    steps: [
      {
        id: 'place', text: 'Cắm 74HC32 lên breadboard (khấc sang trái, vắt rãnh giữa) — module DRV8871, động cơ RS-360, tụ 1000 µF để sẵn trên bàn',
        hint: 'Cầm IC 74HC32 (E), nhắm lỗ breadboard vắt ngang rãnh giữa → E. Khấc (chân 1) quay sang TRÁI.',
        check: (g) => { const { hc, drv, mot } = parts(g); return !!hc?.socket && hc.socketInfo?.orientation !== 'reversed' && !!drv && !!mot; },
        where: whereItem(isHc),
      },
      {
        id: 'hc-power', text: 'Nuôi 74HC32: chân 14 (VCC) → +5 V, chân 7 (GND) → GND chung với PIC (thêm tụ 100 nF sát chân)',
        hint: '74HC32 là IC logic CMOS 5 V: KHÔNG cấp VBAT. Chân 14 góc trên-trái, chân 7 góc dưới-phải.',
        check: (g) => hcPower(g),
        where: whereItem(isHc),
      },
      {
        id: 'hc-left', text: 'Đi dây bánh TRÁI theo bảng docs/01: 1A,2A ← RC2 (PWM) · 1B ← RD1 (nDIR) · 2B ← RD0 (DIR) · 1Y → IN1 · 2Y → IN2',
        hint: () => { const r = hcWiring(game); return r.ok ? '' : `${r.wrong.length ? `SAI: ${r.wrong.join(' · ')} — ` : ''}Còn thiếu: ${r.missing.join(' · ')}`; },
        check: (g) => {
          const r = hcWiring(g);
          if (r.wrong.length && !M.T.wrongWarned) { M.T.wrongWarned = true; M.mistake(`Nối nhầm: ${r.wrong[0]}`, 5, 'hc-wrong'); }
          return r.ok;
        },
        where: whereItem(isHc),
      },
      {
        id: 'drv-power', text: 'DRV8871: VM ← VBAT (pin / nguồn bàn 12 V), GND chung với PIC, tụ 1000 µF sát VM–GND đúng cực',
        hint: () => { const r = drvPower(game); return r.ok ? '' : `Còn thiếu: ${r.missing.join(' · ')}`; },
        check: (g) => {
          const r = drvPower(g);
          if (r.capReversed && !M.T.capWarned) { M.T.capWarned = true; M.mistake('Tụ hoá 1000 µF cắm NGƯỢC cực — cấp điện là phồng/nổ tụ', 5, 'cap-rev'); }
          return r.ok;
        },
        where: whereItem(isDrv),
      },
      {
        id: 'motor', text: 'Nối động cơ RS-360 vào cầu đấu OUT1 / OUT2 của DRV8871 (siết vít)',
        hint: 'Dây động cơ vào domino MOTOR (OUT1/OUT2), siết vít bằng tua vít. Chiều quay sai thì đảo trong config.h sau.',
        check: (g) => motorWired(g),
        where: whereItem(isMotor),
      },
      {
        id: 'power', text: 'Cấp nguồn: logic 5 V (PIC chạy) + VM ≥ 9 V cho DRV8871',
        hint: () => { const { drv, pic } = parts(game); const d = el(game, drv); return `PIC: ${pic?.state?.mcuStatus || '—'} · DRV: ${d?.dir || 'chưa có điện'} (VM ≈ ${(d?.vm ?? 0).toFixed(1)} V)`; },
        check: (g) => { const { drv, pic } = parts(g); const d = el(g, drv), p = el(g, pic); return (d?.vm ?? 0) > 9 && !!p?.running; },
        where: whereItem(isDrv),
      },
      {
        id: 'fwd', text: 'Nhấn K: gửi DRV:100,100 — động cơ phải quay TIẾN êm, ổn định',
        hint: () => { const { drv } = parts(game); return `DRV8871 đang: ${el(game, drv)?.dir || '—'}. Không quay → kiểm tra IN1/IN2 (74HC32 chân 3/6) và VM.`; },
        check: () => M.T.fwdT > 0.5,
        where: whereItem(isMotor),
      },
      {
        id: 'rev', text: 'Nhấn K: gửi DRV:-100,-100 — quay LÙI, tốc độ phải ĐỐI XỨNG với chiều tiến (±15 %)',
        hint: () => (M.T.revT > 0.5 ? `Tiến ${M.T.fwdRpm.toFixed(0)} v/ph, lùi ${M.T.revRpm.toFixed(0)} v/ph — chưa đối xứng: xem lại 1B/2B (nDIR/DIR).` : 'Nhấn K để đổi sang lệnh lùi.'),
        check: () => M.T.revT > 0.5 && M.T.fwdRpm > 0 && Math.abs(M.T.fwdRpm - M.T.revRpm) / Math.max(M.T.fwdRpm, M.T.revRpm) < 0.15,
        where: whereItem(isMotor),
      },
      {
        id: 'stall', text: 'Giữ H để kẹp chặt trục (0.5–3 s): đọc DÒNG KẸT trên nguồn — rồi thả ra ngay',
        hint: 'Dòng kẹt = điện áp / điện trở cuộn dây (không còn sức phản điện động). Giữ quá 3 s → cuộn dây nóng.',
        check: () => M.T.stallDone,
        where: whereItem(isMotor),
      },
      {
        id: 'off', text: 'Nhấn K tới DRV:0,0 (phanh) rồi TẮT nguồn VM / công tắc',
        hint: 'Dừng = PWM cao → IN1 = IN2 = 1 → DRV8871 phanh (2 FET dưới dẫn) — bánh dừng gấp.',
        hint2: 'Tụ 1000 µF còn giữ điện vài giây sau khi tắt — chờ xả rồi mới chạm vào mạch.',
        done: (e) => cmdOf() === 'stop' && ((e.type === 'switch:changed' && e.on === false) || (e.type === 'power:off' && (e.source === 'psu' || e.source === 'battery'))),
        where: whereItem(isDrv),
      },
    ],
    failOn(e) {
      if (e.type === 'fault' && (isPic(e.item) || isDrv(e.item)) && ['dead', 'burn', 'explode'].includes(e.kind)) return `${e.item.def.name} cháy — ${e.cause || ''}`;
      return null;
    },
    score(Mi) {
      if (Mi.T.stallPeak > 0) Mi.note(`Dòng kẹt đo được ≈ ${Mi.T.stallPeak.toFixed(2)} A`);
      if (Mi.T.fwdRpm && Mi.T.revRpm) Mi.note(`Tiến ${Mi.T.fwdRpm.toFixed(0)} v/ph · lùi ${Mi.T.revRpm.toFixed(0)} v/ph — đối xứng ✓`);
      return 0;
    },
    onStart(Mi) { Mi.T.cmd = 'stop'; },
    onStop() { const m = parts(game).mot; const e = el(game, m); if (e?.p?.stall) e.configure({ stall: false }); },
  });
  if (!M) return null;

  // ---- phím K (lệnh) / H (giữ trục)
  game.events.on('input:key', (e) => {
    if (!M.active() || e.repeat || game.app?.paused) return;
    if (e.code === 'KeyK' && e.down) {
      const next = { stop: 'fwd', fwd: 'rev', rev: 'stop' }[cmdOf()] || 'fwd';
      sendCmd(next);
    }
    if (e.code === 'KeyH') setStall(e.down);
  });
  const setStall = (on) => {
    const m = parts(game).mot, e = el(game, m);
    if (!e) return;
    if (on && !M.T.stalling) { M.T.stalling = true; M.T.stallT = 0; M.T.stallPeak = 0; e.configure({ stall: true }); game.hud?.toast?.('✋ Giữ chặt trục động cơ…', { kind: 'info', short: true }); }
    if (!on && M.T.stalling) {
      M.T.stalling = false; e.configure({ stall: false });
      if (M.T.stallT >= 0.4 && M.T.stallPeak > 0.8) M.T.stallDone = true;
      game.hud?.toast?.(`Dòng kẹt ≈ ${M.T.stallPeak.toFixed(2)} A trong ${M.T.stallT.toFixed(1)} s${M.T.stallPeak > 2 ? ' — DRV8871 đang băm dòng (I_TRIP ≈ 2.1 A)' : ''}`, { kind: M.T.stallDone ? 'success' : 'info' });
    }
  };
  M.setStall = setStall;
  M.sendCmd = sendCmd;
  // ---- đo tốc độ / dòng mỗi bước logic
  game.tickers ||= [];
  game.tickers.push((dt) => {
    if (!M.active()) return;
    const m = parts(game).mot, e = el(game, m);
    if (!e) return;
    const rpm = e.rpm || 0;
    // tốc độ ổn định (đỉnh) mỗi chiều — không tính lúc đang kẹp trục
    if (M.T.cmd === 'fwd' && Math.abs(rpm) > 1500 && !M.T.stalling) { M.T.fwdT += dt; M.T.fwdRpm = Math.max(M.T.fwdRpm, Math.abs(rpm)); M.T.fwdSign = Math.sign(rpm); }
    if (M.T.cmd === 'rev' && Math.abs(rpm) > 1500 && !M.T.stalling && Math.sign(rpm) !== (M.T.fwdSign || 1)) { M.T.revT += dt; M.T.revRpm = Math.max(M.T.revRpm, Math.abs(rpm)); }
    if (M.T.stalling) {
      M.T.stallT += dt;
      M.T.stallPeak = Math.max(M.T.stallPeak, Math.abs(e.I || 0));
      if (M.T.stallT > 3 && !M.T.longStall) { M.T.longStall = true; M.mistake('Giữ kẹt trục quá 3 s — cuộn dây nóng nhanh (P = I²R)', 5, 'stall'); }
    }
  });
  return M;
}
