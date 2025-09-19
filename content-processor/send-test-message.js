const { ServiceBusClient } = require('@azure/service-bus');

async function sendTestMessage() {
    const connectionString = process.env.AZ_BUS_CP_CS;

    if (!connectionString) {
        console.error('AZ_BUS_CP_CS environment variable is required');
        process.exit(1);
    }

    const serviceBusClient = new ServiceBusClient(connectionString);
    const sender = serviceBusClient.createSender('link-normal');

    try {
        const testMessage = {
            from: 'o56E762Lh_yloQuLk1Gfim3Xksxs', // 使用测试中验证过的openId
            msgtype: 'link',
            link: {
                link_url: 'https://example.com/test-article',
                title: '测试文章标题',
                description: '这是一个测试文章的描述'
            },
            config: {
                config: {
                    raw_html: false
                }
            }
        };

        console.log('Sending test message to Service Bus...');
        console.log('Message content:', JSON.stringify(testMessage, null, 2));

        await sender.sendMessages({
            body: JSON.stringify(testMessage),
            messageId: 'test-' + Date.now()
        });

        console.log('Test message sent successfully to link-normal queue');

    } catch (error) {
        console.error('Error sending test message:', error);
    } finally {
        await sender.close();
        await serviceBusClient.close();
    }
}

sendTestMessage();