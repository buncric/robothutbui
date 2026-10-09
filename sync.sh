#!/bin/sh
# Build lab 3D + game ở máy rồi chép bản đã build vào site/ (máy chủ chỉ cần nginx, không cần npm).
# Dùng: ./sync.sh && git add -A && git commit -m "cập nhật" && git push   → rồi redeploy trên Vibe Host
set -e
cd "$(dirname "$0")"
W=$(pwd)
cd ../../lab
npx vite build --outDir "$W/site" --emptyOutDir
