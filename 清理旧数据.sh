#!/bin/bash

echo "==================================="
echo "🧹 清理旧的 Nexus 数据卷和容器"
echo "==================================="
echo ""

# 1. 停止并删除旧容器
echo "📦 停止并删除旧的 Nexus 容器..."
docker-compose down 2>/dev/null || true
docker stop nexus-postgres nexus-backend 2>/dev/null || true
docker rm nexus-postgres nexus-backend 2>/dev/null || true

# 2. 查找并删除旧的 postgres_data 数据卷（仅 nexus 相关的）
echo ""
echo "🗑️  查找旧的 Nexus 数据卷..."

OLD_VOLUMES=$(docker volume ls --format "{{.Name}}" | grep -E "^postgres_data$|^nexus.*postgres_data$" || true)

if [ -z "$OLD_VOLUMES" ]; then
    echo "✅ 没有找到需要删除的旧数据卷"
else
    echo "找到以下旧数据卷："
    echo "$OLD_VOLUMES" | while read vol; do
        echo "  - $vol"
    done
    
    echo ""
    read -p "⚠️  确定要删除这些数据卷吗？这将永久删除数据！(yes/no): " confirm
    
    if [ "$confirm" = "yes" ]; then
        echo "$OLD_VOLUMES" | while read vol; do
            echo "删除数据卷: $vol"
            docker volume rm "$vol" 2>/dev/null || echo "  ⚠️  删除失败（可能正在使用中）"
        done
        echo "✅ 旧数据卷已删除"
    else
        echo "❌ 已取消删除"
    fi
fi

# 3. 显示当前状态
echo ""
echo "==================================="
echo "📊 当前状态"
echo "==================================="
echo ""
echo "剩余的数据卷："
docker volume ls | grep -E "nexus|postgres" || echo "  无"
echo ""
echo "运行的容器："
docker ps --filter "name=nexus" --format "table {{.Names}}\t{{.Status}}" || echo "  无"
echo ""
echo "✅ 清理完成！"
echo ""
echo "💡 提示：现在可以使用新配置启动服务："
echo "   docker-compose up -d"


