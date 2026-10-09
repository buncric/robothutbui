// =============================================================================
// app.js — Renderer + scene + camera + hậu kỳ + vòng lặp + đầu vào (bàn phím/chuột, pointer lock).
//
//   const app = await createApp({ container, quality, events, headless:false });
//   app.scene, app.camera (đã add vào scene → con của camera (2 tay) được vẽ), app.renderer
//   app.start({ fixed(dt), frame(dt, alpha) })   vòng lặp: logic cố định 60 Hz + vẽ theo rAF
//   app.setPaused(bool) / app.paused             tạm dừng logic (vẫn vẽ để menu có nền)
//   app.lockPointer() / app.unlockPointer() / app.locked
//   app.setOutline([obj]) → true nếu có OutlinePass (false → interact dùng tô sáng emissive)
//   app.input: { keys:Set<code>, buttons:Set<0|1|2>, consumeMouse() → {dx,dy}, enabled }
//   Sự kiện phát ra: 'input:key' {code,key,down,repeat,shift,ctrl}, 'input:mouse' {button,down},
//                    'input:wheel' {delta}, 'pointerlock:change' {locked}, 'game:paused' {paused}, 'app:resize'
//
// [UX] app.viewCamera = Camera | null → vẽ bằng camera khác (kính hiển vi); app.viewComposer (tuỳ chọn) dùng thay;
//      app.makeViewComposer(camera, { bokeh }) → EffectComposer RenderPass + BokehPass (độ sâu trường ảnh) + OutputPass.
//      app.setCanvasFilter(css) — mờ giả (CSS blur) khi không có BokehPass.
// headless:true (Node / smoke test): renderer giả, không DOM, không vòng lặp — gọi app.step(dt) bằng tay.
// =============================================================================
import * as THREE from 'three';

export const FIXED_DT = 1 / 60;

/** Renderer giả cho Node: đủ các thuộc tính mà code khác hay chạm tới */
function stubRenderer() {
  return {
    isStub: true,
    domElement: null,
    shadowMap: { enabled: false, type: 0, needsUpdate: false },
    capabilities: { getMaxAnisotropy: () => 1, isWebGL2: true },
    info: { render: { calls: 0, triangles: 0 } },
    outputColorSpace: THREE.SRGBColorSpace,
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 1,
    setPixelRatio() {}, getPixelRatio: () => 1, setSize() {}, setAnimationLoop() {}, dispose() {},
    render(scene) { scene?.updateMatrixWorld?.(); },     // như renderer thật: cập nhật ma trận thế giới mỗi khung
    compile() {}, setClearColor() {},
  };
}

class Input {
  constructor(app) {
    this.app = app;
    this.keys = new Set();
    this.buttons = new Set();
    this.enabled = true;
    this._dx = 0; this._dy = 0;
  }
  consumeMouse() { const r = { dx: this._dx, dy: this._dy }; this._dx = this._dy = 0; return r; }
  isDown(code) { return this.keys.has(code); }
  reset() { this.keys.clear(); this.buttons.clear(); this._dx = this._dy = 0; }
}

export async function createApp({ container = null, quality, events, headless = false } = {}) {
  const hasDom = !headless && typeof window !== 'undefined' && typeof document !== 'undefined';
  const app = {
    headless: !hasDom,
    container,
    renderer: null,
    composer: null,
    passes: {},
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(quality?.settings?.fov ?? 70, 16 / 9, 8, 80000),
    paused: true,
    locked: false,
    uiMode: null,          // 'menu' | 'bag' | 'start' … — khi mất pointer lock vì UI thì không mở menu Esc
    input: null,
    fps: 60,
    frameMs: 16,
    width: 1280, height: 720,
    time: 0,
  };
  const { scene, camera } = app;
  scene.name = 'game';
  scene.background = new THREE.Color(0x0d1117);
  camera.name = 'player-camera';
  camera.rotation.order = 'YXZ';
  scene.add(camera);          // để hands (con của camera) được vẽ
  app.input = new Input(app);

  // ---------------------------------------------------------------- renderer
  if (hasDom) {
    const r = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.82;   // phòng lab nhiều đèn trần → giảm phơi sáng cho khỏi chói
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    // [hiệu năng 2026-10] bóng đổ vẽ ĐÚNG 1 lần mỗi khung (app.render đặt needsUpdate): với autoUpdate, mọi lệnh
    // renderer.render(scene) trong khung — RenderPass + lượt pháp tuyến của GTAO — đều vẽ lại bản đồ bóng (×2 draw call)
    r.shadowMap.autoUpdate = false;
    r.localClippingEnabled = true;
    r.domElement.style.display = 'block';
    r.domElement.tabIndex = 0;
    (container || document.body).appendChild(r.domElement);
    app.renderer = r;
    // môi trường phản chiếu mặc định (kim loại, nhựa bóng nhìn thật hơn) — world có thể ghi đè
    try {
      const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
      const pmrem = new THREE.PMREMGenerator(r);
      const envScene = new RoomEnvironment();
      app.defaultEnvironment = pmrem.fromScene(envScene, 0.04).texture;
      scene.environment = app.defaultEnvironment;
      scene.environmentIntensity = 0.55;
      pmrem.dispose();
    } catch (e) { console.warn('[app] không tạo được environment', e); }
  } else {
    app.renderer = stubRenderer();
  }

  // ---------------------------------------------------------------- hậu kỳ
  let PP = null;
  async function loadPostprocessing() {
    if (PP || !hasDom) return PP;
    const [ec, rp, op, ob, ub, sm, fx, sp, gt] = await Promise.all([
      import('three/examples/jsm/postprocessing/EffectComposer.js'),
      import('three/examples/jsm/postprocessing/RenderPass.js'),
      import('three/examples/jsm/postprocessing/OutputPass.js'),
      import('three/examples/jsm/postprocessing/OutlinePass.js'),
      import('three/examples/jsm/postprocessing/UnrealBloomPass.js'),
      import('three/examples/jsm/postprocessing/SMAAPass.js'),
      import('three/examples/jsm/shaders/FXAAShader.js'),
      import('three/examples/jsm/postprocessing/ShaderPass.js'),
      import('three/examples/jsm/postprocessing/GTAOPass.js'),
    ]);
    PP = { ...ec, ...rp, ...op, ...ob, ...ub, ...sm, ...fx, ...sp, ...gt };
    return PP;
  }

  function buildComposer() {
    if (!hasDom || !PP) return;
    const preset = quality.preset;
    const r = app.renderer;
    if (app.composer) { app.composer.passes.forEach((p) => p.dispose?.()); app.composer.renderTarget1?.dispose(); app.composer.renderTarget2?.dispose(); }
    const pr = r.getPixelRatio();
    const w = app.width, h = app.height;
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 0 });
    const composer = new PP.EffectComposer(r, rt);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    const passes = {};
    passes.render = new PP.RenderPass(scene, camera);
    composer.addPass(passes.render);
    if (preset.ao === 'gtao') {
      const ao = new PP.GTAOPass(scene, camera, w * pr, h * pr);
      // đơn vị cảnh = mm → bán kính tính bằng mm
      ao.updateGtaoMaterial({ radius: 140, distanceExponent: 1.4, thickness: 60, scale: 1.1, samples: preset.aoSamples || 8, distanceFallOff: 1, screenSpaceRadius: false });
      ao.updatePdMaterial?.({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 });
      ao.blendIntensity = 0.85;
      passes.ao = ao;
      composer.addPass(ao);
    }
    if (preset.outline) {
      const ol = new PP.OutlinePass(new THREE.Vector2(w, h), scene, camera);
      ol.edgeStrength = 4.0; ol.edgeGlow = 0.35; ol.edgeThickness = 1.2; ol.pulsePeriod = 0;
      ol.visibleEdgeColor.set(0x7fd8ff); ol.hiddenEdgeColor.set(0x1d3a52);
      passes.outline = ol;
      composer.addPass(ol);
    }
    if (preset.bloom) {
      // ngưỡng cao: chỉ vật phát sáng mạnh (emissiveIntensity > ~1.2: LED, mỏ hàn nóng đỏ, tia lửa) mới loé
      const bl = new PP.UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.4, 1.6); // ngưỡng cao: chỉ LED, mũi hàn đỏ, đèn mới loé
      passes.bloom = bl;
      composer.addPass(bl);
    }
    passes.output = new PP.OutputPass();
    composer.addPass(passes.output);
    if (preset.aa === 'smaa') {
      passes.aa = new PP.SMAAPass(w * pr, h * pr);
      composer.addPass(passes.aa);
    } else if (preset.aa === 'fxaa') {
      const fxaa = new PP.ShaderPass(PP.FXAAShader);
      fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
      passes.aa = fxaa; passes.fxaa = fxaa;
      composer.addPass(fxaa);
    }
    app.composer = composer;
    app.passes = passes;
    if (app._outlineSel) app.setOutline(app._outlineSel);
  }

  /** Áp preset chất lượng: pixel ratio, bóng đổ, chuỗi hậu kỳ */
  app.applyQuality = async () => {
    const preset = quality.preset;
    if (hasDom) {
      const dpr = window.devicePixelRatio || 1;
      app.basePixelRatio = Math.min(dpr, preset.pixelRatio);
      app.renderer.setPixelRatio(app.basePixelRatio * app.dynScale);
      app.renderer.shadowMap.enabled = !!preset.shadows;
    }
    app.applyShadows();
    camera.fov = quality.settings.fov;
    camera.updateProjectionMatrix();
    if (hasDom) {
      try { await loadPostprocessing(); buildComposer(); } catch (e) { console.warn('[app] hậu kỳ lỗi → vẽ thẳng', e); app.composer = null; }
      app.resize();
    }
  };

  /** Cỡ bản đồ bóng + số đèn đổ bóng theo preset (gọi lại sau khi world thêm đèn) */
  app.applyShadows = () => {
    const preset = quality.preset;
    const lights = [];
    scene.traverse((o) => { if (o.isLight && (o.isDirectionalLight || o.isSpotLight || o.isPointLight) && (o.castShadow || o.userData._wantShadow)) lights.push(o); });
    // đèn nào world muốn đổ bóng thì ghi nhớ, rồi chỉ bật cho N đèn đầu (ưu tiên đèn có userData.shadowPriority cao)
    lights.forEach((l) => { if (l.castShadow) l.userData._wantShadow = true; });
    lights.sort((a, b) => (b.userData.shadowPriority || 0) - (a.userData.shadowPriority || 0));
    lights.forEach((l, i) => {
      const on = !!preset.shadows && i < preset.shadowLights;
      l.castShadow = on;
      if (on) {
        const size = l.isPointLight ? Math.min(1024, preset.shadowMapSize) : preset.shadowMapSize;
        if (l.shadow.mapSize.x !== size) {
          l.shadow.mapSize.set(size, size);
          l.shadow.map?.dispose(); l.shadow.map = null;
        }
      }
    });
    if (app.renderer.shadowMap) app.renderer.shadowMap.needsUpdate = true;
  };

  app.setOutline = (objs) => {
    app._outlineSel = objs || [];
    const ol = app.passes.outline;
    if (!ol) return false;
    ol.selectedObjects = app._outlineSel;
    ol.enabled = app._outlineSel.length > 0;
    return true;
  };
  app.hasOutline = () => !!app.passes.outline;

  // ---------------------------------------------------------------- kích thước
  app.resize = () => {
    if (!hasDom) return;
    const el = container || document.body;
    const w = el.clientWidth || window.innerWidth, h = el.clientHeight || window.innerHeight;
    if (!w || !h) return;
    app.width = w; app.height = h;
    app.renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (app.composer) {
      const pr = app.renderer.getPixelRatio();
      app.composer.setPixelRatio(pr);
      app.composer.setSize(w, h);
      if (app.passes.fxaa) app.passes.fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
    }
    events?.emit('app:resize', { width: w, height: h });
  };

  // ---------------------------------------------------------------- đầu vào + pointer lock
  if (hasDom) {
    const canvas = app.renderer.domElement;
    window.addEventListener('resize', () => app.resize());
    // các phím trình duyệt hay "cướp" trong game
    const BLOCK = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backquote']);
    window.addEventListener('keydown', (e) => {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.code !== 'Escape') return;
      if (BLOCK.has(e.code) || (app.locked && !e.metaKey)) e.preventDefault();
      if (!e.repeat) app.input.keys.add(e.code);
      events?.emit('input:key', { code: e.code, key: e.key, down: true, repeat: e.repeat, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey });
    });
    window.addEventListener('keyup', (e) => {
      app.input.keys.delete(e.code);
      events?.emit('input:key', { code: e.code, key: e.key, down: false, repeat: false, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey });
    });
    window.addEventListener('blur', () => {
      app.input.reset();
      events?.emit('input:blur', {});
    });
    document.addEventListener('mousemove', (e) => {
      if (!app.locked) return;
      // bỏ các cú nhảy bất thường (một số trình duyệt gửi movementX rất lớn khi vừa khoá chuột)
      if (Math.abs(e.movementX) > 600 || Math.abs(e.movementY) > 600) return;
      app.input._dx += e.movementX; app.input._dy += e.movementY;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!app.locked) return;
      e.preventDefault();
      app.input.buttons.add(e.button);
      events?.emit('input:mouse', { button: e.button, down: true });
    });
    window.addEventListener('mouseup', (e) => {
      if (!app.input.buttons.has(e.button)) return;
      app.input.buttons.delete(e.button);
      events?.emit('input:mouse', { button: e.button, down: false });
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      if (!app.locked) return;
      e.preventDefault();
      events?.emit('input:wheel', { delta: Math.sign(e.deltaY) });
    }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      const was = app.locked;
      app.locked = document.pointerLockElement === canvas;
      if (was === app.locked) return;
      if (!app.locked) {
        // nhả hết phím/chuột đang giữ để nhân vật không tự đi
        for (const b of [...app.input.buttons]) events?.emit('input:mouse', { button: b, down: false });
        app.input.reset();
      }
      events?.emit('pointerlock:change', { locked: app.locked, uiMode: app.uiMode });
    });
    document.addEventListener('pointerlockerror', () => events?.emit('pointerlock:error', {}));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) events?.emit('app:hidden', {});
    });
  }

  /** Khoá chuột (phải gọi trong sự kiện người dùng). Ưu tiên chuyển động thô (raw, không gia tốc OS) */
  app.lockPointer = async () => {
    if (!hasDom) { app.locked = true; return true; }
    const canvas = app.renderer.domElement;
    if (document.pointerLockElement === canvas) return true;
    try {
      const p = canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.then) await p;
      return true;
    } catch {
      try { const p = canvas.requestPointerLock(); if (p && p.then) await p; return true; } catch { return false; }
    }
  };
  app.unlockPointer = () => {
    if (!hasDom) { app.locked = false; return; }
    if (document.pointerLockElement) document.exitPointerLock();
  };

  app.setPaused = (p) => {
    if (app.paused === p) return;
    app.paused = p;
    events?.emit('game:paused', { paused: p });
  };

  // ---------------------------------------------------------------- vòng lặp
  let acc = 0, last = 0, cb = null;
  let fpsAcc = 0, fpsN = 0;
  app.viewCamera = null;
  app.viewComposer = null;
  app.render = () => {
    if (app.renderer.shadowMap?.enabled) app.renderer.shadowMap.needsUpdate = true;
    if (app.viewCamera) {
      // [UX] kính hiển vi: vẽ bằng camera quang học (bỏ qua chuỗi hậu kỳ chính)
      if (app.viewComposer) app.viewComposer.render();
      else app.renderer.render(scene, app.viewCamera);
      return;
    }
    if (app.composer) app.composer.render();
    else app.renderer.render(scene, camera);
  };
  app.setCanvasFilter = (css) => { if (hasDom) app.renderer.domElement.style.filter = css || ''; };
  /** [UX] Composer phụ cho camera khác: RenderPass → BokehPass (nếu bokeh) → OutputPass. Trả về { composer, bokeh } | null */
  app.makeViewComposer = async (cam, { bokeh = true } = {}) => {
    if (!hasDom) return null;
    try {
      await loadPostprocessing();
      const BP = bokeh ? (await import('three/examples/jsm/postprocessing/BokehPass.js')).BokehPass : null;
      const pr = app.renderer.getPixelRatio();
      const rt = new THREE.WebGLRenderTarget(app.width * pr, app.height * pr, { type: THREE.HalfFloatType });
      const c = new PP.EffectComposer(app.renderer, rt);
      c.setPixelRatio(pr); c.setSize(app.width, app.height);
      c.addPass(new PP.RenderPass(scene, cam));
      let bp = null;
      if (BP) { bp = new BP(scene, cam, { focus: 100, aperture: 0.02, maxblur: 0.012 }); c.addPass(bp); }
      c.addPass(new PP.OutputPass());
      return { composer: c, bokeh: bp };
    } catch (e) { console.warn('[app] composer phụ lỗi', e); return null; }
  };

  /** Một khung hình (dùng chung cho rAF và smoke test). dt = giây thật. */
  app.step = (dt) => {
    dt = Math.min(Math.max(dt, 0), 0.1);
    app.time += dt;
    let steps = 0;
    if (!app.paused) {
      acc += dt;
      while (acc >= FIXED_DT && steps < 6) { cb?.fixed?.(FIXED_DT); acc -= FIXED_DT; steps++; }
      if (steps === 6) acc = 0;     // máy quá chậm: bỏ bớt, tránh "xoắn ốc chết"
    }
    cb?.frame?.(dt, app.paused ? 1 : acc / FIXED_DT);
    app.render();
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 0.5) { app.fps = fpsN / fpsAcc; app.frameMs = (fpsAcc / fpsN) * 1000; fpsAcc = 0; fpsN = 0; adaptResolution(); }
  };

  // độ phân giải động: tụt dưới ~50 fps liên tục → giảm pixel ratio từng bước (tối thiểu 70%), dư sức → tăng lại
  app.dynScale = 1;
  let slow = 0, fast = 0;
  function adaptResolution() {
    if (!hasDom || app.paused || !app.basePixelRatio) return;
    if (app.fps < 50) { slow++; fast = 0; } else if (app.fps > 58) { fast++; slow = 0; } else { slow = fast = 0; }
    let next = app.dynScale;
    if (slow >= 4 && app.dynScale > 0.7) next = Math.max(0.7, app.dynScale - 0.1);
    if (fast >= 12 && app.dynScale < 1) next = Math.min(1, app.dynScale + 0.05);
    if (next !== app.dynScale) {
      app.dynScale = next; slow = fast = 0;
      app.renderer.setPixelRatio(app.basePixelRatio * next);
      app.resize();
    }
  }

  app.start = (callbacks) => {
    cb = callbacks;
    if (!hasDom) return;
    last = performance.now();
    app.renderer.setAnimationLoop((t) => {
      const dt = (t - last) / 1000;
      last = t;
      app.step(dt);
    });
  };
  app.stop = () => { if (hasDom) app.renderer.setAnimationLoop(null); };

  if (quality) {
    quality.onChange((key) => {
      if (key === 'preset') app.applyQuality();
      if (key === 'fov') { camera.fov = quality.settings.fov; camera.updateProjectionMatrix(); }
    });
  }
  app.resize();
  return app;
}
