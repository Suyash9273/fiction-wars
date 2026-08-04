import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import type { Room, RoomSettings, Player, AvatarId } from "@fiction-wars/shared-types";
import {
  MIN_PLAYERS,
  MAX_PLAYERS,
  isValidSettingsUpdate,
  toRoomView,
  isHost,
} from "@fiction-wars/shared-types";
import {
  roomKey,
  ROOM_TTL_SECONDS,
  ENDED_ROOM_TTL_SECONDS,
  DISCONNECT_GRACE_PERIOD_MS,
} from "../constants.js";
import { reserveRoomCode } from "./roomCode.js";

//Read / Write helpers :-> 

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
  await redis.del(roomKey(code));
}

// Create : -> 

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
): Promise<CreateRoomResult | { error: string }> {
  const code = await reserveRoomCode(redis);
  if (!code) return { error: "Failed to generate a unique room code. Please try again." };

  const playerId = randomUUID();
  const sessionToken = randomUUID();

  const host: Player = {
    id: playerId,
    socketId: null, // will be set when the socket connects
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

// Join : -> 

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
): Promise<JoinRoomResult | { error: string }> {
  const room = await getRoom(redis, code);
  if (!room) return { error: "ROOM_NOT_FOUND" };
  if (room.state !== "lobby") return { error: "ROOM_LOCKED" };
  if (room.players.length >= room.settings.maxPlayers) return { error: "ROOM_FULL" };

  // Case-insensitive username uniqueness check
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

// Reconnect : ->

export async function reconnectPlayer(
  redis: Redis,
  code: string,
  sessionToken: string,
  newSocketId: string
): Promise<{ room: Room; player: Player } | { error: string }> {
  const room = await getRoom(redis, code);
  if (!room) return { error: "ROOM_NOT_FOUND" };

  const player = room.players.find((p) => p.sessionToken === sessionToken);
  if (!player) return { error: "SESSION_EXPIRED" };

  // Check grace period — if disconnectedAt is set and expired, treat as kicked
  if (player.disconnectedAt !== null) {
    const elapsed = Date.now() - player.disconnectedAt;
    if (elapsed > DISCONNECT_GRACE_PERIOD_MS) {
      return { error: "SESSION_EXPIRED" };
    }
  }

  // Last-writer-wins: if another socket is already live for this seat, it
  // gets disconnected by the caller before this point. We just update the id.
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

// Leave/Disconnect : ->

export interface LeaveRoomResult {
  updatedRoom: Room | null; // null = room was deleted (empty)
  newHostId: string | null; // non-null if host migrated
  wasLastPlayer: boolean;
}

export async function removePlayerFromRoom(
  redis: Redis,
  code: string,
  playerId: string
): Promise<LeaveRoomResult | { error: string }> {
  const room = await getRoom(redis, code);
  if (!room) return { error: "ROOM_NOT_FOUND" };

  const remainingPlayers = room.players.filter((p) => p.id !== playerId);

  // Room is now empty — delete it entirely
  if (remainingPlayers.length === 0) {
    await deleteRoom(redis, code);
    return { updatedRoom: null, newHostId: null, wasLastPlayer: true };
  }

  let newHostId: string | null = null;
  let newHostPlayerId = room.hostPlayerId;

  // Host migration — if the leaver was the host, transfer to the
  // next-longest-connected player (earliest createdAt proxy = first in list)
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

// Mark disconnected and start grace period :->

export async function markPlayerDisconnected(
  redis: Redis,
  code: string,
  playerId: string
): Promise<Room | null> {
  const room = await getRoom(redis, code);
  if (!room) return null;

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

// Update the socket id after join/reconnect :->

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

// Kick the player(by host) :->

export async function kickPlayer(
  redis: Redis,
  code: string,
  requestingPlayerId: string,
  targetPlayerId: string
): Promise<{ room: Room } | { error: string }> {
  const room = await getRoom(redis, code);
  if (!room) return { error: "ROOM_NOT_FOUND" };
  if (!isHost({ id: requestingPlayerId }, room)) return { error: "NOT_HOST" };

  const target = room.players.find((p) => p.id === targetPlayerId);
  if (!target) return { error: "ROOM_NOT_FOUND" };

  // Invalidate session token by rotating it — kicked players cannot reconnect
  // even within the grace period (Section 2: kick is deliberate, not a blip)
  const updatedRoom: Room = {
    ...room,
    players: room.players
      .filter((p) => p.id !== targetPlayerId),
  };

  await saveRoom(redis, updatedRoom);
  return { room: updatedRoom };
}

// Update settings :->

export async function updateRoomSettings(
  redis: Redis,
  code: string,
  requestingPlayerId: string,
  settings: RoomSettings
): Promise<{ room: Room } | { error: string }> {
  const room = await getRoom(redis, code);
  if (!room) return { error: "ROOM_NOT_FOUND" };
  if (!isHost({ id: requestingPlayerId }, room)) return { error: "NOT_HOST" };
  if (room.state !== "lobby") return { error: "ROOM_LOCKED" };

  const validation = isValidSettingsUpdate(settings, room.players.length);
  if (!validation.valid) return { error: validation.reason };

  const updatedRoom: Room = { ...room, settings };
  await saveRoom(redis, updatedRoom);
  return { room: updatedRoom };
}

// Lock the room once game starts :->

export async function lockRoom(
  redis: Redis,
  code: string,
  requestingPlayerId: string
): Promise<{ room: Room } | { error: string }> {
  const room = await getRoom(redis, code);
  if (!room) return { error: "ROOM_NOT_FOUND" };
  if (!isHost({ id: requestingPlayerId }, room)) return { error: "NOT_HOST" };
  if (room.state !== "lobby") return { error: "ROOM_LOCKED" };
  if (room.players.length < MIN_PLAYERS) {
    return { error: `Need at least ${MIN_PLAYERS} players to start.` };
  }
  if (room.players.length > MAX_PLAYERS) {
    return { error: `Room has too many players (max ${MAX_PLAYERS}).` };
  }

  const updatedRoom: Room = { ...room, state: "in-progress" };
  await saveRoom(redis, updatedRoom);
  return { room: updatedRoom };
}

export { toRoomView };
