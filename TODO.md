## wecomdocker 部分

参考content-processor\MESSAGE_FORMAT.md 修改链接类型消息的处理逻辑，链接类型的消息需要发到消息队列，由其它服务处理

## 插件部分

完成同步后的显示改为中文

插件没有能将article 表中 content 字段的内容显示在笔记的正文，排查是服务端（项目在server文件夹）接口没有返回这部分内容还是因为插件配置的页面article template有问题；现在没有highlight的内容，主要就是标题、原url、正文三个字段，修改article template
