// Tụ hoá nhôm 1000 µF 25 V 105 °C — Ø10 × 20 mm, bước chân 5.0, chân Ø0.6 (+ dài 20, − 18.5), van chữ thập trên nắp.
import { electrolyticDef } from './_lib/passive.js';
export default electrolyticDef({ id: 'cap-elec-1000uf-25v', name: 'Tụ hoá 1000 µF 25 V', D: 10, H: 20, pitch: 5.0, lead: 0.6, uF: 1000, V: 25, sleeve: 0x15171c, stripe: '#d0d4da', series: 'ZLH', massG: 2.6, vent: '+' });
