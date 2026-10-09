// =============================================================================
// inventory.js — Thanh dụng cụ 1–9 + túi linh kiện (GAME_API §6).
//
//   Phím 1–9: cầm dụng cụ ở ô tương ứng · 0 / Q: tay không · cuộn chuột (khi tay rảnh): đổi ô
//   Tab: mở/đóng túi linh kiện (đang NGỒI: Tab = chế độ tỉ mỉ, Shift+Tab = túi — engine/ux/seating.js) — W/S hoặc ↑/↓ hoặc cuộn để chọn, E / Enter / chuột trái để lấy ra tay,
//        mục đầu "Cất … vào túi" khi đang cầm linh kiện.
//
//   inventory.activeTool → ItemInstance | null (chuột trái) · secondaryTool (chuột phải, khi cầm 2 dụng cụ)
//   inventory.rightTool / leftTool · select(i 0..8) · holster(instant, side?) · cycle(±1)
//   Dụng cụ grip.hand 'left' (thiếc hàn, đồng hồ…) vào tay trái, cầm cùng lúc với dụng cụ tay phải (mỏ hàn).
//   inventory.adoptTool(inst)  (nhặt dụng cụ từ bàn) · stash(inst) · takeFromBag(defId) · bagEntries()
//   Dụng cụ mặc định: Mỏ hàn · Thiếc hàn · Nhíp · Tua vít PH1 · Kìm cắt · Kìm tuốt/bấm đầu · Đồng hồ vạn năng · Que đo nguồn bàn
//   (lấy từ registry theo tên/id; def.slot = 1..9 để ép vị trí). Sự kiện: 'tool:changed' {tool, slot}, 'item:stashed', 'item:unstashed'
// =============================================================================
import { toolKind } from './items.js';
import { defaultGripPose, itemName } from './interact.js';
import * as THREE from 'three';

/** Thứ tự ưu tiên dụng cụ mặc định (khớp theo id + tên) */
export const DEFAULT_TOOL_ORDER = [
  { label: 'Mỏ hàn', re: [/soldering[\s-]*iron/, /m[ỏo][\s-]*h[àa]n/, /(^|[\s-])iron/] },
  { label: 'Thiếc hàn', re: [/solder[\s-]*wire/, /thi[ếe]c[\s-]*h[àa]n/, /cu[ộo]n[\s-]*thi[ếe]c/] },
  { label: 'Nhíp', re: [/tweezer/, /nh[íi]p/] },
  { label: 'Tua vít PH1', re: [/ph1/, /screwdriver/, /tua[\s-]*v[íi]t/] },
  { label: 'Kìm cắt', re: [/flush[\s-]*cutter/, /k[ìi]m[\s-]*c[ắa]t/, /cutter/] },
  { label: 'Kìm tuốt/bấm đầu', re: [/wire[\s-]*stripper/, /tu[ốo]t/, /crimp/, /b[ấa]m/] },
  { label: 'Đồng hồ vạn năng', re: [/multimeter/, /đồng[\s-]*hồ[\s-]*v[ạa]n/, /dmm/] },
  { label: 'Que đo nguồn bàn', re: [/psu[\s-]*lead/, /que[\s-]*đo/, /probe/] },
];

const ICONS = { iron: '🔥', solder: '🧵', tweezers: '🥢', screwdriver: '🪛', pliers: '✂️', cutter: '✂️', meter: '📟', probe: '🔌', default: '🧰' };

export class Inventory {
  constructor(game) {
    this.game = game;
    this.slots = new Array(9).fill(null);      // ItemInstance (dụng cụ) hoặc null
    this.right = -1;                           // ô dụng cụ tay phải (-1 = tay không)
    this.left = -1;                            // ô dụng cụ tay trái
    this.bag = new Map();                      // defId → ItemInstance[]
    this.bagOpen = false;
    this.bagSel = 0;
    this._hudT = 0;
    const ev = game.events;
    ev.on('input:key', (e) => this._onKey(e));
    ev.on('input:wheel', (e) => { if (this.bagOpen) this._moveSel(e.delta); });
    ev.on('input:mouse', (e) => { if (this.bagOpen && e.down && e.button === 0) this._bagActivate(); });
  }

  get rightTool() { return this.right >= 0 ? this.slots[this.right] : null; }
  get leftTool() { return this.left >= 0 ? this.slots[this.left] : null; }
  /** Dụng cụ dùng bằng chuột trái: tay phải, không có thì tay trái */
  get activeTool() { return this.rightTool || this.leftTool; }
  /** Dụng cụ dùng bằng chuột phải (chỉ khi cầm 2 dụng cụ) */
  get secondaryTool() { return this.rightTool && this.leftTool ? this.leftTool : null; }
  get active() { return this.right >= 0 ? this.right : this.left; }

  /** Dựng thanh dụng cụ mặc định từ các def kind 'tool' */
  init() {
    const items = this.game.items;
    const isTool = (d) => d.kind === 'tool' || (!d.kind && !!d.tool);
    let tools = items.defs().filter((d) => isTool(d) && !d.hidden);
    if (!tools.length) tools = items.defs().filter(isTool);      // chưa có dụng cụ thật → dùng dụng cụ thử
    const used = new Set();
    const put = (i, def) => {
      if (i < 0 || i > 8 || this.slots[i] || used.has(def.id)) return false;
      const inst = items.spawn(def.id, {}, { stowed: true });
      if (!inst) return false;
      inst.isHotbarTool = true;
      this.slots[i] = inst;
      used.add(def.id);
      return true;
    };
    for (const d of tools) if (Number.isInteger(d.slot)) put(d.slot - 1, d);
    DEFAULT_TOOL_ORDER.forEach((o, i) => {
      if (this.slots[i]) return;
      for (const re of o.re) {
        const d = tools.find((t) => !used.has(t.id) && re.test(`${t.id} ${t.name || ''}`.toLowerCase()));
        if (d) { put(i, d); break; }
      }
    });
    for (const d of tools) {
      if (used.has(d.id)) continue;
      const free = this.slots.indexOf(null);
      if (free < 0) break;
      put(free, d);
    }
    this._refreshHud(true);
  }

  // ------------------------------------------------------------------ chọn dụng cụ (2 tay)
  // Dụng cụ có grip.hand === 'left' (thiếc hàn, đồng hồ, ống hút thiếc…) vào TAY TRÁI và có thể cầm CÙNG LÚC
  // với dụng cụ tay phải (mỏ hàn) → chuột trái dùng dụng cụ tay phải, chuột phải dùng dụng cụ tay trái.
  // Nhấn lại phím của dụng cụ đang cầm → cất nó. Q / 0 → cất cả hai.
  static sideOf(inst) { return inst?.def?.grip?.hand === 'left' ? 'left' : 'right'; }

  select(i) {
    const game = this.game;
    if (i < 0) { this._setSide('right', -1); this._setSide('left', -1); this._changed(null, 0, null); return; }
    const inst = this.slots[i];
    if (!inst) { game.audio?.play('error'); return; }
    const side = Inventory.sideOf(inst);
    if ((side === 'right' ? this.right : this.left) === i) {
      // nhấn lại → cất dụng cụ đó
      const prev = inst;
      this._setSide(side, -1);
      this._changed(this.activeTool, this.activeTool ? this.slots.indexOf(this.activeTool) + 1 : 0, prev);
      return;
    }
    // tay phải đang cầm linh kiện → cất vào túi trước
    const held = game.interact?.heldItem;
    if (held && side === 'right') {
      if (game.interact.inspecting) game.interact.stopInspect();
      this.stash(held, true);
      game.hud?.toast?.(`Đã cất ${itemName(held)} vào túi (Tab)`, { kind: 'info', short: true });
    }
    const prev = side === 'right' ? this.rightTool : this.leftTool;
    this._setSide(side, i);
    this._changed(inst, i + 1, prev);
  }

  /** Đổi dụng cụ ở một tay (có hoạt cảnh hạ tay – đưa lên) */
  _setSide(side, i) {
    const game = this.game;
    const cur = side === 'right' ? this.right : this.left;
    if (cur === i) return;
    const prev = cur >= 0 ? this.slots[cur] : null;
    const inst = i >= 0 ? this.slots[i] : null;
    if (side === 'right') this.right = i; else this.left = i;
    const swap = () => {
      if (prev && prev.heldBy) this._unequip(prev);
      if (inst && (side === 'right' ? this.rightTool : this.leftTool) === inst) this._equip(inst);
    };
    if (game.hands && !game.app.headless && (prev || inst)) game.hands.swap(side, swap);
    else swap();
  }

  _changed(tool, slot, previous) {
    this.game.audio?.play('whoosh', { vol: 0.15 });
    this.game.events.emit('tool:changed', { tool, slot, previous, right: this.rightTool, left: this.leftTool });
    this._refreshHud(true);
  }

  holster(instant = false, side = null) {
    if (this.right < 0 && this.left < 0) return;
    if (!instant) { if (side) this._setSide(side, -1); else this.select(-1); return; }
    const sides = side ? [side] : ['right', 'left'];
    let prev = null;
    for (const sd of sides) {
      const i = sd === 'right' ? this.right : this.left;
      if (i < 0) continue;
      prev = this.slots[i];
      if (sd === 'right') this.right = -1; else this.left = -1;
      if (prev) this._unequip(prev);
    }
    this.game.events.emit('tool:changed', { tool: this.activeTool, slot: this.activeTool ? this.slots.indexOf(this.activeTool) + 1 : 0, previous: prev, right: this.rightTool, left: this.leftTool });
    this._refreshHud(true);
  }

  cycle(d) {
    const n = 10;   // tay không + 9 ô
    let idx = this.right + 1;   // 0 = tay không
    for (let k = 0; k < n; k++) {
      idx = (idx + (d > 0 ? 1 : -1) + n) % n;
      if (idx === 0 || (this.slots[idx - 1] && Inventory.sideOf(this.slots[idx - 1]) === 'right')) break;
    }
    if (idx === 0) { if (this.right >= 0) { const prev = this.rightTool; this._setSide('right', -1); this._changed(this.activeTool, 0, prev); } }
    else this.select(idx - 1);
  }

  _equip(inst) {
    const game = this.game;
    const side = inst.def.grip?.hand === 'left' ? 'left' : 'right';
    const cam = game.camera;
    // xuất hiện từ dưới tầm nhìn rồi trôi vào tay
    if (!inst.object.parent) {
      game.scene.add(inst.object);
      cam.updateMatrixWorld();
      inst.object.position.set(side === 'left' ? -150 : 150, -450, -250).applyMatrix4(cam.matrixWorld);
      inst.object.quaternion.copy(cam.quaternion);
    }
    const pose = inst.def.grip?.pose || `holdTool:${toolKind(inst.def) || 'default'}`;
    game.hands.attach(side, inst.object, { ...(inst.def.grip || {}), pose, item: inst });
    inst.heldBy = side;
    try { inst.def.tool?.onEquip?.({ game, instance: inst }); } catch (e) { console.error(e); }
  }

  _unequip(inst) {
    const game = this.game;
    game.interact?.endUseOf?.(inst);
    if (inst.heldBy) game.hands.detach(inst.heldBy);
    inst.heldBy = null;
    inst.object.parent?.remove(inst.object);
    try { inst.def.tool?.onUnequip?.({ game, instance: inst }); } catch (e) { console.error(e); }
  }

  /** Dụng cụ nhặt từ thế giới → vào ô trống (hoặc thay ô đang chọn) rồi cầm luôn */
  adoptTool(inst) {
    const game = this.game;
    let i = this.slots.indexOf(null);
    if (i < 0) i = this.right >= 0 ? this.right : 8;
    const old = this.slots[i];
    if (old && old !== inst) {
      // ô đầy: dụng cụ cũ đặt lại xuống chân
      if (this.right === i) this.holster(true, 'right');
      if (this.left === i) this.holster(true, 'left');
      old.isHotbarTool = false;
      game.scene.add(old.object);
      game.items.root.attach(old.object);
      old.object.position.copy(game.player.pos).add(new THREE.Vector3(0, 900, 0));
      game.items.drop(old);
    }
    inst.isHotbarTool = true;
    inst.object.parent?.remove(inst.object);
    this.slots[i] = inst;
    game.audio?.play('pickup');
    game.hud?.toast?.(`${itemName(inst)} → ô ${i + 1} trên thanh dụng cụ`, { kind: 'success', short: true });
    game.events.emit('item:picked', { item: inst, toHotbar: i + 1 });
    if (Inventory.sideOf(inst) === 'right' && this.rightTool) this.holster(true, 'right');
    this.select(i);
  }

  // ------------------------------------------------------------------ túi linh kiện
  stash(inst, silent = false) {
    const game = this.game;
    if (!inst) return false;
    if (inst.heldBy) { game.hands.detach(inst.heldBy); inst.heldBy = null; }
    if (inst.socket) game.sockets?.release(inst, { silent: true });
    inst.object.parent?.remove(inst.object);
    inst.inBag = true;
    if (!this.bag.has(inst.def.id)) this.bag.set(inst.def.id, []);
    this.bag.get(inst.def.id).push(inst);
    if (!silent) game.audio?.play('pickup', { vol: 0.6 });
    game.events.emit('item:stashed', { item: inst });
    return true;
  }

  takeFromBag(defId) {
    const list = this.bag.get(defId);
    if (!list?.length) return null;
    const game = this.game;
    const held = game.interact?.heldItem;
    if (held) this.stash(held, true);
    if (this.rightTool) this.holster(true, 'right');
    const inst = list.pop();
    if (!list.length) this.bag.delete(defId);
    inst.inBag = false;
    const cam = game.camera;
    game.scene.add(inst.object);
    cam.updateMatrixWorld();
    inst.object.position.set(160, -420, -260).applyMatrix4(cam.matrixWorld);
    const pose = inst.def.grip?.pose || defaultGripPose(inst);
    game.hands.attach('right', inst.object, { ...(inst.def.grip || {}), pose, item: inst });
    inst.heldBy = 'right';
    game.audio?.play('pickup');
    game.events.emit('item:unstashed', { item: inst });
    game.events.emit('item:picked', { item: inst, fromBag: true });
    return inst;
  }

  bagEntries() {
    const out = [];
    const held = this.game.interact?.heldItem;
    if (held) out.push({ action: 'stash', label: `Cất ${itemName(held)} vào túi`, icon: '⤵', count: null });
    for (const [id, list] of this.bag) {
      if (!list.length) continue;
      const def = list[0].def;
      out.push({ action: 'take', id, label: def.name || id, icon: def.icon || '🔩', count: list.length, desc: def.desc || def.summary || '' });
    }
    return out;
  }

  toggleBag(open = !this.bagOpen) {
    const game = this.game;
    this.bagOpen = open;
    game.app.uiMode = open ? 'bag' : null;
    game.app.uiBlocksMovement = open;
    game.player.lookEnabled = !open;
    if (open) { game.interact?._cancelAll?.(); this.bagSel = 0; }
    game.audio?.play('ui');
    this._renderBag();
  }

  _moveSel(d) {
    const n = this.bagEntries().length;
    if (!n) return;
    this.bagSel = (this.bagSel + (d > 0 ? 1 : -1) + n) % n;
    this.game.audio?.play('tick');
    this._renderBag();
  }

  _bagActivate(index = this.bagSel) {
    const e = this.bagEntries()[index];
    if (!e) return;
    if (e.action === 'stash') this.stash(this.game.interact.heldItem);
    else this.takeFromBag(e.id);
    this.toggleBag(false);
  }

  _renderBag() {
    const hud = this.game.hud;
    if (!hud) return;
    if (!this.bagOpen) { hud.hideBag?.(); return; }
    const entries = this.bagEntries();
    this.bagSel = Math.min(this.bagSel, Math.max(0, entries.length - 1));
    hud.showBag?.(entries, this.bagSel, (i) => { this.bagSel = i; this._bagActivate(i); });
  }

  // ------------------------------------------------------------------ phím
  _onKey(e) {
    if (!e.down || e.repeat) return;
    const app = this.game.app;
    if (app.paused && !this.bagOpen) return;
    if (!this.bagOpen && this.game.ux?.capture?.(e)) return;   // [UX] khi ngồi: Tab = thao tác tỉ mỉ (Shift+Tab = túi)
    if (e.code === 'Tab') { if (!app.uiMode || this.bagOpen) this.toggleBag(); return; }
    if (this.bagOpen) {
      if (e.code === 'Escape') this.toggleBag(false);
      else if (e.code === 'KeyW' || e.code === 'ArrowUp') this._moveSel(-1);
      else if (e.code === 'KeyS' || e.code === 'ArrowDown') this._moveSel(1);
      else if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') this._bagActivate();
      else if (/^Digit[1-9]$/.test(e.code)) this._bagActivate(+e.code.slice(5) - 1);
      return;
    }
    if (app.uiMode) return;
    if (this.game.interact?.inspecting) return;
    if (e.code === 'KeyQ' || e.code === 'Digit0' || e.code === 'Backquote') { this.select(-1); return; }
    const m = /^(Digit|Numpad)([1-9])$/.exec(e.code);
    if (m) this.select(+m[2] - 1);
  }

  // ------------------------------------------------------------------ HUD
  hotbarModel() {
    const slots = [{ key: 'Q', icon: '✋', name: 'Tay không', status: '', active: this.right < 0 && this.left < 0 }];
    this.slots.forEach((inst, i) => {
      if (!inst) { slots.push({ key: String(i + 1), empty: true, active: false }); return; }
      let status = '';
      try { status = inst.def.tool?.hud?.(inst) || ''; } catch { status = ''; }
      slots.push({ key: String(i + 1), icon: inst.def.icon || ICONS[toolKind(inst.def)] || ICONS.default, name: inst.def.name || inst.def.id, status, active: this.right === i || this.left === i, hand: this.left === i ? 'L' : this.right === i ? 'R' : '' });
    });
    return slots;
  }

  update(dt) {
    this._hudT -= dt;
    if (this._hudT <= 0) this._refreshHud();
  }

  _refreshHud(force = false) {
    this._hudT = 0.25;
    const hud = this.game.hud;
    if (!hud) return;
    hud.updateHotbar?.(this.hotbarModel(), force);
    const lines = [], names = [];
    for (const t of [this.rightTool, this.leftTool]) {
      if (!t) continue;
      names.push(t.def.name || t.def.id);
      try { const l = t.def.tool?.hud?.(t); if (l) lines.push(l); } catch { /* */ }
    }
    hud.setToolLCD?.(names.length ? names.join(' + ') : null, lines.length ? lines.join('\n') : null);
  }

  serialize() {
    return {
      right: this.right, left: this.left,
      slots: this.slots.map((s) => (s ? s.uid : null)),
      bag: [...this.bag.values()].flat().map((i) => i.uid),
    };
  }
}
