#!/usr/bin/env bash
# 在阿里云 ECS / 轻量应用服务器上一键部署览界（国内免 VPN）
set -euo pipefail

 DomAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "用法: ./deploy.sh your-domain.com"
  echo "示例: ./deploy.sh lanjie.example.com"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "缺少 .env，请先复制并填写："
  echo "  cp .env.example .env"
  exit 1
fi

# 写入 Caddy 域名
sed "s/your-domain.com/${DOMAIN}/g" deploy/aliyun/Caddyfile > deploy/aliyun/Caddyfile.runtime
mv deploy/aliyun/Caddyfile.runtime deploy/aliyun/Caddyfile

# 安装 docker（若缺失）
if ! command -v docker >/dev/null 2>&1; then
  echo "正在安装 Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker || true
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose 不可用，请安装 Docker Compose 插件"
  exit 1
fi

echo "构建并启动..."
docker compose -f deploy/aliyun/docker-compose.yml up -d --build

echo
echo "✅ 已启动"
echo "1) 阿里云域名解析：A 记录 -> 本机公网 IP"
echo "2) 安全组放行：80 / 443"
echo "3) 稍等证书自动签发后访问：https://${DOMAIN}"
echo "4) 健康检查：https://${DOMAIN}/api/health"
