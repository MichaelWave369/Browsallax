const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { startOperatorServer } = require('../src/operator/server');

function waitForStatus(start) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('operator server did not start')), 5000);
    start((status) => {
      clearTimeout(timer);
      resolve(status);
    });
  });
}

test('local operator API requires token and human grant for ordinary mutation', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'browsallax-server-'));
  let grant = null;
  const webContents = {
    isDestroyed: () => false,
    getURL: () => 'https://example.test/',
    getTitle: () => 'Example',
    isLoading: () => false,
    executeJavaScript: async (script) => {
      if (script.includes("tagName: el.tagName.toLowerCase()")) {
        return {
          selector: '#open', tagName: 'button', role: '', type: 'button', name: '',
          text: 'Open panel', ariaLabel: '', title: '', href: '', disabled: false
        };
      }
      if (script.includes("el.click();")) return { ok: true };
      return true;
    }
  };
  const tab = { id: 1, title: 'Example', view: { webContents } };

  let service;
  const status = await waitForStatus((onStatus) => {
    service = startOperatorServer({
      userDataPath: dir,
      getTab: () => tab,
      listTabs: () => [{ id: 1, title: 'Example', url: 'https://example.test/', active: true }],
      navigateTab: async () => {},
      getGrant: () => grant,
      onStatus
    });
  });

  try {
    const endpoint = JSON.parse(await fs.readFile(status.endpointFile, 'utf8'));
    const base = `http://${endpoint.host}:${endpoint.port}`;
    const auth = { authorization: `Bearer ${endpoint.token}`, 'content-type': 'application/json' };

    const health = await fetch(`${base}/v1/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).version, 'PV-BOP-0.1');

    const deniedStatus = await fetch(`${base}/v1/status`);
    assert.equal(deniedStatus.status, 401);

    const allowedStatus = await fetch(`${base}/v1/status`, { headers: { authorization: `Bearer ${endpoint.token}` } });
    assert.equal(allowedStatus.status, 200);

    const held = await fetch(`${base}/v1/action`, {
      method: 'POST', headers: auth,
      body: JSON.stringify({ tabId: 1, action: { type: 'click', selector: '#open' } })
    });
    assert.equal(held.status, 403);
    assert.equal((await held.json()).status, 'HELD');

    grant = { enabled: true, id: 'human-test-grant', expiresAt: Date.now() + 60000 };
    const allowed = await fetch(`${base}/v1/action`, {
      method: 'POST', headers: auth,
      body: JSON.stringify({ tabId: 1, action: { type: 'click', selector: '#open' } })
    });
    assert.equal(allowed.status, 200);
    const body = await allowed.json();
    assert.equal(body.ok, true);
    assert.equal(body.authority.basis, 'HUMAN_INTERACTIVE_GRANT');
  } finally {
    await service.close();
  }
});
