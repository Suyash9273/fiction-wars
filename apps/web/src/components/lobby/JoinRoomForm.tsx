"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AvatarPicker } from "./AvatarPicker";
import { connectSocket } from "@/socket/socketClient";
import { emitJoinRoom } from "@/socket/socketEvents";
import { useRoomStore } from "@/store/roomStore";
import { persistSession } from "@/hooks/useRoom";
import type { AvatarId } from "@fiction-wars/shared-types";

interface Props {
  prefillCode?: string; // populated when arriving via /room/[code]
}

export function JoinRoomForm({ prefillCode }: Props) {
  const router = useRouter();
  const { setIdentity, setRoom } = useRoomStore();

  const [roomCode, setRoomCode] = useState(prefillCode ?? "");
  const [username, setUsername] = useState("");
  const [avatar, setAvatar] = useState<AvatarId>("avatar-1");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    connectSocket();
    const res = await emitJoinRoom({
      roomCode: roomCode.toUpperCase(),
      username,
      avatar,
    });

    if ("ok" in res && res.ok === false) {
      const messages: Record<string, string> = {
        ROOM_NOT_FOUND: "Room not found. Check the code and try again.",
        ROOM_LOCKED: "This game has already started.",
        ROOM_FULL: "This room is full.",
        USERNAME_TAKEN: "That username is taken in this room.",
      };
      setError(messages[res.error.code] ?? res.error.message);
      setLoading(false);
      return;
    }

    const ack = res as import("@fiction-wars/shared-types").RoomJoinAck;
    setIdentity(ack.playerId, ack.sessionToken);
    setRoom(ack.room);
    persistSession(ack.room.code, ack.sessionToken);
    router.push(`/room/${ack.room.code}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="roomCode">Room Code</Label>
        <Input
          id="roomCode"
          placeholder="e.g. ABC123"
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
          maxLength={6}
          required
          disabled={!!prefillCode}
          className="font-mono tracking-widest"
        />
      </div>

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

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        type="submit"
        disabled={loading || !username.trim() || roomCode.length !== 6}
      >
        {loading ? "Joining…" : "Join Room"}
      </Button>
    </form>
  );
}
