// Tua vít Phillips PH0 × 60 mm (loại kỹ thuật/chính xác) — vít M2/M2.5 của module, servo, quạt nhỏ.
import { screwdriverDef } from './_screwdriver.js';

export default screwdriverDef({
  id: 'screwdriver-ph0', name: 'Tua vít PH0', size: 'PH0', massG: 34,
  dims: { L: 85, R: 11, shaftR: 1.5, shaftL: 60, color: 0x2f63b8 },
  desc: 'Tua vít Phillips số 0 (Ø thân 3 mm) cho vít M2–M2.5: module cảm biến, bánh xe nhỏ, nắp servo. Dùng PH0 cho vít PH1 sẽ trờn đầu vít.',
});
