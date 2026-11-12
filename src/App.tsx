/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHud } from './components/GameHud';
import { GameOverModal, PauseModal } from './components/ModalOverlays';
import { TitleOverlay } from './components/TitleOverlay';
import { DerbyEngine } from './game/engine';
import {
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
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleStart = useCallback(() => {
    setSummary(null);
    engineRef.current?.startMatch(config);
  }, [config]);

  const handleRestart = useCallback(() => {
    setSummary(null);
    engineRef.current?.restartMatch();
  }, []);

  const handleExitToTitle = useCallback(() => {
    setSummary(null);
    engineRef.current?.returnToTitle();
  }, []);

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
          onRestart={handleRestart}
          onExitToTitle={handleExitToTitle}
        />
      )}
    </div>
  );
}
