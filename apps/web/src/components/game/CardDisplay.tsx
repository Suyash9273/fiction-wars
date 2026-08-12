"use client";

import { cn } from "@/lib/utils";
import type { Card, CardStatKey } from "@fiction-wars/shared-types";
import { CARD_STAT_KEYS } from "@fiction-wars/shared-types";

const STAT_LABELS: Record<CardStatKey, string> = {
  atk: "ATK",
  def: "DEF",
  speed: "SPD",
  hp: "HP",
};

interface Props {
  card: Card;
  highlightStat?: CardStatKey;   // winning stat is highlighted after reveal
  dimmed?: boolean;              // eliminated players, spectators
  size?: "sm" | "md" | "lg";
}

export function CardDisplay({
  card,
  highlightStat,
  dimmed = false,
  size = "md",
}: Props) {
  const sizeClasses = {
    sm: "w-32 rounded-lg p-2 gap-1",
    md: "w-44 rounded-xl p-3 gap-2",
    lg: "w-56 rounded-2xl p-4 gap-3",
  };

  const headerHeight = {
    sm: "h-20",
    md: "h-28",
    lg: "h-36",
  };

  return (
    <div
      className={cn(
        "flex flex-col border shadow-md transition-opacity",
        sizeClasses[size],
        dimmed && "opacity-40"
      )}
    >
      {/* Art area — accent color placeholder; swap for <Image> when imageUrl added */}
      <div
        className={cn(
          "w-full rounded-md flex items-end justify-start p-2",
          headerHeight[size]
        )}
        style={{ backgroundColor: card.accentColor }}
      >
        <span className="text-xs font-semibold text-white/80 uppercase tracking-wide">
          {card.universe}
        </span>
      </div>

      {/* Name */}
      <p className={cn("font-bold leading-tight", size === "sm" ? "text-xs" : "text-sm")}>
        {card.name}
      </p>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
        {CARD_STAT_KEYS.map((key) => (
          <div
            key={key}
            className={cn(
              "flex items-center justify-between rounded px-1",
              size === "sm" ? "text-xs" : "text-sm",
              highlightStat === key
                ? "bg-yellow-100 font-bold text-yellow-800"
                : "text-muted-foreground"
            )}
          >
            <span>{STAT_LABELS[key]}</span>
            <span className="tabular-nums font-medium text-foreground">
              {card.stats[key]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
