/*
  Warnings:

  - You are about to drop the `CashClose` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropIndex
DROP INDEX "CashClose_tenantId_date_key";

-- DropIndex
DROP INDEX "CashClose_tenantId_createdAt_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "CashClose";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "ShiftType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShiftType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CashShift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "shiftTypeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ABIERTO',
    "openedByName" TEXT NOT NULL,
    "closedByName" TEXT,
    "openingCashCents" INTEGER NOT NULL,
    "closingCashCents" INTEGER,
    "cashRevenueCents" INTEGER,
    "cashExpenseCents" INTEGER,
    "expectedCashCents" INTEGER,
    "cashDifferenceCents" INTEGER,
    "totalRevenueCents" INTEGER,
    "totalExpenseCents" INTEGER,
    "salesCount" INTEGER,
    "notes" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    CONSTRAINT "CashShift_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CashShift_shiftTypeId_fkey" FOREIGN KEY ("shiftTypeId") REFERENCES "ShiftType" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "customerName" TEXT,
    "customerPhone" TEXT NOT NULL,
    "serviceId" TEXT,
    "barberId" TEXT,
    "customerId" TEXT,
    "day" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "scheduledAt" DATETIME,
    "durationMin" INTEGER NOT NULL DEFAULT 30,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "priceChargedCents" INTEGER,
    "paymentMethod" TEXT,
    "paymentStatus" TEXT NOT NULL DEFAULT 'PAGADO',
    "amountPaidCents" INTEGER NOT NULL DEFAULT 0,
    "reminderSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Booking_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Booking_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Booking_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Booking" ("barberId", "createdAt", "customerId", "customerName", "customerPhone", "day", "durationMin", "id", "paymentMethod", "priceChargedCents", "reminderSentAt", "scheduledAt", "serviceId", "status", "tenantId", "time") SELECT "barberId", "createdAt", "customerId", "customerName", "customerPhone", "day", "durationMin", "id", "paymentMethod", "priceChargedCents", "reminderSentAt", "scheduledAt", "serviceId", "status", "tenantId", "time" FROM "Booking";
DROP TABLE "Booking";
ALTER TABLE "new_Booking" RENAME TO "Booking";
CREATE INDEX "Booking_tenantId_createdAt_idx" ON "Booking"("tenantId", "createdAt");
CREATE INDEX "Booking_tenantId_scheduledAt_idx" ON "Booking"("tenantId", "scheduledAt");
CREATE TABLE "new_Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "productId" TEXT,
    "quantity" INTEGER,
    "paymentMethod" TEXT NOT NULL DEFAULT 'EFECTIVO',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Expense_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Expense_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Expense" ("amountCents", "category", "createdAt", "description", "id", "productId", "quantity", "tenantId") SELECT "amountCents", "category", "createdAt", "description", "id", "productId", "quantity", "tenantId" FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";
CREATE INDEX "Expense_tenantId_createdAt_idx" ON "Expense"("tenantId", "createdAt");
CREATE TABLE "new_ProductSale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "barberId" TEXT,
    "customerId" TEXT,
    "paymentMethod" TEXT NOT NULL DEFAULT 'EFECTIVO',
    "paymentStatus" TEXT NOT NULL DEFAULT 'PAGADO',
    "amountPaidCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductSale_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductSale_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProductSale_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProductSale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ProductSale" ("barberId", "createdAt", "customerId", "id", "paymentMethod", "priceCents", "productId", "productName", "tenantId") SELECT "barberId", "createdAt", "customerId", "id", "paymentMethod", "priceCents", "productId", "productName", "tenantId" FROM "ProductSale";
DROP TABLE "ProductSale";
ALTER TABLE "new_ProductSale" RENAME TO "ProductSale";
CREATE INDEX "ProductSale_tenantId_createdAt_idx" ON "ProductSale"("tenantId", "createdAt");
CREATE TABLE "new_ServiceSale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "serviceId" TEXT,
    "serviceName" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "barberId" TEXT,
    "customerId" TEXT,
    "paymentMethod" TEXT NOT NULL DEFAULT 'EFECTIVO',
    "paymentStatus" TEXT NOT NULL DEFAULT 'PAGADO',
    "amountPaidCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceSale_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ServiceSale_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ServiceSale_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ServiceSale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ServiceSale" ("barberId", "createdAt", "customerId", "id", "paymentMethod", "priceCents", "serviceId", "serviceName", "tenantId") SELECT "barberId", "createdAt", "customerId", "id", "paymentMethod", "priceCents", "serviceId", "serviceName", "tenantId" FROM "ServiceSale";
DROP TABLE "ServiceSale";
ALTER TABLE "new_ServiceSale" RENAME TO "ServiceSale";
CREATE INDEX "ServiceSale_tenantId_createdAt_idx" ON "ServiceSale"("tenantId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ShiftType_tenantId_name_key" ON "ShiftType"("tenantId", "name");

-- CreateIndex
CREATE INDEX "CashShift_tenantId_startedAt_idx" ON "CashShift"("tenantId", "startedAt");

-- CreateIndex
CREATE INDEX "CashShift_tenantId_status_idx" ON "CashShift"("tenantId", "status");
