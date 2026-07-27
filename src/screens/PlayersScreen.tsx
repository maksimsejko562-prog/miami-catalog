import { motion } from 'framer-motion';
import { Trophy, Crown, Medal, Search, ArrowRight, Users as UsersIcon } from 'lucide-react';
import { useState } from 'react';
import { GlassPanel } from '../design';
import { usePlayersStore, avatarUrl, type Player } from '../store/players';
import { useUIStore } from '../store/ui';
import { useNavStore } from '../data/navigation';

const BADGE_META: Record<number, { icon: typeof Crown; label: string; emoji: string }> = {
  1: { icon: Crown, label: 'Чемпион', emoji: '🥇' },
  2: { icon: Medal, label: '2 место', emoji: '🥈' },
  3: { icon: Medal, label: '3 место', emoji: '🥉' },
};

function getBadge(rank: number) {
  return BADGE_META[rank] ?? null;
}

export default function PlayersScreen() {
  const players = usePlayersStore((s) => s.players);
  const selectPlayer = usePlayersStore((s) => s.selectPlayer);
  const setScreen = useUIStore((s) => s.setScreen);
  const navigate = useNavStore((s) => s.navigate);

  const [query, setQuery] = useState('');

  const sorted = [...players].sort((a, b) => b.points - a.points);
  const filtered = query
    ? sorted.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    : sorted;

  const openProfile = (id: string) => {
    selectPlayer(id);
    setScreen('profile');
    navigate('profile');
  };

  return (
    <div className="h-full flex flex-col px-8 pt-5 pb-5 gap-5 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-white/[0.06] border border-white/[0.10] flex items-center justify-center">
          <UsersIcon className="w-5 h-5 text-text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">Рейтинг игроков</h1>
          <p className="text-xs text-text-muted">{players.length} участников</p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 bg-glass-strong backdrop-blur-glass px-4 py-2.5 rounded-xl border border-glass-border">
        <Search className="w-4 h-4 text-text-muted shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Найти игрока…"
          className="bg-transparent outline-none text-sm placeholder:text-text-muted w-full text-text-primary"
        />
      </div>

      {/* Podium top-3 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 shrink-0">
        {filtered.slice(0, 3).map((p, _i) => {
          const rank = sorted.indexOf(p) + 1;
          const badge = getBadge(rank);
          return (
            <PodiumCard
              key={p.id}
              player={p}
              rank={rank}
              badge={badge}
              onClick={() => openProfile(p.id)}
            />
          );
        })}
      </div>

      {/* Если поиск ничего не дал */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-text-muted">
          <UsersIcon className="w-10 h-10 opacity-30" />
          <p className="text-sm">Игрок не найден</p>
        </div>
      )}

      {/* Table */}
      {filtered.length > 3 && (
        <GlassPanel depth="z2" tint="soft" rounded="2xl" className="overflow-hidden shrink-0">
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-5 py-3 text-[10px] font-bold text-text-muted uppercase tracking-wider border-b border-border-faint">
            <span>#</span><span>Игрок</span><span className="text-right">Модов</span><span className="text-right">Очков</span><span />
          </div>
          {filtered.slice(3).map((p) => {
            const rank = sorted.indexOf(p) + 1;
            return (
              <button
                key={p.id}
                onClick={() => openProfile(p.id)}
                className="w-full grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-5 py-3 items-center
                           hover:bg-white/[0.04] transition-colors border-b border-border-faint last:border-0 text-left"
              >
                <span className="text-sm font-bold text-text-muted w-6">{rank}</span>
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={avatarUrl(p.name)}
                    alt={p.name}
                    className="w-8 h-10 rounded-full shrink-0"
                  />
                  <span className="text-sm font-medium text-text-primary truncate">{p.name}</span>
                </div>
                <span className="text-sm text-text-secondary text-right">{p.modsCount}</span>
                <span className="text-sm font-semibold text-text-primary text-right">{p.points.toLocaleString('ru-RU')}</span>
                <ArrowRight size={14} className="text-text-muted/40" />
              </button>
            );
          })}
        </GlassPanel>
      )}
    </div>
  );
}

function PodiumCard({
  player,
  rank,
  badge,
  onClick,
}: {
  player: Player;
  rank: number;
  badge: { icon: typeof Crown; label: string; emoji: string } | null;
  onClick: () => void;
}) {

  return (
    <motion.button
      initial={{ opacity: 0, y: 22, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      onClick={onClick}
      className="text-left"
    >
      <GlassPanel depth="z2" tint="soft" rounded="2xl" className="p-5 text-center relative overflow-hidden cursor-pointer hover:bg-white/[0.04] transition-colors w-full">
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-24 h-24 rounded-full blur-2xl opacity-20"
             style={{ background: `hsl(${player.name.length * 37 % 360}, 65%, 55%)` }} />
        <div className="text-2xl mb-1">{badge?.emoji || `#${rank}`}</div>
        <img
          src={avatarUrl(player.name)}
          alt={player.name}
          className="w-16 h-20 mx-auto mb-3 rounded-full border-2 border-white/20 shadow-md"
        />
        <h3 className="font-display font-bold text-sm text-text-primary">{player.name}</h3>
        {badge && <p className="text-[10px] text-text-muted mb-2">{badge.label}</p>}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-elevated-soft border border-border-subtle px-3 py-1 text-xs font-semibold text-text-primary">
          <Trophy className="w-3 h-3" />{player.points.toLocaleString('ru-RU')}
        </span>
      </GlassPanel>
    </motion.button>
  );
}
