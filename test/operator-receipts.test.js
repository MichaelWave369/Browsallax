const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { OperatorReceiptLedger } = require('../src/operator/receipts');

test('operator receipts are hash-chained in append order', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'browsallax-operator-'));
  const ledger = new OperatorReceiptLedger(dir);
  const first = await ledger.append('OBSERVATION', { tabId: 1 });
  const second = await ledger.append('ASSERTION', { pass: true });
  assert.equal(first.previous_hash, null);
  assert.equal(second.previous_hash, first.receipt_hash);
  assert.match(first.receipt_hash, /^[a-f0-9]{64}$/);
  const lines = (await fs.readFile(ledger.filePath, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 2);
});
