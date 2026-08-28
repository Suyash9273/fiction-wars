"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { AvatarPicker } from "./AvatarPicker";
import { connectSocket } from "@/socket/socketClient";
import { emitCreateRoom } from "@/socket/socketEvents";
import { useRoomStore } from "@/store/roomStore";
import { persistSession } from "@/hooks/useRoom";
import type { RoomSettings, AvatarId } from "@fiction-wars/shared-types";
import {
  MIN_PLAYERS,
  MAX_PLAYERS,
  MIN_TURN_TIMER_SECONDS,
  MAX_TURN_TIMER_SECONDS,
} from "@fiction-wars/shared-types";

export function CreateRoomForm() {
  const router = useRouter();
  const { setIdentity, setRoom } = useRoomStore();

  const [username, setUsername] = useState("");
  const [avatar, setAvatar] = useState<AvatarId>("avatar-1");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [turnTimerSeconds, setTurnTimerSeconds] = useState(30);
  const [winCondition, setWinCondition] =
    useState<RoomSettings["winCondition"]>("last-standing");
  const [roundCap, setRoundCap] = useState(20);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const settings: RoomSettings = {
      winCondition,
      roundCap: winCondition === "round-cap" ? roundCap : undefined,
      turnTimerSeconds,
      maxPlayers,
    };

    // Await the connection so emit never fires on a disconnected socket.
    await connectSocket();
    const res = await emitCreateRoom({ username, avatar, settings });

    if ("ok" in res && res.ok === false) {
      setError(res.error.message);
      setLoading(false);
      return;
    }

    const ack = res as import("@fiction-wars/shared-types").RoomCreateAck;

    // room:create ack now includes the full room view so we don't need a
    // separate room:reconnect round-trip here.
    setIdentity(ack.playerId, ack.sessionToken);
    setRoom(ack.room);
    persistSession(ack.roomCode, ack.sessionToken);

    router.push(`/room/${ack.roomCode}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          placeholder="Enter your name"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          maxLength={24}
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Avatar</Label>
        <AvatarPicker selected={avatar} onSelect={setAvatar} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="maxPlayers">
          Max Players ({MIN_PLAYERS}–{MAX_PLAYERS})
        </Label>
        <Input
          id="maxPlayers"
          type="number"
          min={MIN_PLAYERS}
          max={MAX_PLAYERS}
          value={maxPlayers}
          onChange={(e) => setMaxPlayers(Number(e.target.value))}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="turnTimer">
          Turn Timer ({MIN_TURN_TIMER_SECONDS}–{MAX_TURN_TIMER_SECONDS}s)
        </Label>
        <Input
          id="turnTimer"
          type="number"
          min={MIN_TURN_TIMER_SECONDS}
          max={MAX_TURN_TIMER_SECONDS}
          value={turnTimerSeconds}
          onChange={(e) => setTurnTimerSeconds(Number(e.target.value))}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Win Condition</Label>
        <Select
          value={winCondition}
          onValueChange={(v) =>
            setWinCondition(v as RoomSettings["winCondition"])
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="last-standing">Last Standing</SelectItem>
            <SelectItem value="round-cap">Round Cap</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {winCondition === "round-cap" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="roundCap">Round Cap</Label>
          <Input
            id="roundCap"
            type="number"
            min={3}
            max={100}
            value={roundCap}
            onChange={(e) => setRoundCap(Number(e.target.value))}
          />
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={loading || !username.trim()}>
        {loading ? "Creating…" : "Create Room"}
      </Button>
    </form>
  );
}