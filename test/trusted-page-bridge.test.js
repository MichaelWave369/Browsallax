const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TRUSTED_PAGE_BRIDGE_VERSION,
  isTrustedPageUrl,
  trustedOrigins,
  normalizePageTaskSpec,
  publicPageBridgeManifest,
  ownerKey
} = require('../src/operator/trusted-page');

test('canonical Super PhiVessel origin is trusted exactly', () => {
  assert.equal(
    isTrustedPageUrl('https://superphivessel.netlify.app/settings'),
    true
  );
  assert.equal(
    isTrustedPageUrl('https://superphivessel.netlify.app.evil.example/'),
    false
  );
  assert.equal(
    isTrustedPageUrl('http://superphivessel.netlify.app/'),
    false
  );
});

test('extra trusted origins require explicit environment configuration', () => {
  const env = {
    BROWSALLAX_TRUSTED_PAGE_ORIGINS: 'http://localhost:4173,https://dev.example.test'
  };
  const origins = trustedOrigins(env);
  assert.equal(origins.has('http://localhost:4173'), true);
  assert.equal(isTrustedPageUrl('http://localhost:4173/service', env), true);
  assert.equal(isTrustedPageUrl('http://localhost:3000/', env), false);
});

test('page task spec permits only bounded http/https work', () => {
  const spec = normalizePageTaskSpec({
    url: 'https://example.com/path',
    goal: 'Verify the page',
    constraints: ['Do not delete anything'],
    acceptance: [{ kind: 'text_contains', value: 'Example' }],
    completeOnInitialAcceptance: true,
    maxSteps: 999,
    maxDurationMs: 999999999
  });

  assert.equal(spec.url, 'https://example.com/path');
  assert.equal(spec.maxSteps, 40);
  assert.equal(spec.maxDurationMs, 10 * 60 * 1000);
  assert.equal(spec.completeOnInitialAcceptance, true);
  assert.throws(
    () => normalizePageTaskSpec({ url: 'file:///etc/passwd', goal: 'read it' }),
    /PAGE_TASK_URL_UNSAFE/
  );
});

test('page bridge manifest advertises no tab or authority escalation', () => {
  const manifest = publicPageBridgeManifest();
  assert.equal(manifest.version, TRUSTED_PAGE_BRIDGE_VERSION);
  assert.equal(manifest.authority.invariant, 'CAPABILITY != AUTHORITY');
  assert.equal(manifest.authority.pageCanGrantAuthority, false);
  assert.equal(manifest.authority.arbitraryTabAccess, false);
  assert.equal(manifest.authority.bearerTokenExposed, false);
  assert.equal(manifest.authority.dedicatedTaskTabOnly, true);
  assert.equal(manifest.initialAcceptanceShortCircuit.supported, true);
  assert.equal(manifest.initialAcceptanceShortCircuit.deterministicAssertionsOnly, true);
  assert.equal(manifest.initialAcceptanceShortCircuit.authority, 'NONE');
});

test('task ownership is scoped to origin and webContents identity', () => {
  assert.equal(
    ownerKey('https://superphivessel.netlify.app', 7),
    'https://superphivessel.netlify.app::7'
  );
  assert.notEqual(
    ownerKey('https://superphivessel.netlify.app', 7),
    ownerKey('https://superphivessel.netlify.app', 8)
  );
});


test('trusted page task spec accepts only bounded Brain Registry planner hints', () => {
  const spec = normalizePageTaskSpec({
    url: 'https://example.com/',
    goal: 'Read the page',
    plannerRegistry: {
      schema: 'superphivessel.brain_registry.planner_hints.v1',
      registryVersion: '1.1',
      routerVersion: '1.2.0',
      routingMode: 'AUTO',
      role: 'utility',
      approvedModels: ['qwen3:4b'],
      recommendedModel: 'qwen3:4b',
      candidates: [{ model: 'qwen3:4b', score: 0.9 }]
    }
  });

  assert.equal(spec.plannerRegistry.registryVersion, '1.1');
  assert.equal(spec.plannerRegistry.recommendedModel, 'qwen3:4b');
  assert.deepEqual(spec.plannerRegistry.approvedModels, ['qwen3:4b']);

  assert.throws(
    () => normalizePageTaskSpec({
      url: 'https://example.com/',
      goal: 'Read the page',
      plannerRegistry: { schema: 'evil.registry.v9' }
    }),
    /PLANNER_REGISTRY_HINT_SCHEMA_INVALID/
  );
});

test('page bridge exposes planner hints as advisory and not executor authority', () => {
  const manifest = publicPageBridgeManifest();
  assert.equal(manifest.authority.pageCanSelectExecutor, false);
  assert.equal(manifest.authority.plannerHintsAreAdvisory, true);
  assert.equal(manifest.plannerRegistryHints.supported, true);
  assert.equal(manifest.plannerRegistryHints.version, 'PV-BOP-BRR-0.1');
});


test('initial acceptance short-circuit requires an actual acceptance assertion', () => {
  const spec = normalizePageTaskSpec({
    url: 'https://example.com/',
    goal: 'No deterministic acceptance supplied',
    completeOnInitialAcceptance: true
  });
  assert.equal(spec.completeOnInitialAcceptance, false);
});
