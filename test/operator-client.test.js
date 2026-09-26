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
    version: 'PV-BOP-0.2',
    host: 'example.com',
    port: 3697,
    token: TOKEN
  }), /ENDPOINT_NOT_LOOPBACK/);

  const valid = validateEndpoint({
    version: 'PV-BOP-0.2',
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
    version: 'PV-BOP-0.2',
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
      return new Response(JSON.stringify({ ok: true, version: 'PV-BOP-0.2' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (String(url).endsWith('/v1/status')) {
      assert.equal(options.headers.authorization, `Bearer ${TOKEN}`);
      return new Response(JSON.stringify({ ok: true, version: 'PV-BOP-0.2', tabs: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    throw new Error('unexpected URL');
  };

  const client = new BrowsallaxOperatorClient({
    endpoint: {
      version: 'PV-BOP-0.2',
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
