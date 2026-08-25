export const SECURE_SHARE_ERROR_CODES = {
  INVALID_CAPSULE: "INVALID_CAPSULE",
  INVALID_SECURITY_RECIPE: "INVALID_SECURITY_RECIPE",
  INVALID_SHARE_LINK: "INVALID_SHARE_LINK",
} as const;

export type SecureShareErrorCode =
  (typeof SECURE_SHARE_ERROR_CODES)[keyof typeof SECURE_SHARE_ERROR_CODES];

export class SecureShareError extends Error {
  readonly code: SecureShareErrorCode;

  constructor(code: SecureShareErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SecureShareError";
    this.code = code;
  }
}

export class CapsuleContractError extends SecureShareError {
  constructor(message: string, options?: ErrorOptions) {
    super(SECURE_SHARE_ERROR_CODES.INVALID_CAPSULE, message, options);
    this.name = "CapsuleContractError";
  }
}

export class SecurityRecipeError extends SecureShareError {
  constructor(message: string, options?: ErrorOptions) {
    super(SECURE_SHARE_ERROR_CODES.INVALID_SECURITY_RECIPE, message, options);
    this.name = "SecurityRecipeError";
  }
}

export class ShareLinkError extends SecureShareError {
  constructor(message: string, options?: ErrorOptions) {
    super(SECURE_SHARE_ERROR_CODES.INVALID_SHARE_LINK, message, options);
    this.name = "ShareLinkError";
  }
}
