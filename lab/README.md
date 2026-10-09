# 🧪 RoboVac Lab 3D — phòng thí nghiệm ảo học robot hút bụi

Học **từng linh kiện** của robot hút bụi bằng mô hình 3D tương tác: từ con ốc, lò xo, bánh răng → động cơ, driver, pin, mạch hạ áp → PIC16F877A, ESP32-S3 → cảm biến → robot hoàn chỉnh → cho robot chạy trong căn nhà / trên bàn.

## Chạy
```bash
cd lab
npm install        # lần đầu
npm run dev        # mở http://localhost:5173
```
Chạy offline sau khi cài. Muốn bản tĩnh: `npm run build` → thư mục `dist/` (mở bằng `npx vite preview`).

## Mỗi linh kiện có gì
| Khu vực | Nội dung |
|---|---|
| **Mô hình 3D** | Kích thước thật (mm). Kéo xoay, cuộn phóng to, **rê chuột lên từng bộ phận** để xem tên + công dụng, bấm để ghim. Nút: góc nhìn, nhãn, tự xoay, khung dây |
| **🎛 Thí nghiệm** | Thanh trượt / công tắc / nút để chạy mô phỏng (vật lý thật: phương trình động cơ, định luật Ohm, Hooke, tỉ số truyền…) |
| **🔧 Tháo lắp từng bước** | ◀ ▶ đi qua từng bước tháo/lắp: dụng cụ, thứ tự, điểm dễ gãy, mẹo |
| **⚠️ Thử lắp sai / sự cố** | Bấm để xem chuyện gì xảy ra khi cắm ngược, chập mạch, quá áp, thiếu linh kiện… với hiệu ứng **khói / tia lửa / lửa / nổ / nóng đỏ / cháy xém** + thẻ **Hiện tượng · Vì sao · Cách phòng** |
| **📟 Số đo** | Tốc độ, dòng, áp, nhiệt độ, trạng thái… |
| **〰 Máy hiện sóng** | Tín hiệu theo thời gian (tín hiệu quá nhanh được làm chậm, có ghi chú) |
| **📖 Bài học 6 phần** | Tổng quan · Thông số · Nguyên lý · Trong robot (nối chân nào, file firmware nào) · Lỗi hay gặp · Kiểm tra |
| **Tiến độ** | Đánh dấu "đã học", thanh tiến độ trên cùng (lưu trong trình duyệt) |

## Nhóm nội dung
🤖 Robot hoàn chỉnh · 🏠 Môi trường mô phỏng (căn hộ, mặt bàn, bàn thí nghiệm điện, hàn mạch PIC) · 🔩 Cơ khí · ⚙️ Động cơ & truyền động · 🔌 Linh kiện điện tử cơ bản · 🔋 Nguồn & pin · 🧠 Vi điều khiển & mạch · 📡 Cảm biến

## Thêm linh kiện mới
Xem [`COMPONENT_API.md`](COMPONENT_API.md) — mỗi linh kiện là 1 file, app tự nạp. Kiểm tra không cần trình duyệt:
```bash
node tools/smoke.mjs            # tất cả
node tools/smoke.mjs dong-co-dc # một linh kiện
```

## Cấu trúc
```
lab/
├── index.html, src/style.css, src/main.js   khung app (danh mục, bài học, tháo lắp, sự cố)
├── src/core/   viewer.js (3D) · fx.js (hiệu ứng) · scope.js (máy hiện sóng) · ui.js · geom.js · materials.js
├── src/sim/    robot-brain.js (bản JS của thuật toán firmware ESP32 + phản xạ PIC)
├── src/components/<nhóm>/<linh-kiện>.js
└── tools/smoke.mjs   kiểm tra tự động
```

## Sau này
- Đóng gói thành app máy tính (Tauri/Electron) — mã nguồn giữ nguyên.
- Thêm "lắp mạch tự do" (kéo dây giữa các chân), mô phỏng chạy chính file `.hex` của PIC.
