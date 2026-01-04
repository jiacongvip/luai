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
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

