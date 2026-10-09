// Tụ hoá nhôm 100 µF 25 V 105 °C — Ø6.3 × 11 mm, bước chân 2.5, chân Ø0.5, van chữ K trên nắp.
import { electrolyticDef } from './_lib/passive.js';
export default electrolyticDef({ id: 'cap-elec-100uf-25v', name: 'Tụ hoá 100 µF 25 V', D: 6.3, H: 11, pitch: 2.5, lead: 0.5, uF: 100, V: 25, sleeve: 0x1d3e8a, stripe: '#e8eef6', series: 'KM', massG: 0.6, vent: 'K' });
