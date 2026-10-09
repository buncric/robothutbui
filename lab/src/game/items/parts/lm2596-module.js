// Module hạ áp LM2596S (3 A, 150 kHz) — theo CAD boards/lm2596-module (HW-411): PCB 43.6 × 21.3 mm xanh, IC LM2596S-ADJ (TO-263-5), cuộn cảm 33 µH (lõi xuyến đen),
// diode SS34, tụ vào 220 µF 50 V / ra 220 µF 35 V, trimmer 3296W 10 kΩ. Pad IN+/IN− (trái), OUT+/OUT− (phải). Áp ra 1.25–35 V.
import { text, gBox, PM } from './_shared.js';
import { buckDef } from './_lib/buck.js';
import { to263, smaDiode, chip, ledSmd } from './_lib/pcb.js';
import { elecCapOnBoard, toroidOnBoard } from './_lib/passive.js';

export default buckDef({
  id: 'lm2596-module', name: 'Module hạ áp LM2596 (3 A)', chip: 'LM2596S-ADJ', massG: 13,
  w: 43.6, d: 21.3, padX: 20.32, padZ: 8.89, holes: [[-15.24, -8.26, 1.6], [15.24, 8.25, 1.6]],
  cad: 'boards/lm2596-module',
  vref: 1.23, voutMax: 35, vinRange: [4.5, 40], ioutA: 3, fsw: 150e3, eff: 0.85, dropout: 1.5, defaultV: 12.0, height: 13.5,
  trim: { x: 7.98, z: -7.76, ry: 0 },
  fill(B) {
    elecCapOnBoard(B, -17.67, 0.07, { D: 8, H: 11 });
    elecCapOnBoard(B, 17.71, 0.57, { D: 8, H: 11 });
    to263(B, -6.49, -3.77, 0);
    smaDiode(B, -8.94, 8.54, 0);
    toroidOnBoard(B, 6.5, 3.55, { OD: 12.7, ID: 6.5, Hc: 6.8, turns: 14, wire: 0.8, core: 0x2b2c2f, coreTop: 0x2b2c2f, key: 'lm2596' });
    chip(B, '0805', 6.2, -0.3, 0, 'R'); chip(B, '0603', 14.5, -8.71, Math.PI / 2, 'R');
    ledSmd(B, 16.73, -8.71, Math.PI / 2, 0xff2a2a);
    // chân THT tụ hoá thò dưới đáy board (1.9 mm)
    for (const [x, z] of [[-17.67, 0.07], [17.71, 0.57]]) for (const dz of [-1.75, 1.75]) B.add(gBox(0.6, 1.9, 0.6), PM.lead, { x, y: -1.6 - 0.95, z: z + dz }, { shadow: false });
  },
  silk(g, W, H, s, X, Z) { text(g, 'LM2596 DC-DC', X(0), Z(-9.6), 0.9 * s, { color: '#f2f4f6' }); },
});
