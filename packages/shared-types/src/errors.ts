import { z } from "zod";

export const ERROR_CODES = [
  "ROOM_NOT_FOUND",
  "ROOM_FULL",
  "ROOM_LOCKED",
  "USERNAME_TAKEN",
  "NOT_HOST",
  "NOT_YOUR_TURN",
  "INVALID_STAT",
  "SESSION_EXPIRED",
  "RATE_LIMITED",
  "VALIDATION_ERROR",
] as const;
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ActionFailedPayloadSchema = z.object({
    code: ErrorCodeSchema,
    message: z.string().min(1),
})
export type ActionFailedPayload = z.infer<typeof ActionFailedPayloadSchema>;
