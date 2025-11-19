import { Item } from '@omnivore-app/api'
import { stringifyYaml, TFile } from 'obsidian'
import Mustache from 'mustache'
import { SyncContext } from './SyncContext'
import { log, logError } from '../logger'
import {
	parseFrontMatterFromContent,
	removeFrontMatterFromContent,
	findFrontMatterIndex,
	formatDate,
} from '../util'
import {
	isWeChatMessage,
	renderWeChatMessageSimple,
} from '../settings/template'

/**
 * MergeProcessor - 合并模式处理器
 *
 * 职责：
 * - 处理企微消息合并（简洁模式追加）
 * - 处理普通文章合并（分隔符模式）
 * - 统一使用SuccessTracker记录成功
 */
export class MergeProcessor {
	constructor(private context: SyncContext) {}

	/**
	 * 处理合并模式的文章/消息
	 */
	async process(
		item: Item,
		omnivoreFile: TFile,
		content: string
	): Promise<void> {
		const existingContent = await this.context.app.vault.read(omnivoreFile)
		const contentWithoutFrontmatter = removeFrontMatterFromContent(content)
		const existingContentWithoutFrontmatter =
			removeFrontMatterFromContent(existingContent)

		// 解析existing的Front Matter
		let parsedExistingFrontMatter = parseFrontMatterFromContent(existingContent)
		let existingFrontMatter = parsedExistingFrontMatter?.messages || []
		if (!Array.isArray(existingFrontMatter)) {
			existingFrontMatter = Array.isArray(parsedExistingFrontMatter)
				? parsedExistingFrontMatter
				: [parsedExistingFrontMatter]
		}

		// 解析new的Front Matter
		const parsedNewFrontMatter = parseFrontMatterFromContent(content)
		log('🔧 解析Front Matter:', {
			itemId: item.id,
			title: item.title,
			parsed: parsedNewFrontMatter,
		})

		let newFrontMatter = parsedNewFrontMatter?.messages || []
		if (
			!newFrontMatter ||
			!Array.isArray(newFrontMatter) ||
			newFrontMatter.length === 0
		) {
			logError('⚠️ Front Matter解析失败，使用默认值', {
				itemId: item.id,
				title: item.title,
			})
			newFrontMatter = [{ id: item.id }]
		}

		// 企微消息特殊处理
		if (isWeChatMessage(item)) {
			await this.processWeChatMessage(
				item,
				omnivoreFile,
				existingFrontMatter,
				newFrontMatter,
				existingContentWithoutFrontmatter,
				contentWithoutFrontmatter
			)
		} else {
			// 普通文章合并
			await this.processRegularArticle(
				item,
				omnivoreFile,
				existingFrontMatter,
				newFrontMatter,
				existingContentWithoutFrontmatter,
				contentWithoutFrontmatter
			)
		}

		// ✅ 统一在这里记录成功（自动去重）
		this.context.successTracker.recordSuccess(item.id)
	}

	/**
	 * 处理企微消息（简洁模式追加）
	 */
	private async processWeChatMessage(
		item: Item,
		omnivoreFile: TFile,
		existingFrontMatter: any[],
		newFrontMatter: any[],
		existingContentWithoutFrontmatter: string,
		contentWithoutFrontmatter: string
	): Promise<void> {
		const frontMatterIdx = findFrontMatterIndex(existingFrontMatter, item.id)

		if (frontMatterIdx >= 0) {
			// 消息已存在，只更新Front Matter
			existingFrontMatter[frontMatterIdx] = newFrontMatter[0]

			const newFrontMatterStr = `---\n${stringifyYaml({
				messages: existingFrontMatter,
			})}---`
			await this.context.app.vault.modify(
				omnivoreFile,
				`${newFrontMatterStr}\n\n${existingContentWithoutFrontmatter}`
			)
		} else {
			// 新消息，追加到文件末尾
			existingFrontMatter.push(newFrontMatter[0])

			const simpleContent = renderWeChatMessageSimple(
				item,
				this.context.settings.dateSavedFormat,
				this.context.settings.wechatMessageTemplate
			)

			if (!simpleContent) {
				logError(`🔧 警告：渲染消息内容为空，ID: ${item.id}`)
			}

			const newFrontMatterStr = `---\n${stringifyYaml({
				messages: existingFrontMatter,
			})}---`

			const separator = existingContentWithoutFrontmatter.trim() ? '\n\n' : ''
			const newFileContent = `${newFrontMatterStr}\n\n${existingContentWithoutFrontmatter}${separator}${simpleContent}`

			await this.context.app.vault.modify(omnivoreFile, newFileContent)
		}

		await this.context.enqueueFileForImageLocalization(omnivoreFile)
		this.context.addProcessedFile(omnivoreFile)
	}

	/**
	 * 处理普通文章合并（分隔符模式）
	 */
	private async processRegularArticle(
		item: Item,
		omnivoreFile: TFile,
		existingFrontMatter: any[],
		newFrontMatter: any[],
		existingContentWithoutFrontmatter: string,
		contentWithoutFrontmatter: string
	): Promise<void> {
		let newContentWithoutFrontMatter: string

		const frontMatterIdx = findFrontMatterIndex(existingFrontMatter, item.id)

		if (frontMatterIdx >= 0) {
			// 文章已存在，替换内容
			if (
				this.context.settings.sectionSeparator &&
				this.context.settings.sectionSeparatorEnd
			) {
				const dateSaved = formatDate(
					item.savedAt,
					this.context.settings.dateSavedFormat
				)
				const articleView = {
					id: item.id,
					title: item.title,
					dateSaved,
				}
				const renderedStart = Mustache.render(
					this.context.settings.sectionSeparator,
					articleView
				)
				const renderedEnd = Mustache.render(
					this.context.settings.sectionSeparatorEnd,
					articleView
				)
				const escapeRegex = (str: string) =>
					str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
				const existingContentRegex = new RegExp(
					`${escapeRegex(renderedStart)}.*?${escapeRegex(renderedEnd)}`,
					's'
				)
				newContentWithoutFrontMatter =
					existingContentWithoutFrontmatter.replace(
						existingContentRegex,
						contentWithoutFrontmatter
					)
			} else {
				newContentWithoutFrontMatter = `${contentWithoutFrontmatter}\n\n${existingContentWithoutFrontmatter}`
			}

			existingFrontMatter[frontMatterIdx] = newFrontMatter[0]
		} else {
			// 文章不存在，前置添加
			newContentWithoutFrontMatter = `${contentWithoutFrontmatter}\n\n${existingContentWithoutFrontmatter}`
			existingFrontMatter.unshift(newFrontMatter[0])
		}

		const newFrontMatterStr = `---\n${stringifyYaml({
			messages: existingFrontMatter,
		})}---`

		await this.context.app.vault.modify(
			omnivoreFile,
			`${newFrontMatterStr}\n\n${newContentWithoutFrontMatter}`
		)

		await this.context.enqueueFileForImageLocalization(omnivoreFile)
		this.context.addProcessedFile(omnivoreFile)
	}
}
