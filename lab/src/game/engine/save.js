// =============================================================================
// save.js — Lưu / tải tiến trình vào localStorage 'robovac.game.save.v1'.
//
//   Lưu: tư thế người chơi · mọi item (id kiểu, uid, pose thế giới, state, khe đang cắm + hướng, đang cầm / trong túi)
//        · thanh dụng cụ · nhiệm vụ · dữ liệu module khác đăng ký qua save.register(key, { serialize(), deserialize(d) })
//        (mối hàn, dây nối… của minigame).
//   save.save('manual'|'auto'|'pause') · save.load() → data | null · save.apply(data) · save.has() · save.info()
//   save.clear() · save.update(dt) — tự lưu mỗi 30 s (khi đang chơi) · sự kiện 'game:saved' {reason}, 'game:loaded'
// =============================================================================
export const SAVE_KEY = 'robovac.game.save.v1';
const VERSION = 1;

function safeStorage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

export class Save {
  constructor(game, storage = safeStorage()) {
    this.game = game;
    this.storage = storage;
    this.modules = new Map();
    this.interval = 30;
    this._t = this.interval;
    this.enabled = true;
    this.lastSavedAt = null;
  }

  register(key, mod) { this.modules.set(key, mod); }

  has() { try { return !!this.storage?.getItem(SAVE_KEY); } catch { return false; } }

  info() {
    const d = this.load();
    if (!d?.time) return null;
    try { return new Date(d.time).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }); } catch { return String(d.time); }
  }

  clear() { try { this.storage?.removeItem(SAVE_KEY); } catch { /* */ } }

  collect() {
    const g = this.game;
    const items = [];
    for (const inst of g.items?.all || []) {
      if (inst.def.noSave) continue;
      try {
        const e = g.items.serializeInstance(inst);
        if (inst.socketInfo) e.socketInfo = inst.socketInfo;
        items.push(e);
      } catch (err) { console.warn('[save] bỏ qua item', inst.uid, err); }
    }
    const extra = {};
    for (const [k, m] of this.modules) { try { extra[k] = m.serialize(); } catch (err) { console.warn('[save] module', k, err); } }
    return {
      version: VERSION, time: Date.now(),
      player: g.player?.serialize(),
      items,
      inventory: g.inventory?.serialize(),
      quests: g.quests?.serialize(),
      extra,
    };
  }

  save(reason = 'manual') {
    if (!this.enabled || !this.storage) return false;
    try {
      const data = this.collect();
      this.storage.setItem(SAVE_KEY, JSON.stringify(data));
      this.lastSavedAt = data.time;
      this._t = this.interval;
      this.game.events?.emit('game:saved', { reason });
      if (reason === 'manual') this.game.hud?.toast?.('Đã lưu game', { kind: 'success', short: true });
      return true;
    } catch (err) {
      console.warn('[save] không lưu được', err);
      if (reason === 'manual') this.game.hud?.toast?.('Không lưu được (bộ nhớ trình duyệt đầy / bị chặn)', { kind: 'warn' });
      return false;
    }
  }

  load() {
    try {
      const raw = this.storage?.getItem(SAVE_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      return d?.version === VERSION ? d : null;
    } catch { return null; }
  }

  /** Khôi phục trạng thái từ dữ liệu đã lưu (gọi sau khi world + item mặc định đã dựng xong) */
  apply(data) {
    if (!data) return false;
    const g = this.game, items = g.items;
    const step = (name, fn) => { try { fn(); } catch (err) { console.warn(`[save] lỗi khôi phục ${name}`, err); } };
    // 1) item: ghép theo uid, không có thì theo kiểu, không có nữa thì sinh mới
    const matched = new Map();   // uid lưu → instance
    step('items', () => {
      const pool = new Map();
      const savedUids = new Set((data.items || []).map((e) => e.uid));
      for (const inst of items.all) {
        if (savedUids.has(inst.uid)) continue;
        if (!pool.has(inst.def.id)) pool.set(inst.def.id, []);
        pool.get(inst.def.id).push(inst);
      }
      for (const e of data.items || []) {
        let inst = items.byUid(e.uid) || pool.get(e.id)?.shift() || null;
        if (!inst) {
          if (!items.get(e.id)) { console.warn('[save] không còn item', e.id); continue; }
          inst = items.spawn(e.id, {}, { uid: e.uid, stowed: true });
          if (!inst) continue;
        }
        matched.set(e.uid, inst);
        // gỡ khỏi tay / khe / túi hiện tại
        if (inst.heldBy) { g.hands?.detach(inst.heldBy); inst.heldBy = null; }
        if (inst.socket) g.sockets?.release(inst, { silent: true });
        inst.inBag = false;
        inst.isHotbarTool = false;
        inst.phys.falling = false;
        if (e.state && typeof e.state === 'object') Object.assign(inst.state, e.state);
        const o = inst.object;
        items.root.add(o);
        if (e.pos) o.position.fromArray(e.pos);
        if (e.quat) o.quaternion.fromArray(e.quat);
        if (inst.state.subparts) g.subparts?.attach(inst);
      }
    });
    // 2) khe cắm
    step('sockets', () => {
      for (const e of data.items || []) {
        const inst = matched.get(e.uid);
        if (inst && e.socket) {
          const ok = g.sockets?.insertInstant(inst, e.socket, e.socketInfo?.orientation || 'ok', e.socketInfo?.rotSteps || 0);
          if (!ok) console.warn('[save] không cắm lại được', e.uid, '→', e.socket);
        }
      }
    });
    // 3) thanh dụng cụ + túi + vật đang cầm
    step('inventory', () => {
      const inv = g.inventory;
      if (!inv) return;
      if (inv.activeTool) inv.holster(true);
      const slotsSaved = data.inventory?.slots;
      if (Array.isArray(slotsSaved)) {
        for (let i = 0; i < 9; i++) {
          const uid = slotsSaved[i];
          if (!uid) continue;                       // ô trống trong bản lưu → giữ dụng cụ mặc định
          const inst = matched.get(uid) || items.byUid(uid);
          if (!inst) continue;
          inv.slots[i] = inst;
          inst.isHotbarTool = true;
          inst.object.parent?.remove(inst.object);
        }
      }
      inv.bag.clear();
      for (const e of data.items || []) {
        const inst = matched.get(e.uid);
        if (!inst) continue;
        if (e.inBag) inv.stash(inst, true);
      }
      const held = (data.items || []).find((e) => e.heldBy && !e.tool && !e.inBag && !inv.slots.includes(matched.get(e.uid)));
      if (held) {
        const inst = matched.get(held.uid);
        if (inst && g.hands) {
          const pose = inst.def.grip?.pose || 'grip';
          g.hands.attach('right', inst.object, { ...(inst.def.grip || {}), pose, item: inst });
          inst.heldBy = 'right';
        }
      } else {
        const r = data.inventory?.right ?? data.inventory?.active ?? -1;
        if (r >= 0 && inv.slots[r]) inv.select(r);
      }
      const l = data.inventory?.left ?? -1;
      if (l >= 0 && inv.slots[l] && inv.left !== l) inv.select(l);
      inv._refreshHud?.(true);
    });
    step('player', () => g.player?.deserialize(data.player));
    step('quests', () => g.quests?.deserialize(data.quests));
    for (const [k, m] of this.modules) step(k, () => m.deserialize?.(data.extra?.[k]));
    g.events?.emit('game:loaded', { time: data.time });
    return true;
  }

  update(dt) {
    if (!this.enabled) return;
    this._t -= dt;
    if (this._t <= 0) { this._t = this.interval; this.save('auto'); }
  }
}

