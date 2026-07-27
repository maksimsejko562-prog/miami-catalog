import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Download, Check, Loader2, AlertCircle, Package, Play, ChevronLeft, ChevronRight, Star, ExternalLink } from 'lucide-react';
import type { CatalogMod } from '../types';
import { downloadManager } from '../lib/downloadManager';
import { notifications } from '../lib/notifications';
import { useUIStore } from '../store/ui';
import {
  getDownloadDir,
  pickDownloadDir,
  isFsAccessSupported,
} from '../lib/storage';
import { installMod, pickModsDir, getModsDir } from '../lib/installer';

interface Props {
  mod: CatalogMod;
  onBack: () => void;
}

/** Проверяет, является ли URL прямой ссылкой на файл (а не веб-страницей). */
function isDirectFileUrl(url: string): boolean {
  try {
    const u = new URL(url);
    // Считаем прямой ссылкой, если URL ведёт на известные CDN/хостинги файлов
    // или заканчивается на расширение файла
    const directDomains = [
      'github.com', 'raw.githubusercontent.com',
      'githubusercontent.com',
      'objects.githubusercontent.com',
      'media.githubusercontent.com',
      'cloudflare.com', 'r2.dev',
      'amazonaws.com', 'wasabisys.com',
    ];
    if (directDomains.some((d) => u.hostname.includes(d))) return true;

    const path = u.pathname.split('/').pop() || '';
    const fileExtMatch = path.match(/\.(zip|rar|7z|rpf|oiv|dat|ytd|ydr|dll|exe|msi|pk3|pk4|wad)$/i);
    if (fileExtMatch) return true;

    // Всё остальное (reduxlab.ru и т.д.) — веб-страница
    return false;
  } catch {
    return false;
  }
}

function fileNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    return last || `mod-${Date.now()}`;
  } catch {
    return `mod-${Date.now()}`;
  }
}

export default function ModDetailScreen({ mod, onBack }: Props) {
  const [, setTick] = useState(0);
  const [extractProgress, setExtractProgress] = useState<number | null>(null);
  const [installed, setInstalled] = useState(() => useUIStore.getState().isInstalled(String(mod.id)));
  const [errored, setErrored] = useState(false);
  const installingRef = useRef(false);
  const [currentImage, setCurrentImage] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // Галерея: сначала главная обложка, потом галерея
  const gallery = [
    ...(mod.image_url ? [mod.image_url] : []),
    ...(mod.screenshots || []).filter(s => s !== mod.image_url),
  ];

  useEffect(() => {
    const unsubscribe = downloadManager.subscribe(() => setTick((t) => t + 1));
    return unsubscribe;
  }, []);

  const jobId = `mod-${mod.id}`;
  const job = downloadManager.getJob(jobId);
  const downloadProgress = job?.totalProgress ?? 0;
  const isDownloading = job?.status === 'downloading';
  const isExtracting = extractProgress !== null;

  useEffect(() => {
    if (installingRef.current) return;
    if (job?.isDownloaded && !installed && !errored) {
      installingRef.current = true;
      void runInstall();
    }
  }, [job?.isDownloaded, installed, errored]);

  async function runInstall() {
    const fileName = fileNameFromUrl(mod.download_url);
    const isElectron = !!(window as unknown as { electronAPI?: unknown }).electronAPI;
    try {
      // В браузере — запрашиваем папку модов через FSA
      if (!isElectron) {
        let modsDir = await getModsDir();
        if (!modsDir) {
          notifications.push('info', 'Выберите папку модов GTA для установки.');
          modsDir = await pickModsDir();
          if (!modsDir) {
            notifications.push('warning', 'Установка отменена: папка модов не выбрана.');
            setInstalled(true);
            installingRef.current = false;
            return;
          }
        }
      }
      // В Electron папка модов определяется автоматически
      setExtractProgress(0);
      await installMod(fileName, mod.category, mod.id, selectedVariant, (p) => {
        setExtractProgress(p.total > 0 ? Math.round((p.done / p.total) * 100) : 0);
      });
      setExtractProgress(null);
      setInstalled(true);
      useUIStore.getState().addInstalled(String(mod.id));
      notifications.push('success', `Мод установлен: ${mod.name}`, 6000);
    } catch (err) {
      setExtractProgress(null);
      setErrored(true);
      const msg = err instanceof Error ? err.message : 'неизвестная ошибка';
      notifications.push('error', `Не удалось установить ${mod.name}: ${msg}`, 8000);
    } finally {
      installingRef.current = false;
    }
  }

  async function handleInstall() {
    // Если есть варианты (цвета), но ещё не выбраны — не начинаем установку
    const hasGroups = mod.variantGroups && mod.variantGroups.length > 0;
    const hasFlatVariants = mod.variants && mod.variants.length > 0;
    if (hasGroups || hasFlatVariants) {
      if (!selectedVariant) {
        notifications.push('info', 'Выберите вариант мода перед установкой.', 4000);
        return;
      }
    }

    // Если URL ведёт на веб-страницу — открываем в браузере
    if (!isDirectFileUrl(mod.download_url)) {
      window.open(mod.download_url, '_blank');
      notifications.push('info', `Страница мода открыта в браузере. Скачайте файл вручную.`, 6000);
      return;
    }

    setErrored(false);
    setInstalled(false);

    const isElectron = !!(window as unknown as { electronAPI?: unknown }).electronAPI;

    // FSA-пикер папки загрузок нужен только в браузере
    if (!isElectron && isFsAccessSupported()) {
      const existing = await getDownloadDir();
      if (!existing) {
        try { await pickDownloadDir(); }
        catch (err) {
          if ((err as DOMException)?.name !== 'AbortError') {
            notifications.push('error', 'Не удалось выбрать папку для загрузок.');
          }
          return;
        }
      }
    }

    const fileName = fileNameFromUrl(mod.download_url);
    downloadManager.addJob(mod.id, mod.name, [
      { name: fileName, url: mod.download_url, size: '?' },
    ]);
  }

  const isDirectUrl = isDirectFileUrl(mod.download_url);

  let buttonText = isDirectUrl ? 'Установить' : 'Открыть на сайте';
  let buttonIcon = isDirectUrl ? <Download className="w-4 h-4" /> : <ExternalLink className="w-4 h-4" />;
  let disabled = false;
  if (isDownloading) { buttonText = `Скачивается… ${downloadProgress}%`; buttonIcon = <Loader2 className="w-4 h-4 animate-spin" />; disabled = true; }
  else if (isExtracting) { buttonText = `Распаковка… ${extractProgress}%`; buttonIcon = <Loader2 className="w-4 h-4 animate-spin" />; disabled = true; }
  else if (installed) { buttonText = 'Установлено'; buttonIcon = <Check className="w-4 h-4" />; disabled = true; }
  else if (errored) { buttonText = 'Повторить'; buttonIcon = <AlertCircle className="w-4 h-4" />; }

  const showProgress = isDownloading || isExtracting;
  const progressValue = isExtracting ? extractProgress ?? 0 : downloadProgress;

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="h-full flex flex-col overflow-hidden"
    >
      {/* Верхняя панель с кнопкой "Назад" */}
      <div className="shrink-0 flex items-center gap-4 px-8 pt-5 pb-4">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.10]
                     flex items-center justify-center text-white/70
                     hover:bg-white/[0.10] hover:text-white transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-white truncate">{mod.name}</h1>
          {mod.author && (
            <p className="text-xs text-white/50 mt-0.5">Автор: {mod.author}</p>
          )}
        </div>
      </div>

      {/* Основной контент — два столбца */}
      <div className="flex-1 min-h-0 flex gap-6 px-8 pb-6 overflow-hidden">

        {/* Левая часть — галерея + описание */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {/* Галерея картинок */}
          <div className="relative flex-[3] min-h-0 rounded-2xl overflow-hidden bg-[#0e0e14] border border-white/[0.06]">
            {gallery.length > 0 ? (
              <>
                {/* Основная картинка */}
                <div className="w-full h-full flex items-center justify-center p-4">
                  <img
                    src={gallery[currentImage]}
                    alt={`${mod.name} ${currentImage + 1}`}
                    className="max-w-full max-h-full object-contain rounded-xl"
                  />
                </div>

                {/* Счётчик */}
                {gallery.length > 1 && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full
                                 bg-black/60 backdrop-blur-md text-[11px] font-medium text-white/80">
                    {currentImage + 1} / {gallery.length}
                  </div>
                )}

                {/* Стрелки навигации */}
                {gallery.length > 1 && (
                  <>
                    <button
                      onClick={() => setCurrentImage((prev) => (prev === 0 ? gallery.length - 1 : prev - 1))}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full
                                 bg-black/50 backdrop-blur-md border border-white/10
                                 flex items-center justify-center text-white/70
                                 hover:bg-black/70 hover:text-white transition-all"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setCurrentImage((prev) => (prev === gallery.length - 1 ? 0 : prev + 1))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full
                                 bg-black/50 backdrop-blur-md border border-white/10
                                 flex items-center justify-center text-white/70
                                 hover:bg-black/70 hover:text-white transition-all"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </>
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="w-16 h-16 text-white/10" />
              </div>
            )}
          </div>

          {/* Миниатюры */}
          {gallery.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1 shrink-0">
              {gallery.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentImage(i)}
                  className={`shrink-0 w-16 h-12 rounded-lg overflow-hidden border-2 transition-all
                    ${currentImage === i
                      ? 'border-white/50 opacity-100'
                      : 'border-transparent opacity-50 hover:opacity-75'
                    }`}
                >
                  <img src={img} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {/* Описание */}
          <div className="shrink-0 rounded-2xl bg-white/[0.03] border border-white/[0.06] p-5">
            <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-2">Описание</h3>
            <p className="text-sm text-white/70 leading-relaxed">
              {mod.description || 'Описание отсутствует.'}
            </p>
          </div>
        </div>

        {/* Правая часть — информация и кнопки */}
        <div className="w-72 shrink-0 flex flex-col gap-4">

          {/* Размер */}
          {mod.file_size_label && (
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 flex items-center justify-between">
              <span className="text-xs font-bold text-white/40 uppercase tracking-widest">Размер</span>
              <span className="text-sm font-bold text-white">{mod.file_size_label}</span>
            </div>
          )}

          {/* Варианты: двухуровневые (группы → цвета) */}
          {mod.variantGroups && mod.variantGroups.length > 0 && (
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4">
              <span className="text-xs font-bold text-white/40 uppercase tracking-widest mb-3 block">Режим</span>
              <div className="flex flex-wrap gap-2 mb-3">
                {mod.variantGroups.map((g) => {
                  const isActive = selectedGroupId === g.id;
                  return (
                    <button
                      key={g.id}
                      onClick={() => {
                        setSelectedGroupId(g.id);
                        setSelectedVariant(null); // сброс цвета при смене режима
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border
                        ${isActive
                          ? 'bg-accent text-white border-accent shadow-[0_0_12px_rgba(255,8,68,0.4)]'
                          : 'bg-white/[0.06] text-white/70 border-white/[0.10] hover:bg-white/[0.12] hover:text-white'
                        }`}
                    >
                      {g.color && (
                        <span className="inline-block w-3 h-3 rounded-full mr-1.5 align-middle"
                          style={{ backgroundColor: g.color }}
                        />
                      )}
                      {g.label}
                    </button>
                  );
                })}
              </div>

              {selectedGroupId && (
                <>
                  <span className="text-xs font-bold text-white/40 uppercase tracking-widest mb-3 block">Цвет</span>
                  <div className="flex flex-wrap gap-2">
                    {mod.variantGroups
                      .find((g) => g.id === selectedGroupId)
                      ?.variants.map((v) => {
                        const active = selectedVariant === v.folder;
                        return (
                          <button
                            key={v.folder}
                            onClick={() => setSelectedVariant(v.folder)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border
                              ${active
                                ? 'bg-accent text-white border-accent shadow-[0_0_12px_rgba(255,8,68,0.4)]'
                                : 'bg-white/[0.06] text-white/70 border-white/[0.10] hover:bg-white/[0.12] hover:text-white'
                              }`}
                          >
                            {v.color && (
                              <span className="inline-block w-3 h-3 rounded-full mr-1.5 align-middle"
                                style={{ backgroundColor: v.color }}
                              />
                            )}
                            {v.name}
                          </button>
                        );
                      })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Варианты: плоский список (цвета) */}
          {mod.variants && mod.variants.length > 0 && !mod.variantGroups && (
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4">
              <span className="text-xs font-bold text-white/40 uppercase tracking-widest mb-3 block">Выберите вариант</span>
              <div className="flex flex-wrap gap-2">
                {mod.variants.map((v) => {
                  const active = selectedVariant === v.folder;
                  return (
                    <button
                      key={v.folder}
                      onClick={() => setSelectedVariant(v.folder)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border
                        ${active
                          ? 'bg-accent text-white border-accent shadow-[0_0_12px_rgba(255,8,68,0.4)]'
                          : 'bg-white/[0.06] text-white/70 border-white/[0.10] hover:bg-white/[0.12] hover:text-white'
                        }`}
                    >
                      {v.color && (
                        <span className="inline-block w-3 h-3 rounded-full mr-1.5 align-middle"
                          style={{ backgroundColor: v.color }}
                        />
                      )}
                      {v.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Кнопка установки / открыть на сайте */}
          <button
            type="button"
            onClick={handleInstall}
            disabled={disabled}
            className={`w-full h-12 rounded-xl text-sm font-bold transition-all duration-200 flex items-center justify-center gap-2
              ${installed
                ? 'bg-white/10 text-white/60 border border-white/10 cursor-default'
                : errored
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
                  : !isDirectUrl
                    ? 'bg-gradient-to-r from-[#6366f1] to-[#818cf8] text-white shadow-[0_4px_20px_rgba(99,102,241,0.4)] hover:shadow-[0_6px_30px_rgba(99,102,241,0.6)] hover:scale-[1.02]'
                    : 'bg-gradient-to-r from-[#ff0844] to-[#ff4d7a] text-white shadow-[0_4px_20px_rgba(255,8,68,0.4)] hover:shadow-[0_6px_30px_rgba(255,8,68,0.6)] hover:scale-[1.02]'
            }`}
          >
            {buttonIcon}
            {buttonText}
          </button>

          {/* Кнопка YouTube обзора */}
          {mod.youtube_url && (
            <a
              href={mod.youtube_url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full h-10 rounded-xl text-xs font-semibold transition-all duration-200
                         flex items-center justify-center gap-2
                         bg-red-600/20 text-red-400 border border-red-600/30
                         hover:bg-red-600/30 hover:text-red-300"
            >
              <Play className="w-4 h-4 fill-current" />
              Смотреть обзор
            </a>
          )}

          {/* Прогресс */}
          {showProgress && (
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-white/50">{isExtracting ? 'Распаковка…' : 'Загрузка…'}</span>
                <span className="text-xs font-bold text-white">{progressValue}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-[#ff0844]"
                  initial={{ width: '0%' }}
                  animate={{ width: `${progressValue}%` }}
                  transition={{ duration: 0.2 }}
                />
              </div>
            </div>
          )}

          {/* Статистика */}
          <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4">
            <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-3">Статистика</h3>
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/50 flex items-center gap-2">
                  <Download className="w-3.5 h-3.5" /> Скачиваний
                </span>
                <span className="text-xs font-semibold text-white">{(mod.downloads || 0).toLocaleString('ru-RU')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/50 flex items-center gap-2">
                  <Star className="w-3.5 h-3.5" /> Категория
                </span>
                <span className="text-xs font-semibold text-white capitalize">
                  {(
                    {
                      redux: 'Редуксы',
                      guns: 'Оружие',
                      armor: 'Броня',
                      sounds: 'Звуки',
                      minimaps: 'Миникарты',
                      reticles: 'Прицелы',
                      bigmap: 'Большая карта',
                      double: 'Другое',
                      clothes: 'Одежда',
                      maps: 'Карты',
                    } satisfies Record<string, string>
                  )[mod.category] || mod.category}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
