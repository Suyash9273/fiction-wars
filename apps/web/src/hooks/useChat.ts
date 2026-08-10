"use client";

import { useEffect } from "react";
import { getSocket } from "../socket/socketClient";
import { useChatStore } from "../store/chatStore";

/**
 * Subscribes to chat:* socket events, writes to chat store.
 * Mount once at the room page level.
 */
export function useChatSocketEvents(): void {
  const { addMessage, updateReactions } = useChatStore();

  useEffect(() => {
    const socket = getSocket();

    socket.on("chat:newMessage", ({ message }) => {
      addMessage(message);
    });

    socket.on("chat:reactionUpdated", ({ messageId, reactions }) => {
      updateReactions(messageId, reactions);
    });

    return () => {
      socket.off("chat:newMessage");
      socket.off("chat:reactionUpdated");
    };
  }, [addMessage, updateReactions]);
}