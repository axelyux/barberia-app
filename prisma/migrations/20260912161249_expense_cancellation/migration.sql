-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledByName" TEXT;
