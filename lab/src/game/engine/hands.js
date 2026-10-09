// =============================================================================
// hands.js — Hai bàn tay góc nhìn thứ nhất (viewmodel) dựng THỦ TỤC.
//
// Mô hình: lòng bàn tay (bo tròn, thuôn về cổ tay, gò ngón cái + gò út) · 5 ngón × 3 đốt (khớp xoay, capsule
// thuôn dần) · móng tay · khớp đốt ngón · cổ tay · ống tay áo blouse trắng + măng-sét + cúc.
// Da: MeshPhysicalMaterial (sheen ấm + emissive rất nhẹ giả tán xạ dưới da). Không đổ bóng lên tường.
// Gắn vào camera (đi theo đầu), tự rụt về khi sát tường (setObstruction), lắc theo nhịp thở + bước chân,
// trễ nhẹ theo chuyển động chuột (cảm giác có quán tính).
//
// API (theo GAME_API §3):
//   hands.setPose('right'|'left', 'idle'|'reach'|'grip'|'pinch'|'press'|'inspect'|'holdTool:<kind>', { target?: Vector3 })
//   hands.attach('right'|'left', object3D, { offset:[x,y,z], rot:[rx,ry,rz], pose?, auto? })
//   hands.detach(side) → object3D (vẫn giữ nguyên vị trí thế giới — caller tự gắn lại vào scene)
//   hands.playGesture('tap'|'push'|'twist'|'squeeze', side)
//   hands.right.tipWorldPosition(v?) → Vector3   đầu dụng cụ đang cầm (def.tool.tip) hoặc đầu ngón trỏ
//   hands.right.held                              Object3D đang cầm (hoặc null)
//   hands.setReach(side, worldPoint|null)         kéo tay để đầu dụng cụ chạm điểm (khi hàn/đo)
//   hands.swap(side, fn)                          hạ tay xuống → gọi fn() (đổi dụng cụ) → đưa tay lên
//   hands.inspect.start(obj, size) / rotate(dx,dy) / stop()  soi vật bằng 2 tay trước mặt
//
// QUY ƯỚC "khung cầm" (holder) — cho người viết item.grip:
//   Gốc = điểm cầm (giữa đầu ngón cái và ngón trỏ với pinch/cầm bút; giữa lòng bàn tay với grip).
//   −Z = hướng mũi dụng cụ / mặt trước vật (đã nghiêng sẵn theo tư thế: mỏ hàn chúc xuống ~30°), +Y = lên.
//   grip.offset = vị trí GỐC mô hình item trong khung cầm (mm) — tức là −(điểm cầm) khi rot = 0.
//   grip.rot    = góc Euler XYZ (rad) của mô hình trong khung cầm (thường [0,0,0]: tư thế đã nghiêng sẵn).
//   (khớp quy ước items/tools/_kit.js). Bỏ trống grip.offset → tự căn tâm hộp bao vào điểm cầm.
//   Dụng cụ có tool.tip mà bỏ trống CẢ offset và rot → tự xoay để (tip − tâm) hướng −Z, cầm cách mũi ~35%.
// =============================================================================
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const D2R = Math.PI / 180;

// ---------------------------------------------------------------------------- tư thế
// Toạ độ trong KHÔNG GIAN CAMERA (mm): +X phải, +Y lên, −Z phía trước. Giá trị cho TAY PHẢI (tay trái tự lật gương).
// pos: cổ tay · rot: Euler 'YXZ' của bàn tay (mặc định ngón chỉ −Z, mu bàn tay +Y)
// f: { t,i,m,r,p } mỗi ngón [xoè (rad, + = về phía ngón cái), gập đốt 1, gập đốt 2, gập đốt 3] (rad, + = gập vào lòng)
// obj: Euler 'YXZ' của khung cầm trong không gian camera · anchor: 'palm' | 'pinch'
const RELAX = { t: [0.62, 0.12, 0.22, 0.18], i: [0.07, 0.22, 0.32, 0.2], m: [0.0, 0.28, 0.4, 0.22], r: [-0.07, 0.34, 0.46, 0.26], p: [-0.15, 0.42, 0.52, 0.3] };
const OPEN = { t: [0.95, 0.0, 0.08, 0.05], i: [0.12, 0.06, 0.08, 0.05], m: [0.0, 0.06, 0.1, 0.06], r: [-0.12, 0.08, 0.1, 0.06], p: [-0.24, 0.1, 0.12, 0.08] };
const FIST = { t: [0.3, 0.55, 0.5, 0.45], i: [0.04, 1.25, 1.35, 0.85], m: [0.0, 1.3, 1.4, 0.9], r: [-0.04, 1.32, 1.42, 0.9], p: [-0.08, 1.35, 1.4, 0.9] };
const GRIP = { t: [0.35, 0.45, 0.4, 0.3], i: [0.05, 0.85, 0.8, 0.5], m: [0.0, 0.9, 0.85, 0.55], r: [-0.05, 0.95, 0.88, 0.55], p: [-0.1, 1.0, 0.9, 0.55] };
const PINCH = { t: [0.42, 0.38, 0.32, 0.22], i: [0.05, 0.62, 0.52, 0.32], m: [0.0, 0.95, 1.05, 0.7], r: [-0.05, 1.1, 1.2, 0.8], p: [-0.1, 1.2, 1.25, 0.8] };
const PEN = { t: [0.4, 0.38, 0.32, 0.25], i: [0.06, 0.5, 0.42, 0.3], m: [0.0, 0.78, 0.72, 0.42], r: [-0.05, 1.2, 1.3, 0.85], p: [-0.1, 1.3, 1.35, 0.85] };
const POINT = { t: [0.3, 0.5, 0.5, 0.4], i: [0.04, 0.04, 0.05, 0.05], m: [0.0, 1.3, 1.4, 0.9], r: [-0.04, 1.32, 1.42, 0.9], p: [-0.08, 1.35, 1.4, 0.9] };
const FLAT = { t: [0.75, 0.1, 0.12, 0.1], i: [0.04, 0.25, 0.22, 0.12], m: [0.0, 0.28, 0.24, 0.12], r: [-0.04, 0.3, 0.26, 0.14], p: [-0.08, 0.32, 0.28, 0.14] };

export const POSES = {
  idle: { pos: [175, -188, -345], rot: [-0.12, 0.22, -0.55], f: RELAX, obj: [0.2, 0.2, 0], anchor: 'palm', speed: 9 },
  reach: { pos: [150, -150, -470], rot: [-0.08, 0.12, -0.3], f: OPEN, obj: [0, 0, 0], anchor: 'palm', speed: 14 },
  grip: { pos: [150, -168, -370], rot: [0.06, 0.28, -1.2], f: GRIP, obj: [0.15, 0.25, 0], anchor: 'palm', speed: 12 },
  pinch: { pos: [150, -160, -350], rot: [0.12, 0.3, -0.85], f: PINCH, obj: [0.45, 0.25, 0], anchor: 'pinch', speed: 12 },
  press: { pos: [140, -165, -455], rot: [-0.32, 0.14, -0.25], f: POINT, obj: [0, 0, 0], anchor: 'pinch', speed: 16 },
  point: { pos: [150, -170, -420], rot: [-0.2, 0.16, -0.3], f: POINT, obj: [0, 0, 0], anchor: 'pinch', speed: 12 },
  inspect: { pos: [120, -125, -300], rot: [0.2, 0.75, -1.45], f: GRIP, obj: [0, 0, 0], anchor: 'palm', speed: 10 },
  stow: { pos: [215, -470, -230], rot: [0.35, 0.3, -0.7], f: RELAX, obj: [0.2, 0.2, 0], anchor: 'palm', speed: 14 },
  // [UX] ngồi: bàn tay đặt úp trên mặt bàn (ux/seating.js kéo đầu ngón tới điểm trên bàn bằng setReach)
  rest: { pos: [165, -235, -390], rot: [-0.55, 0.18, -0.15], f: FLAT, obj: [0.2, 0.2, 0], anchor: 'palm', speed: 7 },
  'holdTool:iron': { pos: [125, -175, -335], rot: [0.28, 0.42, -0.75], f: PEN, obj: [-0.55, 0.14, 0], anchor: 'pinch', speed: 11 },
  'holdTool:probe': { pos: [130, -172, -340], rot: [0.28, 0.4, -0.75], f: PEN, obj: [-0.5, 0.12, 0], anchor: 'pinch', speed: 11 },
  'holdTool:tweezers': { pos: [130, -168, -345], rot: [0.22, 0.4, -0.8], f: PEN, obj: [-0.45, 0.12, 0], anchor: 'pinch', speed: 11 },
  'holdTool:solder': { pos: [140, -170, -360], rot: [0.12, 0.3, -0.9], f: PINCH, obj: [-0.3, 0.35, 0], anchor: 'pinch', speed: 11 },
  'holdTool:screwdriver': { pos: [150, -178, -365], rot: [0.02, 0.2, -1.3], f: FIST, obj: [-0.22, 0.08, 0], anchor: 'palm', speed: 11 },
  'holdTool:cutter': { pos: [150, -178, -370], rot: [0.05, 0.22, -1.25], f: GRIP, obj: [-0.25, 0.1, 0], anchor: 'palm', speed: 11 },
  'holdTool:pliers': { pos: [150, -178, -370], rot: [0.05, 0.22, -1.25], f: GRIP, obj: [-0.25, 0.1, 0], anchor: 'palm', speed: 11 },
  'holdTool:meter': { pos: [125, -190, -330], rot: [0.4, 0.25, -2.85], f: FLAT, obj: [0.85, 0.15, 0], anchor: 'palm', speed: 10 },
  'holdTool:default': { pos: [150, -176, -365], rot: [0.04, 0.2, -1.25], f: GRIP, obj: [-0.2, 0.1, 0], anchor: 'palm', speed: 11 },
};
// bí danh tên dụng cụ hay gặp
const POSE_ALIAS = {
  'holdTool:soldering': 'holdTool:iron', 'holdTool:soldering-iron': 'holdTool:iron', 'holdTool:pen': 'holdTool:iron',
  'holdTool:multimeter': 'holdTool:meter', 'holdTool:dmm': 'holdTool:meter', 'holdTool:probes': 'holdTool:probe',
  'holdTool:driver': 'holdTool:screwdriver', 'holdTool:screw': 'holdTool:screwdriver',
  'holdTool:stripper': 'holdTool:pliers', 'holdTool:crimper': 'holdTool:pliers', 'holdTool:wire': 'holdTool:solder',
  'holdTool:tweezer': 'holdTool:tweezers', 'holdTool:nip': 'holdTool:tweezers', 'holdTool:knife': 'holdTool:screwdriver',
};

export function resolvePose(name) {
  if (name && typeof name === 'object') return name;
  if (POSES[name]) return POSES[name];
  if (POSE_ALIAS[name]) return POSES[POSE_ALIAS[name]];
  if (typeof name === 'string' && name.startsWith('holdTool:')) return POSES['holdTool:default'];
  return POSES.idle;
}

// ---------------------------------------------------------------------------- vật liệu
let _mats = null;
function materials() {
  if (_mats) return _mats;
  _mats = {
    skin: new THREE.MeshPhysicalMaterial({
      color: 0xd8a184, roughness: 0.5, metalness: 0,
      sheen: 0.35, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xff9a7a),
      clearcoat: 0.06, clearcoatRoughness: 0.65,
      emissive: new THREE.Color(0x4a160a), emissiveIntensity: 0.1,    // giả tán xạ dưới da: vùng tối hơi hồng
    }),
    skinDark: new THREE.MeshPhysicalMaterial({ color: 0xc58b6d, roughness: 0.6, sheen: 0.3, sheenColor: new THREE.Color(0xff8a6a), emissive: new THREE.Color(0x3a1006), emissiveIntensity: 0.1 }),
    nail: new THREE.MeshPhysicalMaterial({ color: 0xf0cbbf, roughness: 0.22, clearcoat: 0.7, clearcoatRoughness: 0.15 }),
    // áo lab: trắng ngà hơi xám + sheen nhẹ — sát camera dưới đèn bàn, trắng tinh + sheen trắng vượt ngưỡng bloom (1.6) → loá
    sleeve: new THREE.MeshPhysicalMaterial({ color: 0xc9ced4, roughness: 0.96, sheen: 0.25, sheenRoughness: 0.9, sheenColor: new THREE.Color(0xb9c0c8), side: THREE.DoubleSide }),
    cuff: new THREE.MeshPhysicalMaterial({ color: 0xc1c7ce, roughness: 0.94, sheen: 0.2, sheenRoughness: 0.85, sheenColor: new THREE.Color(0xb3bac2) }),
    button: new THREE.MeshStandardMaterial({ color: 0xf6f6f2, roughness: 0.3 }),
    stitch: new THREE.MeshStandardMaterial({ color: 0xc9cfd6, roughness: 1 }),
  };
  return _mats;
}

// ---------------------------------------------------------------------------- dựng hình
function capsuleZ(r, len, cap = 6, radial = 14) {
  const g = new THREE.CapsuleGeometry(r, len, cap, radial);
  g.rotateX(Math.PI / 2);           // trục dọc → trục Z
  return g;
}

function meshNoShadow(geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = false;
  m.receiveShadow = false;
  m.userData.isHand = true;
  return m;
}

/** Lòng bàn tay: hộp bo tròn, thuôn về cổ tay, mu hơi vồng */
function palmGeometry() {
  const w = 80, h = 26, d = 94;
  const g = new THREE.BoxGeometry(w, h, d, 8, 3, 10);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    // bo tròn kiểu "superellipse": kéo các đỉnh ở góc vào trong
    const nx = v.x / (w / 2), ny = v.y / (h / 2), nz = v.z / (d / 2);
    const corner = Math.pow(Math.abs(nx), 6) + Math.pow(Math.abs(ny), 6);
    const k = 1 / Math.pow(Math.max(corner, 1e-6), 1 / 6);
    v.x = nx * Math.min(1, k) * (w / 2);
    v.y = ny * Math.min(1, k) * (h / 2);
    // thuôn về cổ tay (z > 0) và mỏng ở mép ngón út
    const t = (nz + 1) / 2;                       // 0 = đốt ngón, 1 = cổ tay
    v.x *= THREE.MathUtils.lerp(1.0, 0.78, t);
    v.y *= THREE.MathUtils.lerp(1.0, 0.9, t) * (1 - 0.18 * Math.max(0, nx));
    // mu bàn tay vồng, lòng hơi lõm
    v.y += (1 - nx * nx) * (ny > 0 ? 3 : 2.2);
    // bo tròn 2 đầu theo Z
    const endK = Math.pow(Math.abs(nz), 8);
    v.y *= 1 - 0.25 * endK;
    v.x *= 1 - 0.06 * endK;
    v.z = nz * (d / 2);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return smooth(g);
}

/** Gộp đỉnh trùng (BoxGeometry/Cylinder tách đỉnh theo mặt) → pháp tuyến mượt, không lộ đường nối */
function smooth(g) {
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const m = mergeVertices(g, 1e-3);
  m.computeVertexNormals();
  return m;
}

/** Móng tay hơi cong */
function nailGeometry(w, len) {
  const g = new THREE.BoxGeometry(w, 1.4, len, 6, 1, 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const nx = x / (w / 2);
    p.setY(i, p.getY(i) - nx * nx * w * 0.16);
    // đầu móng bo tròn
    const nz = z / (len / 2);
    if (nz < -0.6) p.setX(i, x * (1 - (Math.abs(nz) - 0.6) * 0.6));
  }
  g.computeVertexNormals();
  return g;
}

// thông số ngón: gốc (MCP) trong hệ tay, độ dài và bán kính 3 đốt
const FINGERS = {
  i: { base: [-27, 2, -90], yaw: 0.07, len: [44, 26, 21], r: [9.2, 8.4, 7.5] },
  m: { base: [-8, 3, -94], yaw: 0.0, len: [48, 30, 22], r: [9.6, 8.8, 7.8] },
  r: { base: [11, 2, -90], yaw: -0.07, len: [45, 28, 21], r: [9.0, 8.2, 7.3] },
  p: { base: [28, -1, -79], yaw: -0.16, len: [35, 21, 19], r: [7.8, 7.1, 6.4] },
  t: { base: [-30, -9, -20], yaw: 0.62, len: [40, 32, 27], r: [12.5, 10.2, 9.2] },
};

class Hand {
  constructor(hands, side) {
    this.hands = hands;
    this.side = side;
    this.sign = side === 'left' ? -1 : 1;
    this.poseName = 'idle';
    this.pose = POSES.idle;
    this.held = null;             // Object3D đang cầm
    this.heldItem = null;         // ItemInstance (nếu có)
    this.grip = null;
    this.gestures = [];
    this.reachPoint = null;       // Vector3 thế giới
    this.reachTarget = null;      // cho tư thế reach
    this.holdDistance = 0;        // cuộn chuột: + xa hơn
    this.visible = true;
    this._swap = null;
    // trạng thái hiện tại (nội suy)
    this.cur = { pos: new THREE.Vector3(...this._mirrorPos(POSES.idle.pos)), quat: this._poseQuat(POSES.idle.rot), obj: this._poseQuat(POSES.idle.obj), f: JSON.parse(JSON.stringify(RELAX)) };
    this._reachOff = new THREE.Vector3();
    this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler();
    this._build();
  }

  _mirrorPos(p) { return [p[0] * this.sign, p[1], p[2]]; }
  _poseQuat(r, target = new THREE.Quaternion()) {
    // lật gương qua mặt phẳng YZ: (rx, −ry, −rz)
    this._e = this._e || new THREE.Euler();
    this._e.set(r[0], r[1] * this.sign, r[2] * this.sign, 'YXZ');
    return target.setFromEuler(this._e);
  }

  _build() {
    const M = materials();
    const root = this.hands.root;
    // nhóm cổ tay (đặt theo tư thế)
    this.group = new THREE.Group();
    this.group.name = `hand-${this.side}`;
    this.mirror = new THREE.Group();
    this.mirror.scale.x = this.sign;            // tay trái = tay phải lật gương
    this.group.add(this.mirror);
    root.add(this.group);

    const palm = meshNoShadow(palmGeometry(), M.skin);
    palm.position.set(0, 0, -46);
    this.mirror.add(palm);
    // gò ngón cái (thenar) + gò út (hypothenar) phía lòng bàn tay
    const pad = new THREE.SphereGeometry(1, 18, 12);
    const thenar = meshNoShadow(pad, M.skin); thenar.scale.set(19, 11, 27); thenar.position.set(-21, -8, -30); thenar.rotation.y = 0.35;
    const hypo = meshNoShadow(pad, M.skin); hypo.scale.set(13, 9, 28); hypo.position.set(26, -7, -36);
    this.mirror.add(thenar, hypo);
    // cổ tay
    const wrist = meshNoShadow(capsuleZ(24, 46, 6, 16), M.skin);
    wrist.scale.set(1.28, 0.86, 1); wrist.position.set(0, -1, 18);
    this.mirror.add(wrist);

    // ngón tay: mỗi khớp là Group xoay quanh X (gập) + Y (xoè ở gốc)
    this.joints = {};
    this.tips = {};
    const knuckleGeo = new THREE.SphereGeometry(1, 14, 10);
    for (const [k, F] of Object.entries(FINGERS)) {
      const chain = [];
      let parent = this.mirror;
      for (let s = 0; s < 3; s++) {
        const j = new THREE.Group();
        if (s === 0) {
          j.position.set(...F.base);
          if (k === 't') j.rotation.order = 'YZX'; else j.rotation.order = 'YXZ';
        } else j.position.set(0, 0, -F.len[s - 1]);
        parent.add(j);
        const r = F.r[s], L = F.len[s];
        const seg = meshNoShadow(capsuleZ(r, L, 6, 14), s === 0 && k === 't' ? M.skin : M.skin);
        seg.position.z = -L / 2;
        seg.scale.set(1, k === 't' ? 0.9 : 0.86, 1);
        j.add(seg);
        if (s === 0 && k !== 't') {
          // khớp đốt ngón nhô ở mu bàn tay
          const kn = meshNoShadow(knuckleGeo, M.skin);
          kn.scale.set(r * 0.85, r * 0.7, r * 0.9); kn.position.set(0, r * 0.35, 1);
          j.add(kn);
        }
        if (s === 2) {
          // móng tay
          const nw = r * 1.25, nl = L * 0.62;
          const nail = meshNoShadow(nailGeometry(nw, nl), M.nail);
          nail.position.set(0, r * 0.8, -L * 0.62 - r * 0.15);
          nail.rotation.x = -0.06;
          j.add(nail);
          // điểm đầu ngón (mặt bụng ngón, gần mũi)
          const tip = new THREE.Object3D();
          tip.position.set(0, -r * 0.35, -L - r * 0.55);
          j.add(tip);
          this.tips[k] = tip;
        }
        chain.push(j);
        parent = j;
      }
      this.joints[k] = chain;
    }
    // điểm lòng bàn tay (anchor 'palm')
    this.palmAnchor = new THREE.Object3D();
    this.palmAnchor.position.set(-2, -16, -52);
    this.mirror.add(this.palmAnchor);

    // khung cầm (không nằm trong nhóm lật gương → vật không bị lật)
    this.holder = new THREE.Group();
    this.holder.name = `holder-${this.side}`;
    root.add(this.holder);

    // ống tay áo blouse: hướng về "khuỷu tay" ảo phía dưới-sau
    this.arm = new THREE.Group();
    this.arm.name = `sleeve-${this.side}`;
    root.add(this.arm);
    const sleeveLen = 560;
    const sleeveGeo = new THREE.CylinderGeometry(50, 58, sleeveLen, 28, 6, true);
    sleeveGeo.rotateX(Math.PI / 2);
    sleeveGeo.translate(0, 0, sleeveLen / 2 + 22);
    // nếp vải: làm méo nhẹ bề mặt
    const sp = sleeveGeo.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i);
      const a = Math.atan2(y, x);
      const wob = 1 + Math.sin(a * 5 + z * 0.02) * 0.025 + Math.sin(a * 3 - z * 0.013) * 0.02;
      sp.setXYZ(i, x * wob * 1.08, y * wob * 0.94, z);
    }
    const sleeve = meshNoShadow(smooth(sleeveGeo), M.sleeve);
    this.arm.add(sleeve);
    // măng-sét (cổ tay áo) dày hơn + đường may + cúc
    const cuffGeo = new THREE.CylinderGeometry(52, 52, 34, 28, 1, true);
    cuffGeo.rotateX(Math.PI / 2);
    const cuff = meshNoShadow(cuffGeo, M.cuff);
    cuff.scale.set(1.09, 0.95, 1); cuff.position.z = 38;
    const lip = meshNoShadow(new THREE.TorusGeometry(51, 3.2, 8, 32), M.cuff);
    lip.scale.set(1.09, 0.95, 1); lip.position.z = 21;
    const seam = meshNoShadow(new THREE.TorusGeometry(53.5, 0.8, 4, 32), M.stitch);
    seam.scale.set(1.09, 0.95, 1); seam.position.z = 55;
    const btn = meshNoShadow(new THREE.CylinderGeometry(5.5, 5.5, 2.4, 16), M.button);
    btn.rotation.z = Math.PI / 2; btn.position.set(57 * this.sign, 8, 36);
    this.arm.add(cuff, lip, seam, btn);
    this.elbow = new THREE.Vector3(250 * this.sign, -520, 160);
  }

  setPose(name, opts = {}) {
    this.poseName = typeof name === 'string' ? name : 'custom';
    this.pose = resolvePose(name);
    this.reachTarget = opts.target ? (opts.target.isVector3 ? opts.target.clone() : new THREE.Vector3(...opts.target)) : null;
  }

  /** Vị trí đầu làm việc: mũi dụng cụ đang cầm (def.tool.tip) hoặc đầu ngón trỏ */
  tipWorldPosition(target = new THREE.Vector3()) {
    const tip = this.heldItem?.def?.tool?.tip;
    if (this.held && tip) {
      this.held.updateWorldMatrix(true, false);
      return this.held.localToWorld(target.set(tip[0], tip[1], tip[2]));
    }
    this.tips.i.updateWorldMatrix(true, false);
    return this.tips.i.getWorldPosition(target);
  }

  // ------------------------------------------------------------ cập nhật mỗi khung
  update(dt, common) {
    const P = this.pose;
    const a = 1 - Math.exp(-(P.speed || 12) * dt);
    const cur = this.cur;

    // vị trí/góc cơ sở theo tư thế
    const tp = this._v.set(P.pos[0] * this.sign, P.pos[1], P.pos[2]);
    if (this.reachTarget && this.poseName === 'reach') {
      // với tới vật: hướng tay về phía mục tiêu, tối đa ~560 mm
      const cam = this.hands.camera;
      const local = this._v2.copy(this.reachTarget);
      cam.worldToLocal(local);
      const len = local.length();
      if (len > 1) {
        local.multiplyScalar(Math.min(len - 120, 560) / len);
        local.x = THREE.MathUtils.clamp(local.x, -260, 260);
        local.y = THREE.MathUtils.clamp(local.y, -330, 60);
        local.z = Math.min(local.z, -260);
        tp.lerp(local, 0.7);
      }
    }
    cur.pos.lerp(tp, a);
    cur.quat.slerp(this._poseQuat(P.rot, this._q), a);
    const objQ = this._poseQuat(P.obj || [0, 0, 0], this._qObj || (this._qObj = new THREE.Quaternion()));
    cur.obj.slerp(objQ, a);
    for (const k of ['t', 'i', 'm', 'r', 'p']) {
      const src = P.f[k], dst = cur.f[k];
      for (let s = 0; s < 4; s++) dst[s] += (src[s] - dst[s]) * a;
    }

    // ---- lớp cộng thêm: thở, bước chân, trễ theo chuột, cử chỉ, với-chạm, rụt khi sát tường, khoảng cầm
    const off = this._off || (this._off = new THREE.Vector3());
    off.set(0, 0, 0);
    const t = common.time;
    const ph = this.sign > 0 ? 0 : 1.3;
    off.x += Math.sin(t * 0.9 + ph) * 1.2;
    off.y += Math.sin(t * 1.7 + ph) * 1.6 * common.breath;
    off.x += common.bobX * 0.6; off.y += common.bobY;
    off.x += common.lagX; off.y += common.lagY;
    off.z += common.obstruct; off.y -= common.obstruct * 0.45; off.x += common.obstruct * 0.25 * this.sign;
    off.z -= this.holdDistance;
    // đổi dụng cụ: hạ tay xuống
    if (this._swap) {
      const s = this._swap;
      s.t += dt;
      const half = s.dur / 2;
      const k = s.t < half ? s.t / half : Math.max(0, 1 - (s.t - half) / half);
      const e = k * k * (3 - 2 * k);
      off.y -= 300 * e; off.z += 120 * e; off.x += 60 * e * this.sign;
      if (!s.fired && s.t >= half) { s.fired = true; try { s.fn?.(); } catch (err) { console.error(err); } }
      if (s.t >= s.dur) this._swap = null;
    }
    // cử chỉ
    let twist = 0, squeeze = 0, tap = 0;
    this.gestures = this.gestures.filter((g) => (g.t += dt) < g.dur);
    for (const g of this.gestures) {
      const w = Math.sin(Math.PI * Math.min(1, g.t / g.dur));
      if (g.name === 'push') { off.z -= 70 * w; off.y += 8 * w; }
      else if (g.name === 'tap') { off.z -= 22 * w; off.y -= 10 * w; tap = Math.max(tap, w); }
      else if (g.name === 'twist') twist += Math.sin((g.t / g.dur) * Math.PI * 2) * 0.9 * w;
      else if (g.name === 'squeeze') squeeze = Math.max(squeeze, w);
    }
    // với đầu dụng cụ tới điểm (hàn, đo)
    if (this.reachPoint) {
      const tipNow = this.tipWorldPosition(this._v2);
      const cam = this.hands.camera;
      cam.worldToLocal(tipNow);
      // [UX] sửa lỗi ưu tiên toán tử: trước đây từ khung thứ 2 trở đi KHÔNG copy reachPoint (worldToLocal chồng lên vector cũ)
      const want = cam.worldToLocal((this._tmpW || (this._tmpW = new THREE.Vector3())).copy(this.reachPoint));
      // vị trí đầu dụng cụ nếu không có độ lệch với hiện tại
      const base = tipNow.sub(this._reachOff);
      const d = want.sub(base);
      const lim = this.hands.reachLimit || 300;          // [UX] chế độ tỉ mỉ cho với xa hơn (ux/precision.js)
      if (d.length() > lim) d.setLength(lim);
      this._reachOff.lerp(d, 1 - Math.exp(-9 * dt));
    } else this._reachOff.multiplyScalar(Math.exp(-8 * dt));

    this.group.position.copy(cur.pos).add(off).add(this._reachOff);
    this.group.quaternion.copy(cur.quat);
    if (twist) this.group.quaternion.multiply(this._q.setFromAxisAngle(this._v.set(0, 0, 1), twist * this.sign));
    if (common.lagRoll) this.group.quaternion.premultiply(this._q.setFromAxisAngle(this._v.set(0, 0, 1), common.lagRoll));
    this.group.visible = this.visible;
    this.arm.visible = this.visible;

    // khớp ngón
    for (const [k, chain] of Object.entries(this.joints)) {
      const f = cur.f[k];
      const add = squeeze * 0.28 + (k === 'i' ? tap * 0.35 : 0);
      if (k === 't') {
        chain[0].rotation.set(-(f[1] + add * 0.5), FINGERS.t.yaw + (f[0] - 0.62), 1.0);
      } else {
        chain[0].rotation.set(-(f[1] + add), FINGERS[k].yaw + f[0] * 0.6, 0);
      }
      chain[1].rotation.x = -(f[2] + add);
      chain[2].rotation.x = -(f[3] + add * 0.6);
    }
    this.group.updateMatrixWorld(true);

    // khung cầm: vị trí theo neo (FK), hướng theo tư thế trong không gian camera
    const root = this.hands.root;
    const anchor = this._v;
    if ((P.anchor || 'palm') === 'pinch') {
      const a1 = this.tips.i.getWorldPosition(this._v);
      const a2 = this.tips.t.getWorldPosition(this._v2);
      anchor.copy(a1).add(a2).multiplyScalar(0.5);
    } else this.palmAnchor.getWorldPosition(anchor);
    root.worldToLocal(anchor);
    this.holder.position.copy(anchor);
    this.holder.quaternion.copy(cur.obj);
    // [UX] thao tác tỉ mỉ: dụng cụ cầm thoải hơn (~45° so với mặt bàn) thay vì gần thẳng đứng khi cúi nhìn xuống
    if (this.hands.toolTilt) this.holder.quaternion.premultiply(this._q.setFromAxisAngle(this._v2.set(1, 0, 0), this.hands.toolTilt));
    // … và xoay mũi chéo vào giữa (tay phải → mũi chỉ sang trái) để bàn tay nằm lệch bên, không che điểm hàn
    if (this.hands.toolYaw) this.holder.quaternion.premultiply(this._q.setFromAxisAngle(this._v2.set(0, 1, 0), this.hands.toolYaw * this.sign));
    if (twist) this.holder.quaternion.multiply(this._q.setFromAxisAngle(this._v2.set(0, 0, 1), twist * this.sign * 1.4));
    if (this._palmPush && (P.anchor || 'palm') === 'palm') {
      // vật to: đẩy khung cầm ra khỏi lòng bàn tay theo pháp tuyến lòng tay
      const n = this._v2.set(0, -1, 0).applyQuaternion(this.group.quaternion);
      n.x *= this.sign === 1 ? 1 : 1;
      this.holder.position.addScaledVector(n, this._palmPush);
    }
    // vật đang cầm trôi mượt về vị trí cầm
    if (this.held && this.grip && !this._inspecting) {
      const ga = 1 - Math.exp(-16 * dt);
      this.held.position.lerp(this.grip.pos, ga);
      this.held.quaternion.slerp(this.grip.quat, ga);
    }

    // ống tay áo: đặt ở cổ tay, chĩa về khuỷu tay
    const wristPos = this._v.copy(this.group.position);
    this.arm.position.copy(wristPos);
    // [UX] với xa (thao tác tỉ mỉ, hàn): khuỷu tay đi theo cổ tay → ống tay áo không quét ngang tầm nhìn
    const rk = Math.min(1, this._reachOff.length() / 120);
    const elb = this._v2.copy(this.elbow);
    if (rk > 0) elb.lerp((this._elbDyn || (this._elbDyn = new THREE.Vector3())).set(150 * this.sign, -430, 240).add(wristPos), rk);
    const dir = elb.sub(wristPos).normalize();
    this.arm.quaternion.setFromUnitVectors(Z_AXIS, dir);
    // xoay ống tay theo cổ tay một chút cho cúc áo không đứng yên tuyệt đối
    const e = this._e.setFromQuaternion(cur.quat, 'YXZ');
    this.arm.quaternion.multiply(this._q.setFromAxisAngle(Z_AXIS, e.z * 0.35));
  }
}
const Z_AXIS = new THREE.Vector3(0, 0, 1);

export class Hands {
  constructor(game) {
    this.game = game;
    this.camera = game.camera;
    this.root = new THREE.Group();
    this.root.name = 'viewmodel-hands';
    this.camera.add(this.root);
    this.right = new Hand(this, 'right');
    this.left = new Hand(this, 'left');
    this.time = 0;
    this.obstruct = 0;
    this._obstructTarget = 0;
    this._lag = { x: 0, y: 0, roll: 0 };
    this.reachLimit = 300;           // mm — độ lệch tối đa khi với đầu dụng cụ tới điểm (setReach)
    this.toolTilt = 0;               // rad — [UX] nghiêng khung cầm quanh trục X camera (tỉ mỉ: cầm dụng cụ thoải hơn)
    this.toolYaw = 0;                // rad — [UX] xoay khung cầm quanh trục Y camera (tay phải: mũi chéo sang trái)
    this.inspect = new Inspector(this);
    // đổ bóng: không; nhưng nhận ánh sáng bình thường. Không cho raycast trúng tay.
    this.root.traverse((o) => { o.raycast = () => {}; });
  }

  side(s) { return s === 'left' ? this.left : this.right; }

  setPose(side, pose, opts) { this.side(side).setPose(pose, opts); }

  /**
   * Gắn vật vào tay. grip = { offset:[x,y,z], rot:[rx,ry,rz], pose?, item?, tip? } — xem QUY ƯỚC ở đầu file.
   * Vật được giữ nguyên vị trí thế giới lúc gắn rồi trôi mượt vào tay.
   */
  attach(side, object, grip = {}) {
    const h = this.side(side);
    if (h.held && h.held !== object) this.detach(side);
    h.held = object;
    h.heldItem = grip.item || object.userData?.item || null;
    if (grip.pose) h.setPose(grip.pose);
    else if (!h.poseName || h.poseName === 'idle' || h.poseName === 'reach') h.setPose('grip');
    const { pos, quat, push } = computeGripTransform(object, grip, h.heldItem, h.pose);
    h.grip = { pos, quat };
    h._palmPush = push;
    object.updateWorldMatrix(true, false);
    h.holder.updateWorldMatrix(true, false);
    h.holder.attach(object);
    object.traverse((o) => { if (o.isMesh) { o.userData._castShadowBefore ??= o.castShadow; o.castShadow = false; } });
    return h.grip;
  }

  detach(side) {
    const h = this.side(side);
    const obj = h.held;
    if (!obj) return null;
    if (this.inspect.object === obj) this.inspect.stop(true);
    const scene = this.game.scene;
    obj.updateWorldMatrix(true, false);
    scene.attach(obj);
    obj.traverse((o) => { if (o.isMesh && o.userData._castShadowBefore !== undefined) { o.castShadow = o.userData._castShadowBefore; delete o.userData._castShadowBefore; } });
    h.held = null; h.heldItem = null; h.grip = null; h._palmPush = 0;
    h.holdDistance = 0;
    h.reachPoint = null;
    h.setPose('idle');
    return obj;
  }

  playGesture(name, side = 'right', dur) {
    const D = { tap: 0.22, push: 0.38, twist: 0.5, squeeze: 0.35 };
    this.side(side).gestures.push({ name, t: 0, dur: dur ?? D[name] ?? 0.3 });
  }

  setReach(side, point) { this.side(side).reachPoint = point ? (point.isVector3 ? point : new THREE.Vector3(...point)) : null; }

  /** Hạ tay → fn() ở giữa → đưa tay lên (đổi dụng cụ) */
  swap(side, fn, dur = 0.42) {
    const h = this.side(side);
    if (h._swap && !h._swap.fired) { const prev = h._swap.fn; h._swap.fn = () => { prev?.(); fn?.(); }; return; }
    h._swap = { t: 0, dur, fn, fired: false };
  }

  /** Khoảng cách (mm) tới vật cản phía trước — tay rụt lại khi sát tường để không xuyên */
  setObstruction(dist) {
    this._obstructTarget = dist == null ? 0 : THREE.MathUtils.clamp((620 - dist) * 0.75, 0, 300);
  }

  update(dt) {
    this.time += dt;
    const player = this.game.player;
    this.obstruct += (this._obstructTarget - this.obstruct) * (1 - Math.exp(-10 * dt));
    // trễ theo chuột: tay bị "kéo" ngược hướng quay đầu một chút
    const lv = player?._lookVel || { x: 0, y: 0 };
    const lagK = 1 - Math.exp(-10 * dt);
    this._lag.x += (THREE.MathUtils.clamp(-lv.x * 9, -26, 26) - this._lag.x) * lagK;
    this._lag.y += (THREE.MathUtils.clamp(lv.y * 7, -20, 20) - this._lag.y) * lagK;
    this._lag.roll += (THREE.MathUtils.clamp(lv.x * 0.012, -0.06, 0.06) - this._lag.roll) * lagK;
    const b = player?.bob || { phase: 0, amp: 0 };
    const common = {
      time: this.time,
      breath: 1 - Math.min(1, b.amp) * 0.5,
      bobX: Math.sin(b.phase) * 7 * b.amp,
      bobY: -Math.abs(Math.cos(b.phase)) * 9 * b.amp + 4 * b.amp,
      lagX: this._lag.x, lagY: this._lag.y, lagRoll: this._lag.roll,
      obstruct: this.obstruct,
    };
    this.right.update(dt, common);
    this.left.update(dt, common);
    this.inspect.update(dt);
  }

  serialize() { return { right: this.right.poseName, left: this.left.poseName }; }
}

/** Tính vị trí/góc của vật trong khung cầm (xem QUY ƯỚC đầu file) */
export function computeGripTransform(object, grip = {}, item = null, pose = null) {
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  let push = 0;
  const hasRot = Array.isArray(grip.rot);
  const hasOff = Array.isArray(grip.offset);
  if (hasRot) quat.setFromEuler(new THREE.Euler(grip.rot[0] || 0, grip.rot[1] || 0, grip.rot[2] || 0));
  if (hasOff) { pos.set(grip.offset[0] || 0, grip.offset[1] || 0, grip.offset[2] || 0); return { pos, quat, push }; }
  // hộp bao trong hệ toạ độ của vật
  const box = localBox(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const tip = grip.tip || item?.def?.tool?.tip;
  if (!hasRot && tip) {
    // tự xoay: (tip − tâm) → −Z; cầm cách mũi ~35% chiều dài (kiểu cầm bút)
    const dir = new THREE.Vector3(...tip).sub(center);
    if (dir.lengthSq() > 1e-6) quat.setFromUnitVectors(dir.normalize(), new THREE.Vector3(0, 0, -1));
    const t = new THREE.Vector3(...tip);
    const gripPt = t.clone().lerp(center.clone().multiplyScalar(2).sub(t), 0.35);
    pos.copy(gripPt).applyQuaternion(quat).negate();
    return { pos, quat, push };
  }
  // căn tâm hộp bao vào điểm cầm; vật cầm cả bàn tay thì đẩy ra khỏi lòng bàn tay
  pos.copy(center).applyQuaternion(quat).negate();
  if (pose && (pose.anchor || 'palm') === 'palm') push = Math.min(70, Math.max(size.x, size.z) * 0.5 + 6);
  return { pos, quat, push };
}

export function localBox(object) {
  const prev = { p: object.position.clone(), q: object.quaternion.clone(), s: object.scale.clone(), parent: object.parent };
  if (object.parent) object.parent.remove(object);
  object.position.set(0, 0, 0); object.quaternion.identity(); object.scale.set(1, 1, 1);
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  object.position.copy(prev.p); object.quaternion.copy(prev.q); object.scale.copy(prev.s);
  if (prev.parent) prev.parent.add(object);
  object.updateMatrixWorld(true);
  if (box.isEmpty()) box.set(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 20, 10));
  return box;
}

// ---------------------------------------------------------------------------- soi vật
class Inspector {
  constructor(hands) {
    this.hands = hands;
    this.object = null;
    this.holder = new THREE.Group();
    this.holder.name = 'inspect-holder';
    hands.root.add(this.holder);
    this.k = 0;               // 0 → 1 mức "đưa lên trước mắt"
    this.rot = new THREE.Quaternion();
    this._q = new THREE.Quaternion(); this._v = new THREE.Vector3();
    this.time = 0;
  }

  get active() { return !!this.object; }

  /** Đưa vật đang cầm (tay phải) lên trước mắt */
  start(obj, size = 60) {
    const h = this.hands.right;
    if (!obj || obj !== h.held) return false;
    this.object = obj;
    this.size = size;
    this.dist = THREE.MathUtils.clamp(size * 2.2, 230, 650);
    this.holder.position.set(0, -25, -this.dist);
    this.rot.identity();
    this.holder.quaternion.identity();
    obj.updateWorldMatrix(true, false);
    // giữ hướng hiện tại của vật (trong hệ camera) làm hướng soi ban đầu
    this.holder.updateWorldMatrix(true, false);
    this.holder.attach(obj);
    this._startQuat = obj.quaternion.clone();
    // tâm vật về gốc khung soi
    const box = localBox(obj);
    this._center = box.getCenter(new THREE.Vector3());
    h._inspecting = true;
    this.time = 0;
    const halfW = THREE.MathUtils.clamp(size * 0.55, 40, 170);
    this.hands.right.setPose({ ...POSES.inspect, pos: [halfW + 55, -95 - size * 0.12, -this.dist + 40] });
    if (!this.hands.left.held) this.hands.left.setPose({ ...POSES.inspect, pos: [halfW + 55, -95 - size * 0.12, -this.dist + 40] });
    return true;
  }

  rotate(dx, dy) {
    if (!this.object) return;
    const s = 0.0065;
    const qy = this._q.setFromAxisAngle(this._v.set(0, 1, 0), dx * s);
    this.rot.premultiply(qy);
    const qx = this._q.setFromAxisAngle(this._v.set(1, 0, 0), dy * s);
    this.rot.premultiply(qx);
  }

  stop(silent = false) {
    const obj = this.object;
    if (!obj) return;
    const h = this.hands.right;
    h._inspecting = false;
    this.object = null;
    if (h.held === obj) {
      obj.updateWorldMatrix(true, false);
      h.holder.attach(obj);       // trôi mượt về tay nhờ grip
    }
    if (!silent) {
      const pose = h.heldItem?.def?.grip?.pose || (h.held ? 'grip' : 'idle');
      h.setPose(pose);
    }
    const L = this.hands.left;
    L.setPose(L.heldItem?.def?.grip?.pose || (L.held ? 'grip' : 'idle'));
  }

  update(dt) {
    this.time += dt;
    if (!this.object) return;
    const a = 1 - Math.exp(-12 * dt);
    // vật tới tâm khung soi, xoay theo chuột
    const o = this.object;
    const target = this._v.copy(this._center).applyQuaternion(this._tq || (this._tq = new THREE.Quaternion())).negate();
    this._tq.copy(this.rot).multiply(this._startQuat);
    o.quaternion.slerp(this._tq, a);
    target.copy(this._center).applyQuaternion(o.quaternion).negate();
    o.position.lerp(target, a);
    // lắc rất nhẹ theo nhịp thở
    this.holder.position.y = -25 + Math.sin(this.time * 1.6) * 1.2;
  }
}
