import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { processMailbox, REQUEST_SCHEMA } from '../scripts/mailbox-runner.js';

const id = 'cloud-integration-0001';
const hosts = ['www.nasa.gov'];
const root = 'https://www.nasa.gov/';
const artemis = 'https://www.nasa.gov/humans-in-space/artemis/';

test('mailbox claims before execution, emits two independently hashed pages, and resets browser',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'browsallax-cloud-v02-'));
  const previous=process.cwd();
  const events=[];
  try {
    process.chdir(dir);
    await fs.mkdir('cloud-requests',{recursive:true});
    const now=Date.now();
    const request={
      schema:REQUEST_SCHEMA,id,operation:'browser.research',
      payload:{url:root,additionalUrls:[artemis],maxPages:2,maxDepth:0},
      createdAt:new Date(now-1000).toISOString(),
      expiresAt:new Date(now+10*60*1000).toISOString()
    };
    const file='cloud-requests/'+id+'.json';
    await fs.writeFile(file,JSON.stringify(request,null,2)+'\n');
    const fake={
      allowedHosts:hosts,
      async open(url){
        events.push('navigate:'+url);
        return {url,title:url===root?'NASA':'Artemis',text:'Evidence from '+url,
          truncated:false,links:[],navigation:{httpStatus:200,redirectChain:[]}};
      },
      async reset(){events.push('reset');}
    };
    const options={allowedHosts:hosts,browserFactory:()=>fake,now};
    const claim=await processMailbox('claim',file,options);
    assert.equal(claim.claimed,true);
    assert.deepEqual(events,[]);
    const result=await processMailbox('execute',file,options);
    assert.equal(result.complete,true);
    assert.deepEqual(events,['navigate:'+root,'navigate:'+artemis,'reset']);
    const response=JSON.parse(await fs.readFile('cloud-responses/'+id+'.json','utf8'));
    assert.equal(response.state,'COMPLETE');
    assert.equal(response.result.schema,'browsallax.cloud.research.v2');
    assert.equal(response.result.pageCount,2);
    assert.notEqual(response.result.pages[0].textSha256,response.result.pages[1].textSha256);
    assert.ok(response.result.indexSha256);
    const replay=await processMailbox('execute',file,options);
    assert.equal(replay.skipped,true);
    assert.equal(events.length,3);
  } finally {
    process.chdir(previous);
    await fs.rm(dir,{recursive:true,force:true});
  }
});
