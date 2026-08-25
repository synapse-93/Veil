import type { FastifyRequest, FastifyReply } from "fastify";
import { verifySessionToken, type TokenPayload } from "../utils/auth.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: TokenPayload;
  }
}

export async function authHook(request: FastifyRequest, _reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return;
  }

  const token = authHeader.slice(7).trim();
  const payload = verifySessionToken(token);
  if (payload) {
    request.user = payload;
  }
}

export function requireAuth(request: FastifyRequest, reply: FastifyReply): TokenPayload | null {
  if (!request.user) {
    reply.status(401).send({ error: "Authentication required" });
    return null;
  }
  return request.user;
}
