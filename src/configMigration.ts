import { App, Notice, Plugin, normalizePath, TFolder } from 'obsidian'
import { DEFAULT_SETTINGS, OmnivoreSettings } from './settings'
import { log, logError } from './logger'

interface BackupData {
  timestamp: string
  version: string
  settings: OmnivoreSettings
}

/**
 * 配置迁移管理器 - 三层防护机制
 *
 * 1. 主配置: Plugin.saveData() -> .obsidian/plugins/my-plugin/data.json (会被删除)
 * 2. 内嵌备份: 主配置中的 config-backup 数组 (随主配置一起删除)
 * 3. 外部备份: vault.adapter.write() -> .obsidian/.obsidian-sync-helper-backup/ (插件外,不会被删除)
 *
 * 恢复优先级: 主配置 → 外部备份 → 默认配置
 */
export class ConfigMigrationManager {
  private app: App
  private plugin: Plugin
  private readonly BACKUP_KEY = 'config-backup'
  private readonly MAX_BACKUPS = 5
  // Vault级外部备份路径 (插件目录外,升级时不会被删除)
  private readonly VAULT_BACKUP_FILE = 'config-history.json'

  constructor(app: App, plugin: Plugin) {
    this.app = app
    this.plugin = plugin
  }

  /**
   * 获取 Vault 级外部备份目录路径
   */
  private get VAULT_BACKUP_DIR(): string {
    return `${this.app.vault.configDir}/.obsidian-sync-helper-backup`
  }

  /**
   * 使用官方API备份当前配置到插件数据目录 (内嵌备份)
   */
  async backupSettings(settings: OmnivoreSettings): Promise<void> {
    try {
      const backupData: BackupData = {
        timestamp: new Date().toISOString(),
        version: settings.version,
        settings: settings
      }

      // 1. 内嵌备份: 保存到主配置文件中
      const existingBackups = await this.loadInternalBackups()
      existingBackups.unshift(backupData)
      const limitedBackups = existingBackups.slice(0, this.MAX_BACKUPS)

      const currentData = await this.plugin.loadData() || {}
      currentData[this.BACKUP_KEY] = limitedBackups
      await this.plugin.saveData(currentData)

      // 2. 外部备份: 保存到 Vault 级备份目录 (不会被插件升级删除)
      await this.saveToVaultBackup(backupData)

      log('配置备份成功', {
        internalBackups: limitedBackups.length,
        externalBackup: 'vault level',
        latestBackup: backupData.timestamp
      })
    } catch (error) {
      // 备份失败不应该影响插件的正常功能,只记录警告
      log('配置备份失败,但不影响插件正常运行', error.message)
    }
  }

  /**
   * 保存配置到 Vault 级外部备份目录
   */
  private async saveToVaultBackup(backupData: BackupData): Promise<void> {
    try {
      // 确保备份目录存在 - 使用 adapter.exists() 检查
      const backupDir = normalizePath(this.VAULT_BACKUP_DIR)
      const dirExists = await this.app.vault.adapter.exists(backupDir)

      if (!dirExists) {
        try {
          await this.app.vault.createFolder(backupDir)
          log('创建外部备份目录:', backupDir)
        } catch (error) {
          // 文件夹可能在并发操作中被创建，忽略此错误
          if (!error.toString().includes('Folder already exists')) {
            throw error
          }
          log('外部备份目录已存在，跳过创建')
        }
      }

      // 读取现有备份
      const existingBackups = await this.loadVaultBackups()

      // 添加新备份
      existingBackups.unshift(backupData)

      // 保留最近的备份
      const limitedBackups = existingBackups.slice(0, this.MAX_BACKUPS)

      // 写入文件
      const backupPath = normalizePath(`${this.VAULT_BACKUP_DIR}/${this.VAULT_BACKUP_FILE}`)
      const backupContent = JSON.stringify(limitedBackups, null, 2)

      await this.app.vault.adapter.write(backupPath, backupContent)

      log('外部备份保存成功:', {
        path: backupPath,
        backupCount: limitedBackups.length
      })
    } catch (error) {
      logError('外部备份保存失败:', error)
      // 外部备份失败不影响主功能
    }
  }

  /**
   * 从 Vault 级外部备份恢复配置
   */
  private async loadVaultBackups(): Promise<BackupData[]> {
    try {
      const backupPath = normalizePath(`${this.VAULT_BACKUP_DIR}/${this.VAULT_BACKUP_FILE}`)
      log('📂 检查外部备份文件:', backupPath)

      // 检查文件是否存在
      const exists = await this.app.vault.adapter.exists(backupPath)
      if (!exists) {
        log('❌ 外部备份文件不存在:', backupPath)
        return []
      }

      log('✅ 外部备份文件存在，开始读取...')

      // 读取备份文件
      const content = await this.app.vault.adapter.read(backupPath)
      log('📄 外部备份文件内容长度:', content.length)

      const backups = JSON.parse(content) as unknown
      log('📦 解析到备份数量:', Array.isArray(backups) ? backups.length : 0)

      // 验证备份数据格式
      if (!Array.isArray(backups)) {
        log('❌ 外部备份数据格式无效（不是数组）')
        return []
      }

      const validBackups = backups.filter((backup: unknown): backup is BackupData => {
        if (typeof backup !== 'object' || backup === null) {
          return false
        }
        const obj = backup as Record<string, unknown>
        return (
          'timestamp' in obj &&
          'settings' in obj &&
          typeof obj.settings === 'object'
        )
      })

      log('✅ 有效的外部备份数量:', validBackups.length)
      if (validBackups.length > 0) {
        log('📋 最新备份信息:', {
          timestamp: validBackups[0].timestamp,
          version: validBackups[0].settings?.version,
          hasApiKey: !!validBackups[0].settings?.apiKey
        })
      }

      return validBackups
    } catch (error) {
      logError('❌ 加载外部备份失败:', error)
      return []
    }
  }

  /**
   * 从插件数据目录恢复配置 (内嵌备份)
   */
  async restoreFromInternalBackup(): Promise<OmnivoreSettings | null> {
    try {
      const backups = await this.loadInternalBackups()

      if (backups.length === 0) {
        log('未找到内嵌备份')
        return null
      }

      const latestBackup = backups[0]
      if (latestBackup.settings) {
        log('从内嵌备份恢复配置成功', latestBackup.timestamp)
        return latestBackup.settings
      }
    } catch (error) {
      logError('从内嵌备份恢复配置失败', error)
    }
    return null
  }

  /**
   * 从 Vault 级外部备份恢复配置
   */
  async restoreFromVaultBackup(): Promise<OmnivoreSettings | null> {
    try {
      const backups = await this.loadVaultBackups()

      if (backups.length === 0) {
        log('未找到外部备份')
        return null
      }

      const latestBackup = backups[0]
      if (latestBackup.settings) {
        log('从外部备份恢复配置成功', latestBackup.timestamp)
        return latestBackup.settings
      }
    } catch (error) {
      logError('从外部备份恢复配置失败', error)
    }
    return null
  }

  /**
   * 加载内嵌备份 (主配置文件中)
   */
  private async loadInternalBackups(): Promise<BackupData[]> {
    try {
      const data = await this.plugin.loadData() || {}
      const backups = data[this.BACKUP_KEY] || []

      if (!Array.isArray(backups)) {
        log('内嵌备份数据格式无效,重新初始化')
        return []
      }

      return backups.filter((backup: unknown): backup is BackupData => {
        if (typeof backup !== 'object' || backup === null) {
          return false
        }
        const obj = backup as Record<string, unknown>
        return (
          'timestamp' in obj &&
          'settings' in obj &&
          typeof obj.settings === 'object'
        )
      })
    } catch (error) {
      logError('加载内嵌备份失败', error)
      return []
    }
  }

  /**
   * 检查是否需要配置迁移
   */
  isConfigMigrationNeeded(currentSettings: OmnivoreSettings, manifestVersion: string): boolean {
    // 如果当前配置为空或版本不匹配,可能需要迁移
    const hasMinimalConfig = currentSettings.apiKey && currentSettings.apiKey !== DEFAULT_SETTINGS.apiKey
    const versionMismatch = currentSettings.version !== manifestVersion

    return !hasMinimalConfig || versionMismatch
  }

  /**
   * 智能合并配置
   * 保留重要的用户配置,更新系统配置
   */
  smartMergeSettings(
    currentSettings: OmnivoreSettings,
    backupSettings: OmnivoreSettings,
    manifestVersion: string
  ): OmnivoreSettings {
    // 重要的用户配置字段,需要保留
    const userConfigFields = [
      'apiKey', 'syncAt', 'folder', 'filename', 'customQuery',
      'frequency', 'syncOnStart', 'folderDateFormat', 'filenameDateFormat',
      'attachmentFolder', 'mergeMode', 'frontMatterVariables',
      'frontMatterTemplate', 'highlightOrder', 'enableHighlightColorRender',
      'highlightManagerId', 'highlightColorMapping', 'singleFileName',
      'wechatMessageTemplate'
    ]

    // 优先使用备份配置,然后用默认值填补缺失的字段
    const mergedSettings = { ...DEFAULT_SETTINGS, ...backupSettings }

    // 🔧 迁移逻辑：将旧的 isSingleFile 转换为新的 mergeMode
    if ((backupSettings as any).isSingleFile !== undefined && !backupSettings.mergeMode) {
      const oldIsSingleFile = (backupSettings as any).isSingleFile
      // true -> MESSAGES (仅合并消息，这是最接近原来行为的选项)
      // false -> NONE (不合并)
      mergedSettings.mergeMode = oldIsSingleFile ? 'messages' as any : 'none' as any
      log('配置迁移：将 isSingleFile 转换为 mergeMode', {
        isSingleFile: oldIsSingleFile,
        mergeMode: mergedSettings.mergeMode
      })
    }

    // 对关键字段进行特殊处理:如果备份中有有效值,优先使用备份值
    for (const field of userConfigFields) {
      const key = field as keyof OmnivoreSettings
      const backupValue = backupSettings[key]
      const currentValue = currentSettings[key]

      // 如果备份中有有效值(非空字符串、非undefined、非null),使用备份值
      if (this.isValidValue(backupValue)) {
        ;(mergedSettings as any)[key] = backupValue
        log(`恢复配置字段 ${field}:`, {
          from: typeof backupValue === 'string' && backupValue.length > 10 ? '***' : backupValue
        })
      }
      // 否则如果当前值有效,使用当前值
      else if (this.isValidValue(currentValue)) {
        ;(mergedSettings as any)[key] = currentValue
      }
      // 最后使用默认值(已在上面的spread中设置)
    }

    // 更新版本号
    mergedSettings.version = manifestVersion

    log('智能合并配置完成', {
      apiKeyRestored: this.isValidValue(backupSettings.apiKey),
      syncAtRestored: this.isValidValue(backupSettings.syncAt),
      version: manifestVersion
    })

    return mergedSettings
  }

  /**
   * 检查值是否有效(非空、非undefined、非null)
   */
  private isValidValue(value: unknown): boolean {
    if (value === undefined || value === null) {
      return false
    }
    if (typeof value === 'string') {
      return value.trim() !== ''
    }
    return true
  }

  /**
   * 显示升级通知
   */
  showUpgradeNotice(fromVersion: string, toVersion: string, hasUserConfig: boolean): void {
    const message = hasUserConfig
      ? `笔记同步助手已从 ${fromVersion} 升级到 ${toVersion},您的配置已自动保留。`
      : `笔记同步助手已升级到 ${toVersion},已从备份恢复您的配置。`

    new Notice(message, 8000)
  }

  /**
   * 执行配置迁移流程 (按优先级尝试恢复)
   */
  async performMigration(
    currentSettings: OmnivoreSettings,
    manifestVersion: string
  ): Promise<OmnivoreSettings> {
    log('🔄 开始配置迁移流程', {
      currentApiKey: currentSettings.apiKey ? '***' : '(空)',
      currentVersion: currentSettings.version,
      targetVersion: manifestVersion
    })

    // 1. 尝试从内嵌备份恢复 (主配置文件中)
    log('🔍 尝试从内嵌备份恢复...')
    const internalBackup = await this.restoreFromInternalBackup()
    if (internalBackup) {
      const mergedSettings = this.smartMergeSettings(currentSettings, internalBackup, manifestVersion)
      log('✅ 配置迁移:从内嵌备份恢复配置成功', {
        backupVersion: internalBackup.version,
        targetVersion: manifestVersion,
        hasApiKey: !!internalBackup.apiKey
      })
      return mergedSettings
    }
    log('❌ 内嵌备份不可用')

    // 2. 尝试从外部备份恢复 (Vault级备份目录)
    log('🔍 尝试从外部备份恢复...')
    const vaultBackup = await this.restoreFromVaultBackup()
    if (vaultBackup) {
      const mergedSettings = this.smartMergeSettings(currentSettings, vaultBackup, manifestVersion)
      log('✅ 配置迁移:从外部备份恢复配置成功', {
        backupVersion: vaultBackup.version,
        targetVersion: manifestVersion,
        hasApiKey: !!vaultBackup.apiKey,
        hasSyncAt: !!vaultBackup.syncAt,
        apiKeyPreview: vaultBackup.apiKey ? vaultBackup.apiKey.substring(0, 10) + '...' : '(空)'
      })
      return mergedSettings
    }
    log('❌ 外部备份不可用')

    // 3. 没有任何备份,使用当前配置并更新版本
    const updatedSettings = { ...currentSettings, version: manifestVersion }
    log('⚠️ 配置迁移:无备份可用,仅更新版本', {
      fromVersion: currentSettings.version,
      toVersion: manifestVersion
    })

    return updatedSettings
  }

  /**
   * 获取备份信息用于调试
   */
  async getBackupInfo(): Promise<{
    internal: { count: number; latest: string | null }
    external: { count: number; latest: string | null }
  }> {
    try {
      const internalBackups = await this.loadInternalBackups()
      const externalBackups = await this.loadVaultBackups()

      return {
        internal: {
          count: internalBackups.length,
          latest: internalBackups.length > 0 ? internalBackups[0].timestamp : null
        },
        external: {
          count: externalBackups.length,
          latest: externalBackups.length > 0 ? externalBackups[0].timestamp : null
        }
      }
    } catch (error) {
      logError('获取备份信息失败', error)
      return {
        internal: { count: 0, latest: null },
        external: { count: 0, latest: null }
      }
    }
  }

  /**
   * 清理所有备份(用于重置)
   */
  async clearAllBackups(): Promise<void> {
    try {
      // 清理内嵌备份
      const currentData = await this.plugin.loadData() || {}
      currentData[this.BACKUP_KEY] = []
      await this.plugin.saveData(currentData)

      // 清理外部备份
      const backupPath = normalizePath(`${this.VAULT_BACKUP_DIR}/${this.VAULT_BACKUP_FILE}`)
      const exists = await this.app.vault.adapter.exists(backupPath)
      if (exists) {
        await this.app.vault.adapter.remove(backupPath)
      }

      log('所有备份已清理')
    } catch (error) {
      logError('清理备份失败', error)
    }
  }
}
