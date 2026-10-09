// Tua vít Phillips PH1 × 80 mm — cán 2 thành phần Ø 30 mm, mũi từ tính. Vít M3 trên khung robot, nắp hộp pin.
import { screwdriverDef } from './_screwdriver.js';

export default screwdriverDef({
  id: 'screwdriver-ph1', name: 'Tua vít PH1', size: 'PH1', massG: 62,
  dims: { L: 100, R: 15, shaftR: 2.5, shaftL: 80, color: 0xc62f2a },
  desc: 'Tua vít Phillips số 1 (Ø thân 5 mm) — hợp vít M3/M3.5 trên khung robot, đế động cơ, nắp pin. Ấn chặt mũi vào đầu vít rồi mới vặn để không trờn.',
});
