"use client"

import {io, type Socket} from "socket.io-client"
import type {
    ClientToServerEvents,
    ServerToClientEvents
} from "@fiction-wars/shared-types"

// Typed socket — both directions use the contracts from shared-types,
// so any mismatch between client and server event shapes is a compile error.
export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

let socket: AppSocket | null = null

/**
 * Return the singleton socket instance
 * Never call this outside the socket/ or hooks/layer
 */

export function getSocket(): AppSocket {
    if(!socket) {
        const serverUrl = 
        process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000"
        socket = io(serverUrl, {
            autoConnect: false, //connect explicitly via connectSocket()
            reconnection: false // we handle reconnect manually with session tokens
        }) as AppSocket
    }
    return socket
}

/**
 * Connects the socket if not already connected.
 */
export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) s.connect();
}

/**
 * Disconnects and destroys the socket instance.
 * Call on intentional leave (not on accidental disconnect).
 */
export function destroySocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}