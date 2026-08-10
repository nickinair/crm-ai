#!/usr/bin/env bash
# 车和网CRM 一键部署脚本（支持多环境）
# 用法:
#   ./deploy.sh                   构建并部署 前端+后端 到【生产】（默认，与原行为一致）
#   ./deploy.sh backend           只部署后端到生产
#   ./deploy.sh all test          部署前端+后端到【测试环境】
#   ./deploy.sh backend test      只部署后端到测试环境
#
# 环境配置文件（均已被 .gitignore 排除，不会进入代码仓库）：
#   生产 → deploy.config.sh
#   测试 → deploy.config.test.sh
# 首次使用：cp deploy.config.example.sh deploy.config.sh 并填入真实值
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

TARGET="${1:-all}"
ENV_NAME="${2:-prod}"

# ---- 读取部署配置 ----
case "$ENV_NAME" in
  prod) CONFIG="$ROOT/deploy.config.sh" ;;
  test) CONFIG="$ROOT/deploy.config.test.sh" ;;
  *) echo "❌ 未知环境: $ENV_NAME（可用: prod | test）"; exit 1 ;;
esac

if [ ! -f "$CONFIG" ]; then
  echo "❌ 缺少配置文件 $(basename "$CONFIG")，请先复制 deploy.config.example.sh 并填写"
  exit 1
fi
# shellcheck disable=SC1090
source "$CONFIG"

# 未在配置里指定时的默认值（兼容旧的生产配置文件）
BACKEND_ENTRY_DIR="${BACKEND_ENTRY_DIR:-dist}"
VERIFY_PORT="${VERIFY_PORT:-8109}"
VERIFY_HOST="${VERIFY_HOST:-$DEPLOY_HOST}"

command -v sshpass >/dev/null 2>&1 || { echo "❌ 未安装 sshpass，请先: brew install sshpass"; exit 1; }

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
  # 注入环境标识：测试环境构建的前端会在界面上显示「测试环境」标签
  ( cd "$ROOT/apps/frontend" && VITE_APP_ENV="$ENV_NAME" npm run build >/dev/null )
  local js
  js="$(ls "$ROOT/apps/frontend/dist/assets/" | grep -E '^index-.*\.js$' | head -1)"
  echo "▶ [前端] 上传 dist 到 $REMOTE_FRONTEND_DIR ..."
  COPYFILE_DISABLE=1 tar czf - --exclude='.DS_Store' -C "$ROOT/apps/frontend/dist" . 2>/dev/null \
    | sshpass -p "$DEPLOY_PASSWORD" ssh $SSH_OPTS "$DEPLOY_USER@$DEPLOY_HOST" "tar xzf - -C $REMOTE_FRONTEND_DIR 2>/dev/null"
  echo "✅ 前端部署完成（本地构建: $js）"
}

verify() {
  # 在服务器本机自检，不受公网安全组端口限制影响（测试环境端口未对外开放也能核对）
  echo "▶ 线上核对..."
  local base out
  base="http://127.0.0.1:$VERIFY_PORT"
  out="$(run_remote "
    echo -n 'API:'; curl -s -o /dev/null -w '%{http_code}' --max-time 20 '$base/api/lead?page=1'
    echo -n ' JS:'; curl -s --max-time 20 '$base/' | grep -o 'index-[A-Za-z0-9_-]*\.js' | head -1
  " || true)"
  echo "   后端 /api/lead 响应: $(echo "$out" | sed -n 's/.*API:\([0-9]*\).*/\1/p') (401=鉴权正常, 502=后端异常)"
  echo "   线上前端入口: $(echo "$out" | grep -o 'index-[A-Za-z0-9_-]*\.js' | head -1)"
}

echo "=== 车和网CRM 部署 [$TARGET] → 环境:$ENV_NAME ($DEPLOY_HOST) ==="
case "$TARGET" in
  backend)  deploy_backend ;;
  frontend) deploy_frontend ;;
  all)      deploy_backend; deploy_frontend ;;
  *) echo "用法: ./deploy.sh [all|backend|frontend] [prod|test]"; exit 1 ;;
esac
verify
echo "=== 完成 ==="
