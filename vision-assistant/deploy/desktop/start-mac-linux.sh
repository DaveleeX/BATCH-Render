#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "已创建 .env，请先填写豆包/高德 Key 后再运行。"
  exit 1
fi

if command -v docker >/dev/null 2>&1; then
  docker compose up -d --build
  echo "本机: http://127.0.0.1:3000"
  exit 0
fi

npm install
npm run build
npm run start -- -p 3000
