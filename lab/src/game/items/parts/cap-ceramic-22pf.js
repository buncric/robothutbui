// Tụ gốm đĩa 22 pF (C0G/NP0) 50 V — đĩa Ø4.2 mm nâu cam, in "22", chân Ø0.5 bước 2.54 mm. Dùng cặp với thạch anh 20 MHz.
import { ceramicCapDef } from './_lib/passive.js';
export default ceramicCapDef({ id: 'cap-ceramic-22pf', name: 'Tụ gốm 22 pF', style: 'disc', code: '22', farads: 22e-12, pitch: 2.54, color: 0xc0692a });
