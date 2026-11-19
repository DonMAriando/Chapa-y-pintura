/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHud } from './components/GameHud';
import { GameOverModal, PauseModal } from './components/ModalOverlays';
import { TitleOverlay } from './components/TitleOverlay';
import {
  detectTouchDevice,
  LandscapePromptBanner,
  requestMobileLandscapeFullscreen,
  TouchControls,
} from './components/TouchControls';
import { DerbyEngine } from './game/engine';
import { RoomState, RoomSummary } from './game/multiplayerTypes';
import { DerbyNetClient, NetConnectionStatus } from './game/netClient';
import { CarInput } from './game/physics';
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

  // Mobile touch & orientation state
  const [isTouchDevice, setIsTouchDevice] = useState<boolean>(() =>
    detectTouchDevice(),
  );
  const [touchControlsEnabled, setTouchControlsEnabled] = useState<boolean>(
    () => detectTouchDevice(),
  );
  const [isPortraitMobile, setIsPortraitMobile] = useState<boolean>(false);
  const [landscapePromptDismissed, setLandscapePromptDismissed] =
    useState<boolean>(false);

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
    const checkViewportAndTouch = () => {
      const touch = detectTouchDevice();
      setIsTouchDevice(touch);
      const w = window.innerWidth;
      const h = window.innerHeight;
      const portrait = (touch || w < 900) && h > w;
      setIsPortraitMobile(portrait);
      if (!portrait) {
        setLandscapePromptDismissed(false);
      }
    };

    const onFirstTouch = () => {
      setIsTouchDevice(true);
      setTouchControlsEnabled(true);
      checkViewportAndTouch();
    };

    checkViewportAndTouch();
    window.addEventListener('resize', checkViewportAndTouch);
    window.addEventListener('orientationchange', checkViewportAndTouch);
    window.addEventListener('touchstart', onFirstTouch, {
      passive: true,
      once: true,
    });

    return () => {
      window.removeEventListener('resize', checkViewportAndTouch);
      window.removeEventListener('orientationchange', checkViewportAndTouch);
      window.removeEventListener('touchstart', onFirstTouch);
    };
  }, []);

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
    if (isTouchDevice) {
      void requestMobileLandscapeFullscreen();
    }
    setSummary(null);
    engineRef.current?.startMatch(config);
  }, [config, isTouchDevice]);

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

  const handleToggleTouchControls = useCallback(() => {
    setTouchControlsEnabled((prev) => {
      const next = !prev;
      if (!next) {
        engineRef.current?.resetTouchInput();
      }
      return next;
    });
  }, []);

  const handleTouchInput = useCallback((input: Partial<CarInput>) => {
    engineRef.current?.setTouchInput(input);
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
    if (isTouchDevice) {
      void requestMobileLandscapeFullscreen();
    }
    netClientRef.current?.startMatch();
  }, [isTouchDevice]);

  const handleReturnToRoomLobby = useCallback(() => {
    setSummary(null);
    netClientRef.current?.returnToLobby();
  }, []);

  const isHostInRoom = Boolean(
    currentRoom && playerId && currentRoom.hostPlayerId === playerId,
  );
  const inActiveMatch =
    hud.phase === 'countdown' || hud.phase === 'playing';

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0B0D12]">
      {/* Isolated WebGL canvas container (never re-rendered by React state) */}
      <div
        ref={canvasMountRef}
        className="absolute inset-0 w-full h-full"
        aria-label="Arena 3D de Destruction Derby"
      />

      {/* Mobile Landscape Prompt Banner when phone is held vertically */}
      {isPortraitMobile && !landscapePromptDismissed && (
        <LandscapePromptBanner
          onDismiss={() => setLandscapePromptDismissed(true)}
        />
      )}

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

      {inActiveMatch && (
        <GameHud
          snapshot={hud}
          muted={muted}
          musicMuted={musicMuted}
          touchControlsEnabled={touchControlsEnabled}
          onPause={handlePause}
          onToggleMute={handleToggleMute}
          onToggleMusic={handleToggleMusic}
          onToggleTouchControls={handleToggleTouchControls}
        />
      )}

      {inActiveMatch && touchControlsEnabled && hud.mode !== '2p' && (
        <TouchControls onUpdateInput={handleTouchInput} />
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
