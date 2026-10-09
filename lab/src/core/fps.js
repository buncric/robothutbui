// =============================================================================
// fps.js — Bộ điều khiển GÓC NHÌN THỨ NHẤT dùng lại được cho mọi "môi trường" của lab.
//
//   import { FirstPerson } from '../../core/fps.js';
//   const fps = new FirstPerson(viewer, {
//     colliders: [{ minX, maxX, minZ, maxZ } | { x, z, r }] | () => [...],   // vật cản trên mặt sàn (mm)
//     bounds: { minX, maxX, minZ, maxZ },                                    // tường phòng
//     start: { x, z, yaw },                                                  // vị trí đứng ban đầu
//     targets: () => [Object3D…],            // những gì tia nhìn (giữa màn hình) được phép chạm
//     describe: (hit) => ({ title, hint, box?: Box3, target?: Object3D }) | null,
//     onAction: (name, hover, arg) => {},    // 'interact' (E / bấm chuột) · 'detail' (F) · 'remove' (X/Del)
//                                            // 'rotate' (Q = −1 / R = +1) · 'wheel' (±1)
//     onEnter, onExit, zoneOf: (x, z) => 'tên khu',
//   });
//   fps.start({ lock: true })  // gọi TRONG sự kiện bấm của người dùng thì trình duyệt mới cho khoá chuột
//   fps.update(dt)             // gọi mỗi khung hình (trong update() của linh kiện)
//   fps.stop(); fps.dispose();
//
// Đơn vị mm, trục Y lên. Mắt cao 1650 mm, đi bộ 1.4 m/s, Shift chạy, C ngồi xuống (nhìn gầm bàn).
// Máy tính: PointerLockControls (khoá chuột, Esc để thoát). Cảm ứng / trình duyệt chặn khoá chuột:
// kéo màn hình để nhìn + cần điều khiển ảo + nút bấm trên màn hình.
// Khi đang ở góc nhìn thứ nhất: tắt OrbitControls (và vô hiệu controls.update), ẩn tooltip rê chuột,
// ẩn bảng Thư viện sandbox (.sb-panel); khi thoát: trả camera + OrbitControls như cũ.
// =============================================================================
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

const STYLE_ID = 'fps-style-v1';
const CSS = `
.fps-hud{position:absolute;inset:0;pointer-events:none;z-index:15;font:13px/1.35 system-ui,"Segoe UI",Roboto,sans-serif;color:#fff}
.fps-hud[hidden],.fps-overlay[hidden],.fps-touch[hidden]{display:none!important}
.fps-cross{position:absolute;left:50%;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px;border:2px solid rgba(255,255,255,.85);border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.45)}
.fps-cross::after{content:"";position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px 0 0 -2px;border-radius:50%;background:#fff}
.fps-cross.on{border-color:#ffd34d;transform:scale(1.25)}
.fps-hover{position:absolute;left:50%;top:calc(50% + 22px);transform:translateX(-50%);max-width:min(520px,90%);text-align:center;background:rgba(10,14,20,.72);border:1px solid rgba(255,211,77,.6);border-radius:8px;padding:5px 10px;text-shadow:0 1px 2px #000}
.fps-hover:empty{display:none}
.fps-hover b{color:#ffd34d}.fps-hover span{color:#cfe3ff;font-size:12px}
.fps-top{position:absolute;left:50%;top:10px;transform:translateX(-50%);background:rgba(10,14,20,.6);border-radius:8px;padding:4px 12px;white-space:nowrap;max-width:94%;overflow:hidden;text-overflow:ellipsis}
.fps-top b{color:#7fd3ff;margin-right:8px}.fps-top small{color:#c9d4df}
.fps-hand{position:absolute;left:12px;bottom:12px;max-width:min(460px,70%);background:rgba(10,14,20,.7);border-left:3px solid #ffd34d;border-radius:0 8px 8px 0;padding:6px 10px}
.fps-hand:empty{display:none}.fps-hand small{color:#c9d4df}
.fps-toast{position:absolute;left:50%;top:22%;transform:translateX(-50%);max-width:min(560px,92%);text-align:center;background:rgba(10,14,20,.82);border:1px solid #4cc2ff;border-radius:10px;padding:8px 14px;opacity:0;transition:opacity .25s}
.fps-toast.show{opacity:1}
.fps-overlay{position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;background:rgba(6,10,16,.55);cursor:pointer;padding:16px;box-sizing:border-box}
.fps-card{max-width:520px;width:100%;background:var(--bg2,#161d27);color:var(--text,#e6edf3);border:1px solid var(--accent,#4cc2ff);border-radius:14px;padding:16px 18px;box-shadow:0 10px 40px rgba(0,0,0,.5);font:14px/1.45 system-ui,"Segoe UI",Roboto,sans-serif;cursor:default}
.fps-card h3{margin:0 0 6px;font-size:17px}
.fps-card .big{font-size:15px;color:var(--accent,#4cc2ff);font-weight:600;margin:4px 0 10px}
.fps-card table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px}
.fps-card td{padding:2px 4px;vertical-align:top}.fps-card td:first-child{white-space:nowrap;color:var(--accent2,#ffb347);font-weight:600;width:1%}
.fps-card .row{display:flex;gap:8px;flex-wrap:wrap}
.fps-card button{flex:1;min-width:150px;padding:9px 12px;border-radius:9px;border:1px solid var(--line,#2a3442);background:var(--bg3,#1e2733);color:var(--text,#e6edf3);font:inherit;cursor:pointer}
.fps-card button.go{background:var(--accent,#4cc2ff);color:#00121f;border-color:transparent;font-weight:700}
.fps-touch{position:absolute;inset:0;pointer-events:none}
.fps-stick{position:absolute;left:18px;bottom:70px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.35);pointer-events:auto;touch-action:none}
.fps-stick i{position:absolute;left:50%;top:50%;width:52px;height:52px;margin:-26px 0 0 -26px;border-radius:50%;background:rgba(255,255,255,.55)}
.fps-btns{position:absolute;right:12px;bottom:70px;display:grid;grid-template-columns:repeat(3,52px);gap:8px;pointer-events:auto}
.fps-btns button{width:52px;height:52px;border-radius:50%;border:2px solid rgba(255,255,255,.4);background:rgba(10,14,20,.55);color:#fff;font:600 13px system-ui;touch-action:manipulation}
.fps-btns button.on{border-color:#ffd34d;color:#ffd34d}
`;

const MOVE = {
  KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r',
  ShiftLeft: 'run', ShiftRight: 'run',
};
const HELP = [
  ['W A S D / ← ↑ → ↓', 'đi lại'], ['Shift', 'chạy nhanh'], ['C', 'ngồi xuống / đứng lên (nhìn gầm bàn, kệ dưới)'],
  ['Chuột', 'nhìn quanh'], ['E / bấm chuột', 'tương tác: lấy linh kiện, đặt lên bàn, mở cửa, bật máy'],
  ['F', 'mở trang chi tiết của vật đang nhìn / đang cầm'], ['Q / R', 'xoay vật đang cầm (hoặc vật đang nhìn)'],
  ['Cuộn chuột', 'đưa vật đang cầm ra xa / lại gần'], ['X / Delete', 'cất vật về kệ'], ['Esc', 'tạm dừng / thoát'],
];

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export class FirstPerson {
  constructor(viewer, opts = {}) {
    this.viewer = viewer;
    this.o = {
      eyeHeight: 1650, crouchHeight: 1050, speed: 1400, runFactor: 1.9, crouchFactor: 0.5,
      radius: 230, reach: 2600, fov: 70, near: 5, far: 60000, sensitivity: 1,
      colliders: [], bounds: null, start: { x: 0, z: 0, yaw: 0, pitch: 0 },
      targets: () => [], describe: () => null, onAction: () => {}, onEnter: null, onExit: null, zoneOf: null,
      hideSelectors: ['.sb-panel'], title: 'Góc nhìn thứ nhất', help: HELP,
      ...opts,
    };
    const s = this.o.start || {};
    this.pos = new THREE.Vector3(s.x || 0, 0, s.z || 0);   // vị trí BÀN CHÂN (y = 0 sàn)
    this._yaw0 = s.yaw || 0;
    this._pitch0 = s.pitch || 0;
    this.vel = new THREE.Vector3();
    this.eye = this.o.eyeHeight;
    this.crouch = false;
    this.active = false;
    this.paused = true;          // true = đang hiện lớp phủ "Nhấn để vào…"
    this.locked = false;
    this.freeLook = false;       // kéo-chuột-để-nhìn (cảm ứng hoặc trình duyệt không cho khoá chuột)
    this.keys = new Set();
    this.stick = { x: 0, y: 0 };
    this.hover = null;           // { hit, info }
    this._bob = 0;
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._ray = new THREE.Raycaster();
    this._v = new THREE.Vector3();
    this._center = new THREE.Vector2(0, 0);
    this._saved = null;
    this._lockFails = 0;
    this._hoverKey = '';
    this.hasDom = !!(viewer && viewer.renderer && typeof document !== 'undefined');
    if (!this.hasDom) return;

    const canvas = (this.canvas = viewer.renderer.domElement);
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.canLock = typeof canvas.requestPointerLock === 'function';
    this.touchUI = coarse || !this.canLock;

    if (!document.getElementById(STYLE_ID)) {
      const st = document.createElement('style');
      st.id = STYLE_ID;
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this._buildDom();

    // khoá chuột + nhìn bằng chuột
    this.plc = new PointerLockControls(viewer.camera, canvas);
    this.plc.enabled = false;
    this.plc.addEventListener('lock', () => {
      this.locked = true;
      this._lockFails = 0;
      this._everLocked = true;
      if (this.active) { this.paused = false; this.overlay.hidden = true; }
    });
    this.plc.addEventListener('unlock', () => {
      this.locked = false;
      this.keys.clear();
      if (this.active && !this.freeLook) this._pause();
    });
    // lỗi khoá chuột: sự kiện 'pointerlockerror' + promise bị từ chối → chỉ đếm 1 lần cho mỗi lần thử
    this._attempt = 0;
    this._failedAttempt = -1;
    this._everLocked = false;
    this._onLockError = () => {
      if (!this.active || this._failedAttempt === this._attempt) return;
      this._failedAttempt = this._attempt;
      this._lockFails++;
      if (!this.canLock || (!this._everLocked && this._lockFails >= 3)) this._useFreeLook('Trình duyệt không cho khoá chuột — kéo chuột để nhìn, bấm để tương tác.');
      else { this._pause(); this.toast('Chưa khoá được chuột — đợi 1 giây rồi bấm lại.'); }
    };
    document.addEventListener('pointerlockerror', this._onLockError);

    // bàn phím
    this._onKeyDown = (e) => this._key(e, true);
    this._onKeyUp = (e) => this._key(e, false);
    this._onBlur = () => this.keys.clear();
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);

    // chuột/cảm ứng trên khung 3D: chặn ở pha capture để viewer (tooltip), sandbox, OrbitControls không nhận
    this._drag = null;
    this._onPtr = (e) => this._pointer(e);
    for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click', 'dblclick', 'contextmenu']) window.addEventListener(t, this._onPtr, true);
    this._onWheel = (e) => {
      if (!this.active || this.paused || e.target !== canvas) return;
      e.preventDefault();
      e.stopPropagation();
      this.o.onAction('wheel', this.hover, Math.sign(e.deltaY) || 0);
    };
    canvas.addEventListener('wheel', this._onWheel, { passive: false, capture: true });

    // khung tô vật đang nhìn
    this.hl = new THREE.Box3Helper(new THREE.Box3(), 0xffd34d);
    this.hl.userData.noPick = true;
    this.hl.visible = false;
    this.hl.raycast = () => {};
  }

  // ------------------------------------------------------------------ DOM
  _buildDom() {
    const vp = this.viewer.container;
    const hud = (this.hud = document.createElement('div'));
    hud.className = 'fps-hud';
    hud.hidden = true;
    hud.innerHTML = `<div class="fps-cross"></div><div class="fps-hover"></div>
      <div class="fps-top"><b class="fps-zone"></b><small>WASD đi · Shift chạy · C ngồi · E tương tác · F chi tiết · Q/R xoay · cuộn xa/gần · X cất · Esc dừng</small></div>
      <div class="fps-hand"></div><div class="fps-toast"></div>
      <div class="fps-touch" hidden><div class="fps-stick"><i></i></div>
        <div class="fps-btns"><button data-a="interact">E</button><button data-a="detail">F</button><button data-a="remove">X</button>
        <button data-a="rotL">⟲</button><button data-a="crouch">C</button><button data-a="rotR">⟳</button>
        <button data-a="run">⇧</button><button data-a="pause">⏸</button><button data-a="exit">✕</button></div></div>`;
    vp.appendChild(hud);
    this.$cross = hud.querySelector('.fps-cross');
    this.$hover = hud.querySelector('.fps-hover');
    this.$zone = hud.querySelector('.fps-zone');
    this.$hand = hud.querySelector('.fps-hand');
    this.$toast = hud.querySelector('.fps-toast');
    this.$touch = hud.querySelector('.fps-touch');
    if (this.touchUI) hud.querySelector('.fps-top small').textContent = 'Cần trái: đi · kéo màn hình: nhìn · chạm: tương tác';

    // cần điều khiển ảo
    const stick = hud.querySelector('.fps-stick'), knob = stick.querySelector('i');
    let sid = null;
    const setStick = (e) => {
      const r = stick.getBoundingClientRect();
      let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
      const l = Math.hypot(x, y);
      if (l > 1) { x /= l; y /= l; }
      this.stick.x = x; this.stick.y = y;
      knob.style.transform = `translate(${x * 34}px,${y * 34}px)`;
    };
    stick.addEventListener('pointerdown', (e) => { sid = e.pointerId; stick.setPointerCapture?.(e.pointerId); setStick(e); e.preventDefault(); });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === sid) setStick(e); });
    const endStick = (e) => { if (e.pointerId !== sid) return; sid = null; this.stick.x = this.stick.y = 0; knob.style.transform = ''; };
    stick.addEventListener('pointerup', endStick);
    stick.addEventListener('pointercancel', endStick);
    hud.querySelector('.fps-btns').addEventListener('click', (e) => {
      const a = e.target.closest('button')?.dataset.a;
      if (!a) return;
      if (a === 'crouch') { this.crouch = !this.crouch; e.target.classList.toggle('on', this.crouch); }
      else if (a === 'run') { this._touchRun = !this._touchRun; e.target.classList.toggle('on', this._touchRun); }
      else if (a === 'rotL') this.o.onAction('rotate', this.hover, -1);
      else if (a === 'rotR') this.o.onAction('rotate', this.hover, 1);
      else if (a === 'pause') this._pause();
      else if (a === 'exit') this.stop();
      else this.o.onAction(a, this.hover);
    });

    // lớp phủ "Nhấn để vào…"
    const ov = (this.overlay = document.createElement('div'));
    ov.className = 'fps-overlay';
    ov.hidden = true;
    ov.innerHTML = `<div class="fps-card"><h3>🧑‍🔬 ${this.o.title}</h3>
      <div class="big">${this.touchUI ? 'Chạm “Vào” để bắt đầu — kéo màn hình để nhìn, cần trái để đi' : 'Nhấn để vào chế độ góc nhìn thứ nhất (Esc để thoát)'}</div>
      <table>${this.o.help.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
      <div class="row"><button class="go">▶ Vào / tiếp tục</button><button class="exit">⟲ Về chế độ nhìn tự do (orbit)</button></div></div>`;
    vp.appendChild(ov);
    ov.addEventListener('click', (e) => {
      if (e.target.closest('.exit')) { this.stop(); return; }
      if (e.target.closest('.go') || e.target === ov) this.lock();
    });
  }

  // ------------------------------------------------------------------ vào / ra
  /** Bắt đầu góc nhìn thứ nhất. lock = true khi gọi trong sự kiện bấm (khoá chuột ngay) */
  start({ lock = false, x, z, yaw, pitch } = {}) {
    if (!this.hasDom || this.active) return;
    const v = this.viewer, cam = v.camera, ctl = v.controls;
    this.active = true;
    this._saved = {
      pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov, near: cam.near, far: cam.far,
      target: ctl.target.clone(), enabled: ctl.enabled, ownUpdate: Object.prototype.hasOwnProperty.call(ctl, 'update'),
      update: ctl.update, autoRotate: v.autoRotate,
    };
    ctl.enabled = false;
    ctl.update = () => false;                 // OrbitControls.update() đặt lại camera mỗi khung → vô hiệu tạm thời
    v.autoRotate = false;
    v.stage.rotation.set(0, 0, 0);
    v._setHover?.(null);
    if (v.tooltipEl) v.tooltipEl.hidden = true;
    if (x !== undefined) this.pos.x = x;
    if (z !== undefined) this.pos.z = z;
    this._euler.set(pitch ?? this._pitch0, yaw ?? this._yaw0, 0, 'YXZ');
    if (this._lastQuat) cam.quaternion.copy(this._lastQuat); else cam.quaternion.setFromEuler(this._euler);
    if (yaw !== undefined) cam.quaternion.setFromEuler(this._euler);
    this._applyCam();
    this.vel.set(0, 0, 0);
    this.hud.hidden = false;
    this.$touch.hidden = !this.touchUI;
    this._setHidden(true);
    v.scene.add(this.hl);
    this.plc.enabled = true;
    this.plc.pointerSpeed = this.o.sensitivity;
    this.o.onEnter?.();
    if (this.touchUI) { this._pause(); }
    else if (lock) { this.paused = false; this.lock(); }
    else this._pause();
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this._lastQuat = this.viewer.camera.quaternion.clone();
    if (this.locked) document.exitPointerLock?.();
    this.plc.enabled = false;
    this.keys.clear();
    this.stick.x = this.stick.y = 0;
    this._drag = null;
    this.hud.hidden = true;
    this.overlay.hidden = true;
    this.hl.visible = false;
    this.hl.parent?.remove(this.hl);
    this._setHidden(false);
    this._setHover(null);
    const v = this.viewer, cam = v.camera, ctl = v.controls, s = this._saved;
    if (s) {
      if (s.ownUpdate) ctl.update = s.update; else delete ctl.update;
      cam.position.copy(s.pos);
      cam.quaternion.copy(s.quat);
      cam.fov = s.fov; cam.near = s.near; cam.far = s.far;
      cam.updateProjectionMatrix();
      ctl.target.copy(s.target);
      ctl.enabled = true;
      v.autoRotate = s.autoRotate;
      ctl.update();
    }
    this._saved = null;
    this.o.onExit?.();
  }

  /** Khoá chuột (phải gọi trong sự kiện bấm/phím của người dùng) */
  lock() {
    if (!this.active) return;
    const ae = document.activeElement;
    if (ae && ae !== document.body && typeof ae.blur === 'function') ae.blur();   // phím WASD không lọt vào ô chọn/nút
    if (this.touchUI || this.freeLook || !this.canLock) { this._useFreeLook(); return; }
    this._attempt++;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => this._onLockError());
    } catch { this._onLockError(); }
  }

  _useFreeLook(msg) {
    this.freeLook = true;
    this.paused = false;
    this.overlay.hidden = true;
    if (msg) this.toast(msg, 4000);
  }

  _pause() {
    if (!this.active) return;
    this.paused = true;
    this.freeLook = this.touchUI ? false : this.freeLook;
    this.keys.clear();
    this.overlay.hidden = false;
    this._setHover(null);
  }

  _setHidden(on) {
    const vp = this.viewer.container;
    for (const sel of this.o.hideSelectors) vp.querySelectorAll(sel).forEach((el) => {
      if (on) { el.dataset.fpsDisplay = el.style.display; el.style.display = 'none'; }
      else if ('fpsDisplay' in el.dataset) { el.style.display = el.dataset.fpsDisplay; delete el.dataset.fpsDisplay; }
    });
  }

  setSensitivity(k) { this.o.sensitivity = k; if (this.plc) this.plc.pointerSpeed = k; }
  setFov(f) { this.o.fov = f; }

  // ------------------------------------------------------------------ nhập liệu
  _key(e, down) {
    if (!this.active) return;
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return;
    const live = !this.paused;
    const mv = MOVE[e.code];
    if (mv) {
      if (!live) return;
      e.preventDefault();
      down ? this.keys.add(mv) : this.keys.delete(mv);
      return;
    }
    if (!down) return;
    if (e.code === 'Escape' && this.freeLook && !this.paused) { this._pause(); return; }
    if (!live || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const act = { KeyE: ['interact'], KeyF: ['detail'], KeyX: ['remove'], Delete: ['remove'], Backspace: ['remove'], KeyQ: ['rotate', -1], KeyR: ['rotate', 1] }[e.code];
    if (e.code === 'KeyC') { e.preventDefault(); this.crouch = !this.crouch; return; }
    if (!act) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.o.onAction(act[0], this.hover, act[1]);
  }

  _pointer(e) {
    if (!this.active || e.target !== this.canvas) return;
    e.stopPropagation();                    // viewer/sandbox/OrbitControls không nhận sự kiện này
    const t = e.type;
    if (t === 'contextmenu') { e.preventDefault(); return; }
    if (t === 'click' || t === 'dblclick') return;
    if (this.locked) {
      if (t === 'pointerdown' && e.button === 0) this.o.onAction('interact', this.hover);
      return;
    }
    if (this.paused) { if (t === 'pointerdown' && !this.touchUI) this.lock(); return; }
    // kéo để nhìn (cảm ứng / không khoá được chuột); chạm nhanh = tương tác
    if (t === 'pointerdown') {
      if (this._drag) return;
      this._drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false };
      this.canvas.setPointerCapture?.(e.pointerId);
    } else if (t === 'pointermove' && this._drag && e.pointerId === this._drag.id) {
      const dx = e.clientX - this._drag.x, dy = e.clientY - this._drag.y;
      this._drag.x = e.clientX; this._drag.y = e.clientY;
      if (Math.hypot(e.clientX - this._drag.sx, e.clientY - this._drag.sy) > 6) this._drag.moved = true;
      this.look(dx * 0.0045 * this.o.sensitivity, dy * 0.0045 * this.o.sensitivity);
    } else if ((t === 'pointerup' || t === 'pointercancel') && this._drag && e.pointerId === this._drag.id) {
      const tap = !this._drag.moved && performance.now() - this._drag.t < 400 && t === 'pointerup';
      this._drag = null;
      if (tap) this.o.onAction('interact', this.hover);
    }
  }

  /** Xoay hướng nhìn (rad) */
  look(dYaw, dPitch) {
    const cam = this.viewer.camera;
    this._euler.setFromQuaternion(cam.quaternion, 'YXZ');
    this._euler.y -= dYaw;
    this._euler.x = clamp(this._euler.x - dPitch, -1.5, 1.5);
    this._euler.z = 0;
    cam.quaternion.setFromEuler(this._euler);
  }

  get yaw() {
    if (!this.hasDom) return this._yaw0;
    this._euler.setFromQuaternion(this.viewer.camera.quaternion, 'YXZ');
    return this._euler.y;
  }

  // ------------------------------------------------------------------ va chạm
  blocked(x, z) {
    const r = this.o.radius, b = this.o.bounds;
    if (b && (x < b.minX + r || x > b.maxX - r || z < b.minZ + r || z > b.maxZ - r)) return true;
    const list = typeof this.o.colliders === 'function' ? this.o.colliders() : this.o.colliders;
    for (const c of list) {
      if (c.r !== undefined) {
        const rr = c.r + r;
        if ((x - c.x) ** 2 + (z - c.z) ** 2 < rr * rr) return true;
      } else {
        const dx = Math.max(c.minX - x, 0, x - c.maxX), dz = Math.max(c.minZ - z, 0, z - c.maxZ);
        if (dx * dx + dz * dz < r * r) return true;
      }
    }
    return false;
  }

  // ------------------------------------------------------------------ mỗi khung hình
  update(dt) {
    if (!this.active || !this.hasDom) return;
    const v = this.viewer, cam = v.camera, o = this.o;
    if (v.tooltipEl && !v.tooltipEl.hidden) v.tooltipEl.hidden = true;
    if (v.stage.rotation.y !== 0) v.stage.rotation.set(0, 0, 0);
    if (cam.near !== o.near || cam.far !== o.far || cam.fov !== o.fov) {
      cam.near = o.near; cam.far = o.far; cam.fov = o.fov;
      cam.updateProjectionMatrix();
    }
    // di chuyển
    const live = !this.paused;
    let ix = 0, iz = 0;
    if (live) {
      if (this.keys.has('f')) iz += 1;
      if (this.keys.has('b')) iz -= 1;
      if (this.keys.has('r')) ix += 1;
      if (this.keys.has('l')) ix -= 1;
      ix += this.stick.x; iz -= this.stick.y;
    }
    const il = Math.hypot(ix, iz);
    if (il > 1) { ix /= il; iz /= il; }
    const yaw = this.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);        // hướng trước (trên mặt sàn)
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);         // bên phải
    const run = this.keys.has('run') || this._touchRun;
    const sp = o.speed * (this.crouch ? o.crouchFactor : run ? o.runFactor : 1);
    const tx = (fx * iz + rx * ix) * sp, tz = (fz * iz + rz * ix) * sp;
    const k = Math.min(1, dt * 10);
    this.vel.x += (tx - this.vel.x) * k;
    this.vel.z += (tz - this.vel.z) * k;
    const wasIn = this.blocked(this.pos.x, this.pos.z);    // kẹt sẵn trong vật → cho đi ra
    const nx = this.pos.x + this.vel.x * dt;
    if (wasIn || !this.blocked(nx, this.pos.z)) this.pos.x = nx; else this.vel.x = 0;
    const nz = this.pos.z + this.vel.z * dt;
    if (wasIn || !this.blocked(this.pos.x, nz)) this.pos.z = nz; else this.vel.z = 0;
    // chiều cao mắt (ngồi/đứng) + lắc đầu nhẹ khi đi
    const eyeT = this.crouch ? o.crouchHeight : o.eyeHeight;
    this.eye += (eyeT - this.eye) * Math.min(1, dt * 8);
    const spd = Math.hypot(this.vel.x, this.vel.z);
    this._bob += dt * spd * 0.0085;
    const bob = Math.sin(this._bob) * Math.min(1, spd / o.speed) * 14;
    this._applyCam(bob);
    // tia nhìn từ giữa màn hình
    this._probe();
  }

  _applyCam(bob = 0) {
    const cam = this.viewer.camera;
    cam.position.set(this.pos.x, this.eye + bob, this.pos.z);
    cam.updateMatrixWorld();
  }

  _probe() {
    if (this.paused) { this._setHover(null); return; }
    const cam = this.viewer.camera;
    this._ray.setFromCamera(this._center, cam);
    this._ray.far = this.o.reach;
    let targets = this.o.targets();
    const hits = this._ray.intersectObjects(targets, true);
    let hit = null;
    for (const h of hits) {
      if (!h.object.visible || !this._visibleChain(h.object)) continue;
      hit = h; break;
    }
    const info = hit ? this.o.describe(hit) : null;
    this._setHover(info ? { hit, info } : hit ? { hit, info: null } : null);
  }

  _visibleChain(o) { for (; o; o = o.parent) if (!o.visible) return false; return true; }

  _setHover(h) {
    this.hover = h;
    const info = h?.info;
    if (!this.hasDom) return;
    const key = info ? `${info.title}|${info.hint || ''}` : '';
    if (key !== this._hoverKey) {
      this._hoverKey = key;
      this.$hover.innerHTML = info ? `<b>${info.title}</b>${info.hint ? `<br><span>${info.hint}</span>` : ''}` : '';
      this.$cross.classList.toggle('on', !!info?.hint);
    }
    if (info?.box || info?.target) {
      if (info.box) this.hl.box.copy(info.box);
      else if (info.target !== this._hlTarget) this.hl.box.setFromObject(info.target);
      this._hlTarget = info.target || null;
      this.hl.visible = true;
    } else { this.hl.visible = false; this._hlTarget = null; }
  }

  /** Buộc tính lại khung tô (sau khi vật đổi chỗ) */
  refreshHover() { this._hlTarget = null; this._hoverKey = ''; }

  // ------------------------------------------------------------------ HUD
  setZone(text) { if (this.hasDom && this.$zone.textContent !== text) this.$zone.textContent = text; }
  setHand(html) { if (this.hasDom && this._hand !== html) { this._hand = html; this.$hand.innerHTML = html || ''; } }
  toast(msg, ms = 2600) {
    if (!this.hasDom) return;
    this.$toast.innerHTML = msg;
    this.$toast.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.$toast.classList.remove('show'), ms);
  }

  dispose() {
    if (!this.hasDom) return;
    this.stop();
    clearTimeout(this._toastT);
    document.removeEventListener('pointerlockerror', this._onLockError);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click', 'dblclick', 'contextmenu']) window.removeEventListener(t, this._onPtr, true);
    this.canvas.removeEventListener('wheel', this._onWheel, { capture: true });
    this.plc.dispose();
    this.hud.remove();
    this.overlay.remove();
    this.hl.geometry?.dispose();
    this.hasDom = false;
  }
}
