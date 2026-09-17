const { app, BrowserWindow, BrowserView, ipcMain, Menu, shell, session } = require('electron');
const path = require('path');

const HOME_URL = 'https://huntera.com.br';
const ACCOUNT_COUNT = 4;
const LABEL_HEIGHT = 28;
const GAP = 2;
const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {BrowserView[]} */
const views = [];
/** @type {number[]} */
const zoomFactors = [1, 1, 1, 1];

const partitions = [
  'persist:huntera-account-1',
  'persist:huntera-account-2',
  'persist:huntera-account-3',
  'persist:huntera-account-4',
];

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
    view.webContents.loadURL(HOME_URL);
    views.push(view);
  }

  const layout = () => layoutViews();
  mainWindow.on('resize', layout);
  mainWindow.webContents.on('did-finish-load', layout);

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
    layoutViews();
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
      submenu: [1, 2, 3, 4].map((n) => ({
        label: `Conta ${n}`,
        submenu: [
          {
            label: 'Recarregar',
            click: () => views[n - 1]?.webContents.reload(),
          },
          {
            label: 'Home huntera.com.br',
            click: () => views[n - 1]?.webContents.loadURL(HOME_URL),
          },
          {
            label: 'Zoom +',
            click: () => setZoom(n - 1, zoomFactors[n - 1] + ZOOM_STEP),
          },
          {
            label: 'Zoom −',
            click: () => setZoom(n - 1, zoomFactors[n - 1] - ZOOM_STEP),
          },
          {
            label: 'Zoom 100%',
            click: () => setZoom(n - 1, 1),
          },
          {
            label: 'Limpar cookies desta conta',
            click: async () => {
              const ses = session.fromPartition(partitions[n - 1]);
              await ses.clearStorageData();
              views[n - 1]?.webContents.loadURL(HOME_URL);
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
  const { type, account } = payload || {};
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
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
