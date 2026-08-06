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