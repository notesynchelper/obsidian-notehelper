const axios = require('axios');

// Worker gateway URL (to be deployed)
const WORKER_GATEWAY_URL = 'https://obsidian.notebooksyncer.com';

// Test the worker gateway with the same tests as remote server
const testUser = {
  username: 'worker_testuser_' + Date.now(),
  email: `worker_testuser_${Date.now()}@example.com`
};

const testArticle = {
  title: 'Worker Gateway测试文章 - ' + new Date().toLocaleString(),
  url: 'https://example.com/worker-test-article-' + Date.now(),
  originalArticleUrl: 'https://blog.example.com/worker-test-article-' + Date.now(),
  author: 'Worker Test Author',
  description: '这是一篇测试Worker网关的文章描述',
  image: 'https://picsum.photos/800/400?random=' + Date.now(),
  content: '# Worker Gateway测试文章\n\n这是文章的内容...\n\n## 测试章节\n\n详细的测试内容，用于验证Worker网关功能正常。',
  wordsCount: 1200,
  siteName: 'Worker Test Blog'
};

// 辅助函数：发送HTTP请求到Worker网关
async function makeWorkerRequest(method, url, data = null, headers = {}, timeout = 10000) {
  try {
    const config = {
      method,
      url: `${WORKER_GATEWAY_URL}${url}`,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      timeout
    };

    if (data) {
      config.data = data;
    }

    console.log(`🌐 发送Worker请求: ${method} ${config.url}`);
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
      console.log('🔌 连接被拒绝 - Worker可能未部署或域名未配置');
    } else if (error.code === 'ETIMEDOUT') {
      console.log('⏰ 请求超时');
    } else if (error.response?.status === 401) {
      console.log('🔑 认证失败 - API密钥缺失或无效');
    } else if (error.response?.status === 502) {
      console.log('🚪 网关错误 - Worker无法连接到后端服务器');
    }

    return {
      success: false,
      error: error.response?.data || error.message,
      status: error.response?.status || 500,
      duration
    };
  }
}

// 测试函数 - 无API密钥请求（应该失败）
async function testWorkerWithoutApiKey() {
  console.log('\n🧪 测试1: Worker网关 - 无API密钥请求');
  console.log('🎯 期望结果: 401 Unauthorized');

  const result = await makeWorkerRequest('GET', '/health');

  if (!result.success && result.status === 401) {
    console.log('✅ 正确拒绝了无API密钥的请求');
    return true;
  } else {
    console.log('❌ 应该拒绝无API密钥的请求');
    return false;
  }
}

// 测试函数 - 使用API密钥的健康检查
async function testWorkerHealthCheck(apiKey) {
  console.log('\n🧪 测试2: Worker网关 - 健康检查');
  console.log('🔑 使用API密钥:', apiKey ? apiKey.substring(0, 10) + '...' : '无');

  const headers = apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {};
  const result = await makeWorkerRequest('GET', '/health', null, headers);

  if (result.success) {
    console.log('✅ Worker网关健康检查通过');
    console.log('📊 服务器信息:', JSON.stringify(result.data, null, 2));
    return true;
  } else {
    console.log('❌ Worker网关健康检查失败');
    console.log('💥 错误信息:', JSON.stringify(result.error, null, 2));
    return false;
  }
}

// 测试函数 - 创建用户
async function testWorkerCreateUser(apiKey) {
  console.log('\n🧪 测试3: Worker网关 - 创建用户');
  console.log('👤 用户数据:', JSON.stringify(testUser, null, 2));

  const headers = { 'Authorization': `Bearer ${apiKey}` };
  const result = await makeWorkerRequest('POST', '/api/users', testUser, headers);

  if (result.success) {
    console.log('✅ Worker网关创建用户成功');
    console.log('📋 响应数据:', JSON.stringify(result.data, null, 2));
    return result.data.data;
  } else {
    console.log('❌ Worker网关创建用户失败');
    console.log('💥 错误信息:', JSON.stringify(result.error, null, 2));
    return null;
  }
}

// 测试函数 - GraphQL查询
async function testWorkerGraphQL(apiKey) {
  console.log('\n🧪 测试4: Worker网关 - GraphQL查询');

  const graphqlQuery = {
    query: `
      query {
        search(query: "", first: 5) {
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

  const headers = { 'Authorization': `Bearer ${apiKey}` };
  const result = await makeWorkerRequest('POST', '/api/graphql', graphqlQuery, headers, 15000);

  if (result.success) {
    console.log('✅ Worker网关GraphQL查询成功');
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
    console.log('❌ Worker网关GraphQL查询失败');
    console.log('💥 错误信息:', JSON.stringify(result.error, null, 2));
    return null;
  }
}

// 主测试函数
async function runWorkerGatewayTests() {
  console.log('🚀 开始Worker网关测试');
  console.log('🎯 测试目标:', WORKER_GATEWAY_URL);
  console.log('🕐 测试开始时间:', new Date().toLocaleString());

  const testResults = {
    noApiKey: false,
    health: false,
    user: null,
    graphql: null
  };

  try {
    // 测试1: 无API密钥请求
    testResults.noApiKey = await testWorkerWithoutApiKey();

    // 为后续测试获取一个测试API密钥
    // 注意：在实际部署中，您需要从后端获取有效的API密钥
    const testApiKey = 'test_api_key_' + Date.now(); // 这里使用临时密钥进行测试

    console.log('\n⚠️ 注意：以下测试使用临时API密钥，在实际环境中需要有效的API密钥');

    // 测试2: 健康检查（使用API密钥）
    testResults.health = await testWorkerHealthCheck(testApiKey);

    // 测试3: 创建用户
    if (testResults.health) {
      testResults.user = await testWorkerCreateUser(testApiKey);
    }

    // 测试4: GraphQL查询
    if (testResults.health) {
      testResults.graphql = await testWorkerGraphQL(testApiKey);
    }

  } catch (error) {
    console.error('❌ Worker测试过程中发生错误:', error.message);
  }

  // 测试总结
  console.log('\n' + '='.repeat(60));
  console.log('📊 Worker网关测试总结');
  console.log('='.repeat(60));
  console.log(`🎯 测试目标: ${WORKER_GATEWAY_URL}`);
  console.log(`🕐 测试时间: ${new Date().toLocaleString()}`);

  console.log(`✅ 无API密钥拦截: ${testResults.noApiKey ? '通过' : '失败'}`);
  console.log(`✅ 健康检查转发: ${testResults.health ? '通过' : '失败'}`);
  console.log(`✅ 用户创建转发: ${testResults.user ? '通过' : '失败'}`);
  console.log(`✅ GraphQL查询转发: ${testResults.graphql ? '通过' : '失败'}`);

  const passedTests = Object.values(testResults).filter(result =>
    result !== null && result !== false
  ).length;
  const totalTests = 4;

  console.log(`\n📈 测试通过率: ${passedTests}/${totalTests} (${Math.round(passedTests/totalTests*100)}%)`);

  if (testResults.noApiKey) {
    console.log('\n🎉 Worker网关安全认证正常！');
    if (testResults.health) {
      console.log('🎊 Worker网关代理功能正常！');
    } else {
      console.log('⚠️ Worker网关可能未正确转发请求到后端');
    }
  } else {
    console.log('\n⚠️ Worker网关存在安全问题，请检查配置');
  }

  return testResults;
}

// 运行测试
if (require.main === module) {
  runWorkerGatewayTests().catch(error => {
    console.error('❌ Worker网关测试运行失败:', error.message);
    process.exit(1);
  });
}

module.exports = {
  runWorkerGatewayTests,
  testWorkerWithoutApiKey,
  testWorkerHealthCheck,
  testWorkerCreateUser,
  testWorkerGraphQL
};