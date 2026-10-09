// =============================================================================
// robot-sim.js — Ghép "bộ não" (robot-brain.js) với vật lý 2D (world2d.js):
//   cảm biến (bumper, cliff IR, nhấc bánh) → PIC (an toàn + ramp + encoder) → STATUS 50 Hz →
//   ESP32 (Odometry + Robot.step) → DRIVE 20 Hz → PIC → động cơ → bánh lăn/trượt → va chạm.
// Logic thuần, không three.js. Bước thời gian cố định DT = 10 ms (gọi step() nhiều lần mỗi khung hình).
// Dùng chung cho mọi môi trường (căn hộ, mặt bàn…).
// =============================================================================
import { CFG, Robot, Odometry, PicMcu, MM_PER_TICK, cliffAdc, cellOcv, angDiff, clamp } from './robot-brain.js';

const DEG = Math.PI / 180;
const G = 9810;   // mm/s²

/** Kích thước robot (mm) — thân Ø350, cao 80 + tháp lidar 17 */
export const RG = Object.freeze({
  R: 175,            // bán kính thân
  BODY_BOT: 8,       // khe gầm
  BODY_TOP: 80,      // nóc thân
  H: 97,             // đỉnh tháp lidar (chiều cao robot)
  TURRET_R: 42, TURRET_OFF: -55,   // tháp lidar lệch về sau tâm
  LIDAR_Z: 90,
  CLIFF_R: 155, CLIFF_ANG: [70 * DEG, 25 * DEG, -25 * DEG, -70 * DEG],   // #1 trái … #4 phải
  WHEEL_Y: CFG.WHEEL_BASE_MM / 2,
  VMAX: 600,         // mm/s ứng với 1000 ‰ ở 14.8 V (giả định động cơ + hộp số module bánh)
  SENSOR_H: 12,      // mắt cảm biến cliff cách sàn
  MASS: 3.5,         // kg
  BUMP_FORCE: 2.5,   // N — lực cần để ấn công tắc bumper
  R_CLEAN: 125,      // nửa bề rộng miệng hút + chổi chính
  BRUSH_R: 110,
  CAP_AH: 2.6,       // pin 4S 2600 mAh
  RINT: 0.15,        // điện trở trong pin (Ω)
});
export const CLIFF_NAMES = ['#1 trái', '#2 trước-trái', '#3 trước-phải', '#4 phải'];

function gauss(rng) { return (rng() + rng() + rng() - 1.5) * 2; }   // ~ N(0, 1)

export class RobotSim {
  /**
   * @param world  World2D
   * @param opts   { coverage: CoverageGrid|null, rng, dt (s) }
   */
  constructor(world, { coverage = null, rng = Math.random, dt = 0.01 } = {}) {
    this.world = world;
    this.cov = coverage;
    this.rng = rng;
    this.DT = dt;
    this.opt = { cliffOn: true, bumperOn: true, slip: true, useImu: false, cliffThreshold: 60 };
    this.fault = { encDeadL: false, bumperStuck: 0, comm: false, crosstalk: [0, 0, 0, 0], sun: false, rhoOverride: null };
    this.log = [];
    this.impacts = [];     // môi trường lấy ra để vẽ tia lửa/khói
    this._tmp = {};
    this.contacts = [];
    this.cliffAdcVals = [600, 600, 600, 600];
    this.sensorPts = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, h: 0, d: 12 }));
    this.soc = 1;
    this.reset({ x: 0, y: 0, th: 0 });
  }

  // ---------------------------------------------------------------- khởi tạo
  reset(pose, { keepBattery = false } = {}) {
    this.x = pose.x; this.y = pose.y; this.th = pose.th || 0;
    this.start = { x: this.x, y: this.y, th: this.th };
    this.z0 = this.world.floorAt(this.x, this.y).h;
    this.brain = new Robot(this.rng);
    this.odo = new Odometry();
    this.pic = new PicMcu();
    this.pic.cliffThreshold = this.opt.cliffThreshold;
    this.pic.setDrive(0, 0);
    this.t = 0; this.nowMs = 0;
    this.tDrive = 0; this.tAux = 0; this.espSinceStatus = 0; this.picLostFlag = false;
    if (!keepBattery) this.soc = 1;
    this.vbat = 4 * cellOcv(this.soc);
    this.current = 0;
    this.biasL = (this.rng() - 0.5) * 0.02; this.biasR = -this.biasL + (this.rng() - 0.5) * 0.006;
    this.status = 'ok';      // 'ok' | 'falling' | 'fallen' | 'broken'
    this.fall = null;
    this.tangled = null;
    this.bumpRaw = 0; this.dropRaw = 0;
    this.vL = 0; this.vR = 0; this.speed = 0; this.stall = 0;
    this.distTrue = 0;
    this.imuDrift = 0;
    this.watch = { x: this.x, y: this.y, t: 0, warned: false };
    this.contacts.length = 0;
    this.lastStatus = this.pic.status();
    this.log.length = 0;
    this.impacts.length = 0;
    this.maxImpact = 0;
    this._wedgeLogged = false; this._commLogged = false;
    this._sense();
  }

  setMode(m) {
    if (this.status !== 'ok') return;
    this.brain.setMode(m, this.odo, this.nowMs);
    this._drain();
  }
  /** Lái tay: lPct, rPct ∈ [−100, 100] — gọi đều đặn (giống lệnh DRV từ app) */
  manual(lPct, rPct) {
    if (this.status !== 'ok' || this.fault.comm) return;
    this.brain.manualDrive(lPct, rPct, this.nowMs);
  }

  addLog(msg, kind = 'env') {
    this.log.push({ t: this.t, msg, kind });
    if (this.log.length > 60) this.log.shift();
  }
  _drain() {
    let e;
    while ((e = this.brain.popEvent())) this.addLog('E,' + e, 'fw');
  }

  // ---------------------------------------------------------------- tiện ích hình học
  /** Robot có được đặt tại (x,y) không: không chạm vật, sàn phẳng dưới bánh & cảm biến */
  canPlace(x, y, th = this.th) {
    const w = this.world;
    const h = w.floorAt(x, y).h;
    for (const o of w.obstacles) {
      if (!this._bodyHitAt(o, h)) continue;
      if (w.closest(o, x, y, this._tmp).d < RG.R + 5) return false;
    }
    for (let i = 0; i < 4; i++) {
      const a = th + RG.CLIFF_ANG[i];
      if (w.floorAt(x + RG.CLIFF_R * Math.cos(a), y + RG.CLIFF_R * Math.sin(a)).h < h - 25) return false;
    }
    return true;
  }
  _bodyHitAt(o, z0) { return o.zBot < z0 + RG.BODY_TOP && o.zTop > z0 + RG.BODY_BOT; }
  _turretHitAt(o, z0) { return o.zBot < z0 + RG.H && o.zTop > z0 + RG.BODY_TOP; }
  /** vật cản cắt mặt phẳng quét của lidar */
  lidarSees(o) { return o.zBot < this.z0 + RG.LIDAR_Z && o.zTop > this.z0 + RG.LIDAR_Z; }

  /** Tư thế mà ODOMETRY nghĩ robot đang ở (đổi từ khung xuất phát sang khung thế giới) */
  ghostPose() {
    const c = Math.cos(this.start.th), s = Math.sin(this.start.th), o = this.odo;
    return { x: this.start.x + o.x * c - o.y * s, y: this.start.y + o.x * s + o.y * c, th: this.start.th + o.theta };
  }
  odoError() { const g = this.ghostPose(); return Math.hypot(g.x - this.x, g.y - this.y); }
  wheelPoint(side) {   // side +1 trái, −1 phải
    return [this.x - Math.sin(this.th) * RG.WHEEL_Y * side, this.y + Math.cos(this.th) * RG.WHEEL_Y * side];
  }
  batteryPct() { return clamp(this.soc * 100, 0, 100); }

  /** Quét lidar n tia → mảng khoảng cách (mm) tính từ tâm tháp lidar */
  lidarScan(n, maxR, out, phase = 0) {
    const ox = this.x + Math.cos(this.th) * RG.TURRET_OFF, oy = this.y + Math.sin(this.th) * RG.TURRET_OFF;
    const f = (o) => this.lidarSees(o);
    for (let i = 0; i < n; i++) {
      const a = phase + (i / n) * Math.PI * 2;
      out[i] = this.world.raycast(ox, oy, Math.cos(a), Math.sin(a), maxR, f);
    }
    return [ox, oy];
  }

  // ---------------------------------------------------------------- một bước 10 ms
  step() {
    const dt = this.DT, dtMs = dt * 1000;
    this._objects(dt);
    if (this.status === 'falling') { this._fallStep(dt); this._tick(dt); return; }
    if (this.status !== 'ok') { this._tick(dt); return; }

    // 1) cảm biến → 2) PIC
    this._sense();
    const statusDue = this.pic.tick(dtMs, { bumpRaw: this.bumpRaw, dropRaw: this.dropRaw, cliffAdc: this.cliffAdcVals, vbatMv: this.vbat * 1000 });

    // 3) ESP32 nhận STATUS (50 Hz) → odometry → thuật toán
    if (statusDue && !this.fault.comm) {
      const st = this.pic.status();
      this.lastStatus = st;
      this.espSinceStatus = 0; this.picLostFlag = false;
      if (this.opt.useImu) this.imuDrift += (1 * DEG / 60) * 0.02 + gauss(this.rng) * 0.0002;   // MPU6050 trôi ~1°/phút
      this.odo.update(st.encL, st.encR, this.opt.useImu, this.th - this.start.th + this.imuDrift);
      this.brain.step(st, this.odo, this.nowMs);
      this._drain();
    } else {
      this.espSinceStatus += dtMs;
      if (this.espSinceStatus > CFG.PIC_LOST_MS && !this.picLostFlag) {
        this.picLostFlag = true;
        this.brain.picLost(); this._drain();
        this.addLog('ESP32: >300 ms không nhận STATUS → dừng (picLost)');
      }
    }

    // 4) ESP32 gửi DRIVE 20 Hz (cũng là nhịp tim), AUX 2 Hz
    this.tDrive += dtMs; this.tAux += dtMs;
    if (this.tDrive >= CFG.DRIVE_PERIOD_MS) {
      this.tDrive -= CFG.DRIVE_PERIOD_MS;
      if (!this.fault.comm) this.pic.setDrive(this.brain.cmdL, this.brain.cmdR);
      else if (this.pic.commLost && !this._commLogged) { this._commLogged = true; this.addLog('PIC: mất nhịp tim 300 ms → COMM_LOST, dừng hết'); }
    }
    if (this.tAux >= 500) {
      this.tAux -= 500;
      if (!this.fault.comm) this.pic.setAux(this.brain.brushMainOut(), this.brain.brushSideOut());
    }

    // 5) vật lý
    this._physics(dt);
    if (this.status !== 'ok') { this._tick(dt); return; }

    // 6) làm sạch, mối nguy, pin, kẹt thật
    const fanOn = this.brain.fanOut() > 0 && !this.fault.comm;
    if (this.cov && (this.pic.brushMain || fanOn) && Math.abs(this.z0 - (this.cov.z0 ?? 0)) < 30) this.cov.paint(this.x, this.y, this.t);
    this._hazards(dt);
    this._battery(dt);
    this._watchdog();
    this._tick(dt);
  }

  _tick(dt) { this.t += dt; this.nowMs = Math.round(this.t * 1000); }

  // ---------------------------------------------------------------- cảm biến
  _sense() {
    const w = this.world, { x, y, th, z0 } = this;
    // Bumper: cung trước ±80°, 2 công tắc. Tiếp xúc giữa (±20°) ấn cả 2.
    let bump = 0;
    for (const c of this.contacts) {
      if (!c.trip || c.d > RG.R + 3) continue;
      const a = angDiff(Math.atan2(c.py - y, c.px - x), th);
      if (Math.abs(a) > 80 * DEG) continue;
      bump |= Math.abs(a) < 20 * DEG ? 3 : a > 0 ? 1 : 2;
    }
    if (!this.opt.bumperOn) bump = 0;           // bumper bị rút dây / tháo
    bump |= this.fault.bumperStuck;
    this.bumpRaw = bump;
    // Cliff IR ×4
    for (let i = 0; i < 4; i++) {
      const a = th + RG.CLIFF_ANG[i];
      const px = x + RG.CLIFF_R * Math.cos(a), py = y + RG.CLIFF_R * Math.sin(a);
      const f = w.floorAt(px, py);
      const d = RG.SENSOR_H + (z0 - f.h);
      const rho = f.rhoOverride ?? (this.fault.rhoOverride && f.surface ? this.fault.rhoOverride : f.rho);
      this.cliffAdcVals[i] = cliffAdc(rho, d, { sun: this.fault.sun && !!f.sunny, crosstalk: this.fault.crosstalk[i], noise: (this.rng() - 0.5) * 10 });
      const sp = this.sensorPts[i];
      sp.x = px; sp.y = py; sp.h = f.h; sp.d = d;
    }
    this.pic.cliffEnableMask = this.opt.cliffOn ? 0x0f : 0;    // CLIFF_ENABLE_MASK = 0 ↔ không dùng cảm biến
    this.pic.cliffThreshold = this.opt.cliffThreshold;
    // Công tắc nhấc bánh
    let drop = 0;
    const [lx, ly] = this.wheelPoint(1), [rx, ry] = this.wheelPoint(-1);
    if (w.floorAt(lx, ly).h < z0 - 15) drop |= 1;
    if (w.floorAt(rx, ry).h < z0 - 15) drop |= 2;
    this.dropRaw = drop;
  }

  // ---------------------------------------------------------------- vật lý chuyển động
  _physics(dt) {
    const w = this.world;
    const f = w.floorAt(this.x, this.y);
    const vb = clamp(this.vbat / 14.8, 0.75, 1.15);             // cùng duty, áp thấp → chạy chậm
    const k = (RG.VMAX / 1000) * (f.speed ?? 1) * vb;
    const cL = this.pic.appliedL * k, cR = this.pic.appliedR * k;   // tốc độ mặt lốp (encoder "thấy")
    let gL = cL, gR = cR;                                         // tốc độ thật trên sàn (có trượt)
    if (this.opt.slip) {
      const s = f.slip ?? 0.02;
      gL *= 1 + this.biasL + gauss(this.rng) * s;
      gR *= 1 + this.biasR + gauss(this.rng) * s;
    }
    const dsDes = 0.5 * (gL + gR) * dt;
    const dth = ((gR - gL) / CFG.WHEEL_BASE_MM) * dt;
    const mid = this.th + 0.5 * dth;
    let nx = this.x + dsDes * Math.cos(mid), ny = this.y + dsDes * Math.sin(mid);
    const thN = this.th + dth;
    [nx, ny] = this._resolve(nx, ny, thN, dt);
    if (this.tangled) {   // dây quấn chổi: bị "neo" quanh điểm vướng
      const dx = nx - this.tangled.x, dy = ny - this.tangled.y, L = Math.hypot(dx, dy);
      if (L > 40) { nx = this.tangled.x + (dx / L) * 40; ny = this.tangled.y + (dy / L) * 40; }
    }
    const mx = nx - this.x, my = ny - this.y;
    const dsAct = mx * Math.cos(mid) + my * Math.sin(mid);
    // phần quãng đường bị cản: bánh vẫn quay (trượt, encoder vẫn đếm) một phần, phần còn lại động cơ bị ghì
    let blocked = 0;
    if (Math.abs(dsDes) > 1e-6) blocked = clamp((dsDes - dsAct) / dsDes, 0, 1);
    this.stall = blocked;
    const keep = 1 - blocked * (1 - (f.encSlip ?? 0.3));
    const eL = cL * dt * keep, eR = cR * dt * keep;
    this.pic.addPulses(this.fault.encDeadL ? 0 : Math.abs(eL) / MM_PER_TICK, Math.abs(eR) / MM_PER_TICK);
    this.vL = cL * keep; this.vR = cR * keep;
    this.x = nx; this.y = ny; this.th = thN;
    const moved = Math.hypot(mx, my);
    this.distTrue += moved;
    this.speed = moved / dt;

    // mặt đỡ: leo thảm / nẹp cửa (≤ 20 mm), xuống bậc nhỏ, hay RƠI
    const f2 = w.floorAt(this.x, this.y);
    if (f2.h > this.z0 && f2.h - this.z0 <= 20) this.z0 = f2.h;
    else if (f2.h < this.z0 && this.z0 - f2.h <= 25) this.z0 = f2.h;
    const [lx, ly] = this.wheelPoint(1), [rx, ry] = this.wheelPoint(-1);
    const hl = w.floorAt(lx, ly).h, hr = w.floorAt(rx, ry).h;
    if (f2.h < this.z0 - 25 || hl < this.z0 - 25 || hr < this.z0 - 25) {
      // hướng đổ: về phía có điểm hụt chân
      let ux = 0, uy = 0;
      if (f2.h < this.z0 - 25) { ux += Math.cos(this.th); uy += Math.sin(this.th); }
      if (hl < this.z0 - 25) { ux += lx - this.x; uy += ly - this.y; }
      if (hr < this.z0 - 25) { ux += rx - this.x; uy += ry - this.y; }
      if (Math.abs(this.speed) > 20) { ux += Math.cos(this.th) * 200 * Math.sign(dsDes || 1); uy += Math.sin(this.th) * 200 * Math.sign(dsDes || 1); }
      this._startFall(ux, uy, mx / dt, my / dt);
    }
  }

  /** Giải va chạm hình tròn thân robot (và tháp lidar) với vật cản; đẩy vật nhẹ */
  _resolve(nx, ny, th, dt) {
    const w = this.world, tmp = this._tmp, z0 = this.z0, R = RG.R;
    for (let it = 0; it < 3; it++) {
      for (const o of w.obstacles) {
        if (o.falling) continue;
        if (this._bodyHitAt(o, z0)) {
          const bb = w.bbox(o);
          if (nx + R < bb[0] || nx - R > bb[2] || ny + R < bb[1] || ny - R > bb[3]) continue;
          w.closest(o, nx, ny, tmp);
          if (tmp.d >= R) continue;
          const pen = R - tmp.d;
          if (o.movable) {
            const frac = this._pushObject(o, -tmp.nx * pen, -tmp.ny * pen, dt);
            const rem = pen * (1 - frac);
            nx += tmp.nx * rem; ny += tmp.ny * rem;
          } else { nx += tmp.nx * pen; ny += tmp.ny * pen; }
        } else if (this._turretHitAt(o, z0)) {
          // tháp lidar kẹt dưới gầm thấp (gầm cao hơn thân 80 mm nhưng thấp hơn 97 mm)
          const tx = nx + Math.cos(th) * RG.TURRET_OFF, ty = ny + Math.sin(th) * RG.TURRET_OFF;
          w.closest(o, tx, ty, tmp);
          if (tmp.d >= RG.TURRET_R) continue;
          const pen = RG.TURRET_R - tmp.d;
          nx += tmp.nx * pen; ny += tmp.ny * pen;
          if (!this._wedgeLogged) { this._wedgeLogged = true; this.addLog(`Tháp lidar kẹt dưới gầm "${o.name || 'vật'}" (gầm thấp hơn ${RG.H} mm) — bumper KHÔNG biết!`); }
        }
      }
    }
    // tiếp xúc cho bumper (tại vị trí cuối)
    this.contacts.length = 0;
    for (const o of w.obstacles) {
      if (o.falling || !this._bodyHitAt(o, z0)) continue;
      const bb = w.bbox(o);
      if (nx + R + 6 < bb[0] || nx - R - 6 > bb[2] || ny + R + 6 < bb[1] || ny - R - 6 > bb[3]) continue;
      w.closest(o, nx, ny, tmp);
      if (tmp.d < R + 4) {
        // vật nhẹ (cốc, dép): lực đẩy nhỏ hơn lực lò xo bumper → công tắc KHÔNG bị ấn
        const trip = !o.movable || o.mu * o.mass * 9.81 > RG.BUMP_FORCE;
        this.contacts.push({ px: tmp.px, py: tmp.py, d: tmp.d, trip, o });
      }
    }
    return [nx, ny];
  }

  /** Đẩy vật di động (dx,dy); vật bị tường/vật tĩnh chặn thì dừng. Trả về tỉ lệ đã đi được 0..1 */
  _pushObject(o, dx, dy, dt) {
    const w = this.world;
    const [cx0, cy0] = w.center(o);
    w.moveObstacle(o, dx, dy);
    this._separateFromStatics(o);
    const [cx1, cy1] = w.center(o);
    const L2 = dx * dx + dy * dy;
    const frac = L2 > 1e-9 ? clamp(((cx1 - cx0) * dx + (cy1 - cy0) * dy) / L2, 0, 1) : 0;
    if (o.roll > 0) { o.vx = (dx / dt) * 1.15 * frac; o.vy = (dy / dt) * 1.15 * frac; }   // bóng: lăn tiếp
    if (!o.pushedLogged && frac > 0.2) { o.pushedLogged = true; this.addLog(`Robot đẩy "${o.name || 'vật'}" (${o.mass} kg${o.mu * o.mass * 9.81 > RG.BUMP_FORCE ? '' : ' — quá nhẹ, bumper không bị ấn'})`); }
    return frac;
  }

  _separateFromStatics(o) {
    const w = this.world, tmp = this._tmp;
    for (const s of w.obstacles) {
      if (s === o || s.movable || s.falling) continue;
      if (!(s.zBot < o.zTop && s.zTop > o.zBot)) continue;
      if (o.kind === 'circle') {
        w.closest(s, o.cx, o.cy, tmp);
        if (tmp.d < o.r) {
          const pen = o.r - tmp.d;
          o.cx += tmp.nx * pen; o.cy += tmp.ny * pen;
          if (o.roll > 0) { const vn = o.vx * tmp.nx + o.vy * tmp.ny; if (vn < 0) { o.vx -= 1.6 * vn * tmp.nx; o.vy -= 1.6 * vn * tmp.ny; } }
        }
      } else {
        const [sx0, sy0, sx1, sy1] = w.bbox(s);
        const ox = Math.min(o.x1, sx1) - Math.max(o.x0, sx0), oy = Math.min(o.y1, sy1) - Math.max(o.y0, sy0);
        if (ox <= 0 || oy <= 0) continue;
        const [ocx, ocy] = w.center(o), scx = (sx0 + sx1) / 2, scy = (sy0 + sy1) / 2;
        if (ox < oy) w.moveObstacle(o, ocx < scx ? -ox : ox, 0);
        else w.moveObstacle(o, 0, ocy < scy ? -oy : oy);
      }
    }
  }

  /** Vật di động: lăn (bóng), rơi khỏi mép (cốc khỏi bàn) */
  _objects(dt) {
    const w = this.world;
    for (const o of w.obstacles) {
      if (!o.movable) continue;
      if (o.falling) {
        const F = o.falling;
        F.vz -= G * dt;
        o.zBot += F.vz * dt; o.zTop += F.vz * dt;
        w.moveObstacle(o, F.vx * dt, F.vy * dt);
        F.rot += F.rotRate * dt;
        const [cx, cy] = w.center(o);
        const fh = w.floorAt(cx, cy).h;
        if (o.zBot <= fh) {
          const v = -F.vz;
          const hgt = o.zTop - o.zBot;
          o.zBot = fh; o.zTop = fh + hgt;
          o.falling = null; o.fallen = true; o.tilt = F.rot;
          o.vx = o.vy = 0;
          const fell = (F.z0 - fh) / 1000;
          if (o.fragile && v > 2000) { o.broken = true; this.addLog(`"${o.name}" rơi ${fell.toFixed(2)} m, chạm sàn ${(v / 1000).toFixed(1)} m/s → VỠ!`); }
          else this.addLog(`"${o.name}" rơi ${fell.toFixed(2)} m xuống sàn`);
          this.impacts.push({ x: cx, y: cy, z: fh, speed: v, kind: 'object', o });
        }
        continue;
      }
      if (o.roll > 0 && (o.vx || o.vy)) {
        w.moveObstacle(o, o.vx * dt, o.vy * dt);
        this._separateFromStatics(o);
        const k = Math.exp(-o.roll * dt);
        o.vx *= k; o.vy *= k;
        if (Math.hypot(o.vx, o.vy) < 5) o.vx = o.vy = 0;
      }
      // hụt mặt đỡ → rơi
      const [cx, cy] = w.center(o);
      const fh = w.floorAt(cx, cy).h;
      if (fh < o.zBot - 25) {
        const sp = Math.hypot(o.vx, o.vy);
        let vx = o.vx, vy = o.vy;
        if (sp < 60) {   // bị đẩy chậm qua mép: trượt ra theo hướng từ robot
          const dx = cx - this.x, dy = cy - this.y, L = Math.hypot(dx, dy) || 1;
          vx = (dx / L) * 150; vy = (dy / L) * 150;
        }
        o.falling = { vx, vy, vz: 0, rot: 0, rotRate: 5 + this.rng() * 5, z0: o.zBot, axis: [-vy, vx] };
        this.addLog(`"${o.name}" bị đẩy qua mép → rơi!`);
      }
    }
  }

  // ---------------------------------------------------------------- rơi & lật
  _startFall(ux, uy, vx, vy) {
    const L = Math.hypot(ux, uy) || 1;
    ux /= L; uy /= L;
    const vOut = Math.max(150, vx * ux + vy * uy);
    this.status = 'falling';
    this.fall = {
      vx: ux * vOut, vy: uy * vOut, vz: 0,
      zc: this.z0 + 50, z0: this.z0,
      ax: -uy, ay: ux,          // trục lật (2D, vuông góc hướng đổ) — môi trường đổi sang 3D
      ux, uy,
      tilt: 0, rate: 3 + vOut / 120, bounces: 0, settle: false,
    };
    this.pic.appliedL = this.pic.appliedR = 0;
    this.addLog(`⚠ Robot hụt mép (sàn thấp hơn ${(this.z0 - this.world.floorAt(this.x + ux * 100, this.y + uy * 100).h).toFixed(0)} mm) — đang RƠI!`);
    if (this.dropRaw) this.addLog('Công tắc nhấc bánh báo LIFTED — nhưng đã quá muộn');
  }

  /** Trọng tâm nhô ra khỏi mép bậc tiếp theo? → đẩy robot lộn tiếp theo hướng đổ */
  _overhang(F, fh) {
    const ahead = this.world.floorAt(this.x + F.ux * 110, this.y + F.uy * 110).h;
    if (ahead >= fh - 25) return false;
    const sp = Math.max(260, Math.hypot(F.vx, F.vy));
    F.vx = F.ux * sp; F.vy = F.uy * sp;
    F.rate = Math.max(Math.abs(F.rate), 4.5) * Math.sign(F.rate || 1);
    if (F.vz < 0) F.vz = 0;
    return true;
  }

  _lowest(tilt) { return 175 * Math.abs(Math.sin(tilt)) + 50 * Math.abs(Math.cos(tilt)); }

  _fallStep(dt) {
    const F = this.fall, w = this.world;
    if (F.settle && this._overhang(F, w.floorAt(this.x, this.y).h)) F.settle = false;
    if (F.settle) {
      // nằm yên: lật về 0 (bánh xuống) hoặc π (úp); nếu phía sau còn bậc cao hơn → nằm chúc đầu tựa vào mép
      const fh = w.floorAt(this.x, this.y).h;
      const up = Math.cos(F.tilt) >= 0;
      let target = up ? Math.round(F.tilt / (2 * Math.PI)) * 2 * Math.PI : Math.round((F.tilt - Math.PI) / (2 * Math.PI)) * 2 * Math.PI + Math.PI;
      const behind = w.floorAt(this.x - F.ux * 170, this.y - F.uy * 170).h;
      if (up && behind > fh + 25) target += Math.min(0.9, Math.atan2(behind - fh, 190));
      F.tilt += (target - F.tilt) * Math.min(1, dt * 8);
      const want = fh + (up ? this._lowest(F.tilt) : 47);
      F.zc += (want - F.zc) * Math.min(1, dt * 8);
      if (Math.abs(target - F.tilt) < 0.01) {
        F.tilt = target; F.zc = want;
        const flipped = Math.cos(F.tilt) < 0;
        const total = F.z0 - fh;
        if (this.maxImpact > 1500 || flipped || total >= 250) {
          this.status = 'broken';
          this.addLog(`💥 Robot rơi ${(total / 1000).toFixed(2)} m, mép vỏ đập xuống ${(this.maxImpact / 1000).toFixed(1)} m/s${flipped ? ', lật úp' : ''} → HỎNG (nứt vỏ, gãy chốt bumper, lệch trục bánh, có thể lỏng pin)`);
        } else {
          this.status = 'fallen';
          this.addLog(`Robot rơi ${(total / 1000).toFixed(2)} m, kẹt dưới bậc — cần người nhấc lên`);
        }
        this.z0 = fh;
      }
      return;
    }
    F.vz -= G * dt;
    F.zc += F.vz * dt;
    this.x += F.vx * dt; this.y += F.vy * dt;
    F.tilt += F.rate * dt;
    const fh = w.floorAt(this.x, this.y).h;
    const low = this._lowest(F.tilt);
    if (F.zc - low <= fh && F.vz < 0) {
      const v = -F.vz;
      // vành robot chạm sàn nhanh hơn tâm vì robot đang xoay: v_vành ≈ v_tâm + ω·R/2
      this.maxImpact = Math.max(this.maxImpact, v + Math.abs(F.rate) * 175 * 0.5);
      F.zc = fh + low;
      this.impacts.push({ x: this.x, y: this.y, z: fh, speed: v, kind: 'robot' });
      if (v > 400) this.addLog(`Va đập xuống sàn ${(v / 1000).toFixed(1)} m/s (rơi tự do từ ${((v * v) / (2 * G) / 1000).toFixed(2)} m)`);
      F.vz = v * 0.28;
      F.vx *= 0.45; F.vy *= 0.45;
      F.rate = F.rate * 0.4 + (this.rng() - 0.5) * 2;
      F.bounces++;
      if (this._overhang(F, fh)) { F.bounces = Math.min(F.bounces, 1); return; }   // còn bậc nữa → lộn tiếp
      if (F.bounces >= 3 || v < 500) F.settle = true;
    }
    // tường chặn khi đang rơi
    for (const o of w.obstacles) {
      if (o.movable || !(o.zBot < F.zc + 50 && o.zTop > F.zc - 50)) continue;
      w.closest(o, this.x, this.y, this._tmp);
      if (this._tmp.d < 150) {
        const pen = 150 - this._tmp.d;
        this.x += this._tmp.nx * pen; this.y += this._tmp.ny * pen;
        const vn = F.vx * this._tmp.nx + F.vy * this._tmp.ny;
        if (vn < 0) { F.vx -= 1.5 * vn * this._tmp.nx; F.vy -= 1.5 * vn * this._tmp.ny; }
      }
    }
  }

  // ---------------------------------------------------------------- dây/tất quấn chổi
  _hazards(dt) {
    if (this.tangled || !this.pic.brushMain) return;
    for (const h of this.world.hazards) {
      if (!h.active) continue;
      if (this.world.hazardDist(h, this.x, this.y) > RG.BRUSH_R) continue;
      const p = h.kind === 'cable' ? 2.5 : 1.2;    // xác suất mỗi giây khi chổi đè lên
      if (this.rng() < p * dt) {
        h.active = false; h.attached = true;
        this.tangled = { x: this.x, y: this.y, h };
        this.addLog(h.kind === 'cable' ? '🌀 Dây điện bị cuốn vào chổi chính! Chổi kẹt, robot bị "neo"' : '🌀 Tất bị hút vào, quấn chổi chính! Robot bị kẹt');
      }
    }
  }
  /** Người dùng "giải cứu": gỡ dây khỏi chổi và cất đi */
  untangle() {
    if (!this.tangled) return false;
    this.tangled.h.attached = false;
    this.tangled.h.removed = true;
    this.tangled = null;
    this.addLog('Đã gỡ dây/tất khỏi chổi và cất đi');
    return true;
  }

  // ---------------------------------------------------------------- pin 4S 2600 mAh
  _battery(dt) {
    const f = this.world.floorAt(this.x, this.y);
    const dL = Math.abs(this.pic.appliedL) / 1000, dR = Math.abs(this.pic.appliedR) / 1000;
    const iWheels = (0.08 + 0.3 * dL + 1.2 * dL * this.stall) + (0.08 + 0.3 * dR + 1.2 * dR * this.stall);
    const iMain = this.pic.brushMain ? (this.tangled ? 2.6 : 0.55 + (f.kind === 'rug' ? 0.35 : 0)) : 0;
    const iSide = this.pic.brushSide ? 0.12 : 0;
    const fan = this.brain.fanOut();            // quạt do ESP32 điều khiển trực tiếp (LEDC)
    const iFan = 2.3 * (fan / 100) ** 2;
    const iBase = 0.12 + 0.25;    // ESP32 + PIC + cảm biến, lidar
    this.current = iWheels + iMain + iSide + iFan + iBase;
    this.parts = { iWheels, iMain, iSide, iFan, iBase };
    this.soc = Math.max(0, this.soc - (this.current * dt) / 3600 / RG.CAP_AH);
    this.vbat = 4 * cellOcv(this.soc) - this.current * RG.RINT;
  }

  // Robot "kẹt thật" mà firmware không phát hiện (encoder vẫn đếm vì bánh trượt)
  _watchdog() {
    if (this.nowMs % 1000 !== 0) return;
    const active = this.brain.mode !== 'IDLE' && this.brain.mode !== 'MANUAL';
    const moved = Math.hypot(this.x - this.watch.x, this.y - this.watch.y);
    if (!active || moved > 80) { this.watch = { x: this.x, y: this.y, t: this.t, warned: false }; return; }
    if (!this.watch.warned && this.t - this.watch.t > 15) {
      this.watch.warned = true;
      this.addLog(`⚠ Robot đứng yên ${Math.round(this.t - this.watch.t)} s nhưng firmware không báo STUCK (odometry vẫn tăng do bánh trượt)`);
    }
  }
}

/** Định dạng thời gian mm:ss */
export const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
