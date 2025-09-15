// Cloudflare Worker: API Gateway for Obsidian Notes Sync
// This worker acts as a simple gateway to protect the backend server address

const BACKEND_URL = 'http://wecom.bijitongbu.site:8880';

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return handleCORS();
    }

    try {
      // Get the request headers
      const headers = Object.fromEntries(request.headers.entries());

      // Check if request has API key in Authorization header
      const authHeader = headers['authorization'];
      const apiKeyHeader = headers['x-api-key'];

      if (!authHeader && !apiKeyHeader) {
        return new Response(JSON.stringify({
          error: 'API key required',
          message: 'Request must include Authorization header or x-api-key header'
        }), {
          status: 401,
          headers: getCORSHeaders({
            'Content-Type': 'application/json'
          })
        });
      }

      // Parse the request URL
      const url = new URL(request.url);
      const targetUrl = `${BACKEND_URL}${url.pathname}${url.search}`;

      // Create headers for forwarding to backend
      const forwardHeaders = new Headers();

      // Copy important headers from original request
      ['authorization', 'x-api-key', 'content-type', 'accept', 'user-agent'].forEach(headerName => {
        const value = request.headers.get(headerName);
        if (value) {
          forwardHeaders.set(headerName, value);
        }
      });

      // Create the backend request
      const backendRequest = {
        method: request.method,
        headers: forwardHeaders,
      };

      // Add body for non-GET requests
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        backendRequest.body = await request.text();
      }

      // Forward request to backend
      console.log(`Forwarding ${request.method} request to: ${targetUrl}`);
      const backendResponse = await fetch(targetUrl, backendRequest);

      // Get response body
      const responseBody = await backendResponse.text();

      // Create response with CORS headers
      const response = new Response(responseBody, {
        status: backendResponse.status,
        statusText: backendResponse.statusText,
        headers: getCORSHeaders({
          'Content-Type': backendResponse.headers.get('Content-Type') || 'application/json'
        })
      });

      return response;

    } catch (error) {
      console.error('Worker error:', error);

      return new Response(JSON.stringify({
        error: 'Gateway Error',
        message: 'Failed to forward request to backend server',
        details: error.message
      }), {
        status: 502,
        headers: getCORSHeaders({
          'Content-Type': 'application/json'
        })
      });
    }
  }
};

function handleCORS() {
  return new Response(null, {
    status: 200,
    headers: getCORSHeaders()
  });
}

function getCORSHeaders(additionalHeaders = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
    'Access-Control-Max-Age': '86400',
    ...additionalHeaders
  };
}