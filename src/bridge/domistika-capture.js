const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const DOMISTIKA_CAPTURE_VERSION = 'PV-CBR-DOM-CAP-0.3';
const CAPTURE_SCOPES = new Set(['viewport', 'canvas', 'artwork']);
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
  const allowed = new Set(['sessionId', 'passName', 'includeImage', 'scope']);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error('DOMISTIKA_CAPTURE_FIELDS_INVALID');
  }

  const scope = String(value.scope || 'viewport').trim().toLowerCase();
  if (!CAPTURE_SCOPES.has(scope)) throw new Error('DOMISTIKA_CAPTURE_SCOPE_INVALID');

  return {
    sessionId: safeToken(value.sessionId, null),
    passName: safeToken(value.passName, null),
    includeImage: value.includeImage !== false,
    scope
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
    passName: normalized.passName,
    scope: normalized.scope
  };

  if (normalized.includeImage) artifact.dataBase64 = bytes.toString('base64');
  return artifact;
}

function boundedPageArtifact(response, options = {}) {
  const normalized = normalizeCaptureOptions(options);
  if (normalized.scope !== 'artwork') throw new Error('DOMISTIKA_PAGE_ARTIFACT_SCOPE_INVALID');

  const source = response?.artifact;
  if (!source || source.contentType !== 'image/png' || source.encoding !== 'base64' || typeof source.dataBase64 !== 'string') {
    throw new Error('DOMISTIKA_PAGE_ARTIFACT_INVALID');
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(source.dataBase64) || source.dataBase64.length % 4 !== 0) {
    throw new Error('DOMISTIKA_PAGE_ARTIFACT_BASE64_INVALID');
  }

  const bytes = Buffer.from(source.dataBase64, 'base64');
  if (bytes.length <= 0 || bytes.length > MAX_CAPTURE_BYTES) throw new Error('DOMISTIKA_CAPTURE_SIZE_INVALID');
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  if (source.sha256 && String(source.sha256).toLowerCase() !== sha256) {
    throw new Error('DOMISTIKA_CAPTURE_DIGEST_MISMATCH');
  }

  const width = Math.round(Number(source?.size?.width));
  const height = Math.round(Number(source?.size?.height));
  if (![width, height].every(Number.isFinite) || width < 1 || height < 1 || width > 2048 || height > 2048) {
    throw new Error('DOMISTIKA_PAGE_ARTIFACT_DIMENSIONS_INVALID');
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
    size: { width, height },
    sessionId: normalized.sessionId,
    passName: normalized.passName,
    scope: 'artwork',
    source: {
      kind: String(source.kind || ''),
      schema: String(source.schema || ''),
      version: String(source.sourceVersion || ''),
      includeBackground: Boolean(source.includeBackground)
    }
  };

  if (normalized.includeImage) artifact.dataBase64 = source.dataBase64;
  return artifact;
}


module.exports = {
  DOMISTIKA_CAPTURE_VERSION,
  CAPTURE_SCOPES,
  MAX_CAPTURE_BYTES,
  CAPTURE_FILENAME_RE,
  normalizeCaptureOptions,
  boundedCaptureArtifact,
  boundedPageArtifact
};
