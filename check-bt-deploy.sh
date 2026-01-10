#!/bin/bash

# 宝塔部署检查脚本
# 用于检查部署环境和配置是否正确

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  宝塔 Docker 部署环境检查工具          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

ERRORS=0
WARNINGS=0

# 检查函数
check_pass() {
    echo -e "${GREEN}✅ $1${NC}"
}

check_fail() {
    echo -e "${RED}❌ $1${NC}"
    ((ERRORS++))
}

check_warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    ((WARNINGS++))
}

# 1. 检查 Docker
echo -e "${BLUE}[1/10]${NC} 检查 Docker..."
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    check_pass "Docker 已安装: $DOCKER_VERSION"
    
    if systemctl is-active --quiet docker 2>/dev/null || pgrep -x dockerd > /dev/null; then
        check_pass "Docker 服务正在运行"
    else
        check_fail "Docker 服务未运行，请在宝塔中启动 Docker"
    fi
else
    check_fail "Docker 未安装，请在宝塔软件商店中安装 Docker"
fi

# 2. 检查 Docker Compose
echo -e "${BLUE}[2/10]${NC} 检查 Docker Compose..."
if command -v docker-compose &> /dev/null; then
    COMPOSE_VERSION=$(docker-compose --version)
    check_pass "Docker Compose 已安装: $COMPOSE_VERSION"
else
    check_fail "Docker Compose 未安装"
    echo -e "${YELLOW}   安装命令:${NC}"
    echo "   curl -L \"https://github.com/docker/compose/releases/latest/download/docker-compose-\$(uname -s)-\$(uname -m)\" -o /usr/local/bin/docker-compose"
    echo "   chmod +x /usr/local/bin/docker-compose"
fi

# 3. 检查项目目录
echo -e "${BLUE}[3/10]${NC} 检查项目目录..."
if [ -d "/www/wwwroot/nexus-agent" ]; then
    check_pass "项目目录存在: /www/wwwroot/nexus-agent"
    cd /www/wwwroot/nexus-agent
else
    check_warn "项目目录不存在: /www/wwwroot/nexus-agent"
    if [ -d "./" ] && [ -f "docker-compose.prod.yml" ]; then
        check_pass "当前目录包含项目文件"
        cd .
    else
        check_fail "未找到项目文件，请先上传或克隆项目"
    fi
fi

PROJECT_DIR=$(pwd)

# 4. 检查必要文件
echo -e "${BLUE}[4/10]${NC} 检查必要文件..."
REQUIRED_FILES=(
    "docker-compose.prod.yml"
    "Dockerfile"
    "backend/Dockerfile.prod"
    "env.prod.example"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        check_pass "文件存在: $file"
    else
        check_fail "文件缺失: $file"
    fi
done

# 5. 检查环境变量文件
echo -e "${BLUE}[5/10]${NC} 检查环境变量配置..."
if [ -f ".env.prod" ]; then
    check_pass "环境变量文件存在: .env.prod"
    
    # 检查关键配置
    if grep -q "POSTGRES_PASSWORD=你的强密码" .env.prod 2>/dev/null; then
        check_fail "数据库密码未修改（仍为默认值）"
    elif grep -q "POSTGRES_PASSWORD=" .env.prod 2>/dev/null; then
        check_pass "数据库密码已配置"
    else
        check_fail "数据库密码未配置"
    fi
    
    if grep -q "JWT_SECRET=你的JWT密钥" .env.prod 2>/dev/null; then
        check_fail "JWT 密钥未修改（仍为默认值）"
    elif grep -q "JWT_SECRET=" .env.prod 2>/dev/null; then
        check_pass "JWT 密钥已配置"
    else
        check_fail "JWT 密钥未配置"
    fi
    
    if grep -q "GEMINI_API_KEY=你的Gemini API密钥" .env.prod 2>/dev/null; then
        check_warn "Gemini API 密钥未配置"
    elif grep -q "GEMINI_API_KEY=" .env.prod 2>/dev/null; then
        check_pass "Gemini API 密钥已配置"
    else
        check_warn "Gemini API 密钥未配置"
    fi
else
    check_fail "环境变量文件不存在: .env.prod"
    echo -e "${YELLOW}   创建命令:${NC}"
    echo "   cp env.prod.example .env.prod"
    echo "   nano .env.prod"
fi

# 6. 检查端口占用
echo -e "${BLUE}[6/10]${NC} 检查端口占用..."
check_port() {
    local port=$1
    local name=$2
    if command -v netstat &> /dev/null; then
        if netstat -tlnp 2>/dev/null | grep -q ":$port "; then
            local process=$(netstat -tlnp 2>/dev/null | grep ":$port " | awk '{print $7}' | head -1)
            if echo "$process" | grep -q "docker"; then
                check_pass "端口 $port ($name) 被 Docker 使用"
            else
                check_warn "端口 $port ($name) 被其他进程占用: $process"
            fi
        else
            check_pass "端口 $port ($name) 可用"
        fi
    elif command -v ss &> /dev/null; then
        if ss -tlnp 2>/dev/null | grep -q ":$port "; then
            local process=$(ss -tlnp 2>/dev/null | grep ":$port " | awk '{print $6}' | head -1)
            if echo "$process" | grep -q "docker"; then
                check_pass "端口 $port ($name) 被 Docker 使用"
            else
                check_warn "端口 $port ($name) 被其他进程占用: $process"
            fi
        else
            check_pass "端口 $port ($name) 可用"
        fi
    else
        check_warn "无法检查端口占用（netstat/ss 未安装）"
    fi
}

check_port 80 "前端"
check_port 3001 "后端"
check_port 5432 "数据库"

# 7. 检查磁盘空间
echo -e "${BLUE}[7/10]${NC} 检查磁盘空间..."
if command -v df &> /dev/null; then
    AVAILABLE=$(df -BG "$PROJECT_DIR" | tail -1 | awk '{print $4}' | sed 's/G//')
    if [ "$AVAILABLE" -ge 10 ]; then
        check_pass "磁盘空间充足: ${AVAILABLE}GB 可用"
    else
        check_warn "磁盘空间可能不足: ${AVAILABLE}GB 可用（建议至少 10GB）"
    fi
else
    check_warn "无法检查磁盘空间"
fi

# 8. 检查内存
echo -e "${BLUE}[8/10]${NC} 检查内存..."
if command -v free &> /dev/null; then
    MEM_AVAILABLE=$(free -m | awk 'NR==2{printf "%.0f", $7}')
    if [ "$MEM_AVAILABLE" -ge 2048 ]; then
        check_pass "内存充足: ${MEM_AVAILABLE}MB 可用"
    else
        check_warn "内存可能不足: ${MEM_AVAILABLE}MB 可用（建议至少 2GB）"
    fi
else
    check_warn "无法检查内存"
fi

# 9. 检查 Docker 容器状态
echo -e "${BLUE}[9/10]${NC} 检查 Docker 容器状态..."
if command -v docker &> /dev/null && systemctl is-active --quiet docker 2>/dev/null; then
    if docker ps -a --format "{{.Names}}" | grep -q "nexus-"; then
        check_pass "发现 Nexus 相关容器"
        echo ""
        echo -e "${BLUE}容器状态:${NC}"
        docker ps -a --filter "name=nexus-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    else
        check_pass "未发现运行中的容器（首次部署）"
    fi
else
    check_warn "无法检查容器状态（Docker 未运行）"
fi

# 10. 检查网络连接
echo -e "${BLUE}[10/10]${NC} 检查网络连接..."
if ping -c 1 -W 2 8.8.8.8 &> /dev/null; then
    check_pass "网络连接正常"
else
    check_warn "网络连接可能有问题（无法 ping 通 8.8.8.8）"
fi

# 总结
echo ""
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           检查完成                     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ 所有检查通过！可以开始部署了。${NC}"
    echo ""
    echo -e "${GREEN}下一步操作:${NC}"
    echo "  1. 如果还未配置 .env.prod，请先配置: nano .env.prod"
    echo "  2. 运行部署脚本: ./install.sh 或 ./deploy.sh"
    echo "  3. 在宝塔中配置反向代理"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠️  有 $WARNINGS 个警告，但可以继续部署${NC}"
    echo ""
    echo -e "${GREEN}下一步操作:${NC}"
    echo "  1. 检查警告项并根据需要修复"
    echo "  2. 运行部署脚本: ./install.sh 或 ./deploy.sh"
    exit 0
else
    echo -e "${RED}❌ 发现 $ERRORS 个错误，$WARNINGS 个警告${NC}"
    echo ""
    echo -e "${RED}请先修复错误后再继续部署${NC}"
    exit 1
fi










