const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { mockData } = require('./mockData');
const { DatabaseManager } = require('./database');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3002;

// 创建数据库管理器实例
const dbManager = new DatabaseManager();

// 是否使用数据库模式（检查环境变量）
const USE_DATABASE = !!process.env.SUPABASE_KEY_OB;

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.text());

// API密钥验证中间件
async function authenticateApiKey(req, res, next) {
  // 跳过健康检查和调试端点
  if (req.path === '/health' || req.path.startsWith('/api/debug')) {
    return next();
  }

  if (!USE_DATABASE) {
    // 在Mock模式下跳过验证
    return next();
  }

  const apiKey = req.headers['authorization']?.replace('Bearer ', '') || req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({
      error: 'API密钥缺失',
      message: '请在请求头中提供API密钥'
    });
  }

  try {
    const user = await dbManager.getUserByApiKey(apiKey);
    req.user = user; // 将用户信息附加到请求对象
    next();
  } catch (error) {
    return res.status(401).json({
      error: 'API密钥无效',
      message: '提供的API密钥无效或已过期'
    });
  }
}

// 日志中间件
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Request Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// GraphQL端点
app.post('/api/graphql', authenticateApiKey, async (req, res) => {
  try {
    const { query, variables } = req.body;
    console.log('GraphQL Query:', query);
    console.log('Variables:', variables);

    // 解析查询类型
    if (query.includes('search')) {
      // 处理搜索查询
      const { after = 0, first = 10, query: searchQuery = '' } = variables || {};

      let articles;

      if (USE_DATABASE && req.user) {
        // 使用数据库查询
        const filters = {
          offset: parseInt(after) || 0,
          limit: parseInt(first) || 10
        };

        // 根据查询字符串设置过滤器
        if (searchQuery) {
          if (searchQuery.includes('in:archive')) {
            filters.isArchived = true;
          } else if (searchQuery.includes('in:library')) {
            filters.isArchived = false;
          } else if (searchQuery.includes('has:highlights')) {
            filters.hasHighlights = true;
          }

          // 时间戳过滤
          const updatedAtMatch = searchQuery.match(/updated:([\d\-T:.Z]+)/);
          if (updatedAtMatch) {
            filters.updatedAfter = updatedAtMatch[1];
          }
        }

        const allArticles = await dbManager.getArticles(req.user.id, filters);
        articles = allArticles;
      } else {
        // 使用Mock数据
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
        articles = filteredArticles.slice(startIndex, endIndex);
      }

      const response = {
        data: {
          search: {
            items: articles,
            pageInfo: {
              hasNextPage: USE_DATABASE ? articles.length >= (parseInt(first) || 10) : false,
              hasPreviousPage: (parseInt(after) || 0) > 0,
              startCursor: (parseInt(after) || 0).toString(),
              endCursor: Math.max(0, (parseInt(after) || 0) + articles.length - 1).toString(),
              totalCount: articles.length
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
        if (USE_DATABASE && req.user) {
          // 使用数据库删除
          try {
            await dbManager.deleteArticle(req.user.id, articleId);
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
          } catch (error) {
            res.status(500).json({
              data: {
                deleteArticle: {
                  errorCodes: ['INTERNAL_ERROR']
                }
              }
            });
          }
        } else {
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
        }
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
app.post('/api/content', authenticateApiKey, async (req, res) => {
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
        let article;

        if (USE_DATABASE && req.user) {
          // 在实际场景中，这里应该验证文章是否属于当前用户
          // 为了简化，我们先只生成下载URL
          article = { id: itemId }; // 简化处理
        } else {
          // 查找对应的文章
          article = mockData.articles.find(a => a.id === itemId);
        }

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
app.get('/api/download/:itemId', authenticateApiKey, async (req, res) => {
  try {
    const { itemId } = req.params;
    console.log('Download content for item:', itemId);

    let article;

    if (USE_DATABASE && req.user) {
      // 从数据库获取文章
      const articles = await dbManager.getArticles(req.user.id, { limit: 1000 });
      article = articles.find(a => a.id === itemId);
    } else {
      // 查找对应的文章
      article = mockData.articles.find(a => a.id === itemId);
    }

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
async function startServer() {
  console.log(`🚀 Obsidian Omnivore Server 启动中...`);

  if (USE_DATABASE) {
    console.log('📊 使用Supabase数据库模式');
    const connected = await dbManager.connect();
    if (!connected) {
      console.warn('⚠️  数据库连接失败，将使用Mock数据模式');
      console.log('💡 请设置环境变量 SUPABASE_KEY_OB 以启用数据库模式');
    } else {
      console.log('✅ 数据库连接成功');
    }
  } else {
    console.log('🔧 使用Mock数据模式');
    console.log('💡 要使用数据库模式，请设置环境变量 SUPABASE_KEY_OB');
  }

  app.listen(PORT, () => {
    console.log(`\n🌟 服务器运行状态:`);
    console.log(`📍 地址: http://localhost:${PORT}`);
    console.log(`📊 模式: ${USE_DATABASE ? 'Supabase数据库' : 'Mock数据'}`);

    if (!USE_DATABASE) {
      console.log(`📚 Mock数据: ${mockData.articles.length} 条文章`);
    }

    console.log(`\n📡 API端点:`);
    console.log(`🔍 GraphQL: http://localhost:${PORT}/api/graphql`);
    console.log(`📄 内容API: http://localhost:${PORT}/api/content`);
    console.log(`❤️  健康检查: http://localhost:${PORT}/health`);
    console.log(`🐛 调试端点: http://localhost:${PORT}/api/debug/articles`);

    if (USE_DATABASE) {
      console.log(`\n⚠️  注意: 数据库模式下需要在请求头中提供API密钥`);
      console.log(`🔑 请使用 Authorization: Bearer <api_key> 或 x-api-key: <api_key>`);
      console.log(`💡 运行 'node init-db.js' 来初始化数据库和获取测试API密钥`);
    }
  });
}

startServer().catch(error => {
  console.error('❌ 服务器启动失败:', error);
  process.exit(1);
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

// 导出应用实例（供测试使用）
module.exports = { app, dbManager };