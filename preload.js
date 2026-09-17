const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hunteraQuad', {
  action: (payload) => ipcRenderer.invoke('action', payload),
  onLayout: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('layout', handler);
    return () => ipcRenderer.removeListener('layout', handler);
  },
  onZoom: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('zoom', handler);
    return () => ipcRenderer.removeListener('zoom', handler);
  },
});
