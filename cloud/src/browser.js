import { chromium } from 'playwright-core';
import { allowedHostsFromEnv, validatePublicUrl, normalizeLinkId, BrowserPolicyError } from './policy.js';

const MAX_TEXT = 16000;
const MAX_LINKS = 80;
const NAV_LIMIT = 16;

export class BrowsallaxCloudBrowser {
  constructor({ allowedHosts = allowedHostsFromEnv(process.env.BROWSALLAX_CLOUD_ALLOWED_HOSTS || '') } = {}) {
    this.allowedHosts = allowedHosts;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.lastLinks = new Map();
    this.lastObservationUrl = null;
    this.navigations = 0;
    this.sequence = Promise.resolve();
  }

  exclusive(fn) {
    const next = this.sequence.then(fn, fn);
    this.sequence = next.catch(() => {});
    return next;
  }

  async ensurePage() {
    if (this.page && !this.page.isClosed()) return this.page;
    this.browser = await chromium.launch({
      headless: true,
      args: ['--disable-dev-shm-usage', '--no-sandbox']
    });
    this.context = await this.browser.newContext({
      acceptDownloads: false,
      serviceWorkers: 'block',
      permissions: [],
      viewport: { width: 1280, height: 900 }
    });
    await this.context.route('**/*', async route => {
      try {
        const request = route.request();
        const url = request.url();
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method().toUpperCase())) {
          return route.abort('blockedbyclient').catch(() => {});
        }
        if (url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
        validatePublicUrl(url, this.allowedHosts);
        return route.continue();
      } catch {
        return route.abort('blockedbyclient').catch(() => {});
      }
    });
    this.page = await this.context.newPage();
    this.page.on('dialog', dialog => dialog.dismiss().catch(() => {}));
    this.page.on('download', download => download.cancel().catch(() => {}));
    this.page.on('popup', popup => popup.close().catch(() => {}));
    this.context.on('page', page => {
      if (page !== this.page) page.close().catch(() => {});
    });
    return this.page;
  }

  async navigateUnsafe(input) {
    const url = validatePublicUrl(input, this.allowedHosts);
    if (this.navigations >= NAV_LIMIT) throw new BrowserPolicyError('NAVIGATION_LIMIT_REACHED_RESET_SESSION');
    const page = await this.ensurePage();
    this.lastLinks.clear();
    this.lastObservationUrl = null;
    this.navigations += 1;
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    validatePublicUrl(page.url(), this.allowedHosts);
    const redirectChain = [];
    let request = response?.request()?.redirectedFrom() || null;
    while (request && redirectChain.length < 8) {
      redirectChain.unshift({
        url: validatePublicUrl(request.url(), this.allowedHosts),
        httpStatus: request.response ? (await request.response())?.status() ?? null : null
      });
      request = request.redirectedFrom();
    }
    const observed = await this.readUnsafe();
    return {
      ...observed,
      navigation: {
        requestedUrl: url,
        finalUrl: observed.url,
        httpStatus: response?.status() ?? null,
        redirectChain
      }
    };
  }

  open(url) { return this.exclusive(() => this.navigateUnsafe(url)); }

  async readUnsafe() {
    if (!this.page || this.page.isClosed()) throw new BrowserPolicyError('NO_OPEN_BROWSER_PAGE');
    const currentUrl = validatePublicUrl(this.page.url(), this.allowedHosts);
    const observation = await this.page.evaluate(({ maxText, maxLinks }) => {
      const text = String(document.body?.innerText || '').slice(0, maxText);
      const links = Array.from(document.querySelectorAll('a[href]'))
        .filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && el.href;
        })
        .slice(0, maxLinks * 4)
        .map(el => ({
          text: String(el.innerText || el.getAttribute('aria-label') || el.title || '').trim().slice(0, 140),
          url: el.href
        })).filter(link => link.text);
      return { text, links: links.slice(0, maxLinks * 2) };
    }, { maxText: MAX_TEXT, maxLinks: MAX_LINKS });
    this.lastLinks.clear();
    const links = [];
    for (const link of observation.links) {
      if (links.length >= MAX_LINKS) break;
      try {
        const href = validatePublicUrl(link.url, this.allowedHosts);
        const id = 'L' + (links.length + 1);
        this.lastLinks.set(id, href);
        links.push({ id, text: link.text, url: href });
      } catch { /* External or blocked destinations are intentionally absent. */ }
    }
    this.lastObservationUrl = currentUrl;
    return {
      schema: 'browsallax.cloud.observation.v1',
      title: (await this.page.title()).slice(0, 350),
      url: currentUrl,
      text: observation.text,
      links,
      navigations: this.navigations,
      truncated: observation.text.length >= MAX_TEXT,
      authority: 'PUBLIC_READ_ONLY_NO_FORM_OR_MUTATION'
    };
  }

  read() { return this.exclusive(() => this.readUnsafe()); }

  follow(linkId) {
    return this.exclusive(async () => {
      const id = normalizeLinkId(linkId);
      if (!this.page || this.page.isClosed() || this.lastObservationUrl !== this.page.url()) {
        throw new BrowserPolicyError('OBSERVATION_STALE');
      }
      const url = this.lastLinks.get(id);
      if (!url) throw new BrowserPolicyError('LINK_NOT_OBSERVED');
      return this.navigateUnsafe(url);
    });
  }

  scroll(pixels) {
    return this.exclusive(async () => {
      if (!this.page || this.page.isClosed()) throw new BrowserPolicyError('NO_OPEN_BROWSER_PAGE');
      if (!Number.isFinite(pixels)) throw new BrowserPolicyError('INVALID_SCROLL');
      await this.page.evaluate(delta => window.scrollBy(0, delta), Math.max(-2400, Math.min(2400, pixels)));
      return this.readUnsafe();
    });
  }

  status() {
    return {
      schema: 'browsallax.cloud.status.v1',
      ready: true,
      pageOpen: Boolean(this.page && !this.page.isClosed()),
      currentUrl: this.page && !this.page.isClosed() ? this.page.url() : null,
      allowedHosts: this.allowedHosts,
      navigations: this.navigations,
      policy: 'PUBLIC_READ_ONLY_NO_LOGIN_NO_PURCHASE_NO_MUTATION',
      localDesktopRequired: false
    };
  }

  async resetUnsafe() {
    this.lastLinks.clear();
    this.lastObservationUrl = null;
    this.navigations = 0;
    try { await this.context?.close(); } catch {}
    try { await this.browser?.close(); } catch {}
    this.page = this.context = this.browser = null;
    return { reset: true, pageOpen: false };
  }

  reset() { return this.exclusive(() => this.resetUnsafe()); }
}
