#!/bin/bash

# Nexus 项目 Docker 启动脚本

echo "🚀 启动 Nexus 项目..."

# 检查 .env 文件
if [ ! -f .env ]; then
    echo "⚠️  未找到 .env 文件，从 .env.example 创建..."
    cp .env.example .env
    echo "📝 请编辑 .env 文件，填入 GEMINI_API_KEY 和 JWT_SECRET"
    echo "   然后重新运行此脚本"
    exit 1
fi

# 检查必要的环境变量
source .env
if [ -z "$GEMINI_API_KEY" ]; then
    echo "❌ 错误: GEMINI_API_KEY 未设置"
    echo "   请在 .env 文件中设置 GEMINI_API_KEY"
    exit 1
fi

if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "your-super-secret-jwt-key-change-this-in-production" ]; then
    echo "⚠️  警告: JWT_SECRET 使用默认值，生产环境请更改！"
fi

# 启动 Docker 服务
echo "🐳 启动 Docker 服务..."
docker-compose up -d

# 等待数据库就绪
echo "⏳ 等待数据库就绪..."
sleep 5

# 检查数据库健康状态
for i in {1..30}; do
    if docker-compose exec -T postgres pg_isready -U nexus_user -d nexus_db > /dev/null 2>&1; then
        echo "✅ 数据库已就绪"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ 数据库启动超时"
        exit 1
    fi
    sleep 1
done

# 运行数据库迁移
echo "🔄 运行数据库迁移..."
docker-compose exec -T backend npm run migrate

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 所有服务已启动！"
    echo ""
    echo "📊 服务状态:"
    docker-compose ps
    echo ""
    echo "🌐 访问地址:"
    echo "   - 后端 API: http://localhost:3001"
    echo "   - 数据库: localhost:5432"
    echo ""
    echo "📝 查看日志: docker-compose logs -f"
    echo "🛑 停止服务: docker-compose down"
else
    echo "❌ 数据库迁移失败"
    echo "   查看日志: docker-compose logs backend"
    exit 1
fi

