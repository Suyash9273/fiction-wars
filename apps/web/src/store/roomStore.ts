"use client";

import { create } from "zustand";
import type { RoomView, PublicPlayerView, RoomSettings } from "@fiction-wars/shared-types";

interface RoomState {
  // Identity
  playerId: string | null;
  sessionToken: string | null;

  // Room
  room: RoomView | null;

  // Internal flag: true while room:reconnect is in-flight so that
  // error:actionFailed(SESSION_EXPIRED) from evictExistingSocket is suppressed.
  _isReconnecting: boolean;

  // Setter fns
  setIdentity: (playerId: string, sessionToken: string) => void;
  setRoom: (room: RoomView) => void;
  updatePlayer: (player: PublicPlayerView) => void;
  removePlayer: (playerId: string) => void;
  setHost: (newHostId: string) => void;
  updateSettings: (settings: RoomSettings) => void;
  setReconnecting: (value: boolean) => void;
  clearRoom: () => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  playerId: null,
  sessionToken: null,
  room: null,
  _isReconnecting: false,

  setIdentity: (playerId, sessionToken) =>
    set({ playerId, sessionToken }),

  setRoom: (room) => set({ room }),

  updatePlayer: (player) =>
    set((state) => {
      if (!state.room) return state;
      const exists = state.room.players.some((p) => p.id === player.id);
      return {
        room: {
          ...state.room,
          players: exists
            ? state.room.players.map((p) => (p.id === player.id ? player : p))
            : [...state.room.players, player],
        },
      };
    }),

  removePlayer: (playerId) =>
    set((state) => {
      if (!state.room) return state;
      return {
        room: {
          ...state.room,
          players: state.room.players.filter((p) => p.id !== playerId),
        },
      };
    }),

  setHost: (newHostId) =>
    set((state) => {
      if (!state.room) return state;
      return { room: { ...state.room, hostPlayerId: newHostId } };
    }),

  updateSettings: (settings) =>
    set((state) => {
      if (!state.room) return state;
      return { room: { ...state.room, settings } };
    }),

  setReconnecting: (value) => set({ _isReconnecting: value }),

  clearRoom: () =>
    set({ room: null, playerId: null, sessionToken: null, _isReconnecting: false }),
}));

// Derived selectors — compute from store state rather than duplicating fields
export const selectIsHost = (state: RoomState): boolean =>
  !!state.playerId && state.room?.hostPlayerId === state.playerId;

export const selectMyPlayer = (state: RoomState): PublicPlayerView | null =>
  state.room?.players.find((p) => p.id === state.playerId) ?? null;
