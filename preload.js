const { contextBridge, ipcRenderer: ipc } = require('electron');
contextBridge.exposeInMainWorld('api', {
  init: () => ipc.invoke('init'),
  pick: () => ipc.invoke('pick'),
  cover: p => ipc.invoke('cover', p),
  lyrics: t => ipc.invoke('lyrics', t),
  lsearch: a => ipc.invoke('lsearch', a),
  lsave: a => ipc.invoke('lsave', a),
  lreset: p => ipc.invoke('lreset', p)
});
