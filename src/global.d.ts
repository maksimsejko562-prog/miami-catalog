// Типы для Electron API, проброшенного через preload.cjs → contextBridge
type UpdateCheckResult =
  | { status: 'available'; version: string; url: string; releaseDate?: string }
  | { status: 'not-available' }
  | { status: 'error'; message: string };

interface ElectronAPI {
  minimize: () => void;
  close: () => void;
  getDownloadsDir: () => Promise<string>;
  readAppFile: (relPath: string) => Promise<string | null>;
  getAppVersion: () => Promise<string>;
  checkForUpdates: () => Promise<UpdateCheckResult>;
  electronDownload: (url: string, filename: string) => Promise<{ filePath: string; downloadedBytes?: number }>;
  detectGtaPath: () => Promise<{ path: string | null; source: string | null }>;
  electronInstallMod: (params: {
    downloadFilename: string;
    category: string;
    gtaPath: string;
    modId: string | number;
    variantFolder?: string;
  }) => Promise<{ success: boolean; targetDir: string; extracted: boolean; error?: string }>;
  electronFileExists: (path: string) => Promise<boolean>;
  downloadAndInstallUpdate: (url: string) => Promise<{ success: boolean; exePath: string }>;
  onDownloadProgress: (callback: (data: { percent: number; bytes: number; total: number }) => void) => void;
  onUpdateAvailable: (callback: (data: { version: string; url: string }) => void) => void;
}

interface Window {
  electronAPI?: ElectronAPI;
}
