# 项目准备

## 接口

### 获取企微token 接口

GET lzynodered2.azurewebsites.net/lzyapi/wecomtoken ，返回{ wecom_token: "xxxxxx"}}

### 推送模板消息接口

POST lzynodered2.azurewebsites.net/lzyapi/mpmessage，请求体

```
{
	open_id = msg.open_id,
	msg.template.url = push_url,
	msg.template.template_id = "UkDxRNqpjp-kywUb4izWMKlY5KQEEcLfXQXZTXPSES0",
	msg.template.data = {
		"phrase15": { "value": "笔记已同步" },
		"thing19": { "value": "可在Ob中刷新" }
}
```

# 项目需求

这是一个实现拉取企微消息并进行处理的服务，这个服务后续使用podman 制作镜像并打包推送到dockerhub，镜像名称叫lzyob

项目有参考代码，开始代码前需要先阅读C:\Users\laizeyang\OneDrive\OWN\笔记同步助手\gate\wecomMessageDocker\makeimagev2 下的文件结构以及所有js代码

项目拉取企微消息及数据时依赖输入"corpid" 为 "ww30e0b84f86588f67" ，这个可以写在代码中；项目所需的"secret" 在环境变量 WECOM_CORP_SECRET 中

每批次处理完将获取到的last seq 存入cosmosdb，以便下次读取处理，cosmos中pt="wecom_ob_info"

# 企微交互

收到http 请求后执行拉取操作，请求只是get 请求，可能带有seq的query，如果没有seq 就从数据库获取最后的拉取位置并进行下一次拉取

本项目处理消息时，仅处理发给obsidian 的消息，对应消息体中"tolist": ["obsidian"],

## 解析消息对应的用户

收到消息后，使用 wecom_from 去cosmos db 查询用户信息，能查到就使用查到的用户名、用户配置进行后续，不能的话就请求企微接口查询用户的信息并与cosmos中的用户名关联

### cosmos db 用户信息部分配置

#### 查询流程

先用wecom_from 查是否已经关联了用户

```
msg.operation = "read";
msg.query = `
SELECT * 
FROM c 
WHERE c.id = '${msg.wecom_from}' 
AND c.pt = 'wecomid_uid'
`
return msg;
```

如果有，就继续；如果没有就用企微接口去查用户的unionid

if (msg.wecom_from != "obsidian"){

    msg.url =`https://qyapi.weixin.qq.com/cgi-bin/externalcontact/get?access_token=${wecom_access_token}&external_userid=${msg.wecom_from}`

    return msg;

}

其中 `wecom_access_token`，从项目准备中提到的企微token 的获取接口获取

拿到unionid 后去查用户的openid

然后将wecom_from 与openid的对应关系写入 wecomid_uid 分区

#### 获取配置

然后用用户的openid 去读取配置

```
msg.operation = "read";
msg.query = `
SELECT * 
FROM c 
WHERE c.id = '${msg.open_id}' 
AND c.pt IN (
    'vip_info', 
    'user_config' )
`
return msg;
```

## 防重复

查询当前消息是否已经在后续流程中处理

```
msg.operation = 'read';
msg.query = `
SELECT c.id
FROM c
WHERE c.pt = 'mini_submit_cache'
AND c.id = '${msg.unique_key}'
`
return msg;
```

如果没有的话就记录已经处理了

```
msg.operation = "upsert";
    msg.item = {
        "id": msg.unique_key,
        "pt": "mini_submit_cache",
        "ttl": 1 * 24 * 60 * 60
    };
```

## 处理消息

第一期需求需要实现处理消息格式为文本、链接的消息，将消息内容组装成计划写入到Obsidian 的内容

各种消息体参见文档 https://developer.work.weixin.qq.com/document/path/91774#%E6%B6%88%E6%81%AF%E6%A0%BC%E5%BC%8F

这里架构上需要做预留，后续会增加图片、文件、链接还要访问提取内容等等耗时的内容，会使用消息队列来进行处理

## 写入psql

向线上服务发送请求进行写入，线上服务接口的文档是 server\API_DOCS.md

完成写入后，需要给用户推送消息通知完成情况，使用项目准备中的推送模板消息接口给用户推送消息
