import {z} from "zod"

export const UNIVERSES = ["DC", "Marvel", "Anime", "Other"] as const;
export const UniverseSchema = z.enum(UNIVERSES);
export type Universe = z.infer<typeof UniverseSchema>;

// Single source of truth for stat keys — both the Zod validator and the
// TypeScript type derive from this array, so adding/removing a stat later
// only ever happens in one place.
export const CARD_STAT_KEYS = ["atk", "def", "speed", "hp"] as const;
export const CardStatKeySchema = z.enum(CARD_STAT_KEYS);
export type CardStatKey = z.infer<typeof CardStatKeySchema>;

export const CardStatsSchema = z.object({
  atk: z.number().int().nonnegative(),
  def: z.number().int().nonnegative(),
  speed: z.number().int().nonnegative(),
  hp: z.number().int().nonnegative(),
});
export type CardStats = z.infer<typeof CardStatsSchema>;

export const CardSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  universe: UniverseSchema,
  stats: CardStatsSchema,
  accentColor: z.string().min(1), // placeholder-art era; hex or CSS color
  imageUrl: z.string().url().optional(), // populated later, no schema change needed
});
export type Card = z.infer<typeof CardSchema>;