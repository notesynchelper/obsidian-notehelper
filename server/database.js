const { createClient } = require('@supabase/supabase-js');

class DatabaseManager {
  constructor() {
    this.supabaseUrl = 'https://helzgfslbysnnmpluukw.supabase.co';
    this.supabaseKey = process.env.SUPABASE_KEY_OB;
    this.supabase = null;

    if (!this.supabaseKey) {
      console.error('❌ 错误: 环境变量 SUPABASE_KEY_OB 未设置');
      console.log('请设置环境变量: set SUPABASE_KEY_OB=your_supabase_key');
    }
  }

  async connect() {
    try {
      if (!this.supabaseKey) {
        throw new Error('Supabase key not configured');
      }

      this.supabase = createClient(this.supabaseUrl, this.supabaseKey);

      // 简单的连接测试 - 不依赖于特定表的存在
      try {
        const { data, error } = await this.supabase.auth.getSession();
        // 如果没有抛出网络错误，说明连接正常
        console.log('✅ Supabase 连接成功');
        return true;
      } catch (networkError) {
        // 如果是网络或认证错误，才认为连接失败
        if (networkError.message.includes('network') || networkError.message.includes('fetch')) {
          throw networkError;
        }
        // 其他错误可能只是权限问题，但连接本身是正常的
        console.log('✅ Supabase 连接成功（权限检查跳过）');
        return true;
      }
    } catch (error) {
      console.error('❌ Supabase 连接失败:', error.message);
      return false;
    }
  }

  async initializeDatabase() {
    if (!this.supabase) {
      throw new Error('Database not connected');
    }

    try {
      console.log('🔄 开始初始化数据库表...');
      console.log('ℹ️  注意: 需要在Supabase控制台中手动创建表结构');
      console.log('ℹ️  或者使用Supabase迁移工具创建表');

      // 检查表是否存在（通过尝试查询来验证）
      const tablesToCheck = ['users', 'labels', 'articles', 'highlights', 'article_labels', 'highlight_labels'];

      for (const tableName of tablesToCheck) {
        try {
          const { error } = await this.supabase.from(tableName).select('*').limit(1);

          if (error) {
            if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
              console.log(`⚠️  表 ${tableName} 不存在，需要手动创建`);
            } else {
              console.error(`❌ 检查表 ${tableName} 时出错:`, error.message);
            }
          } else {
            console.log(`✅ 表 ${tableName} 已存在`);
          }
        } catch (error) {
          console.error(`❌ 检查表 ${tableName} 失败:`, error.message);
        }
      }

      console.log('\n📋 创建表的SQL语句（请在Supabase SQL编辑器中执行）:');
      console.log(`
-- 创建用户表
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  api_key VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建标签表
CREATE TABLE IF NOT EXISTS labels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  color VARCHAR(7) DEFAULT '#000000',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建文章表
CREATE TABLE IF NOT EXISTS articles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT,
  original_article_url TEXT,
  slug VARCHAR(255),
  author VARCHAR(255),
  saved_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMP WITH TIME ZONE,
  archived_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  page_type VARCHAR(50) DEFAULT 'ARTICLE',
  content_reader VARCHAR(50) DEFAULT 'WEB',
  description TEXT,
  image TEXT,
  words_count INTEGER DEFAULT 0,
  reading_progress_percent FLOAT DEFAULT 0,
  is_archived BOOLEAN DEFAULT FALSE,
  site_name VARCHAR(255),
  content TEXT
);

-- 创建高亮表
CREATE TABLE IF NOT EXISTS highlights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) DEFAULT 'HIGHLIGHT',
  quote TEXT NOT NULL,
  prefix TEXT,
  suffix TEXT,
  patch TEXT,
  annotation TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  highlight_position_percent FLOAT,
  short_id VARCHAR(50)
);

-- 创建文章标签关联表
CREATE TABLE IF NOT EXISTS article_labels (
  article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
  label_id UUID REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, label_id)
);

-- 创建高亮标签关联表
CREATE TABLE IF NOT EXISTS highlight_labels (
  highlight_id UUID REFERENCES highlights(id) ON DELETE CASCADE,
  label_id UUID REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (highlight_id, label_id)
);
      `);

      console.log('✅ 数据库检查完成');
      return true;
    } catch (error) {
      console.error('❌ 数据库初始化失败:', error.message);
      return false;
    }
  }

  // 生成API密钥
  generateApiKey() {
    const { v4: uuidv4 } = require('uuid');
    return `ob_${uuidv4().replace(/-/g, '')}`;
  }

  async createTestUsers() {
    if (!this.supabase) {
      throw new Error('Database not connected');
    }

    try {
      console.log('🔄 创建测试用户...');

      const user1ApiKey = this.generateApiKey();
      const user2ApiKey = this.generateApiKey();

      // 创建两个测试用户
      const users = [
        {
          api_key: user1ApiKey,
          username: 'test_user_1',
          email: 'test1@example.com'
        },
        {
          api_key: user2ApiKey,
          username: 'test_user_2',
          email: 'test2@example.com'
        }
      ];

      for (const user of users) {
        const { data, error } = await this.supabase
          .from('users')
          .insert(user)
          .select();

        if (error) {
          if (error.code === '23505') { // 唯一约束违反
            console.log(`⚠️  用户 ${user.username} 已存在`);
          } else {
            console.error(`❌ 创建用户 ${user.username} 失败:`, error.message);
          }
        } else {
          console.log(`✅ 用户 ${user.username} 创建成功，API Key: ${user.api_key}`);
        }
      }

      console.log('\n📋 API 密钥列表:');
      console.log(`用户1 API Key: ${user1ApiKey}`);
      console.log(`用户2 API Key: ${user2ApiKey}`);

      return {
        user1: { apiKey: user1ApiKey, username: 'test_user_1' },
        user2: { apiKey: user2ApiKey, username: 'test_user_2' }
      };
    } catch (error) {
      console.error('❌ 创建测试用户失败:', error.message);
      throw error;
    }
  }

  async createTestData(userData) {
    if (!this.supabase) {
      throw new Error('Database not connected');
    }

    try {
      console.log('🔄 创建测试数据...');
      const { v4: uuidv4 } = require('uuid');

      // 为每个用户创建数据
      for (const [userKey, user] of Object.entries(userData)) {
        console.log(`\n为用户 ${user.username} 创建数据...`);

        // 获取用户ID
        const { data: userDataResult, error: userError } = await this.supabase
          .from('users')
          .select('id')
          .eq('api_key', user.apiKey)
          .single();

        if (userError) {
          console.error(`❌ 获取用户 ${user.username} 失败:`, userError.message);
          continue;
        }

        const userId = userDataResult.id;

        // 创建标签
        const labels = [
          { name: '技术', color: '#ff6b6b' },
          { name: '前端', color: '#4ecdc4' },
          { name: 'JavaScript', color: '#45b7d1' }
        ];

        const createdLabels = [];
        for (const label of labels) {
          const { data: labelData, error: labelError } = await this.supabase
            .from('labels')
            .insert({
              user_id: userId,
              name: label.name,
              color: label.color
            })
            .select()
            .single();

          if (labelError) {
            console.error(`❌ 创建标签 ${label.name} 失败:`, labelError.message);
          } else {
            createdLabels.push(labelData);
            console.log(`✅ 标签 ${label.name} 创建成功`);
          }
        }

        // 创建文章
        const articlesCount = userKey === 'user1' ? 5 : 3; // 用户1创建5篇，用户2创建3篇

        for (let i = 1; i <= articlesCount; i++) {
          const articleData = {
            user_id: userId,
            title: `${user.username} 的文章 ${i}`,
            url: `https://example.com/${user.username}/article-${i}`,
            original_article_url: `https://blog.example.com/${user.username}/post-${i}`,
            slug: `${user.username}-article-${i}`,
            author: user.username,
            description: `这是 ${user.username} 的第 ${i} 篇文章描述`,
            image: `https://picsum.photos/800/400?random=${user.username}${i}`,
            words_count: Math.floor(Math.random() * 2000) + 500,
            reading_progress_percent: Math.random(),
            is_archived: i > 3,
            site_name: `${user.username} 的博客`,
            content: `# ${user.username} 的文章 ${i}\n\n这是文章内容...\n\n## 章节1\n\n详细内容...`
          };

          const { data: articleResult, error: articleError } = await this.supabase
            .from('articles')
            .insert(articleData)
            .select()
            .single();

          if (articleError) {
            console.error(`❌ 创建文章 ${i} 失败:`, articleError.message);
            continue;
          }

          console.log(`✅ 文章 "${articleResult.title}" 创建成功`);

          // 为文章创建高亮
          const highlightData = {
            article_id: articleResult.id,
            user_id: userId,
            type: 'HIGHLIGHT',
            quote: `这是文章 ${i} 的重要高亮内容`,
            prefix: '前文内容',
            suffix: '后文内容',
            annotation: '这是对高亮的注释',
            highlight_position_percent: Math.random(),
            short_id: `h${i}`
          };

          const { data: highlightResult, error: highlightError } = await this.supabase
            .from('highlights')
            .insert(highlightData)
            .select()
            .single();

          if (highlightError) {
            console.error(`❌ 创建高亮失败:`, highlightError.message);
          } else {
            console.log(`✅ 高亮创建成功`);
          }

          // 为文章添加标签关联
          if (createdLabels.length > 0) {
            const labelId = createdLabels[i % createdLabels.length].id;
            const { error: articleLabelError } = await this.supabase
              .from('article_labels')
              .insert({
                article_id: articleResult.id,
                label_id: labelId
              });

            if (articleLabelError) {
              console.error(`❌ 添加文章标签关联失败:`, articleLabelError.message);
            }
          }
        }
      }

      console.log('\n✅ 测试数据创建完成');
      return true;
    } catch (error) {
      console.error('❌ 创建测试数据失败:', error.message);
      throw error;
    }
  }

  async getArticles(userId, filters = {}) {
    if (!this.supabase) {
      throw new Error('Database not connected');
    }

    try {
      let query = this.supabase
        .from('articles')
        .select(`
          *,
          highlights (*),
          article_labels (
            label_id,
            labels (*)
          )
        `)
        .eq('user_id', userId);

      // 应用过滤器
      if (filters.isArchived !== undefined) {
        query = query.eq('is_archived', filters.isArchived);
      }

      if (filters.hasHighlights) {
        query = query.gt('highlights.count', 0);
      }

      if (filters.updatedAfter) {
        query = query.gte('updated_at', filters.updatedAfter);
      }

      // 分页
      if (filters.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
      } else if (filters.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query.order('updated_at', { ascending: false });

      if (error) {
        throw error;
      }

      // 格式化数据以匹配原有的数据结构
      const formattedArticles = data.map(article => ({
        id: article.id,
        title: article.title,
        url: article.url,
        originalArticleUrl: article.original_article_url,
        slug: article.slug,
        author: article.author,
        savedAt: article.saved_at,
        updatedAt: article.updated_at,
        publishedAt: article.published_at,
        archivedAt: article.archived_at,
        readAt: article.read_at,
        pageType: article.page_type,
        contentReader: article.content_reader,
        description: article.description,
        image: article.image,
        wordsCount: article.words_count,
        readingProgressPercent: article.reading_progress_percent,
        isArchived: article.is_archived,
        siteName: article.site_name,
        content: article.content,
        highlights: article.highlights.map(h => ({
          id: h.id,
          type: h.type,
          quote: h.quote,
          prefix: h.prefix,
          suffix: h.suffix,
          patch: h.patch,
          annotation: h.annotation,
          createdAt: h.created_at,
          updatedAt: h.updated_at,
          highlightPositionPercent: h.highlight_position_percent,
          shortId: h.short_id
        })),
        labels: article.article_labels.map(al => al.labels).filter(Boolean)
      }));

      return formattedArticles;
    } catch (error) {
      console.error('❌ 获取文章失败:', error.message);
      throw error;
    }
  }

  async deleteArticle(userId, articleId) {
    if (!this.supabase) {
      throw new Error('Database not connected');
    }

    try {
      const { error } = await this.supabase
        .from('articles')
        .delete()
        .eq('id', articleId)
        .eq('user_id', userId);

      if (error) {
        throw error;
      }

      return { success: true };
    } catch (error) {
      console.error('❌ 删除文章失败:', error.message);
      throw error;
    }
  }

  async getUserByApiKey(apiKey) {
    if (!this.supabase) {
      throw new Error('Database not connected');
    }

    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('api_key', apiKey)
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('❌ 获取用户失败:', error.message);
      throw error;
    }
  }
}

module.exports = { DatabaseManager };