import { env } from "./env.js";
import mongoose from "mongoose";
import { Redis } from "ioredis";

async function checkMongo(): Promise<void> {
  console.log("→ Checking MongoDB Atlas connection...");
  await mongoose.connect(env.MONGODB_URI, {
    dbName: env.MONGODB_DB_NAME,
    serverSelectionTimeoutMS: 8000,
  });
  console.log(`✅ MongoDB connected (db: ${env.MONGODB_DB_NAME})`);
  await mongoose.disconnect();
}

async function checkRedis(): Promise<void> {
  console.log("→ Checking Redis connection...");
  const redis = new Redis(env.REDIS_URL, {
    keyPrefix: env.REDIS_KEY_PREFIX,
    connectTimeout: 8000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null, // don't hang retrying during this one-off check
  });

  try {
    const pong = await redis.ping();
    if (pong !== "PONG") throw new Error(`Unexpected PING response: ${pong}`);
    console.log(`✅ Redis connected (key prefix: "${env.REDIS_KEY_PREFIX}")`);
  } finally {
    redis.disconnect();
  }
}

async function main() {
  console.log("Fiction Wars — cloud services connectivity check\n");

  const results = await Promise.allSettled([checkMongo(), checkRedis()]);
  const failures = results.filter((r) => r.status === "rejected");

  if (failures.length > 0) {
    console.error("\n❌ One or more service checks failed:\n");
    for (const f of failures) {
      if (f.status === "rejected") console.error(`  - ${f.reason}`);
    }
    console.error(
      "\nCommon causes: wrong connection string in .env, or your IP isn't allowlisted on Atlas/Redis Cloud.\n"
    );
    process.exit(1);
  }

  console.log("\n✅ All cloud services reachable.\n");
  process.exit(0);
}

main();
