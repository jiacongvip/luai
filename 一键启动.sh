#!/bin/bash

# ============================================
# Nexus AI 一键启动脚本
# ============================================

echo "=========================================="
echo "🚀 Nexus AI 项目启动"
echo "=========================================="
echo ""

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ 错误: 未检测到 Docker"
    echo "   请先安装 Docker: https://www.docker.com/get-started"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! command -v docker compose &> /dev/null; then
    echo "❌ 错误: 未检测到 docker-compose"
    echo "   请确保 Docker Compose 已安装"
    exit 1
fi

# 检查 .env 文件
if [ ! -f .env ]; then
    echo "📝 创建 .env 文件..."
    cp .env.example .env
    echo ""
    echo "⚠️  重要: 请编辑 .env 文件，填入以下信息："
    echo "   1. GEMINI_API_KEY - 你的 Gemini API Key"
    echo "   2. JWT_SECRET - 随机字符串（可以使用默认值）"
    echo ""
    echo "   编辑完成后，重新运行此脚本"
    echo ""
    read -p "按回车键打开 .env 文件进行编辑..."
    
    # 尝试用默认编辑器打开
    if command -v code &> /dev/null; then
        code .env
    elif command -v nano &> /dev/null; then
        nano .env
    elif command -v vim &> /dev/null; then
        vim .env
    else
        echo "   请手动编辑 .env 文件"
    fi
    
    exit 0
fi

# 检查必要的环境变量
source .env
if [ -z "$GEMINI_API_KEY" ] || [ "$GEMINI_API_KEY" = "your-gemini-api-key-here" ]; then
    echo "❌ 错误: GEMINI_API_KEY 未设置或使用默认值"
    echo "   请在 .env 文件中设置你的 GEMINI_API_KEY"
    echo "   获取地址: https://aistudio.google.com/apikey"
    exit 1
fi

# 生成 JWT_SECRET（如果使用默认值）
if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "your-super-secret-jwt-key-change-this-in-production-please-use-a-strong-random-string" ]; then
    echo "🔐 生成随机 JWT_SECRET..."
    if command -v openssl &> /dev/null; then
        NEW_SECRET=$(openssl rand -base64 32)
        # 更新 .env 文件
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s/JWT_SECRET=.*/JWT_SECRET=$NEW_SECRET/" .env
        else
            sed -i "s/JWT_SECRET=.*/JWT_SECRET=$NEW_SECRET/" .env
        fi
        echo "✅ JWT_SECRET 已自动生成"
    else
        echo "⚠️  警告: 无法自动生成 JWT_SECRET，请手动设置"
    fi
fi

echo ""
echo "🐳 启动 Docker 服务..."
echo ""

# 停止可能存在的旧容器
docker-compose down 2>/dev/null || docker compose down 2>/dev/null

# 启动服务
if command -v docker-compose &> /dev/null; then
    docker-compose up -d
    DOCKER_COMPOSE_CMD="docker-compose"
else
    docker compose up -d
    DOCKER_COMPOSE_CMD="docker compose"
fi

if [ $? -ne 0 ]; then
    echo "❌ Docker 服务启动失败"
    echo "   请检查 Docker 是否正常运行: docker ps"
    exit 1
fi

echo ""
echo "⏳ 等待服务启动（这可能需要 30-60 秒）..."
echo ""

# 等待数据库就绪
for i in {1..60}; do
    if $DOCKER_COMPOSE_CMD exec -T postgres pg_isready -U nexus_user -d nexus_db > /dev/null 2>&1; then
        echo "✅ 数据库已就绪"
        break
    fi
    if [ $i -eq 60 ]; then
        echo "❌ 数据库启动超时"
        echo "   查看日志: $DOCKER_COMPOSE_CMD logs postgres"
        exit 1
    fi
    printf "."
    sleep 1
done

echo ""
echo "🔄 运行数据库迁移..."
$DOCKER_COMPOSE_CMD exec -T backend npm run migrate

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "✅ 所有服务已成功启动！"
    echo "=========================================="
    echo ""
    echo "📊 服务状态:"
    $DOCKER_COMPOSE_CMD ps
    echo ""
    echo "🌐 访问地址:"
    echo "   👤 用户端: http://localhost:3000"
    echo "   🔐 管理后台: http://localhost:3000/admin/login"
    echo "   🔧 后端 API: http://localhost:3001"
    echo ""
    echo "📝 常用命令:"
    echo "   查看日志: $DOCKER_COMPOSE_CMD logs -f"
    echo "   停止服务: $DOCKER_COMPOSE_CMD down"
    echo "   重启服务: $DOCKER_COMPOSE_CMD restart"
    echo ""
    echo "🎉 现在可以打开浏览器访问了！"
    echo ""
else
    echo ""
    echo "❌ 数据库迁移失败"
    echo "   查看日志: $DOCKER_COMPOSE_CMD logs backend"
    exit 1
fi

