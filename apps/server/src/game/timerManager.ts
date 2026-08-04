import { bestStatForCard, type EngineState } from "@fiction-wars/game-engine";
import type { CardStatKey } from "@fiction-wars/shared-types";

// One timer per room — stored in memory on the server process.
// Timer state intentionally does NOT survive a server restart; game state
// is reconstructed from Redis on reconnect, and the timer is re-armed then.
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export type AutoPickCallback = (
  roomCode: string,
  stat: CardStatKey,
  wasAutoPicked: true
) => Promise<void>;

/**
 * Arms the turn timer for a room. When it fires, it auto-picks the best
 * stat from the current picker's top card and calls the provided callback
 * (which goes through the same resolveRound path as a legitimate pick).
 *
 * @param roomCode    - identifies the room
 * @param state       - current engine state (used to find the picker's pile)
 * @param onAutoPickCallback - async fn that resolves the round server-side
 */
export function armTurnTimer(
  roomCode: string,
  state: EngineState,
  onAutoPickCallback: AutoPickCallback
): void {
  clearTurnTimer(roomCode); // always cancel any existing timer first

  const picker = state.players.find((p: { id: string }) => p.id === state.currentPickerId);
  if (!picker) return; // picker already gone (kicked mid-setup) — caller handles this

  const stat = bestStatForCard(picker.pile);
  if (!stat) return; // picker has empty pile — shouldn't happen here, but guard anyway

  const msRemaining = Math.max(0, state.turnDeadline - Date.now());

  const timer = setTimeout(() => {
    timers.delete(roomCode);
    onAutoPickCallback(roomCode, stat, true).catch((err) => {
      console.error(`[timerManager] Auto-pick callback failed for room ${roomCode}:`, err);
    });
  }, msRemaining);

  timers.set(roomCode, timer);
}

/**
 * Cancels the active turn timer for a room.
 * Must be called immediately when a player sends a valid game:pickStat
 * event, before resolveRound is called, to prevent a race where both
 * the player's pick and the timer try to resolve the same round.
 */
export function clearTurnTimer(roomCode: string): void {
  const existing = timers.get(roomCode);
  if (existing !== undefined) {
    clearTimeout(existing);
    timers.delete(roomCode);
  }
}

/**
 * Clears all timers — call on graceful server shutdown or when all rooms
 * are cleaned up (e.g. in tests or dev hot-reload scenarios).
 */
export function clearAllTimers(): void {
  for (const timer of timers.values()) {
    clearTimeout(timer);
  }
  timers.clear();
}

/**
 * Returns the deadline (epoch ms) for a new turn given the configured
 * timer length in seconds. Call this when starting a new turn to set
 * EngineState.turnDeadline before arming the timer.
 */
export function computeTurnDeadline(turnTimerSeconds: number): number {
  return Date.now() + turnTimerSeconds * 1000;
}