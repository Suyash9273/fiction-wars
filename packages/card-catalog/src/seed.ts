// Standalone CLI entry point — NOT imported by the library.
// Run with: pnpm --filter @fiction-wars/card-catalog run seed
//
// This is the one file in card-catalog that reads process.env directly,
// since it's a CLI tool, not a library call (see connection.ts for why
// library functions take URI/dbName as params instead).

import dotenv from "dotenv";
import path from "path";

dotenv.config({
  path: path.resolve(process.cwd(), "../../.env"),
});

import mongoose from "mongoose";
import { CardModel } from "./cardModel.js";
import { SEED_CARDS } from "./seedData.js";

const MONGODB_URI = process.env["MONGODB_URI"];
const MONGODB_DB_NAME = process.env["MONGODB_DB_NAME"] ?? "fiction_wars_dev";

if (!MONGODB_URI) {
  console.error("MONGODB_URI is not set. Run this from apps/server or set the env var.");
  process.exit(1);
}

async function seed(): Promise<void> {
  console.log(`Connecting to MongoDB (db: ${MONGODB_DB_NAME})...`);
  await mongoose.connect(MONGODB_URI!, { dbName: MONGODB_DB_NAME });
  console.log("Connected.\n");

  console.log(`Upserting ${SEED_CARDS.length} cards...`);

  let upserted = 0;
  let unchanged = 0;

  for (const card of SEED_CARDS) {
    const result = await CardModel.updateOne(
      { id: card.id },        // match by stable app-level id
      { $set: card },         // update all fields
      { upsert: true }        // insert if not found
    );
    if (result.upsertedCount > 0 || result.modifiedCount > 0) {
      upserted++;
    } else {
      unchanged++;
    }
  }

  console.log(` Done — ${upserted} inserted/updated, ${unchanged} unchanged.`);
  console.log(` Total in catalog: ${await CardModel.countDocuments()}`);

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(" Seed failed:", err);
  process.exit(1);
});
