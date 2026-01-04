#!/bin/bash

# Nexus Agent Orchestrator 一键部署脚本
# 适用于宝塔面板

set -e

echo "🚀 开始部署 Nexus Agent Orchestrator..."

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装，请检查宝塔 Docker 服务是否启动"
    exit 1
fi

# 检查 Docker Compose 是否安装
if ! command -v docker-compose &> /dev/null; then
    echo "⚠️  Docker Compose 未安装，正在安装..."
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    echo "✅ Docker Compose 安装完成"
fi

# 检查环境变量文件
if [ ! -f ".env.prod" ]; then
    echo "⚠️  未找到 .env.prod 文件，正在从示例文件创建..."
    if [ -f "env.prod.example" ]; then
        cp env.prod.example .env.prod
        echo "✅ 已创建 .env.prod 文件，请编辑并填入正确的配置"
        echo "📝 编辑命令: nano .env.prod"
        exit 1
    else
        echo "❌ 未找到 env.prod.example 文件"
        exit 1
    fi
fi

# 停止旧容器（如果存在）
echo "🛑 停止旧容器..."
docker-compose -f docker-compose.prod.yml down 2>/dev/null || true

# 构建镜像
echo "🔨 构建 Docker 镜像..."
docker-compose -f docker-compose.prod.yml --env-file .env.prod build

# 启动服务
echo "🚀 启动服务..."
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 10

# 检查服务状态
echo "📊 检查服务状态..."
docker-compose -f docker-compose.prod.yml ps

# 运行数据库迁移
echo "🗄️  运行数据库迁移..."
docker-compose -f docker-compose.prod.yml exec -T backend npm run migrate || {
    echo "⚠️  数据库迁移失败，请手动执行:"
    echo "   docker-compose -f docker-compose.prod.yml exec backend npm run migrate"
}

echo ""
echo "✅ 部署完成！"
echo ""
echo "📋 服务信息："
echo "   - 前端: http://localhost:80"
echo "   - 后端: http://localhost:3001"
echo "   - 数据库: localhost:5432"
echo ""
echo "📝 常用命令："
echo "   查看日志: docker-compose -f docker-compose.prod.yml logs -f"
echo "   重启服务: docker-compose -f docker-compose.prod.yml restart"
echo "   停止服务: docker-compose -f docker-compose.prod.yml stop"
echo ""

