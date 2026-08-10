"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { connectSocket, getSocket } from "../socket/socketClient";
import { useRoomStore } from "../store/roomStore";
import { useChatStore } from "../store/chatStore";
import { useGameStore } from "../store/gameStore";

/**
 * Subscribes to all room:* socket events and writes results into the room
 * store. Must be mounted once at the room page level — not in individual
 * components. Components read from the store, never from socket directly.
 */
export function useRoomSocketEvents(): void {
  const {
    setRoom,
    updatePlayer,
    removePlayer,
    setHost,
  } = useRoomStore();
  const { clearGame } = useGameStore();
  const { clearChat, setMessages } = useChatStore();
  const router = useRouter();

  useEffect(() => {
    const socket = getSocket();

    socket.on("room:update", (room) => {
      setRoom(room);
    });

    socket.on("room:playerJoined", ({ player }) => {
      updatePlayer(player);
    });

    socket.on("room:playerLeft", ({ playerId }) => {
      removePlayer(playerId);
    });

    socket.on("room:hostMigrated", ({ newHostId }) => {
      setHost(newHostId);
    });

    // Kicked: server sends error:actionFailed with SESSION_EXPIRED
    socket.on("error:actionFailed", ({ code }) => {
      if (code === "SESSION_EXPIRED") {
        clearGame();
        clearChat();
        useRoomStore.getState().clearRoom();
        router.push("/");
      }
    });

    return () => {
      socket.off("room:update");
      socket.off("room:playerJoined");
      socket.off("room:playerLeft");
      socket.off("room:hostMigrated");
      socket.off("error:actionFailed");
    };
  }, [setRoom, updatePlayer, removePlayer, setHost, clearGame, clearChat, router]);
}

/**
 * Handles session token persistence and reconnect on page load.
 * Call once at the room page level before any UI renders.
 */
export function useSessionPersistence(roomCode: string): void {
  const { setIdentity, setRoom } = useRoomStore();
  const { setGameState, setMyTopCard } = useGameStore();
  const { setMessages } = useChatStore();

  useEffect(() => {
    const storedToken = localStorage.getItem(`fw:session:${roomCode}`);
    if (!storedToken) return;

    connectSocket();

    const socket = getSocket();

    socket.emit(
      "room:reconnect",
      { roomCode, sessionToken: storedToken },
      (res) => {
        // The failure shape has { ok: false, error }; the success shape has
        // { player, room, ... } with no ok field. Going through unknown
        // because TS won't directly widen between two non-overlapping unions.
        if ("ok" in res) {
          // Got the failure shape — session expired or room gone
          localStorage.removeItem(`fw:session:${roomCode}`);
          return;
        }
        const ack = res as unknown as import("@fiction-wars/shared-types").RoomReconnectAck;
        setIdentity(ack.player.id, storedToken);
        setRoom(ack.room);
        if (ack.gameState) setGameState(ack.gameState);
        if (ack.privateView) setMyTopCard(ack.privateView.topCard);
        if (ack.chatHistory) setMessages(ack.chatHistory);
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);
}

/**
 * Persists session token to localStorage after a successful join/create.
 */
export function persistSession(roomCode: string, sessionToken: string): void {
  localStorage.setItem(`fw:session:${roomCode}`, sessionToken);
}

/**
 * Clears session token on intentional leave.
 */
export function clearSession(roomCode: string): void {
  localStorage.removeItem(`fw:session:${roomCode}`);
}