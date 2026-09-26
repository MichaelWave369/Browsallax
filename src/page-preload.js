const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('browsallaxOperator', {
  manifest: () => ipcRenderer.invoke('trusted-page:manifest'),
  status: () => ipcRenderer.invoke('trusted-page:status'),
  startTask: (spec) => ipcRenderer.invoke('trusted-page:start-task', spec),
  getTask: (taskId) => ipcRenderer.invoke('trusted-page:get-task', taskId),
  resumeTask: (taskId) => ipcRenderer.invoke('trusted-page:resume-task', taskId),
  cancelTask: (taskId, reason) => ipcRenderer.invoke('trusted-page:cancel-task', taskId, reason)
});
