export const env = {
  nodeEnv: (process.env.NODE_ENV ?? "development").toLowerCase(),
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL ?? null,
  jwtSecret:
    process.env.JWT_SECRET ??
    process.env.AUTH_SECRET ??
    ((process.env.NODE_ENV ?? "development").toLowerCase() === "production"
      ? null
      : "dev-veil-jwt-secret-key"),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? null,
};

export function assertProductionConfig(): void {
  if (env.nodeEnv === "production") {
    if (!env.databaseUrl) {
      throw new Error("DATABASE_URL environment variable is required in production");
    }
    if (!env.jwtSecret) {
      throw new Error("JWT_SECRET (or AUTH_SECRET) environment variable is required in production");
    }
  }
}


