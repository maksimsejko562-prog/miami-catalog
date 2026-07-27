// Preload-скрипт: безопасный мост между рендерером (React) и main-процессом.
// contextIsolation: true — рендерер не имеет прямого доступа к Node,
// только то, что явно экспортировано через contextBridge.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Управление окном (безрамочный titlebar).
  minimize: () => ipcRenderer.send('win-minimize'),
  close: () => ipcRenderer.send('win-close'),

  // Путь к папке загрузок (нативный, без FSA-пикера).
  getDownloadsDir: () => ipcRenderer.invoke('get-downloads-dir'),

  // Чтение локального файла приложения (catalog.json и т.д.) через fs.
  readAppFile: (relPath) => ipcRenderer.invoke('read-app-file', relPath),

  // Версия приложения
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Проверка обновлений через GitHub API
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),

  // Скачивание файла через main-процесс (обходит CORS)
  electronDownload: (url, filename) => ipcRenderer.invoke('electron-download', url, filename),

  // Проверка существования файла
  electronFileExists: (filename) => ipcRenderer.invoke('electron-file-exists', filename),

  // Прогресс скачивания (события от main)
  onDownloadProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('download-progress', handler);
    return () => ipcRenderer.removeListener('download-progress', handler);
  },
});
