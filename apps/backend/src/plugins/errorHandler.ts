import type { FastifyInstance } from "fastify";

export async function errorHandler(app: FastifyInstance): Promise<void> {
  app.setErrorHandler((error: unknown, request, reply) => {
    // Do not leak internal error details in production
    const code = (reply.statusCode && reply.statusCode >= 400) ? reply.statusCode : 500;
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    const body = { error: msg };
    reply.code(code).send(body);
  });
}
