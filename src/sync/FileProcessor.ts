import { Item } from '@omnivore-app/api'
import { normalizePath, TFile } from 'obsidian'
import { SyncContext } from './SyncContext'
import { logError } from '../logger'

/**
 * FileProcessor - 单文件模式处理器
 *
 * 职责：
 * - 处理每条消息/文章创建独立文件
 * - 处理文件名冲突（带编号文件）
 * - 文件更新和创建
 * - 统一使用SuccessTracker记录成功
 */
export class FileProcessor {
	constructor(private context: SyncContext) {}

	/**
	 * 处理单文件模式的文章/消息
	 */
	async process(
		item: Item,
		normalizedPath: string,
		content: string,
		folderName: string,
		customFilename: string
	): Promise<void> {
		const omnivoreFile = this.context.app.vault.getAbstractFileByPath(normalizedPath)

		if (omnivoreFile instanceof TFile) {
			// 文件已存在，检查ID
			await this.handleExistingFile(
				item,
				omnivoreFile,
				content,
				folderName,
				customFilename
			)
		} else {
			// 文件不存在，创建新文件
			await this.createNewFile(normalizedPath, content)
		}

		// ✅ 统一在这里记录成功（自动去重）
		this.context.successTracker.recordSuccess(item.id)
	}

	/**
	 * 处理已存在的文件
	 */
	private async handleExistingFile(
		item: Item,
		omnivoreFile: TFile,
		content: string,
		folderName: string,
		customFilename: string
	): Promise<void> {
		const existingContent = await this.context.app.vault.read(omnivoreFile)
		const existingId = this.extractIdFromContent(existingContent)

		if (existingId && existingId !== item.id) {
			// ID不同，需要创建带编号的文件
			await this.handleIdConflict(
				item,
				content,
				folderName,
				customFilename
			)
		} else {
			// ID相同或无ID，更新现有文件
			await this.updateFileIfNeeded(omnivoreFile, existingContent, content)
		}
	}

	/**
	 * 处理ID冲突（寻找或创建带编号的文件）
	 */
	private async handleIdConflict(
		item: Item,
		content: string,
		folderName: string,
		customFilename: string
	): Promise<void> {
		let suffix = 2
		let newPageName = `${folderName}/${customFilename} ${suffix}.md`
		let newNormalizedPath = normalizePath(newPageName)
		let newOmnivoreFile = this.context.app.vault.getAbstractFileByPath(newNormalizedPath)

		// 循环寻找：1) 相同ID的文件（更新）或 2) 不存在的文件名（创建）
		while (newOmnivoreFile instanceof TFile) {
			try {
				const checkContent = await this.context.app.vault.read(newOmnivoreFile)
				const checkId = this.extractIdFromContent(checkContent)

				if (checkId === item.id) {
					// 找到相同ID的文件，更新
					await this.updateFileIfNeeded(newOmnivoreFile, checkContent, content)
					return // ✅ 处理完成，直接返回
				}

				// 尝试下一个编号
				suffix++
				newPageName = `${folderName}/${customFilename} ${suffix}.md`
				newNormalizedPath = normalizePath(newPageName)
				newOmnivoreFile = this.context.app.vault.getAbstractFileByPath(newNormalizedPath)
			} catch (error) {
				// ✅ 添加错误处理：文件可能被删除
				if (error.toString().includes('ENOENT') || error.toString().includes('no such file')) {
					// 文件在检查过程中被删除，尝试下一个编号
					suffix++
					newPageName = `${folderName}/${customFilename} ${suffix}.md`
					newNormalizedPath = normalizePath(newPageName)
					newOmnivoreFile = this.context.app.vault.getAbstractFileByPath(newNormalizedPath)
					continue
				}
				throw error // 其他错误抛出
			}
		}

		// 找到可用文件名，创建新文件
		const createdFile = await this.context.app.vault.create(newNormalizedPath, content)
		await this.context.enqueueFileForImageLocalization(createdFile)
		this.context.addProcessedFile(createdFile)
	}

	/**
	 * 更新文件（如果内容有变化）
	 */
	private async updateFileIfNeeded(
		file: TFile,
		existingContent: string,
		newContent: string
	): Promise<void> {
		if (existingContent !== newContent) {
			await this.context.app.vault.modify(file, newContent)
		}
		await this.context.enqueueFileForImageLocalization(file)
		this.context.addProcessedFile(file)
	}

	/**
	 * 创建新文件
	 */
	private async createNewFile(normalizedPath: string, content: string): Promise<void> {
		try {
			const createdFile = await this.context.app.vault.create(normalizedPath, content)
			await this.context.enqueueFileForImageLocalization(createdFile)
			this.context.addProcessedFile(createdFile)
		} catch (error) {
			if (error.toString().includes('File already exists')) {
				// 文件已存在（并发创建），尝试获取并处理
				const existingFile = this.context.app.vault.getAbstractFileByPath(normalizedPath)
				if (existingFile instanceof TFile) {
					await this.context.enqueueFileForImageLocalization(existingFile)
					this.context.addProcessedFile(existingFile)
				}
			} else {
				logError(`🔧 文件创建失败: ${normalizedPath}`, error)
				throw error // 重新抛出以便上层处理
			}
		}
	}

	/**
	 * 从文件内容中提取ID
	 */
	private extractIdFromContent(content: string): string | null {
		const idMatch = content.match(/^---\r?\n(?:[\s\S]*?)^id:\s*(.+?)\s*$/m)
		return idMatch ? idMatch[1].trim() : null
	}
}
