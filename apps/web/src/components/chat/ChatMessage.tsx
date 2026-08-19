"use client";

import { cn } from "@/lib/utils";
import { emitAddReaction } from "@/socket/socketEvents";
import { useRoomStore } from "@/store/roomStore";
import type { ChatMessage as ChatMessageType } from "@fiction-wars/shared-types";

const QUICK_REACTIONS = ["👍", "😂", "🔥", "😮", "💀"];

interface Props {
  message: ChatMessageType;
}

export function ChatMessage({ message }: Props) {
  const { playerId } = useRoomStore();
  const isMe = message.playerId === playerId;

  function handleReaction(emoji: string) {
    emitAddReaction({ messageId: message.id, emoji }).catch(console.error);
  }

  return (
    <div className={cn("flex flex-col gap-0.5", isMe && "items-end")}>
      {/* Username + timestamp */}
      <div
        className={cn(
          "flex items-center gap-1.5 text-xs text-muted-foreground",
          isMe && "flex-row-reverse"
        )}
      >
        <span className="font-medium text-foreground">{message.username}</span>
        <span>
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      {/* Bubble */}
      <div
        className={cn(
          "max-w-[80%] rounded-xl px-3 py-1.5 text-sm",
          isMe
            ? "bg-primary text-primary-foreground rounded-tr-none"
            : "bg-muted rounded-tl-none"
        )}
      >
        {message.text}
      </div>

      {/* Reactions */}
      {message.reactions.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-0.5">
          {message.reactions.map((r) => {
            const iReacted = r.playerIds.includes(playerId ?? "");
            return (
              <button
                key={r.emoji}
                onClick={() => handleReaction(r.emoji)}
                className={cn(
                  "flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs transition-colors",
                  iReacted
                    ? "border-primary bg-primary/10 font-semibold"
                    : "border-border bg-background hover:bg-muted"
                )}
              >
                <span>{r.emoji}</span>
                <span className="tabular-nums">{r.playerIds.length}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Quick reaction row — shown on hover via group, always visible on mobile */}
      <div
        className={cn(
          "flex gap-1 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity",
          isMe && "flex-row-reverse"
        )}
      >
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => handleReaction(emoji)}
            className="text-sm hover:scale-125 transition-transform"
            aria-label={`React with ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
