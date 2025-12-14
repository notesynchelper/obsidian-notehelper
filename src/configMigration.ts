import { App, Notice, Plugin, normalizePath } from 'obsidian'
import { DEFAULT_SETTINGS, MergeMode, OmnivoreSettings } from './settings'
import { log, logError } from './logger'

interface BackupData {
  timestamp: string
  version: string
  settings: OmnivoreSettings
}

/**
 * 兼容旧版配置 - 用于迁移已废弃的字段
 */
interface LegacySettings extends OmnivoreSettings {
  isSingleFile?: boolean  // 已废弃，迁移为 mergeMode
}

/**
 * 配置迁移管理器 - 外部备份机制
 *
 * 外部备份: vault.adapter.write() -> .obsidian/.obsidian-sync-helper-backup/ (插件外,不会被删除)
 *
 * 恢复优先级: 主配置 → 外部备份 → 默认配置
 */
export class ConfigMigrationManager {
  private app: App
  private plugin: Plugin
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
   * 备份当前配置到外部备份目录
   * 注意：不再写入 data.json，只保存到外部文件
   */
  async backupSettings(settings: OmnivoreSettings): Promise<void> {
    try {
      // 净化配置，移除可能的污染字段
      const settingsToBackup = this.sanitizeSettings(settings)

      const backupData: BackupData = {
        timestamp: new Date().toISOString(),
        version: settings.version,
        settings: settingsToBackup
      }

      // 只保存到外部备份目录
      await this.saveToVaultBackup(backupData)

      log('配置备份成功', {
        externalBackup: 'vault level',
        latestBackup: backupData.timestamp
      })
    } catch (error) {
      // 备份失败不应该影响插件的正常功能,只记录警告
      const errorMessage = error instanceof Error ? error.message : String(error)
      log('配置备份失败,但不影响插件正常运行', errorMessage)
    }
  }

  /**
   * 保存配置到 Vault 级外部备份目录
   */
  private async saveToVaultBackup(backupData: BackupData): Promise<void> {
    try {
      // 确保外部备份也不包含污染字段
      const sanitizedBackup = {
        ...backupData,
        settings: this.sanitizeSettings(backupData.settings)
      }

      // 确保备份目录存在
      const backupDir = normalizePath(this.VAULT_BACKUP_DIR)
      const dirExists = await this.app.vault.adapter.exists(backupDir)

      if (!dirExists) {
        try {
          await this.app.vault.createFolder(backupDir)
          log('创建外部备份目录:', backupDir)
        } catch (error) {
          const errorStr = error instanceof Error ? error.message : String(error)
          if (!errorStr.includes('Folder already exists')) {
            throw error
          }
          log('外部备份目录已存在，跳过创建')
        }
      }

      // 读取现有备份
      const existingBackups = await this.loadVaultBackups()

      // 添加新备份
      existingBackups.unshift(sanitizedBackup)

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
    }
  }

  /**
   * 从 Vault 级外部备份加载配置
   */
  private async loadVaultBackups(): Promise<BackupData[]> {
    try {
      const backupPath = normalizePath(`${this.VAULT_BACKUP_DIR}/${this.VAULT_BACKUP_FILE}`)
      log('📂 检查外部备份文件:', backupPath)

      const exists = await this.app.vault.adapter.exists(backupPath)
      if (!exists) {
        log('❌ 外部备份文件不存在:', backupPath)
        return []
      }

      log('✅ 外部备份文件存在，开始读取...')

      const content = await this.app.vault.adapter.read(backupPath)
      log('📄 外部备份文件内容长度:', content.length)

      const backups = JSON.parse(content) as unknown
      log('📦 解析到备份数量:', Array.isArray(backups) ? backups.length : 0)

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
        return this.sanitizeSettings(latestBackup.settings)
      }
    } catch (error) {
      logError('从外部备份恢复配置失败', error)
    }
    return null
  }

  /**
   * 检查是否需要配置迁移
   */
  isConfigMigrationNeeded(currentSettings: OmnivoreSettings, manifestVersion: string): boolean {
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
    const userConfigFields = [
      'apiKey', 'syncAt', 'folder', 'filename', 'customQuery',
      'frequency', 'syncOnStart', 'folderDateFormat', 'filenameDateFormat',
      'attachmentFolder', 'mergeMode', 'frontMatterVariables',
      'frontMatterTemplate', 'highlightOrder', 'enableHighlightColorRender',
      'highlightManagerId', 'highlightColorMapping', 'singleFileName',
      'wechatMessageTemplate'
    ]

    const mergedSettings = { ...DEFAULT_SETTINGS, ...backupSettings }

    // 迁移逻辑：将旧的 isSingleFile 转换为新的 mergeMode
    const legacySettings = backupSettings as LegacySettings
    if (legacySettings.isSingleFile !== undefined && !backupSettings.mergeMode) {
      const oldIsSingleFile = legacySettings.isSingleFile
      mergedSettings.mergeMode = oldIsSingleFile ? MergeMode.MESSAGES : MergeMode.NONE
      log('配置迁移：将 isSingleFile 转换为 mergeMode', {
        isSingleFile: oldIsSingleFile,
        mergeMode: mergedSettings.mergeMode
      })
    }

    for (const field of userConfigFields) {
      const key = field as keyof OmnivoreSettings
      const backupValue = backupSettings[key]
      const currentValue = currentSettings[key]

      if (this.isValidValue(backupValue)) {
        ;(mergedSettings as Record<string, unknown>)[key] = backupValue
        log(`恢复配置字段 ${field}:`, {
          from: typeof backupValue === 'string' && backupValue.length > 10 ? '***' : backupValue
        })
      } else if (this.isValidValue(currentValue)) {
        ;(mergedSettings as Record<string, unknown>)[key] = currentValue
      }
    }

    mergedSettings.version = manifestVersion

    log('智能合并配置完成', {
      apiKeyRestored: this.isValidValue(backupSettings.apiKey),
      syncAtRestored: this.isValidValue(backupSettings.syncAt),
      version: manifestVersion
    })

    return mergedSettings
  }

  /**
   * 检查值是否有效
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
   * 执行配置迁移流程 - 只从外部备份恢复
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

    // 尝试从外部备份恢复
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

    // 没有备份,使用当前配置并更新版本
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
    external: { count: number; latest: string | null }
  }> {
    try {
      const externalBackups = await this.loadVaultBackups()

      return {
        external: {
          count: externalBackups.length,
          latest: externalBackups.length > 0 ? externalBackups[0].timestamp : null
        }
      }
    } catch (error) {
      logError('获取备份信息失败', error)
      return {
        external: { count: 0, latest: null }
      }
    }
  }

  /**
   * 清理外部备份
   */
  async clearAllBackups(): Promise<void> {
    try {
      const backupPath = normalizePath(`${this.VAULT_BACKUP_DIR}/${this.VAULT_BACKUP_FILE}`)
      const exists = await this.app.vault.adapter.exists(backupPath)
      if (exists) {
        await this.app.vault.adapter.remove(backupPath)
      }

      log('外部备份已清理')
    } catch (error) {
      logError('清理备份失败', error)
    }
  }

  /**
   * 净化配置对象：移除可能导致问题的字段
   */
  private sanitizeSettings(settings: OmnivoreSettings): OmnivoreSettings {
    const cloned = JSON.parse(JSON.stringify(settings)) as Record<string, unknown>

    // 删除所有备份相关字段
    delete cloned['config-backup']

    // 递归清理嵌套对象中的备份字段（处理已损坏的遗留数据）
    this.deepCleanBackupFields(cloned)

    return cloned as unknown as OmnivoreSettings
  }

  /**
   * 递归清理对象中的备份字段
   */
  private deepCleanBackupFields(obj: Record<string, unknown>): void {
    for (const key in obj) {
      if (key === 'config-backup') {
        delete obj[key]
        continue
      }

      const value = obj[key]
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        this.deepCleanBackupFields(value as Record<string, unknown>)
      } else if (Array.isArray(value)) {
        value.forEach(item => {
          if (item && typeof item === 'object') {
            this.deepCleanBackupFields(item as Record<string, unknown>)
          }
        })
      }
    }
  }
}
