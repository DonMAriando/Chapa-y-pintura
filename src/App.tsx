/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHud } from './components/GameHud';
import { GameOverModal, PauseModal } from './components/ModalOverlays';
import { TitleOverlay } from './components/TitleOverlay';
import { DerbyEngine } from './game/engine';
import { RoomState, RoomSummary } from './game/multiplayerTypes';
import { DerbyNetClient, NetConnectionStatus } from './game/netClient';
import {
  CarColorId,
  GameHudSnapshot,
  MatchSummary,
  StartMatchConfig,
} from './game/types';

const INITIAL_HUD: GameHudSnapshot = {
  phase: 'title',
  mode: '1p',
  countdownValue: 0,
  aliveCount: 6,
  totalCars: 6,
  elapsedSeconds: 0,
  players: [],
  callout: null,
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<DerbyEngine | null>(null);
  const netClientRef = useRef<DerbyNetClient | null>(null);

  const [config, setConfig] = useState<StartMatchConfig>({
    mode: '1p',
    p1Color: 'amber',
    p2Color: 'cobalt',
    aiCount: 5,
  });
  const [hud, setHud] = useState<GameHudSnapshot>(INITIAL_HUD);
  const [summary, setSummary] = useState<MatchSummary | null>(null);
  const [muted, setMuted] = useState(false);
  const [musicMuted, setMusicMuted] = useState(false);
  const [contextLost, setContextLost] = useState(false);

  // Multiplayer room state
  const [netStatus, setNetStatus] =
    useState<NetConnectionStatus>('disconnected');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState('Piloto');
  const [playerColor, setPlayerColor] = useState<CarColorId>('amber');
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [currentRoom, setCurrentRoom] = useState<RoomState | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const engine = new DerbyEngine(mount, {
      onHudUpdate: (snapshot) => {
        setHud(snapshot);
      },
      onMatchEnd: (matchSummary) => {
        setSummary(matchSummary);
      },
      onContextLost: (lost) => {
        setContextLost(lost);
      },
      onOnlineInput: (input) => {
        netClientRef.current?.sendInput(input);
      },
    });
    engineRef.current = engine;

    const net = new DerbyNetClient({
      onStatusChange: (status) => {
        setNetStatus(status);
      },
      onWelcome: (id, initialRooms) => {
        setPlayerId(id);
        setRooms(initialRooms);
      },
      onRoomsUpdated: (updatedRooms) => {
        setRooms(updatedRooms);
      },
      onRoomJoined: (room, yourId) => {
        setPlayerId(yourId);
        setCurrentRoom(room);
        setRoomError(null);
      },
      onRoomState: (room) => {
        setCurrentRoom(room);
        if (room.status === 'lobby') {
          setSummary(null);
          engineRef.current?.returnToTitle();
        }
      },
      onRoomLeft: () => {
        setCurrentRoom(null);
      },
      onRoomError: (message) => {
        setRoomError(message);
      },
      onGameStarted: (room, yourCarId, cars) => {
        setRoomError(null);
        setSummary(null);
        setCurrentRoom(room);
        engineRef.current?.startMultiplayerMatch(cars, yourCarId);
      },
      onGameSnapshot: (snapshot) => {
        engineRef.current?.applyNetworkSnapshot(snapshot);
      },
      onCountdownTick: (step, go) => {
        engineRef.current?.playOnlineCountdownTick(step, go);
      },
    });
    netClientRef.current = net;

    return () => {
      net.dispose();
      netClientRef.current = null;
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Connect WebSocket when user opens the Multijugador tab
  useEffect(() => {
    if (config.mode === 'online') {
      netClientRef.current?.connect();
    }
  }, [config.mode]);

  const handleStart = useCallback(() => {
    if (config.mode === 'online') return;
    setSummary(null);
    engineRef.current?.startMatch(config);
  }, [config]);

  const handleRestart = useCallback(() => {
    setSummary(null);
    engineRef.current?.restartMatch();
  }, []);

  const handleExitToTitle = useCallback(() => {
    if (hud.mode === 'online') {
      netClientRef.current?.leaveRoom();
      setCurrentRoom(null);
    }
    setSummary(null);
    engineRef.current?.returnToTitle();
  }, [hud.mode]);

  const handlePause = useCallback(() => {
    engineRef.current?.setPaused(true);
  }, []);

  const handleResume = useCallback(() => {
    engineRef.current?.setPaused(false);
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      engineRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const handleToggleMusic = useCallback(() => {
    setMusicMuted((prev) => {
      const next = !prev;
      engineRef.current?.setMusicMuted(next);
      return next;
    });
  }, []);

  // Multiplayer room callbacks
  const handleChangePlayerColor = useCallback(
    (colorId: CarColorId) => {
      setPlayerColor(colorId);
      if (currentRoom) {
        netClientRef.current?.updateSeat({ colorId });
      }
    },
    [currentRoom],
  );

  const handleCreateRoom = useCallback(
    (roomName: string, maxCars: number) => {
      setRoomError(null);
      netClientRef.current?.createRoom(
        roomName,
        maxCars,
        playerName,
        playerColor,
      );
    },
    [playerName, playerColor],
  );

  const handleJoinRoom = useCallback(
    (roomId: string) => {
      setRoomError(null);
      netClientRef.current?.joinRoom(roomId, playerName, playerColor);
    },
    [playerName, playerColor],
  );

  const handleJoinByCode = useCallback(
    (code: string) => {
      setRoomError(null);
      netClientRef.current?.joinByCode(code, playerName, playerColor);
    },
    [playerName, playerColor],
  );

  const handleLeaveRoom = useCallback(() => {
    setRoomError(null);
    netClientRef.current?.leaveRoom();
    setCurrentRoom(null);
  }, []);

  const handleSwitchSlot = useCallback((targetSlotIndex: number) => {
    netClientRef.current?.updateSeat({ targetSlotIndex });
  }, []);

  const handleUpdateMaxCars = useCallback((maxCars: number) => {
    netClientRef.current?.updateMaxCars(maxCars);
  }, []);

  const handleStartRoomMatch = useCallback(() => {
    setRoomError(null);
    netClientRef.current?.startMatch();
  }, []);

  const handleReturnToRoomLobby = useCallback(() => {
    setSummary(null);
    netClientRef.current?.returnToLobby();
  }, []);

  const isHostInRoom = Boolean(
    currentRoom && playerId && currentRoom.hostPlayerId === playerId,
  );

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0B0D12]">
      {/* Isolated WebGL canvas container (never re-rendered by React state) */}
      <div
        ref={canvasMountRef}
        className="absolute inset-0 w-full h-full"
        aria-label="Arena 3D de Destruction Derby"
      />

      {contextLost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0D12]/95 text-center p-6">
          <div className="max-w-sm space-y-2">
            <h2 className="font-display font-bold text-xl text-white">
              Contexto gráfico WebGL suspendido
            </h2>
            <p className="text-sm text-slate-300">
              Restaurando el motor 3D de la arena...
            </p>
          </div>
        </div>
      )}

      {hud.phase === 'title' && (
        <TitleOverlay
          config={config}
          muted={muted}
          musicMuted={musicMuted}
          onChangeConfig={setConfig}
          onStart={handleStart}
          onToggleMute={handleToggleMute}
          onToggleMusic={handleToggleMusic}
          netStatus={netStatus}
          playerId={playerId}
          playerName={playerName}
          playerColor={playerColor}
          rooms={rooms}
          currentRoom={currentRoom}
          roomError={roomError}
          onChangePlayerName={setPlayerName}
          onChangePlayerColor={handleChangePlayerColor}
          onRefreshRooms={() => netClientRef.current?.refreshRooms()}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onJoinByCode={handleJoinByCode}
          onLeaveRoom={handleLeaveRoom}
          onSwitchSlot={handleSwitchSlot}
          onUpdateMaxCars={handleUpdateMaxCars}
          onStartRoomMatch={handleStartRoomMatch}
          onClearError={() => setRoomError(null)}
        />
      )}

      {(hud.phase === 'countdown' || hud.phase === 'playing') && (
        <GameHud
          snapshot={hud}
          muted={muted}
          musicMuted={musicMuted}
          onPause={handlePause}
          onToggleMute={handleToggleMute}
          onToggleMusic={handleToggleMusic}
        />
      )}

      {hud.phase === 'paused' && (
        <PauseModal
          mode={hud.mode}
          muted={muted}
          musicMuted={musicMuted}
          onResume={handleResume}
          onRestart={handleRestart}
          onExitToTitle={handleExitToTitle}
          onToggleMute={handleToggleMute}
          onToggleMusic={handleToggleMusic}
        />
      )}

      {hud.phase === 'gameover' && summary && (
        <GameOverModal
          summary={summary}
          isOnline={hud.mode === 'online'}
          isHost={isHostInRoom}
          onRestart={handleRestart}
          onReturnToLobby={handleReturnToRoomLobby}
          onExitToTitle={handleExitToTitle}
        />
      )}
    </div>
  );
}
