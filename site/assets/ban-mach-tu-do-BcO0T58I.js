const n=`// 🧪 Bàn mạch tự do (kiểu Tinkercad): kéo linh kiện ra breadboard 830 lỗ, nối dây chân-với-chân, cấp nguồn
// → bộ giải mạch (src/circuit: MNA + Newton–Raphson + Euler lùi + mô hình nhiệt/hư hỏng) tính điện áp, dòng,
// nhiệt độ từng linh kiện. Nối sai → cháy/nổ ĐÚNG theo mạch người học đã nối.
import { buildCircuit } from '../../circuit/netlist.js';
import { LED_COLORS, Fuse, Meter } from '../../circuit/elements.js';
import { STATE_VI } from '../../circuit/damage.js';
import { P, BB_TOP, holeXZ, parseHole, netName, buildBreadboard, CATALOG, buildMultimeter, fmtR, fmtC } from './_mach_parts.js';

const STORE = 'robovac.ban-mach-tu-do.v1';
const EXTRA = 'robovac.ban-mach-tu-do.extra.v1';
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* bỏ qua */ } },
};
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const hasDom = typeof document !== 'undefined';
const WIRE_COLORS = [['red', 'Đỏ (+)', 0xd23b3b], ['black', 'Đen (GND)', 0x26282c], ['yellow', 'Vàng', 0xf2c200], ['green', 'Xanh lá', 0x2fa84f], ['blue', 'Xanh dương', 0x2f6fd8], ['orange', 'Cam', 0xf08a1c], ['white', 'Trắng', 0xeeeeee]];
const WHEX = Object.fromEntries(WIRE_COLORS.map(([k, , h]) => [k, h]));
const CAT = Object.fromEntries(CATALOG.map((c) => [c.id, c]));
const PREFIX = { resistor: 'R', powerres: 'R', pot: 'VR', led: 'LED', diode: 'D', ceramic: 'C', electro: 'C', inductor: 'L', nmos: 'Q', crystal: 'Y', switch: 'SW', button: 'BTN', fuse: 'F', pic: 'U', esp32: 'U', bss138: 'U', drv8871: 'U', buck: 'U', ldo: 'U', motor: 'M', pack4s: 'BAT', bat9v: 'BAT', bench: 'PSU', ammeter: 'A', pulse: 'GEN' };
const SRC_PRI = { pack4s: 0, bench: 1, bat9v: 2, pulse: 3 };
const DOWN = -Math.PI / 2, UP = Math.PI / 2;
const BUDGET_MS = 8;

// ============================================================ MẠCH MẪU
function B() {
  const items = [], wires = [], props = {};
  let uid = 0;
  const ep = (a) => (Array.isArray(a) ? \`p:\${a[0]}:\${a[1]}\` : \`h:\${a}\`);
  return {
    items, wires, props,
    part(type, at, { rot = 0, pr } = {}) {
      const u = ++uid;
      let x, z, y = BB_TOP;
      if (typeof at === 'string') { const h = parseHole(at); [x, z] = holeXZ(h.row, h.col); } else { [x, z] = at; y = 0; }
      items.push({ type, uid: u, x: +x.toFixed(3), y, z: +z.toFixed(3), rotY: rot });
      props[u] = { ...CAT[type].props, ...(pr || {}) };
      return u;
    },
    wire(a, b, color = 'red') { wires.push({ id: wires.length + 1, a: ep(a), b: ep(b), color }); },
  };
}
/** PIC16F877A tối thiểu: chân 1 ở g20 (chân 21–40 ở hàng c), MCLR 10 kΩ, thạch anh + 2 tụ 22 pF, 2 tụ 100 nF, LED RD7 */
function picBlock(b, program = 'blink') {
  const pic = b.part('pic16f877a', 'g20', { pr: { program } });
  b.part('r-10k', 'i20', { rot: DOWN });                     // MCLR (dải cột 20) → thanh B+
  b.part('thach-anh', 'i32');                                 // OSC1 (cột 32) – OSC2 (cột 33)
  b.part('tu-gom-22p', 'j31');                                // VSS (cột 31) – OSC1
  b.wire('h33', 'h45', 'yellow');
  b.part('tu-gom-22p', 'i45');                                // OSC2 – GND (qua dây)
  b.wire('j46', 'B-46', 'black');
  b.part('tu-gom-100n', 'i30');                               // tụ lọc VDD(11)–VSS(12)
  b.wire('j30', 'B+30', 'red');                               // chân 11 VDD
  b.wire('h31', 'B-32', 'black');                             // chân 12 VSS
  b.wire('a28', 'T+28', 'red');                               // chân 32 VDD
  b.wire('a29', 'T-29', 'black');                             // chân 31 VSS
  b.part('tu-gom-100n', 'b28');                               // tụ lọc VDD(32)–VSS(31)
  b.wire('a30', 'a44', 'green');                              // RD7 (chân 30) → điện trở 330 Ω → LED
  b.part('r-330', 'b44');
  b.part('led-do', 'c48');
  b.wire('a49', 'T-48', 'black');
  b.wire('T+3', 'B+3', 'red'); b.wire('T-4', 'B-4', 'black');  // nối 2 cặp thanh nguồn
  return pic;
}
function ledBlock(b, R = 'r-1k') {
  if (R) b.part(R, 'T+10', { rot: DOWN }); else b.wire('T+10', 'b10', 'red');
  b.part('led-do', 'c10');
  b.wire('a11', 'T-11', 'black');
}
function mosfetBlock(b, { diode = true, fet = 'irlz44n', load = 'motor', gen = { v: 5, f: 1, duty: 50 } } = {}) {
  const pk = b.part('pin-4s', [-165, 80], { pr: { soc: 90 } });
  const g = b.part('phat-xung', [-150, -80], { pr: gen });
  b.part(fet, 'e32');                                         // G e32 · D e33 · S e34
  if (diode) b.part('diode-1n5822', 'b33', { rot: UP });       // A ở cực D, K lên thanh T+ (song song ngược với động cơ)
  b.part('r-100', 'd28');                                     // điện trở cổng 100 Ω
  b.part('r-10k', 'a32', { rot: UP });                         // kéo xuống 10 kΩ
  b.wire('a34', 'T-34', 'black');
  b.wire([g, 'OUT'], 'c28', 'yellow'); b.wire([g, 'GND'], 'T-3', 'black');
  b.wire([pk, '+'], 'T+2', 'red'); b.wire([pk, '-'], 'T-2', 'black');
  if (load === 'motor') {
    const m = b.part('dong-co', [30, -95]);
    b.wire([m, '+'], 'T+36', 'red'); b.wire([m, '-'], 'c33', 'blue');
  } else {
    b.part('tro-cong-suat', 'b23', { pr: { R: 2.2 } });          // 2.2 Ω từ dải 23 sang cực D (dải 33)
    b.wire('a23', 'T+22', 'red');
  }
}
function espBlock(b, { psuI = 1 } = {}) {
  const psu = b.part('nguon-ban', [-150, -75], { pr: { v: 5, i: psuI } });
  b.wire([psu, '+'], 'T+2', 'red'); b.wire([psu, '-'], 'T-2', 'black');
  b.wire('T+4', 'B+4', 'red'); b.wire('T-5', 'B-5', 'black');
  const esp = b.part('esp32-s3', 'i3');                       // J1 ở hàng i (cột 3–24), J2 ở hàng b
  b.wire('j24', 'B-24', 'black');                             // GND (J1 chân 22)
  return { psu, esp };
}

const PRESETS = {
  led: { name: '✅ LED + điện trở 330 Ω (nguồn bàn 5 V)', build() {
    const b = B();
    const psu = b.part('nguon-ban', [-150, -75], { pr: { v: 5, i: 0.1 } });
    b.wire([psu, '+'], 'T+4', 'red'); b.wire([psu, '-'], 'T-4', 'black');
    ledBlock(b, 'r-330');
    return { ...b, probe: 'h:d10', meter: { com: 'h:T-6', probe: 'h:d10' } };
  } },
  'phan-ap': { name: '✅ Phân áp 33k/10k đo pin 4S → ADC (AN0)', build() {
    const b = B();
    const pk = b.part('pin-4s', [-160, 70], { pr: { soc: 100 } });
    b.part('r-33k', 'T+20', { rot: DOWN });                   // VBAT → dải 20 (AN0)
    b.part('r-10k', 'd20');                                   // dải 20 → dải 24
    b.part('tu-gom-100n', 'e20');                             // AN0 → dải 21 → GND
    b.wire('a21', 'T-21', 'black'); b.wire('a24', 'T-24', 'black');
    b.wire([pk, '+'], 'T+2', 'red'); b.wire([pk, '-'], 'T-2', 'black');
    return { ...b, probe: 'h:c20', meter: { com: 'h:T-6', probe: 'h:c20' } };
  } },
  'pic-min': { name: '✅ Mạch PIC16F877A tối thiểu (nháy LED RD7)', build() {
    const b = B();
    const psu = b.part('nguon-ban', [-150, -75], { pr: { v: 5, i: 0.5 } });
    b.wire([psu, '+'], 'T+2', 'red'); b.wire([psu, '-'], 'T-2', 'black');
    picBlock(b, 'blink');
    return { ...b, probe: 'h:b30', meter: { com: 'h:T-6', probe: 'h:T+6' } };
  } },
  'mosfet-motor': { name: '✅ MOSFET IRLZ44N + động cơ + diode flyback', build() {
    const b = B(); mosfetBlock(b, { diode: true });
    return { ...b, probe: 'h:d33', meter: { com: 'h:T-6', probe: 'h:a33' } };
  } },
  'nguon-pic': { name: '✅ Pin 4S → cầu chì → buck 5 V → PIC', build() {
    const b = B();
    const pk = b.part('pin-4s', [-165, 80], { pr: { soc: 90 } });
    const fu = b.part('cau-chi', [-165, 10], { pr: { rating: 3 } });
    const bk = b.part('buck-xl4015', [-150, -80], { pr: { vset: 5 } });
    b.wire([pk, '+'], [fu, '1'], 'red'); b.wire([fu, '2'], [bk, 'IN+'], 'red'); b.wire([pk, '-'], [bk, 'IN-'], 'black');
    b.wire([bk, 'OUT+'], 'T+2', 'red'); b.wire([bk, 'OUT-'], 'T-2', 'black');
    picBlock(b, 'blink');
    return { ...b, probe: 'h:b30', meter: { com: 'h:T-6', probe: 'h:T+6' } };
  } },
  'drv-motor': { name: '✅ DRV8871 + động cơ (2 công tắc = IN1/IN2)', build() {
    const b = B();
    const pk = b.part('pin-4s', [-165, 80], { pr: { soc: 90 } });
    const psu = b.part('nguon-ban', [-150, -75], { pr: { v: 5, i: 0.2 } });
    const drv = b.part('drv8871', 'j40');
    const m = b.part('dong-co', [40, 85]);
    b.part('cong-tac', 'c30', { pr: { on: true } }); b.part('cong-tac', 'c35', { pr: { on: false } });
    b.wire([psu, '+'], 'T+2', 'red'); b.wire([psu, '-'], 'T-2', 'black'); b.wire('T-4', 'B-4', 'black');
    b.wire('i42', 'B-42', 'black');
    b.wire('a30', 'T-30', 'black'); b.wire('a32', 'T+32', 'red'); b.wire('b31', 'h40', 'yellow');
    b.wire('a35', 'T-35', 'black'); b.wire('a37', 'T+36', 'red'); b.wire('b36', 'h41', 'blue');
    b.wire([pk, '+'], [drv, 'VM'], 'red'); b.wire([pk, '-'], [drv, 'GND2'], 'black');
    b.wire([drv, 'OUT1'], [m, '+'], 'yellow'); b.wire([drv, 'OUT2'], [m, '-'], 'blue');
    return { ...b, probe: \`p:\${drv}:OUT1\`, meter: { com: \`p:\${drv}:OUT2\`, probe: \`p:\${drv}:OUT1\` } };
  } },
  'esp-bss': { name: '✅ ESP32-S3 ← BSS138 ← tín hiệu 5 V (UART đúng cách)', build() {
    const b = B();
    espBlock(b);
    b.wire('j23', 'B+23', 'red');                             // 5V (J1 chân 21) ← 5 V
    b.part('bss138', 'g40');                                  // hàng LV ở g40–g45, hàng HV ở d40–d45
    b.wire('h3', 'j42', 'orange');                            // 3V3 → LV
    b.wire('a42', 'T+42', 'red');                             // HV ← 5 V
    b.wire('j43', 'B-44', 'black');                           // GND
    b.wire('h13', 'j40', 'green');                            // LV1 → GPIO18 (RX)
    const g = b.part('phat-xung', [-150, 80], { pr: { v: 5, f: 2, duty: 50 } });
    b.wire([g, 'OUT'], 'a40', 'yellow'); b.wire([g, 'GND'], 'T-6', 'black');   // "TX của PIC" 5 V → HV1
    return { ...b, probe: 'h:j13', meter: { com: 'h:B-22', probe: 'h:j13' } };
  } },
  trong: { name: '⬜ Bàn trống', build() { const b = B(); return { ...b, probe: null, meter: { com: null, probe: null } }; } },
  // ---- mạch nối SAI (cũng là các mục "Sự cố")
  'led-khong-tro': { name: '❌ LED không có điện trở', build() {
    const b = B();
    const psu = b.part('nguon-ban', [-150, -75], { pr: { v: 5, i: 1 } });
    b.wire([psu, '+'], 'T+4', 'red'); b.wire([psu, '-'], 'T-4', 'black');
    ledBlock(b, null);
    return { ...b, probe: 'h:d10', meter: { com: 'h:T-6', probe: 'h:d10' } };
  } },
  'tu-hoa-nguoc': { name: '❌ Tụ hoá 1000 µF cắm ngược trên pin 4S', build() {
    const b = B();
    const pk = b.part('pin-4s', [-160, 70], { pr: { soc: 60 } });
    b.part('tu-hoa-1000u', 'c20');                            // + ở c20, − ở c22
    b.wire('a20', 'T-20', 'black'); b.wire('a22', 'T+22', 'red');   // SAI: cực + nối GND, cực − nối +14.4 V
    b.wire([pk, '+'], 'T+2', 'red'); b.wire([pk, '-'], 'T-2', 'black');
    return { ...b, probe: 'h:b22', meter: { com: 'h:b22', probe: 'h:b20' } };
  } },
  'chap-nguon': { name: '❌ Chập nguồn pin 4S (không BMS, không cầu chì)', build() {
    const b = B();
    const pk = b.part('pin-4s', [-160, 70], { pr: { soc: 100, bms: false } });
    b.wire([pk, '+'], 'T+2', 'red'); b.wire([pk, '-'], 'T-2', 'black');
    ledBlock(b, 'r-1k');
    b.wire('T+30', 'T-30', 'yellow');                         // dây nhảy cắm nhầm nối thẳng + với −
    return { ...b, probe: 'h:T+40', meter: { com: 'h:T-6', probe: 'h:T+6' } };
  } },
  '12v-vao-pic': { name: '❌ 12 V cấp thẳng vào PIC (quên buck)', build() {
    const b = B();
    const psu = b.part('nguon-ban', [-150, -75], { pr: { v: 12, i: 3 } });
    b.wire([psu, '+'], 'T+2', 'red'); b.wire([psu, '-'], 'T-2', 'black');
    picBlock(b, 'blink');
    return { ...b, probe: 'h:T+6', meter: { com: 'h:T-6', probe: 'h:T+6' } };
  } },
  'thieu-flyback': { name: '❌ MOSFET + động cơ THIẾU diode flyback', build() {
    const b = B(); mosfetBlock(b, { diode: false, gen: { v: 5, f: 2, duty: 50 } });
    return { ...b, probe: 'h:d33', meter: { com: 'h:T-6', probe: 'h:a33' } };
  } },
  'irf520-5v': { name: '❌ IRF520 lái bằng 5 V, tải 6 A', build() {
    const b = B(); mosfetBlock(b, { diode: false, fet: 'irf520', load: 'res', gen: { v: 5, f: 1, duty: 100 } });
    return { ...b, probe: 'h:c33', meter: { com: 'h:T-6', probe: 'h:c33' } };
  } },
  '5v-vao-gpio': { name: '❌ 5 V nối thẳng vào GPIO18 của ESP32 (không chuyển mức)', build() {
    const b = B();
    espBlock(b);
    b.wire('j23', 'B+23', 'red');
    b.wire('B+12', 'j13', 'yellow');                          // "TX của PIC" nghỉ ở mức 1 = 5 V liên tục → GPIO18
    return { ...b, probe: 'h:h13', meter: { com: 'h:B-22', probe: 'h:h13' } };
  } },
  '5v-vao-3v3': { name: '❌ 5 V cấp vào chân 3V3 của ESP32', build() {
    const b = B();
    espBlock(b, { psuI: 3 });
    b.wire('j3', 'B+3', 'red');                               // SAI: 5 V vào chân 3V3
    return { ...b, probe: 'h:h3', meter: { com: 'h:B-22', probe: 'h:h3' } };
  } },
  'ampe-ke': { name: '❌ Đồng hồ để thang A mà đo điện áp pin', build() {
    const b = B();
    const pk = b.part('pin-4s', [-160, 70], { pr: { soc: 100 } });
    b.wire([pk, '+'], 'T+2', 'red'); b.wire([pk, '-'], 'T-2', 'black');
    ledBlock(b, 'r-1k');
    return { ...b, probe: 'h:T+20', meter: { com: 'h:T-20', probe: 'h:T+20', mode: 'A' } };
  } },
};

// ============================================================ SỰ CỐ (mỗi cái = 1 mạch mẫu nối sai)
const FAULTS = [
  { id: 'led-khong-tro', label: 'LED nối thẳng 5 V, không điện trở', severity: 'hong',
    what: '<p>LED loé sáng chói trong chưa tới 1 giây rồi <b>tắt hẳn</b> (có khi kèm tiếng "tách" nhỏ, mùi nhựa khét). Nguồn bàn báo dòng ~0.3 A thay vì ~10 mA.</p>',
    why: '<p>LED không tự hạn dòng: trên 2 V một chút là dòng tăng theo hàm mũ. Chỉ còn điện trở nội ~10 Ω nên <code>I ≈ (5 − 2.1)/10 ≈ 0.3 A</code> — gấp 10 lần mức tối đa 30 mA. Công suất ~0.7 W trong con chip 0.3 mm (nhiệt trở ~250 °C/W) → nóng &gt; 170 °C trong ~0.5 s → dây vàng nối chip bị đứt → LED hở mạch.</p>',
    fix: '<p>Luôn nối tiếp điện trở: <code>R = (Vnguồn − Vf)/I = (5 − 2)/0.01 = 300 Ω</code> → chọn 330 Ω (I ≈ 9 mA). Khi thử mạch mới hãy đặt giới hạn dòng nguồn bàn ~50 mA.</p>' },
  { id: 'tu-hoa-nguoc', label: 'Tụ hoá 1000 µF/25 V cắm ngược trên 14.4 V', severity: 'no',
    what: '<p>Vài giây đầu không có gì, sau đó tụ <b>nóng, phồng nắp</b>, rít/xì hơi mùi tanh, rồi <b>nổ "bụp"</b>: nắp nhôm bung theo rãnh chữ K, giấy và dung dịch điện phân bắn ra.</p>',
    why: '<p>Cực dương của tụ hoá phủ lớp ôxít nhôm cực mỏng — chỉ cách điện theo MỘT chiều. Cắm ngược, lớp này dẫn như một diode: dòng rò ~4–5 A × 14 V ≈ <b>60 W</b> làm sôi dung dịch. Áp suất hơi nước mở van an toàn sau ~3–5 s (mô phỏng: nhiệt độ lõi &gt; 105 °C).</p>',
    fix: '<p>Vạch trắng/xám trên thân là chân ÂM; chân dài là DƯƠNG. Kiểm tra cực trước khi cấp điện; đeo kính khi thử. Tụ đã phồng phải bỏ — không dùng lại.</p>' },
  { id: 'chap-nguon', label: 'Dây nhảy chập thẳng + với − của pin 4S', severity: 'chay',
    what: '<p>Tia lửa ở chỗ cắm, dây nhảy <b>đỏ rực</b>, vỏ nhựa chảy, bốc khói, có thể bắt lửa; sau ~0.2 s lõi đồng chảy đứt. Pin nóng lên. Breadboard chỗ đó bị chảy nhựa.</p>',
    why: '<p>Không có gì hạn dòng ngoài điện trở trong của pin (~0.1 Ω) và dây (~0.03 Ω): <code>I = 16.8/0.13 ≈ 130 A</code>. Dây nhảy 0.2 mm² chỉ chịu ~2 A: công suất trên dây <code>I²R ≈ 500 W</code> → hàng nghìn °C/giây.</p>',
    fix: '<p>Luôn có <b>cầu chì</b> sát cực + của pin và mạch <b>BMS</b> (bật lại BMS trong Thuộc tính của pin: SCP ngắt sau ~200 µs, dây chỉ hơi ấm). Thử mạch mới bằng nguồn bàn có giới hạn dòng. Đo Ω giữa + và − trước khi cấp điện.</p>' },
  { id: '12v-vao-pic', label: 'Cấp 12 V thẳng vào PIC16F877A', severity: 'no',
    what: '<p>Chip nóng bỏng tay ngay lập tức, mùi khét, có khi nứt vỏ "tách". Nguồn bàn nhảy sang chế độ giới hạn dòng (đèn CC đỏ). Sau đó PIC chết <b>chập</b>: kể cả hạ về 5 V vẫn ngốn hết dòng.</p>',
    why: '<p>VDD tuyệt đối tối đa của PIC16F877A là 7.5 V. Trên đó các cấu trúc bảo vệ (ESD) bên trong dẫn mạnh: dòng 2–3 A × 11–12 V ≈ <b>25–35 W</b> trong con chip vài mm² → hàng trăm °C trong 1 giây.</p>',
    fix: '<p>Luôn qua mạch <b>buck 5 V</b> (dự án dùng XL4015) và <b>đo Vout bằng đồng hồ TRƯỚC khi cắm chip</b>. Thêm diode zener 5.6 V + cầu chì tự phục hồi (polyfuse) ở đường 5 V nếu muốn chắc ăn.</p>' },
  { id: 'thieu-flyback', label: 'MOSFET đóng ngắt động cơ, thiếu diode flyback', severity: 'hong',
    what: '<p>Mỗi lần MOSFET ngắt, máy hiện sóng thấy <b>gai điện áp ~66 V</b> ở cực D (gấp 4 lần pin). Động cơ vẫn chạy nên khó phát hiện; trong robot thì PIC/ESP32 reset ngẫu nhiên, MOSFET nóng dần và chết sau vài ngày/tuần.</p>',
    why: '<p>Cuộn dây động cơ có điện cảm L = 1.5 mH: dòng 2 A không thể mất ngay. Khi MOSFET ngắt, <code>V = L·di/dt</code> đẩy điện áp lên tới khi MOSFET bị <b>đánh thủng thác lũ</b> (avalanche, ~66 V với IRLZ44N 55 V). Năng lượng <code>½·L·I² ≈ 3 mJ</code> mỗi lần đổ vào MOSFET — với PWM 20 kHz là ~60 W!</p>',
    fix: '<p>Diode Schottky (1N5822/SS34) <b>song song ngược</b> với động cơ: anode ở cực D, cathode ở +VBAT. Dòng chạy vòng qua diode, Vds chỉ còn VBAT + 0.5 V (xem mạch mẫu ✅). Thêm tụ 100 nF hai đầu động cơ.</p>' },
  { id: 'irf520-5v', label: 'MOSFET IRF520 lái bằng 5 V, tải ~6 A', severity: 'chay',
    what: '<p>Tải không nhận đủ dòng, MOSFET <b>nóng rất nhanh</b> (~10 W+), bốc khói sau chừng chục giây không tản nhiệt, rồi chết chập (tải chạy luôn không tắt được).</p>',
    why: '<p>IRF520 có Vgs(th) ≈ 3–4 V và chỉ mở hẳn ở <b>10 V</b>. Với 5 V nó chỉ cho tối đa ~3.5 A (vùng bão hoà): <code>Vds = 14.4 − 3.5·2.2 ≈ 6.7 V</code> → <code>P = Vds·I ≈ 23 W</code> trong vỏ TO-220 không tản nhiệt (62 °C/W).</p>',
    fix: '<p>Dùng MOSFET <b>logic-level</b> IRLZ44N (mở hẳn ở 5 V, kể cả 3.3 V: Rds ≈ 25 mΩ → P &lt; 1 W) — như quy tắc 4 trong docs/01. Đổi "Loại" trong Thuộc tính của Q1 để so sánh.</p>' },
  { id: '5v-vao-gpio', label: '5 V nối thẳng vào GPIO18 (RX) của ESP32', severity: 'hong',
    what: '<p>Thường vẫn "chạy được" vài phút → người học tưởng ổn. Sau đó chân GPIO18 hỏng (rò xuống GND, đọc sai), có lúc cả chip treo/nóng. Thanh 3V3 bị đẩy lên cao hơn 3.3 V.</p>',
    why: '<p>GPIO ESP32 chỉ chịu VDD + 0.3 V ≈ 3.6 V. 5 V làm diode bảo vệ bên trong dẫn: <code>(5 − 3.3 − 0.65)/50 Ω ≈ 20 mA</code> chảy liên tục vào thanh 3V3 — gấp nhiều lần mức an toàn (~6 mA). Mô phỏng tích luỹ "ứng suất" theo thời gian.</p>',
    fix: '<p>Luôn qua <b>mạch chuyển mức BSS138</b> (mạch mẫu ✅ "ESP32-S3 ← BSS138") hoặc phân áp 1 kΩ/2 kΩ cho chiều 5 V → 3.3 V. Chiều 3.3 V → PIC (RC7/RX) cũng cần BSS138 vì PIC cần ≥ 4.0 V.</p>' },
  { id: '5v-vao-3v3', label: 'Cấp 5 V vào chân 3V3 của ESP32', severity: 'no',
    what: '<p>Board nóng ran trong vài giây, nguồn bàn nhảy giới hạn dòng, mùi khét, module ESP32 chết hẳn (chập nguồn).</p>',
    why: '<p>Chân 3V3 nối thẳng vào lõi chip (sau LDO). Tuyệt đối tối đa 3.6 V: ở 5 V các cấu trúc bảo vệ dẫn vài ampe → hơn 10 W trong module.</p>',
    fix: '<p>5 V chỉ cấp vào chân <b>5V</b> (qua LDO trên board). Đánh dấu dây nguồn bằng màu và đo trước khi cắm. Dùng nguồn bàn giới hạn dòng ~300 mA khi cấp lần đầu.</p>' },
  { id: 'ampe-ke', label: 'Đồng hồ để thang 10 A mà đo điện áp pin', severity: 'loi',
    what: '<p>"Bụp" nhỏ trong đồng hồ, tia lửa ở đầu que đo, đồng hồ hiện 0 A và từ đó thang A không đo được nữa (cầu chì 10 A bên trong đã đứt). Đồng hồ rẻ không có cầu chì → cháy mạch đo, que đo chảy.</p>',
    why: '<p>Thang A có điện trở rất nhỏ (shunt ~0.01 Ω) để không cản dòng khi mắc <b>nối tiếp</b>. Chọc song song vào 2 cực pin = chập mạch: <code>I ≈ 16.8/0.12 ≈ 140 A</code> → cầu chì 10 A đứt sau ~10 ms.</p>',
    fix: '<p>Đo điện áp: que đỏ cắm lỗ V, chọn thang V. Đo dòng: ngắt mạch ra rồi mắc đồng hồ <b>nối tiếp</b>. Tập thói quen: rút que đỏ về lỗ V ngay sau khi đo dòng. Thay cầu chì đúng loại (F10A H 600 V).</p>' },
];

// ============================================================ LINH KIỆN
export default {
  id: 'ban-mach-tu-do',
  name: 'Bàn mạch tự do (kiểu Tinkercad)',
  category: 'mo-phong',
  order: 5,
  icon: '🧪',
  summary: 'Kéo linh kiện ra breadboard 830 lỗ, nối dây chân-với-chân rồi cấp nguồn: bộ giải mạch thật (MNA + Newton–Raphson) tính điện áp, dòng điện, nhiệt độ từng linh kiện. Nối sai → cháy, nổ đúng theo mạch bạn nối.',
  tags: ['breadboard', 'tinkercad', 'mô phỏng mạch', 'circuit simulator', 'MNA', 'nối dây', 'cháy nổ', 'LED', 'PIC', 'ESP32', 'MOSFET', 'buck'],

  params: [
    { id: 'preset', label: 'Mạch mẫu', type: 'select', value: 'led', options: Object.entries(PRESETS).map(([k, v]) => [k, v.name]) },
    { id: 'load', label: '📥 Nạp mạch mẫu đã chọn', type: 'button' },
    { id: 'power', label: '⚡ Cấp nguồn / ⏹ Ngắt', type: 'button' },
    { id: 'wire', label: '✏️ Chế độ nối dây (bật/tắt)', type: 'button' },
    { id: 'color', label: 'Màu dây mới', type: 'select', value: 'red', options: WIRE_COLORS.map(([k, n]) => [k, n]) },
    { id: 'mmode', label: 'Đồng hồ vạn năng', type: 'select', value: 'V', options: [['V', 'V — đo điện áp'], ['mA', 'mA — dòng nhỏ (mắc nối tiếp!)'], ['A', 'A — dòng lớn 10 A (mắc nối tiếp!)'], ['ohm', 'Ω — điện trở (ngắt nguồn)'], ['off', 'Tắt']] },
    { id: 'probe', label: '🔴⚫ Đặt que đo (bấm 2 điểm)', type: 'button' },
    { id: 'speed', label: 'Tốc độ thời gian', type: 'select', value: '1', options: [['0.01', 'Chậm 100×'], ['0.1', 'Chậm 10×'], ['1', 'Thời gian thật'], ['5', 'Nhanh 5× (xem nóng dần)']] },
    { id: 'dt', label: 'Bước tính dt', type: 'select', value: '0.0002', options: [['0.0001', '0.1 ms (chính xác)'], ['0.0002', '0.2 ms'], ['0.0005', '0.5 ms'], ['0.001', '1 ms (nhanh)']], hint: 'Bước nhỏ bắt được xung nhanh (flyback), bước lớn chạy nhanh hơn' },
    { id: 'repair', label: '🔧 Thay mới mọi linh kiện hỏng', type: 'button' },
    { id: 'clearw', label: '🧹 Xoá hết dây', type: 'button' },
    { id: 'export', label: '⤓ Xuất mạch ra file JSON', type: 'button' },
    { id: 'import', label: '📂 Mở mạch từ file JSON', type: 'button' },
  ],
  readouts: [
    { id: 'preset', label: 'Mạch đang dùng', unit: '' },
    { id: 'pwr', label: 'Nguồn tổng', unit: '' },
    { id: 'vs', label: 'Nguồn chính: điện áp ra', unit: 'V' },
    { id: 'is', label: 'Nguồn chính: dòng ra', unit: 'A' },
    { id: 'vp', label: 'Điểm đo (so với cực − nguồn chính)', unit: 'V' },
    { id: 'dmm', label: 'Đồng hồ vạn năng', unit: '' },
    { id: 'hot', label: 'Linh kiện nóng nhất', unit: '' },
    { id: 'bad', label: 'Linh kiện hỏng / bảo vệ đã tác động', unit: '' },
    { id: 'mcu', label: 'Vi điều khiển', unit: '' },
    { id: 'sim', label: 'Bộ giải', unit: '' },
  ],
  scope: {
    window: 4,
    note: '(thời gian mô phỏng · kênh 2 = điểm đo: bấm vào một lỗ để chọn)',
    channels: [
      { name: 'Dòng nguồn chính', unit: 'A', min: -0.2, max: 3, color: '#ffd34d' },
      { name: 'Điện áp điểm đo', unit: 'V', min: -5, max: 70, color: '#4cc2ff' },
    ],
  },

  info: {
    overview: \`
      <p>Đây là <b>bàn thí nghiệm ảo</b> giống Tinkercad Circuits nhưng tính toán sát linh kiện thật trong robot: pin 4S, buck XL4015, PIC16F877A, ESP32-S3, MOSFET, DRV8871… <b>Nối sai là hỏng</b> — LED cháy, tụ nổ, dây chảy, chip chết — đúng theo mạch bạn đã nối.</p>
      <h4>Cách dùng</h4>
      <ol>
        <li><b>Kéo linh kiện</b> từ bảng 📦 bên trái vào cảnh. Thả lên breadboard → chân tự rơi vào lỗ (lưới 2.54 mm). Bấm để chọn, kéo để dời (dây nối vào cực mô-đun bám theo), <b>Q/E</b> xoay 90°, <b>Del</b> xoá.</li>
        <li><b>✏️ Nối dây</b> (nút góc phải hoặc bảng Thí nghiệm): bấm một lỗ/chân, rồi bấm lỗ/chân thứ hai → có dây. Chọn màu dây ở các chấm màu. Bấm vào dây để chọn → <b>Del</b> xoá. <b>Esc</b> huỷ.</li>
        <li><b>Rê chuột lên một lỗ</b>: mọi lỗ cùng lưới điện sáng xanh (kể cả nối qua dây) + điện áp tại đó.</li>
        <li>Chọn một linh kiện → bảng <b>Thuộc tính</b> bên phải: đổi giá trị điện trở, màu LED, điện áp nguồn, gạt công tắc (phím <b>Space</b>), nạp chương trình cho PIC…</li>
        <li><b>⚡ Cấp nguồn</b> → bộ giải chạy liên tục. Xem số đo, máy hiện sóng, nhiệt độ. <b>🔴⚫ Que đo</b>: bấm điểm 1 (que đen COM) rồi điểm 2 (que đỏ) → đồng hồ vạn năng hiện số trên màn hình 3D.</li>
        <li>Bắt đầu từ <b>Mạch mẫu</b> (✅ đúng, ❌ sai) hoặc mục <b>⚠️ Thử lắp sai</b>. Mạch tự lưu trong trình duyệt; xuất/nhập file JSON để chia sẻ.</li>
      </ol>
      <p>Thử: nạp "✅ LED + điện trở", bấm ⚡, rồi chọn điện trở và đổi xuống 10 Ω — xem LED nóng rồi chết. Hoặc nạp "✅ MOSFET + động cơ", chọn diode rồi Del → bấm vào lỗ d33 để xem xung 66 V trên máy hiện sóng.</p>\`,
    specs: [
      ['Breadboard', '830 lỗ: 63 cột × 2 dải 5 lỗ (a–e, f–j) + 4 thanh nguồn 50 lỗ, bước 2.54 mm, rãnh giữa 7.62 mm'],
      ['Bộ giải', 'Phân tích nút cải biên (MNA) · Newton–Raphson (giới hạn bước pnjlim, chia nhỏ bước, gmin stepping) · Euler lùi cho tụ/cuộn cảm · dt 0.1–1 ms'],
      ['Điện trở / dây', '¼ W (Rth 340 °C/W): khói 250 °C, đứt 360 °C · dây nhảy 0.2 mm² ~0.03 Ω: vỏ chảy 160 °C, lõi đồng chảy 1085 °C'],
      ['LED 5 mm', 'Vf ở 20 mA: đỏ 2.0 · vàng 2.1 · xanh lá 2.2 · xanh dương/trắng 3.1 V · tối đa 30 mA · chịu ngược 5 V'],
      ['Diode', '1N4007 (1 A/1000 V, Vf ~0.9 V) · 1N5822 Schottky (3 A/40 V, Vf ~0.45 V)'],
      ['Tụ', 'Gốm 100 nF / 22 pF (50 V) · hoá 1000 µF/25 V, 100 µF/16 V: ngược cực hoặc > 1.3·Vr → dòng rò → sôi → nổ ở 105 °C'],
      ['MOSFET', 'IRLZ44N: Vth 1.5 V, 22 mΩ @5 V, BVdss 55 V · IRF520: Vth 3.1 V, cần 10 V · diode thân + đánh thủng thác lũ'],
      ['Nguồn', 'Pin 4S 16.8→12 V theo % (R trong 0.1 Ω, BMS: SCP 100 A, OCP 35 A, UVP 2.7 V/cell) · pin 9 V · nguồn bàn CV/CC · máy phát xung'],
      ['Mô-đun', 'Buck XL4015 (hiệu suất ~90 %, chết khi cắm ngược / > 40 V) · LM1117-3.3 · DRV8871 (ILIM 2.1 A, TSD 175 °C) · BSS138 4 kênh'],
      ['Vi điều khiển', 'PIC16F877A: 4–5.5 V, tuyệt đối 7.5 V, 25 mA/chân · ESP32-S3: 3.3 V, tuyệt đối 3.6 V, GPIO không chịu 5 V'],
      ['Động cơ RS-360', 'R 7 Ω, L 1.5 mH, Ke 0.011 V·s/rad: không tải ~11 000 vòng/phút, kẹt ~2 A ở 14.4 V'],
      ['Đồng hồ', 'V: 10 MΩ · mA: shunt 1 Ω + cầu chì 200 mA · A: 0.01 Ω + cầu chì 10 A · Ω: nguồn đo 3 V/10 kΩ'],
    ],
    principle: \`
      <h4>1. Bên trong breadboard</h4>
      <p>Dưới mỗi cột có một <b>lá đồng thau đàn hồi 5 ngàm</b>: 5 lỗ a–e của cùng một cột là MỘT điểm điện, 5 lỗ f–j là một điểm khác. Rãnh giữa tách 2 nửa — vì vậy IC cắm vắt qua rãnh để mỗi chân có một dải riêng. Bốn <b>thanh nguồn</b> (đỏ +, xanh −) chạy dọc theo chiều dài bảng (một số loại bị chia đôi ở giữa — luôn đo trước!). Rê chuột lên lỗ để thấy các lỗ "anh em".</p>
      <div class="tip">Lá ngàm chỉ chịu ~1 A và có điện trở tiếp xúc ~10–20 mΩ: breadboard KHÔNG dành cho dòng động cơ lớn — trong robot thật phải hàn mạch.</div>
      <h4>2. Bộ giải tính như thế nào? (MNA — nói đơn giản)</h4>
      <p>Mỗi điểm nối (lưới) có một điện áp chưa biết. Định luật Kirchhoff: <b>dòng chảy vào một điểm = dòng chảy ra</b>. Mỗi linh kiện "góp" vào phương trình của 2 điểm nó nối: điện trở góp <code>(V₁ − V₂)/R</code>. Gom lại được hệ <code>A·x = b</code> (vài chục ẩn) → giải bằng khử Gauss. Nguồn áp lý tưởng thêm một ẩn là dòng qua nó — đó là chữ "cải biên" (Modified).</p>
      <h4>3. Linh kiện phi tuyến — Newton–Raphson</h4>
      <p>Diode/LED: <code>I = Is·(e^(V/nVt) − 1)</code> không phải đường thẳng. Bộ giải đoán nghiệm, thay đường cong bằng tiếp tuyến tại đó, giải lại… tới khi nghiệm không đổi (thường 2–5 vòng). Điện áp tiếp giáp bị giới hạn mỗi vòng (pnjlim) để e^x không "nổ"; nếu vẫn không hội tụ thì chia nhỏ bước thời gian hoặc thêm điện dẫn phụ rồi bớt dần (gmin stepping).</p>
      <h4>4. Tụ, cuộn cảm, thời gian</h4>
      <p>Mỗi bước dt, tụ thành "điện trở C/dt song song nguồn dòng" (Euler lùi): <code>i = C·(v − v_trước)/dt</code>; cuộn cảm tương tự với <code>v = L·di/dt</code>. Nhờ vậy thấy được nạp RC, dòng khởi động động cơ, xung flyback khi ngắt cuộn cảm.</p>
      <h4>5. Nhiệt & hư hỏng</h4>
      <p>Mỗi linh kiện là một khối nhiệt: <code>C·dT/dt = P − (T − Ta)/Rth</code>, với P do bộ giải tính. Vượt ngưỡng → nóng → bốc khói → cháy → <b>chết</b>: hở mạch (LED, điện trở, dây) hoặc chập (MOSFET, diode, IC). Mô hình điện đổi theo → hỏng lan truyền: PIC chết chập làm nguồn bị ngắn mạch, cầu chì đứt…</p>
      <h4>6. Giới hạn của mô phỏng</h4>
      <ul>
        <li>Vi điều khiển là mô hình <b>hành vi</b>: chương trình nạp sẵn, chân ra = nguồn 25–30 Ω, không mô phỏng lệnh, UART, ADC chi tiết, PWM 20 kHz (máy phát xung tối đa 200 Hz).</li>
        <li>Buck/LDO/DRV8871 tính <b>trung bình theo chu kỳ đóng cắt</b> (không thấy gợn 180 kHz). Thạch anh chỉ kiểm tra có/không.</li>
        <li>Không mô phỏng nhiễu điện từ, điện dung ký sinh, điện trở tiếp xúc breadboard, cháy lan sang linh kiện bên cạnh.</li>
        <li>Thời gian chết/nổ là ước lượng từ thông số nhiệt điển hình — thực tế dao động nhiều lần.</li>
      </ul>\`,
    inRobot: \`
      <p>Các mạch mẫu chính là từng khối trong sơ đồ nguồn & chân của dự án (<code>docs/01_KIEN_TRUC_VA_SO_DO_CHAN.md</code>):</p>
      <ul>
        <li><b>Pin 4S → cầu chì → buck 5 V → PIC</b>: đúng chuỗi nguồn logic của robot (mục 2). Đo Vout buck bằng đồng hồ TRƯỚC khi cắm PIC.</li>
        <li><b>Mạch PIC tối thiểu</b>: VDD/VSS cả 2 cặp (11-12, 32-31) + tụ 100 nF mỗi cặp, MCLR 10 kΩ lên 5 V, thạch anh 20 MHz + 2 tụ 22 pF, LED trạng thái RD7 (chân 30) qua 330 Ω.</li>
        <li><b>Phân áp 33k/10k → AN0 (chân 2)</b>: firmware tính <code>vbat_mv = adc × 21017/1000</code>, cắt khi &lt; 12.4 V. Chương trình "RoboVac rút gọn" của PIC đọc đúng chân này.</li>
        <li><b>MOSFET + động cơ + diode</b>: chổi cuộn / chổi cạnh (RD5, RD6 → 100 Ω → cổng IRLZ44N, 10 kΩ kéo xuống, SS34 song song ngược động cơ — quy tắc 4).</li>
        <li><b>DRV8871</b>: bánh xe (RC2 PWM → IN1, RD0 DIR → IN2).</li>
        <li><b>BSS138</b>: UART PIC (5 V) ⇄ ESP32 (3.3 V) — RC6/TX → HV1 → LV1 → GPIO18; GPIO17 → LV2 → HV2 → RC7/RX.</li>
      </ul>
      <p>Hãy dựng thử trên bàn ảo trước, rồi mới cắm thật — và luôn dùng nguồn bàn có giới hạn dòng cho lần cấp điện đầu tiên.</p>\`,
    mistakes: \`
      <ul>
        <li><b>Cắm IC không vắt qua rãnh</b> → các chân đối diện bị nối chung qua dải 5 lỗ (rê chuột lên lỗ để kiểm tra).</li>
        <li><b>Quên nối thanh nguồn trên với dưới</b> (hoặc loại breadboard có thanh nguồn chia đôi) → một nửa mạch không có điện.</li>
        <li><b>LED không điện trở</b>, <b>tụ hoá ngược cực</b>, <b>12 V vào PIC</b>, <b>5 V vào ESP32</b> — đều có trong mục ⚠️ để xem hậu quả.</li>
        <li><b>Không chung GND</b> giữa nguồn động cơ và nguồn logic → tín hiệu điều khiển "lơ lửng".</li>
        <li><b>Đồng hồ để thang A</b> rồi đo điện áp → chập mạch, đứt cầu chì đồng hồ.</li>
        <li><b>Chỉ nối 1 cặp VDD/VSS</b> của PIC, <b>MCLR thả nổi</b>, <b>thiếu thạch anh</b> → PIC không chạy (bộ mô phỏng báo đúng lý do).</li>
        <li>Dùng breadboard cho dòng &gt; 1 A (động cơ) → lá ngàm nóng, chảy nhựa — trong robot thật phải hàn & dùng dây to.</li>
      </ul>\`,
    quiz: [
      { q: 'Trên breadboard, lỗ c12 và lỗ h12 có nối với nhau không? Còn c12 và c13?', a: 'Không với cả hai. c12 thuộc dải a–e cột 12; h12 thuộc dải f–j cột 12 (rãnh giữa tách 2 nửa). c13 là cột khác → dải khác. Chỉ a12…e12 là cùng một điểm.' },
      { q: 'LED xanh dương (Vf 3.1 V) dùng ở 5 V, muốn ~10 mA thì cần điện trở bao nhiêu?', a: 'R = (5 − 3.1)/0.01 = 190 Ω → chọn 180–220 Ω. Kiểm tra lại: (5 − 3.1)/220 ≈ 8.6 mA.' },
      { q: 'Vì sao ngắt động cơ bằng MOSFET mà không có diode thì cực D lên tới ~66 V dù pin chỉ 14.4 V?', a: 'Cuộn dây có điện cảm L giữ dòng không đổi tức thời: V = L·di/dt rất lớn khi cắt dòng đột ngột, điện áp tăng tới khi MOSFET bị đánh thủng thác lũ (~1.2 × 55 V). Diode flyback cho dòng một đường vòng để chảy tiếp → Vds chỉ còn VBAT + Vf.' },
      { q: 'Bộ giải MNA cần "nút 0" (GND) để làm gì? Nếu một mạch không nối gì với GND thì sao?', a: 'Điện áp luôn là hiệu giữa 2 điểm; cần một điểm làm mốc 0 V. Mạch thả nổi vẫn có hiệu điện thế đúng giữa các điểm của nó, nhưng điện áp "so với GND" không xác định — bộ giải gắn điện trở 1 GΩ từ mỗi nút xuống GND (gmin) để hệ phương trình vẫn giải được.' },
    ],
  },

  faults: FAULTS,

  // ============================================================ DỰNG CẢNH
  build(ctx) {
    const { THREE, MAT, geom, fx } = ctx;
    const viewer = ctx.viewer;
    const dom = !!(viewer && viewer.container && hasDom);
    const root = new THREE.Group();
    const V3 = THREE.Vector3;

    // ---------- mặt bàn, breadboard, đồng hồ ----------
    const wood = MAT.plasticWhite.clone();
    wood.color = new THREE.Color(0xb88a5a);
    wood.roughness = 0.75;
    root.add(geom.part(geom.mesh(geom.box(480, 12, 320, 4), wood, { y: -6 }), 'Mặt bàn thí nghiệm', 'Đặt mô-đun (nguồn, pin, buck, động cơ…) ở ngoài breadboard và nối dây tới cực của chúng.'));
    const matM = MAT.rubber.clone();
    matM.color = new THREE.Color(0x2e5d4b);
    const mat = geom.mesh(geom.box(220, 0.6, 110, 2), matM, { y: 0.3, z: 0 });
    mat.userData.noPick = true;
    root.add(mat);
    const bb = buildBreadboard(ctx);
    root.add(bb.group);
    const mm = buildMultimeter(ctx);
    mm.group.position.set(185, 0, 75);
    mm.group.rotation.y = -0.3;
    root.add(mm.group);
    const partsG = new THREE.Group();
    const wiresG = new THREE.Group();
    const leadsG = new THREE.Group();
    root.add(partsG, wiresG, leadsG);
    ctx.label(bb.group, 'Breadboard 830 lỗ', [0, 14, -33]);
    ctx.label(mm.group, 'Đồng hồ vạn năng', [0, 45, -50]);

    // ---------- trạng thái ----------
    const def0 = PRESETS.led.build();
    const saved = store.get(EXTRA);
    let wires = (saved?.wires || def0.wires).map((w) => ({ ...w }));
    let props = saved?.props ? { ...saved.props } : { ...def0.props };
    let meter = { mode: 'V', com: saved?.meter?.com ?? def0.meter.com, probe: saved?.meter?.probe ?? def0.meter.probe };
    let probeEp = saved?.probe ?? def0.probe;
    let wireSeq = Math.max(0, ...wires.map((w) => w.id)) + 1;
    let powered = false;
    let mode = 'select';                 // 'select' | 'wire' | 'probe'
    let pending = null;                  // điểm đầu khi đang nối dây / đặt que
    let selWire = null;
    let wireColor = 'red';
    let nl = null;
    let dirty = true, layoutDirty = true;
    let debt = 0, simRate = 1, simInfo = '';
    let iSup = 0, vPeak = 0;
    const pinInfo = new Map();           // uid → { tên chân: { hole, net, world } }
    const labels = new Map();            // uid → 'R1'
    let holeGroups = new Map();
    const fxTimers = new Map();
    const heated = new Set();
    const spin = new Map();
    const log = [];
    let itemsRef = [];
    let sb = null;
    let dragItem = null;
    let presetName = saved ? 'Mạch đã lưu trong trình duyệt' : PRESETS.led.name;

    const propsOf = (it) => (props[it.uid] ||= { ...(CAT[it.type]?.props || {}) });
    const toWorld = (v) => root.localToWorld(v.clone());
    const saveExtra = () => store.set(EXTRA, { wires: wires.map(({ id, a, b, color }) => ({ id, a, b, color })), props, meter: { com: meter.com, probe: meter.probe }, probe: probeEp });

    // ---------- điểm nối: 'h:<lỗ>' hoặc 'p:<uid>:<chân>' ----------
    function epInfo(ep) {
      if (!ep) return null;
      if (ep.startsWith('h:')) {
        const h = bb.byId.get(ep.slice(2));
        return h ? { net: h.net, world: new V3(h.x, BB_TOP, h.z), label: \`lỗ \${h.id}\`, hole: h } : null;
      }
      const [, u, pin] = ep.split(':');
      const pi = pinInfo.get(+u)?.[pin];
      return pi ? { net: pi.net, world: pi.world, label: \`\${labels.get(+u)}.\${pin}\`, hole: pi.hole } : null;
    }

    /** toạ độ & lỗ cắm của từng chân một linh kiện */
    function pinsOf(it) {
      const c = CAT[it.type];
      const o = it.object;
      o.updateMatrixWorld(true);
      const onBoard = Math.abs(o.position.y - BB_TOP) < 0.6;
      const aligned = Math.abs(Math.sin(2 * o.rotation.y)) < 0.03;
      const info = {};
      for (const p of c.pins) {
        const w = root.worldToLocal(o.localToWorld(new V3(p.x, p.y, p.z)));
        const hole = p.ins && onBoard && aligned ? bb.holeAt(w.x, w.z, 0.6) : null;
        info[p.n] = { hole, net: hole ? hole.net : \`pin:\${it.uid}:\${p.n}\`, world: hole ? new V3(hole.x, BB_TOP, hole.z) : w, pin: p };
      }
      pinInfo.set(it.uid, info);
      return info;
    }
    /** đang kéo một linh kiện: chỉ cập nhật chân của nó + dây/que đo bám vào nó (dây đi theo liên tục) */
    function dragRefresh(it) {
      if (!CAT[it.type] || !labels.has(it.uid)) { layoutDirty = true; return; }
      pinsOf(it);
      const tag = \`p:\${it.uid}:\`;
      for (const w of wires) if (w.a.startsWith(tag) || w.b.startsWith(tag)) updateWireMesh(w);
      if (meter.com?.startsWith(tag) || meter.probe?.startsWith(tag)) updateLeads();
      dirty = true;                                   // cắm/rút khi đang có điện → mạch đổi ngay
    }

    // ---------- sau mỗi thay đổi bố cục: chân cắm lỗ nào, dây đi đâu ----------
    function refreshLayout() {
      pinInfo.clear(); labels.clear();
      const cnt = {};
      const items = [...itemsRef].sort((a, b) => a.uid - b.uid);
      root.updateMatrixWorld(true);
      for (const it of items) {
        const c = CAT[it.type];
        if (!c) continue;
        const pre = PREFIX[c.etype] || 'X';
        cnt[pre] = (cnt[pre] || 0) + 1;
        labels.set(it.uid, \`\${pre}\${cnt[pre]}\`);
        const o = it.object;
        pinsOf(it);
        o.userData.view?.apply?.(propsOf(it), LED_COLORS);
        if (o.userData.part) o.userData.part = { ...o.userData.part, name: \`\${labels.get(it.uid)} — \${c.name}\` };
      }
      for (const w of wires) updateWireMesh(w);
      updateLeads();
      layoutDirty = false;
    }

    // ---------- dây 3D ----------
    function wireCurve(a, b) {
      const d = a.distanceTo(b);
      const lift = Math.min(30, 3 + d * 0.22);
      const top = Math.max(a.y, b.y) + lift;
      const L = (k, y) => new V3().lerpVectors(a, b, k).setY(y);
      const pts = d < 30
        ? [a.clone().setY(a.y - 1.2), a.clone().setY(a.y + lift * 0.5), L(0.5, top), b.clone().setY(b.y + lift * 0.5), b.clone().setY(b.y - 1.2)]
        : [a.clone().setY(a.y - 1.2), a.clone().setY(a.y + lift * 0.6), L(0.25, top - lift * 0.15), L(0.5, top), L(0.75, top - lift * 0.15), b.clone().setY(b.y + lift * 0.6), b.clone().setY(b.y - 1.2)];
      return new THREE.CatmullRomCurve3(pts);
    }
    function updateWireMesh(w) {
      const A = epInfo(w.a), Bp = epInfo(w.b);
      w.ok = !!(A && Bp);
      if (!w.ok) { if (w.mesh) w.mesh.visible = false; return; }
      w.netA = A.net; w.netB = Bp.net;
      w.label = \`Dây \${A.label.replace('lỗ ', '')}–\${Bp.label.replace('lỗ ', '')}\`;
      const curve = wireCurve(A.world, Bp.world);
      w.len = curve.getLength();
      w.mid = curve.getPoint(0.5);
      const g = new THREE.TubeGeometry(curve, Math.max(24, Math.round(w.len / 3)), 0.55, 8, false);
      if (!w.mesh) {
        w.mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: WHEX[w.color] ?? 0xd23b3b, roughness: 0.5, emissive: 0x000000 }));
        w.mesh.castShadow = true;
        w.mesh.userData.wireId = w.id;
        wiresG.add(w.mesh);
      } else { w.mesh.geometry.dispose(); w.mesh.geometry = g; w.mesh.visible = true; }
      w.mesh.userData.part = { name: \`Dây nối \${A.label} ↔ \${Bp.label}\`, desc: 'Dây nhảy 0.2 mm² (~0.03 Ω). Bấm để chọn, Del để xoá. Dòng lớn → nóng đỏ, chảy vỏ.' };
    }
    function removeWire(w) {
      if (w.mesh) { wiresG.remove(w.mesh); w.mesh.geometry.dispose(); }
      wires = wires.filter((x) => x !== w);
      if (selWire === w) selWire = null;
      dirty = true; saveExtra();
    }
    function addWire(a, b) {
      if (a === b) return;
      const w = { id: wireSeq++, a, b, color: wireColor };
      wires.push(w);
      updateWireMesh(w);
      dirty = true; saveExtra();
    }
    function clearWires() { for (const w of [...wires]) removeWire(w); }

    // ---------- que đo đồng hồ ----------
    const leadMats = { com: new THREE.MeshStandardMaterial({ color: 0x1d1f23, roughness: 0.5 }), red: new THREE.MeshStandardMaterial({ color: 0xd23b3b, roughness: 0.5 }) };
    function updateLeads() {
      for (const c of [...leadsG.children]) { leadsG.remove(c); c.geometry?.dispose(); }
      if (meter.mode === 'off') return;
      mm.group.updateMatrixWorld(true);
      const jack = (k) => root.worldToLocal(mm.group.localToWorld(new V3(...mm.jacks[k])));
      const pairs = [['com', meter.com, leadMats.com], [meter.mode === 'A' || meter.mode === 'mA' ? 'a' : 'v', meter.probe, leadMats.red]];
      for (const [j, ep, m] of pairs) {
        const e = epInfo(ep);
        const a = jack(j);
        const b = e ? e.world.clone().setY(e.world.y + 1) : a.clone().add(new V3(-30, -28, 40));
        const curve = wireCurve(a, b);
        leadsG.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.9, 8, false), m));
        const tip = geom.mesh(geom.cyl(0.4, 1.2, 10, 10), MAT.steel, { x: b.x, y: b.y + 5, z: b.z });
        leadsG.add(tip);
      }
    }

    // ---------- dựng mạch cho bộ giải ----------
    function rebuild() {
      if (layoutDirty) refreshLayout();
      if (nl) for (const it of itemsRef) {          // giữ % pin đã xả
        const e = nl.partEls.get(it.uid)?.[0];
        if (e && 'soc' in e.p && (CAT[it.type]?.etype === 'pack4s' || CAT[it.type]?.etype === 'bat9v')) propsOf(it).soc = Math.round(e.p.soc * 1000) / 10;
      }
      const parts = [];
      let ground = null, gp = 99;
      for (const it of itemsRef) {
        const c = CAT[it.type];
        const info = pinInfo.get(it.uid);
        if (!c || !info) continue;
        const pins = {};
        for (const p of c.pins) pins[p.n] = info[p.n].net;
        parts.push({ uid: it.uid, type: c.etype, props: propsOf(it), label: labels.get(it.uid), pins });
        const pr = SRC_PRI[c.etype];
        if (pr !== undefined && pr < gp) { gp = pr; ground = pins['-'] ?? pins.GND; }
      }
      const ws = wires.filter((w) => w.ok).map((w) => ({ id: w.id, a: w.netA, b: w.netB, len: w.len, label: w.label }));
      const m = { mode: meter.mode, com: epInfo(meter.com)?.net ?? null, probe: epInfo(meter.probe)?.net ?? null };
      nl = buildCircuit({ parts, wires: ws, meter: m, ground, powered }, nl);
      holeGroups = new Map();
      for (const h of bb.holes) { const g = nl.groupOf(h.net); (holeGroups.get(g) || holeGroups.set(g, []).get(g)).push(h); }
      dirty = false;
    }

    function partOfEl(el) {
      const k = String(el.key);
      if (k.startsWith('w:')) { const w = wires.find((x) => \`w:\${x.id}\` === k); return w ? { wire: w, name: w.label || 'Dây nối' } : null; }
      if (k === 'meter') return { meter: true, name: 'Đồng hồ vạn năng' };
      const uid = parseInt(k, 10);
      const it = itemsRef.find((i) => i.uid === uid);
      return it ? { it, name: labels.get(uid) } : null;
    }
    function fxSpot(t) {
      if (t.wire?.mesh) return { pos: toWorld(t.wire.mid || new V3()), size: 4 };
      if (t.meter) return { pos: mm.group.localToWorld(new V3(0, 35, 56)), size: 10 };
      const o = t.it.object;
      const box = new THREE.Box3().setFromObject(o);
      const s = box.getSize(new V3());
      const c = box.getCenter(new V3());
      return { pos: new V3(c.x, box.max.y, c.z), size: Math.max(3, Math.min(25, s.length() / 3)) };
    }
    function handleEvents() {
      for (const e of nl.circuit.drainEvents()) {
        const t = partOfEl(e.el);
        if (!t || !e.up) continue;
        const { pos, size } = fxSpot(t);
        const name = \`\${t.name}\${t.it ? \` (\${CAT[t.it.type].name})\` : ''}\`;
        const isFuse = e.el instanceof Fuse;
        if (e.type === 'smoking') fx.smoke(pos, { size, duration: 5 });
        if (e.type === 'burning') { fx.fire(pos, { size: size * 0.7, duration: 2.5 }); fx.smoke(pos, { size: size * 1.3, duration: 6 }); }
        if (e.type === 'dead') {
          fx.sparks(pos, { count: isFuse ? 25 : 50, speed: isFuse ? 25 : 45, size: Math.max(0.3, size * 0.08) });
          fx.flash(pos, { size: size * 4, duration: 0.25, color: 0xffe0b0 });
          if (!isFuse) {
            fx.smoke(pos, { size, duration: 4 });
            const tgt = t.it?.object.userData.view?.heat || t.it?.object || t.wire?.mesh;
            if (tgt) fx.scorch(tgt, 0.8);
          } else if ((e.el.blowI || 0) > 20 * (e.el.p.rating || 1)) fx.smoke(pos, { size: size * 0.6, duration: 2 });
        }
        if (e.type === 'exploded') {
          const tgt = t.it?.object.userData.view?.pop || t.it?.object;
          if (tgt) fx.pop(tgt, { force: 70, size: Math.max(4, size) });
          fx.flash(pos, { size: size * 5, duration: 0.3, color: 0xfff1c0 });
        }
        if (e.type === 'pin') fx.sparks(pos, { count: 12, speed: 15, size: 0.3 });
        const msg = \`\${name}: \${e.type === 'pin' ? '⚡' : ''}\${STATE_VI[e.type] || 'hỏng chân'}\${isFuse && e.type === 'dead' ? ' (cầu chì ĐỨT — đã bảo vệ mạch)' : ''} — \${e.cause || ''}\`;
        log.unshift(msg);
        if (log.length > 8) log.pop();
      }
    }

    // ---------- tham số giao diện ----------
    const last = {};
    function loadData(d, { fresh = true } = {}) {
      clearWires();
      wires = (d.wires || []).map((w) => ({ ...w }));
      wireSeq = Math.max(0, ...wires.map((w) => w.id)) + 1;
      props = JSON.parse(JSON.stringify(d.props || {}));
      meter = { ...meter, com: d.meter?.com ?? null, probe: d.meter?.probe ?? null };
      if (d.meter?.mode) meter.mode = d.meter.mode;
      probeEp = d.probe ?? null;
      selWire = null; pending = null;
      if (fresh) { nl = null; fx.restore(root); log.length = 0; heated.clear(); }
      sb.load(d.items || []);
      layoutDirty = true; dirty = true;
      saveExtra();
    }
    function loadPreset(id) {
      const pr = PRESETS[id];
      if (!pr) return;
      powered = false;
      loadData(pr.build());
      presetName = pr.name;
    }
    function repairAll() {
      if (nl) for (const el of nl.byKey.values()) el.repair();
      fx.restore(root);
      heated.clear(); fxTimers.clear(); log.length = 0;
      for (const w of wires) if (w.mesh) w.mesh.material.emissive.setHex(0);
    }
    function setMode(m) {
      mode = mode === m ? 'select' : m;
      pending = null;
      if (sb) sb.enabled = mode === 'select';
      if (band) band.visible = false;
      syncToolbar();
    }
    function togglePower() { powered = !powered; syncToolbar(); }
    function exportJson() {
      if (!dom) return;
      const data = { format: 'robovac-ban-mach', version: 1, items: sb.serialize(), wires: wires.map(({ id, a, b, color }) => ({ id, a, b, color })), props, meter: { com: meter.com, probe: meter.probe }, probe: probeEp };
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = 'mach-breadboard.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    let fileInput = null;
    function importJson() {
      if (!dom) return;
      if (!fileInput) {
        fileInput = document.createElement('input');
        fileInput.type = 'file'; fileInput.accept = '.json,application/json';
        fileInput.onchange = async () => {
          const f = fileInput.files[0];
          if (!f) return;
          try {
            const d = JSON.parse(await f.text());
            if (Array.isArray(d)) loadData({ items: d, wires: [], props: {} });
            else loadData(d);
            presetName = \`Mở từ file \${f.name}\`;
          } catch { alert('File mạch không hợp lệ'); }
          fileInput.value = '';
        };
      }
      fileInput.click();
    }

    // ---------- giao diện DOM (chỉ khi có trình duyệt) ----------
    let bar = null, panel = null, status = null, band = null;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let hoverEp = null;
    const cleanups = [];
    const on = (t, ev, f, o) => { t.addEventListener(ev, f, o); cleanups.push(() => t.removeEventListener(ev, f, o)); };

    function setRay(e) {
      const r = viewer.renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, viewer.camera);
    }
    function itemOf(o) { for (; o; o = o.parent) if (o.userData.sandboxUid) return itemsRef.find((i) => i.uid === o.userData.sandboxUid); return null; }
    /** điểm nối dưới con trỏ: chân linh kiện gần nhất hoặc lỗ breadboard */
    function pick(e) {
      setRay(e);
      const hits = ray.intersectObjects([partsG, bb.body, wiresG], true).filter((h) => h.object.visible && !h.object.userData.noPick);
      for (const h of hits) {
        if (h.object.userData.wireId) return { wire: wires.find((w) => w.id === h.object.userData.wireId), dist: h.distance };
        const p = root.worldToLocal(h.point.clone());
        const it = itemOf(h.object);
        if (it) {
          const info = pinInfo.get(it.uid);
          if (!info) continue;
          let best = null, bd = Infinity;
          for (const [n, pi] of Object.entries(info)) { const d = pi.world.distanceTo(p); if (d < bd) { bd = d; best = [n, pi]; } }
          if (!best) continue;
          const [n, pi] = best;
          return { ep: pi.hole ? \`h:\${pi.hole.id}\` : \`p:\${it.uid}:\${n}\`, item: it, pin: n, dist: h.distance };
        }
        if (h.object === bb.body) {
          const hole = bb.holeAt(p.x, p.z, 1.4);
          return hole ? { ep: \`h:\${hole.id}\`, hole, dist: h.distance } : { board: true, dist: h.distance };
        }
      }
      return null;
    }
    function fmtV(v) { return v == null ? 'hở (không nối gì)' : \`\${v.toFixed(Math.abs(v) < 10 ? 3 : 2)} V\`; }
    function epText(ep) {
      const e = epInfo(ep);
      if (!e) return '';
      const v = nl ? nl.v(e.net) : null;
      return \`\${e.label}\${e.hole ? \` · \${netName(e.net)}\` : ''} · \${powered ? fmtV(v) : 'chưa cấp nguồn'}\`;
    }
    function highlightEp(ep) {
      const e = epInfo(ep);
      if (!e || !nl) { bb.highlight([]); return; }
      bb.highlight(holeGroups.get(nl.groupOf(e.net)) || (e.hole ? [e.hole] : []), mode === 'wire' ? 0xffb347 : 0x3fcf8e);
    }

    if (dom) {
      const vp = viewer.container;
      bar = document.createElement('div');
      bar.style.cssText = 'position:absolute;top:10px;right:10px;z-index:8;display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end;max-width:60%;';
      bar.innerHTML = \`
        <button data-a="power" title="Cấp / ngắt nguồn tổng">⚡ Cấp nguồn</button>
        <button data-a="wire" title="Bấm lỗ/chân thứ nhất rồi lỗ/chân thứ hai">✏️ Nối dây</button>
        <span class="sw" style="display:flex;gap:3px;align-items:center;padding:0 4px">\${WIRE_COLORS.map(([k, n, h]) => \`<i data-c="\${k}" title="\${n}" style="width:15px;height:15px;border-radius:50%;cursor:pointer;display:inline-block;border:2px solid transparent;background:#\${h.toString(16).padStart(6, '0')}"></i>\`).join('')}</span>
        <button data-a="probe" title="Bấm điểm 1 = que đen (COM), điểm 2 = que đỏ">🔴⚫ Que đo</button>\`;
      [...bar.querySelectorAll('button')].forEach((b) => (b.style.cssText = 'background:color-mix(in srgb,var(--bg2) 85%,transparent);border:1px solid var(--line);border-radius:7px;padding:4px 9px;font-size:12px;cursor:pointer;color:var(--text)'));
      vp.appendChild(bar);
      on(bar, 'click', (e) => {
        const a = e.target.closest('button')?.dataset.a;
        const c = e.target.dataset?.c;
        if (c) { wireColor = c; syncToolbar(); if (selWire) { selWire.color = c; selWire.mesh?.material.color.setHex(WHEX[c]); saveExtra(); } }
        if (a === 'power') togglePower();
        if (a === 'wire') setMode('wire');
        if (a === 'probe') setMode('probe');
      });
      panel = document.createElement('div');
      panel.style.cssText = 'position:absolute;top:46px;right:10px;width:250px;max-height:calc(100% - 120px);overflow:auto;z-index:7;background:color-mix(in srgb,var(--bg2) 94%,transparent);border:1px solid var(--line);border-radius:11px;padding:8px 10px;font-size:12.5px;line-height:1.45;box-shadow:0 8px 24px rgba(0,0,0,.3);backdrop-filter:blur(6px)';
      vp.appendChild(panel);
      status = document.createElement('div');
      status.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);bottom:10px;z-index:7;max-width:70%;padding:4px 12px;border-radius:8px;font-size:12px;pointer-events:none;background:color-mix(in srgb,var(--bg2) 88%,transparent);border:1px solid var(--line);color:var(--text)';
      vp.appendChild(status);
      cleanups.push(() => { bar.remove(); panel.remove(); status.remove(); });
      const bandGeo = new THREE.BufferGeometry().setFromPoints([new V3(), new V3()]);
      band = new THREE.Line(bandGeo, new THREE.LineDashedMaterial({ color: 0xffb347, dashSize: 2, gapSize: 1.5 }));
      band.visible = false;
      band.userData.noPick = true;
      root.add(band);

      // con trỏ — đăng ký TRƯỚC sandbox để chạy trước (pha capture)
      const cv = viewer.renderer.domElement;
      let down = null;
      on(cv, 'pointerdown', (e) => {
        if (e.button !== 0) return;
        down = [e.clientX, e.clientY];
        if (mode !== 'select') return;
        const p = pick(e);
        if (p?.wire) { selWire = p.wire; sb?.select(null); renderPanel(true); e.stopImmediatePropagation(); return; }
        if (selWire) { selWire = null; renderPanel(true); }
      }, true);
      on(cv, 'pointerup', (e) => {
        if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) { down = null; return; }
        down = null;
        const p = pick(e);
        if (mode === 'wire' || mode === 'probe') {
          if (!p?.ep) return;
          if (!pending) { pending = p.ep; return; }
          if (mode === 'wire') addWire(pending, p.ep);
          else { meter.com = pending; meter.probe = p.ep; dirty = true; updateLeads(); saveExtra(); setMode('probe'); }
          pending = null;
          if (band) band.visible = false;
          return;
        }
        if (p?.ep && p.hole) { probeEp = p.ep; saveExtra(); }
      });
      on(cv, 'pointermove', (e) => {
        if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
        const p = pick(e);
        hoverEp = p?.ep || null;
        highlightEp(hoverEp || (pending ?? null));
        if (pending && band) {
          const a = epInfo(pending)?.world;
          let b = p?.ep ? epInfo(p.ep)?.world : null;
          if (!b) { const pl = new THREE.Plane(new V3(0, 1, 0), -BB_TOP); const q = new V3(); if (ray.ray.intersectPlane(pl, q)) b = root.worldToLocal(q); }
          if (a && b) { band.geometry.setFromPoints([a.clone().setY(a.y + 1), b.clone().setY(b.y + 1)]); band.computeLineDistances(); band.visible = true; }
        }
      });
      on(window, 'keydown', (e) => {
        if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return;
        const k = e.key.toLowerCase();
        if (k === 'escape' && mode !== 'select') { if (pending) { pending = null; band.visible = false; } else setMode(mode); }
        if ((k === 'delete' || k === 'backspace') && selWire) { e.preventDefault(); removeWire(selWire); renderPanel(true); }
        if (k === ' ' && sb?.selected) {
          const it = sb.selected, c = CAT[it.type];
          if (c?.etype === 'switch') { e.preventDefault(); propsOf(it).on = !propsOf(it).on; it.object.userData.view?.apply?.(propsOf(it)); dirty = true; renderPanel(true); saveExtra(); }
          if (c?.etype === 'button') { e.preventDefault(); if (!propsOf(it).pressed) { propsOf(it).pressed = true; it.object.userData.view?.apply?.(propsOf(it)); dirty = true; renderPanel(true); } }
        }
      });
      on(window, 'keyup', (e) => {
        if (e.key === ' ' && sb?.selected && CAT[sb.selected.type]?.etype === 'button') { propsOf(sb.selected).pressed = false; sb.selected.object.userData.view?.apply?.(propsOf(sb.selected)); dirty = true; renderPanel(true); }
      });
    }

    function syncToolbar() {
      if (!bar) return;
      const b = (a) => bar.querySelector(\`[data-a="\${a}"]\`);
      const pw = b('power');
      pw.textContent = powered ? '⏹ Ngắt nguồn' : '⚡ Cấp nguồn';
      pw.style.borderColor = powered ? 'var(--good)' : 'var(--line)';
      pw.style.color = powered ? 'var(--good)' : 'var(--text)';
      b('wire').style.borderColor = mode === 'wire' ? 'var(--accent2)' : 'var(--line)';
      b('wire').style.color = mode === 'wire' ? 'var(--accent2)' : 'var(--text)';
      b('probe').style.borderColor = mode === 'probe' ? 'var(--accent)' : 'var(--line)';
      bar.querySelectorAll('[data-c]').forEach((i) => (i.style.borderColor = i.dataset.c === wireColor ? 'var(--accent)' : 'transparent'));
    }

    // ---------- bảng Thuộc tính ----------
    let panelKey = '', liveT = 0;
    function elsOf(it) { return nl?.partEls.get(it.uid) || []; }
    function liveHtml() {
      if (selWire) {
        const el = nl?.wireEls.get(selWire.id);
        if (!el) return '<i>Dây chưa nối vào mạch (một đầu bị tháo).</i>';
        return \`Dòng: <b>\${Math.abs(el.I).toFixed(3)} A</b> · \${el.T.toFixed(0)} °C · \${STATE_VI[el.state]}\${el.dead ? \` — \${el.dmg.cause}\` : ''}\`;
      }
      const it = sb?.selected;
      if (!it) return '';
      const els = elsOf(it);
      if (!els.length) return '';
      const e = els[0];
      const c = CAT[it.type];
      let s = '';
      if (c.etype === 'pic' || c.etype === 'esp32') s += \`<div>🧠 \${e.status}\${e.note ? \`<br>\${e.note}\` : ''}</div><div>VDD nội \${e.vcore?.toFixed(2) ?? '–'} V · dòng \${((e.Isup || 0) * 1000).toFixed(1)} mA</div>\`;
      else if (c.etype === 'buck') s += \`<div>Vin \${e.vin?.toFixed(2)} V → Vout \${e.vout?.toFixed(2)} V · \${e.iout?.toFixed(3)} A · η \${(e.eff * 100).toFixed(0)} %\${e.tsd ? ' · NGẮT NHIỆT' : ''}</div>\`;
      else if (c.etype === 'drv8871') s += \`<div>\${e.dir || ''} · Iout \${e.iA?.toFixed(2)} A · Vout \${e.vout?.toFixed(2)} V</div>\`;
      else if (c.etype === 'motor') s += \`<div>\${(e.rpm || 0).toFixed(0)} vòng/phút · \${e.I.toFixed(3)} A · E = \${(e.p.Ke * e.w).toFixed(2)} V</div>\`;
      else if (c.etype === 'nmos') s += \`<div>Vgs \${e.vgs?.toFixed(2)} V · Vds \${e.vds?.toFixed(2)} V · Id \${e.I.toFixed(3)} A · P \${e.P.toFixed(2)} W</div>\`;
      else if (c.etype === 'pack4s') s += \`<div>\${e.V.toFixed(2)} V · \${e.I.toFixed(2)} A · \${(e.p.soc * 100).toFixed(1)} %\${e.cut ? \` · BMS NGẮT (\${e.cut})\` : ''}</div>\`;
      else if (c.etype === 'bench') s += \`<div>\${e.V.toFixed(2)} V · \${e.I.toFixed(3)} A · \${e.cc ? 'GIỚI HẠN DÒNG (CC)' : 'ổn áp (CV)'}</div>\`;
      else if (c.etype === 'fuse') s += \`<div>\${e.blown ? '💥 ĐỨT' : 'Còn tốt'} · \${Math.abs(e.I).toFixed(2)} A</div>\`;
      else s += \`<div>V = \${e.V.toFixed(3)} V · I = \${(e.I * 1000).toFixed(2)} mA · P = \${(e.P * 1000).toFixed(1)} mW</div>\`;
      const T = Math.max(...els.map((x) => x.T));
      const worst = els.reduce((a, b) => (b.dmg && b.dmg.level > (a.dmg?.level ?? -1) ? b : a), els[0]);
      s += \`<div>🌡 \${T.toFixed(0)} °C · \${STATE_VI[worst.state]}\${worst.dmg?.cause && worst.state !== 'ok' ? \` — \${worst.dmg.cause}\` : ''}</div>\`;
      return s;
    }
    function renderPanel(force = false) {
      if (!panel) return;
      const it = sb?.selected;
      const key = selWire ? \`w\${selWire.id}\` : it ? \`i\${it.uid}:\${JSON.stringify(props[it.uid] || {})}\` : 'none';
      if (!force && key === panelKey) return;
      panelKey = key;
      let h = '';
      if (selWire) {
        h = \`<b>🔗 Dây nối</b><br>\${epInfo(selWire.a)?.label ?? '?'} ↔ \${epInfo(selWire.b)?.label ?? '?'}
          <div style="margin:6px 0">\${WIRE_COLORS.map(([k, n, x]) => \`<i data-wc="\${k}" title="\${n}" style="width:16px;height:16px;border-radius:50%;cursor:pointer;display:inline-block;margin-right:3px;border:2px solid \${k === selWire.color ? 'var(--accent)' : 'transparent'};background:#\${x.toString(16).padStart(6, '0')}"></i>\`).join('')}</div>
          <div class="live"></div><button data-act="delw" class="btn" style="margin-top:6px;width:100%">🗑 Xoá dây (Del)</button>\`;
      } else if (it) {
        const c = CAT[it.type];
        const pr = propsOf(it);
        const info = pinInfo.get(it.uid) || {};
        const insN = c.pins.filter((p) => p.ins).length, inN = Object.values(info).filter((x) => x.hole).length;
        h = \`<b>\${c.icon} \${labels.get(it.uid)} — \${c.name}</b><div style="color:var(--muted);margin:3px 0">\${c.desc || ''}</div>\`;
        if (insN) h += \`<div>\${inN === insN ? '✅' : inN ? '⚠️' : '⬜'} \${inN}/\${insN} chân đã cắm vào breadboard\${inN && inN < insN ? ' (xoay đúng 90°? chân lệch lỗ?)' : ''}</div>\`;
        for (const f of c.schema) {
          const v = pr[f.k];
          if (f.type === 'select') h += \`<label style="display:block;margin-top:6px">\${f.label}<select data-k="\${f.k}" style="width:100%">\${f.options.map(([ov, ol]) => \`<option value="\${ov}" \${String(ov) === String(v) ? 'selected' : ''}>\${ol}</option>\`).join('')}</select></label>\`;
          if (f.type === 'range') h += \`<label style="display:block;margin-top:6px">\${f.label}: <output>\${v}</output> \${f.unit || ''}<input data-k="\${f.k}" type="range" min="\${f.min}" max="\${f.max}" step="\${f.step}" value="\${v}" style="width:100%"></label>\`;
          if (f.type === 'toggle') h += \`<label style="display:block;margin-top:6px"><input data-k="\${f.k}" type="checkbox" \${v ? 'checked' : ''}> \${f.label}</label>\`;
        }
        if (c.etype === 'button') h += '<button data-act="press" class="btn" style="margin-top:6px;width:100%">👇 Giữ chuột để nhấn (hoặc phím Space)</button>';
        if (c.etype === 'switch') h += '<button data-act="flip" class="btn" style="margin-top:6px;width:100%">🔁 Gạt công tắc (Space)</button>';
        h += '<div class="live" style="margin-top:6px"></div><button data-act="fix" class="btn" style="margin-top:6px;width:100%">🔧 Thay linh kiện này bằng cái mới</button>';
      } else {
        h = \`<b>🧪 Bàn mạch</b><div style="color:var(--muted);margin-top:4px">\${mode === 'wire' ? 'Đang NỐI DÂY: bấm lỗ/chân thứ nhất, rồi lỗ/chân thứ hai. Esc để huỷ.' : mode === 'probe' ? 'Đặt QUE ĐO: bấm điểm 1 (que đen, COM) rồi điểm 2 (que đỏ).' : 'Kéo linh kiện từ bảng 📦 vào breadboard. Bấm một linh kiện để xem/sửa thuộc tính; bấm một dây để chọn; bấm một lỗ để đặt điểm đo cho máy hiện sóng.'}</div>\`;
      }
      if (log.length) h += \`<div style="margin-top:8px;border-top:1px solid var(--line);padding-top:5px"><b>📜 Nhật ký sự cố</b>\${log.map((l) => \`<div style="margin-top:3px;color:var(--bad)">\${l}</div>\`).join('')}</div>\`;
      panel.innerHTML = h;
      panel.querySelectorAll('button').forEach((b) => (b.style.cssText += ';padding:5px 8px;border-radius:7px;border:1px solid var(--line);background:var(--bg3);color:var(--text);cursor:pointer;font-size:12px'));
      panel.querySelectorAll('select').forEach((b) => (b.style.cssText += ';padding:3px 6px;border-radius:6px;border:1px solid var(--line);background:var(--bg3);color:var(--text);margin-top:2px'));
      panel.querySelectorAll('input[type=range]').forEach((b) => (b.style.accentColor = 'var(--accent)'));
      panel.querySelectorAll('[data-k]').forEach((inp) => {
        const k = inp.dataset.k;
        const f = CAT[it.type].schema.find((x) => x.k === k);
        const apply = () => {
          let v = inp.type === 'checkbox' ? inp.checked : inp.value;
          if (f.type === 'range') v = parseFloat(v);
          if (f.type === 'select' && typeof f.options[0][0] === 'number') v = parseFloat(v);
          propsOf(it)[k] = v;
          it.object.userData.view?.apply?.(propsOf(it), LED_COLORS);
          const out = inp.parentElement.querySelector('output');
          if (out) out.textContent = v;
          dirty = true; saveExtra();
          panelKey = \`i\${it.uid}:\${JSON.stringify(props[it.uid] || {})}\`;
        };
        inp.addEventListener(f.type === 'range' ? 'input' : 'change', apply);
      });
      panel.querySelectorAll('[data-wc]').forEach((i) => (i.onclick = () => { selWire.color = i.dataset.wc; selWire.mesh?.material.color.setHex(WHEX[selWire.color]); saveExtra(); renderPanel(true); }));
      const act = (a) => panel.querySelector(\`[data-act="\${a}"]\`);
      if (act('delw')) act('delw').onclick = () => { removeWire(selWire); renderPanel(true); };
      if (act('flip')) act('flip').onclick = () => { propsOf(it).on = !propsOf(it).on; it.object.userData.view?.apply?.(propsOf(it)); dirty = true; saveExtra(); renderPanel(true); };
      if (act('press')) {
        const b = act('press');
        const set = (v) => { propsOf(it).pressed = v; it.object.userData.view?.apply?.(propsOf(it)); dirty = true; panelKey = \`i\${it.uid}:\${JSON.stringify(props[it.uid] || {})}\`; };
        b.onpointerdown = () => set(true);
        b.onpointerup = b.onpointerleave = () => set(false);
      }
      if (act('fix')) act('fix').onclick = () => { elsOf(it).forEach((e) => e.repair()); fx.restore(it.object); heated.delete(it.object.userData.view?.heat || it.object); renderPanel(true); };
      const live = panel.querySelector('.live');
      if (live) live.innerHTML = liveHtml();
    }

    // ---------- kéo-thả (sandbox) ----------
    sb = ctx.sandbox({
      title: 'Linh kiện', root: partsG,
      catalog: CATALOG.map((c) => ({ id: c.id, name: c.name, icon: c.icon, group: c.group, desc: c.desc, build: () => c.build(ctx) })),
      surfaces: [bb.body], floorY: 0, grid: P, rotStep: 90,
      onDrag: (it) => { dragItem = it; },
      bounds: { minX: -230, maxX: 230, minZ: -150, maxZ: 150 },
      storageKey: STORE, initial: def0.items,
      onChange: (items) => { itemsRef = items; layoutDirty = true; dirty = true; if (sb) for (const w of wires) if (selWire === w && !w.ok) selWire = null; },
    });
    itemsRef = sb.items;
    syncToolbar();

    // ---------- hình ảnh mỗi khung ----------
    function visuals(dt) {
      if (!nl) return;
      for (const it of itemsRef) {
        const v = it.object.userData.view;
        const els = nl.partEls.get(it.uid);
        if (!v || !els?.length) continue;
        const e = els[0];
        const c = CAT[it.type];
        switch (c.etype) {
          case 'led': v.level?.(e.brightness); break;
          case 'motor': { const a = (spin.get(it.uid) || 0) + (e.w * dt) / 60; spin.set(it.uid, a); v.spin?.(a); break; }
          case 'bench': v.show?.(e.V, e.I, e.cc, powered); break;
          case 'buck': v.led?.(e.vout > 1 && !e.dead); break;
          case 'esp32': v.led?.(e.running && e.led, e.vcore > 2.5 && !e.dead); break;
          case 'pulse': v.show?.(e.p, powered, e.out); break;
          case 'ammeter': v.show?.(powered ? \`\${e.I.toFixed(3)} A\` : '0.000 A'); break;
          case 'fuse': v.blown?.(e.blown); break;
          default: break;
        }
        // nóng đỏ + khói/lửa lặp lại khi còn ở trạng thái xấu
        let T = 0, worst = null;
        for (const x of els) { if (x.T > T) T = x.T; if (!worst || (x.dmg && x.dmg.level > worst.dmg.level)) worst = x.dmg ? x : worst; }
        const tgt = v.heat || it.object;
        if (T > 85 && c.etype !== 'fuse') { fx.heat(tgt, Math.min(1, (T - 85) / 350)); heated.add(tgt); }
        else if (heated.has(tgt)) { fx.heat(tgt, 0); heated.delete(tgt); }
        if (worst && (worst.state === 'smoking' || worst.state === 'burning')) {
          const k = \`i\${it.uid}\`;
          const tt = (fxTimers.get(k) || 0) - dt;
          if (tt <= 0) {
            const { pos, size } = fxSpot({ it });
            fx.smoke(pos, { size, duration: 3 });
            if (worst.state === 'burning') fx.fire(pos, { size: size * 0.6, duration: 1.6 });
            fxTimers.set(k, worst.state === 'burning' ? 1.5 : 2.5);
          } else fxTimers.set(k, tt);
        }
      }
      for (const w of wires) {
        const el = nl.wireEls.get(w.id);
        if (!w.mesh || !el) continue;
        const m = w.mesh.material;
        const lv = Math.max(0, Math.min(1, (el.T - 60) / 500));
        if (lv > 0.01) { m.emissive.setRGB(lv, lv * lv * 0.4, 0); m.emissiveIntensity = 1.5; }
        else if (selWire === w) { m.emissive.setHex(0x2a7fff); m.emissiveIntensity = 0.7; }
        else m.emissive.setHex(0);
        if (el.dead && !w.burnt) { w.burnt = true; m.color.setHex(0x1a1410); m.transparent = true; m.opacity = 0.55; }
        if (!el.dead && w.burnt) { w.burnt = false; m.color.setHex(WHEX[w.color] ?? 0xd23b3b); m.transparent = false; m.opacity = 1; }
        if (el.state === 'smoking' || el.state === 'burning') {
          const k = \`w\${w.id}\`;
          const tt = (fxTimers.get(k) || 0) - dt;
          if (tt <= 0) { const p = toWorld(w.mid); fx.smoke(p, { size: 4, duration: 2.5 }); if (el.state === 'burning') fx.fire(p, { size: 3, duration: 1 }); fxTimers.set(k, 0.8); } else fxTimers.set(k, tt);
        }
      }
      // đồng hồ vạn năng
      const me = nl.meter;
      const unit = { V: 'V', mA: 'mA', A: 'A', ohm: 'Ω', off: '' }[meter.mode];
      let txt = 'OFF';
      if (meter.mode !== 'off') {
        const r = me?.reading;
        if (me && (meter.mode === 'A' || meter.mode === 'mA') && me.fuse.blown) txt = 'FUSE!';
        else if (r == null) txt = '- - - -';
        else if (meter.mode === 'ohm') txt = !Number.isFinite(r) || r > 4e7 ? 'O.L' : r >= 1e6 ? \`\${(r / 1e6).toFixed(2)}M\` : r >= 1e3 ? \`\${(r / 1e3).toFixed(2)}k\` : r.toFixed(1);
        else if (meter.mode === 'mA') txt = (r * 1000).toFixed(1);
        else txt = r.toFixed(Math.abs(r) < 10 ? 3 : 2);
      }
      mm.lcd.set([[txt, '#121810', 0.68], [unit + (meter.mode === 'ohm' && powered ? ' ⚠ có điện!' : ''), '#3a4a30', 0.32]]);
      mm.dial.rotation.y = { V: 0.6, mA: -0.4, A: -0.9, ohm: 1.4, off: 0 }[meter.mode] ?? 0;
      meterText = meter.mode === 'off' ? 'Tắt' : \`\${txt} \${unit}\${!epInfo(meter.com) || !epInfo(meter.probe) ? ' (chưa đặt que — bấm 🔴⚫)' : ''}\`;
    }
    let meterText = '';
    let camSet = false;

    // ---------- số đo ----------
    let roT = 0;
    function readouts(dt) {
      roT -= dt;
      if (roT > 0) return;
      roT = 0.1;
      const r = ctx.readout;
      r('pwr', powered ? '⚡ ĐANG CẤP' : '⏹ Đã ngắt');
      r('preset', presetName);
      let src = null, sp = 99;
      for (const it of itemsRef) { const p = SRC_PRI[CAT[it.type]?.etype]; if (p !== undefined && p < sp) { sp = p; src = nl?.partEls.get(it.uid)?.[0]; } }
      const z = (v) => (Math.abs(v) < 1e-5 ? 0 : v);
      r('vs', src ? z(src.V) : 0);
      r('is', src ? z(src.I) : 0);
      const pe = epInfo(probeEp);
      const pv = pe && nl ? nl.v(pe.net) : null;
      r('vp', pv == null ? (pe ? \`hở · \${pe.label}\` : 'bấm 1 lỗ để chọn') : \`\${pv.toFixed(3)} (\${pe.label})\`);
      r('dmm', meterText);
      let hot = null;
      const bad = [];
      if (nl) for (const el of nl.byKey.values()) {
        const t = partOfEl(el);
        if (!t) continue;
        if (!hot || el.T > hot.T) hot = { T: el.T, name: t.name, st: el.state };
        if (el instanceof Fuse && el.blown) bad.push(\`\${t.name} đứt\`);
        else if (el.dead) bad.push(\`\${t.name} \${el.state === 'exploded' ? 'NỔ' : 'chết'}\`);
        else if (el.state === 'smoking' || el.state === 'burning') bad.push(\`\${t.name} \${STATE_VI[el.state].toLowerCase()}\`);
        if (el.cut) bad.push(\`\${t.name}: BMS ngắt (\${el.cut})\`);
        if (el.deadPins?.length) bad.push(\`\${t.name}: hỏng \${el.deadPins.join(', ')}\`);
        if (el instanceof Meter && (el.fA.blown || el.fmA.blown)) bad.push(\`Đồng hồ: cầu chì \${el.fA.blown ? '10 A' : '200 mA'} đứt\`);
      }
      r('hot', hot && (hot.T > 40 || hot.st !== 'ok') ? \`\${hot.name} \${hot.T.toFixed(0)} °C\${hot.st !== 'ok' ? \` (\${STATE_VI[hot.st]})\` : ''}\` : 'Mọi linh kiện còn mát (< 40 °C)');
      r('bad', bad.length ? [...new Set(bad)].slice(0, 6).join(' · ') : 'Không có ✓');
      let mcu = '—';
      for (const it of itemsRef) {
        const et = CAT[it.type]?.etype;
        if (et === 'pic' || et === 'esp32') { const e = nl?.partEls.get(it.uid)?.[0]; if (e) { mcu = \`\${labels.get(it.uid)}: \${powered || e.vcore > 1 ? e.status : 'Chưa cấp nguồn'}\`; break; } }
      }
      r('mcu', mcu);
      r('sim', simInfo);
      if (panel) { liveT -= 0.1; if (liveT <= 0) { liveT = 0.25; const live = panel.querySelector('.live'); if (live) live.innerHTML = liveHtml(); } }
    }

    function status_(txt) { if (status) status.textContent = txt; }

    return {
      object: root,
      onAction(id, prm) {
        if (id === 'load') { loadPreset(prm.preset); last.preset = prm.preset; }
        if (id === 'power') togglePower();
        if (id === 'wire') setMode('wire');
        if (id === 'probe') setMode('probe');
        if (id === 'repair') repairAll();
        if (id === 'clearw') clearWires();
        if (id === 'export') exportJson();
        if (id === 'import') importJson();
        renderPanel(true);
      },
      /** (gỡ lỗi) mạch hiện tại */
      get netlist() { return nl; },
      triggerFault(id, prm) {
        const pr = PRESETS[id];
        if (!pr) return;
        loadPreset(id);
        if (prm) last.preset = prm.preset;
        const d = pr.build();
        if (d.meter?.mode) { meter.mode = d.meter.mode; if (prm) { prm.mmode = d.meter.mode; last.mmode = d.meter.mode; } }
        powered = true;
        syncToolbar();
      },
      resetFault() {
        repairAll();
        powered = false;
        syncToolbar();
      },
      update(dt, t, prm) {
        if (viewer && !camSet) {                       // lần đầu: nhìn gần breadboard thay vì cả mặt bàn
          camSet = true;
          viewer.controls.target.set(0, BB_TOP, 10);
          viewer.camera.position.set(25, 175, 215);
          viewer.controls.update();
        }
        // thay đổi tham số
        if (last.preset === undefined) { Object.assign(last, { preset: prm.preset, color: prm.color, mmode: prm.mmode }); meter.mode = prm.mmode; wireColor = prm.color; syncToolbar(); }
        if (prm.preset !== last.preset) { last.preset = prm.preset; loadPreset(prm.preset); }
        if (prm.color !== last.color) { last.color = prm.color; wireColor = prm.color; syncToolbar(); }
        if (prm.mmode !== last.mmode) { last.mmode = prm.mmode; meter.mode = prm.mmode; dirty = true; updateLeads(); }
        if (dragItem) { if (!layoutDirty) dragRefresh(dragItem); dragItem = null; }
        if (layoutDirty) refreshLayout();
        if (dirty || !nl) rebuild();
        const c = nl.circuit;
        c.powered = powered;
        // chạy bộ giải
        const h = +prm.dt || 2e-4;
        const want = dt * (+prm.speed || 1);
        debt = Math.min(debt + want, want * 3 + h);
        const t0 = now();
        let n = 0;
        const pe = epInfo(probeEp);
        c.watchNode = pe ? nl.nodeOf(pe.net) : null;
        c.watchPeak = null;
        while (debt >= h * 0.5) {
          c.step(h);
          debt -= h; n++;
          if ((n & 15) === 0 && now() - t0 > BUDGET_MS) { debt = 0; break; }
        }
        const peak = c.watchPeak;
        simRate = dt > 0 ? (n * h) / dt : 0;
        const ms = now() - t0;
        simInfo = \`\${c.nodeNames.length - 1} nút · \${c.elements.length} phần tử · \${n} bước/khung · \${simRate >= 0.995 * (+prm.speed || 1) ? (prm.speed === '1' ? 'thời gian thật' : \`×\${prm.speed}\`) : \`chậm \${(1 / Math.max(simRate, 1e-6)).toFixed(1)}× (máy yếu)\`} · \${ms.toFixed(1)} ms\${c.stats.nonConverged ? \` · ⚠ \${c.stats.nonConverged} bước không hội tụ\` : ''}\`;
        vPeak = peak ?? 0;
        let src = null, sp = 99;
        for (const it of itemsRef) { const p = SRC_PRI[CAT[it.type]?.etype]; if (p !== undefined && p < sp) { sp = p; src = nl.partEls.get(it.uid)?.[0]; } }
        iSup = src ? src.I : 0;
        handleEvents();
        visuals(dt);
        readouts(dt);
        if (dom) {
          if (sb.selected && selWire) { selWire = null; }
          const fc = typeof document !== 'undefined' ? document.getElementById('faultCard') : null;
          panel.style.maxHeight = fc && !fc.hidden ? '38%' : 'calc(100% - 120px)';
          renderPanel(false);
          const hover = hoverEp ? epText(hoverEp) : '';
          status_(mode === 'wire' ? \`✏️ Nối dây (\${WIRE_COLORS.find((x) => x[0] === wireColor)[1]}): \${pending ? \`từ \${epInfo(pending)?.label} → bấm điểm thứ hai\` : 'bấm điểm thứ nhất'}\${hover ? \` · \${hover}\` : ''}\`
            : mode === 'probe' ? \`🔴⚫ Đặt que đo: \${pending ? \`que đen ở \${epInfo(pending)?.label} → bấm điểm cho que đỏ\` : 'bấm điểm cho que đen (COM)'}\${hover ? \` · \${hover}\` : ''}\`
              : hover || (powered ? '⚡ Đang cấp nguồn — rê chuột lên lỗ để xem điện áp' : 'Kéo linh kiện vào breadboard · ✏️ Nối dây · ⚡ Cấp nguồn'));
        }
        return [Number.isFinite(iSup) ? iSup : 0, Number.isFinite(vPeak) ? vPeak : 0];
      },
      dispose() {
        cleanups.forEach((f) => f());
        for (const w of wires) w.mesh?.geometry.dispose();
      },
    };
  },
};
`;export{n as default};
