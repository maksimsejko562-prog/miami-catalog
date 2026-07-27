/**
 * Слой установки модов.
 *
 * В Electron: установка через IPC (main-процесс копирует в GTA5/mods/).
 * В браузере: распаковка через File System Access API (пользователь выбирает папку).
 */

import { ZipReader } from '@zip.js/zip.js';
import type { Entry, FileEntry } from '@zip.js/zip.js';
import { getDownloadDir } from './storage';

// ─── Electron API ───────────────────────────────────────────────────

interface ElectronAPI {
  detectGtaPath: () => Promise<{ path: string | null; source: string | null }>;
  electronInstallMod: (params: {
    downloadFilename: string;
    gtaPath: string;
    category: string;
    modId: string | number;
  }) => Promise<{ success: boolean; targetDir: string; extracted: boolean }>;
}

function getElectronApi(): ElectronAPI | null {
  return (window as unknown as { electronAPI?: ElectronAPI }).electronAPI || null;
}

const isElectron = !!getElectronApi();

// ─── FSA helpers ────────────────────────────────────────────────────

interface FsDirHandle extends FileSystemDirectoryHandle {}

const DB_NAME = 'miami-launcher';
const STORE = 'handles';
const MODS_HANDLE_KEY = 'miami-mods-dir';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  const result = await new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

export function isFsAccessSupported(): boolean {
  return typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
}

let cachedModsDir: FsDirHandle | null = null;

/** Выбор папки модов (FSA). В Electron не используется. */
export async function pickModsDir(): Promise<FsDirHandle | null> {
  if (!isFsAccessSupported() || isElectron) return null;
  const show = (window as unknown as {
    showDirectoryPicker: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
  }).showDirectoryPicker;
  const handle = await show({ mode: 'readwrite' }) as unknown as FsDirHandle;
  cachedModsDir = handle;
  await idbPut(MODS_HANDLE_KEY, handle);
  return handle;
}

export async function getModsDir(): Promise<FsDirHandle | null> {
  if (cachedModsDir) return cachedModsDir;
  if (!isFsAccessSupported() || isElectron) return null;
  const stored = await idbGet<FsDirHandle>(MODS_HANDLE_KEY);
  if (!stored) return null;
  cachedModsDir = stored;
  return cachedModsDir;
}

export function getModsDirName(): string {
  if (isElectron) return 'GTA 5 /mods';
  return cachedModsDir?.name ?? 'mods';
}

// ─── Тип файла ──────────────────────────────────────────────────────

export type InstallFileType = 'zip' | 'data' | 'other';

export function getFileType(name: string): InstallFileType {
  const lower = name.toLowerCase();
  if (lower.endsWith('.zip')) return 'zip';
  if (/\.(rpf|oiv|dat|ytd|ydr|ymt|meta|awc|rel|png|dds|ydd|gxt2)$/i.test(lower)) return 'data';
  return 'other';
}

// ─── Утилиты путей ──────────────────────────────────────────────────

function safeSegments(p: string): string[] {
  return p.split('/').filter(s => s.length > 0 && s !== '.' && s !== '..').map(s => s.replace(/^\\+/, ''));
}

async function resolveTargetDir(
  base: FsDirHandle,
  segments: string[],
): Promise<{ dir: FsDirHandle; fileName: string }> {
  let dir = base;
  for (const seg of segments.slice(0, -1)) {
    dir = await dir.getDirectoryHandle(seg, { create: true }) as unknown as FsDirHandle;
  }
  return { dir, fileName: segments[segments.length - 1] };
}

// ─── Установка мода ─────────────────────────────────────────────────

export interface InstallProgress {
  done: number;
  total: number;
  current?: string;
}

/**
 * Установить мод.
 *
 * В Electron: определяет GTA 5, вызывает IPC для копирования/распаковки.
 * В браузере: читает файл из FSA-папки загрузок, распаковывает в FSA-папку модов.
 */
export async function installMod(
  fileName: string,
  category: string,
  modId: string | number,
  onProgress?: (p: InstallProgress) => void,
): Promise<void> {
  // ═══ Electron: установка через IPC ═══
  if (isElectron) {
    const api = getElectronApi()!;
    onProgress?.({ done: 0, total: 1, current: 'Определение GTA 5…' });

    const gta = await api.detectGtaPath();
    if (!gta.path) {
      throw new Error(
        'GTA 5 не найдена. Убедитесь, что игра установлена через Steam, Epic или Rockstar.'
      );
    }

    onProgress?.({ done: 0, total: 1, current: 'Установка…' });

    const result = await api.electronInstallMod({
      downloadFilename: fileName,
      gtaPath: gta.path,
      category,
      modId,
    });

    if (!result.success) {
      throw new Error('Не удалось установить мод');
    }

    onProgress?.({ done: 1, total: 1 });
    return;
  }

  // ═══ Браузер: установка через FSA ═══
  const modsRoot = await getModsDir();
  if (!modsRoot) throw new Error('Папка модов не выбрана');

  const downloadDir = await getDownloadDir();
  if (!downloadDir) throw new Error('Папка загрузок не выбрана');

  const srcHandle = await downloadDir.getFileHandle(fileName);
  const file = await (srcHandle as unknown as { getFile: () => Promise<File> }).getFile();

  const categoryDir = await modsRoot.getDirectoryHandle(category, { create: true });
  const targetRoot = await categoryDir.getDirectoryHandle(String(modId), { create: true });

  const type = getFileType(fileName);
  if (type === 'zip') {
    await extractZip(file, targetRoot, onProgress);
  } else {
    onProgress?.({ done: 0, total: 1, current: fileName });
    await copyFile(file, targetRoot, fileName);
    onProgress?.({ done: 1, total: 1 });
  }
}

// ─── Распаковка ZIP (FSA) ──────────────────────────────────────────

async function extractZip(
  file: File,
  targetRoot: FsDirHandle,
  onProgress?: (p: InstallProgress) => void,
): Promise<void> {
  const reader = new ZipReader<Entry>(file.stream() as ReadableStream<Uint8Array>);
  let entries: Entry[];
  try {
    entries = await reader.getEntries();
  } finally {
    await reader.close();
  }

  const fileEntries = entries.filter((e): e is FileEntry => !e.directory);
  const total = fileEntries.length;

  for (let i = 0; i < fileEntries.length; i++) {
    const entry = fileEntries[i];
    onProgress?.({ done: i, total, current: entry.filename });
    const segments = safeSegments(entry.filename);
    if (segments.length === 0) continue;
    const { dir, fileName: outName } = await resolveTargetDir(targetRoot, segments);
    const outHandle = await dir.getFileHandle(outName, { create: true });
    const writable = await (outHandle as unknown as { createWritable: () => Promise<FileSystemWritableFileStream> }).createWritable();
    await entry.getData(writable as unknown as WritableStream<Uint8Array>);
  }

  onProgress?.({ done: total, total });
}

// ─── Копирование файла (FSA) ───────────────────────────────────────

async function copyFile(
  file: File,
  targetDir: FsDirHandle,
  outName: string,
): Promise<void> {
  const outHandle = await targetDir.getFileHandle(outName, { create: true });
  const writable = await (outHandle as unknown as { createWritable: () => Promise<FileSystemWritableFileStream> }).createWritable();
  const reader = file.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    await writable.write(value as unknown as ArrayBufferView<ArrayBuffer>);
  }
  await writable.close();
}
