// Mỏ hàn bút (kiểu trạm 936/888) — dài 190 mm, ống nhiệt inox, đai ốc khía, tay cầm cao su gân vòng, MŨI RỜI ĐỔI ĐƯỢC
// (mũi T18/900M: B, B05, I, 1C–4C, D16/D24/D32, K, J — items/tools/_tips.js; mặc định D16 "lựa chọn số 1 cho THT", docs/07 §1.2).
//
// Mô hình nhiệt 2 khối (docs/07 §12–13 [TK]):
//   • THÂN (lõi gia nhiệt + ống + phần gốc mũi, Cb ≈ 3.06 J/K): bộ điều nhiệt của trạm giữ ở nhiệt độ đặt (τ theo loại trạm:
//     936 ≈ 20 s, FX-888D ≈ 9 s, T12 ≈ 4 s — §1.1, §9) với công suất tối đa 70–75 W.
//   • ĐẦU MŨI làm việc (Cw = 0.30·nhiệt_khối J/K, B = 0.3 J/K) nối với thân qua K = 0.25·m^0.8 W/K (mũi tích hợp T12 ×2.6).
//     Mối hàn hút nhiệt (load) làm ĐẦU MŨI tụt — mũi nhỏ tụt sâu & hồi chậm, mũi to giữ nhiệt (§1.3 "thermal mass beats temperature").
//   state.tipTemp = nhiệt độ ĐẦU MŨI (hiển thị, dùng cho mối hàn) · state.bodyTemp = nhiệt thân (cảm biến).
// Sleep mode: cắm mỏ vào giá > 20 s → hạ về 180 °C (dưới điểm chảy thiếc; JBC: tuổi thọ mũi tới 5× [V][11]); nhấc ra → lên lại.
// Oxy hoá mũi ∝ exp((T − 350)/50) (§12), ×4.5 khi đã dính thiếc không chì (§2.5 [V][5b]); lớp thiếc (tinned > 0.25) bảo vệ ×0.08.
// Không có mũi → không hàn được (minigames/solder-pro.js quản lý tháo/lắp mũi).
import {
  THREE, mats, own, latheZ, flutedLatheZ, tube, M, G, dyn, decal, finish, text, FONT,
  emit, play, labState, AMBIENT_C, targetOf, tipWorld, clamp,
} from './_kit.js';
import { tipGeometry, tipEndZ, paintTip } from './_tips.js';
import { STATIONS, DEFAULT_TIP, tipThermal } from '../../minigames/_solder_kb.js';

const AXIS = 11.5;           // độ cao trục khi nằm trên bàn (bán kính gờ chắn ngón)
const Z_BACK = 95;           // đuôi (dây) ở +Z, mũi ở −Z
const C_BODY = 3.06;         // J/K — lõi gia nhiệt + ống + gốc mũi (cộng đầu mũi D16 0.54 J/K = 3.6 J/K như mô hình cũ)
const TAU_COOL = 90;         // s — nguội tự nhiên
const S_TIP0 = 190 - 39.9;   // khoảng cách từ đuôi tới ĐÁY mũi (trùng CAD cad/src/lab/soldering_iron.py)
const SLEEP_AFTER = 20, SLEEP_T = 180;
const GLOW = new THREE.Color(1, 0.28, 0.06);

function build(game) {
  const K = mats(game);
  const root = new THREE.Group();
  // giảm căng dây (cao su có gân)
  const relief = [[0, 0], [3.3, 0]];
  for (let k = 0; k < 8; k++) { const s = 1 + k * 3, r = 3.4 + (k / 8) * 2.4; relief.push([r, s], [r + 0.55, s + 1], [r + 0.55, s + 2], [r, s + 3]); }
  relief.push([5.6, 25], [0, 25]);
  root.add(M(latheZ(relief, { seg: 20, zBack: Z_BACK, axisY: AXIS }), K.rubber));
  // thân sau
  root.add(M(latheZ([[0, 23], [5.6, 23], [7.4, 27], [8.4, 38], [9.0, 56], [9.3, 64], [0, 64]], { seg: 32, zBack: Z_BACK, axisY: AXIS }), K.absDark));
  // tay cầm cao su gân vòng
  const grip = [[0, 63], [9.4, 63]];
  for (let s = 64; s <= 120; s += 1.5) grip.push([9.8 + 0.45 * Math.sin(((s - 64) / 4) * Math.PI * 2) * (s > 70 && s < 116 ? 1 : 0.2) + (s - 64) * 0.008, s]);
  grip.push([10.4, 121], [0, 121]);
  root.add(M(latheZ(grip, { seg: 40, zBack: Z_BACK, axisY: AXIS }), K.foam));
  // vòng màu nhận diện + gờ chắn ngón chịu nhiệt
  root.add(M(latheZ([[0, 120], [10.6, 120], [10.6, 122.5], [0, 122.5]], { seg: 40, zBack: Z_BACK, axisY: AXIS }), K.absBlue));
  root.add(M(latheZ([[0, 122.5], [10.2, 122.5], [11.5, 124], [11.5, 126.5], [8.6, 128.5], [7.4, 131], [0, 131]], { seg: 40, zBack: Z_BACK, axisY: AXIS }), K.absBlack));
  // đai ốc khía nhám (giữ ống nhiệt + mũi)
  root.add(M(flutedLatheZ([[0, 0, 0], [6.9, 0, 0], [6.9, 0.6, 1], [6.9, 9.2, 1], [6.3, 10.6, 0], [4.6, 12.6, 0], [4.2, 13, 0], [0, 13, 0]],
    { flutes: 36, depth: 0.07, seg: 108, sharp: 2 }, { zBack: Z_BACK - 130, axisY: AXIS }), K.chrome));
  // ống nhiệt inox
  const sleeveMat = own(K.stainless);
  root.add(dyn(M(latheZ([[0, 142], [3.95, 142], [3.85, 160], [3.6, 168], [0, 168]], { seg: 24, zBack: Z_BACK, axisY: AXIS }), sleeveMat, { name: 'sleeve' })));
  // mũi: thân mạ sắt-niken + đầu tráng thiếc
  const shankMat = own(K.nickel);
  const tipMat = own(K.tin);
  // mũi rời: nhóm động đổi hình theo mã mũi (setTip). Bản dựng cũ (côn + thân) chỉ giữ làm vật liệu, ẩn đi.
  const tipHolder = new THREE.Group();
  tipHolder.name = 'tip-holder';
  tipHolder.position.set(0, AXIS, Z_BACK - S_TIP0);
  tipHolder.rotation.y = Math.PI;                    // trục +Z của mũi → −Z (hướng mũi mỏ hàn)
  tipHolder.userData.keepWithCad = true;             // vẫn hiện khi GLB mỏ hàn nạp (engine/items.js)
  tipHolder.userData.dynamic = true;
  root.add(tipHolder);
  // dây ra trạm
  root.add(M(tube([[0, AXIS, Z_BACK], [0, AXIS - 1, Z_BACK + 18], [3, AXIS - 6, Z_BACK + 40], [6, 3, Z_BACK + 62]], 2.6, { seg: 24, radial: 8 }), K.rubber));
  const cableAnchor = new THREE.Object3D();
  cableAnchor.position.set(6, 3, Z_BACK + 62);
  cableAnchor.userData.dir = new THREE.Vector3(0.1, -0.1, 1).normalize();
  root.add(cableAnchor);
  // nhãn in trên thân
  const lab = decal(22, 5.2, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    text(g, 'RVL · 60 W · 24 V', W / 2, H / 2, { size: H * 0.72, color: '#e8ecef', align: 'center', bold: true, font: FONT });
  }, { x: 0, y: AXIS + 8.95, z: Z_BACK - 45, rx: -Math.PI / 2 + 0.03, ry: 0, rz: Math.PI / 2 });
  if (lab) root.add(lab);
  // điểm đầu mũi (để hàn/đo)
  const tipObject = new THREE.Object3D();
  tipObject.position.set(0, AXIS, Z_BACK - 190);
  root.add(tipObject);
  finish(root, 'soldering-iron');
  root.userData.tipObject = tipObject;
  root.userData.cableAnchor = cableAnchor;
  root.userData.parts = { tipMat, shankMat, sleeveMat, tipHolder };
  return root;
}

const def = {
  id: 'soldering-iron', name: 'Mỏ hàn', kind: 'tool', category: 'tool', lessonId: null, icon: '🔥',
  massG: 48, size: [23, 23, 190],
  desc: 'Mỏ hàn bút 60 W nối trạm hàn. Cầm như cầm bút, chạm mũi vào CẢ pad và chân linh kiện 1–2 s rồi mới đưa thiếc vào chỗ tiếp xúc.',
  build,
  grip: { pose: 'holdTool:iron', hand: 'right', offset: [0, -AXIS, -(Z_BACK - 100)], rot: [0, 0, 0] },
  tool: {
    kind: 'iron',
    tip: [0, AXIS, Z_BACK - 190],
    onUseStart(ctx) {
      const inst = ctx.instance, s = inst.state, T = targetOf(ctx);
      const cleaner = T.data('ironCleaner');
      s.touching = true;
      if (cleaner) { def.clean(inst, cleaner, ctx.game, T.object); s.wipeT = 0; return; }
      const pos = tipWorld(inst);
      emit(ctx.game, 'iron:touch', { instance: inst, target: T.object, item: T.item, pos, temp: s.tipTemp, wetting: def.wetting(inst) });
      if (s.tipTemp > 200 && T.data('burnable')) {
        emit(ctx.game, 'fault', { kind: 'burn', item: T.item, target: T.object, by: inst, temp: s.tipTemp });
        play(ctx.game, 'sizzle', { pos });
        ctx.game?.fx?.smoke?.(pos, { size: 4, duration: 1.2, color: 0x555555 });
      }
    },
    onUseHold(ctx, dt) {
      const inst = ctx.instance, s = inst.state, T = targetOf(ctx);
      const cleaner = T.data('ironCleaner');
      if (cleaner) {
        s.wipeT = (s.wipeT || 0) + dt;
        if (s.wipeT > 0.45) { s.wipeT = 0; def.clean(inst, cleaner, ctx.game, T.object); }
        return;
      }
      emit(ctx.game, 'iron:hold', { instance: inst, target: T.object, item: T.item, dt, pos: tipWorld(inst), temp: s.tipTemp, wetting: def.wetting(inst) });
    },
    onUseEnd(ctx) {
      const inst = ctx.instance;
      inst.state.touching = false;
      emit(ctx.game, 'iron:lift', { instance: inst, pos: tipWorld(inst), temp: inst.state.tipTemp });
    },
    hud(inst) {
      const s = inst.state;
      const T = Math.round(s.tipTemp ?? AMBIENT_C);
      if (!s.tip) return `Mỏ hàn — CHƯA LẮP MŨI (T: lắp mũi trên giá)${s.stationOn ? ' · trạm đang bật!' : ''}`;
      const ox = s.oxidation > 0.6 ? ' · mũi đen (lau + phủ thiếc!)' : s.oxidation > 0.3 ? ' · mũi hơi bẩn' : s.tinned < 0.25 && T > 200 ? ' · mũi chưa phủ thiếc!' : '';
      const sl = s.sleeping ? ' · SLEEP' : '';
      return `Mỏ hàn [${s.tip}] ${T} °C${s.stationOn ? ` → ${s.setpoint} °C` : ' (trạm tắt)'}${sl}${ox}`;
    },
  },

  init(inst, game) {
    const st = labState(game).station;
    const s = inst.state;
    const keep = (k, v) => { if (s[k] == null) s[k] = v; };
    keep('tip', DEFAULT_TIP);
    keep('tipTemp', AMBIENT_C); keep('bodyTemp', s.tipTemp); keep('oxidation', 0.05); keep('tinned', 0.6);
    keep('tipAlloy', 'Sn63Pb37'); keep('loadW', 0); keep('holsterT', 0);
    Object.assign(s, { touching: false, setpoint: st.setpoint, stationOn: st.on, heaterW: 0, sleeping: false });
    inst.object.userData.tipMat = inst.object.userData.parts?.tipMat;
    def.setTip(inst, s.tip);
  },

  update(inst, dt, game) {
    const lab = labState(game), st = lab.station, s = inst.state;
    if (!(dt > 0)) return;
    const Ta = lab.ambient;
    const on = !!st.on && st.plugged !== false;
    const kind = STATIONS[st.kind] ? st.kind : '936';
    const S = STATIONS[kind];
    s.stationOn = on; s.setpoint = st.setpoint; s.station = kind;
    if (s._shownTip !== s.tip) def.setTip(inst, s.tip);
    // sleep mode: mỏ nằm trên giá (khe 'iron-holder') quá SLEEP_AFTER giây
    const sock = inst.socket ? game?.sockets?.get?.(inst.socket) : null;
    const holstered = !!sock && /holder/.test(sock.kind || '');
    s.holsterT = holstered ? (s.holsterT || 0) + dt : 0;
    s.sleeping = on && st.sleep !== false && s.holsterT > (st.sleepAfter ?? SLEEP_AFTER);
    const target = s.sleeping ? Math.min(st.setpoint, st.sleepTemp ?? SLEEP_T) : st.setpoint;
    // nhiệt 2 khối — bước nhỏ để ổn định khi dt lớn
    const th = s.tip ? tipThermal(s.tip, kind) : { Cw: 0.05, K: 0.05 };
    const Cb = C_BODY * (S.cMul ?? 1), Cw = th.Cw, K = th.K;
    if (!Number.isFinite(s.bodyTemp)) s.bodyTemp = s.tipTemp;
    const steps = Math.max(1, Math.ceil(dt / 0.02)), h = dt / steps;
    let P = 0;
    // cảm biến: trong lõi gia nhiệt (mũi lồng ống) hoặc sát đầu mũi (T12/JBC, sense 0.7). Trạm đã hiệu chỉnh (§9 "adjustment
    // mode") để ĐẦU MŨI đúng nhiệt độ đặt khi chạy không tải → bù độ chênh thân–mũi lúc không tải.
    const sense = S.sense || 0;
    const tSet = target + (1 - sense) * (((target - Ta) * Cw) / TAU_COOL) / K;
    for (let k = 0; k < steps; k++) {
      const Tb = s.bodyTemp, Tw = s.tipTemp;
      const lossB = ((Tb - Ta) * Cb) / TAU_COOL, lossW = ((Tw - Ta) * Cw) / TAU_COOL;
      const Ts = Tb + sense * (Tw - Tb);
      P = on ? clamp(((tSet - Ts) * (Cb + Cw)) / S.tau + lossB + lossW, 0, S.pMax) : 0;
      const q = K * (Tb - Tw);
      s.bodyTemp = Tb + ((P - lossB - q) / Cb) * h;
      s.tipTemp = Tw + ((q - lossW - (s.tip ? s.loadW : 0)) / Cw) * h;
    }
    s.tipTemp = clamp(s.tipTemp, Ta - 5, 520);
    s.bodyTemp = clamp(s.bodyTemp, Ta - 5, 520);
    s.heaterW = P;
    s.loadW *= Math.exp(-dt * 6);          // tải phải được minigame "làm mới" mỗi khung
    st.ironTemp = s.tipTemp; st.ironAge = 0; st.heaterDuty = P / S.pMax;
    // oxy hoá & lớp thiếc (docs/07 §2.5, §2.6, §12)
    if (s.tip && s.tipTemp > 200) {
      const lf = /sac|lead.?free/i.test(s.tipAlloy || '') ? 4.5 : 1;
      const prot = s.tinned > 0.25 ? 0.08 : 1;
      s.oxidation = Math.min(1, s.oxidation + 0.008 * Math.exp((s.tipTemp - 350) / 50) * lf * prot * dt);
      s.tinned = Math.max(0, s.tinned - 0.003 * Math.exp((s.tipTemp - 350) / 100) * dt);
    }
    // hình ảnh: màu oxy hoá + phát sáng khi > 250 °C
    const P_ = inst.object.userData.parts;
    if (P_) {
      const glow = clamp((s.tipTemp - 250) / 200, 0, 1);
      paintTip(P_.tipMat, { oxidation: s.oxidation, tinned: s.tinned, temp: s.tipTemp });
      P_.shankMat.emissive.copy(GLOW);
      P_.shankMat.emissiveIntensity = glow * 1.1;
      P_.sleeveMat.emissive.setRGB(0.6, 0.18, 0.04);
      P_.sleeveMat.emissiveIntensity = clamp((s.bodyTemp - 250) / 200, 0, 1) * 0.25;
      // GLB mỏ hàn (nếu có): ẩn node 'tip' mặc định (mũi B) — mũi thật do tipHolder vẽ
      const cad = inst.object.userData.cad;
      if (cad && !inst._cadTipHidden) {
        inst._cadTipHidden = true;
        cad.traverse((o) => { if (/^tip($|_)/i.test(o.name || '') && !o.userData.keepWithCad) o.traverse((m) => m.layers.set(31)); });
      }
    }
  },

  /** Lắp (code) / tháo (null) mũi — chỉ đổi hình + điểm làm việc; quy trình & an toàn ở minigames/solder-pro.js */
  setTip(inst, code) {
    const s = inst.state, P = inst.object?.userData?.parts;
    s.tip = code || null;
    s._shownTip = s.tip;
    if (!P?.tipHolder) return;
    const H = P.tipHolder;
    for (const c of [...H.children]) H.remove(c);
    const tipObject = inst.object.userData.tipObject;
    if (code) {
      const g = tipGeometry(code, { workMat: P.tipMat, bodyMat: P.shankMat });
      g.traverse((o) => { o.userData.keepWithCad = true; });
      H.add(g);
      if (tipObject) tipObject.position.z = Z_BACK - S_TIP0 - tipEndZ(code);
    } else if (tipObject) tipObject.position.z = Z_BACK - S_TIP0 - 2;
  },

  // ---- API cho minigame hàn (minigames/soldering.js)
  /** Hệ số thấm ướt của mũi 0..1 (mũi sạch, có thiếc = tốt; không có mũi = 0) */
  wetting(inst) { const s = inst.state; if (!s.tip) return 0; return clamp((1 - s.oxidation) * (0.6 + 0.4 * Math.min(1, s.tinned + 0.3)), 0, 1); },
  /** Mối hàn hút nhiệt: watts (gọi mỗi khung khi mũi chạm pad) */
  load(inst, watts) { inst.state.loadW = Math.max(inst.state.loadW, watts); },
  /** Tráng thiếc lên mũi (thiếc chạm mũi nóng) */
  tin(inst, amount = 0.3, game = null, alloy = null) {
    const s = inst.state;
    if (!s.tip || s.tipTemp < 190) return false;
    s.tinned = Math.min(1, s.tinned + amount);
    s.oxidation = Math.max(0, s.oxidation * 0.85 - 0.02);
    if (alloy) s.tipAlloy = alloy;
    s.lastTinT = game?.time?.now ?? 0;
    emit(game, 'iron:tinned', { instance: inst, tinned: s.tinned, tip: s.tip });
    return true;
  },
  /** Mũi chạm thiếc lỏng có nhựa thông của mối hàn → tự được thấm thiếc (gọi mỗi bước, không phát sự kiện) */
  wetFromJoint(inst, dt, fluxy = true, alloy = null) {
    const s = inst.state;
    if (!s.tip) return;
    s.tinned = Math.min(1, s.tinned + (fluxy ? 0.1 : 0.04) * dt);
    if (fluxy) s.oxidation = Math.max(0, s.oxidation - 0.04 * dt);
    if (alloy) s.tipAlloy = alloy;
  },
  /** Lau mũi: 'sponge' (bọt biển — cần ướt) | 'brass' (bùi nhùi đồng) — docs/07 §2.4 */
  clean(inst, kind = 'sponge', game = null, target = null) {
    const s = inst.state;
    const wet = target?.userData?.wet !== false;
    if (kind === 'brass') { s.oxidation *= 0.6; s.tinned *= 0.95; s.tipTemp -= 2; }      // giữ lớp thiếc, không sụt nhiệt [V][5][12]
    else if (wet) { s.oxidation *= 0.4; s.tinned *= 0.6; s.tipTemp -= 10; s.spongeT = game?.time?.now ?? 0; s.thermalShocks = (s.thermalShocks || 0) + 1; }   // sốc nhiệt [S][30]
    else { s.oxidation *= 0.8; s.tinned *= 0.7; }
    const pos = tipWorld(inst);
    if (s.tipTemp > 150) play(game, kind === 'brass' ? 'click' : 'hiss', { pos, vol: 0.5 });
    if (kind !== 'brass' && wet && s.tipTemp > 150) game?.fx?.smoke?.(pos, { size: 3, duration: 0.5, rate: 18, color: 0xdddddd });
    s.lastWipeT = game?.time?.now ?? 0;
    emit(game, 'iron:cleaned', { instance: inst, kind, wet, oxidation: s.oxidation, tinned: s.tinned });
    return s.oxidation;
  },
  isHot(inst) { return (inst.state.tipTemp ?? 0) > 60; },
};

export default def;
