# Content Processor 消息格式文档

## 概述

本文档定义了 Content Processor 服务使用的消息格式规范，供其他服务端参考和集成。

## 队列结构

### 队列优先级
1. **link-vip**: 高优先级队列，优先处理
2. **link-normal**: 普通优先级队列
3. **link-trial**: 试用队列，与normal同等优先级
4. **link-dlq**: 死信队列，处理失败的消息

### 处理逻辑
- 连续处理最多10条VIP消息
- 之后必须处理1条trial消息（兜底策略）
- 如果没有VIP/trial消息，处理normal消息
- 失败的消息会发送到死信队列

## 消息格式

### 基础消息结构

```json
{
  "msgid": "string",           // 消息唯一标识
  "action": "send",            // 操作类型，固定为 "send"
  "from": "string",            // 发送者OpenID (用作API Key)
  "tolist": ["string"],        // 接收者列表
  "roomid": "string",          // 群组ID，个人消息为空字符串
  "msgtime": 1234567890123,    // 消息时间戳(毫秒)
  "msgtype": "link",           // 消息类型，固定为 "link"
  "link": { ... },             // 链接内容对象
  "config": { ... },           // 用户配置对象
  "retryCount": 0              // 重试次数(可选，系统自动添加)
}
```

### 链接对象结构 (link)

```json
{
  "title": "string",           // 链接标题
  "description": "string",     // 链接描述
  "link_url": "string",        // 完整的链接URL
  "image_url": "string"        // 链接预览图片URL(可选)
}
```

### 配置对象结构 (config)

```json
{
  "config": {
    "raw_html": false          // 是否保留原始HTML
  }
}
```

## 消息示例

### 标准链接消息

```json
{
  "msgid": "test_message_1758263690660",
  "action": "send",
  "from": "o56E762Lh_yloQuLk1Gfim3Xksxs",
  "tolist": ["0000726"],
  "roomid": "",
  "msgtime": 1758263690660,
  "msgtype": "link",
  "link": {
    "title": "微信公众号文章测试",
    "description": "测试微信公众号文章内容提取",
    "link_url": "https://mp.weixin.qq.com/s?__biz=MzkyNjY0MzU0OA==&mid=2247486018&idx=1&sn=f8a3272d3cea9880c1949e9cd3493346&chksm=c31545040d8758e207c964f6b399c3b3346bb2e5b7b28b0fc0b1d1bdc416c66c9b288b3143f4&mpshare=1&scene=1&srcid=0916Ni2gLkDLPSiOUBFOljvZ&sharer_shareinfo=1188a73be9c5bf6c3c424830cfd47840&sharer_shareinfo_first=1188a73be9c5bf6c3c424830cfd47840#rd",
    "image_url": "https://picsum.photos/800/400"
  },
  "config": {
    "config": {
      "raw_html": false
    }
  }
}
```

### 重试消息

当消息处理失败需要重试时，系统会自动添加 `retryCount` 字段：

```json
{
  "msgid": "test_message_1758263690660",
  "action": "send",
  "from": "o56E762Lh_yloQuLk1Gfim3Xksxs",
  "tolist": ["0000726"],
  "roomid": "",
  "msgtime": 1758263690660,
  "msgtype": "link",
  "link": { ... },
  "config": { ... },
  "retryCount": 2             // 重试次数，最大为3
}
```

## 重试机制

### 重试策略
1. **内容提取失败**：自动重试，最多3次
2. **重试队列**：放回原队列（保持优先级）
3. **超限处理**：超过3次重试发送到DLQ
4. **其他错误**：直接发送到DLQ

### 重试计数
- 初始消息：`retryCount` 未设置或为 0
- 第1次重试：`retryCount = 1`
- 第2次重试：`retryCount = 2`
- 第3次重试：`retryCount = 3`
- 超过3次：发送到 `link-dlq` 队列

## 内容提取配置

### Clean Option 映射
根据用户配置决定内容清理方式：

| raw_html 配置 | clean_option | 说明 |
|--------------|--------------|------|
| false 或未设置 | "0" | 清理HTML标签 |
| true | "1" | 保留原始HTML |

### 提取端点
系统使用权重轮询选择内容提取端点：

| 端点名称 | 权重 | URL模式 | 完整地址示例 |
|---------|------|---------|-------------|
| onenoteauth | 30 | azure | https://onenoteauth.azurewebsites.net/get_content_uni |
| onenoteauth2 | 30 | azure | https://onenoteauth2.azurewebsites.net/get_content_uni |
| lzyownget1 | 30 | azure | https://lzyownget1.azurewebsites.net/get_content_uni |
| lzyownget2 | 30 | azure | https://lzyownget2.azurewebsites.net/get_content_uni |
| getcontent | 90 | cf | https://getcontent.clipfx.app/get_content_uni |

## 验证规则

### 必需字段验证
- `msgid`: 字符串，非空
- `action`: 必须为 "send"
- `from`: 字符串，非空（用作API认证）
- `msgtype`: 必须为 "link"
- `link.link_url`: 字符串，非空，有效URL

### 可选字段
- `tolist`: 数组，可为空
- `roomid`: 字符串，可为空
- `link.title`: 字符串，可为空
- `link.description`: 字符串，可为空
- `link.image_url`: 字符串，可为空
- `config`: 对象，可为空
- `retryCount`: 数字，系统管理

## 错误处理

### 格式错误
- 无效JSON格式 → 发送到DLQ
- 缺少必需字段 → 发送到DLQ
- 字段类型错误 → 发送到DLQ

### 处理错误
- 内容提取失败 → 重试机制
- 网络超时 → 重试机制
- API认证失败 → 发送到DLQ
- 其他异常 → 发送到DLQ

## 死信队列消息

死信队列中的消息会添加错误信息：

```json
{
  "body": "原始消息内容",
  "properties": {
    "errorReason": "错误原因描述",
    "failureTime": "2025-01-19T06:35:12.174Z",
    "originalQueue": "link-normal"
  }
}
```

## 集成建议

### 发送方集成
1. 确保消息格式符合规范
2. 使用正确的队列优先级
3. 提供有效的用户OpenID
4. 设置合适的内容提取配置

### 监控建议
1. 监控各队列的消息积压情况
2. 关注DLQ中的失败消息
3. 跟踪重试机制的触发频率
4. 监控内容提取端点的成功率

### 性能优化
1. 使用VIP队列处理重要消息
2. 合理配置限流参数
3. 监控Azure Service Bus连接状态
4. 定期清理DLQ中的过期消息