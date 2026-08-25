import { z } from "zod";
import { securityRecipeSchema } from "./capsule.schema.js";

export const friendRequestCreateSchema = z.object({
  toUsername: z.string().trim().min(1, "Recipient username is required"),
});

export const sendMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("TEXT"),
    content: z.string().trim().min(1, "Message content is required").max(2000),
  }),
  z.object({
    type: z.literal("CAPSULE"),
    content: z.string().default(""),
    shareFragment: z.string().trim().min(1, "Share fragment is required").max(8192).optional(),
    capsuleId: z.string().min(1, "Capsule ID is required"),
    recipe: securityRecipeSchema,
    expiresAt: z.string().datetime(),
    maxViews: z.number().int().positive(),
    burnAfterRead: z.boolean(),
    requiresPassword: z.boolean(),
  }),
]);

export const revokeCapsuleSchema = z.object({
  revokeToken: z.string().optional(),
});

export const startConversationSchema = z.object({
  targetUsername: z.string().trim().min(1).optional(),
  targetUserId: z.string().trim().min(1).optional(),
}).refine((data) => data.targetUsername || data.targetUserId, {
  message: "Either targetUsername or targetUserId must be provided",
});
