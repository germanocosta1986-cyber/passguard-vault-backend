/*
  Warnings:

  - Made the column `icon` on table `Password` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Password" ADD COLUMN     "strength" TEXT NOT NULL DEFAULT 'medium',
ALTER COLUMN "icon" SET NOT NULL,
ALTER COLUMN "icon" SET DEFAULT 'key';
