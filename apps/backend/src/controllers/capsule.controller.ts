import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { validateCapsuleCreationRequest } from "@secureshare/shared";
import type { CapsuleService } from "../services/capsule.service.js";
import {
  CapsuleNotFoundError,
  CapsuleNotConsumableError,
  DatabaseError,
  ForbiddenError,
} from "../errors.js";
import { requireAuth } from "../plugins/auth.js";

export function registerCapsuleControllers(app: FastifyInstance, service: CapsuleService) {
  app.post("/capsules", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = validateCapsuleCreationRequest((request as any).body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request", details: parsed.error.issues });
    }

    const body = parsed.data;

    try {
      const stored = await service.createCapsule({
        ciphertext: body.encryptedPayload.ciphertext,
        nonce: body.encryptedPayload.nonce,
        algorithm: body.encryptedPayload.algorithm,
        recipe: body.recipe,
        ttlSeconds: body.ttlSeconds,
        maxViews: body.maxViews,
        requiresPassword: body.requiresPassword,
        burnAfterRead: body.burnAfterRead,
        creatorId: request.user?.userId,
      });

      const response = {
        metadata: {
          id: stored.id,
          recipe: stored.recipe,
          createdAt: stored.createdAt.toISOString(),
          expiresAt: stored.expiresAt.toISOString(),
          maxViews: stored.maxViews,
          currentViews: stored.currentViews,
          requiresPassword: stored.requiresPassword,
          burnAfterRead: stored.burnAfterRead,
          status: stored.status,
        },
        encryptedPayload: {
          ciphertext: stored.ciphertext,
          nonce: stored.nonce,
          algorithm: stored.algorithm,
        },
        revokeToken: stored.revokeToken ?? undefined,
      };

      return reply.status(201).send(response);
    } catch (err) {
      if (err instanceof DatabaseError) {
        return reply.status(500).send({ error: "Database error" });
      }
      return reply.status(500).send({ error: "Unexpected error" });
    }
  });

  app.post("/capsules/:id/consume", async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.params as any).id;
    if (typeof id !== "string") return reply.status(400).send({ error: "Invalid capsule id" });
    const tid = id.trim();
    if (tid.length === 0 || tid.length > 128 || !/^[A-Za-z0-9_-]+$/.test(tid)) {
      return reply.status(400).send({ error: "Invalid capsule id" });
    }

    try {
      const consumed = await service.consumeCapsule(tid);

      const response = {
        metadata: {
          id: consumed.id,
          recipe: consumed.recipe,
          createdAt: consumed.createdAt.toISOString(),
          expiresAt: consumed.expiresAt.toISOString(),
          maxViews: consumed.maxViews,
          currentViews: consumed.currentViews,
          requiresPassword: consumed.requiresPassword,
          burnAfterRead: consumed.burnAfterRead,
          status: consumed.status,
        },
        encryptedPayload: {
          ciphertext: consumed.ciphertext,
          nonce: consumed.nonce,
          algorithm: consumed.algorithm,
        },
      };

      return reply.send(response);
    } catch (err) {
      if (err instanceof CapsuleNotFoundError) return reply.status(404).send({ error: "Not found", reason: "NOT_FOUND" });
      if (err instanceof CapsuleNotConsumableError) {
        if (err.reason === "VIEW_LIMIT_REACHED") {
          return reply.status(429).send({ error: err.message, reason: "VIEW_LIMIT_REACHED" });
        }
        if (err.reason === "REVOKED") {
          return reply.status(410).send({ error: "Capsule revoked by sender", reason: "REVOKED" });
        }
        return reply.status(410).send({ error: err.message, reason: err.reason });
      }
      if (err instanceof DatabaseError) return reply.status(500).send({ error: "Database error" });
      return reply.status(500).send({ error: "Unexpected error" });
    }
  });

  app.post("/capsules/:id/revoke", async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.params as any).id;
    if (typeof id !== "string") return reply.status(400).send({ error: "Invalid capsule id" });
    const tid = id.trim();

    const body = (request.body as any) || {};
    const tokenOrUserId = body.revokeToken || request.user?.userId;

    if (!tokenOrUserId) {
      return reply.status(401).send({ error: "Revoke token or authenticated user session is required" });
    }

    try {
      const revoked = await service.revokeCapsule(tid, tokenOrUserId);
      return reply.send({
        success: true,
        message: "Capsule revoked successfully",
        capsuleId: revoked.id,
        status: "REVOKED",
      });
    } catch (err) {
      if (err instanceof CapsuleNotFoundError) {
        return reply.status(404).send({ error: "Capsule not found" });
      }
      if (err instanceof ForbiddenError) {
        return reply.status(403).send({ error: err.message });
      }
      if (err instanceof DatabaseError) {
        return reply.status(500).send({ error: "Database error" });
      }
      return reply.status(500).send({ error: "Unexpected error" });
    }
  });

  app.get("/capsules/user", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = requireAuth(request, reply);
    if (!user) return;

    try {
      const capsules = await service.getUserCapsules(user.userId);
      return reply.send({
        capsules: capsules.map((c) => ({
          metadata: {
            id: c.id,
            recipe: c.recipe,
            createdAt: c.createdAt.toISOString(),
            expiresAt: c.expiresAt.toISOString(),
            maxViews: c.maxViews,
            currentViews: c.currentViews,
            requiresPassword: c.requiresPassword,
            burnAfterRead: c.burnAfterRead,
            status: c.status,
          },
          revokeToken: c.revokeToken ?? undefined,
        })),
      });
    } catch (err) {
      if (err instanceof DatabaseError) return reply.status(500).send({ error: "Database error" });
      return reply.status(500).send({ error: "Unexpected error" });
    }
  });
}
