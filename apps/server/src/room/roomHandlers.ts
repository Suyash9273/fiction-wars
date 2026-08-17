import type { Server, Socket } from "socket.io";
import type { Redis } from "ioredis";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
  RoomCreatePayload,
  RoomJoinPayload,
  RoomReconnectPayload,
  RoomKickPayload,
  RoomUpdateSettingsPayload,
  BasicAck,
  RoomCreateAck,
  RoomJoinAck,
  RoomReconnectAck,
} from "@fiction-wars/shared-types";
import {
  RoomCreatePayloadSchema,
  RoomJoinPayloadSchema,
  RoomReconnectPayloadSchema,
  RoomKickPayloadSchema,
  RoomUpdateSettingsPayloadSchema,
  toRoomView,
} from "@fiction-wars/shared-types";
import {
  createRoom,
  joinRoom,
  reconnectPlayer,
  removePlayerFromRoom,
  markPlayerDisconnected,
  attachSocketToPlayer,
  kickPlayer,
  updateRoomSettings,
  lockRoom,
  getRoom,
} from "./roomService.js";
import { DISCONNECT_GRACE_PERIOD_MS } from "../constants.js";
import { evictExistingSocket } from "../session/sessionManager.js";
import { getEngineState, toBroadcastGameState } from "../game/gameService.js";
import { armTurnTimer } from "../game/timerManager.js";
import { getChatMessages } from "../chat/chatHandlers.js";

type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

// ─── Shared leave logic ───────────────────────────────────────────────────
// Both room:leave and socket disconnect funnel through here so the two paths
// never drift from each other (pitfall noted in the Feature 6 pre-analysis).

async function handlePlayerLeave(
  io: AppServer,
  redis: Redis,
  socket: AppSocket,
  reason: "leave" | "disconnect"
): Promise<void> {
  const { playerId, roomCode } = socket.data;
  if (!playerId || !roomCode) return;

  if (reason === "disconnect") {
    // Mark disconnected and start grace period — don't remove yet.
    // Pass socket.id so markPlayerDisconnected can detect if the player
    // already reconnected with a new socket before this disconnect fired.
    const room = await markPlayerDisconnected(redis, roomCode, playerId, socket.id);
    if (!room) return;

    // Broadcast connection status change so other clients can show it
    io.to(roomCode).emit("room:update", toRoomView(room));

    // After grace period, remove if still disconnected
    setTimeout(async () => {
      const current = await getRoom(redis, roomCode);
      if (!current) return;

      const player = current.players.find((p) => p.id === playerId);
      if (!player) return; // already reconnected or already removed

      const stillDisconnected =
        player.socketId === null &&
        player.disconnectedAt !== null &&
        Date.now() - player.disconnectedAt >= DISCONNECT_GRACE_PERIOD_MS;

      if (!stillDisconnected) return;

      const result = await removePlayerFromRoom(redis, roomCode, playerId);
      if ("error" in result) return;

      if (result.wasLastPlayer) return; // room deleted, nothing to broadcast

      const { updatedRoom, newHostId } = result;
      if (!updatedRoom) return;

      io.to(roomCode).emit("room:playerLeft", { playerId });
      io.to(roomCode).emit("room:update", toRoomView(updatedRoom));
      if (newHostId) {
        io.to(roomCode).emit("room:hostMigrated", { newHostId });
      }
    }, DISCONNECT_GRACE_PERIOD_MS);

    return;
  }

  // Explicit leave — remove immediately
  const result = await removePlayerFromRoom(redis, roomCode, playerId);
  if ("error" in result) return;

  socket.leave(roomCode);

  if (result.wasLastPlayer) return; // room gone, nothing to broadcast

  const { updatedRoom, newHostId } = result;
  if (!updatedRoom) return;

  io.to(roomCode).emit("room:playerLeft", { playerId });
  io.to(roomCode).emit("room:update", toRoomView(updatedRoom));
  if (newHostId) {
    io.to(roomCode).emit("room:hostMigrated", { newHostId });
  }
}

// ─── Handler registration ─────────────────────────────────────────────────

export function registerRoomHandlers(
  io: AppServer,
  socket: AppSocket,
  redis: Redis
): void {

  // room:create
  socket.on("room:create", async (payload: RoomCreatePayload, ack) => {
    const parsed = RoomCreatePayloadSchema.safeParse(payload);
    if (!parsed.success) {
      (ack as (r: RoomCreateAck | { ok: false; error: { code: string; message: string } }) => void)({
        ok: false,
        error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid payload" },
      });
      return;
    }

    const { username, avatar, settings } = parsed.data;
    const result = await createRoom(redis, username, avatar, settings);

    if ("error" in result) {
      (ack as (r: RoomCreateAck | { ok: false; error: { code: string; message: string } }) => void)({
        ok: false,
        error: { code: "VALIDATION_ERROR", message: result.error },
      });
      return;
    }

    const { room, playerId, sessionToken } = result;

    // Attach socket identity
    socket.data.playerId = playerId;
    socket.data.roomCode = room.code;
    await socket.join(room.code);
    await attachSocketToPlayer(redis, room.code, playerId, socket.id);

    (ack as (r: RoomCreateAck) => void)({
      roomCode: room.code,
      playerId,
      sessionToken,
      room: toRoomView(room),
    });
  });

  // room:join
  socket.on("room:join", async (payload: RoomJoinPayload, ack) => {
    const parsed = RoomJoinPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      (ack as (r: RoomJoinAck | { ok: false; error: { code: string; message: string } }) => void)({
        ok: false,
        error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid payload" },
      });
      return;
    }

    const { roomCode, username, avatar } = parsed.data;
    const result = await joinRoom(redis, roomCode, username, avatar);

    if ("error" in result) {
      (ack as (r: RoomJoinAck | { ok: false; error: { code: string; message: string } }) => void)({
        ok: false,
        error: { code: result.error, message: result.error },
      });
      return;
    }

    const { room, playerId, sessionToken } = result;

    socket.data.playerId = playerId;
    socket.data.roomCode = room.code;
    await socket.join(room.code);
    await attachSocketToPlayer(redis, room.code, playerId, socket.id);

    // Tell the joining player the full room state
    (ack as (r: RoomJoinAck) => void)({
      playerId,
      sessionToken,
      room: toRoomView(room),
    });

    // Tell everyone else a new player arrived
    socket.to(room.code).emit("room:playerJoined", {
      player: toRoomView(room).players.find((p) => p.id === playerId)!,
    });
    io.to(room.code).emit("room:update", toRoomView(room));
  });

  // room:reconnect
  socket.on("room:reconnect", async (payload: RoomReconnectPayload, ack) => {
    const parsed = RoomReconnectPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      (ack as (r: RoomReconnectAck | { ok: false; error: { code: string; message: string } }) => void)({
        ok: false,
        error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid payload" },
      });
      return;
    }

    const { roomCode, sessionToken } = parsed.data;

    // Resolve the player from the session token first so we know their
    // stable playerId. We need this before eviction — the evict function
    // matches by s.data.playerId, not by socket.id.
    const result = await reconnectPlayer(redis, roomCode, sessionToken, socket.id);

    if ("error" in result) {
      (ack as (r: RoomReconnectAck | { ok: false; error: { code: string; message: string } }) => void)({
        ok: false,
        error: { code: result.error, message: result.error },
      });
      return;
    }

    const { room, player } = result;

    // Now that we have the real playerId, evict any existing socket for this
    // seat (last-writer-wins). This prevents two tabs from holding the same
    // seat simultaneously. Must happen AFTER reconnectPlayer so we can pass
    // player.id (the stable UUID) rather than socket.id (which is not a playerId).
    await evictExistingSocket(io, roomCode, player.id, socket.id);

    socket.data.playerId = player.id;
    socket.data.roomCode = roomCode;
    await socket.join(roomCode);

    const roomView = toRoomView(room);
    const playerView = roomView.players.find((p) => p.id === player.id)!;

    // Fetch live game state if a game is in progress
    const engineState = room.state === "in-progress"
      ? await getEngineState(redis, roomCode)
      : null;

    const gameState = engineState ? toBroadcastGameState(engineState) : undefined;

    // Private view only if this player is still active (not eliminated)
    const enginePlayer = engineState?.players.find((p) => p.id === player.id);
    const topCard = enginePlayer?.pile[0];
    const privateView = topCard ? { topCard } : undefined;

    // Send recent chat history so reconnecting player doesn't miss messages
    const chatHistory = await getChatMessages(redis, roomCode);

    (ack as (r: RoomReconnectAck) => void)({
      player: playerView,
      room: roomView,
      gameState,
      privateView,
      chatHistory,
    });

    // Tell room this player is back online
    io.to(roomCode).emit("room:update", toRoomView(room));

    // Re-arm the turn timer on any reconnect when the game is awaiting a pick.
    // The timer lives only in process memory and is lost on server restart.
    // armTurnTimer is a no-op if a timer is already running for this room,
    // so it is safe to call for every reconnecting player — not just the picker.
    if (engineState && engineState.status === "awaiting-pick") {
      const { makeFinalizeRound } = await import("../game/gameHandlers.js");
      armTurnTimer(roomCode, engineState, makeFinalizeRound(io, redis));
    }
  });

  // room:leave
  socket.on("room:leave", async (ack) => {
    await handlePlayerLeave(io, redis, socket, "leave");
    (ack as (r: BasicAck) => void)({ ok: true });
  });

  // room:kick — host only
  socket.on("room:kick", async (payload: RoomKickPayload, ack) => {
    const parsed = RoomKickPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      (ack as (r: BasicAck) => void)({
        ok: false,
        error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid payload" },
      });
      return;
    }

    const { playerId, roomCode } = socket.data;
    if (!playerId || !roomCode) {
      (ack as (r: BasicAck) => void)({
        ok: false,
        error: { code: "VALIDATION_ERROR", message: "Not in a room." },
      });
      return;
    }

    const result = await kickPlayer(redis, roomCode, playerId, parsed.data.targetPlayerId);
    if ("error" in result) {
      (ack as (r: BasicAck) => void)({
        ok: false,
        error: { code: result.error, message: result.error },
      });
      return;
    }

    // Disconnect the kicked player's socket
    const kickedSocket = [...(await io.in(roomCode).fetchSockets())].find(
      (s) => s.data.playerId === parsed.data.targetPlayerId
    );
    if (kickedSocket) {
      kickedSocket.emit("error:actionFailed", {
        code: "SESSION_EXPIRED",
        message: "You have been removed from the room by the host.",
      });
      kickedSocket.leave(roomCode);
    }

    io.to(roomCode).emit("room:playerLeft", { playerId: parsed.data.targetPlayerId });
    io.to(roomCode).emit("room:update", toRoomView(result.room));
    (ack as (r: BasicAck) => void)({ ok: true });
  });

  // room:updateSettings — host + lobby only
  socket.on("room:updateSettings", async (payload: RoomUpdateSettingsPayload, ack) => {
    const parsed = RoomUpdateSettingsPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      (ack as (r: BasicAck) => void)({
        ok: false,
        error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid payload" },
      });
      return;
    }

    const { playerId, roomCode } = socket.data;
    if (!playerId || !roomCode) {
      (ack as (r: BasicAck) => void)({
        ok: false,
        error: { code: "VALIDATION_ERROR", message: "Not in a room." },
      });
      return;
    }

    const result = await updateRoomSettings(redis, roomCode, playerId, parsed.data.settings);
    if ("error" in result) {
      (ack as (r: BasicAck) => void)({
        ok: false,
        error: { code: result.error, message: result.error },
      });
      return;
    }

    io.to(roomCode).emit("room:update", toRoomView(result.room));
    (ack as (r: BasicAck) => void)({ ok: true });
  });

  // socket disconnect — triggers grace-period logic
  // This is the single authoritative disconnect handler for the socket.
  // index.ts must NOT register a second one (would double-fire leave logic).
  socket.on("disconnect", async (reason) => {
    console.log(`[Socket] Disconnected: ${socket.id} (${reason})`);
    await handlePlayerLeave(io, redis, socket, "disconnect");
  });
}

export { lockRoom };
