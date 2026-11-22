const test = require('node:test');
const assert = require('node:assert/strict');
const { ChatGPTBrowsallaxBridge } = require('../src/bridge/chatgpt-browsallax');

const URL = 'https://www.nasa.gov/';
function makeBridge({ tabUrl = URL, observedUrl = URL, hosts = 'www.nasa.gov' } = {}) {
  const calls = [];
  const client = {
    status: async () => {
      calls.push('status');
      return { tabs: [{ id: 7, url: tabUrl, title: 'NASA' }] };
    },
    observe: async (id) => {
      calls.push('observe:' + id);
      return { snapshot: { url: observedUrl, title: 'NASA', text: 'Official Artemis mission', elements: [] } };
    }
  };
  return { bridge: new ChatGPTBrowsallaxBridge(client, { publicObservationHosts: hosts }), calls };
}

test('observes only the user-selected exact HTTPS URL on a locally allowed host', async () => {
  const { bridge, calls } = makeBridge();
  const result = await bridge.observeBrowser({ tabId: 7, expectedUrl: URL });
  assert.equal(result.kind, 'BROWSER_PUBLIC_OBSERVATION');
  assert.equal(result.payload.observation.url, URL);
  assert.equal(result.payload.observation.text, 'Official Artemis mission');
  assert.match(result.payload.observation.textSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(calls, ['status', 'observe:7']);
});

test('rejects missing allowlist and unapproved hosts before observing', async () => {
  const { bridge, calls } = makeBridge({ hosts: '' });
  await assert.rejects(bridge.observeBrowser({ tabId: 7, expectedUrl: URL }), /BROWSER_HOST_NOT_LOCALLY_ALLOWED/);
  assert.deepEqual(calls, []);
});

test('rejects wrong tab, wrong URL, and http origins without reading page', async () => {
  const { bridge, calls } = makeBridge();
  await assert.rejects(bridge.observeBrowser({ tabId: 8, expectedUrl: URL }), /BROWSER_TAB_URL_MISMATCH/);
  await assert.rejects(bridge.observeBrowser({ tabId: 7, expectedUrl: 'https://www.nasa.gov/artemis' }), /BROWSER_TAB_URL_MISMATCH/);
  await assert.rejects(bridge.observeBrowser({ tabId: 7, expectedUrl: 'http://www.nasa.gov/' }), /BROWSER_PUBLIC_HTTPS_REQUIRED/);
  assert.equal(calls.some((entry) => entry.startsWith('observe:')), false);
});

test('fails closed when tab navigates between status and observation', async () => {
  const { bridge, calls } = makeBridge({ observedUrl: 'https://www.nasa.gov/other' });
  await assert.rejects(bridge.observeBrowser({ tabId: 7, expectedUrl: URL }), /BROWSER_TAB_NAVIGATED_DURING_OBSERVATION/);
  assert.deepEqual(calls, ['status', 'observe:7']);
});
