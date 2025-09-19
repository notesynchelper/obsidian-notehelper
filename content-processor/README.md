# Content Processor

内容处理器，用于从Azure Service Bus接收微信链接消息并进行内容提取和处理。

## 功能特性

- 支持多队列优先级处理（VIP > Normal/Trial）
- **权重轮询**的内容提取节点选择
- **限流机制**：每分钟最多处理2条消息
- 支持clean_option配置（根据用户raw_html设置）
- 自动内容提取和解析
- 后端API集成（创建文章）
- 错误处理和死信队列支持
- Docker容器化部署

## 内容提取节点

项目使用多个内容提取端点，按权重进行轮询选择：

| 端点名称 | 权重 | URL模式 | 完整地址示例 |
|---------|------|---------|-------------|
| onenoteauth | 30 | azure | https://onenoteauth.azurewebsites.net/get_content_uni |
| onenoteauth2 | 30 | azure | https://onenoteauth2.azurewebsites.net/get_content_uni |
| lzyownget1 | 30 | azure | https://lzyownget1.azurewebsites.net/get_content_uni |
| lzyownget2 | 30 | azure | https://lzyownget2.azurewebsites.net/get_content_uni |
| getcontent | 90 | cf | https://getcontent.ilzy.workers.dev/get_content_uni |

**限流策略**：每分钟最多发送2个内容提取请求，超出限制时会自动等待。

## 环境变量

- `AZ_BUS_CP_CS`: Azure Service Bus连接字符串（必需）

## 安装和运行

```bash
# 安装依赖
npm install

# 设置环境变量
export AZ_BUS_CP_CS="your_service_bus_connection_string"

# 运行应用
npm start

# 开发模式
npm run dev
```

## 测试

```bash
# 发送单个测试消息（包含微信文章URL）
npm test

# 发送多个测试消息到所有队列
npm run test-multiple

# 测试内容提取器（权重选择和限流）
npm run test-extractor
```

## Docker部署

```bash
# 构建镜像
docker build -t content-processor .

# 运行容器
docker run -d \
  --name content-processor \
  -e AZ_BUS_CP_CS="your_connection_string" \
  content-processor
```

## 队列优先级

1. **link-vip**: 高优先级队列，优先处理
2. **link-normal**: 普通优先级队列
3. **link-trial**: 试用队列，与normal同等优先级
4. **link-dlq**: 死信队列，处理失败的消息

## 处理逻辑

1. 连续处理最多10条VIP消息
2. 之后必须处理1条trial消息（兜底策略）
3. 如果没有VIP/trial消息，处理normal消息
4. 失败的消息会发送到死信队列

## Clean Option配置

根据消息中的用户配置决定内容清理方式：

- `raw_html: false` 或未设置 → `clean_option: "0"` （清理HTML）
- `raw_html: true` → `clean_option: "1"` （保留原始HTML）

## 测试用户信息

- **OpenID**: o56E762Lh_yloQuLk1Gfim3Xksxs
- **API Key**: o56E762Lh_yloQuLk1Gfim3Xksxs

## 测试URL

项目包含微信公众号文章测试：
https://mp.weixin.qq.com/s?__biz=MzkyNjY0MzU0OA==&mid=2247486018&idx=1&sn=f8a3272d3cea9880c1949e9cd3493346...