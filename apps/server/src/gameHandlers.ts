import type { Server, Socket } from "socket.io";
import type { Redis } from "ioredis";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
  BasicAck,
  CardStatKey,
  GameEndedSummary,
} from "@fiction-wars/shared-types";
import {
  GamePickStatPayloadSchema,
} from "@fiction-wars/shared-types";
import {
  buildDeck,
  shuffleCryptoRandom,
  resolveRound,
  computeSummary,
  type EngineState,
} from "@fiction-wars/game-engine";
import { getAllCards } from "@fiction-wars/card-catalog";
import { getRoom, saveRoom } from "./roomService.js";
import {
  saveEngineState,
  getEngineState,
  deleteEngineState,
  saveCatalogSnapshot,
  deleteCatalogSnapshot,
  toBroadcastGameState,
} from "./gameService.js";
import {
  armTurnTimer,
  clearTurnTimer,
  computeTurnDeadline,
} from "./timerManager.js";
import { lockRoom } from "./roomHandlers.js";
import { checkRoundCapWinner } from "./roundCapHelper.js";

type AppServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

// ─── Emit private top-card views to each player ───────────────────────────
// The single most important invariant: each player only sees their OWN
// top card. This function is called after game:started and after every
// round resolution. It NEVER broadcasts — always socket.to(playerId).

async function emitPrivateViews(
  io: AppServer,
  roomCode: string,
  state: EngineState
): Promise<void> {
  const sockets = await io.in(roomCode).fetchSockets();

  for (const player of state.players) {
    const topCard = player.pile[0];
    if (!topCard) continue;

    const playerSocket = sockets.find(
      (s) => s.data.playerId === player.id
    );
    if (!playerSocket) continue; // player disconnected — skip, they'll get it on reconnect

    playerSocket.emit("player:privateView", { topCard });
  }
}

// ─── Handle a round end (shared by real pick + auto-pick) ─────────────────

async function finalizeRound(
  io: AppServer,
  redis: Redis,
  roomCode: string,
  stat: CardStatKey,
  wasAutoPicked: boolean
): Promise<void> {
  const [state, room] = await Promise.all([
    getEngineState(redis, roomCode),
    getRoom(redis, roomCode),
  ]);

  if (!state || !room) return;
  if (state.status !== "awaiting-pick") return; // already resolved (idempotency guard)

  const result = resolveRound(state, stat, wasAutoPicked);
  if (!result.ok) {
    console.error(`[Game] resolveRound failed for room ${roomCode}:`, result.reason);
    return;
  }

  let updatedState = result.value.updatedState;
  const { battleLogEntry } = {
    battleLogEntry: updatedState.battleLog[updatedState.battleLog.length - 1]!,
  };

  // Check round-cap win condition before checking last-standing
  const roundCapWinnerId = checkRoundCapWinner(updatedState, room.settings);
  if (roundCapWinnerId) {
    updatedState = {
      ...updatedState,
      status: "game-over",
      winnerId: roundCapWinnerId,
    };
  }

  const pileCounts = Object.fromEntries(
    updatedState.players.map((p) => [p.id, p.pile.length])
  );

  // Broadcast round result to everyone
  io.to(roomCode).emit("game:roundResolved", {
    battleLogEntry,
    pileCounts,
  });

  // Notify eliminated players
  const previousPlayerIds = new Set(state.players.map((p) => p.id));
  const currentPlayerIds = new Set(updatedState.players.map((p) => p.id));
  for (const id of previousPlayerIds) {
    if (!currentPlayerIds.has(id)) {
      io.to(roomCode).emit("game:playerEliminated", { playerId: id });
    }
  }

  const gameOver = updatedState.status === "game-over";

  if (gameOver) {
    const summary = computeSummary(updatedState.battleLog);
    io.to(roomCode).emit("game:ended", {
      winnerId: updatedState.winnerId!,
      summary: summary as GameEndedSummary,
    });

    // Update room state to ended
    const updatedRoom = { ...room, state: "ended" as const };
    await Promise.all([
      saveEngineState(redis, roomCode, updatedState, true),
      saveRoom(redis, updatedRoom),
    ]);
    return;
  }

  // Game continues — persist, emit new turn, arm timer, send private views
  await saveEngineState(redis, roomCode, updatedState);

  const nextDeadline = computeTurnDeadline(room.settings.turnTimerSeconds);
  const stateWithDeadline: EngineState = {
    ...updatedState,
    turnDeadline: nextDeadline,
  };
  await saveEngineState(redis, roomCode, stateWithDeadline);

  io.to(roomCode).emit("game:turnStarted", {
    pickerId: stateWithDeadline.currentPickerId,
    turnDeadline: nextDeadline,
  });

  await emitPrivateViews(io, roomCode, stateWithDeadline);

  armTurnTimer(roomCode, stateWithDeadline, async (code, autoStat, auto) => {
    await finalizeRound(io, redis, code, autoStat, auto);
  });
}

// ─── Handler registration ─────────────────────────────────────────────────

export function registerGameHandlers(
  io: AppServer,
  socket: AppSocket,
  redis: Redis
): void {

  // game:start — host only, lobby only
  socket.on("game:start", async (ack) => {
    const { playerId, roomCode } = socket.data;
    if (!playerId || !roomCode) {
      (ack as (r: BasicAck) => void)({
        ok: false,
        error: { code: "VALIDATION_ERROR", message: "Not in a room." },
      });
      return;
    }

    // Lock the room first — validates host + min players + lobby state
    const lockResult = await lockRoom(redis, roomCode, playerId);
    if ("error" in lockResult) {
      (ack as (r: BasicAck) => void)({
        ok: false,
        error: { code: "NOT_HOST", message: lockResult.error },
      });
      return;
    }

    const room = lockResult.room;

    // Load catalog snapshot once — never touch MongoDB mid-game
    let catalog;
    try {
      catalog = await getAllCards();
    } catch (err) {
      // MongoDB failure must not crash an already-running game — but we're
      // still in start so it's safe to abort here
      console.error("[Game] Failed to load catalog:", err);
      (ack as (r: BasicAck) => void)({
        ok: false,
        error: { code: "VALIDATION_ERROR", message: "Failed to load card catalog. Please try again." },
      });
      return;
    }

    const playerIds = room.players.map((p) => p.id);
    const deckResult = buildDeck(catalog, playerIds, shuffleCryptoRandom);

    if (!deckResult.ok) {
      (ack as (r: BasicAck) => void)({
        ok: false,
        error: { code: "VALIDATION_ERROR", message: deckResult.reason },
      });
      return;
    }

    // Pick first picker randomly
    const firstPickerIndex = Math.floor(Math.random() * playerIds.length);
    const firstPickerId = playerIds[firstPickerIndex]!;
    const turnDeadline = computeTurnDeadline(room.settings.turnTimerSeconds);

    const engineState: EngineState = {
      roomCode,
      players: deckResult.value,
      pot: [],
      currentPickerId: firstPickerId,
      roundNumber: 1,
      turnDeadline,
      status: "awaiting-pick",
      battleLog: [],
    };

    // Persist both the catalog snapshot and the engine state
    await Promise.all([
      saveCatalogSnapshot(redis, roomCode, catalog),
      saveEngineState(redis, roomCode, engineState),
      saveRoom(redis, room),
    ]);

    const pileCounts = Object.fromEntries(
      engineState.players.map((p) => [p.id, p.pile.length])
    );

    // Broadcast game started — pile counts only, no card data
    io.to(roomCode).emit("game:started", { pileCounts, firstPickerId });
    io.to(roomCode).emit("game:turnStarted", { pickerId: firstPickerId, turnDeadline });

    // Send each player their own top card privately
    await emitPrivateViews(io, roomCode, engineState);

    // Arm the turn timer
    armTurnTimer(roomCode, engineState, async (code, autoStat, auto) => {
      await finalizeRound(io, redis, code, autoStat, auto);
    });

    (ack as (r: BasicAck) => void)({ ok: true });
  });

  // game:pickStat — current picker only
  socket.on("game:pickStat", async (payload, ack) => {
    const parsed = GamePickStatPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      (ack as (r: BasicAck) => void)({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message ?? "Invalid payload",
        },
      });
      return;
    }

    const { playerId, roomCode } = socket.data;
    if (!playerId || !roomCode) {
      (ack as (r: BasicAck) => void)({
        ok: false,
        error: { code: "VALIDATION_ERROR", message: "Not in a room." },
      });
      return;
    }

    const state = await getEngineState(redis, roomCode);
    if (!state) {
      (ack as (r: BasicAck) => void)({
        ok: false,
        error: { code: "VALIDATION_ERROR", message: "No active game." },
      });
      return;
    }

    // Idempotency guard — duplicate pick on an already-resolved round is a no-op
    if (state.status !== "awaiting-pick") {
      (ack as (r: BasicAck) => void)({ ok: true });
      return;
    }

    if (state.currentPickerId !== playerId) {
      (ack as (r: BasicAck) => void)({
        ok: false,
        error: { code: "NOT_YOUR_TURN", message: "It is not your turn to pick." },
      });
      return;
    }

    // CRITICAL: cancel timer BEFORE resolveRound — prevents double-resolution race
    clearTurnTimer(roomCode);

    await finalizeRound(io, redis, roomCode, parsed.data.stat, false);
    (ack as (r: BasicAck) => void)({ ok: true });
  });
}

// Export for use in roomHandlers reconnect path (Feature 8)
export { emitPrivateViews, toBroadcastGameState };
export { deleteEngineState, deleteCatalogSnapshot };
