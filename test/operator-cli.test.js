const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseArgs,
  acceptanceFromFlags,
  helpText
} = require('../src/client/cli');

test('CLI parser preserves repeated constraints and acceptance flags', () => {
  const parsed = parseArgs([
    'task',
    '--tab', '1',
    '--url', 'https://superphivessel.netlify.app/',
    '--goal', 'Run acceptance',
    '--constraint', 'Do not delete data',
    '--constraint', 'Do not alter provider settings',
    '--accept-text', 'READY',
    '--accept-visible', '#operator-grant'
  ]);

  assert.equal(parsed.command, 'task');
  assert.equal(parsed.flags.tab, '1');
  assert.equal(parsed.flags.url, 'https://superphivessel.netlify.app/');
  assert.deepEqual(parsed.flags.constraint, [
    'Do not delete data',
    'Do not alter provider settings'
  ]);
  assert.deepEqual(acceptanceFromFlags(parsed.flags), [
    { kind: 'text_contains', value: 'READY' },
    { kind: 'visible', selector: '#operator-grant' }
  ]);
});

test('CLI help documents bridge and task controls', () => {
  const help = helpText();
  assert.match(help, /bridge-manifest/);
  assert.match(help, /task-resume/);
  assert.match(help, /--accept-text/);
  assert.match(help, /BROWSALLAX_ENDPOINT_FILE/);
});
