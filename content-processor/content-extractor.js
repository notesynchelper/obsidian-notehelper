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
            "cf": ".ilzy.workers.dev/get_content_uni"
        };

        // 限流相关
        this.requestHistory = [];
        this.maxRequestsPerMinute = 2;
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
                return {
                    success: true,
                    spiderName: endpoint.spiderName,
                    ...response.data
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