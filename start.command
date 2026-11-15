#!/bin/bash
# تشغيل نظام The Queen على macOS (انقر مرتين على الملف)
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js غير مثبت. حمّله من https://nodejs.org (الإصدار 22.13 أو أحدث)"
  read -p "اضغط Enter للخروج"
  exit 1
fi
(sleep 1.5 && open "http://localhost:${PORT:-3000}/") &
node --no-warnings server.js
