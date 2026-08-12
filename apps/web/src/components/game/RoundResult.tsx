"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { BattleLogEntry, CardStatKey } from "@fiction-wars/shared-types";

const STAT_LABELS: Record<CardStatKey, string> = {
  atk: "ATK",
  def: "DEF",
  speed: "SPD",
  hp: "HP",
};

interface Props {
  entry: BattleLogEntry;
  myPlayerId: string | null;
}

export function RoundResult({ entry, myPlayerId }: Props) {
  const isPotCarried = entry.winnerId === "pot-carried";

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          Round {entry.roundNumber} ·{" "}
          <span className="font-medium text-foreground">
            {STAT_LABELS[entry.statChosen]}
          </span>
          {entry.wasAutoPicked && (
            <span className="ml-1 text-xs text-muted-foreground">(auto)</span>
          )}
        </span>
        {isPotCarried ? (
          <Badge variant="secondary">Tie — pot grows</Badge>
        ) : (
          <Badge variant="default">
            {entry.reveals.find((r) => r.playerId === entry.winnerId)?.username ?? "?"} wins
          </Badge>
        )}
      </div>

      {/* Reveals */}
      <div className="flex flex-wrap gap-2">
        {entry.reveals.map((reveal) => {
          const isWinner = reveal.playerId === entry.winnerId;
          const isMe = reveal.playerId === myPlayerId;

          return (
            <div
              key={reveal.playerId}
              className={cn(
                "flex flex-col gap-1 rounded-lg border p-2 min-w-[100px]",
                isWinner && "border-yellow-400 bg-yellow-50"
              )}
            >
              {/* Card accent strip */}
              <div
                className="h-1.5 w-full rounded-full"
                style={{ backgroundColor: reveal.accentColor }}
              />
              <p className="text-xs font-semibold truncate">{reveal.cardName}</p>
              <p className="text-xs text-muted-foreground truncate">
                {reveal.username}
                {isMe && " (you)"}
              </p>
              <p
                className={cn(
                  "tabular-nums text-sm font-bold",
                  isWinner ? "text-yellow-700" : "text-foreground"
                )}
              >
                {reveal.statValue}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
