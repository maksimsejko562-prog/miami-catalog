import type { LucideIcon } from 'lucide-react';

/** Top-level navigation rail. */
export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Optional neon accent used for the active tile + icon glow. */
  accent: AccentKey;
}

/** Sub-catalogs living inside the Modifications hub. */
export interface CatalogTab {
  id: CatalogId;
  label: string;
  icon: LucideIcon;
  accent: AccentKey;
  blurb: string;
}

export type AccentKey =
  | 'pink'
  | 'magenta'
  | 'purple'
  | 'cyan'
  | 'blue'
  | 'sun'
  | 'lime';

export type CatalogId =
  | 'redux'
  | 'guns'
  | 'armor'
  | 'sounds'
  | 'minimaps'
  | 'reticles'
  | 'bigmap'
  | 'double';

export type ScreenId =
  | 'home'
  | 'modifications'
  | 'players'
  | 'pro-settings'
  | 'settings'
  | 'installed'
  | 'profile';

export interface Mod {
  id: string;
  title: string;
  author: string;
  catalog: CatalogId;
  /** Semantic tags shown as chips on the card. */
  tags: string[];
  /** ISO-like date string for the "updated" badge. */
  updated: string;
  /** Arbitrary size label, e.g. "248 MB". */
  size: string;
  version: string;
  downloads: number;
  rating: number; // 0..5
  /** Short description for the card footer. */
  description: string;
  /** Cover gradient class pair — we render CSS gradients, no binary assets. */
  cover: { from: string; to: string; icon: LucideIcon };
  featured?: boolean;
  /** Список файлов внутри мода — показывается иконками на карточке. */
  files: ModFile[];
}

/** A mod the user has installed (derived from store.installIds). */
export interface InstalledEntry {
  mod: Mod;
  installedAt: string;
}

/** Тип файла GTA-мода. Определяет иконку и цвет. */
export type ModFileType =
  | 'rpf'      // .rpf архивы (основной формат GTA)
  | 'ydr'      // .ydr 3D-модели
  | 'ytd'      // .ytd текстурные словари
  | 'texture'  // .png / .dds / .ydd текстуры
  | 'audio'    // .ogg / .wav звуки
  | 'data'     // .ymt / .ymt / .meta данные
  | 'archive'; // .zip / .7z общие архивы

/** Один файл внутри мода. */
export interface ModFile {
  /** Имя файла, например "weapons.rpf" */
  name: string;
  /** Тип файла — определяет иконку. */
  type: ModFileType;
  /** Человекочитаемый размер, например "248 MB" */
  size: string;
  /** Размер в байтах (для расчёта прогресса) */
  sizeBytes?: number;
  /** Прямая ссылка на скачивание файла */
  url?: string;
}

/** Мод из внешнего JSON (mods.json) */
export interface ExternalMod {
  id: number;
  name: string;
  category: string;
  description: string;
  version: string;
  image_url?: string;
  files: ExternalModFile[];
}

/** Файл мода из внешнего JSON */
export interface ExternalModFile {
  name: string;
  url: string;
  size: string;
}

// ─── Каталог (новый формат: одна карточка = один файл) ────────────────

/** Категория каталога с иконкой (имя lucide-иконки). */
export interface CatalogCategory {
  id: string;
  label: string;
  /** Имя иконки из lucide-react (необязательно). */
  icon?: string;
}

/** Одна карточка каталога — независимая единица с одним файлом. */
export interface CatalogMod {
  id: number;
  category: string;
  name: string;
  description: string;
  /** Ссылка на обложку (необязательно). */
  image_url?: string;
  /** Прямая ссылка на единственный скачиваемый файл карточки. */
  download_url: string;
  /** Размер файла, например "1724 MB" */
  file_size_label?: string;
  /** Автор мода */
  author?: string;
  /** Количество скачиваний */
  downloads?: number;
  /** Ссылка на YouTube обзор */
  youtube_url?: string;
  /** Галерея скриншотов (URL) */
  screenshots?: string[];
  /** Локальные пути к скачанным картинкам */
  local_images?: string[];
  /** Варианты внутри архива (цвета, типы и т.п.) */
  variants?: CatalogVariant[];
}

/** Вариант внутри архива мода (например, цвет оружия) */
export interface CatalogVariant {
  /** Название варианта, например "Красный" */
  name: string;
  /** Папка внутри архива, которую нужно распаковать */
  folder: string;
  /** HEX-цвет для отображения (необязательно) */
  color?: string;
  /** Превью-картинка варианта (необязательно) */
  image_url?: string;
}

/** Полный каталог: опциональный список категорий + список карточек. */
export interface CatalogData {
  categories?: CatalogCategory[];
  mods: CatalogMod[];
}
