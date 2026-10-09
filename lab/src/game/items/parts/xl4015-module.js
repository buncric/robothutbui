// Module hạ áp XL4015 5 A (CV) — theo CAD boards/xl4015-module: PCB 54 × 23 mm xanh, IC XL4015E1 (TO-263-5, 180 kHz), cuộn cảm xuyến 47 µH (lõi -52 vàng/xanh),
// diode SS54 (SMB), 2 tụ 220 µF 35 V, trimmer 3296W 10 kΩ (25 vòng) chỉnh áp ra 1.25–36 V. Pad IN+/IN− (trái), OUT+/OUT− (phải).
// Vặn: def.turnTrimmer(inst, vòng); đọc: def.outputVoltage(inst, vin). Mặc định xuất xưởng ≈ 12 V — phải chỉnh 5.05 V trước khi nối tải!
import { text, gBox, PM } from './_shared.js';
import { buckDef } from './_lib/buck.js';
import { to263, smaDiode, chip, ledSmd } from './_lib/pcb.js';
import { elecCapOnBoard, toroidOnBoard } from './_lib/passive.js';

export default buckDef({
  id: 'xl4015-module', name: 'Module hạ áp XL4015 (5 A)', chip: 'XL4015E1', massG: 22,
  w: 54, d: 23, padX: 25.1, padZ: 9.8, holes: [[-17.8, -9.0, 1.6], [16.8, 9.3, 1.6]],
  pads: { 'OUT+': [25.1, -9.5], 'OUT−': [25.1, 9.9] },   // CAD: pad OUT lệch nhẹ
  cad: 'boards/xl4015-module',
  vref: 1.25, voutMax: 36, vinRange: [8, 36], ioutA: 5, fsw: 180e3, eff: 0.92, dropout: 0.6, defaultV: 12.0, height: 17,
  trim: { x: -4.0, z: -9.0, ry: 0 },
  fill(B) {
    elecCapOnBoard(B, -22.0, 0, { D: 8, H: 11.5 });
    elecCapOnBoard(B, 21.8, 0.5, { D: 8, H: 11.5 });
    to263(B, -8.9, 4.1, Math.PI);
    smaDiode(B, 7.3, 8.8, 0, { L: 4.6, W: 3.6, H: 2.3 });
    // cuộn cảm xuyến 47 µH ĐỨNG (trục theo X) như CAD L1_47uH
    toroidOnBoard(B.group({ x: 4.1 + 3.3, y: 7.3, z: 1.1, rz: Math.PI / 2 }), 0, 0, { OD: 13.6, ID: 7, Hc: 6, turns: 16, wire: 0.9, core: 0xd9c94a, coreTop: 0x3d8a4a, key: 'xl4015v' });
    // chân THT tụ hoá thò dưới đáy board (1.9 mm)
    for (const [x, z] of [[-22.0, 0], [21.8, 0.5]]) for (const dz of [-1.75, 1.75]) B.add(gBox(0.6, 1.9, 0.6), PM.lead, { x, y: -1.6 - 0.95, z: z + dz }, { shadow: false });
    chip(B, '0805', 7.7, -8.9, 0, 'R'); chip(B, '0805', 10.5, -8.9, 0, 'R');
    ledSmd(B, 13.9, -8.9, 0, 0xff2a2a, '0805');
  },
  silk(g, W, H, s, X, Z) {
    text(g, 'XL4015 DC-DC', X(0), Z(10.6), 1.0 * s, { color: '#f2f4f6' });
    text(g, '5A', X(-12), Z(-9.5), 1.1 * s, { color: '#f2f4f6' });
  },
});
