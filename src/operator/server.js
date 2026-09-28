const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { classifyAction, evaluateAuthority } = require('./policy');
const { OBSERVE_SCRIPT, TARGET_SCRIPT } = require('./observe');
const { OperatorReceiptLedger } = require('./receipts');
const { OllamaPlanner } = require('./planner');
const { BrowserTaskEngine } = require('./task-engine');
const { executePointerPath, normalizePointerPath } = require('./pointer-path');

const HOST = '127.0.0.1';
const DEFAULT_PORT = 3697;
const VERSION = 'PV-BOP-0.2';
const BODY_LIMIT = 1024 * 1024;

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store'
  });
  res.end(payload);
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw Object.assign(new Error('BODY_TOO_LARGE'), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function bearer(req) {
  const value = String(req.headers.authorization || '');
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match ? match[1].trim() : '';
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function selectorFrom(body = {}) {
  const selector = String(body.selector || '').trim();
  if (!selector) throw Object.assign(new Error('SELECTOR_REQUIRED'), { statusCode: 400 });
  if (selector.length > 2000) throw Object.assign(new Error('SELECTOR_TOO_LONG'), { statusCode: 400 });
  return selector;
}

function actionScript(action, selector) {
  const type = String(action.type || '').toLowerCase();
  if (type === 'click') {
    return `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return {ok:false,error:'TARGET_NOT_FOUND'}; if (el.disabled || el.getAttribute('aria-disabled') === 'true') return {ok:false,error:'TARGET_DISABLED'}; el.click(); return {ok:true}; })()`;
  }
  if (type === 'type') {
    const value = String(action.value ?? '');
    return `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return {ok:false,error:'TARGET_NOT_FOUND'}; if (!('value' in el) && !el.isContentEditable) return {ok:false,error:'TARGET_NOT_EDITABLE'}; el.focus(); if ('value' in el) { const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set; if (setter) setter.call(el, ${JSON.stringify(value)}); else el.value = ${JSON.stringify(value)}; } else { el.textContent = ${JSON.stringify(value)}; } el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return {ok:true}; })()`;
  }
  if (type === 'select') {
    const value = String(action.value ?? '');
    return `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return {ok:false,error:'TARGET_NOT_FOUND'}; if (el.tagName !== 'SELECT') return {ok:false,error:'TARGET_NOT_SELECT'}; el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return {ok:true,value:el.value}; })()`;
  }
  throw Object.assign(new Error('UNSUPPORTED_ACTION'), { statusCode: 400 });
}

async function writeEndpointFile(userDataPath, token, port) {
  const dir = path.join(userDataPath, 'operator');
  const filePath = path.join(dir, 'endpoint.json');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify({
    schema: 'browsallax.operator.endpoint.v1',
    version: VERSION,
    host: HOST,
    port,
    token,
    updated_at: new Date().toISOString()
  }, null, 2), { encoding: 'utf8', mode: 0o600 });
  try { await fs.chmod(filePath, 0o600); } catch {}
  return filePath;
}

function startOperatorServer({ userDataPath, getTab, listTabs, navigateTab, getGrant, onStatus, planner: providedPlanner }) {
  const token = crypto.randomBytes(32).toString('hex');
  const ledger = new OperatorReceiptLedger(userDataPath);
  let port = DEFAULT_PORT;
  let server = null;
  let endpointFile = null;

  const authorize = (req) => safeEqual(bearer(req), token);
  const requireTab = (id) => {
    const tab = getTab(id);
    if (!tab || tab.view.webContents.isDestroyed()) throw Object.assign(new Error('TAB_NOT_FOUND'), { statusCode: 404 });
    return tab;
  };

  const observeForTask = async (tabId, meta = {}) => {
    const tab = requireTab(tabId);
    const snapshot = await tab.view.webContents.executeJavaScript(OBSERVE_SCRIPT, true);
    await ledger.append('OBSERVATION', {
      tabId: tab.id,
      url: snapshot.url,
      title: snapshot.title,
      elementCount: snapshot.elements.length,
      ...meta
    });
    return snapshot;
  };

  const navigateForTask = async (tabId, targetUrl, meta = {}) => {
    const tab = requireTab(tabId);
    const authority = evaluateAuthority('NAVIGATION', getGrant());
    if (!authority.allowed) {
      return { ok: false, status: 'HELD', actionClass: 'NAVIGATION', authority };
    }
    try {
      await navigateTab(tab.id, targetUrl);
      const receipt = await ledger.append('NAVIGATION', {
        tabId: tab.id,
        url: targetUrl,
        authority,
        ...meta
      });
      return { ok: true, actionClass: 'NAVIGATION', authority, receipt };
    } catch (error) {
      return { ok: false, error: error?.message || 'NAVIGATION_FAILED', actionClass: 'NAVIGATION', authority };
    }
  };

  const executeForTask = async (tabId, action = {}, meta = {}) => {
    const tab = requireTab(tabId);
    const type = String(action.type || '').toLowerCase();

    if (type === 'scroll') {
      const dx = Math.max(-10000, Math.min(10000, Number(action.dx || 0)));
      const dy = Math.max(-10000, Math.min(10000, Number(action.dy || 0)));
      await tab.view.webContents.executeJavaScript(`window.scrollBy(${JSON.stringify(dx)}, ${JSON.stringify(dy)}); true`, true);
      const receipt = await ledger.append('ACTION', {
        tabId: tab.id,
        action: { type, dx, dy },
        actionClass: 'READ_ONLY',
        authority: 'BASELINE_LOCAL_OPERATOR',
        ...meta
      });
      return { ok: true, actionClass: 'READ_ONLY', authority: 'BASELINE_LOCAL_OPERATOR', receipt };
    }

    if (type === 'wait') {
      const ms = Math.max(0, Math.min(30000, Number(action.ms || 0)));
      await new Promise((resolve) => setTimeout(resolve, ms));
      const receipt = await ledger.append('ACTION', {
        tabId: tab.id,
        action: { type, ms },
        actionClass: 'READ_ONLY',
        authority: 'BASELINE_LOCAL_OPERATOR',
        ...meta
      });
      return { ok: true, actionClass: 'READ_ONLY', authority: 'BASELINE_LOCAL_OPERATOR', receipt };
    }

    const selector = selectorFrom(action);
    const target = await tab.view.webContents.executeJavaScript(TARGET_SCRIPT(selector), true);
    if (!target) return { ok: false, error: 'TARGET_NOT_FOUND' };

    const actionClass = classifyAction(action, target);
    const authority = evaluateAuthority(actionClass, getGrant());
    if (!authority.allowed) {
      const receipt = await ledger.append('HELD', {
        tabId: tab.id,
        action: { ...action, value: action.value != null ? '[REDACTED]' : undefined },
        target,
        actionClass,
        authority,
        ...meta
      });
      return { ok: false, status: 'HELD', actionClass, authority, receipt };
    }

    let result;
    let receiptAction = { ...action, value: action.value != null ? '[REDACTED]' : undefined };
    if (type === 'pointer_path') {
      const pointer = normalizePointerPath(action);
      result = await executePointerPath(tab.view.webContents, target.rect, pointer);
      receiptAction = {
        type: 'pointer_path',
        selector,
        mode: pointer.mode,
        finish: pointer.finish,
        intervalMs: pointer.intervalMs,
        pointCount: pointer.points.length
      };
    } else {
      result = await tab.view.webContents.executeJavaScript(actionScript(action, selector), true);
    }
    const receipt = await ledger.append('ACTION', {
      tabId: tab.id,
      action: receiptAction,
      target,
      actionClass,
      authority,
      result,
      ...meta
    });
    return {
      ok: result?.ok !== false,
      actionClass,
      authority,
      result,
      receipt,
      error: result?.ok === false ? result?.error || 'ACTION_FAILED' : null
    };
  };

  const assertForTask = async (tabId, assertion = {}, meta = {}) => {
    const tab = requireTab(tabId);
    const kind = String(assertion.kind || '').toLowerCase();
    let pass = false;
    let actual = null;

    if (kind === 'url_contains') {
      actual = tab.view.webContents.getURL();
      pass = actual.includes(String(assertion.value || ''));
    } else if (kind === 'text_contains') {
      const needle = String(assertion.value || '');
      actual = await tab.view.webContents.executeJavaScript('document.body ? document.body.innerText : ""', true);
      pass = String(actual).includes(needle);
      actual = pass ? needle : String(actual).slice(0, 2000);
    } else if (kind === 'visible') {
      const selector = selectorFrom(assertion);
      actual = await tab.view.webContents.executeJavaScript(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; const s=getComputedStyle(el), r=el.getBoundingClientRect(); return s.display!=='none' && s.visibility!=='hidden' && r.width>0 && r.height>0; })()`, true);
      pass = Boolean(actual);
    } else {
      return { ok: false, pass: false, error: 'UNSUPPORTED_ASSERTION' };
    }

    const receipt = await ledger.append('ASSERTION', {
      tabId: tab.id,
      assertion,
      pass,
      actual,
      ...meta
    });
    return { ok: pass, pass, actual, receipt };
  };

  const localPlanner = providedPlanner || new OllamaPlanner();
  const taskEngine = new BrowserTaskEngine({
    planner: localPlanner,
    ledger,
    observe: observeForTask,
    navigate: navigateForTask,
    executeAction: executeForTask,
    assert: assertForTask,
    getGrant
  });

  const handler = async (req, res) => {
    try {
      const url = new URL(req.url, `http://${HOST}`);
      if (req.method === 'GET' && url.pathname === '/v1/health') {
        return json(res, 200, { ok: true, version: VERSION, host: HOST, port, authority: 'HUMAN_GOVERNED' });
      }

      if (!authorize(req)) return json(res, 401, { ok: false, error: 'UNAUTHORIZED' });

      if (req.method === 'GET' && url.pathname === '/v1/planner/status') {
        const refresh = url.searchParams.get('refresh') === '1';
        const plannerStatus = await localPlanner.status({ refresh });
        return json(res, 200, { ok: true, planner: plannerStatus });
      }

      if (req.method === 'GET' && url.pathname === '/v1/tasks') {
        return json(res, 200, { ok: true, tasks: taskEngine.list() });
      }

      if (req.method === 'POST' && url.pathname === '/v1/tasks') {
        const body = await readJson(req);
        requireTab(body.tabId);
        const task = await taskEngine.create(body);
        return json(res, 202, { ok: true, task });
      }

      const taskMatch = /^\/v1\/tasks\/([^/]+)(?:\/(resume|cancel))?$/.exec(url.pathname);
      if (taskMatch && req.method === 'GET' && !taskMatch[2]) {
        const task = taskEngine.get(decodeURIComponent(taskMatch[1]));
        if (!task) return json(res, 404, { ok: false, error: 'TASK_NOT_FOUND' });
        return json(res, 200, { ok: true, task });
      }

      if (taskMatch && req.method === 'POST' && taskMatch[2] === 'resume') {
        const task = await taskEngine.resume(decodeURIComponent(taskMatch[1]));
        return json(res, 202, { ok: true, task });
      }

      if (taskMatch && req.method === 'POST' && taskMatch[2] === 'cancel') {
        const body = await readJson(req);
        const task = await taskEngine.cancel(
          decodeURIComponent(taskMatch[1]),
          String(body.reason || 'USER_CANCELLED').slice(0, 500)
        );
        return json(res, 200, { ok: true, task });
      }

      if (req.method === 'GET' && url.pathname === '/v1/status') {
        const grant = getGrant();
        return json(res, 200, {
          ok: true,
          version: VERSION,
          tabs: listTabs(),
          grant: grant && grant.enabled ? { id: grant.id, expiresAt: grant.expiresAt } : null,
          receiptLedger: ledger.filePath,
          tasks: {
            total: taskEngine.list().length,
            running: taskEngine.list().filter((task) => task.status === 'RUNNING' || task.status === 'QUEUED').length,
            held: taskEngine.list().filter((task) => task.status === 'HELD').length
          }
        });
      }

      if (req.method === 'POST' && url.pathname === '/v1/navigate') {
        const body = await readJson(req);
        const targetUrl = String(body.url || '').trim();
        if (!targetUrl) return json(res, 400, { ok: false, error: 'URL_REQUIRED' });
        const tab = requireTab(body.tabId);
        const authority = evaluateAuthority('NAVIGATION', getGrant());
        if (!authority.allowed) return json(res, 403, { ok: false, status: 'HELD', authority });
        await navigateTab(tab.id, targetUrl);
        const receipt = await ledger.append('NAVIGATION', { tabId: tab.id, url: targetUrl, authority });
        return json(res, 200, { ok: true, receipt });
      }

      if (req.method === 'POST' && url.pathname === '/v1/screenshot') {
        const body = await readJson(req);
        const tab = requireTab(body.tabId);
        let clip = null;
        if (body.clip != null) {
          if (!body.clip || typeof body.clip !== 'object' || Array.isArray(body.clip)) {
            return json(res, 400, { ok: false, error: 'SCREENSHOT_CLIP_INVALID' });
          }
          const x = Math.round(Number(body.clip.x));
          const y = Math.round(Number(body.clip.y));
          const width = Math.round(Number(body.clip.width));
          const height = Math.round(Number(body.clip.height));
          if (![x, y, width, height].every(Number.isFinite) ||
              x < 0 || y < 0 || width < 1 || height < 1 || width > 16384 || height > 16384) {
            return json(res, 400, { ok: false, error: 'SCREENSHOT_CLIP_INVALID' });
          }
          clip = { x, y, width, height };
        }
        const image = await tab.view.webContents.capturePage(clip || undefined);
        const png = image.toPNG();
        const digest = crypto.createHash('sha256').update(png).digest('hex');
        const captureDir = path.join(userDataPath, 'operator', 'captures');
        await fs.mkdir(captureDir, { recursive: true });
        const filename = `capture-${Date.now()}-${digest.slice(0, 12)}.png`;
        const filePath = path.join(captureDir, filename);
        await fs.writeFile(filePath, png);
        const receipt = await ledger.append('SCREENSHOT', {
          tabId: tab.id,
          url: tab.view.webContents.getURL(),
          title: tab.title || tab.view.webContents.getTitle() || '',
          sha256: digest,
          bytes: png.length,
          size: image.getSize(),
          clip,
          filePath
        });
        return json(res, 200, {
          ok: true,
          screenshot: { filePath, sha256: digest, bytes: png.length, size: image.getSize(), clip },
          receipt
        });
      }

      if (req.method === 'GET' && url.pathname === '/v1/observe') {
        const tabId = url.searchParams.get('tabId');
        const tab = requireTab(tabId);
        const snapshot = await tab.view.webContents.executeJavaScript(OBSERVE_SCRIPT, true);
        const receipt = await ledger.append('OBSERVATION', {
          tabId: tab.id,
          url: snapshot.url,
          title: snapshot.title,
          elementCount: snapshot.elements.length
        });
        return json(res, 200, { ok: true, snapshot, receipt });
      }

      if (req.method === 'POST' && url.pathname === '/v1/action') {
        const body = await readJson(req);
        const tab = requireTab(body.tabId);
        const action = body.action || {};
        const type = String(action.type || '').toLowerCase();

        if (type === 'scroll') {
          const dx = Math.max(-10000, Math.min(10000, Number(action.dx || 0)));
          const dy = Math.max(-10000, Math.min(10000, Number(action.dy || 0)));
          await tab.view.webContents.executeJavaScript(`window.scrollBy(${JSON.stringify(dx)}, ${JSON.stringify(dy)}); true`, true);
          const receipt = await ledger.append('ACTION', { tabId: tab.id, action: { type, dx, dy }, actionClass: 'READ_ONLY', authority: 'BASELINE_LOCAL_OPERATOR' });
          return json(res, 200, { ok: true, receipt });
        }

        if (type === 'wait') {
          const ms = Math.max(0, Math.min(30000, Number(action.ms || 0)));
          await new Promise((resolve) => setTimeout(resolve, ms));
          const receipt = await ledger.append('ACTION', { tabId: tab.id, action: { type, ms }, actionClass: 'READ_ONLY', authority: 'BASELINE_LOCAL_OPERATOR' });
          return json(res, 200, { ok: true, receipt });
        }

        const selector = selectorFrom(action);
        const target = await tab.view.webContents.executeJavaScript(TARGET_SCRIPT(selector), true);
        if (!target) return json(res, 404, { ok: false, error: 'TARGET_NOT_FOUND' });
        const actionClass = classifyAction(action, target);
        const authority = evaluateAuthority(actionClass, getGrant());

        if (!authority.allowed) {
          const receipt = await ledger.append('HELD', { tabId: tab.id, action: { ...action, value: action.value ? '[REDACTED]' : undefined }, target, actionClass, authority });
          return json(res, 403, { ok: false, status: 'HELD', actionClass, authority, receipt });
        }

        let result;
        let receiptAction = { ...action, value: action.value != null ? '[REDACTED]' : undefined };
        if (type === 'pointer_path') {
          const pointer = normalizePointerPath(action);
          result = await executePointerPath(tab.view.webContents, target.rect, pointer);
          receiptAction = {
            type: 'pointer_path',
            selector,
            mode: pointer.mode,
            finish: pointer.finish,
            intervalMs: pointer.intervalMs,
            pointCount: pointer.points.length
          };
        } else {
          result = await tab.view.webContents.executeJavaScript(actionScript(action, selector), true);
        }
        const receipt = await ledger.append('ACTION', {
          tabId: tab.id,
          action: receiptAction,
          target,
          actionClass,
          authority,
          result
        });
        return json(res, result?.ok === false ? 409 : 200, { ok: result?.ok !== false, actionClass, authority, result, receipt });
      }

      if (req.method === 'POST' && url.pathname === '/v1/assert') {
        const body = await readJson(req);
        const tab = requireTab(body.tabId);
        const assertion = body.assertion || {};
        const kind = String(assertion.kind || '').toLowerCase();
        let pass = false;
        let actual = null;

        if (kind === 'url_contains') {
          actual = tab.view.webContents.getURL();
          pass = actual.includes(String(assertion.value || ''));
        } else if (kind === 'text_contains') {
          const needle = String(assertion.value || '');
          actual = await tab.view.webContents.executeJavaScript('document.body ? document.body.innerText : ""', true);
          pass = String(actual).includes(needle);
          actual = pass ? needle : String(actual).slice(0, 2000);
        } else if (kind === 'visible') {
          const selector = selectorFrom(assertion);
          actual = await tab.view.webContents.executeJavaScript(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; const s=getComputedStyle(el), r=el.getBoundingClientRect(); return s.display!=='none' && s.visibility!=='hidden' && r.width>0 && r.height>0; })()`, true);
          pass = Boolean(actual);
        } else {
          return json(res, 400, { ok: false, error: 'UNSUPPORTED_ASSERTION' });
        }

        const receipt = await ledger.append('ASSERTION', { tabId: tab.id, assertion, pass, actual });
        return json(res, pass ? 200 : 409, { ok: pass, pass, actual, receipt });
      }

      return json(res, 404, { ok: false, error: 'NOT_FOUND' });
    } catch (error) {
      const status = Number(error.statusCode || 500);
      await ledger.append('ERROR', { message: error.message, status }).catch(() => {});
      return json(res, status, { ok: false, error: error.message || 'INTERNAL_ERROR' });
    }
  };

  server = http.createServer(handler);
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE' && port === DEFAULT_PORT) {
      port = 0;
      server.listen(port, HOST);
      return;
    }
    console.error('[Browsallax Operator] server error', error);
  });

  server.on('listening', async () => {
    const address = server.address();
    port = typeof address === 'object' && address ? address.port : port;
    endpointFile = await writeEndpointFile(userDataPath, token, port);
    const status = { running: true, version: VERSION, host: HOST, port, endpointFile };
    console.log(`[Browsallax Operator] ${VERSION} listening at http://${HOST}:${port}`);
    onStatus?.(status);
    await ledger.append('SERVER_STARTED', { host: HOST, port, endpointFile, version: VERSION });
  });

  server.listen(port, HOST);

  return {
    version: VERSION,
    internal: {
      plannerStatus: (refresh = false) => localPlanner.status({ refresh }),
      createTask: async (input) => {
        requireTab(input?.tabId);
        return taskEngine.create(input);
      },
      getTask: (id) => taskEngine.get(id),
      resumeTask: (id) => taskEngine.resume(id),
      cancelTask: (id, reason = 'INTERNAL_CANCELLED') => taskEngine.cancel(id, reason)
    },
    close: async () => {
      if (server?.listening) await new Promise((resolve) => server.close(() => resolve()));
      await taskEngine.shutdown?.();
      if (endpointFile) await fs.unlink(endpointFile).catch(() => {});
    },
    getStatus: () => ({
      running: Boolean(server?.listening),
      version: VERSION,
      host: HOST,
      port,
      endpointFile,
      taskCount: taskEngine.list().length
    })
  };
}

module.exports = { startOperatorServer, VERSION };
