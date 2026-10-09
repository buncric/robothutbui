// Hai trang: lab 3D (index.html) + game mô phỏng góc nhìn thứ nhất (game.html)
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  // [UX] laptop trong game đọc ../docs/*.md (import.meta.glob ?raw) → cho dev server phục vụ thư mục cha
  server: { fs: { allow: ['..'] } },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        lab: resolve(__dirname, 'index.html'),
        game: resolve(__dirname, 'game.html'),
      },
    },
  },
});
