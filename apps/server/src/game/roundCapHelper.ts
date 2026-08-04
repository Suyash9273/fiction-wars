import type { EngineState } from "@fiction-wars/game-engine";
import type { RoomSettings } from "@fiction-wars/shared-types";

/**
 * Checks whether the round-cap win condition has been met and returns the
 * winner's playerId, or null if the game should continue.
 *
 * Win: player with the most cards. Tiebreak: highest total ATK across pile.
 * This is only called when winCondition === "round-cap".
 */
export function checkRoundCapWinner(
  state: EngineState,
  settings: RoomSettings
): string | null {
  if (settings.winCondition !== "round-cap") return null;
  if (!settings.roundCap) return null;
  if (state.roundNumber <= settings.roundCap) return null;
  if (state.players.length === 0) return null;

  // Sort by pile size desc, then by total ATK desc as tiebreak
  const ranked = [...state.players].sort((a, b) => {
    if (b.pile.length !== a.pile.length) return b.pile.length - a.pile.length;
    const atkA = a.pile.reduce((sum, c) => sum + c.stats.atk, 0);
    const atkB = b.pile.reduce((sum, c) => sum + c.stats.atk, 0);
    return atkB - atkA;
  });

  return ranked[0]!.id;
}