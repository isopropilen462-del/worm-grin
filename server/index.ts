/**
 * Persistent authoritative match server.
 * Runs the same MatchEngine as the browser, keeps it in memory, and ticks
 * every room at a fixed rate so neither client tab needs to stay focused.
 */
import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { MatchEngine } from '../src/engine/MatchEngine.ts';
import { emptyInput, type InputLike } from '../src/game/Input.ts';
import type { GameSnapshot, InputEvent } from '../src/net/types.ts';

const PORT = Number(process.env.PORT || 8787);
const TICK_HZ = 20;
const TICK_DT = 1 / TICK_HZ;
const STATE_EVERY = 2; // 10 state packets / sec
const ROOM_TTL_MS = 15 * 60 * 1000;

type Role = 'host' | 'guest';

interface HelloMessage {
  type: 'hello';
  roomCode: string;
  roomId: string;
  playerId: string;
  role: Role;
  seed: number;
}

interface InputMessage {
  type: 'input';
  left: boolean;
  right: boolean;
  jump: boolean;
  fire: boolean;
  aimUp: boolean;
  aimDown: boolean;
  pointerActive: boolean;
  pointerX: number;
  pointerY: number;
  events: InputEvent[];
}

type ClientMessage = HelloMessage | InputMessage;

interface PlayerSocket {
  ws: WebSocket;
  playerId: string;
  role: Role;
  seat: 0 | 1;
}

interface Room {
  code: string;
  roomId: string;
  seed: number;
  engine: MatchEngine;
  players: Map<0 | 1, PlayerSocket>;
  inputs: Map<0 | 1, InputLike>;
  activeTeam: 0 | 1;
  tickCount: number;
  finished: boolean;
  lastActiveAt: number;
}

const rooms = new Map<string, Room>();

function send(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function broadcast(room: Room, payload: unknown): void {
  const raw = JSON.stringify(payload);
  for (const player of room.players.values()) {
    if (player.ws.readyState === player.ws.OPEN) player.ws.send(raw);
  }
}

function toInput(message: InputMessage): InputLike {
  const events = Array.isArray(message.events) ? message.events : [];
  const weaponEvent = events.find(
    (event): event is Extract<InputEvent, { type: 'weapon' }> =>
      event.type === 'weapon',
  );
  return {
    left: message.left === true,
    right: message.right === true,
    jump: message.jump === true,
    jumpPressed: events.some((event) => event.type === 'jump'),
    fire: message.fire === true,
    firePressed: events.some((event) => event.type === 'fire-press'),
    fireReleased: events.some((event) => event.type === 'fire-release'),
    aimUp: message.aimUp === true,
    aimDown: message.aimDown === true,
    weaponSelect:
      weaponEvent && weaponEvent.weapon >= 1 && weaponEvent.weapon <= 6
        ? weaponEvent.weapon
        : null,
    pointerActive: message.pointerActive === true,
    pointerX: Number.isFinite(message.pointerX) ? Number(message.pointerX) : 0,
    pointerY: Number.isFinite(message.pointerY) ? Number(message.pointerY) : 0,
  };
}

function getOrCreateRoom(code: string, roomId: string, seed: number): Room {
  const key = code.toUpperCase();
  const existing = rooms.get(key);
  if (existing) {
    existing.lastActiveAt = Date.now();
    return existing;
  }
  const room: Room = {
    code: key,
    roomId,
    seed: seed >>> 0,
    engine: new MatchEngine(seed >>> 0),
    players: new Map(),
    inputs: new Map([
      [0, emptyInput()],
      [1, emptyInput()],
    ]),
    activeTeam: 0,
    tickCount: 0,
    finished: false,
    lastActiveAt: Date.now(),
  };
  rooms.set(key, room);
  return room;
}

function detachSocket(ws: WebSocket): void {
  for (const room of rooms.values()) {
    for (const [seat, player] of room.players) {
      if (player.ws !== ws) continue;
      room.players.delete(seat);
      room.inputs.set(seat, emptyInput());
      room.lastActiveAt = Date.now();
      return;
    }
  }
}

function handleHello(ws: WebSocket, message: HelloMessage): void {
  const code = String(message.roomCode || '').toUpperCase();
  const playerId = String(message.playerId || '');
  const role: Role = message.role === 'guest' ? 'guest' : 'host';
  const seed = Number(message.seed);
  if (!code || !playerId || !Number.isFinite(seed)) {
    send(ws, { type: 'error', message: 'Invalid hello' });
    return;
  }

  const room = getOrCreateRoom(code, String(message.roomId || code), seed);
  const seat: 0 | 1 = role === 'host' ? 0 : 1;
  const existing = room.players.get(seat);
  if (existing && existing.playerId !== playerId && existing.ws.readyState === existing.ws.OPEN) {
    send(ws, { type: 'error', message: 'Seat already taken' });
    return;
  }

  room.players.set(seat, { ws, playerId, role, seat });
  room.lastActiveAt = Date.now();
  send(ws, { type: 'welcome', seat, roomCode: room.code });
  const state: GameSnapshot = room.engine.snapshot();
  room.activeTeam = state.teamIndex;
  send(ws, { type: 'state', state });
}

function handleInput(ws: WebSocket, message: InputMessage): void {
  for (const room of rooms.values()) {
    for (const [seat, player] of room.players) {
      if (player.ws !== ws) continue;
      room.inputs.set(seat, toInput(message));
      room.lastActiveAt = Date.now();
      return;
    }
  }
}

function tickRoom(room: Room): void {
  room.lastActiveAt = Date.now();
  if (room.finished) return;

  // Simulation always advances — waiting / resolving do not need a focused tab.
  const held = room.inputs.get(room.activeTeam) ?? emptyInput();
  room.engine.step(held, TICK_DT);
  room.inputs.set(room.activeTeam, {
    ...held,
    jumpPressed: false,
    firePressed: false,
    fireReleased: false,
    weaponSelect: null,
  });

  room.tickCount += 1;
  if (room.tickCount % STATE_EVERY !== 0) return;

  const state = room.engine.snapshot();
  room.activeTeam = state.teamIndex;
  if (state.winner) room.finished = true;
  broadcast(room, { type: 'state', state });
}

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
    });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('worm-grin match server');
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(String(data)) as ClientMessage;
      if (message.type === 'hello') handleHello(ws, message);
      else if (message.type === 'input') handleInput(ws, message);
    } catch (error) {
      console.error('bad client message', error);
      send(ws, { type: 'error', message: 'Bad message' });
    }
  });
  ws.on('close', () => detachSocket(ws));
  ws.on('error', () => detachSocket(ws));
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastActiveAt > ROOM_TTL_MS) {
      rooms.delete(code);
      continue;
    }
    // Keep simulating after tabs sleep/disconnect so matches don't freeze.
    if (room.players.size > 0 || room.tickCount > 0) tickRoom(room);
  }
}, 1000 / TICK_HZ);

httpServer.listen(PORT, () => {
  console.log(`worm-grin match server on :${PORT} @ ${TICK_HZ}Hz`);
});
