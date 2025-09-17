# 项目说明

这个项目是一个obsidian 插件及服务端项目，插件提供的是将数据加载到obsidian 里的功能

# 环境情况

电脑是win 11，Bash 需要是Win 的命令。比如，在bash环境中复制应该使用cp命令，路径是cd /c/Users/laizeyang/OneDrive/OWN/笔记同步助手/gate/obsidian/

杀进程是 Bash(taskkill //PID 20544 //F)

obsidian 插件目录是 C:\Users\laizeyang\Docum/ents\Obsidian Vault\.obsidian\plugins\my-plugin，直接使用这个目录将构建好的文件放里面，不要建文件夹

插件文件夹中的数据配置每次测试时需要删除 C:\Users\laizeyang\Documents\Obsidian Vault\.obsidian\plugins\data.json

obsidian 安装位置是C:\Users\laizeyang\AppData\Local\Programs\Obsidian\Obsidian.exe

调试podman 命令参考 podman exec wecom-sync ls -la .

# 修改代码

修改代码前需要先检查目录是否已经git commit 如果没有需要先commit 再进行修改

# 本地测试

本地测试需要将构建好的插件复制到obsidian目录

然后启动后端服务

然后启动客户端，如果客户端已经打开就重启

## wecomdocker 文件夹中项目测试

完成代码修改后，需要构建容器并启动

构建代码是 podman build -t wecom-obsidian .
启动命令是 podman run -d -p 8000:8000 --env WECOM_CORP_SECRET --env COSMOS_KEY --name wecom-sync wecom-obsidian

启动前如果上一次测试的容器仍在运行则删除正在运行的测试容器后再启动新的

然后使用curl 请求 http://localhost:8000/?seq=218924

收到返回后获取podman 中该容器的日志进行查看验证

# 线上部署

cf 文件夹中的项目只写worker js 中的代码，不要向cf 进行部署
