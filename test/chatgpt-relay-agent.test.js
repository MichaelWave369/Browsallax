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
    resumeVessie: async (taskId) => { calls.push(['resume', taskId]); return { kind: 'VESSIE_RESUME_RESULT', taskId }; }
  };
}

test('relay agent contract is bounded to semantic operations', () => {
  assert.equal(CHATGPT_RELAY_AGENT_VERSION, 'PV-CBR-AGENT-0.1');
  assert.deepEqual([...ALLOWED_RELAY_OPERATIONS], [
    'bridge.status',
    'vessie.observe',
    'vessie.ask',
    'vessie.resume'
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
