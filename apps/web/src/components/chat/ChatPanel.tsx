"use client";

import { useEffect, useRef, useState } from "react";
import { useChatStore } from "@/store/chatStore";
import { useRoomStore } from "@/store/roomStore";
import { emitSendMessage } from "@/socket/socketEvents";
import { ChatMessage } from "./ChatMessage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CHAT_MESSAGE_MAX_LENGTH } from "@fiction-wars/shared-types";

export function ChatPanel() {
  const { messages } = useChatStore();
  const { room } = useRoomStore();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Track whether the user is scrolled near the bottom
  const isNearBottomRef = useRef(true);

  // Auto-scroll to bottom only when near bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 80; // px from bottom
    isNearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError(null);
    setText("");

    const res = await emitSendMessage({ text: trimmed });
    if ("ok" in res && !res.ok) {
      setError(
        res.error.code === "RATE_LIMITED"
          ? "Slow down — you're sending too fast."
          : res.error.message
      );
      setText(trimmed); // restore text so user doesn't lose their message
    }
    setSending(false);
  }

  if (!room) return null;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Message list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto flex flex-col gap-3 px-3 py-3 min-h-0"
      >
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No messages yet. Say something!
          </p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="group">
              <ChatMessage message={msg} />
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t px-3 py-2 flex-shrink-0">
        <form onSubmit={handleSend} className="flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Say something…"
            maxLength={CHAT_MESSAGE_MAX_LENGTH}
            disabled={sending}
            className="flex-1"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!text.trim() || sending}
          >
            Send
          </Button>
        </form>
        {error && (
          <p className="text-xs text-destructive mt-1">{error}</p>
        )}
      </div>
    </div>
  );
}
