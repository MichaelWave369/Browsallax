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
    maxSteps: 999,
    maxDurationMs: 999999999
  });

  assert.equal(spec.url, 'https://example.com/path');
  assert.equal(spec.maxSteps, 40);
  assert.equal(spec.maxDurationMs, 10 * 60 * 1000);
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
