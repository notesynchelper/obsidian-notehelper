const axios = require('axios');
const TurndownService = require('turndown');

class ContentExtractor {
    constructor() {
        this.options = [
            {
                weight: 30,
                url: "onenoteauth",
                url_pattern: "azure"
            },
            {
                weight: 30,
                url: "onenoteauth2",
                url_pattern: "azure"
            },
            {
                weight: 30,
                url: "lzyownget1",
                url_pattern: "azure"
            },
            {
                weight: 30,
                url: "lzyownget2",
                url_pattern: "azure"
            },
            {
                weight: 90,
                url: "getcontent",
                url_pattern: "cf"
            }
        ];

        this.urlPatternDict = {
            "azure": ".azurewebsites.net/get_content_uni",
            "cf": ".clipfx.app/get_content_uni"
        };

        // 限流相关
        this.requestHistory = [];
        this.maxRequestsPerMinute = 2;

        // 初始化 HTML 转 Markdown 转换器
        this.turndownService = new TurndownService({
            headingStyle: 'atx',
            hr: '---',
            bulletListMarker: '-',
            codeBlockStyle: 'fenced',
            fence: '```'
        });
    }

    selectEndpoint() {
        const totalWeight = this.options.reduce((sum, option) => sum + option.weight, 0);
        const randomNum = Math.random() * totalWeight;

        let cumulativeWeight = 0;
        for (const option of this.options) {
            cumulativeWeight += option.weight;
            if (randomNum < cumulativeWeight) {
                const { url, url_pattern } = option;
                const fullUrl = `https://${url}${this.urlPatternDict[url_pattern]}`;
                return {
                    url: fullUrl,
                    spiderName: `${url_pattern}.${url}`
                };
            }
        }

        // 默认返回第一个选项
        const firstOption = this.options[0];
        return {
            url: `https://${firstOption.url}${this.urlPatternDict[firstOption.url_pattern]}`,
            spiderName: `${firstOption.url_pattern}.${firstOption.url}`
        };
    }

    canMakeRequest() {
        const now = Date.now();
        const oneMinuteAgo = now - 60 * 1000;

        // 清理超过1分钟的请求记录
        this.requestHistory = this.requestHistory.filter(timestamp => timestamp > oneMinuteAgo);

        // 检查是否超过限制
        return this.requestHistory.length < this.maxRequestsPerMinute;
    }

    recordRequest() {
        this.requestHistory.push(Date.now());
    }

    convertHtmlToMarkdown(htmlContent) {
        if (!htmlContent || typeof htmlContent !== 'string') {
            return htmlContent;
        }

        try {
            // 转换 HTML 到 Markdown
            const markdown = this.turndownService.turndown(htmlContent);
            console.log('HTML to Markdown conversion completed');
            return markdown;
        } catch (error) {
            console.error('HTML to Markdown conversion failed:', error.message);
            // 如果转换失败，返回原始内容
            return htmlContent;
        }
    }

    async waitForRateLimit() {
        if (this.canMakeRequest()) {
            return;
        }

        // 计算需要等待的时间
        const oldestRequest = Math.min(...this.requestHistory);
        const waitTime = oldestRequest + 60 * 1000 - Date.now();

        if (waitTime > 0) {
            console.log(`Rate limit reached. Waiting ${Math.ceil(waitTime / 1000)} seconds...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }

    async extractContent(targetUrl, cleanOption = "0") {
        try {
            // 等待限流
            await this.waitForRateLimit();

            const endpoint = this.selectEndpoint();
            console.log(`Using endpoint: ${endpoint.spiderName} (${endpoint.url})`);

            // 记录请求
            this.recordRequest();

            const response = await axios.post(endpoint.url, {
                target_url: targetUrl,
                clean_option: cleanOption
            }, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 30000 // 30秒超时
            });

            if (response.status === 200 && response.data) {
                console.log('Content extraction successful');

                // 处理返回的数据，将 HTML 内容转换为 Markdown
                const processedData = { ...response.data };

                // 如果有 content 字段，转换为 Markdown
                if (processedData.content) {
                    processedData.content = this.convertHtmlToMarkdown(processedData.content);
                }

                // 如果有 text 字段，也转换为 Markdown（备用字段）
                if (processedData.text) {
                    processedData.text = this.convertHtmlToMarkdown(processedData.text);
                }

                return {
                    success: true,
                    spiderName: endpoint.spiderName,
                    ...processedData
                };
            } else {
                console.log('Content extraction failed - no data');
                return {
                    success: false,
                    error: 'No data returned',
                    spiderName: endpoint.spiderName
                };
            }

        } catch (error) {
            console.error('Content extraction error:', error.message);
            return {
                success: false,
                error: error.message,
                spiderName: error.config?.url || 'unknown'
            };
        }
    }

    getStatus() {
        const now = Date.now();
        const oneMinuteAgo = now - 60 * 1000;
        const recentRequests = this.requestHistory.filter(timestamp => timestamp > oneMinuteAgo);

        return {
            requestsInLastMinute: recentRequests.length,
            maxRequestsPerMinute: this.maxRequestsPerMinute,
            canMakeRequest: this.canMakeRequest(),
            nextAvailableTime: recentRequests.length >= this.maxRequestsPerMinute ?
                Math.min(...recentRequests) + 60 * 1000 : Date.now()
        };
    }
}

module.exports = ContentExtractor;