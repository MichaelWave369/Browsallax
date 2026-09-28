const test = require('node:test');
const assert = require('node:assert/strict');

const {
  POINTER_PATH_VERSION,
  normalizePointerPath,
  targetPoint,
  executePointerPath
} = require('../src/operator/pointer-path');

test('pointer path contract is bounded and normalized', () => {
  assert.equal(POINTER_PATH_VERSION, 'PV-BOP-POINTER-0.1');
  const spec = normalizePointerPath({
    mode: 'sticky',
    points: [{ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.8 }],
    intervalMs: 999
  });
  assert.equal(spec.mode, 'sticky');
  assert.equal(spec.intervalMs, 50);
  assert.equal(spec.finish, 'none');
  assert.throws(
    () => normalizePointerPath({ mode: 'sticky', points: [{ x: -1, y: 0 }, { x: 0.5, y: 0.5 }] }),
    /POINTER_POINT_OUT_OF_RANGE/
  );
  assert.throws(
    () => normalizePointerPath({ mode: 'polyline', points: [{ x: 0.5, y: 0.5 }] }),
    /POINTER_POINTS_MIN_2/
  );
});

test('target points are element-relative CSS coordinates', () => {
  assert.deepEqual(
    targetPoint({ x: 100, y: 50, width: 400, height: 200 }, { x: 0.25, y: 0.75 }),
    { x: 200, y: 200 }
  );
});

test('sticky path emits click, free cursor movement, then click', async () => {
  const events = [];
  const webContents = { sendInputEvent: (event) => events.push(event) };
  const result = await executePointerPath(
    webContents,
    { x: 0, y: 0, width: 100, height: 100 },
    {
      mode: 'sticky',
      intervalMs: 0,
      points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.9 }]
    }
  );

  assert.equal(result.pointCount, 3);
  assert.equal(events.filter((event) => event.type === 'mouseDown').length, 2);
  assert.equal(events.filter((event) => event.type === 'mouseUp').length, 2);
  assert.ok(events.some((event) => event.type === 'mouseMove' && event.x === 50 && event.y === 50));
});

test('polyline clicks every point and finishes with Enter', async () => {
  const events = [];
  const webContents = { sendInputEvent: (event) => events.push(event) };
  await executePointerPath(
    webContents,
    { x: 10, y: 20, width: 200, height: 100 },
    {
      mode: 'polyline',
      intervalMs: 0,
      points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 1 }]
    }
  );
  assert.equal(events.filter((event) => event.type === 'mouseDown').length, 3);
  assert.equal(events.at(-2).type, 'keyDown');
  assert.equal(events.at(-2).keyCode, 'Enter');
  assert.equal(events.at(-1).type, 'keyUp');
});
