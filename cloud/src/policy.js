import { isIP } from 'node:net';

export const POLICY_VERSION = 'PV-CLOUD-POLICY-0.1';

export class BrowserPolicyError extends Error {
  constructor(code) { super(code); this.code = code; }
}

export function allowedHostsFromEnv(value = '') {
  return [...new Set(String(value).split(',').map(x => x.trim().toLowerCase()).filter(Boolean))].map(host => {
    if (!/^[a-z0-9.-]+$/.test(host) || host.startsWith('.') || host.endsWith('.') ||
        host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
        host.endsWith('.internal') || isIP(host)) {
      throw new BrowserPolicyError('INVALID_ALLOWED_HOST');
    }
    return host;
  });
}

// Exact hostnames only. No wildcard subdomains or caller-supplied allowlists.
export function validatePublicUrl(raw, allowedHosts) {
  if (!Array.isArray(allowedHosts) || allowedHosts.length === 0) {
    throw new BrowserPolicyError('CLOUD_HOST_ALLOWLIST_EMPTY');
  }
  if (typeof raw !== 'string' || raw.length < 1 || raw.length > 2048) {
    throw new BrowserPolicyError('INVALID_URL');
  }
  let url;
  try { url = new URL(raw); } catch { throw new BrowserPolicyError('INVALID_URL'); }
  if (url.protocol !== 'https:' || url.port && url.port !== '443' ||
      url.username || url.password || isIP(url.hostname) ||
      url.hostname.endsWith('.local') || url.hostname.endsWith('.internal') ||
      url.hostname === 'localhost' || !allowedHosts.includes(url.hostname.toLowerCase())) {
    throw new BrowserPolicyError('URL_NOT_ALLOWLISTED_PUBLIC_HTTPS');
  }
  url.hash = '';
  return url.href;
}


const SENSITIVE_DOCUMENT_PATH = /\/(?:logout|log-out|signout|sign-out|delete|remove|checkout|purchase|buy|download|payment|cart|admin|account)(?:\/|$)/i;
const NON_DOCUMENT_EXT = /\.(?:zip|exe|dmg|pdf|jpg|jpeg|png|webp|gif|mp4|mp3|webm|svg|json|xml|csv)$/i;
const SENSITIVE_QUERY_KEY = /^(?:token|access_token|refresh_token|auth|authorization|api_?key|secret|client_secret|session|session_id|password|passcode|otp|signature|code|checkout|logout|delete|purchase|payment)$/i;

// Enforced before every document navigation, including HTTP redirects, not
// merely after an observed page finishes loading. Assets use validatePublicUrl.
export function validateResearchUrl(raw, allowedHosts) {
  const safe = validatePublicUrl(raw, allowedHosts);
  const parsed = new URL(safe);
  if (SENSITIVE_DOCUMENT_PATH.test(parsed.pathname) ||
      NON_DOCUMENT_EXT.test(parsed.pathname) ||
      [...parsed.searchParams.keys()].some(key => SENSITIVE_QUERY_KEY.test(key))) {
    throw new BrowserPolicyError('RESEARCH_URL_SENSITIVE_OR_NON_HTML');
  }
  return safe;
}

export function normalizeLinkId(raw) {
  if (typeof raw !== 'string' || !/^L([1-9][0-9]{0,2})$/.test(raw)) {
    throw new BrowserPolicyError('INVALID_OBSERVED_LINK_ID');
  }
  return raw;
}
