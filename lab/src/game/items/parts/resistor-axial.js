// Điện trở ¼ W tổng quát — đổi giá trị bằng def.setValue(instance, ohms) (vạch màu tự cập nhật). Mặc định 4.7 kΩ.
import { resistorDef } from './_lib/passive.js';
export default resistorDef({ id: 'resistor-axial', name: 'Điện trở ¼ W (đổi giá trị)', ohms: 4700 });
