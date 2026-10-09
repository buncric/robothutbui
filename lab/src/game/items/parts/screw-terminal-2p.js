// Cầu đấu vít (domino PCB) KF301-2P bước 5.08 mm: thân nhựa PA66 xanh 10.16 × 10 × 7.6 mm, 2 vít M3 đầu dẹt,
// 2 lồng kẹp dây thép mạ niken (lỗ 3.5 × 3.2 mm, dây 26–12 AWG), chân Ø1.0 dài 3.5 mm.
// Khe 'screw-terminal' × 2 (dây/chân linh kiện luồn vào lỗ, vặn vít bằng tua vít): def.driveScrew(inst, i, vòng).
// Gốc: mũi chân (y = 0); mặt tựa y = 3.5.
import { THREE, PM, gBox, gCyl, staticParts, finalizeDef, P, socketSpec, socketsOnce, anchor, fitsKind, colorMat, ud, mesh } from './_shared.js';
import { isMetal, cropMesh } from './_lib/cad.js';

// Kích thước theo CAD thật vendor/terminalblock_phoenix_mkds_1_5_2_5_08_1x02_p5_08mm_horizontal (Phoenix MKDS 1,5/2-5,08 ≡ KF301-2P):
// thân 10.9 × 13.8 (trên PCB) × 9.8, vít đầu Ø3.7 lõm trong giếng, đỉnh vít y = 13.6 trên PCB, tâm vít z = +0.2, lỗ luồn dây ở mặt +Z.
const PCH = 5.08, LEG = 3.5, H = 13.8, Dd = 9.8, Wd = 10.9;
const SCREW_Y = LEG + 13.6 - 0.45, SCREW_Z = 0.2, SCREW_R = 1.85;
const pins = [P('1', '1', [-PCH / 2, 0, 0]), P('2', '2', [PCH / 2, 0, 0])];
const blue = colorMat(0x1f5fbf, { rough: 0.5 });

const def = finalizeDef({
  id: 'screw-terminal-2p', name: 'Cầu đấu vít 2P (5.08 mm)', kind: 'part', category: 'connector', lessonId: 'driver-drv8871', massG: 2.2,
  size: [Wd, LEG + H, Dd], grip: { pose: 'pinch', offset: [0, LEG + H, 0], rot: [0, 0, 0] },
  pins,
  insertInto: ['pcb-hole'],
  mount: { seatY: LEG, pitch: PCH, note: 'Bước 5.08 = 2 lỗ perfboard' },
  footprint: pins.map((p) => [p.pos[0], p.pos[2]]),
  provides: ['screw-terminal'],
  electrical: { type: 'terminal', ratingA: 15, internal: [['1', 'w1'], ['2', 'w2']] },
  // CAD: chân 1 ở x −2.17, z +0.3 (tâm hộp bao lệch) → dời (−0.37, LEG, −0.3) cho chân ở ±2.54, z = 0. Vít CAD gộp chung khối kim
  // loại (không xoay riêng được) → cắt bỏ đầu vít CAD (y > 11.2 trên PCB), giữ 2 vít thủ tục động ('st-screw-*', driveScrew()) đặt
  // đúng chỗ vít CAD. Giữ màu xanh dương của item (mẫu KiCad tô xanh lá).
  cad: 'vendor/terminalblock_phoenix_mkds_1_5_2_5_08_1x02_p5_08mm_horizontal',
  cadOptions: {
    onBottom: false, offset: [-0.37, LEG, -0.3], keep: ['st-screw-*'],
    onLoad(glb, root) {
      glb.traverse((m) => {
        if (!m.isMesh) return;
        if (isMetal(m)) cropMesh(m, root, (x, y) => y < LEG + 11.2, 'mkds2');
        else m.material = blue;
      });
    },
  },
  build() {
    const root = new THREE.Group();
    root.add(staticParts('kf301-2p', (B) => {
      B.add(gBox(Wd, H * 0.55, Dd, 0.3, 1), blue, { y: LEG + H * 0.275 });
      for (const p of pins) {
        const x = p.pos[0];
        B.add(gBox(PCH - 0.5, H * 0.45, Dd - 1.6, 0.3, 1), blue, { x, y: LEG + H * 0.55 + H * 0.225, z: -0.8 });   // tháp vít
        B.add(gCyl(1.8, 1.8, 2.2, 16, true), blue, { x, y: LEG + H - 1.1, z: -0.8 });
        B.add(gBox(3.6, 3.3, 0.3), PM.hole, { x, y: LEG + 2.7, z: Dd / 2 + 0.02 }, { shadow: false });          // lỗ luồn dây
        B.add(gBox(3.3, 0.3, 3.4), PM.nickel, { x, y: LEG + 1.1, z: Dd / 2 - 1.8 }, { shadow: false });         // lồng kẹp
        B.add(gBox(3.3, 0.3, 3.4), PM.nickel, { x, y: LEG + 4.3, z: Dd / 2 - 1.8 }, { shadow: false });
        B.add(gCyl(0.5, 0.5, LEG + 1, 10), PM.lead, { x, y: (LEG + 1) / 2 });
      }
    }));
    const screws = pins.map((p) => {
      const s = new THREE.Group();
      s.name = `st-screw-${p.id}`;
      s.position.set(p.pos[0], SCREW_Y, SCREW_Z);
      s.add(mesh(gCyl(SCREW_R, SCREW_R, 0.9, 20), PM.nickel));
      s.add(mesh(gBox(SCREW_R * 1.8, 0.45, 0.5), PM.hole, { y: 0.3 }, { shadow: false }));
      root.add(s);
      return s;
    });
    ud(root, 'screws', screws);
    return root;
  },
  init(inst) { (inst.state?.screws || []).forEach((t, i) => setScrew(inst, i, t)); },
  /** Vặn vít i (0/1) thêm `turns` vòng (dương = siết). Trả { ok, turns, clamped } — siết > 0.25 vòng là kẹp chặt dây */
  driveScrew(inst, i = 0, turns = 0.25) {
    const st = inst.state || (inst.state = {});
    st.screws ||= [0, 0];
    st.screws[i] = Math.max(-3, Math.min(0.6, (st.screws[i] || 0) + turns));
    setScrew(inst, i, st.screws[i]);
    return { ok: true, turns: st.screws[i], clamped: st.screws[i] > 0.25, stripped: st.screws[i] >= 0.6 && turns > 0 };
  },
  sockets(inst) {
    return socketsOnce(inst, () => pins.map((p, i) => {
      const a = anchor(inst.object, `st:${p.id}`, [p.pos[0], LEG + 4.5, Dd / 2], 0, Math.PI / 2);   // lỗ luồn dây mặt +Z (CAD)
      return socketSpec(inst, {
        id: `w${p.id}`, kind: 'screw-terminal', anchor: a, index: i, tolerance: { pos: 1.5, angleDeg: 20 },
        accepts(item) {
          if (this.occupiedBy) return { ok: false, reason: 'Lỗ đã có dây' };
          if (!fitsKind(item, 'screw-terminal')) return { ok: false, reason: 'Chỉ luồn đầu dây tuốt / chân linh kiện' };
          const t = inst.state?.screws?.[i] ?? 0;
          if (t > 0.25) return { ok: false, reason: 'Vít đang siết — nới vít trước' };
          return { ok: true, orientation: 'ok' };
        },
        clamped: () => (inst.state?.screws?.[i] ?? 0) > 0.25,
      });
    }));
  },
});
function setScrew(inst, i, t) { const s = inst.object.userData.screws?.[i]; if (s) { s.rotation.y = -t * Math.PI * 2; s.position.y = SCREW_Y - t * 0.5; } }
export default def;
