import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Flame, Disc, ArrowUp, ArrowDown, Smartphone, Maximize2 } from 'lucide-react';
import { CarInput } from '../game/physics';

export function detectTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia?.('(pointer: coarse)').matches === true
  );
}

export async function requestMobileLandscapeFullscreen(): Promise<void> {
  try {
    const docEl = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    if (!document.fullscreenElement) {
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen();
      } else if (docEl.webkitRequestFullscreen) {
        await docEl.webkitRequestFullscreen();
      }
    }
  } catch {
    // Fullscreen might be restricted by iframe or browser policy
  }

  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: string) => Promise<void>;
    };
    if (orientation && typeof orientation.lock === 'function') {
      await orientation.lock('landscape');
    }
  } catch {
    // Orientation lock not supported on this device/browser
  }
}

interface TouchControlsProps {
  onUpdateInput: (input: Partial<CarInput>) => void;
}

const JOY_RADIUS = 52;

export const TouchControls: React.FC<TouchControlsProps> = ({
  onUpdateInput,
}) => {
  const zoneRef = useRef<HTMLDivElement | null>(null);
  const joyPointerIdRef = useRef<number | null>(null);
  const joyOriginRef = useRef<{ x: number; y: number }>({ x: 96, y: 96 });

  const [joyActive, setJoyActive] = useState(false);
  const [joyBasePos, setJoyBasePos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [joyKnobOffset, setJoyKnobOffset] = useState<{ dx: number; dy: number }>(
    { dx: 0, dy: 0 },
  );

  // Track right-hand pedal states in refs for instant combination & single-thumb sliding
  const gasHeldRef = useRef(false);
  const brakeHeldRef = useRef(false);
  const nitroHeldRef = useRef(false);
  const driftHeldRef = useRef(false);
  const joySteerRef = useRef(0);
  const joyThrottleRef = useRef(0);

  // Refs to button elements for continuous single-thumb slide detection (ACELERAR -> NITRO / DERRAPE)
  const gasBtnRef = useRef<HTMLDivElement | null>(null);
  const nitroBtnRef = useRef<HTMLDivElement | null>(null);
  const driftBtnRef = useRef<HTMLDivElement | null>(null);
  const brakeBtnRef = useRef<HTMLDivElement | null>(null);
  const activePedalPointersRef = useRef<
    Map<number, 'gas' | 'nitro' | 'drift' | 'brake'>
  >(new Map());

  const [gasHeld, setGasHeld] = useState(false);
  const [brakeHeld, setBrakeHeld] = useState(false);
  const [nitroHeld, setNitroHeld] = useState(false);
  const [driftHeld, setDriftHeld] = useState(false);

  const emitCombined = useCallback(() => {
    let throttle = 0;
    // NITRO always includes full forward throttle (ACELERAR + TURBO),
    // and DERRAPE (when not holding brake) also maintains forward throttle so single-thumb drifts don't stall
    const wantsForwardGas =
      gasHeldRef.current ||
      nitroHeldRef.current ||
      (driftHeldRef.current && !brakeHeldRef.current);

    if (wantsForwardGas && !brakeHeldRef.current) {
      throttle = 1;
    } else if (brakeHeldRef.current && !gasHeldRef.current && !nitroHeldRef.current) {
      throttle = -1;
    } else if (wantsForwardGas && brakeHeldRef.current) {
      throttle = 1;
    } else {
      // Fallback: pushing the floating joystick strongly up/down also accelerates/reverses
      throttle = joyThrottleRef.current;
    }

    onUpdateInput({
      throttle,
      steer: joySteerRef.current,
      nitro: nitroHeldRef.current,
      handbrake: driftHeldRef.current,
    });
  }, [onUpdateInput]);

  useEffect(() => {
    return () => {
      onUpdateInput({
        throttle: 0,
        steer: 0,
        nitro: false,
        handbrake: false,
      });
    };
  }, [onUpdateInput]);

  const updateJoystickFromPoint = useCallback(
    (clientX: number, clientY: number) => {
      const origin = joyOriginRef.current;
      const rawDx = clientX - origin.x;
      const rawDy = clientY - origin.y;
      const dist = Math.hypot(rawDx, rawDy);
      const clampedDist = Math.min(dist, JOY_RADIUS);
      const angle = Math.atan2(rawDy, rawDx);

      const dx = Math.cos(angle) * clampedDist;
      const dy = Math.sin(angle) * clampedDist;

      setJoyKnobOffset({ dx, dy });

      // Horizontal axis -> Steer (+1 is left, -1 is right in physics engine)
      const normX = dx / JOY_RADIUS;
      const deadzone = 0.09;
      let steer = 0;
      if (Math.abs(normX) > deadzone) {
        const sign = normX > 0 ? -1 : 1; // right drag (normX > 0) => steer -1; left drag (normX < 0) => steer +1
        const mag = (Math.abs(normX) - deadzone) / (1 - deadzone);
        steer = sign * Math.min(1, mag * 1.12);
      }
      joySteerRef.current = steer;

      // Vertical axis -> Subtle single-stick throttle fallback if pedals aren't pressed
      const normY = -dy / JOY_RADIUS; // up is +1, down is -1
      if (Math.abs(normY) > 0.36) {
        joyThrottleRef.current = normY > 0 ? 1 : -1;
      } else {
        joyThrottleRef.current = 0;
      }

      emitCombined();
    },
    [emitCombined],
  );

  const handleJoyPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (joyPointerIdRef.current !== null) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);

    const rect = zoneRef.current?.getBoundingClientRect();
    const localX = rect ? e.clientX - rect.left : e.clientX;
    const localY = rect ? e.clientY - rect.top : e.clientY;

    joyPointerIdRef.current = e.pointerId;
    joyOriginRef.current = { x: e.clientX, y: e.clientY };
    setJoyBasePos({ x: localX, y: localY });
    setJoyKnobOffset({ dx: 0, dy: 0 });
    setJoyActive(true);
    joySteerRef.current = 0;
    joyThrottleRef.current = 0;
    emitCombined();
  };

  const handleJoyPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (joyPointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    updateJoystickFromPoint(e.clientX, e.clientY);
  };

  const handleJoyPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (joyPointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    joyPointerIdRef.current = null;
    setJoyActive(false);
    setJoyBasePos(null);
    setJoyKnobOffset({ dx: 0, dy: 0 });
    joySteerRef.current = 0;
    joyThrottleRef.current = 0;
    emitCombined();
  };

  // Evaluate which right-hand pedal zone a touch point is inside (with generous hit padding & vertical slide clamping)
  const hitTestPedal = (
    clientX: number,
    clientY: number,
    isMovingExistingPointer = false,
  ): 'gas' | 'nitro' | 'drift' | 'brake' | null => {
    const checkRect = (el: HTMLDivElement | null, pad = 10) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return (
        clientX >= r.left - pad &&
        clientX <= r.right + pad &&
        clientY >= r.top - pad &&
        clientY <= r.bottom + pad
      );
    };

    // 1. Exact bounding box checks first
    if (checkRect(nitroBtnRef.current, 0)) return 'nitro';
    if (checkRect(gasBtnRef.current, 0)) return 'gas';
    if (checkRect(brakeBtnRef.current, 0)) return 'brake';
    if (checkRect(driftBtnRef.current, 0)) return 'drift';

    // 2. When sliding an active thumb vertically along the 3-stage throttle column,
    // clamp upward overshoots to NITRO and downward overshoots to REVERSA so the thumb never slips off
    if (
      isMovingExistingPointer &&
      nitroBtnRef.current &&
      gasBtnRef.current &&
      brakeBtnRef.current
    ) {
      const nitroRect = nitroBtnRef.current.getBoundingClientRect();
      const gasRect = gasBtnRef.current.getBoundingClientRect();
      const brakeRect = brakeBtnRef.current.getBoundingClientRect();

      // Check if thumb is horizontally within or right of the 3-stage column
      if (clientX >= gasRect.left - 18 && clientX <= gasRect.right + 40) {
        const nitroBoundaryY = (nitroRect.bottom + gasRect.top) / 2;
        const brakeBoundaryY = (gasRect.bottom + brakeRect.top) / 2;

        if (clientY < nitroBoundaryY) return 'nitro';
        if (clientY > brakeBoundaryY) return 'brake';
        return 'gas';
      }
    }

    // 3. Padded bounds for initial touch and lateral slide into DERRAPE
    if (checkRect(nitroBtnRef.current, 14)) return 'nitro';
    if (checkRect(gasBtnRef.current, 14)) return 'gas';
    if (checkRect(brakeBtnRef.current, 14)) return 'brake';
    if (checkRect(driftBtnRef.current, 14)) return 'drift';

    return null;
  };

  const syncPedalStatesFromPointers = () => {
    let hasGas = false;
    let hasNitro = false;
    let hasDrift = false;
    let hasBrake = false;

    for (const action of activePedalPointersRef.current.values()) {
      if (action === 'gas') hasGas = true;
      if (action === 'nitro') {
        hasNitro = true;
        hasGas = true; // Nitro automatically holds accelerator
      }
      if (action === 'drift') hasDrift = true;
      if (action === 'brake') hasBrake = true;
    }

    gasHeldRef.current = hasGas;
    nitroHeldRef.current = hasNitro;
    driftHeldRef.current = hasDrift;
    brakeHeldRef.current = hasBrake;

    setGasHeld(hasGas);
    setNitroHeld(hasNitro);
    setDriftHeld(hasDrift);
    setBrakeHeld(hasBrake);

    emitCombined();
  };

  const handlePedalClusterPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
  ) => {
    const hit = hitTestPedal(e.clientX, e.clientY, false);
    if (!hit) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    activePedalPointersRef.current.set(e.pointerId, hit);
    syncPedalStatesFromPointers();
  };

  const handlePedalClusterPointerMove = (
    e: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!activePedalPointersRef.current.has(e.pointerId)) return;
    e.preventDefault();
    const hit = hitTestPedal(e.clientX, e.clientY, true);
    if (hit) {
      const prev = activePedalPointersRef.current.get(e.pointerId);
      if (prev !== hit) {
        activePedalPointersRef.current.set(e.pointerId, hit);
        syncPedalStatesFromPointers();
      }
    }
  };

  const handlePedalClusterPointerUp = (
    e: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!activePedalPointersRef.current.has(e.pointerId)) return;
    e.preventDefault();
    activePedalPointersRef.current.delete(e.pointerId);
    syncPedalStatesFromPointers();
  };

  return (
    <div
      className="fixed inset-0 z-20 pointer-events-none select-none overflow-hidden"
      style={{ touchAction: 'none' }}
    >
      {/* LEFT HALF: Floating Analog Steering Joystick Touch Area */}
      <div
        ref={zoneRef}
        onPointerDown={handleJoyPointerDown}
        onPointerMove={handleJoyPointerMove}
        onPointerUp={handleJoyPointerUp}
        onPointerCancel={handleJoyPointerUp}
        onLostPointerCapture={handleJoyPointerUp}
        className="absolute left-0 bottom-0 w-[46%] h-[68%] pointer-events-auto"
        style={{ touchAction: 'none' }}
        aria-label="Joystick flotante de dirección"
      >
        {/* Visual Joystick Base (floats to touch point when active, rests at bottom-left when idle) */}
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 transition-opacity duration-100"
          style={
            joyActive && joyBasePos
              ? {
                  left: `${joyBasePos.x}px`,
                  top: `${joyBasePos.y}px`,
                }
              : {
                  left: '92px',
                  bottom: '22px',
                }
          }
        >
          <div
            className={`relative w-28 h-28 rounded-full border-2 flex items-center justify-center ${
              joyActive
                ? 'bg-[#0E1117]/80 border-amber-400/80 shadow-[0_0_24px_rgba(245,158,11,0.3)]'
                : 'bg-[#0E1117]/55 border-white/25'
            }`}
          >
            {/* Subtle directional ticks */}
            <span className="absolute left-2.5 text-[10px] font-mono-num font-bold text-white/45">
              ◄
            </span>
            <span className="absolute right-2.5 text-[10px] font-mono-num font-bold text-white/45">
              ►
            </span>
            <span className="absolute top-2 text-[9px] font-mono-num text-white/35">
              ▲
            </span>
            <span className="absolute bottom-2 text-[9px] font-mono-num text-white/35">
              ▼
            </span>

            {/* Movable Thumb Stick Knob */}
            <div
              className={`w-12 h-12 rounded-full border-2 flex items-center justify-center ${
                joyActive
                  ? 'bg-amber-400 border-white text-slate-950 shadow-lg'
                  : 'bg-slate-200/85 border-white/70 text-slate-900'
              }`}
              style={{
                transform: `translate3d(${joyKnobOffset.dx}px, ${joyKnobOffset.dy}px, 0)`,
              }}
            >
              <div className="w-4 h-4 rounded-full bg-slate-950/30" />
            </div>
          </div>

          {!joyActive && (
            <div className="mt-1 text-center text-[10px] font-semibold tracking-wider text-slate-300/80 uppercase">
              Dirección
            </div>
          )}
        </div>
      </div>

      {/* RIGHT CORNER: 3-Stage Vertical Slide Pedal (Up = NITRO, Center = ACELERAR, Down = REVERSA) + DERRAPE */}
      <div
        onPointerDown={handlePedalClusterPointerDown}
        onPointerMove={handlePedalClusterPointerMove}
        onPointerUp={handlePedalClusterPointerUp}
        onPointerCancel={handlePedalClusterPointerUp}
        onLostPointerCapture={handlePedalClusterPointerUp}
        className="absolute right-3.5 bottom-3 flex items-center gap-2.5 pointer-events-auto p-2 -m-2"
        style={{ touchAction: 'none' }}
      >
        {/* Left Button: DERRAPE (Slide left or tap to drift with power) */}
        <div
          ref={driftBtnRef}
          role="button"
          aria-label="Freno de mano y derrape con aceleración"
          className={`w-20 h-20 rounded-2xl border-2 flex flex-col items-center justify-center gap-1 transition-transform ${
            driftHeld
              ? 'scale-95 bg-amber-500 border-white text-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.55)]'
              : 'bg-[#0E1117]/82 border-amber-400/55 text-amber-300'
          }`}
        >
          <Disc className="w-5 h-5" />
          <span className="font-display font-bold text-xs tracking-wide leading-none">
            DERRAPE
          </span>
          <span
            className={`text-[8px] font-mono-num font-bold uppercase leading-none ${
              driftHeld ? 'text-slate-900' : 'text-amber-200/70'
            }`}
          >
            ◄ Deslizá
          </span>
        </div>

        {/* Right Column: Connected 3-Stage Vertical Pedal (NITRO ▲ / ACELERAR / ▼ REVERSA) */}
        <div className="flex flex-col items-center shadow-2xl">
          {/* Top Stage: NITRO + ACELERADOR INTEGRADO */}
          <div
            ref={nitroBtnRef}
            role="button"
            aria-label="Acelerar con Nitro"
            className={`w-24 h-14 rounded-t-2xl border-2 flex flex-col items-center justify-center gap-0.5 transition-transform ${
              nitroHeld
                ? 'bg-cyan-400 border-white text-slate-950 shadow-[0_0_24px_rgba(34,211,238,0.75)]'
                : 'bg-[#0E1117]/85 border-cyan-400/65 text-cyan-300'
            }`}
          >
            <div className="flex items-center gap-1">
              <Flame className="w-4 h-4 fill-current" />
              <span className="font-display font-bold text-xs tracking-wide leading-none">
                NITRO
              </span>
            </div>
            <span
              className={`text-[8px] font-semibold tracking-tight leading-none ${
                nitroHeld ? 'text-slate-900' : 'text-cyan-200/80'
              }`}
            >
              + ACELERADOR
            </span>
          </div>

          {/* Upper Slide Bridge Indicator (ACELERAR -> NITRO) */}
          <div
            className={`w-24 py-0.5 text-center text-[8px] font-mono-num font-bold tracking-wider uppercase border-x-2 ${
              nitroHeld
                ? 'bg-cyan-300 border-white text-slate-950'
                : gasHeld
                  ? 'bg-emerald-500/35 border-emerald-400/65 text-emerald-200'
                  : 'bg-[#0E1117]/90 border-white/15 text-slate-400'
            }`}
          >
            ▲ Deslizá Turbo
          </div>

          {/* Center Stage: ACELERAR (Main Thumb Resting Pedal) */}
          <div
            ref={gasBtnRef}
            role="button"
            aria-label="Acelerar"
            className={`w-24 h-20 border-x-2 border-y flex flex-col items-center justify-center gap-0.5 transition-transform ${
              gasHeld && !nitroHeld
                ? 'bg-emerald-400 border-white text-slate-950 shadow-[0_0_24px_rgba(52,211,153,0.6)]'
                : nitroHeld
                  ? 'bg-emerald-500/80 border-white text-slate-950'
                  : 'bg-[#0E1117]/88 border-emerald-400/65 text-emerald-300'
            }`}
          >
            <ArrowUp className="w-5 h-5 stroke-[2.5]" />
            <span className="font-display font-bold text-sm tracking-wide leading-none">
              ACELERAR
            </span>
          </div>

          {/* Lower Slide Bridge Indicator (ACELERAR -> REVERSA) */}
          <div
            className={`w-24 py-0.5 text-center text-[8px] font-mono-num font-bold tracking-wider uppercase border-x-2 ${
              brakeHeld
                ? 'bg-red-400 border-white text-slate-950'
                : gasHeld
                  ? 'bg-red-500/25 border-red-400/50 text-red-200'
                  : 'bg-[#0E1117]/90 border-white/15 text-slate-400'
            }`}
          >
            ▼ Deslizá Atrás
          </div>

          {/* Bottom Stage: FRENO / MARCHA ATRÁS (REVERSA) */}
          <div
            ref={brakeBtnRef}
            role="button"
            aria-label="Freno y marcha atrás"
            className={`w-24 h-14 rounded-b-2xl border-2 flex flex-col items-center justify-center gap-0.5 transition-transform ${
              brakeHeld
                ? 'bg-red-500 border-white text-white shadow-[0_0_22px_rgba(239,68,68,0.65)]'
                : 'bg-[#0E1117]/85 border-red-400/60 text-red-300'
            }`}
          >
            <div className="flex items-center gap-1">
              <ArrowDown className="w-4 h-4 stroke-[2.5]" />
              <span className="font-display font-bold text-xs tracking-wide leading-none">
                REVERSA
              </span>
            </div>
            <span
              className={`text-[8px] font-semibold tracking-tight leading-none ${
                brakeHeld ? 'text-white/90' : 'text-red-200/80'
              }`}
            >
              FRENO / ATRÁS
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

interface LandscapePromptBannerProps {
  onDismiss: () => void;
}

export const LandscapePromptBanner: React.FC<LandscapePromptBannerProps> = ({
  onDismiss,
}) => {
  const handleLockLandscape = async () => {
    await requestMobileLandscapeFullscreen();
    onDismiss();
  };

  return (
    <div className="fixed inset-x-3 top-3 z-50 pointer-events-auto flex items-center justify-between gap-3 bg-[#11151E]/95 border border-amber-400/60 rounded-xl px-4 py-3 shadow-2xl">
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
          <Smartphone className="w-5 h-5 rotate-90" />
        </div>
        <div className="min-w-0">
          <div className="font-display font-bold text-xs text-white uppercase tracking-wide">
            Modo Horizontal Recomendado
          </div>
          <p className="text-[11px] text-slate-300 truncate">
            Girá el celular o activá pantalla completa para usar el joystick y pedales.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleLockLandscape}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xs rounded-lg cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span>Horizontal</span>
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="px-2 py-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
          aria-label="Cerrar aviso"
        >
          ✕
        </button>
      </div>
    </div>
  );
};
