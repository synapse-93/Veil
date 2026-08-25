import type { FastifyInstance } from "fastify";
import { registerCapsuleControllers } from "../controllers/capsule.controller.js";
import { registerAuthControllers } from "../controllers/auth.controller.js";
import { registerUserControllers } from "../controllers/user.controller.js";
import { registerSocialControllers } from "../controllers/social.controller.js";
import { getPrismaClient } from "../db/prisma.js";
import {
  PrismaCapsuleRepository,
  InMemoryCapsuleRepository,
  type CapsuleRepository,
} from "../repository/capsule.repository.js";
import {
  PrismaUserRepository,
  InMemoryUserRepository,
  type UserRepository,
} from "../repository/user.repository.js";
import {
  PrismaSocialRepository,
  InMemorySocialRepository,
  type SocialRepository,
} from "../repository/social.repository.js";
import { CapsuleService } from "../services/capsule.service.js";
import { UserService } from "../services/user.service.js";
import { SocialService } from "../services/social.service.js";
import { CleanupService } from "../services/cleanup.service.js";
import { authHook } from "../plugins/auth.js";

export async function registerAllRoutes(app: FastifyInstance): Promise<void> {
  // Attach auth hook to populate request.user from Authorization header
  app.addHook("preHandler", authHook);

  const prismaClient = getPrismaClient();

  const capsuleRepo: CapsuleRepository = prismaClient
    ? new PrismaCapsuleRepository(prismaClient)
    : new InMemoryCapsuleRepository();

  const userRepo: UserRepository = prismaClient
    ? new PrismaUserRepository(prismaClient)
    : new InMemoryUserRepository();

  const socialRepo: SocialRepository = prismaClient
    ? new PrismaSocialRepository(prismaClient)
    : new InMemorySocialRepository(async (userId) => {
        const u = await userRepo.findById(userId);
        return u ? { id: u.id, username: u.username } : null;
      });

  const capsuleService = new CapsuleService(capsuleRepo);
  const userService = new UserService(userRepo);
  const socialService = new SocialService(socialRepo, userRepo, capsuleRepo);

  registerCapsuleControllers(app, capsuleService);
  registerAuthControllers(app, userService);
  registerUserControllers(app, userService, socialService);
  registerSocialControllers(app, socialService);

  const cleanup = new CleanupService(capsuleRepo);
  cleanup.start(app);
}
