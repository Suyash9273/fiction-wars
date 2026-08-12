import { z } from "zod";
import { CardStatKeySchema } from "./card.js";

export const RevealSchema = z.object({
  playerId: z.string().min(1),
  username: z.string().min(1),   // included so the UI never needs a player lookup
  cardId: z.string().min(1),
  cardName: z.string().min(1),   // included so the UI can display the card without a catalog fetch
  accentColor: z.string().min(1),
  statValue: z.number(),
});
export type Reveal = z.infer<typeof RevealSchema>;

export const BattleLogEntrySchema = z.object({
  roundNumber: z.number().int().positive(),
  pickerId: z.string().min(1),
  statChosen: CardStatKeySchema,
  wasAutoPicked: z.boolean(), // transparency: did the turn timer resolve this, not the player?
  reveals: z.array(RevealSchema),
  winnerId: z.union([z.string().min(1), z.literal("pot-carried")]),
  timestamp: z.number().int(),
});
export type BattleLogEntry = z.infer<typeof BattleLogEntrySchema>;
