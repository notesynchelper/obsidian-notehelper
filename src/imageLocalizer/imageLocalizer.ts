/**
 * 图片本地化核心类
 * 负责协调图片检测、下载、处理和链接替换
 */

import { App, TFile, Vault, normalizePath } from 'obsidian'
import { log, logError } from '../logger'
import { ImageInfo, ImageProcessOptions } from './types'
import { downloadImage, isRemoteImage } from './imageDownloader'
import {
  calculateMD5,
  detectImageFormat,
  convertPngToJpeg,
  saveImageToVault,
  extractFilenameFromUrl,
  sanitizeFilename,
} from './imageProcessor'
import { ImageLocalizationQueue } from './imageQueue'
import { render } from '../settings/template'
import { DateTime } from 'luxon'

/**
 * 图片链接匹配正则表达式
 * 匹配以下格式：
 * - Markdown: ![alt](url)
 * - Wiki: ![[url]]
 * - HTML: <img src="url">
 */
const IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)|!\[\[([^\]]+)\]\]|<img[^>]+src=["']([^"']+)["']/g

export class ImageLocalizer {
  private app: App
  private vault: Vault
  private queue: ImageLocalizationQueue
  private options: ImageProcessOptions
  private md5Cache: Map<string, string> = new Map() // URL -> MD5 缓存

  constructor(app: App, options: ImageProcessOptions) {
    this.app = app
    this.vault = app.vault
    this.queue = new ImageLocalizationQueue()
    this.options = options
  }

  /**
   * 更新处理选项
   */
  updateOptions(options: ImageProcessOptions): void {
    this.options = options
  }

  /**
   * 检测笔记中的网络图片
   * @param file 笔记文件
   * @returns 网络图片列表
   */
  async detectRemoteImages(file: TFile): Promise<ImageInfo[]> {
    try {
      const content = await this.vault.read(file)
      const images: ImageInfo[] = []

      let match: RegExpExecArray | null

      while ((match = IMAGE_PATTERN.exec(content)) !== null) {
        const [fullMatch, markdownAlt, markdownUrl, wikiUrl, htmlUrl] = match

        // 提取 URL
        const url = markdownUrl || wikiUrl || htmlUrl
        if (!url) continue

        // 检查是否为网络图片
        if (!isRemoteImage(url)) {
          log(`跳过非网络图片: ${url}`)
          continue
        }

        images.push({
          originalUrl: url,
          originalText: fullMatch,
          alt: markdownAlt || undefined,
          startIndex: match.index,
          endIndex: match.index + fullMatch.length,
        })
      }

      log(`检测到 ${images.length} 张网络图片: ${file.path}`)
      return images
    } catch (error) {
      logError(`检测图片失败: ${file.path}`, error)
      return []
    }
  }

  /**
   * 本地化单个文件中的所有图片
   * @param file 笔记文件
   */
  async localizeFile(file: TFile): Promise<void> {
    try {
      log(`开始本地化图片: ${file.path}`)

      // 检测网络图片
      const images = await this.detectRemoteImages(file)
      if (images.length === 0) {
        log(`没有需要本地化的图片: ${file.path}`)
        return
      }

      // 读取文件内容
      let content = await this.vault.read(file)
      const replacements: { original: string; local: string }[] = []

      // 处理每张图片
      for (const image of images) {
        try {
          const localPath = await this.processImage(image, file)
          if (localPath) {
            replacements.push({
              original: image.originalText,
              local: this.generateMarkdownLink(image, localPath),
            })
          }
        } catch (error) {
          logError(`处理图片失败: ${image.originalUrl}`, error)
        }
      }

      // 批量替换链接
      if (replacements.length > 0) {
        for (const { original, local } of replacements) {
          content = content.replace(original, local)
        }

        // 保存修改
        await this.vault.modify(file, content)
        log(`图片本地化完成: ${file.path} (${replacements.length}/${images.length})`)
      }
    } catch (error) {
      logError(`本地化文件失败: ${file.path}`, error)
    }
  }

  /**
   * 处理单张图片（下载、转换、保存）
   * @param image 图片信息
   * @param file 所属文件
   * @returns 本地文件路径，失败返回 null
   */
  private async processImage(
    image: ImageInfo,
    file: TFile
  ): Promise<string | null> {
    try {
      const url = image.originalUrl

      // 下载图片
      const downloadResult = await downloadImage(
        url,
        this.options.maxRetries,
        this.options.retryDelay
      )

      if (!downloadResult.success || !downloadResult.data) {
        logError(`下载失败: ${url}`)
        return null
      }

      let imageData = downloadResult.data

      // 检测图片格式
      const format = detectImageFormat(imageData)
      log(`图片格式: ${format} - ${url}`)

      // PNG 转 JPEG（如果启用）
      let finalFormat = format
      if (
        this.options.enablePngToJpeg &&
        format === 'png'
      ) {
        try {
          log(`转换 PNG → JPEG: ${url}`)
          imageData = await convertPngToJpeg(
            imageData,
            this.options.jpegQuality / 100
          )
          finalFormat = 'jpg'
          log(`转换成功: ${url}`)
        } catch (error) {
          logError(`PNG转JPEG失败，使用原格式: ${url}`, error)
        }
      }

      // 计算 MD5
      const md5 = calculateMD5(imageData)
      this.md5Cache.set(url, md5)

      // 生成文件名
      const extension = finalFormat === 'unknown' ? 'png' : finalFormat
      const fileName = `${md5}.${extension}`

      // 生成存储路径
      const folderPath = this.generateFolderPath(file)

      // 保存图片
      const localPath = await saveImageToVault(
        this.vault,
        folderPath,
        fileName,
        imageData
      )

      return localPath
    } catch (error) {
      logError(`处理图片失败: ${image.originalUrl}`, error)
      return null
    }
  }

  /**
   * 生成图片存储文件夹路径
   * @param file 笔记文件
   */
  private generateFolderPath(file: TFile): string {
    // 创建临时 item 对象用于模板渲染
    const tempItem: any = {
      title: file.basename,
      savedAt: DateTime.now().toISO(),
    }

    // 渲染文件夹路径模板
    const folderPath = render(
      tempItem,
      this.options.attachmentFolder,
      this.options.folderDateFormat
    )

    return normalizePath(folderPath)
  }

  /**
   * 生成 Markdown 图片链接
   * @param image 图片信息
   * @param localPath 本地路径
   */
  private generateMarkdownLink(image: ImageInfo, localPath: string): string {
    // 优先使用 Wiki 链接格式（Obsidian 推荐）
    if (image.alt) {
      return `![[${localPath}|${image.alt}]]`
    }

    return `![[${localPath}]]`
  }

  /**
   * 添加文件到本地化队列
   * @param file 笔记文件
   */
  async enqueueFile(file: TFile): Promise<void> {
    const images = await this.detectRemoteImages(file)
    if (images.length === 0) {
      log(`没有网络图片，跳过入队: ${file.path}`)
      return
    }

    this.queue.enqueue({
      file,
      images,
      createdAt: Date.now(),
      retryCount: 0,
    })
  }

  /**
   * 处理队列中的任务
   */
  async processQueue(): Promise<void> {
    if (this.queue.isProcessing() || this.queue.isEmpty()) {
      return
    }

    this.queue.setProcessing(true)
    log('开始处理图片本地化队列...')

    while (!this.queue.isEmpty()) {
      const task = this.queue.dequeue()
      if (!task) break

      try {
        await this.localizeFile(task.file)
        this.queue.markAsProcessed(task.file.path)
      } catch (error) {
        logError(`处理任务失败: ${task.file.path}`, error)

        // 重试逻辑
        if (task.retryCount < this.options.maxRetries) {
          task.retryCount++
          this.queue.enqueue(task)
          log(`任务重试 (${task.retryCount}/${this.options.maxRetries}): ${task.file.path}`)
        }
      }
    }

    this.queue.setProcessing(false)
    log('图片本地化队列处理完成')
  }

  /**
   * 获取队列统计信息
   */
  getQueueStats() {
    return this.queue.getStats()
  }

  /**
   * 清空队列
   */
  clearQueue(): void {
    this.queue.clear()
  }

  /**
   * 清空 MD5 缓存
   */
  clearCache(): void {
    this.md5Cache.clear()
  }
}
