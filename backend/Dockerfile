FROM node:18-alpine

WORKDIR /app

# 安装必要的工具
RUN apk add --no-cache git

# 复制 package 文件
COPY package*.json ./

# 安装所有依赖（包括 devDependencies）
RUN npm install

# 复制源代码
COPY . .

# 确保 node_modules 存在（如果 volume 挂载覆盖了，需要重新安装）
RUN if [ ! -d "node_modules/tsx" ]; then npm install; fi

# 暴露端口
EXPOSE 3001

# 启动命令（开发模式使用 tsx watch）
CMD ["npm", "run", "dev"]

