import { App, TFile } from 'obsidian'
import { OmnivoreSettings } from '../settings'
import { ImageLocalizer } from '../imageLocalizer/imageLocalizer'
import { SuccessTracker } from './SuccessTracker'

/**
 * SyncContext - 同步过程中的共享状态容器
 *
 * 作用：
 * - 集中管理同步过程中的共享状态
 * - 避免在函数间传递大量参数
 * - 使用Map管理processedFiles，自动去重
 */
export class SyncContext {
	app: App
	settings: OmnivoreSettings
	successTracker: SuccessTracker
	imageLocalizer: ImageLocalizer | null

	// 改用Map管理已处理文件，key为文件路径，自动去重
	processedFiles: Map<string, TFile> = new Map()

	constructor(
		app: App,
		settings: OmnivoreSettings,
		imageLocalizer: ImageLocalizer | null
	) {
		this.app = app
		this.settings = settings
		this.imageLocalizer = imageLocalizer
		this.successTracker = new SuccessTracker()
	}

	/**
	 * 添加已处理文件（自动去重）
	 */
	addProcessedFile(file: TFile): void {
		this.processedFiles.set(file.path, file)
	}

	/**
	 * 获取所有已处理文件的数组
	 */
	getProcessedFilesArray(): TFile[] {
		return Array.from(this.processedFiles.values())
	}

	/**
	 * 将文件加入图片本地化队列
	 */
	async enqueueFileForImageLocalization(file: TFile): Promise<void> {
		if (this.imageLocalizer) {
			await this.imageLocalizer.enqueueFile(file)
		}
	}
}
