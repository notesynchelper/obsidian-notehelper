const axios = require('axios');

const API_BASE_URL = 'http://localhost:3002';

// 测试数据
const testUser = {
  username: 'testuser123',
  email: 'testuser123@example.com'
};

const testArticle = {
  title: '测试文章标题',
  url: 'https://example.com/test-article',
  originalArticleUrl: 'https://blog.example.com/test-article',
  author: 'Test Author',
  description: '这是一篇测试文章的描述',
  image: 'https://picsum.photos/800/400',
  content: '# 测试文章\n\n这是文章的内容...\n\n## 章节1\n\n详细内容...',
  wordsCount: 1000,
  siteName: 'Test Blog'
};

// 辅助函数：发送HTTP请求
async function makeRequest(method, url, data = null, headers = {}) {
  try {
    const config = {
      method,
      url: `${API_BASE_URL}${url}`,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data || error.message,
      status: error.response?.status || 500
    };
  }
}

// 测试函数
async function testCreateUser() {
  console.log('\n🧪 测试1: 创建用户');
  console.log('请求数据:', JSON.stringify(testUser, null, 2));

  const result = await makeRequest('POST', '/api/users', testUser);

  if (result.success) {
    console.log('✅ 创建用户成功');
    console.log('响应数据:', JSON.stringify(result.data, null, 2));
    return result.data.data; // 返回用户数据供后续测试使用
  } else {
    console.log('❌ 创建用户失败');
    console.log('错误信息:', JSON.stringify(result.error, null, 2));
    return null;
  }
}

async function testUpdateApiKey(username, newApiKey) {
  console.log('\n🧪 测试2: 修改API密钥');
  console.log(`用户名: ${username}`);
  console.log(`新API密钥: ${newApiKey}`);

  const result = await makeRequest('PUT', `/api/users/${username}/api-key`, { newApiKey });

  if (result.success) {
    console.log('✅ 修改API密钥成功');
    console.log('响应数据:', JSON.stringify(result.data, null, 2));
    return result.data.data;
  } else {
    console.log('❌ 修改API密钥失败');
    console.log('错误信息:', JSON.stringify(result.error, null, 2));
    return null;
  }
}

async function testCreateArticle(apiKey) {
  console.log('\n🧪 测试3: 创建文章');
  console.log('使用API密钥:', apiKey);
  console.log('文章数据:', JSON.stringify(testArticle, null, 2));

  const headers = {
    'Authorization': `Bearer ${apiKey}`
  };

  const result = await makeRequest('POST', '/api/articles', testArticle, headers);

  if (result.success) {
    console.log('✅ 创建文章成功');
    console.log('响应数据:', JSON.stringify(result.data, null, 2));
    return result.data.data;
  } else {
    console.log('❌ 创建文章失败');
    console.log('错误信息:', JSON.stringify(result.error, null, 2));
    return null;
  }
}

async function testHealthCheck() {
  console.log('\n🧪 测试0: 健康检查');

  const result = await makeRequest('GET', '/health');

  if (result.success) {
    console.log('✅ 服务器健康检查通过');
    console.log('响应数据:', JSON.stringify(result.data, null, 2));
    return true;
  } else {
    console.log('❌ 服务器健康检查失败');
    console.log('错误信息:', JSON.stringify(result.error, null, 2));
    return false;
  }
}

// 检查数据库中的数据
async function checkDatabaseData(apiKey) {
  console.log('\n🔍 检查数据库数据');

  // 使用GraphQL查询获取文章列表
  const graphqlQuery = {
    query: `
      query {
        search(query: "", first: 10) {
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
          }
        }
      }
    `
  };

  const headers = {
    'Authorization': `Bearer ${apiKey}`
  };

  const result = await makeRequest('POST', '/api/graphql', graphqlQuery, headers);

  if (result.success) {
    console.log('✅ 数据库查询成功');
    console.log('文章数量:', result.data.data.search.pageInfo.totalCount);
    console.log('文章列表:');
    result.data.data.search.items.forEach((article, index) => {
      console.log(`  ${index + 1}. ${article.title} (ID: ${article.id})`);
    });
    return result.data.data.search.items;
  } else {
    console.log('❌ 数据库查询失败');
    console.log('错误信息:', JSON.stringify(result.error, null, 2));
    return null;
  }
}

// 主测试函数
async function runTests() {
  console.log('🚀 开始API接口测试');
  console.log('测试服务器地址:', API_BASE_URL);

  try {
    // 测试0: 健康检查
    const healthOk = await testHealthCheck();
    if (!healthOk) {
      console.log('❌ 服务器未正常运行，请先启动服务器');
      process.exit(1);
    }

    // 测试1: 创建用户
    const userData = await testCreateUser();
    if (!userData) {
      console.log('❌ 用户创建失败，无法继续测试');
      process.exit(1);
    }

    // 测试2: 修改API密钥
    const newApiKey = 'new_api_key_12345';
    const updatedUser = await testUpdateApiKey(userData.username, newApiKey);

    // 使用新的API密钥进行后续测试
    const finalApiKey = updatedUser ? newApiKey : userData.apiKey;

    // 测试3: 创建文章
    const articleData = await testCreateArticle(finalApiKey);

    // 验证数据库数据
    const articles = await checkDatabaseData(finalApiKey);

    // 测试总结
    console.log('\n📊 测试总结:');
    console.log(`✅ 用户创建: ${userData ? '成功' : '失败'}`);
    console.log(`✅ API密钥修改: ${updatedUser ? '成功' : '失败'}`);
    console.log(`✅ 文章创建: ${articleData ? '成功' : '失败'}`);
    console.log(`✅ 数据库验证: ${articles ? '成功' : '失败'}`);

    if (userData && articleData && articles) {
      console.log('\n🎉 所有测试通过！');
      console.log(`📝 创建的用户: ${userData.username}`);
      console.log(`🔑 最终API密钥: ${finalApiKey}`);
      console.log(`📄 创建的文章: ${articleData.title}`);
      console.log(`📊 数据库中文章总数: ${articles.length}`);
    } else {
      console.log('\n⚠️ 部分测试失败，请检查错误信息');
    }

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error.message);
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  runTests().catch(error => {
    console.error('❌ 测试运行失败:', error.message);
    process.exit(1);
  });
}

module.exports = {
  runTests,
  testCreateUser,
  testUpdateApiKey,
  testCreateArticle,
  checkDatabaseData
};