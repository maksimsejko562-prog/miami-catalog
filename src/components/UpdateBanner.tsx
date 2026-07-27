import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, RefreshCw, Loader2, CheckCircle2, AlertTriangle, X, Sparkles } from 'lucide-react';

type UpdateState =
  | { type: 'idle' }
  | { type: 'checking' }
  | { type: 'available'; version: string; url: string; releaseDate?: string }
  | { type: 'not-available' }
  | { type: 'error'; message: string };

export default function UpdateBanner() {
  const [state, setState] = useState<UpdateState>({ type: 'idle' });
  const [progress, setProgress] = useState<number | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // При монтировании тихо проверяем (только в Electron)
  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.checkForUpdates().then((result) => {
      if (result.status === 'available') {
        setState({
          type: 'available',
          version: result.version,
          url: result.url,
          releaseDate: result.releaseDate,
        });
      }
    });
  }, []);

  const handleCheck = useCallback(async () => {
    if (!window.electronAPI) return;
    setState({ type: 'checking' });
    const result = await window.electronAPI.checkForUpdates();
    if (result.status === 'available') {
      setState({
        type: 'available',
        version: result.version,
        url: result.url,
        releaseDate: result.releaseDate,
      });
    } else if (result.status === 'not-available') {
      setState({ type: 'not-available' });
      dismissTimer.current = setTimeout(() => setState({ type: 'idle' }), 3000);
    } else {
      setState({ type: 'error', message: result.message });
      dismissTimer.current = setTimeout(() => setState({ type: 'idle' }), 10000);
    }
  }, []);

  const handleDownload = useCallback(async () => {
    if (state.type !== 'available') return;
    if (!window.electronAPI) return;
    setProgress(0);
    try {
      await window.electronAPI.downloadAndInstallUpdate(state.url);
      // main.cjs сам запустит установщик и закроет приложение
      setState({ type: 'idle' });
    } catch (err: any) {
      console.error('Ошибка загрузки обновления:', err);
      setProgress(null);
      setState({ type: 'error', message: err.message || 'Ошибка загрузки' });
    }
  }, [state]);

  const handleDismiss = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    setState({ type: 'idle' });
  }, []);

  // ─── Рисуем большой модал для «available», баннер для остального ──

  if (state.type === 'available') {
    return (
      <AnimatePresence>
        {/* Затемнение фона */}
        <motion.div
          key="update-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm"
          onClick={handleDismiss}
        />
        {/* Модальное окно */}
        <motion.div
          key="update-modal"
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none"
        >
          <div className="pointer-events-auto w-full max-w-md mx-4">
            <div className="relative rounded-3xl overflow-hidden
                            bg-[#1a1a28] border border-white/[0.10]
                            shadow-2xl backdrop-blur-2xl
                            p-0"
            >
              {/* Верхняя декоративная полоска */}
              <div className="h-1.5 bg-gradient-to-r from-accent via-purple-500 to-accent" />

              {/* Кнопка закрытия */}
              <button
                onClick={handleDismiss}
                className="absolute top-4 right-4 w-8 h-8 rounded-xl bg-white/[0.06] border border-white/[0.10]
                           flex items-center justify-center text-text-muted hover:text-text-primary
                           hover:bg-white/[0.10] transition-colors z-10"
              >
                <X size={15} />
              </button>

              {/* Контент */}
              <div className="px-8 pt-8 pb-7 flex flex-col items-center text-center gap-5">
                {/* Иконка */}
                <div className="w-16 h-16 rounded-2xl bg-accent/15 border border-accent/25
                                flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-accent" />
                </div>

                {/* Текст */}
                <div>
                  <h2 className="text-xl font-bold text-text-primary">Доступно обновление!</h2>
                  <p className="text-sm text-text-muted mt-1.5">
                    Версия <span className="font-semibold text-accent">{state.version}</span> готова к установке
                  </p>
                  {state.releaseDate && (
                    <p className="text-[11px] text-text-muted mt-2">
                      Опубликовано: {state.releaseDate.slice(0, 10)}
                    </p>
                  )}
                </div>

                {/* Описание обновления */}
                <div className="w-full rounded-2xl bg-white/[0.04] border border-white/[0.06] p-4">
                  <p className="text-xs text-text-secondary leading-relaxed">
                    Новая версия содержит исправления ошибок, новые моды и улучшения производительности.
                    Рекомендуем установить последнюю версию для лучшей работы.
                  </p>
                </div>

                {/* Кнопки */}
                <div className="flex items-center gap-3 w-full">
                  <button
                    onClick={handleDismiss}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.10]
                               text-xs font-semibold text-text-secondary hover:text-text-primary
                               hover:bg-white/[0.10] transition-colors"
                  >
                    НАПОМНИТЬ ПОЗЖЕ
                  </button>
                  <button
                    onClick={handleDownload}
                    disabled={progress !== null}
                    className={'flex-1 px-4 py-2.5 rounded-xl bg-accent text-white '
                               + 'text-xs font-bold hover:brightness-110 transition-all '
                               + 'flex items-center justify-center gap-2 '
                               + (progress !== null ? 'opacity-60' : '')}
                  >
                    {progress !== null ? (
                      <><Loader2 size={14} className="animate-spin" /> УСТАНАВЛИВАЮ…</>
                    ) : (
                      <><Download size={14} /> СКАЧАТЬ</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // ─── Баннер для остальных состояний ────────────────────────────────

  const showBanner =
    state.type === 'checking' ||
    state.type === 'not-available' ||
    state.type === 'error';

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          key="update-banner"
          initial={{ opacity: 0, y: -40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -40 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="fixed top-0 left-0 right-0 z-[9999] pointer-events-auto"
        >
          <div className="mx-auto max-w-2xl mt-2 px-4">
            <div className="bg-[#1a1a24] border border-white/[0.10] rounded-2xl shadow-2xl backdrop-blur-xl px-5 py-3 flex items-center gap-3">
              <button onClick={handleDismiss} className="shrink-0 text-text-muted hover:text-text-primary transition-colors">
                <X size={14} />
              </button>

              <div className="shrink-0">
                {state.type === 'checking' && (
                  <Loader2 size={18} className="text-accent animate-spin" />
                )}
                {state.type === 'not-available' && (
                  <CheckCircle2 size={18} className="text-status-success" />
                )}
                {state.type === 'error' && (
                  <AlertTriangle size={18} className="text-status-warning" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                {state.type === 'checking' && (
                  <p className="text-sm text-text-secondary">Проверка обновлений...</p>
                )}
                {state.type === 'not-available' && (
                  <p className="text-sm text-text-secondary">У вас актуальная версия</p>
                )}
                {state.type === 'error' && (
                  <p className="text-xs text-status-warning">{state.message}</p>
                )}
              </div>

              <div className="shrink-0 flex items-center gap-2">
                {state.type === 'error' && (
                  <button onClick={handleCheck} className="btn-glow text-xs">
                    <RefreshCw size={13} />
                    ПОВТОРИТЬ
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
