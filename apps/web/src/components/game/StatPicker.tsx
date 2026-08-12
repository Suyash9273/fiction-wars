"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { emitPickStat } from "@/socket/socketEvents";
import type { CardStatKey } from "@fiction-wars/shared-types";
import { CARD_STAT_KEYS } from "@fiction-wars/shared-types";

const STAT_LABELS: Record<CardStatKey, string> = {
  atk: "⚔️  Attack",
  def: "🛡️  Defense",
  speed: "💨  Speed",
  hp: "❤️  HP",
};

interface Props {
  myStats: Record<CardStatKey, number>;
}

export function StatPicker({ myStats }: Props) {
  const [submitted, setSubmitted] = useState<CardStatKey | null>(null);

  async function handlePick(stat: CardStatKey) {
    if (submitted) return; // guard against double-click
    setSubmitted(stat);   // disable immediately — don't wait for server
    await emitPickStat({ stat });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Pick a stat to challenge with:</p>
      <div className="grid grid-cols-2 gap-2">
        {CARD_STAT_KEYS.map((stat) => (
          <Button
            key={stat}
            variant={submitted === stat ? "default" : "outline"}
            disabled={!!submitted}
            onClick={() => handlePick(stat)}
            className="flex items-center justify-between px-3"
          >
            <span>{STAT_LABELS[stat]}</span>
            <span className="tabular-nums font-bold">{myStats[stat]}</span>
          </Button>
        ))}
      </div>
      {submitted && (
        <p className="text-center text-sm text-muted-foreground">
          Waiting for all players to reveal…
        </p>
      )}
    </div>
  );
}
