const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  BrowsallaxOperatorClient,
  candidateEndpointFiles,
  validateEndpoint,
  discoverEndpoint
} = require('../src/client/operator-client');

const TOKEN = 'a'.repeat(64);

test('endpoint validation rejects any non-loopback host', () => {
  assert.throws(() => validateEndpoint({
    version: 'PV-BOP-0.3',
    host: 'example.com',
    port: 3697,
    token: TOKEN
  }), /ENDPOINT_NOT_LOOPBACK/);

  const valid = validateEndpoint({
    version: 'PV-BOP-0.3',
    host: '127.0.0.1',
    port: 3697,
    token: TOKEN
  });
  assert.equal(valid.host, '127.0.0.1');
});

test('Windows endpoint discovery includes Electron user-data name variants', () => {
  const files = candidateEndpointFiles({
    platform: 'win32',
    env: { APPDATA: 'C:\\Users\\Test\\AppData\\Roaming' },
    home: 'C:\\Users\\Test'
  });
  assert.ok(files.some((value) => /browsallax[\\/]operator[\\/]endpoint\.json$/i.test(value)));
});

test('discoverEndpoint honors an explicit endpoint file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'browsallax-client-'));
  const file = path.join(dir, 'endpoint.json');
  await fs.writeFile(file, JSON.stringify({
    schema: 'browsallax.operator.endpoint.v1',
    version: 'PV-BOP-0.3',
    host: '127.0.0.1',
    port: 3697,
    token: TOKEN
  }));

  const endpoint = await discoverEndpoint({ endpointFile: file });
  assert.equal(endpoint.sourcePath, file);
  assert.equal(endpoint.token, TOKEN);
});

test('client descriptor never exposes bearer token and authenticated requests use it', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/v1/health')) {
      return new Response(JSON.stringify({ ok: true, version: 'PV-BOP-0.3' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (String(url).endsWith('/v1/status')) {
      assert.equal(options.headers.authorization, `Bearer ${TOKEN}`);
      return new Response(JSON.stringify({ ok: true, version: 'PV-BOP-0.3', tabs: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    throw new Error('unexpected URL');
  };

  const client = new BrowsallaxOperatorClient({
    endpoint: {
      version: 'PV-BOP-0.3',
      host: '127.0.0.1',
      port: 3697,
      token: TOKEN,
      sourcePath: '/tmp/endpoint.json'
    },
    fetchImpl
  });

  const descriptor = client.descriptor();
  assert.equal(Object.prototype.hasOwnProperty.call(descriptor, 'token'), false);
  await client.health();
  await client.status();
  assert.equal(calls[0].options.headers.authorization, undefined);
  assert.equal(calls[1].options.headers.authorization, `Bearer ${TOKEN}`);
});


test('screenshot request carries only the bounded optional clip', async () => {
  let seen = null;
  const client = new BrowsallaxOperatorClient({
    endpoint: {
      version: 'PV-BOP-0.3',
      host: '127.0.0.1',
      port: 3697,
      token: TOKEN,
      sourcePath: '/tmp/endpoint.json'
    },
    fetchImpl: async (url, options = {}) => {
      seen = { url: String(url), body: JSON.parse(options.body || '{}') };
      return new Response(JSON.stringify({
        ok: true,
        screenshot: {
          filePath: '/tmp/capture-1-abcdef123456.png',
          sha256: 'a'.repeat(64),
          bytes: 100,
          size: { width: 800, height: 800 }
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
  });

  await client.screenshot(7, {
    clip: { x: 100, y: 120, width: 800, height: 800 }
  });

  assert.ok(seen.url.endsWith('/v1/screenshot'));
  assert.deepEqual(seen.body, {
    tabId: 7,
    clip: { x: 100, y: 120, width: 800, height: 800 }
  });
});


test('page artifact request carries only tab and fixed artifact kind', async () => {
  let seen = null;
  const client = new BrowsallaxOperatorClient({
    endpoint: {
      version: 'PV-BOP-0.3',
      host: '127.0.0.1',
      port: 3697,
      token: TOKEN,
      sourcePath: '/tmp/endpoint.json'
    },
    fetchImpl: async (url, options = {}) => {
      seen = { url: String(url), body: JSON.parse(options.body || '{}') };
      return new Response(JSON.stringify({
        ok: true,
        artifact: {
          kind: 'domistika-clean-art-png',
          contentType: 'image/png',
          encoding: 'base64',
          sha256: 'a'.repeat(64),
          bytes: 3,
          size: { width: 1, height: 1 },
          dataBase64: 'YWJj'
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
  });

  await client.pageArtifact(7, 'domistika-clean-art-png');

  assert.ok(seen.url.endsWith('/v1/page-artifact'));
  assert.deepEqual(seen.body, {
    tabId: 7,
    kind: 'domistika-clean-art-png'
  });
});
