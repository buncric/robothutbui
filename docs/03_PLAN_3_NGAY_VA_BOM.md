# 03 — Kế hoạch 3 ngày & danh sách linh kiện (BOM)

> Mốc: **Ngày 0 = tối 01/10** (đặt hàng, cài phần mềm) → **Ngày 1 = 02/10** → **Ngày 2 = 03/10** → **Ngày 3 = 04/10** (demo khung).
> Mục tiêu cuối ngày 3: robot (xác robot thương mại + mạch PIC/ESP32 của mình) **tự chạy AUTO/ZIGZAG, né vật, không rơi cầu thang, hút được bụi/giấy vụn, điều khiển & xem trạng thái qua app BLE**, có video demo + báo cáo tiến độ.
> Code đã sẵn: `firmware/pic16f877a_ccs` (đã unit test), `firmware/esp32s3` (đã build + mô phỏng), `app/robovac_ble` (chưa build). → 3 ngày chủ yếu là **phần cứng + đo đạc + tích hợp**.

---

## 1. BOM — mua ngay tối nay

Giá kiểm tra ngày 01/10/2026 trên icdayroi.com, thegioiic.com (tgic, giá có VAT), hshop.vn. [S] = ước tính.

### A. Bắt buộc
| # | Linh kiện | SL | Đơn giá | Thành tiền | Mua ở |
|---|---|---|---|---|---|
| 1 | PIC16F877A-I/P (DIP-40) — mua 2 để dự phòng | 2 | 130 000 | 260 000 | icdayroi `/pic16f877a-i-p` · tgic `/san-pham/828` |
| 2 | Thạch anh 20 MHz HC-49 + tụ gốm 22 pF | 2 + 4 | 1 500 / ~500 | 5 000 | icdayroi `/thach-anh-20mhz-hc49-dip` |
| 3 | Đế IC 40 chân (tròn) | 2 | 7 000 | 14 000 | icdayroi `/de-ic-40pin-loai-tron` |
| 4 | Mạch nạp **PICkit 3** (clone) | 1 | 420 000 | 420 000 | icdayroi `/mach-nap-pickit-3` |
| 5 | Driver **DRV8871** (2 bánh + 1 dự phòng/chổi cuộn) | 3 | 51 300 | 154 000 | tgic `/san-pham/35706` |
| 5b | **IC 74HC32** (4 cổng OR) + đế 14 chân — làm 2 bánh tiến/lùi đối xứng (xem docs/01) | 1 + 1 | ~5 000 | 8 000 | tgic / icdayroi (DIP-14) |
| 6 | MOSFET logic-level **IRLR7843** (icdayroi) hoặc **IRLZ44N** (Shopee) — chổi cuộn, chổi cạnh, quạt chổi than, motor lidar | 4 | 5 000–12 000 | 30 000 | icdayroi `/irlr7843trpbf` |
| 7 | Diode Schottky SS34 (chống ngược cho động cơ) | 6 | 600 | 4 000 | tgic `/san-pham/2529` |
| 8 | Mạch chuyển mức **BSS138** 4 kênh | 2 | 10 000 | 20 000 | hshop `/mach-chuyen-muc-ton-hieu-i2c` |
| 9 | Hạ áp **XL4015 5A** (5V cho logic + lidar) | 1 | 26 000 | 26 000 | tgic `/san-pham/7360` |
| 10 | Hạ áp LM2596 (dự phòng) | 1 | 19 000 | 19 000 | icdayroi |
| 11 | **Logic analyzer** 8 kênh 24 MHz (dò tín hiệu xác robot) | 1 | 189 000 | 189 000 | icdayroi `/bo-do-xung-usb-saleae-logic-analyzer-8-kenh-24mhz` |
| 12 | MPU6050 GY-521 (con quay đo góc) | 1 | 73 000 | 73 000 | tgic `/san-pham/1845` |
| 13 | Board đồng đục lỗ 10×15 | 3 | 11 000 | 33 000 | icdayroi |
| 14 | Dây cắm, header đực/cái, domino, JST XH, XT60, đế + cầu chì 10A, công tắc nguồn | — | — | ~120 000 | tgic/icdayroi |
| 15 | Bộ điện trở 600 con | 1 | 40 000 | 40 000 | tgic `/san-pham/34249` |
| 16 | Tụ 1000 µF/25V ×4, tụ 100 nF ×20 | — | — | ~12 000 | icdayroi |
| | **Cộng A** | | | **≈ 1 430 000** | |

### B. Tùy tình trạng xác robot
| Linh kiện | Khi nào cần | Giá |
|---|---|---|
| Xác robot (Xiaomi gen1 / Roborock S5 ưu tiên; Ecovacs T5/DN53 cũng được) | Bắt buộc | 400 000 – 1 000 000 (Chợ Tốt: Mi Robot 700–750k, "Đen LDS" 1tr, Roborock CD202RR 950k) |
| BMS 4S 20A cân bằng (tgic `/san-pham/35684`) + 4 cell Samsung 25R + hộp pin + sạc 16.8 V 2A | Pin gốc chết / là NiMH | 98 000 + 205 000 + 10 000 + 44 500 ≈ **357 000** |
| Lidar LDS02RR tháo máy | Robot không có lidar dùng lại được | 400 000 – 800 000 [S] |
| Chổi cạnh / chổi cuộn / lọc HEPA thay thế | Xác thiếu | 20 000 – 150 000 mỗi món [S] |

### C. Nên có (nếu còn ngân sách)
| Linh kiện | Lý do | Giá |
|---|---|---|
| KIT PIC16F877A có sẵn ICSP (icdayroi `/kit-pic16f877a`) | Có mạch "chắc chắn chạy" để test firmware ngày 1 trong lúc hàn mạch riêng | 310 000 |
| PCB 2 lớp JLCPCB (5 bo) | Thay mạch đục lỗ sau khi đã chạy ổn | 150 000 – 250 000 (7–12 ngày) |

**Tổng dự kiến:** A 1.42 tr + robot ~0.7 tr + pin 0.36 tr + KIT 0.31 tr + lidar 0.45 tr + PCB 0.2 tr ≈ **3.4 triệu** → còn ~1.6 triệu dự phòng (cháy driver, BMS thứ 2, phí ship).

> Đặt cùng lúc ở **1–2 shop** để gộp ship; chọn **giao hỏa tốc trong ngày** nếu ở HN/HCM. Shopee chỉ dùng cho món không shop nào có (IRLZ44N).

---

## 2. Phần mềm — cài tối nay
| Máy | Phần mềm | Ghi chú |
|---|---|---|
| Laptop Windows | **CCS C** (PCWHD/PCM) | Biên dịch `firmware/pic16f877a_ccs/main.c` → `main.hex` |
| Laptop Windows | **MPLAB X/IPE v6.20** | Bản cuối hỗ trợ PICkit 3 |
| Laptop Windows | **Proteus 8** | Mô phỏng PIC trong lúc chờ hàng |
| Laptop Windows | **PulseView** (sigrok) | Phần mềm cho logic analyzer |
| MacBook | PlatformIO (đã có), **Flutter + Xcode** | ESP32 + app |
| Điện thoại | **nRF Connect** | Test BLE không cần app |

---

## 3. Lịch làm việc

### 🌙 Ngày 0 — tối 01/10 (3 giờ)
- [ ] Chốt + đặt cọc xác robot (dùng checklist hỏi người bán ở mục 5)
- [ ] Đặt toàn bộ BOM A (giao sáng mai)
- [ ] Cài phần mềm mục 2
- [ ] Mở `firmware/pic16f877a_ccs/main.c` trong CCS → **biên dịch ra .hex** (sửa tên hằng nếu CCS báo lỗi — xem README)
- [ ] Proteus: PIC + L298N + 2 động cơ + nút → chạy chế độ tự chạy (nhấn RB0) — xem `firmware/pic16f877a_ccs/README.md`
- [ ] Nạp ESP32-S3 (`pio run -t upload`), test `PING` bằng nRF Connect
- ✅ **Mốc 0:** có file .hex, ESP32 quảng bá BLE "RoboVac-PIC".

### ☀️ Ngày 1 — 02/10: Mổ xác + mạch PIC sống
| Giờ | Việc | Kết quả kiểm tra |
|---|---|---|
| 08–10 | **Mổ xác robot**: chụp ảnh mọi đầu nối TRƯỚC khi rút, dán nhãn dây, phân loại ốc | Ảnh + nhãn đầy đủ |
| 10–12 | **Đo đạc** theo `docs/06_DO_DAC_XAC_ROBOT.md`: pin, động cơ bánh (điện trở, cấp 5V thử), chân encoder (cấp 5V cho Hall, quay bánh, xem xung bằng logic analyzer), bumper, cảm biến chống rơi, quạt (đếm số dây), lidar (nếu dùng lại: cắm logic analyzer vào chân TX lúc mạch gốc còn sống) | Bảng đo đạc điền xong |
| 13–15 | Hàn **mạch PIC tối thiểu** trên đục lỗ: nguồn 5V, tụ 100 nF, thạch anh + 22 pF, 10k MCLR, header ICSP, đế 40 chân, LED RD7, các header ra | Đo 5V đúng chân 11/32 |
| 15–16 | Nạp `main.hex` bằng PICkit 3 | LED nháy 3 lần rồi nháy 1 Hz |
| 16–18 | Nối **UART qua BSS138** sang ESP32, chung GND | Serial ESP32 hết "[PIC chưa kết nối]", `RAW?` → `ok` tăng, `bad` ≈ 0 |
| 19–22 | Hàn **74HC32 + 2 DRV8871** + đầu nối bánh xe; kê robot lên. ESP32 để `USE_SPEED_PID 0` | `DRV:30,30` và `DRV:-30,-30` → 2 bánh quay **đều nhau** cả tiến lẫn lùi (sửa `MOTOR_x_INVERT` nếu ngược) |
- ✅ **Mốc 1:** điều khiển 2 bánh từ máy tính/điện thoại, PIC tự dừng khi rút ESP32 (timeout 300 ms).

### ☀️ Ngày 2 — 03/10: Cảm biến + lắp vào vỏ + chạy tự động
| Giờ | Việc | Kết quả kiểm tra |
|---|---|---|
| 08–10 | Encoder → `TICKS_PER_REV` (quay tay 10 vòng); chạy `DRV:100,100` đo số xung/20 ms → `MAX_TICKS_PER_PERIOD`; bật `USE_SPEED_PID 1`, chỉnh `PID_KP/KI`; bumper + nhấc bánh | `RAW?` thấy encoder tăng đúng chiều; robot đi thẳng 2 m lệch < 5 cm; bấm bumper → `S,…,bump=1` |
| 10–12 | Cảm biến chống rơi: đọc `RAW?` trên sàn & ngoài mép bàn → đặt `CLIFF_THRESHOLD`; phân áp pin 33k/10k | Đưa ra mép bàn → bánh dừng ngay |
| 13–15 | **Quạt hút** (PWM từ ESP32 GPIO4 hoặc MOSFET) + **chổi cuộn/chổi cạnh** (MOSFET + diode) | `FAN:80`, `BRUSH:1,1` chạy; không reset MCU khi bật quạt |
| 15–17 | Lắp gọn mọi thứ vào vỏ, đi dây gọn, cầu chì 10A + công tắc | Đóng vỏ được |
| 17–19 | Chạy **AUTO** trên sàn thật; chỉnh `SPEED_*`, `BACKUP_MM` | Chạy 10 phút không kẹt, không rơi |
| 20–22 | MPU6050 → đo góc; test **đi hình vuông 1 m** → chỉnh `WHEEL_BASE_MM`, `WHEEL_DIAMETER_MM` | Sai số khép kín < 10 cm |
- ✅ **Mốc 2:** robot tự dọn chế độ AUTO, né vật, không rơi, hút được giấy vụn.

### ☀️ Ngày 3 — 04/10: Thuật toán + app + PCB + demo
| Giờ | Việc | Kết quả |
|---|---|---|
| 08–10 | **ZIGZAG / SPIRAL** trên sàn thật (đặt robot song song tường) | Ảnh/video luống quét đều |
| 10–12 | **App Flutter**: `flutter create .` → build APK; iPhone qua Xcode (Apple ID miễn phí) | App điều khiển được robot |
| 13–15 | Thử hút: bột mì/giấy vụn/tóc trên sàn gạch; dán kín khe hở, viền cao su | So sánh trước/sau |
| 15–17 | **Vẽ PCB KiCad** từ mạch đục lỗ đã chạy (đúng `docs/01`) → đặt JLCPCB | File Gerber + đơn hàng |
| 17–20 | Quay video demo (AUTO, ZIGZAG, né vật, mép bàn, app), viết báo cáo tiến độ + slide | Video + báo cáo |
- ✅ **Mốc 3 (demo khung):** đầy đủ chức năng ở mục tiêu đầu trang.

---

## 4. Rủi ro & phương án dự phòng
| Rủi ro | Dấu hiệu | Phương án |
|---|---|---|
| CCS báo lỗi tên hằng | Lỗi compile `setup_adc_ports`, `T1_EXTERNAL_SYNC` | Tra `16F877A.h` trong thư mục CCS, đổi tên tương ứng |
| Mạch PIC tự hàn không chạy | LED không nháy | Dùng KIT PIC16F877A test trước; kiểm tra 5V, thạch anh, MCLR, fuse HS |
| Không tìm ra chân encoder | Không thấy xung | Cấp 5V qua trở 1k vào từng dây nghi ngờ, quay bánh, xem logic analyzer; tạm chạy không encoder (AUTO vẫn chạy được bằng thời gian) |
| Quạt là BLDC lạ, không quay | Có 4–6 dây | Đo mức PWM của mạch gốc bằng logic analyzer khi còn sống; fallback: quạt ly tâm 12V 9733 (~200k) qua MOSFET |
| Bật quạt/động cơ làm reset | LED khởi động lại | Tụ 1000 µF ở driver, tụ 100 nF ở động cơ, buck riêng cho logic, chung GND hình sao |
| Pin gốc NiMH / chết | Áp < 12 V hoặc không giữ áp | Mua bộ pin 4S + BMS (mục B) |
| Không kịp app Flutter | — | Demo bằng nRF Connect (cùng giao thức) |
| Lidar Ecovacs không giải mã được | — | Để sau; mua LDS02RR khi làm SLAM |

## 5. Checklist hỏi người bán xác robot
1. Hỏng gì? Bật nguồn có sáng đèn không? Có báo lỗi giọng nói không?
2. Bấm chạy: **lidar có quay, bánh có chạy, quạt có kêu không?** (xin video)
3. Còn đủ: 2 module bánh, chổi cuộn, chổi cạnh, hộp bụi + lọc, bumper, pin, dock/sạc?
4. Pin còn sạc được không? Model chính xác (tem dưới đáy)?
→ Ưu tiên: Xiaomi gen1 (SDJQR01/02RR) / Roborock S5/S50 (tài liệu đầy đủ) > Ecovacs T5/DN53 > DL33.
