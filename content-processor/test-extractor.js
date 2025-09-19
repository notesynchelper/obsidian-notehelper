const ContentExtractor = require('./content-extractor');

async function testContentExtractor() {
    const extractor = new ContentExtractor();

    console.log('=== Content Extractor Test ===\n');

    // 测试URL
    const testUrl = "https://mp.weixin.qq.com/s?__biz=MzkyNjY0MzU0OA==&mid=2247486018&idx=1&sn=f8a3272d3cea9880c1949e9cd3493346&chksm=c31545040d8758e207c964f6b399c3b3346bb2e5b7b28b0fc0b1d1bdc416c66c9b288b3143f4&mpshare=1&scene=1&srcid=0916Ni2gLkDLPSiOUBFOljvZ&sharer_shareinfo=1188a73be9c5bf6c3c424830cfd47840&sharer_shareinfo_first=1188a73be9c5bf6c3c424830cfd47840#rd";

    // 显示初始状态
    console.log('Initial status:', extractor.getStatus());

    // 测试多次请求以验证限流
    for (let i = 1; i <= 5; i++) {
        console.log(`\n--- Test ${i} ---`);

        const startTime = Date.now();
        const result = await extractor.extractContent(testUrl, "0");
        const endTime = Date.now();

        console.log(`Request ${i} completed in ${endTime - startTime}ms`);
        console.log('Result:', {
            success: result.success,
            spiderName: result.spiderName,
            hasTitle: !!result.title,
            hasContent: !!result.content,
            error: result.error
        });

        console.log('Status after request:', extractor.getStatus());

        // 如果不是最后一次请求，稍等一下
        if (i < 5) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    console.log('\n=== Test Complete ===');
}

// 测试endpoint选择
function testEndpointSelection() {
    const extractor = new ContentExtractor();

    console.log('\n=== Endpoint Selection Test ===');
    console.log('Testing weighted random selection (20 times):\n');

    const counts = {};
    for (let i = 0; i < 20; i++) {
        const endpoint = extractor.selectEndpoint();
        const key = endpoint.spiderName;
        counts[key] = (counts[key] || 0) + 1;
    }

    console.log('Selection counts:');
    Object.entries(counts).forEach(([name, count]) => {
        console.log(`  ${name}: ${count} times`);
    });

    console.log('\nExpected distribution based on weights:');
    console.log('  azure endpoints (30 each): ~12.5% each (2.5 times)');
    console.log('  cf.getcontent (90): ~37.5% (7.5 times)');
}

if (require.main === module) {
    testEndpointSelection();
    testContentExtractor().catch(console.error);
}