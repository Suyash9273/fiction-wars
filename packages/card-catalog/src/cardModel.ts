import { Schema, model } from "mongoose";
import { UNIVERSES } from "@fiction-wars/shared-types";

// NOTE: this file is intentionally NOT exported from index.ts. Nothing
// outside this package should import Mongoose types or the model directly
// — go through accessLayer.ts instead (Section 5 guardrail: "nothing
// outside card-catalog should import mongoose directly").

const cardStatsSchema = new Schema(
  {
    atk: { type: Number, required: true, min: 0 },
    def: { type: Number, required: true, min: 0 },
    speed: { type: Number, required: true, min: 0 },
    hp: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const cardSchema = new Schema(
  {
    // Stable, human-readable application-level key (e.g. "superman-dc").
    // Deliberately separate from Mongo's own _id — the rest of the app
    // (game-engine, shared-types' Card type) should never know or care
    // that MongoDB's ObjectId format exists.
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    universe: { type: String, required: true, enum: UNIVERSES },
    stats: { type: cardStatsSchema, required: true },
    accentColor: { type: String, required: true },
    imageUrl: { type: String },
  },
  { timestamps: true }
);

export const CardModel = model("Card", cardSchema);