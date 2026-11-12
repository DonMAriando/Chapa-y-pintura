export type GameMode = '1p' | '2p' | 'online';

export type GamePhase =
  | 'title'
  | 'countdown'
  | 'playing'
  | 'paused'
  | 'gameover';

export type CarColorId = 'amber' | 'crimson' | 'cobalt' | 'emerald' | 'steel' | 'violet';

export interface CarColorOption {
  id: CarColorId;
  label: string;
  primaryHex: string;
  stripeHex: string;
  numberText: string;
}

export const CAR_COLORS: CarColorOption[] = [
  {
    id: 'amber',
    label: 'Ámbar Rayo',
    primaryHex: '#F59E0B',
    stripeHex: '#18181B',
    numberText: '#FFFFFF',
  },
  {
    id: 'crimson',
    label: 'Rojo Furia',
    primaryHex: '#DC2626',
    stripeHex: '#F8FAFC',
    numberText: '#111827',
  },
  {
    id: 'cobalt',
    label: 'Azul Turbo',
    primaryHex: '#2563EB',
    stripeHex: '#FACC15',
    numberText: '#0F172A',
  },
  {
    id: 'emerald',
    label: 'Verde Táctico',
    primaryHex: '#10B981',
    stripeHex: '#111827',
    numberText: '#FFFFFF',
  },
  {
    id: 'steel',
    label: 'Acero Crudo',
    primaryHex: '#64748B',
    stripeHex: '#F97316',
    numberText: '#FFFFFF',
  },
  {
    id: 'violet',
    label: 'Púrpura Nitro',
    primaryHex: '#9333EA',
    stripeHex: '#22D3EE',
    numberText: '#0F172A',
  },
];

export type DebrisPartType =
  | 'hood'
  | 'trunk'
  | 'bumperF'
  | 'bumperR'
  | 'doorL'
  | 'doorR'
  | 'spoiler';

export interface CarDamageZones {
  front: number; // 0 (intact) .. 1 (crushed)
  rear: number;
  left: number;
  right: number;
}

export interface PlayerHudState {
  id: string;
  name: string;
  numberLabel: string;
  colorHex: string;
  hp: number; // 0..100
  nitro: number; // 0..100
  speedKmh: number;
  isBoosting: boolean;
  isDrifting: boolean;
  isAirborne: boolean;
  wrecked: boolean;
  kills: number;
  damageDealt: number;
  zones: CarDamageZones;
  detachedCount: number;
  spectatingName?: string;
}

export interface CalloutEvent {
  id: number;
  text: string;
  subtext?: string;
  tone: 'impact' | 'wreck' | 'nitro' | 'air';
  targetViewport: 'all' | 'p1' | 'p2';
}

export interface GameHudSnapshot {
  phase: GamePhase;
  mode: GameMode;
  countdownValue: number; // 3, 2, 1, 0 (GO)
  aliveCount: number;
  totalCars: number;
  elapsedSeconds: number;
  players: PlayerHudState[];
  callout: CalloutEvent | null;
}

export interface MatchSummary {
  winnerName: string;
  winnerId: string | null;
  winnerColorHex: string;
  isPlayerWin: boolean;
  durationSeconds: number;
  peakImpactKmh: number;
  totalPartsDetached: number;
  standings: {
    id: string;
    name: string;
    numberLabel: string;
    colorHex: string;
    isPlayer: boolean;
    kills: number;
    damageDealt: number;
    hp: number;
    wrecked: boolean;
  }[];
}

export interface StartMatchConfig {
  mode: GameMode;
  p1Color: CarColorId;
  p2Color: CarColorId;
  aiCount: number;
}
