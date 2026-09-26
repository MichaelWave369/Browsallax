const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { app, BrowserWindow, WebContentsView, ipcMain, session, Menu } = require('electron');
const { startOperatorServer } = require('./operator/server');
const {
  isTrustedPageUrl,
  callerOrigin,
  ownerKey,
  normalizePageTaskSpec,
  publicPageBridgeManifest
} = require('./operator/trusted-page');

const TOOLBAR_HEIGHT = 96;
const START_URL = 'https://duckduckgo.com/';
const PARTITION = 'persist:browsallax';
const OPERATOR_GRANT_MS = 5 * 60 * 1000;

app.enableSandbox();

let mainWindow = null;
let nextTabId = 1;
let activeTabId = null;
let operatorService = null;
let operatorStatus = { running: false, version: 'PV-BOP-0.2', host: '127.0.0.1', port: null };
let operatorGrant = null;
const tabs = new Map();
const trustedPageTasks = new Map();

function normalizeInput(input) {
  const value = String(input || '').trim();
  if (!value) return START_URL;

  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
  } catch {}

  const looksLikeHost = /^[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#].*)?$/i.test(value);
  if (looksLikeHost) return `https://${value}`;

  return `https://duckduckgo.com/?q=${encodeURIComponent(value)}`;
}

function safePageUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || rawUrl === 'about:blank';
  } catch {
    return rawUrl === 'about:blank';
  }
}

function getActiveTab() {
  return activeTabId ? tabs.get(activeTabId) : null;
}

function getTab(id) {
  if (id === undefined || id === null || id === '') return getActiveTab();
  return tabs.get(Number(id)) || null;
}

function getOperatorGrant() {
  if (operatorGrant && operatorGrant.expiresAt <= Date.now()) operatorGrant = null;
  return operatorGrant;
}

function operatorGrantSummary() {
  const grant = getOperatorGrant();
  return grant ? { id: grant.id, expiresAt: grant.expiresAt } : null;
}

function listOperatorTabs() {
  return [...tabs.values()].map((tab) => ({
    id: tab.id,
    title: tab.title,
    url: tab.view.webContents.getURL(),
    active: tab.id === activeTabId,
    loading: tab.view.webContents.isLoading()
  }));
}

function trustedCaller(event) {
  const url = event.senderFrame?.url || event.sender?.getURL?.() || '';
  if (!isTrustedPageUrl(url)) {
    throw Object.assign(new Error('TRUSTED_PAGE_ORIGIN_REQUIRED'), { statusCode: 403 });
  }
  const origin = callerOrigin(url);
  return {
    origin,
    webContentsId: event.sender.id,
    owner: ownerKey(origin, event.sender.id)
  };
}

function requireTrustedTask(event, taskId) {
  const caller = trustedCaller(event);
  const record = trustedPageTasks.get(String(taskId || ''));
  if (!record || record.owner !== caller.owner) {
    throw Object.assign(new Error('TRUSTED_PAGE_TASK_NOT_OWNED'), { statusCode: 403 });
  }
  return { caller, record };
}

function waitForTabReady(tabId, timeoutMs = 20000) {
  const tab = getTab(tabId);
  if (!tab) return Promise.reject(new Error('TAB_NOT_FOUND'));
  const wc = tab.view.webContents;
  if (!wc.isLoading() && wc.getURL() && wc.getURL() !== 'about:blank') return Promise.resolve(tab);

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      wc.removeListener('did-finish-load', finish);
      wc.removeListener('did-fail-load', fail);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(tab);
    };
    const fail = (_event, code, description, validatedURL, isMainFrame) => {
      if (!isMainFrame || code === -3 || settled) return;
      settled = true;
      cleanup();
      reject(new Error(`TASK_TAB_LOAD_FAILED_${code}_${description || validatedURL || ''}`));
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('TASK_TAB_LOAD_TIMEOUT'));
    }, timeoutMs);
    wc.once('did-finish-load', finish);
    wc.on('did-fail-load', fail);
  });
}

function cleanupTrustedTaskTab(record, task) {
  if (!record || record.tabClosed || record.closeOnTerminal === false) return;
  if (!task || !['COMPLETE', 'FAILED', 'CANCELLED'].includes(task.status)) return;
  record.tabClosed = true;
  closeTab(record.tabId);
}

function ledgerPath() {
  return path.join(app.getPath('userData'), 'reality-ledger', 'web-captures.jsonl');
}

async function captureSelectionReceipt(tab, selectionText) {
  const text = String(selectionText || '').trim();
  if (!text) return;

  const capturedAt = new Date().toISOString();
  const bytes = Buffer.from(text, 'utf8');
  const receipt = {
    schema: 'browsallax.reality-ledger.web-capture.v1',
    authority: 'SOURCE_ONLY',
    captured_at: capturedAt,
    source: {
      url: tab.view.webContents.getURL(),
      title: tab.title || tab.view.webContents.getTitle() || ''
    },
    observation: {
      type: 'SELECTED_TEXT',
      text,
      utf8_bytes: bytes.length
    },
    integrity: {
      algorithm: 'sha256',
      digest: crypto.createHash('sha256').update(bytes).digest('hex')
    },
    derived: false
  };

  const filePath = ledgerPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(receipt)}\n`, 'utf8');
  console.log(`[Browsallax] Reality Ledger receipt appended: ${filePath}`);
}

function sendState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const active = getActiveTab();
  const state = {
    activeTabId,
    active: active
      ? {
          id: active.id,
          title: active.title,
          url: active.view.webContents.getURL(),
          loading: active.view.webContents.isLoading(),
          canGoBack: active.view.webContents.navigationHistory.canGoBack(),
          canGoForward: active.view.webContents.navigationHistory.canGoForward()
        }
      : null,
    tabs: [...tabs.values()].map((tab) => ({
      id: tab.id,
      title: tab.title,
      url: tab.view.webContents.getURL(),
      active: tab.id === activeTabId
    })),
    operator: {
      ...operatorStatus,
      grant: operatorGrantSummary()
    }
  };

  mainWindow.webContents.send('browser:state', state);
}

function layoutActiveView() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const active = getActiveTab();
  if (!active) return;

  const [width, height] = mainWindow.getContentSize();
  active.view.setBounds({
    x: 0,
    y: TOOLBAR_HEIGHT,
    width: Math.max(1, width),
    height: Math.max(1, height - TOOLBAR_HEIGHT)
  });
}

function bindTabEvents(tab) {
  const wc = tab.view.webContents;

  wc.setWindowOpenHandler(({ url }) => {
    if (safePageUrl(url)) createTab(url, true);
    return { action: 'deny' };
  });

  wc.on('will-navigate', (event, url) => {
    if (!safePageUrl(url)) event.preventDefault();
  });

  wc.on('context-menu', (_event, params) => {
    const template = [];

    if (params.selectionText?.trim()) {
      template.push({
        label: 'Capture selection to Reality Ledger',
        click: () => {
          captureSelectionReceipt(tab, params.selectionText).catch((error) => {
            console.error('[Browsallax] Reality Ledger capture failed', error);
          });
        }
      });
      template.push({ type: 'separator' });
    }

    if (params.isEditable) {
      template.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' });
    } else if (params.selectionText?.trim()) {
      template.push({ role: 'copy' });
    }

    if (template.length > 0) Menu.buildFromTemplate(template).popup();
  });

  wc.on('page-title-updated', (_event, title) => {
    tab.title = title || 'New Tab';
    sendState();
  });

  wc.on('did-start-loading', sendState);
  wc.on('did-stop-loading', sendState);
  wc.on('did-navigate', sendState);
  wc.on('did-navigate-in-page', sendState);

  wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    tab.title = 'Page failed to load';
    sendState();
    console.error('[Browsallax] load failure', { errorCode, errorDescription, validatedURL });
  });
}

function createTab(url = START_URL, makeActive = true) {
  if (!mainWindow || mainWindow.isDestroyed()) return null;

  const id = nextTabId++;
  const view = new WebContentsView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition: PARTITION,
      preload: path.join(__dirname, 'page-preload.js'),
      spellcheck: true
    }
  });

  view.setBackgroundColor('#0b1016');
  const tab = { id, view, title: 'New Tab' };
  tabs.set(id, tab);
  bindTabEvents(tab);

  if (makeActive) activateTab(id);
  view.webContents.loadURL(normalizeInput(url));
  sendState();
  return id;
}

function activateTab(id) {
  const tab = tabs.get(Number(id));
  if (!tab || !mainWindow || mainWindow.isDestroyed()) return;

  const current = getActiveTab();
  if (current && current.id !== tab.id) {
    mainWindow.contentView.removeChildView(current.view);
  }

  activeTabId = tab.id;
  mainWindow.contentView.addChildView(tab.view);
  layoutActiveView();
  sendState();
}

function closeTab(id) {
  const numericId = Number(id);
  const tab = tabs.get(numericId);
  if (!tab || !mainWindow || mainWindow.isDestroyed()) return;

  const wasActive = numericId === activeTabId;
  try { mainWindow.contentView.removeChildView(tab.view); } catch {}
  tab.view.webContents.close();
  tabs.delete(numericId);

  if (tabs.size === 0) {
    activeTabId = null;
    createTab(START_URL, true);
    return;
  }

  if (wasActive) {
    const next = [...tabs.values()].at(-1);
    activateTab(next.id);
  } else {
    sendState();
  }
}

function configureSession() {
  const browserSession = session.fromPartition(PARTITION);

  browserSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'fullscreen' || permission === 'clipboard-sanitized-write';
  });

  browserSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = permission === 'fullscreen' || permission === 'clipboard-sanitized-write';
    callback(allowed);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b1016',
    title: 'Browsallax',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('resize', layoutActiveView);
  mainWindow.on('closed', () => {
    for (const tab of tabs.values()) tab.view.webContents.close();
    tabs.clear();
    activeTabId = null;
    mainWindow = null;
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (tabs.size === 0) createTab(START_URL, true);
    sendState();
  });
}

function startLocalOperator() {
  operatorService = startOperatorServer({
    userDataPath: app.getPath('userData'),
    getTab,
    listTabs: listOperatorTabs,
    navigateTab: async (tabId, input) => {
      const tab = getTab(tabId);
      if (!tab) throw Object.assign(new Error('TAB_NOT_FOUND'), { statusCode: 404 });
      const url = normalizeInput(input);
      if (!safePageUrl(url)) throw Object.assign(new Error('UNSAFE_URL'), { statusCode: 400 });
      await tab.view.webContents.loadURL(url);
    },
    getGrant: getOperatorGrant,
    onStatus: (status) => {
      operatorStatus = status;
      sendState();
    }
  });
}

ipcMain.on('browser:navigate', (_event, input) => {
  const active = getActiveTab();
  if (active) active.view.webContents.loadURL(normalizeInput(input));
});

ipcMain.on('browser:back', () => {
  const wc = getActiveTab()?.view.webContents;
  if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
});

ipcMain.on('browser:forward', () => {
  const wc = getActiveTab()?.view.webContents;
  if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
});

ipcMain.on('browser:reload', () => getActiveTab()?.view.webContents.reload());
ipcMain.on('browser:home', () => getActiveTab()?.view.webContents.loadURL(START_URL));
ipcMain.on('browser:new-tab', () => createTab(START_URL, true));
ipcMain.on('browser:activate-tab', (_event, id) => activateTab(id));
ipcMain.on('browser:close-tab', (_event, id) => closeTab(id));

ipcMain.on('operator:grant-interactive', () => {
  operatorGrant = {
    id: crypto.randomUUID(),
    enabled: true,
    grantedAt: Date.now(),
    expiresAt: Date.now() + OPERATOR_GRANT_MS
  };
  sendState();
});

ipcMain.on('operator:revoke-interactive', () => {
  operatorGrant = null;
  sendState();
});

ipcMain.handle('trusted-page:manifest', (event) => {
  const caller = trustedCaller(event);
  return {
    ...publicPageBridgeManifest(),
    connected: Boolean(operatorService),
    callerOrigin: caller.origin
  };
});

ipcMain.handle('trusted-page:status', async (event) => {
  const caller = trustedCaller(event);
  if (!operatorService) return {
    ok: false,
    connected: false,
    bridge: publicPageBridgeManifest(),
    callerOrigin: caller.origin
  };

  const rawStatus = operatorService.getStatus();
  const planner = await operatorService.internal.plannerStatus(false).catch((error) => ({
    available: false,
    error: error?.message || 'PLANNER_STATUS_FAILED'
  }));
  return {
    ok: true,
    connected: true,
    bridge: publicPageBridgeManifest(),
    callerOrigin: caller.origin,
    operator: {
      running: rawStatus.running,
      version: rawStatus.version,
      taskCount: rawStatus.taskCount
    },
    planner,
    interactiveGrant: operatorGrantSummary()
  };
});

ipcMain.handle('trusted-page:start-task', async (event, input) => {
  const caller = trustedCaller(event);
  if (!operatorService) throw new Error('OPERATOR_NOT_RUNNING');
  const spec = normalizePageTaskSpec(input);
  const tabId = createTab(spec.url, false);
  const record = {
    owner: caller.owner,
    origin: caller.origin,
    webContentsId: caller.webContentsId,
    tabId,
    closeOnTerminal: spec.closeOnTerminal,
    tabClosed: false,
    createdAt: new Date().toISOString()
  };

  try {
    await waitForTabReady(tabId);
    const task = await operatorService.internal.createTask({
      tabId,
      goal: spec.goal,
      constraints: spec.constraints,
      successCriteria: spec.successCriteria,
      acceptance: spec.acceptance,
      maxSteps: spec.maxSteps,
      maxDurationMs: spec.maxDurationMs
    });
    record.taskId = task.id;
    trustedPageTasks.set(task.id, record);
    return {
      ok: true,
      task,
      bridge: publicPageBridgeManifest()
    };
  } catch (error) {
    closeTab(tabId);
    throw error;
  }
});

ipcMain.handle('trusted-page:get-task', (event, taskId) => {
  const { record } = requireTrustedTask(event, taskId);
  const task = operatorService?.internal.getTask(taskId);
  if (!task) throw new Error('TASK_NOT_FOUND');
  cleanupTrustedTaskTab(record, task);
  return { ok: true, task };
});

ipcMain.handle('trusted-page:resume-task', async (event, taskId) => {
  const { record } = requireTrustedTask(event, taskId);
  const task = await operatorService.internal.resumeTask(taskId);
  cleanupTrustedTaskTab(record, task);
  return { ok: true, task };
});

ipcMain.handle('trusted-page:cancel-task', async (event, taskId, reason) => {
  const { record } = requireTrustedTask(event, taskId);
  const task = await operatorService.internal.cancelTask(
    taskId,
    String(reason || 'TRUSTED_PAGE_CANCELLED').slice(0, 500)
  );
  cleanupTrustedTaskTab(record, task);
  return { ok: true, task };
});

app.whenReady().then(() => {
  configureSession();
  createWindow();
  startLocalOperator();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  operatorGrant = null;
  operatorService?.close().catch(() => {});
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
