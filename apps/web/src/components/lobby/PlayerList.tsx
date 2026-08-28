"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AVATAR_COLORS } from "./AvatarPicker";
import { emitKickPlayer } from "@/socket/socketEvents";
import { useRoomStore, selectIsHost } from "@/store/roomStore";
import type { AvatarId } from "@fiction-wars/shared-types";

export function PlayerList() {
  const { room, playerId } = useRoomStore();
  const isHost = useRoomStore(selectIsHost);

  if (!room) return null;

  // Host can kick in both lobby and mid-game (Section 2 of brief).
  const canKick = isHost;

  return (
    <div className="flex flex-col gap-2">
      {room.players.map((player) => {
        const isMe = player.id === playerId;
        const isPlayerHost = player.id === room.hostPlayerId;

        return (
          <div
            key={player.id}
            className="flex items-center gap-3 rounded-md border p-3"
          >
            {/* Avatar */}
            <div
              className={cn(
                "h-8 w-8 flex-shrink-0 rounded-full",
                AVATAR_COLORS[player.avatar as AvatarId]
              )}
            />

            {/* Name + badges */}
            <div className="flex flex-1 flex-wrap items-center gap-1.5">
              <span className="font-medium">
                {player.username}
                {isMe && (
                  <span className="ml-1 text-sm text-muted-foreground">
                    (you)
                  </span>
                )}
              </span>
              {isPlayerHost && (
                <Badge variant="secondary">Host</Badge>
              )}
              {!player.isConnected && (
                <Badge variant="outline" className="text-muted-foreground">
                  Reconnecting…
                </Badge>
              )}
              {player.status === "eliminated" && (
                <Badge variant="destructive">Spectating</Badge>
              )}
            </div>

            {/* Kick button — host only, not for self */}
            {canKick && !isMe && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive flex-shrink-0"
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
  );
}
