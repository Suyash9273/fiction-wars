import type { Card } from "@fiction-wars/shared-types";
import type { EnginePlayer, EngineResult } from "./types.js";

/**
 * Selects N cards from the catalog and deals them evenly among players.
 *
 * N = floor(catalogSize / playerCount) * playerCount  (Section 2 rule)
 *
 * Randomness is injected via `shuffleFn` so the engine stays pure —
 * the server passes in a crypto-random shuffle; tests can pass a
 * deterministic one.
 */
export function buildDeck(
  catalog: Card[],
  playerIds: string[],
  shuffleFn: (cards: Card[]) => Card[]
): EngineResult<EnginePlayer[]> {
  const playerCount = playerIds.length;

  if (playerCount < 2) {
    return { ok: false, reason: "At least 2 players are required to start a game." };
  }

  if (catalog.length < playerCount) {
    return {
      ok: false,
      reason: `Catalog has ${catalog.length} cards but ${playerCount} players need at least 1 each.`,
    };
  }

  const totalCards = Math.floor(catalog.length / playerCount) * playerCount;
  const shuffled = shuffleFn([...catalog]); // never mutate the input
  const selected = shuffled.slice(0, totalCards);
  const cardsPerPlayer = totalCards / playerCount;

  const players: EnginePlayer[] = playerIds.map((id, i) => ({
    id,
    pile: selected.slice(i * cardsPerPlayer, (i + 1) * cardsPerPlayer),
  }));

  return { ok: true, value: players };
}

/**
 * Fisher-Yates shuffle using Math.random — fine for non-security use.
 * For the actual server we use a crypto-random version; this export
 * is provided as a convenient default for manual testing/dev.
 */
export function shuffleMathRandom<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Crypto-random Fisher-Yates shuffle — use this in apps/server.
 */
export function shuffleCryptoRandom<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const randomBuffer = new Uint32Array(1);
    crypto.getRandomValues(randomBuffer);
    const j = randomBuffer[0]! % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}