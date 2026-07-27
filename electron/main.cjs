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
    // Если файл меньше 1 КБ — это мусор (частичная загрузка / ошибка), удаляем и качаем заново
    if (stat.size > 1024) {
      return { filePath: destPath, downloadedBytes: stat.size, complete: true };
    }
    // Маленький файл — удаляем
    try { fs.unlinkSync(destPath); } catch {}
  } catch {
    // Файла нет — начнём с нуля
  }

  // Пробуем resume с текущего размера
  let startByte = 0;
  try {
    const stat = fs.statSync(destPath);
    if (stat.size > 1024) startByte = stat.size;
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

// ─── IPC: Автоопределение пути GTA 5 ──────────────────────────────
// Проверяет Steam, Epic Games, Rockstar и общие пути установки.

const COMMON_GTA_PATHS = [
  // Steam (по умолчанию)
  'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Grand Theft Auto V',
  'C:\\Program Files\\Steam\\steamapps\\common\\Grand Theft Auto V',
  // Steam на C:/Program Files/
  'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Grand Theft Auto V',
  // Steam на других дисках
  'D:\\SteamLibrary\\steamapps\\common\\Grand Theft Auto V',
  'D:\\Steam\\steamapps\\common\\Grand Theft Auto V',
  'D:\\games\\steamapps\\common\\Grand Theft Auto V',
  'E:\\SteamLibrary\\steamapps\\common\\Grand Theft Auto V',
  'E:\\games\\steamapps\\common\\Grand Theft Auto V',
  // Epic Games
  'C:\\Program Files\\Epic Games\\GTAV',
  'D:\\Epic Games\\GTAV',
  // Rockstar Games Launcher
  'C:\\Program Files\\Rockstar Games\\Grand Theft Auto V',
  'C:\\ProgramData\\Rockstar Games\\Grand Theft Auto V',
  // Пользовательские
  'D:\\Games\\Grand Theft Auto V',
  'D:\\Games\\GTA V',
  'D:\\GTA5',
  'D:\\GTA V',
  'E:\\Games\\Grand Theft Auto V',
  // Общие
  'D:\\Grand Theft Auto V',
  'C:\\Grand Theft Auto V',
];

function getSteamPathFromRegistry() {
  try {
    const { execSync } = require('child_process');
    const out = execSync(
      'reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath 2>nul',
      { encoding: 'utf-8', timeout: 5000 }
    );
    const match = out.match(/SteamPath\s+REG_SZ\s+(.+)/i);
    if (match) {
      const steamPath = match[1].trim().replace(/\\\\/g, '\\');
      return path.join(steamPath, 'steamapps', 'common', 'Grand Theft Auto V');
    }
  } catch {}
  return null;
}

ipcMain.handle('detect-gta-path', () => {
  // Маркерные файлы GTA 5 — расширенный список
  const MARKER_FILES = [
    'GTA5.exe', 'PlayGTAV.exe', 'Grand Theft Auto V.exe',
    'GTAVLauncher.exe', 'GTA5_Enhanced.exe',
  ];

  // 1. Steam через реестр (HKCU\Software\Valve\Steam\SteamPath)
  const steamPath = getSteamPathFromRegistry();
  if (steamPath && fileExistsWithAny(steamPath, MARKER_FILES)) {
    return { path: steamPath, source: 'steam' };
  }

  // 2. Все известные пути (расширенный список)
  for (const p of COMMON_GTA_PATHS) {
    if (fileExistsWithAny(p, MARKER_FILES)) {
      return { path: p, source: 'common' };
    }
  }

  // 3. Поиск Steam библиотек через libraryfolders.vdf
  try {
    const steamRoot = getSteamPathFromRegistry();
    if (steamRoot) {
      const steamBase = path.dirname(path.dirname(path.dirname(steamRoot))); // .../steamapps/common/GTAV → .../steamapps → ... (Steam root)
      // На самом деле steamRoot уже steamapps/common/GTAV, нам нужен путь на 3 уровня выше
      const steamDir = path.dirname(path.dirname(path.dirname(steamRoot))); // до корня Steam

      const vdfPath = path.join(steamDir, 'steamapps', 'libraryfolders.vdf');
      if (fs.existsSync(vdfPath)) {
        const vdf = fs.readFileSync(vdfPath, 'utf-8');
        const libMatches = vdf.match(/"path"\s+"([^"]+)"/g);
        if (libMatches) {
          for (const libMatch of libMatches) {
            const libPath = libMatch.match(/"path"\s+"([^"]+)"/)[1];
            const candidate = path.join(libPath.replace(/\\\\/g, '\\'), 'steamapps', 'common', 'Grand Theft Auto V');
            if (fs.existsSync(candidate) && fileExistsWithAny(candidate, MARKER_FILES)) {
              return { path: candidate, source: 'steam-library' };
            }
          }
        }
      }
    }
  } catch {}

  // 4. Поиск на всех дисках (не только C: и D:)
  try {
    for (const drive of ['C:', 'D:', 'E:', 'F:', 'G:', 'H:']) {
      if (!fs.existsSync(drive + '\\')) continue;
      const dirs = fs.readdirSync(drive + '\\');
      for (const dir of dirs) {
        const candidate = path.join(drive + '\\', dir, 'Grand Theft Auto V');
        if (fs.existsSync(candidate) && fileExistsWithAny(candidate, MARKER_FILES)) {
          return { path: candidate, source: 'scan' };
        }
        // Также пробуем GTA V без "Grand Theft Auto V"
        if (dir.toUpperCase().includes('GTA') || dir.toUpperCase().includes('GRAND')) {
          const candidate2 = path.join(drive + '\\', dir);
          if (fs.existsSync(candidate2) && fileExistsWithAny(candidate2, MARKER_FILES)) {
            return { path: candidate2, source: 'scan-name' };
          }
        }
      }
    }
  } catch {}

  return { path: null, source: null };
});

function fileExistsWithAny(dirPath, files) {
  for (const f of files) {
    try {
      if (fs.existsSync(path.join(dirPath, f))) return true;
    } catch {}
  }
  return false;
}

// ─── Вспомогательные функции для установки ─────────────────────────

const { execFileSync } = require('child_process');

function findExtractor() {
  // 1. WinRAR UnRAR.exe
  const unrarCandidates = [
    'C:\\Program Files\\WinRAR\\UnRAR.exe',
    'C:\\Program Files (x86)\\WinRAR\\UnRAR.exe',
    'C:\\Program Files\\WinRAR\\WinRAR.exe',
    'C:\\Program Files (x86)\\WinRAR\\WinRAR.exe',
  ];
  // 2. 7-Zip (поддерживает RAR)
  const sevenCandidates = [
    'C:\\Program Files\\7-Zip\\7z.exe',
    'C:\\Program Files (x86)\\7-Zip\\7z.exe',
  ];
  // 3. Bandizip
  const bzCandidates = [
    'C:\\Program Files\\Bandizip\\Bandizip.exe',
    'C:\\Program Files (x86)\\Bandizip\\Bandizip.exe',
  ];

  for (const p of [...unrarCandidates, ...sevenCandidates, ...bzCandidates]) {
    if (fs.existsSync(p)) return p;
  }

  // 4. Поиск через PATH (where unrar / where 7z)
  try {
    const { execSync } = require('child_process');
    const result = execSync('where unrar 2>nul || where 7z 2>nul', { stdio: 'pipe', timeout: 5000, shell: 'cmd.exe' });
    const first = result.toString().trim().split('\r\n')[0].trim();
    if (first && fs.existsSync(first)) return first;
  } catch {}

  return null;
}

function isRarSupported() {
  const exe = findExtractor();
  if (!exe) return null;
  // Проверяем, какой это экстрактор
  const lower = exe.toLowerCase();
  if (lower.includes('unrar') || lower.includes('winrar')) return { exe, type: 'rar' };
  if (lower.includes('7z')) return { exe, type: '7z' };
  if (lower.includes('bandizip')) return { exe, type: 'bandi' };
  return { exe, type: 'other' };
}

// ─── IPC: Установка мода через main-процесс (Electron) ────────────
// Скачивает файл в %APPDATA%/MiamiGraphics/, затем распаковывает в корень GTA5.

function logDebug(...args) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}][INSTALL]`, ...args);
}

ipcMain.handle('electron-install-mod', async (_evt, {
  downloadFilename, gtaPath, category, modId,
}) => {
  const srcDir = getDownloadsDir();
  const srcPath = path.join(srcDir, downloadFilename);

  logDebug('Запрос установки:', 'category=', category, 'modId=', modId);
  logDebug('  downloadFilename =', downloadFilename);
  logDebug('  srcPath =', srcPath);
  logDebug('  gtaPath =', gtaPath);

  // Проверка файла
  if (!fs.existsSync(srcPath)) {
    logDebug('  ❌ Файл НЕ НАЙДЕН:', srcPath);
    throw new Error(`Файл не найден: ${srcPath}`);
  }
  const fileStat = fs.statSync(srcPath);
  logDebug('  ✅ Файл найден, размер:', fileStat.size, 'байт');

  // ═══════════════════════════════════════════════
  // ОПРЕДЕЛЕНИЕ ЦЕЛЕВОЙ ПАПКИ
  // Смотрим структуру архива. Если внутри есть GTA5-папки
  // (update/, mods/, x64/, scripts/) — распаковываем в корень GTA5.
  // Иначе — в папку по категории.
  // ═══════════════════════════════════════════════

  const ext = findExtractor();
  let TARGET = gtaPath; // корень GTA5 по умолчанию

  if (ext) {
    logDebug('  Определяю структуру архива...');
    let listOut = '';
    try {
      if (ext.type === 'rar') {
        listOut = execFileSync(ext.exe, ['lb', srcPath], { stdio: 'pipe', timeout: 15000 }).toString();
      } else if (ext.type === '7z') {
        listOut = execFileSync(ext.exe, ['l', srcPath, '-slt'], { stdio: 'pipe', timeout: 15000 }).toString();
        // 7z l выводит подробно, нас интересуют только строки Path =
        listOut = listOut.split('\n').filter(l => l.startsWith('Path = ')).map(l => l.slice(6).trim()).join('\n');
      }
    } catch {}

    const entries = listOut.split('\n').map(l => l.trim()).filter(Boolean);
    logDebug('  Записей в архиве:', entries.length);
    if (entries.length > 0) logDebug('  Первые 20:', entries.slice(0, 20).join(', '));

    // Определяем, есть ли GTA5-структура
    const gtaFolders = ['update/', 'mods/', 'x64/', 'scripts/', 'common/', 'dlcpacks/'];
    const hasGtaStructure = entries.some(e => gtaFolders.some(f => e.startsWith(f) || e.startsWith('\\' + f)));
    const isLooseFile = entries.length <= 5 && entries.every(e => !e.includes('\\') && !e.includes('/'));

    if (hasGtaStructure) {
      TARGET = gtaPath;
      logDebug('  Обнаружена структура GTA5 → распаковка в корень:', TARGET);
    } else if (isLooseFile && category === 'guns') {
      // Одиночные файлы для оружия → patchday18ng
      TARGET = path.join(gtaPath, 'update', 'x64', 'dlcpacks', 'patchday18ng');
      logDebug('  Одиночные файлы оружия → patchday18ng:', TARGET);
    } else if (isLooseFile && category === 'redux') {
      TARGET = path.join(gtaPath, 'update');
      logDebug('  Одиночные файлы редукса → update:', TARGET);
    } else {
      logDebug('  Ничего не подошло → корень GTA5:', TARGET);
    }
  } else {
    logDebug('  Экстрактор не найден → корень GTA5:', TARGET);
  }

  if (!fs.existsSync(TARGET)) {
    fs.mkdirSync(TARGET, { recursive: true });
  }
  logDebug('  TARGET =', TARGET);

  const lower = downloadFilename.toLowerCase();
  const opts = { stdio: 'pipe', timeout: 300000 };

  // 1) ZIP — PowerShell Expand-Archive
  if (lower.endsWith('.zip')) {
    logDebug('  Тип: ZIP → PowerShell Expand-Archive');
    logDebug('  Запуск: powershell Expand-Archive...');
    try {
      execFileSync('powershell', [
        '-NoProfile', '-Command',
        `Expand-Archive -Path '${srcPath.replace(/'/g, "''")}' -DestinationPath '${TARGET.replace(/'/g, "''")}' -Force`
      ], opts);
      logDebug('  ✅ PowerShell успешно завершён');
    } catch (e) {
      logDebug('  ❌ PowerShell ошибка:', e.message || e);
      const exitCode = e.status;
      const stderr = e.stderr?.toString() || '';
      logDebug('  code:', exitCode, 'stderr:', stderr);
      // Если TARGET создалась — всё равно могли быть файлы
      if (!fs.existsSync(TARGET)) {
        throw new Error(`Ошибка распаковки ZIP: ${e.message || e}`);
      }
    }
    return { success: true, targetDir: TARGET, extracted: true };
  }

  // 2) RAR (не .part)
  if (lower.endsWith('.rar') && !lower.includes('.part')) {
    const ext = isRarSupported();
    if (ext) {
      logDebug('  Тип: RAR → экстрактор:', ext.exe);
      let args;
      if (ext.type === 'rar') {
        args = ['x', '-o+', '-y', srcPath, '*', TARGET];
      } else if (ext.type === '7z') {
        args = ['x', srcPath, '-y', '-o' + TARGET];
      } else {
        args = ['x', '-o+', '-y', srcPath, '*', TARGET];
      }
      logDebug('  Аргументы:', JSON.stringify(args));
      const before = Date.now();
      execFileSync(ext.exe, args, opts);
      const elapsed = Date.now() - before;
      logDebug('  ✅ Распаковка завершена за', elapsed, 'мс');
      const filesAfter = fs.readdirSync(TARGET).filter(f => f !== '.' && f !== '..');
      logDebug('  Файлов в TARGET после:', filesAfter.length);
      if (filesAfter.length === 0) logDebug('  ⚠ TARGET пуст!');
      else logDebug('  Первые 10 файлов:', filesAfter.slice(0, 10).join(', '));
      return { success: true, targetDir: TARGET, extracted: true };
    }
    logDebug('  ⚠ Нет программы для RAR, копирую как есть');
    fs.copyFileSync(srcPath, path.join(TARGET, path.basename(downloadFilename)));
    return { success: true, targetDir: TARGET, extracted: false };
  }

  // 3) .part.rar (многочастный)
  if (lower.endsWith('.rar') && lower.includes('.part')) {
    const ext = isRarSupported();
    if (ext) {
      const firstPart = srcPath.replace(/\.part\d+\.rar$/i, '.part1.rar');
      const archive = fs.existsSync(firstPart) ? firstPart : srcPath;
      logDebug('  Тип: .part.rar, архив:', archive);
      let args;
      if (ext.type === 'rar') {
        args = ['x', '-o+', '-y', archive, '*', TARGET];
      } else if (ext.type === '7z') {
        args = ['x', archive, '-y', '-o' + TARGET];
      } else {
        args = ['x', '-o+', '-y', archive, '*', TARGET];
      }
      execFileSync(ext.exe, args, opts);
      logDebug('  ✅ Распаковка .part.rar завершена');
      return { success: true, targetDir: TARGET, extracted: true };
    }
    logDebug('  ⚠ Нет программы для .part.rar, копирую как есть');
    fs.copyFileSync(srcPath, path.join(TARGET, path.basename(downloadFilename)));
    return { success: true, targetDir: TARGET, extracted: false };
  }

  // 4) Прочее (.rpf, .oiv, .7z, .dll) — копируем в TARGET
  logDebug('  Тип: прочее (не ZIP/RAR) — копирую в TARGET');
  logDebug('  Расширение файла:', path.extname(downloadFilename));
  fs.copyFileSync(srcPath, path.join(TARGET, path.basename(downloadFilename)));
  return { success: true, targetDir: TARGET, extracted: false };
});

ipcMain.handle('electron-check-gta-path', () => {
  if (!global.__gtaPath) return null;
  const p = global.__gtaPath;
  if (fs.existsSync(p)) return p;
  return null;
});

// ─── Чтение локального файла приложения ──────────────────────────

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

  // Автопроверка обновлений через 3 секунды после запуска
  setTimeout(async () => {
    try {
      logDebug('Автопроверка обновлений...');
      const https = require('https');
      const url = 'https://api.github.com/repos/maksimsejko562-prog/miami-mods/releases/latest';
      const data = await new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'MiamiLauncher/' + APP_VERSION } }, (res) => {
          let body = '';
          res.on('data', c => body += c);
          res.on('end', () => resolve(body));
        }).on('error', reject);
      });
      const release = JSON.parse(data);
      const tag = release.tag_name || '';
      const latestVer = tag.startsWith('v') ? tag.slice(1) : tag;
      logDebug('  Текущая:', APP_VERSION, 'Последняя:', latestVer);
      if (latestVer && latestVer !== APP_VERSION) {
        const asset = (release.assets || []).find(a => a.name && a.name.endsWith('.exe') && a.name.includes('Setup'));
        if (asset) {
          const win = BrowserWindow.getAllWindows()[0];
          if (win) {
            win.webContents.send('update-available', {
              version: latestVer,
              url: asset.browser_download_url,
              size: asset.size,
              name: asset.name,
            });
          }
        }
      }
    } catch (e) {
      logDebug('  Ошибка автопроверки:', e.message);
    }
  }, 3000);
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

// ─── Автообновление ─────────────────────────────────────────────────

ipcMain.handle('check-for-updates', async () => {
  logDebug('Проверка обновления, текущая версия:', APP_VERSION);
  try {
    const https = require('https');
    const url = 'https://api.github.com/repos/maksimsejko562-prog/miami-mods/releases/latest';
    const data = await new Promise((resolve, reject) => {
      https.get(url, { headers: { 'User-Agent': 'MiamiLauncher/' + APP_VERSION } }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => resolve(body));
      }).on('error', reject);
    });
    const release = JSON.parse(data);
    const tag = release.tag_name || '';
    const latestVer = tag.startsWith('v') ? tag.slice(1) : tag;
    logDebug('  Последняя версия на GitHub:', latestVer);

    if (latestVer && latestVer !== APP_VERSION) {
      // Ищем asset-установщик
      const asset = (release.assets || []).find(a =>
        a.name && a.name.endsWith('.exe') && a.name.includes('Setup')
      );
      if (asset) {
        return {
          hasUpdate: true,
          version: latestVer,
          url: asset.browser_download_url,
          size: asset.size,
          name: asset.name,
        };
      }
    }
    return { hasUpdate: false };
  } catch (e) {
    logDebug('  Ошибка проверки:', e.message);
    return { hasUpdate: false, error: e.message };
  }
});

ipcMain.handle('download-and-install-update', async (_evt, url) => {
  logDebug('Скачиваю обновление:', url);
  const tmpDir = require('os').tmpdir();
  const destPath = path.join(tmpDir, 'MiamiLauncher-Update.exe');

  return new Promise((resolve, reject) => {
    const https = require('https');
    const file = fs.createWriteStream(destPath);
    https.get(url, { headers: { 'User-Agent': 'MiamiLauncher/' + APP_VERSION } }, (res) => {
      // Следуем редиректам
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let next = res.headers.location;
        if (next.startsWith('/')) {
          const u = new URL(url);
          next = u.protocol + '//' + u.host + next;
        }
        https.get(next, { headers: { 'User-Agent': 'MiamiLauncher/' + APP_VERSION } }, (r2) => {
          r2.pipe(file);
          file.on('finish', () => {
            file.close();
            logDebug('  Обновление скачано, запускаю...');
            require('child_process').execFile(destPath, ['/SILENT', '/CLOSEAPPLICATIONS'], (err) => {
              if (err) reject(err);
              else app.quit();
            });
          });
        });
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        logDebug('  Обновление скачано, запускаю...');
        require('child_process').execFile(destPath, ['/SILENT', '/CLOSEAPPLICATIONS'], (err) => {
          if (err) reject(err);
          else app.quit();
        });
      });
    }).on('error', reject);
  });
});
