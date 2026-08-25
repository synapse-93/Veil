import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { registerSchema, loginSchema, updatePrivacySchema, updatePublicKeySchema } from "@secureshare/shared";
import type { UserService } from "../services/user.service.js";
import { ConflictError, UnauthorizedError, DatabaseError } from "../errors.js";
import { requireAuth } from "../plugins/auth.js";
import { revokeSessionToken } from "../utils/auth.js";

export function registerAuthControllers(app: FastifyInstance, userService: UserService) {
  app.post("/auth/register", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.issues.map((i) => i.message),
      });
    }

    try {
      const result = await userService.register(
        parsed.data.username,
        parsed.data.password,
        true,
        parsed.data.publicKey,
      );
      return reply.status(201).send(result);
    } catch (err) {
      if (err instanceof ConflictError) {
        return reply.status(409).send({ error: err.message });
      }
      if (err instanceof DatabaseError) {
        return reply.status(500).send({ error: "Database error" });
      }
      return reply.status(500).send({ error: "Failed to register user" });
    }
  });

  app.post("/auth/login", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.issues.map((i) => i.message),
      });
    }

    try {
      const result = await userService.login(parsed.data.username, parsed.data.password);
      return reply.send(result);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return reply.status(401).send({ error: err.message });
      }
      if (err instanceof DatabaseError) {
        return reply.status(500).send({ error: "Database error" });
      }
      return reply.status(500).send({ error: "Failed to login" });
    }
  });

  app.get("/auth/me", async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = requireAuth(request, reply);
    if (!userPayload) return;

    try {
      const user = await userService.getOrCreateSessionUser(userPayload.userId, userPayload.username);
      return reply.send({
        user: {
          id: user.id,
          username: user.username,
          isPublic: user.isPublic ?? true,
          publicKey: user.publicKey ?? null,
          createdAt: user.createdAt.toISOString(),
        },
      });
    } catch (err) {
      return reply.status(500).send({ error: "Failed to fetch user profile" });
    }
  });

  app.patch("/auth/me/privacy", async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = requireAuth(request, reply);
    if (!userPayload) return;

    const parsed = updatePrivacySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid privacy configuration",
        details: parsed.error.issues.map((i) => i.message),
      });
    }

    try {
      const updated = await userService.updatePrivacy(userPayload.userId, parsed.data.isPublic);
      return reply.send({
        user: {
          id: updated.id,
          username: updated.username,
          isPublic: updated.isPublic ?? true,
          publicKey: updated.publicKey ?? null,
          createdAt: updated.createdAt.toISOString(),
        },
      });
    } catch (err) {
      return reply.status(500).send({ error: "Failed to update privacy setting" });
    }
  });

  app.put("/auth/me/public-key", async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = requireAuth(request, reply);
    if (!userPayload) return;

    const parsed = updatePublicKeySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid public key configuration",
        details: parsed.error.issues.map((i) => i.message),
      });
    }

    try {
      const updated = await userService.updatePublicKey(userPayload.userId, parsed.data.publicKey);
      return reply.send({
        user: {
          id: updated.id,
          username: updated.username,
          isPublic: updated.isPublic ?? true,
          publicKey: updated.publicKey ?? null,
          createdAt: updated.createdAt.toISOString(),
        },
      });
    } catch (err) {
      return reply.status(500).send({ error: "Failed to update public key" });
    }
  });

  app.post("/auth/logout", async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      revokeSessionToken(token);
    }

    return reply.send({ success: true, message: "Logged out successfully" });
  });
}
