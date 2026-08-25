import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

type Counters = { timestamps: number[] };

const DEFAULT_WINDOW_MS = 60_000; // 1 minute window
const CREATE_LIMIT = 20; // max POST /capsules per window per IP
const CONSUME_LIMIT = 10; // max POST /capsules/:id/consume per window per IP
const AUTH_LIMIT = 15; // max POST /auth/login, /auth/register per window per IP

function nowMs() {
  return Date.now();
}

export async function rateLimiter(app: FastifyInstance): Promise<void> {
  // In-memory counters keyed by client IP.
  const counters: Map<string, Counters> = new Map();

  // Periodic cleanup to avoid unbounded memory growth for long-running servers.
  const cleanupInterval = setInterval(() => {
    const cutoff = nowMs() - DEFAULT_WINDOW_MS * 5; // keep a few windows
    for (const [ip, c] of counters.entries()) {
      c.timestamps = c.timestamps.filter((t) => t >= cutoff);
      if (c.timestamps.length === 0) counters.delete(ip);
    }
  }, DEFAULT_WINDOW_MS).unref();

  app.addHook("onClose", async () => {
    clearInterval(cleanupInterval);
  });

  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    // Determine client key. Use request.ip as primary source.
    const trustProxy = Boolean((app as any).trustProxy === true);
    const xffHeader = (request.headers["x-forwarded-for"] as string | undefined) || "";
    const xff = xffHeader.split(",")[0]?.trim();
    const ip = (trustProxy && xff) ? xff : (request.ip ?? "unknown");

    const method = (request.method || "").toUpperCase();
    const url = request.raw.url || "";
    let limit = 0;
    let endpointKey = "";

    if (method === "POST" && url === "/capsules") {
      limit = CREATE_LIMIT;
      endpointKey = "create";
    } else if (method === "POST" && /^\/capsules\/[^\/]+\/consume(\?|$)/.test(url)) {
      limit = CONSUME_LIMIT;
      endpointKey = "consume";
    } else if (method === "POST" && (url === "/auth/login" || url === "/auth/register")) {
      limit = AUTH_LIMIT;
      endpointKey = "auth";
    } else {
      return;
    }

    const key = `${ip}:${endpointKey}`;
    const entry = counters.get(key) ?? { timestamps: [] };
    const windowStart = nowMs() - DEFAULT_WINDOW_MS;
    entry.timestamps = entry.timestamps.filter((t) => t >= windowStart);

    if (entry.timestamps.length >= limit) {
      reply.code(429).send({ error: "Too many requests" });
      return reply;
    }

    entry.timestamps.push(nowMs());
    counters.set(key, entry);
  });
}
