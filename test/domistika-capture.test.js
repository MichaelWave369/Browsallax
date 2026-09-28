const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  DOMISTIKA_CAPTURE_VERSION,
  normalizeCaptureOptions,
  boundedCaptureArtifact,
  boundedPageArtifact
} = require('../src/bridge/domistika-capture');

test('capture options are strict and bounded', () => {
  assert.equal(DOMISTIKA_CAPTURE_VERSION, 'PV-CBR-DOM-CAP-0.3');
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
  assert.equal(normalizeCaptureOptions({ scope: 'artwork' }).scope, 'artwork');
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


test('clean artwork artifact is re-hashed and bounded before return', () => {
  const bytes = Buffer.from('clean-art-png');
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  const artifact = boundedPageArtifact({
    artifact: {
      kind: 'domistika-clean-art-png',
      schema: 'domistika.clean-art-capture.v1',
      sourceVersion: '0.9.20',
      contentType: 'image/png',
      encoding: 'base64',
      sha256: digest,
      bytes: bytes.length,
      size: { width: 1200, height: 1200 },
      includeBackground: true,
      dataBase64: bytes.toString('base64')
    }
  }, {
    sessionId: 'critic',
    passName: 'clean',
    scope: 'artwork',
    includeImage: true
  });

  assert.equal(artifact.scope, 'artwork');
  assert.equal(artifact.sha256, digest);
  assert.equal(artifact.source.schema, 'domistika.clean-art-capture.v1');
  assert.equal(artifact.source.version, '0.9.20');
  assert.equal(artifact.dataBase64, bytes.toString('base64'));
});

test('clean artwork artifact rejects digest mismatch and wrong scope', () => {
  const bytes = Buffer.from('clean-art-png');
  const response = {
    artifact: {
      kind: 'domistika-clean-art-png',
      schema: 'domistika.clean-art-capture.v1',
      sourceVersion: '0.9.20',
      contentType: 'image/png',
      encoding: 'base64',
      sha256: '0'.repeat(64),
      size: { width: 1200, height: 1200 },
      dataBase64: bytes.toString('base64')
    }
  };
  assert.throws(() => boundedPageArtifact(response, { scope: 'canvas' }), /DOMISTIKA_PAGE_ARTIFACT_SCOPE_INVALID/);
  assert.throws(() => boundedPageArtifact(response, { scope: 'artwork' }), /DOMISTIKA_CAPTURE_DIGEST_MISMATCH/);
});
