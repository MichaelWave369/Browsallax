const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const CLIENT_VERSION = 'PV-BOP-CLIENT-0.1';
const TERMINAL_TASK_STATES = new Set(['COMPLETE', 'FAILED', 'CANCELLED']);
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function candidateEndpointFiles({ env = process.env, platform = process.platform, home = os.homedir() } = {}) {
  const candidates = [];

  if (env.BROWSALLAX_ENDPOINT_FILE) candidates.push(env.BROWSALLAX_ENDPOINT_FILE);
  if (env.BROWSALLAX_USER_DATA) candidates.push(path.join(env.BROWSALLAX_USER_DATA, 'operator', 'endpoint.json'));

  if (platform === 'win32') {
    for (const root of [env.APPDATA, env.LOCALAPPDATA].filter(Boolean)) {
      candidates.push(path.join(root, 'browsallax', 'operator', 'endpoint.json'));
      candidates.push(path.join(root, 'Browsallax', 'operator', 'endpoint.json'));
    }
  } else if (platform === 'darwin') {
    const root = path.join(home, 'Library', 'Application Support');
    candidates.push(path.join(root, 'browsallax', 'operator', 'endpoint.json'));
    candidates.push(path.join(root, 'Browsallax', 'operator', 'endpoint.json'));
  } else {
    const configRoot = env.XDG_CONFIG_HOME || path.join(home, '.config');
    candidates.push(path.join(configRoot, 'browsallax', 'operator', 'endpoint.json'));
    candidates.push(path.join(configRoot, 'Browsallax', 'operator', 'endpoint.json'));
  }

  return [...new Set(candidates.map((value) => path.resolve(value)))];
}

function validateEndpoint(endpoint, sourcePath = null) {
  if (!endpoint || typeof endpoint !== 'object' || Array.isArray(endpoint)) throw new Error('INVALID_ENDPOINT_DESCRIPTOR');

  const host = String(endpoint.host || '').trim();
  const port = Number(endpoint.port);
  const token = String(endpoint.token || '').trim();
  const version = String(endpoint.version || '').trim();

  if (!LOOPBACK_HOSTS.has(host)) throw new Error('ENDPOINT_NOT_LOOPBACK');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('INVALID_ENDPOINT_PORT');
  if (!token || token.length < 32) throw new Error('INVALID_ENDPOINT_TOKEN');
  if (!/^PV-BOP-0\.[12]$/.test(version)) throw new Error('UNSUPPORTED_OPERATOR_VERSION');

  return {
    schema: String(endpoint.schema || ''),
    version,
    host,
    port,
    token,
    updatedAt: endpoint.updated_at || null,
    sourcePath
  };
}

async function readEndpointFile(filePath, fsImpl = fs) {
  const raw = await fsImpl.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  return validateEndpoint(parsed, filePath);
}

async function discoverEndpoint(options = {}) {
  if (options.endpoint) return validateEndpoint(options.endpoint, options.endpoint.sourcePath || null);

  const fsImpl = options.fsImpl || fs;
  const candidates = options.endpointFile
    ? [path.resolve(options.endpointFile)]
    : candidateEndpointFiles(options);

  const errors = [];
  for (const filePath of candidates) {
    try {
      return await readEndpointFile(filePath, fsImpl);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      errors.push({ filePath, error: error?.message || String(error) });
    }
  }

  const detail = errors.length
    ? ` Candidates with errors: ${errors.map((item) => `${item.filePath}: ${item.error}`).join('; ')}`
    : '';
  const error = new Error(`BROWSALLAX_ENDPOINT_NOT_FOUND.${detail}`);
  error.code = 'BROWSALLAX_ENDPOINT_NOT_FOUND';
  error.candidates = candidates;
  throw error;
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
      reject(signal?.reason || new Error('CLIENT_ABORTED'));
    };
    const timer = setTimeout(finish, ms);
    if (signal) {
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
    }
  });
}

function timeoutSignal(ms, parentSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('CLIENT_TIMEOUT')), ms);
  const abort = () => controller.abort(parentSignal?.reason || new Error('CLIENT_ABORTED'));
  if (parentSignal) {
    if (parentSignal.aborted) abort();
    else parentSignal.addEventListener('abort', abort, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      parentSignal?.removeEventListener?.('abort', abort);
    }
  };
}

class BrowsallaxOperatorError extends Error {
  constructor(message, { status = null, code = null, body = null } = {}) {
    super(message);
    this.name = 'BrowsallaxOperatorError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

class BrowsallaxOperatorClient {
  constructor({ endpoint, fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
    this.endpoint = validateEndpoint(endpoint, endpoint?.sourcePath || null);
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.baseUrl = `http://${this.endpoint.host}:${this.endpoint.port}`;
  }

  static async connect(options = {}) {
    const endpoint = await discoverEndpoint(options);
    const client = new BrowsallaxOperatorClient({
      endpoint,
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs
    });
    if (options.verify !== false) await client.health();
    return client;
  }

  descriptor() {
    return {
      clientVersion: CLIENT_VERSION,
      operatorVersion: this.endpoint.version,
      host: this.endpoint.host,
      port: this.endpoint.port,
      endpointFile: this.endpoint.sourcePath,
      updatedAt: this.endpoint.updatedAt
    };
  }

  async request(method, pathname, body = undefined, { signal, timeoutMs = this.timeoutMs, authenticated = true } = {}) {
    const timed = timeoutSignal(timeoutMs, signal);
    try {
      const headers = { accept: 'application/json' };
      if (authenticated) headers.authorization = `Bearer ${this.endpoint.token}`;
      if (body !== undefined) headers['content-type'] = 'application/json';

      const response = await this.fetch(`${this.baseUrl}${pathname}`, {
        method,
        headers,
        signal: timed.signal,
        body: body === undefined ? undefined : JSON.stringify(body)
      });

      const text = await response.text();
      let parsed;
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        parsed = { raw: text.slice(0, 4000) };
      }

      if (!response.ok) {
        const message = String(parsed?.error || parsed?.status || `HTTP_${response.status}`);
        throw new BrowsallaxOperatorError(message, {
          status: response.status,
          code: parsed?.error || parsed?.status || null,
          body: parsed
        });
      }
      return parsed;
    } finally {
      timed.cleanup();
    }
  }

  health(options = {}) {
    return this.request('GET', '/v1/health', undefined, { ...options, authenticated: false });
  }

  status(options = {}) {
    return this.request('GET', '/v1/status', undefined, options);
  }

  plannerStatus({ refresh = false, ...options } = {}) {
    return this.request('GET', `/v1/planner/status${refresh ? '?refresh=1' : ''}`, undefined, options);
  }

  observe(tabId, options = {}) {
    return this.request('GET', `/v1/observe?tabId=${encodeURIComponent(tabId)}`, undefined, options);
  }

  screenshot(tabId, { clip = null, ...options } = {}) {
    return this.request('POST', '/v1/screenshot', { tabId, clip }, options);
  }

  navigate(tabId, url, options = {}) {
    return this.request('POST', '/v1/navigate', { tabId, url }, options);
  }

  action(tabId, action, options = {}) {
    return this.request('POST', '/v1/action', { tabId, action }, options);
  }

  assert(tabId, assertion, options = {}) {
    return this.request('POST', '/v1/assert', { tabId, assertion }, options);
  }

  createTask(spec, options = {}) {
    return this.request('POST', '/v1/tasks', spec, options);
  }

  listTasks(options = {}) {
    return this.request('GET', '/v1/tasks', undefined, options);
  }

  getTask(id, options = {}) {
    return this.request('GET', `/v1/tasks/${encodeURIComponent(id)}`, undefined, options);
  }

  resumeTask(id, options = {}) {
    return this.request('POST', `/v1/tasks/${encodeURIComponent(id)}/resume`, {}, options);
  }

  cancelTask(id, reason = 'CLIENT_CANCELLED', options = {}) {
    return this.request('POST', `/v1/tasks/${encodeURIComponent(id)}/cancel`, { reason }, options);
  }

  async waitForTask(id, {
    pollMs = 500,
    timeoutMs = 5 * 60 * 1000,
    stopOnHeld = true,
    signal,
    onUpdate
  } = {}) {
    const deadline = Date.now() + timeoutMs;
    let previousSignature = '';

    while (Date.now() < deadline) {
      if (signal?.aborted) throw signal.reason || new Error('CLIENT_ABORTED');
      const response = await this.getTask(id, { signal });
      const task = response.task;
      const signature = `${task.status}:${task.stepCount}:${task.updatedAt}`;
      if (signature !== previousSignature) {
        previousSignature = signature;
        onUpdate?.(task);
      }

      if (TERMINAL_TASK_STATES.has(task.status)) return task;
      if (stopOnHeld && task.status === 'HELD') return task;

      await sleep(Math.max(50, pollMs), signal);
    }

    const error = new Error('TASK_WAIT_TIMEOUT');
    error.code = 'TASK_WAIT_TIMEOUT';
    throw error;
  }

  async runTask(spec, options = {}) {
    const created = await this.createTask(spec, options);
    const taskId = created.task?.id;
    if (!taskId) throw new Error('TASK_CREATE_NO_ID');
    return this.waitForTask(taskId, options);
  }
}

module.exports = {
  CLIENT_VERSION,
  TERMINAL_TASK_STATES,
  LOOPBACK_HOSTS,
  BrowsallaxOperatorError,
  BrowsallaxOperatorClient,
  candidateEndpointFiles,
  validateEndpoint,
  readEndpointFile,
  discoverEndpoint,
  sleep
};
