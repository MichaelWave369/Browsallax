const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

class OperatorReceiptLedger {
  constructor(userDataPath) {
    this.filePath = path.join(userDataPath, 'reality-ledger', 'browser-operator.jsonl');
    this.sequence = 0;
    this.previousHash = null;
    this.queue = Promise.resolve();
  }

  append(kind, data = {}) {
    const task = async () => {
      const base = {
        schema: 'browsallax.operator.receipt.v1',
        kind,
        sequence: ++this.sequence,
        timestamp: new Date().toISOString(),
        previous_hash: this.previousHash,
        data: stable(data)
      };
      const canonical = JSON.stringify(stable(base));
      const receiptHash = crypto.createHash('sha256').update(canonical).digest('hex');
      const receipt = { ...base, receipt_hash: receiptHash };
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.appendFile(this.filePath, `${JSON.stringify(receipt)}\n`, 'utf8');
      this.previousHash = receiptHash;
      return receipt;
    };

    this.queue = this.queue.then(task, task);
    return this.queue;
  }
}

module.exports = { OperatorReceiptLedger };
