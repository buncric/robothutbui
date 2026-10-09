# 01 — Kiến trúc hệ thống & sơ đồ chân

> Tài liệu "hợp đồng" chung: code PIC, code ESP32, app Flutter, bài giảng HTML đều bám theo file này.
> Thiết kế **không phụ thuộc model robot**: giả định xác robot có module bánh xe (động cơ DC chổi than + encoder Hall 1 kênh + công tắc nhấc bánh), quạt hút (BLDC có driver tích hợp **hoặc** DC chổi than), chổi cuộn + chổi cạnh (DC chổi than), bumper công tắc, cảm biến chống rơi IR. Khi chốt robot → đo bằng đồng hồ rồi chỉ sửa `config.h` (PIC) và `config.h` (ESP32).

## 1. Sơ đồ khối

```
                ┌────────────── Điện thoại (app Flutter .apk/.ipa) ──────────────┐
                                    │ BLE (Nordic UART Service)
                                    ▼
┌──────────────────────────── ESP32-S3 DevKitC-1 (3.3V) — "BỘ NÃO" ──────────────────────────┐
│ BLE server · máy trạng thái chế độ (MANUAL/AUTO/SPIRAL/ZIGZAG) · odometry · IMU MPU6050    │
│ PWM quạt hút (LEDC) · (sau này) lidar LDS02RR + micro-ROS/UART sang ODROID-M2               │
└───────────────┬──────────────────────────────────────────────────────────────────────────┘
                │ UART 19200 8N1, khung nhị phân có checksum  (qua mạch chuyển mức BSS138 3.3V⇄5V)
                ▼
┌──────────────────────────── PIC16F877A (5V, thạch anh 20 MHz) — "TỦY SỐNG" ─────────────────┐
│ PWM 2 bánh (CCP1/CCP2, 20 kHz) · PI tốc độ theo encoder · đếm encoder phần cứng (Timer0/Timer1) │
│ bumper · công tắc nhấc bánh · cảm biến chống rơi (ADC) · đo pin (ADC) · bật/tắt chổi (MOSFET)  │
│ PHẢN XẠ AN TOÀN: va chạm/hẫng → cấm tiến; nhấc bánh/mất liên lạc 300 ms/pin cạn → dừng hết  │
│ Chế độ tự chạy độc lập (bấm nút RB0) khi không có ESP32 → demo vai trò PIC                    │
└───────┬────────────┬─────────────┬──────────────┬──────────────┬─────────────────────────────┘
        ▼            ▼             ▼              ▼              ▼
   Driver bánh   Encoder Hall   Bumper/nhấc   Cliff IR ×4   MOSFET chổi cuộn/chổi cạnh
   74HC32 →      trái/phải
   DRV8871 ×2      bánh (công tắc) (LED+phototransistor)

(Giai đoạn sau) ODROID-M2: ROS 2 + slam_toolbox + Nav2 + coverage — nhận lidar + odometry từ ESP32.
```

**Vì sao chia như vậy?**
- PIC làm việc *thời gian thực, đơn giản, an toàn*: không bao giờ treo vì BLE/WiFi. Kể cả ESP32 bị reset, PIC vẫn tự dừng động cơ sau 300 ms.
- ESP32 làm việc *nặng*: BLE, thuật toán đi, toán số thực (odometry, góc quay).
- Đúng yêu cầu đề: PIC16F877A là bộ điều khiển tầng thấp cho động cơ + cảm biến.

## 2. Nguồn điện

```
Pin 4S Li-ion 14.4V (12.0–16.8V) ── cầu chì 10A ── công tắc chính ──┬── VBAT (động lực)
  (pin gốc của robot nếu còn tốt, có mạch bảo vệ;                 │     ├─ DRV8871 trái / phải
   hoặc 4S 18650 + BMS 4S ≥20A)                                    │     ├─ Quạt hút (BLDC: VBAT/GND/PWM/FG)
                                                                    │     ├─ Chổi cuộn  (qua MOSFET IRLZ44N)
                                                                    │     └─ Chổi cạnh  (qua MOSFET IRLZ44N)
                                                                    │
                                                                    └── Buck XL4015 → 5V/3A (LOGIC)
                                                                          ├─ PIC16F877A + tụ 100nF mỗi cặp VDD/VSS
                                                                          ├─ Encoder Hall, cliff IR, BSS138 phía HV
                                                                          ├─ ESP32-S3 (chân 5V) → LDO onboard → 3.3V
                                                                          └─ (sau) lidar LDS02RR 5V (~1A đỉnh)
```

Quy tắc bắt buộc:
1. **Chung GND** giữa tất cả các khối (nối hình sao về cực âm pin). Không chung GND → UART sai, encoder sai.
2. Tụ **1000 µF/25V** ngay đầu nguồn mỗi driver; tụ **100 nF** sát mỗi chân VDD của PIC và hai đầu mỗi động cơ.
3. Không lấy 5V từ driver động cơ cho logic. Logic phải có buck riêng.
4. MOSFET chổi: **IRLZ44N** (logic-level), cổng điều khiển từ PIC 5V qua điện trở 100 Ω, kéo xuống 10 kΩ, **diode SS34 song song ngược với động cơ**. KHÔNG dùng module IRF520 (không mở hết ở 5V, nóng).
5. Pin NiMH (một số Ecovacs đời cũ) **không có BMS**: phần mềm phải cắt khi áp thấp, và không sạc bằng mạch tự chế.

## 3. Sơ đồ chân PIC16F877A (DIP-40)

| Chân | Tên | Hướng | Nối tới | Ghi chú |
|---|---|---|---|---|
| 1 | MCLR | In | 10 kΩ lên 5V + header ICSP | 100 nF xuống GND nếu bị reset do nhiễu |
| 2 | RA0/AN0 | Analog | Phân áp pin 33k/10k | 16.8V → 3.9V |
| 3 | RA1/AN1 | Analog | Cliff IR #1 (trái) | |
| 4 | RA2/AN2 | Analog | Cliff IR #2 (trước-trái) | |
| 5 | RA3/AN3 | Analog | Cliff IR #3 (trước-phải) | |
| 6 | RA4/T0CKI | In | **Encoder bánh TRÁI** | Timer0 đếm xung phần cứng; kéo lên 10k (RA4 là open-drain) |
| 7 | RA5/AN4 | Analog | Cliff IR #4 (phải) | |
| 8–10 | RE0–RE2 | — | Dự phòng | `setup_adc_ports(AN0_AN1_AN2_AN3_AN4)` → RE là digital |
| 11, 32 | VDD | — | +5V | Mỗi chân 1 tụ 100 nF |
| 12, 31 | VSS | — | GND | |
| 13, 14 | OSC1/OSC2 | — | Thạch anh 20 MHz + 2 tụ 22 pF | fuse `HS` |
| 15 | RC0/T1CKI | In | **Encoder bánh PHẢI** | Timer1 đếm xung phần cứng 16-bit |
| 16 | RC1/CCP2 | Out | PWM bánh PHẢI → 74HC32 chân 9 & 12 | 20 kHz |
| 17 | RC2/CCP1 | Out | PWM bánh TRÁI → 74HC32 chân 1 & 4 | 20 kHz |
| 18 | RC3 | Out | Dự phòng (I2C SCL) | |
| 23 | RC4 | Out | Dự phòng (I2C SDA) | |
| 24 | RC5 | Out | Dự phòng | |
| 25 | RC6/TX | Out | → BSS138 HV1 → LV1 → ESP32 GPIO18 (RX) | 19200 baud |
| 26 | RC7/RX | In | ← BSS138 HV2 ← LV2 ← ESP32 GPIO17 (TX) | Chân Schmitt: cần ≥4.0V → BẮT BUỘC chuyển mức |
| 19 | RD0 | Out | DIR bánh TRÁI → 74HC32 chân 5 | |
| 20 | RD1 | Out | nDIR bánh TRÁI (luôn = NOT RD0) → 74HC32 chân 2 | L298N: IN2 trái |
| 21 | RD2 | Out | DIR bánh PHẢI → 74HC32 chân 13 | |
| 22 | RD3 | Out | nDIR bánh PHẢI → 74HC32 chân 10 | L298N: IN4 |
| 27 | RD4 | Out | Bật LED IR cliff (qua transistor) | Đo có/không LED để loại ánh sáng môi trường |
| 28 | RD5 | Out | MOSFET chổi cuộn | |
| 29 | RD6 | Out | MOSFET chổi cạnh | |
| 30 | RD7 | Out | LED trạng thái / còi | |
| 33 | RB0/INT | In | Nút START (chế độ PIC tự chạy) | Kéo lên nội, nhấn = 0 |
| 34 | RB1 | In | Công tắc nhấc bánh TRÁI | Kéo lên nội |
| 35 | RB2 | In | Công tắc nhấc bánh PHẢI | Kéo lên nội |
| 36 | RB3 | — | Để trống (output 0) | Vì `NOLVP` nên RB3 là I/O thường |
| 37 | RB4 | In | Bumper TRÁI | Kéo lên nội, chạm = 0 |
| 38 | RB5 | In | Bumper PHẢI | |
| 39 | RB6/PGC | — | **Header ICSP** — không nối tải | |
| 40 | RB7/PGD | — | **Header ICSP** — không nối tải | |

**Header nạp ICSP 6 chân** (chuẩn PICkit): 1-MCLR, 2-VDD, 3-GND, 4-PGD(RB7), 5-PGC(RB6), 6-NC.

### Điều khiển DRV8871 bằng 1 PWM mỗi bánh — qua IC 74HC32 (phanh 2 chiều) ⭐
**Vấn đề nếu nối thẳng (IN1 = PWM, IN2 = DIR):** lúc PWM thấp, chiều tiến rơi vào trạng thái (0,0) *thả trôi* — dòng động cơ bị cả điện áp pin đẩy ngược nên tắt rất nhanh → **chiều tiến yếu hơn chiều lùi nhiều lần** (ở 20 kHz, duty 40 % tiến có thể không quay). Chiều lùi rơi vào (1,1) *phanh* — dòng quay vòng, liên tục.

**Cách sửa:** 1 IC **74HC32** (4 cổng OR, nuôi 5V, tụ 100 nF) cho cả 2 bánh:
```
IN1 = PWM OR nDIR        IN2 = PWM OR DIR        (nDIR luôn = NOT DIR, do PIC xuất ở RD1/RD3)
Tiến: DIR=0 → IN1=1, IN2=PWM → PWM thấp: (1,0) chạy tiến · PWM cao: (1,1) phanh
Lùi : DIR=1 → IN1=PWM, IN2=1 → PWM thấp: (0,1) chạy lùi · PWM cao: (1,1) phanh
```
→ cả 2 chiều đều "chạy khi PWM thấp, phanh khi PWM cao" ⇒ **duty thanh ghi = 1000 − tốc độ**, đối xứng và gần tuyến tính. Dừng (tốc độ 0) = phanh giữ bánh.

| 74HC32 (DIP-14) | Nối tới |
|---|---|
| 1 (1A), 4 (2A) | RC2/CCP1 — PWM trái |
| 2 (1B) | RD1 — nDIR trái |
| 3 (1Y) | DRV8871 trái **IN1** |
| 5 (2B) | RD0 — DIR trái |
| 6 (2Y) | DRV8871 trái **IN2** |
| 9 (3A), 12 (4A) | RC1/CCP2 — PWM phải |
| 10 (3B) | RD3 — nDIR phải |
| 8 (3Y) | DRV8871 phải **IN1** |
| 13 (4B) | RD2 — DIR phải |
| 11 (4Y) | DRV8871 phải **IN2** |
| 14 / 7 | +5V / GND (tụ 100 nF sát chân) |

Firmware: `MOTOR_DRIVER = DRIVER_DRV8871_OR` (mặc định). Vẫn giữ được 2 chế độ cũ (`DRIVER_DRV8871` nối thẳng, `DRIVER_L298N`) bằng cách đổi 1 dòng trong `config.h`.

### Điều khiển tốc độ vòng kín (PI) trên PIC
Mỗi 20 ms PIC so **số xung encoder đo được** với **số xung mong muốn** (`lệnh ‰ × MAX_TICKS_PER_PERIOD / 1000`) và chỉnh duty: `duty = lệnh (feedforward) + KP·sai_lệch + tích_phân`. Kết quả: 2 bánh chạy đúng tốc độ dù tải, pin, ma sát khác nhau → robot đi thẳng hơn, odometry chính xác hơn.
- Bật/tắt bằng lệnh `CTRL` (0x06) từ ESP32 (`USE_SPEED_PID` trong config ESP32). **Ngày 1 để tắt** (chưa nối encoder), **Ngày 2 bật** sau khi đo `MAX_TICKS_PER_PERIOD`.
- An toàn: cấp > 30 % mà encoder đứng im 300 ms (kẹt bánh / encoder hỏng / tuột dây) → PIC **về chạy hở vòng** và bật cờ `WHEEL_STALL`, không bơm duty lên tối đa.

Dùng L298N thay thế: ENA/ENB = PWM, IN1–IN4 = RD0–RD3 (`DRIVER_L298N`) — cả 2 chiều đều thả trôi (đối xứng nhưng yếu), sụt áp ~2V, nóng hơn.

## 4. Sơ đồ chân ESP32-S3 DevKitC-1

| GPIO | Chức năng | Ghi chú |
|---|---|---|
| 17 | UART1 TX → PIC RX (qua BSS138) | |
| 18 | UART1 RX ← PIC TX (qua BSS138) | |
| 4 | PWM quạt hút (LEDC 20 kHz) | BLDC: nối thẳng dây PWM của quạt (đo trước mức logic). Quạt chổi than: qua MOSFET IRLZ44N + driver cổng |
| 5 | FG quạt (đo tốc độ, tùy chọn) | Open-collector → kéo lên 3.3V |
| 8 / 9 | I2C SDA / SCL → MPU6050 | Tùy chọn (tăng độ chính xác góc quay) |
| 16 | (sau) Lidar LDS02RR TX → ESP RX (UART2) | LDS02RR xuất 3.3V |
| 15 | (sau) PWM motor lidar (qua N-MOSFET) | |
| 6 | Còi (buzzer) | Tùy chọn |
| 0 | Nút BOOT = nút START/STOP tại chỗ | |
| 48 (v1.0) / 38 (v1.1) | LED RGB onboard | |

Tránh: GPIO 19/20 (USB), 26–37 (flash/PSRAM), 0/3/45/46 (strapping) cho tín hiệu ngoài.

## 5. Thông số cơ khí (điền sau khi đo xác robot)

| Tham số | Giá trị mặc định | Cách đo |
|---|---|---|
| Đường kính bánh | 70 mm | Thước kẹp |
| Khoảng cách 2 bánh (wheelbase) | 235 mm | Tâm vết bánh trái ↔ phải |
| Xung encoder / vòng bánh | 1000 | Quay tay bánh đúng 10 vòng, đọc tổng xung trong app/terminal ÷ 10 |
| Đường kính robot | 350 mm | |
| Bề rộng làn quét (zig-zag) | 250 mm | ≈ chiều rộng chổi cuộn + chổi cạnh − chồng lấn |
