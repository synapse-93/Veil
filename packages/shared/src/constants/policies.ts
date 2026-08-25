import type { SecurityRecipe } from "../types/capsule.js";

export type SecurityRecipePolicy = {
  ttlSecondsMax: number;
  maxViewsMax: number;
  requiresPassword: boolean;
  burnAfterRead: boolean;
};

export const SECURITY_RECIPE_POLICIES: Record<SecurityRecipe, SecurityRecipePolicy> = {
  QUICK: {
    ttlSecondsMax: 604800,
    maxViewsMax: 10,
    requiresPassword: false,
    burnAfterRead: false,
  },
  SECURE: {
    ttlSecondsMax: 86400,
    maxViewsMax: 3,
    requiresPassword: false,
    burnAfterRead: false,
  },
  NUCLEAR: {
    ttlSecondsMax: 900,
    maxViewsMax: 1,
    requiresPassword: true,
    burnAfterRead: true,
  },
};
