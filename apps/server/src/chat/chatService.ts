import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import type { ChatMessage } from "@fiction-wars/shared-types";
import { chatKey, ROOM_TTL_SECONDS } from "../constants.js";

// Max messages kept per room. Beyond this the oldest messages are
// trimmed automatically — a defensive cap against spam, not a UX limit
// (normal gameplay never gets close to 150 messages).
const CHAT_MAX_MESSAGES = 150;

// ─── Push a message ───────────────────────────────────────────────────────

export async function pushChatMessage(
  redis: Redis,
  roomCode: string,
  playerId: string,
  username: string,
  text: string
): Promise<ChatMessage> {
  const message: ChatMessage = {
    id: randomUUID(),
    playerId,
    username,
    text,
    timestamp: Date.now(),
    reactions: [],
  };

  const serialized = JSON.stringify(message);
  const key = chatKey(roomCode);

  // Atomic pipeline: LPUSH (prepend newest) + LTRIM (keep last N) in one
  // round-trip. Without the pipeline, a concurrent push could read a list
  // that's already over cap before the trim fires.
  await redis
    .pipeline()
    .lpush(key, serialized)
    .ltrim(key, 0, CHAT_MAX_MESSAGES - 1)
    .expire(key, ROOM_TTL_SECONDS)
    .exec();

  return message;
}

// ─── Get recent messages ─────────────────────────────────────────────────

export async function getChatMessages(
  redis: Redis,
  roomCode: string
): Promise<ChatMessage[]> {
  const raw = await redis.lrange(chatKey(roomCode), 0, -1);
  // List is stored newest-first (LPUSH); reverse for chronological order
  return raw.reverse().map((r) => JSON.parse(r) as ChatMessage);
}

// ─── Toggle reaction ──────────────────────────────────────────────────────

export async function toggleReaction(
  redis: Redis,
  roomCode: string,
  messageId: string,
  playerId: string,
  emoji: string
): Promise<ChatMessage | null> {
  const key = chatKey(roomCode);
  const raw = await redis.lrange(key, 0, -1);

  const index = raw.findIndex((r) => {
    const msg = JSON.parse(r) as ChatMessage;
    return msg.id === messageId;
  });

  if (index === -1) return null;

  const message = JSON.parse(raw[index]!) as ChatMessage;

  // Toggle: if player already reacted with this emoji, remove them; else add
  const existingReaction = message.reactions.find((r) => r.emoji === emoji);

  if (existingReaction) {
    const alreadyReacted = existingReaction.playerIds.includes(playerId);
    message.reactions = message.reactions
      .map((r) =>
        r.emoji === emoji
          ? {
              ...r,
              playerIds: alreadyReacted
                ? r.playerIds.filter((id) => id !== playerId)
                : [...r.playerIds, playerId],
            }
          : r
      )
      .filter((r) => r.playerIds.length > 0); // clean up empty reaction groups
  } else {
    message.reactions = [
      ...message.reactions,
      { emoji, playerIds: [playerId] },
    ];
  }

  // Update the specific list element
  await redis.lset(key, index, JSON.stringify(message));

  return message;
}

// ─── Delete all chat for a room ───────────────────────────────────────────
// Called by deleteRoom in roomService when the last player leaves.
// Kept here as a named export for explicitness, but the key is also
// deleted atomically in roomService.deleteRoom via redis.del(...chatKey).

export async function deleteChatHistory(
  redis: Redis,
  roomCode: string
): Promise<void> {
  await redis.del(chatKey(roomCode));
}
