const { TimezoneUtils } = require('../timezone-utils');

console.log('=== 时区工具测试 ===\n');

// 测试用例
const testCases = [
  '2024-12-01T15:30:00+08:00', // 东八区
  '2024-12-01T15:30:00Z',      // UTC
  '2024-12-01T15:30:00-05:00', // 西五区
  '2024-12-01T15:30:00',       // 无时区信息
];

testCases.forEach(timeString => {
  console.log(`原始时间: ${timeString}`);
  const utcTime = TimezoneUtils.toUTC(timeString);
  console.log(`UTC时间: ${utcTime}`);
  const info = TimezoneUtils.getTimezoneInfo(timeString);
  console.log(`时区信息:`, info);
  console.log('---');
});

// 测试查询字符串解析
const testQueries = [
  'updated:2024-12-01T15:30:00+08:00',
  'in:library updated:2024-12-01T08:00:00Z',
  'has:highlights updated:2024-12-01T15:30:00-05:00',
];

console.log('\n=== 查询字符串解析测试 ===\n');
testQueries.forEach(query => {
  console.log(`查询: ${query}`);
  const utcTime = TimezoneUtils.parseUpdatedAtFilter(query);
  console.log(`解析结果: ${utcTime}`);
  console.log('---');
});