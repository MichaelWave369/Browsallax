const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CHATGPT_GITHUB_AGENT_VERSION,
  REQUEST_SCHEMA,
  ALLOWED_OPERATIONS,
  normalizeRepository,
  repositoryFromRemote,
  normalizeRequest,
  ChatGPTGitHubMailboxAgent
} = require('../src/bridge/chatgpt-github-agent');

function request(overrides = {}) {
  const now = Date.now();
  return {
    schema: REQUEST_SCHEMA,
    id: 'req-status-001',
    operation: 'bridge.status',
    payload: {},
    createdAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 5 * 60 * 1000).toISOString(),
    ...overrides
  };
}

class FakeMailbox {
  constructor(files = {}, events = []) {
    this.files = new Map(Object.entries(files));
    this.events = events;
  }

  relative(kind, id) {
    return `${kind}/${id}.json`;
  }

  async sync() {
    this.events.push('sync');
  }

  async listRequestIds() {
    return [...this.files.keys()]
      .filter((key) => key.startsWith('requests/') && key.endsWith('.json'))
      .map((key) => key.slice('requests/'.length, -'.json'.length))
      .sort();
  }

  async exists(relativePath) {
    return this.files.has(relativePath);
  }

  async readText(relativePath) {
    if (!this.files.has(relativePath)) {
      const error = new Error('ENOENT');
      error.code = 'ENOENT';
      throw error;
    }
    return this.files.get(relativePath);
  }

  async readJson(relativePath) {
    return JSON.parse(await this.readText(relativePath));
  }

  async writeJson(relativePath, value) {
    this.files.set(relativePath, JSON.stringify(value, null, 2) + '\n');
    this.events.push(`write:${relativePath}`);
  }

  async commitAndPush(paths) {
    this.events.push(`commit:${paths.join(',')}`);
    return true;
  }
}

test('GitHub compatibility bridge exposes only bounded semantic operations', () => {
  assert.equal(CHATGPT_GITHUB_AGENT_VERSION, 'PV-CBR-GH-0.2');
  assert.deepEqual([...ALLOWED_OPERATIONS], [
    'bridge.status',
    'vessie.observe',
    'vessie.ask',
    'vessie.resume',
    'domistika.status',
    'domistika.observe',
    'domistika.draw'
  ]);

  assert.throws(
    () => normalizeRequest(request({ operation: 'shell.exec' })),
    /GITHUB_BRIDGE_OPERATION_NOT_ALLOWED/
  );
});

test('request contract is strict and bounded', () => {
  const normalized = normalizeRequest(request());
  assert.equal(normalized.operation, 'bridge.status');
  assert.deepEqual(normalized.payload, {});

  assert.throws(
    () => normalizeRequest(request({ payload: { hiddenInstruction: 'nope' } })),
    /UNEXPECTED_PAYLOAD_FIELDS/
  );

  const ask = normalizeRequest(request({
    id: 'req-vessie-ask-001',
    operation: 'vessie.ask',
    payload: { message: 'hello vessie' }
  }));
  assert.deepEqual(ask.payload, { message: 'hello vessie' });

  const draw = normalizeRequest(request({
    id: 'req-domistika-draw-001',
    operation: 'domistika.draw',
    payload: {
      recipe: {
        projectName: 'Mailbox draw',
        mode: 'polyline',
        points: [{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.7 }]
      }
    }
  }));
  assert.equal(draw.payload.recipe.mode, 'polyline');
  assert.equal(draw.payload.recipe.points.length, 2);

  assert.throws(
    () => normalizeRequest(request({
      id: 'req-expired-001',
      createdAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      expiresAt: new Date(Date.now() - 10 * 60 * 1000).toISOString()
    })),
    /REQUEST_EXPIRED/
  );
});

test('repository parsing accepts HTTPS and SSH GitHub remotes only', () => {
  assert.equal(normalizeRepository('MichaelWave369/browsallax-chat-bridge'), 'MichaelWave369/browsallax-chat-bridge');
  assert.equal(
    repositoryFromRemote('https://github.com/MichaelWave369/browsallax-chat-bridge.git'),
    'MichaelWave369/browsallax-chat-bridge'
  );
  assert.equal(
    repositoryFromRemote('git@github.com:MichaelWave369/browsallax-chat-bridge.git'),
    'MichaelWave369/browsallax-chat-bridge'
  );
  assert.throws(() => repositoryFromRemote('https://example.com/x/y.git'), /INVALID_GITHUB_REMOTE/);
});

test('agent commits a claim before any bridge execution', async () => {
  const events = [];
  const req = request();
  const mailbox = new FakeMailbox({
    'requests/req-status-001.json': JSON.stringify(req)
  }, events);

  const bridge = {
    status: async () => {
      events.push('execute:status');
      return { kind: 'BRIDGE_STATUS' };
    }
  };

  const agent = new ChatGPTGitHubMailboxAgent({
    mailbox,
    bridge,
    runId: 'run-test-001'
  });

  const outcome = await agent.runOnce();
  assert.equal(outcome.ok, true);

  const claimCommit = events.indexOf('commit:claims/req-status-001.json');
  const execute = events.indexOf('execute:status');
  const responseCommit = events.indexOf('commit:responses/req-status-001.json');

  assert.ok(claimCommit >= 0);
  assert.ok(execute > claimCommit);
  assert.ok(responseCommit > execute);

  const response = JSON.parse(mailbox.files.get('responses/req-status-001.json'));
  assert.equal(response.state, 'COMPLETE');
  assert.deepEqual(response.result, { kind: 'BRIDGE_STATUS' });
});

test('agent fails closed instead of replaying a previously claimed request', async () => {
  const events = [];
  const req = request();
  const mailbox = new FakeMailbox({
    'requests/req-status-001.json': JSON.stringify(req),
    'claims/req-status-001.json': JSON.stringify({
      schema: 'browsallax.github-bridge.claim.v1',
      requestId: 'req-status-001',
      operation: 'bridge.status',
      agentRunId: 'old-run'
    })
  }, events);

  let executed = false;
  const agent = new ChatGPTGitHubMailboxAgent({
    mailbox,
    bridge: {
      status: async () => {
        executed = true;
        return {};
      }
    },
    runId: 'new-run'
  });

  const outcome = await agent.runOnce();
  assert.equal(outcome.ok, false);
  assert.equal(executed, false);

  const response = JSON.parse(mailbox.files.get('responses/req-status-001.json'));
  assert.equal(response.state, 'FAILED');
  assert.match(response.error, /INDETERMINATE_PREVIOUS_CLAIM_NO_REPLAY/);
});
