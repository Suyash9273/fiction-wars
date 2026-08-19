"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { BattleLog } from "@/components/game/BattleLog";
import { useGameStore } from "@/store/gameStore";
import { useRoomStore } from "@/store/roomStore";
import { useChatStore } from "@/store/chatStore";

type Tab = "chat" | "log";

export function RoomTabs() {
  const [active, setActive] = useState<Tab>("chat");
  const { battleLog } = useGameStore();
  const { playerId } = useRoomStore();
  const { messages } = useChatStore();

  const tabs: { id: Tab; label: string; count?: number }[] = [
    {
      id: "chat",
      label: "Chat",
      count: messages.length > 0 ? messages.length : undefined,
    },
    {
      id: "log",
      label: "Battle Log",
      count: battleLog.length > 0 ? battleLog.length : undefined,
    },
  ];

  return (
    <div className="flex flex-col border rounded-xl overflow-hidden h-72">
      {/* Tab bar */}
      <div className="flex border-b flex-shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors",
              active === tab.id
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {active === "chat" ? (
          <ChatPanel />
        ) : (
          <div className="h-full overflow-y-auto px-3 py-3">
            <BattleLog entries={battleLog} myPlayerId={playerId} />
          </div>
        )}
      </div>
    </div>
  );
}