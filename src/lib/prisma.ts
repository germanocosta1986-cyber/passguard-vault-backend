import { PrismaClient } from "@prisma/client";

// Forçamos o Prisma a entender que a URL vem do processo de ambiente
const prismaClientOptions = {
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
};

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma || new PrismaClient(prismaClientOptions as any);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
