"use client"

import {create} from "zustand";
import type {
    GameState,
    Card,
    BattleLogEntry,
    GameEndedSummary
} from "@fiction-wars/shared-types"

interface GameStoreState {
    gameState: GameState | null;
    myTopCard: Card | null; // private- only this player's top card, others should not see
    battleLog: BattleLogEntry[];
    summary: GameEndedSummary | null;

    setGameState: (state: GameState) => void;
    setMyTopCard: (card: Card) => void;
    appendBattleLogEntry: (entry: BattleLogEntry) => void;
    setSummary: (summary: GameEndedSummary) => void;
    clearGame: () => void;
}

export const useGameStore = create<GameStoreState>((set) => ({
  gameState: null,
  myTopCard: null,
  battleLog: [],
  summary: null,

  setGameState: (gameState) => set({ gameState }),

  setMyTopCard: (card) => set({ myTopCard: card }),

  appendBattleLogEntry: (entry) =>
    set((state) => ({ battleLog: [...state.battleLog, entry] })),

  setSummary: (summary) => set({ summary }),

  clearGame: () =>
    set({ gameState: null, myTopCard: null, battleLog: [], summary: null }),
}));

// Derived selectors
export const selectIsMyTurn = (playerId: string | null) =>
  (state: GameStoreState): boolean =>
    !!playerId && state.gameState?.currentPickerId === playerId;

export const selectSecondsRemaining = (state: GameStoreState): number => {
  if (!state.gameState) return 0;
  return Math.max(
    0,
    Math.ceil((state.gameState.turnDeadline - Date.now()) / 1000)
  );
};