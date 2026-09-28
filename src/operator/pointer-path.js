const POINTER_PATH_VERSION = 'PV-BOP-POINTER-0.1';
const MAX_POINTER_POINTS = 512;
const ALLOWED_POINTER_MODES = new Set(['drag', 'sticky', 'polyline']);
const ALLOWED_POINTER_FINISH = new Set(['none', 'enter', 'double-click']);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizePoint(point) {
  if (!point || typeof point !== 'object' || Array.isArray(point)) {
    throw Object.assign(new Error('POINTER_POINT_INVALID'), { statusCode: 400 });
  }
  const x = Number(point.x);
  const y = Number(point.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw Object.assign(new Error('POINTER_POINT_INVALID'), { statusCode: 400 });
  }
  if (x < 0 || x > 1 || y < 0 || y > 1) {
    throw Object.assign(new Error('POINTER_POINT_OUT_OF_RANGE'), { statusCode: 400 });
  }
  return { x, y };
}

function normalizePointerPath(action = {}) {
  const mode = String(action.mode || 'drag').toLowerCase();
  if (!ALLOWED_POINTER_MODES.has(mode)) {
    throw Object.assign(new Error('POINTER_MODE_INVALID'), { statusCode: 400 });
  }

  const points = Array.isArray(action.points) ? action.points.map(normalizePoint) : [];
  if (points.length < 2) {
    throw Object.assign(new Error('POINTER_POINTS_MIN_2'), { statusCode: 400 });
  }
  if (points.length > MAX_POINTER_POINTS) {
    throw Object.assign(new Error('POINTER_POINTS_TOO_MANY'), { statusCode: 400 });
  }

  const finishDefault = mode === 'polyline' ? 'enter' : 'none';
  const finish = String(action.finish || finishDefault).toLowerCase();
  if (!ALLOWED_POINTER_FINISH.has(finish)) {
    throw Object.assign(new Error('POINTER_FINISH_INVALID'), { statusCode: 400 });
  }
  if (mode !== 'polyline' && finish !== 'none') {
    throw Object.assign(new Error('POINTER_FINISH_MODE_MISMATCH'), { statusCode: 400 });
  }

  const intervalMs = clamp(Math.round(Number(action.intervalMs ?? 4) || 0), 0, 50);
  return { mode, points, finish, intervalMs };
}

function targetPoint(rect, point) {
  const width = Number(rect?.width);
  const height = Number(rect?.height);
  const left = Number(rect?.x);
  const top = Number(rect?.y);
  if (![width, height, left, top].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw Object.assign(new Error('POINTER_TARGET_RECT_INVALID'), { statusCode: 409 });
  }
  return {
    x: Math.round(left + clamp(point.x, 0, 1) * width),
    y: Math.round(top + clamp(point.y, 0, 1) * height)
  };
}

function delay(ms) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendMouse(webContents, type, point, extra = {}) {
  webContents.sendInputEvent({
    type,
    x: point.x,
    y: point.y,
    ...extra
  });
}

async function clickPoint(webContents, point, { clickCount = 1, intervalMs = 0 } = {}) {
  sendMouse(webContents, 'mouseMove', point);
  await delay(intervalMs);
  sendMouse(webContents, 'mouseDown', point, { button: 'left', clickCount });
  await delay(intervalMs);
  sendMouse(webContents, 'mouseUp', point, { button: 'left', clickCount });
}

async function executePointerPath(webContents, rect, input) {
  if (!webContents || typeof webContents.sendInputEvent !== 'function') {
    throw Object.assign(new Error('POINTER_INPUT_UNAVAILABLE'), { statusCode: 409 });
  }
  const spec = normalizePointerPath(input);
  const points = spec.points.map((point) => targetPoint(rect, point));

  if (spec.mode === 'sticky') {
    await clickPoint(webContents, points[0], { intervalMs: spec.intervalMs });
    for (let index = 1; index < points.length; index += 1) {
      sendMouse(webContents, 'mouseMove', points[index]);
      await delay(spec.intervalMs);
    }
    await clickPoint(webContents, points.at(-1), { intervalMs: spec.intervalMs });
  } else if (spec.mode === 'polyline') {
    for (const point of points) {
      await clickPoint(webContents, point, { intervalMs: spec.intervalMs });
      await delay(spec.intervalMs);
    }
    if (spec.finish === 'enter') {
      webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
      webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
    } else if (spec.finish === 'double-click') {
      const last = points.at(-1);
      await clickPoint(webContents, last, { clickCount: 2, intervalMs: spec.intervalMs });
    }
  } else {
    sendMouse(webContents, 'mouseMove', points[0]);
    await delay(spec.intervalMs);
    sendMouse(webContents, 'mouseDown', points[0], { button: 'left', clickCount: 1 });
    for (let index = 1; index < points.length; index += 1) {
      sendMouse(webContents, 'mouseMove', points[index], { button: 'left' });
      await delay(spec.intervalMs);
    }
    sendMouse(webContents, 'mouseUp', points.at(-1), { button: 'left', clickCount: 1 });
  }

  return {
    ok: true,
    version: POINTER_PATH_VERSION,
    mode: spec.mode,
    pointCount: points.length,
    finish: spec.finish
  };
}

module.exports = {
  POINTER_PATH_VERSION,
  MAX_POINTER_POINTS,
  ALLOWED_POINTER_MODES,
  ALLOWED_POINTER_FINISH,
  normalizePoint,
  normalizePointerPath,
  targetPoint,
  executePointerPath
};
