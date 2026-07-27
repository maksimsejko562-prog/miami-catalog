/**
 * Менеджер загрузок с поддержкой:
 * - File System Access API (основной путь) — работает через localhost в Electron;
 * - Electron IPC (запасной) — скачивание через main-процесс без FSA;
 * - fallback — браузерный <a download>;
 * - resume по HTTP Range;
 * - прогресс, скорость, ETA;
 * - отмена через AbortController.
 */

import type { ExternalModFile } from '../types';
import { isFsAccessSupported, fileExists, getFileSize, streamToFile, fallbackDownload } from './storage';
import { notifications } from './notifications';

// ─── Electron API (из preload.cjs) ─────────────────────────────────

interface ElectronAPI {
  electronDownload: (url: string, filename: string) => Promise<{
    filePath: string;
    downloadedBytes: number;
    complete: boolean;
  }>;
  electronFileExists: (filename: string) => Promise<{ exists: boolean; size: number }>;
  onDownloadProgress: (callback: (data: {
    filename: string; downloaded: number; total: number; percent: number;
  }) => void) => () => void;
  getDownloadsDir: () => Promise<string>;
}

function getElectronApi(): ElectronAPI | null {
  return (window as unknown as { electronAPI?: ElectronAPI }).electronAPI || null;
}

// ─── Типы ──────────────────────────────────────────────────────────

export interface DownloadFile {
  file: ExternalModFile;
  selected: boolean;
  status: 'pending' | 'downloading' | 'completed' | 'error' | 'skipped' | 'cancelled';
  progress: number;
  downloadedBytes: number;
  errorMessage?: string;
  speedBytesPerSec?: number;
  etaSeconds?: number;
}

export interface DownloadJob {
  modId: number;
  modName: string;
  files: DownloadFile[];
  status: 'pending' | 'downloading' | 'completed' | 'error' | 'cancelled';
  totalProgress: number;
  /** Все выбранные файлы скачаны. */
  isDownloaded: boolean;
}

type Listener = (jobs: DownloadJob[]) => void;

// ─── DownloadManager ───────────────────────────────────────────────

class DownloadManager {
  private jobs = new Map<string, DownloadJob>();
  private listeners = new Set<Listener>();
  private controllers = new Map<string, AbortController>();
  private progressCleanups = new Map<string, () => void>();

  private dirty = false;
  private flushScheduled = false;

  private scheduleNotify() {
    this.dirty = true;
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    setTimeout(() => {
      this.flushScheduled = false;
      if (this.dirty) this.notifyNow();
    }, 100);
  }

  private notifyNow() {
    this.dirty = false;
    const all = this.getAllJobs();
    this.listeners.forEach((fn) => fn(all));
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.getAllJobs());
    return () => { this.listeners.delete(fn); };
  }

  addJob(modId: number, modName: string, files: ExternalModFile[]): string {
    const jobId = `mod-${modId}`;
    const downloadFiles: DownloadFile[] = files.map((f) => ({
      file: f, selected: true, status: 'pending', progress: 0, downloadedBytes: 0,
    }));
    this.jobs.set(jobId, {
      modId, modName, files: downloadFiles,
      status: 'pending', totalProgress: 0, isDownloaded: false,
    });
    this.notifyNow();
    void this.startDownload(jobId);
    return jobId;
  }

  cancelJob(jobId: string): boolean {
    const controller = this.controllers.get(jobId);
    if (controller) { controller.abort(); this.controllers.delete(jobId); }
    const cleanup = this.progressCleanups.get(jobId);
    if (cleanup) { cleanup(); this.progressCleanups.delete(jobId); }
    const job = this.jobs.get(jobId);
    if (!job) return false;
    for (const f of job.files) {
      if (f.status === 'pending' || f.status === 'downloading') f.status = 'cancelled';
    }
    job.status = 'cancelled';
    this.updateJobProgress(job);
    this.notifyNow();
    return true;
  }

  cancelAll(): void { for (const id of Array.from(this.controllers.keys())) this.cancelJob(id); }

  // ─── Основной цикл ──────────────────────────────────────────────

  private async startDownload(jobId: string) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const controller = new AbortController();
    this.controllers.set(jobId, controller);

    job.status = 'downloading';
    this.notifyNow();

    for (const entry of job.files) {
      if ((job.status as string) === 'cancelled') {
        if (entry.status === 'pending') entry.status = 'cancelled';
        continue;
      }
      if (!entry.selected) continue;
      if (entry.status === 'completed' || entry.status === 'skipped' || entry.status === 'cancelled') continue;

      // Проверка «уже скачан» по реальному файлу на диске.
      const expectedBytes = parseSizeToBytes(entry.file.size);
      try {
        const exists = expectedBytes !== null && (await fileExists(entry.file.name, expectedBytes));
        if (exists) {
          entry.status = 'skipped';
          entry.progress = 100;
          entry.downloadedBytes = expectedBytes;
          notifications.push('info', `Файл уже скачан: ${entry.file.name}`);
          this.updateJobProgress(job);
          this.notifyNow();
          continue;
        }
      } catch { /* check again via download */ }

      entry.status = 'downloading';
      entry.errorMessage = undefined;
      this.notifyNow();

      try {
        await this.downloadFile(entry, controller.signal, jobId);
        if ((entry.status as string) !== 'cancelled') {
          entry.status = 'completed';
          entry.progress = 100;
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          entry.status = 'cancelled';
        } else {
          entry.status = 'error';
          entry.errorMessage = err instanceof Error ? err.message : 'Unknown error';
          notifications.push('error', `Ошибка загрузки ${entry.file.name}: ${entry.errorMessage}`);
        }
      }

      this.updateJobProgress(job);
      this.notifyNow();
      if ((job.status as string) === 'cancelled') break;
    }

    this.controllers.delete(jobId);
    const cleanup = this.progressCleanups.get(jobId);
    if (cleanup) { cleanup(); this.progressCleanups.delete(jobId); }

    if ((job.status as string) === 'cancelled') { this.notifyNow(); return; }

    const selected = job.files.filter(f => f.selected);
    const allDone = selected.every(f => f.status === 'completed' || f.status === 'skipped');
    const hasError = selected.some(f => f.status === 'error');

    job.status = allDone && !hasError ? 'completed' : hasError ? 'error' : 'completed';
    job.isDownloaded = allDone && !hasError;
    this.notifyNow();

    if (job.isDownloaded) {
      notifications.push('success', `Загрузка завершена: ${job.modName}. Файлы готовы к установке.`, 8000);
    } else {
      notifications.push('warning', `Загрузка ${job.modName} завершена с ошибками.`, 8000);
    }
  }

  // ─── Скачивание одного файла ─────────────────────────────────────

  private async downloadFile(
    entry: DownloadFile,
    signal: AbortSignal,
    jobId: string,
  ): Promise<void> {
    const url = entry.file.url;
    if (!url) throw new Error('URL не указан');

    // 1) FSA — основной путь. В Electron через localhost FSA работает.
    if (isFsAccessSupported()) {
      return await this.downloadViaFSA(entry, url, signal);
    }

    // 2) Electron IPC — запасной (если FSA недоступен, но есть preload bridge).
    const api = getElectronApi();
    if (api) {
      return await this.downloadViaElectron(entry, url, signal, jobId, api);
    }

    // 3) Fallback — стандартный браузерный download.
    fallbackDownload(url, entry.file.name);
    entry.progress = 100;
    entry.downloadedBytes = 0;
  }

  // ─── FSA ─────────────────────────────────────────────────────────

  private async downloadViaFSA(entry: DownloadFile, url: string, signal: AbortSignal) {
    const startByte = await getFileSize(entry.file.name);
    const headers: Record<string, string> = {};
    if (startByte > 0) headers['Range'] = `bytes=${startByte}-`;

    const response = await fetch(url, { headers, signal });
    if (!response.ok && response.status !== 206) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    if (!response.body) throw new Error('Потоковая загрузка не поддерживается');

    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    const totalSize = startByte + contentLength;
    entry.downloadedBytes = startByte;

    let lastBytes = startByte;
    let lastTime = Date.now();

    await streamToFile(
      entry.file.name,
      response.body.getReader() as ReadableStreamDefaultReader<Uint8Array>,
      startByte,
      (downloaded) => {
        entry.downloadedBytes = downloaded;
        entry.progress = totalSize > 0 ? Math.round((downloaded / totalSize) * 100) : 0;
        const now = Date.now();
        const elapsed = (now - lastTime) / 1000;
        if (elapsed >= 0.5) {
          const bytesDelta = downloaded - lastBytes;
          if (bytesDelta > 0) {
            entry.speedBytesPerSec = Math.round(bytesDelta / elapsed);
            entry.etaSeconds = Math.round((totalSize - downloaded) / entry.speedBytesPerSec);
          }
          lastBytes = downloaded;
          lastTime = now;
        }
        this.scheduleNotify();
      },
    );
  }

  // ─── Electron IPC ────────────────────────────────────────────────

  private async downloadViaElectron(
    entry: DownloadFile,
    url: string,
    signal: AbortSignal,
    jobId: string,
    api: ElectronAPI,
  ) {
    const filename = entry.file.name;

    // Проверяем, может файл уже скачан
    try {
      const check = await api.electronFileExists(filename);
      const expectedBytes = parseSizeToBytes(entry.file.size);
      if (check.exists && check.size > 0 && (!expectedBytes || Math.abs(check.size - expectedBytes) <= 1)) {
        entry.status = 'skipped';
        entry.progress = 100;
        entry.downloadedBytes = check.size;
        notifications.push('info', `Файл уже скачан: ${filename}`);
        return;
      }
    } catch { /* скачиваем */ }

    // Прогресс от main-процесса
    const cleanup = api.onDownloadProgress((data) => {
      if (data.filename !== filename) return;
      entry.downloadedBytes = data.downloaded;
      entry.progress = data.percent;
      this.scheduleNotify();
    });
    this.progressCleanups.set(jobId, cleanup);

    signal.addEventListener('abort', () => { entry.status = 'cancelled'; });

    try {
      const result = await api.electronDownload(url, filename);
      if ((entry.status as string) !== 'cancelled') {
        entry.downloadedBytes = result.downloadedBytes;
        entry.progress = 100;
      }
    } finally {
      signal.removeEventListener('abort', () => {});
      const c = this.progressCleanups.get(jobId);
      if (c) { c(); this.progressCleanups.delete(jobId); }
    }
  }

  // ─── Утилиты ─────────────────────────────────────────────────────

  private updateJobProgress(job: DownloadJob) {
    const selected = job.files.filter(f => f.selected);
    const total = selected.length;
    if (total === 0) { job.totalProgress = 0; return; }
    const sum = selected.reduce((acc, f) => {
      if (f.status === 'completed' || f.status === 'skipped') return acc + 100;
      return acc + f.progress;
    }, 0);
    job.totalProgress = Math.round(sum / total);
  }

  getJob(jobId: string): DownloadJob | undefined { return this.jobs.get(jobId); }
  getAllJobs(): DownloadJob[] { return Array.from(this.jobs.values()); }
}

export const downloadManager = new DownloadManager();

// ─── Вспомогательная (для внутреннего использования) ────────────────

function parseSizeToBytes(size: string | undefined | null): number | null {
  if (!size) return null;
  const match = String(size).trim().match(/^([\d.,]+)\s*([KMGTP]?B?)$/i);
  if (!match) return null;
  const value = parseFloat(match[1].replace(',', '.'));
  if (!Number.isFinite(value)) return null;
  const unit = match[2].toUpperCase();
  const m: Record<string, number> = {
    '': 1, B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4,
  };
  return m[unit] ? Math.round(value * m[unit]) : null;
}
