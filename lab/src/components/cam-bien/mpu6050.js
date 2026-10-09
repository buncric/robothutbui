// 🧭 MPU6050 (module GY-521) — con quay hồi chuyển MEMS dùng để đo góc quay của robot (trục Z)
// Firmware ESP32 (imu.h): FS_SEL = 1 → ±500 °/s → 65.5 LSB/(°/s); hiệu chỉnh 400 mẫu lúc đứng yên → bias;
//   dps = (raw − bias)/65.5; |dps| < 0.3 → 0 (vùng chết); heading += dps·dt.
// Sai số: bias còn sót b → góc trôi tuyến tính θ_err = b·t (1 °/s → 60° mỗi phút!).
// Mô hình CAD thật: boards/gy-521-mpu6050.glb (bo 20.3 × 15.6 mm, chân J1 hàn hướng xuống) đặt trên mâm xoay;
// mô hình tự dựng giữ lại làm "chế độ học".
import { cadAttach } from '../../core/cadParts.js';

const LSB = 65.5;          // LSB/(°/s) ở ±500 °/s
const DEADBAND = 0.3;      // °/s
const CAL_TIME = 0.8;      // s — 400 mẫu × 2 ms như GyroZ::calibrate(400)
const NOISE = 0.05;        // °/s rms (mật độ nhiễu 0.005 °/s/√Hz × √(44 Hz))
const BOARD_Y = 13;        // mặt dưới bo GY-521 trên bàn xoay

export default {
  id: 'mpu6050',
  name: 'Cảm biến góc MPU6050 (GY-521)',
  category: 'cam-bien',
  order: 4,
  icon: '🧭',
  summary: 'Con quay MEMS đo tốc độ quay (°/s). Cộng dồn theo thời gian → góc quay của robot, chính xác hơn encoder khi bánh trượt. Học bias, trôi góc, hiệu chỉnh lúc đứng yên — đúng như imu.h của ESP32.',
  tags: ['MPU6050', 'GY-521', 'gyro', 'con quay', 'IMU', 'I2C', 'heading', 'MEMS', 'trôi'],

  params: [
    { id: 'cad', label: '🧊 Mô hình CAD thật (module GY-521)', type: 'toggle', value: true, hint: 'Tắt = mô hình học tự dựng (đơn giản hoá)' },
    { id: 'mode', label: 'Chuyển động của bàn xoay (= robot)', type: 'select', value: 'robot', options: [
      ['robot', 'Robot quay 90° rồi dừng, lặp lại'], ['turn', 'Quay đều theo tốc độ đặt'], ['osc', 'Lắc qua lại'], ['still', 'Đứng yên'],
    ] },
    { id: 'rate', label: 'Tốc độ quay tối đa', type: 'range', min: -600, max: 600, step: 5, value: 120, unit: '°/s', hint: 'Thang ±500 °/s: vượt quá sẽ bão hòa (raw kẹt ở ±32767).' },
    { id: 'bias', label: 'Độ lệch 0 của con quay (bias thật)', type: 'range', min: -5, max: 5, step: 0.1, value: 1.5, unit: '°/s', hint: 'Mỗi con chip có bias khác nhau và thay đổi theo nhiệt độ. Đổi xong nhớ bấm Hiệu chỉnh.' },
    { id: 'dead', label: 'Vùng chết ±0.3 °/s như firmware', type: 'toggle', value: true },
    { id: 'mems', label: 'Phóng to cấu trúc MEMS bên trong chip', type: 'toggle', value: false },
    { id: 'cal', label: '🎯 Hiệu chỉnh bias (400 mẫu, phải đứng yên!)', type: 'button' },
    { id: 'reset', label: '↺ Đặt lại góc về 0 (RSTODO)', type: 'button' },
  ],
  readouts: [
    { id: 'raw', label: 'GYRO_ZOUT (thanh ghi 0x47–0x48)', unit: 'LSB' },
    { id: 'dps', label: 'Tốc độ quay đo được', unit: '°/s' },
    { id: 'truth', label: 'Góc thật', unit: '°' },
    { id: 'est', label: 'Góc ESP32 ước lượng', unit: '°' },
    { id: 'err', label: 'Sai số góc', unit: '°' },
    { id: 'biasEst', label: 'Bias đã hiệu chỉnh', unit: '°/s' },
    { id: 'i2c', label: 'Bus I2C', unit: '' },
    { id: 'state', label: 'Tình trạng', unit: '' },
  ],
  scope: {
    window: 8,
    note: '(thời gian thực · ESP32 đọc con quay mỗi 5 ms)',
    channels: [
      { name: 'Gyro Z đo được', unit: '°/s', min: -550, max: 550, color: '#4cc2ff' },
      { name: 'Góc thật', unit: '°', min: -180, max: 180, color: '#3fcf8e' },
      { name: 'Sai số góc (ước lượng − thật)', unit: '°', min: -30, max: 30, color: '#ff8c1a' },
    ],
  },

  faults: [
    { id: 'hieu-chinh-sai', label: 'Robot bị xê dịch lúc đang hiệu chỉnh khởi động', severity: 'loi',
      what: '<p>Người dùng bật nguồn rồi cầm robot đặt xuống ngay (đúng lúc ESP32 đang hiệu chỉnh 0.8 s). Sau đó robot đứng yên nhưng <b>mũi tên cam (góc ước lượng) cứ quay dần</b> vài °/s → đi thẳng thành đi cong, zig-zag lệch hẳn.</p>',
      why: '<p>Hiệu chỉnh lấy trung bình 400 mẫu làm "số 0". Nếu lúc đó robot đang quay ~5 °/s thì bias ước lượng bị cộng thêm 5 °/s. Sau này mọi lần đọc đều bị trừ sai 5 °/s → góc trôi 5° mỗi giây = 300° mỗi phút.</p>',
      fix: '<p>Chỉ hiệu chỉnh khi đứng yên: báo "đừng chạm robot" bằng LED/còi, kiểm tra độ lệch chuẩn của 400 mẫu — nếu lớn (đang rung/quay) thì làm lại. Có thể hiệu chỉnh lại mỗi khi robot dừng hẳn (cả 2 encoder = 0 trong 1 s).</p>' },
    { id: 'thieu-pullup', label: 'Module MPU6050 trần, dây I2C dài 40 cm, không có trở kéo lên', severity: 'loi',
      what: '<p>Serial log: <code>[IMU] không thấy — dùng encoder cho góc</code>. Đọc WHO_AM_I (0x75) ra 0xFF; lúc được lúc không. Robot vẫn chạy nhưng góc quay sai vài % (bánh trượt).</p>',
      why: '<p>I2C là bus <b>cực máng hở</b> (open-drain): thiết bị chỉ kéo xuống, mức 1 nhờ trở kéo lên. Thiếu trở (hoặc trở nội ESP32 ~45 kΩ quá yếu) + điện dung dây dài 100–200 pF → thời gian lên <code>t ≈ 0.85·R·C</code> ≈ vài µs, quá chậm so với chu kỳ 2.5 µs của 400 kHz → bit sai, NACK.</p>',
      fix: '<p>GY-521 có sẵn trở kéo lên (2.2–4.7 kΩ) — đừng gỡ. Module trần: thêm 4.7 kΩ từ SDA, SCL lên 3.3 V. Dây I2C ≤ 20–30 cm, xoắn với GND; hoặc hạ tốc độ <code>Wire.begin(sda, scl, 100000)</code>.</p>' },
    { id: 'ad0', label: 'Nối chân AD0 lên VCC', severity: 'loi',
      what: '<p>ESP32 không tìm thấy IMU (không ACK ở địa chỉ 0x68) → firmware tự chuyển sang dùng encoder để tính góc.</p>',
      why: '<p>Chân AD0 chọn bit thấp của địa chỉ I2C: AD0 = 0 → <b>0x68</b>, AD0 = 1 → <b>0x69</b> (để gắn 2 con MPU6050 trên một bus). GY-521 có trở kéo AD0 xuống GND; nối lên VCC đổi địa chỉ thành 0x69, mà <code>imu.h</code> cố định 0x68.</p>',
      fix: '<p>Để AD0 hở hoặc nối GND. Dùng chương trình "I2C scanner" để xem thiết bị đang trả lời ở địa chỉ nào trước khi viết code.</p>' },
    { id: 'vcc-14v', label: 'Cấp nhầm VBAT 14.4 V vào chân VCC', severity: 'chay',
      what: '<p>IC ổn áp nhỏ (SOT-23, mã 662K) nóng bỏng, bốc khói, có thể nứt vỏ. Đèn LED nguồn tắt. Nếu ổn áp chết kiểu chập, 14.4 V đi thẳng vào MPU6050 → chip chết, có khi kéo theo chân I2C của ESP32.</p>',
      why: '<p>GY-521 có LDO 3.3 V (XC6206/662K) chịu tối đa ~6 V đầu vào. Vì có LDO nên cấp <b>5 V vào VCC là đúng</b> (chip MPU6050 chỉ chịu 2.375–3.46 V khi hoạt động, tuyệt đối tối đa 6 V). 14.4 V vượt xa → mối nối bán dẫn đánh thủng, dòng lớn, P = U·I biến thành nhiệt.</p>',
      fix: '<p>Lấy nguồn IMU từ 5 V logic (sau buck) hoặc 3.3 V của ESP32. Dây nguồn và dây tín hiệu khác màu, đầu nối có khóa. Module không có LDO (MPU6050 trần, một số bo tím/xanh) thì <b>chỉ cấp 3.3 V</b>.</p>' },
    { id: 'nhiet', label: 'Robot nóng lên sau khi hiệu chỉnh (gần quạt, pin)', severity: 'nhe',
      what: '<p>Mới bật thì góc chuẩn; sau 10–15 phút chạy, robot đứng yên mà góc ước lượng vẫn trôi chậm dần ~0.5–1.5 °/s.</p>',
      why: '<p>Bias của con quay MEMS phụ thuộc nhiệt độ (MPU6050: tới ±20 °/s trên toàn dải −40…85 °C, ~0.03–0.1 °/s mỗi °C). Chip nóng thêm 15–20 °C so với lúc hiệu chỉnh → bias đổi → vùng chết 0.3 °/s không che được nữa.</p>',
      fix: '<p>Đặt IMU xa quạt/ pin/ driver; hiệu chỉnh lại mỗi lần robot dừng hẳn; hoặc bù nhiệt dùng thanh ghi nhiệt độ (0x41–0x42, T = raw/340 + 36.53 °C). Lidar + SLAM sẽ sửa trôi góc ở giai đoạn sau.</p>' },
  ],

  info: {
    overview: `
      <p><b>MPU6050</b> (InvenSense/TDK) là IMU 6 trục: 3 trục gia tốc + 3 trục <b>con quay hồi chuyển</b> (gyroscope) chế tạo bằng công nghệ MEMS (vi cơ điện tử). Module xanh <b>GY-521</b> có sẵn ổn áp 3.3 V và trở kéo lên I2C. Robot chỉ cần <b>trục Z</b> (thẳng đứng): tốc độ quay quanh trục này chính là tốc độ đổi hướng của robot.</p>
      <p>Con quay không đo <i>góc</i> mà đo <i>tốc độ góc</i> (°/s). ESP32 cộng dồn: <code>góc += tốc độ × Δt</code>. Mọi sai số nhỏ trong tốc độ cũng bị cộng dồn → <b>trôi góc</b>.</p>
      <p>Thử: để <b>Đứng yên</b>, kéo <b>bias</b> lên 3 °/s → mũi tên cam (ước lượng) quay dần dù mũi tên xanh (thật) đứng im. Bấm <b>Hiệu chỉnh</b> → hết trôi. Giờ chọn <b>Quay đều</b> rồi bấm Hiệu chỉnh — chuyện gì xảy ra khi dừng lại?</p>`,
    specs: [
      ['Chip', 'MPU-6050, QFN-24 4 × 4 × 0.9 mm; module GY-521 ~21 × 16 mm'],
      ['Nguồn', 'Chip: 2.375–3.46 V · GY-521: VCC 3.3–5 V (có LDO 662K → 3.3 V)'],
      ['Giao tiếp', 'I2C tới 400 kHz, địa chỉ 0x68 (AD0 = 0) hoặc 0x69'],
      ['Thang con quay', '±250 / ±500 / ±1000 / ±2000 °/s → 131 / <b>65.5</b> / 32.8 / 16.4 LSB/(°/s)'],
      ['Dự án dùng', '±500 °/s (ghi 0x08 vào 0x1B) · lọc thông thấp ~44 Hz (0x1A = 3) · PLL gyro X (0x6B = 0x01)'],
      ['Thanh ghi', 'GYRO_ZOUT_H/L = 0x47/0x48 (int16, byte cao trước) · WHO_AM_I = 0x75 → 0x68'],
      ['Lệch 0 ban đầu', '±20 °/s (datasheet, trước hiệu chỉnh) — thực tế thường 0.5–3 °/s'],
      ['Nhiễu', '0.005 °/s/√Hz → ~0.03–0.05 °/s rms ở băng thông 44 Hz'],
      ['Nối ESP32-S3', 'SDA → GPIO8, SCL → GPIO9, VCC → 3.3 V hoặc 5 V, GND chung'],
    ],
    principle: `
      <h4>1. Con quay MEMS: lực Coriolis</h4>
      <p>Bên trong chip có một khối silicon nhỏ (proof mass) được lò xo silicon giữ và <b>rung qua lại liên tục</b> (~30 kHz) theo phương X. Khi chip quay quanh trục Z với tốc độ Ω, khối đang chuyển động chịu <b>lực Coriolis</b> <code>F = −2m·(Ω × v)</code> vuông góc với phương rung. Khối lệch đi một chút → các răng lược tụ điện (comb) thay đổi điện dung → mạch đo ra Ω. Bật "Phóng to MEMS" để xem.</p>
      <h4>2. Từ số đọc ra °/s</h4>
      <p><code>ω = (raw − bias) / 65.5</code>. Ví dụ raw = 6550, bias = 98 → ω = 98.5 °/s.</p>
      <h4>3. Tích phân → góc, và vì sao trôi</h4>
      <p><code>θ(t) = Σ ω·Δt</code>. Nếu bias ước lượng sai b °/s: <code>θ<sub>sai</sub> = b·t</code> — tăng mãi theo thời gian. b = 1 °/s → sai 60° sau 1 phút. Nhiễu trắng σ thì gây "bước ngẫu nhiên" <code>σ·√(Δt·t)</code> — nhỏ hơn nhiều.</p>
      <h4>4. Hiệu chỉnh + vùng chết (đúng như imu.h)</h4>
      <ul>
        <li><code>calibrate(400)</code>: đứng yên, đọc 400 mẫu cách 2 ms, lấy trung bình → bias.</li>
        <li>Vùng chết: |ω| &lt; 0.3 °/s coi như 0 → khi đứng yên, phần bias còn sót và nhiễu không bị cộng dồn. Đổi lại: quay rất chậm (&lt; 0.3 °/s) sẽ không được ghi nhận.</li>
      </ul>
      <h4>5. Bão hòa</h4>
      <p>Thang ±500 °/s: raw tối đa 32767 ↔ 500.3 °/s. Quay nhanh hơn, số đọc bị kẹt → góc thiếu. Robot hút bụi quay tối đa ~250 °/s nên ±500 là vừa.</p>`,
    inRobot: `
      <ul>
        <li>Nối thẳng vào <b>ESP32-S3</b> (không qua PIC): SDA → <b>GPIO8</b>, SCL → <b>GPIO9</b>, I2C 400 kHz (<code>PIN_I2C_SDA/SCL</code> trong <code>esp32s3/src/config.h</code>).</li>
        <li>Đặt module <b>gần tâm robot</b>, nằm phẳng, chip hướng lên, bắt bằng vít + đệm mút mỏng chống rung; xa quạt hút và pin (nhiệt).</li>
        <li><code>main.cpp</code>: <code>gyro.begin()</code> lúc khởi động (robot phải đứng yên ~1 s), <code>gyro.update()</code> mỗi 5 ms. <code>USE_IMU 1</code>: nếu tìm thấy IMU, <code>Odometry::update(…, useImu=true, gyro.heading())</code> lấy góc từ con quay thay cho <code>(s<sub>R</sub>−s<sub>L</sub>)/L</code> của encoder.</li>
        <li>Không có IMU (hoặc lỗi I2C) → firmware tự dùng encoder: robot vẫn chạy, chỉ kém chính xác khi bánh trượt trên thảm.</li>
        <li>Giai đoạn sau: ODROID-M2 + ROS 2 dùng IMU + encoder + lidar (EKF, slam_toolbox) để sửa trôi.</li>
      </ul>`,
    mistakes: `
      <ul>
        <li>Không hiệu chỉnh bias, hoặc hiệu chỉnh khi robot đang rung/ bị cầm → góc trôi vài °/s.</li>
        <li>Lắp nghiêng: trục Z của chip không thẳng đứng → đo thiếu tốc độ quay (× cos góc nghiêng) và lẫn trục khác.</li>
        <li>Đặt sát quạt hút/ chổi → rung làm nhiễu tăng; sát pin/ driver → nóng làm bias trôi.</li>
        <li>Cắm 14.4 V vào VCC; hoặc cấp 5 V cho module KHÔNG có LDO.</li>
        <li>Đọc 2 byte rời nhau không "burst" (H rồi L ở 2 lần truyền khác nhau) → giá trị nhảy khi byte thấp tràn.</li>
        <li>Quên chung GND giữa module và ESP32.</li>
      </ul>`,
    quiz: [
      { q: 'Ở thang ±500 °/s, thanh ghi GYRO_ZOUT đọc được 3275, bias = 0. Robot đang quay bao nhiêu °/s?', a: '3275 / 65.5 = 50 °/s.' },
      { q: 'Bias còn sót 0.5 °/s và không có vùng chết. Đứng yên 2 phút, góc ước lượng sai bao nhiêu?', a: '0.5 × 120 = 60°.' },
      { q: 'Vì sao firmware bắt robot đứng yên lúc khởi động?', a: 'Để lấy trung bình 400 mẫu làm bias (số 0 của con quay). Nếu robot đang quay/rung, tốc độ thật bị tính nhầm vào bias → góc trôi suốt quá trình chạy.' },
    ],
  },

  build(ctx) {
    const { THREE, MAT, geom, label, readout, fx } = ctx;
    const { mesh, group, part, cyl, box, wire } = geom;
    const root = new THREE.Group();

    // ---------- bàn xoay (đại diện cho thân robot) ----------
    const base = mesh(cyl(42, 44, 6, 64), MAT.plasticDark, { y: 3 });
    root.add(part(base, 'Đế bàn xoay (đại diện thân robot)', 'Coi như robot nhìn từ trên xuống. Vạch chia mỗi 10°, vạch dài mỗi 90°.'));
    const tickGeo = box(0.8, 0.4, 4);
    const ticks = new THREE.InstancedMesh(tickGeo, MAT.silkscreen, 36);
    const m4 = new THREE.Matrix4(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      sc.set(1, 1, i % 9 === 0 ? 1.8 : 1);
      pos.set(Math.cos(a) * 39, 6.2, -Math.sin(a) * 39);
      // xoay vạch sao cho trục dài hướng tâm
      const qq = new THREE.Quaternion().setFromAxisAngle(up, a + Math.PI / 2);
      m4.compose(pos, qq, sc);
      ticks.setMatrixAt(i, m4);
    }
    root.add(ticks);
    const disk = new THREE.Group();
    disk.position.y = 6;
    root.add(disk);
    const plate = mesh(cyl(35, 35, 3, 64), MAT.plasticGrey, { y: 1.5 });
    disk.add(part(plate, 'Mâm xoay', 'Quay theo chế độ đã chọn. Mũi tên xanh lá trên mâm = hướng thật của robot.'));
    const arrowShaft = mesh(box(22, 0.6, 2.4), MAT.plasticGreen, { x: 20, y: 3.3 });
    const arrowHead = mesh(cyl(0, 3.2, 6, 3), MAT.plasticGreen, { x: 33, y: 3.3, rz: -Math.PI / 2 });
    disk.add(part(group(arrowShaft, arrowHead), 'Hướng THẬT (mũi tên xanh lá)', 'Góc quay thật của mâm/robot.'));
    label(disk, 'Hướng thật', [34, 6, 0]);

    // ---------- module GY-521 ----------
    const board = new THREE.Group();
    board.position.y = BOARD_Y - 6;
    disk.add(board);
    const standoffs = [[-8, -6], [8, -6], [-8, 6], [8, 6]].map(([x, z]) => mesh(cyl(1.2, 1.2, 4, 12), MAT.brass, { x, y: 2, z }));
    const standG = part(group(...standoffs), 'Cột đồng M2 + đệm', 'Bắt chặt module (đệm mút mỏng chống rung). Module lỏng → rung → nhiễu con quay.');
    board.add(standG);
    const pcbM = mesh(box(21.2, 1.6, 16.4, 0.5), MAT.pcbBlue, { y: 4.8 });
    board.add(part(pcbM, 'Bo GY-521 (21.2 × 16.4 mm)', 'Module phổ biến nhất cho MPU6050: có LDO 3.3 V, trở kéo lên I2C, LED nguồn, 2 lỗ bắt vít Ø3.'));
    const top = 5.6;
    const chip = mesh(box(4, 0.9, 4, 0.1), MAT.icBody, { y: top + 0.45 });
    const dot = mesh(cyl(0.3, 0.3, 0.05, 10), MAT.silkscreen, { x: -1.4, y: top + 0.92, z: -1.4 });
    const chipG = part(group(chip, dot), 'MPU-6050 (QFN-24, 4 × 4 mm)', 'Trong vỏ: con quay 3 trục + gia tốc kế 3 trục MEMS, ADC 16-bit, bộ lọc số, cảm biến nhiệt. Trục Z vuông góc mặt chip.');
    board.add(chipG);
    const ldo = mesh(box(2.9, 1.1, 1.6, 0.15), MAT.icBody, { x: 6.5, y: top + 0.55, z: 3 });
    const ldoG = part(group(ldo), 'Ổn áp LDO 662K (XC6206) 3.3 V', 'Hạ VCC 3.3–5 V xuống 3.3 V cho chip. Chịu tối đa ~6 V vào — cấp 14.4 V là cháy.');
    board.add(ldoG);
    const rMat = MAT.icBody;
    const rs = [[-6, -3], [-6, -1.5], [-6, 0]].map(([x, z]) => mesh(box(1.6, 0.45, 0.8), rMat, { x, y: top + 0.22, z }));
    const rsG = part(group(...rs), 'Trở kéo lên I2C (SDA, SCL) + trở kéo xuống AD0', 'SDA/SCL kéo lên 3.3 V (2.2–4.7 kΩ) vì I2C là bus cực máng hở. AD0 kéo xuống GND → địa chỉ 0x68.');
    board.add(rsG);
    const capMat = new THREE.MeshStandardMaterial({ color: 0xb08850, roughness: 0.6 });
    const cs = [[2.8, -2.6], [3.6, 2.4], [-2.8, 2.8], [6.5, -1]].map(([x, z]) => mesh(box(1.6, 0.8, 0.8), capMat, { x, y: top + 0.4, z }));
    const csG = part(group(...cs), 'Tụ lọc (0.1 µF, 10 nF REGOUT, 2.2 nF CPOUT)', 'Lọc nguồn và tụ cho bơm điện tích/ổn áp nội của chip — thiếu là chip chạy chập chờn. <a href="#/c/tu-dien">Xem chi tiết →</a>');
    board.add(csG);
    const led = mesh(box(1.6, 0.6, 0.8), new THREE.MeshStandardMaterial({ color: 0xff4040, emissive: 0xff2020, emissiveIntensity: 1 }), { x: 6.5, y: top + 0.3, z: -4 });
    board.add(part(led, 'LED nguồn (đỏ)', 'Sáng khi LDO có ra 3.3 V. Tắt sau khi cấp nhầm điện áp cao = ổn áp đã chết.'));
    // trục in trên bo
    const sx = mesh(box(5, 0.05, 0.4), MAT.silkscreen, { x: 2, y: top + 0.03, z: 5.5 });
    const sy = mesh(box(0.4, 0.05, 5), MAT.silkscreen, { x: -7.5, y: top + 0.03, z: 1 });
    const silkG = part(group(sx, sy), 'Ký hiệu trục X, Y in trên bo', 'Z vuông góc mặt bo (quy tắc bàn tay phải). Robot dùng trục Z: lắp bo NẰM PHẲNG.');
    board.add(silkG);
    // header 8 chân
    const names = ['VCC', 'GND', 'SCL', 'SDA', 'XDA', 'XCL', 'AD0', 'INT'];
    const hdr = mesh(box(8 * 2.54, 2.5, 2.5), MAT.plasticBlack, { y: top + 1.25, z: -6.9 });
    const hpins = names.map((n, i) => mesh(box(0.64, 9, 0.64), MAT.gold, { x: (i - 3.5) * 2.54, y: top + 1.5, z: -6.9 }));
    const hdrG = part(group(hdr, ...hpins), 'Hàng chân: VCC · GND · SCL · SDA · XDA · XCL · AD0 · INT',
      'Dự án dùng 4 chân: VCC (5 V hoặc 3.3 V), GND, SCL → GPIO9, SDA → GPIO8. XDA/XCL: bus phụ cho la bàn. AD0: chọn địa chỉ. INT: ngắt khi có dữ liệu mới (chưa dùng).');
    board.add(hdrG);
    const wcol = [0xd23b3b, 0x222222, 0xf2c200, 0x3b8ef0];
    const ws = wcol.map((color, i) => wire([[(i - 3.5) * 2.54, top + 6, -6.9], [(i - 3.5) * 2.54, top + 9, -10], [(i - 3.5) * 2.54 - 4, top + 9, -22], [(i - 3.5) * 2.54 - 6, top + 4, -30]], { radius: 0.35, color }));
    const wsG = part(group(...ws), 'Dây tới ESP32-S3: đỏ VCC · đen GND · vàng SCL→GPIO9 · xanh SDA→GPIO8', 'Ngắn ≤ 20 cm, xoắn với GND. <a href="#/c/esp32-s3">Xem ESP32-S3 →</a>');
    board.add(wsG);
    label(board, 'MPU-6050', [0, top + 3, 2]);
    const procLabels = new THREE.Group();
    board.add(procLabels);
    label(procLabels, 'SDA→GPIO8 · SCL→GPIO9', [-12, top + 6, -30]);

    // ---------- mô hình CAD thật GY-521 (khung GLB: mặt dưới bo ở y = 0, hàng chân J1 ở +Z hàn hướng xuống) ----------
    // Không xoay: trục Y in trên bo (hướng ra xa hàng chân) = −Z, trùng mũi tên Y của mô hình. Nâng mặt dưới bo lên
    // y = 5 để đầu chân (dài 8.5 mm dưới bo) còn cách mặt mâm 0.5 mm; 2 cột đồng dưới 2 lỗ bắt vít; dây hàn vào đầu chân.
    const PIN_NET = ['VCC', 'GND', 'SCL', 'SDA', 'XDA', 'XCL', 'AD0', 'INT'];
    const PIN_DESC = ['3.3–5 V (qua LDO). Dự án: 5 V hoặc 3.3 V từ bo ESP32.', 'GND chung với ESP32.', 'Xung nhịp I2C → ESP32 GPIO9 (400 kHz).', 'Dữ liệu I2C → ESP32 GPIO8.',
      'Bus I2C phụ (gắn la bàn HMC5883L) — không dùng.', 'Xung nhịp bus phụ — không dùng.', 'Chọn địa chỉ: hở/GND → 0x68, nối VCC → 0x69.', 'Ngắt báo có dữ liệu mới — chưa dùng.'];
    const cadExtras = new THREE.Group();
    cadExtras.visible = false;
    board.add(cadExtras);
    cadExtras.add(part(group(...[-7.6, 7.6].map((x) => mesh(cyl(1.6, 1.6, 5, 16), MAT.brass, { x, y: 2.5, z: -5.2 }))), 'Cột đồng M3 + đệm (2 lỗ bắt vít)', 'Bắt chặt module (đệm mút mỏng chống rung). Module lỏng → rung → nhiễu con quay.'));
    const pinX = (i) => -8.92 + 2.54 * i;
    cadExtras.add(part(group(...wcol.map((color, i) => wire([[pinX(i), -3.3, 6.51], [pinX(i), -3.2, 11], [pinX(i) - 3, -3.1, 20], [pinX(i) - 6, -2.8, 29]], { radius: 0.35, color }))),
      'Dây tới ESP32-S3: đỏ VCC · đen GND · vàng SCL→GPIO9 · xanh SDA→GPIO8', 'Hàn vào đầu 4 chân VCC · GND · SCL · SDA. Ngắn ≤ 20 cm, xoắn với GND. <a href="#/c/esp32-s3">Xem ESP32-S3 →</a>'));
    label(cadExtras, 'SDA→GPIO8 · SCL→GPIO9', [-14, 0, 29]);
    const cadR = {};
    const cadParts = {
      pcb: ['Bo GY-521 (20.3 × 15.6 mm)', 'Module phổ biến nhất cho MPU6050: có LDO 3.3 V, trở kéo lên I2C, LED nguồn, 2 lỗ bắt vít Ø3.'],
      U1_mpu6050: ['MPU-6050 (QFN-24, 4 × 4 × 0.9 mm)', 'Trong vỏ: con quay 3 trục + gia tốc kế 3 trục MEMS, ADC 16-bit, bộ lọc số, cảm biến nhiệt. Trục Z vuông góc mặt chip. Bật "Phóng to MEMS" để xem bên trong.'],
      U1_marking: ['MPU-6050 (QFN-24, 4 × 4 × 0.9 mm)', 'Chữ in trên chip. Chấm tròn ở góc = chân số 1.'],
      U2_XC6206: ['Ổn áp LDO 662K (XC6206) 3.3 V', 'Hạ VCC 3.3–5 V xuống 3.3 V cho chip. Chịu tối đa ~6 V vào — cấp 14.4 V là cháy.'],
      led_pwr_pkg: ['LED nguồn (đỏ)', 'Sáng khi LDO có ra 3.3 V. Tắt sau khi cấp nhầm điện áp cao = ổn áp đã chết.'],
      C_tant_10uF: ['Tụ tantali 10 µF (lọc nguồn)', 'Vạch đánh dấu = cực (+). Tụ tantali cắm ngược/quá áp dễ chập và cháy.'],
      header_J1: ['Hàng chân J1: VCC · GND · SCL · SDA · XDA · XCL · AD0 · INT', 'Bước 2.54 mm, hàn hướng xuống. Dự án dùng 4 chân: VCC, GND, SCL → GPIO9, SDA → GPIO8.'],
      silkscreen: ['Chữ in (silkscreen): tên chân + trục X, Y', 'Z vuông góc mặt bo (quy tắc bàn tay phải). Robot dùng trục Z: lắp bo NẰM PHẲNG.'],
    };
    PIN_NET.forEach((n, i) => { cadParts[`pin_J1_${i + 1}`] = [`Chân ${i + 1}: ${n}`, PIN_DESC[i]]; });
    const cad = cadAttach(ctx, board, 'boards/gy-521-mpu6050', {
      onBottom: false, offset: [0, 5, 0],
      hide: [standG, pcbM, chipG, ldoG, rsG, csG, led, silkG, hdrG, wsG, procLabels],
      partDefault: ['Module GY-521 (CAD thật)', 'Mô hình CAD theo bản vẽ components101: bo 20.3 × 15.6 mm, MPU-6050 QFN-24, LDO XC6206, LED nguồn, hàng chân 8 chân.'],
      parts: cadParts,
      onLoad(c) {
        c.tag(/^R\d$/, 'Điện trở dán 0603', 'Kéo lên SDA/SCL 4.7 kΩ (I2C là bus cực máng hở), kéo xuống AD0 (→ địa chỉ 0x68), hạn dòng LED.');
        c.tag(/^C\d$/, 'Tụ gốm 0603 (0.1 µF, 10 nF REGOUT, 2.2 nF CPOUT)', 'Lọc nguồn và tụ cho bơm điện tích/ổn áp nội của chip — thiếu là chip chạy chập chờn.');
        cadR.ldo = c.node('U2_XC6206');
        cadR.chip = c.node('U1_mpu6050');
        cadR.led = c.node('led_pwr');
      },
      onToggle(on) { cadExtras.visible = on; },
    });
    let ledK = -1;

    // trục X/Y/Z 3D
    const axes = new THREE.Group();
    axes.position.y = BOARD_Y + 1;
    [[1, 0, 0, 0xff5a5a], [0, 0, -1, 0x4cd17a], [0, 1, 0, 0x5f8bff]].forEach(([x, y, z, c]) =>
      axes.add(new THREE.ArrowHelper(new THREE.Vector3(x, y, z), new THREE.Vector3(0, 0, 0), 16, c, 3, 1.6)));
    axes.traverse((o) => { o.raycast = () => {}; });
    disk.add(axes);
    label(axes, 'Z (đo góc quay robot)', [0, 18, 0]);

    // ---------- kim chỉ hướng ước lượng (cam) — không gắn vào mâm ----------
    const estG = new THREE.Group();
    estG.position.y = 30;
    root.add(estG);
    const estShaft = mesh(box(30, 0.8, 1.6), MAT.plasticYellow.clone(), { x: 17 });
    estShaft.material.color.setHex(0xff8c1a);
    const estHead = mesh(cyl(0, 2.6, 5, 3), estShaft.material, { x: 34, rz: -Math.PI / 2 });
    const estHub = mesh(cyl(2, 2, 2, 16), estShaft.material);
    estG.add(part(group(estShaft, estHead, estHub), 'Hướng ESP32 ƯỚC LƯỢNG (kim cam)', 'Tính bằng cách cộng dồn tốc độ con quay. Lệch với mũi tên xanh = sai số tích lũy (trôi).'));
    label(estG, 'Ước lượng (gyro)', [36, 4, 0]);

    // ---------- MEMS phóng to (tùy chọn) ----------
    const memsG = new THREE.Group();
    memsG.position.set(0, 55, 0);
    memsG.visible = false;
    disk.add(memsG);
    const frame = group(
      mesh(box(30, 1.5, 1.5), MAT.silicon, { z: 13 }), mesh(box(30, 1.5, 1.5), MAT.silicon, { z: -13 }),
      mesh(box(1.5, 1.5, 27.5), MAT.silicon, { x: 14.25 }), mesh(box(1.5, 1.5, 27.5), MAT.silicon, { x: -14.25 }),
    );
    memsG.add(part(frame, 'Khung silicon cố định (phóng to ~500×)', 'Gắn liền đế chip. Kích thước thật cả cấu trúc chỉ khoảng 0.5 mm.'));
    const mass = new THREE.Group();
    memsG.add(mass);
    const massBody = mesh(box(12, 1.2, 10), MAT.aluminum);
    const combs = [-4, -2, 0, 2, 4].map((x) => mesh(box(0.5, 1, 3), MAT.aluminum, { x, z: 6.5 }));
    mass.add(part(group(massBody, ...combs), 'Khối dao động (proof mass)', 'Được kích rung qua lại theo X (~30 kHz thật). Khi chip quay quanh Z, lực Coriolis đẩy khối lệch theo phương vuông góc → răng lược đổi điện dung.'));
    const fixedCombs = [-3, -1, 1, 3, 5].map((x) => mesh(box(0.5, 1, 3), MAT.gold, { x, z: 9.5 }));
    memsG.add(part(group(...fixedCombs), 'Răng lược cố định (tụ điện đo)', 'Khe giữa răng động và răng tĩnh đổi → điện dung đổi → mạch đọc ra tốc độ quay.'));
    const springs = [[-9, 0], [9, 0]].map(([x]) => mesh(box(6, 0.6, 0.6), MAT.steel, { x }));
    memsG.add(part(group(...springs), 'Lò xo silicon', 'Dầm silicon mảnh giữ khối dao động, cho phép nó rung.'));
    const corArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 6, 0xff6b9a, 2, 1.4);
    corArrow.traverse((o) => { o.raycast = () => {}; });
    memsG.add(corArrow);
    label(memsG, 'MEMS ×500 (vẽ chậm)', [0, 6, -14]);

    // ---------- trạng thái ----------
    let psi = 0, est = 0, encEst = 0, biasEst = null, cal = null, calWarn = false, target = 0, phaseT = 0, pend = 0;
    let fault = null, faultT = 0, dead = false, temp = 30;
    const corDir = new THREE.Vector3();
    const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += Math.random(); return (u - 3) * Math.SQRT2; };
    const wrapDeg = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

    return {
      object: root,
      onAction(id) {
        if (id === 'cal') cal = { t: 0, sum: 0, n: 0, moved: 0 };
        if (id === 'reset') { psi = 0; est = 0; encEst = 0; target = 0; }
      },
      triggerFault(id) {
        fault = id; faultT = 0; dead = false;
        psi = 0; est = 0; encEst = 0; target = 0;
        if (id === 'hieu-chinh-sai') cal = { t: 0, sum: 0, n: 0, moved: 0 };
        if (id === 'nhiet') temp = 30;
      },
      resetFault() { fault = null; dead = false; temp = 30; ledK = -1; },
      update(dt, t, p) {
        faultT += dt;
        if (biasEst === null) biasEst = p.bias * LSB;      // giả định đã hiệu chỉnh đúng lúc khởi động

        // ----- chuyển động thật của mâm (°/s) -----
        let w = 0;
        if (fault === 'hieu-chinh-sai' && cal) w = 8 * Math.sin((Math.PI * cal.t) / CAL_TIME);   // bị cầm xê dịch
        else if (fault === 'hieu-chinh-sai') w = 0;
        else if (p.mode === 'turn') w = p.rate;
        else if (p.mode === 'osc') w = p.rate * Math.sin(2 * Math.PI * 0.25 * t);
        else if (p.mode === 'robot') {
          // giống trạng thái TURN của firmware: tốc độ tỉ lệ sai số, kẹp ở tốc độ tối đa; nghỉ 1.5 s rồi quay tiếp 90°
          const err = target - psi;
          if (Math.abs(err) < 0.5) { pend += dt; if (pend > 1.5) { pend = 0; target += 90 * Math.sign(p.rate || 1); } w = 0; }
          else w = Math.max(-Math.abs(p.rate), Math.min(Math.abs(p.rate), err * 4));
        }
        psi += w * dt;
        disk.rotation.y = (psi * Math.PI) / 180;

        // ----- chip: bias thật (có thể trôi theo nhiệt) -----
        if (fault === 'nhiet') temp = Math.min(50, 30 + faultT * 2);
        else temp += (30 - temp) * Math.min(1, dt * 0.2);
        const biasTrue = p.bias + (temp - 30) * 0.06;
        const cadOn = cad.sync(p);
        const ldoT = cadOn && cadR.ldo ? cadR.ldo : ldoG, chipT = cadOn && cadR.chip ? cadR.chip : chipG;
        if (fault === 'vcc-14v' && !dead && faultT > 0.6) {
          dead = true;
          fx.heat(ldoT, 0);
          fx.smoke(ldoT, { size: 4, duration: 5 });
          fx.sparks(ldoT, { count: 20, speed: 25, size: 0.5 });
          fx.scorch(ldoT, 0.9);
          fx.scorch(chipT, 0.4);
        }
        if (fault === 'vcc-14v' && !dead) fx.heat(ldoT, Math.min(1, faultT / 0.6));
        const i2cOk = !dead && fault !== 'thieu-pullup' && fault !== 'ad0';
        const ledM = led.material;
        if (ledM.emissive) ledM.emissiveIntensity = dead ? 0 : 1;
        // LED nguồn CAD: đỏ khi LDO còn sống
        if (cadOn && cadR.led) { const k = dead ? 0 : 1.6; if (k !== ledK) { ledK = k; cad.glow(cadR.led, 0xff2020, k); } }
        else if (!cadOn) ledK = -1;

        const meas = w + biasTrue + NOISE * gauss();
        const raw = Math.round(Math.max(-32768, Math.min(32767, meas * LSB)));

        // ----- hiệu chỉnh (đúng như GyroZ::calibrate) -----
        if (cal) {
          cal.t += dt; cal.sum += raw; cal.n++; cal.moved = Math.max(cal.moved, Math.abs(w));
          if (cal.t >= CAL_TIME) { if (i2cOk) biasEst = cal.sum / cal.n; calWarn = cal.moved > 1; cal = null; }
        }

        // ----- ESP32: ước lượng góc -----
        let dps = 0;
        if (i2cOk) {
          dps = (raw - biasEst) / LSB;
          if (p.dead && Math.abs(dps) < DEADBAND) dps = 0;
          if (!cal) est += dps * dt;
        }
        encEst += w * 1.04 * dt;                         // dự phòng: góc từ encoder, sai ~4 % do trượt bánh/ sai khoảng cách bánh
        const shown = i2cOk ? est : encEst;
        estG.rotation.y = (shown * Math.PI) / 180;

        // ----- MEMS phóng to: rung theo X, lệch Coriolis theo Z ∝ Ω·v -----
        memsG.visible = p.mems;
        if (p.mems) {
          const ph = 2 * Math.PI * 1.5 * t;
          const vx = Math.cos(ph);
          mass.position.x = 2.2 * Math.sin(ph);
          const dz = Math.max(-2.5, Math.min(2.5, (w / 300) * 2.2 * vx));
          mass.position.z = dz;
          corArrow.visible = Math.abs(dz) > 0.05;
          corArrow.setDirection(corDir.set(0, 0, Math.sign(dz) || 1));
          corArrow.setLength(2 + Math.abs(dz) * 3, 1.6, 1.2);
          corArrow.position.set(mass.position.x, 2, dz + Math.sign(dz) * 6);
        }

        const errDeg = shown - psi;
        readout('raw', i2cOk ? raw : '— (không đọc được)');
        readout('dps', dps);
        readout('truth', wrapDeg(psi));
        readout('est', wrapDeg(shown));
        readout('err', errDeg);
        readout('biasEst', biasEst / LSB);
        let bus = '0x68 ✓ · 400 kHz · SDA GPIO8 · SCL GPIO9';
        if (dead) bus = '✗ Không phản hồi (chip/LDO chết)';
        else if (fault === 'thieu-pullup') bus = '✗ NACK / WHO_AM_I = 0xFF (sườn lên quá chậm)';
        else if (fault === 'ad0') bus = '✗ Không ACK ở 0x68 (chip đang ở 0x69)';
        readout('i2c', bus);
        let st = '✓ Dùng con quay cho góc';
        if (cal) st = `🎯 Đang hiệu chỉnh… ${Math.round((cal.t / CAL_TIME) * 400)}/400 mẫu` + (Math.abs(w) > 1 ? ' — ⚠ ĐANG QUAY!' : '');
        else if (!i2cOk) st = '↪ Mất IMU → firmware dùng encoder cho góc (sai ~4 %)';
        else if (Math.abs(meas) > 500.3) st = '⚠ BÃO HÒA: vượt ±500 °/s, raw kẹt ở ±32767';
        else if (calWarn) st = '⚠ Đã hiệu chỉnh lúc đang quay → bias sai → trôi góc';
        else if (Math.abs(biasTrue - biasEst / LSB) > DEADBAND && p.mode === 'still') st = `⚠ Bias lệch ${(biasTrue - biasEst / LSB).toFixed(2)} °/s → góc trôi. Bấm Hiệu chỉnh!`;
        if (fault === 'nhiet') st += ` · chip ${temp.toFixed(0)} °C`;
        readout('state', st);
        return [i2cOk ? Math.max(-550, Math.min(550, raw / LSB)) : 0, wrapDeg(psi), Math.max(-30, Math.min(30, errDeg))];
      },
    };
  },
};
