-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "folio" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ProductSale" ADD COLUMN     "folio" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ServiceSale" ADD COLUMN     "folio" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "expenseFolioSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "saleFolioSeq" INTEGER NOT NULL DEFAULT 0;
