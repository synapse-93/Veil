import { ConflictError, ForbiddenError } from "../errors.js";
import type { SocialRepository } from "../repository/social.repository.js";
import type { UserRepository } from "../repository/user.repository.js";
import type { CapsuleRepository } from "../repository/capsule.repository.js";
import type {
  FriendItem,
  FriendRequestItem,
  ConversationItem,
  MessageItem,
  MessageType,
  SecurityRecipe,
  UserSearchResult,
  StartConversationResponse,
} from "@secureshare/shared";

export class SocialService {
  constructor(
    private readonly socialRepo: SocialRepository,
    private readonly userRepo: UserRepository,
    private readonly capsuleRepo?: CapsuleRepository,
  ) {}

  async searchUsersWithSocialStatus(userId: string, query: string): Promise<UserSearchResult[]> {
    const rawUsers = await this.userRepo.searchUsers(query, userId, 12);
    const enriched: UserSearchResult[] = [];

    for (const u of rawUsers) {
      const rel = await this.socialRepo.findFriendRequestBetween(userId, u.id);
      enriched.push({
        id: u.id,
        username: u.username,
        isPublic: u.isPublic,
        publicKey: u.publicKey ?? null,
        isFriend: rel?.status === "ACCEPTED",
        requestStatus: rel?.status || null,
        createdAt: u.createdAt.toISOString(),
      });
    }

    return enriched;
  }

  async startConversation(
    userId: string,
    target: { targetUsername?: string; targetUserId?: string },
  ): Promise<StartConversationResponse> {
    let targetUser = null;
    if (target.targetUserId) {
      targetUser = await this.userRepo.findById(target.targetUserId);
    } else if (target.targetUsername) {
      targetUser = await this.userRepo.findByUsername(target.targetUsername.trim());
    }

    if (!targetUser) {
      throw new Error(`Target user not found`);
    }

    if (targetUser.id === userId) {
      throw new Error("You cannot start a conversation with yourself");
    }

    // If target account is private, verify they are connected friends
    if (!targetUser.isPublic) {
      const rel = await this.socialRepo.findFriendRequestBetween(userId, targetUser.id);
      if (!rel || rel.status !== "ACCEPTED") {
        throw new ForbiddenError(
          `@${targetUser.username} has a private account. Please send a friend request to connect before chatting.`,
        );
      }
    }

    const conversationId = await this.socialRepo.getOrCreateConversation(userId, targetUser.id);
    const conversations = await this.getConversations(userId);
    const conv =
      conversations.find((c) => c.id === conversationId) || {
        id: conversationId,
        updatedAt: new Date().toISOString(),
        otherUser: {
          id: targetUser.id,
          username: targetUser.username,
          publicKey: targetUser.publicKey ?? null,
        },
        unreadCount: 0,
      };

    return {
      conversationId,
      conversation: conv,
    };
  }

  async sendFriendRequest(senderId: string, toUsername: string): Promise<FriendRequestItem> {
    const cleanTo = toUsername.trim();
    const receiver = await this.userRepo.findByUsername(cleanTo);
    if (!receiver) {
      throw new Error(`User "${cleanTo}" not found`);
    }

    if (receiver.id === senderId) {
      throw new Error("You cannot send a friend request to yourself");
    }

    const existingRel = await this.socialRepo.findFriendRequestBetween(senderId, receiver.id);
    if (existingRel) {
      if (existingRel.status === "ACCEPTED") {
        throw new ConflictError("You are already connected with this user");
      }
      if (existingRel.status === "PENDING" && existingRel.senderId === senderId) {
        throw new ConflictError("Friend request is already pending");
      }
    }

    return this.socialRepo.createFriendRequest(senderId, receiver.id);
  }

  async getFriendRequests(userId: string): Promise<{ incoming: FriendRequestItem[]; outgoing: FriendRequestItem[] }> {
    return this.socialRepo.getFriendRequests(userId);
  }

  async acceptFriendRequest(requestId: string, userId: string): Promise<FriendRequestItem> {
    const req = await this.socialRepo.findFriendRequestById(requestId);
    if (!req) {
      throw new Error("Friend request not found");
    }

    if (req.receiverId !== userId) {
      throw new ForbiddenError("You cannot accept a request that was not sent to you");
    }

    const updated = await this.socialRepo.updateFriendRequestStatus(requestId, "ACCEPTED");

    // Automatically initialize/get conversation
    await this.socialRepo.getOrCreateConversation(req.senderId, req.receiverId);

    return updated;
  }

  async rejectFriendRequest(requestId: string, userId: string): Promise<FriendRequestItem> {
    const req = await this.socialRepo.findFriendRequestById(requestId);
    if (!req) {
      throw new Error("Friend request not found");
    }

    if (req.receiverId !== userId) {
      throw new ForbiddenError("You cannot reject a request that was not sent to you");
    }

    return this.socialRepo.updateFriendRequestStatus(requestId, "REJECTED");
  }

  async getFriends(userId: string): Promise<FriendItem[]> {
    const friends = await this.socialRepo.getFriends(userId);
    // Attach conversationId to each friend
    const enriched: FriendItem[] = [];
    for (const friend of friends) {
      const convId = await this.socialRepo.getOrCreateConversation(userId, friend.id);
      enriched.push({
        ...friend,
        conversationId: convId,
      });
    }
    return enriched;
  }

  async getConversations(userId: string): Promise<ConversationItem[]> {
    const convs = await this.socialRepo.getConversations(userId);
    if (!this.capsuleRepo) return convs;

    return Promise.all(
      convs.map(async (c) => {
        if (c.lastMessage && c.lastMessage.type === "CAPSULE" && c.lastMessage.capsuleId) {
          try {
            const cap = await this.capsuleRepo!.findById(c.lastMessage.capsuleId);
            if (!cap) {
              const isTimeExpired = c.lastMessage.expiresAt
                ? new Date(c.lastMessage.expiresAt).getTime() <= Date.now()
                : false;
              return {
                ...c,
                lastMessage: {
                  ...c.lastMessage,
                  status: isTimeExpired ? "EXPIRED" : "BURNED",
                },
              };
            }
            let status = cap.status;
            if (status === "ACTIVE" && cap.expiresAt && cap.expiresAt.getTime() <= Date.now()) {
              status = "EXPIRED";
            }
            return {
              ...c,
              lastMessage: {
                ...c.lastMessage,
                status,
              },
            };
          } catch {
            return c;
          }
        }
        return c;
      }),
    );
  }

  async getMessages(conversationId: string, userId: string): Promise<MessageItem[]> {
    const isPart = await this.socialRepo.isConversationParticipant(conversationId, userId);
    if (!isPart) {
      throw new ForbiddenError("You are not a participant in this conversation");
    }

    await this.socialRepo.markConversationRead(conversationId, userId);
    const messages = await this.socialRepo.getMessages(conversationId);

    if (!this.capsuleRepo) {
      return messages;
    }

    return Promise.all(
      messages.map(async (msg) => {
        if (msg.type !== "CAPSULE" || !msg.capsuleId) {
          return msg;
        }

        try {
          const cap = await this.capsuleRepo!.findById(msg.capsuleId);
          if (!cap) {
            const isTimeExpired = msg.expiresAt
              ? new Date(msg.expiresAt).getTime() <= Date.now()
              : false;
            return {
              ...msg,
              status: isTimeExpired ? "EXPIRED" : "BURNED",
            };
          }

          let status = cap.status;
          if (status === "ACTIVE" && cap.expiresAt && cap.expiresAt.getTime() <= Date.now()) {
            status = "EXPIRED";
          }
          return {
            ...msg,
            status,
          };
        } catch {
          return msg;
        }
      }),
    );
  }

  async sendMessage(data: {
    conversationId: string;
    senderId: string;
    type: MessageType;
    content: string;
    shareFragment?: string | null;
    capsuleId?: string | null;
    recipe?: SecurityRecipe | null;
    expiresAt?: string | null;
    maxViews?: number | null;
    burnAfterRead?: boolean | null;
    requiresPassword?: boolean | null;
  }): Promise<MessageItem> {
    return this.socialRepo.createMessage({
      conversationId: data.conversationId,
      senderId: data.senderId,
      type: data.type,
      content: data.content,
      shareFragment: data.shareFragment,
      capsuleId: data.capsuleId,
      recipe: data.recipe,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      maxViews: data.maxViews,
      burnAfterRead: data.burnAfterRead,
      requiresPassword: data.requiresPassword,
    });
  }
}
