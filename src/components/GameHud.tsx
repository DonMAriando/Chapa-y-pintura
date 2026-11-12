import React from 'react';
import { Music, Pause, Volume2, VolumeX } from 'lucide-react';
import {
  CarDamageZones,
  GameHudSnapshot,
  PlayerHudState,
} from '../game/types';

interface GameHudProps {
  snapshot: GameHudSnapshot;
  muted: boolean;
  musicMuted: boolean;
  onPause: () => void;
  onToggleMute: () => void;
  onToggleMusic: () => void;
}

function zoneColor(damage: number): string {
  if (damage < 0.25) return '#64748B';
  if (damage < 0.55) return '#F59E0B';
  return '#EF4444';
}

function damageStatusLabel(hp: number, wrecked: boolean): string {
  if (wrecked || hp <= 0) return 'HECHO POLVO';
  if (hp <= 24) return 'EN LLAMAS';
  if (hp <= 55) return 'HUMO DENSO';
  if (hp <= 82) return 'ABOLLADO';
  return 'INTACTO';
}

const DamageZoneSilhouette: React.FC<{ zones: CarDamageZones }> = ({
  zones,
}) => (
  <svg
    viewBox="0 0 44 64"
    className="w-9 h-12 shrink-0"
    aria-hidden="true"
  >
    {/* Chassis core */}
    <rect
      x="11"
      y="14"
      width="22"
      height="36"
      rx="4"
      fill="#1E293B"
      stroke="#475569"
      strokeWidth="1.5"
    />
    {/* Front bumper/hood zone */}
    <path
      d="M11 16 Q11 6 22 6 Q33 6 33 16 Z"
      fill={zoneColor(zones.front)}
    />
    {/* Rear trunk/bumper zone */}
    <path
      d="M11 48 L33 48 Q33 58 22 58 Q11 58 11 48 Z"
      fill={zoneColor(zones.rear)}
    />
    {/* Left side */}
    <rect
      x="6"
      y="18"
      width="5"
      height="28"
      rx="2"
      fill={zoneColor(zones.left)}
    />
    {/* Right side */}
    <rect
      x="33"
      y="18"
      width="5"
      height="28"
      rx="2"
      fill={zoneColor(zones.right)}
    />
    {/* Windshield */}
    <rect x="14" y="21" width="16" height="8" rx="1.5" fill="#0F172A" />
  </svg>
);

const PlayerTelemetryCluster: React.FC<{
  player: PlayerHudState;
  align: 'left' | 'right';
  compact?: boolean;
}> = ({ player, align, compact }) => {
  const hpColor =
    player.hp > 55
      ? 'bg-emerald-500'
      : player.hp > 25
        ? 'bg-amber-500'
        : 'bg-red-500';
  const statusText = damageStatusLabel(player.hp, player.wrecked);

  return (
    <div
      className={`bg-[#0E1117]/88 border border-white/14 rounded-lg px-3.5 py-2.5 flex items-center gap-3.5 ${
        align === 'right' ? 'flex-row-reverse text-right' : 'flex-row text-left'
      } ${compact ? 'min-w-[248px]' : 'min-w-[290px]'}`}
    >
      <DamageZoneSilhouette zones={player.zones} />

      <div className="flex-1 min-w-0 space-y-1.5">
        <div
          className={`flex items-center justify-between gap-3 ${
            align === 'right' ? 'flex-row-reverse' : ''
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-2.5 h-2.5 rounded-xs shrink-0"
              style={{ backgroundColor: player.colorHex }}
            />
            <span className="font-display font-bold text-sm text-white truncate">
              {player.name}
            </span>
          </div>
          <span
            className={`font-mono-num text-[11px] font-bold tracking-wider ${
              player.wrecked
                ? 'text-red-400'
                : player.hp <= 24
                  ? 'text-orange-400'
                  : 'text-slate-300'
            }`}
          >
            {statusText}
          </span>
        </div>

        {/* Integrity Bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] font-mono-num text-slate-300">
            <span>CHAPA {player.hp}%</span>
            <span>BAJAS {player.kills}</span>
          </div>
          <div className="w-full h-2 bg-slate-800 rounded-xs overflow-hidden">
            <div
              className={`h-full transition-all duration-100 ${hpColor}`}
              style={{ width: `${Math.max(0, Math.min(100, player.hp))}%` }}
            />
          </div>
        </div>

        {/* Nitro Bar & Speed */}
        <div
          className={`flex items-center gap-3 pt-0.5 ${
            align === 'right' ? 'flex-row-reverse' : ''
          }`}
        >
          <div className="flex-1">
            <div className="flex items-center justify-between text-[10px] font-mono-num text-cyan-300 mb-0.5">
              <span>NITRO</span>
              <span>{player.nitro}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-xs overflow-hidden">
              <div
                className="h-full bg-cyan-400 transition-all duration-75"
                style={{ width: `${Math.max(0, Math.min(100, player.nitro))}%` }}
              />
            </div>
          </div>

          <div className="shrink-0">
            <span className="font-mono-num text-xl font-bold text-white leading-none">
              {player.speedKmh}
            </span>
            <span className="text-[10px] text-slate-400 ml-1 font-medium">
              KM/H
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

function formatTime(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const GameHud: React.FC<GameHudProps> = ({
  snapshot,
  muted,
  musicMuted,
  onPause,
  onToggleMute,
  onToggleMusic,
}) => {
  const is2P = snapshot.mode === '2p';
  const p1 = snapshot.players[0];
  const p2 = snapshot.players[1];

  return (
    <div className="fixed inset-0 z-10 pointer-events-none select-none">
      {/* Split-screen crisp center divider */}
      {is2P && (
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-white/30" />
      )}

      {/* Top Center Compact Match Header */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-auto">
        <div className="bg-[#0E1117]/88 border border-white/14 rounded-lg px-3.5 py-1.5 flex items-center gap-3 text-xs font-mono-num text-slate-200">
          <span>
            EN PIE{' '}
            <strong className="text-amber-400">
              {snapshot.aliveCount}/{snapshot.totalCars}
            </strong>
          </span>
          <span className="text-white/25" aria-hidden="true">
            ·
          </span>
          <span>{formatTime(snapshot.elapsedSeconds)}</span>
        </div>

        <button
          type="button"
          onClick={onToggleMusic}
          className="p-2 bg-[#0E1117]/88 border border-white/14 rounded-lg text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label={musicMuted ? 'Activar música' : 'Silenciar música'}
          title={musicMuted ? 'Activar música' : 'Silenciar música'}
        >
          <Music
            className={`w-4 h-4 ${musicMuted ? 'text-slate-500' : 'text-amber-400'}`}
          />
        </button>

        <button
          type="button"
          onClick={onToggleMute}
          className="p-2 bg-[#0E1117]/88 border border-white/14 rounded-lg text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label={muted ? 'Activar sonido' : 'Silenciar sonido'}
        >
          {muted ? (
            <VolumeX className="w-4 h-4 text-red-400" />
          ) : (
            <Volume2 className="w-4 h-4 text-amber-400" />
          )}
        </button>

        <button
          type="button"
          onClick={onPause}
          className="p-2 bg-[#0E1117]/88 border border-white/14 rounded-lg text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label="Pausar juego"
        >
          <Pause className="w-4 h-4" />
        </button>
      </div>

      {/* Countdown Overlay */}
      {snapshot.phase === 'countdown' && snapshot.countdownValue > 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-[#0E1117]/85 border border-amber-400/50 rounded-2xl px-10 py-6 text-center">
            <div className="text-xs font-semibold tracking-widest text-amber-400 uppercase mb-1">
              Prepárate
            </div>
            <div className="font-display font-bold italic text-7xl text-white font-mono-num leading-none">
              {snapshot.countdownValue}
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Action Callout Banner */}
      {snapshot.callout && snapshot.phase === 'playing' && (
        <div
          className={`absolute top-16 ${
            snapshot.callout.targetViewport === 'p1' && is2P
              ? 'left-1/4 -translate-x-1/2'
              : snapshot.callout.targetViewport === 'p2' && is2P
                ? 'left-3/4 -translate-x-1/2'
                : 'left-1/2 -translate-x-1/2'
          }`}
        >
          <div
            className={`px-4 py-1.5 rounded-lg border text-center bg-[#0E1117]/90 ${
              snapshot.callout.tone === 'wreck'
                ? 'border-red-500/60 text-red-400'
                : snapshot.callout.tone === 'nitro'
                  ? 'border-cyan-400/60 text-cyan-300'
                  : 'border-amber-400/60 text-amber-300'
            }`}
          >
            <div className="font-display font-bold italic text-lg tracking-wide leading-tight">
              {snapshot.callout.text}
            </div>
            {snapshot.callout.subtext && (
              <div className="text-[11px] font-medium text-slate-200">
                {snapshot.callout.subtext}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Spectator Notice if player is wrecked */}
      {!is2P && p1?.spectatingName && snapshot.phase === 'playing' && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-[#0E1117]/88 border border-red-500/40 rounded-lg px-3 py-1 text-xs text-red-300 font-medium">
          Auto hecho polvo · Siguiendo a {p1.spectatingName}
        </div>
      )}
      {is2P && p1?.spectatingName && snapshot.phase === 'playing' && (
        <div className="absolute top-16 left-1/4 -translate-x-1/2 bg-[#0E1117]/88 border border-red-500/40 rounded-lg px-3 py-1 text-xs text-red-300 font-medium">
          Auto hecho polvo · Siguiendo a {p1.spectatingName}
        </div>
      )}
      {is2P && p2?.spectatingName && snapshot.phase === 'playing' && (
        <div className="absolute top-16 left-3/4 -translate-x-1/2 bg-[#0E1117]/88 border border-red-500/40 rounded-lg px-3 py-1 text-xs text-red-300 font-medium">
          Auto hecho polvo · Siguiendo a {p2.spectatingName}
        </div>
      )}

      {/* Perimeter Player Telemetry Clusters */}
      {p1 && (
        <div className="absolute bottom-4 left-4">
          <PlayerTelemetryCluster player={p1} align="left" compact={is2P} />
        </div>
      )}

      {is2P && p2 && (
        <div className="absolute bottom-4 right-4">
          <PlayerTelemetryCluster player={p2} align="right" compact />
        </div>
      )}

      {/* Subtle single-line controls reminder at bottom center in 1P */}
      {!is2P && (
        <div className="hidden lg:block absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#0E1117]/75 border border-white/10 rounded-md px-3 py-1 text-[11px] text-slate-300 whitespace-nowrap">
          WASD / Flechas Conducir · Shift Nitro · Espacio Derrape
        </div>
      )}
    </div>
  );
};
