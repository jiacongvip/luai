# 🐳 Docker 快速启动指南

使用 Docker 可以一键启动整个开发环境，无需手动安装 PostgreSQL！

## 🚀 快速开始

### 1. 配置环境变量

复制环境变量模板：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入你的配置：

```env
JWT_SECRET=your-super-secret-jwt-key-change-this
GEMINI_API_KEY=your-gemini-api-key-here
VITE_API_URL=http://localhost:3001/api
```

### 2. 启动所有服务

```bash
docker-compose up -d
```

这会启动：
- ✅ PostgreSQL 数据库（端口 5432）
- ✅ 后端 API 服务（端口 3001）

### 3. 运行数据库迁移

等待服务启动后（约 10-20 秒），运行迁移：

```bash
# 方式 1: 在容器内运行
docker-compose exec backend npm run migrate

# 方式 2: 本地运行（需要先安装依赖）
cd backend
npm install
npm run migrate
```

### 4. 查看日志

```bash
# 查看所有服务日志
docker-compose logs -f

# 只看后端日志
docker-compose logs -f backend

# 只看数据库日志
docker-compose logs -f postgres
```

### 5. 启动前端

在另一个终端：

```bash
npm install
npm run dev
```

前端将在 `http://localhost:3000` 运行。

## 📋 常用命令

### 启动服务
```bash
docker-compose up -d          # 后台启动
docker-compose up              # 前台启动（查看日志）
```

### 停止服务
```bash
docker-compose down            # 停止并删除容器
docker-compose stop            # 只停止，不删除
```

### 重启服务
```bash
docker-compose restart         # 重启所有服务
docker-compose restart backend # 只重启后端
```

### 查看状态
```bash
docker-compose ps              # 查看运行状态
docker-compose logs backend     # 查看后端日志
```

### 进入容器
```bash
docker-compose exec backend sh  # 进入后端容器
docker-compose exec postgres psql -U nexus_user -d nexus_db  # 进入数据库
```

### 重建服务
```bash
docker-compose build           # 重新构建镜像
docker-compose up -d --build   # 重建并启动
```

## 🔧 开发模式

### 热重载

后端代码修改后会自动重载（通过 `tsx watch`）。

如果需要手动重启：

```bash
docker-compose restart backend
```

### 数据库持久化

数据存储在 Docker volume `nexus_orchestrator_postgres_data` 中，即使删除容器，数据也不会丢失。

删除所有数据（谨慎操作）：

```bash
docker-compose down -v
```

## 🐛 故障排除

### 端口被占用

如果 5432 或 3001 端口被占用：

1. 修改 `docker-compose.yml` 中的端口映射
2. 或者停止占用端口的服务

### 数据库连接失败

检查数据库是否健康：

```bash
docker-compose ps
```

应该看到 `postgres` 服务的状态为 `healthy`。

### 后端无法启动

查看详细日志：

```bash
docker-compose logs backend
```

常见问题：
- 环境变量未设置（检查 `.env` 文件）
- 数据库未就绪（等待几秒后重试）

### 重新初始化数据库

```bash
# 停止服务
docker-compose down -v

# 重新启动
docker-compose up -d

# 运行迁移
docker-compose exec backend npm run migrate
```

## 📊 服务信息

| 服务 | 容器名 | 端口 | 说明 |
|------|--------|------|------|
| PostgreSQL | nexus-postgres | 5432 | 数据库 |
| Backend API | nexus-backend | 3001 | 后端服务 |

## 🔒 生产环境

**注意**: 这个 Docker 配置仅用于开发！

生产环境建议：
1. 使用独立的 PostgreSQL 服务（如 Supabase、Neon）
2. 使用更强的密码和 JWT_SECRET
3. 配置 HTTPS
4. 使用 Docker secrets 管理敏感信息
5. 配置资源限制

## 💡 提示

- 首次启动可能需要几分钟下载镜像
- 数据库初始化需要几秒钟
- 使用 `docker-compose logs -f` 实时查看日志
- 数据持久化在 volume 中，删除容器不会丢失数据
