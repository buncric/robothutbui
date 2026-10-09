# 07 — KIẾN THỨC HÀN MẠCH (Hand Soldering Knowledge Base)

> Mục đích: làm "nguồn sự thật" (source of truth) cho trình mô phỏng hàn trong game giáo dục, và làm tài liệu học cho người mới.
> Ngôn ngữ: tiếng Việt, thuật ngữ kỹ thuật giữ tiếng Anh trong ngoặc.
> Ký hiệu nguồn: **[V]** = đã mở và đọc trực tiếp trang/tài liệu đó; **[S]** = lấy từ kết quả tìm kiếm/trích đoạn, chưa mở toàn văn — nên kiểm tra lại trước khi coi là chuẩn.
> Ký hiệu **[TK]** = số liệu do người viết **ước tính/thiết kế cho game** (không có nguồn trực tiếp) — dùng để cân bằng gameplay, không phải tiêu chuẩn.
> Danh sách nguồn ở cuối file (mục 14), đánh số [1], [2]...

---

## 0. Tóm tắt 10 con số quan trọng nhất

| # | Thông số | Giá trị | Nguồn |
|---|---|---|---|
| 1 | Nhiệt độ mũi hàn cho thiếc chì Sn63Pb37 | 315–371 °C (600–700 °F) | Kester 44 [S][9] |
| 2 | Nhiệt độ mũi hàn khuyến nghị chung (Hakko) | bắt đầu 330–350 °C, càng thấp càng tốt | Hakko [V][5] |
| 3 | Nhiệt độ hàn THT phổ thông (SparkFun) | 325–375 °C | [V][12] |
| 4 | Nhiệt nóng chảy SAC305 (không chì) | 217–220 °C | AIM [V][10] |
| 5 | Thời gian chạm mũi hàn vào chân linh kiện nhạy nhiệt | ≤ 3 s (LED, tụ hóa, diode, thạch anh) | datasheet [V][15–18] |
| 6 | Độ điền đầy lỗ (vertical fill) Class 2/3 | ≥ 75 % | IPC-A-610E [V][2] |
| 7 | Góc thấm ướt (wetting angle) | không vượt 90° | IPC-A-610E [V][2] |
| 8 | Độ nhô chân (lead protrusion) | NASA: 0,5–2,29 mm; IPC Class 2 max 2,5 mm, Class 3 max 1,5 mm | [V][1][2] |
| 9 | Phóng đại kiểm tra (pad > 1 mm) | 1,5×–3× (trọng tài 4×); NASA: 4×–10× | [V][2][1] |
| 10 | Tg của FR-4 tiêu chuẩn | ~130 °C (trung 150, cao 170) | Eurocircuits [V][24] |

---

## 1. Mũi hàn (Soldering tips)

### 1.1 Hệ mũi hàn phổ biến

| Hệ | Cấu tạo | Đặc điểm nhiệt | Ghi chú |
|---|---|---|---|
| **Hakko T12 / T15** (FX-951, FX-950) | Mũi tích hợp sẵn gia nhiệt + cảm biến (composite tip — "heating element and sensor are integrated") | Lên nhiệt nhanh, hồi nhiệt (thermal recovery) tốt | FX-951: 75 W, 200–450 °C, ổn định ±5 °C khi chạy không tải [V][7]; lên 800 °F (~427 °C) trong ~10 s [S][8] |
| **Hakko T18** (FX-888D) | Mũi dạng ống lồng (sleeve) chụp lên lõi gia nhiệt gốm | Có khe nhiệt giữa lõi và mũi → hồi nhiệt chậm hơn mũi tích hợp | FX-888D: 70 W, 200–480 °C, ổn định ±1 °C khi không tải [V][6]; lên 350 °C ~20 s [S][28] |
| **Hakko 900M** (936/937) | Sleeve, thế hệ cũ của T18 | Chậm nhất trong nhóm; Hakko nói FX-888D lên 350 °C nhanh hơn 936 khoảng 20 s [S][28] | Dòng T18 thay thế dòng 900M [S] |
| **JBC C245 / C210 / C115** | Cartridge tích hợp, cảm biến sát mũi | JBC: "350 °C trong 2 giây"; mũi JBC sụt ~30 °C, đối thủ tới ~70 °C khi hàn 3 mối liên tiếp [V][11] | C245 = đa dụng (general purpose), C210 = chính xác, C115 = nano (01005–0805) [V][11] |
| **Weller** (LT, XT, XNT, ET, RT, XH) | Mã chữ chỉ **dòng tay hàn tương thích**, không phải hình dạng mũi; các dòng không lắp lẫn nhau | — | [V][13] |
| **Metcal** | Cartridge (SmartHeat) | — | Chisel, conical, hoof 45°/60°, knife 45°, blade 10–50 mm [V][14] |

**Bài học cho game:** mũi tích hợp (T12/JBC) có "độ trễ nhiệt" (thermal lag) nhỏ → nhiệt độ thực ở mũi bám setpoint tốt; mũi sleeve (900M/T18) khi chạm mối lớn sẽ sụt nhiệt sâu và hồi chậm hơn.

### 1.2 Hình dạng mũi và mã Hakko

Mã Hakko dùng chung logic cho T12/T15/T18/900M: chữ cái = hình dạng, số = kích thước mm (ví dụ `D16` = chisel 1,6 mm; `C4` = bevel 4 mm; `BC2` = bevel 2 mm có mặt cắt nhỏ).

| Mã | Hình dạng | Kích thước điển hình | Dùng cho | Ưu | Nhược |
|---|---|---|---|---|---|
| **B** | Côn (conical), đầu R0.5 | đầu ~Ø0,5–1 mm | Linh kiện chính xác, chân nhỏ, chạm sửa | Đa hướng, không cần xoay | Diện tích tiếp xúc nhỏ → truyền nhiệt kém cho mối lớn [V][13] |
| **I / IL / ILS** | Côn nhọn, dài | ILS: bán kính ~0,15 mm, dài làm việc ~13,5 mm [S][3] | 0201/0402, fine-pitch, khe hẹp | Với tới chỗ chật | Nhiệt khối (thermal mass) rất thấp, dễ "đói nhiệt" |
| **C** (0.5C…5C) | Vát xiên (bevel) ~45°, mặt cắt hình elip | C4: Ø4 mm, dài 11,5 mm [S][3]; T18 có 0.5C→5C [V][6] | Drag soldering SMD, chứa sẵn giọt thiếc, THT, dây | Xoay mũi để chỉnh diện tích tiếp xúc (cạnh hẹp ↔ mặt rộng) | Cần xoay đúng hướng |
| **BC** (1BC, 2BC, 3BC) | Bevel, thân côn | BC2: Ø2 mm [S][3] | Đa dụng THT + SMD | Kết hợp côn & bevel | — |
| **D** (0.8D, 1.2D, 1.6D, 2.4D, 3.2D) | Đục dẹt (chisel / screwdriver) | D16: 1,6 mm; T18 có 0.8D→3.2D [V][6] | **Lựa chọn số 1 cho THT**, header, connector, mặt đồng lớn | Mặt phẳng tiếp xúc tốt; dùng cạnh hoặc mặt | Cần định hướng mũi |
| **DL** (1.2DL, 2DL, 3.2DL) | Chisel thân dài | dài ~22,5 mm [V][6] | Với sâu | Với xa | Ít nhiệt khối hơn so với cùng đầu |
| **K** | Dao (knife) | T12-K: dài làm việc 15 mm, Ø4,7 mm [S][3] | Drag soldering hàng chân, gỡ cầu thiếc (bridge), chân hàng connector | Dùng được cạnh, mũi, mặt | Dễ chạm sang pad bên cạnh |
| **J / bent** | Côn/đục bẻ cong | — | Góc khó, hàn dưới thân linh kiện | Góc tiếp cận | Khó căn |
| **Hoof / gull-wing (JBC/Metcal "hoof")** | Mặt lõm hình móng ngựa 45°/60° | JBC C245 hoof Ø1,3–2 mm [V][11] | Drag soldering, chứa giọt thiếc | Giữ nhiều thiếc [V][14] | Kém cho THT nhỏ |
| **Minislot / Well (lõm)** | Có rãnh/hõm chứa thiếc | — | Drag soldering QFP/SOIC | Ổn định lượng thiếc | Chuyên dụng |
| **W (Heavy-duty, chỉ T12)** | Thân dày toàn bộ | vd. T12-WD12 | Mối cần nhiệt lớn | Tăng nhiệt khối [V][4] | Nặng, to |
| **Blade (Metcal/JBC)** | Lưỡi rộng 10–50 mm | — | Làm sạch pad, gỡ nhiều chân | Phủ rộng [V][14] | Chuyên dụng |

**Đặc biệt (JBC C245, chisel cho THT):** 1 × 0,5 mm; 1,2 × 0,7; 1,8 × 0,8; **2,2 × 1 mm (C245-907, "general use")**; 3,2 × 1,2; 4,8 × 1,5 HT; 6,6 × 1,8 HT [V][11]. C115 chisel 1,8 × 0,5 mm được JBC ghi rõ "Through-hole" cho kích thước nano [V][11].

### 1.3 Truyền nhiệt: vì sao "mũi to, nhiệt thấp" thắng "mũi nhọn, nhiệt cao"

1. **Diện tích tiếp xúc (contact area):** JBC: "The bigger the contact surface ... the higher the thermal transfer"; "Select the tip that has the greatest contact area" [V][11]. Weller: "use the biggest tip that fits the joint" [V][13].
2. **Nhiệt khối (thermal mass / heat capacity):** "The more mass the tip has, the more heat is accumulated and the lower is the temperature drop" [V][11]. Hakko so sánh T12-D12 và T12-DL12 (cùng đầu 1,2 mm): mũi thân to hơn sụt nhiệt ít hơn **22 °C**, rút ngắn thời gian làm việc khoảng **33 giây** trong phép thử của họ [V][4].
3. **Độ thon (geometry slimness):** JBC: mũi hiệu suất nhiệt cao làm việc nhanh hơn **tới 40 %** so với mũi thon hơn [V][11].
4. **Hệ quả:** mũi quá nhỏ "bỏ đói" mối hàn → người dùng tăng nhiệt → cháy flux, bong pad, nhưng mối vẫn xỉn/nguội [V][13]. Mũi lớn cho phép làm ở ~350 °C, giảm oxy hóa và tăng tuổi thọ mũi [V][4][11].
5. **Không chì cần nóng hơn:** chênh khoảng 30–40 °C so với có chì, nhưng "Thermal mass beats temperature" [V][13].

### 1.4 Quy tắc chọn kích thước mũi theo pad

- **Quy tắc 60 %** (Metcal): chiều rộng chisel ≈ **60 % kích thước pad** [V][14]. Ví dụ: pad 2 mm → chisel ~1,2 mm; pad 3 mm → chisel ~1,8 mm [S][14b].
- Hakko: chọn đầu mũi theo kích thước chi tiết, rồi trong các mũi cùng đầu chọn mũi có **nhiệt khối lớn nhất**; chỉ thu nhỏ khi buộc phải (fine-pitch) [V][4].
- Quá to → chạm pad bên cạnh, bắc cầu (bridge), truyền quá nhiều nhiệt; quá nhỏ → truyền nhiệt chậm [S][14b].

Gợi ý thực hành THT (pad tròn Ø1,6–2,0 mm, chân 0,6–0,8 mm): **D16 hoặc BC2/C2** là hợp lý; pad nối mass/ground plane hoặc jack DC: **D24/D32/C3/C4**.

---

## 2. Thay mũi và chăm sóc mũi (Tip changing & care)

### 2.1 Thay mũi T12 (cartridge, gia nhiệt tích hợp)

1. Tắt máy hoặc để tay hàn vào giá; nếu phải thay khi nóng, **dùng miếng chịu nhiệt (heat-resistant pad)** đi kèm FX-951 (P/N B2300) [V][7].
2. Kẹp phần đầu mũi bằng pad chịu nhiệt, rút thẳng mũi ra khỏi tay cầm; không giữ phần nóng quá lâu, kể cả có pad [S][8b].
3. Cắm mũi mới: giữ phần đầu bằng pad, đẩy đến khi chạm cữ [S][8b].
4. Đặt mũi nóng vào khay mũi (tip tray, B2756) [V][7] — không đặt lên bàn.

### 2.2 Thay mũi 900M / T18 (sleeve)

1. **Tắt nguồn; để mũi nguội về nhiệt độ phòng** [S][29].
2. Vặn đai ốc giữ (nipple / enclosure nut) ngược chiều kim đồng hồ ~90°, tháo ống bọc, rút mũi [S][29].
3. Lắp mũi mới, vặn đai ~90° theo chiều kim đồng hồ [S][29].
4. Sau thay mũi/gia nhiệt có thể cần hiệu chỉnh nhiệt (temperature adjustment) [V][6].
5. Mũi sleeve có thể bị "kẹt" (tip seizing) nếu lâu không tháo — Hakko có bài riêng về cách chống kẹt [V][5].

### 2.3 Mạ thiếc mũi mới (tinning) và quy trình hằng ngày

- Mũi mới: bật máy, để trên giá đến khi nóng, làm sạch, rồi phủ thiếc lên toàn bộ vùng mạ sẵn (pre-tinned area) [V][5].
- Trong khi hàn: đặt nhiệt **thấp nhất có thể**, Hakko gợi ý bắt đầu **330–350 °C**; giữ vùng mạ luôn được thiếc thấm ướt; **tắt máy nếu nghỉ quá 5 phút** [V][5].
- Sau khi hàn: phủ một lớp thiếc lên mũi rồi mới đặt vào giá — lớp này chống oxy hóa khi cất [V][5]. Lớp thiếc tạo hàng rào giữa mũi và môi trường, giảm mạnh tốc độ oxy hóa [S][30].
- Bảo dưỡng định kỳ FX-888D: đặt **250 °C**, lau mũi, nếu có oxit đen thì bôi thiếc có flux rồi lau lại, lặp đến hết, cuối cùng phủ thiếc; mũi biến dạng/mòn nặng thì thay [V][6].

### 2.4 Bọt biển ướt (wet sponge) vs bùi nhùi đồng thau (brass wool)

| | Bọt biển ướt | Bùi nhùi đồng (brass wool / wire cleaner) |
|---|---|---|
| Ưu | Đi kèm máy, lau sạch rộng [V][6] | Giữ lại lớp thiếc bảo vệ trên mũi [V][5]; không làm sụt nhiệt |
| Nhược | Gây sốc nhiệt lặp lại (thermal cycling) → mỏi kim loại [S][30]; SparkFun khuyên dùng brass để tránh nứt [V][12] | Phải vệ sinh định kỳ |
| Lưu ý | Chỉ làm ẩm bằng nước (JBC: nước cất) [V][11]; không để khô | Đừng chọc quá mạnh |

Hakko: **không lau mũi khi để iron trên giá** (lau rồi để → mũi trần bị oxy hóa) [V][5].

### 2.5 Oxy hóa, mũi đen, mất thấm ướt (de-wetting)

- Mũi oxy hóa: màu tối, đẩy thiếc thay vì thấm ướt, truyền nhiệt kém [V][5]. JBC: "An oxidized soldering iron does neither wet nor transfer heat well (dewetting)" [V][11].
- Thiếc không chì oxy hóa mũi **nhanh gấp 4–5 lần** thiếc eutectic; điểm chảy cao hơn ~30 °C dễ khiến người dùng tăng nhiệt quá mức [V][5b].
- Xử lý: chất làm sạch/kích hoạt mũi (tip tinner/activator, vd. Hakko FS-100), máy đánh bóng mũi FT-700 cho trường hợp nặng [V][5b].
- **Không dùng giũa, giấy nhám**: mũi có lớp sắt mạ (iron plating) trên lõi đồng; lớp sắt mòn → mũi bị khoét rỗng. JBC: "Do not use mechanical or chemical means to clean the tip" (ngoài phương pháp của hãng) [V][11]. Hakko cấm gõ mũi vào vật cứng để rũ thiếc [V][6].

### 2.6 Yếu tố tuổi thọ mũi (lifespan)

Theo JBC [V][11]:
- **Nhiệt độ làm việc:** càng cao càng oxy hóa/ăn mòn; tuổi thọ tăng theo hàm mũ khi giảm nhiệt (biểu đồ JBC lấy ~350 °C làm vùng khuyến nghị, 400–450 °C cho tuổi thọ thấp hơn rõ rệt).
- **Sleep mode** (hạ nhiệt dưới điểm chảy thiếc khi đặt lên giá) + **Hibernation** (cắt nguồn sau thời gian chờ, mặc định 10 phút) → tuổi thọ mũi **tới 5 lần**.
- **Flux & hợp kim:** flux hoạt tính mạnh gây ăn mòn; IPC khuyến nghị flux ROL, REL, ORL; dây thiếc nhỏ có thể không đủ flux → bổ sung flux ngoài.
- **Lực ấn:** ấn mạnh có thể nứt mũi/lớp mạ; không dùng mũi như tua vít.
- **Độ dày lớp mạ sắt:** mòn lớp sắt → mũi rỗng.
- Hakko: nhiệt **> 850 °F (~454 °C)** làm tăng mạnh oxit sắt, nguyên nhân chính gây mất mạ thiếc (detinning) [S][30b].
- FX-951 tự tắt sau **30 phút** [V][7].

---

## 3. Nhiệt độ và thời gian hàn

### 3.1 Hợp kim thiếc

| Hợp kim | Thành phần | Điểm chảy | Nhiệt mũi điển hình |
|---|---|---|---|
| **Sn63Pb37** | 63 % Sn, 37 % Pb | eutectic **183 °C** (chảy ở một điểm) [S][9b] | 315–371 °C [S][9] |
| **Sn60Pb40** | 60/40 | ~183–190 °C (dải bán lỏng, pasty) [S] | tương tự 63/37 |
| **SAC305** | 96,5 Sn / 3 Ag / 0,5 Cu | **217–220 °C** [V][10] | thường 350–400 °C; cao hơn có chì 30–40 °C [V][13] |

Sn63/37 không có vùng bán lỏng → ít bị "disturbed joint" hơn 60/40 khi rung lúc nguội (giải thích vật lý, [TK]).

### 3.2 Nhiệt độ đặt máy (setpoint)

- SparkFun: **325–375 °C** cho hàn thường; ~720 °F (~382 °C) cho ground plane và lỗ lớn [V][12].
- Hakko: **330–350 °C** khởi điểm, đặt thấp nhất có thể [V][5].
- Kester 44 / Sn63Pb37: **315–371 °C** [S][9].
- JBC: với mũi tốt có thể làm việc ở ~**350 °C** [V][11].
- SparkFun lưu ý phần lớn flux chịu tới ~350 °C; cao hơn flux phân hủy, hóa đen [S][12].
- NASA yêu cầu mỏ hàn có điều khiển nhiệt, sai số ±5,5 °C (±10 °F); cấm dùng súng hàn (soldering gun) [V][1].

### 3.3 Thời gian dừng (dwell time) cho mối THT

- Linh kiện nhạy nhiệt: **≤ 3 s** mỗi mối (xem mục 4).
- Mối THT thông thường (pad Ø1,6–2 mm, chân 0,6 mm, mũi D16 ở ~340 °C): **2–4 s** là điển hình [TK, dựa trên các giới hạn datasheet 3–5 s].
- Mối nối ground plane/đồng lớn: có thể cần 4–8 s **nếu dùng mũi to**; nếu vượt quá ~5 s mà thiếc chưa chảy tốt → đổi mũi lớn hơn chứ không tăng nhiệt bừa [V][4][13].
- IPC-A-610 cho phép Class 2 điền lỗ chỉ **50 %** (hoặc 1,19 mm) khi lỗ nối vào lớp tản nhiệt (thermal/ground plane) — thừa nhận đây là trường hợp khó [V][2].

### 3.4 Gia nhiệt sơ bộ (preheat) và hồi nhiệt (recovery)

- Murata MLCC (rework bằng mỏ): preheat **150 °C trong 60 s**, mỏ ≤ **350 °C**, ≤ **30 W**, đầu mũi ≤ **Ø3 mm**, ≤ **5 s**; giữ chênh lệch nhiệt ΔT < ~190 °C giữa linh kiện và mũi [S][19].
- JBC: preheat chip > 150 °C để giảm gradient nhiệt [S][20].
- NASA: PCB hút ẩm (demoisturize) ở 93 °C ±5,5 °C trong ≥ 4 h (PWA) hoặc ≥ 2 h (PCB trần) [V][1].
- Hồi nhiệt: khi chạm mối lạnh, nhiệt mũi sụt; JBC đo sụt ~30 °C (JBC) vs ~70 °C (đối thủ) qua 3 mối liên tiếp [V][11]; Hakko đo chênh 22 °C giữa mũi thường và mũi to [V][4].

### 3.5 Khối lượng nhiệt của mối (thermal load)

Thời gian cần để mối đạt nhiệt tăng theo: diện tích đồng nối với pad (trace rộng, ground plane, nhiều lớp), đường kính chân (chân nguồn 1–1,3 mm), độ dày PCB, và linh kiện có thân kim loại (jack, tản nhiệt). Thứ tự xử lý: **tăng kích thước mũi → thêm flux → preheat → cuối cùng mới tăng nhiệt** [V][4][11][13].

---

## 4. Giới hạn nhiệt của linh kiện và hư hỏng

### 4.1 Bảng giới hạn

| Linh kiện | Giới hạn hàn tay | Nguồn |
|---|---|---|
| **LED 3/5 mm thường** | ≤ 300 °C (thiếc chì) / ≤ 350 °C (không chì), ≤ **3 s**, mỏ ≤ 30 W; LED xanh dương/xanh lá-lam/trắng: ≤ **280 °C** | Kingbright [V][15] |
| LED (một số datasheet) | ≥ 3 mm cách đáy thấu kính epoxy | [S][15b] |
| **Tụ hóa nhôm chân cắm** (Chemi-con) | **380 ± 10 °C, 3 ± 0,5 s**; hàn sóng 260 ± 5 °C ≤ 10 ± 1 s; preheat 150 °C ≤ 120 s | [V][16] |
| Tụ hóa (Nichicon) | 350 ± 10 °C, 3 +1/−0 s (hoặc 380 °C 3 s) | [S][16b] |
| **Diode chân cắm** (ROHM) | < **3 s**, **1 lần**; thân chịu < 400 °C (hầu hết gói) hoặc < 350 °C (gói MSR); nhúng 245–265 °C < 10 s | [V][17] |
| **Thạch anh HC-49** | 350 ± 10 °C, 3 ± 1 s; thử chịu nhiệt 260 °C 10 s | [S][18] |
| **MLCC** | xem 3.4: preheat 150 °C, ≤ 350 °C, ≤ 5 s, không chạm mũi trực tiếp vào thân | [S][19][20] |
| **IC DIP** (vd. NE555 gói P) | chân 260 °C trong 10 s ở 1,6 mm từ thân | TI [S][21] |
| Linh kiện SMD (reflow) | J-STD-020: đỉnh 260 °C (gói < 1,6 mm), 245–250 °C cho gói dày/khối lớn; ≤ 30 s quanh đỉnh | [S][22] |
| **Connector JST XH** | vỏ PA66 (nylon), UL94V-0; điều kiện hàn có trong tài liệu JST T-1-2187 | [S][23] |
| Header PBT | 260 °C / 10 s (quá trình) | [S][23b] |
| **PCB FR-4** | Tg ~130 °C (tiêu chuẩn), 150 (trung), 170 (cao); Td (nhiệt phân lớp) ~350 °C | Eurocircuits [V][24] |

### 4.2 Hậu quả khi vượt giới hạn và dấu hiệu nhìn thấy

| Đối tượng | Cơ chế hư hỏng | Dấu hiệu nhìn thấy (cho game) |
|---|---|---|
| **LED** | Ứng suất chân khi > 85 °C làm hỏng dây bond bên trong [V][15]; thấu kính biến dạng, LED hỏng hẳn [S][15b] | Epoxy ngả vàng/đục quanh chân, LED mờ/nhấp nháy/chết; chân lỏng |
| **Tụ hóa** | Điện phân sôi, ứng suất gioăng (seal), vỏ co nhiệt co rút [TK dựa trên cảnh báo hãng] | Ống bọc nhựa co/rách, đáy cao su phồng, vạch an toàn trên nắp phồng, rò dịch |
| **MLCC** | Sốc nhiệt khi mũi chạm thẳng vào thân → nứt [S][20] | Vết nứt nhỏ chỉ thấy dưới kính (≥10×); có thể ngắn mạch sau này |
| **Connector nhựa / header / đế IC** | PA66/PBT mềm ra; chân xô lệch | Nhựa chảy/bóng, chân nghiêng, lỗ cắm méo |
| **IC** | Quá nhiệt die/dây bond, nứt vỏ | Thường không thấy — lỗi chức năng; vỏ có thể đổi màu |
| **Thạch anh** | Lệch tần số, nứt tinh thể [TK] | Không thấy; mạch không dao động/sai tần |
| **PCB – pad/đường mạch** | Mất bám dính đồng | Pad nhấc lên (lifted land), đường mạch phồng; NASA/IPC: lỗi [V][1][2] |
| **PCB – nền FR-4** | Trên Tg: giãn trục Z tăng từ 50–70 lên 250–300 ppm/°C, nứt via, phân lớp [S][24b] | Đốm trắng (measling), phồng (blister), quầng sáng (haloing), cháy nâu/đen (burn) [V][1] |
| **Flux** | Cháy thành than | Cặn nâu/đen cứng quanh mối, cản thấm ướt [V][2b Adafruit] |
| **Mối hàn** | Lớp liên kim (intermetallic) Cu6Sn5/Cu3Sn dày lên theo nhiệt độ×thời gian, giòn [S][25] | Mối xỉn, sần, "phấn" (chalky), rỗ — NASA định nghĩa "Overheated joint" [V][1] |
| **Văng thiếc (spatter)** | Hơi ẩm/flux sôi đột ngột | Hạt thiếc nhỏ quanh mối; NASA coi là lỗi [V][1] |

---

## 5. Chất lượng mối hàn THT theo IPC-A-610 (và NASA-STD-8739.3)

### 5.1 Ba cấp (Class)
- **Class 1:** sản phẩm điện tử thông dụng; **Class 2:** sản phẩm chuyên dụng (cần độ tin cậy, gián đoạn không nghiêm trọng); **Class 3:** hiệu năng cao/không được hỏng (y tế, hàng không). [S][26]

### 5.2 Bảng tiêu chí lỗ mạ xuyên (IPC-A-610E, Table 7-4) [V][2]

| Tiêu chí | Class 1 | Class 2 | Class 3 |
|---|---|---|---|
| A. Điền đầy dọc (vertical fill) | Không quy định | **75 %** | **75 %** |
| B. Thấm ướt quanh chân & thành lỗ ở **mặt đích** (primary/component side) | Không quy định | **180°** | **270°** |
| C. % pad mặt đích phủ thiếc | 0 | 0 | 0 |
| D. Fillet & thấm ướt quanh chân ở **mặt nguồn** (secondary/solder side) | **270°** | **270°** | **330°** |
| E. % pad mặt nguồn phủ thiếc | 75 % | 75 % | 75 % |

- Mục tiêu (target): **100 %** điền đầy; chấp nhận tối thiểu 75 %, tổng lõm 2 mặt ≤ 25 % [V][2].
- Ngoại lệ Class 2: 50 % (hoặc 1,19 mm) nếu lỗ nối lớp tản nhiệt, chân thấy được và fillet 360° ở mặt nguồn [V][2].
- **Góc thấm ướt (wetting angle) không vượt 90°** (trừ khi thiếc tràn qua mép pad/solder mask) [V][2].
- Thiếc không chì có thể sần/xỉn hơn và góc tiếp xúc lớn hơn — vẫn chấp nhận [V][2].
- NASA: bề mặt mối **nhẵn, không rỗ, không bị xáo động**, độ bóng từ satin đến sáng; fillet lõm (concave) quanh toàn chu vi; **đường viền chân (lead contour) phải nhìn thấy** [V][1].

### 5.3 Độ nhô chân (lead protrusion)

| Chuẩn | Min | Max |
|---|---|---|
| NASA-STD-8739.3 (thẳng xuyên) | **0,5 mm** | **2,29 mm**; được bẻ nghiêng ≤ 30° để giữ linh kiện [V][1] |
| IPC-A-610E Class 1 | đầu chân thấy được trong thiếc | không nguy cơ chập [V][2] |
| IPC-A-610E Class 2 | như trên | **2,5 mm** [V][2] |
| IPC-A-610E Class 3 | như trên | **1,5 mm** [V][2] |

Chân kẹp gập (clinched): dài ≥ ½ kích thước pad lớn nhất hoặc 0,78 mm; gập 75–90° [V][1].

### 5.4 Uốn chân (lead forming) và khoảng cách thân

- Uốn chân cách thân/seal tối thiểu **2 lần đường kính chân** (chân tròn) hoặc 0,5 mm (chân dẹt) [V][1].
- Bán kính uốn trong tối thiểu (IPC Table 7-1): chân < 0,8 mm → 1×D; 0,8–1,2 mm → 1,5×D; > 1,2 mm → 2×D [V][2].
- Linh kiện radial: hở 0,5–1,27 mm so với mặt PCB (NASA) [V][1]. Khe hở thân-pad (IPC Table 7-2): C min 0,1 / 0,4 / 0,8 mm; C max 6 / 3 / 1,5 mm cho Class 1/2/3 [V][2].
- Chân ≥ 1,27 mm hoặc chân tôi cứng (tempered) **không cắt bằng kìm cắt chéo gây sốc** [V][1].

### 5.5 Danh mục lỗi: nguyên nhân & cách sửa

| Lỗi (EN) | Nhận dạng | Nguyên nhân | Sửa | Nguồn |
|---|---|---|---|---|
| **Cold joint** | Xám, rỗ, sần, thấm ướt kém | Thiếu nhiệt, bề mặt bẩn, tạp chất | Gia nhiệt lại đến khi chảy, thêm flux | [V][1][2][2b] |
| **Rosin joint** | Giống cold joint + flux kẹt giữa thiếc và kim loại | Thiếu nhiệt/thời gian để flux nổi lên | Thêm flux, gia nhiệt đủ | [V][1][2] |
| **Disturbed joint** | Mờ, "đóng băng" (frosted), có vân ứng suất | Chân/linh kiện bị xê dịch khi thiếc đang đông | Gia nhiệt lại, để nguội yên | [V][1][2][2b] |
| **Fractured joint** | Nứt | Bị lực sau khi đông | Hàn lại | [V][1] |
| **Overheated joint** | Sần, xỉn, như phấn, rỗ; flux cháy | Quá nhiệt/quá lâu | Làm sạch, hàn lại nhanh với mũi phù hợp | [V][1][2b] |
| **Insufficient / starved** | Không phủ hết, fillet thiếu | Ít thiếc | Thêm thiếc | [V][1][2b] |
| **Excess / balled** | Cục tròn, che mất đường viền chân, góc > 90° | Nhiều thiếc | Rút bớt bằng mũi/bấc/hút | [V][1][2b] |
| **Bridge** | Thiếc nối 2 dây dẫn không chung | Thừa thiếc, mũi quá to | Kéo mũi giữa 2 mối, dùng bấc | [V][2][2b] |
| **Icicle / spike / projection** | Gai nhọn | Flux cạn, rút mũi chậm/nguội | Thêm flux, chạm lại | [V][1][2] |
| **Pinhole / blowhole / void** | Lỗ nhỏ trên bề mặt | Khí/ẩm từ lỗ mạ, flux sôi | Hút ẩm PCB, hàn lại | [V][1][2] |
| **Dewetting** | Thiếc co lại thành gò, để lại màng mỏng | Bề mặt nhiễm bẩn/oxy hóa | Làm sạch, flux | [V][1][2] |
| **Non-wetting** | Thiếc không bám, lộ kim loại nền | Oxy hóa nặng, thiếu flux | Làm sạch cơ học/hóa học, flux | [V][1] |
| **Lifted pad** | Pad tách khỏi nền | Quá nhiệt/lực khi tháo hàn | Sửa bằng dây nối (NASA cấm sửa) | [V][2b][1] |
| **Solder balls / splash** | Hạt thiếc rời | Văng | Gỡ bằng nhíp; phải kiểm tra **không phóng đại** | [V][2][2b] |
| **Untrimmed lead** | Chân dài | Chưa cắt | Cắt sát đỉnh mối | [V][2b] |

---

## 6. Kỹ thuật hàn THT từng bước

1. **Chuẩn bị:** làm sạch pad/chân (IPA nếu bẩn), mũi sạch và được tinning.
2. **Uốn chân & cắm linh kiện** theo mục 5.4; giữ linh kiện bằng cách bẻ nghiêng chân ≤ 30° [V][1] hoặc băng dính/kẹp.
3. **Thứ tự lắp:** linh kiện thấp trước, cao sau (điện trở/diode → IC socket → tụ gốm → transistor/LED → tụ hóa → connector/jack) — bo lật úp vẫn nằm phẳng [TK, thực hành phổ biến].
4. **Đặt mũi** sao cho **chạm đồng thời pad và chân**, dùng **mặt bên (sweet spot)** của mũi chứ không phải đầu nhọn [V][12]; có thể chấm một chút thiếc lên mũi làm "cầu nhiệt" (heat bridge).
5. **Đưa thiếc vào mối** (phía đối diện mũi), **không đưa vào mũi** [V][12]; thiếc chảy lan quanh chân và lên thành lỗ.
6. **Rút thiếc trước, rút mũi sau** [V][12].
7. **Không di chuyển** cho đến khi mối đông (vài giây); không thổi khí nén làm nguội (NASA cấm) [V][1].
8. **Cắt chân:** bằng kìm cắt sát (flush cutter) sau khi mối đông, cắt ngay đỉnh mối [V][2b][12]. Cắt trước khi hàn giúp không làm nứt mối, nhưng cắt sau dễ kiểm soát độ nhô — chấp nhận cả hai miễn đạt mục 5.3 [TK].
9. **Mối đẹp** trông như "núi lửa" hoặc kẹo Hershey's Kiss, không phải cục tròn [V][12].
10. **Làm sạch flux:** flux tan trong nước → nước khử ion nóng; no-clean có thể để lại, nếu muốn làm sạch dùng **IPA** và bàn chải; làm khô bằng khí/giấy không xơ [V][12]. NASA: làm sạch trong **½ giờ** sau khi hàn; **không dùng siêu âm** cho bo có linh kiện [V][1].
11. **Kẹp tản nhiệt (heat sink / thermal shunt):** kẹp cá sấu (đồng dẫn nhiệt ~10× thép) lên chân giữa thân và mối với LED, transistor, diode [S][27]; NASA yêu cầu dùng thermal shunt khi nhiệt có thể làm hỏng linh kiện [V][1].

---

## 7. Dây thiếc (Solder wire), flux và an toàn

### 7.1 Đường kính dây và công việc

| Ø dây | Phù hợp | Mũi đi kèm |
|---|---|---|
| 0,3 mm | 0402/0603, fine-pitch | I/ILS, B, C1 |
| 0,5 mm (0,020") | SMD, THT nhỏ, LED, header | B, BC1, D12, D16 |
| 0,8 mm (0,031") | **THT tiêu chuẩn** (Kester khuyến nghị kích thước này cho đa số ứng dụng) [S][9] | D16, D24, C2–C3 |
| 1,0–1,2 mm | dây điện, jack, mối lớn | D24, D32, C4 |

SparkFun bán 0,020" và 0,031" [V][12]. Kester có từ 0,25 đến 6,0 mm [S][9]. Gợi ý ghép mũi [TK].

### 7.2 Lõi flux

- Kester 44: core 66 = **3,3 %** flux theo khối lượng; core 58 = 2,2 %; core 50 = 1,1 %; phân loại **ROM1** (J-STD-004) [S][9].
- J-STD-004: 2 chữ đầu = vật liệu (RO rosin, RE resin, OR organic, IN inorganic); chữ 3 = hoạt tính L/M/H; số cuối = halide (0 = < 0,05 %) [S][31].
- Hệ cũ: **R** (rosin thuần) < **RMA** (hoạt tính nhẹ) < **RA** (hoạt tính). NASA chỉ cho R/RMA; RA cần phê duyệt [V][1]. Flux tan trong nước (water-soluble) có cặn ăn mòn, phải rửa [S][31]. IPC khuyến nghị ROL/REL/ORL [V][11].

### 7.3 An toàn

- **Chì:** đường phơi nhiễm chính là **nuốt** (bụi chì trên tay), không phải hơi — chì chỉ bay hơi ở > 1600 °C; rửa tay xà phòng sau khi hàn, không ăn uống trong khu vực hàn [S][32].
- **Khói flux nhựa thông (colophony / rosin):** HSE (Anh): là một nguyên nhân hàng đầu gây **hen nghề nghiệp**, khi đã phát triển đầy đủ là **vĩnh viễn**; tránh quá nhiệt mỏ, đưa đầu tránh luồng khói, dùng hút khói (booth tốt nhất; hút tại mũi cần vệ sinh; hộp để bàn kém trừ khi có HEPA) [V][33]. Giới hạn phơi nhiễm (WEL) 0,05 mg/m³ (8 h), STEL 0,15 mg/m³ [S][33b]. SparkFun: khói nhiều = nhiệt quá cao [V][12].
- **Mắt:** đeo kính bảo hộ khi cắt chân và vì thiếc/flux có thể văng [TK; NASA coi văng là lỗi [V][1]].
- **Bỏng:** luôn để mỏ trên giá, tắt khi không dùng; báo người xung quanh mỏ đang nóng [V][6].

---

## 8. Tháo hàn (Desoldering)

| Phương pháp | Cách dùng | Rủi ro |
|---|---|---|
| **Bấc đồng (wick/braid)** | Đặt bấc lên mối, ấn mũi lên bấc; thiếc bị hút vào bấc theo mao dẫn. Chemtronics Soder-Wick: #2 = 1,5 mm (vàng), #3 = 2,0 mm (xanh lá), #4 = 2,8 mm (xanh dương); còn có 0,8 / 3,7 / 5,3 mm [S][34]. Chọn bấc ≈ bề rộng pad | Kéo bấc khi thiếc đã đông → **xé pad**; giữ quá lâu → quá nhiệt |
| **Ống hút thiếc (pump)** | Làm chảy, đặt đầu hút, bấm | Va đập, rút không hết với lỗ nhỏ |
| **Khí nóng (hot air)** | Gia nhiệt diện rộng | Thổi bay linh kiện bên cạnh, làm chảy nhựa |
| **Thêm thiếc mới** | Thêm thiếc có flux (thường thiếc chì, điểm chảy thấp) vào mối cũ/không chì để trộn, chảy dễ hơn [TK, thực hành phổ biến] | — |
| **Mũi chuyên dụng** | Blade (Metcal 10–50 mm) gỡ nhiều chân [V][14]; mũi K gỡ cầu thiếc [S][3] | — |

Quy tắc chọn kích thước mũi khi tháo hàn: ~60 % pad [S][14b]. Adafruit: lifted pad thường do tháo hàn mạnh tay/làm đi làm lại [V][2b].

---

## 9. Trạm hàn (Soldering station)

| Tính năng | Giá trị tham khảo | Nguồn |
|---|---|---|
| Điều khiển nhiệt | FX-888D: 200–480 °C, ±1 °C không tải; FX-951: 200–450 °C, ±5 °C | [V][6][7] |
| NASA | điều nhiệt ±5,5 °C | [V][1] |
| Công suất | FX-888D 70 W (tay 65 W, 26 V AC); FX-951 75 W (24 V) | [V][6][7] |
| Lên nhiệt | T12/FX-951 ~10 s tới ~427 °C [S][8]; JBC 350 °C trong 2 s [V][11]; FX-888D ~20 s tới 350 °C [S][28]; 936/900M chậm hơn ~20 s [S][28] | |
| ESD | Tip-to-ground < **2 Ω**, điện áp rò < **2 mV** (FX-8801); vỏ nhựa dẫn điện, phải nối đất | [V][6] |
| Hiệu chỉnh (calibration) | FX-888D có "adjustment mode"; đo bằng nhiệt kế mũi FG-100; cần hiệu chỉnh lại sau khi thay mũi/gia nhiệt | [V][6] |
| Sleep / tự tắt | FX-951 tự tắt 30 phút; JBC sleep (dưới điểm chảy) + hibernation (10 phút mặc định) | [V][7][11] |
| Cảnh báo nhiệt thấp, khóa cài đặt | FX-951 có báo nhiệt thấp, thẻ khóa; FX-888D có mật khẩu 3 mức | [V][7][6] |
| Vòng đeo ESD | điện trở 1 MΩ trong dây; hệ thống người–đất < 35 MΩ (ANSI/ESD S20.20) | [S][35] |

---

## 10. Kiểm tra và hàn dưới kính phóng đại ("làm như thợ thật")

### 10.1 Bảng phóng đại kiểm tra IPC-A-610E (Table 1-2) [V][2]

| Bề rộng/đường kính pad (land) | Dải kiểm tra | Phóng đại trọng tài (max referee) |
|---|---|---|
| > 1,0 mm | **1,5× – 3×** | **4×** |
| > 0,5 – ≤ 1,0 mm | **3× – 7,5×** | **10×** |
| ≥ 0,25 – ≤ 0,5 mm | **7,5× – 10×** | **20×** |
| < 0,25 mm | **20×** | **40×** |

- Dung sai phóng đại ±15 %. **Trọng tài (referee)** = mức dùng để xác nhận lại mối bị loại ở mức kiểm tra. Bo có nhiều cỡ pad có thể dùng mức cao nhất cho toàn bo [V][2].
- Văng thiếc kiểm tra **không phóng đại**; đánh dấu/phủ (conformal coating) nếu phóng đại thì ≤ 4× [V][2].
- Các bản IPC-A-610 mới hơn (F/G/H/J) có thể điều chỉnh dải; một số tài liệu nêu mức 1,75× cho pad > 1 mm — tương đương kính lúp đèn 3 diopter [S][36]. Khi cần chính xác tuyệt đối, tra bản IPC hiện hành.
- **NASA-STD-8739.3:** kiểm tra bằng phóng đại **4×–10×**, tăng thêm khi nghi lỗi; quang học phải đúng màu, tỉ lệ, đủ phân giải; ánh sáng **không bóng** (shadowless) [V][1].
- **Ánh sáng:** IPC ≥ **1000 lm/m²** (~93 foot-candle), nhiệt màu **3000–5000 K** [V][2]; NASA ≥ **1077 lm/m²** (100 fc) [V][1].

### 10.2 Các loại kính

| Loại | Thông số điển hình | Ưu | Nhược |
|---|---|---|---|
| **Kính lúp đèn (magnifier lamp)** | Phóng đại = diopter/4 + 1 → **3 diopter = 1,75×**, **5 diopter = 2,25×** [S][36] | Rẻ, rộng, đủ cho pad > 1 mm | Không đủ cho fine-pitch; phóng đại cao → khoảng làm việc ngắn, thị trường hẹp [S][36] |
| **Kính đeo đầu (headband visor)** | ~2,5×, khoảng làm việc ~7 inch (~18 cm) | Phiên ngắn 10–15 phút | Mỏi cổ khi lâu [V][37] |
| **Kính hiển vi soi nổi (stereo zoom)** | **7×–45×**, vật kính zoom **0,7×–4,5×** (tỉ lệ 6,4:1), thị kính **10×/20 mm** (tùy chọn 15×, 20×), **khoảng làm việc 100 mm**, **khoảng đồng tử 50–75 mm**, **diopter kép** trên 2 ống, **đèn vòng 48 LED**, chân **boom** xoay 360° [V][38] | **Cảm nhận độ sâu 3D** — bắt buộc khi hàn | Đắt, cần học chỉnh |
| Thấu kính Barlow | **0,5×**: gấp đôi khoảng làm việc (~200 mm), giảm nửa phóng đại (→ 3,5×–22,5×); 2×: ngược lại [S][38b] | 0,5× rất phổ biến để có chỗ đưa mỏ hàn [V][37] | — |
| **Kính hiển vi số / USB** | Camera + màn hình | Chụp ảnh tài liệu, nhiều người cùng xem | **Không có chiều sâu**, **độ trễ khung hình**, bóng mờ; dải động kém với mối bóng; chủ yếu để chụp, không để hàn [V][37][S][39] |
| Trinocular | Stereo + cổng camera | Hàn bằng mắt, chụp bằng camera | Đắt nhất |

### 10.3 Cách chỉnh kính stereo (quy trình chuẩn)

1. **Khoảng đồng tử (interpupillary distance):** kéo 2 ống đến khi thấy **một** vòng tròn (50–75 mm) [V][38].
2. **Parfocal / diopter:** zoom **lên mức cao nhất**, lấy nét bằng núm lấy nét (focus knob); zoom **xuống thấp nhất**, chỉnh **vòng diopter** trên từng thị kính cho nét với từng mắt; quay lại cao → vẫn nét suốt dải zoom [TK, quy trình phổ biến; kính có "dual diopters" [V][38]].
3. **Khoảng làm việc:** bo đặt cách vật kính ~100 mm (hoặc ~200 mm với Barlow 0,5×) [V][38][S][38b].
4. **Đèn vòng:** chỉnh độ sáng tránh chói trên thiếc bóng; ánh sáng không bóng [V][1].

### 10.4 Tư thế và thói quen của thợ chuyên nghiệp

- **Ngồi**, kính đặt nghiêng ~10° để giảm mỏi cổ; nâng bo lên gần tầm mắt (EEVblog: kê cao ~12 inch) [V][37].
- **Tựa cổ tay/khuỷu tay** lên bàn hoặc gối tì để triệt rung; cầm mỏ như **cầm bút** (pen grip), cầm thiếc tay kia [TK].
- Dưới kính 10×, rung tay hiện rõ, nhưng sau thời gian luyện tập rung "giảm khoảng 10 lần" [S][39].
- Đưa mũi vào từ ngoài thị trường, hạ dần đến khi thấy bóng/phản chiếu mũi trên pad (dấu hiệu độ sâu); nhìn bằng **cả hai mắt** — nhìn một mắt mất cảm giác khoảng cách mũi–PCB [S][39].
- **ESD:** đeo vòng tay nối đất qua 1 MΩ, thảm ESD, trạm hàn nối đất [S][35][V][6]; NASA yêu cầu chương trình kiểm soát ESD [V][1].
- Ánh sáng ≥ 1000 lm/m², 3000–5000 K [V][2].

### 10.5 Checklist kiểm tra từng mối (dưới kính)

1. **Thấm ướt (wetting):** thiếc bám liền vào chân và pad, góc < 90°, không có ranh giới co rút (dewetting) [V][2].
2. **Hình fillet:** lõm (concave), nhẵn, bóng satin–sáng; **thấy đường viền chân** [V][1].
3. **Độ phủ quanh chu vi:** mặt hàn ≥ 270° (Class 1/2) / 330° (Class 3); điền lỗ ≥ 75 % (nhìn từ mặt linh kiện) [V][2].
4. **Độ nhô chân:** thấy đầu chân, ≤ 2,5 mm (Class 2) / 1,5 mm (Class 3) [V][2].
5. **Cầu thiếc, gai, hạt thiếc rời** [V][2].
6. **Vết nứt, rỗ, lỗ khí** [V][1][2].
7. **Cặn flux** (no-clean có thể chấp nhận; rosin cần làm sạch theo yêu cầu) [V][1].
8. **Pad nhấc, cháy nền, measling** [V][1].
9. **Linh kiện:** đúng cực tính, đúng vị trí, không hư thân [V][1].

### 10.6 Quy trình sửa (rework flow)

Phát hiện → đánh dấu (sticker/bút) → xác định nguyên nhân → thêm flux → gia nhiệt lại/rút thiếc/thêm thiếc → làm sạch → **kiểm tra lại ở cùng mức phóng đại** → ghi chép. NASA: sửa phải theo cùng yêu cầu hàn gốc; không sửa đường mạch hỏng (với sản phẩm NASA) [V][1].

---

## 11. Quy trình thợ chuyên nghiệp: lắp ráp một bo THT từ đầu đến cuối

| Bước | Việc làm | Số liệu / chuẩn |
|---|---|---|
| 1. Chuẩn bị bàn | Đèn ≥ 1000 lm/m²; hút khói; thảm + vòng ESD; trạm hàn nối đất | [V][2][33][S][35] |
| 2. Hồ sơ | Sơ đồ, BOM, layout, hướng dẫn (soldering program) | NASA yêu cầu tài liệu hóa [V][1] |
| 3. Kiểm tra bo trần | Xước, pad oxy hóa; hút ẩm nếu cần (93 °C ≥ 2 h cho PCB trần) | [V][1] |
| 4. Kitting | Xếp linh kiện theo BOM vào khay có nhãn; kiểm giá trị (đo R, đọc mã tụ) | [TK] |
| 5. Uốn chân | 2×D từ thân; bán kính theo Table 7-1 | [V][1][2] |
| 6. Lắp theo thứ tự thấp→cao | Điện trở, diode → socket IC → tụ gốm → LED/transistor (kẹp tản nhiệt) → tụ hóa → connector | [TK] |
| 7. Hàn | ~330–350 °C (có chì) / ~350–380 °C (không chì), mũi D16/C2, 2–4 s/mối; linh kiện nhạy ≤ 3 s | [V][5][12][15–17] |
| 8. Cắt chân | Flush cutter, để lại 0,5–1,5 mm | [V][1][2] |
| 9. Kiểm tra dưới kính | 1,5–3× (pad > 1 mm), nghi ngờ → 4× trọng tài; hoặc 4–10× (NASA) | [V][1][2] |
| 10. Làm sạch | IPA + bàn chải, trong ½ h; không siêu âm | [V][1][12] |
| 11. Kiểm tra lại | Sau làm sạch (cặn trắng, sót lỗi) | [V][1] |
| 12. Đo thông mạch | Đo điện trở giữa nguồn và GND: **cao** = không chập | [S][40] |
| 13. Cấp nguồn lần đầu | Nguồn bàn giới hạn dòng: đặt đúng điện áp, giới hạn dòng **~30 % trên** dòng dự kiến; nếu chạm giới hạn và áp tụt về ~0 → chập | [S][40] |
| 14. Ghi chép | Kết quả kiểm tra, lỗi đã sửa, ảnh (camera trinocular) | NASA 13.3 [V][1] |

---

## 12. Mô hình nhiệt gợi ý cho game ([TK] — đề xuất thiết kế)

- Nhiệt mối: `T_joint(t) = T_tip_eff − (T_tip_eff − T_room) · exp(−t / τ)`, với `τ = k · C_joint / A_contact_eff`.
- Sụt nhiệt mũi khi chạm: `ΔT_tip ≈ α · C_joint / M_tip`; hồi nhiệt với hằng số `τ_rec` (T12/JBC nhỏ, 900M lớn).
- Thiếc thấm ướt khi `T_joint ≥ T_liquidus + 20 °C` và flux còn hoạt tính.
- Flux có "quỹ thời gian" `F` (đơn vị giây-hoạt-tính), tiêu hao nhanh hơn khi `T_tip > 350 °C`; hết flux → icicle, dewetting, cặn cháy.
- Linh kiện tích lũy "liều nhiệt" `D = Σ max(0, T_lead − T_safe) · Δt`; vượt ngưỡng → hư hỏng theo bảng 13.2.
- Oxy hóa mũi tăng theo `exp((T_tip − 350)/50)` [TK, mô phỏng dạng hàm mũ JBC mô tả [V][11]]; không chì ×4–5 [V][5b].

---

## 13. BẢNG THAM SỐ CHO GAME (Game parameter tables)

> Các giá trị diện tích/nhiệt khối là **[TK] ước tính thiết kế** (từ kích thước mũi trong nguồn) để tạo sự khác biệt có thật trong gameplay. Giới hạn linh kiện và tiêu chí lỗi lấy từ nguồn ở các mục trên.

### 13.1 Theo mũi hàn

| Mũi | Diện tích tiếp xúc hiệu dụng (mm²) | Nhiệt khối tương đối (B = 1,0) | Hồi nhiệt τ_rec (s) T12 / 900M | Độ chính xác (1–5) | Rủi ro bridge (1–5) | Dùng tốt nhất |
|---|---|---|---|---|---|---|
| I / ILS (Ø0,15–0,2) | 0,05 | 0,6 | 1,5 / 4 | 5 | 1 | 0402, sửa nhỏ |
| B (côn R0,5) | 0,2 | 1,0 | 1,2 / 3,5 | 4 | 1 | chân nhỏ |
| D12 (chisel 1,2) | 0,6 | 1,4 | 1,0 / 3 | 4 | 2 | SMD, THT nhỏ |
| **D16 (chisel 1,6)** | **0,9** | **1,8** | 0,9 / 2,5 | 3 | 2 | **THT chuẩn** |
| BC2 / C2 (bevel 2) | 1,2 (cạnh) – 4,4 (mặt) | 2,0 | 0,9 / 2,5 | 3 | 3 | THT, drag |
| D24 (chisel 2,4) | 1,6 | 2,8 | 0,8 / 2 | 2 | 3 | header, jack |
| D32 (chisel 3,2) | 2,6 | 3,6 | 0,7 / 2 | 2 | 4 | ground plane |
| C4 (bevel 4) | 2,5 (cạnh) – 17 (mặt) | 5,0 | 0,7 / 2 | 1 | 5 | mối rất lớn, dây to |
| K (knife) | 0,5 (mũi) – 3 (cạnh) | 3,0 | 0,8 / 2,5 | 3 | 3 (cao nếu dùng cạnh) | drag, gỡ bridge |
| Heavy-duty W (T12) | như mũi gốc | ×1,5 | ×0,8 | như gốc | như gốc | mối cần nhiệt lớn [V][4] |

Hệ số trạm: T12/JBC `τ_rec` ngắn; 900M/936 dài ×2,5–3 [TK, dựa [V][11][S][28]]. Sụt nhiệt khi chạm mối nặng: mũi tích hợp ~30 °C, mũi kém ~70 °C [V][11].

### 13.2 Theo linh kiện

| Linh kiện | Giới hạn an toàn | Ngưỡng hỏng (game) | Hình ảnh khi hỏng | Nguồn |
|---|---|---|---|---|
| LED đỏ/vàng/xanh lá 5 mm | 300 °C ≤ 3 s (chì) / 350 °C (không chì) | > 3 s hoặc > 300 °C → 30 % hỏng/giây vượt | Epoxy vàng/đục, LED tối | [V][15] |
| LED xanh dương/trắng | 280 °C ≤ 3 s | tương tự, nhạy hơn | như trên | [V][15] |
| Tụ hóa | 350–380 °C ≤ 3 s | > 5 s | Ống bọc co rút, đáy phồng | [V][16][S][16b] |
| Diode chân cắm | < 3 s, 1 lần | lần hàn thứ 2 cộng dồn | Không thấy; ΔVF > 20 % | [V][17] |
| Thạch anh HC-49 | 350 °C 3 ± 1 s | > 4 s | Không thấy; sai tần số | [S][18] |
| MLCC | preheat 150 °C, ≤ 350 °C, ≤ 5 s, không chạm thân | mũi chạm thân → xác suất nứt | Nứt chỉ thấy ≥ 10× | [S][19][20] |
| IC DIP | 260 °C 10 s tại 1,6 mm từ thân | > 10 s/chân hoặc hàn liên tục các chân kề | Không thấy; lỗi chức năng | [S][21] |
| Header PBT / JST PA66 | ~260 °C 10 s (quá trình) | mũi chạm nhựa hoặc > 5 s | Nhựa chảy, chân nghiêng | [S][23][23b] |
| Pad PCB FR-4 | nền Tg 130 °C, Td ~350 °C | > 8 s liên tục hoặc kéo bấc lúc nguội | Pad nhấc, nền nâu/đen, đốm trắng | [V][24][1] |

### 13.3 Theo lỗi (điều kiện sinh lỗi)

| Lỗi | Điều kiện kích hoạt trong mô phỏng [TK, dựa nguồn mục 5] |
|---|---|
| Cold joint | `T_joint_max < T_liquidus + 20 °C` hoặc pad/chân bẩn (oxit) |
| Rosin joint | Thời gian ở trên liquidus < 0,5 s; flux kẹt |
| Disturbed | Linh kiện/bo di chuyển trong 1–2 s sau khi rút mũi (đặc biệt Sn60Pb40) |
| Insufficient | Thể tích thiếc < 60 % thể tích fillet lý tưởng hoặc fill < 75 % |
| Excess / balled | Thể tích thiếc > 150 % hoặc góc > 90° |
| Bridge | Mũi rộng hơn ~1,2× pad, thiếc thừa, pitch ≤ 2,54 mm |
| Icicle / spike | Flux cạn + rút mũi chậm (> 0,5 s sau rút thiếc) hoặc mũi nguội |
| Pinhole / blowhole | PCB ẩm (không hút ẩm) hoặc flux sôi mạnh khi > 380 °C |
| Dewetting / non-wetting | Mũi oxy hóa / pad oxy hóa / hết flux |
| Overheated | `T_tip > 400 °C` hoặc dwell > 6 s → bề mặt sần, flux cháy đen |
| Lifted pad | Tổng thời gian nhiệt trên pad > 10 s **hoặc** lực kéo khi thiếc chưa chảy |
| Spatter | Thiếc chạm mũi quá nóng/ướt bọt biển → hạt văng |
| Fractured | Lực tác dụng lên chân sau khi đông (ví dụ cắt chân bằng kìm sốc) |

### 13.4 Theo mức phóng đại (cái gì nhìn thấy được)

| Mức | Thiết bị | Lỗi/đặc điểm phát hiện được |
|---|---|---|
| 1× (mắt thường) | — | Văng thiếc (IPC: kiểm tra không phóng đại), cục thiếc to, chân chưa cắt, cầu thiếc rõ, linh kiện sai vị trí/cháy [V][2] |
| 1,75–3× | Kính lúp đèn 3–5 diopter | Fillet thiếu/thừa, mối cục, độ nhô chân, pad nhấc rõ — đủ cho pad > 1 mm [V][2][S][36] |
| 4× | Trọng tài pad > 1 mm | Góc thấm ướt, % chu vi 270°/330°, dewetting, cặn flux cháy [V][2] |
| 7,5–10× | Stereo thấp / trọng tài pad 0,5–1 mm | Lỗ khí/pinhole, mối nguội sần, disturbed (frosted), cầu thiếc mảnh, measling; NASA 4–10× [V][1][2] |
| 20× | Stereo trung | Vết nứt fillet nhỏ, nứt MLCC, hạt thiếc nhỏ dưới linh kiện [V][2] |
| 40× | Trọng tài pad < 0,25 mm | Vi nứt, ranh giới thấm ướt, nhiễm bẩn ion (một phần) [V][2] |

---

## 14. Nguồn tham khảo

[1] **[V]** NASA-STD-8739.3 w/Change 2, *Soldered Electrical Connections* (1997) — https://physics.csuchico.edu/ayars/327/content/NASA-STD-8739.3.pdf
[2] **[V]** IPC-A-610E redline (Rev D→E changes; Table 1-2, 7-1…7-4, mục 5.2) — https://datasheet.datasheetarchive.com/originals/crawler/acdi.com/4fa15157e5b81fef1873e725a900d3e8.pdf
[2b] **[V]** Adafruit, *Guide to Excellent Soldering — Common Problems* — https://learn.adafruit.com/adafruit-guide-excellent-soldering/common-problems
[3] **[S]** Toolboom — Hakko T12-C4, T12-D16, T12-K, T12-ILS — https://toolboom.com/en/soldering-tip-hakko-t12-c4 ; https://toolboom.com/en/soldering-tip-hakko-t12-d16/ ; https://toolboom.com/en/soldering-tip-hakko-t12-k ; https://toolboom.com/en/soldering-tip-hakko-t12-ils/
[4] **[V]** HAKKO UK, *Recommendations for Selection of Tip Size* — https://hakko.co.uk/?p=4320 ; Heavy-duty W type — https://www.hakko.co.uk/?p=4206
[5] **[V]** HAKKO, *How to keep the soldering tip in good condition* — http://www.hakko.com/english/support/maintenance/detail.php?seq=183 ; danh mục — http://www.hakko.com/english/support/maintenance/
[5b] **[V]** HAKKO, *Why do tips easily oxidize with lead-free solder?* — http://www.hakko.com/english/support/maintenance/detail.php?seq=103
[6] **[V]** HAKKO FX-888D Instruction Manual — https://www.pololu.com/file/0J877/hakko-fx-888d-instruction-manual.pdf
[7] **[V]** HAKKO FX-951 brochure — https://assets.testequity.com/te1/Documents/pdf/hakko/Hakko_FX-951_brochure.pdf
[8] **[S]** element14 FX-951 (heat-up 800 °F trong 10 s) — https://au.element14.com/hakko/fx951/soldering-station-digital/dp/9677933
[8b] **[S]** Hướng dẫn thay mũi dòng T (heat resistant pad) — https://static.eleshop.nl/mage/media/downloads/fx100_replace-tip-instructions.pdf
[9] **[S]** Kester 44 Rosin Flux Cored Wire TDS — https://www.farnell.com/datasheets/1878871.pdf
[9b] **[S]** RS PRO Sn63Pb37 0,5 mm, 183 °C — https://sg.rs-online.com/web/p/solder/1796656
[10] **[V]** AIM Solder, SAC305 — https://aimsolder.com/products/solder-alloys/sac305
[11] **[V]** JBC Cartridge Guide — https://www.jbctools.com/pdf/brochures/cartridge_guide.pdf
[12] **[V]** SparkFun, *How to Solder: Through-Hole Soldering* — https://learn.sparkfun.com/tutorials/how-to-solder---through-hole-soldering/all
[13] **[V]** Grove Sales, *How to Choose the Right Weller Soldering Tip* — https://grovesales.co.uk/pages/how-to-choose-a-weller-soldering-tip
[14] **[V]** Metcal/Techcon, *5 Tips for Solder Tip Selection* — https://info.techcon.com/metcal/5-tips-for-solder-tip-selection
[14b] **[S]** Chemtronics sizing guide / pcbsync (quy tắc 60 %) — https://ipv4.chemtronics.com/Content/Images/uploaded/documents/SIZINGGUIDE_LR.pdf ; https://pcbsync.com/?p=34075
[15] **[V]** Kingbright 2014–2015 Catalog, p.84 (soldering) — https://www.kingbrightusa.com/webimages/2013/ecatalog/files/assets/basic-html/page84.html
[15b] **[S]** Datasheet LED 5 mm (3 mm từ đáy thấu kính) — https://docs.rs-online.com/c7d0/A700000013964569.pdf
[16] **[V]** Nippon Chemi-Con, *Aluminum Electrolytic Capacitors — Recommended Soldering Conditions* — https://www.chemi-con.co.jp/products/relatedfiles/capacitor/catalog/al-solder-e.pdf
[16b] **[S]** Nichicon, application guidelines (CAT.8100) — https://www.nmr.mgh.harvard.edu/~reese/public_html/electrolytics/tec2.pdf
[17] **[V]** ROHM, *Soldering conditions: Leaded type Diodes* — https://fscdn.rohm.com/en/products/databook/package/soldering/discrete/lead-type_di.pdf
[18] **[S]** Datasheet thạch anh HC-49 (CJ) — https://wmsc.lcsc.com/wmsc/upload/file/pdf/v2/lcsc/2104221233_Changjiang-Electronics-Tech-CJ-CJ03-040002020B20_C712776.pdf
[19] **[S]** Murata, precautions (soldering iron rework) — https://www.murata.com/products/productdata/8796722462750/PTHM06E.pdf ; FAQ (đã mở, không có số) — https://www.murata.com/en-eu/support/faqs/emc/esd/mnt/0002
[20] **[S]** JBC blog, *How to rework heat sensitive components* — https://www.jbctools.com/blog/rework-heat-sensitive-components/
[21] **[S]** TI NE555 datasheet (lead temperature) — https://datasheets.diptrace.com/ti/NE555.pdf
[22] **[S]** Microchip, Pb-free reflow (J-STD-020 Tc table) — https://www.microchip.com/content/dam/mchp/documents/FPGA/ProductDocuments/PackagingSpecifications/solder_reflow_leadfree.pdf
[23] **[S]** DigiKey forum — JST XH/PA soldering guidelines — https://forum.digikey.com/t/soldering-guidelines-for-jst-connectors-s12b-pask-2-and-b3b-xh-a/70400 ; RS JST XH (PA66, UL94V-0) — https://no.rs-online.com/web/p/pcb-headers/1667312
[23b] **[S]** RS RND 205 pin header (PBT) — https://befr.rs-online.com/web/p/pcb-headers/0697260
[24] **[V]** Eurocircuits, *What does the Tg value mean* — https://www.eurocircuits.com/electronic-manufacturing-technology/base-material-tg-value-meaning/
[24b] **[S]** JLCPCB, glass transition temperature — https://jlcpcb.com/blog/glass-transition-temperature
[25] **[S]** UiTM SRJ, IMC growth Sn-40Pb/Cu under thermal aging — https://journal.uitm.edu.my/index.php/SRJ/article/view/2884
[26] **[S]** Samtec, *Understanding IPC Class 2 vs Class 3 Solder Joints* — https://blog.samtec.com/post/understanding-ipc-class-2-vs-class-3-solder-joints/ ; AllPCB IPC fillet guide (đã mở, không có số) — https://www.allpcb.com/allelectrohub/mastering-solder-joint-quality-an-ipc-a-610-guide-to-acceptable-fillets
[27] **[S]** EEVblog, heat shunts/clips — https://www.eevblog.com/forum/beginners/heat-shuntsclips-for-soldering-and-soldering-sensitive-components/ ; ProTechTrader copper clips — https://www.protechtrader.com/tools-power-tools/4-Solid-Copper-Alligator-ClipsCrocodil
[28] **[S]** TEquipment, FX-888D (heat-up so với 936) — https://www.tequipment.net/Hakko/FX888D-23BY-B/Soldering-Stations/
[29] **[S]** HAKKO FX-901P manual (thay mũi kiểu nipple) — https://www.pololu.com/file/0J879/hakko-fx-901p-instruction-manual.pdf
[30] **[S]** DigiKey forum, tinning & maintaining tips — https://forum.digikey.com/t/best-practices-for-tinning-and-maintaining-your-soldering-iron/4032 ; iFixit — https://www.ifixit.com/Wiki/Soldering_Iron_Maintenance
[30b] **[S]** Hakko USA, *Helpful tips on maintaining your soldering tips* (403 khi mở) — https://hakkousa.com/whats-new/helpful-tips-on-maintaining-your-soldering-tips-and-nozzles.html
[31] **[S]** Venture Mfg, *What is J-STD-004* — https://www.venture-mfg.com/what-is-j-std-004/
[32] **[S]** UW EHS, *Lead safety in shops and labs* — https://ehs.washington.edu/system/files/resources/lead-safety-shops-labs.pdf
[33] **[V]** HSE, *Asthma — solderers* — https://www.hse.gov.uk/asthma/solderers.htm
[33b] **[S]** HSE, rosin-based solder flux fume (WEL) — https://www.hse.gov.uk/foi/internalops/sims/manuf/3_02_26.htm
[34] **[S]** Chemtronics Soder-Wick (Jameco datasheet) — https://www.jameco.com/Jameco/Products/ProdDS/2876687.pdf
[35] **[S]** Desco, wrist strap / ANSI/ESD S20.20 Q&A — https://esdsystems.descoindustries.com/QuestionsAndAnswers/ShowQuestion.aspx?i=1521
[36] **[S]** Luxo, *Principles of Magnification* (diopter → ×) — https://assets.testequity.com/te1/Documents/ARTICLE_LIBRARY/Luxo%20-%20Principles%20of%20Magnification.pdf
[37] **[V]** EEVblog forum, *The Ergonomics of Microscope Soldering: Direct Optical View vs Camera/Monitor* — https://eevblog.com/forum/beginners/the-ergonomics-of-microscope-soldering-direct-optical-view-vs-cameramo-257888
[38] **[V]** Microscope World, *Stereo Zoom Boom Microscope 7x–45x* (Richter Optica S6-BMSQ) — https://www.microscopeworld.com/stereo-zoom-boom-microscope-7x-45x/
[38b] **[S]** AmScope 7X–45X (Barlow 0,5× gấp đôi WD) — https://amscope.com/products/sm-1bn-80m
[39] **[S]** EEVblog, *Are digital microscopes any good for home soldering?* — https://eevblog.com/forum/manufacture/are-digital-microscopes-any-good-for-home-soldering
[40] **[S]** Altium, *Safely powering your new PCB the first time* — https://resources.altium.com/p/expert-tips-safely-powering-your-new-pcb-first-time ; SparkFun, *The Moment of Truth* — https://news.sparkfun.com/1161

> **Lưu ý độ tin cậy:** Bảng IPC-A-610 trong file lấy từ bản redline Rev E (công khai). IPC hiện hành là Rev J (2024); một số con số (đặc biệt bảng phóng đại) có thể đã đổi. Với đồ án/game giáo dục, các giá trị này đủ chính xác; với sản xuất thật, tra bản IPC hiện hành.
