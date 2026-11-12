import {
  ClientToServerMessage,
  NetCarState,
  NetInputPayload,
  NetStateSnapshot,
  RoomState,
  RoomSummary,
  ServerToClientMessage,
} from './multiplayerTypes';
import { CarColorId } from './types';

export type NetConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export interface NetClientCallbacks {
  onStatusChange: (status: NetConnectionStatus) => void;
  onWelcome: (playerId: string, rooms: RoomSummary[]) => void;
  onRoomsUpdated: (rooms: RoomSummary[]) => void;
  onRoomJoined: (room: RoomState, yourPlayerId: string) => void;
  onRoomState: (room: RoomState) => void;
  onRoomLeft: (reason?: string) => void;
  onRoomError: (message: string) => void;
  onGameStarted: (
    room: RoomState,
    yourCarId: string,
    cars: NetCarState[],
  ) => void;
  onGameSnapshot: (snapshot: NetStateSnapshot) => void;
  onCountdownTick: (step: number, go: boolean) => void;
}

export class DerbyNetClient {
  private ws: WebSocket | null = null;
  private callbacks: NetClientCallbacks;
  private reconnectTimer: number | null = null;
  private disposed = false;
  private status: NetConnectionStatus = 'disconnected';
  private queue: ClientToServerMessage[] = [];

  constructor(callbacks: NetClientCallbacks) {
    this.callbacks = callbacks;
  }

  public connect(): void {
    if (this.disposed) return;
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.setStatus('connecting');
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/ws`;

    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      if (this.disposed) {
        ws.close();
        return;
      }
      this.setStatus('connected');
      while (this.queue.length > 0 && ws.readyState === WebSocket.OPEN) {
        const next = this.queue.shift()!;
        ws.send(JSON.stringify(next));
      }
      this.send({ type: 'rooms:list' });
    };

    ws.onmessage = (ev) => {
      let msg: ServerToClientMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerToClientMessage;
      } catch {
        return;
      }
      this.dispatch(msg);
    };

    ws.onclose = () => {
      if (this.ws === ws) {
        this.ws = null;
      }
      this.setStatus('disconnected');
      if (!this.disposed) {
        this.scheduleReconnect();
      }
    };

    ws.onerror = () => {
      // onclose handles reconnect
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null || this.disposed) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.disposed) {
        this.connect();
      }
    }, 1500);
  }

  private setStatus(s: NetConnectionStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.callbacks.onStatusChange(s);
  }

  private dispatch(msg: ServerToClientMessage): void {
    switch (msg.type) {
      case 'welcome':
        this.callbacks.onWelcome(msg.playerId, msg.rooms);
        break;
      case 'rooms:updated':
        this.callbacks.onRoomsUpdated(msg.rooms);
        break;
      case 'room:joined':
        this.callbacks.onRoomJoined(msg.room, msg.yourPlayerId);
        break;
      case 'room:state':
        this.callbacks.onRoomState(msg.room);
        break;
      case 'room:left':
        this.callbacks.onRoomLeft(msg.reason);
        break;
      case 'room:error':
        this.callbacks.onRoomError(msg.message);
        break;
      case 'game:started':
        this.callbacks.onGameStarted(msg.room, msg.yourCarId, msg.cars);
        break;
      case 'game:snapshot':
        this.callbacks.onGameSnapshot(msg.snapshot);
        break;
      case 'game:countdown_tick':
        this.callbacks.onCountdownTick(msg.step, msg.go);
        break;
    }
  }

  public send(msg: ClientToServerMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else if (msg.type !== 'game:input') {
      this.queue.push(msg);
      this.connect();
    }
  }

  public refreshRooms(): void {
    this.send({ type: 'rooms:list' });
  }

  public createRoom(
    roomName: string,
    maxCars: number,
    playerName: string,
    colorId: CarColorId,
  ): void {
    this.send({
      type: 'room:create',
      roomName,
      maxCars,
      playerName,
      colorId,
    });
  }

  public joinRoom(
    roomId: string,
    playerName: string,
    colorId: CarColorId,
  ): void {
    this.send({
      type: 'room:join',
      roomId,
      playerName,
      colorId,
    });
  }

  public joinByCode(
    code: string,
    playerName: string,
    colorId: CarColorId,
  ): void {
    this.send({
      type: 'room:join_by_code',
      code,
      playerName,
      colorId,
    });
  }

  public leaveRoom(): void {
    this.send({ type: 'room:leave' });
  }

  public updateSeat(params: {
    colorId?: CarColorId;
    playerName?: string;
    targetSlotIndex?: number;
  }): void {
    this.send({
      type: 'room:update_seat',
      ...params,
    });
  }

  public updateMaxCars(maxCars: number): void {
    this.send({ type: 'room:update_max_cars', maxCars });
  }

  public startMatch(): void {
    this.send({ type: 'room:start' });
  }

  public returnToLobby(): void {
    this.send({ type: 'room:return_lobby' });
  }

  public sendInput(input: NetInputPayload): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'game:input', input }));
    }
  }

  public dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
