import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserService } from "../services/user.service.js";
import type { SocialService } from "../services/social.service.js";
import { requireAuth } from "../plugins/auth.js";

export function registerUserControllers(
  app: FastifyInstance,
  userService: UserService,
  socialService?: SocialService,
) {
  app.get("/users/search", async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = requireAuth(request, reply);
    if (!userPayload) return;

    const query = ((request.query as any).q || "").trim();
    if (!query || query.length < 1) {
      return reply.send({ users: [] });
    }

    try {
      if (socialService) {
        const users = await socialService.searchUsersWithSocialStatus(userPayload.userId, query);
        return reply.send({ users });
      }
      const users = await userService.searchUsers(query, userPayload.userId);
      return reply.send({ users });
    } catch (err) {
      return reply.status(500).send({ error: "Failed to search users" });
    }
  });
}
