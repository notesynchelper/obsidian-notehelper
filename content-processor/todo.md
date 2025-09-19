# 项目说明

这个文件夹中存放的是内容提取和处理的，项目用nodejs 后续会打包镜像

使用的azure service bus，connection string 存放在环境变量 AZ_BUS_CP_CS 中，队列namespace 是 contentprocess，下面有四个队列

* link-vip 高优队列，当这个队列里有消息时优先消费这里的消息，同时有一个兜底策略，连续消费10次高优队列后，需要消费一次link-trial 队列
* link-normal 、和link-trial 队列，两个队列消费优先级相同，可以轮询消费
* link-dlq 队列，内容提取出现问题的消息放这里

# 工作流程

* 从service bus 中获取消息
* 核实消息是否包含用户openid、用户config 信息和消息信息
  * 以下是link消息格式示例 {"msgid":"11788441727514772650_1603875624","action":"send","from":"kenshin","tolist":["0000726"],"roomid":"","msgtime":1603875624476,"msgtype":"link","link":{"title":"邀请你加入群聊","description":"技术支持群，进入可查看详情","link_url":"https://work.weixin.qq.com/wework_admin/external_room/join/exceed?vcode=xxx","image_url":"https://wework.qpic.cn/wwpic/xxx/0"}}
* 参考以下nodered 节点配置请求解析节点解析url，并判断是否成功解析，再向后端发出请求，后端接口文档是 server\API_DOCS.md 地址是 https://obsidian.notebooksyncer.com/api/users  https://obsidian.notebooksyncer.com/api/articles
  * 如果不成功，就将链接和标题按照最小可读的方式组装数据发到后端，其中文章标题是消息里的标题，如果没有就叫“微信链接”；文章正文放置消息中的标题和完整的链接
  * 如果成功，则将返回的标题、html 正文、文章原始链接组装数据，文章标题是接口返回的标题，正文组装顺序是：原文链接放在最上面，然后是正文

# 本地测试

* 完成项目后构造一个发送数据进行测试，测试用户openid是 o56E762Lh_yloQuLk1Gfim3Xksxs api_key 是 o56E762Lh_yloQuLk1Gfim3Xksxs
