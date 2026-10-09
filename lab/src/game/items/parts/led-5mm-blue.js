// LED 5 mm (T-1¾) màu xanh dương — thân Ø5.0, vành Ø5.8 có cạnh phẳng phía catốt, cao 8.6 mm; chân vuông 0.5, anốt dài hơn (27 / 25 mm).
import { ledDef } from './_lib/thru.js';
export default ledDef({ id: 'led-5mm-blue', name: 'LED 5 mm xanh dương', d: 5, color: 0x3a6bff, lensColor: 0x1d3fd8, vf: 3.1, clear: false, wl: '470 nm' });
