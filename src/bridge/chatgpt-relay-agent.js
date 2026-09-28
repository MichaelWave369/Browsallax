const {
  ChatGPTBrowsallaxBridge
} = require('./chatgpt-browsallax');

const CHATGPT_RELAY_AGENT_VERSION = 'PV-CBR-AGENT-0.2';
const DEFAULT_POLL_MS = 1000;
const MAX_POLL_MS = 10000;
const ALLOWED_RELAY_OPERATIONS = new Set([
  'bridge.status',
  'vessie.observe',
  'vessie.ask',
  'vessie.resume',
  'domistika.status',
  'domistika.observe',
  'domistika.draw'
]);

function normalizeRelayUrl(value) {
  const parsed = new URL(String(value || '').trim());
  const isLocalHttp = parsed.protocol === 'http:' &&
    (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '::1');
  if (parsed.protocol !== 'https:' && !isLocalHttp) {
    throw new Error('RELAY_HTTPS_REQUIRED');
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal?.removeEventListener?.('abort', abort);
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const abort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      reject(signal?.reason || new Error('RELAY_AGENT_ABORTED'));
    };
    const timer = setTimeout(finish, ms);
    if (signal) {
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
    }
  });
}

class ChatGPTRelayAgent {
  constructor({
    relayUrl,
    agentToken,
    bridge,
    fetchImpl = globalThis.fetch,
    pollMs = DEFAULT_POLL_MS
  } = {}) {
    this.relayUrl = normalizeRelayUrl(relayUrl);
    this.agentToken = String(agentToken || '').trim();
    if (this.agentToken.length < 32) throw new Error('RELAY_AGENT_TOKEN_MIN_32_CHARS');
    this.bridge = bridge;
    if (!bridge) throw new Error('CHATGPT_BROWSALLAX_BRIDGE_REQUIRED');
    this.fetch = fetchImpl;
    if (typeof this.fetch !== 'function') throw new Error('FETCH_REQUIRED');
    this.pollMs = Math.max(250, Math.min(MAX_POLL_MS, Number(pollMs) || DEFAULT_POLL_MS));
  }

  static async connect(options = {}) {
    const bridge = options.bridge || await ChatGPTBrowsallaxBridge.connect(options);
    return new ChatGPTRelayAgent({ ...options, bridge });
  }

  headers() {
    return {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${this.agentToken}`
    };
  }

  async request(pathname, body, { signal } = {}) {
    const response = await this.fetch(`${this.relayUrl}${pathname}`, {
      method: 'POST',
      headers: this.headers(),
      signal,
      body: JSON.stringify(body || {})
    });

    const text = await response.text();
    let parsed = {};
    try { parsed = text ? JSON.parse(text) : {}; } catch {}

    if (!response.ok) {
      const error = new Error(String(parsed?.error || `RELAY_HTTP_${response.status}`));
      error.status = response.status;
      error.body = parsed;
      throw error;
    }
    return parsed;
  }

  poll(options = {}) {
    return this.request('/v1/agent/poll', {}, options);
  }

  complete(id, claimToken, { result = null, error = null } = {}, options = {}) {
    return this.request('/v1/agent/complete', {
      id,
      claimToken,
      result,
      error
    }, options);
  }

  async execute(request) {
    const operation = String(request?.operation || '').trim();
    const payload = request?.payload || {};

    if (!ALLOWED_RELAY_OPERATIONS.has(operation)) {
      throw new Error('RELAY_OPERATION_NOT_ALLOWED');
    }

    switch (operation) {
      case 'bridge.status':
        return this.bridge.status();
      case 'vessie.observe':
        return this.bridge.observeVessie();
      case 'vessie.ask':
        return this.bridge.askVessie(payload.message);
      case 'vessie.resume':
        return this.bridge.resumeVessie(payload.taskId);
      case 'domistika.status':
        return this.bridge.domistikaStatus();
      case 'domistika.observe':
        return this.bridge.observeDomistika();
      case 'domistika.draw':
        return this.bridge.drawDomistika(payload.recipe);
      default:
        throw new Error('RELAY_OPERATION_NOT_ALLOWED');
    }
  }

  async runOnce({ signal } = {}) {
    const polled = await this.poll({ signal });
    const request = polled?.request || null;
    if (!request) return { handled: false };

    const id = String(request.id || '').trim();
    const claimToken = String(request.claimToken || '').trim();
    if (!id || !claimToken) throw new Error('INVALID_RELAY_CLAIM');

    try {
      const result = await this.execute(request);
      await this.complete(id, claimToken, { result }, { signal });
      return { handled: true, id, operation: request.operation, ok: true };
    } catch (error) {
      const message = String(error?.code || error?.message || 'LOCAL_EXECUTION_FAILED').slice(0, 1000);
      await this.complete(id, claimToken, { error: message }, { signal });
      return { handled: true, id, operation: request.operation, ok: false, error: message };
    }
  }

  async runForever({ signal, onEvent } = {}) {
    let delay = this.pollMs;

    while (!signal?.aborted) {
      try {
        const outcome = await this.runOnce({ signal });
        onEvent?.({ type: 'poll', ...outcome });
        delay = outcome.handled ? 0 : this.pollMs;
      } catch (error) {
        onEvent?.({
          type: 'error',
          error: String(error?.message || error || 'RELAY_AGENT_ERROR')
        });
        delay = Math.min(MAX_POLL_MS, Math.max(this.pollMs, delay ? delay * 2 : this.pollMs));
      }

      if (delay > 0 && !signal?.aborted) await sleep(delay, signal);
    }
  }
}

module.exports = {
  CHATGPT_RELAY_AGENT_VERSION,
  DEFAULT_POLL_MS,
  MAX_POLL_MS,
  ALLOWED_RELAY_OPERATIONS,
  normalizeRelayUrl,
  sleep,
  ChatGPTRelayAgent
};
