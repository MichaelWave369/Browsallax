const test = require('node:test');
const assert = require('node:assert/strict');
const { ACTION_CLASSES, classifyAction, evaluateAuthority } = require('../src/operator/policy');

test('read-only actions are allowed without a grant', () => {
  const authority = evaluateAuthority(ACTION_CLASSES.READ_ONLY, null);
  assert.equal(authority.allowed, true);
  assert.equal(authority.basis, 'BASELINE_LOCAL_OPERATOR');
});

test('navigation is allowed without a grant', () => {
  const cls = classifyAction({ type: 'click' }, { tagName: 'a', href: 'https://example.com', text: 'Example' });
  assert.equal(cls, ACTION_CLASSES.NAVIGATION);
  assert.equal(evaluateAuthority(cls, null).allowed, true);
});

test('typing requires a current human interactive grant', () => {
  const cls = classifyAction({ type: 'type' }, { tagName: 'input', text: '' });
  assert.equal(cls, ACTION_CLASSES.FORM_INPUT);
  assert.equal(evaluateAuthority(cls, null).held, true);
  assert.equal(evaluateAuthority(cls, { enabled: true, id: 'g1', expiresAt: Date.now() + 10000 }).allowed, true);
});

test('expired grants do not authorize mutation', () => {
  const authority = evaluateAuthority(ACTION_CLASSES.REMOTE_MUTATION, { enabled: true, id: 'g1', expiresAt: Date.now() - 1 });
  assert.equal(authority.allowed, false);
  assert.equal(authority.held, true);
});

test('sensitive click remains held even with human interactive grant', () => {
  const cls = classifyAction({ type: 'click' }, { tagName: 'button', text: 'Delete account' });
  assert.equal(cls, ACTION_CLASSES.SENSITIVE_ACTION);
  const authority = evaluateAuthority(cls, { enabled: true, id: 'g1', expiresAt: Date.now() + 10000 });
  assert.equal(authority.allowed, false);
  assert.equal(authority.held, true);
});

test('ordinary page button is remote mutation and grant-gated', () => {
  const cls = classifyAction({ type: 'click' }, { tagName: 'button', text: 'Open panel' });
  assert.equal(cls, ACTION_CLASSES.REMOTE_MUTATION);
  assert.equal(evaluateAuthority(cls, null).allowed, false);
  assert.equal(evaluateAuthority(cls, { enabled: true, id: 'g2', expiresAt: Date.now() + 10000 }).allowed, true);
});
