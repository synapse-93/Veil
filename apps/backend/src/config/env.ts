export const env = {
  nodeEnv: (process.env.NODE_ENV ?? "development").toLowerCase(),
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL ?? null,
  jwtSecret: process.env.JWT_SECRET ?? process.env.AUTH_SECRET ?? null,
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? null,
};

export function assertProductionConfig(): void {
  if (env.nodeEnv === "production") {
    const missing: string[] = [];
    if (!env.databaseUrl) missing.push("DATABASE_URL");
    if (!env.jwtSecret) missing.push("JWT_SECRET (or AUTH_SECRET)");
    if (!env.frontendOrigin) missing.push("FRONTEND_ORIGIN");
    if (missing.length > 0) {
      // Fail fast in production - do not start with insecure defaults
      throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
    }
  }
}
