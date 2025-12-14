import {
  App,
  Modal,
  Notice,
  PluginSettingTab,
  Setting,
  requestUrl,
} from 'obsidian'
import OmnivorePlugin from './main'
import { FolderSuggest } from './settings/file-suggest'
import {
  DEFAULT_SETTINGS,
  FRONT_MATTER_VARIABLES,
  Filter,
  ImageMode,
  MergeMode,
} from './settings'
import { getQueryFromFilter } from './util'
import { getArticleCount, clearAllArticles, fetchVipStatus, getQrCodeUrl } from './api'
import { log, logError } from './logger'

// Obsidian 全局函数声明
declare function createFragment(callback: (fragment: DocumentFragment) => void): DocumentFragment

interface VersionInfo {
  version: string
  downloadUrl: string
}

export class OmnivoreSettingTab extends PluginSettingTab {
  plugin: OmnivorePlugin
  private latestVersionInfo: VersionInfo | null = null
  private versionCheckPromise: Promise<void> | null = null
  private vipStatusContainer: HTMLElement | null = null

  constructor(app: App, plugin: OmnivorePlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  // 加载二维码图片 - 直接使用 CDN URL
  private loadQrCode(type: 'vip' | 'group', imgElement: HTMLImageElement): void {
    imgElement.src = getQrCodeUrl(type)
    log('🔧 设置二维码图片:', type, imgElement.src)
  }

  // 更新VIP状态显示
  private async updateVipStatus(): Promise<void> {
    if (!this.vipStatusContainer) {
      return
    }

    const apiKey = this.plugin.settings.apiKey

    // 如果没有密钥，隐藏状态容器
    if (!apiKey || apiKey.trim() === '') {
      this.vipStatusContainer.addClass('is-hidden')
      return
    }

    // 显示状态容器
    this.vipStatusContainer.removeClass('is-hidden')

    // 查询VIP状态
    const vipStatus = await fetchVipStatus(apiKey)

    // 更新左侧状态文本
    const statusInfo = this.vipStatusContainer.querySelector(
      '.vip-status-info',
    ) as HTMLElement
    if (statusInfo) {
      statusInfo.textContent = vipStatus.displayText
    }

    // 更新右侧二维码和引导文字
    const qrImg = this.vipStatusContainer.querySelector(
      '.vip-status-qr img',
    ) as HTMLImageElement
    const qrLabel = this.vipStatusContainer.querySelector(
      '.vip-status-qr-label',
    ) as HTMLElement

    if (qrImg && qrLabel) {
      // 根据会员状态决定显示哪个二维码
      const qrType =
        vipStatus.isValid &&
        (vipStatus.vipType === 'obvip' || vipStatus.vipType === 'obvvip')
          ? 'group'
          : 'vip'

      // 更新二维码图片
      this.loadQrCode(qrType, qrImg)

      // 更新引导文字
      qrLabel.textContent = qrType === 'group' ? '加入交流群' : '购买高级权益'
    }
  }

  display(): void {
    const { containerEl } = this

    containerEl.empty()

    // 🚀 优化设置页面加载速度：延迟非关键操作
    // 显示版本信息（快速操作）
    this.displayVersionInfo(containerEl)

    // 🚀 延迟执行配置迁移（不阻塞页面显示）
    setTimeout(() => {
      void this.checkAndPerformMigration()
    }, 500)

    /**
     * General Options
     **/
    new Setting(containerEl)
      .setName('密钥')
      .setDesc(
        '请关注《笔记同步助手》公众号获取密钥'
      )
      .addText((text) =>
        text
          .setPlaceholder('输入您的密钥')
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value
            await this.plugin.saveSettings()
            // 密钥更新后查询VIP状态
            await this.updateVipStatus()
          }),
      )

    /**
     * VIP Status Section
     **/
    new Setting(containerEl)
      .setName("会员中心")
      .setHeading()
      .addButton((button) => {
        button.setButtonText('刷新').onClick(async () => {
          await this.updateVipStatus()
        })
      })

    // 会员状态展示区域
    this.vipStatusContainer = containerEl.createEl('div', {
      cls: 'vip-status-container',
    })

    // 左侧：状态信息容器
    const statusContainer = this.vipStatusContainer.createEl('div', {
      cls: 'vip-status-left',
    })

    // 会员状态信息
    statusContainer.createEl('div', {
      cls: 'vip-status-info',
      text: '加载中...',
    })

    // 引导文字（放在状态信息下方）
    statusContainer.createEl('div', {
      cls: 'vip-status-qr-label',
      text: '加载中...',
    })

    // 右侧：二维码容器
    const qrContainer = this.vipStatusContainer.createEl('div', {
      cls: 'vip-status-qr',
    })

    // 二维码图片
    qrContainer.createEl('img', {
      attr: {
        alt: '二维码',
      },
    })

    // 页面加载时查询VIP状态
    void this.updateVipStatus()

    /**
     * Article Management Options
     **/
    new Setting(containerEl).setName("文章管理").setHeading()

    // 使用 Setting 组件来保持样式一致
    const articleCountSetting = new Setting(containerEl)
      .setName('云空间内容数量 / cloud space content count')
      .setDesc(
        createFragment((fragment) => {
          fragment.append(
            '显示云空间中文章和消息的总数量。消息合并模式默认开启，一天的消息会合并到同一个笔记中。',
            fragment.createEl('br'),
            'Shows the total count of articles and messages in cloud space. Message merge mode is enabled by default, messages from the same day are merged into a single note.',
            fragment.createEl('br'),
            fragment.createEl('br'),
            fragment.createEl('strong', { text: '当前数量 / current: --' })
          )
        })
      )

    // 添加刷新按钮
    articleCountSetting.addButton((button) => {
      button
        .setButtonText('刷新')
        .setCta()
        .onClick(async () => {
          try {
            button.setDisabled(true)
            button.setButtonText('刷新中...')

            const count = await getArticleCount(
              this.plugin.settings.endpoint,
              this.plugin.settings.apiKey
            )

            articleCountSetting.setDesc(
              createFragment((fragment) => {
                fragment.append(
                  '显示云空间中文章和消息的总数量。消息合并模式默认开启，一天的消息会合并到同一个笔记中。',
                  fragment.createEl('br'),
                  'Shows the total count of articles and messages in cloud space. Message merge mode is enabled by default, messages from the same day are merged into a single note.',
                  fragment.createEl('br'),
                  fragment.createEl('br'),
                  fragment.createEl('strong', { text: `当前数量 / current: ${count}` })
                )
              })
            )
            new Notice(`当前有 ${count} 篇内容`)
          } catch (error) {
            logError('获取文章数量失败:', error)
            new Notice('获取文章数量失败，请检查API密钥是否正确')
            articleCountSetting.setDesc('获取失败')
          } finally {
            button.setDisabled(false)
            button.setButtonText('刷新')
          }
        })
    })

    // 添加清空按钮
    articleCountSetting.addButton((button) => {
      button
        .setButtonText('清空云空间')
        .setWarning()
        .onClick(async () => {
          // 显示确认对话框
          const confirmModal = new ConfirmModal(
            this.app,
            '清空云空间文章',
            '⚠️ 此操作将删除云空间中的所有文章，且无法恢复。\n\n您确定要继续吗？',
            async () => {
              try {
                // 立即更新按钮状态和显示通知
                button.setDisabled(true)
                button.setButtonText('清空中...')
                new Notice('正在清空文章...')

                const result = await clearAllArticles(
                  this.plugin.settings.endpoint,
                  this.plugin.settings.apiKey
                )

                new Notice(`已清空 ${result.deletedCount} 篇内容`)
                articleCountSetting.setDesc(
                  createFragment((fragment) => {
                    fragment.append(
                      '显示云空间中文章和消息的总数量。消息合并模式默认开启，一天的消息会合并到同一个笔记中。',
                      fragment.createEl('br'),
                      'Shows the total count of articles and messages in cloud space. Message merge mode is enabled by default, messages from the same day are merged into a single note.',
                      fragment.createEl('br'),
                      fragment.createEl('br'),
                      fragment.createEl('strong', { text: '当前数量 / current: 0' })
                    )
                  })
                )

                // 自动刷新以获取最新数量
                setTimeout(() => {
                  void (async () => {
                    try {
                      const count = await getArticleCount(
                        this.plugin.settings.endpoint,
                        this.plugin.settings.apiKey
                      )
                      articleCountSetting.setDesc(
                        createFragment((fragment) => {
                          fragment.append(
                            '显示云空间中文章和消息的总数量。消息合并模式默认开启，一天的消息会合并到同一个笔记中。',
                            fragment.createEl('br'),
                            'Shows the total count of articles and messages in cloud space. Message merge mode is enabled by default, messages from the same day are merged into a single note.',
                            fragment.createEl('br'),
                            fragment.createEl('br'),
                            fragment.createEl('strong', { text: `当前数量 / current: ${count}` })
                          )
                        })
                      )
                    } catch (error) {
                      logError('刷新文章数量失败:', error)
                    }
                  })()
                }, 1000)
              } catch (error) {
                logError('清空文章失败:', error)
                new Notice('清空文章失败，请稍后重试')
              } finally {
                button.setDisabled(false)
                button.setButtonText('清空云空间')
              }
            }
          )
          confirmModal.open()
        })
    })

    /**
     * Query Options
     **/
    new Setting(containerEl).setName("查询").setHeading()

    new Setting(containerEl)
      .setName('筛选器')
      .setDesc(
        '目前只支持同步所有文章。可以通过设置"最后同步"时间来控制同步范围，只会同步在该时间点之后保存或更新的文章。',
      )
      .addDropdown((dropdown) => {
        dropdown.addOptions(Filter)
        dropdown
          .setValue(this.plugin.settings.filter)
          .onChange(async (value) => {
            this.plugin.settings.filter = value
            this.plugin.settings.customQuery = getQueryFromFilter(value)
            this.plugin.settings.syncAt = ''
            await this.plugin.saveSettings()
            this.display()
          })
      })

    new Setting(containerEl)
      .setName('自定义查询')
      .setDesc(
        '输入自定义搜索查询语句。更改此项将重置“最后同步”时间戳',
      )
      .addText((text) =>
        text
          .setPlaceholder(
            '输入自定义搜索查询语句',
          )
          .setValue(this.plugin.settings.customQuery)
          .onChange(async (value) => {
            this.plugin.settings.customQuery = value
            this.plugin.settings.syncAt = ''
            await this.plugin.saveSettings()
          }),
      )

    /**
     * Sync Options, such as folder location, file format, etc.
     **/
    new Setting(containerEl).setName("同步").setHeading()

    new Setting(containerEl)
      .setName('启动时同步')
      .setDesc(
        '勾选此选项在应用加载时自动同步',
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.syncOnStart)
          .onChange(async (value) => {
            this.plugin.settings.syncOnStart = value
            await this.plugin.saveSettings()
          }),
      )
    new Setting(containerEl)
      .setName('频率 / frequency')
      .setDesc(
        createFragment((fragment) => {
          fragment.append(
            '输入自动同步的频率（秒）。0 表示手动同步，最低 15 秒',
            fragment.createEl('br'),
            fragment.createEl('br'),
            '常用频率示例:',
            fragment.createEl('br'),
            '• 15 秒（最快）',
            fragment.createEl('br'),
            '• 60 秒（1分钟）',
            fragment.createEl('br'),
            '• 300 秒（5分钟）',
            fragment.createEl('br'),
            '• 1800 秒（30分钟）'
          )
        })
      )
      .addText((text) =>
        text
          .setPlaceholder('输入频率（秒）')
          .setValue(this.plugin.settings.frequency.toString())
          .onChange(async (value) => {
            // validate frequency
            const frequency = parseInt(value)

            // 验证1：必须是数字
            if (isNaN(frequency)) {
              new Notice('频率必须是正整数')
              return
            }

            // 验证2：最小值检查（15秒）
            if (frequency > 0 && frequency < 15) {
              new Notice('同步频率不能低于 15 秒')
              return
            }

            // save frequency
            this.plugin.settings.frequency = frequency
            await this.plugin.saveSettings()

            this.plugin.scheduleSync()
          }),
      )

    new Setting(containerEl)
      .setName('最后同步')
      .setDesc(
        '上次同步的时间。同步命令将获取此时间戳之后更新的文章。您可以手动修改此时间来控制同步范围。',
      )
      .addMomentFormat((momentFormat) =>
        momentFormat
          .setPlaceholder('最后同步')
          .setValue(this.plugin.settings.syncAt)
          .setDefaultFormat("yyyy-MM-dd'T'HH:mm:ss")
          .onChange(async (value) => {
            this.plugin.settings.syncAt = value
            await this.plugin.saveSettings()
          }),
      )

    new Setting(containerEl)
      .setName('消息合并模式 / message merge mode')
      .setDesc(
        createFragment((fragment) => {
          fragment.append(
            '选择文章和消息的合并方式 / Select how articles and messages are merged:',
            fragment.createEl('br'),
            fragment.createEl('br'),
            fragment.createEl('strong', { text: '不合并' }),
            ': 每篇文章独立文件（标题相同时自动添加数字后缀） / Each article in separate file',
            fragment.createEl('br'),
            fragment.createEl('strong', { text: '仅合并消息' }),
            ': 企微消息按日期合并，普通文章独立保存（推荐）/ Merge WeChat messages by date, keep articles separate (Recommended)',
            fragment.createEl('br'),
            fragment.createEl('strong', { text: '合并所有' }),
            ': 同名文章和消息都合并到一个文件 / Merge all articles and messages with same name',
          )
        })
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption(MergeMode.NONE, '不合并 / no merge')
          .addOption(MergeMode.MESSAGES, '仅合并消息 / merge messages only')
          .addOption(MergeMode.ALL, '合并所有 / merge all')
          .setValue(this.plugin.settings.mergeMode)
          .onChange(async (value) => {
            this.plugin.settings.mergeMode = value as MergeMode
            await this.plugin.saveSettings()
            // 重新显示设置页面以显示/隐藏单文件名称设置
            this.display()
          }),
      )

    // 单文件名称设置 - 只在合并模式不是 NONE 时显示
    if (this.plugin.settings.mergeMode !== MergeMode.NONE) {
      new Setting(containerEl)
        .setName('单文件名称模板 / single file name template')
        .setDesc(
          createFragment((fragment) => {
            fragment.append(
              '设置合并文件的名称模板。使用 ',
              fragment.createEl('code', { text: '{{{date}}}' }),
              ' 作为日期变量 / Set the name template for merged files. Use ',
              fragment.createEl('code', { text: '{{{date}}}' }),
              ' as date variable',
              fragment.createEl('br'),
              fragment.createEl('br'),
              '示例 / Examples:',
              fragment.createEl('br'),
              '• ',
              fragment.createEl('code', { text: '同步助手_{{{date}}}' }),
              fragment.createEl('br'),
              '• ',
              fragment.createEl('code', { text: '企微消息_{{{date}}}' }),
            )
          }),
        )
        .addText((text) =>
          text
            .setPlaceholder('同步助手_{{{date}}}')
            .setValue(this.plugin.settings.singleFileName)
            .onChange(async (value) => {
              this.plugin.settings.singleFileName = value || '同步助手_{{{date}}}'
              await this.plugin.saveSettings()
            }),
        )

      new Setting(containerEl)
        .setName('单文件日期格式 / single file date format')
        .setDesc(
          createFragment((fragment) => {
            fragment.append(
              '设置单文件名称中日期变量的格式。参考 / Specify the date format for the date variable in single file name. Reference format documentation online',
              fragment.createEl('br'),
              fragment.createEl('br'),
              '常用格式示例 / common format examples below:',
              fragment.createEl('br'),
            )
            // Format examples
            const examples = [
              { format: 'yyyy-MM-dd', sample: '2025-01-23' },
              { format: 'yyyyMMdd', sample: '20250123' },
              { format: 'yyyy/MM/dd', sample: '2025/01/23' },
              { format: 'yyyy年MM月dd日', sample: '2025年01月23日' },
            ]
            examples.forEach((example, index) => {
              if (index > 0) {
                fragment.append(fragment.createEl('br'))
              }
              fragment.append('• ', fragment.createEl('code', { text: example.format }), ` (example: ${example.sample})`)
            })
          }),
        )
        .addText((text) =>
          text
            // eslint-disable-next-line obsidianmd/ui/sentence-case
            .setPlaceholder('date format: yyyy-MM-dd')
            .setValue(this.plugin.settings.singleFileDateFormat)
            .onChange(async (value) => {
              this.plugin.settings.singleFileDateFormat = value || 'yyyy-MM-dd'
              await this.plugin.saveSettings()
            }),
        )

    }

    new Setting(containerEl)
      .setName('文件夹 / folder')
      .setDesc(
        '输入数据存储的文件夹路径。可在文件夹名称中使用 {{{title}}}、{{{dateSaved}}} / Enter the folder where the data will be stored. {{{title}}}, {{{dateSaved}}} could be used in the folder name',
      )
      .addSearch((search) => {
        new FolderSuggest(this.app, search.inputEl)
        search
          .setPlaceholder('Enter the folder')
          .setValue(this.plugin.settings.folder)
          .onChange(async (value) => {
            this.plugin.settings.folder = value
            await this.plugin.saveSettings()
          })
      })
    new Setting(containerEl)
      .setName('文件夹日期格式 / folder date format')
      // eslint-disable-next-line obsidianmd/ui/sentence-case
      .setDesc('specify the date format if date is used. Example: yyyy-MM-dd')
      .addText((text) =>
        text
          // eslint-disable-next-line obsidianmd/ui/sentence-case
          .setPlaceholder('date format')
          .setValue(this.plugin.settings.folderDateFormat)
          .onChange(async (value) => {
            this.plugin.settings.folderDateFormat = value
            await this.plugin.saveSettings()
          }),
      )

    new Setting(containerEl)
      .setName('附件文件夹 / attachment folder')
      .setDesc(
        '输入附件下载的文件夹路径。可在文件夹名称中使用 {{{title}}}、{{{dateSaved}}} / Enter the folder where the attachment will be downloaded to. {{{title}}}, {{{dateSaved}}} could be used in the folder name',
      )
      .addSearch((search) => {
        new FolderSuggest(this.app, search.inputEl)
        search
          .setPlaceholder('Enter the attachment folder')
          .setValue(this.plugin.settings.attachmentFolder)
          .onChange(async (value) => {
            this.plugin.settings.attachmentFolder = value
            await this.plugin.saveSettings()
          })
      })

    new Setting(containerEl)
      .setName('文件名 / filename')
      .setDesc(
        '输入数据存储的文件名。可在文件名中使用 {{id}}、{{{title}}}、{{{dateSaved}}} / Enter the filename where the data will be stored. {{id}}, {{{title}}}, {{{dateSaved}}} could be used in the filename',
      )
      .addText((text) =>
        text
          .setPlaceholder('Enter the filename')
          .setValue(this.plugin.settings.filename)
          .onChange(async (value) => {
            this.plugin.settings.filename = value
            await this.plugin.saveSettings()
          }),
      )

    new Setting(containerEl)
      .setName('文件名日期格式 / filename date format')
      // eslint-disable-next-line obsidianmd/ui/sentence-case
      .setDesc('specify the date format for the filename if date is used. Reference format documentation online.')
      .addText((text) =>
        text
          // eslint-disable-next-line obsidianmd/ui/sentence-case
          .setPlaceholder('yyyy-MM-dd')
          .setValue(this.plugin.settings.filenameDateFormat)
          .onChange(async (value) => {
            this.plugin.settings.filenameDateFormat = value
            await this.plugin.saveSettings()
          }),
      )

    /**
     * Image Processing Settings
     **/
    new Setting(containerEl).setName("图片处理 / image processing").setHeading()

    new Setting(containerEl)
      .setName('图片处理模式 / image processing mode')
      .setDesc(
        createFragment((fragment) => {
          fragment.append(
            '选择如何处理笔记中的图片 / Choose how to process images in notes',
            fragment.createEl('br'),
            fragment.createEl('br'),
            '• ',
            fragment.createEl('strong', { text: '缓存到本地' }),
            ': 下载图片到本地存储 / Download images to local storage',
            fragment.createEl('br'),
            '• ',
            fragment.createEl('strong', { text: '保留原始链接' }),
            ': 保持网络图片链接不变 / Keep remote image links',
            fragment.createEl('br'),
            '• ',
            fragment.createEl('strong', { text: '不加载图片' }),
            ': 注释掉图片语法，不显示图片 / Comment out image syntax',
          )
        })
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption(ImageMode.LOCAL, '缓存到本地 / download to local')
          .addOption(ImageMode.REMOTE, '保留原始链接 / keep remote links')
          .addOption(ImageMode.DISABLED, '不加载图片 / disable images')
          .setValue(this.plugin.settings.imageMode)
          .onChange(async (value) => {
            this.plugin.settings.imageMode = value as ImageMode
            await this.plugin.saveSettings()
            // 刷新显示以显示/隐藏高级选项
            this.display()
          }),
      )

    // 只在本地模式下显示高级选项
    if (this.plugin.settings.imageMode === ImageMode.LOCAL) {
      new Setting(containerEl)
        // eslint-disable-next-line obsidianmd/ui/sentence-case
        .setName('convert PNG to JPEG / convert png to jpeg')
        .setDesc(
          '勾选此选项将PNG图片转换为JPEG格式以节省空间。注意：会丢失透明度信息 / check this box to convert PNG images to JPEG format to save space. Note: transparency will be lost'
        )
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.enablePngToJpeg)
            .onChange(async (value) => {
              this.plugin.settings.enablePngToJpeg = value
              await this.plugin.saveSettings()
              // 刷新显示以显示/隐藏质量设置
              this.display()
            }),
        )

      // 只在启用PNG转JPEG时显示质量设置
      if (this.plugin.settings.enablePngToJpeg) {
        new Setting(containerEl)
          .setName('JPEG质量 / JPEG quality')
          .setDesc(
            '设置JPEG压缩质量（0-100），默认85。数值越高质量越好但文件越大 / set JPEG compression quality (0-100), default 85. Higher values mean better quality but larger files'
          )
          .addSlider((slider) =>
            slider
              .setLimits(0, 100, 5)
              .setValue(this.plugin.settings.jpegQuality)
              .setDynamicTooltip()
              .onChange(async (value) => {
                this.plugin.settings.jpegQuality = value
                await this.plugin.saveSettings()
              }),
          )
      }

      new Setting(containerEl)
        .setName('下载重试次数 / download retries')
        .setDesc(
          '设置图片下载失败时的重试次数，默认3次 / set the number of retries when image download fails, default 3'
        )
        .addText((text) =>
          text
            .setPlaceholder('3')
            .setValue(this.plugin.settings.imageDownloadRetries.toString())
            .onChange(async (value) => {
              const retries = parseInt(value)
              if (isNaN(retries) || retries < 0) {
                new Notice('重试次数必须是非负整数')
                return
              }
              this.plugin.settings.imageDownloadRetries = retries
              await this.plugin.saveSettings()
            }),
        )

      new Setting(containerEl)
        .setName('图片存储文件夹 / image storage folder')
        .setDesc(
          '设置本地化图片的存储路径。可使用 {{{date}}} 作为日期变量 / set the storage path for localized images. Use {{{date}}} as date variable. Examples: 笔记同步助手/images/{{{date}}} or attachments/images'
        )
        .addText((text) =>
          text
            .setPlaceholder('笔记同步助手/images/{{{date}}}')
            .setValue(this.plugin.settings.imageAttachmentFolder)
            .onChange(async (value) => {
              this.plugin.settings.imageAttachmentFolder = value || '笔记同步助手/images/{{{date}}}'
              await this.plugin.saveSettings()
            }),
        )
    }

    // 注释掉高亮日期格式设置 - 服务端不返回高亮信息
    // new Setting(containerEl)
    //   .setName('高亮日期格式 / Date Highlighted Format')
    //   .setDesc(
    //     '输入渲染模板中 dateHighlighted 变量的日期格式 / Enter the date format for dateHighlighted variable in rendered template',
    //   )
    //   .addText((text) =>
    //     text
    //       .setPlaceholder('Date Highlighted Format')
    //       .setValue(this.plugin.settings.dateHighlightedFormat)
    //       .onChange(async (value) => {
    //         this.plugin.settings.dateHighlightedFormat = value
    //         await this.plugin.saveSettings()
    //       }),
    //   )

    // 注释掉高亮相关设置 - 服务端不返回高亮信息
    /**
     * Highlight Render Options in Article
     **/
    // containerEl.createEl('h4', { text: '高亮 / Highlights' })

    // new Setting(containerEl)
    //   .setName('高亮排序 / Highlight Order')
    //   .setDesc('选择高亮的排序方式 / Select the order in which highlights are applied')
    //   .addDropdown((dropdown) => {
    //     dropdown.addOptions(HighlightOrder)
    //     dropdown
    //       .setValue(this.plugin.settings.highlightOrder)
    //       .onChange(async (value) => {
    //         this.plugin.settings.highlightOrder = value
    //         await this.plugin.saveSettings()
    //       })
    //   })

    // new Setting(containerEl)
    //   .setName('渲染高亮颜色 / Render Highlight Color')
    //   .setDesc(
    //     '勾选此选项将使用 Omnivore 应用中的高亮颜色渲染 / Check this box if you want to render highlights with color used in the Omnivore App',
    //   )
    //   .addToggle((toggle) =>
    //     toggle
    //       .setValue(this.plugin.settings.enableHighlightColorRender)
    //       .onChange(async (value) => {
    //         this.plugin.settings.enableHighlightColorRender = value
    //         await this.plugin.saveSettings()
    //         this.displayBlock(renderHighlightConfigContainer, value)
    //       }),
    //   )

    // const renderHighlightConfigContainer = containerEl.createEl('div')
    // this.displayBlock(
    //   renderHighlightConfigContainer,
    //   this.plugin.settings.enableHighlightColorRender,
    // )
    // new Setting(renderHighlightConfigContainer)
    //   .setName('使用 Highlightr 进行高亮样式设置 / Use Highlightr for Highlight styling')
    //   .setDesc(
    //     createFragment((fragment) => {
    //       fragment.append(
    //         fragment.createEl('a', {
    //           text: 'Highlightr',
    //           href: 'https://github.com/chetachiezikeuzor/Highlightr-Plugin',
    //         }),
    //         ' 是一个用于管理高亮样式和快捷键的社区插件 / is a community plugin for managing highlight style and hotkeys',
    //         fragment.createEl('br'),
    //         '如果您希望将高亮颜色和样式配置委托给它，请勾选此选项 / Check this if you\'d like to delegate configuration of highlight color and styling to it',
    //         fragment.createEl('br'),
    //         '请确保在 highlightr 插件中选择 "css-class" 作为高亮方法 / Ensure to select "css-class" as the highlight-method in the highlightr plugin',
    //       )
    //     }),
    //   )
    //   .addToggle((toggle) =>
    //     toggle
    //       .setValue(
    //         this.plugin.settings.highlightManagerId ==
    //           HighlightManagerId.HIGHLIGHTR,
    //       )
    //       .onChange(async (value) => {
    //         this.plugin.settings.highlightManagerId = value
    //           ? HighlightManagerId.HIGHLIGHTR
    //           : HighlightManagerId.OMNIVORE
    //         await this.plugin.saveSettings()
    //         this.displayBlock(omnivoreHighlightConfigContainer, !value)
    //       }),
    //   )

    // const omnivoreHighlightConfigContainer =
    //   renderHighlightConfigContainer.createEl('div', {
    //     cls: 'omnivore-highlight-config-container',
    //   })
    // this.displayBlock(
    //   omnivoreHighlightConfigContainer,
    //   this.plugin.settings.highlightManagerId == HighlightManagerId.OMNIVORE,
    // )
    // const highlighterSetting = new Setting(omnivoreHighlightConfigContainer)
    // const colorPickers: { [color in string]: ColorComponent } = {}

    // highlighterSetting
    //   .setName('配置高亮颜色 / Configure highlight colors')
    //   .setDesc(
    //     '配置 Omnivore 中的高亮颜色在笔记中的渲染方式 / Configure how the highlight colors in Omnivore should render in notes',
    //   )
    //   .addButton((button) => {
    //     button.setButtonText('Save')
    //     button.setTooltip('Save highlight color setting')
    //     button.setClass('omnivore-btn')
    //     button.setClass('omnivore-btn-primary')
    //     button.onClick(async (e) => {
    //       const highlightColorMapping =
    //         this.plugin.settings.highlightColorMapping
    //       Object.entries(colorPickers).forEach(([color, picker]) => {
    //         highlightColorMapping[color as HighlightColors] = picker.getValue()
    //       })
    //       setOrUpdateHighlightColors(highlightColorMapping)
    //       await this.plugin.saveSettings()
    //       new Notice('Saved highlight color settings')
    //     })
    //   })

    // const getPenIcon = (hexCode: string) =>
    //   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill=${hexCode} stroke=${hexCode} stroke-width="0" stroke-linecap="round" stroke-linejoin="round"><path d="M20.707 5.826l-3.535-3.533a.999.999 0 0 0-1.408-.006L7.096 10.82a1.01 1.01 0 0 0-.273.488l-1.024 4.437L4 18h2.828l1.142-1.129l3.588-.828c.18-.042.345-.133.477-.262l8.667-8.535a1 1 0 0 0 .005-1.42zm-9.369 7.833l-2.121-2.12l7.243-7.131l2.12 2.12l-7.242 7.131zM4 20h16v2H4z"/></svg>`

    // const colorMap = this.plugin.settings.highlightColorMapping
    // Object.entries(colorMap).forEach(([colorName, hexCode]) => {
    //   let penIcon = getPenIcon(hexCode)
    //   const settingItem = omnivoreHighlightConfigContainer.createEl('div')
    //   settingItem.addClass('omnivore-highlight-setting-item')
    //   const colorIcon = settingItem.createEl('span')
    //   colorIcon.addClass('omnivore-highlight-setting-icon')
    //   colorIcon.innerHTML = penIcon

    //   const colorSetting = new Setting(settingItem)
    //     .setName(colorName)
    //     .setDesc(hexCode)

    //   colorSetting.addColorPicker((colorPicker) => {
    //     colorPicker.setValue(hexCode)
    //     colorPickers[colorName] = colorPicker
    //     colorPicker.onChange((v) => {
    //       penIcon = getPenIcon(v)
    //       colorIcon.innerHTML = penIcon
    //       colorSetting.setDesc(v)
    //     })
    //   })
    // })

    /**
     * Advanced Settings
     **/
    new Setting(containerEl)
      .setName("高级选项 / advanced")
      .setHeading()
      .setClass('omnivore-collapsible')

    const advancedSettings = containerEl.createEl('div', {
      cls: 'omnivore-content',
    })

    /**
     * Article Render Options in Advanced Settings
     **/
    new Setting(advancedSettings).setName("文章选项 / article").setHeading()

    new Setting(advancedSettings)
      .setName('前置元数据 / front matter')
      .setDesc(
        createFragment((fragment) => {
          fragment.append(
            '输入用于笔记的元数据，用逗号分隔。您也可以使用自定义别名，格式为 metatdata::alias，例如 date_saved::date。 / Enter the metadata to be used in your note separated by commas. You can also use custom aliases in the format of metatdata::alias, e.g. date_saved::date. ',
            fragment.createEl('br'),
            fragment.createEl('br'),
            '如果要使用自定义前置元数据模板，可在下方输入 / If you want to use a custom front matter template, you can enter it below',
          )
        }),
      )
      .addTextArea((text) => {
        text
          .setPlaceholder('Enter the metadata')
          .setValue(this.plugin.settings.frontMatterVariables.join(','))
          .onChange(async (value) => {
            // validate front matter variables and deduplicate
            this.plugin.settings.frontMatterVariables = value
              .split(',')
              .map((v) => v.trim())
              .filter(
                (v, i, a) =>
                  FRONT_MATTER_VARIABLES.includes(v.split('::')[0]) &&
                  a.indexOf(v) === i,
              )
            await this.plugin.saveSettings()
          })
        text.inputEl.setAttr('rows', 4)
        text.inputEl.setAttr('cols', 30)
      })

    new Setting(advancedSettings)
      .setName('文章模板 / article template')
      .setDesc(
        createFragment((fragment) => {
          fragment.append(
            '输入文章渲染模板 / Enter template to render articles ',
            fragment.createEl('br'),
            '如果要使用自定义前置元数据模板，可在下方输入 / If you want to use a custom front matter template, you can enter it below',
          )
        }),
      )
      .addTextArea((text) => {
        text
          .setPlaceholder('Enter the template')
          .setValue(this.plugin.settings.template)
          .onChange(async (value) => {
            // if template is empty, use default template
            this.plugin.settings.template = value
              ? value
              : DEFAULT_SETTINGS.template
            await this.plugin.saveSettings()
          })
        text.inputEl.setAttr('rows', 4)
        text.inputEl.setAttr('cols', 30)
      })
      .addExtraButton((button) => {
        // add a button to reset template
        button
          .setIcon('reset')
          .setTooltip('Reset template')
          .onClick(async () => {
            this.plugin.settings.template = DEFAULT_SETTINGS.template
            await this.plugin.saveSettings()
            this.display()
            new Notice('Template reset')
          })
      })

    new Setting(advancedSettings)
      .setName('保存日期格式 / date saved format')
      // eslint-disable-next-line obsidianmd/ui/sentence-case
      .setDesc('specify the date format for dateSaved variable in rendered template. Example format: yyyy-MM-dd\'T\'HH:mm:ss')
      .addText((text) =>
        text
          // eslint-disable-next-line obsidianmd/ui/sentence-case
          .setPlaceholder('yyyy-MM-dd\'T\'HH:mm:ss')
          .setValue(this.plugin.settings.dateSavedFormat)
          .onChange(async (value) => {
            this.plugin.settings.dateSavedFormat = value
            await this.plugin.saveSettings()
          }),
      )

    new Setting(advancedSettings)
      .setName('助手消息模板 / assistant message template')
      .setDesc(
        createFragment((fragment) => {
          fragment.append(
            '设置助手消息（标题格式：同步助手_yyyyMMdd_xxx）的显示模板。助手消息会自动使用此简洁模板，去除标题、标签等冗余信息 / Set the template for assistant messages (title format: 同步助手_yyyyMMdd_xxx). Assistant messages will automatically use this clean template, removing titles, tags, and other redundant information',
            fragment.createEl('br'),
            fragment.createEl('br'),
            '可用变量 / Available variables:',
            fragment.createEl('br'),
            '• {{{dateSaved}}} = 保存时间 / saved date',
            fragment.createEl('br'),
            '• {{{content}}} = 消息内容 / message content',
            fragment.createEl('br'),
            '• {{{title}}} = 标题 / title',
            fragment.createEl('br'),
            '• {{{id}}} = ID',
            fragment.createEl('br'),
            fragment.createEl('br'),
            '示例 / Examples:',
            fragment.createEl('br'),
            '• ---\\n## 📅 {{{dateSaved}}}\\n{{{content}}} → 使用分隔线和二级标题（推荐）',
            fragment.createEl('br'),
            '• {{{content}}} → 仅显示内容',
            fragment.createEl('br'),
            '• 📅 {{{dateSaved}}}\\n{{{content}}} → emoji + 时间 + 内容',
          )
        }),
      )
      .addTextArea((text) => {
        text
          .setPlaceholder('---\\n## 📅 {{{dateSaved}}}\\n{{{content}}}')
          .setValue(this.plugin.settings.wechatMessageTemplate)
          .onChange(async (value) => {
            this.plugin.settings.wechatMessageTemplate = value || '---\\n## 📅 {{{dateSaved}}}\\n{{{content}}}'
            await this.plugin.saveSettings()
          })
        text.inputEl.setAttr('rows', 4)
        text.inputEl.setAttr('cols', 30)
      })
      .addExtraButton((button) => {
        button
          .setIcon('reset')
          .setTooltip('重置为默认模板 / reset to default template')
          .onClick(async () => {
            this.plugin.settings.wechatMessageTemplate = DEFAULT_SETTINGS.wechatMessageTemplate
            await this.plugin.saveSettings()
            this.display()
            new Notice('助手消息模板已重置 / assistant message template reset')
          })
      })

    new Setting(advancedSettings)
      .setName('前置元数据模板 / front matter template')
      .setDesc(
        createFragment((fragment) => {
          fragment.append(
            '输入 YAML 模板来渲染前置元数据 / Enter YAML template to render the front matter with ',
            fragment.createEl('a', {
              text: 'Reference',
              href: 'https://docs.omnivore.app/integrations/obsidian.html#front-matter-template',
            }),
            fragment.createEl('br'),
            fragment.createEl('br'),
            '我们建议您使用基本设置下的前置元数据部分来定义元数据 / We recommend you to use Front Matter section under the basic settings to define the metadata.',
            fragment.createEl('br'),
            fragment.createEl('br'),
            '如果设置了此模板，它将覆盖前置元数据，请确保您的模板是有效的 YAML / If this template is set, it will override the Front Matter so please make sure your template is a valid YAML.',
          )
        }),
      )
      .addTextArea((text) => {
        text
          .setPlaceholder('Enter the template')
          .setValue(this.plugin.settings.frontMatterTemplate)
          .onChange(async (value) => {
            this.plugin.settings.frontMatterTemplate = value
            await this.plugin.saveSettings()
          })

        text.inputEl.setAttr('rows', 10)
        text.inputEl.setAttr('cols', 30)
      })
      .addExtraButton((button) => {
        // add a button to reset template
        button
          .setIcon('reset')
          .setTooltip('Reset front matter template')
          .onClick(async () => {
            this.plugin.settings.frontMatterTemplate =
              DEFAULT_SETTINGS.frontMatterTemplate
            await this.plugin.saveSettings()
            this.display()
            new Notice('Front matter template reset')
          })
      })

    containerEl.createEl('p', {
      text: '更多信息请关注《笔记同步助手》公众号。',
    })

    // script to make collapsible sections
    const coll = document.getElementsByClassName('omnivore-collapsible')

    for (let i = 0; i < coll.length; i++) {
      coll[i].addEventListener('click', function (this: HTMLElement) {
        this.classList.toggle('omnivore-active')
        const content = this.nextElementSibling as HTMLElement | null
        if (content) {
          content.toggleClass('is-expanded', !content.hasClass('is-expanded'))
        }
      })
    }
  }

  displayBlock(block: HTMLElement, display: boolean): void {
    if (display) {
      block.removeClass('is-hidden')
    } else {
      block.addClass('is-hidden')
    }
  }

  private displayVersionInfo(containerEl: HTMLElement) {
    // 创建版本信息容器
    const versionContainer = containerEl.createEl('div', {
      cls: 'omnivore-version-container',
    })
    versionContainer.setCssStyles({
      marginBottom: '20px',
      padding: '15px',
      border: '1px solid var(--background-modifier-border)',
      borderRadius: '8px',
      background: 'var(--background-secondary)',
    })

    // 当前版本显示
    const currentVersion = this.plugin.manifest.version
    const versionInfo = versionContainer.createEl('div', {
      cls: 'omnivore-version-info',
    })

    const versionText = versionInfo.createEl('span', {
      text: `笔记同步助手版本: ${currentVersion}`,
      cls: 'omnivore-current-version',
    })
    versionText.setCssStyles({
      fontWeight: 'bold',
      marginRight: '15px',
    })

    // 检查更新按钮
    const checkButton = versionInfo.createEl('button', {
      text: '检查更新',
      cls: 'mod-cta omnivore-check-update-btn',
    })
    checkButton.setCssStyles({
      marginLeft: '10px',
    })

    checkButton.onclick = () => {
      void this.checkForUpdates(versionContainer)
    }

    // 如果已经在检查更新，显示状态
    if (this.versionCheckPromise) {
      this.showVersionCheckStatus(versionContainer, '正在检查更新...')
    }

    // 🚀 优化：延迟检查更新，避免阻塞启动
    // 用户可以手动点击检查更新按钮
    // 不再在页面加载时自动检查
    // this.checkForUpdates(versionContainer)
  }

  private async checkForUpdates(versionContainer: HTMLElement) {
    log('🔄 开始检查版本更新...')

    if (this.versionCheckPromise) {
      log('🔄 检查更新已在进行中，跳过...')
      return // 避免重复请求
    }

    this.showVersionCheckStatus(versionContainer, '正在检查更新...')

    this.versionCheckPromise = this.fetchLatestVersion()

    try {
      await this.versionCheckPromise
      log('🔄 版本检查完成，显示结果...')
      this.showVersionStatus(versionContainer)
    } catch (error) {
      logError('🔄 版本检查失败:', error)
      this.showVersionCheckStatus(versionContainer, '检查更新失败，请稍后重试')
    } finally {
      this.versionCheckPromise = null
    }
  }

  private async fetchLatestVersion(): Promise<void> {
    log('🔄 开始请求最新版本信息...')

    try {
      const response = await requestUrl({
        url: 'https://obsidian.notebooksyncer.com/plugversion',
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      log('🔄 API响应状态:', response.status)
      log('🔄 API响应数据:', response.json)

      if (response.status === 200) {
        const data = response.json as { version: string; downloadUrl: string }
        this.latestVersionInfo = {
          version: data.version,
          downloadUrl: data.downloadUrl,
        }
        log('🔄 最新版本信息已保存:', this.latestVersionInfo)
      } else {
        throw new Error(`HTTP ${response.status}`)
      }
    } catch (error) {
      logError('🔄 获取最新版本信息失败:', error)
      throw error
    }
  }

  private showVersionCheckStatus(versionContainer: HTMLElement, message: string) {
    // 移除之前的状态信息
    const existingStatus = versionContainer.querySelector('.omnivore-version-status')
    if (existingStatus) {
      existingStatus.remove()
    }

    // 显示新的状态信息
    const statusEl = versionContainer.createEl('div', {
      text: message,
      cls: 'omnivore-version-status',
    })
    statusEl.setCssStyles({
      marginTop: '10px',
      color: 'var(--text-muted)',
      fontSize: '0.9em',
    })
  }

  private showVersionStatus(versionContainer: HTMLElement) {
    log('🔄 开始显示版本状态...')

    // 移除之前的状态信息
    const existingStatus = versionContainer.querySelector('.omnivore-version-status')
    if (existingStatus) {
      existingStatus.remove()
    }

    if (!this.latestVersionInfo) {
      log('🔄 没有最新版本信息')
      this.showVersionCheckStatus(versionContainer, '无法获取最新版本信息')
      return
    }

    const currentVersion = this.plugin.manifest.version
    const latestVersion = this.latestVersionInfo.version

    log('🔄 当前版本:', currentVersion)
    log('🔄 最新版本:', latestVersion)

    const isNewer = this.isNewerVersion(latestVersion, currentVersion)
    log('🔄 版本比较结果 - 有新版本:', isNewer)

    if (isNewer) {
      log('🔄 显示更新提示')
      // 有新版本可用
      const updateContainer = versionContainer.createEl('div', {
        cls: 'omnivore-update-available',
      })
      updateContainer.setCssStyles({
        marginTop: '10px',
        padding: '10px',
        background: 'var(--background-modifier-success)',
        borderRadius: '4px',
      })

      const updateText = updateContainer.createEl('div', {
        text: `发现新版本 ${latestVersion}！`,
        cls: 'omnivore-update-text',
      })
      updateText.setCssStyles({
        color: 'var(--text-success)',
        fontWeight: 'bold',
        marginBottom: '8px',
      })

      const downloadButton = updateContainer.createEl('button', {
        text: '下载最新版本',
        cls: 'mod-cta omnivore-download-btn',
      })
      downloadButton.onclick = () => {
        log('🔄 用户点击下载按钮')
        window.open(this.latestVersionInfo!.downloadUrl, '_blank')
      }
    } else {
      log('🔄 显示已是最新版本提示')
      // 已是最新版本
      this.showVersionCheckStatus(versionContainer, '✅ 已是最新版本')
    }
  }

  private isNewerVersion(latestVersion: string, currentVersion: string): boolean {
    log('🔄 开始版本比较:', `最新版本: ${latestVersion}, 当前版本: ${currentVersion}`)

    // 简单的版本比较，假设版本格式为 x.y.z
    const parseVersion = (version: string) => {
      const parsed = version.split('.').map(num => parseInt(num, 10))
      log('🔄 解析版本:', version, '→', parsed)
      return parsed
    }

    const latest = parseVersion(latestVersion)
    const current = parseVersion(currentVersion)

    for (let i = 0; i < Math.max(latest.length, current.length); i++) {
      const latestNum = latest[i] || 0
      const currentNum = current[i] || 0

      log(`🔄 比较位置 ${i}: 最新 ${latestNum} vs 当前 ${currentNum}`)

      if (latestNum > currentNum) {
        log('🔄 版本比较结果: 有新版本')
        return true
      } else if (latestNum < currentNum) {
        log('🔄 版本比较结果: 当前版本更新')
        return false
      }
    }

    log('🔄 版本比较结果: 版本相同')
    return false // 版本相同
  }

  /**
   * 在设置页面打开时检查和执行配置迁移
   */
  private async checkAndPerformMigration(): Promise<void> {
    try {
      const manifestVersion = this.plugin.manifest.version
      const configMigrationManager = this.plugin.configMigrationManager

      log('设置页面：当前配置', {
        apiKey: this.plugin.settings.apiKey ? '***' : '(空)',
        version: this.plugin.settings.version,
        manifestVersion
      })

      if (configMigrationManager.isConfigMigrationNeeded(this.plugin.settings, manifestVersion)) {
        log('设置页面：检测到需要配置迁移')

        // 记录迁移前的关键配置
        const beforeMigration = {
          apiKey: this.plugin.settings.apiKey,
          syncAt: this.plugin.settings.syncAt
        }

        const migratedSettings = await configMigrationManager.performMigration(
          this.plugin.settings,
          manifestVersion
        )

        log('设置页面：迁移后的配置', {
          apiKey: migratedSettings.apiKey ? '***' : '(空)',
          version: migratedSettings.version,
          syncAt: migratedSettings.syncAt
        })

        // 检查是否实际恢复了有效配置
        const hasApiKeyRestored = migratedSettings.apiKey &&
          migratedSettings.apiKey !== beforeMigration.apiKey &&
          migratedSettings.apiKey.trim() !== ''

        const hasSyncTimeRestored = migratedSettings.syncAt &&
          migratedSettings.syncAt !== beforeMigration.syncAt &&
          migratedSettings.syncAt.trim() !== ''

        // 更新插件设置
        this.plugin.settings = migratedSettings
        await this.plugin.saveSettings()

        log('设置页面：配置保存完成')

        // 只在实际恢复了有效配置时显示通知
        if (hasApiKeyRestored || hasSyncTimeRestored) {
          new Notice('配置已从备份恢复', 5000)
          log('设置页面：成功恢复配置', {
            hasApiKeyRestored,
            hasSyncTimeRestored
          })
        } else {
          log('设置页面：未检测到有效的备份配置恢复')
        }
      } else {
        log('设置页面：无需配置迁移')
      }
    } catch (error) {
      logError('设置页面：配置迁移失败', error)
      // 迁移失败不应该影响设置页面的显示
    }
  }
}

// 确认对话框
class ConfirmModal extends Modal {
  private title: string
  private message: string
  private onConfirm: () => void | Promise<void>

  constructor(
    app: App,
    title: string,
    message: string,
    onConfirm: () => void | Promise<void>
  ) {
    super(app)
    this.title = title
    this.message = message
    this.onConfirm = onConfirm
  }

  onOpen() {
    const { contentEl } = this

    contentEl.createEl('h2', { text: this.title })
    const messageEl = contentEl.createEl('p', {
      text: this.message,
    })
    messageEl.setCssStyles({
      whiteSpace: 'pre-wrap',
      margin: '20px 0',
    })

    const buttonContainer = contentEl.createDiv()
    buttonContainer.setCssStyles({
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '10px',
      marginTop: '20px',
    })

    const cancelButton = buttonContainer.createEl('button', {
      text: '取消',
    })
    cancelButton.setCssStyles({
      padding: '5px 15px',
    })
    cancelButton.onclick = () => {
      this.close()
    }

    const confirmButton = buttonContainer.createEl('button', {
      text: '确认',
      cls: 'mod-warning',
    })
    confirmButton.setCssStyles({
      padding: '5px 15px',
    })
    confirmButton.onclick = () => {
      void this.onConfirm()
      this.close()
    }
  }

  onClose() {
    const { contentEl } = this
    contentEl.empty()
  }
}
