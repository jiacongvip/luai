# 🚀 宝塔面板 Docker 部署完整指南

本指南将帮助你在宝塔面板中通过 Docker 部署 Nexus Agent Orchestrator 系统。

## 📋 目录

1. [前置要求](#前置要求)
2. [第一步：准备环境](#第一步准备环境)
3. [第二步：上传项目](#第二步上传项目)
4. [第三步：配置环境变量](#第三步配置环境变量)
5. [第四步：一键部署](#第四步一键部署)
6. [第五步：配置宝塔反向代理](#第五步配置宝塔反向代理)
7. [第六步：配置 SSL 证书](#第六步配置-ssl-证书)
8. [第七步：验证部署](#第七步验证部署)
9. [常用管理命令](#常用管理命令)
10. [故障排除](#故障排除)

---

## 📋 前置要求

- ✅ 已安装宝塔面板（Linux 7.x/8.x）
- ✅ 服务器至少 2GB 内存
- ✅ 服务器至少 10GB 可用磁盘空间
- ✅ 已绑定域名（可选，但推荐）

---

## 🔧 第一步：准备环境

### 1.1 安装 Docker（如果未安装）

1. 登录宝塔面板
2. 进入 **软件商店** → 搜索 **Docker**
3. 点击 **安装**，等待安装完成
4. 或者使用命令行安装：

```bash
# CentOS/RHEL
yum install -y docker
systemctl start docker
systemctl enable docker

# Ubuntu/Debian
apt-get update
apt-get install -y docker.io
systemctl start docker
systemctl enable docker
```

### 1.2 安装 Docker Compose

在宝塔 **终端** 中执行：

```bash
# 下载 Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose

# 添加执行权限
chmod +x /usr/local/bin/docker-compose

# 验证安装
docker-compose --version
```

### 1.3 验证 Docker 环境

```bash
# 检查 Docker 版本
docker --version

# 检查 Docker Compose 版本
docker-compose --version

# 测试 Docker 是否正常运行
docker ps
```

---

## 📦 第二步：上传项目

### 方式1：使用 Git 克隆（推荐）

```bash
# 进入网站根目录
cd /www/wwwroot/

# 克隆项目（替换为你的仓库地址）
git clone https://github.com/你的用户名/nexus-agent-orchestrator.git nexus-agent

# 进入项目目录
cd nexus-agent
```

### 方式2：上传压缩包

1. 在本地将项目打包为 `zip` 或 `tar.gz`
2. 在宝塔 **文件管理** 中进入 `/www/wwwroot/`
3. 上传压缩包并解压
4. 将解压后的文件夹重命名为 `nexus-agent`

### 方式3：使用宝塔 Git 功能

1. 在宝塔 **文件管理** 中进入 `/www/wwwroot/`
2. 点击 **终端** 或使用 **Git 仓库** 功能
3. 克隆项目到 `nexus-agent` 目录

---

## ⚙️ 第三步：配置环境变量

### 3.1 创建环境变量文件

```bash
cd /www/wwwroot/nexus-agent

# 复制示例文件
cp env.prod.example .env.prod

# 编辑配置文件
nano .env.prod
# 或者使用宝塔文件管理器在线编辑
```

### 3.2 配置说明

编辑 `.env.prod` 文件，修改以下关键配置：

```env
# ============================================
# 数据库配置（必须修改！）
# ============================================
POSTGRES_USER=nexus_user
POSTGRES_PASSWORD=你的强密码_至少16位_包含大小写字母数字
POSTGRES_DB=nexus_db
POSTGRES_PORT=5432

# ============================================
# 后端配置
# ============================================
BACKEND_PORT=3001
JWT_SECRET=生成一个至少32位的随机字符串
JWT_EXPIRES_IN=7d
GEMINI_API_KEY=你的Gemini API密钥

# ============================================
# 前端配置（如果有域名，请修改）
# ============================================
FRONTEND_PORT=80
VITE_API_URL=http://你的域名/api
CORS_ORIGIN=http://你的域名

# 如果使用 HTTPS，改为：
# VITE_API_URL=https://你的域名/api
# CORS_ORIGIN=https://你的域名
```

### 3.3 生成安全密钥

在终端中执行：

```bash
# 生成数据库密码（24位）
openssl rand -base64 24 | tr -d "=+/" | cut -c1-24

# 生成 JWT 密钥（32位）
openssl rand -base64 32
```

将生成的密钥填入 `.env.prod` 文件。

### 3.4 获取 Gemini API 密钥

1. 访问 [Google AI Studio](https://makersuite.google.com/app/apikey)
2. 创建新的 API 密钥
3. 将密钥填入 `GEMINI_API_KEY`

---

## 🚀 第四步：一键部署

### 方式1：使用一键安装脚本（推荐）

```bash
cd /www/wwwroot/nexus-agent

# 给脚本添加执行权限
chmod +x install.sh

# 运行安装脚本
./install.sh
```

脚本会自动：
- ✅ 检查 Docker 环境
- ✅ 生成安全配置（如果未配置）
- ✅ 构建 Docker 镜像
- ✅ 启动所有服务
- ✅ 运行数据库迁移

### 方式2：使用部署脚本

```bash
cd /www/wwwroot/nexus-agent

# 确保已配置 .env.prod 文件
chmod +x deploy.sh

# 运行部署脚本
./deploy.sh
```

### 方式3：手动部署

```bash
cd /www/wwwroot/nexus-agent

# 1. 停止旧容器（如果存在）
docker-compose -f docker-compose.prod.yml down

# 2. 构建镜像
docker-compose -f docker-compose.prod.yml --env-file .env.prod build

# 3. 启动服务
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d

# 4. 等待服务启动（10秒）
sleep 10

# 5. 运行数据库迁移
docker-compose -f docker-compose.prod.yml exec -T backend npm run migrate

# 6. 查看服务状态
docker-compose -f docker-compose.prod.yml ps
```

### 4.1 验证服务启动

```bash
# 查看所有容器状态
docker-compose -f docker-compose.prod.yml ps

# 应该看到三个服务都在运行：
# - nexus-postgres-prod (数据库)
# - nexus-backend-prod (后端)
# - nexus-frontend-prod (前端)

# 查看日志
docker-compose -f docker-compose.prod.yml logs -f
```

---

## 🌐 第五步：配置宝塔反向代理

### 5.1 创建网站

1. 登录宝塔面板
2. 进入 **网站** → **添加站点**
3. 填写信息：
   - **域名**：`nexus.yourdomain.com`（或你的域名）
   - **备注**：Nexus Agent Orchestrator
   - **根目录**：`/www/wwwroot/nexus-agent`（可选，因为我们用 Docker）
   - **FTP**：不创建
   - **数据库**：不创建（使用 Docker 中的 PostgreSQL）
   - **PHP 版本**：纯静态（不重要）
4. 点击 **提交**

### 5.2 配置反向代理

1. 点击网站右侧 **设置** 按钮
2. 进入 **反向代理** 标签
3. 点击 **添加反向代理**
4. 配置如下：

```
代理名称：nexus-frontend
目标URL：http://127.0.0.1:80
发送域名：$host
```

5. 点击 **保存**

### 5.3 配置 API 代理（重要）

由于前端容器内的 Nginx 已经配置了 `/api` 代理，但宝塔的 Nginx 也需要配置，有两种方案：

#### 方案A：直接代理到后端（推荐）

在宝塔反向代理中添加第二个代理：

```
代理名称：nexus-api
目标URL：http://127.0.0.1:3001
发送域名：$host
```

然后修改代理的 **高级设置**，添加：

```
位置：/api
```

#### 方案B：只代理前端，让前端容器处理 API

如果使用方案B，确保前端容器的 Nginx 配置正确（已包含在项目中）。

### 5.4 配置 WebSocket 代理（如果需要）

如果使用 WebSocket 功能，添加第三个代理：

```
代理名称：nexus-ws
目标URL：http://127.0.0.1:3001
发送域名：$host
```

在 **高级设置** 中添加：

```
位置：/ws
```

并确保勾选 **WebSocket** 选项。

---

## 🔒 第六步：配置 SSL 证书

### 6.1 申请 Let's Encrypt 证书

1. 在网站设置中进入 **SSL** 标签
2. 选择 **Let's Encrypt**
3. 填写信息：
   - **域名**：自动填充
   - **邮箱**：你的邮箱地址
4. 点击 **申请**
5. 等待证书申请完成

### 6.2 开启强制 HTTPS

1. 在 SSL 设置中
2. 开启 **强制 HTTPS**
3. 点击 **保存**

### 6.3 更新环境变量（如果使用 HTTPS）

```bash
cd /www/wwwroot/nexus-agent

# 编辑 .env.prod
nano .env.prod

# 修改以下配置：
# VITE_API_URL=https://你的域名/api
# CORS_ORIGIN=https://你的域名

# 重启前端容器
docker-compose -f docker-compose.prod.yml restart frontend
```

---

## ✅ 第七步：验证部署

### 7.1 检查服务状态

```bash
cd /www/wwwroot/nexus-agent

# 查看容器状态
docker-compose -f docker-compose.prod.yml ps

# 查看日志
docker-compose -f docker-compose.prod.yml logs --tail=50
```

### 7.2 测试访问

1. **前端页面**：访问 `http://你的域名` 或 `https://你的域名`
2. **后端健康检查**：访问 `http://你的域名/api/health`
3. **API 文档**：访问 `http://你的域名/api/docs`（如果有）

### 7.3 检查端口占用

```bash
# 检查端口是否被占用
netstat -tlnp | grep -E ':(80|3001|5432)'

# 或者使用 ss 命令
ss -tlnp | grep -E ':(80|3001|5432)'
```

---

## 📝 常用管理命令

### 查看日志

```bash
cd /www/wwwroot/nexus-agent

# 查看所有服务日志
docker-compose -f docker-compose.prod.yml logs -f

# 查看特定服务日志
docker-compose -f docker-compose.prod.yml logs -f backend
docker-compose -f docker-compose.prod.yml logs -f frontend
docker-compose -f docker-compose.prod.yml logs -f postgres
```

### 重启服务

```bash
# 重启所有服务
docker-compose -f docker-compose.prod.yml restart

# 重启特定服务
docker-compose -f docker-compose.prod.yml restart backend
docker-compose -f docker-compose.prod.yml restart frontend
```

### 停止/启动服务

```bash
# 停止所有服务
docker-compose -f docker-compose.prod.yml stop

# 启动所有服务
docker-compose -f docker-compose.prod.yml start

# 停止并删除容器（保留数据卷）
docker-compose -f docker-compose.prod.yml down

# 停止并删除容器和数据卷（危险！）
docker-compose -f docker-compose.prod.yml down -v
```

### 更新代码

```bash
cd /www/wwwroot/nexus-agent

# 拉取最新代码
git pull

# 重新构建并启动
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# 运行数据库迁移（如果有）
docker-compose -f docker-compose.prod.yml exec -T backend npm run migrate
```

### 备份数据库

```bash
cd /www/wwwroot/nexus-agent

# 创建备份目录
mkdir -p backups

# 备份数据库
docker-compose -f docker-compose.prod.yml exec -T postgres pg_dump -U nexus_user nexus_db > backups/backup_$(date +%Y%m%d_%H%M%S).sql

# 恢复数据库
docker-compose -f docker-compose.prod.yml exec -T postgres psql -U nexus_user nexus_db < backups/backup_20240101_120000.sql
```

### 查看资源使用

```bash
# 查看容器资源使用
docker stats

# 查看特定容器
docker stats nexus-backend-prod nexus-frontend-prod nexus-postgres-prod
```

---

## 🐛 故障排除

### 问题1：容器无法启动

**检查步骤**：

```bash
# 查看详细日志
docker-compose -f docker-compose.prod.yml logs

# 检查端口占用
netstat -tlnp | grep -E ':(80|3001|5432)'

# 检查 Docker 服务
systemctl status docker
```

**常见原因**：
- 端口被占用：修改 `.env.prod` 中的端口号
- 环境变量错误：检查 `.env.prod` 配置
- 内存不足：检查服务器内存使用

### 问题2：502 Bad Gateway

**检查步骤**：

```bash
# 检查后端是否运行
docker-compose -f docker-compose.prod.yml ps backend

# 查看后端日志
docker-compose -f docker-compose.prod.yml logs backend

# 测试后端连接
curl http://127.0.0.1:3001/health
```

**解决方案**：
- 重启后端：`docker-compose -f docker-compose.prod.yml restart backend`
- 检查反向代理配置是否正确
- 检查防火墙是否开放端口

### 问题3：数据库连接失败

**检查步骤**：

```bash
# 检查数据库容器
docker-compose -f docker-compose.prod.yml ps postgres

# 查看数据库日志
docker-compose -f docker-compose.prod.yml logs postgres

# 测试数据库连接
docker-compose -f docker-compose.prod.yml exec postgres psql -U nexus_user -d nexus_db -c "SELECT 1;"
```

**解决方案**：
- 检查 `.env.prod` 中的数据库配置
- 确保数据库容器已启动
- 检查数据库密码是否正确

### 问题4：前端无法访问后端 API

**检查步骤**：

```bash
# 检查后端是否正常运行
curl http://127.0.0.1:3001/api/health

# 检查前端配置
docker-compose -f docker-compose.prod.yml exec frontend cat /etc/nginx/conf.d/default.conf
```

**解决方案**：
- 检查 `VITE_API_URL` 配置是否正确
- 检查 CORS 配置
- 检查反向代理配置

### 问题5：内存不足

**检查步骤**：

```bash
# 查看内存使用
free -h

# 查看容器资源使用
docker stats --no-stream
```

**解决方案**：
- 关闭不必要的服务
- 增加服务器内存
- 优化 Docker 配置

### 问题6：SSL 证书申请失败

**检查步骤**：
- 确保域名已正确解析到服务器 IP
- 确保 80 端口已开放
- 检查防火墙设置

**解决方案**：
- 在宝塔 **安全** 中开放 80 和 443 端口
- 检查域名 DNS 解析
- 使用手动申请方式

---

## 🛡️ 安全建议

### 1. 修改默认端口

如果直接暴露端口，建议修改：

```env
POSTGRES_PORT=5433  # 改为非标准端口
BACKEND_PORT=3002   # 改为非标准端口
```

### 2. 使用防火墙

在宝塔 **安全** 中：
- 只开放必要端口（80, 443）
- 关闭不必要的端口
- 使用宝塔防火墙或系统防火墙

### 3. 定期备份

设置宝塔 **计划任务**：
- 每天备份数据库
- 每周备份项目文件
- 定期备份 Docker 数据卷

### 4. 更新系统

```bash
# 更新系统包
yum update -y  # CentOS/RHEL
apt-get update && apt-get upgrade -y  # Ubuntu/Debian

# 更新 Docker 镜像
docker-compose -f docker-compose.prod.yml pull
```

### 5. 监控日志

定期查看日志，发现异常：

```bash
# 查看最近 100 行日志
docker-compose -f docker-compose.prod.yml logs --tail=100

# 查看错误日志
docker-compose -f docker-compose.prod.yml logs | grep -i error
```

---

## 📊 性能优化

### 1. 启用 Gzip 压缩

已在 Nginx 配置中启用，无需额外配置。

### 2. 静态资源缓存

已在 Nginx 配置中设置，静态资源缓存 1 年。

### 3. 数据库优化

```bash
# 进入数据库容器
docker-compose -f docker-compose.prod.yml exec postgres psql -U nexus_user -d nexus_db

# 查看数据库大小
\l

# 查看表大小
SELECT pg_size_pretty(pg_total_relation_size('table_name'));
```

### 4. 监控资源使用

在宝塔 **监控** 中查看：
- CPU 使用率
- 内存使用率
- 磁盘使用率
- 网络流量

---

## 🎉 完成！

部署完成后，你可以：

- ✅ 访问前端：`http://你的域名` 或 `https://你的域名`
- ✅ 访问后端 API：`http://你的域名/api`
- ✅ 在宝塔面板中管理所有服务
- ✅ 使用 Docker 命令管理容器

## 📞 获取帮助

如果遇到问题：

1. 查看日志：`docker-compose -f docker-compose.prod.yml logs`
2. 检查服务状态：`docker-compose -f docker-compose.prod.yml ps`
3. 查看本文档的故障排除部分
4. 联系技术支持

---

**祝部署顺利！** 🚀










