import React from 'react';
import {
  Play,
  RotateCcw,
  Home,
  Trophy,
  Volume2,
  VolumeX,
  Music,
  Users,
} from 'lucide-react';
import { GameMode, MatchSummary } from '../game/types';

interface PauseModalProps {
  mode: GameMode;
  muted: boolean;
  musicMuted: boolean;
  onResume: () => void;
  onRestart: () => void;
  onExitToTitle: () => void;
  onToggleMute: () => void;
  onToggleMusic: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  mode,
  muted,
  musicMuted,
  onResume,
  onRestart,
  onExitToTitle,
  onToggleMute,
  onToggleMusic,
}) => {
  const isOnline = mode === 'online';

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#07090D]/80 p-4">
      <div className="w-full max-w-md bg-[#121620] border border-white/15 rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-display font-bold text-2xl text-white">
              {isOnline ? 'Opciones de Sala' : 'Derby en Pausa'}
            </h2>
            {isOnline && (
              <p className="text-[11px] text-amber-400">
                La partida sigue en vivo en la arena
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleMusic}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#0B0D12] border border-white/12 rounded-md hover:border-white/30 cursor-pointer"
            >
              <Music
                className={`w-3.5 h-3.5 ${musicMuted ? 'text-slate-500' : 'text-amber-400'}`}
              />
              <span>{musicMuted ? 'Música off' : 'Metal'}</span>
            </button>
            <button
              type="button"
              onClick={onToggleMute}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#0B0D12] border border-white/12 rounded-md hover:border-white/30 cursor-pointer"
            >
              {muted ? (
                <VolumeX className="w-3.5 h-3.5 text-red-400" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span>{muted ? 'Silenciado' : 'Sonido'}</span>
            </button>
          </div>
        </div>

        <div className="bg-[#0B0D12] border border-white/10 rounded-lg p-3.5 text-xs text-slate-300 space-y-1.5">
          <div className="font-semibold text-slate-200">Controles</div>
          {mode === '2p' ? (
            <>
              <p>Jugador 1: WASD + Shift (Nitro) + Espacio (Freno de mano)</p>
              <p>Jugador 2: Flechas + Enter o 0 (Nitro) + Ctrl Der. (Freno de mano)</p>
            </>
          ) : (
            <p>WASD o Flechas: Conducir · Shift: Nitro · Espacio: Freno de mano</p>
          )}
        </div>

        <div className="space-y-2.5">
          <button
            type="button"
            onClick={onResume}
            className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-base rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Continuar</span>
          </button>

          {isOnline ? (
            <button
              type="button"
              onClick={onExitToTitle}
              className="w-full py-2.5 px-4 bg-[#1B2130] hover:bg-[#252D40] text-slate-100 font-semibold text-sm rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Home className="w-4 h-4" />
              <span>Abandonar Sala</span>
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={onRestart}
                className="py-2.5 px-4 bg-[#1B2130] hover:bg-[#252D40] text-slate-100 font-semibold text-sm rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reiniciar</span>
              </button>

              <button
                type="button"
                onClick={onExitToTitle}
                className="py-2.5 px-4 bg-[#1B2130] hover:bg-[#252D40] text-slate-100 font-semibold text-sm rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Home className="w-4 h-4" />
                <span>Menú</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface GameOverModalProps {
  summary: MatchSummary;
  isOnline?: boolean;
  isHost?: boolean;
  onRestart: () => void;
  onReturnToLobby?: () => void;
  onExitToTitle: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  summary,
  isOnline,
  isHost,
  onRestart,
  onReturnToLobby,
  onExitToTitle,
}) => {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#07090D]/84 p-4">
      <div className="w-full max-w-lg bg-[#121620] border border-white/15 rounded-xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold tracking-wider text-amber-400 uppercase mb-1">
              {summary.isPlayerWin ? '¡Victoria en el Predio!' : 'Fin del Derby'}
            </div>
            <h2 className="font-display font-bold text-3xl text-white flex items-center gap-2.5">
              <Trophy
                className="w-7 h-7 shrink-0"
                style={{ color: summary.winnerColorHex }}
              />
              <span>Ganador: {summary.winnerName}</span>
            </h2>
          </div>
        </div>

        {/* Highlight Match Metrics */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="bg-[#0B0D12] border border-white/10 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Choque máx.</div>
            <div className="font-mono-num text-lg font-bold text-amber-400">
              {summary.peakImpactKmh} km/h
            </div>
          </div>
          <div className="bg-[#0B0D12] border border-white/10 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Piezas voladas</div>
            <div className="font-mono-num text-lg font-bold text-white">
              {summary.totalPartsDetached}
            </div>
          </div>
          <div className="bg-[#0B0D12] border border-white/10 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Duración</div>
            <div className="font-mono-num text-lg font-bold text-white">
              {summary.durationSeconds}s
            </div>
          </div>
        </div>

        {/* Standings Table */}
        <div className="bg-[#0B0D12] border border-white/10 rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3.5 py-2 text-[11px] font-semibold text-slate-400 border-b border-white/10">
            <span>Piloto</span>
            <span className="text-right">Bajas</span>
            <span className="text-right">Daño</span>
            <span className="text-right">Estado</span>
          </div>
          <div className="max-h-48 overflow-y-auto divide-y divide-white/6">
            {summary.standings.map((row, idx) => (
              <div
                key={row.id}
                className={`grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center px-3.5 py-2 text-xs ${
                  row.isPlayer ? 'bg-white/[0.04]' : ''
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono-num text-slate-500 w-4">
                    {idx + 1}.
                  </span>
                  <span
                    className="w-2.5 h-2.5 rounded-xs shrink-0"
                    style={{ backgroundColor: row.colorHex }}
                  />
                  <span className="font-semibold text-slate-100 truncate">
                    {row.name}
                  </span>
                </div>
                <span className="font-mono-num text-slate-200 w-10 text-right">
                  {row.kills}
                </span>
                <span className="font-mono-num text-slate-300 w-12 text-right">
                  {row.damageDealt}
                </span>
                <span
                  className={`font-mono-num font-bold w-20 text-right ${
                    row.wrecked ? 'text-red-400' : 'text-emerald-400'
                  }`}
                >
                  {row.wrecked ? 'DESTRUIDO' : `${row.hp}%`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {isOnline ? (
          <div className="space-y-2.5">
            {isHost ? (
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={onReturnToLobby}
                  className="py-3 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-base rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Users className="w-4 h-4" />
                  <span>Volver a la Sala</span>
                </button>
                <button
                  type="button"
                  onClick={onExitToTitle}
                  className="py-3 px-4 bg-[#1B2130] hover:bg-[#252D40] text-slate-100 font-semibold text-sm rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Home className="w-4 h-4" />
                  <span>Salir de Sala</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="bg-[#0B0D12] border border-white/10 rounded-lg px-3.5 py-2.5 text-xs text-slate-300 text-center">
                  Esperando a que el anfitrión vuelva a la sala para otra ronda...
                </div>
                <button
                  type="button"
                  onClick={onExitToTitle}
                  className="w-full py-2.5 px-4 bg-[#1B2130] hover:bg-[#252D40] text-slate-100 font-semibold text-sm rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Home className="w-4 h-4" />
                  <span>Salir al Menú</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onRestart}
              className="py-3 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-base rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Revancha</span>
            </button>

            <button
              type="button"
              onClick={onExitToTitle}
              className="py-3 px-4 bg-[#1B2130] hover:bg-[#252D40] text-slate-100 font-semibold text-sm rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Home className="w-4 h-4" />
              <span>Menú Principal</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
