const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BRAIN_REGISTRY_ROUTER_VERSION,
  REGISTRY_HINT_SCHEMA,
  normalizePlannerRegistryHint,
  selectPlannerModel,
  registryRouteReceipt
} = require('../src/operator/brain-registry-router');

function hint(overrides = {}) {
  return normalizePlannerRegistryHint({
    schema: REGISTRY_HINT_SCHEMA,
    registryVersion: '1.1',
    routerVersion: '1.2.0',
    routingMode: 'AUTO',
    role: 'utility',
    approvedModels: ['qwen3:4b', 'gemma3:12b'],
    configuredModel: 'gemma3:12b',
    recommendedModel: 'qwen3:4b',
    candidates: [
      { model: 'qwen3:4b', score: 0.93 },
      { model: 'gemma3:12b', score: 0.84 }
    ],
    ...overrides
  });
}

const local = [
  { name: 'qwen3:4b', size: 3_000_000_000 },
  { name: 'gemma3:12b', size: 8_000_000_000 },
  { name: 'qwen3-coder:30b', size: 18_000_000_000 }
];

test('normalizes the bounded Super PhiVessel planner hint schema', () => {
  const row = hint();
  assert.equal(BRAIN_REGISTRY_ROUTER_VERSION, 'PV-BOP-BRR-0.1');
  assert.equal(row.schema, REGISTRY_HINT_SCHEMA);
  assert.equal(row.registryVersion, '1.1');
  assert.equal(row.routerVersion, '1.2.0');
  assert.equal(row.routingMode, 'AUTO');
  assert.equal(row.role, 'utility');
  assert.deepEqual(row.approvedModels, ['qwen3:4b', 'gemma3:12b']);
  assert.equal(row.candidates.length, 2);
});

test('rejects unknown planner registry hint schemas', () => {
  assert.throws(
    () => normalizePlannerRegistryHint({ schema: 'invented.v99' }),
    /PLANNER_REGISTRY_HINT_SCHEMA_INVALID/
  );
});

test('registry recommendation must be both approved and installed locally', () => {
  const selected = selectPlannerModel({
    localModels: local,
    registryHint: hint(),
    fallbackModels: ['qwen3-coder:30b']
  });
  assert.equal(selected.model, 'qwen3:4b');
  assert.equal(selected.basis, 'REGISTRY_RECOMMENDED');
  assert.equal(selected.registryUsed, true);
});

test('falls through registry candidates when recommendation is not installed', () => {
  const selected = selectPlannerModel({
    localModels: local,
    registryHint: hint({
      recommendedModel: 'missing:99b',
      candidates: [
        { model: 'missing:99b', score: 1 },
        { model: 'gemma3:12b', score: 0.8 }
      ]
    })
  });
  assert.equal(selected.model, 'gemma3:12b');
  assert.equal(selected.basis, 'REGISTRY_CANDIDATE');
});

test('never escapes the approved registry pool merely because another local model exists', () => {
  const selected = selectPlannerModel({
    localModels: local,
    registryHint: hint({
      approvedModels: ['missing:99b'],
      recommendedModel: 'qwen3-coder:30b',
      candidates: [{ model: 'qwen3-coder:30b', score: 1 }]
    }),
    fallbackModels: ['qwen3-coder:30b']
  });
  assert.equal(selected.model, null);
  assert.equal(selected.basis, 'NO_LOCAL_REGISTRY_APPROVED_PLANNER_MODEL');
  assert.equal(selected.registryUsed, true);
});

test('local operator configured model overrides page-supplied registry hints but must be installed', () => {
  const selected = selectPlannerModel({
    localModels: local,
    registryHint: hint(),
    configuredModel: 'qwen3-coder:30b',
    fallbackModels: ['qwen3:4b']
  });
  assert.equal(selected.model, 'qwen3-coder:30b');
  assert.equal(selected.basis, 'LOCAL_OPERATOR_OVERRIDE');
  assert.equal(selected.registryUsed, false);

  const missing = selectPlannerModel({
    localModels: local,
    registryHint: hint(),
    configuredModel: 'missing:99b'
  });
  assert.equal(missing.model, null);
  assert.equal(missing.basis, 'LOCAL_OPERATOR_OVERRIDE_NOT_INSTALLED');
});

test('legacy local fallback remains available when no registry hint is supplied', () => {
  const selected = selectPlannerModel({
    localModels: local,
    fallbackModels: ['missing:1b', 'qwen3:4b']
  });
  assert.equal(selected.model, 'qwen3:4b');
  assert.equal(selected.basis, 'LOCAL_FALLBACK_PREFERENCE');
  assert.equal(selected.registryUsed, false);
});

test('route receipt exposes selection provenance without granting authority', () => {
  const row = hint();
  const selection = selectPlannerModel({
    localModels: local,
    registryHint: row
  });
  const receipt = registryRouteReceipt(selection, row);
  assert.equal(receipt.version, 'PV-BOP-BRR-0.1');
  assert.equal(receipt.selectedModel, 'qwen3:4b');
  assert.equal(receipt.selectionBasis, 'REGISTRY_RECOMMENDED');
  assert.equal(receipt.registryVersion, '1.1');
  assert.equal(receipt.routerVersion, '1.2.0');
  assert.equal(receipt.approvedPoolCount, 2);
  assert.equal(receipt.candidateCount, 2);
});
