import { type Card } from "@fiction-wars/shared-types";
import { CardModel } from "./cardModel.js";

// This is the ONLY file outside cardModel.ts that touches Mongoose. apps/server
// imports from here, never from cardModel.ts directly. That keeps the Mongoose
// dependency fully encapsulated inside this package (Section 5 guardrail).

/**
 * Returns the full card catalog as plain Card objects (Mongoose _id stripped).
 * Called once at game-start per room — not queried per-round.
 */
export async function getAllCards(): Promise<Card[]> {
  const docs = await CardModel.find({}, { _id: 0, __v: 0, createdAt: 0, updatedAt: 0 }).lean();
  return docs as Card[];
}

/**
 * Returns a single card by its application-level id (not Mongo's ObjectId).
 * Used for lookups during round resolution.
 */
export async function getCardById(id: string): Promise<Card | null> {
  const doc = await CardModel.findOne({ id }, { _id: 0, __v: 0, createdAt: 0, updatedAt: 0 }).lean();
  return doc as Card | null;
}

/**
 * Returns cards filtered by universe.
 */
export async function getCardsByUniverse(universe: Card["universe"]): Promise<Card[]> {
  const docs = await CardModel.find(
    { universe },
    { _id: 0, __v: 0, createdAt: 0, updatedAt: 0 }
  ).lean();
  return docs as Card[];
}

/**
 * Returns the total number of cards in the catalog — useful for the server
 * to verify there are enough cards before starting a game.
 */
export async function getCardCount(): Promise<number> {
  return CardModel.countDocuments();
}
