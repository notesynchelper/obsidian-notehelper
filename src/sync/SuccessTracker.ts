/**
 * SuccessTracker - 基于消息ID去重的成功计数器
 *
 * 作用：
 * - 自动去重：同一消息ID只计数一次
 * - 解决双重计数bug：替代原来的totalSuccessCount++
 * - 准确统计：即使同一消息被处理多次，也只计数1次
 */
export class SuccessTracker {
	private processedIds: Set<string> = new Set()

	/**
	 * 记录成功处理的消息
	 * @param itemId 消息ID
	 * @returns 是否首次记录（true=首次，false=重复）
	 */
	recordSuccess(itemId: string): boolean {
		if (this.processedIds.has(itemId)) {
			return false // 重复ID，不计数
		}
		this.processedIds.add(itemId)
		return true // 首次记录，已计数
	}

	/**
	 * 获取去重后的成功处理数量
	 */
	getCount(): number {
		return this.processedIds.size
	}

	/**
	 * 检查消息是否已处理过
	 */
	hasProcessed(itemId: string): boolean {
		return this.processedIds.has(itemId)
	}

	/**
	 * 重置计数器（用于新一轮同步）
	 */
	reset(): void {
		this.processedIds.clear()
	}
}
