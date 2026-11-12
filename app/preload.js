const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('reminder', {
  onStart: (callback) => ipcRenderer.on('reminder:start', (_e, info) => callback(info)),
  drank: () => ipcRenderer.invoke('reminder:drank'),
  snooze: () => ipcRenderer.invoke('reminder:snooze'),
  hide: () => ipcRenderer.send('reminder:hide'),
  setInteractive: (interactive) => ipcRenderer.send('reminder:mouse', interactive),
});
