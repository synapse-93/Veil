/**
 * Veil frontend API client.
 *
 * Zero-knowledge contract:
 *   - Only the encrypted payload (ciphertext + nonce + algorithm) and
 *     recipe metadata are ever sent to the server.
 *   - URL fragments, decryption keys (DEK/KEK), wrapped keys, PBKDF2 salts,
 *     KDF parameters, and plaintext MUST NOT be included in any request.
 *   - The server never receives the data needed to decrypt the ciphertext.
 */

import { capsuleResponseSchema } from "@secureshare/shared";
import type {
  CapsuleCreationRequest,
  CapsuleResponse,
  RegisterRequest,
  LoginRequest,
  AuthResponse,
  UserProfile,
  FriendItem,
  FriendRequestItem,
  ConversationItem,
  MessageItem,
  MessageType,
  SecurityRecipe,
  RevokeCapsuleResponse,
  UserSearchResult,
  StartConversationResponse,
} from "@secureshare/shared";

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ApiError";
  }
}

export class ApiHttpError extends ApiError {
  readonly status: number;
  readonly responseBody: unknown;

  constructor(status: number, responseBody: unknown) {
    super(`Server returned HTTP ${status}`);
    this.name = "ApiHttpError";
    this.status = status;
    this.responseBody = responseBody;
  }
}

export class ApiValidationError extends ApiError {
  readonly issues: unknown;

  constructor(message: string, issues: unknown) {
    super(message);
    this.name = "ApiValidationError";
    this.issues = issues;
  }
}

// ---------------------------------------------------------------------------
// Token Management
// ---------------------------------------------------------------------------

const AUTH_TOKEN_KEY = "veil_auth_token";
const AUTH_SESSION_KEYS = ["veil_target_chat_conv"];

export function clearAuthStorage(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    /* ignore storage unavailable */
  }

  for (const key of AUTH_SESSION_KEYS) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* ignore storage unavailable */
    }
  }
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      clearAuthStorage();
    }
  } catch {
    /* ignore storage unavailable */
  }
}

// ---------------------------------------------------------------------------
// Client options
// ---------------------------------------------------------------------------

export type ClientOptions = {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  token?: string | null;
};

// ---------------------------------------------------------------------------
// Internal fetch helper
// ---------------------------------------------------------------------------

async function apiFetch(
  path: string,
  init: RequestInit,
  options: ClientOptions,
): Promise<unknown> {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const base = options.baseUrl ?? "";

  const token = options.token !== undefined ? options.token : getAuthToken();
  const headers: Record<string, string> = {};
  if (init.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((val, key) => {
        headers[key] = val;
      });
    } else if (Array.isArray(init.headers)) {
      for (const [key, val] of init.headers) {
        headers[key] = val;
      }
    } else {
      Object.assign(headers, init.headers);
    }
  }
  if (token && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetchFn(`${base}${path}`, {
      ...init,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });
  } catch (err) {
    throw new ApiError("Network request failed.", { cause: err });
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    throw new ApiHttpError(response.status, body);
  }

  return body;
}

// ---------------------------------------------------------------------------
// Capsule API
// ---------------------------------------------------------------------------

export async function createCapsule(
  params: CapsuleCreationRequest,
  options: ClientOptions = {},
): Promise<CapsuleResponse> {
  const rawBody = await apiFetch(
    "/capsules",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    },
    options,
  );

  const parsed = capsuleResponseSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new ApiValidationError(
      "Server returned an invalid create-capsule response.",
      parsed.error.issues,
    );
  }

  return {
    ...parsed.data,
    revokeToken: (rawBody as any)?.revokeToken,
  };
}

export async function consumeCapsule(
  id: string,
  options: ClientOptions = {},
): Promise<CapsuleResponse> {
  const rawBody = await apiFetch(
    `/capsules/${encodeURIComponent(id)}/consume`,
    { method: "POST" },
    options,
  );

  const parsed = capsuleResponseSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new ApiValidationError(
      "Server returned an invalid consume-capsule response.",
      parsed.error.issues,
    );
  }

  return parsed.data;
}

export async function revokeCapsule(
  id: string,
  revokeToken?: string,
  options: ClientOptions = {},
): Promise<RevokeCapsuleResponse> {
  const rawBody = await apiFetch(
    `/capsules/${encodeURIComponent(id)}/revoke`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revokeToken }),
    },
    options,
  );

  return rawBody as RevokeCapsuleResponse;
}

export async function getUserCapsules(
  options: ClientOptions = {},
): Promise<{ capsules: any[] }> {
  const rawBody = await apiFetch("/capsules/user", { method: "GET" }, options);
  return rawBody as { capsules: any[] };
}

// ---------------------------------------------------------------------------
// Auth API
// ---------------------------------------------------------------------------

export async function registerUser(
  params: RegisterRequest,
  options: ClientOptions = {},
): Promise<AuthResponse> {
  const rawBody = await apiFetch(
    "/auth/register",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    },
    options,
  );

  const res = rawBody as AuthResponse;
  clearAuthStorage();
  setAuthToken(res.token);
  return res;
}

export async function loginUser(
  params: LoginRequest,
  options: ClientOptions = {},
): Promise<AuthResponse> {
  const rawBody = await apiFetch(
    "/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    },
    options,
  );

  const res = rawBody as AuthResponse;
  clearAuthStorage();
  setAuthToken(res.token);
  return res;
}

export async function getCurrentUser(
  options: ClientOptions = {},
): Promise<{ user: UserProfile }> {
  const rawBody = await apiFetch("/auth/me", { method: "GET" }, options);
  return rawBody as { user: UserProfile };
}

export async function updatePrivacy(
  isPublic: boolean,
  options: ClientOptions = {},
): Promise<{ user: UserProfile }> {
  const rawBody = await apiFetch(
    "/auth/me/privacy",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublic }),
    },
    options,
  );
  return rawBody as { user: UserProfile };
}

export async function logoutUser(
  options: ClientOptions = {},
): Promise<{ success: boolean }> {
  const activeToken = options.token ?? getAuthToken();

  try {
    await apiFetch("/auth/logout", { method: "POST" }, { ...options, token: activeToken });
  } catch {
    // Always clear the client session even if the server rejects logout.
  } finally {
    clearAuthStorage();
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// Social & Chat API
// ---------------------------------------------------------------------------

export async function searchUsers(
  query: string,
  options: ClientOptions = {},
): Promise<{ users: UserSearchResult[] }> {
  const rawBody = await apiFetch(
    `/users/search?q=${encodeURIComponent(query)}`,
    { method: "GET" },
    options,
  );
  return rawBody as { users: UserSearchResult[] };
}

export async function startConversation(
  params: { targetUsername?: string; targetUserId?: string },
  options: ClientOptions = {},
): Promise<StartConversationResponse> {
  const rawBody = await apiFetch(
    "/conversations/start",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    },
    options,
  );
  return rawBody as StartConversationResponse;
}

export async function getFriends(
  options: ClientOptions = {},
): Promise<{ friends: FriendItem[] }> {
  const rawBody = await apiFetch("/friends", { method: "GET" }, options);
  return rawBody as { friends: FriendItem[] };
}

export async function getFriendRequests(
  options: ClientOptions = {},
): Promise<{ incoming: FriendRequestItem[]; outgoing: FriendRequestItem[] }> {
  const rawBody = await apiFetch("/friends/requests", { method: "GET" }, options);
  return rawBody as { incoming: FriendRequestItem[]; outgoing: FriendRequestItem[] };
}

export async function sendFriendRequest(
  toUsername: string,
  options: ClientOptions = {},
): Promise<FriendRequestItem> {
  const rawBody = await apiFetch(
    "/friends/requests",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toUsername }),
    },
    options,
  );
  return rawBody as FriendRequestItem;
}

export async function acceptFriendRequest(
  requestId: string,
  options: ClientOptions = {},
): Promise<FriendRequestItem> {
  const rawBody = await apiFetch(
    `/friends/requests/${encodeURIComponent(requestId)}/accept`,
    { method: "POST" },
    options,
  );
  return rawBody as FriendRequestItem;
}

export async function rejectFriendRequest(
  requestId: string,
  options: ClientOptions = {},
): Promise<FriendRequestItem> {
  const rawBody = await apiFetch(
    `/friends/requests/${encodeURIComponent(requestId)}/reject`,
    { method: "POST" },
    options,
  );
  return rawBody as FriendRequestItem;
}

export async function getConversations(
  options: ClientOptions = {},
): Promise<{ conversations: ConversationItem[] }> {
  const rawBody = await apiFetch("/conversations", { method: "GET" }, options);
  return rawBody as { conversations: ConversationItem[] };
}

export async function getMessages(
  conversationId: string,
  options: ClientOptions = {},
): Promise<{ messages: MessageItem[] }> {
  const rawBody = await apiFetch(
    `/conversations/${encodeURIComponent(conversationId)}/messages`,
    { method: "GET" },
    options,
  );
  return rawBody as { messages: MessageItem[] };
}

import { sanitizeMessageContent } from "./sanitize.js";

export async function sendMessage(
  conversationId: string,
  message: {
    type: MessageType;
    content?: string;
    shareFragment?: string;
    capsuleId?: string;
    recipe?: SecurityRecipe;
    expiresAt?: string;
    maxViews?: number;
    burnAfterRead?: boolean;
    requiresPassword?: boolean;
  },
  options: ClientOptions = {},
): Promise<MessageItem> {
  // Keep the raw share fragment in its own JSON field so the recipient can restore
  // the auto-filled decryption state without shipping the full URL/hash through a
  // browser navigation request. Only the visible message text is sanitized.
  const safeMessage = {
    ...message,
    content: sanitizeMessageContent(message.content),
    shareFragment: message.shareFragment?.trim() || undefined,
  };

  const rawBody = await apiFetch(
    `/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(safeMessage),
    },
    options,
  );
  return rawBody as MessageItem;
}
