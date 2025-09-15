const { DatabaseManager } = require('./database');

async function initializeDatabase() {
  const dbManager = new DatabaseManager();

  console.log('🚀 开始初始化Supabase数据库...\n');

  // 1. 连接数据库
  console.log('步骤 1: 连接到Supabase');
  const connected = await dbManager.connect();
  if (!connected) {
    console.error('❌ 无法连接到数据库，请检查环境变量 SUPABASE_KEY_OB');
    process.exit(1);
  }

  // 2. 初始化数据库表结构
  console.log('\n步骤 2: 初始化数据库表结构');
  const initialized = await dbManager.initializeDatabase();
  if (!initialized) {
    console.error('❌ 数据库初始化失败');
    // 不退出，继续尝试创建用户和数据
  }

  // 3. 创建测试用户
  console.log('\n步骤 3: 创建测试用户');
  const userData = await dbManager.createTestUsers();

  // 4. 创建测试数据
  console.log('\n步骤 4: 创建测试数据');
  await dbManager.createTestData(userData);

  console.log('\n✅ 数据库初始化完成！\n');
  console.log('==========================================');
  console.log('📋 测试用户API密钥:');
  console.log(`用户1: ${userData.user1.apiKey}`);
  console.log(`用户2: ${userData.user2.apiKey}`);
  console.log('==========================================');
  console.log('\n提示: 在插件中使用这些API密钥进行测试');
  console.log('提示: 确保服务器已启动，运行: npm start');
}

// 运行初始化
initializeDatabase().catch(error => {
  console.error('❌ 初始化过程出现错误:', error);
  process.exit(1);
});