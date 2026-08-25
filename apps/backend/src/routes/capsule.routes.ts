import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";
import { registerCapsuleControllers } from "../controllers/capsule.controller.js";
import { getPrismaClient } from "../db/prisma.js";
import {
  PrismaCapsuleRepository,
  InMemoryCapsuleRepository,
  type CapsuleRepository,
} from "../repository/capsule.repository.js";
import { CapsuleService } from "../services/capsule.service.js";
import { CleanupService } from "../services/cleanup.service.js";

export async function capsuleRoutes(app: FastifyInstance): Promise<void> {
  const prismaClient = getPrismaClient();

  if (env.nodeEnv === "production" && !prismaClient) {
    throw new Error(
      "DATABASE_URL is required and PrismaClient must be initialized in production. Refusing fallback to in-memory storage.",
    );
  }

  const repo: CapsuleRepository = prismaClient
    ? new PrismaCapsuleRepository(prismaClient)
    : new InMemoryCapsuleRepository();

  const service = new CapsuleService(repo);
  registerCapsuleControllers(app, service);
  // Start background cleanup service (expire stale capsules).
  // Runs in-process; safe for single-node/demo deployments. The CleanupService
  // attaches to Fastify onClose so it will stop on shutdown.
  const cleanup = new CleanupService(repo);
  cleanup.start(app);
}

