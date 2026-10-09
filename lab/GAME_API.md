# 🎮 RoboVac Lab Simulator — đặc tả kiến trúc (hợp đồng chung cho mọi người viết code game)

Game góc nhìn thứ nhất: người chơi là một kỹ sư trong phòng lab, **thấy 2 bàn tay**, đi lại, cầm nắm, hàn mạch, cắm linh kiện, đi dây, đo đạc, cấp nguồn — sai thì cháy nổ đúng vật lý. Trang riêng toàn màn hình: `lab/game.html` → `src/game/main.js`.
Dùng lại: `src/core/materials.js`, `geom.js`, `fx.js`, `src/circuit/*` (bộ giải mạch MNA — khi có), các linh kiện `src/components/**` (hàm `build(ctx)`), `src/sim/robot-brain.js`.
**Đơn vị: mm**, trục Y lên. Mắt người chơi cao 1650 mm. Bàn làm việc cao 750 mm.

## 1. Cấu trúc thư mục
```
src/game/
  main.js                 khởi động: app + world + player + hands + interact + hud + quests, vòng lặp
  engine/
    app.js                renderer (ACES, sRGB, shadow PCFSoft), scene, camera (FOV mặc định 70), hậu kỳ theo chất lượng
                          (EffectComposer: RenderPass → GTAO/SAO → UnrealBloom (đèn LED, mỏ hàn đỏ) → OutputPass → SMAA/FXAA),
                          vòng lặp cố định 60 Hz cho logic + render theo rAF, tạm dừng khi mất pointer lock / mở menu
    events.js             bus sự kiện: on(type, fn) / off / emit(type, payload)  — dùng cho nhiệm vụ, âm thanh, HUD
    quality.js            cài đặt: preset low|medium|high|ultra (shadow map, pixelRatio, AO, bloom, số đèn), FOV, độ nhạy chuột,
                          đảo trục Y, âm lượng — lưu localStorage 'robovac.game.settings'
    player.js             nhân vật: PointerLock, WASD/↑↓←→, Shift chạy, C cúi (mắt 1150 mm), va chạm hình trụ (r 250) với
                          danh sách AABB của world (world.colliders), lắc đầu khi đi (head-bob), bước chân phát event 'footstep'
    hands.js              viewmodel 2 tay (xem §3)
    interact.js           hệ tương tác (xem §4)
    sockets.js            hệ khe cắm (xem §5)
    inventory.js          thanh dụng cụ 1–9 + túi linh kiện (xem §6)
    hud.js                tâm ngắm, gợi ý phím, thanh dụng cụ, thông báo (toast), bảng nhiệm vụ, đồng hồ đo (LCD dụng cụ),
                          menu tạm dừng (Esc): Tiếp tục / Cài đặt / Nhiệm vụ / Hướng dẫn phím / Về lab 3D (../index.html)
    quests.js             hệ nhiệm vụ (xem §8)
    audio.js              âm thanh tổng hợp bằng WebAudio (không cần file): play(name, {pos, vol}) — click, snap, sizzle (hàn),
                          hiss (nhựa thông), zap (tia lửa), pop (nổ tụ), beep (đồng hồ thông mạch), motor (vòng lặp, chỉnh tốc), whoosh, footstep
    save.js               lưu/tải: vị trí người chơi, vật thể (id, kiểu, pose, trạng thái), mối hàn, dây, nhiệm vụ — localStorage 'robovac.game.save.v1'
    textures.js           texture thủ tục bằng CanvasTexture: gỗ, thảm chống tĩnh điện (xanh có chấm), gạch lát, tường sơn,
                          PCB (đường mạch + lớp phủ + chữ in silkscreen), kim loại xước, bảng ghim — có normal/roughness map khi chất lượng ≥ high
  world/
    labRoom.js            phòng lab chi tiết: build(game) → { root, colliders:[Box3], surfaces:[Mesh], spawn:{pos,yaw}, lights }
    props/*.js            đồ đạc tĩnh: bàn, ghế, kệ, tủ ngăn kéo linh kiện, đèn kính lúp, máy hút khói hàn, bình chữa cháy…
  items/
    registry.js           tự nạp mọi item trong items/** (import.meta.glob), getItemDef(id)
    tools/*.js            dụng cụ cầm tay (xem §7)
    parts/*.js            linh kiện cầm được (xem §7)
  minigames/
    soldering.js          mô hình mối hàn (xem §9)
    insertion.js          cắm chân linh kiện / IC vào lỗ, đế, breadboard
    wiring.js             cắt – tuốt – bấm đầu – cắm dây; dây là đường cong 3D nối 2 đầu
    measuring.js          que đo đồng hồ chạm 2 điểm → đọc từ mạng điện (netlist) / bộ giải mạch
```

## 2. Đối tượng `game` (truyền cho mọi module)
```js
game = {
  THREE, app, scene, camera, events, quality, audio, fx,           // fx = core/fx.js FX(scene)
  MAT, geom,                                                       // từ src/core
  world, player, hands, interact, sockets, inventory, hud, quests, save,
  items: { get(id), spawn(id, pose) → ItemInstance, all },          // ItemInstance xem §7
  circuit: null | { … }                                            // gắn sau khi có src/circuit
  time: { now, dt, scale }                                         // giây mô phỏng
}
```

## 3. Hai bàn tay (`hands.js`)
- Mô hình tay **thủ tục**: lòng bàn tay + 5 ngón × 3 đốt (khớp xoay), da (MeshPhysical, sheen nhẹ), tay áo lab trắng; render trong cùng scene, gắn vào camera (layer riêng, không đổ bóng lên tường).
- Tư thế (pose) nội suy mượt: `idle` (lắc nhẹ theo nhịp thở), `reach` (với tới mục tiêu), `grip` (nắm vật to), `pinch` (ngón cái + trỏ kẹp linh kiện nhỏ), `holdTool:<kind>` (mỏ hàn kiểu cầm bút, tua vít, nhíp, que đo, cuộn thiếc tay trái), `press` (ấn), `inspect` (2 tay xoay vật trước mặt).
- API: `hands.setPose('right'|'left', pose, {target?})`, `hands.attach('right'|'left', object, gripTransform)`, `hands.detach(side)`, `hands.playGesture('tap'|'push'|'twist'|'squeeze', side)`, `hands.right.tipWorldPosition()` (đầu dụng cụ đang cầm — dùng cho hàn/đo).
- Tay phải: dụng cụ/vật chính. Tay trái: cuộn thiếc, que đo thứ 2, giữ board.

## 4. Tương tác (`interact.js`)
- Raycast từ tâm màn hình, tầm với 900 mm (đi lại gần mới thao tác được).
- `interact.register(object3D, spec)` với `spec = { name, prompts: [{ key:'E'|'F'|'LMB'|'RMB'|'R'|'G', label, when?(), do(ctx) }], highlight: true }`. Vật đang nhìn: viền sáng (OutlinePass) + gợi ý dưới tâm ngắm: `[E] Nhặt PIC16F877A   [F] Xem bài học`.
- Hành động chuẩn cho mọi item cầm được: **E** nhặt / đặt xuống (đặt lên mặt surface đang nhìn, có bóng xem trước "ghost" xanh nếu hợp lệ, đỏ nếu không), **G** thả rơi, **giữ chuột phải** = soi (đưa vật lên trước mắt, kéo chuột xoay), **cuộn chuột** = đưa xa/gần, **R** xoay 90° trước khi đặt, **F** mở trang bài học linh kiện ở lab 3D (`../index.html#/c/<id>`, tab mới).
- Dụng cụ dùng **chuột trái giữ** (hàn, vặn, bấm), chuột trái nhấp (đo, bấm nút).
- Vật lý nhẹ: vật thả rơi theo trọng lực, nảy nhẹ, nằm yên trên surface (không cần engine vật lý đầy đủ; dùng raycast xuống surfaces + AABB).

## 5. Khe cắm (`sockets.js`)
```js
sockets.add({
  id, owner: ItemInstance|null, object3D /* vị trí khe */, kind: 'dip40'|'dip14'|'bb-hole'|'header'|'jst-xh-2'|'xt60'|'screw-m3'|'robot-slot:<name>'|…,
  accepts(item) → { ok:boolean, reason?:string, orientation?:'ok'|'reversed'|'offset' },  // vd IC cắm ngược khấc → orientation 'reversed' (vẫn cắm được — hậu quả khi cấp nguồn!)
  pose: Matrix4 (tư thế item khi đã cắm), tolerance: { pos: 2 /*mm*/, angleDeg: 8 },
  onInsert(item, info), onRemove(item), occupiedBy: null,
});
```
- Khi cầm item lại gần khe tương thích (< 30 mm): hiện bóng xem trước tại `pose`; nhấn **E** → hoạt cảnh ấn vào (tay `press`), âm `snap`. Ép khi lệch → **cong chân** (item.state.bentPins++), cảnh báo.
- Khe có thể thuộc một item (đế IC hàn trên board, breadboard, robot chassis) → di chuyển theo item.

## 6. Thanh dụng cụ & túi (`inventory.js`)
- Phím **1–9** chọn dụng cụ trên tay phải; **0/Q** = tay không. Thanh dụng cụ hiển thị ở đáy màn hình (biểu tượng + tên + trạng thái, ví dụ "Mỏ hàn 350 °C").
- Túi linh kiện (**Tab**): danh sách linh kiện đã nhặt (đếm số lượng), chọn để lấy ra tay.
- Mặc định có: Tay không · Mỏ hàn · Thiếc hàn · Nhíp · Tua vít PH1 · Kìm cắt · Kìm tuốt/bấm đầu · Đồng hồ vạn năng · Que đo nguồn bàn.

## 7. Item (`items/tools/*.js`, `items/parts/*.js`)
```js
export default {
  id: 'pic16f877a', name: 'PIC16F877A', kind: 'part'|'tool', category: 'ic'|'passive'|'module'|'mech'|'tool'…,
  lessonId: 'pic16f877a',                 // trang bài học tương ứng ở lab 3D (nếu có)
  massG: 6, size: [52, 7, 15],            // mm (gần đúng) — để cầm/đặt/rơi
  build(game) → Object3D,                 // gốc toạ độ ở đáy vật, chi tiết CAO: chữ in trên IC, chân riêng từng chân…
  grip: { pose: 'pinch'|'grip'|'holdTool:iron'…, offset: [x,y,z], rot: [rx,ry,rz] },
  pins?: [{ name:'1', pos:[x,y,z], dir:[0,-1,0] }],         // đầu chân / đầu nối (để cắm & hàn & nối dây)
  sockets?: (instance, game) => [socketSpec…],             // khe mà item này cung cấp (đế IC, breadboard, header cái…)
  tool?: {                                                  // chỉ cho dụng cụ
    tip: [x,y,z],                                           // đầu làm việc (mũi hàn, mũi tua vít, đầu que đo)
    onUseStart(ctx), onUseHold(ctx, dt), onUseEnd(ctx),     // ctx = { game, target (vật/điểm đang nhìn), hit, instance }
    hud?(instance) → string                                 // dòng trạng thái trên thanh dụng cụ
  },
  init?(instance, game), update?(instance, dt, game),       // vd mỏ hàn: nhiệt độ mũi theo trạm hàn, LED đỏ khi nóng
}
// ItemInstance = { uid, def, object, state:{…}, heldBy:'right'|'left'|null, socket:null|socketId }
```

**Mô hình CAD thật (GLB)** — `cad: 'vendor/<id>' | 'boards/<id>' | 'robot/<id>'` (file `public/models/<path>.glb`, danh mục
`public/models/manifest*.json`). Trên trình duyệt `engine/items.js` nạp GLB (m → mm), gắn làm con tên `'cad'` của gốc item
(`object.userData.cad`), chuyển mesh thủ tục sang layer 31 (không vẽ/không raycast, mốc khe/chân/userData giữ nguyên) rồi gắn lại
sub-part (`subparts.js`). Node (smoke test): CAD không nạp → chỉ hình thủ tục. `cadOptions`:
`{ rotateX/Y/Z, scale (số | [sx,sy,sz]), onBottom:false, offset:[x,y,z], hide:['pin_*'], keep:['leads', 'decal:*'], onLoad(glb, root, game) }`
— dùng `onBottom:false` + `offset` để đầu chân CAD trùng `pins` (≤ 0.3 mm). `cadInteractSkip: ['connector']` bỏ bản ghi `interact`
của manifest theo loại/tên node; `cadOptions.merge: true | { keep:[…] }` gộp mesh GLB tĩnh theo vật liệu sau `onLoad` (giảm draw call; bỏ qua
node khớp manifest interact / def.interact / hide / keep, có `userData.cadNode|interact`, hay bị `root.userData` tham chiếu — dùng cho
ESP32-S3: 356 → 69 mesh). Mesh item nhỏ (bán kính bao < 3 mm) không đổ bóng (`items.js tinyMesh`). `cadPinNode(pin)` (tuỳ chọn) chỉ tên node chân CAD cho công cụ kiểm tra. Trợ giúp onLoad:
`items/parts/_lib/cad.js` (ẩn/cắt/kéo dài mesh, đổi vật liệu, xoè chân DIP). Kiểm tra trực quan: `cad/tmp/cadint/check_items.py <id…>`
(Playwright: hộp bao CAD vs thủ tục, sai lệch đầu chân, số sub-part, ảnh `cad/tmp/shots/items/<id>.png`).

## 8. Nhiệm vụ (`quests.js`)
```js
quests.define({ id:'m1-han-pic', title:'Hàn mạch PIC tối thiểu', intro:'…', steps:[
  { id:'lay-board', text:'Lấy tấm board đục lỗ 9×15 trên kệ B2 đặt lên kẹp mạch', done: (e) => e.type==='item:placed' && e.item.def.id==='perfboard' && e.socket?.kind==='vise' },
  …], reward:{ xp:100 }, scoring: (stats) => ({ score, notes }) });
quests.start(id); // lắng nghe events, hiện bước hiện tại + gợi ý trên HUD, chấm điểm (mối hàn đẹp, an toàn: tắt nguồn trước khi sửa, dùng nguồn giới hạn dòng…)
```
Sự kiện chuẩn (events.emit): `item:picked`, `item:placed`, `item:dropped`, `socket:inserted` {item, socket, orientation}, `socket:removed`, `solder:joint` {pad, quality}, `wire:connected` {a, b}, `power:on` / `power:off` {source}, `measure` {mode, value, a, b}, `fault` {kind, item}, `screw:driven` {torque, stripped}, `tool:changed`, `program:flashed` {ok}.

## 9. Hàn mạch (`minigames/soldering.js`)
- Mỗi **pad** (lỗ đồng trên board hoặc chân linh kiện) có: nhiệt độ T, lượng thiếc V (mm³), nhựa thông còn lại, trạng thái `empty|cold|good|excess|bridge|lifted`.
- Mũi hàn có nhiệt độ đặt (trạm hàn 250–450 °C), nhiệt độ mũi tụt khi chạm pad (khối lượng nhiệt), oxy hóa theo thời gian nếu không lau bọt biển/nhúng thiếc.
- **Quy trình đúng**: chạm mũi vào pad + chân 1–2 s → đưa thiếc vào **chỗ tiếp xúc pad/chân** (không vào mũi) → rút thiếc → rút mũi. Kết quả "good" = hình nón bóng, ướt đều.
- Lỗi: rút mũi quá sớm / pad nguội → `cold` (xám, sần, sau này chập chờn); quá nhiều thiếc → `excess`; thiếc lan sang pad bên cạnh → `bridge` (chập mạch thật trong netlist!); giữ quá lâu / quá nóng → `lifted` (bong pad), cháy board.
- Hiển thị: hình nón thiếc thay đổi theo V và chất lượng, khói nhựa thông, tiếng xèo, mũi hàn đỏ khi nóng; HUD hiện T pad, T mũi, thời gian.
- An toàn: chạm mũi hàn vào tay/dây/vỏ nhựa → cảnh báo + vết cháy; quên tắt trạm hàn khi rời bàn → nhiệm vụ trừ điểm.

## 9b. Hàn mức kỹ thuật viên (`minigames/solder-pro.js` → `game.soldering.pro`)
Nguồn số liệu: `docs/07_KIEN_THUC_HAN_MACH.md` (bảng tham số trong `minigames/_solder_kb.js`, giữ nhãn [V]/[S]/[TK]).
- **Mũi hàn rời** `items/tools/tip-{i,b05,b,j,1c,2c,3c,4c,d16,d24,d32,k}.js` (kind `'part'`, category `'solder-tip'`, `def.tipCode`; dựng chung `_tips.js`).
  Mỏ hàn: `iron.state.tip` (mặc định `D16`), `iron.def.setTip(inst, code|null)`, `state.tipTemp` = nhiệt ĐẦU MŨI, `state.bodyTemp` = thân.
  Mô hình 2 khối: Cw = 0.3·nhiệt_khối J/K, K = 0.25·m^0.8 W/K; G_ướt = 0.17·(A_THT + 0.25 + 0.15·rộng) W/K (§13.1 [TK]).
  Loại trạm `game.lab.station.kind`: `'936'` (mặc định, τ 20 s) · `'fx888d'` · `'t12'`; sleep 180 °C khi nằm trên giá > 20 s.
  Thay mũi: nhìn mũi + **T** (hoặc miếng chịu nhiệt `tip-change-pad` tay trái + chuột phải); T khi cầm mỏ = rút mũi. Mũi nóng + tay trần → `'safety:burn'`.
  Giá mũi: world anchor `'tip-rack'` + mốc `slot_<mã>` (hoặc `tip-rack:<mã>`); node CAD `tip_<mã>` bị ẩn, thay bằng item.
- **Nhiệt linh kiện**: `item.state.heat = { Tb, H, clips[] }`, `item.state.heatDamage = { cls, level, label, brightness, cMul, esrMul, deformed, cracked }`
  (power.js nhân `brightness` vào độ sáng LED, `cMul/esrMul` vào tụ hoá; level 3 → `state.dead`). Kẹp tản nhiệt `heatsink-clip` → alpha ×0.3.
  Sự kiện `'solder:overheat' { item, part, cause, maxT, seconds, level }` (part `'pcb'` cho nền bo: measling/cháy).
- **Lỗi phụ** trên pad: `pad.defects = { icicle, disturbed, pinhole, balls, overheated, rosin }`, `pad.char` (than flux), `pad.boardDose`,
  cầu mảnh `pad._thinBridge`. Va chạm ngoài: `events.emit('solder:jostle', { board?, item?, mm })`.
- **Kiểm tra IPC-A-610**: `pro.grade(pad, cls=2|3)` → `{ pass, defects:[{code, vi, fail, mag, fix}], metrics:{ angle, secondaryDeg, primaryDeg, holeFill, protrusion } }`;
  `pro.inspect(pad, mag, by)` → phiếu (chỉ "thấy" lỗi có `mag ≥ DEFECTS[code].mag·0.85`); nghe `'solder:inspected' { pad, magnification, visible, reason }`
  (kính hiển vi) — phím **I** dự phòng: mắt 1× / đèn kính lúp 2,25×. Phát `'solder:graded' { pad, report }`. `pro.qcReport(board, cls)` · `pro.saveQc(board)` → `'solder:qc-report'`.
- **Làm sạch**: `ipa-brush` (giữ LMB) → `'solder:cleaned'`; `pro.residueLeft(board)`.
- **Sổ tay hàn**: phím **N** (`pro.openCard(page)`: `index · tip:<mã> · defect:<mã> · comp:<lớp> · lesson:<khoá> · ipc · workflow · qc · report`) → `'solder:handbook'`;
  câu hỏi `pro.cards.quiz({...}, cb)` → `'solder:quiz'`. Nhiệm vụ kỹ năng `quests/m1b-ky-thuat-vien.js` (ngoài chuỗi m0–m6).
- Kiểm tra: `node tools/game-solder-pro-test.mjs` · ảnh: `cad/.venv/bin/python cad/tmp/solder_shots.py` → `cad/tmp/shots/solder/`.

## 10. Chất lượng & hiệu năng
- Mục tiêu 60 fps trên MacBook M1 Pro ở `high`; `ultra` thêm AO độ phân giải cao, bóng 4096, bloom.
- Dùng InstancedMesh cho vật lặp (lỗ board, gạch, ngăn kéo), gộp geometry tĩnh, texture ≤ 2048.
- Không tạo object mới mỗi khung hình trong vòng lặp nóng.
- Bản đồ bóng vẽ đúng 1 lần/khung (`shadowMap.autoUpdate = false`, `app.render` đặt `needsUpdate`) — trước đây RenderPass + lượt pháp
  tuyến GTAO vẽ bóng 2 lần (cảnh toàn phòng ~51 → ~88 fps, giới hạn bởi draw call ~6–7 µs/lệnh).
- `perfboard-9x15`: GLB 806k tam giác → hình thủ tục ~45k (khung FR-4 + 2 mặt lưới dán texture lặp 1 ô có alpha khoét lỗ / normal gờ pad /
  ORM + InstancedMesh ống mạ 12 cạnh, không raycast); GLB chỉ còn silkscreen. Id pad, lưới r 0–33 × c 0–51, khe, padWorld giữ nguyên.

## 11. Kiểm tra
- `node tools/game-smoke.mjs`: dựng world + mọi item không cần trình duyệt (game.app có thể là stub), gọi build/update/tool hooks — không lỗi.
- `npx vite build` phải thành công (game.html là entry thứ 2 trong `vite.config.js`).

## 12. UX tương tác (`engine/ux/*`, `game.ux`)
- **Gợi ý phím nổi** (`ux/hints.js`): chip "biểu tượng + phím + động từ" trên vật tương tác trong ~2.5 m mà người chơi đang hướng mặt
  (±40°), tối đa 6 (Gọn: 3), gộp dãy ngăn kéo, không che tâm ngắm, bỏ vật bị tường che; ẩn khi menu / túi / laptop / soi / kính hiển vi /
  thao tác tỉ mỉ. Chip lấy prompt chính của spec (`E` trước) — spec có thể thêm `icon`, `uxKind` (loại cho mẹo lần đầu), `hint:false`
  (không chip), `hintDisabled:false` (không hiện chip mờ khi hành động đang khoá), `hintAnchors() → Vector3[]` (InstancedMesh),
  `scrollLabel` (nhãn "Cuộn …" cho núm có `onScroll`), `reach` (mm — tầm với riêng, vd ghế 1350).
- **Thanh hành động** (hud.setTarget): đáy giữa, nhóm *vật đang nhìn* | *trên tay* (`src:'hand'`) | *chế độ* (`src:'mode'`); nhãn dụng cụ
  theo `ux/keys.js` (`tool.useLabel` / `tool.scrollLabel` ghi đè), `WHEEL` tự sinh cho `onScroll`, hành động khoá hiện mờ + lý do.
- **Bố cục HUD**: cột trái `hud.el.lcol` = bảng nhiệm vụ (chỉ hiện cửa sổ: bước vừa xong + hiện tại + 2 bước kế; J: đầy đủ) + thẻ mẹo
  xếp dưới. Đang ngồi / tỉ mỉ (`.rvh.ux-seated|ux-prec`): nhiệm vụ thu gọn 1 dòng, tự mở ~6 s khi sang bước. Kính hiển vi (`ux-scope`):
  ẩn nhiệm vụ, thanh hành động, thanh dụng cụ, chip, đánh dấu — giữ lớp phủ thị kính, thẻ phím, LCD; phiếu kiểm tra soldering.pro sang
  cột trái ngoài vòng thị kính (`.rsc-rep.scope`, ≤ 4 lỗi + "còn N"). Chip không vẽ trong dải đáy (thanh dụng cụ + thanh hành động).
  Thẻ chế độ / LCD không lấn vào thanh dụng cụ. Đồng hồ pad hàn chiếu theo `app.viewCamera` khi soi kính, đặt phía trên pad.
- **Mẹo lần đầu**: `ux/keys.js TIPS[kind]`, nhớ trong cài đặt `tipsSeen`; HÀNG ĐỢI — mỗi lần 1 thẻ (`uxHud.layout(dt)`), nhường phiếu kiểm tra. Cài đặt `hints: 'full'|'compact'|'off'` (Esc → Cài đặt).
- **Ngồi** (`ux/seating.js`): `world.seats` / Object3D có `userData.seat = { id, bench, seatH, kind:'chair'|'stool', rolling, collider }`.
  E Ngồi · R kéo ghế · Space/E đứng dậy · W/S kéo ghế · A/D nghiêng · Z kính lúp · Tab/MMB tỉ mỉ (Shift+Tab túi). Không lưu tư thế ngồi.
  Cài đặt `benchMode` bật (mặc định): ngồi → **bàn làm việc 3D** (dưới); Tab = bàn 3D ↔ góc nhìn thứ nhất, chuột giữa = tỉ mỉ.
  `seating.sit(seat, { bench:false })` ép ngồi góc nhìn thứ nhất.
  `player.setRig({eye, yawCenter, yawRange, pitchMin, pitchMax, fov, lockMove})` / `releaseRig()` — khung nhìn ghi đè dùng chung.
- **Thao tác tỉ mỉ** (`ux/precision.js`): `interact.pointerRay = {camera, ndc}` → tia tương tác qua con trỏ; `interact.pointer =
  { active, point, hit, normal, ndc }`; mũi dụng cụ bay theo con trỏ ở độ cao `precisionHeight` (cuộn chỉnh), giữ chuột → chạm điểm.
  Minigame đọc `interact.hit` / `target.hit` như cũ (đã là điểm dưới con trỏ).
- **Kính hiển vi** (`ux/microscope.js`): anchor `microscope` (tiêu điểm) + node `knob_zoom|knob_focus|knob_light|eyepiece_l|eyepiece_r|screen|usb_cam`
  (không có → mô hình dự phòng). `app.viewCamera` = camera quang học; 7–45×, R/F nét, L đèn, V thước, I đánh giá →
  `'solder:inspected' { pad, padId, board, quality, observed ('unknown' khi chưa đủ phóng đại / mờ / tối), visible, reason, magnification, … }`.
  Kính USB: RenderTarget ~10 Hz lên node `screen`. Bàn tay viewmodel ở layer 2 (camera kính không thấy).
- **Bàn làm việc 3D** (`ux/bench.js`, `game.ux.bench`, `ux.mode === 'bench'`): cài đặt `benchMode` (mặc định bật — Esc → Cài đặt →
  "Ngồi vào bàn → chế độ 3D"; `benchFov` 40°). Ngồi ghế có bàn → **chuột không khoá** (`app.freeCursor`: main.js không tạm dừng khi nhả
  khoá, Esc tay không → `game.pauseMenu()`, "Tiếp tục" chỉ bỏ tạm dừng) + **camera quỹ đạo** quanh tâm làm việc (bo trên kẹp mạch / kẹp
  / giữa mặt bàn): `player.cameraOverride(cam, dt)` ghi đè game.camera SAU khi người chơi đặt camera (pha trộn 0.55 s vào / 0.4 s ra) —
  hậu kỳ (Outline, AO) giữ nguyên. Giới hạn: cự li 150–1200 mm, góc ngẩng 12–90°, camera ≥ mặt bàn + 45 mm, không xuyên
  `world.colliders` (tường, bảng ghim; bỏ hộp ghế đang ngồi), tâm kẹp trong mặt bàn; vật che (kính hiển vi, đèn…) → kéo camera lại gần
  (raycast 10 Hz các vật `interact`). Tầm với tính từ vai NGƯỜI NGỒI: `interact.bodyEye(out)`; tia qua chuột thật: `precision.enable(cam,
  { absolute:true })` + `precision.far` → `interact.pointerRay.far` (2600 mm); vật đặt xuống thẳng hàng bàn: `interact.placeYaw`.
  Tay viewmodel ẩn (`hands.right/left.visible = false`), dụng cụ đang cầm bay theo con trỏ (`hands.reachLimit` 2000) — mũi chạm đúng
  điểm dưới chuột nên hàn / cắt / đo / cắm dây chạy như thao tác tỉ mỉ. Bloom dịu (ngưỡng 2.6) để bo không loá khi nhìn từ trên.
  | Điều khiển | Việc |
  |---|---|
  | Chuột phải nhấp / kéo | nhặt · đặt / cắm vật dưới con trỏ · xoay quanh tâm |
  | Chuột trái | dùng dụng cụ (giữ để hàn) · cắm / đặt vật đang cầm · hành động chính của vật (E / LMB của spec) |
  | Chuột giữa kéo · Shift + kéo phải · W/A/S/D | dời tâm dọc bàn |
  | Cuộn · Shift + cuộn | phóng to về phía con trỏ · nâng / hạ mũi dụng cụ (cuộn trên núm xoay = vặn núm) |
  | T · G · F · C | nhìn thẳng xuống bo (khung vừa bo, phía xa ở đỉnh ảnh; T lần nữa = góc cũ) · góc 45° · xem gần vật dưới chuột · góc thấp |
  | R / Shift+R · X · Esc | xoay vật đang cầm 90° · đảo 180° · đặt xuống chỗ con trỏ (tay không: menu) |
  | M · Tab · Space | kính hiển vi (rời kính → về bàn 3D, con trỏ giữ trong vòng thị kính) · góc nhìn thứ nhất khi ngồi (Tab lại → bàn 3D) · đứng dậy (khoá chuột lại) |
  | Shift+T / Shift+G / Shift+F · 1–9 / Q | phím gốc (rút mũi hàn, thả, bài học) · dụng cụ như thường |
  Thẻ chú thích cạnh con trỏ (`uxHud.setBench`, kiểu tooltip trang Lab 3D): tên + 1 dòng giải thích (`def.desc` → `summary` của bài học
  Lab 3D `components/**/<lessonId>.js` nạp lười dạng `?raw` → loại linh kiện) + phím; khi cầm vật: trạng thái cắm ("✓ Cắm vào lỗ 10,30 ·
  Board…", "✗ Chưa bẻ chân…", "⚠ NGƯỢC chiều 180°…"). Bóng xem trước đậm (`sockets.ghost.strong`) + viền OutlinePass màu trạng thái:
  xanh = cắm được, vàng = lệch tâm (cong chân), đỏ = sai chỗ / chưa sẵn sàng / cắm NGƯỢC (vẫn cắm được — orientation 'reversed',
  `'socket:reversed'` như cũ). Nhãn cực tính trên bóng từ `def.orientationKey` (`polarityMarks`): "Khấc ← chân 1", "A (+) chân dài" /
  "K (−) chân ngắn", "− vạch sọc"… HUD: không tâm ngắm / thanh hành động / chip (`.rvh.ux-bench`), nhiệm vụ 1 dòng, thẻ phím chế độ,
  LCD, phiếu hàn; thẻ chú thích né thẻ phím + LCD + thanh dụng cụ, ẩn khi đang giữ nút dùng dụng cụ.
  API: `enter(seat|id)` (tự ngồi) · `exit({ stand, lock })` · `view('top'|'iso'|'frame'|'front')` · `pointAt(x, y)` · `aimAt(Vector3)` →
  {x, y} · `pickAt(x, y)` · `mouse(button, down, { shift })` · `drag(dx, dy, 'orbit'|'pan')` · `wheel(delta, { shift })` · `cam` / `goal`
  `{ target, dist, az, el }` · `effDist` · `bodyEye(out)` · `place()` · `putDown()`. Sự kiện `'bench:enter' { seat }` · `'bench:exit' { stand }`
  · `'bench:view' { view }`. Phím gốc nghe `input:key` trực tiếp nên hỏi `game.ux.capture(e)` trước (solder-pro T đã làm).
  Kiểm tra: `node tools/game-bench-test.mjs` (game-ux-test tắt benchMode để kiểm chế độ ngồi góc nhìn thứ nhất) · ảnh chuột thật:
  `cad/.venv/bin/python cad/tmp/bench_shots.py` → `cad/tmp/shots/bench/`.
- **Khác**: `ux/focus.js` xem gần bảng/poster · `ux/laptop.js` (app.uiMode = 'laptop') · `ux/contextActions.js` thùng rác / hộp linh kiện.
- Kiểm tra: `node tools/game-ux-test.mjs` · chơi thử trọn quy trình (bản build tĩnh): `cad/.venv/bin/python cad/tmp/final_play.py`
  → `cad/tmp/shots/final/` (`VIEW=1280x720 OUT=…` để đổi cỡ).
