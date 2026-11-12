import React, { useState } from 'react';
import {
  Bot,
  Crown,
  LogOut,
  Play,
  Plus,
  RefreshCw,
  User,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { NetConnectionStatus } from '../game/netClient';
import { RoomState, RoomSummary } from '../game/multiplayerTypes';
import { CAR_COLORS, CarColorId } from '../game/types';

interface MultiplayerLobbyProps {
  connectionStatus: NetConnectionStatus;
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

export const MultiplayerLobby: React.FC<MultiplayerLobbyProps> = ({
  connectionStatus,
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
  const [roomNameInput, setRoomNameInput] = useState('Arena Nocturna');
  const [maxCarsInput, setMaxCarsInput] = useState(6);
  const [joinCodeInput, setJoinCodeInput] = useState('');

  const isConnected = connectionStatus === 'connected';

  if (currentRoom) {
    const isHost = currentRoom.hostPlayerId === playerId;
    const humanCount = currentRoom.slots.filter(
      (s) => s.occupantType === 'human',
    ).length;
    const botCount = currentRoom.maxCars - humanCount;

    return (
      <div className="space-y-4">
        {/* Room Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/10">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wider text-amber-400 uppercase">
              <span>Sala #{currentRoom.code}</span>
              <span className="text-white/25">·</span>
              <span className="font-mono-num text-slate-300">
                {humanCount}/{currentRoom.maxCars} puestos
              </span>
            </div>
            <h3 className="font-display font-bold text-xl text-white truncate">
              {currentRoom.name}
            </h3>
          </div>
          <button
            type="button"
            onClick={onLeaveRoom}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-[#0B0D12] border border-white/15 rounded-lg hover:border-red-400/50 hover:text-red-300 transition-colors cursor-pointer shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Salir</span>
          </button>
        </div>

        {roomError && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-red-200 bg-red-500/15 border border-red-500/40 rounded-lg">
            <span>{roomError}</span>
            <button
              type="button"
              onClick={onClearError}
              className="text-red-300 hover:text-white font-bold cursor-pointer"
            >
              ×
            </button>
          </div>
        )}

        {/* Grid of Car Seats */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">
              Puestos en el predio (clic en puesto libre para moverte)
            </span>
            <span className="text-[11px] font-mono-num text-cyan-300">
              +{botCount} bots IA al iniciar
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-0.5">
            {currentRoom.slots.map((slot) => {
              const colorObj =
                CAR_COLORS.find((c) => c.id === slot.colorId) ?? CAR_COLORS[0];
              const isMe = slot.playerId === playerId;
              const numLabel = String(slot.slotIndex + 1).padStart(2, '0');

              if (slot.occupantType === 'human') {
                return (
                  <div
                    key={slot.slotIndex}
                    className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border ${
                      isMe
                        ? 'bg-amber-500/12 border-amber-400/50'
                        : 'bg-[#0B0D12] border-white/12'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono-num text-[11px] text-slate-500">
                        {numLabel}
                      </span>
                      <span
                        className="w-3 h-3 rounded-xs shrink-0 border border-white/25"
                        style={{ backgroundColor: colorObj.primaryHex }}
                      />
                      <span className="text-xs font-semibold text-white truncate">
                        {slot.name}
                        {isMe ? ' (Tú)' : ''}
                      </span>
                    </div>
                    {slot.isHost ? (
                      <Crown
                        className="w-3.5 h-3.5 text-amber-400 shrink-0"
                        aria-label="Anfitrión"
                      />
                    ) : (
                      <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    )}
                  </div>
                );
              }

              return (
                <button
                  key={slot.slotIndex}
                  type="button"
                  onClick={() => onSwitchSlot(slot.slotIndex)}
                  className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border border-dashed border-white/14 bg-[#0B0D12]/60 hover:border-amber-400/45 hover:bg-[#141925] transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono-num text-[11px] text-slate-500">
                      {numLabel}
                    </span>
                    <Bot className="w-3.5 h-3.5 text-cyan-400/80 shrink-0" />
                    <span className="text-[11px] text-slate-400 truncate">
                      Libre · Bot IA
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Color Selector in Room */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Color de tu auto
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            {CAR_COLORS.map((c) => {
              const selected = playerColor === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  title={c.label}
                  onClick={() => onChangePlayerColor(c.id)}
                  className={`w-7 h-7 rounded-md transition-transform cursor-pointer border-2 ${
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

        {/* Host Total Cars + Start Match */}
        {isHost ? (
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-slate-400">
                Capacidad total de autos
              </span>
              <div className="flex items-center gap-1.5">
                {[4, 6, 8].map((cap) => {
                  const disabled = cap < humanCount;
                  return (
                    <button
                      key={cap}
                      type="button"
                      disabled={disabled}
                      onClick={() => onUpdateMaxCars(cap)}
                      className={`px-3 py-1 text-xs font-mono-num font-bold rounded-md border transition-colors ${
                        currentRoom.maxCars === cap
                          ? 'bg-slate-100 text-slate-950 border-slate-100'
                          : disabled
                            ? 'bg-[#0B0D12] text-slate-600 border-white/5 cursor-not-allowed'
                            : 'bg-[#0B0D12] text-slate-300 border-white/12 hover:border-white/30 cursor-pointer'
                      }`}
                    >
                      {cap}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={onStartRoomMatch}
              className="w-full py-3.5 px-6 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-display font-bold text-lg tracking-wide rounded-lg flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>
                Comenzar ({humanCount} {humanCount === 1 ? 'jugador' : 'jugadores'} +{' '}
                {botCount} bots)
              </span>
            </button>
          </div>
        ) : (
          <div className="bg-[#0B0D12] border border-white/10 rounded-lg px-4 py-3 text-xs text-slate-300 text-center">
            Esperando a que el anfitrión inicie el derby. Los puestos vacíos se
            completarán automáticamente con bots IA.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Connection status + Pilot identity */}
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-slate-400 font-medium">Tu perfil de piloto</span>
        <span
          className={`flex items-center gap-1.5 font-mono-num ${
            isConnected ? 'text-emerald-400' : 'text-amber-400'
          }`}
        >
          {isConnected ? (
            <>
              <Wifi className="w-3.5 h-3.5" />
              <span>Conectado</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5" />
              <span>Conectando...</span>
            </>
          )}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
        <div>
          <label className="block text-[11px] font-medium text-slate-400 mb-1">
            Nombre del piloto
          </label>
          <input
            type="text"
            maxLength={18}
            value={playerName}
            onChange={(e) => onChangePlayerName(e.target.value)}
            placeholder="Tu nombre"
            className="w-full px-3 py-2 text-sm text-white bg-[#0B0D12] border border-white/15 rounded-lg focus:outline-none focus:border-amber-400"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-400 mb-1">
            Color
          </label>
          <div className="flex items-center gap-1.5">
            {CAR_COLORS.map((c) => {
              const selected = playerColor === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  title={c.label}
                  onClick={() => onChangePlayerColor(c.id)}
                  className={`w-7 h-7 rounded-md transition-transform cursor-pointer border-2 ${
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
      </div>

      {roomError && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-red-200 bg-red-500/15 border border-red-500/40 rounded-lg">
          <span>{roomError}</span>
          <button
            type="button"
            onClick={onClearError}
            className="text-red-300 hover:text-white font-bold cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* Create Room Card */}
      <div className="bg-[#0B0D12] border border-white/12 rounded-lg p-3 space-y-2.5">
        <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
          Crear Sala Nueva
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input
            type="text"
            maxLength={26}
            value={roomNameInput}
            onChange={(e) => setRoomNameInput(e.target.value)}
            placeholder="Nombre de la sala"
            className="px-3 py-2 text-xs text-white bg-[#141821] border border-white/12 rounded-md focus:outline-none focus:border-amber-400"
          />
          <div className="flex items-center gap-1 bg-[#141821] border border-white/12 rounded-md px-1.5">
            {[4, 6, 8].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setMaxCarsInput(n)}
                className={`px-2 py-1 text-xs font-mono-num font-bold rounded cursor-pointer ${
                  maxCarsInput === n
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
                title={`${n} autos totales`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          disabled={!isConnected}
          onClick={() => onCreateRoom(roomNameInput, maxCarsInput)}
          className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-400 text-slate-950 font-display font-bold text-sm tracking-wide rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Crear Sala ({maxCarsInput} puestos)</span>
        </button>
      </div>

      {/* Join by Code & Room Browser */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-amber-400" />
            <span>Salas disponibles ({rooms.length})</span>
          </span>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              maxLength={4}
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
              placeholder="Código"
              className="w-20 px-2 py-1 text-xs font-mono-num uppercase text-white bg-[#0B0D12] border border-white/15 rounded-md focus:outline-none focus:border-amber-400"
            />
            <button
              type="button"
              disabled={!isConnected || joinCodeInput.trim().length < 4}
              onClick={() => onJoinByCode(joinCodeInput)}
              className="px-2.5 py-1 text-xs font-semibold bg-[#1B2130] hover:bg-[#252D40] disabled:opacity-40 text-white rounded-md cursor-pointer"
            >
              Unirse
            </button>
            <button
              type="button"
              onClick={onRefreshRooms}
              className="p-1.5 text-slate-300 hover:text-white bg-[#0B0D12] border border-white/12 rounded-md cursor-pointer"
              title="Actualizar salas"
              aria-label="Actualizar salas"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="max-h-36 overflow-y-auto space-y-1.5 pr-0.5">
          {rooms.length === 0 ? (
            <div className="bg-[#0B0D12]/70 border border-white/10 rounded-lg px-3 py-4 text-xs text-slate-400 text-center">
              No hay salas activas todavía. Creá una arriba o invitá a otros con
              el enlace de la app.
            </div>
          ) : (
            rooms.map((r) => {
              const isFull = r.humanCount >= r.maxCars;
              const isJoinable = r.status === 'lobby' && !isFull;
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-2 bg-[#0B0D12] border border-white/12 rounded-lg px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white truncate">
                        {r.name}
                      </span>
                      <span className="text-[10px] font-mono-num text-amber-400">
                        #{r.code}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Host: {r.hostName} ·{' '}
                      <span className="font-mono-num text-slate-200">
                        {r.humanCount}/{r.maxCars}
                      </span>{' '}
                      puestos ·{' '}
                      {r.status === 'lobby' ? 'En espera' : 'En curso'}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!isConnected || !isJoinable}
                    onClick={() => onJoinRoom(r.id)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md shrink-0 transition-colors ${
                      isJoinable
                        ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    {r.status !== 'lobby'
                      ? 'En juego'
                      : isFull
                        ? 'Llena'
                        : 'Entrar'}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
