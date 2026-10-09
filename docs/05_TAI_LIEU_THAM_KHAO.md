# 05 — Tài liệu tham khảo (đã nghiên cứu cho dự án)

Ký hiệu: [V] = đã mở và kiểm tra nội dung · [S] = chỉ thấy qua tìm kiếm.

## A. Project PIC16F877A có code
| Project | Compiler | Dùng để | Link |
|---|---|---|---|
| Vacuum-Cleaner (robot hút bụi PIC16F877A duy nhất có code) — CCP1 cho bánh, CCP2 cho quạt, HC-SR04 + Timer1, có sơ đồ + báo cáo PDF | mikroC | Lý giải thiết kế trong báo cáo | https://github.com/Mohammad-AlJourishi/Vacuum-Cleaner [V] |
| Obstacle-Avoiding-Robot PIC16F877A (MPL-2.0) | XC8 20 MHz | Khung tránh vật cản | https://github.com/Jayanth20/Obstacle-Avoiding-Robot-Using-PIC16F877A [V] · bài gốc CircuitDigest https://circuitdigest.com/microcontroller-projects/obstacle-avoiding-robot-using-pic16f877a [V] |
| Bluetooth-Controlled-Robot — L298N ENA=CCP1, ENB=CCP2, UART lệnh 1 ký tự | mikroC | Cách đấu PWM + UART | https://github.com/maryam-engineer-cmd/Bluetooth-Controlled-Robot [V] |
| PIC16F877A Ultrasonic Radar + ESP32 Web (UART PIC→ESP32) | XC8 | Ví dụ PIC ⇄ ESP32 duy nhất | https://github.com/AnasAlmakhamreh/PIC16F877A-Ultrasonic-Radar-with-ESP32-Web-Visualization [V] |
| atick-faisal/PIC16F877a — ví dụ từng ngoại vi + file Proteus (GPL-3.0) | XC8 | Học từng khối | https://github.com/atick-faisal/PIC16F877a [V] |
| Bggopal/Robotics-Projects — PWM, encoder, Proteus | XC8 | Tham khảo (có lỗi ADC Fosc/16) | https://github.com/Bggopal/Robotics-Projects [V] |
| auto-sowing-robot — PIC nhiều động cơ + encoder | XC8 | Cấu trúc dự án lớn | https://github.com/OlegAngelo/auto-sowing-robot [V] |
| obstacle-avoiding-vacuum-cleaner-robot-PIC16F877A | XC8 | ⚠️ code lỗi, chỉ lấy file Proteus/LCD | https://github.com/sahasdulnada/obstacle-avoiding-vacuum-cleaner-robot-PIC16F877A [V] |
| DeepBlueEmbedded — HC-SR04 với PIC | XC8 | Giải thích Timer1 | https://deepbluembedded.com/ultrasonic-sensor-hc-sr04-pic-microcontrollers-tutorial/ [V] |
| CircuitDigest — PIC16F877A + ESP8266 (phân áp TX) | XC8 | | https://circuitdigest.com/microcontroller-projects/interfacing-pic-microcontroller-with-esp8266 [V] |
| Bài báo: *Development of an Autonomous Vacuum Cleaner Robot* (PIC16F877, Zaria J. 2020) | — | Trích dẫn báo cáo | https://journals.abu.edu.ng/index.php/zjeet/article/view/498 [S] |
| 🇻🇳 HAUI — *Nghiên cứu, chế tạo robot hút bụi tự động* (Arduino) | — | Cơ khí, cấu trúc | https://khcn.haui.edu.vn/media/30/uffile-upload-no-title30305.pdf [V] |
| 🇻🇳 ICTU — Robot dò line PIC16F877A | — | Trích dẫn tiếng Việt | https://repository.ictu.edu.vn/wp-content/uploads/2026/05/27714.pdf [V] |

## B. Robot hút bụi DIY (cơ khí, hút, pin)
| Project | Điểm đáng học | Link |
|---|---|---|
| César Nieto — DIY Vacuum Robot (được làm lại nhiều nhất) | Quạt ly tâm 12V 9733 (~38–52 CFM, 4.5 A), lọc vải, nghiêng về trước, pin 3S 1300 mAh → ~15 phút | https://www.instructables.com/Build-Your-Own-Vacuum-Robot/ · https://github.com/cesnietor/VacuumRobot [V] |
| Roombot (bản làm lại của Nieto) | Chứng minh tái lập được | https://www.instructables.com/Roombot-1/ [V] |
| Open Source Robot Vacuum MARK I/II | Thu nhỏ, HEPA, thổi khí lên trên | https://hackaday.com/2018/02/24/this-3d-printed-robotic-vacuum-sucks/ [V] |
| Home Hoover (nhóm sinh viên 2024) | Tái dùng động cơ Roomba có encoder, 2 buck 5V/9V; cảm biến siêu âm chống rơi **thất bại** | https://www.instructables.com/Home-Hoover/ [V] |
| CircuitDigest Smart Vacuum v2 | Mổ máy hút bụi cầm tay làm bộ hút (nhanh nhất) | https://circuitdigest.com/microcontroller-projects/build-your-own-arduino-based-smart-vacuum-cleaning-robot-for-automatic-floor-cleaning [V] |
| Vacuum Cleaning RC Robot | BLDC drone + ESC làm quạt hút | https://www.instructables.com/Vacuum-Cleanin-RC-Robot/ [V] |
| Vileda robot + Arduino | Mẹo **giữ driver gốc, chỉ thay MCU** | https://ynformatics.com/2017/arduino-vileda-cleaning-robot/ [V] |
| OOMWOO (Pi + STM32 + LiDAR + ROS 2 Nav2) | **Sơ đồ chân bánh xe & quạt BLDC Roborock** | https://github.com/makerspet/oomwoo [V] · https://makerspet.com/blog/oomwoo-hardware-bring-up/ [V] |
| LARA (EEVblog) | Lọc quá dày → tắc; làm phần đi trước, phần hút sau | https://www.eevblog.com/forum/projects/lara-the-robot-vacuum-cleaner-1 [V] |
| Valetudo | Firmware không cloud cho robot thương mại, UI bản đồ để học | https://github.com/Hypfer/Valetudo [V] |

**Bài học thiết kế:** quạt hướng trục (quạt PC, cánh TT) gần như không hút; khe hút hẹp 100–150 × 3–8 mm, cách sàn 2–5 mm, kín khí mới là thứ quyết định; bụi phải đi khe → hộp → lọc → quạt; BMS ≥ 10–15 A; không dùng module IRF520.

## C. Xác robot thương mại & lidar tái sử dụng
| Nội dung | Link |
|---|---|
| Bánh xe Roborock S5: JST ZH 7 chân (MOT+, MOT−, Hall GND, Hall OUT open-collector, Hall Vcc 3.3–5V, công tắc nhấc ×2); động cơ 0.14 A không tải / ~2 A kẹt | https://raw.githubusercontent.com/makerspet/oomwoo-pcb/main/docs/SPEC.md [V] |
| Quạt BLDC robot hút bụi (VCC/GND/PWM/FG, PWM thấp = tắt) | cùng link trên [V] |
| Lidar Xiaomi LDS02RR: 5V, UART 3.3V 115200, gói XV11 22 byte, host tự PWM motor ~5 Hz | https://makerspet.com/blog/tutorial-connect-xiaomi-lds02rr-lidar-to-raspberry-pi-python/ [V] |
| Thư viện lidar cho ESP32/Arduino (LDS02RR, XV11, Delta-2x, Camsense, LD14P…) | https://github.com/kaiaai/LDS [V] · danh sách https://github.com/kaiaai/awesome-2d-lidars [V] |
| Lidar 3irobotix Delta-2G nối ESP32 (TX 5V → cần trở nối tiếp) | https://makerspet.com/blog/connect-delta-2g-lidar-to-makerspet-esp32-boards/ [V] |
| Ecovacs Deebot 900 (iFixit): hướng dẫn thay bánh, quạt, mainboard — **chưa ai công bố giao thức lidar Ecovacs** | https://www.ifixit.com/Device/Ecovacs_Deebot_900 [V] |
| Roomba encoder quang 32 rãnh × 25:1 = 800 xung/vòng | https://forum.arduino.cc/index.php?topic=438860.0 [V] |
| ILIFE V3s reverse engineering (STM32 bị khóa đọc) | https://github.com/kbickham/iLife_Robotic_Vaccum_v3s_Reverse_Engineer [V] |

## D. Kiến trúc, giao tiếp, an toàn điện
| Nội dung | Link |
|---|---|
| Datasheet ESP32-S3 (không chịu 5V) | https://documentation.espressif.com/esp32-s3_datasheet_en.pdf [V] |
| Datasheet PIC16F87XA (RC7 Schmitt VIH ≥ 0.8 VDD; BOR) | https://ww1.microchip.com/downloads/en/DeviceDoc/39582b.pdf [V] |
| SparkFun level converter BSS138 | https://learn.sparkfun.com/tutorials/bi-directional-logic-level-converter-hookup-guide/all [V] |
| PIC UART XC8 (SPBRG/BRGH) | https://electrosome.com/uart-pic-microcontroller-mplab-xc8/ [V] |
| PacketSerial (COBS) | https://github.com/bakercp/PacketSerial [V] |
| Waveshare UGV: host gửi JSON cho ESP32 điều khiển tầng dưới | https://github.com/waveshareteam/ugv_base_general [V] |
| Microchip bỏ hỗ trợ PICkit 3 từ MPLAB X 6.25 | https://www.microchip.com/en-us/about/media-center/blog/2024/discontinued-ide-support-for-gen3-tools [S] |

## E. Thuật toán quét phủ
| Nội dung | Link |
|---|---|
| Bằng sáng chế iRobot US6809490 — đa chế độ: xoắn ốc, bám tường, va chạm-quay | https://patents.google.com/patent/US6809490B2/en [V] |
| So sánh mô phỏng Webots: zig-zag giảm ~60 % thời gian so với ngẫu nhiên | https://nhsjs.com/?p=17565 [V] |
| Arduino Mega robot hút bụi boustrophedon (85 % thành công) | https://repository.its.ac.id/82922/ [V] |
| Choset 1997 — Boustrophedon cell decomposition | https://publications.ri.cmu.edu/storage/publications/pub_files/pub1/choset_howie_1997_5/choset_howie_1997_5.pdf [V] |
| slam_toolbox · Nav2 opennav_coverage · Fields2Cover | https://github.com/SteveMacenski/slam_toolbox [V] · https://github.com/open-navigation/opennav_coverage [V] · https://github.com/Fields2Cover/Fields2Cover [V] |
| LD06/LD19 ROS 2 driver · RPLIDAR ROS 2 · micro-ROS ESP-IDF (đã test ESP32-S3) | https://github.com/ldrobotSensorTeam/ldlidar_stl_ros2 [V] · https://github.com/Slamtec/sllidar_ros2 [V] · https://github.com/micro-ROS/micro_ros_espidf_component [V] |

## F. BLE & app
| Nội dung | Link |
|---|---|
| NimBLE-Arduino (ví dụ NimBLE_Stream_Server dùng sẵn UUID NUS) | https://github.com/h2zero/NimBLE-Arduino [V] |
| flutter_blue_plus (giấy phép: miễn phí cho cá nhân/giáo dục) | https://pub.dev/packages/flutter_blue_plus [V] |
| Android quyền Bluetooth | https://developer.android.com/develop/connectivity/bluetooth/bt-permissions [V] |
| Flutter build iOS / Android | https://docs.flutter.dev/deployment/ios · https://docs.flutter.dev/deployment/android [V] |
| Sideloadly (cài .ipa bằng Apple ID miễn phí, 7 ngày) | https://sideloadly.io/ [V] |
| ROS_Flutter_Gui_App (vẽ bản đồ occupancy grid trong Flutter) | https://github.com/chengyangkj/ROS_Flutter_Gui_App [V] |
| XIAO ESP32S3 Sense camera stream | https://wiki.seeedstudio.com/xiao_esp32s3_camera_usage/ [V] |

Lộ trình học + sách/khóa học: xem `04_ROADMAP_MASTER.md`.
