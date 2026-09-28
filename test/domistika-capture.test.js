const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  DOMISTIKA_CAPTURE_VERSION,
  normalizeCaptureOptions,
  boundedCaptureArtifact
} = require('../src/bridge/domistika-capture');

test('capture options are strict and bounded', () => {
  assert.equal(DOMISTIKA_CAPTURE_VERSION, 'PV-CBR-DOM-CAP-0.2');
  assert.deepEqual(
    normalizeCaptureOptions({ sessionId: 'gear session', passName: 'pass 1', includeImage: false, scope: 'canvas' }),
    { sessionId: 'gear-session', passName: 'pass-1', includeImage: false, scope: 'canvas' }
  );
  assert.throws(
    () => normalizeCaptureOptions({ arbitraryPath: 'C:\\secrets' }),
    /DOMISTIKA_CAPTURE_FIELDS_INVALID/
  );
  assert.throws(
    () => normalizeCaptureOptions({ scope: 'arbitrary-region' }),
    /DOMISTIKA_CAPTURE_SCOPE_INVALID/
  );
});

test('bounded capture verifies filename, digest, and returns inline base64', async () => {
  const bytes = Buffer.from('fake-png-bytes');
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  const fsImpl = {
    stat: async () => ({ isFile: () => true, size: bytes.length }),
    readFile: async () => bytes
  };
  const artifact = await boundedCaptureArtifact({
    screenshot: {
      filePath: 'C:\\Users\\test\\operator\\captures\\capture-1234567890-abcdef123456.png',
      sha256: digest,
      bytes: bytes.length,
      size: { width: 800, height: 600 }
    }
  }, { sessionId: 's1', passName: 'hub' }, fsImpl);

  assert.equal(artifact.sha256, digest);
  assert.equal(artifact.dataBase64, bytes.toString('base64'));
  assert.equal(artifact.contentType, 'image/png');
  assert.equal(artifact.sessionId, 's1');
  assert.equal(artifact.passName, 'hub');
  assert.equal(artifact.scope, 'viewport');
});

test('capture rejects digest mismatch', async () => {
  const bytes = Buffer.from('different');
  const fsImpl = {
    stat: async () => ({ isFile: () => true, size: bytes.length }),
    readFile: async () => bytes
  };
  await assert.rejects(
    boundedCaptureArtifact({
      screenshot: {
        filePath: '/tmp/capture-123-abcdef123456.png',
        sha256: '0'.repeat(64),
        size: { width: 1, height: 1 }
      }
    }, {}, fsImpl),
    /DOMISTIKA_CAPTURE_DIGEST_MISMATCH/
  );
});
