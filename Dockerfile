# 前端生产环境 Dockerfile
FROM node:18-alpine AS frontend-builder

WORKDIR /app

# 复制前端文件
COPY package*.json ./
COPY vite.config.ts ./
COPY tsconfig.json ./
COPY index.html ./
COPY index.tsx ./
COPY App.tsx ./
COPY components ./components
COPY views ./views
COPY utils ./utils
COPY services ./services
COPY types.ts ./
COPY constants.ts ./
COPY metadata.json ./

# 安装依赖并构建
RUN npm ci && npm run build

# 生产环境 Nginx
FROM nginx:alpine

# 复制构建产物
COPY --from=frontend-builder /app/dist /usr/share/nginx/html

# 复制 Nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf.template

# 创建启动脚本，动态替换端口和后端地址
RUN echo '#!/bin/sh' > /docker-entrypoint.sh && \
    echo 'PORT=${PORT:-80}' >> /docker-entrypoint.sh && \
    echo 'BACKEND_URL=${BACKEND_URL:-http://localhost:3001}' >> /docker-entrypoint.sh && \
    echo 'echo "=== Nginx Configuration ==="' >> /docker-entrypoint.sh && \
    echo 'echo "PORT=$PORT"' >> /docker-entrypoint.sh && \
    echo 'echo "BACKEND_URL=$BACKEND_URL"' >> /docker-entrypoint.sh && \
    echo 'sed -e "s/\${PORT}/$PORT/g" -e "s|\${BACKEND_URL}|$BACKEND_URL|g" /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf' >> /docker-entrypoint.sh && \
    echo 'echo "=== Generated Nginx Config ==="' >> /docker-entrypoint.sh && \
    echo 'grep "listen" /etc/nginx/conf.d/default.conf' >> /docker-entrypoint.sh && \
    echo 'echo "=== Starting Nginx ==="' >> /docker-entrypoint.sh && \
    echo 'exec nginx -g "daemon off;"' >> /docker-entrypoint.sh && \
    chmod +x /docker-entrypoint.sh

EXPOSE 80

CMD ["/docker-entrypoint.sh"]

