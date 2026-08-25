import type { FastifyInstance } from "fastify";

export async function errorHandler(app: FastifyInstance): Promise<void> {
  app.setErrorHandler((error: unknown, request, reply) => {
    // Do not leak internal error details or stack traces in production
    const isProduction = (process.env.NODE_ENV ?? "development").toLowerCase() === "production";
    const code = (reply.statusCode && reply.statusCode >= 400) ? reply.statusCode : 500;
    
    let msg: string;
    if (code >= 500 && isProduction) {
      msg = "Internal Server Error";
    } else {
      msg = error instanceof Error ? error.message : "Internal Server Error";
    }

    const body = { error: msg };
    reply.code(code).send(body);
  });
}
