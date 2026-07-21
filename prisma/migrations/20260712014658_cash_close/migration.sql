-- CreateTable
CREATE TABLE "CashClose" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "revenueCents" INTEGER NOT NULL,
    "expenseCents" INTEGER NOT NULL,
    "profitCents" INTEGER NOT NULL,
    "salesCount" INTEGER NOT NULL,
    "closedByName" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CashClose_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CashClose_tenantId_createdAt_idx" ON "CashClose"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CashClose_tenantId_date_key" ON "CashClose"("tenantId", "date");
