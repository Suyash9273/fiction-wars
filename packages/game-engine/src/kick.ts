import type { EngineState, EngineResult } from "./types.js";
import { assertCardCountInvariant } from "./invariants.js";

/**
 * Removes a player from the game and redistributes their pile round-robin
 * among the remaining active players.
 *
 * Rules (Section 2):
 * - If the kicked player already revealed a card this round, their revealed
 *   card is already removed from their pile by the round machinery — only
 *   the remaining undrawn pile gets redistributed. The server handles this
 *   by calling redistributePile AFTER resolveRound has consumed the top card.
 * - Card count invariant is enforced: total cards must not change.
 * - If kicking reduces active players to 1, the remaining player is the winner.
 * - If the kicked player was the current picker, the server's auto-pick
 *   fallback handles that before calling this function (see Feature 5).
 */
export function redistributePile(
  state: EngineState,
  kickedPlayerId: string
): EngineResult<EngineState> {
  const kickedPlayer = state.players.find((p) => p.id === kickedPlayerId);

  if (!kickedPlayer) {
    return {
      ok: false,
      reason: `Player ${kickedPlayerId} not found in active players.`,
    };
  }

  const remaining = state.players.filter((p) => p.id !== kickedPlayerId);

  if (remaining.length === 0) {
    return { ok: false, reason: "Cannot kick the last active player." };
  }

  // Round-robin distribution of the kicked player's cards
  const cardsToRedistribute = [...kickedPlayer.pile];
  const updatedRemaining = remaining.map((p) => ({ ...p, pile: [...p.pile] }));

  cardsToRedistribute.forEach((card, i) => {
    const targetPlayer = updatedRemaining[i % updatedRemaining.length]!;
    targetPlayer.pile.push(card);
  });

  // Determine if the game is now over (only 1 active player remains)
  const gameOver = updatedRemaining.length === 1;
  const gameWinnerId = gameOver ? updatedRemaining[0]!.id : undefined;

  // If the kicked player was the current picker, rotate to the next player
  let nextPickerId = state.currentPickerId;
  if (kickedPlayerId === state.currentPickerId) {
    const kickedIndex = state.players.findIndex((p) => p.id === kickedPlayerId);
    const nextIndex = kickedIndex % updatedRemaining.length;
    nextPickerId = updatedRemaining[nextIndex]!.id;
  }

  const updatedState: EngineState = {
    ...state,
    players: updatedRemaining,
    currentPickerId: nextPickerId,
    status: gameOver ? "game-over" : state.status,
    winnerId: gameWinnerId,
  };

  // Enforce the invariant — if this throws, it's a bug here, not a user error
  assertCardCountInvariant(state, updatedState);

  return { ok: true, value: updatedState };
}
