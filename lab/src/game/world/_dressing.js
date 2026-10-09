// =============================================================================
// _dressing.js — BÀY BIỆN cho phòng lab (gọi từ labRoom.build): những thứ làm phòng trông như một phòng lab điện tử thật.
//   • góc an toàn: bồn rửa tay inox + xà phòng + giấy lau ("rửa tay sau khi hàn — thiếc có chì"), hộp sơ cứu, gel bỏng,
//     chai rửa mắt, găng tay, bình CO2 cho khu điện · biển báo tiếng Việt (chống tĩnh điện, kính bảo hộ, không ăn uống…)
//   • bảng ghim bần với bản in datasheet / sơ đồ chân / bảng chọn mũi hàn / nhiệt độ hàn / IPC-A-610
//   • thùng rác điện tử + hộp pin cũ, tủ dụng cụ có bánh xe, cây xanh, thảm cao su chống tĩnh điện trải sàn trước bàn
//   • quản lý dây: máng cáp dưới bàn, ống xoắn bó dây, dây thả từ máng trần xuống bàn đảo
//   • đèn treo LED trên bàn, ánh sáng cửa sổ (RectAreaLight), bóng che khuất "nướng sẵn" (AO decal) chân tường/góc trần/gầm đồ
//   • vách xốp thấp khu thử robot
// Đồ CAD (cad/src/lab/*.py) đi qua ctx.decor (gộp theo vùng); hình thủ tục chỉ dùng cho mặt phẳng, chữ, dây, AO.
// =============================================================================
import * as THREE from 'three';
import { canvasPlane, drawTexture, text, roundRect, wrapText, floorMatSet, corkSet, texturedMaterial, MONO } from './_tex.js';
import { CAD_ANCHORS } from './_cadAnchors.js';
import { TIP_CODES, TIP_INFO } from './props/tip-rack.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------- biển báo
function drawWarnSign({ title, sub, kind = 'warn', icon = '!' }) {
  return (g, W, H) => {
    const bg = kind === 'warn' ? '#f2c200' : kind === 'ban' ? '#ffffff' : kind === 'info' ? '#1f7a3f' : kind === 'fire' ? '#c8231c' : '#1b3a8a';
    const fg = kind === 'warn' || kind === 'ban' ? '#16181c' : '#ffffff';
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.strokeStyle = fg; g.lineWidth = H * 0.025; g.strokeRect(H * 0.03, H * 0.03, W - H * 0.06, H * 0.94);
    const cx = W * 0.2, cy = H * 0.48, r = Math.min(W * 0.15, H * 0.34);
    if (kind === 'warn') {
      g.fillStyle = '#16181c'; g.beginPath(); g.moveTo(cx, cy - r); g.lineTo(cx + r * 1.05, cy + r * 0.8); g.lineTo(cx - r * 1.05, cy + r * 0.8); g.closePath(); g.fill();
      g.fillStyle = '#f2c200'; g.beginPath(); g.moveTo(cx, cy - r * 0.72); g.lineTo(cx + r * 0.8, cy + r * 0.66); g.lineTo(cx - r * 0.8, cy + r * 0.66); g.closePath(); g.fill();
      text(g, icon, cx, cy + r * 0.18, { size: r * 0.95, color: '#16181c', align: 'center', bold: true });
    } else if (kind === 'ban') {
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      text(g, icon, cx, cy + r * 0.05, { size: r * 1.05, color: '#16181c', align: 'center' });
      g.strokeStyle = '#d0202a'; g.lineWidth = r * 0.18; g.beginPath(); g.arc(cx, cy, r * 0.9, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(cx - r * 0.64, cy - r * 0.64); g.lineTo(cx + r * 0.64, cy + r * 0.64); g.stroke();
    } else {
      g.fillStyle = fg; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      text(g, icon, cx, cy + r * 0.05, { size: r * 1.1, color: bg, align: 'center', bold: true });
    }
    const tx = W * 0.4, tw = W * 0.56;
    g.font = `bold ${Math.round(H * 0.17)}px system-ui, sans-serif`;
    const lines = wrapText(g, title, tw).slice(0, 3);
    lines.forEach((l, i) => text(g, l, tx, H * (0.3 + i * 0.19 - (lines.length - 1) * 0.08), { size: H * 0.16, color: fg, bold: true, maxW: tw }));
    if (sub) text(g, sub, tx, H * 0.84, { size: H * 0.085, color: fg, maxW: tw });
  };
}

// ---------------------------------------------------------------------------- bản in trên bảng ghim
const SHEETS = [
  ['PIC16F877A — ĐẶC TÍNH DC', (g, W, H) => {
    text(g, 'Microchip PIC16F87XA · DS39582', W * 0.06, H * 0.12, { size: H * 0.03, color: '#555' });
    const rows = [['VDD', '4.0', '5.5', 'V'], ['IDD (20 MHz)', '—', '15', 'mA'], ['VIL (TTL)', 'VSS', '0.8', 'V'], ['VIH (TTL)', '2.0', 'VDD', 'V'], ['IOL @ 0.6 V', '—', '8.5', 'mA'], ['IOH @ VDD−0.7', '—', '−3', 'mA'], ['Tổng dòng PORT', '—', '200', 'mA'], ['MCLR VIHH', '12', '14', 'V']];
    rows.forEach((r, i) => { const y = H * (0.2 + i * 0.075); g.strokeStyle = '#ccc'; g.strokeRect(W * 0.06, y - H * 0.035, W * 0.88, H * 0.07); r.forEach((c, k) => text(g, c, W * (0.08 + [0, 0.42, 0.6, 0.78][k]), y, { size: H * 0.032, color: '#222', bold: k === 0 })); });
    for (let i = 0; i < 9; i++) { g.fillStyle = '#d8d8d8'; g.fillRect(W * 0.06, H * (0.82 + i * 0.016), W * (0.5 + ((i * 37) % 40) / 100), H * 0.006); }
  }],
  ['BẢNG CHỌN MŨI HÀN T18', (g, W, H) => {
    TIP_CODES.forEach((c, i) => {
      const y = H * (0.18 + i * 0.075);
      g.fillStyle = '#8e9296'; g.fillRect(W * 0.06, y - H * 0.012, W * 0.16, H * 0.024);
      g.fillStyle = '#c9ccd0'; g.beginPath(); g.moveTo(W * 0.22, y - H * 0.012); g.lineTo(W * 0.3, y - (c[0] === 'D' ? H * 0.008 : 0)); g.lineTo(W * 0.3, y + (c[0] === 'D' ? H * 0.008 : 1)); g.lineTo(W * 0.22, y + H * 0.012); g.fill();
      text(g, c, W * 0.34, y, { size: H * 0.034, color: '#111', bold: true });
      text(g, TIP_INFO[c], W * 0.45, y, { size: H * 0.024, color: '#333', maxW: W * 0.52 });
    });
  }],
  ['NHIỆT ĐỘ HÀN KHUYẾN NGHỊ', (g, W, H) => {
    const rows = [['Sn63Pb37 (có chì)', '320–350 °C'], ['Sn60Pb40', '330–360 °C'], ['SAC305 (không chì)', '350–380 °C'], ['Linh kiện SMD nhỏ', '300–330 °C'], ['Mặt đồng lớn / XT60', '380–420 °C'], ['Tháo hàn (bấc)', '350–380 °C']];
    rows.forEach((r, i) => { const y = H * (0.22 + i * 0.1); text(g, r[0], W * 0.08, y, { size: H * 0.036, color: '#222' }); text(g, r[1], W * 0.92, y, { size: H * 0.04, color: '#c0392b', align: 'right', bold: true }); });
    text(g, 'Lau mũi bằng bọt biển ẩm / bùi nhùi đồng · tráng thiếc trước khi cất', W / 2, H * 0.9, { size: H * 0.024, color: '#555', align: 'center', maxW: W * 0.9 });
  }],
  ['LM2596 — MẠCH ỨNG DỤNG', (g, W, H) => {
    g.strokeStyle = '#222'; g.lineWidth = Math.max(1, W * 0.006);
    g.strokeRect(W * 0.36, H * 0.3, W * 0.28, H * 0.22); text(g, 'LM2596', W * 0.5, H * 0.41, { size: H * 0.035, color: '#222', align: 'center', bold: true });
    const L = (a, b, c, d) => { g.beginPath(); g.moveTo(W * a, H * b); g.lineTo(W * c, H * d); g.stroke(); };
    L(0.08, 0.36, 0.36, 0.36); L(0.64, 0.36, 0.92, 0.36); L(0.75, 0.36, 0.75, 0.6); L(0.5, 0.52, 0.5, 0.7); L(0.08, 0.7, 0.92, 0.7);
    for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(W * (0.69 + i * 0.03), H * 0.36, W * 0.015, Math.PI, 0); g.stroke(); }
    text(g, 'VIN 7–40 V', W * 0.08, H * 0.32, { size: H * 0.026, color: '#222' }); text(g, 'VOUT 5 V / 3 A', W * 0.92, H * 0.32, { size: H * 0.026, color: '#222', align: 'right' });
    text(g, 'L = 33 µH · D = SS34 · Cin 470 µF · Cout 220 µF', W / 2, H * 0.82, { size: H * 0.026, color: '#444', align: 'center', maxW: W * 0.9 });
  }],
  ['IPC-A-610 · MỐI HÀN', (g, W, H) => {
    const shapes = [['ĐẠT', '#2a9d5c', 0.6], ['NGUỘI', '#999', 0.9], ['THỪA', '#c97a1a', 1.4], ['CẦU THIẾC', '#c0392b', 1]];
    shapes.forEach(([t, c, k], i) => {
      const x = W * (0.15 + (i % 2) * 0.45), y = H * (0.32 + Math.floor(i / 2) * 0.32);
      g.fillStyle = '#c47a30'; g.fillRect(x - W * 0.1, y + H * 0.06, W * 0.2, H * 0.015);
      g.fillStyle = '#c9ccd0'; g.beginPath(); g.moveTo(x - W * 0.09, y + H * 0.06); g.quadraticCurveTo(x, y - H * 0.08 * k, x + W * 0.09, y + H * 0.06); g.fill();
      g.fillStyle = '#777'; g.fillRect(x - W * 0.006, y - H * 0.12, W * 0.012, H * 0.2);
      text(g, t, x, y + H * 0.12, { size: H * 0.032, color: c, align: 'center', bold: true });
    });
  }],
  ['DRV8871 — CẦU H 3.6 A', (g, W, H) => {
    g.fillStyle = '#222'; roundRect(g, W * 0.3, H * 0.25, W * 0.4, H * 0.32, W * 0.02); g.fill();
    ['GND', 'IN2', 'IN1', 'ILIM'].forEach((p, i) => { const y = H * (0.3 + i * 0.07); g.fillStyle = '#bbb'; g.fillRect(W * 0.22, y - 2, W * 0.08, 4); text(g, p, W * 0.2, y, { size: H * 0.026, color: '#222', align: 'right' }); });
    ['VM', 'OUT1', 'PGND', 'OUT2'].forEach((p, i) => { const y = H * (0.3 + i * 0.07); g.fillStyle = '#bbb'; g.fillRect(W * 0.7, y - 2, W * 0.08, 4); text(g, p, W * 0.8, y, { size: H * 0.026, color: '#222' }); });
    text(g, 'VM 6.5–45 V · ILIM = 64 kV / RILIM', W / 2, H * 0.68, { size: H * 0.027, color: '#444', align: 'center', maxW: W * 0.9 });
  }],
  ['LỊCH DÙNG PHÒNG LAB', (g, W, H) => {
    const d = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    d.forEach((t, i) => text(g, t, W * (0.2 + i * 0.13), H * 0.18, { size: H * 0.032, color: '#222', align: 'center', bold: true }));
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
      g.strokeStyle = '#bbb'; g.strokeRect(W * (0.135 + c * 0.13), H * (0.22 + r * 0.1), W * 0.13, H * 0.1);
      if ((r * 7 + c * 3) % 4 === 0) { g.fillStyle = ['#bfe3c9', '#f7d9a8', '#cfe0f7'][(r + c) % 3]; g.fillRect(W * (0.14 + c * 0.13), H * (0.225 + r * 0.1), W * 0.12, H * 0.09); }
    }
    ['7:30', '9:30', '13:30', '15:30', '17:30', '19:00'].forEach((t, r) => text(g, t, W * 0.12, H * (0.27 + r * 0.1), { size: H * 0.024, color: '#555', align: 'right' }));
  }],
];
function drawSheet(title, body, accent) {
  return (g, W, H) => {
    g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, W, H);
    g.fillStyle = accent; g.fillRect(0, 0, W, H * 0.08);
    text(g, title, W / 2, H * 0.045, { size: H * 0.036, color: '#fff', align: 'center', bold: true, maxW: W * 0.94 });
    body(g, W, H);
  };
}

// ---------------------------------------------------------------------------- AO decal
function aoTextures() {
  const blob = drawTexture(128, 128, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    g.filter = 'blur(14px)';
    g.fillStyle = 'rgba(0,0,0,1)';
    g.fillRect(W * 0.2, H * 0.2, W * 0.6, H * 0.6);
    g.filter = 'none';
  });
  const lin = drawTexture(8, 128, (g, W, H) => {
    const gr = g.createLinearGradient(0, H, 0, 0);          // v = 0 (đáy canvas) đậm → v = 1 nhạt
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.25, 'rgba(0,0,0,.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,.15)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  });
  return { blob, lin };
}

export function buildSetDressing(ctx) {
  const { game, root, add, B, BN, M, q, mk, rbox, tube, std, anchor, surface, colliders, lights, anchors, interact, decor, cadOK, box3, ROOM, BENCH_H, BENCHES, RACK_A, RACK_B, COUNTER, TEST, DOOR } = ctx;
  const { X0, X1, Z0, Z1, H: RH } = ROOM;
  const sign = (name, opt, w, h, x, y, z, ry = 0) => {
    const p = canvasPlane(w, h, drawWarnSign(opt), { pxPerMm: Math.min(1.6, 640 / w), fallback: '#f2c200', rough: 0.5 });
    p.position.set(x, y, z); p.rotation.y = ry; p.castShadow = false; p.name = `sign:${name}`;
    root.add(p);
    add(new THREE.BoxGeometry(w + 8, h + 8, 3), M.white, { x: x - Math.sin(ry) * 2, y, z: z - Math.cos(ry) * 2, ry }, false);
    return p;
  };
  // ------------------------------------------------------------------ biển báo
  sign('esd', { title: 'KHU VỰC CHỐNG TĨNH ĐIỆN', sub: 'Đeo vòng tay nối đất trước khi chạm mạch · IC trong túi chống tĩnh điện', kind: 'warn', icon: '⚡' }, 520, 240, -4480, 2180, Z0 + 4);
  sign('goggles', { title: 'ĐEO KÍNH BẢO HỘ KHI HÀN', sub: 'Thiếc & nhựa thông có thể bắn · bật máy hút khói', kind: 'safety', icon: '👓' }, 480, 220, -1700, 2180, Z0 + 4);
  sign('no-food', { title: 'KHÔNG ĂN UỐNG TRONG PHÒNG LAB', sub: 'Thiếc hàn có chì (Pb) · hoá chất', kind: 'ban', icon: '🍴' }, 460, 220, X1 - 4, 1650, 3420, -Math.PI / 2);
  sign('hot', { title: 'MŨI HÀN 450 °C', sub: 'Luôn cắm mỏ hàn vào giá · tắt trạm khi rời bàn', kind: 'warn', icon: '🔥' }, 300, 150, -3820, 1000, Z0 + 4);
  sign('co2', { title: 'BÌNH CO2 — CHỮA CHÁY ĐIỆN', sub: 'Ngắt điện trước · không dùng nước', kind: 'fire', icon: '🧯' }, 360, 180, X0 + 4, 1450, -3720, Math.PI / 2);
  // ------------------------------------------------------------------ bảng ghim bần + bản in tài liệu
  {
    const bx = 760, by = 1480, bw = 1150, bh = 760, bz = Z1 - 14;
    const cork = mk(new THREE.PlaneGeometry(bw, bh), texturedMaterial(corkSet(game), { color: 0xb98d5c, roughness: 0.95 }, { repeat: [bw / 600, bh / 600], normalScale: 0.6 }), { x: bx, y: by, z: bz, ry: Math.PI, cast: false });
    cork.name = 'notice-board';
    root.add(cork);
    for (const [x, y, w, h] of [[bx, by + bh / 2 + 12, bw + 50, 26], [bx, by - bh / 2 - 12, bw + 50, 26], [bx - bw / 2 - 12, by, 26, bh], [bx + bw / 2 + 12, by, 26, bh]]) add(new THREE.BoxGeometry(w, h, 22), M.alu, { x, y, z: Z1 - 11 });
    anchors['notice-board'] = cork;
    const accents = ['#1b3a8a', '#7a1d8a', '#c0392b', '#1b6e3a', '#2a9d5c', '#1d4f91', '#555b66'];
    const pins = [];
    SHEETS.forEach(([title, body], i) => {
      const col = i % 4, row = Math.floor(i / 4);
      const w = 210, h = 297;
      const x = bx + bw / 2 - 150 - col * 260 + ((i * 37) % 30 - 15), y = by + 180 - row * 360 + ((i * 53) % 24 - 12);
      const sh = canvasPlane(w, h, drawSheet(title, body, accents[i % accents.length]), { pxPerMm: 1.4, maxPx: 420, fallback: '#fbfaf6', rough: 0.85 });
      sh.position.set(x, y, Z1 - 15 - i * 0.05); sh.rotation.set(0, Math.PI, ((i * 29) % 7 - 3) * 0.012); sh.castShadow = false;
      sh.name = `printout:${title}`;
      root.add(sh);
      pins.push([x - w * 0.38, y + h * 0.44], [x + w * 0.38, y + h * 0.44]);
    });
    const pinMats = [std(0xd0202a, 0, 0.3), std(0x2b5fae, 0, 0.3), std(0xe8c020, 0, 0.3), std(0x2f8a4a, 0, 0.3)];
    pins.forEach(([x, y], i) => BN.add(new THREE.SphereGeometry(6, 10, 8), pinMats[i % 4], { x, y, z: Z1 - 22 }, { castShadow: false }));
    interact.push({ object: cork, spec: { name: 'Bảng ghim — datasheet, bảng chọn mũi hàn, nhiệt độ hàn, IPC-A-610', highlight: false, lessonId: 'pic16f877a', prompts: [] } });
  }
  // ------------------------------------------------------------------ nửa dưới bảng treo: cuộn cáp USB / que đo / dây nối treo móc
  {
    const cx = -2900, z = Z0 + 40;
    const coils = [[-650, 1240, 0x1d1f23, 75], [-480, 1240, 0x2b5fae, 60], [480, 1250, 0xd0202a, 70], [630, 1250, 0x1d1f23, 70], [250, 1230, 0xe8e8e8, 55]];
    for (const [dx, y, c2, R] of coils) {
      const m = std(c2, 0, 0.55);
      for (let k = 0; k < 3; k++) BN.add(new THREE.TorusGeometry(R - k * 4, 3, 6, 28), m, { x: cx + dx + k * 3, y: y - k * 3, z: z + 6 + k * 3, rz: k * 0.2 }, { castShadow: false });
      add(new THREE.CylinderGeometry(2.5, 2.5, 60, 6), M.chrome, { x: cx + dx, y: y + R - 6, z: z - 10, rx: Math.PI / 2 - 0.25 }, false);
    }
    // cặp que đo đỏ/đen treo (đầu chuối + que nhọn)
    for (const [dx, c2] of [[60, 0xd0202a], [90, 0x1d1f23]]) {
      const m = std(c2, 0, 0.5);
      add(tube([[cx + dx, 1330, z + 8], [cx + dx + 10, 1180, z + 14], [cx + dx - 20, 1120, z + 10], [cx + dx + 5, 1240, z + 8]], 2.2, 24, 6), m, null);
      add(new THREE.CylinderGeometry(4.5, 3, 110, 10), m, { x: cx + dx + 8, y: 1180, z: z + 14 });
    }
  }
  // ------------------------------------------------------------------ góc rửa tay + an toàn (tường Tây, z 2000…3400)
  {
    const SX = X0 + 300, SZ = 2500;
    decor.add('sink-unit', { x: SX, y: 0, z: SZ, ry: Math.PI / 2, zone: 'sink' });
    colliders.push(box3(X0, 0, SZ - 460, X0 + 610, 900, SZ + 460));
    surface(mk(new THREE.BoxGeometry(600, 4, 900), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }), { x: SX, y: 872, z: SZ, cast: false }), 'sink-top');
    if (!cadOK) add(rbox(600, 870, 900, 6), M.white, { x: SX, y: 435, z: SZ });
    const as = CAD_ANCHORS?.['sink-unit']?.anchor_sign?.p || [-330, 1420, -297];
    // biển trên hộp xà phòng: toạ độ model → thế giới (quay +90° quanh Y)
    const sp = V(...as).applyAxisAngle(V(0, 1, 0), Math.PI / 2).add(V(SX, 0, SZ));
    sign('wash', { title: 'RỬA TAY SAU KHI HÀN', sub: 'Thiếc hàn có chì (Pb) — rửa xà phòng 20 giây', kind: 'info', icon: '🧼' }, 420, 190, X0 + 4, 2130, sp.z - 60, Math.PI / 2);
    anchor('sink', SX + 420, 0, SZ, Math.PI / 2).userData.label = 'Bồn rửa tay';
    decor.add('safety-kit', { node: 'first_aid_box', x: X0 + 66, y: 1330, z: 3260, ry: Math.PI / 2, zone: 'sink' });
    sign('first-aid', { title: 'SƠ CỨU · BỎNG NHIỆT', sub: 'Xả nước mát 20 phút rồi bôi gel', kind: 'info', icon: '✚' }, 360, 170, X0 + 4, 1780, 3260, Math.PI / 2);
    decor.add('safety-kit', { node: 'burn_gel', x: X0 + 470, y: 872, z: 2900, ry: 0.4, zone: 'sink-small', far: 6000 });
    decor.add('safety-kit', { node: 'eyewash', x: X0 + 120, y: 872, z: 2870, zone: 'sink-small', far: 6000 });
    decor.add('safety-kit', { node: 'gloves_box', x: X0 + 140, y: 872, z: 2140, ry: Math.PI / 2, zone: 'sink-small', far: 6000 });
    anchor('first-aid-kit', X0 + 400, 0, 3260, Math.PI / 2);
    // bình CO2 góc bàn hàn
    decor.add('safety-kit', { node: 'fire_extinguisher', x: X0 + 120, y: 0, z: -3720, ry: Math.PI / 2, zone: 'room-misc' });
    colliders.push(box3(X0, 0, -3820, X0 + 220, 600, -3620));
    anchor('co2-extinguisher', X0 + 450, 0, -3720, Math.PI / 2);
  }
  // ------------------------------------------------------------------ thùng rác điện tử + pin cũ (gần cửa), tủ dụng cụ, cây xanh
  {
    decor.add('bins', { node: 'ewaste_bin', x: 2150, y: 0, z: Z1 - 230, ry: Math.PI, zone: 'room-misc' });
    decor.add('bins', { node: 'battery_box', x: 1780, y: 0, z: Z1 - 110, ry: Math.PI, zone: 'room-misc' });
    colliders.push(box3(1950, 0, Z1 - 430, 2350, 700, Z1), box3(1670, 0, Z1 - 190, 1890, 270, Z1));
    const ea = CAD_ANCHORS?.bins?.anchor_label_ewaste?.p || [0, 330, 191];
    const lab = canvasPlane(300, 200, (g, W, H) => {
      g.fillStyle = '#fff6c8'; g.fillRect(0, 0, W, H);
      text(g, '♻ RÁC THẢI ĐIỆN TỬ', W / 2, H * 0.24, { size: H * 0.15, color: '#16181c', align: 'center', bold: true, maxW: W * 0.94 });
      text(g, 'Linh kiện hỏng · bo mạch · dây cáp', W / 2, H * 0.5, { size: H * 0.1, color: '#333', align: 'center', maxW: W * 0.92 });
      text(g, 'KHÔNG bỏ pin LiPo vào đây', W / 2, H * 0.75, { size: H * 0.1, color: '#c0392b', align: 'center', bold: true, maxW: W * 0.92 });
    }, { pxPerMm: 1.5, fallback: '#fff6c8' });
    lab.position.set(2150 - ea[0], ea[1], Z1 - 230 - ea[2] - 0.6); lab.rotation.y = Math.PI; lab.castShadow = false;
    root.add(lab);
    const ba = CAD_ANCHORS?.bins?.anchor_label_battery?.p || [0, 130, 71];
    const lab2 = canvasPlane(170, 120, (g, W, H) => { g.fillStyle = '#e8f7ec'; g.fillRect(0, 0, W, H); text(g, '🔋 PIN CŨ', W / 2, H * 0.4, { size: H * 0.2, color: '#1b6e3a', align: 'center', bold: true }); text(g, 'thu gom riêng', W / 2, H * 0.72, { size: H * 0.13, color: '#333', align: 'center' }); }, { pxPerMm: 1.5, fallback: '#e8f7ec' });
    lab2.position.set(1780 - ba[0], ba[1], Z1 - 110 - ba[2] - 0.6); lab2.rotation.y = Math.PI; lab2.castShadow = false;
    root.add(lab2);
    anchor('ewaste-bin', 2150, 700, Z1 - 450, Math.PI);
    decor.add('tool-cabinet', { x: 3780, y: 0, z: -3740, zone: 'cabinet' });
    colliders.push(box3(3430, 0, -3980, 4130, 920, -3500));
    anchor('tool-cabinet', 3780, 906, -3740, 0).userData.label = 'Tủ dụng cụ';
    decor.add('plants', { node: 'plant_snake', x: X1 - 300, y: 0, z: Z0 + 300, ry: 0.4, zone: 'room-misc' });
    decor.add('plants', { node: 'plant_snake', x: X0 + 260, y: 0, z: Z1 - 240, ry: 2.1, zone: 'room-misc' });
    decor.add('plants', { node: 'plant_zz', x: COUNTER.x - 50, y: COUNTER.h, z: COUNTER.z + 1080, ry: 0.8, zone: 'counter-plant', far: 9000 });
    colliders.push(box3(X1 - 420, 0, Z0 + 180, X1 - 180, 900, Z0 + 420), box3(X0 + 140, 0, Z1 - 360, X0 + 380, 900, Z1 - 120));
  }
  // ------------------------------------------------------------------ thảm cao su chống tĩnh điện trải sàn trước bàn hàn & bàn đo
  {
    const mat = texturedMaterial(floorMatSet(game), { color: 0x3b3f45, roughness: 0.9 }, { repeat: [2, 1.2], normalScale: 0.6 });
    for (const b of BENCHES.filter((x) => !x.island)) {
      const w = b.w - 100, d = 1000, z = b.z + b.d / 2 + d / 2 + 20;
      const m = mk(rbox(w, 4, d, 2), mat, { x: b.x, y: 2, z, cast: false });
      m.receiveShadow = true;
      surface(m, `floor-mat-${b.name}`);
      // cúc nối đất ở góc thảm + dây xanh lá về ổ tường
      add(new THREE.CylinderGeometry(7, 7, 4, 14), M.chrome, { x: b.x - w / 2 + 40, y: 6, z: z - d / 2 + 40 }, false);
      add(tube([[b.x - w / 2 + 40, 7, z - d / 2 + 40], [b.x - w / 2 + 20, 3, z - d / 2 - 60], [b.x - w / 2 + 20, 3, b.z + b.d / 2 - 40], [b.x - w / 2 + 25, 120, Z0 + 30]], 1.8, 24, 5), std(0x1b6e3a, 0, 0.5), null);
    }
  }
  // ------------------------------------------------------------------ quản lý dây: máng lưới dưới mép sau bàn sát tường + bó dây
  {
    const cable = std(0x1d1f23, 0, 0.55), wrap = std(0x2a2c30, 0, 0.7);
    for (const b of BENCHES.filter((x) => !x.island)) {
      const y = BENCH_H - 120, zt = Z0 + 120, x0 = b.x - b.w / 2 + 120, x1 = b.x + b.w / 2 - 120;
      // máng lưới chữ U (đáy + 2 thành bằng thanh mảnh)
      for (const [dy, dz] of [[0, -55], [0, 55], [45, -55], [45, 55]]) add(new THREE.CylinderGeometry(2.2, 2.2, x1 - x0, 6), M.chrome, { x: (x0 + x1) / 2, y: y + dy, z: zt + dz, rz: Math.PI / 2 }, false);
      for (let x = x0; x <= x1; x += 100) add(tube([[x, y + 45, zt - 55], [x, y, zt - 55], [x, y, zt + 55], [x, y + 45, zt + 55]], 2, 6, 5), M.chrome, null);
      for (const xs of [x0 + 60, x1 - 60]) add(new THREE.BoxGeometry(30, 120, 8), M.frame, { x: xs, y: y + 70, z: Z0 + 4 });
      // bó dây trong máng + ống xoắn lên ổ trên tường
      for (let k = 0; k < 4; k++) add(tube([[x0 + 30, y + 12 + (k % 2) * 12, zt - 30 + k * 18], [x1 - 30, y + 12 + ((k + 1) % 2) * 12, zt - 30 + k * 18]], 4.5 + (k % 2), 2, 6), [cable, std(0x2b5fae, 0, 0.5), cable, std(0xe8e8e8, 0, 0.5)][k], null);
      const sx = b.x + (b.stripX ?? (b.w / 2 - 520)) + 260;
      add(tube([[sx, 930, Z0 + 25], [sx + 20, 860, Z0 + 40], [sx + 30, y + 40, zt]], 9, 10, 8), wrap, null);
      // dây nguồn của thiết bị trên bàn thả xuống máng (sau bàn)
      for (const dx of [-500, -150, 250, 600]) add(tube([[b.x + dx, BENCH_H + 20, Z0 + 60], [b.x + dx + 10, BENCH_H - 40, Z0 + 50], [b.x + dx + 30, y + 30, zt]], 3.2, 8, 6), cable, null);
    }
    // bàn đảo: dây nguồn thả từ máng cáp trần xuống (ống xoắn đen), máng ngang trần nối về máng tường Tây
    const isl = BENCHES.find((b) => b.island);
    if (isl) {
      const zx = isl.z - isl.d / 2 + 45, yT = 2850;
      add(new THREE.BoxGeometry(isl.x - (X0 + 250), 50, 300), M.frameLight, { x: (isl.x + X0 + 250) / 2, y: yT, z: isl.z - 200 }, true);
      for (const s2 of [-1, 1]) add(new THREE.CylinderGeometry(4, 4, RH - yT, 8), M.chrome, { x: isl.x + s2 * 400, y: (RH + yT) / 2, z: isl.z - 200 });
      add(tube([[isl.x, yT - 25, isl.z - 200], [isl.x, 2300, isl.z - 260], [isl.x, 1300, zx - 20]], 10, 16, 8), wrap, null);
      add(tube([[isl.x, 1300, zx - 20], [isl.x + 120, 900, zx - 10], [isl.x + 240, BENCH_H + 20, zx]], 6, 10, 8), cable, null);
    }
  }
  // ------------------------------------------------------------------ đèn treo LED trên bàn (vỏ nhôm + tấm khuếch tán phát sáng)
  for (const b of BENCHES) {
    const y = 2380, z = b.island ? b.z : b.z + 60;
    add(rbox(1400, 40, 90, 8), M.alu, { x: b.x, y, z });
    BN.add(new THREE.PlaneGeometry(1360, 64), M.panel, { x: b.x, y: y - 20.5, z, rx: Math.PI / 2 }, { castShadow: false });
    for (const s2 of [-1, 1]) add(new THREE.CylinderGeometry(1.2, 1.2, RH - y, 4), M.chrome, { x: b.x + s2 * 600, y: (RH + y) / 2, z }, false);
    anchors[`pendant-${b.name}`] = anchor(`pendant-${b.name}`, b.x, y - 25, z, 0);
  }
  // ------------------------------------------------------------------ ánh sáng cửa sổ (trời ban ngày qua rèm lá)
  if (q >= 3) {          // chỉ 'ultra' (RectAreaLight tốn mỗi pixel) — ở 'high' nắng chiếu qua rèm do đèn mặt trời (có bóng)
    const r = new THREE.RectAreaLight(0xe8f2ff, 3.2, 4400, 1400);
    r.position.set(X1 - 80, 1650, -1400);
    r.lookAt(0, 1650, -1400);
    r.name = 'window-light';
    root.add(r); lights.push(r);
  }
  // ------------------------------------------------------------------ giá treo hộp linh kiện (louvered panel) trên quầy tường Tây:
  // 6 × 4 hộp nhựa miệng vát có nhãn in (atlas 1 texture) + linh kiện nhô lên trong hộp — 4 draw call
  {
    const cols = 6, rows = 4, bw = 140, bh = 120, bd = 230, px = 160, py = 150;
    const x0 = X0 + 12, zc = COUNTER.z, y0 = 1530;          // trên nóc 2 tủ ngăn kéo (cao ≈ 1460)
    add(new THREE.BoxGeometry(14, rows * py + 80, cols * px + 80), M.frameLight, { x: X0 + 7, y: y0 + (rows * py) / 2 - 20, z: zc });
    for (let r = 0; r <= rows; r++) add(new THREE.BoxGeometry(18, 6, cols * px + 60), M.frame, { x: X0 + 16, y: y0 - 10 + r * py, z: zc }, false);
    const shape = new THREE.Shape([[0, 0], [1, 0], [1, 0.55], [0.55, 1], [0, 1]].map(([a, b]) => new THREE.Vector2(a, b)));
    const binGeo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
    binGeo.translate(-0.5, -0.5, -0.5); binGeo.rotateY(-Math.PI / 2);          // miệng vát hướng +X (ra phòng)
    const N = cols * rows;
    const bins = new THREE.InstancedMesh(binGeo, std(0xffffff, 0, 0.45), N);
    const bits = new THREE.InstancedMesh(new THREE.CylinderGeometry(3, 3, 14, 6), std(0xffffff, 0.2, 0.5), N * 6);
    const colors = [0x2b5fae, 0xc8302a, 0xf2b705, 0x2f8a4a];
    const names = ['Điện trở 1/4W', 'Tụ gốm', 'Tụ hoá', 'LED 5mm', 'Diode', 'MOSFET', 'IC logic', 'Thạch anh', 'Header đực', 'Header cái', 'JST-XH', 'Domino',
      'Ốc M3', 'Đai ốc M3', 'Trụ đồng', 'Ốc M2.5', 'Dây rút', 'Ống co nhiệt', 'Cầu chì', 'Công tắc', 'Nút nhấn', 'Biến trở', 'Cảm biến', 'Linh tinh'];
    const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), c = new THREE.Color();
    const lpos = [], luv = [], lidx = [];
    for (let i = 0; i < N; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      const z = zc - ((cols - 1) * px) / 2 + col * px, y = y0 + 8 + row * py + bh / 2;
      m4.compose(V(x0 + bd / 2, y, z), qq.identity(), V(bd, bh, bw)); bins.setMatrixAt(i, m4); bins.setColorAt(i, c.set(colors[row % 4]));
      for (let k = 0; k < 6; k++) {
        m4.compose(V(x0 + 60 + (k % 3) * 45, y - bh / 2 + 18 + (k % 2) * 6, z - 40 + Math.floor(k / 3) * 70), qq.setFromEuler(new THREE.Euler(Math.PI / 2 + 0.3 * k, 0.4 * k, 0)), one);
        bits.setMatrixAt(i * 6 + k, m4); bits.setColorAt(i * 6 + k, c.set([0xd9c39a, 0xe0b23a, 0x1d2a55, 0xff3030, 0x222222, 0xc9d3dd][(i + k) % 6]));
      }
      // nhãn trên mặt vát (+X)
      const lx = x0 + bd + 0.8, ly = y - bh * 0.3, w = bw * 0.8, h = bh * 0.22;
      const b = lpos.length / 3;
      lpos.push(lx, ly - h / 2, z + w / 2, lx, ly - h / 2, z - w / 2, lx, ly + h / 2, z - w / 2, lx, ly + h / 2, z + w / 2);
      const u0 = col / cols, u1 = (col + 1) / cols, v1 = 1 - row / rows, v0 = 1 - (row + 1) / rows;
      luv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      lidx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    for (const m of [bins, bits]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); root.add(m); }
    bins.name = 'wall-bins';
    const atlas = drawTexture(cols * 192, rows * 48, (g, W, H) => {
      for (let i = 0; i < N; i++) {
        const col = i % cols, row = Math.floor(i / cols);
        const x = col * 192, y = (rows - 1 - row) * 48;
        g.fillStyle = '#fbfbf6'; g.fillRect(x + 2, y + 2, 188, 44);
        g.fillStyle = '#111'; g.font = 'bold 22px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(names[i], x + 96, y + 25, 180);
      }
    });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lpos, 3));
    lg.setAttribute('uv', new THREE.Float32BufferAttribute(luv, 2));
    lg.setIndex(lidx); lg.computeVertexNormals();
    const labels = new THREE.Mesh(lg, new THREE.MeshStandardMaterial({ color: atlas ? 0xffffff : 0xf4f4ee, map: atlas, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
    labels.castShadow = false;
    root.add(labels);
    interact.push({ object: bins, spec: { name: 'Giá hộp linh kiện treo tường (24 hộp có nhãn)', highlight: false, prompts: [] } });
  }
  // ------------------------------------------------------------------ xe đẩy 3 tầng + máy in 3D (in vỏ/giá đỡ robot) giữa phòng
  {
    const cx = 700, cz = -1900;
    decor.add('lab-cart', { x: cx, y: 0, z: cz, ry: -Math.PI / 2, zone: 'cart' });
    decor.add('printer-3d', { x: cx, y: 818, z: cz, ry: -Math.PI / 2, zone: 'cart' });
    decor.add('parts-box', { x: cx - 80, y: 468, z: cz - 60, ry: -Math.PI / 2 + 0.1, zone: 'cart-small', far: 6000 });
    decor.add('esd-bags', { x: cx + 60, y: 118, z: cz + 40, ry: 1.2, zone: 'cart-small', far: 6000 });
    colliders.push(box3(cx - 250, 0, cz - 440, cx + 250, 1500, cz + 440));
    anchor('lab-cart', cx, 818, cz, -Math.PI / 2).userData.label = 'Xe đẩy + máy in 3D';
  }
  // ------------------------------------------------------------------ khu thử robot: làn vào đế sạc, vùng băng đen (thử cảm biến rơi),
  // dây cáp trên sàn (thử kẹt chổi), biển đế sạc
  {
    const tapeMat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
    const flat = (w, d, x, z, mat, rz = 0) => { const m = mk(new THREE.PlaneGeometry(w, d), mat, { x, y: 0.7, z, rx: -Math.PI / 2, rz, cast: false }); m.raycast = () => {}; root.add(m); return m; };
    const black = tapeMat(0x111111), white = tapeMat(0xf2f2f2);
    flat(700, 450, 3600, -250, black);                                         // vùng đen = "vực" với cảm biến hồng ngoại
    for (let i = 0; i < 6; i++) flat(120, 40, TEST.x1 + 100 + i * 120, 1700, white);   // làn vạch trắng tới đế sạc
    add(tube([[2300, 4, 900], [2500, 4, 1020], [2700, 4, 860], [2900, 4, 1080], [3100, 4, 950]], 3.2, 32, 6), std(0x1d1f23, 0, 0.5), null);
    const dockSign = canvasPlane(360, 160, drawWarnSign({ title: 'ĐẾ SẠC ROBOT', sub: 'Để trống 0.5 m hai bên · 20 V / 0.6 A', kind: 'safety', icon: '⚡' }), { pxPerMm: 1.4, fallback: '#1b3a8a' });
    dockSign.position.set(X1 - 4, 650, 1700); dockSign.rotation.y = -Math.PI / 2; dockSign.castShadow = false;
    root.add(dockSign);
    anchor('arena-cliff', 3600, 0, -250, 0).userData.label = 'Vùng băng đen — thử cảm biến rơi';
  }
  // ------------------------------------------------------------------ vách xốp thấp khu thử robot (robot va chạm thật)
  {
    const foam = std(0xf2f3f0, 0, 0.85);
    const { x0, x1, z0, z1 } = TEST;
    const segs = [[x0 + 40, z0 + 40, x0 + 1800, z0 + 40], [x0 + 40, z0 + 40, x0 + 40, z0 + 1400], [x1 - 1600, z1 - 40, x1 - 40, z1 - 40]];
    for (const [ax, az, bx, bz] of segs) {
      const L = Math.hypot(bx - ax, bz - az);
      add(rbox(L, 120, 12, 3), foam, { x: (ax + bx) / 2, y: 60, z: (az + bz) / 2, ry: -Math.atan2(bz - az, bx - ax) });
    }
  }
  // ------------------------------------------------------------------ bóng che khuất "nướng sẵn" (AO decal) — 2 draw call
  const tex = aoTextures();
  if (tex.blob && tex.lin) {
    const blobMat = new THREE.MeshBasicMaterial({ map: tex.blob, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, color: 0x000000 });
    const linMat = new THREE.MeshBasicMaterial({ map: tex.lin, transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, color: 0x000000 });
    blobMat.name = 'ao-blob'; linMat.name = 'ao-linear';
    const blob = (x, z, w, d, y = 0.6) => BN.add(new THREE.PlaneGeometry(w * 1.6, d * 1.6), blobMat, { x, y, z, rx: -Math.PI / 2 }, { castShadow: false });
    for (const b of BENCHES) blob(b.x, b.z, b.w + 120, b.d + 120);
    blob(RACK_A.x, RACK_A.z, RACK_A.d + 80, RACK_A.w + 80);
    blob(RACK_B.x, RACK_B.z, RACK_B.w + 80, RACK_B.d + 80);
    blob(COUNTER.x, COUNTER.z, COUNTER.d + 60, COUNTER.w + 60);
    blob(X0 + 300, 2500, 640, 940);
    blob(3780, -3740, 720, 500);
    blob(2150, Z1 - 230, 420, 420);
    for (const [x, z] of [[-2900, -2850], [-600, -2900], [-2200, -350]]) blob(x, z, 520, 520, 1.2);
    const basis = (n, up, p) => { const xA = new THREE.Vector3().crossVectors(up, n); const m = new THREE.Matrix4().makeBasis(xA, up, n); m.setPosition(p); return m; };
    const wallsIn = [
      { a: V(X0, 0, Z0), b: V(X1, 0, Z0), n: V(0, 0, 1) }, { a: V(X0, 0, Z1), b: V(X1, 0, Z1), n: V(0, 0, -1), gap: [DOOR.x - DOOR.w / 2 - 80, DOOR.x + DOOR.w / 2 + 80] },
      { a: V(X0, 0, Z0), b: V(X0, 0, Z1), n: V(1, 0, 0) }, { a: V(X1, 0, Z0), b: V(X1, 0, Z1), n: V(-1, 0, 0) },
    ];
    for (const w of wallsIn) {
      const along = w.b.clone().sub(w.a), L = along.length(); along.normalize();
      const pieces = w.gap ? [[0, w.gap[0] - w.a.x], [w.gap[1] - w.a.x, L]] : [[0, L]];
      for (const [u0, u1] of pieces) {
        const len = u1 - u0, mid = w.a.clone().addScaledVector(along, (u0 + u1) / 2);
        // sàn sát chân tường (đậm ở mép tường, nhạt dần vào trong 320 mm)
        BN.add(new THREE.PlaneGeometry(len, 320), linMat, basis(V(0, 1, 0), w.n.clone(), mid.clone().addScaledVector(w.n, 160).setY(0.5)), { castShadow: false });
        // chân tường (đậm sát sàn, nhạt dần lên 260 mm) — đặt sau phào chân tường
        BN.add(new THREE.PlaneGeometry(len, 260), linMat, basis(w.n.clone(), V(0, 1, 0), mid.clone().addScaledVector(w.n, 16).setY(130)), { castShadow: false });
        // góc trần (đậm sát trần, nhạt dần xuống 360 mm)
        BN.add(new THREE.PlaneGeometry(len, 360), linMat, basis(w.n.clone(), V(0, -1, 0), mid.clone().addScaledVector(w.n, 2).setY(RH - 180)), { castShadow: false });
      }
    }
  }
}
