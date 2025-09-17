# GitHub发布准备说明

## 发布准备清单

### 1. GitHub仓库设置
请使用GitHub账号 `frank@onenotes.app` 创建以下仓库：
- 仓库名称: `obsidian-notehelper`
- 描述: `笔记同步助手 - 用于同步笔记和文章到 Obsidian 的插件`
- 设置为公开仓库

### 2. 上传文件
将 `plug-submit` 文件夹中的所有文件上传到GitHub仓库根目录：
- `main.js` - 插件主文件
- `manifest.json` - 插件配置文件
- `versions.json` - 版本兼容性文件
- `styles.css` - 样式文件
- `README.md` - 项目说明文档
- `LICENSE` - MIT许可证文件

### 3. 创建GitHub Release
1. 在GitHub仓库中点击 "Releases"
2. 点击 "Create a new release"
3. 设置标签版本: `1.10.4` (与manifest.json中的版本一致)
4. 发布标题: `v1.10.4 - 笔记同步助手正式版`
5. 发布说明:

```markdown
## 🎉 笔记同步助手 v1.10.4

### ✨ 主要功能
- 支持企业微信消息同步到Obsidian
- 智能内容解析和格式化
- 自动标签和分类管理
- 实时同步和增量更新

### 🔧 技术特性
- 兼容 Obsidian 0.15.0+
- 优化的性能和稳定性
- 完整的错误处理机制

### 📦 安装方法
1. 下载 main.js, manifest.json 和 styles.css
2. 将文件放入 {VaultFolder}/.obsidian/plugins/notehelper/
3. 重启Obsidian并启用插件

### 🐛 问题反馈
如有问题请在 [Issues](https://github.com/notehelper/obsidian-notehelper/issues) 中反馈
```

6. 上传发布文件: 将 `main.js`, `manifest.json`, `styles.css` 作为release附件上传

### 4. 提交到Obsidian官方插件库
在 GitHub 仓库 `obsidianmd/obsidian-releases` 中提交 Pull Request，修改 `community-plugins.json` 文件，添加以下内容：

```json
{
  "id": "notehelper",
  "name": "笔记同步助手",
  "author": "NoteHelper Team",
  "description": "笔记同步助手 - 用于同步笔记和文章到 Obsidian 的插件",
  "repo": "notehelper/obsidian-notehelper"
}
```

### 5. 仓库要求确认
- ✅ manifest.json 包含正确的插件信息
- ✅ versions.json 包含版本兼容性信息
- ✅ README.md 包含详细的使用说明
- ✅ LICENSE 文件存在 (MIT许可证)
- ✅ main.js 是构建好的插件文件
- ✅ styles.css 包含插件样式
- ✅ GitHub Release 标签与manifest.json版本一致

### 6. 下一步行动
1. 登录 frank@onenotes.app GitHub账号
2. 按照上述步骤创建仓库和发布
3. 等待Obsidian团队审核Pull Request

### 注意事项
- 确保所有文件都已正确上传
- 发布后版本号不可修改
- 遵循Obsidian开发者政策
- 保持插件描述简洁明了