// Công tắc hành trình (micro switch) Omron SS-5GL có cần gạt: thân PBT đen 19.8 × 11.2 × 6.55 mm, nút (plunger) đỏ, cần thép 17 mm,
// 3 cọc hàn (COM / NO / NC — thứ tự theo mô hình CAD robot/microswitch-ss5: COM ở đầu bản lề, NO giữa, NC đầu kia), 2 lỗ bắt vít
// Ø2.35 cách 9.5 mm. Dùng cho bumper & công tắc nhấc bánh.
// def.press(inst) / def.release(inst): cần gạt hạ xuống (tiếng "tách"), COM–NO đóng. Gốc: mũi cọc (y = 0).
// CAD: robot/microswitch-ss5 (chọn thay cho vendor/adafruit_817_micro_switch_zippy — Zippy là công tắc cỡ lớn 27.8 × 10.3 × 18.9 mm
// chỉ có 2 chân, không có cần gạt; SS-5GL đúng kích thước & 3 cọc SPDT + cần gạt của item này).
import { THREE, PM, gBox, gCyl, staticParts, finalizeDef, P, ud, colorMat, decal, text } from './_shared.js';
import { useManifestInteract, subpartOf } from './_lib/cad.js';

const LT = 3.6, BL = 19.8, BH = 11.2, BT = 6.55;
const Y0 = LT;   // đáy thân
const TER = [['COM', -8.1], ['NC', 8.0], ['NO', 0.7]];     // x mũi cọc theo CAD (term_com / term_nc / term_no)
const pins = TER.map(([n, x]) => P(n, n, [x, 0, 0], [0, -1, 0]));
const HX = -8.6, HY = Y0 + 10.6;                          // trục bản lề cần (lever_pin CAD)
const PLX = 1.0;                                          // plunger

const def = finalizeDef({
  id: 'microswitch', name: 'Công tắc hành trình có cần (SS-5)', kind: 'part', category: 'switch', lessonId: 'cong-tac-hanh-trinh', massG: 2.5,
  size: [BL, LT + 14.67, BT],
  grip: { pose: 'pinch', offset: [0, LT + BH, 0], rot: [0, 0, 0] },
  pins,
  insertInto: ['pcb-hole', 'robot-slot:bumper', 'robot-slot:lift'],
  mount: { seatY: LT, holes: [[-4.75, 0], [4.75, 0]], screw: 'M2' },
  electrical: { type: 'switch-spdt', contacts: { released: [['COM', 'NC']], pressed: [['COM', 'NO']] }, opForceN: 0.5, travelMm: 1.2, bounceMs: 3 },
  // Mô hình CAD thật: khung GLB đã đúng hướng (cọc chúc −Y, mũi cọc y = −3.6) → chỉ dời lên 3.6 mm.
  cad: 'robot/microswitch-ss5',
  cadPinNode: (p) => ({ COM: 'term_com', NC: 'term_nc', NO: 'term_no' })[p.id],
  cadOptions: {
    onBottom: false, offset: [0, LT, 0],
    onLoad(glb) {
      // Bản ghi manifest/extras của lever & plunger ghi theo khung CAD Z-up (trục [0,−1,0], origin [−8.6, 0, 10.6]) → đặt lại theo hệ item
      useManifestInteract(glb, {
        lever: { type: 'hinge', label: 'cần gạt', axis: [0, 0, 1], pivot: [HX, HY, 0], angle_deg: -11 },
        plunger: { type: 'button', label: 'nút tác động', axis: [0, -1, 0], travel_mm: 0.6 },
      });
    },
  },
  build() {
    const root = new THREE.Group();
    root.add(staticParts('microswitch', (B) => {
      B.add(gBox(BL, BH, BT, 0.4, 1), PM.pbtBlack, { y: Y0 + BH / 2 });
      for (const x of [-4.75, 4.75]) for (const s of [-1, 1]) B.add(gCyl(1.175, 1.175, 0.1, 14), PM.hole, { x, y: Y0 + 2.9, z: s * (BT / 2 + 0.01), rx: Math.PI / 2 }, { shadow: false });
      for (const [, x] of TER) {
        B.add(gBox(3.2, LT + 1.2, 0.5), PM.brass, { x, y: (LT + 1.2) / 2 });
        B.add(gCyl(0.6, 0.6, 0.6, 10), PM.hole, { x, y: 1.6, rx: Math.PI / 2 }, { shadow: false });
      }
      B.add(gBox(2.1, 1.1, 2.1), colorMat(0xc22a2a, { rough: 0.45 }), { x: PLX, y: Y0 + BH + 0.2 });   // nút đỏ
      B.add(gBox(2.4, 1.6, 4.4), PM.steel, { x: HX, y: HY + 0.4 });                                       // bản lề cần
      B.obj(() => decal('ss5', 12, 4.5, (g, W, H) => { text(g, 'SS-5GL  5A 125VAC', W / 2, H * 0.35, H * 0.26, { color: '#c9cbce', weight: '600' }); text(g, 'C    NO    NC', W / 2, H * 0.75, H * 0.26, { color: '#c9cbce' }); }, { y: Y0 + 8.4, z: BT / 2 + 0.01, rx: 0, pxPerMm: 30 }));
    }));
    const lever = new THREE.Group();
    lever.position.set(HX, HY + 1.0, 0);
    const arm = new THREE.Mesh(gBox(17.3, 0.4, 3.6), PM.steelBrushed);
    arm.position.x = 8.65; arm.castShadow = true;
    lever.add(arm);
    root.add(lever);
    ud(root, 'lever', lever);
    setLever(lever, false);
    return root;
  },
  init(inst) { setLever(inst.object.userData.lever, !!inst.state?.pressed); },
  press(inst) { (inst.state ||= {}).pressed = true; setLever(inst.object.userData.lever, true); return { ok: true, closed: ['COM', 'NO'], sound: 'click' }; },
  release(inst) { (inst.state ||= {}).pressed = false; setLever(inst.object.userData.lever, false); return { ok: true, closed: ['COM', 'NC'], sound: 'click' }; },
  /** Đồng bộ cần gạt CAD (bộ phận con 'lever', bấm E để gạt) ↔ state.pressed; plunger lún theo cần */
  update(inst) {
    const lever = subpartOf(inst, 'lever');
    if (!lever) return;
    const st = (inst.state ||= {});
    if (inst._leverOpen === undefined) { lever.state.open = !!st.pressed; inst._leverOpen = lever.state.open; }
    else if (lever.state.open !== inst._leverOpen) { inst._leverOpen = lever.state.open; st.pressed = lever.state.open; setLever(inst.object.userData.lever, st.pressed); }
    else if (!!st.pressed !== lever.state.open) { lever.state.open = !!st.pressed; inst._leverOpen = lever.state.open; }
    const pl = subpartOf(inst, 'plunger');
    if (pl && pl.anim.pressT === undefined) {
      const k = lever.anim.k;
      if (Math.abs((pl.anim.press || 0) - k) > 1e-4) { pl.anim.press = k; pl.apply(); }
    }
  },
});
function setLever(l, p) { if (l) l.rotation.z = p ? 0.0 : 0.19; }
export default def;
