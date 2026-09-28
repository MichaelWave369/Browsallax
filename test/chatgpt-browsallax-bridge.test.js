const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CHATGPT_BROWSALLAX_BRIDGE_VERSION,
  bridgeManifest,
  findVessieTab,
  sanitizeOperatorStatus,
  boundedObservation,
  findObservedVessieComposer,
  findObservedVessieSendButton,
  completedVessieResponseCount,
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

function composerSnapshot({ value = '', busy = false, completed = 0, text = null } = {}) {
  const elements = [
    {
      ref: 'e-composer',
      selector: 'div.pv-input-shell > div > textarea',
      tagName: 'textarea',
      placeholder: 'Speak or type into the field...',
      value
    },
    {
      ref: 'e-send',
      selector: 'div.pv-input-shell > div > button:nth-of-type(4)',
      tagName: 'button',
      title: busy ? 'Stop generation' : 'Send',
      text: busy ? '■' : '∴'
    }
  ];
  for (let i = 0; i < completed; i += 1) {
    elements.push({
      ref: `e-regen-${i + 1}`,
      selector: `div.response-${i + 1} > button.regenerate`,
      tagName: 'button',
      title: '',
      text: '↻ regenerate'
    });
  }
  return {
    url: 'https://superphivessel.netlify.app/',
    title: 'Super PhiVessel',
    text: text || (busy ? 'Request executing.' : 'Machine idle.'),
    elements
  };
}

function fakeClient({ grant = null } = {}) {
  const calls = [];
  let composerValue = '';
  let sent = false;
  let postSendObserves = 0;

  return {
    calls,
    status: async () => fakeOperatorStatus({ grant }),
    plannerStatus: async () => ({
      ok: true,
      planner: { available: true, selectedModel: 'qwen3:4b', models: [{ name: 'qwen3:4b' }] }
    }),
    observe: async (tabId) => {
      calls.push(['observe', tabId]);
      if (!sent) {
        return { ok: true, snapshot: composerSnapshot({ value: composerValue, completed: 0 }) };
      }
      postSendObserves += 1;
      if (postSendObserves === 1) {
        return { ok: true, snapshot: composerSnapshot({ value: '', busy: true, completed: 0 }) };
      }
      return {
        ok: true,
        snapshot: composerSnapshot({
          value: '',
          busy: false,
          completed: 1,
          text: 'Machine idle. You What mode are you in? Super Φ.Vessel I am ready.'
        })
      };
    },
    action: async (tabId, action) => {
      calls.push(['action', tabId, action]);
      if (action.type === 'type') {
        composerValue = action.value;
        return { ok: true, actionClass: 'FORM_INPUT' };
      }
      if (action.type === 'click') {
        sent = true;
        composerValue = '';
        return { ok: true, actionClass: 'REMOTE_MUTATION' };
      }
      throw new Error('unexpected action');
    },
    runTask: async (spec) => {
      calls.push(['runTask', spec]);
      return {
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
  assert.equal(CHATGPT_BROWSALLAX_BRIDGE_VERSION, 'PV-CBR-0.6');
  assert.deepEqual(manifest.methods, [
    'bridge.status',
    'vessie.observe',
    'vessie.ask',
    'vessie.resume',
    'domistika.status',
    'domistika.observe',
    'domistika.capabilities',
    'domistika.capture',
    'domistika.draw'
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

test('deterministic Vessie controls must be observed, not invented', () => {
  const snapshot = composerSnapshot();
  const composer = findObservedVessieComposer(snapshot);
  const send = findObservedVessieSendButton(snapshot);
  assert.equal(composer.selector, 'div.pv-input-shell > div > textarea');
  assert.equal(send.title, 'Send');
  assert.equal(completedVessieResponseCount(snapshot), 0);

  const completed = composerSnapshot({ completed: 2 });
  assert.equal(completedVessieResponseCount(completed), 2);
  assert.equal(findObservedVessieComposer({ elements: [{ tagName: 'textarea', placeholder: 'Unrelated notes' }] }), null);
});

test('ask Vessie fails held before any action when no human grant is active', async () => {
  const client = fakeClient({ grant: null });
  const bridge = new ChatGPTBrowsallaxBridge(client);
  const result = await bridge.askVessie('hello Vessie');
  assert.equal(result.payload.disposition, 'HELD');
  assert.equal(result.payload.reason, 'HUMAN_INTERACTIVE_GRANT_REQUIRED');
  assert.equal(client.calls.some(([name]) => name === 'action'), false);
  assert.equal(client.calls.some(([name]) => name === 'runTask'), false);
});

test('ask Vessie types and clicks only selectors observed on the exact Vessie tab', async () => {
  const client = fakeClient({
    grant: { id: 'g1', enabled: true, expiresAt: Date.now() + 60000 }
  });
  const bridge = new ChatGPTBrowsallaxBridge(client);
  const result = await bridge.askVessie('What mode are you in?', { pollMs: 1, timeoutMs: 5000 });

  assert.equal(result.payload.disposition, 'COMPLETE');
  assert.equal(result.payload.transport.mode, 'DETERMINISTIC_OBSERVED_CONTROLS');
  assert.equal(result.payload.transport.typed, true);
  assert.equal(result.payload.transport.clicked, true);
  assert.equal(result.payload.transport.sawBusy, true);
  assert.equal(result.payload.transport.completedBefore, 0);
  assert.equal(result.payload.transport.completedAfter, 1);

  const actions = client.calls.filter(([name]) => name === 'action');
  assert.equal(actions.length, 2);
  assert.deepEqual(actions[0][2], {
    type: 'type',
    selector: 'div.pv-input-shell > div > textarea',
    value: 'What mode are you in?'
  });
  assert.deepEqual(actions[1][2], {
    type: 'click',
    selector: 'div.pv-input-shell > div > button:nth-of-type(4)'
  });
  assert.equal(client.calls.some(([name]) => name === 'runTask'), false);
  assert.ok(result.payload.observation);
});

test('ask Vessie fails before typing if observed composer contract is absent', async () => {
  const client = fakeClient({
    grant: { id: 'g1', enabled: true, expiresAt: Date.now() + 60000 }
  });
  client.observe = async () => ({
    ok: true,
    snapshot: {
      url: 'https://superphivessel.netlify.app/',
      title: 'Super PhiVessel',
      text: 'Machine idle.',
      elements: [{ tagName: 'button', title: 'Send', selector: '#send' }]
    }
  });

  const bridge = new ChatGPTBrowsallaxBridge(client);
  const result = await bridge.askVessie('hello');
  assert.equal(result.payload.disposition, 'FAILED');
  assert.equal(result.payload.reason, 'VESSIE_COMPOSER_NOT_OBSERVED');
  assert.equal(client.calls.some(([name]) => name === 'action'), false);
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
