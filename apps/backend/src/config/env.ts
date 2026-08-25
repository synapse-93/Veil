export const env = {
  nodeEnv: (process.env.NODE_ENV ?? "development").toLowerCase(),
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL ?? null,
  jwtSecret: process.env.JWT_SECRET ?? process.env.AUTH_SECRET ?? "veil-applet-secure-jwt-secret-key",
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? null,
};

export function assertProductionConfig(): void {
  if (env.nodeEnv === "production") {
    if (!env.databaseUrl) {
      console.info("[AI Studio] DATABASE_URL is not set — falling back to in-memory / local storage.");
    }
  }
}
