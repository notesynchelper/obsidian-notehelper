const ContentExtractor = require('./content-extractor');

// 测试 HTML 到 Markdown 转换
function testHtmlToMarkdown() {
    const extractor = new ContentExtractor();

    // 测试案例
    const testCases = [
        {
            name: 'Basic HTML',
            html: '<h1>标题</h1><p>这是一个<strong>加粗</strong>的文本，还有<em>斜体</em>。</p>',
            expected: '# 标题\n\n这是一个**加粗**的文本，还有*斜体*。'
        },
        {
            name: 'HTML with links',
            html: '<p>这是一个<a href="https://example.com">链接</a>的示例。</p>',
            expected: '这是一个[链接](https://example.com)的示例。'
        },
        {
            name: 'HTML with list',
            html: '<ul><li>项目1</li><li>项目2</li><li>项目3</li></ul>',
            expected: '- 项目1\n- 项目2\n- 项目3'
        },
        {
            name: 'Complex HTML',
            html: '<div><h2>子标题</h2><p>段落内容包含<code>代码</code>和<strong>加粗文本</strong>。</p><blockquote>这是一个引用</blockquote></div>',
            expected: '## 子标题\n\n段落内容包含`代码`和**加粗文本**。\n\n> 这是一个引用'
        }
    ];

    console.log('开始测试 HTML 到 Markdown 转换功能...\n');

    testCases.forEach((testCase, index) => {
        console.log(`测试 ${index + 1}: ${testCase.name}`);
        console.log('输入 HTML:', testCase.html);

        const result = extractor.convertHtmlToMarkdown(testCase.html);
        console.log('输出 Markdown:', result);
        console.log('---\n');
    });

    // 测试空值和异常情况
    console.log('测试边界情况:');
    console.log('空字符串:', extractor.convertHtmlToMarkdown(''));
    console.log('null:', extractor.convertHtmlToMarkdown(null));
    console.log('undefined:', extractor.convertHtmlToMarkdown(undefined));
    console.log('纯文本:', extractor.convertHtmlToMarkdown('这是纯文本'));
}

if (require.main === module) {
    testHtmlToMarkdown();
}

module.exports = { testHtmlToMarkdown };