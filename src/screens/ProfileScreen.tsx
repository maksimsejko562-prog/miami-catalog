import { motion } from 'framer-motion';
import { ArrowLeft, Star, Download, Heart, Settings, LogOut, Crown, Medal, Calendar } from 'lucide-react';
import { GlassPanel } from '../design';
import { usePlayersStore, avatarUrl } from '../store/players';
import { useUIStore } from '../store/ui';
import { useNavStore } from '../data/navigation';

export default function ProfileScreen() {
  const selectedPlayerId = usePlayersStore((s) => s.selectedPlayerId);
  const getPlayer = usePlayersStore((s) => s.getPlayer);
  const selectPlayer = usePlayersStore((s) => s.selectPlayer);
  const setScreen = useUIStore((s) => s.setScreen);
  const navigate = useNavStore((s) => s.navigate);

  const player = selectedPlayerId ? getPlayer(selectedPlayerId) : null;

  const goBack = () => {
    selectPlayer(null);
    setScreen('players');
    navigate('players');
  };

  // Если нет выбранного игрока — показываем текущий профиль (свой)
  const displayPlayer = player || {
    id: 'local',
    name: 'player_one',
    points: 48230,
    modsCount: 14,
    joined: '2024-03-15',
    installedMods: [],
  };

  const isOwn = !player || player.id === 'local';

  const rank = usePlayersStore((s) => {
    const sorted = [...s.players].sort((a, b) => b.points - a.points);
    const idx = sorted.findIndex((p) => p.id === displayPlayer.id);
    return idx >= 0 ? idx + 1 : '-';
  });

  const joinedDate = new Date(displayPlayer.joined).toLocaleDateString('ru-RU', {
    year: 'numeric', month: 'long',
  });

  return (
    <div className="h-full flex flex-col px-8 pt-5 pb-5 gap-5 overflow-y-auto">
      {/* Back button */}
      {player && (
        <button
          onClick={goBack}
          className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary
                     transition-colors w-fit"
        >
          <ArrowLeft size={14} />
          К рейтингу
        </button>
      )}

      {/* User card */}
      <GlassPanel depth="z2" tint="soft" rounded="2xl" className="p-6 relative overflow-hidden">
        <div
          className="absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl opacity-10 pointer-events-none"
          style={{ background: `hsl(${displayPlayer.name.length * 37 % 360}, 65%, 55%)` }}
        />
        <span aria-hidden className="absolute inset-x-0 top-0 h-px pointer-events-none bg-gradient-to-r from-transparent via-white/35 to-transparent" />
        <div className="relative flex items-start sm:items-center gap-5 flex-col sm:flex-row">
          {/* Avatar */}
          <div className="relative">
            <img
              src={avatarUrl(displayPlayer.name)}
              alt={displayPlayer.name}
              className="w-20 h-auto rounded-2xl border-2 border-white/20 shadow-md"
              style={{ aspectRatio: '4/5' }}
            />
            <span className="absolute -bottom-1 -right-1 rounded-full bg-status-success w-5 h-5 border-4 border-bg-surface" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl font-bold text-text-primary">{displayPlayer.name}</h2>
              {typeof rank === 'number' && rank <= 3 && (
                <span className="rounded-md bg-accent-soft border border-accent/30 px-2 py-0.5 text-[10px] font-bold text-accent uppercase flex items-center gap-1">
                  {rank === 1 ? <Crown size={11} /> : <Medal size={11} />}
                  #{rank}
                </span>
              )}
              <span className="rounded-md bg-white/[0.06] border border-white/[0.10] px-2 py-0.5 text-[10px] font-bold text-text-muted uppercase">
                {rank}-е место
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
              <span className="flex items-center gap-1"><Calendar size={12} /> С {joinedDate}</span>
              <span>ID · #{displayPlayer.id.slice(-4).toUpperCase()}</span>
            </div>
          </div>

          {isOwn && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                className="btn-glow btn-glow--ghost"
                onClick={() => {
                  const name = prompt('Новое имя:', displayPlayer.name);
                  if (name && name.trim()) {
                    usePlayersStore.getState().upsertPlayer({ ...displayPlayer, name: name.trim() });
                  }
                }}
              >
                <Settings className="w-4 h-4" /> Изменить
              </button>
              <button
                className="btn-glow btn-glow--ghost"
                style={{ color: 'var(--status-error)' }}
                onClick={() => {
                  if (confirm('Выйти из профиля?')) {
                    usePlayersStore.getState().selectPlayer(null);
                    setScreen('home');
                    navigate('home');
                  }
                }}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </GlassPanel>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {([
          [Download, String(displayPlayer.modsCount), 'Установлено', 'var(--status-success)'],
          [Star, String(displayPlayer.points), 'Очков', 'var(--status-warning)'],
          [Heart, String(Math.floor(displayPlayer.points / 1000)), 'В избранном', 'var(--status-error)'],
          [Settings, String(Math.max(1, Math.floor(displayPlayer.modsCount / 3))), 'Сборок', 'var(--accent)'],
        ] as const).map(([Icon, value, label, color]) => (
          <GlassPanel key={label} depth="z2" tint="soft" rounded="2xl" className="p-4">
            <div className="flex items-center gap-2 mb-2" style={{ color }}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="text-2xl font-bold text-text-primary">{value}</div>
            <div className="text-xs text-text-muted mt-0.5">{label}</div>
          </GlassPanel>
        ))}
      </div>

      {/* Achievements */}
      <div>
        <h2 className="text-sm font-bold text-text-primary mb-4 uppercase tracking-tight">
          Достижения {displayPlayer.name}
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { title: 'Первый мод', desc: 'Установил первый мод', icon: Download, color: 'var(--status-success)', done: displayPlayer.modsCount >= 1 },
            { title: 'Коллекционер', desc: '10 установленных модов', icon: Star, color: 'var(--status-warning)', done: displayPlayer.modsCount >= 10 },
            { title: 'Топ-3', desc: 'Вошёл в тройку лидеров', icon: Crown, color: 'var(--status-info)', done: typeof rank === 'number' && rank <= 3 },
            { title: 'Архитектор', desc: 'Создал свою сборку', icon: Settings, color: 'var(--accent)', done: displayPlayer.modsCount >= 5 },
          ].map((ach, i) => (
            <motion.div
              key={ach.title}
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
            >
              <GlassPanel
                depth="z2"
                tint="soft"
                rounded="2xl"
                className={`p-4 text-center ${ach.done ? '' : 'opacity-40'}`}
              >
                <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center
                            bg-bg-elevated-soft border border-border-subtle">
                  <ach.icon className="w-6 h-6" style={{ color: ach.color }} />
                </div>
                <h4 className="font-semibold text-sm text-text-primary">{ach.title}</h4>
                <p className="text-xs text-text-muted mt-1">{ach.desc}</p>
              </GlassPanel>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
