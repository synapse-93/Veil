import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  friendRequestCreateSchema,
  sendMessageSchema,
  startConversationSchema,
} from "@secureshare/shared";
import type { SocialService } from "../services/social.service.js";
import { requireAuth } from "../plugins/auth.js";
import { ConflictError, ForbiddenError, DatabaseError } from "../errors.js";

export function registerSocialControllers(app: FastifyInstance, socialService: SocialService) {
  // ---------------------------------------------------------------------------
  // Friends & Requests
  // ---------------------------------------------------------------------------

  app.post("/friends/requests", async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = requireAuth(request, reply);
    if (!userPayload) return;

    const parsed = friendRequestCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.issues.map((i) => i.message),
      });
    }

    try {
      const result = await socialService.sendFriendRequest(userPayload.userId, parsed.data.toUsername);
      return reply.status(201).send(result);
    } catch (err: any) {
      if (err instanceof ConflictError) {
        return reply.status(409).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message || "Failed to send friend request" });
    }
  });

  app.get("/friends/requests", async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = requireAuth(request, reply);
    if (!userPayload) return;

    try {
      const requests = await socialService.getFriendRequests(userPayload.userId);
      return reply.send(requests);
    } catch (err) {
      return reply.status(500).send({ error: "Failed to fetch friend requests" });
    }
  });

  app.post("/friends/requests/:id/accept", async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = requireAuth(request, reply);
    if (!userPayload) return;

    const id = (request.params as any).id;
    try {
      const result = await socialService.acceptFriendRequest(id, userPayload.userId);
      return reply.send(result);
    } catch (err: any) {
      if (err instanceof ForbiddenError) {
        return reply.status(403).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message || "Failed to accept friend request" });
    }
  });

  app.post("/friends/requests/:id/reject", async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = requireAuth(request, reply);
    if (!userPayload) return;

    const id = (request.params as any).id;
    try {
      const result = await socialService.rejectFriendRequest(id, userPayload.userId);
      return reply.send(result);
    } catch (err: any) {
      if (err instanceof ForbiddenError) {
        return reply.status(403).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message || "Failed to reject friend request" });
    }
  });

  app.get("/friends", async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = requireAuth(request, reply);
    if (!userPayload) return;

    try {
      const friends = await socialService.getFriends(userPayload.userId);
      return reply.send({ friends });
    } catch (err) {
      return reply.status(500).send({ error: "Failed to fetch friends" });
    }
  });

  // ---------------------------------------------------------------------------
  // Conversations & Messages
  // ---------------------------------------------------------------------------

  app.post("/conversations/start", async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = requireAuth(request, reply);
    if (!userPayload) return;

    const parsed = startConversationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.issues.map((i) => i.message),
      });
    }

    try {
      const result = await socialService.startConversation(userPayload.userId, parsed.data);
      return reply.status(200).send(result);
    } catch (err: any) {
      if (err instanceof ForbiddenError) {
        return reply.status(403).send({ error: err.message, isPrivateAccount: true });
      }
      return reply.status(400).send({ error: err.message || "Failed to start conversation" });
    }
  });

  app.get("/conversations", async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = requireAuth(request, reply);
    if (!userPayload) return;

    try {
      const conversations = await socialService.getConversations(userPayload.userId);
      return reply.send({ conversations });
    } catch (err) {
      return reply.status(500).send({ error: "Failed to fetch conversations" });
    }
  });

  app.get("/conversations/:id/messages", async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = requireAuth(request, reply);
    if (!userPayload) return;

    const conversationId = (request.params as any).id;
    try {
      const messages = await socialService.getMessages(conversationId, userPayload.userId);
      return reply.send({ messages });
    } catch (err: any) {
      if (err instanceof ForbiddenError) {
        return reply.status(403).send({ error: err.message });
      }
      return reply.status(500).send({ error: "Failed to fetch messages" });
    }
  });

  app.post("/conversations/:id/messages", async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = requireAuth(request, reply);
    if (!userPayload) return;

    const conversationId = (request.params as any).id;
    const parsed = sendMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.issues.map((i) => i.message),
      });
    }

    try {
      const msgData = parsed.data;
      const message = await socialService.sendMessage({
        conversationId,
        senderId: userPayload.userId,
        type: msgData.type,
        content: msgData.type === "TEXT" ? msgData.content : (msgData.content || ""),
        shareFragment: msgData.type === "CAPSULE" ? msgData.shareFragment : undefined,
        capsuleId: msgData.type === "CAPSULE" ? msgData.capsuleId : undefined,
        recipe: msgData.type === "CAPSULE" ? msgData.recipe : undefined,
        expiresAt: msgData.type === "CAPSULE" ? msgData.expiresAt : undefined,
        maxViews: msgData.type === "CAPSULE" ? msgData.maxViews : undefined,
        burnAfterRead: msgData.type === "CAPSULE" ? msgData.burnAfterRead : undefined,
        requiresPassword: msgData.type === "CAPSULE" ? msgData.requiresPassword : undefined,
      });

      return reply.status(201).send(message);
    } catch (err: any) {
      if (err instanceof ForbiddenError) {
        return reply.status(403).send({ error: err.message });
      }
      return reply.status(500).send({ error: "Failed to send message" });
    }
  });
}
