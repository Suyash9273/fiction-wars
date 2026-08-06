import { z } from "zod";
import { AvatarIdSchema } from "./avatar.js";
import { UsernameSchema } from "./player.js";
import { PublicPlayerViewSchema } from "./player.js";
import { RoomSettingsSchema, RoomViewSchema, RoomCodeSchema, type RoomView } from "./room.js";
import { CardStatKeySchema } from "./card.js";
import { GameStateSchema, PrivatePlayerViewSchema, type PrivatePlayerView } from "./game.js";
import { BattleLogEntrySchema } from "./battleLog.js";
import { ChatMessageSchema, CHAT_MESSAGE_MAX_LENGTH, REACTION_EMOJI_MAX_LENGTH, ReactionSchema } from "./chat.js";
import { type ActionFailedPayload } from "./errors.js";

// =========================================================================
// Client -> Server payloads
// =========================================================================
// Authorization model (Section 4 of the brief): after room:create/join/
// reconnect establish a socket->player->room mapping server-side, every
// subsequent event is authorized against THAT mapping, never against a
// client-supplied playerId/roomCode. That's why events below room:join
// never carry a playerId field — the server already knows who's calling.

export const RoomCreatePayloadSchema = z.object({
  username: UsernameSchema,
  avatar: AvatarIdSchema,
  settings: RoomSettingsSchema,
});
export type RoomCreatePayload = z.infer<typeof RoomCreatePayloadSchema>;

export const RoomJoinPayloadSchema = z.object({
  roomCode: RoomCodeSchema,
  username: UsernameSchema,
  avatar: AvatarIdSchema,
});
export type RoomJoinPayload = z.infer<typeof RoomJoinPayloadSchema>;

export const RoomReconnectPayloadSchema = z.object({
  roomCode: RoomCodeSchema,
  sessionToken: z.string().min(1),
});
export type RoomReconnectPayload = z.infer<typeof RoomReconnectPayloadSchema>;

export const RoomKickPayloadSchema = z.object({
  targetPlayerId: z.string().min(1),
});
export type RoomKickPayload = z.infer<typeof RoomKickPayloadSchema>;

export const RoomUpdateSettingsPayloadSchema = z.object({
  settings: RoomSettingsSchema,
});
export type RoomUpdateSettingsPayload = z.infer<typeof RoomUpdateSettingsPayloadSchema>;

export const GamePickStatPayloadSchema = z.object({
  stat: CardStatKeySchema,
});
export type GamePickStatPayload = z.infer<typeof GamePickStatPayloadSchema>;

export const ChatSendMessagePayloadSchema = z.object({
  text: z.string().trim().min(1).max(CHAT_MESSAGE_MAX_LENGTH),
});
export type ChatSendMessagePayload = z.infer<typeof ChatSendMessagePayloadSchema>;

export const ChatAddReactionPayloadSchema = z.object({
  messageId: z.string().min(1),
  emoji: z.string().min(1).max(REACTION_EMOJI_MAX_LENGTH),
});
export type ChatAddReactionPayload = z.infer<typeof ChatAddReactionPayloadSchema>;

// =========================================================================
// Ack response payloads
// =========================================================================

export const RoomCreateAckSchema = z.object({
  roomCode: RoomCodeSchema,
  playerId: z.string().min(1),
  sessionToken: z.string().min(1),
});
export type RoomCreateAck = z.infer<typeof RoomCreateAckSchema>;

export const RoomJoinAckSchema = z.object({
  playerId: z.string().min(1),
  sessionToken: z.string().min(1),
  room: RoomViewSchema,
});
export type RoomJoinAck = z.infer<typeof RoomJoinAckSchema>;

export const RoomReconnectAckSchema = z.object({
  player: PublicPlayerViewSchema,
  room: RoomViewSchema,
  gameState: GameStateSchema.optional(),
  privateView: PrivatePlayerViewSchema.optional(),
  chatHistory: z.array(ChatMessageSchema).optional(),
});
export type RoomReconnectAck = z.infer<typeof RoomReconnectAckSchema>;

// Generic ack for simple fire-and-confirm events (leave, kick,
// updateSettings, start, pickStat, chat sends) — success has no payload
// beyond ok:true, failure always carries a typed ErrorCode.
export type BasicAck = { ok: true } | { ok: false; error: ActionFailedPayload };

// =========================================================================
// Server -> Client broadcast payloads
// =========================================================================

export const RoomPlayerJoinedPayloadSchema = z.object({ player: PublicPlayerViewSchema });
export type RoomPlayerJoinedPayload = z.infer<typeof RoomPlayerJoinedPayloadSchema>;

export const RoomPlayerLeftPayloadSchema = z.object({ playerId: z.string().min(1) });
export type RoomPlayerLeftPayload = z.infer<typeof RoomPlayerLeftPayloadSchema>;

export const RoomHostMigratedPayloadSchema = z.object({ newHostId: z.string().min(1) });
export type RoomHostMigratedPayload = z.infer<typeof RoomHostMigratedPayloadSchema>;

export const GameStartedPayloadSchema = z.object({
  pileCounts: z.record(z.string(), z.number().int().nonnegative()),
  firstPickerId: z.string().min(1),
});
export type GameStartedPayload = z.infer<typeof GameStartedPayloadSchema>;

export const GameTurnStartedPayloadSchema = z.object({
  pickerId: z.string().min(1),
  turnDeadline: z.number().int(),
});
export type GameTurnStartedPayload = z.infer<typeof GameTurnStartedPayloadSchema>;

export const GameRoundResolvedPayloadSchema = z.object({
  battleLogEntry: BattleLogEntrySchema,
  pileCounts: z.record(z.string(), z.number().int().nonnegative()),
});
export type GameRoundResolvedPayload = z.infer<typeof GameRoundResolvedPayloadSchema>;

export const GamePlayerEliminatedPayloadSchema = z.object({ playerId: z.string().min(1) });
export type GamePlayerEliminatedPayload = z.infer<typeof GamePlayerEliminatedPayloadSchema>;

// Matches the four post-game metrics named in Section 11 of the brief
// (rounds won per player, best stat categories, longest win streak,
// biggest pot claimed) — all pure derived data from the battle log.
export const GameEndedSummarySchema = z.object({
  roundsWonByPlayer: z.record(z.string(), z.number().int().nonnegative()),
  favoriteStatByPlayer: z.record(z.string(), CardStatKeySchema),
  longestWinStreak: z
    .object({ playerId: z.string().min(1), length: z.number().int().nonnegative() })
    .optional(),
  biggestPotClaimed: z
    .object({ playerId: z.string().min(1), cardCount: z.number().int().nonnegative() })
    .optional(),
});
export type GameEndedSummary = z.infer<typeof GameEndedSummarySchema>;

export const GameEndedPayloadSchema = z.object({
  winnerId: z.string().min(1),
  summary: GameEndedSummarySchema,
});
export type GameEndedPayload = z.infer<typeof GameEndedPayloadSchema>;

export const ChatNewMessagePayloadSchema = z.object({ message: ChatMessageSchema });
export type ChatNewMessagePayload = z.infer<typeof ChatNewMessagePayloadSchema>;

export const ChatReactionUpdatedPayloadSchema = z.object({
  messageId: z.string().min(1),
  reactions: z.array(ReactionSchema),
});
export type ChatReactionUpdatedPayload = z.infer<typeof ChatReactionUpdatedPayloadSchema>;

// =========================================================================
// Typed Socket.io event maps — the contract made concrete and importable,
// so apps/server and apps/web share one definition instead of each
// re-declaring event names/shapes and risking drift.
// =========================================================================

export interface ClientToServerEvents {
  "room:create": (
    payload: RoomCreatePayload,
    ack: (res: RoomCreateAck | { ok: false; error: ActionFailedPayload }) => void
  ) => void;
  "room:join": (
    payload: RoomJoinPayload,
    ack: (res: RoomJoinAck | { ok: false; error: ActionFailedPayload }) => void
  ) => void;
  "room:reconnect": (
    payload: RoomReconnectPayload,
    ack: (res: RoomReconnectAck | { ok: false; error: ActionFailedPayload }) => void
  ) => void;
  "room:leave": (ack: (res: BasicAck) => void) => void;
  "room:kick": (payload: RoomKickPayload, ack: (res: BasicAck) => void) => void;
  "room:updateSettings": (payload: RoomUpdateSettingsPayload, ack: (res: BasicAck) => void) => void;
  "game:start": (ack: (res: BasicAck) => void) => void;
  "game:pickStat": (payload: GamePickStatPayload, ack: (res: BasicAck) => void) => void;
  "chat:sendMessage": (payload: ChatSendMessagePayload, ack: (res: BasicAck) => void) => void;
  "chat:addReaction": (payload: ChatAddReactionPayload, ack: (res: BasicAck) => void) => void;
}

export interface ServerToClientEvents {
  "room:update": (payload: RoomView) => void;
  "room:playerJoined": (payload: RoomPlayerJoinedPayload) => void;
  "room:playerLeft": (payload: RoomPlayerLeftPayload) => void;
  "room:hostMigrated": (payload: RoomHostMigratedPayload) => void;
  "game:started": (payload: GameStartedPayload) => void;
  "game:turnStarted": (payload: GameTurnStartedPayload) => void;
  "game:roundResolved": (payload: GameRoundResolvedPayload) => void;
  "game:playerEliminated": (payload: GamePlayerEliminatedPayload) => void;
  "game:ended": (payload: GameEndedPayload) => void;
  "chat:newMessage": (payload: ChatNewMessagePayload) => void;
  "chat:reactionUpdated": (payload: ChatReactionUpdatedPayload) => void;
  /** Private — emitted to one socket only, never broadcast. */
  "player:privateView": (payload: PrivatePlayerView) => void;
  /** Private — sent only to the socket whose action failed. */
  "error:actionFailed": (payload: ActionFailedPayload) => void;
}

// No custom inter-server event map needed yet (single-instance for now);
// placeholder kept empty and typed so the Redis-adapter scale-out mentioned
// in Section 6 has a slot to fill in later without touching call sites.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface InterServerEvents {}

export interface SocketData {
  playerId: string;
  roomCode: string;
}
