// Tự kiểm tra nhanh "bộ não" + mô phỏng (không cần trình duyệt):
//   node src/sim/robot-brain.selftest.mjs
import { PicMcu, Odometry, Robot, MM_PER_TICK, CFG, cliffAdc } from './robot-brain.js';
import { World2D, CoverageGrid } from './world2d.js';
import { RobotSim } from './robot-sim.js';

let fail = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
// số ngẫu nhiên lặp lại được
const rng = (() => { let s = 12345; return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x80000000); })();

// 1) PIC: ramp 10 ‰/ms → 0→1000 trong 100 ms
{
  const p = new PicMcu(); p.setDrive(1000, 1000);
  const inp = { bumpRaw: 0, dropRaw: 0, cliffAdc: [600, 600, 600, 600], vbatMv: 15000 };
  for (let i = 0; i < 5; i++) { p.setDrive(1000, 1000); p.tick(10, inp); }
  ok(p.appliedL === 500, `ramp sau 50 ms = ${p.appliedL} ‰ (mong 500)`);
  for (let i = 0; i < 5; i++) { p.setDrive(1000, 1000); p.tick(10, inp); }
  ok(p.appliedL === 1000, `ramp sau 100 ms = ${p.appliedL} ‰`);
  p.tick(10, { ...inp, bumpRaw: 1 });
  ok(p.appliedL === 0 && p.blockFwd, `va chạm → cắt tiến NGAY (applied ${p.appliedL})`);
  p.setDrive(-300, -300); p.tick(10, { ...inp, bumpRaw: 1 });
  ok(p.appliedL < 0, `đang va chạm vẫn cho LÙI (applied ${p.appliedL})`);
  p.tick(10, { ...inp, dropRaw: 2 });
  ok(p.stopAll && p.appliedL === 0, 'nhấc bánh → dừng hết');
  const q = new PicMcu(); q.setDrive(500, 500);
  for (let i = 0; i < 40; i++) q.tick(10, inp);       // 400 ms không có DRIVE
  ok(q.commLost && q.appliedL === 0, 'mất nhịp tim 300 ms → COMM_LOST, dừng');
  const c = new PicMcu(); c.setDrive(0, 0);
  for (let i = 0; i < 6; i++) c.tick(10, { ...inp, cliffAdc: [600, 10, 600, 600] });
  ok(c.cliffMask === 2, `cliff #2 thấy hố sau 2 lần đo liên tiếp (mask ${c.cliffMask})`);
}
// 2) Odometry
{
  const o = new Odometry(); o.update(0, 0);
  o.update(1000, 1000);
  ok(Math.abs(o.x - 1000 * MM_PER_TICK) < 1e-6, `đi thẳng 1000 xung = ${o.x.toFixed(1)} mm`);
  const o2 = new Odometry(); o2.update(32760, 32760); o2.update(-32766, -32766);   // quấn vòng int16
  ok(Math.abs(o2.dist - 10 * MM_PER_TICK) < 1e-6, `quấn vòng int16 xử lý đúng (${o2.dist.toFixed(2)} mm)`);
}
// 3) cliff ADC
ok(cliffAdc(0.6, 12) > 300 && cliffAdc(0.6, 162) < 60 && cliffAdc(0.06, 12) < 60, `ADC: sàn ${cliffAdc(0.6, 12).toFixed(0)}, bậc 15 cm ${cliffAdc(0.6, 162).toFixed(0)}, bàn đen ${cliffAdc(0.06, 12).toFixed(0)}`);

// 4) Mô phỏng phòng 3×3 m có hố
function room(cliffOn) {
  const w = new World2D({ base: { h: 0, rho: 0.6 } });
  w.addBox(-100, -100, 3100, 0, { name: 'tường' }); w.addBox(-100, 3000, 3100, 3100); w.addBox(-100, 0, 0, 3000); w.addBox(3000, 0, 3100, 3000);
  w.addFloor(2200, 0, 3000, 900, { h: -300, name: 'hố' });
  const cov = new CoverageGrid({ x0: 0, y0: 0, x1: 3000, y1: 3000 }); cov.z0 = 0;
  const sim = new RobotSim(w, { coverage: cov, rng });
  sim.opt.cliffOn = cliffOn;
  sim.reset({ x: 800, y: 1500, th: 0 });
  cov.computeReach(w, { startX: 800, startY: 1500 });
  return { sim, cov };
}
for (const mode of ['AUTO', 'ZIGZAG', 'SPIRAL']) {
  const { sim, cov } = room(true);
  sim.setMode(mode);
  for (let i = 0; i < 18000 && sim.status === 'ok'; i++) sim.step();     // 180 s
  ok(sim.status === 'ok', `${mode}: 3 phút không rơi (trạng thái ${sim.status}), độ phủ ${cov.percent().toFixed(1)} %, sai lệch odo ${sim.odoError().toFixed(0)} mm, pin ${sim.batteryPct().toFixed(1)} %`);
}
{
  const { sim } = room(false);
  sim.setMode('AUTO');
  let i = 0;
  for (; i < 60000 && sim.status === 'ok'; i++) sim.step();
  for (let k = 0; k < 400; k++) sim.step();
  ok(sim.status !== 'ok', `tắt cảm biến cliff → robot rơi sau ${(i / 100).toFixed(0)} s (${sim.status})`);
}
console.log(fail ? `\n${fail} lỗi` : '\nTất cả đạt');
process.exit(fail ? 1 : 0);
