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

// 根据unionid查询openid
async function queryOpenIdByUnionId(unionId) {
    if (!container) return null;

    try {
        const querySpec = {
            query: `SELECT c.id FROM c WHERE c.pt = 'oid_uid' AND c.unionid = @unionId AND c.app = 'bijitongbuzhushou_mp'`,
            parameters: [{ name: '@unionId', value: unionId }]
        };

        const { resources } = await container.items.query(querySpec).fetchAll();
        return resources.length > 0 ? resources[0].id : null;
    } catch (error) {
        console.error('根据unionid查询openid失败:', error);
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

// 注册用户到线上服务
async function registerUserToOnlineService(openId, userConfig) {
    try {
        const userData = {
            username: openId,
            email: `${openId}@wecom.example.com`
        };

        // 构造请求头，使用用户配置中的API密钥进行认证
        const headers = {
            'Content-Type': 'application/json'
        };

        // 如果用户配置中有API密钥，用它来认证注册请求
        if (userConfig && userConfig.ob_api_key) {
            headers['x-api-key'] = userConfig.ob_api_key;
        }

        const response = await axios.post('https://obsidian.notebooksyncer.com/api/users', userData, {
            headers,
            timeout: 30000
        });

        console.log('用户注册成功:', openId, response.data);
        return response.data;
    } catch (error) {
        if (error.response && error.response.status === 409) {
            console.log('用户已存在:', openId);
            return null; // 用户已存在，不算错误
        }
        console.error('用户注册失败:', error);
        throw error;
    }
}

// 向线上服务写入数据
async function writeToOnlineService(articleData, userConfig, openId) {
    // 从用户配置中获取API key，如果没有则使用openId作为默认API key
    const apiKey = (userConfig && userConfig.ob_api_key) ? userConfig.ob_api_key : openId;

    try {
        // 构造请求头，包含用户的API key
        const headers = {
            'Content-Type': 'application/json'
        };

        if (apiKey) {
            headers['x-api-key'] = apiKey;
        }

        const response = await axios.post('https://obsidian.notebooksyncer.com/api/articles', articleData, {
            headers,
            timeout: 30000
        });

        return response.data;
    } catch (error) {
        // 如果是401错误（API密钥无效），尝试注册用户
        if (error.response && error.response.status === 401 && openId) {
            console.log('API密钥无效，尝试注册用户:', openId);
            try {
                await registerUserToOnlineService(openId, userConfig);
                // 注册成功后重试写入
                const retryHeaders = {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey // 使用原来的apiKey重试
                };

                const retryResponse = await axios.post('https://obsidian.notebooksyncer.com/api/articles', articleData, {
                    headers: retryHeaders,
                    timeout: 30000
                });

                console.log('用户注册后重试写入成功');
                return retryResponse.data;
            } catch (registerError) {
                console.error('注册用户后重试写入失败:', registerError);
                throw registerError;
            }
        }

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
        const writeResult = await writeToOnlineService(articleData, userInfo.config, userInfo.openId);
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

            // 3. 通过unionid查询cosmosdb获取对应的openid
            const unionId = wecomUserInfo.external_contact.union_id;
            if (unionId) {
                openId = await queryOpenIdByUnionId(unionId);
            }

            // 如果没有找到对应的openid，使用unionid作为fallback
            if (!openId) {
                openId = unionId || wecomFrom;
            }

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

        let totalMessages = 0;
        let totalFiltered = 0;
        let totalProcessed = 0;
        let currentSeq = targetSeq;
        let finalSeq = currentSeq;
        let loopCount = 0;
        const maxLoops = 50; // 防止无限循环，最多循环50次

        // 循环拉取消息直到没有更多消息
        while (loopCount < maxLoops) {
            loopCount++;
            console.log(`第 ${loopCount} 次拉取，seq: ${currentSeq}`);

            // 拉取企微消息
            const result = await getWecomMessages(CORPID, WECOM_CORP_SECRET, currentSeq);
            console.log(`获取到 ${result.data.length} 条消息，last_seq: ${result.last_seq}`);

            // 如果没有新消息或者seq没有变化，停止循环
            if (result.data.length === 0 || result.last_seq === currentSeq) {
                console.log('没有更多消息，停止拉取');
                break;
            }

            // 解析和过滤消息
            const filteredMessages = parseAndFilterMessages(result.data);
            console.log(`过滤后消息数量: ${filteredMessages.length}`);

            // 分类消息
            const { textMessages, processedMessages } = categorizeMessages(filteredMessages);
            console.log(`文本消息: ${textMessages.length}, 处理消息: ${processedMessages.length}`);

            let processedCount = 0;

            // 处理文本消息
            for (const msg of textMessages) {
                const success = await processMessage(msg, 'text');
                if (success) processedCount++;
            }

            // 累计统计
            totalMessages += result.data.length;
            totalFiltered += filteredMessages.length;
            totalProcessed += processedCount;

            // 更新seq为下一次拉取
            currentSeq = result.last_seq;
            finalSeq = result.last_seq;

            console.log(`本轮处理完成，处理消息: ${processedCount}, 累计处理: ${totalProcessed}`);

            // 如果返回的消息数量小于最大数量，说明已经拉取完毕
            if (result.data.length < 50) { // 50是maxResults的默认值
                console.log('消息数量小于限制，已拉取完毕');
                break;
            }
        }

        // 保存最终的seq
        await saveLastSeq(finalSeq);

        console.log(`拉取完成，共 ${loopCount} 轮，总消息: ${totalMessages}, 过滤: ${totalFiltered}, 处理: ${totalProcessed}`);

        res.json({
            success: true,
            last_seq: finalSeq,
            loops: loopCount,
            total_messages: totalMessages,
            filtered_messages: totalFiltered,
            processed_count: totalProcessed
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