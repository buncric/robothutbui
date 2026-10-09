// =============================================================================
// quests/m1b-ky-thuat-vien.js — Nhiệm vụ "Thợ hàn chuyên nghiệp" (bo luyện tập theo quy trình 14 bước, docs/07 §11).
//   Không nằm trong chuỗi m0 → m6 (không khoá/không tự bắt đầu; mở từ bảng nhiệm vụ J). Dùng minigames/solder-pro.js:
//   vòng ESD → sổ tay quy trình → bo trần dưới kính → câu hỏi nhiệt độ + đặt trạm → linh kiện thấp → cao (điện trở → header →
//   LED có kẹp tản nhiệt → tụ hoá → cầu đấu với MŨI TO) → cắt chân → soi từng mối đúng phóng đại → sửa → làm sạch IPA → soi lại
//   → đo thông mạch → cấp nguồn lần đầu giới hạn dòng ~30 % trên dòng dự kiến → lưu biên bản QC.
// Chấm điểm: IPC-A-610 Class 2 (Class 3 cộng điểm), chọn mũi, chăm sóc mũi, an toàn (chung của _mission.js), hư hỏng do nhiệt.
// =============================================================================
import * as THREE from 'three';
import { defineMission, whereAnchor } from './_mission.js';
import { labState } from '../world/_labState.js';
import { tipVerdict } from '../minigames/_solder_kb.js';
import { FILM_MM3 } from '../minigames/_solder_physics.js';

export const QUEST_ID = 'm1b-ky-thuat-vien';
const SOLID = new Set(['good', 'excess', 'cold', 'lifted']);

const S = (g) => g.soldering;
const P = (g) => g.soldering?.pro;
function boardInVise(game) {
  const b = game.sockets?.get?.('vise')?.occupiedBy;
  return b && typeof b.def?.solderPads === 'function' ? b : null;
}
function partsOn(game, board, re) {
  if (!board) return [];
  return (game.items?.all || []).filter((it) => re.test(it.def?.id || '') && S(game)?.boardOf(it) === board);
}
function soldered(game, part, minPins = 2) {
  const js = S(game)?.partJoints(part) || [];
  return js.length >= minPins && js.every((j) => SOLID.has(j.state) && !j.pad.bridges?.length);
}
/** Mọi mối (pad có chân) trên bo */
function leadPads(game, board) {
  const rec = board && S(game)?.board(board);
  if (!rec) return [];
  if (rec.leadsDirty) S(game)._refreshLeads(rec);
  return rec.pads.filter((p) => p.lead && (p.solderVol >= FILM_MM3 || p.state !== 'empty'));
}
const fresh = (p, minMag = 1.5) => !!p.insp && p.insp.version === (p.version || 0) && p.insp.mag >= minMag * 0.85;

export function defineM1bKyThuatVien(game) {
  let M = null;
  const quiz = () => {
    const pro = P(game);
    if (!pro || M.T.quizOpen) return;
    M.T.quizOpen = true;
    setTimeout(() => {
      pro.cards.quiz({
        id: 'temp-sn63', title: 'Đặt nhiệt độ trạm hàn',
        question: 'Thiếc Sn63Pb37 (chảy 183 °C), mối xuyên lỗ pad Ø1,8 mm, mũi D16/2C. Đặt trạm bao nhiêu là đúng nghề?',
        options: ['250 °C — vừa trên điểm chảy, đỡ hại linh kiện', '330–350 °C — đủ quá nhiệt để thiếc loang, flux chưa cháy', '400 °C — hàn cho nhanh', '450 °C — mối nào cũng chảy ngay'],
        correct: 1,
        explain: 'Hakko: bắt đầu 330–350 °C, càng thấp càng tốt [V][5]; Kester 44: 315–371 °C [S][9]. 250 °C: mối không đủ quá nhiệt (cần ≥ T_lỏng + ~20–50 °C) → nguội. ≥ 400 °C: flux cháy đen, mũi oxy hoá nhanh (hàm mũ), bong pad (§3, §2.6). Mối nặng → ĐỔI MŨI TO trước, không tăng nhiệt bừa (§3.5).',
      }, (r) => {
        M.T.quizOpen = false;
        if (r?.correct) M.T.quizOk = true;
        else { M.mistake('Chọn sai nhiệt độ trạm — xem lại docs/07 §3.2', 4, null); M.T.quizAsked = false; }
      });
    }, 300);
  };
  M = defineMission(game, {
    id: QUEST_ID,
    title: 'Thợ hàn chuyên nghiệp (IPC-A-610)',
    chapter: 'Kỹ năng · tay nghề',
    order: 15,
    requires: [],
    autoStart: false,
    lessonId: null,
    intro: 'Làm một bo luyện tập như kỹ thuật viên thật: ESD, chọn mũi theo từng loại mối, nhiệt độ có lý do, linh kiện thấp → cao, kẹp tản nhiệt cho LED, soi TỪNG mối dưới kính đúng phóng đại, làm sạch IPA, soi lại, đo, cấp nguồn giới hạn dòng, ghi biên bản QC. (docs/07 §11)',
    kit: [
      { id: 'perfboard-9x15', at: 'bench-solder', dx: 260, dz: 260 }, { id: 'perfboard-9x15', at: 'bench-solder', dx: 260, dz: 260 },
      { id: 'resistor-10k', at: 'bench-solder', dx: 120, dz: 300 }, { id: 'resistor-330', at: 'bench-solder', dx: 150, dz: 300 },
      { id: 'header-male-1x40', at: 'bench-solder', dx: 180, dz: 310 }, { id: 'led-5mm-red', at: 'bench-solder', dx: 210, dz: 300 },
      { id: 'cap-elec-100uf-25v', at: 'bench-solder', dx: 235, dz: 300 }, { id: 'screw-terminal-2p', at: 'bench-solder', dx: 265, dz: 300 },
      { id: 'heatsink-clip', at: 'bench-solder', dx: -260, dz: 330 }, { id: 'tip-change-pad', at: 'bench-solder', dx: -320, dz: 320 },
      { id: 'ipa-brush', at: 'bench-solder', dx: 330, dz: 330 }, { id: 'esd-wrist-strap', at: 'bench-solder', dx: -380, dz: 300 },
    ],
    kitLabel: 'bàn hàn',
    safety: { psuMaxIlim: 0.05, psuOffAtEnd: true },
    xp: 400,
    counters: { quizOk: false, quizAsked: false, quizOpen: false, ledClip: false },
    steps: [
      {
        id: 'prep', text: '1. Chuẩn bị bàn: ĐEO VÒNG ESD (lấy + LMB), bật máy hút khói và đèn kính lúp',
        hint: 'Vòng ESD nối đất qua 1 MΩ (§9). Đèn ≥ 1000 lm/m² (IPC), hút khói nhựa thông (HSE: hen nghề nghiệp, §7.3).',
        check: (g) => { const L = labState(g); return !!L.esd?.worn && !!L.fume?.on && !!L.lamp?.on; },
        where: whereAnchor('bench-solder', 200),
      },
      {
        id: 'docs', text: '2. Hồ sơ: mở SỔ TAY HÀN (N) → mục 9 "Quy trình 14 bước"',
        hint: 'N mở sổ tay · phím số chọn mục · ←/→ lật trang. NASA yêu cầu tài liệu hoá quy trình hàn (§11 bước 2).',
        done: (e) => e.type === 'solder:handbook' && /workflow/.test(e.page || ''),
      },
      {
        id: 'board', text: '3. Kẹp board đục lỗ MỚI vào kẹp mạch và SOI bo trần (I / kính hiển vi)',
        hint: 'Kiểm tra xước, pad oxy hoá trước khi hàn (§11 bước 3). Phím I soi điểm đang nhắm; ngồi ở bàn hàn + E vào kính hiển vi.',
        done: (e, g) => e.type === 'solder:graded' && !!boardInVise(g) && e.board === boardInVise(g),
        where: whereAnchor('vise-base', 120),
      },
      {
        id: 'temp', text: '4. Trả lời: nhiệt độ cho Sn63? rồi đặt trạm 330–350 °C và bật trạm',
        hint: 'Câu hỏi tự hiện. Bánh xe trên trạm hàn chỉnh ±5 °C. Sai: mất điểm và hỏi lại.',
        check: (g) => {
          if (!M.T.quizOk && !M.T.quizAsked && M.active()) { M.T.quizAsked = true; quiz(); }
          const st = labState(g).station;
          return !!M.T.quizOk && st.on && st.setpoint >= 320 && st.setpoint <= 360;
        },
        where: whereAnchor('station-solder', 160),
      },
      {
        id: 'resistor', text: '5. Linh kiện THẤP trước: hàn điện trở 10 kΩ + 330 Ω — mũi D16 hoặc 2C (§1.4)',
        hint: 'Bẻ chân (B) theo bước lỗ, cắm, lật bo. Chạm mũi vào CẢ pad + chân ~1 s, đưa thiếc phía đối diện, 2–4 s/mối.',
        check: (g) => { const b = boardInVise(g); return ['resistor-10k', 'resistor-330'].every((id) => partsOn(g, b, new RegExp(`^${id}$`)).some((r) => soldered(g, r))); },
        where: whereAnchor('vise-base', 120),
      },
      {
        id: 'header', text: '6. Header đực 4–6 chân (bước 2,54 mm) — KHÔNG cầu thiếc (mũi D16/2C/K)',
        hint: 'Hàn 1 chân, kiểm tra header thẳng, rồi mới hàn các chân còn lại. Mũi quá rộng (3C/4C/D32) chạm 2 pad → cầu thiếc.',
        check: (g) => partsOn(g, boardInVise(g), /^header-male/).some((h) => { const n = S(g)?.partJoints(h).length || 0; return n >= 4 && soldered(g, h, n); }),
        where: whereAnchor('vise-base', 120),
      },
      {
        id: 'led', text: '7. LED: KẸP TẢN NHIỆT lên chân (giữa thân và mối) rồi hàn ≤ 3 s/mối',
        hint: 'Kingbright: ≤ 300 °C, ≤ 3 s (§4.1). Cầm kẹp tản nhiệt, nhắm chân LED, LMB. Không kẹp + giữ lâu → LED mờ/chết.',
        check: (g) => partsOn(g, boardInVise(g), /^led-/).some((l) => soldered(g, l)),
        where: whereAnchor('vise-base', 120),
      },
      {
        id: 'cap', text: '8. Tụ hoá 100 µF — đúng cực, ≤ 3 s/mối (Chemi-con 380 °C/3 s)',
        hint: 'Chân dài = (+). Giữ mũi lâu → ống co rút, đáy phồng, rò dịch (§4.2).',
        check: (g) => partsOn(g, boardInVise(g), /^cap-elec-/).some((c) => soldered(g, c)),
        where: whereAnchor('vise-base', 120),
      },
      {
        id: 'terminal', text: '9. Cầu đấu vít 2P: ĐỔI MŨI TO (D24 / D32 / 3C) rồi hàn — chân to hút nhiệt',
        hint: 'Miếng chịu nhiệt tay trái + mỏ hàn tay phải → chuột phải: rút mũi nóng; nhìn mũi trên giá → T: lắp. Phủ thiếc mũi mới ngay!',
        check: (g) => partsOn(g, boardInVise(g), /^screw-terminal/).some((t) => { const js = S(g)?.partJoints(t) || []; return js.length >= 2 && js.every((j) => j.state === 'good' || j.state === 'excess'); }),
        where: whereAnchor('tip-rack', 120),
      },
      {
        id: 'trim', text: '10. Cắt chân: còn 0,5–1,5 mm (IPC Class 2 ≤ 2,5 mm, Class 3 ≤ 1,5 mm)',
        hint: 'Kìm cắt sát đỉnh mối, đeo kính bảo hộ (chân văng).',
        check: (g) => { const ps = leadPads(g, boardInVise(g)); return ps.length >= 10 && ps.every((p) => p.lead.L <= 2.5 && p.lead.L >= 0.5); },
        where: whereAnchor('vise-base', 120),
      },
      {
        id: 'inspect', text: '11. SOI TỪNG MỐI: kính hiển vi (ngồi + E, I) hoặc đèn kính lúp ≥ 1,5× (I) — IPC pad > 1 mm: 1,5–3×',
        hint: 'Mỗi mối có phiếu ĐẠT/KHÔNG ĐẠT. Cầu thiếc mảnh, mối nguội sần, lỗ khí chỉ lộ ở 7,5–10× (§13.4).',
        check: (g) => { const ps = leadPads(g, boardInVise(g)); return ps.length >= 10 && ps.every((p) => fresh(p)); },
        where: whereAnchor('vise-base', 120),
      },
      {
        id: 'rework', text: '12. Sửa mọi mối KHÔNG ĐẠT, soi lại ở CÙNG độ phóng đại (§10.6)',
        hint: 'Phát hiện → nguyên nhân → thêm flux → gia nhiệt lại / rút thiếc / thêm thiếc → soi lại.',
        check: (g) => { const ps = leadPads(g, boardInVise(g)); return ps.length >= 10 && ps.every((p) => fresh(p) && p.insp.pass); },
        where: whereAnchor('vise-base', 120),
      },
      {
        id: 'clean', text: '13. Làm sạch nhựa thông: bàn chải + IPA 99 % (giữ LMB lên mối) — trong ½ giờ (NASA)',
        hint: 'Chờ mối nguội (IPA dễ cháy). Không dùng siêu âm cho bo có linh kiện (§6.10).',
        check: (g) => { const b = boardInVise(g); return !!b && (P(g)?.residueLeft(b) ?? 1) === 0; },
        where: whereAnchor('vise-base', 120),
      },
      {
        id: 'reinspect', text: '14. Kiểm tra LẠI sau làm sạch — mọi mối ĐẠT',
        hint: 'Làm sạch có thể lộ lỗi bị nhựa thông che (§11 bước 11).',
        check: (g) => { const ps = leadPads(g, boardInVise(g)); return ps.length >= 10 && ps.every((p) => fresh(p) && p.insp.pass); },
        where: whereAnchor('vise-base', 120),
      },
      {
        id: 'continuity', text: '15. Đo thông mạch nguồn–GND (cầu đấu) — phải KHÔNG kêu',
        hint: 'Đồng hồ thang ·))) chạm 2 chân cầu đấu. Kêu = chập (§11 bước 12).',
        done: (e) => e.type === 'measure' && (e.mode === 'cont' || e.mode === 'ohm'),
      },
      {
        id: 'power', text: '16. Cấp nguồn lần đầu: 5 V, giới hạn dòng ≈ 30 % trên dòng dự kiến (LED ~9 mA → ~12 mA; ≤ 50 mA)',
        hint: 'Chạm giới hạn + áp tụt về ~0 → có chập, tắt ngay (§11 bước 13 [S][40]).',
        done: (e, g) => {
          if (e.type !== 'power:on' || e.source !== 'psu') return false;
          const il = e.ilim ?? g.lab?.psu?.channels?.[0]?.iset ?? 1;
          if (il > 0.05) { M.mistake(`Giới hạn dòng ${(il * 1000).toFixed(0)} mA — quá cao cho lần cấp nguồn đầu (dự kiến ~9 mA)`, 5, 'ilim-first'); return false; }
          return il >= 0.005;
        },
        where: whereAnchor('psu', 160),
      },
      {
        id: 'document', text: '17. Ghi chép: sổ tay (N) → mục 9 → trang "Biên bản QC" → S lưu biên bản',
        hint: 'NASA 13.3: lưu kết quả kiểm tra, lỗi đã sửa, ảnh (§11 bước 14).',
        done: (e) => e.type === 'solder:qc-report',
      },
    ],
    realLife: [
      'Chọn mũi: rộng ≈ 60 % pad (Metcal); THT pad Ø1,6–2 mm → D16/C2; ground/jack → D24/D32/C3/C4 (docs/07 §1.4).',
      'Nhiệt: 330–350 °C (Sn63) — mối nặng thì ĐỔI MŨI TO, thêm flux, preheat; tăng nhiệt là bước CUỐI (§3.5).',
      'Phủ thiếc mũi trước khi cất; lau bằng bùi nhùi đồng; tắt trạm khi nghỉ > 5 phút (§2.3–2.4).',
      'Soi pad > 1 mm ở 1,5–3× (trọng tài 4×); NASA 4–10×; văng thiếc kiểm không phóng đại (§10.1).',
      'LED/diode/transistor: ≤ 3 s, kẹp tản nhiệt đồng (§4.1, §6.11).',
    ],
    onStart(m) {
      m.T.quizAsked = false; m.T.quizOk = false; m.T.quizOpen = false; m.T.ledClip = false;
      m.T.inv0 = { ...(P(game)?.stats || {}) };
      m.T.log0 = P(game)?.tipLog.length || 0;
    },
    score(m) {
      const pro = P(game);
      let extra = 0;
      const b = boardInVise(game);
      if (pro && b) {
        const r2 = pro.qcReport(b, 2), r3 = pro.qcReport(b, 3);
        m.note(`IPC-A-610 Class 2: ${r2.truePass}/${r2.total} mối đạt (${Math.round(r2.truePassRate * 100)} %) · Class 3: ${r3.truePass}/${r3.total}`);
        extra -= Math.round((1 - r2.truePassRate) * 25);
        if (r3.total && r3.truePassRate >= 0.999) { extra += 5; m.note('Đạt cả Class 3 (hàng không / y tế) ✓'); }
        const d = Object.entries(r2.defects).map(([k, n]) => `${k}×${n}`).join(', ');
        if (d) m.note(`Lỗi còn lại (thật): ${d}`);
      }
      if (pro) {
        const s = pro.stats, s0 = m.T.inv0 || {};
        const dd = (k) => (s[k] || 0) - (s0[k] || 0);
        const log = pro.tipLog.slice(m.T.log0 || 0);
        const poor = log.filter((x) => !x.ok);
        if (poor.length) { extra -= Math.min(10, 2 * poor.length); m.note(`Chọn mũi chưa hợp ${poor.length} mối: ${[...new Set(poor.map((x) => tipVerdict(x.tip, x.kind).text))].slice(0, 3).join(' · ')}`); }
        else if (log.length) m.note('Chọn mũi đúng cho mọi loại mối ✓');
        if (dd('hotTipOnBench')) { extra -= 3; m.note('Đặt mũi nóng lên mặt bàn — dùng giá/khay mũi'); }
        if (dd('untinnedHot')) { extra -= 5; m.note('Mũi mới không phủ thiếc kịp → oxy hoá'); }
        if (dd('untinnedParks')) { extra -= 2; m.note('Cất mỏ khi mũi chưa phủ thiếc'); }
        if (dd('spongeWipes') > 4 && !dd('brassWipes')) m.note('Toàn lau bọt biển ướt — bùi nhùi đồng ít sốc nhiệt hơn (§2.4)');
        if (dd('tipChanges') >= 2 && !dd('tipBurns')) m.note('Thay mũi an toàn bằng miếng chịu nhiệt ✓');
        if (dd('inspections')) m.note(`Đã soi ${dd('inspections')} lần`);
      }
      return extra;
    },
  });
  if (!M) return null;
  M.def.mission = false;                       // không tính vào chuỗi m0–m6 (bảng nhiệm vụ: nhiệm vụ kỹ năng)
  M.def.recommends = ['m0-led'];
  // hư hỏng do nhiệt (mức nhẹ — chết hẳn đã bị trừ qua 'fault' dead) · kẹp tản nhiệt cho LED
  game.events.on('solder:overheat', (e) => { if (M.active() && e.part !== 'pcb' && (e.level || 0) < 3) M.mistake(`Quá nhiệt ${e.item?.def?.name || 'linh kiện'}: ${String(e.cause || '').split(' — ')[0]}`, 5, `ovh:${e.item?.uid}`); });
  game.events.on('solder:overheat', (e) => { if (M.active() && e.part === 'pcb') M.mistake(`Nền bo quá nhiệt (${e.cause})`, 3, `pcb:${e.padId}`); });
  game.events.on('heatsink:clip', (e) => { if (M.active() && e.on && /^led-/.test(e.item?.def?.id || '')) M.T.ledClip = true; });
  game.events.on('solder:joint', (e) => {
    if (!M.active() || !/^led-/.test(e.pad?.lead?.item?.def?.id || '')) return;
    const H = e.pad.lead.item.state?.heat;
    if (!(H?.clips?.length)) M.mistake('Hàn LED không kẹp tản nhiệt (NASA: thermal shunt khi nhiệt có thể làm hỏng linh kiện)', 3, 'led-noclip');
  });
  return M;
}
