const express = require('express');
const axios = require('axios');
const { CosmosClient } = require('@azure/cosmos');
const {
    getWecomMessages,
    parseAndFilterMessages,
    categorizeMessages,
    processTextContent,
    processLinkContent
} = require('./wecom-handler');

const app = express();
app.use(express.json());

// 配置常量
const CORPID = "ww30e0b84f86588f67";
const WECOM_CORP_SECRET = process.env.WECOM_CORP_SECRET;

// Cosmos DB 配置
const cosmosEndpoint = process.env.COSMOS_ENDPOINT || "https://note-sync-db.documents.azure.com:443/"
const cosmosKey = process.env.COSMOS_KEY;
const databaseId = 'note-sync';
const containerId = 'wechat';

let cosmosClient;
let database;
let container;

// 初始化 Cosmos DB
async function initCosmosDB() {
    if (!cosmosKey) {
        console.log('未设置 COSMOS_KEY 环境变量，跳过 Cosmos DB 初始化');
        return;
    }

    try {
        cosmosClient = new CosmosClient({
            endpoint: cosmosEndpoint,
            key: cosmosKey
        });

        database = cosmosClient.database(databaseId);
        container = database.container(containerId);

        console.log('Cosmos DB 初始化成功');
    } catch (error) {
        console.error('Cosmos DB 初始化失败:', error);
    }
}

// 从数据库获取最后的seq
async function getLastSeq() {
    if (!container) return 0;

    try {
        const { resource: item } = await container.item('wecom_seq_info', 'wecom_ob_info').read();
        return item ? item.last_seq : 0;
    } catch (error) {
        if (error.code === 404) {
            return 0;
        }
        console.error('获取last_seq失败:', error);
        return 0;
    }
}

// 保存seq到数据库
async function saveLastSeq(seq) {
    if (!container) return;

    try {
        await container.items.upsert({
            id: 'wecom_seq_info',
            pt: 'wecom_ob_info',
            last_seq: seq,
            updated_at: new Date().toISOString()
        });
        console.log('保存last_seq成功:', seq);
    } catch (error) {
        console.error('保存last_seq失败:', error);
    }
}

// 获取企微access token
async function getWecomToken() {
    try {
        const response = await axios.get('http://lzynodered2.azurewebsites.net/lzyapi/wecomtoken');
        return response.data.access_token;
    } catch (error) {
        console.error('获取企微token失败:', error);
        throw error;
    }
}

// 查询用户关联信息
async function queryUserMapping(wecomFrom) {
    if (!container) return null;

    try {
        const querySpec = {
            query: `SELECT * FROM c WHERE c.id = @wecomFrom AND c.pt = 'wecomid_uid'`,
            parameters: [{ name: '@wecomFrom', value: wecomFrom }]
        };

        const { resources } = await container.items.query(querySpec).fetchAll();
        return resources.length > 0 ? resources[0] : null;
    } catch (error) {
        console.error('查询用户关联失败:', error);
        return null;
    }
}

// 通过企微接口获取用户信息
async function getWecomUserInfo(wecomFrom, accessToken) {
    if (wecomFrom === "obsidian") return null;

    try {
        const url = `https://qyapi.weixin.qq.com/cgi-bin/externalcontact/get?access_token=${accessToken}&external_userid=${wecomFrom}`;
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error('获取企微用户信息失败:', error);
        return null;
    }
}

// 保存用户关联关系
async function saveUserMapping(wecomFrom, openId) {
    if (!container) return;

    try {
        await container.items.upsert({
            id: wecomFrom,
            pt: 'wecomid_uid',
            open_id: openId,
            created_at: new Date().toISOString()
        });
        console.log('保存用户关联成功:', wecomFrom, openId);
    } catch (error) {
        console.error('保存用户关联失败:', error);
    }
}

// 查询用户配置
async function getUserConfig(openId) {
    if (!container) return null;

    try {
        const querySpec = {
            query: `SELECT * FROM c WHERE c.id = @openId AND c.pt IN ('vip_info', 'user_config')`,
            parameters: [{ name: '@openId', value: openId }]
        };

        const { resources } = await container.items.query(querySpec).fetchAll();
        return resources;
    } catch (error) {
        console.error('查询用户配置失败:', error);
        return null;
    }
}

// 检查消息是否已处理（防重复）
async function checkMessageProcessed(uniqueKey) {
    if (!container) return false;

    try {
        const querySpec = {
            query: `SELECT c.id FROM c WHERE c.pt = 'mini_submit_cache' AND c.id = @uniqueKey`,
            parameters: [{ name: '@uniqueKey', value: uniqueKey }]
        };

        const { resources } = await container.items.query(querySpec).fetchAll();
        return resources.length > 0;
    } catch (error) {
        console.error('检查消息处理状态失败:', error);
        return false;
    }
}

// 标记消息已处理
async function markMessageProcessed(uniqueKey) {
    if (!container) return;

    try {
        await container.items.upsert({
            id: uniqueKey,
            pt: 'mini_submit_cache',
            ttl: 1 * 24 * 60 * 60, // 1天TTL
            processed_at: new Date().toISOString()
        });
        console.log('标记消息已处理:', uniqueKey);
    } catch (error) {
        console.error('标记消息处理失败:', error);
    }
}

// 向线上服务写入数据
async function writeToOnlineService(articleData, userConfig) {
    try {
        // 构造请求头，包含用户的API key
        const headers = {
            'Content-Type': 'application/json'
        };

        // 从用户配置中获取API key
        if (userConfig && userConfig.api_key) {
            headers['x-api-key'] = userConfig.api_key;
        }

        const response = await axios.post('https://obsidian.notebooksyncer.com/api/articles', articleData, {
            headers,
            timeout: 30000
        });

        return response.data;
    } catch (error) {
        console.error('写入线上服务失败:', error);
        throw error;
    }
}

// 发送企微通知消息
async function sendWecomNotification(openId, title = '笔记已同步', content = '可在Ob中刷新') {
    try {
        const pushData = {
            
            template: {
                open_id: openId,
                url: 'https://obsidian.notebooksyncer.com',
                template_id: 'UkDxRNqpjp-kywUb4izWMKlY5KQEEcLfXQXZTXPSES0',
                data: {
                    phrase15: { value: title },
                    thing19: { value: content }
                }
            }
        };

        const response = await axios.post('http://lzynodered2.azurewebsites.net/lzyapi/mpmessage', pushData);
        console.log('企微通知发送成功:', openId);
        return response.data;
    } catch (error) {
        console.error('发送企微通知失败:', error);
    }
}


// 处理单个消息的完整流程
async function processMessage(msg, msgType) {
    try {
        // 1. 生成消息唯一标识
        const uniqueKey = `${msg.from}_${msg.msgtime}_${msg.msgid || Date.now()}`;

        // 2. 检查是否已处理（防重复）
        const alreadyProcessed = await checkMessageProcessed(uniqueKey);
        if (alreadyProcessed) {
            console.log('消息已处理，跳过:', uniqueKey);
            return false;
        }

        // 3. 解析消息对应的用户
        const userInfo = await resolveUserInfo(msg.from);
        if (!userInfo) {
            console.log('无法解析用户信息:', msg.from);
            return false;
        }

        // 4. 根据消息类型处理内容
        let articleData;
        if (msgType === 'text') {
            articleData = processTextContent(msg);
        } else if (msgType === 'link') {
            articleData = processLinkContent(msg);
        } else {
            articleData = processTextContent(msg); // 默认按文本处理
        }

        // 5. 写入线上服务
        const writeResult = await writeToOnlineService(articleData, userInfo.config);
        console.log('写入线上服务成功:', writeResult.data?.id);

        // 6. 标记消息已处理
        await markMessageProcessed(uniqueKey);

        // 7. 发送企微通知
        if (userInfo.openId) {
            await sendWecomNotification(
                userInfo.openId,
                '笔记已同步',
                `已同步: ${articleData.title}`
            );
        }

        return true;
    } catch (error) {
        console.error('处理消息失败:', error);
        return false;
    }
}

// 解析用户信息的完整流程
async function resolveUserInfo(wecomFrom) {
    try {
        // 1. 查询现有的用户关联
        let userMapping = await queryUserMapping(wecomFrom);
        let openId;

        if (userMapping) {
            openId = userMapping.open_id;
        } else {
            // 2. 通过企微接口获取用户信息
            const accessToken = await getWecomToken();
            const wecomUserInfo = await getWecomUserInfo(wecomFrom, accessToken);

            if (!wecomUserInfo || !wecomUserInfo.external_contact) {
                return null;
            }

            // 3. 这里需要将unionid转换为openid的逻辑
            // 由于缺少具体的转换接口，暂时使用unionid作为openid
            openId = wecomUserInfo.external_contact.union_id || wecomFrom;

            // 4. 保存关联关系
            await saveUserMapping(wecomFrom, openId);
        }

        // 5. 获取用户配置
        const userConfigs = await getUserConfig(openId);
        const config = userConfigs ? userConfigs.find(c => c.pt === 'user_config') : null;

        return {
            openId,
            config,
            wecomFrom
        };
    } catch (error) {
        console.error('解析用户信息失败:', error);
        return null;
    }
}

// 主路由：处理企微消息拉取
app.get('/', async (req, res) => {
    try {
        const { seq } = req.query;
        let targetSeq = seq ? parseInt(seq) : await getLastSeq();

        console.log('开始处理企微消息，seq:', targetSeq);

        // 拉取企微消息
        const result = await getWecomMessages(CORPID, WECOM_CORP_SECRET, targetSeq);
        console.log(`获取到 ${result.data.length} 条消息，last_seq: ${result.last_seq}`);

        // 解析和过滤消息
        const filteredMessages = parseAndFilterMessages(result.data);
        console.log(`过滤后消息数量: ${filteredMessages.length}`);

        // 分类消息
        const { textMessages, specialMessages } = categorizeMessages(filteredMessages);
        console.log(`文本消息: ${textMessages.length}, 特殊消息: ${specialMessages.length}`);

        let processedCount = 0;

        // 处理文本消息
        for (const msg of textMessages) {
            const success = await processMessage(msg, 'text');
            if (success) processedCount++;
        }

        // 处理特殊消息（链接等）
        for (const msg of specialMessages) {
            const success = await processMessage(msg, msg.msgtype);
            if (success) processedCount++;
        }

        // 保存新的seq
        await saveLastSeq(result.last_seq);

        res.json({
            success: true,
            last_seq: result.last_seq,
            total_messages: result.data.length,
            filtered_messages: filteredMessages.length,
            processed_count: processedCount
        });

    } catch (error) {
        console.error('处理企微消息失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 健康检查
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// 启动服务器
const port = process.env.PORT || 8000;

async function startServer() {
    await initCosmosDB();

    app.listen(port, () => {
        console.log(`企微Obsidian同步服务启动成功，端口: ${port}`);
        console.log(`健康检查: http://localhost:${port}/health`);
    });
}

startServer().catch(error => {
    console.error('服务启动失败:', error);
    process.exit(1);
});