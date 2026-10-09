// LED 5 mm (T-1¾) màu trắng — thân Ø5.0, vành Ø5.8 có cạnh phẳng phía catốt, cao 8.6 mm; chân vuông 0.5, anốt dài hơn (27 / 25 mm).
import { ledDef } from './_lib/thru.js';
export default ledDef({ id: 'led-5mm-white', name: 'LED 5 mm trắng', d: 5, color: 0xf4f6ff, lensColor: 0xe8f2ff, vf: 3.1, clear: true, wl: '6500 K' });
