import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import fs from "node:fs";
import path from "node:path";
import { env, assertProductionConfig } from "./config/env.js";
import { registerAllRoutes } from "./routes/app.routes.js";
import { errorHandler } from "./plugins/errorHandler.js";
import { rateLimiter } from "./plugins/rateLimiter.js";

const app = Fastify({ logger: false });

// Validate required production configuration early
try {
  assertProductionConfig();
} catch (err) {
  // Use console.error to make the reason visible in logs, but avoid leaking secrets
  console.error("Server startup aborted:", err instanceof Error ? err.message : String(err));
  process.exit(1);
}

// Configure CORS carefully: in production, only allow configured frontend origin
const corsOptions: any = {
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};
if (env.nodeEnv === "production" && env.frontendOrigin) {
  corsOptions.origin = env.frontendOrigin;
} else {
  corsOptions.origin = true;
}

await app.register(cors, corsOptions);

await rateLimiter(app);
await errorHandler(app);

// Health endpoint for deployment readiness checks
app.get("/health", async () => {
  return { status: "ok" };
});

await registerAllRoutes(app);

// Serve frontend static files
const distDir = path.resolve(process.cwd(), "apps/frontend/dist");
if (fs.existsSync(distDir)) {
  await app.register(fastifyStatic, {
    root: distDir,
    prefix: "/",
  });

  app.setNotFoundHandler((req, reply) => {
    const url = req.raw.url || "";
    if (
      url.startsWith("/capsules") ||
      url.startsWith("/auth") ||
      url.startsWith("/users") ||
      url.startsWith("/friends") ||
      url.startsWith("/conversations")
    ) {
      reply.status(404).send({ error: "Not found" });
    } else {
      reply.sendFile("index.html");
    }
  });
}

const port = env.port || 3000;
await app.listen({ host: "0.0.0.0", port });
