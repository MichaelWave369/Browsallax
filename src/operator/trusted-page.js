const {
  BRAIN_REGISTRY_ROUTER_VERSION,
  normalizePlannerRegistryHint
} = require('./brain-registry-router');

const TRUSTED_PAGE_BRIDGE_VERSION = 'PV-PAGE-0.1';
const DEFAULT_TRUSTED_ORIGINS = Object.freeze([
  'https://superphivessel.netlify.app'
]);

function normalizeOrigin(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function trustedOrigins(env = process.env) {
  const extras = String(env.BROWSALLAX_TRUSTED_PAGE_ORIGINS || '')
    .split(',')
    .map((value) => normalizeOrigin(value.trim()))
    .filter(Boolean);
  return new Set([...DEFAULT_TRUSTED_ORIGINS, ...extras]);
}

function isTrustedPageUrl(rawUrl, env = process.env) {
  const origin = normalizeOrigin(rawUrl);
  return Boolean(origin && trustedOrigins(env).has(origin));
}

function callerOrigin(rawUrl) {
  return normalizeOrigin(rawUrl);
}

function ownerKey(origin, webContentsId) {
  return `${String(origin || '')}::${Number(webContentsId)}`;
}

function normalizePageTaskSpec(input = {}) {
  const url = String(input.url || '').trim();
  const goal = String(input.goal || '').trim();
  if (!url) throw Object.assign(new Error('PAGE_TASK_URL_REQUIRED'), { statusCode: 400 });
  if (!goal) throw Object.assign(new Error('PAGE_TASK_GOAL_REQUIRED'), { statusCode: 400 });
  if (goal.length > 4000) throw Object.assign(new Error('PAGE_TASK_GOAL_TOO_LONG'), { statusCode: 400 });

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw Object.assign(new Error('PAGE_TASK_URL_INVALID'), { statusCode: 400 });
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw Object.assign(new Error('PAGE_TASK_URL_UNSAFE'), { statusCode: 400 });
  }

  const constraints = Array.isArray(input.constraints)
    ? input.constraints.map((value) => String(value).trim()).filter(Boolean).slice(0, 30)
    : [];
  const successCriteria = Array.isArray(input.successCriteria)
    ? input.successCriteria.map((value) => String(value).trim()).filter(Boolean).slice(0, 30)
    : [];
  const acceptance = Array.isArray(input.acceptance)
    ? input.acceptance.slice(0, 20)
    : [];
  const plannerRegistry = input.plannerRegistry
    ? normalizePlannerRegistryHint(input.plannerRegistry)
    : null;

  return {
    url: parsed.toString(),
    goal,
    constraints,
    successCriteria,
    acceptance,
    plannerRegistry,
    maxSteps: Math.max(1, Math.min(40, Number(input.maxSteps || 20))),
    maxDurationMs: Math.max(10000, Math.min(10 * 60 * 1000, Number(input.maxDurationMs || 180000))),
    closeOnTerminal: input.closeOnTerminal !== false
  };
}

function publicPageBridgeManifest() {
  return {
    schema: 'browsallax.trusted-page-bridge.manifest.v1',
    version: TRUSTED_PAGE_BRIDGE_VERSION,
    capability: 'DEDICATED_BROWSER_TASK',
    authority: {
      invariant: 'CAPABILITY != AUTHORITY',
      pageCanGrantAuthority: false,
      pageCanSelectExecutor: false,
      plannerHintsAreAdvisory: true,
      arbitraryTabAccess: false,
      bearerTokenExposed: false,
      dedicatedTaskTabOnly: true
    },
    trustedOrigins: [...DEFAULT_TRUSTED_ORIGINS],
    plannerRegistryHints: {
      supported: true,
      version: BRAIN_REGISTRY_ROUTER_VERSION
    },
    methods: [
      'manifest',
      'status',
      'startTask',
      'getTask',
      'resumeTask',
      'cancelTask'
    ]
  };
}

module.exports = {
  TRUSTED_PAGE_BRIDGE_VERSION,
  DEFAULT_TRUSTED_ORIGINS,
  normalizeOrigin,
  trustedOrigins,
  isTrustedPageUrl,
  callerOrigin,
  ownerKey,
  normalizePageTaskSpec,
  publicPageBridgeManifest
};
