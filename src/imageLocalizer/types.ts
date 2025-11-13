/**
 * 图片本地化相关的类型定义
 */

import { TFile } from 'obsidian'

/**
 * 图片信息
 */
export interface ImageInfo {
  /** 原始URL */
  originalUrl: string
  /** 图片在笔记中的原始文本（包含markdown语法） */
  originalText: string
  /** alt文本或caption */
  alt?: string
  /** 图片尺寸信息（如果有） */
  size?: string
  /** 匹配的起始位置 */
  startIndex: number
  /** 匹配的结束位置 */
  endIndex: number
}

/**
 * 本地化任务
 */
export interface LocalizeTask {
  /** 笔记文件 */
  file: TFile
  /** 需要处理的图片列表 */
  images: ImageInfo[]
  /** 任务创建时间 */
  createdAt: number
  /** 重试次数 */
  retryCount: number
}

/**
 * 图片下载结果
 */
export interface DownloadResult {
  /** 是否成功 */
  success: boolean
  /** 本地文件路径 */
  localPath?: string
  /** 错误信息 */
  error?: string
  /** 文件内容（ArrayBuffer） */
  data?: ArrayBuffer
}

/**
 * 图片处理选项
 */
export interface ImageProcessOptions {
  /** 是否启用PNG转JPEG */
  enablePngToJpeg: boolean
  /** JPEG质量（0-100） */
  jpegQuality: number
  /** 图片存储文件夹模板 */
  attachmentFolder: string
  /** 文件夹日期格式 */
  folderDateFormat: string
  /** 下载重试次数 */
  maxRetries: number
  /** 重试延迟（毫秒） */
  retryDelay: number
}
