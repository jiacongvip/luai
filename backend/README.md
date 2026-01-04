# Nexus Backend API

轻量级 Node.js + Express + PostgreSQL 后端服务

## 🚀 快速开始

### 1. 安装依赖

```bash
cd backend
npm install
```

### 2. 配置环境变量

复制 `.env.example` 并创建 `.env` 文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入你的配置：

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# Database Configuration (PostgreSQL)
DATABASE_URL=postgresql://user:password@localhost:5432/nexus_db

# JWT Secret (生成一个随机字符串)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# Gemini API Key
GEMINI_API_KEY=your-gemini-api-key-here

# CORS Configuration
CORS_ORIGIN=http://localhost:3000
```

### 3. 设置数据库

#### 选项 A: 使用本地 PostgreSQL

1. 安装 PostgreSQL（如果还没有）
2. 创建数据库：
```sql
CREATE DATABASE nexus_db;
```

3. 运行迁移：
```bash
npm run migrate
```

#### 选项 B: 使用云端 PostgreSQL

推荐服务：
- **Supabase** (免费层可用)
- **Neon** (免费层可用)
- **Railway** (免费 $5 额度)

将 `DATABASE_URL` 设置为云数据库的连接字符串。

### 4. 启动开发服务器

```bash
npm run dev
```

服务器将在 `http://localhost:3001` 启动。

## 📁 项目结构

```
backend/
├── src/
│   ├── index.ts              # 入口文件
│   ├── routes/               # API 路由
│   │   ├── auth.ts          # 认证路由
│   │   ├── users.ts         # 用户路由
│   │   ├── sessions.ts      # 会话路由
│   │   ├── messages.ts      # 消息路由
│   │   └── agents.ts        # 智能体路由
│   ├── services/            # 业务逻辑
│   │   └── geminiService.ts # Gemini AI 服务
│   ├── middleware/          # 中间件
│   │   └── auth.ts          # JWT 认证
│   └── db/                  # 数据库
│       ├── connection.ts    # 数据库连接
│       └── migrate.ts       # 迁移脚本
├── package.json
├── tsconfig.json
└── README.md
```

## 🔌 API 端点

### 认证
- `POST /api/auth/register` - 注册
- `POST /api/auth/login` - 登录
- `GET /api/auth/me` - 获取当前用户

### 用户
- `GET /api/users/me` - 获取当前用户信息
- `PATCH /api/users/me` - 更新当前用户信息

### 会话
- `GET /api/sessions` - 获取所有会话
- `POST /api/sessions` - 创建新会话
- `GET /api/sessions/:id` - 获取会话详情
- `PATCH /api/sessions/:id` - 更新会话
- `DELETE /api/sessions/:id` - 删除会话

### 消息
- `GET /api/messages/session/:sessionId` - 获取会话消息
- `POST /api/messages/send` - 发送消息（流式响应）
- `PATCH /api/messages/:id/feedback` - 更新消息反馈

### 智能体
- `GET /api/agents` - 获取所有公开智能体
- `GET /api/agents/:id` - 获取单个智能体
- `POST /api/agents` - 创建智能体（需认证）
- `PATCH /api/agents/:id` - 更新智能体
- `DELETE /api/agents/:id` - 删除智能体

## 🛠️ 开发

### 开发模式（热重载）
```bash
npm run dev
```

### 构建
```bash
npm run build
```

### 生产模式
```bash
npm start
```

## 📦 部署

### 选项 A: Railway (推荐)

1. 在 Railway 创建新项目
2. 连接 GitHub 仓库
3. 设置环境变量
4. Railway 会自动部署

### 选项 B: Fly.io

```bash
fly launch
fly deploy
```

### 选项 C: 自托管 VPS

1. 在服务器上安装 Node.js 和 PostgreSQL
2. 克隆代码
3. 设置环境变量
4. 使用 PM2 运行：
```bash
npm install -g pm2
pm2 start dist/index.js --name nexus-backend
```

## 🔒 安全注意事项

1. **JWT_SECRET**: 生产环境必须使用强随机字符串
2. **DATABASE_URL**: 不要提交到版本控制
3. **GEMINI_API_KEY**: 保护 API Key，不要暴露在前端
4. **CORS**: 生产环境限制 `CORS_ORIGIN` 为你的前端域名

## 📊 数据库迁移

数据库 Schema 定义在 `../utils/postgresSchema.ts`。

运行迁移：
```bash
npm run migrate
```

## 🐛 故障排除

### 数据库连接失败
- 检查 `DATABASE_URL` 是否正确
- 确认 PostgreSQL 服务正在运行
- 检查防火墙设置

### JWT 认证失败
- 确认 `JWT_SECRET` 已设置
- 检查 token 是否过期
- 确认请求头包含 `Authorization: Bearer <token>`

### Gemini API 错误
- 检查 `GEMINI_API_KEY` 是否正确
- 确认 API Key 有足够配额
- 查看后端日志获取详细错误信息

