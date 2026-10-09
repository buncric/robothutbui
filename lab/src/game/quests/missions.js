// =============================================================================
// quests/missions.js — [nhiệm vụ] Đăng ký CHUỖI NHIỆM VỤ đồ án (main.js gọi defineMissionChain(game) sau m0/m1):
//   m0-led → m1-han-pic → m2-nap-pic → m3-nguon-5v → m4-dong-co → m5-mo-xac → m6-lap-robot
//   (điều kiện tiên quyết qua def.requires; "Chế độ tự do" trên bảng nhiệm vụ (phím J) mở khoá tất cả). Mỗi nhiệm vụ lỗi khởi tạo
//   riêng thì bỏ qua nhiệm vụ đó — không làm hỏng game.
// =============================================================================
import { installCircuitExt } from './_circuit-ext.js';
import { defineM2NapPic } from './m2-nap-pic.js';
import { defineM3Nguon5V } from './m3-nguon-5v.js';
import { defineM4DongCo } from './m4-dong-co.js';
import { defineM5MoXac } from './m5-mo-xac.js';
import { defineM6LapRobot } from './m6-lap-robot.js';
import { defineM1bKyThuatVien } from './m1b-ky-thuat-vien.js';

export const MISSION_IDS = ['m0-led', 'm1-han-pic', 'm2-nap-pic', 'm3-nguon-5v', 'm4-dong-co', 'm5-mo-xac', 'm6-lap-robot'];

export function defineMissionChain(game) {
  try { installCircuitExt(game); } catch (e) { console.warn('[nhiệm vụ] circuit-ext lỗi', e); }
  // m0 → m1: CHỈ gợi ý trên bảng (recommends) — không khoá cứng m1 để giữ tương thích (test hàn gọi quests.start('m1-han-pic') trực tiếp)
  const m1 = game.quests.defs.get('m1-han-pic');
  if (m1 && !m1.requires && !m1.recommends && game.quests.defs.has('m0-led')) m1.recommends = ['m0-led'];
  for (const d of ['m0-led', 'm1-han-pic']) { const q = game.quests.defs.get(d); if (q && !q.chapter) q.chapter = d === 'm0-led' ? 'Ngày 0 · làm quen' : 'Ngày 1 · 13–15h'; }
  const lessons = { 'm0-led': 'led-khong-tro', 'm1-han-pic': 'pic16f877a' };
  for (const [d, l] of Object.entries(lessons)) { const q = game.quests.defs.get(d); if (q && !q.lessonId) q.lessonId = l; }
  const out = {};
  for (const [id, f] of [['m2-nap-pic', defineM2NapPic], ['m3-nguon-5v', defineM3Nguon5V], ['m4-dong-co', defineM4DongCo], ['m5-mo-xac', defineM5MoXac], ['m6-lap-robot', defineM6LapRobot]]) {
    try { out[id] = f(game); } catch (e) { console.warn(`[nhiệm vụ] ${id} lỗi khởi tạo`, e); }
  }
  // [hàn chuyên nghiệp] nhiệm vụ kỹ năng ngoài chuỗi (không khoá, không tự bắt đầu)
  try { out['m1b-ky-thuat-vien'] = defineM1bKyThuatVien(game); } catch (e) { console.warn('[nhiệm vụ] m1b-ky-thuat-vien lỗi khởi tạo', e); }
  game.missions = out;
  return out;
}
