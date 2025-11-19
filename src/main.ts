import { Item } from '@omnivore-app/api'
import { DateTime } from 'luxon'
import Mustache from 'mustache'
import {
  addIcon,
  normalizePath,
  Notice,
  Plugin,
  requestUrl,
  stringifyYaml,
  TFile,
  TFolder,
} from 'obsidian'
import { getItems } from './api'
import { log, logError, logWarn } from './logger'
import { DEFAULT_SETTINGS, ImageMode, MergeMode, OmnivoreSettings } from './settings'
import {
  preParseTemplate,
  render,
  renderFilename,
  renderItemContent,
  isWeChatMessage,
  renderWeChatMessageSimple,
} from './settings/template'
import { OmnivoreSettingTab } from './settingsTab'
import {
  DATE_FORMAT,
  findFrontMatterIndex,
  formatDate,
  getQueryFromFilter,
  parseDateTime,
  parseFrontMatterFromContent,
  removeFrontMatterFromContent,
  replaceIllegalCharsFile,
  replaceIllegalCharsFolder,
  setOrUpdateHighlightColors,
} from './util'
import { ConfigMigrationManager } from './configMigration'
import { ImageLocalizer } from './imageLocalizer/imageLocalizer'
import { ImageProcessOptions } from './imageLocalizer/types'
import { SyncContext } from './sync/SyncContext'
import { MergeProcessor } from './sync/MergeProcessor'
import { FileProcessor } from './sync/FileProcessor'

export default class OmnivorePlugin extends Plugin {
  settings: OmnivoreSettings
  private refreshTimeout: NodeJS.Timeout | null = null
  private syncing: boolean = false
  private debouncedSaveSettings: () => void
  configMigrationManager: ConfigMigrationManager
  imageLocalizer: ImageLocalizer | null = null

  constructor(...args: ConstructorParameters<typeof Plugin>) {
    super(...args)
    this.debouncedSaveSettings = this.createDebouncedSave()
  }

  private createDebouncedSave(): () => void {
    let timeout: NodeJS.Timeout | null = null
    return async () => {
      if (timeout) {
        clearTimeout(timeout)
      }
      timeout = setTimeout(async () => {
        log('💾 [防抖保存] 开始执行磁盘 I/O 操作...')
        const startTime = Date.now()
        await this.saveData(this.settings)
        const duration = Date.now() - startTime
        log(`💾 [防抖保存] saveData 完成，耗时: ${duration}ms`)
        if (this.configMigrationManager) {
          try {
            await this.configMigrationManager.backupSettings(this.settings)
            log('💾 [防抖保存] 备份完成')
          } catch (error) {
            log('配置备份时遇到问题，但设置已正常保存', error)
          }
        }
      }, 60000) // 60秒（优化启动性能，减少磁盘I/O频率）
    }
  }

  async onload() {
    // 🚀 优化启动速度：延迟非关键操作
    log('🚀 笔记同步助手启动中...')

    // 关键操作：立即加载基本设置
    await this.loadEssentialSettings()

    // 注册核心组件
    this.registerCoreComponents()

    // 🚀 延迟非关键操作到启动完成后再执行
    this.app.workspace.onLayoutReady(() => {
      // 延迟3秒后执行非关键初始化（优化启动速度）
      setTimeout(() => {
        void this.initializeNonCriticalFeatures()
      }, 3000)
    })
  }

  /**
   * 🚀 快速加载基本设置（不执行配置迁移，避免阻塞启动）
   */
  private async loadEssentialSettings(): Promise<void> {
    try {
      // 1. 加载主配置
      const loadedData = await this.loadData()
      this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData)

      log('📖 加载主配置完成', {
        hasData: !!loadedData,
        apiKey: this.settings.apiKey ? '***' : '(空)',
        version: this.settings.version,
        syncAt: this.settings.syncAt || '(空)'
      })

      // 2. 仅在配置完全丢失时执行紧急恢复
      const hasApiKey = this.settings.apiKey && this.settings.apiKey !== DEFAULT_SETTINGS.apiKey

      if (!hasApiKey) {
        log('⚠️ 检测到API Key丢失，执行紧急恢复...')
        const tempMigrationManager = new ConfigMigrationManager(this.app, this)
        const restoredSettings = await tempMigrationManager.performMigration(
          this.settings,
          this.manifest.version
        )
        this.settings = restoredSettings
        await this.saveData(this.settings)
        log('✅ 紧急恢复完成')
      } else {
        // ✅ 配置正常，只更新版本号（不触发完整迁移）
        if (this.settings.version !== this.manifest.version) {
          this.settings.version = this.manifest.version
          // 延迟保存，不阻塞启动
          setTimeout(() => this.saveSettings(), 3000)
        }
      }

      // 3. 重置同步状态（轻量级操作）
      this.settings.intervalId = 0
    } catch (error) {
      logError('❌ 加载基本设置失败:', error)
      this.settings = { ...DEFAULT_SETTINGS }
    }
  }

  /**
   * 🚀 注册核心组件（快速操作）
   */
  private registerCoreComponents(): void {
    // 注册命令和UI组件
    this.registerCommands()
    this.registerRibbonIcon()
    // ✅ 设置页面Tab延迟创建，移到initializeNonCriticalFeatures()

    // 启动时同步检查（轻量级）
    if (this.settings.syncOnStart) {
      this.app.workspace.onLayoutReady(() => {
        // 延迟2秒执行同步，确保启动完成
        setTimeout(async () => {
          if (this.settings.apiKey) {
            await this.fetchOmnivore(false)
            this.refreshFileExplorer()
          }
        }, 2000)
      })
    }
  }

  /**
   * 🚀 延迟初始化非关键功能
   */
  private async initializeNonCriticalFeatures(): Promise<void> {
    try {
      log('🚀 初始化非关键功能...')

      // 0. 延迟创建设置页面Tab（避免阻塞启动）
      this.addSettingTab(new OmnivoreSettingTab(this.app, this))

      // 1. 延迟创建配置迁移管理器
      this.configMigrationManager = new ConfigMigrationManager(this.app, this)

      // 2. 延迟执行设置兼容性处理
      await this.processSettingsCompatibility()

      // 3. 延迟启动定时同步
      this.scheduleSync()

      // 4. 延迟初始化高亮颜色
      setOrUpdateHighlightColors(this.settings.highlightColorMapping)

      // 5. 初始化图片本地化器（仅在本地模式下）
      if (this.settings.imageMode === ImageMode.LOCAL) {
        this.initializeImageLocalizer()
      }

      // 6. 延迟刷新文件浏览器
      this.refreshFileExplorer()

      log('🚀 非关键功能初始化完成')
    } catch (error) {
      logError('非关键功能初始化失败:', error)
      // 非关键功能失败不应该影响插件正常使用
    }
  }

  /**
   * 初始化图片本地化器
   */
  private initializeImageLocalizer(): void {
    try {
      const options: ImageProcessOptions = {
        enablePngToJpeg: this.settings.enablePngToJpeg,
        jpegQuality: this.settings.jpegQuality,
        attachmentFolder: this.settings.imageAttachmentFolder,
        folderDateFormat: this.settings.folderDateFormat,
        maxRetries: this.settings.imageDownloadRetries,
        retryDelay: 1000, // 1秒重试延迟
      }

      this.imageLocalizer = new ImageLocalizer(this.app, options)
      log('✅ 图片本地化器初始化完成')
    } catch (error) {
      logError('图片本地化器初始化失败:', error)
    }
  }

  /**
   * 将文件添加到图片本地化队列
   */
  private async enqueueFileForImageLocalization(file: TFile): Promise<void> {
    if (this.settings.imageMode !== ImageMode.LOCAL || !this.imageLocalizer) {
      return
    }

    try {
      await this.imageLocalizer.enqueueFile(file)
    } catch (error) {
      logError(`添加文件到图片本地化队列失败: ${file.path}`, error)
    }
  }

  /**
   * 注释掉文件中的图片语法（不加载图片模式）
   */
  private async commentOutImages(files: TFile[]): Promise<void> {
    log(`开始注释 ${files.length} 个文件中的图片...`)

    for (const file of files) {
      try {
        let content = await this.app.vault.read(file)
        const originalContent = content

        // 匹配并注释 ![alt](url) 格式
        content = content.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<!-- ![$1]($2) -->')

        // 匹配并注释 ![[image]] 格式
        content = content.replace(/!\[\[([^\]]+)\]\]/g, '<!-- ![[$1]] -->')

        // 匹配并注释 <img> 标签
        content = content.replace(/<img([^>]+)>/g, '<!-- <img$1> -->')

        if (content !== originalContent) {
          await this.app.vault.modify(file, content)
          log(`已注释图片: ${file.path}`)
        }
      } catch (error) {
        logError(`注释图片失败: ${file.path}`, error)
      }
    }
  }

  /**
   * 🚀 处理设置兼容性（从loadSettings中提取）
   */
  private async processSettingsCompatibility(): Promise<void> {
    try {
      let needsSave = false

      // 处理旧版本过滤器兼容性
      if (this.settings.filter === 'ADVANCED') {
        this.settings.filter = 'ALL'
        this.settings.customQuery = `in:all ${
          this.settings.customQuery ? `(${this.settings.customQuery})` : ''
        }`
        needsSave = true
      }

      // 处理自定义查询兼容性
      if (!this.settings.customQuery) {
        this.settings.customQuery = getQueryFromFilter(this.settings.filter)
        needsSave = true
      }

      // 迁移旧的图片本地化布尔值设置到新的枚举模式
      const settingsAny = this.settings as any
      if (typeof settingsAny.enableImageLocalization === 'boolean') {
        log('检测到旧版图片设置，开始迁移...')
        const oldValue = settingsAny.enableImageLocalization
        this.settings.imageMode = oldValue ? ImageMode.LOCAL : ImageMode.REMOTE
        delete settingsAny.enableImageLocalization
        needsSave = true
        log(`图片设置已迁移: ${oldValue} -> ${this.settings.imageMode}`)
      }

      if (needsSave) {
        await this.saveSettings()
      }
    } catch (error) {
      logError('处理设置兼容性失败:', error)
    }
  }

  /**
   * 🚀 注册命令（快速操作）
   */
  private registerCommands(): void {
    this.addCommand({
      id: 'sync',
      name: 'Sync new changes',
      callback: async () => {
        await this.fetchOmnivore()
      },
    })

    this.addCommand({
      id: 'resync',
      name: 'Resync all articles',
      callback: async () => {
        this.settings.syncAt = ''
        await this.saveSettings()
        new Notice('笔记同步助手最后同步时间已重置')
        await this.fetchOmnivore()
      },
    })
  }

  /**
   * 🚀 注册图标（快速操作）
   */
  private registerRibbonIcon(): void {
    const iconId = 'tongbuzhushou'
    addIcon(
      iconId,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
      <text x="2" y="13" font-size="12" font-family="Noto Sans SC, sans-serif" font-weight="bold" fill="currentColor">同</text></svg>`
    )

    this.addRibbonIcon(iconId, iconId, async (evt: MouseEvent) => {
      await this.fetchOmnivore()
    })
  }

  onunload() {
    // 清理防抖timeout
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout)
      this.refreshTimeout = null
    }
    // registerInterval 会自动清理定时器，无需手动处理
  }

  
  async saveSettings(immediate = false) {
    if (immediate) {
      log('💾 [立即保存] 开始执行磁盘 I/O 操作...')
      const startTime = Date.now()
      await this.saveData(this.settings)
      const duration = Date.now() - startTime
      log(`💾 [立即保存] saveData 完成，耗时: ${duration}ms`)
      // 同时备份配置到vault根目录，防止插件升级时丢失
      if (this.configMigrationManager) {
        try {
          await this.configMigrationManager.backupSettings(this.settings)
          log('💾 [立即保存] 备份完成')
        } catch (error) {
          // 备份失败不应该影响设置保存
          log('配置备份时遇到问题，但设置已正常保存', error)
        }
      }
    } else {
      log('💾 [防抖保存] 调用防抖保存，将在30秒后执行...')
      this.debouncedSaveSettings()
    }
  }

  scheduleSync(): void {
    // clear previous interval
    if (this.settings.intervalId > 0) {
      window.clearInterval(this.settings.intervalId)
      this.settings.intervalId = 0
    }

    const frequency = this.settings.frequency
    if (frequency > 0) {
      // schedule new interval
      const intervalId = window.setInterval(
        () => {
          void this.fetchOmnivore(false)
        },
        frequency * 60 * 1000,
      )

      // save new interval id (no need to persist to disk, just keep in memory)
      this.settings.intervalId = intervalId

      // register interval for proper cleanup on plugin unload
      this.registerInterval(intervalId)
    }
  }

  async downloadFileAsAttachment(item: Item): Promise<string> {
    // download pdf from the URL to the attachment folder
    const url = item.url
    const response = await requestUrl({
      url,
      contentType: 'application/pdf',
    })
    const folderName = normalizePath(
      render(
        item,
        this.settings.attachmentFolder,
        this.settings.folderDateFormat,
      ),
    )
    const folder = this.app.vault.getAbstractFileByPath(folderName)
    if (!(folder instanceof TFolder)) {
      await this.app.vault.createFolder(folderName)
    }
    const fileName = normalizePath(`${folderName}/${item.id}.pdf`)
    const file = this.app.vault.getAbstractFileByPath(fileName)
    if (!(file instanceof TFile)) {
      const newFile = await this.app.vault.createBinary(
        fileName,
        response.arrayBuffer,
      )
      return newFile.path
    }
    return file.path
  }

  async fetchOmnivore(manualSync = true) {
    const {
      syncAt,
      apiKey,
      customQuery,
      highlightOrder,
      template,
      folder,
      filename,
      mergeMode,
      frontMatterVariables,
      frontMatterTemplate,
      singleFileName,
    } = this.settings

    // 根据合并模式确定是否启用单文件模式（用于兼容现有逻辑）
    const isSingleFile = mergeMode !== MergeMode.NONE

    if (this.syncing) {
      new Notice('🐢 正在同步中...')
      return
    }

    if (!apiKey) {
      new Notice('缺少 API 密钥')
      return
    }

    // ✅ 优化：立即显示 UI 反馈，不等待 I/O
    if (manualSync) {
      new Notice('🚀 正在获取数据...')
    }

    this.syncing = true

    try {
      log(`笔记同步助手开始同步，自: '${syncAt}'`)

      // pre-parse template
      log('🔧 开始解析前端模板')
      if (frontMatterTemplate) {
        preParseTemplate(frontMatterTemplate)
      }
      log('🔧 开始解析主模板')
      const templateSpans = preParseTemplate(template)
      log('🔧 模板解析完成，templateSpans:', templateSpans)
      // check if we need to include content or file attachment
      const includeContent = templateSpans.some(
        (templateSpan) => templateSpan[1] === 'content',
      )
      log('🔧 includeContent:', includeContent)
      const includeFileAttachment = templateSpans.some(
        (templateSpan) => templateSpan[1] === 'fileAttachment',
      )
      log('🔧 includeFileAttachment:', includeFileAttachment)

      const size = 15

      // 🆕 创建同步上下文（集中管理状态，自动去重）
      const syncContext = new SyncContext(this.app, this.settings, this.imageLocalizer)
      const mergeProcessor = new MergeProcessor(syncContext)
      const fileProcessor = new FileProcessor(syncContext)

      log('🔧 准备开始循环获取数据')
      for (let after = 0; ; after += size) {
        log(`🔧 开始获取第 ${after/size + 1} 批数据`)
        const [items, hasNextPage] = await getItems(
          this.settings.endpoint,
          apiKey,
          after,
          size,
          parseDateTime(syncAt).toISO() || undefined,
          customQuery,
          includeContent,
          'highlightedMarkdown',
        )

        log(`🔧 成功获取数据，items数量: ${items.length}，hasNextPage: ${hasNextPage}`)

        let processedCount = 0
        for (const item of items) {
          // 每处理50篇文章输出一次进度
          processedCount++
          if (processedCount % 50 === 0) {
            log(`🔧 已处理 ${processedCount}/${items.length} 篇文章`)
          }

          // 🆕 容错处理：单篇文章失败不中断整体同步
          try {
            // 对于企微消息,从标题提取日期用于文件夹路径
            let folderName: string
            if (isSingleFile && item.title.startsWith('同步助手_')) {
              const titleParts = item.title.split('_')
              if (titleParts.length >= 2 && titleParts[1].length === 8) {
              // 从标题提取日期: yyyyMMdd -> ISO格式，让 formatDate 根据 folderDateFormat 设置格式化
              const dateStr = titleParts[1]
              const year = dateStr.substring(0, 4)
              const month = dateStr.substring(4, 6)
              const day = dateStr.substring(6, 8)
              // 构造 ISO 日期字符串，而不是硬编码格式
              const isoDate = `${year}-${month}-${day}T00:00:00.000Z`

              // 创建临时item对象,使用提取的日期
              const tempItem = {
                ...item,
                savedAt: isoDate, // 传递 ISO 格式，让 render 函数根据 folderDateFormat 格式化
              }
              folderName = replaceIllegalCharsFolder(
                normalizePath(render(tempItem, folder, this.settings.folderDateFormat)),
              )
            } else {
              folderName = replaceIllegalCharsFolder(
                normalizePath(render(item, folder, this.settings.folderDateFormat)),
              )
            }
          } else {
            folderName = replaceIllegalCharsFolder(
              normalizePath(render(item, folder, this.settings.folderDateFormat)),
            )
          }
          // log(`🔧 文件夹名称: ${folderName}`)
          const omnivoreFolder =
            this.app.vault.getAbstractFileByPath(folderName)
          if (!(omnivoreFolder instanceof TFolder)) {
            try {
              // log(`🔧 创建文件夹: ${folderName}`)
              await this.app.vault.createFolder(folderName)
              // log(`🔧 文件夹创建成功: ${folderName}`)
            } catch (error) {
              // 处理文件夹已存在的情况
              if (error.toString().includes('Folder already exists') ||
                  error.toString().includes('already exists')) {
                // log(`🔧 文件夹已存在: ${folderName}`)
                // 简化处理：触发vault刷新事件
                this.app.vault.trigger('changed')
              } else {
                logError(`🔧 文件夹创建失败: ${folderName}`, error)
                throw error
              }
            }
          } else {
            // log(`🔧 文件夹已存在: ${folderName}`)
          }
          // log(`🔧 开始处理文件附件`)
          const fileAttachment =
            item.pageType === 'FILE' && includeFileAttachment
              ? await this.downloadFileAsAttachment(item)
              : undefined
          // log(`🔧 文件附件处理完成`)
          // log(`🔧 开始渲染内容`)

          // 判断是否需要合并到单文件：
          // - MergeMode.MESSAGES: 只合并企微消息
          // - MergeMode.ALL: 合并所有文章
          const shouldMergeIntoSingleFile =
            (mergeMode === MergeMode.MESSAGES && isWeChatMessage(item)) ||
            mergeMode === MergeMode.ALL

          const content = renderItemContent(
            item,
            template,
            highlightOrder,
            this.settings.enableHighlightColorRender
              ? this.settings.highlightManagerId
              : undefined,
            this.settings.dateHighlightedFormat,
            this.settings.dateSavedFormat,
            shouldMergeIntoSingleFile,
            frontMatterVariables,
            frontMatterTemplate,
            this.settings.sectionSeparator,
            this.settings.sectionSeparatorEnd,
            fileAttachment,
            this.settings.wechatMessageTemplate,
          )
          // log(`🔧 内容渲染完成`)
          // use the custom filename
          let customFilename = replaceIllegalCharsFile(
            renderFilename(item, filename, this.settings.filenameDateFormat),
          )

          // 检测是否为企微消息（标题格式：同步助手_yyyyMMdd_xxx_类型）
          if (isSingleFile && item.title.startsWith('同步助手_')) {
            // 提取日期部分（格式：yyyyMMdd）
            const titleParts = item.title.split('_')
            if (titleParts.length >= 2) {
              const dateStr = titleParts[1] // yyyyMMdd
              // 将 yyyyMMdd 转换为 ISO 日期格式，让 formatDate 根据 filenameDateFormat 设置格式化
              if (dateStr.length === 8) {
                const year = dateStr.substring(0, 4)
                const month = dateStr.substring(4, 6)
                const day = dateStr.substring(6, 8)
                // 构造 ISO 日期字符串，而不是硬编码格式
                const isoDate = `${year}-${month}-${day}T00:00:00.000Z`

                // 使用 singleFileName 模板
                const singleFileTemplate = singleFileName || '同步助手_{{{date}}}'
                // 创建临时item对象用于渲染文件名
                const tempItem = {
                  ...item,
                  savedAt: isoDate, // 传递 ISO 格式，让 render 函数根据 singleFileDateFormat 格式化
                }
                customFilename = replaceIllegalCharsFile(
                  renderFilename(tempItem, singleFileTemplate, this.settings.singleFileDateFormat),
                )
                // log(`🔧 企微消息使用单文件模板: ${customFilename}`)
              }
            }
          }

          const pageName = `${folderName}/${customFilename}.md`
          const normalizedPath = normalizePath(pageName)
          // log(`🔧 准备创建/更新文件: ${normalizedPath}`)
          const omnivoreFile =
            this.app.vault.getAbstractFileByPath(normalizedPath)

          // 判断是否需要合并
          const shouldMerge =
            (mergeMode === MergeMode.MESSAGES && isWeChatMessage(item)) ||
            mergeMode === MergeMode.ALL

          // 🆕 使用处理器处理（自动记录成功和去重）
          if (omnivoreFile instanceof TFile && shouldMerge) {
            // 合并模式：使用MergeProcessor
            await mergeProcessor.process(item, omnivoreFile, content)
          } else {
            // 单文件模式：使用FileProcessor
            await fileProcessor.process(item, normalizedPath, content, folderName, customFilename)
          }
          } catch (error) {
            logError(`❌ 处理文章失败，跳过: ${item.title}`, error)
            // 不中断循环，继续处理下一篇
          }
        }

        log(`🔧 批次处理完成，处理了 ${items.length} 篇文章`)

        if (!hasNextPage) {
          break
        }
      }

      // 🆕 所有批次处理完成后，根据成功数量决定是否更新同步时间
      const successCount = syncContext.successTracker.getCount()
      if (successCount > 0) {
        this.settings.syncAt = DateTime.local().toFormat(DATE_FORMAT)
        await this.saveSettings()

        log(`✅ 同步完成！成功处理 ${successCount} 篇文章，syncAt: ${this.settings.syncAt}`)
        if (manualSync) {
          new Notice(`🎉 同步完成！成功处理 ${successCount} 篇文章`)
        }
      } else {
        log('⚠️ 没有成功处理任何文章，不更新同步时间')
        if (manualSync) {
          new Notice('⚠️ 同步完成，但没有成功处理任何文章')
        }
      }

      // 刷新文件浏览器以显示新创建的文件和文件夹
      this.refreshFileExplorer()

      // 根据图片处理模式进行异步处理（不阻塞同步流程）
      if (this.settings.imageMode === ImageMode.LOCAL && this.imageLocalizer) {
        log('🖼️ 开始异步处理图片本地化...')
        // 使用 setTimeout 确保不阻塞主流程
        setTimeout(async () => {
          try {
            await this.imageLocalizer?.processQueue()
            log('🖼️ 图片本地化队列处理完成')
          } catch (error) {
            logError('图片本地化处理失败:', error)
          }
        }, 500)
      } else if (this.settings.imageMode === ImageMode.DISABLED) {
        log('🖼️ 开始异步注释图片...')
        // 使用 setTimeout 确保不阻塞主流程
        const processedFilesArray = syncContext.getProcessedFilesArray()
        setTimeout(async () => {
          try {
            await this.commentOutImages(processedFilesArray)
            log('🖼️ 图片注释处理完成')
          } catch (error) {
            logError('图片注释处理失败:', error)
          }
        }, 500)
      }
    } catch (e) {
      new Notice('获取数据失败')
      logError(e)
    } finally {
      this.syncing = false

      // 确保在任何情况下都刷新文件浏览器
      try {
        this.refreshFileExplorer()
      } catch (refreshError) {
        log('文件浏览器刷新遇到问题，但不影响正常使用', refreshError)
      }
    }
  }



  /**
   * 简化的文件浏览器刷新方法
   * 使用标准的Obsidian事件机制
   */
  private refreshFileExplorer() {
    // 防抖：如果已经有刷新任务在队列中，取消之前的
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout)
    }

    this.refreshTimeout = setTimeout(() => {
      try {
        log('🔄 开始刷新文件浏览器')

        // 使用标准的vault事件触发刷新
        this.app.vault.trigger('changed')
        this.app.workspace.trigger('layout-change')

        log('🔄 文件浏览器刷新完成')
      } catch (error) {
        log('🔄 文件浏览器刷新遇到问题:', error)
      } finally {
        this.refreshTimeout = null
      }
    }, 100)
  }
}
