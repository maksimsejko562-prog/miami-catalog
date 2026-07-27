// Preload-скрипт: безопасный мост между рендерером (React) и main-процессом.
// contextIsolation: true — рендерер не имеет прямого доступа к Node,
// только то, что явно экспортировано через contextBridge.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Управление окном
  minimize: () => ipcRenderer.send('win-minimize'),
  close: () => ipcRenderer.send('win-close'),

  // Версия
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Каталог
  readAppFile: (relPath) => ipcRenderer.invoke('read-app-file', relPath),

  // Обновления
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadAndInstallUpdate: (url) => ipcRenderer.invoke('download-and-install-update', url),
  onUpdateAvailable: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
  },

  // --- Скачивание ---
  // Скачать файл (сохраняется в %APPDATA%/MiamiGraphics/)
  electronDownload: (url, filename) => ipcRenderer.invoke('electron-download', url, filename),

  // Проверить, существует ли файл
  electronFileExists: (filename) => ipcRenderer.invoke('electron-file-exists', filename),

  // Прогресс скачивания (события от main к renderer)
  onDownloadProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('download-progress', handler);
    return () => ipcRenderer.removeListener('download-progress', handler);
  },

  // --- Установка ---
  // Автоопределить путь GTA 5
  detectGtaPath: () => ipcRenderer.invoke('detect-gta-path'),

  // Установить мод: копирует/распаковывает файл из папки загрузок в GTA5/mods/
  electronInstallMod: (params) => ipcRenderer.invoke('electron-install-mod', params),
});
