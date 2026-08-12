import type { CardStatKey } from "@fiction-wars/shared-types";
import type { EngineState, EnginePlayer, RoundResult, EngineResult } from "./types.js";
import { assertCardCountInvariant } from "./invariants.js";

/**
 * Resolves a round given a chosen stat.
 *
 * Rules (Section 2 of the brief):
 * - Each active player reveals their top card.
 * - Highest value in statChosen wins the round and collects all revealed
 *   cards + any pot carryover, placed at the bottom of their pile.
 * - On a full tie: all revealed cards go into the pot, carried to the next round.
 * - Eliminated players (pile === 0) are already removed from state.players
 *   before this is called — the engine only tracks active players.
 * - Win condition: last player standing after eliminations.
 * - Game-ending tie (2 players, both have 1 card, tie): handled by the
 *   caller (resolveRound is called in a loop until there's a real winner).
 */
export function resolveRound(
  state: EngineState,
  statChosen: CardStatKey,
  wasAutoPicked: boolean
): EngineResult<RoundResult> {
  if (state.status !== "awaiting-pick") {
    return { ok: false, reason: `Cannot resolve round — status is '${state.status}'.` };
  }

  if (state.players.length < 2) {
    return { ok: false, reason: "Cannot resolve round with fewer than 2 active players." };
  }

  // Each active player reveals their top card
  const reveals = state.players.map((player) => {
    const topCard = player.pile[0];
    if (!topCard) throw new Error(`Player ${player.id} has an empty pile — should have been eliminated.`);
    return {
      playerId: player.id,
      cardId: topCard.id,
      statValue: topCard.stats[statChosen],
      card: topCard,
    };
  });

  const maxStat = Math.max(...reveals.map((r) => r.statValue));
  const winners = reveals.filter((r) => r.statValue === maxStat);
  const revealedCards = reveals.map((r) => r.card);

  // Consume top card from each player's pile
  const playersAfterReveal: EnginePlayer[] = state.players.map((player) => ({
    ...player,
    pile: player.pile.slice(1),
  }));
  let roundWinnerId: string | "pot-carried";
  let nextPicker: string;
  let updatedPlayers: EnginePlayer[];
  let updatedPot: typeof state.pot;

  if (winners.length > 1) {
    // Full tie — all revealed cards go into the pot
    updatedPot = [...state.pot, ...revealedCards];
    roundWinnerId = "pot-carried";

    // Eliminate players who ran out of cards after revealing (edge case:
    // a player's last card is involved in a tie — they're now out)
    const stillActive = playersAfterReveal.filter((p) => p.pile.length > 0);

    // If only one player survives the tie (others had 1-card piles), they
    // collect the pot automatically — resolveRound is called again by the
    // server with whoever remains
    if (stillActive.length === 1) {
      const sole = stillActive[0]!;
      updatedPlayers = [{ ...sole, pile: [...sole.pile, ...updatedPot] }];
      updatedPot = [];
      roundWinnerId = sole.id;
      nextPicker = sole.id;
    } else {
      updatedPlayers = stillActive;
      // Picker stays the same on a tie (or cycles to next active if picker is eliminated)
      nextPicker = stillActive.find((p) => p.id === state.currentPickerId)?.id
        ?? stillActive[0]!.id;
    }
  } else {
    // Clear winner
    const winner = winners[0]!;
    const allWonCards = [...state.pot, ...revealedCards];
    updatedPot = [];
    roundWinnerId = winner.playerId;

    // Place won cards at the bottom of the winner's pile
    updatedPlayers = playersAfterReveal.map((player) =>
      player.id === winner.playerId
        ? { ...player, pile: [...player.pile, ...allWonCards] }
        : player
    );

    // Eliminate players with empty piles
    updatedPlayers = updatedPlayers.filter((p) => p.pile.length > 0);

    nextPicker = winner.playerId;
  }

  // Win condition: last player standing
  const gameOver = updatedPlayers.length === 1;
  const gameWinnerId = gameOver ? updatedPlayers[0]!.id : undefined;

  const battleLogEntry = {
    roundNumber: state.roundNumber,
    pickerId: state.currentPickerId,
    statChosen,
    wasAutoPicked,
    reveals: reveals.map((r) => ({
      playerId: r.playerId,
      username: "",       // enriched by server in gameHandlers before broadcast
      cardId: r.cardId,
      cardName: r.card.name,       // card is available here in the engine
      accentColor: r.card.accentColor,
      statValue: r.statValue,
    })),
    winnerId: roundWinnerId,
    timestamp: Date.now(),
  };

  const updatedState: EngineState = {
    ...state,
    players: updatedPlayers,
    pot: updatedPot,
    currentPickerId: gameOver ? state.currentPickerId : nextPicker,
    roundNumber: state.roundNumber + 1,
    status: gameOver ? "game-over" : "awaiting-pick",
    winnerId: gameWinnerId,
    battleLog: [...state.battleLog, battleLogEntry],
  };

  // Card count invariant: total cards in play must not change
  assertCardCountInvariant(state, updatedState);

  return {
    ok: true,
    value: {
      winnerId: roundWinnerId,
      reveals: reveals.map((r) => ({ playerId: r.playerId, cardId: r.cardId, statValue: r.statValue })),
      statChosen,
      wasAutoPicked,
      updatedState,
    },
  };
}

/**
 * Returns the stat key with the highest value on a given card.
 * Used by the turn-timer auto-pick fallback (Feature 5).
 */
export function bestStatForCard(
  pile: EnginePlayer["pile"]
): CardStatKey | null {
  const topCard = pile[0];
  if (!topCard) return null;

  const statKeys: CardStatKey[] = ["atk", "def", "speed", "hp"];
  return statKeys.reduce((best, key) =>
    topCard.stats[key] > topCard.stats[best] ? key : best
  );
}
