# 项目需求

* 新建一个cf 文件夹，里面是准备一个cf worker 的代码，这个worker 充当一个简单的网关来保护服务器后端地址
* 新建一个worker，如果遇到的请求包含api key 的header 则将请求发到http://140.143.189.226:3002 进行处理
* 部署这个worker，并设置worker 的地址是 obsidian.notebooksyncer.com
* 使用现有测试远程服务器的代码，改写后测试这个地址能否正常工作
* 将变更进行git commit，记录本次commit内容
