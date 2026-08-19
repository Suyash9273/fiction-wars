import { z } from "zod";
import { CardSchema } from "./card.js";

export const RoundPotEntrySchema = z.object({
  cardId: z.string().min(1),
  fromPlayerId: z.string(), // intentionally empty string in broadcast GameState (server strips it for privacy)
});
export type RoundPotEntry = z.infer<typeof RoundPotEntrySchema>;

export const GAME_STATUSES = ["awaiting-pick", "resolving", "game-over"] as const;
export const GameStatusSchema = z.enum(GAME_STATUSES);
export type GameStatus = z.infer<typeof GameStatusSchema>;

// Safe to broadcast — deliberately contains no hidden pile contents.
export const GameStateSchema = z.object({
  roomCode: z.string().min(1),
  currentPickerId: z.string().min(1),
  roundNumber: z.number().int().positive(),
  pot: z.array(RoundPotEntrySchema),
  status: GameStatusSchema,
  turnDeadline: z.number().int(),
  winnerId: z.string().min(1).optional(),
  pileCounts: z.record(z.string(), z.number().int().nonnegative()), // playerId -> pile size, counts only
});
export type GameState = z.infer<typeof GameStateSchema>;

// Server-only. NEVER sent as-is to clients — deckAssignment is the hidden
// information the entire game depends on. See GameState above for the
// broadcast-safe counterpart, and PrivatePlayerView below for what each
// player is allowed to see of their own pile.
export const ServerGameStateSchema = GameStateSchema.extend({
  deckAssignment: z.record(z.string(), z.array(z.string())), // playerId -> full ordered pile (top = index 0)
});
export type ServerGameState = z.infer<typeof ServerGameStateSchema>;

// Sent ONLY to that player's own socket, never broadcast.
export const PrivatePlayerViewSchema = z.object({
  topCard: CardSchema,
});
export type PrivatePlayerView = z.infer<typeof PrivatePlayerViewSchema>;
