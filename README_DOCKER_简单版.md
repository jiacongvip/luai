# 🐳 Docker 一键启动指南（小白版）

## 📋 前置要求

1. **安装 Docker Desktop**
   - Mac: https://www.docker.com/products/docker-desktop
   - Windows: https://www.docker.com/products/docker-desktop
   - 安装后启动 Docker Desktop

2. **获取 Gemini API Key**
   - 访问: https://aistudio.google.com/apikey
   - 创建 API Key 并复制

## 🚀 三步启动

### 第一步：配置环境变量

1. 在项目根目录找到 `.env.example` 文件
2. 复制为 `.env` 文件
3. 打开 `.env` 文件，填入你的 `GEMINI_API_KEY`

```env
GEMINI_API_KEY=你的API密钥
```

### 第二步：运行启动脚本

**Mac/Linux:**
```bash
./一键启动.sh
```

**Windows:**
```bash
# 使用 Git Bash 或 WSL
bash 一键启动.sh
```

### 第三步：等待启动完成

脚本会自动：
- ✅ 启动数据库
- ✅ 启动后端服务
- ✅ 运行数据库迁移
- ✅ 显示访问地址

## 🌐 访问地址

启动成功后，访问：

- **用户端**: http://localhost:3000
- **管理后台**: http://localhost:3000/admin/login
- **后端 API**: http://localhost:3001

## 📝 常用命令

```bash
# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down

# 重启服务
docker-compose restart
```

## ❓ 常见问题

### 1. Docker 未启动
**错误**: `Cannot connect to the Docker daemon`
**解决**: 打开 Docker Desktop 应用

### 2. 端口被占用
**错误**: `port is already allocated`
**解决**: 
- 检查 3000、3001、5432 端口是否被占用
- 或者修改 `docker-compose.yml` 中的端口号

### 3. API Key 错误
**错误**: `GEMINI_API_KEY 未设置`
**解决**: 检查 `.env` 文件中的 API Key 是否正确

### 4. 数据库连接失败
**解决**: 等待 30-60 秒后重试，数据库需要时间启动

## 🎉 完成！

现在你可以：
1. 访问 http://localhost:3000 使用应用
2. 访问 http://localhost:3000/admin/login 登录管理后台

**默认管理员账户**: 需要先注册一个账户，然后在数据库中将其 `role` 设置为 `admin`

