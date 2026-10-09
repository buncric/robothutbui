// =============================================================================
// sandbox-world.js — Nối "sandbox kéo-thả" (core/editor.js) với thế giới 2D của mô phỏng robot.
//
// Mỗi mục trong catalog khai báo `meta` (tọa độ CỤC BỘ của đồ vật, mm, gốc ở tâm đáy vật,
// trục lx = trục x cục bộ, ly = −z cục bộ, nghĩa là "hướng bắc" khi rotY = 0):
//   solids : [{ box: [lx0, ly0, lx1, ly1], z: [zBot, zTop] } | { circle: [lx, ly, r], z: [...] }]  vật cản tĩnh
//   movable: { circle: r | box: [w, d], h, mass, mu, roll?, fragile?, shatter? }                        cả món đồ là vật nhẹ bị đẩy được
//   zone   : { rect: [lx0, ly0, lx1, ly1], h (so với đáy vật), rho, speed, slip, encSlip, kind, name }  vùng sàn (thảm, nẹp, hố)
//   hazard : { kind: 'cable'|'sock', pts: [[lx, ly], …], r }                                       dây/tất quấn chổi
//   dock   : { front: 355 }                                                                         đế sạc → vị trí xuất phát
// Độ cao z cộng thêm độ cao đặt vật (đặt cốc lên bàn ăn → cốc ở 750 mm, robot dưới gầm không chạm).
//
// Quy đổi: sandbox dùng tọa độ thế giới three.js (X, Y, Z) với nhóm gốc không dịch chuyển;
// 2D mô phỏng: x = X + OX, y = OY − Z.  (OX, OY) = độ dời giữa hai hệ.
// Logic thuần — không import three.js.
// =============================================================================

/** Phép biến đổi cục bộ → 2D của một món đồ */
export function itemFrame(it, OX, OY) {
  const o = it.object;
  const X = o.position.x + OX, Y = OY - o.position.z, base = o.position.y, r = o.rotation.y;
  const c = Math.cos(r), s = Math.sin(r);
  const tf = (lx, ly) => [X + lx * c - ly * s, Y + lx * s + ly * c];
  const aabb = (lx0, ly0, lx1, ly1) => {
    const p = [tf(lx0, ly0), tf(lx1, ly0), tf(lx1, ly1), tf(lx0, ly1)];
    return [Math.min(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1])), Math.max(...p.map((q) => q[0])), Math.max(...p.map((q) => q[1]))];
  };
  return { X, Y, base, r, tf, aabb };
}

/**
 * Dựng lại vật cản / vùng sàn / mối nguy từ danh sách đồ vật của sandbox.
 * @param world   World2D (mảng obstacles/floors/hazards sẽ được thay mới)
 * @param fixed   { obstacles, floors } — phần cố định (tường, sàn phòng, ban công…)
 * @param items   sb.items
 * @param prev    Map uid → obstacle cũ (giữ trạng thái vật đang bị đẩy/đang rơi)
 * @param opts    { OX, OY, override(it, meta) → meta }  (vd giường chỉnh gầm)
 * @returns { movables: Map uid→obstacle, dock: {x,y,th}|null, pits: [[x0,y0,x1,y1]] }
 */
export function rebuildWorld(world, fixed, items, prev, { OX, OY, override } = {}) {
  world.obstacles = fixed.obstacles.slice();
  world.floors = fixed.floors.slice();
  world.hazards = [];
  const movables = new Map();
  const pits = [];
  let dock = null;
  for (const it of items) {
    let m = it.def.meta || {};
    if (override) m = override(it, m) || m;
    const F = itemFrame(it, OX, OY);
    const name = it.def.name;
    for (const s of m.solids || []) {
      const [zb, zt] = s.z || [0, 1000];
      if (s.box) {
        const [x0, y0, x1, y1] = F.aabb(...s.box);
        world.addBox(x0, y0, x1, y1, { zBot: F.base + zb, zTop: F.base + zt, name: s.name || name, item: it });
      } else if (s.circle) {
        const [cx, cy] = F.tf(s.circle[0], s.circle[1]);
        world.addCircle(cx, cy, s.circle[2], { zBot: F.base + zb, zTop: F.base + zt, name: s.name || name, item: it });
      }
    }
    if (m.movable) {
      const mv = m.movable, ud = it.object.userData;
      const old = prev?.get(it.uid);
      // người dùng vừa kéo/đặt lại món này? (vị trí khác chỗ mô phỏng đặt lần cuối) → vị trí "nhà" mới
      const userMoved = !ud.simPos || Math.hypot(ud.simPos[0] - it.object.position.x, ud.simPos[1] - it.object.position.y, ud.simPos[2] - it.object.position.z) > 0.5;
      if (userMoved || !ud.home) ud.home = { x: it.object.position.x, y: it.object.position.y, z: it.object.position.z, rotY: it.object.rotation.y };
      const common = { zBot: F.base, zTop: F.base + mv.h, name, movable: true, mass: mv.mass, mu: mv.mu ?? 0.4, roll: mv.roll || 0, fragile: !!mv.fragile, shatter: !!mv.shatter, item: it };
      let ob;
      if (mv.circle) ob = world.addCircle(F.X, F.Y, mv.circle, common);
      else { const [w, d] = mv.box; const [x0, y0, x1, y1] = F.aabb(-w / 2, -d / 2, w / 2, d / 2); ob = world.addBox(x0, y0, x1, y1, common); }
      if (old && !userMoved) {
        for (const k of ['falling', 'fallen', 'broken', 'vx', 'vy', 'pushedLogged', 'tilt']) ob[k] = old[k];
        if (old.falling) { ob.zBot = old.zBot; ob.zTop = old.zTop; }
      }
      movables.set(it.uid, ob);
    }
    if (m.zone) {
      const z = m.zone;
      const [x0, y0, x1, y1] = F.aabb(...z.rect);
      world.addFloor(x0, y0, x1, y1, { ...z, h: F.base + (z.h ?? 0), item: it });
      if (z.kind === 'pit') pits.push([x0, y0, x1, y1]);
    }
    if (m.hazard) {
      const h = m.hazard;
      const hz = world.addHazard(h.kind, h.pts.map(([a, b]) => F.tf(a, b)), h.r ?? 6, { name, item: it });
      if (it.object.userData.removed) { hz.active = false; hz.removed = true; }
    }
    if (m.dock && !dock) {
      const [x, y] = F.tf(m.dock.front ?? 355, 0);
      dock = { x, y, th: F.r };
    }
  }
  return { movables, dock, pits };
}

/** Đồng bộ vị trí 3D của vật bị robot đẩy/đang rơi về đồ vật sandbox */
export function syncMovables(movables, world, OX, OY) {
  for (const ob of movables.values()) {
    const o = ob.item.object;
    const [cx, cy] = world.center(ob);
    o.position.set(cx - OX, ob.zBot, OY - cy);
    if (ob.falling) { o.rotation.x = ob.falling.rot * 0.8; o.rotation.z = ob.falling.rot * 0.5; }
    else if (ob.fallen && ob.tilt) { o.rotation.x = Math.PI / 2; }
    if (ob.roll > 0 && (ob.vx || ob.vy)) o.rotation.z -= ob.vx * 0.0003;
    o.visible = !(ob.broken && ob.shatter);      // cốc sứ vỡ → ẩn (môi trường vẽ mảnh vỡ)
    o.userData.simPos = [o.position.x, o.position.y, o.position.z];
  }
}

/** Đưa mọi vật nhẹ về chỗ người dùng đã đặt (trước khi robot đẩy) */
export function restoreMovables(items) {
  for (const it of items) {
    const ud = it.object.userData;
    if (ud.removed) { ud.removed = false; it.object.visible = true; }
    if (!it.def.meta?.movable || !ud.home) continue;
    it.object.position.set(ud.home.x, ud.home.y, ud.home.z);
    it.object.rotation.set(0, ud.home.rotY, 0);
    it.object.visible = true;
    ud.simPos = null;
  }
}
