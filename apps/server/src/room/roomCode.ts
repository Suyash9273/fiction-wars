import type { Redis } from "ioredis"
import { roomKey, ROOM_TTL_SECONDS } from "../constants.js"

// Charset deliberately excludes visually-ambiguous characters
// 0/O, 1/l/L - since players type these codes on their own
const CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const MAX_ATTEMPTS = 10;

function generateCode(): string {
    let code = ""
    const array = new Uint8Array(CODE_LENGTH)
    crypto.getRandomValues(array);
    for (const byte of array) {
        code += CHARSET[byte % CHARSET.length]
    }
    return code
}

/**
 * Generates a unique room code and atomically reserves it in Redis via
 * SET NX (set-if-not-exists). Returns null if all attempts collide
 * (extremely unlikely in practice — 32^6 = ~1 billion possible codes).
 */
export async function reserveRoomCode(redis: Redis): Promise<string | null> {
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const code = generateCode()
        // SET key placeholder NX EX ttl — only sets if the key doesn't exist.
        // This is atomic: no window between "check if exists" and "create".
        const result = await redis.set(
            roomKey(code),
            "__reserved__",
            "EX",
            ROOM_TTL_SECONDS,
            "NX"
        );
        if (result === "OK") return code;
    }
    return null; // collision exhaustion — should never happen at realistic scale
}