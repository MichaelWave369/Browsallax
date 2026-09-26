const crypto = require('node:crypto');
const {
  BrowsallaxOperatorClient,
  CLIENT_VERSION
} = require('../client/operator-client');

const BRIDGE_VERSION = 'PV-BRIDGE-0.1';

function normalizeTaskSpec(input = {}) {
  const tabId = Number(input.tabId);
  const goal = String(input.goal || '').trim();
  if (!Number.isFinite(tabId)) throw new Error('BRIDGE_TAB_REQUIRED');
  if (!goal) throw new Error('BRIDGE_GOAL_REQUIRED');

  return {
    tabId,
    url: input.url ? String(input.url).trim() : null,
    goal,
    constraints: Array.isArray(input.constraints)
      ? input.constraints.map((value) => String(value).trim()).filter(Boolean)
      : [],
    successCriteria: Array.isArray(input.successCriteria)
      ? input.successCriteria.map((value) => String(value).trim()).filter(Boolean)
      : [],
    acceptance: Array.isArray(input.acceptance) ? input.acceptance : [],
    maxSteps: input.maxSteps,
    maxDurationMs: input.maxDurationMs
  };
}

function bridgeManifest() {
  return {
    schema: 'browsallax.phios-vessie-bridge.manifest.v1',
    bridgeVersion: BRIDGE_VERSION,
    clientVersion: CLIENT_VERSION,
    capability: 'BROWSER_OPERATOR',
    authority: {
      invariant: 'CAPABILITY != AUTHORITY',
      baseline: ['READ_ONLY', 'NAVIGATION'],
      humanGrantRequired: ['FORM_INPUT', 'REMOTE_MUTATION'],
      hardHeld: ['SENSITIVE_ACTION'],
      bridgeCanGrantAuthority: false
    },
    taskStates: ['QUEUED', 'RUNNING', 'HELD', 'COMPLETE', 'FAILED', 'CANCELLED'],
    verificationModes: ['PLANNER_DECLARED', 'DETERMINISTIC_ASSERTIONS'],
    methods: [
      'status',
      'plannerStatus',
      'observe',
      'screenshot',
      'submitTask',
      'waitTask',
      'runTask',
      'resumeTask',
      'cancelTask'
    ]
  };
}

function bridgeEnvelope(kind, payload, meta = {}) {
  return {
    schema: 'browsallax.phios-vessie-bridge.receipt.v1',
    bridgeVersion: BRIDGE_VERSION,
    bridgeReceiptId: crypto.randomUUID(),
    kind,
    timestamp: new Date().toISOString(),
    authority: 'BRIDGE_ONLY_NO_AUTHORITY_ESCALATION',
    ...meta,
    payload
  };
}

function summarizeTask(task) {
  if (!task) return null;
  const result = task.result || null;
  const verification = result?.verification || null;
  return {
    id: task.id,
    tabId: task.tabId,
    status: task.status,
    stepCount: task.stepCount,
    held: task.held || null,
    result: result
      ? {
          summary: result.summary || null,
          verificationMode: verification?.mode || null,
          verified: verification?.pass ?? null,
          checks: Array.isArray(verification?.checks) ? verification.checks : []
        }
      : null,
    error: task.error || null,
    planner: task.planner || null,
    updatedAt: task.updatedAt || null,
    finishedAt: task.finishedAt || null
  };
}

function mapTaskDisposition(task) {
  switch (task?.status) {
    case 'COMPLETE':
      return task?.result?.verification?.pass === false ? 'FAILED' : 'COMPLETE';
    case 'HELD':
      return 'HELD';
    case 'FAILED':
      return 'FAILED';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'QUEUED':
    case 'RUNNING':
      return 'IN_PROGRESS';
    default:
      return 'UNKNOWN';
  }
}

class PhiBrowserBridge {
  constructor(client) {
    this.client = client;
  }

  static async connect(options = {}) {
    const client = options.client || await BrowsallaxOperatorClient.connect(options);
    return new PhiBrowserBridge(client);
  }

  manifest() {
    return bridgeManifest();
  }

  async status(options = {}) {
    const [operator, planner] = await Promise.all([
      this.client.status(options),
      this.client.plannerStatus(options).catch((error) => ({
        ok: false,
        error: error?.code || error?.message || 'PLANNER_STATUS_FAILED'
      }))
    ]);

    return bridgeEnvelope('BRIDGE_STATUS', {
      bridge: bridgeManifest(),
      operator: {
        ...operator,
        endpoint: this.client.descriptor()
      },
      planner
    });
  }

  async plannerStatus(options = {}) {
    const response = await this.client.plannerStatus(options);
    return bridgeEnvelope('PLANNER_STATUS', response);
  }

  async observe(tabId, options = {}) {
    const response = await this.client.observe(tabId, options);
    return bridgeEnvelope('BROWSER_OBSERVATION', response, { tabId: Number(tabId) });
  }

  async screenshot(tabId, options = {}) {
    const response = await this.client.screenshot(tabId, options);
    return bridgeEnvelope('BROWSER_SCREENSHOT', response, { tabId: Number(tabId) });
  }

  async submitTask(input, options = {}) {
    const spec = normalizeTaskSpec(input);
    let navigation = null;
    if (spec.url) {
      navigation = await this.client.navigate(spec.tabId, spec.url, options);
    }
    const taskSpec = { ...spec };
    delete taskSpec.url;
    const response = await this.client.createTask(taskSpec, options);
    return bridgeEnvelope('TASK_SUBMITTED', {
      disposition: mapTaskDisposition(response.task),
      navigation,
      task: summarizeTask(response.task)
    }, {
      taskId: response.task?.id || null,
      tabId: spec.tabId
    });
  }

  async waitTask(id, options = {}) {
    const task = await this.client.waitForTask(id, options);
    return bridgeEnvelope('TASK_STATE', {
      disposition: mapTaskDisposition(task),
      navigation,
      task: summarizeTask(task)
    }, { taskId: id, tabId: task?.tabId ?? null });
  }

  async runTask(input, options = {}) {
    const spec = normalizeTaskSpec(input);
    let navigation = null;
    if (spec.url) {
      navigation = await this.client.navigate(spec.tabId, spec.url, options);
    }
    const taskSpec = { ...spec };
    delete taskSpec.url;
    const task = await this.client.runTask(taskSpec, options);
    return bridgeEnvelope('TASK_RESULT', {
      disposition: mapTaskDisposition(task),
      task: summarizeTask(task)
    }, {
      taskId: task?.id || null,
      tabId: spec.tabId
    });
  }

  async resumeTask(id, options = {}) {
    const response = await this.client.resumeTask(id, options);
    return bridgeEnvelope('TASK_RESUME_REQUESTED', {
      disposition: mapTaskDisposition(response.task),
      task: summarizeTask(response.task)
    }, { taskId: id, tabId: response.task?.tabId ?? null });
  }

  async cancelTask(id, reason = 'BRIDGE_CANCELLED', options = {}) {
    const response = await this.client.cancelTask(id, reason, options);
    return bridgeEnvelope('TASK_CANCELLED', {
      disposition: mapTaskDisposition(response.task),
      task: summarizeTask(response.task)
    }, { taskId: id, tabId: response.task?.tabId ?? null });
  }
}

module.exports = {
  BRIDGE_VERSION,
  PhiBrowserBridge,
  bridgeManifest,
  bridgeEnvelope,
  normalizeTaskSpec,
  summarizeTask,
  mapTaskDisposition
};
