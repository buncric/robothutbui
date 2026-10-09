const n=`# 04 — Lộ trình từ cơ bản đến master (robot hút bụi)

> Tổng thời gian ~9–12 tháng song song việc học. Mỗi giai đoạn có: **kiến thức → bài thực hành → tiêu chí "đã xong"**.
> Mũi tên 🔗 chỉ tới code thật trong dự án này để bạn học bằng cách đọc/sửa code của chính mình.
> Ký hiệu: 🇻🇳 = tài liệu tiếng Việt. [V] = đã kiểm tra link mở được, [S] = chỉ thấy qua tìm kiếm.

\`\`\`
GĐ0 Điện cơ bản ─► GĐ1 C nhúng ─► GĐ2 PIC + CCS ─► GĐ3 ESP32/BLE/Flutter ─► GĐ4 Điều khiển & thuật toán ─► GĐ5 PCB ─► GĐ6 Linux/ROS2/SLAM
   2–3 tuần          2–3 tuần        5–6 tuần          4–6 tuần                   5–6 tuần                  3–4 tuần     8–12 tuần
                      (3 ngày đồ án: bạn "nhảy cóc" qua GĐ0–4 bằng code có sẵn, rồi quay lại học kỹ)
\`\`\`

---

## GĐ0 — Điện tử cơ bản (2–3 tuần)
**Kiến thức:** định luật Ohm & Kirchhoff, công suất P = U·I; diode & diode chống điện áp ngược (flyback); MOSFET kênh N mức logic (Vgs(th) khác Rds(on) ở 5V/3.3V thế nào); cầu H (trùng dẫn, phanh vs thả trôi); PWM; tụ lọc (100 nF mỗi chân VDD + tụ hóa lớn); điện trở kéo lên; chuyển mức 5V ⇄ 3.3V; an toàn pin Li-ion (BMS, quá áp/thấp áp, cầu chì, không sạc khi vắng người).

**Thực hành:**
1. Điều khiển động cơ DC bằng MOSFET + diode flyback, PWM từ 555 hoặc Arduino Uno.
2. Mạch phân áp đo pin 4S bằng đồng hồ → tính ra giá trị ADC. 🔗 \`sensors.c: vbat_update()\`

**Xong khi:** tự chọn được MOSFET, điện trở cổng, cầu chì cho quạt 2–4 A; giải thích được vì sao UART 5V vào ESP32 phải chuyển mức.

**Tài liệu:** *Make: Electronics* (Platt) [S] · *Practical Electronics for Inventors* [S] · H-Bridge Secrets — https://www.modularcircuits.com/blog/articles/h-bridge-secrets/h-bridges-the-basics/ [V] · SparkFun Logic Levels — https://learn.sparkfun.com/tutorials/logic-levels/all [V] · Battery University BU-304a — https://batteryuniversity.com/article/bu-304a-safety-concerns-with-li-ion [V]

---

## GĐ1 — Lập trình C cho vi điều khiển (2–3 tuần)
**Kiến thức:** kiểu dữ liệu cố định độ rộng (int8/int16 — chú ý trong CCS \`int\` = 8 bit không dấu!), thao tác bit (\`|= &= ~ << >>\`), \`volatile\`, \`static\`, \`const\`, struct/union, số thực dấu phẩy tĩnh, **bộ đệm vòng**, **máy trạng thái** (switch/enum).

**Thực hành:**
1. Viết bộ đệm vòng + bộ phân tích khung UART chạy trên máy tính, có unit test. 🔗 Đọc \`link.c\` và \`host_test/test.c\` — chạy \`./host_test/run_tests.sh\`.
2. Viết máy trạng thái bump-and-turn bằng C thuần. 🔗 \`standalone.c\`

**Xong khi:** tự viết được bộ đệm vòng an toàn với ngắt và khung có header/length/payload/checksum.

**Tài liệu:** BARR-C:2018 Coding Standard (PDF miễn phí) — https://barrgroup.com/coding-standard [S] · Valvano "Embedded Systems – Shape the World" — https://users.ece.utexas.edu/~valvano/Volume1/E-Book/ [S]

---

## GĐ2 — PIC16F877A với CCS C (5–6 tuần) ⭐ trọng tâm đồ án
**Kiến thức:** kiến trúc Harvard, RAM chia bank, **stack chỉ 8 tầng** (tránh gọi hàm lồng sâu), fuse (HS, NOWDT, NOLVP, BROWNOUT, PUT); Timer0/1/2; CCP1(RC2)/CCP2(RC1) PWM dùng chung Timer2; ADC 10-bit 8 kênh; USART; MSSP (I2C/SPI); EEPROM; ngắt RB0/INT và RB4–7; Timer0/Timer1 làm **bộ đếm xung encoder phần cứng**; đọc datasheet (bản đồ bộ nhớ, SFR, đặc tính điện — ví dụ chân RX là Schmitt cần ≥ 0.8·VDD).

**Thực hành:** 2 động cơ PWM qua driver + đọc encoder gửi UART 🔗 \`motor.c\`; "bo cảm biến" gửi bumper/cliff/pin 50 Hz 🔗 \`sensors.c\`, \`link.c: send_status()\`.

**Xong khi:** nhịp 1 kHz từ ngắt Timer chạy PID 2 bánh không trễ nhịp (đo bằng cách đảo 1 chân và xem trên logic analyzer).

**10 bài tập kinh điển PIC16F877A + CCS cho robot này** (làm trên Proteus trước, rồi phần cứng):
1. Nháy LED + fuse: chứng minh thạch anh 20 MHz bằng cách đảo chân và đo tần số.
2. Nút/bumper chống dội bằng bộ đếm trong ngắt 1 ms. 🔗 \`db_update()\`
3. Nhịp hệ thống tất định: ngắt 1 kHz chia task 1/10/100 ms; đo tải CPU bằng đảo chân. 🔗 \`isr_timer2()\`
4. PWM 2 động cơ 15–20 kHz + chân chiều + khởi động mềm. 🔗 \`motor_output()\`, \`ramp_toward()\`
5. Đếm encoder bằng T0CKI/T1CKI (hoặc giải mã 2 kênh A/B bằng ngắt RB4–7). 🔗 \`motor_tick_1ms()\`
6. **PID tốc độ bánh** (số nguyên/dấu phẩy tĩnh, chống bão hòa tích phân), vẽ đáp ứng bước qua UART. *(chưa có trong code — bài nâng cấp đầu tiên nên làm)*
7. ADC: pin qua phân áp, dòng động cơ qua điện trở shunt + op-amp, cliff IR có/không LED, cắt pin có trễ. 🔗 \`cliff_update()\`
8. UART theo ngắt + bộ đệm vòng + khung \`[0xAA][len][cmd][payload][chk]\` + heartbeat dừng động cơ. 🔗 \`link.c\`
9. Bộ giám sát an toàn: bật watchdog (\`restart_wdt()\`), xử lý reset brown-out, ghi nguyên nhân reset/lỗi vào EEPROM (\`write_eeprom\`). *(bài nâng cấp)*
10. Máy trạng thái hành vi chạy ngay trên PIC (bump-and-turn → xoắn ốc → bám tường) làm chế độ dự phòng khi không có ESP32. 🔗 \`standalone.c\` (đã có bump-and-turn)

**Tài liệu:**
- Datasheet PIC16F87XA (DS39582) — https://ww1.microchip.com/downloads/en/DeviceDoc/39582b.pdf [S]
- PICmicro Mid-Range Reference Manual (DS33023) — https://ww1.microchip.com/downloads/en/DeviceDoc/33023a.pdf [S]
- CCS C Compiler Manual — https://www.ccsinfo.com/downloads/ccs_c_manual.pdf [S] + thư mục \`EXAMPLES\` trong bộ cài CCS (đặc biệt \`EX_SISR.C\`, \`EX_STISR.C\` về UART ngắt)
- ⭐ Sách **Martin Bates — *Programming 8-bit PIC Microcontrollers in C*** (dùng đúng CCS PCM + PIC16 + Proteus) [V] — hợp hơn Mazidi (Mazidi dùng PIC18 + C18)
- 🇻🇳 **xcvn.blogspot.com — "Lập trình PIC"** (40+ bài PIC16F877A + CCS), ví dụ Bài 30 PWM & L298: https://xcvn.blogspot.com/2016/01/bai-30-pwm-va-l298-pic16f877a-ccs.html [V]; UART: https://xcvn.blogspot.com/2015/12/bai-14-giao-tiep-uart-pic16f877a-ccs-p1.html [S]
- 🇻🇳 Giáo trình *Vi điều khiển PIC* — Nguyễn Đình Phú (ĐH SPKT TP.HCM, PIC16F887 + CCS) — thư viện trường [S]
- 🇻🇳 Diễn đàn PIC Vietnam (kho CCS C cũ) — http://www.picvietnam.com/forum/ [S]

---

## GĐ3 — ESP32-S3, FreeRTOS, BLE, Flutter (4–6 tuần)
**Kiến thức:** PlatformIO; FreeRTOS (task, queue, mutex, ghim task vào core); UART; BLE GATT (service, characteristic, notify, MTU); NimBLE; I2C IMU. Flutter: widget, state, stream, \`flutter_blue_plus\`.

**Thực hành:** dịch vụ BLE có Write + Notify, test bằng nRF Connect 🔗 \`ble_link.cpp\`; app Flutter có joystick + nút + trạng thái pin/va chạm 🔗 \`app/robovac_ble/\`.

**Xong khi:** điện thoại → BLE → ESP32 → UART → PIC → động cơ trễ < 100 ms; mất BLE thì robot dừng an toàn (đã có: MANUAL timeout 500 ms + PIC timeout 300 ms).

**Tài liệu:** DigiKey/Shawn Hymel "Introduction to RTOS" (FreeRTOS trên ESP32) [S] · Random Nerd Tutorials ESP32 BLE — https://randomnerdtutorials.com/esp32-bluetooth-low-energy-ble-arduino-ide/ [V] · NimBLE-Arduino — https://github.com/h2zero/NimBLE-Arduino [V] · flutter_blue_plus — https://pub.dev/packages/flutter_blue_plus · 🇻🇳 **Khuê Nguyễn Creator** "Lập trình ESP32 từ A tới Z" — https://khuenguyencreator.com/hoc-lap-trinh-mcu/lap-trinh-esp32/ [V] · 🇻🇳 **Deviot blog** (ESP32, FreeRTOS, BLE) — https://blog.deviot.vn/ [V]

---

## GĐ4 — Điều khiển, odometry, thuật toán hút bụi (5–6 tuần)
**Kiến thức:** PID (chu kỳ lấy mẫu, chống bão hòa, derivative kick); động học vi sai v = (vR+vL)/2, ω = (vR−vL)/L 🔗 \`Odometry::update()\`; hợp nhất con quay + encoder (lọc bù / Kalman 1 chiều); phân xử hành vi (subsumption); các kiểu quét: va chạm-quay ngẫu nhiên, xoắn ốc, bám tường (PD theo cảm biến IR bên hông), **luống cày boustrophedon** 🔗 \`robot.cpp\`.

**Thực hành:**
1. Cho robot đi hình vuông 1 m, đo sai số khép kín → hiệu chỉnh \`WHEEL_DIAMETER_MM\`, \`WHEEL_BASE_MM\` (phương pháp UMBmark).
2. Máy trạng thái: xoắn ốc → va chạm-quay → bám tường → quay về gần điểm xuất phát.
3. 🔗 Sửa thuật toán trong \`robot.cpp\` rồi chạy \`./sim/run_sim.sh\` để so % diện tích phủ **trước khi** thử trên robot thật.

**Xong khi:** trôi góc < 5°/phút khi có gyro; phủ ≥ 80 % phòng 3×3 m trong 15 phút (kiểm tra bằng ảnh phơi sáng lâu một đèn LED gắn trên robot).

**Tài liệu:** Brett Beauregard "Improving the Beginner's PID" [S] · https://www.kalmanfilter.net/ [V] · **Modern Robotics** (Lynch & Park) PDF miễn phí — https://hades.mech.northwestern.edu/images/2/25/MR-v2.pdf [V] (chương 13: robot bánh xe), Coursera — https://www.coursera.org/specializations/modernrobotics [V] · Siegwart *Introduction to Autonomous Mobile Robots* [S] · Bằng sáng chế iRobot US6809490 (đa chế độ quét) — https://patents.google.com/patent/US6809490 [S]

---

## GĐ5 — Thiết kế PCB với KiCad (3–4 tuần, làm song song GĐ4)
**Kiến thức:** sơ đồ nguyên lý → footprint → đi dây; đường nguồn rộng, mặt GND liền, tách vòng dòng động cơ xa MCU, đặt tụ lọc sát chân; TVS + cầu chì ở đầu vào pin; test point; DRC theo luật JLCPCB/PCBWay.

**Thực hành:** bo 2 lớp "PIC motor board": PIC16F877A, thạch anh 20 MHz, header ICSP, 2 driver, đầu nối encoder/bumper/cliff, BSS138 sang ESP32 — đúng theo \`docs/01\`.

**Xong khi:** bo về cấp nguồn chạy ngay lần đầu, động cơ chạy không làm reset MCU.

**Tài liệu:** KiCad 9 Getting Started — https://docs.kicad.org/9.0/en/getting_started_in_kicad/getting_started_in_kicad.html [V] · Phil's Lab (YouTube) #65 KiCad full tutorial, #87 How to learn PCB design [S]

---

## GĐ6 — Linux, ROS 2, SLAM, quét phủ (8–12 tuần) 🏆 master
**Kiến thức:** Linux CLI, ssh, systemd, udev; ROS 2 (node, topic, service, action, launch, param, tf2, URDF, ros2_control); cầu nối vi điều khiển ↔ ROS (node serial tự viết hoặc micro-ROS trên ESP32); \`robot_localization\` EKF (odometry + IMU); \`slam_toolbox\` (dựng bản đồ + định vị); **Nav2** (costmap, planner, controller, behavior tree); quét phủ \`opennav_coverage\` / Fields2Cover (boustrophedon).

**Lưu ý phần cứng:** ROS 2 Jazzy cần Ubuntu 24.04 — Armbian có image Ubuntu 24.04 cho ODROID-M2 [S], kiểm tra bản chính thức của Hardkernel trước. Lidar: Xiaomi LDS02RR (giao thức đã được giải mã, có driver ESP32/ROS2) hoặc LDROBOT LD19.

**Thực hành:** theo series Articulated Robotics trên Gazebo rồi chuyển sang robot thật → dựng bản đồ căn phòng bằng slam_toolbox → vẽ đa giác vùng cần dọn → chạy opennav_coverage → về dock.

**Xong khi:** robot tự dựng bản đồ, tự định vị, quét kín vùng đã vẽ theo luống cày và tự về dock.

**Tài liệu:** **Articulated Robotics** "Build a Mobile Robot with ROS" — https://articulatedrobotics.xyz/tutorials [V] · Nav2 First-Time Robot Setup — https://docs.nav2.org/setup_guides/index.html [S] · slam_toolbox — https://github.com/SteveMacenski/slam_toolbox · opennav_coverage — https://github.com/open-navigation/opennav_coverage [V] · Fields2Cover — https://github.com/Fields2Cover/Fields2Cover [V] · Choset 1997 *Boustrophedon Decomposition* — https://publications.ri.cmu.edu/storage/publications/pub_files/pub1/choset_howie_1997_5/choset_howie_1997_5.pdf [V] · Galceran & Carreras 2013 *Survey on coverage path planning* [S] · *Probabilistic Robotics* (Thrun) [S] · 🇻🇳 **The Construct — Vietnamese ROS Tutorials** — https://www.theconstruct.ai/category/vietnamese-ros-tutorials/ [V], tạo bản đồ ROS2 Nav + SLAM tiếng Việt — https://www.theconstruct.ai/tao-ban-do-cung-voi-ros2-nav-su-dung-slam-vietnamese-tutorial-vietnamese-tutorial/ [V]

---

## Nâng cấp dự án theo thứ tự đề xuất (sau mốc 3 ngày)
1. PID tốc độ bánh trên PIC (bài 6) → robot đi thẳng hơn, odometry chính xác hơn.
2. Watchdog + EEPROM log lỗi (bài 9).
3. Bám tường bằng cảm biến IR/ToF bên hông (VL53L0X) → chế độ \`EDGE\`.
4. PCB v1 thay mạch đục lỗ.
5. Về dock bằng IR (tận dụng dock gốc nếu có).
6. Lidar + ODROID-M2 + ROS 2: bản đồ, chia phòng, quét theo bản đồ, vẽ bản đồ lên app qua BLE (~10 KB/bản đồ 10×10 m ô 5 cm, < 1 s).
`;export{n as default};
