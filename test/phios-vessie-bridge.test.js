const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PhiBrowserBridge,
  bridgeManifest,
  mapTaskDisposition
} = require('../src/bridge/phios-vessie');

function completeTask() {
  return {
    id: 'task-1',
    tabId: 1,
    status: 'COMPLETE',
    stepCount: 3,
    held: null,
    result: {
      summary: 'Acceptance passed.',
      verification: {
        pass: true,
        mode: 'DETERMINISTIC_ASSERTIONS',
        checks: [{ assertion: { kind: 'text_contains', value: 'READY' }, pass: true }]
      }
    },
    error: null,
    planner: { provider: 'OLLAMA_LOCAL', model: 'qwen3:4b' },
    updatedAt: '2026-09-25T00:00:00.000Z',
    finishedAt: '2026-09-25T00:00:01.000Z'
  };
}

test('bridge manifest cannot grant authority', () => {
  const manifest = bridgeManifest();
  assert.equal(manifest.authority.invariant, 'CAPABILITY != AUTHORITY');
  assert.equal(manifest.authority.bridgeCanGrantAuthority, false);
  assert.deepEqual(manifest.authority.hardHeld, ['SENSITIVE_ACTION']);
});

test('bridge performs governed starting navigation before task submission', async () => {
  const calls = [];
  const fakeClient = {
    navigate: async (tabId, url) => {
      calls.push(['navigate', tabId, url]);
      return { ok: true, receipt: { receipt_hash: 'nav' } };
    },
    createTask: async (spec) => {
      calls.push(['createTask', spec]);
      return { task: { ...completeTask(), status: 'QUEUED', result: null, stepCount: 0 } };
    }
  };

  const bridge = new PhiBrowserBridge(fakeClient);
  const envelope = await bridge.submitTask({
    tabId: 1,
    url: 'https://superphivessel.netlify.app/',
    goal: 'Run acceptance',
    acceptance: [{ kind: 'text_contains', value: 'Super Φ.Vessel' }]
  });

  assert.deepEqual(calls[0], ['navigate', 1, 'https://superphivessel.netlify.app/']);
  assert.equal(calls[1][0], 'createTask');
  assert.equal(Object.prototype.hasOwnProperty.call(calls[1][1], 'url'), false);
  assert.equal(envelope.payload.navigation.receipt.receipt_hash, 'nav');
  assert.equal(envelope.authority, 'BRIDGE_ONLY_NO_AUTHORITY_ESCALATION');
});

test('runTask returns deterministic verification and navigation provenance', async () => {
  const fakeClient = {
    navigate: async () => ({ ok: true, receipt: { receipt_hash: 'nav-run' } }),
    runTask: async (spec) => {
      assert.equal(Object.prototype.hasOwnProperty.call(spec, 'url'), false);
      return completeTask();
    }
  };

  const bridge = new PhiBrowserBridge(fakeClient);
  const envelope = await bridge.runTask({
    tabId: 1,
    url: 'https://superphivessel.netlify.app/',
    goal: 'Verify READY'
  });

  assert.equal(envelope.payload.disposition, 'COMPLETE');
  assert.equal(envelope.payload.navigation.receipt.receipt_hash, 'nav-run');
  assert.equal(envelope.payload.task.result.verificationMode, 'DETERMINISTIC_ASSERTIONS');
  assert.equal(envelope.payload.task.result.verified, true);
});

test('waitTask does not invent navigation provenance', async () => {
  const bridge = new PhiBrowserBridge({
    waitForTask: async () => completeTask()
  });

  const envelope = await bridge.waitTask('task-1');
  assert.equal(envelope.payload.disposition, 'COMPLETE');
  assert.equal(Object.prototype.hasOwnProperty.call(envelope.payload, 'navigation'), false);
});

test('task status maps to bridge disposition without upgrading failed verification', () => {
  assert.equal(mapTaskDisposition(completeTask()), 'COMPLETE');
  const failedVerification = completeTask();
  failedVerification.result.verification.pass = false;
  assert.equal(mapTaskDisposition(failedVerification), 'FAILED');
  assert.equal(mapTaskDisposition({ status: 'HELD' }), 'HELD');
  assert.equal(mapTaskDisposition({ status: 'RUNNING' }), 'IN_PROGRESS');
});
