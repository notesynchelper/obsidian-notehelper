const axios = require('axios');

// 远程服务器配置 - 使用 Cloudflare Worker 网关
const REMOTE_API_BASE_URL = 'https://obsidian.notebooksyncer.com';

// 测试数据
const testUser = {
  username: 'remote_testuser_' + Date.now(),
  email: `remote_testuser_${Date.now()}@example.com`
};

const testArticle = {
  title: '远程服务器测试文章 - ' + new Date().toLocaleString(),
  url: 'https://example.com/remote-test-article-' + Date.now(),
  originalArticleUrl: 'https://blog.example.com/remote-test-article-' + Date.now(),
  author: 'Remote Test Author',
  description: '这是一篇测试远程服务器的文章描述',
  image: 'https://picsum.photos/800/400?random=' + Date.now(),
  content: '# 远程服务器测试文章\n\n这是文章的内容...\n\n## 测试章节\n\n详细的测试内容，用于验证远程服务器功能正常。',
  wordsCount: 1200,
  siteName: 'Remote Test Blog'
};

// 辅助函数：发送HTTP请求
async function makeRequest(method, url, data = null, headers = {}, timeout = 10000) {
  try {
    const config = {
      method,
      url: `${REMOTE_API_BASE_URL}${url}`,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'test-key', // Add default API key for testing
        ...headers
      },
      timeout
    };

    if (data) {
      config.data = data;
    }

    console.log(`🌐 发送请求: ${method} ${config.url}`);
    if (data) {
      console.log('📤 请求数据:', JSON.stringify(data, null, 2));
    }

    const startTime = Date.now();
    const response = await axios(config);
    const duration = Date.now() - startTime;

    console.log(`⏱️  响应时间: ${duration}ms`);
    console.log(`📥 响应状态: ${response.status}`);

    return {
      success: true,
      data: response.data,
      status: response.status,
      duration
    };
  } catch (error) {
    const duration = Date.now() - (error.config?.startTime || Date.now());
    console.log(`⚠️  请求失败 (${duration}ms)`);

    if (error.code === 'ECONNREFUSED') {
      console.log('🔌 连接被拒绝 - 服务器可能未运行');
    } else if (error.code === 'ETIMEDOUT') {
      console.log('⏰ 请求超时');
    }

    return {
      success: false,
      error: error.response?.data || error.message,
      status: error.response?.status || 500,
      duration
    };
  }
}

// 测试函数
async function testRemoteHealthCheck() {
  console.log('\n🧪 测试0: 远程服务器健康检查');
  console.log('🎯 目标服务器:', REMOTE_API_BASE_URL);

  const result = await makeRequest('GET', '/health');

  if (result.success) {
    console.log('✅ 远程服务器健康检查通过');
    console.log('📊 服务器信息:', JSON.stringify(result.data, null, 2));
    return true;
  } else {
    console.log('❌ 远程服务器健康检查失败');
    console.log('💥 错误信息:', JSON.stringify(result.error, null, 2));
    return false;
  }
}

async function testRemoteDebugEndpoint() {
  console.log('\n🧪 测试1: 远程服务器调试端点');

  const result = await makeRequest('GET', '/api/debug/articles');

  if (result.success) {
    console.log('✅ 调试端点访问成功');
    const articles = result.data.articles || [];
    console.log(`📊 Mock数据文章数量: ${articles.length}`);
    if (articles.length > 0) {
      console.log('📄 示例文章:', articles[0].title);
    }
    return result.data;
  } else {
    console.log('❌ 调试端点访问失败');
    console.log('💥 错误信息:', JSON.stringify(result.error, null, 2));
    return null;
  }
}

async function testRemoteCreateUser() {
  console.log('\n🧪 测试2: 远程服务器创建用户');
  console.log('👤 用户数据:', JSON.stringify(testUser, null, 2));

  const result = await makeRequest('POST', '/api/users', testUser);

  if (result.success) {
    console.log('✅ 远程创建用户成功');
    console.log('📋 响应数据:', JSON.stringify(result.data, null, 2));
    return result.data.data;
  } else {
    console.log('❌ 远程创建用户失败');
    console.log('💥 错误信息:', JSON.stringify(result.error, null, 2));
    return null;
  }
}

async function testRemoteUpdateApiKey(username, newApiKey) {
  console.log('\n🧪 测试3: 远程服务器修改API密钥');
  console.log(`👤 用户名: ${username}`);
  console.log(`🔑 新API密钥: ${newApiKey}`);

  const result = await makeRequest('PUT', `/api/users/${username}/api-key`, { newApiKey });

  if (result.success) {
    console.log('✅ 远程修改API密钥成功');
    console.log('📋 响应数据:', JSON.stringify(result.data, null, 2));
    return result.data.data;
  } else {
    console.log('❌ 远程修改API密钥失败');
    console.log('💥 错误信息:', JSON.stringify(result.error, null, 2));
    return null;
  }
}

async function testRemoteCreateArticle(apiKey) {
  console.log('\n🧪 测试4: 远程服务器创建文章');
  console.log('🔑 使用API密钥:', apiKey);
  console.log('📄 文章数据:', JSON.stringify(testArticle, null, 2));

  const headers = {
    'Authorization': `Bearer ${apiKey}`
  };

  const result = await makeRequest('POST', '/api/articles', testArticle, headers);

  if (result.success) {
    console.log('✅ 远程创建文章成功');
    console.log('📋 响应数据:', JSON.stringify(result.data, null, 2));
    return result.data.data;
  } else {
    console.log('❌ 远程创建文章失败');
    console.log('💥 错误信息:', JSON.stringify(result.error, null, 2));
    return null;
  }
}

async function testRemoteGraphQL(apiKey) {
  console.log('\n🧪 测试5: 远程服务器GraphQL查询');

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

  const result = await makeRequest('POST', '/api/graphql', graphqlQuery, headers, 15000);

  if (result.success) {
    console.log('✅ 远程GraphQL查询成功');
    const searchData = result.data.data?.search;
    if (searchData) {
      console.log(`📊 文章总数: ${searchData.pageInfo.totalCount}`);
      console.log('📄 文章列表:');
      searchData.items.forEach((article, index) => {
        console.log(`  ${index + 1}. ${article.title} (ID: ${article.id})`);
      });
      return searchData.items;
    }
    return [];
  } else {
    console.log('❌ 远程GraphQL查询失败');
    console.log('💥 错误信息:', JSON.stringify(result.error, null, 2));
    return null;
  }
}

// 网络延迟测试
async function testNetworkLatency() {
  console.log('\n🧪 网络延迟测试');

  const latencies = [];
  for (let i = 0; i < 5; i++) {
    console.log(`🏓 Ping ${i + 1}/5...`);
    const result = await makeRequest('GET', '/health');
    if (result.success && result.duration) {
      latencies.push(result.duration);
    }
    // 等待500ms再发送下一个请求
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  if (latencies.length > 0) {
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const minLatency = Math.min(...latencies);
    const maxLatency = Math.max(...latencies);

    console.log(`📊 延迟统计:`);
    console.log(`  平均延迟: ${avgLatency.toFixed(1)}ms`);
    console.log(`  最小延迟: ${minLatency}ms`);
    console.log(`  最大延迟: ${maxLatency}ms`);
    console.log(`  延迟列表: [${latencies.join(', ')}]ms`);

    return { avg: avgLatency, min: minLatency, max: maxLatency };
  } else {
    console.log('❌ 网络延迟测试失败');
    return null;
  }
}

// 主测试函数
async function runRemoteServerTests() {
  console.log('🚀 开始远程服务器API接口测试');
  console.log('🎯 测试目标:', REMOTE_API_BASE_URL);
  console.log('🕐 测试开始时间:', new Date().toLocaleString());

  const testResults = {
    health: false,
    debug: false,
    latency: null,
    user: null,
    apiKey: null,
    article: null,
    graphql: null
  };

  try {
    // 网络延迟测试
    testResults.latency = await testNetworkLatency();

    // 测试0: 健康检查
    testResults.health = await testRemoteHealthCheck();
    if (!testResults.health) {
      console.log('❌ 远程服务器未响应，请检查服务器状态');
      throw new Error('远程服务器健康检查失败');
    }

    // 测试1: 调试端点
    testResults.debug = await testRemoteDebugEndpoint();

    // 测试2: 创建用户
    testResults.user = await testRemoteCreateUser();
    if (!testResults.user) {
      console.log('⚠️ 用户创建失败，可能是数据库模式问题，将尝试其他测试');
    }

    let finalApiKey = testResults.user?.apiKey;

    // 测试3: 修改API密钥（如果用户创建成功）
    if (testResults.user) {
      const newApiKey = `remote_api_key_${Date.now()}`;
      testResults.apiKey = await testRemoteUpdateApiKey(testResults.user.username, newApiKey);
      if (testResults.apiKey) {
        finalApiKey = newApiKey;
      }
    }

    // 测试4: 创建文章（如果有API密钥）
    if (finalApiKey) {
      testResults.article = await testRemoteCreateArticle(finalApiKey);
    }

    // 测试5: GraphQL查询（如果有API密钥）
    if (finalApiKey) {
      testResults.graphql = await testRemoteGraphQL(finalApiKey);
    }

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error.message);
  }

  // 测试总结
  console.log('\n' + '='.repeat(60));
  console.log('📊 远程服务器测试总结');
  console.log('='.repeat(60));
  console.log(`🎯 测试目标: ${REMOTE_API_BASE_URL}`);
  console.log(`🕐 测试时间: ${new Date().toLocaleString()}`);

  if (testResults.latency) {
    console.log(`🏓 网络延迟: ${testResults.latency.avg.toFixed(1)}ms (平均)`);
  }

  console.log(`✅ 健康检查: ${testResults.health ? '通过' : '失败'}`);
  console.log(`✅ 调试端点: ${testResults.debug ? '通过' : '失败'}`);
  console.log(`✅ 用户创建: ${testResults.user ? '通过' : '失败'}`);
  console.log(`✅ API密钥修改: ${testResults.apiKey ? '通过' : '失败'}`);
  console.log(`✅ 文章创建: ${testResults.article ? '通过' : '失败'}`);
  console.log(`✅ GraphQL查询: ${testResults.graphql ? '通过' : '失败'}`);

  const passedTests = Object.values(testResults).filter(result =>
    result !== null && result !== false
  ).length;
  const totalTests = 6; // 不包括延迟测试

  console.log(`\n📈 测试通过率: ${passedTests}/${totalTests} (${Math.round(passedTests/totalTests*100)}%)`);

  if (testResults.health && testResults.debug) {
    console.log('\n🎉 远程服务器基础功能正常！');
    if (testResults.user && testResults.article) {
      console.log('🎊 完整功能测试通过！');
      console.log(`👤 测试用户: ${testResults.user.username}`);
      console.log(`📄 测试文章: ${testResults.article.title}`);
    } else {
      console.log('⚠️ 数据库功能可能需要检查（可能在Mock模式）');
    }
  } else {
    console.log('\n⚠️ 远程服务器存在问题，请检查服务状态');
  }

  return testResults;
}

// 运行测试
if (require.main === module) {
  runRemoteServerTests().catch(error => {
    console.error('❌ 远程测试运行失败:', error.message);
    process.exit(1);
  });
}

module.exports = {
  runRemoteServerTests,
  testRemoteHealthCheck,
  testRemoteDebugEndpoint,
  testRemoteCreateUser,
  testRemoteUpdateApiKey,
  testRemoteCreateArticle,
  testRemoteGraphQL,
  testNetworkLatency
};