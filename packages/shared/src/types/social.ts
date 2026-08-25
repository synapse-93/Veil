import type { SecurityRecipe } from "./capsule.js";

export type FriendRequestStatus = "PENDING" | "ACCEPTED" | "REJECTED";

export type FriendRequestItem = {
  id: string;
  senderId: string;
  receiverId: string;
  status: FriendRequestStatus;
  createdAt: string;
  sender?: { id: string; username: string };
  receiver?: { id: string; username: string };
};

export type FriendItem = {
  id: string;
  username: string;
  conversationId?: string;
  publicKey?: string | null;
  createdAt: string;
};

export type MessageType = "TEXT" | "CAPSULE";

export type MessageItem = {
  id: string;
  conversationId: string;
  senderId: string;
  senderUsername?: string;
  type: MessageType;
  content: string;
  shareFragment?: string | null;
  capsuleId?: string | null;
  recipe?: SecurityRecipe | null;
  expiresAt?: string | null;
  maxViews?: number | null;
  burnAfterRead?: boolean | null;
  requiresPassword?: boolean | null;
  status?: "ACTIVE" | "EXPIRED" | "REVOKED" | "BURNED" | "VIEW_LIMIT_REACHED" | string | null;
  createdAt: string;
};

export type ConversationItem = {
  id: string;
  updatedAt: string;
  otherUser: {
    id: string;
    username: string;
    publicKey?: string | null;
  };
  lastMessage?: MessageItem | null;
  unreadCount: number;
};

export type UserSearchResult = {
  id: string;
  username: string;
  isPublic: boolean;
  isFriend?: boolean;
  publicKey?: string | null;
  requestStatus?: FriendRequestStatus | null;
  createdAt: string;
};

export type StartConversationRequest = {
  targetUsername?: string;
  targetUserId?: string;
};

export type StartConversationResponse = {
  conversationId: string;
  conversation: ConversationItem;
};

export type RevokeCapsuleRequest = {
  revokeToken?: string;
};

export type RevokeCapsuleResponse = {
  success: boolean;
  message: string;
  capsuleId: string;
  status: "REVOKED";
};
