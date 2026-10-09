// 〰️ PWM là gì — bo PIC16F877A phát xung trên CCP1 (RC2, chân 17) → LED + MOSFET + động cơ.
// V_TB = D·V_cao. LED: mắt người "lấy trung bình" khi f ≳ 60–100 Hz. Động cơ: hằng số thời gian cơ τm ≈ J·R/Ke² ≈ 0.12 s
//   → PWM 1 Hz: giật cục; 10 Hz: rung; ≥ 1 kHz: êm (nhưng kêu rít nếu f < 20 kHz).
// PIC Timer2: f = Fosc / (4·(PR2+1)·prescaler);  duty 10-bit = D·4·(PR2+1)  → PR2 = 249, prescaler 1 → 20 kHz, duty 0…1000.
// Động cơ (giống bài Động cơ DC, tải bánh 3 mN·m): L·di/dt = V − i·R − Ke·ω khi MOSFET đóng; khi ngắt dòng chạy vòng qua diode dập (−0.5 V) tới khi về 0
//   J·dω/dt = Ke·i − b·ω − τ_tải. Mô phỏng bước nhỏ ở mọi tần số → thấy được dòng liên tục (20 kHz) / gián đoạn (≤ 1 kHz).

const R_M = 7.0, KE = 0.011, J = 2.0e-6, B = 1.2e-6, T_FRIC = 0.0012, L_M = 1.5e-3, VBAT = 14.4;
const T_LOAD = 0.003;     // tải 3 mN·m (bánh xe kéo robot)
const NREC = 64;
const FOSC = 20e6;
const SLOW_VIS = 60;
const TSW = 2.4e-6;          // IRLZ44N + trở cổng 100 Ω: t_r + t_f ≈ 2.4 µs

function timer2For(f) {
  for (const pre of [1, 4, 16]) {
    const pr2 = Math.round(FOSC / (4 * f * pre)) - 1;
    if (pr2 <= 255 && pr2 >= 0) return { pre, pr2, steps: 4 * (pr2 + 1), fReal: FOSC / (4 * (pr2 + 1) * pre) };
  }
  return null;
}

export default {
  id: 'pwm',
  name: 'PWM là gì? (điều chế độ rộng xung)',
  category: 'dien-tu',
  order: 6,
  icon: '〰️',
  summary: 'Bật–tắt thật nhanh để "giả" một điện áp trung bình: V_TB = duty × V. Cách PIC điều tốc 2 bánh (20 kHz), ESP32 điều tốc quạt hút, và cách làm LED sáng mờ — mà không phí điện thành nhiệt như điện trở.',
  tags: ['PWM', 'duty', 'điều xung', 'Timer2', 'PR2', 'CCP', 'tần số', 'LED', 'tốc độ động cơ'],

  params: [
    { id: 'duty', label: 'Duty (độ rộng xung)', type: 'range', min: 0, max: 100, step: 1, value: 40, unit: '%' },
    { id: 'f', label: 'Tần số PWM', type: 'select', value: '20000', options: [['1', '1 Hz (nhìn bằng mắt)'], ['10', '10 Hz'], ['100', '100 Hz'], ['1000', '1 kHz (nghe rít)'], ['20000', '20 kHz — PIC: PR2 = 249 (dự án)']] },
    { id: 'wave', label: 'Hiện dải sóng 3D phía trên', type: 'toggle', value: true },
  ],
  readouts: [
    { id: 'reg', label: 'Giá trị ghi set_pwm1_duty()', unit: '' },
    { id: 'pr2', label: 'Cấu hình Timer2 cần', unit: '' },
    { id: 'per', label: 'Chu kỳ T · thời gian mức cao', unit: '' },
    { id: 'vled', label: 'V trung bình ở chân 17 (5 V)', unit: 'V' },
    { id: 'vmot', label: 'V trung bình đo trên động cơ (lý thuyết D × 14.4 V)', unit: 'V' },
    { id: 'rpm', label: 'Tốc độ động cơ', unit: 'vòng/phút' },
    { id: 'pmos', label: 'Tổn hao đóng ngắt MOSFET', unit: 'W' },
    { id: 'sound', label: 'Cảm nhận', unit: '' },
    { id: 'state', label: 'Trạng thái', unit: '' },
  ],
  scope: {
    window: 3,
    note: '(1 Hz & 10 Hz: thời gian thực · 100 Hz–20 kHz: dạng xung vẽ chậm còn 2 Hz; tốc độ động cơ luôn thời gian thực)',
    channels: [
      { name: 'CCP1 chân 17', unit: 'V', min: -0.5, max: 5.5, color: '#ff8c1a' },
      { name: 'V trung bình', unit: 'V', min: -0.5, max: 5.5, color: '#3fcf8e' },
      { name: 'Dòng động cơ', unit: 'A', min: 0, max: 2.2, color: '#ffd34d' },
      { name: 'Tốc độ', unit: 'rpm', min: 0, max: 13000, color: '#4cc2ff' },
    ],
  },

  info: {
    overview: `
      <p>Vi điều khiển chỉ xuất được 2 mức: <b>0 V</b> hoặc <b>5 V</b>. Muốn động cơ chạy nửa tốc độ? Ta <b>bật–tắt thật nhanh</b>: bật 50 % thời gian, tắt 50 % → động cơ "cảm thấy" điện áp trung bình bằng một nửa. Đó là <b>PWM</b> (Pulse Width Modulation — điều chế độ rộng xung).</p>
      <ul><li><b>Duty</b> (độ rộng xung) = thời gian mức cao / chu kỳ, 0–100 %.</li>
      <li><b>Tần số</b> = số chu kỳ mỗi giây. Phải đủ nhanh so với "quán tính" của tải (mắt người, rô-to động cơ).</li></ul>
      <p>Thử: chọn <b>1 Hz</b> — LED chớp tắt, động cơ giật cục. Lên <b>10 Hz</b> — LED nhấp nháy, động cơ rung. <b>100 Hz</b> — LED sáng đều, động cơ êm hơn. <b>1 kHz</b> — êm nhưng trong thực tế kêu rít. <b>20 kHz</b> — êm và im lặng: tần số của dự án. Kéo <b>Duty</b> để thấy V trung bình và tốc độ thay đổi.</p>`,
    specs: [
      ['Công thức', 'V_TB = D × V_cao ; T = 1/f ; t_cao = D × T'],
      ['PIC16F877A', '2 kênh PWM phần cứng CCP1 (RC2, chân 17), CCP2 (RC1, chân 16), dùng chung Timer2'],
      ['Tần số PIC', 'f = Fosc / (4·(PR2+1)·prescaler). 20 MHz, PR2 = 249, prescaler 1 → 20 kHz'],
      ['Độ phân giải', 'duty 10 bit, tối đa 4·(PR2+1) = 1000 bước ở 20 kHz (≈ 10 bit)'],
      ['Tần số thấp nhất (phần cứng)', '20 MHz / (4 × 256 × 16) ≈ 1.22 kHz — muốn thấp hơn phải dùng ngắt timer phần mềm'],
      ['ESP32 LEDC (quạt)', '20 kHz, 8 bit (0–255) trên GPIO4 — firmware/esp32s3/src/main.cpp'],
      ['Ngưỡng nghe', '~20 Hz–16/20 kHz → PWM động cơ chọn ≥ 20 kHz để không kêu'],
    ],
    principle: `
      <h4>1. Vì sao PWM không phí điện?</h4>
      <p>Công tắc (MOSFET) chỉ ở 2 trạng thái: <b>đóng hẳn</b> (V ≈ 0 trên nó → P ≈ I²·Rds rất nhỏ) hoặc <b>ngắt hẳn</b> (I = 0 → P = 0). So với giảm tốc bằng điện trở nối tiếp (phần áp dư thành nhiệt), PWM hiệu suất &gt; 95 %. Tổn hao chỉ xuất hiện trong lúc chuyển mạch: <code>P_sw ≈ ½·V·I·(t_r + t_f)·f</code> → tần số càng cao càng tốn.</p>
      <h4>2. Tải "lọc" xung thành trung bình</h4>
      <p>Động cơ có điện cảm L (lọc dòng, τe = L/R ≈ 0.2 ms) và quán tính rô-to (lọc tốc độ, τm = J·R/Ke² ≈ 0.12 s). Khi chu kỳ PWM ≪ τ, dòng và tốc độ gần như phẳng → động cơ chỉ "thấy" <code>D·V</code>. Mắt người lọc ánh sáng LED ở ~60–100 Hz.</p>
      <h4>3. PIC tạo PWM bằng phần cứng</h4>
      <ul><li>Timer2 đếm từ 0 lên PR2 rồi quay về 0 → mỗi lần quay về là đầu chu kỳ, chân CCP lên 1.</li>
      <li>Khi bộ đếm 10 bit (TMR2 + 2 bit prescaler) bằng giá trị duty <code>CCPR1L:CCP1CON&lt;5:4&gt;</code> → chân CCP xuống 0.</li>
      <li>CCS C: <code>setup_timer_2(T2_DIV_BY_1, 249, 10); setup_ccp1(CCP_PWM); set_pwm1_duty((int16)600);</code> → 20 kHz, 60 %.</li></ul>
      <h4>4. V_TB = D × V chỉ đúng khi dòng LIÊN TỤC</h4>
      <p>Ở 20 kHz chu kỳ 50 µs ≪ L/R = 0.2 ms → dòng động cơ chỉ gợn nhẹ, không bao giờ về 0 → điện áp trung bình đúng bằng <code>D·V</code>. Ở 1 Hz–1 kHz dòng về 0 giữa các xung (gián đoạn): lúc đó 2 đầu động cơ không phải 0 V mà bằng sức phản điện E → điện áp/tốc độ trung bình <b>cao hơn</b> D × V (xem số đo "V trung bình đo"). Bài Driver DRV8871 có hiện tượng tương tự ở chế độ thả trôi — vì vậy dự án nối qua 74HC32 để lúc PWM "nghỉ" là phanh (dòng liên tục) chứ không thả trôi.</p>
      <div class="tip">Chọn tần số: đủ cao để êm & không nghe thấy (≥ 20 kHz cho động cơ), nhưng không quá cao để MOSFET/driver không nóng và vẫn còn đủ độ phân giải (PR2 lớn).</div>`,
    inRobot: `
      <ul>
        <li><b>2 bánh</b>: PIC CCP1 (chân 17) / CCP2 (chân 16) → IC <b>74HC32</b> → DRV8871 IN1 = PWM OR nDIR, IN2 = PWM OR DIR (docs/01). PWM cao = phanh ở cả 2 chiều nên firmware ghi <code>duty = 1000 − |tốc độ|</code>: tốc độ 70 % → thanh ghi 300. <code>motor.c: setup_timer_2(T2_DIV_BY_1, 249, 10)</code>, duty 0…1000 (đơn vị ‰). Xem bài "Driver cầu H DRV8871".</li>
        <li><b>Vòng PI</b> mỗi 20 ms chỉnh duty theo số xung encoder (bật bằng lệnh CTRL) — PWM là "tay ga", PI là "người lái" giữ đúng tốc độ.</li>
        <li><b>Quạt hút</b>: ESP32-S3 GPIO4, LEDC 20 kHz 8 bit, <code>FAN_DEFAULT_PCT = 70</code>.</li>
        <li><b>Ramp</b>: <code>RAMP_STEP = 10</code> ‰/ms → duty không nhảy đột ngột, giảm dòng khởi động.</li>
        <li><b>Chổi</b>: hiện chỉ bật/tắt (RD5, RD6) — muốn điều tốc chổi thì cần thêm 1 PWM (ví dụ ngắt Timer phần mềm) và bắt buộc diode dập.</li>
      </ul>`,
    mistakes: `
      <ul>
        <li>Truyền biến <b>int8</b> vào <code>set_pwm1_duty()</code> của CCS → bị dịch trái 2 bit, duty lớn gấp 4 lần (thử trong Sự cố).</li>
        <li>Quên <code>setup_ccp1(CCP_PWM)</code> hoặc để chân RC2 là đầu vào (TRIS) → không có xung.</li>
        <li>Ghi duty &gt; 4·(PR2+1) → chân luôn ở mức 1 (100 %).</li>
        <li>PWM động cơ ở vài trăm Hz–vài kHz → kêu rít khó chịu, rung.</li>
        <li>Đẩy PWM lên hàng trăm kHz với trở cổng 100 Ω → MOSFET không kịp đóng/ngắt, nóng.</li>
        <li>Nối LED thẳng vào chân PWM không có điện trở → cháy LED, hỏng chân PIC.</li>
      </ul>`,
    quiz: [
      { q: 'PWM 14.4 V, duty 35 %. Điện áp trung bình bao nhiêu?', a: '0.35 × 14.4 ≈ 5.0 V.' },
      { q: 'Fosc 20 MHz, prescaler 4, muốn 5 kHz thì PR2 bằng bao nhiêu? Có bao nhiêu bước duty?', a: 'PR2 = 20 000 000 / (4 × 5 000 × 4) − 1 = 249. Số bước = 4 × 250 = 1000.' },
      { q: 'Vì sao dự án chọn 20 kHz mà không phải 1 kHz hay 200 kHz?', a: '1 kHz nằm trong vùng nghe được → động cơ kêu rít. 200 kHz → tổn hao đóng ngắt MOSFET/driver gấp 10 lần và PR2 chỉ còn 24 (100 bước duty). 20 kHz vừa trên ngưỡng nghe, vừa ít tổn hao, vẫn có 1000 bước.' },
    ],
  },

  faults: [
    { id: 'kieu-int8', label: 'CCS: truyền biến int8 vào set_pwm1_duty()', severity: 'loi',
      what: '<p>Ra lệnh bánh chạy chậm 10 % để dò mép bàn, robot lại chạy 40 % — nhanh gấp 4 lần. Lệnh 70 % thì lại chạy chậm lung tung.</p>',
      why: '<p>Trong CCS C, nếu đối số của <code>set_pwm1_duty()</code> là kiểu 8 bit, hàm hiểu đó là 8 bit CAO của giá trị 10 bit và dịch trái 2 bit: <code>duty10 = giá_trị × 4</code>. Muốn 100 ‰ (int8 = 100) → ra 400 ‰. Giá trị &gt; 255 (ví dụ 700) bị cắt còn 700 & 0xFF = 188 → ra 752 ‰.</p>',
      fix: '<p>Luôn ép kiểu: <code>set_pwm1_duty((int16)duty);</code> và khai báo biến duty là <code>int16</code> (firmware dự án: <code>int16 duty</code> trong <code>motor_output()</code>). Kiểm tra bằng máy hiện sóng/đồng hồ đo duty.</p>' },
    { id: 'quen-setup', label: 'Quên setup_ccp1(CCP_PWM) / để RC2 là đầu vào', severity: 'loi',
      what: '<p>Ghi duty bao nhiêu động cơ cũng đứng im, LED tắt. Đo chân 17: 0 V hoặc lơ lửng.</p>',
      why: '<p>Module CCP mặc định tắt sau reset; và chân RC2 phải được đặt làm đầu ra (TRISC.2 = 0) thì khối PWM mới điều khiển được chân. Thiếu một trong hai là không có xung.</p>',
      fix: '<p>Trình tự chuẩn (motor.c → motor_init): <code>output_low(PIN_C2); setup_timer_2(T2_DIV_BY_1, 249, 10); setup_ccp1(CCP_PWM); set_pwm1_duty((int16)0);</code></p>' },
    { id: 'tan-so-thap', label: 'PWM động cơ chỉ 100 Hz', severity: 'nhe',
      what: '<p>Động cơ ù ù, bánh rung, robot đi giật nhẹ; LED nhìn bằng mắt ổn nhưng quay bằng điện thoại thấy sọc nhấp nháy.</p>',
      why: '<p>Chu kỳ 10 ms ≫ τe = 0.2 ms: mỗi chu kỳ dòng động cơ lên rồi về 0 hoàn toàn → mô-men đập theo nhịp 100 Hz (nghe được, gây rung). Dòng dạng xung có giá trị hiệu dụng cao hơn dòng trung bình → cuộn dây nóng hơn ở cùng tốc độ.</p>',
      fix: '<p>Dùng PWM phần cứng ≥ 20 kHz cho động cơ. Với LED, ≥ 1 kHz để camera không thấy sọc.</p>' },
    { id: 'pwm-qua-nhanh', label: 'Đẩy PWM lên 200 kHz (PR2 = 24) qua trở cổng 100 Ω', severity: 'chay',
      what: '<p>Động cơ vẫn chạy nhưng MOSFET nóng bỏng sau ~1 phút (mô phỏng tua nhanh), có thể bốc khói; độ phân giải duty chỉ còn 100 bước.</p>',
      why: '<p>Mỗi lần đóng/ngắt mất ~2.4 µs (nạp tụ cổng 48 nC qua 100 Ω), trong khi chu kỳ chỉ 5 µs → MOSFET ở trạng thái "nửa vời" gần nửa thời gian: <code>P_sw ≈ ½ × 14.4 V × I × 2.4 µs × 200 kHz ≈ 3.5·I</code> W. Ở 1 A là 3.5 W → <code>Tj ≈ 30 + 3.5 × 62 ≈ 250 °C</code> khi không tản nhiệt.</p>',
      fix: '<p>Giữ 20 kHz. Nếu cần tần số cao: dùng IC kích cổng (gate driver) dòng 1–2 A, trở cổng nhỏ (5–10 Ω), MOSFET Qg thấp.</p>' },
    { id: 'led-khong-tro', label: 'Nối LED thẳng vào chân PWM, không có điện trở', severity: 'hong',
      what: '<p>LED lóe sáng chói rồi tắt hẳn (đứt bên trong) hoặc đổi màu, mùi khét nhẹ. Chân 17 của PIC có thể yếu hẳn từ đó (mức 1 không còn đủ 5 V).</p>',
      why: '<p>Không có điện trở hạn dòng: dòng chỉ bị giới hạn bởi điện trở trong của tầng ra PIC (~25–40 Ω): <code>I ≈ (5 − 2) / 35 ≈ 85 mA</code> — gấp 4 lần định mức LED (20 mA) và vượt giới hạn 25 mA/chân của PIC.</p>',
      fix: '<p>Luôn có điện trở nối tiếp: <code>R = (5 − 2) / 0.01 = 300 Ω</code> → 330 Ω. Tải lớn (động cơ, LED công suất) phải qua transistor/MOSFET.</p>' },
  ],

  build({ THREE, MAT, geom, label, readout, fx }) {
    const { mesh, group, part, cyl, box, pcb, wire, dipPackage } = geom;
    const root = new THREE.Group();
    root.add(part(pcb(80, 48, { mat: MAT.pcbBlue.clone() }), 'Bo thí nghiệm PWM', 'PIC16F877A phát PWM trên CCP1 (chân 17): một nhánh làm sáng LED, một nhánh kích MOSFET chạy động cơ.'));

    // ---------- PIC ----------
    const pic = dipPackage(40);
    pic.group.position.set(-10, 0, -6);
    root.add(pic.group);
    part(pic.body, 'PIC16F877A', 'Timer2 + CCP1 tạo PWM bằng phần cứng — CPU rảnh tay làm việc khác.');
    const pin17 = pic.pins[16];
    const pinMat = MAT.tin.clone();
    pin17.traverse((o) => { if (o.isMesh) o.material = pinMat; });
    part(pin17, 'Chân 17 — RC2/CCP1 (ra PWM)', 'Phát sáng khi đang ở mức 1. 20 kHz thật thì sáng mờ đều theo duty.');
    const xtal = group(mesh(box(11, 3.5, 4.5, 1.5), MAT.aluminum, { y: 1.75 }));
    xtal.position.set(-10 + 6.35 - 1.27, 0, 6.5);
    root.add(part(xtal, 'Thạch anh 20 MHz (HC-49)', 'Nhịp gốc Fosc. Timer2 đếm Fosc/4 = 5 MHz → 250 nhịp = 50 µs = 20 kHz.'));

    // ---------- LED + điện trở ----------
    const ledG = new THREE.Group();
    ledG.position.set(26, 0, 14);
    const ledMat = new THREE.MeshStandardMaterial({ color: 0xff3030, roughness: 0.2, transparent: true, opacity: 0.85, emissive: 0xff1010, emissiveIntensity: 0 });
    const ledBody = mesh(cyl(2.5, 2.5, 5.8, 32), ledMat, { y: 3.9 + 1 });
    const ledDome = mesh(new THREE.SphereGeometry(2.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), ledMat, { y: 7.7 });
    const ledFl = mesh(cyl(2.9, 2.9, 1, 32), ledMat, { y: 1.5 });
    const ledLegs = group(mesh(cyl(0.25, 0.25, 3, 8), MAT.tin, { x: -1.27, y: 0 }), mesh(cyl(0.25, 0.25, 3, 8), MAT.tin, { x: 1.27, y: 0 }));
    const led = group(ledBody, ledDome, ledFl, ledLegs);
    ledG.add(part(led, 'LED đỏ 5 mm', 'Vf ≈ 2 V, dòng định mức 10–20 mA. Độ sáng cảm nhận ∝ duty khi f ≥ ~100 Hz.'));
    root.add(ledG);
    const rLed = group(mesh(cyl(1.15, 1.15, 6.3, 20), new THREE.MeshStandardMaterial({ color: 0xd8c39a }), { rz: Math.PI / 2 }),
      ...[[-2, 0xf07f13], [-1, 0xf07f13], [0, 0x6b3a1e], [2.2, 0xc9a33a]].map(([x, c]) => mesh(cyl(1.2, 1.2, 0.5, 20, true), new THREE.MeshStandardMaterial({ color: c }), { x, rz: Math.PI / 2 })),
      mesh(cyl(0.3, 0.3, 11, 8), MAT.tin, { rz: Math.PI / 2 }));
    rLed.position.set(16, 2.2, 14);
    root.add(part(rLed, 'Điện trở 330 Ω (Cam–Cam–Nâu)', 'Hạn dòng LED: (5 − 2)/330 ≈ 9 mA.'));
    root.add(wire([[-10 + 16.51, 1.5, 1.6], [4, 2, 10], [10.5, 2.2, 14]], { radius: 0.3, color: 0xff8c1a }));

    // ---------- MOSFET + động cơ ----------
    const fet = new THREE.Group();
    fet.position.set(28, 0, -6);
    const fetBody = mesh(box(10, 9, 4.5, 0.3), MAT.icBody.clone(), { y: 7.5 });
    fet.add(fetBody, mesh(box(10, 15.5, 1.3), MAT.tin, { y: 10.75, z: -2.6 }), ...[-2.54, 0, 2.54].map((x) => mesh(box(0.8, 5.4, 0.5), MAT.tin, { x, y: 0.5 })));
    root.add(part(fet, 'MOSFET IRLZ44N', 'Chân PIC chỉ cho 25 mA ở 5 V → dùng MOSFET để đóng ngắt dòng động cơ ~0.3–2 A ở 14.4 V theo nhịp PWM.'));
    root.add(wire([[-10 + 16.51, 1.5, 1.6], [12, 3, -2], [25.5, 3, -6]], { radius: 0.3, color: 0xff8c1a }));
    const motor = new THREE.Group();
    motor.position.set(26, 14, -30);
    motor.add(mesh(cyl(12, 12, 30, 40), MAT.steel, { rz: Math.PI / 2 }), mesh(cyl(12, 12, 4, 40), MAT.plasticWhite, { x: -17, rz: Math.PI / 2 }));
    const fan = new THREE.Group();
    fan.position.x = 19;
    fan.add(mesh(cyl(1, 1, 6, 12), MAT.steel, { x: -2, rz: Math.PI / 2 }));
    for (let k = 0; k < 3; k++) {
      // cánh dài theo trục Y, xoay quanh trục X một góc θ → hướng (0, cosθ, sinθ); tâm cánh cách trục 9 mm
      const th = (k * 2 * Math.PI) / 3;
      fan.add(mesh(box(1.2, 18, 4, 0.4), k === 0 ? MAT.plasticYellow : MAT.plasticDark, { x: 1, y: 9 * Math.cos(th), z: 9 * Math.sin(th), rx: th }));
    }
    motor.add(fan);
    root.add(part(motor, 'Động cơ DC (giống động cơ bánh) + cánh đánh dấu', 'Quay chậm vẽ 60×. Ở 1 Hz thấy rõ tăng tốc–giảm tốc theo từng xung.'));
    root.add(wire([[28, 2, -8], [30, 6, -16], [9, 14, -30]], { radius: 0.5, color: 0x1d1f23 }));

    // ---------- dải sóng 3D ----------
    const waveG = new THREE.Group();
    waveG.position.set(0, 46, -6);
    const NW = 300;
    const wGeo = new THREE.BufferGeometry();
    wGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NW * 3), 3));
    const waveLine = new THREE.Line(wGeo, new THREE.LineBasicMaterial({ color: 0xff8c1a }));
    const avgGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-45, 0, 0), new THREE.Vector3(45, 0, 0)]);
    const avgLine = new THREE.Line(avgGeo, new THREE.LineBasicMaterial({ color: 0x3fcf8e }));
    const baseLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-45, 0, 0), new THREE.Vector3(45, 0, 0)]), new THREE.LineBasicMaterial({ color: 0x556070 }));
    const backdrop = mesh(box(96, 22, 0.4), new THREE.MeshStandardMaterial({ color: 0x0b1218, roughness: 0.9, transparent: true, opacity: 0.6 }), { y: 8, z: -0.6 });
    backdrop.castShadow = false;
    waveG.add(part(backdrop, 'Dạng sóng PWM (3 chu kỳ)', 'Cam: điện áp chân CCP1 (0 hoặc 5 V). Xanh lá: mức trung bình D × 5 V. Chiều rộng mức cao / chu kỳ = duty.'));
    waveG.add(waveLine, avgLine, baseLine);
    root.add(waveG);
    const WH = 16;

    label(pic.group, 'PIC16F877A', [0, 6, 0]);
    label(root, 'CCP1 = chân 17', [-10 + 16.51, 4, 12]);
    label(ledG, 'LED + 330 Ω', [0, 12, 0]);
    label(fet, 'MOSFET', [0, 20, 0]);
    label(motor, 'Động cơ', [0, 15, 0]);
    label(waveG, 'Dạng sóng PWM · trung bình', [0, 21, 0]);

    // ---------- trạng thái ----------
    let iM = 0, w = 0, ang = 0, ph = 0, phShow = 0, fault = null, tMos = 30, heated = false, ledDead = false, smoked = false, ledT = 0;
    const rec = new Float32Array(NREC);
    const resetAll = () => { fault = null; tMos = 30; ledDead = false; smoked = false; ledT = 0; };

    return {
      object: root,
      triggerFault(id) {
        resetAll(); fault = id;
        if (id === 'led-khong-tro') { ledT = 0.6; fx.flash(ledG, { size: 20, color: 0xff4040, intensity: 5 }); }
      },
      resetFault() { resetAll(); },
      update(dt, t, p) {
        let f = Number(p.f);
        let D = p.duty / 100;
        const want = Math.round(D * 1000);
        let reg = `${want} / 1000`;
        if (fault === 'tan-so-thap') f = 100;
        if (fault === 'pwm-qua-nhanh') f = 200000;
        if (fault === 'kieu-int8') { const v8 = want & 0xff; D = Math.min(1, (v8 * 4) / 1000); reg = `int8 ${v8} → ×4 = ${v8 * 4} ‰ (muốn ${want} ‰)`; }
        const noOut = fault === 'quen-setup';
        if (noOut) D = 0;
        const tm = timer2For(f);
        if (tm && fault !== 'kieu-int8') {
          const steps = tm.steps;
          reg = `${Math.round(D * steps)} / ${steps}`;
        }

        // ----- mức logic tức thời -----
        const realTime = f <= 10;
        ph = (ph + f * dt) % 1;
        phShow = (phShow + (realTime ? f : 2) * dt) % 1;
        const hiNow = (realTime ? ph : phShow) < D;
        // ----- động cơ: mô phỏng dòng điện thật (có L, diode dập) ở mọi tần số -----
        const hMax = Math.min(1 / (20 * f), 50e-6);
        const nSub = Math.min(8000, Math.max(8, Math.ceil(dt / hMax)));
        const h = dt / nSub;
        let iSum = 0, vSum = 0;
        let phLoc = (ph - f * dt + 1) % 1;
        for (let k = 0; k < nSub; k++) {
          phLoc = (phLoc + f * h) % 1;
          const on = phLoc < D;
          const E = KE * w;
          let vM;
          if (on) { iM += ((VBAT - iM * R_M - E) / L_M) * h; vM = VBAT; }
          else if (iM > 0) { iM += ((-0.5 - iM * R_M - E) / L_M) * h; if (iM < 0) iM = 0; vM = -0.5; }
          else { iM = 0; vM = E; }
          if (iM < 0) iM = 0;
          rec[Math.min(NREC - 1, Math.floor(phLoc * NREC))] = iM;
          iSum += iM; vSum += vM;
          const tm2 = KE * iM, tl = T_FRIC + T_LOAD;
          if (w < 0.5 && tm2 <= tl) { w = 0; continue; }
          w += ((tm2 - B * w - tl) / J) * h;
          if (w < 0) w = 0;
        }
        const iAvg = iSum / nSub;
        const vMotAvg = vSum / nSub;
        const iShow = realTime ? iM : rec[Math.min(NREC - 1, Math.floor(phShow * NREC))];
        // ----- MOSFET nóng do đóng ngắt -----
        const pSw = 0.5 * VBAT * iAvg * Math.min(1 / f, TSW) * f * (D > 0 && D < 1 ? 1 : 0);
        tMos += ((pSw - (tMos - 30) / 62) / 1.5) * dt * 10;
        const hot = Math.max(0, (tMos - 70) / 150);
        if (hot > 0.02) { fx.heat(fetBody, hot); heated = true; } else if (heated) { fx.heat(fetBody, 0); heated = false; }
        if (tMos > 160 && !smoked) { smoked = true; fx.smoke(fet, { size: 6, duration: 5 }); }

        // ----- hình ảnh -----
        ang += (w / SLOW_VIS) * dt;
        fan.rotation.x = ang;
        let bright = realTime ? (hiNow ? 1 : 0) : D;
        if (f === 100) bright = D * (0.9 + 0.1 * Math.sin(t * 40));
        if (fault === 'led-khong-tro') {
          if (ledT > 0) { ledT -= dt; bright = 3; if (ledT <= 0 && !ledDead) { ledDead = true; fx.scorch(led, 0.6); fx.smoke(ledG, { size: 3, duration: 2 }); } }
        }
        if (ledDead) bright = 0;
        ledBody.material.emissiveIntensity = 2.2 * bright;
        ledDome.material.emissiveIntensity = 2.2 * bright;
        const pinOn = realTime ? (hiNow ? 1 : 0) : D;
        pinMat.emissive.setRGB(pinOn, pinOn * 0.55, 0);
        pinMat.emissiveIntensity = 1.2;
        // dải sóng
        waveG.visible = p.wave;
        if (p.wave) {
          const a = wGeo.attributes.position;
          const scroll = realTime ? ph : phShow;
          for (let k = 0; k < NW; k++) {
            const u = k / (NW - 1);
            const x = -45 + 90 * u;
            const cyc = (u * 3 + 3 - scroll) % 1;
            a.setXYZ(k, x, (cyc < D ? 1 : 0) * WH, 0);
          }
          a.needsUpdate = true;
          avgLine.position.y = D * WH;
        }

        // ----- số đo -----
        const T = 1 / f;
        const fmtT = (s) => (s >= 1e-3 ? `${(s * 1000).toPrecision(3)} ms` : `${(s * 1e6).toPrecision(3)} µs`);
        readout('reg', noOut ? 'CCP chưa bật → không có xung' : reg);
        readout('pr2', tm ? `PR2 = ${tm.pr2}, chia ${tm.pre} → ${(tm.fReal >= 1000 ? (tm.fReal / 1000).toFixed(2) + ' kHz' : tm.fReal.toFixed(0) + ' Hz')}, ${Math.log2(tm.steps).toFixed(1)} bit` : `< 1.22 kHz: Timer2 không làm được → ngắt timer phần mềm`);
        readout('per', `T = ${fmtT(T)} · cao ${fmtT(D * T)}`);
        readout('vled', D * 5);
        readout('vmot', vMotAvg);
        readout('rpm', (w * 60) / (2 * Math.PI));
        readout('pmos', pSw);
        readout('sound', f < 20 ? 'Thấy từng nhịp: giật cục' : f < 16000 ? `Kêu rít/ù ở ${f >= 1000 ? f / 1000 + ' kHz' : f + ' Hz'}` : f > 100000 ? 'Im lặng nhưng MOSFET nóng' : 'Êm, im lặng (trên ngưỡng nghe)');
        let state = 'Bình thường';
        if (fault === 'kieu-int8') state = `⚠️ Muốn ${(want / 10).toFixed(0)} % nhưng ra ${(D * 100).toFixed(0)} %`;
        if (noOut) state = '⚠️ Không có xung trên chân 17 — động cơ đứng';
        if (fault === 'tan-so-thap') state = 'ℹ️ 100 Hz: dòng về 0 mỗi chu kỳ → mô-men đập, ù và rung';
        if (fault === 'pwm-qua-nhanh') state = `🔥 200 kHz: MOSFET đóng ngắt "nửa vời", ${tMos.toFixed(0)} °C — chỉ còn ${tm ? tm.steps : 100} bước duty`;
        if (fault === 'led-khong-tro') state = ledDead ? '⚡ LED đã cháy (~85 mA > 20 mA), chân 17 bị quá tải > 25 mA' : '⚡ LED chói lóa ~85 mA…';
        readout('state', state);
        return [(realTime ? (hiNow ? 5 : 0) : (phShow < D ? 5 : 0)), D * 5, iShow, (w * 60) / (2 * Math.PI)];
      },
    };
  },
};
