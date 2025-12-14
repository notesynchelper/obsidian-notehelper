/**
 * 异步任务队列
 * 用于管理图片本地化任务，避免重复处理
 */

import { LocalizeTask } from './types'
import { log } from '../logger'

/**
 * 图片本地化任务队列
 */
export class ImageLocalizationQueue {
  private queue: LocalizeTask[] = []
  private processing: boolean = false
  private processedFiles: Set<string> = new Set()

  /**
   * 添加任务到队列
   * @param task 本地化任务
   */
  enqueue(task: LocalizeTask): void {
    const filePath = task.file.path

    // 检查是否已在队列或已处理
    if (this.isInQueue(filePath) || this.processedFiles.has(filePath)) {
      // log(`任务已存在，跳过: ${filePath}`)
      return
    }

    this.queue.push(task)
    log(`任务入队: ${filePath} (队列长度: ${this.queue.length})`)
  }

  /**
   * 从队列取出任务
   * @returns 本地化任务，如果队列为空则返回 undefined
   */
  dequeue(): LocalizeTask | undefined {
    return this.queue.shift()
  }

  /**
   * 查看队列头部任务（不移除）
   * @returns 本地化任务，如果队列为空则返回 undefined
   */
  peek(): LocalizeTask | undefined {
    return this.queue[0]
  }

  /**
   * 检查队列是否为空
   */
  isEmpty(): boolean {
    return this.queue.length === 0
  }

  /**
   * 获取队列长度
   */
  size(): number {
    return this.queue.length
  }

  /**
   * 检查文件是否在队列中
   * @param filePath 文件路径
   */
  isInQueue(filePath: string): boolean {
    return this.queue.some((task) => task.file.path === filePath)
  }

  /**
   * 检查文件是否已处理
   * @param filePath 文件路径
   */
  isProcessed(filePath: string): boolean {
    return this.processedFiles.has(filePath)
  }

  /**
   * 标记文件已处理
   * @param filePath 文件路径
   */
  markAsProcessed(filePath: string): void {
    this.processedFiles.add(filePath)
    log(`标记为已处理: ${filePath}`)
  }

  /**
   * 取消标记文件已处理（用于重试）
   * @param filePath 文件路径
   */
  unmarkAsProcessed(filePath: string): void {
    this.processedFiles.delete(filePath)
    log(`取消已处理标记: ${filePath}`)
  }

  /**
   * 清空队列
   */
  clear(): void {
    this.queue = []
    log('队列已清空')
  }

  /**
   * 清空已处理记录
   */
  clearProcessed(): void {
    this.processedFiles.clear()
    log('已处理记录已清空')
  }

  /**
   * 设置处理状态
   * @param processing 是否正在处理
   */
  setProcessing(processing: boolean): void {
    this.processing = processing
  }

  /**
   * 获取处理状态
   */
  isProcessing(): boolean {
    return this.processing
  }

  /**
   * 获取队列统计信息
   */
  getStats(): {
    queueSize: number
    processedCount: number
    isProcessing: boolean
  } {
    return {
      queueSize: this.queue.length,
      processedCount: this.processedFiles.size,
      isProcessing: this.processing,
    }
  }
}
