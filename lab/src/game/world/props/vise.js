// Kẹp mạch in (PCB holder) + 2 tay "helping hands" cổ ngỗng có kẹp cá sấu.
// Đế gang nặng, 2 trụ đỡ có ổ xoay, đầu kẹp gồm 2 thanh ray Ø10 + vít me + 2 hàm trượt có rãnh chữ V lót cao su,
// núm vặn vít me bên phải. Socket kind 'vise' giữ một tấm bo nằm ngang (hàm tự khép theo bề rộng bo).
// E = lật bo 180° (hàn mặt dưới) — bo đang kẹp lật theo.
// [2026-10] build(game, { slide: [dx, dz], slideLabel }) → R = đẩy cả kẹp (kèm bo) trượt trên thảm silicone tới vị trí dưới
// kính hiển vi soi nổi và kéo về (labState.vise.slid; sự kiện 'vise:slid' { slid }).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeObject } from '../_merge.js';
import { labState, emit, play, toast, itemOf } from '../_labState.js';

const BOARD_Y = 78;            // độ cao mặt phẳng kẹp (tâm rãnh V)
const OPEN_HALF = 120;         // nửa khoảng mở tối đa (bo rộng tới 240 mm)
const std = (color, metalness, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
const M = (g, m, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, cast = true } = {}) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = cast; o.receiveShadow = true; return o; };
const rbox = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01));

function knurlKnob(r, h, mat) {
  const seg = 72, flutes = 24, rows = [[0, 0, 0], [r * 0.92, 0, 0], [r, h * 0.12, 1], [r, h * 0.88, 1], [r * 0.92, h, 0], [0, h, 0]];
  const pos = [], idx = [];
  rows.forEach(([rr, y, w], i) => {
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2, f = Math.abs(Math.cos((a * flutes) / 2)) ** 3;
      const R = rr * (1 - 0.08 * w * f);
      pos.push(Math.sin(a) * R, y, Math.cos(a) * R);
      if (i < rows.length - 1 && j < seg) { const k = i * (seg + 1) + j, b = k + seg + 1; idx.push(k, b, k + 1, b, b + 1, k + 1); }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

export function build(game, opts = {}) {
  const lab = labState(game);
  const K = {
    cast: std(0x3b4048, 0.6, 0.5), steel: std(0xc9ced4, 1, 0.25), chrome: std(0xe2e6ea, 1, 0.12), black: std(0x17191c, 0, 0.5),
    rubber: std(0x1f2124, 0, 0.9), red: std(0xc23b2f, 0, 0.6), anod: std(0x2f63b8, 0.85, 0.32),
  };
  const root = new THREE.Group();
  root.name = 'pcb-vise';
  // đế + trụ
  root.add(M(rbox(320, 20, 120, 8), K.cast, { y: 10 }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) root.add(M(new THREE.CylinderGeometry(8, 8, 3, 16), K.rubber, { x: sx * 140, y: -0.5, z: sz * 45 }));
  for (const sx of [-1, 1]) {
    root.add(M(rbox(18, BOARD_Y - 4, 36, 4), K.cast, { x: sx * 150, y: 20 + (BOARD_Y - 24) / 2 }));
    root.add(M(new THREE.CylinderGeometry(15, 15, 22, 28), K.cast, { x: sx * 150, y: BOARD_Y, rz: Math.PI / 2 }));
    root.add(knurlKnob(10, 12, K.black).translateX(sx * 163).translateY(BOARD_Y - 30).rotateZ(-sx * Math.PI / 2));   // núm khoá góc
  }
  // đầu kẹp (xoay quanh trục X ở độ cao BOARD_Y)
  const head = new THREE.Group();
  head.position.set(0, BOARD_Y, 0);
  root.add(head);
  // [2026-10] 2 ray + vít me + núm KHÔNG lật theo đầu kẹp (nhóm 'rails' đứng yên): lật bo 180° chỉ quay 2 hàm + bo.
  // Trước đây cả ray lẫn vít me (dưới mặt bo 18 mm) lật lên NẰM NGANG TRÊN mặt hàn → che ngang ảnh kính hiển vi.
  const rails = new THREE.Group();
  rails.name = 'vise-rails';
  rails.position.set(0, BOARD_Y, 0);
  root.add(rails);
  for (const z of [-22, 22]) rails.add(M(new THREE.CylinderGeometry(5, 5, 284, 20), K.chrome, { y: -18, z, rz: Math.PI / 2 }));
  rails.add(M(new THREE.CylinderGeometry(4, 4, 284, 16), K.steel, { y: -18, rz: Math.PI / 2 }));       // vít me
  for (const sx of [-1, 1]) head.add(M(rbox(14, 52, 70, 4), K.anod, { x: sx * 135, y: -8 }));
  const knob = knurlKnob(16, 18, K.black);
  knob.rotation.order = 'ZYX';      // quay quanh trục riêng của núm (sau khi nằm ngang)
  knob.rotation.z = -Math.PI / 2;
  knob.position.set(142, -18, 0);
  rails.add(knob);
  // 2 hàm trượt (động)
  const jaws = [-1, 1].map((sx) => {
    const j = new THREE.Group();
    j.add(M(rbox(26, 44, 66, 4), K.anod, { x: sx * 13, y: -14 }));
    // rãnh chữ V lót cao su hướng vào trong
    j.add(M(rbox(6, 4, 60, 1.2), K.rubber, { x: -sx * 1.5, y: 3.2, rz: sx * 0.55 }));
    j.add(M(rbox(6, 4, 60, 1.2), K.rubber, { x: -sx * 1.5, y: -3.2, rz: -sx * 0.55 }));
    j.add(M(new THREE.CylinderGeometry(3, 3, 8, 12), K.chrome, { x: sx * 13, y: 9, rz: Math.PI / 2 }));    // vít hãm
    mergeObject(j);
    j.userData.dynamic = true;
    j.position.x = sx * OPEN_HALF;
    head.add(j);
    return j;
  });
  const socketObj = new THREE.Object3D();
  socketObj.position.set(0, -0.8, 0);
  head.add(socketObj);
  // 2 tay cổ ngỗng + kẹp cá sấu (một InstancedMesh cho các đốt)
  const arms = [
    [new THREE.Vector3(-110, 20, -40), new THREE.Vector3(-130, 140, -60), new THREE.Vector3(-70, 190, 0), new THREE.Vector3(-30, 130, 40)],
    [new THREE.Vector3(110, 20, -40), new THREE.Vector3(140, 160, -40), new THREE.Vector3(80, 200, 20), new THREE.Vector3(40, 140, 45)],
  ];
  const segGeo = new THREE.SphereGeometry(4.2, 10, 8);
  const N = 34;
  const segs = new THREE.InstancedMesh(segGeo, K.chrome, N * arms.length);
  const m4 = new THREE.Matrix4();
  arms.forEach((pts, a) => {
    const c = new THREE.CatmullRomCurve3(pts);
    for (let i = 0; i < N; i++) { const p = c.getPoint(i / (N - 1)); m4.makeTranslation(p.x, p.y, p.z); segs.setMatrixAt(a * N + i, m4); }
    root.add(M(new THREE.CylinderGeometry(10, 12, 10, 20), K.cast, { x: pts[0].x, y: 22, z: pts[0].z }));
    const end = pts[pts.length - 1], tan = c.getTangent(1);
    const clip = new THREE.Group();
    clip.position.copy(end);
    clip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
    clip.add(M(rbox(7, 7, 14, 2), K.steel, { z: 6 }));
    for (const s of [1, -1]) clip.add(M(rbox(6, 1.6, 26, 0.6), K.steel, { y: s * 2.4, z: 24, rx: s * -0.12 }));
    clip.add(M(rbox(8, 9, 10, 3), K.red, { z: 12 }));
    root.add(clip);
  });
  segs.castShadow = true; segs.receiveShadow = true;
  segs.instanceMatrix.needsUpdate = true;
  root.add(segs);
  head.userData.dynamic = true;
  knob.userData.dynamic = true;
  mergeObject(root);
  head.userData.dynamic = false;
  mergeObject(head);
  head.userData.dynamic = true;

  // ------------------------------------------------------------ trạng thái
  const st = lab.vise;
  let half = OPEN_HALF, halfTarget = OPEN_HALF, flip = 0, flipTarget = 0, held = null;
  const socket = {
    id: 'vise', name: 'Kẹp mạch in', snapRadius: 140, owner: null, object3D: socketObj, kind: 'vise',
    accepts(item) {
      const d = item?.def || {};
      const id = String(d.id || '').toLowerCase(), cat = String(d.category || '').toLowerCase();
      const boardish = /board|pcb|perf|proto|mach/.test(id) || ['pcb', 'board', 'module'].includes(cat) || (Array.isArray(d.size) && d.size[1] <= 3.2);
      if (!boardish) return { ok: false, reason: 'Kẹp mạch chỉ giữ tấm bo (PCB / bo đục lỗ)' };
      const w = Array.isArray(d.size) ? d.size[0] : 100;
      if (w > OPEN_HALF * 2) return { ok: false, reason: `Bo rộng ${w} mm — kẹp chỉ mở tối đa ${OPEN_HALF * 2} mm` };
      return { ok: true, orientation: 'ok' };
    },
    pose: new THREE.Matrix4(),          // tương đối object3D (engine/sockets.js): object3D = gốc item khi cắm
    tolerance: { pos: 60, angleDeg: 30 },
    onInsert(item) {
      held = item;
      const w = Array.isArray(item?.def?.size) ? item.def.size[0] : 100;
      halfTarget = Math.min(OPEN_HALF, w / 2 + 0.5);
      st.occupied = true;
      play(game, 'snap', { vol: 0.6 });
      emit(game, 'vise:clamped', { item, width: w });
    },
    onRemove(item) { held = null; halfTarget = OPEN_HALF; st.occupied = false; emit(game, 'vise:released', { item }); },
    occupiedBy: null,
  };
  // trượt kẹp (dưới kính hiển vi)
  const slide = Array.isArray(opts.slide) ? opts.slide : null;
  let base0 = null, slideK = 0;
  st.slid = false;
  const toggleSlide = () => {
    if (!slide) return;
    st.slid = !st.slid;
    play(game, 'whoosh', { vol: 0.25 });
    emit(game, 'vise:slid', { slid: st.slid, item: held });
  };
  const interact = [{
    object: root,
    spec: {
      name: () => `Kẹp mạch in${held ? ` · đang giữ ${held.def?.name || 'bo'}` : ''}${st.flipped ? ' (đã lật)' : ''}${st.slid ? ' · dưới kính hiển vi' : ''}`, highlight: true,
      prompts: [
        { key: 'E', label: 'Lật bo 180°', do: () => { flipTarget += Math.PI; st.flipped = !st.flipped; play(game, 'click'); emit(game, 'vise:flipped', { flipped: st.flipped, item: held }); } },
        ...(slide ? [{ key: 'R', label: () => (st.slid ? 'Kéo kẹp ra khỏi kính hiển vi' : (opts.slideLabel || 'Đẩy kẹp vào dưới kính hiển vi')), do: toggleSlide }] : []),
      ],
    },
  }];
  const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4();
  function followHeld() {
    const item = held || socket.occupiedBy;
    const obj = item?.object;
    if (!obj || item.heldBy) return;
    socketObj.updateWorldMatrix(true, false);
    _m.copy(socketObj.matrixWorld);
    if (obj.parent) { obj.parent.updateWorldMatrix(true, false); _m.premultiply(_inv.copy(obj.parent.matrixWorld).invert()); }
    _m.decompose(obj.position, obj.quaternion, obj.scale);
  }
  function update(dt = 1 / 60) {
    if (socket.occupiedBy && socket.occupiedBy !== held) socket.onInsert(socket.occupiedBy);
    const pHalf = half;
    half += (halfTarget - half) * Math.min(1, dt * 6);
    jaws[0].position.x = -half; jaws[1].position.x = half;
    knob.rotation.y += (half - pHalf) * 0.5;
    const pFlip = flip;
    flip += (flipTarget - flip) * Math.min(1, dt * 5);
    head.rotation.x = flip;
    let moved = Math.abs(flip - pFlip) > 1e-4;
    if (slide) {
      if (!base0) base0 = root.position.clone();
      const pk = slideK;
      slideK += ((st.slid ? 1 : 0) - slideK) * Math.min(1, dt * 4);
      if (Math.abs(slideK - pk) > 1e-5) {
        const t = slideK * slideK * (3 - 2 * slideK);
        const c = Math.cos(root.rotation.y), sn = Math.sin(root.rotation.y);
        root.position.set(base0.x + slide[0] * t, base0.y, base0.z + slide[1] * t);
        void c; void sn;
        root.updateMatrixWorld(true);
        moved = true;
      }
    }
    if (moved) followHeld();
  }
  return { object: root, interact, sockets: [socket], update, anchors: { vise: socketObj }, size: [340, 210, 130] };
}

export default { id: 'vise', name: 'Kẹp mạch in', build };
