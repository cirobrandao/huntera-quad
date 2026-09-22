const { app, BrowserWindow, BrowserView, ipcMain, Menu, shell, session, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const tls = require('tls');

// Portable EXE unpacks into %TEMP% and would store cookies there. That folder
// is wiped, and a stale lock in it stops the first sessions (accounts 1 and 2)
// from opening. Keep logins next to the EXE instead.
if (process.env.PORTABLE_EXECUTABLE_DIR) {
  app.setPath('userData', path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'HunteraSquadData'));
} else if (app.isPackaged) {
  app.setPath('userData', path.join(path.dirname(process.execPath), 'HunteraSquadData'));
}
app.setName('huntera-squad');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

const HOME_URL = 'https://huntera.com.br';
const GAME_HOST = 'huntera.com.br';
const GAME_PORT = 443;
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

function resolveIcon() {
  const candidates = [
    path.join(process.resourcesPath || '', 'icon.ico'),
    path.join(__dirname, 'build', 'icon.ico'),
  ];
  return candidates.find((p) => p && fs.existsSync(p)) || candidates[1];
}

function measurePing(idx) {
  const start = Date.now();
  let settled = false;
  const once = (ok) => {
    if (settled) return;
    settled = true;
    const ms = Date.now() - start;
    if (ok) {
      stats[idx].pingMs = ms;
      stats[idx].samples.push(ms);
      if (stats[idx].samples.length > PING_SAMPLE_LIMIT) stats[idx].samples.shift();
    }
    sendStats();
  };

  try {
    const socket = tls.connect(
      {
        host: GAME_HOST,
        port: GAME_PORT,
        servername: GAME_HOST,
        timeout: 4000,
      },
      () => {
        once(true);
        socket.end();
      }
    );
    socket.on('timeout', () => {
      once(false);
      socket.destroy();
    });
    socket.on('error', () => once(false));
  } catch {
    once(false);
  }
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
  const iconPath = resolveIcon();
  const iconImage = nativeImage.createFromPath(iconPath);
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: '#0f1115',
    title: 'Huntera Squad',
    icon: iconImage.isEmpty() ? iconPath : iconImage,
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

  // Do not open all 4 persistent partitions at once. On the portable EXE the
  // first Chromium network services stall, so accounts 1 and 2 never paint.
  for (let i = 0; i < ACCOUNT_COUNT; i++) {
    setTimeout(() => attachView(i), 500 + i * 700);
  }

  layoutViews();
  if (!iconImage.isEmpty()) mainWindow.setIcon(iconImage);

  const layout = () => layoutViews();
  mainWindow.on('resize', layout);
  mainWindow.on('maximize', layout);
  mainWindow.on('unmaximize', layout);
  mainWindow.on('show', layout);
  mainWindow.webContents.on('did-finish-load', () => {
    layout();
    sendNames();
    sendStats();
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
    if (!iconImage.isEmpty()) mainWindow.setIcon(iconImage);
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
    if (!view) return;
    const pos = positions[i];
    view.setBounds({
      x: pos.x,
      y: pos.y + LABEL_HEIGHT,
      width: Math.max(1, cellW),
      height: Math.max(1, cellH - LABEL_HEIGHT),
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

function attachView(idx) {
  const view = new BrowserView({
    webPreferences: {
      partition: partitions[idx],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  mainWindow.addBrowserView(view);
  view.webContents.setBackgroundThrottling(false);
  view.webContents.setWindowOpenHandler(({ url }) => {
    view.webContents.loadURL(url).catch((err) => {
      console.error(`Conta ${idx + 1} popup:`, err);
    });
    return { action: 'deny' };
  });
  view.webContents.on('did-start-navigation', (_event, _url, _isInPlace, isMainFrame) => {
    if (isMainFrame) stats[idx].navStarted = Date.now();
  });
  view.webContents.on('did-finish-load', () => {
    if (stats[idx].navStarted) {
      stats[idx].loadMs = Date.now() - stats[idx].navStarted;
      sendStats();
    }
    layoutViews();
  });
  view.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    stats[idx].loadMs = null;
    sendStats();
    console.error(`Conta ${idx + 1} falhou:`, code, desc, url);
  });
  view.webContents.on('render-process-gone', (_e, details) => {
    console.error(`Conta ${idx + 1} processo encerrou:`, details && details.reason);
  });
  views[idx] = view;
  layoutViews();
  view.webContents.loadURL(HOME_URL).catch((err) => {
    console.error(`Conta ${idx + 1} loadURL:`, err);
  });
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
  if (process.platform === 'win32') {
    app.setAppUserModelId('br.com.huntera.quad');
  }
  loadNames();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
