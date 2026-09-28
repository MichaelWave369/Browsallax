const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DOMISTIKA_BRIDGE_VERSION,
  DEFAULT_DOMISTIKA_URL,
  isDomistikaUrl,
  findDomistikaTab,
  normalizeDomistikaRecipe,
  domistikaContract
} = require('../src/bridge/domistika');

test('Domistika bridge locks to the configured GitHub Pages path', () => {
  assert.equal(DOMISTIKA_BRIDGE_VERSION, 'PV-CBR-DOM-0.1');
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
