'use strict';

const { app, BrowserWindow, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');
const http = require('http');

let bridgeProc = null;

// ── Utilities ──────────────────────────────────────────────────────────────────

function findFreePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function waitForServer(port, retries = 40, intervalMs = 250) {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const check = () => {
      http.get(`http://127.0.0.1:${port}/health`, (res) => {
        if (res.statusCode < 500) resolve();
        else schedule();
      }).on('error', schedule);
    };
    const schedule = () => {
      if (++tries >= retries) reject(new Error('Bridge server failed to start in time'));
      else setTimeout(check, intervalMs);
    };
    check();
  });
}

// ── Workspace resolution ───────────────────────────────────────────────────────

async function getWorkspacePath() {
  // 1. CLI arg: graperoot-viz --workspace /path/to/workspace
  const argv = process.argv;
  const wsIdx = argv.findIndex((a) => a === '--workspace');
  if (wsIdx !== -1 && argv[wsIdx + 1]) return argv[wsIdx + 1];

  // 2. Environment variable (set by /graperoot-viz skill or launch script)
  if (process.env.GRAPEROOT_WORKSPACE) return process.env.GRAPEROOT_WORKSPACE;

  // 3. Native directory picker as fallback
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Open GrapeRoot Workspace',
    message: 'Select the workspace directory (contains cross_edges.jsonl)',
    properties: ['openDirectory'],
    buttonLabel: 'Open Workspace',
  });
  return canceled ? null : filePaths[0];
}

// ── Bridge process ─────────────────────────────────────────────────────────────

async function startBridge(workspacePath, port) {
  let exe, args;

  if (app.isPackaged) {
    const binName = process.platform === 'win32' ? 'server.exe' : 'server';
    exe = path.join(process.resourcesPath, 'bridge', binName);
    args = [
      '--workspace', workspacePath,
      '--port', String(port),
      '--host', '127.0.0.1',
    ];
  } else {
    // Dev mode: run Python directly
    exe = process.platform === 'win32' ? 'python' : 'python3';
    args = [
      path.join(__dirname, '..', 'enterprise', 'bridge', 'server.py'),
      '--workspace', workspacePath,
      '--port', String(port),
      '--host', '127.0.0.1',
    ];
  }

  bridgeProc = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'] });

  bridgeProc.stdout.on('data', (d) => process.stdout.write(`[bridge] ${d}`));
  bridgeProc.stderr.on('data', (d) => process.stderr.write(`[bridge] ${d}`));
  bridgeProc.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[bridge] exited with code ${code}`);
    }
  });

  return waitForServer(port);
}

// ── Window ─────────────────────────────────────────────────────────────────────

async function createWindow(port) {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#03050b',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Required: renderer loads via file:// but fetches from http://127.0.0.1.
      // Without this, Electron blocks the cross-origin request → blank screen.
      webSecurity: false,
    },
  });

  const rendererDir = app.isPackaged
    ? path.join(process.resourcesPath, 'renderer')
    : path.join(__dirname, '..', 'enterprise', 'viewer', 'dist');

  // Pass port as query param — read synchronously in renderer before React mounts
  await win.loadFile(path.join(rendererDir, 'index.html'), {
    query: { port: String(port) },
  });

  // Open external links in the system browser, not Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return win;
}

// ── App lifecycle ──────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  const workspacePath = await getWorkspacePath();
  if (!workspacePath) {
    app.quit();
    return;
  }

  let port;
  try {
    port = await findFreePort();
    await startBridge(workspacePath, port);
  } catch (err) {
    console.error('Bridge error:', err);
    dialog.showErrorBox(
      'GrapeRoot Viz — Bridge Error',
      `Could not start the graph server:\n\n${err.message}\n\nMake sure Python 3 and the bridge dependencies are installed.`,
    );
    app.quit();
    return;
  }

  await createWindow(port);

  // Check for updates in the background (packaged builds only)
  if (app.isPackaged) {
    autoUpdater.checkForUpdates();

    autoUpdater.on('update-downloaded', () => {
      dialog.showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: 'A new version of GrapeRoot Viz has been downloaded.',
        detail: 'Restart the app to install the update.',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
      }).then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(port);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (bridgeProc) {
    bridgeProc.kill('SIGTERM');
    bridgeProc = null;
  }
});
