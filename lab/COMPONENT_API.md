# Cách thêm một linh kiện vào RoboVac Lab

Mỗi linh kiện = **1 file** `src/components/<nhóm>/<id>.js`, `export default` một object. App tự nạp mọi file trong `src/components/**` (Vite `import.meta.glob`) — **không cần sửa file nào khác**.

Nhóm (`category`): `lap-rap` (robot hoàn chỉnh) · `mo-phong` (môi trường: căn nhà, mặt bàn, bàn thí nghiệm) · `co-khi` · `dong-luc` · `dien-tu` · `nguon` · `dieu-khien` · `cam-bien`.

## Khung
```js
export default {
  id: 'dong-co-dc',            // duy nhất, dùng trong URL #/c/<id>
  name: 'Động cơ DC chổi than',
  category: 'dong-luc',
  order: 1,                    // thứ tự trong nhóm
  icon: '⚙️',
  summary: '1–2 câu: là gì, vì sao quan trọng trong robot',
  tags: ['từ khóa', 'tìm kiếm'],

  params: [                    // bảng "Thí nghiệm"
    { id: 'v', label: 'Điện áp', type: 'range', min: 0, max: 14.4, step: 0.1, value: 7.2, unit: 'V', hint: 'tooltip' },
    { id: 'cut', label: 'Cắt bổ', type: 'toggle', value: true },
    { id: 'mode', label: 'Chế độ', type: 'select', value: 'a', options: [['a', 'Chế độ A'], ['b', 'Chế độ B']] },
    { id: 'go', label: '▶ Chạy', type: 'button' },          // gọi onAction('go')
  ],
  readouts: [{ id: 'rpm', label: 'Tốc độ', unit: 'vòng/phút' }],   // ô "Số đo"
  scope: {                     // "Máy hiện sóng" (bỏ qua nếu không cần)
    window: 3,                 // số giây hiển thị
    note: '(đã làm chậm 1000×)',
    channels: [{ name: 'Dòng I', unit: 'A', min: -2, max: 2, color: '#ffd34d' }],
  },
  info: {                      // 6 tab bài học — HTML tiếng Việt
    overview: '<p>…</p>',      // + gợi ý "Thử: …" dẫn người học dùng thí nghiệm
    specs: [['Tên thông số', 'giá trị — giải thích ngắn']],
    principle: '<h4>…</h4><p>công thức <code>…</code></p>',
    inRobot: '<p>Nằm ở đâu trong robot, nối vào chân nào của PIC/ESP32 (theo docs/01)…</p>',
    mistakes: '<ul><li>Lỗi thực tế hay gặp + hậu quả</li></ul>',
    quiz: [{ q: 'Câu hỏi?', a: 'Đáp án + lời giải.' }],     // 3 câu
  },

  build(ctx) {
    // ctx = { THREE, MAT, PIN_COLORS, tint, geom, viewer, label(parent, text, [x,y,z]), readout(id, value), fx }
    const root = new ctx.THREE.Group();
    // … dựng mô hình …
    return {
      object: root,
      update(dt, t, params) {          // gọi mỗi khung hình (~60 lần/s)
        ctx.readout('rpm', 1234);
        return [valueKenh1];           // mảng giá trị theo thứ tự scope.channels (hoặc undefined)
      },
      onAction(id, params) {},          // nút bấm
      dispose() {},                     // tùy chọn
    };
  },
};
```

## Quy ước bắt buộc
1. **Đơn vị = mm**, trục **Y hướng lên**, đặt vật trên mặt đất tưởng tượng (camera tự căn theo kích thước).
2. **Kích thước thật** (tra datasheet/đo): ốc M3 Ø3 mm, IC DIP-40 dài ~52 mm, robot Ø~350 mm.
3. Dùng vật liệu chung `ctx.MAT.*` (thép, đồng, nhựa, PCB…). Muốn đổi màu/phát sáng **riêng một chi tiết** → `MAT.x.clone()`.
4. **Mọi chi tiết người học cần biết phải bọc `geom.part(obj, 'Tên', 'Mô tả 1–2 câu')`** — rê chuột sẽ hiện tooltip, bấm sẽ ghim.
   ⚠️ `geom.group(a, b)` *chuyển* a, b vào nhóm mới → **thêm chính nhóm đó** vào cha: `root.add(part(group(a, b), …))`, đừng `root.add(a, b)` sau đó.
5. Cắt bổ: `const setCut = geom.makeCutaway(root); setCut(true)`. Hàm này **clone material** → nếu cần đổi màu/emissive lúc chạy, giữ tham chiếu tới **mesh** và đổi `mesh.material.*` (đừng giữ material cũ). Chi tiết không muốn bị cắt: `o.userData.noCut = true` trước khi gọi.
6. Nhãn 3D: `ctx.label(parent, 'Tên', [x,y,z])` — ngắn gọn, ít thôi (≤ 6 nhãn/linh kiện, trừ chân IC).
7. Mô phỏng phải **có cơ sở vật lý/kỹ thuật thật** (công thức trong tab Nguyên lý), số liệu sát linh kiện thật trong robot hút bụi. Tín hiệu quá nhanh (PWM 20 kHz, UART) → làm chậm và ghi rõ trong `scope.note`.
8. Liên hệ dự án: sơ đồ chân `docs/01_KIEN_TRUC_VA_SO_DO_CHAN.md`, giao thức `docs/02_GIAO_THUC.md`, firmware `firmware/`.
9. Tiếng Việt có dấu, giọng dạy người mới bắt đầu, giải thích thuật ngữ tiếng Anh trong ngoặc.
10. Không tạo đối tượng mới mỗi khung hình nếu tránh được (hiệu năng).


## ⚠️ Sự cố / lắp sai (`faults`) — BẮT BUỘC với linh kiện điện, khuyến khích với cơ khí
Người học bấm nút → mô hình diễn lại sự cố bằng hiệu ứng + thẻ giải thích **Hiện tượng / Vì sao / Cách phòng**.
```js
faults: [
  { id: 'nguoc-cuc', label: 'Cắm ngược cực pin', severity: 'no',   // 'no' 💥 | 'chay' 🔥 | 'hong' ⚡ | 'loi' ⚠️ | 'nhe' ℹ️
    what: '<p>Hiện tượng người học sẽ thấy/ngửi/nghe (mùi khét, tiếng nổ lách tách, tụ phồng…)</p>',
    why:  '<p>Giải thích vật lý: dòng bao nhiêu, công suất P = I²R bao nhiêu, nhiệt độ…</p>',
    fix:  '<p>Cách phòng (diode chống ngược, cầu chì, đầu nối 1 chiều…) và xử lý an toàn nếu đã xảy ra</p>' },
],
// trong build() trả thêm:
triggerFault(id, params) { /* diễn sự cố: đổi trạng thái mô phỏng + gọi ctx.fx.* */ },
resetFault(params) { /* đưa mô phỏng về bình thường (fx.restore đã được app gọi sẵn) */ },
```
Hiệu ứng `ctx.fx` (vị trí truyền `[x,y,z]` thế giới hoặc một Object3D; `size` theo mm của linh kiện):
`fx.smoke(pos,{size,duration})` khói · `fx.fire(pos,{size,duration})` lửa · `fx.sparks(pos,{count,speed,size})` tia lửa ·
`fx.flash(pos,{size,color})` chớp · `fx.pop(obj,{force,size})` nổ bung vật (tụ, IC) · `fx.scorch(obj)` cháy xém ·
`fx.heat(obj, 0..1)` nóng đỏ (gọi mỗi khung trong update) · `fx.restore(root)` (app tự gọi khi Khôi phục).
Sự cố phải **đúng thực tế** (số liệu, thời gian, hậu quả) và nên có hệ quả trong mô phỏng (dòng vọt trên scope, nhiệt độ readout tăng, MCU reset…).
Gợi ý các sự cố kinh điển: ngược cực, chập mạch, quá áp (12V vào chân 5V, 5V vào ESP32 3.3V), thiếu diode flyback, thiếu tụ lọc, không tản nhiệt, cắm IC ngược chiều, nhầm chân, thiếu trở kéo lên, quên chung GND, kẹt động cơ, tháo lắp khi đang cấp điện.

## 🔧 Tháo lắp từng bước (`steps`) — khuyến khích với linh kiện nhiều chi tiết
```js
steps: [
  { title: 'Bước 1 — Tháo pin', text: 'Luôn rút nguồn trước… dụng cụ: tua vít PH1…' },
  { title: 'Bước 2 — Mở nắp sau', text: '…' },
],
// trong build() trả thêm:
setStep(i, params) { /* đặt mô hình về trạng thái bước i (nội suy mượt trong update). i = -1 → trạng thái mặc định (lắp hoàn chỉnh) — trang mở ra ở trạng thái này */ },
```
Bước nên ghi: dụng cụ, thứ tự, lực/mô-men, điểm dễ gãy, chụp ảnh/đánh dấu trước khi tháo, lắp ngược lại thế nào.
Kiểm tra bằng `node tools/smoke.mjs <id>` — công cụ sẽ chạy mọi bước & mọi sự cố.


## 📦 Kéo-thả (sandbox) — cho môi trường / xưởng / bàn mạch
```js
const sb = ctx.sandbox({
  title: 'Đồ đạc',                         // tiêu đề bảng Thư viện (góc trái khung 3D)
  root,                                   // Group chứa đồ vật
  catalog: [{ id: 'sofa', name: 'Sofa 3 chỗ', icon: '🛋', group: 'Phòng khách', desc: '…',
              build: () => object3D,      // gốc tọa độ ở ĐÁY vật, tâm XZ
              surface: false,             // true → đồ khác đặt lên được (bàn, kệ)
              fixed: false, maxCount: 0 }],
  surfaces: [tableTopMesh],               // mặt đặt đồ có sẵn (ngoài mặt sàn y = floorY)
  floorY: 0, grid: 50, bounds: { minX, maxX, minZ, maxZ },
  storageKey: 'robovac.can-nha.v1',       // tự lưu bố cục trong trình duyệt
  initial: [{ type: 'sofa', x: 1000, z: 500, rotY: 0 }],
  onChange: (items) => { /* tính lại vật cản: ctx.footprint(it.object) → {minX,maxX,minZ,maxZ,minY,maxY}. Gọi TRƯỚC khi lưu → có thể chỉnh vị trí (bắt khe) */ },
  onDrag: (item) => {},                   // gọi liên tục khi đang kéo (dây bám theo, xem trước khe)
  rotStep: 15,                            // độ mỗi lần Q/E (breadboard: 90)
});
sb.items; sb.add(type, {x,y,z,rotY}); sb.remove(uid); sb.serialize(); sb.load(list); sb.save(); sb.enabled = false; // khóa khi đang chạy
```
Người dùng: kéo mục từ Thư viện vào cảnh · bấm chọn · kéo dời · Q/E xoay · Del xoá · Ctrl+D nhân bản · Ctrl+Z/Y · xuất/nhập JSON.
Sandbox tự dọn khi đổi trang. Chạy được trong smoke test (không có giao diện).
`ctx.catalog` = danh sách mọi linh kiện của lab (mỗi phần tử có `build(ctx)` như trang linh kiện).

## Hàm dựng hình có sẵn (`ctx.geom`)
`part, mesh(geo, mat, {x,y,z,rx,ry,rz}), group(...), box(w,h,d,r), cyl(rTop,rBot,h,seg,open), lathe([[r,y],…]), helixThread({radius,pitch,turns,tube,y0}), springGeometry({radius,wire,turns,length}), gearGeometry({teeth,module,width,bore}), arcSector(rIn,rOut,a0,a1,len), pcb(w,d,{t,mat}), pinHeader(n), dipPackage(n) → {group,pins,body,len,width}, smdChip(w,d,h), wire([[x,y,z],…],{radius,color}), arrow(from,to,color), makeCutaway(obj,plane), angDist(a,b)`

## Linh kiện mẫu để tham khảo
- `co-khi/oc-vit.js` — cơ khí + nút bấm + mô hình mô-men + cắt bổ
- `dong-luc/dong-co-dc.js` — mô phỏng vật lý (phương trình vi phân) + phát sáng theo trạng thái
- `dieu-khien/pic16f877a.js` — IC nhiều chân, tô màu theo nhóm, mở nắp, tín hiệu số

## Chạy
```bash
cd lab
npm install
npm run dev        # mở http://localhost:5173
npm run build      # kiểm tra lỗi biên dịch → dist/
```
