// =============================================================================
// quests/m0-led.js — Nhiệm vụ M0 "Thắp sáng LED đầu tiên" (breadboard + LED + 330 Ω + dây Dupont + nguồn bàn có giới hạn dòng).
//   defineM0LedQuest(game) → quests.define(...) — gọi từ main.js sau initCircuitGames(game).
// Bài học chính: (1) LED có cực — chân dài/anốt về +, cạnh phẳng/catốt về −; (2) LED cần điện trở hạn dòng:
//   I = (5 − 2) / 330 ≈ 9 mA; (3) GIỚI HẠN DÒNG của nguồn bàn (CC) là "cầu chì điện tử": bỏ điện trở mà nguồn để 50 mA
//   → nguồn chuyển CC, LED sống; để 3 A → LED cháy. Chấm điểm an toàn: đặt giới hạn dòng trước khi bật, không sửa mạch khi có điện.
// =============================================================================
import * as THREE from 'three';
import { isBreadboard } from '../minigames/netlist.js';

const isLed = (it) => it?.def?.electrical?.type === 'led';
const isRes = (it) => it?.def?.electrical?.type === 'resistor';

function onBreadboard(game, it) {
  const s = it?.socket ? game.sockets.get(it.socket) : null;
  return !!s && isBreadboard(s.owner);
}
function psuCh(game) { return game.lab?.psu?.channels?.[0] || null; }
function psuPos(game) {
  const o = game.scene.getObjectByName('bench-psu');
  return o ? o.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 160, 0)) : null;
}
function find(game, pred) { return game.items.all.find((i) => !i.inBag && pred(i)) || null; }

export function defineM0LedQuest(game) {
  const Q = game.quests;
  if (!Q || Q.defs?.has?.('m0-led')) return null;
  // theo dõi riêng cho chấm điểm an toàn
  const T = { maxIlimOn: 0, ledDied: 0, ledDiedUnlimited: 0, ccSaved: 0, hot: 0, powerOns: 0 };
  const active = () => Q.activeId === 'm0-led';
  const ev = game.events;
  ev.on('quest:started', (e) => { if (e.quest?.id === 'm0-led') Object.assign(T, { maxIlimOn: 0, ledDied: 0, ledDiedUnlimited: 0, ccSaved: 0, hot: 0, powerOns: 0 }); });
  ev.on('power:on', (e) => { if (active() && e.source === 'psu') { T.powerOns++; T.maxIlimOn = Math.max(T.maxIlimOn, e.ilim ?? psuCh(game)?.iset ?? 0); } });
  ev.on('fault', (e) => {
    if (!active() || !isLed(e.item) || (e.kind !== 'dead' && e.kind !== 'burn')) return;
    T.ledDied++;
    if ((psuCh(game)?.iset ?? 0) > 0.2) T.ledDiedUnlimited++;
  });
  ev.on('psu:mode', (e) => { if (active() && e.mode === 'CC') T.ccSaved++; });
  ev.on('power:hot-edit', () => { if (active()) T.hot++; });

  const ledNets = (g) => {
    const out = [];
    for (const it of g.items.all) {
      if (!isLed(it) || it.inBag || !onBreadboard(g, it) || it.state?.dead) continue;
      out.push({ it, a: g.netlist.netOfPin(it, 'A'), k: g.netlist.netOfPin(it, 'K') });
    }
    return out;
  };

  return Q.define({
    id: 'm0-led',
    title: 'Thắp sáng LED đầu tiên',
    intro: 'Breadboard + LED + điện trở 330 Ω + dây Dupont, cấp 5 V từ nguồn bàn có giới hạn dòng 50 mA.',
    order: 1,
    autoStart: true,
    steps: [
      {
        id: 'breadboard', text: 'Lấy breadboard 830 lỗ đặt lên bàn trước mặt',
        hint: 'Nhìn vào breadboard, E để nhặt, nhắm mặt bàn (bóng xanh) rồi E để đặt.',
        done: (e) => (e.type === 'item:placed' || e.type === 'item:picked') && isBreadboard(e.item),
        where: (g) => find(g, isBreadboard)?.object.getWorldPosition(new THREE.Vector3()) || null,
      },
      {
        id: 'led', text: 'Cắm LED vào breadboard: 2 chân ở 2 CỘT khác nhau',
        hint: 'Chân DÀI = anốt (+), chân ngắn + cạnh phẳng vành = catốt (−). Cầm LED, nhắm lỗ breadboard → E. R xoay 90°.',
        check: (g) => ledNets(g).some((l) => l.a && l.k && l.a !== l.k),
        where: (g) => find(g, (i) => isLed(i) && !i.socket)?.object.getWorldPosition(new THREE.Vector3()) || null,
      },
      {
        id: 'resistor', text: 'Cắm điện trở 330 Ω (cam-cam-nâu) nối tiếp với LED',
        hint: 'Cầm điện trở, nhấn B để bẻ chân 90° (cuộn chọn khoảng cách), rồi cắm 1 chân CÙNG cột với 1 chân LED.',
        check: (g) => {
          const leds = ledNets(g);
          return g.items.all.some((r) => isRes(r) && onBreadboard(g, r) && leds.some((l) => {
            const n1 = g.netlist.netOfPin(r, '1'), n2 = g.netlist.netOfPin(r, '2');
            return n1 !== n2 && [n1, n2].some((n) => n === l.a || n === l.k);
          }));
        },
      },
      {
        id: 'jumpers', text: 'Dùng dây Dupont đực–đực đưa 2 đầu mạch ra thanh nguồn (+ đỏ / − xanh)',
        hint: 'Cầm dây Dupont: chuột trái lên lỗ thứ nhất (đầu A), chuột trái lên lỗ thứ hai (đầu B). Nhìn vào dây + E để rút ra.',
        check: (g) => g.items.all.filter((c) => c.state?.cable?.laid && c.state.cable.ends.A?.kind !== 'free' && c.state.cable.ends.B?.kind !== 'free').length >= 2,
      },
      {
        id: 'psu-set', text: 'Chỉnh nguồn bàn CH1: điện áp 5.00 V, giới hạn dòng 0.050 A (50 mA)',
        hint: 'Núm VOLTAGE / CURRENT: cuộn chuột ±0.1 V / ±0.01 A, hoặc giữ chuột trái kéo. Màn hiện "SET" khi OUTPUT tắt.',
        check: (g) => { const c = psuCh(g); return !!c && Math.abs(c.vset - 5) <= 0.051 && c.iset >= 0.03 - 1e-6 && c.iset <= 0.06 + 1e-6; },
        where: psuPos,
      },
      {
        id: 'leads', text: 'Kẹp dây nguồn bàn: kẹp ĐỎ vào thanh +, kẹp ĐEN vào thanh −',
        hint: 'Phím số chọn "Dây nguồn bàn", chuột trái lần 1 = kẹp đỏ, lần 2 = kẹp đen. R = tháo kẹp.',
        check: (g) => !!(g.power?.leads.red && g.power?.leads.black),
      },
      {
        id: 'power', text: 'Bật OUTPUT CH1 — LED phải sáng',
        hint: 'Không sáng? LED có thể cắm NGƯỢC (catốt về +) — TẮT nguồn rồi xoay LED 180°. Kiểm tra dây và điện trở chung cột.',
        done: (e) => e.type === 'led:lit',
        where: psuPos,
      },
      {
        id: 'measure', text: 'Đo điện áp trên LED bằng đồng hồ vạn năng (thang V⎓, khoảng 1.8–2.2 V)',
        hint: 'Cầm đồng hồ: V = kẹp que ĐEN vào chân catốt / thanh −, chuột trái chạm que ĐỎ vào chân anốt.',
        done: (e) => e.type === 'measure' && e.mode === 'vdc' && e.value > 1.5 && e.value < 3.5,
      },
      {
        id: 'challenge', text: 'Thử thách: TẮT nguồn, rút điện trở, nối thẳng LED vào nguồn bằng dây, BẬT lại — quan sát đèn CC',
        hint: 'Giới hạn dòng 50 mA → nguồn tự hạ áp (chế độ CC), LED vẫn sống. Nếu để 3 A thì… LED cháy. Đừng quên tắt nguồn trước khi sửa mạch!',
        done: (e) => (e.type === 'psu:mode' && e.mode === 'CC') || (e.type === 'fault' && isLed(e.item) && (e.kind === 'dead' || e.kind === 'burn')),
        where: psuPos,
      },
      {
        id: 'off', text: 'Tắt OUTPUT nguồn bàn trước khi dọn mạch',
        done: (e) => e.type === 'power:off' && e.source === 'psu',
        where: psuPos,
      },
    ],
    reward: { xp: 150 },
    scoring: () => {
      let score = 100;
      const notes = [];
      if (T.maxIlimOn > 0.2) { score -= 15; notes.push(`Bật nguồn với giới hạn dòng ${T.maxIlimOn.toFixed(2)} A — mạch mới nên để 50–100 mA`); }
      if (T.ledDied) { score -= 35; notes.push(T.ledDiedUnlimited ? 'LED cháy vì không có điện trở VÀ giới hạn dòng quá cao' : 'LED đã cháy — kiểm tra điện trở hạn dòng'); }
      if (T.ccSaved && !T.ledDied) notes.push('Giới hạn dòng (CC) đã cứu LED — luôn đặt giới hạn trước khi bật!');
      if (T.hot) { score -= Math.min(30, 5 * T.hot); notes.push(`Sửa mạch khi đang có điện ${T.hot} lần — tắt OUTPUT trước khi cắm/rút`); }
      if (!notes.length) notes.push('An toàn tuyệt đối!');
      return { score: Math.max(0, score), notes };
    },
  });
}
