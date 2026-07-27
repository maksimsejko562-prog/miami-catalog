// Точка входа Electron (CommonJS, не требует компиляции TypeScript).
// Загружает собранный Vite-бандл (dist/) через localhost — это делает приложение
// "secure context" и File System Access API (showDirectoryPicker) работает.

const { app, BrowserWindow, shell, ipcMain, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

const isDev = !app.isPackaged;
const APP_VERSION = require('../package.json').version;
const GITHUB_REPO = 'maksimsejko562-prog/miami-mods';

// ─── Статический сервер для dist/ ───────────────────────────────────
// Простой HTTP-сервер раздаёт файлы из dist/. Это делает приложение
// secure context (localhost), из-за чего File System Access API работает.

const DIST_DIR = isDev
  ? null // в dev-режиме не нужен
  : path.join(__dirname, '..', 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':  'font/ttf',
  '.ico':  'image/x-icon',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.glb':  'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.rar':  'application/vnd.rar',
  '.zip':  'application/zip',
};

let staticServer = null;
let staticPort = 0;

function startStaticServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      // Парсим URL, убираем query string и hash
      let urlPath = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
      if (urlPath === '/') urlPath = '/index.html';

      const filePath = path.join(DIST_DIR, urlPath);

      // Защита от path traversal
      if (!filePath.startsWith(DIST_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          // Fallback на index.html для SPA routing
          fs.readFile(path.join(DIST_DIR, 'index.html'), (err2, html) => {
            if (err2) {
              res.writeHead(404);
              res.end('Not Found');
              return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
          });
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const mime = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, {
          'Content-Type': mime,
          'Cache-Control': 'no-cache',
        });
        res.end(data);
      });
    });

    // Слушаем на случайном свободном порту
    server.listen(0, '127.0.0.1', () => {
      staticPort = server.address().port;
      staticServer = server;
      console.log(`[StaticServer] http://127.0.0.1:${staticPort}`);
      resolve(staticPort);
    });
  });
}

// ─── Окно ───────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a0c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5180');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Загружаем через localhost — secure context, FSA работает
    win.loadURL(`http://127.0.0.1:${staticPort}/`);
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  ipcMain.on('win-minimize', () => win.minimize());
  ipcMain.on('win-close', () => win.close());

  return win;
}

// ─── IPC: Версия приложения ─────────────────────────────────────────

ipcMain.handle('get-app-version', () => APP_VERSION);

// ─── IPC: Проверка обновлений ──────────────────────────────────────

ipcMain.handle('check-for-updates', () => {
  return new Promise((resolve) => {
    const req = http.get(
      `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=5`,
      { headers: { 'User-Agent': 'MiamiLauncher/1.0', Accept: 'application/vnd.github.v3+json' } },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const releases = JSON.parse(data);
            if (!Array.isArray(releases) || releases.length === 0) {
              resolve({ status: 'not-available' });
              return;
            }
            const launcherRelease = releases.find(
              (r) => r.tag_name && /^v?\d+\.\d+\.\d+/.test(r.tag_name)
            );
            if (!launcherRelease) {
              resolve({ status: 'not-available' });
              return;
            }
            const latest = launcherRelease.tag_name.replace(/^v/, '');
            const current = APP_VERSION;
            const latestParts = latest.split('.').map(Number);
            const currentParts = current.split('.').map(Number);
            const isNewer =
              latestParts[0] > currentParts[0] ||
              (latestParts[0] === currentParts[0] && latestParts[1] > currentParts[1]) ||
              (latestParts[0] === currentParts[0] && latestParts[1] === currentParts[1] && latestParts[2] > currentParts[2]);

            if (isNewer) {
              const asset = (launcherRelease.assets || []).find(
                (a) => a.name && a.name.endsWith('.exe') && a.name.includes('Setup')
              );
              resolve({
                status: 'available',
                version: latest,
                url: asset ? asset.browser_download_url : launcherRelease.html_url,
                releaseDate: launcherRelease.published_at,
              });
            } else {
              resolve({ status: 'not-available' });
            }
          } catch {
            resolve({ status: 'not-available' });
          }
        });
      }
    );
    req.on('error', () => resolve({ status: 'error', message: 'Нет подключения к GitHub' }));
    req.setTimeout(10000, () => { req.destroy(); resolve({ status: 'error', message: 'Таймаут соединения' }); });
  });
});

// ─── IPC: Папка загрузок ───────────────────────────────────────────

function getDownloadsDir() {
  const base = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
  const dir = path.join(base, 'MiamiGraphics');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

ipcMain.handle('get-downloads-dir', () => getDownloadsDir());

// ─── IPC: Проверка существования файла ─────────────────────────────

ipcMain.handle('electron-file-exists', (_evt, filename) => {
  const dir = getDownloadsDir();
  const filePath = path.join(dir, filename);
  try {
    const stat = fs.statSync(filePath);
    return { exists: true, size: stat.size };
  } catch {
    return { exists: false, size: 0 };
  }
});

// ─── IPC: Скачивание файла через main-процесс ──────────────────────
// Поддержка: progress-события, resume (Range), redirect.

ipcMain.handle('electron-download', async (evt, url, filename) => {
  const dir = getDownloadsDir();
  const destPath = path.join(dir, filename);

  // Проверяем, может файл уже полностью скачан
  try {
    const stat = fs.statSync(destPath);
    if (stat.size > 0) {
      return { filePath: destPath, downloadedBytes: stat.size, complete: true };
    }
  } catch {
    // Файла нет — начнём с нуля
  }

  // Пробуем resume с текущего размера
  let startByte = 0;
  try {
    const stat = fs.statSync(destPath);
    startByte = stat.size;
  } catch {}

  return new Promise((resolve, reject) => {
    const headers = { 'User-Agent': 'MiamiLauncher/1.1.0' };
    if (startByte > 0) headers['Range'] = `bytes=${startByte}-`;

    const doRequest = (reqUrl, redirectCount = 0) => {
      if (redirectCount > 5) {
        reject(new Error('Слишком много редиректов'));
        return;
      }

      const mod = reqUrl.startsWith('https') ? require('https') : http;
      const req = mod.get(reqUrl, { headers }, (res) => {
        // Редирект
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let nextUrl = res.headers.location;
          if (nextUrl.startsWith('/')) {
            const u = new URL(reqUrl);
            nextUrl = `${u.protocol}//${u.host}${nextUrl}`;
          }
          doRequest(nextUrl, redirectCount + 1);
          return;
        }

        if (res.statusCode !== 200 && res.statusCode !== 206) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const totalSize = startByte + parseInt(res.headers['content-length'] || '0', 10);
        const ws = fs.createWriteStream(destPath, { flags: startByte > 0 ? 'a' : 'w' });
        let downloaded = startByte;

        res.on('data', (chunk) => {
          downloaded += chunk.length;
          // Отправляем прогресс в рендерер
          evt.sender.send('download-progress', {
            filename,
            downloaded,
            total: totalSize,
            percent: totalSize > 0 ? Math.round((downloaded / totalSize) * 100) : 0,
          });
        });

        res.pipe(ws);

        ws.on('finish', () => {
          resolve({ filePath: destPath, downloadedBytes: downloaded, complete: true });
        });

        ws.on('error', (err) => {
          reject(err);
        });
      });

      req.on('error', reject);
      req.setTimeout(300000, () => { req.destroy(); reject(new Error('Таймаут загрузки')); });
    };

    doRequest(url);
  });
});

// ─── IPC: Чтение локального файла приложения ──────────────────────

ipcMain.handle('read-app-file', async (_evt, relPath) => {
  if (typeof relPath !== 'string') return null;
  const clean = relPath.replace(/^([a-zA-Z]:|\/\/|\\\\)/, '').replace(/\.\.+/g, '');
  const candidates = [
    path.join(__dirname, 'dist', clean),
    path.join(__dirname, '..', 'dist', clean),
    path.join(process.resourcesPath || '', 'app', 'dist', clean),
    path.join(process.resourcesPath || '', 'app.asar', 'dist', clean),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return await fs.promises.readFile(p, 'utf8');
    } catch {
      /* пробуем следующий */
    }
  }
  return null;
});

// ─── Запуск ─────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  if (!isDev) {
    await startStaticServer();
  }
  createWindow();
});

app.on('window-all-closed', () => {
  if (staticServer) {
    staticServer.close();
    staticServer = null;
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
