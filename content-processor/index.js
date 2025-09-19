const { ServiceBusClient } = require('@azure/service-bus');
const axios = require('axios');
const ContentExtractor = require('./content-extractor');

class ContentProcessor {
    constructor() {
        this.connectionString = process.env.AZ_BUS_CP_CS;
        this.namespace = 'contentprocess';
        this.queues = {
            vip: 'link-vip',
            normal: 'link-normal',
            trial: 'link-trial',
            dlq: 'link-dlq'
        };
        this.vipConsecutiveCount = 0;
        this.maxVipConsecutive = 10;
        this.backendBaseUrl = 'https://obsidian.notebooksyncer.com';
        this.contentExtractor = new ContentExtractor();

        if (!this.connectionString) {
            throw new Error('AZ_BUS_CP_CS environment variable is required');
        }

        this.serviceBusClient = new ServiceBusClient(this.connectionString);
    }

    async start() {
        console.log('Content Processor starting...');

        // 创建接收器
        this.vipReceiver = this.serviceBusClient.createReceiver(this.queues.vip);
        this.normalReceiver = this.serviceBusClient.createReceiver(this.queues.normal);
        this.trialReceiver = this.serviceBusClient.createReceiver(this.queues.trial);
        this.dlqSender = this.serviceBusClient.createSender(this.queues.dlq);

        console.log('Starting message processing...');
        this.processMessages();
    }

    async processMessages() {
        while (true) {
            try {
                let message = null;
                let receiver = null;

                // 优先处理VIP队列，但有兜底策略
                if (this.vipConsecutiveCount < this.maxVipConsecutive) {
                    const vipMessages = await this.vipReceiver.receiveMessages(1, { maxWaitTimeInMs: 1000 });
                    if (vipMessages.length > 0) {
                        message = vipMessages[0];
                        receiver = this.vipReceiver;
                        this.vipConsecutiveCount++;
                        console.log(`Processing VIP message (consecutive: ${this.vipConsecutiveCount})`);
                    }
                }

                // 如果没有VIP消息或达到连续处理上限，处理trial队列
                if (!message && this.vipConsecutiveCount >= this.maxVipConsecutive) {
                    const trialMessages = await this.trialReceiver.receiveMessages(1, { maxWaitTimeInMs: 1000 });
                    if (trialMessages.length > 0) {
                        message = trialMessages[0];
                        receiver = this.trialReceiver;
                        this.vipConsecutiveCount = 0; // 重置计数器
                        console.log('Processing trial message (resetting VIP counter)');
                    }
                }

                // 如果还没有消息，处理normal队列
                if (!message) {
                    const normalMessages = await this.normalReceiver.receiveMessages(1, { maxWaitTimeInMs: 1000 });
                    if (normalMessages.length > 0) {
                        message = normalMessages[0];
                        receiver = this.normalReceiver;
                        console.log('Processing normal message');
                    }
                }

                if (message && receiver) {
                    await this.handleMessage(message, receiver);
                } else {
                    // 没有消息时短暂等待
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

            } catch (error) {
                console.error('Error in message processing loop:', error);
                await new Promise(resolve => setTimeout(resolve, 5000)); // 错误后等待5秒
            }
        }
    }

    async handleMessage(message, receiver) {
        try {
            console.log('Received message:', message.messageId);

            // 解析消息体
            const messageBody = typeof message.body === 'string' ?
                JSON.parse(message.body) : message.body;

            // 验证消息格式
            const validationResult = this.validateMessage(messageBody);
            if (!validationResult.isValid) {
                console.error('Invalid message format:', validationResult.error);
                await this.sendToDLQ(message, `Invalid format: ${validationResult.error}`);
                await receiver.completeMessage(message);
                return;
            }

            // 处理链接消息
            await this.processLinkMessage(messageBody);

            // 完成消息处理
            await receiver.completeMessage(message);
            console.log('Message processed successfully:', message.messageId);

        } catch (error) {
            console.error('Error handling message:', error);
            try {
                await this.sendToDLQ(message, error.message);
                await receiver.completeMessage(message);
            } catch (dlqError) {
                console.error('Error sending to DLQ:', dlqError);
                // 如果无法发送到DLQ，放弃消息以避免无限循环
                await receiver.abandonMessage(message);
            }
        }
    }

    validateMessage(messageBody) {
        // 检查必需字段
        if (!messageBody.from) {
            return { isValid: false, error: 'Missing from field (user openid)' };
        }

        if (!messageBody.msgtype || messageBody.msgtype !== 'link') {
            return { isValid: false, error: 'Invalid or missing msgtype, expected "link"' };
        }

        if (!messageBody.link || !messageBody.link.link_url) {
            return { isValid: false, error: 'Missing link.link_url field' };
        }

        // 这里应该还要验证用户config信息，但消息格式中没有看到，可能需要通过openid查询

        return { isValid: true };
    }

    async processLinkMessage(messageBody) {
        const { from: userOpenId, link } = messageBody;
        const { link_url: linkUrl, title: linkTitle, description } = link;

        console.log(`Processing link for user ${userOpenId}: ${linkUrl}`);

        try {
            // 检查用户配置决定clean_option
            const cleanOption = messageBody.config?.config?.raw_html ? "1" : "0";
            console.log(`Using clean_option: ${cleanOption}`);

            // 显示当前限流状态
            const extractorStatus = this.contentExtractor.getStatus();
            console.log('Content extractor status:', extractorStatus);

            // 尝试通过内容提取节点解析URL
            const extractedContent = await this.contentExtractor.extractContent(linkUrl, cleanOption);

            let articleData;
            if (extractedContent.success) {
                // 成功提取内容
                console.log(`Content extraction successful via ${extractedContent.spiderName}`);
                articleData = {
                    title: extractedContent.title || linkTitle || '微信链接',
                    content: `原文链接：${linkUrl}\n\n${extractedContent.content || extractedContent.text || ''}`,
                    originalArticleUrl: linkUrl,
                    url: linkUrl,
                    author: extractedContent.author || '',
                    description: extractedContent.description || description || '',
                    siteName: extractedContent.siteName || extractedContent.site_name || '微信'
                };
            } else {
                // 提取失败，使用最小可读方式组装
                console.log(`Content extraction failed via ${extractedContent.spiderName || 'unknown'}: ${extractedContent.error}`);
                const title = linkTitle || '微信链接';
                articleData = {
                    title: title,
                    content: `${title}\n\n${linkUrl}`,
                    originalArticleUrl: linkUrl,
                    url: linkUrl,
                    description: description || '',
                    siteName: '微信'
                };
            }

            // 发送到后端API
            await this.createArticle(userOpenId, articleData);

        } catch (error) {
            console.error('Error processing link message:', error);
            throw error;
        }
    }

    async createArticle(userOpenId, articleData) {
        try {
            console.log('Creating article for user:', userOpenId);

            // 使用用户的openid作为API key (根据todo.md中的说明)
            const apiKey = userOpenId;

            const response = await axios.post(`${this.backendBaseUrl}/api/articles`, articleData, {
                headers: {
                    'x-api-key': apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 10000 // 10秒超时
            });

            if (response.status === 200 || response.status === 201) {
                console.log('Article created successfully:', response.data.data?.id);
                return response.data;
            } else {
                throw new Error(`Unexpected response status: ${response.status}`);
            }

        } catch (error) {
            if (error.response) {
                console.error('Backend API error:', error.response.status, error.response.data);
                throw new Error(`Backend API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
            } else {
                console.error('Network error calling backend API:', error.message);
                throw new Error(`Network error: ${error.message}`);
            }
        }
    }

    async sendToDLQ(originalMessage, errorReason) {
        try {
            const dlqMessage = {
                body: originalMessage.body,
                properties: {
                    ...originalMessage.properties,
                    errorReason: errorReason,
                    originalMessageId: originalMessage.messageId,
                    processedAt: new Date().toISOString()
                }
            };

            await this.dlqSender.sendMessages(dlqMessage);
            console.log('Message sent to DLQ:', originalMessage.messageId);

        } catch (error) {
            console.error('Failed to send message to DLQ:', error);
            throw error;
        }
    }

    async close() {
        console.log('Closing Content Processor...');

        try {
            await this.vipReceiver?.close();
            await this.normalReceiver?.close();
            await this.trialReceiver?.close();
            await this.dlqSender?.close();
            await this.serviceBusClient?.close();
            console.log('Content Processor closed successfully');
        } catch (error) {
            console.error('Error closing Content Processor:', error);
        }
    }
}

// 启动应用
const processor = new ContentProcessor();

// 优雅关闭
process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await processor.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await processor.close();
    process.exit(0);
});

// 启动处理器
processor.start().catch(error => {
    console.error('Failed to start Content Processor:', error);
    process.exit(1);
});