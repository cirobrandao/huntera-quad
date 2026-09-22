const { app, BrowserWindow, BrowserView, ipcMain, Menu, shell, session, net } = require('electron');
const fs = require('fs');
const path = require('path');

const HOME_URL = 'https://huntera.com.br';
const ACCOUNT_COUNT = 4;
const LABEL_HEIGHT = 28;
const GAP = 2;
const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;
const PING_INTERVAL_MS = 5000;
const PING_SAMPLE_LIMIT = 20;
const NAME_MAX_LEN = 32;

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {BrowserView[]} */
const views = [];
/** @type {number[]} */
const zoomFactors = [1, 1, 1, 1];
/** @type {string[]} */
let accountNames = ['Conta 1', 'Conta 2', 'Conta 3', 'Conta 4'];
/** @type {{ pingMs: number | null, loadMs: number | null, samples: number[], navStarted: number | null }[]} */
const stats = Array.from({ length: ACCOUNT_COUNT }, () => ({
  pingMs: null,
  loadMs: null,
  samples: [],
  navStarted: null,
}));

const partitions = [
  'persist:huntera-account-1',
  'persist:huntera-account-2',
  'persist:huntera-account-3',
  'persist:huntera-account-4',
];

function namesFile() {
  return path.join(app.getPath('userData'), 'account-names.json');
}

function loadNames() {
  try {
    const raw = JSON.parse(fs.readFileSync(namesFile(), 'utf8'));
    if (Array.isArray(raw)) {
      accountNames = [0, 1, 2, 3].map((i) => sanitizeName(raw[i], i));
      return;
    }
  } catch {
    // keep defaults
  }
}

function saveNames() {
  try {
    fs.writeFileSync(namesFile(), JSON.stringify(accountNames, null, 2), 'utf8');
  } catch (err) {
    console.error('Não foi possível salvar os nomes das contas', err);
  }
}

function sanitizeName(value, idx) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX_LEN);
  return text || `Conta ${idx + 1}`;
}

function avgPing(idx) {
  const samples = stats[idx].samples;
  if (!samples.length) return null;
  return Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
}

function publicStats() {
  return stats.map((s, i) => ({
    pingMs: s.pingMs,
    loadMs: s.loadMs,
    avgMs: avgPing(i),
  }));
}

function sendStats() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('stats', publicStats());
}

function sendNames() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('names', [...accountNames]);
}

function measurePing(idx) {
  const start = Date.now();
  const request = net.request({
    method: 'GET',
    url: HOME_URL,
    session: session.fromPartition(partitions[idx]),
    redirect: 'follow',
  });

  const finish = (ok) => {
    const ms = Date.now() - start;
    if (ok) {
      stats[idx].pingMs = ms;
      stats[idx].samples.push(ms);
      if (stats[idx].samples.length > PING_SAMPLE_LIMIT) stats[idx].samples.shift();
    }
    sendStats();
  };

  let settled = false;
  const once = (ok) => {
    if (settled) return;
    settled = true;
    finish(ok);
    try {
      request.abort();
    } catch {
      // already finished
    }
  };

  request.on('response', () => once(true));
  request.on('error', () => once(false));
  request.end();
}

function startPingLoop() {
  for (let i = 0; i < ACCOUNT_COUNT; i++) {
    setTimeout(() => measurePing(i), 400 * i);
  }
  setInterval(() => {
    for (let i = 0; i < ACCOUNT_COUNT; i++) {
      setTimeout(() => measurePing(i), 250 * i);
    }
  }, PING_INTERVAL_MS);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: '#0f1115',
    title: 'Huntera Quad',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  for (let i = 0; i < ACCOUNT_COUNT; i++) {
    const view = new BrowserView({
      webPreferences: {
        partition: partitions[i],
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    mainWindow.addBrowserView(view);
    view.webContents.setWindowOpenHandler(({ url }) => {
      view.webContents.loadURL(url);
      return { action: 'deny' };
    });
    view.webContents.on('did-start-navigation', (_event, _url, _isInPlace, isMainFrame) => {
      if (isMainFrame) stats[i].navStarted = Date.now();
    });
    view.webContents.on('did-finish-load', () => {
      if (stats[i].navStarted) {
        stats[i].loadMs = Date.now() - stats[i].navStarted;
        sendStats();
      }
    });
    view.webContents.on('did-fail-load', (_e, _code, _desc, _url, isMainFrame) => {
      if (isMainFrame) {
        stats[i].loadMs = null;
        sendStats();
      }
    });
    view.webContents.loadURL(HOME_URL);
    views.push(view);
  }

  const layout = () => layoutViews();
  mainWindow.on('resize', layout);
  mainWindow.webContents.on('did-finish-load', () => {
    layout();
    sendNames();
    sendStats();
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
    layoutViews();
    sendNames();
    startPingLoop();
  });

  buildMenu();
}

function layoutViews() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const { width, height } = mainWindow.getContentBounds();
  const gridHeight = Math.max(0, height);
  const cellW = Math.floor((width - GAP) / 2);
  const cellH = Math.floor((gridHeight - GAP) / 2);
  const positions = [
    { x: 0, y: 0 },
    { x: cellW + GAP, y: 0 },
    { x: 0, y: cellH + GAP },
    { x: cellW + GAP, y: cellH + GAP },
  ];

  views.forEach((view, i) => {
    const pos = positions[i];
    view.setBounds({
      x: pos.x,
      y: pos.y + LABEL_HEIGHT,
      width: cellW,
      height: Math.max(0, cellH - LABEL_HEIGHT),
    });
    view.setAutoResize({ width: false, height: false });
  });

  if (!mainWindow.isDestroyed()) {
    mainWindow.webContents.send('layout', {
      width,
      height,
      toolbar: 0,
      label: LABEL_HEIGHT,
      gap: GAP,
      cellW,
      cellH,
      zooms: [...zoomFactors],
      names: [...accountNames],
      stats: publicStats(),
    });
  }
}

function setZoom(idx, next) {
  if (idx < 0 || idx >= views.length) return { ok: false };
  const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(next * 100) / 100));
  zoomFactors[idx] = clamped;
  views[idx].webContents.setZoomFactor(clamped);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('zoom', { account: idx, zoom: clamped });
  }
  return { ok: true, zoom: clamped };
}

function buildMenu() {
  const template = [
    {
      label: 'Arquivo',
      submenu: [
        {
          label: 'Recarregar todas',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => views.forEach((v) => v.webContents.reload()),
        },
        {
          label: 'Ir para huntera.com.br (todas)',
          click: () => views.forEach((v) => v.webContents.loadURL(HOME_URL)),
        },
        { type: 'separator' },
        { role: 'quit', label: 'Sair' },
      ],
    },
    {
      label: 'Contas',
      submenu: accountNames.map((name, i) => ({
        label: name,
        submenu: [
          {
            label: 'Recarregar',
            click: () => views[i]?.webContents.reload(),
          },
          {
            label: 'Home huntera.com.br',
            click: () => views[i]?.webContents.loadURL(HOME_URL),
          },
          {
            label: 'Zoom +',
            click: () => setZoom(i, zoomFactors[i] + ZOOM_STEP),
          },
          {
            label: 'Zoom −',
            click: () => setZoom(i, zoomFactors[i] - ZOOM_STEP),
          },
          {
            label: 'Zoom 100%',
            click: () => setZoom(i, 1),
          },
          {
            label: 'Limpar cookies desta conta',
            click: async () => {
              const ses = session.fromPartition(partitions[i]);
              await ses.clearStorageData();
              views[i]?.webContents.loadURL(HOME_URL);
            },
          },
        ],
      })),
    },
    {
      label: 'Janela',
      submenu: [
        { role: 'togglefullscreen', label: 'Tela cheia' },
        { role: 'minimize', label: 'Minimizar' },
        {
          label: 'Mostrar menu',
          accelerator: 'Alt',
          click: () => {
            if (mainWindow) mainWindow.setMenuBarVisibility(true);
          },
        },
      ],
    },
    {
      label: 'Ajuda',
      submenu: [
        {
          label: 'Abrir pasta de dados (cookies)',
          click: () => shell.openPath(app.getPath('userData')),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle('action', async (_event, payload) => {
  const { type, account, name } = payload || {};
  const idx = typeof account === 'number' ? account : -1;
  const target = idx >= 0 && idx < views.length ? [views[idx]] : views;

  switch (type) {
    case 'reload':
      target.forEach((v) => v.webContents.reload());
      break;
    case 'home':
      target.forEach((v) => v.webContents.loadURL(HOME_URL));
      break;
    case 'back':
      target.forEach((v) => {
        if (v.webContents.canGoBack()) v.webContents.goBack();
      });
      break;
    case 'forward':
      target.forEach((v) => {
        if (v.webContents.canGoForward()) v.webContents.goForward();
      });
      break;
    case 'zoom-in': {
      if (idx < 0) return { ok: false };
      const r = setZoom(idx, zoomFactors[idx] + ZOOM_STEP);
      return { ok: r.ok, zoom: r.zoom };
    }
    case 'zoom-out': {
      if (idx < 0) return { ok: false };
      const r = setZoom(idx, zoomFactors[idx] - ZOOM_STEP);
      return { ok: r.ok, zoom: r.zoom };
    }
    case 'zoom-reset': {
      if (idx < 0) return { ok: false };
      const r = setZoom(idx, 1);
      return { ok: r.ok, zoom: r.zoom };
    }
    case 'set-name': {
      if (idx < 0) return { ok: false };
      accountNames[idx] = sanitizeName(name, idx);
      saveNames();
      sendNames();
      buildMenu();
      return { ok: true, name: accountNames[idx] };
    }
    case 'clear-account': {
      if (idx < 0) return { ok: false };
      const ses = session.fromPartition(partitions[idx]);
      await ses.clearStorageData();
      views[idx].webContents.loadURL(HOME_URL);
      return { ok: true };
    }
    case 'get-bounds':
      return mainWindow ? mainWindow.getContentBounds() : null;
    default:
      break;
  }
  return { ok: true };
});

app.whenReady().then(() => {
  loadNames();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
