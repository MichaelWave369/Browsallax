import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCloudRequest, REQUEST_SCHEMA} from '../scripts/mailbox-runner.js';
const now=Date.now();
const hosts=['example.com','www.nasa.gov'];
function request(overrides={}){
  return {schema:REQUEST_SCHEMA,id:'cloud-acceptance-0001',operation:'browser.research',
    payload:{url:'https://example.com/'},
    createdAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+600000).toISOString(),...overrides};
}
test('bounded cloud mailbox request accepts only approved read-only research',()=>{
 const v=normalizeCloudRequest(request(),{id:'cloud-acceptance-0001',now,allowedHosts:hosts});
 assert.equal(v.operation,'browser.research');
 assert.equal(v.payload.url,'https://example.com/');
 assert.equal(v.payload.followLinkId,null);
});
test('rejects changed id, unsafe URL, unknown keys, and non-research operation',()=>{
 const opt={id:'cloud-acceptance-0001',now,allowedHosts:hosts};
 assert.throws(()=>normalizeCloudRequest(request({id:'cloud-wrong-0001'}),opt),/INVALID_REQUEST_ID/);
 assert.throws(()=>normalizeCloudRequest(request({payload:{url:'http://example.com/'}}),opt),/URL_NOT_ALLOWLISTED_PUBLIC_HTTPS/);
 assert.throws(()=>normalizeCloudRequest(request({payload:{url:'https://example.com/',click:'#checkout'}}),opt),/INVALID_REQUEST_FIELDS/);
 assert.throws(()=>normalizeCloudRequest(request({operation:'browser.purchase'}),opt),/CLOUD_OPERATION_NOT_ALLOWED/);
 assert.throws(()=>normalizeCloudRequest(request({foo:'bar'}),opt),/INVALID_REQUEST_FIELDS/);
});
test('rejects expired and excessive-ttl requests',()=>{
 const opt={id:'cloud-acceptance-0001',now,allowedHosts:hosts};
 assert.throws(()=>normalizeCloudRequest(request({expiresAt:new Date(now-100).toISOString()}),opt),/INVALID_OR_EXPIRED_REQUEST/);
 assert.throws(()=>normalizeCloudRequest(request({expiresAt:new Date(now+3600000).toISOString()}),opt),/INVALID_OR_EXPIRED_REQUEST/);
});
test('bounded link and scroll fields are validated',()=>{
 const opt={id:'cloud-acceptance-0001',now,allowedHosts:hosts};
 const good=normalizeCloudRequest(request({payload:{url:'https://example.com/',followLinkId:'L1',scrollPixels:1000}}),opt);
 assert.equal(good.payload.followLinkId,'L1');
 assert.throws(()=>normalizeCloudRequest(request({payload:{url:'https://example.com/',followLinkId:'click submit'}}),opt),/INVALID_OBSERVED_LINK_ID/);
 assert.throws(()=>normalizeCloudRequest(request({payload:{url:'https://example.com/',scrollPixels:99999}}),opt),/INVALID_SCROLL_PIXELS/);
});

test('multi-page mailbox request preserves the legacy schema and validates scoped search',()=>{
 const opt={id:'cloud-acceptance-0001',now,allowedHosts:hosts};
 const valid=normalizeCloudRequest(request({
   payload:{url:'https://www.nasa.gov/',maxPages:3,maxDepth:1,focus:'Artemis Moon'}
 }),opt);
 assert.equal(valid.operation,'browser.research');
 assert.equal(valid.payload.research.maxPages,3);
 assert.equal(valid.payload.research.maxDepth,1);
 assert.equal(valid.payload.research.focus,'Artemis Moon');
 assert.equal(valid.payload.followLinkId,null);
 assert.throws(()=>normalizeCloudRequest(request({
   payload:{url:'https://www.nasa.gov/',maxPages:10,maxDepth:1,focus:'Artemis'}
 }),opt),/RESEARCH_PAGE_LIMIT/);
 assert.throws(()=>normalizeCloudRequest(request({
   payload:{url:'https://www.nasa.gov/',maxPages:3,maxDepth:1,focus:'Artemis',followLinkId:'L1'}
 }),opt),/MULTIPAGE_LEGACY_ACTION_CONFLICT/);
 assert.throws(()=>normalizeCloudRequest(request({
   payload:{url:'https://www.nasa.gov/',additionalUrls:['https://evil.example/']}
 }),opt),/URL_NOT_ALLOWLISTED_PUBLIC_HTTPS/);
});
