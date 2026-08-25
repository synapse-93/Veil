import { PrismaClient } from "@prisma/client";

let prismaInstance: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient | null {
  if (!process.env.DATABASE_URL) {
    return null;
  }
  if (!prismaInstance) {
    try {
      prismaInstance = new PrismaClient();
    } catch (err) {
    console.warn(
      "[AI Studio] PrismaClient initialization failed:",
      err instanceof Error ? err.message : String(err),
    );
    prismaInstance = null;
    }
  }
  return prismaInstance;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_, prop) {
    const client = getPrismaClient();
    if (!client) {
      const noOp = {
        findMany: async () => [],
        findFirst: async () => null,
        findUnique: async () => null,
        create: async (d: any) => d?.data ?? {},
        update: async (d: any) => d?.data ?? {},
        delete: async () => ({}),
      };
      return (noOp as any)[prop] ?? (async () => []);
    }
    return (client as any)[prop];
  },
});

