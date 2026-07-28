import {z} from "zod"

export const AVATAR_IDS = [
  "avatar-1",
  "avatar-2",
  "avatar-3",
  "avatar-4",
  "avatar-5",
  "avatar-6",
  "avatar-7",
  "avatar-8",
] as const;

export const AvatarIdSchema = z.enum(AVATAR_IDS)
export type AvatarId = z.infer<typeof AvatarIdSchema>