#!/usr/bin/env bash
# 车和网CRM 一键部署脚本
# 用法:
#   ./deploy.sh          构建并部署 前端 + 后端（默认）
#   ./deploy.sh backend  只部署后端
#   ./deploy.sh frontend 只部署前端
#
# 首次使用前：cp deploy.config.example.sh deploy.config.sh 并填入真实服务器密码
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# ---- 读取部署配置 ----
if [ ! -f "$ROOT/deploy.config.sh" ]; then
  echo "❌ 缺少 deploy.config.sh，请先执行: cp deploy.config.example.sh deploy.config.sh 并填写"
  exit 1
fi
# shellcheck disable=SC1091
source "$ROOT/deploy.config.sh"

command -v sshpass >/dev/null 2>&1 || { echo "❌ 未安装 sshpass，请先: brew install sshpass"; exit 1; }

TARGET="${1:-all}"
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=15"
run_remote() { sshpass -p "$DEPLOY_PASSWORD" ssh $SSH_OPTS "$DEPLOY_USER@$DEPLOY_HOST" "$1"; }

deploy_backend() {
  echo "▶ [后端] 构建..."
  ( cd "$ROOT/apps/backend" && npm run build >/dev/null )
  echo "▶ [后端] 上传 dist 到 $REMOTE_BACKEND_DIR ..."
  COPYFILE_DISABLE=1 tar czf - -C "$ROOT/apps/backend/dist" src 2>/dev/null \
    | sshpass -p "$DEPLOY_PASSWORD" ssh $SSH_OPTS "$DEPLOY_USER@$DEPLOY_HOST" "tar xzf - -C $REMOTE_BACKEND_DIR/dist 2>/dev/null"
  echo "▶ [后端] 重启 pm2:$PM2_APP_NAME ..."
  run_remote "pm2 restart $PM2_APP_NAME >/dev/null 2>&1 && sleep 4 && pm2 ls | grep -o \"$PM2_APP_NAME.*online\" | head -1"
  echo "✅ 后端部署完成"
}

deploy_frontend() {
  echo "▶ [前端] 构建..."
  ( cd "$ROOT/apps/frontend" && npm run build >/dev/null )
  local js
  js="$(ls "$ROOT/apps/frontend/dist/assets/" | grep -E '^index-.*\.js$' | head -1)"
  echo "▶ [前端] 上传 dist 到 $REMOTE_FRONTEND_DIR ..."
  COPYFILE_DISABLE=1 tar czf - --exclude='.DS_Store' -C "$ROOT/apps/frontend/dist" . 2>/dev/null \
    | sshpass -p "$DEPLOY_PASSWORD" ssh $SSH_OPTS "$DEPLOY_USER@$DEPLOY_HOST" "tar xzf - -C $REMOTE_FRONTEND_DIR 2>/dev/null"
  echo "✅ 前端部署完成（本地构建: $js）"
}

verify() {
  echo "▶ 线上核对..."
  local code online_js
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://$DEPLOY_HOST:8109/api/lead?page=1" || true)"
  echo "   后端 /api/lead 响应: $code (401=鉴权正常, 502=后端异常)"
  online_js="$(curl -s "http://$DEPLOY_HOST:8109/" | grep -o 'index-[A-Za-z0-9_-]*\.js' | head -1 || true)"
  echo "   线上前端入口: $online_js"
}

echo "=== 车和网CRM 部署 [$TARGET] → $DEPLOY_HOST ==="
case "$TARGET" in
  backend)  deploy_backend ;;
  frontend) deploy_frontend ;;
  all)      deploy_backend; deploy_frontend ;;
  *) echo "用法: ./deploy.sh [all|backend|frontend]"; exit 1 ;;
esac
verify
echo "=== 完成 ==="
