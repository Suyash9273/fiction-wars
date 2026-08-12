"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useGameStore } from "@/store/gameStore";
import { useRoomStore } from "@/store/roomStore";
import { AVATAR_COLORS } from "@/components/lobby/AvatarPicker";
import type { AvatarId } from "@fiction-wars/shared-types";

export function PlayerStandings() {
  const { gameState } = useGameStore();
  const { room, playerId } = useRoomStore();

  if (!gameState || !room) return null;

  // Sort by pile count descending
  const sorted = [...room.players].sort((a, b) => {
    const countA = gameState.pileCounts[a.id] ?? 0;
    const countB = gameState.pileCounts[b.id] ?? 0;
    return countB - countA;
  });

  return (
    <div className="flex flex-col gap-1">
      {sorted.map((player, idx) => {
        const isMe = player.id === playerId;
        const isPicker = player.id === gameState.currentPickerId;
        const pileCount = gameState.pileCounts[player.id] ?? 0;
        const isEliminated = player.status === "eliminated" || pileCount === 0;

        return (
          <div
            key={player.id}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
              isPicker && "bg-accent",
              isEliminated && "opacity-50"
            )}
          >
            <span className="w-4 text-muted-foreground text-xs">{idx + 1}</span>
            <div
              className={cn(
                "h-6 w-6 flex-shrink-0 rounded-full",
                AVATAR_COLORS[player.avatar as AvatarId]
              )}
            />
            <span className={cn("flex-1 truncate", isMe && "font-semibold")}>
              {player.username}
              {isMe && " (you)"}
            </span>
            {isPicker && (
              <Badge variant="outline" className="text-xs py-0">
                picking
              </Badge>
            )}
            {isEliminated ? (
              <span className="text-xs text-muted-foreground">out</span>
            ) : (
              <span className="tabular-nums text-xs font-medium">
                {pileCount} cards
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
