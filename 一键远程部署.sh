#!/bin/bash

# ============================================
# Nexus Agent Orchestrator 一键远程部署脚本
# 从 GitHub 直接拉取并自动部署（最快速）
# ============================================

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Nexus Agent 一键远程部署              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# 配置
INSTALL_DIR="/www/wwwroot/nexus-agent"
GIT_REPO="${GIT_REPO:-}"  # 从环境变量读取，或稍后询问

# 检查是否为 root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${YELLOW}⚠️  建议使用 root 用户运行${NC}"
fi

# 1. 检查 Docker
echo -e "${GREEN}[1/6]${NC} 检查 Docker 环境..."
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker 未安装${NC}"
    echo -e "${YELLOW}正在尝试安装 Docker...${NC}"
    
    # 尝试安装 Docker
    if command -v yum &> /dev/null; then
        yum install -y docker
        systemctl start docker
        systemctl enable docker
    elif command -v apt-get &> /dev/null; then
        apt-get update
        apt-get install -y docker.io
        systemctl start docker
        systemctl enable docker
    else
        echo -e "${RED}❌ 无法自动安装 Docker，请手动安装${NC}"
        exit 1
    fi
fi

if ! systemctl is-active --quiet docker 2>/dev/null; then
    systemctl start docker
fi
echo -e "${GREEN}✅ Docker 已就绪${NC}"

# 2. 检查 Docker Compose
echo -e "${GREEN}[2/6]${NC} 检查 Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}正在安装 Docker Compose...${NC}"
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi
echo -e "${GREEN}✅ Docker Compose 已就绪${NC}"

# 3. 获取 Git 仓库地址
if [ -z "$GIT_REPO" ]; then
    echo ""
    echo -e "${YELLOW}请输入 Git 仓库地址（支持 GitHub、GitLab、Gitee 等）${NC}"
    echo -e "${YELLOW}例如: https://github.com/username/nexus-agent-orchestrator.git${NC}"
    read -p "Git 仓库地址: " GIT_REPO
    
    if [ -z "$GIT_REPO" ]; then
        echo -e "${RED}❌ Git 仓库地址不能为空${NC}"
        exit 1
    fi
fi

# 4. 克隆或更新项目
echo -e "${GREEN}[3/6]${NC} 获取项目代码..."
if [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}目录已存在，正在更新...${NC}"
    cd "$INSTALL_DIR"
    git pull || {
        echo -e "${YELLOW}更新失败，尝试重新克隆...${NC}"
        cd ..
        rm -rf "$INSTALL_DIR"
        git clone "$GIT_REPO" "$INSTALL_DIR"
    }
else
    echo -e "${GREEN}正在克隆项目...${NC}"
    mkdir -p "$(dirname $INSTALL_DIR)"
    git clone "$GIT_REPO" "$INSTALL_DIR" || {
        echo -e "${RED}❌ Git 克隆失败，请检查仓库地址和网络连接${NC}"
        exit 1
    }
fi
cd "$INSTALL_DIR"
echo -e "${GREEN}✅ 代码已就绪${NC}"

# 5. 配置环境变量
echo -e "${GREEN}[4/6]${NC} 配置环境变量..."
if [ ! -f ".env.prod" ]; then
    if [ -f "env.prod.example" ]; then
        cp env.prod.example .env.prod
        echo -e "${GREEN}✅ 已创建 .env.prod 文件${NC}"
    else
        echo -e "${RED}❌ 未找到 env.prod.example 文件${NC}"
        exit 1
    fi
fi

# 生成随机密码
generate_password() {
    openssl rand -base64 24 | tr -d "=+/" | cut -c1-24 2>/dev/null || date +%s | sha256sum | base64 | head -c 24
}

generate_jwt_secret() {
    openssl rand -base64 32 2>/dev/null || date +%s | sha256sum | base64 | head -c 32
}

# 自动生成配置（如果使用默认值）
if grep -q "POSTGRES_PASSWORD=你的强密码" .env.prod 2>/dev/null; then
    DB_PASSWORD=$(generate_password)
    sed -i "s/POSTGRES_PASSWORD=你的强密码/POSTGRES_PASSWORD=$DB_PASSWORD/" .env.prod
    echo -e "${GREEN}✅ 已自动生成数据库密码${NC}"
fi

if grep -q "JWT_SECRET=你的JWT密钥" .env.prod 2>/dev/null; then
    JWT_SECRET=$(generate_jwt_secret)
    sed -i "s/JWT_SECRET=你的JWT密钥（至少32位随机字符串）/JWT_SECRET=$JWT_SECRET/" .env.prod
    echo -e "${GREEN}✅ 已自动生成 JWT 密钥${NC}"
fi

# 询问必要配置
echo ""
echo -e "${YELLOW}📝 需要配置以下信息：${NC}"

read -p "请输入 Gemini API 密钥（直接回车稍后配置）: " GEMINI_KEY
if [ ! -z "$GEMINI_KEY" ]; then
    sed -i "s/GEMINI_API_KEY=你的Gemini API密钥/GEMINI_API_KEY=$GEMINI_KEY/" .env.prod
    echo -e "${GREEN}✅ 已配置 Gemini API 密钥${NC}"
fi

read -p "请输入域名（直接回车稍后配置）: " DOMAIN
if [ ! -z "$DOMAIN" ]; then
    sed -i "s|VITE_API_URL=http://你的域名/api|VITE_API_URL=https://$DOMAIN/api|" .env.prod
    sed -i "s|CORS_ORIGIN=http://你的域名|CORS_ORIGIN=https://$DOMAIN|" .env.prod
    echo -e "${GREEN}✅ 已配置域名: $DOMAIN${NC}"
fi

# 6. 部署
echo -e "${GREEN}[5/6]${NC} 开始部署..."
chmod +x deploy.sh 2>/dev/null || true
chmod +x install.sh 2>/dev/null || true

# 使用 deploy.sh 或直接执行 docker-compose
if [ -f "deploy.sh" ]; then
    ./deploy.sh
else
    echo -e "${YELLOW}使用 Docker Compose 部署...${NC}"
    docker-compose -f docker-compose.prod.yml --env-file .env.prod down 2>/dev/null || true
    docker-compose -f docker-compose.prod.yml --env-file .env.prod build
    docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d
    sleep 10
    docker-compose -f docker-compose.prod.yml exec -T backend npm run migrate 2>/dev/null || true
fi

# 7. 验证
echo -e "${GREEN}[6/6]${NC} 验证部署..."
sleep 5
if docker-compose -f docker-compose.prod.yml ps | grep -q "Up"; then
    echo -e "${GREEN}✅ 部署成功！${NC}"
    echo ""
    echo -e "${GREEN}📊 服务状态:${NC}"
    docker-compose -f docker-compose.prod.yml ps
    echo ""
    echo -e "${GREEN}🌐 访问地址:${NC}"
    echo -e "   前端: http://localhost:80"
    echo -e "   后端: http://localhost:3001"
    echo ""
    echo -e "${GREEN}📝 下一步:${NC}"
    echo -e "   1. 在宝塔中配置反向代理（如果使用域名）"
    echo -e "   2. 配置 SSL 证书"
    echo -e "   3. 访问你的域名开始使用"
    echo ""
    echo -e "${GREEN}📝 常用命令:${NC}"
    echo -e "   查看日志: cd $INSTALL_DIR && docker-compose -f docker-compose.prod.yml logs -f"
    echo -e "   重启服务: cd $INSTALL_DIR && docker-compose -f docker-compose.prod.yml restart"
else
    echo -e "${RED}❌ 部署可能有问题，请检查日志${NC}"
    echo -e "${YELLOW}查看日志: cd $INSTALL_DIR && docker-compose -f docker-compose.prod.yml logs${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          ✅ 部署完成！                 ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"

