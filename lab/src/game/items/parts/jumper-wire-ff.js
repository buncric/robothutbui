// Dây cắm Dupont cái–cái 26 AWG, vỏ nhựa 2.54 × 2.54 × 14 mm, chân đực vuông 0.64 mạ vàng dài 6 mm / lỗ cái có lá kẹp.
// Chiều dài đổi được: def.setLength(inst, 100 | 150 | 200 | 300 mm); màu: def.setColor(inst, 'red'…). Đầu A (−X), đầu B (+X).
import { jumperDef } from './_lib/wires.js';
export default jumperDef('ff', { color: 'blue', len: 200 });
