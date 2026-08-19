"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useGameStore } from "@/store/gameStore";
import { useRoomStore } from "@/store/roomStore";
import { BattleLog } from "./BattleLog";
import { emitLeaveRoom } from "@/socket/socketEvents";
import { clearSession } from "@/hooks/useRoom";
import type { CardStatKey } from "@fiction-wars/shared-types";

const STAT_LABELS: Record<CardStatKey, string> = {
  atk: "Attack",
  def: "Defense",
  speed: "Speed",
  hp: "HP",
};

export function PostGameSummary() {
  const router = useRouter();
  const { gameState, summary, battleLog } = useGameStore();
  const { room, playerId } = useRoomStore();

  if (!summary || !gameState?.winnerId || !room) return null;

  const winner = room.players.find((p) => p.id === gameState.winnerId);
  const isWinner = gameState.winnerId === playerId;

  async function handleLeave() {
    clearSession(room!.code);
    await emitLeaveRoom();
    useRoomStore.getState().clearRoom();
    router.push("/");
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* Winner announcement */}
      <div className="text-center">
        <p className="text-4xl">{isWinner ? "🏆" : "🎮"}</p>
        <h2 className="mt-2 text-2xl font-bold">
          {isWinner ? "You win!" : `${winner?.username ?? "?"} wins!`}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Round {(gameState.roundNumber ?? 1) - 1} played
        </p>
      </div>

      {/* Stats table */}
      <div className="flex flex-col gap-2">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
          Match Stats
        </h3>
        <div className="rounded-lg border divide-y">
          {room.players.map((player) => {
            const roundsWon = summary.roundsWonByPlayer[player.id] ?? 0;
            const favStat = summary.favoriteStatByPlayer[player.id];

            return (
              <div
                key={player.id}
                className="flex items-center justify-between px-3 py-2 text-sm"
              >
                <span className="font-medium">
                  {player.username}
                  {player.id === playerId && (
                    <span className="ml-1 text-muted-foreground">(you)</span>
                  )}
                </span>
                <div className="flex gap-4 text-right">
                  <div className="text-muted-foreground">
                    <span className="tabular-nums font-bold text-foreground">
                      {roundsWon}
                    </span>{" "}
                    won
                  </div>
                  {favStat && (
                    <div className="text-muted-foreground">
                      fav:{" "}
                      <span className="font-medium text-foreground">
                        {STAT_LABELS[favStat]}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bonus stats */}
        {summary.longestWinStreak && (
          <p className="text-sm text-muted-foreground">
            🔥 Longest streak:{" "}
            <span className="font-medium text-foreground">
              {room.players.find((p) => p.id === summary.longestWinStreak!.playerId)?.username}
            </span>{" "}
            ({summary.longestWinStreak.length} rounds)
          </p>
        )}
        {summary.biggestPotClaimed && (
          <p className="text-sm text-muted-foreground">
            💰 Biggest pot:{" "}
            <span className="font-medium text-foreground">
              {room.players.find((p) => p.id === summary.biggestPotClaimed!.playerId)?.username}
            </span>{" "}
            ({summary.biggestPotClaimed.cardCount} cards)
          </p>
        )}
      </div>

      {/* Full battle log */}
      {battleLog.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            Full Battle Log ({battleLog.length} rounds)
          </h3>
          <div className="max-h-48 overflow-y-auto rounded-lg border">
            <div className="p-2">
              <BattleLog entries={battleLog} myPlayerId={playerId} showAll />
            </div>
          </div>
        </div>
      )}

      <Button onClick={handleLeave} className="w-full">
        Leave Room
      </Button>
    </div>
  );
}
