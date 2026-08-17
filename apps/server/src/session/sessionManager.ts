import type { Server } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "@fiction-wars/shared-types";

type AppServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/**
 * Finds and disconnects any existing socket for a given playerId in a room.
 * Called after reconnectPlayer resolves the playerId from the session token,
 * to enforce the single-active-connection-per-seat rule ("last-writer-wins").
 *
 * This prevents two browser tabs from holding the same seat simultaneously,
 * which would cause both to receive private card data and create split-brain
 * game state on the client.
 *
 * @param playerId        - the player's stable ID (NOT socket.id)
 * @param incomingSocketId - the new socket's id; this one is kept, all others evicted
 */
export async function evictExistingSocket(
  io: AppServer,
  roomCode: string,
  playerId: string,
  incomingSocketId: string
): Promise<void> {
  const sockets = await io.in(roomCode).fetchSockets();

  for (const s of sockets) {
    if (s.data.playerId === playerId && s.id !== incomingSocketId) {
      s.emit("error:actionFailed", {
        code: "SESSION_EXPIRED",
        message: "You connected from another device or tab. This session has been closed.",
      });
      s.disconnect(true);
    }
  }
}