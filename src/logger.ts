/**
 * 日志管理器
 * 根据构建配置控制日志输出
 */

import { BUILD_CONFIG } from './build-config'

// 优先使用环境变量，其次使用构建配置
const isDevelopment =
  process.env.DEV_MODE === 'true' ||
  (process.env.PROD_MODE !== 'true' && BUILD_CONFIG.IS_DEVELOPMENT)

export class Logger {
  private static isDev = isDevelopment

  /**
   * 设置开发模式（可在插件初始化时调用）
   */
  static setDevMode(devMode: boolean) {
    Logger.isDev = devMode
  }

  /**
   * 调试日志 - 仅在开发环境显示
   */
  static debug(...args: unknown[]) {
    if (Logger.isDev) {
      console.debug(...args)
    }
  }

  /**
   * 信息日志 - 仅在开发环境显示
   */
  static info(...args: unknown[]) {
    if (Logger.isDev) {
      console.debug(...args)
    }
  }

  /**
   * 警告日志 - 生产环境也会显示
   */
  static warn(...args: unknown[]) {
    console.warn(...args)
  }

  /**
   * 错误日志 - 生产环境也会显示
   */
  static error(...args: unknown[]) {
    console.error(...args)
  }
}

// 为了方便使用，可以导出简化的函数
export const log = Logger.debug
export const logInfo = Logger.info
export const logWarn = Logger.warn
export const logError = Logger.error