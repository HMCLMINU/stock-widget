'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// 사내 프록시 등으로 Node가 시스템 루트 CA를 신뢰하지 않을 때를 대비해,
// 시스템 CA 번들을 찾아 NODE_EXTRA_CA_CERTS로 주입하고 1회 재시작한다.
// (이 환경변수는 Node 시작 시점에 읽히므로, 설정 후 재실행이 필요.)
if (!process.env.NODE_EXTRA_CA_CERTS && process.platform !== 'win32') {
  const candidates = [
    '/etc/ssl/certs/ca-certificates.crt',
    '/etc/pki/tls/certs/ca-bundle.crt',
    '/etc/ssl/cert.pem',
  ];
  const found = candidates.find((p) => {
    try {
      return fs.existsSync(p);
    } catch (e) {
      return false;
    }
  });
  if (found) {
    process.env.NODE_EXTRA_CA_CERTS = found;
    app.relaunch();
    app.exit(0);
  }
}

const yahoo = require('./yahoo');
const store = require('./store');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 380,
    height: 560,
    minWidth: 320,
    minHeight: 300,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  store.init(app.getPath('userData'));
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---- IPC: 데이터 ----

ipcMain.handle('search', async (_e, query) => {
  if (!query || !query.trim()) return [];
  return yahoo.search(query.trim());
});

ipcMain.handle('quote', async (_e, symbol) => {
  return yahoo.quote(symbol);
});

ipcMain.handle('logo', async (_e, symbol) => {
  return yahoo.logo(symbol);
});

// ---- IPC: 워치리스트 영속화 ----

ipcMain.handle('load', async () => store.load());

ipcMain.handle('save', async (_e, data) => {
  store.save(data);
  return true;
});

// ---- IPC: 창 제어 ----

ipcMain.handle('win', async (_e, action) => {
  if (!win) return;
  if (action === 'close') win.close();
  else if (action === 'minimize') win.minimize();
  else if (action === 'pin') {
    const next = !win.isAlwaysOnTop();
    win.setAlwaysOnTop(next);
    return next;
  }
});
