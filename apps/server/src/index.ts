import { env } from "./env.js";
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";

const app = express();
app.use(cors({ origin: env.CLIENT_ORIGIN }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "fiction-wars-server", env: env.NODE_ENV });
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: env.CLIENT_ORIGIN },
});

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

httpServer.listen(env.PORT, () => {
  console.log(`Fiction Wars server listening on http://localhost:${env.PORT}`);
  console.log(`Health check: http://localhost:${env.PORT}/health`);
});