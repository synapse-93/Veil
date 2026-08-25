import fs from "node:fs";
import path from "node:path";
import { type PrismaClient } from "@prisma/client";
import type {
  FriendItem,
  FriendRequestItem,
  FriendRequestStatus,
  MessageItem,
  MessageType,
  ConversationItem,
  SecurityRecipe,
} from "@secureshare/shared";
import { DatabaseError, ForbiddenError } from "../errors.js";

export interface SocialRepository {
  createFriendRequest(senderId: string, receiverId: string): Promise<FriendRequestItem>;
  findFriendRequestById(id: string): Promise<FriendRequestItem | null>;
  findFriendRequestBetween(userAId: string, userBId: string): Promise<FriendRequestItem | null>;
  getFriendRequests(userId: string): Promise<{ incoming: FriendRequestItem[]; outgoing: FriendRequestItem[] }>;
  updateFriendRequestStatus(id: string, status: FriendRequestStatus): Promise<FriendRequestItem>;
  getFriends(userId: string): Promise<FriendItem[]>;

  getOrCreateConversation(userAId: string, userBId: string): Promise<string>;
  getConversations(userId: string): Promise<ConversationItem[]>;
  isConversationParticipant(conversationId: string, userId: string): Promise<boolean>;
  getMessages(conversationId: string, limit?: number): Promise<MessageItem[]>;
  createMessage(data: {
    conversationId: string;
    senderId: string;
    type: MessageType;
    content: string;
    shareFragment?: string | null;
    capsuleId?: string | null;
    recipe?: SecurityRecipe | null;
    expiresAt?: Date | null;
    maxViews?: number | null;
    burnAfterRead?: boolean | null;
    requiresPassword?: boolean | null;
  }): Promise<MessageItem>;
  markConversationRead(conversationId: string, userId: string): Promise<void>;
}

export class PrismaSocialRepository implements SocialRepository {
  constructor(private readonly db: PrismaClient) {}

  // Remove any share link fragments from message content before persisting.
  // Examples handled:
  //  - https://example.com/share/<capsuleId>#<fragment> -> https://example.com/share/<capsuleId>
  //  - /share/<capsuleId>#<fragment> -> /share/<capsuleId>
  private sanitizeMessageContent(content: string): string {
    if (!content) return content;
    // Strip fragments from full URLs that include /share/<id>#fragment
    let result = content.replace(/(https?:\/\/\S*\/share\/[A-Za-z0-9_-]+)#\S*/g, "$1");
    // Strip fragments from root-relative share links /share/<id>#fragment
    result = result.replace(/(\b\/share\/[A-Za-z0-9_-]+)#\S*/g, "$1");
    return result;
  }

  async createFriendRequest(senderId: string, receiverId: string): Promise<FriendRequestItem> {
    try {
      const existing = await this.db.friendRequest.findFirst({
        where: {
          OR: [
            { senderId, receiverId },
            { senderId: receiverId, receiverId: senderId },
          ],
        },
        include: {
          sender: { select: { id: true, username: true } },
          receiver: { select: { id: true, username: true } },
        },
      });

      if (existing) {
        if (existing.status === "ACCEPTED") {
          return {
            id: existing.id,
            senderId: existing.senderId,
            receiverId: existing.receiverId,
            status: "ACCEPTED",
            createdAt: existing.createdAt.toISOString(),
            sender: existing.sender,
            receiver: existing.receiver,
          };
        }
        // If rejected previously, update to pending
        const updated = await this.db.friendRequest.update({
          where: { id: existing.id },
          data: {
            senderId,
            receiverId,
            status: "PENDING",
          },
          include: {
            sender: { select: { id: true, username: true } },
            receiver: { select: { id: true, username: true } },
          },
        });
        return {
          id: updated.id,
          senderId: updated.senderId,
          receiverId: updated.receiverId,
          status: updated.status as FriendRequestStatus,
          createdAt: updated.createdAt.toISOString(),
          sender: updated.sender,
          receiver: updated.receiver,
        };
      }

      const created = await this.db.friendRequest.create({
        data: {
          senderId,
          receiverId,
          status: "PENDING",
        },
        include: {
          sender: { select: { id: true, username: true } },
          receiver: { select: { id: true, username: true } },
        },
      });

      return {
        id: created.id,
        senderId: created.senderId,
        receiverId: created.receiverId,
        status: created.status as FriendRequestStatus,
        createdAt: created.createdAt.toISOString(),
        sender: created.sender,
        receiver: created.receiver,
      };
    } catch (err) {
      throw new DatabaseError("Failed to create friend request.", { cause: err });
    }
  }

  async findFriendRequestById(id: string): Promise<FriendRequestItem | null> {
    try {
      const record = await this.db.friendRequest.findUnique({
        where: { id },
        include: {
          sender: { select: { id: true, username: true } },
          receiver: { select: { id: true, username: true } },
        },
      });
      if (!record) return null;
      return {
        id: record.id,
        senderId: record.senderId,
        receiverId: record.receiverId,
        status: record.status as FriendRequestStatus,
        createdAt: record.createdAt.toISOString(),
        sender: record.sender,
        receiver: record.receiver,
      };
    } catch (err) {
      throw new DatabaseError("Failed to find friend request.", { cause: err });
    }
  }

  async findFriendRequestBetween(userAId: string, userBId: string): Promise<FriendRequestItem | null> {
    try {
      const record = await this.db.friendRequest.findFirst({
        where: {
          OR: [
            { senderId: userAId, receiverId: userBId },
            { senderId: userBId, receiverId: userAId },
          ],
        },
        include: {
          sender: { select: { id: true, username: true } },
          receiver: { select: { id: true, username: true } },
        },
      });
      if (!record) return null;
      return {
        id: record.id,
        senderId: record.senderId,
        receiverId: record.receiverId,
        status: record.status as FriendRequestStatus,
        createdAt: record.createdAt.toISOString(),
        sender: record.sender,
        receiver: record.receiver,
      };
    } catch (err) {
      throw new DatabaseError("Failed to find relationship.", { cause: err });
    }
  }

  async getFriendRequests(userId: string): Promise<{ incoming: FriendRequestItem[]; outgoing: FriendRequestItem[] }> {
    try {
      const records = await this.db.friendRequest.findMany({
        where: {
          OR: [
            { receiverId: userId, status: "PENDING" },
            { senderId: userId, status: "PENDING" },
          ],
        },
        include: {
          sender: { select: { id: true, username: true } },
          receiver: { select: { id: true, username: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      const incoming: FriendRequestItem[] = [];
      const outgoing: FriendRequestItem[] = [];

      for (const r of records) {
        const item: FriendRequestItem = {
          id: r.id,
          senderId: r.senderId,
          receiverId: r.receiverId,
          status: r.status as FriendRequestStatus,
          createdAt: r.createdAt.toISOString(),
          sender: r.sender,
          receiver: r.receiver,
        };
        if (r.receiverId === userId) {
          incoming.push(item);
        } else {
          outgoing.push(item);
        }
      }

      return { incoming, outgoing };
    } catch (err) {
      throw new DatabaseError("Failed to get friend requests.", { cause: err });
    }
  }

  async updateFriendRequestStatus(id: string, status: FriendRequestStatus): Promise<FriendRequestItem> {
    try {
      const updated = await this.db.friendRequest.update({
        where: { id },
        data: { status },
        include: {
          sender: { select: { id: true, username: true } },
          receiver: { select: { id: true, username: true } },
        },
      });

      return {
        id: updated.id,
        senderId: updated.senderId,
        receiverId: updated.receiverId,
        status: updated.status as FriendRequestStatus,
        createdAt: updated.createdAt.toISOString(),
        sender: updated.sender,
        receiver: updated.receiver,
      };
    } catch (err) {
      throw new DatabaseError("Failed to update friend request.", { cause: err });
    }
  }

  async getFriends(userId: string): Promise<FriendItem[]> {
    try {
      const records = await this.db.friendRequest.findMany({
        where: {
          status: "ACCEPTED",
          OR: [{ senderId: userId }, { receiverId: userId }],
        },
        include: {
          sender: { select: { id: true, username: true } },
          receiver: { select: { id: true, username: true } },
        },
      });

      const friends: FriendItem[] = [];
      for (const r of records) {
        const other = r.senderId === userId ? r.receiver : r.sender;
        friends.push({
          id: other.id,
          username: other.username,
          createdAt: r.updatedAt.toISOString(),
        });
      }

      return friends;
    } catch (err) {
      throw new DatabaseError("Failed to fetch friends.", { cause: err });
    }
  }

  async getOrCreateConversation(userAId: string, userBId: string): Promise<string> {
    try {
      // Find existing conversation containing both participants
      const existing = await this.db.conversation.findFirst({
        where: {
          AND: [
            { participants: { some: { userId: userAId } } },
            { participants: { some: { userId: userBId } } },
          ],
        },
      });

      if (existing) {
        return existing.id;
      }

      const created = await this.db.conversation.create({
        data: {
          participants: {
            create: [{ userId: userAId }, { userId: userBId }],
          },
        },
      });

      return created.id;
    } catch (err) {
      throw new DatabaseError("Failed to get/create conversation.", { cause: err });
    }
  }

  async getConversations(userId: string): Promise<ConversationItem[]> {
    try {
      const memberships = await this.db.conversationParticipant.findMany({
        where: { userId },
        include: {
          conversation: {
            include: {
              participants: {
                include: {
                  user: { select: { id: true, username: true } },
                },
              },
              messages: {
                orderBy: { createdAt: "desc" },
                take: 1,
                include: {
                  sender: { select: { id: true, username: true } },
                },
              },
            },
          },
        },
        orderBy: { conversation: { updatedAt: "desc" } },
      });

      const results: ConversationItem[] = [];

      for (const m of memberships) {
        const conv = m.conversation;
        const otherParticipant = conv.participants.find((p) => p.userId !== userId);
        if (!otherParticipant) continue;

        const lastMsg = conv.messages[0];
        const lastMessageItem: MessageItem | null = lastMsg
          ? {
              id: lastMsg.id,
              conversationId: lastMsg.conversationId,
              senderId: lastMsg.senderId,
              senderUsername: lastMsg.sender?.username,
              type: lastMsg.type as MessageType,
              content: lastMsg.content,
              shareFragment: lastMsg.shareFragment,
              capsuleId: lastMsg.capsuleId,
              recipe: lastMsg.recipe as SecurityRecipe,
              expiresAt: lastMsg.expiresAt?.toISOString(),
              maxViews: lastMsg.maxViews,
              burnAfterRead: lastMsg.burnAfterRead,
              requiresPassword: lastMsg.requiresPassword,
              createdAt: lastMsg.createdAt.toISOString(),
            }
          : null;

        // Unread messages count
        const unreadCount = await this.db.message.count({
          where: {
            conversationId: conv.id,
            senderId: { not: userId },
            createdAt: { gt: m.lastReadAt },
          },
        });

        results.push({
          id: conv.id,
          updatedAt: conv.updatedAt.toISOString(),
          otherUser: {
            id: otherParticipant.user.id,
            username: otherParticipant.user.username,
          },
          lastMessage: lastMessageItem,
          unreadCount,
        });
      }

      return results;
    } catch (err) {
      throw new DatabaseError("Failed to fetch conversations.", { cause: err });
    }
  }

  async isConversationParticipant(conversationId: string, userId: string): Promise<boolean> {
    try {
      const part = await this.db.conversationParticipant.findUnique({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
      });
      return !!part;
    } catch (err) {
      throw new DatabaseError("Failed to check conversation participation.", { cause: err });
    }
  }

  async getMessages(conversationId: string, limit = 50): Promise<MessageItem[]> {
    try {
      const records = await this.db.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: "asc" },
        take: limit,
        include: {
          sender: { select: { id: true, username: true } },
        },
      });

      return records.map((r) => ({
        id: r.id,
        conversationId: r.conversationId,
        senderId: r.senderId,
        senderUsername: r.sender?.username,
        type: r.type as MessageType,
        content: r.content,
        shareFragment: r.shareFragment,
        capsuleId: r.capsuleId,
        recipe: r.recipe as SecurityRecipe,
        expiresAt: r.expiresAt?.toISOString(),
        maxViews: r.maxViews,
        burnAfterRead: r.burnAfterRead,
        requiresPassword: r.requiresPassword,
        createdAt: r.createdAt.toISOString(),
      }));
    } catch (err) {
      throw new DatabaseError("Failed to fetch messages.", { cause: err });
    }
  }

  async createMessage(data: {
    conversationId: string;
    senderId: string;
    type: MessageType;
    content: string;
    shareFragment?: string | null;
    capsuleId?: string | null;
    recipe?: SecurityRecipe | null;
    expiresAt?: Date | null;
    maxViews?: number | null;
    burnAfterRead?: boolean | null;
    requiresPassword?: boolean | null;
  }): Promise<MessageItem> {
    try {
      const isPart = await this.isConversationParticipant(data.conversationId, data.senderId);
      if (!isPart) {
        throw new ForbiddenError("You are not a participant in this conversation.");
      }

      // Ensure any share fragments embedded in message text are removed before storing.
      // The raw fragment is kept separately in shareFragment so the recipient can
      // reconstruct the auto-filled decryption URL without relying on a hash in
      // a browser URL request.
      const safeContent = this.sanitizeMessageContent(data.content);
      const normalizedShareFragment = data.shareFragment?.trim() || null;

      const record = await this.db.message.create({
        data: {
          conversationId: data.conversationId,
          senderId: data.senderId,
          type: data.type,
          content: safeContent,
          shareFragment: normalizedShareFragment,
          capsuleId: data.capsuleId ?? null,
          recipe: data.recipe ?? null,
          expiresAt: data.expiresAt ?? null,
          maxViews: data.maxViews ?? null,
          burnAfterRead: data.burnAfterRead ?? null,
          requiresPassword: data.requiresPassword ?? null,
        },
        include: {
          sender: { select: { id: true, username: true } },
        },
      });

      // Update conversation timestamp
      await this.db.conversation.update({
        where: { id: data.conversationId },
        data: { updatedAt: new Date() },
      });

      return {
        id: record.id,
        conversationId: record.conversationId,
        senderId: record.senderId,
        senderUsername: record.sender?.username,
        type: record.type as MessageType,
        content: record.content,
        shareFragment: record.shareFragment,
        capsuleId: record.capsuleId,
        recipe: record.recipe as SecurityRecipe,
        expiresAt: record.expiresAt?.toISOString(),
        maxViews: record.maxViews,
        burnAfterRead: record.burnAfterRead,
        requiresPassword: record.requiresPassword,
        createdAt: record.createdAt.toISOString(),
      };
    } catch (err) {
      if (err instanceof ForbiddenError) throw err;
      throw new DatabaseError("Failed to create message.", { cause: err });
    }
  }

  async markConversationRead(conversationId: string, userId: string): Promise<void> {
    try {
      await this.db.conversationParticipant.update({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
        data: { lastReadAt: new Date() },
      });
    } catch {
      // Ignore if not found
    }
  }
}

// ---------------------------------------------------------------------------
// In-Memory Social Repository (Fallback & Unit Testing)
// ---------------------------------------------------------------------------

type MemoryFriendReq = {
  id: string;
  senderId: string;
  receiverId: string;
  status: FriendRequestStatus;
  createdAt: Date;
  updatedAt: Date;
};

type MemoryConv = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  participants: Array<{ userId: string; lastReadAt: Date }>;
};

type MemoryMsg = {
  id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  content: string;
  capsuleId?: string | null;
  recipe?: SecurityRecipe | null;
  expiresAt?: Date | null;
  maxViews?: number | null;
  burnAfterRead?: boolean | null;
  requiresPassword?: boolean | null;
  createdAt: Date;
};

export class InMemorySocialRepository implements SocialRepository {
  private readonly friendRequests = new Map<string, MemoryFriendReq>();
  private readonly conversations = new Map<string, MemoryConv>();
  private readonly messages = new Map<string, MemoryMsg>();
  private readonly userLookup: (userId: string) => Promise<{ id: string; username: string } | null>;
  private readonly storagePath: string;

  constructor(
    userLookup?: (userId: string) => Promise<{ id: string; username: string } | null>,
    storageDir?: string,
  ) {
    this.userLookup = userLookup ?? (async () => null);
    const dir = storageDir || path.resolve(process.cwd(), ".veil_data");
    this.storagePath = path.join(dir, "social.json");
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.load();
    } catch (err) {
      console.warn(
        "[SocialRepository] Failed to init storage directory:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // Same sanitization as Prisma repository: remove URL fragments from /share/<id>#fragment
  private sanitizeMessageContent(content: string): string {
    if (!content) return content;
    let result = content.replace(/(https?:\/\/\S*\/share\/[A-Za-z0-9_-]+)#\S*/g, "$1");
    result = result.replace(/(\b\/share\/[A-Za-z0-9_-]+)#\S*/g, "$1");
    return result;
  }

  private load(): void {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, "utf-8");
        const data = JSON.parse(raw);
        if (data.friendRequests) {
          for (const req of data.friendRequests) {
            this.friendRequests.set(req.id, {
              ...req,
              createdAt: new Date(req.createdAt),
              updatedAt: new Date(req.updatedAt),
            });
          }
        }
        if (data.conversations) {
          for (const conv of data.conversations) {
            this.conversations.set(conv.id, {
              ...conv,
              createdAt: new Date(conv.createdAt),
              updatedAt: new Date(conv.updatedAt),
              participants: conv.participants.map((p: any) => ({
                userId: p.userId,
                lastReadAt: new Date(p.lastReadAt),
              })),
            });
          }
        }
        if (data.messages) {
          for (const msg of data.messages) {
            this.messages.set(msg.id, {
              ...msg,
              expiresAt: msg.expiresAt ? new Date(msg.expiresAt) : null,
              createdAt: new Date(msg.createdAt),
            });
          }
        }
      }
    } catch (err) {
      console.warn(
        "[SocialRepository] Failed to load persisted social data:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  private save(): void {
    try {
      const data = {
        friendRequests: Array.from(this.friendRequests.values()).map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        })),
        conversations: Array.from(this.conversations.values()).map((c) => ({
          ...c,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
          participants: c.participants.map((p) => ({
            userId: p.userId,
            lastReadAt: p.lastReadAt.toISOString(),
          })),
        })),
        messages: Array.from(this.messages.values()).map((m) => ({
          ...m,
          expiresAt: m.expiresAt ? m.expiresAt.toISOString() : null,
          createdAt: m.createdAt.toISOString(),
        })),
      };
      fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.warn(
        "[SocialRepository] Failed to persist social data:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  async createFriendRequest(senderId: string, receiverId: string): Promise<FriendRequestItem> {
    const crypto = await import("node:crypto");
    for (const req of this.friendRequests.values()) {
      if (
        (req.senderId === senderId && req.receiverId === receiverId) ||
        (req.senderId === receiverId && req.receiverId === senderId)
      ) {
        if (req.status === "ACCEPTED") {
          const sender = await this.userLookup(req.senderId);
          const receiver = await this.userLookup(req.receiverId);
          return {
            id: req.id,
            senderId: req.senderId,
            receiverId: req.receiverId,
            status: "ACCEPTED",
            createdAt: req.createdAt.toISOString(),
            sender: sender ?? undefined,
            receiver: receiver ?? undefined,
          };
        }
        req.senderId = senderId;
        req.receiverId = receiverId;
        req.status = "PENDING";
        req.updatedAt = new Date();
        this.save();
        const sender = await this.userLookup(senderId);
        const receiver = await this.userLookup(receiverId);
        return {
          id: req.id,
          senderId: req.senderId,
          receiverId: req.receiverId,
          status: "PENDING",
          createdAt: req.createdAt.toISOString(),
          sender: sender ?? undefined,
          receiver: receiver ?? undefined,
        };
      }
    }

    const id = crypto.randomUUID();
    const now = new Date();
    const newReq: MemoryFriendReq = {
      id,
      senderId,
      receiverId,
      status: "PENDING",
      createdAt: now,
      updatedAt: now,
    };
    this.friendRequests.set(id, newReq);
    this.save();

    const sender = await this.userLookup(senderId);
    const receiver = await this.userLookup(receiverId);

    return {
      id,
      senderId,
      receiverId,
      status: "PENDING",
      createdAt: now.toISOString(),
      sender: sender ?? undefined,
      receiver: receiver ?? undefined,
    };
  }

  async findFriendRequestById(id: string): Promise<FriendRequestItem | null> {
    const req = this.friendRequests.get(id);
    if (!req) return null;
    const sender = await this.userLookup(req.senderId);
    const receiver = await this.userLookup(req.receiverId);
    return {
      id: req.id,
      senderId: req.senderId,
      receiverId: req.receiverId,
      status: req.status,
      createdAt: req.createdAt.toISOString(),
      sender: sender ?? undefined,
      receiver: receiver ?? undefined,
    };
  }

  async findFriendRequestBetween(userAId: string, userBId: string): Promise<FriendRequestItem | null> {
    for (const req of this.friendRequests.values()) {
      if (
        (req.senderId === userAId && req.receiverId === userBId) ||
        (req.senderId === userBId && req.receiverId === userAId)
      ) {
        const sender = await this.userLookup(req.senderId);
        const receiver = await this.userLookup(req.receiverId);
        return {
          id: req.id,
          senderId: req.senderId,
          receiverId: req.receiverId,
          status: req.status,
          createdAt: req.createdAt.toISOString(),
          sender: sender ?? undefined,
          receiver: receiver ?? undefined,
        };
      }
    }
    return null;
  }

  async getFriendRequests(userId: string): Promise<{ incoming: FriendRequestItem[]; outgoing: FriendRequestItem[] }> {
    const incoming: FriendRequestItem[] = [];
    const outgoing: FriendRequestItem[] = [];

    for (const req of this.friendRequests.values()) {
      if (req.status !== "PENDING") continue;
      const sender = await this.userLookup(req.senderId);
      const receiver = await this.userLookup(req.receiverId);
      const item: FriendRequestItem = {
        id: req.id,
        senderId: req.senderId,
        receiverId: req.receiverId,
        status: req.status,
        createdAt: req.createdAt.toISOString(),
        sender: sender ?? undefined,
        receiver: receiver ?? undefined,
      };
      if (req.receiverId === userId) {
        incoming.push(item);
      } else if (req.senderId === userId) {
        outgoing.push(item);
      }
    }

    return {
      incoming: incoming.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      outgoing: outgoing.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    };
  }

  async updateFriendRequestStatus(id: string, status: FriendRequestStatus): Promise<FriendRequestItem> {
    const req = this.friendRequests.get(id);
    if (!req) {
      throw new DatabaseError("Friend request not found");
    }
    req.status = status;
    req.updatedAt = new Date();
    this.friendRequests.set(id, req);
    this.save();

    const sender = await this.userLookup(req.senderId);
    const receiver = await this.userLookup(req.receiverId);

    return {
      id: req.id,
      senderId: req.senderId,
      receiverId: req.receiverId,
      status: req.status,
      createdAt: req.createdAt.toISOString(),
      sender: sender ?? undefined,
      receiver: receiver ?? undefined,
    };
  }

  async getFriends(userId: string): Promise<FriendItem[]> {
    const friends: FriendItem[] = [];
    for (const req of this.friendRequests.values()) {
      if (req.status === "ACCEPTED" && (req.senderId === userId || req.receiverId === userId)) {
        const otherId = req.senderId === userId ? req.receiverId : req.senderId;
        const other = await this.userLookup(otherId);
        if (other) {
          friends.push({
            id: other.id,
            username: other.username,
            createdAt: req.updatedAt.toISOString(),
          });
        }
      }
    }
    return friends;
  }

  async getOrCreateConversation(userAId: string, userBId: string): Promise<string> {
    const crypto = await import("node:crypto");
    for (const conv of this.conversations.values()) {
      const pIds = conv.participants.map((p) => p.userId);
      if (pIds.includes(userAId) && pIds.includes(userBId)) {
        return conv.id;
      }
    }

    const id = crypto.randomUUID();
    const now = new Date();
    const conv: MemoryConv = {
      id,
      createdAt: now,
      updatedAt: now,
      participants: [
        { userId: userAId, lastReadAt: now },
        { userId: userBId, lastReadAt: now },
      ],
    };
    this.conversations.set(id, conv);
    this.save();
    return id;
  }

  async getConversations(userId: string): Promise<ConversationItem[]> {
    // Do NOT auto-create demo conversations for users. Previously this method
    // would automatically connect every user to a demo account (@synapse_2),
    // which causes new users to inherit another account's conversation data.
    // That behavior violates isolation and privacy guarantees. Keep conversation
    // listing strictly to conversations the user is explicitly a participant of.
    const results: ConversationItem[] = [];

    for (const conv of this.conversations.values()) {
      const myPart = conv.participants.find((p) => p.userId === userId);
      if (!myPart) continue;

      const otherPart = conv.participants.find((p) => p.userId !== userId);
      if (!otherPart) continue;

      const otherUser = (await this.userLookup(otherPart.userId)) ?? {
        id: otherPart.userId,
        username: "user_" + otherPart.userId.slice(0, 6),
      };

      const convMessages = Array.from(this.messages.values())
        .filter((m) => m.conversationId === conv.id)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      const lastMsg = convMessages[0];
      const lastSender = lastMsg ? await this.userLookup(lastMsg.senderId) : null;

      const unreadCount = convMessages.filter(
        (m) => m.senderId !== userId && m.createdAt > myPart.lastReadAt,
      ).length;

      results.push({
        id: conv.id,
        updatedAt: conv.updatedAt.toISOString(),
        otherUser,
        lastMessage: lastMsg
          ? {
              id: lastMsg.id,
              conversationId: lastMsg.conversationId,
              senderId: lastMsg.senderId,
              senderUsername: lastSender?.username,
              type: lastMsg.type,
              content: lastMsg.content,
              capsuleId: lastMsg.capsuleId,
              recipe: lastMsg.recipe,
              expiresAt: lastMsg.expiresAt?.toISOString(),
              maxViews: lastMsg.maxViews,
              burnAfterRead: lastMsg.burnAfterRead,
              requiresPassword: lastMsg.requiresPassword,
              createdAt: lastMsg.createdAt.toISOString(),
            }
          : null,
        unreadCount,
      });
    }

    return results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async isConversationParticipant(conversationId: string, userId: string): Promise<boolean> {
    const conv = this.conversations.get(conversationId);
    if (!conv) return false;
    return conv.participants.some((p) => p.userId === userId);
  }

  async getMessages(conversationId: string, limit = 50): Promise<MessageItem[]> {
    const list: MessageItem[] = [];
    const convMessages = Array.from(this.messages.values())
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(-limit);

    for (const m of convMessages) {
      const sender = await this.userLookup(m.senderId);
      list.push({
        id: m.id,
        conversationId: m.conversationId,
        senderId: m.senderId,
        senderUsername: sender?.username,
        type: m.type,
        content: m.content,
        capsuleId: m.capsuleId,
        recipe: m.recipe,
        expiresAt: m.expiresAt?.toISOString(),
        maxViews: m.maxViews,
        burnAfterRead: m.burnAfterRead,
        requiresPassword: m.requiresPassword,
        createdAt: m.createdAt.toISOString(),
      });
    }

    return list;
  }

  async createMessage(data: {
    conversationId: string;
    senderId: string;
    type: MessageType;
    content: string;
    capsuleId?: string | null;
    recipe?: SecurityRecipe | null;
    expiresAt?: Date | null;
    maxViews?: number | null;
    burnAfterRead?: boolean | null;
    requiresPassword?: boolean | null;
  }): Promise<MessageItem> {
    const crypto = await import("node:crypto");
    const conv = this.conversations.get(data.conversationId);
    if (!conv || !conv.participants.some((p) => p.userId === data.senderId)) {
      throw new ForbiddenError("You are not a participant in this conversation.");
    }

    const id = crypto.randomUUID();
    const now = new Date();
    const safeContent = this.sanitizeMessageContent(data.content);

    const msg: MemoryMsg = {
      id,
      conversationId: data.conversationId,
      senderId: data.senderId,
      type: data.type,
      content: safeContent,
      capsuleId: data.capsuleId,
      recipe: data.recipe,
      expiresAt: data.expiresAt,
      maxViews: data.maxViews,
      burnAfterRead: data.burnAfterRead,
      requiresPassword: data.requiresPassword,
      createdAt: now,
    };
    this.messages.set(id, msg);

    conv.updatedAt = now;
    this.conversations.set(data.conversationId, conv);
    this.save();

    const sender = await this.userLookup(data.senderId);

    return {
      id,
      conversationId: data.conversationId,
      senderId: data.senderId,
      senderUsername: sender?.username,
      type: data.type,
      content: safeContent,
      capsuleId: data.capsuleId,
      recipe: data.recipe,
      expiresAt: data.expiresAt?.toISOString(),
      maxViews: data.maxViews,
      burnAfterRead: data.burnAfterRead,
      requiresPassword: data.requiresPassword,
      createdAt: now.toISOString(),
    };
  }

  async markConversationRead(conversationId: string, userId: string): Promise<void> {
    const conv = this.conversations.get(conversationId);
    if (!conv) return;
    const part = conv.participants.find((p) => p.userId === userId);
    if (part) {
      part.lastReadAt = new Date();
      this.save();
    }
  }
}
