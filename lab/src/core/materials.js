// Bảng vật liệu dùng chung — mọi linh kiện dùng chung để nhìn đồng bộ.
// Đơn vị cảnh 3D trong lab: 1 đơn vị = 1 mm.
import * as THREE from 'three';

const std = (color, metalness, roughness, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });

export const MAT = {
  steel: std(0xb8bec6, 1.0, 0.32),          // thép
  zinc: std(0xc9d3dd, 1.0, 0.28),           // thép mạ kẽm (ốc vít)
  blackOxide: std(0x2b2d31, 0.9, 0.45),     // thép nhuộm đen
  aluminum: std(0xd5d9de, 1.0, 0.38),
  copper: std(0xc87533, 1.0, 0.3),          // đồng đỏ (dây quấn, cổ góp)
  brass: std(0xd4a640, 1.0, 0.3),           // đồng thau
  gold: std(0xf2c14e, 1.0, 0.22),           // mạ vàng (chân IC, pad)
  tin: std(0xdfe3e6, 0.9, 0.35),            // thiếc hàn
  carbon: std(0x2a2a2a, 0.0, 0.9),          // chổi than
  plasticBlack: std(0x1d1f23, 0.0, 0.55),
  plasticDark: std(0x33373d, 0.0, 0.5),
  plasticGrey: std(0x8a9099, 0.0, 0.5),
  plasticWhite: std(0xeef0f2, 0.0, 0.45),
  plasticYellow: std(0xf5b800, 0.0, 0.5),
  plasticRed: std(0xd64545, 0.0, 0.5),
  plasticBlue: std(0x3b7dd8, 0.0, 0.5),
  plasticGreen: std(0x3fa34d, 0.0, 0.5),
  rubber: std(0x262626, 0.0, 0.95),
  icBody: std(0x161616, 0.0, 0.7),          // vỏ epoxy IC
  pcbGreen: std(0x1f6b3a, 0.0, 0.6),
  pcbBlack: std(0x15171a, 0.0, 0.55),
  pcbBlue: std(0x1d4f91, 0.0, 0.55),
  silkscreen: std(0xf3f3f3, 0.0, 0.6),
  magnetN: std(0xd64545, 0.3, 0.5),         // nam châm cực Bắc (quy ước đỏ)
  magnetS: std(0x3b6fd6, 0.3, 0.5),         // cực Nam (quy ước xanh)
  ferrite: std(0x4a4a4f, 0.2, 0.7),
  silicon: std(0x7d8aa0, 0.6, 0.25),        // đế silicon (die)
  glass: new THREE.MeshPhysicalMaterial({ color: 0xbfe6ff, metalness: 0, roughness: 0.05, transmission: 0.9, thickness: 1, transparent: true, opacity: 0.35 }),
  glow: new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xffaa00, emissiveIntensity: 1.2 }),
  airflow: new THREE.MeshBasicMaterial({ color: 0x7fd3ff, transparent: true, opacity: 0.7 }),
};

// Màu theo nhóm chức năng chân (dùng chung cho PIC, ESP32, header…)
export const PIN_COLORS = {
  power: 0xe5484d,   // nguồn VDD / 5V / 3V3
  ground: 0x555b66,  // GND / VSS
  osc: 0xf5c400,     // dao động
  pwm: 0xff8c1a,     // PWM
  adc: 0x2fbf71,     // analog
  uart: 0x3b8ef0,    // UART
  icsp: 0xa86bf0,    // nạp ICSP
  input: 0x1fc7c7,   // vào số (cảm biến, nút)
  output: 0xf0e3a8,  // ra số
  spare: 0x9aa1ab,   // dự phòng
};

// Tạo bản sao vật liệu có màu khác (không làm hỏng vật liệu dùng chung)
export function tint(mat, color) {
  const m = mat.clone();
  m.color = new THREE.Color(color);
  return m;
}
