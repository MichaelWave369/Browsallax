const {
  DOMISTIKA_CAPTURE_VERSION,
  normalizeCaptureOptions,
  boundedCaptureArtifact
} = require('./domistika-capture');

const DOMISTIKA_BRIDGE_VERSION = 'PV-CBR-DOM-0.2';
const DEFAULT_DOMISTIKA_URL = 'https://michaelwave369.github.io/Domistika/';
const DOMISTIKA_PATH_PREFIX = '/Domistika/';
const DRAW_TOOLS = new Set(['pencil', 'ink', 'marker', 'airbrush', 'eraser']);
const DRAW_MODES = new Set(['sticky', 'polyline']);
const SYMMETRY_MODES = new Set([
  'none', 'vertical', 'horizontal', 'quad',
  'radial-3', 'radial-4', 'radial-5', 'radial-6', 'radial-8', 'radial-10', 'radial-12', 'radial-16', 'radial-24',
  'kaleido-6', 'kaleido-8', 'kaleido-12',
  'spiral-5', 'spiral-8', 'spiral-12',
  'orbit-7', 'orbit-11', 'echo-5', 'echo-9', 'drift-7', 'ripple-6'
]);
const GALLERY_CATEGORIES = new Set(['Abstract', 'Mandala', 'Character', 'Sacred Geometry', 'Experimental', 'Pixel / Retro', 'Other']);
const MAX_DRAW_POINTS = 512;

function normalizeOrigin(value) {
  try {
    return new URL(String(value || '')).origin;
  } catch {
    return null;
  }
}

function normalizeDomistikaUrl(value = DEFAULT_DOMISTIKA_URL) {
  const parsed = new URL(String(value || DEFAULT_DOMISTIKA_URL));
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('DOMISTIKA_URL_UNSAFE');
  return parsed.toString();
}

function isDomistikaUrl(rawUrl, configuredUrl = DEFAULT_DOMISTIKA_URL) {
  try {
    const actual = new URL(String(rawUrl || ''));
    const configured = new URL(normalizeDomistikaUrl(configuredUrl));
    const prefix = configured.pathname.endsWith('/') ? configured.pathname : `${configured.pathname}/`;
    return actual.origin === configured.origin &&
      (actual.pathname === configured.pathname || actual.pathname.startsWith(prefix));
  } catch {
    return false;
  }
}

function findDomistikaTab(status, configuredUrl = DEFAULT_DOMISTIKA_URL) {
  const tabs = Array.isArray(status?.tabs) ? status.tabs : [];
  const matches = tabs.filter((tab) => isDomistikaUrl(tab?.url, configuredUrl));
  return matches.find((tab) => tab.active) || matches[0] || null;
}

function assertExactKeys(object, allowed, code) {
  const keys = Object.keys(object || {});
  if (keys.some((key) => !allowed.has(key))) throw new Error(code);
}

function normalizePoint(point) {
  if (!point || typeof point !== 'object' || Array.isArray(point)) throw new Error('DOMISTIKA_POINT_INVALID');
  const x = Number(point.x);
  const y = Number(point.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('DOMISTIKA_POINT_INVALID');
  if (x < 0 || x > 1 || y < 0 || y > 1) throw new Error('DOMISTIKA_POINT_OUT_OF_RANGE');
  return { x, y };
}

function normalizeNewCanvas(input) {
  if (input == null || input === false) return null;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('DOMISTIKA_NEW_CANVAS_INVALID');
  assertExactKeys(input, new Set(['width', 'height']), 'DOMISTIKA_NEW_CANVAS_FIELDS_INVALID');
  const width = Math.round(Number(input.width || 1200));
  const height = Math.round(Number(input.height || 1200));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 64 || width > 8192 || height < 64 || height > 8192) {
    throw new Error('DOMISTIKA_NEW_CANVAS_SIZE_INVALID');
  }
  return { width, height };
}

function normalizeGallery(input, saveToGallery) {
  if (!saveToGallery) return null;
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  assertExactKeys(value, new Set(['artist', 'category', 'description']), 'DOMISTIKA_GALLERY_FIELDS_INVALID');
  const artist = String(value.artist || 'ChatGPT via Browsallax').trim().slice(0, 60) || 'ChatGPT via Browsallax';
  const category = String(value.category || 'Experimental').trim();
  if (!GALLERY_CATEGORIES.has(category)) throw new Error('DOMISTIKA_GALLERY_CATEGORY_INVALID');
  const description = String(value.description || '').trim().slice(0, 500);
  return { artist, category, description };
}

function normalizeDomistikaRecipe(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('DOMISTIKA_RECIPE_INVALID');
  assertExactKeys(
    input,
    new Set([
      'projectName', 'newCanvas', 'tool', 'color', 'size', 'symmetry',
      'mode', 'points', 'intervalMs', 'saveToGallery', 'gallery'
    ]),
    'DOMISTIKA_RECIPE_FIELDS_INVALID'
  );

  const projectName = String(input.projectName || 'AI Domistika Drawing').trim().slice(0, 120) || 'AI Domistika Drawing';
  const tool = String(input.tool || 'marker').toLowerCase();
  if (!DRAW_TOOLS.has(tool)) throw new Error('DOMISTIKA_TOOL_INVALID');
  const color = String(input.color || '#1b1820').trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(color)) throw new Error('DOMISTIKA_COLOR_INVALID');
  const size = Math.max(1, Math.min(180, Math.round(Number(input.size || 12))));
  const symmetry = String(input.symmetry || 'none').toLowerCase();
  if (!SYMMETRY_MODES.has(symmetry)) throw new Error('DOMISTIKA_SYMMETRY_INVALID');
  const mode = String(input.mode || 'sticky').toLowerCase();
  if (!DRAW_MODES.has(mode)) throw new Error('DOMISTIKA_DRAW_MODE_INVALID');
  const points = Array.isArray(input.points) ? input.points.map(normalizePoint) : [];
  if (points.length < 2) throw new Error('DOMISTIKA_POINTS_MIN_2');
  if (points.length > MAX_DRAW_POINTS) throw new Error('DOMISTIKA_POINTS_TOO_MANY');
  const intervalMs = Math.max(0, Math.min(50, Math.round(Number(input.intervalMs ?? 4) || 0)));
  const saveToGallery = Boolean(input.saveToGallery);
  return {
    projectName,
    newCanvas: normalizeNewCanvas(input.newCanvas),
    tool,
    color,
    size,
    symmetry,
    mode,
    points,
    intervalMs,
    saveToGallery,
    gallery: normalizeGallery(input.gallery, saveToGallery)
  };
}

function visibleElements(snapshot = {}) {
  return Array.isArray(snapshot.elements) ? snapshot.elements : [];
}

function elementBySelector(snapshot, selector) {
  return visibleElements(snapshot).find((element) => String(element?.selector || '') === selector) || null;
}

function elementByTool(snapshot, tool) {
  return visibleElements(snapshot).find((element) => String(element?.dataTool || '') === tool) || null;
}

function buttonByText(snapshot, text) {
  const expected = String(text || '').trim().toLowerCase();
  return visibleElements(snapshot).find((element) => (
    String(element?.tagName || '').toLowerCase() === 'button' &&
    String(element?.text || '').trim().toLowerCase().includes(expected)
  )) || null;
}

function domistikaContract(snapshot = {}) {
  const selectors = [
    '#projectName',
    '#colorInput',
    '#sizeInput',
    '#symmetryInput',
    '#stickyDrawToggle',
    '#polylineToggle',
    '#overlay'
  ];
  const missing = selectors.filter((selector) => !elementBySelector(snapshot, selector));
  return {
    ok: missing.length === 0,
    version: DOMISTIKA_BRIDGE_VERSION,
    missing,
    stickyDraw: Boolean(elementBySelector(snapshot, '#stickyDrawToggle')),
    polyline: Boolean(elementBySelector(snapshot, '#polylineToggle')),
    canvasObserved: Boolean(elementBySelector(snapshot, '#overlay'))
  };
}

function domistikaCapabilities(snapshot = {}) {
  const elements = visibleElements(snapshot);
  const symmetry = elementBySelector(snapshot, '#symmetryInput');
  const overlay = elementBySelector(snapshot, '#overlay');
  const projectName = elementBySelector(snapshot, '#projectName');
  const tools = [...new Set(elements.map((element) => String(element?.dataTool || '')).filter(Boolean))];
  const observedSymmetryModes = Array.isArray(symmetry?.optionValues)
    ? symmetry.optionValues.map((value) => String(value || '').trim()).filter(Boolean)
    : Array.isArray(symmetry?.options)
      ? symmetry.options.map((value) => String(value || '').trim()).filter(Boolean)
      : [];

  return {
    schema: 'browsallax.domistika.capabilities.v1',
    bridgeVersion: DOMISTIKA_BRIDGE_VERSION,
    captureVersion: DOMISTIKA_CAPTURE_VERSION,
    exactTarget: DEFAULT_DOMISTIKA_URL,
    projectName: String(projectName?.value || '').slice(0, 120) || null,
    tools,
    drawModes: [
      ...(elementBySelector(snapshot, '#stickyDrawToggle') ? ['sticky'] : []),
      ...(elementBySelector(snapshot, '#polylineToggle') ? ['polyline'] : [])
    ],
    observedSymmetryModes,
    allowedSymmetryModes: [...SYMMETRY_MODES],
    gallery: Boolean(elementBySelector(snapshot, '#openGalleryButton')),
    capture: {
      supported: Boolean(overlay),
      contentTypes: ['image/png'],
      inlineEncoding: 'base64',
      maxBytes: 2 * 1024 * 1024
    },
    canvas: overlay?.rect || null,
    viewport: snapshot.viewport || null,
    maxPointsPerPass: MAX_DRAW_POINTS
  };
}

function normalizeDrawOptions(input = {}) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const allowed = new Set(['sessionId', 'passName', 'returnCapture', 'includeImage']);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error('DOMISTIKA_DRAW_OPTIONS_INVALID');
  }
  const capture = normalizeCaptureOptions({
    sessionId: value.sessionId,
    passName: value.passName,
    includeImage: value.includeImage
  });
  return {
    ...capture,
    returnCapture: value.returnCapture === true
  };
}

function grantSummary(status = {}) {
  return status.grant
    ? { active: true, expiresAt: Number(status.grant.expiresAt || 0) || null }
    : { active: false, expiresAt: null };
}

function sanitizedScreenshot(response = {}) {
  const shot = response?.screenshot;
  if (!shot) return null;
  return {
    sha256: String(shot.sha256 || ''),
    bytes: Number(shot.bytes || 0),
    size: shot.size || null
  };
}

async function safeAction(client, tabId, action, options = {}) {
  try {
    return await client.action(tabId, action, options);
  } catch (error) {
    if (error?.body?.status === 'HELD') return error.body;
    throw error;
  }
}

function dispositionForAction(result) {
  if (result?.status === 'HELD') return 'HELD';
  return result?.ok === false ? 'FAILED' : 'COMPLETE';
}

async function wait(client, tabId, ms, options = {}) {
  return safeAction(client, tabId, { type: 'wait', ms }, options);
}

class DomistikaSemanticBridge {
  constructor(client, { domistikaUrl = DEFAULT_DOMISTIKA_URL } = {}) {
    if (!client) throw new Error('DOMISTIKA_CLIENT_REQUIRED');
    this.client = client;
    this.domistikaUrl = normalizeDomistikaUrl(domistikaUrl);
  }

  async resolve(options = {}) {
    const operator = await this.client.status(options);
    const tab = findDomistikaTab(operator, this.domistikaUrl);
    return { operator, tab, grant: grantSummary(operator) };
  }

  async status(options = {}) {
    const { operator, tab, grant } = await this.resolve(options);
    if (!tab) {
      return {
        disposition: 'UNAVAILABLE',
        reason: 'DOMISTIKA_TAB_NOT_OPEN',
        url: this.domistikaUrl,
        grant
      };
    }
    const observed = await this.client.observe(tab.id, options);
    const contract = domistikaContract(observed?.snapshot || {});
    return {
      disposition: contract.ok ? 'READY' : 'INCOMPATIBLE',
      reason: contract.ok ? null : 'DOMISTIKA_ACCESSIBLE_INPUT_CONTRACT_NOT_OBSERVED',
      url: tab.url,
      tabId: tab.id,
      grant,
      contract
    };
  }

  async observe(options = {}) {
    const { tab, grant } = await this.resolve(options);
    if (!tab) {
      return {
        disposition: 'UNAVAILABLE',
        reason: 'DOMISTIKA_TAB_NOT_OPEN',
        url: this.domistikaUrl,
        grant
      };
    }
    const observed = await this.client.observe(tab.id, options);
    const snapshot = observed?.snapshot || {};
    return {
      disposition: 'OBSERVED',
      url: tab.url,
      tabId: tab.id,
      grant,
      contract: domistikaContract(snapshot),
      observation: {
        title: String(snapshot.title || '').slice(0, 500),
        text: String(snapshot.text || '').slice(0, 12000),
        viewport: snapshot.viewport || null,
        controls: visibleElements(snapshot)
          .filter((element) => (
            String(element.selector || '').startsWith('#') ||
            element.dataTool
          ))
          .slice(0, 120)
          .map((element) => ({
            selector: element.selector,
            tagName: element.tagName,
            dataTool: element.dataTool || '',
            text: String(element.text || '').slice(0, 180),
            value: element.value,
            ariaPressed: element.ariaPressed || '',
            disabled: Boolean(element.disabled),
            rect: element.rect || null
          }))
      }
    };
  }

  async capabilities(options = {}) {
    const { tab, grant } = await this.resolve(options);
    if (!tab) {
      return {
        disposition: 'UNAVAILABLE',
        reason: 'DOMISTIKA_TAB_NOT_OPEN',
        url: this.domistikaUrl,
        grant
      };
    }
    const observed = await this.client.observe(tab.id, options);
    const snapshot = observed?.snapshot || {};
    const contract = domistikaContract(snapshot);
    return {
      disposition: contract.ok ? 'READY' : 'INCOMPATIBLE',
      reason: contract.ok ? null : 'DOMISTIKA_ACCESSIBLE_INPUT_CONTRACT_NOT_OBSERVED',
      url: tab.url,
      tabId: tab.id,
      grant,
      contract,
      capabilities: domistikaCapabilities(snapshot)
    };
  }

  async capture(captureInput = {}, options = {}) {
    const captureOptions = normalizeCaptureOptions(captureInput);
    const { tab, grant } = await this.resolve(options);
    if (!tab) {
      return {
        disposition: 'UNAVAILABLE',
        reason: 'DOMISTIKA_TAB_NOT_OPEN',
        url: this.domistikaUrl,
        grant
      };
    }
    const observed = await this.client.observe(tab.id, options);
    const snapshot = observed?.snapshot || {};
    const contract = domistikaContract(snapshot);
    if (!contract.ok) {
      return {
        disposition: 'FAILED',
        reason: 'DOMISTIKA_ACCESSIBLE_INPUT_CONTRACT_NOT_OBSERVED',
        tabId: tab.id,
        grant,
        contract
      };
    }
    const screenshot = await this.client.screenshot(tab.id, options);
    const artifact = await boundedCaptureArtifact(screenshot, captureOptions);
    return {
      disposition: 'CAPTURED',
      bridgeVersion: DOMISTIKA_BRIDGE_VERSION,
      tabId: tab.id,
      url: tab.url,
      grant,
      contract,
      capabilities: domistikaCapabilities(snapshot),
      artifact
    };
  }

  async newCanvas(tabId, snapshot, recipe, options = {}) {
    if (!recipe.newCanvas) return { ok: true, snapshot };
    const newButton = elementBySelector(snapshot, '#newProject');
    if (!newButton?.selector) return { ok: false, error: 'DOMISTIKA_NEW_BUTTON_NOT_OBSERVED' };

    let action = await safeAction(this.client, tabId, { type: 'click', selector: newButton.selector }, options);
    if (action?.ok === false) return action;
    await wait(this.client, tabId, 80, options);

    let observed = await this.client.observe(tabId, options);
    let current = observed?.snapshot || {};
    const width = elementBySelector(current, '#newWidth');
    const height = elementBySelector(current, '#newHeight');
    const create = elementBySelector(current, '#createProject');
    if (!width?.selector || !height?.selector || !create?.selector) {
      return { ok: false, error: 'DOMISTIKA_NEW_CANVAS_DIALOG_NOT_OBSERVED' };
    }

    action = await safeAction(this.client, tabId, {
      type: 'type', selector: width.selector, value: String(recipe.newCanvas.width)
    }, options);
    if (action?.ok === false) return action;
    action = await safeAction(this.client, tabId, {
      type: 'type', selector: height.selector, value: String(recipe.newCanvas.height)
    }, options);
    if (action?.ok === false) return action;
    action = await safeAction(this.client, tabId, { type: 'click', selector: create.selector }, options);
    if (action?.ok === false) return action;
    await wait(this.client, tabId, 120, options);
    observed = await this.client.observe(tabId, options);
    current = observed?.snapshot || {};
    return { ok: true, snapshot: current };
  }

  async configure(tabId, snapshot, recipe, options = {}) {
    let current = snapshot;
    const projectName = elementBySelector(current, '#projectName');
    const color = elementBySelector(current, '#colorInput');
    const size = elementBySelector(current, '#sizeInput');
    const symmetry = elementBySelector(current, '#symmetryInput');
    const modeSelector = recipe.mode === 'sticky' ? '#stickyDrawToggle' : '#polylineToggle';
    const modeButton = elementBySelector(current, modeSelector);
    const tool = elementByTool(current, recipe.tool);

    if (!projectName?.selector || !color?.selector || !size?.selector || !symmetry?.selector || !modeButton?.selector || !tool?.selector) {
      return { ok: false, error: 'DOMISTIKA_REQUIRED_CONTROL_NOT_OBSERVED' };
    }

    const actions = [
      { type: 'type', selector: projectName.selector, value: recipe.projectName },
      { type: 'click', selector: tool.selector },
      { type: 'type', selector: color.selector, value: recipe.color },
      { type: 'type', selector: size.selector, value: String(recipe.size) },
      { type: 'select', selector: symmetry.selector, value: recipe.symmetry }
    ];

    for (const actionSpec of actions) {
      const result = await safeAction(this.client, tabId, actionSpec, options);
      if (result?.ok === false) return result;
    }

    let observed = await this.client.observe(tabId, options);
    current = observed?.snapshot || {};
    const refreshedMode = elementBySelector(current, modeSelector);
    if (!refreshedMode?.selector) return { ok: false, error: 'DOMISTIKA_DRAW_MODE_NOT_OBSERVED' };
    if (String(refreshedMode.ariaPressed || '') !== 'true') {
      const result = await safeAction(this.client, tabId, { type: 'click', selector: refreshedMode.selector }, options);
      if (result?.ok === false) return result;
      await wait(this.client, tabId, 50, options);
    }

    observed = await this.client.observe(tabId, options);
    return { ok: true, snapshot: observed?.snapshot || {} };
  }

  async saveGallery(tabId, recipe, options = {}) {
    let observed = await this.client.observe(tabId, options);
    let snapshot = observed?.snapshot || {};
    const open = elementBySelector(snapshot, '#openGalleryButton');
    if (!open?.selector) return { ok: false, error: 'DOMISTIKA_GALLERY_BUTTON_NOT_OBSERVED' };

    let result = await safeAction(this.client, tabId, { type: 'click', selector: open.selector }, options);
    if (result?.ok === false) return result;
    await wait(this.client, tabId, 80, options);

    observed = await this.client.observe(tabId, options);
    snapshot = observed?.snapshot || {};
    const capture = elementBySelector(snapshot, '#captureGalleryCanvas');
    const title = elementBySelector(snapshot, '#galleryTitle');
    const artist = elementBySelector(snapshot, '#galleryArtist');
    const category = elementBySelector(snapshot, '#gallerySubmitCategory');
    const description = elementBySelector(snapshot, '#galleryDescription');
    const consent = elementBySelector(snapshot, '#galleryConsent');
    const submit = buttonByText(snapshot, 'Add to My Gallery');

    if (!capture?.selector || !title?.selector || !artist?.selector || !category?.selector || !description?.selector || !consent?.selector || !submit?.selector) {
      return { ok: false, error: 'DOMISTIKA_GALLERY_CONTROLS_NOT_OBSERVED' };
    }

    const steps = [
      { type: 'click', selector: capture.selector },
      { type: 'type', selector: title.selector, value: recipe.projectName },
      { type: 'type', selector: artist.selector, value: recipe.gallery.artist },
      { type: 'select', selector: category.selector, value: recipe.gallery.category },
      { type: 'type', selector: description.selector, value: recipe.gallery.description }
    ];
    for (const step of steps) {
      result = await safeAction(this.client, tabId, step, options);
      if (result?.ok === false) return result;
    }
    if (!consent.checked) {
      result = await safeAction(this.client, tabId, { type: 'click', selector: consent.selector }, options);
      if (result?.ok === false) return result;
    }
    result = await safeAction(this.client, tabId, { type: 'click', selector: submit.selector }, options);
    if (result?.ok === false) return result;
    await wait(this.client, tabId, 100, options);

    observed = await this.client.observe(tabId, options);
    snapshot = observed?.snapshot || {};
    const close = elementBySelector(snapshot, '#closeGallery');
    if (close?.selector) await safeAction(this.client, tabId, { type: 'click', selector: close.selector }, options);
    return { ok: true };
  }

  async draw(recipeInput, drawOptionsInput = {}, options = {}) {
    const recipe = normalizeDomistikaRecipe(recipeInput);
    const drawOptions = normalizeDrawOptions(drawOptionsInput);
    const { tab, grant } = await this.resolve(options);
    if (!tab) {
      return {
        disposition: 'UNAVAILABLE',
        reason: 'DOMISTIKA_TAB_NOT_OPEN',
        url: this.domistikaUrl
      };
    }
    if (!grant.active || (grant.expiresAt && grant.expiresAt <= Date.now())) {
      return {
        disposition: 'HELD',
        reason: 'HUMAN_INTERACTIVE_GRANT_REQUIRED',
        grant,
        tabId: tab.id
      };
    }

    let observed = await this.client.observe(tab.id, options);
    let snapshot = observed?.snapshot || {};
    let contract = domistikaContract(snapshot);
    if (!contract.ok) {
      return {
        disposition: 'FAILED',
        reason: 'DOMISTIKA_ACCESSIBLE_INPUT_CONTRACT_NOT_OBSERVED',
        contract,
        tabId: tab.id
      };
    }

    const created = await this.newCanvas(tab.id, snapshot, recipe, options);
    if (created?.ok === false) {
      return {
        disposition: dispositionForAction(created),
        reason: created.error || created.authority?.reason || 'DOMISTIKA_NEW_CANVAS_FAILED',
        stage: 'NEW_CANVAS',
        tabId: tab.id,
        grant
      };
    }
    snapshot = created.snapshot || snapshot;

    const configured = await this.configure(tab.id, snapshot, recipe, options);
    if (configured?.ok === false) {
      return {
        disposition: dispositionForAction(configured),
        reason: configured.error || configured.authority?.reason || 'DOMISTIKA_CONFIGURE_FAILED',
        stage: 'CONFIGURE',
        tabId: tab.id,
        grant
      };
    }
    snapshot = configured.snapshot || snapshot;

    const overlay = elementBySelector(snapshot, '#overlay');
    if (!overlay?.selector) {
      return {
        disposition: 'FAILED',
        reason: 'DOMISTIKA_CANVAS_NOT_OBSERVED',
        stage: 'DRAW',
        tabId: tab.id
      };
    }

    const draw = await safeAction(this.client, tab.id, {
      type: 'pointer_path',
      selector: overlay.selector,
      mode: recipe.mode,
      points: recipe.points,
      finish: recipe.mode === 'polyline' ? 'enter' : 'none',
      intervalMs: recipe.intervalMs
    }, options);

    if (draw?.ok === false) {
      return {
        disposition: dispositionForAction(draw),
        reason: draw.error || draw.authority?.reason || 'DOMISTIKA_DRAW_FAILED',
        stage: 'DRAW',
        tabId: tab.id,
        grant
      };
    }

    await wait(this.client, tab.id, 120, options);

    if (recipe.saveToGallery) {
      const gallery = await this.saveGallery(tab.id, recipe, options);
      if (gallery?.ok === false) {
        return {
          disposition: dispositionForAction(gallery),
          reason: gallery.error || gallery.authority?.reason || 'DOMISTIKA_GALLERY_SAVE_FAILED',
          stage: 'GALLERY',
          tabId: tab.id,
          grant,
          drawingCommitted: true
        };
      }
    }

    const finalObserved = await this.client.observe(tab.id, options);
    const finalSnapshot = finalObserved?.snapshot || {};
    const screenshot = await this.client.screenshot(tab.id, options).catch(() => null);
    contract = domistikaContract(finalSnapshot);
    let artifact = null;
    if (drawOptions.returnCapture && screenshot) {
      artifact = await boundedCaptureArtifact(screenshot, {
        sessionId: drawOptions.sessionId,
        passName: drawOptions.passName,
        includeImage: drawOptions.includeImage
      });
    }

    return {
      disposition: 'COMPLETE',
      bridgeVersion: DOMISTIKA_BRIDGE_VERSION,
      tabId: tab.id,
      url: tab.url,
      grant,
      sessionId: drawOptions.sessionId,
      passName: drawOptions.passName,
      recipe: {
        projectName: recipe.projectName,
        tool: recipe.tool,
        color: recipe.color,
        size: recipe.size,
        symmetry: recipe.symmetry,
        mode: recipe.mode,
        pointCount: recipe.points.length,
        newCanvas: recipe.newCanvas,
        savedToGallery: recipe.saveToGallery
      },
      pointer: draw.result || null,
      contract,
      capabilities: domistikaCapabilities(finalSnapshot),
      screenshot: sanitizedScreenshot(screenshot),
      artifact,
      observation: {
        title: String(finalSnapshot.title || '').slice(0, 500),
        text: String(finalSnapshot.text || '').slice(0, 12000)
      }
    };
  }
}

module.exports = {
  DOMISTIKA_BRIDGE_VERSION,
  DEFAULT_DOMISTIKA_URL,
  DOMISTIKA_PATH_PREFIX,
  DRAW_TOOLS,
  DRAW_MODES,
  SYMMETRY_MODES,
  GALLERY_CATEGORIES,
  MAX_DRAW_POINTS,
  normalizeOrigin,
  normalizeDomistikaUrl,
  isDomistikaUrl,
  findDomistikaTab,
  normalizeDomistikaRecipe,
  visibleElements,
  elementBySelector,
  elementByTool,
  buttonByText,
  domistikaContract,
  domistikaCapabilities,
  normalizeDrawOptions,
  grantSummary,
  sanitizedScreenshot,
  DomistikaSemanticBridge
};
