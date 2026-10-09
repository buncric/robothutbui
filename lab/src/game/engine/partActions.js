// =============================================================================
// partActions.js — Biến các hàm "thao tác" mà def linh kiện cung cấp (items/parts/_shared.js) thành gợi ý phím.
//
// Khi CẦM linh kiện trên tay phải:
//   [B] Bẻ chân 90° (bendLeads)           — cuộn chuột chọn khoảng cách chân (bước 2.54 mm); bẻ lại lần nữa = đổi bước / duỗi
//   [T] Nắn thẳng chân IC (straightenLegs) — chân DIP mới xoè ~6°
//   [B] Bẻ header còn N chân (breakTo)     — cuộn chọn N; phần còn lại thành header mới (cất vào túi)
//   [B] Cắt đoạn dây N mm (cut)            — cuộn chọn độ dài; phát 'wire:cut' {item, spec} cho minigame đi dây
//   [V] Đổi màu dây (setColor) · cuộn: độ dài dây (setLength)
// Khi NHÌN vào linh kiện (tay không / cầm dụng cụ):
//   [LMB] Gạt công tắc (toggle) · [Giữ LMB] Nhấn nút (press/release; ESP32: BOOT/EN theo nút đang nhìn)
//   [Cuộn] Vặn biến trở (turnTrimmer, cần tua vít) · [Cuộn] Siết / nới vít cầu đấu (driveScrew, cần tua vít)
// Mở rộng chung: def.actions = [{ key, label, held?:true (khi cầm) | target?:true (khi nhìn), hold?, when?(inst, game, ctx),
//                                 do(inst, game, ctx), onRelease?(inst, game, ctx), scroll?(inst, game, delta, ctx) }]
// Mọi thao tác phát 'part:action' {item, action, result}; kết quả { ok:false, reason } → toast cảnh báo.
// =============================================================================
import * as THREE from 'three';
import { toolKind } from './items.js';

const WIRE_COLORS = ['red', 'black', 'yellow', 'green', 'blue', 'white', 'orange', 'brown', 'grey', 'violet'];
const COLOR_VI = { red: 'đỏ', black: 'đen', yellow: 'vàng', green: 'xanh lá', blue: 'xanh dương', white: 'trắng', orange: 'cam', brown: 'nâu', grey: 'xám', violet: 'tím' };

export class PartActions {
  constructor(game) {
    this.game = game;
    this.sel = new WeakMap();      // instance → { span, count, len } lựa chọn hiện tại (cuộn chuột)
  }

  _s(inst) { let s = this.sel.get(inst); if (!s) { s = {}; this.sel.set(inst, s); } return s; }

  /** Gọi một hàm thao tác của def, xử lý kết quả chung */
  run(inst, action, fn, { quiet = false, sound = 'click', gesture = 'squeeze' } = {}) {
    const game = this.game;
    let r;
    try { r = fn(); } catch (e) { console.error(`[partActions] ${inst.def.id}.${action}`, e); r = { ok: false, reason: 'Lỗi thao tác' }; }
    r = r ?? { ok: true };
    if (r.ok === false) {
      game.hud?.toast?.(r.reason || 'Không làm được', { kind: 'warn', short: true });
      game.audio?.play('error');
    } else {
      if (!quiet) game.audio?.play(r.sound || sound, { pos: inst.object, vol: 0.7 });
      if (gesture) game.hands?.playGesture(gesture, inst.heldBy === 'left' ? 'left' : 'right');
      if (r.fatigue) game.hud?.toast?.(r.fatigue, { kind: 'warn', short: true });
      if (r.endStop) game.hud?.toast?.(r.endStop, { kind: 'warn', short: true });
    }
    game.events?.emit('part:action', { item: inst, action, result: r });
    return r;
  }

  hasScrewdriver() {
    const t = this.game.inventory?.activeTool;
    return !!t && /screwdriver/.test(toolKind(t.def) || '');
  }

  // ------------------------------------------------------------------ khi cầm
  heldPrompts(inst) {
    const def = inst.def, s = this._s(inst), out = [];
    const game = this.game;
    if (def.bendLeads && def.leadBendable) {
      const st = inst.state || {};
      const min = def.minSpanN || 1;
      if (s.span == null) s.span = st.leadSpanN ? st.leadSpanN : min + (def.leadStyle === 'axial' ? 1 : 0);
      const same = st.leadSpanN && st.leadSpanN === s.span;
      out.push({
        key: 'B',
        label: same ? 'Duỗi thẳng chân' : `Bẻ chân 90° · ${s.span} bước (${(s.span * 2.54).toFixed(2)} mm) — cuộn để chỉnh`,
        do: () => {
          const n = same ? null : s.span;
          const r = this.run(inst, 'bendLeads', () => def.bendLeads(inst, n));
          if (r.ok !== false) game.hud?.toast?.(n ? `Đã bẻ chân: khoảng ${(n * 2.54).toFixed(2)} mm` : 'Đã duỗi thẳng chân', { kind: 'success', short: true });
        },
      });
      s.scroll = (d) => { s.span = THREE.MathUtils.clamp((s.span || min) - d, min, min + 12); game.audio?.play('tick'); return true; };
    }
    if (def.straightenLegs && !inst.state?.legsStraight) {
      out.push({ key: 'T', label: 'Nắn thẳng chân IC (tì cả hàng xuống bàn)', do: () => {
        const r = this.run(inst, 'straightenLegs', () => def.straightenLegs(inst), { gesture: 'push' });
        if (r.ok !== false) game.hud?.toast?.('Đã nắn thẳng chân — giờ cắm vào đế/board sẽ khớp', { kind: 'success', short: true });
      } });
    }
    if (def.breakTo) {
      const cur = inst.object.userData?.count ?? inst.state?.count ?? 40;
      if (cur > 1) {
        if (s.count == null || s.count >= cur) s.count = Math.min(cur - 1, 8);
        out.push({ key: 'B', label: `Bẻ header còn ${s.count} chân — cuộn để chỉnh`, do: () => {
          const r = this.run(inst, 'breakTo', () => def.breakTo(inst, s.count), { sound: 'snap' });
          if (r.ok !== false && r.spawn?.id) {
            const rest = game.items.spawn(r.spawn.id, {}, { stowed: true });
            if (rest) {
              Object.assign(rest.state, r.spawn.state || {});
              try { rest.def.init?.(rest, game); } catch { /* */ }
              game.inventory?.stash(rest, true);
              game.hud?.toast?.(`Phần còn lại (${r.remainder} chân) đã cất vào túi`, { kind: 'info', short: true });
            }
          }
          s.count = null;
        } });
        s.scroll = (d) => { s.count = THREE.MathUtils.clamp((s.count || 1) - d, 1, cur - 1); game.audio?.play('tick'); return true; };
      }
    }
    if (def.cut) {
      if (s.len == null) s.len = 150;
      out.push({ key: 'B', label: `Cắt đoạn dây ${s.len} mm — cuộn để chỉnh`, do: () => {
        const r = this.run(inst, 'cut', () => def.cut(inst, s.len), { sound: 'snap' });
        if (r.ok !== false) {
          game.events?.emit('wire:cut', { item: inst, spec: r.spawn || null, lengthMm: s.len });
          game.hud?.toast?.(`Đã cắt ${s.len} mm dây${r.remainingMm != null ? ` · cuộn còn ${(r.remainingMm / 1000).toFixed(1)} m` : ''}`, { kind: 'success', short: true });
        }
      } });
      s.scroll = (d) => { s.len = THREE.MathUtils.clamp((s.len || 150) - d * 10, 10, 2000); game.audio?.play('tick'); return true; };
    }
    if (def.setColor) {
      out.push({ key: 'V', label: `Đổi màu dây (${COLOR_VI[inst.state?.color] || inst.state?.color || 'hiện tại'})`, do: () => {
        const i = WIRE_COLORS.indexOf(inst.state?.color);
        const c = WIRE_COLORS[(i + 1) % WIRE_COLORS.length];
        this.run(inst, 'setColor', () => def.setColor(inst, c), { sound: 'tick', gesture: null });
      } });
    }
    if (def.setLength && !s.scroll) {
      s.scroll = (d) => {
        const len = inst.state?.lengthMm ?? inst.object.userData?.jw?.len ?? 150;
        this.run(inst, 'setLength', () => def.setLength(inst, len - d * 10), { sound: 'tick', gesture: null });
        return true;
      };
    }
    for (const a of def.actions || []) {
      if (!a.held) continue;
      try { if (a.when && !a.when(inst, game, null)) continue; } catch { continue; }
      out.push({ key: a.key, label: typeof a.label === 'function' ? a.label(inst, game) : a.label, hold: !!a.hold,
        do: a.hold ? undefined : () => this.run(inst, a.id || a.key, () => a.do(inst, game, null)),
        onStart: a.hold ? () => this.run(inst, a.id || a.key, () => a.do(inst, game, null)) : undefined,
        onRelease: a.onRelease ? () => a.onRelease(inst, game, null) : undefined });
      if (a.scroll) s.scroll = (d) => { a.scroll(inst, game, d, null); return true; };
    }
    return out;
  }

  /** Cuộn chuột khi đang cầm → thao tác của linh kiện (nếu có). true = đã xử lý */
  heldScroll(inst, delta) {
    const s = this.sel.get(inst);
    if (!s?.scroll) { this.heldPrompts(inst); }
    const s2 = this.sel.get(inst);
    return s2?.scroll ? !!s2.scroll(delta) : false;
  }

  // ------------------------------------------------------------------ khi nhìn
  /** → { prompts:[…], onScroll?(ctx, delta) } cho linh kiện đang nhìn */
  targetSpec(inst, hit) {
    const def = inst.def, game = this.game;
    const prompts = [];
    let onScroll = null;
    if (def.toggle) {
      prompts.push({ key: 'LMB', label: inst.state?.on ? 'Gạt công tắc → TẮT' : 'Gạt công tắc → BẬT', do: () => {
        const r = this.run(inst, 'toggle', () => def.toggle(inst), { gesture: 'tap' });
        if (r.ok !== false) game.events?.emit('switch:changed', { item: inst, on: !!(r.on ?? inst.state?.on) });
      } });
    }
    if (def.press) {
      const which = this._whichButton(inst, hit);
      prompts.push({
        key: 'LMB', hold: true, label: `Nhấn${which ? ` nút ${which}` : ' nút'}`,
        onStart: () => {
          const r = this.run(inst, 'press', () => def.press(inst, which || undefined), { gesture: 'tap' });
          if (r.ok !== false) game.events?.emit('button:pressed', { item: inst, which, result: r });
        },
        onHold: () => false,
        onRelease: () => {
          if (!def.release) return;
          const r = this.run(inst, 'release', () => def.release(inst, which || undefined), { quiet: false, gesture: null });
          if (r.ok !== false) game.events?.emit('button:released', { item: inst, which, result: r });
        },
      });
    }
    if (def.turnTrimmer) {
      const ok = this.hasScrewdriver();
      prompts.push({ key: 'WHEEL', label: 'Vặn biến trở chỉnh áp ra', disabled: !ok, reason: 'cần tua vít' });
      onScroll = (ctx, d) => {
        if (!this.hasScrewdriver()) { game.hud?.toast?.('Cần tua vít để vặn biến trở', { kind: 'warn', short: true }); return; }
        const r = this.run(inst, 'turnTrimmer', () => def.turnTrimmer(inst, -d * 0.5), { sound: 'tick', gesture: 'twist' });
        if (r.ok !== false && r.vout != null) game.hud?.setLCD?.(`Vout ≈ ${r.vout.toFixed(2)} V\n(${r.turns} vòng)`, 'Biến trở');
        clearTimeout(this._lcdT); this._lcdT = setTimeout(() => game.hud?.setLCD?.(null), 2500);
      };
    }
    if (def.driveScrew) {
      const ok = this.hasScrewdriver();
      prompts.push({ key: 'WHEEL', label: 'Siết / nới vít cầu đấu', disabled: !ok, reason: 'cần tua vít' });
      onScroll = (ctx, d) => {
        if (!this.hasScrewdriver()) { game.hud?.toast?.('Cần tua vít để siết vít', { kind: 'warn', short: true }); return; }
        const i = this._nearestIndex(inst.object.userData?.screws, hit?.point);
        const r = this.run(inst, 'driveScrew', () => def.driveScrew(inst, i, -d * 0.25), { sound: 'tick', gesture: 'twist' });
        if (r.ok !== false) {
          game.events?.emit('screw:driven', { item: inst, node: `screw-${i}`, torque: r.clamped ? 0.4 : 0.1, stripped: !!r.stripped, removed: false, dir: d < 0 ? 'in' : 'out' });
          if (r.stripped) game.hud?.toast?.('Siết quá tay — có thể toét đầu vít!', { kind: 'warn', short: true });
        }
      };
    }
    for (const a of def.actions || []) {
      if (!a.target) continue;
      try { if (a.when && !a.when(inst, game, { hit })) continue; } catch { continue; }
      const ctx = { hit };
      prompts.push({ key: a.key, hold: !!a.hold, label: typeof a.label === 'function' ? a.label(inst, game) : a.label,
        do: a.hold ? undefined : () => this.run(inst, a.id || a.key, () => a.do(inst, game, ctx)),
        onStart: a.hold ? () => this.run(inst, a.id || a.key, () => a.do(inst, game, ctx)) : undefined,
        onHold: a.hold ? () => false : undefined,
        onRelease: a.onRelease ? () => a.onRelease(inst, game, ctx) : undefined });
      if (a.scroll) onScroll = (c, d) => a.scroll(inst, game, d, c);
    }
    return { prompts, onScroll };
  }

  _whichButton(inst, hit) {
    const btn = inst.object.userData?.btn;
    if (!btn || typeof btn !== 'object') return null;
    const keys = Object.keys(btn);
    if (!keys.length) return null;
    // nút là tổ tiên của vật trúng tia → chọn nút đó; không thì nút gần điểm trúng nhất
    for (const k of keys) for (let o = hit?.object; o; o = o.parent) if (o === btn[k]) return k;
    const objs = keys.map((k) => btn[k]);
    const i = this._nearestIndex(objs, hit?.point);
    return keys[i] ?? keys[0];
  }

  _nearestIndex(objs, point) {
    if (!Array.isArray(objs) || !objs.length || !point) return 0;
    let best = 0, bd = Infinity;
    const v = new THREE.Vector3();
    objs.forEach((o, i) => { if (!o?.getWorldPosition) return; const d = o.getWorldPosition(v).distanceTo(point); if (d < bd) { bd = d; best = i; } });
    return best;
  }
}
