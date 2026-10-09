// =============================================================================
// quests/m5-mo-xac.js — Nhiệm vụ M5 "Mổ xác robot hút bụi" (Ngày 1 · 08–12h, docs/03 + phiếu đo docs/06_DO_DAC_XAC_ROBOT.md).
//   Thứ tự tháo THẬT: rút hộp bụi → lật úp → tháo nắp khoang pin → RÚT PIN TRƯỚC (tháo vít khác khi pin còn cắm = trừ nặng)
//   → tháo chổi cạnh, chổi cuộn → bóc miếng dán chân đế tìm vít ẩn → tháo vít nắp → lật ngửa, nhấc nắp trên
//   → CHỤP ẢNH đầu nối trước khi rút (phím P) → rút đầu nối 2 bánh → đo Ω cuộn dây động cơ bánh (≈ 7 Ω, đồng hồ thật)
//   → quay tay bánh 10 vòng đếm xung encoder → điền PHIẾU ĐO (Esc → tab "📋 Phiếu đo", giống docs/06).
//   Robot = item lúc chạy 'robot-vacuum-teardown' (quests/_robot.js; CAD robot/robot-vacuum-assembly + manifest.robot.json).
// =============================================================================
import * as THREE from 'three';
import { defineMission, posOf, probeNets, pinNet } from './_mission.js';
import { registerRobotDef, ROBOT_ID, subpart, isUpsideDown, CONNECTORS } from './_robot.js';

export const QUEST_ID = 'm5-mo-xac';
const ENC_PPR = 1000;                         // xung encoder / vòng bánh (Hall, sau hộp số) — docs/01 §5
const BAT_LID_SCREWS = ['screw_bat_1', 'screw_bat_2'];
const isRobot = (i) => i?.def?.id === ROBOT_ID;

export const SHEET_FIELDS = [
  { k: 'vbat', label: 'Pin: điện áp danh định trên tem (V)', unit: 'V', hint: 'tem pin 4S Li-ion' },
  { k: 'rL', label: 'Bánh TRÁI: R giữa 2 dây motor (Ω)', unit: 'Ω', hint: 'đo bằng đồng hồ thang Ω' },
  { k: 'rR', label: 'Bánh PHẢI: R giữa 2 dây motor (Ω)', unit: 'Ω', hint: 'đo bằng đồng hồ thang Ω' },
  { k: 'pulses10', label: 'Quay tay 10 vòng = … xung', unit: 'xung', hint: 'đếm encoder' },
  { k: 'ticks', label: '→ TICKS_PER_REV', unit: 'xung/vòng', hint: '= xung / 10' },
  { k: 'wheelD', label: 'Đường kính bánh → WHEEL_DIAMETER_MM', unit: 'mm', hint: 'thước kẹp' },
  { k: 'wheelBase', label: 'Khoảng cách tâm 2 bánh → WHEEL_BASE_MM', unit: 'mm', hint: 'thước (xem mô tả robot)' },
  { k: 'bumpers', label: 'Số công tắc bumper', unit: 'cái', hint: '' },
  { k: 'cliffs', label: 'Số cảm biến chống rơi', unit: 'cái', hint: '' },
];

export function theRobot(game) { return game.items.all.find((i) => isRobot(i) && !i.inBag) || null; }
const sp = (game, name) => { const r = theRobot(game); return r ? subpart(game, r, name) : null; };
const open = (game, n) => !!sp(game, n)?.state.open;
const removed = (game, n) => !!sp(game, n)?.state.removed;
const plugged = (game, n) => sp(game, n)?.state.plugged !== false;
const robotWhere = (dy = 140) => (g) => { const r = theRobot(g); return r ? posOf(r).add(new THREE.Vector3(0, dy, 0)) : null; };
const spWhere = (name) => (g) => sp(g, name)?.worldPosition() || robotWhere()(g);

/** Kiểm tra phiếu đo → { ok, errors:[…] } (so với số đo THẬT của người chơi khi có) */
export function checkSheet(v, T) {
  const err = [];
  const num = (k) => (v[k] === '' || v[k] == null ? NaN : +String(v[k]).replace(',', '.'));
  const near = (k, ref, tol, why) => { const x = num(k); if (!Number.isFinite(x) || Math.abs(x - ref) > tol) err.push(why); };
  near('vbat', 14.4, 0.25, 'Điện áp danh định pin 4S Li-ion = 4 × 3.6 V = 14.4 V');
  near('rL', T.rL ?? 7, Math.max(0.6, (T.rL ?? 7) * 0.12), `R motor trái phải khớp số đo (${T.rL != null ? `${T.rL.toFixed(1)} Ω` : 'chưa đo!'})`);
  near('rR', T.rR ?? 7, Math.max(0.6, (T.rR ?? 7) * 0.12), `R motor phải phải khớp số đo (${T.rR != null ? `${T.rR.toFixed(1)} Ω` : 'chưa đo!'})`);
  const p10 = T.pulses ?? ENC_PPR * 10;
  near('pulses10', p10, Math.max(150, p10 * 0.05), `Số xung 10 vòng phải khớp lần đếm (${T.pulses != null ? T.pulses : 'chưa đếm!'})`);
  near('ticks', num('pulses10') / 10, 5, 'TICKS_PER_REV = số xung 10 vòng ÷ 10');
  near('wheelD', 70, 2, 'Đường kính bánh ≈ 70 mm (thước kẹp)');
  near('wheelBase', 235, 6, 'Khoảng cách tâm 2 bánh ≈ 235 mm');
  near('bumpers', 2, 0, 'Bumper có 2 công tắc (trái/phải)');
  near('cliffs', 4, 0, 'Có 4 cảm biến chống rơi');
  return { ok: !err.length, errors: err };
}

export function defineM5MoXac(game) {
  registerRobotDef(game);
  let M = null;
  const wheelSpin = (side) => {
    const r = theRobot(game);
    return (r?.subparts || []).find((s) => s.type === 'spin' && (s.name === `wheel_${side}_spin` || (/^wheel(_\d+)?$/.test(s.node?.name || '') && s.node.parent?.name === `wheel_${side}`))) || null;
  };
  M = defineMission(game, {
    id: QUEST_ID,
    title: 'Mổ xác robot hút bụi',
    chapter: 'Ngày 1 · 08–12h',
    order: 50,
    requires: ['m4-dong-co'],
    lessonId: 'vo-khung',
    intro: 'Sáng Ngày 1: mổ xác robot (Xiaomi gen1) trên bàn lắp ráp. RÚT PIN TRƯỚC, chụp ảnh mọi đầu nối TRƯỚC khi rút, phân loại ốc — rồi đo động cơ bánh, encoder và điền phiếu docs/06.',
    kit: [{ id: ROBOT_ID, at: 'bench-assembly', dx: 300, dz: 0 }, { id: 'calipers', at: 'bench-assembly', dx: -50, dz: 300 }],
    kitLabel: 'bàn lắp ráp',
    safety: {},
    xp: 400,
    fastMin: 25,
    realLife: [
      'Tháo pin / rút đầu cắm pin TRƯỚC mọi thao tác khác — tua vít chạm 2 điểm trên mạch còn điện là chập, cháy mạch gốc.',
      'Chụp ảnh từng đầu nối + màu dây TRƯỚC khi rút, dán nhãn dây (băng dính giấy + bút), phân ốc vào khay theo vị trí.',
      'Vít ẩn thường nằm dưới miếng dán / chân cao su — bóc bằng nhíp, đừng cạy vỏ.',
      'Đo R giữa 2 dây motor (~5–10 Ω). Encoder: cấp 5 V cho Hall, quay tay 10 vòng, đếm xung bằng logic analyzer → TICKS_PER_REV.',
      'Điền docs/06 xong → sửa firmware/pic16f877a_ccs/config.h và firmware/esp32s3/src/config.h ngay.',
    ],
    counters: { flipped: 0, earlyScrews: 0, photosBeforeUnplug: 0, unplugNoPhoto: 0, rL: null, rR: null, pulses: null, revAcc: 0, sheet: null, sheetErrors: [] },
    steps: [
      {
        id: 'bin', text: 'Mở nắp hộp bụi và RÚT hộp bụi ra (đổ bụi, cất riêng)',
        hint: 'Robot trên bàn lắp ráp. Nhìn vào nắp phía trên (E) để mở, rồi E vào hộp bụi để nhấc ra.',
        check: (g) => open(g, 'bin'),
        where: spWhere('bin'),
      },
      {
        id: 'flip', text: 'Lật ÚP robot (T) lên tấm lót để thao tác mặt đáy',
        hint: 'Nhìn vào robot, nhấn T. Mặt đáy có: nắp pin, chổi, bánh, vít.',
        check: (g) => isUpsideDown(theRobot(g)),
        where: robotWhere(),
      },
      {
        id: 'bat-lid', text: 'Tháo 2 vít nắp khoang pin (tua vít PH1) và mở nắp pin',
        hint: 'Chọn tua vít PH1 (phím số), nhìn vào vít, GIỮ chuột trái. Chỉ tháo 2 vít nắp pin — chưa đụng vít khác!',
        check: (g) => BAT_LID_SCREWS.every((n) => removed(g, n)) && open(g, 'lid_battery'),
        where: spWhere('lid_battery'),
      },
      {
        id: 'bat-unplug', text: 'RÚT ĐẦU CẮM PIN (an toàn trước tiên) — có thể chụp ảnh đầu cắm trước (P)',
        hint: 'Nhìn vào đầu cắm trắng cạnh pin, E để rút. Từ giờ mạch không còn điện.',
        check: (g) => !plugged(g, 'conn_main'),
        where: spWhere('conn_main'),
      },
      {
        id: 'brushes', text: 'Tháo chổi cạnh (1 vít giữa) và chổi cuộn (mở nắp chổi, nhấc chổi ra)',
        hint: 'Vít chổi cạnh ở tâm chổi 3 nhánh (góc trước). Nắp chổi cuộn: E để mở, rồi E vào tay nhấc đỏ.',
        check: (g) => removed(g, 'screw_side') && open(g, 'brush_main_grip'),
        where: spWhere('brush_main_grip'),
      },
      {
        id: 'hidden', text: 'Bóc 4 miếng dán chân đế (vít ẨN bên dưới) rồi tháo 4 vít ẩn + 4 vít nắp trên ở mép đáy',
        hint: () => {
          const r = theRobot(game);
          const left = (r?.subparts || []).filter((s) => s.type === 'screw' && /^screw_(top|hidden)_/.test(s.name) && !s.state.removed).length;
          const st = [1, 2, 3, 4].filter((i) => !open(game, `sticker_${i}`)).length;
          return `Còn ${st} miếng dán, ${left} vít. Miếng dán đen tròn ở 4 chân đế — E để bóc.`;
        },
        check: (g) => { const r = theRobot(g); return !!r && (r.subparts || []).filter((s) => s.type === 'screw' && /^screw_(top|hidden)_/.test(s.name)).every((s) => s.state.removed); },
        where: robotWhere(),
      },
      {
        id: 'cover', text: 'Lật NGỬA robot (T) rồi NHẤC NẮP TRÊN ra',
        hint: 'Nắp kẹt = còn vít. Nhìn vào thân nắp trên, E để nhấc.',
        check: (g) => !isUpsideDown(theRobot(g)) && open(g, 'cover_top'),
        where: robotWhere(),
      },
      {
        id: 'photos', text: 'CHỤP ẢNH (P) các đầu nối TRƯỚC khi rút: 2 đầu nối bánh + ít nhất 2 đầu nối khác',
        hint: () => { const r = theRobot(game); const ph = Object.keys(r?.state?.photos || {}); return `Đã chụp ${ph.length}: ${ph.map((k) => CONNECTORS[k] || k).join(', ') || '—'}. Nhìn vào đầu nối (gần tâm ngắm) rồi nhấn P.`; },
        check: (g) => {
          const ph = theRobot(g)?.state?.photos || {};
          return !!ph.conn_wheel_l && !!ph.conn_wheel_r && Object.keys(ph).length >= 4;
        },
        where: spWhere('conn_wheel_l'),
      },
      {
        id: 'unplug-wheels', text: 'Rút đầu nối 2 module bánh xe (JST 6 chân: M+ M− VCC GND A B)',
        hint: 'E vào từng đầu nối trắng ở mặt trong bánh. Dán nhãn "BÁNH T" / "BÁNH P".',
        check: (g) => !plugged(g, 'conn_wheel_l') && !plugged(g, 'conn_wheel_r'),
        where: spWhere('conn_wheel_r'),
      },
      {
        id: 'measure-r', text: 'Đo điện trở cuộn dây động cơ CẢ 2 bánh (đồng hồ Ω, chân M+ / M− ở đầu nối) — kỳ vọng ~5–10 Ω',
        hint: () => `Đã đo: trái ${M.T.rL != null ? `${M.T.rL.toFixed(1)} Ω` : '—'}, phải ${M.T.rR != null ? `${M.T.rR.toFixed(1)} Ω` : '—'}. Đồng hồ thang Ω: V = kẹp que đen vào M−, chuột trái que đỏ vào M+.`,
        check: () => M.T.rL != null && M.T.rR != null,
        where: spWhere('conn_wheel_l'),
      },
      {
        id: 'encoder', text: 'Giữ chuột trái lên bánh TRÁI để quay tay đúng 10 vòng — đếm xung encoder (logic analyzer)',
        hint: () => `Đã quay ${(M.T.revAcc).toFixed(1)} vòng ≈ ${Math.round(M.T.revAcc * ENC_PPR)} xung.`,
        check: () => M.T.revAcc >= 10,
        where: (g) => wheelSpin('l')?.worldPosition() || robotWhere()(g),
      },
      {
        id: 'sheet', text: 'Điền PHIẾU ĐO (Esc → "📋 Phiếu đo") đúng với số đo của bạn rồi bấm Lưu phiếu',
        hint: () => (M.T.sheetErrors.length ? `Phiếu còn sai: ${M.T.sheetErrors.join(' · ')}` : 'Esc mở menu → tab "📋 Phiếu đo". Ø bánh đo bằng thước kẹp; khoảng cách 2 bánh xem mô tả robot (giữ chuột phải để soi).'),
        done: (e) => e.type === 'sheet:submitted' && e.ok,
        where: robotWhere(),
      },
    ],
    failOn() { return null; },
    score(Mi) {
      const ph = Object.keys(theRobot(game)?.state?.photos || {}).length;
      Mi.note(`Ảnh đầu nối: ${ph} (${Mi.T.photosBeforeUnplug} chụp khi còn cắm)`);
      if (Mi.T.rL != null) Mi.note(`R motor: trái ${Mi.T.rL.toFixed(1)} Ω · phải ${Mi.T.rR?.toFixed(1)} Ω`);
      if (Mi.T.pulses != null) Mi.note(`TICKS_PER_REV ≈ ${Math.round(Mi.T.pulses / 10)}`);
      return 0;
    },
  });
  if (!M) return null;
  const ev = game.events;

  // ---- an toàn: tháo vít khi pin còn cắm
  ev.on('screw:driven', (e) => {
    if (!M.active() || !isRobot(e.item) || !e.removed) return;
    if (BAT_LID_SCREWS.includes(e.node)) return;
    if (plugged(game, 'conn_main')) { M.T.earlyScrews++; M.mistake('Tháo vít khi CHƯA rút đầu cắm pin — mạch gốc còn điện, tua vít có thể gây chập!', 20, 'bat-first'); }
  });
  // ---- rút đầu nối chưa chụp ảnh
  ev.on('connector:changed', (e) => {
    if (!M.active() || !isRobot(e.item) || e.plugged) return;
    const k2 = e.node;               // tên bộ phận con = khoá ảnh (CONNECTORS)
    if (!e.item.state.photos?.[k2] && k2 !== 'conn_main') { M.T.unplugNoPhoto++; M.mistake(`Rút ${CONNECTORS[k2] || e.node} khi CHƯA chụp ảnh — lắp lại sẽ phải đoán màu dây`, 5, `nophoto:${k2}`); }
  });
  ev.on('photo:taken', (e) => { if (M.active() && e.first && e.plugged) M.T.photosBeforeUnplug++; });
  // ---- đo Ω cuộn dây động cơ bánh (đồng hồ thật — circuit-ext: phần tử motor 7 Ω giữa chân M+/M−)
  ev.on('measure', (e) => {
    if (!M.active() || (e.mode !== 'ohm' && e.mode !== 'cont') || !Number.isFinite(e.value)) return;
    const r = theRobot(game);
    if (!r) return;
    const pn = probeNets(game);
    for (const s of ['L', 'R']) {
      const a = pinNet(game, r, `W${s}-M+`), b = pinNet(game, r, `W${s}-M−`);
      if ((pn.red === a && pn.black === b) || (pn.red === b && pn.black === a)) {
        if (plugged(game, s === 'L' ? 'conn_wheel_l' : 'conn_wheel_r')) { game.hud?.toast?.('Rút đầu nối bánh ra trước khi đo — đang đo song song cả mạch gốc', { kind: 'warn', short: true }); return; }
        M.T[`r${s}`] = e.value;
        game.hud?.toast?.(`Động cơ bánh ${s === 'L' ? 'trái' : 'phải'}: R = ${e.value.toFixed(1)} Ω`, { kind: 'success', short: true });
      }
    }
  });
  // ---- đếm vòng bánh trái (encoder 1000 xung/vòng) từ góc quay thật của bộ phận con
  let lastAng = null;
  game.tickers ||= [];
  game.tickers.push(() => {
    if (!M.active()) { lastAng = null; return; }
    const s = game.quests.progress(QUEST_ID);
    const w = wheelSpin('l');
    if (!w) return;
    const a = w.state.angle || 0;
    if (lastAng != null && s && M.def.steps[s.step]?.id === 'encoder') {
      const d = Math.abs(a - lastAng);
      if (d < 2) {
        const before = Math.floor(M.T.revAcc);
        M.T.revAcc += d / (Math.PI * 2);
        M.T.pulses = Math.round(M.T.revAcc * ENC_PPR);
        if (Math.floor(M.T.revAcc) !== before && M.T.revAcc <= 10.5) game.hud?.toast?.(`🔄 ${Math.floor(M.T.revAcc)} vòng · ${M.T.pulses} xung`, { kind: 'info', short: true });
      }
    }
    lastAng = a;
  });
  M.addRevs = (n) => { M.T.revAcc += n; M.T.pulses = Math.round(M.T.revAcc * ENC_PPR); };

  // ---- phiếu đo (tab menu tạm dừng)
  M.submitSheet = (values) => {
    const r = checkSheet(values || {}, M.T);
    M.T.sheet = { ...values };
    M.T.sheetErrors = r.errors;
    const robot = theRobot(game);
    if (robot) robot.state.sheet = { ...values };
    ev.emit('sheet:submitted', { ok: r.ok, values, errors: r.errors });
    if (!r.ok) M.mistake('Phiếu đo điền sai — số liệu sai thì config.h sai, robot đi lệch', 2);
    return r;
  };
  game.hud?.addMenuTab?.({
    id: 'sheet-m5', label: '📋 Phiếu đo',
    when: () => M.active() || game.quests.progress(QUEST_ID)?.done,
    render(sec) {
      const robot = theRobot(game);
      const v = robot?.state?.sheet || M.T.sheet || {};
      const ph = Object.keys(robot?.state?.photos || {});
      sec.innerHTML = `<h3>📋 Phiếu đo đạc xác robot (docs/06)</h3><div class="rvh-sheet">
        ${SHEET_FIELDS.map((f) => `<div class="rvh-row"><label>${f.label}</label><input type="number" step="any" data-k="${f.k}" value="${v[f.k] ?? ''}"><output>${f.unit}</output></div>`).join('')}
        <p style="font-size:12.5px;color:#9fb3c8">Ảnh đã chụp (${ph.length}): ${ph.map((k) => CONNECTORS[k] || k).join(' · ') || '—'}<br>Số đo của bạn: R trái ${M.T.rL != null ? M.T.rL.toFixed(1) : '—'} Ω · R phải ${M.T.rR != null ? M.T.rR.toFixed(1) : '—'} Ω · ${M.T.pulses != null ? `${M.T.pulses} xung / ${M.T.revAcc.toFixed(1)} vòng` : 'chưa đếm xung'}</p>
        <button class="rvh-btn" data-save>💾 Lưu phiếu</button> <span data-msg></span></div>`;
      sec.querySelector('[data-save]').addEventListener('click', () => {
        const vals = {};
        sec.querySelectorAll('[data-k]').forEach((i) => { vals[i.dataset.k] = i.value; });
        const r = M.submitSheet(vals);
        sec.querySelector('[data-msg]').innerHTML = r.ok ? '<span class="ok">✓ Phiếu hợp lệ — sửa config.h theo phiếu!</span>' : `<span class="err">${r.errors.map((x) => `• ${x}`).join('<br>')}</span>`;
      });
    },
  });
  // ---- lưu số đo của nhiệm vụ
  game.save?.register?.(`mission:${QUEST_ID}`, {
    serialize: () => ({ rL: M.T.rL, rR: M.T.rR, revAcc: M.T.revAcc, pulses: M.T.pulses, sheet: M.T.sheet }),
    deserialize: (d) => { if (d) Object.assign(M.T, { rL: d.rL ?? null, rR: d.rR ?? null, revAcc: d.revAcc || 0, pulses: d.pulses ?? null, sheet: d.sheet || null }); },
  });
  return M;
}
