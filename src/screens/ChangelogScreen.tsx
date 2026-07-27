import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  History, Sparkles, Download, GitBranch, Bug,
  Rocket, Package, type LucideIcon,
} from 'lucide-react';
import { GlassPanel } from '../design';
import { loadChangelog, latestRelease, type ChangelogData } from '../lib/changelogLoader';
import { loadCatalog } from '../lib/catalogLoader';
import type { CatalogMod } from '../types';

/** Иконка и цвет для типа релиза */
const TYPE_META: Record<string, { icon: LucideIcon; label: string; color: string }> = {
  major: { icon: Rocket,   label: 'Мажорный',    color: 'var(--status-warning)' },
  minor: { icon: Sparkles, label: 'Минорный',    color: 'var(--status-success)' },
  patch: { icon: Bug,      label: 'Патч',        color: 'var(--status-info)'    },
  fix:   { icon: GitBranch, label: 'Исправление', color: 'var(--status-error)'  },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function ChangelogScreen() {
  const [changelog, setChangelog] = useState<ChangelogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentMods, setRecentMods] = useState<CatalogMod[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const [clData, catData] = await Promise.all([
          loadChangelog(),
          loadCatalog(),
        ]);
        if (!mounted) return;
        setChangelog(clData);

        // 20 последних модов (по id — чем больше id, тем новее)
        const sorted = [...catData.mods]
          .sort((a, b) => b.id - a.id)
          .slice(0, 20);
        setRecentMods(sorted);
      } catch (err) {
        console.error('[ChangelogScreen]', err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const entries = changelog?.entries ?? [];
  const latest = latestRelease(changelog ?? { entries: [] });

  // Извлекаем мету последнего релиза для JSX (нельзя писать TYPE_META[...].icon в < />)
  const latestMeta = latest ? (TYPE_META[latest.type] || TYPE_META.minor) : null;
  const LatestIcon = latestMeta?.icon || Package;

  return (
    <div className="h-full flex flex-col px-8 pt-5 pb-5 gap-5 overflow-y-auto">
      {/* Заголовок */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-10 h-10 rounded-xl bg-accent-soft border border-accent/30 flex items-center justify-center">
          <History className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">Чейнджлог</h1>
          <p className="text-xs text-text-muted mt-0.5">
            История обновлений лаунчера и новые моды
          </p>
        </div>
      </div>

      {/* Последний релиз — виджет */}
      {latest && !loading && (
        <GlassPanel depth="z2" tint="soft" rounded="2xl" className="p-5 relative overflow-hidden shrink-0">
          <span
            aria-hidden
            className="absolute -top-16 -right-16 w-48 h-48 rounded-full opacity-[0.07] pointer-events-none"
            style={{ background: `radial-gradient(circle, ${latestMeta!.color}, transparent)` }}
          />
          <div className="relative flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: `${latestMeta!.color}20` }}
            >
              <LatestIcon className="w-6 h-6" style={{ color: latestMeta!.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"
                  style={{
                    background: `${latestMeta!.color}20`,
                    color: latestMeta!.color,
                  }}
                >
                  {latest.version}
                </span>
                <span className="text-xs text-text-muted">{formatDate(latest.date)}</span>
                <span className="text-[10px] text-text-muted uppercase tracking-wider">
                  {latestMeta!.label}
                </span>
              </div>
              <h2 className="text-base font-bold text-text-primary mt-1">{latest.title}</h2>
              <ul className="mt-2 flex flex-col gap-1">
                {latest.changes.map((c, i) => (
                  <li key={i} className="text-sm text-text-muted flex items-start gap-2">
                    <span className="mt-[5px] w-1.5 h-1.5 rounded-full shrink-0 bg-accent/60" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </GlassPanel>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-accent animate-spin" />
            <span className="text-xs text-text-muted">Загрузка...</span>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 overflow-hidden">
          {/* Левая колонка — лента чейнджлога */}
          <div className="overflow-y-auto pr-2 space-y-4">
            <h2 className="text-sm font-bold text-text-primary uppercase tracking-tight shrink-0">
              Все релизы
            </h2>

            {entries.length === 0 ? (
              <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-8 text-center">
                <Package className="w-10 h-10 mx-auto text-text-muted mb-3" />
                <p className="text-sm text-text-muted">История пока пуста</p>
              </div>
            ) : (
              entries.map((entry, idx) => {
                const meta = TYPE_META[entry.type] || TYPE_META.patch;
                const EntryIcon = meta.icon;
                return (
                  <motion.div
                    key={entry.version}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: idx * 0.05 }}
                  >
                    <GlassPanel depth="z1" tint="soft" rounded="2xl" className="p-4">
                      <div className="flex items-start gap-3">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                          style={{ background: `${meta.color}18` }}
                        >
                          <EntryIcon className="w-4 h-4" style={{ color: meta.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-text-primary">{entry.version}</span>
                            <span className="text-[10px] text-text-muted">{meta.label}</span>
                            <span className="text-[10px] text-text-muted">{formatDate(entry.date)}</span>
                          </div>
                          <p className="text-xs text-text-primary font-medium mt-1">{entry.title}</p>
                          <ul className="mt-2 flex flex-col gap-0.5">
                            {entry.changes.map((c, i) => (
                              <li key={i} className="text-xs text-text-muted flex items-start gap-2">
                                <span className="mt-[5px] w-1 h-1 rounded-full shrink-0 bg-white/20" />
                                {c}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </GlassPanel>
                  </motion.div>
                );
              })
            )}
          </div>

          {/* Правая колонка — новые моды (автоматически из каталога) */}
          <div className="overflow-y-auto pr-1 space-y-3">
            <div className="flex items-center gap-2 sticky top-0 bg-bg-surface z-10 pb-2">
              <Download className="w-4 h-4 text-text-muted" />
              <h2 className="text-sm font-bold text-text-primary uppercase tracking-tight">
                Новые моды
              </h2>
              <span className="text-[10px] text-text-muted ml-auto">{recentMods.length}</span>
            </div>

            {recentMods.length === 0 ? (
              <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 text-center">
                <p className="text-xs text-text-muted">Нет новых модов</p>
              </div>
            ) : (
              recentMods.map((mod, i) => (
                <motion.div
                  key={mod.id}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.02 }}
                  className="group flex items-center gap-3 p-2.5 rounded-2xl bg-white/[0.02] border border-white/[0.04]
                             hover:bg-white/[0.06] hover:border-white/[0.12] transition-all duration-200 cursor-default"
                >
                  {/* Мини-превью */}
                  <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 bg-white/[0.04]">
                    {mod.image_url ? (
                      <img
                        src={mod.image_url}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-4 h-4 text-white/20" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-text-primary truncate group-hover:text-accent transition-colors">
                      {mod.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {mod.downloads != null && (
                        <span className="text-[10px] text-text-muted flex items-center gap-1">
                          <Download className="w-3 h-3" />
                          {mod.downloads}
                        </span>
                      )}
                      {mod.author && (
                        <span className="text-[10px] text-text-muted truncate">
                          {mod.author}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
