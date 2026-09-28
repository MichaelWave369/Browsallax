const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CHATGPT_RELAY_AGENT_VERSION,
  ALLOWED_RELAY_OPERATIONS,
  normalizeRelayUrl,
  ChatGPTRelayAgent
} = require('../src/bridge/chatgpt-relay-agent');

function response(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function fakeBridge() {
  const calls = [];
  return {
    calls,
    status: async () => { calls.push(['status']); return { kind: 'BRIDGE_STATUS' }; },
    observeVessie: async () => { calls.push(['observe']); return { kind: 'VESSIE_OBSERVATION' }; },
    askVessie: async (message) => { calls.push(['ask', message]); return { kind: 'VESSIE_ASK_RESULT', message }; },
    resumeVessie: async (taskId) => { calls.push(['resume', taskId]); return { kind: 'VESSIE_RESUME_RESULT', taskId }; },
    domistikaStatus: async () => { calls.push(['dom-status']); return { kind: 'DOMISTIKA_STATUS' }; },
    observeDomistika: async () => { calls.push(['dom-observe']); return { kind: 'DOMISTIKA_OBSERVATION' }; },
    domistikaCapabilities: async () => { calls.push(['dom-capabilities']); return { kind: 'DOMISTIKA_CAPABILITIES' }; },
    captureDomistika: async (options) => { calls.push(['dom-capture', options]); return { kind: 'DOMISTIKA_CAPTURE', options }; },
    drawDomistika: async (recipe, options) => { calls.push(['dom-draw', recipe, options]); return { kind: 'DOMISTIKA_DRAW_RESULT', recipe, options }; }
  };
}

test('relay agent contract is bounded to semantic operations', () => {
  assert.equal(CHATGPT_RELAY_AGENT_VERSION, 'PV-CBR-AGENT-0.3');
  assert.deepEqual([...ALLOWED_RELAY_OPERATIONS], [
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
});

test('relay URL requires HTTPS except loopback development', () => {
  assert.equal(normalizeRelayUrl('https://relay.example.test/'), 'https://relay.example.test');
  assert.equal(normalizeRelayUrl('http://127.0.0.1:8888/'), 'http://127.0.0.1:8888');
  assert.throws(() => normalizeRelayUrl('http://relay.example.test'), /RELAY_HTTPS_REQUIRED/);
});

test('execute maps only allowed relay operations to bridge methods', async () => {
  const bridge = fakeBridge();
  const agent = new ChatGPTRelayAgent({
    relayUrl: 'https://relay.example.test',
    agentToken: 'a'.repeat(64),
    bridge,
    fetchImpl: async () => response(200, {})
  });

  await agent.execute({ operation: 'vessie.ask', payload: { message: 'hello' } });
  assert.deepEqual(bridge.calls, [['ask', 'hello']]);

  const recipe = { mode: 'sticky', points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }] };
  await agent.execute({
    operation: 'domistika.draw',
    payload: { recipe, sessionId: 's1', passName: 'p1', returnCapture: true, includeImage: true }
  });
  assert.deepEqual(bridge.calls.at(-1), [
    'dom-draw',
    recipe,
    { sessionId: 's1', passName: 'p1', returnCapture: true, includeImage: true }
  ]);

  await agent.execute({ operation: 'domistika.capture', payload: { sessionId: 's1', passName: 'inspect' } });
  assert.deepEqual(bridge.calls.at(-1), ['dom-capture', { sessionId: 's1', passName: 'inspect' }]);

  await assert.rejects(
    agent.execute({ operation: 'shell.exec', payload: { command: 'whoami' } }),
    /RELAY_OPERATION_NOT_ALLOWED/
  );
});

test('runOnce polls, executes, and completes one request', async () => {
  const bridge = fakeBridge();
  const network = [];
  const fetchImpl = async (url, options) => {
    network.push({ url, body: JSON.parse(options.body) });
    if (String(url).endsWith('/v1/agent/poll')) {
      return response(200, {
        ok: true,
        request: {
          id: 'req-1',
          operation: 'vessie.observe',
          payload: {},
          claimToken: 'claim-1'
        }
      });
    }
    if (String(url).endsWith('/v1/agent/complete')) {
      return response(200, { ok: true });
    }
    throw new Error('unexpected URL');
  };

  const agent = new ChatGPTRelayAgent({
    relayUrl: 'https://relay.example.test',
    agentToken: 'a'.repeat(64),
    bridge,
    fetchImpl
  });

  const outcome = await agent.runOnce();
  assert.equal(outcome.handled, true);
  assert.equal(outcome.ok, true);
  assert.deepEqual(bridge.calls, [['observe']]);
  assert.equal(network[1].body.id, 'req-1');
  assert.equal(network[1].body.claimToken, 'claim-1');
  assert.equal(network[1].body.error, null);
  assert.equal(network[1].body.result.kind, 'VESSIE_OBSERVATION');
});

test('unknown operation is returned to relay as an error and never executed', async () => {
  const bridge = fakeBridge();
  let completion = null;
  const fetchImpl = async (url, options) => {
    if (String(url).endsWith('/v1/agent/poll')) {
      return response(200, {
        ok: true,
        request: {
          id: 'req-bad',
          operation: 'browser.raw-click',
          payload: {},
          claimToken: 'claim-bad'
        }
      });
    }
    completion = JSON.parse(options.body);
    return response(200, { ok: true });
  };

  const agent = new ChatGPTRelayAgent({
    relayUrl: 'https://relay.example.test',
    agentToken: 'a'.repeat(64),
    bridge,
    fetchImpl
  });

  const outcome = await agent.runOnce();
  assert.equal(outcome.ok, false);
  assert.match(completion.error, /RELAY_OPERATION_NOT_ALLOWED/);
  assert.deepEqual(bridge.calls, []);
});
