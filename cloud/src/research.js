import crypto from 'node:crypto';
import { validatePublicUrl, BrowserPolicyError } from './policy.js';

export const RESEARCH_VERSION = 'PV-CLOUD-RESEARCH-0.2';
export const MAX_RESEARCH_PAGES = 5;
export const MAX_RESEARCH_DEPTH = 2;
const MAX_QUEUE = 24;
const MAX_OUTPUT_LINKS = 20;
const DANGEROUS_PATH = /\/(?:logout|log-out|signout|sign-out|delete|remove|checkout|purchase|buy|download|payment|cart|admin|account)(?:\/|$)/i;
const SKIP_EXT = /\.(?:zip|exe|dmg|pdf|jpg|jpeg|png|webp|gif|mp4|mp3|webm|svg|json|xml|csv)(?:$|[?])/i;
const STOP_WORDS = new Set(['the','and','for','from','with','this','that','about','into','what','when','where','which','are','was','were','has','have','how','its','our','new','news','more','page','site']);

export function contentSha256(value) {
  return crypto.createHash('sha256').update(String(value || ''),'utf8').digest('hex');
}

export function focusTerms(focus = '') {
  return [...new Set(String(focus).toLowerCase().match(/[a-z0-9]{3,}/g) || [])]
    .filter(token => !STOP_WORDS.has(token)).slice(0,12);
}

function linkScore(link, terms) {
  const url = new URL(link.url);
  const name = String(link.text || '').toLowerCase();
  const location = decodeURIComponent(url.pathname).toLowerCase().replace(/[^a-z0-9]+/g,' ');
  return terms.reduce((total,word) => total + (name.includes(word) ? 3 : 0) + (location.includes(word) ? 1 : 0),0);
}

function eligibleLink(link, allowedHosts, sourceUrl) {
  try {
    const url = validatePublicUrl(link.url, allowedHosts);
    if (url === sourceUrl || DANGEROUS_PATH.test(new URL(url).pathname) || SKIP_EXT.test(new URL(url).pathname)) return null;
    return url;
  } catch { return null; }
}

export function normalizeResearchSpec(input = {}, allowedHosts = []) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BrowserPolicyError('INVALID_RESEARCH_SPEC');
  const allowedKeys = ['url','additionalUrls','maxPages','maxDepth','focus'];
  if (Object.keys(input).some(key => !allowedKeys.includes(key))) throw new BrowserPolicyError('UNEXPECTED_RESEARCH_FIELDS');
  const url = validatePublicUrl(input.url, allowedHosts);
  const additional = input.additionalUrls == null ? [] : input.additionalUrls;
  if (!Array.isArray(additional) || additional.length > 4) throw new BrowserPolicyError('RESEARCH_URL_LIMIT');
  const additionalUrls = [...new Set(additional.map(item => validatePublicUrl(item,allowedHosts)))].filter(item => item !== url);
  const maxPages = input.maxPages == null ? Math.max(1,1+additionalUrls.length) : input.maxPages;
  const maxDepth = input.maxDepth == null ? 0 : input.maxDepth;
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > MAX_RESEARCH_PAGES ||
      maxPages < 1+additionalUrls.length) throw new BrowserPolicyError('RESEARCH_PAGE_LIMIT');
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 0 || maxDepth > MAX_RESEARCH_DEPTH) {
    throw new BrowserPolicyError('RESEARCH_DEPTH_LIMIT');
  }
  const focus = input.focus == null ? '' : input.focus;
  if (typeof focus !== 'string' || focus.length > 200 || (maxDepth > 0 && focusTerms(focus).length === 0)) {
    throw new BrowserPolicyError('RESEARCH_FOCUS_REQUIRED_OR_INVALID');
  }
  return { url, additionalUrls, maxPages, maxDepth, focus: focus.trim() };
}

// Deterministic bounded exploration. No model plans or page-supplied instructions
// can alter destination scope, add tools or grant authority.
export async function runBoundedResearch(browser, specInput, {allowedHosts=browser.allowedHosts, now=()=>new Date().toISOString()}={}) {
  const spec = normalizeResearchSpec(specInput, allowedHosts);
  const terms=focusTerms(spec.focus);
  const queue=[
    {url:spec.url,depth:0,discoveredFrom:null},
    ...spec.additionalUrls.map(url=>({url,depth:0,discoveredFrom:null}))
  ];
  const queued=new Set(queue.map(x=>x.url));
  const visited=new Set();
  const pages=[], failures=[];
  while (queue.length && pages.length < spec.maxPages && pages.length+failures.length < spec.maxPages + 4) {
    const candidate=queue.shift();
    queued.delete(candidate.url);
    if (visited.has(candidate.url)) continue;
    visited.add(candidate.url);
    let observed;
    try {
      observed=await browser.open(candidate.url);
      const finalUrl=validatePublicUrl(observed.url,allowedHosts);
      if (visited.has(finalUrl) && finalUrl !== candidate.url) continue;
      visited.add(finalUrl);
      if (typeof observed.text !== 'string') throw new BrowserPolicyError('INVALID_BROWSER_OBSERVATION');
      const observedLinks=Array.isArray(observed.links) ? observed.links : [];
      const pageId='P'+(pages.length+1);
      const evidence={
        pageId,requestedUrl:candidate.url,url:finalUrl,
        title:String(observed.title||'').slice(0,350),
        text:observed.text.slice(0,16000),
        textSha256:contentSha256(observed.text.slice(0,16000)),
        textChars:observed.text.slice(0,16000).length,
        truncated:Boolean(observed.truncated),
        observedAt:now(),
        depth:candidate.depth,
        discoveredFrom:candidate.discoveredFrom,
        httpStatus:observed.navigation?.httpStatus ?? null,
        redirectChain:observed.navigation?.redirectChain ?? [],
        links:observedLinks.slice(0,MAX_OUTPUT_LINKS).map(x=>({
          id:x.id,text:String(x.text||'').slice(0,140),url:String(x.url||'').slice(0,2048)
        }))
      };
      pages.push(evidence);
      if (candidate.depth >= spec.maxDepth || pages.length >= spec.maxPages || terms.length===0) continue;
      const nextLinks=observedLinks
        .map(link=>({link,url:eligibleLink(link,allowedHosts,finalUrl)}))
        .filter(item=>item.url && !visited.has(item.url) && !queued.has(item.url))
        .map(item=>({...item,score:linkScore(item.link,terms)}))
        .filter(item=>item.score>0)
        .sort((a,b)=>b.score-a.score || a.url.localeCompare(b.url));
      for(const item of nextLinks) {
        if (queue.length>=MAX_QUEUE) break;
        if (queued.has(item.url)) continue;
        queued.add(item.url);
        queue.push({url:item.url,depth:candidate.depth+1,discoveredFrom:{pageId,linkId:item.link.id,label:String(item.link.text||'').slice(0,120)}});
      }
    } catch(err) {
      failures.push({requestedUrl:candidate.url,error:String(err.code||err.message||'PAGE_FAILED').slice(0,250)});
    }
  }
  if (!pages.length) {
    const e=new BrowserPolicyError('RESEARCH_NO_PAGES_OBSERVED');
    e.details=failures.slice(0,5);
    throw e;
  }
  const index=pages.map(page=>({
    pageId:page.pageId,url:page.url,textSha256:page.textSha256,depth:page.depth,observedAt:page.observedAt
  }));
  return {
    schema:'browsallax.cloud.research.v2',version:RESEARCH_VERSION,
    authority:'PUBLIC_READ_ONLY_NO_FORM_OR_MUTATION',
    scope:{seedUrls:[spec.url,...spec.additionalUrls],allowedHosts:[...allowedHosts],maxPages:spec.maxPages,maxDepth:spec.maxDepth,focus:spec.focus},
    disposition:failures.length?'PARTIAL':'COMPLETE',
    pages,failures,
    pageCount:pages.length,
    indexSha256:contentSha256(JSON.stringify(index)),
    completedAt:now(),
    source:'BROWSALLAX_CLOUD_PLAYWRIGHT'
  };
}
