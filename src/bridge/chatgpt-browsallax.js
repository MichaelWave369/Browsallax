const http = require('node:http');
const crypto = require('node:crypto');
const {
  BrowsallaxOperatorClient
} = require('../client/operator-client');
const {
  summarizeTask,
  mapTaskDisposition
} = require('./phios-vessie');
const {
  DEFAULT_DOMISTIKA_URL,
  DomistikaSemanticBridge
} = require('./domistika');

const CHATGPT_BROWSALLAX_BRIDGE_VERSION = 'PV-CBR-0.3';
const CHATGPT_BROWSALLAX_BRIDGE_SCHEMA = 'browsallax.chatgpt-bridge.v1';
const DEFAULT_BRIDGE_HOST = '127.0.0.1';
const DEFAULT_BRIDGE_PORT = 3698;
const DEFAULT_VESSIE_ORIGIN = 'https://superphivessel.netlify.app';
const MAX_MESSAGE_CHARS = 8000;
const MAX_BODY_BYTES = 32 * 1024;
const DEFAULT_VESSIE_RESPONSE_TIMEOUT_MS = 180000;
const DEFAULT_VESSIE_POLL_MS = 500;
const VESSIE_COMPOSER_PLACEHOLDER_RE = /(speak or type into the field|speak into the field|dream without proving it yet|give the sourced thinker panel a real problem)/i;

function normalizeOrigin(value) {
  try {
    return new URL(String(value || '')).origin;
  } catch {
    return null;
  }
}

function bridgeManifest() {
  return {
    schema: CHATGPT_BROWSALLAX_BRIDGE_SCHEMA,
    version: CHATGPT_BROWSALLAX_BRIDGE_VERSION,
    purpose: 'BOUNDED_CHATGPT_TO_LOCAL_BROWSALLAX_SEMANTIC_BRIDGE',
    authority: {
      invariant: 'CAPABILITY != AUTHORITY',
      bridgeCanGrantAuthority: false,
      browserOperatorRemainsAuthoritySource: true,
      humanGrantStillRequiredFor: ['FORM_INPUT', 'REMOTE_MUTATION'],
      hardHeld: ['SENSITIVE_ACTION']
    },
    methods: [
      'bridge.status',
      'vessie.observe',
      'vessie.ask',
      'vessie.resume',
      'domistika.status',
      'domistika.observe',
      'domistika.draw'
    ],
    nonGoals: [
      'REMOTE_SHELL',
      'ARBITRARY_FILESYSTEM',
      'ARBITRARY_URL_FETCH',
      'RAW_BROWSER_ACTIONS',
      'GRANT_CREATION',
      'SENSITIVE_ACTION_APPROVAL'
    ]
  };
}

function bridgeEnvelope(kind, payload, meta = {}) {
  return {
    schema: 'browsallax.chatgpt-bridge.receipt.v1',
    bridgeVersion: CHATGPT_BROWSALLAX_BRIDGE_VERSION,
    receiptId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    authority: 'BRIDGE_ONLY_NO_AUTHORITY_ESCALATION',
    kind,
    ...meta,
    payload
  };
}

function findVessieTab(status, vessieOrigin = DEFAULT_VESSIE_ORIGIN) {
  const targetOrigin = normalizeOrigin(vessieOrigin);
  if (!targetOrigin) throw new Error('INVALID_VESSIE_ORIGIN');
  const tabs = Array.isArray(status?.tabs) ? status.tabs : [];
  const matches = tabs.filter((tab) => normalizeOrigin(tab?.url) === targetOrigin);
  return matches.find((tab) => tab.active) || matches[0] || null;
}

function sanitizeOperatorStatus(status = {}) {
  return {
    ok: Boolean(status.ok),
    version: status.version || null,
    grant: status.grant
      ? { active: true, expiresAt: Number(status.grant.expiresAt || 0) || null }
      : { active: false, expiresAt: null },
    tasks: status.tasks || null,
    tabs: Array.isArray(status.tabs)
      ? status.tabs.slice(0, 50).map((tab) => ({
          id: tab.id,
          title: String(tab.title || '').slice(0, 300),
          url: String(tab.url || '').slice(0, 2000),
          active: Boolean(tab.active),
          loading: Boolean(tab.loading)
        }))
      : []
  };
}

function boundedObservation(snapshot = {}) {
  const text = String(snapshot.text || '').slice(0, 16000);
  return {
    url: String(snapshot.url || '').slice(0, 2000),
    title: String(snapshot.title || '').slice(0, 500),
    text,
    textChars: text.length,
    textSha256: crypto.createHash('sha256').update(text, 'utf8').digest('hex'),
    elementCount: Array.isArray(snapshot.elements) ? snapshot.elements.length : 0
  };
}

function normalizeMessage(value) {
  const message = String(value || '').trim();
  if (!message) throw new Error('VESSIE_MESSAGE_REQUIRED');
  if (message.length > MAX_MESSAGE_CHARS) throw new Error('VESSIE_MESSAGE_TOO_LONG');
  return message;
}

function grantSummary(status = {}) {
  return status.grant
    ? { active: true, expiresAt: Number(status.grant.expiresAt || 0) || null }
    : { active: false, expiresAt: null };
}

function visibleElements(snapshot = {}) {
  return Array.isArray(snapshot.elements) ? snapshot.elements : [];
}

function findObservedVessieComposer(snapshot = {}) {
  return visibleElements(snapshot).find((element) => {
    if (String(element?.tagName || '').toLowerCase() !== 'textarea') return false;
    return VESSIE_COMPOSER_PLACEHOLDER_RE.test(String(element?.placeholder || ''));
  }) || null;
}

function findObservedVessieSendButton(snapshot = {}) {
  return visibleElements(snapshot).find((element) => {
    if (String(element?.tagName || '').toLowerCase() !== 'button') return false;
    return String(element?.title || '').trim().toLowerCase() === 'send';
  }) || null;
}

function findObservedVessieStopButton(snapshot = {}) {
  return visibleElements(snapshot).find((element) => {
    if (String(element?.tagName || '').toLowerCase() !== 'button') return false;
    return String(element?.title || '').trim().toLowerCase() === 'stop generation';
  }) || null;
}

function completedVessieResponseCount(snapshot = {}) {
  return visibleElements(snapshot).filter((element) => (
    String(element?.tagName || '').toLowerCase() === 'button' &&
    String(element?.text || '').trim().toLowerCase().includes('regenerate')
  )).length;
}

function delay(ms, signal) {
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
      reject(signal?.reason || new Error('VESSIE_WAIT_ABORTED'));
    };
    const timer = setTimeout(finish, ms);
    if (signal) {
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
    }
  });
}

async function waitForVessieResponse(client, tabId, {
  baselineCompleted = 0,
  timeoutMs = DEFAULT_VESSIE_RESPONSE_TIMEOUT_MS,
  pollMs = DEFAULT_VESSIE_POLL_MS,
  signal
} = {}) {
  const startedAt = Date.now();
  let sawBusy = false;
  let lastSnapshot = null;

  while (Date.now() - startedAt < timeoutMs) {
    if (signal?.aborted) throw signal.reason || new Error('VESSIE_WAIT_ABORTED');
    const observed = await client.observe(tabId, { signal }).catch(() => null);
    const snapshot = observed?.snapshot || null;
    if (snapshot) {
      lastSnapshot = snapshot;
      if (findObservedVessieStopButton(snapshot) || String(snapshot.text || '').includes('Request executing.')) {
        sawBusy = true;
      }
      const completed = completedVessieResponseCount(snapshot);
      const idle = Boolean(findObservedVessieSendButton(snapshot)) || String(snapshot.text || '').includes('Machine idle.');
      if (idle && completed > baselineCompleted) {
        return {
          ok: true,
          sawBusy,
          completedBefore: baselineCompleted,
          completedAfter: completed,
          snapshot
        };
      }
    }
    await delay(Math.max(100, pollMs), signal);
  }

  return {
    ok: false,
    sawBusy,
    completedBefore: baselineCompleted,
    completedAfter: completedVessieResponseCount(lastSnapshot || {}),
    snapshot: lastSnapshot,
    error: 'VESSIE_RESPONSE_NOT_OBSERVED'
  };
}

function actionDisposition(actionResult) {
  if (actionResult?.status === 'HELD') return 'HELD';
  return actionResult?.ok === false ? 'FAILED' : 'COMPLETE';
}

function actionFailureReason(actionResult, fallback) {
  return String(
    actionResult?.error ||
    actionResult?.result?.error ||
    actionResult?.authority?.reason ||
    fallback
  ).slice(0, 300);
}

class ChatGPTBrowsallaxBridge {
  constructor(client, {
    vessieOrigin = DEFAULT_VESSIE_ORIGIN,
    domistikaUrl = DEFAULT_DOMISTIKA_URL
  } = {}) {
    this.client = client;
    this.vessieOrigin = normalizeOrigin(vessieOrigin);
    if (!this.vessieOrigin) throw new Error('INVALID_VESSIE_ORIGIN');
    this.domistika = new DomistikaSemanticBridge(client, { domistikaUrl });
  }

  static async connect(options = {}) {
    const client = options.client || await BrowsallaxOperatorClient.connect(options);
    return new ChatGPTBrowsallaxBridge(client, options);
  }

  manifest() {
    return bridgeManifest();
  }

  async status(options = {}) {
    const operator = await this.client.status(options);
    const planner = await this.client.plannerStatus(options).catch((error) => ({
      ok: false,
      error: error?.code || error?.message || 'PLANNER_STATUS_FAILED'
    }));
    const safeOperator = sanitizeOperatorStatus(operator);
    const vessieTab = findVessieTab(operator, this.vessieOrigin);
    const domistika = await this.domistika.status(options).catch((error) => ({
      disposition: 'FAILED',
      reason: error?.code || error?.message || 'DOMISTIKA_STATUS_FAILED'
    }));

    return bridgeEnvelope('BRIDGE_STATUS', {
      manifest: bridgeManifest(),
      operator: safeOperator,
      planner: {
        ok: planner?.ok !== false,
        available: planner?.planner?.available ?? planner?.available ?? null,
        selectedModel: planner?.planner?.selectedModel ?? planner?.selectedModel ?? null,
        error: planner?.error || null
      },
      vessie: {
        origin: this.vessieOrigin,
        open: Boolean(vessieTab),
        tab: vessieTab
          ? {
              id: vessieTab.id,
              title: String(vessieTab.title || '').slice(0, 300),
              url: String(vessieTab.url || '').slice(0, 2000),
              active: Boolean(vessieTab.active)
            }
          : null
      },
      domistika
    });
  }

  async domistikaStatus(options = {}) {
    return bridgeEnvelope('DOMISTIKA_STATUS', await this.domistika.status(options));
  }

  async observeDomistika(options = {}) {
    return bridgeEnvelope('DOMISTIKA_OBSERVATION', await this.domistika.observe(options));
  }

  async drawDomistika(recipe, options = {}) {
    return bridgeEnvelope('DOMISTIKA_DRAW_RESULT', await this.domistika.draw(recipe, options));
  }

  async observeVessie(options = {}) {
    const operator = await this.client.status(options);
    const tab = findVessieTab(operator, this.vessieOrigin);
    if (!tab) {
      return bridgeEnvelope('VESSIE_OBSERVATION', {
        disposition: 'UNAVAILABLE',
        reason: 'VESSIE_TAB_NOT_OPEN',
        origin: this.vessieOrigin
      });
    }

    const response = await this.client.observe(tab.id, options);
    return bridgeEnvelope('VESSIE_OBSERVATION', {
      disposition: 'OBSERVED',
      origin: this.vessieOrigin,
      tabId: tab.id,
      observation: boundedObservation(response.snapshot || {})
    }, { tabId: tab.id });
  }

  async askVessie(messageInput, options = {}) {
    const message = normalizeMessage(messageInput);
    const operator = await this.client.status(options);
    const tab = findVessieTab(operator, this.vessieOrigin);
    if (!tab) {
      return bridgeEnvelope('VESSIE_ASK_RESULT', {
        disposition: 'UNAVAILABLE',
        reason: 'VESSIE_TAB_NOT_OPEN',
        origin: this.vessieOrigin
      });
    }

    const grant = grantSummary(operator);
    if (!grant.active || (grant.expiresAt && grant.expiresAt <= Date.now())) {
      return bridgeEnvelope('VESSIE_ASK_RESULT', {
        disposition: 'HELD',
        reason: 'HUMAN_INTERACTIVE_GRANT_REQUIRED',
        grant,
        tabId: tab.id
      }, { tabId: tab.id });
    }

    const baselineObserved = await this.client.observe(tab.id, options);
    const baseline = baselineObserved?.snapshot || {};
    const composer = findObservedVessieComposer(baseline);
    const sendButton = findObservedVessieSendButton(baseline);
    const stopButton = findObservedVessieStopButton(baseline);

    if (stopButton) {
      return bridgeEnvelope('VESSIE_ASK_RESULT', {
        disposition: 'HELD',
        reason: 'VESSIE_ALREADY_BUSY',
        grant,
        tabId: tab.id
      }, { tabId: tab.id });
    }

    if (!composer?.selector || !sendButton?.selector) {
      return bridgeEnvelope('VESSIE_ASK_RESULT', {
        disposition: 'FAILED',
        reason: 'VESSIE_COMPOSER_NOT_OBSERVED',
        grant,
        tabId: tab.id,
        observed: {
          composer: Boolean(composer),
          sendButton: Boolean(sendButton),
          elementCount: visibleElements(baseline).length
        }
      }, { tabId: tab.id });
    }

    const baselineCompleted = completedVessieResponseCount(baseline);

    const typed = await this.client.action(tab.id, {
      type: 'type',
      selector: composer.selector,
      value: message
    }, options);

    if (typed?.ok === false) {
      return bridgeEnvelope('VESSIE_ASK_RESULT', {
        disposition: actionDisposition(typed),
        reason: actionFailureReason(typed, 'VESSIE_COMPOSER_TYPE_FAILED'),
        grant,
        tabId: tab.id,
        stage: 'TYPE'
      }, { tabId: tab.id });
    }

    const typedObserved = await this.client.observe(tab.id, options);
    const typedComposer = findObservedVessieComposer(typedObserved?.snapshot || {});
    if (!typedComposer || String(typedComposer.value || '') !== message) {
      return bridgeEnvelope('VESSIE_ASK_RESULT', {
        disposition: 'FAILED',
        reason: 'VESSIE_COMPOSER_VERIFICATION_FAILED',
        grant,
        tabId: tab.id,
        stage: 'VERIFY_TYPE'
      }, { tabId: tab.id });
    }

    const currentSendButton = findObservedVessieSendButton(typedObserved?.snapshot || {});
    if (!currentSendButton?.selector) {
      return bridgeEnvelope('VESSIE_ASK_RESULT', {
        disposition: 'FAILED',
        reason: 'VESSIE_SEND_CONTROL_NOT_OBSERVED_AFTER_TYPE',
        grant,
        tabId: tab.id,
        stage: 'VERIFY_SEND'
      }, { tabId: tab.id });
    }

    const clicked = await this.client.action(tab.id, {
      type: 'click',
      selector: currentSendButton.selector
    }, options);

    if (clicked?.ok === false) {
      return bridgeEnvelope('VESSIE_ASK_RESULT', {
        disposition: actionDisposition(clicked),
        reason: actionFailureReason(clicked, 'VESSIE_SEND_CLICK_FAILED'),
        grant,
        tabId: tab.id,
        stage: 'SEND'
      }, { tabId: tab.id });
    }

    const wait = await waitForVessieResponse(this.client, tab.id, {
      baselineCompleted,
      timeoutMs: Math.max(
        1000,
        Math.min(
          DEFAULT_VESSIE_RESPONSE_TIMEOUT_MS,
          Number(options.timeoutMs || DEFAULT_VESSIE_RESPONSE_TIMEOUT_MS)
        )
      ),
      pollMs: Number(options.pollMs || DEFAULT_VESSIE_POLL_MS),
      signal: options.signal
    });

    if (!wait.ok) {
      return bridgeEnvelope('VESSIE_ASK_RESULT', {
        disposition: 'FAILED',
        reason: wait.error,
        grant,
        tabId: tab.id,
        transport: {
          mode: 'DETERMINISTIC_OBSERVED_CONTROLS',
          typed: true,
          clicked: true,
          sawBusy: wait.sawBusy,
          completedBefore: wait.completedBefore,
          completedAfter: wait.completedAfter
        },
        observation: wait.snapshot ? boundedObservation(wait.snapshot) : null
      }, { tabId: tab.id });
    }

    return bridgeEnvelope('VESSIE_ASK_RESULT', {
      disposition: 'COMPLETE',
      grant,
      tabId: tab.id,
      transport: {
        mode: 'DETERMINISTIC_OBSERVED_CONTROLS',
        typed: true,
        clicked: true,
        sawBusy: wait.sawBusy,
        completedBefore: wait.completedBefore,
        completedAfter: wait.completedAfter
      },
      observation: boundedObservation(wait.snapshot || {})
    }, { tabId: tab.id });
  }

  async resumeVessie(taskIdInput, options = {}) {
    const taskId = String(taskIdInput || '').trim();
    if (!taskId) throw new Error('TASK_ID_REQUIRED');

    const operator = await this.client.status(options);
    const tab = findVessieTab(operator, this.vessieOrigin);
    if (!tab) {
      return bridgeEnvelope('VESSIE_RESUME_RESULT', {
        disposition: 'UNAVAILABLE',
        reason: 'VESSIE_TAB_NOT_OPEN'
      });
    }

    const current = await this.client.getTask(taskId, options);
    if (!current?.task || Number(current.task.tabId) !== Number(tab.id)) {
      throw new Error('TASK_NOT_BOUND_TO_VESSIE_TAB');
    }

    const grant = grantSummary(operator);
    if (!grant.active || (grant.expiresAt && grant.expiresAt <= Date.now())) {
      return bridgeEnvelope('VESSIE_RESUME_RESULT', {
        disposition: 'HELD',
        reason: 'HUMAN_INTERACTIVE_GRANT_REQUIRED',
        grant,
        task: summarizeTask(current.task)
      }, { taskId, tabId: tab.id });
    }

    await this.client.resumeTask(taskId, options);
    const task = await this.client.waitForTask(taskId, {
      ...options,
      stopOnHeld: true,
      timeoutMs: Math.max(190000, Number(options.timeoutMs || 0))
    });

    let observation = null;
    if (task?.status === 'COMPLETE') {
      const observed = await this.client.observe(tab.id, options).catch(() => null);
      if (observed?.snapshot) observation = boundedObservation(observed.snapshot);
    }

    return bridgeEnvelope('VESSIE_RESUME_RESULT', {
      disposition: mapTaskDisposition(task),
      grant,
      task: summarizeTask(task),
      observation
    }, { taskId, tabId: tab.id });
  }
}

function bearer(req) {
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || '').trim());
  return match ? match[1].trim() : '';
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

async function readJson(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) {
      const error = new Error('REQUEST_BODY_TOO_LARGE');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error('INVALID_JSON');
    error.statusCode = 400;
    throw error;
  }
}

function json(res, status, body) {
  const payload = Buffer.from(JSON.stringify(body), 'utf8');
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': payload.length,
    'cache-control': 'no-store'
  });
  res.end(payload);
}

function startChatGPTBridgeServer({
  bridge,
  token,
  host = DEFAULT_BRIDGE_HOST,
  port = DEFAULT_BRIDGE_PORT
} = {}) {
  if (!bridge) throw new Error('BRIDGE_INSTANCE_REQUIRED');
  const secret = String(token || '').trim();
  if (secret.length < 32) throw new Error('BRIDGE_TOKEN_MIN_32_CHARS');

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${host}`);

      if (req.method === 'GET' && url.pathname === '/v1/health') {
        return json(res, 200, {
          ok: true,
          version: CHATGPT_BROWSALLAX_BRIDGE_VERSION,
          authority: 'NONE'
        });
      }

      if (req.method === 'GET' && url.pathname === '/v1/manifest') {
        return json(res, 200, { ok: true, manifest: bridge.manifest() });
      }

      if (!safeEqual(bearer(req), secret)) {
        return json(res, 401, { ok: false, error: 'UNAUTHORIZED' });
      }

      if (req.method === 'GET' && url.pathname === '/v1/status') {
        return json(res, 200, { ok: true, result: await bridge.status() });
      }

      if (req.method === 'GET' && url.pathname === '/v1/vessie/observe') {
        return json(res, 200, { ok: true, result: await bridge.observeVessie() });
      }

      if (req.method === 'POST' && url.pathname === '/v1/vessie/ask') {
        const body = await readJson(req);
        return json(res, 200, { ok: true, result: await bridge.askVessie(body.message) });
      }

      if (req.method === 'POST' && url.pathname === '/v1/vessie/resume') {
        const body = await readJson(req);
        return json(res, 200, { ok: true, result: await bridge.resumeVessie(body.taskId) });
      }

      if (req.method === 'GET' && url.pathname === '/v1/domistika/status') {
        return json(res, 200, { ok: true, result: await bridge.domistikaStatus() });
      }

      if (req.method === 'GET' && url.pathname === '/v1/domistika/observe') {
        return json(res, 200, { ok: true, result: await bridge.observeDomistika() });
      }

      if (req.method === 'POST' && url.pathname === '/v1/domistika/draw') {
        const body = await readJson(req);
        return json(res, 200, { ok: true, result: await bridge.drawDomistika(body.recipe) });
      }

      return json(res, 404, { ok: false, error: 'NOT_FOUND' });
    } catch (error) {
      return json(res, Number(error.statusCode || 500), {
        ok: false,
        error: String(error.code || error.message || 'INTERNAL_ERROR').slice(0, 300)
      });
    }
  });

  server.listen(port, host);

  return {
    version: CHATGPT_BROWSALLAX_BRIDGE_VERSION,
    server,
    close: () => new Promise((resolve) => server.close(() => resolve())),
    address: () => server.address()
  };
}

module.exports = {
  CHATGPT_BROWSALLAX_BRIDGE_VERSION,
  CHATGPT_BROWSALLAX_BRIDGE_SCHEMA,
  DEFAULT_BRIDGE_HOST,
  DEFAULT_BRIDGE_PORT,
  DEFAULT_VESSIE_ORIGIN,
  DEFAULT_DOMISTIKA_URL,
  MAX_MESSAGE_CHARS,
  bridgeManifest,
  bridgeEnvelope,
  normalizeOrigin,
  findVessieTab,
  sanitizeOperatorStatus,
  boundedObservation,
  normalizeMessage,
  findObservedVessieComposer,
  findObservedVessieSendButton,
  findObservedVessieStopButton,
  completedVessieResponseCount,
  waitForVessieResponse,
  ChatGPTBrowsallaxBridge,
  startChatGPTBridgeServer
};
