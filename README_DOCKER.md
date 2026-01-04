# 🐳 Docker 一键启动

## 最简单的方式

### 1. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，至少填入：
- `GEMINI_API_KEY` - 你的 Gemini API Key
- `JWT_SECRET` - 随机字符串（至少32字符）

### 2. 一键启动

```bash
./start.sh
```

或者手动启动：

```bash
# 启动服务
docker-compose up -d

# 等待数据库就绪后，运行迁移
docker-compose exec backend npm run migrate
```

### 3. 启动前端

在另一个终端：

```bash
npm install
npm run dev
```

## ✅ 完成！

现在你可以：
- 访问前端: http://localhost:3000
- 访问后端 API: http://localhost:3001
- 查看日志: `docker-compose logs -f`

## 📋 常用命令

```bash
# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f backend

# 停止服务
docker-compose down

# 重启服务
docker-compose restart

# 进入后端容器
docker-compose exec backend sh

# 进入数据库
docker-compose exec postgres psql -U nexus_user -d nexus_db
```

## 🔧 故障排除

### 端口被占用

修改 `docker-compose.yml` 中的端口映射。

### 数据库连接失败

等待几秒后重试，数据库需要时间启动。

### 迁移失败

查看日志：
```bash
docker-compose logs backend
```

详细说明请查看 [DOCKER_SETUP.md](./DOCKER_SETUP.md)

