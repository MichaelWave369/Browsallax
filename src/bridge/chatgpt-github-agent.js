const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const {
  ChatGPTBrowsallaxBridge
} = require('./chatgpt-browsallax');
const {
  normalizeDomistikaRecipe
} = require('./domistika');

const execFileAsync = promisify(execFile);

const CHATGPT_GITHUB_AGENT_VERSION = 'PV-CBR-GH-0.4';
const REQUEST_SCHEMA = 'browsallax.github-bridge.request.v1';
const CLAIM_SCHEMA = 'browsallax.github-bridge.claim.v1';
const RESPONSE_SCHEMA = 'browsallax.github-bridge.response.v1';
const DEFAULT_REPOSITORY = 'MichaelWave369/browsallax-chat-bridge';
const DEFAULT_BRANCH = 'main';
const DEFAULT_POLL_MS = 2500;
const MAX_REQUEST_BYTES = 32 * 1024;
const MAX_TTL_MS = 15 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const ALLOWED_OPERATIONS = new Set([
  'bridge.status',
  'vessie.observe',
  'vessie.ask',
  'vessie.resume',
  'domistika.status',
  'domistika.observe',
  'domistika.capabilities',
  'domistika.capture',
  'domistika.draw'
]);

function defaultMailboxDir({ env = process.env, home = os.homedir(), platform = process.platform } = {}) {
  if (platform === 'win32' && env.APPDATA) {
    return path.join(env.APPDATA, 'browsallax', 'github-bridge', 'mailbox');
  }
  const root = env.XDG_STATE_HOME || path.join(home, '.local', 'state');
  return path.join(root, 'browsallax', 'github-bridge', 'mailbox');
}

function normalizeRepository(value) {
  const repo = String(value || '').trim().replace(/^https:\/\/github\.com\//i, '').replace(/\.git$/i, '');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new Error('INVALID_GITHUB_BRIDGE_REPOSITORY');
  }
  return repo;
}

function repositoryFromRemote(value) {
  let remote = String(value || '').trim().replace(/\.git$/i, '');
  if (/^git@github\.com:/i.test(remote)) {
    return normalizeRepository(remote.replace(/^git@github\.com:/i, ''));
  }
  try {
    const parsed = new URL(remote);
    if (parsed.hostname.toLowerCase() !== 'github.com') throw new Error('NOT_GITHUB');
    return normalizeRepository(parsed.pathname.replace(/^\/+/, ''));
  } catch {
    throw new Error('INVALID_GITHUB_REMOTE');
  }
}

function safeRequestId(value) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{7,99}$/.test(id)) throw new Error('INVALID_REQUEST_ID');
  return id;
}

function assertExactKeys(object, allowed, code) {
  const keys = Object.keys(object || {});
  if (keys.some((key) => !allowed.has(key))) throw new Error(code);
}

function normalizePayload(operation, payload) {
  const value = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};

  if (operation === 'bridge.status' || operation === 'vessie.observe') {
    assertExactKeys(value, new Set(), 'UNEXPECTED_PAYLOAD_FIELDS');
    return {};
  }

  if (operation === 'vessie.ask') {
    assertExactKeys(value, new Set(['message']), 'UNEXPECTED_PAYLOAD_FIELDS');
    const message = String(value.message || '').trim();
    if (!message) throw new Error('MESSAGE_REQUIRED');
    if (message.length > 8000) throw new Error('MESSAGE_TOO_LONG');
    return { message };
  }

  if (operation === 'vessie.resume') {
    assertExactKeys(value, new Set(['taskId']), 'UNEXPECTED_PAYLOAD_FIELDS');
    const taskId = String(value.taskId || '').trim();
    if (!taskId) throw new Error('TASK_ID_REQUIRED');
    if (taskId.length > 300) throw new Error('TASK_ID_TOO_LONG');
    return { taskId };
  }

  if (operation === 'domistika.status' || operation === 'domistika.observe' || operation === 'domistika.capabilities') {
    assertExactKeys(value, new Set(), 'UNEXPECTED_PAYLOAD_FIELDS');
    return {};
  }

  if (operation === 'domistika.capture') {
    assertExactKeys(value, new Set(['sessionId', 'passName', 'includeImage', 'scope']), 'UNEXPECTED_PAYLOAD_FIELDS');
    return {
      sessionId: value.sessionId == null ? undefined : String(value.sessionId),
      passName: value.passName == null ? undefined : String(value.passName),
      includeImage: value.includeImage !== false,
      scope: value.scope == null ? undefined : String(value.scope)
    };
  }

  if (operation === 'domistika.draw') {
    assertExactKeys(
      value,
      new Set(['recipe', 'sessionId', 'passName', 'returnCapture', 'includeImage', 'captureScope', 'postSaveAction']),
      'UNEXPECTED_PAYLOAD_FIELDS'
    );
    return {
      recipe: normalizeDomistikaRecipe(value.recipe),
      sessionId: value.sessionId == null ? undefined : String(value.sessionId),
      passName: value.passName == null ? undefined : String(value.passName),
      returnCapture: value.returnCapture === true,
      includeImage: value.includeImage !== false,
      captureScope: value.captureScope == null ? undefined : String(value.captureScope),
      postSaveAction: value.postSaveAction == null ? undefined : String(value.postSaveAction)
    };
  }

  throw new Error('GITHUB_BRIDGE_OPERATION_NOT_ALLOWED');
}

function normalizeRequest(input, { expectedId = null, nowMs = Date.now() } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_REQUEST_OBJECT');

  assertExactKeys(
    input,
    new Set(['schema', 'id', 'operation', 'payload', 'createdAt', 'expiresAt']),
    'UNEXPECTED_REQUEST_FIELDS'
  );

  if (input.schema !== REQUEST_SCHEMA) throw new Error('INVALID_REQUEST_SCHEMA');

  const id = safeRequestId(input.id);
  if (expectedId && id !== expectedId) throw new Error('REQUEST_ID_FILENAME_MISMATCH');

  const operation = String(input.operation || '').trim();
  if (!ALLOWED_OPERATIONS.has(operation)) throw new Error('GITHUB_BRIDGE_OPERATION_NOT_ALLOWED');

  const createdAtMs = Date.parse(String(input.createdAt || ''));
  const expiresAtMs = Date.parse(String(input.expiresAt || ''));
  if (!Number.isFinite(createdAtMs) || !Number.isFinite(expiresAtMs)) throw new Error('INVALID_REQUEST_TIME');
  if (createdAtMs > nowMs + MAX_CLOCK_SKEW_MS) throw new Error('REQUEST_CREATED_IN_FUTURE');
  if (expiresAtMs <= createdAtMs) throw new Error('INVALID_REQUEST_EXPIRY');
  if (expiresAtMs - createdAtMs > MAX_TTL_MS) throw new Error('REQUEST_TTL_TOO_LONG');
  if (expiresAtMs <= nowMs) throw new Error('REQUEST_EXPIRED');

  return {
    schema: REQUEST_SCHEMA,
    id,
    operation,
    payload: normalizePayload(operation, input.payload),
    createdAt: new Date(createdAtMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString()
  };
}

function requestSha256(raw) {
  return crypto.createHash('sha256').update(String(raw || ''), 'utf8').digest('hex');
}

function claimRecord(request, raw, runId) {
  return {
    schema: CLAIM_SCHEMA,
    bridgeVersion: CHATGPT_GITHUB_AGENT_VERSION,
    requestId: request.id,
    operation: request.operation,
    requestSha256: requestSha256(raw),
    agentRunId: runId,
    claimedAt: new Date().toISOString(),
    authority: 'TRANSPORT_ONLY_NO_AUTHORITY'
  };
}

function responseRecord(request, { result = null, error = null, state = null } = {}) {
  const failed = Boolean(error) || state === 'FAILED';
  return {
    schema: RESPONSE_SCHEMA,
    bridgeVersion: CHATGPT_GITHUB_AGENT_VERSION,
    requestId: request.id,
    operation: request.operation,
    state: failed ? 'FAILED' : 'COMPLETE',
    completedAt: new Date().toISOString(),
    authority: 'TRANSPORT_ONLY_NO_AUTHORITY',
    result: failed ? null : result,
    error: failed ? String(error || 'LOCAL_EXECUTION_FAILED').slice(0, 1000) : null
  };
}

function failedResponseForId(id, operation, error) {
  return {
    schema: RESPONSE_SCHEMA,
    bridgeVersion: CHATGPT_GITHUB_AGENT_VERSION,
    requestId: safeRequestId(id),
    operation: ALLOWED_OPERATIONS.has(operation) ? operation : null,
    state: 'FAILED',
    completedAt: new Date().toISOString(),
    authority: 'TRANSPORT_ONLY_NO_AUTHORITY',
    result: null,
    error: String(error || 'INVALID_REQUEST').slice(0, 1000)
  };
}

async function executeBridgeOperation(bridge, request) {
  switch (request.operation) {
    case 'bridge.status':
      return bridge.status();
    case 'vessie.observe':
      return bridge.observeVessie();
    case 'vessie.ask':
      return bridge.askVessie(request.payload.message);
    case 'vessie.resume':
      return bridge.resumeVessie(request.payload.taskId);
    case 'domistika.status':
      return bridge.domistikaStatus();
    case 'domistika.observe':
      return bridge.observeDomistika();
    case 'domistika.capabilities':
      return bridge.domistikaCapabilities();
    case 'domistika.capture':
      return bridge.captureDomistika(request.payload);
    case 'domistika.draw':
      return bridge.drawDomistika(request.payload.recipe, {
        sessionId: request.payload.sessionId,
        passName: request.payload.passName,
        returnCapture: request.payload.returnCapture,
        includeImage: request.payload.includeImage,
        captureScope: request.payload.captureScope,
        postSaveAction: request.payload.postSaveAction
      });
    default:
      throw new Error('GITHUB_BRIDGE_OPERATION_NOT_ALLOWED');
  }
}

async function defaultGit(cwd, args) {
  try {
    const { stdout = '' } = await execFileAsync('git', args, {
      cwd,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024
    });
    return String(stdout);
  } catch (error) {
    const wrapped = new Error(String(error?.stderr || error?.message || 'GIT_COMMAND_FAILED').trim());
    wrapped.code = error?.code;
    wrapped.stdout = String(error?.stdout || '');
    wrapped.stderr = String(error?.stderr || '');
    throw wrapped;
  }
}

class GitMailbox {
  constructor({
    directory,
    repository = DEFAULT_REPOSITORY,
    branch = DEFAULT_BRANCH,
    fsImpl = fs,
    gitImpl = defaultGit
  } = {}) {
    this.directory = path.resolve(String(directory || defaultMailboxDir()));
    this.repository = normalizeRepository(repository);
    this.branch = String(branch || DEFAULT_BRANCH).trim() || DEFAULT_BRANCH;
    if (!/^[A-Za-z0-9._/-]+$/.test(this.branch)) throw new Error('INVALID_GITHUB_BRIDGE_BRANCH');
    this.fs = fsImpl;
    this.gitImpl = gitImpl;
  }

  git(args) {
    return this.gitImpl(this.directory, args);
  }

  relative(kind, id) {
    if (!['requests', 'claims', 'responses'].includes(kind)) throw new Error('INVALID_MAILBOX_KIND');
    return `${kind}/${safeRequestId(id)}.json`;
  }

  absolute(relativePath) {
    const full = path.resolve(this.directory, relativePath);
    const root = this.directory.endsWith(path.sep) ? this.directory : this.directory + path.sep;
    if (!full.startsWith(root)) throw new Error('MAILBOX_PATH_ESCAPE');
    return full;
  }

  async exists(relativePath) {
    try {
      await this.fs.access(this.absolute(relativePath));
      return true;
    } catch (error) {
      if (error?.code === 'ENOENT') return false;
      throw error;
    }
  }

  async readText(relativePath) {
    const file = this.absolute(relativePath);
    const stat = await this.fs.stat(file);
    if (!stat.isFile()) throw new Error('MAILBOX_ENTRY_NOT_FILE');
    if (stat.size > MAX_REQUEST_BYTES) throw new Error('MAILBOX_ENTRY_TOO_LARGE');
    return this.fs.readFile(file, 'utf8');
  }

  async readJson(relativePath) {
    return JSON.parse(await this.readText(relativePath));
  }

  async writeJson(relativePath, value) {
    const file = this.absolute(relativePath);
    await this.fs.mkdir(path.dirname(file), { recursive: true });
    await this.fs.writeFile(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
  }

  async assertRepository() {
    await this.fs.stat(path.join(this.directory, '.git'));
    const origin = (await this.git(['remote', 'get-url', 'origin'])).trim();
    const actual = repositoryFromRemote(origin);
    if (actual.toLowerCase() !== this.repository.toLowerCase()) throw new Error('GITHUB_BRIDGE_ORIGIN_MISMATCH');
    return actual;
  }

  async assertClean() {
    const status = (await this.git(['status', '--porcelain'])).trim();
    if (status) throw new Error('GITHUB_BRIDGE_WORKTREE_DIRTY');
  }

  async sync() {
    await this.assertRepository();
    await this.assertClean();
    await this.git(['fetch', 'origin', this.branch]);
    await this.git(['checkout', this.branch]);
    await this.git(['merge', '--ff-only', `origin/${this.branch}`]);
  }

  async listRequestIds() {
    const dir = this.absolute('requests');
    let names;
    try {
      names = await this.fs.readdir(dir);
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
    return names
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.slice(0, -5))
      .filter((id) => {
        try { safeRequestId(id); return true; } catch { return false; }
      })
      .sort();
  }

  async commitAndPush(relativePaths, message) {
    const paths = [...new Set(relativePaths)];
    await this.git(['add', '--', ...paths]);
    const status = (await this.git(['status', '--porcelain', '--', ...paths])).trim();
    if (!status) return false;

    await this.git([
      '-c', 'user.name=Browsallax Bridge',
      '-c', 'user.email=browsallax-bridge@users.noreply.github.com',
      'commit', '-m', message, '--', ...paths
    ]);

    try {
      await this.git(['push', 'origin', `HEAD:${this.branch}`]);
    } catch (error) {
      await this.git(['pull', '--rebase', 'origin', this.branch]);
      await this.git(['push', 'origin', `HEAD:${this.branch}`]);
    }
    return true;
  }
}

class ChatGPTGitHubMailboxAgent {
  constructor({ mailbox, bridge, pollMs = DEFAULT_POLL_MS, runId = crypto.randomUUID() } = {}) {
    if (!mailbox) throw new Error('GITHUB_MAILBOX_REQUIRED');
    if (!bridge) throw new Error('CHATGPT_BROWSALLAX_BRIDGE_REQUIRED');
    this.mailbox = mailbox;
    this.bridge = bridge;
    this.pollMs = Math.max(500, Math.min(30000, Number(pollMs) || DEFAULT_POLL_MS));
    this.runId = String(runId);
  }

  static async connect(options = {}) {
    const bridge = options.bridge || await ChatGPTBrowsallaxBridge.connect(options);
    const mailbox = options.mailbox || new GitMailbox(options);
    await mailbox.sync();
    return new ChatGPTGitHubMailboxAgent({ ...options, bridge, mailbox });
  }

  async failWithoutExecution(id, operation, error) {
    const responsePath = this.mailbox.relative('responses', id);
    await this.mailbox.writeJson(responsePath, failedResponseForId(id, operation, error));
    await this.mailbox.commitAndPush([responsePath], `bridge: fail request ${id}`);
    return { handled: true, id, operation, ok: false, error: String(error) };
  }

  async processRequest(id) {
    const requestPath = this.mailbox.relative('requests', id);
    const claimPath = this.mailbox.relative('claims', id);
    const responsePath = this.mailbox.relative('responses', id);

    if (await this.mailbox.exists(responsePath)) return { handled: false };

    let raw;
    let parsed;
    try {
      raw = await this.mailbox.readText(requestPath);
      parsed = JSON.parse(raw);
    } catch (error) {
      return this.failWithoutExecution(id, null, error?.message || 'INVALID_REQUEST_JSON');
    }

    let request;
    try {
      request = normalizeRequest(parsed, { expectedId: id });
    } catch (error) {
      return this.failWithoutExecution(id, String(parsed?.operation || ''), error?.message || 'INVALID_REQUEST');
    }

    if (await this.mailbox.exists(claimPath)) {
      const existing = await this.mailbox.readJson(claimPath).catch(() => null);
      if (!existing || existing.agentRunId !== this.runId) {
        return this.failWithoutExecution(
          id,
          request.operation,
          'INDETERMINATE_PREVIOUS_CLAIM_NO_REPLAY'
        );
      }
    } else {
      const claim = claimRecord(request, raw, this.runId);
      await this.mailbox.writeJson(claimPath, claim);
      await this.mailbox.commitAndPush([claimPath], `bridge: claim request ${id}`);
    }

    try {
      const result = await executeBridgeOperation(this.bridge, request);
      await this.mailbox.writeJson(responsePath, responseRecord(request, { result }));
      await this.mailbox.commitAndPush([responsePath], `bridge: complete request ${id}`);
      return { handled: true, id, operation: request.operation, ok: true };
    } catch (error) {
      const message = String(error?.code || error?.message || 'LOCAL_EXECUTION_FAILED').slice(0, 1000);
      await this.mailbox.writeJson(responsePath, responseRecord(request, { error: message }));
      await this.mailbox.commitAndPush([responsePath], `bridge: fail request ${id}`);
      return { handled: true, id, operation: request.operation, ok: false, error: message };
    }
  }

  async runOnce() {
    await this.mailbox.sync();
    const ids = await this.mailbox.listRequestIds();
    for (const id of ids) {
      const responsePath = this.mailbox.relative('responses', id);
      if (await this.mailbox.exists(responsePath)) continue;
      return this.processRequest(id);
    }
    return { handled: false };
  }

  async runForever({ signal, onEvent } = {}) {
    while (!signal?.aborted) {
      try {
        const outcome = await this.runOnce();
        onEvent?.({ type: 'poll', ...outcome });
      } catch (error) {
        onEvent?.({ type: 'error', error: String(error?.message || error || 'GITHUB_BRIDGE_AGENT_ERROR') });
      }

      if (signal?.aborted) break;
      await new Promise((resolve) => setTimeout(resolve, this.pollMs));
    }
  }
}

module.exports = {
  CHATGPT_GITHUB_AGENT_VERSION,
  REQUEST_SCHEMA,
  CLAIM_SCHEMA,
  RESPONSE_SCHEMA,
  DEFAULT_REPOSITORY,
  DEFAULT_BRANCH,
  DEFAULT_POLL_MS,
  MAX_REQUEST_BYTES,
  MAX_TTL_MS,
  ALLOWED_OPERATIONS,
  defaultMailboxDir,
  normalizeRepository,
  repositoryFromRemote,
  safeRequestId,
  normalizePayload,
  normalizeRequest,
  requestSha256,
  claimRecord,
  responseRecord,
  failedResponseForId,
  executeBridgeOperation,
  GitMailbox,
  ChatGPTGitHubMailboxAgent
};
