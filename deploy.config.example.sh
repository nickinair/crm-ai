# 部署配置示例：复制为 deploy.config.sh 并填入真实值
# deploy.config.sh 已被 .gitignore 排除，不会进入代码仓库

# 生产服务器
export DEPLOY_HOST="124.222.117.150"
export DEPLOY_USER="ubuntu"
export DEPLOY_PASSWORD="your-server-password"

# 服务器上的部署路径
export REMOTE_BACKEND_DIR="/var/www/crm-backend"
export REMOTE_FRONTEND_DIR="/var/www/crm-frontend"

# pm2 中后端进程名
export PM2_APP_NAME="crm-backend"
