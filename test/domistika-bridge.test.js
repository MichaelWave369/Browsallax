const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DOMISTIKA_BRIDGE_VERSION,
  DEFAULT_DOMISTIKA_URL,
  isDomistikaUrl,
  findDomistikaTab,
  normalizeDomistikaRecipe,
  domistikaContract,
  domistikaCapabilities,
  normalizeDrawOptions
} = require('../src/bridge/domistika');

test('Domistika bridge locks to the configured GitHub Pages path', () => {
  assert.equal(DOMISTIKA_BRIDGE_VERSION, 'PV-CBR-DOM-0.2');
  assert.equal(isDomistikaUrl(DEFAULT_DOMISTIKA_URL), true);
  assert.equal(isDomistikaUrl('https://michaelwave369.github.io/Domistika/#gallery'), true);
  assert.equal(isDomistikaUrl('https://michaelwave369.github.io/OtherApp/'), false);
  assert.equal(isDomistikaUrl('https://michaelwave369.github.io.evil.example/Domistika/'), false);
});

test('Domistika tab selection prefers the active exact app tab', () => {
  const tab = findDomistikaTab({
    tabs: [
      { id: 1, url: 'https://michaelwave369.github.io/Domistika/', active: false },
      { id: 2, url: 'https://michaelwave369.github.io/Domistika/#gallery', active: true },
      { id: 3, url: 'https://example.com/', active: false }
    ]
  });
  assert.equal(tab.id, 2);
});

test('drawing recipes are strict, bounded, and normalized', () => {
  const recipe = normalizeDomistikaRecipe({
    projectName: 'AI Smoke Test',
    newCanvas: { width: 1200, height: 1200 },
    tool: 'marker',
    color: '#12A0ff',
    size: 20,
    symmetry: 'radial-12',
    mode: 'sticky',
    points: [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 }],
    saveToGallery: true,
    gallery: { artist: 'ChatGPT', category: 'Experimental', description: 'Smoke test' }
  });
  assert.equal(recipe.color, '#12a0ff');
  assert.equal(recipe.points.length, 2);
  assert.equal(recipe.gallery.category, 'Experimental');

  const kaleido = normalizeDomistikaRecipe({
    mode: 'sticky',
    symmetry: 'kaleido-12',
    points: [{ x: 0.48, y: 0.18 }, { x: 0.62, y: 0.34 }]
  });
  assert.equal(kaleido.symmetry, 'kaleido-12');
  assert.throws(
    () => normalizeDomistikaRecipe({
      mode: 'sticky',
      points: [{ x: 0.5, y: 0.5 }],
      hidden: true
    }),
    /DOMISTIKA_RECIPE_FIELDS_INVALID/
  );
});

test('Domistika contract requires both accessibility modes and observed canvas', () => {
  const snapshot = {
    elements: [
      '#projectName', '#colorInput', '#sizeInput', '#symmetryInput',
      '#stickyDrawToggle', '#polylineToggle', '#overlay'
    ].map((selector) => ({ selector }))
  };
  assert.equal(domistikaContract(snapshot).ok, true);
  snapshot.elements = snapshot.elements.filter((element) => element.selector !== '#overlay');
  assert.equal(domistikaContract(snapshot).ok, false);
  assert.deepEqual(domistikaContract(snapshot).missing, ['#overlay']);
});


function domistikaSnapshot() {
  const controls = [
    { selector: '#projectName', tagName: 'input', value: 'Untitled' },
    { selector: '#colorInput', tagName: 'input', value: '#1b1820' },
    { selector: '#sizeInput', tagName: 'input', value: '12' },
    {
      selector: '#symmetryInput',
      tagName: 'select',
      value: 'none',
      options: ['Off', 'Radial 12', 'Kaleido 12'],
      optionValues: ['none', 'radial-12', 'kaleido-12']
    },
    { selector: '#stickyDrawToggle', tagName: 'button', ariaPressed: 'false', text: 'Sticky Draw' },
    { selector: '#polylineToggle', tagName: 'button', ariaPressed: 'false', text: 'Polyline' },
    { selector: '#overlay', tagName: 'canvas', rect: { x: 100, y: 100, width: 800, height: 800 } },
    { selector: '[data-tool="marker"]', tagName: 'button', dataTool: 'marker', text: 'Marker' }
  ];
  return {
    url: DEFAULT_DOMISTIKA_URL,
    title: 'Domistika',
    text: 'Welcome to Domistika.',
    viewport: { width: 1200, height: 900, scrollX: 0, scrollY: 0 },
    elements: controls
  };
}

test('semantic draw uses observed controls and one governed pointer path', async () => {
  const calls = [];
  let modePressed = false;
  const client = {
    status: async () => ({
      ok: true,
      grant: { id: 'g1', enabled: true, expiresAt: Date.now() + 60000 },
      tabs: [{ id: 7, url: DEFAULT_DOMISTIKA_URL, active: true }]
    }),
    observe: async () => {
      const snapshot = domistikaSnapshot();
      if (modePressed) {
        snapshot.elements.find((element) => element.selector === '#stickyDrawToggle').ariaPressed = 'true';
      }
      return { ok: true, snapshot };
    },
    action: async (_tabId, action) => {
      calls.push(action);
      if (action.selector === '#stickyDrawToggle' && action.type === 'click') modePressed = true;
      return {
        ok: true,
        actionClass: action.type === 'wait' ? 'READ_ONLY' : 'REMOTE_MUTATION',
        result: action.type === 'pointer_path'
          ? { ok: true, version: 'PV-BOP-POINTER-0.1', mode: action.mode, pointCount: action.points.length, finish: action.finish }
          : { ok: true }
      };
    },
    screenshot: async () => ({
      ok: true,
      screenshot: { filePath: 'C:/private/capture.png', sha256: 'a'.repeat(64), bytes: 1234, size: { width: 1200, height: 900 } }
    })
  };

  const { DomistikaSemanticBridge } = require('../src/bridge/domistika');
  const bridge = new DomistikaSemanticBridge(client);
  const result = await bridge.draw({
    projectName: 'AI Smoke Test',
    tool: 'marker',
    color: '#ff5500',
    size: 18,
    symmetry: 'radial-12',
    mode: 'sticky',
    points: [{ x: 0.2, y: 0.5 }, { x: 0.5, y: 0.2 }, { x: 0.8, y: 0.5 }]
  });

  assert.equal(result.disposition, 'COMPLETE');
  const pointer = calls.find((action) => action.type === 'pointer_path');
  assert.ok(pointer);
  assert.equal(pointer.selector, '#overlay');
  assert.equal(pointer.mode, 'sticky');
  assert.equal(pointer.points.length, 3);
  assert.equal(result.screenshot.sha256, 'a'.repeat(64));
  assert.equal(Object.hasOwn(result.screenshot, 'filePath'), false);
});


test('capabilities expose observed controls separately from allowed bridge modes', () => {
  const snapshot = domistikaSnapshot();
  const caps = domistikaCapabilities(snapshot);
  assert.equal(caps.bridgeVersion, 'PV-CBR-DOM-0.2');
  assert.ok(caps.tools.includes('marker'));
  assert.deepEqual(caps.drawModes, ['sticky', 'polyline']);
  assert.deepEqual(caps.observedSymmetryModes, ['none', 'radial-12', 'kaleido-12']);
  assert.ok(caps.allowedSymmetryModes.includes('kaleido-12'));
  assert.equal(caps.capture.supported, true);
  assert.equal(caps.maxPointsPerPass, 512);
});

test('draw options carry session/pass identity and visual return intent', () => {
  const options = normalizeDrawOptions({
    sessionId: 'gear session 1',
    passName: 'hub pass',
    returnCapture: true,
    includeImage: true
  });
  assert.equal(options.sessionId, 'gear-session-1');
  assert.equal(options.passName, 'hub-pass');
  assert.equal(options.returnCapture, true);
  assert.equal(options.includeImage, true);
  assert.throws(() => normalizeDrawOptions({ rawSelector: '#overlay' }), /DOMISTIKA_DRAW_OPTIONS_INVALID/);
});
