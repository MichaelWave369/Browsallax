import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { BrowsallaxCloudBrowser } from '../src/browser.js';
import { allowedHostsFromEnv, validatePublicUrl, normalizeLinkId } from '../src/policy.js';

export const REQUEST_SCHEMA = 'browsallax.github-cloud.request.v1';
export const CLAIM_SCHEMA = 'browsallax.github-cloud.claim.v1';
export const RESPONSE_SCHEMA = 'browsallax.github-cloud.response.v1';

function strictFields(obj, keys) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) ||
      Object.keys(obj).some(key => !keys.includes(key))) {
    throw new Error('INVALID_REQUEST_FIELDS');
  }
}

export function normalizeCloudRequest(input, {id, now=Date.now(), allowedHosts}={}) {
  strictFields(input, ['schema','id','operation','payload','createdAt','expiresAt']);
  if (input.schema !== REQUEST_SCHEMA) throw new Error('INVALID_REQUEST_SCHEMA');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{7,99}$/.test(String(input.id || '')) || input.id !== id) {
    throw new Error('INVALID_REQUEST_ID');
  }
  if (input.operation !== 'browser.research') throw new Error('CLOUD_OPERATION_NOT_ALLOWED');
  strictFields(input.payload, ['url','followLinkId','scrollPixels']);
  const url = validatePublicUrl(input.payload.url, allowedHosts);
  let followLinkId = null;
  if (input.payload.followLinkId != null) followLinkId = normalizeLinkId(input.payload.followLinkId);
  let scrollPixels = null;
  if (input.payload.scrollPixels != null) {
    scrollPixels = Number(input.payload.scrollPixels);
    if (!Number.isSafeInteger(scrollPixels) || Math.abs(scrollPixels) > 2400) {
      throw new Error('INVALID_SCROLL_PIXELS');
    }
  }
  const start = Date.parse(String(input.createdAt || ''));
  const expiry = Date.parse(String(input.expiresAt || ''));
  if (!Number.isFinite(start) || !Number.isFinite(expiry) ||
      start > now + 5*60*1000 || expiry <= now ||
      expiry <= start || expiry-start > 15*60*1000) {
    throw new Error('INVALID_OR_EXPIRED_REQUEST');
  }
  return {
    schema:REQUEST_SCHEMA,id:input.id,operation:input.operation,
    payload:{url,followLinkId,scrollPixels},createdAt:input.createdAt,expiresAt:input.expiresAt
  };
}

function fileFor(kind,id) {
  if (!['cloud-requests','cloud-claims','cloud-responses'].includes(kind) ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{7,99}$/.test(id)) throw new Error('INVALID_FILE');
  return path.join(kind,id+'.json');
}
function sha(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
async function exists(file) { return fs.stat(file).then(()=>true,()=>false); }
async function save(file,obj) {
  await fs.mkdir(path.dirname(file),{recursive:true});
  await fs.writeFile(file,JSON.stringify(obj,null,2)+'\n','utf8');
}

export async function processMailbox(mode, requestFile, {
  now=Date.now(), allowedHosts=allowedHostsFromEnv(process.env.BROWSALLAX_CLOUD_ALLOWED_HOSTS || ''),
  browserFactory=()=>new BrowsallaxCloudBrowser({allowedHosts})
}={}) {
  if (!['claim','execute'].includes(mode)) throw new Error('INVALID_MODE');
  if (!/^cloud-requests\/[A-Za-z0-9][A-Za-z0-9._-]{7,99}\.json$/.test(requestFile)) {
    throw new Error('INVALID_REQUEST_PATH');
  }
  const id=path.basename(requestFile,'.json');
  const claimPath=fileFor('cloud-claims',id), responsePath=fileFor('cloud-responses',id);
  if (await exists(responsePath)) return {skipped:true,id};
  const raw=await fs.readFile(requestFile,'utf8');
  if (raw.length>32768) throw new Error('REQUEST_TOO_LARGE');
  const request=normalizeCloudRequest(JSON.parse(raw),{id,now,allowedHosts});

  if (mode==='claim') {
    if (await exists(claimPath)) throw new Error('PREVIOUSLY_CLAIMED_NO_REPLAY');
    await save(claimPath,{
      schema:CLAIM_SCHEMA,requestId:id,operation:request.operation,requestSha256:sha(raw),
      claimedAt:new Date().toISOString(),authority:'GITHUB_CLOUD_RUNNER_READ_ONLY'
    });
    return {claimed:true,id,claimPath};
  }

  const claim=JSON.parse(await fs.readFile(claimPath,'utf8'));
  if (claim.schema!==CLAIM_SCHEMA || claim.requestId!==id ||
      claim.requestSha256!==sha(raw) || claim.operation!==request.operation) {
    throw new Error('CLAIM_REQUEST_MISMATCH');
  }
  const browser=browserFactory();
  try {
    let result=await browser.open(request.payload.url);
    if (request.payload.followLinkId) result=await browser.follow(request.payload.followLinkId);
    if (request.payload.scrollPixels!=null) result=await browser.scroll(request.payload.scrollPixels);
    const finalUrl=validatePublicUrl(result.url,allowedHosts);
    await save(responsePath,{
      schema:RESPONSE_SCHEMA,requestId:id,operation:request.operation,
      state:'COMPLETE',completedAt:new Date().toISOString(),
      result:{...result,url:finalUrl,textSha256:sha(result.text), source:'BROWSALLAX_CLOUD_PLAYWRIGHT'},
      error:null
    });
    return {complete:true,id,responsePath};
  } catch(err) {
    await save(responsePath,{
      schema:RESPONSE_SCHEMA,requestId:id,operation:request.operation,
      state:'FAILED',completedAt:new Date().toISOString(),
      result:null,error:String(err.code||err.message||'CLOUD_BROWSER_FAILED').slice(0,250)
    });
    return {complete:false,id,responsePath};
  } finally {
    await browser.reset().catch(()=>{});
  }
}

if (process.argv[1] && import.meta.url === new URL('file://' + path.resolve(process.argv[1])).href) {
  processMailbox(process.argv[2],process.argv[3])
    .then(v=>console.log(JSON.stringify(v)))
    .catch(err=>{console.error(String(err.code||err.message||err));process.exitCode=1;});
}
