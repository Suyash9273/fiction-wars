"use client";

import { useState } from "react";
import { useGameStore } from "@/store/gameStore";
import { useRoomStore, selectIsHost } from "@/store/roomStore";
import { CardDisplay } from "./CardDisplay";
import { StatPicker } from "./StatPicker";
import { TurnTimer } from "./TurnTimer";
import { RoundResult } from "./RoundResult";
import { PlayerStandings } from "./PlayerStandings";
import { PostGameSummary } from "./PostGameSummary";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AVATAR_COLORS } from "@/components/lobby/AvatarPicker";
import { emitKickPlayer } from "@/socket/socketEvents";
import type { AvatarId } from "@fiction-wars/shared-types";

interface Props {
  turnTimerSeconds: number;
}

export function GameView({ turnTimerSeconds }: Props) {
  const { gameState, myTopCard, battleLog, summary } = useGameStore();
  const { playerId, room } = useRoomStore();
  const isHost = useRoomStore(selectIsHost);
  const [playersOpen, setPlayersOpen] = useState(false);

  if (!gameState || !room) return null;

  const isMyTurn = gameState.currentPickerId === playerId;
  const myPlayer = room.players.find((p) => p.id === playerId);
  const isEliminated = myPlayer?.status === "eliminated";
  const isGameOver = gameState.status === "game-over";
  const lastEntry = battleLog[battleLog.length - 1];

  // Post-game summary
  if (isGameOver) {
    if (summary) return <PostGameSummary />;
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <p className="text-lg font-semibold">Game over!</p>
        <p className="text-sm text-muted-foreground">Loading results…</p>
      </div>
    );
  }

  const disconnectedPlayers = room.players.filter((p) => !p.isConnected);
  const currentPickerName =
    room.players.find((p) => p.id === gameState.currentPickerId)?.username ?? "…";

  return (
    <div className="flex flex-col gap-5">

      {/* Disconnected player warning */}
      {disconnectedPlayers.length > 0 && (
        <div className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
          {disconnectedPlayers.map((p) => p.username).join(", ")}{" "}
          {disconnectedPlayers.length === 1 ? "has" : "have"} disconnected —
          waiting for reconnect or timer expiry…
        </div>
      )}

      {/* Turn timer */}
      <TurnTimer totalSeconds={turnTimerSeconds} />

      {/* My card or spectator notice */}
      <section className="flex flex-col gap-3">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
          {isEliminated ? "Spectating" : "Your Card"}
        </h3>
        {isEliminated ? (
          <p className="text-sm text-muted-foreground">
            You have been eliminated. Watch the game or chat!
          </p>
        ) : myTopCard ? (
          <CardDisplay card={myTopCard} size="lg" />
        ) : (
          <p className="text-sm text-muted-foreground">Waiting for card…</p>
        )}
      </section>

      {/* Stat picker — only for the active picker */}
      {isMyTurn && !isEliminated && myTopCard && (
        <section className="flex flex-col gap-2">
          <StatPicker key={gameState.roundNumber} myStats={myTopCard.stats} />
        </section>
      )}

      {/* Waiting notice */}
      {!isMyTurn && !isEliminated && gameState.status === "awaiting-pick" && (
        <p className="text-sm text-center text-muted-foreground">
          Waiting for{" "}
          <span className="font-medium text-foreground">{currentPickerName}</span>{" "}
          to pick a stat…
        </p>
      )}

      {/* Last round result */}
      {lastEntry && (
        <section className="flex flex-col gap-2">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            Last Round
          </h3>
          <RoundResult entry={lastEntry} myPlayerId={playerId} />
        </section>
      )}

      {/* Live standings */}
      <section className="flex flex-col gap-2">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
          Standings
        </h3>
        <PlayerStandings />
      </section>

      {/* ── Players panel (host only) ──────────────────────────────────────
          Collapsible panel that shows all players with kick buttons.
          Only the host sees this — non-hosts have no kick capability so
          showing the panel to them adds noise with no benefit.
          We show it here inside GameView (not just in the lobby PlayerList)
          because the lobby section is hidden once room.state === "in-progress".
      */}
      {isHost && (
        <section className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setPlayersOpen((o) => !o)}
            className="flex items-center justify-between text-sm font-semibold text-muted-foreground uppercase tracking-wide w-full"
          >
            <span>Players</span>
            <span className="text-xs normal-case font-normal">
              {playersOpen ? "▲ hide" : "▼ show"}
            </span>
          </button>

          {playersOpen && (
            <div className="flex flex-col gap-1.5">
              {room.players.map((player) => {
                const isMe = player.id === playerId;
                const isPlayerHost = player.id === room.hostPlayerId;
                const pileCount = gameState.pileCounts[player.id] ?? 0;
                const isElim = player.status === "eliminated" || pileCount === 0;

                return (
                  <div
                    key={player.id}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md border px-3 py-2",
                      isElim && "opacity-50"
                    )}
                  >
                    {/* Avatar dot */}
                    <div
                      className={cn(
                        "h-7 w-7 flex-shrink-0 rounded-full",
                        AVATAR_COLORS[player.avatar as AvatarId]
                      )}
                    />

                    {/* Name + badges */}
                    <div className="flex flex-1 flex-wrap items-center gap-1.5 min-w-0">
                      <span className="font-medium text-sm truncate">
                        {player.username}
                        {isMe && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            (you)
                          </span>
                        )}
                      </span>
                      {isPlayerHost && (
                        <Badge variant="secondary" className="text-xs py-0">
                          Host
                        </Badge>
                      )}
                      {!player.isConnected && !isElim && (
                        <Badge variant="outline" className="text-xs py-0 text-muted-foreground">
                          Away
                        </Badge>
                      )}
                      {isElim && (
                        <Badge variant="destructive" className="text-xs py-0">
                          Out
                        </Badge>
                      )}
                    </div>

                    {/* Cards remaining */}
                    {!isElim && (
                      <span className="text-xs tabular-nums text-muted-foreground flex-shrink-0">
                        {pileCount}c
                      </span>
                    )}

                    {/* Kick button — host only, not for self */}
                    {!isMe && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive h-7 px-2 text-xs flex-shrink-0"
                        onClick={() =>
                          emitKickPlayer({ targetPlayerId: player.id })
                        }
                      >
                        Kick
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

    </div>
  );
}
