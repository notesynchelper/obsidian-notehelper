/**
 * 图片下载器
 * 负责从网络下载图片，支持重试机制
 */

import { requestUrl } from 'obsidian'
import { log, logError } from '../logger'
import { DownloadResult } from './types'

/**
 * 延迟函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 下载图片（带重试机制）
 * @param url 图片URL
 * @param maxRetries 最大重试次数
 * @param retryDelay 重试延迟（毫秒）
 * @returns 下载结果
 */
export async function downloadImage(
  url: string,
  maxRetries: number = 3,
  retryDelay: number = 1000
): Promise<DownloadResult> {
  let lastError: any = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      log(`尝试下载图片 (${attempt + 1}/${maxRetries + 1}): ${url}`)

      const response = await requestUrl({
        url,
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      })

      // 检查响应状态
      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.text}`)
      }

      // 检查内容类型
      const contentType = response.headers['content-type'] || ''
      if (!contentType.startsWith('image/')) {
        log(`警告: 内容类型不是图片 (${contentType}): ${url}`)
      }

      log(`图片下载成功: ${url}`)

      return {
        success: true,
        data: response.arrayBuffer,
      }
    } catch (error: any) {
      lastError = error
      logError(`下载图片失败 (${attempt + 1}/${maxRetries + 1}): ${url}`, error)

      // 如果不是最后一次尝试，等待后重试
      if (attempt < maxRetries) {
        const delay = retryDelay * Math.pow(2, attempt) // 指数退避
        log(`${delay}ms 后重试...`)
        await sleep(delay)
      }
    }
  }

  // 所有重试都失败
  return {
    success: false,
    error: lastError?.message || '下载失败',
  }
}

/**
 * 批量下载图片
 * @param urls 图片URL列表
 * @param maxRetries 最大重试次数
 * @param retryDelay 重试延迟（毫秒）
 * @param concurrency 并发数
 * @returns 下载结果映射表
 */
export async function batchDownloadImages(
  urls: string[],
  maxRetries: number = 3,
  retryDelay: number = 1000,
  concurrency: number = 3
): Promise<Map<string, DownloadResult>> {
  const results = new Map<string, DownloadResult>()

  // 分批下载（控制并发）
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency)

    log(`批量下载: ${i + 1}-${Math.min(i + concurrency, urls.length)}/${urls.length}`)

    const batchResults = await Promise.all(
      batch.map(async (url) => {
        const result = await downloadImage(url, maxRetries, retryDelay)
        return { url, result }
      })
    )

    // 保存结果
    for (const { url, result } of batchResults) {
      results.set(url, result)
    }
  }

  return results
}

/**
 * 检查 URL 是否为网络图片
 * @param url 图片URL
 * @returns 是否为网络图片
 */
export function isRemoteImage(url: string): boolean {
  try {
    // 排除本地路径
    if (
      url.startsWith('/') ||
      url.startsWith('./') ||
      url.startsWith('../') ||
      url.startsWith('file:') ||
      url.startsWith('app:') ||
      url.startsWith('vault:')
    ) {
      return false
    }

    // 排除 data URI
    if (url.startsWith('data:')) {
      return false
    }

    // 检查是否为 HTTP/HTTPS URL
    const urlObj = new URL(url)
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:'
  } catch (error) {
    // URL 解析失败，不是有效的网络URL
    return false
  }
}
