// LED 3 mm (T-1) đỏ — thân Ø3.0, vành Ø3.8 có cạnh phẳng catốt, cao 5.3 mm.
import { ledDef } from './_lib/thru.js';
export default ledDef({ id: 'led-3mm-red', name: 'LED 3 mm đỏ', d: 3, color: 0xff2a1a, lensColor: 0xd01010, vf: 2.0, wl: '620 nm' });
