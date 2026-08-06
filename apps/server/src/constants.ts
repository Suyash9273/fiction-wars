// How long a room survives in Redis without being explicitly deleted.
// Protects against rooms that go idle without everyone properly leaving
// (e.g. everyone just closes the tab).
export const ROOM_TTL_SECONDS = 60 * 60 * 2; // 2 hours

// Short TTL for ended rooms — keep them alive long enough to show the
// post-game summary, then expire.
export const ENDED_ROOM_TTL_SECONDS = 60 * 15; // 15 minutes

// How long a disconnected player's session token remains valid before
// they're treated like a kick (Section 2 of the brief).
export const DISCONNECT_GRACE_PERIOD_MS = 30_000; // 30 seconds

export const roomKey = (code: string) => `room:${code}`;
export const chatKey = (code: string) => `chat:${code}`;
export const gameKey = (code: string) => `game:${code}`;
export const catalogKey = (code: string) => `catalog:${code}`;