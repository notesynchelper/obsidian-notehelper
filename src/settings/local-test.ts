// 本地测试配置文件
import { BUILD_CONFIG } from '../build-config';
import { log } from '../logger';

export const LOCAL_TEST_CONFIG = {
  // 测试用API密钥 - 在数据库模式下使用
  TEST_API_KEY: 'o56E762Lh_yloQuLk1Gfim3Xksxs',

  // 本地测试服务器地址
  LOCAL_API_BASE_URL: 'http://localhost:3002',
  LOCAL_GRAPHQL_ENDPOINT: 'http://localhost:3002/api/graphql',
  LOCAL_CONTENT_ENDPOINT: 'http://localhost:3002/api/content',

  // 是否启用本地测试模式
  ENABLE_LOCAL_TEST: BUILD_CONFIG.IS_LOCAL_TEST,
}

// 获取实际使用的端点URL
export const getEndpointUrl = (defaultEndpoint: string): string => {
  if (LOCAL_TEST_CONFIG.ENABLE_LOCAL_TEST) {
    log('🔧 本地测试模式已启用，使用Mock服务器:', LOCAL_TEST_CONFIG.LOCAL_GRAPHQL_ENDPOINT);
    return LOCAL_TEST_CONFIG.LOCAL_GRAPHQL_ENDPOINT
  }
  return defaultEndpoint
}

// 获取内容API的基础URL
export const getContentApiUrl = (endpoint: string): string => {
  if (LOCAL_TEST_CONFIG.ENABLE_LOCAL_TEST) {
    log('🔧 本地测试模式：内容API重定向到:', LOCAL_TEST_CONFIG.LOCAL_CONTENT_ENDPOINT);
    return LOCAL_TEST_CONFIG.LOCAL_CONTENT_ENDPOINT
  }
  // 从GraphQL endpoint转换为content endpoint
  return endpoint.replace(/\/api\/graphql$/, '/api/content')
}