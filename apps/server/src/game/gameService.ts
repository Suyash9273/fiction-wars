import type { Redis } from "ioredis";
import type { Card, GameState } from "@fiction-wars/shared-types";
import type { EngineState } from "@fiction-wars/game-engine";
import {
  ROOM_TTL_SECONDS,
  ENDED_ROOM_TTL_SECONDS,
  gameKey,
  catalogKey,
} from "../constants.js";

// ─── Persist / retrieve ───────────────────────────────────────────────────

export async function saveEngineState(
  redis: Redis,
  roomCode: string,
  state: EngineState,
  ended = false
): Promise<void> {
  const ttl = ended ? ENDED_ROOM_TTL_SECONDS : ROOM_TTL_SECONDS;
  await redis.set(gameKey(roomCode), JSON.stringify(state), "EX", ttl);
}

export async function getEngineState(
  redis: Redis,
  roomCode: string
): Promise<EngineState | null> {
  const raw = await redis.get(gameKey(roomCode));
  if (!raw) return null;
  return JSON.parse(raw) as EngineState;
}

export async function deleteEngineState(
  redis: Redis,
  roomCode: string
): Promise<void> {
  await redis.del(gameKey(roomCode));
}

// ─── Catalog snapshot ────────────────────────────────────────────────────
// Stored once per game so round resolution never touches MongoDB mid-match.

export async function saveCatalogSnapshot(
  redis: Redis,
  roomCode: string,
  cards: Card[]
): Promise<void> {
  await redis.set(
    catalogKey(roomCode),
    JSON.stringify(cards),
    "EX",
    ROOM_TTL_SECONDS
  );
}

export async function getCatalogSnapshot(
  redis: Redis,
  roomCode: string
): Promise<Card[] | null> {
  const raw = await redis.get(catalogKey(roomCode));
  if (!raw) return null;
  return JSON.parse(raw) as Card[];
}

export async function deleteCatalogSnapshot(
  redis: Redis,
  roomCode: string
): Promise<void> {
  await redis.del(catalogKey(roomCode));
}

// ─── Derive broadcast-safe GameState from EngineState ────────────────────

export function toBroadcastGameState(state: EngineState): GameState {
  return {
    roomCode: state.roomCode,
    currentPickerId: state.currentPickerId,
    roundNumber: state.roundNumber,
    pot: state.pot.map((card) => ({ cardId: card.id, fromPlayerId: "" })),
    status: state.status,
    turnDeadline: state.turnDeadline,
    winnerId: state.winnerId,
    pileCounts: Object.fromEntries(
      state.players.map((p) => [p.id, p.pile.length])
    ),
  };
}
