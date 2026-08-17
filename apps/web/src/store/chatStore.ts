"use client"

import {create} from "zustand"
import { ChatMessage } from "@fiction-wars/shared-types"

const MAX_CLIENT_MESSAGES = 150;

interface ChatState {
    messages: ChatMessage[];

    setMessages: (message: ChatMessage[]) => void;
    addMessage: (message: ChatMessage) => void;
    updateReactions: (messageId: string, reactions: ChatMessage["reactions"]) => void;
    clearChat: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
    messages: [],

    setMessages: (messages) => set({messages}),

    addMessage: (message) => 
        set((state) => {
            const updated = [...state.messages, message];
            // Enforce the client-side cap: drop oldest messages when we exceed
            // MAX_CLIENT_MESSAGES so the array never grows without bound.
            return {
                messages: updated.length > MAX_CLIENT_MESSAGES
                    ? updated.slice(updated.length - MAX_CLIENT_MESSAGES)
                    : updated,
            };
        }),
    
    updateReactions: (messageId, reactions) => 
        set((state) => ({
            messages: state.messages.map((m) => m.id === messageId ? {...m, reactions} : m)
        })),

    clearChat: () => set({messages: []})
}))