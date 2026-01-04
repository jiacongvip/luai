# 后端架构规划方案

## 📊 方案对比

### 方案 A: Supabase 托管 (推荐 - 零服务器)
**服务器要求：❌ 不需要自己的服务器**

```
前端 → Supabase API (云端) → Supabase PostgreSQL (云端)
```

**优点：**
- ✅ 完全托管，无需维护服务器
- ✅ 免费额度：50,000 月活用户、500MB 数据库
- ✅ 自动备份、自动扩展
- ✅ 内置认证、实时订阅
- ✅ 中国可访问（有亚太节点）

**缺点：**
- ⚠️ 数据在第三方云上
- ⚠️ 超出免费额度后需要付费（$25/月起）

**成本：**
- 免费层：足够个人/小团队使用
- Pro: $25/月（适合中小型应用）

---

### 方案 B: 轻量级自托管 (最省资源)
**服务器要求：✅ 最低配置即可（1核1G内存）**

```
前端 → Node.js Express (你的服务器) → PostgreSQL/SQLite (你的服务器)
```

**技术栈：**
- **后端**: Node.js + Express (或 Fastify)
- **数据库**: 
  - 选项1: SQLite (零配置，适合小规模)
  - 选项2: PostgreSQL (你已有完整Schema)
- **部署**: 
  - 轻量: Railway / Fly.io (免费层)
  - 自托管: 任何 VPS (阿里云/腾讯云 2核2G 约 ¥50/月)

**优点：**
- ✅ 完全控制数据
- ✅ 成本可控（可低至免费）
- ✅ 资源占用小（SQLite 版本）

**缺点：**
- ⚠️ 需要自己维护服务器
- ⚠️ 需要处理备份、安全等

**推荐配置：**
```json
{
  "最低配置": "1核1G内存 (SQLite)",
  "推荐配置": "2核2G内存 (PostgreSQL)",
  "成本": "¥50-100/月 (国内VPS) 或 免费 (Railway/Fly.io)"
}
```

---

### 方案 C: 混合方案 (平衡)
**服务器要求：✅ 轻量级后端服务器**

```
前端 → 你的 Node.js 后端 (轻量) → Supabase 数据库 (云端)
```

**优点：**
- ✅ 后端逻辑自己控制（保护 API Key）
- ✅ 数据库托管（无需维护）
- ✅ 成本低（只用数据库服务）

**缺点：**
- ⚠️ 需要一个小服务器运行后端

---

## 🎯 我的推荐：方案 B (轻量级自托管)

考虑到你的需求，我推荐 **方案 B**：

### 为什么选择这个？
1. **资源占用极小** - SQLite 版本可以在 512MB 内存运行
2. **成本最低** - 可以用免费托管平台，或便宜的 VPS
3. **完全控制** - 数据、代码都在你手里
4. **已有 Schema** - 你的 PostgreSQL Schema 可以直接用

### 技术选型

#### 选项 1: SQLite (最简单)
```typescript
// 适合：个人使用、小团队 (< 1000 用户)
// 资源：512MB 内存即可
// 数据库：单个 .db 文件
```

#### 选项 2: PostgreSQL (推荐)
```typescript
// 适合：需要扩展、多用户
// 资源：1-2GB 内存
// 数据库：你的完整 Schema 可以直接用
```

---

## 📦 实施计划

### 阶段 1: 创建轻量级后端 (Node.js + Express)

**目录结构：**
```
backend/
├── src/
│   ├── index.ts          # 入口文件
│   ├── routes/           # API 路由
│   │   ├── auth.ts
│   │   ├── users.ts
│   │   ├── sessions.ts
│   │   └── messages.ts
│   ├── services/
│   │   └── gemini.ts     # AI 服务（保护 API Key）
│   ├── db/
│   │   ├── connection.ts # 数据库连接
│   │   └── migrations/   # 数据库迁移
│   └── middleware/
│       └── auth.ts       # JWT 认证
├── package.json
└── .env.example
```

**核心依赖：**
```json
{
  "express": "^4.18.2",
  "better-sqlite3": "^9.0.0",  // SQLite 版本
  // 或
  "pg": "^8.11.0",              // PostgreSQL 版本
  "jsonwebtoken": "^9.0.2",
  "@google/genai": "^1.34.0",
  "cors": "^2.8.5"
}
```

**资源占用：**
- **SQLite 版本**: ~50MB 内存
- **PostgreSQL 版本**: ~200MB 内存（不含数据库）

---

### 阶段 2: 迁移前端存储

**重构 `utils/storage.ts`：**
```typescript
// 从 LocalStorage 改为 API 调用
export const storage = {
  saveUser: async (user: User) => {
    await fetch('/api/users/me', { method: 'PATCH', body: JSON.stringify(user) });
  },
  loadUser: async (): Promise<User | null> => {
    const res = await fetch('/api/users/me');
    return res.json();
  },
  // ... 其他方法类似
};
```

---

### 阶段 3: 部署选项

#### 选项 A: 免费托管（推荐起步）
- **Railway**: 免费 $5 额度/月
- **Fly.io**: 免费 3 个小型实例
- **Render**: 免费层（有休眠限制）

#### 选项 B: 国内 VPS
- **阿里云/腾讯云**: 2核2G 约 ¥50-80/月
- **轻量应用服务器**: 适合个人项目

---

## 🚀 快速开始

我可以立即为你创建：

1. ✅ **轻量级 Node.js 后端项目结构**
2. ✅ **数据库连接层（SQLite + PostgreSQL 双支持）**
3. ✅ **API 路由（用户、会话、消息）**
4. ✅ **Gemini 服务封装（保护 API Key）**
5. ✅ **前端存储层重构（LocalStorage → API）**

**预计开发时间：**
- 后端基础结构：2-3 小时
- API 实现：4-6 小时
- 前端迁移：2-3 小时
- 总计：1-2 天完成

---

## ❓ 请确认

1. **选择数据库类型？**
   - [ ] SQLite (最简单，适合个人)
   - [ ] PostgreSQL (推荐，可扩展)

2. **部署偏好？**
   - [ ] 免费托管平台 (Railway/Fly.io)
   - [ ] 国内 VPS (阿里云/腾讯云)
   - [ ] 本地开发先

3. **是否现在开始？**
   - [ ] 是，创建后端项目结构
   - [ ] 否，先了解更多细节

