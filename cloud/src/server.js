import http from 'node:http';
import crypto from 'node:crypto';
import { BrowsallaxCloudBrowser } from './browser.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const VERSION = '0.1.0';
const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const apiKey = String(process.env.BROWSALLAX_CLOUD_API_KEY || '');
if (apiKey.length < 32) throw new Error('BROWSALLAX_CLOUD_API_KEY_MUST_HAVE_AT_LEAST_32_CHARS');
const browser = new BrowsallaxCloudBrowser();

function authorized(req) {
  const supplied = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ''))?.[1] || '';
  const a = Buffer.from(apiKey);
  const b = Buffer.from(supplied);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function response(res, status, data) {
  if (res.writableEnded) return;
  const json = JSON.stringify(data);
  res.writeHead(status, {
    'content-type':'application/json; charset=utf-8',
    'content-length':Buffer.byteLength(json),
    'cache-control':'no-store',
    'x-content-type-options':'nosniff'
  });
  res.end(json);
}

function wrap(fn) {
  return async args => {
    try {
      return { content: [{type:'text', text:JSON.stringify(await fn(args))}] };
    } catch (err) {
      return { isError: true, content: [{type:'text', text:JSON.stringify({error:String(err.code || err.message || 'BROWSER_FAILED')})}] };
    }
  };
}

function makeMcpServer() {
  const server = new McpServer({name:'browsallax-cloud',version:VERSION});
  server.tool('browser_status','Check cloud browser readiness and approved public HTTPS hosts.',{},wrap(() => browser.status()));
  server.tool('browser_open','Open one approved public HTTPS page and return bounded visible text and observed navigation links. Never opens account or private sites.',{url:z.string().min(1).max(2048)},wrap(({url}) => browser.open(url)));
  server.tool('browser_read','Read the currently open public page and obtain fresh observed link IDs.',{},wrap(() => browser.read()));
  server.tool('browser_follow','Navigate to a previously observed link ID on an approved public host. No arbitrary selectors or clicks.',{linkId:z.string().regex(/^L[1-9][0-9]{0,2}$/)},wrap(({linkId}) => browser.follow(linkId)));
  server.tool('browser_scroll','Scroll the currently open page within a bounded range and read the result.',{pixels:z.number().int().min(-2400).max(2400)},wrap(({pixels}) => browser.scroll(pixels)));
  server.tool('browser_reset','Close the ephemeral cloud session and discard its cookies, page, and observed links.',{},wrap(() => browser.reset()));
  return server;
}

const server = http.createServer(async (req,res) => {
  const path = String(req.url || '').split('?')[0];
  if (req.method === 'GET' && path === '/health') {
    return response(res, 200, {ok:true,service:'browsallax-cloud',version:VERSION,authenticated:false});
  }
  if (path !== '/mcp') return response(res,404,{error:'NOT_FOUND'});
  if (!authorized(req)) return response(res,401,{error:'UNAUTHORIZED'});
  if (req.method !== 'POST') {
    res.setHeader('Allow','POST');
    return response(res,405,{error:'METHOD_NOT_ALLOWED'});
  }
  if (Number(req.headers['content-length'] || 0) > 64*1024) return response(res,413,{error:'REQUEST_TOO_LARGE'});
  // Authenticated stateless JSON responses. Browser session is the bounded singleton.
  const mcp = makeMcpServer();
  const transport = new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  try {
    await mcp.connect(transport);
    await transport.handleRequest(req,res);
  } catch (error) {
    console.error('MCP_REQUEST_FAILED',String(error?.message || error).slice(0,200));
    response(res,500,{error:'MCP_REQUEST_FAILED'});
  } finally {
    await mcp.close().catch(()=>{});
  }
});
server.requestTimeout = 60000;
server.listen(PORT,HOST,()=>console.log('Browsallax Cloud '+VERSION+' listening on '+PORT));
process.on('SIGTERM',()=>{server.close();browser.reset().catch(()=>{});});
