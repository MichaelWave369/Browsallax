const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const DOMISTIKA_CAPTURE_VERSION = 'PV-CBR-DOM-CAP-0.1';
const MAX_CAPTURE_BYTES = 2 * 1024 * 1024;
const CAPTURE_FILENAME_RE = /^capture-\d+-[a-f0-9]{12}\.png$/i;

function safeToken(value, fallback) {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  const cleaned = raw.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return cleaned || fallback;
}

function normalizeCaptureOptions(input = {}) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const allowed = new Set(['sessionId', 'passName', 'includeImage']);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error('DOMISTIKA_CAPTURE_FIELDS_INVALID');
  }

  return {
    sessionId: safeToken(value.sessionId, null),
    passName: safeToken(value.passName, null),
    includeImage: value.includeImage !== false
  };
}

async function boundedCaptureArtifact(screenshotResponse, options = {}, fsImpl = fs) {
  const normalized = normalizeCaptureOptions(options);
  const shot = screenshotResponse?.screenshot;
  if (!shot?.filePath) throw new Error('DOMISTIKA_CAPTURE_FILE_MISSING');

  const rawPath = String(shot.filePath);
  const filePath = path.resolve(rawPath);
  const filename = rawPath.includes('\\')
    ? path.win32.basename(rawPath)
    : path.basename(rawPath);
  if (!CAPTURE_FILENAME_RE.test(filename)) throw new Error('DOMISTIKA_CAPTURE_FILENAME_INVALID');

  const stat = await fsImpl.stat(filePath);
  if (!stat.isFile()) throw new Error('DOMISTIKA_CAPTURE_NOT_FILE');
  if (stat.size <= 0 || stat.size > MAX_CAPTURE_BYTES) throw new Error('DOMISTIKA_CAPTURE_SIZE_INVALID');

  const bytes = await fsImpl.readFile(filePath);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  if (shot.sha256 && String(shot.sha256).toLowerCase() !== sha256) {
    throw new Error('DOMISTIKA_CAPTURE_DIGEST_MISMATCH');
  }

  const artifactId = [
    'domistika',
    normalized.sessionId || 'session',
    normalized.passName || 'capture',
    sha256.slice(0, 12)
  ].join('-');

  const artifact = {
    schema: 'browsallax.domistika.capture.v1',
    version: DOMISTIKA_CAPTURE_VERSION,
    artifactId,
    contentType: 'image/png',
    encoding: normalized.includeImage ? 'base64' : 'none',
    sha256,
    bytes: bytes.length,
    size: shot.size || null,
    sessionId: normalized.sessionId,
    passName: normalized.passName
  };

  if (normalized.includeImage) artifact.dataBase64 = bytes.toString('base64');
  return artifact;
}

module.exports = {
  DOMISTIKA_CAPTURE_VERSION,
  MAX_CAPTURE_BYTES,
  CAPTURE_FILENAME_RE,
  normalizeCaptureOptions,
  boundedCaptureArtifact
};
