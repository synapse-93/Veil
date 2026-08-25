import { z } from "zod";

export const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(24, "Username must be at most 24 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(128, "Password must be at most 128 characters"),
  publicKey: z.string().trim().min(1).max(2048).optional(),
});

export const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const updatePrivacySchema = z.object({
  isPublic: z.boolean(),
});

export const updatePublicKeySchema = z.object({
  publicKey: z.string().trim().min(1, "Public key is required").max(4096),
});
