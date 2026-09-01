"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { emitUpdateSettings } from "@/socket/socketEvents";
import { useRoomStore, selectIsHost } from "@/store/roomStore";
import type { RoomSettings } from "@fiction-wars/shared-types";
import {
  MIN_PLAYERS,
  MAX_PLAYERS,
  MIN_TURN_TIMER_SECONDS,
  MAX_TURN_TIMER_SECONDS,
  MIN_ROUND_CAP,
  MAX_ROUND_CAP,
} from "@fiction-wars/shared-types";

/**
 * Lobby settings panel.
 *
 * Host sees editable controls and a Save button.
 * Non-hosts see the current settings read-only.
 *
 * The panel is intentionally uncontrolled from the server — the host edits
 * locally and only sends on Save. This avoids broadcasting every keystroke
 * and means a failed save (e.g. validation error) doesn't pollute anyone
 * else's view.
 *
 * On successful save the server broadcasts room:update to the whole room,
 * so all non-host clients see the new settings automatically via the store.
 */
export function SettingsPanel() {
  const { room } = useRoomStore();
  const isHost = useRoomStore(selectIsHost);

  // Local draft — initialised from live room settings, reset whenever the
  // room settings change from the server (e.g. another host update, or on
  // first mount).
  const [winCondition, setWinCondition] = useState<RoomSettings["winCondition"]>(
    room?.settings.winCondition ?? "last-standing"
  );
  const [roundCap, setRoundCap] = useState(room?.settings.roundCap ?? 20);
  const [turnTimerSeconds, setTurnTimerSeconds] = useState(
    room?.settings.turnTimerSeconds ?? 30
  );
  const [maxPlayers, setMaxPlayers] = useState(room?.settings.maxPlayers ?? 4);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Keep local draft in sync when the server pushes a room:update (e.g. a
  // different browser tab saves settings). Only reset when the room settings
  // actually differ from what we have drafted — avoids stomping the user's
  // in-progress edits mid-keystroke.
  useEffect(() => {
    if (!room) return;
    const s = room.settings;
    setWinCondition(s.winCondition);
    setRoundCap(s.roundCap ?? 20);
    setTurnTimerSeconds(s.turnTimerSeconds);
    setMaxPlayers(s.maxPlayers);
  }, [
    room?.settings.winCondition,
    room?.settings.roundCap,
    room?.settings.turnTimerSeconds,
    room?.settings.maxPlayers,
  ]);

  if (!room) return null;

  const currentPlayerCount = room.players.length;

  // ── Read-only view for non-hosts ─────────────────────────────────────────
  if (!isHost) {
    const s = room.settings;
    return (
      <div className="rounded-lg border p-4 flex flex-col gap-2 text-sm text-muted-foreground">
        <p className="font-semibold text-foreground text-xs uppercase tracking-wide">
          Room Settings
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <span>Max players</span>
          <span className="font-medium text-foreground">{s.maxPlayers}</span>
          <span>Turn timer</span>
          <span className="font-medium text-foreground">{s.turnTimerSeconds}s</span>
          <span>Win condition</span>
          <span className="font-medium text-foreground capitalize">
            {s.winCondition === "last-standing" ? "Last Standing" : `Round Cap (${s.roundCap})`}
          </span>
        </div>
      </div>
    );
  }

  // ── Editable view for host ────────────────────────────────────────────────
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const settings: RoomSettings = {
      winCondition,
      roundCap: winCondition === "round-cap" ? roundCap : undefined,
      turnTimerSeconds,
      maxPlayers,
    };

    const res = await emitUpdateSettings({ settings });

    setSaving(false);

    if ("ok" in res && res.ok === false) {
      const messages: Record<string, string> = {
        NOT_HOST: "Only the host can change settings.",
        ROOM_LOCKED: "Settings cannot be changed after the game starts.",
        VALIDATION_ERROR: `Max players cannot be below current player count (${currentPlayerCount}).`,
      };
      setError(messages[res.error.code] ?? res.error.message);
      return;
    }

    // Success — flash a "Saved" indicator briefly
    setSavedAt(Date.now());
    setTimeout(() => setSavedAt(null), 2000);
  }

  // Clamp maxPlayers so the host can't accidentally submit below current count
  const effectiveMinPlayers = Math.max(MIN_PLAYERS, currentPlayerCount);

  return (
    <form onSubmit={handleSave} className="rounded-lg border p-4 flex flex-col gap-4">
      <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
        Room Settings
      </p>

      {/* Max players */}
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="sp-maxPlayers" className="flex-shrink-0 w-32">
          Max players
        </Label>
        <div className="flex items-center gap-2 flex-1 justify-end">
          <Input
            id="sp-maxPlayers"
            type="number"
            min={effectiveMinPlayers}
            max={MAX_PLAYERS}
            value={maxPlayers}
            onChange={(e) => setMaxPlayers(Number(e.target.value))}
            className="w-20 text-right"
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            ({MIN_PLAYERS}–{MAX_PLAYERS})
          </span>
        </div>
      </div>

      {/* Turn timer */}
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="sp-turnTimer" className="flex-shrink-0 w-32">
          Turn timer
        </Label>
        <div className="flex items-center gap-2 flex-1 justify-end">
          <Input
            id="sp-turnTimer"
            type="number"
            min={MIN_TURN_TIMER_SECONDS}
            max={MAX_TURN_TIMER_SECONDS}
            value={turnTimerSeconds}
            onChange={(e) => setTurnTimerSeconds(Number(e.target.value))}
            className="w-20 text-right"
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            ({MIN_TURN_TIMER_SECONDS}–{MAX_TURN_TIMER_SECONDS}s)
          </span>
        </div>
      </div>

      {/* Win condition */}
      <div className="flex items-center justify-between gap-4">
        <Label className="flex-shrink-0 w-32">Win condition</Label>
        <Select
          value={winCondition}
          onValueChange={(v) => setWinCondition(v as RoomSettings["winCondition"])}
        >
          <SelectTrigger className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="last-standing">Last Standing</SelectItem>
            <SelectItem value="round-cap">Round Cap</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Round cap — only shown when win condition is round-cap */}
      {winCondition === "round-cap" && (
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="sp-roundCap" className="flex-shrink-0 w-32">
            Round cap
          </Label>
          <div className="flex items-center gap-2 flex-1 justify-end">
            <Input
              id="sp-roundCap"
              type="number"
              min={MIN_ROUND_CAP}
              max={MAX_ROUND_CAP}
              value={roundCap}
              onChange={(e) => setRoundCap(Number(e.target.value))}
              className="w-20 text-right"
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              ({MIN_ROUND_CAP}–{MAX_ROUND_CAP})
            </span>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="flex items-center justify-between">
        {savedAt ? (
          <span className="text-sm text-green-600">✓ Saved</span>
        ) : (
          <span />
        )}
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Saving…" : "Save Settings"}
        </Button>
      </div>
    </form>
  );
}
