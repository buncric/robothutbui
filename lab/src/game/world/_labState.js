// Trạng thái thiết bị phòng lab dùng chung giữa prop (trạm hàn, nguồn bàn…) và dụng cụ (mỏ hàn đọc nhiệt độ đặt).
// Gắn vào game.lab (nếu game cho phép) và lưu trong WeakMap theo game.
export const AMBIENT_C = 30;   // °C — phòng lab ở Việt Nam

const STATES = new WeakMap();
const FALLBACK = {};

export function labState(game) {
  const key = game && typeof game === 'object' ? game : FALLBACK;
  let s = STATES.get(key);
  if (!s) {
    s = {
      ambient: AMBIENT_C,
      station: { on: false, setpoint: 350, min: 200, max: 450, ironTemp: AMBIENT_C, ironAge: 99, heaterDuty: 0, showSetFor: 0 },
      psu: { on: true, channels: [] },
      fume: { on: false },
      scope: { on: false },
      lamp: { on: false },
      strips: {},
      vise: { occupied: false, flipped: false },
    };
    STATES.set(key, s);
    if (key !== FALLBACK) { try { if (!key.lab) key.lab = s; } catch { /* game bị đóng băng */ } }
  }
  return s;
}

export const emit = (game, type, payload) => { try { game?.events?.emit?.(type, payload); } catch (e) { console.warn('[lab] event', type, e); } };
export const play = (game, name, opts) => { try { game?.audio?.play?.(name, opts); } catch { /* không có âm thanh */ } };
export const toast = (game, msg) => { try { game?.hud?.toast?.(msg); } catch { /* không có HUD */ } };

/**
 * Đăng ký danh sách tương tác [{ object, spec }] với game.interact (nếu có).
 * spec theo GAME_API §4 + phần mở rộng tùy chọn: onScroll(ctx, delta) · onDrag(ctx, dx, dy) cho núm xoay.
 */
export function registerInteractions(game, list = []) {
  const reg = game?.interact?.register;
  if (typeof reg !== 'function') return 0;
  let n = 0;
  for (const it of list) { try { reg.call(game.interact, it.object, it.spec); n++; } catch (e) { console.warn('[lab] interact.register', e); } }
  return n;
}
export function registerSockets(game, list = []) {
  const add = game?.sockets?.add;
  if (typeof add !== 'function') return 0;
  let n = 0;
  for (const s of list) { try { add.call(game.sockets, s); n++; } catch (e) { console.warn('[lab] sockets.add', e); } }
  return n;
}

/** Tìm ItemInstance từ một Object3D (đi ngược lên cha) */
export function itemOf(obj) {
  for (let o = obj; o; o = o.parent) if (o.userData?.item) return o.userData.item;
  return null;
}
/** Tìm Object3D đầu tiên (tính cả chính nó) có userData[key] */
export function findUp(obj, key) {
  for (let o = obj; o; o = o.parent) if (o.userData && o.userData[key] !== undefined) return o;
  return null;
}
