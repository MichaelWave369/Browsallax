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

export function normalizeLinkId(raw) {
  if (typeof raw !== 'string' || !/^L([1-9][0-9]{0,2})$/.test(raw)) {
    throw new BrowserPolicyError('INVALID_OBSERVED_LINK_ID');
  }
  return raw;
}
