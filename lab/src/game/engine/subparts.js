// =============================================================================
// subparts.js — TƯƠNG TÁC VỚI BỘ PHẬN CON của một item (nút bấm, núm xoay, nắp bản lề, ngăn trượt, vít,
// đầu cắm, bánh xe quay, chân cắm, LED). Điều khiển bằng metadata "interact" + TÊN NODE trong mô hình.
//
// Nguồn khai báo (gộp theo thứ tự):
//   1) manifest CAD: public/models/manifest*.json → models[i].interact (khi item có def.cad = models[i].path)
//   2) item def: def.interact = [ spec… ]                    (mô hình thủ tục đặt tên node tương ứng)
//   3) node có userData.interact = { type, … }              (khai báo trực tiếp trên Object3D)
//   4) gọi tay: game.subparts.add(inst, object3D, spec)
//
// spec = {
//   node: 'lid' | 'btn_*' (khớp tên node, không phân biệt hoa thường, '*' = đại diện), type, label: 'nắp hộp bụi',
//   axis: [x,y,z]  (HỆ TOẠ ĐỘ ITEM, mm)   — button: hướng ấn (mặc định [0,-1,0]); knob/spin/hinge/screw: trục quay;
//                                          slide/connector: hướng kéo ra / rút ra; screw: hướng vít đi RA
//   pivot: [x,y,z] (hệ item, mm; mặc định tâm hộp bao của node; hinge: tâm cạnh phía `side`)
//   side: [x,y,z]  hinge: phía có bản lề (vd [0,0,-1] = cạnh sau)
//   travel_mm      button 0.8 · slide 80 · screw 6 · connector 10
//   angle_deg      hinge 100 · min_deg/max_deg knob −135..135 · detents (knob) 24
//   turns (screw 6) · tool: 'screwdriver' · item: id item rơi ra khi tháo vít (bỏ trống → tự tạo item "vít rời")
//   socket: loại khe cho vít lắp lại (mặc định 'screw') · mate: tên node/khe của đầu cắm · net (pin) · color/power (led)
//   on (led bật sẵn) · open (hinge/slide mở sẵn) · value (knob 0..1) · event: tên sự kiện phát thêm
//   lockedBy: ['screw_*'] (hinge) — chỉ mở được khi mọi vít khớp tên đã tháo
// }
// Sự kiện: 'item:button' {item,node,subpart} · 'item:knob' {item,node,value,angle} · 'item:hinge' {item,node,open}
//          'item:slide' {item,node,open} · 'screw:driven' {item,node,torque,stripped,removed,dir:'out'|'in'}
//          'connector:changed' {item,node,plugged,mate} (+ 'wire:connected' {a,b} khi cắm) · 'item:spin' {item,node,omega}
//          'subpart:changed' {item,node,type,state} cho mọi loại.
// Trạng thái lưu trong inst.state.subparts[node] → save.js tự lưu/tải.
// API: subparts.attach(inst) · detach(inst) · add(inst, obj, spec) · find(inst, name) · list(inst)
//      setPowered(inst, on) · setLed(inst, name, on, intensity) · press(sp) · toggle(sp) · turn(sp, deltaRad)
// =============================================================================
import * as THREE from 'three';
import { toolKind } from './items.js';
import { cloneVisual } from './sockets.js';

export const SUBPART_TYPES = ['button', 'knob', 'hinge', 'slide', 'screw', 'connector', 'spin', 'pin', 'led'];

const DEFAULTS = {
  button: { axis: [0, -1, 0], travel_mm: 0.8 },
  knob: { axis: [0, 1, 0], min_deg: -135, max_deg: 135, detents: 24, value: 0 },
  hinge: { axis: [1, 0, 0], angle_deg: 100 },
  slide: { axis: [0, 0, 1], travel_mm: 80 },
  screw: { axis: [0, 1, 0], travel_mm: 6, turns: 6, tool: 'screwdriver', duration: 1.4 },
  connector: { axis: [0, 1, 0], travel_mm: 10 },
  spin: { axis: [1, 0, 0] },
  pin: {},
  led: { color: '#ff2a1a' },
};
const TYPE_LABEL = { button: 'nút', knob: 'núm xoay', hinge: 'nắp', slide: 'ngăn kéo', screw: 'vít', connector: 'đầu cắm', spin: 'bánh xe', pin: 'chân', led: 'đèn LED' };

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4();
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

function globToRe(g) {
  return new RegExp('^' + String(g).toLowerCase().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
}
function prettify(name) { return String(name || '').replace(/[_\-.]+/g, ' ').replace(/\s+\d+$/, '').trim(); }

/** Một bộ phận con đang hoạt động */
class SubPart {
  constructor(sys, inst, node, spec) {
    this.sys = sys;
    this.inst = inst;
    this.node = node;
    this.type = spec.type;
    this.spec = { ...DEFAULTS[spec.type], ...spec };
    this.name = spec.id || node.name || spec.node || `${spec.type}`;
    this.label = spec.label || prettify(node.name) || TYPE_LABEL[this.type];
    // trạng thái (khôi phục từ inst.state.subparts nếu có)
    const saved = inst.state?.subparts?.[this.name];
    this.state = {
      open: !!this.spec.open, value: this.spec.value ?? 0, progress: 0, removed: false, plugged: this.spec.plugged !== false,
      on: !!this.spec.on, omega: 0, angle: 0, pressed: 0, ...(saved || {}),
    };
    this.anim = { k: (this.type === 'connector' ? this.state.plugged : this.state.open) ? 1 : 0, press: 0, travel: 0 };
    this.looseDefId = `loose:${inst.def.id}:${spec.node || this.name}`;
    this._capture();
    if (this.type === 'led') this._ledMats();
    if (this.type === 'screw' && this.state.removed) { sys.looseDef(this); this._makeHoleSocket(true); }
    this.apply(true);
  }

  /** Ghi lại tư thế nghỉ của node so với gốc item */
  _capture() {
    const root = this.inst.object, node = this.node;
    root.updateWorldMatrix(true, true);
    const rootInv = _m.copy(root.matrixWorld).invert();
    this.rest = new THREE.Matrix4().multiplyMatrices(rootInv, node.matrixWorld);
    this.parentRel = new THREE.Matrix4().multiplyMatrices(rootInv, node.parent.matrixWorld);
    this.parentRelInv = this.parentRel.clone().invert();
    const axis = this.spec.axis || [0, 1, 0];
    this.axis = new THREE.Vector3(...axis).normalize();
    // hộp bao node trong hệ item
    const box = new THREE.Box3().setFromObject(node);
    if (box.isEmpty()) box.setFromCenterAndSize(_v.setFromMatrixPosition(node.matrixWorld), new THREE.Vector3(1, 1, 1));
    box.applyMatrix4(rootInv);
    this.box = box;
    if (this.spec.pivot) this.pivot = new THREE.Vector3(...this.spec.pivot);
    else {
      this.pivot = box.getCenter(new THREE.Vector3());
      if (this.type === 'hinge') {
        const side = new THREE.Vector3(...(this.spec.side || [0, 0, -1]));
        const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
        this.pivot.add(new THREE.Vector3(side.x * half.x, side.y * half.y, side.z * half.z));
      }
    }
  }

  _ledMats() {
    this.ledMats = [];
    const col = new THREE.Color(this.spec.color || '#ff2a1a');
    this.node.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const own = mats.map((m) => { const c = m.clone(); if ('emissive' in c) c.emissive = col.clone(); return c; });
      o.material = Array.isArray(o.material) ? own : own[0];
      this.ledMats.push(...own);
    });
  }

  /** Đặt node theo (góc quay quanh trục qua pivot, dịch theo trục) — tính trong hệ item */
  setTransform(angle, travel) {
    const M = _m.makeTranslation(this.pivot.x, this.pivot.y, this.pivot.z);
    if (angle) M.multiply(_m2.makeRotationAxis(this.axis, angle));
    M.multiply(_m2.makeTranslation(-this.pivot.x, -this.pivot.y, -this.pivot.z));
    if (travel) M.multiply(_m2.makeTranslation(this.axis.x * travel, this.axis.y * travel, this.axis.z * travel));
    M.multiply(this.rest);
    _m3.multiplyMatrices(this.parentRelInv, M);
    _m3.decompose(this.node.position, this.node.quaternion, this.node.scale);
  }

  /** Áp trạng thái hiện tại lên node */
  apply() {
    const s = this.state, sp = this.spec, a = this.anim;
    switch (this.type) {
      case 'button': this.setTransform(0, a.press * sp.travel_mm); break;
      case 'knob': {
        const ang = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(sp.min_deg, sp.max_deg, s.value));
        this.setTransform(ang, 0); break;
      }
      case 'hinge': this.setTransform(THREE.MathUtils.degToRad(sp.angle_deg) * ease(a.k), 0); break;
      case 'slide': this.setTransform(0, sp.travel_mm * ease(a.k)); break;
      case 'connector': this.setTransform(0, sp.travel_mm * ease(1 - a.k)); break;
      case 'screw': {
        const p = s.progress;
        this.setTransform(-p * sp.turns * Math.PI * 2, p * sp.travel_mm);
        this.node.visible = !s.removed;
        if (this.holeSocket) this.holeSocket.disabled = !s.removed;
        break;
      }
      case 'spin': this.setTransform(s.angle, 0); break;
      case 'led':
        for (const m of this.ledMats || []) if ('emissiveIntensity' in m) m.emissiveIntensity = s.on ? (s.intensity ?? 2.4) : 0;
        break;
      default: break;
    }
  }

  worldPosition(target = new THREE.Vector3()) {
    this.inst.object.updateWorldMatrix(true, false);
    return target.copy(this.box.getCenter(_v)).applyMatrix4(this.inst.object.matrixWorld);
  }

  save() {
    const st = (this.inst.state.subparts ||= {});
    const s = this.state;
    st[this.name] = { open: s.open, value: +(+s.value).toFixed(4), progress: +(+s.progress).toFixed(3), removed: s.removed, plugged: s.plugged, on: s.on };
  }

  changed(extra = {}) {
    this.save();
    const ev = this.sys.game.events;
    ev?.emit('subpart:changed', { item: this.inst, node: this.name, type: this.type, state: { ...this.state }, subpart: this, ...extra });
    if (this.spec.event) ev?.emit(this.spec.event, { item: this.inst, node: this.name, subpart: this, ...extra });
  }

  // -------------------------------------------------------------- vít: tạo khe để lắp lại + vật "vít rời"
  _makeHoleSocket(silent = false) {
    const sys = this.sys, game = sys.game;
    if (this.holeSocket || !game.sockets) return;
    const anchor = new THREE.Object3D();
    anchor.name = `${this.name}-hole`;
    // đặt ở vị trí đầu vít (hệ item), +Y của khe = hướng vít đi ra
    const top = this.box.getCenter(new THREE.Vector3());
    anchor.position.copy(top);
    anchor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.axis);
    this.inst.object.add(anchor);
    const kind = this.spec.socket || 'screw';
    this.holeSocket = game.sockets.add({
      id: `${this.inst.uid}:${this.name}:hole`, owner: this.inst, object3D: anchor, kind, name: `lỗ ${this.label}`,
      polarized: false, snapRadius: 18,
      accepts: (item) => ({ ok: !!item.def.insertInto?.includes(kind) || item.def.id === this.looseDefId || item.def.id === this.spec.item, reason: 'Không phải vít của lỗ này' }),
      pose: new THREE.Matrix4(),
      onInsert: (item) => {
        // vít rời quay về lỗ → hiện lại node gốc ở trạng thái "lỏng" (progress = 1), bỏ vật rời
        setTimeout(() => game.items?.remove(item), 0);
        this.state.removed = false; this.state.progress = 1;
        this.apply();
        this.changed({ reinserted: true });
        game.hud?.toast?.(`Đã đặt ${this.label} vào lỗ — giữ chuột trái với tua vít để vặn chặt`);
      },
    });
    this.holeSocket.disabled = !this.state.removed;
  }

  _spawnLoose() {
    const game = this.sys.game;
    const items = game.items;
    if (!items) return null;
    this.node.updateWorldMatrix(true, true);
    let inst = null;
    const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
    this.node.matrixWorld.decompose(wp, wq, ws);
    if (this.spec.item && items.get(this.spec.item)) {
      inst = items.spawn(this.spec.item, { pos: wp });
    } else {
      const def = this.sys.looseDef(this);
      inst = items.spawn(def.id, { pos: wp });
    }
    if (inst) {
      // văng nhẹ ra theo hướng vít
      const dir = this.axis.clone().transformDirection(this.inst.object.matrixWorld);
      inst.object.position.addScaledVector(dir, 6);
      items.drop(inst, dir.multiplyScalar(180).add(new THREE.Vector3((Math.random() - 0.5) * 120, 120, (Math.random() - 0.5) * 120)), new THREE.Vector3(Math.random() * 6, Math.random() * 6, 0));
    }
    return inst;
  }
}

function ease(k) { return k * k * (3 - 2 * k); }

export class SubParts {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.byInst = new Map();      // uid → [SubPart]
    this.manifest = new Map();    // cad path → entry
    this._looseTemplates = new Map();
    game.events?.on('power:on', (e) => { if (e.item) this.setPowered(e.item, true); });
    game.events?.on('power:off', (e) => { if (e.item) this.setPowered(e.item, false); });
  }

  /** Nạp metadata "interact" từ manifest CAD (chỉ trình duyệt) */
  async loadManifest() {
    if (typeof window === 'undefined') return 0;
    try {
      const cad = await import('../../core/cad.js');
      const m = await cad.cadManifest();
      for (const e of m?.models || []) if (e?.path) this.manifest.set(e.path, e);
      // item đã sinh trước khi manifest về → gắn lại
      for (const it of this.game.items?.all || []) if (it.def.cad && this.manifest.get(it.def.cad)?.interact) this.attach(it);
      return this.manifest.size;
    } catch (e) { console.warn('[subparts] không nạp được manifest', e); return 0; }
  }

  specsFor(inst) {
    const out = [];
    const entry = inst.def.cad ? this.manifest.get(inst.def.cad) : null;
    // def.cadInteractSkip = ['connector', 'conn_*'] → bỏ bản ghi manifest theo loại hoặc tên node (vd. đầu cắm PCB: việc cắm/rút
    // đã do hệ khe (sockets) đảm nhận, không cho thân đầu cắm trượt như một sub-part). def.cadInteract === false → bỏ hết.
    const skip = inst.def.cadInteract === false ? null : (inst.def.cadInteractSkip || []).map((x) => globToRe(x));
    if (Array.isArray(entry?.interact) && skip) {
      for (const s of entry.interact) {
        if (skip.some((r) => r.test(String(s?.type || '').toLowerCase()) || r.test(String(s?.node || '').toLowerCase()))) continue;
        const n = this._fromManifest(s, entry, inst); if (n) out.push(n);
      }
    }
    if (Array.isArray(inst.def.interact)) out.push(...inst.def.interact);
    return out;
  }

  /**
   * [mở rộng 2026-10 — tích hợp CAD] Chuẩn hoá một bản ghi 'interact' của manifest CAD sang spec subparts:
   *  - đổi tên loại (lift/pull/slider → slide, lid → hinge|slide, swivel/fan/shaft/rotary → spin, switch → button,
   *    screw_terminal → screw (vít kẹp dây, không tháo rời), pad → pin); loại chỉ mang thông tin (ic, usb-c, terminal,
   *    sensor, module…) bị bỏ qua lặng lẽ.
   *  - đổi hệ toạ độ: nhóm 'boards' ghi axis theo CAD Z-up → GLB Y-up (x, z, −y); rồi GLB → hệ ITEM theo phép quay/dời
   *    của node 'cad' mà items.js gắn (def.cadOptions.rotateX/Y/Z, offset). origin_mm (robot) / origin (vendor) → pivot.
   *  - 'after' (robot) → lockedBy (chỉ thao tác được khi các bộ phận kia đã tháo/mở); "screw_top_1..4" → screw_top_1…4.
   */
  _fromManifest(s, entry, inst) {
    if (!s || typeof s !== 'object' || !s.node || s.grid) return null;
    const ALIAS = { lift: 'slide', pull: 'slide', slider: 'slide', swivel: 'spin', fan: 'spin', shaft: 'spin', rotary: 'spin', switch: 'button', screw_terminal: 'screw', pad: 'pin' };
    let type = ALIAS[s.type] || s.type;
    if (s.type === 'lid') type = s.travel_mm && !s.angle_deg ? 'slide' : 'hinge';
    if (!SUBPART_TYPES.includes(type)) return null;
    const spec = { ...s, type, _manifest: true };
    // vít kẹp dây của cầu đấu (screw_terminal, hoặc vít 'screw' có net trên board): vặn lỏng/chặt, không rơi ra
    if (s.type === 'screw_terminal' || (s.type === 'screw' && s.net)) { spec.travel_mm = s.travel_mm ?? 0.8; spec.turns = s.turns ?? 2; spec.captive = true; spec.label = spec.label || `vít ${s.net || 'cầu đấu'}`; }
    if (s.type === 'pad') spec.net = s.net;
    // vendor: một bản ghi 'pin' cho cả dãy (nodes: "pin_1..pin_40") → khớp mọi pin_<số>
    if (type === 'pin' && /^(\w*?)\d+\.\.\1\d+$/.test(String(s.nodes || ''))) spec.node = String(s.nodes).replace(/\d+\.\..*$/, '*');
    // cầu đấu vendor không tách node vít riêng (node = cả khối) → không tạo vít xoay cả khối
    if (s.type === 'screw_terminal' && !/screw/i.test(s.node)) return null;
    const frag = entry?._fragment || String(entry?.path || '').split('/')[0];
    const toGlb = (v) => (frag === 'boards' ? [v[0], v[2], -v[1]] : v);
    const cad = inst.object?.userData?.cadLoaded ? (inst.object.userData.cad || inst.object.getObjectByName('cad')) : null;
    const q = cad ? cad.quaternion : null;
    if (Array.isArray(s.axis)) {
      const a = new THREE.Vector3(...toGlb(s.axis));
      if (q) a.applyQuaternion(q);
      spec.axis = a.toArray().map((x) => +x.toFixed(6));
    }
    const org = s.origin_mm || (frag === 'vendor' ? s.origin : null);
    if (Array.isArray(org) && cad) {
      const p = new THREE.Vector3(...toGlb(org)).multiplyScalar(0.001);
      cad.updateMatrix();
      p.applyMatrix4(cad.matrix);           // cad là con trực tiếp của gốc item
      spec.pivot = p.toArray();
    } else delete spec.pivot;
    if (Array.isArray(s.after) && s.after.length) {
      spec.lockedBy = s.after.flatMap((a) => {
        const m = /^(.*?)(\d+)\.\.(\d+)$/.exec(String(a));
        if (!m) return [String(a).split('/').pop()];
        const out = []; for (let k = +m[2]; k <= +m[3]; k++) out.push(`${m[1]}${k}`);
        return out;
      });
    }
    if (s.type === 'led' && s.color && !String(s.color).startsWith('#')) {
      spec.color = { red: '#ff2a1a', green: '#22ff55', blue: '#3a6bff', yellow: '#ffc21a', orange: '#ff8a1a', white: '#f4f6ff', amber: '#ffb000' }[s.color] || '#ff2a1a';
    }
    return spec;
  }

  /** Quét item, tạo bộ phận con theo khai báo (gọi lại an toàn — sẽ gỡ cái cũ trước) */
  attach(inst) {
    if (!inst?.object) return [];
    this.detach(inst);
    const specs = this.specsFor(inst);
    const made = [];
    const used = new Set();
    // nút có userData.interact
    const entry = inst.def.cad ? this.manifest.get(inst.def.cad) : null;
    inst.object.traverse((o) => {
      let ui = o.userData?.interact;
      if (!ui || typeof ui !== 'object' || o === inst.object) return;
      // [2026-10] GLB robot/* mang sẵn bản ghi manifest trong node.extras (GLTFLoader → userData.interact, có trường 'frame'):
      // bản thô này dùng hệ GLB/hướng chưa quay → chuẩn hoá như bản ghi manifest (axis theo cadOptions, origin_mm → pivot, after → lockedBy)
      if (typeof ui.frame === 'string' && /glb/i.test(ui.frame)) ui = this._fromManifest({ ...ui, node: o.name }, entry || { path: inst.def.cad || 'robot/' }, inst);
      if (ui && SUBPART_TYPES.includes(ui.type)) {
        used.add(o);
        made.push(this._create(inst, o, { node: o.name, ...ui }));
      }
    });
    for (const spec of specs) {
      if (!spec || !SUBPART_TYPES.includes(spec.type)) { if (spec?.type) console.warn('[subparts] loại không hỗ trợ', spec.type); continue; }
      if (spec.object?.isObject3D) { made.push(this._create(inst, spec.object, spec)); continue; }
      if (!spec.node) continue;
      // tên node có thể là đường dẫn 'wheel_l/wheel' (manifest robot): khớp đoạn cuối + tổ tiên lần lượt khớp các đoạn trước.
      // GLTFLoader làm sạch tên node (bỏ . : / [ ], khoảng trắng → _) → làm sạch mẫu giống vậy.
      const segs = String(spec.node).split('/').filter(Boolean).map(sanitizeName);
      const re = globToRe(segs[segs.length - 1]);
      const upRes = segs.slice(0, -1).map(globToRe);
      const pathOk = (o) => {
        let k = upRes.length - 1;
        for (let p = o.parent; p && p !== inst.object && k >= 0; p = p.parent) if (p.name && upRes[k].test(p.name.toLowerCase())) k--;
        return k < 0;
      };
      let nodes = [];
      inst.object.traverse((o) => { if (o !== inst.object && o.name && re.test(o.name.toLowerCase()) && !used.has(o) && (!upRes.length || pathOk(o))) nodes.push(o); });
      // đã có mô hình CAD → ưu tiên node trong GLB (mesh thủ tục cùng tên đã bị ẩn)
      const cad = inst.object.userData.cadLoaded ? inst.object.getObjectByName('cad') : null;
      if (cad) {
        const inCad = nodes.filter((n) => isAncestor(cad, n));
        if (inCad.length) nodes = inCad;
        // mesh thủ tục đã bị chuyển sang lớp 31 (ẩn sau khi CAD tải) → không tạo bộ phận trùng trên đó
        else nodes = nodes.filter((n) => { let vis = false; n.traverse((m) => { if (m.isMesh && (m.layers.mask & 1)) vis = true; }); return vis || !n.children.length && !n.isMesh; });
      }
      // bỏ node con nếu cha nó cũng khớp (GLB hay có mesh con cùng tên)
      const top = nodes.filter((n) => !nodes.some((p) => p !== n && isAncestor(p, n)));
      for (const n of top) { used.add(n); made.push(this._create(inst, n, spec.type === 'pin' && spec._manifest ? this._pinSpec(inst, n, spec) : spec)); }
    }
    const ok = made.filter(Boolean);
    if (ok.length) this.byInst.set(inst.uid, ok);
    inst.subparts = ok;
    return ok;
  }

  /** [mở rộng] Chân CAD 'pin_<x>' → nhãn/net theo chân của def (id x, x với '_'→'-', hoặc thứ tự) */
  _pinSpec(inst, node, spec) {
    const suf = String(node.name).replace(/^pin_?/i, '');
    let pins = [];
    try { pins = inst.def.getPins ? inst.def.getPins(inst) : inst.def.pins || []; } catch { pins = inst.def.pins || []; }
    const p = pins.find((q) => q.id === suf || q.id === suf.replace(/_/g, '-')) || (/^\d+$/.test(suf) ? pins.find((q) => q.num === +suf) || pins[+suf - 1] : null);
    if (!p) return spec;
    const nm = p.name && p.name !== p.id ? `${p.id} · ${p.name}` : String(p.id);
    return { ...spec, label: spec.label || nm, net: spec.net || p.net || null };
  }

  /** Thêm thủ công một bộ phận con */
  add(inst, object, spec) {
    const sp = this._create(inst, object, spec);
    if (!sp) return null;
    const arr = this.byInst.get(inst.uid) || [];
    arr.push(sp); this.byInst.set(inst.uid, arr);
    inst.subparts = arr;
    return sp;
  }

  _create(inst, node, spec) {
    try {
      const sp = new SubPart(this, inst, node, spec);
      this.list.push(sp);
      this._register(sp);
      return sp;
    } catch (e) { console.warn('[subparts] không tạo được', spec, e); return null; }
  }

  detach(inst) {
    const arr = this.byInst.get(inst.uid);
    if (!arr) return;
    for (const sp of arr) {
      this.game.interact?.unregister?.(sp.node);
      const i = this.list.indexOf(sp);
      if (i >= 0) this.list.splice(i, 1);
    }
    this.byInst.delete(inst.uid);
    inst.subparts = [];
  }

  list_(inst) { return this.byInst.get(inst.uid) || []; }
  find(inst, name) { return (this.byInst.get(inst.uid) || []).find((s) => s.name === name || s.node.name === name) || null; }

  // -------------------------------------------------------------- đăng ký gợi ý tương tác
  _register(sp) {
    const it = this.game.interact;
    if (!it?.register || sp.type === 'led') return;
    const game = this.game;
    const L = sp.label;
    const spec = { name: cap(L), subpart: sp, item: sp.inst, prompts: [] };
    const P = spec.prompts;
    switch (sp.type) {
      case 'button':
        P.push({ key: 'E', label: `Nhấn ${L}`, do: () => this.press(sp) });
        break;
      case 'hinge':
        P.push({ key: 'E', label: () => `${sp.state.open ? 'Đóng' : 'Mở'} ${L}`, do: () => this.toggle(sp) });
        break;
      case 'slide':
        P.push({ key: 'E', label: () => `${sp.state.open ? 'Đẩy vào' : 'Kéo ra'} ${L}`, do: () => this.toggle(sp) });
        break;
      case 'connector':
        P.push({ key: 'E', label: () => `${sp.state.plugged ? 'Rút' : 'Cắm'} ${L}`, do: () => this.toggle(sp) });
        break;
      case 'knob':
        spec.name = () => `${cap(L)} · ${Math.round(sp.state.value * 100)}%`;
        P.push({ key: 'LMB', hold: true, label: 'Kéo chuột để xoay', drag: true });
        P.push({ key: 'WHEEL', label: 'Xoay từng nấc' });
        spec.onScroll = (ctx, d) => this.turn(sp, (-d / (sp.spec.detents || 24)) * Math.PI * 2 * ((sp.spec.max_deg - sp.spec.min_deg) / 360));
        spec.onDrag = (ctx, dx) => this.turn(sp, dx * 0.012);
        break;
      case 'spin':
        P.push({ key: 'E', label: `Quay ${L}`, do: () => this.flick(sp) });
        P.push({ key: 'LMB', hold: true, label: `Giữ để quay ${L}`, onHold: (ctx, dt) => { sp.state.omega = Math.min(30, sp.state.omega + 40 * dt); return false; } });
        break;
      case 'screw': {
        const need = sp.spec.tool || 'screwdriver';
        P.push({
          key: 'LMB', hold: true, withTool: true,
          label: () => (sp.state.progress > 0.001 ? `Vặn chặt ${L}` : `Vặn ${L} ra`) + ` (${toolLabel(need, sp.spec.bit)})`,
          enabled: () => this._hasTool(sp),
          reason: () => `cần ${toolLabel(need, sp.spec.bit)}`,
          progress: () => sp.state.progress,
          onStart: (ctx) => { sp._dir = sp.state.progress > 0.001 ? -1 : 1; sp._acc = 0; game.hands?.setReach('right', sp.worldPosition()); },
          onHold: (ctx, dt) => this._driveScrew(sp, dt),
          onRelease: () => { game.hands?.setReach('right', null); },
        });
        break;
      }
      case 'pin':
        spec.name = `Chân ${L}${sp.spec.net ? ` · ${sp.spec.net}` : ''}`;
        spec.pin = { name: L, net: sp.spec.net || null, node: sp.node };
        break;
      default: break;
    }
    // khoá: nắp/ngăn chỉ mở được khi các vít giữ đã tháo (spec.lockedBy: ['screw_*'])
    if (sp.spec.lockedBy) {
      const res = [].concat(sp.spec.lockedBy).map(globToRe);
      // [mở rộng] ngoài vít (chưa tháo) còn tính nắp/ngăn chưa mở và đầu cắm chưa rút (manifest robot: 'after'); áp cho hinge & slide
      const holds = (o) => (o.type === 'screw' ? !o.state.removed && !o.spec.captive : o.type === 'hinge' || o.type === 'slide' ? !o.state.open : o.type === 'connector' ? o.state.plugged : false);
      const blockers = () => (this.byInst.get(sp.inst.uid) || []).filter((o) => o !== sp && holds(o) && res.some((r) => r.test(String(o.name).toLowerCase())));
      for (const p of P) {
        if (p.key !== 'E') continue;
        p.enabled = () => !((sp.type === 'hinge' || sp.type === 'slide') && !sp.state.open && blockers().length);
        p.reason = () => { const b = blockers(); return b.every((o) => o.type === 'screw') ? `còn ${b.length} vít giữ — tháo vít trước` : `cần tháo/mở trước: ${b.map((o) => o.label).join(', ')}`; };
      }
    }
    it.register(sp.node, spec);
  }

  _hasTool(sp) {
    const inv = this.game.inventory;
    const tool = inv?.activeTool;
    if (!tool) return false;
    const need = sp.spec.tool || 'screwdriver';
    const kind = toolKind(tool.def);
    if (kind !== need && !(need === 'screwdriver' && /screwdriver|driver/.test(kind || ''))) return false;
    if (sp.spec.bit && tool.def.tool?.bit && tool.def.tool.bit !== sp.spec.bit) return false;
    return true;
  }

  // -------------------------------------------------------------- hành động
  _poke(sp, gesture = 'tap') {
    const h = this.game.hands;
    if (!h || h.right.held) return;
    h.setPose('right', 'press');
    h.setReach('right', sp.worldPosition());
    h.playGesture(gesture, 'right');
    clearTimeout(sp._pokeT);
    sp._pokeT = setTimeout(() => { if (h.right.poseName === 'press') h.setPose('right', 'idle'); h.setReach('right', null); }, 320);
  }

  press(sp) {
    sp.anim.pressT = 0;
    sp.state.pressed = (sp.state.pressed || 0) + 1;
    this._poke(sp, 'tap');
    this.game.audio?.play('click', { pos: sp.node });
    this.game.events?.emit('item:button', { item: sp.inst, node: sp.name, subpart: sp });
    sp.changed({ action: 'press' });
  }

  toggle(sp) {
    const s = sp.state;
    if (sp.type === 'connector') {
      s.plugged = !s.plugged;
      this.game.audio?.play(s.plugged ? 'snap' : 'click', { pos: sp.node });
      this.game.events?.emit('connector:changed', { item: sp.inst, node: sp.name, plugged: s.plugged, mate: sp.spec.mate || null });
      if (s.plugged) this.game.events?.emit('wire:connected', { a: `${sp.inst.uid}:${sp.name}`, b: sp.spec.mate || null, item: sp.inst });
      else this.game.events?.emit('wire:disconnected', { a: `${sp.inst.uid}:${sp.name}`, b: sp.spec.mate || null, item: sp.inst });
    } else {
      s.open = !s.open;
      this.game.audio?.play(sp.type === 'slide' ? 'whoosh' : 'click', { pos: sp.node, vol: 0.6 });
      this.game.events?.emit(sp.type === 'hinge' ? 'item:hinge' : 'item:slide', { item: sp.inst, node: sp.name, open: s.open, subpart: sp });
    }
    this._poke(sp, 'push');
    sp.changed({ action: 'toggle' });
  }

  turn(sp, deltaRad) {
    const range = THREE.MathUtils.degToRad(sp.spec.max_deg - sp.spec.min_deg) || Math.PI * 1.5;
    const before = sp.state.value;
    sp.state.value = THREE.MathUtils.clamp(before + deltaRad / range, 0, 1);
    const det = sp.spec.detents || 24;
    if (Math.floor(before * det) !== Math.floor(sp.state.value * det)) this.game.audio?.play('tick', { pos: sp.node, vol: 0.6 });
    if (sp.state.value !== before) {
      sp.apply();
      const angle = THREE.MathUtils.lerp(sp.spec.min_deg, sp.spec.max_deg, sp.state.value);
      this.game.events?.emit('item:knob', { item: sp.inst, node: sp.name, value: sp.state.value, angle, subpart: sp });
      sp._dirty = true;
    }
  }

  flick(sp) {
    sp.state.omega = Math.min(40, sp.state.omega + 16);
    this._poke(sp, 'push');
    this.game.audio?.play('whoosh', { pos: sp.node, vol: 0.4 });
    this.game.events?.emit('item:spin', { item: sp.inst, node: sp.name, omega: sp.state.omega, subpart: sp });
  }

  /** Giữ chuột trái với tua vít: tháo ra (dir +1) hoặc vặn chặt (dir −1). Trả về true khi xong. */
  _driveScrew(sp, dt) {
    if (!this._hasTool(sp)) return true;
    const s = sp.state, dir = sp._dir || 1;
    const before = s.progress;
    s.progress = THREE.MathUtils.clamp(s.progress + (dir * dt) / (sp.spec.duration || 1.4), 0, 1);
    sp.apply();
    // mỗi 1/4 vòng: tiếng tạch + vặn cổ tay
    const q = Math.floor(before * sp.spec.turns * 4), q2 = Math.floor(s.progress * sp.spec.turns * 4);
    if (q !== q2) { this.game.audio?.play('tick', { pos: sp.node, vol: 0.5 }); if (q2 % 2 === 0) this.game.hands?.playGesture('twist', 'right', 0.3); }
    this.game.hands?.setReach('right', sp.worldPosition());
    if (dir > 0 && s.progress >= 1 && sp.spec.captive) {
      // vít giữ (captive — vd. vít kẹp dây cầu đấu): đã nới hết cỡ, không rơi ra
      this.game.events?.emit('screw:driven', { item: sp.inst, node: sp.name, torque: 0.1, stripped: false, removed: false, dir: 'out', captive: true });
      sp.changed({ action: 'loosened' });
      this.game.hands?.setReach('right', null);
      return true;
    }
    if (dir > 0 && s.progress >= 1) {
      s.removed = true;
      sp.apply();
      sp._makeHoleSocket();
      const loose = sp._spawnLoose();
      this.game.audio?.play('drop', { pos: sp.node, vol: 0.3, rate: 1.4 });
      this.game.events?.emit('screw:driven', { item: sp.inst, node: sp.name, torque: 0.25, stripped: false, removed: true, dir: 'out', loose });
      this.game.hud?.toast?.(`Đã tháo ${sp.label}`);
      sp.changed({ action: 'removed' });
      this.game.hands?.setReach('right', null);
      return true;
    }
    if (dir < 0 && s.progress <= 0) {
      this.game.audio?.play('snap', { pos: sp.node, vol: 0.5 });
      this.game.events?.emit('screw:driven', { item: sp.inst, node: sp.name, torque: 0.5, stripped: false, removed: false, dir: 'in' });
      sp.changed({ action: 'tightened' });
      this.game.hands?.setReach('right', null);
      return true;
    }
    return false;
  }

  /** Def "vít rời" tạo tự động từ hình dạng node (để nhặt / lắp lại) */
  looseDef(sp) {
    const id = `loose:${sp.inst.def.id}:${sp.spec.node || sp.name}`;
    sp.looseDefId = id;
    const items = this.game.items;
    if (items.get(id)) return items.get(id);
    // mẫu hình: bản sao node, đã nhân tỉ lệ thế giới (GLB ×1000), đáy đặt ở y = 0
    const tpl = new THREE.Group();
    const c = cloneVisual(sp.node);
    sp.node.updateWorldMatrix(true, false);
    const ws = new THREE.Vector3(); sp.node.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), ws);
    c.position.set(0, 0, 0); c.quaternion.identity(); c.scale.copy(ws);
    c.visible = true;
    // quay để trục vít thẳng đứng
    c.quaternion.setFromUnitVectors(sp.axis, new THREE.Vector3(0, 1, 0));
    tpl.add(c);
    tpl.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(tpl);
    if (!bb.isEmpty()) { const ctr = bb.getCenter(new THREE.Vector3()); c.position.set(-ctr.x, -bb.min.y, -ctr.z); }
    this._looseTemplates.set(id, tpl);
    const kind = sp.spec.socket || 'screw';
    return items.register({
      id, name: cap(sp.label), kind: 'part', category: 'mech', massG: 1, insertInto: [kind], generated: true,
      build: () => cloneVisual(this._looseTemplates.get(id)),
    });
  }

  // -------------------------------------------------------------- LED / nguồn
  setLed(inst, name, on, intensity) {
    const sp = this.find(inst, name);
    if (!sp || sp.type !== 'led') return false;
    sp.state.on = !!on;
    if (intensity !== undefined) sp.state.intensity = intensity;
    sp.apply(); sp.save();
    return true;
  }

  setPowered(inst, on, rail = null) {
    for (const sp of this.byInst.get(inst.uid) || []) {
      if (sp.type !== 'led') continue;
      if (rail && sp.spec.power && sp.spec.power !== rail) continue;
      sp.state.on = !!on; sp.apply(); sp.save();
    }
  }

  // -------------------------------------------------------------- hoạt cảnh
  update(dt) {
    for (const sp of this.list) {
      const a = sp.anim, s = sp.state;
      switch (sp.type) {
        case 'button': {
          if (a.pressT !== undefined) {
            a.pressT += dt;
            // ấn xuống 0.07 s, giữ 0.05 s, nhả 0.12 s
            const t = a.pressT;
            a.press = t < 0.07 ? t / 0.07 : t < 0.12 ? 1 : Math.max(0, 1 - (t - 0.12) / 0.12);
            if (t > 0.24) { a.press = 0; a.pressT = undefined; }
            sp.apply();
          }
          break;
        }
        case 'hinge': case 'slide': case 'connector': {
          const target = sp.type === 'connector' ? (s.plugged ? 1 : 0) : (s.open ? 1 : 0);
          if (Math.abs(a.k - target) > 1e-4) {
            const speed = sp.type === 'hinge' ? 2.6 : 3.2;
            a.k += Math.sign(target - a.k) * Math.min(Math.abs(target - a.k), dt * speed);
            sp.apply();
          }
          break;
        }
        case 'spin':
          if (s.omega > 0.01) {
            s.angle += s.omega * dt;
            s.omega *= Math.exp(-1.2 * dt);
            sp.apply();
          }
          break;
        case 'knob':
          if (sp._dirty) { sp._dirty = false; sp.save(); }
          break;
        default: break;
      }
    }
  }
}

function isAncestor(a, b) { for (let o = b.parent; o; o = o.parent) if (o === a) return true; return false; }
/** Giống THREE.PropertyBinding.sanitizeNodeName (GLTFLoader dùng khi đặt tên node), giữ '*' của mẫu */
function sanitizeName(n) { return String(n).replace(/\s/g, '_').replace(/[[\].:/]/g, ''); }
function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
function toolLabel(kind, bit) {
  const n = { screwdriver: 'tua vít', iron: 'mỏ hàn', pliers: 'kìm', meter: 'đồng hồ đo', tweezers: 'nhíp' }[kind] || kind;
  return bit ? `${n} ${bit}` : n;
}
