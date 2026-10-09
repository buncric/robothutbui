# 06 — Phiếu đo đạc xác robot (điền trong Ngày 1)

> In ra hoặc điền trực tiếp. Sau khi điền xong → sửa `firmware/pic16f877a_ccs/config.h` và `firmware/esp32s3/src/config.h`.
> **An toàn:** tháo pin trước khi rút đầu nối. Không chạm 2 cực pin. Không cấp quá 5V khi chưa biết dây là gì.

**Model robot:** ____________________ **Ngày:** ___/10/2026

## 1. Pin
| Mục | Giá trị |
|---|---|
| Loại (Li-ion / NiMH), ghi trên tem | |
| Điện áp danh định / đo được | ____ V / ____ V |
| Dung lượng (mAh) | |
| Có mạch bảo vệ bên trong? Số dây ra (2 = +/−; 3–4 = thêm NTC/data) | |

## 2. Module bánh xe (làm cho cả trái & phải)
| Dây (màu) | Nghi là | Đo được | Kết luận |
|---|---|---|---|
| | Motor + | R giữa 2 dây motor: ____ Ω | |
| | Motor − | | |
| | Encoder VCC | | |
| | Encoder GND | | |
| | Encoder OUT | Quay tay 10 vòng = ____ xung | `TICKS_PER_REV` = ____ |
| | Công tắc nhấc bánh | Thông mạch khi: ☐ bánh hạ ☐ bánh nhấc | `DROP_ACTIVE_LEVEL` = ____ |
- Đường kính bánh: ____ mm → `WHEEL_DIAMETER_MM`
- Khoảng cách tâm 2 bánh: ____ mm → `WHEEL_BASE_MM`
- Cấp 5V thử motor: quay chiều nào khi dây đỏ = +? ____ → `MOTOR_L/R_INVERT`

## 3. Bumper
| Mục | Giá trị |
|---|---|
| Số công tắc | |
| Loại (cơ khí microswitch / quang) | |
| Thông mạch khi chạm? | `BUMP_ACTIVE_LEVEL` = ____ |

## 4. Cảm biến chống rơi (cliff)
| Mục | Giá trị |
|---|---|
| Số cảm biến | |
| Số dây mỗi cảm biến (3 = LED+/phototransistor/GND; 4 = tách riêng) | |
| Giá trị `RAW?` trên sàn | |
| Giá trị `RAW?` ngoài mép bàn | |
| → `CLIFF_THRESHOLD` (ở giữa) | |
| Có điều khiển riêng LED IR không? | `CLIFF_LED_PULSED` = ____ |

## 5. Quạt hút
| Mục | Giá trị |
|---|---|
| Số dây | ☐ 2 (chổi than → MOSFET) ☐ 4–6 (BLDC: VCC/GND/PWM/FG…) |
| Điện áp định mức | |
| Nếu BLDC: mức logic PWM của mạch gốc (đo bằng logic analyzer) | ____ V, ____ kHz |

## 6. Chổi
| Mục | Chổi cuộn | Chổi cạnh |
|---|---|---|
| Điện trở cuộn dây | ____ Ω | ____ Ω |
| Điện áp định mức | | |

## 7. Lidar (nếu có)
| Mục | Giá trị |
|---|---|
| Model / mã trên tem | |
| Số dây | |
| Baud TX đo bằng logic analyzer (mạch gốc còn sống) | |
| Motor lidar: tự điều tốc hay mạch chính PWM? | |

## 8. Ảnh đã chụp
- [ ] Mặt dưới robot  - [ ] Mạch gốc 2 mặt  - [ ] Từng đầu nối + màu dây  - [ ] Vị trí ốc
