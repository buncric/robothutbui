// Tụ gốm MLCC nhúng epoxy 100 nF (X7R) 50 V — vàng, in "104", chân bước 5.08 mm. Tụ khử nhiễu sát chân nguồn IC.
import { ceramicCapDef } from './_lib/passive.js';
export default ceramicCapDef({ id: 'cap-ceramic-100nf', name: 'Tụ gốm 100 nF (104)', style: 'dip', code: '104', farads: 100e-9, pitch: 5.08, color: 0xe7c43a });
