import type { Server, Socket } from "socket.io";
import type { Redis } from "ioredis";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
  BasicAck,
} from "@fiction-wars/shared-types";
import {
  ChatSendMessagePayloadSchema,
  ChatAddReactionPayloadSchema,
} from "@fiction-wars/shared-types";
import { getRoom } from "../room/roomService.js";
import { pushChatMessage, toggleReaction, getChatMessages } from "./chatService.js";
import { consumeToken, cleanupBucket } from "./rateLimiter.js";

type AppServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export function registerChatHandlers(
  io: AppServer,
  socket: AppSocket,
  redis: Redis
): void {

  // chat:sendMessage
  socket.on("chat:sendMessage", async (payload, ack) => {
    const parsed = ChatSendMessagePayloadSchema.safeParse(payload);
    if (!parsed.success) {
      (ack as (r: BasicAck) => void)({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message ?? "Invalid message.",
        },
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

    // Rate limit check — applies regardless of player status (spectators
    // can still chat, but they're still subject to the rate limit)
    if (!consumeToken(socket.id)) {
      (ack as (r: BasicAck) => void)({
        ok: false,
        error: { code: "RATE_LIMITED", message: "You are sending messages too fast." },
      });
      return;
    }

    // Fetch username from room state — never trust client-supplied identity
    const room = await getRoom(redis, roomCode);
    if (!room) {
      (ack as (r: BasicAck) => void)({
        ok: false,
        error: { code: "ROOM_NOT_FOUND", message: "Room not found." },
      });
      return;
    }

    const player = room.players.find((p) => p.id === playerId);
    if (!player) {
      (ack as (r: BasicAck) => void)({
        ok: false,
        error: { code: "PLAYER_NOT_FOUND", message: "Player not found in room." },
      });
      return;
    }

    const message = await pushChatMessage(
      redis,
      roomCode,
      playerId,
      player.username, // username always comes from server state, not the client
      parsed.data.text
    );

    // Broadcast to everyone in the room including sender
    io.to(roomCode).emit("chat:newMessage", { message });
    (ack as (r: BasicAck) => void)({ ok: true });
  });

  // chat:addReaction
  socket.on("chat:addReaction", async (payload, ack) => {
    const parsed = ChatAddReactionPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      (ack as (r: BasicAck) => void)({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message ?? "Invalid reaction.",
        },
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

    const updated = await toggleReaction(
      redis,
      roomCode,
      parsed.data.messageId,
      playerId,
      parsed.data.emoji
    );

    if (!updated) {
      (ack as (r: BasicAck) => void)({
        ok: false,
        error: { code: "PLAYER_NOT_FOUND", message: "Message not found." },
      });
      return;
    }

    io.to(roomCode).emit("chat:reactionUpdated", {
      messageId: parsed.data.messageId,
      reactions: updated.reactions,
    });

    (ack as (r: BasicAck) => void)({ ok: true });
  });

  // Clean up rate limit bucket when socket disconnects
  socket.on("disconnect", () => {
    cleanupBucket(socket.id);
  });
}

// Exported for use in reconnect flow — lets the reconnecting client
// receive recent chat history without a separate request.
export { getChatMessages };
