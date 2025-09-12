const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { mockData } = require('./mockData');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3001;

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.text());

// 日志中间件
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Request Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// GraphQL端点
app.post('/api/graphql', (req, res) => {
  try {
    const { query, variables } = req.body;
    console.log('GraphQL Query:', query);
    console.log('Variables:', variables);

    // 解析查询类型
    if (query.includes('search')) {
      // 处理搜索查询
      const { after = 0, first = 10, query: searchQuery = '' } = variables || {};
      
      let filteredArticles = [...mockData.articles];
      
      // 根据查询字符串过滤
      if (searchQuery) {
        if (searchQuery.includes('in:archive')) {
          filteredArticles = filteredArticles.filter(article => article.isArchived);
        } else if (searchQuery.includes('in:library')) {
          filteredArticles = filteredArticles.filter(article => !article.isArchived);
        } else if (searchQuery.includes('has:highlights')) {
          filteredArticles = filteredArticles.filter(article => article.highlights.length > 0);
        }
        
        // 时间戳过滤
        const updatedAtMatch = searchQuery.match(/updated:([\d\-T:.Z]+)/);
        if (updatedAtMatch) {
          const updatedAtFilter = new Date(updatedAtMatch[1]);
          filteredArticles = filteredArticles.filter(article => 
            new Date(article.updatedAt) >= updatedAtFilter
          );
        }
      }

      // 分页处理
      const startIndex = parseInt(after) || 0;
      const endIndex = startIndex + (parseInt(first) || 10);
      const paginatedArticles = filteredArticles.slice(startIndex, endIndex);
      
      const response = {
        data: {
          search: {
            items: paginatedArticles,
            pageInfo: {
              hasNextPage: endIndex < filteredArticles.length,
              hasPreviousPage: startIndex > 0,
              startCursor: startIndex.toString(),
              endCursor: Math.min(endIndex - 1, filteredArticles.length - 1).toString(),
              totalCount: filteredArticles.length
            }
          }
        }
      };

      res.json(response);
    } else if (query.includes('deleteArticle')) {
      // 处理删除文章
      const { input } = variables || {};
      const articleId = input?.id;
      
      if (articleId) {
        // 在实际应用中，这里应该从数据库中删除文章
        // 现在只是模拟成功响应
        const response = {
          data: {
            deleteArticle: {
              article: {
                id: articleId
              }
            }
          }
        };
        res.json(response);
      } else {
        res.status(400).json({
          data: {
            deleteArticle: {
              errorCodes: ['BAD_REQUEST']
            }
          }
        });
      }
    } else {
      // 未知查询类型
      res.status(400).json({
        errors: [{ message: '未支持的GraphQL查询类型' }]
      });
    }
  } catch (error) {
    console.error('GraphQL处理错误:', error);
    res.status(500).json({
      errors: [{ message: '服务器内部错误' }]
    });
  }
});

// 内容API端点
app.post('/api/content', (req, res) => {
  try {
    const { libraryItemIds, format } = req.body;
    console.log('Content API - Items:', libraryItemIds, 'Format:', format);

    if (!libraryItemIds || !Array.isArray(libraryItemIds)) {
      return res.status(400).json({
        error: '无效的libraryItemIds参数'
      });
    }

    // 生成内容下载响应
    const contentResponse = {
      data: libraryItemIds.map(itemId => {
        // 查找对应的文章
        const article = mockData.articles.find(a => a.id === itemId);
        
        if (!article) {
          return {
            libraryItemId: itemId,
            downloadUrl: '',
            error: '文章不存在'
          };
        }

        // 生成下载URL
        const downloadUrl = `http://localhost:${PORT}/api/download/${itemId}`;
        
        return {
          libraryItemId: itemId,
          downloadUrl,
        };
      })
    };

    res.json(contentResponse);
  } catch (error) {
    console.error('Content API处理错误:', error);
    res.status(500).json({
      error: '服务器内部错误'
    });
  }
});

// 内容下载端点
app.get('/api/download/:itemId', (req, res) => {
  try {
    const { itemId } = req.params;
    console.log('Download content for item:', itemId);

    // 查找对应的文章
    const article = mockData.articles.find(a => a.id === itemId);
    
    if (!article) {
      return res.status(404).json({
        error: '文章不存在'
      });
    }

    // 返回文章的Markdown内容
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(article.content);
  } catch (error) {
    console.error('Download处理错误:', error);
    res.status(500).send('服务器内部错误');
  }
});

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// 获取所有文章的端点（用于调试）
app.get('/api/debug/articles', (req, res) => {
  res.json({
    articles: mockData.articles,
    totalCount: mockData.articles.length
  });
});

// 错误处理中间件
app.use((error, req, res, next) => {
  console.error('服务器错误:', error);
  res.status(500).json({
    error: '服务器内部错误',
    message: error.message
  });
});

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({
    error: '接口不存在',
    path: req.originalUrl
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 Obsidian Omnivore Mock Server 运行在 http://localhost:${PORT}`);
  console.log(`📚 共加载 ${mockData.articles.length} 条文章数据`);
  console.log(`🔍 GraphQL端点: http://localhost:${PORT}/api/graphql`);
  console.log(`📄 内容API端点: http://localhost:${PORT}/api/content`);
  console.log(`❤️  健康检查: http://localhost:${PORT}/health`);
  console.log(`🐛 调试端点: http://localhost:${PORT}/api/debug/articles`);
  
  // 预留数据库连接的位置
  console.log('\\n📝 注意: 当前使用Mock数据，后续可在此处添加数据库连接逻辑');
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('\\n🛑 接收到SIGTERM信号，正在关闭服务器...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\\n🛑 接收到SIGINT信号，正在关闭服务器...');
  process.exit(0);
});

// 预留数据库集成接口
class DatabaseManager {
  constructor() {
    // 预留数据库连接配置
    this.config = {
      // host: 'localhost',
      // port: 5432,
      // database: 'omnivore',
      // user: 'username',
      // password: 'password'
    };
  }

  async connect() {
    // TODO: 实际数据库连接逻辑
    console.log('⚠️  数据库连接功能待实现');
  }

  async getArticles(filters = {}) {
    // TODO: 从数据库获取文章
    console.log('⚠️  数据库查询功能待实现');
    return mockData.articles;
  }

  async deleteArticle(articleId) {
    // TODO: 从数据库删除文章
    console.log('⚠️  数据库删除功能待实现');
    return { success: true };
  }
}

// 导出数据库管理器实例（供后续使用）
const dbManager = new DatabaseManager();
module.exports = { app, dbManager };