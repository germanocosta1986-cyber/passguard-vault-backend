import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  } as any); // O 'as any' evita que o TS trave o build por frescura de tipagem

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
