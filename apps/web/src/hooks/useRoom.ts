"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { connectSocket, getSocket, destroySocket } from "../socket/socketClient";
import { useRoomStore } from "../store/roomStore";
import { useChatStore } from "../store/chatStore";
import { useGameStore } from "../store/gameStore";

/**
 * Subscribes to all room:* socket events and writes results into the room
 * store. Must be mounted once at the room page level — not in individual
 * components. Components read from the store, never from socket directly.
 */
export function useRoomSocketEvents(): void {
  const { setRoom, updatePlayer, removePlayer, setHost } = useRoomStore();
  const { clearGame } = useGameStore();
  const { clearChat } = useChatStore();
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

    // Kicked: server sends error:actionFailed with SESSION_EXPIRED.
    //
    // Pitfall: the server also sends SESSION_EXPIRED when it evicts a stale
    // tab during a legitimate reconnect (evictExistingSocket). We must NOT
    // redirect in that case — the evicted socket is the OLD tab, and the new
    // tab (which sent room:reconnect) should continue normally.
    //
    // We distinguish the two via a flag set by useSessionPersistence:
    //   - isReconnecting=true  → this tab just sent room:reconnect; ignore the
    //                            SESSION_EXPIRED that evicts our own old socket
    //   - isReconnecting=false → we are already settled; SESSION_EXPIRED means
    //                            we genuinely got kicked
    socket.on("error:actionFailed", ({ code }) => {
      if (code === "SESSION_EXPIRED") {
        const isReconnecting = useRoomStore.getState()._isReconnecting;
        if (isReconnecting) {
          // Suppress: this SESSION_EXPIRED is aimed at our own stale tab
          // being evicted by the server, not at us.
          return;
        }
        // Genuine kick or expired session — clear state and go home.
        clearGame();
        clearChat();
        useRoomStore.getState().clearRoom();
        destroySocket();
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
 * Handles session token persistence and reconnect on page load / page refresh.
 *
 * Reconnect timing pitfalls avoided:
 * 1. We attach the room:update listener BEFORE connecting so we never miss
 *    an early broadcast.
 * 2. We await connectSocket() before emitting room:reconnect so the emit
 *    never fires on a disconnected socket (autoConnect:false would silently
 *    drop it).
 * 3. We set _isReconnecting=true for the duration so that the error:
 *    actionFailed handler in useRoomSocketEvents ignores the SESSION_EXPIRED
 *    that the server sends to evict our own old socket.
 * 4. On ack, we seed the full game + chat state so a mid-game refresh
 *    results in a fully hydrated UI.
 */
export function useSessionPersistence(roomCode: string): void {
  const { setIdentity, setRoom, setReconnecting } = useRoomStore();
  const { setGameState, setMyTopCard, setBattleLog } = useGameStore();
  const { setMessages } = useChatStore();
  const didAttempt = useRef(false);

  useEffect(() => {
    if (didAttempt.current) return; // strict-mode double-fire guard
    didAttempt.current = true;

    const storedToken = localStorage.getItem(`fw:session:${roomCode}`);
    if (!storedToken) return;

    const socket = getSocket();

    // Register the early room:update listener BEFORE connecting.
    // The server emits room:update to the whole room right after processing
    // room:reconnect. If useRoomSocketEvents hasn't mounted yet (separate
    // useEffect), this catches the broadcast.
    const handleEarlyRoomUpdate = (
      room: import("@fiction-wars/shared-types").RoomView
    ) => {
      setRoom(room);
    };
    socket.once("room:update", handleEarlyRoomUpdate);

    // Signal that we are mid-reconnect so error:actionFailed suppresses the
    // SESSION_EXPIRED sent to our own evicted old socket.
    setReconnecting(true);

    // Await the connection before emitting — critical with autoConnect:false.
    connectSocket().then(() => {
      socket.emit(
        "room:reconnect",
        { roomCode, sessionToken: storedToken },
        (res) => {
          // Always clear the reconnecting flag when the ack arrives.
          setReconnecting(false);

          // Failure shape: { ok: false, error }
          if ("ok" in res) {
            socket.off("room:update", handleEarlyRoomUpdate);
            localStorage.removeItem(`fw:session:${roomCode}`);
            return;
          }

          // Success shape: RoomReconnectAck
          const ack =
            res as unknown as import("@fiction-wars/shared-types").RoomReconnectAck;

          setIdentity(ack.player.id, storedToken);
          setRoom(ack.room);

          if (ack.gameState) setGameState(ack.gameState);
          if (ack.privateView) setMyTopCard(ack.privateView.topCard);
          // Seed the battle log from reconnect ack so mid-game refreshes
          // restore the full round history, not just the current turn state.
          if (ack.battleLog) setBattleLog(ack.battleLog);
          if (ack.chatHistory) setMessages(ack.chatHistory);
        }
      );
    });

    return () => {
      // Clean up the early listener if the component unmounts before the ack.
      socket.off("room:update", handleEarlyRoomUpdate);
      // Do NOT clear the reconnecting flag on unmount — the ack callback
      // does that. Clearing it here would create a race.
    };
    // roomCode is stable for the lifetime of this page render.
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
