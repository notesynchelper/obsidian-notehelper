# 构建阶段
FROM node:22-bullseye-slim AS builder
RUN apt-get update && apt-get install -y build-essential g++ make python3 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# 第一步：只复制 package 文件和自定义包（利用缓存层）
COPY package*.json ./
# 复制企微SDK包文件（需要从参考目录获取）
COPY wework-chat-node-1.1.3.tgz ./

# 第二步：安装依赖（只有依赖文件变化时才重新执行）
RUN npm install --production
RUN npm install wework-chat-node-1.1.3.tgz

# 第三步：复制其他源代码文件（JS 文件变化只影响这一层）
COPY *.js ./
# 复制企微SDK相关文件
COPY *.h ./
COPY *.so ./

# 运行阶段
FROM node:22-bullseye-slim

# 暴露端口 8000
EXPOSE 8000
WORKDIR /app
# 复制所有文件包括node_modules
COPY --from=builder /app .
# 创建非 root 用户 (Debian/Ubuntu 语法)
RUN groupadd --gid 1001 nodejs
RUN useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home nodejs
# 创建并设置目录权限
RUN mkdir -p /app/temp_files && chown -R nodejs:nodejs /app
USER nodejs
CMD ["npm", "start"]