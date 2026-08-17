import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import type {
  Room,
  RoomSettings,
  Player,
  AvatarId,
  ErrorCode,
} from "@fiction-wars/shared-types";
import {
  MIN_PLAYERS,
  MAX_PLAYERS,
  isValidSettingsUpdate,
  toRoomView,
  isHost,
} from "@fiction-wars/shared-types";
import {
  roomKey,
  chatKey,
  gameKey,
  ROOM_TTL_SECONDS,
  ENDED_ROOM_TTL_SECONDS,
  DISCONNECT_GRACE_PERIOD_MS,
} from "../constants.js";
import { reserveRoomCode } from "./roomCode.js";

// Every function in this file returns { error: ErrorCode } on failure —
// never a plain string. This means roomHandlers.ts can forward the code
// directly to the client without an unsafe cast, and the frontend can
// switch on a closed, typed set of error codes.

type ServiceError = { error: ErrorCode };
type ServiceResult<T> = T | ServiceError;

// ─── Read / Write helpers ─────────────────────────────────────────────────

export async function getRoom(redis: Redis, code: string): Promise<Room | null> {
  const raw = await redis.get(roomKey(code));
  if (!raw || raw === "__reserved__") return null;
  return JSON.parse(raw) as Room;
}

export async function saveRoom(redis: Redis, room: Room): Promise<void> {
  const ttl =
    room.state === "ended" ? ENDED_ROOM_TTL_SECONDS : ROOM_TTL_SECONDS;
  await redis.set(roomKey(room.code), JSON.stringify(room), "EX", ttl);
}

export async function deleteRoom(redis: Redis, code: string): Promise<void> {
  // Delete all keys associated with this room atomically.
  // If any key doesn't exist, DEL silently ignores it — no error.
  await redis.del(roomKey(code), chatKey(code), gameKey(code));
}

// ─── Create ───────────────────────────────────────────────────────────────

export interface CreateRoomResult {
  room: Room;
  playerId: string;
  sessionToken: string;
}

export async function createRoom(
  redis: Redis,
  username: string,
  avatar: AvatarId,
  settings: RoomSettings
): Promise<ServiceResult<CreateRoomResult>> {
  const code = await reserveRoomCode(redis);
  if (!code) return { error: "VALIDATION_ERROR" };

  const playerId = randomUUID();
  const sessionToken = randomUUID();

  const host: Player = {
    id: playerId,
    socketId: null,
    disconnectedAt: null,
    username,
    avatar,
    status: "active",
    pileCount: 0,
    sessionToken,
  };

  const room: Room = {
    code,
    hostPlayerId: playerId,
    players: [host],
    settings,
    state: "lobby",
    createdAt: Date.now(),
  };

  await saveRoom(redis, room);
  return { room, playerId, sessionToken };
}

// ─── Join ─────────────────────────────────────────────────────────────────

export interface JoinRoomResult {
  room: Room;
  playerId: string;
  sessionToken: string;
}

export async function joinRoom(
  redis: Redis,
  code: string,
  username: string,
  avatar: AvatarId
): Promise<ServiceResult<JoinRoomResult>> {
  const room = await getRoom(redis, code);
  if (!room) return { error: "ROOM_NOT_FOUND" };
  if (room.state !== "lobby") return { error: "ROOM_LOCKED" };
  if (room.players.length >= room.settings.maxPlayers) return { error: "ROOM_FULL" };

  const nameTaken = room.players.some(
    (p) => p.username.toLowerCase() === username.toLowerCase()
  );
  if (nameTaken) return { error: "USERNAME_TAKEN" };

  const playerId = randomUUID();
  const sessionToken = randomUUID();

  const newPlayer: Player = {
    id: playerId,
    socketId: null,
    disconnectedAt: null,
    username,
    avatar,
    status: "active",
    pileCount: 0,
    sessionToken,
  };

  const updatedRoom: Room = {
    ...room,
    players: [...room.players, newPlayer],
  };

  await saveRoom(redis, updatedRoom);
  return { room: updatedRoom, playerId, sessionToken };
}

// ─── Reconnect ────────────────────────────────────────────────────────────

export async function reconnectPlayer(
  redis: Redis,
  code: string,
  sessionToken: string,
  newSocketId: string
): Promise<ServiceResult<{ room: Room; player: Player }>> {
  const room = await getRoom(redis, code);
  if (!room) return { error: "ROOM_NOT_FOUND" };

  const player = room.players.find((p) => p.sessionToken === sessionToken);
  if (!player) return { error: "SESSION_EXPIRED" };

  // Only enforce the grace-period expiry for players who actually disconnected.
  // Players with disconnectedAt === null are still considered "active" (their
  // old socket may still be open) — evictExistingSocket in roomHandlers will
  // close it. We allow the reconnect so the new socket can take the seat.
  if (player.disconnectedAt !== null) {
    const elapsed = Date.now() - player.disconnectedAt;
    if (elapsed > DISCONNECT_GRACE_PERIOD_MS) {
      return { error: "SESSION_EXPIRED" };
    }
  }

  const updatedPlayer: Player = {
    ...player,
    socketId: newSocketId,
    disconnectedAt: null,
  };

  const updatedRoom: Room = {
    ...room,
    players: room.players.map((p) =>
      p.id === player.id ? updatedPlayer : p
    ),
  };

  await saveRoom(redis, updatedRoom);
  return { room: updatedRoom, player: updatedPlayer };
}

// ─── Leave / Disconnect ───────────────────────────────────────────────────

export interface LeaveRoomResult {
  updatedRoom: Room | null;
  newHostId: string | null;
  wasLastPlayer: boolean;
}

export async function removePlayerFromRoom(
  redis: Redis,
  code: string,
  playerId: string
): Promise<ServiceResult<LeaveRoomResult>> {
  const room = await getRoom(redis, code);
  if (!room) return { error: "ROOM_NOT_FOUND" };

  const remainingPlayers = room.players.filter((p) => p.id !== playerId);

  if (remainingPlayers.length === 0) {
    await deleteRoom(redis, code);
    return { updatedRoom: null, newHostId: null, wasLastPlayer: true };
  }

  let newHostId: string | null = null;
  let newHostPlayerId = room.hostPlayerId;

  if (isHost({ id: playerId }, room)) {
    const newHost = remainingPlayers[0]!;
    newHostPlayerId = newHost.id;
    newHostId = newHost.id;
  }

  const updatedRoom: Room = {
    ...room,
    hostPlayerId: newHostPlayerId,
    players: remainingPlayers,
  };

  await saveRoom(redis, updatedRoom);
  return { updatedRoom, newHostId, wasLastPlayer: false };
}

// ─── Mark disconnected (starts grace period) ──────────────────────────────

export async function markPlayerDisconnected(
  redis: Redis,
  code: string,
  playerId: string,
  disconnectingSocketId: string
): Promise<Room | null> {
  const room = await getRoom(redis, code);
  if (!room) return null;

  const player = room.players.find((p) => p.id === playerId);
  if (!player) return null;

  // Only mark as disconnected if the disconnecting socket is still the
  // player's current socket. If the player already reconnected with a new
  // socket (race: reconnect arrives before disconnect fires), the old
  // socket's disconnect event must be a no-op — otherwise we'd overwrite
  // the new socketId with null and the grace-period timer would evict
  // a player who is already back online.
  if (player.socketId !== disconnectingSocketId) return null;

  const updatedRoom: Room = {
    ...room,
    players: room.players.map((p) =>
      p.id === playerId
        ? { ...p, socketId: null, disconnectedAt: Date.now() }
        : p
    ),
  };

  await saveRoom(redis, updatedRoom);
  return updatedRoom;
}

// ─── Attach socket after join/reconnect ──────────────────────────────────

export async function attachSocketToPlayer(
  redis: Redis,
  code: string,
  playerId: string,
  socketId: string
): Promise<Room | null> {
  const room = await getRoom(redis, code);
  if (!room) return null;

  const updatedRoom: Room = {
    ...room,
    players: room.players.map((p) =>
      p.id === playerId ? { ...p, socketId } : p
    ),
  };

  await saveRoom(redis, updatedRoom);
  return updatedRoom;
}

// ─── Kick ─────────────────────────────────────────────────────────────────

export async function kickPlayer(
  redis: Redis,
  code: string,
  requestingPlayerId: string,
  targetPlayerId: string
): Promise<ServiceResult<{ room: Room }>> {
  const room = await getRoom(redis, code);
  if (!room) return { error: "ROOM_NOT_FOUND" };
  if (!isHost({ id: requestingPlayerId }, room)) return { error: "NOT_HOST" };

  // Correct error: the room exists, but the target player doesn't
  const target = room.players.find((p) => p.id === targetPlayerId);
  if (!target) return { error: "PLAYER_NOT_FOUND" };

  // Removing the player from the room fully invalidates their session —
  // any reconnect attempt will get SESSION_EXPIRED since the token won't
  // be found in any player record (kick is deliberate, not a network blip)
  const updatedRoom: Room = {
    ...room,
    players: room.players.filter((p) => p.id !== targetPlayerId),
  };

  await saveRoom(redis, updatedRoom);
  return { room: updatedRoom };
}

// ─── Update settings ──────────────────────────────────────────────────────

export async function updateRoomSettings(
  redis: Redis,
  code: string,
  requestingPlayerId: string,
  settings: RoomSettings
): Promise<ServiceResult<{ room: Room }>> {
  const room = await getRoom(redis, code);
  if (!room) return { error: "ROOM_NOT_FOUND" };
  if (!isHost({ id: requestingPlayerId }, room)) return { error: "NOT_HOST" };
  if (room.state !== "lobby") return { error: "ROOM_LOCKED" };

  const validation = isValidSettingsUpdate(settings, room.players.length);
  if (!validation.valid) return { error: "VALIDATION_ERROR" };

  const updatedRoom: Room = { ...room, settings };
  await saveRoom(redis, updatedRoom);
  return { room: updatedRoom };
}

// ─── Lock room on game start ──────────────────────────────────────────────

export async function lockRoom(
  redis: Redis,
  code: string,
  requestingPlayerId: string
): Promise<ServiceResult<{ room: Room }>> {
  const room = await getRoom(redis, code);
  if (!room) return { error: "ROOM_NOT_FOUND" };
  if (!isHost({ id: requestingPlayerId }, room)) return { error: "NOT_HOST" };
  if (room.state !== "lobby") return { error: "ROOM_LOCKED" };
  if (room.players.length < MIN_PLAYERS) return { error: "INSUFFICIENT_PLAYERS" };
  if (room.players.length > MAX_PLAYERS) return { error: "VALIDATION_ERROR" };

  const updatedRoom: Room = { ...room, state: "in-progress" };
  await saveRoom(redis, updatedRoom);
  return { room: updatedRoom };
}

export { toRoomView };

