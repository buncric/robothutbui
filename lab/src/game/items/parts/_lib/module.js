// Khung chung cho MODULE (board nhỏ đã hàn sẵn linh kiện). KHÔNG export default.
// Module có hàng chân đực chúc xuống (cắm breadboard/header cái): gốc = đầu chân (y = 0), đáy nhựa header y = 6.0 (mặt tựa),
// board y 8.5…10.1. Module chỉ có pad (XL4015, LM2596…): đáy board y = 0.
import {
  THREE, PM, staticParts, decal, finalizeDef, P, socketSpec, socketsOnce, anchor, fitsKind, PITCH, ud, gBox,
} from '../_shared.js';
import { boardGeo, mountRing, maleHeaderDown, padsTH } from './pcb.js';
import { captureRest, setItemTransform, cadNodes } from './cad.js';

export const HDR = { tipY: 0, seatY: 6.0, boardBottom: 8.5 };

/**
 * cfg: { id, name, lessonId, massG, w, d, t=1.6, mask, holes:[[x,z,r]], headers:[{ pins:[[id, name, x, z, extra?]…] }],
 *        padsOnly, keepHeaders (header là nhóm riêng, vẫn hiện cạnh CAD), fill(B, ctx) — B ở hệ toạ độ MẶT TRÊN board (y = 0), silk(g, W, H, s, X, Z) — vẽ silkscreen,
 *        extra(root, ctx) — phần động, extraDef, insertInto, sockets(inst, ctx), electrical, size, grip }
 * ctx = { top: y mặt trên board trong hệ gốc, game }
 */
export function moduleDef(cfg) {
  const t = cfg.t ?? 1.6;
  const hasHdr = !!cfg.headers?.length && !cfg.padsOnly;
  const bottom = hasHdr ? HDR.boardBottom : (cfg.boardBottom ?? 0);
  const top = bottom + t;
  const pins = [];
  for (const h of cfg.headers || []) for (const [id, name, x, z, extra] of h.pins) pins.push(P(id, name, [x, hasHdr ? 0 : top, z], hasHdr ? [0, -1, 0] : [0, 1, 0], { ...(h.extra || {}), ...(extra || {}) }));
  for (const p of cfg.extraPins || []) pins.push(P(p.id, p.name, p.pos, p.dir || [0, 1, 0], p.extra || {}));
  const ctx0 = { top, bottom, t };
  const def = finalizeDef({
    kind: 'part', category: 'module',
    ...cfg.meta,
    id: cfg.id, name: cfg.name, lessonId: cfg.lessonId, massG: cfg.massG,
    size: cfg.size || [cfg.w, top + (cfg.height ?? 6), cfg.d],
    grip: cfg.grip || { pose: 'grip', offset: [0, top + 2, 0], rot: [0, 0, 0] },
    pins,
    insertInto: cfg.insertInto || (hasHdr ? ['bb-hole', 'pcb-hole', 'header-female'] : []),
    mount: { seatY: hasHdr ? HDR.seatY : 0, pitch: PITCH, boardTop: top, ...(cfg.mount || {}) },
    footprint: hasHdr ? pins.filter((p) => p.pos[1] === 0).map((p) => [p.pos[0], p.pos[2]]) : [],
    electrical: cfg.electrical || null,
    build(game) {
      const root = new THREE.Group();
      root.name = cfg.id;
      const ctx = { ...ctx0, game };
      root.add(staticParts(cfg.id, (B) => {
        B.obj(() => {
          const m = new THREE.Mesh(boardGeo(cfg.w, cfg.d, t, { r: cfg.r ?? 0.8, holes: (cfg.holes || []).map(([x, z, r]) => [x, z, r]), cut: cfg.boardShape }), [cfg.mask || PM.maskBlue, PM.fr4]);
          m.position.y = bottom; m.castShadow = true; m.receiveShadow = true; m.name = 'pcb';
          return m;
        });
        for (const [x, z, r] of cfg.holes || []) mountRing(B.group({ y: bottom }), x, z, t, r, r + 1.2);
        if (hasHdr && !cfg.keepHeaders) {
          for (const h of cfg.headers) maleHeaderDown(B, h.pins.map((p) => [p[2], p[3]]), bottom, t, { solder: true });
        } else if (cfg.thPads) {
          padsTH(B.group({ y: bottom }), cfg.thPads, t, { ring: 1.4, hole: 0.65 });
        }
        cfg.fill?.(B.group({ y: top }), ctx);
        if (cfg.silk) B.obj(() => decal(`silk:${cfg.id}`, cfg.w, cfg.d, (g, W, H, s) => cfg.silk(g, W, H, s, (x) => (x + cfg.w / 2) * s, (z) => (z + cfg.d / 2) * s), { y: top + 0.012, pxPerMm: cfg.silkPx ?? 16, rough: 0.55 }));
      }));
      // keepHeaders: header đực là nhóm riêng VẪN HIỆN khi có mô hình CAD (CAD chỉ có pad răng cưa, vd. XIAO)
      if (hasHdr && cfg.keepHeaders) {
        const hg = staticParts(`${cfg.id}:hdr`, (B) => { for (const h of cfg.headers) maleHeaderDown(B, h.pins.map((p) => [p[2], p[3]]), bottom, t, { solder: true }); });
        hg.userData.keepWithCad = true;
        root.add(hg);
      }
      cfg.extra?.(root, ctx);
      return root;
    },
    ...(cfg.sockets ? { sockets: (inst, game) => socketsOnce(inst, () => cfg.sockets(inst, { ...ctx0, game })) } : {}),
    ...cfg.extraDef,
  });
  return def;
}

/**
 * Khe 'screw-terminal' tại lối luồn dây (local [x,y,z], hướng ra theo trục).
 * opts.rotX: góc X của mốc (mặc định π/2 → +Y mốc = +Z item; −π/2 → lối luồn dây quay ra −Z) · opts.clamped: () → bool
 * (netlist: dây chỉ thông khi vít siết) · opts.screwIndex: chỉ số chân của cực này trong def.pins (netlist dùng pinsOf(Y)[index]).
 */
export function terminalSocket(inst, id, pos, rotY, { screwIndex = 0, rotX = Math.PI / 2, clamped } = {}) {
  const a = anchor(inst.object, `st:${id}`, pos, rotY, rotX);
  return socketSpec(inst, {
    id, kind: 'screw-terminal', anchor: a, index: screwIndex, tolerance: { pos: 1.5, angleDeg: 20 },
    ...(clamped ? { clamped } : {}),
    accepts(item) {
      if (this.occupiedBy) return { ok: false, reason: 'Đã có dây' };
      return fitsKind(item, 'screw-terminal') ? { ok: true, orientation: 'ok' } : { ok: false, reason: 'Chỉ luồn đầu dây tuốt' };
    },
  });
}

/** Pad hàn dây (IN+/OUT+…) — khe 'wire-pad' để hàn đầu dây */
export function wirePadSocket(inst, id, pos) {
  const a = anchor(inst.object, `wp:${id}`, pos);
  return socketSpec(inst, {
    id, kind: 'wire-pad', anchor: a, pad: id, tolerance: { pos: 2.0, angleDeg: 45 },
    accepts(item) { return fitsKind(item, 'wire-pad') ? { ok: true, orientation: 'ok' } : { ok: false, reason: 'Hàn đầu dây vào pad này' }; },
  });
}

/** LED SMD động (đổi độ sáng): trả mesh có material riêng */
export function dynLed(root, x, y, z, color, { w = 1.6, d = 0.8, h = 0.5 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.3, emissive: color, emissiveIntensity: 0 });
  const led = new THREE.Mesh(gBox(w, h, d), m);
  led.position.set(x, y + h / 2, z);
  root.add(led);
  return led;
}
export { ud };

// ----------------------------------------------------------------------------- mô hình CAD (GLB boards/*)
/**
 * cadOptions chuẩn cho module có hàng chân đực chúc xuống: GLB boards/* có gốc = mặt dưới PCB, chân tới y = −8.5
 * → đặt đáy PCB ở HDR.boardBottom (đầu chân y = 0). extra: rotateY, onLoad, hide, keep…
 */
export function headerCad(extra = {}) {
  return { onBottom: false, offset: [0, HDR.boardBottom, 0], ...extra };
}

/**
 * LED trên mô hình CAD: mesh đầu tiên trong node `name` (vd. 'led_pwr') nhận material riêng có emissive để def.update()
 * đổi độ sáng qua `mesh.material` (subparts 'led' có thể nhân bản lại material — update đọc mesh.material mỗi khung nên vẫn đúng).
 * Trả mesh hoặc null (không có node).
 */
export function cadLed(glb, name, color = 0xff2a1a) {
  const node = glb.getObjectByName(name) || cadNodes(glb, name)[0];
  if (!node) return null;
  let mesh = null;
  node.traverse((o) => { if (!mesh && o.isMesh) mesh = o; });
  if (!mesh) return null;
  const src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const m = src?.clone?.() || new THREE.MeshStandardMaterial({ color: 0xf2f2f2 });
  if ('emissive' in m) { m.emissive = new THREE.Color(color); m.emissiveIntensity = 0; }
  mesh.material = m;
  return mesh;
}

/**
 * Dịch một object theo trục Y của item thêm dy (mm, cộng dồn) — nút bấm lún xuống / nhả lên. Hoạt động cả với mesh thủ tục
 * (đơn vị mm) lẫn node GLB (cha có tỉ lệ ×1000 → dịch trong hệ item bằng setItemTransform).
 */
export function nudgeY(root, obj, dy) {
  if (!obj) return;
  if (!obj.userData.cadNode) { obj.position.y += dy; return; }
  captureRest(obj, root);
  obj.userData.nudge = (obj.userData.nudge || 0) + dy;
  setItemTransform(obj, root, new THREE.Matrix4().makeTranslation(0, obj.userData.nudge, 0));
}

/** Đánh dấu node GLB để nudgeY biết dùng hệ item (gọi trong onLoad) */
export function markCadNode(node) { if (node) node.userData.cadNode = true; return node; }
