#!/bin/bash

# Nexus Agent Orchestrator 一键安装脚本
# 适用于宝塔面板 - 全自动安装

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Nexus Agent Orchestrator 一键安装    ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""

# 检查是否为 root 用户
if [ "$EUID" -ne 0 ]; then 
    echo -e "${YELLOW}⚠️  建议使用 root 用户运行此脚本${NC}"
fi

# 1. 检查 Docker
echo -e "${GREEN}[1/8]${NC} 检查 Docker 环境..."
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker 未安装，请先在宝塔中启动 Docker 服务${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Docker 已安装${NC}"

# 2. 检查 Docker Compose
echo -e "${GREEN}[2/8]${NC} 检查 Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}⚠️  Docker Compose 未安装，正在安装...${NC}"
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    echo -e "${GREEN}✅ Docker Compose 安装完成${NC}"
else
    echo -e "${GREEN}✅ Docker Compose 已安装${NC}"
fi

# 3. 获取安装目录
INSTALL_DIR="/www/wwwroot/nexus-agent"
echo -e "${GREEN}[3/8]${NC} 设置安装目录: ${INSTALL_DIR}"

# 询问是否使用 Git 克隆
read -p "是否使用 Git 克隆项目？(y/n，默认n): " USE_GIT
if [ "$USE_GIT" = "y" ] || [ "$USE_GIT" = "Y" ]; then
    read -p "请输入 Git 仓库地址: " GIT_URL
    if [ -d "$INSTALL_DIR" ]; then
        echo -e "${YELLOW}⚠️  目录已存在，正在更新...${NC}"
        cd "$INSTALL_DIR"
        git pull || echo -e "${YELLOW}⚠️  Git 更新失败，继续使用现有文件${NC}"
    else
        echo -e "${GREEN}📥 正在克隆项目...${NC}"
        git clone "$GIT_URL" "$INSTALL_DIR" || {
            echo -e "${RED}❌ Git 克隆失败，请检查仓库地址${NC}"
            exit 1
        }
    fi
else
    if [ ! -d "$INSTALL_DIR" ]; then
        echo -e "${RED}❌ 项目目录不存在: ${INSTALL_DIR}${NC}"
        echo -e "${YELLOW}请先上传项目文件到 ${INSTALL_DIR}${NC}"
        exit 1
    fi
fi

cd "$INSTALL_DIR"
echo -e "${GREEN}✅ 项目目录: $(pwd)${NC}"

# 4. 检查必要文件
echo -e "${GREEN}[4/8]${NC} 检查必要文件..."
REQUIRED_FILES=("docker-compose.prod.yml" "Dockerfile" "backend/Dockerfile.prod")
for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo -e "${RED}❌ 缺少必要文件: $file${NC}"
        exit 1
    fi
done
echo -e "${GREEN}✅ 所有必要文件存在${NC}"

# 5. 配置环境变量
echo -e "${GREEN}[5/8]${NC} 配置环境变量..."
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
    openssl rand -base64 24 | tr -d "=+/" | cut -c1-24
}

generate_jwt_secret() {
    openssl rand -base64 32
}

# 读取现有配置或生成新配置
if ! grep -q "POSTGRES_PASSWORD=你的强密码" .env.prod 2>/dev/null; then
    echo -e "${YELLOW}⚠️  检测到已有配置，跳过自动生成${NC}"
else
    echo -e "${GREEN}🔐 正在生成安全配置...${NC}"
    
    # 生成数据库密码
    DB_PASSWORD=$(generate_password)
    sed -i "s/POSTGRES_PASSWORD=你的强密码/POSTGRES_PASSWORD=$DB_PASSWORD/" .env.prod
    
    # 生成 JWT 密钥
    JWT_SECRET=$(generate_jwt_secret)
    sed -i "s/JWT_SECRET=你的JWT密钥（至少32位随机字符串）/JWT_SECRET=$JWT_SECRET/" .env.prod
    
    echo -e "${GREEN}✅ 已生成随机密码和密钥${NC}"
fi

# 询问域名配置
read -p "请输入你的域名（如 nexus.example.com，直接回车跳过）: " DOMAIN
if [ ! -z "$DOMAIN" ]; then
    sed -i "s|VITE_API_URL=http://你的域名/api|VITE_API_URL=https://$DOMAIN/api|" .env.prod
    sed -i "s|CORS_ORIGIN=http://你的域名|CORS_ORIGIN=https://$DOMAIN|" .env.prod
    echo -e "${GREEN}✅ 已配置域名: $DOMAIN${NC}"
fi

# 询问 API 密钥
read -p "请输入 Gemini API 密钥（直接回车稍后配置）: " GEMINI_KEY
if [ ! -z "$GEMINI_KEY" ]; then
    sed -i "s/GEMINI_API_KEY=你的Gemini API密钥/GEMINI_API_KEY=$GEMINI_KEY/" .env.prod
    echo -e "${GREEN}✅ 已配置 Gemini API 密钥${NC}"
fi

# 6. 停止旧容器
echo -e "${GREEN}[6/8]${NC} 停止旧容器（如果存在）..."
docker-compose -f docker-compose.prod.yml down 2>/dev/null || true
echo -e "${GREEN}✅ 旧容器已清理${NC}"

# 7. 构建和启动
echo -e "${GREEN}[7/8]${NC} 构建 Docker 镜像..."
docker-compose -f docker-compose.prod.yml --env-file .env.prod build --no-cache

echo -e "${GREEN}[8/8]${NC} 启动服务..."
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d

# 等待服务启动
echo -e "${YELLOW}⏳ 等待服务启动（10秒）...${NC}"
sleep 10

# 8. 运行数据库迁移
echo -e "${GREEN}🗄️  运行数据库迁移...${NC}"
docker-compose -f docker-compose.prod.yml exec -T backend npm run migrate 2>/dev/null || {
    echo -e "${YELLOW}⚠️  数据库迁移失败，请手动执行:${NC}"
    echo -e "${YELLOW}   docker-compose -f docker-compose.prod.yml exec backend npm run migrate${NC}"
}

# 检查服务状态
echo ""
echo -e "${GREEN}📊 服务状态:${NC}"
docker-compose -f docker-compose.prod.yml ps

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          ✅ 安装完成！                 ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}📋 服务信息:${NC}"
echo -e "   - 前端: http://localhost:80"
echo -e "   - 后端: http://localhost:3001"
echo -e "   - 数据库: localhost:5432"
echo ""
echo -e "${GREEN}📝 下一步操作:${NC}"
echo -e "   1. 在宝塔中创建网站并配置反向代理"
echo -e "   2. 配置 SSL 证书（HTTPS）"
echo -e "   3. 访问你的域名开始使用"
echo ""
echo -e "${GREEN}📝 常用命令:${NC}"
echo -e "   查看日志: docker-compose -f docker-compose.prod.yml logs -f"
echo -e "   重启服务: docker-compose -f docker-compose.prod.yml restart"
echo -e "   停止服务: docker-compose -f docker-compose.prod.yml stop"
echo ""

