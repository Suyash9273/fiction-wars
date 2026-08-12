"use client";

import { useGameStore } from "@/store/gameStore";
import { useRoomStore } from "@/store/roomStore";
import { CardDisplay } from "./CardDisplay";
import { StatPicker } from "./StatPicker";
import { TurnTimer } from "./TurnTimer";
import { RoundResult } from "./RoundResult";
import { PlayerStandings } from "./PlayerStandings";
import { PostGameSummary } from "./PostGameSummary";

interface Props {
  turnTimerSeconds: number;
}

export function GameView({ turnTimerSeconds }: Props) {
  const { gameState, myTopCard, battleLog, summary } = useGameStore();
  const { playerId, room } = useRoomStore();

  if (!gameState || !room) return null;

  const isMyTurn = gameState.currentPickerId === playerId;
  const myPlayer = room.players.find((p) => p.id === playerId);
  const isEliminated = myPlayer?.status === "eliminated";
  const isGameOver = gameState.status === "game-over";
  const lastEntry = battleLog[battleLog.length - 1];

  // Post-game summary
  if (isGameOver && summary) {
    return <PostGameSummary />;
  }

  return (
    <div className="flex flex-col gap-5">
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

      {/* Stat picker — only shown to the active picker, not eliminated players */}
      {isMyTurn && !isEliminated && myTopCard && (
        <section className="flex flex-col gap-2">
          <StatPicker myStats={myTopCard.stats} />
        </section>
      )}

      {/* Waiting notice for non-pickers */}
      {!isMyTurn && !isEliminated && gameState.status === "awaiting-pick" && (
        <p className="text-sm text-center text-muted-foreground">
          Waiting for{" "}
          <span className="font-medium text-foreground">
            {room.players.find((p) => p.id === gameState.currentPickerId)?.username ?? "…"}
          </span>{" "}
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
    </div>
  );
}
