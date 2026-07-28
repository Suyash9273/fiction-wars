import { z } from "zod";

export const CHAT_MESSAGE_MAX_LENGTH = 500;
export const REACTION_EMOJI_MAX_LENGTH = 8; // generous enough for multi-codepoint emoji

export const ReactionSchema = z.object({
  emoji: z.string().min(1).max(REACTION_EMOJI_MAX_LENGTH),
  playerIds: z.array(z.string().min(1)),
});
export type Reaction = z.infer<typeof ReactionSchema>;

export const ChatMessageSchema = z.object({
    id: z.string().min(1),
    playerId: z.string().min(1),
    username: z.string().min(1),
    text: z.string().min(1).max(CHAT_MESSAGE_MAX_LENGTH),
    timestamp: z.number().int(),
    reactions: z.array(ReactionSchema)
})
export type ChatMessage = z.infer<typeof ChatMessageSchema>;