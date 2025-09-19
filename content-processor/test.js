const { ServiceBusClient } = require('@azure/service-bus');

async function sendTestMessage() {
    const connectionString = process.env.AZ_BUS_CP_CS;

    if (!connectionString) {
        console.error('Please set AZ_BUS_CP_CS environment variable');
        process.exit(1);
    }

    const serviceBusClient = new ServiceBusClient(connectionString);
    const sender = serviceBusClient.createSender('link-normal');

    // 构造测试消息 - 使用提供的微信文章URL
    const testMessage = {
        msgid: "test_message_" + Date.now(),
        action: "send",
        from: "o56E762Lh_yloQuLk1Gfim3Xksxs", // 测试用户openid
        tolist: ["0000726"],
        roomid: "",
        msgtime: Date.now(),
        msgtype: "link",
        link: {
            title: "微信公众号文章测试",
            description: "测试微信公众号文章内容提取",
            link_url: "https://mp.weixin.qq.com/s?__biz=MzkyNjY0MzU0OA==&mid=2247486018&idx=1&sn=f8a3272d3cea9880c1949e9cd3493346&chksm=c31545040d8758e207c964f6b399c3b3346bb2e5b7b28b0fc0b1d1bdc416c66c9b288b3143f4&mpshare=1&scene=1&srcid=0916Ni2gLkDLPSiOUBFOljvZ&sharer_shareinfo=1188a73be9c5bf6c3c424830cfd47840&sharer_shareinfo_first=1188a73be9c5bf6c3c424830cfd47840#rd",
            image_url: "https://picsum.photos/800/400"
        },
        config: {
            config: {
                raw_html: false // 测试清理模式
            }
        }
    };

    try {
        console.log('Sending test message to queue...');
        console.log('Message content:', JSON.stringify(testMessage, null, 2));

        await sender.sendMessages({
            body: JSON.stringify(testMessage),
            contentType: 'application/json'
        });

        console.log('Test message sent successfully!');
        console.log('Message ID:', testMessage.msgid);
        console.log('User OpenID:', testMessage.from);
        console.log('Link URL:', testMessage.link.link_url);
        console.log('Clean option: 0 (will clean HTML)');

    } catch (error) {
        console.error('Error sending test message:', error);
    } finally {
        await sender.close();
        await serviceBusClient.close();
    }
}

// 发送更多测试消息到不同队列
async function sendMultipleTestMessages() {
    const connectionString = process.env.AZ_BUS_CP_CS;

    if (!connectionString) {
        console.error('Please set AZ_BUS_CP_CS environment variable');
        process.exit(1);
    }

    const serviceBusClient = new ServiceBusClient(connectionString);

    const testMessages = [
        {
            queue: 'link-vip',
            message: {
                msgid: "vip_test_" + Date.now(),
                action: "send",
                from: "o56E762Lh_yloQuLk1Gfim3Xksxs",
                tolist: ["0000726"],
                roomid: "",
                msgtime: Date.now(),
                msgtype: "link",
                link: {
                    title: "VIP测试 - 微信文章",
                    description: "高优先级队列测试微信文章",
                    link_url: "https://mp.weixin.qq.com/s?__biz=MzkyNjY0MzU0OA==&mid=2247486018&idx=1&sn=f8a3272d3cea9880c1949e9cd3493346&chksm=c31545040d8758e207c964f6b399c3b3346bb2e5b7b28b0fc0b1d1bdc416c66c9b288b3143f4&mpshare=1&scene=1&srcid=0916Ni2gLkDLPSiOUBFOljvZ&sharer_shareinfo=1188a73be9c5bf6c3c424830cfd47840&sharer_shareinfo_first=1188a73be9c5bf6c3c424830cfd47840#rd",
                    image_url: "https://picsum.photos/800/400"
                },
                config: {
                    config: {
                        raw_html: true // 测试不清理模式
                    }
                }
            }
        },
        {
            queue: 'link-normal',
            message: {
                msgid: "normal_test_" + Date.now(),
                action: "send",
                from: "o56E762Lh_yloQuLk1Gfim3Xksxs",
                tolist: ["0000726"],
                roomid: "",
                msgtime: Date.now(),
                msgtype: "link",
                link: {
                    title: "普通测试文章",
                    description: "普通队列测试",
                    link_url: "https://nodejs.org/en/docs/",
                    image_url: "https://picsum.photos/800/400"
                },
                config: {
                    config: {
                        raw_html: false // 测试清理模式
                    }
                }
            }
        },
        {
            queue: 'link-trial',
            message: {
                msgid: "trial_test_" + Date.now(),
                action: "send",
                from: "o56E762Lh_yloQuLk1Gfim3Xksxs",
                tolist: ["0000726"],
                roomid: "",
                msgtime: Date.now(),
                msgtype: "link",
                link: {
                    title: "试用测试 - GitHub",
                    description: "试用队列测试GitHub文章",
                    link_url: "https://github.com/microsoft/vscode",
                    image_url: "https://picsum.photos/800/400"
                }
                // 没有config，默认clean_option为0
            }
        }
    ];

    for (const testCase of testMessages) {
        try {
            const sender = serviceBusClient.createSender(testCase.queue);

            console.log(`\nSending message to ${testCase.queue} queue...`);
            console.log('Message:', JSON.stringify(testCase.message, null, 2));

            await sender.sendMessages({
                body: JSON.stringify(testCase.message),
                contentType: 'application/json'
            });

            console.log(`✓ Message sent to ${testCase.queue} successfully!`);
            await sender.close();

            // 稍微延迟，避免同时发送
            await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
            console.error(`Error sending message to ${testCase.queue}:`, error);
        }
    }

    await serviceBusClient.close();
    console.log('\nAll test messages sent!');
}

// 根据命令行参数决定发送哪种测试
const args = process.argv.slice(2);
if (args.includes('--multiple')) {
    sendMultipleTestMessages();
} else {
    sendTestMessage();
}

console.log('\nTest script usage:');
console.log('node test.js              # Send single test message to normal queue');
console.log('node test.js --multiple   # Send test messages to all queues');
console.log('\nMake sure to set AZ_BUS_CP_CS environment variable before running.');