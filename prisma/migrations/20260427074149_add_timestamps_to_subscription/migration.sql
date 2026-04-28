-- Adiciona as colunas permitindo nulo primeiro
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Garante que as 3 linhas atuais tenham data (caso o default não pegue na hora)
UPDATE "Subscription" SET "createdAt" = NOW() WHERE "createdAt" IS NULL;
UPDATE "Subscription" SET "updatedAt" = NOW() WHERE "updatedAt" IS NULL;

-- Agora define como NOT NULL (o que o Prisma quer)
ALTER TABLE "Subscription" ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE "Subscription" ALTER COLUMN "updatedAt" SET NOT NULL;