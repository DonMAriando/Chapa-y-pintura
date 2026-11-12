import React, { useEffect } from 'react';
import { Volume2, VolumeX, Music, Play, Users, User, Globe } from 'lucide-react';
import { NetConnectionStatus } from '../game/netClient';
import { RoomState, RoomSummary } from '../game/multiplayerTypes';
import {
  CAR_COLORS,
  CarColorId,
  GameMode,
  StartMatchConfig,
} from '../game/types';
import { MultiplayerLobby } from './MultiplayerLobby';

const onlineMultiplayerEnabled =
  import.meta.env.VITE_MULTIPLAYER_ENABLED !== 'false';

interface TitleOverlayProps {
  config: StartMatchConfig;
  muted: boolean;
  musicMuted: boolean;
  onChangeConfig: (next: StartMatchConfig) => void;
  onStart: () => void;
  onToggleMute: () => void;
  onToggleMusic: () => void;
  // Multiplayer props
  netStatus: NetConnectionStatus;
  playerId: string | null;
  playerName: string;
  playerColor: CarColorId;
  rooms: RoomSummary[];
  currentRoom: RoomState | null;
  roomError: string | null;
  onChangePlayerName: (name: string) => void;
  onChangePlayerColor: (colorId: CarColorId) => void;
  onRefreshRooms: () => void;
  onCreateRoom: (roomName: string, maxCars: number) => void;
  onJoinRoom: (roomId: string) => void;
  onJoinByCode: (code: string) => void;
  onLeaveRoom: () => void;
  onSwitchSlot: (slotIndex: number) => void;
  onUpdateMaxCars: (maxCars: number) => void;
  onStartRoomMatch: () => void;
  onClearError: () => void;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  config,
  muted,
  musicMuted,
  onChangeConfig,
  onStart,
  onToggleMute,
  onToggleMusic,
  netStatus,
  playerId,
  playerName,
  playerColor,
  rooms,
  currentRoom,
  roomError,
  onChangePlayerName,
  onChangePlayerColor,
  onRefreshRooms,
  onCreateRoom,
  onJoinRoom,
  onJoinByCode,
  onLeaveRoom,
  onSwitchSlot,
  onUpdateMaxCars,
  onStartRoomMatch,
  onClearError,
}) => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (config.mode === 'online') return;
      if (e.code === 'Enter' || e.code === 'Space') {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        onStart();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onStart, config.mode]);

  const aiOptions = config.mode === '1p' ? [3, 5, 7] : [0, 2, 4, 6];

  const handleModeSwitch = (mode: GameMode) => {
    if (config.mode === 'online' && mode !== 'online' && currentRoom) {
      onLeaveRoom();
    }
    const nextAi =
      mode === '1p'
        ? config.aiCount === 0
          ? 5
          : config.aiCount
        : [0, 2, 4, 6].includes(config.aiCount)
          ? config.aiCount
          : 4;
    onChangeConfig({ ...config, mode, aiCount: nextAi });
  };

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between pointer-events-none">
      {/* Contrast scrim keeping the live 3D arena clearly visible on the right */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(100deg, rgba(11,13,18,0.92) 0%, rgba(11,13,18,0.68) 46%, rgba(11,13,18,0.18) 100%)',
        }}
      />

      {/* Top minimal utility row */}
      <div className="relative z-10 flex items-center justify-between px-6 pt-5 sm:px-10">
        <div className="text-xs font-medium tracking-wider text-amber-400/90 uppercase">
          Arena Nocturna · Último Auto en Pie
        </div>
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={onToggleMusic}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-200 bg-[#141821]/90 border border-white/15 rounded-lg hover:bg-[#1E2432] transition-colors cursor-pointer whitespace-nowrap"
            aria-label={musicMuted ? 'Activar música metal' : 'Silenciar música'}
          >
            <Music
              className={`w-4 h-4 ${musicMuted ? 'text-slate-500' : 'text-amber-400'}`}
            />
            <span>{musicMuted ? 'Música off' : 'Metal on'}</span>
          </button>
          <button
            type="button"
            onClick={onToggleMute}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-200 bg-[#141821]/90 border border-white/15 rounded-lg hover:bg-[#1E2432] transition-colors cursor-pointer whitespace-nowrap"
            aria-label={muted ? 'Activar sonido' : 'Silenciar sonido'}
          >
            {muted ? (
              <VolumeX className="w-4 h-4 text-red-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-amber-400" />
            )}
            <span>{muted ? 'Sin sonido' : 'Sonido activo'}</span>
          </button>
        </div>
      </div>

      {/* Main Left-Aligned Launch Panel */}
      <div className="relative z-10 flex-1 flex items-center px-6 sm:px-10 overflow-y-auto py-3">
        <div
          className={`w-full pointer-events-auto ${
            config.mode === 'online' ? 'max-w-lg' : 'max-w-md'
          }`}
        >
          {/* Bespoke SVG Title Lockup */}
          <div className="mb-4">
            <svg
              viewBox="0 0 420 96"
              className="w-full max-w-[350px] h-auto overflow-visible"
              aria-label="Chapa y Polvo — Derby 3D"
            >
              <defs>
                <linearGradient id="metalGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FFFFFF" />
                  <stop offset="55%" stopColor="#E2E8F0" />
                  <stop offset="100%" stopColor="#94A3B8" />
                </linearGradient>
                <linearGradient id="amberGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#F59E0B" />
                  <stop offset="100%" stopColor="#EF4444" />
                </linearGradient>
              </defs>
              <polygon points="0,12 10,12 4,72 0,72" fill="#F59E0B" />
              <text
                x="20"
                y="54"
                fill="url(#metalGrad)"
                fontFamily="Chakra Petch, sans-serif"
                fontWeight="700"
                fontStyle="italic"
                fontSize="48"
                letterSpacing="1.5"
              >
                CHAPA Y POLVO
              </text>
              <rect
                x="20"
                y="64"
                width="168"
                height="4"
                fill="url(#amberGrad)"
              />
              <text
                x="22"
                y="88"
                fill="#CBD5E1"
                fontFamily="Plus Jakarta Sans, sans-serif"
                fontWeight="600"
                fontSize="14"
                letterSpacing="3"
              >
                DESTRUCTION DERBY 3D
              </text>
            </svg>
          </div>

          {/* Configuration Surface */}
          <div className="bg-[#11151E]/92 border border-white/12 rounded-xl p-5 space-y-4">
            {/* 1P / 2P / Online Mode Selector */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2">
                Modo de juego
              </label>
              <div
                className={`grid ${onlineMultiplayerEnabled ? 'grid-cols-3' : 'grid-cols-2'} gap-1.5 p-1 bg-[#0B0D12] rounded-lg border border-white/10`}
              >
                <button
                  type="button"
                  onClick={() => handleModeSwitch('1p')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 text-xs sm:text-sm font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    config.mode === '1p'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <User className="w-4 h-4 shrink-0" />
                  <span>1 Jugador</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleModeSwitch('2p')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 text-xs sm:text-sm font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    config.mode === '2p'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Users className="w-4 h-4 shrink-0" />
                  <span>2 Jugadores</span>
                </button>
                {onlineMultiplayerEnabled && (
                  <button
                    type="button"
                    onClick={() => handleModeSwitch('online')}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2 text-xs sm:text-sm font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      config.mode === 'online'
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-300 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Globe className="w-4 h-4 shrink-0" />
                    <span>Multijugador</span>
                  </button>
                )}
              </div>
            </div>

            {config.mode === 'online' ? (
              <MultiplayerLobby
                connectionStatus={netStatus}
                playerId={playerId}
                playerName={playerName}
                playerColor={playerColor}
                rooms={rooms}
                currentRoom={currentRoom}
                roomError={roomError}
                onChangePlayerName={onChangePlayerName}
                onChangePlayerColor={onChangePlayerColor}
                onRefreshRooms={onRefreshRooms}
                onCreateRoom={onCreateRoom}
                onJoinRoom={onJoinRoom}
                onJoinByCode={onJoinByCode}
                onLeaveRoom={onLeaveRoom}
                onSwitchSlot={onSwitchSlot}
                onUpdateMaxCars={onUpdateMaxCars}
                onStartRoomMatch={onStartRoomMatch}
                onClearError={onClearError}
              />
            ) : (
              <>
                {/* Car Paint Pickers */}
                <div
                  className={
                    config.mode === '2p' ? 'grid grid-cols-2 gap-4' : ''
                  }
                >
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-2">
                      {config.mode === '2p'
                        ? 'Auto Jugador 1'
                        : 'Color de tu auto'}
                    </label>
                    <div className="flex items-center gap-2 flex-wrap">
                      {CAR_COLORS.map((c) => {
                        const selected = config.p1Color === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            title={c.label}
                            onClick={() =>
                              onChangeConfig({
                                ...config,
                                p1Color: c.id as CarColorId,
                              })
                            }
                            className={`w-8 h-8 rounded-md transition-transform cursor-pointer border-2 ${
                              selected
                                ? 'border-white scale-110'
                                : 'border-white/15 opacity-75 hover:opacity-100'
                            }`}
                            style={{ backgroundColor: c.primaryHex }}
                            aria-label={`Color ${c.label}`}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {config.mode === '2p' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-2">
                        Auto Jugador 2
                      </label>
                      <div className="flex items-center gap-2 flex-wrap">
                        {CAR_COLORS.map((c) => {
                          const selected = config.p2Color === c.id;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              title={c.label}
                              onClick={() =>
                                onChangeConfig({
                                  ...config,
                                  p2Color: c.id as CarColorId,
                                })
                              }
                              className={`w-8 h-8 rounded-md transition-transform cursor-pointer border-2 ${
                                selected
                                  ? 'border-white scale-110'
                                  : 'border-white/15 opacity-75 hover:opacity-100'
                              }`}
                              style={{ backgroundColor: c.primaryHex }}
                              aria-label={`Color P2 ${c.label}`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* AI Rivals Count */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-slate-400">
                      Rivales IA en el predio
                    </label>
                    <span className="text-xs font-mono-num text-slate-300">
                      {config.aiCount === 0
                        ? 'Duelo 1 vs 1 puro'
                        : `${config.aiCount} autos rivales`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {aiOptions.map((count) => (
                      <button
                        key={count}
                        type="button"
                        onClick={() =>
                          onChangeConfig({ ...config, aiCount: count })
                        }
                        className={`flex-1 py-2 text-xs font-mono-num font-bold rounded-md border transition-colors cursor-pointer ${
                          config.aiCount === count
                            ? 'bg-slate-100 text-slate-950 border-slate-100'
                            : 'bg-[#0B0D12] text-slate-300 border-white/12 hover:border-white/30'
                        }`}
                      >
                        {count === 0 ? '0 (1v1)' : `+${count}`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Primary Start CTA */}
                <button
                  type="button"
                  onClick={onStart}
                  className="w-full py-3.5 px-6 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-display font-bold text-lg tracking-wide rounded-lg flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>Iniciar Derby</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Single flat control-hint line */}
      <div className="relative z-10 px-6 pb-4 sm:px-10">
        <p className="text-xs text-slate-300/90 font-medium tracking-wide">
          {config.mode === '2p'
            ? 'J1: WASD + Shift Nitro + Espacio Derrape  |  J2: Flechas + Enter/0 Nitro + Ctrl Der. Derrape  ·  Esc Pausa'
            : 'WASD o Flechas Conducir · Shift Nitro · Espacio Freno de mano · Esc Pausa'}
        </p>
      </div>
    </div>
  );
};
