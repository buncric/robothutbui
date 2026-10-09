// =============================================================================
// quests.js — Hệ nhiệm vụ (GAME_API §8).
//
//   quests.define({ id, title, intro, steps:[{ id, text, hint?, done?(e, game, stats) → bool, check?(game, stats) → bool,
//                                            where?(game) → Vector3 (điểm đánh dấu trên HUD) }],
//                   reward:{ xp }, scoring?(stats) → { score, notes:[…] }, autoStart?: bool, order?: number })
//   quests.start(id) · quests.active (đang làm) · quests.list() · quests.progress(id) · quests.reset(id)
//   Lắng nghe MỌI sự kiện (events '*'): bước hiện tại xong khi done(e) = true (hoặc check() = true, kiểm tra 4 lần/s).
//   stats = { events: { type: số lần }, faults: [e…], startedAt, time, steps: [{ id, t }] } — dùng để chấm điểm.
//   Sự kiện phát ra: 'quest:started' {quest} · 'quest:step' {quest, step, index} · 'quest:completed' {quest, score, notes, xp}
//
// [nhiệm vụ] Mở rộng 2026-10 (tương thích ngược — mọi trường mới đều TUỲ CHỌN, nhiệm vụ cũ chạy y như trước):
//   def.requires: ['m1-han-pic']   → nhiệm vụ bị KHOÁ tới khi các nhiệm vụ kia xong (trừ khi quests.freeMode = true — "Chế độ tự do")
//   def.chapter: 'Ngày 1 · 15–16h' → nhãn hiển thị trên bảng nhiệm vụ · def.lessonId → link "Xem bài học"
//   def.idleHint: 60               → đứng yên ở một bước quá N giây thì nhắc lại gợi ý (step.hint) bằng toast + 'quest:hint'
//   def.failOn(e, game, stats) → chuỗi lý do | null  — kiểm tra mỗi sự kiện; trả chuỗi → nhiệm vụ THẤT BẠI
//   def.summary(stats, result)   → { mistakes:[…], realLife:[…], lessonId } — thẻ tổng kết khi xong / thất bại (hud.questSummary)
//   def.onStart(game) / def.onStop(game, why)  — dựng bàn / dọn dẹp khi bắt đầu / kết thúc
//   quests.status(id) → 'locked'|'available'|'active'|'done'|'failed' · quests.fail(id, { reason, notes }) · quests.freeMode
//   Sự kiện thêm: 'quest:failed' {quest, reason} · 'quest:hint' {quest, step}
// =============================================================================
import * as THREE from 'three';

export class Quests {
  constructor(game) {
    this.game = game;
    this.defs = new Map();
    this.state = new Map();       // id → { step, done, startedAt, completedAt, score, notes, stats }
    this.activeId = null;
    this.xp = 0;
    this._checkT = 0;
    this.freeMode = false;        // [nhiệm vụ] "Chế độ tự do": bỏ khoá điều kiện tiên quyết
    game.events.on('*', (e) => this._onEvent(e));
  }

  // ---------------------------------------------------------------- [nhiệm vụ] khoá / trạng thái / thất bại
  /** Các nhiệm vụ tiên quyết chưa xong */
  missingRequirements(id) {
    const def = this.defs.get(id);
    return (def?.requires || []).filter((r) => this.defs.has(r) && !this.state.get(r)?.done);
  }
  isLocked(id) { return !this.freeMode && this.missingRequirements(id).length > 0; }
  status(id) {
    const s = this.state.get(id);
    if (id === this.activeId && s && !s.done) return 'active';
    if (s?.done) return 'done';
    if (s?.failed) return 'failed';
    return this.isLocked(id) ? 'locked' : 'available';
  }
  setFreeMode(on) {
    this.freeMode = !!on;
    this.game.events.emit('quest:freemode', { on: this.freeMode });
    this._renderHud();
  }
  /** Nhiệm vụ thất bại (vd. cháy chip vì chưa chỉnh buck): dừng, ghi lý do, hiện thẻ tổng kết */
  fail(id, { reason = '', notes = [] } = {}) {
    const def = this.defs.get(id);
    const s = this.state.get(id);
    if (!def || !s || s.done || s.failed) return false;
    s.failed = true;
    s.failReason = reason;
    s.score = 0;
    s.notes = notes;
    if (this.activeId === id) this.activeId = null;
    try { def.onStop?.(this.game, 'failed'); } catch (err) { console.warn('[quests] onStop', err); }
    this.game.audio?.play('error');
    this.game.hud?.toast?.(`Nhiệm vụ THẤT BẠI: ${def.title} — ${reason}`, { kind: 'danger', ms: 7000 });
    this._showSummary(def, s, { failed: true, reason, score: 0, notes });
    this.game.events.emit('quest:failed', { quest: def, reason });
    this._renderHud();
    return true;
  }
  _showSummary(def, s, result) {
    if (!def.summary) return;
    let card = null;
    try { card = def.summary(s.stats, result) || null; } catch (err) { console.warn('[quests] summary()', def.id, err); }
    if (!card) return;
    card = { id: def.id, title: def.title, chapter: def.chapter || '', lessonId: def.lessonId || null, time: s.stats?.time || 0, ...result, ...card };
    s.summary = card;
    this.lastSummary = card;
    this.game.hud?.questSummary?.(card);
    this.game.events.emit('quest:summary', { quest: def, card });
  }

  define(def) {
    if (!def?.id || !Array.isArray(def.steps)) throw new Error('quests.define: cần { id, steps:[] }');
    this.defs.set(def.id, def);
    this.game.events.emit('quest:defined', { quest: def });
    this._renderHud();
    return def;
  }

  get active() { return this.activeId ? this.defs.get(this.activeId) : null; }
  progress(id) { return this.state.get(id) || null; }

  list() {
    return [...this.defs.values()].sort((a, b) => (a.order ?? 99) - (b.order ?? 99)).map((d) => {
      const s = this.state.get(d.id);
      return { id: d.id, title: d.title, intro: d.intro, done: !!s?.done, active: d.id === this.activeId, step: s?.step ?? 0, total: d.steps.length, score: s?.score ?? null,
        // [nhiệm vụ] thêm cho bảng nhiệm vụ
        status: this.status(d.id), failed: !!s?.failed, recommends: (d.recommends || []).filter((r) => this.defs.has(r) && !this.state.get(r)?.done), failReason: s?.failReason || '', requires: d.requires || [], missing: this.missingRequirements(d.id),
        chapter: d.chapter || '', lessonId: d.lessonId || null, best: s?.best ?? null, mission: !!d.mission, summary: s?.summary || null };
    });
  }

  _newStats() { return { events: {}, faults: [], startedAt: this.game.time?.now ?? 0, time: 0, steps: [] }; }

  start(id, { force = false } = {}) {
    const def = this.defs.get(id);
    if (!def) { console.warn('[quests] không có nhiệm vụ', id); return false; }
    // [nhiệm vụ] khoá theo điều kiện tiên quyết (Chế độ tự do / force bỏ qua)
    if (!force && this.isLocked(id)) {
      const miss = this.missingRequirements(id).map((r) => this.defs.get(r)?.title || r);
      this.game.hud?.toast?.(`"${def.title}" còn khoá — cần xong trước: ${miss.join(', ')} (hoặc bật "Chế độ tự do")`, { kind: 'warn' });
      return false;
    }
    let s = this.state.get(id);
    if (id === this.activeId && s && !s.done && !s.failed) return true;     // [nhiệm vụ] đang làm rồi → không dựng lại
    const best = s?.best ?? (s?.done ? s.score : null);
    if (!s || s.done || s.failed) { s = { step: 0, done: false, startedAt: this.game.time?.now ?? 0, stats: this._newStats(), best }; this.state.set(id, s); }
    // [nhiệm vụ] đang làm nhiệm vụ khác → tạm dừng nhiệm vụ đó (tiến độ giữ nguyên)
    if (this.activeId && this.activeId !== id) { try { this.defs.get(this.activeId)?.onStop?.(this.game, 'switched'); } catch (err) { console.warn(err); } }
    s.idleT = 0; s.hintN = 0;
    this.activeId = id;
    try { def.onStart?.(this.game); } catch (err) { console.warn('[quests] onStart', id, err); }
    this.game.events.emit('quest:started', { quest: def });
    if (def.intro) this.game.hud?.toast?.(`Nhiệm vụ: ${def.title} — ${def.intro}`, { kind: 'info', ms: 5000 });
    this._skipDone(def, s);
    this._renderHud();
    return true;
  }

  reset(id) { this.state.delete(id); if (this.activeId === id) this.activeId = null; this._renderHud(); }

  _onEvent(e) {
    if (e.type.startsWith('quest:') || e.type === 'footstep' || e.type.startsWith('input:')) return;
    const def = this.active;
    if (!def) return;
    const s = this.state.get(def.id);
    if (!s || s.done) return;
    // thống kê để chấm điểm
    s.stats.events[e.type] = (s.stats.events[e.type] || 0) + 1;
    if (e.type === 'fault') s.stats.faults.push({ kind: e.kind, t: s.stats.time });
    // [nhiệm vụ] điều kiện thất bại
    if (def.failOn) {
      let why = null;
      try { why = def.failOn(e, this.game, s.stats); } catch (err) { console.warn('[quests] lỗi failOn()', def.id, err); }
      if (why) { this.fail(def.id, { reason: String(why) }); return; }
    }
    const step = def.steps[s.step];
    if (!step?.done) return;
    let ok = false;
    try { ok = !!step.done(e, this.game, s.stats); } catch (err) { console.warn('[quests] lỗi done()', def.id, step.id, err); }
    if (ok) this._advance(def, s);
  }

  _advance(def, s) {
    const step = def.steps[s.step];
    s.stats.steps.push({ id: step?.id, t: +s.stats.time.toFixed(2) });
    s.step++;
    s.idleT = 0; s.hintN = 0;     // [nhiệm vụ] gợi ý khi đứng yên: đếm lại
    this.game.events.emit('quest:step', { quest: def, step, index: s.step - 1 });
    this.game.audio?.play('toast', { vol: 0.6 });
    if (s.step >= def.steps.length) { this._complete(def, s); return; }
    this._skipDone(def, s);
    this._renderHud();
  }

  /** Bước có check() đã thoả ngay → qua luôn */
  _skipDone(def, s) {
    let guard = 0;
    while (!s.done && guard++ < def.steps.length) {
      const st = def.steps[s.step];
      if (!st?.check) break;
      let ok = false;
      try { ok = !!st.check(this.game, s.stats); } catch { ok = false; }
      if (!ok) break;
      s.stats.steps.push({ id: st.id, t: +s.stats.time.toFixed(2) });
      s.step++;
      this.game.events.emit('quest:step', { quest: def, step: st, index: s.step - 1 });
      if (s.step >= def.steps.length) this._complete(def, s);
    }
  }

  _complete(def, s) {
    s.done = true;
    s.completedAt = this.game.time?.now ?? 0;
    let score = null, notes = [];
    try { const r = def.scoring?.(s.stats); if (r) { score = r.score ?? null; notes = r.notes || []; } } catch (err) { console.warn(err); }
    s.score = score; s.notes = notes;
    const xp = def.reward?.xp || 0;
    this.xp += xp;
    if (this.activeId === def.id) this.activeId = null;
    this.game.audio?.play('quest');
    if (score != null) s.best = Math.max(s.best ?? 0, score);     // [nhiệm vụ] điểm cao nhất
    try { def.onStop?.(this.game, 'completed'); } catch (err) { console.warn('[quests] onStop', err); }
    this.game.hud?.questComplete?.({ title: def.title, score, notes, xp });
    this._showSummary(def, s, { failed: false, score, notes, xp });     // [nhiệm vụ] thẻ tổng kết (nếu def.summary)
    this.game.events.emit('quest:completed', { quest: def, score, notes, xp });
    // tự bắt đầu nhiệm vụ kế tiếp (nếu có autoStart) — [nhiệm vụ] bỏ qua nhiệm vụ còn khoá
    const next = [...this.defs.values()].sort((a, b) => (a.order ?? 99) - (b.order ?? 99)).find((d) => d.autoStart && !this.state.get(d.id)?.done && d.id !== def.id && !this.isLocked(d.id));
    if (next) setTimeout(() => this.start(next.id), 2500);
    this._renderHud();
  }

  update(dt) {
    const def = this.active;
    if (!def) { this.game.hud?.setMarker?.(null); return; }
    const s = this.state.get(def.id);
    if (!s || s.done) return;
    s.stats.time += dt;
    // [nhiệm vụ] đứng yên quá def.idleHint giây ở một bước → nhắc gợi ý
    if (def.idleHint) {
      s.idleT = (s.idleT || 0) + dt;
      if (s.idleT >= def.idleHint) {
        s.idleT = 0; s.hintN = (s.hintN || 0) + 1;
        const st = def.steps[s.step];
        const hint = typeof st?.hint === 'function' ? st.hint(this.game) : st?.hint;
        if (hint) { this.game.hud?.toast?.(`💡 Gợi ý: ${hint}`, { kind: 'info', ms: 7000 }); this.game.events.emit('quest:hint', { quest: def, step: st, hint, n: s.hintN }); }
      }
    }
    this._checkT -= dt;
    if (this._checkT <= 0) {
      this._checkT = 0.25;
      const step = def.steps[s.step];
      if (step?.check) {
        let ok = false;
        try { ok = !!step.check(this.game, s.stats); } catch (err) { console.warn('[quests] lỗi check()', err); }
        if (ok) { this._advance(def, s); return; }
      }
      // điểm đánh dấu
      let where = null;
      try { where = step?.where?.(this.game) || null; } catch { where = null; }
      this.game.hud?.setMarker?.(where && (where.isVector3 ? where : new THREE.Vector3(...where)), step?.markerLabel || '');
    }
  }

  _renderHud() {
    const hud = this.game.hud;
    if (!hud) return;
    const def = this.active;
    if (!def) { hud.setQuest?.(null); return; }
    const s = this.state.get(def.id);
    hud.setQuest?.({
      title: def.title,
      steps: def.steps.map((st, i) => ({ text: st.text, done: i < s.step, current: i === s.step })),
      hint: (typeof def.steps[s.step]?.hint === 'function' ? def.steps[s.step].hint(this.game) : def.steps[s.step]?.hint) || '',
      chapter: def.chapter || '',
    });
  }

  serialize() {
    const out = { active: this.activeId, xp: this.xp, quests: {}, freeMode: this.freeMode };
    for (const [id, s] of this.state) {
      out.quests[id] = { step: s.step, done: s.done, score: s.score ?? null, time: +(s.stats?.time || 0).toFixed(1) };
      // [nhiệm vụ] thất bại / điểm cao nhất / thẻ tổng kết
      if (s.failed) { out.quests[id].failed = true; out.quests[id].failReason = s.failReason || ''; }
      if (s.best != null) out.quests[id].best = s.best;
      if (s.summary) out.quests[id].summary = s.summary;
    }
    return out;
  }

  deserialize(d) {
    if (!d) return;
    this.xp = d.xp || 0;
    this.freeMode = !!d.freeMode;      // [nhiệm vụ]
    for (const [id, q] of Object.entries(d.quests || {})) {
      const st = this._newStats(); st.time = q.time || 0;
      this.state.set(id, { step: q.step || 0, done: !!q.done, score: q.score ?? null, stats: st, failed: !!q.failed, failReason: q.failReason || '', best: q.best ?? null, summary: q.summary || null });
    }
    this.activeId = d.active && this.defs.has(d.active) && !this.state.get(d.active)?.done && !this.state.get(d.active)?.failed ? d.active : null;
    // [nhiệm vụ] nhiệm vụ đang làm dở khi lưu → dựng lại bàn làm việc của nó
    if (this.activeId) { try { this.defs.get(this.activeId)?.onResume?.(this.game); } catch (err) { console.warn('[quests] onResume', err); } }
    this._renderHud();
  }
}

/** Nhiệm vụ mẫu dựng sẵn: làm quen phòng lab */
export function defineDemoQuest(quests) {
  return quests.define({
    id: 'lam-quen-lab',
    title: 'Làm quen phòng lab',
    intro: 'Đi lại, cầm nắm và đổi dụng cụ.',
    order: 0,
    autoStart: true,
    steps: [
      { id: 'move', text: 'Đi lại bằng W A S D, nhìn quanh bằng chuột', hint: 'Giữ Shift để chạy, C để cúi.', check: (g) => (g.player?.distanceWalked || 0) > 2000 },
      { id: 'pick', text: 'Nhìn vào một vật trên bàn và nhấn E để nhặt', hint: 'Tâm ngắm có viền xanh = với tới được.', done: (e) => e.type === 'item:picked' && e.item?.def?.kind !== 'tool' && !e.toHotbar,
        where: (g) => g.items?.all.find((i) => !i.isHotbarTool && i.def.kind !== 'tool' && i.object.parent && !i.heldBy)?.object.getWorldPosition(new THREE.Vector3()) || null },
      { id: 'inspect', text: 'Giữ chuột phải để soi vật, kéo chuột để xoay', done: (e) => e.type === 'item:inspected' },
      { id: 'place', text: 'Nhắm vào mặt bàn (bóng xanh) và nhấn E để đặt xuống', hint: 'R để xoay 90° trước khi đặt.', done: (e) => e.type === 'item:placed' },
      { id: 'tool', text: 'Nhấn phím 1–9 để cầm một dụng cụ', done: (e) => e.type === 'tool:changed' && !!e.tool },
      { id: 'holster', text: 'Nhấn Q để cất dụng cụ (tay không)', done: (e) => e.type === 'tool:changed' && !e.tool },
    ],
    reward: { xp: 50 },
    scoring: (st) => {
      const notes = [];
      let score = 100;
      if (st.events['item:dropped']) { score -= 5 * st.events['item:dropped']; notes.push('Đừng làm rơi linh kiện — có thể gãy chân!'); }
      if (st.time < 120) notes.push('Nhanh nhẹn!');
      return { score: Math.max(0, score), notes };
    },
  });
}
