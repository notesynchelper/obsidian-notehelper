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
import { deleteItem, getItems } from './api'
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

export default class OmnivorePlugin extends Plugin {
  settings: OmnivoreSettings
  private refreshTimeout: NodeJS.Timeout | null = null
  configMigrationManager: ConfigMigrationManager
  imageLocalizer: ImageLocalizer | null = null

  async onload() {
    // 🚀 优化启动速度：延迟非关键操作
    log('🚀 笔记同步助手启动中...')

    // 关键操作：立即加载基本设置
    await this.loadEssentialSettings()

    // 注册核心组件
    this.registerCoreComponents()

    // 🚀 延迟非关键操作到启动完成后再执行
    this.app.workspace.onLayoutReady(() => {
      // 延迟1秒后执行非关键初始化
      setTimeout(() => {
        this.initializeNonCriticalFeatures()
      }, 1000)
    })
  }

  /**
   * 🚀 快速加载基本设置（包含配置迁移恢复逻辑）
   */
  private async loadEssentialSettings(): Promise<void> {
    try {
      // 1. 先尝试加载主配置
      const loadedData = await this.loadData()
      this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData)

      log('📖 加载主配置完成', {
        hasData: !!loadedData,
        apiKey: this.settings.apiKey ? '***' : '(空)',
        version: this.settings.version,
        syncAt: this.settings.syncAt || '(空)'
      })

      // 2. 检查是否需要配置迁移/恢复
      const manifestVersion = this.manifest.version

      // 临时创建 ConfigMigrationManager 用于检查和恢复
      const tempMigrationManager = new ConfigMigrationManager(this.app, this)

      const needsMigration = tempMigrationManager.isConfigMigrationNeeded(this.settings, manifestVersion)
      log('🔍 配置迁移检查', {
        needsMigration,
        currentApiKey: this.settings.apiKey ? '***' : '(空)',
        currentVersion: this.settings.version,
        manifestVersion
      })

      if (needsMigration) {
        log('⚠️ 检测到需要配置迁移，尝试从备份恢复...')

        // 按优先级尝试恢复：内嵌备份 → 外部备份 → 当前配置
        const restoredSettings = await tempMigrationManager.performMigration(
          this.settings,
          manifestVersion
        )

        log('📦 配置恢复结果', {
          beforeApiKey: this.settings.apiKey ? '***' : '(空)',
          afterApiKey: restoredSettings.apiKey ? '***' : '(空)',
          beforeSyncAt: this.settings.syncAt || '(空)',
          afterSyncAt: restoredSettings.syncAt || '(空)',
          beforeVersion: this.settings.version,
          afterVersion: restoredSettings.version
        })

        this.settings = restoredSettings

        // 立即保存恢复后的配置
        await this.saveData(this.settings)

        log('✅ 配置迁移完成并已保存', {
          version: this.settings.version,
          hasApiKey: !!this.settings.apiKey,
          hasSyncAt: !!this.settings.syncAt
        })
      } else {
        log('✅ 配置正常，无需迁移')
      }

      // 3. 重置同步状态（轻量级操作）
      this.settings.syncing = false
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
    this.addSettingTab(new OmnivoreSettingTab(this.app, this))

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
      id: 'deleteArticle',
      name: 'Delete Current Article from Omnivore',
      callback: async () => {
        const { activeEditor } = this.app.workspace
        const file = activeEditor?.file || null
        await this.deleteCurrentItem(file)
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

  
  async saveSettings() {
    await this.saveData(this.settings)
    // 同时备份配置到vault根目录，防止插件升级时丢失
    if (this.configMigrationManager) {
      try {
        await this.configMigrationManager.backupSettings(this.settings)
      } catch (error) {
        // 备份失败不应该影响设置保存
        log('配置备份时遇到问题，但设置已正常保存', error)
      }
    }
  }

  async scheduleSync() {
    // clear previous interval
    if (this.settings.intervalId > 0) {
      window.clearInterval(this.settings.intervalId)
      this.settings.intervalId = 0
    }

    const frequency = this.settings.frequency
    if (frequency > 0) {
      // schedule new interval
      const intervalId = window.setInterval(
        async () => {
          await this.fetchOmnivore(false)
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
      syncing,
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

    if (syncing) {
      new Notice('🐢 正在同步中...')
      return
    }

    if (!apiKey) {
      new Notice('缺少 API 密钥')
      return
    }

    this.settings.syncing = true
    await this.saveSettings()

    try {
      log(`笔记同步助手开始同步，自: '${syncAt}'`)

      manualSync && new Notice('🚀 正在获取数据...')

      // pre-parse template
      log('🔧 开始解析前端模板')
      frontMatterTemplate && preParseTemplate(frontMatterTemplate)
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
      const processedFiles: TFile[] = [] // 跟踪所有处理过的文件，用于后续图片处理
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
        log(`🔧 准备开始处理文章`)

        for (const item of items) {
          log(`🔧 ========================================`)
          log(`🔧 开始处理文章: ${item.title}`)
          log(`🔧 文章ID: ${item.id}`)

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
          log(`🔧 文件夹名称: ${folderName}`)
          const omnivoreFolder =
            this.app.vault.getAbstractFileByPath(folderName)
          if (!(omnivoreFolder instanceof TFolder)) {
            try {
              log(`🔧 创建文件夹: ${folderName}`)
              await this.app.vault.createFolder(folderName)
              log(`🔧 文件夹创建成功: ${folderName}`)
            } catch (error) {
              // 处理文件夹已存在的情况
              if (error.toString().includes('Folder already exists') ||
                  error.toString().includes('already exists')) {
                log(`🔧 文件夹已存在: ${folderName}`)
                // 简化处理：触发vault刷新事件
                this.app.vault.trigger('changed')
              } else {
                logError(`🔧 文件夹创建失败: ${folderName}`, error)
                throw error
              }
            }
          } else {
            log(`🔧 文件夹已存在: ${folderName}`)
          }
          log(`🔧 开始处理文件附件`)
          const fileAttachment =
            item.pageType === 'FILE' && includeFileAttachment
              ? await this.downloadFileAsAttachment(item)
              : undefined
          log(`🔧 文件附件处理完成`)
          log(`🔧 开始渲染内容`)

          // 判断是否需要合并到单文件：
          // - MergeMode.MESSAGES: 只合并企微消息
          // - MergeMode.ALL: 合并所有文章
          const shouldMergeIntoSingleFile =
            (mergeMode === MergeMode.MESSAGES && isWeChatMessage(item)) ||
            mergeMode === MergeMode.ALL

          const content = await renderItemContent(
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
          log(`🔧 内容渲染完成`)
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
                log(`🔧 企微消息使用单文件模板: ${customFilename}`)
              }
            }
          }

          const pageName = `${folderName}/${customFilename}.md`
          const normalizedPath = normalizePath(pageName)
          log(`🔧 准备创建/更新文件: ${normalizedPath}`)
          const omnivoreFile =
            this.app.vault.getAbstractFileByPath(normalizedPath)
          if (omnivoreFile instanceof TFile) {
            // file exists, so we might need to update it
            // 判断是否需要合并：
            // - MergeMode.MESSAGES: 只合并企微消息
            // - MergeMode.ALL: 合并所有文章
            const shouldMerge =
              (mergeMode === MergeMode.MESSAGES && isWeChatMessage(item)) ||
              mergeMode === MergeMode.ALL

            if (shouldMerge) {
              // sync into a single file
              const existingContent = await this.app.vault.read(omnivoreFile)
              // we need to remove the front matter
              const contentWithoutFrontmatter =
                removeFrontMatterFromContent(content)
              const existingContentWithoutFrontmatter =
                removeFrontMatterFromContent(existingContent)
              // get front matter from content
              // 新格式: {messages: [{id: ...}, {id: ...}]}
              let parsedExistingFrontMatter = parseFrontMatterFromContent(existingContent)
              let existingFrontMatter = parsedExistingFrontMatter?.messages || []
              if (!Array.isArray(existingFrontMatter)) {
                // 兼容旧格式：如果不是数组，可能是单个对象或旧的直接数组格式
                existingFrontMatter = Array.isArray(parsedExistingFrontMatter)
                  ? parsedExistingFrontMatter
                  : [parsedExistingFrontMatter]
              }

              const parsedNewFrontMatter = parseFrontMatterFromContent(content)
              const newFrontMatter = parsedNewFrontMatter?.messages || []
              if (
                !newFrontMatter ||
                !Array.isArray(newFrontMatter) ||
                newFrontMatter.length === 0
              ) {
                throw new Error('Front matter does not exist in the template')
              }

              // 🆕 企微消息特殊处理：简洁模式
              if (isWeChatMessage(item)) {
                log('🔧 检测到企微消息，使用简洁模式')

                // 检查消息是否已存在
                const frontMatterIdx = findFrontMatterIndex(existingFrontMatter, item.id)

                if (frontMatterIdx >= 0) {
                  // 消息已存在，只更新Front Matter，不修改内容（避免重复）
                  existingFrontMatter[frontMatterIdx] = newFrontMatter[0]
                  log(`🔧 消息已存在，跳过内容更新: ${item.id}`)

                  // 只更新Front Matter - 包裹在messages对象中
                  const newFrontMatterStr = `---\n${stringifyYaml({messages: existingFrontMatter})}---`
                  await this.app.vault.modify(
                    omnivoreFile,
                    `${newFrontMatterStr}\n\n${existingContentWithoutFrontmatter}`,
                  )

                  // 将更新后的文件加入图片本地化队列
                  await this.enqueueFileForImageLocalization(omnivoreFile)
                  processedFiles.push(omnivoreFile)
                } else {
                  // 新消息，追加到文件末尾（按时间顺序从上到下）
                  existingFrontMatter.push(newFrontMatter[0])
                  log(`🔧 新增消息ID: ${item.id}`)

                  const simpleContent = renderWeChatMessageSimple(item, this.settings.dateSavedFormat, this.settings.wechatMessageTemplate)

                  // 🔧 重建整个文件内容：按时间升序排列所有消息
                  interface MessageWithTime {
                    content: string
                    timestamp: string
                  }

                  const allMessages: MessageWithTime[] = []

                  // 从现有内容中提取各条消息（按分隔符"---\n## 📅"切分）
                  const existingMessages = existingContentWithoutFrontmatter.split(/(?=---\n## 📅)/).filter(s => s.trim())

                  // 提取现有消息的时间戳
                  for (const msg of existingMessages) {
                    // 匹配时间戳: ## 📅 yyyy-MM-dd HH:mm:ss
                    const timeMatch = msg.match(/## 📅 ([\d-:\s]+)/)
                    if (timeMatch) {
                      allMessages.push({
                        content: msg,
                        timestamp: timeMatch[1].trim()
                      })
                    }
                  }

                  // 添加新消息
                  const newTimeMatch = simpleContent.match(/## 📅 ([\d-:\s]+)/)
                  if (newTimeMatch) {
                    allMessages.push({
                      content: simpleContent,
                      timestamp: newTimeMatch[1].trim()
                    })
                  }

                  // 按时间戳升序排序（早→晚）
                  allMessages.sort((a, b) => a.timestamp.localeCompare(b.timestamp))

                  // 重建内容
                  const rebuiltContent = allMessages.map(m => m.content).join('\n')

                  // 包裹在messages对象中
                  const newFrontMatterStr = `---\n${stringifyYaml({messages: existingFrontMatter})}---`

                  await this.app.vault.modify(
                    omnivoreFile,
                    `${newFrontMatterStr}\n\n${rebuiltContent}`,
                  )

                  // 将更新后的文件加入图片本地化队列
                  await this.enqueueFileForImageLocalization(omnivoreFile)
                  processedFiles.push(omnivoreFile)
                }

                log('🔧 企微消息处理完成')
                continue
              }

              // 普通文章的合并逻辑
              let newContentWithoutFrontMatter: string

              // find the front matter with the same id
              const frontMatterIdx = findFrontMatterIndex(
                existingFrontMatter,
                item.id,
              )
              if (frontMatterIdx >= 0) {
                // this article already exists in the file
                // we need to locate the article which is wrapped in comments
                // and replace the content
                // 如果用户配置了分隔符，则查找并替换带分隔符的内容
                if (this.settings.sectionSeparator && this.settings.sectionSeparatorEnd) {
                  // 构建articleView以渲染分隔符模板(与template.ts保持一致)
                  const dateSaved = formatDate(item.savedAt, this.settings.dateSavedFormat)
                  const articleView = {
                    id: item.id,
                    title: item.title,
                    dateSaved,
                    // 可以根据需要添加更多变量
                  }
                  const renderedStart = Mustache.render(this.settings.sectionSeparator, articleView)
                  const renderedEnd = Mustache.render(this.settings.sectionSeparatorEnd, articleView)
                  // 转义正则表达式特殊字符
                  const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                  const existingContentRegex = new RegExp(
                    `${escapeRegex(renderedStart)}.*?${escapeRegex(renderedEnd)}`,
                    's',
                  )
                  newContentWithoutFrontMatter =
                    existingContentWithoutFrontmatter.replace(
                      existingContentRegex,
                      contentWithoutFrontmatter,
                    )
                } else {
                  // 如果没有配置分隔符，直接追加内容
                  newContentWithoutFrontMatter = `${contentWithoutFrontmatter}\n\n${existingContentWithoutFrontmatter}`
                }

                existingFrontMatter[frontMatterIdx] = newFrontMatter[0]
              } else {
                // this article doesn't exist in the file
                // prepend the article
                newContentWithoutFrontMatter = `${contentWithoutFrontmatter}\n\n${existingContentWithoutFrontmatter}`
                // prepend new front matter which is an array
                existingFrontMatter.unshift(newFrontMatter[0])
              }

              // 包裹在messages对象中
              const newFrontMatterStr = `---\n${stringifyYaml({
                messages: existingFrontMatter,
              })}---`

              await this.app.vault.modify(
                omnivoreFile,
                `${newFrontMatterStr}\n\n${newContentWithoutFrontMatter}`,
              )

              // 将更新后的文件加入图片本地化队列
              await this.enqueueFileForImageLocalization(omnivoreFile)
              processedFiles.push(omnivoreFile)
              continue
            }
            // sync into separate files - 直接读取文件内容而不使用processFrontMatter
            log(`🔧 文件已存在，读取内容检查ID`)
            const existingContent = await this.app.vault.read(omnivoreFile)
            // 从Front Matter中提取id字段: ---\nid: xxx\n---
            const idMatch = existingContent.match(/^---\r?\n(?:[\s\S]*?)^id:\s*(.+?)\s*$/m)
            const existingId = idMatch ? idMatch[1].trim() : null

            log(`🔧 现有文件ID: ${existingId}, 当前文章ID: ${item.id}`)

            if (existingId && existingId !== item.id) {
              // this article has the same name but different id
              // find an available filename with incrementing number suffix
              log(`🔧 ID不同，需要创建新文件`)
              let suffix = 2
              let newPageName = `${folderName}/${customFilename} ${suffix}.md`
              let newNormalizedPath = normalizePath(newPageName)
              let newOmnivoreFile = this.app.vault.getAbstractFileByPath(newNormalizedPath)

              // keep incrementing suffix until we find either:
              // 1. a file with the same id (update it)
              // 2. a non-existent filename (create new file)
              while (newOmnivoreFile instanceof TFile) {
                log(`🔧 检查文件: ${newNormalizedPath}`)
                // 直接读取文件内容来提取ID
                const checkContent = await this.app.vault.read(newOmnivoreFile)
                const checkIdMatch = checkContent.match(/^---\r?\n(?:[\s\S]*?)^id:\s*(.+?)\s*$/m)
                const checkId = checkIdMatch ? checkIdMatch[1].trim() : null

                if (checkId === item.id) {
                  // found the file with same id, update it
                  log(`🔧 找到相同ID的文件，更新: ${newNormalizedPath}`)
                  if (checkContent !== content) {
                    await this.app.vault.modify(newOmnivoreFile, content)
                    log(`🔧 文件更新完成: ${newNormalizedPath}`)
                  }
                  // 加入图片本地化队列
                  await this.enqueueFileForImageLocalization(newOmnivoreFile)
                  processedFiles.push(newOmnivoreFile)
                  continue  // 跳过后续处理，继续下一篇文章
                }
                // try next number
                suffix++
                newPageName = `${folderName}/${customFilename} ${suffix}.md`
                newNormalizedPath = normalizePath(newPageName)
                newOmnivoreFile = this.app.vault.getAbstractFileByPath(newNormalizedPath)
              }

              // found available filename, create new file
              log(`🔧 找到可用文件名（编号 ${suffix}）: ${newNormalizedPath}`)
              const createdFile = await this.app.vault.create(newNormalizedPath, content)
              log(`🔧 文件创建成功: ${newNormalizedPath}`)

              // 将新创建的文件加入图片本地化队列
              await this.enqueueFileForImageLocalization(createdFile)
              processedFiles.push(createdFile)
              continue
            }

            // a file with the same id already exists, update it
            log(`🔧 文件ID相同，检查是否需要更新`)
            if (existingContent !== content) {
              log(`🔧 内容有变化，更新文件: ${omnivoreFile.path}`)
              await this.app.vault.modify(omnivoreFile, content)
            } else {
              log(`🔧 内容无变化，跳过更新`)
            }
            // 加入图片本地化队列
            await this.enqueueFileForImageLocalization(omnivoreFile)
            processedFiles.push(omnivoreFile)
            continue
          }
          // file doesn't exist, so we need to create it
          try {
            log(`🔧 创建新文件: ${normalizedPath}`)
            const createdFile = await this.app.vault.create(normalizedPath, content)
            log(`🔧 文件创建成功: ${normalizedPath}`)

            // 将新创建的文件加入图片本地化队列
            await this.enqueueFileForImageLocalization(createdFile)
            processedFiles.push(createdFile)
          } catch (error) {
            if (error.toString().includes('File already exists')) {
              log(`🔧 文件已存在，跳过创建: ${normalizedPath}`)
              // 文件已存在，仍然尝试加入队列处理图片
              const existingFile = this.app.vault.getAbstractFileByPath(normalizedPath)
              if (existingFile instanceof TFile) {
                await this.enqueueFileForImageLocalization(existingFile)
                processedFiles.push(existingFile)
              }
            } else {
              logError(`🔧 文件创建失败: ${normalizedPath}`, error)
              new Notice(`文件创建失败: ${normalizedPath}`, 3000)
            }
          }
          log(`🔧 文章处理完成: ${item.title}`)
        }

        log(`🔧 批次处理完成，处理了 ${items.length} 篇文章`)

        if (!hasNextPage) {
          break
        }
      }

      // 所有批次处理完成后，更新同步时间
      this.settings.syncAt = DateTime.local().toFormat(DATE_FORMAT)
      await this.saveSettings()

      log('笔记同步助手同步完成', this.settings.syncAt)
      manualSync && new Notice('🎉 同步完成')

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
        setTimeout(async () => {
          try {
            await this.commentOutImages(processedFiles)
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
      this.settings.syncing = false
      await this.saveSettings()

      // 确保在任何情况下都刷新文件浏览器
      try {
        this.refreshFileExplorer()
      } catch (refreshError) {
        log('文件浏览器刷新遇到问题，但不影响正常使用', refreshError)
      }
    }
  }

  private async deleteCurrentItem(file: TFile | null) {
    if (!file) {
      return
    }
    //use frontmatter id to find the file
    const itemId = this.app.metadataCache.getFileCache(file)?.frontmatter?.id
    if (!itemId) {
      new Notice('删除文章失败：文章 ID 未找到')
    }

    try {
      const isDeleted = deleteItem(
        this.settings.endpoint,
        this.settings.apiKey,
        itemId,
      )
      if (!isDeleted) {
        new Notice('删除文章失败')
      }
    } catch (e) {
      new Notice('Failed to delete article in Omnivore')
      logError(e)
    }

    await this.app.vault.delete(file)
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
