const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('browsallax', {
  navigate: (input) => ipcRenderer.send('browser:navigate', input),
  back: () => ipcRenderer.send('browser:back'),
  forward: () => ipcRenderer.send('browser:forward'),
  reload: () => ipcRenderer.send('browser:reload'),
  home: () => ipcRenderer.send('browser:home'),
  newTab: () => ipcRenderer.send('browser:new-tab'),
  activateTab: (id) => ipcRenderer.send('browser:activate-tab', id),
  closeTab: (id) => ipcRenderer.send('browser:close-tab', id),
  onState: (handler) => {
    const listener = (_event, state) => handler(state);
    ipcRenderer.on('browser:state', listener);
    return () => ipcRenderer.removeListener('browser:state', listener);
  }
});
