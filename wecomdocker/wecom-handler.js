const privateKey =
"-----BEGIN PRIVATE KEY-----\n" +
"MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCskSPYVpFHElMy\n" +
"LqVJn3WtKLZFOTTRl7RwuyPe9qgqYzx5yEopo18omxz0T9xyGRpKs6cjIrrsRIo+\n" +
"g4jMhMDaeUb7UlZ1Ty49T5r3oAMUxZYwPdsxT6H2/+lySaTV0vEvTWwlmTNgL7aR\n" +
"JDzcx//dQkfrHIA7bmh9b6RyCwT0kKQH9jWGv5k9X06hpKR+xIWm3WP113erqGYI\n" +
"5qiTWQ/0u06pOjL+mwDNJ6v4tfHk8fq3fIkya82A+NJnTIEKnL6+wb2/0980ipD0\n" +
"w7Ml8CypyV4XaDNEmbKQVWFZamWZSK/KtrezEA4f44cfI0M2RWRgYeJ5X+c1oxQ5\n" +
"ku/dxWfvAgMBAAECggEAfwhJDtSLFXqT6/kSi+PqyJGTu9mk3DWFCwd4HIYOvUVY\n" +
"G34pugUd49Jruh2f9g4soJknjGHgoFTEP8isR4HiRfHJIvE13B1xuIiFV4xfOEdL\n" +
"jC+8z8wDOsSgoRU9Vnp2OZAQ8IyamVAGYUn/07cWz1Yfgx/z9cwM92nb8GfUOgOZ\n" +
"o+60Kvdt5OO8B8yi0olgrbhC9hl6pZ4iQBVTXT8rPRXU54m8/h2/FWy4QpPQdHSG\n" +
"wZor3XAKTuJVLLILDbhhpFUC6ge2/99s+a+Vc9eAYQ1JLIGxuTIWGMt1+Sj8D+Fk\n" +
"zXxDnCUCOVKc0vA8zs18qcw3MktCZZS9ieg30ZVQAQKBgQDiygYpeDfgxMFWrUx+\n" +
"26BtEdi8KNfybhZ8Vs1LxSJdjs0vVKTh8f3bbHJ8K2v5j4srjs8OfDiJg1DGyMtj\n" +
"IABRVC0FAtR1G7ZDYiCJ4eTEHx1egiHTANdpDWVXG+WfhqRlP3+ERYzhLpVK9Aft\n" +
"Gd+iS9ijlEkRsYs9KUp231Y+AQKBgQDCyzvM1qq87UNv7FFMa6gZ5yJo8JHSzZSW\n" +
"hc3IG5EiyRb4heWsXKPz+Cb9E6wO1MUug3Q0kFA361Xho/E1sLCYTyTC7ntCaFkg\n" +
"lxd7LYTxrSIVu6KhlMx1OHh2YXAHrRIAeRVcmlvEwXryFVhW8Z22Egbfr3tgEjkl\n" +
"wOQA5AuF7wKBgQDQLN3nJyEzw6gtZjp3oCbst5sZbOx87qzZSdx9FuHqu3CBZ9NK\n" +
"TBXYWv3kGP+uPyNiwl4yT7ieEdoN/rcjsHZaMUh59xUKwntV8zcnGiIiHOWaoR1n\n" +
"ULhrCA7kHQl0m+U/wz/MLQOamGYWPVchP8TWd4TO8wj3ot/LLqHZ6DyEAQKBgF+O\n" +
"/7kPHhcsdca0MXXB4mdCofjE+2RkgZ4N6dNe4qYj6+bjGLajg7Kta8L/IYrtCgY1\n" +
"ao5WtWOZSTo2CKCEGz28pZYTE9iSBBcex+AfhnZgrrXmpHOL4XknyMCaMDEzz/73\n" +
"Z2lUN+yf1cZofju4r9ufoEufdHC+v9YreC6PsK91AoGBAMgLrFGWhChVYuO2dMCF\n" +
"+Il07l/J4oxqA4crUYMlNxrLbpkI6TCZGwxgh3ghnCfyuSQ67h43wIChfWdqHSqE\n" +
"Soc8JdUU16JmptjW1BuJcgKAF0HaBf6FiqJEXlVCJ35Nm1UVJZ7EZNTsqZtpEam2\n" +
"eh9xiQf2pSveOeL81zp4MtlT\n" +
"-----END PRIVATE KEY-----\n";

// 企微消息拉取功能 - 使用真实的企微SDK
async function getWecomMessages(corpid, secret, seq = 0, maxResults = 50, timeout = 30) {
    try {
        console.log(`拉取企微消息: corpid=${corpid}, seq=${seq}`);

        // 引入企微SDK
        const {
            GetMediaDataParams,
            GetDataParams,
            WeWorkChat,
            ChatDataItem,
        } = require("wework-chat-node");

        // 初始化企微SDK
        const wework = new WeWorkChat({
            corpid: corpid,
            secret: secret,
            private_key: privateKey,
            seq: 1, // 这个值会被下面的params覆盖
        });

        // 设置拉取参数
        const params = {
            max_results: maxResults,
            timeout: timeout,
            seq: seq,
        };

        // 调用SDK拉取消息
        const ret = await wework.getChatData(params);
        console.log(`企微SDK返回 last_seq: ${ret.last_seq}`);

        return {
            data: ret.data || [],
            last_seq: ret.last_seq || seq
        };
    } catch (error) {
        console.error('拉取企微消息失败:', error);
        throw error;
    }
}

// 解析和过滤消息
function parseAndFilterMessages(messages) {
    const filteredMessages = [];

    messages.forEach((msg, index) => {
        if (!msg) return;

        try {
            // 如果是字符串，尝试解析为JSON
            if (typeof msg === 'string') {
                msg = JSON.parse(msg);
            }

            // 只处理发给obsidian的消息或群消息
            if (msg.tolist && (msg.tolist.includes("zeyang") )) {
                // 添加消息处理时间戳
                msg.processTime = Date.now();
                filteredMessages.push(msg);
                console.log(`处理消息 ${msg.msgid || index}: ${msg.msgtype}, 来自: ${msg.from}`);
            }
        } catch (error) {
            console.error(`解析消息 ${index} 失败:`, error.message);
        }
    });

    return filteredMessages;
}

// 分类消息：将链接消息也当作文本消息处理
function categorizeMessages(messages) {
    const textMessages = [];
    const processedMessages = [];

    messages.forEach(msg => {
        // 检查消息类型
        if (msg.msgtype === 'text') {
            textMessages.push(msg);
        } else if (msg.msgtype === 'link') {
            // 将链接消息转换为文本消息格式
            const linkAsText = convertLinkToText(msg);
            textMessages.push(linkAsText);
        } else {
            // 其他类型消息暂时当作文本处理
            console.log(`未知消息类型 ${msg.msgtype}, 当作文本处理`);
            textMessages.push(msg);
        }
        processedMessages.push(msg);
    });

    return { textMessages, processedMessages };
}

// 处理文本类型消息
function processTextContent(msg) {
    let content = '';
    let title = '';

    try {
        if (msg.text && msg.text.content) {
            content = msg.text.content;
        } else if (msg.convertedContent) {
            // 处理从链接转换过来的文本
            content = msg.convertedContent;
        } else if (typeof msg.content === 'string') {
            content = msg.content;
        } else {
            content = JSON.stringify(msg);
        }

        // 生成标题
        title = content.length > 50 ? content.substring(0, 50) + '...' : content;
        if (!title.trim()) {
            title = `企微消息_${new Date(msg.msgtime || Date.now()).toLocaleString()}`;
        }
    } catch (error) {
        console.error('处理文本消息失败:', error);
        content = '消息解析失败';
        title = '解析失败的消息';
    }

    return {
        title: title,
        content: content,
        author: msg.from || '企微用户',
        description: '来自企微的文本消息',
        siteName: '企业微信',
        url: '', // 文本消息没有URL
        msgtime: msg.msgtime || Date.now(),
        msgid: msg.msgid,
        originalMessage: msg
    };
}

// 将链接消息转换为文本格式
function convertLinkToText(msg) {
    let linkData = {};
    let textContent = '';

    try {
        if (msg.link) {
            linkData = msg.link;
        } else if (msg.content) {
            linkData = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
        }

        // 将链接信息组合成文本
        const title = linkData.title || '链接';
        const url = linkData.link_url || linkData.url || '';
        const description = linkData.description || linkData.desc || '';

        textContent = `${title}\n${url}`;
        if (description) {
            textContent += `\n${description}`;
        }

    } catch (error) {
        console.error('转换链接消息失败:', error);
        textContent = '链接消息解析失败';
    }

    // 返回转换后的文本消息格式
    return {
        ...msg,
        msgtype: 'text',
        convertedContent: textContent,
        originalType: 'link'
    };
}

// 处理链接类型消息（保留原函数用于兼容）
function processLinkContent(msg) {
    let linkData = {};

    try {
        if (msg.link) {
            linkData = msg.link;
        } else if (msg.content) {
            linkData = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
        }
    } catch (error) {
        console.error('解析链接消息失败:', error);
    }

    return {
        title: linkData.title || '链接消息',
        url: linkData.link_url || linkData.url,
        content: linkData.description || linkData.desc || '',
        author: msg.from || '企微用户',
        description: linkData.description || '来自企微的链接消息',
        image: linkData.picurl,
        siteName: '企业微信',
        msgtime: msg.msgtime || Date.now(),
        msgid: msg.msgid,
        originalMessage: msg
    };
}

// 主要的消息处理函数
async function processWecomMessages(corpid, secret, seq = 0, minMsgTime = 0) {
    try {
        console.log('开始处理企微消息...');

        // 1. 拉取消息
        const messageResult = await getWecomMessages(corpid, secret, seq);

        // 2. 解析和过滤消息
        const filteredMessages = parseAndFilterMessages(messageResult.data);

        // 3. 按时间过滤消息（只处理指定时间之后的消息）
        const timeFilteredMessages = filteredMessages.filter(msg => {
            return (msg.msgtime || 0) >= minMsgTime;
        });

        // 4. 分类消息
        const { textMessages } = categorizeMessages(timeFilteredMessages);

        // 5. 处理所有消息为文本格式
        const processedMessages = textMessages.map(msg => processTextContent(msg));

        console.log(`处理完成，共处理 ${processedMessages.length} 条消息`);

        return {
            messages: processedMessages,
            last_seq: messageResult.last_seq,
            total: processedMessages.length,
            totalFiltered: timeFilteredMessages.length,
            totalReceived: messageResult.data.length
        };

    } catch (error) {
        console.error('处理企微消息时发生错误:', error);
        throw error;
    }
}

module.exports = {
    getWecomMessages,
    parseAndFilterMessages,
    categorizeMessages,
    processTextContent,
    processLinkContent,
    convertLinkToText,
    processWecomMessages
};