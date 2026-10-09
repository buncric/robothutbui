// =============================================================================
// quests/_robot-run.js — [nhiệm vụ] Cho xác robot (đã lắp mạch ở M6) TỰ CHẠY trên khu thử robot bằng "bộ não" thật
// src/sim/robot-brain.js: Robot (ESP32 — máy trạng thái AUTO: va chạm → lùi → quay ngẫu nhiên) + PicMcu (PIC — ramp,
// cấm tiến khi va / hố, lọc cliff 2 lần) + Odometry. Môi trường 2D trên sàn lab:
//   • va chạm: hình tròn Ø350 với world.colliders (tường, bàn, khối xốp, ghế…) + vách chắn khu thử → bumper trái/phải
//   • cảm biến chống rơi #1–#4 cách tâm 155 mm (80°, 18°, −18°, −80°): trên HỐ → cliffAdc(ρ, 400 mm) ≈ 0 < ngưỡng 60
//   • encoder: 1000 xung / vòng bánh Ø70 (MM_PER_TICK) — PIC gán dấu theo chiều đang xuất
// Không phải chuyển động "diễn": bánh quay theo duty PIC đã ramp, robot đi theo động học vi sai (wheelbase 235 mm).
//   const run = new RobotRun(game, robotItem, { pit: {x0,x1,z0,z1}, walls:[Box3], rng }) · run.tick(dt) · run.stats · run.stop()
// =============================================================================
import * as THREE from 'three';
import { Robot, PicMcu, Odometry, CFG, MM_PER_TICK, cliffAdc } from '../../sim/robot-brain.js';

const R_BODY = 175;
const VMAX = 600;                         // mm/s ở 1000 ‰ (bánh 180 v/ph × π·70 mm ≈ 660 mm/s, trừ tải)
const CLIFF_ANG = [80, 18, -18, -80].map((a) => (a * Math.PI) / 180);
const CLIFF_R = 155;

/** RNG lặp lại được (mulberry32) */
export function seeded(seed = 1) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class RobotRun {
  constructor(game, inst, { pit = null, walls = [], rng = Math.random, forward = true } = {}) {
    this.game = game;
    this.inst = inst;
    this.pit = pit;
    const o = inst.object;
    o.updateMatrixWorld(true);
    this.x = o.position.x; this.z = o.position.z;
    // hướng: mặt trước item = −Z cục bộ → hướng thế giới (−sin yaw, −cos yaw)
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(o.quaternion);
    this.yaw = Math.atan2(-f.x, -f.z);
    this.y0 = o.position.y;
    this.boxes = [...(game.world?.colliders || []), ...walls].filter((b) => b.min.y < 120 && b.max.y > 20);
    this.robot = new Robot(rng);
    this.pic = new PicMcu();
    this.odo = new Odometry();
    this.nowMs = 0; this.driveAcc = 0; this.acc = 0;
    this.stats = { t: 0, dist: 0, bumps: 0, cliffs: 0, stuck: 0, fell: false, events: [], minPitGap: Infinity };
    this.running = true;
    this.pic.setDrive(0, 0);
    if (forward) this.robot.debugAutoForward(this.odo, 0);      // AUTO: bỏ pha xoắn ốc, đi thẳng ngay (giống chế độ va chạm-quay)
    else this.robot.setMode('AUTO', this.odo, 0);
  }

  _dirs(yaw = this.yaw) {
    const f = [-Math.sin(yaw), -Math.cos(yaw)];       // trước
    const l = [-Math.cos(yaw), Math.sin(yaw)];        // trái
    return { f, l };
  }
  inPit(x, z, margin = 0) {
    const p = this.pit;
    return !!p && x > p.x0 + margin && x < p.x1 - margin && z > p.z0 + margin && z < p.z1 - margin;
  }
  /** Tiếp xúc với hộp va chạm: trả hướng (thế giới) từ tâm robot tới điểm gần nhất, hoặc null */
  _contact(x, z) {
    let best = null, bd = R_BODY + 12;
    for (const b of this.boxes) {
      const cx = Math.max(b.min.x, Math.min(x, b.max.x)), cz = Math.max(b.min.z, Math.min(z, b.max.z));
      const d = Math.hypot(cx - x, cz - z);
      if (d < bd) { bd = d; best = [cx - x, cz - z, d]; }
    }
    return best;
  }

  /** dt (giây) — chạy các bước 10 ms */
  tick(dt) {
    if (!this.running) return;
    this.acc += Math.min(0.1, dt) * 1000;
    while (this.acc >= 10) { this.acc -= 10; this._step10(); if (!this.running) break; }
    // bánh xe quay theo tốc độ thật (bộ phận con 'spin' của mô hình): ω = v / r_bánh
    this._wheels ||= ['l', 'r'].map((s) => (this.inst.subparts || []).find((p) => p.type === 'spin' && (p.name === `wheel_${s}_spin` || (/^wheel(_\d+)?$/.test(p.node?.name || '') && p.node.parent?.name === `wheel_${s}`))) || null);
    const v = [this.pic.appliedL, this.pic.appliedR];
    this._wheels.forEach((w, i) => { if (w) w.state.omega = Math.abs((v[i] / 1000) * VMAX / 35); });
    const o = this.inst.object;
    o.position.set(this.x, this.y0, this.z);
    o.rotation.set(0, this.yaw, 0);
    o.updateMatrixWorld(true);
  }

  _step10() {
    const DT = 10;
    const { f, l } = this._dirs();
    // ---- cảm biến
    let bumpRaw = 0;
    const c = this._contact(this.x, this.z);
    if (c && c[2] < R_BODY + 6) {           // bumper lò xo: chạm trong vòng ~6 mm là công tắc đóng
      const ang = Math.atan2(c[0] * l[0] + c[1] * l[1], c[0] * f[0] + c[1] * f[1]);      // > 0: bên trái
      if (Math.abs(ang) < (100 * Math.PI) / 180) bumpRaw = Math.abs(ang) < 0.35 ? 3 : ang > 0 ? 1 : 2;
    }
    const cliff = CLIFF_ANG.map((a) => {
      const sx = this.x + f[0] * CLIFF_R * Math.cos(a) + l[0] * CLIFF_R * Math.sin(a);
      const sz = this.z + f[1] * CLIFF_R * Math.cos(a) + l[1] * CLIFF_R * Math.sin(a);
      return this.inPit(sx, sz) ? cliffAdc(0.6, 400) : cliffAdc(0.6, 12);
    });
    const due = this.pic.tick(DT, { bumpRaw, dropRaw: 0, cliffAdc: cliff, vbatMv: 15200 });
    // ---- động học vi sai
    const vL = (this.pic.appliedL / 1000) * VMAX, vR = (this.pic.appliedR / 1000) * VMAX;
    const dl = vL * DT / 1000, dr = vR * DT / 1000;
    const ds = (dl + dr) / 2, dth = (dr - dl) / CFG.WHEEL_BASE_MM;
    const nyaw = this.yaw + dth;
    const mid = this.yaw + dth / 2;
    const nx = this.x - Math.sin(mid) * ds, nz = this.z - Math.cos(mid) * ds;
    const cc = this._contact(nx, nz);
    const blocked = cc && cc[2] < R_BODY && (!c || cc[2] < c[2]);
    if (!blocked) { this.x = nx; this.z = nz; this.stats.dist += Math.abs(ds); }
    this.yaw = nyaw;
    // encoder: xung theo quãng bánh lăn thật (bị chặn thì bánh trượt tại chỗ → vẫn có xung, robot báo STUCK)
    this.pic.addPulses(Math.abs(dl) / MM_PER_TICK, Math.abs(dr) / MM_PER_TICK);
    this.nowMs += DT;
    this.stats.t = this.nowMs / 1000;
    if (this.pit) {
      const gx = Math.max(this.pit.x0 - this.x, 0, this.x - this.pit.x1), gz = Math.max(this.pit.z0 - this.z, 0, this.z - this.pit.z1);
      this.stats.minPitGap = Math.min(this.stats.minPitGap, Math.hypot(gx, gz));
      // tâm robot đã ra khỏi mép (bánh xoay + 1 bánh hụt) → rơi
      if (this.inPit(this.x, this.z, 20)) { this.stats.fell = true; this.running = false; this.game.events.emit('robot:fell', { item: this.inst, stats: this.stats }); return; }
    }
    // ---- ESP32: STATUS 50 Hz → bộ não; lệnh DRIVE mỗi 50 ms
    if (due) {
      const st = this.pic.status();
      this.odo.update(st.encL, st.encR);
      this.robot.step(st, this.odo, this.nowMs);
      let ev;
      while ((ev = this.robot.popEvent())) {
        this.stats.events.push({ t: +this.stats.t.toFixed(2), ev });
        if (ev.startsWith('BUMP')) this.stats.bumps++;
        if (ev === 'CLIFF') this.stats.cliffs++;
        if (ev === 'STUCK') this.stats.stuck++;
        this.game.events.emit('robot:event', { item: this.inst, event: ev, t: this.stats.t });
      }
    }
    this.driveAcc += DT;
    if (this.driveAcc >= CFG.DRIVE_PERIOD_MS) { this.driveAcc = 0; this.pic.setDrive(this.robot.cmdL, this.robot.cmdR); this.pic.setAux(this.robot.brushMainOut(), this.robot.brushSideOut()); }
  }

  stop() { this.running = false; this.robot.setMode('IDLE', this.odo, this.nowMs); }
}
