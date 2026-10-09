// =============================================================================
// quests/_mission.js — [nhiệm vụ] Khung chung cho chuỗi nhiệm vụ M2–M6 (đồ án robot hút bụi thật, kế hoạch 3 ngày docs/03).
//
//   const M = defineMission(game, {
//     id, title, chapter: 'Ngày 1 · 15–16h', intro, order, requires: ['m1-han-pic'], lessonId,
//     kit: [{ id: 'pickit3', at: 'bench-test', dx: 0, dz: 0, rotY }]   // bày dụng cụ/linh kiện còn thiếu khi bắt đầu
//     steps: [...],                                                    // như quests.define (done/check/hint/where)
//     safety: { psuMaxIlim: 0.2 },                                     // chấm điểm an toàn chung
//     realLife: ['…'],                                                 // "ngoài đời thật nhớ làm" trên thẻ tổng kết
//     failOn(e, game, stats, M) → lý do | null, score(M, stats) → điểm cộng/trừ thêm, onStart(M), onStop(M, why), onResume(M)
//   })
//   M.active() · M.mistake(text, pts, key?) (trừ điểm, key = chỉ trừ 1 lần) · M.note(text) · M.T (bộ đếm riêng, reset khi bắt đầu)
//   M.find(pred | id) · M.anchorPos(name) · M.spawnKit() · M.fail(reason)
//
// An toàn chấm chung (khi nhiệm vụ đang chạy): bật nguồn bàn với giới hạn dòng quá cao · sửa mạch khi có điện (power:hot-edit)
//   · linh kiện cháy/nổ (fault) · hàn khi máy hút khói tắt (safety:fume) · bỏng · rời bàn khi trạm hàn bật
//   · kết thúc mà mỏ hàn còn cầm trên tay khi trạm bật / nguồn bàn còn bật.
// Gợi ý: đứng yên 60 s ở một bước → toast gợi ý (quests.js def.idleHint).
// =============================================================================
import * as THREE from 'three';
import { labState } from '../world/_labState.js';

export const isLive = (it) => !!it && !it.inBag && !it.isHotbarTool && !!it.object?.parent;
export const posOf = (it) => (it?.object ? it.object.getWorldPosition(new THREE.Vector3()) : null);

export function defineMission(game, spec) {
  const Q = game.quests;
  if (!Q || Q.defs.has(spec.id)) return null;
  const ev = game.events;
  const M = {
    id: spec.id, spec, game,
    T: {}, mistakes: [], notes: [], spawned: [],
    active: () => Q.activeId === spec.id,
    mistake(text, pts = 5, key = null) {
      if (key && M.mistakes.some((m) => m.key === key)) return false;
      M.mistakes.push({ text, pts, key });
      if (M.active()) game.hud?.toast?.(`⚠ ${text}${pts ? ` (−${pts})` : ''}`, { kind: 'warn' });
      ev.emit('mission:mistake', { quest: spec.id, text, pts });
      return true;
    },
    note(text) { if (!M.notes.includes(text)) M.notes.push(text); },
    find(pred) {
      const f = typeof pred === 'string' ? (i) => i.def?.id === pred : pred;
      return game.items.all.find((i) => isLive(i) && f(i)) || null;
    },
    findAll(pred) {
      const f = typeof pred === 'string' ? (i) => i.def?.id === pred : pred;
      return game.items.all.filter((i) => isLive(i) && f(i));
    },
    anchorPos(name) {
      const a = game.world?.anchors?.[name];
      return a ? a.getWorldPosition(new THREE.Vector3()) : null;
    },
    /** Bày bộ linh kiện của nhiệm vụ (chỉ những món chưa có trong phòng) */
    spawnKit() {
      const made = [];
      const counts = {};
      for (const k of spec.kit || []) {
        counts[k.id] = (counts[k.id] || 0) + 1;
        const have = game.items.all.filter((i) => i.def?.id === k.id && (isLive(i) || i.inBag || i.isHotbarTool)).length;
        if (have >= counts[k.id]) continue;
        if (!game.items.get(k.id)) continue;
        const a = M.anchorPos(k.at || 'bench-assembly') || new THREE.Vector3(0, 750, 0);
        try {
          const it = game.items.spawn(k.id, { pos: [a.x + (k.dx || 0), a.y + (k.dy ?? 30), a.z + (k.dz || 0)], rotY: k.rotY || 0, drop: k.drop !== false });
          if (it) { made.push(it); M.spawned.push(it.uid); if (k.state) Object.assign(it.state, k.state); }
        } catch (e) { console.warn('[mission] không bày được', k.id, e); }
      }
      if (made.length) game.hud?.toast?.(`Đã bày ${made.length} món cho nhiệm vụ lên ${spec.kitLabel || 'bàn'}`, { kind: 'info', short: true });
      return made;
    },
    fail(reason) { return Q.fail(spec.id, { reason }); },
  };

  const reset = () => {
    M.T = { ...(spec.counters || {}) };
    M.mistakes = [];
    M.notes = [];
    M.T._maxIlim = 0;
  };
  reset();

  // ---------------------------------------------------------------- chấm an toàn chung
  const S = spec.safety || {};
  ev.on('power:on', (e) => {
    if (!M.active() || e.source !== 'psu') return;
    const il = e.ilim ?? game.lab?.psu?.channels?.[0]?.iset ?? 0;
    M.T._maxIlim = Math.max(M.T._maxIlim || 0, il);
    if (S.psuMaxIlim && il > S.psuMaxIlim + 1e-6) M.mistake(`Bật nguồn bàn với giới hạn dòng ${il.toFixed(2)} A (nên ≤ ${S.psuMaxIlim} A cho mạch mới)`, 10, 'psu-ilim');
  });
  ev.on('power:hot-edit', (e) => {
    if (!M.active() || S.allowHotEdit) return;
    M.T._hot = (M.T._hot || 0) + 1;
    if (M.T._hot <= 4) M.mistake(`Cắm/rút ${e.item?.def?.name || 'linh kiện'} khi mạch đang có điện — tắt nguồn trước khi sửa mạch`, 5);
  });
  ev.on('fault', (e) => {
    if (!M.active()) return;
    if (['dead', 'burn', 'explode'].includes(e.kind)) M.mistake(`${e.item?.def?.name || 'Linh kiện'} hỏng: ${e.cause || e.kind}`, 15, `fault:${e.item?.uid}`);
    else if (e.kind === 'reversed-ic') M.mistake(`${e.item?.def?.name || 'IC'} cắm NGƯỢC khấc khi cấp nguồn`, 10, `rev:${e.item?.uid}`);
    else if (e.kind === 'bent-pins') M.mistake('Cong chân linh kiện khi cắm lệch', 3);
    else if (e.kind === 'screw-stripped') M.mistake('Trờn đầu vít (sai cỡ mũi / vặn lệch)', 4);
  });
  ev.on('safety:fume', () => { if (M.active()) M.mistake('Hàn khi máy hút khói TẮT', 5, 'fume'); });
  ev.on('safety:burn', () => { if (M.active()) M.mistake('Bỏng tay — giữ tay xa mũi hàn', 5); });
  ev.on('safety:iron-left-on', () => { if (M.active()) M.mistake('Rời bàn khi trạm hàn còn bật', 10, 'iron-left'); });

  // ---------------------------------------------------------------- định nghĩa
  const def = {
    id: spec.id, title: spec.title, intro: spec.intro, order: spec.order, chapter: spec.chapter, lessonId: spec.lessonId,
    requires: spec.requires || [], mission: true, idleHint: spec.idleHint ?? 60, autoStart: spec.autoStart ?? true,
    steps: spec.steps,
    reward: { xp: spec.xp ?? 200 },
    onStart(g) {
      reset();                      // (quests.start đã toast phần giới thiệu)
      M.spawnKit();
      try { spec.onStart?.(M); } catch (e) { console.warn('[mission] onStart', spec.id, e); }
      void g;
    },
    onResume() { try { spec.onResume ? spec.onResume(M) : spec.onStart?.(M); } catch (e) { console.warn('[mission] onResume', e); } },
    onStop(g, why) { try { spec.onStop?.(M, why); } catch (e) { console.warn('[mission] onStop', e); } void g; },
    failOn: (e, g, st) => (spec.failOn ? spec.failOn(e, g, st, M) : null),
    scoring(st) {
      // kiểm tra an toàn lúc kết thúc
      const lab = labState(game);
      const iron = game.inventory?.rightTool?.def?.id === 'soldering-iron';
      if (iron && lab.station?.on) M.mistake('Kết thúc vẫn cầm mỏ hàn nóng — cắm mỏ hàn về giá, tắt trạm', 5, 'iron-hand');
      if (S.psuOffAtEnd && lab.psu?.channels?.[0]?.out) M.mistake('Nguồn bàn vẫn bật OUTPUT khi xong việc', 3, 'psu-on');
      let score = 100;
      let extra = 0;
      try { extra = spec.score?.(M, st) || 0; } catch (e) { console.warn('[mission] score', e); }
      for (const m of M.mistakes) score -= m.pts;
      score += extra;
      const min = (st.time || 0) / 60;
      if (spec.fastMin && min < spec.fastMin) { score += 5; M.note(`Nhanh gọn: ${min.toFixed(1)} phút`); }
      if (!M.mistakes.length) M.note('Không mắc lỗi an toàn nào ✓');
      return { score: Math.max(0, Math.min(100, Math.round(score))), notes: [...M.notes] };
    },
    summary(st, result) {
      return {
        mistakes: M.mistakes.map((m) => `${m.text}${m.pts ? ` (−${m.pts})` : ''}`),
        notes: result.failed ? M.notes : result.notes,
        realLife: spec.realLife || [],
        lessonId: spec.lessonId,
      };
    },
  };
  Q.define(def);
  M.def = def;
  return M;
}

/** Bước phụ: đặt nhãn "where" theo item đầu tiên khớp */
export const whereItem = (pred) => (g) => {
  const f = typeof pred === 'string' ? (i) => i.def?.id === pred : pred;
  const it = g.items.all.find((i) => isLive(i) && !i.heldBy && f(i));
  return it ? posOf(it).add(new THREE.Vector3(0, 60, 0)) : null;
};
export const whereAnchor = (name, dy = 120) => (g) => {
  const a = g.world?.anchors?.[name];
  return a ? a.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, dy, 0)) : null;
};

/** Mạng (net) của chân `pin` của item, tính cả dây — null nếu chưa nối */
export function netOf(game, it, pinName) { return it ? game.netlist?.netOfPin(it, pinName) ?? null : null; }
/** 2 chân (item, pin) cùng mạng? */
export function sameNet(game, a, pa, b, pb) {
  const na = netOf(game, a, pa), nb = netOf(game, b, pb);
  return !!na && na === nb;
}
/** Điểm gắn của que đo hiện tại (đỏ/đen) → mạng */
export function probeNets(game) {
  const NL = game.netlist, ms = game.measuring;
  if (!NL || !ms) return { red: null, black: null };
  const N = NL.get();
  const net = (att) => { const k = att ? NL.keyOf(att) : null; return k ? N.uf2?.find?.(k) ?? N.uf.find(k) : null; };
  return { red: net(ms.red), black: net(ms.black), redAtt: ms.red, blackAtt: ms.black };
}
/** Mạng (uf2 — tính cả dây) của một chân, cùng hệ khoá với probeNets */
export function pinNet(game, it, pinName) {
  const NL = game.netlist;
  if (!NL || !it) return null;
  const N = NL.get();
  const k = `p:${it.uid}:${pinName}`;
  return N.uf2?.find?.(k) ?? N.uf.find(k);
}

/** "Bo PIC" của người chơi: ưu tiên chip CÒN SỐNG đang cắm trong đế DIP-40, rồi chip còn sống bất kỳ, rồi chip bất kỳ */
export function boardPic(game) {
  const pics = game.items.all.filter((i) => /pic16f877/i.test(i.def?.id || '') && isLive(i));
  return pics.find((i) => !i.state?.dead && i.socket && /dip40/.test(game.sockets?.get(i.socket)?.kind || ''))
    || pics.find((i) => !i.state?.dead) || pics[0] || null;
}

/**
 * Hai mạng có nối ĐIỆN với nhau qua đồng bên trong module không? (netlist của game chỉ gộp chân theo dây/khe; bộ giải mạch
 * thì gộp thêm: buck XL4015/LM2596 IN− ≡ OUT− (commonGround), DRV8871 GND ≡ T-GND, VM ≡ T-VM (electrical.nets), BSS138 GND ≡ GND2…)
 */
export function sameNode(game, netA, netB) {
  if (!netA || !netB) return false;
  if (netA === netB) return true;
  const par = new Map();
  const find = (x) => { let r = x; while (par.has(r) && par.get(r) !== r) r = par.get(r); return r; };
  const uni = (a, b) => { if (!a || !b) return; const ra = find(a), rb = find(b); if (ra !== rb) par.set(ra, rb); };
  for (const it of game.items.all) {
    if (!isLive(it)) continue;
    const E = it.def?.electrical;
    if (!E) continue;
    const n = (p) => pinNet(game, it, p);
    if (E.type === 'buck' || E.commonGround) uni(n('IN−'), n('OUT−'));
    if (E.nets && typeof E.nets === 'object') for (const grp of Object.values(E.nets)) if (Array.isArray(grp)) for (let i = 1; i < grp.length; i++) uni(n(grp[0]), n(grp[i]));
    if (E.type === 'level-shifter') uni(n('GND'), n('GND2'));
  }
  return find(netA) === find(netB);
}
