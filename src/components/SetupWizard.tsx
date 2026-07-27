import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_DEPTH } from '../design';
import ParticlesBackground from './ParticlesBackground';

/* ──────────────────────────────────────────────────────────────────────────
 * Типы
 * ──────────────────────────────────────────────────────────────────────── */
type Step = 'splash' | 'language' | 'path' | 'done';

interface Settings {
  language: 'ru' | 'en';
  gtaPath: string;
}

const STORAGE_KEY = 'miami-launcher-settings';

function loadSettings(): Settings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.language && parsed.gtaPath) return parsed;
    return null;
  } catch {
    return null;
  }
}

function saveSettings(s: Settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

/* ──────────────────────────────────────────────────────────────────────────
 * Компонент
 * ──────────────────────────────────────────────────────────────────────── */
export default function SetupWizard({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const [step, setStep] = useState<Step>('splash');
  const [lang, setLang] = useState<'ru' | 'en'>('ru');
  const [gtaPath, setGtaPath] = useState('');
  const [showMain, setShowMain] = useState(false);
  const [detecting, setDetecting] = useState(false);

  // Автоопределение пути GTA 5 при входе на шаг path
  useEffect(() => {
    if (step !== 'path') return;
    if (!window.electronAPI) return;
    if (gtaPath) return; // уже есть
    setDetecting(true);
    window.electronAPI.detectGtaPath().then((res) => {
      if (res.path) {
        setGtaPath(res.path);
      }
    }).finally(() => {
      setDetecting(false);
    });
  }, [step, gtaPath]);

  const t = (ru: string, en: string) => (lang === 'ru' ? ru : en);

  /* Шаг 1 — сплэш на 1 секунду */
  useEffect(() => {
    if (step !== 'splash') return;
    const timer = setTimeout(() => setStep('language'), 1000);
    return () => clearTimeout(timer);
  }, [step]);

  /* Шаг 4 — завершение */
  const handleFinish = () => {
    saveSettings({ language: lang, gtaPath });
    setShowMain(true);
    setTimeout(onComplete, 400);
  };

  /* Если настройки уже есть — сразу показываем главную */
  useEffect(() => {
    if (loadSettings()) {
      setShowMain(true);
      onComplete();
    }
  }, [onComplete]);

  if (showMain) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a10]">
      {/* Ambient background matching main app */}
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 18% 12%, rgba(255,255,255,0.06) 0%, transparent 45%),' +
            'radial-gradient(ellipse at 82% 88%, rgba(255,255,255,0.04) 0%, transparent 50%),' +
            'linear-gradient(180deg, #14141a 0%, #0e0e14 60%, #0a0a10 100%)',
        }}
      />
      <ParticlesBackground />
      <AnimatePresence mode="wait">
        {step === 'splash' && (
          <motion.div
            key="splash"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE_DEPTH }}
            className="flex flex-col items-center gap-4 px-8 py-10 rounded-3xl bg-glass-strong backdrop-blur-xl border border-white/[0.08] shadow-z2"
          >
            <div className="w-12 h-12 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
            <p className="text-white/70 text-lg font-medium">
              {t('Проверка компонентов...', 'Checking components...')}
            </p>
          </motion.div>
        )}

        {step === 'language' && (
          <motion.div
            key="language"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.35, ease: EASE_DEPTH }}
            className="flex flex-col items-center gap-6 w-full max-w-sm px-6 py-8 rounded-3xl bg-glass-strong backdrop-blur-xl border border-white/[0.08] shadow-z2"
          >
            <h2 className="text-white text-xl font-semibold">
              {t('Выберите язык', 'Select language')}
            </h2>
            <div className="flex flex-col gap-3 w-full">
              {(['ru', 'en'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  className={
                    'w-full py-3 px-5 rounded-xl text-left text-base font-medium transition-all duration-200 ' +
                    (lang === l
                      ? 'bg-white text-black shadow-lg'
                      : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white')
                  }
                >
                  {l === 'ru' ? 'Русский' : 'English'}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setStep('path')}
              className="btn-glow btn-glow--filled w-full justify-center mt-2"
            >
              {t('Далее', 'Next')}
            </button>
          </motion.div>
        )}

        {step === 'path' && (
          <motion.div
            key="path"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.35, ease: EASE_DEPTH }}
            className="flex flex-col items-center gap-6 w-full max-w-sm px-6 py-8 rounded-3xl bg-glass-strong backdrop-blur-xl border border-white/[0.08] shadow-z2"
          >
            <h2 className="text-white text-xl font-semibold text-center">
              {t('Укажите путь к GTA 5', 'Select GTA 5 folder')}
            </h2>
            <div className="flex gap-2 w-full">
              <input
                type="text"
                readOnly
                value={gtaPath}
                placeholder={detecting ? t('Поиск GTA 5...', 'Detecting GTA 5...') : t('Путь не выбран...', 'No folder selected...')}
                className="flex-1 h-11 px-4 rounded-xl bg-white/10 text-white/80 text-sm
                           border border-white/10 outline-none placeholder:text-white/30"
              />
              <label className="shrink-0 h-11 px-4 rounded-xl bg-white/15 text-white/80
                                flex items-center justify-center cursor-pointer
                                hover:bg-white/25 transition-colors text-sm font-medium">
                {t('Обзор...', 'Browse...')}
                <input
                  type="file"
                  // @ts-expect-error webkitdirectory is a non-standard attribute
                  webkitdirectory=""
                  directory=""
                  className="hidden"
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) {
                      // Берём путь из первого файла, обрезаем до папки
                      const fullPath = files[0].webkitRelativePath || files[0].name;
                      const parts = fullPath.split('/');
                      // Если есть хотя бы один уровень вложенности — берём корневую папку
                      const root = parts.length > 1
                        ? fullPath.slice(0, -parts[parts.length - 1].length - 1)
                        : fullPath;
                      // Пытаемся получить полный путь через File.path (нестандартное)
                      const path = (files[0] as any).path
                        ? (files[0] as any).path.slice(0, -(files[0].name.length + 1))
                        : root;
                      setGtaPath(path || root);
                    }
                  }}
                />
              </label>
            </div>
            <p className="text-white/40 text-xs text-center">
              {t(
                'Выберите папку, в которой находится GTA5.exe',
                'Select the folder containing GTA5.exe',
              )}
            </p>
            <button
              type="button"
              disabled={!gtaPath}
              onClick={handleFinish}
              className={
                'btn-glow w-full justify-center mt-2 ' +
                (gtaPath ? 'btn-glow--filled' : 'opacity-40 cursor-not-allowed')
              }
            >
              {t('Готово', 'Finish')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}