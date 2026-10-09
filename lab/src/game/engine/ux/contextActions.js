// =============================================================================
// ux/contextActions.js — Hành động ngữ cảnh bổ sung cho đồ đạc phòng lab (đăng ký với game.interact, không sửa world):
//   • Thùng rác (anchor 'trash-bin'): cầm vật + [E] "Bỏ vào thùng rác" (xoá vật) · tay không → hiện mờ kèm lý do
//   • Hộp nhựa trên kệ (InstancedMesh 'shelf-bins'): [E] "Lấy 1 <linh kiện>" (mỗi hộp một loại linh kiện nhỏ)
//   • Bảng trắng (anchor 'whiteboard'): [E] Xem gần · Poster sơ đồ chân ('poster-pinout'): [E] Đọc
//   • Laptop (anchor 'laptop'): [E] Mở laptop → ux/laptop.js
//   Vật không có mesh riêng (đã gộp tĩnh) → hộp tàng hình (material.visible = false) để tia nhìn trúng.
// =============================================================================
import * as THREE from 'three';

const invisible = new THREE.MeshBasicMaterial({ visible: false });
const SMALL_PART = /resistor|cap-|led-|1n\d|crystal|header|diode|transistor|bss|button|switch|jumper/;

export class ContextActions {
  constructor(game, ux) {
    this.game = game;
    this.ux = ux;
    this.registered = [];
  }

  init() {
    const world = this.game.world || {};
    const A = world.anchors || {};
    const it = this.game.interact;
    if (!it?.register || !world.root) return;
    const reg = (obj, spec) => { it.register(obj, spec); this.registered.push(obj); };

    // ---- thùng rác
    if (A['trash-bin']) {
      const p = A['trash-bin'].getWorldPosition(new THREE.Vector3());
      const proxy = new THREE.Mesh(new THREE.CylinderGeometry(150, 140, p.y, 20), invisible);
      proxy.name = 'ux-trash-proxy';
      proxy.position.set(p.x, p.y / 2, p.z);
      proxy.userData.uxProxy = true;
      world.root.add(proxy);
      proxy.updateMatrixWorld(true);
      reg(proxy, {
        name: 'Thùng rác đạp chân', icon: '🗑️', highlight: false, hintDisabled: false,
        prompts: [{
          key: 'E', label: () => { const h = it.heldItem; return h ? `Bỏ ${h.def.name || 'vật'} vào thùng rác` : 'Bỏ vào thùng rác'; },
          enabled: () => !!it.heldItem, reason: 'Cầm vật cần vứt trên tay trước',
          do: () => this.dispose(it.heldItem),
        }],
      });
    }

    // ---- hộp linh kiện trên kệ
    const bins = findByName(world.root, 'shelf-bins');
    if (bins?.isInstancedMesh) {
      const pool = (this.game.items?.defs?.() || []).filter((d) => d.kind !== 'tool' && !d.hidden && !d.generated && SMALL_PART.test(String(d.id))).map((d) => d.id);
      this.binPool = pool;
      const partOf = (i) => (pool.length ? pool[(i * 7 + 3) % pool.length] : null);
      bins.userData.uxPartOf = partOf;
      reg(bins, {
        name: (ctx) => { const id = partOf(ctx?.hit?.instanceId ?? 0); const d = id && this.game.items.get(id); return `Hộp linh kiện${d ? ` · ${d.name || id}` : ''}`; },
        icon: '📦', highlight: false, big: true,
        hintAnchors: () => (bins.userData.bins || []).map((b) => new THREE.Vector3(b.pos[0], b.pos[1] + b.size[1] / 2 + 30, b.pos[2])),
        prompts: [{
          key: 'E', label: (ctx) => { const id = partOf(ctx?.hit?.instanceId ?? 0); const d = id && this.game.items.get(id); return `Lấy 1 ${d?.name || 'linh kiện'}`; },
          when: () => pool.length > 0,
          enabled: () => !it.heldItem, reason: 'Tay đang cầm vật — đặt xuống trước',
          do: (ctx) => this.takeFromBin(partOf(ctx?.hit?.instanceId ?? 0), ctx?.point),
        }],
      });
    }

    // ---- bảng trắng / poster / laptop: gộp thêm hành động vào bản đăng ký sẵn có
    const focusable = [['whiteboard', 'Xem gần', 1500, 50, 'Bảng trắng'], ['poster-pinout', 'Đọc poster', 820, 45, 'Poster sơ đồ chân']];
    for (const [k, label, dist, fov, name] of focusable) {
      const o = A[k];
      if (!o) continue;
      reg(o, { uxKind: 'whiteboard', icon: '📖', prompts: [{ key: 'E', label, do: () => this.ux.focus.enter(o, { dist, fov, name }) }] });
    }
    if (A.laptop) reg(A.laptop, { uxKind: 'laptop', icon: '💻', prompts: [{ key: 'E', label: 'Mở laptop (tài liệu)', do: () => this.ux.laptop.open() }] });
  }

  dispose(item) {
    const game = this.game;
    if (!item) return false;
    if (game.interact.inspecting) game.interact.stopInspect();
    game.hands?.detach(item.heldBy || 'right');
    item.heldBy = null;
    game.items.remove(item);
    game.audio?.play?.('place', { vol: 0.5 });
    game.events?.emit('item:disposed', { item });
    game.hud?.toast?.(`Đã vứt ${item.def.name || 'vật'} vào thùng rác`, { kind: 'info', short: true });
    return true;
  }

  takeFromBin(id, point) {
    const game = this.game;
    if (!id || game.interact.heldItem) return null;
    const p = point ? point.clone().add(new THREE.Vector3(0, 30, 0)) : game.camera.getWorldPosition(new THREE.Vector3());
    const inst = game.items.spawn(id, { pos: p.toArray() });
    if (!inst) return null;
    game.interact.pick(inst);
    game.events?.emit('bin:take', { item: inst });
    return inst;
  }
}

function findByName(root, name) { let r = null; root.traverse((o) => { if (!r && o.name === name) r = o; }); return r; }
