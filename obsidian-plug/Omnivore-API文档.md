# Omnivore Obsidian Plugin - 后端API接口文档

## 概述

本文档详细描述了Obsidian Omnivore插件所需的所有后端API接口。该插件用于将Omnivore应用中的文章同步到Obsidian笔记应用中。

## 基础配置

- **默认API地址**: `https://api-prod.omnivore.app/api/graphql`
- **认证方式**: API Key（通过Authorization头部传递）
- **超时设置**: API调用10秒，内容下载10分钟
- **依赖包**: `@omnivore-app/api` v1.0.3

## API接口列表

### 1. GraphQL API

**端点**: `{baseUrl}/api/graphql`  
**方法**: POST  
**认证**: Required (Authorization: {apiKey})

#### 主要操作:

##### 1.1 搜索文章 (Search Query)

用于获取文章列表，支持分页和过滤。

**请求参数**:
```graphql
query Search($after: String, $first: Int, $query: String, $includeContent: Boolean) {
  search(after: $after, first: $first, query: $query, includeContent: $includeContent) {
    ... on SearchSuccess {
      items {
        id
        title
        url
        originalArticleUrl
        slug
        author
        savedAt
        updatedAt
        publishedAt
        archivedAt
        readAt
        pageType
        contentReader
        description
        image
        wordsCount
        readingProgressPercent
        isArchived
        highlights {
          id
          type
          quote
          prefix
          suffix
          patch
          annotation
          createdAt
          updatedAt
          highlightPositionPercent
          shortId
          labels {
            id
            name
            color
          }
        }
        labels {
          id
          name
          color
        }
        siteName
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
        totalCount
      }
    }
    ... on SearchError {
      errorCodes
    }
  }
}
```

**查询字符串格式**:
- 时间戳过滤: `updated:{ISODate}`
- 排序: `sort:saved-asc`
- 内置过滤: `in:all`, `in:library`, `in:archive`, `has:highlights`
- 自定义过滤词

##### 1.2 删除文章 (Delete Mutation)

用于从Omnivore中删除文章。

```graphql
mutation DeleteArticle($input: DeleteArticleInput!) {
  deleteArticle(input: $input) {
    ... on DeleteArticleSuccess {
      article {
        id
      }
    }
    ... on DeleteArticleError {
      errorCodes
    }
  }
}
```

### 2. 内容API

**端点**: `{baseUrl}/api/content`  
**方法**: POST  
**认证**: Required (Authorization: {apiKey})  
**Content-Type**: `application/json`

**请求体**:
```json
{
  "libraryItemIds": ["string"],
  "format": "highlightedMarkdown"
}
```

**响应结构**:
```json
{
  "data": [
    {
      "libraryItemId": "string",
      "downloadUrl": "string",
      "error": "string" // 可选
    }
  ]
}
```

### 3. 内容下载API

**端点**: 动态URL（从内容API响应获取）  
**方法**: GET  
**认证**: 无（基于URL的访问）

**行为特性**:
- 轮询机制：404错误时1秒重试
- 超时时间：10分钟
- 返回格式：Markdown格式的内容

### 4. 文件附件下载

**端点**: 文章原始URL（PDF等）  
**方法**: GET  
**认证**: 无（公开URL）  
**Content-Type**: `application/pdf`

## 数据结构

### 文章对象结构

```typescript
interface Article {
  id: string                    // 唯一标识符
  title: string                 // 文章标题
  url: string                   // 文章URL
  originalArticleUrl: string    // 原始源URL
  slug: string                  // URL友好标识符
  author: string                // 作者
  savedAt: string               // 保存时间戳
  updatedAt: string             // 更新时间戳
  publishedAt: string           // 发布时间戳
  archivedAt: string            // 归档时间戳
  readAt: string                // 阅读时间戳
  pageType: 'ARTICLE' | 'FILE' | 'BOOK'
  contentReader: 'WEB' | 'FILE'
  content?: string              // 文章内容（可选）
  description: string           // 文章描述
  image: string                 // 文章图片URL
  wordsCount: number            // 字数统计
  readingProgressPercent: number // 阅读进度
  isArchived: boolean           // 归档状态
  highlights: Highlight[]       // 高亮数组
  labels: Label[]               // 标签数组
  siteName: string              // 源站点名称
}
```

### 高亮对象结构

```typescript
interface Highlight {
  id: string
  type: string
  quote: string
  prefix: string
  suffix: string
  patch: string
  annotation: string
  createdAt: string
  updatedAt: string
  highlightPositionPercent: number
  shortId: string
  labels: Label[]
}
```

### 标签对象结构

```typescript
interface Label {
  id: string
  name: string
  color: string
}
```

## 错误处理

- **404错误**: 内容下载自动重试
- **超时处理**: API调用10秒，下载10分钟
- **网络错误**: 优雅降级并通知用户
- **内容错误**: 跳过问题项目继续处理

## 自定义参数

- **高亮颜色**: 黄色、红色、绿色、蓝色
- **日期格式**: 可配置的日期/时间格式
- **文件夹/文件名模板**: 可自定义文件命名
- **同步频率**: 可配置的自动同步间隔

## 数据流程

1. **搜索API**: 获取文章元数据
2. **内容API**: 请求内容下载URL
3. **下载API**: 轮询并下载内容
4. **文件处理**: 使用模板生成Markdown文件
5. **本地存储**: 保存到Obsidian仓库

## 实现注意事项

1. 需要实现GraphQL查询和变更
2. 支持分页加载（cursor-based pagination）
3. 实现轮询机制处理内容下载
4. 提供灵活的模板系统用于生成Markdown
5. 支持增量同步（基于updatedAt时间戳）
6. 处理各种错误情况并提供用户反馈
7. 支持文件附件（PDF等）的下载

## 安全考虑

1. API Key需要安全存储
2. 所有API调用需要认证
3. 下载的文件需要安全检查
4. 用户数据隐私保护