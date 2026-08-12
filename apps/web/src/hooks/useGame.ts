"use client";

import { useEffect } from "react";
import { getSocket } from "../socket/socketClient";
import { useGameStore } from "../store/gameStore";
import { useRoomStore } from "../store/roomStore";

/**
 * Subscribes to all game:* and player:* socket events, writes to game store.
 * Mount once at the room page level alongside useRoomSocketEvents.
 */
export function useGameSocketEvents(): void {
  const {
    setGameState,
    setMyTopCard,
    appendBattleLogEntry,
    setSummary,
  } = useGameStore();

  const { playerId } = useRoomStore();

  useEffect(() => {
    const socket = getSocket();

    socket.on("game:started", ({ pileCounts, firstPickerId }) => {
      // Initialize GameState from the started event — turnDeadline and
      // currentPickerId are confirmed/overwritten by game:turnStarted
      // which arrives immediately after from the server.
      useGameStore.setState({
        gameState: {
          roomCode: "",         // filled in on first game:turnStarted
          currentPickerId: firstPickerId,
          roundNumber: 1,
          pot: [],
          status: "awaiting-pick",
          turnDeadline: Date.now() + 30_000, // placeholder — overwritten by turnStarted
          pileCounts,
        },
        battleLog: [],
        summary: null,
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
              roomCode: "",
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
      appendBattleLogEntry(battleLogEntry);
      useGameStore.setState((state) => ({
        gameState: state.gameState
          ? { ...state.gameState, pileCounts, status: "resolving" }
          : null,
      }));
    });

    socket.on("game:playerEliminated", ({ playerId: eliminatedId }) => {
      // Mark in room store — player stays in room as spectator
      useRoomStore.setState((state) => ({
        room: state.room
          ? {
              ...state.room,
              players: state.room.players.map((p) =>
                p.id === eliminatedId ? { ...p, status: "eliminated" } : p
              ),
            }
          : null,
      }));
    });

    socket.on("game:ended", ({ winnerId, summary }) => {
      setSummary(summary);
      useGameStore.setState((state) => ({
        gameState: state.gameState
          ? { ...state.gameState, status: "game-over", winnerId }
          : null,
      }));
    });

    // Private — only sent to this player's socket
    socket.on("player:privateView", ({ topCard }) => {
      setMyTopCard(topCard);
    });

    return () => {
      socket.off("game:started");
      socket.off("game:turnStarted");
      socket.off("game:roundResolved");
      socket.off("game:playerEliminated");
      socket.off("game:ended");
      socket.off("player:privateView");
    };
  }, [appendBattleLogEntry, setGameState, setMyTopCard, setSummary, playerId]);
}