# 🚀 PM2 直接部署方案（不用 Docker）

如果你不想使用 Docker，可以直接用 PM2 部署，这种方式更轻量、启动更快。

## 📋 前置要求

- Node.js 18+
- PostgreSQL 12+（或使用云数据库）
- PM2（进程管理器）

## ⚡ 快速部署（5分钟）

### 1. 安装依赖

```bash
# 安装 Node.js（如果未安装）
curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -  # CentOS
# 或
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -  # Ubuntu

# 安装 PostgreSQL（如果未安装）
yum install postgresql-server postgresql-contrib  # CentOS
# 或
apt-get install postgresql postgresql-contrib  # Ubuntu

# 安装 PM2
npm install -g pm2
```

### 2. 克隆项目

```bash
cd /www/wwwroot/
git clone https://github.com/你的用户名/nexus-agent-orchestrator.git nexus-agent
cd nexus-agent
```

### 3. 安装依赖

```bash
# 安装前端依赖
npm install

# 安装后端依赖
cd backend
npm install
cd ..
```

### 4. 配置环境变量

```bash
# 后端配置
cd backend
cp .env.example .env
nano .env
```

编辑 `.env` 文件：

```env
PORT=3001
NODE_ENV=production
DATABASE_URL=postgresql://nexus_user:你的密码@localhost:5432/nexus_db
JWT_SECRET=你的JWT密钥（至少32位）
JWT_EXPIRES_IN=7d
GEMINI_API_KEY=你的Gemini API密钥
CORS_ORIGIN=http://你的域名
```

```bash
# 前端配置
cd ..
cp .env.example .env
nano .env
```

编辑 `.env` 文件：

```env
VITE_API_URL=http://你的域名/api
```

### 5. 初始化数据库

```bash
# 创建数据库
sudo -u postgres psql << EOF
CREATE USER nexus_user WITH PASSWORD '你的密码';
CREATE DATABASE nexus_db OWNER nexus_user;
GRANT ALL PRIVILEGES ON DATABASE nexus_db TO nexus_user;
\q
EOF

# 运行迁移
cd backend
npm run migrate
cd ..
```

### 6. 构建前端

```bash
npm run build
```

### 7. 使用 PM2 启动

```bash
# 启动后端
cd backend
pm2 start npm --name "nexus-backend" -- run start
# 或如果已构建
pm2 start dist/index.js --name "nexus-backend"

# 启动前端（使用 serve 或 nginx）
npm install -g serve
pm2 serve ../dist 80 --name "nexus-frontend" --spa
```

### 8. 保存 PM2 配置

```bash
pm2 save
pm2 startup  # 设置开机自启
```

## 📝 一键部署脚本

创建 `pm2-deploy.sh`：

```bash
#!/bin/bash
set -e

echo "🚀 PM2 部署 Nexus Agent..."

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装"
    exit 1
fi

# 检查 PM2
if ! command -v pm2 &> /dev/null; then
    echo "安装 PM2..."
    npm install -g pm2
fi

# 安装依赖
echo "安装依赖..."
npm install
cd backend && npm install && cd ..

# 构建前端
echo "构建前端..."
npm run build

# 配置环境变量（如果不存在）
if [ ! -f "backend/.env" ]; then
    echo "请先配置 backend/.env 文件"
    exit 1
fi

# 初始化数据库
echo "初始化数据库..."
cd backend
npm run migrate
cd ..

# 启动服务
echo "启动服务..."
cd backend
pm2 start npm --name "nexus-backend" -- run start
cd ..

# 启动前端
if ! command -v serve &> /dev/null; then
    npm install -g serve
fi
pm2 serve dist 80 --name "nexus-frontend" --spa

# 保存配置
pm2 save
pm2 startup

echo "✅ 部署完成！"
echo "查看状态: pm2 status"
echo "查看日志: pm2 logs"
```

## 🔧 PM2 常用命令

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs
pm2 logs nexus-backend
pm2 logs nexus-frontend

# 重启服务
pm2 restart nexus-backend
pm2 restart all

# 停止服务
pm2 stop nexus-backend
pm2 stop all

# 删除服务
pm2 delete nexus-backend

# 监控
pm2 monit
```

## 🌐 配置 Nginx 反向代理

在宝塔中配置 Nginx：

```nginx
server {
    listen 80;
    server_name 你的域名;

    # 前端
    location / {
        root /www/wwwroot/nexus-agent/dist;
        try_files $uri $uri/ /index.html;
    }

    # 后端 API
    location /api {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket
    location /ws {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## ✅ 优势

- ✅ **启动快** - 不需要构建 Docker 镜像
- ✅ **资源占用少** - 不需要 Docker 守护进程
- ✅ **调试方便** - 可以直接修改代码并重启
- ✅ **日志清晰** - PM2 日志管理更方便

## ⚠️ 注意事项

- 需要手动管理 Node.js 和 PostgreSQL
- 需要手动处理依赖更新
- 建议使用 Nginx 作为反向代理

## 🔄 更新代码

```bash
cd /www/wwwroot/nexus-agent
git pull
npm install
cd backend && npm install && cd ..
npm run build
pm2 restart all
```

