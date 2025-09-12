# Obsidian Omnivore Plugin - 本地测试API接口文档

## 概述

本文档描述了Obsidian Omnivore插件在本地测试模式下使用的API接口。本地测试服务器运行在 `http://localhost:3001`，提供与生产环境相同的接口结构，但使用Mock数据进行响应。

## 配置

### 启用本地测试模式

有两种方式启用本地测试模式：

#### 方式一：环境变量
```bash
# Windows
set LOCAL_TEST=true
set NODE_ENV=development

# macOS/Linux  
export LOCAL_TEST=true
export NODE_ENV=development
```

#### 方式二：构建时配置
插件会自动检测环境变量，当 `LOCAL_TEST=true` 或 `NODE_ENV=development` 时，所有API请求将重定向到本地服务器。

### 服务器启动
```bash
cd server
npm install
npm start  # 或 npm run dev 用于开发模式
```

## API接口详情

### 基础信息
- **服务器地址**: `http://localhost:3001`
- **GraphQL端点**: `http://localhost:3001/api/graphql`
- **内容API端点**: `http://localhost:3001/api/content`
- **认证方式**: 支持Authorization头部（Mock模式下可选）

## 1. GraphQL API

### 1.1 文章搜索 (Search Query)

**端点**: `POST /api/graphql`

**请求体**:
```json
{
  "query": "query Search($after: String, $first: Int, $query: String, $includeContent: Boolean) { search(after: $after, first: $first, query: $query, includeContent: $includeContent) { ... on SearchSuccess { items { id title url originalArticleUrl slug author savedAt updatedAt publishedAt archivedAt readAt pageType contentReader description image wordsCount readingProgressPercent isArchived highlights { id type quote prefix suffix patch annotation createdAt updatedAt highlightPositionPercent shortId labels { id name color } } labels { id name color } siteName } pageInfo { hasNextPage hasPreviousPage startCursor endCursor totalCount } } ... on SearchError { errorCodes } } }",
  "variables": {
    "after": "0",
    "first": 10,
    "query": "in:library sort:saved-asc",
    "includeContent": false
  }
}
```

**支持的查询过滤器**:
- `in:all` - 获取所有文章
- `in:library` - 仅获取未归档文章  
- `in:archive` - 仅获取已归档文章
- `has:highlights` - 仅获取包含高亮的文章
- `updated:2023-01-01T00:00:00.000Z` - 按更新时间过滤
- `sort:saved-asc` - 按保存时间升序排列

**响应示例**:
```json
{
  "data": {
    "search": {
      "items": [
        {
          "id": "uuid-article-1",
          "title": "技术文章1: React Hook最佳实践",
          "url": "https://example.com/articles/uuid-article-1",
          "originalArticleUrl": "https://blog-1.example.com/post/uuid-article-1",
          "slug": "article-1-slug",
          "author": "张三",
          "savedAt": "2024-01-15T10:30:00.000Z",
          "updatedAt": "2024-01-20T14:20:00.000Z",
          "publishedAt": "2024-01-10T08:00:00.000Z",
          "archivedAt": null,
          "readAt": "2024-01-16T09:15:00.000Z",
          "pageType": "ARTICLE",
          "contentReader": "WEB",
          "description": "这是第1篇技术文章的描述，涵盖了现代Web开发中的重要概念...",
          "image": "https://picsum.photos/800/400?random=1",
          "wordsCount": 2150,
          "readingProgressPercent": 0.75,
          "isArchived": false,
          "highlights": [
            {
              "id": "uuid-highlight-1",
              "type": "HIGHLIGHT",
              "quote": "这是文章1的高亮内容1，包含了重要的技术要点...",
              "prefix": "前缀内容1",
              "suffix": "后缀内容1", 
              "patch": "patch-1",
              "annotation": "这是对高亮1的注释和补充说明",
              "createdAt": "2024-01-16T09:20:00.000Z",
              "updatedAt": "2024-01-18T11:30:00.000Z",
              "highlightPositionPercent": 0.25,
              "shortId": "h11",
              "labels": [
                {
                  "id": "uuid-label-1",
                  "name": "技术",
                  "color": "#ff6b6b"
                }
              ]
            }
          ],
          "labels": [
            {
              "id": "uuid-label-1", 
              "name": "技术",
              "color": "#ff6b6b"
            }
          ],
          "siteName": "技术博客1"
        }
      ],
      "pageInfo": {
        "hasNextPage": true,
        "hasPreviousPage": false,
        "startCursor": "0",
        "endCursor": "9",
        "totalCount": 10
      }
    }
  }
}
```

### 1.2 删除文章 (Delete Mutation)

**请求体**:
```json
{
  "query": "mutation DeleteArticle($input: DeleteArticleInput!) { deleteArticle(input: $input) { ... on DeleteArticleSuccess { article { id } } ... on DeleteArticleError { errorCodes } } }",
  "variables": {
    "input": {
      "id": "uuid-article-1"
    }
  }
}
```

**响应示例**:
```json
{
  "data": {
    "deleteArticle": {
      "article": {
        "id": "uuid-article-1"
      }
    }
  }
}
```

## 2. 内容获取API

### 2.1 请求内容下载URL

**端点**: `POST /api/content`

**请求头**:
```
Content-Type: application/json
Authorization: your-api-key-here
```

**请求体**:
```json
{
  "libraryItemIds": [
    "uuid-article-1",
    "uuid-article-2"
  ],
  "format": "highlightedMarkdown"
}
```

**响应示例**:
```json
{
  "data": [
    {
      "libraryItemId": "uuid-article-1",
      "downloadUrl": "http://localhost:3001/api/download/uuid-article-1"
    },
    {
      "libraryItemId": "uuid-article-2", 
      "downloadUrl": "http://localhost:3001/api/download/uuid-article-2"
    }
  ]
}
```

### 2.2 下载文章内容

**端点**: `GET /api/download/:itemId`

**参数**:
- `itemId`: 文章的唯一标识符

**响应**: 返回文章的Markdown格式内容

**响应示例**:
```markdown
# React Hook最佳实践

这是文章1的完整内容，包含了详细的技术说明和代码示例。

## 主要内容

1. **核心概念介绍**
   - 基础理论讲解
   - 实际应用场景

2. **代码示例**
   ```javascript
   // 示例代码
   function example1() {
     console.log('这是示例代码1');
     return { success: true, data: 'mock data' };
   }
   ```

3. **最佳实践**
   - 性能优化建议
   - 常见问题解决方案
   - 经验总结

## 总结

通过本文的学习，读者可以掌握相关技术的核心要点...

---

*本文由张三原创发布*
```

## 3. 调试接口

### 3.1 健康检查

**端点**: `GET /health`

**响应**:
```json
{
  "status": "OK",
  "timestamp": "2024-01-20T15:30:00.000Z",
  "version": "1.0.0"
}
```

### 3.2 获取所有文章 (调试用)

**端点**: `GET /api/debug/articles`

**响应**:
```json
{
  "articles": [
    // 所有10篇文章的完整数据
  ],
  "totalCount": 10
}
```

## Mock数据说明

### 文章数据特征
- **总数量**: 10篇文章
- **标题**: 涵盖React、JavaScript、TypeScript、Node.js等技术主题
- **状态分布**: 
  - 前6篇已读 (readAt不为空)
  - 后3篇已归档 (isArchived: true)
  - 第9篇为FILE类型，第10篇为BOOK类型，其余为ARTICLE类型
- **高亮**: 每篇文章包含1-3个高亮，部分高亮带有注释
- **标签**: 6种标签类型 (技术、前端、JavaScript、React、工具、学习)

### 时间戳逻辑
- `savedAt`: 30天内的随机时间
- `updatedAt`: 7天内的随机时间  
- `publishedAt`: 60天内的随机时间
- `createdAt/updatedAt` (高亮): 15天内的随机时间

## 错误处理

### GraphQL错误
```json
{
  "errors": [
    {
      "message": "未支持的GraphQL查询类型"
    }
  ]
}
```

### 内容API错误
```json
{
  "error": "无效的libraryItemIds参数"
}
```

### 下载错误
```json
{
  "error": "文章不存在"
}
```

## 开发提示

1. **调试日志**: 所有API调用都会在服务器控制台输出详细日志
2. **CORS支持**: 已启用跨域请求支持
3. **自动重启**: 使用 `npm run dev` 可在代码更改时自动重启服务器
4. **分页测试**: 使用不同的 `after` 和 `first` 参数测试分页功能
5. **过滤测试**: 尝试不同的查询字符串测试过滤功能

## 与生产环境的差异

1. **认证**: Mock环境下认证头部可选
2. **数据持久化**: 所有操作不会真正修改数据
3. **性能**: 本地响应更快，无网络延迟
4. **错误率**: Mock环境不会模拟网络错误或服务器故障

## 后续数据库集成预留

服务器已预留数据库集成接口，替换Mock数据时需要：

1. 实现 `DatabaseManager` 类的所有方法
2. 替换接口处理函数中的Mock数据调用
3. 添加数据库连接配置和错误处理
4. 保持接口响应格式的一致性