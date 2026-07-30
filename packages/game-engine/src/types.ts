import type { Card, CardStatKey, BattleLogEntry } from "@fiction-wars/shared-types";

// The engine's internal view of a player — only what the engine needs,
// no socket/session fields. Keeps the engine decoupled from Player (which
// lives in shared-types and carries fields the engine has no business knowing).
export interface EnginePlayer {
    id: string;
    pile: Card[];
}

export interface EngineState {
  roomCode: string;
  players: EnginePlayer[]; // only active (non-eliminated) players
  pot: Card[]; // cards carried over from tied rounds
  currentPickerId: string;
  roundNumber: number;
  turnDeadline: number; // epoch ms
  status: "awaiting-pick" | "resolving" | "game-over";
  winnerId?: string;
  battleLog: BattleLogEntry[];
}

export interface RoundResult {
  winnerId: string | "pot-carried"; // "pot-carried" if all active players tied
  reveals: { playerId: string; cardId: string; statValue: number }[];
  statChosen: CardStatKey;
  wasAutoPicked: boolean;
  updatedState: EngineState;
}

// Typed result — engine functions never throw for expected failures.
// The server maps ok:false to an error:actionFailed socket event.
export type EngineResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };
