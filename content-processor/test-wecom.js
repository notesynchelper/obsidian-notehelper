const axios = require('axios');

async function testWecomNotification() {
    const openId = 'o56E762Lh_yloQuLk1Gfim3Xksxs'; // 测试用的openId
    const title = '笔记已同步';
    const content = '可在Obsidian中刷新';

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

        console.log('发送请求数据:', JSON.stringify(pushData, null, 2));

        const response = await axios.post('http://lzynodered2.azurewebsites.net/lzyapi/mpmessage', pushData, {
            timeout: 5000
        });

        console.log('请求成功!');
        console.log('状态码:', response.status);
        console.log('响应头:', response.headers);
        console.log('响应数据:', JSON.stringify(response.data, null, 2));

    } catch (error) {
        console.error('请求失败!');
        console.error('错误类型:', error.constructor.name);
        console.error('错误信息:', error.message);

        if (error.response) {
            console.error('响应状态码:', error.response.status);
            console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.error('没有收到响应，请求对象:', error.request);
        }
    }
}

console.log('开始测试企微通知接口...');
testWecomNotification();