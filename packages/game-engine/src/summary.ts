import type { BattleLogEntry, CardStatKey, GameEndedSummary } from "@fiction-wars/shared-types";

/**
 * Computes the post-game summary entirely from the battle log — no extra
 * tracking needed during the game itself (Section 11 of the brief).
 */
export function computeSummary(battleLog: BattleLogEntry[]): GameEndedSummary {
  const roundsWonByPlayer: Record<string, number> = {};
  const statPicksByPlayer: Record<string, Record<CardStatKey, number>> = {};
  const biggestPot = { playerId: "", cardCount: 0 };

  let currentStreak = { playerId: "", length: 0 };
  let longestStreak = { playerId: "", length: 0 };

  for (const entry of battleLog) {
    if (entry.winnerId === "pot-carried") continue;

    const winner = entry.winnerId;

    // Rounds won
    roundsWonByPlayer[winner] = (roundsWonByPlayer[winner] ?? 0) + 1;

    // Stat picks — track per picker (who made the choice), not per winner
    const picker = entry.pickerId;
    if (!statPicksByPlayer[picker]) {
      statPicksByPlayer[picker] = { atk: 0, def: 0, speed: 0, hp: 0 };
    }
    statPicksByPlayer[picker]![entry.statChosen]++;

    // Biggest pot claimed (pot-carried rounds accumulate, then one round collects)
    // We approximate pot size as number of reveals (each player put 1 card in)
    const potSize = entry.reveals.length;
    if (potSize > biggestPot.cardCount) {
      biggestPot.playerId = winner;
      biggestPot.cardCount = potSize;
    }

    // Win streak
    if (winner === currentStreak.playerId) {
      currentStreak.length++;
    } else {
      currentStreak = { playerId: winner, length: 1 };
    }
    if (currentStreak.length > longestStreak.length) {
      longestStreak = { ...currentStreak };
    }
  }

  // Favorite stat = the stat each player picked most often
  const favoriteStatByPlayer: Record<string, CardStatKey> = {};
  for (const [playerId, picks] of Object.entries(statPicksByPlayer)) {
    const statKeys: CardStatKey[] = ["atk", "def", "speed", "hp"];
    favoriteStatByPlayer[playerId] = statKeys.reduce((best, key) =>
      (picks[key] ?? 0) > (picks[best] ?? 0) ? key : best
    );
  }

  return {
    roundsWonByPlayer,
    favoriteStatByPlayer,
    longestWinStreak:
      longestStreak.length > 0
        ? { playerId: longestStreak.playerId, length: longestStreak.length }
        : undefined,
    biggestPotClaimed:
      biggestPot.cardCount > 0
        ? { playerId: biggestPot.playerId, cardCount: biggestPot.cardCount }
        : undefined,
  };
}
