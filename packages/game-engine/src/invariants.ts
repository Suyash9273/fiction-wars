import type { EngineState } from "./types.js";

/**
 * Asserts the card count invariant: total cards across all piles + pot must
 * equal the same total before and after any engine operation.
 *
 * A kick-redistribution or round-resolution bug that silently loses or
 * duplicates a card would otherwise be invisible until the game hangs at
 * the end with wrong pile counts.
 */
export function assertCardCountInvariant(
  before: EngineState,
  after: EngineState
): void {
  const countBefore = totalCards(before);
  const countAfter = totalCards(after);

  if (countBefore !== countAfter) {
    throw new Error(
      `Card count invariant violated: ${countBefore} cards before, ${countAfter} after. ` +
        `This is a bug in the game engine.`
    );
  }
}

export function totalCards(state: EngineState): number {
  const inPiles = state.players.reduce((sum, p) => sum + p.pile.length, 0);
  return inPiles + state.pot.length;
}