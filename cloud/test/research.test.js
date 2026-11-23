import test from 'node:test';
import assert from 'node:assert/strict';
import { contentSha256, normalizeResearchSpec, runBoundedResearch } from '../src/research.js';

const allowedHosts = ['example.com','www.nasa.gov'];
const root = 'https://www.nasa.gov/';
const artemis = 'https://www.nasa.gov/humans-in-space/artemis/';
const unrelated = 'https://www.nasa.gov/privacy/';
const other = 'https://example.com/';

function fakeBrowser(pages, {fail=[]} = {}) {
  const calls=[];
  let resets=0;
  const browser = {
    allowedHosts,
    async open(url) {
      calls.push(url);
      if (fail.includes(url)) throw new Error('SIMULATED_NAVIGATION_FAILURE');
      if (!(url in pages)) throw new Error('UNEXPECTED_TEST_URL');
      return structuredClone(pages[url]);
    },
    async reset() { resets++; }
  };
  return {browser,calls,get resets(){return resets;}};
}
const doc=(url,title,text,links=[])=>({
  url,title,text,links,truncated:false,navigation:{httpStatus:200,redirectChain:[]}
});

test('normalization rejects excessive pages/depth, unknown keys, and outside scope URLs',()=>{
  const options={url:root,maxPages:3,maxDepth:1,focus:'Artemis Moon'};
  const norm=normalizeResearchSpec(options,allowedHosts);
  assert.equal(norm.maxPages,3);
  assert.equal(norm.maxDepth,1);
  assert.deepEqual(norm.additionalUrls,[]);
  for (const changes of [
    {maxPages:6}, {maxPages:0}, {maxPages:2.5}, {maxDepth:3},
    {maxDepth:1,focus:'a'}, {additionalUrls:Array(5).fill(other)}
  ]) assert.throws(()=>normalizeResearchSpec({...options,...changes},allowedHosts));
  assert.throws(()=>normalizeResearchSpec({...options,additionalUrls:['https://outside.example/']},allowedHosts),/URL_NOT_ALLOWLISTED_PUBLIC_HTTPS/);
  assert.throws(()=>normalizeResearchSpec({...options,selector:'#pay'},allowedHosts),/UNEXPECTED_RESEARCH_FIELDS/);
  assert.throws(()=>normalizeResearchSpec({...options,url:'https://www.nasa.gov/account/'},allowedHosts),/RESEARCH_URL_SENSITIVE_OR_NON_HTML/);
  assert.throws(()=>normalizeResearchSpec({...options,url:'https://www.nasa.gov/?access_token=abc'},allowedHosts),/RESEARCH_URL_SENSITIVE_OR_NON_HTML/);
  assert.throws(()=>normalizeResearchSpec({...options,url:'https://www.nasa.gov/report.pdf'},allowedHosts),/RESEARCH_URL_SENSITIVE_OR_NON_HTML/);
  assert.throws(()=>normalizeResearchSpec({...options,additionalUrls:[other],maxPages:1},allowedHosts),/RESEARCH_PAGE_LIMIT/);
});

test('focused research follows only evidenced, allowed, non-sensitive links',async()=>{
  const site={
    [root]:doc(root,'NASA Home','Moon explorer home',[
      {id:'L1',text:'Artemis lunar exploration',url:artemis},
      {id:'L2',text:'Log out Artemis',url:'https://www.nasa.gov/logout/'},
      {id:'L3',text:'Artemis paid signup',url:'https://www.nasa.gov/account/'},
      {id:'L4',text:'NASA privacy',url:unrelated},
      {id:'L5',text:'Artemis at evil page',url:'https://evil.example/artemis'},
      {id:'L6',text:'NASA image',url:'https://www.nasa.gov/artemis.jpg'}
    ]),
    [artemis]:doc(artemis,'NASA Artemis','Humans on the Moon',[]),
    [unrelated]:doc(unrelated,'Privacy','Terms',[])
  };
  const {browser,calls}=fakeBrowser(site);
  const result=await runBoundedResearch(browser,{url:root,maxPages:3,maxDepth:1,focus:'Artemis Moon'},{
    allowedHosts,now:()=> '2026-11-22T22:00:00.000Z'
  });
  assert.deepEqual(calls,[root,artemis]);
  assert.equal(result.schema,'browsallax.cloud.research.v2');
  assert.equal(result.pageCount,2);
  assert.equal(result.disposition,'COMPLETE');
  assert.equal(result.pages[1].discoveredFrom.pageId,'P1');
  assert.equal(result.pages[1].discoveredFrom.linkId,'L1');
  assert.equal(result.pages[1].httpStatus,200);
  assert.equal(result.pages[1].textSha256,contentSha256('Humans on the Moon'));
  assert.match(result.indexSha256,/^[a-f0-9]{64}$/);
  assert.equal(result.pages[0].links.length,6);
});

test('multiple explicit seed URLs are visited within the five-page bound',async()=>{
  const {browser,calls}=fakeBrowser({
    [root]:doc(root,'NASA','NASA'),
    [other]:doc(other,'Example','Example')
  });
  const result=await runBoundedResearch(browser,{url:root,additionalUrls:[other,other],maxPages:2},{
    allowedHosts
  });
  assert.deepEqual(calls,[root,other]);
  assert.equal(result.pages.length,2);
  assert.deepEqual(result.scope.seedUrls,[root,other]);
});

test('one failed approved page produces explicit PARTIAL evidence',async()=>{
  const {browser}=fakeBrowser({
    [root]:doc(root,'NASA','NASA')
  },{fail:[other]});
  const result=await runBoundedResearch(browser,{url:root,additionalUrls:[other]},{
    allowedHosts
  });
  assert.equal(result.pageCount,1);
  assert.equal(result.disposition,'PARTIAL');
  assert.equal(result.failures[0].requestedUrl,other);
  assert.equal(result.failures[0].error,'SIMULATED_NAVIGATION_FAILURE');
});

test('a redirect outside allowlist never creates a positive page observation',async()=>{
  const {browser}=fakeBrowser({}, {fail:[root]});
  await assert.rejects(runBoundedResearch(browser,{url:root},{
    allowedHosts
  }), /RESEARCH_NO_PAGES_OBSERVED/);
});

test('response never exceeds five pages or two levels of autonomous research',async()=>{
  const pages={};
  for(let i=0;i<8;i++){
    const url='https://www.nasa.gov/page-'+i+'/';
    pages[url]=doc(url,'NASA '+i,'Page '+i,[
      {id:'L1',text:'Artemis Moon next',url:'https://www.nasa.gov/page-'+(i+1)+'/'}
    ]);
  }
  const {browser,calls}=fakeBrowser(pages);
  const result=await runBoundedResearch(browser,{
    url:'https://www.nasa.gov/page-0/',maxPages:5,maxDepth:2,focus:'Artemis Moon'
  },{allowedHosts});
  assert.equal(result.pageCount,3);
  assert.equal(calls.length,3);
  assert.equal(result.pages.at(-1).depth,2);
});
