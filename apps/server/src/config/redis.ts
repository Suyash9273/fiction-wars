import { Redis } from "ioredis";
import { env } from "../env.js";

// Single Redis client instance for the whole server process.
// ioredis handles reconnection automatically — we don't need to manage that.
let client: Redis | null = null;

export function getRedisClient(): Redis {
  if (!client) {
    client = new Redis(env.REDIS_URL, {
      keyPrefix: env.REDIS_KEY_PREFIX,
      connectTimeout: 8000,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 200, 2000),
      lazyConnect: false,
    });

    client.on("error", (err) => {
      console.error("[Redis] Connection error:", err.message);
    });

    client.on("connect", () => {
      console.log(`[Redis] Connected (prefix: "${env.REDIS_KEY_PREFIX}")`);
    });
  }
  return client;
}

export async function closeRedisClient(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
