const BRAIN_REGISTRY_ROUTER_VERSION = 'PV-BOP-BRR-0.1';
const REGISTRY_HINT_SCHEMA = 'superphivessel.brain_registry.planner_hints.v1';
const MAX_REGISTRY_MODELS = 32;
const MAX_REGISTRY_CANDIDATES = 16;

function cleanModelName(value) {
  return String(value || '').trim().slice(0, 240);
}

function uniqueModels(values = [], limit = MAX_REGISTRY_MODELS) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const model = cleanModelName(value);
    if (!model || seen.has(model)) continue;
    seen.add(model);
    out.push(model);
    if (out.length >= limit) break;
  }
  return out;
}

function normalizeRegistryCandidate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const model = cleanModelName(value.model || value.name);
  if (!model) return null;
  const score = Number(value.score);
  return {
    model,
    score: Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : null
  };
}

function normalizePlannerRegistryHint(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;

  const schema = String(input.schema || '').trim();
  if (schema !== REGISTRY_HINT_SCHEMA) {
    const error = new Error('PLANNER_REGISTRY_HINT_SCHEMA_INVALID');
    error.code = 'PLANNER_REGISTRY_HINT_SCHEMA_INVALID';
    throw error;
  }

  const approvedModels = uniqueModels(Array.isArray(input.approvedModels) ? input.approvedModels : []);
  const candidates = [];
  const candidateSeen = new Set();
  for (const row of Array.isArray(input.candidates) ? input.candidates : []) {
    const candidate = normalizeRegistryCandidate(row);
    if (!candidate || candidateSeen.has(candidate.model)) continue;
    candidateSeen.add(candidate.model);
    candidates.push(candidate);
    if (candidates.length >= MAX_REGISTRY_CANDIDATES) break;
  }

  const recommendedModel = cleanModelName(input.recommendedModel);
  const configuredModel = cleanModelName(input.configuredModel);
  const routingMode = String(input.routingMode || '').trim().toUpperCase().slice(0, 32) || 'UNKNOWN';
  const role = String(input.role || 'utility').trim().slice(0, 64) || 'utility';

  return {
    schema: REGISTRY_HINT_SCHEMA,
    bridgeVersion: BRAIN_REGISTRY_ROUTER_VERSION,
    registryVersion: String(input.registryVersion || '').trim().slice(0, 64) || null,
    routerVersion: String(input.routerVersion || '').trim().slice(0, 64) || null,
    routingMode,
    role,
    approvedModels,
    configuredModel: configuredModel || null,
    recommendedModel: recommendedModel || null,
    candidates
  };
}

function localModelNames(models = []) {
  return uniqueModels(models.map((entry) => (
    typeof entry === 'string' ? entry : entry?.name || entry?.model
  )), 256);
}

function selectPlannerModel({
  localModels = [],
  registryHint = null,
  configuredModel = '',
  fallbackModels = []
} = {}) {
  const local = new Set(localModelNames(localModels));
  const operatorConfigured = cleanModelName(configuredModel);

  if (operatorConfigured) {
    return local.has(operatorConfigured)
      ? {
          model: operatorConfigured,
          basis: 'LOCAL_OPERATOR_OVERRIDE',
          registryUsed: false,
          registryVersion: registryHint?.registryVersion || null,
          routerVersion: registryHint?.routerVersion || null
        }
      : {
          model: null,
          basis: 'LOCAL_OPERATOR_OVERRIDE_NOT_INSTALLED',
          registryUsed: false,
          registryVersion: registryHint?.registryVersion || null,
          routerVersion: registryHint?.routerVersion || null
        };
  }

  if (registryHint) {
    const approved = new Set(registryHint.approvedModels || []);
    const allowedLocal = new Set([...local].filter((name) => approved.has(name)));

    const recommended = cleanModelName(registryHint.recommendedModel);
    if (recommended && allowedLocal.has(recommended)) {
      return {
        model: recommended,
        basis: 'REGISTRY_RECOMMENDED',
        registryUsed: true,
        registryVersion: registryHint.registryVersion,
        routerVersion: registryHint.routerVersion
      };
    }

    for (const candidate of registryHint.candidates || []) {
      if (allowedLocal.has(candidate.model)) {
        return {
          model: candidate.model,
          basis: 'REGISTRY_CANDIDATE',
          registryUsed: true,
          registryVersion: registryHint.registryVersion,
          routerVersion: registryHint.routerVersion
        };
      }
    }

    const configuredFromRegistry = cleanModelName(registryHint.configuredModel);
    if (configuredFromRegistry && allowedLocal.has(configuredFromRegistry)) {
      return {
        model: configuredFromRegistry,
        basis: 'REGISTRY_CONFIGURED_ROLE',
        registryUsed: true,
        registryVersion: registryHint.registryVersion,
        routerVersion: registryHint.routerVersion
      };
    }

    return {
      model: null,
      basis: 'NO_LOCAL_REGISTRY_APPROVED_PLANNER_MODEL',
      registryUsed: true,
      registryVersion: registryHint.registryVersion,
      routerVersion: registryHint.routerVersion
    };
  }

  for (const name of uniqueModels(fallbackModels, 64)) {
    if (local.has(name)) {
      return {
        model: name,
        basis: 'LOCAL_FALLBACK_PREFERENCE',
        registryUsed: false,
        registryVersion: null,
        routerVersion: null
      };
    }
  }

  const smallest = (localModels || [])
    .map((entry) => ({
      name: cleanModelName(entry?.name || entry?.model || entry),
      size: Number(entry?.size || Number.MAX_SAFE_INTEGER)
    }))
    .filter((entry) => entry.name && local.has(entry.name))
    .sort((a, b) => a.size - b.size || a.name.localeCompare(b.name))[0];

  return {
    model: smallest?.name || null,
    basis: smallest ? 'LOCAL_SMALLEST_FALLBACK' : 'NO_LOCAL_PLANNER_MODEL',
    registryUsed: false,
    registryVersion: null,
    routerVersion: null
  };
}

function registryRouteReceipt(selection, hint) {
  return {
    version: BRAIN_REGISTRY_ROUTER_VERSION,
    schema: REGISTRY_HINT_SCHEMA,
    registryUsed: Boolean(selection?.registryUsed),
    selectionBasis: String(selection?.basis || 'UNKNOWN'),
    selectedModel: selection?.model || null,
    registryVersion: selection?.registryVersion || hint?.registryVersion || null,
    routerVersion: selection?.routerVersion || hint?.routerVersion || null,
    routingMode: hint?.routingMode || null,
    role: hint?.role || null,
    approvedPoolCount: Array.isArray(hint?.approvedModels) ? hint.approvedModels.length : 0,
    candidateCount: Array.isArray(hint?.candidates) ? hint.candidates.length : 0
  };
}

module.exports = {
  BRAIN_REGISTRY_ROUTER_VERSION,
  REGISTRY_HINT_SCHEMA,
  MAX_REGISTRY_MODELS,
  MAX_REGISTRY_CANDIDATES,
  cleanModelName,
  uniqueModels,
  normalizeRegistryCandidate,
  normalizePlannerRegistryHint,
  localModelNames,
  selectPlannerModel,
  registryRouteReceipt
};
