// LED 5 mm (T-1¾) màu đỏ — thân Ø5.0, vành Ø5.8 có cạnh phẳng phía catốt, cao 8.6 mm; chân vuông 0.5, anốt dài hơn (27 / 25 mm).
import { ledDef } from './_lib/thru.js';
export default ledDef({ id: 'led-5mm-red', name: 'LED 5 mm đỏ', d: 5, color: 0xff2a1a, lensColor: 0xd01010, vf: 2.0, clear: false, wl: '620 nm' });
