"use client";

import { useEffect } from "react";
import { getSocket } from "../socket/socketClient";
import { useGameStore } from "../store/gameStore";
import { useRoomStore } from "../store/roomStore";

export function useGameSocketEvents(): void {
  useEffect(() => {
    const socket = getSocket();

    // game:started — server sends this immediately followed by game:turnStarted.
    // We intentionally leave turnDeadline at 0 here and let game:turnStarted
    // set the real deadline. Using Date.now() + N as a fallback was wrong
    // because it caused the timer to drift from the server's deadline.
    socket.on("game:started", ({ pileCounts, firstPickerId }) => {
      const roomCode = useRoomStore.getState().room?.code ?? "";
      useGameStore.setState({
        gameState: {
          roomCode,
          currentPickerId: firstPickerId,
          roundNumber: 1,
          pot: [],
          status: "awaiting-pick",
          turnDeadline: 0, // will be overwritten by the game:turnStarted that follows
          pileCounts,
        },
        battleLog: [],
        summary: null,
        myTopCard: null,
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

    // Pile counts change outside round resolution when a player is kicked mid-game
    socket.on("game:pileCounts", ({ pileCounts }) => {
      useGameStore.setState((state) => ({
        gameState: state.gameState
          ? { ...state.gameState, pileCounts }
          : null,
      }));
    });

    socket.on("game:playerEliminated", ({ playerId: eliminatedId }) => {
      useRoomStore.setState((state) => ({
        room: state.room
          ? {
              ...state.room,
              players: state.room.players.map((p) =>
                p.id === eliminatedId
                  ? { ...p, status: "eliminated" as const }
                  : p
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

    socket.on("player:privateView", ({ topCard }) => {
      useGameStore.setState({ myTopCard: topCard });
    });

    return () => {
      socket.off("game:started");
      socket.off("game:turnStarted");
      socket.off("game:roundResolved");
      socket.off("game:pileCounts");
      socket.off("game:playerEliminated");
      socket.off("game:ended");
      socket.off("player:privateView");
    };
  }, []);
}
