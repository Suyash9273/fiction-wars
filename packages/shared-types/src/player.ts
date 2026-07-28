import { z } from "zod";
import { AvatarIdSchema } from "./avatar.js";

export const USERNAME_MIN_LENGTH = 1;
export const USERNAME_MAX_LENGTH = 24;
export const UsernameSchema = z.string().trim().min(USERNAME_MIN_LENGTH).max(USERNAME_MAX_LENGTH);

// Game-role axis only. Connection liveness (socketId/disconnectedAt) is a
// separate, orthogonal axis — see Section 3 of the brief for why these used
// to be conflated into one confusing status enum and no longer are.
export const PLAYER_STATUSES = ["active", "eliminated"] as const;
export const PlayerStatusSchema = z.enum(PLAYER_STATUSES);
export type PlayerStatus = z.infer<typeof PlayerStatusSchema>;

// Server-side domain truth. NEVER sent to other clients as-is — see
// PublicPlayerView / toPublicPlayerView below.
export const PlayerSchema = z.object({
  id: z.string().min(1), // stable across reconnects
  socketId: z.string().nullable(), // null while disconnected
  disconnectedAt: z.number().int().nullable(), // epoch ms; drives grace-period expiry
  username: UsernameSchema,
  avatar: AvatarIdSchema,
  status: PlayerStatusSchema, // "eliminated" implies spectator privileges automatically
  pileCount: z.number().int().nonnegative(),
  sessionToken: z.string().min(1), // NEVER broadcast to other clients
});
export type Player = z.infer<typeof PlayerSchema>;
// NOTE: no `isHost` field — host is derived as `player.id === room.hostPlayerId`
// (see room.ts), so there is exactly one source of truth for who the host is.

export const PublicPlayerViewSchema = PlayerSchema.omit({
  socketId: true,
  sessionToken: true,
}).extend({
  isConnected: z.boolean(), // derived from socketId !== null; safe to share
});
export type PublicPlayerView = z.infer<typeof PublicPlayerViewSchema>;

/**
 * The ONE place a Player is converted into what other clients are allowed
 * to see. Every feature that broadcasts player data must go through this
 * function — never hand-pick fields inline in a socket handler, or a
 * session token leak is one missed field away.
 */
export function toPublicPlayerView(player: Player): PublicPlayerView {
  const { socketId, sessionToken, ...rest } = player;
  void sessionToken; // explicitly discarded, not forwarded
  return { ...rest, isConnected: socketId !== null };
}
