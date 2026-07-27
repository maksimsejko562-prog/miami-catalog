/**
 * Менеджер загрузок.
 *
 * В Electron: скачивание через IPC (main-процесс), файлы в %APPDATA%/MiamiGraphics/.
 * В браузере: File System Access API.
 * Fallback: <a download>.
 */

import type { ExternalModFile } from '../types';
import { isFsAccessSupported, getFileSize, streamToFile, fallbackDownload } from './storage';
import { notifications } from './notifications';

// ─── Electron API ───────────────────────────────────────────────────

interface ElectronAPI {
  electronDownload: (url: string, filename: string) => Promise<{
    filePath: string; downloadedBytes: number; complete: boolean;
  }>;
  electronFileExists: (filename: string) => Promise<{ exists: boolean; size: number }>;
  onDownloadProgress: (cb: (data: {
    filename: string; downloaded: number; total: number; percent: number;
  }) => void) => () => void;
}

function getElectronApi(): ElectronAPI | null {
  return (window as unknown as { electronAPI?: ElectronAPI }).electronAPI || null;
}

const isElectron = !!getElectronApi();

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
  isDownloaded: boolean;
}

type Listener = (jobs: DownloadJob[]) => void;

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
    const downloadFiles: DownloadFile[] = files.map(f => ({
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
          notifications.push('error', `Ошибка загрузки ${entry.file.name}: ${entry.errorMessage}`, 6000);
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
      notifications.push('success', `Загрузка завершена: ${job.modName}.`, 6000);
    }
  }

  // ─── Скачивание одного файла ─────────────────────────────────────

  private async downloadFile(entry: DownloadFile, signal: AbortSignal, jobId: string) {
    const url = entry.file.url;
    if (!url) throw new Error('URL не указан');

    // В Electron — IPC, в браузере — FSA, последний — fallback
    if (isElectron) {
      return await this.downloadViaElectron(entry, url, signal, jobId);
    }
    if (isFsAccessSupported()) {
      return await this.downloadViaFSA(entry, url, signal);
    }
    fallbackDownload(url, entry.file.name);
    entry.progress = 100;
  }

  // ─── Electron IPC ────────────────────────────────────────────────

  private async downloadViaElectron(entry: DownloadFile, url: string, signal: AbortSignal, jobId: string) {
    const api = getElectronApi()!;
    const filename = entry.file.name;

    // Проверка уже скачанного
    try {
      const check = await api.electronFileExists(filename);
      const expected = parseSize(entry.file.size);
      if (check.exists && check.size > 0 && (!expected || Math.abs(check.size - expected) <= 1)) {
        entry.status = 'skipped';
        entry.progress = 100;
        entry.downloadedBytes = check.size;
        return;
      }
    } catch {}

    // Прогресс
    const cleanup = api.onDownloadProgress(data => {
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

  // ─── FSA ─────────────────────────────────────────────────────────

  private async downloadViaFSA(entry: DownloadFile, url: string, signal: AbortSignal) {
    const startByte = await getFileSize(entry.file.name);
    const headers: Record<string, string> = {};
    if (startByte > 0) headers['Range'] = `bytes=${startByte}-`;

    const response = await fetch(url, { headers, signal });
    if (!response.ok && response.status !== 206) throw new Error(`HTTP ${response.status}`);
    if (!response.body) throw new Error('Поток не поддерживается');

    const totalSize = startByte + parseInt(response.headers.get('content-length') || '0', 10);
    entry.downloadedBytes = startByte;
    let lastBytes = startByte;
    let lastTime = Date.now();

    await streamToFile(
      entry.file.name,
      response.body.getReader() as ReadableStreamDefaultReader<Uint8Array>,
      startByte,
      downloaded => {
        entry.downloadedBytes = downloaded;
        entry.progress = totalSize > 0 ? Math.round((downloaded / totalSize) * 100) : 0;
        const now = Date.now();
        const elapsed = (now - lastTime) / 1000;
        if (elapsed >= 0.5) {
          const delta = downloaded - lastBytes;
          if (delta > 0) {
            entry.speedBytesPerSec = Math.round(delta / elapsed);
            entry.etaSeconds = Math.round((totalSize - downloaded) / entry.speedBytesPerSec);
          }
          lastBytes = downloaded;
          lastTime = now;
        }
        this.scheduleNotify();
      },
    );
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

function parseSize(size: string | undefined | null): number | null {
  if (!size) return null;
  const m = String(size).trim().match(/^([\d.,]+)\s*([KMGTP]?B?)$/i);
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(v)) return null;
  const u = m[2].toUpperCase();
  const tbl: Record<string, number> = { '': 1, B: 1, KB: 1024, MB: 1048576, GB: 1073741824 };
  return tbl[u] ? Math.round(v * tbl[u]) : null;
}
