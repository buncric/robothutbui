// =============================================================================
// robot-brain.js — "Bộ não" robot hút bụi, chép 1-1 từ firmware thật (logic thuần, KHÔNG dùng three.js)
//
//   Lớp ESP32-S3 : Odometry + Robot (máy trạng thái IDLE/MANUAL/AUTO/SPIRAL/ZIGZAG)
//                  ← firmware/esp32s3/src/robot.cpp, robot.h, config.h
//   Lớp PIC16F877A: PicMcu — ramp 10 ‰/ms, chặn tiến khi va chạm/hố, dừng hết khi nhấc bánh /
//                  mất liên lạc / pin cạn, đếm encoder, lọc cliff 2 lần liên tiếp, cờ pin yếu
//                  ← firmware/pic16f877a_ccs/motor.c, sensors.c, main.c, config.h
//
// Dùng chung cho mọi môi trường mô phỏng (căn hộ, mặt bàn…). Đơn vị: mm, ms, rad, ‰ (−1000…1000).
// Góc theo chuẩn toán học: θ dương = quay ngược kim đồng hồ (nhìn từ trên xuống).
// =============================================================================

// ---------- config.h (ESP32-S3) ----------
export const CFG = Object.freeze({
  WHEEL_DIAMETER_MM: 70.0,
  WHEEL_BASE_MM: 235.0,
  TICKS_PER_REV: 1000.0,
  LANE_WIDTH_MM: 250.0,
  SPEED_CRUISE: 450,
  SPEED_SLOW: 250,
  SPEED_BACK: 300,
  SPEED_TURN_MAX: 380,
  SPEED_TURN_MIN: 160,
  BACKUP_MM: 60,
  AUTO_SPIRAL_MS: 20000,
  SPIRAL_MAX_RADIUS: 900.0,
  HEADING_KP: 1000.0,
  HEADING_CORR_MAX: 250,
  TURN_KP: 600.0,
  TURN_TOL_DEG: 2.5,
  ZIGZAG_MAX_REGIONS: 12,
  STUCK_MS: 3000,
  STEP_TIMEOUT_MS: 5000,
  DRIVE_PERIOD_MS: 50,
  MANUAL_TIMEOUT_MS: 500,
  PIC_LOST_MS: 300,
  FAN_DEFAULT_PCT: 70,
  VBAT_EMPTY_MV: 12800,
  VBAT_FULL_MV: 16600,
});

// ---------- config.h (PIC16F877A) ----------
export const PIC_CFG = Object.freeze({
  RAMP_STEP: 10,             // ‰ mỗi ms (0 → 1000 trong 100 ms)
  STATUS_PERIOD_MS: 20,      // STATUS 50 Hz, đo cliff + pin cùng nhịp
  DEBOUNCE_MS: 5,
  CLIFF_COUNT: 4,
  CLIFF_THRESHOLD: 60,       // hiệu ADC (tắt LED − bật LED) < 60 → "không thấy sàn"
  CLIFF_ENABLE_MASK: 0x0f,
  VBAT_LOW_MV: 13200,        // 3.30 V/cell
  VBAT_CUT_MV: 12400,        // 3.10 V/cell (chốt tới khi reset)
  VBAT_PRESENT_MV: 6000,
  COMM_TIMEOUT_MS: 300,
});

// Cờ trong khung STATUS (docs/02_GIAO_THUC.md · pic_link.h)
export const PicFlag = Object.freeze({
  BLOCK_FWD: 0x01, COMM_LOST: 0x02, LOW_BAT: 0x04, BAT_CUT: 0x08, STANDALONE: 0x10, BRUSH_MAIN: 0x20, BRUSH_SIDE: 0x40,
});

export const MODES = ['IDLE', 'MANUAL', 'AUTO', 'SPIRAL', 'ZIGZAG'];
export const MM_PER_TICK = (Math.PI * CFG.WHEEL_DIAMETER_MM) / CFG.TICKS_PER_REV;   // ≈ 0.22 mm/xung
const TURN_TOL = (CFG.TURN_TOL_DEG * Math.PI) / 180;
const DEG = Math.PI / 180;

// ---------- tiện ích ----------
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** Hiệu 2 góc, quấn về (−π, π] — giống angDiff() trong robot.cpp */
export function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}
/** Ép về số nguyên có dấu 16-bit (int16_t) — bộ đếm encoder quấn vòng ±32767 */
export const toInt16 = (v) => ((Math.trunc(v) + 32768) & 0xffff) - 32768;
const trunc16 = (v) => Math.trunc(v);   // int16_t(...) khi gán lệnh ‰ (giá trị luôn nằm trong ±1000)

// =============================================================================
// Odometry::update — định vị bằng encoder (dead reckoning)
//   tâm đi được dc = (sl + sr)/2 ; góc quay dθ = (sr − sl)/khoảng_cách_2_bánh (hoặc từ con quay IMU)
//   x += dc·cos(θ + dθ/2) ; y += dc·sin(θ + dθ/2) ; θ += dθ
// =============================================================================
export class Odometry {
  constructor() { this.reset(); }
  reset() {
    this.x = 0; this.y = 0; this.theta = 0; this.dist = 0;
    this.lastL = 0; this.lastR = 0; this.lastImu = 0; this.init = false;
  }
  resetPose() { this.x = this.y = this.theta = 0; }
  update(encL, encR, useImu = false, imuHeading = 0) {
    if (!this.init) {
      this.lastL = encL; this.lastR = encR; this.lastImu = imuHeading; this.init = true;
      return;
    }
    const dl = toInt16(encL - this.lastL);      // int16_t(encL − lastL): tự xử lý quấn vòng
    const dr = toInt16(encR - this.lastR);
    this.lastL = encL; this.lastR = encR;
    const sl = dl * MM_PER_TICK, sr = dr * MM_PER_TICK;
    const dc = 0.5 * (sl + sr);
    const dth = useImu ? imuHeading - this.lastImu : (sr - sl) / CFG.WHEEL_BASE_MM;
    this.lastImu = imuHeading;
    const mid = this.theta + 0.5 * dth;
    this.x += dc * Math.cos(mid);
    this.y += dc * Math.sin(mid);
    this.theta += dth;
    this.dist += dc;
  }
}

// =============================================================================
// Robot — máy trạng thái hành vi, cổng 1-1 từ class Robot (robot.cpp)
// st (PicStatus) = { encL, encR, bump, drop, cliff, vbat_mv, flags }
// =============================================================================
export class Robot {
  /** rng: hàm ngẫu nhiên [0,1) — truyền vào để kiểm thử lặp lại được */
  constructor(rng = Math.random) {
    this.rng = rng;
    this.mode = 'IDLE';
    this.state = 'IDLE';
    this.cmdL = 0; this.cmdR = 0;
    this.fanPct = CFG.FAN_DEFAULT_PCT;
    this.brushMain = true; this.brushSide = true;
    this.manL = 0; this.manR = 0; this.manT = 0;
    this.stepT0 = 0; this.phaseT0 = 0; this.stepDist0 = 0;
    this.turnTarget = 0; this.pendingTurn = 0;
    this.afterTurn = 'FWD'; this.pendingAfter = 'FWD';
    this.headingRef = 0; this.spiralTheta0 = 0; this.laneHeading = 0;
    this.turnLeftNext = true; this.newRegion = false; this.regions = 0;
    this.stuckDist = 0; this.stuckT = 0;
    this.prevBump = 0; this.prevCliff = 0; this.prevDrop = 0;
    this.events = [];          // hàng đợi sự kiện (firmware: vòng 8 phần tử)
  }

  // random(a, b) của Arduino: số nguyên trong [a, b)
  _random(a, b) { return a + Math.floor(this.rng() * (b - a)); }

  pushEvent(e) {
    this.events.push(e);
    if (this.events.length > 8) this.events.shift();     // đầy → bỏ cái cũ nhất
  }
  popEvent() { return this.events.length ? this.events.shift() : null; }

  stopAll() { this.cmdL = this.cmdR = 0; }
  finish(why) { this.pushEvent(why); this.mode = 'IDLE'; this.state = 'IDLE'; this.stopAll(); }
  picLost() {
    if (this.mode !== 'IDLE') this.pushEvent('PIC_LOST');
    this.mode = 'IDLE'; this.state = 'IDLE'; this.stopAll();
  }

  fanOut() { return this.mode === 'IDLE' ? 0 : this.fanPct; }
  brushMainOut() { return this.mode !== 'IDLE' && this.brushMain; }
  brushSideOut() { return this.mode !== 'IDLE' && this.brushSide; }

  setMode(m, odo, now) {
    this.mode = m;
    this.stopAll();
    switch (m) {
      case 'IDLE': this.state = 'IDLE'; break;
      case 'MANUAL': this.state = 'MANUAL'; this.manL = this.manR = 0; this.manT = now; break;
      case 'AUTO':             // giống Roomba: xoắn ốc trước, rồi va chạm-quay
      case 'SPIRAL':
        this.state = 'SPIRAL'; this.spiralTheta0 = odo.theta; this.phaseT0 = now; break;
      case 'ZIGZAG':
        this.laneHeading = odo.theta; this.turnLeftNext = true; this.newRegion = false; this.regions = 0;
        this.state = 'LANE'; this.stuckDist = odo.dist; this.stuckT = now; break;
      default: this.mode = 'IDLE'; this.state = 'IDLE';
    }
  }

  /** CHỈ dùng trong mô phỏng (không có trong firmware): vào AUTO nhưng bỏ pha xoắn ốc, đi thẳng ngay */
  debugAutoForward(odo, now) {
    this.mode = 'AUTO';
    this.startFwd(odo, now);
  }

  manualDrive(lPct, rPct, now) {
    if (this.mode === 'IDLE') { this.mode = 'MANUAL'; this.state = 'MANUAL'; }
    if (this.mode !== 'MANUAL') return;
    this.manL = trunc16(clamp(lPct, -100, 100) * 10);
    this.manR = trunc16(clamp(rPct, -100, 100) * 10);
    this.manT = now;
  }

  startBackup(turnAngle, afterTurn, odo, now) {
    this.state = 'BACKUP'; this.stepDist0 = odo.dist; this.stepT0 = now;
    this.pendingTurn = turnAngle; this.pendingAfter = afterTurn;
  }
  startTurn(angle, next, odo, now) {
    this.state = 'TURN'; this.turnTarget = odo.theta + angle;   // theta cộng dồn, không quấn
    this.afterTurn = next; this.stepT0 = now;
  }
  startFwd(odo, now) {
    this.state = 'FWD'; this.headingRef = odo.theta; this.stuckDist = odo.dist; this.stuckT = now;
  }
  driveHeading(speed, heading, odo) {
    const err = angDiff(heading, odo.theta);    // dương → cần quay trái
    const corr = clamp(err * CFG.HEADING_KP, -CFG.HEADING_CORR_MAX, CFG.HEADING_CORR_MAX);
    this.cmdL = trunc16(speed - corr);
    this.cmdR = trunc16(speed + corr);
  }
  // Va trái → quay phải (góc âm), va phải → quay trái, còn lại ngẫu nhiên. 100°…170°
  randomTurnAngle(bump) {
    const mag = this._random(100, 171) * DEG;
    if (bump === 0x01) return -mag;
    if (bump === 0x02) return mag;
    return this._random(0, 2) ? mag : -mag;
  }

  /** Gọi mỗi khi có STATUS mới từ PIC (~50 Hz) */
  step(st, odo, now) {
    // --- Sự kiện (cạnh lên) ---
    if (st.bump & ~this.prevBump) this.pushEvent(st.bump === 0x01 ? 'BUMP_L' : st.bump === 0x02 ? 'BUMP_R' : 'BUMP_C');
    if (st.cliff && !this.prevCliff) this.pushEvent('CLIFF');
    if (st.drop && !this.prevDrop) this.pushEvent('LIFTED');
    this.prevBump = st.bump; this.prevCliff = st.cliff; this.prevDrop = st.drop;

    if (this.mode === 'IDLE') { this.stopAll(); return; }

    // --- An toàn mức cao (PIC đã tự xử lý mức thấp) ---
    if (st.drop) { this.mode = 'IDLE'; this.state = 'IDLE'; this.stopAll(); return; }
    if ((st.flags & (PicFlag.LOW_BAT | PicFlag.BAT_CUT)) && this.mode !== 'MANUAL') { this.finish('LOWBAT'); return; }

    let hit = !!(st.bump || st.cliff);

    // Phát hiện kẹt khi đang tiến (bánh quay nhưng robot không đi được — theo ODOMETRY!)
    if (this.state === 'FWD' || this.state === 'LANE') {
      if (Math.abs(odo.dist - this.stuckDist) > 20) { this.stuckDist = odo.dist; this.stuckT = now; }
      else if (now - this.stuckT > CFG.STUCK_MS) { this.pushEvent('STUCK'); hit = true; this.stuckT = now; }
    }

    switch (this.state) {
      case 'MANUAL':
        if (now - this.manT > CFG.MANUAL_TIMEOUT_MS) this.manL = this.manR = 0;   // "người chết": mất lệnh → dừng
        this.cmdL = this.manL; this.cmdR = this.manR;
        break;

      case 'SPIRAL': {
        // Xoắn ốc Archimedes: bán kính tăng thêm 1 làn quét sau mỗi vòng
        const phi = Math.abs(odo.theta - this.spiralTheta0);
        const R = 0.5 * CFG.WHEEL_BASE_MM + (CFG.LANE_WIDTH_MM * phi) / (2 * Math.PI);
        if (hit) {
          if (this.mode === 'SPIRAL') this.finish('SPIRAL_DONE');
          else this.startBackup(this.randomTurnAngle(st.bump), 'FWD', odo, now);
          break;
        }
        if (R > CFG.SPIRAL_MAX_RADIUS || (this.mode === 'AUTO' && now - this.phaseT0 > CFG.AUTO_SPIRAL_MS)) {
          if (this.mode === 'SPIRAL') this.finish('SPIRAL_DONE');
          else this.startFwd(odo, now);
          break;
        }
        // Bánh ngoài (phải) chạy CRUISE, bánh trong (trái) chậm hơn theo tỉ lệ bán kính
        const ratio = (R - 0.5 * CFG.WHEEL_BASE_MM) / (R + 0.5 * CFG.WHEEL_BASE_MM);
        this.cmdR = CFG.SPEED_CRUISE;
        this.cmdL = trunc16(CFG.SPEED_CRUISE * ratio);
        break;
      }

      case 'FWD':
        if (hit) { this.startBackup(this.randomTurnAngle(st.bump), 'FWD', odo, now); break; }
        this.driveHeading(CFG.SPEED_CRUISE, this.headingRef, odo);
        break;

      case 'BACKUP':
        this.cmdL = this.cmdR = -CFG.SPEED_BACK;
        if (this.stepDist0 - odo.dist >= CFG.BACKUP_MM || now - this.stepT0 > 1500) {
          this.startTurn(this.pendingTurn, this.pendingAfter, odo, now);
        }
        break;

      case 'TURN': {
        const err = this.turnTarget - odo.theta;
        if (Math.abs(err) < TURN_TOL || now - this.stepT0 > CFG.STEP_TIMEOUT_MS) {
          this.stopAll();
          if (this.afterTurn === 'SHIFT') {
            this.state = 'SHIFT'; this.headingRef = this.turnTarget; this.stepDist0 = odo.dist; this.stepT0 = now;
          } else if (this.afterTurn === 'LANE') {
            if (this.newRegion) { this.laneHeading = odo.theta; this.turnLeftNext = true; this.newRegion = false; }
            this.state = 'LANE'; this.stuckDist = odo.dist; this.stuckT = now;
          } else {
            this.startFwd(odo, now);
          }
          break;
        }
        const s = clamp(Math.abs(err) * CFG.TURN_KP, CFG.SPEED_TURN_MIN, CFG.SPEED_TURN_MAX);
        if (err > 0) { this.cmdL = trunc16(-s); this.cmdR = trunc16(s); }    // quay trái (CCW)
        else { this.cmdL = trunc16(s); this.cmdR = trunc16(-s); }            // quay phải (CW)
        break;
      }

      case 'LANE':
        // Đi hết luống → lùi một chút → quay 90° → dịch sang luống mới
        if (hit) { this.startBackup(this.turnLeftNext ? Math.PI / 2 : -Math.PI / 2, 'SHIFT', odo, now); break; }
        this.driveHeading(CFG.SPEED_CRUISE, this.laneHeading, odo);
        break;

      case 'SHIFT':
        if (hit || now - this.stepT0 > CFG.STEP_TIMEOUT_MS) {
          // Không dịch sang luống mới được (góc phòng / vật cản) → hết vùng này
          this.pushEvent('ZIG_NEW_REGION');
          if (++this.regions >= CFG.ZIGZAG_MAX_REGIONS) { this.finish('ZIGZAG_DONE'); break; }
          this.newRegion = true;
          this.startBackup(this.randomTurnAngle(st.bump), 'LANE', odo, now);
          break;
        }
        if (odo.dist - this.stepDist0 >= CFG.LANE_WIDTH_MM) {
          const a = this.turnLeftNext ? Math.PI / 2 : -Math.PI / 2;
          this.laneHeading += this.turnLeftNext ? Math.PI : -Math.PI;   // luống mới ngược chiều luống cũ
          this.turnLeftNext = !this.turnLeftNext;
          this.startTurn(a, 'LANE', odo, now);
          break;
        }
        this.driveHeading(CFG.SPEED_SLOW, this.headingRef, odo);
        break;

      default:
        this.stopAll();
    }
  }
}

// =============================================================================
// PicMcu — tầng thấp PIC16F877A: an toàn + ramp + encoder + cliff + pin
// Gọi tick(dtMs, inputs) theo bước thời gian cố định (vd 10 ms). Ramp tính đúng 10 ‰ cho MỖI ms.
// inputs = { bumpRaw, dropRaw (bit0 trái, bit1 phải), cliffAdc: [4 giá trị hiệu ADC], vbatMv }
// =============================================================================
export class PicMcu {
  constructor() { this.reset(); }
  reset() {
    this.targetL = 0; this.targetR = 0;
    this.appliedL = 0; this.appliedR = 0;
    this.encTotalL = 0; this.encTotalR = 0;          // int16 quấn vòng
    this.lastSignL = 1; this.lastSignR = 1;
    this._pulseAccL = 0; this._pulseAccR = 0;        // phần lẻ xung (vật lý → số nguyên)
    this.bumpMask = 0; this.dropMask = 0; this.cliffMask = 0;
    this.cliffRaw = [0, 0, 0, 0]; this.cliffHits = [0, 0, 0, 0];
    this.cliffThreshold = PIC_CFG.CLIFF_THRESHOLD;
    this.cliffEnableMask = PIC_CFG.CLIFF_ENABLE_MASK;
    this.safetyMask = 0x07;                          // bit0 bumper, bit1 cliff, bit2 nhấc bánh
    this.vbatMv = 0; this.vbatLow = false; this.vbatCut = false;
    this.blockFwd = false; this.stopAll = false;
    this.commMs = 0; this.commEver = false; this.commLost = true;
    this.brushMain = false; this.brushSide = false;
    this._dbCnt = [0, 0, 0, 0]; this._dbState = [0, 0, 0, 0];
    this._fastAcc = 0; this.seq = 0;
  }

  /** Khung DRIVE từ ESP32 (motor_set: kẹp ±1000) — cũng là heartbeat */
  setDrive(l, r) {
    this.targetL = clamp(Math.trunc(l), -1000, 1000);
    this.targetR = clamp(Math.trunc(r), -1000, 1000);
    this.commMs = 0; this.commEver = true;
  }
  setAux(mainOn, sideOn) { this.brushMain = !!mainOn; this.brushSide = !!sideOn; }

  /** Xung encoder thực (không dấu — encoder Hall 1 kênh không biết chiều). PIC gán dấu theo chiều đang xuất. */
  addPulses(pL, pR) {
    this._pulseAccL += Math.abs(pL); this._pulseAccR += Math.abs(pR);
    const nL = Math.floor(this._pulseAccL), nR = Math.floor(this._pulseAccR);
    this._pulseAccL -= nL; this._pulseAccR -= nR;
    if (this.appliedL > 0) this.lastSignL = 1; else if (this.appliedL < 0) this.lastSignL = -1;
    if (this.appliedR > 0) this.lastSignR = 1; else if (this.appliedR < 0) this.lastSignR = -1;
    this.encTotalL = toInt16(this.encTotalL + this.lastSignL * nL);
    this.encTotalR = toInt16(this.encTotalR + this.lastSignR * nR);
  }

  // chống dội: phải ổn định DEBOUNCE_MS mới đổi
  _db(i, raw, dtMs) {
    if (raw !== this._dbState[i]) {
      this._dbCnt[i] += dtMs;
      if (this._dbCnt[i] >= PIC_CFG.DEBOUNCE_MS) { this._dbState[i] = raw; this._dbCnt[i] = 0; }
    } else this._dbCnt[i] = 0;
    return this._dbState[i];
  }

  /** cliff_update(): 2 lần liên tiếp dưới ngưỡng mới báo "hố" */
  _cliffUpdate(adc) {
    let m = 0;
    for (let i = 0; i < PIC_CFG.CLIFF_COUNT; i++) {
      const v = Math.max(0, Math.min(1023, Math.round(adc?.[i] ?? 1023)));
      this.cliffRaw[i] = v;
      if (v < this.cliffThreshold) { if (this.cliffHits[i] < 2) this.cliffHits[i]++; }
      else this.cliffHits[i] = 0;
      if (this.cliffHits[i] >= 2 && ((this.cliffEnableMask >> i) & 1)) m |= 1 << i;
    }
    this.cliffMask = m;
  }

  /** vbat_update(): lọc trung bình trượt 1/8, trễ 0.3 V cho cờ yếu, cờ cắt chốt */
  _vbatUpdate(mv) {
    if (!this.vbatMv) this.vbatMv = mv; else this.vbatMv = (this.vbatMv * 7 + mv) / 8;
    if (this.vbatMv < PIC_CFG.VBAT_PRESENT_MV) { this.vbatLow = false; return; }
    if (this.vbatMv < PIC_CFG.VBAT_LOW_MV) this.vbatLow = true;
    else if (this.vbatMv > PIC_CFG.VBAT_LOW_MV + 300) this.vbatLow = false;
    if (this.vbatMv < PIC_CFG.VBAT_CUT_MV) this.vbatCut = true;
  }

  /**
   * Chạy PIC dtMs mili-giây. Trả về true nếu tới lượt gửi STATUS (mỗi 20 ms).
   */
  tick(dtMs, inp) {
    // ----- ngắt 1 ms: bumper/nhấc bánh (chống dội) -----
    const bump = (this._db(0, inp.bumpRaw & 1 ? 1 : 0, dtMs) ? 1 : 0) | (this._db(1, inp.bumpRaw & 2 ? 1 : 0, dtMs) ? 2 : 0);
    const drop = (this._db(2, inp.dropRaw & 1 ? 1 : 0, dtMs) ? 1 : 0) | (this._db(3, inp.dropRaw & 2 ? 1 : 0, dtMs) ? 2 : 0);
    this.bumpMask = bump; this.dropMask = drop;

    // ----- việc định kỳ 20 ms: cliff + pin -----
    let statusDue = false;
    this._fastAcc += dtMs;
    if (this._fastAcc >= PIC_CFG.STATUS_PERIOD_MS) {
      this._fastAcc -= PIC_CFG.STATUS_PERIOD_MS;
      this._cliffUpdate(inp.cliffAdc);
      this._vbatUpdate(inp.vbatMv ?? 15000);
      statusDue = true;
    }

    // ----- liên lạc với ESP32 -----
    this.commMs += dtMs;                                  // setDrive() (khung DRIVE mới) đặt lại về 0
    const wasLost = this.commLost;
    this.commLost = !this.commEver || this.commMs > PIC_CFG.COMM_TIMEOUT_MS;
    if (this.commLost && !wasLost) { this.targetL = this.targetR = 0; this.brushMain = this.brushSide = false; }

    // ----- luật an toàn (main.c) -----
    const sm = this.safetyMask;
    this.blockFwd = (this.bumpMask !== 0 && !!(sm & 1)) || (this.cliffMask !== 0 && !!(sm & 2));
    this.stopAll = (this.dropMask !== 0 && !!(sm & 4)) || this.vbatCut || this.commLost;
    if (this.dropMask !== 0 && (sm & 4)) this.brushMain = this.brushSide = false;   // bị nhấc lên → tắt chổi

    // ----- motor_tick_1ms() × dtMs: phản xạ tức thì + ramp -----
    let tl = this.targetL, tr = this.targetR;
    if (this.stopAll) { tl = 0; tr = 0; this.appliedL = 0; this.appliedR = 0; }       // dừng khẩn: cắt ngay
    if (this.blockFwd) {
      if (tl > 0) tl = 0; if (tr > 0) tr = 0;
      if (this.appliedL > 0) this.appliedL = 0; if (this.appliedR > 0) this.appliedR = 0;  // cấm tiến: cắt ngay
    }
    const stepMax = PIC_CFG.RAMP_STEP * dtMs;
    const ramp = (c, t) => (c < t ? Math.min(t, c + stepMax) : Math.max(t, c - stepMax));
    this.appliedL = ramp(this.appliedL, tl);
    this.appliedR = ramp(this.appliedR, tr);
    return statusDue;
  }

  /** Khung STATUS gửi lên ESP32 */
  status() {
    let f = 0;
    if (this.blockFwd) f |= PicFlag.BLOCK_FWD;
    if (this.commLost) f |= PicFlag.COMM_LOST;
    if (this.vbatLow) f |= PicFlag.LOW_BAT;
    if (this.vbatCut) f |= PicFlag.BAT_CUT;
    if (this.brushMain) f |= PicFlag.BRUSH_MAIN;
    if (this.brushSide) f |= PicFlag.BRUSH_SIDE;
    this.seq = (this.seq + 1) & 0xff;
    return {
      encL: this.encTotalL, encR: this.encTotalR,
      bump: this.bumpMask, drop: this.dropMask, cliff: this.cliffMask,
      vbat_mv: Math.round(this.vbatMv), flags: f, seq: this.seq,
    };
  }
}

// =============================================================================
// Mô hình cảm biến chống rơi IR (phản xạ) — để môi trường tính "hiệu ADC" giống cliff_update()
//   v ≈ K · ρ · ((h0 + d0)/(d + d0))²   (cường độ phản xạ giảm theo bình phương khoảng cách)
//   ρ: hệ số phản xạ hồng ngoại của mặt sàn (gỗ sáng ~0.6, gạch trắng ~0.8, thảm tối ~0.3, mặt bàn đen ~0.06)
//   d: khoảng cách từ mắt cảm biến tới mặt phản xạ (mm). Sàn phẳng d = h0 = 12 mm.
// =============================================================================
export const CLIFF_MODEL = Object.freeze({ K: 620, RHO_REF: 0.8, H0: 12, D0: 15 });
export function cliffAdc(rho, d, { sun = false, crosstalk = 0, noise = 0 } = {}) {
  const { K, RHO_REF, H0, D0 } = CLIFF_MODEL;
  const dd = Math.max(0, d);
  let v = K * (rho / RHO_REF) * ((H0 + D0) / (dd + D0)) ** 2;
  if (sun) v = 4;                 // nắng làm bão hòa phototransistor: tắt/bật LED đều ~0 V → hiệu ≈ 0
  v = v * (crosstalk ? 0.4 : 1) + crosstalk;     // bụi trên kính: ánh sáng dội ngược trong vỏ → luôn "thấy sàn"
  v += noise;
  return Math.max(0, Math.min(1023, v));
}

// =============================================================================
// Pin 4S Li-ion: điện áp hở mạch theo % dung lượng (đường cong OCV 1 cell điển hình)
// =============================================================================
const OCV = [[0, 3.0], [0.03, 3.25], [0.08, 3.4], [0.15, 3.5], [0.3, 3.62], [0.5, 3.72], [0.7, 3.85], [0.9, 4.02], [1, 4.15]];
export function cellOcv(soc) {
  const s = clamp(soc, 0, 1);
  for (let i = 1; i < OCV.length; i++) {
    if (s <= OCV[i][0]) {
      const [s0, v0] = OCV[i - 1], [s1, v1] = OCV[i];
      return v0 + ((v1 - v0) * (s - s0)) / (s1 - s0);
    }
  }
  return OCV[OCV.length - 1][1];
}
