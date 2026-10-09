// =============================================================================
// events.js — Bus sự kiện dùng chung cho cả game.
//
//   const off = events.on('item:picked', (e) => { e.type, e.item … });
//   events.once('quest:completed', fn);
//   events.emit('item:picked', { item });
//   events.on('*', (e) => …)     // nghe MỌI sự kiện (nhiệm vụ, nhật ký, HUD)
//
// Mọi listener nhận MỘT đối tượng sự kiện e = { type, ...payload }.
// Lỗi trong một listener không làm hỏng listener khác (bắt lỗi + console.error).
// =============================================================================

export class Events {
  constructor() {
    this._map = new Map();      // type → Set<fn>
    this.log = [];              // 50 sự kiện gần nhất (gỡ lỗi)
    this.muted = false;
  }

  /** Đăng ký nghe. Trả về hàm huỷ đăng ký. */
  on(type, fn) {
    if (!this._map.has(type)) this._map.set(type, new Set());
    this._map.get(type).add(fn);
    return () => this.off(type, fn);
  }

  once(type, fn) {
    const off = this.on(type, (e) => { off(); fn(e); });
    return off;
  }

  off(type, fn) {
    const s = this._map.get(type);
    if (s) s.delete(fn);
  }

  /** Phát sự kiện. payload nên là object; giá trị khác được bọc thành { value }. */
  emit(type, payload = {}) {
    if (this.muted) return null;
    // Truyền CHÍNH object payload (không sao chép) để listener có thể ghi kết quả ngược lại
    // (vd PICkit: listener đặt payload.ok = false → công cụ đọc được). Giá trị không phải object được bọc { value }.
    const isObj = payload !== null && typeof payload === 'object' && !Array.isArray(payload);
    const e = isObj ? payload : { value: payload };
    e.type = type;
    this.log.push(e);
    if (this.log.length > 50) this.log.shift();
    this._call(this._map.get(type), e);
    this._call(this._map.get('*'), e);
    return e;
  }

  _call(set, e) {
    if (!set || !set.size) return;
    for (const fn of [...set]) {
      try { fn(e); } catch (err) { console.error(`[events] lỗi trong listener '${e.type}':`, err); }
    }
  }

  clear() { this._map.clear(); }
}
