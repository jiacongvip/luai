# 🚀 快速开始指南

## 🐳 方式一：使用 Docker（推荐）

如果你安装了 Docker，这是最简单的方式：

```bash
# 1. 配置环境变量
cp .env.example .env
# 编辑 .env，填入 GEMINI_API_KEY 和 JWT_SECRET

# 2. 启动所有服务（数据库 + 后端）
docker-compose up -d

# 3. 等待服务启动后，运行数据库迁移
docker-compose exec backend npm run migrate

# 4. 启动前端（新终端）
npm install
npm run dev
```

详细说明请查看 [DOCKER_SETUP.md](./DOCKER_SETUP.md)

---

## 📦 方式二：手动安装

### 第一步：设置后端

### 1. 安装依赖

```bash
cd backend
npm install
```

### 2. 配置环境变量

创建 `backend/.env` 文件：

```env
PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://user:password@localhost:5432/nexus_db
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_EXPIRES_IN=7d
GEMINI_API_KEY=your-gemini-api-key-here
CORS_ORIGIN=http://localhost:3000
```

### 3. 设置数据库

#### 选项 A: 本地 PostgreSQL

```bash
# 创建数据库
createdb nexus_db

# 运行迁移
npm run migrate
```

#### 选项 B: 使用 Supabase (云端，免费)

1. 访问 [Supabase](https://supabase.com)
2. 创建新项目
3. 复制数据库连接字符串到 `DATABASE_URL`
4. 运行迁移：
```bash
npm run migrate
```

### 4. 启动后端

```bash
npm run dev
```

后端将在 `http://localhost:3001` 运行。

## 第二步：设置前端

### 1. 安装依赖（如果还没安装）

```bash
# 在项目根目录
npm install
```

### 2. 配置环境变量

创建 `.env` 文件（在项目根目录）：

```env
VITE_API_URL=http://localhost:3001/api
GEMINI_API_KEY=your-gemini-api-key-here
```

**注意**: 前端不再直接使用 Gemini API Key，但保留这个变量以防需要。

### 3. 启动前端

```bash
npm run dev
```

前端将在 `http://localhost:3000` 运行。

## 第三步：测试

1. 打开浏览器访问 `http://localhost:3000`
2. 注册一个新账户
3. 登录
4. 开始使用！

## 🔧 常见问题

### 后端无法启动

**问题**: `DATABASE_URL` 连接失败

**解决**:
- 检查 PostgreSQL 是否运行: `pg_isready`
- 确认数据库名称、用户名、密码正确
- 检查防火墙设置

### 前端无法连接后端

**问题**: CORS 错误或 404

**解决**:
- 确认后端在 `http://localhost:3001` 运行
- 检查 `VITE_API_URL` 是否正确
- 确认后端 CORS 配置允许 `http://localhost:3000`

### 数据库迁移失败

**问题**: 表已存在错误

**解决**:
- 这是正常的，迁移脚本会跳过已存在的表
- 如果想重新创建，先删除数据库再运行迁移

## 📝 下一步

- 查看 [DEPLOYMENT.md](./DEPLOYMENT.md) 了解生产环境部署
- 查看 [backend/README.md](./backend/README.md) 了解 API 文档
- 查看 [BACKEND_PLAN.md](./BACKEND_PLAN.md) 了解架构设计

## 🎉 完成！

现在你的应用已经：
- ✅ 后端 API 运行在 `http://localhost:3001`
- ✅ 前端运行在 `http://localhost:3000`
- ✅ 数据库已配置
- ✅ 认证系统已就绪
- ✅ Gemini API 已集成（API Key 在后端保护）

开始开发吧！

