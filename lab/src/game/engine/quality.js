// =============================================================================
// quality.js — Cài đặt người chơi + preset đồ hoạ.
//
//   quality.settings          { preset, fov, sensitivity, invertY, volume, showFps, headBob,
//                               [UX] hints:'full'|'compact'|'off' (gợi ý phím), precisionSens, precisionHeight (mm), seatedFov (độ, cộng
//                               thêm khi ngồi), magnifierFov (Z kính lúp), microscopeBlur (true = DOF thật khi chất lượng ≥ Cao),
//                               tipsSeen:[kind…] (mẹo lần đầu đã xem), benchMode (true = ngồi vào bàn → chế độ bàn làm việc 3D,
//                               ux/bench.js), benchFov (độ — FOV camera quỹ đạo) }
//   quality.preset            object preset hiện tại (PRESETS[settings.preset])
//   quality.set('fov', 80)    đổi 1 giá trị → lưu localStorage + phát 'settings:changed'
//   quality.onChange(fn)      fn(key, value, settings)
//
// Lưu ở localStorage 'robovac.game.settings' (bỏ qua khi chạy Node / bị chặn lưu trữ).
// =============================================================================

export const STORAGE_KEY = 'robovac.game.settings';

/**
 * Preset đồ hoạ. Mục tiêu: 'high' chạy 60 fps trên MacBook M1 Pro.
 *  pixelRatio   trần devicePixelRatio
 *  shadows      bật bóng đổ; shadowMapSize cỡ bản đồ bóng; shadowLights số đèn được đổ bóng tối đa
 *  ao           'none' | 'sao' | 'gtao'  (che khuất môi trường)
 *  bloom        chỉ vật phát sáng mạnh (LED, mỏ hàn đỏ) mới loé sáng
 *  aa           'fxaa' | 'smaa'
 *  outline      viền sáng vật đang nhìn bằng OutlinePass (false → tô sáng emissive)
 *  textureSize  cạnh lớn nhất texture thủ tục; normalMaps bật normal/roughness map
 */
export const PRESETS = {
  low: {
    label: 'Thấp', pixelRatio: 1, shadows: false, shadowMapSize: 512, shadowLights: 0,
    ao: 'none', bloom: false, aa: 'fxaa', outline: false, textureSize: 512, normalMaps: false, anisotropy: 1, maxLights: 4,
  },
  medium: {
    label: 'Trung bình', pixelRatio: 1.25, shadows: true, shadowMapSize: 1024, shadowLights: 1,
    ao: 'none', bloom: true, aa: 'smaa', outline: true, textureSize: 1024, normalMaps: false, anisotropy: 4, maxLights: 6,
  },
  high: {
    label: 'Cao', pixelRatio: 1.35, shadows: true, shadowMapSize: 2048, shadowLights: 2,
    ao: 'gtao', aoSamples: 8, bloom: true, aa: 'smaa', outline: true, textureSize: 1024, normalMaps: true, anisotropy: 8, maxLights: 8,
  },
  ultra: {
    label: 'Cực cao', pixelRatio: 2, shadows: true, shadowMapSize: 4096, shadowLights: 4,
    ao: 'gtao', aoSamples: 16, bloom: true, aa: 'smaa', outline: true, textureSize: 2048, normalMaps: true, anisotropy: 16, maxLights: 12,
  },
};

export const DEFAULTS = {
  preset: 'high',
  fov: 70,            // độ (dọc)
  sensitivity: 1,     // hệ số độ nhạy chuột
  invertY: false,
  volume: 0.8,        // 0..1
  showFps: false,
  headBob: true,
  // [UX] gợi ý phím + ngồi / thao tác tỉ mỉ (engine/ux/*)
  hints: 'full',          // 'full' | 'compact' | 'off'
  precisionSens: 1,       // hệ số tốc độ con trỏ tỉ mỉ
  precisionHeight: 6,     // mm — độ cao mũi dụng cụ trên mặt khi rê (cuộn chuột chỉnh)
  seatedFov: -8,          // độ — FOV khi ngồi = fov + seatedFov (hẹp hơn chút cho dễ nhìn mạch)
  magnifierFov: 35,       // độ — phím Z (kính lúp) khi ngồi
  microscopeBlur: true,   // mờ ngoài vùng nét (BokehPass khi chất lượng ≥ Cao, mờ giả khi thấp)
  benchMode: true,        // [UX bàn 3D] ngồi vào bàn → camera quỹ đạo + chuột thật (ux/bench.js); false = góc nhìn thứ nhất như cũ
  benchFov: 40,           // độ — FOV camera quỹ đạo ở chế độ bàn 3D
  tipsSeen: [],
};

function safeStorage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

export class Quality {
  constructor(events = null, storage = safeStorage()) {
    this.events = events;
    this.storage = storage;
    this._fns = new Set();
    this.settings = { ...DEFAULTS };
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      if (raw) Object.assign(this.settings, JSON.parse(raw));
    } catch { /* bản lưu hỏng → dùng mặc định */ }
    if (!PRESETS[this.settings.preset]) this.settings.preset = DEFAULTS.preset;
    this._sanitize();
  }

  _sanitize() {
    const s = this.settings;
    const num = (v, d, a, b) => (Number.isFinite(+v) ? Math.min(b, Math.max(a, +v)) : d);
    s.fov = num(s.fov, DEFAULTS.fov, 50, 110);
    s.sensitivity = num(s.sensitivity, 1, 0.1, 5);
    s.volume = num(s.volume, DEFAULTS.volume, 0, 1);
    s.invertY = !!s.invertY;
    s.showFps = !!s.showFps;
    s.headBob = s.headBob !== false;
    if (!['full', 'compact', 'off'].includes(s.hints)) s.hints = DEFAULTS.hints;
    s.precisionSens = num(s.precisionSens, 1, 0.2, 4);
    s.precisionHeight = num(s.precisionHeight, DEFAULTS.precisionHeight, 0, 60);
    s.seatedFov = num(s.seatedFov, DEFAULTS.seatedFov, -25, 10);
    s.magnifierFov = num(s.magnifierFov, DEFAULTS.magnifierFov, 20, 60);
    s.microscopeBlur = s.microscopeBlur !== false;
    s.benchMode = s.benchMode !== false;
    s.benchFov = num(s.benchFov, DEFAULTS.benchFov, 25, 70);
    if (!Array.isArray(s.tipsSeen)) s.tipsSeen = [];
  }

  get preset() { return PRESETS[this.settings.preset] || PRESETS.high; }
  get presetName() { return this.settings.preset; }

  set(key, value) {
    if (key === 'preset' && !PRESETS[value]) return;
    this.settings[key] = value;
    this._sanitize();
    this.save();
    const v = this.settings[key];
    for (const fn of [...this._fns]) { try { fn(key, v, this.settings); } catch (e) { console.error(e); } }
    this.events?.emit('settings:changed', { key, value: v, settings: this.settings });
  }

  onChange(fn) { this._fns.add(fn); return () => this._fns.delete(fn); }

  save() {
    try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.settings)); } catch { /* đầy / bị chặn */ }
  }
}
