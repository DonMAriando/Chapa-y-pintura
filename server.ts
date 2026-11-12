import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import {
  ClientToServerMessage,
  NetImpactEvent,
  NetInputPayload,
  NetStateSnapshot,
  RoomSlot,
  RoomState,
  RoomStatus,
  RoomSummary,
  ServerToClientMessage,
} from './src/game/multiplayerTypes';
import {
  buildServerMatchSummary,
  computeBotInput,
  createInitialServerNitroPads,
  createServerCar,
  serializeServerCar,
  ServerCar,
  ServerNitroPad,
  stepServerDerbySimulation,
} from './src/game/serverSim';
import { CalloutEvent, CAR_COLORS, CarColorId } from './src/game/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const TICK_HZ = 30;
const TICK_DT = 1 / TICK_HZ;

const BOT_NAMES = [
  'Toro Negro (IA)',
  'Chispazo (IA)',
  'Demoledor (IA)',
  'Barro Loco (IA)',
  'Chatarra 77 (IA)',
  'Furia V8 (IA)',
  'Martillo (IA)',
  'Óxido Mortal (IA)',
];

interface ClientSession {
  playerId: string;
  ws: WebSocket;
  roomId: string | null;
  playerName: string;
  latestInput: NetInputPayload;
}

interface ServerRoom {
  id: string;
  code: string;
  name: string;
  hostPlayerId: string;
  maxCars: number;
  status: RoomStatus;
  slots: RoomSlot[];

  // Active match runtime state
  tickTimer: NodeJS.Timeout | null;
  cars: ServerCar[];
  nitroPads: ServerNitroPad[];
  countdownTimer: number;
  lastCountdownStep: number;
  elapsedSeconds: number;
  peakImpactKmh: number;
  totalPartsDetached: number;
  pendingGameOver: boolean;
  gameOverDelay: number;
  callout: CalloutEvent | null;
  calloutTimer: number;
  nextCalloutId: number;
}

const clients = new Map<WebSocket, ClientSession>();
const rooms = new Map<string, ServerRoom>();

let nextIdCounter = 1;
function genId(prefix: string): string {
  nextIdCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${nextIdCounter}`;
}

function genRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function sendMsg(ws: WebSocket, msg: ServerToClientMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function sanitizeName(raw: string | undefined, fallback: string): string {
  const cleaned = (raw ?? '').trim().slice(0, 18);
  return cleaned.length > 0 ? cleaned : fallback;
}

function validColorId(raw: string | undefined): CarColorId {
  const found = CAR_COLORS.find((c) => c.id === raw);
  return found ? found.id : CAR_COLORS[0].id;
}

function buildRoomSummary(room: ServerRoom): RoomSummary {
  const hostSlot = room.slots.find((s) => s.playerId === room.hostPlayerId);
  const humanCount = room.slots.filter((s) => s.occupantType === 'human').length;
  return {
    id: room.id,
    code: room.code,
    name: room.name,
    hostName: hostSlot?.name ?? 'Anfitrión',
    maxCars: room.maxCars,
    humanCount,
    status: room.status,
  };
}

function buildRoomState(room: ServerRoom): RoomState {
  return {
    id: room.id,
    code: room.code,
    name: room.name,
    hostPlayerId: room.hostPlayerId,
    maxCars: room.maxCars,
    status: room.status,
    slots: room.slots.map((s) => ({ ...s })),
  };
}

function listRoomSummaries(): RoomSummary[] {
  return Array.from(rooms.values()).map(buildRoomSummary);
}

function broadcastRoomList(): void {
  const payload: ServerToClientMessage = {
    type: 'rooms:updated',
    rooms: listRoomSummaries(),
  };
  for (const session of clients.values()) {
    sendMsg(session.ws, payload);
  }
}

function getRoomSessions(room: ServerRoom): ClientSession[] {
  const result: ClientSession[] = [];
  for (const session of clients.values()) {
    if (session.roomId === room.id) {
      result.push(session);
    }
  }
  return result;
}

function broadcastToRoom(room: ServerRoom, msg: ServerToClientMessage): void {
  for (const session of getRoomSessions(room)) {
    sendMsg(session.ws, msg);
  }
}

function stopRoomSimulation(room: ServerRoom): void {
  if (room.tickTimer) {
    clearInterval(room.tickTimer);
    room.tickTimer = null;
  }
}

function leaveCurrentRoom(session: ClientSession, notifySelf = true): void {
  if (!session.roomId) return;
  const room = rooms.get(session.roomId);
  session.roomId = null;

  if (!room) {
    if (notifySelf) sendMsg(session.ws, { type: 'room:left' });
    return;
  }

  // Vacate slot in room
  for (const slot of room.slots) {
    if (slot.playerId === session.playerId) {
      slot.occupantType = 'empty';
      slot.playerId = null;
      slot.name = null;
      slot.isHost = false;
    }
  }

  // If a match is active, hand disconnected player's car over to AI bot seamlessly
  for (const car of room.cars) {
    if (car.ownerPlayerId === session.playerId) {
      car.isHuman = false;
      car.ownerPlayerId = null;
      if (!car.name.endsWith('(IA)')) {
        car.name = `${car.name} (IA)`;
      }
    }
  }

  if (notifySelf) {
    sendMsg(session.ws, { type: 'room:left' });
  }

  const remainingHumans = room.slots.filter((s) => s.occupantType === 'human');
  if (remainingHumans.length === 0) {
    stopRoomSimulation(room);
    rooms.delete(room.id);
    broadcastRoomList();
    return;
  }

  // Promote new host if previous host left
  if (room.hostPlayerId === session.playerId) {
    const nextHost = remainingHumans[0];
    room.hostPlayerId = nextHost.playerId!;
    nextHost.isHost = true;
  }

  broadcastToRoom(room, { type: 'room:state', room: buildRoomState(room) });
  broadcastRoomList();
}

function createEmptySlot(slotIndex: number): RoomSlot {
  return {
    slotIndex,
    occupantType: 'empty',
    playerId: null,
    name: null,
    colorId: CAR_COLORS[slotIndex % CAR_COLORS.length].id,
    isHost: false,
  };
}

function startRoomMatch(room: ServerRoom): void {
  stopRoomSimulation(room);

  room.status = 'countdown';
  room.countdownTimer = 3.2;
  room.lastCountdownStep = 4;
  room.elapsedSeconds = 0;
  room.peakImpactKmh = 0;
  room.totalPartsDetached = 0;
  room.pendingGameOver = false;
  room.gameOverDelay = 0;
  room.callout = null;
  room.calloutTimer = 0;
  room.nitroPads = createInitialServerNitroPads();

  const usedColors = new Set<CarColorId>();
  for (const slot of room.slots) {
    if (slot.occupantType === 'human') {
      usedColors.add(slot.colorId);
    }
  }

  const cars: ServerCar[] = [];
  let botCounter = 0;

  for (let i = 0; i < room.maxCars; i++) {
    const slot = room.slots[i];
    const numLabel = String(i + 1).padStart(2, '0');

    if (slot && slot.occupantType === 'human' && slot.playerId) {
      cars.push(
        createServerCar({
          id: `car_${i}`,
          slotIndex: i,
          name: slot.name ?? `Piloto ${i + 1}`,
          numberLabel: numLabel,
          colorId: slot.colorId,
          isHuman: true,
          ownerPlayerId: slot.playerId,
          totalCars: room.maxCars,
        }),
      );
    } else {
      // Unoccupied slot becomes an AI bot!
      const unused = CAR_COLORS.find((c) => !usedColors.has(c.id));
      const botColor =
        unused?.id ?? CAR_COLORS[(i + botCounter) % CAR_COLORS.length].id;
      usedColors.add(botColor);

      const botName = BOT_NAMES[botCounter % BOT_NAMES.length];
      botCounter += 1;

      cars.push(
        createServerCar({
          id: `car_${i}`,
          slotIndex: i,
          name: botName,
          numberLabel: numLabel,
          colorId: botColor,
          isHuman: false,
          ownerPlayerId: null,
          totalCars: room.maxCars,
        }),
      );
    }
  }

  room.cars = cars;

  // Reset all member inputs
  const roomSessions = getRoomSessions(room);
  for (const s of roomSessions) {
    s.latestInput = { throttle: 0, steer: 0, handbrake: false, nitro: false };
    const myCar = cars.find((c) => c.ownerPlayerId === s.playerId);
    sendMsg(s.ws, {
      type: 'game:started',
      room: buildRoomState(room),
      yourCarId: myCar?.id ?? cars[0]?.id ?? 'car_0',
      cars: cars.map(serializeServerCar),
    });
  }

  broadcastRoomList();

  room.tickTimer = setInterval(() => {
    tickRoomMatch(room);
  }, 1000 / TICK_HZ);
}

function tickRoomMatch(room: ServerRoom): void {
  if (room.status !== 'countdown' && room.status !== 'playing') {
    return;
  }

  const dt = TICK_DT;

  if (room.calloutTimer > 0) {
    room.calloutTimer -= dt;
    if (room.calloutTimer <= 0) {
      room.callout = null;
    }
  }

  if (room.status === 'countdown') {
    room.countdownTimer -= dt;
    const step = Math.ceil(room.countdownTimer);
    if (step !== room.lastCountdownStep && step >= 1 && step <= 3) {
      room.lastCountdownStep = step;
      broadcastToRoom(room, { type: 'game:countdown_tick', step, go: false });
    }
    if (room.countdownTimer <= 0) {
      room.status = 'playing';
      broadcastToRoom(room, { type: 'game:countdown_tick', step: 0, go: true });
      room.callout = {
        id: ++room.nextCalloutId,
        text: '¡A CHOCAR!',
        subtext: 'ÚLTIMO AUTO EN PIE GANA',
        tone: 'nitro',
        targetViewport: 'all',
      };
      room.calloutTimer = 1.6;
      broadcastRoomList();
    }
  }

  const inputs = new Map<string, NetInputPayload>();
  const roomSessions = getRoomSessions(room);
  const sessionByPlayerId = new Map<string, ClientSession>();
  for (const s of roomSessions) {
    sessionByPlayerId.set(s.playerId, s);
  }

  for (const car of room.cars) {
    if (car.isHuman && car.ownerPlayerId) {
      const s = sessionByPlayerId.get(car.ownerPlayerId);
      inputs.set(
        car.id,
        s?.latestInput ?? { throttle: 0, steer: 0, handbrake: false, nitro: false },
      );
    } else {
      inputs.set(car.id, computeBotInput(car, room.cars, dt));
    }
  }

  const allowDriving = room.status === 'playing';
  const simDt = room.pendingGameOver ? dt * 0.42 : dt;
  if (room.status === 'playing') {
    room.elapsedSeconds += dt;
  }

  const fb = stepServerDerbySimulation(
    room.cars,
    inputs,
    room.nitroPads,
    simDt,
    allowDriving,
  );

  room.peakImpactKmh = Math.max(room.peakImpactKmh, fb.peakImpactKmh);
  room.totalPartsDetached += fb.partsDetachedCount;

  if (fb.calloutText) {
    room.callout = {
      id: ++room.nextCalloutId,
      text: fb.calloutText,
      subtext: fb.calloutSubtext,
      tone: fb.calloutTone ?? 'impact',
      targetViewport: 'all',
    };
    room.calloutTimer = 1.9;
  }

  const aliveList = room.cars.filter((c) => !c.wrecked);
  const humansAlive = aliveList.filter((c) => c.isHuman).length;

  let summary = undefined;
  if (room.status === 'playing' && !room.pendingGameOver) {
    if (aliveList.length <= 1 || humansAlive === 0) {
      room.pendingGameOver = true;
      room.gameOverDelay = 1.65;
    }
  }

  if (room.pendingGameOver && room.status === 'playing') {
    room.gameOverDelay -= dt;
    if (room.gameOverDelay <= 0) {
      room.status = 'gameover';
      room.pendingGameOver = false;
      stopRoomSimulation(room);
      summary = buildServerMatchSummary(
        room.cars,
        room.elapsedSeconds,
        room.peakImpactKmh,
        room.totalPartsDetached,
      );
      broadcastRoomList();
    }
  }

  const snapshot: NetStateSnapshot = {
    phase: room.status === 'countdown' ? 'countdown' : room.status === 'gameover' ? 'gameover' : 'playing',
    countdownValue: Math.max(0, Math.ceil(room.countdownTimer)),
    elapsedSeconds: Math.floor(room.elapsedSeconds),
    aliveCount: aliveList.length,
    totalCars: room.cars.length,
    cars: room.cars.map(serializeServerCar),
    nitroPadCooldowns: room.nitroPads.map((p) => Number(p.cooldown.toFixed(2))),
    impacts: fb.impacts as NetImpactEvent[],
    nitroPickups: fb.nitroPickups,
    callout: room.callout,
    summary,
  };

  broadcastToRoom(room, { type: 'game:snapshot', snapshot });
}

function handleClientMessage(
  session: ClientSession,
  raw: string,
): void {
  let msg: ClientToServerMessage;
  try {
    msg = JSON.parse(raw) as ClientToServerMessage;
  } catch {
    return;
  }

  switch (msg.type) {
    case 'rooms:list': {
      sendMsg(session.ws, {
        type: 'rooms:updated',
        rooms: listRoomSummaries(),
      });
      break;
    }

    case 'room:create': {
      leaveCurrentRoom(session, false);
      const maxCars = [4, 6, 8].includes(msg.maxCars) ? msg.maxCars : 6;
      const playerName = sanitizeName(msg.playerName, 'Piloto 01');
      session.playerName = playerName;
      const roomName = sanitizeName(
        msg.roomName,
        `Sala de ${playerName}`,
      ).slice(0, 26);
      const colorId = validColorId(msg.colorId);

      const slots: RoomSlot[] = [];
      for (let i = 0; i < maxCars; i++) {
        slots.push(createEmptySlot(i));
      }
      slots[0] = {
        slotIndex: 0,
        occupantType: 'human',
        playerId: session.playerId,
        name: playerName,
        colorId,
        isHost: true,
      };

      const roomId = genId('room');
      let code = genRoomCode();
      while (Array.from(rooms.values()).some((r) => r.code === code)) {
        code = genRoomCode();
      }

      const room: ServerRoom = {
        id: roomId,
        code,
        name: roomName,
        hostPlayerId: session.playerId,
        maxCars,
        status: 'lobby',
        slots,
        tickTimer: null,
        cars: [],
        nitroPads: createInitialServerNitroPads(),
        countdownTimer: 0,
        lastCountdownStep: 0,
        elapsedSeconds: 0,
        peakImpactKmh: 0,
        totalPartsDetached: 0,
        pendingGameOver: false,
        gameOverDelay: 0,
        callout: null,
        calloutTimer: 0,
        nextCalloutId: 1,
      };

      rooms.set(room.id, room);
      session.roomId = room.id;

      sendMsg(session.ws, {
        type: 'room:joined',
        room: buildRoomState(room),
        yourPlayerId: session.playerId,
      });
      broadcastRoomList();
      break;
    }

    case 'room:join':
    case 'room:join_by_code': {
      const targetRoom =
        msg.type === 'room:join'
          ? rooms.get(msg.roomId)
          : Array.from(rooms.values()).find(
              (r) => r.code.toUpperCase() === msg.code.trim().toUpperCase(),
            );

      if (!targetRoom) {
        sendMsg(session.ws, {
          type: 'room:error',
          message: 'No se encontró la sala solicitada.',
        });
        break;
      }
      if (targetRoom.status !== 'lobby') {
        sendMsg(session.ws, {
          type: 'room:error',
          message: 'La partida ya está en curso en esa sala.',
        });
        break;
      }

      const emptySlot = targetRoom.slots.find(
        (s) => s.occupantType === 'empty',
      );
      if (!emptySlot) {
        sendMsg(session.ws, {
          type: 'room:error',
          message: 'La sala ya tiene todos los puestos ocupados.',
        });
        break;
      }

      leaveCurrentRoom(session, false);
      const playerName = sanitizeName(
        msg.playerName,
        `Piloto ${emptySlot.slotIndex + 1}`,
      );
      session.playerName = playerName;
      const colorId = validColorId(msg.colorId);

      emptySlot.occupantType = 'human';
      emptySlot.playerId = session.playerId;
      emptySlot.name = playerName;
      emptySlot.colorId = colorId;
      emptySlot.isHost = false;

      session.roomId = targetRoom.id;

      sendMsg(session.ws, {
        type: 'room:joined',
        room: buildRoomState(targetRoom),
        yourPlayerId: session.playerId,
      });
      broadcastToRoom(targetRoom, {
        type: 'room:state',
        room: buildRoomState(targetRoom),
      });
      broadcastRoomList();
      break;
    }

    case 'room:leave': {
      leaveCurrentRoom(session, true);
      break;
    }

    case 'room:update_seat': {
      if (!session.roomId) break;
      const room = rooms.get(session.roomId);
      if (!room || room.status !== 'lobby') break;

      const currentSlot = room.slots.find(
        (s) => s.playerId === session.playerId,
      );
      if (!currentSlot) break;

      if (msg.colorId) {
        currentSlot.colorId = validColorId(msg.colorId);
      }
      if (msg.playerName !== undefined) {
        const clean = sanitizeName(msg.playerName, currentSlot.name ?? 'Piloto');
        currentSlot.name = clean;
        session.playerName = clean;
      }
      if (
        typeof msg.targetSlotIndex === 'number' &&
        msg.targetSlotIndex >= 0 &&
        msg.targetSlotIndex < room.maxCars
      ) {
        const target = room.slots[msg.targetSlotIndex];
        if (target && target.occupantType === 'empty') {
          target.occupantType = 'human';
          target.playerId = currentSlot.playerId;
          target.name = currentSlot.name;
          target.colorId = currentSlot.colorId;
          target.isHost = currentSlot.isHost;

          currentSlot.occupantType = 'empty';
          currentSlot.playerId = null;
          currentSlot.name = null;
          currentSlot.isHost = false;
        }
      }

      broadcastToRoom(room, {
        type: 'room:state',
        room: buildRoomState(room),
      });
      broadcastRoomList();
      break;
    }

    case 'room:update_max_cars': {
      if (!session.roomId) break;
      const room = rooms.get(session.roomId);
      if (!room || room.status !== 'lobby') break;
      if (room.hostPlayerId !== session.playerId) break;

      const nextMax = [4, 6, 8].includes(msg.maxCars) ? msg.maxCars : room.maxCars;
      const humans = room.slots.filter((s) => s.occupantType === 'human');
      if (nextMax < humans.length) {
        sendMsg(session.ws, {
          type: 'room:error',
          message: `Ya hay ${humans.length} jugadores en la sala.`,
        });
        break;
      }

      const nextSlots: RoomSlot[] = [];
      for (let i = 0; i < nextMax; i++) {
        nextSlots.push(createEmptySlot(i));
      }
      // Keep humans in their index if it fits, otherwise pack into lowest free slot
      const overflow: RoomSlot[] = [];
      for (const h of humans) {
        if (h.slotIndex < nextMax) {
          nextSlots[h.slotIndex] = { ...h };
        } else {
          overflow.push(h);
        }
      }
      for (const h of overflow) {
        const free = nextSlots.find((s) => s.occupantType === 'empty');
        if (free) {
          free.occupantType = 'human';
          free.playerId = h.playerId;
          free.name = h.name;
          free.colorId = h.colorId;
          free.isHost = h.isHost;
        }
      }

      room.maxCars = nextMax;
      room.slots = nextSlots;

      broadcastToRoom(room, {
        type: 'room:state',
        room: buildRoomState(room),
      });
      broadcastRoomList();
      break;
    }

    case 'room:start': {
      if (!session.roomId) break;
      const room = rooms.get(session.roomId);
      if (!room) break;
      if (room.hostPlayerId !== session.playerId) {
        sendMsg(session.ws, {
          type: 'room:error',
          message: 'Solo el anfitrión puede iniciar la partida.',
        });
        break;
      }
      if (room.status !== 'lobby' && room.status !== 'gameover') break;

      startRoomMatch(room);
      break;
    }

    case 'room:return_lobby': {
      if (!session.roomId) break;
      const room = rooms.get(session.roomId);
      if (!room) break;
      if (room.hostPlayerId !== session.playerId) break;

      stopRoomSimulation(room);
      room.status = 'lobby';
      room.cars = [];
      broadcastToRoom(room, {
        type: 'room:state',
        room: buildRoomState(room),
      });
      broadcastRoomList();
      break;
    }

    case 'game:input': {
      if (!session.roomId) break;
      session.latestInput = {
        throttle: Math.max(-1, Math.min(1, Number(msg.input?.throttle) || 0)),
        steer: Math.max(-1, Math.min(1, Number(msg.input?.steer) || 0)),
        handbrake: Boolean(msg.input?.handbrake),
        nitro: Boolean(msg.input?.nitro),
      };
      break;
    }
  }
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size, clients: clients.size });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  wss.on('error', (err) => {
    console.error('WebSocketServer error:', err);
  });

  server.on('upgrade', (request, socket, head) => {
    socket.on('error', () => {
      // Ignore client socket reset errors during upgrade
    });
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/ws') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    } catch {
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    const playerId = genId('ply');
    const session: ClientSession = {
      playerId,
      ws,
      roomId: null,
      playerName: 'Piloto',
      latestInput: { throttle: 0, steer: 0, handbrake: false, nitro: false },
    };
    clients.set(ws, session);

    sendMsg(ws, {
      type: 'welcome',
      playerId,
      rooms: listRoomSummaries(),
    });

    ws.on('error', (err) => {
      console.error('WebSocket client error:', err);
    });

    ws.on('message', (data) => {
      handleClientMessage(session, String(data));
    });

    ws.on('close', () => {
      leaveCurrentRoom(session, false);
      clients.delete(ws);
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Chapa y Polvo server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
