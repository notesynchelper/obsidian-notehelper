# Obsidian Omnivore Mock Server

这是一个用于本地测试的Mock服务器，模拟Omnivore API的行为，供Obsidian Omnivore插件开发和测试使用。

## 快速开始

### 安装依赖

```bash
cd server
npm install
```

### 启动服务器

```bash
# 生产模式
npm start

# 开发模式（自动重启）
npm run dev
```

服务器将在 `http://localhost:3001` 启动。

## API端点

### 1. GraphQL API
- **端点**: `POST /api/graphql`
- **功能**: 处理文章搜索和删除操作
- **认证**: 支持Authorization头部（当前为Mock模式）

#### 搜索文章示例
```json
{
  "query": "query Search($after: String, $first: Int, $query: String) { ... }",
  "variables": {
    "after": "0",
    "first": 10,
    "query": "in:library sort:saved-asc"
  }
}
```

#### 删除文章示例
```json
{
  "query": "mutation DeleteArticle($input: DeleteArticleInput!) { ... }",
  "variables": {
    "input": {
      "id": "article-id-here"
    }
  }
}
```

### 2. 内容API
- **端点**: `POST /api/content`
- **功能**: 获取文章内容的下载URL

#### 请求示例
```json
{
  "libraryItemIds": ["article-id-1", "article-id-2"],
  "format": "highlightedMarkdown"
}
```

### 3. 内容下载API
- **端点**: `GET /api/download/:itemId`
- **功能**: 下载具体文章的Markdown内容

### 4. 其他端点
- `GET /health` - 健康检查
- `GET /api/debug/articles` - 调试：查看所有文章数据

## 支持的查询过滤器

- `in:all` - 所有文章
- `in:library` - 未归档文章
- `in:archive` - 已归档文章
- `has:highlights` - 包含高亮的文章
- `updated:YYYY-MM-DDTHH:mm:ss.sssZ` - 按更新时间过滤
- `sort:saved-asc` - 按保存时间升序排列

## Mock数据说明

服务器包含10条文章的Mock数据，包括：
- 完整的文章元数据
- 高亮注释
- 标签系统
- 不同的文章状态（已读、未读、归档等）
- 真实的Markdown内容

## 在插件中启用本地测试

要在Obsidian插件中使用本地Mock服务器，需要：

1. 设置环境变量：
```bash
# Windows
set LOCAL_TEST=true
set NODE_ENV=development

# macOS/Linux
export LOCAL_TEST=true
export NODE_ENV=development
```

2. 或者在插件构建时修改配置文件

插件将自动将API请求重定向到 `http://localhost:3001`。

## 后续数据库集成

当前使用Mock数据，服务器已预留数据库集成接口：

### DatabaseManager类
```javascript
class DatabaseManager {
  async connect() {
    // TODO: 实际数据库连接逻辑
  }

  async getArticles(filters = {}) {
    // TODO: 从数据库获取文章
  }

  async deleteArticle(articleId) {
    // TODO: 从数据库删除文章
  }
}
```

### 集成步骤
1. 配置数据库连接参数
2. 实现DatabaseManager的方法
3. 替换Mock数据调用
4. 添加数据验证和错误处理

## 开发注意事项

- 所有API调用都会记录到控制台，便于调试
- 支持CORS跨域请求
- 错误处理完整，包含详细的错误信息
- 支持优雅关闭（Ctrl+C或SIGTERM）

## 测试建议

1. 使用Postman或curl测试API端点
2. 检查插件中的网络请求是否正确重定向
3. 验证Mock数据的完整性和格式
4. 测试各种查询过滤器和分页功能