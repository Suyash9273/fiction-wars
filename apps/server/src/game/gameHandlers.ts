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
  Room,
} from "@fiction-wars/shared-types";
import {
  GamePickStatPayloadSchema,
  toRoomView,
} from "@fiction-wars/shared-types";
import {
  buildDeck,
  shuffleCryptoRandom,
  resolveRound,
  redistributePile,
  bestStatForCard,
  computeSummary,
  type EngineState,
} from "@fiction-wars/game-engine";
import { getAllCards } from "@fiction-wars/card-catalog";
import { getRoom, saveRoom } from "../room/roomService.js";
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
import { lockRoom } from "../room/roomHandlers.js";
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

    const playerSocket = sockets.find((s) => s.data.playerId === player.id);
    if (!playerSocket) continue; // disconnected — they'll get it on reconnect

    playerSocket.emit("player:privateView", { topCard });
  }
}

// ─── Enrich battle log reveals with usernames ─────────────────────────────
// The engine is pure and does not know player names. We enrich the last
// battle log entry's reveals with usernames from the room record before
// broadcasting or persisting.

function enrichLastBattleLogEntry(
  state: EngineState,
  room: Room
): EngineState {
  const lastEntry = state.battleLog[state.battleLog.length - 1];
  if (!lastEntry) return state;

  const enrichedReveals = lastEntry.reveals.map((r) => ({
    ...r,
    username:
      room.players.find((p) => p.id === r.playerId)?.username ?? r.playerId,
  }));

  return {
    ...state,
    battleLog: [
      ...state.battleLog.slice(0, -1),
      { ...lastEntry, reveals: enrichedReveals },
    ],
  };
}

// ─── End the game ─────────────────────────────────────────────────────────
// Single path for all game-over outcomes: last-standing, round-cap, and
// post-kick auto-win. Extracted so mid-game kick can reuse it without
// duplicating the emit + persist sequence.

async function endGame(
  io: AppServer,
  redis: Redis,
  roomCode: string,
  state: EngineState,
  room: Room
): Promise<void> {
  const summary = computeSummary(state.battleLog);
  io.to(roomCode).emit("game:ended", {
    winnerId: state.winnerId!,
    summary: summary as GameEndedSummary,
  });

  const updatedRoom: Room = { ...room, state: "ended" };
  await Promise.all([
    saveEngineState(redis, roomCode, state, true),
    saveRoom(redis, updatedRoom),
  ]);
}

// ─── Handle a round end (shared by real pick + auto-pick) ─────────────────
// Also called by the mid-game kick path when the kicked player was the
// current picker (the kick handler calls finalizeRound after clearing the
// timer so we auto-pick on their behalf).

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

  // Idempotency guard — if the round was already resolved (e.g. a timer
  // fired at the same instant as a real pick), this is a safe no-op.
  if (state.status !== "awaiting-pick") return;

  const result = resolveRound(state, stat, wasAutoPicked);
  if (!result.ok) {
    console.error(`[Game] resolveRound failed for room ${roomCode}:`, result.reason);
    return;
  }

  // Enrich reveals with usernames before any broadcast or persist
  let updatedState = enrichLastBattleLogEntry(result.value.updatedState, room);

  // Check round-cap win condition before last-standing
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

  const battleLogEntry =
    updatedState.battleLog[updatedState.battleLog.length - 1]!;

  // Broadcast the round result
  io.to(roomCode).emit("game:roundResolved", { battleLogEntry, pileCounts });

  // Notify any players eliminated this round
  const previousPlayerIds = new Set(state.players.map((p) => p.id));
  const currentPlayerIds = new Set(updatedState.players.map((p) => p.id));
  for (const id of previousPlayerIds) {
    if (!currentPlayerIds.has(id)) {
      io.to(roomCode).emit("game:playerEliminated", { playerId: id });
    }
  }

  if (updatedState.status === "game-over") {
    await endGame(io, redis, roomCode, updatedState, room);
    return;
  }

  // ── Game-ending tie detection ────────────────────────────────────────────
  // A game-ending tie is: exactly 2 active players, the round was a tie
  // (pot-carried), both players still have cards (neither was eliminated by
  // the tie), and the pot is non-empty.
  //
  // Per the brief: replay immediately — the server auto-picks the best stat
  // for the current picker right away rather than waiting for a human pick.
  // This avoids an infinite stall where neither player can progress.
  //
  // We loop until the tie is broken. Each iteration is:
  //   1. Broadcast game:roundResolved so the client sees the tie
  //   2. Auto-pick the best stat and resolve again
  //   3. If still tied, loop; if won, fall through to normal end/continue
  //
  // We use a while loop with a circuit-breaker (MAX_TIE_REPLAYS) to guard
  // against a hypothetical bug producing an infinite loop. In practice the
  // deck is finite so the tie WILL break eventually.
  const MAX_TIE_REPLAYS = 200; // hard ceiling — far more than any real game
  let tieReplayCount = 0;
  let workingState = updatedState;

  while (
    workingState.status === "awaiting-pick" &&
    workingState.players.length === 2 &&
    battleLogEntry.winnerId === "pot-carried" &&
    workingState.pot.length > 0 &&
    tieReplayCount < MAX_TIE_REPLAYS
  ) {
    tieReplayCount++;

    // Find the best stat for the auto-picked turn
    const picker = workingState.players.find(
      (p) => p.id === workingState.currentPickerId
    );
    if (!picker) break;

    const autoStat = bestStatForCard(picker.pile);
    if (!autoStat) break;

    // Resolve the tie-replay round
    const tieResult = resolveRound(workingState, autoStat, true);
    if (!tieResult.ok) {
      console.error(
        `[Game] Tie-replay resolveRound failed for room ${roomCode}:`,
        tieResult.reason
      );
      break;
    }

    workingState = enrichLastBattleLogEntry(tieResult.value.updatedState, room);

    // Check round-cap win condition on each replay too
    const capWinner = checkRoundCapWinner(workingState, room.settings);
    if (capWinner) {
      workingState = { ...workingState, status: "game-over", winnerId: capWinner };
    }

    const replayPileCounts = Object.fromEntries(
      workingState.players.map((p) => [p.id, p.pile.length])
    );
    const replayEntry =
      workingState.battleLog[workingState.battleLog.length - 1]!;

    io.to(roomCode).emit("game:roundResolved", {
      battleLogEntry: replayEntry,
      pileCounts: replayPileCounts,
    });

    // Notify eliminations from this replay round
    const prevIds = new Set(
      tieResult.value.updatedState.players
        .map((p) => p.id) // before enrichment loses no players
    );
    const currIds = new Set(workingState.players.map((p) => p.id));
    // Simpler: compare original state to working state
    for (const p of updatedState.players) {
      if (!currIds.has(p.id) && previousPlayerIds.has(p.id)) {
        io.to(roomCode).emit("game:playerEliminated", { playerId: p.id });
      }
    }

    if (workingState.status === "game-over") {
      await endGame(io, redis, roomCode, workingState, room);
      return;
    }

    // Check if the tie is broken (a real winner emerged)
    const lastReplayEntry =
      workingState.battleLog[workingState.battleLog.length - 1]!;
    if (lastReplayEntry.winnerId !== "pot-carried") break; // tie broken — exit loop
  }

  // Sync pileCount on Room players from live engine state
  const roomWithPiles: Room = {
    ...room,
    players: room.players.map((p) => {
      const ep = workingState.players.find((e) => e.id === p.id);
      return ep ? { ...p, pileCount: ep.pile.length } : p;
    }),
  };
  await saveRoom(redis, roomWithPiles);

  // Persist the final state after all tie replays
  const nextDeadline = computeTurnDeadline(room.settings.turnTimerSeconds);
  const stateWithDeadline: EngineState = {
    ...workingState,
    turnDeadline: nextDeadline,
  };
  await saveEngineState(redis, roomCode, stateWithDeadline);

  io.to(roomCode).emit("game:turnStarted", {
    pickerId: stateWithDeadline.currentPickerId,
    turnDeadline: nextDeadline,
  });

  await emitPrivateViews(io, roomCode, stateWithDeadline);

  armTurnTimer(
    roomCode,
    stateWithDeadline,
    async (code, autoStat, auto) => {
      await finalizeRound(io, redis, code, autoStat, auto);
    }
  );
}

// ─── Mid-game kick ────────────────────────────────────────────────────────
// Called from roomHandlers when a kick happens during an in-progress game.
// Responsibilities:
//   1. Clear the turn timer FIRST to prevent a race with auto-pick
//   2. Redistribute the kicked player's pile
//   3. If game is now over (only 1 active player) → endGame
//   4. If the kicked player WAS the current picker → auto-pick for them
//      (calls finalizeRound so the round resolves cleanly)
//   5. Otherwise → re-arm the timer with the updated state
//
// The room record has already had the player removed by kickPlayer() in
// roomService before this is called — so room.players does NOT include the
// kicked player when we read it here.

export async function handleMidGameKick(
  io: AppServer,
  redis: Redis,
  roomCode: string,
  kickedPlayerId: string
): Promise<void> {
  const [state, room] = await Promise.all([
    getEngineState(redis, roomCode),
    getRoom(redis, roomCode),
  ]);

  if (!state || !room) return;

  // If the game is already over or hasn't started, nothing to do
  if (state.status === "game-over") return;

  // CRITICAL: clear the timer before touching state so the auto-pick
  // timer cannot fire concurrently with this kick resolution
  const kickedWasPicker = state.currentPickerId === kickedPlayerId;
  if (kickedWasPicker) {
    clearTurnTimer(roomCode);
  }

  // Redistribute the kicked player's pile among remaining active players
  const redistResult = redistributePile(state, kickedPlayerId);

  if (!redistResult.ok) {
    // Player was already eliminated (not in engine state) — nothing to do
    // This can happen if they ran out of cards right as the kick arrived
    console.warn(
      `[Game] redistributePile skipped for ${kickedPlayerId} in ${roomCode}: ${redistResult.reason}`
    );
    // Still need to re-arm the timer if we cleared it
    if (kickedWasPicker && state.status === "awaiting-pick") {
      const picker = state.players.find(
        (p) => p.id === state.currentPickerId
      );
      if (picker) {
        armTurnTimer(roomCode, state, async (code, autoStat, auto) => {
          await finalizeRound(io, redis, code, autoStat, auto);
        });
      }
    }
    return;
  }

  const updatedState = redistResult.value;

  // Notify all clients about the updated pile counts
  const pileCounts = Object.fromEntries(
    updatedState.players.map((p) => [p.id, p.pile.length])
  );

  // ── Auto-win: only 1 active player remains ───────────────────────────────
  if (updatedState.status === "game-over") {
    // Persist the ended state
    await saveEngineState(redis, roomCode, updatedState, true);

    // Emit pile counts update so clients see the redistribution
    io.to(roomCode).emit("game:pileCounts", { pileCounts });

    await endGame(io, redis, roomCode, updatedState, room);
    return;
  }

  // ── Kicked player was the current picker ─────────────────────────────────
  // Save updated engine state first so finalizeRound reads the correct state
  // (with the kicked player already removed and cards redistributed).
  if (kickedWasPicker) {
    // The new picker (after redistribution) takes the auto-pick turn.
    // Find the best stat for the new picker's top card.
    const newPicker = updatedState.players.find(
      (p) => p.id === updatedState.currentPickerId
    );

    // Set status back to awaiting-pick and persist so finalizeRound's
    // idempotency guard doesn't reject it
    const stateForFinalize: EngineState = {
      ...updatedState,
      status: "awaiting-pick",
      turnDeadline: computeTurnDeadline(room.settings.turnTimerSeconds),
    };

    await saveEngineState(redis, roomCode, stateForFinalize);

    // Emit the new turn info so clients know who picks next
    io.to(roomCode).emit("game:turnStarted", {
      pickerId: stateForFinalize.currentPickerId,
      turnDeadline: stateForFinalize.turnDeadline,
    });

    // Auto-pick the best stat for the new picker
    const autoStat = newPicker ? bestStatForCard(newPicker.pile) : null;

    if (autoStat) {
      // finalizeRound reads state from Redis, so it will see our saved state
      await finalizeRound(io, redis, roomCode, autoStat, true);
    } else {
      // New picker has no cards — shouldn't be possible after a valid
      // redistribution, but guard defensively
      console.error(
        `[Game] New picker ${updatedState.currentPickerId} has no cards after kick in ${roomCode}`
      );
    }
    return;
  }

  // ── Kicked player was NOT the current picker ──────────────────────────────
  // Just persist the updated state and re-arm the timer with the remaining
  // time so the current picker's turn continues uninterrupted.
  await saveEngineState(redis, roomCode, updatedState);

  // Sync pileCount on room record
  const roomWithPiles: Room = {
    ...room,
    players: room.players.map((p) => {
      const ep = updatedState.players.find((e) => e.id === p.id);
      return ep ? { ...p, pileCount: ep.pile.length } : p;
    }),
  };
  await saveRoom(redis, roomWithPiles);

  // Emit updated pile counts so all clients see the redistribution
  io.to(roomCode).emit("game:pileCounts", { pileCounts });

  // Re-arm with remaining time from the existing deadline (don't reset the clock)
  const stateWithExistingDeadline: EngineState = {
    ...updatedState,
    turnDeadline: state.turnDeadline, // preserve original deadline
  };
  armTurnTimer(
    roomCode,
    stateWithExistingDeadline,
    async (code, autoStat, auto) => {
      await finalizeRound(io, redis, code, autoStat, auto);
    }
  );
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

    const lockResult = await lockRoom(redis, roomCode, playerId);
    if ("error" in lockResult) {
      (ack as (r: BasicAck) => void)({
        ok: false,
        error: { code: "NOT_HOST", message: lockResult.error },
      });
      return;
    }

    const room = lockResult.room;

    let catalog;
    try {
      catalog = await getAllCards();
    } catch (err) {
      console.error("[Game] Failed to load catalog:", err);
      (ack as (r: BasicAck) => void)({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Failed to load card catalog. Please try again.",
        },
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

    const roomWithInitialPiles: Room = {
      ...room,
      players: room.players.map((p) => {
        const ep = engineState.players.find((e) => e.id === p.id);
        return ep ? { ...p, pileCount: ep.pile.length } : p;
      }),
    };

    await Promise.all([
      saveCatalogSnapshot(redis, roomCode, catalog),
      saveEngineState(redis, roomCode, engineState),
      saveRoom(redis, roomWithInitialPiles),
    ]);

    const pileCounts = Object.fromEntries(
      engineState.players.map((p) => [p.id, p.pile.length])
    );

    io.to(roomCode).emit("room:update", toRoomView(roomWithInitialPiles));
    io.to(roomCode).emit("game:started", { pileCounts, firstPickerId });
    io.to(roomCode).emit("game:turnStarted", { pickerId: firstPickerId, turnDeadline });

    await emitPrivateViews(io, roomCode, engineState);

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

    if (state.status !== "awaiting-pick") {
      (ack as (r: BasicAck) => void)({ ok: true }); // idempotent no-op
      return;
    }

    if (state.currentPickerId !== playerId) {
      (ack as (r: BasicAck) => void)({
        ok: false,
        error: { code: "NOT_YOUR_TURN", message: "It is not your turn to pick." },
      });
      return;
    }

    // CRITICAL: cancel timer BEFORE resolveRound to prevent double-resolution
    clearTurnTimer(roomCode);

    await finalizeRound(io, redis, roomCode, parsed.data.stat, false);
    (ack as (r: BasicAck) => void)({ ok: true });
  });
}

// ─── Exports ──────────────────────────────────────────────────────────────

export { emitPrivateViews, toBroadcastGameState };
export { deleteEngineState, deleteCatalogSnapshot };

/**
 * Returns a finalizeRound callback bound to io + redis.
 * Used by roomHandlers to re-arm the turn timer after reconnect without
 * creating a circular import.
 */
export function makeFinalizeRound(
  io: AppServer,
  redis: Redis
): (roomCode: string, stat: CardStatKey, wasAutoPicked: true) => Promise<void> {
  return async (roomCode, stat, wasAutoPicked) => {
    await finalizeRound(io, redis, roomCode, stat, wasAutoPicked);
  };
}
