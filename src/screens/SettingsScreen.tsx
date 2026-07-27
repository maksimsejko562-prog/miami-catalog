import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Gamepad2, FileText, Eye, Database, Shield, HelpCircle,
  Trash2, RotateCcw, Settings as SettingsIcon, MessageCircle, X,
  Download, Bell, RefreshCw, Zap, Info, ExternalLink,
  Moon, Sun, Upload, AlertTriangle, FolderOpen, Search,
} from 'lucide-react';
import { GlassPanel } from '../design';
import { notifications } from '../lib/notifications';
import { useUIStore } from '../store/ui';

type ThreeDMode = 'cubes' | 'spheres' | 'off';
type AccentColor = 'pink' | 'magenta' | 'purple' | 'cyan' | 'blue' | 'sun' | 'lime';
type Theme = 'dark' | 'light';

const ACCENT_COLORS: { id: AccentColor; label: string; color: string }[] = [
  { id: 'pink', label: 'Розовый', color: '#ff3d8b' },
  { id: 'magenta', label: 'Маджента', color: '#ff2bb7' },
  { id: 'purple', label: 'Фиолетовый', color: '#b14bff' },
  { id: 'cyan', label: 'Голубой', color: '#1ff5ff' },
  { id: 'blue', label: 'Синий', color: '#3d7dff' },
  { id: 'sun', label: 'Солнечный', color: '#ffb13d' },
  { id: 'lime', label: 'Лайм', color: '#9bff5e' },
];

const ACCENT_TO_CSS: Record<AccentColor, { accent: string; hover: string; pressed: string }> = {
  pink:    { accent: '#ff3d8b', hover: '#ff6aa8', pressed: '#e01a6b' },
  magenta: { accent: '#ff2bb7', hover: '#ff5cc9', pressed: '#d6009c' },
  purple:  { accent: '#b14bff', hover: '#c77aff', pressed: '#9618f0' },
  cyan:    { accent: '#1ff5ff', hover: '#5cf8ff', pressed: '#00d1db' },
  blue:    { accent: '#3d7dff', hover: '#6a9eff', pressed: '#1a5ae8' },
  sun:     { accent: '#ffb13d', hover: '#ffc66e', pressed: '#f0961a' },
  lime:    { accent: '#9bff5e', hover: '#b5ff85', pressed: '#7ee82f' },
};

// ── localStorage helpers ──────────────────────────────────────────
function loadSetting<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(`miami-settings-${key}`);
    if (stored !== null) return JSON.parse(stored);
  } catch {}
  return defaultValue;
}
function saveSetting(key: string, value: unknown) {
  try {
    localStorage.setItem(`miami-settings-${key}`, JSON.stringify(value));
  } catch {}
}

const ALL_SETTING_KEYS = [
  'bg3d', 'accentColor', 'theme', 'language', 'gtaPath',
  'parallelDownloads', 'speedLimit', 'autoUpdateCatalog',
  'notifications', 'downloadNotify', 'cacheEnabled',
];

// ── Accent color → CSS variables ──────────────────────────────────
function applyAccent(id: AccentColor) {
  const css = ACCENT_TO_CSS[id];
  const root = document.documentElement;
  root.style.setProperty('--accent', css.accent);
  root.style.setProperty('--accent-hover', css.hover);
  root.style.setProperty('--accent-pressed', css.pressed);
  root.style.setProperty('--accent-soft', `color-mix(in srgb, ${css.accent} 18%, transparent)`);
}

// ── Theme toggle ──────────────────────────────────────────────────
function applyTheme(t: Theme) {
  document.documentElement.classList.toggle('dark', t === 'dark');
  document.documentElement.classList.toggle('light', t !== 'dark');
  // Ensure body has the right class if used
  document.body.classList.toggle('dark', t === 'dark');
}

// ── Confirmation dialog ───────────────────────────────────────────
function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-white/[0.12] bg-[#1a1a22] shadow-2xl p-5"
          >
            <div className="flex items-center gap-3 mb-3">
              {danger && <AlertTriangle className="w-5 h-5 text-status-error shrink-0" />}
              <h3 className="text-sm font-bold text-text-primary">{title}</h3>
            </div>
            <p className="text-xs text-text-muted mb-5 leading-relaxed">{message}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={onCancel}
                className="px-4 py-2 rounded-xl bg-white/[0.06] border border-white/[0.10]
                           text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={onConfirm}
                className={`px-4 py-2 rounded-xl text-xs font-semibold text-white transition-colors ${
                  danger
                    ? 'bg-status-error hover:bg-status-error/80'
                    : 'bg-white/[0.1] hover:bg-white/[0.18]'
                }`}
              >
                {confirmLabel || 'Подтвердить'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════
export default function SettingsScreen() {
  // Appearance
  const [bg3d, setBg3d] = useState<ThreeDMode>(() => loadSetting('bg3d', 'cubes'));
  const [accentColor, setAccentColor] = useState<AccentColor>(() => loadSetting('accentColor', 'pink'));
  const [theme, setTheme] = useState<Theme>(() => loadSetting('theme', 'dark'));
  // App version (from Electron main or package.json fallback)
  const [appVersion, setAppVersion] = useState('0.1.0');
  useEffect(() => {
    window.electronAPI?.getAppVersion().then(setAppVersion).catch(() => {});
  }, []);
  // Game
  const [gtaPath, setGtaPath] = useState(() => loadSetting('gtaPath', 'D:\\Games\\steamapps\\common\\Grand Theft Auto V'));
  const [showPathInput, setShowPathInput] = useState(false);
  const [pathDraft, setPathDraft] = useState('');

  // Downloads
  const [parallelDownloads, setParallelDownloads] = useState(() => loadSetting('parallelDownloads', 3));
  const [speedLimit, setSpeedLimit] = useState(() => loadSetting('speedLimit', 0));
  const [autoUpdateCatalog, setAutoUpdateCatalog] = useState(() => loadSetting('autoUpdateCatalog', true));

  // Notifications
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => loadSetting('notifications', true));
  const [downloadNotify, setDownloadNotify] = useState(() => loadSetting('downloadNotify', true));

  // Cache
  const [cacheEnabled, setCacheEnabled] = useState(() => loadSetting('cacheEnabled', true));
  const [cacheSize, setCacheSize] = useState('364 MB');

  // Support modal
  const [showSupport, setShowSupport] = useState(false);

  // Confirm dialog
  const [confirm, setConfirm] = useState<{
    title: string; message: string; confirmLabel?: string; danger?: boolean;
    onConfirm: () => void;
  } | null>(null);

  // Apply accent + theme on mount and on change
  useEffect(() => { applyAccent(accentColor); }, [accentColor]);
  useEffect(() => { applyTheme(theme); }, [theme]);

  // Save settings on change
  useEffect(() => {
    saveSetting('bg3d', bg3d);
    window.dispatchEvent(new CustomEvent('miami-bg3d-change'));
  }, [bg3d]);
  useEffect(() => { saveSetting('accentColor', accentColor); }, [accentColor]);
  useEffect(() => { saveSetting('theme', theme); }, [theme]);
  useEffect(() => { saveSetting('gtaPath', gtaPath); }, [gtaPath]);
  useEffect(() => { saveSetting('parallelDownloads', parallelDownloads); }, [parallelDownloads]);
  useEffect(() => { saveSetting('speedLimit', speedLimit); }, [speedLimit]);
  useEffect(() => { saveSetting('autoUpdateCatalog', autoUpdateCatalog); }, [autoUpdateCatalog]);
  useEffect(() => { saveSetting('notifications', notificationsEnabled); }, [notificationsEnabled]);
  useEffect(() => { saveSetting('downloadNotify', downloadNotify); }, [downloadNotify]);
  useEffect(() => { saveSetting('cacheEnabled', cacheEnabled); }, [cacheEnabled]);

  // ── Handlers ──────────────────────────────────────────────────────

  const handleSavePath = () => {
    setGtaPath(pathDraft);
    setShowPathInput(false);
    notifications.push('success', 'Путь к GTA V сохранён');
  };

  const handleDeleteAllMods = () => {
    // Реально очищаем список установленных модов
    const ids = useUIStore.getState().installIds;
    ids.forEach((id) => useUIStore.getState().removeInstalled(id));
    // Очищаем IndexedDB (модные хэндлы)
    try { indexedDB.deleteDatabase('miami-launcher'); } catch {}
    notifications.push('success', 'Все моды удалены. Установлено: 0');
  };

  const handleRestoreBackup = () => {
    // При реальном бекапе нужно копировать update.rpf из резервной папки
    notifications.push('info', 'Функция восстановления: найдите оригинальный update.rpf вручную.');
  };

  const handleClearCache = () => {
    try {
      indexedDB.deleteDatabase('miami-launcher');
      indexedDB.deleteDatabase('catalog-cache');
      setCacheSize('0 MB');
      notifications.push('success', 'Кеш очищен. Размер: 0 MB');
    } catch {
      notifications.push('error', 'Не удалось очистить кеш');
    }
  };

  const handleCheckUpdate = async () => {
    if (window.electronAPI) {
      notifications.push('info', 'Проверка обновлений...');
      const result = await window.electronAPI.checkForUpdates();
      if (result.status === 'available') {
        notifications.push('success', `Доступно обновление ${result.version}!`);
      } else if (result.status === 'not-available') {
        notifications.push('info', 'У вас актуальная версия');
      } else {
        notifications.push('error', result.message);
      }
      return;
    }
    // fallback для браузерного dev-режима
    try {
      const res = await fetch('https://api.github.com/repos/maksimsejko562-prog/miami-mods/releases/latest');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const latestTag = data.tag_name || 'неизвестно';
      notifications.push('info', `Последний релиз: ${latestTag} (${data.published_at?.slice(0, 10) || ''})`);
    } catch {
      notifications.push('success', 'У вас установлена последняя версия');
    }
  };

  const handleOpenDocs = () => {
    window.open('https://miamigraphics.ru/docs', '_blank');
  };

  const handleOpenLogs = () => {
    try {
      const logs = Object.entries(localStorage)
        .filter(([k]) => k.startsWith('miami-'))
        .map(([k, v]) => `${k}: ${v.slice(0, 100)}`)
        .join('\n');
      const blob = new Blob([logs], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'miami-logs.txt'; a.click();
      URL.revokeObjectURL(url);
      notifications.push('success', 'Логи сохранены');
    } catch {
      notifications.push('error', 'Не удалось сохранить логи');
    }
  };

  const handleExportSettings = () => {
    try {
      const data: Record<string, unknown> = {};
      ALL_SETTING_KEYS.forEach((k) => {
        const v = localStorage.getItem(`miami-settings-${k}`);
        if (v !== null) data[k] = JSON.parse(v);
      });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'miami-settings-backup.json'; a.click();
      URL.revokeObjectURL(url);
      notifications.push('success', 'Настройки экспортированы');
    } catch {
      notifications.push('error', 'Ошибка экспорта');
    }
  };

  const handleImportSettings = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        Object.entries(data).forEach(([k, v]) => {
          localStorage.setItem(`miami-settings-${k}`, JSON.stringify(v));
        });
        notifications.push('success', 'Настройки импортированы. Перезагрузите страницу.');
        setTimeout(() => location.reload(), 1500);
      } catch {
        notifications.push('error', 'Неверный файл настроек');
      }
    };
    input.click();
  };

  const resetAllSettings = () => {
    ALL_SETTING_KEYS.forEach(k => localStorage.removeItem(`miami-settings-${k}`));
    notifications.push('success', 'Настройки сброшены. Перезагрузка...');
    setTimeout(() => location.reload(), 800);
  };

  return (
    <div className="h-full flex flex-col px-8 pt-5 pb-5 gap-5 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-white/[0.06] border border-white/[0.10] flex items-center justify-center">
          <SettingsIcon className="w-5 h-5 text-text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">Настройки</h1>
          <p className="text-xs text-text-muted">{appVersion}</p>
        </div>
      </div>

      {/* ═══ Внешний вид ═══ */}
      <GlassPanel depth="z2" tint="soft" rounded="2xl" className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.10] flex items-center justify-center">
            <Eye className="w-4 h-4 text-text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-text-primary">Внешний вид</h2>
            <p className="text-xs text-text-muted">Тема, цвет и визуальные настройки</p>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          {/* 3D фон */}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-text-primary">3D-фон</h4>
              <p className="text-xs text-text-muted mt-0.5">Анимированная сцена за интерфейсом</p>
            </div>
            <div className="flex gap-2">
              {(['cubes', 'spheres', 'off'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setBg3d(mode)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-200 ${
                    bg3d === mode
                      ? 'bg-accent text-white border-accent shadow-glow-accent'
                      : 'bg-white/[0.06] text-text-secondary border-white/[0.10] hover:text-text-primary'
                  }`}
                >
                  {mode === 'cubes' ? 'Кубы' : mode === 'spheres' ? 'Сферы' : 'Выкл.'}
                </button>
              ))}
            </div>
          </div>

          {/* Тема */}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-text-primary">Тема оформления</h4>
              <p className="text-xs text-text-muted mt-0.5">Тёмная или светлая тема</p>
            </div>
            <div className="flex gap-2">
              {([['dark', 'Тёмная', Moon], ['light', 'Светлая', Sun]] as const).map(([id, label, Icon]) => (
                <button
                  key={id}
                  onClick={() => setTheme(id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-200 ${
                    theme === id
                      ? 'bg-accent text-white border-accent shadow-glow-accent'
                      : 'bg-white/[0.06] text-text-secondary border-white/[0.10] hover:text-text-primary'
                  }`}
                >
                  <Icon size={13} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Акцентный цвет */}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-text-primary">Акцентный цвет</h4>
              <p className="text-xs text-text-muted mt-0.5">Основной цвет интерфейса</p>
            </div>
            <div className="flex gap-2">
              {ACCENT_COLORS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setAccentColor(c.id)}
                  className={`w-7 h-7 rounded-full border-2 transition-all duration-200 ${
                    accentColor === c.id ? 'border-white scale-110' : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: c.color }}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          {/* Язык (пока только русский) */}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-text-primary">Язык</h4>
              <p className="text-xs text-text-muted mt-0.5">Только русский (English в разработке)</p>
            </div>
            <span className="text-xs font-semibold text-text-muted bg-white/[0.06] px-3 py-1.5 rounded-xl">Русский</span>
          </div>
        </div>
      </GlassPanel>

      {/* ═══ Загрузки ═══ */}
      <GlassPanel depth="z2" tint="soft" rounded="2xl" className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.10] flex items-center justify-center">
            <Download className="w-4 h-4 text-text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-text-primary">Загрузки</h2>
            <p className="text-xs text-text-muted">Настройки скачивания модов</p>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-text-primary">Параллельные загрузки</h4>
              <p className="text-xs text-text-muted mt-0.5">Сколько модов качать одновременно</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setParallelDownloads(Math.max(1, parallelDownloads - 1))}
                className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/[0.10] flex items-center justify-center text-text-muted hover:text-text-primary"
              >−</button>
              <span className="w-8 text-center text-sm font-bold text-text-primary">{parallelDownloads}</span>
              <button
                onClick={() => setParallelDownloads(Math.min(10, parallelDownloads + 1))}
                className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/[0.10] flex items-center justify-center text-text-muted hover:text-text-primary"
              >+</button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-text-primary">Лимит скорости</h4>
              <p className="text-xs text-text-muted mt-0.5">0 = без ограничений (МБ/с)</p>
            </div>
            <div className="flex items-center gap-2">
              {[0, 5, 10, 20, 50].map((v) => (
                <button
                  key={v}
                  onClick={() => setSpeedLimit(v)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                    speedLimit === v
                      ? 'bg-accent text-white border-accent'
                      : 'bg-white/[0.06] text-text-muted border-white/[0.10] hover:text-text-primary'
                  }`}
                >
                  {v === 0 ? '∞' : v}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-text-primary">Автообновление каталога</h4>
              <p className="text-xs text-text-muted mt-0.5">Проверять обновления при запуске</p>
            </div>
            <Toggle checked={autoUpdateCatalog} onChange={setAutoUpdateCatalog} />
          </div>
        </div>
      </GlassPanel>

      {/* ═══ Уведомления ═══ */}
      <GlassPanel depth="z2" tint="soft" rounded="2xl" className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.10] flex items-center justify-center">
            <Bell className="w-4 h-4 text-text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-text-primary">Уведомления</h2>
            <p className="text-xs text-text-muted">Управление всплывающими сообщениями</p>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-text-primary">Уведомления</h4>
              <p className="text-xs text-text-muted mt-0.5">Показывать тост-уведомления</p>
            </div>
            <Toggle checked={notificationsEnabled} onChange={setNotificationsEnabled} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-text-primary">Уведомления о скачиваниях</h4>
              <p className="text-xs text-text-muted mt-0.5">Оповещать о завершении загрузки</p>
            </div>
            <Toggle checked={downloadNotify} onChange={setDownloadNotify} />
          </div>
        </div>
      </GlassPanel>

      {/* ═══ Игра ═══ */}
      <GlassPanel depth="z2" tint="soft" rounded="2xl" className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.10] flex items-center justify-center">
            <Gamepad2 className="w-4 h-4 text-text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-text-primary">Игра</h2>
            <p className="text-xs text-text-muted">Путь к GTA и управление модами</p>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          {/* GTA Path with inline editing */}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-semibold text-text-primary">Папка GTA 5</h4>
              <p className="text-xs text-text-muted mt-0.5">Путь к GTA V (для автоустановки)</p>
              {showPathInput ? (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="text"
                    value={pathDraft}
                    onChange={(e) => setPathDraft(e.target.value)}
                    className="flex-1 bg-white/[0.06] border border-white/[0.10] rounded-lg px-3 py-1.5
                               text-xs text-text-primary outline-none focus:border-white/20"
                    autoFocus
                  />
                  <button onClick={handleSavePath}
                    className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold">
                    OK
                  </button>
                  <button onClick={() => setShowPathInput(false)}
                    className="px-3 py-1.5 rounded-lg bg-white/[0.06] text-text-muted text-xs">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <p className="text-xs text-text-primary font-semibold mt-1 truncate">{gtaPath}</p>
              )}
            </div>
            {!showPathInput && (
              <button
                onClick={async () => {
                  if (window.electronAPI) {
                    notifications.push('info', 'Поиск GTA 5...');
                    const res = await window.electronAPI.detectGtaPath();
                    if (res.path) {
                      setGtaPath(res.path);
                      setPathDraft(res.path);
                      notifications.push('success', `GTA 5 найдена: ${res.path}`);
                    } else {
                      notifications.push('error', 'GTA 5 не найдена. Укажите путь вручную.');
                    }
                  }
                }}
                className="btn-glow text-xs shrink-0"
              >
                <Search size={13} />
                АВТО
              </button>
            )}
            {!showPathInput && (
              <button
                onClick={() => { setPathDraft(gtaPath); setShowPathInput(true); }}
                className="btn-glow text-xs shrink-0"
              >
                <FolderOpen size={13} />
                ИЗМЕНИТЬ
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => setConfirm({
                title: 'Удалить все моды',
                message: 'Все установленные моды будут удалены. GTA 5 будет восстановлена до чистой версии.',
                confirmLabel: 'Удалить',
                danger: true,
                onConfirm: () => { setConfirm(null); handleDeleteAllMods(); },
              })}
              className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 flex items-center gap-3 hover:bg-white/[0.04] transition-colors"
            >
              <Trash2 className="w-4 h-4 text-status-error shrink-0" />
              <div className="text-left min-w-0">
                <h4 className="text-xs font-bold text-text-primary">Удалить все моды</h4>
                <p className="text-[10px] text-text-muted">Вернуть чистую GTA</p>
              </div>
            </button>
            <button
              onClick={() => setConfirm({
                title: 'Вернуть бекап',
                message: 'Будет восстановлен оригинальный файл update.rpf из бекапа.',
                confirmLabel: 'Восстановить',
                onConfirm: () => { setConfirm(null); handleRestoreBackup(); },
              })}
              className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 flex items-center gap-3 hover:bg-white/[0.04] transition-colors"
            >
              <RotateCcw className="w-4 h-4 text-accent shrink-0" />
              <div className="text-left min-w-0">
                <h4 className="text-xs font-bold text-text-primary">Вернуть бекап</h4>
                <p className="text-[10px] text-text-muted">Восстановить update.rpf</p>
              </div>
            </button>
          </div>
        </div>
      </GlassPanel>

      {/* ═══ Хранилище ═══ */}
      <GlassPanel depth="z2" tint="soft" rounded="2xl" className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.10] flex items-center justify-center">
            <Database className="w-4 h-4 text-text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-text-primary">Хранилище</h2>
            <p className="text-xs text-text-muted">Кеш и данные приложения</p>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-text-primary">Кешировать моды</h4>
              <p className="text-xs text-text-muted mt-0.5">Повторная установка будет мгновенной</p>
            </div>
            <Toggle checked={cacheEnabled} onChange={setCacheEnabled} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-text-primary">Очистить кеш</h4>
              <p className="text-xs text-text-muted mt-0.5">Размер: {cacheSize}</p>
            </div>
            <button
              onClick={() => setConfirm({
                title: 'Очистить кеш',
                message: 'Будут удалены все временные данные приложения. Это безопасно.',
                confirmLabel: 'Очистить',
                onConfirm: () => { setConfirm(null); handleClearCache(); },
              })}
              className="btn-glow text-xs"
            >
              ОЧИСТИТЬ
            </button>
          </div>
        </div>
      </GlassPanel>

      {/* ═══ Zapret ═══ */}
      <GlassPanel depth="z2" tint="soft" rounded="2xl" className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.10] flex items-center justify-center">
            <Shield className="w-4 h-4 text-text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-text-primary">Zapret — обход блокировок</h2>
            <p className="text-xs text-text-muted">DPI-обход для максимальной скорости из РФ</p>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <a href="https://github.com/bol-van/zapret" target="_blank" rel="noreferrer"
             className="text-xs font-semibold text-accent hover:underline flex items-center gap-1 w-fit">
            Скачать Zapret <ExternalLink className="w-3 h-3" />
          </a>
          <button
            onClick={() => notifications.push('info', 'Настройки Zapret применены. Запустите zapret.exe от администратора.')}
            className="btn-glow btn-glow--filled text-xs self-start"
          >
            <Zap className="w-4 h-4" />
            ПРИМЕНИТЬ К ZAPRET
          </button>
        </div>
      </GlassPanel>

      {/* ═══ Экспорт / Импорт ═══ */}
      <GlassPanel depth="z2" tint="soft" rounded="2xl" className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.10] flex items-center justify-center">
            <Download className="w-4 h-4 text-text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-text-primary">Резервное копирование</h2>
            <p className="text-xs text-text-muted">Экспорт и импорт настроек</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={handleExportSettings}
            className="flex-1 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 flex items-center gap-3 hover:bg-white/[0.04] transition-colors">
            <Upload className="w-4 h-4 text-accent shrink-0" />
            <div className="text-left min-w-0">
              <h4 className="text-xs font-bold text-text-primary">Экспорт</h4>
              <p className="text-[10px] text-text-muted">Сохранить в JSON</p>
            </div>
          </button>
          <button onClick={handleImportSettings}
            className="flex-1 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 flex items-center gap-3 hover:bg-white/[0.04] transition-colors">
            <Download className="w-4 h-4 text-accent shrink-0" />
            <div className="text-left min-w-0">
              <h4 className="text-xs font-bold text-text-primary">Импорт</h4>
              <p className="text-[10px] text-text-muted">Загрузить JSON</p>
            </div>
          </button>
        </div>
      </GlassPanel>

      {/* ═══ Сброс ═══ */}
      <GlassPanel depth="z2" tint="soft" rounded="2xl" className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.10] flex items-center justify-center">
            <RefreshCw className="w-4 h-4 text-text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-text-primary">Сброс настроек</h2>
            <p className="text-xs text-text-muted">Вернуть все настройки к значениям по умолчанию</p>
          </div>
        </div>
        <button
          onClick={() => setConfirm({
            title: 'Сбросить все настройки',
            message: 'Все настройки, путь к GTA, язык и тема будут сброшены. Приложение перезагрузится.',
            confirmLabel: 'Сбросить',
            danger: true,
            onConfirm: () => { setConfirm(null); resetAllSettings(); },
          })}
          className="rounded-2xl border border-status-error/30 bg-status-error/5 p-4 flex items-center gap-3
                     hover:bg-status-error/10 transition-colors w-full"
        >
          <RotateCcw className="w-4 h-4 text-status-error shrink-0" />
          <div className="text-left min-w-0">
            <h4 className="text-xs font-bold text-status-error">Сбросить все настройки</h4>
            <p className="text-[10px] text-text-muted">Настройки, путь GTA, язык — всё сбросится</p>
          </div>
        </button>
      </GlassPanel>

      {/* ═══ Помощь ═══ */}
      <GlassPanel depth="z2" tint="soft" rounded="2xl" className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.10] flex items-center justify-center">
            <HelpCircle className="w-4 h-4 text-text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-text-primary">Помощь</h2>
            <p className="text-xs text-text-muted">О приложении и поддержка</p>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
            <div className="flex items-center gap-3">
              <Info className="w-4 h-4 text-text-muted shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-text-primary">Версия</h4>
                <p className="text-[10px] text-text-muted">Miami Launcher {appVersion}</p>
              </div>
            </div>
            <button onClick={handleCheckUpdate} className="btn-glow text-xs">ОБНОВИТЬ</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={handleOpenDocs}
              className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3 flex items-center gap-2 hover:bg-white/[0.04] transition-colors">
              <FileText className="w-4 h-4 text-text-muted shrink-0" />
              <span className="text-xs font-semibold text-text-primary">Документы</span>
            </button>
            <button onClick={handleOpenLogs}
              className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3 flex items-center gap-2 hover:bg-white/[0.04] transition-colors">
              <ExternalLink className="w-4 h-4 text-text-muted shrink-0" />
              <span className="text-xs font-semibold text-text-primary">Логи</span>
            </button>
          </div>
          <div onClick={() => setShowSupport(true)}
               className="rounded-2xl border border-accent/30 bg-accent/5 p-4 flex items-center gap-3
                          cursor-pointer hover:bg-accent/10 transition-colors">
            <MessageCircle className="w-5 h-5 text-accent shrink-0" />
            <div>
              <h4 className="text-xs font-bold text-text-primary">Техподдержка</h4>
              <p className="text-[10px] text-text-muted">Telegram • Discord • Почта</p>
            </div>
          </div>
        </div>
      </GlassPanel>

      {/* ═══ Support Modal ═══ */}
      <AnimatePresence>
        {showSupport && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowSupport(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.97 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl border border-white/[0.12] bg-[#1a1a22] shadow-2xl p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-text-primary">Техподдержка</h3>
                <button onClick={() => setShowSupport(false)}><X className="w-4 h-4 text-text-muted" /></button>
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={() => window.open('https://t.me/miamigraphics_support', '_blank')}
                        className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#2aabee]/10 border border-[#2aabee]/20 hover:bg-[#2aabee]/20 transition-colors">
                  <MessageCircle className="w-4 h-4 text-[#2aabee]" />
                  <span className="text-xs font-semibold text-text-primary">Telegram</span>
                </button>
                <button onClick={() => window.open('https://discord.gg/miamigraphics', '_blank')}
                        className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#5865f2]/10 border border-[#5865f2]/20 hover:bg-[#5865f2]/20 transition-colors">
                  <MessageCircle className="w-4 h-4 text-[#5865f2]" />
                  <span className="text-xs font-semibold text-text-primary">Discord</span>
                </button>
                <button onClick={() => window.open('mailto:support@miamigraphics.ru', '_blank')}
                        className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#ffb74d]/10 border border-[#ffb74d]/20 hover:bg-[#ffb74d]/20 transition-colors">
                  <MessageCircle className="w-4 h-4 text-[#ffb74d]" />
                  <span className="text-xs font-semibold text-text-primary">Почта</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ Confirm Dialog ═══ */}
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title || ''}
        message={confirm?.message || ''}
        confirmLabel={confirm?.confirmLabel}
        danger={confirm?.danger}
        onConfirm={() => confirm?.onConfirm()}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

// ── Toggle switch ────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${
        checked ? 'bg-accent' : 'bg-track'
      }`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-z1 transition-transform duration-200 ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}
