// =============================================================================
// ux/hints.js — GỢI Ý PHÍM NỔI trong không gian 3D + MẸO LẦN ĐẦU.
//
//   Chip nổi phía trên các vật tương tác trong vòng ~2.5 m mà người chơi đang hướng mặt về (±40°): biểu tượng + phím + động từ
//   ("🪑 E Ngồi", "🗄️ E Mở ngăn kéo", "✋ E Nhặt"). Mờ dần theo khoảng cách / góc lệch, tối đa 6 chip (gọn: 3, chỉ phím),
//   ưu tiên gần + chính giữa tầm nhìn, gộp các vật trùng nhãn ở sát nhau (dãy ngăn kéo), bỏ vật bị tường che,
//   ẩn khi mở menu / túi / laptop / soi vật / kính hiển vi / xem gần. Vật đang nhìn thẳng không có chip (đã có thanh hành động).
//   Cài đặt 'hints': 'full' | 'compact' | 'off' (Esc → Cài đặt → Gợi ý phím).
//   hints.compute() → [{ object, spec, item, key, hold, label, icon, pos, dist, score }]   (chạy được trong Node — để test)
//   hints.primaryPrompt(object) → { key, hold, label, icon } | null
//   Mẹo lần đầu: lần đầu nhìn một LOẠI vật (ghế, ngăn kéo, núm nguồn, trạm hàn, kẹp mạch, đồng hồ, kính hiển vi, laptop, bảng)
//   → thẻ hướng dẫn 7 s (ux/keys.js TIPS), nhớ trong cài đặt 'tipsSeen'. hints.showTipOnce(kind) · hints.resetTips()
// =============================================================================
import * as THREE from 'three';
import { iconFor, tipKindOf, TIPS, scrollLabelFor } from './keys.js';

const RANGE = 2500, RANGE_COMPACT = 1800;
const COS_MAX = Math.cos(THREE.MathUtils.degToRad(42));
const COS_FULL = Math.cos(THREE.MathUtils.degToRad(22));
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _f = new THREE.Vector3(), _box = new THREE.Box3();
const call = (v, ...a) => (typeof v === 'function' ? v(...a) : v);

export class Hints {
  constructor(game, ux) {
    this.game = game;
    this.ux = ux;
    this.list = [];             // chip đang hiển thị (đã chọn)
    this._t = 0;
    this._ray = new THREE.Raycaster();
    this._lastTipTarget = null;
    game.events?.on?.('tool:changed', (e) => { if (e.tool?.def?.id === 'multimeter') this.showTipOnce('multimeter'); });
  }

  get mode() { return this.game.quality?.settings?.hints || 'full'; }

  /** Hành động chính của một vật (cho chip) */
  primaryPrompt(object) {
    const spec = object.userData?.interactSpec;
    const item = object.userData?.item || spec?.item || null;
    const it = this.game.interact;
    const held = it?.heldItem;
    if (item) {
      if (item.heldBy || item.inBag || item.isHotbarTool || held) return null;
      if (!this.game.items?.pickable?.(item)) return null;
      return { key: 'E', label: item.def.kind === 'tool' ? 'Lấy' : 'Nhặt', icon: iconFor(spec, null, item) };
    }
    if (!spec) return null;
    const ctx = { game: this.game, object, spec, item: null, hit: null, point: null, held };
    let best = null, dis = null;
    for (const p of spec.prompts || []) {
      try { if (p.when && !p.when(ctx)) continue; } catch { continue; }
      let en = true;
      try { if (p.enabled) en = !!p.enabled(ctx); } catch { en = false; }
      if (!en) { if (!dis && p.key === 'E') dis = p; continue; }
      if (!best || (p.key === 'E' && best.key !== 'E')) best = p;
      if (best.key === 'E') break;
    }
    let disabled = false;
    if ((!best || best.key !== 'E') && dis && spec.hintDisabled !== false) { best = dis; disabled = true; }   // hành động chính đang khoá → chip mờ
    // núm xoay: "Cuộn  <việc>" rõ hơn "Giữ & kéo…"
    const nm = () => { try { return String(call(spec.name, ctx) || ''); } catch { return ''; } };
    if (best && best.key !== 'E' && spec.onScroll) return { key: 'WHEEL', label: shortLabel(scrollLabelFor(spec, nm())), icon: '🎛️' };
    if (!best) {
      if (spec.onScroll) return { key: 'WHEEL', label: shortLabel(scrollLabelFor(spec, nm())), icon: '🎛️' };
      return null;
    }
    let label = '';
    try { label = call(best.label, ctx) || ''; } catch { label = ''; }
    label = shortLabel(label);
    return { key: best.key, hold: !!best.hold, label, icon: iconFor(spec, { label }), disabled };
  }

  /** Điểm neo chip (đỉnh hộp bao + 40 mm), có cache theo vật tĩnh */
  _anchor(object, out) {
    const ud = object.userData;
    const spec = ud.interactSpec;
    if (spec?.hintAnchors) {
      const pts = spec.hintAnchors();
      const eye = this._eye;
      let best = null, bd = Infinity;
      for (const p of pts) { const d = p.distanceToSquared(eye); if (d < bd) { bd = d; best = p; } }
      return best ? out.copy(best) : null;
    }
    object.getWorldPosition(out);
    const moving = !!ud.item;
    if (!ud._uxTop || moving) {
      _box.setFromObject(object);
      if (_box.isEmpty()) return out.add(_v2.set(0, 60, 0));
      const c = _box.getCenter(_v2);
      ud._uxTop = [c.x - out.x, _box.max.y - out.y + 30, c.z - out.z];
    }
    return out.add(_v2.set(ud._uxTop[0], ud._uxTop[1], ud._uxTop[2]));
  }

  _occluded(p) {
    const eye = this._eye;
    const dir = _v2.subVectors(p, eye);
    const len = dir.length();
    dir.divideScalar(len);
    this._ray.set(eye, dir);
    for (const b of this.game.world?.colliders || []) {
      if (b.containsPoint(eye)) continue;
      const q = this._ray.ray.intersectBox(b, _v);
      if (!q) continue;
      if (q.distanceTo(eye) < len - 60 && !_box.copy(b).expandByScalar(60).containsPoint(p)) return true;
    }
    return false;
  }

  /** Tính danh sách chip (không vẽ) */
  compute() {
    const game = this.game;
    const it = game.interact;
    if (!it) return [];
    const mode = this.mode;
    const range = Math.min(mode === 'compact' ? RANGE_COMPACT : RANGE, this.ux.seating?.seated ? 1600 : Infinity);
    const maxN = mode === 'compact' ? 3 : 6;
    game.camera.updateMatrixWorld();
    this._eye = game.camera.getWorldPosition(new THREE.Vector3());
    const fwd = game.camera.getWorldDirection(_f);
    const cur = it.target?.object || null;
    const cands = [];
    const p = new THREE.Vector3();
    for (const o of it.objects) {
      if (!o.parent || o === cur) continue;
      const spec = o.userData?.interactSpec;
      if (!spec || spec.subpart || spec.hint === false) continue;
      if (o.userData?.item && (o.userData.item.heldBy || o.userData.item.inBag || o.userData.item.isHotbarTool)) continue;
      if (!visibleChain(o)) continue;
      // lọc nhanh theo vị trí gốc
      if (!spec.hintAnchors && !spec.big) {
        o.getWorldPosition(p);
        if (p.distanceToSquared(this._eye) > (range + 800) ** 2) continue;
      }
      if (!this._anchor(o, p)) continue;
      const d = p.distanceTo(this._eye);
      if (d > range || d < 250) continue;
      const cos = _v.subVectors(p, this._eye).normalize().dot(fwd);
      if (cos < COS_MAX) continue;
      const pr = this.primaryPrompt(o);
      if (!pr) continue;
      const central = (cos - COS_MAX) / (1 - COS_MAX);
      const score = (1 - d / range) * 0.55 + central * 0.45;
      cands.push({ object: o, spec, item: o.userData?.item || null, ...pr, pos: p.clone(), dist: d, cos, score });
    }
    cands.sort((a, b) => b.score - a.score);
    const out = [];
    const W = game.app.width || 1280, H = game.app.height || 720;
    for (const c of cands) {
      if (out.length >= maxN) break;
      // gộp: cùng nhãn và sát nhau (dãy ngăn kéo / hộp)
      if (out.some((o) => o.label === c.label && o.key === c.key && o.pos.distanceTo(c.pos) < 900)) continue;
      // chip không chồng nhau trên màn hình (khung ~ 180 × 30 px)
      const v = _v.copy(c.pos).project(game.camera);
      c.sx = (v.x * 0.5 + 0.5) * W; c.sy = (-v.y * 0.5 + 0.5) * H;
      if (out.some((o) => Math.abs(o.sx - c.sx) < (mode === 'compact' ? 70 : 185) && Math.abs(o.sy - c.sy) < 32)) continue;
      // không che tâm ngắm / tên vật đang nhìn
      if (Math.abs(c.sx - W / 2) < 120 && c.sy > H / 2 - 24 && c.sy < H / 2 + 60) continue;
      if (this._occluded(c.pos)) continue;
      out.push(c);
    }
    return out;
  }

  _hidden() {
    const g = this.game;
    const ux = this.ux;
    return this.mode === 'off' || g.app.paused || g.app.uiMode || g.hud?.menuOpen || g.inventory?.bagOpen || g.interact?.inspecting ||
      ux.microscope?.active || ux.focus?.active || ux.laptop?.isOpen || ux.precision?.active || ux.bench?.active || !g.started;
  }

  update(dt) {
    const hud = this.ux.hud;
    const hidden = this._hidden();
    this._t -= dt;
    if (!hidden && this._t <= 0) {
      this._t = 0.1;
      try { this.list = this.compute(); } catch (e) { if (!this._err) { this._err = true; console.error('[hints]', e); } this.list = []; }
    }
    if (hidden) this.list = [];
    // mẹo lần đầu theo vật đang nhìn
    const t = this.game.interact?.target;
    if (!hidden && t?.inReach && t.object !== this._lastTipTarget) {
      this._lastTipTarget = t.object;
      const k = tipKindOf(t);
      if (k) this.showTipOnce(k);
    }
    if (!hud.has) return;
    if (!this.list.length) { hud.setChips([]); return; }
    const cam = this.game.camera;
    const W = this.game.app.width, H = this.game.app.height;
    const eye = cam.getWorldPosition(this._eyeU || (this._eyeU = new THREE.Vector3()));
    const fwd = cam.getWorldDirection(_f);
    const compact = this.mode === 'compact';
    const chips = [];
    // [UX] dải đáy dành cho thanh dụng cụ + thanh hành động: chip rơi vào đó thì bỏ (không vẽ chữ lẫn dưới thanh dụng cụ)
    const slot = THREE.MathUtils.clamp(0.062 * W, 48, 74);
    const barEl = this.game.hud?.el?.bar;
    const bottomY = H - (18 + slot + 14) - (barEl && !barEl.hidden ? (barEl.offsetHeight || 40) + 34 : 0);
    for (const c of this.list) {
      if (c.item) this._anchor(c.object, c.pos);
      const v = _v.copy(c.pos).project(cam);
      if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) continue;
      const d = c.pos.distanceTo(eye);
      const cos = _v.subVectors(c.pos, eye).normalize().dot(fwd);
      const range = compact ? RANGE_COMPACT : RANGE;
      const fd = THREE.MathUtils.clamp((range - d) / 700, 0, 1);
      const fa = THREE.MathUtils.clamp((cos - COS_MAX) / (COS_FULL - COS_MAX), 0, 1);
      const pv = _v.copy(c.pos).project(cam);
      if ((-pv.y * 0.5 + 0.5) * H > bottomY) continue;
      chips.push({ x: (pv.x * 0.5 + 0.5) * W, y: (-pv.y * 0.5 + 0.5) * H, opacity: (0.25 + 0.75 * fd * fa) * (c.disabled ? 0.7 : 1), icon: c.icon, key: c.key, hold: c.hold, label: c.label, compact, disabled: c.disabled });
    }
    hud.setChips(chips);
  }

  // ------------------------------------------------------------------ mẹo lần đầu
  showTipOnce(kind) {
    const Q = this.game.quality;
    if (!Q || this.mode !== 'full') return false;
    const seen = Q.settings.tipsSeen || [];
    if (seen.includes(kind) || !TIPS[kind]) return false;
    Q.set('tipsSeen', [...seen, kind]);
    this.ux.hud.tip(TIPS[kind]);
    this.game.events?.emit('ux:tip', { kind });
    return true;
  }
  resetTips() { this.game.quality?.set?.('tipsSeen', []); }
}

function visibleChain(o) { for (; o; o = o.parent) if (!o.visible) return false; return true; }
/** Rút gọn nhãn dài cho chip: bỏ phần trong ngoặc / sau dấu ':' / '—' */
function shortLabel(s) {
  let t = String(s).replace(/\s*\([^)]*\)\s*/g, ' ').split(/\s[—–-]\s|:\s/)[0].trim();
  if (t.length > 26) t = `${t.slice(0, 25).trim()}…`;
  return t;
}
