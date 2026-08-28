"use client"

import { io, type Socket } from "socket.io-client"
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@fiction-wars/shared-types"

// Typed socket — both directions use the contracts from shared-types,
// so any mismatch between client and server event shapes is a compile error.
export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

let socket: AppSocket | null = null

/**
 * Return the singleton socket instance (creates it lazily if needed).
 * The socket is created with autoConnect:false so it never connects until
 * connectSocket() is explicitly called — this is critical for the reconnect
 * flow, which must attach listeners before the first connect.
 */
export function getSocket(): AppSocket {
  if (!socket) {
    const serverUrl =
      process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000"
    socket = io(serverUrl, {
      autoConnect: false, // connect explicitly via connectSocket()
      reconnection: false, // we handle reconnect manually via session tokens
    }) as AppSocket
  }
  return socket
}

/**
 * Connects the socket if not already connected.
 * Returns a Promise that resolves once the socket is confirmed connected,
 * so callers can safely emit immediately after awaiting this.
 *
 * Pitfall avoided: calling socket.emit() on a not-yet-connected socket with
 * autoConnect:false silently drops the message. All reconnect/join/create
 * flows must await this before emitting.
 */
export function connectSocket(): Promise<void> {
  const s = getSocket()
  if (s.connected) return Promise.resolve()

  return new Promise((resolve) => {
    s.once("connect", () => resolve())
    s.connect()
  })
}

/**
 * Disconnects and destroys the socket instance.
 * Call on intentional leave (not on accidental disconnect).
 * After this, the next getSocket() call will create a fresh instance.
 */
export function destroySocket(): void {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
