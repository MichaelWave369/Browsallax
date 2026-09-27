const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CHATGPT_BROWSALLAX_BRIDGE_VERSION,
  bridgeManifest,
  findVessieTab,
  sanitizeOperatorStatus,
  boundedObservation,
  ChatGPTBrowsallaxBridge,
  startChatGPTBridgeServer
} = require('../src/bridge/chatgpt-browsallax');

function fakeOperatorStatus({ grant = null } = {}) {
  return {
    ok: true,
    version: 'PV-BOP-0.2',
    receiptLedger: 'C:\\secret\\local\\path.jsonl',
    grant,
    tasks: { total: 1, running: 0, held: 0 },
    tabs: [
      { id: 1, title: 'Other', url: 'https://example.com/', active: false, loading: false },
      { id: 2, title: 'Super PhiVessel', url: 'https://superphivessel.netlify.app/', active: true, loading: false }
    ]
  };
}

function fakeClient({ grant = null, task = null } = {}) {
  const calls = [];
  return {
    calls,
    status: async () => fakeOperatorStatus({ grant }),
    plannerStatus: async () => ({
      ok: true,
      planner: { available: true, selectedModel: 'qwen3:4b', models: [{ name: 'qwen3:4b' }] }
    }),
    observe: async (tabId) => {
      calls.push(['observe', tabId]);
      return {
        ok: true,
        snapshot: {
          url: 'https://superphivessel.netlify.app/',
          title: 'Super PhiVessel',
          text: 'Vessie says hello.',
          elements: [{ ref: 'e1' }, { ref: 'e2' }]
        }
      };
    },
    runTask: async (spec) => {
      calls.push(['runTask', spec]);
      return task || {
        id: 'task-1',
        tabId: 2,
        status: 'COMPLETE',
        stepCount: 3,
        result: {
          summary: 'Vessie response observed.',
          verification: { pass: true, mode: 'PLANNER_DECLARED', checks: [] }
        }
      };
    },
    getTask: async (id) => ({ task: { id, tabId: 2, status: 'HELD', stepCount: 2 } }),
    resumeTask: async (id) => {
      calls.push(['resumeTask', id]);
      return { ok: true, task: { id, tabId: 2, status: 'RUNNING' } };
    },
    waitForTask: async (id) => ({
      id,
      tabId: 2,
      status: 'COMPLETE',
      stepCount: 4,
      result: {
        summary: 'Resumed Vessie response.',
        verification: { pass: true, mode: 'PLANNER_DECLARED', checks: [] }
      }
    })
  };
}

test('manifest exposes a narrow semantic surface and no grant authority', () => {
  const manifest = bridgeManifest();
  assert.equal(CHATGPT_BROWSALLAX_BRIDGE_VERSION, 'PV-CBR-0.1');
  assert.deepEqual(manifest.methods, [
    'bridge.status',
    'vessie.observe',
    'vessie.ask',
    'vessie.resume'
  ]);
  assert.equal(manifest.authority.bridgeCanGrantAuthority, false);
  assert.ok(manifest.nonGoals.includes('REMOTE_SHELL'));
  assert.ok(manifest.nonGoals.includes('RAW_BROWSER_ACTIONS'));
});

test('Vessie tab selection requires exact origin and prefers active tab', () => {
  const status = fakeOperatorStatus();
  const tab = findVessieTab(status);
  assert.equal(tab.id, 2);
  assert.equal(findVessieTab({
    tabs: [{ id: 9, url: 'https://superphivessel.netlify.app.evil.example/' }]
  }), null);
});

test('sanitized status does not expose operator token or local ledger path', () => {
  const safe = sanitizeOperatorStatus(fakeOperatorStatus({
    grant: { id: 'secret-grant-id', enabled: true, expiresAt: Date.now() + 10000 }
  }));
  assert.equal(safe.grant.active, true);
  assert.equal(Object.hasOwn(safe.grant, 'id'), false);
  assert.equal(Object.hasOwn(safe, 'receiptLedger'), false);
});

test('bounded Vessie observation hashes and clips text', () => {
  const observation = boundedObservation({
    url: 'https://superphivessel.netlify.app/',
    title: 'Vessie',
    text: 'x'.repeat(20000),
    elements: new Array(4).fill({})
  });
  assert.equal(observation.text.length, 16000);
  assert.equal(observation.textSha256.length, 64);
  assert.equal(observation.elementCount, 4);
});

test('ask Vessie fails held before task creation when no human grant is active', async () => {
  const client = fakeClient({ grant: null });
  const bridge = new ChatGPTBrowsallaxBridge(client);
  const result = await bridge.askVessie('hello Vessie');
  assert.equal(result.payload.disposition, 'HELD');
  assert.equal(result.payload.reason, 'HUMAN_INTERACTIVE_GRANT_REQUIRED');
  assert.equal(client.calls.some(([name]) => name === 'runTask'), false);
});

test('ask Vessie uses a bounded local task when human grant is active', async () => {
  const client = fakeClient({
    grant: { id: 'g1', enabled: true, expiresAt: Date.now() + 60000 }
  });
  const bridge = new ChatGPTBrowsallaxBridge(client);
  const result = await bridge.askVessie('What mode are you in?');
  assert.equal(result.payload.disposition, 'COMPLETE');
  const run = client.calls.find(([name]) => name === 'runTask');
  assert.ok(run);
  const spec = run[1];
  assert.equal(spec.tabId, 2);
  assert.match(spec.goal, /MESSAGE_PAYLOAD_BEGIN\nWhat mode are you in\?\nMESSAGE_PAYLOAD_END/);
  assert.ok(spec.constraints.some((value) => /Do not navigate away/.test(value)));
  assert.equal(spec.maxSteps, 12);
  assert.ok(result.payload.observation);
});

test('resume Vessie refuses tasks bound to another tab', async () => {
  const client = fakeClient({
    grant: { id: 'g1', enabled: true, expiresAt: Date.now() + 60000 }
  });
  client.getTask = async (id) => ({ task: { id, tabId: 99, status: 'HELD' } });
  const bridge = new ChatGPTBrowsallaxBridge(client);
  await assert.rejects(
    bridge.resumeVessie('task-foreign'),
    /TASK_NOT_BOUND_TO_VESSIE_TAB/
  );
});

test('bridge server refuses short tokens', () => {
  const bridge = {
    manifest: () => bridgeManifest()
  };
  assert.throws(
    () => startChatGPTBridgeServer({ bridge, token: 'short' }),
    /BRIDGE_TOKEN_MIN_32_CHARS/
  );
});
