// Simple token bucket rate limiter — stored in memory per socket ID.
// Intentionally not in Redis: rate limit state should reset on reconnect
// (a fresh connection gets a fresh budget), and we don't need it to survive
// a server restart.

interface Bucket {
  tokens: number;
  lastRefill: number; // epoch ms
}

const buckets = new Map<string, Bucket>();

// Config: 5 messages per 3 seconds per socket
const MAX_TOKENS = 5;
const REFILL_INTERVAL_MS = 3000;
const TOKENS_PER_INTERVAL = 5;

/**
 * Returns true if the action is allowed, false if rate-limited.
 * Cleans up the bucket when the socket disconnects (call cleanupBucket).
 */
export function consumeToken(socketId: string): boolean {
  const now = Date.now();
  let bucket = buckets.get(socketId);

  if (!bucket) {
    bucket = { tokens: MAX_TOKENS, lastRefill: now };
    buckets.set(socketId, bucket);
  }

  // Refill tokens based on elapsed time
  const elapsed = now - bucket.lastRefill;
  if (elapsed >= REFILL_INTERVAL_MS) {
    const intervals = Math.floor(elapsed / REFILL_INTERVAL_MS);
    bucket.tokens = Math.min(
      MAX_TOKENS,
      bucket.tokens + intervals * TOKENS_PER_INTERVAL
    );
    bucket.lastRefill = now;
  }

  if (bucket.tokens <= 0) return false;

  bucket.tokens--;
  return true;
}

export function cleanupBucket(socketId: string): void {
  buckets.delete(socketId);
}
// ─── Room create/join rate limiter ───────────────────────────────────────
// Separate from the chat limiter: a socket can create/join at most
// ROOM_ACTION_MAX_TOKENS times per ROOM_ACTION_REFILL_MS window.
// In practice a real user does this once per session. The limit is generous
// enough that testing (rapid create → leave → create) is not blocked, but
// tight enough to prevent automated spam.

const ROOM_ACTION_MAX_TOKENS = 5;
const ROOM_ACTION_REFILL_MS = 10_000; // 10 seconds
const ROOM_ACTION_TOKENS_PER_INTERVAL = 5;

const roomActionBuckets = new Map<string, Bucket>();

export function consumeRoomActionToken(socketId: string): boolean {
  const now = Date.now();
  let bucket = roomActionBuckets.get(socketId);

  if (!bucket) {
    bucket = { tokens: ROOM_ACTION_MAX_TOKENS, lastRefill: now };
    roomActionBuckets.set(socketId, bucket);
  }

  const elapsed = now - bucket.lastRefill;
  if (elapsed >= ROOM_ACTION_REFILL_MS) {
    const intervals = Math.floor(elapsed / ROOM_ACTION_REFILL_MS);
    bucket.tokens = Math.min(
      ROOM_ACTION_MAX_TOKENS,
      bucket.tokens + intervals * ROOM_ACTION_TOKENS_PER_INTERVAL
    );
    bucket.lastRefill = now;
  }

  if (bucket.tokens <= 0) return false;

  bucket.tokens--;
  return true;
}

export function cleanupRoomActionBucket(socketId: string): void {
  roomActionBuckets.delete(socketId);
}
