// 📐 Thư viện CAD — trưng bày mọi mô hình CAD thật (STEP → GLB) đã xuất vào lab/public/models.
// Danh mục: lab/public/models/manifest.json (do cad/build_all.py sinh ra).
import { findNode, ownMaterial } from '../../core/cadParts.js';

// mô hình → bài học liên quan (khớp theo đường dẫn GLB, quy tắc đầu tiên khớp được dùng)
const LESSONS = [
  [/robot-vacuum-assembly/, 'robot-assembly'], [/pic16f877a|dip_40/, 'pic16f877a'], [/esp32|xiao/, 'esp32-s3'],
  [/bss138|sot_23/, 'bss138-level-shifter'], [/pickit|pinheader_1x06_p2_54mm_vertical/, 'mach-nap-pickit'], [/crystal/, 'thach-anh'],
  [/xl4015|lm2596|to_263|l_bourns|potentiometer/, 'buck-xl4015'], [/cell-18650|batteryholder/, 'pin-18650'],
  [/battery-4s1p|4s-bms|xt60/, 'pack-4s-bms'], [/fuseholder/, 'cau-chi'], [/to_220|to_252/, 'mosfet'],
  [/d_sma|d_do_41|led_d/, 'diode'], [/cp_radial|c_disc/, 'tu-dien'], [/r_axial/, 'dien-tro'],
  [/drv8871|ti_so_powerpad|dip_14|74hc32/, 'driver-drv8871'], [/rs360|dc_toy_motor|micro_dc_motor|tt_motor/, 'dong-co-dc'],
  [/bldc-fan/, 'quat-bldc'], [/microswitch|micro_switch/, 'cong-tac-hanh-trinh'], [/cliff|tcrt5000|itr8307|gp2y0a41|to_92/, 'cliff-ir'],
  [/gy-521|qfn_24/, 'mpu6050'], [/lidar/, 'lidar-lds'], [/wheel-module/, 'banh-xe'], [/caster/, 'banh-xoay'], [/robot\/bumper/, 'bumper'],
  [/main-brush/, 'choi-cuon'], [/side-brush|n20/, 'choi-canh'], [/dust-bin/, 'hop-bui'], [/chassis|top-cover/, 'vo-khung'],
  [/screw|nut_m3|washer|standoff|insert/, 'oc-vit'], [/bearing/, 'hop-so'], [/breadboard|perfboard|pinsocket|pinheader|jst_|idc_/, 'ban-mach-tu-do'],
];
const lessonOf = (path) => LESSONS.find(([re]) => re.test(path))?.[1] || null;

// màu tô nút tương tác theo loại (manifest `interact`)
const ITYPE = [
  [/button|knob|slider|slide$|lever/, 0xffaa00, 'nút/cần gạt'], [/spin|hinge|swivel|shaft|rotary|fan/, 0x33ccff, 'quay/bản lề'],
  [/connector|usb|terminal|pad|socket|jack|slot|rj45|hdmi|jst|contact/, 0x55ff88, 'đầu nối'], [/led|camera/, 0xff3366, 'đèn/quang'],
  [/screw|nut|washer|standoff|insert/, 0xffee55, 'ốc vít'], [/pin/, 0xaa88ff, 'chân'], [/lid|lift|pull|remove|module|ic|sensor|spring/, 0xff66ff, 'tháo/lắp'],
];
const itype = (t = '') => ITYPE.find(([re]) => re.test(t)) || [null, 0xffffff, t || 'khác'];

const GROUPS = ['Tất cả', 'IC', 'Thụ động', 'Bán dẫn', 'Đầu nối', 'Module', 'Board', 'Nguồn', 'Cảm biến', 'Động cơ', 'Cơ khí', 'Ốc vít', 'Robot', 'Dụng cụ'];

export default {
  id: 'thu-vien-cad',
  name: 'Thư viện CAD — mọi linh kiện',
  category: 'cad',
  order: 0,
  icon: '📐',
  summary: 'Mô hình CAD đúng kích thước datasheet của từng linh kiện (lấy từ kho step.parts hoặc dựng bằng build123d), xếp thành lưới để so sánh. Rê chuột để xem tên & nguồn.',
  tags: ['CAD', 'STEP', 'GLB', 'build123d', 'step.parts', 'mô hình thật'],
  params: [
    { id: 'group', label: 'Nhóm', type: 'select', value: 'Tất cả', options: GROUPS.map((g) => [g, g]) },
    { id: 'explode', label: 'Tách lớp (mô hình lắp ráp)', type: 'range', min: 0, max: 1.5, step: 0.01, value: 0, unit: '×', hint: 'Đẩy các cụm con ra xa tâm theo cây node của GLB' },
    { id: 'interact', label: '🎯 Xem nút tương tác (manifest)', type: 'toggle', value: false, hint: 'Tô sáng các node có dữ liệu interact: nút bấm, bản lề, trục quay, đầu nối, ốc vít…' },
    { id: 'spin', label: 'Xoay từng mô hình', type: 'toggle', value: false },
  ],
  readouts: [{ id: 'n', label: 'Số mô hình đang hiện', unit: '' }, { id: 'ni', label: 'Nút tương tác (đã tô)', unit: '' }, { id: 'src', label: 'Nguồn', unit: '' }],
  info: {
    overview: `<p>Đây là <b>mô hình CAD thật</b>, không phải hình tượng trưng: kích thước, bước chân, khấc, gờ… theo bản vẽ datasheet.
      Linh kiện tiêu chuẩn (ốc, đai ốc, ổ bi, header, JST, XT60, vỏ DIP/TO-220…) tải từ kho <b>step.parts</b>;
      linh kiện đặc thù (board ESP32-S3-DevKitC, module DRV8871, vỏ robot…) dựng bằng <b>build123d</b> (Python, nhân OpenCascade) theo bản vẽ kỹ thuật.</p>
      <p>Thử: chọn nhóm <b>Ốc vít</b>, phóng to sát vào ren; bật <b>Khung dây</b> để thấy lưới tam giác của mô hình.
      Chọn nhóm <b>Robot</b> rồi kéo <b>Tách lớp</b> để các cụm con bung ra; bật <b>Xem nút tương tác</b> để thấy chỗ nào bấm/xoay/cắm được
      (cam = nút/cần gạt, xanh dương = trục quay/bản lề, xanh lá = đầu nối, đỏ = LED, vàng = ốc vít, tím = chân linh kiện).
      Bấm vào một mô hình để ghim thông tin — có liên kết <b>📖 Bài học</b>; bấm vào nhãn tên (có dấu ↗) để mở thẳng bài học.</p>`,
    specs: [['Định dạng gốc', 'STEP (ISO 10303) — chuẩn trao đổi CAD'], ['Hiển thị', 'GLB (glTF 2.0), đơn vị mét → đổi sang mm'], ['Công cụ', 'cadgen 0.7.5 (text-to-cad), build123d, OpenCascade'], ['Nguồn chuẩn', 'step.parts (~16 800 mô hình, phần lớn từ thư viện 3D KiCad)']],
    principle: `<h4>STEP vs lưới tam giác</h4><p>STEP lưu hình học <b>chính xác</b> (mặt trụ, mặt phẳng, cung tròn…). Để vẽ trên web, cadgen <b>tam giác hóa</b> với dung sai nhỏ → GLB. Muốn đo chính xác hay gia công thì dùng file STEP trong thư mục <code>cad/</code>.</p>`,
    inRobot: `<p>Các file nằm ở <code>cad/</code> (mã nguồn mô hình <code>cad/src/*.py</code>, STEP gốc, GLB). Có thể mở bằng FreeCAD/Fusion 360 để thiết kế giá đỡ, in 3D, đặt gia công.</p>`,
    mistakes: `<ul><li>Quên đổi đơn vị: GLB tính bằng mét, KiCad/STEP thường mm → lệch 1000 lần.</li><li>Dùng mô hình "generic" cho linh kiện có biến thể (DIP-40 rộng 600 mil vs 300 mil) → sai khoảng cách hàng chân.</li></ul>`,
    quiz: [{ q: 'Vì sao lưu mô hình gốc ở STEP mà không chỉ STL/GLB?', a: 'STEP giữ hình học chính xác (mặt cong toán học, kích thước), sửa/đo/gia công được; STL/GLB chỉ là lưới tam giác xấp xỉ để hiển thị/in.' }],
  },

  build({ THREE, geom, cad, cadManifest, readout, label, viewer, catalog }) {
    const root = new THREE.Group();
    let models = [];
    let tiles = [];
    let lastGroup = null, lastExplode = -1, lastInteract = null;
    const spacing = 90;
    const lessonName = (id) => (catalog || []).find((d) => d.id === id)?.name || id;

    function describe(m) {
      const les = lessonOf(m.path);
      const inter = (m.interact || []).filter((it) => it.node && it.type !== 'pin');
      return `<b>${m.group || ''}</b>${m.dims ? ' · ' + m.dims : ''}<br>Nguồn: ${m.source || '—'}${m.note ? '<br>' + m.note : ''}` +
        (inter.length ? `<br>🎯 ${inter.length} nút tương tác: ${[...new Set(inter.map((it) => it.node))].slice(0, 8).join(', ')}${inter.length > 8 ? '…' : ''}` : '') +
        `<br><small><code>${m.path}.glb</code></small>` +
        (les ? `<br><a href="#/c/${les}">📖 Bài học: ${lessonName(les)} →</a>` : '');
    }

    // node tương tác: theo manifest (tên chính xác, đường dẫn a/b, hoặc tiền tố "btn_boot" → "btn_boot_sw") + extras.interact trong GLB
    function interactNodes(m, obj) {
      const out = new Map();
      const add = (n, it) => { if (n && !out.has(n)) out.set(n, it); };
      for (const it of m.interact || []) {
        if (!it.node) continue;
        if (it.type === 'pin' && /^pin_\d+$/.test(it.node) && it.count) {
          for (let k = 1; k <= it.count; k++) obj.traverse((o) => { if (o.name === `pin_${k}`) add(o, it); });
          continue;
        }
        let n = it.node.includes('/') ? findNode(obj, it.node) : null;
        if (!n) obj.traverse((o) => { if (!n && o.name === it.node) n = o; });
        if (!n) obj.traverse((o) => { if (!n && o.name.startsWith(it.node + '_')) n = o; });
        add(n, it);
      }
      obj.traverse((o) => { if (o.userData?.interact && !out.has(o)) out.set(o, o.userData.interact); });
      return out;
    }

    // cây node: tìm node đầu tiên có ≥ 2 con không phải chân linh kiện → các con đó là "cụm" để tách lớp
    function explodeParts(obj) {
      const q = [obj];
      while (q.length) {
        const n = q.shift();
        const kids = n.children.filter((c) => !/^pin_/.test(c.name) && !c.userData.isLabel);
        if (kids.length >= 2) {
          n.updateWorldMatrix(true, true);
          const toLocal = (o) => n.worldToLocal(new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()));
          const c0 = toLocal(n);
          return kids.map((k) => ({ node: k, base: k.position.clone(), dir: toLocal(k).sub(c0) }));
        }
        q.push(...n.children);
      }
      return [];
    }

    function prepare(tile) {
      const o = tile.userData.model, m = tile.userData.m;
      const obj = o.children.find((c) => c.isObject3D && !c.userData.isLabel && c.type === 'Group') || o.children[0];
      if (!obj) return;
      tile.userData.parts = explodeParts(obj);
      tile.userData.inter = interactNodes(m, obj);
      const les = lessonOf(m.path);
      for (const [n, it] of tile.userData.inter) {
        if (it.type === 'pin') continue;
        const [, , kind] = itype(it.type);
        const extra = [it.net && `Tín hiệu: ${it.net}`, it.note, it.travel_mm && `hành trình ${it.travel_mm} mm`, it.angle_deg && `góc ${it.angle_deg}°`, it.turns && `${it.turns} vòng`, it.rpm_nominal && `${it.rpm_nominal} vòng/phút`, it.pins && `chân: ${it.pins.join(', ')}`]
          .filter(Boolean).join(' · ');
        n.userData.part = { name: `${m.name} › ${n.name}`, desc: `🎯 ${kind} (${it.type || '?'})${extra ? '<br>' + extra : ''}${les ? `<br><a href="#/c/${les}">📖 Bài học: ${lessonName(les)} →</a>` : ''}` };
      }
      tile.userData.prepared = true;
    }

    function applyExplode(tile, k) {
      for (const p of tile.userData.parts || []) p.node.position.copy(p.base).addScaledVector(p.dir, k);
    }

    function applyInteract(tile, on) {
      let n = 0;
      for (const [node, it] of tile.userData.inter || []) {
        const [, col] = itype(it.type);
        node.traverse((o) => {
          if (!o.isMesh) return;
          const mat = ownMaterial(o);
          if (!mat?.emissive) return;
          if (o.userData._galEm === undefined) o.userData._galEm = [mat.emissive.getHex(), mat.emissiveIntensity];
          if (on) { mat.emissive.setHex(col); mat.emissiveIntensity = 0.9; }
          else { mat.emissive.setHex(o.userData._galEm[0]); mat.emissiveIntensity = o.userData._galEm[1]; }
        });
        n++;
      }
      return n;
    }

    function layout(group) {
      // nhãn CSS2D của ô cũ không tự rời DOM khi chỉ gỡ ô cha → gỡ thủ công
      for (const t of tiles) { t.traverse((o) => { if (o.isCSS2DObject) o.element?.remove(); }); root.remove(t); }
      tiles = [];
      const list = models.filter((m) => group === 'Tất cả' || m.group === group);
      const cols = Math.max(1, Math.ceil(Math.sqrt(list.length)));
      list.forEach((m, i) => {
        const tile = new THREE.Group();
        tile.position.set((i % cols - (cols - 1) / 2) * spacing, 0, (Math.floor(i / cols)) * spacing);
        const base = geom.mesh(geom.box(80, 2, 80, 1), new THREE.MeshStandardMaterial({ color: 0x2a3340, roughness: 0.9 }), { y: -1 });
        base.castShadow = false;
        tile.add(base);
        const obj = cad(m.path, { part: { name: m.name, desc: describe(m) } });
        // tự co các mô hình lớn để vừa ô 80 mm (ghi chú tỉ lệ trong nhãn)
        obj.userData.fit = true;
        tile.add(obj);
        const les = lessonOf(m.path);
        const lb = label(tile, les ? `${m.name} ↗` : m.name, [0, 0, 44]);
        if (lb?.element && les) {
          lb.element.style.pointerEvents = 'auto';
          lb.element.style.cursor = 'pointer';
          lb.element.title = `Mở bài học: ${lessonName(les)}`;
          lb.element.addEventListener('click', () => { location.hash = `#/c/${les}`; });
        }
        tile.userData.model = obj;
        tile.userData.m = m;
        root.add(tile);
        tiles.push(tile);
      });
      readout('n', list.length);
      readout('src', 'step.parts + build123d');
      root.userData.framed = false;
      lastExplode = -1; lastInteract = null;
    }

    cadManifest().then((mf) => { models = mf.models || []; layout(lastGroup || 'Tất cả'); });

    return {
      object: root,
      update(dt, t, p) {
        if (p.group !== lastGroup) { lastGroup = p.group; if (models.length) layout(p.group); }
        let pending = 0, fresh = false;
        for (const tile of tiles) {
          const o = tile.userData.model;
          if (!o.userData.cadLoaded && !o.userData.cadError) pending++;
          if (o.userData.cadLoaded && o.userData.fit && !o.userData.fitted) {
            const bb = new THREE.Box3().setFromObject(o);
            const s = bb.getSize(new THREE.Vector3());
            const k = Math.min(1, 70 / Math.max(s.x, s.z, s.y));
            o.scale.setScalar(k);
            o.userData.fitted = true;
          }
          if (o.userData.cadLoaded && !tile.userData.prepared) { prepare(tile); fresh = true; }
          if (p.spin) o.rotation.y += dt * 0.6;
        }
        const ex = p.explode ?? 0, on = !!p.interact;
        if (fresh || ex !== lastExplode) { for (const tile of tiles) applyExplode(tile, ex); lastExplode = ex; }
        if (fresh || on !== lastInteract) {
          let n = 0;
          for (const tile of tiles) n += applyInteract(tile, on);
          readout('ni', on ? n : 0);
          lastInteract = on;
        }
        // căn lại camera khi mọi mô hình của nhóm đã tải xong (kích thước thật mới biết được)
        if (tiles.length && !pending && !root.userData.framed) { root.userData.framed = true; viewer?.frame(); }
        if (pending) root.userData.framed = false;
      },
    };
  },
};
