-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "billingCycle" TEXT DEFAULT 'mensal',
ALTER COLUMN "planType" DROP NOT NULL,
ALTER COLUMN "planType" SET DEFAULT 'PRO';
