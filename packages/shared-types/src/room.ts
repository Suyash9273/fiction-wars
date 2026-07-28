import { z } from "zod";
import { PlayerSchema, PublicPlayerViewSchema, toPublicPlayerView, type Player } from "./player.js";

// Excludes visually-ambiguous characters (0/O, 1/I/L) since people type
// these codes by hand, not just click a shareable link.
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_CHARSET_REGEX = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
export const RoomCodeSchema = z
  .string()
  .length(ROOM_CODE_LENGTH)
  .regex(ROOM_CODE_CHARSET_REGEX, "Room code must be 6 characters from the allowed charset");

export const WIN_CONDITIONS = ["last-standing", "round-cap"] as const;
export const WinConditionSchema = z.enum(WIN_CONDITIONS);
export type WinCondition = z.infer<typeof WinConditionSchema>;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const MIN_TURN_TIMER_SECONDS = 10;
export const MAX_TURN_TIMER_SECONDS = 60;
export const MIN_ROUND_CAP = 3;
export const MAX_ROUND_CAP = 100;

export const RoomSettingsSchema = z
  .object({
    winCondition: WinConditionSchema,
    roundCap: z.number().int().min(MIN_ROUND_CAP).max(MAX_ROUND_CAP).optional(),
    turnTimerSeconds: z.number().int().min(MIN_TURN_TIMER_SECONDS).max(MAX_TURN_TIMER_SECONDS),
    maxPlayers: z.number().int().min(MIN_PLAYERS).max(MAX_PLAYERS),
  })
  .superRefine((settings, ctx) => {
    if(settings.winCondition === "round-cap" && settings.roundCap === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "round cap is required when win condition is round-cap",
        path: ["roundCap"],
      })
    }
  });
export type RoomSettings = z.infer<typeof RoomSettingsSchema>;

/**
 * Validates a settings update against the room's *current* player count —
 * can't be expressed in RoomSettingsSchema alone since that has no notion
 * of "current players." Section 2's rule: a host cannot set maxPlayers
 * below the room's current player count.
 */
export function isValidSettingsUpdate(
  settings: RoomSettings,
  currentPlayerCount: number
): { valid: true } | { valid: false; reason: string } {
  if (settings.maxPlayers < currentPlayerCount) {
    return {
      valid: false,
      reason: `maxPlayers (${settings.maxPlayers}) cannot be below the current player count (${currentPlayerCount})`,
    };
  }
  return { valid: true };
}

export const ROOM_STATES = ["lobby", "in-progress", "ended"] as const;
export const RoomStateSchema = z.enum(ROOM_STATES);
export type RoomState = z.infer<typeof RoomStateSchema>;

export const RoomSchema = z.object({
  code: RoomCodeSchema,
  hostPlayerId: z.string().min(1), // single source of truth for host identity
  players: z.array(PlayerSchema),
  settings: RoomSettingsSchema,
  state: RoomStateSchema,
  createdAt: z.number().int(),
});
export type Room = z.infer<typeof RoomSchema>;

export const RoomViewSchema = RoomSchema.omit({ players: true }).extend({
  players: z.array(PublicPlayerViewSchema),
});
export type RoomView = z.infer<typeof RoomViewSchema>;

/** The ONE place a Room is converted into what gets broadcast. */
export function toRoomView(room: Room): RoomView {
  const { players, ...rest } = room;
  return { ...rest, players: players.map(player => toPublicPlayerView(player)) };
}

export function isHost(player: Pick<Player, "id">, room: Pick<Room, "hostPlayerId">): boolean {
  return player.id === room.hostPlayerId;
}
