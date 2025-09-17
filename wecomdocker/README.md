# 企微Obsidian同步服务

这是一个实现拉取企微消息并进行处理的服务，用于将企微消息同步到Obsidian。

## 功能特性

- 拉取企微会话存档消息
- 智能过滤和处理消息内容
- 支持文本和链接类型消息
- 用户身份识别和关联
- 消息去重处理
- 自动同步到Obsidian服务
- 企微通知推送

## 环境变量

- `WECOM_CORP_SECRET`: 企微会话存档密钥（必需）
- `COSMOS_KEY`: Azure Cosmos DB密钥
- `COSMOS_ENDPOINT`: Cosmos DB端点地址
- `PORT`: 服务端口（默认8000）

## 本地运行

```bash
# 安装依赖
npm install

# 启动服务
npm start
```

## Docker镜像构建

```bash
# 构建镜像podman build -t lzyob .

# 运行容器
podman run -d \
  -p 8000:8000 \
  --env WECOM_CORP_SECRET \
  --env COSMOS_KEY \
  --name wecom-sync \
  lzyob
```

## API接口

- `GET /`: 拉取并处理企微消息
- `GET /health`: 健康检查

## 消息处理流程

1. 从企微会话存档拉取消息
2. 过滤发送给obsidian的消息
3. 用户身份识别和关联
4. 消息去重检查
5. 内容解析和处理
6. 写入Obsidian服务
7. 发送企微通知

## 部署说明

本服务设计为容器化部署，使用Podman构建镜像名称为 `lzyob`。
