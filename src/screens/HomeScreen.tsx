import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight, Download, Sparkles, ChevronLeft, ChevronRight,
  AlertCircle, RefreshCw, Package, ArrowUp,
  type LucideIcon,
} from 'lucide-react';
import { useUIStore } from '../store/ui';
import { useNavStore } from '../data/navigation';
import { EASE_DEPTH } from '../design';
import { loadCatalog, getCategories, filterByCategory } from '../lib/catalogLoader';
import Sidebar from '../components/Sidebar';
import CatalogCard from '../components/CatalogCard';
import {
  Layers, Crosshair, Shield, Volume2, Map as MapIcon, Target, MapPin,
  Car, Users, Trees, Cloud, Sparkles as SparklesIcon, Layout, Code, Gem,
} from 'lucide-react';
import type { CatalogData, CatalogMod } from '../types';

const ICON_MAP: Record<string, LucideIcon> = {
  layers: Layers, crosshair: Crosshair, shield: Shield, volume2: Volume2,
  map: MapIcon, target: Target, mapPin: MapPin, car: Car, users: Users,
  trees: Trees, cloud: Cloud, sparkles: SparklesIcon, layout: Layout,
  code: Code, gem: Gem,
};

function iconFor(name?: string): LucideIcon | undefined {
  return name ? ICON_MAP[name] : undefined;
}

const stagger = (i: number, base = 0.08, step = 0.05) => base + i * step;

function formatDownloads(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace('.0', '') + 'K';
  return String(n);
}

export default function HomeScreen({ onSelectMod }: { onSelectMod?: (mod: CatalogMod) => void }) {
  const setScreen = useUIStore((s) => s.setScreen);
  const navigate = useNavStore((s) => s.navigate);

  const [catalog, setCatalog] = useState<CatalogData>({ mods: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBackTop, setShowBackTop] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadCatalog();
      setCatalog(data);
    } catch (e) {
      console.error('[Home] catalog load failed:', e);
      setError(e instanceof Error ? e.message : 'Неизвестная ошибка');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await load();
      if (!mounted) return;
    })();
    return () => { mounted = false; };
  }, [load]);

  // Scroll listener for back-to-top
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setShowBackTop(el.scrollTop > 400);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const featured = useMemo(() => {
    if (catalog.mods.length === 0) return null;
    const sorted = [...catalog.mods].sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0));
    return sorted[0];
  }, [catalog.mods]);

  const rows = useMemo(() => {
    const cats = getCategories(catalog);
    return cats
      .map((cat) => ({
        ...cat,
        mods: filterByCategory(catalog.mods, cat.id).slice(0, 12),
      }))
      .filter((r) => r.mods.length > 0);
  }, [catalog]);

  const totalDownloads = useMemo(
    () => catalog.mods.reduce((sum, m) => sum + (m.downloads ?? 0), 0),
    [catalog.mods],
  );

  const goToMod = (mod: CatalogMod) => {
    if (onSelectMod) onSelectMod(mod);
  };

  const goToCatalog = () => {
    setScreen('modifications');
    navigate('modifications');
  };

  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="h-full flex">
      <Sidebar />
      <div
        ref={scrollRef}
        className="flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden px-6 py-4"
      >
        <div className="flex flex-col gap-5">

          {/* ── Error state ── */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center gap-4 py-20"
            >
              <div className="w-14 h-14 rounded-2xl bg-status-error/10 border border-status-error/20
                              flex items-center justify-center">
                <AlertCircle size={28} className="text-status-error" />
              </div>
              <div className="text-center max-w-sm">
                <h3 className="text-sm font-bold text-white mb-1">Ошибка загрузки</h3>
                <p className="text-xs text-text-muted leading-relaxed">{error}</p>
              </div>
              <button
                onClick={load}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl
                           bg-white/[0.1] border border-white/[0.15] text-xs font-semibold text-white
                           hover:bg-white/[0.18] transition-all duration-300"
              >
                <RefreshCw size={14} />
                Повторить
              </button>
            </motion.div>
          )}

          {/* ── Empty state ── */}
          {!loading && !error && catalog.mods.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center gap-4 py-20"
            >
              <div className="w-14 h-14 rounded-2xl bg-white/[0.06] border border-white/[0.08]
                              flex items-center justify-center">
                <Package size={28} className="text-text-muted" />
              </div>
              <div className="text-center max-w-sm">
                <h3 className="text-sm font-bold text-white mb-1">Каталог пуст</h3>
                <p className="text-xs text-text-muted leading-relaxed">
                  В каталоге пока нет модификаций. Попробуйте обновить позже.
                </p>
              </div>
              <button
                onClick={load}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl
                           bg-white/[0.1] border border-white/[0.15] text-xs font-semibold text-white
                           hover:bg-white/[0.18] transition-all duration-300"
              >
                <RefreshCw size={14} />
                Обновить
              </button>
            </motion.div>
          )}

          {/* ── Stats bar ── */}
          {!loading && !error && catalog.mods.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE_DEPTH }}
              className="flex items-center gap-5 px-1"
            >
              <div className="flex items-center gap-2">
                <Package size={13} className="text-text-muted" />
                <span className="text-[11px] text-text-muted font-medium">
                  {catalog.mods.length} модов
                </span>
              </div>
              {totalDownloads > 0 && (
                <div className="flex items-center gap-2">
                  <Download size={13} className="text-text-muted" />
                  <span className="text-[11px] text-text-muted font-medium">
                    {formatDownloads(totalDownloads)} скачиваний
                  </span>
                </div>
              )}
              <div className="flex-1" />
              <span className="text-[10px] text-text-muted/50">
                {rows.length} категорий
              </span>
            </motion.div>
          )}

          {/* ── Featured Banner ── */}
          {!loading && !error && featured && (
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE_DEPTH }}
            >
              <FeaturedBanner mod={featured} onExplore={goToCatalog} onModClick={goToMod} />
            </motion.section>
          )}

          {/* ── Category Rows ── */}
          {loading ? (
            <div className="flex flex-col gap-5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex flex-col gap-3">
                  <div className="h-5 w-32 rounded-lg bg-white/[0.06] lux-shimmer" />
                  <div className="flex gap-4 overflow-hidden">
                    {[1, 2, 3, 4, 5].map((j) => (
                      <div key={j} className="shrink-0 w-[200px] h-[260px] rounded-2xl bg-white/[0.04] lux-shimmer" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            !error && rows.map((row, rowIdx) => (
              <motion.section
                key={row.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: EASE_DEPTH, delay: stagger(rowIdx) }}
              >
                <CategoryRow
                  label={row.label}
                  icon={row.icon}
                  mods={row.mods}
                  onSeeAll={goToCatalog}
                  onModClick={goToMod}
                />
              </motion.section>
            ))
          )}
        </div>

        {/* ── Back to top ── */}
        {showBackTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={scrollToTop}
            className="fixed bottom-6 right-6 z-50 w-10 h-10 rounded-xl
                       bg-white/[0.1] backdrop-blur-md border border-white/[0.15]
                       flex items-center justify-center text-white/60
                       hover:bg-white/[0.18] hover:text-white
                       transition-all duration-300 shadow-lg"
          >
            <ArrowUp size={16} />
          </motion.button>
        )}
      </div>
    </div>
  );
}

/* ── Featured Banner — compact ──────────────────────────────────── */

function FeaturedBanner({
  mod,
  onExplore,
  onModClick,
}: {
  mod: CatalogMod;
  onExplore: () => void;
  onModClick: (mod: CatalogMod) => void;
}) {
  return (
    <div
      onClick={() => onModClick(mod)}
      className="relative w-full h-[15rem] rounded-2xl overflow-hidden
                 border border-white/[0.08] group cursor-pointer"
    >
      {mod.image_url ? (
        <img
          src={mod.image_url}
          alt={mod.name}
          className="absolute inset-0 w-full h-full object-cover
                     transition-transform duration-[1200ms] ease-out
                     group-hover:scale-[1.03]"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#2a2a35] to-[#14141a]" />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-transparent to-transparent" />

      <div className="absolute inset-x-0 top-0 h-px pointer-events-none
                      bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <div className="relative h-full flex flex-col justify-end p-6 gap-2 max-w-xl">
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="inline-flex items-center gap-2 w-fit
                     rounded-full bg-white/[0.08] backdrop-blur-md
                     border border-white/[0.12] px-3 py-1"
        >
          <Sparkles size={12} className="text-amber-400" />
          <span className="text-[10px] font-semibold text-white/80 uppercase tracking-wider">
            Популярное
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.45, ease: EASE_DEPTH }}
          className="text-2xl font-extrabold text-white leading-tight tracking-tight
                     drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]"
        >
          {mod.name}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.4 }}
          className="text-xs text-white/55 leading-relaxed line-clamp-1 max-w-lg"
        >
          {mod.description}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="flex items-center gap-3 mt-0.5"
        >
          {mod.file_size_label && (
            <span className="inline-flex items-center gap-1 text-[11px] text-white/45">
              <Download size={12} />
              {mod.file_size_label}
            </span>
          )}
          {mod.author && (
            <span className="text-[11px] text-white/40">
              by <span className="text-white/65 font-medium">{mod.author}</span>
            </span>
          )}

          <div className="flex-1" />

          <button
            onClick={(e) => { e.stopPropagation(); onExplore(); }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg
                       bg-white/[0.1] backdrop-blur-md border border-white/[0.15]
                       text-xs font-semibold text-white
                       hover:bg-white/[0.18] hover:border-white/[0.25]
                       transition-all duration-300"
          >
            Каталог
            <ArrowRight size={13} />
          </button>
        </motion.div>
      </div>
    </div>
  );
}

/* ── Category Row — enhanced ─────────────────────────────────── */

function CategoryRow({
  label,
  icon,
  mods,
  onSeeAll,
  onModClick,
}: {
  label: string;
  icon?: string;
  mods: CatalogMod[];
  onSeeAll: () => void;
  onModClick: (mod: CatalogMod) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [hovered, setHovered] = useState(false);
  const Icon = iconFor(icon);

  const updateScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScroll();
    el.addEventListener('scroll', updateScroll, { passive: true });
    window.addEventListener('resize', updateScroll);
    return () => {
      el.removeEventListener('scroll', updateScroll);
      window.removeEventListener('resize', updateScroll);
    };
  }, [mods]);

  // Horizontal scroll via mouse wheel
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        const scrollEl = scrollRef.current;
        if (!scrollEl) return;
        const atEnd =
          (e.deltaY > 0 && scrollEl.scrollLeft >= scrollEl.scrollWidth - scrollEl.clientWidth - 4) ||
          (e.deltaY < 0 && scrollEl.scrollLeft <= 0);
        if (!atEnd) {
          scrollEl.scrollBy({ left: e.deltaY * 1.2, behavior: 'auto' });
          e.preventDefault();
        }
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -el.clientWidth * 0.7 : el.clientWidth * 0.7, behavior: 'smooth' });
  };

  return (
    <div
      ref={rowRef}
      className="flex flex-col gap-2.5"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <div className="w-6 h-6 rounded-md bg-white/[0.06] border border-white/[0.08]
                            flex items-center justify-center">
              <Icon size={13} className="text-white/60" />
            </div>
          )}
          <div className="flex flex-col">
            <h2 className="text-xs font-bold text-white tracking-tight uppercase leading-tight">
              {label}
            </h2>
            <span className="h-px w-3/4 mt-0.5 bg-gradient-to-r from-white/20 to-transparent rounded-full" />
          </div>
          <span className="text-[10px] text-white/30 font-medium ml-1">{mods.length}</span>
        </div>

        <div
          className={`flex items-center gap-1.5 transition-opacity duration-300 ${
            hovered ? 'opacity-100' : 'opacity-40'
          }`}
        >
          {canScrollLeft && (
            <button
              onClick={() => scroll('left')}
              className="w-6 h-6 rounded-md bg-white/[0.06] border border-white/[0.08]
                         flex items-center justify-center text-white/50
                         hover:bg-white/[0.12] hover:text-white transition-all"
            >
              <ChevronLeft size={13} />
            </button>
          )}
          {canScrollRight && (
            <button
              onClick={() => scroll('right')}
              className="w-6 h-6 rounded-md bg-white/[0.06] border border-white/[0.08]
                         flex items-center justify-center text-white/50
                         hover:bg-white/[0.12] hover:text-white transition-all"
            >
              <ChevronRight size={13} />
            </button>
          )}
          <button
            onClick={onSeeAll}
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-white/40
                       hover:text-white transition-colors duration-200 ml-1"
          >
            Все
            <ArrowRight size={10} />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto overflow-y-hidden pb-1
                   scrollbar-none -mx-1 px-1"
        style={{ scrollSnapType: 'x proximity' }}
      >
        {mods.map((mod) => (
          <div
            key={mod.id}
            className="shrink-0 w-[200px] h-[260px]"
            style={{ scrollSnapAlign: 'start' }}
          >
            <CatalogCard mod={mod} onClick={() => onModClick(mod)} />
          </div>
        ))}
      </div>
    </div>
  );
}
