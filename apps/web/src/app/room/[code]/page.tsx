"use client";

import { useParams, useRouter } from "next/navigation";
import { useRoomStore, selectIsHost } from "@/store/roomStore";
import { useRoomSocketEvents, useSessionPersistence } from "@/hooks/useRoom";
import { useGameSocketEvents } from "@/hooks/useGame";
import { useChatSocketEvents } from "@/hooks/useChat";
import { PlayerList } from "@/components/lobby/PlayerList";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { JoinRoomForm } from "@/components/lobby/JoinRoomForm";
import { GameView } from "@/components/game/GameView";
import { emitStartGame, emitLeaveRoom } from "@/socket/socketEvents";
import { clearSession } from "@/hooks/useRoom";
import { MIN_PLAYERS } from "@fiction-wars/shared-types";

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params.code as string).toUpperCase();

  const { room, playerId } = useRoomStore();
  const isHost = useRoomStore(selectIsHost);

  useSessionPersistence(code);
  useRoomSocketEvents();
  useGameSocketEvents();
  useChatSocketEvents();

  const isJoining = !playerId || !room;

  async function handleLeave() {
    clearSession(code);
    await emitLeaveRoom();
    useRoomStore.getState().clearRoom();
    router.push("/");
  }

  async function handleStartGame() {
    await emitStartGame();
  }

  if (isJoining) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6">
        <div className="w-full max-w-md">
          <h2 className="mb-4 text-2xl font-semibold">Join Room</h2>
          <JoinRoomForm prefillCode={code} />
        </div>
      </main>
    );
  }

  const canStart =
    isHost &&
    room.state === "lobby" &&
    room.players.length >= MIN_PLAYERS;

  return (
    <main className="flex min-h-screen flex-col gap-6 p-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Fiction Wars</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="font-mono text-sm text-muted-foreground">{code}</span>
            <button
              onClick={() =>
                navigator.clipboard.writeText(
                  `${window.location.origin}/room/${code}`
                )
              }
              className="text-xs text-muted-foreground underline"
            >
              Copy link
            </button>
            <Badge variant={room.state === "lobby" ? "secondary" : "default"}>
              {room.state}
            </Badge>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLeave}>
          Leave
        </Button>
      </div>

      {/* Lobby */}
      {room.state === "lobby" && (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="font-semibold">
              Players ({room.players.length}/{room.settings.maxPlayers})
            </h2>
            <PlayerList />
          </section>

          {isHost && (
            <Button onClick={handleStartGame} disabled={!canStart}>
              {canStart
                ? "Start Game"
                : `Need at least ${MIN_PLAYERS} players`}
            </Button>
          )}
        </>
      )}

      {/* In-game */}
      {(room.state === "in-progress" || room.state === "ended") && (
        <GameView turnTimerSeconds={room.settings.turnTimerSeconds} />
      )}
    </main>
  );
}
