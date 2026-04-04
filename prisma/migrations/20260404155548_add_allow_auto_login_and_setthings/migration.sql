-- AlterTable
ALTER TABLE "User" ADD COLUMN     "allowAutoLogin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "settings" JSONB;
