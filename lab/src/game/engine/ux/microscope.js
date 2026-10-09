// =============================================================================
// ux/microscope.js — KÍNH HIỂN VI SOI MẠCH (stereo zoom 7×–45×) + kính hiển vi USB có màn hình.
//
// Mô hình: dùng CAD của phòng lab nếu có (world.anchors['microscope'] = tiêu điểm trên bàn, 'microscope-eye', các node
//   knob_zoom / knob_focus / knob_light / eyepiece_l / eyepiece_r / screen) — chưa có thì tự dựng một kính hiển vi đơn giản
//   (đế + trụ + tay ngang + đầu kính + 2 thị kính + đèn vòng) đặt sau kẹp mạch ở bàn hàn + kính USB cổ ngỗng + màn hình 7".
//
// Chế độ xem qua kính (đang NGỒI ở bàn có kính): [E] "Nhìn qua kính hiển vi" → camera quang học nhìn thẳng xuống tiêu điểm
//   (app.viewCamera), viền thị kính tròn, tâm + thước mm, độ sâu trường ảnh (BokehPass khi chất lượng ≥ Cao, mờ giả CSS khi thấp),
//   run tay phóng đại (ux/precision.js). Chế độ tỉ mỉ BẬT sẵn: con trỏ trên mặt phẳng tiêu cự, mũi hàn thấy được trong ảnh.
//   Cuộn: độ phóng đại (Shift = mịn) · R/F: chỉnh nét (giữ) · W/A/S/D: dời bàn soi ±40 mm · L: đèn vòng 0–100 % ·
//   V: tâm + thước đo · I: ĐÁNH GIÁ MỐI HÀN dưới tâm kính → 'solder:inspected' · E / Space / Esc: rời kính.
//   Chuột trái / phải: hàn & mớm thiếc như bình thường (interact), phím 1–9 / Q đổi dụng cụ.
//
// 'solder:inspected' { pad, padId, board, quality (thật), observed (đã thấy | 'unknown'), visible, reason, magnification,
//                       sharpness, light, point, by:'microscope' }  — nhiệm vụ / minigame hàn dùng để chấm IPC.
// Kính USB: camera cố định nhìn xiên vào tiêu điểm → RenderTarget 512×320, cập nhật ~10 Hz khi người chơi ở gần, hiện lên
//   node 'screen' (dùng được cả khi đứng). [E] trên màn hình: bật / tắt.
// API: microscope.active · enter() · exit() · mag · focusD · light · reticle · inspect() · canEnter() → {ok, reason}
//      microscope.focal (Vector3) · cam (PerspectiveCamera) · usb { on, cam, rt, screen }
// [bàn 3D] Vào từ chế độ bàn 3D (phím M / E trên kính): con trỏ chuột thật (ux/bench.js) giữ trong vòng thị kính; rời kính → về bàn 3D.
// =============================================================================
import * as THREE from 'three';
import { labState } from '../../world/_labState.js';

const WD = 100;                     // mm — khoảng làm việc (vật kính → tiêu điểm)
const CAM_H = WD - 8;               // camera quang học đặt ngay dưới đèn vòng (không bị vòng đèn che khi dời bàn soi)
const MAG_MIN = 7, MAG_MAX = 45;
const FIELD_NUM = 200;              // Ø trường nhìn (mm) = 200 / độ phóng đại (thị kính WF10×/20)
// độ phóng đại tối thiểu để NHẬN RA từng loại lỗi (cầu thiếc nhỏ cần ≥ 10×, bong pad ≥ 15×)
export const MIN_MAG = { empty: 7, good: 7, excess: 7, cold: 10, bridge: 10, lifted: 15, molten: 7, heating: 7 };
const STATE_VI = { empty: 'Trống', good: 'Đẹp ✓', excess: 'Thừa thiếc', cold: 'Hàn nguội ✗', bridge: 'Cầu thiếc ✗', lifted: 'Bong pad ✗', molten: 'Đang chảy', heating: 'Đang nung' };
const STATE_CLS = { good: '', excess: 'warn', cold: 'bad', bridge: 'bad', lifted: 'bad', empty: 'unk', molten: 'warn', heating: 'warn' };
const LIGHT_STEPS = [0, 0.25, 0.5, 0.75, 1];

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

export function fieldOf(mag) { return FIELD_NUM / mag; }
export function dofOf(mag) { return 2.2 * Math.pow(7 / mag, 1.2); }

export class Microscope {
  constructor(game, ux) {
    this.game = game;
    this.ux = ux;
    this.active = false;
    this._st = null;               // labState(game).microscope của prop CAD (zoom 0.7–4.5, focus ±20 mm, light, brightness)
    this._mag = 10;
    this._focusD = CAM_H;
    this._light01 = 0.75;
    this.reticle = true;
    this.pan = new THREE.Vector2();
    this.focal = new THREE.Vector3();
    this.root = null;              // gốc mô hình (CAD hoặc dự phòng)
    this.cad = false;
    this.nodes = {};
    this.marks = [];
    this.cam = new THREE.PerspectiveCamera(20, 16 / 9, 2, 3000);
    this.cam.name = 'microscope-camera';
    this._ray = new THREE.Raycaster();
    this._depth = WD;
    this.sharpness = 1;
    this.usb = { on: true, cam: null, rt: null, screen: null, t: 0 };
    this._msgT = 0;
  }

  // ------------------------------------------------------------------ trạng thái (dùng chung với prop CAD nếu có)
  get mag() { return this._st ? this._st.zoom * 10 : this._mag; }
  set mag(v) {
    if (!this._st) { this._mag = v; return; }
    const z = THREE.MathUtils.clamp(v / 10, 0.7, 4.5);
    this._st.zoom = z; this._st.mag = Math.round(z * 100) / 10;
  }
  get light() { return this._st ? (this._st.light ? this._st.brightness : 0) : this._light01; }
  set light(v) {
    if (!this._st) { this._light01 = v; return; }
    this._st.light = v > 0.01; if (v > 0.01) this._st.brightness = Math.max(0.05, v);
  }
  /** khoảng cách camera quang học → mặt phẳng nét (mm); prop CAD lưu dạng focus ±20 mm quanh tiêu điểm */
  get focusD() { return this._st ? CAM_H - this._st.focus : this._focusD; }
  set focusD(v) { if (this._st) this._st.focus = THREE.MathUtils.clamp(CAM_H - v, -20, 20); else this._focusD = v; }

  // ------------------------------------------------------------------ dựng / tìm mô hình
  init() {
    const game = this.game;
    const world = game.world || {};
    const anchors = world.anchors || {};
    // 1) CAD của phòng lab
    const a = anchors.microscope || findByName(world.root, /^microscope(-focal)?$/i);
    if (a) {
      this.cad = true;
      this.anchor = a;
      if (labState(game).microscope) this._st = labState(game).microscope;
      a.getWorldPosition(this.focal);
      for (const n of ['knob_zoom', 'knob_focus', 'knob_light', 'eyepiece_l', 'eyepiece_r', 'screen', 'usb_cam', 'head']) {
        const o = findByName(world.root, new RegExp(`^${n}$`, 'i'), this.focal, 1500);
        if (o) this.nodes[n] = o;
      }
      // gốc mô hình CAD: mốc 'microscope-root' → node tên kính hiển vi có mesh → hộp tàng hình trên tiêu điểm (không bao giờ là cả phòng)
      let r = anchors['microscope-root'] || null;
      if (!r) {
        const cand = findByName(world.root, /stereo[-_ ]?microscope|microscope[-_ ]?(model|body|cad)/i, this.focal, 800);
        if (cand && cand !== world.root && hasMesh(cand)) r = cand;
      }
      if (!r) {
        r = new THREE.Mesh(new THREE.BoxGeometry(90, 140, 120), new THREE.MeshBasicMaterial({ visible: false }));
        r.name = 'microscope-proxy';
        r.position.copy(this.focal).add(new THREE.Vector3(0, WD + 80, 0));
        r.userData.uxProxy = true;
        world.root.add(r); r.updateMatrixWorld(true);
      }
      this.root = r;
    } else if (world.root && (world.benches || []).some((b) => b.name === 'bench-solder')) {
      this._buildFallback();
    } else return false;
    this.bench = this._benchAt(this.focal);
    // bàn tay (viewmodel) ở lớp riêng: camera chính thấy, camera kính hiển vi KHÔNG (tay cầm bút mỏ hàn nằm ngoài trường
    // nhìn thật — chỉ mũi dụng cụ lọt vào ảnh); camera USB vẫn thấy tay
    HAND_LAYER_SETUP(game, this.cam);
    this._register();
    // kính USB: prop CAD tự vẽ RenderTarget lên màn hình riêng → dùng luôn; không có thì tự làm
    const usbProp = world.props?.['usb-microscope'];
    if (usbProp) this.usb = { external: true, prop: usbProp, get screen() { return usbProp.screen; }, get cam() { return usbProp.camera || null; }, on: true };
    else this._setupUsb();
    game.events?.on?.('pointerlock:change', (e) => { if (!e.locked && this.active) this.exit(true); });
    // prop CAD phát 'microscope:look' khi bấm thị kính → vào chế độ xem (nếu đang ngồi)
    game.events?.on?.('microscope:look', () => { if (this.active) return; const c = this.canEnter(); if (c.ok) this.enter(); else game.hud?.toast?.(c.reason, { kind: 'warn', short: true }); });
    game.events?.on?.('app:resize', () => this._resize());
    return true;
  }

  _benchAt(p) {
    for (const b of this.game.world?.benches || []) if (Math.abs(p.x - b.x) <= b.w / 2 + 50 && Math.abs(p.z - b.z) <= b.d / 2 + 50) return b;
    return null;
  }

  /** Kính hiển vi dự phòng (khi phòng lab chưa có CAD): sau kẹp mạch ở bàn hàn, tiêu điểm = tâm hàm kẹp */
  _buildFallback() {
    const game = this.game;
    const world = game.world;
    const bench = world.benches.find((b) => b.name === 'bench-solder');
    const top = 750;
    const vs = game.sockets?.get?.('vise');
    const vp = vs?.object3D ? vs.object3D.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(bench.x, top + 78, bench.z + 160);
    this.focal.copy(vp);
    const std = (c, m = 0, r = 0.5) => new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: r });
    const white = std(0xe9ecef, 0.1, 0.45), dark = std(0x1d2126, 0.3, 0.45), chrome = std(0xd7dde3, 0.95, 0.18), glass = new THREE.MeshPhysicalMaterial({ color: 0x223344, metalness: 0, roughness: 0.05, transmission: 0.2, clearcoat: 1 });
    const g = new THREE.Group();
    g.name = 'microscope-fallback';
    const backZ = Math.max(bench.z - bench.d / 2 + 110, vp.z - 330);
    const mesh = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    // đế + trụ
    mesh(new THREE.BoxGeometry(200, 26, 240), dark, vp.x, top + 13, backZ);
    const pillarH = vp.y - top + WD + 160;
    mesh(new THREE.CylinderGeometry(16, 16, pillarH, 24), chrome, vp.x, top + pillarH / 2 + 20, backZ);
    // tay ngang tới trên tiêu điểm
    const armY = vp.y + WD + 120;
    const armLen = vp.z - backZ;
    mesh(new THREE.BoxGeometry(44, 40, armLen + 40), white, vp.x, armY, backZ + armLen / 2);
    // đầu kính (thân) + vật kính + đèn vòng
    const head = mesh(new THREE.BoxGeometry(70, 56, 84), white, vp.x, vp.y + WD + 56, vp.z);
    head.name = 'head';
    mesh(new THREE.CylinderGeometry(24, 27, 22, 32), dark, vp.x, vp.y + WD + 14, vp.z);
    const ring = mesh(new THREE.TorusGeometry(36, 5.5, 12, 40), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf4ff, emissiveIntensity: 1.2 }), vp.x, vp.y + WD + 2, vp.z, Math.PI / 2);
    ring.castShadow = false;
    this.nodes.ring = ring;
    // núm zoom (2 bên) + núm nét (trên tay ngang) + núm đèn
    const kz = mesh(new THREE.CylinderGeometry(20, 20, 14, 28), dark, vp.x + 44, vp.y + WD + 62, vp.z, 0, 0, Math.PI / 2); kz.name = 'knob_zoom';
    const kf = mesh(new THREE.CylinderGeometry(20, 20, 16, 28), dark, vp.x + 30, armY, backZ + 30, 0, 0, Math.PI / 2); kf.name = 'knob_focus';
    const kl = mesh(new THREE.CylinderGeometry(12, 12, 14, 20), std(0x2f9fe0, 0.2, 0.4), vp.x - 70, top + 33, backZ + 70); kl.name = 'knob_light';
    this.nodes.knob_zoom = kz; this.nodes.knob_focus = kf; this.nodes.knob_light = kl;
    // 2 thị kính nghiêng về phía người ngồi
    const ez = vp.z + 34;
    for (const s of [-1, 1]) {
      const ep = mesh(new THREE.CylinderGeometry(11.5, 10, 52, 24), dark, vp.x + s * 24, vp.y + WD + 100, ez, 0.75, 0, 0);
      ep.name = s < 0 ? 'eyepiece_l' : 'eyepiece_r';
      mesh(new THREE.CircleGeometry(9, 20), glass, vp.x + s * 24, vp.y + WD + 120, ez + 17.5, -Math.PI / 2 + 0.75);
      this.nodes[ep.name] = ep;
    }
    // kính hiển vi USB: cổ ngỗng + đầu camera, nhìn xiên vào tiêu điểm từ bên phải
    const uc = new THREE.Vector3(vp.x + 120, vp.y + 95, vp.z + 40);
    mesh(new THREE.CylinderGeometry(40, 46, 16, 24), dark, vp.x + 210, top + 8, vp.z - 60);
    const neck = new THREE.CatmullRomCurve3([new THREE.Vector3(vp.x + 210, top + 16, vp.z - 60), new THREE.Vector3(vp.x + 220, top + 140, vp.z - 30), new THREE.Vector3(vp.x + 180, vp.y + 140, vp.z + 10), uc.clone().add(new THREE.Vector3(20, 20, 0))]);
    const nm = new THREE.Mesh(new THREE.TubeGeometry(neck, 40, 5, 10), dark); nm.castShadow = true; g.add(nm);
    const usbHead = mesh(new THREE.CylinderGeometry(14, 16, 70, 20), std(0x9aa3ad, 0.6, 0.3), uc.x, uc.y, uc.z);
    usbHead.lookAt(vp); usbHead.rotateX(Math.PI / 2);
    usbHead.name = 'usb_cam';
    this.nodes.usb_cam = usbHead;
    this._usbPos = uc;
    // màn hình 7" trên chân đế, quay về phía người ngồi
    const mon = new THREE.Group();
    mon.position.set(vp.x + 330, top, vp.z - 120);
    mon.rotation.y = -0.45;
    const mm = (geo, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; mon.add(m); return m; };
    mm(new THREE.BoxGeometry(110, 10, 80), dark, 0, 5, 0);
    mm(new THREE.BoxGeometry(16, 90, 12), dark, 0, 50, -10);
    mm(new THREE.BoxGeometry(178, 112, 14), dark, 0, 140, 0, -0.18);
    const scr = mm(new THREE.PlaneGeometry(162, 98), new THREE.MeshBasicMaterial({ color: 0x0b0f14 }), 0, 140, 7.2, -0.18);
    scr.name = 'screen';
    scr.castShadow = false;
    g.add(mon);
    this.nodes.screen = scr;
    world.root.add(g);
    g.updateMatrixWorld(true);
    this.root = g;
    // va chạm nhỏ cho trụ (không cản đi lại vì nằm trên bàn)
  }

  _register() {
    const it = this.game.interact;
    if (!it?.register) return;
    const viewPrompt = {
      key: 'E', label: 'Nhìn qua kính hiển vi',
      enabled: () => this.canEnter().ok, reason: () => this.canEnter().reason,
      do: () => this.enter(),
    };
    const spec = {
      name: () => `Kính hiển vi soi mạch ${this.mag.toFixed(0)}× (stereo zoom 7–45×)`, uxKind: 'microscope', icon: '🔬', highlight: true, big: true,
      prompts: [viewPrompt], onScroll: (ctx, d) => this.setMag(this.mag * (d < 0 ? 1.12 : 1 / 1.12)), scrollLabel: 'Đổi độ phóng đại',
    };
    // CAD: thị kính + thân + gốc mô hình (chip gợi ý chỉ hiện trên gốc) · dự phòng: cả mô hình
    const targets = this.cad ? [this.root, this.nodes.head, this.nodes.eyepiece_l, this.nodes.eyepiece_r].filter(Boolean) : [this.root];
    const reg = new Set();
    for (const t of targets) { if (reg.has(t)) continue; reg.add(t); it.register(t, { ...spec, prompts: [...spec.prompts], hint: t === this.root }); }
    // núm của prop CAD giữ nguyên tương tác gốc (chỉ tắt chip nổi cho đỡ rối); kính dự phòng: núm do UX điều khiển
    const knob = (node, name, onScroll, scrollLabel) => node && (this.cad ? it.register(node, { hint: false, prompts: [] }) : it.register(node, { name, icon: '🎛️', highlight: true, uxKind: 'microscope', hint: false, prompts: [viewPrompt], onScroll, scrollLabel }));
    knob(this.nodes.knob_zoom, () => `Núm zoom · ${this.mag.toFixed(1)}×`, (c, d) => this.setMag(this.mag * (d < 0 ? 1.12 : 1 / 1.12)), 'Đổi độ phóng đại');
    knob(this.nodes.knob_focus, () => 'Núm chỉnh nét (lấy nét thô)', (c, d) => this.nudgeFocus(-d * dofOf(this.mag) * 0.6), 'Chỉnh nét');
    knob(this.nodes.knob_light, () => `Đèn vòng LED · ${Math.round(this.light * 100)} %`, (c, d) => this.setLight(this.light - d * 0.1), 'Chỉnh độ sáng');
    if (this.nodes.screen) it.register(this.nodes.screen, {
      name: () => `Màn hình kính hiển vi USB (${this.usb.on ? 'bật' : 'tắt'})`, icon: '🖥️', highlight: true,
      prompts: [{ key: 'E', label: () => (this.usb.on ? 'Tắt màn hình' : 'Bật màn hình'), do: () => this.setUsb(!this.usb.on) }],
    });
  }

  // ------------------------------------------------------------------ kính USB → RenderTarget lên màn hình
  _setupUsb() {
    const scr = this.nodes.screen;
    const cam = new THREE.PerspectiveCamera(32, 1.6, 5, 2000);
    cam.name = 'usb-microscope-camera';
    const pos = this._usbPos || (this.nodes.usb_cam ? this.nodes.usb_cam.getWorldPosition(new THREE.Vector3()) : this.focal.clone().add(new THREE.Vector3(110, 100, 40)));
    cam.position.copy(pos);
    cam.lookAt(this.focal);
    cam.updateMatrixWorld();
    cam.layers.enable(HAND_LAYER);
    this.usb.cam = cam;
    this.usb.screen = scr || null;
    if (!scr || this.game.app.headless || this.game.app.renderer?.isStub) return;
    const rt = new THREE.WebGLRenderTarget(512, 320, { type: THREE.HalfFloatType });
    this.usb.rt = rt;
    this.usb.mat = new THREE.MeshBasicMaterial({ map: rt.texture, toneMapped: true });
    this.usb.off = new THREE.MeshBasicMaterial({ color: 0x07090c });
    this.usb.orig = scr.material;
    scr.material = this.usb.on ? this.usb.mat : this.usb.off;
  }

  setUsb(on) {
    this.usb.on = !!on;
    const scr = this.usb.screen;
    if (scr && this.usb.mat) scr.material = on ? this.usb.mat : this.usb.off;
    this.game.audio?.play?.('click', { vol: 0.4 });
  }

  _renderUsb(dt) {
    const u = this.usb;
    if (!u.on || !u.rt || !u.screen) return;
    u.t -= dt;
    if (u.t > 0) return;
    u.t = 0.1;    // ~10 Hz
    const game = this.game;
    const eye = game.camera.getWorldPosition(_v);
    if (eye.distanceTo(this.focal) > 3500 && !this.active) return;
    const r = game.app.renderer;
    const sm = r.shadowMap.autoUpdate;
    const prevTarget = r.getRenderTarget();
    u.screen.visible = false;
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(u.rt);
    r.render(game.scene, u.cam);
    r.setRenderTarget(prevTarget);
    r.shadowMap.autoUpdate = sm;
    u.screen.visible = true;
  }

  // ------------------------------------------------------------------ vào / ra
  canEnter() {
    const seat = this.ux.seating?.seated;
    if (!seat) return { ok: false, reason: 'Ngồi vào ghế bàn hàn trước (nhìn ghế · E)' };
    const eye = this.ux.bench?.active ? this.ux.bench.bodyEye(_v) : this.game.camera.getWorldPosition(_v);   // [bàn 3D] mắt thân người
    const d = Math.hypot(eye.x - this.focal.x, eye.z - this.focal.z);
    if (d > 1100) return { ok: false, reason: 'Ghế xa kính quá — ngồi ghế bàn hàn' };
    return { ok: true, reason: '' };
  }

  enter() {
    const game = this.game;
    const c = this.canEnter();
    if (!c.ok) { game.hud?.toast?.(c.reason, { kind: 'warn', short: true }); return false; }
    if (this.active) return true;
    if (game.interact?.inspecting) game.interact.stopInspect();
    this.active = true;
    this._precWas = this.ux.precision.active;
    this.pan.set(0, 0);
    this._resize();
    this._placeCam();
    // lấy nét sẵn vào mặt đang soi (trung vị 9 tia — tâm có thể lọt lỗ khoan của pad)
    this.focusD = this.autoFocusDepth();
    this._depth = this.focusD;
    this.ux.precision.enable(this.cam);
    this.ux.precision.ndc.set(0, 0);
    game.app.viewCamera = this.cam;
    // "tự phơi sáng": đèn vòng chiếu sát mạch rất sáng → giảm phơi sáng khi nhìn qua kính
    if (game.app.renderer && this._expo == null) { this._expo = game.app.renderer.toneMappingExposure; game.app.renderer.toneMappingExposure = this._expo * 0.62; }
    this._setupBlur();
    if (this._st && !this._st.light) this._st.light = true;      // bật đèn vòng khi ghé mắt vào kính
    this._light(true);
    this.ux.hints?.showTipOnce('microscope');
    game.audio?.play?.('whoosh', { vol: 0.2 });
    game.events?.emit('microscope:enter', { mag: this.mag });
    return true;
  }

  exit(silent = false) {
    if (!this.active) return;
    const game = this.game;
    this.active = false;
    game.app.viewCamera = null;
    game.app.viewComposer = null;
    if (this._expo != null && game.app.renderer) { game.app.renderer.toneMappingExposure = this._expo; this._expo = null; }
    game.app.setCanvasFilter?.('');
    this._light(false);
    if (this._precWas) this.ux.precision.setCamera(null);
    else this.ux.precision.disable();
    this.ux.hud.setScope(null);
    if (!silent) game.audio?.play?.('whoosh', { vol: 0.15 });
    game.events?.emit('microscope:exit', {});
  }

  async _setupBlur() {
    const app = this.game.app;
    const s = this.game.quality?.settings || {};
    const hi = this.game.quality?.preset?.ao === 'gtao';
    this._bokeh = null;
    if (!s.microscopeBlur || !hi || app.headless) return;
    if (!this._vc) this._vc = await app.makeViewComposer(this.cam, { bokeh: true });
    if (!this._vc || !this.active) return;
    this._vc.composer.setSize(app.width, app.height);
    app.viewComposer = this._vc.composer;
    this._bokeh = this._vc.bokeh;
  }

  _resize() {
    const app = this.game.app;
    this.cam.aspect = (app.width || 1280) / (app.height || 720);
    this._applyFov();
    if (this._vc) this._vc.composer.setSize(app.width, app.height);
  }

  get field() { return fieldOf(this.mag); }
  _applyFov() {
    const half = (this.field / 2) / 0.92;
    this.cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(half / CAM_H));
    this.cam.updateProjectionMatrix();
  }

  _placeCam() {
    const seat = this.ux.seating?.seated;
    const far = seat ? seat.normal.clone() : new THREE.Vector3(0, 0, -1);   // phía xa người ngồi = đỉnh ảnh
    const tgt = _v2.copy(this.focal);
    tgt.x += this.pan.x; tgt.z += this.pan.y;
    this.cam.position.copy(tgt).add(new THREE.Vector3(0, CAM_H, 0));
    this.cam.up.copy(far);
    this.cam.lookAt(tgt);
    this.cam.updateMatrixWorld();
  }

  setMag(m) {
    this.mag = THREE.MathUtils.clamp(m, MAG_MIN, MAG_MAX);
    this._applyFov();
    this.game.audio?.play?.('tick', { vol: 0.2 });
  }
  nudgeFocus(d) { this.focusD = THREE.MathUtils.clamp(this.focusD + d, CAM_H - 40, CAM_H + 60); }
  setLight(v) { this.light = THREE.MathUtils.clamp(Math.round(v * 20) / 20, 0, 1); this._light(this.active); this.game.events?.emit('microscope:light', { on: this.light > 0, brightness: this.light }); }

  _light(on) {
    if (this._st) return;   // prop CAD tự điều khiển đèn vòng của nó (labState.microscope.light / brightness)
    if (!this._spot && !this.game.app.headless) {
      const sp = new THREE.SpotLight(0xf4f8ff, 0, 600, 0.75, 0.5, 2);
      sp.castShadow = false;
      sp.name = 'microscope-ring-light';
      const t = new THREE.Object3D();
      this.game.scene.add(sp, t);
      sp.target = t;
      this._spot = sp;
    }
    const sp = this._spot;
    if (sp) {
      sp.position.copy(this.focal).add(new THREE.Vector3(this.pan.x, WD - 2, this.pan.y));
      sp.target.position.copy(this.focal).add(new THREE.Vector3(this.pan.x, 0, this.pan.y));
      sp.target.updateMatrixWorld();
      sp.intensity = on ? this.light * 1.3e4 : 0;
    }
    const ring = this.nodes.ring;
    if (ring?.material) ring.material.emissiveIntensity = on ? 0.4 + this.light * 2.4 : 0.3;
  }

  /** Độ sâu "mặt chính" dưới kính: trung vị của lưới 3×3 tia quanh tâm (bỏ tia lọt lỗ / trúng đầu chân lẻ) */
  autoFocusDepth() {
    const ds = [];
    const k = 0.25 * (this.field / 2) / Math.max(1e-3, Math.tan(THREE.MathUtils.degToRad(this.cam.fov) / 2) * CAM_H);
    for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) {
      const d = this._centerDepth(new THREE.Vector2((x * k) / this.cam.aspect, y * k));
      ds.push(d);
    }
    ds.sort((a, b) => a - b);
    this._centerDepth();
    return ds[4];
  }

  /** Độ sâu (mm) từ camera kính tới mặt ở tâm ảnh */
  _centerDepth(ndc = null) {
    const it = this.game.interact;
    this.cam.updateMatrixWorld();
    if (ndc) this._ray.setFromCamera(ndc, this.cam);
    else this._ray.set(this.cam.position, DOWN);
    this._ray.far = CAM_H + 120;
    const hits = this._ray.intersectObjects(it?._gatherCandidates?.() || [], true);
    for (const h of hits) {
      if (h.distance < 20 || h.object.userData?.isHand || h.object.userData?.noInteract) continue;
      let vis = true; for (let o = h.object; o; o = o.parent) if (!o.visible) { vis = false; break; }
      if (!vis) continue;
      const item = itemOf(h.object);
      if (item && (item.heldBy || item.isHotbarTool)) continue;
      this._centerHit = h;
      return h.distance;
    }
    this._centerHit = null;
    return CAM_H;
  }

  // ------------------------------------------------------------------ đánh giá mối hàn (phím I)
  inspect() {
    const game = this.game;
    if (!this.active) return null;
    const d = this._centerDepth();
    const hit = this._centerHit;
    const S = game.soldering;
    const radius = Math.max(1.0, this.field * 0.045);
    let j = hit && S?.findJoint ? S.findJoint(hit.point, radius) : null;
    const viaHit = !!j;
    // tâm kính rơi đúng lỗ khoan của pad (tia lọt qua lỗ) → thử điểm trên MẶT PHẲNG TIÊU CỰ dưới tâm kính
    if (!j && S?.findJoint) {
      const fp = this.cam.position.clone().addScaledVector(DOWN, this.focusD);
      j = S.findJoint(fp, radius);
    }
    if (!j) {
      this._flash('Không có mối hàn dưới tâm kính — đưa tâm (+) vào pad');
      game.events?.emit('solder:inspected', { pad: null, observed: null, visible: false, reason: 'no-joint', magnification: this.mag, by: 'microscope' });
      return null;
    }
    const pad = j.pad;
    const quality = pad.molten ? 'molten' : (pad.state || 'empty');
    const need = MIN_MAG[quality] ?? 10;
    const center = S.padWorld && j.rec ? S.padWorld(j.rec, pad, new THREE.Vector3()) : (hit?.point.clone() || this.focal.clone());
    const depthJ = this.cam.position.y - center.y;     // độ sâu MẶT MỐI HÀN (không phải đầu chân nhô / lỗ khoan) — camera nhìn thẳng xuống
    const blurRatio = Math.abs(depthJ - this.focusD) / dofOf(this.mag);
    let reason = '';
    if (this.light < 0.2) reason = 'Tối quá — bật đèn vòng (L)';
    else if (blurRatio > 1.6) reason = 'Ảnh mờ — chỉnh nét (R/F) trước khi đánh giá';
    // có game.soldering.pro → nó tự quyết lỗi nào thấy được ở độ phóng đại này (bảng KB theo từng lỗi, docs/07 §13.4)
    else if (!S.pro && this.mag + 1e-6 < need) reason = `Chưa đủ phóng đại để nhận ra — cần ≥ ${need}×`;
    const visible = !reason;
    const observed = visible ? quality : 'unknown';
    const e = {
      pad, padId: pad.id, board: j.rec?.inst || null, quality, observed, visible, reason,
      magnification: +this.mag.toFixed(1), sharpness: +this.sharpness.toFixed(2), light: this.light, point: center, minMagnification: need, by: 'microscope',
    };
    game.events?.emit('solder:inspected', e);
    this.marks = this.marks.filter((m) => m.pad !== pad);
    const rep = e.proReport;
    if (rep) {
      // nhãn theo phiếu IPC của soldering.pro (chỉ các lỗi ĐÃ THẤY ở độ phóng đại hiện tại)
      const codes = rep.seen.map((d) => d.code).slice(0, 2).join(', ');
      this.marks.push({ pad, pos: center, text: `${pad.id}: ${rep.pass ? 'ĐẠT' : 'LỖI'}${codes ? ' · ' + codes : ''}${rep.missed ? ' ?' : ''}`, cls: rep.pass ? (STATE_CLS.good ?? '') : (STATE_CLS.cold ?? ''), t: 0 });
    } else {
      this.marks.push({ pad, pos: center, text: visible ? `${pad.id}: ${STATE_VI[quality] || quality}` : `${pad.id}: ?`, cls: visible ? (STATE_CLS[quality] ?? '') : 'unk', t: 0 });
    }
    if (this.marks.length > 12) this.marks.shift();
    if (rep) { /* phiếu kiểm tra của soldering.pro đã hiện — không toast trùng */ }
    else if (visible) game.hud?.toast?.(`Mối hàn ${pad.id}: ${STATE_VI[quality] || quality} (${this.mag.toFixed(0)}×)`, { kind: quality === 'good' ? 'success' : ['cold', 'bridge', 'lifted'].includes(quality) ? 'warn' : 'info', short: true });
    else this._flash(reason);
    game.audio?.play?.(visible ? 'tick' : 'error', { vol: 0.4 });
    return e;
  }

  _flash(msg) { this._msg = msg; this._msgT = 2.6; }

  // ------------------------------------------------------------------ đầu vào khi đang soi
  onInput(e) {
    if (!this.active) return false;
    if (e.type === 'input:key') {
      if (!e.down) return false;
      const c = e.code;
      if (c === 'KeyE' || c === 'Space' || c === 'Escape') { this.exit(); return true; }
      if (c === 'KeyI') { this.inspect(); return true; }
      if (c === 'KeyL') { const i = LIGHT_STEPS.findIndex((x) => x >= this.light - 0.01); this.setLight(LIGHT_STEPS[(i + 1) % LIGHT_STEPS.length]); return true; }
      if (c === 'KeyV') { this.reticle = !this.reticle; return true; }
      if (['KeyR', 'KeyF', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyZ', 'KeyC', 'Tab', 'KeyG', 'KeyT', 'KeyB'].includes(c)) return true;
      return false;
    }
    if (e.type === 'input:wheel') {
      const keys = this.game.app.input?.keys;
      const fine = keys && (keys.has('ShiftLeft') || keys.has('ShiftRight'));
      this.setMag(this.mag * Math.pow(fine ? 1.03 : 1.12, -e.delta));
      return true;
    }
    if (e.type === 'input:mouse' && e.button === 1 && e.down) return true;
    return false;
  }

  modeCard() {
    if (!this.active) return null;
    return {
      icon: '🔬', title: `Kính hiển vi · ${this.mag.toFixed(1)}×`, sub: 'Chuột: rê mũi dụng cụ · LMB hàn · RMB mớm thiếc', badge: 'soi',
      keys: [['WHEEL', 'Độ phóng đại 7–45×'], ['R/F', 'Chỉnh nét', true], ['W/A/S/D', 'Dời bàn soi'], ['L', `Đèn vòng · ${Math.round(this.light * 100)} %`], ['V', 'Tâm + thước mm'], ['I', 'Đánh giá mối hàn'], ['E/Esc', 'Rời kính']],
    };
  }

  // ------------------------------------------------------------------ mỗi khung
  update(dt) {
    if (!this.root) return;
    if (!this.game.app.headless && !this.usb.external) this._renderUsb(dt);
    const uc = this.usb.external ? this.usb.cam : null;
    if (uc && !uc.layers.isEnabled(HAND_LAYER)) uc.layers.enable(HAND_LAYER);     // camera USB thấy cả bàn tay
    for (const m of this.marks) m.t += dt;
    this.marks = this.marks.filter((m) => m.t < 30);
    if (!this.active) return;
    const game = this.game;
    if (!this.ux.seating?.seated) { this.exit(true); return; }
    const keys = game.app.input?.keys || new Set();
    const fine = keys.has('ShiftLeft') || keys.has('ShiftRight');
    // chỉnh nét (giữ R/F) + dời bàn soi (W/A/S/D)
    const dof = dofOf(this.mag);
    const fz = (keys.has('KeyR') ? -1 : 0) + (keys.has('KeyF') ? 1 : 0);
    if (fz && !game.app.paused) this.nudgeFocus(fz * dof * (fine ? 0.4 : 1.6) * dt);
    const px = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0), pz = (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0);
    if ((px || pz) && !game.app.paused) {
      const seat = this.ux.seating.seated;
      const n = seat?.normal || new THREE.Vector3(0, 0, -1);
      const l = new THREE.Vector3(-n.z, 0, n.x);   // phải trong ảnh
      const sp = this.field * (fine ? 0.25 : 0.8) * dt;
      const dx = (l.x * px - n.x * pz) * sp, dz = (l.z * px - n.z * pz) * sp;
      this.pan.x = THREE.MathUtils.clamp(this.pan.x + dx, -40, 40);
      this.pan.y = THREE.MathUtils.clamp(this.pan.y + dz, -40, 40);
      this._light(true);
    }
    this._placeCam();
    // độ nét: độ sâu "mặt chính" quanh tâm (trung vị 9 tia, 10 Hz — tia giữa có thể lọt lỗ khoan)
    this._afT = (this._afT || 0) - dt;
    if (this._afT <= 0 || this._depth == null) { this._afT = 0.1; this._depth = this.autoFocusDepth(); }
    const d = this._depth;
    const blur = Math.abs(d - this.focusD) / dof;
    this.sharpness = THREE.MathUtils.clamp(1 - (blur - 0.5) / 2.5, 0, 1);
    const s = game.quality?.settings || {};
    if (this._bokeh) {
      const u = this._bokeh.uniforms || this._bokeh.materialBokeh?.uniforms;
      if (u) { u.focus.value = this.focusD; u.aperture.value = 0.006 / dof; u.maxblur.value = 0.03; }
      game.app.setCanvasFilter?.('');
    } else {
      const px2 = s.microscopeBlur === false ? 0 : THREE.MathUtils.clamp((blur - 0.6) * 2.2, 0, 9);
      game.app.setCanvasFilter?.(px2 > 0.2 ? `blur(${px2.toFixed(1)}px)` : '');
    }
    if (this._msgT > 0) this._msgT -= dt;
    this._hud();
  }

  _hud() {
    const hud = this.ux.hud;
    if (!hud.has) return;
    const app = this.game.app;
    const W = app.width, H = app.height;
    const circlePx = 0.92 * H;
    const pxPerMm = circlePx / this.field;
    // thước: giá trị đẹp chiếm ~20 % vòng
    const want = this.field * 0.22;
    const nice = [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10].reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a));
    const pr = this.ux.precision;
    const cursor = pr.active ? { x: (pr.ndc.x * 0.5 + 0.5) * W, y: (-pr.ndc.y * 0.5 + 0.5) * H } : null;
    const marks = [];
    for (const m of this.marks) {
      const v = _v.copy(m.pos).project(this.cam);
      if (v.z > 1) continue;
      const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
      if (Math.hypot(x - W / 2, y - H / 2) > circlePx / 2) continue;
      marks.push({ x, y, text: m.text, cls: m.cls });
    }
    hud.setScope({
      mag: this.mag, field: this.field, light: this.light, sharp: this.sharpness, reticle: this.reticle,
      focusTxt: this.sharpness > 0.8 ? 'nét' : this.sharpness > 0.4 ? 'hơi mờ' : 'mờ',
      scalePx: nice * pxPerMm, scaleMm: nice, cursor, marks, msg: this._msgT > 0 ? this._msg : '',
    });
  }
}

export const HAND_LAYER = 2;
function HAND_LAYER_SETUP(game, micCam) {
  game.hands?.root?.traverse((o) => { if (o.isMesh && o.userData?.isHand) o.layers.set(HAND_LAYER); });
  game.camera.layers.enable(HAND_LAYER);
  micCam.layers.disable(HAND_LAYER);
}

function hasMesh(o) { let m = false; o.traverse((x) => { if (x.isMesh) m = true; }); return m; }
function itemOf(obj) { for (let o = obj; o; o = o.parent) if (o.userData?.item) return o.userData.item; return null; }

/** Tìm Object3D theo tên (regex) trong cây; near/maxD: chỉ lấy node gần điểm */
function findByName(root, re, near = null, maxD = Infinity) {
  if (!root) return null;
  let best = null, bd = Infinity;
  root.traverse((o) => {
    if (!re.test(o.name || '')) return;
    if (!near) { if (!best) best = o; return; }
    const d = o.getWorldPosition(_v).distanceTo(near);
    if (d < maxD && d < bd) { bd = d; best = o; }
  });
  return best;
}
