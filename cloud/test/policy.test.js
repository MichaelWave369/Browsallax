import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedHostsFromEnv,validatePublicUrl,validateResearchUrl,normalizeLinkId} from '../src/policy.js';

test('exact allowed HTTPS hosts only, no arbitrary cross-origin navigation',()=>{
 const hosts=allowedHostsFromEnv('www.nasa.gov,nasa.gov,www.nasa.gov');
 assert.deepEqual(hosts,['www.nasa.gov','nasa.gov']);
 assert.equal(validatePublicUrl('https://www.nasa.gov/artemis#overview',hosts),'https://www.nasa.gov/artemis');
 for(const bad of [
  'http://www.nasa.gov','file:///etc/passwd','https://www.nasa.gov.evil.example/',
  'https://127.0.0.1/','https://localhost/','https://nasa.gov@evil.example/',
  'https://user:pass@www.nasa.gov/','https://www.nasa.gov:8443/',
  'https://example.com/'
 ])assert.throws(()=>validatePublicUrl(bad,hosts));
});
test('empty allowlist fails closed',()=>{
 assert.throws(()=>validatePublicUrl('https://www.nasa.gov/',[]),/CLOUD_HOST_ALLOWLIST_EMPTY/);
});
test('rejects localhost, private IPs, wildcard and internal configuration',()=>{
 for(const h of ['localhost','127.0.0.1','192.168.1.1','foo.local','foo.internal','*.example.com']){
  assert.throws(()=>allowedHostsFromEnv(h),/INVALID_ALLOWED_HOST/);
 }
});
test('link IDs must be observed references, not selectors',()=>{
 assert.equal(normalizeLinkId('L1'),'L1');
 for(const ref of ['#submit','javascript:alert(1)','L0','L9999','L1;drop']) {
   assert.throws(()=>normalizeLinkId(ref),/INVALID_OBSERVED_LINK_ID/);
 }
});

test('public document policy blocks sensitive redirects before navigation',()=>{
 const hosts=['www.nasa.gov'];
 for(const target of [
   'https://www.nasa.gov/account/',
   'https://www.nasa.gov/logout',
   'https://www.nasa.gov/receipt.pdf',
   'https://www.nasa.gov/news/?access_token=secret',
   'https://www.nasa.gov/news/?password=x'
 ]) {
   assert.throws(()=>validateResearchUrl(target,hosts),/RESEARCH_URL_SENSITIVE_OR_NON_HTML/);
 }
 assert.equal(validateResearchUrl('https://www.nasa.gov/humans-in-space/artemis/',hosts),
   'https://www.nasa.gov/humans-in-space/artemis/');
});
