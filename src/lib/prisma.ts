/* import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
export const prisma = new PrismaClient({ adapter });
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

let prisma: PrismaClient;

if (process.env.NODE_ENV === "production") {
  // CONFIGURAÇÃO PARA VERCEL (ROBUSTA)
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1, // Vital para não estourar o limite do Supabase
    connectionTimeoutMillis: 10000,
  }) as any;
  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter });
} else {
  // CONFIGURAÇÃO PARA LOCALHOST (SIMPLES - O QUE FUNCIONOU PARA VOCÊ)
  // Certifique-se de que o DATABASE_URL no seu .env local está correto
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  prisma = new PrismaClient({ adapter });
}

export { prisma };
