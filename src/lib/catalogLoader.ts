/**
 * Загрузчик каталога карточек.
 *
 * 4 уровня фолбэка:
 * 1) Supabase (бесплатная БД) — основной каталог
 * 2) GitHub Pages (catalog.json) — фолбэк
 * 3) Локальный catalog.json (public/) —офлайн
 * 4) IndexedDB кеш — última línea de defensa
 */

import type { CatalogData, CatalogCategory, CatalogMod } from '../types';

// ══════════════════════════════════════════════════════════════════
// НАСТРОЙКИ — ЗАМЕНИ НА СВОИ ИЗ SUPABASE DASHBOARD
// ══════════════════════════════════════════════════════════════════

/** Supabase — ОТКЛЮЧЕНО (дубликаты). Используем GitHub Pages. */
const SUPABASE_URL = '';
const SUPABASE_ANON_KEY = '';

/** GitHub Pages URL с catalog.json (основной источник) */
export const CATALOG_REMOTE_URL = 'https://maksimsejko562-prog.github.io/miami-catalog/catalog.json';

/** Локальный catalog.json */
const LOCAL_CATALOG_URL = './catalog.json';

const CACHE_STORE = 'catalog-cache';
const CACHE_KEY = 'latest';

// ══════════════════════════════════════════════════════════════════
// Supabase PostgREST
// ══════════════════════════════════════════════════════════════════

interface DbCategory {
  id: string;
  label: string;
  icon: string | null;
  sort_order: number;
}

interface DbMod {
  id: number;
  category: string;
  name: string;
  description: string;
  image_url: string;
  download_url: string;
  file_size_label: string;
  version: string;
  author: string;
}

const supabaseHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

async function supabaseGet<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { ...supabaseHeaders, Prefer: 'return=representation' },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

function dbModToCatalogMod(m: DbMod): CatalogMod {
  return {
    id: m.id,
    category: m.category,
    name: m.name,
    description: m.description,
    image_url: m.image_url,
    download_url: m.download_url,
  };
}

function dbCategoryToCatalogCategory(c: DbCategory): CatalogCategory {
  return { id: c.id, label: c.label, icon: c.icon ?? undefined };
}

async function loadFromSupabase(): Promise<CatalogData | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  const [dbCategories, dbMods] = await Promise.all([
    supabaseGet<DbCategory[]>('categories?select=*&order=sort_order.asc'),
    supabaseGet<DbMod[]>('mods?select=*&order=created_at.desc'),
  ]);

  return {
    categories: dbCategories.map(dbCategoryToCatalogCategory),
    mods: dbMods.map(dbModToCatalogMod),
  };
}

// ══════════════════════════════════════════════════════════════════
// IndexedDB кеш
// ══════════════════════════════════════════════════════════════════

function openCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('miami-launcher', 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function cachePut(data: CatalogData): Promise<void> {
  try {
    const db = await openCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, 'readwrite');
      tx.objectStore(CACHE_STORE).put({ ...data, _cachedAt: Date.now() }, CACHE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch { /* ok */ }
}

async function cacheGet(): Promise<CatalogData | null> {
  try {
    const db = await openCacheDb();
    const result = await new Promise<CatalogData | null>((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, 'readonly');
      const req = tx.objectStore(CACHE_STORE).get(CACHE_KEY);
      req.onsuccess = () => resolve((req.result as CatalogData | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch { return null; }
}

async function cacheClear(): Promise<void> {
  try {
    const db = await openCacheDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(CACHE_STORE, 'readwrite');
      tx.objectStore(CACHE_STORE).delete(CACHE_KEY);
      tx.oncomplete = () => resolve();
    });
    db.close();
  } catch { /* ok */ }
}

// ══════════════════════════════════════════════════════════════════
// JSON-файлы (GitHub Pages / локальный)
// ══════════════════════════════════════════════════════════════════

function normalize(raw: unknown): CatalogData {
  if (Array.isArray(raw)) return { mods: raw as CatalogMod[] };
  const obj = raw as { categories?: CatalogCategory[]; mods?: CatalogMod[] };
  if (obj && Array.isArray(obj.mods)) return { categories: obj.categories, mods: obj.mods };
  throw new Error('Некорректный формат каталога');
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

async function fetchJson(url: string, cacheBust: boolean): Promise<CatalogData> {
  const fullUrl = cacheBust ? `${url}${url.includes('?') ? '&' : '?'}t=${todayKey()}` : url;
  const response = await fetch(fullUrl, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return normalize(await response.json());
}

function getElectronApi(): { readAppFile?: (p: string) => Promise<string | null> } | undefined {
  return (window as unknown as { electronAPI?: { readAppFile?: (p: string) => Promise<string | null> } }).electronAPI;
}

async function readLocalCatalog(): Promise<CatalogData> {
  const api = getElectronApi();
  if (api?.readAppFile) {
    const text = await api.readAppFile('catalog.json');
    if (text != null) return normalize(JSON.parse(text));
    throw new Error('catalog.json не найден (IPC)');
  }
  return await fetchJson(LOCAL_CATALOG_URL, true);
}

// ══════════════════════════════════════════════════════════════════
// ПУБЛИЧНЫЙ API
// ══════════════════════════════════════════════════════════════════

export async function loadCatalog(): Promise<CatalogData> {
  // 1. Supabase
  try {
    const data = await loadFromSupabase();
    if (data && data.mods && data.mods.length > 0) {
      void cachePut(data);
      return data;
    }
  } catch (err) {
    console.warn('[CatalogLoader] Supabase недоступен:', err);
  }

  // 2. GitHub Pages
  if (CATALOG_REMOTE_URL) {
    try {
      const data = await fetchJson(CATALOG_REMOTE_URL, true);
      void cachePut(data);
      return data;
    } catch (err) {
      console.warn('[CatalogLoader] GitHub Pages недоступен:', err);
    }
  }

  // 3. Локальный catalog.json
  try {
    const data = await readLocalCatalog();
    if (data && data.mods && data.mods.length > 0) {
      await cacheClear();
      return data;
    }
  } catch (err) {
    console.warn('[CatalogLoader] Локальный каталог недоступен:', err);
  }

  // 4. IndexedDB кеш
  const cached = await cacheGet();
  if (cached && cached.mods && cached.mods.length > 0) return cached;

  return { mods: [] };
}

export function getCategories(data: CatalogData): CatalogCategory[] {
  if (data.categories && data.categories.length > 0) return data.categories;
  const ids = new Set<string>();
  data.mods.forEach((m) => m.category && ids.add(m.category));
  return Array.from(ids).map((id) => ({ id, label: id }));
}

export function filterByCategory(mods: CatalogMod[], category: string): CatalogMod[] {
  if (!category || category === '__all') return mods;
  return mods.filter((m) => m.category === category);
}
