import { z } from "zod";

import { SECURITY_RECIPE_POLICIES } from "../constants/policies.js";
import { SECURITY_RECIPE_VALUES } from "../types/capsule.js";

export const securityRecipeSchema = z.enum(SECURITY_RECIPE_VALUES);

export const encryptedPayloadSchema = z.object({
  ciphertext: z.string().trim().min(1),
  nonce: z.string().trim().min(1),
  algorithm: z.literal("AES-GCM-256"),
}).strict();

export const securityRecipePolicySchema = z
  .object({
    recipe: securityRecipeSchema,
    ttlSeconds: z.number().int().positive(),
    maxViews: z.number().int().positive(),
    requiresPassword: z.boolean(),
    burnAfterRead: z.boolean(),
  })
  .superRefine((policy, ctx) => {
    const policyConfig = SECURITY_RECIPE_POLICIES[policy.recipe];

    if (policy.ttlSeconds > policyConfig.ttlSecondsMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ttlSeconds"],
        message: `ttlSeconds must be <= ${policyConfig.ttlSecondsMax} for ${policy.recipe}.`,
      });
    }

    if (policy.maxViews > policyConfig.maxViewsMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxViews"],
        message: `maxViews must be <= ${policyConfig.maxViewsMax} for ${policy.recipe}.`,
      });
    }

    if (policy.recipe === "QUICK" || policy.recipe === "SECURE") {
      if (policy.burnAfterRead) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["burnAfterRead"],
          message: `${policy.recipe} capsules must not burn after read.`,
        });
      }
      return;
    }

    if (policy.maxViews !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxViews"],
        message: "NUCLEAR capsules must have exactly one maxView.",
      });
    }

    if (!policy.requiresPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["requiresPassword"],
        message: "NUCLEAR capsules require a password.",
      });
    }

    if (!policy.burnAfterRead) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["burnAfterRead"],
        message: "NUCLEAR capsules must burn after read.",
      });
    }
  });

export const capsuleMetadataSchema = z.object({
  id: z.string().trim().min(1),
  recipe: securityRecipeSchema,
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  maxViews: z.number().int().positive(),
  currentViews: z.number().int().nonnegative(),
  requiresPassword: z.boolean(),
  burnAfterRead: z.boolean(),
});

export const capsuleCreationRequestSchema = z
  .object({
    encryptedPayload: encryptedPayloadSchema,
    recipe: securityRecipeSchema,
    ttlSeconds: z.number().int().positive(),
    maxViews: z.number().int().positive(),
    requiresPassword: z.boolean(),
    burnAfterRead: z.boolean(),
  })
  .superRefine((request, ctx) => {
    const recipeValidation = securityRecipePolicySchema.safeParse({
      recipe: request.recipe,
      ttlSeconds: request.ttlSeconds,
      maxViews: request.maxViews,
      requiresPassword: request.requiresPassword,
      burnAfterRead: request.burnAfterRead,
    });

    if (!recipeValidation.success) {
      for (const issue of recipeValidation.error.issues) {
        ctx.addIssue({
          ...issue,
          path: issue.path,
        });
      }
    }
  });

export const capsuleResponseSchema = z.object({
  metadata: capsuleMetadataSchema,
  encryptedPayload: encryptedPayloadSchema,
});

export const validateSecurityRecipe = (value: unknown) =>
  securityRecipePolicySchema.safeParse(value);

export const validateCapsuleCreationRequest = (value: unknown) =>
  capsuleCreationRequestSchema.safeParse(value);

export const capsuleSchema = capsuleResponseSchema;
