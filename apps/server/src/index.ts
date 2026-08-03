import { env } from "./env.js";
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "@fiction-wars/shared-types";
import { connectCatalog } from "@fiction-wars/card-catalog";
import { getRedisClient, closeRedisClient } from "./redis.js";
import { registerRoomHandlers } from "./roomHandlers.js";
import { clearAllTimers } from "./timerManager.js";

const app = express();
app.use(cors({ origin: env.CLIENT_ORIGIN }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "fiction-wars-server", env: env.NODE_ENV });
});

const httpServer = createServer(app);

const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(httpServer, {
  cors: { origin: env.CLIENT_ORIGIN },
});

const redis = getRedisClient();

io.on("connection", (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);
  registerRoomHandlers(io, socket, redis);

  socket.on("disconnect", (reason) => {
    console.log(`[Socket] Disconnected: ${socket.id} (${reason})`);
  });
});

async function start(): Promise<void> {
  // Connect to MongoDB once at boot — not per-socket or per-room.
  // A failure here exits the process; better to know immediately than
  // to serve requests that will all fail on the first catalog read.
  console.log("[Mongo] Connecting to catalog...");
  await connectCatalog(env.MONGODB_URI, env.MONGODB_DB_NAME);
  console.log("[Mongo] Connected.");

  httpServer.listen(env.PORT, () => {
    console.log(`Fiction Wars server listening on http://localhost:${env.PORT}`);
    console.log(`Health check: http://localhost:${env.PORT}/health`);
  });
}

// Graceful shutdown
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    console.log(`\nReceived ${signal} — shutting down.`);
    clearAllTimers();
    await closeRedisClient();
    httpServer.close(() => process.exit(0));
  });
}

start().catch((err) => {
  console.error("[Server] Failed to start:", err);
  process.exit(1);
});
