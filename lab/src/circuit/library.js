// =============================================================================
// library.js — Bảng "linh kiện trên bàn → phần tử mạch".
// Mỗi loại: pins (tên chân), bridges (các chân nối liền bên trong), optional (chân có thể bỏ trống
// mà không cần tạo nút — dùng cho vi điều khiển nhiều chân), make(B, props) tạo phần tử.
// B (bộ dựng, xem netlist.js): B.n(tênChân) → nút · B.int(tên) → nút nội · B.add(khoá, Lớp, [nút…], thông số)
// =============================================================================
import {
  Resistor, Pot, Switch, SwitchSPDT, Fuse, Battery, Pack4S, BenchSupply, Capacitor, Electrolytic, Inductor,
  Diode, Led, Nmos, Motor, Buck, Ldo, Drv8871, Mcu, Pic16F877A, Esp32S3, ESP_PINS, Crystal, Shunt, PulseGen,
} from './elements.js';

const two = ['1', '2'];
export const LIB = {
  resistor: { pins: two, make: (B, p) => B.add('r', Resistor, [B.n('1'), B.n('2')], { R: p.R ?? 330, kind: 'resistor', Prated: 0.25 }) },
  powerres: { pins: two, make: (B, p) => B.add('r', Resistor, [B.n('1'), B.n('2')], { R: p.R ?? 10, kind: 'powerres', Prated: 5 }) },
  pot: { pins: ['1', 'W', '3'], make: (B, p) => B.add('pot', Pot, [B.n('1'), B.n('W'), B.n('3')], { R: p.R ?? 10000, pos: (p.pos ?? 50) / 100 }) },
  switch: { pins: ['1', 'C', '3'], make: (B, p) => B.add('sw', SwitchSPDT, [B.n('1'), B.n('C'), B.n('3')], { pos: p.on ? 'B' : 'A' }) },
  button: {
    pins: ['A1', 'A2', 'B1', 'B2'], bridges: [['A1', 'A2'], ['B1', 'B2']],
    make: (B, p) => B.add('sw', Switch, [B.n('A1'), B.n('B1')], { closed: !!p.pressed, Irated: 0.05 }),
  },
  fuse: { pins: two, make: (B, p) => B.add('f', Fuse, [B.n('1'), B.n('2')], { rating: p.rating ?? 10 }) },
  bat9v: { pins: ['+', '-'], source: true, make: (B, p) => B.add('bat', Battery, [B.n('+'), B.n('-')], { soc: (p.soc ?? 100) / 100 }) },
  pack4s: { pins: ['+', '-'], source: true, make: (B, p) => B.add('pack', Pack4S, [B.n('+'), B.n('-')], { soc: (p.soc ?? 100) / 100, bms: p.bms ?? true }) },
  bench: { pins: ['+', '-'], source: true, make: (B, p) => B.add('psu', BenchSupply, [B.n('+'), B.n('-')], { v: p.v ?? 5, i: p.i ?? 1 }) },
  pulse: { pins: ['OUT', 'GND'], source: true, make: (B, p) => B.add('gen', PulseGen, [B.n('OUT'), B.n('GND')], { v: p.v ?? 5, f: p.f ?? 2, duty: p.duty ?? 50 }) },
  ceramic: { pins: two, make: (B, p) => B.add('c', Capacitor, [B.n('1'), B.n('2')], { C: p.C ?? 100e-9, Vr: p.Vr ?? 50 }) },
  electro: { pins: ['+', '-'], make: (B, p) => B.add('c', Electrolytic, [B.n('+'), B.n('-')], { C: p.C ?? 1000e-6, Vr: p.Vr ?? 25, ESR: p.ESR ?? 0.08 }) },
  inductor: { pins: two, make: (B, p) => B.add('l', Inductor, [B.n('1'), B.n('2')], { L: p.L ?? 1e-3, DCR: p.DCR ?? 0.5, Irated: p.Irated ?? 1 }) },
  diode: { pins: ['A', 'K'], make: (B, p) => B.add('d', Diode, [B.n('A'), B.n('K')], { model: p.model ?? '1n4007' }) },
  led: { pins: ['A', 'K'], make: (B, p) => B.add('led', Led, [B.n('A'), B.n('K')], { color: p.color ?? 'red' }) },
  nmos: { pins: ['G', 'D', 'S'], make: (B, p) => B.add('q', Nmos, [B.n('G'), B.n('D'), B.n('S')], { model: p.model ?? 'irlz44n' }) },
  motor: { pins: ['+', '-'], make: (B, p) => B.add('m', Motor, [B.n('+'), B.n('-')], { load: p.load ?? 2, stall: !!p.stall }) },
  buck: {
    pins: ['IN+', 'IN-', 'OUT+', 'OUT-'], bridges: [['IN-', 'OUT-']],
    make: (B, p) => B.add('buck', Buck, [B.n('IN+'), B.n('IN-'), B.n('OUT+'), B.n('OUT-')], { vset: p.vset ?? 5 }),
  },
  ldo: { pins: ['GND', 'OUT', 'IN'], make: (B) => B.add('ldo', Ldo, [B.n('GND'), B.n('OUT'), B.n('IN')], {}) },
  drv8871: {
    pins: ['IN1', 'IN2', 'GND', 'VM', 'GND2', 'OUT1', 'OUT2'], bridges: [['GND', 'GND2']],
    make: (B) => B.add('drv', Drv8871, ['IN1', 'IN2', 'GND', 'VM', 'OUT1', 'OUT2'].map(B.n), {}),
  },
  bss138: {
    pins: ['LV1', 'LV2', 'LV', 'GND', 'LV3', 'LV4', 'HV1', 'HV2', 'HV', 'GND2', 'HV3', 'HV4'], bridges: [['GND', 'GND2']],
    make: (B) => {
      for (const k of [1, 2, 3, 4]) {
        B.add(`q${k}`, Nmos, [B.n('LV'), B.n(`HV${k}`), B.n(`LV${k}`)], { model: 'bss138' });
        B.add(`rl${k}`, Resistor, [B.n('LV'), B.n(`LV${k}`)], { R: 10000, kind: 'resistor', Prated: 0.1 });
        B.add(`rh${k}`, Resistor, [B.n('HV'), B.n(`HV${k}`)], { R: 10000, kind: 'resistor', Prated: 0.1 });
      }
    },
  },
  pic: {
    pins: Array.from({ length: 40 }, (_, i) => String(i + 1)), optional: true,
    make: (B, p) => B.add('mcu', Pic16F877A, Array.from({ length: 40 }, (_, i) => B.n(String(i + 1))),
      { program: p.program ?? 'robovac', crystal: !!B.info.crystal, caps: !!B.info.caps }),
  },
  esp32: {
    pins: ESP_PINS, optional: true,
    bridges: [['GND', 'GND_2'], ['GND', 'GND_3'], ['GND', 'GND_4'], ['3V3', '3V3_2']],
    make: (B, p) => B.add('mcu', Esp32S3, ESP_PINS.map(B.n), { program: p.program ?? 'uart' }),
  },
  crystal: { pins: two, make: (B) => B.add('x', Crystal, [B.n('1'), B.n('2')], {}) },
  ammeter: { pins: ['+', '-'], make: (B) => B.add('a', Shunt, [B.n('+'), B.n('-')], { R: 0.05 }) },
};

export { Mcu };
