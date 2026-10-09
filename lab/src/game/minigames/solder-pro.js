// =============================================================================
// solder-pro.js — HÀN MẠCH MỨC KỸ THUẬT VIÊN (gắn vào minigames/soldering.js: game.soldering.pro = new SolderPro(game, S)).
// Nguồn số liệu: docs/07_KIEN_THUC_HAN_MACH.md (bảng tham số ở ./_solder_kb.js, nhãn [V]/[S]/[TK]).
//
//   MŨI HÀN đổi được (items/tools/tip-*.js): bày lên giá mũi (world anchor 'tip-rack' + mốc slot_<mã> của CAD — có thì dùng,
//     không có thì đặt cạnh trạm hàn). Tháo mũi: cầm MIẾNG CHỊU NHIỆT tay trái + mỏ hàn tay phải → chuột phải; hoặc phím T khi
//     cầm mỏ hàn (tay trần + mũi nóng = BỎNG). Lắp mũi: nhìn mũi rời → T (hoặc chuột phải với miếng chịu nhiệt). Mũi nóng tháo ra
//     tự cắm lại vào lỗ giá của nó (không có giá → thảm chịu nhiệt → mặt bàn = lỗi). Mũi mới phải PHỦ THIẾC ngay khi nóng.
//   NHIỆT LINH KIỆN: mỗi linh kiện cắm trên board có khối nhiệt thân Tb nhận nhiệt qua chân từ mối hàn (alpha, tau — KB COMPONENTS);
//     thân vượt "ngưỡng datasheet quy đổi" (bodyLimit) → mất "sức khoẻ" H → LED mờ/chết, tụ hoá phồng/rò, IC chết, vỏ nhựa biến
//     dạng (cắm không vào), tụ gốm nứt khi sốc nhiệt. KẸP TẢN NHIỆT trên chân → alpha ×0.3. Sự kiện 'solder:overheat'.
//   LỖI PHỤ của mối hàn: gai (icicle), xáo động (disturbed), lỗ khí, hạt thiếc văng, quá nhiệt (liên kim), mối kẹt nhựa thông,
//     flux cháy, measling/cháy nền, cầu thiếc mảnh.
//   KIỂM TRA IPC-A-610 (Class 2 / 3): grade(pad) đo góc thấm ướt, chu vi fillet, % điền lỗ, độ nhô chân + danh sách lỗi; mỗi lỗi
//     cần độ phóng đại tối thiểu mới THẤY (KB DEFECTS.mag, §13.4, dung sai ±15 %). Nguồn kiểm tra: 'solder:inspected' (kính hiển
//     vi engine/ux/microscope.js) hoặc phím I dự phòng (mắt thường 1× / đèn kính lúp 5 diopter = 2,25×). Phiếu kiểm tra từng mối +
//     biên bản QC cả bo (qcReport) — nhiệm vụ đọc được.
//   LÀM SẠCH: bàn chải + IPA (items/tools/ipa-brush.js) — cặn RMA tan nhanh, no-clean chậm, flux cháy đen rất chậm.
//   THẺ BÀI HỌC: ./_solder_cards.js — phím N: sổ tay hàn (mũi, lỗi, linh kiện, IPC, phóng đại, quy trình, QC); F trên mũi hàn.
//
// Sự kiện phát: 'tip:removed' {code, temp, protection, where} · 'tip:inserted' {code, protection} · 'tip:tinned' {code}
//   'solder:overheat' {item, part, cause, maxT, seconds} · 'solder:graded' {pad, padId, board, report} · 'solder:spatter'
//   'solder:cleaned' {pad, board} · 'heatsink:clip' {item, pin, on} · 'solder:qc-report' {board, report} · 'solder:handbook' {page}
//   'solder:quiz' {id, choice, correct} · 'safety:burn' {temp, part:'fingers', cause}
// =============================================================================
import * as THREE from 'three';
import {
  TIPS, TIP_ORDER, tipItemId, tipThermal, STATIONS, COMPONENTS, componentClass, bodyLimit, DEFECTS, IPC, canSee, magRangeFor,
  LAMP_MAG, JOINT_KINDS, tipVerdict, MAG_TOL,
} from './_solder_kb.js';
import { clamp, clamp01, volumeLimits, ALLOYS, FILM_MM3 } from './_solder_physics.js';
import { solderMats, icicleGeo, pinholeGeo, measleGeo, charGeo, smallBallGeo, copperRingGeo, scorchGeo, meltGeo } from './_solder_visual.js';
import { SolderCards } from './_solder_cards.js';
import { labState } from '../world/_labState.js';
import { mats as kitMats } from '../items/tools/_kit.js';
import { clipMesh, CLIPS } from '../items/tools/heatsink-clip.js';
import { R_BASE } from '../items/tools/_tips.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const RACK_CODES = ['B', 'I', '1C', '2C', '3C', 'D16', 'D24', 'D32', 'K', 'J'];      // thứ tự lỗ giá CAD (cad/src/lab/_tips.py)
const HOT_C = 60;                       // °C — trên mức này chạm tay trần là bỏng
const CLIP_ALPHA = 0.3;                 // kẹp tản nhiệt: nhiệt tới thân còn 30 % [TK]

/** Báo cáo IPC metric (thuần số) */
export function jointMetrics(pad, alloy) {
  const lim = volumeLimits(pad);
  const V = pad.solderVol || 0;
  const k = pad._phys?.k ?? 1;
  const hasHole = (pad.hole ?? 0.5) > 0;
  const holeVol = hasHole ? (pad.lead ? 0.8 : 1.1) * k : 0;
  const wet = pad.wetting || 0, lw = pad.lead ? (pad.leadWet || 0) : wet;
  const holeFill = hasHole ? clamp01((V - 0.1) / Math.max(0.1, holeVol)) * clamp01(lw / 0.75) * clamp01(wet / 0.6) : 1;
  const vf = clamp01(V / Math.max(0.1, lim.min));
  const over = Math.max(0, (V - lim.ideal) / Math.max(0.1, lim.max - lim.ideal));
  return {
    volume: +V.toFixed(2), ideal: +lim.ideal.toFixed(2), min: +lim.min.toFixed(2), max: +lim.max.toFixed(2),
    wetting: +wet.toFixed(2), leadWet: +lw.toFixed(2),
    holeFill: +holeFill.toFixed(2),
    secondaryDeg: Math.round(360 * clamp01(wet * 1.08) * vf),
    primaryDeg: Math.round(360 * clamp01(holeFill * 1.15) * clamp01(lw * 1.1)),
    angle: Math.round(clamp(12 + 95 * Math.pow(Math.max(0, 1 - wet), 0.7) + 70 * over, 5, 160)),
    padCover: +clamp01(wet * 1.05 * vf).toFixed(2),
    protrusion: pad.lead ? +pad.lead.L.toFixed(2) : null,
    thermal: (pad.thermalMass ?? 1) >= 2,
    peakT: Math.round(pad.peakT || 0), alloy: alloy?.id,
  };
}

export class SolderPro {
  constructor(game, S) {
    this.game = game;
    this.S = S;
    this.cls = 2;                         // IPC class đang chấm (2 | 3)
    this.lastReport = null;
    this.tipLog = [];                     // [{ key, tip, kind, level, ok }]
    this.stats = {
      tipChanges: 0, tipBurns: 0, hotTipOnBench: 0, hotSwapSleeve: 0, untinnedParks: 0, untinnedHot: 0, spongeWipes: 0, brassWipes: 0,
      overheats: 0, clipsUsed: 0, inspections: 0, cleaned: 0, spatter: 0, disturbed: 0, icicles: 0,
    };
    this._t = 0;
    this._spawned = false;
    this._cadScanT = 0; this._cadScanLeft = 120;
    this._cool = new Map();
    this.cards = new SolderCards(game, this);
    const ev = game.events;
    ev.on('solder:inspected', (e) => this._onInspected(e));
    ev.on('input:key', (e) => this._onKey(e));
    ev.on('socket:inserted', (e) => this._onMate(e));
    ev.on('item:picked', (e) => this._onPicked(e));
    ev.on('iron:cleaned', (e) => this._onWipe(e));
    ev.on('iron:tinned', (e) => this._onTinned(e));
    ev.on('tool:changed', (e) => this._onToolChanged(e));
    ev.on('iron:holstered', (e) => this._onPark(e.item));
    ev.on('solder:jostle', (e) => this.jostle(e));
    ev.on('game:loaded', () => this._restoreVisuals());
    game.save?.register?.('solder-pro', { serialize: () => ({ v: 1, cls: this.cls, stats: { ...this.stats } }), deserialize: (d) => { if (d?.cls) this.cls = d.cls; if (d?.stats) Object.assign(this.stats, d.stats); } });
  }

  // ======================================================================== tiện ích
  get now() { return this._t; }
  _emit(type, payload) { try { this.game.events?.emit(type, payload); } catch (e) { console.warn('[solder-pro] emit', type, e); } }
  _ready(key, sec) { const t = this._cool.get(key); if (t != null && this._t < t) return false; this._cool.set(key, this._t + sec); return true; }
  _toast(msg, kind = 'info', key = null, cool = 3) { if (key && !this._ready(key, cool)) return; try { this.game.hud?.toast?.(msg, { kind, short: kind !== 'danger' }); } catch { /* */ } }
  amb() { return labState(this.game).ambient ?? 30; }
  station() { const st = labState(this.game).station; return { st, S: STATIONS[st.kind] || STATIONS['936'] }; }
  iron() { return this.S._anyTool?.('soldering-iron') || null; }
  /** Thông số mũi đang lắp trên mỏ hàn (null = chưa lắp mũi) */
  tipParams(iron = this.iron()) {
    const code = iron?.state?.tip;
    if (!code || !TIPS[code]) return null;
    const t = TIPS[code];
    return { code, area: t.area.tht, width: t.width, bridge: t.bridge, precision: t.precision, th: tipThermal(code, this.station().st.kind) };
  }
  _alloy(p) { return this.S._alloyOf(p, this.S._in?.wire); }

  // ======================================================================== bày mũi + dụng cụ (lần đầu sau khi có phòng lab)
  _anchors() { return this.game.world?.anchors || {}; }
  /** Mốc lỗ giá mũi cho mã `code` → { pos, quat, where } (thế giới) hoặc null */
  rackSlot(code) {
    const A = this._anchors();
    const rack = A['tip-rack'] || null;
    const names = [`tip-rack:${code}`, `tip-rack-${code}`, `tip-rack/${code}`, `slot_${code}`, `tip-slot-${code}`];
    let slot = null;
    for (const n of names) if (A[n]?.isObject3D) { slot = A[n]; break; }
    if (!slot && rack) rack.traverse((o) => { if (!slot && new RegExp(`^slot[_-]${code}$`, 'i').test(o.name || '')) slot = o; });
    if (slot) {
      slot.updateWorldMatrix(true, false);
      return { pos: slot.getWorldPosition(new THREE.Vector3()), quat: slot.getWorldQuaternion(new THREE.Quaternion()), where: 'rack' };
    }
    if (rack) {
      // chưa có mốc lỗ (CAD chưa nạp): tính theo bản vẽ giá (cad/src/lab/tip_rack.py) — 2 hàng × 5 lỗ, bước 27 mm, miệng lỗ cao 30 mm
      rack.updateWorldMatrix(true, false);
      const i = RACK_CODES.indexOf(code);
      const q = rack.getWorldQuaternion(new THREE.Quaternion());
      if (i >= 0) {
        const row = Math.floor(i / 5), col = i % 5;
        const local = new THREE.Vector3((col - 2) * 27, 30, row === 0 ? -11.5 : 11.5);
        return { pos: local.applyMatrix4(rack.matrixWorld), quat: q, where: 'rack' };
      }
      // mũi không có lỗ trên giá (B05, 4C): nằm trên thảm/bàn trước giá
      const j = ['B05', '4C'].indexOf(code);
      const local = new THREE.Vector3(-40 + 80 * Math.max(0, j), 0, 48);
      return { pos: local.applyMatrix4(rack.matrixWorld), quat: q, where: 'beside-rack', lying: true };
    }
    return null;
  }
  /** Chỗ đặt mũi nóng/nguội: giá → thảm chịu nhiệt → mặt bàn cạnh trạm */
  _placeFor(code) {
    const r = this.rackSlot(code);
    if (r && !r.lying) return { ...this._uprightPose(r), where: 'rack' };
    const A = this._anchors();
    const mat = A['heat-mat'] || A['silicone-mat'] || A['solder-mat'] || A['heat-resistant-mat'];
    if (mat?.isObject3D) {
      const p = mat.getWorldPosition(new THREE.Vector3());
      const i = TIP_ORDER.indexOf(code);
      return { pos: p.add(new THREE.Vector3(-50 + (i % 6) * 18, 2, -20 + Math.floor(i / 6) * 50)), quat: new THREE.Quaternion(), where: 'mat' };
    }
    if (r) return { pos: r.pos.clone().add(new THREE.Vector3(0, 1, 0)), quat: r.quat, where: 'mat' };
    const st = A['station-solder'];
    const base = st?.isObject3D ? st.getWorldPosition(new THREE.Vector3()) : (this.S._in?.ironTip?.clone() || new THREE.Vector3(0, 760, 0));
    const i = TIP_ORDER.indexOf(code);
    return { pos: base.add(new THREE.Vector3(-150 + (i % 6) * 16, 2, 140 + Math.floor(i / 6) * 48)), quat: new THREE.Quaternion(), where: 'bench' };
  }
  /** Tư thế mũi đứng trong lỗ giá: đáy ống gốc sâu 18 mm dưới miệng lỗ */
  _uprightPose(slot) {
    const q = slot.quat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
    const up = UP.clone().applyQuaternion(slot.quat);
    const base = slot.pos.clone().addScaledVector(up, -18);
    const off = new THREE.Vector3(0, R_BASE, -20).applyQuaternion(q);
    return { pos: base.sub(off), quat: q };
  }

  _spawnKit() {
    const game = this.game, items = game.items;
    if (this._spawned || !game.world || !items?.spawn || !items.get) return;
    const A = this._anchors();
    this._spawned = true;
    if (!(A['bench-solder'] || A['station-solder'] || A['tip-rack'])) return;      // phòng thử (test) → không bày
    const iron = this.iron();
    const have = new Set(items.all.filter((i) => i.def?.category === 'solder-tip').map((i) => i.def.tipCode));
    if (iron?.state?.tip) have.add(iron.state.tip);
    for (const code of TIP_ORDER) {
      if (have.has(code) || !items.get(tipItemId(code))) continue;
      const r = this.rackSlot(code);
      let pose;
      if (r && !r.lying) pose = this._uprightPose(r);
      else pose = this._placeFor(code);
      try { items.spawn(tipItemId(code), { pos: pose.pos, quat: pose.quat, drop: false }); } catch (e) { console.warn('[solder-pro] bày mũi', code, e); }
    }
    // dụng cụ nghề: miếng chịu nhiệt, kẹp tản nhiệt, bàn chải IPA, vòng ESD — đặt trên bàn hàn nếu chưa có
    const spots = {
      'tip-change-pad': A['heat-mat'] || A['tip-rack'] ? null : [-3600, -3300],
      'heatsink-clip': [-3160, -3270], 'ipa-brush': [-2700, -3290], 'esd-wrist-strap': [-3650, -3360],
    };
    const near = (anchor, dx, dz) => { const p = anchor.getWorldPosition(new THREE.Vector3()); return [p.x + dx, p.y + 3, p.z + dz]; };
    for (const [id, xz] of Object.entries(spots)) {
      if (!items.get(id) || items.all.some((i) => i.def?.id === id)) continue;
      let pos;
      if (id === 'tip-change-pad' && (A['heat-mat'] || A['tip-rack'])) pos = near(A['heat-mat'] || A['tip-rack'], 110, 10);
      else if (id === 'ipa-brush' && A['ipa-bottle']) pos = near(A['ipa-bottle'], 60, 0);
      else pos = [xz[0], 752, xz[1]];
      try { items.spawn(id, { pos, rotY: 0.3, drop: true }); } catch (e) { console.warn('[solder-pro] bày', id, e); }
    }
  }

  /** Ẩn mũi tĩnh trong GLB giá mũi (node tip_<mã>) — mũi thật là item */
  _hideCadTips(dt) {
    if (this._cadScanLeft <= 0) return;
    this._cadScanT -= dt;
    if (this._cadScanT > 0) return;
    this._cadScanT = 1;
    this._cadScanLeft -= 1;
    const rack = this._anchors()['tip-rack'];
    const root = rack?.isObject3D ? (rack.parent || rack) : null;
    if (!root) { this._cadScanLeft = 0; return; }
    let n = 0;
    root.traverse((o) => {
      if (!/^tip_(B|I|1C|2C|3C|D16|D24|D32|K|J)$/i.test(o.name || '') || o.userData?.tipCode) return;
      for (let a = o; a; a = a.parent) if (a.userData?.item) return;
      if (o.visible) { o.visible = false; n++; }
      o.userData.hiddenBySolderPro = true;
    });
    if (n >= 10) this._cadScanLeft = 0;
  }

  // ======================================================================== thay mũi
  /** Tay đang có gì để cầm mũi nóng: 'pad' (miếng chịu nhiệt) | 'tweezers' | 'bare' */
  protection() {
    const inv = this.game.inventory;
    for (const t of [inv?.leftTool, inv?.rightTool]) if (t?.def?.id === 'tip-change-pad') return 'pad';
    if (inv?.rightTool?.def?.id === 'tweezers' || inv?.leftTool?.def?.id === 'tweezers') return 'tweezers';
    if (this.debugProtection) return this.debugProtection;
    return 'bare';
  }
  _burn(temp, why) {
    this.stats.tipBurns++;
    this.S.stats.burns++;
    this.S.gauge?.burn?.();
    this.game.hud?.flash?.('danger');
    this.game.audio?.play?.('sizzle', { vol: 0.8, duration: 0.4 });
    this._toast(`Bỏng! ${why} (${Math.round(temp)} °C) — dùng MIẾNG CHỊU NHIỆT hoặc tắt trạm chờ nguội (docs §2.1–2.2)`, 'danger');
    this._emit('safety:burn', { temp, part: 'fingers', cause: 'hot-tip' });
    this._emit('fault', { kind: 'burn-hand', temp, cause: why });
  }
  fitLabel(tipInst) {
    const code = tipInst?.def?.tipCode;
    const cur = this.iron()?.state?.tip;
    if (!code) return 'Lắp mũi';
    if (cur === code) return `Mũi ${code} đang lắp trên mỏ hàn`;
    return cur ? `Thay mũi ${cur} → ${code}` : `Lắp mũi ${code} vào mỏ hàn`;
  }
  /** Nhìn một mũi rời + T (hoặc chuột phải với miếng chịu nhiệt): thay/lắp mũi đó */
  fitTip(tipInst, { protection = null } = {}) {
    const iron = this.iron();
    if (!iron || !tipInst?.def?.tipCode) { this._toast('Không thấy mỏ hàn', 'warn', 'no-iron'); return false; }
    const prot = protection || this.protection();
    if (iron.state.tip === tipInst.def.tipCode) { this._toast(`Mũi ${tipInst.def.tipCode} đã lắp sẵn`, 'info', 'same-tip'); return false; }
    if (iron.state.tip) { const r = this.removeTip({ protection: prot }); if (!r) return false; }
    return this.insertTip(tipInst, { protection: prot });
  }
  /** Rút mũi đang lắp → đặt vào lỗ giá / thảm chịu nhiệt. Trả item mũi (hoặc null nếu không làm được) */
  removeTip({ protection = null } = {}) {
    const iron = this.iron(), s = iron?.state;
    if (!s?.tip) { this._toast('Mỏ hàn chưa có mũi', 'info', 'no-tip'); return null; }
    const prot = protection || this.protection();
    const T = Math.max(s.tipTemp, (s.bodyTemp ?? s.tipTemp) * 0.85);
    const { st, S: kind } = this.station();
    if (T > HOT_C && prot === 'bare') { this._burn(T, `Rút mũi ${s.tip} đang NÓNG bằng tay trần`); return null; }
    const code = s.tip;
    const place = this._placeFor(code);
    let it = null;
    try { it = this.game.items.spawn(tipItemId(code), { pos: place.pos, quat: place.quat, drop: false }); } catch (e) { console.warn('[solder-pro] rút mũi', e); }
    if (it) Object.assign(it.state, { oxidation: s.oxidation, tinned: s.tinned, temp: T, uses: (s.tipUses || 0) });
    if (T > HOT_C) {
      if (place.where === 'bench') { this.stats.hotTipOnBench++; this._toast(`Mũi nóng ${Math.round(T)} °C đặt thẳng lên bàn → cháy thảm ESD! Đặt vào khay/giá mũi (§2.1 [V][7])`, 'warn', 'tip-bench'); }
      if (st.on && !kind.hotSwap) { this.stats.hotSwapSleeve++; this._toast('Mũi lồng ống (900M/T18): đúng quy trình là TẮT trạm, chờ nguội rồi mới vặn đai ốc thay mũi (§2.2)', 'info', 'hot-swap', 20); }
      if (prot === 'tweezers') this._toast('Nhíp kim loại dẫn nhiệt — giữ thật ngắn; miếng chịu nhiệt an toàn hơn', 'info', 'tweezer-tip', 30);
    }
    iron.def.setTip(iron, null);
    s.oxidation = 0; s.tinned = 0; s.tipTemp = s.bodyTemp ?? s.tipTemp; s.newTipT = null;
    this.stats.tipChanges++;
    this.game.audio?.play?.('click', { vol: 0.6 });
    this._emit('tip:removed', { code, temp: T, protection: prot, where: place.where, stationOn: !!st.on, item: it });
    if (!this._quiet) this._toast(`Đã rút mũi ${code} (${Math.round(T)} °C) → ${place.where === 'rack' ? 'lỗ giá mũi' : place.where === 'mat' ? 'thảm chịu nhiệt' : 'mặt bàn'}`, 'info', null);
    return it || true;
  }
  /** Cắm mũi rời vào mỏ hàn */
  insertTip(tipInst, { protection = null } = {}) {
    const iron = this.iron(), s = iron?.state;
    if (!s || !tipInst?.def?.tipCode) return false;
    if (s.tip) { this._toast(`Mỏ hàn đang lắp mũi ${s.tip} — rút ra trước`, 'warn', 'tip-occupied'); return false; }
    const prot = protection || this.protection();
    const tT = tipInst.state.temp ?? 30;
    if (tT > HOT_C && prot === 'bare') { this._burn(tT, `Cầm mũi ${tipInst.def.tipCode} còn NÓNG bằng tay trần`); return false; }
    const bodyHot = (s.bodyTemp ?? s.tipTemp) > HOT_C;
    if (bodyHot && prot === 'bare') { this._burn(s.bodyTemp, 'Cắm mũi vào ống nhiệt đang nóng bằng tay trần'); return false; }
    const code = tipInst.def.tipCode;
    iron.def.setTip(iron, code);
    s.oxidation = tipInst.state.oxidation ?? 0;
    s.tinned = tipInst.state.tinned ?? 0.28;
    s.tipTemp = tT;
    s.tipUses = tipInst.state.uses || 0;
    s.newTipT = this._t; s.newTipTinned = false; s.newTipHotT = 0;
    try { this.game.items.remove(tipInst); } catch (e) { console.warn('[solder-pro] lắp mũi', e); }
    const { st, S: kind } = this.station();
    this.game.audio?.play?.('snap', { vol: 0.5 });
    this._emit('tip:inserted', { code, protection: prot, stationOn: !!st.on, station: kind.kind });
    const t = TIPS[code];
    this._toast(`Đã lắp mũi ${t.name}. ${st.on ? `Chờ lên nhiệt (${kind.heat})` : 'Bật trạm hàn'} → PHỦ THIẾC NGAY khi mũi đủ nóng (§2.3 [V][5])`, 'success', null);
    return true;
  }
  /** Miếng chịu nhiệt (tay trái) + chuột phải */
  padAction(padInst, target) {
    const it = target?.item;
    if (it?.def?.category === 'solder-tip') return this.fitTip(it, { protection: 'pad' });
    const iron = this.iron();
    if (iron?.state?.tip) return !!this.removeTip({ protection: 'pad' });
    this._toast('Nhắm vào một mũi hàn rời (trên giá) rồi bấm để lắp vào mỏ hàn', 'info', 'pad-hint');
    return false;
  }

  _onTinned(e) {
    const s = e.instance?.state;
    if (s?.newTipT != null && !s.newTipTinned && s.tinned > 0.4) {
      s.newTipTinned = true;
      const late = (s.newTipHotT || 0) > 12;
      this._toast(late ? 'Đã phủ thiếc mũi mới — hơi muộn, mũi đã kịp oxy hoá một phần' : 'Đã phủ thiếc mũi mới ✓ — mũi sáng bóng, thấm ướt tốt', late ? 'warn' : 'success', 'tip-tinned', 2);
      this._emit('tip:tinned', { code: s.tip, late });
    }
  }
  _onWipe(e) {
    if (e.kind === 'brass') this.stats.brassWipes++;
    else if (e.wet) { this.stats.spongeWipes++; if (this.stats.spongeWipes === 3) this._toast('Bọt biển ướt gây SỐC NHIỆT lặp lại cho mũi; bùi nhùi đồng lau sạch mà giữ lớp thiếc, không sụt nhiệt (§2.4)', 'info', 'sponge-note', 60); }
  }
  _onPark(iron) {
    const s = iron?.state;
    if (!s?.tip || (s.tipTemp ?? 0) < 200) return;
    if (s.tinned < 0.3) { this.stats.untinnedParks++; this._toast('Cất mỏ khi mũi chưa phủ thiếc → mũi trần oxy hoá trên giá. Phủ một lớp thiếc rồi mới cất (§2.3 [V][5])', 'warn', 'park-untinned', 10); }
  }
  _onToolChanged(e) { if (e.previous?.def?.id === 'soldering-iron' && this.game.inventory?.rightTool !== e.previous) this._onPark(e.previous); }

  // ======================================================================== phím
  _onKey(e) {
    if (!e.down || e.repeat) return;
    const game = this.game;
    if (this.cards.onKey(e)) return;
    if (game.app?.paused || game.app?.uiMode) return;
    if (game.ux?.capture?.(e)) return;           // [UX] chế độ đang dùng phím này (bàn 3D: T = nhìn thẳng xuống bo; kính hiển vi)
    if (e.code === 'KeyN') { this.openCard(this._contextPage()); return; }
    if (e.code === 'KeyI') { if (game.ux?.microscope?.active) return; this.quickInspect(); return; }
    if (e.code === 'KeyT') {
      if (game.interact?._findPrompt?.('T')) return;          // T đang dùng (lắp mũi đang nhìn, nắn chân IC…)
      if (game.inventory?.rightTool?.def?.id !== 'soldering-iron') return;
      if (this.iron()?.state?.tip) this.removeTip({});
      else this._toast('Mỏ hàn chưa có mũi — nhìn một mũi trên giá rồi bấm T để lắp', 'info', 'no-tip-t');
    }
  }
  _contextPage() {
    const it = this.game.interact?.target?.item;
    if (it?.def?.category === 'solder-tip') return `tip:${it.def.tipCode}`;
    const pad = this.S._aim?.pad || this.S.contact?.pad;
    if (pad?.insp && this.lastReport?.pad === pad) return 'report';
    return 'index';
  }
  openCard(page) { this.cards.open(page); }

  // ======================================================================== móc từ soldering.js
  /** Mỗi bước khi mũi đang chạm pad. Trả danh sách [padKề, G] mũi to chạm sang pad bên (bước 2,54 mm) */
  onContact(c, iron, dt, tipT) {
    const p = c.pad;
    const tp = this.tipParams(iron);
    p._tip = tp?.code || p._tip;
    p._maxTip = Math.max(p._maxTip || 0, tipT);
    if (p.molten) {
      p._dwell = (p._dwell || 0) + dt;
      if (iron?.def?.wetFromJoint) iron.def.wetFromJoint(iron, dt, p.flux > 0.02, p.alloy || null);
      if (p.peakT > 385 && p.flux > 0.05) p.defects.pinhole = true;     // flux sôi mạnh > 380 °C (§13.3)
    }
    if (!tp) return null;
    // mũi rộng trên bước 2,54 mm: chạm vào vòng đồng pad bên (§13.3 "mũi rộng hơn ~1,2× pad")
    const reach = tp.width / 2 + 0.05 * tp.bridge;
    let out = null;
    for (const id of p.neighbors || []) {
      const q = c.rec.byId.get(String(id));
      if (!q) continue;
      const d = Math.hypot(q.local[0] - p.local[0], q.local[2] - p.local[2]);
      if (d - (q.ring ?? 0.9) < reach) (out ||= []).push([q, c.G * 0.35]);
    }
    return out;
  }
  /** Mũi rời khỏi pad p */
  onLift(p, tipT, alloy) {
    if (!p) return;
    if (p.molten && p.solderVol > 0.6) {
      const fed = p._lastFeedEnd != null;
      const slow = fed && this._t - p._lastFeedEnd > 0.6;
      if (p.flux < 0.03 || tipT < alloy.flowT + 15 || (slow && p.flux < 0.15)) {
        if (!p.defects.icicle) { this.stats.icicles++; this._toast('Rút mũi khi flux đã cạn / mũi nguội → GAI THIẾC (icicle). Thêm flux, chạm lại và rút dứt khoát', 'warn', 'icicle', 6); }
        p.defects.icicle = true;
        p.dirty = true; p._rec?.dirty.add(p);
      }
    }
  }
  onFeedEnd(p) { if (p) p._lastFeedEnd = this._t; }
  /** Thiếc đang chảy vào pad (mỗi bước) */
  onFeed(p, dv, iron, tipT) {
    const s = iron?.state;
    const wetWipe = s?.spongeT != null && (this.game.time?.now ?? 0) - s.spongeT < 1.5;
    if ((tipT > 400 || wetWipe) && this._ready(`spat:${p._key}`, 0.35)) {
      p.defects.balls = Math.min(6, (p.defects.balls || 0) + 1 + (tipT > 430 ? 1 : 0));
      this.stats.spatter++;
      p.dirty = true; p._rec?.dirty.add(p);
      const pos = this.S.padWorld(p._rec, p, new THREE.Vector3());
      this.game.fx?.sparks?.(pos, { count: 5, speed: 30, size: 0.3, color: 0xfff0c8 });
      this._toast(wetWipe ? 'Văng thiếc! Mũi vừa lau bọt biển ướt — nước sôi làm bắn hạt thiếc' : `Văng thiếc! Mũi ${Math.round(tipT)} °C quá nóng — flux sôi bùng`, 'warn', 'spatter', 5);
      this._emit('solder:spatter', { pad: p, padId: p.id, board: p._rec?.inst, cause: wetWipe ? 'wet-sponge' : 'hot-tip' });
    }
  }
  /** Thiếc trên pad vừa CHẢY (bắt đầu một lần hàn) */
  onMelt(p) {
    p.reflows = (p.reflows || 0) + 1;
    p.moltenT = 0; p._dwell = 0; p._maxTip = 0; p.imc = (p.imc || 0) * 0.6;
    for (const k of ['icicle', 'disturbed', 'rosin', 'pinhole']) delete p.defects[k];
    p._mvLead = null; p._mvBoard = null;
    // diode: chỉ cho hàn 1 lần — lần nung chảy thứ 2 cộng dồn hư hại (§13.2)
    const it = p.lead?.item;
    if (it && componentClass(it.def) === 'diode' && p.reflows >= 2 && p.state !== 'empty') {
      const H = this._heat(it);
      H.H = Math.max(0, H.H - 0.15);
      this._applyDamage(it, 'diode', H, 'hàn lại lần 2 (datasheet ROHM: < 3 s, 1 lần)');
    }
  }
  /** Mối vừa ĐÔNG: chốt lỗi phụ + mũi đã dùng */
  onSolidify(rec, p, result, alloy) {
    const d = p.defects;
    if (result.state !== 'empty' && p.solderVol >= FILM_MM3) {
      if ((p._dwell || 0) > 6 || ((p._maxTip || 0) > 400 && (p._dwell || 0) > 1) || (p.imc || 0) > 8 || (p.reflows || 0) >= 5) d.overheated = true;
      else delete d.overheated;
      const lim = volumeLimits(p);
      if ((p.moltenT || 0) < 0.5 && p.solderVol >= lim.min && result.state !== 'cold') d.rosin = true;
    }
    p.tipCode = p._tip || p.tipCode || null;
    p.version = (p.version || 0) + 1;
    if (p.lead && p.tipCode) {
      const kind = this.jointKind(p);
      const v = tipVerdict(p.tipCode, kind);
      this.tipLog.push({ key: p._key, tip: p.tipCode, kind, level: v.level, ok: v.ok });
      if (this.tipLog.length > 400) this.tipLog.shift();
      if (!v.ok) this._toast(`${v.text} (docs §1.4)`, 'info', `tipv:${p.tipCode}:${kind}`, 30);
    }
  }
  /** Loại mối theo pad + chân (để chọn mũi) */
  jointKind(p) {
    const it = p.lead?.item;
    const id = String(it?.def?.id || '');
    if ((p.thermalMass ?? 1) >= 2 || /screw-terminal|xt60|irlz|to220|7805|1000uf/.test(id)) return 'power';
    if (/header|dip\d+-socket|jst/.test(id)) return 'header';
    if ((p.ring ?? 0.9) < 0.45) return 'fine';
    return 'small';
  }

  // ======================================================================== mỗi bước logic
  update(dt, c, I) {
    this._t += dt;
    if (!this._spawned && this.game.world) this._spawnKit();
    this._hideCadTips(dt);
    // mũi mới chưa phủ thiếc
    const iron = I?.iron || this.iron(), s = iron?.state;
    if (s?.newTipT != null && !s.newTipTinned && s.tipTemp > 250) {
      s.newTipHotT = (s.newTipHotT || 0) + dt;
      if (s.newTipHotT > 12 && !s._untinWarn) {
        s._untinWarn = true; this.stats.untinnedHot++;
        this._toast(`Mũi ${s.tip} mới đang NÓNG mà chưa phủ thiếc — lớp mạ sắt trần oxy hoá đen, mất thấm ướt! Đưa thiếc chạm mũi ngay (§2.3)`, 'danger', 'untinned', 20);
      }
    }
    for (const rec of this.S.boards.values()) {
      if (!rec.active.size && !rec._heatParts) continue;
      this._disturbCheck(rec, c);
      this._boardDose(rec);
      this._stepParts(rec, dt, c, I);
    }
    this.cards.update?.(dt);
  }

  /** Bo / chân linh kiện bị xê dịch khi thiếc đang đông → mối "disturbed" (§5.5, §13.3) */
  _disturbCheck(rec, c) {
    let anyCool = false;
    for (const p of rec.active) if (p.molten && !(c && c.pad === p)) { anyCool = true; break; }
    rec.inst.object.updateWorldMatrix(true, false);
    const bp = _v.setFromMatrixPosition(rec.inst.object.matrixWorld);
    if (!rec._lastPos) rec._lastPos = bp.clone();
    const moved = rec._lastPos.distanceTo(bp);
    rec._lastPos.copy(bp);
    if (!anyCool) return;
    for (const p of rec.active) {
      if (!p.molten || (c && c.pad === p)) continue;
      const alloy = this._alloy(p);
      const thr = alloy.liquidus === alloy.solidus ? 0.12 : 0.04;     // Sn63 cùng tinh: ít nhạy (§3.1)
      let m = moved;
      const it = p.lead?.item;
      if (it?.object) {
        const lp = _v2.setFromMatrixPosition(it.object.matrixWorld);
        if (p._mvLead) m = Math.max(m, p._mvLead.distanceTo(lp) - moved);
        (p._mvLead ||= new THREE.Vector3()).copy(lp);
      }
      if (m > thr) this._disturb(p, m);
    }
  }
  _disturb(p, mm) {
    if (p.defects.disturbed) return;
    p.defects.disturbed = true;
    this.stats.disturbed++;
    p.dirty = true; p._rec?.dirty.add(p);
    this._toast(`Mối ${p.id} bị xê dịch ${mm.toFixed(2)} mm khi thiếc đang đông → mối XÁO ĐỘNG (mờ, vân nứt). Giữ yên tới khi đông hẳn!`, 'warn', 'disturb', 4);
    this._emit('solder:disturbed', { pad: p, padId: p.id, board: p._rec?.inst, mm });
  }
  /** Va chạm/rung từ ngoài (test, kẹp mạch lật…): e = { board?, item?, mm } */
  jostle(e) {
    const mm = e?.mm ?? 0.3;
    for (const rec of this.S.boards.values()) {
      if (e?.board && rec.inst !== e.board) continue;
      for (const p of rec.active) if (p.molten && !(this.S.contact?.pad === p) && (!e?.item || p.lead?.item === e.item)) this._disturb(p, mm);
    }
  }

  /** Liều nhiệt nền FR-4 quanh pad → đốm trắng / cháy nâu / cháy đen (§4.2, §13.2) */
  _boardDose(rec) {
    for (const p of rec.active) {
      const d = p.boardDose || 0;
      const lv = d > 9 ? 3 : d > 5 ? 2 : d > 2.5 ? 1 : 0;
      if (lv > (p._boardLv || 0)) {
        p._boardLv = lv;
        p.dirty = true; rec.dirty.add(p);
        const cause = ['', 'đốm trắng (measling) — nền FR-4 vượt Td ~350 °C', 'nền cháy nâu', 'nền cháy ĐEN'][lv];
        this.stats.overheats++;
        this._toast(`Pad ${p.id}: ${cause} (§4.2)`, lv >= 2 ? 'danger' : 'warn', `bd:${p._key}:${lv}`, 30);
        this._emit('solder:overheat', { item: rec.inst, part: 'pcb', pad: p, padId: p.id, cause, maxT: Math.round(p.peakT || p.T), seconds: +d.toFixed(1) });
      }
    }
  }

  // ======================================================================== nhiệt linh kiện (khối thân)
  _heat(it) {
    const s = it.state;
    if (!s.heat) s.heat = { Tb: this.amb(), H: 1, maxT: this.amb(), maxJ: 0, overS: 0, overT: 0, level: 0, shockT: 0, clips: [] };
    if (!Array.isArray(s.heat.clips)) s.heat.clips = [];
    return s.heat;
  }
  _stepParts(rec, dt, c, I) {
    const amb = this.amb();
    let any = false;
    for (const [uid, list] of rec.leadPads) {
      const it = list[0]?.lead?.item;
      if (!it) continue;
      const cls = componentClass(it.def);
      if (!cls) continue;
      const C = COMPONENTS[cls];
      const H = this._heat(it);
      let hot = H.Tb > amb + 0.5;
      let target = amb, maxJ = 0;
      for (const p of list) {
        if (rec.active.has(p)) hot = true;
        const a = C.alpha * (H.clips.includes(p.lead?.pinId) ? CLIP_ALPHA : 1);
        target = Math.max(target, amb + a * (p.T - amb));
        maxJ = Math.max(maxJ, p.T);
      }
      if (!hot) continue;
      any = true;
      const tau = target > H.Tb ? C.tau : 2 * C.tau;
      H.Tb += (target - H.Tb) * (1 - Math.exp(-dt / tau));
      H.maxT = Math.max(H.maxT, H.Tb);
      H.maxJ = Math.max(H.maxJ, maxJ);
      if (maxJ > C.limitT) H.overT += dt;
      const lim = bodyLimit(cls, amb);
      if (H.Tb > lim) {
        H.overS += dt;
        H.H = Math.max(0, H.H - C.rate * dt * clamp((H.Tb - lim) / 15, 0, 3));
      }
      // tụ gốm: sốc nhiệt khi mũi > 350 °C áp lên chân, không preheat (ΔT > ~190 °C) — §3.4, §13.2
      if (C.shock && c && list.includes(c.pad) && (I?.iron?.state?.tipTemp ?? 0) > 350 && (I.iron.state.tipTemp - H.Tb) > 190) {
        H.shockT += dt;
        if (H.shockT > 0.8 && !H.cracked) { H.cracked = true; H.H = Math.min(H.H, 0.1); }
      }
      this._applyDamage(it, cls, H);
    }
    rec._heatParts = any;
  }
  /** Áp mức hư hỏng theo "sức khoẻ" H (0..1) */
  _applyDamage(it, cls, H, extraCause = '') {
    const C = COMPONENTS[cls];
    let level = 0, label = '';
    const hd = it.state.heatDamage || { cls };
    const h = H.H;
    switch (cls) {
      case 'led': case 'led-blue':
        if (h < 0.3) { level = 3; label = 'LED CHẾT (dây bond đứt)'; } else if (h < 0.75) { level = 1; label = 'LED yếu — epoxy ngả vàng, sáng mờ'; }
        hd.brightness = level >= 3 ? 0 : level ? clamp(h, 0.15, 1) : 1; break;
      case 'elcap':
        if (h < 0.15) { level = 3; label = 'tụ hoá hỏng hẳn (khô điện phân)'; } else if (h < 0.45) { level = 2; label = 'tụ hoá RÒ dịch + phồng'; } else if (h < 0.8) { level = 1; label = 'tụ hoá phồng đáy, ống co rút'; }
        hd.cMul = [1, 0.7, 0.3, 0.05][level]; hd.esrMul = [1, 2, 6, 20][level]; hd.bulge = level >= 1; hd.leak = level >= 2; break;
      case 'diode':
        if (h < 0.25) { level = 3; label = 'diode chết (mối nối bán dẫn hỏng)'; } else if (h < 0.6) { level = 1; label = 'diode suy giảm (ΔVF > 20 %)'; } break;
      case 'crystal':
        if (h < 0.35) { level = 3; label = 'thạch anh nứt — không dao động'; } else if (h < 0.65) { level = 1; label = 'thạch anh lệch tần số'; } break;
      case 'mlcc':
        if (H.cracked) { level = 3; label = 'tụ gốm NỨT do sốc nhiệt (có thể chập)'; hd.cracked = true; } break;
      case 'ic':
        if (h < 0.5) { level = 3; label = 'IC hỏng do quá nhiệt'; } else if (h < 0.8) { level = 1; label = 'IC bị quá nhiệt (nghi lỗi chức năng)'; } break;
      case 'header': case 'jst': case 'dip-socket': case 'terminal':
        if (h < 0.6) { level = 2; label = 'vỏ nhựa biến dạng — chân xô lệch, cắm không vào'; hd.deformed = true; } break;
      case 'resistor':
        if (h < 0.5) { level = 1; label = 'điện trở cháy sậm lớp sơn'; } break;
      default: break;
    }
    if (level <= (H.level || 0)) return;
    H.level = level;
    hd.cls = cls; hd.level = level; hd.label = label;
    it.state.heatDamage = hd;
    const cause = `${label} — ${extraCause || `thân ${Math.round(H.maxT)} °C, mối tới ${Math.round(H.maxJ)} °C (giới hạn ${C.limitT} °C/${C.limitS} s, ${C.tag})`}`;
    if (level >= 3) {
      it.state.dead = true;
      it.state.damage = { state: 'dead', cause: `hỏng do nhiệt khi hàn: ${label}`, mode: cls === 'mlcc' ? 'short' : 'open' };
    }
    this.stats.overheats++;
    this._paintDamage(it, cls, hd);
    this.game.hud?.flash?.(level >= 3 ? 'danger' : 'warn');
    this._toast(`QUÁ NHIỆT ${it.def.name}: ${label}. ${C.fix}`, level >= 2 ? 'danger' : 'warn', `ovh:${it.uid}:${level}`, 2);
    this._emit('solder:overheat', { item: it, part: cls, cause, maxT: Math.round(Math.max(H.maxT, H.maxJ)), seconds: +H.overS.toFixed(1), level, bodyT: Math.round(H.maxT), jointT: Math.round(H.maxJ) });
    this._emit('fault', { kind: level >= 3 ? 'dead' : 'overheat', item: it, cause: `quá nhiệt khi hàn: ${label}` });
  }
  /** Hình ảnh hư hỏng: LED vàng đục, tụ phồng/rò, vỏ nhựa chảy */
  _paintDamage(it, cls, hd) {
    const obj = it.object;
    if (!obj) return;
    const own = (m) => { if (!m.userData.heatOwn) { const c = m.clone(); c.userData.heatOwn = true; return c; } return m; };
    if (cls === 'led' || cls === 'led-blue') {
      const k = 1 - (hd.brightness ?? 1);
      obj.traverse((o) => {
        if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
        const m = o.material;
        if (!(m.transparent || m.transmission > 0 || /lens|epoxy|body/i.test(o.name || ''))) return;
        const c = own(m); o.material = c;
        if (!c.userData.baseColor) c.userData.baseColor = c.color.clone();
        c.color.copy(c.userData.baseColor).lerp(new THREE.Color(0xb9933f), 0.35 + 0.55 * k);
        c.roughness = Math.min(1, (m.roughness ?? 0.2) + 0.5 * k);
        if ('opacity' in c) c.opacity = Math.min(1, (c.opacity ?? 1) + 0.25 * k);
      });
    } else if (cls === 'elcap') {
      const box = new THREE.Box3();
      obj.updateWorldMatrix(true, true);
      const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
      obj.traverse((o) => { if (o.isMesh && !o.userData.heatFx && o.geometry) { o.geometry.computeBoundingBox?.(); const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld).applyMatrix4(inv); box.union(b); } });
      if (box.isEmpty()) return;
      const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
      const r = Math.min(size.x, size.z) / 2;
      let g = obj.getObjectByName('heat-fx');
      if (!g) { g = new THREE.Group(); g.name = 'heat-fx'; g.userData.heatFx = true; obj.add(g); }
      for (const ch of [...g.children]) g.remove(ch);
      const alu = new THREE.MeshStandardMaterial({ color: 0xc9ced3, metalness: 1, roughness: 0.32 });
      if (hd.bulge) {
        const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 0.92, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), alu);
        dome.scale.y = 0.28 + (hd.leak ? 0.12 : 0);
        dome.position.set(ctr.x, box.max.y - 0.05, ctr.z);
        dome.userData.heatFx = true; dome.userData.noInteract = true;
        g.add(dome);
      }
      if (hd.leak) {
        const crust = new THREE.Mesh(new THREE.CircleGeometry(r + 1.6, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6b4a1c, roughness: 0.35, metalness: 0, transparent: true, opacity: 0.8, depthWrite: false }));
        crust.position.set(ctr.x, box.min.y + 0.15, ctr.z);
        crust.userData.heatFx = true; crust.userData.noInteract = true;
        g.add(crust);
      }
    } else if (hd.deformed) {
      obj.traverse((o) => {
        if (!o.isMesh || !o.material || Array.isArray(o.material) || o.userData.heatFx) return;
        const m = o.material;
        if ((m.metalness ?? 0) > 0.5) return;
        const c = own(m); o.material = c;
        c.roughness = 0.14; c.color.multiplyScalar(0.8);
      });
      let blob = obj.getObjectByName('heat-fx');
      if (!blob) {
        blob = new THREE.Mesh(meltGeo(), solderMats().melt);
        blob.name = 'heat-fx'; blob.userData.heatFx = true; blob.userData.noInteract = true;
        const b = new THREE.Box3().setFromObject(obj);
        const top = obj.worldToLocal(new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y + 0.05, (b.min.z + b.max.z) / 2));
        blob.position.copy(top); blob.rotation.x = -Math.PI / 2; blob.scale.setScalar(1.2);
        obj.add(blob);
      }
    }
  }
  /** Mũi hàn chạm VỎ NHỰA của linh kiện (soldering._safety) → vỏ biến dạng ngay */
  onPlasticTouch(touch, tipT) {
    let it = null;
    for (let o = touch?.object; o; o = o.parent) if (o.userData?.item) { it = o.userData.item; break; }
    const cls = it ? componentClass(it.def) : null;
    if (!cls || !COMPONENTS[cls]?.plastic) return;
    const H = this._heat(it);
    H.maxT = Math.max(H.maxT, tipT);
    H.H = Math.min(H.H, 0.5);
    this._applyDamage(it, cls, H, `mũi hàn ${Math.round(tipT)} °C chạm trực tiếp vỏ nhựa (§13.2)`);
  }
  /** Cắm vào connector / đế IC đã biến dạng → không vào */
  _onMate(e) {
    const owner = e.socket?.owner, item = e.item;
    const bad = owner?.state?.heatDamage?.deformed ? owner : item?.state?.heatDamage?.deformed ? item : null;
    if (!bad) return;
    setTimeout(() => {
      try { this.game.sockets?.release?.(item, { silent: false }); } catch { /* */ }
      this._toast(`${bad.def.name}: vỏ nhựa đã chảy/biến dạng do quá nhiệt → chân xô lệch, KHÔNG cắm vào được. Thay linh kiện.`, 'danger', `mate:${bad.uid}`, 2);
      this._emit('fault', { kind: 'mate-fail', item: bad, cause: 'vỏ nhựa biến dạng do quá nhiệt' });
    }, 0);
  }
  _onPicked(e) {
    const it = e.item;
    if (it?.def?.category !== 'solder-tip' || !((it.state?.temp ?? 0) > HOT_C)) return;
    if (this.protection() === 'pad') return;
    this._burn(it.state.temp, `Nhặt mũi ${it.def.tipCode} còn nóng bằng tay`);
    setTimeout(() => { try { if (it.heldBy === 'right') this.game.interact?.dropHeld?.(); } catch { /* */ } }, 0);
  }

  /** Sau khi tải bản lưu: vẽ lại hư hỏng linh kiện (LED vàng, tụ phồng, vỏ chảy) + kẹp tản nhiệt */
  _restoreVisuals() {
    setTimeout(() => {
      for (const it of this.game.items?.all || []) {
        const hd = it.state?.heatDamage;
        if (hd?.cls && hd.level > 0) { try { this._paintDamage(it, hd.cls, hd); } catch { /* */ } }
        if (it.state?.heat?.clips?.length) { try { this._clipVisual(it); } catch { /* */ } }
      }
    }, 600);
  }

  // ======================================================================== kẹp tản nhiệt
  clipAction(clipInst, target, point) {
    const S = this.S;
    let part = target?.item || null;
    if (part && typeof part.def?.solderPads === 'function') part = null;
    let best = null, bd = 6;
    const consider = (it) => {
      for (const j of S.partJoints(it)) {
        const c = S.padWorld(j.board ? S.board(j.board) : j.pad._rec, j.pad, new THREE.Vector3());
        const d = point ? c.distanceTo(point) : 0;
        if (d < bd || !point) { bd = d; best = { it, pad: j.pad, pin: j.pin }; }
      }
    };
    if (part) consider(part);
    else if (point) for (const rec of S.boards.values()) for (const [, list] of rec.leadPads) { const it = list[0]?.lead?.item; if (it) consider(it); }
    if (!best) { this._toast('Nhắm vào CHÂN một linh kiện đã cắm trên board (LED, diode, transistor) để kẹp', 'info', 'clip-hint'); return false; }
    return this.setClip(best.it, best.pin, clipInst);
  }
  /** Kẹp / tháo kẹp tản nhiệt trên chân `pin` của linh kiện */
  setClip(part, pin, clipInst = null, on = null) {
    const H = this._heat(part);
    const has = H.clips.includes(String(pin));
    const want = on == null ? !has : !!on;
    const st = clipInst?.state;
    if (want && !has) {
      if (st && (st.free ?? CLIPS) <= 0) { this._toast('Hết kẹp (2/2 đang kẹp) — tháo bớt một kẹp', 'warn', 'clip-none'); return false; }
      H.clips.push(String(pin));
      if (st) st.free = (st.free ?? CLIPS) - 1;
      this.stats.clipsUsed++;
    } else if (!want && has) {
      H.clips = H.clips.filter((x) => x !== String(pin));
      if (st) st.free = Math.min(CLIPS, (st.free ?? 0) + 1);
    } else return false;
    this._clipVisual(part);
    this.game.audio?.play?.('click', { vol: 0.5 });
    this._toast(want ? `Đã kẹp tản nhiệt lên chân ${pin} của ${part.def.name} — nhiệt tới thân giảm còn ~30 %` : `Đã tháo kẹp khỏi chân ${pin}`, want ? 'success' : 'info', null);
    this._emit('heatsink:clip', { item: part, pin: String(pin), on: want });
    return true;
  }
  _clipVisual(part) {
    const H = this._heat(part);
    const obj = part.object;
    if (!obj) return;
    for (const o of [...obj.children]) if (o.userData?.heatClip) obj.remove(o);
    const joints = this.S.partJoints(part);
    for (const pin of H.clips) {
      const j = joints.find((x) => x.pin === pin);
      if (!j) continue;
      const rec = j.pad._rec;
      const n = new THREE.Vector3();
      const c = this.S.padWorld(rec, j.pad, new THREE.Vector3(), n);
      // phía linh kiện = ngược pháp tuyến mặt hàn, cách mặt board ~2,5 mm
      const pos = c.addScaledVector(n, -(rec.thickness + 2.5));
      const m = clipMesh(kitMats(this.game), 0.1);
      m.userData.heatClip = true;
      m.traverse((o) => { o.userData.noInteract = true; });
      m.scale.setScalar(0.55);
      m.position.copy(pos);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0.3).normalize());
      obj.updateWorldMatrix(true, false);
      obj.attach(m);
    }
  }

  // ======================================================================== chấm IPC
  /** Chấm một mối theo IPC-A-610 class → { pass, defects:[{code, vi, fail, mag, detail}], metrics, kind } */
  grade(pad, cls = this.cls) {
    const alloy = this._alloy(pad);
    const m = jointMetrics(pad, alloy);
    const C = IPC[cls] || IPC[2];
    const defects = [];
    const has = (code) => defects.some((d) => d.code === code);
    const add = (code, detail = '', magOverride = null) => {
      const D = DEFECTS[code];
      if (!D || has(code)) return;
      defects.push({ code, vi: D.vi, fail: !!(D.fail || (cls >= 3 && D.cls3Fail)), mag: magOverride ?? D.mag, detail, fix: D.fix, cause: D.cause, src: D.src });
    };
    const d = pad.defects || {};
    const V = pad.solderVol || 0;
    if (V < FILM_MM3 && !pad.bridges?.length) {
      if (pad.lead) add('insufficient', 'chân chưa được hàn');
      if (pad.state === 'lifted') add('lifted-pad');
      return { pass: !defects.some((x) => x.fail), defects, metrics: m, kind: this.jointKind(pad), empty: true };
    }
    if (pad.state === 'lifted') add('lifted-pad');
    for (const k of pad.bridges || []) add(pad._thinBridge?.has?.(k) ? 'bridge-hairline' : 'bridge-gross', `nối sang ${k.split('/').pop()}`);
    const charK = (pad.char || 0);
    if (pad.state === 'cold') {
      if (pad.wetting < 0.3) add('nonwetting', `thấm ướt ${Math.round(pad.wetting * 100)} %`);
      else if (charK > 0.08 || pad.oxide > 0.5) add('dewetting', charK > 0.08 ? 'flux cháy thành than dưới thiếc' : 'thiếc bị oxy hoá');
      else add('cold', `đỉnh ${m.peakT} °C, thấm ${Math.round(pad.wetting * 100)} %`);
    }
    if (d.rosin) add('rosin', 'thiếc lỏng < 0,5 s');
    if (d.disturbed) add('disturbed');
    if (d.overheated) add('overheated', `${pad.reflows || 1} lần nung, giữ mũi ${(pad._dwell || 0).toFixed(1)} s`);
    if (d.icicle) add('icicle');
    if (d.pinhole) add('pinhole');
    if (d.balls) add('solder-balls', `${d.balls} hạt`);
    const lim = volumeLimits(pad);
    if (V < lim.min) add('insufficient', `${V.toFixed(1)} mm³ < ${lim.min.toFixed(1)}`);
    if (V > lim.max) add('excess', `${V.toFixed(1)} mm³ > ${lim.max.toFixed(1)}`);
    const wetBad = has('cold') || has('nonwetting') || has('dewetting');
    if (m.angle > C.maxAngle && !wetBad) add('wetting-angle', `${m.angle}°`);
    if (m.secondaryDeg < C.secondaryDeg && !wetBad && !has('insufficient')) add('fillet-coverage', `${m.secondaryDeg}° < ${C.secondaryDeg}°`);
    if (pad.lead && (pad.hole ?? 0.5) > 0) {
      const need = m.thermal ? C.fillThermal : C.fill;
      if (m.holeFill < need && !wetBad) add('hole-fill', `${Math.round(m.holeFill * 100)} % < ${Math.round(need * 100)} %`);
      if (m.protrusion > C.protrMax) add('untrimmed', `nhô ${m.protrusion.toFixed(1)} mm > ${C.protrMax} mm`);
      else if (m.protrusion < C.protrMin) add('protrusion-short', `nhô ${m.protrusion.toFixed(1)} mm`);
    }
    if (charK > 0.08) add('flux-charred', `than ${charK.toFixed(2)}`);
    else if ((pad.flux || 0) > 0.06) {
      const nc = (pad._ncFrac || 0) > 0.6;
      if (!nc) add('flux-residue', 'cặn nhựa thông RMA (thiếc lõi) chưa làm sạch');
    }
    const bd = pad.boardDose || 0;
    if (bd > 5) add('scorch', bd > 9 ? 'cháy đen' : 'cháy nâu');
    else if (bd > 2.5) add('measling');
    const it = pad.lead?.item;
    const hd = it?.state?.heatDamage;
    if (hd?.level > 0) {
      const C2 = COMPONENTS[hd.cls];
      if (hd.cracked) add('mlcc-crack', it.def.name);
      else if (C2?.visible != null) add('component-damage', `${it.def.name}: ${hd.label}`, C2.visible);
      else add('component-damage', `${it.def.name}: ${hd.label} (không nhìn thấy được — chỉ đo kiểm mới lộ)`, 999);
    }
    return { pass: !defects.some((x) => x.fail), defects, metrics: m, kind: this.jointKind(pad) };
  }
  /** Độ phóng đại khi nhìn bằng mắt (phím I dự phòng): đèn kính lúp bật & gần → 2,25× (5 diopter, §10.2 [S][36]) */
  eyeMag(pad) {
    const lab = labState(this.game);
    if (this.debugMag) return this.debugMag;
    if (!lab.lamp?.on) return 1;
    const a = this._anchors()['lamp-solder'];
    if (!a?.isObject3D || !pad?._rec) return LAMP_MAG;
    const p = this.S.padWorld(pad._rec, pad, new THREE.Vector3());
    return a.getWorldPosition(_v2).distanceTo(p) < 700 ? LAMP_MAG : 1;
  }
  quickInspect(point = null) {
    const it = this.game.interact;
    const pt = point || it?.pointer?.point || it?.hit?.point || null;
    const j = pt ? this.S.findJoint(pt, 3) : this.S._aim;
    if (!j) { this._toast('Nhắm vào một mối hàn rồi bấm I để soi (bật đèn kính lúp để có 2,25×; kính hiển vi: E khi ngồi ở bàn hàn)', 'info', 'insp-hint'); return null; }
    const mag = this.eyeMag(j.pad);
    const e = { pad: j.pad, padId: j.pad.id, board: j.rec.inst, quality: j.pad.molten ? 'molten' : j.pad.state, observed: null, visible: true, reason: '', magnification: mag, by: mag > 1 ? 'lamp' : 'eye', point: this.S.padWorld(j.rec, j.pad, new THREE.Vector3()) };
    this._emit('solder:inspected', e);
    return e.proReport || null;
  }
  _onInspected(e) {
    let pad = e.pad;
    if (!pad && e.board && e.padId != null) pad = this.S.pad(e.board, e.padId);
    if (!pad) return;
    if (e.visible === false && e.reason && !/phóng đại/i.test(e.reason)) {
      this.cards.showNote(`Không đánh giá được mối ${pad.id}: ${e.reason}`);
      return;
    }
    if (pad.molten) { this.cards.showNote(`Mối ${pad.id} đang chảy — chờ đông rồi mới kiểm tra`); return; }
    e.proReport = this.inspect(pad, e.magnification || 1, e.by || 'microscope');
  }
  /** Kiểm tra một mối ở độ phóng đại `mag` → phiếu kiểm tra (chỉ "thấy" các lỗi đủ phóng đại) */
  inspect(pad, mag = 1, by = 'eye') {
    const g = this.grade(pad, this.cls);
    const seen = g.defects.filter((d) => mag >= d.mag * (1 - MAG_TOL));
    const missed = g.defects.length - seen.length;
    const pass = !seen.some((d) => d.fail);
    const land = 2 * (pad.ring ?? 0.9);
    const rng = magRangeFor(land);
    const notes = [];
    if (mag < rng.min * (1 - MAG_TOL)) notes.push(`${mag.toFixed(2)}× thấp hơn dải kiểm tra IPC ${rng.min}–${rng.max}× cho pad Ø${land.toFixed(1)} mm (§10.1) — bật đèn kính lúp hoặc dùng kính hiển vi`);
    if (pad.lead && !pad.lead.trimmed && (pad.lead.L || 0) > 2.5) notes.push('Chưa cắt chân — cắt sát rồi kiểm lại');
    pad.insp = { mag, by, t: this._t, version: pad.version || 0, cls: this.cls, pass, seen: seen.map((d) => d.code), truePass: g.pass };
    const report = {
      pad, padId: pad.id, key: pad._key, board: pad._rec?.inst || null, part: pad.lead?.item?.def?.name || null, pin: pad.lead?.pinId || null,
      mag, by, cls: this.cls, pass, truePass: g.pass, seen, missed, metrics: g.metrics, kind: g.kind, tip: pad.tipCode || null,
      ipcRange: rng, land, notes, empty: !!g.empty,
    };
    this.lastReport = report;
    this.stats.inspections++;
    this.cards.showReport(report);
    this._emit('solder:graded', { pad, padId: pad.id, board: report.board, report });
    return report;
  }
  /** Biên bản QC cả bo (chỉ các pad có thiếc hoặc có chân linh kiện) */
  qcReport(boardInst, cls = this.cls) {
    const rec = this.S.board(boardInst);
    const out = { board: boardInst, cls, total: 0, inspected: 0, observedPass: 0, truePass: 0, defects: {}, seen: {}, joints: [], tips: {}, passRate: 0, truePassRate: 0, coverage: 0 };
    if (!rec) return out;
    if (rec.leadsDirty) this.S._refreshLeads(rec);
    for (const p of rec.pads) {
      if (!(p.solderVol >= FILM_MM3 || p.lead || p.state !== 'empty' || p.bridges.length)) continue;
      const g = this.grade(p, cls);
      out.total++;
      if (g.pass) out.truePass++;
      for (const d of g.defects) out.defects[d.code] = (out.defects[d.code] || 0) + 1;
      const fresh = p.insp && p.insp.version === (p.version || 0);
      if (fresh) {
        out.inspected++;
        const seen = g.defects.filter((d) => p.insp.mag >= d.mag * (1 - MAG_TOL));
        if (!seen.some((d) => d.fail)) out.observedPass++;
        for (const d of seen) out.seen[d.code] = (out.seen[d.code] || 0) + 1;
      }
      if (p.tipCode) out.tips[p.tipCode] = (out.tips[p.tipCode] || 0) + 1;
      out.joints.push({ id: p.id, part: p.lead?.item?.def?.name || null, pass: g.pass, inspected: !!fresh, mag: p.insp?.mag ?? null, defects: g.defects.map((d) => d.code), tip: p.tipCode || null });
    }
    out.passRate = out.total ? out.observedPass / out.total : 0;
    out.truePassRate = out.total ? out.truePass / out.total : 0;
    out.coverage = out.total ? out.inspected / out.total : 0;
    return out;
  }
  saveQc(boardInst) {
    const r = this.qcReport(boardInst);
    this._emit('solder:qc-report', { board: boardInst, report: r });
    this._toast(`Đã lưu biên bản QC: ${r.total} mối · soi ${r.inspected} · đạt ${r.observedPass} (Class ${r.cls}) — §11 bước 14`, 'success', null);
    return r;
  }

  // ======================================================================== làm sạch IPA
  brush(inst, point, dt) {
    const s = inst.state;
    const j = point ? this.S.findJoint(point, 3.0) : this.S._aim;
    if (!j) { this._toast('Chà bàn chải lên mối hàn có cặn nhựa thông', 'info', 'brush-hint', 5); return; }
    if ((s.ml ?? 0) <= 0) { this._toast('Hết IPA — châm thêm từ bình IPA', 'warn', 'ipa-empty', 5); return; }
    const p = j.pad;
    if (p.T > 80) { this._toast(`Mối còn ${Math.round(p.T)} °C — IPA dễ cháy, chờ nguội rồi mới chà!`, 'warn', 'ipa-hot', 4); return; }
    s.ml = Math.max(0, (s.ml ?? 60) - 0.35 * dt);
    const pads = [p, ...(p.neighbors || []).map((id) => j.rec.byId.get(String(id))).filter(Boolean)];
    let changed = false;
    for (const q of pads) {
      const k = q === p ? 1 : 0.4;
      const f0 = q.flux || 0, c0 = q.char || 0;
      if (f0 > 0) q.flux = f0 * Math.exp(-(q._ncFrac > 0.6 ? 0.9 : 1.6) * k * dt);
      if (c0 > 0) q.char = c0 * Math.exp(-0.22 * k * dt);
      if (q.flux < 0.01) q.flux = 0;
      if (q.char < 0.02) q.char = 0;
      if (Math.abs(f0 - q.flux) > 1e-4 || Math.abs(c0 - q.char) > 1e-4) { q.dirty = true; j.rec.dirty.add(q); changed = true; }
    }
    s.scrub = (s.scrub || 0) + dt;
    if (changed && this._ready('brush-snd', 0.5)) this.game.audio?.play?.('hiss', { vol: 0.12 });
    if (p.flux === 0 && (p.char || 0) < 0.08 && !p._cleanMarked) {
      p._cleanMarked = true;
      p.version = (p.version || 0) + 1;
      this.stats.cleaned++;
      this._toast(`Mối ${p.id} sạch nhựa thông ✓ — lau khô bằng giấy không xơ, rồi KIỂM TRA LẠI (§11 bước 11)`, 'success', `clean:${p._key}`, 3);
      this._emit('solder:cleaned', { pad: p, padId: p.id, board: j.rec.inst });
    }
  }
  brushEnd() { /* tự lau khô */ }
  /** Bo có còn cặn flux / than không */
  residueLeft(boardInst) {
    const rec = this.S.board(boardInst);
    if (!rec) return 0;
    let n = 0;
    for (const p of rec.pads) if ((p.flux || 0) > 0.06 || (p.char || 0) > 0.08) n++;
    return n;
  }

  // ======================================================================== hình ảnh lỗi phụ trên pad
  renderPad(rec, p, vis) {
    const M = solderMats();
    const d = p.defects || {};
    const get = (k, make) => { if (!vis[k]) { const m = make(); m.userData.noInteract = true; vis.g.add(m); vis[k] = m; } return vis[k]; };
    // flux cháy → vệt than (thay cho vệt hổ phách)
    const ch = p.char || 0;
    if (ch > 0.03) {
      const m = get('charM', () => new THREE.Mesh(charGeo(), M.char));
      m.visible = true; m.material = ch > 0.15 ? M.char : M.charBrown;
      m.position.y = 0.035; m.scale.setScalar(0.75 + Math.min(0.8, ch * 1.6));
      if (vis.flux) vis.flux.visible = false;
    } else if (vis.charM) vis.charM.visible = false;
    // nền: measling / cháy nâu / đen
    const lv = p._boardLv || ((p.boardDose || 0) > 9 ? 3 : (p.boardDose || 0) > 5 ? 2 : (p.boardDose || 0) > 2.5 ? 1 : 0);
    if (lv >= 1) {
      const ms = get('measle', () => new THREE.Mesh(measleGeo(), M.measle));
      ms.position.y = 0.02; ms.visible = true;
    }
    if (lv >= 2 && p.state !== 'lifted') {
      const sc = get('scorchM', () => new THREE.Mesh(scorchGeo(), M.scorchBrown));
      sc.position.y = 0.015; sc.visible = true; sc.material = lv >= 3 ? M.scorch : M.scorchBrown;
    }
    // gai thiếc
    if (d.icicle && p.solderVol > 0.3) {
      const ic = get('icicle', () => new THREE.Mesh(icicleGeo(), M.good));
      ic.visible = true;
      ic.position.set(0.35, Math.max(0.3, (p._fH || 0.6) - 0.05), 0.2);
      ic.rotation.set(0.25, 0, -0.35);
      ic.material = matOf(p, M);
    } else if (vis.icicle) vis.icicle.visible = false;
    // lỗ khí
    if (d.pinhole && p.solderVol > 0.3) {
      const g = get('pins', () => { const g = new THREE.Group(); for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(pinholeGeo(), M.pinhole); m.rotation.x = -Math.PI / 2; g.add(m); } return g; });
      g.visible = true;
      const ring = p.ring ?? 0.9;
      g.children.forEach((m, i) => { const a = i * 2.1 + 0.4; m.position.set(Math.cos(a) * ring * 0.62, Math.max(0.12, (p._fH || 0.5) * 0.42) + 0.02, Math.sin(a) * ring * 0.62); });
    } else if (vis.pins) vis.pins.visible = false;
    // hạt thiếc văng
    if (d.balls) {
      const g = get('balls', () => new THREE.Group());
      while (g.children.length < d.balls) {
        const i = g.children.length;
        const m = new THREE.Mesh(smallBallGeo(), M.ball);
        const a = i * 2.4 + (p.local[0] % 1), r = 1.5 + (i % 3) * 0.55;
        m.position.set(Math.cos(a) * r, 0.14, Math.sin(a) * r);
        m.scale.setScalar(0.7 + (i % 2) * 0.5);
        g.add(m);
      }
      g.visible = true;
    }
    // không thấm ướt: lộ vòng đồng quanh cục thiếc
    if (p.state === 'cold' && p.wetting < 0.45 && p.solderVol > 0.2) {
      const r = get('cuRing', () => new THREE.Mesh(copperRingGeo(), M.copper));
      r.visible = true; r.position.y = 0.012;
    } else if (vis.cuRing) vis.cuRing.visible = false;
  }
}

function matOf(p, M) { return p.molten ? M.molten : p.defects?.overheated ? M.overheated : p.state === 'cold' ? M.cold : M.good; }

export default SolderPro;
