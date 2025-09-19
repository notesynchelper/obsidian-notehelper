# 项目说明

* 这个项目是一个obsidian 插件及服务端项目，插件提供的是将数据加载到obsidian 里的功能
* 以最小化单元代码做变更

## 子项目情况

- 文件夹 obsidian-plug 是ob 插件代码的位置，禁止向github 推送
- 文件夹plug-submit 是要公开ob 插件，要发布的插件要放到这个目录
- 文件夹obsidian-releases 是向ob 官方提交社区插件
- 文件夹 server 是ob 插件链接的服务端的位置，禁止向github 推送
- 文件夹wecomdocker 是拉取消息并存到数据库服务的位置，禁止向github 推送
- 文件夹content-processor 是读取消息队列并进行内容提取功能的容器项目

# 环境情况

电脑是win 11，Bash 需要是Win 的命令。比如，在bash环境中复制应该使用cp命令，路径是cd /c/Users/laizeyang/OneDrive/OWN/笔记同步助手/gate/obsidian/

杀进程是 Bash(taskkill //PID 20544 //F)

调试podman 命令参考 podman exec wecom-sync ls -la .

本地构建容器等等都使用podman，镜像推送是推送到dockerhub

# 修改代码

修改代码前需要先检查目录是否已经git commit 如果没有需要先commit 再进行修改

# 本地测试

## ob插件

* 本地测试需要将构建好的插件复制到obsidian目录
* 插件默认是对接线上后端服务进行测试，除非是正在开发后端服务拉起了本地的后端服务进行测试的时候插件需要改为本地地址
* obsidian 插件目录是 C:\Users\laizeyang\Docum/ents\Obsidian Vault.obsidian\plugins\my-plugin，直接使用这个目录将构建好的文件放里面，不要建文件夹

- 插件文件夹中的数据配置每次测试时需要删除 C:\Users\laizeyang\Documents\Obsidian Vault\.obsidian\plugins\data.json，命令是 rm -f "/c/Users/laizeyang/Documents/Obsidian Vault/.obsidian/plugins/my-plugin/data.json"
- obsidian 安装位置是C:\Users\laizeyang\AppData\Local\Programs\Obsidian\Obsidian.exe
- 然后启动客户端，如果客户端已经打开就重启

## wecomdocker 文件夹中项目测试

完成代码修改后，需要构建容器并启动

构建代码是 podman build -t wecom-obsidian .
启动命令是 podman run -d -p 8000:8000 --env WECOM_CORP_SECRET --env COSMOS_KEY --name wecom-sync wecom-obsidian

启动前如果上一次测试的容器仍在运行则删除正在运行的测试容器后再启动新的

然后使用curl 请求 http://localhost:8000/?seq=218924

收到返回后获取podman 中该容器的日志进行查看验证

# 线上部署

## Obsidian 插件上线/更新

- 插件上线/更新 需要保持版本号递增
- 更新的插件应该是放在 文件夹plug-submit 下
- 电脑里有github cli ，上线需要用frank@onenotes.app 账号，如果发现不是这个账号需要退出登录并切换
- 我希望保护我自己开发者账号的隐私，不在github 中contributors 显示是lzythebest
- 提交pr 要按照模板进行 https://raw.githubusercontent.com/obsidianmd/obsidian-releases/refs/heads/master/.github/PULL_REQUEST_TEMPLATE/plugin.md
- 项目向官方提交的pr 是https://github.com/obsidianmd/obsidian-releases/pull/7849

## CF

cf 文件夹中的项目只写worker js 中的代码，不要向cf 进行部署
