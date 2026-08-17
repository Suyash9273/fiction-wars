"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useGameStore } from "@/store/gameStore";
import { useRoomStore } from "@/store/roomStore";

interface Props {
  totalSeconds: number;
}

export function TurnTimer({ totalSeconds }: Props) {
  const { playerId } = useRoomStore();
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);

  const turnDeadline = useGameStore((s) => s.gameState?.turnDeadline);
  const status = useGameStore((s) => s.gameState?.status);
  const isMyTurn = useGameStore((s) => s.gameState?.currentPickerId) === playerId;

  useEffect(() => {
    if (status !== "awaiting-pick" || !turnDeadline) return;

    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((turnDeadline - Date.now()) / 1000)
      );
      setSecondsLeft(remaining);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [turnDeadline, status]); // only restart when deadline or status changes, not every render

  if (status !== "awaiting-pick") return null;

  const pct = Math.round((secondsLeft / totalSeconds) * 100);
  const urgent = secondsLeft <= 5;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {isMyTurn ? "Your turn" : "Waiting for picker…"}
        </span>
        <span className={cn("tabular-nums", urgent && "font-bold text-destructive")}>
          {secondsLeft}s
        </span>
      </div>
      {/* Inline progress bar — swap for shadcn Progress once CLI adds it */}
      <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-1000",
            urgent ? "bg-destructive" : "bg-primary"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

