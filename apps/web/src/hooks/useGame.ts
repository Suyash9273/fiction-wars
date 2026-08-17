"use client";

import { useEffect } from "react";
import { getSocket } from "../socket/socketClient";
import { useGameStore } from "../store/gameStore";
import { useRoomStore } from "../store/roomStore";

/**
 * Subscribes to all game:* and player:* socket events, writes to game store.
 * Mount once at the room page level alongside useRoomSocketEvents.
 *
 * IMPORTANT: the dependency array is intentionally empty []. Zustand setters
 * are stable references — they never change between renders, so including them
 * would cause the effect to re-run and re-register listeners unnecessarily.
 * playerId is read from the store inside handlers, not captured in closure.
 */
export function useGameSocketEvents(): void {
  useEffect(() => {
    const socket = getSocket();

    socket.on("game:started", ({ pileCounts, firstPickerId }) => {
      const roomCode = useRoomStore.getState().room?.code ?? "";
      useGameStore.setState({
        gameState: {
          roomCode,
          currentPickerId: firstPickerId,
          roundNumber: 1,
          pot: [],
          status: "awaiting-pick",
          turnDeadline: Date.now() + 30_000, // placeholder — overwritten by game:turnStarted
          pileCounts,
        },
        battleLog: [],
        summary: null,
        myTopCard: null, // clear stale card from any previous game
      });
    });

    socket.on("game:turnStarted", ({ pickerId, turnDeadline }) => {
      useGameStore.setState((state) => ({
        gameState: state.gameState
          ? {
              ...state.gameState,
              currentPickerId: pickerId,
              turnDeadline,
              status: "awaiting-pick" as const,
            }
          : {
              roomCode: useRoomStore.getState().room?.code ?? "",
              currentPickerId: pickerId,
              roundNumber: 1,
              pot: [],
              status: "awaiting-pick" as const,
              turnDeadline,
              pileCounts: {},
            },
      }));
    });

    socket.on("game:roundResolved", ({ battleLogEntry, pileCounts }) => {
      useGameStore.setState((state) => ({
        battleLog: [...state.battleLog, battleLogEntry],
        gameState: state.gameState
          ? {
              ...state.gameState,
              pileCounts,
              roundNumber: state.gameState.roundNumber + 1,
              status: "resolving" as const,
            }
          : null,
      }));
    });

    socket.on("game:playerEliminated", ({ playerId: eliminatedId }) => {
      useRoomStore.setState((state) => ({
        room: state.room
          ? {
              ...state.room,
              players: state.room.players.map((p) =>
                p.id === eliminatedId ? { ...p, status: "eliminated" as const } : p
              ),
            }
          : null,
      }));
    });

    socket.on("game:ended", ({ winnerId, summary }) => {
      useGameStore.setState((state) => ({
        summary,
        gameState: state.gameState
          ? { ...state.gameState, status: "game-over" as const, winnerId }
          : null,
      }));
    });

    // Private — only sent to this player's socket
    socket.on("player:privateView", ({ topCard }) => {
      useGameStore.getState().setMyTopCard(topCard);
    });

    return () => {
      socket.off("game:started");
      socket.off("game:turnStarted");
      socket.off("game:roundResolved");
      socket.off("game:playerEliminated");
      socket.off("game:ended");
      socket.off("player:privateView");
    };
  }, []); // intentionally empty — see comment above
}