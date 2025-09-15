# 部署说明

## 步骤1: 认证Cloudflare

1. 创建Cloudflare API Token:
   - 访问 https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
   - 创建一个自定义token，权限包括 "Cloudflare Workers:Edit"

2. 设置环境变量或登录:
   ```bash
   # 方法1: 设置环境变量
   export CLOUDFLARE_API_TOKEN=your_token_here

   # 方法2: 交互式登录
   cd cf
   npx wrangler login
   ```

## 步骤2: 部署Worker

```bash
cd cf
npx wrangler deploy
```

## 步骤3: 配置自定义域名

1. 在Cloudflare控制台中添加域名 `obsidian.notebooksyncer.com`
2. 配置DNS记录指向Worker
3. 或者在wrangler.toml中配置路由

## 步骤4: 测试

```bash
cd ../server
node test-worker-gateway.js
```

## 临时测试URL

部署后，Worker会获得一个临时URL类似：
`https://obsidian-gateway.your-subdomain.workers.dev`

可以先用这个URL测试功能是否正常。