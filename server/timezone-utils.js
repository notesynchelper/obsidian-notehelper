/**
 * 时区处理工具类
 * 解决客户端时间与服务器时间的时区差异问题
 */
class TimezoneUtils {
  /**
   * 将客户端时间转换为UTC时间
   * @param {string} timeString - 时间字符串，可能包含时区信息
   * @returns {string} UTC时间字符串
   */
  static toUTC(timeString) {
    if (!timeString) {
      return null;
    }

    try {
      // 创建Date对象，JavaScript会自动处理时区转换
      const date = new Date(timeString);

      // 检查是否是有效日期
      if (isNaN(date.getTime())) {
        console.warn(`无效的时间格式: ${timeString}`);
        return null;
      }

      // 返回ISO格式的UTC时间
      return date.toISOString();
    } catch (error) {
      console.error(`时间转换失败: ${timeString}`, error);
      return null;
    }
  }

  /**
   * 解析查询字符串中的时间戳过滤器
   * @param {string} searchQuery - 搜索查询字符串
   * @returns {string|null} 转换后的UTC时间字符串
   */
  static parseUpdatedAtFilter(searchQuery) {
    if (!searchQuery) {
      return null;
    }

    // 匹配 updated:时间戳 的模式
    const updatedAtMatch = searchQuery.match(/updated:([\d\-T:.Z+\-]+)/);
    if (!updatedAtMatch) {
      return null;
    }

    const timeString = updatedAtMatch[1];
    const utcTime = this.toUTC(timeString);

    if (utcTime) {
      console.log(`时区转换: ${timeString} -> ${utcTime}`);
    }

    return utcTime;
  }

  /**
   * 验证时间字符串格式
   * @param {string} timeString - 时间字符串
   * @returns {boolean} 是否为有效格式
   */
  static isValidTimeString(timeString) {
    if (!timeString) {
      return false;
    }

    try {
      const date = new Date(timeString);
      return !isNaN(date.getTime());
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取时区偏移信息（用于调试）
   * @param {string} timeString - 时间字符串
   * @returns {object} 时区信息
   */
  static getTimezoneInfo(timeString) {
    try {
      const date = new Date(timeString);
      return {
        original: timeString,
        utc: date.toISOString(),
        localOffset: date.getTimezoneOffset(),
        timestamp: date.getTime()
      };
    } catch (error) {
      return {
        original: timeString,
        error: error.message
      };
    }
  }
}

module.exports = { TimezoneUtils };