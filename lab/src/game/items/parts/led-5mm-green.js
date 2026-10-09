// LED 5 mm (T-1¾) màu xanh lá — thân Ø5.0, vành Ø5.8 có cạnh phẳng phía catốt, cao 8.6 mm; chân vuông 0.5, anốt dài hơn (27 / 25 mm).
import { ledDef } from './_lib/thru.js';
export default ledDef({ id: 'led-5mm-green', name: 'LED 5 mm xanh lá', d: 5, color: 0x22ff44, lensColor: 0x18a838, vf: 2.1, clear: false, wl: '570 nm' });
