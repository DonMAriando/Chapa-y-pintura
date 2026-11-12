import {
  CalloutEvent,
  CarColorId,
  CarDamageZones,
  DebrisPartType,
  MatchSummary,
} from './types';

export type RoomStatus = 'lobby' | 'countdown' | 'playing' | 'gameover';

export interface RoomSlot {
  slotIndex: number;
  occupantType: 'human' | 'empty';
  playerId: string | null;
  name: string | null;
  colorId: CarColorId;
  isHost: boolean;
}

export interface RoomSummary {
  id: string;
  code: string;
  name: string;
  hostName: string;
  maxCars: number;
  humanCount: number;
  status: RoomStatus;
}

export interface RoomState {
  id: string;
  code: string;
  name: string;
  hostPlayerId: string;
  maxCars: number;
  status: RoomStatus;
  slots: RoomSlot[];
}

export interface NetCarState {
  id: string;
  slotIndex: number;
  name: string;
  numberLabel: string;
  colorId: CarColorId;
  isHuman: boolean;
  ownerPlayerId: string | null;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  angVel: number;
  pitch: number;
  roll: number;
  grounded: boolean;
  hp: number;
  nitro: number;
  isBoosting: boolean;
  isDrifting: boolean;
  braking: boolean;
  visualSteer: number;
  wrecked: boolean;
  kills: number;
  damageDealt: number;
  zones: CarDamageZones;
  attachedParts: DebrisPartType[];
}

export interface NetImpactEvent {
  hitX: number;
  hitY: number;
  hitZ: number;
  normX: number;
  normZ: number;
  strength: number;
  closingKmh: number;
  victimId: string;
  attackerId: string | null;
  damage: number;
  detachedParts: DebrisPartType[];
  wreckedNow: boolean;
  sparkCount: number;
}

export interface NetStateSnapshot {
  phase: 'countdown' | 'playing' | 'gameover';
  countdownValue: number;
  elapsedSeconds: number;
  aliveCount: number;
  totalCars: number;
  cars: NetCarState[];
  nitroPadCooldowns: number[];
  impacts: NetImpactEvent[];
  nitroPickups: string[];
  callout: CalloutEvent | null;
  summary?: MatchSummary;
}

export interface NetInputPayload {
  throttle: number;
  steer: number;
  handbrake: boolean;
  nitro: boolean;
}

export type ClientToServerMessage =
  | { type: 'rooms:list' }
  | {
      type: 'room:create';
      roomName: string;
      maxCars: number;
      playerName: string;
      colorId: CarColorId;
    }
  | {
      type: 'room:join';
      roomId: string;
      playerName: string;
      colorId: CarColorId;
    }
  | {
      type: 'room:join_by_code';
      code: string;
      playerName: string;
      colorId: CarColorId;
    }
  | { type: 'room:leave' }
  | {
      type: 'room:update_seat';
      colorId?: CarColorId;
      playerName?: string;
      targetSlotIndex?: number;
    }
  | { type: 'room:update_max_cars'; maxCars: number }
  | { type: 'room:start' }
  | { type: 'room:return_lobby' }
  | { type: 'game:input'; input: NetInputPayload };

export type ServerToClientMessage =
  | { type: 'welcome'; playerId: string; rooms: RoomSummary[] }
  | { type: 'rooms:updated'; rooms: RoomSummary[] }
  | { type: 'room:joined'; room: RoomState; yourPlayerId: string }
  | { type: 'room:state'; room: RoomState }
  | { type: 'room:left'; reason?: string }
  | { type: 'room:error'; message: string }
  | {
      type: 'game:started';
      room: RoomState;
      yourCarId: string;
      cars: NetCarState[];
    }
  | { type: 'game:snapshot'; snapshot: NetStateSnapshot }
  | { type: 'game:countdown_tick'; step: number; go: boolean };
