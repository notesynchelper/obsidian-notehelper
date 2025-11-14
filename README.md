# obsidian-notehelper

An Obsidian plugin for syncing notes and articles to Obsidian.

## Features

- Sync notes and articles to Obsidian
- Support multiple content sources
- Automated content management
- Customizable sync settings

## Installation

### From Community Plugins (Recommended)

1. Open Obsidian Settings
2. Navigate to "Community plugins"
3. Search for "obsidian-notehelper"
4. Click Install

### Manual Installation

1. Download the latest `main.js`, `manifest.json`, and `styles.css` from [Releases](https://github.com/notesynchelper/obsidian-notehelper/releases)
2. Copy these files to your vault's `.obsidian/plugins/obsidian-notehelper/` directory
3. Reload Obsidian
4. Enable "obsidian-notehelper" in Settings

## Usage

1. Configure plugin settings in Obsidian Settings
2. Click the toolbar icon or use the command palette to trigger sync
3. The plugin will automatically sync content to your vault

## Development

This plugin is developed using TypeScript.

### Prerequisites

- Node.js 18.x or higher
- npm or yarn

### Local Development

1. Clone the repository:
```bash
git clone https://github.com/notesynchelper/obsidian-notehelper.git
cd obsidian-notehelper
```

2. Install dependencies:
```bash
npm install
```

3. Development mode (auto-rebuild):
```bash
npm run dev
```

4. Build for production:
```bash
npm run build
```

### Project Structure

```
src/
  ├── main.ts              # Plugin entry point
  ├── settings/            # Settings related
  ├── api.ts              # API interface
  └── ...                 # Other modules
```

### Code Quality

Run linter:
```bash
npm run lint
```

Auto-fix issues:
```bash
npm run lint:fix
```

Format code:
```bash
npm run format
```

### Testing

Run tests:
```bash
npm test
```

Watch mode:
```bash
npm run test:watch
```

## Release Process

This project uses GitHub Actions for automated builds and releases.

### Publishing a New Version

1. Update version number in `manifest.json`
2. Update `versions.json` (if you need to specify minimum Obsidian version)
3. Commit changes:
```bash
git add manifest.json versions.json
git commit -m "chore: bump version to x.x.x"
```

4. Create and push tag:
```bash
git tag x.x.x
git push origin x.x.x
```

5. GitHub Actions will automatically:
   - Run tests
   - Build the plugin
   - Create a GitHub Release
   - Upload build artifacts (main.js, manifest.json, styles.css)

### Important Notes

- **Do NOT** commit `main.js` to the repository (it's a build artifact)
- Version numbers must follow Semantic Versioning
- Ensure all tests pass before releasing

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## Credits

This plugin is inspired by and builds upon:
- [Obsidian Omnivore](https://github.com/omnivore-app/obsidian-omnivore) by Omnivore
- Original work by [hkgnp](https://github.com/hkgnp)

We're grateful for their contributions to the open source community.

## License

[MIT](LICENSE)

## Contact

For questions or suggestions:

- Submit a [GitHub Issue](https://github.com/notesynchelper/obsidian-notehelper/issues)
- Email: frank@onenotes.app

---

# 笔记同步助手

一个用于将笔记和文章同步到 Obsidian 的插件。

## 功能特性

- 同步笔记和文章到 Obsidian
- 支持多种内容来源
- 自动化内容管理
- 自定义同步设置

## 安装

### 从社区插件安装（推荐）

1. 打开 Obsidian 设置
2. 进入"社区插件"
3. 搜索"笔记同步助手"
4. 点击安装

### 手动安装

1. 从 [Releases](https://github.com/notesynchelper/obsidian-notehelper/releases) 下载最新版本的 `main.js`、`manifest.json` 和 `styles.css`
2. 将这些文件复制到你的 vault 的 `.obsidian/plugins/obsidian-notehelper/` 目录下
3. 重新加载 Obsidian
4. 在设置中启用"笔记同步助手"插件

## 使用说明

1. 在 Obsidian 设置中配置插件参数
2. 点击工具栏图标或使用命令面板触发同步
3. 插件会自动将内容同步到你的 vault

## 开发

本插件使用 TypeScript 开发。

### 前置要求

- Node.js 18.x 或更高版本
- npm 或 yarn

### 本地开发

1. 克隆仓库：
```bash
git clone https://github.com/notesynchelper/obsidian-notehelper.git
cd obsidian-notehelper
```

2. 安装依赖：
```bash
npm install
```

3. 开发模式（自动重新构建）：
```bash
npm run dev
```

4. 构建生产版本：
```bash
npm run build
```

### 项目结构

```
src/
  ├── main.ts              # 插件入口
  ├── settings/            # 设置相关
  ├── api.ts              # API 接口
  └── ...                 # 其他模块
```

### 代码规范

运行代码检查：
```bash
npm run lint
```

自动修复代码问题：
```bash
npm run lint:fix
```

格式化代码：
```bash
npm run format
```

### 测试

运行测试：
```bash
npm test
```

观察模式运行测试：
```bash
npm run test:watch
```

## 发布流程

本项目使用 GitHub Actions 自动构建和发布。

### 发布新版本

1. 更新 `manifest.json` 中的版本号
2. 更新 `versions.json`（如果需要指定最低 Obsidian 版本）
3. 提交更改：
```bash
git add manifest.json versions.json
git commit -m "chore: bump version to x.x.x"
```

4. 创建并推送标签：
```bash
git tag x.x.x
git push origin x.x.x
```

5. GitHub Actions 会自动：
   - 运行测试
   - 构建插件
   - 创建 GitHub Release
   - 上传构建产物（main.js、manifest.json、styles.css）

### 注意事项

- **不要**将 `main.js` 提交到仓库（这是构建产物）
- 版本号需要遵循语义化版本规范（Semantic Versioning）
- 发布前确保所有测试通过

## 贡献

欢迎提交 Pull Request。对于重大变更，请先开 issue 讨论您想要改变的内容。

## 致谢

本插件的开发受到以下项目的启发并基于其构建：
- [Obsidian Omnivore](https://github.com/omnivore-app/obsidian-omnivore) by Omnivore
- 原始项目作者 [hkgnp](https://github.com/hkgnp)

感谢他们对开源社区的贡献。

## 许可证

[MIT](LICENSE)

## 联系方式

如有问题或建议：

- 提交 [GitHub Issue](https://github.com/notesynchelper/obsidian-notehelper/issues)
- 发送邮件至：frank@onenotes.app
