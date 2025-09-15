# Obsidian Omnivore Server API 接口文档

## 基础信息

- **本地服务器地址**: `http://localhost:3002`
- **线上服务器地址**: `https://obsidian.notebooksyncer.com`
- **API版本**: `1.0.0`

### 运行模式

服务器支持两种运行模式：

1. **数据库模式**: 需要设置环境变量 `SUPABASE_KEY_OB`，使用 Supabase 数据库存储数据
2. **Mock模式**: 使用内存中的模拟数据，适用于开发和测试

## 认证机制

大多数接口需要API密钥认证（除健康检查和调试端点外）：

### 认证方式

**方式1 - Authorization Header**:
```
Authorization: Bearer <api_key>
```

**方式2 - Custom Header**:
```
x-api-key: <api_key>
```

### 获取API密钥

1. 调用创建用户接口获取初始API密钥（默认与用户名相同）
2. 使用修改API密钥接口更新为自定义密钥

---

## 接口列表

### 1. 健康检查

检查服务器运行状态。

- **请求方式**: `GET`
- **请求地址**: `/health`
- **认证要求**: 无需认证
- **请求参数**: 无

**响应示例**:
```json
{
  "status": "OK",
  "timestamp": "2025-09-15T08:07:39.861Z",
  "version": "1.0.0"
}
```

---

### 2. 调试端点 - 获取所有文章

获取所有Mock文章数据，用于调试和开发。

- **请求方式**: `GET`
- **请求地址**: `/api/debug/articles`
- **认证要求**: 无需认证
- **请求参数**: 无

**响应示例**:
```json
{
  "articles": [
    {
      "id": "article-1",
      "title": "技术文章1: React Hook最佳实践",
      "author": "张三",
      "content": "# React Hook最佳实践\n\n这是一篇关于...",
      "savedAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "totalCount": 10
}
```

---

### 3. 用户管理 - 创建用户

创建新用户账户。

- **请求方式**: `POST`
- **请求地址**: `/api/users`
- **认证要求**: 无需认证
- **数据库要求**: 仅在数据库模式下可用

**请求体**:
```json
{
  "username": "string",     // 必需，用户名，唯一标识
  "email": "string"         // 可选，用户邮箱
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "fc2526fb-4df8-4bba-ac58-158659f5509e",
    "username": "testuser",
    "email": "testuser@example.com",
    "apiKey": "testuser",           // 默认与用户名相同
    "createdAt": "2025-09-15T08:07:41.903551+00:00"
  }
}
```

**错误响应**:
- `400`: 用户名不能为空
- `409`: 用户名或API密钥已存在
- `503`: 需要数据库模式

---

### 4. 用户管理 - 修改API密钥

更新用户的API密钥。

- **请求方式**: `PUT`
- **请求地址**: `/api/users/:username/api-key`
- **认证要求**: 无需认证
- **数据库要求**: 仅在数据库模式下可用

**路径参数**:
- `username`: 用户名

**请求体**:
```json
{
  "newApiKey": "string"     // 必需，新的API密钥，必须唯一
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "fc2526fb-4df8-4bba-ac58-158659f5509e",
    "username": "testuser",
    "apiKey": "new_api_key_12345",
    "updatedAt": "2025-09-15T08:07:42.377+00:00"
  }
}
```

**错误响应**:
- `400`: 用户名或新API密钥为空
- `404`: 用户不存在
- `409`: API密钥已被其他用户使用
- `503`: 需要数据库模式

---

### 5. 文章管理 - 创建文章

创建新文章。

- **请求方式**: `POST`
- **请求地址**: `/api/articles`
- **认证要求**: 需要API密钥
- **数据库要求**: 仅在数据库模式下可用

**请求体**:
```json
{
  "title": "string",                // 必需，文章标题
  "url": "string",                  // 可选，文章URL
  "originalArticleUrl": "string",   // 可选，原始文章URL
  "author": "string",               // 可选，作者名称
  "description": "string",          // 可选，文章描述
  "image": "string",                // 可选，文章配图URL
  "content": "string",              // 可选，文章内容(Markdown格式)
  "wordsCount": 1200,               // 可选，字数统计
  "siteName": "string"              // 可选，来源站点名称
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "7ca55b43-8df1-4959-8f98-293c845c4a15",
    "title": "远程服务器测试文章",
    "url": "https://example.com/test-article",
    "originalArticleUrl": "https://blog.example.com/test-article",
    "slug": "test-article-slug",
    "author": "Test Author",
    "description": "这是一篇测试文章",
    "image": "https://picsum.photos/800/400",
    "content": "# 测试文章\n\n这是文章内容...",
    "wordsCount": 1200,
    "siteName": "Test Blog",
    "savedAt": "2025-09-15T08:07:43.799253+00:00",
    "updatedAt": "2025-09-15T08:07:43.799253+00:00"
  }
}
```

**错误响应**:
- `400`: 文章标题不能为空
- `401`: API密钥无效或缺失
- `503`: 需要数据库模式

---

### 6. GraphQL查询

执行GraphQL查询和变更操作。

- **请求方式**: `POST`
- **请求地址**: `/api/graphql`
- **认证要求**: 需要API密钥

**请求体**:
```json
{
  "query": "string",        // GraphQL查询语句
  "variables": {}           // 查询变量（可选）
}
```

#### 6.1 搜索文章查询

**查询语句**:
```graphql
query {
  search(query: "", first: 10, after: 0) {
    items {
      id
      title
      url
      author
      savedAt
      updatedAt
    }
    pageInfo {
      totalCount
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
  }
}
```

**查询变量**:
```json
{
  "query": "",              // 搜索查询字符串
  "first": 10,              // 返回记录数量
  "after": 0                // 偏移量
}
```

**支持的查询过滤器**:
- `in:archive` - 搜索已归档文章
- `in:library` - 搜索未归档文章
- `has:highlights` - 搜索有高亮的文章
- `updated:2024-01-15T10:30:00Z` - 搜索指定时间后更新的文章

**响应示例**:
```json
{
  "data": {
    "search": {
      "items": [
        {
          "id": "7ca55b43-8df1-4959-8f98-293c845c4a15",
          "title": "远程服务器测试文章",
          "url": "https://example.com/test-article",
          "author": "Test Author",
          "savedAt": "2025-09-15T08:07:43.799253+00:00",
          "updatedAt": "2025-09-15T08:07:43.799253+00:00"
        }
      ],
      "pageInfo": {
        "totalCount": 1,
        "hasNextPage": false,
        "hasPreviousPage": false,
        "startCursor": "0",
        "endCursor": "0"
      }
    }
  }
}
```

#### 6.2 删除文章变更

**变更语句**:
```graphql
mutation {
  deleteArticle(input: { id: "article-id" }) {
    article {
      id
    }
  }
}
```

**变更变量**:
```json
{
  "input": {
    "id": "7ca55b43-8df1-4959-8f98-293c845c4a15"
  }
}
```

**响应示例**:
```json
{
  "data": {
    "deleteArticle": {
      "article": {
        "id": "7ca55b43-8df1-4959-8f98-293c845c4a15"
      }
    }
  }
}
```

---

### 7. 内容API

批量获取文章内容的下载链接。

- **请求方式**: `POST`
- **请求地址**: `/api/content`
- **认证要求**: 需要API密钥

**请求体**:
```json
{
  "libraryItemIds": ["string"],     // 必需，文章ID数组
  "format": "string"                // 可选，内容格式
}
```

**响应示例**:
```json
{
  "data": [
    {
      "libraryItemId": "article-1",
      "downloadUrl": "http://localhost:3002/api/download/article-1"
    },
    {
      "libraryItemId": "article-2",
      "downloadUrl": "http://localhost:3002/api/download/article-2"
    }
  ]
}
```

**错误响应**:
- `400`: 无效的libraryItemIds参数
- `401`: API密钥无效或缺失

---

### 8. 内容下载

下载指定文章的内容。

- **请求方式**: `GET`
- **请求地址**: `/api/download/:itemId`
- **认证要求**: 需要API密钥

**路径参数**:
- `itemId`: 文章ID

**响应**:
- **Content-Type**: `text/plain; charset=utf-8`
- **响应体**: 文章的Markdown内容

**错误响应**:
- `401`: API密钥无效或缺失
- `404`: 文章不存在

---

## 错误处理

### HTTP状态码

- `200` - 请求成功
- `201` - 资源创建成功
- `400` - 请求参数错误
- `401` - 认证失败（API密钥无效或缺失）
- `404` - 资源不存在
- `409` - 资源冲突（如用户名已存在）
- `500` - 服务器内部错误
- `503` - 服务不可用（如数据库模式未启用）

### 错误响应格式

```json
{
  "error": "错误类型",
  "message": "详细错误信息"
}
```

---

## 测试说明

### 运行测试

项目提供了完整的API测试脚本：

**本地测试**:
```bash
node test-api.js
```

**远程服务器测试**:
```bash
node test-remote-server.js
```

**Worker网关测试**:
```bash
node test-worker-gateway.js
```

### 测试覆盖

测试脚本覆盖以下功能：
- 健康检查
- 调试端点
- 用户创建和API密钥管理
- 文章创建
- GraphQL查询（搜索和删除）
- 内容API和下载
- 网络延迟测试

---

## 部署说明

### 环境变量

- `PORT`: 服务器端口（默认: 3002）
- `SUPABASE_KEY_OB`: Supabase API密钥（启用数据库模式）

### 启动服务器

**开发模式**:
```bash
npm run dev
```

**生产模式**:
```bash
npm start
```

### 初始化数据库

如果使用数据库模式，需要先初始化数据库：

```bash
node init-db.js
```

---

## 更新日志

### v1.0.0
- 基础API接口实现
- Mock数据模式支持
- Supabase数据库集成
- GraphQL查询支持
- 用户和文章管理功能
- 完整的测试套件

---

## 联系信息

如有问题或建议，请参考项目文档或联系开发团队。