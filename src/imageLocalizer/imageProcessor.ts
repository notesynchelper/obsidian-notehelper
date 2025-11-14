/**
 * 图片处理器
 * 负责 MD5 计算、格式检测、PNG→JPEG 转换
 */

import { Vault, normalizePath, TFolder } from 'obsidian'
import { log, logError } from '../logger'
import CryptoJS from 'crypto-js'

/**
 * MD5 分段采样计算（性能优化）
 * 只采样头部、中部、尾部各 15KB，大幅提升大文件处理速度
 */
export function calculateMD5(data: ArrayBuffer): string {
  const SAMPLE_SIZE = 15000 // 15KB
  const uint8Array = new Uint8Array(data)
  const totalSize = uint8Array.length

  let sampledData: Uint8Array

  if (totalSize <= SAMPLE_SIZE * 3) {
    // 文件小于45KB，直接计算全部
    sampledData = uint8Array
  } else {
    // 采样：头部 + 中部 + 尾部
    const head = uint8Array.slice(0, SAMPLE_SIZE)
    const middle = uint8Array.slice(
      Math.floor(totalSize / 2) - Math.floor(SAMPLE_SIZE / 2),
      Math.floor(totalSize / 2) + Math.floor(SAMPLE_SIZE / 2)
    )
    const tail = uint8Array.slice(totalSize - SAMPLE_SIZE)

    // 合并采样数据
    sampledData = new Uint8Array(SAMPLE_SIZE * 3)
    sampledData.set(head, 0)
    sampledData.set(middle, SAMPLE_SIZE)
    sampledData.set(tail, SAMPLE_SIZE * 2)
  }

  // 转换为 WordArray 供 crypto-js 使用
  // CryptoJS WordArray.create expects an array-like structure
  const wordArray = CryptoJS.lib.WordArray.create(sampledData as unknown as number[])
  const hash = CryptoJS.MD5(wordArray).toString()

  return `${hash}_MD5`
}

/**
 * 检测图片格式
 * 通过文件头魔数检测真实格式
 */
export function detectImageFormat(data: ArrayBuffer): string {
  const uint8Array = new Uint8Array(data)

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    uint8Array[0] === 0x89 &&
    uint8Array[1] === 0x50 &&
    uint8Array[2] === 0x4e &&
    uint8Array[3] === 0x47
  ) {
    return 'png'
  }

  // JPEG: FF D8 FF
  if (
    uint8Array[0] === 0xff &&
    uint8Array[1] === 0xd8 &&
    uint8Array[2] === 0xff
  ) {
    return 'jpg'
  }

  // GIF: 47 49 46 38
  if (
    uint8Array[0] === 0x47 &&
    uint8Array[1] === 0x49 &&
    uint8Array[2] === 0x46 &&
    uint8Array[3] === 0x38
  ) {
    return 'gif'
  }

  // WebP: 52 49 46 46 ... 57 45 42 50
  if (
    uint8Array[0] === 0x52 &&
    uint8Array[1] === 0x49 &&
    uint8Array[2] === 0x46 &&
    uint8Array[3] === 0x46 &&
    uint8Array[8] === 0x57 &&
    uint8Array[9] === 0x45 &&
    uint8Array[10] === 0x42 &&
    uint8Array[11] === 0x50
  ) {
    return 'webp'
  }

  // SVG: 检测文本内容
  try {
    const text = new TextDecoder('utf-8').decode(uint8Array.slice(0, 100))
    if (text.includes('<svg') || text.includes('<?xml')) {
      return 'svg'
    }
  } catch (e) {
    // 忽略解码错误
  }

  // 默认返回 unknown
  return 'unknown'
}

/**
 * PNG 转 JPEG
 * 使用 Canvas API 进行转换
 */
export async function convertPngToJpeg(
  data: ArrayBuffer,
  quality: number = 0.85
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    try {
      // 创建 Blob
      const blob = new Blob([data], { type: 'image/png' })

      // 创建 Image 对象
      const img = new Image()
      const url = URL.createObjectURL(blob)

      img.onload = () => {
        try {
          // 创建 Canvas
          const canvas = document.createElement('canvas')
          canvas.width = img.width
          canvas.height = img.height

          // 绘制图片
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error('无法创建 Canvas 上下文'))
            return
          }

          // 填充白色背景（JPEG不支持透明度）
          ctx.fillStyle = '#FFFFFF'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(img, 0, 0)

          // 转换为 JPEG Blob
          canvas.toBlob(
            async (jpegBlob) => {
              if (!jpegBlob) {
                reject(new Error('转换 JPEG 失败'))
                return
              }

              // 转换为 ArrayBuffer
              const arrayBuffer = await jpegBlob.arrayBuffer()
              URL.revokeObjectURL(url)
              resolve(arrayBuffer)
            },
            'image/jpeg',
            quality
          )
        } catch (error) {
          URL.revokeObjectURL(url)
          reject(error)
        }
      }

      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('图片加载失败'))
      }

      img.src = url
    } catch (error) {
      reject(error)
    }
  })
}

/**
 * 保存图片到 Vault
 * @param vault Obsidian Vault 对象
 * @param folderPath 目标文件夹路径
 * @param fileName 文件名（含扩展名）
 * @param data 图片数据
 * @returns 保存后的文件路径
 */
export async function saveImageToVault(
  vault: Vault,
  folderPath: string,
  fileName: string,
  data: ArrayBuffer
): Promise<string> {
  try {
    // 规范化文件夹路径
    const normalizedFolder = normalizePath(folderPath)

    // 检查文件夹是否存在，不存在则创建
    const folder = vault.getAbstractFileByPath(normalizedFolder)
    if (!(folder instanceof TFolder)) {
      log(`创建文件夹: ${normalizedFolder}`)
      await vault.createFolder(normalizedFolder)
    }

    // 完整文件路径
    const filePath = normalizePath(`${normalizedFolder}/${fileName}`)

    // 检查文件是否已存在
    const existingFile = vault.getAbstractFileByPath(filePath)
    if (existingFile) {
      log(`文件已存在，跳过: ${filePath}`)
      return filePath
    }

    // 保存文件
    await vault.createBinary(filePath, data)
    log(`图片保存成功: ${filePath}`)

    return filePath
  } catch (error) {
    logError(`保存图片失败: ${folderPath}/${fileName}`, error)
    throw error
  }
}

/**
 * 从 URL 提取文件名
 */
export function extractFilenameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    const pathname = urlObj.pathname
    const filename = pathname.substring(pathname.lastIndexOf('/') + 1)

    // 移除查询参数
    return filename.split('?')[0] || 'image'
  } catch (error) {
    return 'image'
  }
}

/**
 * 清理文件名中的非法字符
 */
export function sanitizeFilename(filename: string): string {
  // 移除或替换 Windows/macOS 非法字符
  return filename
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 200) // 限制长度
}
