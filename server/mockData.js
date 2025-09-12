// Mock数据 - 包含10条文章数据
const { v4: uuidv4 } = require('uuid');

// 生成mock数据的工具函数
const generateMockData = () => {
  const articles = [];
  const highlights = [];
  const labels = [
    { id: uuidv4(), name: '技术', color: '#ff6b6b' },
    { id: uuidv4(), name: '前端', color: '#4ecdc4' },
    { id: uuidv4(), name: 'JavaScript', color: '#45b7d1' },
    { id: uuidv4(), name: 'React', color: '#96ceb4' },
    { id: uuidv4(), name: '工具', color: '#ffeaa7' },
    { id: uuidv4(), name: '学习', color: '#dda0dd' }
  ];

  // 生成10条文章数据
  for (let i = 1; i <= 10; i++) {
    const articleId = uuidv4();
    const savedAt = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString();
    const updatedAt = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString();
    
    // 为每篇文章生成1-3个高亮
    const articleHighlights = [];
    const highlightCount = Math.floor(Math.random() * 3) + 1;
    
    for (let j = 0; j < highlightCount; j++) {
      const highlightId = uuidv4();
      const highlight = {
        id: highlightId,
        type: 'HIGHLIGHT',
        quote: `这是文章${i}的高亮内容${j + 1}，包含了重要的技术要点和实践经验。`,
        prefix: `前缀内容${j + 1}`,
        suffix: `后缀内容${j + 1}`,
        patch: null, // 或者提供有效的diff-match-patch格式
        annotation: j === 0 ? `这是对高亮${j + 1}的注释和补充说明` : '',
        createdAt: new Date(Date.now() - Math.random() * 15 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
        highlightPositionPercent: Math.random(),
        shortId: `h${i}${j + 1}`,
        labels: j === 0 ? [labels[Math.floor(Math.random() * labels.length)]] : []
      };
      
      articleHighlights.push(highlight);
      highlights.push(highlight);
    }

    const article = {
      id: articleId,
      title: `技术文章${i}: ${['React Hook最佳实践', 'JavaScript异步编程', 'TypeScript进阶指南', 'Node.js性能优化', 'Vue 3组件设计', 'CSS Grid布局详解', 'GraphQL实践指南', '微前端架构设计', 'Webpack配置优化', 'Docker容器化部署'][i - 1]}`,
      url: `https://example.com/articles/${articleId}`,
      originalArticleUrl: `https://blog-${i}.example.com/post/${articleId}`,
      slug: `article-${i}-slug`,
      author: ['张三', '李四', '王五', 'Alice', 'Bob', 'Carol', 'David', 'Eve', 'Frank', 'Grace'][i - 1],
      savedAt,
      updatedAt,
      publishedAt: new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000).toISOString(),
      archivedAt: i > 7 ? new Date(Date.now() - Math.random() * 3 * 24 * 60 * 60 * 1000).toISOString() : null,
      readAt: i <= 6 ? new Date(Date.now() - Math.random() * 10 * 24 * 60 * 60 * 1000).toISOString() : null,
      pageType: i <= 8 ? 'ARTICLE' : (i === 9 ? 'FILE' : 'BOOK'),
      contentReader: i <= 8 ? 'WEB' : 'FILE',
      description: `这是第${i}篇技术文章的描述，涵盖了现代Web开发中的重要概念和实践方法，适合前端开发者学习和参考。`,
      image: `https://picsum.photos/800/400?random=${i}`,
      wordsCount: Math.floor(Math.random() * 3000) + 1000,
      readingProgressPercent: i <= 6 ? Math.random() : 0,
      isArchived: i > 7,
      highlights: articleHighlights,
      labels: [labels[Math.floor(Math.random() * labels.length)]],
      siteName: `技术博客${i}`,
      content: `# ${['React Hook最佳实践', 'JavaScript异步编程', 'TypeScript进阶指南', 'Node.js性能优化', 'Vue 3组件设计', 'CSS Grid布局详解', 'GraphQL实践指南', '微前端架构设计', 'Webpack配置优化', 'Docker容器化部署'][i - 1]}

这是文章${i}的完整内容，包含了详细的技术说明和代码示例。

## 主要内容

1. **核心概念介绍**
   - 基础理论讲解
   - 实际应用场景

2. **代码示例**
   \`\`\`javascript
   // 示例代码
   function example${i}() {
     console.log('这是示例代码${i}');
     return { success: true, data: 'mock data' };
   }
   \`\`\`

3. **最佳实践**
   - 性能优化建议
   - 常见问题解决方案
   - 经验总结

## 总结

通过本文的学习，读者可以掌握相关技术的核心要点，并在实际项目中应用这些知识。

---

*本文由${['张三', '李四', '王五', 'Alice', 'Bob', 'Carol', 'David', 'Eve', 'Frank', 'Grace'][i - 1]}原创发布*`
    };

    articles.push(article);
  }

  return {
    articles,
    labels,
    totalCount: 10
  };
};

// 导出mock数据
const mockData = generateMockData();

module.exports = {
  mockData,
  generateMockData
};