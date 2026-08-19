"use client";

import { cn } from "@/lib/utils";
import type { BattleLogEntry, CardStatKey } from "@fiction-wars/shared-types";

const STAT_LABELS: Record<CardStatKey, string> = {
  atk: "ATK",
  def: "DEF",
  speed: "SPD",
  hp: "HP",
};

interface Props {
  entries: BattleLogEntry[];
  myPlayerId: string | null;
  /** When true shows all entries (post-game). When false caps at 20 (live). */
  showAll?: boolean;
}

export function BattleLog({ entries, myPlayerId, showAll = false }: Props) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No rounds played yet.
      </p>
    );
  }

  // During live play cap at last 20 — newest first so you always see the
  // most recent without scrolling.
  const visible = showAll
    ? [...entries].reverse()
    : [...entries].slice(-20).reverse();

  return (
    <div className="flex flex-col gap-1.5">
      {visible.map((entry) => {
        const isPotCarried = entry.winnerId === "pot-carried";
        const winnerReveal = entry.reveals.find(
          (r) => r.playerId === entry.winnerId
        );
        const myReveal = entry.reveals.find((r) => r.playerId === myPlayerId);
        const iWon = entry.winnerId === myPlayerId;

        return (
          <div
            key={`${entry.roundNumber}-${entry.timestamp}`}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs",
              iWon && "bg-yellow-50 border border-yellow-200",
              isPotCarried && "bg-muted"
            )}
          >
            {/* Round number */}
            <span className="w-7 flex-shrink-0 tabular-nums text-muted-foreground">
              #{entry.roundNumber}
            </span>

            {/* Stat used */}
            <span className="w-8 flex-shrink-0 font-mono font-semibold">
              {STAT_LABELS[entry.statChosen]}
            </span>

            {/* Result */}
            {isPotCarried ? (
              <span className="flex-1 text-muted-foreground">Tie — pot grows</span>
            ) : (
              <span className="flex-1 truncate">
                <span className={cn("font-medium", iWon && "text-yellow-700")}>
                  {winnerReveal?.username ?? "?"}
                </span>
                {" wins"}
                {winnerReveal && (
                  <span className="text-muted-foreground ml-1">
                    ({winnerReveal.statValue})
                  </span>
                )}
              </span>
            )}

            {/* My stat value for context */}
            {myReveal && (
              <span className="flex-shrink-0 tabular-nums text-muted-foreground">
                you: {myReveal.statValue}
              </span>
            )}

            {/* Auto-pick indicator */}
            {entry.wasAutoPicked && (
              <span className="flex-shrink-0 text-muted-foreground" title="Auto-picked">
                ⏱
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
