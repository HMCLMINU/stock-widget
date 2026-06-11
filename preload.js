'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// 렌더러에 안전한 API만 노출 (contextIsolation 유지).
contextBridge.exposeInMainWorld('api', {
  search: (query) => ipcRenderer.invoke('search', query),
  quote: (symbol) => ipcRenderer.invoke('quote', symbol),
  logo: (symbol) => ipcRenderer.invoke('logo', symbol),
  load: () => ipcRenderer.invoke('load'),
  save: (data) => ipcRenderer.invoke('save', data),
  win: (action) => ipcRenderer.invoke('win', action),
});
