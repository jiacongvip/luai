# 部署指南

## 📋 前置要求

- Node.js 18+ 
- PostgreSQL 12+ (或使用云端 PostgreSQL)
- Gemini API Key

## 🚀 快速部署步骤

### 1. 后端部署

#### 选项 A: Railway (推荐 - 免费)

1. 访问 [Railway](https://railway.app)
2. 创建新项目，连接 GitHub 仓库
3. 添加 PostgreSQL 服务
4. 设置环境变量：
   ```
   DATABASE_URL=<railway提供的数据库URL>
   JWT_SECRET=<生成随机字符串>
   GEMINI_API_KEY=<你的API Key>
   CORS_ORIGIN=<你的前端域名>
   ```
5. 部署完成！

#### 选项 B: Fly.io (免费)

```bash
cd backend
fly launch
# 按照提示设置环境变量
fly deploy
```

#### 选项 C: 自托管 VPS

1. 在服务器上安装 Node.js 和 PostgreSQL
2. 克隆代码
3. 设置环境变量（创建 `.env` 文件）
4. 运行数据库迁移：
   ```bash
   npm run migrate
   ```
5. 使用 PM2 运行：
   ```bash
   npm install -g pm2
   npm run build
   pm2 start dist/index.js --name nexus-backend
   ```

### 2. 前端部署

#### 选项 A: Vercel (推荐 - 免费)

1. 访问 [Vercel](https://vercel.com)
2. 导入 GitHub 仓库
3. 设置环境变量：
   ```
   VITE_API_URL=<你的后端API地址>
   ```
4. 部署完成！

#### 选项 B: Netlify

类似 Vercel，设置环境变量后部署。

#### 选项 C: 静态托管

```bash
npm run build
# 将 dist/ 目录上传到你的静态托管服务
```

### 3. 数据库迁移

在部署后端后，运行迁移：

```bash
cd backend
npm run migrate
```

这会创建所有必要的数据库表。

## 🔧 环境变量配置

### 后端 (.env)

```env
PORT=3001
NODE_ENV=production
DATABASE_URL=postgresql://user:password@host:port/database
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=7d
GEMINI_API_KEY=your-gemini-api-key
CORS_ORIGIN=https://your-frontend-domain.com
```

### 前端 (.env)

```env
VITE_API_URL=https://your-backend-api.com/api
```

## 📊 资源要求

### 最小配置（SQLite 版本）
- CPU: 1 核
- 内存: 512MB
- 存储: 1GB

### 推荐配置（PostgreSQL）
- CPU: 2 核
- 内存: 2GB
- 存储: 10GB

## 🔒 安全建议

1. **JWT_SECRET**: 使用强随机字符串（至少 32 字符）
2. **数据库密码**: 使用强密码
3. **HTTPS**: 生产环境必须使用 HTTPS
4. **CORS**: 限制为你的前端域名
5. **API Key**: 不要提交到版本控制

## 🐛 故障排除

### 后端无法连接数据库
- 检查 `DATABASE_URL` 是否正确
- 确认数据库服务正在运行
- 检查防火墙规则

### 前端无法连接后端
- 检查 `VITE_API_URL` 是否正确
- 确认后端 CORS 配置允许前端域名
- 检查网络连接

### 认证失败
- 确认 JWT_SECRET 已正确设置
- 检查 token 是否过期
- 查看后端日志获取详细错误

## 📝 生产环境检查清单

- [ ] 设置强 JWT_SECRET
- [ ] 配置 HTTPS
- [ ] 限制 CORS 域名
- [ ] 设置数据库备份
- [ ] 配置日志监控
- [ ] 设置错误追踪（如 Sentry）
- [ ] 配置速率限制
- [ ] 设置健康检查端点

