// 构建配置：区分本地测试和发布版本
const isLocalTest = false; // 本地测试模式开关
const isDevelopment = false; // 开发日志模式开关（发布时改为false）

export const BUILD_CONFIG = {
  IS_LOCAL_TEST: isLocalTest,
  IS_DEVELOPMENT: isDevelopment, // 新增开发模式标识
  LOCAL_API_BASE_URL: 'http://localhost:3001',
  VERSION: '1.10.4-local-test'
};