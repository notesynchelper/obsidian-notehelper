# 构建阶段
FROM node:22-bullseye-slim AS builder
RUN apt-get update && apt-get install -y build-essential g++ make python3 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# 第一步：只复制 package 文件（利用缓存层）
COPY package*.json ./

# 第二步：安装依赖（只有依赖文件变化时才重新执行）
RUN npm install --production

# 第三步：复制其他源代码文件（JS 文件变化只影响这一层）
COPY *.js ./
COPY *.md ./

# 运行阶段
FROM node:22-bullseye-slim

WORKDIR /app
# 复制所有文件包括node_modules
COPY --from=builder /app .

# 创建非 root 用户 (Debian/Ubuntu 语法)
RUN groupadd --gid 1001 nodejs
RUN useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home nodejs

# 设置目录权限
RUN chown -R nodejs:nodejs /app

USER nodejs

CMD ["npm", "start"]