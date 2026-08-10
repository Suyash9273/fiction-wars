"use client";

import type {
  RoomCreatePayload,
  RoomJoinPayload,
  RoomReconnectPayload,
  RoomKickPayload,
  RoomUpdateSettingsPayload,
  GamePickStatPayload,
  ChatSendMessagePayload,
  ChatAddReactionPayload,
  RoomCreateAck,
  RoomJoinAck,
  RoomReconnectAck,
  BasicAck,
  ActionFailedPayload,
} from "@fiction-wars/shared-types";
import { getSocket } from "./socketClient";

// ─── Helpers ──────────────────────────────────────────────────────────────

type AckResult<T> = T | { ok: false; error: ActionFailedPayload };

function emit<P, R>(event: string, payload: P): Promise<R> {
  return new Promise((resolve) => {
    (getSocket() as unknown as { emit: (e: string, p: P, cb: (r: R) => void) => void })
      .emit(event, payload, (res: R) => resolve(res));
  });
}

function emitNoPayload<R>(event: string): Promise<R> {
  return new Promise((resolve) => {
    (getSocket() as unknown as { emit: (e: string, cb: (r: R) => void) => void })
      .emit(event, (res: R) => resolve(res));
  });
}

// ─── Room ─────────────────────────────────────────────────────────────────

export function emitCreateRoom(
  payload: RoomCreatePayload
): Promise<AckResult<RoomCreateAck>> {
  return emit("room:create", payload);
}

export function emitJoinRoom(
  payload: RoomJoinPayload
): Promise<AckResult<RoomJoinAck>> {
  return emit("room:join", payload);
}

export function emitReconnect(
  payload: RoomReconnectPayload
): Promise<AckResult<RoomReconnectAck>> {
  return emit("room:reconnect", payload);
}

export function emitLeaveRoom(): Promise<BasicAck> {
  return emitNoPayload("room:leave");
}

export function emitKickPlayer(
  payload: RoomKickPayload
): Promise<BasicAck> {
  return emit("room:kick", payload);
}

export function emitUpdateSettings(
  payload: RoomUpdateSettingsPayload
): Promise<BasicAck> {
  return emit("room:updateSettings", payload);
}

// ─── Game ─────────────────────────────────────────────────────────────────

export function emitStartGame(): Promise<BasicAck> {
  return emitNoPayload("game:start");
}

export function emitPickStat(payload: GamePickStatPayload): Promise<BasicAck> {
  return emit("game:pickStat", payload);
}

// ─── Chat ─────────────────────────────────────────────────────────────────

export function emitSendMessage(
  payload: ChatSendMessagePayload
): Promise<BasicAck> {
  return emit("chat:sendMessage", payload);
}

export function emitAddReaction(
  payload: ChatAddReactionPayload
): Promise<BasicAck> {
  return emit("chat:addReaction", payload);
}