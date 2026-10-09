// Thạch anh 20.000 MHz vỏ HC-49/S (thấp): 11.05 × 4.65 × 3.5 mm, chân Ø0.43 cách 4.88 mm. Cho OSC1/OSC2 PIC16F877A (fuse HS).
import { crystalDef } from './_lib/passive.js';
export default crystalDef({ id: 'crystal-20mhz-hc49s', name: 'Thạch anh 20 MHz HC-49/S', mhz: 20 });
