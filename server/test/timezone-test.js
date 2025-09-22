const request = require('supertest');
const { app, dbManager } = require('../index');

describe('时区处理测试', () => {
  let testApiKey;
  let testUserId;
  let testArticles = [];

  beforeAll(async () => {
    if (!process.env.SUPABASE_KEY_OB) {
      console.log('⚠️ 跳过数据库测试 - 需要设置 SUPABASE_KEY_OB 环境变量');
      return;
    }

    // 连接数据库
    await dbManager.connect();

    // 创建测试用户
    testApiKey = 'o56E762Lh_yloQuLk1Gfim3Xksxs'; // 使用提供的API密钥
    const userData = {
      api_key: testApiKey,
      username: 'timezone_test',
      email: 'timezone@test.com'
    };

    try {
      const { data } = await dbManager.supabase
        .from('users')
        .insert(userData)
        .select()
        .single();
      testUserId = data.id;
    } catch (error) {
      if (error.code === '23505') {
        // 用户已存在，获取用户ID
        const { data } = await dbManager.supabase
          .from('users')
          .select('id')
          .eq('api_key', testApiKey)
          .single();
        testUserId = data.id;
      }
    }

    // 清理可能存在的测试数据
    await dbManager.supabase
      .from('articles')
      .delete()
      .eq('user_id', testUserId);

    // 插入已知时间的测试文章
    const testArticleData = [
      {
        user_id: testUserId,
        title: '测试文章1 - UTC 6点',
        content: '测试内容1',
        updated_at: '2024-12-01T06:00:00Z'
      },
      {
        user_id: testUserId,
        title: '测试文章2 - UTC 8点',
        content: '测试内容2',
        updated_at: '2024-12-01T08:00:00Z'
      },
      {
        user_id: testUserId,
        title: '测试文章3 - UTC 10点',
        content: '测试内容3',
        updated_at: '2024-12-01T10:00:00Z'
      }
    ];

    const { data: insertedArticles } = await dbManager.supabase
      .from('articles')
      .insert(testArticleData)
      .select();

    testArticles = insertedArticles;
  });

  afterAll(async () => {
    if (testUserId && process.env.SUPABASE_KEY_OB) {
      // 清理测试数据
      await dbManager.supabase
        .from('articles')
        .delete()
        .eq('user_id', testUserId);

      await dbManager.supabase
        .from('users')
        .delete()
        .eq('id', testUserId);
    }
  });

  describe('不同时区客户端查询测试', () => {
    const testCases = [
      {
        description: '东八区客户端查询 - 北京时间下午2点 (UTC 6点)',
        queryTime: '2024-12-01T14:00:00+08:00',
        expectedUTCTime: '2024-12-01T06:00:00Z',
        expectedArticles: 3 // 应该返回UTC 6点、8点、10点的文章
      },
      {
        description: 'UTC客户端查询 - UTC 8点',
        queryTime: '2024-12-01T08:00:00Z',
        expectedUTCTime: '2024-12-01T08:00:00Z',
        expectedArticles: 2 // 应该返回UTC 8点、10点的文章
      },
      {
        description: '西五区客户端查询 - 纽约时间上午5点 (UTC 10点)',
        queryTime: '2024-12-01T05:00:00-05:00',
        expectedUTCTime: '2024-12-01T10:00:00Z',
        expectedArticles: 1 // 应该返回UTC 10点的文章
      }
    ];

    testCases.forEach(testCase => {
      test(testCase.description, async () => {
        if (!process.env.SUPABASE_KEY_OB) {
          console.log('⚠️ 跳过测试 - 需要数据库环境');
          return;
        }

        const query = `
          query Search($after: String, $first: Int, $query: String) {
            search(after: $after, first: $first, query: $query) {
              edges {
                node {
                  id
                  title
                  updatedAt
                }
              }
              pageInfo {
                totalCount
              }
            }
          }
        `;

        const variables = {
          after: '0',
          first: 10,
          query: `updated:${testCase.queryTime}`
        };

        const response = await request(app)
          .post('/api/graphql')
          .set('Authorization', `Bearer ${testApiKey}`)
          .send({ query, variables })
          .expect(200);

        const articles = response.body.edges || [];

        console.log(`\n${testCase.description}`);
        console.log(`查询时间: ${testCase.queryTime}`);
        console.log(`期望UTC时间: ${testCase.expectedUTCTime}`);
        console.log(`返回文章数: ${articles.length}, 期望: ${testCase.expectedArticles}`);

        articles.forEach(article => {
          console.log(`- ${article.node.title}: ${article.node.updatedAt}`);
        });

        // 验证返回的文章数量
        expect(articles.length).toBe(testCase.expectedArticles);

        // 验证返回的文章都是在指定时间之后更新的
        articles.forEach(article => {
          const articleTime = new Date(article.node.updatedAt);
          const queryTime = new Date(testCase.expectedUTCTime);
          expect(articleTime.getTime()).toBeGreaterThanOrEqual(queryTime.getTime());
        });
      });
    });
  });

  describe('时区转换边界测试', () => {
    test('跨日期查询 - 东八区23点 vs UTC 15点', async () => {
      if (!process.env.SUPABASE_KEY_OB) {
        console.log('⚠️ 跳过测试 - 需要数据库环境');
        return;
      }

      // 插入跨日期的测试文章
      const crossDateArticle = {
        user_id: testUserId,
        title: '跨日期测试文章 - UTC 15点',
        content: '跨日期测试内容',
        updated_at: '2024-12-01T15:00:00Z'
      };

      const { data } = await dbManager.supabase
        .from('articles')
        .insert(crossDateArticle)
        .select()
        .single();

      const query = `
        query Search($after: String, $first: Int, $query: String) {
          search(after: $after, first: $first, query: $query) {
            edges {
              node {
                id
                title
                updatedAt
              }
            }
          }
        }
      `;

      // 东八区12月1日23点 = UTC 12月1日15点
      const variables = {
        after: '0',
        first: 10,
        query: 'updated:2024-12-01T23:00:00+08:00'
      };

      const response = await request(app)
        .post('/api/graphql')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({ query, variables })
        .expect(200);

      const articles = response.body.edges || [];

      console.log('\n跨日期查询测试');
      console.log('查询时间: 2024-12-01T23:00:00+08:00 (东八区)');
      console.log('对应UTC: 2024-12-01T15:00:00Z');
      console.log(`返回文章数: ${articles.length}`);

      // 应该找到UTC 15点的文章
      const foundCrossDateArticle = articles.find(article =>
        article.node.title.includes('跨日期测试文章')
      );

      expect(foundCrossDateArticle).toBeDefined();

      // 清理测试文章
      await dbManager.supabase
        .from('articles')
        .delete()
        .eq('id', data.id);
    });

    test('不带时区信息的时间字符串处理', async () => {
      if (!process.env.SUPABASE_KEY_OB) {
        console.log('⚠️ 跳过测试 - 需要数据库环境');
        return;
      }

      const query = `
        query Search($after: String, $first: Int, $query: String) {
          search(after: $after, first: $first, query: $query) {
            edges {
              node {
                id
                title
                updatedAt
              }
            }
          }
        }
      `;

      // 不带时区信息的时间字符串
      const variables = {
        after: '0',
        first: 10,
        query: 'updated:2024-12-01T08:00:00'
      };

      const response = await request(app)
        .post('/api/graphql')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({ query, variables })
        .expect(200);

      const articles = response.body.edges || [];

      console.log('\n不带时区信息测试');
      console.log('查询时间: 2024-12-01T08:00:00 (无时区)');
      console.log(`返回文章数: ${articles.length}`);

      // 验证处理逻辑 - 应该按UTC处理或给出明确的错误提示
      expect(response.status).toBe(200);
    });
  });

  describe('Mock数据模式时区测试', () => {
    test('Mock模式下的时区处理', async () => {
      // 临时禁用数据库模式来测试Mock数据
      const originalEnv = process.env.SUPABASE_KEY_OB;
      delete process.env.SUPABASE_KEY_OB;

      const query = `
        query Search($after: String, $first: Int, $query: String) {
          search(after: $after, first: $first, query: $query) {
            edges {
              node {
                id
                title
                updatedAt
              }
            }
          }
        }
      `;

      const variables = {
        after: '0',
        first: 10,
        query: 'updated:2024-01-01T00:00:00Z'
      };

      const response = await request(app)
        .post('/api/graphql')
        .send({ query, variables })
        .expect(200);

      const articles = response.body.edges || [];

      console.log('\nMock模式时区测试');
      console.log(`返回文章数: ${articles.length}`);

      // 恢复环境变量
      if (originalEnv) {
        process.env.SUPABASE_KEY_OB = originalEnv;
      }

      expect(response.status).toBe(200);
    });
  });
});

module.exports = {
  testTimezoneHandling: () => {
    console.log('时区测试用例已准备就绪');
    console.log('运行: npm test test/timezone-test.js');
  }
};