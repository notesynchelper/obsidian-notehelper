# Obsidian Gateway Cloudflare Worker

This Cloudflare Worker acts as a simple gateway to protect the backend server address for the Obsidian notes sync service.

## Features

- Acts as a proxy between clients and the backend server
- Requires API key authentication (Authorization header or x-api-key header)
- Handles CORS headers for web browser compatibility
- Routes all requests to `http://140.143.189.226:3002`

## Setup

1. Install Wrangler CLI:
   ```bash
   npm install -g wrangler
   ```

2. Login to Cloudflare:
   ```bash
   wrangler login
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

## Development

Run the worker locally:
```bash
npm run dev
```

## Deployment

Deploy to Cloudflare:
```bash
npm run deploy
```

## Custom Domain Setup

To set up the custom domain `obsidian.notebooksyncer.com`:

1. Add the domain to your Cloudflare account
2. Update the routes in `wrangler.toml` if needed
3. Configure DNS records to point to your worker

## API Usage

All requests must include an API key in one of these headers:
- `Authorization: Bearer <your-api-key>`
- `x-api-key: <your-api-key>`

Example request:
```bash
curl -H "Authorization: Bearer your-api-key" https://obsidian.notebooksyncer.com/health
```

## Error Responses

- `401`: Missing API key
- `502`: Backend server error