#!/bin/sh
# Chép lab/ + docs/ từ dự án vào repo deploy (bỏ node_modules, dist). Chạy lại mỗi lần muốn cập nhật web.
set -e
cd "$(dirname "$0")"
R=../..
rsync -a --delete --exclude node_modules --exclude dist --exclude .DS_Store "$R/lab/" lab/
rsync -a --delete --include '*.md' --exclude '*' "$R/docs/" docs/
