const path = require('node:path');
const { app, BrowserWindow, WebContentsView, ipcMain, session } = require('electron');

const TOOLBAR_HEIGHT = 96;
const START_URL = 'https://duckduckgo.com/';
const PARTITION = 'persist:browsallax';

app.enableSandbox();

let mainWindow = null;
let nextTabId = 1;
let activeTabId = null;
const tabs = new Map();

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
    }))
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
  mainWindow.contentView.removeChildView(tab.view);
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

app.whenReady().then(() => {
  configureSession();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
