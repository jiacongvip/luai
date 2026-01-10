# 📤 GitHub 上传指南

## 🤔 需要上传到 GitHub 吗？

### ✅ 需要 GitHub 的部署方式

以下部署方式**必须**使用 GitHub：

1. **☁️ 云平台一键部署**
   - Railway、Vercel、Render 等都需要连接 GitHub 仓库
   - 自动从 GitHub 拉取代码并部署

2. **🚀 一键远程部署脚本**
   - 脚本会从 GitHub 拉取代码
   - 需要仓库地址

### ❌ 不需要 GitHub 的部署方式

以下方式**不需要** GitHub：

1. **📦 宝塔本地部署**
   - 可以直接上传压缩包
   - 或使用宝塔文件管理器上传

2. **🐳 Docker 手动部署**
   - 可以本地构建镜像
   - 或上传文件到服务器

3. **⚙️ PM2 部署**
   - 可以直接上传文件
   - 或使用 SCP/FTP

---

## 📤 上传到 GitHub 的步骤

### 方式1：使用命令行（推荐）

#### 1. 检查当前状态

```bash
# 查看当前状态
git status

# 查看远程仓库
git remote -v
```

#### 2. 添加新文件

```bash
# 添加所有新文件和修改
git add .

# 或选择性添加
git add 宝塔Docker部署完整指南.md
git add 一键远程部署.sh
git add 云平台一键部署.md
# ... 其他文件
```

#### 3. 提交更改

```bash
# 提交更改
git commit -m "添加多种快速部署方案和文档"

# 提交信息示例：
# - "添加宝塔部署文档和脚本"
# - "添加云平台一键部署指南"
# - "添加一键远程部署脚本"
```

#### 4. 推送到 GitHub

```bash
# 推送到远程仓库
git push origin main

# 如果是第一次推送
git push -u origin main
```

---

### 方式2：使用 GitHub Desktop（图形界面）

1. **下载 GitHub Desktop**
   - 访问 https://desktop.github.com
   - 下载并安装

2. **打开项目**
   - 打开 GitHub Desktop
   - File → Add Local Repository
   - 选择项目目录

3. **提交更改**
   - 在左侧看到所有更改
   - 勾选要提交的文件
   - 填写提交信息
   - 点击 "Commit to main"

4. **推送到 GitHub**
   - 点击 "Push origin"
   - 等待上传完成

---

### 方式3：在 GitHub 网页创建新仓库

如果还没有远程仓库：

1. **创建新仓库**
   - 访问 https://github.com/new
   - 填写仓库名称：`nexus-agent-orchestrator`
   - 选择 Public 或 Private
   - **不要**勾选 "Initialize with README"（因为本地已有代码）

2. **连接本地仓库**

```bash
# 如果还没有远程仓库，添加远程仓库
git remote add origin https://github.com/你的用户名/nexus-agent-orchestrator.git

# 推送代码
git branch -M main
git push -u origin main
```

---

## 📝 推荐提交的文件

### 必须提交的文件

```bash
# 部署文档
git add 宝塔Docker部署完整指南.md
git add 宝塔部署快速参考.md
git add 宝塔部署说明.md
git add 云平台一键部署.md
git add PM2部署方案.md
git add 所有部署方式汇总.md

# 部署脚本
git add 一键远程部署.sh
git add check-bt-deploy.sh
git add install.sh
git add deploy.sh

# 配置文件
git add docker-compose.prod.yml
git add env.prod.example
git add Dockerfile
git add backend/Dockerfile.prod
```

### 不应该提交的文件

这些文件已经在 `.gitignore` 中：

- `node_modules/`
- `dist/`
- `.env` 和 `.env.prod`（包含敏感信息）
- `*.log`

---

## 🔒 安全注意事项

### ⚠️ 不要提交敏感信息

确保以下文件**不要**提交：

```bash
# 检查是否有敏感文件
git status

# 如果看到这些文件，不要提交：
# - .env
# - .env.prod
# - .env.local
# - 包含密码、API密钥的文件
```

### ✅ 使用 .gitignore

`.gitignore` 文件已经配置好了，会自动忽略：
- 环境变量文件
- node_modules
- 构建产物
- 日志文件

---

## 🚀 快速上传命令（一键）

```bash
# 1. 添加所有新文件
git add .

# 2. 提交更改
git commit -m "添加多种快速部署方案：宝塔、云平台、PM2等"

# 3. 推送到 GitHub
git push origin main
```

---

## 📋 上传后可以使用的功能

### 1. 一键远程部署

```bash
# 在服务器上运行
curl -fsSL https://raw.githubusercontent.com/你的用户名/nexus-agent-orchestrator/main/一键远程部署.sh | bash
```

### 2. 云平台自动部署

- Railway：连接 GitHub 后自动部署
- Vercel：连接 GitHub 后自动部署
- Render：连接 GitHub 后自动部署

### 3. GitHub Actions 自动部署（可选）

可以配置 GitHub Actions 实现：
- 自动测试
- 自动构建
- 自动部署

---

## 🐛 常见问题

### 问题1：推送被拒绝

```bash
# 先拉取远程更改
git pull origin main --rebase

# 然后再推送
git push origin main
```

### 问题2：大文件上传失败

```bash
# 检查文件大小
git ls-files | xargs ls -lh | sort -k5 -hr | head -10

# 如果文件太大，考虑使用 Git LFS
git lfs install
git lfs track "*.zip"
git lfs track "*.tar.gz"
```

### 问题3：忘记添加 .gitignore

```bash
# 如果已经提交了不应该提交的文件
git rm --cached .env
git rm --cached .env.prod
git commit -m "移除敏感文件"
git push origin main
```

---

## ✅ 上传检查清单

上传前确认：

- [ ] 已检查 `.gitignore` 配置
- [ ] 没有提交 `.env` 等敏感文件
- [ ] 提交信息清晰明了
- [ ] 已测试代码可以正常运行
- [ ] 文档完整（部署指南等）

---

## 🎉 完成！

上传完成后，你就可以：

1. ✅ 使用一键远程部署脚本
2. ✅ 使用云平台自动部署
3. ✅ 分享代码给其他人
4. ✅ 使用 GitHub 的版本控制功能

---

## 📞 需要帮助？

如果遇到问题：

1. 查看 Git 状态：`git status`
2. 查看错误信息：`git push` 的输出
3. 检查远程仓库：`git remote -v`
4. 查看 Git 日志：`git log --oneline`

